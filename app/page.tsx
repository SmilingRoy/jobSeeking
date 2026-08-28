"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import jobsPayload from "../data/jobs.json";
import { loadPersisted, loadUserStates, normalizeJob, persistDataset, updateUserState, USER_STATUSES } from "./job-workbench.mjs";

type Recommendation = "优先推荐" | "可以考虑" | "谨慎评估" | "不推荐" | "信息不足";
type UserStatus = "未查看" | "已查看" | "候选" | "已投递" | "忽略";
type Job = ReturnType<typeof normalizeJob> & { recommendation: Recommendation };

type Filters = {
  search: string;
  recommendation: "全部结论" | Recommendation;
  direction: string;
  minimumScore: number;
  userStatus: "全部状态" | UserStatus;
  verification: "全部验证状态" | string;
};

const bundledPayload = jobsPayload as { metadata?: Record<string, unknown>; jobs: Array<Record<string, unknown>> };
const bundledJobs = bundledPayload.jobs.map(normalizeJob) as Job[];
const recommendationOrder: Recommendation[] = ["优先推荐", "可以考虑", "谨慎评估", "信息不足", "不推荐"];
const defaultFilters: Filters = { search: "", recommendation: "全部结论", direction: "全部方向", minimumScore: 0, userStatus: "全部状态", verification: "全部验证状态" };

function labelVerification(status: string) {
  return { captured_jd: "完整 JD", needs_review: "待复核", unverified_index_snapshot: "公开索引待验证" }[status] ?? status;
}

function displayValue(value: unknown) {
  if (value == null || value === "" || value === "unknown") return "未知";
  return String(value);
}

