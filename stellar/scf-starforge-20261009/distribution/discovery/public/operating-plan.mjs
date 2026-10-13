// MIT. Saved procedures use the same pure operating-plan model as the installed CLI.
import { searchCommandCatalog } from '/catalog.mjs';
import { mountSupportOperatingPlan } from '/support-operating-plan.mjs';
import { mountFredOperatingPlan } from '/fred-operating-plan.mjs';
import { mountGrantTracker } from '/grant-tracker-editor.mjs';
import { isGrantTracker, inspectGrantTracker } from '/grant-tracker-core/grant-tracker.mjs';
import { installGrantReportingEditor } from '/grant-reporting-editor.mjs';
import { inspectOperatingPlan, createOperatingPlan, createOperatingStep, snapshotRegistration,
  operatingPlanDraft, operatingPlanRevision, saveOperatingPlanRevision, forkOperatingPlan, previewOperatingPlanCycle, createOperatingPlanCycle,
  receiveOperatingPlan, compareOperatingPlan, summarizeOperatingPlan, shellArgument,
  renderOperatingPlanMarkdown, renderOperatingPlanHTML,
  createOperatingFile, addOperatingFile, removeOperatingFile, operatingFileBytes, OPERATING_FILE_MAX_BYTES } from '/operating-plan-core.mjs';

import { IATI_OPERATING_SOURCE_SCHEMA, IATI_OPERATING_PROCEDURE_SCHEMA,
  createDocumentOperatingProcedure, inspectDocumentOperatingProcedure,
  receiveDocumentOperatingProcedure } from '/iati/document_evidence/operating_procedure.mjs';

const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const maximumBytes = 32 * 1024 * 1024;
const planFields = ['title', 'customer', 'purpose', 'period', 'owner', 'receiving', 'notes'];
const stepFields = ['title', 'status', 'owner', 'due', 'instruction', 'inputs', 'expectedResult', 'recordedResult'];
const states = { planned: 'Planned', 'in-progress': 'In progress', completed: 'Completed', skipped: 'Skipped' };
const names = { command: 'Command', source: 'Source', feature: 'Runtime group',
  export: 'Package export', application: 'Applications provider', merchant: 'Merchant MCP provider' };
