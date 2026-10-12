#!/usr/bin/env node
// MIT. Create an editable customer procedure; native business execution remains with its original owner.
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCommandCatalog } from './load.mjs';
import { saveExport } from './write-json.mjs';
import { createGrantReportingPlan } from './grant-reporting-plan.mjs';
import { summarizeOperatingPlan } from './operating-plan.mjs';

export const GRANT_REPORTING_HELP = [
  'Grant reporting procedure',
  '',
  'starforge grant-reporting-plan create --input INPUT.json --out NEW_PLAN.json',
  '  [--catalog COMPLETE_CATALOG.json | --source-root DIRECTORY --selection PRODUCT]',
  '',
  'The input retains the original case/plan IDs and revisions, actual workspace, selected files,',
  'customer/period/receiving notes, a stable procedure ID and savedAt time, and a fixed browser origin.',
  'Each source table explicitly selects its delimiter and header setting. File hashes and lengths',
  'remain declared original references until the receiving operator records the actual result.',
  '',
  'A supplied --catalog is the complete original Command finder catalog, not a search-result export.',
  'Otherwise the maintained catalog loader reads the current installed/source selection.',
  'The catalog must contain grant-workspace, grant-source-tables and discover registrations.',
  'All generated steps are planned; creation reads no case, runs no native business command and records no outcomes.',
  'The original output is created exclusively. Keep it for the same request; reopen/edit/revise it with',
  'starforge discover plan or the existing Operating plans browser. Full JSON carries every revision.',
].join('\n');

export function parseGrantReportingArguments(args) {
  const words = [...args];
  if (!words.length || words.includes('--help') || words.includes('-h')) return {action: 'help', options: {}};
  const action = words.shift();
  if (action !== 'create') throw new TypeError('Choose create; use discover plan for the original read/edit/receive commands.');
  const allowed = ['input', 'out', 'catalog', 'source-root', 'selection'], options = {};
  while (words.length) {
    const flag = words.shift(), key = flag.startsWith('--') ? flag.slice(2) : '';
    if (!allowed.includes(key) || Object.hasOwn(options, key)) throw new TypeError('Unknown or repeated option: ' + flag);
    if (!words.length || words[0].startsWith('--')) throw new TypeError('A value is required for ' + flag);
    options[key] = words.shift();
  }
  if (!options.input || !options.out) throw new TypeError('Use --input with the complete customer input and --out with a new complete plan filename.');
  if (options.catalog && (options['source-root'] || options.selection))
    throw new TypeError('Choose the complete retained --catalog or the original source/selection loader.');
  if (resolve(options.input) === resolve(options.out) || options.catalog && resolve(options.catalog) === resolve(options.out))
    throw new TypeError('Preserve the original input and catalog; choose a separate new output.');
  return {action, options};
}
async function jsonFile(filename) {
  const path = resolve(filename), info = await stat(path);
  if (!info.isFile() || info.size > 32 * 1024 * 1024) throw new TypeError('Use a complete regular UTF-8 JSON file up to 32 MiB.');
  const raw = await readFile(path);
  if (raw.length > 32 * 1024 * 1024) throw new TypeError('The complete JSON input exceeds 32 MiB.');
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(raw));
}
export async function mainGrantReportingPlan(args = process.argv.slice(2), {log = console.log} = {}) {
  const {action, options} = parseGrantReportingArguments(args);
  if (action === 'help') {log(GRANT_REPORTING_HELP); return;}
  const input = await jsonFile(options.input);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Use the complete Grant reporting input object.');
  const output = resolve(options.out);
  if (input.procedureFile !== undefined && resolve(input.procedureFile) !== output)
    throw new TypeError('The original procedureFile must match --out; retain the input/output binding.');
  const sourceRoot = options['source-root'] ?? input.sourceRoot ?? undefined;
  const selection = options.selection ?? input.sourceSelection ?? undefined;
  const catalog = options.catalog ? await jsonFile(options.catalog) : await loadCommandCatalog({sourceRoot, selection});
  const document = createGrantReportingPlan({catalog, input: {...input, procedureFile: output,
    ...(options['source-root'] ? {sourceRoot: resolve(options['source-root'])} : {}),
    ...(options.selection ? {sourceSelection: options.selection} : {})}});
  await saveExport(output, document);
  log(JSON.stringify({file: output, action, ...summarizeOperatingPlan(document),
    caseId: input.case.id, caseVersion: input.case.version, planId: input.case.planId,
    planRevision: input.case.planRevision, nativeOperationStarted: false}));
  return document;
}
if (process.argv[1] && await realpath(resolve(process.argv[1])).then(
  entry => pathToFileURL(entry).href === import.meta.url, () => false))
  mainGrantReportingPlan().catch(error => {
    console.error(JSON.stringify({error: {code: error.code ?? 'GRANT_REPORTING_PLAN', message: error.message}}));
    process.exitCode = 1;
  });
