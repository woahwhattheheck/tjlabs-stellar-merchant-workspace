import { createConsumerUi } from './consumer.mjs';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const pretty = value => JSON.stringify(value, null, 2);
const empty = (columns, message) => '<tr><td colspan="' + columns + '" class="empty">' + esc(message) + '</td></tr>';
const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : value || '—';
const age = seconds => seconds === null || seconds === undefined || !Number.isFinite(Number(seconds)) ? 'Unknown' : Number(seconds) < 60 ? Math.max(0, Math.round(Number(seconds))) + ' sec' : Number(seconds) < 3600 ? Math.round(Number(seconds) / 60) + ' min' : (Number(seconds) / 3600).toFixed(1) + ' hr';
const assetLabel = value => value === 'native' ? 'XLM' : String(value ?? '').split(':')[0];
const assetId = row => row.asset || row.identifier || row.contract_address || (row.issuer_address ? row.asset_code + ':' + row.issuer_address : row.asset_code === 'XLM' ? 'native' : '');
const activeStatuses = new Set(['RUNNING', 'RETRY_WAIT']);
const resumeStatuses = new Set(['PAUSED', 'QUOTA_WAIT', 'KEY_REQUIRED', 'INTERRUPTED']);
const query = object => new URLSearchParams(Object.entries(object ?? {}).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)])).toString();
let capability = location.hash.slice(1) || sessionStorage.getItem('stellar-prices.operator') || '';
if (location.hash) { sessionStorage.setItem('stellar-prices.operator', capability); history.replaceState(null, '', location.pathname); }
let state, selectedPlan, selectedRunId, resultSelection, busy = false;
let selectionDirty = false, catalogDirty = false, settingsDirty = false;
let selectionRevision, catalogRevision, settingsRevision, initialized = false, seriesPage = 0;
function notify(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function showAuth() { $('authentication').hidden = false; $('application').hidden = true; }
function showView(name) {
  document.querySelectorAll('[data-panel]').forEach(element => { element.hidden = element.dataset.panel !== name; });
  document.querySelectorAll('[data-view]').forEach(element => {
    const current = element.dataset.view === name; element.classList.toggle('selected', current);
    if (current) element.setAttribute('aria-current', 'page'); else element.removeAttribute('aria-current');
  });
}
async function api(action, input, responseType = 'json') {
  const response = await fetch('./api/' + action, { method: input === undefined ? 'GET' : 'POST',
    headers: { authorization: 'Bearer ' + capability, ...(input === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }), cache: 'no-store' });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) showAuth();
    throw Object.assign(new Error(data.error?.message ?? 'The request could not be completed.'), { code: data.error?.code, status: response.status });
  }
  return responseType === 'text' ? response.text() : response.json();
}
function download(name, content, type = 'application/json') {
  const blob = new Blob([content], { type }), url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function perform(work) {
  if (busy) return;
  busy = true; renderActions();
  try { await work(); }
  catch (error) { notify((error.code ? error.code + ': ' : '') + error.message); }
  finally { busy = false; renderActions(); }
}
function setValue(id, value) { $(id).value = value ?? ''; }
function fillSelection() {
  if (!state || selectionDirty) return;
  const config = state.workspace.configuration;
  setValue('asset-selection', config.assetIdentifiers.join('\n'));
  setValue('history-timeframe', config.history.timeframe); setValue('history-granularity', config.history.granularity);
  setValue('history-currency', config.history.base_currency); setValue('history-start', config.history.start); setValue('history-end', config.history.end);
  selectionRevision = state.workspace.revision;
}
function fillCatalog() {
  if (!state || catalogDirty) return;
  const catalog = state.workspace.configuration.catalog;
  for (const field of ['type', 'search', 'sort', 'order', 'limit']) setValue('catalog-' + field, catalog[field]);
  setValue('catalog-volume', catalog.min_volume_usd); catalogRevision = state.workspace.revision;
}
function fillSettings() {
  if (!state || settingsDirty) return;
  const config = state.workspace.configuration;
  for (const [field, key] of Object.entries({ name: 'name', base: 'baseUrl', interval: 'requestIntervalMs', freshness: 'freshnessSeconds', maximum: 'maxRequestsPerRun', retries: 'maxRetries', timeout: 'requestTimeoutMs', volume: 'priceMinVolumeUsd' })) setValue('setting-' + field, config[key]);
  settingsRevision = state.workspace.revision;
  $('settings-version').textContent = 'Saved revision ' + settingsRevision + '. Changes use this revision to preserve concurrent edits.';
}
function resultButton(runId, taskId, label = 'Open') {
  return '<button class="secondary" data-result-run="' + esc(runId) + '" data-result-task="' + esc(taskId) + '">' + esc(label) + '</button>';
}
function priceRows() {
  const rows = state.prices ?? [];
  $('price-rows').innerHTML = rows.length ? rows.map(row => {
    const id = assetId(row), seconds = row.ageSeconds ?? (row.as_of ? (Date.now() - Date.parse(row.as_of)) / 1000 : null);
    return '<tr><td><strong>' + esc(assetLabel(id)) + '</strong><small>' + esc(id) + '</small></td><td class="decimal">' + esc(row.price_usd) + '<small>VWAP ' + esc(row.vwap_24h) + '</small></td><td class="decimal">' + esc(row.volume_24h_usd) + '</td><td>' + esc(row.price_status || 'unknown') + '<small>' + esc(row.method || 'unavailable method') + '</small></td><td>' + esc(age(seconds)) + '<small>' + esc(row.freshness || '') + '</small><small>' + esc(time(row.as_of)) + '</small></td><td>' + resultButton(row.runId, row.taskId) + '</td></tr>';
  }).join('') : empty(6, 'Collect the selected assets to retain their original prices.');
}
function catalogRows() {
  const catalog = state.catalog, rows = catalog?.rows ?? [];
  $('catalog-meta').textContent = catalog ? rows.length + ' rows · received ' + time(catalog.receivedAt) + (catalog.hasMore ? ' · more pages available' : ' · final page') : 'Collect a catalog request to browse assets.';
  $('catalog-next').disabled = busy || !catalog?.hasMore || !catalog.cursor;
  $('catalog-rows').innerHTML = rows.length ? rows.map(row => {
    const id = assetId(row);
    return '<tr><td><strong>' + esc(row.asset_code || assetLabel(id)) + '</strong><small>' + esc(id) + '</small></td><td>' + esc(row.asset_type) + '</td><td class="decimal">' + esc(row.price_usd) + '</td><td class="decimal">' + esc(row.volume_24h_usd) + '</td><td>' + esc(row.price_status || 'unknown') + '<small>' + esc(time(row.as_of)) + '</small></td><td>' + (id ? '<button class="secondary" data-add-asset="' + esc(id) + '">Add asset</button>' : '—') + '</td></tr>';
  }).join('') : empty(6, 'The latest catalog collection has no rows to display.');
}
function renderPlan() {
  const plan = selectedPlan;
  const oldSelection = $('saved-plan').value;
  $('saved-plan').innerHTML = '<option value="">Select a saved plan</option>' + (state?.plans ?? []).map(item => '<option value="' + esc(item.id) + '">' + esc(item.name) + ' · ' + esc(item.requestCount) + ' initial requests</option>').join('');
  $('saved-plan').value = oldSelection || plan?.id || '';
  $('plan-summary').textContent = plan ? plan.name + ' · ' + plan.kind + ' · ' + plan.requestCount + ' initial requests · maximum ' + plan.requestMaximum : 'Prepare a collection from Assets & prices, or refresh service coverage.';
  $('plan-notices').textContent = (plan?.notices ?? []).map(value => typeof value === 'string' ? value : pretty(value)).join(' ');
  $('plan-rows').innerHTML = plan?.tasks?.length ? plan.tasks.map(task => {
    const request = task.request, search = query(request.query);
    return '<tr><td>' + esc(task.kind) + '</td><td>' + esc(task.asset || '—') + '</td><td class="mono">' + esc(request.method + ' ' + request.path + (search ? '?' + search : '')) + (request.body === undefined ? '' : '<small>' + esc(JSON.stringify(request.body)) + '</small>') + '</td></tr>';
  }).join('') : empty(3, 'No request plan selected.');
}
function currentRun() { return state?.runs?.find(run => run.id === selectedRunId); }
function renderRuns() {
  const runs = state.runs ?? [];
  if (!selectedRunId || !runs.some(run => run.id === selectedRunId)) selectedRunId = state.runtime.activeRunId ?? runs[0]?.id;
  $('run-list').innerHTML = runs.length ? runs.map(run => '<button class="run-item' + (run.id === selectedRunId ? ' selected' : '') + '" data-run="' + esc(run.id) + '"><strong>' + esc(run.name) + '</strong><span>' + esc(run.status) + ' · ' + esc(run.completedCount) + ' completed · ' + esc(run.errorCount) + ' errors</span><span>' + esc(time(run.createdAt)) + '</span></button>').join('') : '<p class="muted">Saved collections appear here after a plan is started.</p>';
  const run = currentRun(); $('run-title').textContent = run?.name || 'Collection detail';
  $('run-detail').innerHTML = run ? '<dl><dt>State</dt><dd>' + esc(run.status) + '</dd><dt>Completed</dt><dd>' + esc(run.completedCount) + '</dd><dt>Errors</dt><dd>' + esc(run.errorCount) + '</dd><dt>Attempts</dt><dd>' + esc(run.attemptCount) + '</dd><dt>Next request</dt><dd>' + esc(time(run.nextRequestAt)) + '</dd><dt>Latest outcome</dt><dd>' + esc(typeof run.lastIssue === 'object' && run.lastIssue ? pretty(run.lastIssue) : run.lastIssue || '—') + '</dd></dl>' : 'Select a saved collection.';
  $('task-rows').innerHTML = run?.tasks?.length ? run.tasks.map(task => '<tr><td>' + esc(task.kind) + '<small>' + esc(task.asset || '') + '</small></td><td>' + esc(task.state) + '</td><td>' + esc(task.attemptCount) + '</td><td>' + esc(time(task.receivedAt)) + '</td><td>' + esc(task.status ?? '—') + '</td><td>' + (task.hasResponse ? resultButton(run.id, task.id) : '—') + '</td></tr>').join('') : empty(6, 'The selected collection has no retained tasks.');
}
function coverageCard(title, stream) {
  if (!stream) return '<div class="coverage-card"><h3>' + esc(title) + '</h3><p>No stream observation is present in the last response.</p></div>';
  const rows = [['State', stream.status], ['Earliest data', stream.earliest_data_available], ['Current ledger', stream.current_ledger], ['Target ledger', stream.target_ledger], ['Progress', stream.progress_pct === undefined ? undefined : stream.progress_pct + '%'], ['Last push', stream.last_push_at], ['Completed', stream.completed_at]].filter(([, value]) => value !== undefined);
  return '<div class="coverage-card"><h3>' + esc(title) + '</h3><dl>' + rows.map(([label, value]) => '<dt>' + esc(label) + '</dt><dd>' + esc(value ?? 'Unreported') + '</dd>').join('') + '</dl></div>';
}
function renderQuality() {
  const observation = state.coverage, data = observation?.data;
  $('coverage-meta').textContent = observation ? 'Provider response received ' + time(observation.receivedAt) : 'Refresh the published history coverage and current ingest progress.';
  $('coverage-cards').innerHTML = data ? '<div class="coverage-card"><h3>Live ingest</h3><strong>' + esc(data.realtime_tip_ledger) + '</strong><p>Provider-reported realtime tip ledger</p>' + resultButton(observation.runId, observation.taskId, 'Open original status') + '</div>' + coverageCard('SDEX archive', data.sdex) + coverageCard('Soroban AMM', data.soroban_amm) : '<p class="muted">Coverage appears after its original provider request completes.</p>';
  const histories = state.histories ?? [];
  $('history-rows').innerHTML = histories.length ? histories.map(item => '<tr><td>' + esc(item.asset || '—') + '</td><td>' + esc(item.granularity || '—') + '<small>' + esc(item.base_currency || '') + '</small></td><td>' + esc(item.rows ?? '—') + '<small>' + esc(item.pricedRows ?? 0) + ' priced · ' + esc(item.nullPriceRows ?? 0) + ' null</small></td><td>' + esc(item.backfill_note || '') + '<small>' + esc(item.derivedRows ?? 0) + ' derived · ' + esc(item.divergentRows ?? 0) + ' divergent · ' + esc(item.emptyBucketIntervals ?? 0) + ' intervals without a returned candle</small></td><td>' + resultButton(item.runId, item.taskId, 'Open history') + '</td></tr>').join('') : empty(5, 'Collect price history for the selected assets.');
}
function renderActions() {
  const anyActive = Boolean(state?.runs?.some(run => activeStatuses.has(run.status))), run = currentRun();
  $('start-plan').disabled = busy || !selectedPlan || anyActive;
  $('pause-run').disabled = busy || !run || !activeStatuses.has(run.status);
  $('resume-run').disabled = busy || anyActive || !run || !resumeStatuses.has(run.status);
  $('download-delivery').disabled = busy;
}
function render() {
  if (!state) return;
  $('authentication').hidden = true; $('application').hidden = false;
  $('workspace-name').textContent = state.workspace.name || state.workspace.configuration.name;
  $('provider-origin').textContent = state.access.baseUrl; $('access-badge').textContent = state.access.keyConfigured ? 'Provider key configured' : 'Saved data mode';
  $('access-note').hidden = state.access.keyConfigured; $('run-badge').textContent = state.runtime.state;
  $('selected-count').textContent = state.workspace.configuration.assetIdentifiers.length;
  $('price-count').textContent = state.prices?.length ?? 0; $('history-count').textContent = state.histories?.length ?? 0;
  $('month-attempts').textContent = (state.usage?.monthAttempts ?? 0).toLocaleString();
  $('usage-detail').textContent = (state.usage?.monthAttempts ?? 0).toLocaleString() + ' workspace attempts in ' + (state.usage?.month || 'this month') + '. Published provider allowance: ' + (state.usage?.monthlyProviderLimit ?? 100000).toLocaleString() + ' requests per month, with the configured request interval.';
  fillSelection(); fillCatalog(); fillSettings(); priceRows(); catalogRows(); renderRuns(); renderQuality(); renderPlan(); renderActions(); consumerUi.render(state); initialized = true;
}
async function refresh() { state = await api('state'); render(); return state; }
async function savePatch(configuration, revision) { await api('configuration', { expectedRevision: revision, configuration: { ...state.workspace.configuration, ...configuration } }); await refresh(); }
function readAssets() { return [...new Set($('asset-selection').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean))]; }
function readHistory() {
  return { timeframe: $('history-timeframe').value, granularity: $('history-granularity').value, base_currency: $('history-currency').value,
    ...($('history-start').value ? { start: $('history-start').value.trim() } : {}), ...($('history-end').value ? { end: $('history-end').value.trim() } : {}) };
}
function readCatalog() {
  return { type: $('catalog-type').value, search: $('catalog-search').value, sort: $('catalog-sort').value, order: $('catalog-order').value, limit: Number($('catalog-limit').value),
    ...($('catalog-volume').value === '' ? {} : { min_volume_usd: Number($('catalog-volume').value) }) };
}
async function preview(spec) { selectedPlan = await api('plan', spec); await refresh(); showView('runs'); renderPlan(); notify('The exact request plan is saved. Start collection when ready.'); }
function renderSeries(result) {
  const data = result.data;
  if (!Array.isArray(data?.data) || !data.data.some(row => Object.hasOwn(row, 'timestamp'))) { $('result-series').innerHTML = ''; return; }
  const candles = data.data, values = candles.map(row => ({ row, x: Date.parse(row.timestamp), y: row.close === null || row.close === undefined ? null : Number(row.close) }));
  const valid = values.filter(row => Number.isFinite(row.x) && row.y !== null && Number.isFinite(row.y));
  let chart = '';
  if (valid.length > 1) {
    const low = Math.min(...valid.map(row => row.y)), high = Math.max(...valid.map(row => row.y)), first = Math.min(...valid.map(row => row.x)), last = Math.max(...valid.map(row => row.x));
    let path = '', drawing = false;
    for (const item of values) {
      if (!Number.isFinite(item.x) || item.y === null || !Number.isFinite(item.y)) { drawing = false; continue; }
      const x = 75 + 810 * (item.x - first) / (last - first || 1), y = 175 - 150 * (item.y - low) / (high - low || 1);
      path += (drawing ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2) + ' '; drawing = true;
    }
    chart = '<svg class="chart" viewBox="0 0 910 210" role="img" aria-label="Saved close prices by provider timestamp"><line x1="75" y1="175" x2="885" y2="175"/><line x1="75" y1="25" x2="885" y2="25"/><text x="8" y="29">' + esc(high.toPrecision(5)) + '</text><text x="8" y="179">' + esc(low.toPrecision(5)) + '</text><path d="' + path + '"/><text x="75" y="199">' + esc(new Date(first).toISOString().slice(0, 16)) + '</text><text x="748" y="199">' + esc(new Date(last).toISOString().slice(0, 16)) + '</text></svg><p class="chart-caption">Close price by provider timestamp. Exact decimal values and quality fields are retained below.</p>';
  }
  const pageSize = 150, firstRow = seriesPage * pageSize, shown = candles.slice(firstRow, firstRow + pageSize);
  $('result-series').innerHTML = chart + '<p class="muted">' + candles.length + ' candles · ' + esc(data.granularity) + ' · ' + esc(data.base_currency) + (data.backfill_note ? ' · ' + esc(data.backfill_note) : '') + '</p><div class="table-wrap result-table" tabindex="0" aria-label="Original price candles"><table><thead><tr><th>Timestamp</th><th>Open / close</th><th>High / low</th><th>Volume</th><th>Trades</th><th>Method / quality</th></tr></thead><tbody>' + (shown.length ? shown.map(row => '<tr><td>' + esc(row.timestamp) + '</td><td class="decimal">' + esc(row.open ?? 'null') + '<small>' + esc(row.close ?? 'null') + '</small></td><td class="decimal">' + esc(row.high ?? 'null') + '<small>' + esc(row.low ?? 'null') + '</small></td><td class="decimal">' + esc(row.volume_base) + '<small>USD ' + esc(row.volume_quote_usd) + '</small></td><td>' + esc(row.trade_count) + '<small>Price-forming ' + esc(row.pf_trade_count ?? '—') + '</small></td><td>' + esc(row.method ?? '—') + '<small>' + esc(row.quality ?? '') + '</small><small>' + esc(row.source ?? '') + '</small></td></tr>').join('') : empty(6, 'The provider returned no candles for this window.')) + '</tbody></table></div><div class="actions"><button class="secondary" data-series-page="' + (seriesPage - 1) + '"' + (seriesPage === 0 ? ' disabled' : '') + '>Previous rows</button><span class="muted">Rows ' + (candles.length ? firstRow + 1 : 0) + '–' + Math.min(firstRow + pageSize, candles.length) + '</span><button class="secondary" data-series-page="' + (seriesPage + 1) + '"' + (firstRow + pageSize >= candles.length ? ' disabled' : '') + '>Next rows</button></div>';
}
async function openResult(runId, taskId) {
  const result = await api('result?' + query({ runId, taskId, format: 'json' }));
  resultSelection = { runId, taskId, result }; seriesPage = 0;
  $('result-title').textContent = result.kind + (result.data?.asset ? ' · ' + result.data.asset : '');
  $('result-meta').textContent = 'HTTP ' + result.status + ' · received ' + time(result.receivedAt) + ' · SHA-256 ' + result.sha256;
  $('result-summary').textContent = typeof result.summary === 'string' ? result.summary : '';
  $('result-raw').textContent = pretty({ request: result.request, status: result.status, receivedAt: result.receivedAt, headers: result.headers, summary: result.summary, data: result.data });
  renderSeries(result); $('result-dialog').showModal();
}