let database, savedPlans = [], catalog, current, draft, rawArguments = {}, selectedStep = '', selectedRevision = null;
let catalogPage = 1, catalogResult, pendingImport, draftTimer, draftQueued = false, busy = false;
let pendingDraftWrites = 0;
let supportController = null, fredController = null, grantTrackerController = null;
let draftWrites = Promise.resolve(), pendingItemId = new URL(location.href).searchParams.get('add');
const sessionId = crypto.randomUUID();
let previousSessionId = null;
try {
  previousSessionId = sessionStorage.getItem('starforge-operating-editor');
  sessionStorage.setItem('starforge-operating-editor', sessionId);
} catch {}
const draftKey = id => id + ':' + sessionId;
const editable = () => current && selectedRevision === null;
const body = () => selectedRevision === null ? draft?.content : operatingPlanRevision(current, selectedRevision);
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
function errorMessage(error) {
  $('plan-error').hidden = !error;
  $('plan-error').textContent = error ? (error.code ? error.code + ': ' : '') + error.message : '';
}
function status(message) { $('plan-status').textContent = message; }
function dateLabel(value) { return new Date(value).toLocaleString(); }
function bytes(value) {
  const result = JSON.stringify(value);
  if (new Blob([result]).size > maximumBytes) throw new TypeError('Keep each plan or working draft within 32 MiB.');
  return result;
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('starforge-operating-plans-v1', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('plans', { keyPath: 'id' });
      const drafts = db.createObjectStore('drafts', { keyPath: 'key' });
      drafts.createIndex('planId', 'planId');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => status('Close another older Operating plans tab to finish opening storage.');
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); errorMessage(new Error('Storage changed. Reopen this page to continue.')); };
      resolve(request.result);
    };
  });
}
function transaction(stores, mode, action) {
  if (!database) return Promise.reject(new Error('Browser storage is unavailable. Reopen the page after enabling site storage.'));
  return new Promise((resolve, reject) => {
    const tx = database.transaction(stores, mode);
    let result, failure;
    const abort = error => { failure = error; try { tx.abort(); } catch {} };
    const capture = value => { result = value; };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('The storage operation was interrupted.'));
    tx.onerror = () => { failure ??= tx.error; };
    try { action(tx, capture, abort); } catch (error) { abort(error); }
  });
}
function readPlan(id) {
  return transaction(['plans'], 'readonly', (tx, done) => {
    tx.objectStore('plans').get(id).onsuccess = event => done(event.target.result ?? null);
  });
}
function readDrafts(id) {
  return transaction(['drafts'], 'readonly', (tx, done) => {
    tx.objectStore('drafts').index('planId').getAll(id).onsuccess = event => done(event.target.result);
  });
}
function recordDraft(key = draftKey(current.id)) {
  return { key, planId: current.id, sessionId, updatedAt: new Date().toISOString(),
    draft: clone(draft), rawArguments: clone(rawArguments),
    ...(cyclePreparation ? { cyclePreparation: clone(cyclePreparation) } : {}) };
}
function writeDraft(record) {
  bytes(record);
  return transaction(['drafts'], 'readwrite', tx => { tx.objectStore('drafts').put(record); });
}
function queueDraft(force = false) {
  if (!editable() && !force) return;
  draftQueued = true;
  $('draft-status').textContent = 'Saving working draft in this browser…';
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { flushDraft().catch(errorMessage); }, 250);
}
async function flushDraft() {
  clearTimeout(draftTimer);
  if (!draftQueued || !current || !draft) return draftWrites;
  const record = recordDraft(); draftQueued = false;
  pendingDraftWrites++;
  const write = draftWrites.catch(() => {}).then(() => writeDraft(record)).finally(() => { pendingDraftWrites--; });
  draftWrites = write;
  try {
    await write;
    if (current?.id === record.planId && !draftQueued)
      $('draft-status').textContent = 'Working draft saved in this browser · based on revision ' +
        record.draft.baseRevision + '. Save a revision to include these edits in the complete plan.';
  } catch (error) {
    if (current?.id === record.planId) draftQueued = true;
    throw error;
  }
}
async function retainWorkingDraft() {
  if (!current || !draft) return;
  await flushDraft();
  await writeDraft(recordDraft(current.id + ':recovery:' + crypto.randomUUID()));
}
async function refreshPlanList() {
  savedPlans = await transaction(['plans'], 'readonly', (tx, done) => {
    tx.objectStore('plans').getAll().onsuccess = event => done(event.target.result);
  });
  savedPlans = savedPlans.map(inspectOperatingPlan);
  savedPlans.sort((left, right) => right.revisions.at(-1).savedAt.localeCompare(left.revisions.at(-1).savedAt));
  renderPlanList();
}
function renderPlanList() {
  const query = $('plan-filter').value.trim().toLowerCase(), parent = $('plan-list');
  parent.replaceChildren();
  for (const plan of savedPlans) {
    const summary = summarizeOperatingPlan(plan);
    if (query && ![summary.title, summary.customer, summary.period, summary.owner].join(' ').toLowerCase().includes(query)) continue;
    const button = node('button', summary.title);
    button.type = 'button'; button.setAttribute('aria-current', String(current?.id === plan.id));
    button.append(node('small', [summary.customer, summary.period].filter(Boolean).join(' · ') || 'Customer and period not entered'),
      node('small', summary.steps + ' steps · revision ' + summary.revision));
    button.addEventListener('click', () => run(() => openPlan(plan.id)));
    parent.append(button);
  }
  if (!parent.children.length) parent.append(node('p', query ? 'No plans match this search.' : 'Create or import the first plan.', 'hint'));
}
async function refreshRecovery() {
  if (!current) return;
  const records = (await readDrafts(current.id)).filter(record => record.key !== draftKey(current.id))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const select = $('recovery-select'); select.replaceChildren();
  for (const record of records) {
    const option = node('option', dateLabel(record.updatedAt) + ' · revision ' + record.draft.baseRevision +
      ' · ' + (record.draft.content.title || 'Untitled draft'));
    option.value = record.key; select.append(option);
  }
  $('draft-recovery').hidden = records.length === 0;
}
async function openPlan(id, { fresh = false } = {}) {
  await flushDraft();
  const plan = await readPlan(id);
  if (!plan) throw new Error('This saved plan is unavailable. Reopen the saved list.');
  const records = await readDrafts(id);
  const ownDraft = records.find(record => record.key === draftKey(id)) ??
    records.find(record => previousSessionId && record.key === id + ':' + previousSessionId);
  if (fresh && ownDraft) await writeDraft({ ...ownDraft, key: id + ':recovery:' + crypto.randomUUID() });
  current = inspectOperatingPlan(plan);
  draft = !fresh && ownDraft ? clone(ownDraft.draft) : operatingPlanDraft(current);
  rawArguments = !fresh && ownDraft ? clone(ownDraft.rawArguments ?? {}) : {};
  cyclePreparation = ownDraft?.cyclePreparation ? clone(ownDraft.cyclePreparation) : null;
  selectedRevision = null; selectedStep = draft.content.steps[0]?.id ?? ''; draftQueued = false;
  const url = new URL(location.href); url.searchParams.set('plan', id); history.replaceState(null, '', url);
  renderEditor(); renderPlanList(); await refreshRecovery();
  const newer = draft.baseRevision !== current.revisions.length;
  status(newer ? 'This retained working draft starts at an earlier revision. Keep it as a copy or open the current saved revision.'
    : 'Opened ' + (draft.content.title || 'operating plan') + ' · revision ' + current.revisions.length + '.');
  $('draft-status').textContent = ownDraft && !fresh
    ? 'Retained working draft · ' + dateLabel(ownDraft.updatedAt) + ' · based on revision ' + draft.baseRevision
    : 'Editing from saved revision ' + current.revisions.length + '.';
  if (pendingItemId && catalog) showPendingSelection();
}
function renderEditor() {
  $('empty-plan').hidden = Boolean(current); $('plan-editor').hidden = !current;
  supportController?.update(); fredController?.update(); grantTrackerController?.update();
  if (!current) return;
  const content = body(), editing = editable();
  $('plan-heading').textContent = content.title || 'Untitled operating plan';
  $('plan-identity').textContent = current.id + ' · ' + current.revisions.length + ' saved revisions';
  const revisions = $('plan-revision'); revisions.replaceChildren();
  const working = node('option', 'Working draft · from revision ' + draft.baseRevision); working.value = 'draft'; revisions.append(working);
  for (const revision of [...current.revisions].reverse()) {
    const option = node('option', 'Revision ' + revision.revision + ' · ' + dateLabel(revision.savedAt));
    option.value = String(revision.revision); revisions.append(option);
  }
  revisions.value = selectedRevision === null ? 'draft' : String(selectedRevision);
  $('continue-revision').hidden = editing;
  $('plan-fields').disabled = !editing;
  for (const name of planFields) $(name).value = content[name];
  for (const id of ['save-plan', 'add-manual']) $(id).disabled = !editing;
  $('copy-plan').disabled = busy;
  $('prepare-cycle').disabled = busy || isGrantTracker(current);
  $('add-registration').hidden = !editing;
  $('export-draft').disabled = !draft;
  $('export-comparison').disabled = !catalog;
  renderSteps(); renderStep(); renderCatalog();
}
function renderSteps() {
  const content = body(), parent = $('step-list'); parent.replaceChildren();
  if (!content) return;
  content.steps.forEach((step, index) => {
    const row = node('tr'); row.classList.toggle('selected', selectedStep === step.id);
    const cell = node('td'), button = node('button', step.title || 'Untitled step', 'result-name');
    button.type = 'button'; button.addEventListener('click', () => { selectedStep = step.id; renderSteps(); renderStep(); });
    cell.append(button, node('small', step.selection?.item.id ?? 'Manual procedure'));
    row.append(node('td', String(index + 1)), cell, node('td', states[step.status] ?? step.status),
      node('td', [step.owner, step.due].filter(Boolean).join(' · ') || '—'));
    parent.append(row);
  });
  if (!content.steps.length) {
    const row = node('tr'), cell = node('td', 'Add the work in its operating order.', 'empty'); cell.colSpan = 4; row.append(cell); parent.append(row);
  }
}
function selected() { return body()?.steps.find(step => step.id === selectedStep); }
function renderCommand(step) {
  const raw = rawArguments[step.id] ?? JSON.stringify(step.argv, null, 2);
  let argv;
  try {
    argv = selectedRevision === null ? JSON.parse(raw) : step.argv;
    if (!Array.isArray(argv) || argv.length > 256 || !argv.every(value => typeof value === 'string'))
      throw new TypeError('Use a JSON array of at most 256 text arguments.');
    $('command-preview').textContent = argv.length ? argv.map(shellArgument).join(' ') : 'No command arguments selected.';
    $('argv-error').hidden = true; $('argv-error').textContent = '';
    $('copy-command').disabled = !argv.length;
  } catch (error) {
    $('argv-error').hidden = false; $('argv-error').textContent = error.message;
    $('command-preview').textContent = 'Correct the argument array to use this command.';
    $('copy-command').disabled = true;
  }
}
function renderRegistration(step) {
  const original = step.selection;
  $('registration-detail').hidden = !original;
  $('registration-json').textContent = original ? JSON.stringify(original, null, 2) : '';
  $('update-registration').hidden = true;
  if (!original) { $('registration-status').textContent = 'Manual step.'; return; }
  if (!catalog) { $('registration-status').textContent = 'Original registration retained. Refresh the toolkit to compare.'; return; }
  try {
    const comparisonPlan = createOperatingPlan({ id: 'registration-comparison', title: 'Selected registration',
      steps: [createOperatingStep({ id: step.id, selection: original })] });
    const change = compareOperatingPlan(comparisonPlan, catalog).steps[0];
    $('registration-status').textContent = change.status === 'missing'
      ? 'This original registration is absent from the currently selected toolkit.'
      : change.status === 'changed'
        ? 'Current source changed: ' + change.changedFields.join(', ') + '.'
        : 'Registration matches the current source.' + (change.packageChanged ? ' The selected package identity changed.' : '');
    $('update-registration').hidden = !editable() || change.status === 'missing' ||
      (change.status === 'unchanged' && !change.packageChanged);
  } catch (error) { $('registration-status').textContent = error.message; }
}
function renderStep() {
  const step = selected(); $('step-editor').hidden = !step;
  if (!step) return;
  const position = body().steps.findIndex(item => item.id === step.id), editing = editable();
  $('step-heading').textContent = 'Step ' + (position + 1) + ' · ' + (step.title || 'Untitled step');
  $('step-fields').disabled = !editing;
  for (const name of stepFields) $('step-' + name).value = step[name];
  $('step-argv').value = selectedRevision === null && Object.hasOwn(rawArguments, step.id)
    ? rawArguments[step.id] : JSON.stringify(step.argv, null, 2);
  $('step-up').disabled = !editing || position === 0;
  $('step-down').disabled = !editing || position === body().steps.length - 1;
  $('step-remove').disabled = !editing;
  renderCommand(step); renderRegistration(step); renderOperatingFiles();
}

