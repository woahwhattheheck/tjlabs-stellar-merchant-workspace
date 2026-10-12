#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createEdition, reconcile, decideMany, finalize, exportCSV, exportHTML,
  exportSQL, serializeWorkspace, reopenWorkspace
} from './supplier-report.mjs';

const USAGE = [
  'Supplier feed review',
  '',
  '  node supplier-report-cli.mjs compare --baseline baseline.csv --candidate candidate.csv',
  '    --rules rules.json --request REQUEST_ID --out workspace.json',
  '    [--baseline-source SOURCE_ID] [--candidate-source SOURCE_ID]',
  '    [--baseline-captured-at ISO_DATE] [--candidate-captured-at ISO_DATE] [--force]',
  '',
  '  node supplier-report-cli.mjs decide --workspace workspace.json --decisions decisions.json',
  '    --reviewer REVIEWER --expected-revision NUMBER --out reviewed.json [--finalize] [--force]',
  '',
  '  node supplier-report-cli.mjs export --workspace reviewed.json --out-dir NEW_DIRECTORY',
  '    [--table-name supplier_feed_accepted]',
  '',
  '  node supplier-report-cli.mjs inspect --workspace workspace.json',
  '  node supplier-report-cli.mjs serve [--port 8765]',
  '',
  'Source timestamps default to the time the local file is read. File provenance is retained.',
  'All input text must be valid UTF-8. Export requires a new directory.',
  '--force permits replacing a regular output file for compare or decide.',
  '--finalize requires all review decisions to produce a conflict-free finalized result.',
  'serve exposes only this package on http://127.0.0.1:8765; input files stay in the browser.'
].join('\n');

const SCHEMAS = {
  compare: {
    required: ['baseline', 'candidate', 'rules', 'request', 'out'],
    optional: ['baseline-source', 'candidate-source', 'baseline-captured-at', 'candidate-captured-at'],
    flags: ['force']
  },
  decide: {
    required: ['workspace', 'decisions', 'reviewer', 'expected-revision', 'out'],
    optional: [], flags: ['force', 'finalize']
  },
  export: { required: ['workspace', 'out-dir'], optional: ['table-name'], flags: [] },
  inspect: { required: ['workspace'], optional: [], flags: [] },
  serve: { required: [], optional: ['port'], flags: [] }
};

function error(message, code = 'CLI_ARGUMENT') {
  return Object.assign(new Error(message), { code });
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { command: 'help', options: {} };
  }
  const schema = SCHEMAS[command];
  if (!schema) throw error('Unknown command: ' + command);
  const allowed = new Set([...schema.required, ...schema.optional, ...schema.flags]);
  const flags = new Set(schema.flags);
  const options = Object.create(null);
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--help' || argument === '-h') return { command: 'help', options: {} };
    if (!argument.startsWith('--')) throw error('Unexpected positional argument: ' + argument);
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator < 0 ? undefined : separator);
    if (!allowed.has(key)) throw error('Unknown option for ' + command + ': --' + key);
    if (Object.hasOwn(options, key)) throw error('Repeated option: --' + key);
    if (flags.has(key)) {
      if (separator >= 0) throw error('--' + key + ' takes no value');
      options[key] = true;
      continue;
    }
    let value = separator < 0 ? rest[++index] : argument.slice(separator + 1);
    if (value === undefined || value === '' || (separator < 0 && value.startsWith('--'))) {
      throw error('Missing value for --' + key);
    }
    options[key] = value;
  }
  for (const key of schema.required) {
    if (!Object.hasOwn(options, key) || !options[key].trim()) throw error('Required option: --' + key);
  }
  return { command, options };
}

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const stripJSONBOM = value => value.replace(/^\uFEFF/, '');

async function readUTF8(filename) {
  const absolutePath = path.resolve(filename);
  const handle = await fs.open(absolutePath, 'r');
  let bytes;
  let stat;
  try {
    stat = await handle.stat();
    if (!stat.isFile()) throw error('Expected a regular file: ' + absolutePath, 'INPUT_FILE');
    bytes = await handle.readFile();
  } finally {
    await handle.close();
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw error('Input is not valid UTF-8: ' + absolutePath, 'INVALID_UTF8');
  }
  return { text, absolutePath, byteLength: bytes.length, sha256: digest(bytes), modifiedAt: stat.mtime.toISOString() };
}