const consumerUi = createConsumerUi({ api, download, perform, notify, getState: () => state, onPlan: preview });

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('auth-form').addEventListener('submit', event => { event.preventDefault(); capability = $('operator-capability').value.trim(); sessionStorage.setItem('stellar-prices.operator', capability); void perform(refresh); });
$('refresh-state').addEventListener('click', () => void perform(async () => { await refresh(); notify('Workspace refreshed.'); }));
$('collection-form').addEventListener('input', () => { selectionDirty = true; });
$('catalog-form').addEventListener('input', () => { catalogDirty = true; });
$('settings-form').addEventListener('input', () => { settingsDirty = true; });
$('collection-form').addEventListener('submit', event => { event.preventDefault(); void perform(async () => {
  const assets = readAssets(), history = readHistory(), operations = [...document.querySelectorAll('input[name="operation"]:checked')].map(element => element.value);
  await savePatch({ assetIdentifiers: assets, history }, selectionRevision);
  selectionDirty = false; fillSelection();
  await preview({ kind: 'collection', name: $('collection-name').value || undefined, assets, history, operations });
}); });
$('catalog-form').addEventListener('submit', event => { event.preventDefault(); void perform(async () => {
  const catalog = readCatalog(); await savePatch({ catalog }, catalogRevision); catalogDirty = false; fillCatalog();
  await preview({ kind: 'catalog', catalog, maxPages: Number($('catalog-pages').value) });
}); });
$('catalog-next').addEventListener('click', () => void perform(async () => {
  const catalog = state.catalog;
  const prior = await api('result?' + query({ runId: catalog.runId, taskId: catalog.taskId, format: 'json' }));
  const original = prior.request.query, fields = { type: original.type ?? 'all', search: original.search ?? '', sort: original.sort ?? 'volume_24h', order: original.order ?? 'desc', limit: Number(original.limit ?? 50) };
  if (original.min_volume_usd !== undefined) fields.min_volume_usd = Number(original.min_volume_usd);
  await preview({ kind: 'catalog', catalog: fields, cursor: catalog.cursor, maxPages: Number($('catalog-pages').value) });
}));
$('start-plan').addEventListener('click', () => void perform(async () => { const run = await api('start', { planId: selectedPlan.planId ?? selectedPlan.id }); selectedRunId = run.id; await refresh(); notify('Collection started. Requests and provider outcomes are retained as they complete.'); }));
$('open-plan').addEventListener('click', () => void perform(async () => { const planId = $('saved-plan').value; if (!planId) throw new Error('Choose a retained request plan.'); selectedPlan = await api('plan?' + query({ planId })); renderPlan(); renderActions(); notify('Original saved request plan opened.'); }));
$('pause-run').addEventListener('click', () => void perform(async () => { await api('pause', {}); await refresh(); notify('Collection paused after its active read.'); }));
$('resume-run').addEventListener('click', () => void perform(async () => { await api('resume', { runId: selectedRunId }); await refresh(); notify('Collection continuation requested.'); }));
$('preview-health').addEventListener('click', () => void perform(() => preview({ kind: 'health', name: 'Provider service health' })));
$('preview-coverage').addEventListener('click', () => void perform(() => preview({ kind: 'coverage', name: 'Provider history coverage' })));
$('settings-form').addEventListener('submit', event => { event.preventDefault(); void perform(async () => {
  const configuration = { name: $('setting-name').value, baseUrl: $('setting-base').value, requestIntervalMs: Number($('setting-interval').value), freshnessSeconds: Number($('setting-freshness').value), maxRequestsPerRun: Number($('setting-maximum').value), maxRetries: Number($('setting-retries').value), requestTimeoutMs: Number($('setting-timeout').value), priceMinVolumeUsd: $('setting-volume').value === '' ? null : Number($('setting-volume').value) };
  await savePatch(configuration, settingsRevision); settingsDirty = false; fillSettings(); notify('Configuration saved in revision ' + state.workspace.revision + '.');
}); });
$('reload-settings').addEventListener('click', () => { settingsDirty = false; fillSettings(); notify('Settings reloaded from the saved workspace.'); });
$('download-delivery').addEventListener('click', () => void perform(async () => {
  const bundle = await api('delivery'); download('stellar-prices-workbench.json', pretty(bundle) + '\n'); await refresh();
  notify('Complete source and retained data exported. Resume the paused collection from Collections when ready.');
}));
$('download-configuration').addEventListener('click', () => { if (state) download('prices-workspace-configuration.json', pretty(state.workspace.configuration) + '\n'); });
$('close-result').addEventListener('click', () => $('result-dialog').close());
$('result-json').addEventListener('click', () => { if (resultSelection) download('prices-' + resultSelection.taskId + '.json', resultSelection.result.rawText ?? pretty(resultSelection.result.data)); });
$('result-csv').addEventListener('click', () => void perform(async () => {
  if (!resultSelection) return;
  const content = await api('result?' + query({ runId: resultSelection.runId, taskId: resultSelection.taskId, format: 'csv' }), undefined, 'text');
  download('prices-' + resultSelection.taskId + '.csv', content, 'text/csv; charset=utf-8');
}));
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.addAsset) {
    const assets = readAssets(); if (!assets.includes(button.dataset.addAsset)) assets.push(button.dataset.addAsset);
    $('asset-selection').value = assets.join('\n'); selectionDirty = true; notify('Asset added to the selection draft. Save and preview to retain it.');
  }
  if (button.dataset.run) { selectedRunId = button.dataset.run; renderRuns(); renderActions(); }
  if (button.dataset.resultRun) void perform(() => openResult(button.dataset.resultRun, button.dataset.resultTask));
  if (button.dataset.seriesPage !== undefined && resultSelection) { seriesPage = Number(button.dataset.seriesPage); renderSeries(resultSelection.result); }
});
async function poll() {
  if (capability && !document.hidden && !busy) {
    try { await refresh(); }
    catch (error) { if (error.status !== 401) notify(error.message); }
  }
  setTimeout(poll, initialized ? 3000 : 2000);
}
if (!capability) showAuth();
void poll();
