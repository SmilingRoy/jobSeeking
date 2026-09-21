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
DEFAULT_SCORER = ROOT / "scripts/score_jobs.py"
DEFAULT_SCORING_CONFIG = ROOT / "config/matching-v2/scoring-algorithm.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--ocr-dir", type=Path, required=True)
    parser.add_argument("--detail-ocr-dir", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "data/jobs.json")
    parser.add_argument("--keep-structured", type=Path, default=ROOT / "data/jobs-scored.json")
    parser.add_argument("--review-queue", type=Path, default=ROOT / "outputs/ocr-review-queue.json")
    parser.add_argument("--report", type=Path, default=ROOT / "outputs/ocr-job-report.md")
    parser.add_argument("--scorer", type=Path, default=DEFAULT_SCORER)
    parser.add_argument("--scoring-config", type=Path, default=DEFAULT_SCORING_CONFIG)
    parser.add_argument(
        "--filter-out-of-scope",
        action="store_true",
        help="仅输出上海且标题包含‘产品经理’的岗位，其他岗位保留在结构化批次结果中",
    )
    parser.add_argument(
        "--only-complete-jd",
        action="store_true",
        help="网站输出仅保留已确认有完整 JD 证据的岗位",
    )
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
    if args.filter_out_of_scope:
        mapped = [
            job for job in mapped
            if job.get("city") == "上海" and "产品经理" in str(job.get("title", ""))
        ]
    if args.only_complete_jd:
        mapped = [job for job in mapped if job.get("verification_status") == "captured_jd"]
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
