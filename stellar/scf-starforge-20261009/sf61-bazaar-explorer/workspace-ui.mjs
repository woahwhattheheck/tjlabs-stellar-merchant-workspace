// MIT. Retained catalog selection and native buyer receiving in the original Atlas.
const MARKUP = `
  <div class="workspace-head">
    <div><span class="caption">04 / SAVED WORKSPACE</span><h2 id="saved-workspace-heading" tabindex="-1">Catalogs and buyer requests</h2></div>
    <p class="workspace-note">Retain original catalog pages, select exact terms and keep each prepared request with its source.</p>
  </div>
  <p id="aw-status" class="status" role="status" aria-live="polite">Opening your saved workspace…</p>
  <div id="aw-controls" hidden>
    <div class="aw-toolbar">
      <div class="field"><label for="aw-capture-name">Name for an imported capture</label><input id="aw-capture-name" maxlength="120" autocomplete="off" placeholder="Provider · October catalog"></div>
      <div class="aw-buttons"><button type="button" class="secondary" id="aw-import-folder">Open capture folder</button><button type="button" class="secondary" id="aw-import-page">Open saved page</button><button type="button" class="secondary" id="aw-retain-live">Retain displayed page</button><button type="button" class="secondary" id="aw-refresh">Reload saved workspace</button></div>
      <input id="aw-folder-input" type="file" webkitdirectory multiple hidden><input id="aw-page-input" type="file" accept=".json,application/json" hidden>
    </div>
    <details id="aw-review-intake" class="aw-review-intake"><summary>Receive a catalog review</summary>
      <p>Open the complete selection downloaded from the grant reader. Review its original page, exact payment option and applied search before saving it in this workspace.</p>
      <label for="aw-review-file">Complete catalog review JSON</label><input id="aw-review-file" type="file" accept=".json,application/json">
      <p id="aw-review-status" class="status" role="status" aria-live="polite">Choose the original complete review file.</p>
      <div id="aw-review-preview" hidden><dl id="aw-review-terms" class="review-terms"></dl><details><summary>Selected original declaration</summary><pre id="aw-review-declaration"></pre></details>
      <div class="aw-buttons"><button id="aw-review-receive" type="button" class="primary" disabled>Receive and open this request</button><button id="aw-review-clear" type="button" class="secondary">Clear review</button></div></div>
    </details>
    <div id="aw-import-progress" class="aw-progress" hidden><span id="aw-import-progress-text" role="status" aria-live="polite"></span><button id="aw-import-stop" type="button" class="secondary small">Stop after current page</button></div>
    <p id="aw-summary" class="aw-summary"></p>
    <div class="aw-tabs" role="tablist" aria-label="Saved workspace views"><button id="aw-tab-captures" role="tab" aria-selected="true" aria-controls="aw-captures-panel" type="button">Saved catalogs</button><button id="aw-tab-requests" role="tab" aria-selected="false" aria-controls="aw-requests-panel" tabindex="-1" type="button">Buyer requests</button></div>
    <section id="aw-captures-panel" role="tabpanel" aria-labelledby="aw-tab-captures">
      <div class="aw-table-scroll"><table class="aw-table"><caption class="aw-sr-only">Retained original catalog captures</caption><thead><tr><th scope="col">Capture</th><th scope="col">Source</th><th scope="col">Coverage</th><th scope="col">State</th><th scope="col">Open</th></tr></thead><tbody id="aw-captures"></tbody></table></div>
      <div id="aw-catalog" class="aw-catalog" hidden>
        <div class="aw-section-head"><h3 id="aw-catalog-title" tabindex="-1">Saved offers</h3><span id="aw-catalog-source" class="muted"></span></div>
        <form id="aw-search-form" class="aw-search">
          <div class="field aw-query"><label for="aw-search">Search this capture</label><input id="aw-search" type="search" maxlength="1024" autocomplete="off" placeholder="Service, tool or declared request parameter"></div>
          <div class="field"><label for="aw-type">Resource type</label><select id="aw-type"><option value="">All types</option><option value="http">HTTP</option><option value="mcp">MCP</option></select></div>
          <div class="field"><label for="aw-network">Payment network</label><input id="aw-network" maxlength="2048" autocomplete="off" spellcheck="false" placeholder="stellar:testnet"></div>
          <div class="field"><label for="aw-scheme">Payment scheme</label><input id="aw-scheme" maxlength="2048" autocomplete="off" spellcheck="false" placeholder="exact"></div>
          <div class="field"><label for="aw-asset">Asset</label><input id="aw-asset" maxlength="2048" autocomplete="off" spellcheck="false" placeholder="Original asset identifier"></div>
          <div class="field"><label for="aw-payTo">Recipient</label><input id="aw-payTo" maxlength="2048" autocomplete="off" spellcheck="false" placeholder="Original payee identifier"></div>
          <div class="field"><label for="aw-extensions">Extension</label><input id="aw-extensions" maxlength="2048" autocomplete="off" spellcheck="false" placeholder="bazaar"></div>
          <div class="field"><label for="aw-page-size">Rows per page</label><select id="aw-page-size"><option>10</option><option selected>25</option><option>50</option><option>100</option><option>200</option></select></div>
          <div class="aw-buttons"><button type="submit" class="secondary">Apply search</button><button type="button" class="secondary" id="aw-clear-search">Show all rows</button><button type="button" class="secondary" id="aw-save-search">Download this result page</button></div>
        </form>
        <p id="aw-search-applied" class="muted"></p>
        <div class="field aw-selection-label"><label for="aw-selection-label">Label for the next saved request <span>(optional)</span></label><input id="aw-selection-label" maxlength="120" autocomplete="off" placeholder="Use a name that identifies the intended purchase"></div>
        <p id="aw-catalog-status" class="status" role="status" aria-live="polite"></p>
        <div id="aw-offers" class="aw-offers"></div>
        <div class="pager"><button type="button" class="secondary" id="aw-prev">Previous</button><span id="aw-page-info"></span><button type="button" class="secondary" id="aw-next">Next</button></div>
      </div>
    </section>
    <section id="aw-requests-panel" role="tabpanel" aria-labelledby="aw-tab-requests" hidden>
      <div class="aw-section-head"><h3>Saved buyer requests</h3><button type="button" class="secondary small" id="aw-compare" disabled>Compare selected requests</button></div>
      <div class="aw-table-scroll"><table class="aw-table"><caption class="aw-sr-only">Saved exact catalog selections and their native buyer revisions</caption><thead><tr><th scope="col">Compare</th><th scope="col">Request</th><th scope="col">Resource</th><th scope="col">State</th><th scope="col">Revision</th><th scope="col">Open</th></tr></thead><tbody id="aw-requests"></tbody></table></div>
      <div id="aw-comparison" class="aw-comparison" hidden><div class="aw-section-head"><h3 tabindex="-1" id="aw-comparison-title">Selected request terms</h3><button id="aw-close-comparison" type="button" class="secondary small">Close comparison</button></div><p class="muted">Each column retains its own source and selected payment option. Atomic amounts are displayed exactly as supplied.</p><div class="aw-table-scroll" id="aw-comparison-table"></div></div>
    </section>
    <section id="aw-request" class="aw-request" hidden aria-labelledby="aw-request-title">
      <div class="aw-section-head"><div><span class="caption">ORIGINAL BUYER PREPARATION</span><h3 id="aw-request-title" tabindex="-1"></h3></div><button type="button" class="secondary small" id="aw-reload-request">Reload saved revision</button></div>
      <p id="aw-request-context" class="status"></p>
      <dl id="aw-request-terms" class="review-terms"></dl>
      <div id="aw-request-review" hidden><p id="aw-request-review-origin" class="muted"></p><button id="aw-request-review-download" type="button" class="secondary small">Download original catalog review</button></div>
      <div id="aw-asset-workflow" hidden><h4>File delivery</h4><p class="muted">Choose an absolute output path on the buyer host. The original buyer checks the advertised file checksum, byte count and content type when receiving the purchase.</p><dl id="aw-asset-terms" class="review-terms"></dl></div>
      <form id="aw-request-form" class="review-form">
        <div class="field"><label for="aw-intent">Stable operation ID</label><input id="aw-intent" required maxlength="128" autocomplete="off" spellcheck="false" placeholder="service-request-001"></div>
        <div class="field"><label for="aw-method">HTTP method</label><select id="aw-method" required><option value="">Choose a method</option><option>GET</option><option>HEAD</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></div>
        <div class="field full"><label for="aw-url">Concrete request URL</label><input id="aw-url" required type="url" maxlength="8192" autocomplete="off" spellcheck="false"><small>Keep the original resource origin and its fixed path values. Resolve declared path parameters and enter the query values for this request.</small></div>
        <div class="field full"><label for="aw-headers">Request headers <span>(JSON object)</span></label><textarea id="aw-headers" rows="4" spellcheck="false" autocomplete="off" maxlength="16384">{}</textarea><small>Names and values use the original buyer’s header rules.</small></div>
        <div class="field full"><label for="aw-response-out">Response destination <span id="aw-response-label">(optional absolute path on the buyer host)</span></label><input id="aw-response-out" maxlength="4096" autocomplete="off" spellcheck="false" placeholder="/private/buyer/downloads/report.json"><small>Choose the output location explicitly for a downloadable asset.</small></div>
        <div class="field"><label for="aw-body-mode">Request body</label><select id="aw-body-mode"><option value="keep">Keep saved body</option><option value="replace">Replace with UTF-8 text</option><option value="remove">Remove body</option></select><small id="aw-body-info"></small></div>
        <div class="field"><label for="aw-ticket-mode">Operation ticket</label><select id="aw-ticket-mode"><option value="keep">Keep saved ticket</option><option value="replace">Replace from ticket JSON</option><option value="remove">Remove ticket</option></select><small id="aw-ticket-info"></small></div>
        <div class="field full"><label for="aw-ticket-header">Operation ticket header <span>(optional)</span></label><input id="aw-ticket-header" maxlength="128" autocomplete="off" spellcheck="false"><small>Keep the merchant’s original header when the request uses an operation ticket.</small></div>
        <div class="field full" id="aw-body-field" hidden><label for="aw-body">Exact request body</label><textarea id="aw-body" rows="7" spellcheck="false" autocomplete="off"></textarea><div class="aw-buttons"><button id="aw-load-body" type="button" class="secondary small">Read UTF-8 body file</button><span class="muted">An empty value keeps a present, zero-byte body.</span></div><input id="aw-body-file" type="file" hidden></div>
        <div class="field full" id="aw-ticket-field" hidden><label for="aw-ticket">Original operation ticket JSON</label><textarea id="aw-ticket" rows="6" spellcheck="false" autocomplete="off"></textarea><button id="aw-load-ticket" type="button" class="secondary small">Read ticket file</button><input id="aw-ticket-file" type="file" accept=".json,application/json" hidden></div>
        <div class="review-actions full"><button id="aw-prepare" type="submit" class="primary">Prepare and save revision</button><button id="aw-config-download" type="button" class="secondary" disabled>Download buyer configuration</button><button id="aw-create-handoff" type="button" class="secondary" disabled>Create buyer handoff</button><button id="aw-handoff-download" type="button" class="secondary" disabled>Download buyer handoff</button></div>
      </form>
      <p id="aw-request-status" class="status" role="status" aria-live="polite"></p>
      <div id="aw-prepared" hidden><h4>Continue in the original buyer</h4><p id="aw-prepared-intro" class="muted"></p><pre id="aw-native-commands"></pre><p id="aw-asset-next" class="muted" hidden>Use the saved configuration with the original buyer’s --init-workspace command and your operator, signer and spending settings. Review that operator workspace with --review-workspace, then execute it with --execute-workspace. To move this file purchase to another host, receive the complete Atlas workspace with atlas-workspace and prepare a revision with the receiving host’s output path.</p><pre id="aw-prepared-paths"></pre><details><summary>Prepared configuration</summary><pre id="aw-prepared-config"></pre></details></div>
      <details><summary>Original selected listing</summary><pre id="aw-original-listing"></pre></details>
    </section>
  </div>`;

