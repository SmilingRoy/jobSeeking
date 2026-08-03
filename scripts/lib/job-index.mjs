const UNKNOWN = "unknown";

const evaluationUnknown = Object.freeze({
  title_fit: "unknown",
  city_fit: "unknown",
  direction_fit: "unknown",
  product_form_fit: "unknown",
  product_layer_fit: "unknown",
  financing_fit: "unknown",
  responsibility_fit: "unknown",
  role_fit: "unknown",
  experience_fit: "unknown",
  company_quality: "unknown",
  freshness_fit: "unknown",
  mandatory_requirement_fit: "unknown",
  team_quality: "unknown",
  work_mode_fit: "unknown",
  growth_value: "unknown"
});

const directionKeywords = [
  ["用户增长", ["用户增长", "增长产品"]],
  ["用户产品", ["用户产品", "C端", "C 端"]],
  ["交易", ["交易", "订单"]],
  ["履约", ["履约", "售后"]],
  ["本地生活", ["本地生活"]],
  ["LBS", ["LBS", "地图"]],
  ["出行", ["出行"]],
  ["策略", ["策略产品"]],
  ["AI应用", ["AI应用", "AI 应用", "AI产品"]],
  ["电商", ["电商"]]
];

const districtNames = [
  "浦东新区", "浦东", "黄浦区", "黄浦", "静安区", "静安", "徐汇区", "徐汇",
  "长宁区", "长宁", "普陀区", "普陀", "虹口区", "虹口", "杨浦区", "杨浦",
  "闵行区", "闵行", "宝山区", "宝山", "嘉定区", "嘉定", "金山区", "金山",
  "松江区", "松江", "青浦区", "青浦", "奉贤区", "奉贤", "崇明区", "崇明"
];

export function decodeEntities(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function normalizeText(value = "") {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

export function canonicalizeBossUrl(input) {
  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "zhipin.com" && !hostname.endsWith(".zhipin.com")) return null;
    url.protocol = "https:";
    url.hostname = "www.zhipin.com";
    url.port = "";
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    return url.toString();
  } catch {
    return null;
  }
}

