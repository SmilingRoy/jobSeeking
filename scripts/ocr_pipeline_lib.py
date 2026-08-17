from __future__ import annotations

import json
import os
import re
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

UNKNOWN = "unknown"
COMPLETE_CAPTURE_STATUSES = {"captured"}
REVIEW_CAPTURE_STATUSES = {
    "detail_unchanged",
    "detail_not_jd",
    "detail_capped",
    "detail_initial",
}
JD_HEADINGS = ("职位描述", "岗位描述", "岗位职责", "工作职责")
REQUIREMENT_HEADINGS = ("任职要求", "职位要求", "岗位要求")
EXPERIENCE_VALUES = ("经验不限", "在校生", "应届生", "1年以内", "1-3年", "3-5年", "5-10年", "10年以上")
EDUCATION_VALUES = ("学历不限", "初中及以下", "中专/中技", "高中", "大专", "本科", "硕士", "博士")
DISTRICTS = ("浦东新区", "徐汇区", "静安区", "杨浦区", "闵行区", "虹口区", "长宁区", "普陀区", "松江区", "嘉定区", "宝山区", "青浦区", "奉贤区", "黄浦区", "金山区", "崇明区")


def clean_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if line and line not in lines:
            lines.append(line)
    return lines


def merge_ocr_pages(texts: list[str]) -> str:
    merged: list[str] = []
    for text in texts:
        page = clean_lines(text)
        overlap = 0
        maximum = min(len(merged), len(page), 12)
        for size in range(maximum, 0, -1):
            if merged[-size:] == page[:size]:
                overlap = size
                break
        merged.extend(page[overlap:])
    return "\n".join(merged)


def first_match(pattern: str, text: str) -> str:
    match = re.search(pattern, text, flags=re.I)
    return match.group(0) if match else UNKNOWN


