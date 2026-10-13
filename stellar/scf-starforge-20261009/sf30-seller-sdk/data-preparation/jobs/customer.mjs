// MIT. Receive one original commissioned pipeline job and preserve its editable customer workspace.
import { constants } from 'node:fs';
import { lstat, realpath, mkdtemp, mkdir, open, rm } from 'node:fs/promises';
import { dirname, join, resolve, isAbsolute, relative, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { receiveResultPackage, reopenResultPackage, RESULT_PACKAGE_TYPE } from '../../jobs/outputs/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_JSON = 1048576, MAX_STDERR = 65536;
const HASH = /^[a-f0-9]{64}$/;
const STATUS = new Set(['COMPLETE', 'REVIEW_REQUIRED']);
const OUTPUTS = Object.freeze({
  report: { filename: 'pipeline-report.html', contentType: 'text/html; charset=utf-8', maxBytes: 2097152 },
  project: { filename: 'pipeline-project.zip', contentType: 'application/zip', maxBytes: 29360128 },
  execution: { filename: 'pipeline-execution.json', contentType: 'application/json; charset=utf-8', maxBytes: 2097152 },
  results: { filename: 'pipeline-results.zip', contentType: 'application/zip', maxBytes: 29360128 }
});
const fail = (code, extra = {}) => { throw Object.assign(new Error(code), { code, ...extra }); };
const need = (value, code) => { if (!value) fail(code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const check = signal => signal?.throwIfAborted();
const hash = body => createHash('sha256').update(body).digest('hex');
const inside = (parent, path) => {
  const name = relative(parent, path);
  return name === '' || (name !== '..' && !name.startsWith('..' + sep) && !isAbsolute(name));
};

function absolute(value, code) {
  need(typeof value === 'string' && !value.includes('\0') && isAbsolute(value), code);
  return resolve(value);
}

/** Resolve existing ancestors as well as nonexistent final directories before checking containment. */
async function canonicalPath(value) {
  const original = absolute(value, 'PREPARATION_JOB_ABSOLUTE_PATH_REQUIRED');
  const suffix = [];
  let cursor = original;
  for (;;) {
    try {
      await lstat(cursor);
      const actual = await realpath(cursor);
      return join(actual, ...suffix.reverse());
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      suffix.push(basename(cursor)); cursor = parent;
    }
  }
}

function pythonPath(value) {
  return absolute(value ?? process.env.SF30_PREPARATION_PYTHON,
    'PREPARATION_JOB_PYTHON_REQUIRED');
}

/** Own exactly this helper process group. Cancellation drains it before the caller can settle. */
async function runPython(script, args, { python, signal } = {}) {
  check(signal);
  python = pythonPath(python);
  return await new Promise((resolvePromise, reject) => {
    const grouped = process.platform !== 'win32';
    const child = spawn(python, ['-B', '-I', join(HERE, script), ...args], {
      cwd: HERE, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: grouped
    });
    const stdout = [], stderr = [];
    let stdoutBytes = 0, stderrBytes = 0, failure = null, timer = null, stopping = false;
    const signalOwned = name => {
      if (!child.pid) return;
      try {
        if (grouped) process.kill(-child.pid, name);
        else child.kill(name);
      } catch (error) {
        if (error.code !== 'ESRCH') failure ??= error;
      }
    };
    const stop = () => {
      if (stopping || !child.pid) return;
      stopping = true;
      signalOwned('SIGTERM');
      timer = setTimeout(() => signalOwned('SIGKILL'), 2000);
      timer.unref();
    };
    const abort = () => { failure ??= signal.reason ?? new DOMException('Operation aborted.', 'AbortError'); stop(); };
    signal?.addEventListener('abort', abort, { once: true });
    child.once('spawn', () => { if (signal?.aborted) abort(); else if (failure) stop(); });
    child.once('error', error => { failure ??= error; });
    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_JSON) stdout.push(chunk);
      else { failure ??= Object.assign(new Error('PREPARATION_JOB_HELPER_OUTPUT_TOO_LARGE'),
        { code: 'PREPARATION_JOB_HELPER_OUTPUT_TOO_LARGE' }); stop(); }
    });
    child.stderr.on('data', chunk => {
      const remaining = MAX_STDERR - stderrBytes;
      stderrBytes += chunk.length;
      if (remaining > 0) stderr.push(chunk.subarray(0, remaining));
      if (stderrBytes > MAX_STDERR) {
        failure ??= Object.assign(new Error('PREPARATION_JOB_HELPER_ERROR_TOO_LARGE'),
          { code: 'PREPARATION_JOB_HELPER_ERROR_TOO_LARGE' }); stop();
      }
    });
    child.once('close', (exitCode, exitSignal) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (failure) { reject(failure); return; }
      if (exitCode !== 0 || exitSignal !== null) {
        reject(Object.assign(new Error('PREPARATION_JOB_HELPER_FAILED'), {
          code: 'PREPARATION_JOB_HELPER_FAILED', exitCode, signal: exitSignal,
          stderr: Buffer.concat(stderr).toString('utf8')
        }));
        return;
      }
      try {
        check(signal);
        const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(stdout)));
        need(plain(result), 'PREPARATION_JOB_HELPER_RESULT_INVALID');
        resolvePromise(result);
      } catch (error) { reject(error); }
    });
    if (signal?.aborted) abort();
  });
}

