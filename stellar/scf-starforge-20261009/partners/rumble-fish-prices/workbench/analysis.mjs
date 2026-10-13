import { clone, GRANULARITY_SECONDS, identifierFromCatalog, isObject } from './contract.mjs';

export function freshness(price, { now = Date.now(), freshnessSeconds = 7200 } = {}) {
  const epoch = typeof price?.as_of === 'string' && price.as_of ? Date.parse(price.as_of) : NaN;
  const ageSeconds = Number.isFinite(epoch) ? Math.max(0, Math.floor((now - epoch) / 1000)) : null;
  return { ageSeconds, freshness: price?.price_status === 'unpriced' ? 'unpriced' : ageSeconds === null ? 'unknown' : ageSeconds <= freshnessSeconds ? 'within_target' : 'older_than_target' };
}
function counts(rows, field) { const out = {}; for (const row of rows) { const value = row[field] === null || row[field] === undefined || row[field] === '' ? 'unspecified' : String(row[field]); out[value] = (out[value] ?? 0) + 1; } return out; }

export function historySummary(data) {
  const rows = data.data; let gaps = 0, emptyBucketIntervals = 0, invalidTimestamps = 0; const seconds = GRANULARITY_SECONDS[data.granularity];
  let previous = null;
  for (const row of rows) {
    const epoch = Date.parse(row.timestamp); if (!Number.isFinite(epoch)) { invalidTimestamps++; continue; }
    if (previous !== null) {
      let distance;
      if (data.granularity === '1M') { const a = new Date(previous), b = new Date(epoch); distance = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth(); }
      else distance = seconds ? Math.round((epoch - previous) / (seconds * 1000)) : 1;
      if (distance > 1) { gaps++; emptyBucketIntervals += distance - 1; }
    }
    previous = epoch;
  }
  return {
    asset: data.asset, granularity: data.granularity, base_currency: data.base_currency,
    rows: rows.length, pricedRows: rows.filter(row => row.close !== null && row.close !== undefined).length, nullPriceRows: rows.filter(row => row.close === null).length,
    derivedRows: rows.filter(row => row.derived === true).length, divergentRows: rows.filter(row => row.close_divergent === true).length,
    noPriceFormingTradeRows: rows.filter(row => row.pf_trade_count === 0).length,
    firstTimestamp: rows[0]?.timestamp ?? null, lastTimestamp: rows.at(-1)?.timestamp ?? null, gapsBetweenReturnedBuckets: gaps, emptyBucketIntervals,
    methodCounts: counts(rows, 'method'), qualityCounts: counts(rows, 'quality'), sourceCounts: counts(rows, 'source'), invalidTimestamps,
    ...(data.backfill_note ? { backfill_note: data.backfill_note } : {}),
  };
}

export function summarizeResponse(task, data, { receivedAt, freshnessSeconds = 7200 } = {}) {
  const context = { now: receivedAt ? Date.parse(receivedAt) : Date.now(), freshnessSeconds };
  if (task.kind === 'catalog') return { rows: data.data.map(row => ({ ...clone(row), identifier: identifierFromCatalog(row), ...freshness(row, context) })), cursor: data.cursor, hasMore: data.has_more, receivedAt, filters: Object.fromEntries(Object.entries(task.request.query).filter(([key]) => key !== 'cursor')) };
  if (task.kind === 'price') return { ...clone(data), ...freshness(data, context) };
  if (task.kind === 'batch') return { prices: data.prices.map(row => ({ ...clone(row), ...freshness(row, context) })), notFound: [...data.not_found] };
  if (task.kind === 'history') return historySummary(data);
  if (task.kind === 'coverage' || task.kind === 'oracles' || task.kind === 'detail' || task.kind === 'health') return clone(data);
  return null;
}

export function planSummary(plan) { return { id: plan.id, planId: plan.id, name: plan.name, kind: plan.kind, createdAt: plan.createdAt, requestCount: plan.requestCount, requestMaximum: plan.requestMaximum, notices: plan.notices, specification: clone(plan.specification) }; }
export function runSummary(run) {
  return {
    id: run.id, planId: run.planId, name: run.name, kind: run.kind, status: run.status, createdAt: run.createdAt, updatedAt: run.updatedAt, finishedAt: run.finishedAt ?? null,
    completedCount: run.tasks.filter(task => task.state === 'COMPLETE').length, errorCount: run.tasks.filter(task => task.state === 'ERROR').length, attemptCount: run.tasks.reduce((sum, task) => sum + task.attempts.length, 0),
    taskCount: run.tasks.length, nextRequestAt: run.nextRequestAt ?? null, lastIssue: run.lastIssue ?? null,
    tasks: run.tasks.map(task => ({ id: task.id, kind: task.kind, ...(task.asset ? { asset: task.asset } : {}), state: task.state, page: task.page, window: task.window, windows: task.windows, attemptCount: task.attempts.length, status: task.attempts.at(-1)?.status ?? null, receivedAt: task.attempts.at(-1)?.receivedAt ?? null, hasResponse: task.attempts.some(attempt => Boolean(attempt.response)), summary: task.summary ? (task.kind === 'catalog' ? { rows: task.summary.rows.length, hasMore: task.summary.hasMore, cursor: task.summary.cursor } : task.kind === 'batch' ? { prices: task.summary.prices.length, notFound: task.summary.notFound } : clone(task.summary)) : null })),
  };
}

