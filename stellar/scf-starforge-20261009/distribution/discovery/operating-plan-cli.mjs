// MIT. Operating-plan files use the same model as the Command finder browser.
import { randomUUID } from 'node:crypto';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCommandCatalog } from './load.mjs';
import { saveExport, saveTextExport } from './write-json.mjs';
import { inspectOperatingPlan, createOperatingPlan, createOperatingStep, snapshotRegistration,
  operatingPlanDraft, saveOperatingPlanRevision, addOperatingStep, compareOperatingPlan,
  summarizeOperatingPlan, receiveOperatingPlan, forkOperatingPlan,
  renderOperatingPlanMarkdown, renderOperatingPlanHTML } from './operating-plan.mjs';

export const OPERATING_PLAN_HELP = [
  'Customer operating plans',
  '',
  'starforge discover plan catalog [--source-root DIRECTORY] [--selection PRODUCT] [--out NEW.json]',
  'starforge discover plan create --title TITLE --out NEW.json [--step command:NAME ...]',
  'starforge discover plan show --file PLAN.json [--revision N] [--format json|markdown|html] [--out NEW]',
  'starforge discover plan draft --file PLAN.json [--revision N] [--out NEW.json]',
  'starforge discover plan edit --file PLAN.json --draft DRAFT.json --out NEW.json',
  'starforge discover plan add --file PLAN.json --step command:NAME [--step ID ...] --out NEW.json',
  'starforge discover plan compare --file PLAN.json [--revision N] [--out NEW.json]',
  'starforge discover plan receive --file INCOMING.json [--existing CURRENT.json] --out NEW.json',
  'starforge discover plan copy --file PLAN.json [--title TITLE] [--id ID] --out NEW.json',
  '',
  'Create fields: --id, --title, --customer, --purpose, --period, --owner, --receiving, --notes.',
  'Catalog reads: --source-root DIRECTORY, --selection PRODUCT.',
  'A --step value is an exact Command finder registration ID. Repeated selections are separate task steps.',
  'Create, edit, add, receive and copy require a new output filename. Existing files are preserved.',
  'The browser is available at /operating-plan.html when starforge discover serve is running.',
].join('\n');
const ACTIONS = ['catalog', 'create', 'show', 'draft', 'edit', 'add', 'compare', 'receive', 'copy'];
const COMMON = ['file', 'out'];
const FLAGS = {
  catalog: ['source-root', 'selection', 'out'],
  create: ['id', 'title', 'customer', 'purpose', 'period', 'owner', 'receiving', 'notes', 'step', 'source-root', 'selection', 'out'],
  show: [...COMMON, 'revision', 'format'],
  draft: [...COMMON, 'revision'],
  edit: [...COMMON, 'draft'],
  add: [...COMMON, 'step', 'source-root', 'selection'],
  compare: [...COMMON, 'revision', 'source-root', 'selection'],
  receive: [...COMMON, 'existing'],
  copy: [...COMMON, 'title', 'id'],
};
export function parseOperatingPlanArguments(args) {
  const words = [...args];
  if (!words.length || words.includes('--help') || words.includes('-h')) return { action: 'help', options: {} };
  const action = words.shift();
  if (!ACTIONS.includes(action)) throw new TypeError('Unknown operating-plan action: ' + action);
  const options = {}, steps = [];
  while (words.length) {
    const flag = words.shift();
    if (!flag.startsWith('--') || !FLAGS[action].includes(flag.slice(2)))
      throw new TypeError('Unknown option for plan ' + action + ': ' + flag);
    const key = flag.slice(2);
    if (!words.length || words[0].startsWith('--')) throw new TypeError('A value is required for ' + flag);
    const value = words.shift();
    if (key === 'step') steps.push(value);
    else {
      if (Object.hasOwn(options, key)) throw new TypeError('Repeated option: ' + flag);
      options[key] = value;
    }
  }
  if (steps.length) options.steps = steps;
  if (!['create', 'catalog'].includes(action) && !options.file) throw new TypeError('--file is required.');
  if (['create', 'edit', 'add', 'receive', 'copy'].includes(action) && !options.out)
    throw new TypeError('--out must name a new output file.');
  if (action === 'create' && !options.title) throw new TypeError('--title is required.');
  if (action === 'edit' && !options.draft) throw new TypeError('--draft is required.');
  if (action === 'add' && !steps.length) throw new TypeError('Select at least one --step registration.');
  if (options.revision !== undefined) {
    options.revision = Number(options.revision);
    if (!Number.isSafeInteger(options.revision) || options.revision < 1)
      throw new TypeError('--revision must be a positive integer.');
  }
  if (options.format && !['json', 'markdown', 'html'].includes(options.format))
    throw new TypeError('--format must be json, markdown or html.');
  return { action, options };
}
async function readJSON(filename) {
  const target = resolve(filename), info = await stat(target);
  if (!info.isFile() || info.size > 32 * 1024 * 1024) throw new TypeError('Use a regular JSON file up to 32 MiB.');
  const bytes = await readFile(target);
  if (bytes.length > 32 * 1024 * 1024) throw new TypeError('The JSON document exceeds 32 MiB.');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
async function currentCatalog(options) {
  return loadCommandCatalog({ sourceRoot: options['source-root'], selection: options.selection });
}
export async function mainOperatingPlan(args = process.argv.slice(2), { log = console.log } = {}) {
  const { action, options } = parseOperatingPlanArguments(args);
  if (action === 'help') { log(OPERATING_PLAN_HELP); return; }
  const original = options.file ? inspectOperatingPlan(await readJSON(options.file)) : null;
  const reportOptions = { revision: options.revision };
  let value, plainText = null;
  if (action === 'catalog') value = await currentCatalog(options);
  else if (action === 'create') {
    const source = options.steps?.length ? await currentCatalog(options) : null;
    const steps = (options.steps ?? []).map(itemId => createOperatingStep({
      id: randomUUID(), selection: snapshotRegistration(source, itemId),
    }));
    value = createOperatingPlan({ id: options.id ?? randomUUID(), title: options.title,
      customer: options.customer, purpose: options.purpose, period: options.period,
      owner: options.owner, receiving: options.receiving, notes: options.notes, steps });
  } else if (action === 'show') {
    value = options.revision === undefined ? original : { plan: summarizeOperatingPlan(original, reportOptions),
      draft: operatingPlanDraft(original, options.revision) };
    if (options.format === 'markdown') plainText = renderOperatingPlanMarkdown(original, reportOptions);
    if (options.format === 'html') plainText = renderOperatingPlanHTML(original, reportOptions);
  } else if (action === 'draft') value = operatingPlanDraft(original, options.revision);
  else if (action === 'edit') value = saveOperatingPlanRevision(original, await readJSON(options.draft));
  else if (action === 'add') {
    const source = await currentCatalog(options); let draft = operatingPlanDraft(original);
    for (const itemId of options.steps) draft = addOperatingStep(draft, createOperatingStep({
      id: randomUUID(), selection: snapshotRegistration(source, itemId),
    }));
    value = saveOperatingPlanRevision(original, draft);
  } else if (action === 'compare') value = compareOperatingPlan(original, await currentCatalog(options), reportOptions);
  else if (action === 'receive') {
    const existing = options.existing ? inspectOperatingPlan(await readJSON(options.existing)) : null;
    const received = receiveOperatingPlan(original, existing); value = received.plan;
  } else if (action === 'copy') value = forkOperatingPlan(original, { id: options.id ?? randomUUID(), title: options.title });
  if (options.out) {
    if (plainText !== null) await saveTextExport(options.out, plainText);
    else await saveExport(options.out, value);
    log(JSON.stringify({ file: resolve(options.out), action, planId: value?.id ?? original?.id ?? null,
      revision: value?.revisions?.length ?? options.revision ?? original?.revisions?.length ?? null }));
  } else log(plainText ?? JSON.stringify(value, null, 2));
  return value;
}
if (process.argv[1] && await realpath(resolve(process.argv[1])).then(
  entry => pathToFileURL(entry).href === import.meta.url, () => false))
  mainOperatingPlan().catch(error => { console.error((error.code ? error.code + ': ' : '') + error.message); process.exitCode = 1; });
