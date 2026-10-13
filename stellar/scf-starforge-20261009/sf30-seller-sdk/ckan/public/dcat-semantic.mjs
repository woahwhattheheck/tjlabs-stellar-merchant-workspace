// MIT. Explicit RDF/SHACL profiles and retained findings in the original catalogue project.
const memories = new Map();
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_PROFILE_BYTES = 32 * 1024 * 1024;
const PAGE = 50;
function node(tag, attrs = {}, ...children) {
  const value = document.createElement(tag);
  for (const [key, item] of Object.entries(attrs)) {
    if (key.startsWith('on')) value.addEventListener(key.slice(2), item);
    else if (['disabled', 'selected', 'checked'].includes(key)) value[key] = Boolean(item);
    else if (item !== undefined && item !== null) value.setAttribute(key, item);
  }
  for (const item of children.flat()) if (item !== undefined && item !== null)
    value.append(item instanceof Node ? item : document.createTextNode(String(item)));
  return value;
}
const note = text => node('p', { class: 'muted' }, text);
const row = (...items) => node('div', { class: 'row' }, ...items);
const card = (...items) => node('section', { class: 'card' }, ...items);
const field = (label, input) => node('label', { class: 'grow' }, label, input);
const input = (name, value = '', attrs = {}) => node('input', { name, value, ...attrs });
const details = (label, value) => node('details', {}, node('summary', {}, label),
  node('pre', {}, JSON.stringify(value, null, 2)));
