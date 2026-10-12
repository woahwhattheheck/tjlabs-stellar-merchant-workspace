// MIT. Original NetCDF operator: complete originals, saved recipes and editions.
const $ = id => document.getElementById(id);
const S = {
  state: null, source: null, variable: null, draft: null, run: null,
  variablePage: 0, previewOffset: 0, previewTotal: 0, previewNext: null,
  previewSerial: 0, previewController: null, busy: false, loading: false, connected: false,
  sourceSerial: 0, variableSerial: 0, tab: 'sources', pending: null,
};
const VARIABLE_PAGE = 30;
const number = value => typeof value === 'bigint' ? value.toLocaleString() : Number(value).toLocaleString();
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
};
const clear = node => node.replaceChildren();
const pretty = value => JSON.stringify(value, null, 2);
const clone = value => JSON.parse(JSON.stringify(value));
const sorted = value => {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]));
  return value;
};
const identical = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

function readableDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(date);
}

function bytes(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Size unavailable';
  if (amount < 1024) return `${number(amount)} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  const exponent = Math.min(units.length, Math.floor(Math.log(amount) / Math.log(1024)));
  return `${(amount / 1024 ** exponent).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[exponent - 1]}`;
}

function typedText(value) {
  if (value === undefined) return '—';
  if (value === null) return 'Null';
  if (Array.isArray(value)) return `[${value.map(typedText).join(', ')}]`;
  if (typeof value !== 'object') return String(value);
  if (value.kind === 'missing') return 'Missing';
  if (value.kind === 'integer' || value.kind === 'float') return String(value.value);
  if (value.kind === 'complex') return `${typedText(value.real)} + ${typedText(value.imaginary)}i`;
  if (value.kind === 'compound') return Object.entries(value.fields || {}).map(([k, v]) => `${k}: ${typedText(v)}`).join('; ');
  if (value.kind === 'bytes') {
    try {
      const raw = Uint8Array.from(atob(value.base64), c => c.charCodeAt(0));
      const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      if (!/[\x00-\x08\x0e-\x1f\x7f]/.test(text)) return text;
      return `Bytes · ${number(raw.length)} B · ${value.base64}`;
    } catch { return `Bytes · ${value.base64}`; }
  }
  if ('value' in value) return String(value.value);
  return Object.entries(value).map(([k, v]) => `${k}: ${typedText(v)}`).join('; ');
}

function displayName(variable) {
  const title = variable?.attributes?.long_name;
  return title ? typedText(title) : variable?.name || variable?.path || 'Variable';
}
const shapeText = shape => shape?.length ? shape.map(number).join(' × ') : 'Scalar';
const dimensionText = variable => (variable?.dimensions || []).map(d => `${d.name} (${number(d.size)})`).join(' × ') || 'Scalar';
const isCoordinate = variable => (variable.dimensions?.length === 1 && variable.path === variable.dimensions[0].path) || Boolean(variable.cf?.axis);
const sourceFor = id => S.state?.sources.find(item => item.id === id);
const selectionFor = id => S.state?.selections.find(item => item.id === id);
const variableFor = (source, path) => source?.catalog?.variables?.find(v => v.path === path);

function notice(message, error = false) {
  $('notice').textContent = String(message);
  $('notice').hidden = !message;
  $('notice').setAttribute('role', error ? 'alert' : 'status');
}

class NativeError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  let result;
  try { result = await response.json(); }
  catch { throw new NativeError(`The workspace returned an unreadable response (${response.status}).`, 'HTTP_RESPONSE', response.status); }
  if (!response.ok || result?.error) {
    const failure = result?.error || {};
    if (response.status === 401) {
      S.connected = false;
      $('connection').hidden = false;
      $('connection-status').textContent = 'Session key required';
      syncActions();
    }
    throw new NativeError(failure.message || `The request returned ${response.status}.`, failure.code, response.status);
  }
  return result;
}

function invoke(method, params = {}, options = {}) {
  return api('/api/invoke', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }), ...options,
  });
}

function storageKey(suffix) { return `starforge-netcdf:${S.state?.project.id || 'opening'}:${suffix}`; }
function storageRead(suffix) {
  try { return JSON.parse(localStorage.getItem(storageKey(suffix)) || 'null'); }
  catch { return null; }
}
function storageWrite(suffix, value) {
  try {
    if (value === null) localStorage.removeItem(storageKey(suffix));
    else localStorage.setItem(storageKey(suffix), JSON.stringify(value));
  } catch { /* A native request remains independently retained by the owner. */ }
}

function objectUrl(file, name = file.name) {
  if (!/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('The file has an invalid native digest.');
  return `/api/object/${file.sha256}?name=${encodeURIComponent(name || 'original')}`;
}

function fileLink(file, label, name = file.name) {
  const link = element('a', label, 'button secondary');
  link.href = objectUrl(file, name);
  link.download = name || file.name;
  link.title = `${file.name} · ${bytes(file.bytes)}`;
  return link;
}

function startDownload(file) {
  const link = fileLink(file, file.name);
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
}

function metric(parent, label, value, detail) {
  const box = element('div', null, 'metric');
  box.append(element('span', label, 'label'), element('span', value, 'value'));
  if (detail) box.append(element('span', detail, 'detail'));
  parent.append(box);
}

function attributes(parent, values) {
  clear(parent);
  for (const [key, value] of Object.entries(values || {})) parent.append(element('dt', key), element('dd', typedText(value)));
  if (!Object.keys(values || {}).length) parent.append(element('dt', 'Attributes'), element('dd', 'No attributes declared.'));
}

function itemButton(parent, item, title, sub, selected, callback) {
  const button = element('button', null, 'item-button');
  button.type = 'button';
  button.setAttribute('aria-current', String(selected));
  button.append(element('span', title, 'name'), element('span', sub, 'sub'));
  button.addEventListener('click', callback);
  parent.append(button);
}

function fillSelect(select, values, current, placeholder) {
  clear(select);
  if (placeholder) { const option = element('option', placeholder); option.value = ''; select.append(option); }
  for (const [value, label] of values) { const option = element('option', label); option.value = value; select.append(option); }
  if (values.some(([value]) => value === current)) select.value = current;
}

function switchTab(tab) {
  S.tab = tab;
  for (const button of document.querySelectorAll('[data-tab]')) {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  for (const id of ['sources', 'selections', 'results', 'handover']) $(id).hidden = id !== tab;
  if (tab === 'handover') renderHandover();
  storageWrite('view', tab);
}

function syncActions() {
  const locked = S.busy || S.loading || !S.connected;
  for (const node of document.querySelectorAll('main input, main select, main textarea')) {
    if (node.id !== 'session-key') node.disabled = locked;
  }
  const canRun = Boolean(S.draft?.saved_id && !draftChanged());
  const flags = {
    'refresh': locked, 'refresh-results': locked, 'import-source': locked,
    'new-selection': locked || !S.state?.sources.length,
    'select-variable': locked || !S.variable?.selectable,
    'save-selection': locked || !S.draft?.variables.length,
    'run-selection': locked || !canRun,
    'add-selection-variable': locked || !$('selection-variable').value,
    'save-review': locked || !S.run, 'export-project': locked,
    'receive-project': locked,
  };
  for (const [id, disabled] of Object.entries(flags)) $(id).disabled = disabled;
  $('connection-status').textContent = !S.connected ? 'Session key required' : S.loading ? 'Opening workspace' : S.busy ? 'Working on this host' : 'Workspace ready';
}

async function work(label, action) {
  if (S.busy) return;
  S.busy = true; syncActions(); notice(`${label}…`);
  try { return await action(); }
  catch (error) {
    notice(error.message || String(error), true);
    if (S.pending) addRecoveryButton();
  } finally { S.busy = false; syncActions(); }
}

async function loadState() {
  S.state = await api('/api/state');
  S.connected = true;
  $('connection').hidden = true;
  $('project-name').textContent = S.state.project.title;
  $('source-count').textContent = number(S.state.sources.length);
  $('selection-count').textContent = number(S.state.selections.length);
  $('result-count').textContent = number(S.state.runs.length);
  if (S.draft) renderDraft();
  renderLists(); renderHandover(); syncActions();
  return S.state;
}

function renderLists() {
  clear($('source-list')); clear($('selection-list')); clear($('result-list'));
  $('source-list-count').textContent = `${number(S.state.sources.length)} files`;
  $('selection-list-count').textContent = number(S.state.selections.length);
  $('result-list-count').textContent = number(S.state.runs.length);
  for (const source of [...S.state.sources].reverse()) itemButton($('source-list'), source, source.name,
    `${bytes(source.bytes)} · ${readableDate(source.imported_at)}`, source.id === S.source?.id,
    () => selectSource(source.id).catch(error => notice(error.message, true)));
  for (const selection of [...S.state.selections].reverse()) {
    const selected = selection.variables.filter(v => v.role === 'selected' || !v.role).length;
    itemButton($('selection-list'), selection, selection.title,
      `${number(selected)} selected variables · ${readableDate(selection.created_at)}`, selection.id === S.draft?.saved_id,
      () => { loadSelection(selection.id); notice('Saved recipe loaded. Saving changes creates a new retained recipe.'); });
  }
  for (const run of [...S.state.runs].reverse()) itemButton($('result-list'), run, run.title,
    `${number(run.cells)} values · ${readableDate(run.created_at)}`, run.id === S.run?.id,
    () => openRun(run.id).catch(error => notice(error.message, true)));
  if (!S.state.sources.length) $('source-list').append(element('p', 'Import a complete source to begin.', 'empty'));
  if (!S.state.selections.length) $('selection-list').append(element('p', 'Choose a source variable and save a selection.', 'empty'));
  if (!S.state.runs.length) $('result-list').append(element('p', 'Run a saved selection to create an edition.', 'empty'));
}

async function selectSource(id) {
  const serial = ++S.sourceSerial;
  const source = await invoke('source', { id });
  if (serial !== S.sourceSerial) return;
  S.source = source; S.variable = null; S.variablePage = 0;
  $('source-empty').hidden = true; $('source-content').hidden = false; $('variable-inspector').hidden = true;
  $('source-title').textContent = source.name;
  $('source-description').textContent = `${source.catalog.format} · imported ${readableDate(source.imported_at)}${source.reference ? ` · ${source.reference}` : ''}`;
  $('original-download').href = objectUrl(source); $('original-download').download = source.name;
  clear($('source-metrics'));
  metric($('source-metrics'), 'Original file', bytes(source.bytes));
  metric($('source-metrics'), 'Variables', number(source.catalog.variables.length));
  metric($('source-metrics'), 'Dimensions', number(source.catalog.dimensions.length));
  metric($('source-metrics'), 'Groups', number(source.catalog.groups.length));
  attributes($('global-attributes'), source.catalog.attributes);
  $('source-identity').textContent = pretty({ id: source.id, sha256: source.sha256, bytes: source.bytes, imported_at: source.imported_at, reference: source.reference });
  fillSelect($('variable-group'), source.catalog.groups.map(g => [g.path, g.path === '/' ? 'Root group' : g.path]), '', 'All groups');
  $('variable-search').value = ''; $('variable-kind').value = '';
  renderVariableRows(); renderLists(); syncActions(); storageWrite('source', id);
}

function filteredVariables() {
  const q = $('variable-search').value.trim().toLocaleLowerCase();
  const group = $('variable-group').value; const kind = $('variable-kind').value;
  return (S.source?.catalog.variables || []).filter(variable => {
    const coordinate = isCoordinate(variable);
    const text = [variable.name, variable.path, displayName(variable), dimensionText(variable), typedText(variable.cf?.standard_name)].join(' ').toLocaleLowerCase();
    return (!q || text.includes(q)) && (!group || variable.group === group) && (!kind || (kind === 'coordinate' ? coordinate : !coordinate));
  });
}

function renderVariableRows() {
  const variables = filteredVariables();
  S.variablePage = Math.min(S.variablePage, Math.max(0, Math.ceil(variables.length / VARIABLE_PAGE) - 1));
  const offset = S.variablePage * VARIABLE_PAGE;
  clear($('variable-rows'));
  for (const variable of variables.slice(offset, offset + VARIABLE_PAGE)) {
    const row = element('tr'); const name = element('td');
    const button = element('button', variable.name, 'text-button'); button.type = 'button';
    button.addEventListener('click', () => inspectVariable(variable.path).catch(error => notice(error.message, true)));
    name.append(button, element('div', displayName(variable) === variable.name ? variable.group === '/' ? 'Root group' : variable.group : displayName(variable), 'sub'));
    row.append(name, element('td', dimensionText(variable)), element('td', variable.dtype),
      element('td', typedText(variable.cf?.units)), element('td', isCoordinate(variable) ? 'Coordinate' : 'Data'));
    $('variable-rows').append(row);
  }
  if (!variables.length) { const row = element('tr'); const cell = element('td', 'No variables match these filters.', 'empty'); cell.colSpan = 5; row.append(cell); $('variable-rows').append(row); }
  $('inventory-context').textContent = `${number(variables.length)} of ${number(S.source?.catalog.variables.length || 0)} original variables${variables.length ? '. Select a name to inspect it.' : '.'}`;
  $('variable-page').textContent = variables.length ? `${number(offset + 1)}–${number(Math.min(offset + VARIABLE_PAGE, variables.length))} of ${number(variables.length)}` : '0 variables';
  $('variable-previous').disabled = S.variablePage === 0;
  $('variable-next').disabled = offset + VARIABLE_PAGE >= variables.length;
}

async function inspectVariable(path) {
  const serial = ++S.variableSerial; const source = S.source;
  const variable = await invoke('variable', { source_id: source.id, path });
  if (serial !== S.variableSerial || source.id !== S.source?.id) return;
  S.variable = variable; $('variable-inspector').hidden = false;
  $('variable-title').textContent = displayName(variable);
  $('variable-description').textContent = `${variable.name} · ${variable.group === '/' ? 'Root group' : variable.group}`;
  clear($('variable-metrics'));
  metric($('variable-metrics'), 'Native type', variable.dtype, variable.type_kind);
  metric($('variable-metrics'), 'Original shape', shapeText(variable.shape));
  metric($('variable-metrics'), 'Units', typedText(variable.cf?.units));
  metric($('variable-metrics'), 'Convention', typedText(variable.cf?.standard_name || variable.cf?.axis));
  const notes = [];
  if (variable.cf?.calendar) notes.push(`Declared calendar: ${typedText(variable.cf.calendar)}.`);
  if (variable.attributes.scale_factor !== undefined || variable.attributes.add_offset !== undefined) notes.push(`Declared scale factor ${typedText(variable.attributes.scale_factor ?? 1)} and offset ${typedText(variable.attributes.add_offset ?? 0)}. CF decoding is an explicit saved choice.`);
  if (variable.attributes._FillValue !== undefined || variable.attributes.missing_value !== undefined) notes.push(`Declared missing values: ${typedText(variable.attributes._FillValue ?? variable.attributes.missing_value)}. Raw values remain in the complete exports; CF decoding adds their masked interpretation.`);
  if (variable.cf?.coordinates) notes.push(`Referenced coordinates: ${typedText(variable.cf.coordinates)}.`);
  clear($('cf-notes')); for (const note of notes) $('cf-notes').append(element('p', note)); $('cf-notes').hidden = !notes.length;
  clear($('dimension-rows'));
  for (const dimension of variable.dimensions) {
    const coordinate = variableFor(source, dimension.path);
    const row = element('tr');
    row.append(element('td', dimension.name), element('td', `${number(dimension.size)}${dimension.unlimited ? ' · unlimited' : ''}`),
      element('td', coordinate ? `${coordinate.name}${coordinate.cf?.units ? ` · ${typedText(coordinate.cf.units)}` : ''}` : '—'),
      element('td', dimension.size ? `Indices 0–${number(dimension.size - 1)}` : 'Empty dimension'));
    $('dimension-rows').append(row);
  }
  if (!variable.dimensions.length) { const row = element('tr'); const cell = element('td', 'Scalar variable; no dimension axes.'); cell.colSpan = 4; row.append(cell); $('dimension-rows').append(row); }
  attributes($('variable-attributes'), variable.attributes); $('variable-metadata').textContent = pretty(variable);
  syncActions(); $('variable-inspector').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function newDraft(sourceId, path) {
  S.draft = { title: '', source_id: sourceId || S.source?.id || S.state.sources[0]?.id || '', variables: [], active_path: '', decode_cf: false, include_coordinates: true, saved_id: null };
  if (path) addChoice(path);
  renderDraft(); persistDraft(); switchTab('selections');
}

function sharedSlices() {
  const shared = {};
  for (const choice of S.draft?.variables || []) Object.assign(shared, choice.slices);
  return shared;
}

function addChoice(path) {
  if (!S.draft) return;
  const source = sourceFor(S.draft.source_id); const variable = variableFor(source, path);
  if (!variable?.selectable) return;
  if (!S.draft.variables.some(choice => choice.path === path)) {
    const shared = sharedSlices();
    S.draft.variables.push({ path, slices: Object.fromEntries(variable.dimensions.map(d => [d.path, clone(shared[d.path] || { start: 0, stop: d.size, step: 1 })])) });
  }
  S.draft.active_path = path;
}

function recipePayload(draft) {
  return { title: draft.title.trim(), source_id: draft.source_id, variables: draft.variables.map(({ path, slices }) => ({ path, slices })),
    decode_cf: Boolean(draft.decode_cf), include_coordinates: Boolean(draft.include_coordinates) };
}

function savedPayload(selection) {
  return { title: selection.title, source_id: selection.source_id, variables: selection.variables.filter(v => v.role === 'selected' || !v.role).map(({ path, slices }) => ({ path, slices })),
    decode_cf: Boolean(selection.decode_cf), include_coordinates: Boolean(selection.include_coordinates) };
}

function draftChanged() {
  if (!S.draft?.saved_id) return true;
  const saved = selectionFor(S.draft.saved_id);
  return !saved || !identical(recipePayload(S.draft), savedPayload(saved));
}

function persistDraft() {
  storageWrite('draft', S.draft);
  $('draft-status').textContent = !S.draft ? '' : S.draft.saved_id && !draftChanged() ? 'Saved recipe' : 'Draft saved on this browser';
  syncActions();
}

function loadSelection(id) {
  const selection = selectionFor(id);
  if (!selection) throw new Error('The saved selection is unavailable. Refresh the workspace.');
  S.draft = { ...clone(savedPayload(selection)), active_path: selection.variables.find(v => v.role === 'selected' || !v.role)?.path || '', saved_id: id };
  renderDraft(); persistDraft(); renderLists(); switchTab('selections');
}

function renderDraft() {
  if (!S.draft) newDraft();
  const draft = S.draft; const source = sourceFor(draft.source_id);
  $('selection-name').value = draft.title;
  fillSelect($('selection-source'), S.state.sources.map(item => [item.id, `${item.name} · ${readableDate(item.imported_at)}`]), draft.source_id, 'Choose an original source');
  fillSelect($('selection-variable'), (source?.catalog.variables || []).filter(v => v.selectable).map(v => [v.path, `${v.name} · ${dimensionText(v)}`]), draft.active_path, 'Choose a variable');
  $('decode-cf').checked = draft.decode_cf; $('include-coordinates').checked = draft.include_coordinates;
  $('selection-mode').textContent = draft.saved_id ? draftChanged() ? 'NEW EDITION FROM SAVED RECIPE' : 'SAVED SELECTION' : 'NEW SELECTION';
  $('selection-heading').textContent = draft.title || 'Choose a variable';
  $('selection-details').hidden = !draft.saved_id;
  if (draft.saved_id) $('selection-metadata').textContent = pretty(selectionFor(draft.saved_id));
  renderChoiceChips(); renderSliceRows(); persistDraft();
}

function renderChoiceChips() {
  clear($('selected-variable-list'));
  const source = sourceFor(S.draft.source_id);
  for (const choice of S.draft.variables) {
    const variable = variableFor(source, choice.path);
    const chip = element('div', null, `variable-chip${choice.path === S.draft.active_path ? ' active' : ''}`);
    const select = element('button', variable?.name || choice.path); select.type = 'button';
    select.setAttribute('aria-label', `Edit index selection for ${variable?.name || choice.path}`);
    select.addEventListener('click', () => { S.draft.active_path = choice.path; $('selection-variable').value = choice.path; renderChoiceChips(); renderSliceRows(); persistDraft(); });
    const remove = element('button', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${variable?.name || choice.path}`);
    remove.addEventListener('click', () => { S.draft.variables = S.draft.variables.filter(v => v.path !== choice.path); if (S.draft.active_path === choice.path) S.draft.active_path = S.draft.variables[0]?.path || ''; renderDraft(); });
    chip.append(select, remove); $('selected-variable-list').append(chip);
  }
}

