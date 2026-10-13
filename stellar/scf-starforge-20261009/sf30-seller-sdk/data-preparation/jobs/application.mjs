// MIT. Complete saved-pipeline execution through original sealed inputs and owned Jobs processes.
import { constants } from 'node:fs';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const need = (condition, code) => {
  if (!condition) throw Object.assign(new Error(code), { code });
};
const digest = value => createHash('sha256').update(value).digest('hex');
const limits = Object.freeze({ report: 2097152, project: 29360128, execution: 2097152, results: 29360128 });
const names = Object.freeze({ report: 'pipeline-report.html', project: 'pipeline-project.zip',
  execution: 'pipeline-execution.json', results: 'pipeline-results.zip' });
const sameStat = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
  a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;

async function retain(files, slot, path, maximum, signal) {
  const descriptor = files.metadata(slot);
  need(Number.isSafeInteger(descriptor.bytes) && descriptor.bytes > 0 && descriptor.bytes <= maximum &&
    /^[a-f0-9]{64}$/.test(descriptor.sha256), 'PIPELINE_JOB_INPUT_IDENTITY_REQUIRED');
  const output = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    for await (const chunk of files.stream(slot)) {
      signal.throwIfAborted();
      bytes += chunk.length;
      need(bytes <= descriptor.bytes, 'PIPELINE_JOB_INPUT_CHANGED');
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) {
        signal.throwIfAborted();
        const written = await output.write(chunk, offset, chunk.length - offset);
        need(written.bytesWritten > 0, 'PIPELINE_JOB_INPUT_WRITE_FAILED');
        offset += written.bytesWritten;
      }
    }
    await output.sync();
  } finally { await output.close(); }
  need(bytes === descriptor.bytes && hash.digest('hex') === descriptor.sha256, 'PIPELINE_JOB_INPUT_CHANGED');
  return { path, descriptor };
}

async function completeOutput(root, slot, descriptor, signal) {
  need(Object.hasOwn(limits, slot) && descriptor?.path === join(root, names[slot]) &&
    Number.isSafeInteger(descriptor.bytes) && descriptor.bytes > 0 && descriptor.bytes <= limits[slot] &&
    /^[a-f0-9]{64}$/.test(descriptor.sha256), 'PIPELINE_JOB_OUTPUT_IDENTITY_INVALID');
  const file = await open(descriptor.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat({ bigint: true });
    need(before.isFile() && before.nlink === 1n && !(before.mode & 0o077n) &&
      before.size === BigInt(descriptor.bytes), 'PIPELINE_JOB_OUTPUT_FILE_INVALID');
    signal.throwIfAborted();
    const bytes = await file.readFile({ signal });
    const after = await file.stat({ bigint: true });
    need(sameStat(before, after) && bytes.length === descriptor.bytes &&
      digest(bytes) === descriptor.sha256, 'PIPELINE_JOB_OUTPUT_CHANGED');
    signal.throwIfAborted();
    return bytes;
  } finally { await file.close(); }
}

export async function executePipeline(input, context) {
  need(context?.files && context.processes && context.signal, 'PIPELINE_JOB_ORIGINAL_CONTEXT_REQUIRED');
  need(typeof input?.reportName === 'string' && input.reportName.trim().length > 0 &&
    input.reportName.length <= 120 && input.reportName.isWellFormed() &&
    typeof input.selectionSha256 === 'string' && /^[a-f0-9]{64}$/.test(input.selectionSha256),
    'PIPELINE_JOB_PREPARED_INPUT_REQUIRED');
  const python = process.env.SF30_PREPARATION_PYTHON;
  need(typeof python === 'string' && isAbsolute(python), 'PIPELINE_JOB_ABSOLUTE_PYTHON_REQUIRED');
  const root = await context.processes.directory();
  const originalDirectory = join(root, 'originals');
  await mkdir(originalDirectory, { mode: 0o700 });
  const slots = context.files.list().map(value => value.slot);
  need(slots.length === 2 && new Set(slots).size === 2 && slots.includes('project') && slots.includes('selection'),
    'PIPELINE_JOB_COMPLETE_INPUT_SLOTS_REQUIRED');
  const files = {};
  for (const slot of slots) files[slot] = await retain(context.files, slot,
    join(originalDirectory, slot + (slot === 'project' ? '.zip' : '.json')),
    slot === 'project' ? 29360128 : 1048576, context.signal);
  need(files.selection.descriptor.sha256 === input.selectionSha256, 'PIPELINE_JOB_SELECTION_CHANGED');
  const requestPath = join(root, 'pipeline-request.json');
  const request = { schema: 'stellar-forge.preparation-pipeline-job.v1', jobId: context.jobId,
    attemptId: context.attemptId, input, files };
  await writeFile(requestPath, JSON.stringify(request) + '\n', { flag: 'wx', mode: 0o600 });
  const directory = join(root, 'delivery');
  const response = await context.processes.run({
    command: [python, '-B', '-I', fileURLToPath(new URL('./service.py', import.meta.url)),
      '--request', requestPath, '--directory', directory],
    cwd: root, maxStdoutBytes: 131072, maxStderrBytes: 65536,
  });
  context.signal.throwIfAborted();
  need(response.exitCode === 0 && response.signal === null, 'PIPELINE_JOB_NATIVE_EXECUTION_FAILED');
  let outcome;
  try { outcome = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.stdout)); }
  catch { need(false, 'PIPELINE_JOB_NATIVE_RESULT_INVALID'); }
  need(outcome?.schema === 'stellar-forge.preparation-pipeline-job-result.v1' &&
    outcome.job?.id === context.jobId && outcome.job?.attemptId === context.attemptId &&
    ['COMPLETE', 'REVIEW_REQUIRED'].includes(outcome.status) && outcome.files &&
    Object.keys(outcome.files).every(slot => Object.hasOwn(limits, slot)) &&
    ['report', 'project', 'execution'].every(slot => Object.hasOwn(outcome.files, slot)) &&
    Object.hasOwn(outcome.files, 'results') === (outcome.status === 'COMPLETE'),
    'PIPELINE_JOB_NATIVE_RESULT_INVALID');
  const outputs = {};
  for (const [slot, descriptor] of Object.entries(outcome.files))
    outputs[slot] = await completeOutput(join(directory, 'outputs'), slot, descriptor, context.signal);
  context.signal.throwIfAborted();
  // The original runner packages these complete slot bodies with its native settlement.
  return outputs;
}
