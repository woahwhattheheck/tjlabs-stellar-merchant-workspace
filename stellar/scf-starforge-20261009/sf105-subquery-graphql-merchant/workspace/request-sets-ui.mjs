// MIT. Saved request sets, original connected runs and retained comparison cohorts.
export function createRequestSetsWorkspace(ctx) {
  const root = document.getElementById('request-sets-panel');
  const $ = name => root.querySelector('#requests-' + name);
  const json = value => JSON.stringify(value, null, 2) + '\n';
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const blank = () => ({ definition: { title: '', notes: '', cases: [], basedOn: null, dirty: false },
    selectedSetId: '', selectedRunId: '', generation: null, caseIds: [], runTitle: '', allowLoopback: false,
    comparison: { title: '', baseline: null, candidate: null, caseIds: [] },
    recovery: { kind: 'set', id: '', generation: '' }, pending: [] });
  let project = null, storageKey = null, view = blank(), epoch = 0, poll = null, readSequence = 0;
  let selectedSet = null, selectedRun = null, inspected = null, packet = null, serverProject = null;
  const current = () => ctx.current();
  const saved = () => serverProject?.id === project ? serverProject : current().saved;
  const active = () => selectedRun?.job && !selectedRun.job.settled;
  const detail = (title, value) => {
    const item = node('details'); item.append(node('summary', title), node('pre', json(value), 'code')); return item;
  };
  function persist() {
    if (storageKey) sessionStorage.setItem(storageKey, json({ schema: 'sf105-request-sets-browser.v1', project, view }));
  }
  function edit(work) {
    work(); persist(); buttons();
  }
  function button(label, work, gate = 'saved') {
    const element = node('button', label, 'secondary'); element.type = 'button'; element.dataset.requestGate = gate;
    element.addEventListener('click', () => ctx.action(label + '…', work)); return element;
  }
  function field(label, value, change, { multiline = false, max = 6000, rows = 3, type = 'text' } = {}) {
    const wrapper = node('label', label), input = node(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = type; else { input.rows = rows; input.spellcheck = false; input.className = 'code'; }
    input.value = value ?? ''; input.maxLength = max; input.dataset.requestGate = 'saved';
    input.addEventListener('input', () => edit(() => change(input.value))); wrapper.append(input); return wrapper;
  }
  function select(label, value, options, change) {
    const wrapper = node('label', label), input = node('select');
    input.dataset.requestGate = 'saved';
    for (const [id, title] of options) { const option = node('option', title); option.value = id; input.append(option); }
    if (![...input.options].some(option => option.value === value)) {
      const retained = node('option', value + ' · retained selection'); retained.value = value; input.append(retained);
    }
    input.value = value ?? '';
    input.addEventListener('change', () => ctx.action('Selecting original source…', async () => { await change(input.value); persist(); buttons(); }));
    wrapper.append(input); return wrapper;
  }
  function checkbox(label, checked, change) {
    const wrapper = node('label', undefined, 'checkbox'), input = node('input'); input.type = 'checkbox'; input.checked = checked;
    input.dataset.requestGate = 'saved'; input.addEventListener('change', () => edit(() => change(input.checked)));
    wrapper.append(input, document.createTextNode(label)); return wrapper;
  }
  function buttons() {
    const selected = current(), clean = selected.saved && !selected.dirty && selected.saved.revision === selected.saved.currentRevision;
    for (const element of root.querySelectorAll('button,input,textarea,select')) {
      const gate = element.dataset.requestGate ?? 'saved';
      element.disabled = Boolean(selected.busy || gate !== 'any' && !selected.saved
        || gate === 'clean' && !clean
        || gate === 'add' && (!clean || view.definition.cases.length >= 32)
        || gate === 'start' && (!clean || !selectedSet || !view.caseIds.length ||
          selectedSet.record.inputDigest !== selected.saved.inputDigest)
        || gate === 'control' && !active()
        || gate === 'continue' && (!clean || !selectedRun || active() ||
          selectedRun.record.generation !== selectedRun.attachedGeneration)
        || gate === 'packet' && active()
        || gate === 'compare' && (!clean || !view.comparison.baseline || !view.comparison.candidate || !view.comparison.caseIds.length));
    }
  }
  function operations() {
    try { return JSON.parse(current().saved?.input.queriesText ?? '{}').operations ?? []; } catch { return []; }
  }
  function definitionValue() {
    return { title: view.definition.title, notes: view.definition.notes, basedOn: view.definition.basedOn,
      cases: view.definition.cases.map(item => {
        let variables;
        try { variables = JSON.parse(item.variablesText); } catch { throw new Error('Case ' + item.id + ' has unfinished variables JSON. Its text is retained.'); }
        if (!plain(variables)) throw new Error('Case ' + item.id + ' needs a variable object.');
        return { id: item.id, title: item.title, operation: item.operation, variables, notes: item.notes };
      }) };
  }
  function useDefinition(value, basedOn = null) {
    const source = value.request?.cases ? value.request : value;
    if (!plain(source) || !Array.isArray(source.cases) || !source.cases.length || source.cases.length > 32 ||
        source.cases.some(item => !plain(item) || !plain(item.variables)))
      throw new Error('Load a named definition containing 1–32 original operation/variable cases.');
    view.definition = { title: source.title ?? '', notes: source.notes ?? '', basedOn,
      cases: source.cases.map(item => ({ id: item.id, title: item.title, operation: item.operation,
        notes: item.notes ?? '', variablesText: json(item.variables) })), dirty: true };
    persist(); renderDefinition();
  }
  async function latestProject() {
    if (!project || current().dirty) throw new Error('Save the original schema/query draft first. Its unfinished text remains intact.');
    const identity = project, value = await ctx.api('/api/project?id=' + encodeURIComponent(identity));
    if (project !== identity || current().dirty) throw new Error('The original editor selection changed.');
    if (current().saved?.inputDigest !== value.inputDigest)
      throw new Error('The native source draft changed. Open its current revision before attaching this request operation.');
    await ctx.acceptProject(value); serverProject = value; return value;
  }
  async function adopt(value) {
    if (!value || value.id !== project) return;
    serverProject = value;
    if (!current().dirty && current().saved?.id === value.id) await ctx.acceptProject(value);
    else ctx.notice('The native run saved revision ' + value.revision + '. Your current editor text remains intact.');
  }
  function planHint(plan) {
    const kind = plan.path.endsWith('/compare') ? 'comparison' : plan.path.includes('/request-set/') ? 'set' : 'run';
    return { kind, id: kind === 'set' ? plan.body.requestSetId ?? plan.body.id
      : kind === 'run' ? plan.body.runId ?? plan.body.id : plan.body.id };
  }
  async function sendPlan(plan) {
    const ticket = epoch, identity = project;
    if (!view.pending.some(item => item.id === plan.id)) {
      if (view.pending.length >= 16) throw new Error('Resolve or download the existing original request reminders before adding another.');
      view.pending.push(structuredClone(plan)); persist(); renderPending();
    }
    try {
      const result = await ctx.api(plan.path, plan.body);
      if (ticket !== epoch || identity !== project) return result;
      view.pending = view.pending.filter(item => item.id !== plan.id); persist();
      if (plan.path.includes('/request-set/')) {
        selectedSet = result; view.selectedSetId = result.record.id; view.caseIds = result.record.cases.map(item => item.id);
        try { view.definition.dirty = json(definitionValue()) !== json({ title: result.record.title, notes: result.record.notes,
          basedOn: result.record.request.basedOn, cases: result.record.request.cases }); } catch {}
      } else if (plan.path.endsWith('/compare')) {
        await adopt(result.project); await ctx.openComparison(result.record.id, result.record.generation);
        renderPending(); return result;
      } else if (result.record?.schema === 'stellar-forge.graphql-request-run.v1') {
        selectedRun = result; view.selectedRunId = result.record.id; view.generation = result.record.generation;
      } else if (result.job && selectedRun?.record.id === result.runId) selectedRun.job = result.job;
      persist(); await adopt(result.project); persist(); renderAll(); schedule();
      return result;
    } catch (error) {
      if (ticket === epoch) {
        const hint = planHint(plan);
        if (!plan.path.endsWith('/compare')) view.recovery = { kind: hint.kind, id: hint.id, generation: '' };
        persist(); renderPending(); renderRecovery();
      }
      throw error;
    }
  }
  async function submit(path, body) {
    if (current().dirty && !path.endsWith('/control')) throw new Error('Save the raw source draft before attaching this operation.');
    const plan = { id: crypto.randomUUID(), path, body: structuredClone(body), retainedAt: new Date().toISOString() };
    return sendPlan(plan);
  }
  function download(name, value) {
    const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : json(value)], { type: 'application/json' }));
    const anchor = node('a'); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function renderDefinition() {
    const target = $('definition'); target.replaceChildren();
    target.append(field('Request-set title', view.definition.title, value => { view.definition.title = value; view.definition.dirty = true; }, { max: 160 }),
      field('Purpose and case notes', view.definition.notes, value => { view.definition.notes = value; view.definition.dirty = true; }, { multiline: true }));
    if (view.definition.basedOn) target.append(node('p', 'New set based on original ' + view.definition.basedOn.id +
      '. Saving revalidates these same case IDs against the selected saved source.'));
    const choices = operations().map(item => [item.name, item.name]);
    view.definition.cases.forEach((item, index) => {
      const card = node('fieldset', undefined, 'comparison-case'); card.append(node('legend', 'Case ' + (index + 1)));
      const changed = (key, value) => { item[key] = value; view.definition.dirty = true; };
      const grid = node('div', undefined, 'grid three');
      grid.append(field('Stable case ID', item.id, value => changed('id', value), { max: 64 }),
        field('Case title', item.title, value => changed('title', value), { max: 160 }),
        select('Original approved operation', item.operation, choices, async value => edit(() => changed('operation', value))));
      card.append(grid, field('Variables JSON', item.variablesText, value => changed('variablesText', value),
        { multiline: true, rows: 4, max: 65536 }), field('Case purpose', item.notes, value => changed('notes', value), { multiline: true, max: 2000 }));
      const actions = node('div', undefined, 'toolbar');
      actions.append(button('Duplicate case with new case ID', async () => {
        view.definition.cases.splice(index + 1, 0, { ...structuredClone(item), id: 'case-' + crypto.randomUUID().slice(0, 8) });
        view.definition.dirty = true; persist(); renderDefinition();
      }, 'add'), button('Remove case from this draft', async () => {
        view.definition.cases.splice(index, 1); view.definition.dirty = true; persist(); renderDefinition();
      }));
      card.append(actions); target.append(card);
    });
    const actions = node('div', undefined, 'toolbar');
    actions.append(button('Add variable case', async () => {
      view.definition.cases.push({ id: 'case-' + crypto.randomUUID().slice(0, 8), title: '', operation: choices[0]?.[0] ?? '',
        variablesText: '{}', notes: '' }); view.definition.dirty = true; persist(); renderDefinition();
    }, 'add'), button('Use all saved operations', async () => {
      const original = operations();
      if (!original.length || original.length > 32) throw new Error('Choose a saved project with 1–32 approved operations.');
      let routes = [];
      try { routes = JSON.parse(current().saved.input.planText).routes ?? []; } catch {}
      const value = { title: current().saved.input.title + ' requests', notes: '', cases: original.map(item => ({
        id: item.name, title: item.name, operation: item.name,
        variables: routes.find(route => route.operation === item.name)?.variables ?? {}, notes: '' })) };
      if (view.definition.dirty && !confirm('Replace this browser request-set draft with the saved operations? Download it first to retain a separate copy.')) return;
      useDefinition(value);
    }, 'clean'), button('Save named request set', async () => {
      const value = definitionValue(), original = await latestProject();
      await submit('/api/request-set/prepare', { id: crypto.randomUUID(), project, expectedRevision: original.revision, ...value });
      ctx.notice('Named cases saved with their original operation, variable and schema admission.');
    }, 'clean'), button('Download request-set draft', async () => {
      download('request-set-browser-draft.json', { schema: 'sf105-request-set-draft.v1', ...view.definition });
    }));
    const picker = node('input'); picker.type = 'file'; picker.accept = '.json'; picker.dataset.requestGate = 'saved';
    const label = node('label', 'Load request-set definition'); label.append(picker);
    picker.addEventListener('change', () => ctx.action('Loading named request cases…', async () => {
      const file = picker.files[0]; if (!file) return;
      if (file.size > 3 * 1024 * 1024) throw new Error('The request definition exceeds its original bound.');
      const value = JSON.parse(await file.text());
      if (value.schema === 'sf105-request-set-draft.v1') {
        if (!Array.isArray(value.cases) || value.cases.length > 32 || value.cases.some(item => typeof item.variablesText !== 'string'))
          throw new Error('This browser draft is inconsistent.');
        view.definition = { title: value.title ?? '', notes: value.notes ?? '', cases: value.cases, basedOn: value.basedOn ?? null, dirty: true };
        persist(); renderDefinition();
      } else useDefinition(value);
    }));
    target.append(actions, label); buttons();
  }
  async function openSet(id) {
    const ticket = epoch, sequence = ++readSequence;
    clearTimeout(poll); poll = null;
    const value = await ctx.api('/api/request-set?' + new URLSearchParams({ project, requestSetId: id }));
    if (ticket !== epoch || sequence !== readSequence) return;
    selectedSet = value; serverProject = value.project; view.selectedSetId = id; view.caseIds = value.record.cases.map(item => item.id);
    selectedRun = null; view.selectedRunId = ''; view.generation = null; renderRun();
    packet = null; persist(); renderLists(); renderSet(); renderPacket();
  }
  async function openRun(id, generation, { polling = false } = {}) {
    const ticket = epoch, sequence = ++readSequence;
    const value = await ctx.api('/api/request-run?' + new URLSearchParams({ project, runId: id, ...(generation ? { generation } : {}) }));
    if (ticket !== epoch || sequence !== readSequence || polling && view.selectedRunId !== id) return;
    selectedRun = value; serverProject = value.project; view.selectedRunId = id; view.generation = value.record.generation;
    if (!polling) {
      packet = null; selectedSet = { record: value.requestSet, recordSha256: value.requestSetSha256, project: value.project };
      view.selectedSetId = value.requestSet.id; view.caseIds = value.record.cases.map(item => item.id); renderSet();
    }
    persist(); renderLists(); renderRun(); if (!polling) renderPacket(); schedule();
  }
  function schedule() {
    clearTimeout(poll); poll = null;
    if (!active() || !view.selectedRunId || view.generation < selectedRun.attachedGeneration) return;
    const selected = view.selectedRunId, ticket = epoch, sequence = readSequence;
    poll = setTimeout(async () => {
      if (ticket !== epoch || sequence !== readSequence || view.selectedRunId !== selected) return;
      if (current().busy) { schedule(); return; }
      try {
        const summary = await ctx.api('/api/request-run?' + new URLSearchParams({ project, runId: selected, compact: 'true' }));
        if (ticket !== epoch || sequence !== readSequence || view.selectedRunId !== selected) return;
        if (summary.reference.recordSha256 !== selectedRun?.recordSha256) await openRun(selected, undefined, { polling: true });
        else { selectedRun.job = summary.job; renderJob(); buttons(); schedule(); }
      }
      catch (error) { ctx.notice('The original run status was not returned: ' + error.message + '. Refresh it to continue reading.', true); }
    }, 5000);
  }
  function renderLists() {
    $('context').textContent = project ? 'Project ' + project + ' · editor revision ' + current().saved.revision +
      ' · current observed native revision ' + (saved()?.revision ?? current().saved.revision) +
      (current().dirty ? '. Your raw editor changes are preserved.' : '') : 'Save or open a project to retain request cases and connected runs.';
    const target = $('list'); target.replaceChildren();
    target.append(node('h3', 'Saved request sets'));
    for (const item of saved()?.requestSets ?? []) {
      const card = node('div', undefined, 'comparison-reference');
      card.append(node('strong', item.title), node('p', item.caseCount + ' cases · source revision ' + item.draftRevision),
        button('Open saved set ' + item.id, () => openSet(item.id))); target.append(card);
    }
    target.append(node('h3', 'Original run history'));
    for (const item of saved()?.requestRuns ?? []) {
      const card = node('div', undefined, 'comparison-reference');
      card.append(node('strong', item.title), node('p', item.state + ' · ' + item.completedCases + '/' + item.caseCount +
        ' completed responses · ' + item.unresolvedCases + ' unresolved · generation ' + item.generation),
        button('Open original run ' + item.id, () => openRun(item.id))); target.append(card);
    }
    target.append(button('Refresh saved sets and run history', async () => {
      const ticket = epoch, value = await ctx.api('/api/project?id=' + encodeURIComponent(project));
      if (ticket !== epoch) return; serverProject = value; renderLists(); buttons();
    }));
    buttons();
  }
  function renderSet() {
    const target = $('set'); target.replaceChildren();
    if (!selectedSet) return;
    const value = selectedSet.record;
    target.append(node('h3', value.title), node('p', value.cases.length + ' cases · original source revision ' + value.draftRevision),
      detail('Original saved set and source admission', value),
      button('Copy this set onto the current saved source', async () => {
        if (view.definition.dirty && !confirm('Replace the current browser request-set draft with these saved cases?')) return;
        useDefinition(value, { id: value.id, recordSha256: selectedSet.recordSha256 });
        $('definition').scrollIntoView({ block: 'start' });
      }));
    target.append(field('New run title', view.runTitle, value => { view.runTitle = value; }, { max: 160 }));
    for (const item of value.cases) target.append(checkbox(item.title + ' · ' + item.id + ' · ' + item.operation,
      view.caseIds.includes(item.id), checked => {
        view.caseIds = checked ? [...new Set([...view.caseIds, item.id])] : view.caseIds.filter(id => id !== item.id);
      }));
    target.append(checkbox('Allow the saved source on 127.0.0.1 for this original run', view.allowLoopback,
      value => { view.allowLoopback = value; }),
      node('p', 'Starting sends each selected case through its original handler once. Source access and usage terms apply. ' +
        'HTTP 402 and other returned errors are retained; this workflow does not arrange or repeat a payment.'),
      button('Start selected original cases', async () => {
        const set = selectedSet, cases = [...view.caseIds], title = view.runTitle || set.record.title;
        const original = await latestProject();
        if (set.record.inputDigest !== original.inputDigest) throw new Error('Copy and save this set against the changed source before starting another run.');
        const result = await submit('/api/request-run/start', { id: crypto.randomUUID(), project, expectedRevision: original.revision,
          requestSetId: set.record.id, requestSetSha256: set.recordSha256, title, caseIds: cases, allowLoopback: view.allowLoopback });
        if (result?.record) ctx.notice('Original run admitted: ' + result.record.id + '. Its selected case UUIDs were saved before source requests.');
      }, 'start'));
    buttons();
  }
  function renderJob() {
    const target = $('job'), job = selectedRun?.job;
    if (target) target.textContent = job ? 'Original attempt ' + job.attemptId + ' · ' + job.state +
      (job.currentCaseId ? ' · current case ' + job.currentCaseId : '') +
      (!job.settled && ['FINISHED', 'INTERRUPTED'].includes(job.state) ? ' · retaining original attempt completion' : '') : '';
  }
  function snapshot(run) {
    return { runId: run.record.id, generation: run.record.generation, recordSha256: run.recordSha256,
      title: run.record.title, cases: run.record.cases.filter(item => item.state === 'COMPLETED').map(item => item.id) };
  }
  function renderRun() {
    const target = $('run'); target.replaceChildren();
    if (!selectedRun) return;
    const value = selectedRun, record = value.record;
    target.append(node('h3', record.title), node('p', record.state + ' · generation ' + record.generation +
      ' · attached generation ' + value.attachedGeneration), node('p', 'Original run ' + record.id),
      select('Retained run generation', String(record.generation), value.history.map(item =>
        [String(item.generation), item.generation + ' · ' + item.state + ' · ' + item.completedCases + ' responses']),
        generation => openRun(record.id, Number(generation))));
    const jobStatus = node('p'); jobStatus.id = 'requests-job'; target.append(jobStatus); renderJob();
    const controls = node('div', undefined, 'toolbar');
    controls.append(button('Refresh original run', () => openRun(record.id)),
      button('Pause after current response', () => submit('/api/request-run/control', {
        id: crypto.randomUUID(), project, runId: record.id, attemptId: selectedRun.job.attemptId, action: 'pause' }), 'control'),
      button('Cancel current request and pause remaining cases', () => submit('/api/request-run/control', {
        id: crypto.randomUUID(), project, runId: record.id, attemptId: selectedRun.job.attemptId, action: 'cancel' }), 'control'),
      button('Continue original unstarted cases', async () => {
        const original = await latestProject(), value = await ctx.api('/api/request-run?' + new URLSearchParams({ project, runId: record.id }));
        await submit('/api/request-run/continue', { id: crypto.randomUUID(), project, runId: record.id, expectedRevision: original.revision,
          expectedGeneration: value.record.generation, expectedRecordSha256: value.recordSha256 });
      }, 'continue'));
    target.append(controls);
    for (const item of record.cases) {
      const source = value.requestSet.cases.find(row => row.id === item.id), card = node('article', undefined, 'comparison-case');
      card.append(node('h4', source?.title ?? item.id), node('p', item.state + ' · ' + item.id + ' · preview ' + item.previewId),
        detail('Original admitted query and variables', source ? { operation: source.operation, request: source.request,
          requestSha256: source.requestSha256, source: source.source } : item));
      if (item.reference) {
        card.append(node('p', 'HTTP ' + item.reference.status + ' · ' + item.reference.responseBytes + ' bytes'),
          button('Open original response ' + item.id, async () => {
            await ctx.openPreview(item.previewId, project); document.getElementById('preview-panel').scrollIntoView({ block: 'start' });
          }));
      }
      if (item.error) card.append(node('p', item.error.message));
      target.append(card);
    }
    if (value.pending || record.generation > value.attachedGeneration) target.append(node('p',
      'A complete native checkpoint can be recovered through the original request below; no source request is needed.'));
    target.append(button('Use this completed checkpoint as baseline', async () => {
      view.comparison.baseline = snapshot(value); updateComparisonCases(); persist(); renderCompare();
    }), button('Use this completed checkpoint as candidate', async () => {
      view.comparison.candidate = snapshot(value); updateComparisonCases(); persist(); renderCompare();
    }), detail('Complete immutable checkpoint and original attempt', { record, job: value.job, pending: value.pending }));
    buttons();
  }
  function updateComparisonCases() {
    const { baseline, candidate } = view.comparison;
    view.comparison.caseIds = baseline && candidate ? baseline.cases.filter(id => candidate.cases.includes(id)) : [];
  }
  function renderCompare() {
    const target = $('compare'); target.replaceChildren(); const value = view.comparison;
    target.append(node('h3', 'Compare retained run checkpoints'),
      node('p', 'Select baseline and candidate checkpoints above. Matching uses stable case IDs and each side’s actual original preview; preparing the comparison sends no source requests.'),
      field('Comparison title', value.title, title => { value.title = title; }, { max: 160 }));
    for (const key of ['baseline', 'candidate']) target.append(node('p', key + ': ' + (value[key]
      ? value[key].title + ' · ' + value[key].runId + ' · generation ' + value[key].generation : 'Choose a retained checkpoint')));
    const matches = value.baseline && value.candidate ? value.baseline.cases.filter(id => value.candidate.cases.includes(id)) : [];
    for (const id of matches) target.append(checkbox(id, value.caseIds.includes(id), checked => {
      value.caseIds = checked ? [...new Set([...value.caseIds, id])] : value.caseIds.filter(item => item !== id);
    }));
    target.append(button('Prepare original response comparison', async () => {
      const selected = structuredClone(value), original = await latestProject();
      const reference = input => ({ runId: input.runId, generation: input.generation, recordSha256: input.recordSha256 });
      await submit('/api/request-run/compare', { id: crypto.randomUUID(), project, expectedRevision: original.revision,
        title: selected.title || 'Retained request-run comparison', baseline: reference(selected.baseline),
        candidate: reference(selected.candidate), caseIds: selected.caseIds });
      document.getElementById('response-comparisons').scrollIntoView({ block: 'start' });
    }, 'compare')); buttons();
  }
  function renderPending() {
    const target = $('pending'); target.replaceChildren();
    target.append(node('h3', 'Original browser requests'));
    if (!view.pending.length) target.append(node('p', 'No unanswered request reminders in this browser.'));
    for (const plan of view.pending) {
      const card = node('div', undefined, 'comparison-case');
      card.append(node('strong', plan.path + ' · ' + (plan.body.id ?? plan.body.runId ?? plan.body.requestSetId)),
        node('p', 'Retained before dispatch at ' + plan.retainedAt),
        button('Retry this same retained request', () => sendPlan(plan)),
        button('Download original request', async () => download('graphql-original-request-' + plan.id + '.json', plan)),
        button('Inspect its original saved operation', async () => {
          const hint = planHint(plan);
          if (hint.kind === 'comparison') { await ctx.inspectComparison(hint.id, 1); document.getElementById('response-comparisons').scrollIntoView({ block: 'start' }); return; }
          view.recovery = { ...hint, generation: '' }; persist(); await inspectRecovery();
        }), button('Remove browser reminder', async () => {
          if (!confirm('Remove only this browser reminder? Original native requests, run UUIDs and results remain saved.')) return;
          view.pending = view.pending.filter(item => item.id !== plan.id); persist(); renderPending();
        }));
      target.append(card);
    }
    buttons();
  }
  async function inspectRecovery() {
    const choice = structuredClone(view.recovery), ticket = epoch;
    const value = choice.kind === 'set'
      ? await ctx.api('/api/request-set?' + new URLSearchParams({ project, requestSetId: choice.id }))
      : await ctx.api('/api/request-run?' + new URLSearchParams({ project, runId: choice.id,
        ...(choice.generation ? { generation: choice.generation } : {}) }));
    if (ticket !== epoch) return;
    inspected = { kind: choice.kind, value }; renderRecovery();
  }
  function renderRecovery() {
    const target = $('recovery'); target.replaceChildren();
    target.append(node('h3', 'Recover original saved files'),
      select('Original operation', view.recovery.kind, [['set', 'Saved request set'], ['run', 'Connected request run']], async kind => {
        view.recovery.kind = kind; inspected = null; renderRecovery();
      }), field('Original UUID', view.recovery.id, id => { view.recovery.id = id; inspected = null; $('recovery-result')?.replaceChildren(); }, { max: 36 }),
      field('Run generation (optional)', view.recovery.generation, generation => { view.recovery.generation = generation; inspected = null; $('recovery-result')?.replaceChildren(); },
        { max: 3 }), button('Inspect retained original files', inspectRecovery));
    if (!inspected) { buttons(); return; }
    const chosen = inspected, value = chosen.value, result = node('div'); result.id = 'requests-recovery-result'; target.append(result);
    result.append(detail('Retained original source and attachment state', value),
      button('Recover this same saved operation', async () => {
        const original = await latestProject();
        await submit(chosen.kind === 'set' ? '/api/request-set/recover' : '/api/request-run/recover', chosen.kind === 'set'
          ? { project, requestSetId: value.record.id, expectedRevision: original.revision, recordSha256: value.recordSha256 }
          : { project, runId: value.record.id, expectedRevision: original.revision, generation: value.record.generation,
              expectedRecordSha256: value.recordSha256 });
        inspected = null; renderRecovery();
      }, 'clean'));
    buttons();
  }
  function renderPacket() {
    const target = $('packet'); target.replaceChildren();
    target.append(node('h3', 'Portable cases and original responses'),
      node('p', 'Prepare a complete private folder for the selected run or set. Receive the same selection through the installed client, or use full project handover to reopen its source, run history and native requests for editing.'));
    if (selectedRun || selectedSet) target.append(button('Prepare selected original request packet', async () => {
      const selection = { project, revision: saved().revision, ...(selectedRun ? { runId: selectedRun.record.id,
        generation: selectedRun.record.generation } : { requestSetId: selectedSet.record.id }) };
      const ticket = epoch, value = await ctx.api('/api/requests/packet', selection);
      if (ticket !== epoch) return; packet = value; renderPacket(); ctx.notice('Complete request packet prepared in ' + value.directory + '.');
    }, 'packet'));
    if (packet) {
      target.append(node('code', packet.directory), detail('Original file selection and complete manifest', packet));
      const actions = node('div', undefined, 'toolbar');
      for (const name of ['index.html', 'request-files.json']) actions.append(button('Download ' + name, () => {
        const { kind, ...selection } = packet.selection;
        return ctx.download('/api/requests/file?' + new URLSearchParams({ ...selection, file: name,
          expectedManifestSha256: packet.manifestFile.sha256 }), name);
      }));
      target.append(actions, node('p', 'Keep the complete folder for links to the original raw response and request files.'));
    }
    buttons();
  }
  function renderAll() {
    renderDefinition(); renderLists(); renderSet(); renderRun(); renderCompare(); renderPending(); renderRecovery(); renderPacket(); buttons();
  }
  function reset() {
    const identity = current().saved?.id ?? null, key = identity ? 'sf105-request-sets:' + ctx.directory() + ':' + identity : null;
    if (identity !== project || key !== storageKey) {
      persist(); clearTimeout(poll); poll = null; epoch++; readSequence++;
      project = identity; storageKey = key; view = blank(); selectedSet = selectedRun = inspected = packet = serverProject = null;
      if (key) try {
        const original = JSON.parse(sessionStorage.getItem(key) ?? 'null');
        if (original?.schema === 'sf105-request-sets-browser.v1' && original.project === project && plain(original.view) &&
            plain(original.view.definition) && Array.isArray(original.view.definition.cases) && Array.isArray(original.view.pending))
          view = original.view;
      } catch (error) { ctx.notice('The original browser request draft could not be read: ' + error.message, true); }
    }
    if (current().saved?.id === project && (!serverProject || serverProject.revision < current().saved.revision)) serverProject = current().saved;
    renderAll();
    // Reopen the browser's retained selection from the original native records.
    // This is a read only; unfinished definitions and exact pending requests stay.
    if (project && !selectedSet && !selectedRun && (view.selectedRunId || view.selectedSetId)) {
      const ticket = epoch, sequence = readSequence, runId = view.selectedRunId, setId = view.selectedSetId, generation = view.generation;
      Promise.resolve().then(async () => {
        if (ticket !== epoch || sequence !== readSequence || selectedSet || selectedRun) return;
        if (runId) await openRun(runId, generation); else await openSet(setId);
      }).catch(error => {
        if (ticket === epoch) ctx.notice('The retained request selection could not be reopened: ' + error.message +
          '. Its browser draft and original request reminders remain available.', true);
      });
    }
  }
  return { reset, buttons, pending: () => view.pending.length > 0 || view.definition.dirty };
}