function downloadOperatingFile(file) {
  const url = URL.createObjectURL(new Blob([operatingFileBytes(file)], { type: 'application/octet-stream' }));
  const link = node('a'); link.href = url; link.download = file.name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function renderOperatingFiles() {
  const list = $('step-file-list'), step = selected();
  list.replaceChildren();
  $('step-file-add').disabled = !editable();
  const files = step?.files ?? [];
  $('step-file-summary').textContent = files.length + ' complete files · ' +
    files.reduce((total, file) => total + file.bytes, 0).toLocaleString() +
    ' original bytes. Save a revision to include current file changes in the complete customer handover.';
  for (const file of files) {
    const row = node('section', undefined, 'card');
    row.append(node('h4', file.name), node('p', file.bytes.toLocaleString() + ' bytes · ' + file.mediaType, 'hint'));
    const note = node('textarea'); note.value = file.note; note.rows = 2; note.maxLength = 32000;
    note.setAttribute('aria-label', 'Receiving note for ' + file.name); note.disabled = !editable();
    note.addEventListener('input', () => {
      if (!editable()) return;
      const saved = selected()?.files?.find(item => item.id === file.id);
      if (saved) { saved.note = note.value; queueDraft(); }
    });
    const actions = node('div', undefined, 'actions'), get = node('button', 'Download original file');
    get.type = 'button'; get.addEventListener('click', () => run(() => downloadOperatingFile(file)));
    const remove = node('button', 'Remove from this draft'); remove.type = 'button'; remove.disabled = !editable();
    remove.addEventListener('click', () => run(async () => {
      if (!editable()) return;
      const target = selected(); if (!target) return;
      const next = removeOperatingFile(draft, target.id, file.id);
      await retainWorkingDraft(); draft = next; queueDraft(); renderOperatingFiles(); await refreshRecovery();
      status('Removed ' + file.name + ' from the working draft. Its previous complete copy remains in retained work and saved revisions.');
    }));
    actions.append(get, remove); row.append(note, actions); list.append(row);
  }
}

function renderCatalog() {
  const parent = $('catalog-results'); parent.replaceChildren();
  if (!catalog) { $('catalog-status').textContent = 'Refresh the source to select original registrations.'; return; }
  try {
    catalogResult = searchCommandCatalog(catalog, { query: $('catalog-query').value,
      kind: $('catalog-kind').value, page: catalogPage, pageSize: 8 });
    catalogPage = catalogResult.page;
    for (const item of catalogResult.items) {
      const card = node('article', undefined, 'catalog-card');
      card.append(node('strong', item.name), node('small', names[item.kind] + ' · ' + item.sourceIds.join(', ')), node('p', item.description));
      const actions = node('div', undefined, 'actions'), add = node('button', 'Add step'), inspect = node('a', 'Inspect source');
      add.type = 'button'; add.disabled = !editable();
      add.addEventListener('click', () => run(() => addRegistration(item.id)));
      inspect.href = '/#' + encodeURIComponent(item.id); inspect.target = '_blank'; inspect.rel = 'noopener';
      actions.append(add, inspect); card.append(actions); parent.append(card);
    }
    $('catalog-status').textContent = catalogResult.total + ' matching registrations';
    $('catalog-page').textContent = 'Page ' + catalogResult.page + ' of ' + catalogResult.pages;
    $('catalog-previous').disabled = catalogPage <= 1; $('catalog-next').disabled = catalogPage >= catalogResult.pages;
  } catch (error) { $('catalog-status').textContent = error.message; $('catalog-previous').disabled = true; $('catalog-next').disabled = true; }
}
function showPendingSelection() {
  if (!pendingItemId) return;
  const item = catalog?.items.find(value => value.id === pendingItemId);
  const message = item ? 'Selected from Command finder: ' + item.name + '. Open a plan to add this registration.'
    : 'The selected Command finder registration is absent from this toolkit.';
  $('pending-registration').hidden = false; $('pending-registration').textContent = message;
  if (current && item) {
    $('catalog-query').value = item.name; $('catalog-kind').value = item.kind; catalogPage = 1; renderCatalog();
    status('Selected from Command finder: ' + item.name + '. Choose Add step in this plan.');
  }
}
async function refreshCatalog() {
  $('refresh-catalog').disabled = true;
  try {
    const response = await fetch('/api/catalog', { cache: 'no-store' }), value = await response.json();
    if (!response.ok) throw new Error(value.error ?? response.statusText);
    catalog = value; supportController?.update(); fredController?.update(); $('package').textContent = catalog.package.name + ' · ' + catalog.package.version;
    $('catalog-count').textContent = catalog.items.length + ' registrations · ' + (catalog.package.sourceSelection?.title ?? 'Selected toolkit');
    renderCatalog(); if (selected()) renderRegistration(selected());
    $('export-comparison').disabled = !current; showPendingSelection();
  } finally { $('refresh-catalog').disabled = false; }
}
function assertDraftReady() {
  if (!draft) throw new Error('Open an operating plan first.');
  for (const step of draft.content.steps) {
    if (Object.hasOwn(rawArguments, step.id)) {
      let argv; try { argv = JSON.parse(rawArguments[step.id]); } catch {
        throw new TypeError('Correct the command argument array in ' + (step.title || 'the selected step') + '.');
      }
      if (!Array.isArray(argv) || !argv.every(value => typeof value === 'string'))
        throw new TypeError('Command arguments in ' + step.title + ' must be a JSON array of text values.');
      step.argv = argv;
    }
  }
}
async function addRegistration(itemId) {
  if (!editable()) throw new Error('Open a working draft before adding a step.');
  const step = createOperatingStep({ id: crypto.randomUUID(), selection: snapshotRegistration(catalog, itemId) });
  if (draft.content.steps.length >= 1000) throw new Error('An operating plan can contain up to 1,000 steps.');
  draft.content.steps.push(step); selectedStep = step.id;
  if (pendingItemId === itemId) {
    pendingItemId = null; const url = new URL(location.href); url.searchParams.delete('add'); history.replaceState(null, '', url);
  }
  queueDraft(); renderSteps(); renderStep();
  $('step-editor').scrollIntoView({ block: 'nearest' });
  status('Added ' + step.title + ' with its original registration and declared runtime.');
}
async function savePlan() {
  if (!editable()) return;
  assertDraftReady(); await flushDraft();
  const editableDraft = clone(draft);
  const originalForGrant = isGrantTracker(current) ? clone(current) : null;
  const preparedGrant = originalForGrant ? completePlanCapacity(saveOperatingPlanRevision(originalForGrant, editableDraft)) : null;
  if (preparedGrant) await inspectGrantTracker(preparedGrant);
  const saved = await transaction(['plans', 'drafts'], 'readwrite', (tx, done, abort) => {
    const plans = tx.objectStore('plans'), request = plans.get(current.id);
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error('The original saved plan is unavailable.');
        if (originalForGrant && JSON.stringify(request.result) !== JSON.stringify(originalForGrant))
          throw new Error('The saved grant plan advanced. Your complete working draft remains retained.');
        const next = preparedGrant ?? completePlanCapacity(saveOperatingPlanRevision(request.result, editableDraft)); bytes(next);
        plans.put(next); tx.objectStore('drafts').delete(draftKey(next.id)); done(next);
      } catch (error) { abort(error); }
    };
  });
  current = saved; draft = operatingPlanDraft(saved); rawArguments = {}; draftQueued = false;
  if (cyclePreparation) { queueDraft(true); await flushDraft(); }
  await refreshPlanList(); renderEditor(); await refreshRecovery();
  $('draft-status').textContent = 'Revision ' + saved.revisions.length + ' saved · ' + dateLabel(saved.revisions.at(-1).savedAt);
  status('Saved ' + saved.revisions.at(-1).title + ' · revision ' + saved.revisions.length + '.');
  broadcast?.postMessage({ id: saved.id, revision: saved.revisions.length });
}
async function addPlan(plan) {
  const saved = inspectOperatingPlan(plan); bytes(saved);
  if (isGrantTracker(saved)) await inspectGrantTracker(saved);
  await transaction(['plans'], 'readwrite', tx => { tx.objectStore('plans').add(saved); });
  await refreshPlanList(); await openPlan(saved.id);
  broadcast?.postMessage({ id: saved.id, revision: saved.revisions.length });
}
async function saveCopy() {
  await flushDraft();
  const selectedDraft = selectedRevision === null ? draft : operatingPlanDraft(current, selectedRevision);
  if (selectedRevision === null) assertDraftReady();
  const copied = forkOperatingPlan(current, { id: crypto.randomUUID(), draft: selectedDraft,
    title: (selectedDraft.content.title || 'Operating plan').slice(0, 293) + ' (copy)' });
  await addPlan(copied);
  status('Saved an independent plan with the complete original history and selected content.');
}
async function receivePlan(incoming, { fresh = false } = {}) {
  const candidate = inspectOperatingPlan(incoming); bytes(candidate);
  if (isGrantTracker(candidate)) await inspectGrantTracker(candidate);
  const received = await transaction(['plans'], 'readwrite', (tx, done, abort) => {
    const plans = tx.objectStore('plans'), request = plans.get(candidate.id);
    request.onsuccess = () => {
      try {
        const result = receiveOperatingPlan(candidate, request.result ?? null);
        bytes(result.plan); plans.put(result.plan); done(result);
      } catch (error) { abort(error); }
    };
  });
  pendingImport = null; $('import-conflict').hidden = true;
  await refreshPlanList(); await openPlan(received.plan.id, { fresh });
  status(received.reused ? 'The saved plan already contains every incoming revision.'
    : 'Imported the complete plan · ' + received.addedRevisions + ' received revisions.');
  broadcast?.postMessage({ id: received.plan.id, revision: received.plan.revisions.length });
}
async function readProcedureFile(file) {
  if (!file || file.size > 64 * 1024 * 1024) throw new TypeError('Choose one complete JSON file up to 64 MiB.');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()));
}
function completePlanCapacity(plan) {
  if (new TextEncoder().encode(JSON.stringify(plan, null, 2) + '\n').length > maximumBytes)
    throw new TypeError('The complete editable plan exceeds the existing 32 MiB plan capacity.');
  return plan;
}
function completeProcedureCapacity(bundle) {
  completePlanCapacity(bundle.plan);
  if (new TextEncoder().encode(JSON.stringify(bundle, null, 2) + '\n').length > 64 * 1024 * 1024)
    throw new TypeError('The complete IATI procedure package exceeds the 64 MiB file capacity.');
  return bundle;
}
async function importFile(file) {
  if (!file) return;
  const value = await readProcedureFile(file);
  if (value?.schema === IATI_OPERATING_SOURCE_SCHEMA) {
    if (!catalog) await refreshCatalog();
    if (!catalog) throw new Error('Load the installed toolkit catalog before creating a customer procedure.');
    const bundle = completeProcedureCapacity(createDocumentOperatingProcedure(value, catalog, { id: crypto.randomUUID() }));
    await flushDraft();
    await receivePlan(bundle.plan);
    download(bundle, 'iati-procedure-' + bundle.plan.id + '.json');
    status('Created the IATI procedure and downloaded its complete source package. Add the customer, period and receiving details, then save a revision.');
    return;
  }
  const incoming = value?.schema === IATI_OPERATING_PROCEDURE_SCHEMA
    ? inspectDocumentOperatingProcedure(value).plan : inspectOperatingPlan(value);
  completePlanCapacity(incoming);
  await flushDraft();
  try { await receivePlan(incoming); } catch (error) {
    if (!['PLAN_ORIGIN_CONFLICT', 'PLAN_HISTORY_DIVERGED'].includes(error.code)) throw error;
    pendingImport = incoming; $('import-conflict').hidden = false;
    $('import-explanation').textContent = error.message + ' Keep the incoming complete history under its own plan ID.';
  }
}
function download(value, filename, type = 'application/json') {
  const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([content], { type })), link = node('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function exportPlan(format) {
  const revision = selectedRevision ?? current.revisions.length;
  const stem = 'operating-plan-' + current.id;
  if (format === 'json') download(current, stem + '.json');
  else if (format === 'draft') {
    assertDraftReady(); saveOperatingPlanRevision(current, { ...draft, baseRevision: current.revisions.length });
    download(draft, stem + '-draft.json');
  } else if (format === 'markdown') download(renderOperatingPlanMarkdown(current, { revision }), stem + '-r' + revision + '.md', 'text/markdown');
  else if (format === 'html') download(renderOperatingPlanHTML(current, { revision }), stem + '-r' + revision + '.html', 'text/html');
  else if (format === 'comparison') download(compareOperatingPlan(current, catalog, { revision }), stem + '-r' + revision + '-source-comparison.json');
  status(format === 'draft' ? 'Downloaded the working draft.' : 'Downloaded saved plan material from revision ' + revision + '.');
}
async function run(action, { propagate = false } = {}) {
  if (busy) {
    if (propagate) throw new Error('Finish the current operating-plan action before opening the reporting plan.');
    return;
  }
  busy = true; document.querySelector('main').inert = true; errorMessage(null);
  try { return await action(); } catch (error) { errorMessage(error); if (propagate) throw error; }
  finally { busy = false; document.querySelector('main').inert = false; if (current) { $('save-plan').disabled = !editable(); $('copy-plan').disabled = false; } }
}



