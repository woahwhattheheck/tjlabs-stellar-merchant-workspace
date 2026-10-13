// MIT. Complete public facilitator documents and original SDK interpretation.
import {constants} from 'node:fs';
import {open, mkdir, realpath, link, unlink} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';

export const SUPPORTED_RESPONSE_SCHEMA = 'stellar-forge.facilitator-supported-response.v1';
export const MAX_SUPPORTED_RESPONSE_BYTES = 262144;
export const MAX_SUPPORTED_DOCUMENT_BYTES = 393216;
const HASH = /^[a-f0-9]{64}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ordered = value => Array.isArray(value) ? value.map(ordered) : plain(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const sha = value => createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(ordered(value));
const fail = (code, message) => Object.assign(new Error(message), {code});
function exact(value, keys) {
  if (!plain(value) || Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value, key)))
    throw fail('FACILITATOR_RESPONSE_DOCUMENT', 'Use the complete supported-response document fields.');
}
function endpoint(value) {
  if (typeof value !== 'string' || value.length > 2048)
    throw fail('FACILITATOR_RESPONSE_URL', 'Supply the complete public supported endpoint.');
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/supported') ||
      url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1'))
    throw fail('FACILITATOR_RESPONSE_URL', 'Use a credential-free HTTPS supported endpoint or an explicit loopback endpoint.');
  return url.href;
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)))
    throw fail('FACILITATOR_RESPONSE_TIME', 'Record the retrieval time as a UTC ISO timestamp.');
  const normalized = new Date(value).toISOString();
  if (normalized.slice(0, 19) !== value.slice(0, 19))
    throw fail('FACILITATOR_RESPONSE_TIME', 'Use a valid UTC calendar time.');
  return normalized;
}
function sourceLabel(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\x00-\x1f\x7f]/.test(value))
    throw fail('FACILITATOR_RESPONSE_SOURCE', 'Name the source retrieval in one line, up to 240 characters.');
  return value.trim();
}
function contentType(value) {
  if (typeof value !== 'string' || value.length > 240 || /[\x00-\x1f\x7f]/.test(value) ||
      !/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/i.test(value.split(';', 1)[0].trim()))
    throw fail('FACILITATOR_RESPONSE_TYPE', 'Use the original JSON content type.');
  return value;
}
export function createSupportedResponse({url, startedAt, completedAt, source, body,
  contentType: type = 'application/json'} = {}) {
  if (!(typeof body === 'string' || body instanceof Uint8Array))
    throw fail('FACILITATOR_RESPONSE_BODY', 'Supply the complete UTF-8 text or original response bytes.');
  const bytes = Buffer.from(body);
  const content = {schema:SUPPORTED_RESPONSE_SCHEMA, url:endpoint(url),
    retrieved:{startedAt:instant(startedAt), completedAt:instant(completedAt), source:sourceLabel(source)},
    body:{encoding:'base64', bytes:bytes.length, sha256:sha(bytes), contentType:contentType(type), data:bytes.toString('base64')}};
  return normalizeSupportedResponse({...content, id:sha(stable(content))});
}
export function normalizeSupportedResponse(value, {expectedUrl} = {}) {
  exact(value, ['schema','id','url','retrieved','body']);
  exact(value.retrieved, ['startedAt','completedAt','source']);
  exact(value.body, ['encoding','bytes','sha256','contentType','data']);
  if (value.schema !== SUPPORTED_RESPONSE_SCHEMA || !HASH.test(value.id) ||
      endpoint(value.url) !== value.url || instant(value.retrieved.startedAt) !== value.retrieved.startedAt ||
      instant(value.retrieved.completedAt) !== value.retrieved.completedAt ||
      Date.parse(value.retrieved.completedAt) < Date.parse(value.retrieved.startedAt) ||
      sourceLabel(value.retrieved.source) !== value.retrieved.source)
    throw fail('FACILITATOR_RESPONSE_DOCUMENT', 'The supported-response identity or retrieval fields changed.');
  if (expectedUrl !== undefined && value.url !== endpoint(expectedUrl))
    throw fail('FACILITATOR_RESPONSE_PROVIDER', 'The received endpoint differs from the selected host provider.');
  if (value.body.encoding !== 'base64' || !Number.isSafeInteger(value.body.bytes) ||
      value.body.bytes < 1 || value.body.bytes > MAX_SUPPORTED_RESPONSE_BYTES ||
      !HASH.test(value.body.sha256) || typeof value.body.data !== 'string' ||
      value.body.data.length > Math.ceil(MAX_SUPPORTED_RESPONSE_BYTES / 3) * 4)
    throw fail('FACILITATOR_RESPONSE_BODY', 'Receive one complete supported body from 1 byte through 256 KiB.');
  contentType(value.body.contentType);
  const bytes = Buffer.from(value.body.data, 'base64');
  if (bytes.toString('base64') !== value.body.data || bytes.length !== value.body.bytes || sha(bytes) !== value.body.sha256)
    throw fail('FACILITATOR_RESPONSE_BODY', 'The complete received body differs from its original byte identity.');
  const {id, ...content} = value;
  if (sha(stable(content)) !== id || Buffer.byteLength(JSON.stringify(value)) > MAX_SUPPORTED_DOCUMENT_BYTES)
    throw fail('FACILITATOR_RESPONSE_DOCUMENT', 'The complete received document differs from its identity.');
  return structuredClone(value);
}
export function supportedResponseBytes(value) {
  return Buffer.from(normalizeSupportedResponse(value).body.data, 'base64');
}
export function supportedResponseSummary(value) {
  const checked = normalizeSupportedResponse(value);
  return {id:checked.id, url:checked.url, retrieved:checked.retrieved,
    body:{bytes:checked.body.bytes, sha256:checked.body.sha256, contentType:checked.body.contentType}};
}
async function regularBytes(path, maximum) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await file.stat({bigint:true});
    if (!before.isFile() || before.size > BigInt(maximum))
      throw fail('FACILITATOR_RESPONSE_FILE', 'Use a complete regular response file within its byte limit.');
    const bytes = await file.readFile(), after = await file.stat({bigint:true});
    if (BigInt(bytes.length) !== before.size || before.size !== after.size || before.mtimeNs !== after.mtimeNs)
      throw fail('FACILITATOR_RESPONSE_FILE_CHANGED', 'The response file changed during its read.');
    return bytes;
  } finally { await file.close(); }
}
export async function readSupportedResponse(path) {
  const bytes = await regularBytes(resolve(path), MAX_SUPPORTED_DOCUMENT_BYTES);
  return normalizeSupportedResponse(JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)));
}
export async function writeSupportedResponse(path, value) {
  value = normalizeSupportedResponse(value); path = resolve(path);
  const parent = dirname(path);
  await mkdir(parent, {recursive:true, mode:0o700});
  if (await realpath(parent) !== parent)
    throw fail('FACILITATOR_RESPONSE_DIRECTORY', 'Use a canonical destination directory.');
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  const temporary = path + '.pending-' + randomUUID();
  let reused = false;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    try { await link(temporary, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!(await regularBytes(path, MAX_SUPPORTED_DOCUMENT_BYTES)).equals(bytes))
        throw fail('FACILITATOR_RESPONSE_EXISTS', 'This filename already contains another response document.');
      reused = true;
    }
    const directory = await open(parent, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  return {path, bytes:bytes.length, sha256:sha(bytes), response:supportedResponseSummary(value), reused};
}

/** A worker gives the unmodified HTTPFacilitatorClient its received response.
 * Its fetch implementation has no network fallback; the host's fetch is unchanged.
 * The original SDK performs JSON/schema normalization, including unknown fields. */
export async function parseSupportedResponse(value, {expectedUrl, signal} = {}) {
  value = normalizeSupportedResponse(value, {expectedUrl});
  signal?.throwIfAborted();
  const worker = new Worker(new URL('./facilitator-supported-worker.mjs', import.meta.url), {workerData:value, execArgv:[]});
  return new Promise((resolveResult, reject) => {
    let settled = false;
    const finish = async (error, supported) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted);
      try { await worker.terminate(); } catch (cause) { if (!error) error = cause; }
      if (error) reject(error); else resolveResult(supported);
    };
    const aborted = () => finish(signal.reason ?? fail('FACILITATOR_RESPONSE_ABORTED', 'Response interpretation was cancelled.'));
    const timer = setTimeout(() => finish(fail('FACILITATOR_RESPONSE_TIMEOUT',
      'The original SDK did not finish interpreting the received document within 30 seconds.')), 30000);
    signal?.addEventListener('abort', aborted, {once:true});
    if (signal?.aborted) aborted();
    worker.once('message', message => {
      if (message?.ok === true) return finish(null, message.supported);
      const detail = message?.error ?? {};
      const error = Object.assign(new Error(detail.message ?? 'The original SDK rejected the received response.'),
        {name:detail.name ?? 'Error', ...(detail.code ? {code:detail.code} : {}),
          ...(detail.stack ? {stack:detail.stack} : {}), ...(detail.cause ? {cause:detail.cause} : {})});
      finish(error);
    });
    worker.once('error', error => finish(error));
    worker.once('exit', code => {
      if (!settled) finish(fail('FACILITATOR_RESPONSE_WORKER_EXIT',
        'The original SDK reader exited before returning its response (code ' + code + ').'));
    });
  });
}

