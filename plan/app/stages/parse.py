"""Stage 1: Deterministic extraction from raw artifact files."""
from __future__ import annotations
import re
from pathlib import Path

from app.schemas import (
    ExtractedSpec, SourceFile, SourceType, WorkloadKind,
    WorkloadSpec, ResourceSpec, SchedulingSpec, FieldConfidence,
)

# ── GPU type aliases normalisation ───────────────────────────────────────────

_GPU_ALIASES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"nvidia-h100", re.I), "H100"),
    (re.compile(r"\bh100\b", re.I), "H100"),
    (re.compile(r"nvidia-a100.*80", re.I), "A100-80GB"),
    (re.compile(r"\ba100.*80", re.I), "A100-80GB"),
    (re.compile(r"nvidia-a100", re.I), "A100-40GB"),
    (re.compile(r"\ba100\b", re.I), "A100-40GB"),
    (re.compile(r"nvidia-v100", re.I), "V100"),
    (re.compile(r"\bv100\b", re.I), "V100"),
    (re.compile(r"nvidia-l4\b", re.I), "L4"),
    (re.compile(r"\bl4\b", re.I), "L4"),
    (re.compile(r"nvidia-a10g", re.I), "A10G"),
    (re.compile(r"\ba10g\b", re.I), "A10G"),
    (re.compile(r"\ba10\b", re.I), "A10G"),
    (re.compile(r"nvidia-t4", re.I), "T4"),
    (re.compile(r"\bt4\b", re.I), "T4"),
]

_TRAINING_SIGNALS = re.compile(
    r"\b(train|fine.?tun|finetun|finetuning|torchrun|deepspeed|accelerate\s+launch|"
    r"transformers\s+train|pytorch\s+lightning|pl_trainer|run_clm|run_glm)\b",
    re.I,
)
_INFERENCE_SIGNALS = re.compile(
    r"\b(vllm|triton|torchserve|ray\s+serve|bentoml|seldon|kfserving|"
    r"inference|serve|serving|gunicorn|uvicorn)\b",
    re.I,
)
_BATCH_SIGNALS = re.compile(
    r"\b(batch|job|cron|pipeline|etl|data.?proc|spark|dask)\b", re.I
)


def _normalise_gpu(raw: str) -> str | None:
    for pat, label in _GPU_ALIASES:
        if pat.search(raw):
            return label
    return None


def _infer_kind_from_text(text: str) -> WorkloadKind:
    if _TRAINING_SIGNALS.search(text):
        return WorkloadKind.training
    if _INFERENCE_SIGNALS.search(text):
        return WorkloadKind.inference
    if _BATCH_SIGNALS.search(text):
        return WorkloadKind.batch
    return WorkloadKind.unknown


# ── Dockerfile ────────────────────────────────────────────────────────────────

def _parse_dockerfile(content: str) -> tuple[WorkloadSpec, ResourceSpec, dict, list]:
    """Return (workload, resources, confidence, missing)."""
    try:
        from dockerfile_parse import DockerfileParser  # type: ignore
        import io
        dfp = DockerfileParser(fileobj=io.BytesIO(content.encode()))
        image = dfp.baseimage
        env = dict(dfp.envs)
        cmd = dfp.cmd or dfp.entrypoint or []
        if isinstance(cmd, str):
            cmd = cmd.split()
    except Exception:
        image = None
        env = {}
        cmd = []
        for line in content.splitlines():
            line = line.strip()
            if line.upper().startswith("FROM "):
                image = line.split()[1] if len(line.split()) > 1 else None
            elif line.upper().startswith("ENV "):
                parts = line[4:].strip().split("=", 1)
                if len(parts) == 2:
                    env[parts[0].strip()] = parts[1].strip()
            elif line.upper().startswith("CMD ") or line.upper().startswith("ENTRYPOINT "):
                rest = re.sub(r'^(CMD|ENTRYPOINT)\s+', '', line, flags=re.I).strip()
                rest = re.sub(r'^[\[\]]|[\[\]]$', '', rest)
                cmd = [p.strip(' "') for p in rest.split(",") if p.strip(' "')]

    full_text = content + " " + " ".join(cmd) + " " + " ".join(env.values())
    kind = _infer_kind_from_text(full_text)

    # GPU type from ENV variables
    gpu_type = None
    confidence: dict[str, FieldConfidence] = {}
    for key, val in env.items():
        if "gpu" in key.lower() or "cuda" in key.lower() or "device" in key.lower():
            normalised = _normalise_gpu(val)
            if normalised:
                gpu_type = normalised
                confidence["resources.gpu_type"] = FieldConfidence.explicit
                break

    # GPU count from env like WORLD_SIZE, NPROC_PER_NODE, num_gpus
    gpu_count = None
    for key, val in env.items():
        if re.search(r"(world_size|nproc_per_node|num_gpus|tensor.parallel.size)", key, re.I):
            try:
                gpu_count = int(val)
                confidence["resources.gpu_count"] = FieldConfidence.explicit
            except ValueError:
                pass
        if gpu_count:
            break
    # Check command args too
    cmd_str = " ".join(cmd)
    m = re.search(r"--tensor.parallel.size[= ](\d+)", cmd_str, re.I)
    if m and gpu_count is None:
        gpu_count = int(m.group(1))
        confidence["resources.gpu_count"] = FieldConfidence.explicit
    m = re.search(r"--nproc.per.node[= ](\d+)", cmd_str, re.I)
    if m and gpu_count is None:
        gpu_count = int(m.group(1))
        confidence["resources.gpu_count"] = FieldConfidence.explicit

    if kind != WorkloadKind.unknown:
        confidence["workload.kind"] = FieldConfidence.explicit

    missing = []
    if kind == WorkloadKind.unknown:
        missing.append("workload.kind")
    if gpu_type is None:
        missing.append("resources.gpu_type")
    if gpu_count is None:
        missing.append("resources.gpu_count")

    workload = WorkloadSpec(kind=kind, image=image, command=cmd, env=env)
    resources = ResourceSpec(gpu_count=gpu_count, gpu_type=gpu_type)
    return workload, resources, confidence, missing


