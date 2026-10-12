#!/usr/bin/env node
/**
 * Native operator over the original Pricing, Tariffs and Performance owners.
 * Complete JSON inputs and original request identities are passed to those owners.
 */
import {readFile, mkdir, open, link, unlink, lstat} from 'node:fs/promises';
import {resolve, dirname, basename, join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {openWorkspace} from '../workspace/model.mjs';
import {openTariffWorkspace} from '../tariffs/workspace.mjs';
import {openPerformanceWorkspace} from './workspace.mjs';
import {startPerformanceServer} from './server.mjs';

export const HELP = [
  'Merchant performance workspace',
  '',
  'Usage:',
  '  merchant-performance [command] --config SELLER_JSON --state PRICING_DIRECTORY [options]',
  '  node performance/cli.mjs [command] --config SELLER_JSON --state PRICING_DIRECTORY [options]',
  '',
  'The default command is serve. Use the original Pricing state directory.',
  '',
  'Original source options:',
  '  --snapshot FILE       Original seller snapshot',
  '  --history FILE        Original captured observation history',
  '  --ops-url URL         Existing loopback operations service',
  '  Supply snapshot and/or history files, or one operations URL.',
  '',
  'Original Pricing integration options:',
  '  --native-outbox PATH  --source-package PATH  --release-store PATH',
  '  --release-runtime FILE  Original release runtime JSON object',
  '',
  'Commands:',
  '  serve [--port NUMBER]             Start the local console; port defaults to 0',
  '  state                             Current Pricing, Tariff and Performance state',
  '  sources [--after ID --limit N]     Saved usage source versions',
  '  source --version ID               Reopen an original usage source',
  '  service-periods [--after ID --limit N]',
  '                                    List captured service periods',
  '  service-period-capture --input FILE',
  '  service-period-capture --opening FILE --closing FILE --request-id UUID --label TEXT',
  '                                    Retain a complete original snapshot pair',
  '  preview --input FILE              Review selected tariff against saved usage',
  '  save --input FILE                 Save the reviewed inputs and performance SHA',
  '  list [--after ID --limit N]        List saved performance reviews',
  '  load --performance ID             Reopen a saved performance review',
  '  capture --performance ID          Export its complete portable source envelope',
  '  download --performance ID --name FILE --output PATH',
  '                                    FILE: source.json, review.json, review.html, usage.csv',
  '  inspect --input FILE              Inspect a complete portable source envelope',
  '  receive --input FILE              Retain the complete original portable source',
  '  proposal --input FILE             Preview a volume-based pricing proposal',
  '  proposal-save --input FILE        Save the reviewed proposal and its request UUID',
  '  proposal-commit --input FILE      Commit through the original selection and Pricing owners',
  '',
  'JSON commands print the complete result or write --output PATH create-only.',
  '--input - reads one complete JSON object from stdin. Downloads require --output.',
  'Preserve original request UUIDs, source IDs and reviewed hashes when resuming.',
  'The private serve launch URL is printed only to this console.',
  ''
].join('\n');

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
    this.code = 'PERFORMANCE_CLI_USAGE';
  }
}
const COMMON_FLAGS = new Set([
  'config', 'state', 'snapshot', 'history', 'ops-url',
  'native-outbox', 'source-package', 'release-store', 'release-runtime'
]);
const COMMAND_FLAGS = Object.freeze({
  serve: new Set(['port']),
  state: new Set(['output']),
  sources: new Set(['after', 'limit', 'output']),
  source: new Set(['version', 'output']),
  'service-periods': new Set(['after', 'limit', 'output']),
  'service-period-capture': new Set(['input', 'opening', 'closing', 'request-id', 'label', 'output']),
  preview: new Set(['input', 'output']),
  save: new Set(['input', 'output']),
  list: new Set(['after', 'limit', 'output']),
  load: new Set(['performance', 'output']),
  capture: new Set(['performance', 'output']),
  download: new Set(['performance', 'name', 'output']),
  inspect: new Set(['input', 'output']),
  receive: new Set(['input', 'output']),
  proposal: new Set(['input', 'output']),
  'proposal-save': new Set(['input', 'output']),
  'proposal-commit': new Set(['input', 'output'])
});
const INPUT_COMMANDS = new Set([
  'preview', 'save', 'inspect', 'receive', 'proposal', 'proposal-save', 'proposal-commit'
]);
const DOWNLOAD_NAMES = new Set(['source.json', 'review.json', 'review.html', 'usage.csv']);

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.some(value => typeof value !== 'string')) {
    throw new UsageError('Arguments must be an array of strings');
  }
  if (argv.includes('--help') || argv.includes('-h') || argv[0] === 'help') return {help: true};
  const pending = argv.slice();
  const command = pending.length && !pending[0].startsWith('-') ? pending.shift() : 'serve';
  if (!Object.hasOwn(COMMAND_FLAGS, command)) throw new UsageError('Unknown command: ' + command);
  const flags = Object.create(null);
  while (pending.length) {
    const word = pending.shift();
    if (!word.startsWith('--') || word === '--') throw new UsageError('Unexpected argument: ' + word);
    const separator = word.indexOf('=');
    const name = word.slice(2, separator === -1 ? undefined : separator);
    if (!COMMON_FLAGS.has(name) && !COMMAND_FLAGS[command].has(name)) {
      throw new UsageError('Unsupported option for ' + command + ': --' + name);
    }
    if (Object.hasOwn(flags, name)) throw new UsageError('Option repeated: --' + name);
    const value = separator === -1 ? pending.shift() : word.slice(separator + 1);
    if (typeof value !== 'string' || value === '' || value.startsWith('--')) {
      throw new UsageError('A value is required for --' + name);
    }
    flags[name] = value;
  }
  for (const name of ['config', 'state']) if (!flags[name]) throw new UsageError('--' + name + ' is required');
  if (!flags.snapshot && !flags.history && !flags['ops-url']) {
    throw new UsageError('Supply --snapshot and/or --history, or --ops-url');
  }
  if (flags['ops-url'] && (flags.snapshot || flags.history)) {
    throw new UsageError('Use the operations URL or the saved snapshot/history source selection');
  }
  if (INPUT_COMMANDS.has(command) && !flags.input) throw new UsageError('--input is required for ' + command);
  if (command === 'source' && !flags.version) throw new UsageError('--version is required for source');
  if (['load', 'capture', 'download'].includes(command) && !flags.performance) {
    throw new UsageError('--performance is required for ' + command);
  }
  if (command === 'service-period-capture') {
    const parts = ['opening', 'closing', 'request-id', 'label'];
    if (flags.input && parts.some(name => flags[name] !== undefined)) {
      throw new UsageError('Use --input or the complete --opening, --closing, --request-id and --label set');
    }
    if (!flags.input && parts.some(name => !flags[name])) {
      throw new UsageError('Capture requires --input or --opening, --closing, --request-id and --label');
    }
    if (flags.opening === '-' || flags.closing === '-') {
      throw new UsageError('For a complete snapshot pair on stdin, use --input -');
    }
  }
  if (command === 'download') {
    if (!DOWNLOAD_NAMES.has(flags.name)) throw new UsageError('--name must be source.json, review.json, review.html or usage.csv');
    if (!flags.output) throw new UsageError('--output is required for download');
  }
  if (flags.port !== undefined && (!/^(0|[1-9][0-9]*)$/.test(flags.port) || Number(flags.port) > 65535)) {
    throw new UsageError('--port must be an integer from 0 through 65535');
  }
  if (flags.limit !== undefined && (!/^[1-9][0-9]*$/.test(flags.limit) || !Number.isSafeInteger(Number(flags.limit)))) {
    throw new UsageError('--limit must be a positive safe integer');
  }
  return {command, flags, help: false};
}