async function readJSON(filename) {
  const input = await readUTF8(filename);
  try {
    return { ...input, value: JSON.parse(stripJSONBOM(input.text)) };
  } catch (failure) {
    throw error('Invalid JSON in ' + input.absolutePath + ': ' + failure.message, 'INVALID_JSON');
  }
}

async function loadWorkspace(filename) {
  const input = await readUTF8(filename);
  return { ...input, report: reopenWorkspace(stripJSONBOM(input.text)) };
}

async function atomicWrite(filename, content, { force = false } = {}) {
  const destination = path.resolve(filename);
  const parent = path.dirname(destination);
  await fs.mkdir(parent, { recursive: true });
  if (force) {
    try {
      const existing = await fs.lstat(destination);
      if (!existing.isFile() || existing.isSymbolicLink()) {
        throw error('--force replaces regular files only: ' + destination, 'OUTPUT_TYPE');
      }
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
  }
  const temporary = path.join(parent, '.' + path.basename(destination) + '.' + randomUUID() + '.tmp');
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (force) {
      await fs.rename(temporary, destination);
    } else {
      try {
        await fs.link(temporary, destination);
      } catch (failure) {
        if (failure.code === 'EEXIST') {
          throw error('Output already exists; select a new path or use --force: ' + destination, 'OUTPUT_EXISTS');
        }
        throw failure;
      }
      await fs.unlink(temporary);
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporary).catch(failure => {
      if (failure.code !== 'ENOENT') throw failure;
    });
  }
  return destination;
}

function summary(report, extra = {}) {
  return {
    requestId: report.requestId,
    comparisonId: report.comparisonId,
    status: report.status,
    revision: report.revision,
    summary: report.summary,
    baseline: {
      id: report.baseline.id, sourceId: report.baseline.sourceId,
      capturedAt: report.baseline.capturedAt, rows: report.baseline.rows.length
    },
    candidate: {
      id: report.candidate.id, sourceId: report.candidate.sourceId,
      capturedAt: report.candidate.capturedAt, rows: report.candidate.rows.length
    },
    ...extra
  };
}

function workspaceText(report) {
  const value = serializeWorkspace(report);
  if (typeof value !== 'string') throw error('Workspace serializer returned a non-text result', 'SERIALIZATION');
  return value.endsWith('\n') ? value : value + '\n';
}

async function editionFromFile(filename, options) {
  const input = await readUTF8(filename);
  const importedAt = new Date().toISOString();
  return createEdition({
    id: options.id,
    sourceId: options.sourceId || pathToFileURL(input.absolutePath).href,
    capturedAt: options.capturedAt || importedAt,
    csv: input.text,
    source: {
      kind: 'local_file', uri: pathToFileURL(input.absolutePath).href,
      filename: path.basename(input.absolutePath), byteLength: input.byteLength,
      sha256: input.sha256, modifiedAt: input.modifiedAt, importedAt
    }
  });
}

async function compareCommand(options) {
  const rulesInput = await readJSON(options.rules);
  const requestId = options.request;
  const baseline = await editionFromFile(options.baseline, {
    id: requestId + ':baseline', sourceId: options['baseline-source'],
    capturedAt: options['baseline-captured-at']
  });
  const candidate = await editionFromFile(options.candidate, {
    id: requestId + ':candidate', sourceId: options['candidate-source'],
    capturedAt: options['candidate-captured-at']
  });
  const report = reconcile({ requestId, baseline, candidate, rules: rulesInput.value });
  const saved = await atomicWrite(options.out, workspaceText(report), { force: Boolean(options.force) });
  process.stdout.write(json(summary(report, { workspace: saved })));
}

function parseRevision(value) {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw error('--expected-revision must be a nonnegative integer');
  const revision = Number(value);
  if (!Number.isSafeInteger(revision)) throw error('--expected-revision exceeds the supported integer range');
  return revision;
}

