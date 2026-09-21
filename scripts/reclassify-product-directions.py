#!/usr/bin/env python3
"""Reclassify the persisted site dataset using the current direction taxonomy."""
from __future__ import annotations

import json
from pathlib import Path

from product_directions import DIRECTION_TAXONOMY_VERSION, infer_product_directions

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/jobs.json"

payload = json.loads(DATA.read_text(encoding="utf-8"))
jobs = payload.get("jobs", [])
counts: dict[str, int] = {}
for job in jobs:
    directions = infer_product_directions(
        job.get("title", job.get("job_title", "")),
        job.get("job_description_raw", ""),
        job.get("responsibilities", job.get("responsibility_summary", "")),
        job.get("requirements", job.get("qualification_summary", "")),
    )
    job["directions"] = directions
    job["tags"] = directions
    job["product_direction_tags"] = directions
    for direction in directions:
        counts[direction] = counts.get(direction, 0) + 1

payload.setdefault("metadata", {})["direction_taxonomy_version"] = DIRECTION_TAXONOMY_VERSION
payload["metadata"]["direction_counts"] = counts
DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"jobs": len(jobs), "taxonomy": DIRECTION_TAXONOMY_VERSION, "counts": counts}, ensure_ascii=False, indent=2))
