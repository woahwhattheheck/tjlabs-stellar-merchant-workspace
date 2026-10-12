#!/usr/bin/env node
// One complete native operator journey using two unchanged original government packages.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { startOcdsServer } from '../server.mjs';
import { OcdsClient } from '../client.mjs';
import { OcdsWorkspace } from '../workspace.mjs';

const { values } = parseArgs({ options: { out: { type: 'string' }, browser: { type: 'boolean' } } });
const out = values.out ? resolve(values.out) : await mkdtemp(join(tmpdir(), 'ocds-native-'));
await mkdir(out, { recursive: true, mode: 0o700 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = [1, 2].map(number => fileURLToPath(new URL('./source/cdmx-release-package-0' + number + '.json', import.meta.url)));
const expectedHashes = [
  '593f7453f774b88164dc2044f88b68045c4644b8fb855f713c7aabe7b4e4c10e',
  'e7c068c49249aae9143d5814b2309e1d894737495e8bc2e6efe80ab00192d3cb'
];
const expectedBytes = [24612, 12218];
const originals = await Promise.all(paths.map(path => readFile(path)));
const summary = { schema: 'starforge.ocds.native-journey.v1', startedAt: new Date().toISOString(),
  node: process.version, output: out, status: 'running', stages: [] };
const stage = (name, result) => { summary.stages.push({ name, ...result }); process.stdout.write(name + '\n'); };
const retain = (name, body) => writeFile(join(out, name), typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
let serviceA, serviceB, browserService, cliProcess;
try {
  originals.forEach((bytes, index) => { assert.equal(bytes.length, expectedBytes[index]); assert.equal(hash(bytes), expectedHashes[index]); });
  stage('Original government source bytes', { sources: originals.map((bytes, index) => ({ file: paths[index], bytes: bytes.length, sha256: hash(bytes) })) });
  serviceA = await startOcdsServer({ directory: join(out, 'operator'), operator: 'native-journey', title: 'Procurement operating workspace' });
  const clientA = new OcdsClient(serviceA.origin);
  const html = await fetch(serviceA.origin).then(response => { assert.equal(response.status, 200); return response.text(); });
  assert.ok(html.includes('id="open-import"'));
  for (let index = 0; index < originals.length; index++) {
    const rawText = originals[index].toString('utf8'), document = JSON.parse(rawText);
    await clientA.importDocument(document, { rawText, label: 'Original CDMX ' + (index + 1), url: document.uri });
  }
  let view = await clientA.workspace();
  assert.equal(view.projects.length, 2);
  assert.equal(view.projects.reduce((total, project) => total + project.entries.length, 0), 4);
  assert.deepEqual(view.sources.map(source => source.sha256).sort(), [...expectedHashes].sort());
  for (const source of view.sources) assert.equal(hash((await clientA.source(source.id)).body), source.sha256);
  const equipment = view.projects.find(project => project.ocid.endsWith('063-2015'));
  const bentley = view.projects.find(project => project.ocid.endsWith('065-2015'));
  const compareProject = async project => {
    const editions = [...project.entries].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    return clientA.compare(editions[0].id, editions[1].id);
  };
  const equipmentDiff = await compareProject(equipment), bentleyDiff = await compareProject(bentley);
  assert.deepEqual(equipmentDiff.changes.map(change => change.path).sort(), ['/date', '/id']);
  assert.equal(bentleyDiff.changes.filter(change => change.type === 'added' && change.path.endsWith('/exchangeRate') && change.after === 17.7526).length, 2);
  assert.equal(bentleyDiff.changes.filter(change => change.path.endsWith('/dateexchangeRate') && change.before === null && change.after === '2016-03-09T00:00:00-06:00').length, 2);
  assert.equal(bentleyDiff.changes.some(change => change.path.endsWith('/amount')), false);
  await retain('original-edition-comparisons.json', { equipment: equipmentDiff, bentley: bentleyDiff });
  stage('Import, original edition selection and exact change comparison', { processes: 2, editions: 4, equipmentChanges: equipmentDiff.counts, bentleyChanges: bentleyDiff.counts });

  await clientA.updateReview(bentley.ocid, { expectedRevision: 0, disposition: 'reviewing', owner: 'Procurement team',
    nextAction: 'Check the two published exchange-rate fields', note: 'Review saved during the native operator journey.', shortlisted: true });
  await assert.rejects(() => clientA.updateReview(bentley.ocid, { expectedRevision: 0, note: 'Stale edit' }), error => error.status === 409);
  const reports = {};
  for (const format of ['json', 'csv', 'html']) {
    const report = await clientA.report({ format });
    assert.ok(report.body.includes(bentley.ocid) && report.body.includes(equipment.ocid));
    if (format === 'json') {
      const data = JSON.parse(report.body);
      assert.equal(data.entries.length, 4);
      assert.equal(data.sources.length, 2);
      assert.deepEqual(data.sources.map(source => hash(source.body)).sort(), [...expectedHashes].sort());
    }
    await retain('procurement-report.' + format, report.body);
    reports[format] = { bytes: report.bytes, sha256: hash(report.body) };
  }
  stage('Saved review, conflicting editor and complete reports', { reviewRevision: 1, reports });

  const firstPacket = await clientA.exportPackage();
  await retain('procurement-workspace.json', firstPacket);
  serviceB = await startOcdsServer({ directory: join(out, 'receiver'), operator: 'receiving-team' });
  const clientB = new OcdsClient(serviceB.origin);
  const firstReceiving = await clientB.receivePackage(firstPacket, 0);
  assert.equal(firstReceiving.projects.length, 2);
  assert.equal(firstReceiving.projects.find(project => project.ocid === bentley.ocid).review.owner, 'Procurement team');
  const revisionBeforeRepeat = firstReceiving.workspace.revision;
  const repeat = await clientB.receivePackage(firstPacket, revisionBeforeRepeat);
  assert.equal(repeat.receiving.repeated, true);
  assert.equal(repeat.workspace.revision, revisionBeforeRepeat);
  await clientB.updateReview(bentley.ocid, { expectedRevision: 1, owner: 'Receiving team', note: 'Receiver review retained during handoff.' });
  await clientA.updateReview(bentley.ocid, { expectedRevision: 1, owner: 'Origin team', note: 'Origin has a newer independent review.' });
  const secondPacket = await clientA.exportPackage();
  const beforeMerge = await clientB.workspace();
  const merged = await clientB.receivePackage(secondPacket, beforeMerge.workspace.revision);
  assert.equal(merged.projects.find(project => project.ocid === bentley.ocid).review.owner, 'Receiving team');
  assert.ok(merged.receiving.conflicts.some(conflict => conflict.code === 'REVIEW_PRESERVED' && conflict.receivedReview.owner === 'Origin team'));
  const receivingRecord = await clientB.receiving(secondPacket.packageId);
  assert.equal(receivingRecord.sourceReviews.find(review => review.ocid === bentley.ocid).owner, 'Origin team');
  const onwardPacket = await clientB.exportPackage();
  const onward = new OcdsWorkspace(join(out, 'onward-receiver'), { operator: 'onward-team' });
  try {
    const result = onward.receivePackage(onwardPacket, { expectedRevision: 0 });
    assert.equal(result.projects.length, 2);
    assert.equal(onward.getReceiving(secondPacket.packageId).conflicts[0].receivedReview.owner, 'Origin team');
  } finally { onward.close(); }
  await serviceB.close(); serviceB = null;
  const reopened = new OcdsWorkspace(join(out, 'receiver'), { operator: 'reopened-team' });
  try {
    assert.equal(reopened.view().projects.find(project => project.ocid === bentley.ocid).review.owner, 'Receiving team');
    assert.deepEqual(reopened.view().sources.map(source => source.sha256).sort(), [...expectedHashes].sort());
  } finally { reopened.close(); }
  stage('Portable receiving, repeat, conflict custody and SQLite reopen', { firstPackage: firstPacket.packageId, secondPackage: secondPacket.packageId, onwardPackage: onwardPacket.packageId });

  const { prepareMerchant, previewMerchant } = await import('../merchant.mjs');
  const prepared = await prepareMerchant(serviceA.workspace, { scope: 'all', ocids: [equipment.ocid],
    expectedRevision: serviceA.workspace.metadata().revision, defaultLimit: 1, maxLimit: 1 });
  const transportRows = [], cursors = new Set();
  let query = { where_ocid: equipment.ocid, limit: '1' }, nativePages = 0;
  for (;;) {
    const { result, snapshot } = await previewMerchant(prepared.directory, query, { expectedBundleSha256: prepared.bundleSha256 });
    assert.equal(result.status, 200); assert.equal(snapshot, prepared.bundle.dataset.snapshot);
    const page = result.body;
    transportRows.push(...page.rows); nativePages++;
    if (page.page.nextCursor === null) break;
    assert.equal(cursors.has(page.page.nextCursor), false, 'Original dataset repeated a cursor');
    cursors.add(page.page.nextCursor);
    query = { ...query, cursor: page.page.nextCursor };
  }
  assert.ok(nativePages >= 2);
  const first = transportRows[0];
  assert.equal(transportRows.length, first.part_count);
  const parts = transportRows.sort((a, b) => a.part_index - b.part_index).map((row, index) => {
    assert.equal(row.part_index, index); assert.equal(row.package_id, first.package_id);
    const part = Buffer.from(row.payload_base64, 'base64'); assert.equal(hash(part), row.part_sha256); return part;
  });
  const packageBytes = Buffer.concat(parts);
  assert.equal(packageBytes.length, first.payload_bytes); assert.equal(hash(packageBytes), first.payload_sha256);
  const merchantPacket = JSON.parse(packageBytes.toString('utf8'));
  assert.equal(merchantPacket.packageId, first.package_id);
  assert.deepEqual(merchantPacket.reviews, []);
  const consumer = new OcdsWorkspace(join(out, 'merchant-package-receiver'), { operator: 'dataset-consumer' });
  try {
    const result = consumer.receivePackage(merchantPacket, { expectedRevision: 0 });
    assert.equal(result.projects.length, 1);
    assert.equal(result.projects[0].entries.length, 2);
    assert.equal(hash(consumer.getSource(expectedHashes[0]).body), expectedHashes[0]);
  } finally { consumer.close(); }
  await retain('merchant-package.json', merchantPacket);
  stage('Original SF30 merchant snapshot and all native dataset pages', { snapshot: prepared.bundle.dataset.snapshot, bundleSha256: prepared.bundleSha256, nativePages, transportRows: transportRows.length, reconstructedPackage: merchantPacket.packageId });

  stage('Original native MCP declaration, open, read, export and shutdown', await runOcdsMcp({
    repoRoot: fileURLToPath(new URL('../../../../../', import.meta.url)), workspaceDirectory: join(out, 'operator'), outDirectory: out }));

  if (values.browser) {
    browserService = await startOcdsServer({ directory: join(out, 'browser-operator'), operator: 'browser-journey' });
    const { runBrowserJourney } = await import('./browser-journey.mjs');
    const result = await runBrowserJourney({ origin: browserService.origin, sourcePaths: paths, outDirectory: out });
    stage('Browser import, comparison, review, exports and layouts', result);
    await browserService.close(); browserService = null;
  }

  await serviceA.close(); serviceA = null;
  const cliPath = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  cliProcess = spawn(process.execPath, [cliPath, 'serve', '--workspace', join(out, 'operator'), '--operator', 'cli-journey', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '', stdout = '';
  cliProcess.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => cliProcess.once('exit', (code, signal) => resolve({ code, signal })));
  const announced = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CLI startup timed out: ' + stderr)), 30000);
    cliProcess.once('error', error => { clearTimeout(timer); reject(error); });
    cliProcess.stdout.on('data', chunk => {
      stdout += chunk;
      const newline = stdout.indexOf('\n');
      if (newline >= 0) {
        try { const value = JSON.parse(stdout.slice(0, newline)); clearTimeout(timer); resolve(value); }
        catch (error) { clearTimeout(timer); reject(error); }
      }
    });
    cliProcess.once('exit', code => { clearTimeout(timer); reject(new Error('CLI exited before startup, code ' + code + ': ' + stderr)); });
  });
  assert.equal(announced.schema, 'stellar-forge.ocds-startup.v1');
  assert.equal(announced.operator, 'cli-journey');
  const health = await fetch(announced.origin + '/health').then(response => response.json());
  assert.equal(health.workspace.id, announced.workspaceId);
  cliProcess.kill('SIGTERM');
  const exit = await exited; cliProcess = null;
  assert.equal(exit.code, 0);
  stage('CLI startup contract and clean shutdown', { workspaceId: announced.workspaceId, exitCode: exit.code });
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed'; summary.error = { name: error.name, code: error.code, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  cliProcess?.kill('SIGTERM');
  for (const service of [browserService, serviceB, serviceA]) if (service) await service.close().catch(() => {});
  summary.finishedAt = new Date().toISOString();
  await retain('journey.json', summary);
  process.stdout.write(JSON.stringify({ status: summary.status, output: out, stages: summary.stages.length, ...(summary.error ? { error: summary.error.message } : {}) }) + '\n');
}

async function runOcdsMcp({ repoRoot, workspaceDirectory, outDirectory }) {
  const { realpath } = await import('node:fs/promises');
  const { pathToFileURL } = await import('node:url');
  const directory = await realpath(workspaceDirectory), exportsDirectory = join(outDirectory, 'mcp-exports');
  await mkdir(exportsDirectory, { recursive: true, mode: 0o700 });
  const connectionFile = join(outDirectory, 'ocds-mcp-connection.json');
  await writeFile(connectionFile, JSON.stringify({ schema: 'starforge.ocds.workspace-connection.v1',
    workspaces: { procurement: { directory, label: 'Original procurement', operator: 'native-mcp-journey' } } }), { flag: 'wx', mode: 0o600 });
  const { default: declaration } = await import(pathToFileURL(join(repoRoot, 'stellar-forge/mcp-merchant-operator/providers/ocds-workspaces.mjs')).href);
  const parsed = await declaration.configuration.read(connectionFile, { hostPath: value => resolve(value) });
  const owner = declaration.create(await declaration.load(), { ocdsWorkspaces: parsed, exportsDirectory });
  try {
    const opened = await owner.call('merchant_ocds_open', { workspace: 'procurement' });
    const status = await owner.call('merchant_ocds_status', { workspace: 'procurement', collection: 'sources', limit: 1 });
    const sourceId = status.items[0]?.id;
    assert.ok(sourceId);
    const selected = await owner.call('merchant_ocds_source', { workspace: 'procurement', sourceId });
    const exported = await owner.call('merchant_ocds_export', { workspace: 'procurement', format: 'source', sourceId, expectedRevision: status.native.revision });
    assert.equal(exported.files[0]?.sha256, sourceId);
    assert.equal(selected.source.id, sourceId);
    return { provider: declaration.id, tools: declaration.tools((...args) => args).length, workspaceId: opened.native.id,
      sourceId, sourceBytes: exported.files[0].bytes, exportPublicationId: exported.publication.id };
  } finally { await owner.close(); }
}
