#!/usr/bin/env node
// MIT. Operate one retained FRED recurring briefing and receive its complete project.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const CAPTURE_BLOB = '820d20e54f23f7d6c7c1f63e2598169aca411469';
const CAPTURE_ID = '4c7fc88552da69b9448054334bad10b72afee056ed93bcd2fb741d698dde042c';
const OPERATION = 'SCF-FRED-RECURRING-BRIEFINGS-E2747-20261012';
const IDS = Object.freeze({
  import: 'e274-fred-recurring-import-20261012',
  review: 'e274-fred-recurring-review-20261012',
  template: 'e274-fred-recurring-template-20261012',
  successor: 'e274-fred-recurring-successor-20261012',
});
function args(values) {
  const allowed = new Set(['project-module', 'expected-project-blob', 'capture', 'briefing', 'review', 'work']);
  const parsed = {};
  for (let i = 0; i < values.length; i += 2) {
    const key = values[i]?.replace(/^--/, '');
    if (!allowed.has(key) || !values[i].startsWith('--') || !values[i + 1] || values[i + 1].startsWith('--')) {
      throw new Error('Use --project-module PATH --expected-project-blob SHA --capture PATH --briefing PATH --review PATH --work DIRECTORY.');
    }
    if (Object.hasOwn(parsed, key)) throw new Error('Duplicate argument: ' + key);
    parsed[key] = values[i + 1];
  }
  for (const key of allowed) if (!parsed[key]) throw new Error('Missing --' + key);
  if (!/^[0-9a-f]{40}$/.test(parsed['expected-project-blob'])) throw new Error('Supply the final project Git blob.');
  return parsed;
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
async function saveJson(path, value) {
  const temporary = path + '.tmp';
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  await writeFile(temporary, bytes, { mode: 0o600 });
  await rename(temporary, path);
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}
function phase(name, value) {
  process.stdout.write(JSON.stringify({ operationId: OPERATION, phase: name, ...value }) + '\n');
}
async function main() {
  const config = args(process.argv.slice(2));
  const work = resolve(config.work), directory = join(work, 'project'), receiverDirectory = join(work, 'received-project');
  const output = join(work, 'outputs'), modulePath = resolve(config['project-module']);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const projectBytes = await readFile(modulePath), projectBlob = gitBlob(projectBytes);
  if (projectBlob !== config['expected-project-blob']) throw new Error('The selected project module differs from the final composed source.');
  const captureBytes = await readFile(resolve(config.capture));
  if (gitBlob(captureBytes) !== CAPTURE_BLOB) throw new Error('The retained macro source bytes differ from the original published capture.');
  const capture = JSON.parse(captureBytes.toString('utf8'));
  if (capture.captureSha256 !== CAPTURE_ID) throw new Error('The macro capture identity differs from the selected original.');
  const originalBriefing = await readJson(resolve(config.briefing)), originalReview = await readJson(resolve(config.review));
  if (originalReview.captureId !== CAPTURE_ID) throw new Error('The original analyst review belongs to another source.');
  const api = await import(pathToFileURL(modulePath).href);
  const required = ['initializeFredProject', 'readFredProject', 'importFredCapture', 'reviewFredCapture',
    'saveFredBriefingTemplate', 'previewFredBriefingSuccessor', 'saveFredBriefingSuccessor',
    'getFredBriefingSuccessor', 'downloadFredBriefingSuccessor', 'exportFredProject', 'receiveFredProject'];
  for (const name of required) if (typeof api[name] !== 'function') throw new Error('Incomplete composed FRED application: ' + name);
  const initial = await api.initializeFredProject({
    directory, title: 'U.S. macro recurring briefings - retained October 2026 source', selection: capture.selection,
  });
  phase('opened-project', { projectId: initial.id, revision: initial.revision });
  const imported = await api.importFredCapture({
    directory, id: IDS.import, expectedRevision: initial.revision, capture,
  });
  if (imported.captureId !== CAPTURE_ID) throw new Error('The project imported a different source capture.');
  const briefing = {
    ...originalBriefing,
    title: 'U.S. macro briefing - calendar 2025',
    start: '2025-01-01',
    end: '2025-12-31',
  };
  const reviewed = await api.reviewFredCapture({
    directory, id: IDS.review, expectedRevision: imported.revision, captureId: imported.captureId,
    policy: originalReview.policy, note: originalReview.note + ' Initial reporting window: calendar 2025.', briefing,
  });
  const template = await api.saveFredBriefingTemplate({
    directory, id: IDS.template, expectedRevision: reviewed.revision, reviewId: reviewed.reviewId,
    name: 'U.S. macro - rolling twelve months',
    window: { months: 12, anchor: 'latest_all', lagMonths: 0 },
  });
  phase('saved-template', { templateId: template.templateId, reviewId: reviewed.reviewId, revision: template.revision });
  const selection = {
    directory, templateId: template.templateId, captureId: imported.captureId, anchorDate: null,
    baselineReviewId: reviewed.reviewId, previousSuccessorId: null,
    note: 'Apply the retained twelve-month definition to the later observations in the same original October 2026 capture.',
    offset: 0, limit: 100, changesOnly: true,
  };
  const beforeSuccessor = await api.readFredProject(directory);
  const completed = beforeSuccessor.operations.find(item => item.id === IDS.successor);
  let preview = null, saved;
  if (completed) {
    saved = completed.result;
    phase('reopened-original-successor-operation', { successorId: saved.successorId, revision: beforeSuccessor.revision });
  } else {
    preview = await api.previewFredBriefingSuccessor(selection);
    saved = await api.saveFredBriefingSuccessor({
      ...selection, id: IDS.successor, expectedRevision: beforeSuccessor.revision, previewId: preview.previewId,
    });
    phase('saved-successor', { successorId: saved.successorId, reviewId: saved.reviewId, revision: saved.revision });
  }
  const successor = await api.getFredBriefingSuccessor({ directory, successorId: saved.successorId, limit: 100, changesOnly: true });
  const files = [];
  for (const format of ['html', 'csv', 'json']) {
    const downloaded = await api.downloadFredBriefingSuccessor({ directory, successorId: saved.successorId, format });
    if (!Buffer.isBuffer(downloaded.body) || !downloaded.body.length) throw new Error('The complete ' + format + ' report body is missing.');
    if (downloaded.successorId !== saved.successorId || sha256(downloaded.body) !== downloaded.sha256) {
      throw new Error('The ' + format + ' report differs from its retained successor metadata.');
    }
    const path = join(output, 'successor.' + format);
    await writeFile(path, downloaded.body, { mode: 0o600 });
    files.push({ format, path, bytes: downloaded.body.length, sha256: downloaded.sha256,
      contentType: downloaded.contentType, reviewId: downloaded.reviewId, reportId: downloaded.reportId });
  }
  const bundle = await api.exportFredProject({ directory });
  if (bundle.schema !== 'stellar-forge.fred-project-bundle.v3') throw new Error('The recurring project did not export its v3 template/successor state.');
  const bundleFile = await saveJson(join(output, 'recurring-project-bundle.json'), bundle);
  phase('exported-complete-project', { bundleSha256: bundle.bundleSha256, bytes: bundleFile.bytes });
  const received = await api.receiveFredProject({ directory: receiverDirectory, bundle });
  const receivedState = await api.readFredProject(receiverDirectory);
  const receivedSuccessor = await api.getFredBriefingSuccessor({
    directory: receiverDirectory, successorId: saved.successorId, limit: 100, changesOnly: true,
  });
  if (received.projectId !== initial.id || received.bundleSha256 !== bundle.bundleSha256 || receivedState.id !== initial.id) {
    throw new Error('The received project lost its original project or bundle identity.');
  }
  const receivedFiles = [];
  for (const original of files) {
    const downloaded = await api.downloadFredBriefingSuccessor({
      directory: receiverDirectory, successorId: saved.successorId, format: original.format,
    });
    if (!Buffer.isBuffer(downloaded.body) || sha256(downloaded.body) !== original.sha256 || downloaded.body.length !== original.bytes) {
      throw new Error('The received ' + original.format + ' report differs from the original complete export.');
    }
    receivedFiles.push({ format: original.format, bytes: downloaded.body.length, sha256: original.sha256,
      successorId: downloaded.successorId, reviewId: downloaded.reviewId, reportId: downloaded.reportId });
  }
  const result = {
    schema: 'stellar-forge.fred-recurring-native-result.v1', operationId: OPERATION, completedAt: new Date().toISOString(),
    runtime: { node: process.version, executable: process.execPath, platform: process.platform },
    source: { projectModule: modulePath, projectGitBlob: projectBlob, captureGitBlob: CAPTURE_BLOB, captureId: CAPTURE_ID,
      originalAsOf: capture.selection.asOf, originalSourceStart: capture.selection.start, originalSourceEnd: capture.selection.end },
    workspace: { directory, receiverDirectory, output }, projectId: initial.id, initialReview: reviewed, template,
    preview, saved, successor, files, bundle: { schema: bundle.schema, sha256: bundle.bundleSha256, file: bundleFile },
    received, receivedRevision: receivedState.revision, receivedSuccessor, receivedFiles,
  };
  const resultFile = await saveJson(join(output, 'native-result.json'), result);
  phase('received-complete-recurring-project', {
    projectId: initial.id, successorId: saved.successorId, revision: receivedState.revision,
    bundleSha256: bundle.bundleSha256, result: resultFile, reports: receivedFiles,
  });
}
main().catch(error => {
  process.stderr.write(JSON.stringify({ operationId: OPERATION, code: error.code ?? null, message: error.message, stack: error.stack }) + '\n');
  process.exitCode = 1;
});