// Cycle preparation belongs to this editor's existing per-session working record.
let cyclePreparation = null, cycleSource = null, cyclePreview = null, cyclePlan = null;
const CYCLE_PREPARATION_SCHEMA = 'stellar-forge.operating-plan-cycle-preparation.v1';
const cycleFields = ['revision', 'title', 'period', 'datePolicy', 'shiftFrom', 'shiftTo'];
function cycleError(error) {
  $('cycle-error').hidden = !error;
  $('cycle-error').textContent = error ? (error.code ? error.code + ': ' : '') + error.message : '';
}
function cycleOptions() {
  return { revision: Number(cyclePreparation.revision), title: cyclePreparation.title,
    period: cyclePreparation.period, datePolicy: cyclePreparation.datePolicy,
    ...(cyclePreparation.datePolicy === 'shift' ? { shiftFrom: cyclePreparation.shiftFrom, shiftTo: cyclePreparation.shiftTo } : {}),
    referenceFiles: clone(cyclePreparation.referenceFiles) };
}
function changedCycle() {
  cyclePreview = null; cyclePlan = null; $('cycle-preview').hidden = true;
  delete cyclePreparation.createdId;
  $('cycle-created').hidden = true;
  queueDraft(true);
  $('cycle-storage').textContent = 'Saving preparation with this browser working draft…';
}
function renderCycleFiles() {
  const parent = $('cycle-files'); parent.replaceChildren();
  const revision = operatingPlanRevision(cycleSource, Number(cyclePreparation.revision));
  let count = 0;
  for (const step of revision.steps) {
    if (!step.files?.length) continue;
    const group = node('section', undefined, 'cycle-file-group'); group.append(node('h4', step.title));
    for (const file of step.files) {
      count++;
      const row = node('div', undefined, 'cycle-file-row'), label = node('label');
      const input = node('input'); input.type = 'checkbox';
      input.checked = cyclePreparation.referenceFiles.some(ref => ref.stepId === step.id && ref.fileId === file.id);
      input.addEventListener('change', () => {
        const remaining = cyclePreparation.referenceFiles.filter(ref => ref.stepId !== step.id || ref.fileId !== file.id);
        cyclePreparation.referenceFiles = input.checked ? [...remaining, { stepId: step.id, fileId: file.id }] : remaining;
        changedCycle();
      });
      label.append(input, node('span', file.name + ' · ' + file.bytes.toLocaleString() + ' bytes · ' + file.mediaType));
      const get = node('button', 'Download original'); get.type = 'button'; get.dataset.cycleAction = '';
      get.addEventListener('click', () => cycleRun(() => downloadOperatingFile(file)));
      row.append(label, get); group.append(row);
      if (file.note) group.append(node('p', file.note, 'hint'));
    }
    parent.append(group);
  }
  if (!count) parent.append(node('p', 'No result files in this saved source revision.', 'hint'));
}
function renderCycleForm() {
  const select = $('cycle-revision'); select.replaceChildren();
  for (const revision of [...cycleSource.revisions].reverse()) {
    const option = node('option', 'Revision ' + revision.revision + ' · ' + revision.title + ' · ' + dateLabel(revision.savedAt));
    option.value = String(revision.revision); select.append(option);
  }
  for (const field of cycleFields) $('cycle-' + field).value = cyclePreparation[field];
  const shift = cyclePreparation.datePolicy === 'shift';
  $('cycle-from-field').hidden = !shift; $('cycle-to-field').hidden = !shift;
  $('cycle-shiftFrom').required = shift; $('cycle-shiftTo').required = shift;
  $('cycle-source').textContent = cycleSource.id + ' · complete history of ' + cycleSource.revisions.length + ' saved revisions';
  renderCycleFiles();
}
async function openCycle() {
  if (!current) throw new Error('Open a saved operating plan first.');
  if (isGrantTracker(current)) throw new Error('Use the Grant tracker’s original preparation for a new programme or period. Its retained grant decisions stay with that case.');
  await flushDraft();
  cycleSource = inspectOperatingPlan(await readPlan(current.id));
  if (!cyclePreparation) {
    const revision = selectedRevision ?? current.revisions.length;
    const source = operatingPlanRevision(cycleSource, revision);
    cyclePreparation = { revision: String(revision), title: (source.title.slice(0, 286) + ' · next cycle'),
      period: '', datePolicy: 'clear', shiftFrom: '', shiftTo: '', referenceFiles: [] };
  }
  cyclePreview = null; cyclePlan = null; cycleError(null); $('cycle-preview').hidden = true;
  renderCycleForm();
  $('cycle-created').hidden = !cyclePreparation.createdId;
  queueDraft(true); await flushDraft();
  $('cycle-storage').textContent = 'Preparation retained in this browser. Download its complete JSON to transfer unfinished work.';
  $('cycle-dialog').showModal();
}
async function cycleRun(action) {
  if (busy) return;
  $('cycle-fields').disabled = true;
  for (const button of $('cycle-dialog').querySelectorAll('[data-cycle-action]')) button.disabled = true;
  cycleError(null);
  try { await run(action, { propagate: true }); }
  catch (error) { cycleError(error); }
  finally {
    $('cycle-fields').disabled = false;
    for (const button of $('cycle-dialog').querySelectorAll('[data-cycle-action]')) button.disabled = false;
  }
}
async function previewCycle() {
  if (cyclePreparation.createdId && await readPlan(cyclePreparation.createdId))
    throw new Error('This preparation already created a cycle. Open that saved plan, or change the new-period fields to prepare another.');
  await flushDraft();
  cyclePreview = previewOperatingPlanCycle(cycleSource, cycleOptions());
  cyclePlan = completePlanCapacity(createOperatingPlanCycle(cycleSource, { ...cycleOptions(), id: crypto.randomUUID() }));
  const parent = $('cycle-steps'); parent.replaceChildren();
  for (const step of cyclePreview.steps) {
    const row = node('tr'), work = node('td');
    work.append(node('strong', step.title), node('small', step.owner || 'Owner not entered'));
    row.append(work, node('td', step.previousDue || 'Undated'), node('td', step.due || 'Undated'),
      node('td', step.referenceFiles.map(file => file.name).join('\n') || 'None'));
    parent.append(row);
  }
  if (!cyclePreview.steps.length) {
    const row = node('tr'), cell = node('td', 'No steps in the selected saved revision. Add work after creating the cycle.');
    cell.colSpan = 4; row.append(cell); parent.append(row);
  }
  $('cycle-preview-summary').textContent = cyclePreview.content.title + ' · ' + cyclePreview.content.period +
    ' · source revision ' + cyclePreview.source.revision + ' of ' + cyclePreview.source.historyRevisions +
    ' · ' + cyclePreview.steps.length + ' planned steps · ' +
    (cyclePreview.datePolicy === 'shift' ? 'dated steps shifted ' + cyclePreview.shiftDays + ' days'
      : cyclePreview.datePolicy === 'keep' ? 'exact original dates retained' : 'due dates cleared') +
    '. All previous results remain in the retained history.';
  $('cycle-preview').hidden = false;
  $('cycle-preview').scrollIntoView({ block: 'nearest' });
}
async function createCycle() {
  if (!cyclePlan || !cyclePreview) throw new Error('Preview the current preparation before creating its cycle.');
  const sourceId = cycleSource.id, sourceBody = JSON.stringify(cycleSource), result = clone(cyclePlan);
  await retainWorkingDraft();
  const preparedRecord = recordDraft();
  preparedRecord.cyclePreparation.createdId = result.id;
  await transaction(['plans', 'drafts'], 'readwrite', (tx, done, abort) => {
    const plans = tx.objectStore('plans');
    plans.get(sourceId).onsuccess = event => {
      try {
        if (JSON.stringify(event.target.result) !== sourceBody)
          throw new Error('The original saved history advanced. Close and reopen preparation to preview its current complete history. Your choices remain saved.');
        plans.get(result.id).onsuccess = existing => {
          if (existing.target.result && JSON.stringify(existing.target.result) !== JSON.stringify(result)) {
            abort(new Error('The prepared cycle identity already contains different work. Preview again to keep both complete plans.')); return;
          }
          if (!existing.target.result) plans.add(result);
          tx.objectStore('drafts').put(preparedRecord);
          done(result);
        };
      } catch (error) { abort(error); }
    };
  });
  cyclePreparation.createdId = result.id;
  $('cycle-dialog').close();
  await refreshPlanList(); await openPlan(result.id);
  broadcast?.postMessage({ id: result.id, revision: result.revisions.length });
  status('Created the next cycle with planned work and the complete original history. Review the period-specific inputs, paths and instructions before running its operations.');
}
function validateCyclePreparation(value) {
  if (!value || value.schema !== CYCLE_PREPARATION_SCHEMA || !value.preparation ||
      typeof value.preparation !== 'object' || Array.isArray(value.preparation))
    throw new TypeError('Open a complete operating-cycle preparation JSON.');
  const source = inspectOperatingPlan(value.source), settings = value.preparation;
  if (!cycleFields.every(field => typeof settings[field] === 'string') ||
      settings.title.length > 300 || settings.period.length > 1000 ||
      !['clear', 'keep', 'shift'].includes(settings.datePolicy) ||
      settings.shiftFrom.length > 10 || settings.shiftTo.length > 10 ||
      !Array.isArray(settings.referenceFiles))
    throw new TypeError('The retained cycle fields are incomplete.');
  operatingPlanRevision(source, Number(settings.revision));
  // Validate reference identities and presence while retaining incomplete title/date entry.
  previewOperatingPlanCycle(source, { revision: Number(settings.revision), title: settings.title.trim() ? settings.title : 'Unfinished cycle',
    period: settings.period.trim() ? settings.period : 'Unfinished period', datePolicy: 'clear', referenceFiles: settings.referenceFiles });
  return { source, preparation: Object.fromEntries([...cycleFields, 'referenceFiles'].map(key => [key, clone(settings[key])])) };
}
$('prepare-cycle').addEventListener('click', () => run(openCycle));
for (const field of cycleFields) $('cycle-' + field).addEventListener('input', () => {
  if (!cyclePreparation || busy) return;
  cyclePreparation[field] = $('cycle-' + field).value;
  if (field === 'revision') cyclePreparation.referenceFiles = [];
  changedCycle();
  if (field === 'revision' || field === 'datePolicy') renderCycleForm();
});
$('cycle-form').addEventListener('submit', event => { event.preventDefault(); cycleRun(previewCycle); });
$('cycle-create').addEventListener('click', () => cycleRun(createCycle));
$('cycle-open-created').addEventListener('click', () => cycleRun(async () => {
  const id = cyclePreparation?.createdId;
  if (!id || !await readPlan(id)) throw new Error('The created cycle is unavailable in this browser. Reopen its complete exported JSON.');
  await flushDraft(); $('cycle-dialog').close(); await openPlan(id);
}));
$('cycle-close').addEventListener('click', () => cycleRun(async () => { await flushDraft(); $('cycle-dialog').close(); }));
$('cycle-dialog').addEventListener('cancel', event => {
  event.preventDefault(); if (!busy) cycleRun(async () => { await flushDraft(); $('cycle-dialog').close(); });
});
$('cycle-export-json').addEventListener('click', () => cycleRun(() => {
  if (!cyclePlan) throw new Error('Preview the current preparation first.');
  download(cyclePlan, 'operating-cycle-' + cyclePlan.id + '.json');
}));
$('cycle-export-html').addEventListener('click', () => cycleRun(() => {
  if (!cyclePlan) throw new Error('Preview the current preparation first.');
  download(renderOperatingPlanHTML(cyclePlan), 'operating-cycle-' + cyclePlan.id + '.html', 'text/html');
}));
$('cycle-export-preparation').addEventListener('click', () => cycleRun(async () => {
  await flushDraft();
  const value = { schema: CYCLE_PREPARATION_SCHEMA, source: cycleSource, preparation: cyclePreparation };
  const encoded = JSON.stringify(value, null, 2) + '\n';
  if (new Blob([encoded]).size > maximumBytes) throw new Error('The complete preparation JSON exceeds 32 MiB. Keep the saved source and browser preparation; choose a smaller complete source history for transfer.');
  download(encoded, 'operating-cycle-preparation-' + cycleSource.id + '.json');
}));
$('cycle-import-preparation').addEventListener('click', () => {
  if (busy) return; $('cycle-preparation-file').value = ''; $('cycle-preparation-file').click();
});
$('cycle-preparation-file').addEventListener('change', () => cycleRun(async () => {
  const file = $('cycle-preparation-file').files[0]; if (!file) return;
  if (file.size > maximumBytes) throw new Error('Keep the complete preparation within 32 MiB.');
  const imported = validateCyclePreparation(JSON.parse(await file.text()));
  if (isGrantTracker(imported.source)) throw new Error('Use the original Grant tracker preparation for this source.');
  await retainWorkingDraft(); await receivePlan(imported.source);
  cyclePreparation = imported.preparation; cycleSource = inspectOperatingPlan(await readPlan(current.id));
  changedCycle(); renderCycleForm(); await flushDraft();
  $('cycle-storage').textContent = 'Opened the complete source and unfinished preparation; prior local working drafts remain retained.';
}));