const USAGE = [
  'Receive a complete public facilitator supported response.',
  '  facilitator-response capture --url HTTPS_SUPPORTED_URL --body FILE --started-at UTC --completed-at UTC --source DESCRIPTION --out FILE [--content-type TYPE]',
  '  facilitator-response inspect DOCUMENT',
  '  facilitator-response help',
  '',
  'capture keeps the exact supplied body, its source URL, retrieval window and byte identity.',
  'inspect uses the original installed SDK to interpret the saved document.'
].join('\n');
export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.length === 1 && ['help','--help','-h'].includes(args[0])) {
    process.stdout.write(USAGE + '\n'); return;
  }
  const [command, ...rest] = args;
  if (command === 'inspect' && rest.length === 1) {
    const value = await readSupportedResponse(rest[0]), supported = await parseSupportedResponse(value);
    const result = {response:supportedResponseSummary(value), supported};
    process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return result;
  }
  if (command !== 'capture' || rest.length % 2) throw new TypeError(USAGE);
  const flags = new Map(), allowed = ['--url','--body','--started-at','--completed-at','--source','--out','--content-type'];
  for (let i = 0; i < rest.length; i += 2) {
    if (!allowed.includes(rest[i]) || flags.has(rest[i]) || !rest[i + 1])
      throw new TypeError(USAGE);
    flags.set(rest[i], rest[i + 1]);
  }
  if (allowed.slice(0, 6).some(name => !flags.has(name))) throw new TypeError(USAGE);
  const value = createSupportedResponse({url:flags.get('--url'),
    startedAt:flags.get('--started-at'), completedAt:flags.get('--completed-at'), source:flags.get('--source'),
    contentType:flags.get('--content-type') ?? 'application/json',
    body:await regularBytes(resolve(flags.get('--body')), MAX_SUPPORTED_RESPONSE_BYTES)});
  const result = await writeSupportedResponse(flags.get('--out'), value);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { process.stderr.write((error.code ?? error.name) + ': ' + error.message + '\n'); process.exitCode = 1; });
