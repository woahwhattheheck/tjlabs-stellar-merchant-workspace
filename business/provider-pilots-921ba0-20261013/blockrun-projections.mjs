// SPDX-License-Identifier: MIT
// Read-only projections of captured BlockRun account responses. No network, signing or payment.
function need(ok, code) {
  if (!ok) { const error = new TypeError(code); error.code = code; throw error; }
}
function object(value, code) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  return value;
}
function text(value, code, maximum = 256) {
  need(typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value), code);
  return value;
}
function nullableText(value, code) { return value === undefined || value === null ? null : text(value, code); }
function instant(value, code) {
  text(value, code, 32);
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,3}))?Z$/.exec(value);
  need(match, code);
  const normalized = match[1] + '.' + (match[2] || '').padEnd(3, '0') + 'Z';
  const time = Date.parse(normalized);
  need(Number.isFinite(time) && new Date(time).toISOString() === normalized, code);
  return normalized;
}
function day(value) {
  text(value, 'INVALID_UNAVAILABLE_DAY', 10);
  need(/^\d{4}-\d\d-\d\d$/.test(value) &&
    instant(value + 'T00:00:00Z', 'INVALID_UNAVAILABLE_DAY').slice(0, 10) === value,
    'INVALID_UNAVAILABLE_DAY');
  return value;
}
function integer(value, code) {
  need(typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && value.length <= 128, code);
  return value;
}
function cursor(value) {
  if (value === null) return null;
  return text(value, 'INVALID_CURSOR', 8192);
}
function canonical(value) {
  return Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' :
    value && typeof value === 'object' ? '{' + Object.keys(value).sort()
      .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
}

