"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type JobStatus = "new" | "ignored";

type Job = {
  id: number;
  title: string;
  company: string;
  city: string;
  salaryMin: number;
  salaryMax: number;
  experience: string;
  education: string;
  companySize: string;
  industry: string;
  track: string;
  workMode: string;
  source: string;
  description: string;
  tags: string[];
  postedAt: string;
  url: string;
  status: JobStatus;
};

type Filters = {
  search: string;
  cities: string[];
  salaryMin: number;
  experience: string;
  education: string;
  includeKeywords: string;
  excludeKeywords: string;
  track: string;
  workMode: string;
};

const initialJobs: Job[] = [
  {
    id: 1,
    title: "AI Agent 产品经理",
    company: "BOSS直聘",
    city: "北京",
    salaryMin: 30,
    salaryMax: 50,
    experience: "3-5年",
    education: "本科",
    companySize: "1000-9999人",
    industry: "人力资源服务",
    track: "AI / 大模型",
    workMode: "线下",
    description: "推动 AI Agent 在招聘与求职场景落地，关注大模型应用、工作流与产品创新。",
    tags: ["AI Agent", "大模型", "B端/C端", "产品全周期"],
    postedAt: "今日抓取",
    source: "BOSS直聘·产品经理",
    url: "https://www.zhipin.com/zhaopin/32a66c074d2737e61nd42dS8/",
    status: "new",
  },
  {
    id: 2,
    title: "产品经理（增长方向）",
    company: "BOSS直聘·看准",
    city: "北京",
    salaryMin: 25,
    salaryMax: 45,
    experience: "1-3年",
    education: "本科",
    companySize: "1000-9999人",
    industry: "人力资源服务",
    track: "增长 / 用户",
    workMode: "线下",
    description: "负责看准用户增长产品，对提转方向关键指标负责，结合用户调研和数据反馈持续迭代。",
    tags: ["用户增长", "数据分析", "转化", "留存"],
    postedAt: "今日抓取",
    source: "BOSS直聘·产品经理",
    url: "https://www.zhipin.com/zhaopin/32a66c074d2737e61nd42dS8/",
    status: "new",
  },
  {
    id: 3,
    title: "阿里国际站-商业产品经理",
    company: "阿里巴巴集团",
    city: "杭州",
    salaryMin: 30,
    salaryMax: 60,
    experience: "3-5年",
    education: "本科",
    companySize: "10000人以上",
    industry: "互联网 / 电商",
    track: "商业化 / B端",
    workMode: "线下",
    description: "负责会员产品设计，优化商家权益与买家导购，提升海外商家经营效果与客户留存。",
    tags: ["商业化", "会员", "国际化", "B端"],
    postedAt: "今日抓取",
    source: "BOSS直聘·商业产品经理",
    url: "https://www.zhipin.com/zhaopin/90089f4c8f066b020XBy39i8/",
    status: "new",
  },
  {
    id: 4,
    title: "数据产品经理",
    company: "BOSS直聘",
    city: "北京",
    salaryMin: 15,
    salaryMax: 30,
    experience: "1-3年",
    education: "本科",
    companySize: "1000-9999人",
    industry: "人力资源服务",
    track: "数据产品",
    workMode: "线下",
    description: "负责数据产品规划与实现，覆盖调研、需求分析、产品定位、架构与视图展现。",
    tags: ["指标体系", "数据分析", "BI", "产品设计"],
    postedAt: "今日抓取",
    source: "BOSS直聘·数据产品经理",
    url: "https://www.zhipin.com/zhaopin/ebe1c7905a5b7baf03d_09W6/",
    status: "new",
  },
  {
    id: 5,
    title: "商业产品经理（工具方向）",
    company: "云览科技",
    city: "北京",
    salaryMin: 25,
    salaryMax: 45,
    experience: "不限",
    education: "不限",
    companySize: "100-499人",
    industry: "互联网",
    track: "商业化 / B端",
    workMode: "线下",
    description: "负责工具商业化规划和售卖率提升，分析变现与营销策略，探索软件服务的增长机会。",
    tags: ["商业化", "工具产品", "增长", "A轮"],
    postedAt: "3天前",
    source: "BOSS直聘·商业产品经理",
    url: "https://www.zhipin.com/zhaopin/90089f4c8f066b020XBy39i8/",
    status: "new",
  },
  {
    id: 6,
    title: "国际化商业产品经理-创意AIGC产品",
    company: "一亩田",
    city: "北京",
    salaryMin: 20,
    salaryMax: 40,
    experience: "3-5年",
    education: "本科",
    companySize: "500-999人",
    industry: "互联网",
    track: "AI / 大模型",
    workMode: "线下",
    description: "拆解广告创意工作流，将 AIGC 能力结合制作与投广环节，提升客户采纳率与使用效果。",
    tags: ["AIGC", "广告产品", "国际化", "商业化"],
    postedAt: "3天前",
    source: "BOSS直聘·商业产品经理",
    url: "https://www.zhipin.com/zhaopin/90089f4c8f066b020XBy39i8/",
    status: "new",
  },
  {
    id: 7,
    title: "流量策略商业产品经理",
    company: "哔哩哔哩",
    city: "上海",
    salaryMin: 30,
    salaryMax: 60,
    experience: "5-10年",
    education: "本科",
    companySize: "10000人以上",
    industry: "互联网 / 内容",
    track: "商业化 / B端",
    workMode: "线下",
    description: "负责核心场景流量策略、商业库存、混排与竞价机制，结合 AB 实验持续优化。",
    tags: ["流量策略", "广告", "AB实验", "商业化"],
    postedAt: "3天前",
    source: "BOSS直聘·商业产品经理",
    url: "https://www.zhipin.com/job_detail/afcf9c2a447047340nd53N27GFtS.html",
    status: "new",
  },
  {
    id: 8,
    title: "数据产品经理",
    company: "盛天网络",
    city: "佛山",
    salaryMin: 45,
    salaryMax: 60,
    experience: "5-10年",
    education: "本科",
    companySize: "500-999人",
    industry: "互联网 / 游戏",
    track: "数据产品",
    workMode: "线下",
    description: "主导 ToB 数据产品体系规划，覆盖经营分析、营销 ROI、线索转化与客户画像。",
    tags: ["ToB", "营销数据", "ROI", "客户画像"],
    postedAt: "3周前",
    source: "BOSS直聘·数据产品经理",
    url: "https://www.zhipin.com/zhaopin/ebe1c7905a5b7baf03d_09W6/",
    status: "new",
  },
  {
    id: 9,
    title: "产品经理（财务系统方向）",
    company: "BOSS直聘",
    city: "北京",
    salaryMin: 15,
    salaryMax: 20,
    experience: "1-3年",
    education: "本科",
    companySize: "1000-9999人",
    industry: "人力资源服务",
    track: "企业服务 / SaaS",
    workMode: "线下",
    description: "负责报销、合同管理、采购等核心业务系统的需求梳理与功能优化，协同财务、法务与采购。",
    tags: ["SaaS", "财务系统", "企业服务", "流程设计"],
    postedAt: "今日抓取",
    source: "BOSS直聘·产品经理",
    url: "https://www.zhipin.com/zhaopin/32a66c074d2737e61nd42dS8/",
    status: "new",
  },
  {
    id: 10,
    title: "数据产品经理",
    company: "跨越速运",
    city: "深圳",
    salaryMin: 25,
    salaryMax: 35,
    experience: "5-10年",
    education: "大专",
    companySize: "10000人以上",
    industry: "物流 / 供应链",
    track: "数据产品",
    workMode: "线下",
    description: "负责数据产品设计和规划，建设通用指标体系并跟进开发、测试与验收全流程。",
    tags: ["数据产品", "指标体系", "物流", "B端"],
    postedAt: "3周前",
    source: "BOSS直聘·数据产品经理",
    url: "https://www.zhipin.com/zhaopin/ebe1c7905a5b7baf03d_09W6/",
    status: "new",
  },
  {
    id: 11,
    title: "数据产品经理",
    company: "大健云仓科技",
    city: "苏州",
    salaryMin: 18,
    salaryMax: 30,
    experience: "3-5年",
    education: "本科",
    companySize: "1000-9999人",
    industry: "电子商务",
    track: "数据产品",
    workMode: "线下",
    description: "主导数据中台核心模块建设，搭建 B2B 电商全景数据模型与数据服务网关。",
    tags: ["数据中台", "B2B电商", "OneData", "数据资产"],
    postedAt: "3周前",
    source: "BOSS直聘·数据产品经理",
    url: "https://www.zhipin.com/zhaopin/ebe1c7905a5b7baf03d_09W6/",
    status: "new",
  },
  {
    id: 12,
    title: "数据产品经理",
    company: "数融智联",
    city: "杭州",
    salaryMin: 8,
    salaryMax: 12,
    experience: "5-10年",
    education: "本科",
    companySize: "0-20人",
    industry: "人工智能",
    track: "数据产品",
    workMode: "线下",
    description: "独立负责通信大数据应用产品演进，覆盖 BI、异动分析、行为分析与经营分析。",
    tags: ["BI", "通信大数据", "经营分析", "小团队"],
    postedAt: "3周前",
    source: "BOSS直聘·数据产品经理",
    url: "https://www.zhipin.com/zhaopin/ebe1c7905a5b7baf03d_09W6/",
    status: "ignored",
  },
];

