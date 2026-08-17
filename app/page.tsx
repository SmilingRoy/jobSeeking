"use client";

import { ChangeEvent, useMemo, useState } from "react";
import jobsPayload from "../data/jobs.json";

type Recommendation = "优先推荐" | "可以考虑" | "谨慎评估" | "不推荐" | "信息不足";
type Fit = "高" | "中" | "低" | "unknown";

type Job = {
  id: string;
  url: string;
  title: string;
  company: string;
  city: string;
  district: string;
  office_location: string;
  salary: string;
  workExperience: string;
  education: string;
  company_size: string;
  financing_stage: string;
  industry: string;
  recruiter_name: string;
  recruiter_role: string;
  recruiter_activity: string;
  description: string;
  job_description_raw: string;
  responsibilities: string;
  requirements: string;
  tags: string[];
  collected_at: string;
  recommendation: Recommendation;
  score: number | null;
  directions: string[];
  responsibility_fit: Fit;
  title_fit: Fit;
  card_screenshot?: string;
  detail_screenshots?: string[];
};

type Filters = {
  search: string;
  recommendation: "全部结论" | Recommendation;
  direction: string;
  minimumScore: number;
  responsibilityFit: "全部匹配度" | Fit;
  titleFit: "全部匹配度" | Fit;
};

const sourceJobs = (jobsPayload.jobs ?? []) as Array<Record<string, unknown>>;
const initialJobs: Job[] = sourceJobs.map((job) => ({
  id: String(job.id ?? job.job_id ?? "unknown"),
  url: String(job.url ?? job.job_url ?? ""),
  title: String(job.title ?? job.job_title ?? "unknown"),
  company: String(job.company ?? job.company_name ?? "unknown"),
  city: String(job.city ?? "上海"),
  district: String(job.district ?? "unknown"),
  office_location: String(job.office_location ?? "unknown"),
  salary: String(job.salary ?? job.salary_range ?? "unknown"),
  workExperience: String(job.workExperience ?? job.experience_requirement ?? "unknown"),
  education: String(job.education ?? job.education_requirement ?? "unknown"),
  company_size: String(job.company_size ?? "unknown"),
  financing_stage: String(job.financing_stage ?? "unknown"),
  industry: String(job.industry ?? "unknown"),
  recruiter_name: String(job.recruiter_name ?? "unknown"),
  recruiter_role: String(job.recruiter_role ?? "unknown"),
  recruiter_activity: String(job.recruiter_activity ?? "unknown"),
  description: String(job.description ?? job.job_description_raw ?? "待补充 JD 信息"),
  job_description_raw: String(job.job_description_raw ?? "待补充 JD 信息"),
  responsibilities: String(job.responsibilities ?? "待补充 JD 信息"),
  requirements: String(job.requirements ?? "待补充 JD 信息"),
  tags: Array.isArray(job.tags) ? (job.tags as string[]) : [],
  collected_at: String(job.collected_at ?? "unknown"),
  recommendation: job.recommendation === "待补充 JD 信息" ? "信息不足" : ((job.recommendation as Recommendation) ?? "信息不足"),
  score: typeof job.score === "number" ? job.score : null,
  directions: Array.isArray(job.directions) ? (job.directions as string[]) : [],
  responsibility_fit: (job.responsibility_fit as Fit) ?? "unknown",
  title_fit: (job.title_fit as Fit) ?? "unknown",
  card_screenshot: typeof job.card_screenshot === "string" ? job.card_screenshot : undefined,
  detail_screenshots: Array.isArray(job.detail_screenshots) ? (job.detail_screenshots as string[]) : [],
}));

const defaultFilters: Filters = {
  search: "",
  recommendation: "全部结论",
  direction: "全部方向",
  minimumScore: 0,
  responsibilityFit: "全部匹配度",
  titleFit: "全部匹配度",
};

const recommendationOrder: Recommendation[] = ["优先推荐", "可以考虑", "谨慎评估", "信息不足", "不推荐"];

function formatDate(value: string) {
  if (!value || value === "unknown") return "未知";
  return value.slice(0, 10);
}

