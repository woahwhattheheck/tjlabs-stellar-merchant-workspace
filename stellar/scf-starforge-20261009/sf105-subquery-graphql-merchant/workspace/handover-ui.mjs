// MIT. Original project handover and receiving, alongside the same native editor.
export function createHandoverWorkspace(ctx) {
  const $ = id => document.getElementById(id);
  const key = 'sf105-project-handover:' + location.origin;
  let state = { directory: '', inspected: null, preparation: null, pending: null, prepared: null, received: null };
  let history = { items: [], offset: 0, nextOffset: null, snapshotSha256: null };
  try { const old = JSON.parse(localStorage.getItem(key) || 'null'); if (old && typeof old === 'object') state = { ...state, ...old }; } catch {}
  const text = (tag, value, className) => {
    const node = document.createElement(tag); node.textContent = String(value ?? '');
    if (className) node.className = className;
    return node;
  };
  const remember = () => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} };
  const current = () => ctx.current();
  function detail(target, value) {
    target.replaceChildren();
    if (value) target.append(text('pre', JSON.stringify(value, null, 2)));
  }
  function buttons() {
    const selected = current();
    $('prepare-handover').disabled = selected.busy || !selected.saved || selected.dirty;
    $('inspect-handover').disabled = selected.busy || !$('handover-directory').value.trim();
    $('receive-handover').disabled = selected.busy || !state.inspected
      || state.inspected.directory !== $('handover-directory').value.trim();
    $('handover-history-refresh').disabled = selected.busy;
    $('handover-history-next').disabled = selected.busy || history.nextOffset === null;
    for (const button of $('handover-history').querySelectorAll('button')) button.disabled = selected.busy;
  }
  function render() {
    $('handover-directory').value = state.directory;
    detail($('handover-prepared'), state.prepared);
    detail($('handover-inspected'), state.inspected);
    detail($('handover-received'), state.received);
    if (state.pending && !state.received) $('handover-received').append(text('p',
      'Original receiving request retained: ' + state.pending.id + '. Inspect Receiving history or continue this same request.', 'subtle'));
    buttons();
  }
  async function receive(request) {
    state.pending = { ...request }; state.received = null; remember(); render();
    const result = await ctx.api('/api/handover/receive', state.pending);
    state.received = result; remember(); render();
    await ctx.refreshProjects();
    const opened = await ctx.openProject(result.project.id);
    ctx.notice('Received original ' + result.project.id + ' through revision ' + result.receivedRevision
      + '; current local revision ' + result.currentRevision + '.'
      + (opened ? '' : ' Your unsaved editor remains open; save it before opening the received project.'));
    await loadHistory(0);
  }
  async function loadHistory(offset, snapshot) {
    const query = new URLSearchParams({ offset: String(offset), limit: '20',
      ...(snapshot ? { expectedSnapshotSha256: snapshot } : {}) });
    history = await ctx.api('/api/handover/receivings?' + query);
    const target = $('handover-history'); target.replaceChildren();
    if (!history.items.length) target.append(text('p', 'No retained receiving requests on this page.', 'subtle'));
    for (const item of history.items) {
      const card = text('div', '', 'export-card');
      card.append(text('h3', item.project?.title ?? item.project?.id ?? item.id),
        text('p', item.id + ' · ' + item.state, 'code'));
      if (item.error) card.append(text('p', item.error));
      if (item.request) {
        card.append(text('p', 'Source revision ' + item.project.revision + ' · target basis ' + item.request.expectedRevision, 'subtle'));
        const button = text('button', item.state === 'RECEIVED' ? 'Open received project' : 'Continue original receiving');
        button.type = 'button'; button.className = 'secondary';
        button.addEventListener('click', () => ctx.action('Opening the original receiving operation…', async () => {
          if (item.state === 'RECEIVED') {
            if (!await ctx.openProject(item.project.id))
              ctx.notice('Your unsaved editor remains open. Save it before opening the received project.');
            return;
          }
          await receive({ id: item.id, handoverSha256: item.request.handoverSha256,
            expectedRevision: item.request.expectedRevision,
            ...($('handover-directory').value.trim() ? { directory: $('handover-directory').value.trim() } : {}) });
        }));
        card.append(button);
      }
      target.append(card);
    }
    buttons();
  }
  $('handover-directory').addEventListener('input', () => {
    state.directory = $('handover-directory').value;
    state.inspected = null; remember(); detail($('handover-inspected'), null); buttons();
  });
  $('prepare-handover').addEventListener('click', () => ctx.action('Preparing the complete saved project handover…', async () => {
    const selected = current();
    if (!selected.saved || selected.dirty) throw new Error('Save the current editor before selecting a project handover.');
    const input = { project: selected.saved.id, revision: selected.saved.revision };
    if (!state.preparation || state.preparation.project !== input.project || state.preparation.revision !== input.revision)
      state.preparation = { ...input, id: crypto.randomUUID() };
    remember();
    state.prepared = await ctx.api('/api/handover/prepare', state.preparation);
    remember(); render();
    ctx.notice('Complete saved project handover prepared in ' + state.prepared.directory
      + '. The agent file transfer also accepts kind handover for this same project and revision.');
  }));
  $('inspect-handover').addEventListener('click', () => ctx.action('Inspecting the original handover and target history…', async () => {
    const directory = $('handover-directory').value.trim();
    const result = await ctx.api('/api/handover/inspect', { directory });
    state.directory = result.directory; state.inspected = result; state.received = null; remember(); render();
    ctx.notice('Original project ' + result.project.id + ' inspected. '
      + result.counts.revisions + ' source revisions; target currently at ' + result.expectedRevision + '.');
  }));
  $('receive-handover').addEventListener('click', () => ctx.action('Reopening the original selected project…', async () => {
    const selected = state.inspected;
    if (!selected || selected.directory !== $('handover-directory').value.trim()) throw new Error('Inspect this exact directory first.');
    if (!state.pending || state.pending.handoverSha256 !== selected.handoverSha256
        || state.pending.expectedRevision !== selected.expectedRevision)
      state.pending = { id: crypto.randomUUID(), directory: selected.directory,
        handoverSha256: selected.handoverSha256, expectedRevision: selected.expectedRevision };
    await receive(state.pending);
  }));
  $('handover-history-refresh').addEventListener('click', () => ctx.action('Reading original receiving history…', () => loadHistory(0)));
  $('handover-history-next').addEventListener('click', () => ctx.action('Reading the next original receiving page…',
    () => loadHistory(history.nextOffset, history.snapshotSha256)));
  render();
  return { buttons, refresh: () => loadHistory(0) };
}
