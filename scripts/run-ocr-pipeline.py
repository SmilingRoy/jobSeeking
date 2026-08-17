#!/usr/bin/env python3
"""One-command local OCR pipeline: Vision OCR, normalization, scoring, validation."""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = Path(os.environ.get("SCREEN_BOSS_PM_SKILL_ROOT", Path.home() / ".codex/skills/screen-boss-pm-jobs"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--screenshots", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "data/jobs.json")
    parser.add_argument("--ocr-binary", type=Path)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--scorer", type=Path, default=SKILL_ROOT / "scripts/score_jobs.py")
    parser.add_argument("--scoring-config", type=Path, default=SKILL_ROOT / "references/scoring-config.json")
    args = parser.parse_args()

    args.work_dir.mkdir(parents=True, exist_ok=True)
    ocr_binary = args.ocr_binary or args.work_dir / "ocr-vision"
    if args.ocr_binary is None:
        subprocess.run(["swiftc", str(ROOT / "scripts/ocr-vision.swift"), "-o", str(ocr_binary)], check=True)
    ocr_dir = args.work_dir / "ocr"
    subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/run-ocr-batch.py"),
            str(args.screenshots),
            str(ocr_dir),
            "--ocr-binary",
            str(ocr_binary),
            "--workers",
            str(args.workers),
        ],
        check=True,
    )
    subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/ocr-and-score.py"),
            "--manifest",
            str(args.manifest),
            "--ocr-dir",
            str(ocr_dir),
            "--detail-ocr-dir",
            str(ocr_dir),
            "--output",
            str(args.output),
            "--keep-structured",
            str(args.work_dir / "jobs-scored.json"),
            "--review-queue",
            str(args.work_dir / "review-queue.json"),
            "--report",
            str(args.work_dir / "job-report.md"),
            "--scorer",
            str(args.scorer),
            "--scoring-config",
            str(args.scoring_config),
        ],
        check=True,
    )
    print(f"pipeline complete: {args.output}")


if __name__ == "__main__":
    main()
