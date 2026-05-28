"""Stage 2: LLM fills in missing fields from ExtractedSpec."""
from __future__ import annotations
import json
import os
import re

import anthropic

from app.schemas import ExtractedSpec, WorkloadKind, FieldConfidence

_SCHEMA_HINT = """
{
  "workload": {
    "kind": "training" | "inference" | "batch" | "unknown"
  },
  "resources": {
    "gpu_count": <int or null>,
    "gpu_type": "T4" | "A10G" | "L4" | "V100" | "A100-40GB" | "A100-80GB" | "H100" | null,
    "memory_request": "<string like '128Gi' or null>"
  },
  "scheduling": {
    "use_spot": <true | false | null>
  },
  "duration_hours": <float or null>,
  "inference_notes": {
    "<field_path>": "<one-sentence justification>"
  },
  "still_unknown": ["<field_path>", ...]
}
"""

_SYSTEM = """\
You are a Kubernetes/Docker workload analyzer. Given a container spec and optional user
intent, infer missing hardware and workload requirements.

Output strict JSON (no markdown wrapper). For each field you fill in, add a one-sentence
justification to inference_notes keyed by the field path (e.g. "resources.gpu_type").

Hard rules:
- If you cannot infer a field with reasonable confidence, leave it null and add to still_unknown.
- GPU memory floor must be conservative — round up, not down.
- For LLM inference workloads, account for KV cache (~20% of model size on top of weights).
- Llama-7B fp16 ≈ 14GB VRAM, Llama-13B fp16 ≈ 26GB, Llama-30B fp16 ≈ 60GB, Llama-70B fp16 ≈ 140GB.
- Never invent fields not in the schema below.

Return exactly this JSON structure:
""" + _SCHEMA_HINT


def infer_missing(spec: ExtractedSpec) -> ExtractedSpec:
    """
    Call Claude to fill in missing_fields. Returns a mutated copy.
    Skip entirely if missing_fields is empty and no user_intent.
    """
    if not spec.missing_fields and not spec.user_intent:
        return spec

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    artifact_text = "\n\n---\n\n".join(
        f"# {f.path}\n{f.content[:4000]}" for f in spec.source_files
    )

    user_content = (
        f"## Raw artifact\n{artifact_text}\n\n"
        f"## Extracted spec so far\n{spec.model_dump_json(indent=2)}\n\n"
        f"## Fields still missing\n{json.dumps(spec.missing_fields)}\n"
    )
    if spec.user_intent:
        user_content += f"\n## User intent\n{spec.user_intent}\n"

    def _call() -> dict:
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=_SYSTEM,
            messages=[{"role": "user", "content": user_content}],
        )
        raw = msg.content[0].text if msg.content else ""
        # Strip markdown code fences if present
        raw = re.sub(r"^```[a-z]*\n?", "", raw.strip())
        raw = re.sub(r"\n?```$", "", raw.strip())
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("LLM returned no JSON object")
        return json.loads(raw[start : end + 1])

    try:
        result = _call()
    except (json.JSONDecodeError, ValueError) as exc:
        try:
            # Retry once
            result = _call()
        except Exception:
            spec.still_unknown = spec.missing_fields[:]
            return spec

    # Merge inferred values
    inferred = result.get("workload", {})
    if inferred.get("kind") and spec.workload.kind == WorkloadKind.unknown:
        try:
            spec.workload.kind = WorkloadKind(inferred["kind"])
            spec.extraction_confidence["workload.kind"] = FieldConfidence.inferred
        except ValueError:
            pass

    inferred_res = result.get("resources", {})
    if inferred_res.get("gpu_count") is not None and spec.resources.gpu_count is None:
        spec.resources.gpu_count = int(inferred_res["gpu_count"])
        spec.extraction_confidence["resources.gpu_count"] = FieldConfidence.inferred

    if inferred_res.get("gpu_type") and spec.resources.gpu_type is None:
        spec.resources.gpu_type = str(inferred_res["gpu_type"])
        spec.extraction_confidence["resources.gpu_type"] = FieldConfidence.inferred

    if inferred_res.get("memory_request") and spec.resources.memory_request is None:
        spec.resources.memory_request = str(inferred_res["memory_request"])
        spec.extraction_confidence["resources.memory_request"] = FieldConfidence.inferred

    inferred_sched = result.get("scheduling", {})
    if inferred_sched.get("use_spot") is not None and spec.scheduling.use_spot is None:
        spec.scheduling.use_spot = bool(inferred_sched["use_spot"])
        spec.extraction_confidence["scheduling.use_spot"] = FieldConfidence.inferred

    if result.get("duration_hours") and spec.duration_hours is None:
        spec.duration_hours = float(result["duration_hours"])

    spec.inference_notes.update(result.get("inference_notes") or {})
    spec.still_unknown = result.get("still_unknown") or []

    # Recompute missing_fields from what's still unknown
    spec.missing_fields = spec.still_unknown

    return spec
