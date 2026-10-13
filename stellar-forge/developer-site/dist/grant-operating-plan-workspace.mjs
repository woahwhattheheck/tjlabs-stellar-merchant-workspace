// MIT. Customer procedure controls inside the original saved SF47 planning review.
import { grantOperatingSelectionOf, prepareGrantOperatingPlan, grantOperatingContinuationPlan,
  compareGrantOperatingReturn, receiveGrantOperatingReturn, openGrantOperatingReturn } from './grant-operating-plan-core.mjs';
import { retainVersion, validateDraft, MAX_BYTES } from './grant-submission-core.mjs';
import { planSummary } from './grant-plan-core.mjs';
import { CATALOG_SCHEMA, searchCommandCatalog } from
  '../../../stellar/scf-starforge-20261009/distribution/discovery/catalog.mjs';
import { snapshotRegistration, renderOperatingPlanHTML, renderOperatingPlanMarkdown } from
  '../../../stellar/scf-starforge-20261009/distribution/discovery/operating-plan.mjs';

const catalogs = new Map();
const cleanName = value => String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'grant-operating-plan';
const clone = value => JSON.parse(JSON.stringify(value));
export function renderGrantOperatingPlan(root, context, { source, plan, review }) {
  const { node, input, select, button, touch, render, work, download } = context;
  const draft = context.getDraft();
  const key = draft.id + ':' + source.sha256 + ':' + plan.revision;
  let selection;
  try { selection = grantOperatingSelectionOf(review, source); }
  catch (error) {
    root.append(node('p', error.message, 'issues'));
    return;
  }
  const cache = catalogs.get(key) ?? { catalog: null, query: '' };
  const update = change => {
    const current = context.getDraft();
    const selected = current.planningReview;
    if (!selected || selected.sourceSha !== source.sha256 || selected.revision !== plan.revision)
      throw new Error('Reopen the intended native planning revision before changing its customer procedure.');
    selected.operatingSelection = grantOperatingSelectionOf(selected, source);
    change(selected.operatingSelection); selection = clone(selected.operatingSelection);
    touch();
  };
  const section = node('section', undefined, 'card grant-operating-procedure');
  section.dataset.grantOperatingSource = source.sha256;
  section.dataset.grantOperatingRevision = String(plan.revision);
  section.append(node('h3', 'Customer operating procedure'),
    node('p', 'Turn the selected native work packages into ordered work for the receiving operator. Each step retains its original scope, completion result, price and relative work window. Continue editing it in Operating plans.'));

  const fields = node('div', undefined, 'grid');
  for (const [name, label, area] of [
    ['title', 'Procedure title', false], ['customer', 'Customer or installation', false],
    ['owner', 'Operating owner', false], ['purpose', 'Useful result', true],
    ['receiving', 'Receiving operator, location and continuation', true], ['notes', 'Procedure notes', true],
  ]) {
    const control = input(label, selection[name], value => update(saved => { saved[name] = value; }), { area });
    control.field.maxLength = ['title', 'owner'].includes(name) ? 300 : name === 'customer' ? 1000 : 32000;
    fields.append(control.wrap);
  }
  section.append(fields);

  const catalogBox = node('details');
  catalogBox.append(node('summary', 'Attach original toolkit registrations'),
    node('p', 'Use the complete toolkit catalog exported by Command finder. Select a registration for a work package to retain its original source and runtime details; a command opens with its native help arguments.'),
    node('pre', 'starforge discover plan catalog --out /absolute/customer/toolkit-catalog.json', 'source-text'));
  const file = node('input'); file.type = 'file'; file.accept = '.json,application/json';
  file.setAttribute('aria-label', 'Complete Command finder catalog');
  file.addEventListener('change', () => work(async () => {
    const chosen = file.files?.[0]; if (!chosen) return;
    if (chosen.size > 32 * 1024 * 1024) throw new TypeError('Choose the complete catalog within 32 MiB.');
    const received = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await chosen.arrayBuffer()));
    if (received?.schema !== CATALOG_SCHEMA || !received.package || !Array.isArray(received.sources) ||
      !Array.isArray(received.items) || !Array.isArray(received.featureNames))
      throw new TypeError('Choose the complete toolkit catalog from discover plan catalog or the Operating plans catalog download.');
    searchCommandCatalog(received, { pageSize: 1 });
    catalogs.set(key, { catalog: received, query: '' }); render();
    context.status('Opened the original toolkit catalog. Choose the registration for each selected work package.');
  }));
  catalogBox.append(file);
  const picker = node('div');
  let queryField;
  const paintBindings = () => {
    picker.replaceChildren();
    const currentSelection = grantOperatingSelectionOf(context.getDraft().planningReview, source);
    const latest = catalogs.get(key) ?? cache;
    let matches = [], total = 0;
    if (latest.catalog) {
      try {
        const found = searchCommandCatalog(latest.catalog, { query: latest.query, pageSize: 50 });
        matches = found.items; total = found.total;
        picker.append(node('p', latest.catalog.package.name + ' · ' + latest.catalog.package.version +
          ' · ' + total + ' matches' + (total > matches.length ? ' · first 50 shown; narrow the search to select another registration' : ''), 'muted'));
      } catch (error) { picker.append(node('p', error.message, 'issues')); }
    } else picker.append(node('p', 'Saved registration selections remain with their packages. Load a catalog to choose or replace them.', 'muted'));
    const summary = planSummary(source, plan.revision, context.getDraft().planningReview.costIds);
    for (const cost of summary.costs) {
      const selected = Object.hasOwn(currentSelection.bindings, cost.id) ? currentSelection.bindings[cost.id] : null;
      const choices = [['', 'Manual procedure — no registration selected']];
      if (selected && !matches.some(item => item.id === selected.item.id))
        choices.push([selected.item.id, selected.item.kind + ' · ' + selected.item.name + ' (retained selection)']);
      for (const item of matches) choices.push([item.id, item.kind + ' · ' + item.name]);
      const row = node('div', undefined, 'card');
      row.append(node('p', cost.remaining_work),
        select(cost.id + ' · original registration', selected?.item.id ?? '', choices, id => work(() => {
          if (!id) update(saved => { saved.bindings[cost.id] = null; });
          else if (selected?.item.id !== id || latest.catalog?.items.some(item => item.id === id)) {
            if (!latest.catalog) throw new Error('Load the complete toolkit catalog to choose this registration.');
            const registration = snapshotRegistration(latest.catalog, id);
            update(saved => { saved.bindings[cost.id] = registration; });
          }
          paintBindings();
        })).wrap);
      if (selected) {
        row.append(node('p', selected.item.description, 'muted'));
        const details = node('details');
        details.append(node('summary', 'Retained source and runtime'), node('pre', JSON.stringify(selected, null, 2), 'source-text'));
        row.append(details);
      }
      picker.append(row);
    }
  };
  queryField = input('Find a toolkit registration', cache.query, value => {
    const current = catalogs.get(key) ?? cache; current.query = value; catalogs.set(key, current); paintBindings();
  });
  queryField.field.maxLength = 512;
  catalogBox.append(queryField.wrap, picker); paintBindings(); section.append(catalogBox);

  const summary = planSummary(source, plan.revision, review.costIds);
  const create = button('Create operating plan from selected work packages', () => {
    const current = context.getDraft(), selected = current.planningReview;
    if (selected?.sourceSha !== source.sha256 || selected.revision !== plan.revision)
      throw new Error('Reopen the selected native planning edition first.');
    const chosen = grantOperatingSelectionOf(selected, source);
    const prepared = prepareGrantOperatingPlan(source, selected, { id: context.uid(), selection: chosen });
    const next = retainVersion(current, 'Before creating customer operating procedure');
    next.planningReview.operatingSelection = chosen;
    next.planningReview.operatingSelection.prepared.push(prepared);
    context.setDraft(validateDraft(next)); touch(); render();
    download(JSON.stringify(prepared.plan, null, 2) + '\n',
      cleanName(prepared.plan.id) + '-operating-plan.json', 'application/json');
    context.status('Created the customer operating plan from ' + prepared.packageIds.length +
      ' original work packages. Its complete prepared copy remains in this saved planning review.');
  });
  create.disabled = summary.costs.length === 0;
  section.append(node('p', summary.costs.length + ' selected work packages · original native revision ' + plan.revision, 'muted'),
    create,
    node('p', 'Import the downloaded JSON in Command finder → Operating plans. The new procedure starts with planned work; use its editor for detailed instructions, actual due dates and recorded results.', 'muted'));

  if (selection.prepared.length) {
    const history = node('details');
    history.append(node('summary', 'Prepared customer procedures (' + selection.prepared.length + ')'));
    for (const item of [...selection.prepared].reverse()) {
      const currentPlan = grantOperatingContinuationPlan(item);
      const entry = node('article', undefined, 'card'), last = currentPlan.revisions.at(-1), stem = cleanName(item.plan.id);
      entry.append(node('h4', last.title),
        node('p', item.packageIds.length + ' work packages · operating revision ' + last.revision + ' · prepared ' + item.plan.createdAt, 'muted'));
      const actions = node('div', undefined, 'row');
      actions.append(
        button('Download operating plan JSON', () => download(JSON.stringify(currentPlan, null, 2) + '\n', stem + '.json', 'application/json')),
        button('Download procedure HTML', () => download(renderOperatingPlanHTML(currentPlan), stem + '.html', 'text/html')),
        button('Download procedure Markdown', () => download(renderOperatingPlanMarkdown(currentPlan), stem + '.md', 'text/markdown')),
      );
      entry.append(actions);
      if (item.continuation) {
        entry.append(button('Download original prepared plan', () =>
          download(JSON.stringify(item.plan, null, 2) + '\n', stem + '-prepared.json', 'application/json')));
        const progress = compareGrantOperatingReturn(source, context.getDraft().planningReview, currentPlan);
        const details = node('details'); details.append(node('summary', 'Received customer work and package results'));
        renderReturnDetails(details, context, progress);
        const receiving = node('details'); receiving.append(node('summary', 'Procedure receiving history'));
        for (const record of item.continuation.receipts) receiving.append(node('p',
          record.at + ' · revisions ' + record.fromRevision + ' → ' + record.toRevision +
          (record.filename ? ' · ' + record.filename : '') + (record.note ? '\n' + record.note : '')));
        details.append(receiving); entry.append(details);
      }
      history.append(entry);
    }
    section.append(history);
    renderReturnReceiving(section, context, source, plan.revision);
  }
  root.append(section);
}