function renderSliceRows() {
  clear($('slice-rows'));
  const choice = S.draft.variables.find(v => v.path === S.draft.active_path);
  const variable = variableFor(sourceFor(S.draft.source_id), S.draft.active_path);
  $('selection-variable-context').textContent = variable ? `${displayName(variable)} · ${variable.dtype}${variable.cf?.units ? ` · ${typedText(variable.cf.units)}` : ''}` : 'Add the variables to include in this recipe.';
  if (!choice || !variable) { updateSliceSummary(); return; }
  for (const dimension of variable.dimensions) {
    const spec = choice.slices[dimension.path]; const row = element('tr');
    row.append(element('td', dimension.name), element('td', number(dimension.size)));
    for (const field of ['start', 'stop', 'step']) {
      const cell = element('td'); const input = element('input');
      input.type = 'number'; input.step = '1'; input.min = field === 'step' ? '1' : '0';
      if (field !== 'step') input.max = String(dimension.size);
      input.value = String(spec[field]); input.required = true;
      input.dataset.dimension = dimension.path; input.dataset.field = field;
      input.setAttribute('aria-label', `${dimension.name} ${field}`);
      input.addEventListener('input', () => {
        const next = input.value === '' ? null : Number(input.value);
        for (const selected of S.draft.variables) if (selected.slices[dimension.path]) selected.slices[dimension.path][field] = next;
        updateSliceSummary(); persistDraft();
      });
      cell.append(input); row.append(cell);
    }
    const selected = element('td', '', 'selected-axis-count'); selected.dataset.dimension = dimension.path; row.append(selected);
    $('slice-rows').append(row);
  }
  if (!variable.dimensions.length) { const row = element('tr'); const cell = element('td', 'The complete scalar is selected.'); cell.colSpan = 6; row.append(cell); $('slice-rows').append(row); }
  updateSliceSummary();
}