# ── Kubernetes YAML ───────────────────────────────────────────────────────────

def _parse_k8s_yaml(content: str) -> tuple[WorkloadSpec, ResourceSpec, SchedulingSpec, dict, list]:
    try:
        from ruamel.yaml import YAML
        yaml = YAML()
        yaml.preserve_quotes = True
        import io
        doc = yaml.load(io.StringIO(content))
    except Exception:
        return WorkloadSpec(), ResourceSpec(), SchedulingSpec(), {}, ["workload.kind", "resources.gpu_type", "resources.gpu_count"]

    if not isinstance(doc, dict):
        return WorkloadSpec(), ResourceSpec(), SchedulingSpec(), {}, ["workload.kind", "resources.gpu_type", "resources.gpu_count"]

    spec = doc.get("spec", {}) or {}

    # Navigate to container spec
    template_spec = spec
    if "template" in spec:
        template_spec = (spec["template"].get("spec") or {})
    elif "jobTemplate" in spec:
        template_spec = ((spec["jobTemplate"].get("spec") or {}).get("template", {}).get("spec") or {})

    containers = template_spec.get("containers", []) or []
    init_containers = template_spec.get("initContainers", []) or []
    all_containers = containers + init_containers
    primary = all_containers[0] if all_containers else {}

    image = primary.get("image")
    cmd = primary.get("command", []) or []
    if isinstance(cmd, str):
        cmd = cmd.split()
    args = primary.get("args", []) or []
    if isinstance(args, str):
        args = args.split()
    cmd = list(cmd) + list(args)

    env_raw = primary.get("env", []) or []
    env: dict[str, str] = {}
    for e in env_raw:
        if isinstance(e, dict) and e.get("name") and e.get("value") is not None:
            env[str(e["name"])] = str(e["value"])

    full_text = content + " " + " ".join(str(x) for x in cmd) + " " + " ".join(env.values())
    kind = _infer_kind_from_text(full_text)

    # Resources
    res_block = (primary.get("resources") or {})
    limits = res_block.get("limits") or {}
    requests = res_block.get("requests") or {}

    gpu_count = None
    gpu_type = None
    confidence: dict[str, FieldConfidence] = {}

    for block in (limits, requests):
        for key, val in block.items():
            if "gpu" in key.lower() or "nvidia" in key.lower() or "amd" in key.lower():
                try:
                    gpu_count = int(str(val))
                    confidence["resources.gpu_count"] = FieldConfidence.explicit
                except ValueError:
                    pass
                # Some manifests use nvidia.com/gpu.type annotation
        if gpu_count is not None:
            break

    cpu_req = str(requests.get("cpu") or limits.get("cpu") or "")
    mem_req = str(requests.get("memory") or limits.get("memory") or "")

    # Node selector hints for GPU type
    node_sel = template_spec.get("nodeSelector") or {}
    for key, val in node_sel.items():
        if "accelerator" in key.lower() or "gpu" in key.lower() or "instance" in key.lower():
            normalised = _normalise_gpu(str(val))
            if normalised:
                gpu_type = normalised
                confidence["resources.gpu_type"] = FieldConfidence.explicit
                break

    # Annotations for GPU type
    meta = doc.get("metadata") or {}
    annotations = meta.get("annotations") or {}
    tmpl_meta = (spec.get("template") or {}).get("metadata") or {}
    tmpl_annotations = tmpl_meta.get("annotations") or {}
    for anns in (annotations, tmpl_annotations):
        for key, val in anns.items():
            if "gpu" in key.lower() or "accelerator" in key.lower():
                normalised = _normalise_gpu(str(val))
                if normalised:
                    gpu_type = normalised
                    confidence["resources.gpu_type"] = FieldConfidence.explicit
                    break

    # Tolerations + spot detection
    tolerations = template_spec.get("tolerations") or []
    use_spot = None
    for tol in tolerations:
        if isinstance(tol, dict):
            key = str(tol.get("key") or "").lower()
            val = str(tol.get("value") or "").lower()
            if "spot" in key or "spot" in val or "preempt" in key:
                use_spot = True
                break

    replicas = int(spec.get("replicas") or 1)

    if kind != WorkloadKind.unknown:
        confidence["workload.kind"] = FieldConfidence.explicit
    if cpu_req:
        confidence["resources.cpu_request"] = FieldConfidence.explicit
    if mem_req:
        confidence["resources.memory_request"] = FieldConfidence.explicit

    missing = []
    if kind == WorkloadKind.unknown:
        missing.append("workload.kind")
    if gpu_type is None:
        missing.append("resources.gpu_type")
    if gpu_count is None:
        missing.append("resources.gpu_count")

    workload = WorkloadSpec(kind=kind, image=image, command=cmd, env=env)
    resources = ResourceSpec(
        gpu_count=gpu_count, gpu_type=gpu_type,
        cpu_request=cpu_req or None, memory_request=mem_req or None,
        replicas=replicas,
    )
    scheduling = SchedulingSpec(
        node_selectors=dict(node_sel),
        tolerations=[dict(t) for t in tolerations if isinstance(t, dict)],
        use_spot=use_spot,
    )
    return workload, resources, scheduling, confidence, missing


