#!/usr/bin/env python3
"""Turn BOSS card OCR into schema records, score them, and refresh site data.

The OCR text is evidence, not a substitute for a full JD. Records with only
card evidence remain behind the scorer quality gate as 信息不足，待判断.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCORER = Path("/Users/SmilingRoy/.codex/skills/screen-boss-pm-jobs/scripts/score_jobs.py")
CONFIG = Path("/Users/SmilingRoy/.codex/skills/screen-boss-pm-jobs/references/scoring-config.json")

UNKNOWN = "unknown"


def clean_lines(text: str) -> list[str]:
    lines = []
    for raw in text.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if line and line not in lines:
            lines.append(line)
    return lines


def first_match(pattern: str, text: str) -> str:
    m = re.search(pattern, text, flags=re.I)
    return m.group(0) if m else UNKNOWN


def infer_direction(title: str, text: str) -> list[str]:
    rules = [
        ("用户增长", ["增长", "用户购买", "转化", "留存"]),
        ("用户产品", ["C端", "用户产品", "用户" ]),
        ("交易", ["交易", "订单", "购物", "电商"]),
        ("履约", ["履约", "物流", "供应链"]),
        ("本地生活", ["本地生活"]),
        ("LBS", ["地图", "LBS"]),
        ("出行", ["出行", "打车", "酒旅"]),
        ("AI应用", ["AI", "Agent", "大模型"]),
        ("策略", ["策略", "搜索", "推荐"]),
        ("数据产品", ["数据产品", "数字化"]),
        ("B端产品", ["B端", "商家服务", "后台", "平台运营"]),
    ]
    haystack = f"{title} {text}"
    return [label for label, variants in rules if any(v.lower() in haystack.lower() for v in variants)]


def eval_for(title: str, text: str, directions: list[str], experience: str) -> dict[str, str]:
    haystack = f"{title} {text}"
    excluded_direction = any(x in haystack for x in ["搜索", "推荐", "广告", "商业化", "支付", "金融", "数据产品", "数字化", "医疗", "客服产品"])
    b端 = "B端" in haystack or "商家服务" in haystack or "后台产品" in haystack
    priority = any(x in directions for x in ["用户产品", "用户增长", "交易", "履约", "本地生活", "LBS", "出行"])
    return {
        "title_fit": "preferred" if "产品经理" in title or "产品负责人" in title or "产品专家" in title else "conditional",
        "city_fit": "match",
        "direction_fit": "excluded" if excluded_direction else ("priority" if priority else ("adjacent" if "AI应用" in directions else "unknown")),
        "product_form_fit": "conditional" if b端 else ("priority" if "C端" in haystack else "unknown"),
        "product_layer_fit": "conditional" if b端 else ("priority" if "C端" in haystack else "unknown"),
        "financing_fit": "unknown",
        "responsibility_fit": "medium" if "产品" in title else "low",
        "role_fit": "preferred" if "产品经理" in title or "产品专家" in title else "conditional",
        "experience_fit": "unknown" if experience == UNKNOWN else "medium",
        "company_quality": "unknown",
        "freshness_fit": "unknown",
        "mandatory_requirement_fit": "unknown",
        "team_quality": "unknown",
        "work_mode_fit": "match",
        "growth_value": "medium" if priority else "unknown",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--ocr-dir", type=Path, required=True)
    parser.add_argument("--detail-ocr-dir", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "data/jobs.json")
    parser.add_argument("--keep-structured", type=Path, default=ROOT / "data/jobs-scored.json")
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    structured = []
    for item in manifest.get("jobs", []):
        url = str(item.get("url", ""))
        if not re.match(r"^https://www\.zhipin\.com/job_detail/[^/]+\.html$", url, re.I):
            continue
        sequence = int(item.get("sequence", len(structured) + 1))
        ocr_path = args.ocr_dir / f"job_{sequence:03d}_card_context.txt"
        text = ocr_path.read_text(encoding="utf-8") if ocr_path.exists() else ""
        detail_path = (args.detail_ocr_dir / f"job_{sequence:03d}_detail_01.txt") if args.detail_ocr_dir else None
        detail_text = detail_path.read_text(encoding="utf-8") if detail_path and detail_path.exists() else ""
        evidence_text = f"{text}\n{detail_text}".strip()
        lines = clean_lines(text)
        while lines and lines[0] in {"猎头", "急招", "代招"}:
            lines.pop(0)
        title = lines[0] if lines else UNKNOWN
        experience = next((x for x in lines if re.fullmatch(r"经验不限|在校生|应届生|1年以内|1-3年|3-5年|5-10年|10年以上", x)), UNKNOWN)
        education = next((x for x in lines if re.fullmatch(r"学历不限|初中及以下|中专/中技|高中|大专|本科|硕士|博士", x)), UNKNOWN)
        company = lines[-1] if len(lines) > 1 else UNKNOWN
        directions = infer_direction(title, evidence_text)
        evaluation = eval_for(title, evidence_text, directions, experience)
        raw = "卡片 OCR：" + "｜".join(lines) if lines else "卡片 OCR 未识别到文字"
        if detail_text.strip():
            raw += "\n详情 OCR：" + re.sub(r"\s+", " ", detail_text).strip()
        detail_flat = re.sub(r"\s+", " ", detail_text).strip()
        responsibility = UNKNOWN
        qualification = UNKNOWN
        for marker in ("职位描述", "岗位描述", "岗位职责", "工作职责"):
            if marker in detail_flat:
                responsibility = detail_flat.split(marker, 1)[1].split("任职要求", 1)[0][:500].strip(" ：:;；") or UNKNOWN
                break
        for marker in ("任职要求", "职位要求", "岗位要求"):
            if marker in detail_flat:
                qualification = detail_flat.split(marker, 1)[1][:500].strip(" ：:;；") or UNKNOWN
                break
        salary = first_match(r"\d+(?:\.\d+)?-\d+(?:\.\d+)?K(?:·\d+薪)?", detail_flat)
        if salary == UNKNOWN:
            salary = first_match(r"\d+(?:\.\d+)?-\d+(?:\.\d+)?K(?:·\d+薪)?", evidence_text)
        district = next((x for x in ["浦东新区", "徐汇区", "静安区", "杨浦区", "闵行区", "虹口区", "长宁区", "普陀区", "松江区", "嘉定区", "宝山区", "青浦区", "奉贤区", "黄浦区"] if x in evidence_text), UNKNOWN)
        if responsibility != UNKNOWN:
            evaluation["responsibility_fit"] = "high" if len(responsibility) > 50 else "medium"
            evaluation["mandatory_requirement_fit"] = "match"
        missing = ["公司规模", "融资阶段"]
        if responsibility == UNKNOWN: missing.insert(0, "岗位职责")
        if qualification == UNKNOWN: missing.insert(0, "任职要求")
        structured.append({
            "job_id": str(item.get("canonical_key") or url), "job_url": url,
            "collected_at": str(item.get("captured_at") or manifest.get("created_at") or datetime.now().astimezone().isoformat()),
            "job_status": "open", "job_title": title, "company_name": company,
            "city": "上海", "district": district, "office_location": district if district != UNKNOWN else UNKNOWN,
            "salary_range": salary, "experience_requirement": experience,
            "education_requirement": education, "company_size": UNKNOWN,
            "financing_stage": UNKNOWN, "industry": "互联网产品",
            "recruiter_name": UNKNOWN, "recruiter_role": UNKNOWN, "recruiter_activity": UNKNOWN,
            "published_or_updated_at": UNKNOWN, "job_description_raw": raw,
            "responsibility_summary": responsibility, "qualification_summary": qualification,
            "product_direction_tags": directions, "product_form_tags": [], "product_layer_tags": [],
            "role_type": "产品经理", "team_and_reporting": UNKNOWN, "work_mode": "上海现场办公",
            "travel_requirement": UNKNOWN, "positive_evidence": [f"卡片识别岗位名：{title}"] if title != UNKNOWN else [],
            "risk_flags": [], "missing_information": missing,
            "interview_questions": ["该岗位负责的核心业务指标是什么？", "产品、研发和运营团队如何分工？"],
            "evaluation": evaluation,
        })

    raw_path = args.keep_structured.with_name("jobs-structured.json")
    raw_path.write_text(json.dumps({"metadata": {"source": "BOSS直聘 Vision OCR", "collected_at": manifest.get("created_at")}, "jobs": structured}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    scored_path = args.keep_structured
    subprocess.run([sys.executable, str(SCORER), str(raw_path), "--config", str(CONFIG), "--output", str(scored_path)], check=True)
    scored = json.loads(scored_path.read_text(encoding="utf-8"))
    mapped = []
    labels = {"推荐投递": "优先推荐", "可以考虑": "可以考虑", "信息不足，待判断": "信息不足", "不推荐": "不推荐"}
    fit_map = {"high": "高", "medium": "中", "low": "低", "excluded": "低", "unknown": "unknown"}
    for job in scored.get("jobs", []):
        evaluation = job.get("evaluation", {})
        mapped.append({
            "id": job["job_id"].replace("/", "-"), "url": job["job_url"], "title": job["job_title"], "company": job["company_name"],
            "city": job["city"], "district": job["district"], "office_location": job["office_location"], "salary": job["salary_range"],
            "workExperience": job["experience_requirement"], "education": job["education_requirement"], "company_size": job["company_size"],
            "financing_stage": job["financing_stage"], "industry": job["industry"], "recruiter_name": job["recruiter_name"],
            "recruiter_role": job["recruiter_role"], "recruiter_activity": job["recruiter_activity"], "description": job["job_description_raw"],
            "job_description_raw": job["job_description_raw"], "responsibilities": job["responsibility_summary"], "requirements": job["qualification_summary"],
            "tags": job["product_direction_tags"], "directions": job["product_direction_tags"], "collected_at": job["collected_at"],
            "recommendation": labels.get(job.get("recommendation"), "信息不足"), "score": job.get("match_score"),
            "responsibility_fit": fit_map.get(evaluation.get("responsibility_fit"), "unknown"), "title_fit": "高" if evaluation.get("title_fit") == "preferred" else "中",
            "capture_status": "ocr_card", "evidence_source": "BOSS岗位卡片截图 Vision OCR + 既定评分规则",
            "missing_information": job["missing_information"], "risk_flags": job["risk_flags"], "interview_questions": job["interview_questions"],
        })
    args.output.write_text(json.dumps({"metadata": {"source": "BOSS直聘 Vision OCR", "job_count": len(mapped), "scored_at": datetime.now().astimezone().isoformat()}, "jobs": mapped}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"parsed={len(structured)} scored={len(mapped)} output={args.output}")


if __name__ == "__main__":
    main()
