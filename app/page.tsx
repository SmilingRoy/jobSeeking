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
};

const initialJobs: Job[] = [
  {
    id: 1,
    title: "AI 应用开发工程师",
    company: "云杉智能",
    city: "上海",
    salaryMin: 25,
    salaryMax: 40,
    experience: "3-5年",
    education: "本科",
    companySize: "100-499人",
    industry: "人工智能",
    description:
      "负责 AI 产品后端与工作流开发，使用 Python、FastAPI、LangChain，参与 RAG 应用落地。",
    tags: ["Python", "FastAPI", "RAG", "双休"],
    postedAt: "今天",
    url: "https://www.zhipin.com/",
    status: "new",
  },
  {
    id: 2,
    title: "Python 后端开发",
    company: "元启科技",
    city: "上海",
    salaryMin: 20,
    salaryMax: 30,
    experience: "3-5年",
    education: "本科",
    companySize: "20-99人",
    industry: "企业服务",
    description:
      "负责内部数据平台开发，技术栈为 Python、Django、PostgreSQL，需要有数据处理经验。",
    tags: ["Python", "Django", "PostgreSQL"],
    postedAt: "1天前",
    url: "https://www.zhipin.com/",
    status: "saved",
  },
  {
    id: 3,
    title: "全栈工程师",
    company: "跃迁网络",
    city: "杭州",
    salaryMin: 22,
    salaryMax: 35,
    experience: "3-5年",
    education: "本科",
    companySize: "100-499人",
    industry: "互联网",
    description:
      "参与数据产品从 0 到 1 建设，前端 React，后端 Node.js，有 Python 经验优先。",
    tags: ["React", "Node.js", "Python"],
    postedAt: "2天前",
    url: "https://www.zhipin.com/",
    status: "applied",
  },
  {
    id: 4,
    title: "数据开发工程师",
    company: "象限数据",
    city: "深圳",
    salaryMin: 18,
    salaryMax: 28,
    experience: "1-3年",
    education: "大专",
    companySize: "500-999人",
    industry: "大数据",
    description:
      "负责离线数据任务开发与维护，熟悉 SQL、Spark、Airflow，接受一定频率出差。",
    tags: ["SQL", "Spark", "出差"],
    postedAt: "3天前",
    url: "https://www.zhipin.com/",
    status: "new",
  },
  {
    id: 5,
    title: "高级后端工程师",
    company: "北辰软件",
    city: "北京",
    salaryMin: 30,
    salaryMax: 45,
    experience: "5-10年",
    education: "本科",
    companySize: "1000-9999人",
    industry: "软件服务",
    description:
      "负责核心平台架构设计，要求 Java 微服务经验，熟悉高并发系统和团队管理。",
    tags: ["Java", "微服务", "团队管理"],
    postedAt: "4天前",
    url: "https://www.zhipin.com/",
    status: "interview",
  },
];

const defaultFilters: Filters = {
  search: "",
  cities: ["上海", "杭州"],
  salaryMin: 20,
  experience: "不限",
  education: "不限",
  includeKeywords: "Python, AI",
  excludeKeywords: "外包, 出差",
};

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

const cityOptions = ["上海", "杭州", "北京", "深圳", "广州", "远程"];

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
      const savedJobs = window.localStorage.getItem("job-lens-jobs");
      const savedFilters = window.localStorage.getItem("job-lens-filters");
      if (savedJobs) setJobs(JSON.parse(savedJobs));
      if (savedFilters) setFilters(JSON.parse(savedFilters));
    } catch {
      // Keep the demo state when stored data is unavailable.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("job-lens-jobs", JSON.stringify(jobs));
    window.localStorage.setItem("job-lens-filters", JSON.stringify(filters));
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
          excluded.some((keyword) => haystack.includes(keyword)) ? "排除词" : "",
        ].filter(Boolean);

        return { ...job, score, matched, rejectedBy };
      })
      .filter((job) => {
        const haystack = `${job.title} ${job.company} ${job.tags.join(" ")}`.toLowerCase();
        const searchMatches = !search || haystack.includes(search);
        const statusMatches = activeStatus === "all" || job.status === activeStatus;
        return searchMatches && statusMatches;
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
              恢复示例
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
              <p>根据你的条件自动去重、筛选并解释匹配原因。</p>
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
              显示 <strong>{evaluatedJobs.length}</strong> 个结果
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
                            命中 {job.matched.length || 0} 个关键词
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