# ── Terraform ─────────────────────────────────────────────────────────────────

def _parse_terraform(content: str) -> tuple[WorkloadSpec, ResourceSpec, dict, list]:
    try:
        import hcl2  # type: ignore
        import io
        doc = hcl2.load(io.StringIO(content))
    except Exception:
        return WorkloadSpec(), ResourceSpec(), {}, ["workload.kind", "resources.gpu_type", "resources.gpu_count"]

    confidence: dict[str, FieldConfidence] = {}
    gpu_type = None
    gpu_count = None
    image = None
    env: dict[str, str] = {}

    for res_type, resources in (doc.get("resource") or {}).items():
        for name, block_list in resources.items():
            blocks = block_list if isinstance(block_list, list) else [block_list]
            for block in blocks:
                if not isinstance(block, dict):
                    continue

                # Machine type / instance type → GPU hint
                for field in ("instance_type", "machine_type", "vm_size", "size"):
                    val = block.get(field) or ""
                    normalised = _normalise_gpu(str(val))
                    if normalised:
                        gpu_type = normalised
                        confidence["resources.gpu_type"] = FieldConfidence.explicit
                    # GPU instance families
                    if re.search(r"\b(p[3-5]|g4dn|g5|nd|nc)\b", str(val), re.I):
                        if gpu_type is None:
                            gpu_type = _guess_gpu_from_instance(str(val))
                            if gpu_type:
                                confidence["resources.gpu_type"] = FieldConfidence.inferred

                # Container image
                for field in ("image", "container_image", "image_uri"):
                    if block.get(field):
                        image = str(block[field])

                # Environment variables
                for env_block in (block.get("env") or block.get("environment") or []):
                    if isinstance(env_block, dict):
                        for k, v in env_block.items():
                            if isinstance(v, str):
                                env[k] = v

    full_text = content + " " + " ".join(env.values())
    kind = _infer_kind_from_text(full_text)
    if kind != WorkloadKind.unknown:
        confidence["workload.kind"] = FieldConfidence.explicit

    missing = []
    if kind == WorkloadKind.unknown:
        missing.append("workload.kind")
    if gpu_type is None:
        missing.append("resources.gpu_type")
    if gpu_count is None:
        missing.append("resources.gpu_count")

    workload = WorkloadSpec(kind=kind, image=image, env=env)
    resources = ResourceSpec(gpu_count=gpu_count, gpu_type=gpu_type)
    return workload, resources, confidence, missing


