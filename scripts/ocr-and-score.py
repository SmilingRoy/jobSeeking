#!/usr/bin/env python3
"""Normalize OCR evidence, apply the deterministic scorer, and write site data."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from ocr_pipeline_lib import (
    atomic_write_json,
    build_structured_jobs,
    map_scored_jobs,
    validate_site_jobs,
)

ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = Path(
    os.environ.get(
        "SCREEN_BOSS_PM_SKILL_ROOT",
        Path.home() / ".codex/skills/screen-boss-pm-jobs",
    )
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--ocr-dir", type=Path, required=True)
    parser.add_argument("--detail-ocr-dir", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "data/jobs.json")
    parser.add_argument("--keep-structured", type=Path, default=ROOT / "data/jobs-scored.json")
    parser.add_argument("--review-queue", type=Path, default=ROOT / "outputs/ocr-review-queue.json")
    parser.add_argument("--report", type=Path, default=ROOT / "outputs/ocr-job-report.md")
    parser.add_argument("--scorer", type=Path, default=SKILL_ROOT / "scripts/score_jobs.py")
    parser.add_argument("--scoring-config", type=Path, default=SKILL_ROOT / "references/scoring-config.json")
    args = parser.parse_args()

    for required in (args.manifest, args.scorer, args.scoring_config):
        if not required.exists():
            raise SystemExit(f"required file not found: {required}")

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    structured, review = build_structured_jobs(
        manifest,
        args.ocr_dir,
        args.detail_ocr_dir or args.ocr_dir,
    )
    raw_path = args.keep_structured.with_name("jobs-structured.json")
    raw_document = {
        "metadata": {
            "source": "BOSS直聘 Vision OCR",
            "pipeline": "ocr_jd",
            "collected_at": manifest.get("created_at"),
            "job_count": len(structured),
            "review_count": len(review),
        },
        "jobs": structured,
    }
    atomic_write_json(raw_path, raw_document)
    atomic_write_json(
        args.review_queue,
        {
            "metadata": {
                "pipeline": "ocr_jd",
                "created_at": datetime.now().astimezone().isoformat(),
                "review_count": len(review),
            },
            "jobs": review,
        },
    )
    args.keep_structured.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            sys.executable,
            str(args.scorer),
            str(raw_path),
            "--config",
            str(args.scoring_config),
            "--output",
            str(args.keep_structured),
            "--report",
            str(args.report),
        ],
        check=True,
    )
    scored = json.loads(args.keep_structured.read_text(encoding="utf-8"))
    mapped = map_scored_jobs(scored)
    validate_site_jobs(mapped)
    payload = {
        "metadata": {
            "source": "BOSS直聘 Vision OCR",
            "pipeline": "ocr_jd",
            "verification_status": "captured_jd_with_review_queue",
            "job_count": len(mapped),
            "review_count": len(review),
            "scored_at": datetime.now().astimezone().isoformat(),
        },
        "jobs": mapped,
    }
    atomic_write_json(args.output, payload)
    print(f"parsed={len(structured)} scored={len(mapped)} review={len(review)} output={args.output}")


if __name__ == "__main__":
    main()