const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : value || '—';
function select(name, choices, selected) {
  return node('select', { name }, choices.map(([value, label]) =>
    node('option', { value, selected: String(selected ?? '') === String(value) }, label)));
}
function bind(control, receive) {
  control.addEventListener('input', receive); control.addEventListener('change', receive); return control;
}
function table(headings, rows) {
  return node('div', { class: 'table-wrap' }, node('table', {},
    node('thead', {}, node('tr', {}, headings.map(text => node('th', {}, text)))),
    node('tbody', {}, rows.map(cells => node('tr', {}, cells.map(value => node('td', {}, value)))))));
}
function action(ctx, label, callback, disabled = false) {
  const button = node('button', { type: 'button', disabled }, label);
  button.addEventListener('click', () => ctx.protect(async () => {
    if (button.disabled || !ctx.current()) return;
    button.disabled = true;
    try { return await callback(); } finally { if (button.isConnected) button.disabled = disabled; }
  }));
  return button;
}
async function api(ctx, path, value) {
  const response = await fetch('/api/dcat/semantic/' + path, {
    method: value === undefined ? 'GET' : 'POST',
    headers: { authorization: 'Bearer ' + ctx.token,
      ...(value === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error((result.error ?? response.status) + ': ' + (result.message ?? 'Semantic operation failed.'));
  return result;
}
function memory(ctx) {
  const key = JSON.stringify([ctx.state.createdAt, ctx.state.catalogOrigin]);
  if (!memories.has(key)) memories.set(key, {
    tab: 'profiles', profileId: '', runId: '', pending: false, profileDraft: null,
    files: { context: [], shapes: [], ontologies: [], attachments: [] }, runDraft: { selected: '', profileId: '' },
    offset: 0, previous: [], severity: '', search: '', reviewDrafts: new Map(),
  });
  return memories.get(key);
}
async function mutate(ctx, saved, path, body, receive) {
  if (saved.pending || ctx.state.active) throw new Error('Finish the current project operation first.');
  saved.pending = true;
  try {
    const result = await api(ctx, path, body); receive?.(result);
    ctx.acceptOperation(result); await ctx.refresh(); return result;
  } finally { saved.pending = false; }
}
function formatFor(file) {
  const suffix = file.name.toLowerCase().split('.').at(-1);
  return ({ ttl: 'turtle', nt: 'nt', rdf: 'xml', xml: 'xml',
    json: 'json-ld', jsonld: 'json-ld' })[suffix] ?? 'turtle';
}
async function encodedFile(file, format) {
  if (!file || file.size < 1 || file.size > MAX_FILE_BYTES)
    throw new Error('Choose a nonempty profile file no larger than 16 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha256 = [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { name: file.name, contentBase64: btoa(binary), bytes: bytes.length, sha256,
    ...(format ? { format } : {}), mediaType: file.type || 'application/octet-stream' };
}
function fileEditor(ctx, saved, kind, label, one = false) {
  const chooser = node('input', { type: 'file', name: 'semantic-' + kind, ...(one ? {} : { multiple: '' }) });
  chooser.addEventListener('change', () => ctx.protect(async () => {
    const selected = [...(chooser.files ?? [])];
    if (one && selected.length !== 1 || selected.length > 16) throw new Error('Choose ' + (one ? 'one context file.' : 'at most sixteen files.'));
    if (selected.some(file => file.size < 1 || file.size > MAX_FILE_BYTES))
      throw new Error('Each profile file must be nonempty and no larger than 16 MiB.');
    const total = Object.entries(saved.files).filter(([key]) => key !== kind)
      .flatMap(([, value]) => value).reduce((sum, item) => sum + item.file.size, 0) +
      selected.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_PROFILE_BYTES) throw new Error('The complete profile must be no larger than 32 MiB.');
    saved.files[kind] = selected.map(file => ({ file, format: one || kind === 'attachments' ? null : formatFor(file) }));
    await ctx.render();
  }));
  const entries = saved.files[kind].map(item => {
    const format = one || kind === 'attachments' ? null : bind(select('format-' + kind, [
      ['turtle', 'Turtle'], ['nt', 'N-Triples'], ['xml', 'RDF/XML'], ['json-ld', 'JSON-LD'],
    ], item.format), event => { item.format = event.target.value; });
    return row(note(item.file.name + ' · ' + item.file.size.toLocaleString() + ' bytes'),
      format ? field('RDF format', format) : null);
  });
  return node('div', {}, field(label, chooser), ...entries);
}
function profileEditor(ctx, saved, profiles) {
  const draft = saved.profileDraft ??= {
    label: '', baseIRI: '', contextMode: 'require-absent', supersedesProfileId: '',
    coverageClasses: 'http://www.w3.org/ns/dcat#Catalog\nhttp://www.w3.org/ns/dcat#Dataset\nhttp://www.w3.org/ns/dcat#DatasetSeries',
    inference: 'none', allow_infos: false, allow_warnings: false,
  };
  const label = bind(input('semantic-profile-label', draft.label, { maxlength: 512, required: '' }), () => { draft.label = label.value; });
  const baseIRI = bind(input('semantic-base-iri', draft.baseIRI, { maxlength: 4096, required: '', placeholder: 'https://publisher.example/catalog/' }), () => { draft.baseIRI = baseIRI.value; });
  const mode = bind(select('semantic-context-mode', [
    ['require-absent', 'Require catalogue without a root context'],
    ['replace-root', 'Replace root context in a derived validation copy'],
    ['preserve', 'Preserve the matching local catalogue context'],
  ], draft.contextMode), () => { draft.contextMode = mode.value; });
  const previous = bind(select('semantic-profile-predecessor', [['', 'New independent profile'],
    ...profiles.map(p => [p.id, p.label + ' · ' + p.id])], draft.supersedesProfileId),
    () => { draft.supersedesProfileId = previous.value; });
  const classes = bind(node('textarea', { name: 'semantic-coverage-classes', rows: 4 }, draft.coverageClasses),
    () => { draft.coverageClasses = classes.value; });
  const inference = bind(select('semantic-inference', [['none', 'None'], ['rdfs', 'RDFS'], ['owlrl', 'OWL RL'], ['both', 'RDFS and OWL RL']], draft.inference),
    () => { draft.inference = inference.value; });
  const infos = bind(input('semantic-allow-infos', '', { type: 'checkbox', checked: draft.allow_infos }),
    () => { draft.allow_infos = infos.checked; });
  const warnings = bind(input('semantic-allow-warnings', '', { type: 'checkbox', checked: draft.allow_warnings }),
    () => { draft.allow_warnings = warnings.checked; });
  return card(node('h3', {}, 'Import a validation profile'),
    note('Choose the complete local JSON-LD context and SHACL shapes. Each original file is retained. Review its source and intended catalogue coverage before running it.'),
    row(field('Profile label', label), field('Earlier profile · optional', previous)),
    field('Explicit base IRI', baseIRI),
    note('Relative RDF identifiers in the catalogue, shapes and ontologies resolve against this declared IRI. Select it from the intended catalogue contract.'),
    field('Catalogue context treatment', mode),
    note('Context replacement creates a separate validation input and keeps the original catalogue unchanged. Remote context retrieval is disabled by the native engine.'),
    fileEditor(ctx, saved, 'context', 'Local JSON-LD context', true),
    fileEditor(ctx, saved, 'shapes', 'SHACL shape files'),
    fileEditor(ctx, saved, 'ontologies', 'Ontology files · optional'),
    fileEditor(ctx, saved, 'attachments', 'Source audits and profile notes · optional'),
    field('Class IRIs to inspect · one per line', classes),
    row(field('Inference', inference), field('Allow informational findings', infos), field('Allow warnings', warnings)),
    row(action(ctx, 'Save profile', async () => {
      if (!label.reportValidity() || !baseIRI.reportValidity() || saved.files.context.length !== 1 || !saved.files.shapes.length)
        throw new Error('Enter a label and choose one context file and at least one shape file.');
      const context = await encodedFile(saved.files.context[0].file);
      const shapes = await Promise.all(saved.files.shapes.map(item => encodedFile(item.file, item.format)));
      const ontologies = await Promise.all(saved.files.ontologies.map(item => encodedFile(item.file, item.format)));
      const attachments = await Promise.all(saved.files.attachments.map(item => encodedFile(item.file)));
      const coverageClasses = draft.coverageClasses.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
      await mutate(ctx, saved, 'profiles', { label: draft.label, baseIRI: draft.baseIRI, contextMode: draft.contextMode,
        context, shapes, ontologies, attachments, coverageClasses,
        parameters: { inference: draft.inference, allow_infos: draft.allow_infos, allow_warnings: draft.allow_warnings },
        ...(draft.supersedesProfileId ? { supersedesProfileId: draft.supersedesProfileId } : {}) },
      result => { saved.profileId = result.profileId ?? ''; saved.tab = 'profiles'; });
    }, Boolean(ctx.state.active)),
    action(ctx, 'Clear profile draft', async () => {
      saved.profileDraft = null; saved.files = { context: [], shapes: [], ontologies: [], attachments: [] }; await ctx.render();
    })));
}
async function profilesView(ctx, saved, semantic) {
  ctx.view.append(profileEditor(ctx, saved, semantic.profiles));
  if (!semantic.profiles.length) return;
  const chosen = select('semantic-profile', semantic.profiles.map(p => [p.id, p.label + ' · ' + p.id]),
    saved.profileId || semantic.profiles.at(-1).id);
  saved.profileId = chosen.value;
  chosen.addEventListener('change', () => ctx.protect(async () => { saved.profileId = chosen.value; await ctx.render(); }));
  const value = await api(ctx, 'profiles/' + encodeURIComponent(saved.profileId));
  if (!ctx.current()) return;
  ctx.view.append(card(node('h3', {}, 'Saved profile'), field('Profile edition', chosen),
    details('Complete profile and original file identities', value),
    table(['Original profile file', 'Size', 'SHA-256', 'Download'],
      [value.context, ...(value.shapes ?? []), ...(value.ontologies ?? []), ...(value.attachments ?? [])]
        .filter(Boolean).map(file => [file.name, file.bytes, file.sha256,
          action(ctx, 'Download', () => ctx.download('dcat/semantic/files/profile-file/' + saved.profileId + '?' +
            new URLSearchParams({ key: file.key }), file.name))])),
    row(action(ctx, 'Download profile', () => ctx.download('dcat/semantic/files/profile/' + saved.profileId, 'dcat-semantic-profile.json')),
      action(ctx, 'Validate a catalogue', async () => {
        saved.runDraft.profileId = saved.profileId; saved.tab = 'run'; await ctx.render();
      }))));
}
function runEditor(ctx, saved, semantic) {
  const drafts = saved.runDraft, catalogs = ctx.state.dcat?.catalogs ?? [], reviews = ctx.state.dcat?.reviews ?? [];
  const candidates = reviews.filter(r => r.candidateSha256 && ['READY', 'NEEDS_CORRECTION'].includes(r.status));
  const selections = [
    ...catalogs.map(c => ['catalog:' + c.id, 'Original · ' + (c.label || c.id)]),
    ...candidates.map(r => ['review:' + r.id, 'Candidate · ' + (r.label || r.id)]),
  ];
  if (!semantic.profiles.length || !selections.length) return card(node('h3', {}, 'Validate a catalogue'),
    note('Import a complete catalogue and save a semantic profile before starting a run.'),
    action(ctx, 'Open profiles', async () => { saved.tab = 'profiles'; await ctx.render(); }));
  const profile = bind(select('semantic-run-profile', semantic.profiles.map(p => [p.id, p.label]),
    drafts.profileId || saved.profileId || semantic.profiles.at(-1).id), () => { drafts.profileId = profile.value; });
  drafts.profileId = profile.value;
  const selected = bind(select('semantic-run-source', selections, drafts.selected || selections[0][0]),
    () => { drafts.selected = selected.value; });
  drafts.selected = selected.value;
  return card(node('h3', {}, 'Validate a retained catalogue edition'),
    note('The run pins this exact source or candidate, context and shape profile. Engine conformance and the operator’s decision remain separate from migration release selection.'),
    row(field('Profile edition', profile), field('Catalogue edition', selected)),
    action(ctx, 'Run native validation', async () => {
      const p = semantic.profiles.find(value => value.id === drafts.profileId);
      const [kind, id] = drafts.selected.split(':');
      const source = (kind === 'catalog' ? catalogs : candidates).find(value => value.id === id);
      if (!p || !source) throw new Error('Select the current retained profile and catalogue.');
      await mutate(ctx, saved, 'runs', { profileId: p.id, expectedProfileSha256: p.profileSha256,
        [kind === 'catalog' ? 'catalogId' : 'reviewId']: id,
        expectedSourceSha256: kind === 'catalog' ? source.sha256 : source.candidateSha256 },
      result => { saved.runId = result.runId ?? ''; saved.tab = 'runs'; saved.offset = 0; saved.previous = []; });
    }, Boolean(ctx.state.active)));
}
function findingsTable(rows) {
  const terms = values => (Array.isArray(values) ? values : values == null ? [] : [values])
    .map(term => typeof term === 'object' ? term.value ?? JSON.stringify(term) : String(term)).join('\n');
  return table(['Finding', 'Severity', 'Focus / path', 'Message and original result'],
    rows.map((finding, index) => [
      terms(finding.id) || index,
      terms(finding.severity),
      details('RDF terms', { focus: finding.focus_nodes, originalFocus: finding.original_focus_nodes,
        paths: finding.paths, values: finding.values, shapes: finding.source_shapes,
        sources: finding.original_sources }),
      node('div', {}, terms(finding.messages), details('Complete finding', finding)),
    ]));
}
async function runsView(ctx, saved, semantic) {
  if (!semantic.runs.length) { ctx.view.append(note('No semantic runs have been saved.')); return; }
  const choose = select('semantic-run', [...semantic.runs].reverse().map(r => [r.id,
    (r.label || r.id) + ' · ' + (r.status || r.state || '')]),
    saved.runId || semantic.runs.at(-1).id);
  saved.runId = choose.value;
  choose.addEventListener('change', () => ctx.protect(async () => {
    saved.runId = choose.value; saved.offset = 0; saved.previous = []; await ctx.render();
  }));
  const run = await api(ctx, 'runs/' + encodeURIComponent(saved.runId));
  if (!ctx.current()) return;
  const result = run.result ?? {}, status = run.status ?? run.state;
  ctx.view.append(card(node('h3', {}, 'Retained semantic run'), field('Run', choose),
    row(node('span', { class: 'pill' }, status || 'Retained'),
      note('Started ' + time(run.startedAt) + (run.completedAt ? ' · completed ' + time(run.completedAt) : ''))),
    details('Source, profile and complete run', run),
    note('Read graph coverage with the engine result. A conforming report can contain no applicable targets. The selected shapes and context determine the scope.'),
    result.coverage ? details('Graph coverage', result.coverage) : null,
    row(action(ctx, 'Download run record', () => ctx.download('dcat/semantic/files/run/' + run.id, 'dcat-semantic-run.json')),
      action(ctx, 'Complete workspace transfer', () => ctx.openWorkspace()))));
  const artifacts = Array.isArray(run.artifacts) ? run.artifacts : Array.isArray(result.artifacts) ? result.artifacts : [];
  if (artifacts.length) ctx.view.append(card(node('h3', {}, 'Complete engine files'),
    table(['File', 'Size', 'SHA-256', 'Download'], artifacts.map(file => [
      file.key ?? file.name ?? file.path, file.bytes, file.sha256,
      action(ctx, 'Download', () => ctx.download('dcat/semantic/files/artifact/' + run.id + '?' +
        new URLSearchParams({ key: file.key ?? file.name ?? file.path }), file.downloadName ?? file.name ?? String(file.key ?? 'semantic-artifact').split('/').at(-1))),
    ]))));
  if (!run.runSha256) {
    ctx.view.append(note('The original operation retains its progress. Refresh after it completes to review the full findings.')); return;
  }
  const search = input('semantic-finding-search', saved.search, { type: 'search', placeholder: 'Focus, path or message' });
  const severity = select('semantic-finding-severity', [['', 'All severities'], ['http://www.w3.org/ns/shacl#Violation', 'Violation'], ['http://www.w3.org/ns/shacl#Warning', 'Warning'], ['http://www.w3.org/ns/shacl#Info', 'Info']], saved.severity);
  const filters = node('form', { onsubmit: event => { event.preventDefault(); ctx.protect(async () => {
    saved.search = search.value; saved.severity = severity.value; saved.offset = 0; saved.previous = []; await ctx.render();
  }); } }, row(field('Findings search', search), field('Severity', severity), node('button', { type: 'submit' }, 'Apply filters')));
  const page = await api(ctx, 'runs/' + run.id + '/findings?' + new URLSearchParams({
    offset: saved.offset, limit: PAGE, ...(saved.search ? { search: saved.search } : {}),
    ...(saved.severity ? { severity: saved.severity } : {}),
  }));
  if (!ctx.current()) return;
  const rows = page.findings ?? page.rows ?? [], paging = page.page ?? page;
  ctx.view.append(card(node('h3', {}, 'Findings'), filters,
    note('Showing ' + rows.length + ' findings · ' + (paging.total ?? rows.length) + ' matched'),
    page.availability === 'UNAVAILABLE' ? note('This attempt has no native findings report. Inspect its retained outcome and engine files.') : rows.length ? findingsTable(rows) : note('No findings match this selection.'),
    row(action(ctx, 'Previous findings', async () => { saved.offset = saved.previous.pop() ?? 0; await ctx.render(); }, !saved.previous.length),
      action(ctx, 'More findings', async () => { saved.previous.push(saved.offset); saved.offset = paging.nextOffset; await ctx.render(); }, paging.nextOffset === null || paging.nextOffset === undefined))));
  const reviews = run.reviews ?? [], latest = reviews.at(-1);
  const draftKey = run.id + ':' + (latest?.reviewSha256 ?? '');
  if (!saved.reviewDrafts.has(draftKey)) saved.reviewDrafts.set(draftKey, { decision: 'ACKNOWLEDGE', note: '' });
  const draft = saved.reviewDrafts.get(draftKey);
  const decisions = [['ACKNOWLEDGE', 'Acknowledge findings'], ...(status === 'COMPLETE' ? [['CHANGES_REQUIRED', 'Request changes'], ['ACCEPT', 'Accept for the stated purpose']] : [])];
  if (!decisions.some(([value]) => value === draft.decision)) draft.decision = 'ACKNOWLEDGE';
  const decision = bind(select('semantic-review-decision', decisions, draft.decision),
    () => { draft.decision = decision.value; });
  const reason = bind(node('textarea', { name: 'semantic-review-note', maxlength: 4096, rows: 4, placeholder: 'Record intended use, coverage and any accepted exceptions.' }, draft.note),
    () => { draft.note = reason.value; });
  ctx.view.append(card(node('h3', {}, 'Operator decision'),
    note('This records your review of the retained report. Catalogue cutover remains an explicit migration action.'),
    field('Decision', decision), field('Reason and intended use', reason),
    action(ctx, 'Save decision', async () => {
      if (!draft.note.trim()) throw new Error('Record the reason and intended use.');
      await mutate(ctx, saved, 'reviews', { runId: run.id, expectedRunSha256: run.runSha256,
        expectedReviewSha256: latest?.reviewSha256 ?? null, decision: draft.decision, note: draft.note });
    }, Boolean(ctx.state.active)),
    ...reviews.map(review => node('div', { class: 'resource' },
      node('strong', {}, review.decision + ' · ' + time(review.createdAt)),
      note(review.note), action(ctx, 'Download decision', () => ctx.download(
        'dcat/semantic/files/review/' + review.id, 'dcat-semantic-decision.json'))))));
}
export async function renderDcatSemantic(ctx) {
  const saved = memory(ctx), semantic = ctx.state.dcat?.semantic ?? { profiles: [], runs: [], reviews: [] };
  ctx.view.append(node('h2', {}, 'Catalogue semantic validation'),
    note('Keep original catalogue editions, explicit local contexts, SHACL shapes, complete native findings and operator decisions in this project.'),
    row(action(ctx, 'Profiles · ' + semantic.profiles.length, async () => { saved.tab = 'profiles'; await ctx.render(); }),
      action(ctx, 'Run validation', async () => { saved.tab = 'run'; await ctx.render(); }),
      action(ctx, 'Runs · ' + semantic.runs.length, async () => { saved.tab = 'runs'; await ctx.render(); }),
      action(ctx, 'Operating guide', () => ctx.download('dcat/semantic/guide', 'SEMANTIC_CATALOGS.md'))));
  if (saved.tab === 'profiles') await profilesView(ctx, saved, semantic);
  else if (saved.tab === 'run') ctx.view.append(runEditor(ctx, saved, semantic));
  else await runsView(ctx, saved, semantic);
}
