// MIT. Returned SEC operator workspaces in the original authenticated desk.
export function connectReturns({ api, run, notice, hasEdits, getState, refresh, download, saveBlob }) {
  const $ = id => document.getElementById(id);
  const clone = value => structuredClone(value);
  let selected = null, review = null, decisions = {}, pending = null, storageKey = null;
  const node = (tag, text, className) => {
    const value = document.createElement(tag);
    if (text !== undefined) value.textContent = text;
    if (className) value.className = className;
    return value;
  };
  const requireSaved = () => {
    if (hasEdits()) throw new Error('Save or download your local merchant edits before applying a returned workspace.');
  };
  function recoverLocal() {
    const id = getState()?.workspaceId;
    if (!id) throw new Error('Open the original workspace first.');
    const key = 'sec-edgar-returns-v1:' + id;
    if (key === storageKey) return;
    storageKey = key; selected = null; review = null; decisions = {}; pending = null;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved?.workspaceId === id) {
        selected = saved.selected || null; decisions = saved.decisions || {};
        pending = saved.pending || null;
        $('return-actor').value = saved.actor || '';
        $('return-notes').value = saved.notes || '';
      }
    } catch { notice('The saved return choices could not be read. Your retained server records are available below.', true); }
  }
  function retain() {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({
      workspaceId: getState().workspaceId, selected, reviewSha256: review?.reviewSha256 || null,
      decisions, pending, actor: $('return-actor').value, notes: $('return-notes').value
    }));
    renderPending();
  }
  function renderPending() {
    $('return-pending').hidden = !pending;
    $('return-pending-text').textContent = pending
      ? 'Saved request ' + pending.requestId + '. Continue this original request after an interrupted response.'
      : '';
    $('return-apply').disabled = !review || Boolean(pending);
    $('return-choices').disabled = Boolean(pending);
  }
  function valueText(value) {
    if (!value?.present) return 'Absent';
    return typeof value.value === 'string' ? value.value : JSON.stringify(value.value, null, 2);
  }
  const orderValue = () => {
    const text = $('return-order').value.trim();
    return text ? { order: text.split(/[\s,]+/).filter(Boolean) } : null;
  };
  function currentDecisions() {
    const result = clone(decisions);
    const explicit = orderValue();
    if (explicit) result['products.order'] = explicit;
    return result;
  }
  function renderRows() {
    const holder = $('return-comparison'); holder.replaceChildren();
    if (!review) { holder.append(node('p', 'Choose a retained return to compare its original revisions.', 'help')); return; }
    const search = $('return-search').value.trim().toLowerCase();
    const showSame = $('return-show-same').checked;
    const rows = review.rows.filter(row => (showSame || row.status !== 'same') &&
      (!search || (row.label + ' ' + row.key + ' ' + row.status).toLowerCase().includes(search)));
    let required = 0, chosen = 0;
    const choices = currentDecisions();
    for (const row of review.rows) if (row.requiresDecision) {
      required++; if (Object.hasOwn(choices, row.key)) chosen++;
    }
    $('return-choice-count').textContent = chosen + ' of ' + required + ' required choices selected · ' +
      rows.length + ' of ' + review.rows.length + ' fields shown';
    for (const row of rows) {
      const card = node('article', undefined, 'return-field');
      const heading = node('div', undefined, 'section-heading');
      heading.append(node('h3', row.label), node('span', row.status.replaceAll('-', ' '), 'tag'));
      card.append(heading, node('code', row.key, 'return-key'));
      const columns = node('div', undefined, 'return-values');
      for (const [label, key] of [['Issued', 'issued'], ['Current', 'current'], ['Returned', 'returned']]) {
        const column = node('section');
        column.append(node('h4', label), node('pre', valueText(row[key]), 'return-value'));
        columns.append(column);
      }
      card.append(columns);
      if (row.requiresDecision || row.status !== 'same') {
        const label = node('label', 'Use for the next saved draft');
        const select = node('select'); select.dataset.returnKey = row.key;
        select.append(new Option(row.requiresDecision ? 'Choose a version' : 'Keep current (unchanged by return)', ''),
          new Option('Keep current', 'current'), new Option('Use returned', 'returned'));
        select.value = typeof decisions[row.key] === 'string' ? decisions[row.key] : '';
        select.disabled = Boolean(pending);
        select.addEventListener('change', () => {
          if (select.value) decisions[row.key] = select.value; else delete decisions[row.key];
          if (row.key === 'products.order' && select.value) $('return-order').value = '';
          retain(); renderRows();
        });
        label.append(select); card.append(label);
      }
      holder.append(card);
    }
    if (!rows.length) holder.append(node('p', 'No fields match these filters.', 'help'));
  }
  function renderReview() {
    $('return-reviewed').hidden = !review;
    if (!review) { renderRows(); renderPending(); return; }
    $('return-lineage').textContent = 'Issued revision ' + review.issuedRevision + ' → current revision ' +
      review.currentRevision + ' / returned revision ' + review.returnedRevision;
    $('return-review-sha').textContent = review.reviewSha256;
    $('return-original-archive').href = '/api/returns/' + encodeURIComponent(review.returnId) + '/archive';
    $('return-source-status').textContent = JSON.stringify(review.sourceStatus, null, 2);
    const custom = decisions['products.order'];
    $('return-order').value = custom && typeof custom === 'object' && Array.isArray(custom.order)
      ? custom.order.join('\n') : '';
    $('return-order-help').textContent = 'For combined additions, list every desired product ID in order, one per line. ' +
      'The saved review checks the exact chosen product population. Suggested IDs: ' +
      (Array.isArray(review.suggestedOrder) ? review.suggestedOrder.join(', ') : 'see the product rows.');
    renderRows(); renderPending();
  }
  async function listReturns() {
    recoverLocal();
    const result = await api('/api/returns');
    const select = $('return-select'); select.replaceChildren(new Option('Choose a retained returned workspace', ''));
    for (const item of result.returns) {
      const id = item.returnId || item.id;
      select.add(new Option((item.label || id) + ' · returned revision ' + item.returnedRevision, id));
    }
    if (selected && [...select.options].some(option => option.value === selected)) select.value = selected;
    $('return-total').textContent = result.returns.length + ' retained returns';
    renderPending();
    return result;
  }
  async function openReview(id = $('return-select').value) {
    if (!id) throw new Error('Choose a retained return.');
    if (pending && pending.returnId !== id) throw new Error('Resolve the saved original apply request before changing returns.');
    const priorSha = review?.reviewSha256;
    let retainedSha = priorSha;
    try { retainedSha ||= JSON.parse(localStorage.getItem(storageKey) || 'null')?.reviewSha256; } catch {}
    const input = {};
    const issued = $('return-issued-revision').value.trim();
    if (issued) {
      if (!/^\d+$/.test(issued) || !Number.isSafeInteger(Number(issued))) throw new Error('Use a saved issued revision number.');
      input.issuedRevision = Number(issued);
    }
    const next = await api('/api/returns/' + encodeURIComponent(id) + '/preview', { method: 'POST', json: input });
    if (selected !== id || retainedSha !== next.reviewSha256) decisions = {};
    selected = id; review = next;
    retain(); renderReview();
    notice('The exact issued, current and returned revisions are open. Select the changes to retain.');
  }
  async function applyPending() {
    requireSaved();
    if (!pending) throw new Error('No saved apply request is open.');
    const result = await api('/api/returns/' + encodeURIComponent(pending.returnId) + '/apply',
      { method: 'POST', json: pending });
    $('return-result').textContent = JSON.stringify(result, null, 2);
    $('return-result').hidden = false;
    pending = null; review = null; decisions = {}; retain(); renderReview();
    await refresh({ replaceDraft: true, message: 'Returned changes saved in the original workspace. Complete source and decision history are retained.' });
    await listReturns();
  }
  $('return-refresh').addEventListener('click', () => run('Opening retained returns…', async () => {
    await listReturns(); notice('Retained returns and saved request recovery loaded.');
  }));
  $('return-open').addEventListener('click', () => run('Comparing original and returned revisions…', async () => {
    recoverLocal(); await openReview();
  }));
  $('return-upload-form').addEventListener('submit', event => {
    event.preventDefault();
    run('Receiving the complete returned workspace…', async () => {
      recoverLocal();
      const file = $('return-file').files[0], sha256 = $('return-upload-sha').value.trim().toLowerCase();
      if (!file) throw new Error('Choose the complete returned SEC workspace ZIP.');
      if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Enter the archive SHA-256 from its original completed export.');
      if (file.size < 1 || file.size > 8 * 1024 ** 3 + 64 * 1024 ** 2) throw new Error('The archive exceeds the complete workspace limit.');
      const uploadId = 'return-' + crypto.randomUUID();
      const query = new URLSearchParams({ sha256, label: $('return-upload-label').value.trim() });
      const result = await api('/api/returns/upload/' + uploadId + '?' + query, {
        method: 'PUT', headers: { 'content-type': 'application/zip' }, body: file
      });
      selected = result.returnId || result.id;
      $('return-file').value = ''; await listReturns(); await openReview(selected);
    });
  });
  $('return-search').addEventListener('input', renderRows);
  $('return-show-same').addEventListener('change', renderRows);
  $('return-keep-all').addEventListener('click', () => {
    if (!review || pending) return;
    for (const row of review.rows) if (row.requiresDecision || row.status !== 'same') decisions[row.key] = 'current';
    $('return-order').value = ''; retain(); renderRows();
  });
  $('return-order').addEventListener('input', () => {
    const value = orderValue();
    if (value) decisions['products.order'] = value; else delete decisions['products.order'];
    retain(); renderRows();
  });
  for (const id of ['return-actor', 'return-notes']) $(id).addEventListener('input', () => { if (storageKey) retain(); });
  $('return-download-review').addEventListener('click', () => {
    if (!review) return;
    saveBlob(new Blob([JSON.stringify({ ...review, pendingRequest: pending, decisions: currentDecisions(),
      actor: $('return-actor').value.trim(), notes: $('return-notes').value.trim() }, null, 2) + '\n'],
      { type: 'application/json' }), 'sec-edgar-return-comparison-' + review.returnId + '.json');
    notice('The full original comparison and current decisions were downloaded.');
  });
  $('return-apply').addEventListener('click', () => run('Saving the reviewed returned changes…', async () => {
    requireSaved(); recoverLocal();
    if (!review) throw new Error('Open the current three-version comparison first.');
    const actor = $('return-actor').value.trim();
    if (!actor) throw new Error('Name the operator making these choices.');
    const chosen = currentDecisions();
    const unresolved = review.rows.filter(row => row.requiresDecision && !Object.hasOwn(chosen, row.key));
    if (unresolved.length) throw new Error('Choose a version for every required field before saving.');
    pending = { returnId: review.returnId, reviewSha256: review.reviewSha256,
      requestId: 'apply-' + crypto.randomUUID(), issuedRevision: review.issuedRevision, decisions: chosen, actor, notes: $('return-notes').value.trim() };
    retain(); await applyPending();
  }));
  $('return-resume').addEventListener('click', () => run('Continuing the original apply request…', applyPending));
  $('return-request-status').addEventListener('click', () => run('Reading the original request…', async () => {
    if (!pending) return;
    const result = await api('/api/returns/' + encodeURIComponent(pending.returnId) + '/operations/' + encodeURIComponent(pending.requestId));
    $('return-result').textContent = JSON.stringify(result, null, 2); $('return-result').hidden = false;
    notice('The retained original request is shown below. Continue it to recover its saved result.');
  }));
  $('return-clear-unsent').addEventListener('click', () => run('Checking whether the request was received…', async () => {
    if (!pending) return;
    try {
      const result = await api('/api/returns/' + encodeURIComponent(pending.returnId) + '/operations/' + encodeURIComponent(pending.requestId));
      if (result.state === 'rejected') {
        pending = null; retain(); renderRows();
        notice('The original request records a completed rejection. Reopen the current comparison before making a new selection.'); return;
      }
    }
    catch (cause) {
      if (cause.status !== 404) throw cause;
      pending = null; retain(); renderRows();
      notice('The server has no saved request with this identity. Your choices remain available for review.'); return;
    }
    throw new Error('This request was received. Continue the original request to preserve its recorded result.');
  }));
  return { refresh: listReturns };
}
