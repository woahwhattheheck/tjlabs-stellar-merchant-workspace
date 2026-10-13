// MIT. Source-bound form release desk on the existing private Central listener.
const $ = id => document.getElementById(id);
const list = value => Array.isArray(value) ? value : [];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const PAGE_SIZE = 20;
const severityLabels = {incompatible: 'Requires revision', review: 'Needs review', compatible: 'Compatible', information: 'Information'};
const actionLabels = {retainCapture: 'Retain published version', retainDraft: 'Retain current Central draft', retainAuthoring: 'Retain compiled candidate', createReview: 'Create comparison'};
const tokenKey = 'central-form-releases-token:' + location.origin;
let token = '', state = null, review = null, draft = null, busy = false, page = 0;
let selectedReviewId = '', storagePrefix = '', intents = {}, suggestedName = '', mustRefreshReview = false;
let filteredChanges = [], searchIndex = new Map(), focusAfterRun = null, sourceCache = new Map();
function focusTarget(element) { if (busy) focusAfterRun = element; else element?.focus(); }

function readStorage(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
function writeStorage(key, value) { try { sessionStorage.setItem(key, value); } catch { /* The open tab retains its current work. */ } }
function removeStorage(key) { try { sessionStorage.removeItem(key); } catch { /* The open tab retains its current work. */ } }
function readJSON(key, fallback) { try { return JSON.parse(readStorage(key) || 'null') ?? fallback; } catch { return fallback; } }
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}
function empty(text) { return node('p', text, 'muted'); }
function replace(id, ...children) { $(id).replaceChildren(...children.filter(Boolean)); }
function display(value) {
  if (value === undefined) return 'Not recorded';
  if (value === null) return 'None';
  return String(value);
}
function versionLabel(value) { return value === '' ? 'Blank version' : value == null ? 'Version not recorded' : 'Version ' + value; }
function human(value) { return String(value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, letter => letter.toUpperCase()); }
function statusLabel(value) { return value ? human(String(value).toLowerCase()) : 'Saved'; }
function dateLabel(value) {
  if (!value) return 'Time not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
  }).format(date) + ' UTC';
}
function originLabel(value) {
  const type = typeof value === 'string' ? value : value?.kind ?? value?.type ?? value?.source;
  if (type && /author|compil/i.test(type)) return 'Compiled candidate';
  if (type && /draft/i.test(type)) return 'Retained Central draft';
  if (type && /captur|publish|central/i.test(type)) return 'Captured form version';
  return type ? human(type) : 'Retained original';
}
function snapshot(id) { return list(state?.snapshots).find(item => item.id === id) ?? null; }
function snapshotLabel(item) {
  if (!item) return 'Source not listed';
  return (item.title || item.form?.formId || item.id) + ' · ' + versionLabel(item.form?.version);
}
function selectedCapture() { return list(state?.captures).find(item => item.id === $('capture-select').value) ?? null; }
function selectedForm() { return list(selectedCapture()?.forms).find(item => item.key === $('form-select').value) ?? null; }
function selectedGeneration() {
  const raw = $('version-select').value;
  return raw === '' ? null : list(selectedForm()?.generations)[Number(raw)] ?? null;
}
function publishedSource(item) { return ['central-capture','central-published'].includes(item?.origin?.kind); }
function publishedSnapshots() { return list(state?.snapshots).filter(publishedSource); }
function selectedDraftBaseline() { const selected = snapshot($('draft-baseline').value); return publishedSource(selected) ? selected : null; }
function selectedAuthoring() { return list(state?.authoringCandidates).find(item => item.id === $('authoring-select').value) ?? null; }
function notice(message, error = false) {
  $('notice').textContent = String(message);
  $('notice').dataset.kind = error ? 'error' : 'status';
}
function applyNavigation() {
  for (const [id, path] of [['field-link', '/'], ['commissioning-link', '/commissioning/'], ['warehouse-link', '/warehouse/']]) {
    $(id).href = path + (token ? '#token=' + encodeURIComponent(token) : '');
    $(id).rel = 'noreferrer';
  }
}
function applyToken(value) {
  token = String(value || '').trim();
  if (token) writeStorage(tokenKey, token);
  applyNavigation();
}
function fillOptions(element, values, prompt, selected = element.value) {
  const placeholder = node('option', prompt);
  placeholder.value = '';
  element.replaceChildren(placeholder);
  for (const item of values) {
    const option = node('option', item.label);
    option.value = String(item.value);
    element.append(option);
  }
  element.value = values.some(item => String(item.value) === String(selected)) ? String(selected) : '';
}
function metric(label, value) {
  const entry = node('div');
  entry.append(node('dt', label), node('dd', value == null ? '—' : value));
  return entry;
}
function facts(entries) {
  const result = node('dl', null, 'facts');
  for (const [label, value] of entries) result.append(node('dt', label), node('dd', display(value)));
  return result;
}
function button(label, callback, className) {
  const element = node('button', label, className);
  element.type = 'button';
  element.addEventListener('click', callback);
  return element;
}
function downloadJSON(value, name) {
  const bytes = new Blob([JSON.stringify(value, null, 2) + '\n'], {type: 'application/json;charset=utf-8'});
  const url = URL.createObjectURL(bytes);
  const link = node('a');
  link.href = url;
  link.download = String(name).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0,180);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function request(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    redirect: 'error', cache: 'no-store', credentials: 'same-origin',
    headers: {Authorization: 'Bearer ' + token, ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  let value;
  try { value = await response.json(); }
  catch { throw Object.assign(new Error('The workspace returned an unreadable response. Refresh saved work to check the request.'), {status: response.status}); }
  if (!response.ok || value?.ok === false) {
    const detail = object(value?.error) ? value.error : {};
    throw Object.assign(new Error(detail.message || 'The workspace request could not finish.'), detail, {status: response.status});
  }
  return object(value) && own(value, 'result') ? value.result : value;
}
async function action(name, body) { return request('/api/form-releases/actions/' + name, body); }
function conflict() { return Boolean(review && draft && Number(draft.expectedRevision) !== Number(review.revision)); }
function draftKey(id) { return storagePrefix + ':draft:' + id; }
function saveDraft() {
  if (!draft || !storagePrefix) return;
  writeStorage(draftKey(draft.reviewId), JSON.stringify(draft));
  if (draft.reviewer.trim()) writeStorage(storagePrefix + ':reviewer', draft.reviewer);
}
function serverMappings(value) {
  const mappings = Object.fromEntries(list(value.reporting?.bindings).filter(item => item?.path && item.table && item.field)
    .map(item => [JSON.stringify([String(item.table), String(item.field)]), String(item.path)]));
  for (const dependency of list(value.reporting?.dependencies)) for (const selector of list(dependency.selectors)) {
    if (selector.system === true || !selector.nativePath || typeof selector.table !== 'string' || typeof selector.field !== 'string') continue;
    const key = JSON.stringify([selector.table,selector.field]);
    if (!own(mappings,key)) mappings[key] = selector.nativePath;
  }
  return mappings;
}
function serverTableMappings(value) {
  const mappings = Object.fromEntries(list(value.reporting?.tableBindings).filter(item => typeof item?.table === 'string' && item.path)
    .map(item => [item.table,String(item.path)]));
  for (const item of list(value.reporting?.tableChoices)) {
    if (item.scope !== 'form' && item.path && !own(mappings,item.table)) mappings[item.table] = item.path;
  }
  return mappings;
}
function newDraft(value, seed) {
  const decisions = {};
  const staff = list(value.history).filter(item => item.kind === 'staff-decision').at(-1);
  for (const item of list(value.decisions)) {
    if (item?.changeId && ['accept', 'remap', 'revise'].includes(item.decision)) {
      decisions[item.changeId] = {decision: item.decision, note: String(item.note || '')};
    }
  }
  return {
    reviewId: value.id, expectedRevision: value.revision, baselineId: value.baselineId, candidateId: value.candidateId,
    decisions, mappings: serverMappings(value), tableMappings: serverTableMappings(value), reviewer: String(seed?.reviewer ?? staff?.reviewer ?? value.approval?.reviewer ?? value.reviewer ?? readStorage(storagePrefix + ':reviewer') ?? ''),
    note: String(seed?.note ?? staff?.note ?? value.approval?.note ?? value.note ?? ''), mappingNote: '', dirty: false, mappingDirty: false,
  };
}
function restoreDraft(value, discard = false, seed) {
  const saved = discard ? null : draft?.reviewId===value.id&&(draft.dirty===true||draft.mappingDirty===true)
    ? draft : readJSON(draftKey(value.id), null);
  if (object(saved) && saved.reviewId === value.id && Number.isInteger(saved.expectedRevision) &&
      object(saved.decisions) && object(saved.mappings) && typeof saved.reviewer === 'string' && typeof saved.note === 'string' &&
      (saved.dirty === true || saved.mappingDirty === true)) {
    draft = {...newDraft(value,seed),...saved,tableMappings:object(saved.tableMappings)?saved.tableMappings:serverTableMappings(value)};
  } else draft = newDraft(value, seed);
  saveDraft();
}
function rememberIntent(record) {
  intents[record.key] = record;
  writeStorage(storagePrefix + ':requests', JSON.stringify(intents));
  renderPending();
}
function removeIntent(key) {
  delete intents[key];
  writeStorage(storagePrefix + ':requests', JSON.stringify(intents));
  renderPending();
}
function createIntent(name, fields, description, role) {
  const key = JSON.stringify([name, fields]);
  if (object(intents[key]) && intents[key].action === name && object(intents[key].body)) return intents[key];
  const intent = {key, action: name, body: {id: (name === 'createReview' ? 'review-' : 'source-') + crypto.randomUUID(), ...fields},
    description, role, createdAt: new Date().toISOString()};
  rememberIntent(intent);
  return intent;
}
function reconcileIntents() {
  for (const [key, intent] of Object.entries(intents)) {
    const records = intent.action === 'createReview' ? state.reviews : state.snapshots;
    if (list(records).some(item => item.id === intent.body?.id)) removeIntent(key);
  }
}
function renderPending() {
  const current = Object.values(intents).filter(item => object(item) && actionLabels[item.action] && object(item.body));
  $('pending-requests').hidden = current.length === 0;
  replace('pending-list', ...current.map(item => {
    const row = node('div', null, 'pending-item');
    row.append(node('p', (actionLabels[item.action] || item.action) + ': ' + (item.description || 'Selected source editions')));
    const controls = node('div', null, 'button-row');
    controls.append(button('Check saved work', () => run(() => refresh())), button('Resume the same request', () => run(() => submitIntent(item))));
    row.append(controls);
    return row;
  }));
}
function updateControls() {
  for (const element of document.querySelectorAll('button, input, select, textarea')) element.disabled = busy;
  $('desk').setAttribute('aria-busy', String(busy));
  if (busy) return;
  const hasState = Boolean(state), active = Boolean(review && draft);
  $('refresh').disabled = !hasState;
  $('capture-select').disabled = !list(state?.captures).length;
  $('form-select').disabled = !list(selectedCapture()?.forms).length;
  $('version-select').disabled = !list(selectedForm()?.generations).length;
  $('retain-capture').disabled = !selectedGeneration() || selectedGeneration()?.received === false;
  $('draft-baseline').disabled = !publishedSnapshots().length;
  $('retain-draft').disabled = !selectedDraftBaseline();
  $('authoring-select').disabled = !list(state?.authoringCandidates).length;
  $('retain-authoring').disabled = !selectedAuthoring();
  $('baseline-select').disabled = !publishedSnapshots().length;
  $('candidate-select').disabled = !list(state?.snapshots).length;
  $('create-review').disabled = !$('baseline-select').value || !$('candidate-select').value || $('baseline-select').value === $('candidate-select').value;
  const writable = active && !conflict() && !mustRefreshReview;
  for (const id of ['save-review', 'request-revision', 'save-mappings']) $(id).disabled = !writable;
  const localRevision = Object.values(draft?.decisions || {}).some(item => item.decision === 'revise');
  $('approve-review').disabled = !writable || review?.readiness?.canApprove !== true || draft.mappingDirty === true || localRevision;
  $('download-plan').disabled = !active || !review.approval || mustRefreshReview;
  $('previous-changes').disabled = page === 0;
  $('next-changes').disabled = (page + 1) * PAGE_SIZE >= filteredChanges.length;
  for (const element of document.querySelectorAll('[data-no-choices="true"]')) element.disabled = true;
  renderColleague();
}
async function run(operation) {
  if (busy) return;
  busy = true;
  updateControls();
  try { await operation(); }
  catch (error) {
    if (error.status === 401 || error.status === 403) {
      $('unlock').hidden = false;
      focusTarget($('operator-token'));
    }
    notice(error.message + (error.code ? ' (' + error.code + ')' : ''), true);
    if (error.status === 409 && review) {
      try { await loadReview(review.id, {focus: false}); }
      catch { /* The original revision and notes remain available until refresh succeeds. */ }
    }
  } finally {
    busy = false; updateControls();
    if (review && draft) renderReadiness();
    if (focusAfterRun?.isConnected) focusAfterRun.focus();
    focusAfterRun = null;
  }
}
function renderCaptureOptions() {
  fillOptions($('capture-select'), list(state.captures).map(item => ({
    value: item.id, label: (item.name || item.label || item.id) + ' · ' + statusLabel(item.status),
  })), list(state.captures).length ? 'Choose a retained capture' : 'No retained captures');
  renderFormOptions();
}
function renderFormOptions() {
  fillOptions($('form-select'), list(selectedCapture()?.forms).map(item => ({
    value: item.key, label: (item.name || item.formId) + ' · Project ' + item.projectId,
  })), 'Choose a form');
  renderVersionOptions();
}
function renderVersionOptions() {
  fillOptions($('version-select'), list(selectedForm()?.generations).map((item, index) => ({
    value: index, label: versionLabel(item.version) + (item.received === false ? ' · Original files pending' : ''),
  })), 'Choose an original version');
  renderCaptureDetail();
}
function renderCaptureDetail() {
  const form = selectedForm(), version = selectedGeneration(), capture = selectedCapture();
  $('capture-detail').textContent = form ? [
    'Project ' + form.projectId, form.formId, version ? versionLabel(version.version) : list(form.generations).length + ' retained versions',
    capture ? statusLabel(capture.status) + ' capture' : '',
    version?.received === false ? 'Receive this generation’s original XForm and fields through its existing capture' : '',
  ].filter(Boolean).join(' · ') : 'Choose a retained capture and its original form version.';
  updateControls();
}
function renderDraftSource() {
  $('draft-form').hidden = state?.capabilities?.draft !== true;
  fillOptions($('draft-baseline'),publishedSnapshots().map(item => ({value:item.id,label:snapshotLabel(item)})),
    'Choose a retained baseline', $('draft-baseline').value || $('baseline-select').value);
  const selected = selectedDraftBaseline();
  $('draft-detail').textContent = selected
    ? 'Receive the current draft for Project ' + selected.form.projectId + ' · ' + selected.form.formId + '.'
    : 'Retain a published source edition, then choose it as the baseline for the current draft.';
  updateControls();
}
function renderAuthoring() {
  $('authoring-form').hidden = state.capabilities?.authoring !== true;
  fillOptions($('authoring-select'), list(state.authoringCandidates).map(item => ({
    value: item.id, label: (item.title || item.id) + ' · ' + versionLabel(item.version) + ' · Saved revision ' + item.revision,
  })), 'Choose a compiled candidate');
  const selected = selectedAuthoring();
  $('authoring-detail').textContent = selected ? 'Retains saved authoring revision ' + selected.revision + ' with its compiled original.'
    : list(state.authoringCandidates).length ? 'Select the existing compiled candidate to compare.' : 'Compiled candidates will appear here when saved in the authoring workspace.';
}
function selectionChanged() {
  const baseline = snapshot($('baseline-select').value), candidate = snapshot($('candidate-select').value);
  $('comparison-selection').textContent = baseline && candidate
    ? 'Baseline: ' + snapshotLabel(baseline) + '. Candidate: ' + snapshotLabel(candidate) + '.'
    : 'Select the baseline and candidate from retained source editions.';
  if (!$('review-name').value || $('review-name').value === suggestedName) {
    suggestedName = baseline && candidate ? (candidate.title || candidate.form?.formId || 'Form') + ': ' +
      versionLabel(baseline.form?.version) + ' to ' + versionLabel(candidate.form?.version) : '';
    $('review-name').value = suggestedName.slice(0,200);
  }
  updateControls();
}
function chooseSnapshot(id, role) {
  if (role === 'baseline' && !publishedSource(snapshot(id))) return;
  $(role === 'baseline' ? 'baseline-select' : 'candidate-select').value = id;
  if (role === 'baseline') $('draft-baseline').value = id;
  selectionChanged();
  renderDraftSource();
}
function renderSnapshots() {
  fillOptions($('baseline-select'), publishedSnapshots().map(item => ({value: item.id, label: snapshotLabel(item)})), 'Choose published baseline edition');
  fillOptions($('candidate-select'), list(state.snapshots).map(item => ({value: item.id, label: snapshotLabel(item)})), 'Choose candidate edition');
  $('snapshots-heading').textContent = 'Retained source editions (' + list(state.snapshots).length + ')';
  const rows = list(state.snapshots).map(item => {
    const row = node('li', null, 'source-row'), description = node('div');
    description.append(node('strong', item.title || item.form?.formId || item.id),
      node('p', versionLabel(item.form?.version) + ' · ' + originLabel(item.origin) + ' · ' + dateLabel(item.createdAt), 'muted'));
    const actions = node('div', null, 'button-row');
    if (publishedSource(item)) actions.append(button('Use as baseline', () => chooseSnapshot(item.id, 'baseline')));
    actions.append(button('Use as candidate', () => chooseSnapshot(item.id, 'candidate')));
    row.append(description, actions);
    return row;
  });
  replace('snapshot-list', ...(rows.length ? rows : [node('li', 'Retain an original version or compiled candidate to begin.', 'muted')]));
  selectionChanged();
}
function renderReviewList() {
  const query = $('review-search').value.trim().toLowerCase();
  const rows = list(state?.reviews).filter(item => [item.name, item.status, snapshotLabel(snapshot(item.baselineId)),
    snapshotLabel(snapshot(item.candidateId))].join(' ').toLowerCase().includes(query))
    .slice().sort((a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  replace('review-list', ...rows.map(item => {
    const control = button('', () => run(() => loadReview(item.id)));
    control.setAttribute('aria-pressed', String(item.id === selectedReviewId));
    control.append(node('strong', item.name || item.id), node('span', statusLabel(item.status) + ' · ' + dateLabel(item.updatedAt)));
    return control;
  }));
  if (!rows.length) $('review-list').append(empty(query ? 'No saved reviews match this search.' : 'Your saved comparisons will appear here.'));
}
function renderPublications() {
  const rows = list(state.publications).map(item => {
    const row = node('li');
    row.append(node('strong', item.name || item.title || item.id || 'Publication record'),
      node('p', [statusLabel(item.outcome ?? item.status), (item.receivedAt ?? item.createdAt) ? dateLabel(item.receivedAt ?? item.createdAt) : ''].filter(Boolean).join(' · '), 'muted'));
    if (item.form) row.append(node('p', item.form.formId + ' · ' + versionLabel(item.form.version), 'muted'));
    if (list(item.differences).length) row.append(node('p', 'Recorded differences: ' + item.differences.join(', ')));
    const id = item.reviewId ?? item.review?.id;
    if (id && list(state.reviews).some(value => value.id === id)) row.append(button('Open source review', () => run(() => loadReview(id))));
    return row;
  });
  replace('publication-list', ...(rows.length ? rows : [node('li', 'Publication records will appear here when retained by this workspace.', 'muted')]));
}
function renderState() {
  $('workspace-name').textContent = 'Form release review workspace';
  $('workspace-detail').textContent = 'Workspace ' + state.workspaceId;
  replace('overview', metric('Retained sources', list(state.snapshots).length), metric('Saved reviews', list(state.reviews).length),
    metric('Approved reviews', list(state.reviews).filter(item => String(item.status).toLowerCase() === 'approved').length),
    metric('Publication records', list(state.publications).length));
  renderCaptureOptions();
  renderAuthoring();
  renderSnapshots();
  renderDraftSource();
  renderReviewList();
  renderPublications();
  renderPending();
}
async function refresh(options = {}) {
  const next = await request('/api/form-releases/state');
  if (!object(next) || typeof next.workspaceId !== 'string' || !Array.isArray(next.snapshots) || !Array.isArray(next.reviews))
    throw new Error('This listener did not return the form release workspace.');
  const priorWorkspace = state?.workspaceId;
  state = next;
  storagePrefix = 'central-form-releases:' + location.origin + ':' + state.workspaceId;
  if (priorWorkspace !== state.workspaceId) {
    intents = readJSON(storagePrefix + ':requests', {});
    if (!object(intents)) intents = {};
    selectedReviewId = readStorage(storagePrefix + ':selected-review') || '';
    review = null; draft = null; sourceCache = new Map();
  }
  reconcileIntents();
  $('desk').hidden = false;
  $('unlock').hidden = true;
  renderState();
  const target = options.reviewId || selectedReviewId;
  if (target && state.reviews.some(item => item.id === target)) {
    await loadReview(target, {focus: false, discardDraft: options.discardDraft === true, seed: options.seed});
  } else {
    review = null; draft = null; selectedReviewId = '';
    renderReview();
  }
  if (!options.quiet) notice('Saved source editions and reviews refreshed.');
  updateControls();
}
async function submitIntent(intent) {
  notice(actionLabels[intent.action] + '…');
  let result;
  try { result = await action(intent.action, intent.body); }
  catch (error) {
    if (error.status >= 400 && error.status < 500 && ![408,429].includes(error.status)) removeIntent(intent.key);
    throw error;
  }
  removeIntent(intent.key);
  const savedId = result?.id ?? result?.snapshot?.id ?? result?.review?.id ?? intent.body.id;
  try {
    await refresh({quiet: true, ...(intent.action === 'createReview' ? {reviewId: savedId} : {})});
    if (intent.action !== 'createReview') chooseSnapshot(savedId, intent.role || 'candidate');
    if (intent.action === 'createReview') focusTarget($('review-title'));
    notice(intent.action === 'createReview' ? 'Comparison saved. Review its changes and affected outputs.' : 'Original source edition retained and selected.');
  } catch (error) {
    notice('The request was saved. Refresh saved work to open the retained result. ' + error.message, true);
  }
}
function syncReviewSummary() {
  if (!state || !review) return;
  const index = state.reviews.findIndex(item => item.id === review.id);
  const summary = {id: review.id, revision: review.revision, name: review.name, status: review.status,
    baselineId: review.baselineId, candidateId: review.candidateId, assessment: {summary: review.assessment?.summary}, updatedAt: review.updatedAt};
  if (index < 0) state.reviews.push(summary); else state.reviews[index] = {...state.reviews[index], ...summary};
}
function installReview(value, options = {}) {
  if (!object(value) || typeof value.id !== 'string' || !Number.isInteger(value.revision) || !object(value.assessment))
    throw new Error('The selected review could not be read completely.');
  review = value;
  selectedReviewId = value.id;
  mustRefreshReview = false;
  writeStorage(storagePrefix + ':selected-review', value.id);
  restoreDraft(value, options.discardDraft === true, options.seed);
  syncReviewSummary();
  page = 0;
  searchIndex = new Map(list(review.assessment.changes).map(change => [
    change.id, [change.summary, change.path, change.kind, change.severity, change.detail, JSON.stringify(change.before),
      JSON.stringify(change.after), JSON.stringify(change.dependencies)].join(' ').toLowerCase(),
  ]));
  renderReviewList();
  renderReview();
  if (options.focus !== false) focusTarget($('review-title'));
}
async function loadReview(id, options = {}) {
  if (draft) saveDraft();
  const value = await request('/api/form-releases/reviews/' + encodeURIComponent(id));
  if (value?.id !== id) throw new Error('The workspace returned a different review.');
  installReview(value,options);
}

function renderValue(value, depth = 0) {
  if (!object(value) && !Array.isArray(value)) {
    const text = value === undefined ? 'Not supplied' : value === null ? 'None'
      : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value === '' ? 'Blank value' : String(value);
    return node('p', text, 'value');
  }
  const entries = Array.isArray(value) ? value : Object.entries(value);
  if (!entries.length) return node('p', Array.isArray(value) ? 'No entries' : 'No properties', 'value');
  const build = () => {
    if (Array.isArray(value)) {
      const rows = node('ol', null, 'value-list');
      for (const item of value) {
        const row = node('li');
        row.append(renderValue(item, depth + 1));
        rows.append(row);
      }
      return rows;
    }
    const fields = node('dl', null, 'value-fields');
    for (const [key, item] of Object.entries(value)) {
      const description = node('dd');
      description.append(renderValue(item, depth + 1));
      fields.append(node('dt', human(key)), description);
    }
    return fields;
  };
  if (entries.length <= 8 && depth < 3) return build();
  const details = node('details', null, 'value-details');
  details.append(node('summary', entries.length + (Array.isArray(value) ? ' entries' : ' properties') + ' — open full value'));
  let filled = false;
  details.addEventListener('toggle', () => {
    if (details.open && !filled) { details.append(build()); filled = true; }
  });
  return details;
}
function retainedFile(receipt) {
  return object(receipt) && typeof receipt.sha256 === 'string' && /^[a-f0-9]{64}$/.test(receipt.sha256) &&
    Number.isSafeInteger(receipt.bytes) && receipt.bytes >= 0;
}
function originalFiles(source) {
  const form = source.form?.formId || source.id;
  const files = [
    {label:'XForm definition',name:form + '.xml',receipt:source.xml},
    {label:'Native field schema',name:form + '-fields.json',receipt:source.fields},
  ];
  if (source.modelSource) files.push({label:'Retained authoring model',name:form + '-model.json',receipt:source.modelSource});
  for (const item of list(source.media?.items)) files.push({label:'Form attachment',name:item.name,receipt:item});
  return files;
}
async function showSourceFiles(id,side) {
  notice('Opening the retained original source files…');
  const value = await request('/api/form-releases/sources/' + encodeURIComponent(id));
  const selected = snapshot(id);
  if (!object(value) || value.id !== id || !object(value.form) || (selected?.contentHash && value.contentHash !== selected.contentHash))
    throw new Error('The returned source differs from this selected retained edition. Refresh saved work.');
  sourceCache.set(id,value);
  renderSources();
  focusTarget($('source-files-' + side));
  notice('Original source files are ready to open.');
}
async function openOriginalFile(file) {
  if (!retainedFile(file.receipt)) throw new Error('This original file does not have a retained byte receipt.');
  notice('Opening original file: ' + file.name + '…');
  const ticket = await request('/api/downloads',{kind:'source',hash:file.receipt.sha256,name:file.name});
  if (ticket?.sha256 !== file.receipt.sha256 || ticket?.bytes !== file.receipt.bytes || typeof ticket.url !== 'string')
    throw new Error('The download receipt differs from the selected original file.');
  const address = new URL(ticket.url,location.origin);
  if (address.origin !== location.origin || !/^\/api\/downloads\/[a-f0-9]{48}$/.test(address.pathname) || address.search || address.hash)
    throw new Error('The workspace returned an unexpected original-file download address.');
  const link = node('a');
  link.href = address.href;
  link.download = ticket.name || file.name;
  link.rel = 'noreferrer';
  document.body.append(link); link.click(); link.remove();
  notice('Original file download opened: ' + (ticket.name || file.name) + ' · ' + ticket.bytes.toLocaleString() + ' bytes.');
}
function sourceFileControls(id,side) {
  const section = node('div',null,'source-files'), heading = node('h4','Original files');
  heading.id = 'source-files-' + side; heading.tabIndex = -1; section.append(heading);
  const source = sourceCache.get(id);
  if (!source) {
    section.append(button('Show ' + side + ' original files',() => run(() => showSourceFiles(id,side))));
    return section;
  }
  const rows = node('ul',null,'source-list');
  for (const file of originalFiles(source)) {
    const row = node('li',null,'source-row'), detail = node('div');
    detail.append(node('strong',file.label),node('p',file.name,'file-name'));
    if (retainedFile(file.receipt)) {
      detail.append(node('p',file.receipt.bytes.toLocaleString() + ' bytes','muted'));
      const open = button('Open original file',() => run(() => openOriginalFile(file)));
      open.setAttribute('aria-label','Open original file ' + file.name);
      row.append(detail,open);
    } else {
      const status = file.receipt?.datasetExists === true ? 'Dataset source linked'
        : file.receipt?.outcome ? statusLabel(file.receipt.outcome) : 'Original file is not retained';
      detail.append(node('p',status,'muted'));
      row.append(detail);
    }
    rows.append(row);
  }
  section.append(rows);
  return section;
}
function renderSources() {
  const pairs = [['Baseline', review.baselineId], ['Candidate', review.candidateId]];
  replace('source-pair', ...pairs.map(([label,id]) => {
    const item = snapshot(id), card = node('div');
    card.append(node('h3', label), node('strong', item?.title || item?.form?.formId || id),
      node('p', item ? versionLabel(item.form?.version) : 'Retained source ' + id, 'muted'),
      node('p', item ? originLabel(item.origin) : 'Source details are not listed in this response.', 'muted'));
    return card;
  }));
  replace('source-detail-body', ...pairs.map(([label,id]) => {
    const item = snapshot(id), section = node('section');
    section.append(node('h3', label), facts([
      ['Source', id], ['Title', item?.title], ['Project', item?.form?.projectId], ['Form', item?.form?.formId],
      ['Original version', versionLabel(item?.form?.version)], ['Origin', originLabel(item?.origin)],
      ['Content hash', item?.contentHash], ['Retained', item?.createdAt ? dateLabel(item.createdAt) : undefined],
    ]),sourceFileControls(id,label.toLowerCase()));
    return section;
  }));
}
function renderCoverage() {
  const rows = list(review.assessment.coverage).map(item => {
    const row = node('tr');
    const facet = node('th', human(item.facet));
    facet.scope = 'row';
    row.append(facet);
    for (const side of ['baseline','candidate']) {
      const cell = node('td');
      if (typeof item[side] === 'boolean') cell.textContent = item[side] ? 'Available' : 'Not supplied';
      else cell.append(renderValue(item[side]));
      row.append(cell);
    }
    return row;
  });
  if (!rows.length) {
    const row = node('tr'), cell = node('td', 'No comparison coverage was supplied for this saved review.');
    cell.colSpan = 3; row.append(cell); rows.push(row);
  }
  replace('coverage-body', ...rows);
}
function reportSelectors() {
  const selectors = new Map();
  for (const dependency of list(review?.reporting?.dependencies)) {
    for (const selector of list(dependency.selectors)) {
      if (typeof selector?.table !== 'string' || typeof selector?.field !== 'string') continue;
      const key = JSON.stringify([selector.table, selector.field]);
      if (!selectors.has(key)) selectors.set(key, {key, table: selector.table, field: selector.field, system:selector.system === true, outputs: new Set()});
      selectors.get(key).system ||= selector.system === true;
      selectors.get(key).outputs.add(dependency.label || dependency.id || human(dependency.kind));
    }
  }
  for (const binding of list(review?.reporting?.bindings)) {
    if (typeof binding?.table !== 'string' || typeof binding?.field !== 'string') continue;
    const key = JSON.stringify([binding.table, binding.field]);
    if (!selectors.has(key)) selectors.set(key, {key, table: binding.table, field: binding.field, outputs: new Set()});
  }
  return [...selectors.values()].sort((a,b) => a.table.localeCompare(b.table) || a.field.localeCompare(b.field));
}
function renderMappingCount() {
  const rows = reportSelectors();
  const fields = rows.filter(item => !item.system), keys = rows.length - fields.length;
  const unmapped = fields.filter(item => !draft.mappings[item.key]).length;
  const tables = list(review.reporting?.tableChoices).filter(item => item.scope !== 'form');
  const unbound = tables.filter(item => !draft.tableMappings[item.table]).length;
  $('mapping-count').textContent = rows.length || tables.length
    ? unmapped + ' of ' + fields.length + ' fields unmapped' + (tables.length ? ' · ' + unbound + ' of ' + tables.length + ' repeat tables unmapped' : '') +
      (keys ? ' · ' + keys + ' native keys' : '') : 'No saved reporting selectors';
}
function renderMappings() {
  const rows = reportSelectors();
  const choices = list(review.reporting?.fieldChoices).filter(item => typeof item?.path === 'string' && item.path);
  $('mapping-editor').hidden = rows.every(item => item.system) && !list(review.reporting?.tableChoices).some(item => item.scope !== 'form') &&
    review.readiness?.dependenciesChanged !== true && !list(review.reporting?.omittedBindings).length;
  renderMappingCount();
  replace('mapping-list', ...(rows.length ? rows.map((item, index) => {
    const row = node('div', null, 'mapping-row'), detail = node('div'), field = node('div');
    detail.append(node('strong', item.table), node('code', item.field));
    if (item.outputs.size) detail.append(node('p', 'Used by: ' + [...item.outputs].join('; '), 'muted'));
    if (item.system) {
      field.append(node('strong', 'Native row or parent key'), node('p', 'This selector identifies rows or their parent relation in the retained reporting table.', 'muted'));
      row.append(detail,field);
      return row;
    }
    const stateText = node('p', draft.mappings[item.key] ? 'Original path selected' : 'Choose the original field path', 'unmapped');
    detail.append(stateText);
    const id = 'mapping-path-' + index, label = node('label', 'Original form field'), select = node('select');
    label.htmlFor = id; select.id = id;
    const values = new Map(choices.map(choice => [choice.path, {value: choice.path, label: choice.path + (choice.type ? ' · ' + choice.type : '')}]));
    const current = draft.mappings[item.key] || '';
    if (current && !values.has(current)) values.set(current, {value: current, label: current + ' · Retained mapping'});
    fillOptions(select, [...values.values()], 'Unmapped — choose an original field', current);
    select.dataset.noChoices = String(values.size === 0);
    select.addEventListener('change', () => {
      if (select.value) draft.mappings[item.key] = select.value;
      else delete draft.mappings[item.key];
      draft.mappingDirty = true;
      stateText.textContent = select.value ? 'Original path selected in this draft' : 'Choose the original field path';
      saveDraft(); renderMappingCount(); renderReadiness(); updateControls();
    });
    field.append(label, select);
    if (!values.size) field.append(node('p', 'This review has no retained native field paths to choose from.', 'muted'));
    row.append(detail, field);
    return row;
  }) : [empty('No selected reporting outputs depend on a form selector in this review.')]));
  renderTableMappings();
}
function renderTableMappings() {
  const choices = list(review.reporting?.repeatChoices).filter(item => typeof item?.path === 'string' && item.path);
  const tables = list(review.reporting?.tableChoices);
  replace('table-mapping-list', ...(tables.length ? tables.map((item,index) => {
    const row = node('div',null,'mapping-row'), detail = node('div'), field = node('div');
    detail.append(node('strong',item.table));
    const outputs = list(item.dependencies).map(value => typeof value === 'string' ? value : value.label || value.id).filter(Boolean);
    if (outputs.length) detail.append(node('p','Used by: ' + outputs.join('; '),'muted'));
    if (item.relation) {
      const relation = node('details');
      relation.append(node('summary','Retained parent relation'),renderValue(item.relation));
      detail.append(relation);
    }
    if (item.scope === 'form') {
      field.append(node('strong','Native root submission table'),
        node('p','This table represents original form submissions.','muted'));
    } else {
      const id = 'table-path-' + index, label = node('label','Original repeat path'), select = node('select');
      label.htmlFor = id; select.id = id;
      const values = new Map(choices.map(choice => [choice.path,{value:choice.path,label:choice.path + (choice.type ? ' · ' + choice.type : '')}]));
      const current = draft.tableMappings[item.table] || '';
      if (current && !values.has(current)) values.set(current,{value:current,label:current + ' · Retained table mapping'});
      fillOptions(select,[...values.values()],'Unmapped — choose an original repeat path',current);
      select.dataset.noChoices = String(values.size === 0);
      select.addEventListener('change',() => {
        if (select.value) draft.tableMappings[item.table] = select.value;
        else delete draft.tableMappings[item.table];
        draft.mappingDirty = true;
        saveDraft(); renderMappingCount(); renderReadiness(); updateControls();
      });
      field.append(label,select);
      if (!values.size) field.append(node('p','This review has no retained original repeat paths to choose from.','muted'));
    }
    row.append(detail,field);
    return row;
  }) : [empty('No selected reporting tables were supplied for this review.')]));
  const omitted = list(review.reporting?.omittedBindings);
  $('omitted-mappings').hidden = omitted.length === 0;
  replace('omitted-mapping-list',...(omitted.length ? [renderValue(omitted)] : []));
}
function unresolved(change) {
  const selected = draft?.decisions?.[change.id];
  return list(review?.readiness?.unresolvedChangeIds).includes(change.id) ||
    selected?.decision === 'revise' ||
    (['incompatible','review'].includes(change.severity) && (!selected?.decision || !selected.note?.trim()));
}
function updateChangeDraft(change, decision, note) {
  if (decision || note) draft.decisions[change.id] = {decision, note};
  else delete draft.decisions[change.id];
  draft.dirty = true;
  saveDraft();
  renderReadiness();
  updateControls();
}
function renderChange(change, index) {
  const card = node('article', null, 'change-card'), heading = node('div', null, 'change-heading');
  const title = node('div'), titleId = 'change-title-' + index;
  const text = node('h4', change.summary || human(change.kind) || 'Form change');
  text.id = titleId; card.setAttribute('aria-labelledby', titleId);
  title.append(text, node('p', human(change.kind), 'muted'));
  const badge = node('span', severityLabels[change.severity] || human(change.severity), 'badge');
  badge.dataset.severity = change.severity;
  heading.append(title, badge); card.append(heading);
  if (change.path) card.append(node('p', change.path, 'change-path'));
  if (change.detail) card.append(node('p', change.detail, 'muted'));
  const values = node('div', null, 'change-values');
  for (const [label,key] of [['Baseline','before'], ['Candidate','after']]) {
    const section = node('section');
    section.append(node('h4', label), renderValue(change[key]));
    values.append(section);
  }
  card.append(values);
  if (list(change.dependencies).length) {
    const dependencies = node('div', null, 'change-dependencies'), rows = node('ul');
    dependencies.append(node('strong', 'Affected outputs'));
    for (const dependency of change.dependencies) {
      const row = node('li');
      row.append(node('span', dependency.label || dependency.id || human(dependency.kind)));
      if (dependency.selector !== undefined) row.append(renderValue(dependency.selector));
      rows.append(row);
    }
    dependencies.append(rows); card.append(dependencies);
  }
  const selected = draft.decisions[change.id] || {}, controls = node('div', null, 'disposition');
  const selectId = 'decision-' + index, noteId = 'decision-note-' + index;
  const label = node('label', 'Staff disposition'), select = node('select'), noteLabel = node('label', 'Disposition note');
  const note = node('textarea');
  label.htmlFor = selectId; select.id = selectId;
  select.setAttribute('aria-describedby',titleId);
  fillOptions(select, [
    {value:'accept',label:'Accept this change'},
    {value:'remap',label:'Reporting has been remapped'},
    {value:'revise',label:'Revise the candidate'},
  ], 'No disposition selected', selected.decision || '');
  if (list(review.decisions).some(item => item.changeId === change.id)) select.options[0].disabled = true;
  noteLabel.htmlFor = noteId; note.id = noteId; note.rows = 2; note.maxLength = 20000;
  note.value = selected.note || ''; note.dataset.changeId = change.id;
  note.setAttribute('aria-describedby', titleId);
  select.addEventListener('change', () => updateChangeDraft(change, select.value, note.value));
  note.addEventListener('input', () => updateChangeDraft(change, select.value, note.value));
  controls.append(label, select, noteLabel, note);
  card.append(controls);
  return card;
}
function renderChanges() {
  const query = $('change-search').value.trim().toLowerCase(), severity = $('severity-select').value;
  filteredChanges = list(review.assessment.changes).filter(change =>
    (!query || searchIndex.get(change.id)?.includes(query)) &&
    (!severity || change.severity === severity) &&
    (!$('unresolved-only').checked || unresolved(change)));
  page = Math.max(0, Math.min(page, Math.ceil(filteredChanges.length / PAGE_SIZE) - 1));
  const start = page * PAGE_SIZE;
  replace('change-list', ...(filteredChanges.length
    ? filteredChanges.slice(start, start + PAGE_SIZE).map((change,index) => renderChange(change, start + index))
    : [empty(list(review.assessment.changes).length ? 'No changes match these filters.' : 'No differences were recorded between these retained source editions.')]));
  $('change-count').textContent = filteredChanges.length + ' of ' + list(review.assessment.changes).length + ' changes';
  $('change-pages').hidden = filteredChanges.length <= PAGE_SIZE;
  $('page-label').textContent = filteredChanges.length ? (start + 1) + '–' + Math.min(start + PAGE_SIZE, filteredChanges.length) +
    ' of ' + filteredChanges.length : 'No matching changes';
  updateControls();
}
function renderOutputs() {
  const outputs = new Map();
  for (const change of list(review.assessment.changes)) {
    for (const dependency of list(change.dependencies)) {
      const key = JSON.stringify([dependency.kind,dependency.id]);
      if (!outputs.has(key)) outputs.set(key,{dependency,changes:new Set(),selectors:new Map()});
      const output = outputs.get(key);
      output.changes.add(change.id);
      if (dependency.selector !== undefined) output.selectors.set(JSON.stringify(dependency.selector),dependency.selector);
    }
  }
  replace('affected-outputs', ...(outputs.size ? [...outputs.values()].map(({dependency,changes,selectors}) => {
    const row = node('li');
    row.append(node('strong', dependency.label || dependency.id || 'Reporting output'),
      node('p', human(dependency.kind) + ' · ' + changes.size + (changes.size === 1 ? ' related change' : ' related changes'), 'muted'));
    for (const selector of selectors.values()) row.append(renderValue(selector));
    return row;
  }) : [node('li','No affected outputs were recorded for the selected reporting dependencies.','muted')]));
}

function renderReadiness() {
  if (!review || !draft) return;
  const readiness = review.readiness || {}, problems = [];
  if (list(readiness.unresolvedChangeIds).length) problems.push(list(readiness.unresolvedChangeIds).length + ' saved changes still need disposition.');
  if (list(readiness.incompatibleChangeIds).length) problems.push(list(readiness.incompatibleChangeIds).length + ' changes are incompatible with the selected source or reporting requirements.');
  if (readiness.dependenciesChanged === true || list(readiness.staleDependencies).length) problems.push('The selected reporting definitions have changed since this review. Update the reporting mappings to recompute their effects.');
  if (draft.mappingDirty) problems.push('Save the changed reporting mappings to recompute this comparison, or reset the mapping draft.');
  const revisionChoices = Object.values(draft.decisions).filter(item => item?.decision === 'revise').length;
  if (revisionChoices) problems.push(revisionChoices + ' dispositions request a candidate revision.');
  if (mustRefreshReview) problems.push('Refresh the saved review before the next revision-bound action.');
  if (conflict()) problems.push('This tab’s notes belong to an earlier saved revision.');
  const content = [node('strong', review.approval ? 'Approval retained for the saved review' :
    readiness.canApprove === true ? 'Saved review is ready for approval' : 'Review work remains')];
  if (problems.length) {
    const rows = node('ul');
    for (const problem of problems) rows.append(node('li', problem));
    content.push(rows);
  } else if (!review.approval && readiness.canApprove !== true) content.push(node('p', 'Save your staff review to update readiness.'));
  if (list(readiness.staleDependencies).length) {
    const detail = node('details');
    detail.append(node('summary', 'Changed reporting dependencies'), renderValue(readiness.staleDependencies));
    content.push(detail);
  }
  replace('readiness', ...content);
  const selected = Object.values(draft.decisions).filter(item => item?.decision).length;
  $('draft-status').textContent = (draft.dirty || draft.mappingDirty ? 'Unsaved notes remain in this tab. ' : 'Showing the saved staff review. ') +
    selected + (selected === 1 ? ' disposition selected.' : ' dispositions selected.') +
    (draft.mappingDirty ? ' Reporting mappings have also changed.' : '');
  $('approval-detail').hidden = !review.approval;
  if (review.approval) {
    const approval = review.approval;
    const rows = [
      ['Reviewer', approval.reviewer ?? approval.approvedBy],
      ['Approved', (approval.at ?? approval.approvedAt ?? approval.createdAt) ? dateLabel(approval.at ?? approval.approvedAt ?? approval.createdAt) : undefined],
      ['Source review revision', approval.reviewRevision ?? approval.revision],
      ['Publication plan', approval.planId], ['Plan hash', approval.planHash ?? approval.contentHash],
    ].filter(([,value]) => value !== undefined);
    replace('approval-detail', node('strong', 'Approved source review'), ...(rows.length ? [facts(rows)] : []),
      node('p', 'The publication plan preserves this saved approval and its selected original source editions.', 'muted'));
  } else replace('approval-detail');
}
function renderReview() {
  renderColleague();
  const active = Boolean(review && draft);
  $('review-empty').hidden = active;
  $('review-content').hidden = !active;
  if (!active) {
    $('review-title').textContent = 'Select a saved review';
    filteredChanges = []; updateControls(); return;
  }
  $('review-title').textContent = review.name || review.id;
  $('review-meta').textContent = 'Saved revision ' + review.revision + (review.updatedAt ? ' · ' + dateLabel(review.updatedAt) : '');
  $('review-status').textContent = statusLabel(review.status);
  $('revision-conflict').hidden = !conflict();
  $('revision-conflict-text').textContent = conflict()
    ? 'Your notes are based on revision ' + draft.expectedRevision + '. The workspace now has revision ' + review.revision +
      '. Save a copy of your notes, then reload the current review before saving decisions.'
    : '';
  $('reviewer').value = draft.reviewer;
  $('review-note').value = draft.note;
  $('mapping-note').value = draft.mappingNote || '';
  const summary = review.assessment.summary || {};
  replace('review-metrics', ...[
    ['Changes', summary.changes ?? list(review.assessment.changes).length],
    ['Requires revision', summary.incompatible], ['Needs review', summary.review],
    ['Compatible', summary.compatible], ['Information', summary.information], ['Affected outputs', summary.affectedOutputs],
  ].map(([label,value]) => metric(label,value)));
  renderSources(); renderCoverage(); renderMappings(); renderChanges(); renderOutputs(); renderReadiness(); updateControls();
}
function requireReviewer() {
  const element = $('reviewer');
  if (!element.value.trim()) { focusTarget(element); element.reportValidity(); throw new Error('Enter the reviewer name before saving.'); }
  draft.reviewer = element.value.trim();
  return draft.reviewer;
}
function requireCurrentReview() {
  if (!review || !draft) throw new Error('Open a saved comparison first.');
  if (conflict() || mustRefreshReview) throw new Error('Refresh the saved review before making another revision-bound change.');
}
function requireNote(element, label) {
  if (!element.value.trim()) {
    focusTarget(element); element.reportValidity();
    throw new Error('Enter ' + label + ' before saving.');
  }
  return element.value.trim();
}
function selectedDecisions() {
  const changes = new Map(list(review.assessment.changes).map(item => [item.id,item]));
  const selected = [];
  for (const [changeId,item] of Object.entries(draft.decisions)) {
    if (!changes.has(changeId)) continue;
    const note = String(item?.note || '').trim();
    if (!item?.decision && !note) continue;
    if (!['accept','remap','revise'].includes(item?.decision) || !note) {
      $('change-search').value = ''; $('severity-select').value = ''; $('unresolved-only').checked = false;
      page = Math.floor(list(review.assessment.changes).findIndex(change => change.id === changeId) / PAGE_SIZE);
      renderChanges();
      const field = [...$('change-list').querySelectorAll('textarea[data-change-id]')].find(element => element.dataset.changeId === changeId);
      if (field) focusTarget(field);
      throw new Error((!item?.decision ? 'Choose a disposition for the note on: ' : 'Add a disposition note for: ') + (changes.get(changeId).summary || changeId));
    }
    selected.push({changeId,decision:item.decision,note});
  }
  return selected;
}

async function acceptReviewWrite(result, options) {
  const prior = review.id;
  mustRefreshReview = true;
  try {
    const received = object(result?.review) ? result.review : result;
    if (received?.id === prior && Number.isInteger(received.revision) && object(received.assessment))
      installReview(received,{discardDraft:options.preserveDraft!==true,seed:options.seed,focus:false});
    else await loadReview(prior,{discardDraft:options.preserveDraft!==true,seed:options.seed,focus:false});
    replace('overview', metric('Retained sources',list(state.snapshots).length),metric('Saved reviews',list(state.reviews).length),
      metric('Approved reviews',list(state.reviews).filter(item => String(item.status).toLowerCase() === 'approved').length),
      metric('Publication records',list(state.publications).length));
    notice(options.message);
  } catch (error) {
    mustRefreshReview = true;
    notice(options.message + ' Refresh saved work to read the updated review. ' + error.message,true);
    renderReadiness();
  }
}

async function saveDecision(overall) {
  requireCurrentReview();
  const reviewer = requireReviewer(), note = requireNote($('review-note'), 'the overall review note');
  if (draft.mappingDirty) throw new Error('Save the reporting mappings first so the decisions apply to the recomputed comparison.');
  if (overall === 'approve' && review.readiness?.canApprove !== true) throw new Error('Save the review and resolve its listed changes before approval.');
  const decisions = selectedDecisions();
  const body = {id:review.id, expectedRevision:draft.expectedRevision, reviewer, note, decisions, overall};
  notice(overall === 'approve' ? 'Saving approval for the selected source editions…' : 'Saving the staff review…');
  let result;
  try { result = await action('decide', body); }
  catch (error) {
    if (!error.status || error.status >= 500 || [408,429].includes(error.status)) mustRefreshReview = true;
    throw error;
  }
  await acceptReviewWrite(result, {seed:{reviewer,note},
    message:overall === 'approve' ? 'Source review approved and frozen. The publication plan is ready to download.' :
      overall === 'revise' ? 'Candidate revision requested and staff review saved.' : 'Staff review saved.'});
}
async function saveMappings() {
  requireCurrentReview();
  const reviewer = requireReviewer(), note = requireNote($('mapping-note'), 'a mapping review note');
  const selectors = reportSelectors(), bindings = [], tableBindings = [];
  for (const selector of selectors) {
    if (selector.system) continue;
    const path = draft.mappings[selector.key];
    if (path) bindings.push({path,table:selector.table,field:selector.field});
  }
  for (const table of list(review.reporting?.tableChoices)) {
    const path = draft.tableMappings[table.table];
    if (table.scope !== 'form' && path) tableBindings.push({table:table.table,path});
  }
  notice('Saving exact reporting mappings and updating the comparison…');
  let result;
  try { result = await action('mapReports', {id:review.id,expectedRevision:draft.expectedRevision,reviewer,note,bindings,tableBindings}); }
  catch (error) {
    if (!error.status || error.status >= 500 || [408,429].includes(error.status)) mustRefreshReview = true;
    throw error;
  }
  await acceptReviewWrite(result, {seed:{reviewer,note:''},
    message:'Reporting mappings saved. Review the recomputed changes and enter the new staff dispositions.'});
}
async function downloadPlan() {
  requireCurrentReview();
  if (!review.approval) throw new Error('Approve the saved review before downloading its publication plan.');
  notice('Preparing the approved publication plan…');
  const result = await action('publicationPlan', {id:review.id,expectedRevision:review.revision});
  downloadJSON(result, 'form-release-' + review.id + '-revision-' + review.revision + '.json');
  notice('The complete approved publication plan was downloaded.');
}
function filterChanges() { if (!review) return; page = 0; renderChanges(); }
$('capture-form').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const capture = selectedCapture(), form = selectedForm(), generation = selectedGeneration();
    if (!capture || !form || !generation || generation.received === false || typeof generation.version !== 'string') throw new Error('Choose the retained capture, form, and original version.');
    const intent = createIntent('retainCapture', {captureId:capture.id,formKey:form.key,version:generation.version},
      (form.name || form.formId) + ' · ' + versionLabel(generation.version), $('capture-role').value);
    await submitIntent(intent);
  });
});
$('draft-form').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const baseline = selectedDraftBaseline();
    if (state.capabilities?.draft !== true || !baseline) throw new Error('Choose a retained baseline source for the current Central draft.');
    const intent = createIntent('retainDraft',{baselineId:baseline.id},
      (baseline.title || baseline.form.formId) + ' · Current Central draft','candidate');
    await submitIntent(intent);
  });
});
$('authoring-form').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const authoring = selectedAuthoring();
    if (state.capabilities?.authoring !== true || !authoring || !Number.isInteger(authoring.revision)) throw new Error('Choose an existing compiled candidate.');
    const intent = createIntent('retainAuthoring', {authoringId:authoring.id,expectedRevision:authoring.revision},
      (authoring.title || authoring.id) + ' · Saved revision ' + authoring.revision, 'candidate');
    await submitIntent(intent);
  });
});
$('compare-form').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const baselineId = $('baseline-select').value, candidateId = $('candidate-select').value, name = $('review-name').value.trim();
    if (!publishedSource(snapshot(baselineId)) || !snapshot(candidateId) || baselineId === candidateId || !name) throw new Error('Choose a published baseline, a distinct retained candidate, and name the review.');
    const intent = createIntent('createReview', {name,baselineId,candidateId}, name);
    await submitIntent(intent);
  });
});
$('mapping-form').addEventListener('submit', event => { event.preventDefault(); run(saveMappings); });
$('reset-mappings').addEventListener('click',() => {
  if (!review || !draft) return;
  draft.mappings = serverMappings(review); draft.tableMappings = serverTableMappings(review);
  draft.mappingNote = ''; draft.mappingDirty = false; $('mapping-note').value = '';
  saveDraft(); renderMappings(); renderReadiness(); updateControls();
  notice('Mapping draft reset to the current saved reporting inventory.');
});
$('decision-form').addEventListener('submit', event => { event.preventDefault(); run(() => saveDecision('review')); });
$('request-revision').addEventListener('click', () => run(() => saveDecision('revise')));
$('approve-review').addEventListener('click', () => run(() => saveDecision('approve')));
$('download-plan').addEventListener('click', () => run(downloadPlan));
$('refresh').addEventListener('click', () => run(() => refresh()));
$('capture-select').addEventListener('change', renderFormOptions);
$('form-select').addEventListener('change', renderVersionOptions);
$('version-select').addEventListener('change', renderCaptureDetail);
$('authoring-select').addEventListener('change', () => { renderAuthoring(); updateControls(); });
$('baseline-select').addEventListener('change', () => { selectionChanged(); renderDraftSource(); });
$('draft-baseline').addEventListener('change', renderDraftSource);
$('candidate-select').addEventListener('change', selectionChanged);
$('review-search').addEventListener('input', renderReviewList);
$('change-search').addEventListener('input', filterChanges);
$('severity-select').addEventListener('change', filterChanges);
$('unresolved-only').addEventListener('change', filterChanges);
$('previous-changes').addEventListener('click', () => { page--; renderChanges(); $('changes-title').scrollIntoView({block:'start'}); });
$('next-changes').addEventListener('click', () => { page++; renderChanges(); $('changes-title').scrollIntoView({block:'start'}); });
$('reviewer').addEventListener('input', () => {
  if (!draft) return;
  draft.reviewer = $('reviewer').value; draft.dirty = true; saveDraft(); renderReadiness();
});
$('review-note').addEventListener('input', () => {
  if (!draft) return;
  draft.note = $('review-note').value; draft.dirty = true; saveDraft(); renderReadiness();
});
$('mapping-note').addEventListener('input', () => {
  if (!draft) return;
  draft.mappingNote = $('mapping-note').value; draft.mappingDirty = true; saveDraft(); renderReadiness(); updateControls();
});
$('download-draft').addEventListener('click', () => {
  if (draft) downloadJSON({workspaceId:state.workspaceId,...clone(draft)}, 'form-review-notes-' + draft.reviewId + '.json');
});
$('reload-review').addEventListener('click', () => run(() => loadReview(review.id, {discardDraft:true})));
$('unlock-form').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    applyToken($('operator-token').value);
    await refresh();
    $('operator-token').value = '';
  });
});
function initialize() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const supplied = hash.get('token');
  const stored = readStorage(tokenKey) || readStorage('central-field-data:' + location.origin + ':token') ||
    readStorage('central-commissioning-token:' + location.origin) || readStorage('central-warehouse-token:' + location.origin) || '';
  applyToken(supplied || stored);
  if (supplied !== null) history.replaceState(null, '', location.pathname + location.search);
  if (token) run(() => refresh());
  else {
    $('unlock').hidden = false;
    notice('Open this desk from your operator link, or enter the workspace token.');
    updateControls();
  }
}