const operatingFileSection = node('section', undefined, 'handover-section');
operatingFileSection.setAttribute('aria-labelledby', 'step-file-heading');
const operatingFileHeading = node('h3', 'Complete result files'); operatingFileHeading.id = 'step-file-heading';
const operatingFileSummary = node('p', '', 'hint'); operatingFileSummary.id = 'step-file-summary';
const operatingFileList = node('div'); operatingFileList.id = 'step-file-list';
const operatingFileAdd = node('button', 'Add result files'); operatingFileAdd.type = 'button'; operatingFileAdd.id = 'step-file-add';
const operatingFileInput = node('input'); operatingFileInput.type = 'file'; operatingFileInput.multiple = true; operatingFileInput.hidden = true;
operatingFileSection.append(operatingFileHeading,
  node('p', 'Keep the actual reports, datasets, images or customer outputs with this step. Complete JSON and HTML carry the original bytes. The complete plan, including saved file history, fits within the existing 32 MiB receiving limit.', 'hint'),
  operatingFileSummary, operatingFileAdd, operatingFileInput, operatingFileList);
$('step-editor').append(operatingFileSection);
operatingFileAdd.addEventListener('click', () => { operatingFileInput.value = ''; operatingFileInput.click(); });
operatingFileInput.addEventListener('change', () => run(async () => {
  if (!editable() || !selected()) return;
  const files = Array.from(operatingFileInput.files ?? []); if (!files.length) return;
  const originalDraft = draft, originalPlanId = current.id, stepId = selected().id;
  let next = draft;
  for (const file of files) {
    if (file.size > OPERATING_FILE_MAX_BYTES) throw new TypeError('Select a complete result file within 24 MiB.');
    const attached = createOperatingFile({ id: crypto.randomUUID(), name: file.name,
      mediaType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    next = addOperatingFile(next, stepId, attached);
  }
  if (!editable() || current.id !== originalPlanId || draft !== originalDraft || selected()?.id !== stepId)
    throw new Error('The selected procedure changed while files were read. Reopen the intended step before adding them.');
  bytes({ ...recordDraft(), draft: next });
  completePlanCapacity(saveOperatingPlanRevision(current, next));
  await retainWorkingDraft(); draft = next; queueDraft(); await flushDraft();
  renderOperatingFiles(); await refreshRecovery();
  status('Retained ' + files.length + ' complete result files in this working step. Save a revision to return them with the customer plan.');
}));

$('new-plan-form').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const title = $('new-title').value.trim();
    await flushDraft(); await addPlan(createOperatingPlan({ id: crypto.randomUUID(), title }));
    $('new-title').value = ''; status('Created ' + title + '. Add its customer, result and ordered work.');
  });
});
$('plan-filter').addEventListener('input', renderPlanList);
$('refresh-catalog').addEventListener('click', () => run(refreshCatalog));
$('export-catalog').addEventListener('click', () => run(async () => {
  if (!catalog) await refreshCatalog();
  if (!catalog) throw new Error('Refresh the selected toolkit catalog before exporting it.');
  download(catalog, 'starforge-toolkit-catalog.json');
  status('Downloaded the complete toolkit catalog with its original source and runtime registrations.');
}));
$('reload-plans').addEventListener('click', () => run(async () => { await flushDraft(); await refreshPlanList(); if (current) await openPlan(current.id); }));
$('save-plan').addEventListener('click', () => run(savePlan));
$('copy-plan').addEventListener('click', () => run(saveCopy));
$('open-current').addEventListener('click', () => run(() => openPlan(current.id, { fresh: true })));
$('plan-revision').addEventListener('change', () => run(async () => {
  await flushDraft(); selectedRevision = $('plan-revision').value === 'draft' ? null : Number($('plan-revision').value);
  selectedStep = body().steps[0]?.id ?? ''; renderEditor();
  $('draft-status').textContent = selectedRevision === null ? 'Working draft · based on revision ' + draft.baseRevision
    : 'Viewing saved revision ' + selectedRevision + '. Continue from it to prepare a new revision.';
}));
$('continue-revision').addEventListener('click', () => run(async () => {
  const revision = selectedRevision; await retainWorkingDraft();
  draft = operatingPlanDraft(current, revision); rawArguments = {}; selectedRevision = null;
  selectedStep = draft.content.steps[0]?.id ?? ''; queueDraft(); renderEditor(); await refreshRecovery();
  status('Continuing revision ' + revision + ' against current saved revision ' + current.revisions.length + '.');
}));
$('recover-draft').addEventListener('click', () => run(async () => {
  const record = (await readDrafts(current.id)).find(value => value.key === $('recovery-select').value);
  if (!record) throw new Error('The selected working draft is unavailable.');
  await retainWorkingDraft();
  draft = clone(record.draft); rawArguments = clone(record.rawArguments ?? {});
  cyclePreparation = record.cyclePreparation ? clone(record.cyclePreparation) : null;
  selectedRevision = null; selectedStep = draft.content.steps[0]?.id ?? '';
  queueDraft(); renderEditor(); await refreshRecovery();
  status('Opened retained work from ' + dateLabel(record.updatedAt) + ' · based on revision ' + draft.baseRevision + '.');
}));
for (const name of planFields) $(name).addEventListener('input', () => {
  if (!editable()) return;
  draft.content[name] = $(name).value; queueDraft();
  if (name === 'title') $('plan-heading').textContent = draft.content.title || 'Untitled operating plan';
});
for (const name of stepFields) $('step-' + name).addEventListener('input', () => {
  if (!editable()) return;
  const step = selected(); if (!step) return;
  step[name] = $('step-' + name).value; queueDraft(); renderSteps();
  if (name === 'title') $('step-heading').textContent = 'Step ' + (body().steps.findIndex(item => item.id === step.id) + 1) + ' · ' + (step.title || 'Untitled step');
});
$('step-argv').addEventListener('input', () => {
  if (!editable()) return;
  const step = selected(); if (!step) return;
  rawArguments[step.id] = $('step-argv').value;
  try { const parsed = JSON.parse(rawArguments[step.id]); if (Array.isArray(parsed) && parsed.every(value => typeof value === 'string')) step.argv = parsed; } catch {}
  queueDraft(); renderCommand(step);
});
$('copy-command').addEventListener('click', () => run(async () => {
  await navigator.clipboard.writeText($('command-preview').textContent); status('Copied the selected command arguments.');
}));
$('add-manual').addEventListener('click', () => run(async () => {
  if (!editable()) return;
  if (draft.content.steps.length >= 1000) throw new Error('An operating plan can contain up to 1,000 steps.');
  const step = createOperatingStep({ id: crypto.randomUUID(), title: 'Manual operating step' });
  draft.content.steps.push(step); selectedStep = step.id; queueDraft(); renderSteps(); renderStep(); $('step-title').focus();
}));
for (const [id, direction] of [['step-up', -1], ['step-down', 1]]) $(id).addEventListener('click', () => run(async () => {
  if (!editable()) return;
  const steps = draft.content.steps, position = steps.findIndex(step => step.id === selectedStep), next = position + direction;
  if (position < 0 || next < 0 || next >= steps.length) return;
  const [step] = steps.splice(position, 1); steps.splice(next, 0, step); queueDraft(); renderSteps(); renderStep();
}));
$('step-remove').addEventListener('click', () => run(async () => {
  if (!editable()) return;
  await retainWorkingDraft();
  const steps = draft.content.steps, index = steps.findIndex(step => step.id === selectedStep);
  if (index < 0) return;
  const [removed] = steps.splice(index, 1); delete rawArguments[removed.id];
  selectedStep = steps[Math.min(index, steps.length - 1)]?.id ?? '';
  queueDraft(); renderSteps(); renderStep(); await refreshRecovery(); status('Removed the step. The previous working draft remains available above.');
}));
$('update-registration').addEventListener('click', () => run(async () => {
  if (!editable()) return;
  const step = selected(); if (!step?.selection) return;
  step.selection = snapshotRegistration(catalog, step.selection.item.id);
  queueDraft(); renderRegistration(step); status('Updated this draft’s registration snapshot. Its entered command arguments and work remain in place.');
}));
$('catalog-search').addEventListener('submit', event => { event.preventDefault(); catalogPage = 1; renderCatalog(); });
$('catalog-kind').addEventListener('change', () => { catalogPage = 1; renderCatalog(); });
$('catalog-previous').addEventListener('click', () => { catalogPage--; renderCatalog(); });
$('catalog-next').addEventListener('click', () => { catalogPage++; renderCatalog(); });
$('import-plan').addEventListener('click', () => { $('import-file').value = ''; $('import-file').click(); });
$('import-file').addEventListener('change', () => run(() => importFile($('import-file').files[0])));
$('cancel-import').addEventListener('click', () => { pendingImport = null; $('import-conflict').hidden = true; });
$('import-copy').addEventListener('click', () => run(async () => {
  if (!pendingImport) return;
  const incoming = pendingImport;
  const copied = forkOperatingPlan(incoming, { id: crypto.randomUUID(),
    title: incoming.revisions.at(-1).title.slice(0, 293) + ' (copy)' });
  await receivePlan(copied);
}));
const iatiPackageFile = node('input');
iatiPackageFile.type = 'file'; iatiPackageFile.accept = '.json,application/json'; iatiPackageFile.hidden = true;
const updateIatiPackage = node('button', 'Update IATI package');
updateIatiPackage.type = 'button';
updateIatiPackage.title = 'Join this saved plan history to its original complete IATI source package';
$('export-json').parentElement.append(updateIatiPackage, iatiPackageFile);
updateIatiPackage.addEventListener('click', () => run(async () => {
  if (!current) throw new Error('Open and save the IATI operating plan first.');
  iatiPackageFile.value = ''; iatiPackageFile.click();
}));
iatiPackageFile.addEventListener('change', () => run(async () => {
  const file = iatiPackageFile.files[0]; if (!file) return;
  if (!current) throw new Error('Open the corresponding saved operating plan.');
  await flushDraft();
  const joined = completeProcedureCapacity(receiveDocumentOperatingProcedure(await readProcedureFile(file), current));
  download(joined, 'iati-procedure-' + joined.plan.id + '-r' + joined.plan.revisions.length + '.json');
  status('Downloaded the complete IATI package with saved plan revision ' + joined.plan.revisions.length + ' and all original case source records.');
}));
for (const format of ['json', 'markdown', 'html', 'draft', 'comparison'])
  $('export-' + format).addEventListener('click', () => run(() => exportPlan(format)));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft().catch(errorMessage); });
