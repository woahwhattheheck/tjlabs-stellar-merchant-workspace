#!/usr/bin/env node
// MIT. Complete document-evidence operations through an existing private IATI console.
import { connectIatiWorkspace } from './client.mjs';
import { constants } from 'node:fs';
import { open, lstat, realpath, link, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname, basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

const JSON_LIMIT = 64 * 1024 * 1024;
const PACKET_LIMIT = 4 * 1024 * 1024 * 1024;
const CHUNK = 1024 * 1024;
const SHA = /^[0-9a-f]{64}$/;
const ACTIONS = new Set(['save', 'note', 'observe', 'review', 'compare']);
const COMMANDS = {
  status: [], plan: ['id', 'revision'], history: ['id'], request: ['request-id'],
  rows: ['id', 'revision', 'offset', 'limit', 'expected-snapshot', 'all'],
  detail: ['id', 'revision', 'row-id', 'expected-snapshot'],
  observation: ['id'], comparison: ['id'], correction: ['id', 'revision'],
  save: ['file'], note: ['file'], observe: ['file'], review: ['file'], compare: ['file'],
  file: ['id', 'revision', 'kind', 'out'], body: ['observation-id', 'out'],
  export: ['id', 'revision', 'out'], receive: ['file', 'expected-sha256']
};
const HELP = [
  'Document evidence on the original IATI console',
  '',
  'node document_evidence_client_cli.mjs --connection-file PRIVATE_CONSOLE_FILE COMMAND [OPTIONS]',
  '',
  'Reads:',
  '  status',
  '  plan --id SHA [--revision N]',
  '  history --id SHA',
  '  request --request-id ORIGINAL_ID',
  '  rows --id SHA --revision N [--offset N --limit 1..500 --expected-snapshot SHA] [--all]',
  '  detail --id SHA --revision N --row-id SHA [--expected-snapshot SHA]',
  '  observation --id SHA',
  '  comparison --id SHA',
  '  correction --id SHA --revision N',
  '',
  'Complete JSON actions (up to 64 MiB; file includes the original requestId):',
  '  save|note|observe|review|compare --file ACTION.json',
  '',
  'Complete transfers:',
  '  file --id SHA --revision N --kind report|register|plan|correction --out FILE',
  '  body --observation-id SHA --out FILE',
  '  export --id SHA [--revision N] --out FILE',
  '  receive --file FILE [--expected-sha256 SHA]',
  '',
  'The original console owns acquisition and request recovery. An ACQUIRING',
  'receipt keeps its original requestId; use request to recover it.',
  'rows --all writes one complete JSON page per line and preserves one snapshot.',
  'Downloads verify native byte count and SHA-256, then create a new output file.',
  'Receive and export stream complete ZIPs up to 4 GiB. Receive preserves the',
  'selected imported plan and any later current receiving-note revision.',
  'Optional --timeout-ms 1..900000 uses the existing client timeout (default 240000).'
].join('\n');
const problem = (code, message, details) => Object.assign(new Error(message),
  { code: 'IATI_DOCUMENT_EVIDENCE_CLI_' + code, ...(details === undefined ? {} : { details }) });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function integer(value, name, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)
      || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > maximum)
    throw problem('ARGUMENT', 'Use an integer ' + name + ' from ' + minimum + ' to ' + maximum + '.');
  return Number(value);
}
function argumentsFor(argv) {
  let command;
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--help' || value === '-h') return { help: true };
    if (value.startsWith('--')) {
      const key = value.slice(2);
      if (Object.hasOwn(options, key)) throw problem('ARGUMENT', 'Supply --' + key + ' once.');
      if (key === 'all') options[key] = true;
      else {
        const next = argv[++index];
        if (next === undefined || next.startsWith('--')) throw problem('ARGUMENT', 'Supply a value for --' + key + '.');
        options[key] = next;
      }
    } else if (command === undefined && Object.hasOwn(COMMANDS, value)) command = value;
    else throw problem('ARGUMENT', 'Select one documented command and its explicit options.');
  }
  if (command === undefined) throw problem('ARGUMENT', 'Select a command, or use --help.');
  for (const key of Object.keys(options))
    if (!['connection-file', 'timeout-ms', ...COMMANDS[command]].includes(key))
      throw problem('ARGUMENT', '--' + key + ' does not belong to ' + command + '.');
  if (!options['connection-file']) throw problem('ARGUMENT', 'Select the original private --connection-file.');
  return { command, options };
}
function requireOption(options, key) {
  if (typeof options[key] !== 'string' || options[key].length === 0)
    throw problem('ARGUMENT', 'Supply --' + key + '.');
  return options[key];
}
const selectedRevision = (options, required = false) =>
  required || options.revision !== undefined ? integer(requireOption(options, 'revision'), 'revision') : undefined;