async function readText(filename) {
  let bytes;
  if (filename === '-') {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    bytes = Buffer.concat(chunks);
  } else bytes = await readFile(resolve(filename));
  try { return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes); }
  catch { throw new UsageError('Input must contain complete UTF-8 text'); }
}
async function readInput(filename) {
  const raw = await readText(filename);
  let value;
  try { value = JSON.parse(raw); }
  catch (cause) { throw new UsageError('Input is not valid JSON: ' + cause.message); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UsageError('Input must be one JSON object');
  }
  return value;
}
/** Publish a complete file atomically; an existing output is always preserved. */
async function writeCreateOnly(filename, content) {
  const target = resolve(filename);
  const parent = dirname(target);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const temporary = join(parent, '.' + basename(target) + '.performance-' + randomUUID() + '.tmp');
  let created = false;
  let failure;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    created = true;
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    // A hard link creates the destination only when it does not already exist.
    await link(temporary, target);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (created) {
      try { await unlink(temporary); }
      catch (error) {
        if (error.code !== 'ENOENT' && !failure) throw error;
      }
    }
  }
}

function writeText(stream, text) {
  return new Promise(function (resolveWrite, rejectWrite) {
    stream.write(text, function (error) { if (error) rejectWrite(error); else resolveWrite(); });
  });
}

async function requireUnusedOutput(filename) {
  if (!filename) return;
  try { await lstat(resolve(filename)); }
  catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const error = new Error('Output already exists: ' + resolve(filename));
  error.code = 'EEXIST';
  throw error;
}

async function emitJson(value, output) {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) throw new Error('The workspace operation returned no JSON result');
  const text = serialized + '\n';
  if (output) {
    try { await writeCreateOnly(output, text); }
    catch (error) {
      // The original workspace operation already returned. Keep its full result
      // available even if the selected output volume or path cannot receive it.
      error.operationResult = value;
      throw error;
    }
  } else await writeText(process.stdout, text);
}