def infer_direction(title: str, text: str) -> list[str]:
    rules = [
        ("用户增长", ["增长", "用户购买", "转化", "留存"]),
        ("用户产品", ["C端", "用户产品", "用户体验"]),
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
    evidence = f"{title} {text}".lower()
    return [label for label, variants in rules if any(value.lower() in evidence for value in variants)]


def split_jd(detail_text: str) -> tuple[str, str]:
    lines = clean_lines(detail_text)
    responsibility = UNKNOWN
    qualification = UNKNOWN
    responsibility_index = next(
        (index for index, line in enumerate(lines) if any(re.match(rf"^{re.escape(marker)}(?:\s*[:：]|$)", line) for marker in JD_HEADINGS)),
        None,
    )
    requirement_index = next(
        (index for index, line in enumerate(lines) if any(re.match(rf"^{re.escape(marker)}(?:\s*[:：]|$)", line) for marker in REQUIREMENT_HEADINGS)),
        None,
    )
    if responsibility_index is not None:
        end = requirement_index if requirement_index is not None and requirement_index > responsibility_index else len(lines)
        responsibility = " ".join(lines[responsibility_index + 1:end])[:1200].strip(" ：:;；") or UNKNOWN
    if requirement_index is not None:
        qualification = " ".join(lines[requirement_index + 1:])[:1200].strip(" ：:;；") or UNKNOWN
    return responsibility, qualification


def infer_company(lines: list[str], title: str) -> str:
    ignored = set(EXPERIENCE_VALUES + EDUCATION_VALUES)
    ignored.update({"C端产品", "B端产品", "产品", "AI产品", "电商产品"})
    candidates = []
    for line in lines[1:]:
        if line in ignored or line == title:
            continue
        if re.search(r"\d+(?:\.\d+)?-\d+(?:\.\d+)?K|上海|职位描述|任职要求", line):
            continue
        if 2 <= len(line) <= 40:
            candidates.append(line)
    return candidates[-1] if candidates else UNKNOWN


def evaluation_for(title: str, detail: str, directions: list[str], experience: str, responsibility: str) -> dict[str, str]:
    evidence = f"{title} {detail}"
    excluded_direction = any(value in evidence for value in ["商业化广告", "支付产品", "金融产品", "数据治理", "医疗信息化"])
    b_side = any(value in evidence for value in ["B端", "企业SaaS", "商家后台", "内部系统"])
    c_side = any(value in evidence for value in ["C端", "用户端", "App", "小程序"])
    priority = any(value in directions for value in ["用户产品", "用户增长", "交易", "履约", "本地生活", "LBS", "出行"])
    responsibility_categories = sum(
        any(keyword in responsibility for keyword in group)
        for group in [
            ("用户研究", "需求洞察", "行为分析"),
            ("产品规划", "方案设计", "版本迭代"),
            ("增长", "转化", "留存", "召回"),
            ("交易", "订单", "履约", "售后"),
            ("指标", "数据分析", "A/B"),
        ]
    ) if responsibility != UNKNOWN else 0
    has_delivery_loop = responsibility != UNKNOWN and any(value in responsibility for value in ["上线", "落地", "迭代", "验证"])
    responsibility_fit = "high" if responsibility_categories >= 2 and has_delivery_loop else ("medium" if responsibility != UNKNOWN else "unknown")
    return {
        "title_fit": "preferred" if "产品经理" in title else "unknown",
        "city_fit": "match",
        "direction_fit": "excluded" if excluded_direction else ("priority" if priority else ("adjacent" if "AI应用" in directions else "unknown")),
        "product_form_fit": "priority" if c_side else ("conditional" if b_side else "unknown"),
        "product_layer_fit": "priority" if c_side else ("conditional" if b_side else "unknown"),
        "financing_fit": "unknown",
        "responsibility_fit": responsibility_fit,
        "role_fit": "preferred" if "产品经理" in title else "unknown",
        "experience_fit": "unknown" if experience == UNKNOWN else "medium",
        "company_quality": "unknown",
        "freshness_fit": "unknown",
        "mandatory_requirement_fit": "match" if responsibility != UNKNOWN else "unknown",
        "team_quality": "unknown",
        "work_mode_fit": "match",
        "growth_value": "medium" if priority else "unknown",
    }


def read_detail_text(detail_dir: Path | None, sequence: int) -> tuple[str, list[str]]:
    if not detail_dir:
        return "", []
    paths = sorted(detail_dir.glob(f"job_{sequence:03d}_detail_*.txt"))
    texts = [path.read_text(encoding="utf-8") for path in paths if path.exists()]
    return merge_ocr_pages(texts), [str(path) for path in paths]


def build_structured_jobs(manifest: dict[str, Any], ocr_dir: Path, detail_dir: Path | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    structured: list[dict[str, Any]] = []
    review: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for item in manifest.get("jobs", []):
        url = str(item.get("url", "")).strip()
        sequence = int(item.get("sequence", len(structured) + len(review) + 1))
        reasons: list[str] = []
        if not re.fullmatch(r"https://www\.zhipin\.com/job_detail/[^/]+\.html", url, re.I):
            review.append({"sequence": sequence, "url": url, "reasons": ["invalid_job_url"]})
            continue
        if url.lower() in seen_urls:
            review.append({"sequence": sequence, "url": url, "reasons": ["duplicate_job_url"]})
            continue
        seen_urls.add(url.lower())
        status = str(item.get("status", "unknown"))
        if status not in COMPLETE_CAPTURE_STATUSES:
            reasons.append(f"capture_status={status}")

        card_path = ocr_dir / f"job_{sequence:03d}_card_context.txt"
        card_text = card_path.read_text(encoding="utf-8") if card_path.exists() else ""
        lines = clean_lines(card_text)
        while lines and lines[0] in {"猎头", "急招", "代招"}:
            lines.pop(0)
        title = lines[0] if lines and "产品经理" in lines[0] else UNKNOWN
        if title == UNKNOWN:
            reasons.append("title_not_confirmed_product_manager")
        detail_text, detail_paths = read_detail_text(detail_dir, sequence)
        if not detail_text:
            reasons.append("missing_detail_ocr")
        detail_lines = clean_lines(detail_text)
        if detail_text and not any(
            any(re.match(rf"^{re.escape(marker)}(?:\s*[:：]|$)", line) for marker in (*JD_HEADINGS, *REQUIREMENT_HEADINGS))
            for line in detail_lines
        ):
            reasons.append("detail_missing_jd_heading")
        if title != UNKNOWN and detail_text and title not in detail_text and title[:6] not in detail_text:
            reasons.append("detail_title_mismatch")

        responsibility, qualification = split_jd(detail_text)
        if responsibility == UNKNOWN:
            reasons.append("missing_responsibility")
        if qualification == UNKNOWN:
            reasons.append("missing_qualification")
        company = infer_company(lines, title)
        if company == UNKNOWN:
            reasons.append("company_unknown")
        experience = next((value for value in lines if value in EXPERIENCE_VALUES), UNKNOWN)
        education = next((value for value in lines if value in EDUCATION_VALUES), UNKNOWN)
        evidence_text = f"{card_text}\n{detail_text}".strip()
        districts = [district for district in DISTRICTS if district in evidence_text]
        district = districts[0] if len(districts) == 1 else UNKNOWN
        if len(districts) > 1:
            reasons.append("district_conflict")
        salary = first_match(r"\d+(?:\.\d+)?-\d+(?:\.\d+)?K(?:·\d+薪)?", detail_text or card_text)
        directions = infer_direction(title, detail_text) if title != UNKNOWN else []
        evaluation = evaluation_for(title, detail_text, directions, experience, responsibility)
        missing = ["公司规模", "融资阶段"]
        if responsibility == UNKNOWN:
            missing.insert(0, "岗位职责")
        if qualification == UNKNOWN:
            missing.insert(0, "任职要求")
        if company == UNKNOWN:
            missing.insert(0, "公司名称")
        job_id = str(item.get("canonical_key") or url)
        record = {
            "job_id": job_id,
            "job_url": url,
            "collected_at": str(item.get("captured_at") or manifest.get("created_at") or datetime.now().astimezone().isoformat()),
            "job_status": "open" if not reasons else "unknown",
            "job_title": title,
            "company_name": company,
            "city": "上海",
            "district": district,
            "office_location": district,
            "salary_range": salary,
            "experience_requirement": experience,
            "education_requirement": education,
            "company_size": UNKNOWN,
            "financing_stage": UNKNOWN,
            "industry": UNKNOWN,
            "recruiter_name": UNKNOWN,
            "recruiter_role": UNKNOWN,
            "recruiter_activity": UNKNOWN,
            "published_or_updated_at": UNKNOWN,
            "job_description_raw": detail_text or UNKNOWN,
            "responsibility_summary": responsibility,
            "qualification_summary": qualification,
            "product_direction_tags": directions,
            "product_form_tags": [],
            "product_layer_tags": [],
            "role_type": "产品经理" if title != UNKNOWN else UNKNOWN,
            "team_and_reporting": UNKNOWN,
            "work_mode": "上海现场办公",
            "travel_requirement": UNKNOWN,
            "positive_evidence": [f"卡片识别岗位名：{title}"] if title != UNKNOWN else [],
            "risk_flags": [],
            "missing_information": missing,
            "interview_questions": ["该岗位负责的核心业务指标是什么？", "产品、研发和运营团队如何分工？"],
            "evaluation": evaluation,
            "capture_status": status,
            "verification_status": "captured_jd" if not reasons else "needs_review",
            "evidence_files": {"card_ocr": str(card_path), "detail_ocr": detail_paths},
            "review_reasons": reasons,
        }
        if title != UNKNOWN:
            structured.append(record)
        if reasons:
            review.append({"sequence": sequence, "job_id": job_id, "url": url, "capture_status": status, "reasons": reasons})
    return structured, review


def map_scored_jobs(scored: dict[str, Any]) -> list[dict[str, Any]]:
    labels = {"推荐投递": "优先推荐", "可以考虑": "可以考虑", "信息不足，待判断": "信息不足", "不推荐": "不推荐"}
    fit_map = {"high": "高", "medium": "中", "low": "低", "excluded": "低", "unknown": "unknown"}
    config_version = str(scored.get("metadata", {}).get("scoring_config_version", "legacy-scoring-unknown"))
    mapped: list[dict[str, Any]] = []
    for job in scored.get("jobs", []):
        evaluation = job.get("evaluation", {})
        review_reasons = job.get("review_reasons") or []
        known_dimensions = sum(value not in (None, "", UNKNOWN) for value in evaluation.values())
        dimension_count = max(len(evaluation), 1)
        complete_jd = job.get("job_description_raw") not in (None, "", UNKNOWN) and job.get("responsibility_summary") not in (None, "", UNKNOWN)
        capture_factor = 1.0 if job.get("verification_status") == "captured_jd" and complete_jd else 0.55
        evidence_confidence = round(known_dimensions / dimension_count * capture_factor, 3)
        recommendation = labels.get(job.get("recommendation"), "信息不足")
        if review_reasons or evidence_confidence < 0.7:
            recommendation = "信息不足"
        scoring = job.get("scoring") if isinstance(job.get("scoring"), dict) else {}
        component_points = scoring.get("components") if isinstance(scoring.get("components"), dict) else {}
        score_components = [
            {
                "dimension": dimension,
                "classification": classification,
                "known": classification not in (None, "", UNKNOWN),
                "points": component_points.get(dimension),
            }
            for dimension, classification in evaluation.items()
        ]
        match_score = job.get("match_score")
        mapped.append({
            "id": str(job["job_id"]).replace("/", "-"),
            "url": job["job_url"],
            "title": job["job_title"],
            "company": job["company_name"],
            "city": job["city"],
            "district": job["district"],
            "office_location": job["office_location"],
            "salary": job["salary_range"],
            "workExperience": job["experience_requirement"],
            "education": job["education_requirement"],
            "company_size": job["company_size"],
            "financing_stage": job["financing_stage"],
            "industry": job["industry"],
            "recruiter_name": job["recruiter_name"],
            "recruiter_role": job["recruiter_role"],
            "recruiter_activity": job["recruiter_activity"],
            "description": job["job_description_raw"],
            "job_description_raw": job["job_description_raw"],
            "responsibilities": job["responsibility_summary"],
            "requirements": job["qualification_summary"],
            "tags": job["product_direction_tags"],
            "directions": job["product_direction_tags"],
            "collected_at": job["collected_at"],
            "recommendation": recommendation,
            "score": None if recommendation == "信息不足" else match_score,
            "match_score": match_score,
            "evidence_confidence": evidence_confidence,
            "score_components": score_components,
            "hard_filter_reasons": scoring.get("hard_filter_reasons", []),
            "scoring_config_version": config_version,
            "responsibility_fit": fit_map.get(evaluation.get("responsibility_fit"), "unknown"),
            "title_fit": "高" if evaluation.get("title_fit") == "preferred" else "unknown",
            "pipeline": "ocr_jd",
            "verification_status": job.get("verification_status", "needs_review"),
            "evidence_source": [{
                "type": "ocr_jd",
                "observed_at": job["collected_at"],
                "capture_status": job.get("capture_status", "unknown"),
                "detail": "BOSS岗位卡片和右侧JD截图 Vision OCR + 确定性评分规则",
            }],
            "capture_status": job.get("capture_status", "unknown"),
            "missing_information": job["missing_information"],
            "risk_flags": job["risk_flags"],
            "interview_questions": job["interview_questions"],
            "review_reasons": review_reasons,
        })
    return mapped


def validate_site_jobs(jobs: list[dict[str, Any]]) -> None:
    ids: set[str] = set()
    urls: set[str] = set()
    allowed = {"优先推荐", "可以考虑", "谨慎评估", "不推荐", "信息不足"}
    for index, job in enumerate(jobs):
        label = f"jobs[{index}]"
        if not job.get("id") or job["id"] in ids:
            raise ValueError(f"{label}.id 缺失或重复")
        ids.add(job["id"])
        if not re.fullmatch(r"https://www\.zhipin\.com/job_detail/[^/]+\.html", str(job.get("url", ""))):
            raise ValueError(f"{label}.url 不是具体 BOSS 详情链接")
        if job["url"] in urls:
            raise ValueError(f"{label}.url 重复")
        urls.add(job["url"])
        if job.get("city") != "上海" or "产品经理" not in str(job.get("title", "")):
            raise ValueError(f"{label} 不是上海产品经理")
        if job.get("recommendation") not in allowed:
            raise ValueError(f"{label}.recommendation 不合法")
        if job.get("verification_status") == "needs_review" and job.get("recommendation") in {"优先推荐", "可以考虑"}:
            raise ValueError(f"{label} 待复核岗位不能高等级推荐")
        match_score = job.get("match_score")
        if match_score is not None and (not isinstance(match_score, (int, float)) or isinstance(match_score, bool) or not 0 <= match_score <= 100):
            raise ValueError(f"{label}.match_score 不在 0-100 或 null")
        confidence = job.get("evidence_confidence")
        if not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or not 0 <= confidence <= 1:
            raise ValueError(f"{label}.evidence_confidence 不在 0-1")
        if not isinstance(job.get("score_components"), list):
            raise ValueError(f"{label}.score_components 必须是数组")
        if not isinstance(job.get("hard_filter_reasons"), list):
            raise ValueError(f"{label}.hard_filter_reasons 必须是数组")
        if job.get("scoring_config_version") in (None, "", UNKNOWN):
            raise ValueError(f"{label}.scoring_config_version 缺失")
        if job.get("recommendation") in {"优先推荐", "可以考虑"} and confidence < 0.7:
            raise ValueError(f"{label} 低证据置信度不能高等级推荐")
        if not isinstance(job.get("evidence_source"), list) or not job["evidence_source"]:
            raise ValueError(f"{label}.evidence_source 必须是非空数组")
        if not isinstance(job.get("review_reasons"), list):
            raise ValueError(f"{label}.review_reasons 必须是数组")


def atomic_write_json(path: Path, value: Any) -> None:
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
