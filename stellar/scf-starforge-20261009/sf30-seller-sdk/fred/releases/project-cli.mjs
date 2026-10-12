#!/usr/bin/env node
// MIT. Native release project commands use the original project transaction.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { need, plain, MAX_CAPTURE_BYTES } from '../model.mjs';
import { hash, jsonBytes } from '../source.mjs';
import {
  listFredReleaseCaptures, getFredReleaseCapture, importFredReleaseCapture, acquireFredReleaseCapture,
  listFredReleaseWatches, saveFredReleaseWatch, previewFredReleasePlan, saveFredReleasePlan,
  getFredReleasePlan, downloadFredReleasePlan, acquireFredPlannedVintage,
} from '../project.mjs';

export const FRED_RELEASE_PROJECT_COMMANDS = Object.freeze([
  'release-captures', 'release-source', 'release-import', 'release-acquire',
  'release-watches', 'release-watch-save', 'release-plan-preview', 'release-plan-save',
  'release-plan', 'release-plan-file', 'release-vintage-acquire',
]);
export const FRED_RELEASE_PROJECT_USAGE = [
  'Release calendars and watched economic briefings',
  '',
  'starforge fred release-captures --project ABS [--out FILE]',
  'starforge fred release-source --project ABS --capture SHA [--out FILE]',
  'starforge fred release-import --project ABS --id ID --expected-revision N [--input FILE --capture SHA --out FILE]',
  'starforge fred release-acquire --project ABS --id ID --expected-revision N [--selection FILE --out FILE]',
  'starforge fred release-watches --project ABS [--out FILE]',
  'starforge fred release-watch-save --project ABS --id ID --expected-revision N --watch-config FILE [--out FILE]',
  'starforge fred release-plan-preview --project ABS --watch ID --after-capture SHA [--before-capture SHA --section NAME --offset N --limit N --out FILE]',
  'starforge fred release-plan-save --project ABS --id ID --expected-revision N --watch ID --after-capture SHA --preview-id SHA [--before-capture SHA --out FILE]',
  'starforge fred release-plan --project ABS --plan ID [--section NAME --offset N --limit N --out FILE]',
  'starforge fred release-plan-file --project ABS --plan ID --out FILE',
  'starforge fred release-vintage-acquire --project ABS --id ID --expected-revision N --plan ID --as-of DATE [--out FILE]',
  '',
  'Sections: acquisitions, calendarChanges, vintageChanges, events, schedule.',
  'The selection file contains the exact series, metadata date, calendar interval and vintage interval.',
  'The watch file contains name, series or templateId, observationStart, observationEnd, baselineAsOf and catchUp.',
  'An import begins with --input. Continue its original pending or completed operation with --capture and the same --id.',
  'An acquisition begins with --selection. The same pending operation can recover its retained selection.',
  'Each planned vintage is acquired explicitly, then uses the existing analyst review, template successor and publish commands.',
  'File outputs are create-only. SIGINT and SIGTERM interrupt source acquisition and retain its original progress.',
].join('\n');
const PAGING = ['section', 'offset', 'limit'];
const PLAN_SOURCE = ['watch', 'before-capture', 'after-capture'];
const MUTATION = ['id', 'expected-revision'];
const OPTIONS = Object.freeze({
  'release-captures': ['project', 'out'],
  'release-source': ['project', 'capture', 'out'],
  'release-import': ['project', ...MUTATION, 'input', 'capture', 'out'],
  'release-acquire': ['project', ...MUTATION, 'selection', 'out'],
  'release-watches': ['project', 'out'],
  'release-watch-save': ['project', ...MUTATION, 'watch-config', 'out'],
  'release-plan-preview': ['project', ...PLAN_SOURCE, ...PAGING, 'out'],
  'release-plan-save': ['project', ...MUTATION, ...PLAN_SOURCE, 'preview-id', 'out'],
  'release-plan': ['project', 'plan', ...PAGING, 'out'],
  'release-plan-file': ['project', 'plan', 'out'],
  'release-vintage-acquire': ['project', ...MUTATION, 'plan', 'as-of', 'out'],
});
const WATCH_FIELDS = ['name', 'series', 'templateId', 'observationStart', 'observationEnd', 'baselineAsOf',
  'catchUp', 'pageSize', 'maxRows'];
