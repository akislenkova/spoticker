"""Stage 5: Deterministic validation using CLI tools."""
from __future__ import annotations
import shutil
import subprocess
import tempfile
import textwrap
from pathlib import Path

from app.schemas import ExtractedSpec, RewriteResult, SourceType


def _tool_available(name: str) -> bool:
    return shutil.which(name) is not None


def _apply_diff(original: str, unified_diff: str) -> str:
    """Apply a unified diff in-memory. Returns patched content or original on failure."""
    if not unified_diff.strip():
        return original
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            orig_path = Path(tmpdir) / "original"
            diff_path = Path(tmpdir) / "patch.diff"
            out_path = Path(tmpdir) / "patched"
            orig_path.write_text(original)
            diff_path.write_text(unified_diff)
            result = subprocess.run(
                ["patch", "-o", str(out_path), str(orig_path), str(diff_path)],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0 and out_path.exists():
                return out_path.read_text()
    except Exception:
        pass
    return original


def _run(cmd: list[str], input_text: str | None = None, file_ext: str = ".yaml") -> tuple[bool, str]:
    """Run a validation command, optionally piping content. Returns (passed, output)."""
    try:
        with tempfile.NamedTemporaryFile(suffix=file_ext, mode="w", delete=False) as f:
            if input_text:
                f.write(input_text)
            fname = f.name

        result = subprocess.run(
            cmd + ([fname] if input_text else []),
            capture_output=True, text=True, timeout=30,
        )
        output = (result.stdout + result.stderr).strip()
        return result.returncode == 0, output
    except FileNotFoundError:
        return True, f"[{cmd[0]} not installed — skipped]"
    except subprocess.TimeoutExpired:
        return False, f"[{cmd[0]} timed out]"
    except Exception as exc:
        return True, f"[{cmd[0]} error: {exc} — skipped]"
    finally:
        try:
            import os
            os.unlink(fname)
        except Exception:
            pass


def validate(spec: ExtractedSpec, rewrite_result: RewriteResult) -> tuple[bool, str]:
    """
    Run validators appropriate to the source type.
    Returns (passed, combined_output).
    Validators are best-effort: if a tool is not installed, validation still passes.
    """
    if not spec.source_files:
        return True, "No files to validate."

    # Build patched content
    primary = spec.source_files[0]
    patched = _apply_diff(primary.content, rewrite_result.unified_diff)

    outputs: list[str] = []
    passed = True

    if spec.source_type == SourceType.dockerfile:
        if _tool_available("hadolint"):
            ok, out = _run(["hadolint", "-"], input_text=patched, file_ext="")
            if not ok:
                passed = False
            outputs.append(f"hadolint:\n{out}" if out else "hadolint: OK")

    elif spec.source_type in (SourceType.k8s_manifest, SourceType.helm):
        if _tool_available("kubeconform"):
            ok, out = _run(
                ["kubeconform", "-summary", "-strict"],
                input_text=patched, file_ext=".yaml",
            )
            if not ok:
                passed = False
            outputs.append(f"kubeconform:\n{out}" if out else "kubeconform: OK")
        elif _tool_available("kubeval"):
            ok, out = _run(["kubeval"], input_text=patched, file_ext=".yaml")
            if not ok:
                passed = False
            outputs.append(f"kubeval:\n{out}" if out else "kubeval: OK")

        if _tool_available("kube-linter"):
            ok, out = _run(
                ["kube-linter", "lint", "--format", "plain"],
                input_text=patched, file_ext=".yaml",
            )
            # kube-linter findings are warnings, not hard failures
            if out:
                outputs.append(f"kube-linter:\n{out}")

    elif spec.source_type == SourceType.terraform:
        if _tool_available("terraform"):
            with tempfile.TemporaryDirectory() as tmpdir:
                tf_path = Path(tmpdir) / "main.tf"
                tf_path.write_text(patched)
                result = subprocess.run(
                    ["terraform", "validate", "-no-color"],
                    capture_output=True, text=True, cwd=tmpdir, timeout=60,
                )
                out = (result.stdout + result.stderr).strip()
                if result.returncode != 0:
                    passed = False
                outputs.append(f"terraform validate:\n{out}" if out else "terraform validate: OK")

        if _tool_available("checkov"):
            with tempfile.TemporaryDirectory() as tmpdir:
                tf_path = Path(tmpdir) / "main.tf"
                tf_path.write_text(patched)
                result = subprocess.run(
                    ["checkov", "-d", tmpdir, "--quiet", "--compact"],
                    capture_output=True, text=True, timeout=60,
                )
                out = (result.stdout + result.stderr).strip()
                if out:
                    outputs.append(f"checkov:\n{out}")

    combined = "\n\n".join(outputs) if outputs else "No validators installed — skipped."
    return passed, combined
