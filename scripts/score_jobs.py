#!/usr/bin/env python3
"""Project-local scoring adapter used by the OCR pipeline.

It preserves the scorer interface used by the pipeline while delegating the
actual deterministic scoring rules to the repository's matching-v2 engine.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    command = [
        sys.executable,
        str(ROOT / "scripts/score-jobs-v2.py"),
        str(args.input),
        "--output",
        str(args.output),
        "--algorithm",
        str(ROOT / "config/matching-v2/scoring-algorithm.json"),
        "--preferences",
        str(ROOT / "config/matching-v2/preferences.shanghai-pm.json"),
    ]
    subprocess.run(command, check=True)

    scored = json.loads(args.output.read_text(encoding="utf-8"))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        "# OCR 岗位评分报告\n\n"
        f"- 岗位数：{len(scored.get('jobs', []))}\n"
        f"- 评分算法：{scored.get('metadata', {}).get('scoring_algorithm_version', 'unknown')}\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
