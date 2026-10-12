// MIT. Browser composition of the maintained SF105 onboarding and seller runtime.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, open, link, rm, lstat, readdir, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSchemaSource, inspectSchema } from '../onboarding/schema.mjs';
import { compileSubQueryMerchantPlan, prepareSubQuerySeller } from '../onboarding/prepare.mjs';
import { readSubQueryMerchantBundle, compareSubQueryMerchantSchemas, prepareSubQueryRevision } from '../onboarding/revisions.mjs';
import { createSubQueryMerchantHandlers } from '../adapter.mjs';
import { startSellerService } from '../../sf30-seller-sdk/serve.mjs';
import { digest, draftInput, inputDigest, plain } from './store.mjs';
import { referenceDirectory, localExportRecord, readProjectPaths, attachPathContext } from './paths.mjs';

const json = value => JSON.stringify(value, null, 2) + '\n';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const launcher = fileURLToPath(new URL('../launch.mjs', import.meta.url));
const conflict = message => { throw Object.assign(new Error(message), { status: 409 }); };
function parseObject(text, label) {
  let value;
  try { value = JSON.parse(text); } catch { throw new TypeError(label + ' must be valid JSON.'); }
  if (!plain(value)) throw new TypeError(label + ' must be a JSON object.');
  return value;
}
export async function inspectDraftSchema(schemaText) {
  if (typeof schemaText !== 'string' || Buffer.byteLength(schemaText) > 1024 * 1024)
    throw new TypeError('Schema source must be at most 1 MiB.');
  const compiled = await compileSchemaSource(schemaText);
  return { sourceSha256: compiled.sourceSha256, format: compiled.format,
    provenance: compiled.provenance, inspection: await inspectSchema(compiled) };
}
function draftSources(value) {
  const input = draftInput(value);
  const schemaSource = compileSchemaSource(input.schemaText);
  const queries = parseObject(input.queriesText, 'Approved queries');
  const plan = parseObject(input.planText, 'Merchant plan');
  return { input, schemaSource, queries, plan };
}
function merchantReview(input, schemaSource, compiled) {
  return { inputDigest: inputDigest(input), sourceSha256: schemaSource.sourceSha256,
    format: schemaSource.format, review: compiled.review, service: compiled.service,
    queries: compiled.queries };
}
export async function reviewDraft(value) {
  const source = draftSources(value), compiled = compileSubQueryMerchantPlan(source);
  return { ...merchantReview(source.input, source.schemaSource, compiled), inspection: inspectSchema(source.schemaSource) };
}
export async function fingerprints(folder, prefix = '') {
  const files = [];
  for (const entry of await readdir(join(folder, prefix), { withFileTypes: true })) {
    const name = join(prefix, entry.name), path = join(folder, name);
    if (entry.isDirectory()) files.push(...await fingerprints(folder, name));
    else if (entry.isFile()) {
      const stat = await lstat(path);
      if (stat.size > 8 * 1024 * 1024) throw new TypeError('Generated package file exceeds 8 MiB.');
      const bytes = await readFile(path);
      files.push({ name, bytes: bytes.length, sha256: digest(bytes) });
    } else throw new TypeError('Generated package contains a nonregular file.');
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}
async function immutableFile(path, bytes) {
  const temporary = join(dirname(path), '.' + randomUUID() + '.merchant-next');
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    await link(temporary, path);
    const folder = await open(dirname(path), 'r');
    try { await folder.sync(); } finally { await folder.close(); }
  } finally { await rm(temporary, { force: true }); }
}
async function freezeDraft(store, saved, options = {}) {
  const exportId = options.exportId ?? randomUUID();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(exportId))
    throw new TypeError('Use the original preparation attempt UUID.');
  const selectedTask = join(store.packages, saved.id + '-r' + saved.revision + '-preparation-' + exportId);
  if (options.task !== undefined && options.task !== selectedTask)
    throw new TypeError('The native attempt must use its original private package path.');
  const task = options.task ?? join(store.packages, saved.id + '-r' + saved.revision + '-' + exportId.slice(0, 8));
  await mkdir(task, { mode: 0o700 });
  const source = join(task, 'input'); await mkdir(source, { mode: 0o700 });
  const schemaFile = join(source, 'schema-source.' + (saved.input.schemaText.trimStart().startsWith('{') ? 'json' : 'graphql'));
  const queriesFile = join(source, 'queries.json'), planFile = join(source, 'plan.json');
  for (const [path, text] of [[schemaFile, saved.input.schemaText], [queriesFile, saved.input.queriesText], [planFile, saved.input.planText]])
    await immutableFile(path, text);
  const folder = await open(store.packages, 'r');
  try { await folder.sync(); } finally { await folder.close(); }
  return { exportId, task, schemaFile, queriesFile, planFile };
}
async function retainExport({ exportId, saved, prepared, reviewed, evolution, physicalDirectory }) {
  const directory = prepared.directory, actual = physicalDirectory ?? directory, files = await fingerprints(actual);
  const record = { id: exportId, createdAt: new Date().toISOString(), draftRevision: saved.revision,
    inputDigest: saved.inputDigest, directory, files, prepared,
    service: reviewed.service, queries: reviewed.queries, review: reviewed.review,
    ...(evolution ? { evolution } : {}) };
  const retained = json(record);
  if (Buffer.byteLength(retained) > 8 * 1024 * 1024) throw new TypeError('Saved export record exceeds 8 MiB.');
  await immutableFile(join(dirname(actual), 'workspace-export.json'), retained);
  return { record, reference: { id: record.id, createdAt: record.createdAt,
    draftRevision: record.draftRevision, inputDigest: record.inputDigest,
    directory: record.directory, recordSha256: digest(retained) } };
}
/** The original exporter remains the only source of merchant package files. */
export async function exportDraft(store, saved, options = {}) {
  const reviewed = await reviewDraft(saved.input), frozen = await freezeDraft(store, saved, options);
  const prepared = await prepareSubQuerySeller({ ...frozen, directory: join(frozen.task, 'merchant') });
  return retainExport({ exportId: frozen.exportId, saved, prepared, reviewed });
}
export async function readExport(reference) {
  const path = join(dirname(referenceDirectory(reference)), 'workspace-export.json'), stat = await lstat(path);
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new TypeError('Saved export record is unavailable.');
  const bytes = await readFile(path);
  if (digest(bytes) !== reference.recordSha256) throw new TypeError('Saved export record changed.');
  const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (record.id !== reference.id || record.directory !== reference.directory || record.inputDigest !== reference.inputDigest)
    throw new TypeError('Saved export does not match this project.');
  return localExportRecord(record, reference, launcher);
}
export function exportView(record) {
  return { id: record.id, createdAt: record.createdAt, draftRevision: record.draftRevision,
    inputDigest: record.inputDigest, directory: record.directory, files: record.files,
    prepared: record.prepared, review: record.review, ...(record.evolution ? { evolution: record.evolution } : {}),
    ...(record.handover ? { handover: record.handover } : {}),
    command: `node ${quote(record.prepared.launcher ?? launcher)} --seller ${quote(record.prepared.service)} --queries ${quote(record.prepared.queries)}` };
}
export async function verifyFiles(directory, files) {
  if (!isAbsolute(directory) || !Array.isArray(files)) throw new TypeError('Choose a saved merchant export.');
  if (!(await lstat(directory)).isDirectory()) throw new TypeError('Saved package must remain a regular directory.');
  for (const expected of files) {
    const path = join(directory, expected.name), rel = relative(directory, path);
    if (isAbsolute(rel) || rel.startsWith('..')) throw new TypeError('Invalid exported file path.');
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size !== expected.bytes || digest(await readFile(path)) !== expected.sha256)
      throw new TypeError('Exported merchant files changed. Create a fresh reviewed export.');
  }
}
export async function verifyExport(record) {
  if (!plain(record)) throw new TypeError('Choose a saved merchant export.');
  await verifyFiles(record.directory, record.files);
  if (record.evolution) await verifyFiles(record.evolution.directory, record.evolution.files);
}
/** Compare only a project's retained package, using the original revision API. */
export async function compareDraft(value, baselineReference) {
  const baseline = await readExport(baselineReference);
  await verifyExport(baseline);
  const previous = await readSubQueryMerchantBundle(baseline.directory), candidate = draftSources(value);
  const { review, prepared } = compareSubQueryMerchantSchemas({ previous, candidate });
  const candidateDigest = inputDigest(candidate.input);
  return { inputDigest: candidateDigest,
    baseline: { id: baseline.id, draftRevision: baseline.draftRevision, directory: baseline.directory },
    comparisonDigest: digest(json({ baseline: baselineReference.recordSha256, inputDigest: candidateDigest, review })),
    review, merchant: prepared ? merchantReview(candidate.input, candidate.schemaSource, prepared) : null };
}
/** Keep the revised merchant, exact baseline copy and native review together. */
export async function reviseDraft(store, saved, baselineReference, expectedComparisonDigest, options = {}) {
  const compared = await compareDraft(saved.input, baselineReference);
  if (typeof expectedComparisonDigest !== 'string' || compared.comparisonDigest !== expectedComparisonDigest)
    conflict('The revision comparison changed. Compare this saved draft and baseline again.');
  if (!compared.review.ready) throw new TypeError(compared.review.candidateValidation.error.message);
  const frozen = await freezeDraft(store, saved, options);
  const revision = await prepareSubQueryRevision({ ...frozen,
    previousDirectory: referenceDirectory(baselineReference), directory: join(frozen.task, 'revised') });
  const report = JSON.parse(await readFile(revision.report, 'utf8'));
  if (json(report) !== json(compared.review)) conflict('Prepared revision differs from its reviewed inputs. Compare again.');
  const evolution = { schema: 'stellar-forge.graphql-workspace-evolution.v1',
    baselineExportId: baselineReference.id, baselineDraftRevision: baselineReference.draftRevision,
    baselineDirectory: referenceDirectory(baselineReference), comparisonDigest: compared.comparisonDigest,
    directory: revision.directory, previousDirectory: revision.previousDirectory,
    review: revision.review, report: revision.report, manifest: revision.manifest,
    summary: revision.summary, previous: report.previous, candidate: report.candidate,
    files: await fingerprints(revision.directory) };
  return retainExport({ exportId: frozen.exportId, saved, prepared: revision.prepared,
    reviewed: compared.merchant, evolution });
}
/** Snapshot only this original attempt; partial output is never deleted or reused. */
export async function snapshotPreparationFiles(store, task) {
  if (typeof task !== 'string' || !/^packages\/[A-Za-z0-9][A-Za-z0-9_-]*-r[1-9]\d*-preparation-[a-f0-9-]{36}$/.test(task))
    throw new TypeError('Choose an original native preparation task.');
  const path = join(store.root, task);
  try {
    const stat = await lstat(path);
    if (!stat.isDirectory() || await realpath(path) !== path) throw new TypeError('The native attempt path changed.');
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = (await fingerprints(path)).map(file => ({ ...file, name: task + '/' + file.name }));
  if (files.length > 512 || files.reduce((sum, file) => sum + file.bytes, 0) > 256_000_000)
    throw new TypeError('The retained native attempt exceeds its file transport bounds.');
  return files;
}
function sameJson(a, b) { return json(a) === json(b); }
async function exactSourceFile(path, value) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size !== Buffer.byteLength(value) || !(await readFile(path)).equals(Buffer.from(value)))
    conflict('A frozen native preparation input changed.');
}
function nativePrepared(directory, reviewed) {
  return { directory, service: join(directory, 'service.json'), queries: join(directory, 'queries.json'),
    client: join(directory, 'buyer/seller-client.mjs'), review: join(directory, 'review.html'),
    manifest: join(directory, 'manifest.json'), launcher,
    routes: reviewed.review.routes.map(({ id, method, url }) => ({ id, method, url })) };
}
/** Recognize complete ORIGINAL exporter output, without running it a second time. */
export async function recoverPreparedMerchant(store, saved, preparation, attempt) {
  const task = join(store.root, attempt.task);
  const snapshots = await snapshotPreparationFiles(store, attempt.task);
  if (!snapshots.length) return null;
  const schemaName = 'schema-source.' + (saved.input.schemaText.trimStart().startsWith('{') ? 'json' : 'graphql');
  for (const [name, value] of [[schemaName, saved.input.schemaText], ['queries.json', saved.input.queriesText], ['plan.json', saved.input.planText]])
    await exactSourceFile(join(task, 'input', name), value);
  const root = preparation.kind === 'revision' ? join(task, 'revised') : task;
  const actualDirectory = join(root, 'merchant');
  let bundle;
  try { bundle = await readSubQueryMerchantBundle(actualDirectory); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!bundle.schemaSource.sourceBytes.equals(Buffer.from(saved.input.schemaText))
      || !bundle.files.get('approved-queries.original.json').equals(Buffer.from(saved.input.queriesText))
      || !bundle.files.get('merchant-plan.json').equals(Buffer.from(saved.input.planText)))
    conflict('The completed native package belongs to different source bytes.');
  const logicalTask = join(attempt.workspaceRoot, attempt.task);
  const logicalRoot = preparation.kind === 'revision' ? join(logicalTask, 'revised') : logicalTask;
  const directory = join(logicalRoot, 'merchant');
  let reviewed = await reviewDraft(saved.input), evolution;
  if (preparation.kind === 'revision') {
    const baselineReference = saved.exports.find(item => item.id === preparation.baseline.id);
    if (!baselineReference || !sameJson(baselineReference, preparation.baseline))
      conflict('The native revision lost its original baseline.');
    const compared = await compareDraft(saved.input, baselineReference);
    if (compared.comparisonDigest !== preparation.request.comparisonDigest || !compared.review.ready)
      conflict('The original native revision comparison changed.');
    const baseline = await readExport(baselineReference); await verifyExport(baseline);
    const previous = await readSubQueryMerchantBundle(join(root, 'previous'));
    const original = await readSubQueryMerchantBundle(baseline.directory);
    if (previous.files.size !== original.files.size || [...original.files].some(([name, raw]) => !previous.files.get(name)?.equals(raw)))
      conflict('The native revision did not retain the exact original baseline package.');
    for (const [name, value] of [[schemaName, saved.input.schemaText], ['approved-queries.json', saved.input.queriesText], ['merchant-plan.json', saved.input.planText]])
      await exactSourceFile(join(root, 'candidate', name), value);
    let manifest;
    try { manifest = JSON.parse(await readFile(join(root, 'revision/manifest.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (manifest.schema !== 'stellar-forge.subquery-merchant-revision.v1' || manifest.packagePathsRelativeTo !== '..'
        || !sameJson(manifest.previous, { directory: 'previous', ...previous.identity })
        || !sameJson(manifest.candidate, { directory: 'merchant', ...bundle.identity })
        || !Array.isArray(manifest.files) || manifest.files.length !== 3
        || [...manifest.files.map(file => file.name)].sort().join('|') !== 'RUN.md|review.html|review.json')
      conflict('The native revision metadata is incomplete or belongs to another package.');
    await verifyFiles(join(root, 'revision'), manifest.files);
    const report = JSON.parse(await readFile(join(root, 'revision/review.json'), 'utf8'));
    if (!sameJson(report, compared.review)) conflict('The retained revision differs from its original reviewed source.');
    reviewed = compared.merchant;
    evolution = { schema: 'stellar-forge.graphql-workspace-evolution.v1',
      baselineExportId: baselineReference.id, baselineDraftRevision: baselineReference.draftRevision,
      baselineDirectory: join(attempt.workspaceRoot, relative(store.root, baseline.directory)), comparisonDigest: compared.comparisonDigest,
      directory: logicalRoot, previousDirectory: join(logicalRoot, 'previous'),
      review: join(logicalRoot, 'revision/review.html'), report: join(logicalRoot, 'revision/review.json'),
      manifest: join(logicalRoot, 'revision/manifest.json'), summary: report.summary,
      previous: report.previous, candidate: report.candidate };
  }
  const context = await readProjectPaths(store.root, saved.id);
  try {
    const path = join(root, 'workspace-export.json'), stat = await lstat(path);
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024) conflict('The retained native export record changed.');
    const raw = await readFile(path), record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    if (record.id !== attempt.id || record.draftRevision !== saved.revision || record.inputDigest !== saved.inputDigest
        || record.directory !== directory || !sameJson(record.service, reviewed.service)
        || !sameJson(record.queries, reviewed.queries) || !sameJson(record.review, reviewed.review)
        || Boolean(record.evolution) !== Boolean(evolution)
        || evolution && Object.entries(evolution).some(([key, value]) => !sameJson(record.evolution[key], value)))
      conflict('The native export record differs from its frozen preparation.');
    const prepared = nativePrepared(directory, reviewed);
    for (const key of ['directory', 'service', 'queries', 'client', 'review', 'manifest', 'routes'])
      if (!sameJson(record.prepared?.[key], prepared[key])) conflict('The original native output paths changed.');
    const reference = { id: record.id, createdAt: record.createdAt, draftRevision: record.draftRevision,
      inputDigest: record.inputDigest, directory: record.directory, recordSha256: digest(raw) };
    const local = await readExport(attachPathContext({ ...reference }, context)); await verifyExport(local);
    return { record: local, reference };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (evolution) evolution.files = await fingerprints(root);
  const result = await retainExport({ exportId: attempt.id, saved,
    prepared: nativePrepared(directory, reviewed), reviewed, evolution, physicalDirectory: actualDirectory });
  result.record = await readExport(attachPathContext({ ...result.reference }, context));
  await verifyExport(result.record);
  return result;
}
export async function readRevisionReport(reference) {
  const record = await readExport(reference);
  if (!record.evolution) throw new TypeError('This export has no retained schema revision report.');
  await verifyExport(record);
  return { retained: true, exportId: record.id, draftRevision: record.draftRevision, inputDigest: record.inputDigest,
    baseline: { id: record.evolution.baselineExportId, draftRevision: record.evolution.baselineDraftRevision,
      directory: record.evolution.baselineDirectory },
    review: JSON.parse(await readFile(record.evolution.report, 'utf8')) };
}
export async function startDraftMerchant(record, { allowLoopback = false, facilitator } = {}) {
  await verifyExport(record);
  const handlers = createSubQueryMerchantHandlers(record.queries, { allowLoopback, env: { ...process.env } });
  let nativeFactory = null;
  if (facilitator) {
    const endpoint = new URL(facilitator);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
      throw new TypeError('Facilitator must use HTTPS without credentials, a query or a fragment.');
    const [{ HTTPFacilitatorClient }, { createNativeSellerServer }] = await Promise.all([
      import('@x402/core/server'), import('../../sf30-seller-sdk/native-factory.mjs'),
    ]);
    nativeFactory = routes => createNativeSellerServer(routes, {
      facilitatorClient: new HTTPFacilitatorClient({ url: endpoint.href.replace(/\/$/, '') }),
    });
  }
  return startSellerService({ config: record.service, handlers, nativeFactory, port: 0 });
}
