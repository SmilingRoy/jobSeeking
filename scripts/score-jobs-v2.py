#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path

from matching_v2 import load_json, score_document

ROOT = Path(__file__).resolve().parents[1]


def atomic_write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Deterministic Job Lens matching v2")
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--algorithm", type=Path, default=ROOT / "config/matching-v2/scoring-algorithm.json")
    parser.add_argument("--preferences", type=Path, default=ROOT / "config/matching-v2/preferences.shanghai-pm.json")
    args = parser.parse_args()
    result = score_document(load_json(args.input), load_json(args.algorithm), load_json(args.preferences))
    atomic_write(args.output, result)
    print(f"scored {len(result['jobs'])} jobs with {result['metadata']['scoring_algorithm_version']}")


if __name__ == "__main__":
    main()
