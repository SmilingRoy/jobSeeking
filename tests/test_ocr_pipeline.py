from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

spec = importlib.util.spec_from_file_location("run_ocr_batch", ROOT / "scripts/run-ocr-batch.py")
run_ocr_batch = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(run_ocr_batch)

import sys
sys.path.insert(0, str(ROOT / "scripts"))
from ocr_pipeline_lib import (  # noqa: E402
    build_structured_jobs,
    map_scored_jobs,
    merge_ocr_pages,
    parse_card_hint,
    infer_recruiter_type,
    validate_site_jobs,
)


class OcrPipelineTests(unittest.TestCase):
    def test_maps_browser_card_hint(self) -> None:
        mapped = parse_card_hint("b端产品经理-购车方向 -K 3-5年 本科 中后台产品 电商产品 NIO蔚来 上海·闵行区·虹桥")
        self.assertEqual(mapped["title"], "b端产品经理-购车方向")
        self.assertEqual(mapped["company"], "NIO蔚来")
        self.assertEqual(mapped["experience"], "3-5年")
        self.assertEqual(mapped["education"], "本科")
        self.assertEqual(mapped["district"], "闵行区")

    def test_maps_recruiter_type_from_card_or_jd_evidence(self) -> None:
        self.assertEqual(infer_recruiter_type("猎头", "资深产品经理"), "猎头")
        self.assertEqual(infer_recruiter_type("", "招聘专家"), "HR")
        self.assertEqual(infer_recruiter_type("", "岗位职责"), "unknown")

    def test_merges_detail_pages_without_repeating_overlap(self) -> None:
        merged = merge_ocr_pages([
            "岗位职责\n负责需求分析\n负责方案设计\n",
            "负责方案设计\n推动版本上线\n任职要求\n本科\n",
        ])
        self.assertEqual(merged.count("负责方案设计"), 1)
        self.assertIn("推动版本上线", merged)
        self.assertIn("任职要求", merged)

    def test_splits_common_ocr_heading_variants(self) -> None:
        responsibility, qualification = __import__("ocr_pipeline_lib").split_jd(
            "职位职责\n负责产品规划和迭代\n【任职要求】\n本科以上学历\n"
        )
        self.assertIn("负责产品规划和迭代", responsibility)
        self.assertIn("本科以上学历", qualification)

    def test_builds_complete_record_and_quarantines_unsafe_binding(self) -> None:
        fixture = ROOT / "fixtures/ocr-pipeline"
        manifest = json.loads((fixture / "manifest.json").read_text(encoding="utf-8"))
        structured, review = build_structured_jobs(manifest, fixture, fixture)
        self.assertEqual(len(structured), 2)
        good = next(job for job in structured if job["job_id"] == "fixture-good")
        unsafe = next(job for job in structured if job["job_id"] == "fixture-review")
        self.assertEqual(good["verification_status"], "captured_jd")
        self.assertEqual(good["job_status"], "open")
        self.assertEqual(good["company_name"], "某互联网科技公司")
        self.assertIn("推动版本迭代上线", good["responsibility_summary"])
        self.assertEqual(good["evaluation"]["responsibility_fit"], "high")
        self.assertEqual(unsafe["verification_status"], "needs_review")
        self.assertIn("capture_status=detail_unchanged", unsafe["review_reasons"])
        self.assertTrue(any(item.get("job_id") == "fixture-review" for item in review))

    def test_review_records_cannot_keep_high_recommendation(self) -> None:
        fixture = ROOT / "fixtures/ocr-pipeline"
        manifest = json.loads((fixture / "manifest.json").read_text(encoding="utf-8"))
        structured, _review = build_structured_jobs(manifest, fixture, fixture)
        for job in structured:
            job["recommendation"] = "推荐投递"
            job["match_score"] = 90
        mapped = map_scored_jobs({"jobs": structured})
        unsafe = next(job for job in mapped if job["capture_status"] == "detail_unchanged")
        self.assertEqual(unsafe["recommendation"], "信息不足")
        validate_site_jobs(mapped)

    def test_nonzero_ocr_exit_is_an_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / "fake-ocr"
            binary.write_text("#!/bin/sh\necho failed >&2\nexit 7\n", encoding="utf-8")
            binary.chmod(0o755)
            source = root / "job_001_card_context.png"
            source.write_bytes(b"not-an-image")
            destination = root / "job_001_card_context.txt"
            result = run_ocr_batch.run_ocr_file(source, destination, binary)
            self.assertEqual(result, "error")
            self.assertIn("exit=7", destination.read_text(encoding="utf-8"))

    def test_one_command_pipeline_with_fake_ocr_binary(self) -> None:
        scorer = ROOT / "scripts/score_jobs.py"
        scoring_config = ROOT / "config/job-scoring.json"
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            screenshots = temp / "screenshots"
            screenshots.mkdir()
            (screenshots / "job_001_card_context.png").write_bytes(b"fixture")
            (screenshots / "job_001_detail_01.png").write_bytes(b"fixture")
            manifest = temp / "manifest.json"
            manifest.write_text(json.dumps({
                "created_at": "2026-08-04T12:00:00+08:00",
                "jobs": [{
                    "sequence": 1,
                    "canonical_key": "pipeline-fixture",
                    "url": "https://www.zhipin.com/job_detail/pipeline-fixture.html",
                    "status": "captured",
                }],
            }, ensure_ascii=False), encoding="utf-8")
            binary = temp / "fake-ocr"
            binary.write_text(
                "#!/bin/sh\n"
                "case \"$1\" in\n"
                "  *card_context*) printf '增长产品经理\\n3-5年\\n本科\\n示例科技公司\\n' ;;\n"
                "  *) printf '增长产品经理\\n上海浦东新区\\n职位描述\\n负责用户研究和产品规划，推动版本迭代上线并进行数据验证\\n任职要求\\n本科，三年以上产品经验\\n' ;;\n"
                "esac\n",
                encoding="utf-8",
            )
            binary.chmod(0o755)
            output = temp / "site-jobs.json"
            subprocess.run([
                sys.executable,
                str(ROOT / "scripts/run-ocr-pipeline.py"),
                "--manifest", str(manifest),
                "--screenshots", str(screenshots),
                "--work-dir", str(temp / "work"),
                "--output", str(output),
                "--ocr-binary", str(binary),
                "--scorer", str(scorer),
                "--scoring-config", str(scoring_config),
            ], check=True, capture_output=True, text=True)
            payload = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(payload["metadata"]["job_count"], 1)
            self.assertEqual(payload["jobs"][0]["verification_status"], "captured_jd")


if __name__ == "__main__":
    unittest.main()
