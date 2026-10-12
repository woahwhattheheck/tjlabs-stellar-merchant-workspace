// MIT. Original merchant preparation, retained requests and native recovery.
export function createPreparationWorkspace(ctx) {
  const $ = id => document.getElementById(id), clone = value => structuredClone(value);
  const json = value => JSON.stringify(value, null, 2), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  const S = { project: null, epoch: 0, sequence: 0, page: null, opened: null, packet: null, pending: null, db: null };
  const fail = message => { throw new Error(message); };
  const check = (condition, message) => { if (!condition) fail(message); };
  function node(tag, text, className) {
    const value = document.createElement(tag);
    if (text !== undefined) value.textContent = String(text);
    if (className) value.className = className;
    return value;
  }
  function detail(title, value) {
    const box = node('details'); box.append(node('summary', title), node('pre', typeof value === 'string' ? value : json(value), 'code'));
    return box;
  }
  function button(label, operation, disabled = false) {
    const value = node('button', label, 'secondary'); value.type = 'button'; value.dataset.preparationDisabled = String(disabled);
    value.disabled = ctx.current().busy || disabled;
    value.onclick = () => ctx.action(label + '…', operation); return value;
  }
  function query(path, value) {
    const selected = new URLSearchParams();
    for (const [key, entry] of Object.entries(value)) if (entry !== undefined) selected.set(key, String(entry));
    return path + '?' + selected;
  }
  function workspace() {
    const directory = ctx.directory();
    check(typeof directory === 'string' && directory.length > 0, 'Open the original private workspace first.');
    return directory;
  }
  async function database() {
    if (!S.db) S.db = new Promise((resolve, reject) => {
      const request = indexedDB.open('sf105-merchant-preparation-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('requests', { keyPath: 'key' });
      request.onblocked = () => reject(new Error('Close an older preparation tab before opening its original browser requests.'));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    });
    return S.db;
  }
  async function changePending(change, directory = workspace()) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('requests', change ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('requests'), request = store.get(directory);
      let value, error;
      request.onsuccess = () => {
        try {
          const previous = request.result?.value ?? null;
          if (previous && (previous.schema !== 'stellar-forge.graphql-preparation-browser-request.v1' ||
              previous.workspace !== directory || !UUID.test(previous.localId) || !previous.body ||
              !['prepare', 'recover', 'continue'].includes(previous.action)))
            fail('Keep the original browser request; its saved identity is unreadable.');
          value = change ? change(previous) : previous;
          if (change) { if (value === null) store.delete(directory); else store.put({ key: directory, value: clone(value) }); }
        } catch (cause) { error = cause; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(error ?? transaction.error);
      transaction.onabort = () => reject(error ?? transaction.error);
    });
  }
  async function hydrate() { S.pending = await changePending(); renderPending(); }
  const preparationId = pending => pending.action === 'prepare' ? pending.body.id : pending.body.preparationId;
  async function retain(action, body) {
    const directory = workspace();
    const value = { schema: 'stellar-forge.graphql-preparation-browser-request.v1', workspace: directory,
      localId: crypto.randomUUID(), action, body: clone(body), phase: 'prepared', createdAt: new Date().toISOString(), error: null };
    S.pending = await changePending(previous => {
      check(!previous, 'Recover the original retained preparation request before preparing another action.');
      return value;
    }, directory);
    renderPending(); return S.pending;
  }
  async function update(pending, changes) {
    S.pending = await changePending(previous => {
      check(previous?.localId === pending.localId && same(previous.body, pending.body) && previous.action === pending.action,
        'The browser now retains another original request. Its input was kept.');
      return { ...previous, ...changes };
    }, pending.workspace);
    renderPending(); return S.pending;
  }
  async function clear(pending) {
    await changePending(previous => {
      check(previous?.localId === pending.localId && same(previous.body, pending.body), 'Keep the newer original browser request.');
      return null;
    }, pending.workspace);
    S.pending = null; renderPending();
  }
  async function adopt(value) {
    const current = ctx.current();
    if (value.project?.id === current.saved?.id && !current.dirty) await ctx.acceptProject(value.project);
    else if (value.project?.id === current.saved?.id)
      ctx.notice('The native result is retained. Your unfinished editor text remains open; reopen the saved project when ready.');
    if (ctx.current().saved?.id === value.record.project) {
      await open(value.record.id);
      await refresh();
    }
  }
  async function dispatch(pending) {
    check(pending.workspace === workspace(), 'Open this request in its original private workspace.');
    await update(pending, { phase: 'awaiting', error: null });
    try {
      const value = await ctx.api('/api/preparation/' + pending.action, clone(pending.body));
      check(value.record?.id === preparationId(pending) && value.record.project === pending.body.project,
        'The original preparation returned another identity. Inspect the retained request.');
      await update(pending, { phase: 'accepted', accepted: { preparationId: value.record.id,
        generation: value.record.generation, recordSha256: value.recordSha256 }, error: null });
      await adopt(value);
      await clear(pending);
      ctx.notice(value.record.state === 'COMPLETED'
        ? 'The original merchant package and preparation history are retained.'
        : 'The preparation is retained as ' + value.record.state + '. Read its original attempt before continuing.');
      return value;
    } catch (error) {
      S.pending = await changePending(previous => {
        check(previous?.localId === pending.localId && same(previous.body, pending.body), 'Keep the newer original browser request.');
        return { ...previous, phase: previous.phase === 'accepted' ? 'accepted' : 'uncertain',
          error: { message: error.message, status: error.status ?? null } };
      }, pending.workspace);
      renderPending(); throw error;
    }
  }
  async function retryPending() {
    await hydrate(); const pending = S.pending;
    check(pending, 'No original browser request needs recovery.');
    if (pending.phase === 'accepted') {
      const value = await ctx.api(query('/api/preparation', { project: pending.body.project,
        preparationId: preparationId(pending) }));
      await adopt(value); await clear(pending); return;
    }
    return dispatch(pending);
  }
  async function releaseRefused() {
    await hydrate(); const pending = S.pending;
    check(pending && pending.phase !== 'accepted' && pending.error?.status >= 400 && pending.error.status < 500,
      'Keep an uncertain or accepted action and recover its original request.');
    try {
      await ctx.api(query('/api/preparation', { project: pending.body.project, preparationId: preparationId(pending) }));
      fail('The native preparation is retained. Recover it with its original UUID.');
    } catch (error) { if (error.status !== 404) throw error; }
    check(confirm('The host has no preparation under this refused UUID. Clear this browser request while keeping every project draft?'),
      'The refused request remains retained.');
    await clear(pending); ctx.notice('Cleared the refused browser request. All saved and unfinished project fields remain.');
  }
  async function prepare(kind, compared = null) {
    const current = ctx.current(), saved = current.saved;
    check(saved && !current.dirty && saved.revision === saved.currentRevision,
      'Save and review the current original project before preparation.');
    const body = { id: crypto.randomUUID(), project: saved.id, expectedRevision: saved.currentRevision,
      inputDigest: saved.inputDigest, kind };
    if (kind === 'revision') {
      check(compared?.inputDigest === saved.inputDigest && compared.review?.ready,
        'Compare this exact saved draft with its original baseline first.');
      body.baselineExportId = compared.baseline.id; body.comparisonDigest = compared.comparisonDigest;
    }
    return dispatch(await retain('prepare', body));
  }
  async function recoverCurrent(project, id) {
    return dispatch(await retain('recover', { project, preparationId: id }));
  }
  async function continueCurrent(selected) {
    check(!selected.active && selected.record.state === 'PARTIAL' &&
      selected.latestGeneration === selected.record.generation, 'Read the current unfinished preparation before a new attempt.');
    return dispatch(await retain('continue', { id: crypto.randomUUID(), project: selected.record.project,
      preparationId: selected.record.id, expectedGeneration: selected.record.generation,
      expectedRecordSha256: selected.recordSha256 }));
  }
  function buttons() {
    for (const element of $('preparations-panel').querySelectorAll('button'))
      element.disabled = ctx.current().busy || element.dataset.preparationDisabled === 'true';
    $('preparation-inspect').disabled = ctx.current().busy || !ctx.current().saved;
    $('preparation-refresh').disabled = ctx.current().busy || !ctx.current().saved;
    $('preparation-original-id').disabled = ctx.current().busy;
  }
  function renderPending() {
    const root = $('preparation-pending'); root.replaceChildren();
    if (!S.pending) { root.append(node('p', 'No unfinished preparation request is retained in this browser.', 'subtle')); return; }
    const pending = S.pending, bar = node('div', undefined, 'toolbar');
    root.append(node('p', pending.action + ' · ' + pending.body.project + ' · ' + preparationId(pending) + ' · ' + pending.phase, 'code'),
      detail('Exact original request', { path: '/api/preparation/' + pending.action, body: pending.body }));
    if (pending.error) root.append(node('p', pending.error.message, 'error'));
    bar.append(button(pending.phase === 'accepted' ? 'Reopen accepted result' : 'Retry exact original request', retryPending),
      button('Inspect saved native operation', async () => {
        const value = await ctx.api(query('/api/preparation', { project: pending.body.project, preparationId: preparationId(pending) }));
        if (ctx.current().saved?.id !== pending.body.project) {
          root.append(detail('Original operation in ' + pending.body.project, value));
          ctx.notice('Open the named project to continue its retained preparation. Current editor fields remain.');
        } else await open(value.record.id);
      }));
    if (pending.phase !== 'accepted' && pending.error?.status >= 400 && pending.error.status < 500)
      bar.append(button('Clear refused unaccepted request', releaseRefused));
    root.append(bar); buttons();
  }
  function renderList() {
    const root = $('preparation-list'); root.replaceChildren();
    if (!S.project) { root.append(node('p', 'Open a saved project to read native preparation history.', 'subtle')); return; }
    if (!S.page) { root.append(node('p', 'Read the original saved preparation catalog.', 'subtle')); return; }
    for (const item of S.page.items) {
      const line = node('div', undefined, 'toolbar');
      const label = item.state === 'UNAVAILABLE' ? 'Unavailable preparation' :
        (item.kind === 'revision' ? 'Revision' : 'Merchant') + ' · draft ' + item.draftRevision +
        ' · ' + new Date(item.updatedAt).toLocaleString();
      line.append(button(label, () => open(item.id), item.state === 'UNAVAILABLE'),
        node('span', item.state + (item.generation ? ' · generation ' + item.generation : '') +
          (item.attempts !== undefined ? ' · ' + item.attempts + ' attempt(s)' : '') + (item.active ? ' · native writer active' : ''), 'subtle'));
      root.append(line, detail('Preparation identity', item.id));
      if (item.error) root.append(node('p', item.error, 'error'));
    }
    if (!S.page.items.length) root.append(node('p', 'No native preparations are retained for this project yet.', 'subtle'));
    const page = S.page, bar = node('div', undefined, 'toolbar');
    if (page.offset > 0) bar.append(button('Previous preparations', () => refresh(Math.max(0, page.offset - page.limit), page.snapshotSha256)));
    if (page.nextOffset !== null) bar.append(button('Next preparations', () => refresh(page.nextOffset, page.snapshotSha256)));
    bar.append(node('span', page.total + ' retained preparation(s)', 'subtle')); root.append(bar);
  }
  async function refresh(offset = 0, expectedSnapshotSha256) {
    await hydrate();
    const project = ctx.current().saved?.id, epoch = S.epoch, sequence = ++S.sequence;
    if (!project) { S.project = null; S.page = null; renderList(); return; }
    const page = await ctx.api(query('/api/preparations', { project, offset, limit: 10, expectedSnapshotSha256 }));
    if (epoch !== S.epoch || sequence !== S.sequence || ctx.current().saved?.id !== project) return;
    S.project = project; S.page = page; renderList(); buttons();
  }
  async function open(id, generation, recordSha256) {
    check(UUID.test(id), 'Use the original native preparation UUID.');
    const project = ctx.current().saved?.id, epoch = S.epoch, sequence = ++S.sequence;
    check(project, 'Open this preparation’s original project first.');
    const value = await ctx.api(query('/api/preparation', { project, preparationId: id, generation, recordSha256 }));
    if (epoch !== S.epoch || sequence !== S.sequence || ctx.current().saved?.id !== project) return;
    check(value.record?.project === project && value.record.id === id, 'The saved native preparation identity changed.');
    S.opened = value; S.packet = null; renderOpen(); $('preparation-packet').replaceChildren(); buttons();
  }
  async function frozenSource(selected) {
    const value = await ctx.api(query('/api/project', { id: selected.record.project, revision: selected.record.draftRevision }));
    check(value.inputDigest === selected.record.inputDigest, 'The retained native source differs from the original draft.');
    if (S.opened !== selected) return;
    const root = $('preparation-source'); root.replaceChildren();
    root.append(node('h4', 'Original saved draft ' + value.revision),
      detail('Exact schema source', value.input.schemaText), detail('Exact approved queries', value.input.queriesText),
      detail('Exact merchant plan', value.input.planText));
  }
  function renderOpen() {
    const root = $('preparation-opened'); root.replaceChildren();
    const selected = S.opened; if (!selected) return;
    const record = selected.record, bar = node('div', undefined, 'toolbar');
    root.append(node('h3', record.kind + ' preparation · ' + record.state),
      node('p', record.id + ' · generation ' + record.generation + ' · original draft ' + record.draftRevision, 'code'),
      node('p', 'Retained project attachment: generation ' + selected.attachedGeneration +
        '. Latest native generation: ' + selected.latestGeneration + '.', 'subtle'),
      detail('Original request and source identities', { request: record.request, draftSha256: record.draftSha256,
        inputDigest: record.inputDigest, definitionSha256: record.definitionSha256, recordSha256: selected.recordSha256,
        baseline: record.baseline }));
    bar.append(button('Read frozen source', () => frozenSource(selected)),
      button('Read current preparation', () => open(record.id)),
      button('Recover current original result', () => recoverCurrent(record.project, record.id), selected.active),
      button('Continue in a new attempt', () => continueCurrent(selected),
        selected.active || record.state !== 'PARTIAL' || record.generation !== selected.latestGeneration),
      button('Prepare complete current packet', () => packet(selected), selected.active));
    root.append(bar);
    const source = node('div'); source.id = 'preparation-source'; root.append(source);
    for (const attempt of record.attempts) {
      const box = node('article', undefined, 'panel');
      box.append(node('h4', 'Attempt ' + attempt.ordinal + ' · ' + attempt.state),
        node('p', attempt.id, 'code'), node('p', 'Started ' + attempt.startedAt +
          (attempt.finishedAt ? ' · retained outcome ' + attempt.finishedAt : '') + ' · ' + attempt.files.length + ' retained file identities', 'subtle'));
      if (attempt.error) box.append(detail('Original native outcome', attempt.error));
      if (attempt.output) box.append(detail('Complete original merchant export', attempt.output));
      box.append(detail('Exact attempt request', attempt.request), detail('Retained native file identities', attempt.files));
      root.append(box);
    }
    const history = node('details'), historyBar = node('div', undefined, 'toolbar');
    history.append(node('summary', 'Original preparation generations'));
    for (const reference of selected.history ?? []) historyBar.append(button('Generation ' + reference.generation + ' · ' + reference.state,
      () => open(record.id, reference.generation, reference.recordSha256)));
    history.append(historyBar); root.append(history);
  }
  async function packet(selected) {
    const project = selected.record.project, id = selected.record.id, epoch = S.epoch;
    const value = await ctx.api('/api/preparation/packet', { project, revision: selected.project.currentRevision, preparationId: id });
    if (epoch !== S.epoch || ctx.current().saved?.id !== project || S.opened !== selected) return;
    S.packet = value; const root = $('preparation-packet'); root.replaceChildren();
    root.append(node('h3', 'Complete preparation packet'), node('p', value.directory, 'code'),
      node('p', value.manifest.files.length + ' original files · manifest SHA-256 ' + value.manifestSha256, 'code'),
      node('p', 'For continued editing, use Project handover below. It includes this preparation history and every original project revision through your selected revision.', 'subtle'));
    const list = node('div');
    for (const file of value.manifest.files) list.append(button(file.name + ' · ' + file.bytes + ' bytes', () =>
      ctx.download(query('/api/preparation/file', { project: value.manifest.selection.project,
        revision: value.manifest.selection.revision, preparationId: id,
        expectedManifestSha256: value.manifestSha256, file: file.name }), file.name.split('/').at(-1))));
    root.append(list); buttons();
  }
  function reset() {
    S.epoch++; S.sequence++; S.project = ctx.current().saved?.id ?? null;
    S.page = null; S.opened = null; S.packet = null;
    renderList(); renderOpen(); $('preparation-packet').replaceChildren();
    const epoch = S.epoch;
    if (S.project) queueMicrotask(() => {
      if (epoch === S.epoch) refresh().catch(error => { if (epoch === S.epoch) ctx.notice(error.message, true); });
    });
    buttons();
  }
  $('preparation-refresh').onclick = () => ctx.action('Reading saved native preparations…', () => refresh());
  $('preparation-inspect').onclick = () => ctx.action('Reading the original preparation…',
    () => open($('preparation-original-id').value.trim()));
  return { buttons, reset, refresh, open, prepare };
}