function selectedFiles(receipt) {
  need(receipt?.schema === 'stellar-forge.job-result-receiving.v1' && receipt.complete === true
    && receipt.package?.contentType === RESULT_PACKAGE_TYPE && Array.isArray(receipt.files),
    'PREPARATION_JOB_PACKAGE_REQUIRED');
  const selected = Object.create(null);
  for (const row of receipt.files) {
    need(Object.hasOwn(OUTPUTS, row.slot), 'PREPARATION_JOB_OUTPUT_CONTRACT_CHANGED');
    const policy = OUTPUTS[row.slot];
    need(policy && !Object.hasOwn(selected, row.slot) && row.filename === policy.filename
      && row.contentType === policy.contentType && Number.isSafeInteger(row.bytes)
      && row.bytes > 0 && row.bytes <= policy.maxBytes && HASH.test(row.sha256 ?? ''),
      'PREPARATION_JOB_OUTPUT_CONTRACT_CHANGED');
    need(row.path === join(receipt.directory, 'files', row.filename),
      'PREPARATION_JOB_OUTPUT_PATH_CHANGED');
    selected[row.slot] = row;
  }
  need(['report', 'project', 'execution'].every(slot => Object.hasOwn(selected, slot))
    && receipt.files.length === Object.keys(selected).length,
    'PREPARATION_JOB_OUTPUT_REQUIRED');
  return selected;
}

async function readBoundedJson(path, maximum, { bytes, sha256 } = {}, signal) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    need(before.isFile() && before.size > 0 && before.size <= maximum
      && (bytes === undefined || before.size === bytes), 'PREPARATION_JOB_JSON_SIZE_INVALID');
    const chunks = []; let count = 0;
    const buffer = Buffer.alloc(65536);
    for (;;) {
      check(signal);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      count += bytesRead;
      need(count <= maximum, 'PREPARATION_JOB_JSON_TOO_LARGE');
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    const after = await handle.stat(), body = Buffer.concat(chunks);
    need(count === before.size && before.dev === after.dev && before.ino === after.ino
      && before.size === after.size && before.mtimeMs === after.mtimeMs
      && before.ctimeMs === after.ctimeMs && (sha256 === undefined || hash(body) === sha256),
      'PREPARATION_JOB_JSON_CHANGED');
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    need(plain(result), 'PREPARATION_JOB_JSON_INVALID');
    return result;
  } finally { await handle.close(); }
}