def _guess_gpu_from_instance(instance: str) -> str | None:
    """Heuristic: map AWS/Azure instance family to GPU type."""
    s = instance.lower()
    if "p5" in s:
        return "H100"
    if "p4d" in s or "p4de" in s:
        return "A100-40GB"
    if "p3dn" in s or "p3" in s:
        return "V100"
    if "g5" in s:
        return "A10G"
    if "g4dn" in s:
        return "T4"
    if "nd96isr" in s:
        return "H100"
    if "nd96amsr" in s or "nd40rs" in s:
        return "A100-80GB"
    if "nc" in s and "a100" in s:
        return "A100-40GB"
    return None


# ── Entry point ───────────────────────────────────────────────────────────────

def parse_artifact(files: list[SourceFile]) -> ExtractedSpec:
    """Stage 1: extract a structured spec from uploaded files."""
    spec = ExtractedSpec(source_files=files)

    # Detect source type from filenames + content
    dockerfile_files = [f for f in files if Path(f.path).name.lower().startswith("dockerfile")]
    yaml_files = [f for f in files if f.path.endswith((".yaml", ".yml"))]
    tf_files = [f for f in files if f.path.endswith(".tf")]
    helm_files = [f for f in files if Path(f.path).name.lower() == "values.yaml"]

    confidence: dict[str, FieldConfidence] = {}
    missing: list[str] = []

    if tf_files:
        spec.source_type = SourceType.terraform
        combined = "\n\n".join(f.content for f in tf_files)
        workload, resources, conf, miss = _parse_terraform(combined)
        spec.workload = workload
        spec.resources = resources
        confidence.update(conf)
        missing.extend(miss)

    elif helm_files:
        spec.source_type = SourceType.helm
        # Treat values.yaml like a k8s manifest (simplified)
        content = helm_files[0].content
        workload, resources, scheduling, conf, miss = _parse_k8s_yaml(content)
        spec.workload = workload
        spec.resources = resources
        spec.scheduling = scheduling
        confidence.update(conf)
        missing.extend(miss)

    elif yaml_files:
        spec.source_type = SourceType.k8s_manifest
        # Parse all YAML docs, merge results
        combined_workload = WorkloadSpec()
        combined_resources = ResourceSpec()
        combined_scheduling = SchedulingSpec()

        for yf in yaml_files:
            for doc_str in _split_yaml_docs(yf.content):
                try:
                    w, r, s, conf, miss = _parse_k8s_yaml(doc_str)
                    if w.image and not combined_workload.image:
                        combined_workload.image = w.image
                    if w.kind != WorkloadKind.unknown:
                        combined_workload.kind = w.kind
                    if w.command:
                        combined_workload.command = w.command
                    combined_workload.env.update(w.env)
                    if r.gpu_count and not combined_resources.gpu_count:
                        combined_resources.gpu_count = r.gpu_count
                    if r.gpu_type and not combined_resources.gpu_type:
                        combined_resources.gpu_type = r.gpu_type
                    if r.cpu_request:
                        combined_resources.cpu_request = r.cpu_request
                    if r.memory_request:
                        combined_resources.memory_request = r.memory_request
                    if r.replicas > 1:
                        combined_resources.replicas = r.replicas
                    if s.use_spot is not None and combined_scheduling.use_spot is None:
                        combined_scheduling.use_spot = s.use_spot
                    combined_scheduling.tolerations.extend(s.tolerations)
                    combined_scheduling.node_selectors.update(s.node_selectors)
                    confidence.update(conf)
                    # dedupe missing
                    for m in miss:
                        if m not in missing:
                            missing.append(m)
                except Exception:
                    pass

        spec.workload = combined_workload
        spec.resources = combined_resources
        spec.scheduling = combined_scheduling

    elif dockerfile_files:
        spec.source_type = SourceType.dockerfile
        content = dockerfile_files[0].content
        workload, resources, conf, miss = _parse_dockerfile(content)
        spec.workload = workload
        spec.resources = resources
        confidence.update(conf)
        missing.extend(miss)

    else:
        # Fallback: try to parse anything as YAML
        for f in files:
            try:
                workload, resources, scheduling, conf, miss = _parse_k8s_yaml(f.content)
                if workload.image or workload.command:
                    spec.source_type = SourceType.k8s_manifest
                    spec.workload = workload
                    spec.resources = resources
                    spec.scheduling = scheduling
                    confidence.update(conf)
                    missing.extend(miss)
                    break
            except Exception:
                pass

    # Remove duplicate missing entries and keep order
    seen: set[str] = set()
    deduped = []
    for m in missing:
        if m not in seen:
            seen.add(m)
            deduped.append(m)

    spec.extraction_confidence = confidence
    spec.missing_fields = deduped
    return spec


def _split_yaml_docs(content: str) -> list[str]:
    """Split a YAML file on --- document separators."""
    docs = re.split(r"^---\s*$", content, flags=re.MULTILINE)
    return [d.strip() for d in docs if d.strip()]

