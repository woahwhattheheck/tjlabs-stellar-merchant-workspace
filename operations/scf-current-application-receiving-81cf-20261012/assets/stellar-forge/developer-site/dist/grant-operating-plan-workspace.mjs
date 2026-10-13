// MIT. Customer procedure controls inside the original saved SF47 planning review.
import { grantOperatingSelectionOf, prepareGrantOperatingPlan } from './grant-operating-plan-core.mjs';
import { retainVersion, validateDraft } from './grant-submission-core.mjs';
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
      const entry = node('article', undefined, 'card'), last = item.plan.revisions.at(-1), stem = cleanName(item.plan.id);
      entry.append(node('h4', last.title),
        node('p', item.packageIds.length + ' work packages · ' + item.plan.createdAt, 'muted'));
      const actions = node('div', undefined, 'row');
      actions.append(
        button('Download operating plan JSON', () => download(JSON.stringify(item.plan, null, 2) + '\n', stem + '.json', 'application/json')),
        button('Download procedure HTML', () => download(renderOperatingPlanHTML(item.plan), stem + '.html', 'text/html')),
        button('Download procedure Markdown', () => download(renderOperatingPlanMarkdown(item.plan), stem + '.md', 'text/markdown')),
      );
      entry.append(actions); history.append(entry);
    }
    section.append(history);
  }
  root.append(section);
}
