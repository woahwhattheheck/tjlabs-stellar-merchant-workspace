#!/usr/bin/env node
// MIT. Whole-package migration commands share the original economic-project transaction.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { need, plain } from '../model.mjs';
import { hash, jsonBytes } from '../source.mjs';
import { MAX_DDP_CAPTURE_BYTES } from './files.mjs';
import { pageFredDdpCrosswalk } from './crosswalk.mjs';
import { pageFredDdpPackage } from './package.mjs';
import {
  listFredDdpSources, getFredDdpCrosswalk, importFredDdpCrosswalk, acquireFredDdpCrosswalk,
  getFredDdpPackage, importFredDdpPackage, previewFredDdpMigration, saveFredDdpMigration,
  getFredDdpMigration, downloadFredDdpMigration, acquireFredDdpMigration,
  getFredDdpReceiving, downloadFredDdpReceiving
} from '../project.mjs';

export const FRED_DDP_PROJECT_COMMANDS = Object.freeze([
  'ddp-sources', 'ddp-crosswalk', 'ddp-crosswalk-file', 'ddp-crosswalk-import', 'ddp-crosswalk-acquire',
  'ddp-package', 'ddp-package-file', 'ddp-package-import',
  'ddp-migration-preview', 'ddp-migration-save', 'ddp-migration', 'ddp-migration-file', 'ddp-migration-acquire',
  'ddp-receiving', 'ddp-receiving-file'
]);
export const FRED_DDP_PROJECT_USAGE = [
  'Original Board packages → complete FRED migration → portable analyst receiving',
  '',
  'starforge fred ddp-sources --project ABS [--out FILE]',
  'starforge fred ddp-crosswalk --project ABS --crosswalk ID [--release NAME --query TEXT --offset N --limit N --out FILE]',
  'starforge fred ddp-crosswalk-file --project ABS --crosswalk ID --out FILE',
  'starforge fred ddp-crosswalk-import --project ABS --id ID --expected-revision N [--input FILE --crosswalk ID --out FILE]',
  'starforge fred ddp-crosswalk-acquire --project ABS --id ID --expected-revision N [--url BOARD_HTTPS_URL --out FILE]',
  'starforge fred ddp-package --project ABS --package ID [--section series|observations --series ID --frequency CODE --query TEXT --offset N --limit N --out FILE]',
  'starforge fred ddp-package-file --project ABS --package ID --out FILE',
  'starforge fred ddp-package-import --project ABS --id ID --expected-revision N [--input FILE --package ID --out FILE]',
  'starforge fred ddp-migration-preview --project ABS --migration-config FILE [--section series|mappings|acquisitions --offset N --limit N --out FILE]',
  'starforge fred ddp-migration-save --project ABS --id ID --expected-revision N --migration-config FILE --preview-id SHA [--out FILE]',
  'starforge fred ddp-migration --project ABS --migration ID [--section series|mappings|acquisitions --offset N --limit N --out FILE]',
  'starforge fred ddp-migration-file --project ABS --migration ID --out FILE',
  'starforge fred ddp-migration-acquire --project ABS --id ID --expected-revision N --migration ID [--out FILE]',
  'starforge fred ddp-receiving --project ABS --receiving ID [--series ID --changes-only 1|0 --offset N --limit N --out FILE]',
  'starforge fred ddp-receiving-file --project ABS --receiving ID --format json|csv|html --out FILE',
  '',
  'A migration-config file contains packageId, crosswalkId, name, asOf, window, decisions and bindings;',
  'it may also retain pageSize, maxRows, the original bookmark and the customer’s note.',
  'Window kinds: source; fixed with start/end; last with the original observation count.',
  'Imports begin with the complete original source envelope. Resume its exact operation with the source ID.',
  'A reviewed plan acquires every planned native FRED batch and adopts the complete receiving together.',
  'Use the returned captureIds with the existing analyst review, recurring template, release watch and merchant commands.',
  'The complete offline HTML provides source details, filters and full original CSV/JSON downloads.',
  'File outputs are create-only. SIGINT/SIGTERM retains the same acquisition operation and completed source batches.',
].join('\n');
const MUTATION = ['id', 'expected-revision'], PAGE = ['offset', 'limit'], PLAN_PAGE = ['section', ...PAGE];
const OPTIONS = Object.freeze({
  'ddp-sources': ['project', 'out'],
  'ddp-crosswalk': ['project', 'crosswalk', 'release', 'query', ...PAGE, 'out'],
  'ddp-crosswalk-file': ['project', 'crosswalk', 'out'],
  'ddp-crosswalk-import': ['project', ...MUTATION, 'input', 'crosswalk', 'out'],
  'ddp-crosswalk-acquire': ['project', ...MUTATION, 'url', 'out'],
  'ddp-package': ['project', 'package', 'series', 'frequency', 'query', ...PLAN_PAGE, 'out'],
  'ddp-package-file': ['project', 'package', 'out'],
  'ddp-package-import': ['project', ...MUTATION, 'input', 'package', 'out'],
  'ddp-migration-preview': ['project', 'migration-config', ...PLAN_PAGE, 'out'],
  'ddp-migration-save': ['project', ...MUTATION, 'migration-config', 'preview-id', 'out'],
  'ddp-migration': ['project', 'migration', ...PLAN_PAGE, 'out'],
  'ddp-migration-file': ['project', 'migration', 'out'],
  'ddp-migration-acquire': ['project', ...MUTATION, 'migration', 'out'],
  'ddp-receiving': ['project', 'receiving', 'series', 'changes-only', ...PAGE, 'out'],
  'ddp-receiving-file': ['project', 'receiving', 'format', 'out'],
});
const CONFIG_FIELDS = ['packageId', 'crosswalkId', 'name', 'asOf', 'window', 'decisions', 'bindings',
  'pageSize', 'maxRows', 'bookmark', 'note'];