const idOf = value => value?.selectionId ?? value?.id ?? value?.captureId;
const text = value => value === undefined || value === null || value === '' ? 'Not declared' : String(value);
const displayState = value => text(value).replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
const element = (tag, className = '', value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = text(value);
  return node;
};
const urlOf = listing => typeof listing?.resource === 'string' ? listing.resource : listing?.resource?.url ?? '';
const assetOf = value => (value?.listing ?? value?.originalListing)?.extensions?.['stellar-forge-asset'];
const shellQuote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
const methodOf = listing => listing?.extensions?.bazaar?.info?.input?.method ?? '';
const titleOf = listing => listing?.resource?.serviceName ?? listing?.resource?.name ?? listing?.description ?? urlOf(listing) ?? 'Catalog request';
function saveDownload(value, name) {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function fileText(file, maximum) {
  if (!file || file.size > maximum) throw new Error('The selected file is too large for this input.');
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()); }
  catch { throw new Error('This input must contain valid UTF-8 text.'); }
}
const ERROR_TEXT = {
  ATLAS_WORKSPACE_SESSION_REQUIRED: 'Open the complete workspace link printed by the launching terminal.',
  ATLAS_WORKSPACE_REVISION_CONFLICT: 'This request has a newer saved revision. Reload that revision before preparing another.',
  ATLAS_SELECTION_REVISION_CHANGED: 'This request has a newer saved revision. Reload that revision before preparing another.',
  CONCRETE_URL_MUST_MATCH_SELECTED_RESOURCE_PATH: 'Keep the selected origin and declared path; use concrete request values.',
  PATH_TEMPLATE_MISMATCH: 'The concrete URL must retain the selected fixed values and match its declared path template.',
  ATLAS_SEARCH_SNAPSHOT_CHANGED: 'This saved capture received another source page. Apply the search again to start from its current complete set of received pages.',
  ATLAS_SEARCH_TERMS_REQUIRED: 'Enter at least one searchable word or leave the query empty to browse the retained rows.',
  ATLAS_FILTER_INVALID: 'Use one exact declared value for each filter. All payment values must belong to the same offered option.',
  DISCOVERED_METHOD_MISMATCH: 'The method must match the original catalog listing.',
  BODY_DISALLOWED_FOR_METHOD: 'GET and HEAD cannot include a request body.',
  ASSET_RESPONSE_DESTINATION_REQUIRED: 'Choose an absolute response destination for this downloadable asset.',
  STABLE_INTENT_ID_REQUIRED: 'Enter a stable operation ID using letters, numbers, dots, hyphens, underscores or colons.',
};

