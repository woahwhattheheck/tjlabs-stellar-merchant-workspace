// MIT. Publisher controls over the original Socrata operator dispatcher.
const $ = id => document.getElementById(id);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const json = value => JSON.stringify(value, null, 2);
const text = value => value === null || value === undefined ? '—' : typeof value === 'object' ? json(value) : String(value);
const count = value => Number.isFinite(Number(value)) && value !== null && value !== undefined ? Number(value).toLocaleString('en-US') : '—';
const short = value => value ? String(value).slice(0, 16) : '—';
const node = (tag, content, className) => {
  const element = document.createElement(tag);
  if (content !== undefined) element.textContent = text(content);
  if (className) element.className = className;
  return element;
};
function facts(entries) {
  const list = node('dl');
  for (const [label, value] of entries) list.append(node('dt', label), node('dd', value));
  return list;
}
function options(id, items, preferred = '') {
  const control = $(id), previous = control.value;
  control.replaceChildren();
  for (const [value, label] of items) { const choice = node('option', label); choice.value = value; control.append(choice); }
  if (!items.length) { const empty = node('option', 'No retained selection'); empty.value = ''; control.append(empty); }
  control.value = items.some(([value]) => value === previous) ? previous :
    items.some(([value]) => value === preferred) ? preferred : items[0]?.[0] || '';
}
function button(label, field, value, {write = true} = {}) {
  const element = node('button', label); element.type = 'button';
  element.dataset[field] = value;
  if (write) element.dataset.write = '';
  return element;
}
function detail(label, value) {
  const element = node('details'); element.append(node('summary', label), node('pre', json(value))); return element;
}
function nativeTable(area, result) {
  area.replaceChildren();
  if (!result) return;
  if (Number(result.status) >= 400) { area.append(node('p', text(result.body?.message || result.body?.error || result.body), 'error-detail')); return; }
  const body = result.body ?? result, rows = Array.isArray(body.rows) ? body.rows : [];
  const fields = Array.isArray(body.fields) ? body.fields :
    rows.length && object(rows[0]) ? Object.keys(rows[0]) : [];
  if (!fields.length) { area.append(node('p', 'No rows returned.', 'empty')); return; }
  const table = node('table'), head = node('thead'), header = node('tr'), values = node('tbody');
  for (const field of fields) header.append(node('th', field)); head.append(header);
  for (const row of rows) {
    const record = node('tr');
    for (const [index, field] of fields.entries()) {
      const value = Array.isArray(row) ? row[index] : row[field];
      record.append(node('td', value === null ? 'null' : value));
    }
    values.append(record);
  }
  table.append(head, values); area.append(table);
}
function queryString(value) {
  const params = new URLSearchParams(value || '');
  const seen = new Set();
  for (const [key] of params) {
    if (seen.has(key)) throw new Error('Query parameter repeated: ' + key);
    seen.add(key);
  }
  return params.toString();
}