async function decideCommand(options) {
  const input = await loadWorkspace(options.workspace);
  const decisionInput = await readJSON(options.decisions);
  if (!Array.isArray(decisionInput.value)) {
    throw error('Decisions JSON must be an array of decision objects', 'DECISIONS_FORMAT');
  }
  let report = input.report;
  const expectedRevision = parseRevision(options['expected-revision']);
  if (report.revision !== expectedRevision) {
    throw error('Workspace revision is ' + report.revision + '; expected ' + expectedRevision, 'REVISION_CONFLICT');
  }
  if (decisionInput.value.length === 0 && !options.finalize) {
    throw error('Provide at least one decision, or use --finalize to require a complete review', 'DECISIONS_EMPTY');
  }
  for (const decision of decisionInput.value) {
    if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
      throw error('Each decision must be a JSON object', 'DECISIONS_FORMAT');
    }
  }
  if (decisionInput.value.length > 0) {
    report = decideMany(report, decisionInput.value, { reviewer: options.reviewer, expectedRevision });
  }
  if (options.finalize) finalize(report);
  const outputPath = path.resolve(options.out);
  if (outputPath === input.absolutePath && options.force) {
    const currentInput = await readUTF8(input.absolutePath);
    if (currentInput.sha256 !== input.sha256) {
      throw error('Workspace changed while decisions were being prepared; reload it before writing', 'WORKSPACE_CHANGED');
    }
  }
  const saved = await atomicWrite(outputPath, workspaceText(report), { force: Boolean(options.force) });
  process.stdout.write(json(summary(report, { workspace: saved, appliedDecisions: decisionInput.value.length })));
}

function addSourceFile(files, side, edition) {
  if (typeof edition.rawCSV === 'string') {
    files.set(side + '-source.csv', edition.rawCSV);
  } else {
    files.set(side + '-source.json', json({
      id: edition.id, sourceId: edition.sourceId, capturedAt: edition.capturedAt,
      source: edition.source, columns: edition.columns, rows: edition.rows,
      sourceDigest: edition.sourceDigest, digest: edition.digest
    }));
  }
}

const DELIVERY_SOURCE_FILES = [
  'supplier-report-cli.mjs', 'supplier-report.mjs', 'review.html',
  'review-ui.mjs', 'review-ui.css', 'README.md', 'FIELD_GUIDE.md', 'SOURCE_NOTES.md',
  'catalogue-coverage.mjs', 'CATALOGUE_COVERAGE.md',
  'supplier_attachments.py', 'NATIVE_ATTACHMENTS.md'
];

async function deliverySources() {
  const directory = fileURLToPath(new URL('.', import.meta.url));
  const inputs = await Promise.all(DELIVERY_SOURCE_FILES.map(async filename => {
    const original = await readUTF8(path.join(directory, filename));
    return [filename, original.text];
  }));
  return new Map(inputs);
}

function makeExportFiles(report, tableName, sources) {
  const files = new Map();
  files.set('workspace.json', workspaceText(report));
  files.set('report.json', json(report));
  files.set('rules.json', json(report.rules));
  addSourceFile(files, 'baseline', report.baseline);
  addSourceFile(files, 'candidate', report.candidate);
  files.set('changes.csv', exportCSV(report, { kind: 'changes' }));
  files.set('report.html', exportHTML(report));
  if (report.status === 'reviewed') {
    const result = finalize(report);
    files.set('accepted.csv', exportCSV(report, { kind: 'accepted' }));
    files.set('accepted.sql', exportSQL(report, { tableName }));
    files.set('lineage.json', json({
      requestId: result.requestId, comparisonId: result.comparisonId,
      revision: result.revision, resultDigest: result.resultDigest,
      baselineEditionId: result.baselineEditionId, candidateEditionId: result.candidateEditionId,
      columns: result.columns, rows: result.rows, provenance: result.provenance,
      summary: result.summary
    }));
  }
  for (const filename of DELIVERY_SOURCE_FILES) {
    const content = sources.get(filename);
    if (typeof content !== 'string' || !content.length || files.has(filename)) {
      throw error('The complete installed review source is required: ' + filename, 'DELIVERY_SOURCE_REQUIRED');
    }
    files.set(filename, content);
  }
  for (const [filename, content] of files) {
    if (typeof content !== 'string') throw error('Export is not text: ' + filename, 'EXPORT_FORMAT');
  }
  const manifest = {
    format: 'conapi-supplier-delivery', version: 1,
    requestId: report.requestId, comparisonId: report.comparisonId,
    revision: report.revision, status: report.status, exportedAt: new Date().toISOString(),
    files: [...files].map(([filename, content]) => ({
      filename, bytes: Buffer.byteLength(content, 'utf8'), sha256: digest(Buffer.from(content, 'utf8'))
    }))
  };
  files.set('manifest.json', json(manifest));
  return files;
}

