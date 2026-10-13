import {mountMerchantIntake} from './invoice-intake.mjs';
import {mountMerchantPayment} from './payment-desk.mjs';
const $ = id => document.getElementById(id);
let token = '', state = null, projectState = null, selectedId = null, busy = false, poll = null;
let registerSelection = {}, registerRequest = 0, detailRequest = 0, detailOrder = null, ownerIdentity = null, connectionEpoch = 0;
const pendingKey = () => 'merchant.pending-invoice.v1.' + state.config.tenantId;
const names = { CREATED: 'Draft', CHARGE_UNCERTAIN: 'Creating request', CHARGE_REJECTED: 'Request rejected',
  AWAITING_PAYMENT: 'Awaiting payment', PAYMENT_PENDING: 'Payment pending', PAYMENT_UNCERTAIN: 'Reconciling payment',
  PAYMENT_FAILED: 'Payment failed', SETTLEMENT_CONFIRMED: 'Settled', FULFILLMENT_PENDING: 'Preparing result',
  FULFILLMENT_INTERRUPTED: 'Resuming delivery', COMPLETE: 'Delivered' };
function notice(text = '') { $('message').textContent = text; $('message').hidden = !text; }
function stateName(value) { return names[value] ?? value; }
function amount(value, decimals) {
  if (!decimals) return value;
  const padded = value.padStart(decimals + 1, '0');
  return padded.slice(0, -decimals) + '.' + padded.slice(-decimals);
}
function atomic(value, decimals) {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) throw new Error('Enter a decimal amount such as 12.75.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error('This asset supports ' + decimals + ' decimal places.');
  const result = (whole + fraction.padEnd(decimals, '0')).replace(/^0+(?=[0-9])/, '');
  if (!/^[1-9][0-9]{0,77}$/.test(result)) throw new Error('Enter a positive amount.');
  return result;
}
function readableDate(value) { return value ? new Date(value).toLocaleString() : '—'; }
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
async function api(path, { method = 'GET', body, download = false } = {}) {
  const requestEpoch = connectionEpoch, requestIdentity = ownerIdentity ? {...ownerIdentity} : null;
  const headers = { Authorization: 'Bearer ' + token,
    ...(requestIdentity ? {'X-Merchant-Store-Id':requestIdentity.storeId,'X-Merchant-Tenant-Id':requestIdentity.tenantId} : {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', redirect: 'error' });
  if (requestEpoch !== connectionEpoch) throw new Error('The connection changed while this original request was in progress. Reconnect and read its saved status.');
  if (!response.ok) {
    let code = 'Request failed (' + response.status + ').';
    try { code = (await response.json()).error ?? code; } catch {}
    if (requestEpoch !== connectionEpoch) throw new Error('The connection changed while this original request was in progress. Read its saved status.');
    if (response.status === 401) disconnect();
    const error = new Error(code === 'INVOICE_REGISTER_CHANGED' ?
      'Invoices changed while you were reviewing this selection. Refresh to read the current register, then continue.' :
      code === 'INVOICE_REGISTER_DOWNLOAD_LIMIT' ? 'Finish the current downloads or wait two minutes, then export again.' :
      code === 'MERCHANT_PROJECT_SNAPSHOT_IN_PROGRESS' ?
      'The project package is being captured. Your entered details are kept; retry when the package is ready.' :
      code.replaceAll('_', ' '));
    error.code = code; error.status = response.status; throw error;
  }
  const value = download ? response : await response.json();
  if (requestEpoch !== connectionEpoch) throw new Error('The connection changed while this original request was in progress. Read its saved status.');
  const selected = requestIdentity || (!download && path.startsWith('/api/register?') ?
    {storeId:value.source?.storeId,tenantId:value.config?.tenantId} : null);
  if (!selected || !/^[a-f0-9-]{36}$/i.test(selected.storeId??'') || !/^[a-f0-9-]{36}$/i.test(selected.tenantId??'') ||
      response.headers.get('x-merchant-store-id')!==selected.storeId || response.headers.get('x-merchant-tenant-id')!==selected.tenantId)
    throw new Error('The response belongs to a different original merchant. Reconnect to the selected workspace.');
  if (!ownerIdentity) ownerIdentity={...selected};
  return value;
}
async function download(path, name) {
  const response = await api(path, { download: true }), blob = await response.blob(), url = URL.createObjectURL(blob);
  const link = element('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function action(work) {
  if (busy) return;
  busy = true; notice();
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try { await work(); }
  catch (error) { notice(error.message); }
  finally {
    busy = false;
    for (const button of document.querySelectorAll('button')) button.disabled = false;
    if (token && selectedId) await loadDetail().catch(error => notice(error.message));
    applyCaptureControls();
  }
}
function disconnect() {
  connectionEpoch++; intake.reset(); payment.detach(); ownerIdentity = null;
  token = ''; selectedId = null; state = null; projectState = null; detailOrder = null;
  registerRequest++; detailRequest++; registerSelection = {}; $('register-filter-form').reset();
  $('detail-content').hidden = true; $('detail-empty').hidden = false;
  $('detail-empty').querySelector('h3').textContent = 'Choose an invoice';
  $('detail-empty').querySelector('p').textContent = 'Payment terms, delivery progress and the completed result appear here.';
  delete $('detail-content').dataset.orderId;
  if (poll) clearInterval(poll); poll = null;
  $('workspace').hidden = true; $('connect-panel').hidden = false; $('disconnect').hidden = true;
  $('connection-state').textContent = 'Disconnected'; $('operator-token').value = ''; $('signature').value = '';
}
function renderRails() {
  const container = $('rail-fields'); container.replaceChildren();
  for (const rail of state.config.template.rails) {
    const card = element('div', undefined, 'rail'), choice = element('label', undefined, 'rail-choice');
    const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.name = 'rail'; checkbox.value = rail.assetId;
    checkbox.checked = state.config.template.rails.length === 1;
    choice.append(checkbox, element('span', rail.label)); card.append(choice, element('p', rail.network, 'muted'));
    const input = element('input'); input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off';
    input.className = 'rail-amount'; input.placeholder = '0.00'; input.dataset.assetId = rail.assetId; input.setAttribute('aria-label', rail.label + ' amount');
    const detail = element('div', 'Atomic units', 'rail-atomic');
    input.addEventListener('input', () => { try { detail.textContent = atomic(input.value, rail.decimals) + ' atomic units'; } catch { detail.textContent = 'Up to ' + rail.decimals + ' decimal places'; } });
    card.append(input, detail); container.append(card);
  }
  renderPendingCreation();
}
function renderPendingCreation() {
  const saved = sessionStorage.getItem(pendingKey()), pending = saved ? JSON.parse(saved) : null;
  const form = $('create-form');
  form.elements.reference.readOnly = !!pending; form.elements.title.readOnly = !!pending;
  if (pending) { form.elements.reference.value = pending.reference; form.elements.title.value = pending.title; }
  for (const choice of form.querySelectorAll('input[name=rail]')) {
    choice.disabled = !!pending;
    if (pending) choice.checked = pending.prices.some(price => price.assetId === choice.value);
  }
  for (const input of form.querySelectorAll('input[data-asset-id]')) {
    input.readOnly = !!pending;
    if (pending) {
      const price = pending.prices.find(item => item.assetId === input.dataset.assetId);
      const rail = state.config.template.rails.find(item => item.assetId === input.dataset.assetId);
      input.value = price && rail ? amount(price.amountAtomic, rail.decimals) : '';
    }
  }
  $('creation-note').textContent = pending ? 'The original invoice is retained. Retry will send these same details.' : '';
  $('create-submit').textContent = pending ? 'Retry original invoice' : 'Save invoice';
}
function renderList() {
  const rows = $('order-rows'); rows.replaceChildren();
  for (const order of state.orders) {
    const row = element('tr'); row.tabIndex = 0; row.className = order.id === selectedId ? 'selected' : ''; row.setAttribute('aria-label', order.reference + ', ' + stateName(order.state));
    const identity = element('td'); identity.append(element('span', order.reference, 'reference'), element('span', order.title, 'description'));
    const prices = element('td');
    for (const rail of order.offers) prices.append(element('span', amount(rail.amountAtomic, rail.decimals) + ' ' + rail.label, 'amount'));
    const status = element('td'); status.append(element('span', stateName(order.state), 'state')); row.append(identity, prices, status);
    const choose = () => action(async () => { selectedId = order.id; payment.select(selectedId); detailOrder = null; renderList(); await loadDetail(); });
    row.addEventListener('click', choose); row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
    rows.append(row);
  }
  $('empty-list').hidden = state.orders.length > 0;
  $('empty-list').textContent = state.counts.total ? 'No invoices match the applied filters.' :
    state.mode === 'review' ? 'This saved project contains no invoices.' : 'Create an invoice to begin.';
  const counts = state.counts.states;
  $('count-total').textContent = state.counts.total;
  $('count-awaiting').textContent = (counts.CREATED ?? 0) + (counts.AWAITING_PAYMENT ?? 0);
  $('count-progress').textContent = Object.entries(counts).filter(([key]) =>
    !['CREATED', 'AWAITING_PAYMENT', 'COMPLETE', 'CHARGE_REJECTED', 'PAYMENT_FAILED'].includes(key)).reduce((n, [, count]) => n + count, 0);
  $('count-complete').textContent = counts.COMPLETE ?? 0;
  renderRegisterControls();
}
function registerParameters(selection, extra = {}) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries({...selection, ...extra}))
    if (value !== '' && value !== null && value !== undefined) result.set(key, String(value));
  return result.toString();
}
function selectedRegisterFilters() {
  const selection = {q: $('search').value, state: $('register-state').value,
    from: $('register-from').value, to: $('register-to').value};
  const rail = $('register-rail').value;
  if (rail) Object.assign(selection, JSON.parse(rail));
  return selection;
}
function renderRegisterControls() {
  if (!state) return;
  const {offset, returned} = state.page, selected = state.counts.selected;
  $('register-page-label').textContent = selected ?
    (offset + 1) + '–' + (offset + returned) + ' of ' + selected + ' matching invoices' : '0 matching invoices';
  $('register-source').textContent = 'Original history ' + state.source.historySequence +
    ' · Captured ' + readableDate(state.source.capturedAt) + ' · Date filters use invoice creation in UTC.';
  $('register-previous').disabled = busy || !state.page.previous;
  $('register-next').disabled = busy || !state.page.next;
  $('register-export-csv').disabled = busy;
  $('register-export-json').disabled = busy;
  const selectedRail = $('register-rail').value, railOptions = $('register-rail');
  railOptions.replaceChildren(new Option('All payment options', ''));
  const seen = new Set();
  for (const rail of state.railOptions) {
    const value = JSON.stringify({assetId: rail.assetId, network: rail.network});
    if (seen.has(value)) continue; seen.add(value);
    railOptions.append(new Option(rail.label + ' · ' + rail.network + ' · ' + rail.assetId, value));
  }
  if (selectedRail && !seen.has(selectedRail)) railOptions.append(new Option('Selected historical payment option', selectedRail));
  railOptions.value = selectedRail;
}
async function refresh({cursor = null, selection = registerSelection} = {}) {
  const requestedToken = token, request = ++registerRequest;
  const received = await api('/api/register?' + registerParameters(selection, {cursor, limit: 50}));
  if (!requestedToken || token !== requestedToken || request !== registerRequest) return;
  state = received; registerSelection = received.selection; renderList();
  $('review-banner').hidden = state.mode !== 'review';
  $('show-create').hidden = state.mode === 'review';
  $('show-intake').textContent = state.mode === 'review' ? 'Review intakes' : 'Import invoices';
  if (state.mode === 'review') $('create-panel').hidden = true;
  $('template-line').textContent = state.config.template.rails.length + ' configured payment options · Resource version ' + state.config.template.resourceVersion;
  $('tenant-label').textContent = 'Tenant ' + state.config.tenantId;
  await refreshProject();
  if (selectedId) await loadDetail();
}
async function exportRegister(format) {
  if (!state) return;
  const requestedToken = token, revision = state.source.revision, selection = {...state.selection};
  const selected = await api('/api/register/export?' + registerParameters(selection, {revision, format}));
  if (token !== requestedToken) return;
  if (!/^\/downloads\/invoices\/[0-9a-f-]{36}$/.test(selected.url) ||
      selected.source?.revision !== revision || JSON.stringify(selected.selection) !== JSON.stringify(selection))
    throw new Error('The register export differs from the reviewed selection.');
  const link = element('a'); link.href = selected.url; link.download = selected.fileName;
  link.referrerPolicy = 'no-referrer'; document.body.append(link); link.click(); link.remove();
  notice('Prepared ' + selected.invoiceCount + ' invoices and ' + selected.offerCount +
    ' offered payment options. The download contains every invoice matching the applied filters.');
}
function fact(label, value, mono = false) {
  $('detail-facts').append(element('dt', label), element('dd', value ?? '—', mono ? 'mono' : ''));
}
async function loadDetail() {
  const requestedId = selectedId, requestedToken = token, request = ++detailRequest;
  if (!requestedId || !requestedToken) return;
  if ($('detail-content').dataset.orderId !== requestedId) {
    $('detail-content').hidden = true; $('detail-empty').hidden = false;
    $('detail-empty').querySelector('h3').textContent = 'Loading selected invoice…';
    $('detail-empty').querySelector('p').textContent = requestedId;
  }
  const received = await api('/api/orders/' + requestedId);
  if (selectedId !== requestedId || token !== requestedToken || request !== detailRequest) return;
  const order = received.order; detailOrder = order;
  if (order.id !== requestedId) throw new Error('The returned invoice differs from the selection.');
  $('detail-content').dataset.orderId = requestedId;
  $('detail-empty').hidden = true; $('detail-content').hidden = false;
  $('detail-reference').textContent = order.reference; $('detail-title').textContent = order.title; $('detail-state').textContent = stateName(order.state);
  $('detail-facts').replaceChildren();
  fact('Invoice ID', order.id, true);
  fact('Created', readableDate(order.createdAt));
  fact('Amounts', order.frozen.rails.map(rail => amount(rail.amountAtomic, rail.decimals) + ' ' + rail.label + ' · ' + rail.network).join('\n'));
  if (order.chargeId) { fact('Charge', order.chargeId, true); fact('Expires', readableDate(order.expiresAt)); }
  if (order.paymentId) fact('Payment', order.paymentId, true);
  if (order.nextActionAt && order.state !== 'COMPLETE') fact('Next update', readableDate(order.nextActionAt));
  if (order.receiptVerification) fact('Receipt', order.receiptVerification.receiptDigest, true);
  if (order.result) { fact('Result', order.result.fileName + ' · ' + order.result.bytes.toLocaleString() + ' bytes'); fact('SHA-256', order.result.sha256, true); }
  if (order.lastError) fact('Latest update', order.lastError.code.replaceAll('_', ' '));
  const guidance = { CREATED: 'Create the payment request to freeze the buyer’s offered terms.',
    AWAITING_PAYMENT: 'Download the request and pass it to the buyer’s compatible wallet. The wallet returns the payment authorization.',
    PAYMENT_PENDING: 'The payment is admitted. This workspace will continue the original authorization after the provider’s retry interval.',
    PAYMENT_UNCERTAIN: 'The workspace is reconciling the original payment authorization.',
    SETTLEMENT_CONFIRMED: 'Settlement returned successfully. The signed finalized event and receipt complete delivery.',
    FULFILLMENT_PENDING: 'The workspace is preparing and retaining the paid result.',
    FULFILLMENT_INTERRUPTED: 'The fulfillment adapter is recovering its original operation.',
    COMPLETE: 'The completed result is saved and checked before each download.',
    CHARGE_UNCERTAIN: 'The original charge creation is being reconciled.',
    CHARGE_REJECTED: 'Review the configured resource and this invoice’s exact terms.',
    PAYMENT_FAILED: 'The provider returned a definitive failure. Review the original authorization and payment record.' };
  const review = state?.mode === 'review';
  $('detail-guidance').textContent = review ? (order.state === 'COMPLETE' ?
    'The original completed file is available from this saved project.' :
    'The invoice and its activity show the saved project at the time of export.') : (guidance[order.state] ?? '');
  $('create-charge').hidden = review || !!order.chargeId; $('create-charge').disabled = busy || projectState?.capturing === true || order.state === 'CHARGE_REJECTED';
  $('download-envelope').hidden = !order.chargeId; $('download-envelope').disabled = busy;
  $('download-result').hidden = order.state !== 'COMPLETE'; $('download-result').disabled = busy;
  $('reconcile').hidden = review || !order.chargeId && order.state === 'CREATED'; $('reconcile').disabled = busy || projectState?.capturing === true;
  $('signature-form').hidden = review || !order.chargeId || ['COMPLETE', 'PAYMENT_FAILED'].includes(order.state) || order.signatureRetained;
  $('history').replaceChildren();
  for (const item of [...received.history].reverse()) {
    const row = element('li'), time = element('time', readableDate(item.createdAt)); time.dateTime = item.createdAt;
    row.append(time, element('strong', item.kind.toLowerCase().replaceAll('_', ' ')));
    const detail = Object.entries(item.details ?? {}).filter(([, value]) => value !== null).map(([key, value]) => key + ': ' + value).join(' · ');
    if (detail) row.append(element('div', detail, 'history-detail'));
    $('history').append(row);
  }
  await payment.observe(received);
}
function exportPendingKey() { return 'merchant.pending-project-export.v1.' + projectState.storeId; }
function projectSize(value) {
  const bytes = Number(value);
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' :
    bytes >= 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' bytes';
}
async function projectDownload(id) {
  const selected = await api('/api/project/exports/' + id + '/download', { method: 'POST' });
  if (!/^\/downloads\/project\/[0-9a-f-]{36}$/.test(selected.url)) throw new Error('The project download link is invalid.');
  // A short-lived link lets the browser stream the complete archive directly
  // to its download destination, without buffering the project in this page.
  const link = element('a'); link.href = selected.url; link.download = 'merchant-project-' + id + '.zip';
  link.referrerPolicy = 'no-referrer'; document.body.append(link); link.click(); link.remove();
}
async function startProjectExport(id) {
  sessionStorage.setItem(exportPendingKey(), id);
  const selected = await api('/api/project/exports', { method: 'POST', body: { operation: id } });
  if (selected.operation !== id) throw new Error('The export response differs from the original project request.');
  sessionStorage.removeItem(exportPendingKey());
  await refreshProject();
  notice(selected.state === 'COMPLETE' ? 'The complete project package is ready.' :
    'Project export is running. The package will appear in Project handover.');
}
function applyCaptureControls() {
  const paused = busy || projectState?.capturing === true;
  for (const button of document.querySelectorAll('#create-form button, #signature-form button'))
    button.disabled = paused;
  $('export-project').disabled = paused;
  $('reconcile').disabled = paused;
  const order = detailOrder?.id === selectedId ? detailOrder : state?.orders?.find(item => item.id === selectedId);
  $('create-charge').disabled = paused || order?.state === 'CHARGE_REJECTED';
  renderRegisterControls();
  intake.controls(); payment.controls();
}
function renderProject() {
  const rows = $('project-export-rows'); rows.replaceChildren();
  const review = state?.mode === 'review', available = projectState?.available === true;
  $('export-project').hidden = review || !available;
  $('project-guidance').textContent = review ?
    'Invoices, original payment activity and completed files are available in this received project.' :
    'Package the invoices, saved results, fulfillment files and application source for another operator.';
  $('project-state').textContent = projectState?.capturing ?
    'Capturing the project. Current work is finishing; updates resume when the package is ready. You can keep reviewing invoices and saved files.' :
    review ? 'Saved project review' : available ?
    'Each export keeps a complete database snapshot and the files it references.' :
    'Project export is available from the installed merchant application or with its configured source package.';
  const exports = projectState?.exports ?? [];
  $('project-exports').hidden = exports.length === 0;
  $('project-empty').hidden = review || exports.length > 0;
  if (available) {
    const pending = sessionStorage.getItem(exportPendingKey());
    if (pending && exports.some(row => row.operation === pending && ['COMPLETE', 'PREPARING'].includes(row.state)))
      sessionStorage.removeItem(exportPendingKey());
    $('export-project').textContent = sessionStorage.getItem(exportPendingKey()) ? 'Resume original export' : 'Export project';
  }
  for (const item of exports) {
    const row = element('tr'), date = element('td', readableDate(item.createdAt));
    date.append(element('span', item.operation, 'export-id'));
    const details = [];
    if (item.snapshot?.tableCounts?.merchant_orders !== undefined)
      details.push(item.snapshot.tableCounts.merchant_orders + ' invoices');
    if (item.archive?.members !== undefined) details.push(item.archive.members + ' archive entries');
    if (item.archive?.bytes) details.push(projectSize(item.archive.bytes));
    const contents = element('td', details.join(' · ') || 'Collecting original project');
    const status = element('td');
    const labels = { PREPARING: 'Preparing', COMPLETE: 'Ready', INTERRUPTED: 'Resume available', RETRY_REQUIRED: 'Resume available' };
    status.append(element('span', labels[item.state] ?? item.state, 'state'));
    if (item.error) status.append(element('p', item.error.replaceAll('_', ' '), 'muted'));
    const files = element('td'), controls = element('div', undefined, 'actions');
    if (item.state === 'COMPLETE') {
      const download = element('button', 'Download project', 'secondary');
      download.addEventListener('click', () => action(() => projectDownload(item.operation)));
      const manifest = element('button', 'Contents', 'quiet');
      manifest.addEventListener('click', () => action(() =>
        downloadManifest(item.operation)));
      controls.append(download, manifest);
    } else if (['INTERRUPTED', 'RETRY_REQUIRED'].includes(item.state)) {
      const resume = element('button', 'Resume export', 'secondary');
      resume.addEventListener('click', () => action(() => startProjectExport(item.operation)));
      controls.append(resume);
    }
    files.append(controls); row.append(date, contents, status, files); rows.append(row);
  }
}
async function downloadManifest(id) {
  await download('/api/project/exports/' + id + '/manifest', 'merchant-project-' + id + '-contents.json');
}
async function refreshProject() {
  const requestedToken = token, received = await api('/api/project');
  if (!requestedToken || token !== requestedToken || !state) return;
  projectState = received; renderProject(); applyCaptureControls();
}
$('export-project').addEventListener('click', () => action(async () => {
  if (!projectState?.available || projectState.capturing || state.mode === 'review') return;
  const id = sessionStorage.getItem(exportPendingKey()) || crypto.randomUUID();
  await startProjectExport(id);
}));
$('connect-form').addEventListener('submit', event => {
  event.preventDefault();
  action(async () => {
    connectionEpoch++; ownerIdentity = null; token = $('operator-token').value;
    try { await refresh(); } catch (error) { disconnect(); throw error; }
    $('operator-token').value = '';
    $('connect-panel').hidden = true; $('workspace').hidden = false; $('disconnect').hidden = false;
    $('connection-state').textContent = state.mode === 'review' ? 'Project review' : 'Connected';
    if (state.mode !== 'review') renderRails();
    if (poll) clearInterval(poll);
    poll = setInterval(() => {
      if (!busy && token) {
        const work = state?.page.offset ? Promise.all([refreshProject(), loadDetail()]) : refresh();
        work.catch(error => notice(error.message));
      }
    }, 15000);
  });
});
$('disconnect').addEventListener('click', disconnect);
$('refresh').addEventListener('click', () => action(refresh));
for (const [value, label] of Object.entries(names)) $('register-state').append(new Option(label, value));
$('register-filter-form').addEventListener('submit', event => {
  event.preventDefault(); action(() => refresh({selection: selectedRegisterFilters()}));
});
$('register-reset').addEventListener('click', () => action(async () => {
  $('register-filter-form').reset(); await refresh({selection: {}});
}));
$('register-previous').addEventListener('click', () => action(() =>
  state?.page.previous ? refresh({cursor: state.page.previous}) : Promise.resolve()));
$('register-next').addEventListener('click', () => action(() =>
  state?.page.next ? refresh({cursor: state.page.next}) : Promise.resolve()));
$('register-export-csv').addEventListener('click', () => action(() => exportRegister('csv')));
$('register-export-json').addEventListener('click', () => action(() => exportRegister('json')));
$('show-create').addEventListener('click', () => { $('create-panel').hidden = false; $('create-form').elements.reference.focus(); });
$('hide-create').addEventListener('click', () => { $('create-panel').hidden = true; });
$('create-form').addEventListener('submit', event => {
  event.preventDefault();
  action(async () => {
    let payload; const pending = sessionStorage.getItem(pendingKey());
    if (pending) payload = JSON.parse(pending);
    else {
      const form = $('create-form'), prices = [];
      for (const choice of form.querySelectorAll('input[name=rail]:checked')) {
        const rail = state.config.template.rails.find(item => item.assetId === choice.value);
        const input = [...form.querySelectorAll('input[data-asset-id]')].find(item => item.dataset.assetId === rail.assetId);
        prices.push({ assetId: rail.assetId, amountAtomic: atomic(input.value, rail.decimals) });
      }
      if (!prices.length) throw new Error('Select at least one payment option.');
      payload = { id: crypto.randomUUID(), reference: form.elements.reference.value, title: form.elements.title.value, prices };
      sessionStorage.setItem(pendingKey(), JSON.stringify(payload));
      renderPendingCreation();
    }
    const created = await api('/api/orders', { method: 'POST', body: payload });
    sessionStorage.removeItem(pendingKey()); selectedId = created.order.id; payment.select(selectedId); $('create-panel').hidden = true;
    $('create-form').reset(); renderRails(); await refresh();
    notice('Invoice saved. Create its payment request when the terms are ready.');
  });
});



$('download-result').addEventListener('click', () => action(async () => {
  const detail = await api('/api/orders/' + selectedId);
  await download('/api/orders/' + selectedId + '/result', detail.order.result.fileName);
}));
const payment=mountMerchantPayment({api,action,notice,identity:()=>ownerIdentity,state:()=>state,
 busy:()=>busy,capturing:()=>projectState?.capturing===true,changed:refresh});
// Closing or a back/forward cache transition drops the operator credential.
// Invoice-bound work remains in this tab's memory; its private file reopens a
// separate browser session through the same original owner and invoice.
window.addEventListener('pagehide',disconnect);
window.addEventListener('pageshow',event=>{if(event.persisted)disconnect();});

const intake=mountMerchantIntake({api,action,notice,state:()=>state,busy:()=>busy,capturing:()=>projectState?.capturing===true,changed:refresh});
