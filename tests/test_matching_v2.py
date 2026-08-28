from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

from scripts.matching_v2 import load_json, score_document, score_job


class MatchingV2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.algorithm = load_json(ROOT / "config/matching-v2/scoring-algorithm.json")
        cls.preferences = load_json(ROOT / "config/matching-v2/preferences.shanghai-pm.json")
        cls.gold = load_json(ROOT / "fixtures/matching-gold-standard-v1.json")

    def test_gold_standard_has_40_complete_jds_and_four_classes(self) -> None:
        jobs = self.gold["jobs"]
        self.assertGreaterEqual(len(jobs), 40)
        self.assertEqual({job["human_recommendation"] for job in jobs}, {"优先推荐", "可以考虑", "信息不足", "不推荐"})
        self.assertTrue(all(len(job["job_description_raw"]) >= 80 and len(job["responsibilities"]) >= 20 for job in jobs))

    def test_information_insufficient_has_zero_false_recommendations(self) -> None:
        result = score_document({"jobs": self.gold["jobs"]}, self.algorithm, self.preferences)
        insufficient = [job for job in result["jobs"] if job["human_recommendation"] == "信息不足"]
        self.assertTrue(insufficient)
        self.assertTrue(all(job["recommendation"] == "信息不足" for job in insufficient))
        self.assertTrue(all(job["evidence_confidence"] < 0.7 for job in insufficient))

    def test_all_human_hard_filters_are_rejected(self) -> None:
        result = score_document({"jobs": self.gold["jobs"]}, self.algorithm, self.preferences)
        rejected = [job for job in result["jobs"] if job["human_recommendation"] == "不推荐"]
        self.assertTrue(all(job["recommendation"] == "不推荐" and job["hard_filter_reasons"] for job in rejected))

    def test_top_10_agrees_with_human_recommend_or_consider_at_least_eight(self) -> None:
        result = score_document({"jobs": self.gold["jobs"]}, self.algorithm, self.preferences)
        top = sorted(result["jobs"], key=lambda job: (job["match_score"], job["evidence_confidence"]), reverse=True)[:10]
        agreement = sum(job["human_recommendation"] in {"优先推荐", "可以考虑"} and job["recommendation"] in {"优先推荐", "可以考虑"} for job in top)
        self.assertGreaterEqual(agreement, 8)

    def test_unknown_is_not_negative_but_lowers_confidence(self) -> None:
        complete = self.gold["jobs"][0]
        uncertain = self.gold["jobs"][20]
        scored_complete = score_job(complete, self.algorithm, self.preferences)
        scored_uncertain = score_job(uncertain, self.algorithm, self.preferences)
        self.assertGreaterEqual(scored_uncertain["match_score"], 70)
        self.assertLess(scored_uncertain["evidence_confidence"], scored_complete["evidence_confidence"])
        self.assertEqual(scored_uncertain["recommendation"], "信息不足")

    def test_cli_writes_versioned_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "scored.json"
            completed = subprocess.run(
                ["python3", str(ROOT / "scripts/score-jobs-v2.py"), str(ROOT / "fixtures/matching-gold-standard-v1.json"), "--output", str(output)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            document = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(document["metadata"]["scoring_algorithm_version"], "matching-v2.0.0")
            self.assertEqual(document["metadata"]["preference_version"], "shanghai-pm-preferences-v1.0.0")
            self.assertEqual(len(document["jobs"][0]["score_components"]), 16)
            self.assertLessEqual(len(document["jobs"][0]["positive_evidence"]), 3)


if __name__ == "__main__":
    unittest.main()
