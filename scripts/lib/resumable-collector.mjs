import { readJsonIfExists, writeJsonAtomic } from "./atomic-json.mjs";

function batchKey(item, page) {
  return JSON.stringify([item.mode, item.query, page]);
}

export function collectorSignature(plan, options) {
  return JSON.stringify({
    provider: options.provider,
    pages: options.pages,
    count: options.count,
    plan: plan.map(({ mode, query }) => ({ mode, query })),
  });
}

export async function collectPlan(plan, options) {
  const signature = collectorSignature(plan, options);
  const stored = options.resume
    ? await readJsonIfExists(options.checkpointPath)
    : null;
  const canResume = stored?.signature === signature && stored.completed !== true;
  const batches = canResume && Array.isArray(stored.batches) ? [...stored.batches] : [];
  const completed = new Map(
    batches.map((batch) => [batchKey(batch, batch.page), batch]),
  );
  let requestCount = 0;
  let resumedBatchCount = canResume ? batches.length : 0;
  let lastRequestAt = 0;

  const persist = async (isCompleted) => {
    await writeJsonAtomic(options.checkpointPath, {
      version: 1,
      signature,
      completed: isCompleted,
      updated_at: new Date().toISOString(),
      batches,
    });
  };

  for (const item of plan) {
    for (let page = 0; page < options.pages; page += 1) {
      const key = batchKey(item, page);
      let batch = completed.get(key);
      if (!batch) {
        const elapsed = options.now() - lastRequestAt;
        if (lastRequestAt > 0 && elapsed < options.delayMs) {
          await options.sleep(options.delayMs - elapsed);
        }
        const pageResult = await options.searchPage(item.query, page);
        lastRequestAt = options.now();
        requestCount += 1;
        batch = {
          ...item,
          page,
          results: pageResult.results,
          moreResultsAvailable: pageResult.moreResultsAvailable,
        };
        batches.push(batch);
        completed.set(key, batch);
        await persist(false);
      }

      const results = Array.isArray(batch.results) ? batch.results : [];
      if (batch.moreResultsAvailable !== true || results.length < options.count) break;
    }
  }

  await persist(true);
  return { batches, requestCount, resumedBatchCount };
}