function matchesFit(value: Fit, filter: Filters["responsibilityFit"]) {
  return filter === "全部匹配度" || value === filter;
}

export default function Home() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const directions = useMemo(() => {
    const values = new Set(initialJobs.flatMap((job) => job.directions));
    return ["全部方向", ...Array.from(values).filter(Boolean).sort()];
  }, []);

  const filteredJobs = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return initialJobs
      .filter((job) => {
        const matchesSearch = !query || `${job.title} ${job.company} ${job.description}`.toLowerCase().includes(query);
        const matchesRecommendation = filters.recommendation === "全部结论" || job.recommendation === filters.recommendation;
        const matchesDirection = filters.direction === "全部方向" || job.directions.includes(filters.direction);
        const matchesScore = filters.minimumScore === 0 || (job.score ?? 0) >= filters.minimumScore;
        return matchesSearch && matchesRecommendation && matchesDirection && matchesScore && matchesFit(job.responsibility_fit, filters.responsibilityFit) && matchesFit(job.title_fit, filters.titleFit);
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [filters]);

  const counts = useMemo(() => recommendationOrder.reduce<Record<string, number>>((acc, label) => {
    acc[label] = initialJobs.filter((job) => job.recommendation === label).length;
    return acc;
  }, {}), []);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const resetFilters = () => setFilters(defaultFilters);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    // Import is intentionally a preview-only MVP hook; a future build will validate
    // and persist a new normalized jobs.json through the offline pipeline.
    try {
      const payload = JSON.parse(await file.text()) as { jobs?: unknown[] };
      alert(`已读取 ${Array.isArray(payload.jobs) ? payload.jobs.length : 0} 条岗位。下一版将支持校验后替换数据集。`);
    } catch {
      alert("文件不是有效的岗位 JSON。");
    }
    event.target.value = "";
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark"><span /></span><span>职位雷达</span></a>
        <div className="topbar-actions">
          <span className="data-note"><span className="status-dot" />上海 · {initialJobs.length} 个岗位</span>
          <label className="button button-secondary import-button">导入 JSON<input type="file" accept="application/json,.json" onChange={handleImport} /></label>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">JOB LENS · SHANGHAI PM</p>
          <h1>把值得投递的岗位，<em>筛出来。</em></h1>
          <p className="hero-copy">统一查看已获取的上海产品经理岗位，用方向、匹配度和评分快速缩小投递范围。</p>
        </div>
        <div className="hero-stat"><strong>{filteredJobs.length}</strong><span>当前结果</span></div>
      </section>

      <section className="metric-row">
        {recommendationOrder.map((label) => <button key={label} className={`metric metric-${label}`} onClick={() => updateFilter("recommendation", label)}><strong>{counts[label] ?? 0}</strong><span>{label}</span></button>)}
      </section>

      <div className="workspace">
        <aside className={`filter-panel ${mobileFiltersOpen ? "is-open" : ""}`}>
          <div className="panel-heading"><div><p className="eyebrow">FILTERS</p><h2>筛选岗位</h2></div><button className="close-filter" onClick={() => setMobileFiltersOpen(false)} aria-label="关闭筛选">×</button></div>
          <label className="field"><span>搜索岗位或公司</span><input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="例如：增长、电商、字节" /></label>
          <label className="field"><span>推荐结论</span><select value={filters.recommendation} onChange={(event) => updateFilter("recommendation", event.target.value as Filters["recommendation"])}><option>全部结论</option>{recommendationOrder.map((label) => <option key={label}>{label}</option>)}</select></label>
          <label className="field"><span>产品大方向</span><select value={filters.direction} onChange={(event) => updateFilter("direction", event.target.value)}>{directions.map((direction) => <option key={direction}>{direction}</option>)}</select></label>
          <label className="field"><span>最低评分：{filters.minimumScore || "不限"}</span><input type="range" min="0" max="100" step="5" value={filters.minimumScore} onChange={(event) => updateFilter("minimumScore", Number(event.target.value))} /></label>
          <label className="field"><span>职责匹配度</span><select value={filters.responsibilityFit} onChange={(event) => updateFilter("responsibilityFit", event.target.value as Filters["responsibilityFit"])}><option>全部匹配度</option><option>高</option><option>中</option><option>低</option><option>unknown</option></select></label>
          <label className="field"><span>岗位名称匹配度</span><select value={filters.titleFit} onChange={(event) => updateFilter("titleFit", event.target.value as Filters["titleFit"])}><option>全部匹配度</option><option>高</option><option>中</option><option>低</option><option>unknown</option></select></label>
          <button className="reset-button" onClick={resetFilters}>清除筛选</button>
        </aside>

        <section className="results-panel">
          <div className="results-toolbar"><div><p className="eyebrow">MATCHED JOBS</p><h2>岗位池 <span>{filteredJobs.length}</span></h2></div><button className="mobile-filter-button" onClick={() => setMobileFiltersOpen(true)}>筛选</button></div>
          <div className="job-list">
            {filteredJobs.map((job) => <article className="job-card" key={job.id}>
              <div className="job-card-head"><div><div className="job-title-line"><h3>{job.title}</h3><span className={`recommendation recommendation-${job.recommendation}`}>{job.recommendation}</span></div><p className="company-line">{job.company}</p></div><div className="score">{job.score === null ? "—" : job.score}<small>分</small></div></div>
              <div className="job-meta"><span>{job.city}{job.district !== "unknown" ? ` · ${job.district}` : ""}</span><span>{job.salary}</span><span>{job.workExperience}</span><span>{job.education}</span></div>
              <div className="tag-row">{(job.directions.length ? job.directions : ["方向待补充"]).map((tag) => <span className="tag" key={tag}>{tag}</span>)}<span className="tag tag-fit">职责 {job.responsibility_fit}</span><span className="tag tag-fit">名称 {job.title_fit}</span></div>
              <p className="job-summary">{job.description}</p>
              <div className="card-actions"><button className="button button-ghost" onClick={() => setSelectedJob(job)}>查看详情</button><a className="button button-primary" href={job.url} target="_blank" rel="noreferrer">前往 BOSS ↗</a></div>
            </article>)}
            {!filteredJobs.length && <div className="empty-state"><strong>没有符合条件的岗位</strong><span>试试清除筛选，或换一个方向关键词。</span><button className="button button-ghost" onClick={resetFilters}>清除筛选</button></div>}
          </div>
        </section>
      </div>

      {selectedJob && <div className="drawer-backdrop" role="presentation" onMouseDown={() => setSelectedJob(null)}><aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="岗位详情" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" onClick={() => setSelectedJob(null)} aria-label="关闭详情">×</button><p className="eyebrow">JOB DETAIL</p><div className="drawer-title"><div><h2>{selectedJob.title}</h2><p>{selectedJob.company}</p></div><div className={`drawer-score recommendation-${selectedJob.recommendation}`}>{selectedJob.score === null ? "—" : selectedJob.score}<small>分</small></div></div><div className="drawer-recommendation">{selectedJob.recommendation} · 产品方向：{selectedJob.directions.length ? selectedJob.directions.join(" / ") : "待补充"}</div><div className="drawer-meta"><span>{selectedJob.city} · {selectedJob.district}</span><span>{selectedJob.salary}</span><span>{selectedJob.workExperience}</span><span>{selectedJob.education}</span></div><section className="drawer-section"><h3>岗位职责</h3><p>{selectedJob.responsibilities}</p></section><section className="drawer-section"><h3>任职要求</h3><p>{selectedJob.requirements}</p></section><section className="drawer-section"><h3>岗位信息</h3><dl><div><dt>行业</dt><dd>{selectedJob.industry}</dd></div><div><dt>公司规模</dt><dd>{selectedJob.company_size}</dd></div><div><dt>融资阶段</dt><dd>{selectedJob.financing_stage}</dd></div><div><dt>采集时间</dt><dd>{formatDate(selectedJob.collected_at)}</dd></div></dl></section><div className="drawer-actions"><a className="button button-primary" href={selectedJob.url} target="_blank" rel="noreferrer">打开 BOSS 投递页 ↗</a></div></aside></div>}
    </main>
  );
}
