// MIT. Same-origin operator; all rows and writes come from the original workspace.
const $ = selector => document.querySelector(selector);
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined)
    node.textContent = text; if (cls)
    node.className = cls; return node; };
let state, selectedRecipe = null, selectedRun = null, selectedSource = null, sourceOffset = 0, resultOffset = 0, tab = 'inputs';
let refreshing = false, detailEpoch = 0, sourceEpoch = 0;
const date = value => value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not started';
const number = value => Number(value).toLocaleString('en-US');
function message(text, error = false) { $('#message').textContent = text; $('#message').hidden = !text; $('#message').dataset.error = String(error); }
async function api(path, body) { const options = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Preparation-Request': '1' }, body: JSON.stringify(body) }; const response = await fetch(path, options); const result = await response.json(); if (!response.ok)
    throw Error(result.error || `Request failed (${response.status})`); return result; }
function guarded(fn) { return async (event) => { try {
    await fn(event);
}
catch (error) {
    message(error.message, true);
} }; }
function button(text, fn, cls) { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', guarded(fn)); return b; }
function empty(target, text) { target.append(el('p', text, 'empty')); }
function showTab(id) { tab = id; for (const section of document.querySelectorAll('.tab'))
    section.hidden = section.id !== id; for (const b of document.querySelectorAll('nav button')) {
    if (b.dataset.tab === id)
        b.setAttribute('aria-current', 'page');
    else
        b.removeAttribute('aria-current');
} message(''); }
for (const b of document.querySelectorAll('nav button'))
    b.addEventListener('click', () => showTab(b.dataset.tab));
function download(url) { const a = el('a'); a.href = url; a.download = ''; document.body.append(a); a.click(); a.remove(); }
function latestRecipes() { const map = new Map; for (const r of state.recipes)
    map.set(r.id, r); return [...map.values()]; }
function refreshBindings(bindings = {}) { const target = $('#bindings'); target.replaceChildren(); const byAlias = new Map; for (const source of state.sources) {
    if (!byAlias.has(source.alias))
        byAlias.set(source.alias, []);
    byAlias.get(source.alias).push(source);
} for (const [alias, sources] of byAlias) {
    const row = el('div', undefined, 'binding');
    const check = el('input');
    check.type = 'checkbox';
    check.dataset.alias = alias;
    check.checked = Object.hasOwn(bindings, alias);
    check.id = `check-${alias}`;
    const box = el('div');
    const label = el('label', alias);
    label.htmlFor = check.id;
    const select = el('select');
    select.dataset.alias = alias;
    select.setAttribute('aria-label', alias + ' source edition');
    for (const source of sources.toReversed()) {
        const option = el('option', `${source.label} · ${number(source.rows)} rows · ${date(source.createdAt)}`);
        option.value = source.id;
        select.append(option);
    }
    if (bindings[alias])
        select.value = bindings[alias];
    box.append(label, select, el('small', sources.at(-1).columns.join(' · ')));
    row.append(check, box);
    target.append(row);
} if (!byAlias.size)
    empty(target, 'Import a source file before saving a recipe.'); }
function loadRecipe(recipe) { selectedRecipe = recipe; $('#recipe-heading').textContent = recipe ? `${recipe.label} · edition ${recipe.revision}` : 'New recipe'; $('#recipe-label').value = recipe?.label || ''; $('#recipe-sql').value = recipe?.sql || ''; $('#recipe-parameters').value = JSON.stringify(recipe?.parameters || {}, null, 2); $('#recipe-note').value = recipe?.note || ''; $('#run-recipe').disabled = !recipe; refreshBindings(recipe?.bindings || {}); }
function render() {
    $('#workspace-label').textContent = state.label;
    $('#input-count').textContent = state.sources.length;
    $('#recipe-count').textContent = latestRecipes().length;
    $('#result-count').textContent = state.runs.filter(r => r.status === 'COMPLETE').length;
    const sources = $('#source-list');
    sources.replaceChildren();
    for (const source of state.sources.toReversed()) {
        const card = el('article', undefined, 'record');
        card.append(el('h4', source.label), el('p', `${source.alias} · ${source.format.toUpperCase()} · ${number(source.rows)} rows · ${source.columns.length} columns`), el('p', date(source.createdAt)), button('Inspect source', async () => { selectedSource = source.id; sourceOffset = 0; await sourcePreview(); }));
        sources.append(card);
    }
    if (!state.sources.length)
        empty(sources, 'No source editions yet. Import a CSV or JSON Lines file to begin.');
    const recipes = $('#recipe-list');
    recipes.replaceChildren();
    for (const recipe of latestRecipes().toReversed()) {
        const card = el('article', undefined, 'record');
        card.append(el('h4', recipe.label), el('p', `Edition ${recipe.revision} · ${Object.keys(recipe.bindings).length} selected sources`), button('Open recipe', () => loadRecipe(recipe)));
        const editions = state.recipes.filter(r => r.id === recipe.id);
        if (editions.length > 1) {
            const select = el('select');
            select.setAttribute('aria-label', recipe.label + ' saved editions');
            for (const edition of editions.toReversed()) {
                const opt = el('option', `Edition ${edition.revision} · ${date(edition.createdAt)}`);
                opt.value = edition.revision;
                select.append(opt);
            }
            select.addEventListener('change', () => loadRecipe(editions.find(r => r.revision === Number(select.value))));
            card.append(select);
        }
        recipes.append(card);
    }
    if (!latestRecipes().length)
        empty(recipes, 'No saved recipes yet.');
    const runs = $('#run-list');
    runs.replaceChildren();
    for (const run of state.runs.toReversed()) {
        const card = el('article', undefined, 'record'), body = el('div'), actions = el('div', undefined, 'actions');
        body.append(el('h4', run.label), el('span', run.status, 'tag'), el('p', `${number(run.rows)} rows · recipe edition ${run.recipe.revision} · ${date(run.createdAt)}`));
        if (run.message)
            body.append(el('p', run.message));
        if (run.status === 'COMPLETE')
            actions.append(button('Open result', async () => { selectedRun = run.id; resultOffset = 0; await resultDetail(); }));
        else if (run.status === 'RUNNING')
            actions.append(button('Cancel run', async () => { await api('/api/cancel', { run_id: run.id }); message('Cancellation requested.'); }));
        else if (run.status === 'QUEUED')
            actions.append(button('Start queued run', async () => { await api('/api/start', { run_id: run.id }); await refresh(); }));
        else
            actions.append(button('Rerun exact edition', async () => { await api('/api/rerun', { run_id: run.id }); await refresh(); }));
        card.append(body, actions);
        runs.append(card);
    }
    if (!state.runs.length)
        empty(runs, 'Run a saved recipe to create a result edition.');
    const select = $('#merchant-run'), previous = select.value;
    select.replaceChildren();
    for (const run of state.runs.filter(r => r.status === 'COMPLETE').toReversed()) {
        const option = el('option', `${run.label} · ${number(run.rows)} rows · ${date(run.finishedAt)}`);
        option.value = run.id;
        select.append(option);
    }
    if ([...select.options].some(o => o.value === previous))
        select.value = previous;
    $('#export-merchant').disabled = !select.options.length;
}
async function refresh() { if (refreshing)
    return; refreshing = true; try {
    state = await api('/api/state');
    render();
}
finally {
    refreshing = false;
} }
function table(page) { const container = el('div', undefined, 'table-scroll'), table = el('table'), head = el('thead'), hr = el('tr'), body = el('tbody'); for (const c of page.columns)
    hr.append(el('th', c)); head.append(hr); for (const row of page.rows) {
    const tr = el('tr');
    for (const value of row) {
        const cell = el('td', value === null ? 'No value' : value === '' ? 'Empty text' : String(value), value === null || value === '' ? 'empty-cell' : undefined);
        tr.append(cell);
    }
    body.append(tr);
} table.append(head, body); container.append(table); return container; }
function pager(page, fn) { const node = el('div', undefined, 'pager'); node.append(el('span', page.total ? `${number(page.offset + 1)}–${number(page.offset + page.rows.length)} of ${number(page.total)} rows` : '0 rows')); const controls = el('div', undefined, 'actions'); const previous = button('Previous', () => fn(Math.max(0, page.offset - 100))), next = button('Next', () => fn(page.nextOffset)); previous.disabled = page.offset === 0; next.disabled = page.nextOffset === null; controls.append(previous, next); node.append(controls); return node; }
async function sourcePreview() { const epoch = ++sourceEpoch, id = selectedSource, page = await api(`/api/source?id=${encodeURIComponent(id)}&offset=${sourceOffset}`); if (epoch !== sourceEpoch)
    return; const source = state.sources.find(s => s.id === id); const panel = $('#source-preview'); panel.replaceChildren(el('h3', source.label), el('p', `Retained ${source.format.toUpperCase()} edition · ${number(source.bytes)} bytes`, 'hint'), table(page), pager(page, async (offset) => { sourceOffset = offset; await sourcePreview(); })); panel.hidden = false; }
async function resultDetail() {
    const epoch = ++detailEpoch, id = selectedRun;
    const page = await api(`/api/result?id=${encodeURIComponent(id)}&offset=${resultOffset}`);
    if (epoch !== detailEpoch)
        return;
    const run = state.runs.find(r => r.id === id), review = state.reviews.find(r => r.id === id);
    const detail = $('#result-detail');
    detail.replaceChildren();
    detail.hidden = false;
    const panel = el('article', undefined, 'panel');
    panel.append(el('h3', run.label));
    const metrics = el('div', undefined, 'metrics');
    for (const [value, label] of [[number(run.rows), 'Complete rows'], [run.columns.length, 'Columns'], [run.recipe.revision, 'Recipe edition']]) {
        const metric = el('div');
        metric.append(el('strong', String(value)), el('span', label));
        metrics.append(metric);
    }
    panel.append(metrics);
    const actions = el('div', undefined, 'actions');
    for (const [file, label] of [['result.csv', 'Full CSV'], ['result.jsonl', 'Exact JSON Lines'], ['schema.json', 'Column schema']]) {
        const a = el('a', label, 'button-link');
        a.href = `/api/file?id=${id}&file=${file}`;
        a.download = file;
        actions.append(a);
    }
    actions.append(button('Preparation report', async () => download((await api('/api/report', { run_id: id })).url)));
    panel.append(actions, table(page), pager(page, async (offset) => { resultOffset = offset; await resultDetail(); }), el('p', 'JSON Lines preserves null and empty text distinctly. CSV writes both as empty cells; the merchant package supplies explicit null indicators.', 'hint'));
    detail.append(panel);
    const form = el('form', undefined, 'panel');
    form.append(el('h3', 'Review this result edition'));
    const grid = el('div', undefined, 'review-grid');
    for (const [label, field] of [['Reviewer', 'reviewer'], ['Decision', 'decision']]) {
        const box = el('div'), lab = el('label', label);
        lab.htmlFor = 'review-' + field;
        let input;
        if (field === 'decision') {
            input = el('select');
            for (const [v, t] of [['accept', 'Accept for intended use'], ['revise', 'Request revision'], ['withdraw', 'Withdraw from use']]) {
                const opt = el('option', t);
                opt.value = v;
                input.append(opt);
            }
        }
        else {
            input = el('input');
            input.required = true;
            input.maxLength = 128;
        }
        input.id = 'review-' + field;
        box.append(lab, input);
        grid.append(box);
    }
    const lab = el('label', 'Review note');
    lab.htmlFor = 'review-note';
    const note = el('textarea');
    note.id = 'review-note';
    note.rows = 3;
    const submit = el('button', 'Save review', 'primary');
    submit.type = 'submit';
    form.append(grid, lab, note, el('div', undefined, 'actions'));
    form.lastChild.append(submit);
    for (const entry of review?.history || []) {
        const record = el('div', undefined, 'review-entry');
        record.append(el('strong', `${entry.decision[0].toUpperCase() + entry.decision.slice(1)} · ${entry.reviewer}`), el('p', entry.note), el('small', date(entry.createdAt)));
        form.append(record);
    }
    form.addEventListener('submit', guarded(async (event) => { event.preventDefault(); await api('/api/review', { run_id: id, decision: $('#review-decision').value, reviewer: $('#review-reviewer').value, note: $('#review-note').value, expected_revision: review?.revision || 0 }); await refresh(); await resultDetail(); message('Review saved with this result edition.'); }));
    detail.append(form);
}
$('#input-file').addEventListener('change', () => { const file = $('#input-file').files[0]; if (!file)
    return; $('#input-format').value = /\.(jsonl|ndjson)$/i.test(file.name) ? 'jsonl' : 'csv'; if (!$('#input-label').value)
    $('#input-label').value = file.name; });
$('#import-form').addEventListener('submit', guarded(async (event) => { event.preventDefault(); const file = $('#input-file').files[0]; if (!file)
    throw Error('Choose a source file'); const params = new URLSearchParams({ alias: $('#input-alias').value, format: $('#input-format').value, label: $('#input-label').value || file.name, filename: file.name }); if ($('#input-null').value)
    params.set('nullToken', $('#input-null').value); const submit = event.target.querySelector('[type=submit]'); submit.disabled = true; message('Importing the complete source file…'); try {
    const response = await fetch('/api/import?' + params, { method: 'POST', headers: { 'X-Preparation-Request': '1', 'Content-Type': 'application/octet-stream' }, body: file });
    const result = await response.json();
    if (!response.ok)
        throw Error(result.error);
    await refresh();
    refreshBindings(selectedRecipe?.bindings || {});
    message(`Imported ${number(result.rows)} rows from ${result.label}.`);
}
finally {
    submit.disabled = false;
} }));
$('#new-recipe').addEventListener('click', () => loadRecipe(null));
$('#recipe-form').addEventListener('submit', guarded(async (event) => { event.preventDefault(); const bindings = {}; for (const check of document.querySelectorAll('#bindings input:checked'))
    bindings[check.dataset.alias] = $(`#bindings select[data-alias="${check.dataset.alias}"]`).value; const body = { label: $('#recipe-label').value, sql: $('#recipe-sql').value, bindings, parameters: JSON.parse($('#recipe-parameters').value), note: $('#recipe-note').value }; if (selectedRecipe) {
    body.id = selectedRecipe.id;
    body.expected_revision = state.recipes.filter(r => r.id === selectedRecipe.id).at(-1).revision;
    if (selectedRecipe.revision !== body.expected_revision)
        throw Error('Open the latest recipe edition before saving changes; older editions remain available for running.');
} const saved = await api('/api/recipe', body); await refresh(); loadRecipe(saved); message(`Saved recipe edition ${saved.revision}.`); }));
$('#run-recipe').addEventListener('click', guarded(async () => { if (!selectedRecipe)
    return; await api('/api/run', { recipe_id: selectedRecipe.id, revision: selectedRecipe.revision }); await refresh(); showTab('results'); message('The saved recipe is running. Full results will appear when complete.'); }));
$('#recover').addEventListener('click', guarded(async () => { const result = await api('/api/recover', {}); await refresh(); message(result.recovered.length ? `Recovered ${result.recovered.length} interrupted runs. Use Rerun exact edition to continue from their saved inputs.` : 'No interrupted runs required recovery.'); }));
$('#export-workspace').addEventListener('click', guarded(async () => { message('Preparing the complete project archive…'); const result = await api('/api/export', {}); download(result.url); message(`Project archive ready: ${number(result.bytes)} bytes.`); }));
$('#export-merchant').addEventListener('click', guarded(async () => { const result = await api('/api/merchant', { run_id: $('#merchant-run').value }); download(result.url); message(`Complete ${number(result.rows)}-row dataset package ready.`); }));
await refresh();
loadRecipe(null);
// Refresh only while an actual operation is outstanding; this is local UI state,
// not a remote scheduler or an external polling service.
setInterval(() => { if (state?.runs.some(r => r.status === 'RUNNING' || r.status === 'QUEUED'))
    refresh().catch(error => message(error.message, true)); }, 1200);