function sliceCount(spec, size) {
  if (!spec || ![spec.start, spec.stop, spec.step].every(Number.isSafeInteger) || spec.start < 0 || spec.start > spec.stop || spec.stop > size || spec.step <= 0) return null;
  return Math.ceil((spec.stop - spec.start) / spec.step);
}

function updateSliceSummary() {
  if (!S.draft) return;
  const source = sourceFor(S.draft.source_id); let total = 0n; let invalid = false; const shapes = [];
  for (const choice of S.draft.variables) {
    const variable = variableFor(source, choice.path); if (!variable) { invalid = true; continue; }
    let cells = 1n; const shape = [];
    for (const dimension of variable.dimensions) {
      const count = sliceCount(choice.slices[dimension.path], dimension.size);
      if (count === null) { invalid = true; continue; }
      shape.push(count); cells *= BigInt(count);
      for (const cell of document.querySelectorAll('.selected-axis-count')) if (cell.dataset.dimension === dimension.path) cell.textContent = number(count);
    }
    total += cells; shapes.push(`${variable.name}: ${shapeText(shape)}`);
  }
  $('slice-summary').textContent = invalid ? 'Enter integer ranges within the original dimension lengths; each step must be positive.' : S.draft.variables.length ? `${number(total)} selected data values · ${shapes.join('; ')}${S.draft.include_coordinates ? '. Related coordinate and reference values are included by the native recipe.' : '.'} Shared original dimensions use the same range.` : 'Add a variable to define its index selection.';
  return !invalid && S.draft.variables.length > 0;
}

