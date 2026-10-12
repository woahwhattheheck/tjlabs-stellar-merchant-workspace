// MIT. Original retained previews, response review and portable comparison files.
import { parseResponse, responseChanges, valueJsonChunks } from './comparison-values.mjs';
const DECISIONS = ['UNREVIEWED', 'ACCEPTED', 'CHANGES_REQUESTED', 'NOT_APPLICABLE'];
const json = value => JSON.stringify(value, null, 2) + '\n';
const copy = value => JSON.parse(JSON.stringify(value));
const emptyView = () => ({ definition: { title: '', pairs: [] }, selectedId: '', reviewDrafts: {},
  pending: [], recoveryId: '', recoveryGeneration: 1 });
const node = (tag, text, className) => {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = String(text);
  if (className) value.className = className;
  return value;
};
function download(name, bytes, type = 'application/json') {
  const href = URL.createObjectURL(new Blob([bytes], { type })), anchor = node('a');
  anchor.href = href; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
export function createComparisonWorkspace(ctx) {
  const root = document.getElementById('response-comparisons');
  let project = null, storageKey = null, view = emptyView(), opened = null, changes = null, packet = null, epoch = 0;
  let recovery = null, responses = null;
  const $ = suffix => root.querySelector('#comparison-' + suffix);
  const current = () => ctx.current();
  const references = () => current().saved?.comparisons ?? [];
  const latest = () => references().find(row => row.id === opened?.record.id);
  const isLatest = () => Boolean(opened && latest()?.generation === opened.record.generation
    && latest().recordSha256 === opened.reference.recordSha256);
  const draft = () => opened ? view.reviewDrafts[opened.record.id] : null;
  function persist() {
    if (storageKey) sessionStorage.setItem(storageKey, json({ schema: 'sf105-comparison-browser.v1', project, view }));
  }
  function changed(work) {
    try { work(); persist(); buttons(); }
    catch (error) { ctx.notice(error.message + ' Export the local request or notes before leaving this page.', true); }
  }
  function field(label, value, set, options = {}) {
    const wrapper = node('label', label), element = node(options.rows ? 'textarea' : 'input');
    if (options.rows) element.rows = options.rows;
    element.value = value ?? ''; element.type = options.type ?? 'text';
    if (options.max) element.maxLength = options.max;
    if (options.placeholder) element.placeholder = options.placeholder;
    element.addEventListener('input', () => changed(() => set(element.value)));
    wrapper.append(element); return wrapper;
  }
  function select(label, value, options, set) {
    const wrapper = node('label', label), element = node('select');
    for (const item of options) {
      const option = node('option', item.label); option.value = item.value; element.append(option);
    }
    element.value = value ?? '';
    element.addEventListener('change', () => changed(() => set(element.value)));
    wrapper.append(element); return wrapper;
  }
  function button(label, action, gate = 'project', message = label + '…') {
    const value = node('button', label, 'secondary'); value.type = 'button'; value.dataset.comparisonGate = gate;
    value.addEventListener('click', () => ctx.action(message, action)); return value;
  }
  function details(label, value) {
    const element = node('details'); element.append(node('summary', label), node('pre', typeof value === 'string' ? value : json(value)));
    return element;
  }
  function table(headings, rows) {
    const wrap = node('div', undefined, 'table-wrap'), result = node('table'), head = node('thead'), tr = node('tr');
    for (const text of headings) tr.append(node('th', text)); head.append(tr); result.append(head);
    const body = node('tbody');
    for (const cells of rows) {
      const row = node('tr');
      for (const value of cells) { const cell = node('td'); cell.append(value instanceof Node ? value : node('span', value)); row.append(cell); }
      body.append(row);
    }
    result.append(body); wrap.append(result); return wrap;
  }
  function buttons() {
    const selected = current(), writable = Boolean(selected.saved && !selected.dirty
      && selected.saved.revision === selected.saved.currentRevision);
    const review = draft(), basis = isLatest() && review?.basisGeneration === opened?.record.generation
      && review?.basisSha256 === opened?.reference.recordSha256;
    for (const element of root.querySelectorAll('button,input,textarea,select')) {
      const gate = element.dataset.comparisonGate;
      element.disabled = Boolean(selected.busy || !project
        || gate === 'clean' && !writable
        || gate === 'review' && (!writable || !basis || opened.record.generation >= 256)
        || gate === 'latest' && !isLatest()
        || gate === 'opened' && !opened
        || gate === 'retained' && (!opened || !references().some(row => row.id === opened.record.id && row.generation >= opened.record.generation))
        || gate === 'packet' && !isLatest()
        || gate === 'recover' && (!writable || !recovery || recovery.retained)
        || gate === 'add' && view.definition.pairs.length >= 32
        || gate === 'previous' && (!changes || changes.offset === 0)
        || gate === 'next' && changes?.nextOffset == null);
    }
    $('context').textContent = selected.saved
      ? 'Project ' + selected.saved.id + ' · saved revision ' + selected.saved.revision
        + ' · ' + (selected.saved.previews?.length ?? 0) + ' retained previews · ' + references().length + ' comparisons'
        + (selected.dirty ? '. Current editor changes are preserved. Save the draft before attaching a comparison or review.' : '')
      : 'Open a saved project to compare its original returned previews.';
  }
  function renderDefinition() {
    const target = $('definition'); target.replaceChildren();
    target.append(field('Comparison title', view.definition.title, value => { view.definition.title = value; }, { max: 160 }));
    const options = [{ value: '', label: 'Choose a retained preview' }, ...(current().saved?.previews ?? []).map(row => ({
      value: row.id, label: row.operation + ' · draft ' + row.draftRevision + ' · HTTP ' + row.status + ' · ' + row.id,
    }))];
    for (const [index, pair] of view.definition.pairs.entries()) {
      const card = node('fieldset', undefined, 'comparison-case'); card.append(node('legend', 'Case ' + (index + 1)));
      const titles = node('div', undefined, 'grid two');
      titles.append(field('Case ID', pair.id, value => { pair.id = value; }, { max: 64 }),
        field('Case title', pair.title, value => { pair.title = value; }, { max: 160 }));
      const previews = node('div', undefined, 'grid two');
      previews.append(select('Baseline preview', pair.baselineId, options, value => { pair.baselineId = value; }),
        select('Candidate preview', pair.candidateId, options, value => { pair.candidateId = value; }));
      card.append(titles, field('Question or expected behavior', pair.objective, value => { pair.objective = value; }, { max: 2000, rows: 2 }),
        previews, button('Remove case ' + (index + 1), async () => { view.definition.pairs.splice(index, 1); persist(); renderDefinition(); }));
      target.append(card);
    }
    const actions = node('div', undefined, 'toolbar');
    actions.append(button('Add comparison case', async () => {
      view.definition.pairs.push({ id: 'case-' + crypto.randomUUID().slice(0, 8), title: '', objective: '', baselineId: '', candidateId: '' });
      persist(); renderDefinition();
    }, 'add'), button('Prepare retained comparison', async () => {
      const saved = current().saved;
      const body = { project, expectedRevision: saved.revision, title: view.definition.title, pairs: copy(view.definition.pairs) };
      await submitPlan('/api/comparison/prepare', body, true);
    }, 'clean'), button('Download comparison definition', async () => download('comparison-definition.json',
      json({ project, expectedRevision: current().saved.revision, ...view.definition }))));
    target.append(actions); buttons();
  }
  function renderList() {
    const target = $('list'); target.replaceChildren();
    if (!references().length) { target.append(node('p', 'No retained response comparisons in this saved revision.')); return; }
    for (const row of [...references()].reverse()) {
      const card = node('div', undefined, 'comparison-reference');
      card.append(node('strong', row.title), node('p', row.cases + ' cases · generation ' + row.generation + ' · ' + row.review.state),
        button('Open ' + row.title, () => openComparison(row.id)), node('code', row.id));
      target.append(card);
    }
  }
  function initializeReview(value) {
    const id = value.record.id;
    if (!view.reviewDrafts[id]) view.reviewDrafts[id] = {
      basisGeneration: value.record.generation, basisSha256: value.reference.recordSha256,
      value: copy(value.record.review), dirty: false,
    };
  }
  async function openComparison(id, generation) {
    const ticket = epoch, selected = current().saved;
    const query = { project, revision: selected.revision, comparisonId: id,
      ...(generation === undefined ? {} : { generation }) };
    const value = await ctx.api('/api/comparison?' + new URLSearchParams(query));
    if (ticket !== epoch || selected.id !== project) return;
    opened = value; changes = null; responses = null; packet = null;
    view.selectedId = id; initializeReview(value); persist(); renderOpened(); renderPacket(); buttons();
  }
  function renderReview() {
    const target = $('review'); target.replaceChildren(); const active = draft();
    if (!opened || !active) return;
    const record = opened.record;
    target.append(node('h3', 'Review decisions'), node('p', 'Draft notes are retained separately from the immutable source comparison. Reviewer labels identify the entered name; they are not authenticated signatures.'));
    target.append(node('p', 'Review draft basis: generation ' + active.basisGeneration
      + (active.dirty ? ' · unsaved decisions or notes' : ' · matches the last loaded review')));
    if (active.basisGeneration !== record.generation || active.basisSha256 !== opened.reference.recordSha256) {
      target.append(button('Use opened generation as review basis', async () => {
        active.basisGeneration = record.generation; active.basisSha256 = opened.reference.recordSha256; active.dirty = true;
        const prior = new Map(active.value.decisions.map(row => [row.pairId, row]));
        active.value.decisions = record.definition.pairs.map(pair => prior.get(pair.id)
          ?? { pairId: pair.id, decision: 'UNREVIEWED', notes: '' });
        persist(); renderReview();
      }, 'latest'));
    }
    const edit = (key, value) => { active.value[key] = value; active.dirty = true; };
    target.append(field('Reviewer label', active.value.reviewer, value => edit('reviewer', value), { max: 160 }),
      field('Overall review notes', active.value.notes, value => edit('notes', value), { max: 8000, rows: 4 }));
    for (const decision of active.value.decisions) {
      const pair = record.definition.pairs.find(row => row.id === decision.pairId);
      const card = node('div', undefined, 'comparison-case'); card.append(node('h4', pair?.title ?? decision.pairId));
      card.append(select('Decision for ' + decision.pairId, decision.decision, DECISIONS.map(value => ({ value, label: value })), value => {
        decision.decision = value; active.dirty = true;
      }), field('Notes for ' + decision.pairId, decision.notes, value => { decision.notes = value; active.dirty = true; }, { rows: 3, max: 4000 }));
      target.append(card);
    }
    const actions = node('div', undefined, 'toolbar');
    actions.append(button('Save review generation', async () => {
      await submitPlan('/api/comparison/review', { project, expectedRevision: current().saved.revision,
        comparisonId: record.id, expectedGeneration: active.basisGeneration, expectedRecordSha256: active.basisSha256,
        ...copy(active.value) }, true);
    }, 'review'), button('Download review draft', async () => download('comparison-review-draft.json', json({
      project, comparisonId: record.id, expectedRevision: current().saved.revision,
      expectedGeneration: active.basisGeneration, expectedRecordSha256: active.basisSha256, ...active.value,
    }))), button('Load saved review decisions', async () => {
      if (active.dirty && !confirm('Replace these unsaved review notes with the opened saved generation?')) return;
      view.reviewDrafts[record.id] = { basisGeneration: record.generation, basisSha256: opened.reference.recordSha256,
        value: copy(record.review), dirty: false }; persist(); renderReview();
    }, 'opened'));
    target.append(actions); buttons();
  }
  function renderOpened() {
    const target = $('opened'); target.replaceChildren();
    if (!opened) { $('review').replaceChildren(); $('changes').replaceChildren(); return; }
    const { record, reference } = opened;
    target.append(node('h3', record.definition.title), node('p', 'Comparison ' + record.id + ' · generation ' + record.generation
      + ' · original selection revision ' + record.definition.selectedRevision + ' · ' + reference.review.state),
      node('code', reference.recordSha256));
    const controls = node('div', undefined, 'toolbar');
    controls.append(button('Open latest retained generation', () => openComparison(record.id), 'retained'),
      select('Review history', String(record.generation), [...opened.history].reverse().map(row => ({
        value: String(row.generation), label: 'Generation ' + row.generation + ' · ' + row.review.state + ' · ' + row.updatedAt,
      })), value => {
        ctx.action('Opening original comparison generation…', () => openComparison(record.id, Number(value)));
      }));
    target.append(controls);
    target.append(table(['Case', 'Baseline', 'Candidate', 'Returned values and status'], record.definition.pairs.map(pair => {
      const a = record.analysis.find(row => row.pairId === pair.id);
      const title = node('div'); title.append(node('strong', pair.title), node('p', pair.objective),
        button('Inspect ' + pair.id, () => loadChanges(pair.id, 0), 'retained'));
      return [title, a.baseline.operation + ' · draft ' + pair.baseline.draftRevision + ' · HTTP ' + a.baseline.status,
        a.candidate.operation + ' · draft ' + pair.candidate.draftRevision + ' · HTTP ' + a.candidate.status,
        (a.response.changes ? a.response.changes.total + ' value differences' : 'Structured comparison unavailable')
        + ' · ' + (a.sameResponseBytes ? 'identical bytes' : 'different bytes') + ' · ' + (a.sameStatus ? 'same status' : 'changed status')];
    })));
    target.append(details('Original comparison, source identities and observed intervals', record),
      details('Saved decisions in this generation', record.review));
    renderReview(); renderChanges();
  }
  async function loadChanges(pairId, offset) {
    const ticket = epoch, chosen = opened;
    const value = await ctx.api('/api/comparison/changes?' + new URLSearchParams({
      project, revision: current().saved.revision, comparisonId: chosen.record.id,
      generation: chosen.record.generation, expectedRecordSha256: chosen.reference.recordSha256, pairId, offset, limit: 50,
    }));
    if (ticket !== epoch || opened !== chosen) return;
    changes = value; responses = null; renderChanges(); buttons();
  }
  async function sourceResponses() {
    if (responses) return responses;
    const chosen = changes, ticket = epoch, items = [];
    for (const side of ['baseline', 'candidate']) {
      const expected = chosen.pair[side], value = await ctx.api('/api/authoring/preview?' + new URLSearchParams({ id: project, previewId: expected.id }));
      if (value.id !== expected.id || value.project !== project || value.inputDigest !== expected.inputDigest
          || value.responseSha256 !== chosen.summary[side].responseSha256)
        throw new Error('The returned original preview differs from this comparison.');
      const bytes = Uint8Array.from(atob(value.responseBase64), char => char.charCodeAt(0));
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
      if (hash !== value.responseSha256 || bytes.length !== value.responseBytes) throw new Error('The original response byte identity changed.');
      let parsed;
      try { parsed = parseResponse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { parsed = { structured: false, error: 'The original response is not valid UTF-8 JSON.' }; }
      items.push({ value, bytes, parsed });
    }
    if (ticket !== epoch || changes !== chosen) throw new Error('The selected comparison case changed.');
    responses = items; return items;
  }
  async function showValue(path) {
    const [left, right] = await sourceResponses();
    if (!left.parsed.structured || !right.parsed.structured) throw new Error('Open the original response bytes for this non-JSON result.');
    for (const row of responseChanges(left.parsed.value, right.parsed.value)) if (row.path === path) {
      const target = $('full-value'); target.replaceChildren(node('h4', path || '(response root)'));
      const columns = node('div', undefined, 'grid two');
      for (const side of ['baseline', 'candidate']) {
        const column = node('div'); column.append(node('strong', side), node('pre', [...valueJsonChunks(row[side])].join(''))); columns.append(column);
      }
      target.append(columns); return;
    }
    throw new Error('That change is not in the selected original response pair.');
  }
  function renderChanges() {
    const target = $('changes'); target.replaceChildren(); if (!changes) return;
    const value = changes; target.append(node('h3', 'Case: ' + value.pair.title));
    target.append(node('p', 'Object order and numeric formatting are ignored; array order is significant. Duplicate keys keep their last value. Missing differs from null. Byte equality and HTTP status remain separate.'));
    target.append(details('Queries, variables, schema/source identities and actual observation intervals', {
      baselineRequest: value.baselineRequest, candidateRequest: value.candidateRequest, summary: value.summary,
    }));
    const controls = node('div', undefined, 'toolbar');
    controls.append(button('Previous differences', () => loadChanges(value.pair.id, Math.max(0, value.offset - 50)), 'previous'),
      button('Next differences', () => loadChanges(value.pair.id, value.nextOffset), 'next'),
      node('span', 'Differences ' + (value.items.length ? value.offset + 1 : 0) + '–' + (value.offset + value.items.length)));
    for (const [index, side] of ['baseline', 'candidate'].entries()) controls.append(button('Download original ' + side + ' response', async () => {
      const item = (await sourceResponses())[index];
      download(side + '-' + item.value.id + '.json', item.bytes, item.value.responseType);
    }));
    target.append(controls);
    if (!value.structured) target.append(node('p', 'Structured comparison unavailable. Baseline: '
      + (value.baselineError ?? 'valid JSON') + '. Candidate: ' + (value.candidateError ?? 'valid JSON') + '. Original response downloads retain the complete bytes.'));
    else target.append(table(['JSON pointer', 'Change', 'Baseline value', 'Candidate value'], value.items.map(row => [
      button(row.path || '(response root)', () => showValue(row.path)), row.change,
      row.baseline.text + (row.baseline.truncated ? ' … (excerpt; open pointer for complete value)' : ''),
      row.candidate.text + (row.candidate.truncated ? ' … (excerpt; open pointer for complete value)' : ''),
    ])));
    const full = node('div'); full.id = 'comparison-full-value'; target.append(full); buttons();
  }
  function hint(plan) {
    return { comparisonId: plan.path.endsWith('/prepare') ? plan.body.id : plan.body.comparisonId,
      generation: plan.path.endsWith('/prepare') ? 1 : plan.path.endsWith('/review') ? plan.body.expectedGeneration + 1 : plan.body.generation };
  }
  async function submitPlan(path, body, withId = false) {
    if (current().dirty) throw new Error('Save the current raw draft before attaching a comparison or review. Its edits remain intact.');
    const comparable = input => { const value = copy(input); if (withId) delete value.id; return json(value); };
    let plan = view.pending.find(row => row.path === path && comparable(row.body) === comparable(body));
    if (!plan) {
      plan = { key: crypto.randomUUID(), path, body: { ...(withId ? { id: crypto.randomUUID() } : {}), ...copy(body) },
        createdAt: new Date().toISOString(), state: 'RETAINED', error: '' };
      view.pending.push(plan);
    }
    persist(); renderPending(); await dispatch(plan);
  }
  async function dispatch(plan) {
    if (plan.body.project !== project || current().dirty) throw new Error('Select this request’s original project and preserve its editor before continuation.');
    persist();
    try {
      const result = await ctx.api(plan.path, copy(plan.body));
      await ctx.acceptProject(result.project);
      view.selectedId = result.record.id;
      if (plan.path.endsWith('/review')) {
        const local = view.reviewDrafts[result.record.id], requested = {
          reviewer: plan.body.reviewer, notes: plan.body.notes ?? '', decisions: plan.body.decisions,
        };
        if (!local || local.basisGeneration === plan.body.expectedGeneration
            && local.basisSha256 === plan.body.expectedRecordSha256 && json(local.value) === json(requested))
          view.reviewDrafts[result.record.id] = { basisGeneration: result.record.generation,
            basisSha256: result.reference.recordSha256, value: copy(result.record.review), dirty: false };
      }
      await openComparison(result.record.id, result.record.generation);
      view.pending = view.pending.filter(row => row.key !== plan.key); persist(); renderPending(); renderList();
      recovery = null; renderRecovery(); ctx.notice('Retained comparison generation ' + result.record.generation + ' in project revision ' + result.project.revision + '.');
    } catch (error) {
      plan.state = error.status ? 'RESPONSE_RETURNED' : 'OUTCOME_UNKNOWN'; plan.error = error.message;
      const selected = hint(plan); view.recoveryId = selected.comparisonId; view.recoveryGeneration = selected.generation;
      persist(); renderPending(); renderRecovery(); throw error;
    }
  }
  async function inspectRecovery(id, generation) {
    const ticket = epoch, value = await ctx.api('/api/comparison/pending?' + new URLSearchParams({ project, comparisonId: id, generation }));
    if (ticket !== epoch) return;
    recovery = value; view.recoveryId = id; view.recoveryGeneration = generation; persist(); renderRecovery(); buttons();
  }
  function renderPending() {
    const target = $('pending'); target.replaceChildren();
    if (!view.pending.length) { target.append(node('p', 'No unresolved comparison requests retained in this browser.')); return; }
    target.append(node('h3', 'Original requests awaiting reconciliation'));
    for (const plan of view.pending) {
      const card = node('div', undefined, 'comparison-case'), selected = hint(plan);
      card.append(node('strong', plan.path.split('/').at(-1) + ' · ' + selected.comparisonId + ' · generation ' + selected.generation),
        node('p', plan.state + (plan.error ? ': ' + plan.error : '')));
      const actions = node('div', undefined, 'toolbar');
      actions.append(button('Continue exact original request', () => dispatch(plan), 'clean'),
        button('Inspect retained generation', () => inspectRecovery(selected.comparisonId, selected.generation)),
        button('Download original request', async () => download((plan.body.id ?? plan.key) + '.request.json', json(plan.body))),
        button('Remove this browser reminder', async () => {
          if (!confirm('Remove only this browser reminder? The original saved comparison/request remains unchanged. Download the request first if its outcome is unknown.')) return;
          view.pending = view.pending.filter(row => row.key !== plan.key); persist(); renderPending();
        }));
      card.append(actions); target.append(card);
    }
    buttons();
  }
  function renderRecovery() {
    const target = $('recovery'); target.replaceChildren();
    const controls = node('div', undefined, 'grid two');
    controls.append(field('Original comparison UUID', view.recoveryId, value => { view.recoveryId = value; recovery = null; }, { max: 36 }),
      field('Original generation', view.recoveryGeneration, value => { view.recoveryGeneration = Number(value); recovery = null; }, { type: 'number' }));
    target.append(controls, button('Inspect original retained result', () => inspectRecovery(view.recoveryId, view.recoveryGeneration)));
    if (recovery) {
      target.append(node('p', recovery.retained ? 'This original generation is already attached to the project.'
        : 'This completed generation is retained and can be attached without changing the current draft.'),
      details('Retained generation and exact original request', recovery));
      if (recovery.retained) target.append(button('Open attached comparison', async () => {
        const saved = await ctx.api('/api/project?id=' + encodeURIComponent(project));
        if (current().dirty) throw new Error('Save the current editor before opening the refreshed saved project.');
        await ctx.acceptProject(saved); await openComparison(recovery.record.id, recovery.record.generation);
      }, 'clean'));
      else target.append(button('Attach exact retained generation', async () => {
        await submitPlan('/api/comparison/recover', { project, comparisonId: recovery.record.id,
          generation: recovery.record.generation, expectedRecordSha256: recovery.reference.recordSha256,
          expectedRevision: current().saved.revision });
      }, 'recover'));
    }
    buttons();
  }
  function renderPacket() {
    const target = $('packet'); target.replaceChildren();
    target.append(node('h3', 'Portable reviewer packet'), node('p',
      'Prepare the generation retained in this saved project revision. Its complete folder includes every selected response, original query/schema draft, review generation and self-contained case page. Full project handover also retains the comparison so another operator can continue its reviews.'));
    target.append(button('Prepare complete comparison packet', async () => {
      const selected = { project, revision: current().saved.revision, comparisonId: opened.record.id };
      const ticket = epoch, value = await ctx.api('/api/comparison/packet', selected);
      if (ticket !== epoch) return;
      packet = value; renderPacket(); ctx.notice('Complete comparison packet prepared in ' + value.directory + '.');
    }, 'packet'));
    if (!packet) { buttons(); return; }
    target.append(node('p', 'Open index.html in this complete private folder, or receive the same selection through the installed GraphQL client:'),
      node('code', packet.directory), details('Exact native file selection and manifest', packet));
    const actions = node('div', undefined, 'toolbar');
    for (const file of packet.manifest.files.filter(row => row.name.endsWith('.html'))) {
      actions.append(button('Download ' + file.name, () => ctx.download('/api/comparison/file?' + new URLSearchParams({
        project: packet.selection.project, revision: packet.selection.revision, comparisonId: packet.selection.comparisonId,
        file: file.name, expectedManifestSha256: packet.manifestFile.sha256,
      }).toString(), file.name.split('/').at(-1))));
    }
    target.append(actions, node('p', 'Individual case pages include their original response bytes. Keep the complete folder for working links to all source drafts, history and the comparison index.'));
    buttons();
  }
  function reset() {
    const selected = current().saved?.id ?? null, key = selected
      ? 'sf105-comparisons:' + ctx.directory() + ':' + selected : null;
    if (selected !== project || key !== storageKey) {
      try { persist(); } catch (error) { ctx.notice(error.message, true); }
      project = selected; storageKey = key; view = emptyView(); opened = null; changes = null; responses = null; recovery = null; packet = null; epoch++;
      if (key) try {
        const retained = JSON.parse(sessionStorage.getItem(key) ?? 'null');
        if (retained?.schema === 'sf105-comparison-browser.v1' && retained.project === project && retained.view) view = retained.view;
      } catch (error) { ctx.notice('The local comparison draft could not be reopened: ' + error.message, true); }
    }
    renderDefinition(); renderList(); renderOpened(); renderPending(); renderRecovery(); renderPacket(); buttons();
  }
  return { reset, buttons, open: openComparison, inspectPending: inspectRecovery, pending: () => view.pending.length > 0 || Object.values(view.reviewDrafts).some(row => row.dirty) };
}
