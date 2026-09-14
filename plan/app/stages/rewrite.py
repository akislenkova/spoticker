"""Stage 4: LLM rewrites the manifest to target a chosen placement."""
from __future__ import annotations
import json
import logging
import os

import anthropic

from app.llm_json import extract_json_object
from app.schemas import ExtractedSpec, PlacementCandidate, RewriteResult, DiffChange

logger = logging.getLogger(__name__)

_MIGRATION_COMMANDS_WARNING = (
    "migration_commands are LLM-generated suggestions derived from the uploaded "
    "artifact — review them before running; do not execute automatically."
)

_SYSTEM = """\
You modify Kubernetes/Docker/Terraform files to target a specific cloud spot placement.
You preserve every part of the original you don't need to change.

Output strict JSON (no markdown wrapper) with this exact structure:
{
  "unified_diff": "<unified diff text, or empty string if no changes needed>",
  "additions": [{"field": "<field path>", "value": "<value>", "reason": "<why>"}],
  "warnings": ["<string>"],
  "migration_commands": ["<shell command>"]
}

Constraints:
- Do not invent fields. If a change requires a new field, add it explicitly and list it in additions.
- Do not change image tags unless the image is incompatible with the target GPU architecture.
  If you do change one, flag it in warnings.
- For spot targets, always add:
    * A spot toleration (key: kubernetes.azure.com/scalesetpriority or node.kubernetes.io/spot)
    * A PodDisruptionBudget if replicas > 1
    * A node affinity rule scoped to the target instance family / SKU
- Never remove user comments.
- Never modify resource requests downward.
- If the source is a Dockerfile, annotate with ARG/ENV only — do not add k8s-specific sections.
- migration_commands should include apply/deploy steps appropriate to the source type.
- If the chosen placement's GPU count exceeds the workload's requested GPU count (check
  "Chosen placement" gpu_count against "resources.gpu_count" below), add a warning stating
  how many GPUs will be idle and that the instance is billed in full regardless of how many
  GPUs the workload actually uses.
"""


def result_to_rewrite_result(result: dict) -> RewriteResult:
    """Convert a parsed LLM JSON response into a RewriteResult. Shared by the
    initial rewrite call and pipeline.py's validation-retry call, so the two
    call sites can't silently diverge on how additions/warnings/
    migration_commands are assembled."""
    additions = [
        DiffChange(
            field=str(a.get("field", "")),
            value=a.get("value"),
            reason=str(a.get("reason", "")),
        )
        for a in (result.get("additions") or [])
        if isinstance(a, dict)
    ]

    migration_commands = [str(c) for c in (result.get("migration_commands") or [])]
    warnings = [str(w) for w in (result.get("warnings") or [])]
    if migration_commands:
        warnings.append(_MIGRATION_COMMANDS_WARNING)

    return RewriteResult(
        unified_diff=str(result.get("unified_diff") or ""),
        additions=additions,
        warnings=warnings,
        migration_commands=migration_commands,
    )


def rewrite(
    spec: ExtractedSpec,
    candidate: PlacementCandidate,
) -> RewriteResult:
    """Stage 4: produce a diff targeting the chosen placement candidate."""
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    original = "\n\n---\n\n".join(
        f"# {f.path}\n{f.content}" for f in spec.source_files
    )

    user_content = (
        f"## Original artifact\n{original}\n\n"
        f"## Chosen placement\n{candidate.model_dump_json(indent=2)}\n\n"
        f"## Inferred spec (for context)\n"
        f"source_type: {spec.source_type}\n"
        f"workload.kind: {spec.workload.kind}\n"
        f"resources.gpu_count: {spec.resources.gpu_count}\n"
        f"resources.gpu_type: {spec.resources.gpu_type}\n"
        f"replicas: {spec.resources.replicas}\n"
        f"use_spot: {spec.scheduling.use_spot}\n"
    )

    def _call() -> dict:
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=_SYSTEM,
            messages=[{"role": "user", "content": user_content}],
        )
        raw = msg.content[0].text if msg.content else ""
        return extract_json_object(raw)

    try:
        result = _call()
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("rewrite: first LLM call failed to parse (%s), retrying once", exc)
        try:
            result = _call()
        except Exception as exc2:
            logger.warning("rewrite: retry also failed (%s)", exc2)
            return RewriteResult(
                unified_diff="",
                warnings=[f"Rewrite failed: {exc2}"],
                validation_failed=True,
            )

    return result_to_rewrite_result(result)