async function retainedWrite(method, params, label) {
  if (S.pending) throw new Error('Recover the retained earlier request before starting another write.');
  S.pending = { method, params: { ...params, request_id: crypto.randomUUID() }, label };
  storageWrite('pending', S.pending);
  try {
    const result = await invoke(method, S.pending.params);
    S.pending = null; storageWrite('pending', null); return result;
  } catch (error) {
    if (error instanceof NativeError && error.status < 500 && error.status !== 401) { S.pending = null; storageWrite('pending', null); }
    throw error;
  }
}

function addRecoveryButton() {
  if (!S.pending) return;
  $('notice').append(element('span', ` The original ${S.pending.label} request is retained.`));
  const button = element('button', 'Recover original request', 'secondary'); button.type = 'button';
  button.addEventListener('click', () => work('Recovering original request', recoverPending));
  $('notice').append(button);
}

async function recoverPending() {
  const pending = S.pending || storageRead('pending'); if (!pending) return;
  S.pending = pending;
  try {
    const result = await invoke(pending.method, pending.params);
    S.pending = null; storageWrite('pending', null); await loadState();
    if (pending.method === 'selection.save') loadSelection(result.id);
    if (pending.method === 'run') await openRun(result.id);
    if (pending.method === 'review.save' && S.run) renderReviews();
    notice(`Recovered the original ${pending.label} request.`);
  } catch (error) {
    if (error instanceof NativeError && error.status < 500 && error.status !== 401) { S.pending = null; storageWrite('pending', null); }
    throw error;
  }
}