const sameFile = (first, next) => next.isFile() && first.dev === next.dev && first.ino === next.ino
  && first.size === next.size && first.mtimeNs === next.mtimeNs && first.ctimeNs === next.ctimeNs;

async function originalInput(filename, maximum) {
  const path = resolve(filename), selected = await lstat(path, { bigint: true });
  if (!selected.isFile() || selected.size < 1n || selected.size > BigInt(maximum))
    throw problem('INPUT_FILE', 'Select a complete regular input file within its declared size limit.');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat({ bigint: true });
    if (!sameFile(selected, info)) throw problem('INPUT_CHANGED', 'The original input changed while opening.');
    return { path, handle, info, bytes: Number(info.size) };
  } catch (error) { await handle.close(); throw error; }
}
async function unchanged(input, position) {
  const extra = await input.handle.read(Buffer.alloc(1), 0, 1, position);
  const after = await input.handle.stat({ bigint: true });
  const attached = await lstat(input.path, { bigint: true });
  if (extra.bytesRead || !sameFile(input.info, after) || !sameFile(input.info, attached))
    throw problem('INPUT_CHANGED', 'The complete original input changed during its read.');
}
async function actionFile(filename) {
  const input = await originalInput(filename, JSON_LIMIT);
  try {
    const bytes = Buffer.alloc(input.bytes);
    let position = 0;
    while (position < bytes.length) {
      const read = await input.handle.read(bytes, position, Math.min(CHUNK, bytes.length - position), position);
      if (!read.bytesRead) throw problem('INPUT_CHANGED', 'The original action file ended before its declared size.');
      position += read.bytesRead;
    }
    await unchanged(input, position);
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw problem('ACTION_FILE', 'Supply one complete UTF-8 JSON action object.'); }
    if (!plain(value)) throw problem('ACTION_FILE', 'The complete action file must contain one native request object.');
    return value;
  } finally { await input.handle.close(); }
}
async function writeJson(value, pretty = true) {
  const data = JSON.stringify(value, null, pretty ? 2 : undefined) + '\n';
  await new Promise((done, failed) => {
    const onError = error => failed(error);
    process.stdout.once('error', onError);
    process.stdout.write(data, error => {
      if (error) failed(error);
      else { process.stdout.off('error', onError); done(); }
    });
  });
}
function nativeDescriptor(response, maximum, expected) {
  const length = response.headers.get('content-length'), sha256 = response.headers.get('x-content-sha256');
  if (!/^(0|[1-9][0-9]*)$/.test(length ?? '') || !Number.isSafeInteger(Number(length))
      || Number(length) > maximum || typeof sha256 !== 'string' || !SHA.test(sha256))
    throw problem('FILE_DESCRIPTOR', 'The native response must declare its complete byte count and SHA-256.');
  const selected = { bytes: Number(length), sha256 };
  if (expected && (selected.bytes !== expected.bytes || selected.sha256 !== expected.sha256))
    throw problem('FILE_CHANGED', 'The native response differs from the selected observation body descriptor.');
  return selected;
}
async function download(response, filename, maximum, expected) {
  let handle, temporary;
  try {
    const descriptor = nativeDescriptor(response, maximum, expected);
    const requested = resolve(filename), directory = await realpath(dirname(requested));
    const destination = join(directory, basename(requested));
    try {
      await lstat(destination);
      throw problem('OUTPUT_EXISTS', 'Select a new output path; the existing file is retained.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    temporary = join(directory, '.iati-document-evidence-' + randomUUID() + '.partial');
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    const digest = createHash('sha256');
    let bytes = 0;
    for await (const chunk of response.body ?? []) {
      const data = Buffer.from(chunk);
      bytes += data.length;
      if (bytes > descriptor.bytes) throw problem('FILE_CHANGED', 'The response exceeds its complete native byte count.');
      digest.update(data);
      let written = 0;
      while (written < data.length) {
        const part = await handle.write(data, written, data.length - written);
        if (!part.bytesWritten) throw problem('OUTPUT_FILE', 'The complete output could not be written.');
        written += part.bytesWritten;
      }
    }
    const sha256 = digest.digest('hex');
    if (bytes !== descriptor.bytes || sha256 !== descriptor.sha256)
      throw problem('FILE_CHANGED', 'The response did not match its complete native byte count and SHA-256.');
    await handle.sync(); await handle.close(); handle = undefined;
    // A hard link publishes the verified complete file without replacing any existing path.
    await link(temporary, destination);
    const parent = await open(directory, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
    try { await parent.sync(); } finally { await parent.close(); }
    return { file: destination, bytes, sha256, contentType: response.headers.get('content-type') || 'application/octet-stream' };
  } finally {
    await handle?.close();
    if (temporary) await unlink(temporary).catch(() => {});
    if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}
async function receivePacket(api, filename, expectedSha256, options) {
  if (expectedSha256 !== undefined && !SHA.test(expectedSha256))
    throw problem('ARGUMENT', 'Use the complete lowercase --expected-sha256.');
  const input = await originalInput(filename, PACKET_LIMIT);
  let source, complete = false, inputSha256;
  try {
    if (expectedSha256 !== undefined) {
      const selected = createHash('sha256');
      let position = 0;
      const buffer = Buffer.alloc(CHUNK);
      while (position < input.bytes) {
        options.signal?.throwIfAborted();
        const read = await input.handle.read(buffer, 0, Math.min(buffer.length, input.bytes - position), position);
        if (!read.bytesRead) throw problem('INPUT_CHANGED', 'The selected complete ZIP ended before its declared size.');
        selected.update(buffer.subarray(0, read.bytesRead)); position += read.bytesRead;
      }
      await unchanged(input, position);
      if (selected.digest('hex') !== expectedSha256)
        throw problem('INPUT_CHANGED', 'The selected ZIP differs from --expected-sha256 before receiving.');
    }
    source = Readable.from((async function* () {
      const digest = createHash('sha256');
      let position = 0;
      while (position < input.bytes) {
        options.signal?.throwIfAborted();
        // Own each yielded buffer until the original carrier finishes with it.
        const buffer = Buffer.alloc(Math.min(CHUNK, input.bytes - position));
        const read = await input.handle.read(buffer, 0, buffer.length, position);
        if (!read.bytesRead) throw problem('INPUT_CHANGED', 'The complete ZIP ended before its declared size.');
        const chunk = buffer.subarray(0, read.bytesRead);
        position += read.bytesRead; digest.update(chunk); yield chunk;
      }
      await unchanged(input, position);
      inputSha256 = digest.digest('hex');
      if (expectedSha256 !== undefined && inputSha256 !== expectedSha256)
        throw problem('INPUT_CHANGED', 'The streamed ZIP differs from its selected SHA-256.');
      complete = true;
    })(), { objectMode: false, highWaterMark: CHUNK });
    const consumed = finished(source, { cleanup: true });
    // Attach both outcomes before dispatch so an early transport or input error
    // cannot leave an unobserved stream rejection or a second implicit send.
    const received = Promise.resolve().then(() => api.receive({ body: source, bytes: input.bytes }, options))
      .catch(error => { source.destroy(error); throw error; });
    const [native] = await Promise.all([received, consumed]);
    if (!complete || native?.packet?.bytes !== input.bytes || native?.packet?.sha256 !== inputSha256)
      throw problem('RECEIVING_DESCRIPTOR', 'Reconcile the complete native receiving result and original streamed ZIP identity.',
        { native, input: { bytes: input.bytes, sha256: inputSha256 ?? null, complete } });
    return native;
  } finally { source?.destroy(); await input.handle.close(); }
}

/** Runs one requested operation and closes only this borrowed connection. */
export async function runDocumentEvidenceCli(argv = process.argv.slice(2)) {
  const parsed = argumentsFor(argv);
  if (parsed.help) { process.stdout.write(HELP + '\n'); return; }
  const { command, options } = parsed;
  const controller = new AbortController();
  let client, context = { action: command };
  const interrupt = () => controller.abort(problem('INTERRUPTED', 'The requested local connection was interrupted.'));
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    client = await connectIatiWorkspace({ consoleUrlFile: requireOption(options, 'connection-file'),
      ...(options['timeout-ms'] === undefined ? {} : { timeoutMs: integer(options['timeout-ms'], 'timeout-ms', 1, 900000) }) });
    const api = client.documentEvidence;
    if (!api) throw problem('INSTALLATION', 'Use the complete IATI client with its original documentEvidence integration.');
    const requestOptions = { signal: controller.signal };
    if (['file', 'body', 'export'].includes(command)) requireOption(options, 'out');
    let value;
    if (ACTIONS.has(command)) {
      const input = await actionFile(requireOption(options, 'file'));
      context = { action: command, requestId: input.requestId };
      value = await api[command](input, requestOptions);
    } else switch (command) {
      case 'status': value = await api.status(requestOptions); break;
      case 'plan': value = await api.plan(requireOption(options, 'id'), { ...requestOptions, revision: selectedRevision(options) }); break;
      case 'history': value = await api.history(requireOption(options, 'id'), requestOptions); break;
      case 'request': value = await api.request(requireOption(options, 'request-id'), requestOptions); break;
      case 'rows': {
        const input = { revision: selectedRevision(options, true),
          ...(options.offset === undefined ? {} : { offset: integer(options.offset, 'offset', 0) }),
          ...(options.limit === undefined ? {} : { limit: integer(options.limit, 'limit', 1, 500) }),
          ...(options['expected-snapshot'] === undefined ? {} : { expectedSnapshot: options['expected-snapshot'] }) };
        if (options.all) {
          for await (const page of api.rowPages(requireOption(options, 'id'), input, requestOptions)) await writeJson(page, false);
          return;
        }
        value = await api.rows(requireOption(options, 'id'), input, requestOptions); break;
      }
      case 'detail':
        value = await api.detail(requireOption(options, 'id'), { revision: selectedRevision(options, true),
          rowId: requireOption(options, 'row-id'),
          ...(options['expected-snapshot'] === undefined ? {} : { expectedSnapshot: options['expected-snapshot'] }) }, requestOptions); break;
      case 'observation': value = await api.observation(requireOption(options, 'id'), requestOptions); break;
      case 'comparison': value = await api.comparison(requireOption(options, 'id'), requestOptions); break;
      case 'correction':
        value = await api.correction(requireOption(options, 'id'), { ...requestOptions, revision: selectedRevision(options, true) }); break;
      case 'file': {
        const id = requireOption(options, 'id'), revision = selectedRevision(options, true), kind = requireOption(options, 'kind');
        const response = await api.file(id, kind, { ...requestOptions, revision });
        value = { ...await download(response, requireOption(options, 'out'), JSON_LIMIT), evidence: id, revision, kind }; break;
      }
      case 'body': {
        const observationId = requireOption(options, 'observation-id');
        const observation = await api.observation(observationId, requestOptions);
        if (observation?.id !== observationId || !plain(observation.body)
            || typeof observation.body.complete !== 'boolean' || typeof observation.documentComplete !== 'boolean')
          throw problem('BODY', 'Select an observation with its retained body descriptor.');
        const response = await api.body(observationId, requestOptions);
        value = { ...await download(response, requireOption(options, 'out'), JSON_LIMIT, observation.body),
          observationId, bodyComplete: observation.body.complete, documentComplete: observation.documentComplete,
          bodyDescriptor: observation.body, observation }; break;
      }
      case 'export': {
        const id = requireOption(options, 'id');
        let revision = selectedRevision(options);
        if (revision === undefined) {
          const current = await api.plan(id, requestOptions);
          if (current?.id !== id || !Number.isSafeInteger(current.revision) || current.revision < 1)
            throw problem('SELECTION', 'The original console returned no complete current evidence plan.');
          revision = current.revision;
        }
        const response = await api.export(id, { ...requestOptions, revision });
        value = { ...await download(response, requireOption(options, 'out'), PACKET_LIMIT), evidence: id, revision }; break;
      }
      case 'receive':
        value = await receivePacket(api, requireOption(options, 'file'), options['expected-sha256'], requestOptions); break;
    }
    await writeJson(value);
    return value;
  } catch (error) {
    if (error && typeof error === 'object') error.operation = context;
    throw error;
  } finally {
    await client?.dispose();
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runDocumentEvidenceCli().catch(error => {
    process.stderr.write(JSON.stringify({ error: {
      code: error.code ?? 'IATI_DOCUMENT_EVIDENCE_CLI_ERROR', message: String(error.message ?? error),
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.details === undefined ? {} : { details: error.details }),
      ...(error.operation === undefined ? {} : { operation: error.operation })
    } }, null, 2) + '\n');
    process.exitCode = error.code === 'IATI_DOCUMENT_EVIDENCE_CLI_INTERRUPTED' ? 130 : 1;
  });
}