export function projectWorkspace(runs, { now = Date.now(), freshnessSeconds = 7200 } = {}) {
  const ordered = [...runs].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
  const prices = new Map(), histories = new Map(), details = new Map(), oracles = new Map(); let coverage = null, catalog = null;
  let workspaceAttempts = 0, monthAttempts = 0; const month = new Date(now).toISOString().slice(0, 7);
  for (const run of ordered) {
    const catalogRows = new Map(); let catalogTail = null;
    for (const task of run.tasks) {
      workspaceAttempts += task.attempts.length; monthAttempts += task.attempts.filter(attempt => attempt.startedAt?.startsWith(month)).length;
      if (!task.summary || task.state !== 'COMPLETE') continue;
      const latest = task.attempts.at(-1); const reference = { runId: run.id, taskId: task.id, receivedAt: latest?.receivedAt ?? null };
      if (task.kind === 'catalog') { for (const [index, row] of task.summary.rows.entries()) catalogRows.set(row.identifier ?? `${task.id}:${index}`, { ...clone(row), ...freshness(row, { now, freshnessSeconds }), ...reference }); catalogTail = { ...reference, cursor: task.summary.cursor, hasMore: task.summary.hasMore, filters: clone(task.summary.filters) }; }
      if (task.kind === 'price' || task.kind === 'batch') for (const row of task.kind === 'price' ? [task.summary] : task.summary.prices) prices.set(row.asset, { ...clone(row), ...freshness(row, { now, freshnessSeconds }), ...reference });
      if (task.kind === 'history') { const key = `${task.summary.asset}\n${task.summary.base_currency}\n${task.summary.granularity}\n${task.request.query.start}\n${task.request.query.end}`; histories.set(key, { ...clone(task.summary), ...reference, request: clone(task.request), window: task.window, windows: task.windows }); }
      if (task.kind === 'detail') details.set(task.summary.asset, { ...clone(task.summary), ...reference });
      if (task.kind === 'oracles') oracles.set(task.summary.asset, { ...clone(task.summary), ...reference });
      if (task.kind === 'coverage') coverage = { data: clone(task.summary), ...reference };
    }
    if (catalogTail) catalog = { rows: [...catalogRows.values()], ...catalogTail };
  }
  return { catalog, prices: [...prices.values()], histories: [...histories.values()], details: [...details.values()], oracles: [...oracles.values()], coverage, usage: { workspaceAttempts, month, monthAttempts, monthlyProviderLimit: 100000, scope: 'this workspace' } };
}

function csvCell(value) { if (value === null || value === undefined) return ''; let string = typeof value === 'object' ? JSON.stringify(value) : String(value); if (/^\s*[=+@-]/u.test(string) && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(string)) string = "'" + string; return '"' + string.replaceAll('"', '""') + '"'; }
const priceFields = ['asset', 'price_usd', 'price_xlm', 'vwap_24h', 'volume_24h_usd', 'change_24h_pct', 'as_of', 'updated_at', 'price_status', 'price_basis', 'method', 'sources'];
const candleFields = ['timestamp', 'open', 'high', 'low', 'close', 'volume_base', 'volume_quote_usd', 'vwap', 'trade_count', 'pf_trade_count', 'pf_vwap', 'close_divergent', 'method', 'derived', 'source', 'quality'];
export function responseCsv(task, data) {
  let fields, rows;
  if (task.kind === 'history') { fields = ['asset', 'granularity', 'base_currency', ...candleFields]; rows = data.data.map(row => ({ asset: data.asset, granularity: data.granularity, base_currency: data.base_currency, ...row })); }
  else if (task.kind === 'price') { fields = priceFields; rows = [data]; }
  else if (task.kind === 'batch') { fields = ['result', ...priceFields]; rows = [...data.prices.map(row => ({ result: 'price', ...row })), ...data.not_found.map(asset => ({ result: 'not_found', asset }))]; }
  else if (task.kind === 'catalog') { fields = ['identifier', 'asset_code', 'asset_type', 'issuer_address', 'contract_address', 'home_domain', ...priceFields.filter(field => field !== 'asset'), 'change_7d_pct']; rows = data.data.map(row => ({ identifier: identifierFromCatalog(row), ...row })); }
  else if (task.kind === 'oracles') { fields = ['asset', 'name', 'price_usd', 'updated_at']; rows = data.oracles.map(row => ({ asset: data.asset, ...row })); }
  else if (task.kind === 'coverage') { fields = ['realtime_tip_ledger', 'stream', 'status', 'current_ledger', 'start_ledger', 'target_ledger', 'progress_pct', 'ledgers_remaining', 'last_push_at', 'completed_at', 'earliest_data_available']; rows = ['sdex', 'soroban_amm'].filter(stream => isObject(data[stream])).map(stream => ({ realtime_tip_ledger: data.realtime_tip_ledger, stream, ...data[stream] })); if (!rows.length) rows = [{ realtime_tip_ledger: data.realtime_tip_ledger }]; }
  else { fields = Object.keys(data ?? {}); rows = isObject(data) ? [data] : [{ value: data }]; }
  return fields.map(csvCell).join(',') + '\r\n' + rows.map(row => fields.map(field => csvCell(row[field])).join(',')).join('\r\n') + (rows.length ? '\r\n' : '');
}