function parse(command, args) {
  const allowed = OPTIONS[command], flags = {};
  need(allowed, 'Choose an original DDP project command; use fred --help.');
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], name = flag.startsWith('--') ? flag.slice(2) : '';
    need(allowed.includes(name) && !Object.hasOwn(flags, name), 'Unknown or duplicate command option: ' + flag);
    need(typeof args[index + 1] === 'string' && args[index + 1].length > 0 && !args[index + 1].startsWith('--'),
      'A value is required for ' + flag + '.');
    flags[name] = args[++index];
  }
  need(flags.project, '--project selects the original private economic project.');
  return flags;
}
function integer(value, label, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  need(typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)), 'Choose an integer ' + label + '.');
  return Number(value);
}
function boolean(value, fallback) {
  if (value === undefined) return fallback;
  need(value === '1' || value === '0', 'Use 1 or 0 for --changes-only.');
  return value === '1';
}
async function readJson(path, limit) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBytes(resolve(path), limit)));
}
async function exportResult(value, destination) {
  if (!destination) return value;
  const path = resolve(destination), body = Buffer.isBuffer(value) ? value : jsonBytes(value);
  await writeBytes(path, body, { exclusive: true });
  return { destination: path, bytes: body.length, sha256: hash(body) };
}
function sourceAbort(command) {
  if (!['ddp-crosswalk-acquire', 'ddp-migration-acquire'].includes(command)) return { signal: undefined, close() {} };
  const controller = new AbortController();
  const interrupt = () => controller.abort(Object.assign(new Error('The original DDP source acquisition was interrupted.'), {
    code: 'FRED_CAPTURE_INTERRUPTED', status: 499 }));
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  return { signal: controller.signal, close() {
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
  } };
}
/** Return the complete command result without printing; cancellation works through the installed dispatcher. */
export async function runFredDdpProjectCommand(args) {
  const [command, ...rest] = args, flags = parse(command, rest), directory = resolve(flags.project);
  const common = () => ({ directory, id: flags.id,
    expectedRevision: integer(flags['expected-revision'], 'project revision') });
  const page = () => ({ offset: integer(flags.offset, 'page offset', 0), limit: integer(flags.limit, 'page size', 100) });
  const planPage = () => ({ ...page(), section: flags.section ?? 'series' });
  const config = async () => {
    need(flags['migration-config'], '--migration-config selects the complete original package migration settings.');
    const value = await readJson(flags['migration-config'], 8 * 1024 * 1024);
    need(plain(value) && Object.keys(value).every(key => CONFIG_FIELDS.includes(key)), 'Unknown migration configuration field.');
    return value;
  };
  const requireValue = (key, message) => { need(flags[key], message); return flags[key]; };
  const abort = sourceAbort(command);
  try {
    let result;
    switch (command) {
      case 'ddp-sources': result = await listFredDdpSources({ directory }); break;
      case 'ddp-crosswalk': {
        const id = requireValue('crosswalk', '--crosswalk selects the original project mapping source.');
        const capture = await getFredDdpCrosswalk({ directory, crosswalkId: id });
        result = pageFredDdpCrosswalk(capture, { ...page(), release: flags.release ?? null, query: flags.query ?? '' }); break;
      }
      case 'ddp-crosswalk-file': {
        const id = requireValue('crosswalk', '--crosswalk selects the complete original mapping source.');
        requireValue('out', '--out selects the create-only original source destination.');
        const capture = await getFredDdpCrosswalk({ directory, crosswalkId: id });
        return { ...await exportResult(capture, flags.out), crosswalkId: id };
      }
      case 'ddp-crosswalk-import':
        need(flags.input || flags.crosswalk, 'Supply --input or continue its original operation with --crosswalk.');
        result = await importFredDdpCrosswalk({ ...common(),
          ...(flags.input ? { capture: await readJson(flags.input, MAX_DDP_CAPTURE_BYTES) } : {}),
          ...(flags.crosswalk ? { crosswalkId: flags.crosswalk } : {}) }); break;
      case 'ddp-crosswalk-acquire':
        result = await acquireFredDdpCrosswalk({ ...common(), signal: abort.signal,
          ...(flags.url ? { url: flags.url } : {}) }); break;
      case 'ddp-package': {
        const id = requireValue('package', '--package selects the original retained Board package.');
        const capture = await getFredDdpPackage({ directory, packageId: id });
        result = pageFredDdpPackage(capture, { ...planPage(), seriesId: flags.series ?? null,
          frequency: flags.frequency ?? null, query: flags.query ?? '' }); break;
      }
      case 'ddp-package-file': {
        const id = requireValue('package', '--package selects the complete original Board package.');
        requireValue('out', '--out selects the create-only original source destination.');
        const capture = await getFredDdpPackage({ directory, packageId: id });
        return { ...await exportResult(capture, flags.out), packageId: id };
      }
      case 'ddp-package-import':
        need(flags.input || flags.package, 'Supply --input or continue its original operation with --package.');
        result = await importFredDdpPackage({ ...common(),
          ...(flags.input ? { capture: await readJson(flags.input, MAX_DDP_CAPTURE_BYTES) } : {}),
          ...(flags.package ? { packageId: flags.package } : {}) }); break;
      case 'ddp-migration-preview':
        result = await previewFredDdpMigration({ ...await config(), directory, ...planPage() }); break;
      case 'ddp-migration-save':
        result = await saveFredDdpMigration({ ...await config(), ...common(),
          previewId: requireValue('preview-id', '--preview-id binds the exact full migration preview.') }); break;
      case 'ddp-migration':
        result = await getFredDdpMigration({ directory, ...planPage(),
          migrationId: requireValue('migration', '--migration selects the original saved plan.') }); break;
      case 'ddp-migration-file': {
        requireValue('out', '--out selects the complete plan destination.');
        const file = await downloadFredDdpMigration({ directory,
          migrationId: requireValue('migration', '--migration selects the complete original plan.') });
        return { ...await exportResult(file.body, flags.out), migrationId: file.migrationId, contentType: file.contentType };
      }
      case 'ddp-migration-acquire':
        result = await acquireFredDdpMigration({ ...common(), signal: abort.signal,
          migrationId: requireValue('migration', '--migration selects the complete reviewed package plan.') }); break;
      case 'ddp-receiving':
        result = await getFredDdpReceiving({ directory, ...page(),
          receivingId: requireValue('receiving', '--receiving selects the complete original comparison.'),
          changesOnly: boolean(flags['changes-only'], true), seriesId: flags.series ?? null }); break;
      case 'ddp-receiving-file': {
        requireValue('out', '--out selects the complete comparison-file destination.');
        const file = await downloadFredDdpReceiving({ directory,
          receivingId: requireValue('receiving', '--receiving selects the original comparison.'),
          format: requireValue('format', '--format selects json, csv or html.') });
        return { ...await exportResult(file.body, flags.out), receivingId: file.receivingId, contentType: file.contentType };
      }
    }
    return await exportResult(result, flags.out);
  } finally { abort.close(); }
}
export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.includes('--help') || ['help', '-h'].includes(args[0])) {
    console.log(FRED_DDP_PROJECT_USAGE); return;
  }
  const result = await runFredDdpProjectCommand(args);
  console.log(JSON.stringify(result, null, 2)); return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => {
    console.error(JSON.stringify({ code: error.code ?? 'FRED_DDP_PROJECT_COMMAND_FAILED', message: error.message }));
    process.exitCode = 1;
  });
