// MIT — Share complete request inputs and adopt them into the existing customer editor.
import { parsePlanPackage, credentialHeader, representationHeader } from '/collection-composer/package-format.mjs';
const BASE = '/api/composer/sharing/packages';
const HASH = /^[a-f0-9]{64}$/;
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const copy = value => JSON.parse(JSON.stringify(value));
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
};
const add = (node, ...children) => { node.append(...children.flat().filter(Boolean)); return node; };
const button = (label, action) => {
  const node = el('button', label); node.type = 'button'; node.addEventListener('click', action); return node;
};
function table(labels, rows) {
  const head = el('tr'), body = el('tbody');
  labels.forEach(label => { const cell = el('th', label); cell.scope = 'col'; head.append(cell); });
  for (const values of rows) {
    const row = el('tr');
    values.forEach(value => row.append(add(el('td'), value instanceof Node ? value : el('span', value ?? '—'))));
    body.append(row);
  }
  return add(el('div', undefined, 'composer-table-wrap'), add(el('table'), add(el('thead'), head), body));
}
let sequence = 0;
function field(label, value, change, options = {}) {
  const wrap = el('div', undefined, 'composer-field'), id = 'shared-plan-field-' + (++sequence);
  const control = el(options.multiline ? 'textarea' : 'input'); control.id = id;
  if (options.multiline) control.rows = 3;
  else control.type = options.type ?? 'text';
  control.value = value ?? ''; control.spellcheck = false;
  if (options.placeholder) control.placeholder = options.placeholder;
  control.addEventListener('input', () => change(control.value));
  const title = el('label', label); title.htmlFor = id;
  add(wrap, title, control);
  if (options.help) add(wrap, el('p', options.help, 'composer-help'));
  return wrap;
}
const details = (title, ...children) => add(el('details', undefined, 'composer-details'), el('summary', title), ...children);
const bytes = value => new Intl.NumberFormat().format(value) + ' bytes';
function checkedPath(sha, action = '') {
  need(HASH.test(sha ?? ''), 'COLLECTION_PACKAGE_HASH_REQUIRED'); return BASE + '/' + sha + action;
}
export function createPlanSharingPanel({ api, run, navigate, onAdopted, say }) {
  let host, controller = new AbortController();
  let state = { mode: 'library', packages: [], selected: null, input: null, review: null, edition: null, headers: {} };
  const call = (path, body) => api(path, body, { signal: controller.signal });
  const changed = () => { state.review = null; if (host) host.querySelector('[data-adoption-review]')?.remove(); };
  function bind(manifest, packageSha256) {
    state.selected = { packageSha256, manifest, phase: 'READY' };
    state.input = { packageSha256, planId: manifest.plan.id + (manifest.plan.id.length <= 74 ? '-local' : ''),
      name: manifest.plan.name, description: manifest.plan.description ?? '',
      operatorBindings: manifest.operators.map(group => ({ groupId: group.id, operatorWorkspace: '' })),
      outputDirectory: '', deliveryParameter: 'delivery',
      deliveryValue: '', requestBindings: manifest.sources.filter(source => source.ticket || source.headers.some(header => header.kind === 'local'))
        .map(source => ({ key: source.key, ...(source.ticket ? { ticketFile: '' } : {}), headers: {}, omitHeaders: [] })) };
    state.review = null; state.mode = 'adopt';
  }
  async function open(sha) {
    await run('Opening shared plan…', async alive => {
      const packet = await call(checkedPath(sha));
      if (!alive()) return;
      state.selected = packet;
      if (packet.phase === 'READY') bind(packet.manifest, packet.packageSha256);
      else state.mode = 'incomplete';
      render(); say(packet.phase === 'READY' ? 'Choose your local operator and delivery bindings.' : 'Choose the same package file to continue its retained upload.');
    });
  }
  async function refresh() {
    await run('Reading shared plans…', async alive => {
      const result = await call(BASE);
      if (!alive()) return;
      state.packages = result.packages; state.mode = 'library'; render(); say('');
    });
  }
  async function receive(file) {
    if (!file) return;
    need(file.size > 0 && file.size <= 208 * 1024 * 1024, 'COLLECTION_PACKAGE_FILE_TOO_LARGE');
    await run('Receiving shared plan…', async alive => {
      let packet, footer = null;
      const offsets = new Map();
      for await (const record of parsePlanPackage(file.stream())) {
        if (!alive()) return;
        if (record.type === 'manifest') {
          packet = await call(BASE, { manifest: record.manifest });
          if (!alive()) return;
          packet.objects.forEach(object => offsets.set(object.sha256, object.receivedBytes));
          say('Receiving ' + packet.manifest.plan.name + ' · ' + bytes(packet.receivedBytes) + ' retained');
        } else if (record.type === 'object') {
          need(packet, 'COLLECTION_PACKAGE_MANIFEST_REQUIRED');
          const retained = offsets.get(record.sha256);
          if (record.offset < retained) continue;
          need(record.offset === retained, 'COLLECTION_PACKAGE_CHUNK_ORDER_INVALID');
          const receipt = await call(checkedPath(packet.packageSha256, '/chunks'),
            { objectSha256: record.sha256, offset: record.offset, base64: record.base64 });
          if (!alive()) return;
          const length = record.base64.length / 4 * 3 - (record.base64.endsWith('==') ? 2 : record.base64.endsWith('=') ? 1 : 0);
          need(receipt.packageSha256 === packet.packageSha256 && receipt.objectSha256 === record.sha256
            && receipt.receivedBytes === record.offset + length, 'COLLECTION_PACKAGE_CHUNK_RECEIPT_INVALID');
          offsets.set(record.sha256, receipt.receivedBytes);
          say('Receiving ' + packet.manifest.plan.name + ' · ' + bytes([...offsets.values()].reduce((sum, value) => sum + value, 0)) + ' retained');
        } else footer = record;
      }
      need(packet && footer?.packageSha256 === packet.packageSha256, 'COLLECTION_PACKAGE_INCOMPLETE');
      const complete = await call(checkedPath(packet.packageSha256, '/complete'), {});
      if (!alive()) return;
      need(complete.phase === 'READY', 'COLLECTION_PACKAGE_INCOMPLETE');
      bind(complete.manifest, complete.packageSha256); render();
      say('Complete plan and input files received. Bind this buyer’s local operator before saving the adopted revision.');
    });
  }
  async function saveDownload(descriptor, alive) {
    const response = await api(checkedPath(descriptor.packageSha256, '/file'), undefined,
      { stream: true, signal: controller.signal });
    need(response.ok && response.body && Number(response.headers.get('Content-Length')) === descriptor.bytes,
      'COLLECTION_PACKAGE_DOWNLOAD_INCOMPLETE');
    const reader = response.body.getReader(), chunks = []; let count = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        if (!alive()) { await reader.cancel(); return; }
        count += value.byteLength;
        need(count <= descriptor.bytes && count <= 208 * 1024 * 1024, 'COLLECTION_PACKAGE_DOWNLOAD_CHANGED');
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    need(count === descriptor.bytes, 'COLLECTION_PACKAGE_DOWNLOAD_INCOMPLETE');
    const blob = new Blob(chunks, { type: 'application/x-ndjson' });
    const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
      value => value.toString(16).padStart(2, '0')).join('');
    need(actual === descriptor.sha256, 'COLLECTION_PACKAGE_DOWNLOAD_CHANGED');
    if (!alive()) return;
    const url = URL.createObjectURL(blob), link = el('a');
    link.href = url; link.download = descriptor.name;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function download(sha) {
    await run('Preparing complete plan download…', async alive => {
      const descriptor = await call(checkedPath(sha, '/file'), {});
      if (!alive()) return;
      await saveDownload(descriptor, alive);
      if (alive()) say('Complete request plan and input files downloaded.');
    });
  }
  async function exportEdition() {
    const edition = state.edition;
    await run('Retaining shared plan and its complete input files…', async alive => {
      const headerSelections = Object.entries(state.headers).map(([key, names]) => ({ key, names }));
      const descriptor = await call('/api/composer/sharing/export',
        { collectionId: edition.collectionId, expectedEditionSha256: edition.editionSha256, headerSelections });
      if (!alive()) return;
      state.selected = { packageSha256: descriptor.packageSha256, manifest: descriptor.manifest, phase: 'READY' };
      await saveDownload(descriptor, alive);
      if (alive()) say('Shared plan prepared and downloaded. Its package remains available in Shared plans.');
    });
  }
  async function review() {
    const input = copy(state.input);
    await run('Reviewing all recipient bindings against the original offers…', async alive => {
      const result = await call(checkedPath(input.packageSha256, '/review'), withoutPackage(input));
      if (!alive()) return;
      state.review = result; render();
      say('Review the exact local operators, offers and response destinations, then save this adopted revision.');
    });
  }
  const withoutPackage = ({ packageSha256, ...value }) => value;
  async function adopt() {
    const input = copy(state.input), reviewed = state.review;
    need(reviewed, 'COLLECTION_PACKAGE_ADOPTION_REVIEW_REQUIRED');
    await run('Saving the adopted immutable plan revision…', async alive => {
      const result = await call(checkedPath(input.packageSha256, '/adopt'),
        { ...withoutPackage(input), expectedReviewSha256: reviewed.reviewSha256 });
      if (!alive()) return;
      onAdopted(result.saved, result.adoption);
      say('Adopted revision saved. Review its requests here, then prepare a named period through the existing Collections workflow.');
    });
  }
  function receiveControl() {
    const input = el('input'); input.type = 'file'; input.accept = '.jsonl,application/x-ndjson'; input.hidden = true;
    input.addEventListener('change', () => { const file = input.files?.[0]; input.value = ''; void receive(file).catch(error => say(error.code ?? error.message, true)); });
    return add(el('div', undefined, 'composer-actions'), button('Receive shared plan', () => input.click()), input);
  }
  function library() {
    add(host, el('h3', 'Shared plans'),
      el('p', 'Receive a complete plan and its catalog and body files, then choose this buyer’s own operator, credentials and response destination.', 'composer-help'),
      add(el('div', undefined, 'composer-actions'), receiveControl(), button('Refresh shared plans', refresh)));
    add(host, table(['Plan', 'Source period', 'Requests', 'Input files', 'State', ''], state.packages.map(packet => [
      packet.name, packet.sourceCollectionId, packet.requestCount,
      bytes(packet.receivedBytes) + ' / ' + bytes(packet.totalBytes), packet.phase === 'READY' ? 'Ready to adopt' : 'Upload incomplete',
      add(el('div', undefined, 'composer-actions'), button(packet.phase === 'READY' ? 'Adopt plan' : 'Resume upload', () => open(packet.packageSha256)),
        packet.phase === 'READY' ? button('Download package', () => download(packet.packageSha256)) : null),
    ])));
    if (!state.packages.length) add(host, el('p', 'Use Receive shared plan to open a .request-plan.jsonl file. Prepared periods can create a package from their complete retained inputs.', 'composer-help'));
  }
  function exportView() {
    const edition = state.edition;
    add(host, el('h3', 'Share plan and inputs'), el('p', edition.name),
      el('p', 'This package contains the complete saved plan and the catalog and body bytes captured for this period. Recipient operators and operation tickets are bound on the receiving workspace.', 'composer-help'),
      table(['Source', 'Reference'], [['Plan', edition.planId], ['Plan revision', edition.planSha256],
        ['Period', edition.collectionId], ['Edition revision', edition.editionSha256]]));
    const choices = el('div');
    for (const request of edition.requests ?? []) {
      const headers = Object.keys(request.operation?.headers ?? {});
      if (!headers.length) continue;
      add(choices, el('h4', request.name));
      for (const name of headers) {
        if (credentialHeader(name)) { add(choices, el('p', name + ' · recipient-local value required', 'composer-help')); continue; }
        if (representationHeader(name)) { add(choices, el('p', name + ' · included representation header', 'composer-help')); continue; }
        const checkbox = el('input'); checkbox.type = 'checkbox';
        checkbox.checked = (state.headers[request.key] ?? []).includes(name);
        checkbox.addEventListener('change', () => {
          const names = new Set(state.headers[request.key] ?? []);
          checkbox.checked ? names.add(name) : names.delete(name);
          state.headers[request.key] = [...names];
        });
        add(choices, add(el('label', undefined, 'composer-choice'), checkbox, el('span', ' Include ' + name + ' value in the package')));
      }
    }
    add(host, choices, button('Create and download shared plan', exportEdition));
    if (state.selected) add(host, el('p', 'Retained package: ' + state.selected.packageSha256, 'composer-help'));
  }
  function adoption() {
    const manifest = state.selected.manifest, input = state.input;
    add(host, el('h3', 'Adopt shared plan'), el('p', manifest.plan.name),
      table(['Included request', 'Method', 'Resource', 'Body'], manifest.plan.requests.map((request,index) =>
        [request.name, request.method, request.url, manifest.sources[index].body ? bytes(manifest.sources[index].body.bytes) : 'No body'])),
      details('Original source mapping', table(['Reference', 'Value'], [['Package', state.selected.packageSha256],
        ['Source plan', manifest.origin.planId], ['Source revision', manifest.origin.planSha256],
        ['Captured period', manifest.origin.collectionId], ['Edition revision', manifest.origin.editionSha256]])),
      el('h4', 'Local plan'));
    add(host, add(el('div', undefined, 'composer-grid'),
      field('Local plan reference', input.planId, value => { input.planId = value; changed(); }),
      field('Plan name', input.name, value => { input.name = value; changed(); })),
      field('Description', input.description, value => { input.description = value; changed(); }, { multiline: true }));
    add(host, el('h4', 'Local operators'));
    manifest.operators.forEach((group,index) => {
      const binding = input.operatorBindings[index], card = el('section', undefined, 'composer-card');
      add(card, el('h5', group.id + ' · ' + group.actor + ' / ' + group.service),
        el('p', 'Source ' + group.kind + ': ' + group.path, 'composer-help'),
        el('p', 'Requests: ' + manifest.sources.filter(source => source.operatorGroup === group.id).map(source => source.key).join(', '), 'composer-help'));
      const type = el('select');
      for (const [value,label] of [['operatorWorkspace','Existing local workspace'],['operatorConfigFile','Existing local operator configuration']]) {
        const option = el('option', label); option.value = value; type.append(option);
      }
      let key = binding.operatorWorkspace !== undefined ? 'operatorWorkspace' : 'operatorConfigFile';
      type.value = key; type.setAttribute('aria-label', group.id + ' local operator type');
      type.addEventListener('change', () => {
        const value = binding[key]; delete binding[key]; key = type.value; binding[key] = value; changed(); render();
      });
      add(card, type, field('Local absolute path', binding[key], value => { binding[key] = value; changed(); },
        { help: 'Uses this operator’s existing signing identity, policy and spending limit.' })); add(host, card);
    });
    add(host, el('h4', 'Delivery outputs'), add(el('div', undefined, 'composer-grid'),
      field('Local response directory', input.outputDirectory, value => { input.outputDirectory = value; changed(); }, { placeholder: '/absolute/local/responses' }),
      field('Delivery parameter', input.deliveryParameter, value => { input.deliveryParameter = value; changed(); }),
      field('Delivery value', input.deliveryValue, value => { input.deliveryValue = value; changed(); }, { placeholder: 'october-review' })),
      el('p', 'Each response uses {{delivery parameter}}--request-key.response. Use a new delivery value for later output files. Catalog and body files remain the exact captured inputs; changing a business period or body requires a new source and saved plan revision.', 'composer-help'));
    if (input.requestBindings.length) add(host, el('h4', 'Recipient-local request requirements'));
    input.requestBindings.forEach(binding => {
      const source = manifest.sources.find(item => item.key === binding.key), request = manifest.plan.requests.find(item => item.key === binding.key);
      const section = el('section', undefined, 'composer-card'); add(section, el('h5', request.name));
      if (source.ticket) {
        add(section, field('Local operation ticket file', binding.ticketFile, value => { binding.ticketFile = value; changed(); }),
          details('Source ticket requirement', table(['Property', 'Value'], Object.entries(source.ticket.metadata))));
      }
      for (const header of source.headers.filter(item => item.kind === 'local')) {
        const omitted = binding.omitHeaders.includes(header.name);
        const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = omitted;
        checkbox.addEventListener('change', () => {
          binding.omitHeaders = checkbox.checked ? [...binding.omitHeaders.filter(name => name !== header.name), header.name]
            : binding.omitHeaders.filter(name => name !== header.name);
          if (checkbox.checked) delete binding.headers[header.name];
          changed(); render();
        });
        add(section, add(el('label', undefined, 'composer-choice'), checkbox, el('span', ' Omit ' + header.name + ' in this local plan')));
        if (!omitted) add(section, field('Local ' + header.name + ' value', binding.headers[header.name],
          value => { binding.headers[header.name] = value; changed(); }, { type: header.credential ? 'password' : 'text' }));
      }
      add(host, section);
    });
    add(host, button('Review local plan', review));
    if (state.review) {
      const panel = el('section', undefined, 'composer-period-review'); panel.dataset.adoptionReview = 'true';
      add(panel, el('h4', 'Reviewed local plan'),
        table(['Request', 'Local operator', 'Network', 'Recipient', 'Maximum · atomic', 'Response destination'],
          state.review.operators.map(operator => [operator.key, operator.configFile, operator.expect.network,
            operator.expect.payTo, operator.expect.maxAtomic, operator.responseOut])),
        el('p', 'Saving adds one immutable plan revision to this workspace. Open its editor and prepare a named period to obtain the original collection review.', 'composer-help'),
        button('Save adopted revision', adopt)); add(host, panel);
    }
  }
  function render(target) {
    if (target) host = target;
    if (!host) return;
    host.replaceChildren(); add(host, button('Back to request plans', () => navigate('back')));
    if (state.mode === 'export') exportView();
    else if (state.mode === 'adopt') adoption();
    else if (state.mode === 'incomplete') {
      add(host, el('h3', 'Resume shared plan upload'),
        el('p', state.selected.manifest.plan.name + ' · ' + bytes(state.selected.receivedBytes) + ' retained of ' + bytes(state.selected.totalBytes)),
        el('p', 'Choose the original complete package file. Already retained input chunks are reused.', 'composer-help'), receiveControl());
    } else library();
  }
  return {
    render,
    async showLibrary() { state.mode = 'library'; navigate('sharing'); await refresh(); },
    showExport(edition) { state.edition = copy(edition); state.headers = {}; state.selected = null; state.mode = 'export'; navigate('sharing'); },
    reconnect() {
      controller.abort(); controller = new AbortController(); state.review = null; host = null;
    },
    reset() {
      controller.abort(); controller = new AbortController(); host = null;
      state = { mode: 'library', packages: [], selected: null, input: null, review: null, edition: null, headers: {} };
    },
  };
}