async function saveSelection() {
  if (!S.draft || !updateSliceSummary()) throw new Error('Choose a variable and valid index ranges.');
  S.draft.title = $('selection-name').value.trim();
  if (!S.draft.title) throw new Error('Name this selection before saving it.');
  const selection = await retainedWrite('selection.save', { ...recipePayload(S.draft), expected_revision: S.state.project.revision }, 'saved selection');
  await loadState(); loadSelection(selection.id); notice('The complete selection recipe is saved. It is ready to run.');
}

async function runSelection() {
  if (!S.draft?.saved_id || draftChanged()) throw new Error('Save the current recipe before running it.');
  const run = await retainedWrite('run', { selection_id: S.draft.saved_id }, 'extraction');
  await loadState(); await openRun(run.id); notice(`Complete result retained: ${number(run.cells)} original and accompanying values.`);
}

async function openRun(id) {
  const run = await invoke('run.get', { id });
  S.run = run; S.previewOffset = 0;
  $('result-empty').hidden = true; $('result-content').hidden = false;
  $('result-title').textContent = run.title;
  const source = sourceFor(run.source_id); const selection = selectionFor(run.selection_id);
  $('result-description').textContent = `${source?.name || 'Retained original'} · ${readableDate(run.created_at)}`;
  $('result-status').textContent = run.status === 'complete' ? 'Complete edition' : run.status;
  clear($('result-metrics'));
  metric($('result-metrics'), 'Complete values', number(run.cells));
  metric($('result-metrics'), 'Variables', number(run.variables.length));
  metric($('result-metrics'), 'Native files', number(run.files.length));
  metric($('result-metrics'), 'Value policy', selection?.decode_cf ? 'Raw + CF decoded' : 'Original raw');
  clear($('result-notes'));
  const associated = run.variables.filter(v => v.role === 'coordinate-or-reference').length;
  if (associated) $('result-notes').append(element('p', `${number(associated)} related coordinate or reference variables accompany this selection with their original metadata.`));
  if (selection?.decode_cf) $('result-notes').append(element('p', 'JSONL and CSV include raw values alongside explicit CF decoded values and declared calendar context. The NetCDF export preserves original native types and attributes.'));
  $('result-notes').hidden = !$('result-notes').childNodes.length;
  clear($('result-downloads'));
  const labels = { 'selection.nc': 'Native NetCDF', 'values.csv': 'Complete CSV', 'values.jsonl': 'Complete JSONL', 'manifest.json': 'Manifest', 'report.html': 'HTML report' };
  for (const file of run.files) $('result-downloads').append(fileLink(file, labels[file.name] || file.name));
  $('result-metadata').textContent = pretty({ result: run, selection, source: source ? { name: source.name, sha256: source.sha256, bytes: source.bytes, reference: source.reference } : null });
  fillSelect($('preview-variable'), run.variables.map(variable => [variable.path, `${variable.name} · ${shapeText(variable.selection.shape)}${variable.role === 'coordinate-or-reference' ? ' · accompanying' : ''}`]), run.variables.find(v => v.role === 'selected')?.path || run.variables[0]?.path);
  renderReviews(); renderLists(); syncActions(); switchTab('results'); storageWrite('run', id);
  await loadPreview();
}