async function exportCommand(options) {
  const { report } = await loadWorkspace(options.workspace);
  // Generate every requested artifact before opening the destination directory.
  const sources = await deliverySources();
  const files = makeExportFiles(report, options['table-name'] || 'supplier_feed_accepted', sources);
  const directory = path.resolve(options['out-dir']);
  await fs.mkdir(path.dirname(directory), { recursive: true });
  try {
    await fs.mkdir(directory);
  } catch (failure) {
    if (failure.code === 'EEXIST') throw error('Export directory already exists; choose a new directory: ' + directory, 'OUTPUT_EXISTS');
    throw failure;
  }
  try {
    for (const [filename, content] of files) {
      await atomicWrite(path.join(directory, filename), content);
    }
  } catch (failure) {
    throw error('Export could not finish in ' + directory + ': ' + failure.message + '. Completion is marked by manifest.json.', failure.code || 'EXPORT_WRITE');
  }
  process.stdout.write(json(summary(report, { directory, files: [...files.keys()] })));
}

async function serveCommand(options) {
  const rawPort = options.port || '8765';
  if (!/^[0-9]+$/.test(rawPort)) throw error('--port must be an integer');
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw error('--port must be between 1 and 65535');
  const directory = fileURLToPath(new URL('.', import.meta.url));
  const allowed = new Map([
    ['/', ['review.html', 'text/html; charset=utf-8']],
    ['/review.html', ['review.html', 'text/html; charset=utf-8']],
    ['/supplier-report.mjs', ['supplier-report.mjs', 'text/javascript; charset=utf-8']],
    ['/review-ui.mjs', ['review-ui.mjs', 'text/javascript; charset=utf-8']],
    ['/review-ui.css', ['review-ui.css', 'text/css; charset=utf-8']]
  ]);
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed');
      return;
    }
    let pathname;
    try { pathname = new URL(request.url, 'http://127.0.0.1').pathname; }
    catch { response.writeHead(400); response.end('Invalid request'); return; }
    const entry = allowed.get(pathname);
    if (!entry) { response.writeHead(404); response.end('Not found'); return; }
    try {
      const body = await fs.readFile(path.join(directory, entry[0]));
      response.writeHead(200, { 'Content-Type': entry[1], 'Content-Length': body.length });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (failure) {
      response.writeHead(failure.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(failure.code === 'ENOENT' ? 'Package file is missing' : 'Could not read package file');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  process.stdout.write('Supplier review: http://127.0.0.1:' + port + '/\nPress Ctrl+C to stop.\n');
  server.on('error', failure => {
    process.stderr.write(json({ error: failure.code || 'SERVER_ERROR', message: failure.message }));
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => { process.exitCode = 0; }));
  }
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'help') process.stdout.write(USAGE + '\n');
  else if (command === 'compare') await compareCommand(options);
  else if (command === 'decide') await decideCommand(options);
  else if (command === 'export') await exportCommand(options);
  else if (command === 'inspect') {
    const { report } = await loadWorkspace(options.workspace);
    process.stdout.write(json(summary(report)));
  } else if (command === 'serve') await serveCommand(options);
}

main().catch(failure => {
  process.stderr.write(json({ error: failure.code || 'CLI_ERROR', message: failure.message }));
  process.exitCode = 1;
});