function parse(command, args) {
  const allowed = OPTIONS[command], flags = {};
  need(allowed, 'Choose an original release project command; use fred --help.');
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], name = flag.startsWith('--') ? flag.slice(2) : '';
    need(allowed.includes(name) && !Object.hasOwn(flags, name), 'Unknown or duplicate command option: ' + flag);
    need(typeof args[index + 1] === 'string' && args[index + 1].length > 0 &&
      !args[index + 1].startsWith('--'), 'A value is required for ' + flag + '.');
    flags[name] = args[++index];
  }
  need(flags.project, '--project selects the original private economic project.');
  return flags;
}
function integer(value, label, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  need(typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)),
    'Choose an integer ' + label + '.');
  return Number(value);
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
  if (!['release-acquire', 'release-vintage-acquire'].includes(command)) return { signal: undefined, close() {} };
  const controller = new AbortController();
  const interrupt = () => controller.abort(Object.assign(new Error('The original release source acquisition was interrupted.'), {
    code: 'FRED_CAPTURE_INTERRUPTED', status: 499 }));
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  return { signal: controller.signal, close() {
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
  } };
}
/** Return a result without printing. Cancellation also works through the installed fred dispatcher. */
export async function runFredReleaseProjectCommand(args) {
  const [command, ...rest] = args, flags = parse(command, rest), directory = resolve(flags.project);
  const common = () => ({ directory, id: flags.id,
    expectedRevision: integer(flags['expected-revision'], 'project revision') });
  const paging = () => ({ section: flags.section ?? 'acquisitions',
    offset: integer(flags.offset, 'plan offset', 0), limit: integer(flags.limit, 'plan page size', 100) });
  const source = () => {
    need(flags.watch && flags['after-capture'], '--watch and --after-capture select the original watched release sources.');
    return { directory, watchId: flags.watch, beforeCaptureId: flags['before-capture'] ?? null,
      afterCaptureId: flags['after-capture'] };
  };
  const abort = sourceAbort(command);
  try {
    let result;
    switch (command) {
      case 'release-captures': result = await listFredReleaseCaptures({ directory }); break;
      case 'release-source':
        need(flags.capture, '--capture selects the original project release source.');
        result = await getFredReleaseCapture({ directory, releaseCaptureId: flags.capture });
        if (flags.out) return { ...await exportResult(result, flags.out), releaseCaptureId: result.captureSha256 };
        break;
      case 'release-import':
        need(flags.input || flags.capture, 'Supply --input or continue the same original operation with --capture.');
        result = await importFredReleaseCapture({ ...common(),
          ...(flags.input ? { capture: await readJson(flags.input, MAX_CAPTURE_BYTES) } : {}),
          ...(flags.capture ? { releaseCaptureId: flags.capture } : {}) }); break;
      case 'release-acquire':
        result = await acquireFredReleaseCapture({ ...common(), signal: abort.signal,
          ...(flags.selection ? { selection: await readJson(flags.selection, 65536) } : {}) }); break;
      case 'release-watches': result = await listFredReleaseWatches({ directory }); break;
      case 'release-watch-save': {
        need(flags['watch-config'], '--watch-config selects the complete watched source settings.');
        const config = await readJson(flags['watch-config'], 65536);
        need(plain(config) && Object.keys(config).every(key => WATCH_FIELDS.includes(key)), 'Unknown release watch configuration field.');
        result = await saveFredReleaseWatch({ ...config, ...common() }); break;
      }
      case 'release-plan-preview': result = await previewFredReleasePlan({ ...source(), ...paging() }); break;
      case 'release-plan-save':
        need(flags['preview-id'], '--preview-id selects the original complete plan preview.');
        result = await saveFredReleasePlan({ ...source(), ...common(), previewId: flags['preview-id'] }); break;
      case 'release-plan':
        need(flags.plan, '--plan selects the saved release plan.');
        result = await getFredReleasePlan({ directory, planId: flags.plan, ...paging() }); break;
      case 'release-plan-file': {
        need(flags.plan && flags.out, '--plan and --out select the complete saved plan and create-only destination.');
        const file = await downloadFredReleasePlan({ directory, planId: flags.plan });
        return { ...await exportResult(file.body, flags.out), planId: file.planId,
          watchId: file.watchId, contentType: file.contentType };
      }
      case 'release-vintage-acquire':
        need(flags.plan && flags['as-of'], '--plan and --as-of choose one original planned observation vintage.');
        result = await acquireFredPlannedVintage({ ...common(), planId: flags.plan,
          asOf: flags['as-of'], signal: abort.signal }); break;
    }
    return await exportResult(result, flags.out);
  } finally { abort.close(); }
}
export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.includes('--help') || ['help', '-h'].includes(args[0])) {
    console.log(FRED_RELEASE_PROJECT_USAGE); return;
  }
  const result = await runFredReleaseProjectCommand(args);
  console.log(JSON.stringify(result, null, 2));
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => {
    console.error(JSON.stringify({ code: error.code ?? 'FRED_RELEASE_PROJECT_COMMAND_FAILED', message: error.message }));
    process.exitCode = 1;
  });