function validateReceived(value, receipt, directory) {
  need(value.schema === 'stellar-forge.preparation-pipeline-job-received.v1'
    && value.directory === directory && isDeepStrictEqual(value.package, receipt.package)
    && value.manifestSha256 === receipt.manifestSha256 && isDeepStrictEqual(value.job, receipt.job)
    && isDeepStrictEqual(value.files, receipt.files) && typeof value.reused === 'boolean'
    && typeof value.pipeline?.id === 'string' && value.pipeline.id.length > 0
    && Number.isSafeInteger(value.pipeline.revision) && value.pipeline.revision >= 1
    && HASH.test(value.pipeline.sha256 ?? '') && typeof value.executionId === 'string'
    && value.executionId.length > 0 && STATUS.has(value.status),
    'PREPARATION_JOB_RECEIVING_RESULT_CHANGED');
  return value;
}

async function receiveEditable(action, receipt, directory, options) {
  selectedFiles(receipt);
  const stage = await mkdtemp(join(dirname(receipt.directory), '.preparation-job-receipt-'));
  const path = join(stage, 'original-receipt.json');
  try {
    const body = Buffer.from(JSON.stringify(receipt) + '\n');
    need(body.length <= MAX_JSON, 'PREPARATION_JOB_RECEIPT_TOO_LARGE');
    check(options.signal);
    const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); }
    const value = await runPython('receive.py', ['--receipt', path, '--directory', directory, '--action', action], options);
    return { package: receipt, workspace: validateReceived(value, receipt, directory) };
  } finally { await rm(stage, { recursive: true, force: true }); }
}

async function receivingPaths(packageDirectory, directory, signal) {
  check(signal);
  const packages = await canonicalPath(packageDirectory), editable = await canonicalPath(directory);
  need(!inside(packages, editable) && !inside(editable, packages),
    'PREPARATION_JOB_DIRECTORIES_MUST_BE_SEPARATE');
  return { packages, editable };
}

/** Receive all original paid result files, then create or continue their one editable customer copy. */
export async function receivePipelineJob({ source, expected, job = {}, packageDirectory, directory, python, signal } = {}) {
  python = pythonPath(python);
  const { packages, editable } = await receivingPaths(packageDirectory, directory, signal);
  source = await canonicalPath(source);
  const receipt = await receiveResultPackage({ source, directory: packages, expected, job, signal });
  return await receiveEditable('receive', receipt, editable, { python, signal });
}

/** Reopen the same complete output package and editable project offline, retaining later customer edits. */
export async function reopenPipelineJob({ packageDirectory, directory, expected, job = {}, python, signal } = {}) {
  python = pythonPath(python);
  const { packages, editable } = await receivingPaths(packageDirectory, directory, signal);
  const receipt = await reopenResultPackage({ directory: packages, expected, job, signal });
  return await receiveEditable('reopen', receipt, editable, { python, signal });
}


async function verifyRetainedFile(path, expected, signal) {
  need(plain(expected) && Number.isSafeInteger(expected.bytes) && expected.bytes >= 0
    && HASH.test(expected.sha256 ?? ''), 'PREPARATION_JOB_FILE_IDENTITY_REQUIRED');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    need(before.isFile() && before.size === expected.bytes, 'PREPARATION_JOB_PREPARED_FILE_CHANGED');
    const hasher = createHash('sha256'), block = Buffer.alloc(65536); let bytes = 0;
    for (;;) {
      check(signal);
      const { bytesRead } = await handle.read(block, 0, block.length, null);
      if (!bytesRead) break;
      bytes += bytesRead; need(bytes <= expected.bytes, 'PREPARATION_JOB_PREPARED_FILE_CHANGED');
      hasher.update(block.subarray(0, bytesRead));
    }
    const after = await handle.stat();
    need(bytes === expected.bytes && hasher.digest('hex') === expected.sha256
      && before.dev === after.dev && before.ino === after.ino && before.size === after.size
      && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs,
      'PREPARATION_JOB_PREPARED_FILE_CHANGED');
  } finally { await handle.close(); }
}

