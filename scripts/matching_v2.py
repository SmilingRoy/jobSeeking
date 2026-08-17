from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

UNKNOWN = "unknown"
HIGH_RECOMMENDATIONS = {"优先推荐", "可以考虑"}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def evidence_text(job: dict[str, Any]) -> str:
    return " ".join(str(job.get(key, "")) for key in (
        "title", "company", "city", "description", "job_description_raw",
        "responsibilities", "requirements", "work_mode",
    ))


def classify_job(job: dict[str, Any], preferences: dict[str, Any]) -> dict[str, str]:
    text = evidence_text(job)
    supplied = job.get("evaluation") if isinstance(job.get("evaluation"), dict) else {}
    title = str(job.get("title", ""))
    city = str(job.get("city", ""))
    priority = preferences["priority_directions"]
    adjacent = preferences["adjacent_directions"]
    excluded = preferences["excluded_directions"]
    categories = sum(any(word in text for word in group) for group in (
        ("用户研究", "需求洞察", "行为分析"),
        ("产品规划", "方案设计", "版本迭代"),
        ("增长", "转化", "留存", "召回"),
        ("交易", "订单", "履约", "售后"),
        ("指标", "数据分析", "A/B"),
    ))
    has_loop = any(word in text for word in ("上线", "落地", "迭代", "验证"))
    severe_risk = any(risk.get("hard_reject") for risk in job.get("risk_flags", []) if isinstance(risk, dict))
    severities = [risk.get("severity") for risk in job.get("risk_flags", []) if isinstance(risk, dict)]
    inferred = {
        "title_fit": "preferred" if "产品经理" in title else ("unknown" if not title or title == UNKNOWN else "excluded"),
        "city_fit": "match" if city == "上海" else ("unknown" if not city or city == UNKNOWN else "mismatch"),
        "direction_fit": "excluded" if any(value in text for value in excluded) else ("priority" if any(value in text for value in priority) else ("adjacent" if any(value in text for value in adjacent) else "unknown")),
        "product_form_fit": "priority" if any(value in text for value in ("C端", "App", "小程序", "用户端")) else ("excluded" if any(value in text for value in ("企业SaaS", "ERP", "CRM", "MES")) else "unknown"),
        "product_layer_fit": "priority" if any(value in text for value in ("用户层", "核心链路", "交易链路")) else ("excluded" if any(value in text for value in ("纯内部系统", "开发者平台", "数据基础设施")) else "unknown"),
        "financing_fit": "unknown",
        "responsibility_fit": "high" if categories >= 2 and has_loop else ("medium" if categories >= 1 else "unknown"),
        "role_fit": "preferred" if "产品经理" in title else "unknown",
        "experience_fit": "unknown",
        "company_quality": "unknown",
        "freshness_fit": "unknown",
        "mandatory_requirement_fit": "unknown",
        "team_quality": "unknown",
        "work_mode_fit": "match" if city == "上海" else "unknown",
        "growth_value": "high" if any(value in text for value in priority) else ("medium" if any(value in text for value in adjacent) else "unknown"),
        "risk_fit": "severe" if severe_risk or "严重真实性风险" in text else ("medium" if "medium" in severities else ("light" if "light" in severities else "clear")),
    }
    inferred.update({key: value for key, value in supplied.items() if key in inferred})
    return inferred


def hard_filter_reasons(job: dict[str, Any], evaluation: dict[str, str], algorithm: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    if job.get("job_status") == "closed":
        reasons.append("job_status=closed")
    for field, rejected in algorithm["hard_filter_values"].items():
        if field == "job_status":
            continue
        if evaluation.get(field) in rejected:
            reasons.append(f"{field}={evaluation[field]}")
    return reasons


def score_job(job: dict[str, Any], algorithm: dict[str, Any], preferences: dict[str, Any]) -> dict[str, Any]:
    output = deepcopy(job)
    evaluation = classify_job(job, preferences)
    components: list[dict[str, Any]] = []
    known_weight = 0.0
    weighted_points = 0.0
    total_weight = float(sum(preferences["weights"].values()))
    for dimension, weight in preferences["weights"].items():
        value = evaluation[dimension]
        factor = algorithm["dimensions"][dimension].get(value)
        known = factor is not None
        if known:
            known_weight += weight
            weighted_points += weight * factor
        components.append({
            "dimension": dimension,
            "classification": value,
            "weight": weight,
            "known": known,
            "points": round(weight * factor, 2) if known else None,
        })
    match_score = round(weighted_points / known_weight * 100, 1) if known_weight else 0.0
    required_text = (job.get("job_description_raw"), job.get("responsibilities"))
    complete_jd = all(value not in (None, "", UNKNOWN) and len(str(value)) >= 20 for value in required_text)
    capture_factor = 1.0 if job.get("verification_status") == "captured_jd" and complete_jd else 0.55
    evidence_confidence = round(known_weight / total_weight * capture_factor, 3)
    hard_reasons = hard_filter_reasons(job, evaluation, algorithm)
    threshold = algorithm["thresholds"]
    if hard_reasons:
        recommendation = "不推荐"
    elif evidence_confidence < algorithm["confidence_floor_for_recommendation"] or not complete_jd:
        recommendation = "信息不足"
    elif match_score >= threshold["preferred"]:
        recommendation = "优先推荐"
    elif match_score >= threshold["consider"]:
        recommendation = "可以考虑"
    elif match_score >= threshold["review"]:
        recommendation = "谨慎评估"
    else:
        recommendation = "不推荐"
    positives = [
        f"{item['dimension']}={item['classification']}"
        for item in sorted(components, key=lambda item: item["points"] or -1, reverse=True)
        if item["known"] and (item["points"] or 0) >= item["weight"] * 0.8
    ][:3]
    missing = list(dict.fromkeys([
        *job.get("missing_information", []),
        *(item["dimension"] for item in components if not item["known"]),
        *([] if complete_jd else ["完整JD或职责证据"]),
    ]))
    output.update({
        "evaluation": evaluation,
        "match_score": match_score,
        "score": match_score if recommendation != "信息不足" else None,
        "evidence_confidence": evidence_confidence,
        "recommendation": recommendation,
        "score_components": components,
        "positive_evidence": positives,
        "risks": job.get("risk_flags", []),
        "missing_information": missing,
        "hard_filter_reasons": hard_reasons,
        "scoring_config_version": f"{algorithm['version']}+{preferences['version']}",
    })
    return output


def score_document(document: dict[str, Any], algorithm: dict[str, Any], preferences: dict[str, Any]) -> dict[str, Any]:
    jobs = [score_job(job, algorithm, preferences) for job in document.get("jobs", [])]
    return {
        "metadata": {
            **document.get("metadata", {}),
            "scoring_algorithm_version": algorithm["version"],
            "preference_version": preferences["version"],
            "job_count": len(jobs),
        },
        "jobs": jobs,
    }