async function loadPreview() {
  if (!S.run) return;
  const run = S.run; const path = $('preview-variable').value;
  const variable = run.variables.find(v => v.path === path);
  if (!variable) return;
  const selection = selectionFor(run.selection_id); const serial = ++S.previewSerial;
  S.previewController?.abort(); S.previewController = new AbortController();
  $('result-preview-context').textContent = 'Reading the selected original values…';
  let preview;
  try {
    preview = await invoke('preview', { source_id: run.source_id, path,
      slices: variable.selection.slices, decode_cf: Boolean(selection?.decode_cf),
      offset: S.previewOffset, limit: Number($('preview-limit').value) }, { signal: S.previewController.signal });
  } catch (error) { if (error.name === 'AbortError') return; throw error; }
  if (serial !== S.previewSerial || run.id !== S.run?.id) return;
  S.previewTotal = preview.total; S.previewNext = preview.next_offset;
  const headers = ['Original index', 'Raw value'];
  if (selection?.decode_cf) headers.push('CF decoded value');
  const calendar = preview.items.some(item => item.calendar_value !== undefined);
  if (calendar) headers.push('Declared calendar value');
  clear($('preview-head')); const heading = element('tr'); for (const header of headers) heading.append(element('th', header)); $('preview-head').append(heading);
  clear($('preview-rows'));
  for (const item of preview.items) {
    const row = element('tr'); row.append(element('td', item.index.length ? `[${item.index.map(number).join(', ')}]` : 'Scalar'), element('td', typedText(item.raw), item.raw?.kind === 'missing' ? 'missing' : ''));
    if (selection?.decode_cf) row.append(element('td', typedText(item.decoded), item.decoded?.kind === 'missing' ? 'missing' : ''));
    if (calendar) row.append(element('td', typedText(item.calendar_value)));
    $('preview-rows').append(row);
  }
  if (!preview.items.length) { const row = element('tr'); const cell = element('td', 'This index selection contains no values.', 'empty'); cell.colSpan = headers.length; row.append(cell); $('preview-rows').append(row); }
  const end = S.previewOffset + preview.items.length;
  $('result-preview-context').textContent = `${variable.name} · ${shapeText(preview.selection.shape)} · ${number(preview.total)} complete values${variable.cf?.units ? ` · ${typedText(variable.cf.units)}` : ''}`;
  $('preview-page').textContent = preview.items.length ? `${number(S.previewOffset + 1)}–${number(end)} of ${number(preview.total)}` : '0 values';
  $('preview-previous').disabled = S.previewOffset === 0;
  $('preview-next').disabled = preview.next_offset === null;
}

function renderReviews() {
  clear($('review-history'));
  const reviews = S.state.reviews.filter(review => review.run_id === S.run?.id);
  for (const review of [...reviews].reverse()) {
    const card = element('div', null, 'review-card'); const heading = element('div', null, 'review-heading');
    heading.append(element('h3', review.reviewer || 'Reviewer'), element('span', review.decision.replaceAll('-', ' '), 'badge'));
    card.append(heading, element('div', readableDate(review.created_at), 'sub'), element('p', review.notes));
    $('review-history').append(card);
  }
  if (!reviews.length) $('review-history').append(element('p', 'No review recorded for this edition.', 'empty'));
}

async function saveReview() {
  if (!S.run) throw new Error('Select a result edition before saving a review.');
  const review = await retainedWrite('review.save', { run_id: S.run.id,
    reviewer: $('review-author').value.trim(), decision: $('review-outcome').value,
    notes: $('review-notes').value.trim(), expected_revision: S.state.project.revision }, 'edition review');
  storageWrite('reviewer', review.reviewer); await loadState(); renderReviews(); $('review-notes').value = '';
  notice('Review saved against this exact result edition.');
}

function renderHandover() {
  if (!S.state) return;
  clear($('handover-metrics'));
  metric($('handover-metrics'), 'Originals', number(S.state.sources.length));
  metric($('handover-metrics'), 'Recipes', number(S.state.selections.length));
  metric($('handover-metrics'), 'Editions', number(S.state.runs.length));
  metric($('handover-metrics'), 'Reviews', number(S.state.reviews.length));
  const current = $('handover-run').value || S.run?.id || S.state.runs.at(-1)?.id;
  fillSelect($('handover-run'), [...S.state.runs].reverse().map(run => [run.id, `${run.title} · ${readableDate(run.created_at)}`]), current, S.state.runs.length ? null : 'Run a selection to create a report');
  renderReportLinks(); $('project-identity').textContent = pretty(S.state.project);
}