function renderReturnDetails(root, context, comparison) {
  const { node } = context;
  root.append(node('p', comparison.packageIds.length + ' original work packages · ' +
    comparison.counts.completed + ' recorded completed · ' + comparison.counts['in-progress'] +
    ' in progress · ' + comparison.counts.planned + ' planned · ' + comparison.counts.skipped +
    ' skipped · ' + comparison.counts.missing + ' absent from returned revision', 'muted'));
  for (const change of comparison.planChanges) {
    const detail = node('details'); detail.append(node('summary', 'Procedure ' + change.field + ' changed'),
      node('h5', 'Previously selected'), node('pre', change.previous, 'source-text'),
      node('h5', 'Returned value'), node('pre', change.returned, 'source-text'));
    root.append(detail);
  }
  const order = node('details');
  order.open = comparison.stepOrder.changedFromPrepared || comparison.stepOrder.changedFromPrevious;
  order.append(node('summary', 'Complete procedure step order' +
    (comparison.stepOrder.changedFromPrevious ? ' — changed from the selected revision' : '')));
  for (const [field, label] of [['prepared', 'Originally prepared'], ['previous', 'Previously selected'], ['returned', 'Returned']]) {
    const list = node('ol');
    for (const step of comparison.stepOrder[field]) list.append(node('li',
      step.title + ' · ' + step.stepId + (step.packageId ? ' · package ' + step.packageId : ' · customer step')));
    order.append(node('h5', label), list);
  }
  for (const step of comparison.stepOrder.positions) {
    const changes = [
      step.movedFromPrevious ? 'moved from ' + step.previous + ' to ' + step.returned : '',
      step.addedFromPrevious ? 'added at returned position ' + step.returned : '',
      step.removedFromPrevious ? 'removed from previous position ' + step.previous : '',
    ].filter(Boolean);
    if (changes.length) order.append(node('p', step.stepId + ': ' + changes.join(' · ')));
  }
  root.append(order);
  for (const item of comparison.packages) {
    const card = node('article', undefined, 'card'), current = item.returned;
    card.append(node('h4', item.packageId), node('p', item.native.remaining_work),
      node('p', 'Original completion result: ' + item.native.measurable_proof));
    if (!current) {
      card.append(node('p', 'This package step is absent from the returned operating revision. Its original work and completion result remain here.', 'issues'));
    } else {
      card.append(node('p', 'Recorded status: ' + current.status +
        (current.owner ? ' · owner: ' + current.owner : '') + (current.due ? ' · due: ' + current.due : '')),
        node('h5', 'Returned result'), node('pre', current.recordedResult || 'No result entered.', 'source-text'));
      if (item.changedFromPrepared.length) {
        const changes = node('details'); changes.append(node('summary', 'Compare with the original package procedure'));
        for (const field of item.changedFromPrepared) {
          const format = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
          const preparedValue = field === 'position' ? item.positions.prepared : item.original[field];
          const returnedValue = field === 'position' ? item.positions.returned : current[field];
          changes.append(node('h5', field), node('p', 'Originally prepared', 'muted'),
            node('pre', format(preparedValue), 'source-text'), node('p', 'Returned', 'muted'),
            node('pre', format(returnedValue), 'source-text'));
        }
        card.append(changes);
      }
    }
    root.append(card);
  }
  if (comparison.additionalSteps.length) {
    const additional = node('details');
    additional.append(node('summary', 'Additional customer operating steps (' + comparison.additionalSteps.length + ')'),
      node('p', 'These are retained customer procedure steps alongside the original funded package mapping.'));
    for (const step of comparison.additionalSteps) additional.append(node('h4', 'Returned position ' +
      comparison.stepOrder.positions.find(item => item.stepId === step.id).returned + ' · ' + step.title),
      node('pre', JSON.stringify(step, null, 2), 'source-text'));
    root.append(additional);
  }
}

