// MIT. Whole geography client and MCP receiving through the original live consoles.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const selected = JSON.parse(await readFile(process.argv[2], 'utf8'));
const root = selected.sourceRoot, output = selected.outputRoot;
await mkdir(output, { mode: 0o700, recursive: true });
const { connectIatiWorkspace } = await import(pathToFileURL(join(root, 'stellar/scf-starforge-20261009/sf30-seller-sdk/iati/client.mjs')));
const { MerchantSourceWorkspaces, readSourceWorkspaceConfiguration } = await import(pathToFileURL(join(root, 'stellar-forge/mcp-merchant-operator/source-workspace.mjs')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const owner = await connectIatiWorkspace({ consoleUrl: selected.ownerConsoleUrl, timeoutMs: 900000 });
const receiver = await connectIatiWorkspace({ consoleUrl: selected.receiverConsoleUrl, timeoutMs: 900000 });
const ownerConnection = join(output, 'owner.connection'), receiverConnection = join(output, 'receiver.connection');
await writeFile(ownerConnection, selected.ownerConsoleUrl + '\n', { mode: 0o600 });
await writeFile(receiverConnection, selected.receiverConsoleUrl + '\n', { mode: 0o600 });
const configuration = join(output, 'source-workspaces.json');
await writeFile(configuration, JSON.stringify({
  schema: 'stellar-forge.source-workspace-connection.v1',
  workspaces: {
    nigeria: { label: 'Retained AidData Nigeria geography', format: 'iati', consoleUrlFile: ownerConnection },
    receiving: { label: 'Independent original receiving workspace', format: 'iati', consoleUrlFile: receiverConnection }
  }
}) + '\n', { mode: 0o600 });
const exportsDirectory = join(output, 'exports');
await mkdir(exportsDirectory, { mode: 0o700, recursive: true });
const workspaces = new MerchantSourceWorkspaces({
  sourceWorkspaces: await readSourceWorkspaceConfiguration(configuration), exportsDirectory
});
const calls = [];
const native = async (name, args = {}, workspace = 'nigeria') => {
  const result = await workspaces.call('merchant_source_iati_geography_' + name, { workspace, ...args });
  calls.push(name);
  return result;
};
try {
  const state = await owner.geographyState();
  const review = await owner.geographyReview(selected.review.id, { revision: selected.review.revision });
  assert.equal(review.report.counts.rows, selected.expected.rows);
  assert.equal(review.report.counts.activities, selected.expected.activities);
  assert.equal(review.report.counts.mapped, selected.expected.mapped);
  assert.match(state.workspaceSha256, /^[0-9a-f]{64}$/);
  const request = await owner.geographyRequest(selected.request.requestId);
  assert.equal(request.status, 'RECORDED');
  assert.deepEqual(request.request, selected.request);
  assert.equal(request.review.revision, 1);
  assert.deepEqual(await owner.geographySave(selected.request), request.review);
  assert.equal((await owner.geographyHistory(review.id)).length, 4);
  assert.equal((await owner.geographyReport(review.id, { revision: 4 })).counts.rows, selected.expected.rows);
  const page = await owner.geographyRows({ id: review.id, revision: 4, limit: 19, offset: 0 });
  assert.equal(page.total, selected.expected.rows);
  assert.equal(page.rows.length, Math.min(19, selected.expected.rows));
  assert.ok(page.rows.every(row => row.source === selected.source && typeof row.record_json === 'string'));
  const points = await owner.geographyPoints({ id: review.id, revision: 4, limit: 23, offset: 0 });
  assert.equal(points.total, selected.expected.mapped);
  assert.ok(points.rows.every(row => row.coordinate_status === 'valid'));
  const comparison = await owner.geographyCompare({ id: review.id, beforeRevision: 2, afterRevision: 3 });
  assert.deepEqual(await owner.geographyComparison(comparison.id), comparison);
  const nativeComparison = comparison.comparisons[0].native.id;
  await owner.geographyComparisonChanges(comparison.id, { native: nativeComparison, limit: 17 });
  const descriptor = await owner.geographyExport({ id: review.id, revision: 4, format: 'packet' });
  assert.equal(descriptor.id, selected.packet.id);
  assert.equal(descriptor.sha256, selected.packet.sha256);
  const response = await owner.geographyDownload(descriptor.id);
  assert.equal(response.headers.get('x-content-sha256'), descriptor.sha256);
  const packet = Buffer.from(await response.arrayBuffer());
  assert.equal(packet.length, descriptor.bytes);
  assert.equal(sha(packet), descriptor.sha256);
  await writeFile(join(output, 'complete-geography.zip'), packet, { mode: 0o600 });

  assert.equal((await native('state')).native.workspaceSha256, state.workspaceSha256);
  const inventory = (await native('reviews', { limit: 1 })).native;
  assert.ok(inventory.total >= 1 && inventory.items.length === 1);
  if (inventory.nextOffset !== null)
    await native('reviews', { offset: inventory.nextOffset, limit: 1, expectedSnapshot: inventory.snapshot });
  assert.deepEqual((await native('review', { id: review.id, revision: 4 })).native, review);
  const history = (await native('history', { id: review.id, revision: 4, limit: 2 })).native;
  assert.equal(history.total, 4);
  assert.equal(history.items.length, 2);
  const laterHistory = (await native('history', {
    id: review.id, revision: 4, offset: history.nextOffset, limit: 2, expectedSnapshot: history.snapshot
  })).native;
  assert.equal(laterHistory.items[1].revision, 4);
  assert.equal((await native('report', { id: review.id, revision: 4 })).native.counts.rows, selected.expected.rows);
  assert.deepEqual((await native('request', { requestId: selected.request.requestId })).native.request, selected.request);
  assert.equal((await native('save', { definition: selected.request })).native.revision, 1);
  assert.equal((await native('rows', { query: { id: review.id, revision: 4, offset: 0, limit: 29 } })).native.total, selected.expected.rows);
  assert.equal((await native('points', { query: { id: review.id, revision: 4, offset: 0, limit: 29 } })).native.total, selected.expected.mapped);
  assert.deepEqual((await native('compare', { definition: {
    id: review.id, beforeRevision: 2, afterRevision: 3
  } })).native, comparison);
  assert.deepEqual((await native('comparison', { id: comparison.id })).native, comparison);
  await native('changes', { id: comparison.id, native: nativeComparison, offset: 0, limit: 17 });

  const retained = await native('export', { id: review.id, revision: 4, format: 'packet' });
  assert.equal(retained.exportId, descriptor.sha256);
  assert.equal(retained.sha256, descriptor.sha256);
  assert.equal(retained.bytes, descriptor.bytes);
  assert.equal(retained.geographyArtifact, descriptor.id);
  assert.equal(retained.kind, 'geography');
  const received = (await native('receive', {
    exportId: retained.exportId, fromWorkspace: 'nigeria'
  }, 'receiving')).native;
  assert.deepEqual(received.review, review);
  assert.equal(received.requests, 4);
  const receivedRequest = await receiver.geographyRequest(selected.request.requestId);
  assert.equal(receivedRequest.status, 'RECORDED');
  assert.deepEqual(receivedRequest.request, selected.request);
  assert.deepEqual(await receiver.geographySave(selected.request), request.review);
  const typedReceive = await receiver.geographyReceivePacket({ body: packet, bytes: packet.length });
  assert.deepEqual(typedReceive.review, review);
  const receivedExport = await native('export', { id: review.id, revision: 4, format: 'packet' }, 'receiving');
  assert.equal(receivedExport.sha256, descriptor.sha256);
  assert.equal(receivedExport.bytes, descriptor.bytes);
  const html = await native('export', { id: review.id, revision: 4, format: 'html' });
  assert.equal(html.kind, 'geography-file');
  assert.equal(html.contentType, 'text/html; charset=utf-8');
  assert.equal(html.geographyFormat, 'html');
  const report = {
    schema: 'stellar-forge.iati-geography-client-receiving.v1',
    status: 'COMPLETE', review: selected.review, source: selected.source,
    coverage: selected.expected, originalWorkspaceSha256: state.workspaceSha256,
    receivingWorkspaceSha256: receivedRequest.workspaceSha256,
    methods: [...new Set(calls)].sort(), originalRequestRevision: request.review.revision,
    retainedPacket: { exportId: retained.exportId, bytes: retained.bytes, sha256: retained.sha256 },
    receivedPacket: { exportId: receivedExport.exportId, bytes: receivedExport.bytes, sha256: receivedExport.sha256 },
    retainedHtml: { exportId: html.exportId, bytes: html.bytes, sha256: html.sha256 },
    typedClient: 'original live HTTP console and full byte-verified download/upload',
    mcp: 'all fourteen geography operations, complete retained-file transfer and original request replay'
  };
  assert.equal(report.methods.length, 14);
  await writeFile(join(output, 'complete-receiving.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
} finally {
  await workspaces.close();
  await Promise.allSettled([owner.dispose(), receiver.dispose()]);
}
