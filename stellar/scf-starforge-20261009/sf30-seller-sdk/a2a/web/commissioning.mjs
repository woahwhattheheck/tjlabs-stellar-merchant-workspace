// SPDX-License-Identifier: MIT
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const pretty = value => JSON.stringify(value, null, 2);
const selection = new Map();
function local(p) {
  const key = p.id + ':' + (p.historical ? p.revision : 'current');
  if (!selection.has(key)) selection.set(key, { planId: null, jobId: null, section: 'jobs', kind: 'buyer', bindingKey: null });
  const s = selection.get(key), plans = p.commissioningView?.plans ?? [];
  if (!plans.some(plan => plan.id === s.planId)) s.planId = plans.at(-1)?.id ?? null;
  const plan = plans.find(plan => plan.id === s.planId);
  if (plan && !plan.jobs.some(job => job.id === s.jobId)) s.jobId = plan.jobs[0]?.id ?? null;
  return s;
}
const options = (rows, label, selected = null) => rows.map(row =>
  '<option value="' + esc(row.id) + '"' + (row.id === selected ? ' selected' : '') + '>' + esc(label(row)) + '</option>').join('');
const detail = (title, value) => '<details><summary>' + esc(title) + '</summary><pre>' + esc(pretty(value)) + '</pre></details>';
const field = (name, label, value = '', type = 'text', required = true) =>
  '<label>' + esc(label) + '<input name="' + esc(name) + '" type="' + type + '" value="' + esc(value) + '"' + (required ? ' required' : '') + '></label>';
const area = (name, label, value = '', required = true) =>
  '<label>' + esc(label) + '<textarea name="' + esc(name) + '" rows="3"' + (required ? ' required' : '') + '>' + esc(value) + '</textarea></label>';
const hidden = (name, value) => '<input type="hidden" name="' + esc(name) + '" value="' + esc(value) + '">';
const submit = label => '<div class="actions"><button type="submit">' + esc(label) + '</button></div>';
const form = (action, scope, body) => '<form data-action="' + action + '" data-draft-scope="' + esc(scope) + '">' + body + '</form>';
const card = (title, body, lead = '') => '<section class="card"><h2>' + esc(title) + '</h2>' +
  (lead ? '<p class="lede">' + esc(lead) + '</p>' : '') + body + '</section>';
