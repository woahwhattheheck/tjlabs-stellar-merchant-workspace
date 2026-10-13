import { createPlanSharingPanel } from '/plan-sharing.mjs';
export function createCollectionComposerPanel({ host, api, onCreated = async () => {}, onBusy = () => {} }) {
  const schema = 'stellar-forge.sf88.collection-plan.v1';
  const state = { connected: false, visible: false, blocked: false, busy: false, epoch: 0,
    workspace: null, attempted: false, plans: [], editions: [], draft: null, saved: null,
    dirty: false, tab: 'plan', requestIndex: 0, requestQuery: '', libraryQuery: '',
    catalogs: new Map(), headerTexts: new Map(), edition: null, period: null, referenceEdited: false };
  let shell, notice, body, statusLabel, saveButton, sharingReturnTab = 'plan';
  const sharing = createPlanSharingPanel({ api, run, say,
    navigate(target) {
      if (target === 'sharing') { if (state.tab !== 'sharing') sharingReturnTab = state.tab; state.tab = 'sharing'; }
      else state.tab = sharingReturnTab;
      render();
    },
    onAdopted(saved) {
      clearPlan(); state.saved = saved; state.draft = clone(saved.plan); state.referenceEdited = true;
      state.plans = [{ ...saved, name: saved.plan.name, description: saved.plan.description ?? '',
        requestCount: saved.plan.requests.length, parameters: saved.plan.parameters },
        ...state.plans.filter(item => item.id !== saved.id || item.planSha256 !== saved.planSha256)];
      sharing.reset(); render();
    },
  });
  const el = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text !== undefined && text !== null) result.textContent = String(text);
    if (className) result.className = className;
    return result;
  };
  const add = (parent, ...items) => { parent.append(...items.flat().filter(Boolean)); return parent; };
  const clone = value => JSON.parse(JSON.stringify(value));
  const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const date = value => {
    const parsed = new Date(value);
    return value && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString() : 'Not saved';
  };
  const phase = value => ({ PREPARED: 'Ready to review', CREATED: 'Collection created',
    PREPARING: 'Preparing requests', REVIEW_REQUIRED: 'Inputs need attention' }[value] ?? 'Saved preparation');
  function errorText(error) {
    const code = error.code ?? error.message ?? '';
    const messages = {
      COLLECTION_EDITION_ID_CONFLICT: 'This collection reference belongs to another plan revision or set of period values. Open that saved period, or use a new reference for the new period.',
      COLLECTION_EDITION_OUTPUT_EXISTS: 'A response destination already contains a file. Choose a fresh destination for the new period or open the original period.',
      COLLECTION_EDITION_DUPLICATE_OUTPUT: 'Two requests use the same response destination. Give each request its own file.',
      COLLECTION_PLAN_OPERATOR_TERMS_MISMATCH: 'The offer does not match this operator’s network, asset or recipient. Review the selected terms and operator configuration.',
      COLLECTION_PLAN_OPERATOR_LIMIT_EXCEEDED: 'The selected offer exceeds the operator’s saved spending limit. Review the offer and operator configuration.',
      COLLECTION_PLAN_OPERATOR_CHANGED: 'The bound operator configuration changed. Inspect the original operator before preparing this period again.',
      COLLECTION_EDITION_INPUT_CHANGED: 'A retained request input changed after preparation. Open the saved period and inspect its original source.',
      COLLECTION_EDITION_REVIEW_CHANGED: 'The original collection review changed. Refresh the saved period and review its current limits.',
      COLLECTION_EDITION_REVIEW_REQUIRED: 'The period’s source inputs need attention. Open its saved request references and correct the original input.',
      COLLECTION_EDITION_PREPARATION_INCOMPLETE: 'Preparation stopped before all requests were ready. Continue this same saved period to complete it.',
    };
    if (messages[code]) return messages[code];
    if (code === 'Failed to fetch') return 'The workspace could not be reached. Keep this period reference and refresh its status before continuing.';
    if (/PRIVATE_SESSION|HTTP_401/.test(code)) return 'Open the current private workspace session to continue.';
    if (/BUSY|LOCKED/.test(code)) return 'Another workspace action is using these records. Refresh after it finishes.';
    if (/CONFLICT|EXISTS|CHANGED/.test(code)) return 'The saved inputs or collection reference have changed. Open the existing period and inspect its requests before continuing.';
    if (/MISSING|NOT_FOUND/.test(code)) return 'A saved source or workspace could not be found. Check the selected paths and open the original record.';
    return String(code).replace(/^COLLECTION_(?:COMPOSER|PLAN|EDITION)_/, '').replaceAll('_', ' ') || 'The operation could not finish.';
  }
  function say(message, error = false) {
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = !message;
    notice.dataset.kind = error ? 'error' : 'status';
  }
  function button(label, action, className) {
    const result = el('button', label, className);
    result.type = 'button';
    result.addEventListener('click', action);
    return result;
  }
  let fieldSequence = 0;
  function field(label, value, change, options = {}) {
    const wrap = el('div', null, 'composer-field'), id = 'composer-field-' + (++fieldSequence);
    const input = el(options.rows ? 'textarea' : 'input');
    input.id = id;
    if (options.rows) input.rows = options.rows;
    else input.type = options.type ?? 'text';
    input.value = value ?? '';
    input.spellcheck = false;
    if (options.required) input.required = true;
    if (options.maxLength) input.maxLength = options.maxLength;
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.min !== undefined) input.min = options.min;
    input.addEventListener('input', () => change(input.value, input));
    const title = el('label', label); title.htmlFor = id;
    add(wrap, title, input);
    if (options.help) add(wrap, el('p', options.help, 'composer-help'));
    return { wrap, input };
  }
  function selectField(label, options, value, change) {
    const wrap = el('div', null, 'composer-field'), id = 'composer-field-' + (++fieldSequence);
    const input = el('select'); input.id = id;
    for (const [key, title] of options) {
      const option = el('option', title); option.value = String(key); input.append(option);
    }
    input.value = String(value ?? '');
    input.addEventListener('change', () => change(input.value));
    const title = el('label', label); title.htmlFor = id;
    add(wrap, title, input);
    return { wrap, input };
  }
  function grid(...items) { return add(el('div', null, 'composer-grid'), ...items); }
  function details(title, ...items) { return add(el('details', null, 'composer-details'), el('summary', title), ...items); }
  function table(headings, rows) {
    const wrap = el('div', null, 'composer-table-wrap'), table = el('table'), head = el('tr');
    headings.forEach(label => { const cell = el('th', label); cell.scope = 'col'; head.append(cell); });
    add(table, add(el('thead'), head));
    const tbody = el('tbody');
    rows.forEach(values => {
      const row = el('tr');
      values.forEach(value => add(row, add(el('td'), value instanceof Node ? value : el('span', value ?? '—'))));
      tbody.append(row);
    });
    if (!rows.length) {
      const cell = el('td', 'No entries.'); cell.colSpan = headings.length;
      tbody.append(add(el('tr'), cell));
    }
    add(table, tbody); add(wrap, table); return wrap;
  }
  function download(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
    const link = el('a'); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function sync() {
    if (shell) shell.disabled = !state.connected || state.blocked || state.busy;
    host.setAttribute('aria-busy', String(state.busy));
    if (statusLabel) statusLabel.textContent = state.dirty ? 'Unsaved changes' : state.saved ? 'Saved revision · ' + date(state.saved.savedAt) : 'New plan';
    if (saveButton) saveButton.disabled = !state.draft || (!state.dirty && Boolean(state.saved));
  }
  function dirty() { state.dirty = true; sync(); }
  function clearPlan() {
    state.draft = null; state.saved = null; state.dirty = false; state.edition = null; state.period = null;
    state.catalogs.clear(); state.headerTexts.clear(); state.requestIndex = 0; state.requestQuery = ''; state.tab = 'plan';
  }
  function canLeave() {
    return !state.dirty || window.confirm('Discard the unsaved changes to this request plan?');
  }
  async function run(message, operation) {
    if (!state.connected || state.blocked || state.busy) return;
    const epoch = state.epoch;
    const alive = () => state.connected && state.epoch === epoch;
    state.busy = true; onBusy(true); sync(); say(message);
    try { await operation(alive); }
    catch (error) { if (alive()) say(errorText(error), true); }
    finally {
      if (alive()) { state.busy = false; onBusy(false); sync(); }
    }
  }
  async function readLists(alive) {
    const [plans, editions] = await Promise.all([api('/api/composer/plans'), api('/api/composer/editions')]);
    if (!alive()) return false;
    state.plans = plans.plans ?? []; state.editions = editions.editions ?? [];
    return true;
  }
  async function refresh() {
    state.attempted = true;
    return run('Reading saved request plans…', async alive => {
      if (!await readLists(alive)) return;
      render(); say('Saved plans and periods refreshed.');
    });
  }
  function autoLoad() {
    if (state.visible && state.connected && !state.blocked && !state.busy && !state.attempted) {
      state.attempted = true;
      queueMicrotask(() => { void refresh(); });
    }
  }
  function newPlan() {
    if (!canLeave()) return;
    clearPlan();
    state.draft = { schema, id: '', name: '', description: '', parameters: [], requests: [] };
    state.referenceEdited = false; state.dirty = true;
    addRequest(false); render(); focusMain();
  }
  function importPlan(file) {
    if (!file || !canLeave()) return;
    void run('Opening the request plan file…', async alive => {
      const text = await file.text(); if (!alive()) return;
      let input;
      try { input = JSON.parse(text); } catch { throw new Error('Choose a valid request plan JSON file.'); }
      const plan = input.plan ?? input;
      if (plan?.schema !== schema || typeof plan.id !== 'string' || typeof plan.name !== 'string'
        || !Array.isArray(plan.requests) || !Array.isArray(plan.parameters)
        || plan.parameters.some(item => !item || typeof item !== 'object' || typeof item.name !== 'string')
        || plan.requests.some(item => !item || typeof item !== 'object'
          || ['key', 'name', 'discoveryFile', 'url', 'method'].some(key => typeof item[key] !== 'string')))
        throw new Error('Choose a saved collection request plan with its parameters and requests.');
      clearPlan(); state.draft = clone(plan); state.dirty = true; state.referenceEdited = true;
      render(); say('Plan imported. Review its source paths and save a revision in this workspace.'); focusMain();
    });
  }
  function openPlan(summary) {
    if (!canLeave()) return;
    void run('Opening the saved plan…', async alive => {
      const saved = await api('/api/composer/plans/' + encodeURIComponent(summary.id) + '/' + encodeURIComponent(summary.planSha256));
      if (!alive()) return;
      clearPlan(); state.saved = saved; state.draft = clone(saved.plan); state.referenceEdited = true;
      render(); say('Saved plan opened.'); focusMain();
    });
  }
  function normalizedPlan() {
    const plan = clone(state.draft);
    plan.id = plan.id.trim(); plan.name = plan.name.trim();
    if (!plan.description?.trim()) delete plan.description;
    else plan.description = plan.description.trim();
    plan.parameters = (plan.parameters ?? []).map(parameter => {
      const result = { name: String(parameter.name ?? '').trim() };
      if (parameter.label?.trim()) result.label = parameter.label.trim();
      if (parameter.default !== undefined && parameter.default !== '') result.default = String(parameter.default);
      return result;
    });
    plan.requests = plan.requests.map((request, index) => {
      const original = state.draft.requests[index];
      const text = state.headerTexts.get(original);
      if (text !== undefined) {
        let headers;
        try { headers = text.trim() ? JSON.parse(text) : {}; } catch { throw new Error('Enter a JSON object of header names and text values for ' + (request.name || 'request ' + (index + 1)) + '.'); }
        if (!headers || Array.isArray(headers) || typeof headers !== 'object' || Object.values(headers).some(value => typeof value !== 'string'))
          throw new Error('Use text values for the headers of ' + (request.name || 'request ' + (index + 1)) + '.');
        request.headers = headers;
      }
      for (const key of ['key', 'name', 'discoveryFile', 'url', 'method', 'operatorWorkspace', 'operatorConfigFile', 'bodyFile', 'ticketFile', 'ticketHeader', 'responseOut'])
        if (typeof request[key] === 'string') request[key] = request[key].trim();
      for (const key of ['operatorWorkspace', 'operatorConfigFile', 'bodyFile', 'ticketFile', 'ticketHeader', 'responseOut'])
        if (!request[key]) delete request[key];
      if (!request.headers || !Object.keys(request.headers).length) delete request.headers;
      return request;
    });
    return plan;
  }
  function savePlan() {
    const form = host.querySelector('[data-plan-form]');
    if (form && !form.reportValidity()) return;
    void run('Saving the request plan revision…', async alive => {
      const plan = normalizedPlan(), saved = await api('/api/composer/plans', { plan });
      if (!alive()) return;
      state.saved = saved; state.draft = clone(saved.plan); state.dirty = false;
      state.catalogs.clear(); state.headerTexts.clear(); state.period = null;
      retainSaved(saved);
      render(); say('Plan revision saved. Open New period to prepare its requests.');
    });
  }
  function retainSaved(saved) {
    state.plans = [{ id: saved.id, name: saved.plan.name, description: saved.plan.description,
      planSha256: saved.planSha256, savedAt: saved.savedAt, requestCount: saved.plan.requests.length,
      parameters: saved.plan.parameters }, ...state.plans.filter(item => item.id !== saved.id || item.planSha256 !== saved.planSha256)];
  }
  function retainEdition(edition) {
    state.editions = [edition, ...state.editions.filter(item => item.collectionId !== edition.collectionId)];
  }
  function invalidateCatalog(request) {
    if (request) state.catalogs.delete(request); else state.catalogs.clear();
    const current = state.draft?.requests[state.requestIndex];
    const panel = host.querySelector('.composer-catalog');
    if (panel && current && (!request || current === request)) panel.replaceWith(renderCatalog(current));
  }
  function requestKey() {
    let n = state.draft.requests.length + 1;
    while (state.draft.requests.some(request => request.key === 'request-' + n)) n++;
    return 'request-' + n;
  }
  function addRequest(redraw = true) {
    if (state.draft.requests.length >= 500) { say('A request plan can contain up to 500 requests.', true); return; }
    const n = state.draft.requests.length + 1;
    state.draft.requests.push({ key: requestKey(), name: 'Request ' + n, discoveryFile: '', rowIndex: 0,
      acceptIndex: 0, url: '', method: 'GET', operatorWorkspace: '' });
    state.requestIndex = state.draft.requests.length - 1; state.requestQuery = ''; dirty();
    if (redraw) render();
  }
  function duplicateRequest() {
    const original = state.draft.requests[state.requestIndex];
    if (!original || state.draft.requests.length >= 500) return;
    const copied = clone(original); copied.key = requestKey(); copied.name = original.name + ' copy';
    state.draft.requests.splice(state.requestIndex + 1, 0, copied); state.requestIndex++;
    if (state.headerTexts.has(original)) state.headerTexts.set(copied, state.headerTexts.get(original));
    dirty(); render();
  }
  function removeRequest() {
    const request = state.draft.requests[state.requestIndex];
    state.draft.requests.splice(state.requestIndex, 1);
    state.catalogs.delete(request); state.headerTexts.delete(request);
    state.requestIndex = Math.max(0, Math.min(state.requestIndex, state.draft.requests.length - 1));
    dirty(); render();
  }
  function moveRequest(offset) {
    const index = state.requestIndex, next = index + offset, requests = state.draft.requests;
    if (next < 0 || next >= requests.length) return;
    [requests[index], requests[next]] = [requests[next], requests[index]];
    state.requestIndex = next; dirty(); render();
  }
  function inspectionPath(request) {
    const defaults = new Map((state.draft.parameters ?? []).map(item => [item.name, item.default]));
    return request.discoveryFile.replace(/\{\{([^{}]+)\}\}/g, (_, name) => {
      const value = defaults.get(name);
      if (value === undefined || value === '') throw new Error('Set a default value for ' + name + ' to inspect this catalog path.');
      if (!/^[A-Za-z0-9_.-]+$/.test(value) || value === '.' || value === '..')
        throw new Error('Use a single file path segment for the default value of ' + name + '.');
      return value;
    });
  }
  function readCatalog(request) {
    void run('Reading the selected saved catalog…', async alive => {
      const path = inspectionPath(request);
      const result = await api('/api/composer/catalog', { path });
      if (!alive() || !state.draft.requests.includes(request)) return;
      state.catalogs.set(request, result);
      render(); say((result.rows?.length ?? 0) + ' saved offers available. Choose an offer and its advertised payment terms.');
    });
  }
  function resourceUrl(row) {
    const value = row?.resource ?? row?.listing?.resource ?? row?.listing?.url;
    return typeof value === 'string' ? value : value?.url ?? '';
  }
  function offerName(row) {
    return row.description || row.listing?.description || resourceUrl(row) || 'Saved offer ' + (row.index + 1);
  }
  function chooseOffer(request, row) {
    request.rowIndex = row.index;
    const acceptance = (row.accepts ?? [])[0];
    if (acceptance) request.acceptIndex = acceptance.index;
    const url = resourceUrl(row); if (url) request.url = url;
    if (typeof row.method === 'string') request.method = row.method.toUpperCase();
    if (/^Request \d+$/.test(request.name)) request.name = offerName(row).slice(0, 160);
    dirty(); render(); focusMain('.composer-request-editor');
  }
  function termName(term) {
    const amount = term.maxAmountRequired ?? term.maxAtomic ?? term.amount;
    return [term.scheme, term.network, amount === undefined ? null : String(amount), term.asset].filter(Boolean).join(' · ') || 'Terms ' + (term.index + 1);
  }
  function renderCatalog(request) {
    const section = el('section', null, 'composer-catalog'), catalog = state.catalogs.get(request);
    add(section, add(el('div', null, 'composer-heading'), el('h4', 'Saved offers'),
      button('Read saved catalog', () => readCatalog(request))));
    if (!catalog) {
      add(section, el('p', 'Read the catalog file to select its offer and advertised terms. Saved row and term selections are retained in the plan.', 'composer-help'));
      return section;
    }
    add(section, el('p', (catalog.rows?.length ?? 0) + ' offers · ' + (catalog.bytes ?? 0).toLocaleString() + ' source bytes', 'composer-help'));
    const choices = el('div'), filter = field('Find an offer', '', value => renderChoices(value));
    add(section, filter.wrap, choices);
    function renderChoices(query = '') {
      choices.replaceChildren();
      const matches = (catalog.rows ?? []).filter(row => [offerName(row), resourceUrl(row), row.method].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
      let shown = 0;
      const list = el('div', null, 'composer-offer-list');
      const more = button('Show more offers', () => appendPage());
      function appendPage() {
        const end = Math.min(shown + 30, matches.length);
        for (const row of matches.slice(shown, end)) {
          const item = button('', () => chooseOffer(request, row), 'composer-choice');
          item.setAttribute('aria-current', String(request.rowIndex === row.index));
          add(item, el('strong', offerName(row)), el('small', (row.method ?? 'GET') + ' · ' + resourceUrl(row)));
          list.append(item);
        }
        shown = end; more.hidden = shown >= matches.length;
      }
      appendPage(); add(choices, list, more);
      if (!matches.length) add(choices, el('p', 'No offers match this search.', 'composer-help'));
    }
    renderChoices();
    const selected = (catalog.rows ?? []).find(row => row.index === request.rowIndex);
    if (selected) {
      const terms = selected.accepts ?? [];
      const term = selectField('Advertised payment terms', terms.map(item => [item.index, termName(item)]),
        request.acceptIndex, value => { request.acceptIndex = Number(value); dirty(); render(); host.querySelector('.composer-catalog select')?.focus({ preventScroll: true }); });
      add(section, term.wrap);
      const accepted = terms.find(item => item.index === request.acceptIndex);
      if (accepted) {
        const values = [['Scheme', accepted.scheme], ['Network', accepted.network], ['Asset', accepted.asset],
          ['Advertised maximum', accepted.maxAmountRequired ?? accepted.maxAtomic ?? accepted.amount],
          ['Recipient', accepted.payTo], ['Timeout in seconds', accepted.maxTimeoutSeconds]].filter(([, value]) => value !== undefined && value !== null);
        add(section, details('Selected payment terms', table(['Term', 'Value'], values)));
      } else add(section, el('p', 'Choose one of this offer’s saved payment terms.', 'composer-help'));
    }
    return section;
  }
  function renderParameters(plan) {
    const section = details('Period parameters', el('p',
      'Use a named value such as {{month}} in file paths and URL query values. File substitutions are single path segments; query values are encoded when the period is prepared.', 'composer-help'));
    const rows = el('div', null, 'composer-parameter-list');
    (plan.parameters ?? []).forEach((parameter, index) => {
      const line = grid(
        field('Name', parameter.name, value => { parameter.name = value; invalidateCatalog(); dirty(); }, { required: true, placeholder: 'month' }).wrap,
        field('Label', parameter.label, value => { parameter.label = value; dirty(); }, { placeholder: 'Reporting month' }).wrap,
        field('Default value', parameter.default, value => { parameter.default = value; invalidateCatalog(); dirty(); }, { placeholder: '2026-10' }).wrap);
      add(line, button('Remove parameter', () => { plan.parameters.splice(index, 1); dirty(); render(); }));
      rows.append(line);
    });
    add(section, rows, button('Add parameter', () => { plan.parameters ??= []; plan.parameters.push({ name: '', label: '', default: '' }); dirty(); render(); }));
    return section;
  }
  function renderRequestEditor(request) {
    const editor = el('section', null, 'composer-request-editor');
    const set = key => value => { request[key] = value; dirty(); };
    add(editor, add(el('div', null, 'composer-heading'), el('h3', request.name || 'Request details'),
      add(el('div', null, 'composer-actions'), button('Duplicate', duplicateRequest), button('Remove', removeRequest))));
    add(editor, field('Request name', request.name, set('name'), { required: true, maxLength: 160 }).wrap,
      field('Saved catalog file', request.discoveryFile, value => {
        request.discoveryFile = value; invalidateCatalog(request); dirty();
      }, { required: true, placeholder: '/absolute/path/catalog.json',
        help: 'Use an existing saved catalog. Period parameters may select a different file for each edition.' }).wrap,
      renderCatalog(request));
    add(editor, grid(
      selectField('Method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map(value => [value, value]),
        request.method, set('method')).wrap,
      field('Request URL', request.url, set('url'), { required: true, placeholder: 'https://provider.example/resource?month={{month}}' }).wrap));
    const binding = request.operatorConfigFile !== undefined ? 'config' : 'workspace';
    add(editor, selectField('Existing operator', [['workspace', 'Operator workspace'], ['config', 'Operator configuration file']],
      binding, value => {
        delete request.operatorWorkspace; delete request.operatorConfigFile;
        request[value === 'workspace' ? 'operatorWorkspace' : 'operatorConfigFile'] = ''; dirty(); render();
      }).wrap);
    add(editor, field(binding === 'workspace' ? 'Operator workspace directory' : 'Operator configuration file',
      binding === 'workspace' ? request.operatorWorkspace : request.operatorConfigFile,
      set(binding === 'workspace' ? 'operatorWorkspace' : 'operatorConfigFile'),
      { required: true, placeholder: '/absolute/private/operator',
        help: 'The existing operator supplies the account, signer settings and spending limits for this request.' }).wrap);
    add(editor, grid(
      field('Response destination', request.responseOut, set('responseOut'),
        { placeholder: '/absolute/path/results/{{month}}/response.json' }).wrap,
      field('Request body file', request.bodyFile, set('bodyFile'),
        { placeholder: '/absolute/path/inputs/{{month}}/request.json',
          help: 'For requests with a body, choose the actual saved file for that period.' }).wrap));
    const advanced = details('Request references and optional headers',
      grid(field('Request reference', request.key, set('key'), { required: true, maxLength: 40 }).wrap,
        field('Saved offer row', request.rowIndex, value => { request.rowIndex = Number(value); dirty(); },
          { type: 'number', required: true, min: 0 }).wrap,
        field('Saved terms index', request.acceptIndex, value => { request.acceptIndex = Number(value); dirty(); },
          { type: 'number', required: true, min: 0 }).wrap),
      field('Headers (JSON object)', state.headerTexts.get(request) ?? JSON.stringify(request.headers ?? {}, null, 2),
        value => { state.headerTexts.set(request, value); dirty(); }, { rows: 4 }).wrap,
      grid(field('Access ticket file', request.ticketFile, set('ticketFile')).wrap,
        field('Ticket header name', request.ticketHeader, set('ticketHeader')).wrap));
    add(editor, advanced);
    return editor;
  }
  function renderPlan() {
    const plan = state.draft, form = el('form'); form.dataset.planForm = 'true';
    form.addEventListener('submit', event => { event.preventDefault(); savePlan(); });
    const reference = field('Plan reference', plan.id, value => { plan.id = value; state.referenceEdited = true; dirty(); },
      { required: true, maxLength: 80, help: 'Keep this reference when saving another revision of the same plan.' });
    const name = field('Plan name', plan.name, value => {
      plan.name = value;
      if (!state.referenceEdited) { plan.id = slug(value); reference.input.value = plan.id; }
      dirty();
    }, { required: true, maxLength: 160, placeholder: 'Monthly source review' });
    add(form, grid(name.wrap, reference.wrap),
      field('Description', plan.description, value => { plan.description = value; dirty(); }, { rows: 2 }).wrap,
      renderParameters(plan));
    const requestLayout = el('div', null, 'composer-request-layout'), list = el('section', null, 'composer-request-list');
    add(list, add(el('div', null, 'composer-heading'), el('h3', 'Requests (' + plan.requests.length + ')'),
      button('Add request', () => addRequest())));
    const items = el('div', null, 'composer-choice-list');
    function renderRequestChoices() {
      items.replaceChildren();
      const query = state.requestQuery.toLowerCase().trim();
      plan.requests.forEach((request, index) => {
        if (query && ![request.name, request.key, request.url].join(' ').toLowerCase().includes(query)) return;
        const choice = button('', () => { state.requestIndex = index; render(); focusMain('.composer-request-editor'); }, 'composer-choice');
        choice.setAttribute('aria-current', String(index === state.requestIndex));
        add(choice, el('strong', (index + 1) + '. ' + (request.name || 'Unnamed request')),
          el('small', request.method + ' · ' + (request.url || 'Choose a saved offer')));
        items.append(choice);
      });
      if (!items.childElementCount) add(items, el('p', query ? 'No matching requests.' : 'Add the first request to this plan.', 'composer-help'));
    }
    add(list, field('Find a request', state.requestQuery, value => { state.requestQuery = value; renderRequestChoices(); }, { type: 'search' }).wrap,
      items, add(el('div', null, 'composer-actions'), button('Move up', () => moveRequest(-1)), button('Move down', () => moveRequest(1))));
    renderRequestChoices(); add(requestLayout, list);
    const request = plan.requests[state.requestIndex];
    if (request) add(requestLayout, renderRequestEditor(request));
    add(form, requestLayout);
    saveButton = button('Save plan revision', savePlan, 'primary');
    add(form, add(el('div', null, 'composer-save'), saveButton,
      el('p', 'Saving retains the request plan. Prepare a period to read its selected sources and review the collection.', 'composer-help')));
    return form;
  }
  function beginPeriod() {
    if (!state.saved || state.dirty) { say('Save the plan revision before preparing a period.', true); return; }
    const month = new Date().toISOString().slice(0, 7), base = slug(state.saved.id + '-' + month).slice(0, 75);
    let id = base, suffix = 2;
    while (state.editions.some(edition => edition.collectionId === id)) id = base + '-' + suffix++;
    state.period = { collectionId: id, name: state.saved.plan.name + ' — ' + month,
      values: Object.fromEntries((state.saved.plan.parameters ?? []).map(parameter => [parameter.name, parameter.default ?? ''])) };
    state.edition = null; state.tab = 'period'; render(); focusMain();
  }
  function preparePeriod() {
    const form = host.querySelector('[data-period-form]');
    if (form && !form.reportValidity()) return;
    if (!state.saved || state.dirty || !state.period) return;
    const input = { planId: state.saved.id, planSha256: state.saved.planSha256,
      collectionId: state.period.collectionId.trim(), name: state.period.name.trim(), values: clone(state.period.values) };
    void run('Preparing the period from its saved inputs…', async alive => {
      const edition = await api('/api/composer/editions/prepare', input); if (!alive()) return;
      state.edition = edition; retainEdition(edition);
      render(); say(edition.preview ? 'Review every request and its limits before creating the collection.' : 'Preparation saved. Inspect the current source state below.');
      focusMain('.composer-period-review');
    });
  }
  function openEdition(summary) {
    void run('Opening the saved period…', async alive => {
      const edition = await api('/api/composer/editions/' + encodeURIComponent(summary.collectionId)); if (!alive()) return;
      state.edition = edition; state.tab = 'period';
      render(); say('Saved period opened.'); focusMain();
    });
  }
  function refreshEdition() {
    if (!state.edition) return;
    openEdition(state.edition);
  }
  function resumeEdition() {
    const original = state.edition;
    if (!original) return;
    void run('Continuing the saved period preparation…', async alive => {
      const edition = await api('/api/composer/editions/prepare', {
        planId: original.planId, planSha256: original.planSha256, collectionId: original.collectionId,
        name: original.name, values: original.values,
      });
      if (!alive()) return; state.edition = edition; retainEdition(edition);
      render(); say('Saved period refreshed.');
    });
  }
  function createPeriodCollection() {
    const edition = state.edition;
    if (!edition?.preview || edition.phase !== 'PREPARED') return;
    void run('Creating the reviewed collection…', async alive => {
      const result = await api('/api/composer/editions/' + encodeURIComponent(edition.collectionId) + '/create',
        { expectedEditionSha256: edition.editionSha256, expectedPreviewSha256: edition.preview.previewSha256 });
      if (!alive()) return; state.edition = result; retainEdition(result);
      render();
      if (result.phase === 'CREATED' && result.collection) {
        await onCreated(result); if (!alive()) return;
        say('Reviewed collection created. Its original request controls are ready.');
      } else say('Saved period updated. Review its current input state and continue the same collection preparation.');
    });
  }
  function openCreated(edition) {
    void run('Opening the original collection…', async alive => {
      await onCreated(edition); if (alive()) say('Original collection opened.');
    });
  }
  function previewView(edition) {
    const section = el('section', null, 'composer-period-review'), preview = edition.preview;
    add(section, add(el('div', null, 'composer-heading'), el('h3', edition.name), el('span', phase(edition.phase), 'composer-state')));
    add(section, el('p', 'Prepared ' + date(edition.createdAt), 'composer-help'));
    if (edition.issues?.length) {
      const list = el('ul');
      edition.issues.forEach(issue => list.append(el('li', typeof issue === 'string' ? errorText({ message: issue }) : issue.message ?? errorText({ code: issue.code }))));
      add(section, add(el('div', null, 'composer-issues'), el('h4', 'Inputs to review'), list));
    }
    if (preview) {
      add(section, el('h4', 'Collection spending limits'),
        el('p', 'Amounts are shown in atomic units and remain separate for each network, payment flow, asset and recipient.', 'composer-help'),
        table(['Network / flow', 'Asset', 'Recipient', 'Requests', 'Maximum · atomic'],
          (preview.totals ?? []).map(total => [
            [total.network, total.scheme, total.paymentFlow].filter(Boolean).join(' · '),
            total.asset, total.payTo, total.itemCount, total.maxAtomic,
          ])));
      const names = new Map((edition.requests ?? []).map(request => [request.intentId, request.name]));
      add(section, el('h4', 'Included requests'), table(['Request', 'Resource', 'Method', 'Maximum · atomic', 'Response destination'],
        (preview.items ?? []).map(item => [names.get(item.intentId) ?? item.intentId, item.operation?.url,
          item.operation?.method, item.operation?.expect?.maxAtomic,
          typeof item.responseDestination === 'string' ? item.responseDestination : item.responseDestination?.destination ?? 'Retained request result'])));
    } else add(section, el('p', 'Open the retained preparation after its inputs are available to receive the original collection review.', 'composer-help'));
    if (Object.keys(edition.values ?? {}).length)
      add(section, details('Period values', table(['Parameter', 'Value'], Object.entries(edition.values))));
    add(section, details('Saved request references',
      table(['Request', 'Configuration file', 'Saved catalog', 'Operator workspace'],
        (edition.requests ?? []).map(request => [request.name, request.configFile, request.discovery?.path,
          request.operator?.workspaceDirectory ?? request.operator?.configFile])),
      table(['Reference', 'Value'], [['Collection', edition.collectionId], ['Plan', edition.planId],
        ['Plan revision', edition.planSha256], ['Edition revision', edition.editionSha256]])));
    const actions = el('div', null, 'composer-actions');
    if (edition.phase === 'CREATED' && edition.collection) add(actions, button('Open collection', () => openCreated(edition), 'primary'));
    else if (edition.phase === 'PREPARED' && preview) add(actions, button(edition.collection?.state === 'PREPARING' ? 'Complete reviewed collection' : 'Create reviewed collection', createPeriodCollection, 'primary'));
    else add(actions, button('Continue original preparation', resumeEdition));
    add(actions, button('Refresh status', refreshEdition),
      button('Download period JSON', () => download(edition, edition.collectionId + '-period.json')));
    if (edition.editionSha256) add(actions, button('Share plan and inputs', () => sharing.showExport(edition)));
    add(section, actions);
    return section;
  }
  function renderPeriod() {
    const section = el('section');
    if (state.edition) {
      add(section, previewView(state.edition));
      if (state.saved && !state.dirty) add(section, button('Prepare another period', beginPeriod));
      return section;
    }
    if (!state.saved || state.dirty) {
      add(section, el('h3', 'Save the plan revision first'),
        el('p', 'A period uses one saved plan revision. Finish the request definitions and save the plan before preparing its collection.'),
        button('Return to plan', () => { state.tab = 'plan'; render(); }));
      return section;
    }
    if (!state.period) {
      add(section, el('h3', 'Prepare a new period'),
        el('p', 'Choose the period values and a new collection reference. The workspace reads the actual selected files and prepares every request together.'),
        button('Set up period', beginPeriod, 'primary'));
      return section;
    }
    const form = el('form'); form.dataset.periodForm = 'true';
    form.addEventListener('submit', event => { event.preventDefault(); preparePeriod(); });
    add(form, el('h3', 'Prepare a new period'), grid(
      field('Period name', state.period.name, value => { state.period.name = value; }, { required: true, maxLength: 160 }).wrap,
      field('Collection reference', state.period.collectionId, value => { state.period.collectionId = value; },
        { required: true, maxLength: 80, help: 'Use a new reference for a new period. Keep it unchanged when resuming an interrupted preparation.' }).wrap));
    for (const parameter of state.saved.plan.parameters ?? [])
      add(form, field(parameter.label || parameter.name, state.period.values[parameter.name],
        value => { state.period.values[parameter.name] = value; },
        { required: parameter.default === undefined, help: 'Parameter: ' + parameter.name }).wrap);
    add(form, el('p', state.saved.plan.requests.length + ' requests from the saved plan revision will be prepared.', 'composer-help'),
      button('Prepare and review period', preparePeriod, 'primary'));
    add(section, form); return section;
  }
  function renderEditions() {
    const section = el('section');
    const editions = state.saved ? state.editions.filter(item => item.planId === state.saved.id) : state.editions;
    add(section, el('h3', state.saved ? 'Periods from this plan' : 'Saved periods'),
      table(['Period', 'Status', 'Prepared', ''], editions.map(edition => [
        edition.name ?? edition.collectionId, phase(edition.phase), date(edition.createdAt),
        button('Open', () => openEdition(edition)),
      ])));
    return section;
  }
  function renderLibrary() {
    const section = el('section'), content = el('div'), actions = el('div', null, 'composer-actions');
    const upload = el('input'); upload.type = 'file'; upload.accept = '.json,application/json'; upload.hidden = true;
    upload.addEventListener('change', () => { importPlan(upload.files?.[0]); upload.value = ''; });
    add(actions, button('New request plan', newPlan, 'primary'), button('Import plan JSON', () => upload.click()),
      button('Saved periods', () => { state.tab = 'editions'; render(); }),
      button('Shared plans', () => sharing.showLibrary()), upload);
    add(section, actions, field('Find a plan', state.libraryQuery, value => { state.libraryQuery = value; draw(); }, { type: 'search' }).wrap, content);
    function draw() {
      const query = state.libraryQuery.toLowerCase().trim();
      const plans = state.plans.filter(plan => [plan.name, plan.description, plan.id].join(' ').toLowerCase().includes(query));
      content.replaceChildren(table(['Request plan revision', 'Requests', 'Saved', ''], plans.map(plan => [
        add(el('div'), el('strong', plan.name), plan.description ? el('p', plan.description, 'composer-help') : null),
        plan.requestCount, date(plan.savedAt), button('Open plan', () => openPlan(plan)),
      ])));
      if (!state.plans.length) add(content, el('p', 'Create a plan from your saved catalog offers, then prepare a separate collection for each reporting period.', 'composer-help'));
    }
    draw(); return section;
  }
  function focusMain(selector = '.composer-main') {
    const target = host.querySelector(selector);
    if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  }
  function render() {
    host.replaceChildren(); statusLabel = null; saveButton = null;
    shell = el('fieldset', null, 'composer-shell');
    const title = el('div', null, 'composer-heading');
    add(title, add(el('div'), el('h2', 'Request plans'),
      el('p', 'Build reusable request plans from saved offers and prepare each period as its own collection.', 'composer-help')),
      button('Refresh plans', () => { void refresh(); }));
    add(shell, title);
    notice = el('p', null, 'composer-notice'); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite'); notice.hidden = true;
    body = el('div', null, 'composer-main'); add(shell, notice, body); add(host, shell);
    if (!state.connected) { add(body, el('p', 'Open an existing Collections workspace to author request plans.')); sync(); return; }
    if (state.tab === 'sharing') { sharing.render(body); sync(); return; }
    if (!state.draft) {
      if (state.tab === 'editions') add(body, button('All request plans', () => { state.tab = 'plan'; render(); }), renderEditions());
      else if (state.tab === 'period' && state.edition) add(body, button('All saved periods', () => { state.tab = 'editions'; render(); }), renderPeriod());
      else add(body, renderLibrary());
      sync(); return;
    }
    const header = el('div', null, 'composer-heading'), actions = el('div', null, 'composer-actions');
    statusLabel = el('p', null, 'composer-help');
    add(header, add(el('div'), el('h3', state.draft.name || 'New request plan'), statusLabel));
    add(actions, button('All plans', () => { if (canLeave()) { clearPlan(); render(); } }));
    if (state.saved) add(actions, button('Download saved plan', () => download(state.saved.plan, state.saved.id + '-plan.json')));
    add(header, actions); add(body, header);
    const tabs = el('nav', null, 'composer-tabs'); tabs.setAttribute('aria-label', 'Request plan views');
    for (const [key, label] of [['plan', 'Plan'], ['period', state.edition ? 'Period review' : 'New period'], ['editions', 'Saved periods']]) {
      const tab = button(label, () => { state.tab = key; render(); });
      tab.setAttribute('aria-current', String(state.tab === key)); tabs.append(tab);
    }
    add(body, tabs, state.tab === 'plan' ? renderPlan() : state.tab === 'period' ? renderPeriod() : renderEditions());
    sync();
  }
  render();
  return {
    connect(status) {
      const changed = state.workspace !== status.directory;
      if (changed) { sharing.reset(); if (state.tab === 'sharing') state.tab = sharingReturnTab; }
      else sharing.reconnect();
      state.epoch++; state.busy = false; onBusy(false);
      state.connected = Boolean(status.directory); state.workspace = status.directory ?? null; state.attempted = false;
      if (changed) { clearPlan(); state.plans = []; state.editions = []; }
      render(); autoLoad();
    },
    disconnect() {
      sharing.reset();
      state.epoch++; state.connected = false; state.busy = false; state.workspace = null; state.attempted = false;
      clearPlan(); state.plans = []; state.editions = []; onBusy(false); render();
    },
    setVisible(value) { state.visible = Boolean(value); autoLoad(); },
    setBlocked(value) { state.blocked = Boolean(value); sync(); autoLoad(); },
    refresh,
  };
}
