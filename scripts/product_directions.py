"""Evidence-based product direction classification for OCR job records."""
from __future__ import annotations

import re
from typing import Iterable


DIRECTION_TAXONOMY_VERSION = "product-directions-v2.0.0"


def _text(values: Iterable[object]) -> str:
    return re.sub(r"\s+", " ", " ".join(str(value or "") for value in values)).strip()


def _clean_jd(value: str) -> str:
    text = value
    headings = re.search(r"(?:岗位职责|职位描述|工作职责|工作内容|任职要求|职位要求|工作要求|能力要求)", text)
    if headings and headings.start() > 0:
        text = text[headings.start():]
    cut_markers = (
        "与BOSS随时沟通", "求职工具", "工作地址", "APP 有了", "消息 简历",
        "消息\n简历", "查看更多信息", "升级VIP", "微信扫码分享", "不合适",
    )
    positions = [text.find(marker) for marker in cut_markers if text.find(marker) > 0]
    if positions:
        text = text[:min(positions)]
    return text


def infer_product_directions(
    title: object,
    raw_text: object = "",
    responsibilities: object = "",
    requirements: object = "",
) -> list[str]:
    """Return up to four directions using title/JD evidence, excluding OCR chrome noise."""
    title_text = _text([title])
    body = _clean_jd(_text([responsibilities, requirements]))
    if not body:
        body = _clean_jd(_text([raw_text]))
    title_lower = title_text.lower()
    body_lower = body.lower()
    result: list[str] = []

    def add(label: str) -> None:
        if label not in result:
            result.append(label)

    # Specific business directions first; these are the most useful filters.
    if any(key in title_text or key in body for key in ("AI", "Agent", "大模型", "智能客服", "机器学习", "算法产品")):
        add("AI应用")
    if any(key in title_text or key in body for key in ("电商", "交易", "订单", "商品", "购物", "支付", "会员", "营销", "商业产品")):
        add("交易")
    if any(key in title_text or key in body for key in ("履约", "物流", "供应链", "配送", "售后", "仓储")):
        add("履约")
    if any(key in title_text or key in body for key in ("增长", "转化", "留存", "召回", "拉新", "活跃", "激励")):
        add("用户增长")
    if any(key in title_text or key in body for key in ("搜索", "推荐", "排序", "流量策略", "策略产品", "实验平台")):
        add("策略")
    if any(key in title_text or key in body for key in ("数据产品", "数据平台", "指标平台", "BI产品", "数仓", "数据分析产品")):
        add("数据产品")
    if any(key in title_text or key in body for key in ("内容", "社区", "博客", "阅读", "音乐", "视频", "直播", "内容分发")):
        add("内容产品")
    if any(key in title_text or key in body for key in ("出行", "打车", "汽车", "车载", "座舱", "车辆", "地图导航")):
        add("出行")
    if any(key in title_text or key in body for key in ("本地生活", "到店", "酒旅", "外卖", "团购")):
        add("本地生活")
    # LBS requires explicit geographic/route evidence; generic page text such as
    # the BOSS navigation word “地图” is intentionally not enough.
    if any(key in title_text or key in body for key in ("LBS", "地理位置", "定位服务", "门店位置", "路线规划", "地理信息")):
        add("LBS")
    if any(key in title_text or key in body for key in ("B端", "商家端", "企业端", "中后台", "后台系统", "平台产品", "SaaS", "ERP", "CRM", "内部系统")):
        add("B端产品")

    # Keep a user-facing product label for genuine C-side/app experiences, but
    # do not infer it from every generic occurrence of “产品经理”.
    if any(key in title_text or key in body for key in ("C端", "用户产品", "用户体验", "App", "APP", "小程序", "客户端")):
        add("用户产品")

    if not result:
        result.append("用户产品")
    return result[:4]


def taxonomy_labels() -> list[str]:
    return ["用户产品", "用户增长", "交易", "履约", "策略", "AI应用", "B端产品", "数据产品", "内容产品", "出行", "本地生活", "LBS"]