export async function mountAtlasWorkspace({ getObservedPage = () => null } = {}) {
  const root = document.getElementById('saved-workspace');
  if (!root) return null;
  root.innerHTML = MARKUP;
  root.hidden = false;
  document.getElementById('saved-workspace-link')?.removeAttribute('hidden');
  const $ = id => root.querySelector('#' + id);
  const token = /^[a-f0-9]{64}$/.test(location.hash.slice(1)) ? location.hash.slice(1) : '';
  const state = { summary: null, capture: null, captureId: null, page: 0, query: '', selection: null,
    busy: false, dirty: false, selected: new Set(), importStopped: false, requestGeneration: 0,
    filters: {}, pageSize: 25, snapshotId: null, searchRevision: 0, catalogReview: null };

  // Keep the private session fragment intact while navigating sections.
  if (token) document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href^="#"]');
    const target = anchor && document.getElementById(anchor.getAttribute('href').slice(1));
    if (!target) return;
    event.preventDefault(); target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  const status = (message, error = false, target = $('aw-status')) => {
    target.textContent = message; target.classList.toggle('error', error);
  };
  async function api(route, value, method = value === undefined ? 'GET' : 'POST') {
    const response = await fetch('/api/workspace/' + route, { method, credentials: 'omit', cache: 'no-store',
      headers: { 'x-atlas-workspace-token': token, ...(value === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    let data;
    try { data = await response.json(); } catch { throw new Error('The workspace returned an unreadable response.'); }
    if (!response.ok) { const error = new Error(ERROR_TEXT[data.error] ?? displayState(data.error)); error.code = data.error; throw error; }
    return data;
  }
  function updateControls() {
    for (const node of root.querySelectorAll('button')) {
      if (node.id === 'aw-import-stop') continue;
      node.disabled = state.busy;
    }
    $('aw-review-file').disabled = state.busy;
    $('aw-review-receive').disabled = state.busy || !state.catalogReview;
    $('aw-review-clear').disabled = state.busy || !state.catalogReview;
    $('aw-request-review-download').disabled = state.busy || !state.selection?.catalogReview;
    $('aw-retain-live').disabled = state.busy || !getObservedPage();
    $('aw-save-search').disabled = state.busy || !state.capture;
    $('aw-prev').disabled = state.busy || !state.capture || state.page === 0;
    const paging = state.capture?.pagination;
    $('aw-next').disabled = state.busy || !paging || (paging.page + 1) * paging.pageSize >= paging.total;
    $('aw-compare').disabled = state.busy || state.selected.size < 2;
    const prepared = state.selection?.prepared, handoff = state.selection?.handoff;
    $('aw-config-download').disabled = state.busy || state.dirty || !prepared;
    $('aw-create-handoff').hidden = assetOf(state.selection) !== undefined;
    $('aw-handoff-download').hidden = assetOf(state.selection) !== undefined;
    $('aw-create-handoff').disabled = state.busy || state.dirty || !prepared || assetOf(state.selection) !== undefined;
    $('aw-handoff-download').disabled = state.busy || state.dirty || !handoff;
    $('aw-prepare').disabled = state.busy || !state.selection;
    for (const node of root.querySelectorAll('[data-unsupported="true"]')) node.disabled = true;
    root.setAttribute('aria-busy', String(state.busy));
  }
  async function run(label, callback, target = $('aw-status')) {
    if (state.busy) return;
    state.busy = true; updateControls(); status(label, false, target);
    try { const result = await callback(); if (target.textContent === label) status('Saved workspace ready.', false, target); return result; }
    catch (error) { status(error.message, true, target); }
    finally { state.busy = false; updateControls(); }
  }
  function button(label, action, className = 'secondary small') {
    const node = element('button', className, label); node.type = 'button'; node.addEventListener('click', action); return node;
  }
  function emptyRow(tbody, cols, message) {
    const row = element('tr'), cell = element('td', 'aw-empty', message); cell.colSpan = cols; row.append(cell); tbody.append(row);
  }
  function tab(name, focus = false) {
    for (const current of ['captures', 'requests']) {
      const active = current === name, control = $('aw-tab-' + current);
      control.setAttribute('aria-selected', String(active)); control.tabIndex = active ? 0 : -1;
      $('aw-' + current + '-panel').hidden = !active;
      if (active && focus) control.focus();
    }
  }
  for (const name of ['captures', 'requests']) $('aw-tab-' + name).addEventListener('click', () => tab(name));
  root.querySelector('.aw-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    tab(event.key === 'Home' ? 'captures' : event.key === 'End' ? 'requests'
      : $('aw-tab-captures').getAttribute('aria-selected') === 'true' ? 'requests' : 'captures', true);
  });
  function renderSummary() {
    const current = state.summary, captures = current.captures ?? [], selections = current.selections ?? [];
    $('aw-summary').textContent = captures.length + ' retained capture' + (captures.length === 1 ? '' : 's') + ' · ' + selections.length + ' saved request' + (selections.length === 1 ? '' : 's');
    const captureRows = $('aw-captures'); captureRows.replaceChildren();
    if (!captures.length) emptyRow(captureRows, 5, 'Open an original capture folder or saved catalog page to begin.');
    for (const capture of captures) {
      const row = element('tr'), name = element('td');
      name.append(element('strong', '', capture.name ?? idOf(capture)), element('div', 'muted', capture.updatedAt ?? ''));
      const source = element('td', 'aw-wrap', capture.source ?? capture.request?.origin ?? 'Saved source');
      const pages = Array.isArray(capture.pages) ? capture.pages.length : capture.pages ?? 0;
      row.append(name, source, element('td', '', (capture.rows ?? 0) + ' rows / ' + pages + ' pages'),
        element('td', '', displayState(capture.status ?? capture.kind)), element('td'));
      row.lastChild.append(button('Browse', () => run('Opening retained capture…', () => openCapture(idOf(capture), '', 0, { filters: {}, replaceForm: true }))));
      captureRows.append(row);
    }
    const rows = $('aw-requests'); rows.replaceChildren();
    if (!selections.length) emptyRow(rows, 6, 'Choose one exact payment option in a saved catalog.');
    const ids = new Set(selections.map(idOf));
    for (const selected of state.selected) if (!ids.has(selected)) state.selected.delete(selected);
    for (const selection of selections) {
      const id = idOf(selection), row = element('tr'), choose = element('td'), checkbox = element('input');
      checkbox.type = 'checkbox'; checkbox.checked = state.selected.has(id);
      checkbox.setAttribute('aria-label', 'Compare ' + (selection.label ?? id));
      checkbox.addEventListener('change', () => {
        if (checkbox.checked && state.selected.size >= 6) { checkbox.checked = false; status('Compare up to six saved requests at a time.'); return; }
        checkbox.checked ? state.selected.add(id) : state.selected.delete(id); updateControls();
      });
      choose.append(checkbox);
      row.append(choose, element('td', '', selection.label ?? id), element('td', 'aw-wrap',
        typeof selection.resource === 'string' ? selection.resource : selection.resource?.url ?? selection.request?.url ?? urlOf(selection.listing)),
        element('td', '', displayState(selection.stage)), element('td', '', selection.revision ?? 0), element('td'));
      row.lastChild.append(button('Open', () => run('Opening saved request…', () => openSelection(id)))); rows.append(row);
    }
  }
  async function refreshSummary() {
    state.summary = await api('summary'); renderSummary(); return state.summary;
  }
  const searchFields = ['type', 'network', 'scheme', 'asset', 'payTo', 'extensions'];
  function searchInputs() {
    return { query: $('aw-search').value.trim(),
      filters: Object.fromEntries(searchFields.map(key => [key, $('aw-' + key).value.trim()]).filter(([, value]) => value)),
      pageSize: Number($('aw-page-size').value) };
  }
  function displayAppliedSearch() {
    if (!state.capture) return;
    const filterText = Object.entries(state.filters).map(([key, value]) => key + '=' + value).join(' · ');
    const draft = searchInputs(), changed = draft.query !== state.query || draft.pageSize !== state.pageSize ||
      searchFields.some(key => (draft.filters[key] ?? '') !== (state.filters[key] ?? ''));
    $('aw-search-applied').textContent = 'Applied: ' + (state.query ? '“' + state.query + '” · relevance order' : 'all retained rows · source order') +
      (filterText ? ' · ' + filterText : '') + (changed ? '. Edited filters are ready to apply.' : '.');
  }
  async function openCapture(captureId, query = state.query, page = state.page, options = {}) {
    const changedCapture = captureId !== state.captureId;
    const filters = options.filters ?? (changedCapture ? {} : state.filters);
    const pageSize = options.pageSize ?? state.pageSize;
    const snapshotId = options.snapshotId ?? null, revision = state.searchRevision, draft = searchInputs();
    const unapplied = draft.query !== state.query || draft.pageSize !== state.pageSize ||
      searchFields.some(key => (draft.filters[key] ?? '') !== (state.filters[key] ?? ''));
    const params = new URLSearchParams({ captureId, query, page: String(page), pageSize: String(pageSize), ...filters });
    if (snapshotId) params.set('snapshotId', snapshotId);
    const result = await api('capture?' + params);
    state.capture = result; state.captureId = captureId;
    state.query = result.search.query; state.filters = result.search.filters;
    state.page = result.pagination.page; state.pageSize = result.pagination.pageSize; state.snapshotId = result.snapshotId;
    $('aw-catalog').hidden = false;
    // A slow read cannot erase text typed after this request started.
    if (state.searchRevision === revision && (options.replaceForm || changedCapture || !unapplied)) {
      $('aw-search').value = state.query;
      for (const key of searchFields) $('aw-' + key).value = state.filters[key] ?? '';
      $('aw-page-size').value = String(state.pageSize);
    }
    $('aw-catalog-title').textContent = result.capture?.name ?? 'Saved offers';
    $('aw-catalog-source').textContent = text(result.capture?.source ?? result.coverage?.sourceRequest?.origin);
    const offers = result.offers ?? [], container = $('aw-offers'); container.replaceChildren();
    if (!offers.length) container.append(element('p', 'aw-empty', query ? 'No indexed saved offers match this search.' : 'No retained rows match the applied filters.'));
    for (const offer of offers) {
      const listing = offer.listing, item = element('article', 'aw-offer'), header = element('div', 'aw-section-head');
      const input = listing?.extensions?.bazaar?.info?.input;
      header.append(element('h4', '', titleOf(listing)), element('span', 'aw-method', methodOf(listing) || input?.toolName || input?.type || 'Method undeclared'));
      item.append(header, element('p', 'aw-resource-url', urlOf(listing)),
        element('p', 'muted', (offer.rank === null ? '' : 'Rank ' + offer.rank + ' · ') + offer.pageFile + ' · original row ' + offer.row));
      if (offer.indexingError) item.append(element('p', 'muted', 'Retained source row · ' + offer.indexingError.message));
      const options = Array.isArray(listing?.accepts) ? listing.accepts : [];
      if (!options.length) item.append(element('p', 'muted', 'No payment alternatives are declared in this listing.'));
      for (let index = 0; index < options.length; index++) {
        const accepted = options[index], option = element('div', 'aw-option'), description = element('div');
        if (!accepted || typeof accepted !== 'object' || Array.isArray(accepted)) {
          option.append(element('p', 'muted', 'Original option ' + (index + 1) + ' has no usable payment declaration.'));
          item.append(option); continue;
        }
        const matches = offer.matchingAcceptIndexes.includes(index);
        description.append(element('strong', '', 'Option ' + (index + 1) + ' · ' + text(accepted.network) + ' · ' + text(accepted.scheme)),
          element('p', '', text(accepted.amount ?? accepted.maxAtomic) + ' atomic units'),
          element('p', 'aw-wrap', 'Asset: ' + text(accepted.asset)), element('p', 'aw-wrap', 'Recipient: ' + text(accepted.payTo)),
          element('p', 'muted', 'Timeout: ' + text(accepted.maxTimeoutSeconds) + ' seconds'));
        if (!matches) description.append(element('p', 'muted', 'Outside the applied payment filters.'));
        const choose = button('Save this selection', () => run('Saving the exact catalog selection…', async () => {
          const value = await api('selection/save', { captureId, pageFile: offer.pageFile, row: offer.row, accept: index,
            label: $('aw-selection-label').value.trim() || String(titleOf(listing)).slice(0, 90) + ' · option ' + (index + 1) });
          await refreshSummary(); await openSelection(idOf(value)); status('Original catalog selection saved.');
        }));
        const supported = matches && accepted.scheme === 'exact' && ['stellar:testnet', 'stellar:pubnet'].includes(accepted.network)
          && [undefined, 'http'].includes(listing.type) && [undefined, 'http'].includes(input?.type);
        if (!supported) {
          choose.disabled = true; choose.dataset.unsupported = 'true';
          choose.title = matches ? 'The original buyer requires an exact Stellar HTTP offer.' : 'Apply the intended payment filters before choosing this option.';
        }
        option.append(description, choose); item.append(option);
      }
      const details = element('details');
      details.append(element('summary', '', 'Original listing and request schema'), element('pre', '', JSON.stringify(listing, null, 2)));
      item.append(details); container.append(item);
    }
    const p = result.pagination, coverage = result.coverage;
    $('aw-page-info').textContent = 'Page ' + (p.page + 1) + ' · ' + p.total + ' matching original rows';
    let coverageText = coverage.receivedPages + '/' + coverage.expectedPages + ' retained pages · ' + coverage.receivedRows + ' original rows';
    if (coverage.reportedTotal !== null) coverageText += ' of ' + coverage.reportedTotal + ' provider-reported rows';
    if (!coverage.captureComplete) coverageText += ' · capture receiving remains in progress';
    if (coverage.totalChanged) coverageText += ' · the retained pages report different provider totals';
    else if (coverage.allReportedRowsPresent === true) coverageText += ' · declared total matched';
    else if (coverage.allReportedRowsPresent === false) coverageText += ' · provider coverage is partial';
    else coverageText += ' · whole-provider coverage is undeclared';
    if (result.search.unindexedRows) coverageText += ' · ' + result.search.unindexedRows + ' source rows have incomplete search metadata; browse all rows to inspect them';
    $('aw-catalog-status').textContent = coverageText + '. Search and selection use this retained source.';
    displayAppliedSearch(); tab('captures'); updateControls();
  }
  function renderSelection(value) {
    state.selection = value; state.dirty = false;
    const listing = value.listing ?? value.originalListing, accepted = value.acceptedTerms ?? listing?.accepts?.[value.accept] ?? {}, request = value.request ?? value.prepared?.config?.operation ?? {};
    $('aw-request').hidden = false; $('aw-request-title').textContent = value.label ?? titleOf(listing);
    $('aw-request-review').hidden = !value.catalogReview;
    $('aw-request-review-origin').textContent = value.catalogReview ? 'Original catalog review ' + value.catalogReview.packetId +
      ' · source ' + value.catalogReview.pageSha256 + ' · ' + (value.catalogReview.capturedAt ?? 'Capture time undeclared') +
      ' · applied query: ' + (value.catalogReview.search.query || 'All retained rows') : '';
    $('aw-request-context').textContent = 'Revision ' + value.revision + ' · ' + displayState(value.stage) + ' · ' + text(value.pageFile) + ' / row ' + value.row + ' / option ' + (Number(value.accept) + 1);
    const terms = $('aw-request-terms'); terms.replaceChildren();
    for (const [name, shown] of [['Network', accepted.network], ['Scheme', accepted.scheme], ['Amount / atomic units', accepted.amount ?? accepted.maxAtomic],
      ['Asset', accepted.asset], ['Recipient', accepted.payTo], ['Maximum timeout / seconds', accepted.maxTimeoutSeconds]]) {
      const cell = element('div', 'review-term'); cell.append(element('dt', '', name), element('dd', '', shown)); terms.append(cell);
    }
    $('aw-intent').value = request.intentId ?? '';
    $('aw-url').value = request.url ?? urlOf(listing);
    $('aw-method').value = request.method ?? methodOf(listing);
    $('aw-headers').value = JSON.stringify(request.headers ?? {}, null, 2);
    const asset = assetOf(value), fileDelivery = asset !== undefined;
    $('aw-asset-workflow').hidden = !fileDelivery;
    $('aw-response-out').required = fileDelivery;
    $('aw-response-label').textContent = fileDelivery ? '(required absolute path on the buyer host)' : '(optional absolute path on the buyer host)';
    const assetTerms = $('aw-asset-terms'); assetTerms.replaceChildren();
    if (fileDelivery) for (const [name, shown] of [['Download name', asset?.downloadName], ['Expected bytes', asset?.bytes], ['Content type', asset?.contentType], ['SHA-256', asset?.sha256]]) {
      const cell = element('div', 'review-term'); cell.append(element('dt', '', name), element('dd', '', shown)); assetTerms.append(cell);
    }
    $('aw-response-out').value = request.responseOut ?? value.prepared?.config?.responseFile?.destination ?? '';
    $('aw-ticket-header').value = request.ticketHeader ?? value.prepared?.config?.operation?.ticketHeader ?? '';
    $('aw-body-mode').value = 'keep'; $('aw-ticket-mode').value = 'keep'; $('aw-body').value = ''; $('aw-ticket').value = '';
    const inputs = value.inputs ?? {};
    $('aw-body-info').textContent = inputs.bodyPresent || request.bodyFile || value.prepared?.config?.operation?.bodyFile
      ? 'Saved body is retained' + (inputs.bodyBytes === undefined ? '.' : ' · ' + inputs.bodyBytes + ' bytes.') : 'No body is saved.';
    $('aw-ticket-info').textContent = inputs.ticketPresent || request.ticketFile || value.prepared?.config?.operation?.ticketFile ? 'An original operation ticket is retained.' : 'No operation ticket is saved.';
    $('aw-original-listing').textContent = JSON.stringify(listing, null, 2);
    $('aw-prepared').hidden = !value.prepared;
    if (value.prepared) {
      $('aw-prepared-intro').textContent = fileDelivery
        ? 'Continue file delivery from this saved configuration in the original buyer. It contains the selected file checks and your chosen output path.'
        : 'The saved configuration opens in the existing buyer review. A buyer handoff carries the original source and retained request inputs to another buyer workspace.';
      $('aw-asset-next').hidden = !fileDelivery;
      $('aw-native-commands').textContent = value.prepared.configPath
        ? 'starforge buyer --review --config ' + shellQuote(value.prepared.configPath) + (fileDelivery ? '\nstarforge buyer --help' : '')
        : 'Download the configuration to your buyer host, then run starforge buyer --review --config with its absolute path.';
      $('aw-prepared-config').textContent = value.prepared.configText;
      const prepared = value.prepared, lines = [prepared.configPath ? 'Saved configuration: ' + prepared.configPath : 'Download the configuration into your original buyer workspace.',
        'Configuration SHA-256: ' + prepared.configSha256, 'Source SHA-256: ' + prepared.sourceFileSha256];
      if (value.handoff) lines.push('Buyer handoff SHA-256: ' + value.handoff.sha256);
      $('aw-prepared-paths').textContent = lines.join('\n');
    }
    $('aw-body-field').hidden = true; $('aw-ticket-field').hidden = true;
    status(value.prepared ? (fileDelivery ? 'The saved file purchase is ready for review in the original buyer.' : 'The saved native preparation is ready to download or carry into a buyer handoff.') : 'Enter the intended request and prepare it with the original buyer.', false, $('aw-request-status'));
    tab('requests'); updateControls(); $('aw-request-title').focus();
  }
  async function openSelection(selectionId) {
    const generation = ++state.requestGeneration;
    const value = await api('selection?' + new URLSearchParams({ selectionId }));
    if (generation === state.requestGeneration) renderSelection(value);
  }
  function dirty() {
    state.dirty = true;
    $('aw-body-field').hidden = $('aw-body-mode').value !== 'replace';
    $('aw-ticket-field').hidden = $('aw-ticket-mode').value !== 'replace';
    status('Request edited. Prepare and save the next revision to retain these changes.', false, $('aw-request-status')); updateControls();
  }
  $('aw-request-form').addEventListener('input', dirty); $('aw-request-form').addEventListener('change', dirty);
  $('aw-request-form').addEventListener('submit', event => {
    event.preventDefault();
    run('Preparing and retaining the original buyer request…', async () => {
      let headers; try { headers = JSON.parse($('aw-headers').value); } catch { throw new Error('Request headers must be a JSON object.'); }
      if (!headers || typeof headers !== 'object' || Array.isArray(headers) || Object.values(headers).some(value => typeof value !== 'string'))
        throw new Error('Request headers must map each header name to a string value.');
      const request = { intentId: $('aw-intent').value.trim(), url: $('aw-url').value.trim(), method: $('aw-method').value, headers };
      if ($('aw-response-out').value.trim()) request.responseOut = $('aw-response-out').value.trim();
      if ($('aw-ticket-header').value.trim()) request.ticketHeader = $('aw-ticket-header').value.trim();
      const value = { selectionId: idOf(state.selection), revision: state.selection.revision, request };
      for (const name of ['body', 'ticket']) {
        const mode = $('aw-' + name + '-mode').value;
        if (mode !== 'keep') value[name + 'Text'] = mode === 'remove' ? null : $('aw-' + name).value;
      }
      const result = await api('selection/prepare', value); await refreshSummary();
      if (result.prepared) renderSelection(result); else await openSelection(idOf(state.selection));
    }, $('aw-request-status'));
  });
  $('aw-reload-request').addEventListener('click', () => run('Reloading the saved request…', () => openSelection(idOf(state.selection)), $('aw-request-status')));
  $('aw-config-download').addEventListener('click', () => {
    if (state.dirty || !state.selection?.prepared) return;
    saveDownload(state.selection.prepared.configText, 'buyer-' + idOf(state.selection).slice(0, 16) + '-r' + state.selection.revision + '.json');
  });
  $('aw-create-handoff').addEventListener('click', () => run('Creating the original buyer handoff…', async () => {
    if (assetOf(state.selection) !== undefined) return;
    const value = await api('selection/handoff', { selectionId: idOf(state.selection), revision: state.selection.revision });
    await refreshSummary(); if (value.handoff) renderSelection(value); else await openSelection(idOf(state.selection));
    status('Buyer handoff retained. Download it to receive the exact request in the original buyer workspace.', false, $('aw-request-status'));
  }, $('aw-request-status')));
  $('aw-handoff-download').addEventListener('click', () => {
    const handoff = state.selection?.handoff; if (state.dirty || !handoff) return;
    saveDownload(handoff.text ?? JSON.stringify(handoff.value, null, 2) + '\n', 'buyer-handoff-' + idOf(state.selection).slice(0, 16) + '-r' + state.selection.revision + '.json');
  });
  for (const [name, maximum] of [['body', 1048576], ['ticket', 16384]]) {
    $('aw-load-' + name).addEventListener('click', () => $('aw-' + name + '-file').click());
    $('aw-' + name + '-file').addEventListener('change', event => {
      const file = event.target.files[0]; event.target.value = ''; if (!file) return;
      run('Reading the selected ' + name + ' file…', async () => {
        $('aw-' + name).value = await fileText(file, maximum); dirty();
        status('Exact UTF-8 ' + name + ' bytes loaded. Prepare the request to retain them.', false, $('aw-request-status'));
      }, $('aw-request-status'));
    });
  }
  $('aw-refresh').addEventListener('click', () => run('Reloading saved workspace…', async () => { await refreshSummary(); status('Saved workspace reloaded.'); }));
  const searchEdited = () => { state.searchRevision++; displayAppliedSearch(); };
  $('aw-search-form').addEventListener('input', searchEdited);
  $('aw-search-form').addEventListener('change', searchEdited);
  $('aw-search-form').addEventListener('submit', event => {
    event.preventDefault(); const input = searchInputs();
    run('Searching retained offers…', () => openCapture(state.captureId, input.query, 0, { ...input, replaceForm: true }));
  });
  $('aw-clear-search').addEventListener('click', () => run('Opening all retained rows…',
    () => openCapture(state.captureId, '', 0, { filters: {}, pageSize: Number($('aw-page-size').value), replaceForm: true })));
  $('aw-save-search').addEventListener('click', () => {
    if (!state.capture) return;
    saveDownload(JSON.stringify(state.capture, null, 2) + '\n',
      'atlas-search-' + state.captureId.slice(0, 24) + '-page-' + state.page + '.json');
  });
  $('aw-prev').addEventListener('click', () => run('Opening previous saved page…',
    () => openCapture(state.captureId, state.query, state.page - 1, { snapshotId: state.snapshotId })));
  $('aw-next').addEventListener('click', () => run('Opening next saved page…',
    () => openCapture(state.captureId, state.query, state.page + 1, { snapshotId: state.snapshotId })));
  function clearCatalogReview() {
    state.catalogReview = null; $('aw-review-file').value = '';
    $('aw-review-preview').hidden = true;
    status('Choose the original complete review file.', false, $('aw-review-status')); updateControls();
  }
  $('aw-review-clear').addEventListener('click', clearCatalogReview);
  $('aw-review-file').addEventListener('change', event => {
    const file = event.target.files?.[0]; if (!file || state.busy) return;
    run('Reading the complete catalog selection…', async () => {
      state.catalogReview = null; $('aw-review-preview').hidden = true;
      const reviewText = await fileText(file, 8 * 1048576);
      const reviewed = await api('catalog-review/inspect', { reviewText });
      state.catalogReview = { reviewText, reviewed };
      const terms = $('aw-review-terms'); terms.replaceChildren();
      for (const [name, value] of [['Label', reviewed.label], ['Original rows', reviewed.source.rows],
        ['Provider total', reviewed.coverage?.reportedTotal], ['Selected row / payment option', reviewed.selection.row + ' / ' + (reviewed.selection.acceptIndex + 1)],
        ['Query', reviewed.search.query || 'All retained rows'], ['Network', reviewed.acceptedTerms.network],
        ['Asset', reviewed.acceptedTerms.asset], ['Amount / atomic units', reviewed.acceptedTerms.amount ?? reviewed.acceptedTerms.maxAtomic],
        ['Recipient', reviewed.acceptedTerms.payTo], ['Complete page SHA-256', reviewed.source.pageSha256]]) {
        const cell = element('div', 'review-term'); cell.append(element('dt', '', name), element('dd', '', value)); terms.append(cell);
      }
      $('aw-review-declaration').textContent = JSON.stringify(reviewed.listing, null, 2);
      $('aw-review-preview').hidden = false;
      status('Complete original selection ready. Receive it to continue in the existing request editor.', false, $('aw-review-status'));
    }, $('aw-review-status'));
  });
  $('aw-review-receive').addEventListener('click', () => {
    const selected = state.catalogReview; if (!selected) return;
    run('Receiving the original source and selected terms…', async () => {
      const result = await api('catalog-review/receive', { reviewText: selected.reviewText,
        ...($('aw-capture-name').value.trim() ? { name: $('aw-capture-name').value.trim() } : {}) });
      await refreshSummary(); renderSelection(result.selection);
      status('Original catalog review retained with this request. Continue its explicit request preparation.', false, $('aw-review-status'));
    }, $('aw-review-status'));
  });
  $('aw-request-review-download').addEventListener('click', () => {
    const selected = state.selection;
    if (!selected?.catalogReview) return;
    run('Reading the complete original catalog review…', async () => {
      const result = await api('catalog-review?' + new URLSearchParams({ selectionId: idOf(selected) }));
      if (state.selection !== selected) return;
      const bytes = new TextEncoder().encode(result.text);
      if (result.packetId !== selected.catalogReview.packetId || bytes.length !== result.bytes)
        throw new Error('The returned review does not match this selected request.');
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      if (digest !== result.sha256) throw new Error('The complete original review digest differs.');
      saveDownload(result.text, 'atlas-catalog-review-' + result.packetId.slice(0, 16) + '.json');
      status('Complete catalog review downloaded with its original source page.', false, $('aw-request-status'));
    }, $('aw-request-status'));
  });
  $('aw-import-folder').addEventListener('click', () => $('aw-folder-input').click());
  $('aw-import-page').addEventListener('click', () => $('aw-page-input').click());
  $('aw-import-stop').addEventListener('click', () => { state.importStopped = true; $('aw-import-stop').disabled = true; });
  $('aw-folder-input').addEventListener('change', event => {
    const files = Array.from(event.target.files); event.target.value = ''; if (!files.length) return;
    run('Receiving original catalog capture…', async () => {
      const jsonFiles = files.filter(file => /(?:^|\/)(session\.json|manifest\.json|page-[0-9]{6}\.json)$/.test(file.webkitRelativePath || file.name));
      const names = new Map();
      const roots = new Set(jsonFiles.map(file => (file.webkitRelativePath || file.name).replace(/[^/]+$/, '')));
      if (roots.size !== 1) throw new Error('Choose one original capture folder containing its session, manifest and page files.');
      for (const file of jsonFiles) { if (names.has(file.name)) throw new Error('The capture contains duplicate filenames.'); names.set(file.name, file); }
      if (!names.has('session.json') || !names.has('manifest.json')) throw new Error('An original capture folder needs session.json and manifest.json. Use Open saved page for an individual observation.');
      const started = await api('capture/begin', { name: $('aw-capture-name').value.trim() || (files[0].webkitRelativePath || files[0].name).split('/')[0],
        sessionText: await fileText(names.get('session.json'), 1048576), manifestText: await fileText(names.get('manifest.json'), 8 * 1048576) });
      const captureId = idOf(started);
      const pages = started.missingPages;
      if (!Array.isArray(pages) || pages.some(name => !/^page-[0-9]{6}\.json$/.test(name))) throw new Error('The workspace returned an invalid receiving plan.');
      if (pages.some(name => !names.has(name))) throw new Error('The selected folder is missing an original page named by its manifest. Retained pages remain available for a later resume.');
      state.importStopped = false; $('aw-import-progress').hidden = false; $('aw-import-stop').disabled = false;
      try {
        for (let index = 0; index < pages.length; index++) {
          if (state.importStopped) { await refreshSummary(); status('Capture receiving paused. Reopen the same folder to continue from its retained pages.'); return; }
          $('aw-import-progress-text').textContent = 'Retaining missing page ' + (index + 1) + ' of ' + pages.length + '…';
          const file = pages[index]; await api('capture/page', { captureId, file, text: await fileText(names.get(file), 1048576) });
        }
        await api('capture/finish', { captureId }); await refreshSummary(); await openCapture(captureId, '', 0, { filters: {}, replaceForm: true });
        status('Original capture retained. Browse its saved offers and select the exact terms for a request.');
      } finally { $('aw-import-progress').hidden = true; }
    });
  });
  async function receivePage(pageText, name) {
    const result = await api('capture/receive-page', { pageText, name });
    await refreshSummary(); await openCapture(idOf(result), '', 0, { filters: {}, replaceForm: true }); status('Original saved page retained.');
  }
  $('aw-page-input').addEventListener('change', event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    run('Receiving the original saved page…', async () => receivePage(await fileText(file, 1048576), $('aw-capture-name').value.trim() || file.name));
  });
  $('aw-retain-live').addEventListener('click', () => run('Retaining the displayed native observation…', async () => {
    const raw = getObservedPage(); if (!raw) throw new Error('Load a catalog page before retaining it.');
    await receivePage(raw, $('aw-capture-name').value.trim() || 'Atlas observation ' + new Date().toISOString());
  }));
  $('aw-close-comparison').addEventListener('click', () => { $('aw-comparison').hidden = true; $('aw-compare').focus(); });
  $('aw-compare').addEventListener('click', () => run('Opening selected saved request terms…', async () => {
    const values = await Promise.all([...state.selected].map(selectionId => api('selection?' + new URLSearchParams({ selectionId }))));
    const table = element('table', 'aw-table aw-compare-table'), thead = element('thead'), head = element('tr');
    const lead = element('th', '', 'Field'); lead.scope = 'col'; head.append(lead);
    for (const value of values) { const cell = element('th', '', value.label ?? idOf(value)); cell.scope = 'col'; head.append(cell); }
    thead.append(head); table.append(thead); const tbody = element('tbody');
    const rows = [['Source capture', v => v.captureId], ['Original page / row / option', v => text(v.pageFile) + ' / ' + v.row + ' / ' + (Number(v.accept) + 1)],
      ['Resource', v => urlOf(v.listing)], ['Method', v => v.request?.method ?? methodOf(v.listing)],
      ['Network', v => v.acceptedTerms?.network], ['Scheme', v => v.acceptedTerms?.scheme],
      ['Amount / atomic units', v => v.acceptedTerms?.amount ?? v.acceptedTerms?.maxAtomic], ['Asset', v => v.acceptedTerms?.asset],
      ['Recipient', v => v.acceptedTerms?.payTo], ['Timeout / seconds', v => v.acceptedTerms?.maxTimeoutSeconds],
      ['Saved revision', v => v.revision], ['Preparation', v => displayState(v.stage)]];
    for (const [label, read] of rows) {
      const row = element('tr'), name = element('th', '', label); name.scope = 'row'; row.append(name);
      for (const value of values) row.append(element('td', 'aw-wrap', read(value))); tbody.append(row);
    }
    table.append(tbody); $('aw-comparison-table').replaceChildren(table); $('aw-comparison').hidden = false;
    $('aw-comparison-title').focus(); status('Selected original request terms opened.');
  }));
  await run('Opening the saved workspace…', async () => {
    await refreshSummary(); $('aw-controls').hidden = false; status('Your retained catalogs and buyer requests are ready.');
  });
  return { refresh: refreshSummary, observationChanged: updateControls };
}
