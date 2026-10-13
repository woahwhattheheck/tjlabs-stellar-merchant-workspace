// MIT. Private original-project intake; credentials stay in the connected page.
const byId = id => document.getElementById(id);
const node = (tag, text) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = String(text); return value; };
let credential = null, session = 0, state = null, timer = null, busy = false, pageOffset = 0, nextOffset = null, filter = '', filesRequest = 0;
const phases = { READY: 'Ready to receive', RECEIVING: 'Receiving original project', RECEIVED: 'Opening original invoices',
  RETRY_REQUIRED: 'Resume original receiving', COMPLETE: 'Project received' };
const details = { READY: 'Review the original project and complete file inventory, then receive it into the selected private directory.',
  RECEIVING: 'The original native receiver is preserving the complete archive and preparing the independent runtime. This operation keeps its original request.',
  RECEIVED: 'The original receipt is saved. The application is opening the retained invoices and files.',
  RETRY_REQUIRED: 'The receiving operation retains its existing files and request. Resume that same operation after resolving the reported condition.',
  COMPLETE: 'The original project is received. Open the invoice workspace to review its payments, activity and complete retained results.' };
function notice(text = '') { byId('notice').textContent = text; }
function stopTimer() { if (timer !== null) clearTimeout(timer); timer = null; }
function disconnect() {
  ++session; ++filesRequest; credential = null; state = null; busy = false; stopTimer();
  byId('credential').value = ''; byId('connection').hidden = false; byId('desk').hidden = true;
  byId('phase').textContent = 'Disconnected';
  for (const id of ['identity','tables','files']) byId(id).replaceChildren();
  notice(''); byId('credential').focus();
}
async function request(path, options = {}, expected = session) {
  const token = credential;
  if (!token) throw new Error('Connect with the selected private review credential.');
  const response = await fetch(path, { ...options, redirect: 'error', cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token, ...(options.headers ?? {}) } });
  if (expected !== session || token !== credential) throw new Error('The intake desk connection changed.');
  if (!response.ok) {
    let error; try { error = await response.json(); } catch {}
    throw new Error(error?.error?.code ?? 'Request failed: HTTP ' + response.status);
  }
  return response;
}
function originalRows(values) {
  const list = [];
  for (const [label, value] of values) {
    const group = node('div'); group.append(node('dt', label), node('dd', value)); list.push(group);
  }
  return list;
}
function render(value) {
  state = value; const summary = value.summary;
  byId('phase').textContent = phases[value.state] ?? value.state;
  byId('progress').textContent = details[value.state] ?? value.state;
  byId('receiving-error').hidden = !value.error;
  byId('receiving-error').textContent = value.error ? value.error.code + ': ' + value.error.message : '';
  byId('identity').replaceChildren(...originalRows([
    ['Merchant store', summary.storeId], ['Export operation', summary.exportOperation],
    ['Original archive', summary.archive.path], ['Archive size', summary.archive.bytes + ' bytes'],
    ['Archive SHA-256', summary.archive.sha256], ['Native manifest identity', summary.manifestSha256],
    ['Original source SHA-256', summary.sourceSha256], ['Receiving operation', summary.operation],
    ['Receiving directory', summary.destination],
  ]));
  byId('tables').replaceChildren(...summary.tables.map(row => {
    const tr = node('tr'); tr.append(node('td', row.name), node('td', row.rows)); return tr;
  }));
  const receiving = ['RECEIVING','RECEIVED'].includes(value.state);
  byId('receive').disabled = busy || receiving || value.state === 'COMPLETE';
  byId('receive').textContent = value.state === 'RETRY_REQUIRED' ? 'Resume original receiving' : 'Receive project';
  byId('receipt').hidden = !value.receiptAvailable;
  byId('open-review').hidden = value.state !== 'COMPLETE' || !value.reviewUrl;
  byId('review-help').hidden = byId('open-review').hidden;
  if (value.reviewUrl) {
    const selected = new URL(value.reviewUrl);
    if (selected.protocol !== 'http:' || selected.hostname !== '127.0.0.1' ||
        selected.username || selected.password || selected.search || selected.hash)
      throw new Error('The original review address changed.');
    byId('open-review').href = selected.href;
  } else byId('open-review').removeAttribute('href');
  stopTimer();
  if (receiving && credential) {
    const expected = session;
    timer = setTimeout(() => { timer = null; void refresh(expected).catch(error => { if (expected === session) notice(error.message); }); }, 1500);
  }
}
async function refresh(expected = session) {
  const response = await request('/api/state', {}, expected), value = await response.json();
  if (expected !== session) return;
  if (state && value.selectionSha256 !== state.selectionSha256) throw new Error('The original project selection changed.');
  render(value);
}
async function filePage(offset = 0) {
  const expected = session, requestId = ++filesRequest;
  const query = new URLSearchParams({ offset: String(offset), limit: '50', filter });
  const value = await (await request('/api/files?' + query, {}, expected)).json();
  if (expected !== session || requestId !== filesRequest) return;
  if (value.manifestSha256 !== state.selection.manifestSha256) throw new Error('The original file inventory changed.');
  pageOffset = value.offset; nextOffset = value.nextOffset;
  byId('files').replaceChildren(...value.rows.map(file => {
    const row = node('tr'); row.append(node('td', file.path), node('td', file.bytes), node('td', file.sha256)); return row;
  }));
  byId('file-count').textContent = value.total + (filter ? ' matching files' : ' retained files');
  byId('page-position').textContent = value.total ? (value.offset + 1) + '–' + (value.offset + value.rows.length) + ' of ' + value.total : 'No matching file';
  byId('previous').disabled = value.offset === 0; byId('next').disabled = nextOffset === null;
}
async function download(path, filename) {
  const expected = session, response = await request(path, {}, expected), blob = await response.blob();
  if (expected !== session) return;
  const url = URL.createObjectURL(blob), link = node('a');
  link.href = url; link.download = filename; link.hidden = true; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function action(work) {
  return async event => {
    event?.preventDefault(); const expected = session;
    try { await work(); } catch (error) { if (expected === session) notice(error.message); }
  };
}
byId('connect').addEventListener('submit', async event => {
  event.preventDefault(); const token = byId('credential').value;
  if (token.length < 32) { notice('Use the complete selected private review credential.'); return; }
  ++session; const expected = session; credential = token; state = null; stopTimer(); notice('');
  try {
    await refresh(expected); if (expected !== session) return;
    byId('credential').value = ''; byId('connection').hidden = true; byId('desk').hidden = false;
    filter = ''; byId('filter').value = '';
    try { await filePage(0); }
    catch (error) {
      if (expected === session) notice('The original inventory could not be read. Use Find files to retry. ' + error.message);
    }
  } catch (error) {
    if (expected !== session) return;
    credential = null; state = null; stopTimer(); notice(error.message);
  }
});
byId('disconnect').addEventListener('click', disconnect);
byId('refresh').addEventListener('click', action(() => refresh()));
byId('search').addEventListener('submit', action(async () => { filter = byId('filter').value.trim(); await filePage(0); }));
byId('previous').addEventListener('click', action(() => filePage(Math.max(0, pageOffset - 50))));
byId('next').addEventListener('click', action(() => nextOffset === null ? undefined : filePage(nextOffset)));
byId('manifest').addEventListener('click', action(() => download('/api/manifest', 'merchant-project-manifest-' + state.summary.exportOperation + '.json')));
byId('receipt').addEventListener('click', action(() => download('/api/receipt', 'merchant-receiving-' + state.summary.operation + '.json')));
byId('receive').addEventListener('click', action(async () => {
  if (busy || !credential) return;
  const expected = session; busy = true; render(state); notice('');
  try {
    const response = await request('/api/receive', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{}' }, expected);
    const value = await response.json(); if (expected === session) render(value);
  } finally { if (expected === session) { busy = false; if (state) render(state); } }
}));
window.addEventListener('pagehide', () => { credential = null; stopTimer(); ++session; });

window.addEventListener('pageshow', event => { if (event.persisted) disconnect(); });