/** Renders retained state and submits original actions. It owns no dataset engine. */
export function createPublisherPanel({getState, perform, download, handle, notice, selectSection}) {
  let current = null, locked = true, reviewedDraft = null, buyerReview = null;
  let preview = null, previewSelection = null, buyerFormDirty = false, sessionSelection = '';
  const pub = () => current?.publisher;
  const drafts = () => pub()?.drafts?.candidates || [];
  const versions = () => pub()?.target?.versions?.versions || [];
  const selectedDraft = () => drafts().find(item => item.id === $('pub-review-draft').value);
  const activeReleaseId = () => {
    const active = pub()?.releases?.state?.active;
    return typeof active === 'string' ? active : active?.id;
  };
  const generation = () => pub()?.releases?.state?.generation;
  const pins = () => {
    const value = pub()?.target?.versions;
    if (!/^[a-f0-9]{64}$/.test(value?.current || '') || !Number.isSafeInteger(value?.revision) || value.revision < 1)
      throw new Error('Open and prepare the original publisher before reviewing a version.');
    return {expectedSnapshot: value.current, expectedRevision: value.revision};
  };
  const reviewKey = () => {
    const draft = selectedDraft(), target = pub()?.target?.versions;
    return draft && target ? json({id: draft.id, revision: draft.revision,
      expectedSnapshot: target.current, expectedRevision: target.revision}) : '';
  };
  const buyerQuery = () => queryString($('pub-buyer-query').value);
  function sameBuyerReview() {
    if (!buyerReview || buyerReview.snapshot !== $('pub-buyer-snapshot').value) return false;
    try {
      const reviewed = new URLSearchParams(buyerReview.query);
      reviewed.delete('snapshot'); reviewed.delete('cursor');
      return reviewed.toString() === buyerQuery();
    } catch { return false; }
  }
  async function call(action, payload = {}) {
    const result = await perform(action, payload);
    render(getState());
    return result;
  }
  const facilitatorPanel = createPublisherFacilitatorPanel({call, download, handle, notice, getPublisher:pub});
  function showView(name) {
    document.querySelectorAll('[data-publisher-panel]').forEach(panel => { panel.hidden = panel.dataset.publisherPanel !== name; });
    document.querySelectorAll('[data-publisher-view]').forEach(control => {
      if (control.dataset.publisherView === name) control.setAttribute('aria-current', 'page');
      else control.removeAttribute('aria-current');
    });
  }
  function bindForm(id, action) {
    $(id).addEventListener('submit', event => { event.preventDefault(); handle(action); });
  }
  function loadQuery(id) {
    const saved = current?.lastQuery?.initialQuery;
    if (!saved) throw new Error('Run or restore an operator query first.');
    const query = new URLSearchParams(typeof saved === 'string' ? saved : Object.entries(saved));
    query.delete('cursor'); query.delete('snapshot');
    $(id).value = query.toString();
    if (id === 'pub-buyer-query') { buyerReview = null; renderBuyerReview(); }
    else { preview = null; previewSelection = null; renderPreview(); }
    controls(locked);
    notice('The retained operator query is loaded for review.');
  }
  function renderExport() {
    const entries = (current?.exports || []).filter(entry => entry.files?.some(file => file.name === 'seller.json'));
    options('pub-export', [...entries].reverse().map(entry => [entry.directory, entry.createdAt + ' · ' + entry.id]), entries.at(-1)?.directory);
    const selected = entries.find(entry => entry.directory === $('pub-export').value);
    $('pub-export-summary').textContent = selected ?
      selected.directory + ' · ' + selected.files.length + ' retained files' :
      'Prepare merchant terms and export the active edition before creating a publisher draft.';
  }
  function renderDrafts() {
    const entries = drafts(), area = $('pub-drafts'); area.replaceChildren();
    $('pub-draft-count').textContent = entries.length + ' drafts';
    for (const draft of [...entries].reverse()) {
      const card = node('article', undefined, 'publisher-card'), heading = node('div', undefined, 'panel-heading');
      heading.append(node('strong', draft.name || draft.id), node('span', count(draft.dataset?.rowCount) + ' rows', 'badge'));
      const tools = node('div', undefined, 'actions');
      tools.append(button('Use this draft', 'pubSelectDraft', draft.id, {write:false}),
        button('Download CSV', 'pubDownloadDraftCsv', draft.id, {write:false}),
        button('Download review', 'pubDownloadDraftReview', draft.id, {write:false}));
      card.append(heading, facts([['Draft', draft.id], ['Dataset snapshot', draft.dataset?.snapshot],
        ['Source SHA-256', draft.socrata?.sourceSha256],
        ['Latest publication', draft.publications?.at(-1)?.state || 'Prepared']]), tools);
      area.append(card);
    }
    if (!entries.length) area.append(node('p', 'Prepare an exported edition to retain its original publisher draft.', 'empty'));
    const draftOptions = entries.map(item => [item.id, (item.name || item.id) + ' · ' + short(item.dataset?.snapshot)]);
    for (const id of ['pub-review-draft','pub-release-draft']) options(id, draftOptions, pub()?.drafts?.selectedDraftId);
    options('pub-preview-target', [
      ...entries.map(item => ['draft:' + item.id, 'Draft · ' + (item.name || item.id) + ' · ' + short(item.dataset?.snapshot)]),
      ...versions().map(item => [item.snapshot, 'Published · ' + short(item.snapshot)])
    ], pub()?.drafts?.selection?.target || (pub()?.drafts?.selectedDraftId ? 'draft:' + pub().drafts.selectedDraftId : ''));
    renderDraftReview();
  }
  function renderDraftReview() {
    const draft = selectedDraft(), target = pub()?.target?.versions;
    $('pub-review-summary').textContent = draft ? count(draft.dataset?.rowCount) + ' rows · snapshot ' + draft.dataset?.snapshot :
      'Select the retained draft to review.';
    $('pub-publication-pins').textContent = target ?
      'Current snapshot ' + target.current + ' · revision ' + target.revision : 'The original version store is not initialized.';
    $('pub-review-result').textContent = draft ? json(draft) : 'Select a draft.';
  }
  function renderVersions() {
    const area = $('pub-versions'); area.replaceChildren();
    const target = pub()?.target?.versions;
    for (const version of versions()) {
      const card = node('article', undefined, 'publisher-card'), active = target.current === version.snapshot;
      const heading = node('div', undefined, 'panel-heading');
      heading.append(node('strong', version.snapshot, 'mono'), node('span', active ? 'Current' : 'Retained', 'badge'));
      const choose = button(active ? 'Selected version' : 'Activate this version', 'pubActivateSnapshot', version.snapshot);
      choose.dataset.currentVersion = String(active);
      card.append(heading, facts([['CSV SHA-256', version.csvHash], ['Configuration SHA-256', version.configHash],
        ['Original bytes', count(version.sourceBytes)]]), choose);
      area.append(card);
    }
    if (!versions().length) area.append(node('p', 'Prepare the original dataset to initialize its version store.', 'empty'));
    options('pub-buyer-snapshot', versions().map(item => [item.snapshot, short(item.snapshot) + (item.snapshot === target?.current ? ' · current' : ' · retained')]), target?.current);
  }
  function renderReleases() {
    const model = pub()?.releases, area = $('pub-releases'); area.replaceChildren();
    $('pub-generation').textContent = 'Generation ' + (generation() ?? '—');
    $('pub-runtime-summary').replaceChildren(facts([
      ['Selected release', activeReleaseId()], ['Runtime', model?.runtime?.state],
      ['Observed release', model?.runtime?.observed?.releaseId], ['Listener', model?.runtime?.observed?.listener],
      ['Owned by this publisher', pub()?.ownsRelease ? 'Yes' : 'No']
    ]));
    for (const release of model?.releases || []) {
      const card = node('article', undefined, 'publisher-card'), heading = node('div', undefined, 'panel-heading');
      heading.append(node('strong', release.label || release.id), node('span', release.id, 'mono'));
      const tools = node('div', undefined, 'actions'), activate = button(release.id === activeReleaseId() ? 'Selected release' : 'Activate release', 'pubActivateRelease', release.id);
      activate.dataset.currentRelease = String(release.id === activeReleaseId());
      tools.append(button('Inspect release', 'pubInspectRelease', release.id), activate);
      card.append(heading, facts([['Release digest', release.digest], ['Dataset snapshot', release.dataset?.baselineSnapshot || release.dataset?.snapshot],
        ['Runtime port', release.runtime?.port]]), tools, detail('Retained release manifest', release));
      area.append(card);
    }
    if (!(model?.releases || []).length) area.append(node('p', 'Stage a release from the retained publisher draft.', 'empty'));
    $('pub-release-details').textContent = model ? json(model) : 'Open the publisher.';
  }
  function renderPreview() {
    const body = preview?.body;
    $('pub-preview-summary').textContent = preview ? Number(preview.status) >= 400 ?
      'Native preview returned HTTP ' + preview.status :
      count(body?.page?.returned ?? body?.rows?.length) + ' returned · ' + count(body?.page?.total) + ' matched' :
      'Preview the selected draft or published version.';
    $('pub-preview-result').textContent = preview ? json(preview) : 'No publisher preview yet.';
    nativeTable($('pub-preview-table'), preview);
  }
  function renderBuyerReview() {
    $('pub-buyer-offer').textContent = buyerReview ? json(buyerReview) : 'Read the running seller’s offer.';
    $('pub-buyer-review-summary').textContent = buyerReview ?
      buyerReview.url + '\nOffer SHA-256 ' + buyerReview.offerSha256 :
      'The running seller supplies the actual accepted payment terms and pinned query preview.';
    nativeTable($('pub-buyer-preview'), buyerReview?.preview);
    options('pub-accept', (buyerReview?.accepts || []).map((term,index) => [String(index),
      String(index + 1) + ' · ' + text(term.network) + ' · ' + text(term.amount ?? term.maxAmountRequired) + ' atomic · ' + text(term.asset)]));
    renderAccept();
  }
  function renderAccept() {
    const term = buyerReview?.accepts?.[Number($('pub-accept').value)];
    $('pub-accept-summary').textContent = term ? json(term) : 'Choose an accepted option after reviewing the seller.';
  }
  function renderBuyers() {
    const buyers = pub()?.drafts?.buyers || [];
    options('pub-buyer-id', buyers.map(item => [item.id, item.intentId + ' · ' + short(item.snapshot)]), buyers.at(-1)?.id);
    if ($('pub-buyer-id').value !== sessionSelection) {
      sessionSelection = $('pub-buyer-id').value; buyerFormDirty = false; loadSession();
    }
    const area = $('pub-sessions'); area.replaceChildren();
    for (const session of pub()?.sessions || []) {
      const card = node('article', undefined, 'publisher-card'), heading = node('div', undefined, 'panel-heading');
      const report = session.report || {};
      heading.append(node('strong', session.id, 'mono'), node('span', session.error ? 'Needs attention' : report.status || 'Retained session', 'badge'));
      card.append(heading, facts([['Snapshot', session.binding?.snapshot], ['Buyer workspace', session.binding?.workspaceDirectory],
        ['Completed pages', count(report.completedPages)], ['Acquired rows', count(report.acquiredRows)],
        ['Rows in selection', count(report.totalRows)], ['Maximum pages', session.binding?.maxPages],
        ['Payment limit, atomic units', session.binding?.maxTotalAtomic],
        ['Allocated payment cap, atomic units', report.capAllocatedAtomic]]));
      if (report.next) card.append(node('p', report.next, 'help'));
      if (session.error) card.append(node('p', session.error.message, 'error-detail'));
      const continuation = report.unpaidContinuation;
      const unpaidReady = ['AVAILABLE','PREPARED'].includes(continuation?.status) &&
        /^[a-f0-9]{64}$/.test(continuation?.attemptSha256 || '');
      if (unpaidReady) {
        const review = node('section', undefined, 'publisher-card');
        const remaining = Number.isSafeInteger(report.totalRows) && Number.isSafeInteger(report.acquiredRows) ?
          Math.max(0, report.totalRows - report.acquiredRows) : null;
        review.append(node('h4', 'Unpaid page continuation'), facts([
          ['Page', continuation.index], ['Rows remaining', count(remaining)],
          ['Stopped because', continuation.originalError?.operatorReason || continuation.originalError?.code]
        ]), node('p', 'Continue this same unpaid page through the original approval flow. Earlier completed pages and delivered rows remain in this acquisition.', 'help'),
        detail('Retained attempt and recovery history', {intentId:continuation.intentId,
          attemptSha256:continuation.attemptSha256,status:continuation.status,
          originalError:continuation.originalError,historyDirectory:continuation.historyDirectory}));
        const resume = button('Continue unpaid page', 'pubSessionUnpaid', session.id);
        resume.dataset.expectedAttemptSha256 = continuation.attemptSha256;
        review.append(resume); card.append(review);
      }
      const operations = node('div', undefined, 'actions');
      for (const [action,label] of [['run','Run acquisition'],['recover','Recover same acquisition'],['account','Finalize account records'],['export','Export customer delivery']])
        operations.append(button(label, 'pubSession' + action[0].toUpperCase() + action.slice(1), session.id));
      const downloads = node('div', undefined, 'actions');
      for (const [kind,label] of [['session-csv','Download acquired CSV'],['session-jsonl','Download acquired JSONL'],['session-review','Download delivery review'],['session-manifest','Download acquisition manifest']]) {
        const control = button(label, 'pubDownloadSession', session.id, {write:false}); control.dataset.pubKind = kind; downloads.append(control);
      }
      card.append(operations, node('p', 'Run and recovery retain the same request and limits. Export delivery creates the retained customer files below.', 'help'),
        downloads, detail('Original acquisition report', session.report ?? session));
      area.append(card);
    }
    if (!(pub()?.sessions || []).length) area.append(node('p', 'Open a retained buyer session after preparing the reviewed customer request.', 'empty'));
  }
  function loadSession() {
    const existing = pub()?.sessions?.find(item => item.binding?.buyerId === $('pub-buyer-id').value);
    if (!existing?.binding) { $('pub-session-summary').textContent = 'Choose the original buyer workspace and explicit acquisition limits.'; return; }
    if (!buyerFormDirty) {
      const binding = existing.binding;
      for (const [id,key] of [['pub-buyer-workspace','workspaceDirectory'],['pub-max-pages','maxPages'],['pub-max-total','maxTotalAtomic'],['pub-max-rows','maxRows'],['pub-max-page-bytes','maxPageBytes']])
        $(id).value = String(binding[key]);
    }
    $('pub-session-summary').textContent = 'Retained session ' + existing.id + '. Reopen with these same workspace and limit values.';
  }
  function controls(value = locked) {
    locked = value;
    const unavailable = locked || Boolean(pub()?.running);
    facilitatorPanel.controls(unavailable);
    const connected = Boolean(pub()?.target?.connected), selected = selectedDraft();
    const gate = (id, ready) => { $(id).disabled = unavailable || !ready; };
    gate('pub-open', true);
    gate('pub-prepare', Boolean($('pub-export').value));
    gate('pub-preview', Boolean($('pub-preview-target').value) &&
      ($('pub-preview-target').value.startsWith('draft:') || connected));
    gate('pub-preview-next', Boolean(preview?.body?.page?.nextCursor && previewSelection &&
      $('pub-preview-target').value === previewSelection.target && $('pub-preview-query').value === previewSelection.displayQuery));
    gate('pub-load-query', Boolean(current?.lastQuery?.initialQuery));
    gate('pub-load-buyer-query', Boolean(current?.lastQuery?.initialQuery));
    gate('pub-review', connected && Boolean(selected));
    gate('pub-publish', connected && Boolean(selected && reviewedDraft && reviewedDraft === reviewKey()));
    gate('pub-collect', connected);
    gate('pub-stage', Boolean($('pub-release-draft').value));
    gate('pub-release-start', Boolean(activeReleaseId()) && Number.isSafeInteger(generation()) && !pub()?.ownsRelease);
    gate('pub-release-stop', Boolean(pub()?.ownsRelease));
    gate('pub-release-rollback', Boolean(activeReleaseId()) && Number.isSafeInteger(generation()));
    gate('pub-buyer-review', connected && Boolean($('pub-buyer-snapshot').value));
    gate('pub-buyer-prepare', Boolean(sameBuyerReview() && $('pub-accept').value !== ''));
    gate('pub-session', Boolean($('pub-buyer-id').value));
    gate('pub-download-buyer', Boolean($('pub-buyer-id').value));
    document.querySelectorAll('[data-pub-activate-snapshot]').forEach(control => {
      control.disabled = unavailable || !connected || control.dataset.currentVersion === 'true';
    });
    document.querySelectorAll('[data-pub-activate-release]').forEach(control => {
      control.disabled = unavailable || control.dataset.currentRelease === 'true';
    });
    document.querySelectorAll('#section-publisher button').forEach(control => {
      if (Object.keys(control.dataset).some(key => key.startsWith('pubDownload'))) control.disabled = unavailable;
    });
    document.querySelectorAll('#section-publisher [data-write]').forEach(control => {
      if (control.dataset.pubSessionRun || control.dataset.pubSessionUnpaid || control.dataset.pubSessionRecover || control.dataset.pubSessionAccount || control.dataset.pubSessionExport || control.dataset.pubInspectRelease)
        control.disabled = unavailable;
    });
  }
  function render(value) {
    current = value;
    const model = pub(), target = model?.target;
    $('pub-open').textContent = model ? 'Reconcile publisher' : 'Open publisher';
    $('pub-state-summary').replaceChildren(model ? facts([
      ['Publisher directory', model.directory], ['Dataset connection', target?.connected ? 'Running seller connected' : target?.initialized ? 'Retained dataset, seller stopped' : 'No dataset prepared'],
      ['Current snapshot', target?.versions?.current], ['Dataset revision', target?.versions?.revision],
      ['Retained drafts', drafts().length], ['Customer acquisitions', model.sessions?.length || 0],
      ['Active operation', model.running?.action || (model.running ? 'Running' : 'Idle')]
    ]) : node('p', 'Open the publisher to inspect its retained versions, releases and customer sessions.', 'muted'));
    $('pub-state-details').textContent = model ? json(model) : 'Open the publisher.';
    renderExport(); renderVersions(); renderDrafts(); renderReleases(); renderBuyers(); renderPreview(); renderBuyerReview();
    facilitatorPanel.render();
    controls(locked);
  }
  document.querySelectorAll('[data-publisher-view]').forEach(control => control.addEventListener('click', () => showView(control.dataset.publisherView)));
  $('pub-open').addEventListener('click', () => handle(() => call('publisher.status')));
  $('pub-go-exports').addEventListener('click', () => selectSection('exports'));
  $('pub-export').addEventListener('change', renderExport);
  bindForm('pub-prepare-form', async () => {
    const result = await call('publisher.prepare', {exportDirectory:$('pub-export').value});
    if (result.draft?.id) {
      for (const id of ['pub-review-draft','pub-release-draft']) $(id).value = result.draft.id;
      $('pub-preview-target').value = 'draft:' + result.draft.id;
      renderDraftReview(); controls(locked);
    }
  });
  $('pub-drafts').addEventListener('click', event => {
    const control = event.target.closest('button'); if (!control) return;
    if (control.dataset.pubSelectDraft) {
      for (const id of ['pub-review-draft','pub-release-draft']) $(id).value = control.dataset.pubSelectDraft;
      $('pub-preview-target').value = 'draft:' + control.dataset.pubSelectDraft;
      reviewedDraft = null; renderDraftReview(); controls(locked); showView('versions');
    }
    if (control.dataset.pubDownloadDraftCsv) handle(() => download('draft-csv',control.dataset.pubDownloadDraftCsv));
    if (control.dataset.pubDownloadDraftReview) handle(() => download('draft-review',control.dataset.pubDownloadDraftReview));
  });
  async function runPreview(query) {
    const target = $('pub-preview-target').value;
    preview = await call('publisher.preview', {target,query});
    previewSelection = {target,query,displayQuery:$('pub-preview-query').value};
    renderPreview(); controls(locked);
    if (Number(preview.status) >= 400) notice('The original dataset rejected this query. Review its native result.', 'error');
  }
  bindForm('pub-preview-form', () => runPreview(queryString($('pub-preview-query').value)));
  $('pub-preview-next').addEventListener('click', () => handle(() => {
    const query = new URLSearchParams(previewSelection.query); query.set('cursor',preview.body.page.nextCursor);
    return runPreview(query.toString());
  }));
  for (const id of ['pub-preview-target','pub-preview-query']) $(id).addEventListener('input', () => controls(locked));
  $('pub-load-query').addEventListener('click', () => handle(() => loadQuery('pub-preview-query')));
  $('pub-review-draft').addEventListener('change', () => { reviewedDraft = null; renderDraftReview(); controls(locked); });
  $('pub-review').addEventListener('click', () => handle(async () => {
    await call('publisher.reviewDraft', {draftId:$('pub-review-draft').value,...pins()});
    reviewedDraft = reviewKey(); controls(locked); notice('The retained draft is reviewed against the displayed current snapshot and revision.');
  }));
  $('pub-publish').addEventListener('click', () => handle(async () => {
    if (!reviewedDraft || reviewedDraft !== reviewKey()) throw new Error('Review this draft against the current version first.');
    await call('publisher.publish', {draftId:$('pub-review-draft').value,...pins()});
    reviewedDraft = null; controls(locked);
  }));
  $('pub-versions').addEventListener('click', event => {
    const control = event.target.closest('[data-pub-activate-snapshot]');
    if (control) handle(() => call('publisher.activateSnapshot', {snapshot:control.dataset.pubActivateSnapshot,...pins()}));
  });
  $('pub-collect').addEventListener('click', () => handle(() => call('publisher.collect')));
  bindForm('pub-release-form', () => {
    const runtime = {port:Number($('pub-release-port').value)};
    if ($('pub-facilitator').value) runtime.facilitator = $('pub-facilitator').value;
    if ($('pub-local-facilitator').checked) runtime.allowLocalFacilitator = true;
    return call('publisher.release.stage', {draftId:$('pub-release-draft').value,
      id:$('pub-release-id').value,label:$('pub-release-label').value,runtime});
  });
  $('pub-releases').addEventListener('click', event => {
    const control = event.target.closest('button'); if (!control) return;
    if (control.dataset.pubInspectRelease) handle(async () => {
      const result = await call('publisher.release.inspect',{id:control.dataset.pubInspectRelease});
      $('pub-release-details').textContent = json(result); $('pub-release-details').closest('details').open = true;
    });
    if (control.dataset.pubActivateRelease) handle(() => call('publisher.release.activate',
      {id:control.dataset.pubActivateRelease,expectedGeneration:generation()}));
  });
  $('pub-release-start').addEventListener('click', () => handle(() => call('publisher.release.start',{expectedGeneration:generation()})));
  $('pub-release-stop').addEventListener('click', () => handle(() => call('publisher.release.stop')));
  $('pub-release-rollback').addEventListener('click', () => handle(() => call('publisher.release.rollback',{expectedGeneration:generation()})));
  for (const id of ['pub-buyer-snapshot','pub-buyer-query']) $(id).addEventListener('input', () => {
    buyerReview = null; renderBuyerReview(); controls(locked);
  });
  $('pub-load-buyer-query').addEventListener('click', () => handle(() => loadQuery('pub-buyer-query')));
  bindForm('pub-buyer-review-form', async () => {
    const query = buyerQuery(), parsed = new URLSearchParams(query);
    if (parsed.has('snapshot') || parsed.has('cursor')) throw new Error('Choose the snapshot above and review the first-page query without a cursor.');
    buyerReview = await call('publisher.buyer.review',{snapshot:$('pub-buyer-snapshot').value,query});
    if (!$('pub-intent-id').value) $('pub-intent-id').value = crypto.randomUUID();
    renderBuyerReview(); controls(locked);
  });
  $('pub-accept').addEventListener('change', renderAccept);
  bindForm('pub-buyer-prepare-form', async () => {
    if (!sameBuyerReview()) throw new Error('Review the actual offer for this exact query first.');
    const result = await call('publisher.buyer.prepare',{review:buyerReview,intentId:$('pub-intent-id').value,
      acceptIndex:Number($('pub-accept').value),offerSha256:buyerReview.offerSha256});
    if (result.buyer?.id) { $('pub-buyer-id').value = result.buyer.id; sessionSelection = result.buyer.id; buyerFormDirty = false; loadSession(); }
    controls(locked);
  });
  $('pub-buyer-id').addEventListener('change', () => {
    sessionSelection = $('pub-buyer-id').value; buyerFormDirty = false; loadSession(); controls(locked);
  });
  $('pub-session-form').addEventListener('input', () => { buyerFormDirty = true; });
  bindForm('pub-session-form', async () => {
    await call('publisher.buyer.session',{buyerId:$('pub-buyer-id').value,
      workspaceDirectory:$('pub-buyer-workspace').value,maxPages:Number($('pub-max-pages').value),
      maxTotalAtomic:$('pub-max-total').value,maxRows:Number($('pub-max-rows').value),
      maxPageBytes:Number($('pub-max-page-bytes').value)});
    buyerFormDirty = false; loadSession();
  });
  $('pub-download-buyer').addEventListener('click', () => handle(() => download('buyer-config',$('pub-buyer-id').value)));
  $('pub-sessions').addEventListener('click', event => {
    const control = event.target.closest('button'); if (!control) return;
    if (control.dataset.pubSessionUnpaid) handle(() => {
      const session = pub()?.sessions?.find(item => item.id === control.dataset.pubSessionUnpaid);
      const continuation = session?.report?.unpaidContinuation;
      if (!['AVAILABLE','PREPARED'].includes(continuation?.status) ||
          continuation.attemptSha256 !== control.dataset.expectedAttemptSha256)
        throw new Error('The retained unpaid attempt changed. Reconcile this acquisition and review its current continuation.');
      return call('publisher.buyer.run', {id:session.id, retryUnpaid:true,
        expectedAttemptSha256:continuation.attemptSha256});
    });
    for (const action of ['Run','Recover','Account','Export'])
      if (control.dataset['pubSession'+action]) handle(() => call('publisher.buyer.'+action.toLowerCase(),{id:control.dataset['pubSession'+action]}));
    if (control.dataset.pubDownloadSession) handle(() => download(control.dataset.pubKind,control.dataset.pubDownloadSession));
  });
  return {render,controls,showView};
}