const empty = text => '<div class="empty">' + esc(text) + '</div>';
const pill = text => '<span class="pill ' + (text === 'accepted' ? 'good' : /changed|unknown|failed|rejected/.test(text) ? 'attention' : '') + '">' + esc(text.replaceAll('_', ' ')) + '</span>';
function sources(p, role = null) {
  return p.sources.filter(s => s.role.startsWith('commission-') && s.role !== 'commission-plan' &&
    (!role || s.role === 'commission-' + role));
}
function evidence(p, name = 'evidenceSourceIds', role = null, selected = []) {
  return '<label>Retained evidence files<select name="' + name + '" multiple size="4" required>' +
    sources(p, role).map(s => '<option value="' + esc(s.id) + '"' + (selected.includes(s.id) ? ' selected' : '') + '>' +
      esc(s.filename + ' · ' + s.role.replace('commission-', '') + ' · ' + s.bytes.toLocaleString() + ' B') + '</option>').join('') +
    '</select></label><p class="quiet">Select the complete files supporting this decision. Add them in Source files first.</p>';
}
function planIntake() {
  return form('commission_import_plan', 'new-plan',
    '<label>Complete commissioning register<input name="file" type="file" accept=".json,application/json" required></label>' +
    field('title', 'Workspace plan title', '', 'text', false) +
    '<label>Work context<select name="context" required><option value="">Choose the actual context</option><option value="customer">Customer commissioning</option><option value="reference">Explicit reference or demonstration</option></select></label>' +
    area('attribution', 'Source, customer status and attribution') + submit('Retain complete commissioning plan'));
}
function planPage(p, selected) {
  const body = '<div class="actions"><button data-commission-template>Download original 30-job template</button></div>' +
    '<p>The original register keeps each task’s purpose, source periods and complete output contract. Upload an explicitly reviewed customer realization when its jobs or calendar differ.</p>' +
    planIntake();
  return '<div class="grid">' + card('Complete plan intake', body) +
    card('Selected plan source', selected ? '<p><b>' + esc(selected.title) + '</b> ' + pill(selected.context) + '</p><p>' +
      esc(selected.attribution) + '</p><p class="mono">' + esc(selected.sha256) + '</p><button data-download-source="' +
      esc(selected.sha256) + '">Download exact original register</button>' + detail('Full retained plan', selected.plan) :
      empty('Retain a plan to select its actual jobs and accountabilities.')) + '</div>';
}
function sourcePage(p) {
  const upload = form('commission_retain_source', 'source-intake',
    '<label>Complete source file<input type="file" name="file" required></label><p class="quiet">Up to 32 MiB per complete file.</p>' +
    '<label>Purpose<select name="role"><option value="customer-approval">Customer or workorder approval</option>' +
    '<option value="source-period">Complete source-period input</option><option value="source-contract">Source, licence or mapping contract</option>' +
    '<option value="receiving-evidence">Receiving review or commercial evidence</option></select></label>' +
    area('note', 'Original source and how it will be used') + submit('Retain exact source file'));
  const table = '<div class="table-scroll"><table><thead><tr><th>Complete source</th><th>Purpose</th><th>Bytes</th><th>Read</th></tr></thead><tbody>' +
    sources(p).map(s => '<tr><td>' + esc(s.filename) + '<div class="mono">' + esc(s.sha256) + '</div></td><td>' +
      esc(s.role.replace('commission-', '')) + '</td><td>' + s.bytes.toLocaleString() + '</td><td><button data-source="' +
      esc(s.sha256) + '">Inspect</button> <button data-download-source="' + esc(s.sha256) + '">Download</button></td></tr>').join('') +
    '</tbody></table></div>';
  return '<div class="grid">' + card('Source and approval files', upload,
    'Retain the files before selecting their identities in a customer, merchant, source-period or receiving review.') +
    card('Retained commissioning files', sources(p).length ? table : empty('No commissioning source files retained yet.')) + '</div>';
}
function bindingList(plan, kind) {
  return kind === 'buyer' ? plan.plan.buyers : kind === 'merchant' ? plan.plan.merchants : plan.plan.source_periods;
}
function approvalPage(p, plan, s) {
  const list = bindingList(plan, s.kind);
  if (!list.some(row => row.id === s.bindingKey)) s.bindingKey = list[0]?.id ?? null;
  const latest = [...plan.approvals].reverse().find(row => row.kind === s.kind && row.key === s.bindingKey);
  const d = latest?.details ?? {};
  let fields;
  if (s.kind === 'buyer') fields =
    field('organization', 'Actual customer organization', d.organization) +
    field('accountableBuyer', 'Accountable buyer', d.accountableBuyer) +
    field('receivingPerson', 'Named receiving person', d.receivingPerson) +
    area('population', 'Approved customer population and scope', d.population) +
    area('independenceBasis', 'Buyer independence and approval basis', d.independenceBasis);
  else if (s.kind === 'merchant') fields =
    field('organization', 'Merchant operator organization', d.organization) +
    field('installationId', 'Original installation ID', d.installationId) +
    field('serviceUrl', 'Actual merchant service URL', d.serviceUrl, 'url') +
    field('accountableOperator', 'Accountable operator', d.accountableOperator);
  else fields =
    field('startsAt', 'Original period start, with time zone', d.startsAt) +
    field('endsAt', 'Original period end, with time zone', d.endsAt) +
    field('sourceEditionId', 'Original source edition ID', d.sourceEditionId) +
    evidence(p, 'sourceIds', 'source-period', d.sourceIds ?? []) +
    area('licenseBasis', 'Source licence and permitted use', d.licenseBasis) +
    area('population', 'Actual source population', d.population);
  const editor = form('commission_approve_binding', plan.id + ':' + s.kind + ':' + s.bindingKey,
    hidden('planId', plan.id) + hidden('kind', s.kind) + hidden('key', s.bindingKey) +
    fields + evidence(p, 'evidenceSourceIds', null, latest?.evidence.map(x => x.id) ?? []) +
    area('reason', 'Review and reason for this binding') + submit('Record reviewed ' + s.kind + ' binding'));
  const rows = list.map(row => {
    const binding = [...plan.approvals].reverse().find(a => a.kind === s.kind && a.key === row.id);
    return '<button data-commission-binding="' + esc(row.id) + '" class="commission-choice ' +
      (s.bindingKey === row.id ? 'selected' : '') + '"><b>' + esc(row.id) + '</b><span>' +
      esc(binding ? 'Reviewed · ' + binding.createdAt : row.role ?? 'Awaiting selection') + '</span></button>';
  }).join('');
  const history = plan.approvals.filter(row => row.kind === s.kind && row.key === s.bindingKey).map(row =>
    detail(row.createdAt + ' · ' + row.reason, row)).join('');
  return '<div class="commission-split"><div>' + card('Accountabilities and source periods',
    '<div class="actions">' + ['buyer', 'merchant', 'period'].map(kind => '<button data-commission-kind="' + kind + '" class="' +
      (kind === s.kind ? 'primary' : '') + '">' + esc(kind === 'period' ? 'Source periods' : kind === 'buyer' ? 'Buyers' : 'Merchants') + '</button>').join('') +
    '</div><div class="commission-choices">' + rows + '</div>',
    'Each change preserves the prior approval and its original evidence. Unsent jobs must be reviewed again after their bindings change.') +
    '</div><div>' + card('Review ' + s.kind + ' · ' + s.bindingKey, editor) +
    (history ? card('Original binding history', history) : '') + '</div></div>';
}
function currentCatalogue(p, editionId) {
  return (p.commissioningView?.catalogues ?? []).find(row => row.editionId === editionId && !row.error);
}
function selectedViews(p, job, catalogueId, procedureId, selected = []) {
  const catalogue = currentCatalogue(p, catalogueId), procedure = catalogue?.procedures.find(row => row.id === procedureId);
  if (!procedure) return '<p class="quiet">Choose a retained catalogue and an original procedure.</p>';
  return '<p>' + esc(procedure.name) + ' · ' + esc(procedure.kind) + '</p><p class="mono">Procedure ' +
    esc(procedure.procedureSha256) + '</p>' + detail('Original procedure and complete format declaration', procedure) +
    '<h3>Review every view against the source periods</h3>' +
    procedure.views.map(view => '<fieldset class="commission-view"><legend>' + esc(view.name) + ' · r' + view.revision + '</legend>' +
      '<p class="mono">' + esc(view.version_id) + '</p>' + job.source_period_ids.map(periodId => {
        const checked = selected.some(item => item.name === view.name && item.periodIds.includes(periodId));
        return '<label class="checkbox"><input type="checkbox" name="period:' + esc(view.name) + ':' + esc(periodId) +
          '" data-commission-view="' + esc(view.name) + '" data-commission-period="' + esc(periodId) + '"' +
          (checked ? ' checked' : '') + '>' + esc(periodId) + '</label>';
      }).join('') + '</fieldset>').join('') +
    '<p class="quiet">This records the operator’s explicit mapping from the retained source-period files to the original view versions. It does not alter the upstream query.</p>';
}
function prepareForm(p, plan, job) {
  const prior = job.preparation, catalogues = (p.commissioningView?.catalogues ?? []).filter(row => !row.error);
  const preferred = prior ? catalogues.find(row => row.editionId === prior.catalogueEditionId) : catalogues.at(-1);
  const catalogueId = preferred?.editionId ?? '', procedureId = prior?.procedure.id ??
    preferred?.procedures.find(row => row.kind === (job.task_kind === 'approved-query' ? 'query' : 'report'))?.id ?? '';
  const catalogueOptions = catalogues.map(row => ({ ...row, id: row.editionId }));
  const body = hidden('planId', plan.id) + hidden('jobId', job.id) +
    '<label>Accepted complete catalogue edition<select name="catalogueEditionId" required><option value="">Select original catalogue</option>' +
      options(catalogueOptions, row => row.title, catalogueId) + '</select></label>' +
    '<p class="quiet">In Message workshop, send the original catalogue request. Retain all its artifacts, accept the result, then freeze its catalogue edition.</p>' +
    '<label>Observed approved procedure<select name="procedureId" required>' +
      options(preferred?.procedures ?? [], row => row.name + ' · ' + row.kind, procedureId) + '</select></label>' +
    '<div data-commission-procedure>' + selectedViews(p, job, catalogueId, procedureId, prior?.viewPeriods ?? []) + '</div>' +
    field('scheduledDate', 'Actual customer calendar date', prior?.scheduledDate ?? '', 'date') +
    area('parametersText', 'Exact original parameter JSON text; leave empty to use saved parameters', prior?.parametersText ?? '', false) +
    '<label>Original reviewed message<select name="messageId"><option value="">Prepare a new original message</option>' +
      options(p.messages, row => row.native.message.messageId + (row.sendRequestId ? ' · attempted' : ' · unsent')) + '</select></label>' +
    '<p class="quiet">Selecting an existing message records a retrospective binding. It preserves its original creation, request and task; it creates no new purchase.</p>' +
    evidence(p) + area('reason', 'Why this procedure, inputs and complete output satisfy the customer’s distinct job') +
    submit(prior ? 'Replace the unsent job preparation' : 'Retain reviewed job and message');
  return form('commission_prepare_job', plan.id + ':' + job.id, body);
}
function deliveryForm(p, plan, job) {
  const preparation = job.preparation;
  if (!preparation) return empty('Retain the job selection before binding its original complete result.');
  return form('commission_review_delivery', plan.id + ':' + job.id,
    hidden('preparationId', preparation.id) +
    '<label>Accepted complete analytical edition<select name="editionId" required><option value="">Choose its original result</option>' +
      options(p.editions, row => row.title, job.delivery?.native.editionId) + '</select></label>' +
    '<label>Original seller publication, if prepared<select name="publicationId"><option value="">No publication selected</option>' +
      options(p.publications, row => row.title, job.delivery?.publication?.id) + '</select></label>' +
    '<p>Receiving person: <b>' + esc(preparation.receivingPerson) + '</b></p>' +
    '<label>Receiving decision<select name="decision"><option value="accepted">Accepted complete delivery</option>' +
      '<option value="changes_requested">Changes requested</option><option value="rejected">Rejected</option></select></label>' +
    evidence(p, 'evidenceSourceIds', 'receiving-evidence') +
    area('note', 'What the named receiver checked in the complete files, source scope and actual decision') +
    submit('Record receiving decision against original result'));
}
function jobDetail(p, plan, job) {
  if (!job) return empty('Choose a planned job.');
  let body = '<div class="split"><div><p class="eyebrow">' + esc(job.id + ' · ' + job.buyer_id + ' · ' + job.merchant_id) +
    '</p><h2>' + esc(job.title) + '</h2></div>' + pill(job.state) + '</div><p>' + esc(job.purpose) + '</p><p>' +
    esc(job.required_selection) + '</p><p class="quiet">Source periods ' + esc(job.source_period_ids.join(', ')) +
    ' · Original kind ' + esc(job.task_kind) + ' · Planned receiving role ' + esc(job.receiving_role) + '</p>';
  const contract = plan.plan.output_contracts.find(row => row.id === job.output_contract_id);
  body += detail('Complete output and acceptance contract', contract);
  const missing = [
    ['buyer', job.buyer_id], ['merchant', job.merchant_id], ...job.source_period_ids.map(id => ['period', id])
  ].filter(([kind, key]) => !plan.approvals.some(row => row.kind === kind && row.key === key));
  if (missing.length) body += '<div class="muted-box">Review these bindings before preparation: ' +
    esc(missing.map(([kind, key]) => kind + ' ' + key).join(', ')) +
    '. <button data-commission-section="approvals">Open accountabilities</button></div>';
  if (job.preparation) {
    body += detail('Original job preparation and source bindings', job.preparation);
    if (job.messageState.approvalChanged) body += '<p class="commission-attention">A customer or source approval changed after this preparation. The original job keeps its prior binding; an unsent message needs a new review.</p>';
    body += '<div class="facts"><div><small>Original message</small><b class="mono">' + esc(job.messageState.nativeMessageId) +
      '</b></div><div><small>Native state</small><b>' + esc(job.messageState.operationState ?? 'Not dispatched') + '</b></div></div>';
    if (job.messageState.taskIds.length) body += '<p class="mono">Original task ' + esc(job.messageState.taskIds.join(', ')) + '</p>';
    body += '<div class="actions"><button data-pane="messages">Open original message</button><button data-pane="tasks">Observe original task</button>' +
      '<button data-pane="results">Retain and review complete outputs</button></div>';
    if (!job.messageState.attempted) body += '<details><summary>Review or replace this unsent preparation</summary>' + prepareForm(p, plan, job) + '</details>';
  } else body += '<h3>Commission the original job</h3>' + prepareForm(p, plan, job);
  body += '<h3>Customer receiving</h3>' + deliveryForm(p, plan, job);
  const history = p.commissioning?.deliveries.filter(row => row.planId === plan.id && row.jobId === job.id) ?? [];
  for (const row of history) {
    body += detail(row.decision.replaceAll('_', ' ') + ' · ' + row.createdAt, row) +
      '<div class="actions"><button data-result="' + esc(row.native.editionId) + '">Download complete original result</button></div>';
  }
  return '<section class="card commission-job-detail" data-commission-selected-job="' + esc(job.id) + '">' + body + '</section>';
}
function jobsPage(p, plan, s) {
  const days = [...new Set(plan.jobs.map(job => job.calendar_day))].sort((a, b) => a - b);
  const calendar = '<div class="commission-calendar">' + days.map(day => {
    const jobs = plan.jobs.filter(job => job.calendar_day === day);
    return '<div><strong>Day ' + day + '</strong><span>' + jobs.filter(job => job.delivery?.decision === 'accepted').length +
      ' / ' + jobs.length + ' received</span></div>';
  }).join('') + '</div>';
  const list = '<div class="commission-job-list" aria-label="Planned customer jobs">' + plan.jobs.map(job =>
    '<button data-commission-job="' + esc(job.id) + '" class="commission-job ' + (s.jobId === job.id ? 'selected' : '') +
    '"><span class="commission-job-line"><b>' + esc(job.id) + '</b>' + pill(job.state) + '</span><span>' +
    esc(job.title) + '</span><small>' + esc(job.buyer_id + ' · ' + job.merchant_id + ' · ' +
      (job.preparation?.scheduledDate ?? 'relative day ' + job.calendar_day)) + '</small></button>').join('') + '</div>';
  return calendar + '<div class="commission-workbench"><div>' + list + '</div><div>' +
    jobDetail(p, plan, plan.jobs.find(job => job.id === s.jobId)) + '</div></div>';
}
export function renderCommissioning(p) {
  const s = local(p), view = p.commissioningView ?? { plans: [], counts: {} }, plan = view.plans.find(row => row.id === s.planId);
  const header = '<section class="card"><div class="split"><div><p class="eyebrow">CUSTOMER WORK · ORIGINAL TASKS</p>' +
    '<h2>Commissioning and receiving</h2></div><button data-commission-report>Download selected register</button></div>' +
    '<p class="lede">Bind each useful customer job to its approved sources, original analytical procedure and complete received result.</p>' +
    (plan ? '<label>Retained commissioning plan<select id="commission-plan-select">' + options(view.plans, row => row.title + ' · ' + row.context, plan.id) +
      '</select></label><div class="facts"><div><small>Planned useful jobs</small><b>' + plan.counts.jobs +
      '</b></div><div><small>Reviewed job preparations</small><b>' + plan.counts.prepared +
      '</b></div><div><small>Observed native tasks</small><b>' + plan.counts.observedTasks +
      '</b></div><div><small>Accepted deliveries</small><b>' + plan.counts.accepted + '</b></div></div><p class="quiet">' +
      esc(plan.context === 'reference' ? 'Explicit reference. Its observed jobs remain separately attributed.' : 'Customer context declared in the retained approval evidence.') +
      ' Existing-message deliveries: ' + plan.counts.acceptedAdopted +
      '. Settlement is established by the original merchant records.</p>' : '') +
    '<div class="actions commission-tabs">' + [['jobs', 'Jobs and receiving'], ['approvals', 'Accountabilities'], ['sources', 'Source files'], ['plan', 'Complete plan']].map(([key, label]) =>
      '<button data-commission-section="' + key + '" class="' + (s.section === key ? 'primary' : '') + '">' + label + '</button>').join('') + '</div></section>';
  if (!plan && !['sources', 'plan'].includes(s.section)) return header + planPage(p, null);
  const body = s.section === 'plan' ? planPage(p, plan) : s.section === 'sources' ? sourcePage(p) :
    s.section === 'approvals' ? approvalPage(p, plan, s) : jobsPage(p, plan, s);
  return '<div id="commissioning-workspace">' + header + body + '</div>';
}
export function commissioningClick(button, project) {
  if (!project) return false;
  const s = local(project);
  if (button.dataset.commissionSection) { s.section = button.dataset.commissionSection; return true; }
  if (button.dataset.commissionKind) { s.kind = button.dataset.commissionKind; s.bindingKey = null; return true; }
  if (button.dataset.commissionBinding) { s.bindingKey = button.dataset.commissionBinding; return true; }
  if (button.dataset.commissionJob) { s.jobId = button.dataset.commissionJob; return true; }
  return false;
}
export function commissioningSelection(event, project) {
  if (event.target.id !== 'commission-plan-select') return false;
  const s = local(project); s.planId = event.target.value; s.jobId = null; s.bindingKey = null; return true;
}
export function refreshCommissioningFields(project, { restore = false, resetProcedure = false, resetMappings = false } = {}) {
  const form = document.querySelector('form[data-action="commission_prepare_job"]'); if (!form) return;
  const p = project.commissioningView?.plans.find(plan => plan.id === form.elements.planId.value);
  const job = p?.jobs.find(job => job.id === form.elements.jobId.value); if (!job) return;
  const catalogue = currentCatalogue(project, form.elements.catalogueEditionId.value);
  const current = resetProcedure ? '' : (restore ? form.__restoredDraft?.procedureId : null) ?? form.elements.procedureId.value;
  form.elements.procedureId.innerHTML = options(catalogue?.procedures ?? [], row => row.name + ' · ' + row.kind, current);
  if (!catalogue?.procedures.some(row => row.id === current)) {
    form.elements.procedureId.value = catalogue?.procedures.find(row =>
      row.kind === (job.task_kind === 'approved-query' ? 'query' : 'report'))?.id ?? '';
  }
  const selected = [];
  if (!resetMappings) for (const input of form.querySelectorAll('input[data-commission-view]:checked')) {
    let row = selected.find(row => row.name === input.dataset.commissionView);
    if (!row) selected.push(row = { name: input.dataset.commissionView, periodIds: [] });
    row.periodIds.push(input.dataset.commissionPeriod);
  }
  form.querySelector('[data-commission-procedure]').innerHTML = selectedViews(
    project, job, form.elements.catalogueEditionId.value, form.elements.procedureId.value, selected);
  if (restore && form.__restoredDraft?.__checks) for (const input of form.querySelectorAll('input[data-commission-view]'))
    input.checked = form.__restoredDraft.__checks[input.name] === true;
}
function strings(form, name) { return [...(form.elements.namedItem(name)?.selectedOptions ?? [])].map(option => option.value); }
async function fullFile(file, max) {
  if (!file || !file.size) throw new Error('Select a complete nonempty source file.');
  if (file.size > max) throw new Error('The complete selected file exceeds this intake limit.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size) throw new Error('The selected file could not be read completely.');
  let contentBase64 = '';
  for (let start = 0; start < bytes.length; start += 24576)
    contentBase64 += btoa(String.fromCharCode(...bytes.subarray(start, start + 24576)));
  return { contentBase64, filename: file.name, mediaType: file.type || 'application/octet-stream' };
}
export async function commissioningFormPayload(form) {
  const action = form.dataset.action, f = Object.fromEntries(new FormData(form));
  if (action === 'commission_import_plan') {
    const selected = { context: f.context, attribution: f.attribution, ...(f.title.trim() ? { title: f.title } : {}) };
    const file = form.elements.file.files[0];
    const source = await fullFile(file, 1024 * 1024);
    return { ...selected, contentBase64: source.contentBase64, filename: source.filename };
  }
  if (action === 'commission_retain_source') {
    const selected = { role: f.role, note: f.note }, file = form.elements.file.files[0];
    return { ...selected, ...await fullFile(file, 32 * 1024 * 1024) };
  }
  if (action === 'commission_approve_binding') {
    const detailKeys = f.kind === 'buyer' ? ['organization', 'accountableBuyer', 'receivingPerson', 'population', 'independenceBasis'] :
      f.kind === 'merchant' ? ['organization', 'installationId', 'serviceUrl', 'accountableOperator'] :
        ['startsAt', 'endsAt', 'sourceEditionId', 'licenseBasis', 'population'];
    const details = Object.fromEntries(detailKeys.map(key => [key, f[key]]));
    if (f.kind === 'period') details.sourceIds = strings(form, 'sourceIds');
    return { planId: f.planId, kind: f.kind, key: f.key, details, evidenceSourceIds: strings(form, 'evidenceSourceIds'), reason: f.reason };
  }
  if (action === 'commission_prepare_job') {
    const viewPeriods = [];
    for (const input of form.querySelectorAll('input[data-commission-view]')) {
      let row = viewPeriods.find(row => row.name === input.dataset.commissionView);
      if (!row) viewPeriods.push(row = { name: input.dataset.commissionView, periodIds: [] });
      if (input.checked) row.periodIds.push(input.dataset.commissionPeriod);
    }
    return { planId: f.planId, jobId: f.jobId, catalogueEditionId: f.catalogueEditionId,
      procedureId: f.procedureId, scheduledDate: f.scheduledDate,
      parametersText: f.parametersText.trim() ? f.parametersText : null,
      ...(f.messageId ? { messageId: f.messageId } : {}), viewPeriods,
      evidenceSourceIds: strings(form, 'evidenceSourceIds'), reason: f.reason };
  }
  if (action === 'commission_review_delivery') return {
    preparationId: f.preparationId, editionId: f.editionId,
    ...(f.publicationId ? { publicationId: f.publicationId } : {}),
    decision: f.decision, note: f.note, evidenceSourceIds: strings(form, 'evidenceSourceIds')
  };
  throw new Error('Unknown commissioning form.');
}
