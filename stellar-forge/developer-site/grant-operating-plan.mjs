// MIT. Prepare editable customer work from complete original SF47 or submission files.
import { randomUUID, createHash } from 'node:crypto';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { ENVELOPE } from './dist/grant-submission-core.mjs';
import { newPlanReview, selectedPlan } from './dist/grant-plan-core.mjs';
import { receivePlanningFile } from './dist/grant-plan-source.mjs';
import { openDraftEnvelope } from './dist/grant-handover-source.mjs';
import { newGrantOperatingSelection, grantOperatingSelectionOf, prepareGrantOperatingPlan } from './dist/grant-operating-plan-core.mjs';
import { CATALOG_SCHEMA, searchCommandCatalog } from '../../stellar/scf-starforge-20261009/distribution/discovery/catalog.mjs';
import { snapshotRegistration, renderOperatingPlanHTML, renderOperatingPlanMarkdown } from '../../stellar/scf-starforge-20261009/distribution/discovery/operating-plan.mjs';
import { saveExport, saveTextExport } from '../../stellar/scf-starforge-20261009/distribution/discovery/write-json.mjs';

export const GRANT_OPERATING_PLAN_HELP = [
  'Prepare a customer operating procedure from an original native SF47 planning file or complete saved submission.',
  '',
  'starforge grant-operating-plan --file PLAN.json|PLAN.zip|DRAFT.json --out NEW.json',
  '  [--source-sha SHA256] [--revision N] [--package NATIVE-COST-ID ...]',
  '  [--title TITLE] [--customer CUSTOMER] [--owner OWNER] [--purpose TEXT]',
  '  [--receiving TEXT] [--notes TEXT] [--id ID]',
  '  [--catalog CATALOG.json --bind NATIVE-COST-ID=REGISTRATION-ID ...]',
  '  [--format json|html|markdown|preparation]',
  '',
  'JSON is the complete editable Operating plans document. Import it in Command finder → Operating plans.',
  'HTML and Markdown are readable procedures; preparation retains source identities and package totals with the plan.',
  'For a submission, the current retained native source, revision, package selection and entered procedure fields are used.',
  'An explicitly selected different native revision starts its own selection. Repeated --package replaces that selection.',
  'Use discover plan catalog --out NEW.json to export complete original registrations for --bind.',
  'All output filenames are create-only. The complete input file remains the original grant and planning workspace.',
].join('\n');
const MAX_INPUT_BYTES = 32 * 1024 * 1024 + 65536;
const copy = value => JSON.parse(JSON.stringify(value));
const requireValue = (condition, message) => { if (!condition) throw new TypeError(message); };
const decode = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
const planningOptions = {
  digest: async bytes => createHash('sha256').update(bytes).digest('hex'),
  inflate: async (bytes, maximum) => new Uint8Array(inflateRawSync(bytes, { maxOutputLength: maximum })),
};
async function completeFile(filename) {
  const path = resolve(filename), info = await stat(path);
  requireValue(info.isFile() && info.size > 0 && info.size <= MAX_INPUT_BYTES,
    'Open a complete regular input file within the native 32 MiB limit.');
  const bytes = await readFile(path);
  requireValue(bytes.length <= MAX_INPUT_BYTES, 'The input changed beyond the native file limit while it was read.');
  return { path, bytes };
}
export async function readGrantOperatingInput(filename, { sourceSha, revision } = {}) {
  const input = await completeFile(filename);
  const zip = input.bytes.length >= 4 && input.bytes[0] === 80 && input.bytes[1] === 75 &&
    input.bytes[2] === 3 && input.bytes[3] === 4;
  const parsed = zip ? null : JSON.parse(decode(input.bytes).replace(/^\uFEFF/, ''));
  let source, review;
  if (parsed?.schema === ENVELOPE) {
    const draft = await openDraftEnvelope(decode(input.bytes), { planningOptions });
    const chosenSha = sourceSha ?? draft.planningReview?.sourceSha;
    if (chosenSha) source = (draft.planSources ?? []).find(item => item.sha256 === chosenSha);
    else if (draft.planSources?.length === 1) source = draft.planSources[0];
    requireValue(source, 'Select a retained native planning source from this complete draft with --source-sha.');
    const chosenRevision = revision ?? (draft.planningReview?.sourceSha === source.sha256 ?
      draft.planningReview.revision : source.document.currentRevision);
    review = draft.planningReview?.sourceSha === source.sha256 && draft.planningReview.revision === chosenRevision ?
      copy(draft.planningReview) : newPlanReview(source, chosenRevision);
  } else {
    source = await receivePlanningFile(new Uint8Array(input.bytes), {
      ...planningOptions, filename: basename(input.path),
    });
    requireValue(!sourceSha || sourceSha === source.sha256, 'The selected source SHA-256 differs from the complete native input file.');
    review = newPlanReview(source, revision ?? source.document.currentRevision);
  }
  selectedPlan([source], review);
  return { source, review };
}
export function parseGrantOperatingArguments(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: false, options: {
    help: { type: 'boolean', short: 'h' },
    file: { type: 'string' }, out: { type: 'string' }, 'source-sha': { type: 'string' },
    revision: { type: 'string' }, package: { type: 'string', multiple: true },
    title: { type: 'string' }, customer: { type: 'string' }, owner: { type: 'string' },
    purpose: { type: 'string' }, receiving: { type: 'string' }, notes: { type: 'string' },
    id: { type: 'string' }, catalog: { type: 'string' }, bind: { type: 'string', multiple: true },
    format: { type: 'string', default: 'json' },
  } });
  if (values.help || args.length === 0) return { help: true };
  requireValue(values.file && values.out, 'Both --file and a new --out filename are required.');
  requireValue(!positionals.length, 'Use the named file and output options.');
  requireValue(['json', 'html', 'markdown', 'preparation'].includes(values.format), 'Choose json, html, markdown or preparation.');
  if (values.revision !== undefined) {
    requireValue(/^[1-9][0-9]*$/.test(values.revision), '--revision must be a positive whole number.');
    values.revision = Number(values.revision);
    requireValue(Number.isSafeInteger(values.revision), '--revision is outside the native revision range.');
  }
  if (values['source-sha']) requireValue(/^[0-9a-f]{64}$/.test(values['source-sha']), '--source-sha must be the full original lowercase SHA-256.');
  requireValue(!values.bind?.length || values.catalog, '--bind requires the complete original --catalog.');
  return values;
}
export async function mainGrantOperatingPlan(args = process.argv.slice(2), { log = console.log } = {}) {
  const options = parseGrantOperatingArguments(args);
  if (options.help) { log(GRANT_OPERATING_PLAN_HELP); return; }
  const { source, review } = await readGrantOperatingInput(options.file, {
    sourceSha: options['source-sha'], revision: options.revision,
  });
  if (options.package) review.costIds = [...options.package];
  const selection = review.operatingSelection ? grantOperatingSelectionOf(review, source) :
    newGrantOperatingSelection(source, review.revision);
  for (const field of ['title', 'customer', 'owner', 'purpose', 'receiving', 'notes'])
    if (options[field] !== undefined) selection[field] = options[field];
  if (options.catalog) {
    const input = await completeFile(options.catalog), catalog = JSON.parse(decode(input.bytes).replace(/^\uFEFF/, ''));
    requireValue(catalog?.schema === CATALOG_SCHEMA && catalog.package && Array.isArray(catalog.sources) &&
      Array.isArray(catalog.items) && Array.isArray(catalog.featureNames), 'Choose the complete original Command finder catalog.');
    searchCommandCatalog(catalog, { pageSize: 1 });
    const seen = new Set();
    for (const binding of options.bind ?? []) {
      const at = binding.indexOf('='), costId = binding.slice(0, at), itemId = binding.slice(at + 1);
      requireValue(at > 0 && itemId && !seen.has(costId), 'Use one --bind NATIVE-COST-ID=REGISTRATION-ID per selected package.');
      requireValue(review.costIds.includes(costId), 'Bind a package selected in this procedure: ' + costId);
      selection.bindings[costId] = snapshotRegistration(catalog, itemId); seen.add(costId);
    }
  }
  const prepared = prepareGrantOperatingPlan(source, review, { id: options.id ?? randomUUID(), selection });
  if (options.format === 'html') await saveTextExport(options.out, renderOperatingPlanHTML(prepared.plan));
  else if (options.format === 'markdown') await saveTextExport(options.out, renderOperatingPlanMarkdown(prepared.plan));
  else await saveExport(options.out, options.format === 'preparation' ? prepared : prepared.plan);
  log(JSON.stringify({ file: resolve(options.out), format: options.format, planId: prepared.plan.id,
    sourceSha256: source.sha256, nativeRevision: review.revision, packageIds: prepared.packageIds,
    totals: prepared.totals }));
  return prepared;
}
if (process.argv[1] && await realpath(resolve(process.argv[1])).then(
  entry => pathToFileURL(entry).href === import.meta.url, () => false))
  mainGrantOperatingPlan().catch(error => { console.error((error.code ? error.code + ': ' : '') + error.message); process.exitCode = 1; });