export function classifyBossUrl(input) {
  const canonicalUrl = canonicalizeBossUrl(input);
  if (!canonicalUrl) return { type: "unsupported", canonicalUrl: null, jobId: null };
  const pathname = new URL(canonicalUrl).pathname;
  const jobMatch = pathname.match(/^\/job_detail\/([^/]+?)\.html\/?$/i);
  if (jobMatch) return { type: "job_detail", canonicalUrl, jobId: jobMatch[1] };
  if (/^\/zhaopin\//i.test(pathname)) return { type: "listing", canonicalUrl, jobId: null };
  return { type: "other_boss", canonicalUrl, jobId: null };
}

export function extractFacts(title, description) {
  const evidence = normalizeText(`${title} ${description}`);
  const salary = evidence.match(/(?:\d+(?:\.\d+)?-\d+(?:\.\d+)?K(?:·\d+薪)?|\d+-\d+元\/(?:时|天))/i)?.[0] ?? UNKNOWN;
  const experience = evidence.match(/(?:经验不限|在校生|应届生|1年以内|1-3年|3-5年|5-10年|10年以上)/)?.[0] ?? UNKNOWN;
  const education = evidence.match(/(?:学历不限|初中及以下|中专\/中技|高中|大专|本科|硕士|博士)/)?.[0] ?? UNKNOWN;
  const district = districtNames.find((name) => evidence.includes(name)) ?? UNKNOWN;
  const tags = directionKeywords
    .filter(([, variants]) => variants.some((keyword) => evidence.toLowerCase().includes(keyword.toLowerCase())))
    .map(([tag]) => tag);
  return { evidence, salary, experience, education, district, tags };
}

function unknownJobFields() {
  return {
    company_name: UNKNOWN,
    office_location: UNKNOWN,
    company_size: UNKNOWN,
    financing_stage: UNKNOWN,
    industry: UNKNOWN,
    recruiter_name: UNKNOWN,
    recruiter_role: UNKNOWN,
    recruiter_activity: UNKNOWN,
    published_or_updated_at: UNKNOWN,
    job_description_raw: UNKNOWN,
    responsibility_summary: UNKNOWN,
    qualification_summary: UNKNOWN,
    product_form_tags: [],
    product_layer_tags: [],
    role_type: UNKNOWN,
    team_and_reporting: UNKNOWN,
    work_mode: UNKNOWN,
    travel_requirement: UNKNOWN,
    positive_evidence: [],
    risk_flags: [],
    interview_questions: []
  };
}

export function normalizeIndexedResult(result, context) {
  const title = normalizeText(result.title);
  const description = normalizeText([
    result.description,
    ...(Array.isArray(result.extra_snippets) ? result.extra_snippets : [])
  ].filter(Boolean).join(" "));
  const urlInfo = classifyBossUrl(result.url);
  if (urlInfo.type === "unsupported" || urlInfo.type === "other_boss") {
    return { kind: "rejected", reason: "unsupported_url" };
  }

  const facts = extractFacts(title, description);
  if (!facts.evidence.includes("产品经理")) {
    return { kind: "rejected", reason: "title_not_product_manager" };
  }
  if (!facts.evidence.includes("上海")) {
    return { kind: "rejected", reason: "city_not_confirmed_shanghai" };
  }

  const indexEvidence = {
    provider: context.provider,
    query: context.query,
    query_mode: context.mode,
    result_rank: context.rank,
    result_title: title,
    result_description: description,
    verification_status: "unverified_index_snapshot"
  };

  if (urlInfo.type === "listing") {
    return {
      kind: "listing",
      value: {
        url: urlInfo.canonicalUrl,
        title,
        city: "上海",
        first_seen_at: context.collectedAt,
        last_seen_at: context.collectedAt,
        seen_count: 1,
        index_evidence: indexEvidence
      }
    };
  }

  const missingInformation = [
    "岗位当前开放状态", "完整JD", "公司信息", "办公地点", "发布时间", "招聘者信息"
  ];
  return {
    kind: "job",
    value: {
      job_id: urlInfo.jobId,
      job_url: urlInfo.canonicalUrl,
      collected_at: context.collectedAt,
      first_seen_at: context.collectedAt,
      last_seen_at: context.collectedAt,
      seen_count: 1,
      job_status: UNKNOWN,
      job_title: title || UNKNOWN,
      ...unknownJobFields(),
      city: "上海",
      district: facts.district,
      salary_range: facts.salary,
      experience_requirement: facts.experience,
      education_requirement: facts.education,
      product_direction_tags: facts.tags,
      missing_information: missingInformation,
      evaluation: {
        ...evaluationUnknown,
        title_fit: "preferred",
        city_fit: "match",
        direction_fit: facts.tags.length > 0 ? "priority" : "unknown"
      },
      index_evidence: indexEvidence
    }
  };
}

export function processSearchBatches(batches, options) {
  const jobs = new Map();
  const listings = new Map();
  const rejectionCounts = {};
  let rawResultCount = 0;
  let duplicateCount = 0;

  for (const batch of batches) {
    const results = Array.isArray(batch.results) ? batch.results : [];
    for (const [index, result] of results.entries()) {
      rawResultCount += 1;
      const normalized = normalizeIndexedResult(result, {
        provider: options.provider,
        query: batch.query,
        mode: batch.mode,
        rank: index + 1,
        collectedAt: options.collectedAt
      });
      if (normalized.kind === "rejected") {
        rejectionCounts[normalized.reason] = (rejectionCounts[normalized.reason] ?? 0) + 1;
        continue;
      }
      const collection = normalized.kind === "job" ? jobs : listings;
      const key = normalized.kind === "job" ? normalized.value.job_id : normalized.value.url;
      if (collection.has(key)) {
        duplicateCount += 1;
        const existing = collection.get(key);
        existing.index_evidence_all ??= [existing.index_evidence];
        existing.index_evidence_all.push(normalized.value.index_evidence);
        continue;
      }
      collection.set(key, normalized.value);
    }
  }

  return {
    jobs: [...jobs.values()],
    discovery_pages: [...listings.values()],
    stats: { rawResultCount, duplicateCount, rejectionCounts }
  };
}

function mergeRecord(existing, incoming) {
  if (!existing) return incoming;
  const allEvidence = [
    ...(existing.index_evidence_all ?? [existing.index_evidence].filter(Boolean)),
    ...(incoming.index_evidence_all ?? [incoming.index_evidence].filter(Boolean))
  ];
  return {
    ...existing,
    ...incoming,
    first_seen_at: existing.first_seen_at ?? incoming.first_seen_at,
    last_seen_at: incoming.last_seen_at,
    seen_count: (existing.seen_count ?? 1) + 1,
    index_evidence_all: allEvidence
  };
}

export function mergeHistory(previous, current) {
  const jobs = new Map((previous?.jobs ?? []).map((job) => [job.job_id || job.job_url, job]));
  for (const job of current.jobs) jobs.set(job.job_id || job.job_url, mergeRecord(jobs.get(job.job_id || job.job_url), job));
  const pages = new Map((previous?.discovery_pages ?? []).map((page) => [page.url, page]));
  for (const page of current.discovery_pages) pages.set(page.url, mergeRecord(pages.get(page.url), page));
  return { jobs: [...jobs.values()], discovery_pages: [...pages.values()] };
}

export function buildQueryPlan(config, options = {}) {
  const terms = options.terms?.length ? options.terms : config.terms;
  const allowedModes = options.modes?.length ? new Set(options.modes) : null;
  const modes = config.modes.filter((mode) => !allowedModes || allowedModes.has(mode.id));
  const districts = options.districtShards ? ["", ...(config.district_shards ?? [])] : [""];
  const plan = [];
  for (const term of terms) {
    for (const mode of modes) {
      for (const district of districts) {
        plan.push({
          term,
          district: district || "全市",
          mode: mode.id,
          query: mode.template
            .replaceAll("{city}", config.city)
            .replaceAll("{district}", district)
            .replaceAll("{term}", term)
            .replace(/\s+/g, " ")
            .trim()
        });
      }
    }
  }
  return options.queryLimit ? plan.slice(0, options.queryLimit) : plan;
}