/** Freeze the selected original project, saved pipeline and explicit inputs before the existing checkout. */
export async function preparePipelineJob({ project, sha256, directory, pipelineId, revision,
  reportName, inputs, reuseExecution, python, signal } = {}) {
  python = pythonPath(python);
  check(signal);
  need(HASH.test(sha256 ?? ''), 'PREPARATION_JOB_PROJECT_SHA256_REQUIRED');
  need(typeof pipelineId === 'string' && pipelineId.length > 0
    && Number.isSafeInteger(revision) && revision >= 1, 'PREPARATION_JOB_PIPELINE_REQUIRED');
  need(typeof reportName === 'string' && reportName.trim().length > 0 && reportName.isWellFormed(),
    'PREPARATION_JOB_REPORT_NAME_REQUIRED');
  if (inputs !== undefined) need(plain(inputs) && Object.entries(inputs).every(([name, value]) =>
    name.length > 0 && typeof value === 'string' && value.length > 0), 'PREPARATION_JOB_INPUT_SELECTION_INVALID');
  if (reuseExecution !== undefined) need(typeof reuseExecution === 'string' && reuseExecution.length > 0,
    'PREPARATION_JOB_EXECUTION_SELECTION_INVALID');
  project = await canonicalPath(project); directory = await canonicalPath(directory);
  await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
  const stage = await mkdtemp(join(dirname(directory), '.preparation-job-selection-'));
  try {
    const args = ['--project', project, '--sha256', sha256, '--directory', directory,
      '--pipeline', pipelineId, '--revision', String(revision), '--report', reportName];
    if (inputs !== undefined) {
      const body = Buffer.from(JSON.stringify(inputs) + '\n'), path = join(stage, 'selected-inputs.json');
      need(body.length <= MAX_JSON, 'PREPARATION_JOB_INPUT_SELECTION_TOO_LARGE');
      const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); }
      args.push('--inputs', path);
    }
    if (reuseExecution !== undefined) args.push('--reuse-execution', reuseExecution);
    const prepared = await runPython('prepare.py', args, { python, signal });
    const intent = prepared.intent, files = prepared.files;
    need(prepared.schema === 'stellar-forge.preparation-pipeline-job-prepared.v1'
      && intent?.schema === prepared.schema && intent.project?.sha256 === sha256
      && Number.isSafeInteger(intent.project?.bytes) && intent.project.bytes > 0
      && intent.pipelineId === pipelineId && intent.revision === revision
      && intent.reportName === reportName && isDeepStrictEqual(intent.inputs, inputs ?? null)
      && intent.reuseExecution === (reuseExecution ?? null)
      && prepared.functionId === 'executePipeline' && prepared.input?.reportName === reportName
      && plain(files) && isDeepStrictEqual(Object.keys(files).sort(),
        ['input.json', 'project.zip', 'review.html', 'selection.json'])
      && isDeepStrictEqual(prepared.attachmentSlots, { project: 'project.zip', selection: 'selection.json' })
      && prepared.pipeline?.id === pipelineId && prepared.pipeline.revision === revision
      && HASH.test(prepared.pipeline.sha256 ?? '')
      && plain(prepared.sources) && Object.values(prepared.sources).every(row => plain(row)
        && typeof row.id === 'string' && typeof row.label === 'string'
        && Number.isSafeInteger(row.rows) && row.rows >= 0)
      && Array.isArray(prepared.outputs) && prepared.outputs.every(value => typeof value === 'string')
      && new Set(prepared.outputs).size === prepared.outputs.length,
      'PREPARATION_JOB_PREPARED_RESULT_CHANGED');
    need(isDeepStrictEqual(files['project.zip'], intent.project)
      && prepared.input.selectionSha256 === files['selection.json'].sha256,
      'PREPARATION_JOB_PREPARED_SELECTION_CHANGED');
    for (const [filename, descriptor] of Object.entries(files))
      await verifyRetainedFile(join(directory, filename), descriptor, signal);
    const selectedInput = await readBoundedJson(join(directory, 'input.json'), MAX_JSON, files['input.json'], signal);
    need(isDeepStrictEqual(selectedInput, prepared.input), 'PREPARATION_JOB_PREPARED_INPUT_CHANGED');
    check(signal);
    return prepared;
  } finally { await rm(stage, { recursive: true, force: true }); }
}