function riskText(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const risk = value as Record<string, unknown>;
    return [risk.reason, risk.evidence].filter(Boolean).join("：") || JSON.stringify(risk);
  }
  return String(value);
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>(bundledJobs);
  const [userStates, setUserStates] = useState<Record<string, UserStatus>>({});
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  useEffect(() => {
    const restoreLocalState = window.setTimeout(() => {
      setJobs(loadPersisted(window.localStorage, bundledPayload).jobs as Job[]);
      setUserStates(loadUserStates(window.localStorage) as Record<string, UserStatus>);
    }, 0);
    return () => window.clearTimeout(restoreLocalState);
  }, []);

  const statusFor = (jobId: string) => userStates[jobId] ?? "未查看";
  const setStatus = (jobId: string, status: UserStatus) => setUserStates((current) => updateUserState(window.localStorage, current, jobId, status) as Record<string, UserStatus>);
  const openJob = (job: Job) => {
    if (statusFor(job.id) === "未查看") setStatus(job.id, "已查看");
    setSelectedJob(job);
  };

  const directions = useMemo(() => ["全部方向", ...Array.from(new Set(jobs.flatMap((job) => job.directions))).filter(Boolean).sort()], [jobs]);
  const filteredJobs = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return jobs.filter((job) => {
      const status = userStates[job.id] ?? "未查看";
      return (!query || `${job.title} ${job.company} ${job.description}`.toLowerCase().includes(query))
        && (filters.recommendation === "全部结论" || job.recommendation === filters.recommendation)
        && (filters.direction === "全部方向" || job.directions.includes(filters.direction))
        && (filters.minimumScore === 0 || (job.score ?? -1) >= filters.minimumScore)
        && (filters.userStatus === "全部状态" || status === filters.userStatus)
        && (filters.verification === "全部验证状态" || job.verification_status === filters.verification);
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [filters, jobs, userStates]);
  const counts = useMemo(() => Object.fromEntries(recommendationOrder.map((label) => [label, jobs.filter((job) => job.recommendation === label).length])), [jobs]);
  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const replacement = persistDataset(window.localStorage, JSON.parse(await file.text()));
      setJobs(replacement.jobs as Job[]);
      setSelectedJob(null);
      setImportMessage(`已校验并替换为 ${replacement.jobs.length} 条岗位；个人状态按稳定岗位 ID 保留。`);
    } catch (error) {
      setImportMessage(`导入失败，原数据未改变：${error instanceof Error ? error.message : "未知错误"}`);
    }
    event.target.value = "";
  };

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark"><span /></span><span>职位雷达</span></a><div className="topbar-actions"><span className="data-note"><span className="status-dot" />上海 · {jobs.length} 个岗位</span><label className="button button-secondary import-button">导入并替换 JSON<input type="file" accept="application/json,.json" onChange={handleImport} /></label></div></header>
    {importMessage && <div className="import-message" role="status">{importMessage}</div>}
    <section className="hero" id="top"><div><p className="eyebrow">JOB LENS · DECISION WORKBENCH</p><h1>把值得投递的岗位，<em>筛出来。</em></h1><p className="hero-copy">证据、置信度、匹配理由与个人决策状态彼此分离；公开索引不会显示虚假分数。</p></div><div className="hero-stat"><strong>{filteredJobs.length}</strong><span>当前结果</span></div></section>
    <section className="metric-row">{recommendationOrder.map((label) => <button key={label} className={`metric metric-${label}`} onClick={() => updateFilter("recommendation", label)}><strong>{counts[label] ?? 0}</strong><span>{label}</span></button>)}</section>
    <div className="workspace">
      <aside className={`filter-panel ${mobileFiltersOpen ? "is-open" : ""}`}><div className="panel-heading"><div><p className="eyebrow">FILTERS</p><h2>筛选岗位</h2></div><button className="close-filter" onClick={() => setMobileFiltersOpen(false)} aria-label="关闭筛选">×</button></div>
        <label className="field"><span>搜索岗位或公司</span><input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="例如：增长、电商、字节" /></label>
        <label className="field"><span>推荐结论</span><select value={filters.recommendation} onChange={(event) => updateFilter("recommendation", event.target.value as Filters["recommendation"])}><option>全部结论</option>{recommendationOrder.map((label) => <option key={label}>{label}</option>)}</select></label>
        <label className="field"><span>个人状态</span><select value={filters.userStatus} onChange={(event) => updateFilter("userStatus", event.target.value as Filters["userStatus"])}><option>全部状态</option>{USER_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="field"><span>验证状态</span><select value={filters.verification} onChange={(event) => updateFilter("verification", event.target.value)}><option>全部验证状态</option><option value="captured_jd">完整 JD</option><option value="needs_review">待复核</option><option value="unverified_index_snapshot">公开索引待验证</option></select></label>
        <label className="field"><span>产品方向</span><select value={filters.direction} onChange={(event) => updateFilter("direction", event.target.value)}>{directions.map((direction) => <option key={direction}>{direction}</option>)}</select></label>
        <label className="field"><span>最低匹配分：{filters.minimumScore || "不限"}</span><input type="range" min="0" max="100" step="5" value={filters.minimumScore} onChange={(event) => updateFilter("minimumScore", Number(event.target.value))} /></label>
        <button className="reset-button" onClick={() => setFilters(defaultFilters)}>清除筛选</button>
      </aside>
      <section className="results-panel"><div className="results-toolbar"><div><p className="eyebrow">MATCHED JOBS</p><h2>岗位池 <span>{filteredJobs.length}</span></h2></div><button className="mobile-filter-button" onClick={() => setMobileFiltersOpen(true)}>筛选</button></div><div className="job-list">
        {filteredJobs.map((job) => { const status = statusFor(job.id); return <article className={`job-card ${status !== "未查看" ? "is-viewed" : ""}`} key={job.id}>
          <div className="job-card-head"><div><div className="job-title-line"><h3>{job.title}</h3><span className={`recommendation recommendation-${job.recommendation}`}>{job.recommendation}</span><span className={`verification verification-${job.verification_status}`}>{labelVerification(job.verification_status)}</span></div><p className="company-line">{job.company}</p></div><div className="score">{job.score === null ? "—" : job.score}<small>分</small></div></div>
          <div className="confidence-row"><span>证据置信度</span><strong>{job.evidence_confidence === null ? "未计算" : `${Math.round(job.evidence_confidence * 100)}%`}</strong><span className="user-status">{status}</span></div>
          <div className="job-meta"><span>{job.city}{job.district !== "unknown" ? ` · ${job.district}` : ""}</span><span>{job.salary}</span><span>{job.workExperience}</span></div>
          <div className="tag-row">{(job.directions.length ? job.directions : ["方向待补充"]).map((tag: string) => <span className="tag" key={tag}>{tag}</span>)}</div><p className="job-summary">{job.description}</p>
          <div className="card-actions"><select aria-label={`${job.title} 个人状态`} value={status} onChange={(event) => setStatus(job.id, event.target.value as UserStatus)}>{USER_STATUSES.map((option) => <option key={option}>{option}</option>)}</select><button className="button button-ghost" onClick={() => openJob(job)}>查看详情</button><a className="button button-primary" href={job.url} target="_blank" rel="noreferrer" onClick={() => status === "未查看" && setStatus(job.id, "已查看")}>前往 BOSS ↗</a></div>
        </article>; })}
        {!filteredJobs.length && <div className="empty-state"><strong>没有符合条件的岗位</strong><span>试试清除筛选，或导入通过统一合同校验的岗位 JSON。</span><button className="button button-ghost" onClick={() => setFilters(defaultFilters)}>清除筛选</button></div>}
      </div></section>
    </div>
    {selectedJob && <div className="drawer-backdrop" role="presentation" onMouseDown={() => setSelectedJob(null)}><aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="岗位详情" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setSelectedJob(null)} aria-label="关闭详情">×</button><p className="eyebrow">JOB EVIDENCE</p><div className="drawer-title"><div><h2>{selectedJob.title}</h2><p>{selectedJob.company}</p></div><div className={`drawer-score recommendation-${selectedJob.recommendation}`}>{selectedJob.score === null ? "—" : selectedJob.score}<small>分</small></div></div>
      <div className="drawer-recommendation">{selectedJob.recommendation} · {labelVerification(selectedJob.verification_status)} · 置信度 {selectedJob.evidence_confidence === null ? "未计算" : `${Math.round(selectedJob.evidence_confidence * 100)}%`}</div>
      <div className="drawer-meta"><span>{selectedJob.city} · {displayValue(selectedJob.district)}</span><span>{selectedJob.salary}</span><span>采集：{selectedJob.pipeline}</span><span>评分：{selectedJob.scoring_config_version}</span></div>
      <section className="drawer-section"><h3>推荐证据</h3><ul>{(selectedJob.positive_evidence.length ? selectedJob.positive_evidence : ["暂无足够正向证据"]).map((item: string) => <li key={item}>{item}</li>)}</ul></section>
      <section className="drawer-section"><h3>岗位职责</h3><p>{displayValue(selectedJob.responsibilities)}</p></section><section className="drawer-section"><h3>任职要求</h3><p>{displayValue(selectedJob.requirements)}</p></section>
      <section className="drawer-section"><h3>风险与复核</h3><ul>{[...selectedJob.risk_flags.map(riskText), ...selectedJob.review_reasons, ...selectedJob.hard_filter_reasons].map((item: string) => <li key={item}>{item}</li>)}{!selectedJob.risk_flags.length && !selectedJob.review_reasons.length && !selectedJob.hard_filter_reasons.length && <li>暂无明确风险；未知信息不等于负面。</li>}</ul></section>
      <section className="drawer-section"><h3>缺失信息</h3><div className="tag-row">{(selectedJob.missing_information.length ? selectedJob.missing_information : ["无"]).map((item: string) => <span className="tag tag-fit" key={item}>{item}</span>)}</div></section>
      <section className="drawer-section"><h3>评分分项</h3><div className="score-components">{selectedJob.score_components.map((item: Record<string, unknown>) => <div key={String(item.dimension)}><span>{String(item.dimension)}</span><strong>{String(item.classification)}</strong><small>{item.points == null ? "证据未知" : `${item.points}/${item.weight}`}</small></div>)}{!selectedJob.score_components.length && <p>尚未运行匹配策略 v2。</p>}</div></section>
      <div className="drawer-actions"><a className="button button-primary" href={selectedJob.url} target="_blank" rel="noreferrer">打开 BOSS 投递页 ↗</a></div></aside></div>}
  </main>;
}
