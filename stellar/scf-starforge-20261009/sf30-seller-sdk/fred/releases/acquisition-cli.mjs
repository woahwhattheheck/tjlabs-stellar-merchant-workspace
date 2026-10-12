#!/usr/bin/env node
// MIT. Native source acquisition, local receiving and complete release planning.
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { privateDirectory, atomicJson, readPrivateJson } from '../../routescan/quota.mjs';
import { MAX_CAPTURE_BYTES, canonical, need } from '../model.mjs';
import { captureFredReleases, inspectFredReleaseAcquisition, readFredReleaseCapture, storeFredReleaseCapture } from './source.mjs';
import { createFredReleaseWatch, validateFredReleaseWatch } from './watch.mjs';
import { planFredReleaseCatchUp, validateFredReleasePlan, pageFredReleasePlan } from './planner.mjs';

const HELP = 'FRED release source operations\n\n' +
  'capture --directory DIR --selection FILE [--key-env FRED_API_KEY]\n' +
  'status --directory DIR\n' +
  'inspect --capture FILE\n' +
  'receive --directory DIR --capture FILE\n' +
  'export --capture FILE --output FILE\n' +
  'watch --input FILE --output FILE\n' +
  'plan --watch FILE --after FILE [--before FILE] [--completed FILE] --output FILE\n' +
  'page --plan FILE [--section acquisitions|calendarChanges|vintageChanges|events|schedule] [--offset 0] [--limit 100]\n\n' +
  'Every output file contains the complete selected descriptor or original source capture.\n' +
  'Keep the existing private FRED API key in its configured environment variable; supply only its name.\n';
const usage = {
  capture: ['directory', 'selection', 'key-env'], status: ['directory'], inspect: ['capture'],
  receive: ['directory', 'capture'], export: ['capture', 'output'], watch: ['input', 'output'],
  plan: ['watch', 'after', 'before', 'completed', 'output'], page: ['plan', 'section', 'offset', 'limit'],
};
function parse(argv) {
  const command = argv[0];
  if (!command || ['help', '--help', '-h'].includes(command)) return { command: 'help', options: {} };
  need(Object.hasOwn(usage, command), 'Unknown FRED release source command.');
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    need(/^--[a-z-]+$/.test(name) && usage[command].includes(name.slice(2)) &&
      !Object.hasOwn(options, name.slice(2)) && typeof argv[index + 1] === 'string' && !argv[index + 1].startsWith('--'),
      'Supply each supported source option once with its value.');
    options[name.slice(2)] = argv[index + 1];
  }
  return { command, options };
}
const required = (options, name) => {
  need(typeof options[name] === 'string' && options[name].length > 0, 'Supply --' + name + '.');
  return options[name];
};
async function read(path) { return readPrivateJson(resolve(path), MAX_CAPTURE_BYTES * 2); }
async function retain(path, value) {
  path = resolve(path);
  const directory = await privateDirectory(dirname(path));
  try {
    await atomicJson(directory, basename(path), value, { exclusive: true });
    return { path, reused: false };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    need(canonical(await read(path)) === canonical(value), 'The selected output already contains another original file.', 'FRED_CAPTURE_CONFLICT', 409);
    return { path, reused: true };
  }
}
const number = (value, fallback, label) => {
  if (value === undefined) return fallback;
  need(/^(0|[1-9][0-9]*)$/.test(value), label + ' must be a whole decimal number.');
  const result = Number(value); need(Number.isSafeInteger(result), label + ' is too large.'); return result;
};
export async function runFredReleaseAcquisitionCli(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr,
  environment = process.env, signal, fetchImpl } = {}) {
  const { command, options } = parse(argv);
  if (command === 'help') { stdout.write(HELP); return null; }
  let result;
  if (command === 'capture') {
    const value = await captureFredReleases({ directory: required(options, 'directory'),
      selection: await read(required(options, 'selection')), apiKeyEnv: options['key-env'] ?? 'FRED_API_KEY',
      environment, signal, fetchImpl, onProgress: progress => { stderr.write(JSON.stringify({ sourceProgress: progress }) + '\n'); } });
    result = { directory: value.directory, captureFile: resolve(value.directory, 'capture.json'),
      captureSha256: value.capture.captureSha256, selection: value.capture.selection, reused: value.reused,
      rowCount: value.model.rowCount, source: value.model.source };
  } else if (command === 'status') {
    result = await inspectFredReleaseAcquisition({ directory: required(options, 'directory') });
  } else if (command === 'inspect') {
    result = (await readFredReleaseCapture(required(options, 'capture'))).model;
  } else if (command === 'receive') {
    const value = await storeFredReleaseCapture(required(options, 'directory'), (await readFredReleaseCapture(required(options, 'capture'))).capture);
    result = { directory: value.directory, captureSha256: value.capture.captureSha256, reused: value.reused, source: value.model.source };
  } else if (command === 'export') {
    const { capture } = await readFredReleaseCapture(required(options, 'capture'));
    result = { ...await retain(required(options, 'output'), capture), captureSha256: capture.captureSha256 };
  } else if (command === 'watch') {
    const watch = createFredReleaseWatch(await read(required(options, 'input')));
    result = { ...await retain(required(options, 'output'), watch), watchId: watch.id, watch };
  } else if (command === 'plan') {
    const watch = validateFredReleaseWatch(await read(required(options, 'watch')));
    const after = (await readFredReleaseCapture(required(options, 'after'))).capture;
    const before = options.before ? (await readFredReleaseCapture(options.before)).capture : null;
    const completedAsOf = options.completed ? await read(options.completed) : [];
    const plan = planFredReleaseCatchUp({ watch, before, after, completedAsOf });
    result = { ...await retain(required(options, 'output'), plan), planId: plan.id, watchId: plan.watchId,
      summary: plan.summary, coverage: plan.coverage, acquisitions: plan.acquisitions,
      requiredSourceSelections: plan.requiredSourceSelections };
  } else {
    const plan = validateFredReleasePlan(await read(required(options, 'plan')));
    result = pageFredReleasePlan(plan, { section: options.section ?? 'acquisitions',
      offset: number(options.offset, 0, 'Offset'), limit: number(options.limit, 100, 'Limit') });
  }
  stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runFredReleaseAcquisitionCli().catch(error => {
    process.stderr.write(JSON.stringify({ error: { code: error.code ?? 'FRED_RELEASE_COMMAND_FAILED',
      message: error.message, status: error.status ?? null, retryAt: error.retryAt ?? null } }) + '\n');
    process.exitCode = 1;
  });
}