window.addEventListener('beforeunload', event => {
  if (draftQueued || pendingDraftWrites || busy) { event.preventDefault(); event.returnValue = ''; }
});
const broadcast = typeof BroadcastChannel === 'function' ? new BroadcastChannel('starforge-operating-plans-v1') : null;
if (broadcast) broadcast.onmessage = event => {
  refreshPlanList().catch(errorMessage);
  if (current?.id === event.data?.id && current.revisions.length < event.data.revision)
    status('Another tab saved revision ' + event.data.revision + '. Your working draft is retained; reopen saved plans before continuing.');
};
supportController = mountSupportOperatingPlan({
  host: $('support-procedure'), getCatalog: () => catalog, getPlan: () => current,
  run, addPlan, receivePlan, retainWorkingDraft,
});
$('show-support-procedure').addEventListener('click', () => supportController.open());
fredController = mountFredOperatingPlan({
  host: $('fred-procedure'), getCatalog: () => catalog, getPlan: () => current,
  run, addPlan, receivePlan, retainWorkingDraft,
});
$('show-fred-procedure').addEventListener('click', () => fredController.open());
function grantContext() {
  let dirty = false;
  if (current && draft && selectedRevision === null) {
    dirty = draft.baseRevision !== current.revisions.length ||
      JSON.stringify(draft.content) !== JSON.stringify(operatingPlanDraft(current).content);
    for (const step of draft.content.steps) {
      if (!Object.hasOwn(rawArguments, step.id)) continue;
      try { if (JSON.stringify(JSON.parse(rawArguments[step.id])) !== JSON.stringify(step.argv)) dirty = true; }
      catch { dirty = true; }
    }
  }
  return { plan: current, revision: selectedRevision, dirty };
}
grantTrackerController = mountGrantTracker({
  host: $('grant-tracker-panel'), getContext: grantContext,
  drafts: { list: readDrafts, put: writeDraft },
  create: plan => run(async () => {
    await retainWorkingDraft();
    await addPlan(plan);
  }, { propagate: true }),
  commit: (candidate, base) => run(async () => {
    const selected = grantContext();
    if (selected.revision !== null || selected.dirty || !selected.plan ||
        JSON.stringify(selected.plan) !== JSON.stringify(base))
      throw new Error('Reopen the unchanged current saved grant revision before recording this work. All working inputs remain retained.');
    await retainWorkingDraft();
    await receivePlan(candidate, { fresh: true });
  }, { propagate: true }),
});
$('show-grant-tracker').addEventListener('click', () => grantTrackerController.open());
await run(async () => {
  database = await openDatabase();
  await refreshPlanList();
  const planId = new URL(location.href).searchParams.get('plan');
  if (planId && savedPlans.some(plan => plan.id === planId)) await openPlan(planId);
  else status(savedPlans.length + ' saved operating plans. Create or open one to continue.');
});
await run(refreshCatalog);

installGrantReportingEditor({
  trigger: $('create-grant-reporting'),
  getCatalog: () => catalog,
  receive: plan => run(async () => {
    if (!database) throw new Error('Reopen Operating plans to restore its saved-plan storage.');
    await flushDraft();
    await receivePlan(plan);
  }, { propagate: true }),
  onStatus: status,
});