/** Provider choices and retained full reviews share the original Publisher owner.
 * The panel is in this existing asset because other source workspaces reuse it. */
function createPublisherFacilitatorPanel({call, download, handle, notice, getPublisher}) {
  const host = document.querySelector('[data-publisher-panel="release"]');
  if (!host) return {render(){}, controls(){}};
  const section = node('section', undefined, 'panel');
  section.hidden = true;
  const heading = node('div', undefined, 'panel-heading'), stateLabel = node('span', '', 'badge');
  heading.append(node('h3', 'Facilitator providers'), stateLabel);
  const introduction = node('p',
    'Review another provider against the same retained release. Inspect every native payment alternative, then stage the reviewed release. Select and start it with the release controls above.',
    'help');
  const configuration = node('p', '', 'help');
  const form = node('form', undefined, 'form-grid');
  const field = (caption, control) => {
    const label = node('label', caption); label.append(control); form.append(label); return control;
  };
  const provider = field('Host provider', node('select'));
  const release = field('Retained source release', node('select'));
  const proposed = field('New release ID', node('input'));
  proposed.required = true; proposed.pattern = '[a-z0-9][a-z0-9_-]{0,63}'; proposed.maxLength = 64;
  proposed.placeholder = 'hpd-periplo-1';
  const label = field('New release label', node('input'));
  label.maxLength = 240; label.placeholder = 'Same source with selected provider';
  const reviewSource = field('Capability source', node('select'));
  reviewSource.dataset.facilitatorResponseMode = '';
  for (const [value, caption] of [['live','Read provider now'],['received','Use received public document']]) {
    const choice = node('option', caption); choice.value = value; reviewSource.append(choice);
  }
  const responseFile = field('Received document file', node('input'));
  responseFile.type = 'file'; responseFile.accept = '.json,application/json';
  responseFile.dataset.facilitatorResponseFile = '';
  const responseDetails = node('div', undefined, 'span-2');
  const providerDetails = node('div', undefined, 'span-2');
  const formActions = node('div', undefined, 'actions span-2');
  const reviewButton = node('button', 'Review provider'); reviewButton.type = 'submit';
  formActions.append(reviewButton); form.append(providerDetails, responseDetails, formActions);
  const reviewArea = node('div');
  const reviewActions = node('div', undefined, 'actions');
  const stage = node('button', 'Stage reviewed release'); stage.type = 'button';
  const exportReview = node('button', 'Download complete review'); exportReview.type = 'button';
  const exportResponse = node('button', 'Download received response'); exportResponse.type = 'button';
  reviewActions.append(stage, exportReview, exportResponse);
  const stageReason = node('p', '', 'help');
  const historyHeading = node('div', undefined, 'panel-heading');
  const historyCount = node('span', '', 'badge');
  historyHeading.append(node('h4', 'Retained reviews'), historyCount);
  const historyArea = node('div');
  const pageActions = node('div', undefined, 'actions');
  const firstPage = node('button', 'Refresh first page'); firstPage.type = 'button';
  const nextPage = node('button', 'Next page'); nextPage.type = 'button';
  pageActions.append(firstPage, nextPage);
  section.append(heading, introduction, configuration, form, reviewArea, reviewActions,
    stageReason, historyHeading, historyArea, pageActions);
  host.append(section);
  let locked = true, selected = null, page = null, after = null, receivedResponse = null;
  const model = () => getPublisher()?.facilitators;
  const releases = () => getPublisher()?.releases?.releases || [];
  const generation = () => getPublisher()?.releases?.state?.generation;
  function populate(control, rows, preferred) {
    const previous = control.value;
    control.replaceChildren();
    for (const [value, caption] of rows) {
      const choice = node('option', caption); choice.value = value; control.append(choice);
    }
    if (!rows.length) { const empty = node('option', 'No retained selection'); empty.value = ''; control.append(empty); }
    control.value = rows.some(([value]) => value === previous) ? previous :
      rows.some(([value]) => value === preferred) ? preferred : rows[0]?.[0] || '';
  }
  function input() {
    return {provider:provider.value, releaseId:release.value, id:proposed.value,
      ...(label.value.trim() ? {label:label.value.trim()} : {}),
      ...(reviewSource.value === 'received' && receivedResponse ? {response:receivedResponse} : {})};
  }
  function sameInput() {
    const value = input();
    return selected && value.provider === selected.proposed.provider.alias &&
      value.releaseId === selected.source.releaseId && value.id === selected.proposed.id &&
      (value.label || value.id) === selected.proposed.label &&
      (reviewSource.value === 'received' ? sameReceivedDocument(receivedResponse, selected.receivedResponse) :
        selected.receivedResponse === undefined);
  }
  function providerSame() {
    const declared = model()?.providers?.find(item => item.alias === selected?.proposed?.provider?.alias);
    const previous = selected?.proposed?.provider;
    return declared && previous && ['alias','label','url','timeoutMs','allowLocalFacilitator']
      .every(key => declared[key] === previous[key]);
  }
  function renderProvider() {
    const value = model()?.providers?.find(item => item.alias === provider.value);
    providerDetails.replaceChildren(value ? facts([
      ['Endpoint', value.url], ['Read timeout', value.timeoutMs + ' ms'],
      ['Local facilitator enabled', value.allowLocalFacilitator ? 'Yes' : 'No']
    ]) : node('p', 'Choose a provider declared by the host.', 'help'));
  }
  function sameReceivedDocument(left, right) {
    if (!left || !right) return false;
    const ordered = value => Array.isArray(value) ? value.map(ordered) : object(value) ?
      Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
    return JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));
  }
  function responseIdentity(value) {
    return {id:value.id, url:value.url, retrieved:value.retrieved,
      body:{bytes:value.body.bytes, sha256:value.body.sha256, contentType:value.body.contentType}};
  }
  function renderResponse() {
    const value = reviewSource.value === 'received' ? receivedResponse : null;
    responseDetails.replaceChildren(value ? facts([
      ['Received document', value.id], ['Received endpoint', value.url],
      ['Retrieval started', value.retrieved.startedAt], ['Retrieval completed', value.retrieved.completedAt],
      ['Retrieval source', value.retrieved.source], ['Original body bytes', value.body.bytes],
      ['Original body SHA-256', value.body.sha256]
    ]) : node('p', reviewSource.value === 'received' ?
      'Choose the complete JSON document produced by facilitator-response capture. The server verifies its full body and selected provider URL.' :
      'The installed SDK reads the configured provider when you review it.', 'help'));
  }
  function renderReview() {
    reviewArea.replaceChildren();
    if (!selected) {
      reviewArea.append(node('p', 'Review the current provider or reopen a retained review below.', 'empty'));
      return;
    }
    const review = selected;
    reviewArea.append(facts([
      ['Review ID', review.id], ['Observed at', review.observedAt],
      ['Native compatibility', review.compatible ? 'All retained alternatives supported' : 'Review returned an incompatibility'],
      ['Original SDK', review.nativeSdk], ['Source release', review.source.releaseId],
      ['Source release digest', review.source.releaseDigest], ['Source public origin', review.source.publicOrigin],
      ['Proposed release', review.proposed.id], ['Provider', review.proposed.provider.url],
      ['Selection generation', review.generation], ['Native supported SHA-256', review.supportedSha256]
    ]));
    if (review.error) reviewArea.append(node('p',
      text(review.error.code) + ': ' + text(review.error.message), 'error-detail'));
    for (const route of review.nativePayments || []) {
      const title = [route.routeId ?? route.id, route.method, route.path].filter(Boolean).join(' ') || 'Native route';
      reviewArea.append(node('h4', title));
      const table = node('table'), header = node('tr'), body = node('tbody'), head = node('thead');
      for (const name of ['Option', 'Scheme', 'Network', 'Atomic amount', 'Asset', 'Recipient', 'Native fields'])
        header.append(node('th', name));
      head.append(header);
      for (const [index, payment] of (route.nativePayment || []).entries()) {
        const row = node('tr');
        for (const value of [index, payment.scheme, payment.network, payment.amount ?? payment.maxAmountRequired,
          payment.asset, payment.payTo]) row.append(node('td', value));
        const native = node('td'); native.append(detail('Complete alternative', payment)); row.append(native); body.append(row);
      }
      table.append(head, body);
      const scroll = node('div', undefined, 'table-scroll'); scroll.append(table); reviewArea.append(scroll);
      reviewArea.append(detail('Stored terms and all native changes', {storedPayment:route.storedPayment,changes:route.changes}));
    }
    if (review.receivedResponse) {
      reviewArea.append(node('h4', 'Received public document'), facts([
        ['Original endpoint', review.receivedResponse.url],
        ['Retrieved from', review.receivedResponse.retrieved.source],
        ['Retrieval started', review.receivedResponse.retrieved.startedAt],
        ['Retrieval completed', review.receivedResponse.retrieved.completedAt],
        ['Original body bytes', review.receivedResponse.body.bytes],
        ['Original body SHA-256', review.receivedResponse.body.sha256]
      ]));
      reviewArea.append(detail('Native review and document identity',
        {...review, receivedResponse:responseIdentity(review.receivedResponse)}));
    } else reviewArea.append(detail('Complete original review', review));
  }
  function renderHistory() {
    historyArea.replaceChildren();
    const value = page || {items:[],total:0,nextCursor:null};
    historyCount.textContent = value.items.length + ' shown / ' + value.total + ' retained';
    for (const item of value.items) {
      const card = node('article', undefined, 'publisher-card');
      const title = node('div', undefined, 'panel-heading');
      title.append(node('strong', item.label || item.proposedReleaseId),
        node('span', item.compatible ? 'Compatible' : 'Incompatible', 'badge'));
      const inspect = node('button', 'Open complete review'); inspect.type = 'button';
      inspect.dataset.facilitatorReviewId = item.id;
      card.append(title, facts([['Review', item.id], ['Observed', item.observedAt],
        ['Source release', item.releaseId], ['Provider', item.provider?.label || item.provider?.alias],
        ['Native SDK', item.nativeSdk],
        ['Capability source', item.receivedResponse ? 'Received public document' : 'Provider read'],
        ...(item.receivedResponse ? [['Original body SHA-256',item.receivedResponse.body.sha256]] : [])]), inspect);
      historyArea.append(card);
    }
    if (!value.items.length) historyArea.append(node('p', 'No reviews on this retained page.', 'empty'));
  }
  function controls(value = locked) {
    locked = value;
    const configured = Boolean(model()?.configured), available = !locked;
    reviewButton.disabled = !available || !configured || !provider.value || !release.value ||
      !proposed.checkValidity() || proposed.value === release.value ||
      reviewSource.value === 'received' && !receivedResponse;
    reviewButton.textContent = reviewSource.value === 'received' ? 'Review received document' : 'Review provider';
    const staged = selected && releases().find(item => item.id === selected.proposed.id);
    const alreadyStaged = staged?.derivedFrom?.reviewId === selected?.id;
    const source = selected && releases().find(item => item.id === selected.source.releaseId);
    const current = source?.digest === selected?.source?.releaseDigest && generation() === selected?.generation;
    const ready = selected?.compatible && configured && providerSame() && sameInput() && (alreadyStaged || current);
    stage.disabled = !available || !ready;
    stage.textContent = alreadyStaged ? 'Reconcile staged release' : 'Stage reviewed release';
    stageReason.textContent = !selected ? 'A retained complete review is required for staging.' :
      !selected.compatible ? 'This review remains available with its native incompatibility. Select a compatible provider to stage.' :
      !sameInput() ? 'The form now differs from the displayed review. Review these new selections.' :
      !providerSame() ? 'The configured provider changed. Review its current endpoint and capabilities.' :
      !alreadyStaged && !current ? 'The retained release or selection generation changed. Review the current source again.' :
      selected.receivedResponse ?
      'Staging interprets this same received document with the installed SDK and checks the current retained source. Select and start the release with the existing controls.' :
      'Staging verifies the original source and current provider response. Activation and seller process ownership remain in the release controls.';
    exportReview.disabled = !available || !selected;
    exportResponse.disabled = !available || !selected?.receivedResponse;
    firstPage.disabled = !available || !model();
    nextPage.disabled = !available || !page?.nextCursor;
    for (const control of historyArea.querySelectorAll('button')) control.disabled = !available;
    for (const control of [provider,release,proposed,label,reviewSource])
      control.disabled = !available || !configured;
    responseFile.disabled = !available || !configured || reviewSource.value !== 'received';
  }
  function render() {
    section.hidden = !model();
    if (!model()) return;
    stateLabel.textContent = model().configured ? model().providers.length + ' host providers' : 'Profiles not configured';
    configuration.textContent = model().configured
      ? 'Provider URLs and timeouts come from the host configuration. Retained review files reopen with this Publisher.'
      : 'Open the operator with --facilitators FILE, or set facilitatorConnection in its host workspace configuration. Existing retained reviews can still be inspected and downloaded.';
    const active = getPublisher()?.releases?.state?.active;
    const activeId = typeof active === 'string' ? active : active?.id;
    populate(provider, (model().providers || []).map(item => [item.alias, item.label + ' (' + item.alias + ')']));
    populate(release, releases().map(item => [item.id, item.label || item.id]), activeId);
    if (after === null) page = model().reviews;
    renderProvider(); renderResponse(); renderReview(); renderHistory(); controls(locked);
  }
  function selectReview(review) {
    selected = review;
    provider.value = review.proposed.provider.alias;
    release.value = review.source.releaseId;
    proposed.value = review.proposed.id; label.value = review.proposed.label;
    receivedResponse = review.receivedResponse ?? null;
    reviewSource.value = receivedResponse ? 'received' : 'live'; responseFile.value = '';
    renderProvider(); renderResponse(); renderReview(); controls(locked);
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    handle(async () => {
      const review = await call('publisher.facilitators.review', input());
      selectReview(review);
      notice(review.compatible ? 'The full native provider review is retained. Inspect its alternatives before staging.'
        : 'The native incompatibility is retained with the full provider response.', review.compatible ? undefined : 'error');
    });
  });
  for (const control of [provider,release,proposed,label,reviewSource]) control.addEventListener('input', () => {
    renderProvider(); renderResponse(); controls(locked);
  });
  responseFile.addEventListener('change', () => {
    const file = responseFile.files?.[0];
    receivedResponse = null; renderResponse(); controls(locked);
    if (!file) return;
    handle(async () => {
      if (file.size < 1 || file.size > 393216) throw new Error('Choose one complete received document up to 384 KiB.');
      const value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(await file.arrayBuffer()));
      if (value?.schema !== 'stellar-forge.facilitator-supported-response.v1' ||
          !/^[a-f0-9]{64}$/.test(value.id || '') || typeof value.url !== 'string' ||
          !object(value.retrieved) || !object(value.body) || value.body.encoding !== 'base64' ||
          typeof value.body.data !== 'string')
        throw new Error('Choose the complete document produced by facilitator-response capture.');
      receivedResponse = value;
      renderResponse(); controls(locked);
      notice('The complete public document is loaded. Review it to verify its byte identity and native payment requirements.');
    });
  });
  stage.addEventListener('click', () => handle(async () => {
    if (stage.disabled || !selected) return;
    await call('publisher.facilitators.stage', {reviewId:selected.id});
    notice('The reviewed provider release is retained. Select it using Activate release, then use the original seller controls.');
    controls(locked);
  }));
  exportReview.addEventListener('click', () => handle(() => download('facilitator-review', selected.id)));
  exportResponse.addEventListener('click', () => handle(() => download('facilitator-response', selected.id)));
  historyArea.addEventListener('click', event => {
    const control = event.target.closest('[data-facilitator-review-id]');
    if (control) handle(async () => selectReview(await call('publisher.facilitators.inspect',
      {reviewId:control.dataset.facilitatorReviewId})));
  });
  const readPage = async cursor => {
    const result = await call('publisher.facilitators.history', {after:cursor,limit:25});
    after = cursor; page = result; renderHistory(); controls(locked);
  };
  firstPage.addEventListener('click', () => handle(() => readPage(null)));
  nextPage.addEventListener('click', () => handle(() => readPage(page.nextCursor)));
  return {render,controls};
}