/* Complete colleague receiving on this same saved release review. */
let colleaguePreview=null,colleagueChoices={},colleagueFile=null;
const colleagueKey=()=>storagePrefix+':colleague:'+review?.id;
function colleagueOperation(){return review?readJSON(colleagueKey(),null):null;}
function retainColleagueOperation(value){
 try{
  if(value===null)sessionStorage.removeItem(colleagueKey());
  else sessionStorage.setItem(colleagueKey(),JSON.stringify(value));
 }catch{throw new Error('The browser could not retain this original request. Make session storage available before sending; the current source and draft remain open.');}
 renderColleague();
}
function colleagueUnchanged(){return review&&draft&&!draft.dirty&&!draft.mappingDirty&&!conflict()&&!mustRefreshReview;}
function renderColleague(){
 if(!$('colleague-history'))return;
 const active=Boolean(review),pending=colleagueOperation();
 $('export-colleague').disabled=busy||!active||Boolean(pending&&pending.kind!=='export');
 $('receive-colleague').disabled=busy||!active||Boolean(pending&&pending.kind!=='receive');
 $('colleague-file').disabled=busy||!active||Boolean(pending&&pending.kind!=='receive');
 $('colleague-resume').hidden=!pending;
 $('colleague-resume').disabled=busy;
 $('colleague-new-file').hidden=!(pending?.kind==='receive'&&pending.rejected===true);
 $('colleague-new-file').disabled=busy;
 $('colleague-pending').textContent=pending?
  (pending.kind==='export'?'The original package request is retained. Resume it to receive that same saved edition.':
   pending.kind==='apply'?'The exact selected feedback request is retained. Resume it to receive its original saved outcome.':
   'The original return ID and file identity are retained. Check its saved result or reselect the same complete JSON file to resume.'):
  'Download a complete review for a colleague, then receive their returned JSON in this same saved review.';
 const rows=[];
 for(const pack of list(review?.colleague?.packages)){
  const row=node('li',null,'source-row'),detail=node('div');
  detail.append(node('strong','Saved colleague package'),node('p',pack.id+' · '+dateLabel(pack.createdAt),'muted'));
  const actions=node('div',null,'button-row');
  if(pack.html)actions.append(button('Download working HTML',()=>run(()=>openOriginalFile({name:'form-colleague-'+pack.id+'.html',receipt:pack.html}))));
  if(pack.source)actions.append(button('Download original package',()=>run(()=>openOriginalFile({name:'form-colleague-'+pack.id+'.json',receipt:pack.source}))));
  row.append(detail,actions);rows.push(row);
 }
 for(const received of list(review?.colleague?.returns)){
  const row=node('li',null,'source-row'),detail=node('div');
  detail.append(node('strong',received.reviewer||'Returned colleague review'),node('p',statusLabel(received.status)+' · '+received.editionCount+' saved editions · '+dateLabel(received.createdAt),'muted'));
  const actions=node('div',null,'button-row');
  actions.append(button('Review returned decisions',()=>run(()=>openColleagueReturn(received.id))));
  if(received.source)actions.append(button('Download original return',()=>run(()=>openOriginalFile({name:'form-colleague-return-'+received.id+'.json',receipt:received.source}))));
  row.append(detail,actions);rows.push(row);
 }
 replace('colleague-history',...rows);
 const preview=colleaguePreview?.reviewId===review?.id?colleaguePreview:null;
 $('colleague-preview').hidden=!preview;
 if(!preview)return;
 $('colleague-message').textContent=preview.message+' Original review revision '+preview.originalRevision+'; current saved revision '+preview.currentRevision+(preview.currentRevision!==review.revision?' (saved review is now revision '+review.revision+'; refresh this comparison)':'')+'.';
 replace('colleague-author',facts([['Colleague',preview.draft.reviewer||'Not entered'],['Overall note',preview.draft.note||'Not entered'],
  ['Saved local editions',preview.editions.length],['Current review status',statusLabel(preview.currentStatus)],
  ['Current approved plan',preview.currentApproval?.planId||'None']]));
 const differences=preview.rows.filter(row=>row.different&&row.colleague!==null);
 const nodes=differences.map(row=>{
  const card=node('section',null,'subpanel');card.append(node('h4',row.change.summary),node('p',row.change.path||human(row.change.kind),'muted'));
  if(row.nativeChanged)card.append(node('p','The saved staff disposition changed after this package was exported.','notice'));
  const pair=node('div',null,'source-pair');
  for(const [label,value] of [['Originally exported staff decision',row.original],['Current staff decision',row.current],['Colleague decision',row.colleague]]){
   const side=node('div');side.append(node('strong',label),node('p',value?human(value.decision):'No saved decision'),node('p',value?.note||'No note'));pair.append(side);
  }
  card.append(pair);
  const label=node('label','Select the disposition to keep'),select=node('select');
  select.append(new Option('Choose explicitly',''),new Option('Keep current staff decision','current'),new Option('Use colleague decision','colleague'));
  select.value=colleagueChoices[row.change.id]||'';
  select.disabled=busy||!preview.canApply;
  select.addEventListener('change',()=>{colleagueChoices[row.change.id]=select.value;saveColleagueFeedback();renderColleague();});
  label.append(select);card.append(label);
  if(row.incomplete)card.append(node('p','The colleague disposition has no note. Keep the current decision or return the complete working file for the colleague to finish.','notice'));
  return card;
 });
 replace('colleague-differences',...nodes.length?nodes:[empty('No changed colleague dispositions. The complete returned note and history can still be received as a staff review.')]);
 const history=node('div');
 for(const edition of preview.editions){
  const item=node('details');item.append(node('summary',(edition.reviewer||'Reviewer')+' · '+dateLabel(edition.createdAt)));
  item.append(node('p',edition.note),renderValue(edition.decisions));history.append(item);
 }
 replace('colleague-editions',history);
 $('apply-colleague').disabled=busy||!preview.canApply||preview.currentRevision!==review.revision||!colleagueUnchanged()||Boolean(pending&&pending.kind!=='apply')||
  differences.some(row=>!colleagueChoices[row.change.id]||row.incomplete&&colleagueChoices[row.change.id]==='colleague');
 $('colleague-apply-guidance').textContent=preview.currentRevision!==review.revision?'Refresh this returned comparison against the current saved review.':!colleagueUnchanged()?'Save or reload the current local draft before applying returned feedback.':
  preview.currentApproval?'Applying a staff review opens the review again and retains the earlier approved plan. Review the current result before any new approval.':
  'Applying saves the explicit choices and the complete returned note/history in the current review. Approval uses the existing separate staff action.';
}
async function exportColleague(){
 if(!review)throw new Error('Open the original saved review.');
 let pending=colleagueOperation();
 if(!pending)requireCurrentReview();
 if(pending&&pending.kind!=='export')throw new Error('Finish the retained colleague request first.');
 if(!pending){pending={kind:'export',body:{id:review.id,expectedRevision:review.revision,packageId:'colleague-'+crypto.randomUUID()}};retainColleagueOperation(pending);}
 notice('Preparing the complete original colleague package…');
 const result=await action('exportColleague',pending.body);
 retainColleagueOperation(null);
 await loadReview(review.id,{focus:false});
 await openOriginalFile({name:'form-colleague-'+result.id+'.html',receipt:result.html});
 notice('The complete colleague working HTML was downloaded. The saved package remains available in this review.');
}
async function digestFile(file){
 const raw=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',raw);
 return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
function colleagueFeedbackKey(){return colleaguePreview?storagePrefix+':colleague-feedback:'+colleaguePreview.id+':'+colleaguePreview.previewHash:null;}
function saveColleagueFeedback(){
 const key=colleagueFeedbackKey();if(!key)return;
 writeStorage(key,JSON.stringify({choices:colleagueChoices,reviewer:$('colleague-reviewer').value,note:$('colleague-note').value,overall:$('colleague-overall').value}));
}
function installColleaguePreview(result){
 colleaguePreview=result;
 const saved=readJSON(colleagueFeedbackKey(),null);
 colleagueChoices=object(saved?.choices)?saved.choices:{};
 $('colleague-reviewer').value=saved?.reviewer??draft?.reviewer??'';
 $('colleague-note').value=saved?.note??'';
 $('colleague-overall').value=saved?.overall==='revise'?'revise':'review';
}
async function openColleagueReturn(id){
 const result=await request('/api/form-releases/colleague-returns/'+encodeURIComponent(id));
 if(result.reviewId!==review.id)throw new Error('This return belongs to another review.');
 installColleaguePreview(result);
 renderColleague();
 notice('The complete original feedback is open beside current saved staff decisions.');
 return result;
}
async function receiveColleague(){
 if(!review)throw new Error('Open the original saved review.');
 let pending=colleagueOperation();
 if(pending&&pending.kind!=='receive')throw new Error('Finish the retained colleague request first.');
 if(pending){
  try{
   const received=await openColleagueReturn(pending.id);
   if(received.reviewId!==pending.reviewId||received.source?.sha256!==pending.sha256||received.source?.bytes!==pending.bytes)
    throw new Error('The saved receiving result differs from this retained original file request. Keep this request and review its original source.');
   retainColleagueOperation(null);
   await loadReview(review.id,{focus:false});return;
  }catch(error){if(error.status!==404)throw error;}
 }
 const file=colleagueFile||$('colleague-file').files[0];
 if(!file)throw new Error('Choose the complete colleague return JSON file.');
 if(file.size>256*1024*1024)throw new Error('The complete return exceeds this receiver’s 256 MiB file limit.');
 const sha256=await digestFile(file);
 if(pending){
  if(pending.sha256!==sha256||pending.bytes!==file.size)throw new Error('Resume with the same original return file. Its bytes differ from the retained request.');
 }else{
  pending={kind:'receive',id:'colleague-return-'+crypto.randomUUID(),reviewId:review.id,name:file.name,bytes:file.size,sha256};
  retainColleagueOperation(pending);
 }
 notice('Receiving the complete original colleague return…');
 const response=await fetch('/api/form-releases/colleague-returns/'+encodeURIComponent(pending.id)+'?reviewId='+encodeURIComponent(pending.reviewId),{
  method:'POST',redirect:'error',cache:'no-store',credentials:'same-origin',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:file});
 let value;try{value=await response.json();}catch{throw new Error('The receiving response was interrupted. Resume this same retained request.');}
 if(!response.ok||value.ok===false){
  if([400,409,413,415,422].includes(response.status)){pending.rejected=true;pending.error=value.error?.message||'The file was rejected.';retainColleagueOperation(pending);}
  throw Object.assign(new Error(value.error?.message||'The original return could not be received.'),value.error||{},{status:response.status});
 }
 installColleaguePreview(value.result);colleagueFile=null;$('colleague-file').value='';
 retainColleagueOperation(null);await loadReview(review.id,{focus:false});renderColleague();
 notice('The complete returned file is retained. Review its decisions and history below.');
}
async function applyColleague(){
 if(!review)throw new Error('Open the original saved review.');
 let pending=colleagueOperation();
 if(pending&&pending.kind!=='apply')throw new Error('Finish the retained colleague request first.');
 if(!pending){
  if(!colleagueUnchanged())throw new Error('Save or reload the current local draft before applying feedback.');
  const preview=colleaguePreview;
  if(!preview||preview.reviewId!==review.id||!preview.canApply)throw new Error('Open an applicable colleague return.');
  const reviewer=$('colleague-reviewer').value.trim(),note=$('colleague-note').value.trim();
  if(!reviewer||!note)throw new Error('Enter the accepting staff reviewer and decision note.');
  const differences=preview.rows.filter(row=>row.different&&row.colleague!==null);
  if(differences.some(row=>!['current','colleague'].includes(colleagueChoices[row.change.id])||row.incomplete&&colleagueChoices[row.change.id]==='colleague'))
   throw new Error('Choose a complete disposition for every returned difference.');
  const body={id:preview.id,expectedRevision:preview.currentRevision,previewHash:preview.previewHash,reviewer,note,
   overall:$('colleague-overall').value,choices:differences.map(row=>({changeId:row.change.id,source:colleagueChoices[row.change.id]}))};
  pending={kind:'apply',body};retainColleagueOperation(pending);
 }
 notice('Saving the explicit colleague feedback selection…');
 let result;
 try{result=await action('applyColleague',pending.body);}
 catch(error){
  if(error.status===409){try{await openColleagueReturn(pending.body.id);if(!colleaguePreview.applied)retainColleagueOperation(null);}catch{}}
  throw error;
 }
 retainColleagueOperation(null);await acceptReviewWrite(result.review,{preserveDraft:Boolean(draft?.dirty||draft?.mappingDirty),seed:{reviewer:pending.body.reviewer,note:pending.body.note},message:'The selected feedback is saved.'});
 await openColleagueReturn(pending.body.id);
 notice('The selected feedback and complete original return are saved in this release review.');
}
async function resumeColleague(){
 const pending=colleagueOperation();
 if(pending?.kind==='export')return exportColleague();
 if(pending?.kind==='receive')return receiveColleague();
 if(pending?.kind==='apply')return applyColleague();
}
$('refresh-colleague').addEventListener('click',()=>run(()=>openColleagueReturn(colleaguePreview.id)));
$('export-colleague').addEventListener('click',()=>run(exportColleague));
$('receive-colleague').addEventListener('click',()=>run(receiveColleague));
$('colleague-resume').addEventListener('click',()=>run(resumeColleague));
$('colleague-new-file').addEventListener('click',()=>{
 const pending=colleagueOperation();if(pending?.kind!=='receive'||pending.rejected!==true)return;
 writeStorage(colleagueKey()+':rejected:'+pending.id,JSON.stringify(pending));
 retainColleagueOperation(null);colleagueFile=null;$('colleague-file').value='';
 notice('The rejected request is retained. Choose the corrected complete return as a new receiving request.');
});
for(const id of ['colleague-reviewer','colleague-note','colleague-overall'])$(id).addEventListener('input',saveColleagueFeedback);
$('colleague-file').addEventListener('change',()=>{colleagueFile=$('colleague-file').files[0]??null;});
$('colleague-apply-form').addEventListener('submit',event=>{event.preventDefault();run(applyColleague);});

initialize();
