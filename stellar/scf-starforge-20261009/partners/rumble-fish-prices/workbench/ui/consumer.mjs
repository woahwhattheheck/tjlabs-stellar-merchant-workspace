export function createConsumerUi({ api, download, perform, notify, getState, onPlan }) {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const pretty = value => JSON.stringify(value, null, 2);
  const empty = (n, message) => '<tr><td colspan="' + n + '" class="empty">' + esc(message) + '</td></tr>';
  const query = value => new URLSearchParams(Object.entries(value).filter(([, v]) => v !== undefined)).toString();
  let selected = '', customer = null, edition = null, dirty = false, draftRevision = 0, generation = 0, fetching = false, pendingEdition = null;
  const value = (field, input) => { $(field).value = input ?? ''; };
  function setDraft(config = {}) {
    value('consumer-id', selected); $('consumer-id').readOnly = Boolean(selected);
    value('consumer-name', config.name); value('consumer-reference', config.customerReference);
    value('consumer-currency', config.currency ?? 'USD');
    value('consumer-positions', (config.positions ?? []).map(row => [row.asset, row.quantity, row.label].join('\t')).join('\n'));
    value('consumer-age', config.quality?.maxAgeSeconds ?? 7200);
    $('consumer-carried').checked = config.quality?.allowCarried ?? true;
    $('consumer-older').checked = config.quality?.allowOlder ?? false;
    $('consumer-unknown').checked = config.quality?.allowUnknown ?? false;
    dirty = false; draftRevision = customer?.revision ?? 0;
    $('consumer-version').textContent = selected ? 'Customer revision ' + draftRevision + ' / saved book ' + (customer?.book.revision ?? '') : 'Create a named customer and save its exact asset quantities.';
  }
  function clearCustomer() {
    generation++; selected = ''; customer = null; edition = null; pendingEdition = null;
    $('consumer-select').value = ''; setDraft(); renderCustomer(); renderEdition();
  }
  function configuration() {
    const positions = $('consumer-positions').value.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
      const parts = line.split('\t');
      if (parts.length < 2 || parts.length > 3) throw new Error('Position line ' + (index + 1) + ' needs asset, quantity and optional label separated by tabs.');
      return { asset: parts[0].trim(), quantity: parts[1].trim(), label: (parts[2] ?? '').trim() };
    });
    return { name: $('consumer-name').value.trim(), customerReference: $('consumer-reference').value.trim(), currency: $('consumer-currency').value, positions,
      quality: { maxAgeSeconds: Number($('consumer-age').value), allowCarried: $('consumer-carried').checked, allowOlder: $('consumer-older').checked, allowUnknown: $('consumer-unknown').checked } };
  }
  async function loadCustomer(consumerId, { force = false } = {}) {
    const request = ++generation; fetching = true;
    try {
      const next = await api('consumer?' + query({ consumerId }));
      if (request !== generation) return;
      selected = consumerId; customer = next;
      if (force || !dirty) setDraft(customer.book.configuration);
      renderCustomer();
      const chosen = edition && customer.editions.some(row => row.id === edition.id) ? edition.id : customer.editions.at(-1)?.id;
      if (chosen) await loadEdition(chosen, request); else { edition = null; renderEdition(); }
    } finally { if (request === generation) fetching = false; }
  }
  async function loadEdition(editionId, request = generation) {
    if (!selected) return;
    const next = await api('consumer/edition?' + query({ consumerId: selected, editionId }));
    if (request !== generation) return;
    edition = next; renderEdition();
  }
  function renderCustomer() {
    const summaries = customer?.editions ?? [];
    $('consumer-edition-list').innerHTML = summaries.length ? summaries.slice().reverse().map(row =>
      '<button class="run-item' + (edition?.id === row.id ? ' selected' : '') + '" data-consumer-edition="' + esc(row.id) + '"><strong>' + esc(row.name) + '</strong><span>' + esc(row.currency) + ' ' + esc(row.totals.complete ? row.totals.total : 'incomplete') + ' · ' + row.totals.valuedPositions + '/' + row.totals.positions + ' valued</span><span>' + esc(row.createdAt) + (row.id === customer.publishedEditionId ? ' · published' : '') + '</span></button>').join('') : '<p class="muted">Save a customer and receive a current-price collection to create its first edition.</p>';
    $('consumer-saved-name').textContent = customer?.book.configuration.name ?? 'Customer values';
    $('consumer-state').textContent = customer ? 'Customer ' + selected + ' · revision ' + customer.revision + ' · book ' + customer.book.revision + ' · ' + summaries.length + ' saved editions' : 'No customer selected.';
    $('consumer-create-edition').disabled = !customer || dirty;
    $('consumer-plan-book').disabled = !customer || dirty;
    $('consumer-published-download').disabled = !customer?.publishedEditionId;
    $('consumer-download-book').disabled = !customer;
    $('consumer-review-publish').disabled = !edition || !customer || edition.bookSha256 !== customer.book.sha256;
    $('consumer-review-reject').disabled = !edition;
  }
  function renderEdition() {
    $('consumer-edition-title').textContent = edition?.name ?? 'Selected source edition';
    $('consumer-edition-meta').textContent = edition ? edition.createdAt + ' · book ' + edition.bookRevision + ' · ' + edition.source.runId + (edition.id === customer?.publishedEditionId ? ' · published' : ' · saved edition') : 'Choose an edition to inspect its valuation and original source.';
    $('consumer-total').textContent = edition ? edition.totals.complete ? edition.totals.total + ' ' + edition.currency : 'Incomplete' : '—';
    $('consumer-subtotal').textContent = edition ? edition.totals.pricedSubtotal + ' ' + edition.currency : '—';
    $('consumer-coverage').textContent = edition ? edition.totals.valuedPositions + ' / ' + edition.totals.positions : '—';
    $('consumer-total-label').textContent = edition?.totals.complete ? 'Complete value' : 'Missing values remain visible';
    $('consumer-rows').innerHTML = edition?.rows?.length ? edition.rows.map(row =>
      '<tr><td><strong>' + esc(row.label || row.asset.split(':')[0]) + '</strong><small>' + esc(row.asset) + '</small></td><td class="decimal">' + esc(row.quantity) + '</td><td class="decimal">' + esc(row.unitPrice ?? '—') + '<small>' + esc(row.priceField) + '</small></td><td class="decimal">' + esc(row.value ?? 'Unavailable') + '<small>' + esc(row.currency) + '</small></td><td>' + esc(row.priceStatus || 'unknown') + '<small>' + esc(row.method || '') + '</small><small>' + esc(row.flags.map(flag => flag.code).join(', ')) + '</small></td><td>' + esc(row.asOf ?? 'Unknown') + '<small>Snapshot ' + esc(row.updatedAt ?? 'Unknown') + '</small></td><td>' + (row.source?.response ? '<button class="secondary" data-result-run="' + esc(row.source.runId) + '" data-result-task="' + esc(row.source.taskId) + '">Original response</button>' : 'No retained response') + '</td></tr>').join('') : empty(7, 'The selected source edition will show every configured asset.');
    const comparison = edition?.comparison;
    $('consumer-comparison-meta').textContent = comparison ? 'Compared with ' + comparison.previousEditionId + '. ' + (comparison.sameCurrency ? comparison.totalDelta === null ? 'Complete-total change is unavailable; the comparable valued positions changed by ' + comparison.comparableValueDelta + ' ' + comparison.currency + '.' : 'Complete-total change: ' + comparison.totalDelta + ' ' + comparison.currency + '.' : 'The saved denomination changed; numeric totals are kept separate.') : 'The next saved source edition will compare against this customer’s previous edition.';
    $('consumer-comparison-rows').innerHTML = comparison?.rows?.length ? comparison.rows.map(row =>
      '<tr><td>' + esc(row.asset) + '</td><td>' + esc(row.status) + '<small>' + (row.observationChanged ? 'Observation changed' : 'Same observation time') + '</small></td><td class="decimal">' + esc(row.quantityDelta ?? '—') + '</td><td class="decimal">' + esc(row.priceDelta ?? '—') + '</td><td class="decimal">' + esc(row.valueDelta ?? '—') + '<small>Quantity effect ' + esc(row.quantityEffect ?? '—') + '</small><small>Price effect ' + esc(row.priceEffect ?? '—') + '</small></td></tr>').join('') : empty(5, 'No previous customer edition.');
    $('consumer-source-details').textContent = edition ? pretty({ source: edition.source, quality: edition.quality, contractSha256: edition.contractSha256, editionSha256: edition.sha256, note: edition.note }) : '';
    $('consumer-json').disabled = !edition; $('consumer-csv').disabled = !edition;
    $('consumer-review-publish').disabled = !edition || !customer || edition.bookSha256 !== customer.book.sha256;
    $('consumer-review-reject').disabled = !edition;
    const reviews = customer?.reviews.filter(row => row.editionId === edition?.id) ?? [];
    $('consumer-review-history').textContent = reviews.length ? reviews.map(row => row.createdAt + ' · ' + row.decision + ' · ' + row.reviewedBy + (row.note ? ' · ' + row.note : '')).join('\n') : 'This edition has no saved review.';
    renderCustomer();
  }
  function render(state) {
    const selectedValue = selected || $('consumer-select').value;
    $('consumer-select').innerHTML = '<option value="">New customer</option>' + (state.consumers ?? []).map(row => '<option value="' + esc(row.consumerId) + '">' + esc(row.name) + ' · ' + row.editions + ' editions</option>').join('');
    $('consumer-select').value = selectedValue;
    const oldRun = $('consumer-source-run').value;
    const runs = (state.runs ?? []).filter(run => run.tasks.some(task => ['batch', 'price'].includes(task.kind)));
    $('consumer-source-run').innerHTML = '<option value="">Choose a retained price collection</option>' + runs.map(run => '<option value="' + esc(run.id) + '">' + esc(run.name) + ' · ' + esc(run.status) + ' · ' + esc(run.createdAt) + '</option>').join('');
    if (runs.some(run => run.id === oldRun)) $('consumer-source-run').value = oldRun;
    else if (runs.length) $('consumer-source-run').value = runs[0].id;
    const summary = (state.consumers ?? []).find(row => row.consumerId === selected);
    if (selected && summary && summary.revision !== customer?.revision && !fetching) void loadCustomer(selected).catch(error => notify(error.message));
    renderCustomer();
  }
  $('consumer-select').addEventListener('change', () => void perform(async () => {
    const selectedId = $('consumer-select').value;
    if (!selectedId) { clearCustomer(); return; }
    dirty = false; edition = null; pendingEdition = null;
    await loadCustomer(selectedId, { force: true });
  }));
  $('consumer-new').addEventListener('click', clearCustomer);
  $('consumer-book-form').addEventListener('input', () => { dirty = true; renderCustomer(); });
  $('consumer-book-form').addEventListener('submit', event => {
    event.preventDefault(); void perform(async () => {
      const consumerId = selected || $('consumer-id').value.trim();
      const saved = await api('consumer', { consumerId, expectedRevision: draftRevision, configuration: configuration() });
      selected = consumerId; customer = saved; pendingEdition = null; setDraft(saved.book.configuration); renderCustomer();
      await loadCustomer(consumerId, { force: true });
      notify('Customer asset book saved. Select the source collection for its next edition.');
    });
  });
  $('consumer-use-watchlist').addEventListener('click', () => {
    const rows = (getState()?.workspace.configuration.assetIdentifiers ?? []).map(asset => [asset, '0', ''].join('\t'));
    $('consumer-positions').value = rows.join('\n'); dirty = true; renderCustomer();
    notify('Saved watchlist copied into the draft. Enter the intended quantities before saving.');
  });
  $('consumer-import-book').addEventListener('change', event => void perform(async () => {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 1024 * 1024) throw new Error('Use a customer configuration of at most one megabyte.');
    const input = JSON.parse(await file.text());
    setDraft(input.configuration ?? input); dirty = true; renderCustomer(); event.target.value = '';
    notify('Customer configuration loaded into the editable draft.');
  }));
  $('consumer-download-book').addEventListener('click', () => { if (customer) download(selected + '-customer-book.json', pretty(customer.book.configuration) + '\n'); });
  $('consumer-plan-book').addEventListener('click', () => void perform(async () => {
    if (!customer || dirty) throw new Error('Save the customer asset book first.');
    await onPlan({ kind: 'collection', name: customer.book.configuration.name + ' / current prices', assets: customer.book.configuration.positions.map(row => row.asset), operations: ['batch'] });
  }));
  $('consumer-edition-form').addEventListener('input', () => { pendingEdition = null; });
  $('consumer-edition-form').addEventListener('submit', event => {
    event.preventDefault(); void perform(async () => {
      if (!customer || dirty) throw new Error('Save the customer asset book before receiving a source edition.');
      const sourceRunId = $('consumer-source-run').value;
      if (!sourceRunId) throw new Error('Choose a retained current-price collection.');
      pendingEdition ??= { consumerId: selected, expectedRevision: customer.revision, sourceRunId, name: $('consumer-edition-name').value.trim(), note: $('consumer-edition-note').value.trim(), operationId: 'browser-' + crypto.randomUUID() };
      const result = await api('consumer/edition', pendingEdition);
      customer = result.consumer; edition = result.edition; pendingEdition = null; draftRevision = customer.revision;
      renderEdition(); notify(result.replayed ? 'The previously saved source edition was recovered.' : 'Source edition saved with every configured asset and original price reference.');
    });
  });
  async function review(decision) {
    if (!customer || !edition) throw new Error('Select a customer source edition.');
    const result = await api('consumer/review', { consumerId: selected, expectedRevision: customer.revision, editionId: edition.id, decision, reviewedBy: $('consumer-reviewer').value.trim(), note: $('consumer-review-note').value.trim() });
    customer = result.consumer; if (!dirty) draftRevision = customer.revision; renderEdition();
    notify(decision === 'publish' ? 'Reviewed values are now the customer’s published feed.' : 'Review saved. The edition and original source remain in the customer history.');
  }
  $('consumer-review-publish').addEventListener('click', () => void perform(() => review('publish')));
  $('consumer-review-reject').addEventListener('click', () => void perform(() => review('reject')));
  $('consumer-json').addEventListener('click', () => void perform(async () => {
    const output = await api('consumer/output?' + query({ consumerId: selected, editionId: edition.id }));
    download(selected + '-' + edition.id + '.json', pretty(output) + '\n');
  }));
  $('consumer-csv').addEventListener('click', () => void perform(async () => {
    const content = await api('consumer/output?' + query({ consumerId: selected, editionId: edition.id, format: 'csv' }), undefined, 'text');
    download(selected + '-' + edition.id + '.csv', content, 'text/csv; charset=utf-8');
  }));
  $('consumer-published-download').addEventListener('click', () => void perform(async () => {
    const output = await api('consumer/output?' + query({ consumerId: selected }));
    download(selected + '-published-values.json', pretty(output) + '\n');
  }));
  $('consumer-edition-list').addEventListener('click', event => {
    const button = event.target.closest('[data-consumer-edition]');
    if (button) void perform(() => loadEdition(button.dataset.consumerEdition));
  });
  clearCustomer();
  return { render };
}