/** Keep every JSON number as its original decimal token, including exponents. */
export function parseBlockrunResponse(raw) {
  need(typeof raw === 'string' && raw.length > 0 && raw.length <= 4 * 1024 * 1024, 'INVALID_RESPONSE_TEXT');
  JSON.parse(raw); // Validate the complete original JSON before the token-preserving pass.
  const pieces = [];
  let offset = 0, start = 0;
  while (offset < raw.length) {
    if (raw[offset] === '"') {
      offset++;
      while (offset < raw.length) {
        if (raw[offset] === '\\') { offset += 2; continue; }
        if (raw[offset++] === '"') break;
      }
    } else if (raw[offset] === '-' || raw[offset] >= '0' && raw[offset] <= '9') {
      pieces.push(raw.slice(start, offset));
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(offset));
      need(match, 'INVALID_NUMBER_TOKEN');
      pieces.push(JSON.stringify(match[0]));
      offset += match[0].length;
      start = offset;
    } else offset++;
  }
  pieces.push(raw.slice(start));
  return JSON.parse(pieces.join(''));
}
function decimal(value, code = 'INVALID_USD_AMOUNT') {
  need(typeof value === 'string' && value.length <= 256, code);
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  need(match, code);
  const exponent = match[4] ? Number(match[4]) : 0;
  need(Number.isSafeInteger(exponent) && Math.abs(exponent) <= 256, code);
  const fraction = match[3] || '';
  let coefficient = BigInt(match[2] + fraction) * (match[1] ? -1n : 1n);
  let scale = fraction.length - exponent;
  if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0; }
  return { coefficient, scale };
}
function add(left, right) {
  const scale = Math.max(left.scale, right.scale);
  return { coefficient: left.coefficient * 10n ** BigInt(scale - left.scale) +
    right.coefficient * 10n ** BigInt(scale - right.scale), scale };
}
function format(value) {
  const negative = value.coefficient < 0n;
  const digits = (negative ? -value.coefficient : value.coefficient).toString().padStart(value.scale + 1, '0');
  const result = value.scale ? (digits.slice(0, -value.scale) + '.' + digits.slice(-value.scale))
    .replace(/0+$/, '').replace(/\.$/, '') : digits;
  return (negative ? '-' : '') + result;
}
function selection(input) {
  object(input, 'INVALID_CAPTURE_SELECTION');
  const accountReference = text(input.accountReference, 'INVALID_ACCOUNT_REFERENCE', 128);
  const keyReference = text(input.keyReference, 'INVALID_KEY_REFERENCE', 128);
  need(!accountReference.startsWith('brk_live_') && !keyReference.startsWith('brk_live_'),
    'USE_LOCAL_REFERENCES_NOT_API_KEYS');
  const from = instant(input.from, 'INVALID_WINDOW_START');
  const to = instant(input.to, 'INVALID_WINDOW_END');
  need(from < to && Date.parse(to) - Date.parse(from) <= 400 * 86400000, 'INVALID_WINDOW_LENGTH');
  need(Number.isSafeInteger(input.limit) && input.limit >= 1 && input.limit <= 500, 'INVALID_PAGE_LIMIT');
  return { accountReference, keyReference, from, to, limit: input.limit };
}
function requestUrl(selected, next, summary = false) {
  return 'https://api.blockrun.ai/v1/usage' + (summary ? '/summary' : '') +
    '?from=' + encodeURIComponent(selected.from) + '&to=' + encodeURIComponent(selected.to) +
    (summary ? '' : '&limit=' + selected.limit + (next === null ? '' : '&cursor=' + encodeURIComponent(next)));
}
/** Plan only; the caller retains its existing authenticated transport and original key. */
export function planBlockrunUsageCapture(input, nextCursor = null) {
  const selected = selection(input);
  const next = cursor(nextCursor);
  return { selection: selected, method: 'GET', url: requestUrl(selected, next), cursor: next };
}
function unavailable(value) {
  need(Array.isArray(value), 'MISSING_UNAVAILABLE_DAYS');
  return value.map(day);
}
function originalResponse(input, expectedUrl, selected) {
  object(input, 'INVALID_RESPONSE_CAPTURE');
  need(input.status === 200 && input.requestUrl === expectedUrl, 'CAPTURE_REQUEST_MISMATCH');
  const capturedAt = instant(input.capturedAt, 'INVALID_CAPTURE_TIME');
  need(capturedAt >= selected.to, 'CAPTURE_END_IS_IN_THE_FUTURE');
  return { capturedAt, body: object(parseBlockrunResponse(input.responseText), 'INVALID_PROVIDER_RESPONSE') };
}
function row(input) {
  object(input, 'INVALID_USAGE_ROW');
  const requestId = text(input.request_id, 'MISSING_REQUEST_ID');
  const timestamp = instant(input.timestamp, 'INVALID_ROW_TIME');
  const endpoint = text(input.endpoint, 'MISSING_ROW_ENDPOINT', 2048);
  need(endpoint.startsWith('/'), 'INVALID_ROW_ENDPOINT');
  const correctionOf = nullableText(input.correction_of, 'INVALID_CORRECTION_REFERENCE');
  need(correctionOf !== requestId, 'SELF_CORRECTION_REFERENCE');
  const jobId = nullableText(input.job_id, 'INVALID_JOB_ID');
  const costState = text(input.cost_state, 'MISSING_COST_STATE');
  need(['priced', 'free', 'pending'].includes(costState), 'UNKNOWN_COST_STATE');
  const amount = input.cost_usd === null || input.cost_usd === undefined ? null : decimal(input.cost_usd);
  need(costState === 'pending' || amount !== null, 'FINAL_ROW_MISSING_COST');
  need(costState !== 'free' || amount.coefficient === 0n, 'FREE_ROW_HAS_NONZERO_COST');
  const status = integer(input.status, 'INVALID_ROW_STATUS');
  need(BigInt(status) >= 100n && BigInt(status) <= 599n, 'INVALID_ROW_STATUS');
  return {
    requestId, timestamp, endpoint, model: nullableText(input.model, 'INVALID_MODEL'),
    jobId, jobStatus: nullableText(input.job_status, 'INVALID_JOB_STATUS'), correctionOf,
    kind: text(input.kind, 'MISSING_ROW_KIND'), status: Number(status), costState,
    reportedUsd: amount === null ? null : format(amount), amount, original: input
  };
}
function balance(capture, selected) {
  if (capture === undefined || capture === null) return null;
  const value = originalResponse(capture, 'https://api.blockrun.ai/v1/credits', selected);
  const body = value.body;
  need(body.object === 'credit_balance' && body.currency === 'USD', 'INVALID_CREDIT_RESPONSE');
  need(['prepaid', 'postpaid', 'ungated'].includes(body.billing_mode), 'UNKNOWN_ACCOUNT_BILLING_MODE');
  need(typeof body.blocked === 'boolean', 'MISSING_ACCOUNT_BLOCKED');
  return {
    accountId: text(body.account_id, 'MISSING_ACCOUNT_ID'), capturedAt: value.capturedAt,
    billingMode: body.billing_mode, blocked: body.blocked,
    blockedReason: nullableText(body.blocked_reason, 'INVALID_BLOCKED_REASON'),
    grantedUsd: format(decimal(body.granted_usd)), spentUsd: format(decimal(body.spent_usd)),
    remainingUsd: body.remaining_usd === null ? null : format(decimal(body.remaining_usd)),
    remainingInterpretation: body.remaining_usd === null ? 'UNLIMITED' : 'PROVIDER_REPORTED_AMOUNT',
    admissionAuthority: 'ORIGINAL_PROVIDER_BLOCKED_FIELD'
  };
}
function summary(capture, selected) {
  if (capture === undefined || capture === null) return null;
  const value = originalResponse(capture, requestUrl(selected, null, true), selected);
  const body = value.body;
  need(body.object === 'usage_summary', 'INVALID_SUMMARY_OBJECT');
  const window = object(body.window, 'MISSING_SUMMARY_WINDOW');
  need(instant(window.from, 'INVALID_SUMMARY_START') === selected.from &&
    instant(window.to, 'INVALID_SUMMARY_END') === selected.to && window.timezone === 'UTC',
    'SUMMARY_WINDOW_MISMATCH');
  const totals = object(body.totals, 'MISSING_SUMMARY_TOTALS');
  const countedThrough = body.counted_through === null ? null : instant(body.counted_through, 'INVALID_COUNTED_THROUGH');
  need(countedThrough === null || countedThrough <= value.capturedAt, 'COUNTED_THROUGH_AFTER_CAPTURE');
  return {
    capturedAt: value.capturedAt, usd: format(decimal(totals.usd)),
    calls: integer(totals.calls, 'INVALID_SUMMARY_CALLS'),
    tokens: totals.tokens === undefined ? null : integer(totals.tokens, 'INVALID_SUMMARY_TOKENS'),
    unpricedCalls: integer(totals.unpriced_calls, 'INVALID_UNPRICED_CALLS'),
    unavailableDays: unavailable(body.unavailable_days), countedThrough,
    authority: 'ORIGINAL_PROVIDER_WINDOW_TOTALS'
  };
}

