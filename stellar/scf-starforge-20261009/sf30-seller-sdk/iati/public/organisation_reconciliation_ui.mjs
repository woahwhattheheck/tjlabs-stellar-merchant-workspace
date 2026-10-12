/* MIT. Financial reconciliation in the original IATI console. Loaded as a deferred classic script. */
'use strict';
window.IatiOrganisationReconciliationUi = function(api) {
  const BASE = '/api/iati/reconciliation/', PAGE = 50;
  const { get, post, request, action, status, download, metrics, table, properties, details } = api;
  const $ = name => document.getElementById('rec-' + name);
  const text = value => value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const short = value => text(value).slice(0, 12);
  const q = values => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, String(value)])).toString();
  const clone = value => JSON.parse(JSON.stringify(value));
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  let catalogue = { cases: [], organisationPlans: [], activityPortfolios: [] };
  let current = null, history = [], loadedSelection = null, selectedOrgPlan = null;
  let organisationRows = [], activityRows = [], organisationMap = new Map(), activityMap = new Map();
  let comparisons = [], decisions = new Map(), selectedActivity = new Set(), selectedOrganisation = null;
  let report = null, editing = -1, organisationOffset = 0, activityOffset = 0, dirty = false, selectionDirty = true;
  let pending = null, workspaceKey = null, mounted = false, database = null, activeTab = 'sources';
  let sourceDraft = null, restoredAction = null;
  const memory = new Map();
  const fresh = () => !current || catalogue.cases.find(item => item.id === current.id)?.revision === current.revision;
  const caseFrom = value => value?.case ?? value?.plan ?? value;
  function node(tag, value, className) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = text(value);
    if (className) element.className = className;
    return element;
  }
  function clear(element, message) {
    element.replaceChildren(); element.classList.toggle('empty', Boolean(message));
    if (message) element.textContent = message;
  }
  function run(message, operation) { return action(message, operation); }
  function optionList(element, items, selected, empty = 'Choose a saved record') {
    const previous = selected ?? element.value;
    element.replaceChildren(new Option(empty, ''));
    for (const item of items) element.add(new Option(item.label, item.id));
    element.value = items.some(item => String(item.id) === String(previous)) ? String(previous) : '';
  }
  function retainOption(element, value, label) {
    if (value !== undefined && value !== null && value !== '' && ![...element.options].some(option => option.value === String(value)))
      element.add(new Option(label, String(value)));
    element.value = value === undefined || value === null ? '' : String(value);
  }
  function sourceFormDraft() {
    return { organisation: { id: $('org-plan').value, revision: $('org-revision').value, organisationKey: $('org-key').value },
      portfolios: [...$('portfolios').querySelectorAll('[data-portfolio]')].map(input => ({
        id: input.dataset.portfolio, revision: input.closest('tr').querySelector('input[type="number"]').value, selected: input.checked
      })) };
  }
  function rememberSourceDraft() { sourceDraft = sourceFormDraft(); }
  function restoredView() {
    $('restored').hidden = !restoredAction;
    $('restored-summary').textContent = restoredAction ? 'Original ' + restoredAction.route + ' request '
      + restoredAction.input.requestId + ' is retained unchanged. Its values are restored for correction.'
      + (restoredAction.input.id ? ' The original case and expected revision ' + restoredAction.input.expectedRevision + ' are preserved.' : '')
      + (restoredAction.warning ? ' ' + restoredAction.warning : '') : '';
  }
  function downloadAction(value, filename) {
    if (!value) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
    const link = node('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function tab(name) {
    activeTab = name;
    $('panel').querySelectorAll('[data-rec-panel]').forEach(element => element.hidden = element.dataset.recPanel !== name);
    $('panel').querySelectorAll('[data-rec-tab]').forEach(element => {
      const selected = element.dataset.recTab === name;
      element.classList.toggle('active', selected); element.setAttribute('aria-selected', String(selected));
    });
  }
  function touch(resetDecisions = false) {
    dirty = true; report = null;
    if (resetDecisions) decisions.clear();
    renderReport();
    $('preview-note').textContent = 'Preview or save these financial selections to read their calculated findings.';
    buttons();
  }
  async function openDatabase() {
    if (database) return database;
    database = await new Promise((resolve, reject) => {
      const opening = indexedDB.open('sf30-iati-reconciliation-requests-v1', 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore('requests');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    return database;
  }
  async function storeRequest(mode, value, suffix = 'pending') {
    const key = workspaceKey + ':' + suffix, fallbackKey = 'sf30.iati.reconciliation.' + key;
    const marker = 'sf30.iati.reconciliation.fallback.v1';
    function fallback() {
      if (memory.has(key)) return memory.get(key);
      try {
        const raw = sessionStorage.getItem(fallbackKey);
        if (raw === null) return null;
        const saved = JSON.parse(raw);
        return saved?.schema === marker ? saved : { schema: marker, state: 'value', value: saved };
      } catch { return null; }
    }
    function retainFallback(record) {
      memory.set(key, record);
      try { sessionStorage.setItem(fallbackKey, JSON.stringify(record)); }
      catch {
        // A previous fallback must not become the owner of a later primary write.
        try { sessionStorage.removeItem(fallbackKey); } catch {}
        let older = null;
        try { older = sessionStorage.getItem(fallbackKey); } catch {}
        if (older !== null) throw new Error('The browser could not replace its older recovery record. Download the retained action before changing browser storage.');
      }
    }
    function retireFallback() {
      // Keep the new in-memory owner if storage cleanup is unavailable.
      try { sessionStorage.removeItem(fallbackKey); memory.delete(key); } catch {}
    }
    function valueOf(record) {
      if (record.state === 'deleted') return undefined;
      if (record.state !== 'value') throw new Error('The retained browser action has an unknown recovery state.');
      return record.value;
    }
    if (mode === 'read') {
      const owned = fallback();
      if (owned !== null) return valueOf(owned);
    } else {
      // The fallback explicitly owns this key until the primary transaction commits.
      // A deletion marker also suppresses an older primary value after a failed delete.
      retainFallback(mode === 'delete' ? { schema: marker, state: 'deleted' }
        : { schema: marker, state: 'value', value: clone(value) });
    }
    try {
      const db = await openDatabase();
      const answer = await new Promise((resolve, reject) => {
        const tx = db.transaction('requests', mode === 'read' ? 'readonly' : 'readwrite');
        const store = tx.objectStore('requests');
        const operation = mode === 'read' ? store.get(key) : mode === 'delete' ? store.delete(key) : store.put(value, key);
        let result;
        operation.onsuccess = () => { result = operation.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      if (mode !== 'read') retireFallback();
      return answer;
    } catch {
      const owned = fallback();
      return owned === null ? undefined : valueOf(owned);
    }
  }
  function pendingView() {
    $('pending').hidden = !pending;
    $('pending-summary').textContent = pending
      ? (pending.rejected ? 'The selected action needs a correction. ' : 'Continue or read the result of the saved action. ')
        + 'Request ' + pending.input.requestId + (pending.error ? ' · ' + pending.error : '') : '';
    $('revise-rejected').hidden = !pending?.rejected;
    if (pending) $('request-id').value = pending.input.requestId;
  }
  function mount() {
    if (mounted) return;
    mounted = true;
    const navigation = document.querySelector('nav[aria-label="Workspace"]') ?? document.querySelector('nav');
    const nav = node('button', 'Financial reconciliation');
    nav.type = 'button'; nav.id = 'rec-open-view'; nav.dataset.view = 'reconciliation';
    nav.onclick = () => api.show('reconciliation');
    navigation.insertBefore(nav, navigation.querySelector('[data-view="compare"]'));
    const panel = node('section'); panel.id = 'rec-panel'; panel.dataset.panel = 'reconciliation'; panel.hidden = true;
    panel.innerHTML =
      '<header class="section-heading"><p class="eyebrow">Organisation and activity finance</p><h1>Financial reconciliation</h1>' +
      '<p>Link assessed organisation budgets or expenditure to saved activity records, review the financial coverage, and retain the complete work.</p></header>' +
      '<div class="card rec-toolbar"><label>Saved reconciliation<select id="rec-case-select"></select></label><button id="rec-open">Open saved work</button>' +
      '<button id="rec-new">New reconciliation</button><label>Revision<select id="rec-revision"></select></label><button id="rec-open-revision">Open revision</button>' +
      '<span id="rec-case-state" class="fine"></span></div><div id="rec-counts" class="metrics"></div>' +
      '<div id="rec-pending" class="card" hidden><h2>Retained action</h2><p id="rec-pending-summary"></p><div class="row">' +
      '<button id="rec-reconcile">Read saved result</button><button id="rec-retry">Continue same action</button>' +
      '<button id="rec-revise-rejected">Edit rejected selection</button><button id="rec-pending-download">Download action record</button></div></div>' +
      '<div id="rec-restored" class="card" hidden><h2>Restored rejected action</h2><p id="rec-restored-summary"></p>' +
      '<button id="rec-restored-download">Download original rejected action</button></div>' +
      '<div class="rec-tabs" role="tablist" aria-label="Financial reconciliation stages">' +
      '<button data-rec-tab="sources" role="tab">1. Sources</button><button data-rec-tab="matches" role="tab">2. Record comparisons</button>' +
      '<button data-rec-tab="review" role="tab">3. Findings and review</button><button data-rec-tab="history" role="tab">4. History and delivery</button></div>' +
      '<div data-rec-panel="sources"><div class="rec-grid"><article class="card"><h2>Saved financial scope</h2>' +
      '<label>Reconciliation name<input id="rec-name" maxlength="160" required></label><label>Working notes<textarea id="rec-notes" rows="3"></textarea></label>' +
      '<label>Named operator<input id="rec-actor" maxlength="160" autocomplete="name"></label>' +
      '<label>Organisation plan<select id="rec-org-plan"></select></label><div class="rec-pair"><label>Saved plan revision<input id="rec-org-revision" type="number" min="1" step="1"></label>' +
      '<button id="rec-org-open">Read organisation choices</button></div><label>Organisation<select id="rec-org-key"></select></label>' +
      '<div id="rec-org-identity" class="fine rec-identity"></div></article><article class="card"><h2>Activity portfolios</h2>' +
      '<p>Select the saved portfolios and their exact revisions. Use <strong>Add saved revision</strong> to compare distinct editions of the same portfolio.</p><div id="rec-portfolios" class="table-scroll"></div></article></div>' +
      '<div class="card"><button id="rec-load" class="primary">Load financial records</button><p id="rec-selection-state" class="fine"></p>' +
      '<div id="rec-source-summary"></div></div></div>' +
      '<div data-rec-panel="matches" hidden><div class="rec-grid rec-registers">' +
      '<article class="card"><h2>Organisation record</h2><label>Find organisation records<input id="rec-org-search" type="search" placeholder="Budget family, recipient or period"></label>' +
      '<div id="rec-org-register"></div><div id="rec-org-page" class="row"></div></article>' +
      '<article class="card"><h2>Activity records</h2><div class="rec-filter-grid"><label>Find activity records<input id="rec-activity-search" type="search" placeholder="Activity identifier, recipient or type"></label>' +
      '<label>Currency<select id="rec-currency"><option value="">All currencies</option></select></label>' +
      '<label>Record family<select id="rec-collection"><option value="">All record families</option></select></label></div>' +
      '<div class="row"><label class="rec-check"><input id="rec-selected-only" type="checkbox"> Show selected rows</label>' +
      '<button id="rec-select-filtered">Select filtered rows</button><button id="rec-clear-selected">Clear selection</button><span id="rec-selected-count" class="fine"></span></div>' +
      '<div id="rec-activity-register"></div><div id="rec-activity-page" class="row"></div></article></div>' +
      '<article class="card"><h2 id="rec-editor-title">Add a comparison</h2>' +
      '<label class="rec-check"><input id="rec-no-activity" type="checkbox"> Record no selected activity coverage</label>' +
      '<p class="fine">This explicit selection retains an empty activity-row list and the native no-activity-selection finding. It does not assert that the organisation has no activity spending.</p><div class="rec-pair">' +
      '<label>Coverage<select id="rec-coverage"><option value="selected">Selected activity coverage</option><option value="complete">Complete organisation coverage</option></select></label>' +
      '<label>Value dates<select id="rec-value-dates"><option value="separate">Keep value dates separate</option><option value="nominal">Compare reported nominal amounts</option></select></label></div>' +
      '<label>Scope statement<textarea id="rec-scope" rows="3" placeholder="Describe the activity coverage and why these records belong together."></textarea></label>' +
      '<div class="row"><button id="rec-add" class="primary">Add explicit record comparison</button><button id="rec-cancel-edit" hidden>Cancel comparison edit</button></div>' +
      '<p class="fine">The calculated report retains original currency, periods, value dates, budget versions, hierarchy and every exclusion.</p></article>' +
      '<article class="card"><h2>Comparison definitions</h2><div id="rec-comparison-drafts"></div><div class="row">' +
      '<button id="rec-preview" class="primary">Preview financial findings</button><button id="rec-save">Save reconciliation</button></div></article>' +
      '<article class="card"><h2>Selected record detail</h2><div id="rec-record-detail" class="empty">Open a record to read its complete source context.</div></article></div>' +
      '<div data-rec-panel="review" hidden><article class="card"><h2>Financial coverage</h2><p id="rec-preview-note">Choose financial records to calculate coverage.</p>' +
      '<div id="rec-report-summary" class="metrics"></div><div id="rec-report-comparisons"></div><div id="rec-report-detail"></div>' +
      '<div class="row"><button id="rec-preview-review">Refresh findings</button><button id="rec-save-review" class="primary">Save reconciliation</button></div></article>' +
      '<article class="card"><h2>Issue decisions</h2><p>Record the named follow-through for the findings in this selection.</p><div id="rec-issues"></div>' +
      '<button id="rec-apply-decisions">Apply issue decisions</button></article>' +
      '<form id="rec-review-form" class="card"><h2>Named review of the saved revision</h2><p id="rec-review-state" class="fine"></p><div class="rec-pair">' +
      '<label>Reviewer<input id="rec-review-actor" maxlength="160" autocomplete="name" required></label>' +
      '<label>Decision<select id="rec-review-decision"><option value="approve">Approve</option><option value="request_changes">Request changes</option></select></label></div>' +
      '<label>Review note<textarea id="rec-review-note" rows="3" required></textarea></label><fieldset><legend>Acknowledged issues</legend><div id="rec-review-issues"></div></fieldset>' +
      '<button id="rec-review-submit" type="submit" class="primary">Save named review</button></form></div>' +
      '<div data-rec-panel="history" hidden><div class="rec-grid"><article class="card"><h2>Revision history</h2><div id="rec-history"></div>' +
      '<form id="rec-compare-form"><div class="rec-pair"><label>Before revision<select id="rec-compare-before"></select></label><label>After revision<select id="rec-compare-after"></select></label></div>' +
      '<button id="rec-compare-submit" type="submit">Compare revisions</button></form><div id="rec-history-comparison"></div></article>' +
      '<article class="card"><h2>Complete delivery</h2><p id="rec-delivery-state">Open a saved revision to prepare its financial report and source package.</p>' +
      '<div class="rec-deliveries"><button id="rec-file-report">Download report HTML</button><button id="rec-file-csv">Download comparison CSV</button>' +
      '<button id="rec-file-json">Download complete JSON</button><button id="rec-export" class="primary">Download complete source package</button></div>' +
      '<p class="fine">The selected revision travels with the organisation and activity source packages, financial records and review history.</p></article></div>' +
      '<form id="rec-receive-form" class="card"><h2>Receive a complete reconciliation package</h2><label>Saved package ZIP<input id="rec-receive-file" type="file" accept=".zip,application/zip" required></label>' +
      '<button type="submit">Receive and reopen</button><div id="rec-receive-result"></div></form>' +
      '<form id="rec-request-form" class="card"><h2>Recover a saved action</h2><label>Original request ID<input id="rec-request-id" maxlength="160" required></label>' +
      '<button type="submit">Read saved action result</button><div id="rec-request-result"></div></form></div>';
    const main = document.getElementById('main') ?? document.querySelector('main');
    main.insertBefore(panel, main.querySelector('footer'));
    panel.querySelectorAll('button').forEach(button => { if (!button.hasAttribute('type')) button.type = 'button'; });
    panel.querySelectorAll('[data-rec-tab]').forEach(button => button.onclick = () => tab(button.dataset.recTab));
    wire(); tab(activeTab); pendingView(); buttons();
  }
  function positive(value, label) {
    const selected = Number(value);
    if (!Number.isSafeInteger(selected) || selected < 1) throw new Error('Choose a saved ' + label + ' revision.');
    return selected;
  }
  function selectionFromForm() {
    const id = $('org-plan').value, organisationKey = $('org-key').value;
    if (!id || !organisationKey) throw new Error('Choose a saved organisation plan and organisation.');
    const portfolios = [...$('portfolios').querySelectorAll('[data-portfolio]:checked')].map(input => ({
      id: input.dataset.portfolio, revision: positive(input.closest('tr').querySelector('input[type="number"]').value, 'portfolio')
    }));
    if (!portfolios.length || portfolios.length > 32) throw new Error('Select 1–32 saved activity portfolio revisions.');
    if (new Set(portfolios.map(item => JSON.stringify([item.id, item.revision]))).size !== portfolios.length)
      throw new Error('Select each saved portfolio revision once. Distinct revisions of the same portfolio may be selected together.');
    portfolios.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : a.revision - b.revision);
    return { organisation: { id, revision: positive($('org-revision').value, 'organisation'), organisationKey }, portfolios };
  }
  function sourceChanged() {
    rememberSourceDraft();
    selectionDirty = true; dirty = true; report = null;
    renderReport();
    $('selection-state').textContent = 'Load the selected saved revisions before editing their financial comparisons.';
    buttons();
  }
  function renderPortfolios(selected = loadedSelection?.portfolios ?? [], draftRows = null) {
    const rows = draftRows === null ? selected.map(item => ({ id: item.id, revision: String(item.revision), selected: true }))
      : clone(draftRows);
    const known = new Set(rows.map(item => item.id));
    for (const item of catalogue.activityPortfolios) if (!known.has(item.id))
      rows.push({ id: item.id, revision: String(item.revision), selected: false });
    const names = new Map(catalogue.activityPortfolios.map(item => [item.id, item]));
    clear($('portfolios'));
    const t = node('table'), head = node('thead'), tr = node('tr'), body = node('tbody');
    ['Use', 'Portfolio / saved edition', 'Revision'].forEach(label => tr.append(node('th', label)));
    head.append(tr); t.append(head, body);
    rows.forEach((item, index) => {
      const original = names.get(item.id), label = original?.name || short(item.id);
      const row = node('tr'), checkCell = node('td'), nameCell = node('td'), revisionCell = node('td');
      const check = node('input'); check.type = 'checkbox'; check.dataset.portfolio = item.id; check.checked = Boolean(item.selected);
      check.setAttribute('aria-label', 'Include ' + label + ' edition ' + (index + 1)); check.onchange = sourceChanged;
      checkCell.append(check); nameCell.append(node('strong', label), node('small', short(item.id), 'fine rec-block'));
      if (!original) nameCell.append(node('small', 'Retained portfolio identity is absent from the current inventory.', 'fine rec-block'));
      const controls = node('div', undefined, 'row'), add = node('button', 'Add saved revision'); add.type = 'button'; add.className = 'rec-small'; add.dataset.recSourceEdit = 'true';
      add.onclick = () => {
        const draft = sourceFormDraft();
        draft.portfolios.splice(index + 1, 0, { id: item.id, revision: '', selected: false });
        renderPortfolios([], draft.portfolios); sourceChanged();
      };
      controls.append(add);
      if (rows.filter(value => value.id === item.id).length > 1) {
        const remove = node('button', 'Remove edition'); remove.type = 'button'; remove.className = 'rec-small'; remove.dataset.recSourceEdit = 'true';
        remove.onclick = () => {
          const draft = sourceFormDraft(); draft.portfolios.splice(index, 1);
          renderPortfolios([], draft.portfolios); sourceChanged();
        };
        controls.append(remove);
      }
      nameCell.append(controls);
      const number = node('input'); number.type = 'number'; number.min = '1'; number.step = '1'; number.value = item.revision;
      number.placeholder = 'Revision'; number.setAttribute('aria-label', 'Saved revision for ' + label + ' edition ' + (index + 1));
      number.oninput = sourceChanged;
      revisionCell.append(number); row.append(checkCell, nameCell, revisionCell); body.append(row);
    });
    if (!rows.length) $('portfolios').append(node('p', 'Save an activity portfolio in Portfolio review to select it here.', 'fine'));
    else $('portfolios').append(t);
  }
  async function readOrganisationChoices(id, selectedRevision, key) {
    if (!id) { selectedOrgPlan = null; optionList($('org-key'), [], '', 'Choose an organisation plan first'); $('org-identity').textContent = ''; rememberSourceDraft(); return; }
    selectedOrgPlan = await get('/api/iati/organisation/plan?' + q({ id, revision: selectedRevision }));
    const keys = selectedOrgPlan.organisationKeys ?? [];
    const enriched = catalogue.organisationPlans.find(item => item.id === id && item.revision === selectedOrgPlan.revision)?.organisations;
    let names = new Map((enriched ?? []).map(item => [item.key ?? item.id, [item.identifier, item.name ?? (Array.isArray(item.names) ? item.names.map(value => typeof value === 'string' ? value : value.text ?? value.value ?? '').filter(Boolean).join(' / ') : text(item.names))].filter(Boolean).join(' · ')]));
    if (!names.size && selectedOrgPlan.sourceId) {
      const profile = await get('/api/iati/organisation/profile?' + q({ sourceId: selectedOrgPlan.sourceId }));
      names = new Map((profile.organisations ?? []).map(item => [item.key, [
        item.identifier, Array.isArray(item.names) ? item.names.map(value => typeof value === 'string' ? value : value.text ?? value.value ?? '').filter(Boolean).join(' / ') : text(item.names)
      ].filter(Boolean).join(' · ')]));
    }
    optionList($('org-key'), keys.map((item, index) => ({ id: item, label: names.get(item) || 'Organisation ' + (index + 1) + ' · ' + short(item) })), key);
    if (key !== undefined) retainOption($('org-key'), key, 'Original organisation identity · ' + short(key));
    else if (!$('org-key').value && keys.length === 1) $('org-key').value = keys[0];
    $('org-identity').textContent = (selectedOrgPlan.name || 'Organisation plan') + ' · revision ' + selectedOrgPlan.revision;
    rememberSourceDraft();
  }
  async function refresh() {
    if (sourceDraft !== null) rememberSourceDraft();
    const draft = sourceDraft === null ? null : clone(sourceDraft);
    const next = await get(BASE + 'status');
    if (!Array.isArray(next.cases) || !Array.isArray(next.organisationPlans) || !Array.isArray(next.activityPortfolios))
      throw new Error('The complete reconciliation inventory was not returned.');
    catalogue = next;
    if (!workspaceKey) {
      workspaceKey = next.workspaceSha256 ?? (await get('/api/iati/organisation/status')).workspaceSha256;
      if (!workspaceKey) workspaceKey = (await get('/api/iati/publishing/context')).workspaceSha256;
      if (!workspaceKey) throw new Error('The original workspace identity was not returned.');
      pending = await storeRequest('read') ?? null; pendingView();
    }
    optionList($('case-select'), catalogue.cases.map(item => ({ id: item.id, label: item.name + ' · revision ' + item.revision })), current?.id);
    const oldPlan = draft?.organisation.id ?? loadedSelection?.organisation.id ?? $('org-plan').value;
    optionList($('org-plan'), catalogue.organisationPlans.map(item => ({ id: item.id, label: item.name + ' · revision ' + item.revision })), oldPlan);
    if (draft !== null) {
      retainOption($('org-plan'), draft.organisation.id, 'Retained organisation plan · ' + short(draft.organisation.id));
      $('org-revision').value = draft.organisation.revision;
      retainOption($('org-key'), draft.organisation.organisationKey, 'Original organisation identity · ' + short(draft.organisation.organisationKey));
      renderPortfolios([], draft.portfolios);
    } else {
      renderPortfolios(loadedSelection?.portfolios ?? []);
      if (!$('org-plan').value && catalogue.organisationPlans.length === 1) {
        $('org-plan').value = catalogue.organisationPlans[0].id;
        $('org-revision').value = catalogue.organisationPlans[0].revision;
        await readOrganisationChoices($('org-plan').value, Number($('org-revision').value));
      }
    }
    rememberSourceDraft();
    metrics($('counts'), [['Saved reconciliations', catalogue.cases.length], ['Organisation plans', catalogue.organisationPlans.length], ['Activity portfolios', catalogue.activityPortfolios.length]]);
    buttons();
  }
  async function catalogRows(selection, section) {
    let offset = 0, snapshot = null, total = null, metadata = null; const rows = [];
    while (true) {
      const value = await post(BASE + 'catalog', { ...selection, section, offset, limit: 250 });
      if (!Array.isArray(value.rows) || !Number.isSafeInteger(value.total) || value.offset !== offset
          || typeof value.snapshotSha256 !== 'string' || value.rows.length > value.total - offset
          || offset < value.total && !value.rows.length)
        throw new Error('The complete ' + section + ' register page was not returned.');
      if (snapshot !== null && (snapshot !== value.snapshotSha256 || total !== value.total))
        throw new Error('The selected financial register changed. Reload its first page.');
      snapshot = value.snapshotSha256; total = value.total; metadata ??= value;
      rows.push(...value.rows); offset += value.rows.length;
      status('Reading ' + section + ' financial records: ' + offset + ' of ' + total + '.');
      if (offset >= total) return { rows, snapshotSha256: snapshot, metadata };
    }
  }
  async function loadRecords(selection = selectionFromForm(), preserve = false) {
    const [org, activity] = await Promise.all([catalogRows(selection, 'organisation'), catalogRows(selection, 'activity')]);
    const changed = loadedSelection && !same(loadedSelection, selection);
    loadedSelection = clone(selection); organisationRows = org.rows; activityRows = activity.rows;
    organisationMap = new Map(organisationRows.map(row => [row.id, row])); activityMap = new Map(activityRows.map(row => [row.id, row]));
    if (!preserve && changed) { comparisons = []; decisions.clear(); report = null; }
    selectedOrganisation = organisationMap.has(selectedOrganisation) ? selectedOrganisation : null;
    selectedActivity = new Set([...selectedActivity].filter(id => activityMap.has(id)));
    selectionDirty = false; organisationOffset = activityOffset = 0;
    if (!preserve && changed) dirty = true;
    const organisation = org.metadata.organisation ?? activity.metadata.organisation;
    $('org-identity').textContent = [organisation?.identifier, organisation?.name, 'plan revision ' + selection.organisation.revision].filter(Boolean).join(' · ');
    $('selection-state').textContent = organisationRows.length + ' organisation records and ' + activityRows.length
      + ' activity financial rows from ' + selection.portfolios.length + ' saved portfolio revisions.';
    clear($('source-summary'));
    properties($('source-summary'), { organisation: organisation?.identifier ?? selection.organisation.organisationKey,
      organisationRevision: selection.organisation.revision, activityPortfolios: selection.portfolios.length });
    const currencies = [...new Set(activityRows.map(row => currency(row)).filter(Boolean))].sort();
    const collections = [...new Set(activityRows.map(row => row.collection).filter(Boolean))].sort();
    optionList($('currency'), currencies.map(value => ({ id: value, label: value })), '', 'All currencies');
    optionList($('collection'), collections.map(value => ({ id: value, label: value.replaceAll('-', ' ') })), '', 'All record families');
    renderOrganisation(); renderActivity(); renderDrafts(); buttons();
  }
  const currency = row => row.currency ?? row.value?.currency ?? row.calculation?.context?.currency ?? '';
  const amount = row => row.amount ?? row.calculation?.amount ?? row.value?.text ?? '';
  const period = row => row.period ?? row.calculation?.context?.period ?? null;
  const dateLabel = row => { const value = period(row); return value ? [value.start, value.end].filter(Boolean).join(' — ') : row.transactionDate ?? ''; };
  const recipient = row => row.recipient ? [row.recipient.ref, row.recipient.code, row.recipient.kind].filter(Boolean).join(' · ') : text(row.recipients);
  const eligible = row => row.calculation?.eligible ?? (typeof row.eligibility === 'object' ? row.eligibility?.eligible : typeof row.eligibility === 'boolean' ? row.eligibility : null);
  function pager(holder, total, offset, update) {
    clear(holder);
    const before = node('button', 'Previous'), after = node('button', 'Next'), label = node('span',
      total ? (offset + 1) + '–' + Math.min(offset + PAGE, total) + ' of ' + total : '0 records', 'fine');
    before.type = after.type = 'button'; before.disabled = offset === 0; after.disabled = offset + PAGE >= total;
    before.dataset.recPageDisabled = String(before.disabled); after.dataset.recPageDisabled = String(after.disabled);
    before.onclick = () => update(Math.max(0, offset - PAGE)); after.onclick = () => update(offset + PAGE);
    holder.append(before, label, after);
  }
  function recordTable(holder, headers, rows, build) {
    clear(holder); holder.classList.add('table-scroll');
    const t = node('table'), head = node('thead'), heading = node('tr'), body = node('tbody');
    headers.forEach(label => { const th = node('th', label); th.scope = 'col'; heading.append(th); });
    head.append(heading); t.append(head, body);
    rows.forEach(item => body.append(build(item)));
    if (!rows.length) { const row = node('tr'), cell = node('td', 'No records match this selection.'); cell.colSpan = headers.length; row.append(cell); body.append(row); }
    holder.append(t);
  }
  function detailButton(row) {
    const button = node('button', 'Details'); button.type = 'button'; button.className = 'rec-small';
    button.onclick = () => { clear($('record-detail')); properties($('record-detail'), {
      record: row.activityId || row.family || row.collection || row.id, amount: amount(row), currency: currency(row),
      period: dateLabel(row), valueDate: row.valueDate ?? row.value?.valueDate ?? '', eligibility: row.eligibility ?? row.calculation?.eligible
    }); details($('record-detail'), 'Complete retained financial record', row); $('record-detail').scrollIntoView({ block: 'nearest' }); };
    return button;
  }
  function renderOrganisation() {
    const search = $('org-search').value.trim().toLowerCase();
    const rows = organisationRows.filter(row => [row.family, row.collection, recipient(row), dateLabel(row), currency(row), amount(row)].join(' ').toLowerCase().includes(search));
    if (organisationOffset >= rows.length) organisationOffset = 0;
    recordTable($('org-register'), ['Use', 'Record / recipient', 'Period / value date', 'Amount', ''], rows.slice(organisationOffset, organisationOffset + PAGE), row => {
      const tr = node('tr'), use = node('td'), label = node('td'), dates = node('td'), money = node('td'), tools = node('td');
      const radio = node('input'); radio.type = 'radio'; radio.name = 'rec-organisation-record'; radio.value = row.id; radio.checked = selectedOrganisation === row.id;
      radio.setAttribute('aria-label', 'Choose ' + (row.family || row.collection) + ' ' + dateLabel(row));
      radio.onchange = () => { selectedOrganisation = row.id; buttons(); };
      use.append(radio); label.append(node('strong', (row.family || row.collection || 'Record').replaceAll('-', ' ')), node('small', recipient(row), 'fine rec-block'));
      if (eligible(row) === false) label.append(node('small', 'Requires financial review', 'fine rec-block'));
      dates.append(node('span', dateLabel(row)), node('small', row.valueDate ?? row.value?.valueDate ?? '', 'fine rec-block'));
      money.className = 'number'; money.append(node('span', amount(row)), node('small', currency(row), 'fine rec-block'));
      tools.append(detailButton(row)); tr.append(use, label, dates, money, tools); return tr;
    });
    pager($('org-page'), rows.length, organisationOffset, offset => { organisationOffset = offset; renderOrganisation(); });
  }
  function filteredActivity() {
    const search = $('activity-search').value.trim().toLowerCase(), selectedCurrency = $('currency').value,
      selectedCollection = $('collection').value, onlySelected = $('selected-only').checked;
    return activityRows.filter(row => (!selectedCurrency || currency(row) === selectedCurrency)
      && (!selectedCollection || row.collection === selectedCollection) && (!onlySelected || selectedActivity.has(row.id))
      && [row.activityId, row.reportingOrgRef, row.collection, row.transactionType, row.budgetType, row.budgetStatus,
        recipient(row), dateLabel(row), currency(row), row.hierarchy].join(' ').toLowerCase().includes(search));
  }
  function renderActivity() {
    const rows = filteredActivity(); if (activityOffset >= rows.length) activityOffset = 0;
    recordTable($('activity-register'), ['Use', 'Activity / record', 'Period / value date', 'Amount', ''], rows.slice(activityOffset, activityOffset + PAGE), row => {
      const tr = node('tr'), use = node('td'), identity = node('td'), dates = node('td'), money = node('td'), tools = node('td');
      const check = node('input'); check.type = 'checkbox'; check.value = row.id; check.checked = selectedActivity.has(row.id);
      check.setAttribute('aria-label', 'Include ' + (row.activityId || 'activity record') + ' ' + dateLabel(row));
      check.onchange = () => { if (check.checked) { selectedActivity.add(row.id); $('no-activity').checked = false; } else selectedActivity.delete(row.id); $('selected-count').textContent = selectedActivity.size + ' selected rows'; buttons(); };
      use.append(check); identity.append(node('strong', row.activityId || short(row.id)),
        node('small', [row.collection, row.budgetType && 'budget type ' + row.budgetType, row.budgetStatus && 'status ' + row.budgetStatus,
          row.transactionType && 'transaction ' + row.transactionType, row.hierarchy && 'hierarchy ' + row.hierarchy].filter(Boolean).join(' · '), 'fine rec-block'));
      if (eligible(row) === false) identity.append(node('small', 'Requires financial review', 'fine rec-block'));
      dates.append(node('span', dateLabel(row)), node('small', row.valueDate ?? '', 'fine rec-block'));
      money.className = 'number'; money.append(node('span', amount(row)), node('small', currency(row), 'fine rec-block'));
      tools.append(detailButton(row)); tr.append(use, identity, dates, money, tools); return tr;
    });
    pager($('activity-page'), rows.length, activityOffset, offset => { activityOffset = offset; renderActivity(); });
    $('selected-count').textContent = selectedActivity.size + ' selected rows · ' + rows.length + ' match filters';
    buttons();
  }
  function editorClear() {
    editing = -1; selectedActivity.clear(); selectedOrganisation = null;
    $('scope').value = ''; $('coverage').value = 'selected'; $('value-dates').value = 'separate'; $('no-activity').checked = false;
    $('editor-title').textContent = 'Add a comparison'; $('add').textContent = 'Add explicit record comparison'; $('cancel-edit').hidden = true;
    renderOrganisation(); renderActivity();
  }
  function editComparison(index) {
    const item = comparisons[index]; editing = index; selectedOrganisation = item.organisationRowId; selectedActivity = new Set(item.activityRowIds);
    $('scope').value = item.scopeStatement; $('coverage').value = item.coverage; $('value-dates').value = item.valueDatePolicy ?? 'separate'; $('no-activity').checked = item.activityRowIds.length === 0;
    $('editor-title').textContent = 'Edit comparison ' + (index + 1); $('add').textContent = 'Save comparison changes'; $('cancel-edit').hidden = false;
    $('org-search').value = ''; $('activity-search').value = ''; $('currency').value = ''; $('collection').value = ''; $('selected-only').checked = true;
    organisationOffset = activityOffset = 0; renderOrganisation(); renderActivity(); tab('matches');
  }
  function renderDrafts() {
    recordTable($('comparison-drafts'), ['Comparison', 'Organisation record', 'Activity rows', 'Coverage / dates', 'Scope', ''], comparisons, item => {
      const index = comparisons.indexOf(item), row = node('tr'), target = organisationMap.get(item.organisationRowId);
      row.append(node('td', index + 1), node('td', target ? [target.family || target.collection, currency(target), dateLabel(target)].filter(Boolean).join(' · ') : short(item.organisationRowId)),
        node('td', item.activityRowIds.length ? item.activityRowIds.length : 'No selected activity coverage'), node('td', item.coverage + ' · ' + (item.valueDatePolicy ?? 'separate')), node('td', item.scopeStatement));
      const controls = node('td'), edit = node('button', 'Edit'), remove = node('button', 'Remove'); edit.type = remove.type = 'button';
      edit.onclick = () => editComparison(index); remove.onclick = () => { comparisons.splice(index, 1); touch(true); renderDrafts(); };
      controls.append(edit, remove); row.append(controls); return row;
    });
  }
  function definitionFromForm() {
    if (selectionDirty || !loadedSelection) throw new Error('Load the exact saved financial records first.');
    if (!same(selectionFromForm(), loadedSelection)) throw new Error('The source selection changed. Load those saved revisions first.');
    const name = $('name').value.trim(); if (!name) throw new Error('Name this reconciliation.');
    if (!comparisons.length) throw new Error('Add at least one explicit record comparison.');
    return { name, notes: $('notes').value, ...clone(loadedSelection), comparisons: clone(comparisons), decisions: [...decisions.values()].map(clone) };
  }
  function renderIssues() {
    const issues = [...(report?.issues ?? [])], known = new Set(issues.map(issue => issue.id));
    for (const decision of decisions.values()) if (!known.has(decision.issueId)) issues.push({
      id: decision.issueId, code: 'Retained issue decision', severity: 'Review against the corrected selection',
      message: 'This original decision remains in the working definition. Preview the corrected records to identify its current finding, or clear its decision to remove it.'
    });
    clear($('issues'), issues.length ? '' : 'This preview has no recorded findings.');
    for (const issue of issues) {
      const item = node('article', undefined, 'rec-issue'), previous = decisions.get(issue.id);
      item.dataset.issue = issue.id;
      item.append(node('h3', issue.code), node('p', issue.message), node('p', issue.severity, 'fine'));
      const label = node('label', 'Decision'), select = node('select');
      select.dataset.issueDecision = issue.id; select.add(new Option('Choose a decision', ''));
      select.add(new Option('Acknowledge', 'acknowledge')); select.add(new Option('Follow up', 'follow-up'));
      select.value = previous?.decision ?? ''; label.append(select);
      const noteLabel = node('label', 'Decision note'), note = node('textarea'); note.rows = 2; note.dataset.issueNote = issue.id; note.value = previous?.note ?? '';
      noteLabel.append(note);
      const actorLabel = node('label', 'Named operator'), actor = node('input'); actor.dataset.issueActor = issue.id; actor.value = previous?.actor ?? $('actor').value;
      actorLabel.append(actor); const fields = node('div', undefined, 'rec-issue-fields'); fields.append(label, actorLabel);
      item.append(fields, noteLabel); details(item, 'Referenced rows', { id: issue.id, comparisonId: issue.comparisonId, rowIds: issue.rowIds });
      $('issues').append(item);
    }
  }
  function renderReport() {
    clear($('report-detail'));
    if (!report) { clear($('report-comparisons')); clear($('report-summary')); renderIssues(); reviewView(); return; }
    metrics($('report-summary'), [['Comparisons', report.comparisons.length], ['Activity financial rows', report.activityRows.length],
      ['Findings', report.issues.length], ['Recorded decisions', decisions.size]]);
    recordTable($('report-comparisons'), ['Basis / coverage', 'Currency', 'Organisation amount', 'Selected amount', 'Difference', 'Included / excluded', ''], report.comparisons, comparison => {
      const row = node('tr'); row.append(node('td', comparison.basis + ' · ' + comparison.coverage), node('td', comparison.currency ?? ''),
        node('td', comparison.organisationAmount ?? '—', 'number'), node('td', comparison.selectedAmount ?? '—', 'number'), node('td', comparison.difference ?? '—', 'number'),
        node('td', comparison.eligibleCount + ' / ' + comparison.excludedCount));
      const cell = node('td'), button = node('button', 'Review detail'); button.type = 'button';
      button.onclick = () => {
        clear($('report-detail')); properties($('report-detail'), { scope: comparison.scopeStatement, basis: comparison.basis,
          coverage: comparison.coverage, valueDatePolicy: comparison.valueDatePolicy ?? 'separate', valueDates: comparison.valueDates ?? '',
          included: comparison.includedRowIds?.length ?? comparison.eligibleCount, excluded: comparison.excludedRows?.length ?? comparison.excludedCount });
        if (comparison.excludedRows?.length) {
          const holder = node('div'); $('report-detail').append(holder);
          table(holder, [{ key: 'id', label: 'Excluded record' }, { key: 'reasons', label: 'Reasons' }], comparison.excludedRows);
        }
        details($('report-detail'), 'Complete native comparison', comparison);
      };
      cell.append(button); row.append(cell); return row;
    });
    $('preview-note').textContent = current && !dirty ? 'Saved revision ' + current.revision + ' · ' + current.name : 'Preview of the current explicit financial selections.';
    renderIssues(); reviewView();
  }
  function reviewView() {
    const originalIssues = current?.report?.issues ?? [], acknowledged = new Set(current?.review?.acknowledgedIssueIds ?? []);
    clear($('review-issues'), originalIssues.length ? '' : 'The saved report has no findings to acknowledge.');
    for (const issue of originalIssues) {
      const label = node('label', undefined, 'rec-check'), check = node('input'); check.type = 'checkbox'; check.value = issue.id;
      check.checked = acknowledged.has(issue.id); label.append(check, node('span', issue.code + ' · ' + issue.message)); $('review-issues').append(label);
    }
    $('review-state').textContent = !current ? 'Save the financial selection to record a named review.'
      : dirty ? 'Save the edited financial selection before reviewing its new revision.'
      : current.review ? 'Revision ' + current.revision + ' · ' + current.review.decision.replaceAll('_', ' ') + ' · ' + current.review.actor
      : 'Revision ' + current.revision + ' is ready for a named review.';
    $('delivery-state').textContent = current ? current.name + ' · revision ' + current.revision + ' · '
      + (current.review ? current.review.decision.replaceAll('_', ' ') + ' by ' + current.review.actor : 'Review not recorded') : 'Open a saved revision to prepare its financial report and source package.';
  }
  function historyView() {
    const items = history.map(item => ({ id: String(item.revision), label: 'Revision ' + item.revision + (item.review ? ' · ' + item.review.decision.replaceAll('_', ' ') : '') }));
    optionList($('revision'), items, current?.revision, 'Choose a revision');
    optionList($('compare-before'), items, history.length > 1 ? history[history.length - 2].revision : current?.revision, 'Before revision');
    optionList($('compare-after'), items, current?.revision, 'After revision');
    recordTable($('history'), ['Revision', 'Name', 'Review', ''], history, item => {
      const row = node('tr'); row.append(node('td', item.revision), node('td', item.name),
        node('td', item.review ? item.review.decision.replaceAll('_', ' ') + ' · ' + item.review.actor : 'Not recorded'));
      const cell = node('td'), button = node('button', 'Open'); button.type = 'button';
      button.onclick = () => run('Opening the selected saved reconciliation…', () => openCase(item.id, item.revision));
      cell.append(button); row.append(cell); return row;
    });
  }
  async function openCase(id, selectedRevision) {
    if (!id) throw new Error('Choose saved reconciliation work.');
    const saved = await get(BASE + 'plan?' + q({ id, revision: selectedRevision }));
    if (!saved?.definition || !saved.report || saved.id !== id) throw new Error('The selected complete reconciliation was not returned.');
    current = saved; restoredAction = null; restoredView(); history = (await get(BASE + 'history?' + q({ id }))).history ?? [];
    history.sort((a, b) => a.revision - b.revision);
    $('name').value = saved.definition.name; $('notes').value = saved.definition.notes ?? '';
    loadedSelection = clone({ organisation: saved.definition.organisation, portfolios: saved.definition.portfolios });
    retainOption($('org-plan'), loadedSelection.organisation.id, 'Retained organisation plan · ' + short(loadedSelection.organisation.id)); $('org-revision').value = loadedSelection.organisation.revision;
    await readOrganisationChoices(loadedSelection.organisation.id, loadedSelection.organisation.revision, loadedSelection.organisation.organisationKey);
    renderPortfolios(loadedSelection.portfolios); rememberSourceDraft();
    comparisons = clone(saved.definition.comparisons); decisions = new Map((saved.definition.decisions ?? []).map(item => [item.issueId, clone(item)]));
    report = saved.report; organisationRows = report.organisationRows ?? []; activityRows = report.activityRows ?? [];
    organisationMap = new Map(organisationRows.map(row => [row.id, row])); activityMap = new Map(activityRows.map(row => [row.id, row]));
    selectedOrganisation = null; selectedActivity.clear(); editing = -1; $('no-activity').checked = false; dirty = false; selectionDirty = false;
    organisationOffset = activityOffset = 0; $('case-select').value = id;
    $('selection-state').textContent = 'Saved organisation revision ' + loadedSelection.organisation.revision + ' and '
      + loadedSelection.portfolios.length + ' activity portfolio revisions. Load financial records to extend the selected rows.';
    optionList($('currency'), [...new Set(activityRows.map(currency).filter(Boolean))].sort().map(value => ({ id: value, label: value })), '', 'All currencies');
    optionList($('collection'), [...new Set(activityRows.map(row => row.collection).filter(Boolean))].sort().map(value => ({ id: value, label: value })), '', 'All record families');
    $('review-actor').value = saved.review?.actor ?? $('actor').value; $('review-note').value = '';
    $('editor-title').textContent = 'Add a comparison'; $('add').textContent = 'Add explicit record comparison'; $('cancel-edit').hidden = true;
    renderOrganisation(); renderActivity(); renderDrafts(); historyView(); renderReport(); buttons(); tab('review');
  }
  async function send(route, input) {
    if (pending && (pending.route !== route || !same(pending.input, input))) throw new Error('Resolve the retained action before saving another selection.');
    if (!pending) { pending = { route, input: clone(input), createdAt: new Date().toISOString(), rejected: false }; await storeRequest('write', pending); }
    pendingView(); buttons();
    try {
      const value = await post(BASE + route, pending.input), saved = caseFrom(value);
      if (!saved?.id || !Number.isSafeInteger(saved.revision)) throw new Error('Read the retained action result to recover the completed save.');
      const reopened = await get(BASE + 'plan?' + q({ id: saved.id, revision: saved.revision }));
      if (reopened.id !== saved.id || reopened.revision !== saved.revision) throw new Error('The saved revision could not be reopened.');
      current = reopened; report = reopened.report; dirty = false;
      await storeRequest('delete'); pending = null; pendingView();
      await refresh(); await openCase(saved.id, saved.revision);
      status('Reconciliation revision ' + saved.revision + ' is saved and reopened.');
      return saved;
    } catch (error) {
      if (pending) {
        pending.error = error.message;
        pending.rejected = Boolean(error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status));
        await storeRequest('write', pending); pendingView();
      }
      throw error;
    } finally { buttons(); }
  }
  async function resolveRequest(id) {
    if (!id) throw new Error('Enter the original request ID.');
    const value = await get(BASE + 'request?' + q({ requestId: id }));
    clear($('request-result')); properties($('request-result'), { requestId: id, state: value.state });
    if (value.state === 'RECORDED') {
      if (pending?.input.requestId === id && value.input && !same(value.input, pending.input))
        throw new Error('The saved request has a different original selection.');
      const saved = value.case;
      if (!saved?.id || !saved.revision) throw new Error('The recorded request did not include its saved case.');
      await openCase(saved.id, saved.revision);
      if (pending?.input.requestId === id) { await storeRequest('delete'); pending = null; pendingView(); }
      await refresh(); status('The original action is saved as revision ' + saved.revision + '.'); buttons();
    } else if (value.state === 'NOT_RECORDED') status('This request is not recorded. Continue its retained original action when ready.');
    else throw new Error('The original action returned an unknown state.');
    return value;
  }
  async function preview() {
    report = await post(BASE + 'preview', definitionFromForm()); renderReport(); buttons(); tab('review');
    status('Complete financial coverage and exclusions calculated.');
  }
  async function save() {
    const input = { ...definitionFromForm(), requestId: crypto.randomUUID(),
      ...(current ? { id: current.id, expectedRevision: current.revision } : {}) };
    return send('save', input);
  }
  function addComparison() {
    if (selectionDirty || !loadedSelection) throw new Error('Load the selected saved records first.');
    if (!selectedOrganisation) throw new Error('Choose an organisation financial record.');
    if (!selectedActivity.size && !$('no-activity').checked) throw new Error('Choose the activity financial rows, or explicitly record no selected activity coverage.');
    if (selectedActivity.size && $('no-activity').checked) throw new Error('Choose activity rows or no selected activity coverage, not both.');
    const scopeStatement = $('scope').value.trim(); if (!scopeStatement) throw new Error('Describe this comparison scope.');
    const value = { organisationRowId: selectedOrganisation, activityRowIds: [...selectedActivity].sort(),
      coverage: $('coverage').value, valueDatePolicy: $('value-dates').value, scopeStatement };
    if (editing < 0) comparisons.push(value); else comparisons[editing] = value;
    touch(true); editorClear(); renderDrafts(); status('The explicit record comparison is retained in this working selection.');
  }
  function applyDecisions() {
    if (!report && !decisions.size) throw new Error('Preview the financial findings first.');
    const next = new Map();
    for (const item of $('issues').querySelectorAll('[data-issue]')) {
      const decision = item.querySelector('[data-issue-decision]').value;
      if (!decision) continue;
      const actor = item.querySelector('[data-issue-actor]').value.trim(), note = item.querySelector('[data-issue-note]').value;
      if (!actor) throw new Error('Name the operator for each issue decision.');
      next.set(item.dataset.issue, { issueId: item.dataset.issue, decision, actor, note });
    }
    decisions = next; dirty = true; renderReport(); buttons(); status('Named issue decisions are ready to save with this reconciliation.');
  }
  function newCase() {
    current = null; history = []; comparisons = []; decisions.clear(); report = null; dirty = true; restoredAction = null; restoredView();
    $('name').value = ''; $('notes').value = ''; $('case-select').value = '';
    editorClear(); historyView(); renderDrafts(); renderReport(); buttons(); tab('sources');
  }
  function buttons() {
    if (!mounted) return;
    const busy = Boolean(api.isBusy?.()), held = Boolean(pending);
    $('panel').querySelectorAll('button').forEach(button => {
      if (button.dataset.recTab) { button.disabled = busy; return; }
      button.disabled = busy || button.dataset.recPageDisabled === 'true';
    });
    $('panel').querySelectorAll('input,select,textarea').forEach(element => element.disabled = busy || held);
    for (const id of ['new', 'org-open', 'load', 'add', 'cancel-edit', 'apply-decisions', 'select-filtered', 'clear-selected'])
      $(id).disabled = busy || held;
    $('open').disabled = busy || !$('case-select').value;
    $('open-revision').disabled = busy || !current || !$('revision').value;
    $('org-open').disabled ||= !$('org-plan').value;
    $('add').disabled ||= !loadedSelection || selectionDirty || !selectedOrganisation || (!selectedActivity.size && !$('no-activity').checked);
    $('panel').querySelectorAll('[data-rec-source-edit]').forEach(button => button.disabled = busy || held);
    const usable = Boolean(loadedSelection && !selectionDirty && comparisons.length && !held);
    for (const id of ['preview', 'preview-review']) $(id).disabled = busy || !usable;
    for (const id of ['save', 'save-review']) $(id).disabled = busy || !usable || !fresh();
    $('apply-decisions').disabled ||= !report && !decisions.size;
    $('review-submit').disabled = busy || held || !current || dirty || !fresh();
    $('compare-submit').disabled = busy || !current || history.length < 2;
    for (const id of ['file-report', 'file-csv', 'file-json', 'export']) $(id).disabled = busy || !current;
    for (const id of ['reconcile', 'retry', 'pending-download']) $(id).disabled = busy || !pending;
    $('revise-rejected').disabled = busy || !pending?.rejected;
    $('restored-download').disabled = busy || !restoredAction;
    $('case-state').textContent = current ? 'Revision ' + current.revision + (fresh() ? ' · latest saved work' : ' · historical work')
      + (dirty ? ' · working changes' : '') : 'New reconciliation';
    pendingView();
  }
  async function restoreRejectedAction(retained) {
    const input = clone(retained.input);
    if (!['save', 'review'].includes(retained.route)) throw new Error('This retained action has no editable financial form.');
    if (input.id) await openCase(input.id, positive(input.expectedRevision, 'reconciliation'));
    else if (retained.route === 'review') throw new Error('The original review case identity is missing.');
    else newCase();
    if (retained.route === 'review') {
      $('review-actor').value = input.actor; $('review-note').value = input.note;
      retainOption($('review-decision'), input.decision, 'Original rejected decision · ' + text(input.decision));
      const acknowledged = new Set(input.acknowledgedIssueIds ?? []), present = new Set();
      for (const check of $('review-issues').querySelectorAll('input')) { check.checked = acknowledged.has(check.value); present.add(check.value); }
      for (const id of acknowledged) if (!present.has(id)) {
        const label = node('label', undefined, 'rec-check'), check = node('input');
        check.type = 'checkbox'; check.value = id; check.checked = true;
        label.append(check, node('span', 'Original issue outside this saved report · ' + id + '. Clear it to remove it from the corrected review.'));
        $('review-issues').append(label);
      }
      tab('review'); return '';
    }
    if (!input.organisation || !Array.isArray(input.portfolios) || !Array.isArray(input.comparisons))
      throw new Error('The retained save is missing its complete original definition.');
    const selection = clone({ organisation: input.organisation, portfolios: input.portfolios });
    $('name').value = input.name; $('notes').value = input.notes ?? '';
    retainOption($('org-plan'), selection.organisation.id, 'Retained organisation plan · ' + short(selection.organisation.id));
    $('org-revision').value = selection.organisation.revision;
    optionList($('org-key'), [], '', 'Read the selected organisation');
    retainOption($('org-key'), selection.organisation.organisationKey, 'Original organisation identity · ' + short(selection.organisation.organisationKey));
    renderPortfolios(selection.portfolios); rememberSourceDraft();
    comparisons = clone(input.comparisons); decisions = new Map((input.decisions ?? []).map(item => [item.issueId, clone(item)]));
    loadedSelection = null; selectedOrgPlan = null; report = null; organisationRows = []; activityRows = [];
    organisationMap = new Map(); activityMap = new Map(); dirty = true; selectionDirty = true;
    clear($('source-summary')); editorClear(); renderDrafts(); renderReport();
    const warnings = [];
    try { await readOrganisationChoices(selection.organisation.id, selection.organisation.revision, selection.organisation.organisationKey); }
    catch (error) { warnings.push('Organisation choices could not be reread: ' + error.message); }
    try { await loadRecords(selection, true); }
    catch (error) {
      warnings.push('Load the exact source registers before saving: ' + error.message);
      $('selection-state').textContent = 'The complete original selections and comparison definitions are restored. Correct or reload their saved sources before saving.';
    }
    dirty = true; renderDrafts(); renderReport(); rememberSourceDraft();
    tab(selectionDirty ? 'sources' : 'matches');
    return warnings.join(' ');
  }
  function submit(id, message, operation) {
    $(id).addEventListener('submit', event => { event.preventDefault(); run(message, operation); });
  }
  function wire() {
    $('name').oninput = $('notes').oninput = () => { dirty = true; buttons(); };
    $('case-select').onchange = buttons;
    $('org-plan').onchange = () => {
      const selected = catalogue.organisationPlans.find(item => item.id === $('org-plan').value);
      $('org-revision').value = selected?.revision ?? ''; optionList($('org-key'), [], '', 'Read the selected organisation plan'); selectedOrgPlan = null; sourceChanged();
      run('Reading saved organisation choices…', () => readOrganisationChoices(selected?.id, selected?.revision));
    };
    $('org-revision').oninput = $('org-key').onchange = sourceChanged;
    $('org-open').onclick = () => run('Reading the selected organisation revision…', async () => {
      await readOrganisationChoices($('org-plan').value, positive($('org-revision').value, 'organisation')); sourceChanged();
    });
    $('load').onclick = () => run('Reading the complete selected financial registers…', async () => { await loadRecords(); tab('matches'); status('Saved financial registers are ready for explicit record selection.'); });
    $('open').onclick = () => run('Opening saved reconciliation work…', () => openCase($('case-select').value));
    $('open-revision').onclick = () => run('Opening the selected reconciliation revision…', () => openCase(current.id, Number($('revision').value)));
    $('new').onclick = newCase;
    $('org-search').oninput = () => { organisationOffset = 0; renderOrganisation(); };
    $('activity-search').oninput = $('currency').onchange = $('collection').onchange = $('selected-only').onchange = () => { activityOffset = 0; renderActivity(); };
    $('select-filtered').onclick = () => { filteredActivity().forEach(row => selectedActivity.add(row.id)); if (selectedActivity.size) $('no-activity').checked = false; renderActivity(); };
    $('clear-selected').onclick = () => { selectedActivity.clear(); renderActivity(); };
    $('no-activity').onchange = () => { if ($('no-activity').checked) selectedActivity.clear(); renderActivity(); };
    $('add').onclick = () => run('Retaining the explicit record comparison…', addComparison);
    $('cancel-edit').onclick = editorClear;
    for (const id of ['preview', 'preview-review']) $(id).onclick = () => run('Calculating complete financial coverage…', preview);
    for (const id of ['save', 'save-review']) $(id).onclick = () => run('Saving the complete reconciliation revision…', save);
    $('apply-decisions').onclick = () => run('Applying named issue decisions…', applyDecisions);
    submit('review-form', 'Saving the named reconciliation review…', () => {
      if (!current || dirty) throw new Error('Save the current financial selection before its named review.');
      const actor = $('review-actor').value.trim(), note = $('review-note').value.trim();
      if (!actor || !note) throw new Error('Name the reviewer and provide the review note.');
      return send('review', { requestId: crypto.randomUUID(), id: current.id, expectedRevision: current.revision,
        decision: $('review-decision').value, actor, note,
        acknowledgedIssueIds: [...$('review-issues').querySelectorAll('input:checked')].map(input => input.value).sort() });
    });
    submit('compare-form', 'Comparing the selected complete revisions…', async () => {
      const result = await post(BASE + 'compare', { before: { id: current.id, revision: Number($('compare-before').value) },
        after: { id: current.id, revision: Number($('compare-after').value) } });
      clear($('history-comparison'));
      if (result.summary) properties($('history-comparison'), result.summary);
      if (Array.isArray(result.changes)) {
        const holder = node('div'); $('history-comparison').append(holder);
        table(holder, ['kind', 'id', 'before', 'after'], result.changes);
      }
      details($('history-comparison'), 'Complete saved revision comparison', result);
      status('Selected revisions compared with their complete financial and review context.');
    });
    for (const [kind, filename] of Object.entries({ report: 'IATI_Financial_Reconciliation.html', csv: 'IATI_Financial_Reconciliation.csv', json: 'IATI_Financial_Reconciliation.json' }))
      $('file-' + kind).onclick = () => run('Preparing the complete saved financial ' + kind + '…',
        () => download(BASE + 'file?' + q({ id: current.id, revision: current.revision, kind }), filename));
    $('export').onclick = () => run('Preparing the complete reconciliation source package…',
      () => download(BASE + 'export?' + q({ id: current.id, revision: current.revision }), 'IATI_Financial_Reconciliation.zip'));
    submit('receive-form', 'Receiving the complete reconciliation and nested source work…', async () => {
      const file = $('receive-file').files[0]; if (!file) throw new Error('Choose the complete reconciliation package.');
      const result = await (await request(BASE + 'receive', { method: 'POST', headers: { 'content-type': 'application/zip' }, body: file })).json();
      if (result.state !== 'COMPLETE') throw new Error('The complete receiving result was not returned.');
      clear($('receive-result')); properties($('receive-result'), { state: result.state, reused: result.reused });
      await api.refreshWorkspace(); const saved = result.case ?? result.currentCase;
      await openCase(saved.id, saved.revision); tab('history'); status('Complete reconciliation source work received and reopened.');
    });
    submit('request-form', 'Reading the original saved action…', () => resolveRequest($('request-id').value.trim()));
    $('reconcile').onclick = () => run('Reading the original saved action result…', () => resolveRequest(pending.input.requestId));
    $('retry').onclick = () => run('Continuing the retained original action…', () => send(pending.route, pending.input));
    $('revise-rejected').onclick = () => run('Retaining the rejected request and reopening its selection…', async () => {
      if (!pending?.rejected) throw new Error('Read or continue the original action first.');
      const value = await get(BASE + 'request?' + q({ requestId: pending.input.requestId }));
      if (value.state === 'RECORDED') { await resolveRequest(pending.input.requestId); return; }
      if (value.state !== 'NOT_RECORDED') throw new Error('The original action state could not be resolved.');
      const original = clone(pending);
      await storeRequest('write', original, 'rejected:' + original.input.requestId);
      const warning = await restoreRejectedAction(original);
      await storeRequest('delete'); pending = null;
      restoredAction = { ...original, warning }; restoredView(); pendingView(); buttons();
      status('The complete rejected ' + original.route + ' values are restored. Edit and save the correction with a new request ID.' + (warning ? ' ' + warning : ''));
    });
    $('pending-download').onclick = () => downloadAction(pending, 'IATI_Reconciliation_Pending_Action.json');
    $('restored-download').onclick = () => {
      if (!restoredAction) return;
      const { warning, ...original } = restoredAction;
      downloadAction(original, 'IATI_Reconciliation_Rejected_Action.json');
    };
  }
  mount();
  return { mount, refresh, buttons, openCase, async newFromOrganisation(id, selectedRevision, organisationKey) {
    newCase(); retainOption($('org-plan'), id, 'Retained organisation plan · ' + short(id)); $('org-revision').value = selectedRevision;
    await readOrganisationChoices(id, selectedRevision, organisationKey); sourceChanged(); api.show('reconciliation');
  } };
};
