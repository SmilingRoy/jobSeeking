#!/usr/bin/env python3
"""Run the bundled Vision OCR executable over card/detail screenshots."""
from __future__ import annotations
import argparse, concurrent.futures, subprocess
from pathlib import Path


def run_ocr_file(src: Path, dst: Path, ocr_binary: Path) -> str:
    if dst.exists():
        return "skip"
    try:
        result = subprocess.run(
            [str(ocr_binary), str(src)],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except Exception as exc:
        dst.write_text(f"ERROR {exc!r}\n", encoding="utf-8")
        return "error"
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or f"exit {result.returncode}").strip()
        dst.write_text(f"ERROR exit={result.returncode} {detail}\n", encoding="utf-8")
        return "error"
    dst.write_text(result.stdout, encoding="utf-8")
    return "ok"

def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("input_dir", type=Path)
    p.add_argument("output_dir", type=Path)
    p.add_argument("--ocr-binary", type=Path, required=True)
    p.add_argument("--workers", type=int, default=8)
    a = p.parse_args()
    a.output_dir.mkdir(parents=True, exist_ok=True)
    files = sorted([*a.input_dir.glob("*_card_context.png"), *a.input_dir.glob("*_detail_*.png")])
    def one(src: Path) -> str:
        return run_ocr_file(src, a.output_dir / f"{src.stem}.txt", a.ocr_binary)
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
        results = list(pool.map(one, files))
    print(f"ocr_files={len(files)} ok={results.count('ok')} skipped={results.count('skip')} errors={results.count('error')} output={a.output_dir}")
    if results.count("error"):
        raise SystemExit(1)

if __name__ == "__main__": main()
