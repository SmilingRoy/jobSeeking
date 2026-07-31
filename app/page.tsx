"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type JobStatus = "new" | "saved" | "applied" | "interview" | "ignored";

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
    status: "saved",
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
    status: "applied",
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
    status: "interview",
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
    url: "https://www.zhipin.com/zhaopin/90089f4c8f066b020XBy39i8/",
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

const DATA_VERSION = "product-manager-2026-07-31-v2";

const statusOptions: { value: JobStatus; label: string }[] = [
  { value: "new", label: "待查看" },
  { value: "saved", label: "已收藏" },
  { value: "applied", label: "已投递" },
  { value: "interview", label: "面试中" },
  { value: "ignored", label: "不合适" },
];

const statusLabels: Record<JobStatus, string> = {
  new: "待查看",
  saved: "已收藏",
  applied: "已投递",
  interview: "面试中",
  ignored: "不合适",
};

const cityOptions = ["北京", "上海", "杭州", "深圳", "广州", "佛山", "苏州"];
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
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [activeStatus, setActiveStatus] = useState<JobStatus | "all">("all");
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
        setJobs(initialJobs);
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
    const excluded = splitKeywords(filters.excludeKeywords);

    return jobs
      .map((job) => {
        const haystack =
          `${job.title} ${job.company} ${job.description} ${job.tags.join(" ")}`.toLowerCase();
        const { score, matched } = getScore(job, filters);
        const rejectedBy = [
          filters.cities.length && !filters.cities.includes(job.city) ? "城市" : "",
          job.salaryMax > 0 && job.salaryMax < filters.salaryMin ? "薪资" : "",
          filters.track !== "全部方向" && job.track !== filters.track ? "方向" : "",
          filters.workMode !== "全部方式" && job.workMode !== filters.workMode ? "方式" : "",
          excluded.some((keyword) => haystack.includes(keyword)) ? "排除词" : "",
        ].filter(Boolean);

        return { ...job, score, matched, rejectedBy };
      })
      .filter((job) => {
        const haystack = `${job.title} ${job.company} ${job.tags.join(" ")}`.toLowerCase();
        const searchMatches = !search || haystack.includes(search);
        const statusMatches = activeStatus === "all" || job.status === activeStatus;
        const experienceMatches = filters.experience === "不限" || job.experience === filters.experience;
        const educationMatches = filters.education === "不限" || job.education === filters.education;
        return searchMatches && statusMatches && experienceMatches && educationMatches;
      })
      .sort((a, b) =>
        sortBy === "score" ? b.score - a.score : b.salaryMax - a.salaryMax,
      );
  }, [jobs, filters, activeStatus, sortBy]);

  const matchingCount = evaluatedJobs.filter((job) => job.rejectedBy.length === 0).length;
  const savedCount = jobs.filter((job) => job.status === "saved").length;
  const appliedCount = jobs.filter((job) =>
    ["applied", "interview"].includes(job.status),
  ).length;

  const updateJobStatus = (id: number, status: JobStatus) => {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, status } : job)));
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
    setJobs(initialJobs);
    setFilters(defaultFilters);
    setActiveStatus("all");
    setNotice("示例数据已恢复");
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

          <label className="field salary-field">
            <span>
              最低月薪 <strong>{filters.salaryMin}K</strong>
            </span>
            <input
              type="range"
              min="10"
              max="50"
              step="2"
              value={filters.salaryMin}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  salaryMin: Number(event.target.value),
                }))
              }
            />
            <span className="range-labels">
              <small>10K</small>
              <small>50K+</small>
            </span>
          </label>

          <label className="field">
            <span>工作经验</span>
            <select
              value={filters.experience}
              onChange={(event) =>
                setFilters((current) => ({ ...current, experience: event.target.value }))
              }
            >
              <option>不限</option>
              <option>1-3年</option>
              <option>3-5年</option>
              <option>5-10年</option>
            </select>
          </label>

          <label className="field">
            <span>学历要求</span>
            <select
              value={filters.education}
              onChange={(event) =>
                setFilters((current) => ({ ...current, education: event.target.value }))
              }
            >
              <option>不限</option>
              <option>大专</option>
              <option>本科</option>
              <option>硕士</option>
            </select>
          </label>

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

          <label className="field">
            <span>工作方式</span>
            <select
              value={filters.workMode}
              onChange={(event) =>
                setFilters((current) => ({ ...current, workMode: event.target.value }))
              }
            >
              {workModeOptions.map((mode) => <option key={mode}>{mode}</option>)}
            </select>
          </label>

          <label className="field">
            <span>偏好关键词</span>
            <input
              value={filters.includeKeywords}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  includeKeywords: event.target.value,
                }))
              }
              placeholder="逗号分隔"
            />
          </label>

          <label className="field">
            <span>排除关键词</span>
            <input
              value={filters.excludeKeywords}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  excludeKeywords: event.target.value,
                }))
              }
              placeholder="例如 外包、出差"
            />
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
              <p>已更新一批公开可见的“产品经理”岗位，按方向、城市、薪资和经验筛选。</p>
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
                <strong>{savedCount}</strong>
                <span>已收藏</span>
              </div>
              <div className="metric">
                <strong>{appliedCount}</strong>
                <span>投递进展</span>
              </div>
            </div>
          </div>

          <nav className="job-tabs" aria-label="职位状态筛选">
            <button
              className={activeStatus === "all" ? "active" : ""}
              onClick={() => setActiveStatus("all")}
            >
              全部
              <span>{jobs.length}</span>
            </button>
            {statusOptions.slice(0, 4).map((status) => (
              <button
                key={status.value}
                className={activeStatus === status.value ? "active" : ""}
                onClick={() => setActiveStatus(status.value)}
              >
                {status.label}
                <span>{jobs.filter((job) => job.status === status.value).length}</span>
              </button>
            ))}
          </nav>

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
              const isRejected = job.rejectedBy.length > 0;
              return (
                <article className={`job-card ${isRejected ? "is-rejected" : ""}`} key={job.id}>
                  <div className="job-main">
                    <div className="job-title-row">
                      <div>
                        <div className="job-title-line">
                          <h3>{job.title}</h3>
                          <span className={`status-tag status-${job.status}`}>
                            {statusLabels[job.status]}
                          </span>
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
                    <div className={`score-ring ${isRejected ? "score-muted" : ""}`}>
                      <strong>{isRejected ? "—" : job.score}</strong>
                      <span>{isRejected ? "已过滤" : "匹配度"}</span>
                    </div>
                    <div className="match-reason">
                      {isRejected ? (
                        <p>
                          <span className="reason-dot reason-muted" />
                          不符合：{job.rejectedBy.join("、")}
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
                        查看原职位 ↗
                      </a>
                      <select
                        value={job.status}
                        onChange={(event) => updateJobStatus(job.id, event.target.value as JobStatus)}
                        aria-label={`更新 ${job.title} 的状态`}
                      >
                        {statusOptions.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
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