function renderReportLinks() {
  const run = S.state?.runs.find(item => item.id === $('handover-run').value);
  for (const [id, name] of [['report-html', 'report.html'], ['report-json', 'manifest.json']]) {
    const file = run?.files.find(item => item.name === name);
    const link = $(id); link.setAttribute('aria-disabled', String(!file));
    if (file) { link.href = objectUrl(file); link.download = name; }
    else { link.removeAttribute('href'); link.removeAttribute('download'); }
  }
}

async function exportProject() {
  const file = await invoke('export');
  const parent = $('project-downloads'); clear(parent);
  parent.append(fileLink(file, `Download ${file.name}`), element('p', `${bytes(file.bytes)} · complete originals, application and every saved edition`, 'hint'));
  storageWrite('export', file); startDownload(file); notice('The complete editable project is ready. Its full archive download has started.');
}

async function importSource() {
  const file = $('import-file').files[0]; if (!file) throw new Error('Select a complete NetCDF file.');
  const sha256 = await hashFile(file, (done, total) => notice(`Reading complete source: ${bytes(done)} of ${bytes(total)}…`));
  const name = $('import-name').value.trim() || file.name; const reference = $('import-reference').value.trim();
  const fingerprint = JSON.stringify({ sha256, name, reference });
  const prior = storageRead('upload'); const upload = prior?.fingerprint === fingerprint ? prior : { fingerprint, request_id: crypto.randomUUID() };
  storageWrite('upload', upload);
  const query = new URLSearchParams({ name, reference, request_id: upload.request_id });
  const source = await api(`/api/sources?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
  if (source.sha256 !== sha256 || source.bytes !== file.size) throw new Error('The returned source does not match the complete selected file.');
  storageWrite('upload', null); await loadState(); await selectSource(source.id);
  $('import-file').value = ''; $('import-name').value = ''; $('import-reference').value = '';
  notice(`Complete original retained: ${source.name} · ${bytes(source.bytes)} · ${number(source.catalog.variables.length)} variables.`);
}

async function receiveProject() {
  const file = $('receive-file').files[0]; if (!file) throw new Error('Select the complete exported project ZIP.');
  const sha256 = await hashFile(file, (done, total) => notice(`Verifying complete project: ${bytes(done)} of ${bytes(total)}…`));
  const query = new URLSearchParams({ name: file.name, expected_sha: sha256 });
  const received = await api(`/api/receive?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file });
  clear($('receive-result'));
  $('receive-result').append(element('p', 'Independent editable project received. All original source bytes and retained editions were verified.'));
  const location = element('p'); location.append(element('strong', 'Receiving directory: '), element('code', received.directory)); $('receive-result').append(location);
  const title = element('p', 'Open the received application from this directory to continue editing its saved project. The sending workspace remains open.', 'hint'); $('receive-result').append(title);
  const command = element('pre', `python application/cli.py --workspace . serve --port 0`); $('receive-result').append(command);
  const details = element('details'); details.append(element('summary', 'Verified receiving identity'), element('pre', pretty(received))); $('receive-result').append(details);
  storageWrite('received', received); notice('Complete project received into its independent editable directory.');
}

