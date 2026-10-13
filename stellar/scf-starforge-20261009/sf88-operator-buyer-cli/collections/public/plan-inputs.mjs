// MIT — Retain actual buyer catalogs and request bodies in the existing private workspace.
import { INPUT_UPLOAD_SCHEMA, INPUT_CHUNK_BYTES as CHUNK_BYTES, INPUT_LIMITS,
  validateInputManifest, inputManifestJson } from '/collection-composer/input-format.mjs';
const INPUT_SCHEMA = 'stellar-forge.sf88.collection-input.v1';
const INPUT_STATUS_SCHEMA = 'stellar-forge.sf88.collection-input-status.v1';
const INPUT_CHUNK_SCHEMA = 'stellar-forge.sf88.collection-input-chunk.v1';
const INPUT_LIST_SCHEMA = 'stellar-forge.sf88.collection-inputs.v1';
const BASE = '/api/composer/inputs';
const HASH = /^[a-f0-9]{64}$/;
const need = (value, message) => { if (!value) throw new Error(message); };
const copy = value => JSON.parse(JSON.stringify(value));
const bytes = value => Number(value ?? 0).toLocaleString() + ' bytes';
const hex = buffer => Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, '0')).join('');
const digest = async buffer => hex(await crypto.subtle.digest('SHA-256', buffer));
const manifestId = async manifest => digest(new TextEncoder().encode(inputManifestJson(manifest)));
const el = (tag, text, className) => {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = String(text);
  if (className) item.className = className;
  return item;
};
const add = (parent, ...items) => { parent.append(...items.flat().filter(Boolean)); return parent; };
const button = (label, action, className) => {
  const item = el('button', label, className); item.type = 'button';
  item.addEventListener('click', action); return item;
};
let fieldSequence = 0;
function field(label, value, change, type = 'text') {
  const wrap = el('div', undefined, 'composer-field'), input = el('input');
  input.type = type; input.value = value ?? ''; input.id = 'plan-input-field-' + (++fieldSequence);
  input.addEventListener('input', () => change(input.value));
  const title = el('label', label); title.htmlFor = input.id;
  return add(wrap, title, input);
}
function checkedPath(id, suffix = '') {
  need(HASH.test(id), 'The saved input reference is invalid.');
  return BASE + '/' + id + suffix;
}
async function checkStatus(status, id, manifest) {
  need(status?.schema === INPUT_STATUS_SCHEMA && status.uploadId === id
    && ['UPLOADING', 'READY'].includes(status.phase) && status.chunkBytes === CHUNK_BYTES,
  'The workspace returned a different input upload.');
  const actual = validateInputManifest(status.manifest);
  need(await manifestId(actual) === id && inputManifestJson(actual) === inputManifestJson(manifest),
    'The retained file manifest changed. Reopen the original input.');
  need(Array.isArray(status.receivedChunks) && new Set(status.receivedChunks).size === status.receivedChunks.length
    && status.receivedChunks.every(index => Number.isInteger(index) && index >= 0 && index < manifest.chunkSha256.length),
    'The retained input chunk list is invalid.');
  const receivedBytes = status.receivedChunks.reduce((total, index) => total + Math.min(CHUNK_BYTES, manifest.bytes - index * CHUNK_BYTES), 0);
  need(status.receivedBytes === receivedBytes, 'The retained input byte count is inconsistent.');
  if (status.phase === 'READY') {
    const input = status.input;
    need(receivedBytes === manifest.bytes && input?.schema === INPUT_SCHEMA && input.id === id
      && input.kind === manifest.kind && input.name === manifest.name && input.bytes === manifest.bytes
      && HASH.test(input.sha256) && typeof input.path === 'string' && input.path.startsWith('/'),
    'The completed input does not match this file.');
  }
  return status;
}
export async function describeLocalInput(file, kind, { alive = () => true, onProgress = () => {} } = {}) {
  need(file && typeof file.slice === 'function' && Number.isSafeInteger(file.size) && file.size >= 0,
    'Choose the original file from this device.');
  need(Object.hasOwn(INPUT_LIMITS, kind) && file.size <= INPUT_LIMITS[kind] && (kind !== 'catalog' || file.size > 0),
    kind === 'catalog' ? 'Choose a saved catalog up to 1 MiB.' : 'Choose a request body up to 16 MiB.');
  need(globalThis.crypto?.subtle, 'This browser needs a secure context to retain source files.');
  const chunkSha256 = [];
  for (let start = 0; start < file.size; start += CHUNK_BYTES) {
    if (!alive()) return null;
    const data = await file.slice(start, Math.min(start + CHUNK_BYTES, file.size)).arrayBuffer();
    if (!alive()) return null;
    chunkSha256.push(await digest(data));
    if (!alive()) return null;
    onProgress(Math.min(start + CHUNK_BYTES, file.size), file.size);
  }
  return validateInputManifest({ schema: INPUT_UPLOAD_SCHEMA, kind, name: file.name, bytes: file.size, chunkSha256 });
}
export function createPlanInputsPanel({ api, run, navigate, onSelected, say }) {
  let host = null, controller = new AbortController();
  let state = initial();
  function initial() {
    return { kind: 'catalog', selectKind: null, query: '', offset: 0, limit: 25,
      listing: null, selected: null, file: null, progress: '', attempted: false };
  }
  const signal = () => controller.signal;
  function progress(message) {
    state.progress = message;
    const node = host?.querySelector('[data-input-progress]');
    if (node) node.textContent = message;
  }
  async function readList(alive) {
    const result = await api(BASE + '/list',
      { kind: state.kind, query: state.query, offset: state.offset, limit: state.limit }, { signal: signal() });
    if (!alive()) return false;
    need(result?.schema === INPUT_LIST_SCHEMA && Array.isArray(result.inputs)
      && Number.isSafeInteger(result.total) && result.total >= 0 && result.offset === state.offset,
    'The workspace returned an invalid input list.');
    state.listing = result; state.attempted = true; return true;
  }
  async function refresh() {
    await run('Reading retained input files…', async alive => {
      if (await readList(alive)) { render(); say('Saved input files refreshed.'); }
    });
  }
  async function open(id) {
    await run('Opening the saved input…', async alive => {
      const result = await api(checkedPath(id), undefined, { signal: signal() });
      if (!alive()) return;
      const manifest = validateInputManifest(result?.manifest);
      const checked = await checkStatus(result, id, manifest);
      if (!alive()) return;
      state.selected = checked; state.file = null;
      render(); say(result.phase === 'READY' ? 'Saved input opened.' : 'Choose its original file to resume the upload.');
    });
  }
  async function receive(file) {
    if (!file) return;
    state.file = file;
    await run('Retaining the selected input file…', async alive => {
      const kind = state.selected?.phase === 'UPLOADING' ? state.selected.manifest.kind : state.kind;
      const manifest = await describeLocalInput(file, kind, { alive,
        onProgress: (done, total) => progress('Reading source file: ' + bytes(done) + ' of ' + bytes(total)) });
      if (!alive() || !manifest) return;
      const id = await manifestId(manifest);
      if (!alive()) return;
      if (state.selected?.phase === 'UPLOADING')
        need(state.selected.uploadId === id, 'Choose the same original file to resume this upload, or return to Saved inputs to add another file.');
      const status = await api(BASE, { manifest }, { signal: signal() });
      if (!alive()) return;
      const checked = await checkStatus(status, id, manifest);
      if (!alive()) return;
      state.selected = checked;
      const received = new Set(status.receivedChunks);
      render();
      for (let index = 0; index < manifest.chunkSha256.length; index++) {
        if (!alive()) return;
        if (received.has(index)) continue;
        const start = index * CHUNK_BYTES, part = file.slice(start, Math.min(start + CHUNK_BYTES, file.size));
        const receipt = await api(checkedPath(id, '/chunks/' + index), part,
          { raw: true, contentType: 'application/octet-stream', signal: signal() });
        if (!alive()) return;
        need(receipt?.schema === INPUT_CHUNK_SCHEMA && receipt.uploadId === id && receipt.index === index
          && receipt.bytes === part.size && receipt.sha256 === manifest.chunkSha256[index],
        'The input chunk receipt differs from the selected source file. Reopen this upload before continuing.');
        received.add(index);
        state.selected.receivedChunks = [...received].sort((a, b) => a - b);
        state.selected.receivedBytes += part.size;
        progress('Retained ' + bytes(state.selected.receivedBytes) + ' of ' + bytes(file.size));
      }
      const complete = await api(checkedPath(id, '/complete'), {}, { signal: signal() });
      if (!alive()) return;
      const completed = await checkStatus(complete, id, manifest);
      if (!alive()) return;
      state.selected = completed;
      need(complete.phase === 'READY', 'The file is still receiving. Resume this same input to complete it.');
      state.file = null; state.progress = '';
      render(); say('Input saved. Review it, then choose Use this file to update the request.');
    });
  }
  async function useSelected() {
    await run('Choosing the retained source…', async alive => {
      const current = state.selected;
      need(current?.phase === 'READY', 'Finish receiving this file before choosing it.');
      const fresh = await api(checkedPath(current.uploadId), undefined, { signal: signal() });
      if (!alive()) return;
      const status = await checkStatus(fresh, current.uploadId, current.manifest);
      if (!alive()) return;
      let catalog;
      if (status.input.kind === 'catalog') {
        catalog = await api(checkedPath(current.uploadId, '/catalog'), undefined, { signal: signal() });
        if (!alive()) return;
        need(Array.isArray(catalog?.rows), 'The saved catalog could not be inspected.');
      }
      state.selected = status;
      onSelected(copy(status.input), catalog);
    });
  }
  async function inspectCatalog() {
    await run('Reading the saved catalog…', async alive => {
      const selected = state.selected;
      need(selected?.phase === 'READY' && selected.input.kind === 'catalog', 'Choose a completed catalog.');
      const catalog = await api(checkedPath(selected.uploadId, '/catalog'), undefined, { signal: signal() });
      if (!alive()) return;
      need(Array.isArray(catalog?.rows), 'The saved catalog could not be inspected.');
      state.selected.catalog = catalog; render();
      say(catalog.rows.length + ' saved offers inspected.');
    });
  }
  async function download() {
    await run('Downloading the original source file…', async alive => {
      const selected = state.selected;
      need(selected?.phase === 'READY', 'Finish receiving this file before downloading it.');
      const { manifest, input } = selected;
      const response = await api(checkedPath(selected.uploadId, '/file'), undefined,
        { stream: true, signal: signal() });
      if (!alive()) { await response.body?.cancel(); return; }
      need(response.ok && response.body && Number(response.headers.get('Content-Length')) === manifest.bytes,
        'The source download length changed. Reopen the saved input.');
      const reader = response.body.getReader(), parts = [];
      let count = 0, index = 0, buffer = new Uint8Array(CHUNK_BYTES), used = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (!alive()) { await reader.cancel(); return; }
          if (done) break;
          need(value instanceof Uint8Array && count + value.byteLength <= manifest.bytes, 'The input download exceeded its saved length.');
          count += value.byteLength;
          let offset = 0;
          while (offset < value.byteLength) {
            const length = Math.min(CHUNK_BYTES - used, value.byteLength - offset);
            buffer.set(value.subarray(offset, offset + length), used); used += length; offset += length;
            if (used === CHUNK_BYTES) {
              need(await digest(buffer) === manifest.chunkSha256[index], 'Downloaded input bytes differ from the retained source.');
              if (!alive()) { await reader.cancel(); return; }
              parts.push(buffer); index++; buffer = new Uint8Array(CHUNK_BYTES); used = 0;
            }
          }
          progress('Downloaded ' + bytes(count) + ' of ' + bytes(manifest.bytes));
        }
        if (used) {
          const final = buffer.slice(0, used);
          need(await digest(final) === manifest.chunkSha256[index], 'Downloaded input bytes differ from the retained source.');
          parts.push(final); index++;
        }
        need(count === manifest.bytes && index === manifest.chunkSha256.length, 'The source download ended before the complete file.');
        if (!alive()) return;
        const url = URL.createObjectURL(new Blob(parts, { type: 'application/octet-stream' }));
        const link = el('a'); link.href = url; link.download = input.name;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        progress(''); say('Original input file downloaded.');
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); }
    });
  }
  function uploadControl(label = 'Choose file from this device') {
    const wrap = el('div', undefined, 'composer-field'), input = el('input');
    input.type = 'file'; input.id = 'plan-input-file-' + (++fieldSequence);
    if (state.kind === 'catalog') input.accept = '.json,application/json';
    const title = el('label', label); title.htmlFor = input.id;
    input.addEventListener('change', () => { const file = input.files?.[0]; input.value = ''; void receive(file); });
    return add(wrap, title, input,
      el('p', state.kind === 'catalog' ? 'Saved provider catalog JSON, up to 1 MiB.' : 'Exact request body bytes, up to 16 MiB. Empty bodies are supported.', 'composer-help'));
  }
  function library() {
    add(host, el('h3', state.selectKind ? 'Choose a saved ' + (state.kind === 'catalog' ? 'catalog' : 'request body') : 'Saved input files'),
      el('p', 'Retain source files in this private workspace and reuse them in your request plans. Interrupted uploads continue from the same original file.', 'composer-help'));
    if (!state.selectKind) {
      const types = el('div', undefined, 'composer-actions');
      for (const [kind, label] of [['catalog', 'Catalogs'], ['body', 'Request bodies']]) {
        const choice = button(label, () => { state.kind = kind; state.offset = 0; state.listing = null; void refresh(); });
        choice.setAttribute('aria-current', String(state.kind === kind)); add(types, choice);
      }
      add(host, types);
    }
    add(host, uploadControl(), field('Find a saved input', state.query, value => { state.query = value; }, 'search'),
      button('Search', () => { state.offset = 0; void refresh(); }));
    const listing = state.listing, list = el('div', undefined, 'composer-input-list');
    for (const input of listing?.inputs ?? []) {
      const ready = input.phase === 'READY';
      const item = button('', () => void open(input.id), 'composer-choice');
      add(item, el('strong', input.name), el('small', input.phase === 'UNAVAILABLE' ? 'Unavailable · ' + (input.error || 'Reopen this workspace to inspect the source.')
        : (ready ? 'Saved · ' + bytes(input.bytes) : 'Receiving · ' + bytes(input.receivedBytes) + ' of ' + bytes(input.bytes))));
      if (input.phase === 'UNAVAILABLE') item.disabled = true;
      add(list, item);
    }
    add(host, list);
    if (listing && !listing.inputs.length) add(host, el('p', 'No input files match this search.', 'composer-help'));
    if (listing) {
      const controls = el('div', undefined, 'composer-actions');
      const previous = button('Previous files', () => { state.offset = Math.max(0, state.offset - state.limit); void refresh(); });
      previous.disabled = state.offset === 0;
      const next = button('Next files', () => { state.offset += state.limit; void refresh(); });
      next.disabled = !listing.hasMore;
      add(host, el('p', (listing.inputs.length ? state.offset + 1 : 0) + '–' + (state.offset + listing.inputs.length) + ' of ' + listing.total + ' input files', 'composer-help'),
        add(controls, previous, next));
    }
  }
  function detail() {
    const status = state.selected, manifest = status.manifest, input = status.input;
    add(host, button('Saved inputs', () => { state.selected = null; state.file = null; state.progress = ''; render(); void refresh(); }),
      el('h3', manifest.name), el('p', (manifest.kind === 'catalog' ? 'Catalog' : 'Request body') + ' · ' + bytes(manifest.bytes), 'composer-help'));
    if (status.phase === 'READY') {
      const refs = el('dl', undefined, 'composer-input-reference');
      for (const [label, value] of [['Saved path', input.path], ['Source SHA-256', input.sha256], ['Saved', input.createdAt]]) add(refs, el('dt', label), el('dd', value));
      add(host, refs);
      const actions = el('div', undefined, 'composer-actions');
      if (state.selectKind === input.kind) add(actions, button('Use this file', () => void useSelected(), 'primary'));
      add(actions, button('Download original file', () => void download()));
      if (input.kind === 'catalog') add(actions, button('Inspect saved offers', () => void inspectCatalog()));
      add(host, actions);
      if (status.catalog) {
        add(host, el('h4', status.catalog.rows.length + ' saved offers'));
        const list = el('div', undefined, 'composer-offer-list');
        for (const row of status.catalog.rows) {
          const value = row.resource ?? row.listing?.resource ?? row.listing?.url;
          const url = typeof value === 'string' ? value : value?.url ?? '';
          add(list, add(el('div', undefined, 'composer-choice'), el('strong', row.description || row.listing?.description || url || 'Saved offer ' + (row.index + 1)),
            el('small', (row.method ?? 'GET') + ' · ' + url + ' · ' + (row.accepts?.length ?? 0) + ' advertised terms')));
        }
        add(host, list);
      }
      if (!state.selectKind) add(host, el('p', 'Open a request plan and choose its catalog or request body to use this saved file.', 'composer-help'));
    } else {
      add(host, el('p', bytes(status.receivedBytes) + ' retained of ' + bytes(manifest.bytes)),
        uploadControl('Choose the original file to resume'));
      if (state.file) add(host, button('Resume selected file', () => void receive(state.file)));
    }
  }
  function render(target) {
    if (target) host = target;
    if (!host) return;
    host.replaceChildren();
    add(host, button('Back to request plans', () => navigate('back')));
    if (state.selected) detail(); else library();
    const notice = el('p', state.progress, 'composer-help'); notice.dataset.inputProgress = 'true';
    notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite'); add(host, notice);
  }
  return {
    render,
    async show({ kind, select = false } = {}) {
      state.selectKind = select ? kind : null;
      if (kind && state.kind !== kind) { state.kind = kind; state.offset = 0; state.query = ''; state.listing = null; }
      state.selected = null; state.file = null; state.progress = '';
      navigate('inputs'); await refresh();
    },
    reconnect() { controller.abort(); controller = new AbortController(); host = null; state.progress = ''; },
    reset() { controller.abort(); controller = new AbortController(); host = null; state = initial(); },
  };
}
