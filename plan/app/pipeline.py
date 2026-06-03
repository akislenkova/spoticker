"""Orchestrates the 5-stage Plan Mode pipeline."""
from __future__ import annotations

from app.schemas import (
    ExtractedSpec, Objective, PlanResult, SourceFile,
)
from app.stages.parse import parse_artifact
from app.stages.infer import infer_missing
from app.stages.rank import rank
from app.stages.rewrite import rewrite as rewrite_stage
from app.stages.validate import validate


def run_pipeline(
    files: list[SourceFile],
    objective: Objective,
    user_intent: str | None = None,
) -> PlanResult:
    """
    Run all 5 stages and return a PlanResult.
    Each stage failure degrades gracefully — partial results are still returned.
    """
    # Stage 1: Parse
    spec = parse_artifact(files)
    spec.user_intent = user_intent

    # Stage 2: Infer (only if needed)
    if spec.missing_fields or user_intent:
        spec = infer_missing(spec)

    # Stage 3: Rank
    candidates = rank(spec, objective)

    if not candidates:
        return PlanResult(
            spec=spec,
            candidates=[],
            error="No matching spot instances found for the specified requirements.",
        )

    chosen = candidates[0]

    # Stage 4: Rewrite
    rewrite_result = rewrite_stage(spec, chosen)

    # Stage 5: Validate
    validation_passed, validator_output = validate(spec, rewrite_result)
    rewrite_result.validation_failed = not validation_passed
    rewrite_result.validator_output = validator_output

    # If validation failed, retry rewrite once with error context
    if not validation_passed:
        from app.stages.rewrite import rewrite as _rewrite
        import anthropic, os, json, re

        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        original = "\n\n---\n\n".join(f"# {f.path}\n{f.content}" for f in spec.source_files)
        retry_content = (
            f"## Original artifact\n{original}\n\n"
            f"## Chosen placement\n{chosen.model_dump_json(indent=2)}\n\n"
            f"## Previous diff (FAILED validation)\n{rewrite_result.unified_diff}\n\n"
            f"## Validator errors\n{validator_output}\n\n"
            f"Please fix the issues and return a corrected JSON response."
        )
        from app.stages.rewrite import _SYSTEM
        try:
            msg = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=_SYSTEM,
                messages=[{"role": "user", "content": retry_content}],
            )
            raw = msg.content[0].text if msg.content else ""
            raw = re.sub(r"^```[a-z]*\n?", "", raw.strip())
            raw = re.sub(r"\n?```$", "", raw.strip())
            start = raw.find("{")
            end = raw.rfind("}")
            if start != -1 and end != -1:
                result = json.loads(raw[start : end + 1])
                from app.schemas import DiffChange, RewriteResult
                rewrite_result = RewriteResult(
                    unified_diff=str(result.get("unified_diff") or ""),
                    additions=[
                        DiffChange(field=a.get("field",""), value=a.get("value"), reason=a.get("reason",""))
                        for a in (result.get("additions") or []) if isinstance(a, dict)
                    ],
                    warnings=[str(w) for w in (result.get("warnings") or [])],
                    migration_commands=[str(c) for c in (result.get("migration_commands") or [])],
                )
                validation_passed, validator_output = validate(spec, rewrite_result)
                rewrite_result.validation_failed = not validation_passed
                rewrite_result.validator_output = validator_output
        except Exception:
            pass  # Keep original rewrite with validation_failed=True

    return PlanResult(
        spec=spec,
        candidates=candidates,
        chosen=chosen,
        rewrite=rewrite_result,
        validation_passed=validation_passed,
    )
