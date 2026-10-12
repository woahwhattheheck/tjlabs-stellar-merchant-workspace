const $ = id => document.getElementById(id);
let token = '', state = null, selectedId = null, busy = false, poll = null;
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
  const headers = { Authorization: 'Bearer ' + token };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', redirect: 'error' });
  if (!response.ok) {
    let code = 'Request failed (' + response.status + ').';
    try { code = (await response.json()).error ?? code; } catch {}
    if (response.status === 401) disconnect();
    throw new Error(code.replaceAll('_', ' '));
  }
  return download ? response : response.json();
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
  }
}
function disconnect() {
  token = ''; selectedId = null; state = null;
  $('detail-content').hidden = true; $('detail-empty').hidden = false;
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
  const query = $('search').value.trim().toLowerCase(), rows = $('order-rows'); rows.replaceChildren();
  const orders = [...state.orders].reverse().filter(order => (order.reference + ' ' + order.title + ' ' + order.id).toLowerCase().includes(query));
  for (const order of orders) {
    const row = element('tr'); row.tabIndex = 0; row.className = order.id === selectedId ? 'selected' : ''; row.setAttribute('aria-label', order.reference + ', ' + stateName(order.state));
    const identity = element('td'); identity.append(element('span', order.reference, 'reference'), element('span', order.title, 'description'));
    const prices = element('td');
    for (const rail of order.frozen.rails) prices.append(element('span', amount(rail.amountAtomic, rail.decimals) + ' ' + rail.label, 'amount'));
    const status = element('td'); status.append(element('span', stateName(order.state), 'state')); row.append(identity, prices, status);
    const choose = () => action(async () => { selectedId = order.id; renderList(); await loadDetail(); });
    row.addEventListener('click', choose); row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
    rows.append(row);
  }
  $('empty-list').hidden = orders.length > 0;
  $('empty-list').textContent = state.orders.length ? 'No matching invoices.' : 'Create an invoice to begin.';
  $('count-total').textContent = state.orders.length;
  $('count-awaiting').textContent = state.orders.filter(order => ['CREATED', 'AWAITING_PAYMENT'].includes(order.state)).length;
  $('count-progress').textContent = state.orders.filter(order => !['CREATED', 'AWAITING_PAYMENT', 'COMPLETE', 'CHARGE_REJECTED', 'PAYMENT_FAILED'].includes(order.state)).length;
  $('count-complete').textContent = state.orders.filter(order => order.state === 'COMPLETE').length;
}
async function refresh() {
  state = await api('/api/state'); renderList();
  $('template-line').textContent = state.config.template.rails.length + ' configured payment options · Resource version ' + state.config.template.resourceVersion;
  $('tenant-label').textContent = 'Tenant ' + state.config.tenantId;
  if (selectedId) await loadDetail();
}
function fact(label, value, mono = false) {
  $('detail-facts').append(element('dt', label), element('dd', value ?? '—', mono ? 'mono' : ''));
}
async function loadDetail() {
  const requestedId = selectedId, requestedToken = token;
  if (!requestedId || !requestedToken) return;
  if ($('detail-content').dataset.orderId !== requestedId) {
    $('detail-content').hidden = true; $('detail-empty').hidden = false;
  }
  const received = await api('/api/orders/' + requestedId);
  if (selectedId !== requestedId || token !== requestedToken) return;
  const order = received.order;
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
  $('detail-guidance').textContent = guidance[order.state] ?? '';
  $('create-charge').hidden = !!order.chargeId; $('create-charge').disabled = busy || order.state === 'CHARGE_REJECTED';
  $('download-envelope').hidden = !order.chargeId; $('download-envelope').disabled = busy;
  $('download-result').hidden = order.state !== 'COMPLETE'; $('download-result').disabled = busy;
  $('reconcile').hidden = !order.chargeId && order.state === 'CREATED'; $('reconcile').disabled = busy;
  $('signature-form').hidden = !order.chargeId || ['COMPLETE', 'PAYMENT_FAILED'].includes(order.state) || order.signatureRetained;
  $('history').replaceChildren();
  for (const item of [...received.history].reverse()) {
    const row = element('li'), time = element('time', readableDate(item.createdAt)); time.dateTime = item.createdAt;
    row.append(time, element('strong', item.kind.toLowerCase().replaceAll('_', ' ')));
    const detail = Object.entries(item.details ?? {}).filter(([, value]) => value !== null).map(([key, value]) => key + ': ' + value).join(' · ');
    if (detail) row.append(element('div', detail, 'history-detail'));
    $('history').append(row);
  }
}
$('connect-form').addEventListener('submit', event => {
  event.preventDefault();
  action(async () => {
    token = $('operator-token').value; await refresh(); $('operator-token').value = '';
    $('connect-panel').hidden = true; $('workspace').hidden = false; $('disconnect').hidden = false;
    $('connection-state').textContent = 'Connected'; renderRails();
    if (poll) clearInterval(poll);
    poll = setInterval(() => { if (!busy && token) refresh().catch(error => notice(error.message)); }, 15000);
  });
});
$('disconnect').addEventListener('click', disconnect);
$('refresh').addEventListener('click', () => action(refresh));
$('search').addEventListener('input', () => { if (state) renderList(); });
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
    sessionStorage.removeItem(pendingKey()); selectedId = created.order.id; $('create-panel').hidden = true;
    $('create-form').reset(); renderRails(); await refresh();
    notice('Invoice saved. Create its payment request when the terms are ready.');
  });
});
$('create-charge').addEventListener('click', () => action(async () => { await api('/api/orders/' + selectedId + '/charge', { method: 'POST' }); await refresh(); }));
$('download-envelope').addEventListener('click', () => action(() => download('/api/orders/' + selectedId + '/envelope', 'payment-request-' + selectedId + '.json')));
$('reconcile').addEventListener('click', () => action(async () => { await api('/api/orders/' + selectedId + '/reconcile', { method: 'POST' }); await refresh(); }));
$('download-result').addEventListener('click', () => action(async () => {
  const detail = await api('/api/orders/' + selectedId);
  await download('/api/orders/' + selectedId + '/result', detail.order.result.fileName);
}));
$('signature-form').addEventListener('submit', event => {
  event.preventDefault();
  action(async () => {
    const signature = $('signature').value;
    if (!signature) throw new Error('Paste the complete buyer authorization.');
    await api('/api/orders/' + selectedId + '/payment-authorization', { method: 'POST', body: { paymentSignature: signature } });
    $('signature').value = ''; await refresh();
  });
});
