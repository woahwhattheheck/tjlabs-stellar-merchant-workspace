/* MIT. Document evidence in the original IATI console; loaded as a deferred classic script. */
'use strict';
window.IatiDocumentEvidenceUi = function (api) {
  const BASE = '/api/iati/document-evidence/', ORG = '/api/iati/organisation/', PAGE = 50, BROWSER_BYTES = 64 * 1024 * 1024;
  const DB_NAME = 'sf30-iati-document-evidence-v1', STORE = 'records', FALLBACK = 'sf30.iati.document-evidence.';
  const $ = name => document.getElementById('ide-' + name);
  const text = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const query = value => new URLSearchParams(Object.entries(value).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])).toString();
  const sha = value => /^[a-f0-9]{64}$/.test(text(value));
  const positive = (value, label) => { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) throw new Error(label + ' must be a positive integer.'); return n; };
  const short = value => text(value).slice(0, 12);
  const bytesLabel = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() + ' bytes' : 'Not reported';
  const dateLabel = value => {
    if (value == null) return 'Not recorded';
    const d = new Date(typeof value === 'number' && value < 1e11 ? value * 1000 : value);
    return Number.isFinite(d.valueOf()) ? d.toISOString() : text(value);
  };
  let mounted = false, workspaceKey = null, epoch = 0, refreshSerial = 0, sourceSerial = 0, planSerial = 0, detailSerial = 0, statusSerial = 0;
  let database = null, draftTimer = null, localBusy = false, activeTab = 'selection';
  let catalogue = { plans: [], organisationPlans: [], activeRequests: [] }, plan = null, planHistory = [], rows = [], rowsById = new Map();
  let sourcePage = { rows: [], offset: 0, total: 0, snapshot: null, selection: null }, sourceRows = new Map(), selectedSourceRows = new Set();
  let sourceHistory = [], sourceDetail = null, selectedRowId = null, selectedDetail = null, evidenceOffset = 0, reviewOffset = 0;
  let reviewDraft = new Map(), reviewDirty = false, captureSelection = new Set(), queue = null, pending = null, restored = null;
  let comparison = null, comparisonInputs = null, comparisonBefore = [], comparisonAfter = [], pairs = [], knownComparisons = [], restoredKey = null;
  let correction = null, receiving = null, receiveFile = null, downloadUrls = new Set(), activeObservation = null;
  const memory = new Map(), observationCache = new Map();
  function node(tag, value, className) {
    const el = document.createElement(tag);
    if (value !== undefined) el.textContent = text(value);
    if (className) el.className = className;
    return el;
  }
  function empty(el, message) { el.replaceChildren(); if (message) el.append(node('p', message, 'ide-muted')); }
  function note(message, error = false) { $('message').textContent = message; $('message').classList.toggle('ide-error', error); api.status(message, error); }
  function identity() { return { workspace: workspaceKey, epoch }; }
  function valid(token) { return token.workspace === workspaceKey && token.epoch === epoch; }
  function requireWorkspace() { if (!workspaceKey) throw new Error('Open the original IATI workspace first.'); }
  function currentSummary() { return plan && catalogue.plans.find(item => item.id === plan.id); }
  function currentRevision() { return currentSummary()?.revision ?? plan?.revision; }
  function freshPlan() { return !!plan && plan.revision === currentRevision(); }
  function hasActiveAcquisition() {
    return !!plan && (catalogue.activeRequests || []).some(item => item.state === 'ACQUIRING'
      && (item.planId === plan.id || item.id === plan.id || item.input?.id === plan.id || item.plan?.id === plan.id));
  }
  function canMutate() { return !!workspaceKey && !localBusy && !api.isBusy() && !queue?.running && !pending; }
  function assertEditable() {
    requireWorkspace();
    if (!plan) throw new Error('Open a saved evidence plan.');
    if (!freshPlan()) throw new Error('This is a historical revision. Open the current revision before changing it.');
    if (hasActiveAcquisition()) throw new Error('An original acquisition is still active on this plan. Reconcile that request before changing metadata or review.');
  }
  function options(el, values, selected, placeholder) {
    const keep = selected === undefined ? el.value : String(selected ?? '');
    el.replaceChildren(new Option(placeholder || 'Choose a saved record', ''));
    for (const item of values) el.add(new Option(item.label, String(item.value)));
    if (keep && ![...el.options].some(o => o.value === keep)) el.add(new Option('Retained selection · ' + short(keep), keep));
    el.value = keep;
  }
  function dataTable(holder, headings, data) {
    empty(holder);
    if (!data.length) { holder.append(node('p', 'No records in this selection.', 'ide-muted')); return; }
    const wrap = node('div', undefined, 'ide-table-wrap'), table = node('table', undefined, 'ide-table'), head = node('thead'), tr = node('tr');
    for (const h of headings) { const th = node('th', h); th.scope = 'col'; tr.append(th); }
    head.append(tr); table.append(head); const body = node('tbody');
    for (const record of data) {
      const row = node('tr');
      for (const value of record) { const cell = node('td'); if (value instanceof Node) cell.append(value); else cell.textContent = text(value); row.append(cell); }
      body.append(row);
    }
    table.append(body); wrap.append(table); holder.append(wrap);
  }
  function jsonDetails(holder, title, value) {
    const d = node('details'), s = node('summary', title), p = node('pre', JSON.stringify(value, null, 2), 'ide-json');
    d.append(s, p); holder.append(d); return d;
  }
  function labels(values) { return (values || []).map(v => typeof v === 'string' ? v : v.text ?? v.code ?? v.name ?? JSON.stringify(v)).join(' · '); }
  function titleOf(row) { return labels(row?.titles) || row?.url || 'Untitled document'; }
  function literalUrl(row) {
    const el = node('div');
    el.append(node('span', row.url ?? '', 'ide-url'));
    if (typeof row.url === 'string' && row.url.trim() !== row.url) el.append(node('small', 'Literal whitespace retained: ' + JSON.stringify(row.url), 'ide-muted'));
    return el;
  }
  function button(label, operation, control = 'read') {
    const el = node('button', label); el.type = 'button'; el.dataset.ideControl = control; el.onclick = operation; return el;
  }
  function checkedInput(value, change, label) {
    const box = node('input'); box.type = 'checkbox'; box.checked = !!value; box.setAttribute('aria-label', label);
    box.dataset.ideControl = 'edit'; box.onchange = () => change(box.checked); return box;
  }
  function pager(holder, offset, total, change) {
    empty(holder);
    holder.append(button('Previous', () => change(Math.max(0, offset - PAGE))), node('span', total ? (offset + 1) + '–' + Math.min(total, offset + PAGE) + ' of ' + total : '0 records'),
      button('Next', () => change(offset + PAGE)));
    holder.firstChild.disabled = offset <= 0;
    holder.lastChild.disabled = offset + PAGE >= total;
    holder.firstChild.dataset.idePageDisabled = String(offset <= 0);
    holder.lastChild.dataset.idePageDisabled = String(offset + PAGE >= total);
  }
  function tab(name) {
    activeTab = name;
    $('panel').querySelectorAll('[data-ide-panel]').forEach(el => { el.hidden = el.dataset.idePanel !== name; });
    $('panel').querySelectorAll('[data-ide-tab]').forEach(el => { const active = el.dataset.ideTab === name; el.classList.toggle('active', active); el.setAttribute('aria-selected', String(active)); });
    scheduleDraft();
  }
  async function openDatabase() {
    if (database) return database;
    if (!window.indexedDB) throw new Error('IndexedDB is unavailable.');
    database = await new Promise((resolve, reject) => {
      const opening = indexedDB.open(DB_NAME, 1); let settled = false;
      const timeout = setTimeout(() => { if (!settled) { settled = true; reject(new Error('Browser recovery storage did not open.')); } }, 2500);
      opening.onupgradeneeded = () => { if (!opening.result.objectStoreNames.contains(STORE)) opening.result.createObjectStore(STORE); };
      opening.onsuccess = () => { if (settled) opening.result.close(); else { settled = true; clearTimeout(timeout); resolve(opening.result); } };
      opening.onerror = () => { if (!settled) { settled = true; clearTimeout(timeout); reject(opening.error); } };
      opening.onblocked = () => { if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('Browser recovery storage is blocked by another page.')); } };
    });
    return database;
  }
  // The current financial component's per-key fallback ownership is retained:
  // a newer fallback wins, a delete leaves a tombstone, and a committed primary write retires stale fallback.
  async function storage(mode, suffix, value, selectedWorkspace = workspaceKey) {
    if (!selectedWorkspace) return mode === 'read' ? undefined : false;
    const key = selectedWorkspace + ':' + suffix, fallbackKey = FALLBACK + key, marker = 'sf30.iati.document-evidence.fallback.v1';
    function fallback() {
      if (memory.has(key)) return memory.get(key);
      try { const raw = sessionStorage.getItem(fallbackKey); if (raw === null) return null; const v = JSON.parse(raw); return v?.schema === marker ? v : { schema: marker, state: 'value', value: v }; }
      catch { return null; }
    }
    function valueOf(v) { if (v.state === 'deleted') return undefined; if (v.state !== 'value') throw new Error('Unknown browser recovery state.'); return v.value; }
    let fallbackDurable = false;
    if (mode === 'read') { const owned = fallback(); if (owned !== null) return valueOf(owned); }
    else {
      const record = mode === 'delete' ? { schema: marker, state: 'deleted' } : { schema: marker, state: 'value', value: clone(value) };
      memory.set(key, record);
      try { const raw = JSON.stringify(record); sessionStorage.setItem(fallbackKey, raw); fallbackDurable = sessionStorage.getItem(fallbackKey) === raw; }
      catch {
        try { sessionStorage.removeItem(fallbackKey); } catch {}
        let older = null; try { older = sessionStorage.getItem(fallbackKey); } catch {}
        if (older !== null) throw new Error('The browser could not replace an older recovery record. Download the retained action before changing browser storage.');
      }
    }
    try {
      const db = await openDatabase();
      const answer = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode === 'read' ? 'readonly' : 'readwrite'), store = tx.objectStore(STORE);
        const operation = mode === 'read' ? store.get(key) : mode === 'delete' ? store.delete(key) : store.put(value, key);
        let result; operation.onsuccess = () => { result = operation.result; };
        tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      if (mode !== 'read') { try { sessionStorage.removeItem(fallbackKey); memory.delete(key); } catch {} return true; }
      return answer;
    } catch {
      const owned = fallback();
      if (mode === 'read') return owned === null ? undefined : valueOf(owned);
      return fallbackDurable;
    }
  }
  function formValues() {
    const ids = ['org-plan','org-revision','source-view','source-org-key','name','actor','notes','max-bytes','timeout','connect-timeout','redirects',
      'capture-actor','review-actor','review-note','before-plan','before-revision','after-plan','after-revision','pairing-mode','compare-actor','compare-notes',
      'comparison-id','receive-name','receive-notes','receive-actor'];
    return Object.fromEntries(ids.map(id => [id, $(id)?.value ?? '']));
  }
  function uiDraft() {
    return { schema: 'sf30.iati.document-evidence.ui.v1', updatedAt: new Date().toISOString(), restoredKey, values: formValues(), tab: activeTab,
      recapture: $('recapture').checked, selectedSourceRows: [...selectedSourceRows], sourceSelection: sourcePage.selection, sourceSnapshot: sourcePage.snapshot, sourceOffset: sourcePage.offset,
      selectedEvidence: plan ? { id: plan.id, revision: plan.revision } : null, selectedRowId,
      evidenceOffset, reviewOffset, reviewDirty, decisions: [...reviewDraft], captureSelection: [...captureSelection],
      comparisonInputs, pairs: clone(pairs), knownComparisons: clone(knownComparisons),
      queue: queue ? { ...clone(queue), running: false, stopRequested: true, state: queue.running ? 'PAUSED_ON_RECONNECT' : queue.state } : null };
  }
  async function persistDraft() {
    if (!workspaceKey || !mounted) return;
    const key = workspaceKey, draft = uiDraft();
    await storage('write', 'ui', draft, key);
  }
  function scheduleDraft() {
    if (!workspaceKey) return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => { draftTimer = null; persistDraft().catch(error => note(error.message, true)); }, 200);
  }
  function applyDraft(draft) {
    if (!draft || draft.schema !== 'sf30.iati.document-evidence.ui.v1') return;
    for (const [id, value] of Object.entries(draft.values || {})) {
      const el = $(id); if (!el) continue;
      if (el.tagName === 'SELECT' && value && ![...el.options].some(o => o.value === String(value))) el.add(new Option('Retained selection · ' + short(value), String(value)));
      el.value = text(value);
    }
    selectedSourceRows = new Set(draft.selectedSourceRows || []); reviewDraft = new Map(draft.decisions || []); reviewDirty = !!draft.reviewDirty;
    captureSelection = new Set(draft.captureSelection || []); pairs = clone(draft.pairs || []); comparisonInputs = draft.comparisonInputs || null;
    knownComparisons = clone(draft.knownComparisons || []); restoredKey = draft.restoredKey || null; queue = draft.queue ? { ...clone(draft.queue), running: false, stopRequested: true } : null;
    evidenceOffset = draft.evidenceOffset || 0; reviewOffset = draft.reviewOffset || 0; selectedRowId = draft.selectedRowId || null;
    sourcePage.selection = draft.sourceSelection || null; sourcePage.snapshot = draft.sourceSnapshot || null; sourcePage.offset = draft.sourceOffset || 0;
    activeTab = draft.tab || 'selection'; $('recapture').checked = !!draft.recapture;
  }
  async function retainPending(value) {
    const token = identity(); pending = clone(value); renderPending(); buttons();
    const durable = await storage('write', 'pending', pending, token.workspace);
    if (!valid(token)) throw new Error('The workspace changed before this action was sent. Its original request is retained with its workspace.');
    if (!durable) { pending.storageError = true; renderPending(); throw new Error('The browser could not durably retain this action. Download its complete request and make browser storage available before sending.'); }
  }
  function pendingInput() {
    return pending?.route === 'receive' ? pending.packet : pending?.input;
  }
  function validateTerminalResult(original, result) {
    const route=original.route, input=original.input;
    if (route === 'compare') {
      if (!result || !sha(result.id) || !Array.isArray(result.rows) || !result.before || !result.after) throw new Error('The saved comparison receipt is incomplete.');
      for (const side of ['before','after']) if (input && (result[side].id !== input[side]?.id || result[side].revision !== input[side]?.revision)) throw new Error('The saved comparison differs from its original selected revisions.');
      return;
    }
    if (route === 'receive') {
      if (result?.state !== 'COMPLETE' || !result.packet || !sha(result.packet.sha256)) throw new Error('The native receiving result does not describe a complete original package.');
      if (original.packet && (result.packet.sha256 !== original.packet.sha256 || result.packet.bytes !== original.packet.bytes)) throw new Error('The receiving result names bytes different from the selected original ZIP.');
      validatePlan(result.plan); validatePlan(result.currentPlan,result.plan.id);
      if (result.currentPlan.revision < result.plan.revision) throw new Error('The receiving result lost its selected original revision.');
      return;
    }
    if (!['save','note','observe','review'].includes(route)) throw new Error('The original action has no supported terminal result.');
    const value=route === 'observe' ? result?.plan : result;
    validatePlan(value);
    if (input?.id && value.id !== input.id) throw new Error('The returned plan belongs to another original action.');
    if (input && (value.event?.requestId !== input.requestId || value.event?.action !== route)) throw new Error('The saved plan event differs from its original request and action.');
    if (route === 'save' && input && (value.selection?.id !== input.selection.id || value.selection?.revision !== input.selection.revision || value.selection?.view !== input.selection.view ||
        !same(value.documents.map(row=>row.id).sort(),[...input.documentRowIds].sort()))) throw new Error('The saved evidence plan differs from its complete original source selection.');
    if (route === 'review' && (!value.review || !Array.isArray(value.review.decisions) || typeof value.review.actor !== 'string' || typeof value.review.note !== 'string')) throw new Error('The saved review result is missing its complete named decisions.');
    if (route === 'observe') {
      const observation=result.observation;
      if (!observation || observation.planId !== value.id || !sha(observation.id) || !sha(observation.recordSha256) || !Array.isArray(observation.rowIds) ||
          !['COMPLETE','TRUNCATED','FAILED','REFUSED','INTERRUPTED'].includes(observation.state) || !value.observationIds.includes(observation.id)) throw new Error('The acquisition result is missing its original terminal observation.');
      if (input && (observation.requestId !== input.requestId || !same([...observation.rowIds].sort(),[...input.rowIds].sort()))) throw new Error('The acquired observation differs from its original request and document rows.');
      const retainedQueue=queue?.id === original.queueId ? queue : original.draft?.queue;
      if (original.queueId && retainedQueue?.id === original.queueId && Number.isSafeInteger(original.queueIndex)) {
        const group=retainedQueue.groups?.[original.queueIndex];
        if (!group || !same([...group.rowIds].sort(),[...observation.rowIds].sort()) || group.url !== observation.publishedUrl) throw new Error('The terminal observation differs from the retained URL queue group.');
      }
    }
  }
  async function retainUnverifiedResult(original, result, token, error) {
    const update={...original,completed:false,uncertain:true,rejected:false,checkedNotRecorded:false,lastRequestState:'RESPONSE_UNVERIFIED',
      receipt:clone(result),error:error.message,providerError:errorValue(error)};
    await storage('write','pending',update,token.workspace);
    if (valid(token)) { pending=update; renderPending(); buttons(); }
  }
  async function retainAcquiring(original, result, token) {
    try {
      if (original.route !== 'observe' || result?.state !== 'ACQUIRING' || result.requestId !== original.input.requestId ||
          result.action !== original.route || !same(result.input,original.input) || result.result !== null) throw new Error('The active acquisition receipt differs from its original complete request.');
      validatePlan(result.plan,original.input.id,original.input.expectedRevision);
    } catch (error) { await retainUnverifiedResult(original,result,token,error); throw error; }
    const update={...original,completed:false,uncertain:false,rejected:false,checkedNotRecorded:false,lastRequestState:'ACQUIRING',receipt:clone(result)};
    await storage('write','pending',update,token.workspace);
    if (!valid(token)) return;
    pending=update;
    if (queue?.id === original.queueId) {
      queue.awaitingRequestId=original.input.requestId; queue.stopRequested=true; queue.state='AWAITING_ORIGINAL_RESULT';
      await persistDraft();
    }
    renderPending(); renderAcquisition(); buttons();
    note('The original URL acquisition is still active. Its exact request and queue position remain saved; read its original result before continuing.');
  }
  async function rememberOutcome(original, result, token) {
    try { validateTerminalResult(original,result); } catch (error) { await retainUnverifiedResult(original,result,token,error); throw error; }
    const completed = { schema: 'sf30.iati.document-evidence.completed.v1', route: original.route, input: original.input ?? null, packet: original.packet ?? null, original: clone(original), result, at: new Date().toISOString() };
    const durable = await storage('write', 'last-completed', completed, token.workspace);
    const retired = durable && await storage('delete', 'pending', undefined, token.workspace);
    if (!valid(token)) return false;
    pending = retired ? null : { ...original, completed: true, result, error: 'Native result received. Browser receipt storage is unavailable; download the complete result before clearing this action.' };
    renderPending(); return true;
  }
  function definiteRejection(error) {
    return Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 && ![408, 423, 425, 429].includes(error.status);
  }
  function errorValue(error) {
    return { message: error?.message || String(error), status: error?.status ?? null, details: error?.details ?? null };
  }
  async function sendFrozen(original) {
    const token = identity();
    if (!original || !['save','note','observe','review','compare'].includes(original.route)) throw new Error('Use the original retained route and exact input for this action.');
    const result = await api.post(BASE + original.route, clone(original.input)).catch(async error => {
      const update = { ...original, uncertain: true, rejected: definiteRejection(error), error: error?.message || String(error), providerError: errorValue(error) };
      await storage('write', 'pending', update, token.workspace);
      if (valid(token)) { pending = update; renderPending(); buttons(); }
      throw error;
    });
    if (result?.state === 'ACQUIRING') { await retainAcquiring(original,result,token); return result; }
    if (await rememberOutcome(original, result, token)) await consumeResult(original.route, result, token, original);
    return result;
  }
  async function mutate(route, input, extra = {}) {
    requireWorkspace();
    if (pending) throw new Error('Resolve the original retained action before starting another mutation.');
    const token = identity(), body = { ...clone(input), requestId: crypto.randomUUID() };
    if (extra.queueId && queue?.id === extra.queueId) queue.awaitingRequestId = body.requestId;
    const record = { schema: 'sf30.iati.document-evidence.pending.v1', workspace: token.workspace, route, input: body,
      createdAt: new Date().toISOString(), draft: uiDraft(), ...extra };
    await retainPending(record);
    if (!valid(token)) return null;
    return sendFrozen(record);
  }
  async function reconcilePending(sendIfMissing = false) {
    requireWorkspace();
    if (!pending) return;
    if (pending.completed) { const original=clone(pending), token=identity(); if (await rememberOutcome(original,original.result,token)) await consumeResult(original.route,original.result,token,original); renderPending(); return; }
    if (pending.route === 'receive') {
      if (sendIfMissing) return continueReceive();
      await api.refreshWorkspace();
      note('The original import has no request-ID route. Its exact packet is retained; inspect current saved work, then select those same bytes for an explicit import continuation.');
      return;
    }
    const original = clone(pending), token = identity(), result = await api.get(BASE + 'request?' + query({ requestId: original.input.requestId }));
    if (!valid(token) || pending?.input?.requestId !== original.input.requestId) return;
    if (result.requestId !== original.input.requestId) throw new Error('The returned request ID differs from the retained action.');
    if (result.state === 'NOT_RECORDED') {
      pending = { ...original, checkedNotRecorded: true, lastRequestState: 'NOT_RECORDED' };
      await storage('write', 'pending', pending, token.workspace); renderPending(); buttons();
      if (sendIfMissing) { if (original.rejected) throw new Error('This action was rejected. Restore its complete draft, correct it, and explicitly prepare a new action.'); return sendFrozen(pending); }
      note('The original request is not recorded. Its complete input is preserved; continue the same action or restore a conclusively rejected draft.');
      return;
    }
    if (result.action !== original.route || !same(result.input, original.input)) throw new Error('The saved request belongs to different complete input. Preserve both records and inspect the original request.');
    if (result.state === 'ACQUIRING') { await retainAcquiring(original,result,token); return; }
    if (result.state !== 'RECORDED') throw new Error('The original request returned an unknown state.');
    const output = result.result ?? (original.route === 'observe' ? { plan: result.plan, observation: result.observation } : result.plan);
    if (!output) throw new Error('The original receipt is recorded but its complete result is absent.');
    if (await rememberOutcome(original, output, token)) await consumeResult(original.route, output, token, original);
    note('Recovered the original ' + original.route + ' result without another acquisition.');
  }
  async function restoreRejected() {
    if (!pending?.rejected || !pending.checkedNotRecorded) throw new Error('Read the original request first. Only a conclusively unrecorded rejected action can be revised.');
    const original = clone(pending), token = identity();
    const rejectionKey='rejected:' + original.input.requestId;
    if (!(await storage('write', rejectionKey, original, token.workspace))) throw new Error('Retain the complete rejected action before changing its draft.');
    if (!(await storage('delete', 'pending', undefined, token.workspace))) throw new Error('The browser could not retain the pending-action deletion. Keep the original rejected input until storage is available.');
    if (!valid(token)) return;
    restored = original; pending = null; applyDraft(original.draft); restoredKey=rejectionKey;
    const input = original.input;
    if (original.route === 'save') {
      for (const [key, value] of Object.entries({ 'org-plan': input.selection.id, 'org-revision': input.selection.revision, 'source-view': input.selection.view,
        name: input.name, actor: input.actor, notes: input.notes ?? '', 'max-bytes': input.limits?.maxBytes ?? 16777216, timeout: input.limits?.timeoutSeconds ?? 60,
        'connect-timeout': input.limits?.connectTimeoutSeconds ?? 10, redirects: input.limits?.maxRedirects ?? 5 })) {
        if ($(key).tagName === 'SELECT' && value && ![...$(key).options].some(o => o.value === String(value))) $(key).add(new Option('Original selection · ' + short(value), String(value)));
        $(key).value = String(value);
      }
      selectedSourceRows = new Set(input.documentRowIds); sourcePage.selection = {...clone(input.selection),...($('source-org-key').value ? {organisationKey:$('source-org-key').value} : {})}; sourcePage.snapshot = input.selection.expectedSnapshot;
      await loadSourcePage(0, true); tab('selection');
    } else if (['note','review','observe'].includes(original.route)) {
      await openPlan(input.id, input.expectedRevision, true);
      if (!valid(token)) return;
      if (original.route === 'review') { reviewDraft = new Map(input.decisions.map(d => [d.rowId, clone(d)])); $('review-actor').value = input.actor; $('review-note').value = input.note; reviewDirty = true; renderReview(); tab('review'); }
      if (original.route === 'note') { $('receive-name').value = input.name; $('receive-notes').value = input.notes; $('receive-actor').value = input.actor; tab('receive'); }
      if (original.route === 'observe') { captureSelection = new Set(input.rowIds); $('capture-actor').value=input.actor; $('recapture').checked=!!input.acknowledgeNewObservation; tab('acquisition'); renderAcquisition(); }
    } else if (original.route === 'compare') {
      fillComparisonSelector('before', input.before); fillComparisonSelector('after', input.after);
      $('pairing-mode').value = Object.hasOwn(input,'rowPairs') ? 'explicit' : 'automatic';
      pairs = clone(input.rowPairs || []); $('compare-actor').value = input.actor; $('compare-notes').value = input.notes || '';
      comparisonInputs = { before: input.before, after: input.after }; tab('comparison'); await loadComparisonInputs(true);
    }
    renderPending(); await persistDraft(); buttons();
    note('The exact rejected input is retained. Its full draft is restored; choose any current revision and corrections explicitly before preparing a new request.');
  }
  async function run(message, work) {
    if (localBusy || api.isBusy()) return;
    if (queue?.running) { note('Stop after the current URL before starting another action.', true); return; }
    const token=identity();
    try {
      return await api.action(message, async () => {
        localBusy = true; buttons();
        try { return await work(); }
        catch (error) { if (valid(token)) note(error?.message || String(error), true); }
        finally { if (valid(token)) localBusy = false; }
      });
    } finally { if (valid(token)) buttons(); }
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    const nav = document.querySelector('nav[aria-label="Workspace"]') || document.querySelector('nav'), main = document.querySelector('main');
    if (!nav || !main) throw new Error('The original IATI navigation and main view are required.');
    const open = button('Document evidence', () => api.show('document-evidence'), 'nav'); open.id = 'ide-open-view'; open.dataset.view = 'document-evidence';
    nav.insertBefore(open, nav.querySelector('[data-view="compare"]'));
    const panel = node('section'); panel.id = 'ide-panel'; panel.dataset.panel = 'document-evidence'; panel.hidden = true;
    panel.innerHTML = [
      '<header class="section-heading"><p class="eyebrow">Organisation publications</p><h1>Document evidence</h1>',
      '<p>Retain published document responses, review their relevance and hand precise URL corrections to the existing organisation workflow.</p></header>',
      '<div id="ide-message" class="ide-message" role="status" aria-live="polite"></div>',
      '<div class="card ide-toolbar"><label>Saved evidence plan<select id="ide-plan-select"></select></label><button id="ide-open-plan" data-ide-control="read">Open saved plan</button>',
      '<label>Exact revision<select id="ide-plan-revision"></select></label><button id="ide-open-revision" data-ide-control="read">Open revision</button>',
      '<button id="ide-open-current" data-ide-control="read">Open current revision</button><button id="ide-new" data-ide-control="edit">New selection</button></div>',
      '<p id="ide-plan-state" class="ide-context"></p><div id="ide-metrics" class="metrics"></div><div id="ide-plan-identity"></div>',
      '<section id="ide-pending" class="card ide-attention" hidden><h2>Original retained action</h2><p id="ide-pending-summary"></p>',
      '<div class="ide-actions"><button id="ide-reconcile" data-ide-control="recover">Read original result</button>',
      '<button id="ide-continue" data-ide-control="recover">Continue same action</button><button id="ide-revise" data-ide-control="recover">Restore rejected draft</button><button id="ide-keep-rejected-packet" data-ide-control="recover" hidden>Keep rejection and choose another packet</button>',
      '<button id="ide-download-pending" data-ide-control="safe">Download complete action</button></div><div id="ide-pending-detail"></div></section>',
      '<section id="ide-restored" class="card" hidden><h2>Rejected input retained</h2><p id="ide-restored-summary"></p>',
      '<button id="ide-download-restored" data-ide-control="safe">Download original rejected action</button></section>',
      '<div class="ide-tabs" role="tablist" aria-label="Document evidence workflow">',
      '<button role="tab" data-ide-tab="selection" data-ide-control="nav">1. Selection</button>',
      '<button role="tab" data-ide-tab="acquisition" data-ide-control="nav">2. Acquisition</button>',
      '<button role="tab" data-ide-tab="review" data-ide-control="nav">3. Review</button>',
      '<button role="tab" data-ide-tab="comparison" data-ide-control="nav">4. Comparison</button>',
      '<button role="tab" data-ide-tab="handoff" data-ide-control="nav">5. Publisher handoff</button>',
      '<button role="tab" data-ide-tab="receive" data-ide-control="nav">6. Receive</button></div>',
      '<div data-ide-panel="selection"><div class="ide-columns"><article class="card"><h2>Original document selection</h2>',
      '<label>Organisation plan<select id="ide-org-plan" data-ide-control="edit"></select></label>',
      '<div class="ide-pair"><label>Saved revision<select id="ide-org-revision" data-ide-control="edit"></select></label>',
      '<button id="ide-org-history" data-ide-control="read">Read saved revisions</button></div>',
      '<label>Published source or reviewed candidate<select id="ide-source-view" data-ide-control="edit"><option value="source">Original source</option><option value="candidate">Current candidate of the selected revision</option></select></label>',
      '<details><summary>Optional original organisation key</summary><label>Exact organisation key<input id="ide-source-org-key" data-ide-control="edit" placeholder="Leave empty for the plan’s selected organisations"></label></details>',
      '<button id="ide-load-documents" data-ide-control="read">Read original documents</button><p id="ide-source-state" class="ide-context"></p></article>',
      '<article class="card"><h2>Name the work</h2><label>Evidence plan name<input id="ide-name" maxlength="160" data-ide-control="edit"></label>',
      '<label>Named operator<input id="ide-actor" maxlength="160" autocomplete="name" data-ide-control="edit"></label>',
      '<label>Purpose and working notes<textarea id="ide-notes" rows="3" data-ide-control="edit"></textarea></label>',
      '<div class="ide-form-grid"><label>Maximum body bytes<input id="ide-max-bytes" type="number" min="1" max="67108864" step="1" value="16777216" data-ide-control="edit"></label>',
      '<label>Total timeout (seconds)<input id="ide-timeout" type="number" min="1" max="120" step="1" value="60" data-ide-control="edit"></label>',
      '<label>Connection timeout (seconds)<input id="ide-connect-timeout" type="number" min="1" max="30" step="1" value="10" data-ide-control="edit"></label>',
      '<label>Maximum redirects<input id="ide-redirects" type="number" min="0" max="10" step="1" value="5" data-ide-control="edit"></label></div>',
      '<p class="ide-muted">The original literal URL and bounded observation settings are frozen in the saved selection. Capturing a response is a separate action.</p>',
      '<button id="ide-save" class="primary" data-ide-control="mutate">Save document selection</button></article></div>',
      '<article class="card"><div class="ide-heading-row"><h2>Published documents</h2><span id="ide-selected-count"></span></div>',
      '<div class="ide-actions"><button id="ide-select-page" data-ide-control="edit">Select this page</button><button id="ide-select-all" data-ide-control="read">Read and select all documents</button>',
      '<button id="ide-clear-selection" data-ide-control="edit">Clear selection</button></div><div id="ide-source-table"></div><div id="ide-source-pager" class="ide-pager"></div>',
      '<div id="ide-source-detail"></div></article></div>',
      '<div data-ide-panel="acquisition" hidden><article class="card"><h2>Capture exact published URLs</h2>',
      '<p>Each selected URL is fetched once for its selected document rows. The queue waits for the original result before the next URL. A later observation requires explicit acknowledgement.</p>',
      '<div class="ide-actions"><button id="ide-capture-unobserved" data-ide-control="edit">Select unobserved rows</button><button id="ide-capture-all" data-ide-control="edit">Select all rows</button>',
      '<button id="ide-capture-none" data-ide-control="edit">Clear capture selection</button></div>',
      '<label class="ide-check"><input id="ide-recapture" type="checkbox" data-ide-control="edit">I want a new dated observation for selected rows that already have evidence.</label>',
      '<label>Capture operator<input id="ide-capture-actor" maxlength="160" autocomplete="name" data-ide-control="edit"></label>',
      '<div class="ide-actions"><button id="ide-capture" class="primary" data-ide-control="capture">Capture selected unique URLs</button>',
      '<button id="ide-stop" data-ide-control="stop">Stop after current URL</button><button id="ide-resume-queue" data-ide-control="capture">Continue retained queue</button></div>',
      '<p id="ide-queue-state" class="ide-context"></p><div id="ide-active-requests"></div><div id="ide-url-groups"></div></article>',
      '<article class="card"><h2>Evidence register</h2><div id="ide-evidence-table"></div><div id="ide-evidence-pager" class="ide-pager"></div></article>',
      '<article class="card"><h2>Document and response detail</h2><div id="ide-detail"><p class="ide-muted">Select a document to inspect every retained observation and its exact original XML target.</p></div></article></div>',
      '<div data-ide-panel="review" hidden><article class="card"><h2>Review document relevance</h2>',
      '<p>A complete HTTP body can be an error page or a partial range. Usable requires complete successful document evidence and your explicit relevance decision. Prefixes, status, media type and document relevance remain separate.</p>',
      '<div class="ide-form-grid"><label>Review operator<input id="ide-review-actor" maxlength="160" autocomplete="name" data-ide-control="edit"></label>',
      '<label>Overall review note<textarea id="ide-review-note" rows="2" data-ide-control="edit"></textarea></label></div>',
      '<p id="ide-review-state" class="ide-context"></p><div id="ide-review-table"></div><div id="ide-review-pager" class="ide-pager"></div>',
      '<button id="ide-review-save" class="primary" data-ide-control="mutate">Save complete named review</button></article></div>',
      '<div data-ide-panel="comparison" hidden><article class="card"><h2>Compare exact evidence editions</h2><div class="ide-columns">',
      '<div><label>Before plan<select id="ide-before-plan" data-ide-control="edit"></select></label><label>Before revision<select id="ide-before-revision" data-ide-control="edit"></select></label>',
      '<button id="ide-before-history" data-ide-control="read">Read before history</button></div>',
      '<div><label>After plan<select id="ide-after-plan" data-ide-control="edit"></select></label><label>After revision<select id="ide-after-revision" data-ide-control="edit"></select></label>',
      '<button id="ide-after-history" data-ide-control="read">Read after history</button></div></div>',
      '<button id="ide-load-comparison" data-ide-control="read">Read selected editions and rows</button>',
      '<label>Row matching<select id="ide-pairing-mode" data-ide-control="edit"><option value="automatic">Automatic stable same-source identities</option>',
      '<option value="explicit">Explicit unique pairs, including an empty list</option></select></label>',
      '<p class="ide-muted">Different original sources need explicit pairs. An explicitly empty pair list retains every row as added or removed. Comparing evidence performs no new HTTP acquisition.</p>',
      '<div id="ide-pair-editor"><div class="ide-form-grid"><label>Before document<select id="ide-pair-before" data-ide-control="edit"></select></label>',
      '<label>After document<select id="ide-pair-after" data-ide-control="edit"></select></label></div>',
      '<div class="ide-actions"><button id="ide-add-pair" data-ide-control="edit">Add unique pair</button><button id="ide-clear-pairs" data-ide-control="edit">Use an explicitly empty pair list</button></div>',
      '<div id="ide-pairs"></div></div>',
      '<div class="ide-form-grid"><label>Comparison operator<input id="ide-compare-actor" maxlength="160" autocomplete="name" data-ide-control="edit"></label>',
      '<label>Comparison notes<textarea id="ide-compare-notes" rows="2" data-ide-control="edit"></textarea></label></div>',
      '<button id="ide-compare" class="primary" data-ide-control="mutate">Save full evidence comparison</button></article>',
      '<article class="card"><h2>Saved comparison</h2><label>Comparison ID<input id="ide-comparison-id" data-ide-control="edit" spellcheck="false"></label>',
      '<div class="ide-actions"><button id="ide-open-comparison" data-ide-control="read">Open saved comparison</button><button id="ide-comparison-download" data-ide-control="safe">Download complete comparison JSON</button></div>',
      '<div id="ide-known-comparisons"></div><div id="ide-comparison-summary"></div><div id="ide-comparison-table"></div></article></div>',
      '<div data-ide-panel="handoff" hidden><article class="card"><h2>Publisher correction draft</h2>',
      '<p>Evidence review prepares complete URL-attribute edits for the original organisation plan. Its native source, revision, review and release workflow still owns publication.</p>',
      '<div class="ide-actions"><button id="ide-correction-load" data-ide-control="read">Read complete correction draft</button>',
      '<button id="ide-organisation-open" data-ide-control="read">Open organisation review</button><button id="ide-correction-file" data-ide-control="download">Download complete correction JSON</button></div>',
      '<p id="ide-correction-state" class="ide-context"></p><div id="ide-correction-table"></div><div id="ide-correction-detail"></div></article>',
      '<article class="card"><h2>Complete selected reports</h2><p>The selected evidence revision is retained in every original file. Each browser download verifies the native byte count and SHA-256.</p>',
      '<div class="ide-actions"><button id="ide-report-html" data-ide-control="download">Download HTML report</button>',
      '<button id="ide-report-csv" data-ide-control="download">Download full document register CSV</button><button id="ide-report-json" data-ide-control="download">Download full evidence plan JSON</button>',
      '<button id="ide-operating-source" data-ide-control="download">Download operating source</button></div>',
      '<p class="ide-muted">Import the operating source into Command finder → Operating plans to create an editable customer procedure from this saved case. Keep the complete source package with its reports and receiving ZIP.</p>',
      '<div id="ide-download-state" class="ide-context"></div></article></div>',
      '<div data-ide-panel="receive" hidden><article class="card"><h2>Complete portable receiving</h2>',
      '<p>The full ZIP retains the original organisation selection, every selected observation and body, reviews, comparisons and history. The receiving operation imports saved data into this workspace.</p>',
      '<button id="ide-export" data-ide-control="download">Download complete selected ZIP</button>',
      '<label>Original evidence ZIP<input id="ide-import-file" type="file" accept=".zip,application/zip" data-ide-control="edit"></label>',
      '<button id="ide-import" class="primary" data-ide-control="mutate">Verify and receive complete ZIP</button>',
      '<p class="ide-muted">Browser downloads and imports are limited to 64 MiB. Use the complete streaming CLI operation below for a larger packet.</p>',
      '<div id="ide-receiving-state" class="ide-context"></div><div id="ide-receiving-detail"></div></article>',
      '<article class="card"><h2>Receiving engineer note</h2><p>Add a genuine local handover note as a following revision. Re-importing an older package keeps the later current revision.</p>',
      '<label>Current evidence plan name<input id="ide-receive-name" maxlength="160" data-ide-control="edit"></label>',
      '<label>Receiving note<textarea id="ide-receive-notes" rows="3" data-ide-control="edit"></textarea></label>',
      '<label>Named receiving engineer<input id="ide-receive-actor" maxlength="160" autocomplete="name" data-ide-control="edit"></label>',
      '<button id="ide-note-save" data-ide-control="mutate">Save following receiving-note revision</button></article>',
      '<article class="card"><h2>Connected and native complete-file commands</h2><p>Use the actual installed IATI directory, original connection/workspace and chosen output path.</p>',
      '<pre id="ide-cli" class="ide-json"></pre><button id="ide-copy-cli" data-ide-control="safe">Copy commands</button></article>',
      '<article class="card"><h2>Original receipts</h2><button id="ide-last-result" data-ide-control="read">Read last complete browser receipt</button><div id="ide-last-result-detail"></div></article></div>'
    ].join('');
    main.append(panel);
    panel.querySelectorAll('input,select,textarea').forEach(el => { if (!el.dataset.ideControl) el.dataset.ideControl = 'edit'; });
    panel.querySelectorAll('[data-ide-tab]').forEach(el => { el.onclick = () => tab(el.dataset.ideTab); });
    panel.addEventListener('input', event => { if (event.target.matches('input,select,textarea')) { scheduleDraft(); buttons(); } });
    panel.addEventListener('change', event => { if (event.target.matches('input,select,textarea')) { scheduleDraft(); buttons(); } });
    $('plan-select').onchange = () => {
      if ($('plan-select').value !== plan?.id) options($('plan-revision'),[],'','Open the selected plan to read its history');
      else options($('plan-revision'),planHistory.map(item => ({value:item.revision,label:'Revision ' + item.revision + ' · ' + item.state})),plan.revision);
      buttons();
    };
    $('open-plan').onclick = () => run('Open document evidence', () => openPlan($('plan-select').value));
    $('open-revision').onclick = () => run('Open exact evidence revision', () => openPlan($('plan-select').value, positive($('plan-revision').value, 'Revision')));
    $('open-current').onclick = () => run('Open current evidence revision', () => openPlan($('plan-select').value || plan?.id));
    $('new').onclick = () => run('New document selection', async () => { resetPlan(); tab('selection'); renderAll(); await persistDraft(); });
    $('org-plan').onchange = () => run('Read organisation history', async () => { invalidateSource(); await loadOrganisationHistory(); });
    $('org-history').onclick = () => run('Read organisation history', loadOrganisationHistory);
    for (const id of ['org-revision','source-view','source-org-key']) $(id).onchange = () => { invalidateSource(); scheduleDraft(); };
    $('load-documents').onclick = () => run('Read original document rows', () => loadSourcePage(0));
    $('select-page').onclick = () => { for (const row of sourcePage.rows) selectedSourceRows.add(row.id); renderSourceRows(); scheduleDraft(); };
    $('clear-selection').onclick = () => { selectedSourceRows.clear(); renderSourceRows(); scheduleDraft(); };
    $('select-all').onclick = () => run('Read complete original document selection', selectAllSourceRows);
    $('save').onclick = () => run('Save original document selection', saveSelection);
    $('reconcile').onclick = () => run('Read original action result', () => reconcilePending(false));
    $('continue').onclick = () => run('Continue original action', () => reconcilePending(true));
    $('revise').onclick = () => run('Restore complete rejected draft', restoreRejected);
    $('keep-rejected-packet').onclick = () => run('Retain original packet rejection and refresh current work',keepRejectedPacket);
    $('download-pending').onclick = () => downloadJson(pending, 'document-evidence-original-action.json');
    $('download-restored').onclick = () => downloadJson(restored, 'document-evidence-rejected-action.json');
    $('capture-unobserved').onclick = () => { captureSelection = new Set(rows.filter(row => !row.observationIds?.length).map(row => row.id)); renderAcquisition(); scheduleDraft(); };
    $('capture-all').onclick = () => { captureSelection = new Set(rows.map(row => row.id)); renderAcquisition(); scheduleDraft(); };
    $('capture-none').onclick = () => { captureSelection.clear(); renderAcquisition(); scheduleDraft(); };
    $('capture').onclick = () => startQueue(false).catch(error => { note(error.message, true); buttons(); });
    $('resume-queue').onclick = () => startQueue(true).catch(error => { note(error.message, true); buttons(); });
    $('stop').onclick = () => { if (queue) { queue.stopRequested = true; queue.state = 'STOP_REQUESTED'; renderAcquisition(); persistDraft().catch(error => note(error.message, true)); } };
    $('review-save').onclick = () => run('Save full document review', saveReview);
    for (const side of ['before','after']) {
      $(side + '-plan').onchange = () => run('Read evidence comparison history', () => loadComparisonHistory(side));
      $(side + '-history').onclick = () => run('Read evidence comparison history', () => loadComparisonHistory(side));
      $(side + '-revision').onchange = () => { renderPairs(); scheduleDraft(); };
    }
    $('load-comparison').onclick = () => run('Read selected evidence editions', () => loadComparisonInputs(false));
    $('pairing-mode').onchange = () => { renderPairs(); scheduleDraft(); };
    $('add-pair').onclick = addPair;
    $('clear-pairs').onclick = () => { pairs = []; $('pairing-mode').value = 'explicit'; renderPairs(); scheduleDraft(); };
    $('compare').onclick = () => run('Save complete evidence comparison', saveComparison);
    $('open-comparison').onclick = () => run('Open saved evidence comparison', openComparison);
    $('comparison-download').onclick = () => downloadJson(comparison, 'document-evidence-comparison-' + short(comparison?.id) + '.json');
    $('correction-load').onclick = () => run('Read publisher correction draft', loadCorrection);
    $('organisation-open').onclick = () => run('Open original organisation review', openOrganisation);
    $('correction-file').onclick = () => run('Download original correction draft', () => downloadPlanFile('correction'));
    $('report-html').onclick = () => run('Download complete evidence report', () => downloadPlanFile('report'));
    $('report-csv').onclick = () => run('Download complete evidence register', () => downloadPlanFile('register'));
    $('report-json').onclick = () => run('Download complete evidence plan', () => downloadPlanFile('plan'));
    $('operating-source').onclick = () => run('Download complete operating source', downloadOperatingSource);
    $('export').onclick = () => run('Download complete evidence package', exportPlan);
    $('import-file').onchange = () => { receiveFile = $('import-file').files?.[0] || null; $('receiving-state').textContent = receiveFile ? receiveFile.name + ' · ' + bytesLabel(receiveFile.size) : ''; buttons(); };
    $('import').onclick = () => run('Receive exact evidence package', receivePacket);
    $('note-save').onclick = () => run('Save receiving engineer note', saveReceivingNote);
    $('copy-cli').onclick = async () => { try { await navigator.clipboard.writeText($('cli').textContent); note('Copied the complete-file commands.'); } catch { note('Select and copy the displayed complete-file commands.'); } };
    $('last-result').onclick = () => run('Read original complete receipt', async () => {
      const token = identity(), result = await storage('read','last-completed'); if (!valid(token)) return;
      empty($('last-result-detail')); if (result) { jsonDetails($('last-result-detail'),'Complete native result and original input',result); $('last-result-detail').append(button('Download complete receipt', () => downloadJson(result,'document-evidence-complete-receipt.json'),'safe')); } else empty($('last-result-detail'),'No complete browser receipt is retained for this workspace.');
    });
    tab('selection'); renderAll();
  }
  function renderCatalogue() {
    const list = catalogue.plans.map(item => ({ value: item.id, label: item.name + ' · revision ' + item.revision + ' · ' + item.state }));
    options($('plan-select'), list, undefined, 'Choose a saved evidence plan');
    options($('org-plan'), catalogue.organisationPlans.map(item => ({ value: item.id, label: item.name + ' · revision ' + item.revision })), undefined, 'Choose an organisation plan');
    for (const side of ['before','after']) options($(side + '-plan'), list, undefined, 'Choose a saved evidence plan');
    empty($('known-comparisons'));
    for (const item of knownComparisons) $('known-comparisons').append(button(item.label || short(item.id), () => {
      $('comparison-id').value = item.id; run('Open saved evidence comparison',openComparison);
    }));
  }
  function renderSummary() {
    $('plan-state').textContent = plan ? plan.name + ' · ' + plan.state + ' · selected revision ' + plan.revision
      + (freshPlan() ? ' · current editable revision' : ' · historical; current revision is ' + currentRevision()) : 'Choose original documents or open saved evidence work.';
    empty($('metrics'));
    const metrics = plan ? [['Documents',plan.documents.length],['Observations',plan.observationIds.length],['Reviewed rows',plan.review?.decisions?.length || 0]] : [];
    for (const [label,value] of metrics) { const card = node('div',undefined,'ide-metric'); card.append(node('strong',value),node('span',label)); $('metrics').append(card); }
    const summary = currentSummary();
    if (summary && Number.isSafeInteger(summary.retainedBodyBytes)) {
      const card = node('div',undefined,'ide-metric ide-wide'); card.append(node('strong',bytesLabel(summary.retainedBodyBytes)),
        node('span','Distinct retained bodies · current revision ' + summary.revision + '; ' + bytesLabel(summary.remainingBodyBytes) + ' remaining of ' + bytesLabel(catalogue.maxPlanBytes ?? 1073741824)));
      $('metrics').append(card);
    }
    empty($('plan-identity'));
    if (plan) jsonDetails($('plan-identity'),'Source and exact evidence identities',{
      id:plan.id,revision:plan.revision,recordSha256:plan.recordSha256,originWorkspace:plan.originWorkspace,selection:plan.selection,
      limits:plan.limits,event:plan.event,createdAt:plan.createdAt,updatedAt:plan.updatedAt
    });
    renderCli();
  }
  function renderPending() {
    $('pending').hidden = !pending;
    $('pending-summary').textContent = !pending ? '' : pending.completed ? 'The native operation completed. Retain its full receipt before clearing browser recovery storage.'
      : (pending.rejected ? 'This original action was rejected. ' : 'The original action remains retained. ')
        + (pending.route === 'receive' ? 'Exact ZIP ' + pending.packet?.sha256 : pending.route + ' request ' + pending.input?.requestId)
        + (pending.lastRequestState ? ' · ' + pending.lastRequestState : '') + (pending.error ? ' · ' + pending.error : '');
    empty($('pending-detail')); if (pending) jsonDetails($('pending-detail'),'Complete original action and captured error',pending);
    $('revise').hidden = !pending?.rejected || pending?.route === 'receive';
    $('keep-rejected-packet').hidden = !(pending?.route === 'receive' && pending?.rejected);
    $('restored').hidden = !restored;
    $('restored-summary').textContent = restored ? restored.route === 'receive' ? 'The exact rejected packet descriptor and native error remain retained. Any verified native parent records remain in the original workspace.' : 'Original ' + restored.route + ' request ' + restored.input.requestId + ' remains retained unchanged. The displayed values are its restored correction draft.' : '';
  }
  function renderSourceRows() {
    $('selected-count').textContent = selectedSourceRows.size + ' selected / maximum 500';
    $('source-state').textContent = sourcePage.snapshot ? sourcePage.total + ' documents · ' + sourcePage.selection?.view + ' · exact snapshot ' + short(sourcePage.snapshot)
      : 'Read the selected original document register to freeze its snapshot.';
    dataTable($('source-table'),['Select','Document','Literal published URL','Declared format / categories','Original detail'],sourcePage.rows.map(row => [
      checkedInput(selectedSourceRows.has(row.id),checked => { if (checked) selectedSourceRows.add(row.id); else selectedSourceRows.delete(row.id); renderSourceRows(); scheduleDraft(); },'Select ' + titleOf(row)),
      titleOf(row),literalUrl(row),(row.format || 'No format declared') + ' · ' + labels(row.categories),
      button('Inspect original row',() => run('Read original document detail',() => openSourceDetail(row.id)))
    ]));
    pager($('source-pager'),sourcePage.offset,sourcePage.total,offset => run('Read original document page',() => loadSourcePage(offset,true)));
    const next=$('source-pager').lastChild, nextOffset=sourcePage.offset+sourcePage.rows.length;
    next.onclick=()=>run('Read original document page',()=>loadSourcePage(nextOffset,true)); next.dataset.idePageDisabled=String(nextOffset>=sourcePage.total || !sourcePage.rows.length);
    buttons();
  }
  function groupRows(selection = rows) {
    const groups = new Map();
    for (const row of selection) { const url = row.url; if (!groups.has(url)) groups.set(url,[]); groups.get(url).push(row); }
    return [...groups].map(([url,documents]) => ({url,documents}));
  }
  function observationLabel(value) {
    if (!value) return 'Unobserved';
    const body = value.body, status = value.fetch?.status ?? value.status;
    return value.state + (status == null ? '' : ' · HTTP ' + status) + ' · ' + value.outcome
      + (body ? ' · ' + (body.complete ? 'Complete HTTP body' : 'Retained prefix') + ' · ' + bytesLabel(body.bytes) : ' · no body')
      + (value.documentComplete === true ? ' · complete successful document evidence' : ' · document completeness not established');
  }
  function renderAcquisition() {
    const groups = groupRows();
    dataTable($('url-groups'),['Capture','Exact URL','Selected document rows','Current evidence'],groups.map(group => {
      const every = group.documents.every(row => captureSelection.has(row.id)), some = group.documents.some(row => captureSelection.has(row.id));
      const box = checkedInput(every,checked => { for (const row of group.documents) { if (checked) captureSelection.add(row.id); else captureSelection.delete(row.id); } renderAcquisition(); scheduleDraft(); },'Capture ' + group.url);
      box.indeterminate = some && !every;
      return [box,literalUrl({url:group.url}),group.documents.map(titleOf).join(' · '),group.documents.map(row => observationLabel(row.latestObservationSummary)).join('\n')];
    }));
    const active = (catalogue.activeRequests || []).filter(item => item.state === 'ACQUIRING');
    empty($('active-requests'));
    if (active.length) jsonDetails($('active-requests'),'Original active requests',active);
    $('queue-state').textContent = queue ? queue.state + ' · completed ' + queue.nextIndex + ' of ' + queue.groups.length + ' selected URL groups'
      + (queue.running ? ' · current response is allowed to finish' : ' · no automatic restart')
      + (queue.error ? ' · ' + queue.error : '') : captureSelection.size + ' document rows selected for capture.';
    const page = rows.slice(evidenceOffset,evidenceOffset+PAGE);
    dataTable($('evidence-table'),['Document','Published URL','Dated response','Human decision','Detail'],page.map(row => [
      titleOf(row),literalUrl(row),observationLabel(row.latestObservationSummary) + (row.latestObservationSummary?.finishedAt ? '\n' + dateLabel(row.latestObservationSummary.finishedAt) : ''),
      row.decision?.decision || 'Not reviewed',button('Inspect evidence',() => run('Read document evidence',() => openEvidenceDetail(row.id)))
    ]));
    pager($('evidence-pager'),evidenceOffset,rows.length,offset => { evidenceOffset = offset; renderAcquisition(); scheduleDraft(); });
    buttons();
  }
  function decisionFor(row) {
    if (!reviewDraft.has(row.id)) reviewDraft.set(row.id,{rowId:row.id,observationId:row.decision?.observationId ?? row.latestObservationSummary?.id ?? null,
      decision:row.decision?.decision || '',note:row.decision?.note || '',...(row.decision?.correctedUrl ? {correctedUrl:row.decision.correctedUrl} : {})});
    return reviewDraft.get(row.id);
  }
  function renderReview() {
    let decided = 0;
    for (const row of rows) if (decisionFor(row).decision) decided++;
    $('review-state').textContent = decided + ' of ' + rows.length + ' document decisions selected'
      + (reviewDirty ? ' · unsaved review draft' : plan?.review ? ' · retained named review' : ' · no review saved');
    dataTable($('review-table'),['Document and response','Retained observation','Explicit relevance decision','Reason and URL correction'],rows.slice(reviewOffset,reviewOffset+PAGE).map(row => {
      const d = decisionFor(row), description = node('div');
      description.append(node('strong',titleOf(row)),literalUrl(row),node('p',observationLabel(row.latestObservationSummary),'ide-muted'),
        button('Inspect full evidence',() => { tab('acquisition'); run('Read full evidence detail',() => openEvidenceDetail(row.id)); }));
      const observation = node('select'); observation.dataset.ideControl = 'edit'; observation.setAttribute('aria-label','Retained observation for '+titleOf(row));
      observation.add(new Option('No observation selected',''));
      for (const id of row.observationIds || []) {
        const value = observationCache.get(id) || (row.latestObservationSummary?.id === id ? row.latestObservationSummary : null);
        observation.add(new Option((value ? observationLabel(value) : 'Retained observation') + ' · ' + short(id),id));
      }
      observation.value = d.observationId || '';
      observation.onchange = () => { d.observationId = observation.value || null; reviewDirty = true; renderReview(); scheduleDraft(); if (d.observationId) run('Read the selected original observation',async () => { const token=identity(); await getObservation(d.observationId,token); if(valid(token)) renderReview(); }); };
      const decision = node('select'); decision.dataset.ideControl = 'edit'; decision.setAttribute('aria-label','Document relevance for '+titleOf(row));
      const chosenObservation=observationCache.get(d.observationId) || (row.latestObservationSummary?.id===d.observationId ? row.latestObservationSummary : null);
      for (const [value,label] of [['','Choose explicitly'],['usable','Usable for the selected purpose'],['needs_correction','Needs correction'],['not_applicable','Not applicable'],['deferred','Deferred']]) {
        const option=new Option(label,value);
        if(value==='usable'){option.className='ide-review-usable';option.dataset.ideAllowed=String(chosenObservation?.documentComplete===true);option.disabled=chosenObservation?.documentComplete!==true;}
        decision.add(option);
      }
      decision.value = d.decision; decision.onchange = () => { d.decision = decision.value; if (d.decision !== 'needs_correction') delete d.correctedUrl; reviewDirty = true; renderReview(); scheduleDraft(); };
      const notes = node('div'), reason = node('textarea'); reason.rows = 3; reason.value = d.note; reason.dataset.ideControl = 'edit'; reason.setAttribute('aria-label','Review reason for '+titleOf(row));
      reason.oninput = () => { d.note = reason.value; reviewDirty = true; scheduleDraft(); $('review-state').textContent = 'Unsaved complete review draft'; };
      const reasonLabel = node('label','Review reason'); reasonLabel.append(reason); notes.append(reasonLabel);
      if (d.decision === 'needs_correction') {
        const url = node('input'); url.type = 'url'; url.value = d.correctedUrl || ''; url.dataset.ideControl = 'edit'; url.setAttribute('aria-label','Optional explicitly corrected URL for '+titleOf(row));
        url.oninput = () => { if (url.value) d.correctedUrl = url.value; else delete d.correctedUrl; reviewDirty = true; scheduleDraft(); };
        const label = node('label','Optional reviewed replacement URL'); label.append(url); notes.append(label);
      }
      return [description,observation,decision,notes];
    }));
    pager($('review-pager'),reviewOffset,rows.length,offset => { reviewOffset = offset; renderReview(); scheduleDraft(); });
    buttons();
  }
  function renderAll() { renderCatalogue(); renderSummary(); renderPending(); renderSourceRows(); renderAcquisition(); renderReview(); renderPairs(); renderComparison(); renderCorrection(); renderReceiving(); tab(activeTab); buttons(); }


  function sourceSelector() {
    const id = $('org-plan').value, revision = positive($('org-revision').value,'Organisation revision'), view = $('source-view').value;
    if (!sha(id) || !['source','candidate'].includes(view)) throw new Error('Choose an original organisation plan, exact saved revision and view.');
    const organisationKey = $('source-org-key').value;
    if (organisationKey && !sha(organisationKey)) throw new Error('The optional organisation key must be an exact native SHA-256 identity.');
    return { id, revision, view, ...(organisationKey ? { organisationKey } : {}) };
  }
  function sourceChoice(selection) {
    return selection ? { id:selection.id,revision:selection.revision,view:selection.view,...(selection.organisationKey ? {organisationKey:selection.organisationKey} : {}) } : null;
  }
  function invalidateSource() {
    sourceSerial++; detailSerial++; sourcePage = {rows:[],offset:0,total:0,snapshot:null,selection:null};
    sourceRows.clear(); selectedSourceRows.clear(); sourceDetail = null;
    empty($('source-detail')); renderSourceRows();
  }
  function resetPlan() {
    planSerial++; detailSerial++; plan = null; planHistory = []; rows = []; rowsById.clear();
    reviewDraft.clear(); reviewDirty = false; selectedRowId = null; selectedDetail = null; activeObservation = null; evidenceOffset = 0; reviewOffset = 0;
    captureSelection.clear(); if (!queue?.running && !pending) queue = null;
    correction = null; receiving = null; $('plan-select').value = ''; options($('plan-revision'),[],'','Open a saved plan');
    for (const id of ['review-actor','review-note','capture-actor','receive-name','receive-notes','receive-actor']) $(id).value = '';
    $('recapture').checked = false; empty($('detail'),'Select a document to inspect its retained evidence.');
    renderAll();
  }
  async function loadOrganisationHistory() {
    requireWorkspace(); const id = $('org-plan').value, token = identity(), serial = ++sourceSerial;
    if (!sha(id)) throw new Error('Choose an original organisation plan.');
    const value = await api.get(ORG + 'history?' + query({id}));
    if (!valid(token) || serial !== sourceSerial || $('org-plan').value !== id) return;
    if (!Array.isArray(value.history) || value.history.some(item => item.id !== id || !Number.isSafeInteger(item.revision))) throw new Error('The original organisation history is incomplete or belongs to another plan.');
    sourceHistory = value.history;
    const selected = $('org-revision').value || text(sourceHistory.at(-1)?.revision);
    options($('org-revision'),sourceHistory.map(item => ({value:item.revision,label:'Revision ' + item.revision + ' · ' + (item.state || 'saved') + ' · ' + (item.name || '')})),selected,'Choose an exact revision');
    scheduleDraft(); buttons();
  }
  function validatePage(value, snapshot, offset, selectedIds = null) {
    if (!value || !Array.isArray(value.rows) || !Number.isSafeInteger(value.total) || value.total < 0 || value.offset !== offset || !sha(value.snapshotSha256)) throw new Error('The native register returned an invalid complete page descriptor.');
    if (snapshot && value.snapshotSha256 !== snapshot) throw new Error('The native register snapshot differs from the selected immutable revision.');
    if (value.rows.length > 500 || value.offset + value.rows.length > value.total || (!value.rows.length && offset < value.total)) throw new Error('The native register page cannot be continued without losing rows.');
    const ids = new Set();
    for (const row of value.rows) {
      if (!sha(row.id) || ids.has(row.id) || (selectedIds && !selectedIds.has(row.id))) throw new Error('The native register returned a duplicate or unexpected row identity.');
      ids.add(row.id);
    }
    return value;
  }
  async function loadSourcePage(offset = 0, keep = false) {
    requireWorkspace(); const selected = sourceSelector(), token = identity(), serial = ++sourceSerial;
    const matching = same(sourceChoice(sourcePage.selection),selected), expectedSnapshot = matching ? sourcePage.snapshot : null;
    if (keep && !matching) throw new Error('The organisation selection changed. Read that new selection explicitly before continuing pages.');
    const value = await api.get(ORG + 'rows?' + query({...selected,section:'documents',offset,limit:PAGE,...(expectedSnapshot ? {expectedSnapshot} : {})}));
    if (!valid(token) || serial !== sourceSerial || !same(sourceSelector(),selected)) return;
    validatePage(value,expectedSnapshot,offset);
    if (!matching) { selectedSourceRows.clear(); sourceRows.clear(); sourceDetail = null; empty($('source-detail')); }
    if (matching && sourcePage.snapshot && value.total !== sourcePage.total && sourcePage.total) throw new Error('The same immutable source snapshot returned a different register count.');
    sourcePage = {rows:value.rows,offset,total:value.total,snapshot:value.snapshotSha256,selection:{...selected,expectedSnapshot:value.snapshotSha256}};
    for (const row of value.rows) sourceRows.set(row.id,row);
    renderSourceRows(); await persistDraft();
  }
  async function selectAllSourceRows() {
    requireWorkspace(); const selected = sourceSelector(), token = identity(), serial = ++sourceSerial;
    if (!same(sourceChoice(sourcePage.selection),selected) || !sha(sourcePage.snapshot)) throw new Error('Read the original document selection before selecting its full register.');
    if (sourcePage.total > 500) throw new Error('This source has more than 500 documents. Select the required rows across pages, or choose an exact organisation key, before saving an evidence plan.');
    const snapshot = sourcePage.snapshot, count = sourcePage.total, full = [], ids = new Set();
    for (let offset = 0; offset < count || (!offset && !count);) {
      const value = await api.get(ORG + 'rows?' + query({...selected,section:'documents',offset,limit:500,expectedSnapshot:snapshot}));
      if (!valid(token) || serial !== sourceSerial || !same(sourceSelector(),selected)) return;
      validatePage(value,snapshot,offset);
      if (value.total !== count) throw new Error('The original document count changed within the selected snapshot.');
      for (const row of value.rows) { if (ids.has(row.id)) throw new Error('The full native register contains duplicate row identities.'); ids.add(row.id); full.push(row); }
      offset += value.rows.length; if (offset >= count) break;
    }
    if (full.length !== count) throw new Error('The original full document register is incomplete.');
    selectedSourceRows = ids; for (const row of full) sourceRows.set(row.id,row);
    renderSourceRows(); await persistDraft(); note('Selected all ' + count + ' original document rows in this exact snapshot.');
  }
  async function openSourceDetail(rowId) {
    const selected = sourceSelector(), snapshot = sourcePage.snapshot, token = identity(), serial = ++detailSerial;
    if (!sha(rowId) || !sha(snapshot) || !same(sourceChoice(sourcePage.selection),selected)) throw new Error('Read this original document selection before opening detail.');
    const result = await api.get(ORG + 'detail?' + query({...selected,rowId,expectedSnapshot:snapshot}));
    if (!valid(token) || serial !== detailSerial || sourcePage.snapshot !== snapshot || !same(sourceChoice(sourcePage.selection),selected)) return;
    if (result.snapshotSha256 !== snapshot || result.row?.id !== rowId) throw new Error('The returned original detail belongs to another document or source snapshot.');
    sourceDetail = result; empty($('source-detail'));
    $('source-detail').append(node('h3',titleOf(result.row)),literalUrl(result.row));
    jsonDetails($('source-detail'),'Full original row, XML and supported targets',result);
  }
  function validatePlan(value, id, revision) {
    if (!value || !sha(value.id) || !sha(value.recordSha256) || !Number.isSafeInteger(value.revision) || value.revision < 1
      || !Array.isArray(value.documents) || value.documents.length > 500 || !Array.isArray(value.observationIds)
      || (id && value.id !== id) || (revision !== undefined && value.revision !== revision)) throw new Error('The returned evidence plan does not match the selected complete record.');
    const seen = new Set();
    for (const row of value.documents) { if (!sha(row.id) || seen.has(row.id)) throw new Error('The evidence plan contains invalid or duplicate document identities.'); seen.add(row.id); }
    return value;
  }
  async function allEvidenceRows(selected, token) {
    const complete = [], ids = new Set(), expectedIds = new Set(selected.documents.map(row => row.id)), total = selected.documents.length;
    for (let offset = 0; offset < total || (!offset && !total);) {
      const page = await api.get(BASE + 'rows?' + query({id:selected.id,revision:selected.revision,offset,limit:500,expectedSnapshot:selected.recordSha256}));
      if (!valid(token)) return null;
      validatePage(page,selected.recordSha256,offset,expectedIds);
      if (page.total !== total) throw new Error('The complete evidence register does not match its saved document selection.');
      for (const row of page.rows) {
        if (ids.has(row.id) || !Array.isArray(row.observationIds)) throw new Error('The evidence register contains a duplicate row or incomplete observation references.');
        ids.add(row.id); complete.push(row);
      }
      offset += page.rows.length; if (offset >= total) break;
    }
    if (complete.length !== total || ids.size !== expectedIds.size) throw new Error('The complete selected evidence register is missing rows.');
    return complete;
  }
  function upsertSummary(value) {
    const index = catalogue.plans.findIndex(item => item.id === value.id), previous = index < 0 ? null : catalogue.plans[index];
    if (previous && previous.revision > value.revision) return;
    const summary = { ...(previous || {}),id:value.id,revision:value.revision,name:value.name,state:value.state,createdAt:value.createdAt,updatedAt:value.updatedAt,
      documentCount:value.documents.length,observationCount:value.observationIds.length,reviewedCount:value.review?.decisions?.length || 0,selection:value.selection,recordSha256:value.recordSha256 };
    if (previous && previous.revision !== value.revision) { delete summary.retainedBodyBytes; delete summary.remainingBodyBytes; }
    if (index < 0) catalogue.plans.push(summary); else catalogue.plans[index] = summary;
  }
  async function readStatus(token = identity()) {
    const ticket=++statusSerial, result = await api.get(BASE + 'status');
    if (!valid(token) || ticket!==statusSerial) return false;
    if (result.workspaceSha256 !== workspaceKey) throw new Error('The console workspace changed. Refresh its current identity before continuing.');
    if (!Array.isArray(result.plans) || !Array.isArray(result.organisationPlans) || !Array.isArray(result.activeRequests)) throw new Error('The native evidence catalogue is incomplete.');
    catalogue = result; return true;
  }
  async function openPlan(id, revision, preserve = false, supplied = null) {
    requireWorkspace(); if (!sha(id)) throw new Error('Choose a saved evidence plan.');
    if (revision !== undefined) positive(revision,'Evidence revision');
    const token = identity(), serial = ++planSerial, requestedRow = preserve ? selectedRowId : null;
    const value = validatePlan(supplied || await api.get(BASE + 'plan?' + query({id,...(revision === undefined ? {} : {revision})})),id,revision);
    if (!valid(token) || serial !== planSerial) return;
    const [register,history] = await Promise.all([allEvidenceRows(value,token),api.get(BASE + 'history?' + query({id}))]);
    if (!valid(token) || serial !== planSerial || !register) return;
    if (!Array.isArray(history.history)) throw new Error('The original evidence history is missing.');
    history.history.forEach(item => validatePlan(item,id));
    if (!history.history.some(item => item.revision === value.revision && item.recordSha256 === value.recordSha256)) throw new Error('The opened evidence revision is absent from its original history.');
    plan = value; rows = register; rowsById = new Map(rows.map(row => [row.id,row])); planHistory = history.history;
    upsertSummary(history.history.reduce((latest,item) => !latest || latest.revision < item.revision ? item : latest,null) || value);
    selectedRowId = requestedRow && rowsById.has(requestedRow) ? requestedRow : null; selectedDetail = null; activeObservation = null; correction = null;
    if (!preserve) {
      reviewDraft = new Map((plan.review?.decisions || []).map(d => [d.rowId,clone(d)])); reviewDirty = false;
      captureSelection = new Set(rows.filter(row => !row.observationIds.length).map(row => row.id));
      evidenceOffset = 0; reviewOffset = 0;
      $('review-actor').value = plan.review?.actor || ''; $('review-note').value = plan.review?.note || '';
      $('capture-actor').value = $('actor').value || plan.actor || ''; $('recapture').checked = false;
      $('receive-name').value = plan.name || ''; $('receive-notes').value = plan.notes || ''; $('receive-actor').value = '';
    } else {
      reviewDraft = new Map([...reviewDraft].filter(([rowId]) => rowsById.has(rowId)));
      captureSelection = new Set([...captureSelection].filter(rowId => rowsById.has(rowId)));
      evidenceOffset = Math.min(evidenceOffset,Math.max(0,Math.floor((rows.length-1)/PAGE)*PAGE));
      reviewOffset = Math.min(reviewOffset,Math.max(0,Math.floor((rows.length-1)/PAGE)*PAGE));
    }
    $('plan-select').value = id;
    renderCatalogue(); $('plan-select').value = id;
    options($('plan-revision'),planHistory.map(item => ({value:item.revision,label:'Revision ' + item.revision + ' · ' + item.state + ' · ' + dateLabel(item.updatedAt)})),value.revision,'Choose an exact revision');
    empty($('detail'),'Select a document to inspect every retained observation.');
    renderAll(); await persistDraft();
    if (selectedRowId) await openEvidenceDetail(selectedRowId);
  }
  async function getObservation(id, token = identity()) {
    if (!sha(id)) throw new Error('Select an original retained observation.');
    const retained = observationCache.get(id);
    if (retained?.schema === 'stellar-forge.iati-document-observation.v1') return retained;
    const result = await api.get(BASE + 'observation?' + query({id}));
    if (!valid(token)) return null;
    if (result.id !== id || !sha(result.recordSha256) || !Array.isArray(result.rowIds)) throw new Error('The observation response does not match its original complete identity.');
    observationCache.set(id,result); return result;
  }
  function observationStatus(value) { return value?.fetch?.status ?? value?.status ?? null; }
  function renderObservation(holder, value) {
    empty(holder);
    const body = value.body, httpStatus = observationStatus(value), details = node('div',undefined,'ide-context');
    details.append(node('strong',value.state + ' · ' + value.outcome),node('p','HTTP status: ' + (httpStatus ?? 'No response') + ' · observed ' + dateLabel(value.finishedAt)),
      node('p',body ? (body.complete ? 'The HTTP message body is complete.' : 'Only a response prefix is retained.') + ' '
        + (value.documentComplete === true ? 'Native response evidence represents a complete successful document; relevance still requires named review.' : 'The response does not establish a complete successful document and cannot be marked usable.')
        : 'No response body is retained.'));
    holder.append(details);
    if (body) {
      const heading = body.complete ? 'Download retained HTTP body' : 'Download retained prefix';
      holder.append(button(heading,() => run('Verify retained response bytes',() => downloadObservation(value)),'download'));
      jsonDetails(holder,'Retained body identity, media and encoding',body);
    }
    if (value.fetch?.hops?.length) {
      const hops = node('div'); holder.append(node('h4','Observed HTTP hops'),hops);
      dataTable(hops,['Hop','Observed URL','HTTP status','Timing / address evidence'],value.fetch.hops.map((hop,index) => [
        index+1,hop.url ?? hop.requestUrl ?? hop.requestedUrl ?? '',hop.status ?? '',
        JSON.stringify({startedAt:hop.startedAt,finishedAt:hop.finishedAt,addresses:hop.addresses,connectedAddress:hop.connectedAddress})
      ]));
      jsonDetails(holder,'Complete original hop and header evidence',value.fetch.hops);
    }
    if (httpStatus === 206 || value.documentComplete !== true) holder.append(node('p','A range response, empty response, error or interrupted body remains evidence of what was observed. Use a reasoned correction, deferral or non-applicability decision as appropriate.','ide-muted'));
    jsonDetails(holder,'Full original observation and request identity',value);
  }
  async function openEvidenceDetail(rowId) {
    if (!plan || !rowsById.has(rowId)) throw new Error('Choose a row from the selected evidence plan.');
    const selected = {id:plan.id,revision:plan.revision,snapshot:plan.recordSha256}, token = identity(), serial = ++detailSerial;
    const value = await api.get(BASE + 'detail?' + query({id:selected.id,revision:selected.revision,rowId,expectedSnapshot:selected.snapshot}));
    if (!valid(token) || serial !== detailSerial || plan?.id !== selected.id || plan?.revision !== selected.revision) return;
    if (value.snapshotSha256 !== selected.snapshot || value.row?.id !== rowId || !Array.isArray(value.observations)) throw new Error('The document detail does not match its selected evidence snapshot.');
    const linked = new Set(value.row.observationIds || []);
    for (const observation of value.observations) {
      if (!linked.has(observation.id) || !observation.rowIds?.includes(rowId) || observation.planId !== selected.id) throw new Error('The returned observation is not linked to this original document.');
      observationCache.set(observation.id,observation);
    }
    selectedRowId = rowId; selectedDetail = value;
    empty($('detail')); $('detail').append(node('h3',titleOf(value.row)),literalUrl(value.row));
    jsonDetails($('detail'),'Complete document and exact original XML target',{row:value.row,organisationDetail:value.organisationDetail});
    const controls = node('div',undefined,'ide-actions'), body = node('div'); $('detail').append(controls,body);
    for (const observation of value.observations) controls.append(button(dateLabel(observation.finishedAt) + ' · ' + observationLabel(observation),() => {
      activeObservation = observation.id; renderObservation(body,observation); buttons();
    }));
    const last = value.observations.find(item => item.id === value.row.latestObservationSummary?.id) || value.observations.at(-1);
    if (last) { activeObservation = last.id; renderObservation(body,last); }
    else empty(body,'This original document has no retained response observation.');
    renderReview(); await persistDraft(); buttons();
  }
  function requiredText(id,label,maximum) {
    const value = $(id).value;
    if (!value.trim()) throw new Error(label + ' is required.');
    if (maximum && value.length > maximum) throw new Error(label + ' exceeds ' + maximum + ' characters.');
    return value;
  }
  function integerField(id,label,min,max) {
    const raw = $(id).value, n = Number(raw);
    if (!raw || !Number.isSafeInteger(n) || n < min || n > max) throw new Error(label + ' must be an integer from ' + min + ' to ' + max + '.');
    return n;
  }
  async function saveSelection() {
    requireWorkspace();
    if (pending) throw new Error('Resolve the original retained action before saving another selection.');
    const selected = sourceSelector();
    if (!same(sourceChoice(sourcePage.selection),selected) || !sha(sourcePage.snapshot)) throw new Error('Read the exact original document selection before saving.');
    const ids = [...selectedSourceRows];
    if (ids.length < 1 || ids.length > 500 || ids.some(id => !sha(id))) throw new Error('Select from 1 to 500 exact original document rows.');
    const input = {name:requiredText('name','Evidence plan name',160),actor:requiredText('actor','Named operator',160),notes:$('notes').value,
      selection:{id:selected.id,revision:selected.revision,view:selected.view,expectedSnapshot:sourcePage.snapshot},documentRowIds:ids,
      limits:{maxBytes:integerField('max-bytes','Maximum body bytes',1,67108864),timeoutSeconds:integerField('timeout','Total timeout',1,120),
        connectTimeoutSeconds:integerField('connect-timeout','Connection timeout',1,30),maxRedirects:integerField('redirects','Maximum redirects',0,10)}};
    await mutate('save',input); tab('acquisition');
  }
  async function saveReview() {
    assertEditable(); const selected = plan, token = identity();
    if (!rows.length) throw new Error('This saved plan has no selected documents.');
    const decisions = [];
    for (const row of rows) {
      const draft = decisionFor(row), decision = draft.decision, observationId = draft.observationId || null;
      if (!['usable','needs_correction','not_applicable','deferred'].includes(decision)) throw new Error('Choose an explicit decision for ' + titleOf(row) + '.');
      if (observationId && !row.observationIds.includes(observationId)) throw new Error('Select a retained observation linked to ' + titleOf(row) + '.');
      if (['usable','needs_correction'].includes(decision) && !observationId) throw new Error('A retained observation is required for ' + titleOf(row) + '.');
      if (decision !== 'usable' && !draft.note.trim()) throw new Error('Explain the ' + decision + ' decision for ' + titleOf(row) + '.');
      if (decision === 'usable') {
        const observation = await getObservation(observationId,token);
        if (!valid(token)) return;
        if (!observation || observation.documentComplete !== true) throw new Error('Usable requires complete successful document evidence for ' + titleOf(row) + '. Inspect its original response or select a reasoned alternative.');
      }
      const item = {rowId:row.id,observationId,decision,note:draft.note};
      if (draft.correctedUrl) {
        if (decision !== 'needs_correction') throw new Error('A URL correction belongs only to a needs-correction decision.');
        let url; try { url = new URL(draft.correctedUrl); } catch { throw new Error('Enter a complete explicit HTTP(S) correction URL for ' + titleOf(row) + '.'); }
        if (!['http:','https:'].includes(url.protocol) || url.username || url.password || draft.correctedUrl.trim() !== draft.correctedUrl) throw new Error('The reviewed correction must be an explicit public HTTP(S) URL without credentials or surrounding whitespace.');
        item.correctedUrl = draft.correctedUrl;
      }
      decisions.push(item);
    }
    if (plan?.id !== selected.id || plan?.revision !== selected.revision) throw new Error('The selected evidence revision changed during review preparation.');
    await mutate('review',{id:selected.id,expectedRevision:selected.revision,actor:requiredText('review-actor','Review operator',160),note:$('review-note').value,decisions});
  }
  async function saveReceivingNote() {
    assertEditable();
    await mutate('note',{id:plan.id,expectedRevision:plan.revision,name:requiredText('receive-name','Current evidence plan name',160),
      notes:requiredText('receive-notes','Receiving note'),actor:requiredText('receive-actor','Named receiving engineer',160)});
  }


  async function consumeResult(route, result, token, original = null) {
    if (!valid(token)) return;
    statusSerial++;
    if (route === 'compare') {
      comparisonOffset=0;
      if (!result || !sha(result.id) || !Array.isArray(result.rows) || !result.before || !result.after) throw new Error('The saved comparison receipt is incomplete.');
      comparison = result; $('comparison-id').value = result.id;
      knownComparisons = [{id:result.id,label:'Revision ' + result.before.revision + ' → ' + result.after.revision + ' · ' + short(result.id)},...knownComparisons.filter(item => item.id !== result.id)].slice(0,100);
      renderCatalogue(); renderComparison(); tab('comparison'); await persistDraft(); return;
    }
    if (route === 'receive') {
      if (result?.state !== 'COMPLETE' || !result.packet || !sha(result.packet.sha256)) throw new Error('The native receiving result does not describe a complete original package.');
      if (original?.packet && (result.packet.sha256 !== original.packet.sha256 || result.packet.bytes !== original.packet.bytes)) throw new Error('The receiving result names bytes different from the selected original ZIP.');
      validatePlan(result.plan); validatePlan(result.currentPlan,result.plan.id);
      if (result.currentPlan.revision < result.plan.revision) throw new Error('The receiving result lost its selected original revision.');
      receiving = result; upsertSummary(result.currentPlan);
      await openPlan(result.currentPlan.id,result.currentPlan.revision,false,result.currentPlan);
      if (!valid(token)) return;
      receiving = result; renderReceiving(); tab('receive');
      await persistDraft(); note('Received the complete original packet. Imported revision ' + result.plan.revision + '; current editable revision ' + result.currentPlan.revision + '.');
      return;
    }
    const value = route === 'observe' ? result?.plan : result;
    validatePlan(value);
    if (original?.input?.id && value.id !== original.input.id) throw new Error('The returned plan belongs to another original action.');
    if (route === 'observe') {
      const observation = result.observation;
      if (!observation || observation.planId !== value.id || !sha(observation.id) || !value.observationIds.includes(observation.id)) throw new Error('The retained acquisition result is missing its original observation.');
      if (original && (observation.requestId !== original.input.requestId || !same([...observation.rowIds].sort(),[...original.input.rowIds].sort()))) throw new Error('The acquired observation differs from its original request and document rows.');
      observationCache.set(observation.id,observation);
      if (queue && original?.queueId === queue.id && Number.isSafeInteger(original.queueIndex)) {
        const group = queue.groups[original.queueIndex];
        if (!group || !same([...group.rowIds].sort(),[...observation.rowIds].sort()) || group.url !== observation.publishedUrl) throw new Error('The original observation does not match its retained queue group.');
        queue.nextIndex = Math.max(queue.nextIndex,original.queueIndex+1);
        queue.lastObservationId = observation.id; queue.lastRequestId = observation.requestId; delete queue.awaitingRequestId;
        queue.expectedRevision = value.revision;
        for (const id of observation.rowIds) captureSelection.delete(id);
        if (queue.nextIndex >= queue.groups.length) queue.state = 'COMPLETE';
      }
    }
    upsertSummary(value);
    const preserve = route === 'observe' && plan?.id === value.id;
    const priorDraft = reviewDraft.size;
    await openPlan(value.id,value.revision,preserve,value);
    if (!valid(token)) return;
    if (route === 'observe' && priorDraft && !value.review) reviewDirty = true;
    if (route === 'review') { reviewDraft = new Map(value.review.decisions.map(d => [d.rowId,clone(d)])); reviewDirty = false; $('review-actor').value = value.review.actor; $('review-note').value = value.review.note; }
    if (route === 'note') { $('receive-name').value = value.name; $('receive-notes').value = value.notes; }
    try { await readStatus(token); } catch (error) { if (valid(token)) note('The original ' + route + ' result is retained. The current catalogue could not refresh: ' + error.message,true); }
    if (!valid(token)) return;
    renderAll(); await persistDraft();
    note('Retained original ' + route + ' result · revision ' + value.revision + (route === 'observe' ? ' · ' + result.observation.state + ' / ' + result.observation.outcome : '') + '.');
  }
  async function startQueue(resume) {
    requireWorkspace();
    if (localBusy || api.isBusy() || queue?.running) return;
    if (pending) throw new Error('Read and resolve the exact retained action before continuing the capture queue.');
    assertEditable();
    const token = identity(), actor = requiredText('capture-actor','Capture operator',160);
    if (resume) {
      if (!queue || queue.planId !== plan.id) throw new Error('Open the retained queue’s original evidence plan before continuing.');
      if (queue.nextIndex >= queue.groups.length) throw new Error('Every retained URL group already has its original terminal observation.');
      if (!same(queue.selection,plan.selection)) throw new Error('The retained queue belongs to a different original source selection.');
      queue.actor = actor; queue.acknowledgeNewObservation = $('recapture').checked;
    } else {
      const selected = rows.filter(row => captureSelection.has(row.id));
      if (!selected.length) throw new Error('Select at least one original document row.');
      if (selected.some(row => row.observationIds.length) && !$('recapture').checked) throw new Error('A selected row already has evidence. Explicitly acknowledge a new dated observation before capturing it again.');
      queue = {id:crypto.randomUUID(),workspace:workspaceKey,planId:plan.id,selection:clone(plan.selection),expectedRevision:plan.revision,
        groups:groupRows(selected).map(group => ({url:group.url,rowIds:group.documents.map(row => row.id)})),nextIndex:0,
        actor,acknowledgeNewObservation:$('recapture').checked,state:'PREPARED',createdAt:new Date().toISOString(),running:false,stopRequested:false};
    }
    queue.running = true; queue.stopRequested = false; queue.state = 'RUNNING'; delete queue.error;
    const queueId = queue.id;
    await persistDraft(); renderAcquisition(); buttons();
    try {
      while (valid(token) && queue?.id === queueId && queue.nextIndex < queue.groups.length && !queue.stopRequested) {
        if (pending) throw new Error('An original action remains unresolved; the queue is paused with that exact request.');
        if (plan?.id !== queue.planId || !freshPlan()) throw new Error('Open the original plan’s current revision before continuing unfinished URL groups.');
        if (hasActiveAcquisition()) throw new Error('The native plan has an active original acquisition. Read its retained request before continuing.');
        const index = queue.nextIndex, group = queue.groups[index], currentRows = group.rowIds.map(id => rowsById.get(id));
        if (currentRows.some(row => !row || row.url !== group.url)) throw new Error('The retained group differs from the original literal URL selection.');
        const recapture = currentRows.some(row => row.observationIds.length);
        if (recapture && !queue.acknowledgeNewObservation) throw new Error('An unfinished row now has retained evidence. Acknowledge a new observation explicitly before continuing it.');
        queue.state = 'ACQUIRING'; renderAcquisition(); buttons();
        const input = {id:plan.id,expectedRevision:plan.revision,rowIds:[...group.rowIds],actor:queue.actor,...(recapture ? {acknowledgeNewObservation:true} : {})};
        await mutate('observe',input,{queueId,queueIndex:index});
        if (!valid(token) || queue?.id !== queueId) return;
        if (pending?.input?.requestId === queue.awaitingRequestId && pending.lastRequestState === 'ACQUIRING') { queue.state='AWAITING_ORIGINAL_RESULT'; return; }
        if (queue.nextIndex <= index) throw new Error('The native response is retained but its original queue outcome has not been adopted. Read the original receipt before continuing.');
        await persistDraft(); renderAcquisition();
      }
      if (!valid(token) || queue?.id !== queueId) return;
      queue.state = queue.nextIndex >= queue.groups.length ? 'COMPLETE' : 'PAUSED';
      note(queue.state === 'COMPLETE' ? 'Every selected URL group has a retained original observation. Review each document explicitly.' : 'Stopped after the current URL. The remaining original groups are retained for explicit continuation.');
    } catch (error) {
      if (valid(token) && queue?.id === queueId) { queue.state = pending ? 'AWAITING_ORIGINAL_RESULT' : 'PAUSED'; queue.error = error.message; note(error.message,true); }
    } finally {
      if (valid(token) && queue?.id === queueId) { queue.running = false; queue.stopRequested = true; await persistDraft(); renderAcquisition(); buttons(); }
    }
  }
  function fillComparisonSelector(side, selected) {
    options($(side + '-plan'),catalogue.plans.map(item => ({value:item.id,label:item.name + ' · revision ' + item.revision})),selected.id);
    options($(side + '-revision'),[{value:selected.revision,label:'Exact revision ' + selected.revision}],selected.revision);
  }
  function comparisonSelector(side) {
    const id = $(side + '-plan').value, revision = positive($(side + '-revision').value,side + ' revision');
    if (!sha(id)) throw new Error('Choose the ' + side + ' evidence plan.');
    return {id,revision};
  }
  async function loadComparisonHistory(side) {
    const id = $(side + '-plan').value, token = identity(), chosen = $(side + '-revision').value;
    if (!sha(id)) throw new Error('Choose the ' + side + ' evidence plan.');
    const result = await api.get(BASE + 'history?' + query({id}));
    if (!valid(token) || $(side + '-plan').value !== id) return;
    if (!Array.isArray(result.history)) throw new Error('The complete original comparison history is absent.');
    result.history.forEach(item => validatePlan(item,id));
    options($(side + '-revision'),result.history.map(item => ({value:item.revision,label:'Revision ' + item.revision + ' · ' + item.name + ' · ' + item.state})),
      chosen && result.history.some(item => String(item.revision) === chosen) ? chosen : result.history.at(-1)?.revision,'Choose a saved revision');
    comparisonInputs = null; comparisonBefore = []; comparisonAfter = []; renderPairs(); scheduleDraft();
  }
  function selectedComparisonMatches() {
    try { return comparisonInputs && same(comparisonInputs.before,comparisonSelector('before')) && same(comparisonInputs.after,comparisonSelector('after')); }
    catch { return false; }
  }
  async function loadComparisonInputs(preservePairs = false) {
    requireWorkspace(); const before = comparisonSelector('before'), after = comparisonSelector('after'), token = identity();
    const [beforePlan,afterPlan] = await Promise.all([
      api.get(BASE + 'plan?' + query(before)),api.get(BASE + 'plan?' + query(after))
    ]);
    if (!valid(token) || !same(before,comparisonSelector('before')) || !same(after,comparisonSelector('after'))) return;
    validatePlan(beforePlan,before.id,before.revision); validatePlan(afterPlan,after.id,after.revision);
    const [beforeRows,afterRows] = await Promise.all([allEvidenceRows(beforePlan,token),allEvidenceRows(afterPlan,token)]);
    if (!valid(token) || !same(before,comparisonSelector('before')) || !same(after,comparisonSelector('after')) || !beforeRows || !afterRows) return;
    const old = comparisonInputs;
    comparisonInputs = {before,after,beforeRecordSha256:beforePlan.recordSha256,afterRecordSha256:afterPlan.recordSha256,
      beforeSourceId:beforePlan.selection.sourceId,afterSourceId:afterPlan.selection.sourceId};
    comparisonBefore = beforeRows; comparisonAfter = afterRows;
    if (!preservePairs && (!old || !same(old.before,before) || !same(old.after,after))) pairs = [];
    renderPairs(); await persistDraft();
    note('Loaded both complete saved evidence editions without any new HTTP acquisition.');
  }
  function addPair() {
    try {
      if (!selectedComparisonMatches()) throw new Error('Read both selected evidence editions before pairing original rows.');
      const beforeRowId = $('pair-before').value, afterRowId = $('pair-after').value;
      if (!comparisonBefore.some(row => row.id === beforeRowId) || !comparisonAfter.some(row => row.id === afterRowId)) throw new Error('Choose one original document on each side.');
      if (pairs.some(pair => pair.beforeRowId === beforeRowId || pair.afterRowId === afterRowId)) throw new Error('Each original row can occur in only one explicit pair.');
      pairs.push({beforeRowId,afterRowId}); $('pairing-mode').value = 'explicit'; renderPairs(); scheduleDraft();
    } catch (error) { note(error.message,true); }
  }
  function renderPairs() {
    const explicit = $('pairing-mode').value === 'explicit', ready = selectedComparisonMatches();
    $('pair-editor').hidden = !explicit;
    options($('pair-before'),comparisonBefore.map(row => ({value:row.id,label:titleOf(row) + ' · ' + text(row.url)})),undefined,'Choose a before document');
    options($('pair-after'),comparisonAfter.map(row => ({value:row.id,label:titleOf(row) + ' · ' + text(row.url)})),undefined,'Choose an after document');
    const before = new Map(comparisonBefore.map(row => [row.id,row])), after = new Map(comparisonAfter.map(row => [row.id,row]));
    dataTable($('pairs'),['Before document','After document','Edit'],pairs.map((pair,index) => [
      before.has(pair.beforeRowId) ? titleOf(before.get(pair.beforeRowId)) : 'Retained before row ' + short(pair.beforeRowId),
      after.has(pair.afterRowId) ? titleOf(after.get(pair.afterRowId)) : 'Retained after row ' + short(pair.afterRowId),
      button('Remove this pair',() => { pairs.splice(index,1); renderPairs(); scheduleDraft(); },'edit')
    ]));
    if (!ready) $('pairs').prepend(node('p','Read both exact selected editions before saving this comparison. Retained draft pairs remain visible.','ide-context'));
    else if (comparisonInputs.beforeSourceId !== comparisonInputs.afterSourceId) $('pairs').prepend(node('p','These editions use different original sources. Save explicit unique pairs, or an explicitly empty pair list.','ide-context'));
    if (explicit && !pairs.length) $('pairs').append(node('p','Explicit empty pair list: no automatic matching; original rows remain in added/removed coverage.','ide-muted'));
    buttons();
  }
  async function saveComparison() {
    requireWorkspace();
    if (!selectedComparisonMatches()) throw new Error('Read the exact selected evidence editions before saving the comparison.');
    const explicit = $('pairing-mode').value === 'explicit';
    if (!explicit && comparisonInputs.beforeSourceId !== comparisonInputs.afterSourceId) throw new Error('Different original sources require explicit row pairing.');
    const beforeIds = new Set(comparisonBefore.map(row => row.id)), afterIds = new Set(comparisonAfter.map(row => row.id));
    const seenBefore = new Set(), seenAfter = new Set();
    for (const pair of pairs) {
      if (!beforeIds.has(pair.beforeRowId) || !afterIds.has(pair.afterRowId) || seenBefore.has(pair.beforeRowId) || seenAfter.has(pair.afterRowId)) throw new Error('Every explicit pair must select distinct rows from the two exact loaded editions.');
      seenBefore.add(pair.beforeRowId); seenAfter.add(pair.afterRowId);
    }
    await mutate('compare',{before:comparisonSelector('before'),after:comparisonSelector('after'),...(explicit ? {rowPairs:clone(pairs)} : {}),
      actor:requiredText('compare-actor','Comparison operator',160),notes:$('compare-notes').value});
  }
  let comparisonOffset = 0;
  function renderComparison() {
    empty($('comparison-summary')); empty($('comparison-table'));
    if (!comparison) { empty($('comparison-summary'),'Open or save a complete evidence comparison.'); return; }
    $('comparison-summary').append(node('p','Before revision ' + comparison.before.revision + ' → after revision ' + comparison.after.revision
      + ' · ' + ({SAME_SOURCE:'original same-source matching',EXPLICIT:'explicit original row pairs',UNPAIRED:'unpaired original rows'}[comparison.automaticPairing?.mode] || text(comparison.automaticPairing?.mode || 'native pairing')),'ide-context'));
    jsonDetails($('comparison-summary'),'Original comparison summary and exact identities',{id:comparison.id,before:comparison.before,after:comparison.after,summary:comparison.summary,automaticPairing:comparison.automaticPairing,recordSha256:comparison.recordSha256,rowPairs:comparison.rowPairs,notes:comparison.notes});
    const table = node('div'), pages = node('div',undefined,'ide-pager'); $('comparison-table').append(table,pages);
    comparisonOffset = Math.min(comparisonOffset,Math.max(0,Math.floor((comparison.rows.length-1)/PAGE)*PAGE));
    dataTable(table,['Before original document','After original document','Retained evidence comparison','Observed changes'],comparison.rows.slice(comparisonOffset,comparisonOffset+PAGE).map(row => [
      row.before ? titleOf(row.before) + '\n' + text(row.before.url) : 'No before row',
      row.after ? titleOf(row.after) + '\n' + text(row.after.url) : 'No after row',
      row.content === 'indeterminate' ? 'Indeterminate: complete comparable document evidence is not available' : row.content,
      (row.changes || []).join('\n')
    ]));
    pager(pages,comparisonOffset,comparison.rows.length,offset => { comparisonOffset=offset; renderComparison(); buttons(); });
    $('comparison-summary').append(node('p','Complete document bodies and matching content encodings are required for full-body equality or change claims. Prefixes, range responses and differing encodings remain indeterminate. No new network read was performed.','ide-muted'));
    buttons();
  }
  async function openComparison() {
    requireWorkspace(); const id = $('comparison-id').value, token = identity();
    if (!sha(id)) throw new Error('Enter the exact original saved comparison ID.');
    const value = await api.get(BASE + 'comparison?' + query({id}));
    if (!valid(token) || $('comparison-id').value !== id) return;
    if (value.id !== id || !Array.isArray(value.rows) || !sha(value.recordSha256)) throw new Error('The saved comparison response is incomplete or belongs to another ID.');
    comparisonOffset = 0; await consumeResult('compare',value,token);
  }
  async function loadCorrection() {
    if (!plan) throw new Error('Open a reviewed evidence plan.');
    const selected = {id:plan.id,revision:plan.revision,recordSha256:plan.recordSha256}, token=identity();
    const value = await api.get(BASE + 'correction?' + query({id:selected.id,revision:selected.revision}));
    if (!valid(token) || plan?.id !== selected.id || plan?.revision !== selected.revision) return;
    if (value.evidence?.id !== selected.id || value.evidence?.revision !== selected.revision || value.evidence?.recordSha256 !== selected.recordSha256
      || !Array.isArray(value.changes) || !sha(value.organisation?.id)) throw new Error('The correction draft does not bind this exact reviewed evidence revision.');
    correction = value; renderCorrection(); buttons();
  }
  function renderCorrection() {
    empty($('correction-table')); empty($('correction-detail'));
    if (!correction) { $('correction-state').textContent = 'Read the complete correction draft from the selected reviewed evidence revision.'; return; }
    const advanced=correction.currentOrganisationRevision !== correction.organisation.revision;
    $('correction-state').textContent = correction.rebaseRequired
      ? advanced
        ? 'The original organisation plan advanced to revision ' + correction.currentOrganisationRevision + '. This draft retains revision ' + correction.organisation.revision + ' and its original source guard; review an explicit rebase in the organisation workflow.'
        : 'This evidence uses original source URLs while organisation revision ' + correction.organisation.revision + ' already contains candidate edits. Review the existing candidate and the native correction semantics before rebasing this guarded source draft.'
      : correction.request ? 'Complete draft for original organisation revision ' + correction.organisation.revision + '. Review and apply it through the existing organisation workflow.'
      : 'The selected review contains no native URL-correction request.';
    if (correction.rebaseRequired && correction.semantics) jsonDetails($('correction-detail'),'Native source, candidate and rebase semantics',correction.semantics);
    dataTable($('correction-table'),['Document','Original URL','Reviewed replacement URL','Original guarded target'],correction.changes.map(change => [
      rowsById.has(change.rowId) ? titleOf(rowsById.get(change.rowId)) : short(change.rowId),
      literalUrl({url:change.fromUrl}),literalUrl({url:change.toUrl}),change.targetId + '\nOriginal value SHA-256: ' + change.beforeSha256
    ]));
    jsonDetails($('correction-detail'),'Complete native correction request, original revisions and evidence',correction);
  }
  async function openOrganisation() {
    if (!plan) throw new Error('Open the original evidence plan.');
    const original = correction?.organisation || {id:plan.selection.id,revision:plan.selection.revision}, token=identity();
    if (!sha(original.id)) throw new Error('The original organisation selection is absent.');
    await api.openOrganisationPlan(original.id,original.revision);
    if (valid(token)) api.show('organisation');
  }


  async function sha256Bytes(bytes) {
    if (!crypto.subtle) throw new Error('This browser context cannot verify SHA-256. Use the original complete-file CLI from a supported secure console.');
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value => value.toString(16).padStart(2,'0')).join('');
  }
  function safeFilename(value, fallback) {
    const name = text(value).split(/[\\/]/).at(-1).replace(/[\u0000-\u001f\u007f]/g,'');
    return name && !['.','..'].includes(name) ? name : fallback;
  }
  function responseFilename(response, fallback) {
    const value = response.headers.get('Content-Disposition') || '';
    const encoded = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (encoded) { try { return safeFilename(decodeURIComponent(encoded[1].trim()),fallback); } catch {} }
    const ordinary = value.match(/filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i);
    return safeFilename(ordinary ? ordinary[1] ?? ordinary[2]?.trim() : '',fallback);
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob), anchor = node('a');
    downloadUrls.add(url); anchor.href = url; anchor.download = filename; anchor.hidden = true; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => { if (downloadUrls.delete(url)) URL.revokeObjectURL(url); },2000);
  }
  function downloadJson(value, filename) {
    if (value == null) { note('No complete record is selected for this download.',true); return; }
    downloadBlob(new Blob([JSON.stringify(value,null,2) + '\n'],{type:'application/json;charset=utf-8'}),safeFilename(filename,'document-evidence.json'));
  }
  async function verifiedDownload(path, fallback, descriptor = null) {
    requireWorkspace(); const token = identity(), response = await api.request(path,{method:'GET'});
    if (!valid(token)) { try { await response.body?.cancel(); } catch {} return; }
    const rawLength = response.headers.get('Content-Length'), expectedHash = (response.headers.get('X-Content-SHA256') || '').toLowerCase();
    const expectedBytes = rawLength && /^\d+$/.test(rawLength) ? Number(rawLength) : NaN;
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || !sha(expectedHash)) {
      try { await response.body?.cancel(); } catch {}
      throw new Error('The native file response lacks its exact byte count or SHA-256. No unverified download was created.');
    }
    if (descriptor && (descriptor.bytes !== expectedBytes || descriptor.sha256 !== expectedHash)) {
      try { await response.body?.cancel(); } catch {}
      throw new Error('The file response differs from the retained original body descriptor.');
    }
    if (expectedBytes > BROWSER_BYTES) {
      try { await response.body?.cancel(); } catch {}
      $('download-state').textContent = 'The complete original file is ' + bytesLabel(expectedBytes) + '. Use the displayed streaming CLI; no partial browser file was created.';
      renderCli(); throw new Error('This complete file exceeds the 64 MiB browser limit. The streaming commands in Receive preserve the whole packet.');
    }
    const chunks = []; let received = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const part = await reader.read();
          if (!valid(token)) { await reader.cancel(); return; }
          if (part.done) break;
          received += part.value.byteLength;
          if (received > expectedBytes || received > BROWSER_BYTES) { await reader.cancel(); throw new Error('The native file response exceeded its exact declared length.'); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer()); received = bytes.byteLength; chunks.push(bytes);
    }
    if (!valid(token)) return;
    if (received !== expectedBytes) throw new Error('The original file transfer is incomplete: expected ' + expectedBytes + ' bytes, received ' + received + '.');
    const body = new Uint8Array(received); let offset = 0; for (const chunk of chunks) { body.set(chunk,offset); offset += chunk.byteLength; }
    const actualHash = await sha256Bytes(body);
    if (!valid(token)) return;
    if (actualHash !== expectedHash) throw new Error('The downloaded file SHA-256 differs from the complete native descriptor. No download was created.');
    const filename = responseFilename(response,fallback), mime = response.headers.get('Content-Type') || 'application/octet-stream';
    downloadBlob(new Blob([body],{type:mime}),filename);
    $('download-state').textContent = 'Verified ' + filename + ' · ' + bytesLabel(received) + ' · SHA-256 ' + actualHash;
    note('Verified the complete original bytes for ' + filename + '.');
    return {filename,bytes:received,sha256:actualHash,mime};
  }
  async function downloadOperatingSource() {
    if (!plan) throw new Error('Open an exact evidence revision.');
    const token = identity(), selected = { id: plan.id, revision: plan.revision, recordSha256: plan.recordSha256 };
    const source = await api.get(BASE + 'operating-source?' + query({ id: selected.id, revision: selected.revision }));
    if (!valid(token)) return;
    if (source?.schema !== 'stellar-forge.iati-document-operating-source.v1' ||
        source.plan?.id !== selected.id || source.plan?.revision !== selected.revision ||
        source.plan?.recordSha256 !== selected.recordSha256 || source.snapshotSha256 !== selected.recordSha256)
      throw new Error('The operating source differs from the selected saved case.');
    if (new TextEncoder().encode(JSON.stringify(source, null, 2) + '\n').length > 64 * 1024 * 1024)
      throw new Error('The complete operating-source JSON exceeds the 64 MiB file capacity.');
    downloadJson(source, 'iati-operating-source-' + selected.id + '-r' + selected.revision + '.json');
    note('Downloaded the complete saved case input. Import it in Operating plans, then add the customer and receiving details.');
  }
  async function downloadPlanFile(kind) {
    if (!plan) throw new Error('Open an exact evidence revision.');
    const extension = {report:'html',register:'csv',plan:'json',correction:'json'}[kind];
    if (!extension) throw new Error('Choose a native evidence file.');
    return verifiedDownload(BASE + 'file?' + query({id:plan.id,revision:plan.revision,kind}),
      'document-evidence-' + kind + '-r' + plan.revision + '.' + extension);
  }
  async function downloadObservation(observation) {
    if (!observation.body) throw new Error('The original observation has no retained body.');
    return verifiedDownload(BASE + 'body?' + query({observationId:observation.id}),
      safeFilename(observation.body.name,'document-response-' + short(observation.id) + (observation.body.complete ? '.bin' : '.prefix.bin')),observation.body);
  }
  async function exportPlan() {
    if (!plan) throw new Error('Open an exact evidence revision.');
    return verifiedDownload(BASE + 'export?' + query({id:plan.id,revision:plan.revision}),'document-evidence-' + short(plan.id) + '-r' + plan.revision + '.zip');
  }
  async function selectedPacket() {
    const file = receiveFile || $('import-file').files?.[0], token=identity();
    if (!file) throw new Error('Select the original complete evidence ZIP.');
    if (!Number.isSafeInteger(file.size) || file.size < 1) throw new Error('The selected original packet is empty.');
    if (file.size > BROWSER_BYTES) { renderCli(); throw new Error('Use the displayed streaming receive command for a packet above 64 MiB. The native receiving route supports the full original packet.'); }
    const body = new Uint8Array(await file.arrayBuffer());
    if (!valid(token)) return null;
    if (body.byteLength !== file.size) throw new Error('The selected file did not yield its complete original bytes.');
    const hash = await sha256Bytes(body);
    if (!valid(token)) return null;
    return {body,packet:{filename:file.name,bytes:body.byteLength,sha256:hash}};
  }
  async function sendPacket(original, selected) {
    const token=identity();
    if (!same({bytes:selected.packet.bytes,sha256:selected.packet.sha256},{bytes:original.packet.bytes,sha256:original.packet.sha256})) throw new Error('Select the same original ZIP bytes before continuing its receiving operation.');
    let result;
    try {
      const response = await api.request(BASE + 'receive',{method:'POST',headers:{'Content-Type':'application/zip'},body:selected.body});
      result = await response.json();
      if (result?.state !== 'COMPLETE' || result.packet?.bytes !== original.packet.bytes || result.packet?.sha256 !== original.packet.sha256) throw new Error('The native import response does not verify the same complete original packet.');
    } catch (error) {
      const update={...original,uncertain:true,rejected:[400,413,415,422].includes(error.status),error:error.message,providerError:errorValue(error)};
      await storage('write','pending',update,token.workspace);
      if (valid(token)) { pending=update; renderPending(); buttons(); }
      throw error;
    }
    if (await rememberOutcome(original,result,token)) await consumeResult('receive',result,token,original);
  }
  async function receivePacket() {
    requireWorkspace();
    if (pending) throw new Error('Resolve the original retained action before starting another import.');
    const token=identity(), selected=await selectedPacket();
    if (!selected || !valid(token)) return;
    const original={schema:'sf30.iati.document-evidence.pending.v1',workspace:workspaceKey,route:'receive',packet:selected.packet,
      createdAt:new Date().toISOString(),draft:uiDraft()};
    await retainPending(original);
    if (!valid(token)) return;
    await sendPacket(original,selected);
  }
  async function keepRejectedPacket() {
    if (pending?.route !== 'receive' || !pending.rejected || ![400,413,415,422].includes(pending.providerError?.status)) throw new Error('Only the exact terminal packet rejection can be retained through this action.');
    const original=clone(pending),token=identity();
    const key='rejected-packet:'+original.packet.sha256+':'+original.createdAt;
    if (!(await storage('write',key,original,token.workspace))) throw new Error('Retain the complete rejected packet descriptor and error before choosing another packet.');
    if (!valid(token)) return;
    await readStatus(token);
    if (!valid(token)) return;
    if (!(await storage('delete','pending',undefined,token.workspace))) throw new Error('Browser recovery storage could not retain the original pending-action deletion.');
    if (!valid(token)) return;
    restored=original; restoredKey=key; pending=null; receiving=null; receiveFile=null; $('import-file').value='';
    renderAll(); await persistDraft(); tab('receive');
    note('Kept the complete packet rejection and refreshed current native work. Verified parent records remain retained; choose another complete packet explicitly.');
  }
  async function continueReceive() {
    if (pending?.route !== 'receive') throw new Error('No original packet receiving operation is retained.');
    const token=identity(), original=clone(pending), selected=await selectedPacket();
    if (!selected || !valid(token)) return;
    if (selected.packet.bytes !== original.packet.bytes || selected.packet.sha256 !== original.packet.sha256) throw new Error('The selected file differs from the original receiving packet. Keep the same filename or choose a renamed file only when its bytes and SHA-256 match exactly.');
    await sendPacket(original,selected);
  }
  function renderReceiving() {
    empty($('receiving-detail'));
    if (!receiving) {
      if (pending?.route === 'receive') $('receiving-state').textContent = 'Original import remains retained: ' + bytesLabel(pending.packet.bytes) + ' · SHA-256 ' + pending.packet.sha256 + '. Select those identical bytes to continue explicitly.';
      else if (!receiveFile) $('receiving-state').textContent = 'Choose the original complete package to begin receiving.';
      return;
    }
    $('receiving-state').textContent = 'COMPLETE · imported revision ' + receiving.plan.revision + ' · current receiving revision ' + receiving.currentPlan.revision
      + ' · ' + bytesLabel(receiving.packet.bytes) + ' · SHA-256 ' + receiving.packet.sha256;
    $('receiving-detail').append(node('p','The current plan is editable. The selected imported revision remains a separate historical record; re-importing older work preserves later receiving notes.','ide-context'));
    $('receiving-detail').append(button('Open imported revision',() => run('Open original imported revision',() => openPlan(receiving.plan.id,receiving.plan.revision))),
      button('Open latest current revision',() => run('Open current receiving plan',() => openPlan(receiving.currentPlan.id))));
    jsonDetails($('receiving-detail'),'Complete original receiving result and selected/current identities',receiving);
  }
  function renderCli() {
    const id = plan?.id || 'SHA', revision = plan?.revision || 'N';
    $('cli').textContent = [
      '# Live original console: complete streamed export',
      'node /ABS/IATI/document_evidence_client_cli.mjs --connection-file /ABS/PRIVATE/console.url export --id ' + id + ' --revision ' + revision + ' --out /ABS/OUTPUT/evidence.zip',
      '',
      '# Live original receiving console: complete streamed import',
      'node /ABS/IATI/document_evidence_client_cli.mjs --connection-file /ABS/PRIVATE/console.url receive --file /ABS/INPUT/evidence.zip',
      '',
      '# Closed console: use the same original native workspace',
      'python3 /ABS/IATI/cli.py --workspace /ABS/WORKSPACE document-evidence-export --id ' + id + ' --revision ' + revision + ' --out /ABS/OUTPUT/evidence.zip',
      'python3 /ABS/IATI/cli.py --workspace /ABS/WORKSPACE document-evidence-receive --file /ABS/INPUT/evidence.zip',
      '',
      '# Replace /ABS paths with the existing installation, connection/workspace and chosen input/output.',
      '# Receive streams the original ZIP without an invented requestId; the native whole-packet ceiling is 4 GiB.'
    ].join('\n');
  }
  function buttons() {
    if (!mounted) return;
    const busy = localBusy || api.isBusy(), running=!!queue?.running, missing=!workspaceKey;
    $('panel').querySelectorAll('[data-ide-control]').forEach(el => {
      const control=el.dataset.ideControl;
      let disabled = control === 'nav' ? busy : busy || running || missing;
      if (['edit','mutate','capture'].includes(control)) disabled ||= !!pending;
      if (control === 'recover') disabled ||= !pending;
      if (control === 'stop') disabled = !running || !!queue.stopRequested;
      if (el.dataset.idePageDisabled === 'true') disabled = true;
      el.disabled=disabled;
    });
    $('open-view').disabled=api.isBusy();
    const inactive=busy||running||missing;
    for (const id of ['open-revision','open-current']) $(id).disabled ||= !plan && !$('plan-select').value;
    $('open-plan').disabled ||= !$('plan-select').value;
    $('save').disabled ||= !sourcePage.snapshot || selectedSourceRows.size < 1 || selectedSourceRows.size > 500;
    $('select-page').disabled ||= !sourcePage.rows.length;
    $('select-all').disabled ||= !sourcePage.snapshot || sourcePage.total > 500;
    $('capture').disabled ||= !plan || !freshPlan() || !captureSelection.size || hasActiveAcquisition();
    $('resume-queue').disabled ||= !queue || queue.nextIndex >= queue.groups.length || queue.planId !== plan?.id || !freshPlan() || hasActiveAcquisition();
    $('review-save').disabled ||= !plan || !freshPlan() || !rows.length || hasActiveAcquisition();
    $('note-save').disabled ||= !plan || !freshPlan() || hasActiveAcquisition();
    $('compare').disabled ||= !selectedComparisonMatches();
    $('add-pair').disabled ||= !selectedComparisonMatches();
    $('comparison-download').disabled ||= !comparison;
    $('open-comparison').disabled ||= !sha($('comparison-id').value);
    for (const id of ['report-html','report-csv','report-json','operating-source','export','organisation-open']) $(id).disabled ||= !plan;
    $('correction-load').disabled ||= !plan?.review;
    $('correction-file').disabled ||= !plan?.review;
    $('revise').disabled ||= !pending?.rejected || !pending?.checkedNotRecorded || pending.route === 'receive';
    $('keep-rejected-packet').disabled ||= !(pending?.route === 'receive' && pending?.rejected);
    $('continue').disabled ||= !!pending?.rejected && pending.route !== 'receive';
    $('download-pending').disabled ||= !pending;
    $('download-restored').disabled ||= !restored;
    $('import-file').disabled = inactive || (!!pending && pending.route !== 'receive');
    $('import').disabled ||= !receiveFile;
    if (pending?.route === 'receive') $('continue').disabled ||= !receiveFile;
    $('panel').querySelectorAll('.ide-review-usable').forEach(option => { if (option.dataset.ideAllowed !== 'true') option.disabled=true; });
  }
  function resetVisible() {
    if (queue) queue.stopRequested=true;
    queue=null; localBusy=false; pending=null; restored=null; restoredKey=null; catalogue={plans:[],organisationPlans:[],activeRequests:[]};
    plan=null; planHistory=[]; rows=[]; rowsById=new Map(); sourcePage={rows:[],offset:0,total:0,snapshot:null,selection:null};
    sourceRows=new Map(); selectedSourceRows=new Set(); sourceHistory=[]; sourceDetail=null; selectedRowId=null; selectedDetail=null;
    evidenceOffset=0; reviewOffset=0; reviewDraft=new Map(); reviewDirty=false; captureSelection=new Set(); comparison=null;
    comparisonInputs=null; comparisonBefore=[]; comparisonAfter=[]; pairs=[]; knownComparisons=[]; comparisonOffset=0;
    correction=null; receiving=null; receiveFile=null; activeObservation=null; activeTab='selection'; observationCache.clear();
    for (const url of downloadUrls) URL.revokeObjectURL(url); downloadUrls.clear();
    if (!mounted) return;
    $('panel').querySelectorAll('input,textarea,select').forEach(el => {
      if (el.type === 'checkbox') el.checked=false;
      else if (el.tagName === 'SELECT') el.value='';
      else el.value='';
    });
    $('source-view').value='source'; $('pairing-mode').value='automatic';
    $('max-bytes').value='16777216'; $('timeout').value='60'; $('connect-timeout').value='10'; $('redirects').value='5';
    for (const id of ['org-revision','plan-revision','before-revision','after-revision','pair-before','pair-after']) options($(id),[],'','Choose an exact saved record');
    for (const id of ['message','detail','source-detail','last-result-detail','download-state','receiving-state']) empty($(id));
    renderAll();
  }
  function clear() {
    if (workspaceKey && mounted) {
      const old=workspaceKey, draft=uiDraft();
      storage('write','ui',draft,old).catch(()=>{});
    }
    if (draftTimer) {clearTimeout(draftTimer);draftTimer=null;}
    workspaceKey=null; epoch++; refreshSerial++; sourceSerial++; planSerial++; detailSerial++; statusSerial++;
    resetVisible(); memory.clear(); buttons();
  }
  async function refresh() {
    mount();
    const serial=++refreshSerial, statusTicket=++statusSerial, currentToken=identity();
    let value;
    try { value=await api.get(BASE+'status'); }
    catch (error) { if (serial===refreshSerial && valid(currentToken)) note('Document evidence catalogue could not refresh: '+error.message,true); return; }
    if (serial!==refreshSerial || statusTicket!==statusSerial) return;
    if (!sha(value.workspaceSha256) || !Array.isArray(value.plans) || !Array.isArray(value.organisationPlans) || !Array.isArray(value.activeRequests)) {
      note('The document-evidence status response has no complete workspace identity.',true); return;
    }
    if (workspaceKey === value.workspaceSha256) {
      catalogue=value; renderCatalogue(); renderSummary(); renderPending(); renderAcquisition(); buttons();
      return;
    }
    if (workspaceKey) {
      const old=workspaceKey,draft=uiDraft();
      await storage('write','ui',draft,old);
      if (serial!==refreshSerial) return;
    }
    if (draftTimer) {clearTimeout(draftTimer);draftTimer=null;}
    epoch++; sourceSerial++; planSerial++; detailSerial++;
    workspaceKey=null; resetVisible(); workspaceKey=value.workspaceSha256; catalogue=value;
    const token=identity();
    renderCatalogue(); buttons();
    const [draft,retained,last]=await Promise.all([storage('read','ui'),storage('read','pending'),storage('read','last-completed')]);
    if (!valid(token) || serial!==refreshSerial) return;
    if (retained && retained.workspace !== workspaceKey) {note('Browser recovery data belongs to a different workspace identity.',true);return;}
    applyDraft(draft); pending=retained||null;
    if (restoredKey) { restored=await storage('read',restoredKey); if (!valid(token)) return; }
    if (retained?.queueId && retained.draft?.queue?.id===retained.queueId && queue?.id!==retained.queueId) queue={...clone(retained.draft.queue),running:false,stopRequested:true};
    if (!retained && !queue && last?.original?.draft?.queue && (!draft?.updatedAt || draft.updatedAt<=last.at)) queue={...clone(last.original.draft.queue),running:false,stopRequested:true};
    renderAll();
    try {
      if (draft?.selectedEvidence) {
        await openPlan(draft.selectedEvidence.id,draft.selectedEvidence.revision,true);
        if (!valid(token)) return;
        const recoveredQueue=queue; applyDraft(draft); if(!queue && recoveredQueue)queue=recoveredQueue; renderAll();
      }
      if (sourcePage.selection && sha(sourcePage.snapshot)) {
        await loadSourcePage(sourcePage.offset||0,true);
        if (!valid(token)) return;
      }
      if (last?.original?.queueId && queue?.id===last.original.queueId && queue.nextIndex<=last.original.queueIndex && !pending) {
        await consumeResult(last.route,last.result,token,last.original);
        if (!valid(token)) return;
      }
      if (queue) {queue.running=false;queue.stopRequested=true;if(queue.nextIndex<queue.groups.length)queue.state='PAUSED_ON_RECONNECT';}
      renderAll(); await persistDraft();
      note(pending ? 'Original action recovered from this workspace’s browser journal. Read its native result before continuing.'
        : queue && queue.nextIndex<queue.groups.length ? 'The original unfinished queue is retained and paused. Continue it explicitly.'
        : 'Document evidence is ready in the original workspace.');
    } catch (error) {
      if (valid(token)) {renderAll();note('The original draft and request are retained. Reopen the selected source when available: '+error.message,true);}
    }
  }
  mount();
  return {refresh,buttons,clear};
};