/**
 * The envelope is a local capture association, not a provider authentication proof.
 * Keep responseText unchanged beside this projection when exporting or receiving.
 */
export function projectBlockrunUsageCapture(input) {
  object(input, 'INVALID_USAGE_CAPTURE');
  need(input.schema === 'tjlabs.blockrun-usage-capture.v1', 'INVALID_CAPTURE_SCHEMA');
  const selected = selection(input.selection);
  need(Array.isArray(input.pages) && input.pages.length > 0 && input.pages.length <= 4096, 'INVALID_PAGE_COLLECTION');
  let expectedCursor = null, lastTime = null, known = { coefficient: 0n, scale: 0 };
  const seenCursors = new Set(), byId = new Map(), rows = [], pages = [], missingDays = new Set();
  const duplicates = [];
  for (let index = 0; index < input.pages.length; index++) {
    const page = object(input.pages[index], 'INVALID_PAGE');
    need(cursor(page.cursor) === expectedCursor, 'CURSOR_CHAIN_MISMATCH');
    need(index === 0 || expectedCursor !== null, 'PAGE_AFTER_TERMINAL_CURSOR');
    const key = expectedCursor === null ? 'first' : 'cursor:' + expectedCursor;
    need(!seenCursors.has(key), 'REPEATED_CURSOR');
    seenCursors.add(key);
    const value = originalResponse(page, requestUrl(selected, expectedCursor), selected);
    need(value.body.object === 'list' && Array.isArray(value.body.data) &&
      value.body.data.length <= selected.limit, 'INVALID_USAGE_PAGE');
    for (const missing of unavailable(value.body.unavailable_days)) missingDays.add(missing);
    for (const native of value.body.data) {
      const current = row(native);
      need(current.timestamp >= selected.from && current.timestamp < selected.to, 'ROW_OUTSIDE_SELECTED_WINDOW');
      const previous = byId.get(current.requestId);
      if (previous) {
        need(canonical(previous.original) === canonical(current.original), 'ROW_CHANGED_DURING_CAPTURE');
        duplicates.push({ requestId: current.requestId, page: index + 1 });
        continue;
      }
      need(lastTime === null || current.timestamp <= lastTime, 'ROWS_NOT_NEWEST_FIRST');
      lastTime = current.timestamp;
      byId.set(current.requestId, current); rows.push(current);
      if (current.costState !== 'pending') known = add(known, current.amount);
    }
    expectedCursor = cursor(value.body.next_cursor);
    need(expectedCursor === null || !seenCursors.has('cursor:' + expectedCursor), 'REPEATED_CURSOR');
    pages.push({ index: index + 1, cursor: page.cursor, nextCursor: expectedCursor,
      capturedAt: value.capturedAt, requestUrl: page.requestUrl, reportedRows: value.body.data.length });
  }
  const originalSummary = summary(input.summary, selected);
  if (originalSummary) for (const missing of originalSummary.unavailableDays) missingDays.add(missing);
  const credit = balance(input.credits, selected);
  const groups = new Map();
  function target(current) {
    const visited = new Set();
    while (current.correctionOf !== null) {
      need(!visited.has(current.requestId), 'CYCLIC_CORRECTION_REFERENCES');
      visited.add(current.requestId);
      const previous = byId.get(current.correctionOf);
      if (!previous) return { key: 'outside:' + current.correctionOf,
        kind: 'CORRECTION_WITHOUT_BASE_IN_WINDOW', originalRequestId: current.correctionOf, jobId: null };
      current = previous;
    }
    return current.jobId === null
      ? { key: 'request:' + current.requestId, kind: 'REQUEST', originalRequestId: current.requestId, jobId: null }
      : { key: 'job:' + current.jobId, kind: 'MEDIA_JOB', originalRequestId: null, jobId: current.jobId };
  }
  for (const current of rows) {
    const identified = target(current);
    let group = groups.get(identified.key);
    if (!group) {
      group = { ...identified, requests: [], corrections: [], pending: [],
        amount: { coefficient: 0n, scale: 0 } };
      groups.set(identified.key, group);
    }
    group.requests.push(current.requestId);
    if (current.correctionOf !== null) group.corrections.push(current.requestId);
    if (current.costState === 'pending') group.pending.push(current.requestId);
    else group.amount = add(group.amount, current.amount);
  }
  const pending = rows.filter(value => value.costState === 'pending').map(value => value.requestId);
  const exhausted = expectedCursor === null;
  const knownUsd = format(known);
  const issues = [];
  if (!exhausted) issues.push('MORE_LEDGER_PAGES');
  if (missingDays.size) issues.push('PROVIDER_UNAVAILABLE_DAYS');
  if (pending.length || originalSummary && originalSummary.unpricedCalls !== '0') issues.push('UNSETTLED_COSTS');
  if (originalSummary && originalSummary.countedThrough !== null) issues.push('PARTIAL_SUMMARY_CUTOFF');
  const delta = originalSummary ? format(add(known,
    { ...decimal(originalSummary.usd), coefficient: -decimal(originalSummary.usd).coefficient })) : null;
  if (originalSummary && delta !== '0') issues.push('OBSERVED_ROWS_AND_SUMMARY_DIFFER');
  return {
    schema: 'tjlabs.blockrun-account-usage-view.v1',
    evidence: 'CAPTURED_PROVIDER_RESPONSES_WITH_LOCAL_ASSOCIATION',
    selection: selected, currency: 'USD', pages,
    coverage: { cursorExhausted: exhausted, nextCursor: expectedCursor,
      nextRequest: exhausted ? null : planBlockrunUsageCapture(selected, expectedCursor),
      unavailableDays: [...missingDays].sort(), pendingRequestIds: pending,
      summaryCountedThrough: originalSummary ? originalSummary.countedThrough : null,
      summaryPresent: originalSummary !== null, issues },
    observed: {
      uniqueRows: rows.length, duplicateRows: duplicates,
      knownPricedAndFreeUsd: knownUsd,
      mediaJobs: [...groups.values()].filter(value => value.kind === 'MEDIA_JOB').length,
      correctionRows: rows.filter(value => value.correctionOf !== null).length,
      callsInWindow: originalSummary ? originalSummary.calls : null,
      callCountAuthority: originalSummary ? 'ORIGINAL_SUMMARY_EXCLUDES_POLLS_AND_CORRECTIONS' : 'NOT_RECONSTRUCTED_FROM_ROWS',
      rowsMinusSummaryUsd: delta
    },
    groups: [...groups.values()].map(({ amount, ...group }) => ({
      ...group, knownPricedAndFreeUsd: format(amount),
      observedRowsFinal: group.pending.length === 0
    })),
    rows: rows.map(({ amount, ...current }) => current),
    providerSummary: originalSummary, providerCredits: credit,
    fulfillment: 'NOT_ASSESSED',
    interpretation: 'Rows retain the original reported costs. Media polls share one job group; corrections remain signed rows. Calls come from the original summary, because a page may contain polls for a job created outside this window. Raw captures remain necessary for receiving and review.'
  };
}
