#!/usr/bin/env python3
"""Eval harness: run the parse+infer stages against fixtures, check expectations."""
from __future__ import annotations
import json
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent))

from app.schemas import SourceFile, Objective
from app.stages.parse import parse_artifact
from app.stages.infer import infer_missing

FIXTURES_DIR = Path(__file__).parent / "fixtures"

_PASS = "\033[32m✓\033[0m"
_FAIL = "\033[31m✗\033[0m"


def run_fixture(fixture_dir: Path) -> bool:
    name = fixture_dir.name
    expected_path = fixture_dir / "expected.json"
    input_dir = fixture_dir / "input"

    if not expected_path.exists() or not input_dir.exists():
        print(f"  {_FAIL} {name}: missing expected.json or input/")
        return False

    expected = json.loads(expected_path.read_text())
    files = [
        SourceFile(path=f.name, content=f.read_text())
        for f in sorted(input_dir.iterdir()) if f.is_file()
    ]

    # Stage 1
    spec = parse_artifact(files)

    # Stage 2 if needed
    if spec.missing_fields:
        spec = infer_missing(spec)

    failures: list[str] = []

    # Check workload kind
    if "workload_kind" in expected:
        if spec.workload.kind.value != expected["workload_kind"]:
            failures.append(
                f"workload.kind: expected={expected['workload_kind']} got={spec.workload.kind.value}"
            )

    # Check gpu_count
    if "gpu_count_min" in expected:
        got = spec.resources.gpu_count or 0
        if got < expected["gpu_count_min"]:
            failures.append(
                f"gpu_count: expected≥{expected['gpu_count_min']} got={got}"
            )

    # Check gpu_type compatibility
    if "acceptable_gpu_types" in expected and spec.resources.gpu_type:
        if spec.resources.gpu_type not in expected["acceptable_gpu_types"]:
            failures.append(
                f"gpu_type: {spec.resources.gpu_type!r} not in {expected['acceptable_gpu_types']}"
            )

    if failures:
        print(f"  {_FAIL} {name}")
        for f in failures:
            print(f"      → {f}")
        if spec.inference_notes:
            print(f"      inference_notes: {json.dumps(spec.inference_notes, indent=6)}")
        return False

    print(f"  {_PASS} {name}  (kind={spec.workload.kind.value}, gpu={spec.resources.gpu_count}×{spec.resources.gpu_type})")
    return True


def main():
    if not FIXTURES_DIR.exists():
        print(f"No fixtures directory found at {FIXTURES_DIR}")
        sys.exit(1)

    fixture_dirs = sorted(d for d in FIXTURES_DIR.iterdir() if d.is_dir())
    if not fixture_dirs:
        print("No fixtures found.")
        sys.exit(0)

    print(f"\nRunning {len(fixture_dirs)} fixture(s)...\n")
    results = [run_fixture(d) for d in fixture_dirs]
    passed = sum(results)
    total = len(results)

    print(f"\n{'─'*40}")
    print(f"  {passed}/{total} passed")
    if passed < total:
        sys.exit(1)


if __name__ == "__main__":
    main()