// Incremental SHA-256 reuses the original dbt-artifacts/ui/sha256.js algorithm.
// Complete browser intake is hashed in chunks before original receiving.
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const rotate = (x, n) => (x >>> n) | (x << (32 - n));
class Sha256 {
  constructor() { this.h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]); this.buffer = new Uint8Array(64); this.used = 0; this.bytes = 0n; this.words = new Uint32Array(64); }
  block(data, offset = 0) {
    const w = this.words;
    for (let i = 0; i < 16; i++) { const at = offset + i * 4; w[i] = (data[at] << 24) | (data[at + 1] << 16) | (data[at + 2] << 8) | data[at + 3]; }
    for (let i = 16; i < 64; i++) { const x = w[i - 15], y = w[i - 2]; w[i] = (w[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + w[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>> 0; }
    let [a,b,c,d,e,f,g,h] = this.h;
    for (let i = 0; i < 64; i++) { const t1 = (h + (rotate(e,6) ^ rotate(e,11) ^ rotate(e,25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0; const t2 = ((rotate(a,2) ^ rotate(a,13) ^ rotate(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0; h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; }
    [a,b,c,d,e,f,g,h].forEach((value, index) => { this.h[index] = (this.h[index] + value) >>> 0; });
  }
  update(data) {
    if (!(data instanceof Uint8Array)) data = new Uint8Array(data);
    this.bytes += BigInt(data.length); let at = 0;
    if (this.used) { const count = Math.min(64 - this.used, data.length); this.buffer.set(data.subarray(0, count), this.used); this.used += count; at += count; if (this.used === 64) { this.block(this.buffer); this.used = 0; } }
    for (; at + 64 <= data.length; at += 64) this.block(data, at);
    if (at < data.length) { this.buffer.set(data.subarray(at), 0); this.used = data.length - at; }
    return this;
  }
  hex() {
    this.buffer[this.used++] = 0x80;
    if (this.used > 56) { this.buffer.fill(0, this.used); this.block(this.buffer); this.used = 0; }
    this.buffer.fill(0, this.used, 56); let bits = this.bytes * 8n;
    for (let i = 63; i >= 56; i--) { this.buffer[i] = Number(bits & 255n); bits >>= 8n; }
    this.block(this.buffer); return Array.from(this.h, value => value.toString(16).padStart(8, '0')).join('');
  }
}

async function hashFile(file, progress = () => {}) {
  const hash = new Sha256(); let offset = 0;
  while (offset < file.size) { const end = Math.min(file.size, offset + 4 * 1024 * 1024); hash.update(await file.slice(offset, end).arrayBuffer()); offset = end; progress(offset, file.size); await new Promise(resolve => setTimeout(resolve, 0)); }
  return hash.hex();
}

for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => switchTab(button.dataset.tab));
$('connect-form').addEventListener('submit', event => {
  event.preventDefault();
  work('Opening workspace', async () => {
    const token = $('session-key').value;
    try { await api('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }); }
    finally { $('session-key').value = ''; }
    await initialize(); notice('The workspace is ready.');
  });
});
$('refresh').addEventListener('click', () => work('Refreshing retained sources and editions', async () => { await loadState(); if (S.source) await selectSource(S.source.id); if (S.run) await openRun(S.run.id); notice('Retained sources and editions refreshed.'); }));
$('import-form').addEventListener('submit', event => { event.preventDefault(); work('Importing the complete original', importSource); });
for (const id of ['variable-search', 'variable-group', 'variable-kind']) $(id).addEventListener(id === 'variable-search' ? 'input' : 'change', () => { S.variablePage = 0; renderVariableRows(); });
$('variable-previous').addEventListener('click', () => { S.variablePage--; renderVariableRows(); });
$('variable-next').addEventListener('click', () => { S.variablePage++; renderVariableRows(); });
$('select-variable').addEventListener('click', () => { newDraft(S.source.id, S.variable.path); S.draft.title = displayName(S.variable); renderDraft(); });
$('new-selection').addEventListener('click', () => newDraft());
$('selection-name').addEventListener('input', () => { if (S.draft) { S.draft.title = $('selection-name').value; $('selection-heading').textContent = S.draft.title || 'Choose a variable'; persistDraft(); } });
$('selection-source').addEventListener('change', () => { if (!S.draft) newDraft(); S.draft.source_id = $('selection-source').value; S.draft.variables = []; S.draft.active_path = ''; S.draft.saved_id = null; renderDraft(); });
$('selection-variable').addEventListener('change', () => { if (S.draft.variables.some(v => v.path === $('selection-variable').value)) { S.draft.active_path = $('selection-variable').value; renderChoiceChips(); renderSliceRows(); persistDraft(); } syncActions(); });
$('add-selection-variable').addEventListener('click', () => { addChoice($('selection-variable').value); renderDraft(); });
for (const [id, field] of [['decode-cf', 'decode_cf'], ['include-coordinates', 'include_coordinates']]) $(id).addEventListener('change', () => { if (S.draft) { S.draft[field] = $(id).checked; updateSliceSummary(); persistDraft(); } });
$('selection-form').addEventListener('submit', event => { event.preventDefault(); work('Saving the complete selection recipe', saveSelection); });
$('run-selection').addEventListener('click', () => work('Extracting the complete saved selection', runSelection));
$('refresh-results').addEventListener('click', () => work('Refreshing extraction history', async () => { await loadState(); if (S.run) await openRun(S.run.id); notice('Complete result editions refreshed.'); }));
for (const id of ['preview-variable', 'preview-limit']) $(id).addEventListener('change', () => { S.previewOffset = 0; loadPreview().catch(error => notice(error.message, true)); });
$('preview-previous').addEventListener('click', () => { S.previewOffset = Math.max(0, S.previewOffset - Number($('preview-limit').value)); loadPreview().catch(error => notice(error.message, true)); });
$('preview-next').addEventListener('click', () => { if (S.previewNext !== null) S.previewOffset = S.previewNext; loadPreview().catch(error => notice(error.message, true)); });
$('review-form').addEventListener('submit', event => { event.preventDefault(); work('Saving this edition review', saveReview); });
$('handover-run').addEventListener('change', renderReportLinks);
$('export-project').addEventListener('click', () => work('Packaging the complete editable project', exportProject));
$('receive-form').addEventListener('submit', event => { event.preventDefault(); work('Receiving the complete project', receiveProject); });

async function initialize() {
  S.loading = true; syncActions();
  try {
  await loadState();
  const rememberedTab = storageRead('view');
  const draft = storageRead('draft');
  if (draft && sourceFor(draft.source_id)) {
    const source = sourceFor(draft.source_id);
    if (Array.isArray(draft.variables) && draft.variables.every(choice => variableFor(source, choice.path))) S.draft = draft;
  }
  if (!S.draft) S.draft = { title: '', source_id: S.state.sources[0]?.id || '', variables: [], active_path: '', decode_cf: false, include_coordinates: true, saved_id: null };
  renderDraft(); $('review-author').value = storageRead('reviewer') || '';
  const selectedSource = storageRead('source');
  if (sourceFor(selectedSource)) await selectSource(selectedSource);
  else if (S.state.sources.length) await selectSource(S.state.sources[0].id);
  const selectedRun = storageRead('run');
  if (S.state.runs.some(run => run.id === selectedRun)) await openRun(selectedRun);
  if (['sources', 'selections', 'results', 'handover'].includes(rememberedTab)) switchTab(rememberedTab);
  const exported = storageRead('export'); if (exported?.sha256) $('project-downloads').replaceChildren(fileLink(exported, `Download ${exported.name}`));
  S.pending = storageRead('pending'); if (S.pending) await recoverPending();
  } finally { S.loading = false; syncActions(); }
}

initialize().then(() => notice('')).catch(error => {
  if (error.status === 401) notice('Enter this workspace’s browser session key to open its retained project.');
  else notice(error.message, true);
  syncActions();
});