function renderReturnReceiving(root, context, source, nativeRevision) {
  const { node, button, input, work, render, touch, download } = context;
  const draftId = context.getDraft().id;
  const active = () => {
    const draft = context.getDraft(), review = draft.planningReview;
    if (draft.id !== draftId || !review || review.sourceSha !== source.sha256 || review.revision !== nativeRevision)
      throw new Error('Reopen the original native planning revision for this returned procedure.');
    return { draft, review, selection: grantOperatingSelectionOf(review, source) };
  };
  const commitReview = (draft, review) => {
    const next = clone(draft); next.planningReview = clone(review);
    next.planningReview.operatingSelection = grantOperatingSelectionOf(review, source);
    context.setDraft(validateDraft(next)); touch();
  };
  const pending = active().selection.pendingReturn;
  const currentPending = () => {
    const current = active(), saved = current.selection.pendingReturn;
    if (!saved || !pending || saved.openedAt !== pending.openedAt ||
      saved.filename !== pending.filename || JSON.stringify(saved.incoming) !== JSON.stringify(pending.incoming))
      throw new Error('The opened return changed. Reopen its current review before editing or receiving.');
    return { ...current, saved };
  };
  const closeReturn = () => {
    const { draft, review, selection } = currentPending();
    delete selection.pendingReturn;
    const next = clone(review); next.operatingSelection = selection;
    commitReview(draft, next); render();
    context.status('Closed the returned file. Save the original submission to retain this change.');
  };
  const section = node('section', undefined, 'card');
  section.append(node('h3', 'Receive customer procedure'),
    node('p', 'Open the complete later JSON exported from Operating plans. Review its original package mapping, step order and full recorded work, then receive its saved revisions into this same planning review. Save the original submission to retain an unfinished comparison and its review note.'));
  const file = node('input'); file.type = 'file'; file.accept = '.json,application/json';
  file.setAttribute('aria-label', 'Complete returned customer operating plan');
  file.addEventListener('change', () => work(async () => {
    const chosen = file.files?.[0]; if (!chosen) return;
    if (!chosen.size || chosen.size > MAX_BYTES) throw new TypeError('Choose a complete operating plan within 16 MiB.');
    const incoming = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await chosen.arrayBuffer()));
    const current = active();
    const opened = openGrantOperatingReturn(source, current.review, incoming, { filename: chosen.name });
    const next = retainVersion(current.draft, 'Before opening returned customer procedure');
    commitReview(next, opened.review); render();
    context.status('Opened customer operating revision ' + opened.comparison.incomingRevision +
      '. Review the complete returned work below; Save retains the whole opened file and unfinished review.');
  }));
  section.append(file);
  if (pending) {
    try {
      const comparison = compareGrantOperatingReturn(source, active().review, pending.incoming);
      section.append(node('h4', comparison.incomingTitle),
        node('p', pending.filename + ' · current operating revision ' + comparison.previousRevision +
          ' · returned revision ' + comparison.incomingRevision + ' · ' + comparison.addedRevisions + ' later revisions', 'muted'));
      renderReturnDetails(section, context, comparison);
      const note = input('Receiving review note', pending.note, value => {
        const { draft, review, selection } = currentPending();
        selection.pendingReturn.note = value;
        const next = clone(review); next.operatingSelection = selection;
        commitReview(draft, next);
      }, { area: true });
      note.field.maxLength = 32000; section.append(note.wrap);
      const receive = button('Receive later customer work into this planning review', () => {
        const { draft, review, saved } = currentPending();
        const received = receiveGrantOperatingReturn(source, review, saved.incoming, {
          filename: saved.filename, note: saved.note, expectedRevision: saved.comparedRevision,
        });
        if (received.reused) { closeReturn(); return; }
        const next = retainVersion(draft, 'Before receiving customer operating revision ' + comparison.incomingRevision);
        commitReview(next, received.review); render();
        context.status('Received ' + received.addedRevisions + ' original customer operating revisions. Save the original submission to keep the complete work and receiving history.');
      });
      const stale = pending.comparedRevision !== comparison.previousRevision;
      receive.disabled = comparison.reused || stale;
      if (stale) {
        section.append(node('p', 'The selected operating procedure advanced after this comparison. Refresh it against the current saved history and review the changes before receiving.', 'issues'),
          button('Refresh comparison with current operating revision', () => {
            const { draft, review, saved } = currentPending();
            const opened = openGrantOperatingReturn(source, review, saved.incoming, {
              filename: saved.filename, note: saved.note, openedAt: saved.openedAt,
            });
            commitReview(draft, opened.review); render();
            context.status('Refreshed the comparison against the current procedure while retaining the full returned file and review note. Save to retain this review.');
          }));
      } else if (comparison.reused) section.append(node('p', 'The current saved procedure already contains this complete returned history.', 'muted'));
      section.append(receive,
        button('Download full return comparison', () => {
          const current = currentPending();
          const compared = compareGrantOperatingReturn(source, current.review, current.saved.incoming);
          download(JSON.stringify(compared, null, 2) + '\n',
            cleanName(compared.planId) + '-return-comparison.json', 'application/json');
        }),
        button('Download opened customer return', () => {
          const current = currentPending();
          download(JSON.stringify(current.saved.incoming, null, 2) + '\n',
            cleanName(current.saved.incoming.id) + '-opened-return.json', 'application/json');
        }),
        button('Close returned file', closeReturn));
    } catch (error) {
      section.append(node('p', error.message, 'issues'),
        button('Close returned file', closeReturn));
    }
  }
  root.append(section);
}