async function workspaceOptions(flags) {
  const result = {
    config: resolve(flags.config),
    directory: resolve(flags.state)
  };
  const paths = {
    snapshot: 'snapshot',
    history: 'history',
    'native-outbox': 'nativeOutbox',
    'source-package': 'sourcePackage',
    'release-store': 'releaseStore'
  };
  for (const [flag, property] of Object.entries(paths)) {
    if (flags[flag] !== undefined) result[property] = resolve(flags[flag]);
  }
  if (flags['ops-url'] !== undefined) result.opsUrl = flags['ops-url'];
  if (flags['release-runtime'] !== undefined) {
    result.releaseRuntime = await readInput(resolve(flags['release-runtime']));
  }
  return result;
}

async function serveUntilClosed(workspace, port) {
  const running = await startPerformanceServer({ workspace, port });
  let closing = false;
  let resolveFinished;
  let rejectFinished;
  const finished = new Promise(function (resolvePromise, rejectPromise) {
    resolveFinished = resolvePromise;
    rejectFinished = rejectPromise;
  });
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const cleanup = function () {
    for (const signal of signals) process.removeListener(signal, stop);
    running.server.removeListener('close', onClosed);
    running.server.removeListener('error', onError);
  };
  const onClosed = function () { cleanup(); resolveFinished(); };
  const onError = function (error) {
    cleanup();
    Promise.resolve(running.close()).finally(function () { rejectFinished(error); }).catch(function () {});
  };
  const stop = function () {
    if (closing) return;
    closing = true;
    Promise.resolve().then(function () { return running.close(); }).then(function () {
      cleanup();
      resolveFinished();
    }, function (error) {
      cleanup();
      rejectFinished(error);
    });
  };
  running.server.once('close', onClosed);
  running.server.once('error', onError);
  for (const signal of signals) process.once(signal, stop);
  try {
    await writeText(process.stdout, running.url + '\n');
    await finished;
  } finally {
    cleanup();
    if (running.server.listening) await running.close();
  }
}


export async function runPerformanceCli(argv = process.argv.slice(2)) {
  const parsed = parseArguments(argv);
  if (parsed.help) { await writeText(process.stdout, HELP); return; }
  const {command, flags} = parsed;
  await requireUnusedOutput(flags.output);
  let input = flags.input ? await readInput(flags.input) : undefined;
  if (command === 'service-period-capture' && !flags.input) {
    const [opening, closing] = await Promise.all([readText(flags.opening), readText(flags.closing)]);
    input = {
      requestId: flags['request-id'], label: flags.label,
      opening: {name: basename(flags.opening), text: opening},
      closing: {name: basename(flags.closing), text: closing}
    };
  }
  const directory = resolve(flags.state);
  const model = await openWorkspace(await workspaceOptions(flags));
  const tariffs = await openTariffWorkspace({model, directory});
  const workspace = await openPerformanceWorkspace({model, tariffs, directory});
  if (command === 'serve') {
    await serveUntilClosed(workspace, flags.port === undefined ? 0 : Number(flags.port));
    return;
  }
  const page = {
    ...(flags.after === undefined ? {} : {after: flags.after}),
    ...(flags.limit === undefined ? {} : {limit: Number(flags.limit)})
  };
  let result;
  switch (command) {
    case 'state': result = await workspace.state(); break;
    case 'sources': result = await workspace.sources(page); break;
    case 'source': result = await workspace.source(flags.version); break;
    case 'service-periods': result = await workspace.servicePeriods(page); break;
    case 'service-period-capture': result = await workspace.captureServicePeriod(input); break;
    case 'preview': result = await workspace.preview(input); break;
    case 'save': result = await workspace.save(input); break;
    case 'list': result = await workspace.list(page); break;
    case 'load': result = await workspace.load(flags.performance); break;
    case 'capture': result = await workspace.capture(flags.performance); break;
    case 'download': {
      const bytes = await workspace.download(flags.performance, flags.name);
      if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new Error('The workspace download did not return bytes');
      await writeCreateOnly(flags.output, bytes);
      return {path: resolve(flags.output), name: flags.name, bytes: bytes.length};
    }
    case 'inspect': result = await workspace.inspect(input); break;
    case 'receive': result = await workspace.receive(input); break;
    case 'proposal': result = await workspace.proposal(input); break;
    case 'proposal-save': result = await workspace.saveProposal(input); break;
    case 'proposal-commit': result = await workspace.commitProposal(input); break;
    default: throw new UsageError('Unknown command: ' + command);
  }
  await emitJson(result, flags.output);
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  runPerformanceCli().catch(async error => {
    const detail = {
      code: typeof error.code === 'string' ? error.code : 'PERFORMANCE_CLI_FAILED',
      message: error.message || String(error)
    };
    if (Number.isInteger(error.status)) detail.status = error.status;
    if (error.details !== undefined) detail.details = error.details;
    const failure = {error: detail};
    if (Object.hasOwn(error, 'operationResult')) failure.operationResult = error.operationResult;
    try { await writeText(process.stderr, JSON.stringify(failure) + '\n'); }
    finally { process.exitCode = 1; }
  });
}