const extraSeedRows = [
  ["AI 产品经理", "德勤", "南京", 35, 65, "5-10年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/eebc39dced94a2b20nV62ty-EFVX.html"],
  ["AI 产品经理", "鱼跃医疗", "郑州", 12, 20, "3-5年", "硕士", "AI / 大模型", "https://www.zhipin.com/job_detail/dfba6076b02974dc0ndz2tq6F1BU.html"],
  ["AI 产品经理", "畅威物联网", "深圳", 18, 26, "5-10年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/22d300c587e3acb703dz3t-0GFNQ.html"],
  ["AI 产品经理", "法狗狗", "襄阳", 4, 8, "1-3年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/fa78ad2bbf663bfb03N90t24ElZR.html"],
  ["AI 产品经理", "云溪数科", "北京", 20, 40, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/939e7590bdc1060f0ndy3d28FFBS.html"],
  ["AI 产品经理", "Looki", "北京", 30, 60, "5-10年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/0d6c3a2b06b2d5f20nV92dS5E1tQ.html"],
  ["AI 产品经理", "熙软科技", "上海", 23, 35, "5-10年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/3310b4168a1a15e503F439q4F1ZU.html"],
  ["AI 产品经理", "杭州探索未来智能", "杭州", 10, 15, "在校/应届", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/b0728d94fe54880403192d-1GFFV.html"],
  ["AI 产品经理", "乐薇", "武汉", 25, 35, "1-3年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/b827fcd5131b53280nd90tW7GFpZ.html"],
  ["AI 产品经理", "记忆张量", "上海", 20, 40, "1-3年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/ca9bec8d18e4cd720nZ62d-1FVtS.html"],
  ["AI 产品经理", "上海福芮柚科技", "上海", 23, 30, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/f706223f4674e9270nV42dq4EFZU.html"],
  ["AI 产品经理", "xmind", "深圳", 18, 28, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/f24fa8317906565a0nd529-4EFNR.html"],
  ["AI 产品经理", "上海万联易算技术", "上海", 13, 18, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/e861c51c8a2aa9d903x83968FVtY.html"],
  ["AI 产品经理", "灵匠科技杭州分公司", "杭州", 13, 20, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/94e9f80263b3d1761HNy3Ni1E1RR.html"],
  ["数据产品经理", "路特创新", "杭州", 25, 35, "1-3年", "本科", "数据产品", "https://www.zhipin.com/job_detail/94876f4683bbb3150nd83d6_GFJQ.html"],
  ["数据产品经理", "钛动科技", "苏州", 14, 28, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/49865e250ae532060nZ_3tu4GVFQ.html"],
  ["数据产品经理", "大健云仓科技", "北京", 20, 35, "1-3年", "本科", "数据产品", "https://www.zhipin.com/job_detail/88d25c56042606ec0ndz0t-7F1BX.html"],
  ["数据产品经理", "元保数科", "苏州", 10, 12, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/3340a63daa80a63c1XB83t6-E1JZ.html"],
  ["数据产品经理", "熵智信息科技", "深圳", 15, 30, "不限", "本科", "数据产品", "https://www.zhipin.com/job_detail/d4aad34e3049b2a10nZ-3dS-EVNZ.html"],
  ["数据产品经理", "韶音科技", "北京", 10, 11, "3-5年", "大专", "数据产品", "https://www.zhipin.com/job_detail/b2d5197ad4f1e45c0nJ70t25F1dR.html"],
  ["数据产品经理", "零跑科技", "杭州", 25, 35, "5-10年", "本科", "数据产品", "https://www.zhipin.com/job_detail/42aabc4af31626c20nZ83t26EFpT.html"],
  ["数据产品经理", "深圳市云元智域科技", "深圳", 15, 25, "5-10年", "本科", "数据产品", "https://www.zhipin.com/job_detail/f0f1b59d69653dab0nB_3Ny5FFBX.html"],
  ["数据产品经理", "旗天科技", "上海", 20, 30, "5-10年", "本科", "数据产品", "https://www.zhipin.com/job_detail/430a7343ec6b72280nVy3d29FlBV.html"],
  ["数据产品经理", "灏仟亿科技集团", "广州", 18, 35, "5-10年", "本科", "数据产品", "https://www.zhipin.com/job_detail/e6f1e3fdc8c0dcc30nd90tu7FlBY.html"],
  ["数据产品经理", "北京龙腾微时代", "北京", 12, 18, "5-10年", "本科", "数据产品", "https://www.zhipin.com/job_detail/74f83e7e9d09554b0nd70ti1GVJX.html"],
  ["数据产品经理", "京东集团", "北京", 30, 40, "5-10年", "本科", "数据产品", "https://www.zhipin.com/job_detail/e1af6815027ed47403N92tu-F1tT.html"],
  ["数据产品经理", "朴朴超市", "上海", 25, 35, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/7cca97f91b3d2d4b1Hdy09S0GFZS.html"],
  ["数据产品经理", "美云", "佛山", 12, 17, "3-5年", "大专", "数据产品", "https://www.zhipin.com/job_detail/959cf13cec185b570nB83tu4FFVR.html"],
  ["数据产品经理", "每日互动", "杭州", 15, 30, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/07555c5f716e775103x42du5ElpS.html"],
  ["数据产品经理", "优财云链", "杭州", 15, 25, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/9be57a6b367ec5021X182Nq4FlJX.html"],
  ["数据产品经理", "锐捷网络", "北京", 20, 40, "5-10年", "本科", "数据产品", "https://www.zhipin.com/job_detail/693a8b39b910f05a03d80tu-GVtU.html"],
  ["数据产品经理", "滴滴出行", "北京", 25, 40, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/89046fc55f623bc403V53d-4F1NU.html"],
  ["数据产品经理", "贝壳找房", "北京", 25, 40, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/8bf2f4d9dd910cd403F_3tS_GFBU.html"],
  ["商业产品经理", "斗象科技", "上海", 25, 35, "5-10年", "本科", "商业化 / B端", "https://www.zhipin.com/job_detail/15fbff1bcfb3d63b0nVz2t-0GVFS.html"],
  ["商业产品经理", "百路科技", "深圳", 30, 40, "5-10年", "本科", "商业化 / B端", "https://www.zhipin.com/job_detail/349e4d0e8c11b25c0nZ92t2_EldZ.html"],
  ["商业产品经理", "才课教育", "北京", 25, 50, "3-5年", "本科", "商业化 / B端", "https://www.zhipin.com/job_detail/0cc9258c0a752c0f031929q8FVVT.html"],
  ["商业产品经理", "vivo", "深圳", 30, 60, "5-10年", "本科", "商业化 / B端", "https://www.zhipin.com/job_detail/1ac74a12fc29a8b60nB639y9GVFZ.html"],
  ["商业产品经理", "丰图科技", "深圳", 18, 23, "3-5年", "本科", "商业化 / B端", "https://www.zhipin.com/job_detail/db009fb0a15366a603Z52tW8GFNV.html"],
  ["商业产品经理", "汽车之家", "深圳", 20, 40, "3-5年", "本科", "商业化 / B端", "https://www.zhipin.com/job_detail/208de709b7b3b3ab0nFz3tq1EFdQ.html"],
  ["商业产品经理", "360集团", "北京", 15, 25, "3-5年", "本科", "商业化 / B端", "https://www.zhipin.com/job_detail/d3465712dfeb9ad003R42tq5EFRZ.html"],
  ["商业产品经理", "一亩田", "北京", 20, 40, "3-5年", "本科", "商业化 / B端", "https://www.zhipin.com/job_detail/5318a84cdad5260b03F-3d60FVVU.html"],
  ["流量策略商业产品经理", "bilibili", "上海", 30, 60, "5-10年", "本科", "商业化 / B端", "https://www.zhipin.com/job_detail/afcf9c2a447047340nd53N27GFtS.html"],
  ["商业产品经理（版权策略方向）", "快手", "北京", 25, 50, "3-5年", "本科", "商业化 / B端", "https://www.zhipin.com/job_detail/5c695676f3cd53a01nF829m6ElBS.html"],
  ["商业化产品经理", "速境生活科技", "深圳", 20, 40, "5-10年", "本科", "商业化 / B端", "https://www.zhipin.com/job_detail/8ebafb92b30111dd0nd_29W0FFtT.html"],
  ["商业化产品经理", "网易", "杭州", 26, 45, "5-10年", "本科", "商业化 / B端", "https://www.zhipin.com/job_detail/fb05588f502c55090nd-0tu4EFBQ.html"],
  ["产品经理", "BOSS直聘", "北京", 30, 40, "3-5年", "本科", "通用产品", "https://www.zhipin.com/job_detail/8d224b383cf0741f0nR62Nq6FVdS.html"],
  ["风控策略产品经理", "BOSS直聘", "北京", 15, 25, "1-3年", "本科", "企业服务 / SaaS", "https://www.zhipin.com/job_detail/b15d71ff1366615b0ndy0tW9F1FX.html"],
] as const;

const additionalJobs: Job[] = extraSeedRows.map((row, index) => {
  const [title, company, city, salaryMin, salaryMax, experience, education, track, url] = row;
  return {
    id: index + 13,
    title,
    company,
    city,
    salaryMin,
    salaryMax,
    experience,
    education,
    companySize: "公开页面未标注",
    industry: track === "AI / 大模型" ? "人工智能" : track === "数据产品" ? "互联网 / 数据" : "互联网",
    track,
    workMode: "线下",
    description: `来自 BOSS 公开职位摘要：${title}，围绕${track}方向负责产品规划、需求分析与跨团队落地。`,
    tags: [track, "需求分析", "产品规划"],
    postedAt: "公开页抓取",
    source: "BOSS直聘公开职位详情",
    url,
    status: "new",
  };
});

const shanghaiSeedRows = [
  ["产品经理", "拓竹科技", 15, 16, "1-3年", "本科", "通用产品", "https://www.zhipin.com/job_detail/fee97d421d67382e0nV639y1F1VT.html"],
  ["产品经理", "上海国智技术有限公司", 30, 45, "5-10年", "本科", "企业服务 / SaaS", "https://www.zhipin.com/job_detail/a3ef3c45bd477e451HF83Ny4FVBR.html"],
  ["产品经理", "比瑞吉", 20, 25, "3-5年", "本科", "通用产品", "https://www.zhipin.com/job_detail/47703154a40b35ab0nV52di6GVBR.html"],
  ["产品经理", "上海行影不离智能科技", 15, 18, "5-10年", "本科", "企业服务 / SaaS", "https://www.zhipin.com/job_detail/a86346e70bd1a57203J939u0FVBX.html"],
  ["产品经理", "润吧云", 8, 10, "1-3年", "本科", "企业服务 / SaaS", "https://www.zhipin.com/job_detail/12352c7a21ff66a503d409m-FFFW.html"],
  ["产品经理", "正新集团", 12, 20, "1-3年", "本科", "通用产品", "https://www.zhipin.com/job_detail/4bb45954335188cd1n1z3d6_FlJX.html"],
  ["产品经理", "上海游盾网络", 15, 20, "3-5年", "本科", "通用产品", "https://www.zhipin.com/job_detail/fdda6b605c894d160nZz3dm8FVJU.html"],
  ["产品经理", "瑞玞生物", 16, 20, "5-10年", "本科", "通用产品", "https://www.zhipin.com/job_detail/e37d9e1c9e2bef0303R_2tW9EFVX.html"],
  ["产品经理", "上海昀泓商贸", 13, 25, "3-5年", "本科", "通用产品", "https://www.zhipin.com/job_detail/4bda50b928b81b110nR63N6_FVpX.html"],
  ["产品经理", "聚水潭", 20, 30, "1-3年", "本科", "企业服务 / SaaS", "https://www.zhipin.com/job_detail/fa1e94a4cbc6361103J42di4EVBW.html"],
  ["产品经理", "上海大模型生态发展", 15, 20, "3-5年", "硕士", "通用产品", "https://www.zhipin.com/job_detail/1994747471547e950nR709-7EFZU.html"],
  ["产品经理", "百趣生物", 13, 25, "1-3年", "本科", "企业服务 / SaaS", "https://www.zhipin.com/job_detail/f398cb405808616a0nZ63NW1F1FW.html"],
  ["产品经理", "超星集团上海分公司", 15, 20, "3-5年", "本科", "通用产品", "https://www.zhipin.com/job_detail/1ecd4efb6f31a8081XB-29W5GVRZ.html"],
  ["产品经理", "柠季", 11, 20, "不限", "本科", "通用产品", "https://www.zhipin.com/job_detail/78d2c78d3d80acbc0nV43du4EVdR.html"],
  ["产品经理", "海康威视", 25, 50, "5-10年", "本科", "企业服务 / SaaS", "https://www.zhipin.com/job_detail/55907e33b0f9b33c1X142NW5GVVR.html"],
  ["产品经理", "上海萃绩科技有限公司", 50, 80, "5-10年", "硕士", "企业服务 / SaaS", "https://www.zhipin.com/job_detail/37c1b6036a876cda1Hxy29S7FVBQ.html"],
  ["产品经理", "盈力", 18, 25, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/b90dd06fcc02b90d0nd_29q4GFBQ.html"],
  ["产品经理", "北京青葵智造科技", 12, 20, "3-5年", "不限", "通用产品", "https://www.zhipin.com/job_detail/127dc41110b6b16003153di4FFRY.html"],
  ["产品经理", "曼玲粥铺", 15, 30, "5-10年", "本科", "通用产品", "https://www.zhipin.com/job_detail/8f075f22ed9d0f7d03d509u0FlVR.html"],
  ["产品经理", "上海鸣志", 35, 45, "5-10年", "本科", "通用产品", "https://www.zhipin.com/job_detail/a92fd701a63a208a0nd92965EVJV.html"],
  ["AI产品经理", "上海软科", 20, 35, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/a46277d967a057fa0nBz29S9EFZT.html"],
  ["AI产品经理", "MobTech", 20, 28, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/4a5e8c92c86e29b40nd63di8FFRR.html"],
  ["AI产品经理", "在途商旅", 12, 20, "不限", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/306d001f442179db0nVy29W9EFpR.html"],
  ["AI产品经理", "毕毕", 10, 15, "1年以内", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/cfb52054c2d8c04203J_2t28E1BY.html"],
  ["AI产品经理", "声网", 25, 45, "经验不限", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/ee6f09619bac04f403d40tq1FVtX.html"],
  ["AI产品经理", "傲拓思", 20, 40, "1-3年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/d038398b116267120nZ53NS0F1JT.html"],
  ["AI产品经理", "行风", 20, 35, "5-10年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/5ca7a47c268ddcae0nd_39q0F1RR.html"],
  ["AI产品经理", "倍通数据集团", 15, 25, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/1707aba18d2b6ebf0nVz39-7E1BS.html"],
  ["AI产品经理", "恋之翼", 25, 40, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/964ab214710aaed503170t2_FlJS.html"],
  ["AI数据产品经理", "中科创达", 30, 35, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/62f6cb220a400f4a0nV52dy9EFdV.html"],
  ["AI数据产品经理", "澳鹏科技", 45, 75, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/306ecad862933f7b0nB83Ny8F1BV.html"],
  ["AI数据产品经理（专利方向）", "得物App", 25, 40, "1-3年", "本科", "数据产品", "https://www.zhipin.com/job_detail/927004d06bba563e0nZy3Ni1GVRW.html"],
  ["AI大模型数据产品经理（医药行业）", "八月瓜科技", 15, 20, "5-10年", "硕士", "数据产品", "https://www.zhipin.com/job_detail/fd70337e8928d438031-096_EVRZ.html"],
  ["AI数据分析产品经理", "循环智能", 25, 35, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/2d7567b7861c7ad50nB42dW0FFRX.html"],
  ["AI视频数据集开发产品经理", "慧神笔", 10, 15, "3-5年", "大专", "数据产品", "https://www.zhipin.com/job_detail/6bd79e6ed85dfbf90nd92tq_F1FS.html"],
  ["AI产品经理（工业大数据方向）", "优层智能科技", 15, 30, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/6938334976d829590nB42dW0FFFY.html"],
  ["AI产品经理（空间智能、三维数据方向）", "PKPM构力科技", 15, 20, "不限", "本科", "数据产品", "https://www.zhipin.com/job_detail/506fc0c9e3e9aec30nd63t68EVpS.html"],
  ["Code Agent训练产品经理-AI数据与安全", "字节跳动", 40, 70, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/a3aa3f32d04f64ca0nd_2tS1FVFQ.html"],
  ["数据AI产品经理", "上海即信数科", 20, 40, "5-10年", "本科", "数据产品", "https://www.zhipin.com/job_detail/7bff0025167e8bac0nd809i9E1pZ.html"],
  ["高级ai产品经理（AI医疗科研数据）", "北京京卫智云科技", 8, 12, "3-5年", "本科", "数据产品", "https://www.zhipin.com/job_detail/16549e098171e19d0nB73t20E1VU.html"],
  ["AI数据产品负责人", "上海掌之淘信息技术", 35, 60, "5-10年", "本科", "数据产品", "https://www.zhipin.com/job_detail/761072d2ebcc38fa0ndy2N69GFpS.html"],
  ["AI Agent产品经理（评测方向）", "锐捷网络", 25, 45, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/7802ce118c14ded40nF42Ni9FlpR.html"],
  ["ai产品经理", "梵住传媒", 16, 22, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/ccf87f34b93a92760ndz09q8FVBZ.html"],
  ["AI高级产品经理", "上海中城交科技", 30, 45, "5-10年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/0d0f9407cc6d617503Fz3dq4F1BQ.html"],
  ["AI及量化策略产品经理", "大智慧", 30, 50, "3-5年", "硕士", "AI / 大模型", "https://www.zhipin.com/job_detail/fd424840134151bc03B839u1FlRW.html"],
  ["AI产品经理（智能体方向）", "SenseTime", 20, 25, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/f4dd85f4b0f4b1930nVy2Ni7FlFV.html"],
  ["AI产品经理（线路规划方向）", "携程集团", 30, 60, "5-10年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/a408626aca496c49031529S4EVZR.html"],
  ["数据AI产品经理", "玛丽黛佳", 28, 35, "5-10年", "本科", "数据产品", "https://www.zhipin.com/job_detail/14b38d5cbb00697303B62N60F1BU.html"],
  ["ai产品经理", "葵铭", 18, 25, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/c6423190c51fbf1903R53Nu6FVVY.html"],
  ["AI产品经理", "深演智能", 25, 40, "3-5年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/bd03654d2db512f103R92t-_GVNZ.html"],
  ["AI产品经理", "上海福芮柚科技", 23, 35, "5-10年", "本科", "AI / 大模型", "https://www.zhipin.com/job_detail/3310b4168a1a15e503F439q4F1ZU.html"],
] as const;

const seededJobs: Job[] = shanghaiSeedRows.map((row, index) => {
  const [title, company, salaryMin, salaryMax, experience, education, track, url] = row;
  return {
    id: index + 1,
    title,
    company,
    city: "上海",
    salaryMin,
    salaryMax,
    experience,
    education,
    companySize: "公开页面未标注",
    industry: track === "AI / 大模型" ? "人工智能" : track === "数据产品" ? "互联网 / 数据" : "互联网",
    track,
    workMode: "线下",
    description: `来自 BOSS 公开上海职位摘要：${title}，围绕${track}方向负责产品规划、需求分析与落地。`,
    tags: [track, "上海", "产品经理"],
    postedAt: "公开页抓取",
    source: "BOSS直聘上海公开职位详情",
    url,
    status: "new",
  };
});

const defaultFilters: Filters = {
  search: "",
  cities: ["上海"],
  salaryMin: 15,
  experience: "不限",
  education: "不限",
  includeKeywords: "产品经理, AI, 数据, 增长",
  excludeKeywords: "外包, 兼职",
  track: "全部方向",
  workMode: "全部方式",
};

const DATA_VERSION = "product-manager-shanghai-2026-07-31-v5";

const cityOptions = ["上海"];
const trackOptions = ["全部方向", "AI / 大模型", "数据产品", "增长 / 用户", "商业化 / B端", "企业服务 / SaaS"];
const workModeOptions = ["全部方式", "线下", "远程"];

const splitKeywords = (value: string) =>
  value
    .split(/[,，\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

function getScore(job: Job, filters: Filters) {
  const haystack = `${job.title} ${job.description} ${job.tags.join(" ")}`.toLowerCase();
  const include = splitKeywords(filters.includeKeywords);
  const matched = include.filter((keyword) => haystack.includes(keyword));
  let score = 42;
  if (filters.cities.includes(job.city)) score += 14;
  if (job.salaryMin >= filters.salaryMin) score += 18;
  if (filters.track === "全部方向" || job.track === filters.track) score += 12;
  if (filters.workMode === "全部方式" || job.workMode === filters.workMode) score += 6;
  score += Math.min(24, matched.length * 12);
  if (job.title.toLowerCase().includes(filters.search.trim().toLowerCase())) score += 6;

  return {
    score: Math.min(98, score),
    matched,
  };
}

function parseJobText(text: string, nextId: number): Job {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const salary = text.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*[kK]/);
  const city = cityOptions.find((item) => text.includes(item)) || "待确认";
  const experience =
    ["应届生", "1年以内", "1-3年", "3-5年", "5-10年", "10年以上"].find((item) =>
      text.includes(item),
    ) || "不限";
  const education =
    ["博士", "硕士", "本科", "大专"].find((item) => text.includes(item)) || "不限";
  const commonTags = [
    "Python",
    "Java",
    "React",
    "Node.js",
    "AI",
    "RAG",
    "FastAPI",
    "Django",
    "SQL",
    "双休",
    "外包",
    "出差",
  ].filter((tag) => text.toLowerCase().includes(tag.toLowerCase()));

  return {
    id: nextId,
    title: lines[0] || "未命名职位",
    company: lines[1] || "待确认公司",
    city,
    salaryMin: salary ? Number(salary[1]) : 0,
    salaryMax: salary ? Number(salary[2]) : 0,
    experience,
    education,
    companySize: "待确认",
    industry: "待确认",
    track: "待确认",
    workMode: "待确认",
    source: "用户导入",
    description: lines.slice(2).join(" ") || "暂无职位描述",
    tags: commonTags.length ? commonTags : ["待整理"],
    postedAt: "刚刚导入",
    url: "https://www.zhipin.com/",
    status: "new",
  };
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>(seededJobs);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [sortBy, setSortBy] = useState<"score" | "salary">("score");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const savedVersion = window.localStorage.getItem("job-lens-data-version");
      const savedJobs = window.localStorage.getItem("job-lens-jobs");
      const savedFilters = window.localStorage.getItem("job-lens-filters");
      if (savedVersion === DATA_VERSION) {
        if (savedJobs) setJobs(JSON.parse(savedJobs));
        if (savedFilters) setFilters({ ...defaultFilters, ...JSON.parse(savedFilters) });
      } else {
        setJobs(seededJobs);
        setFilters(defaultFilters);
        window.localStorage.setItem("job-lens-data-version", DATA_VERSION);
      }
    } catch {
      // Keep the demo state when stored data is unavailable.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("job-lens-jobs", JSON.stringify(jobs));
    window.localStorage.setItem("job-lens-filters", JSON.stringify(filters));
    window.localStorage.setItem("job-lens-data-version", DATA_VERSION);
  }, [jobs, filters, hydrated]);

  const evaluatedJobs = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return jobs
      .map((job) => {
        const haystack =
          `${job.title} ${job.company} ${job.description} ${job.tags.join(" ")}`.toLowerCase();
        const { score, matched } = getScore(job, filters);
        return { ...job, score, matched, haystack };
      })
      .filter((job) => {
        const titleMatches = !search || job.title.toLowerCase().includes(search);
        const cityMatches = filters.cities.includes(job.city);
        const trackMatches = filters.track === "全部方向" || job.track === filters.track;
        return titleMatches && cityMatches && trackMatches;
      })
      .sort((a, b) =>
        sortBy === "score" ? b.score - a.score : b.salaryMax - a.salaryMax,
      );
  }, [jobs, filters, sortBy]);

  const matchingCount = evaluatedJobs.length;
  const viewedCount = jobs.filter((job) => job.status === "ignored").length;

  const toggleViewed = (id: number) => {
    setJobs((current) => current.map((job) =>
      job.id === id ? { ...job, status: job.status === "ignored" ? "new" : "ignored" } : job,
    ));
  };

  const toggleCity = (city: string) => {
    setFilters((current) => ({
      ...current,
      cities: current.cities.includes(city)
        ? current.cities.filter((item) => item !== city)
        : [...current.cities, city],
    }));
  };

  const handleImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!importText.trim()) return;
    const nextId = Math.max(0, ...jobs.map((job) => job.id)) + 1;
    const nextJob = parseJobText(importText, nextId);
    setJobs((current) => [nextJob, ...current]);
    setImportText("");
    setImportOpen(false);
    setNotice(`已导入「${nextJob.title}」`);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const resetDemo = () => {
    setJobs(seededJobs);
    setFilters(defaultFilters);
    setNotice("最新岗位样本已恢复");
    window.setTimeout(() => setNotice(""), 2600);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="职位雷达首页">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>职位雷达</span>
        </a>
        <div className="topbar-actions">
          <span className="storage-note">
            <span className="status-dot" />
            数据仅存于当前浏览器
          </span>
          <button className="button button-secondary mobile-filter" onClick={() => setFiltersOpen(true)}>
            筛选
          </button>
          <button className="button button-primary" onClick={() => setImportOpen(true)}>
            <span aria-hidden="true">＋</span>
            导入职位
          </button>
        </div>
      </header>

      <div className="workspace" id="top">
        <aside className={`filter-panel ${filtersOpen ? "is-open" : ""}`}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">MY SEARCH</p>
              <h2>筛选条件</h2>
            </div>
            <button
              className="icon-button close-filter"
              onClick={() => setFiltersOpen(false)}
              aria-label="关闭筛选条件"
            >
              ×
            </button>
          </div>

          <label className="field">
            <span>搜索职位或公司</span>
            <span className="search-input">
              <span aria-hidden="true">⌕</span>
              <input
                value={filters.search}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, search: event.target.value }))
                }
                placeholder="例如 Python、AI 应用"
              />
            </span>
          </label>

          <fieldset className="field">
            <legend>目标城市</legend>
            <div className="choice-grid">
              {cityOptions.map((city) => (
                <label className="check-choice" key={city}>
                  <input
                    type="checkbox"
                    checked={filters.cities.includes(city)}
                    onChange={() => toggleCity(city)}
                  />
                  <span>{city}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="field">
            <span>产品方向</span>
            <select
              value={filters.track}
              onChange={(event) =>
                setFilters((current) => ({ ...current, track: event.target.value }))
              }
            >
              {trackOptions.map((track) => <option key={track}>{track}</option>)}
            </select>
          </label>

          <div className="panel-foot">
            <p>修改后自动应用筛选</p>
            <button className="text-button" onClick={resetDemo}>
              恢复抓取样本
            </button>
          </div>
        </aside>

        {filtersOpen && (
          <button
            className="filter-backdrop"
            onClick={() => setFiltersOpen(false)}
            aria-label="关闭筛选条件"
          />
        )}

        <section className="content">
          <div className="hero">
            <div>
              <p className="eyebrow">YOUR JOB PIPELINE</p>
              <h1>
                今天有 <em>{matchingCount}</em> 个职位值得看
              </h1>
              <p>公开可见的产品经理岗位样本，默认只看上海，可按方向和岗位名称快速收窄。</p>
            </div>
            <div className="metric-row" aria-label="职位统计">
              <div className="metric">
                <strong>{jobs.length}</strong>
                <span>全部职位</span>
              </div>
              <div className="metric metric-green">
                <strong>{matchingCount}</strong>
                <span>符合条件</span>
              </div>
              <div className="metric">
                <strong>{viewedCount}</strong>
                <span>已看（灰显）</span>
              </div>
              <div className="metric">
                <strong>上海</strong>
                <span>当前城市</span>
              </div>
            </div>
          </div>

          <div className="list-toolbar">
            <p>
              显示 <strong>{evaluatedJobs.length}</strong> 个结果 · 数据更新于 2026-07-31
            </p>
            <label>
              排序
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as "score" | "salary")}>
                <option value="score">匹配度优先</option>
                <option value="salary">最高薪资优先</option>
              </select>
            </label>
          </div>

          <div className="job-list">
            {evaluatedJobs.map((job) => {
              const isViewed = job.status === "ignored";
              return (
                <article className={`job-card ${isViewed ? "is-rejected" : ""}`} key={job.id}>
                  <div className="job-main">
                    <div className="job-title-row">
                      <div>
                        <div className="job-title-line">
                          <h3>{job.title}</h3>
                        </div>
                    <p className="company-line">
                          {job.company}
                          <span>·</span>
                          {job.industry}
                        <span>·</span>
                        {job.companySize}
                        <span>·</span>
                        {job.track}
                        </p>
                      </div>
                      <div className="salary">
                        {job.salaryMax ? `${job.salaryMin}–${job.salaryMax}K` : "薪资待确认"}
                        <small>· 14薪</small>
                      </div>
                    </div>

                    <div className="job-meta">
                      <span>⌖ {job.city}</span>
                      <span>◷ {job.experience}</span>
                      <span>▱ {job.education}</span>
                      <span>更新于 {job.postedAt}</span>
                    </div>

                    <p className="job-description">{job.description}</p>

                    <div className="tag-row">
                      {job.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    <p className="source-line">来源：{job.source}</p>
                  </div>

                  <div className="score-panel">
                    <div className={`score-ring ${isViewed ? "score-muted" : ""}`}>
                      <strong>{isViewed ? "✓" : job.score}</strong>
                      <span>{isViewed ? "已看" : "匹配度"}</span>
                    </div>
                    <div className="match-reason">
                      {isViewed ? (
                        <p>
                          <span className="reason-dot reason-muted" />
                          已标记，点击可恢复
                        </p>
                      ) : (
                        <>
                          <p>
                            <span className="reason-dot" />
                            城市和薪资符合
                          </p>
                          <p>
                            <span className="reason-dot" />
                            {job.track} · 命中 {job.matched.length || 0} 个关键词
                          </p>
                        </>
                      )}
                    </div>
                    <div className="card-actions">
                      <a className="button button-ghost" href={job.url} target="_blank" rel="noreferrer">
                        打开 BOSS 详情 ↗
                      </a>
                      <button
                        className="button button-secondary"
                        onClick={() => toggleViewed(job.id)}
                        aria-label={`${isViewed ? "恢复" : "标记已看"} ${job.title}`}
                      >
                        {isViewed ? "恢复显示" : "标记已看"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {!evaluatedJobs.length && (
            <div className="empty-state">
              <span aria-hidden="true">◎</span>
              <h3>没有找到对应职位</h3>
              <p>试试减少筛选条件，或导入一条新的职位信息。</p>
            </div>
          )}

          <footer className="site-foot">
            <span>职位雷达 · 个人求职整理工具</span>
            <span>请仅导入你有权使用的信息</span>
          </footer>
        </section>
      </div>

      {importOpen && (
        <div className="modal-wrap" role="presentation" onMouseDown={() => setImportOpen(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">IMPORT A JOB</p>
                <h2 id="import-title">导入职位信息</h2>
              </div>
              <button className="icon-button" onClick={() => setImportOpen(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <p className="modal-help">
              从你有权访问的页面复制职位名称、公司和描述。系统会识别城市、薪资、经验和关键词。
            </p>
            <form onSubmit={handleImport}>
              <label className="field">
                <span>职位文本</span>
                <textarea
                  autoFocus
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder={"AI 产品工程师\n某某科技\n上海 · 25-35K · 3-5年 · 本科\n负责 Python、FastAPI 和 RAG 应用开发"}
                  rows={8}
                />
              </label>
              <div className="import-tip">
                <strong>格式提示</strong>
                <span>第一行职位名，第二行公司，其余内容作为职位描述。</span>
              </div>
              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => setImportOpen(false)}>
                  取消
                </button>
                <button type="submit" className="button button-primary" disabled={!importText.trim()}>
                  解析并导入
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
