#!/usr/bin/env python3
"""Run the bundled Vision OCR executable over card/detail screenshots."""
from __future__ import annotations
import argparse, concurrent.futures, subprocess, tempfile
from pathlib import Path

from PIL import Image


def normalized_image(src: Path) -> tuple[Path, tempfile.TemporaryDirectory[str] | None]:
    """Return an 8-bit RGB PNG without ICC metadata for Vision compatibility."""
    temp_dir: tempfile.TemporaryDirectory[str] = tempfile.TemporaryDirectory(prefix="boss-ocr-image-")
    normalized = Path(temp_dir.name) / "image.png"
    try:
        with Image.open(src) as image:
            image.convert("RGB").save(normalized, format="PNG", icc_profile=None)
    except Exception as error:
        temp_dir.cleanup()
        if error.__class__.__name__ == "UnidentifiedImageError":
            return src, None
        raise
    return normalized, temp_dir


def run_ocr_file(source: Path, destination: Path, ocr_binary: Path) -> str:
    """Run OCR for one image and persist either text or an actionable error."""
    temp_dir: tempfile.TemporaryDirectory[str] | None = None
    try:
        normalized, temp_dir = normalized_image(source)
        result = subprocess.run(
            [str(ocr_binary), str(normalized)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            detail = result.stderr.strip() or "no stderr output"
            destination.write_text(
                f"ERROR exit={result.returncode}: {detail}\n",
                encoding="utf-8",
            )
            return "error"
        destination.write_text(result.stdout, encoding="utf-8")
        return "ok"
    except Exception as exc:
        destination.write_text(f"ERROR {exc!r}\n", encoding="utf-8")
        return "error"
    finally:
        if temp_dir is not None:
            temp_dir.cleanup()


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
        dst = a.output_dir / f"{src.stem}.txt"
        if dst.exists(): return "skip"
        return run_ocr_file(src, dst, a.ocr_binary)
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
        results = list(pool.map(one, files))
    print(f"ocr_files={len(files)} ok={results.count('ok')} skipped={results.count('skip')} errors={results.count('error')} output={a.output_dir}")

if __name__ == "__main__": main()
