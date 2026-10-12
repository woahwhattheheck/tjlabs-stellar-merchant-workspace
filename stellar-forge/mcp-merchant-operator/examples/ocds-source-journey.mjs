// MIT. One native MCP journey over the complete original source-window delivery.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { MerchantOcdsWorkspaces, readOcdsWorkspaceConfiguration } from '../ocds-workspace.mjs';
import { definitions } from '../catalog/ocds-workspace.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

export async function runSourceWindowMcpJourney(context) {
  const directory = join(context.outDirectory, 'mcp-source-journey');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const downloaded = join(directory, 'received-original-files');
  const clientDirectory = join(directory, 'client'), receiverDirectory = join(directory, 'receiver');
  const exportsDirectory = join(directory, 'exports');
  for (const path of [clientDirectory, receiverDirectory, downloaded, exportsDirectory])
    await mkdir(path, { recursive: true, mode: 0o700 });
  const originalInputs = { record: { file: context.original.path, label: 'Original Find a Tender record', url: context.original.observation.requestedUrl } };
  for (const [index, original] of context.originalDocuments.entries())
    originalInputs['document-' + index] = { file: original.path, label: 'Acquired original document ' + (index + 1), url: original.observation.requestedUrl };
  const configPath = join(directory, 'ocds-workspaces.json');
  await writeFile(configPath, json({ schema: 'starforge.ocds.workspace-connection.v1', workspaces: {
    client: { directory: clientDirectory, inputs: originalInputs,
      sourceDeliveries: { agency: context.handoffDirectory }, operator: 'Native procurement operator' },
    receiver: { directory: receiverDirectory, sourceDeliveries: { original: downloaded }, operator: 'Receiving procurement team' },
    highway: { directory: context.executive.workspaceDirectory, operator: 'Executive Compass internal desk' }
  } }), { mode: 0o600, flag: 'wx' });
  const configuration = await readOcdsWorkspaceConfiguration(configPath);
  const config = { ocdsWorkspaces: configuration, exportsDirectory };
  let merchant = new MerchantOcdsWorkspaces(config);
  const calls = [], receipts = {};
  const call = async (name, args) => {
    const result = await merchant.call(name, args);
    calls.push({ name, workspace: args?.workspace ?? null });
    return result;
  };
  const state = async (workspace, collection) => {
    const values = [];
    let offset = 0;
    for (;;) {
      const result = await call('merchant_ocds_source_state', { workspace, collection, offset, limit: 2 });
      values.push(...result.items);
      if (result.page.nextOffset === null) { assert.equal(values.length, result.page.total); return values; }
      assert.ok(result.page.nextOffset > offset); offset = result.page.nextOffset;
    }
  };
  const download = async (workspace, publicationId, target) => {
    const listed = await call('merchant_ocds_files', { workspace, publicationId });
    for (const file of listed.files) {
      const parts = []; let offset = 0, readId;
      do {
        const chunk = await call('merchant_ocds_file_read', { workspace, publicationId, file: file.file,
          expectedSha256: file.sha256, offset, limit: 8192, ...(readId ? { readId } : {}) });
        assert.equal(chunk.offset, offset); parts.push(Buffer.from(chunk.data, 'base64'));
        readId = chunk.readId; offset = chunk.nextOffset;
      } while (offset !== null);
      const body = Buffer.concat(parts);
      assert.equal(body.length, file.bytes); assert.equal(sha256(body), file.sha256);
      await mkdir(dirname(join(target, file.file)), { recursive: true, mode: 0o700 });
      await writeFile(join(target, file.file), body, { flag: 'wx', mode: 0o600 });
    }
    return listed.files;
  };
  try {
    assert.equal(definitions.length, 37);
    assert.equal(new Set(definitions.map(value => value[0])).size, definitions.length);
    const declared = await call('merchant_ocds_workspaces', {});
    assert.equal(declared.workspaces.length, 3);
    await call('merchant_ocds_open', { workspace: 'client' });
    const incoming = await call('merchant_ocds_inputs', { workspace: 'client', sourceDelivery: 'agency' });
    const received = await call('merchant_ocds_source_handoff_receive', { workspace: 'client', sourceDelivery: 'agency',
      expectedHandoffId: incoming.handoffId, expectedRevision: 0 });
    assert.equal(received.handoffId, incoming.handoffId);
    const incomingContext = await call('merchant_ocds_source_receiving', {
      workspace: 'client', packageId: incoming.sourceOperationsPackageId });
    assert.equal(incomingContext.receiving.packageId, incoming.sourceOperationsPackageId);
    const selections = await state('client', 'selections');
    const current = selections.find(selection => selection.id === context.selectionId);
    assert.ok(current, 'The actual saved client selection must be present');
    const allowed = definitions.find(value => value[0] === 'merchant_ocds_source_selection_save')[2].selection.properties;
    const selection = Object.fromEntries(Object.entries(current).filter(([key]) => Object.hasOwn(allowed, key)));
    const saved = await call('merchant_ocds_source_selection_save', { workspace: 'client', selection, expectedRevision: current.revision });
    assert.equal(saved.selection.revision, current.revision + 1);
    const originals = await call('merchant_ocds_inputs', { workspace: 'client', input: 'record' });
    assert.equal(originals.file.sha256, context.original.observation.sha256);
    const adopted = await call('merchant_ocds_source_observation_adopt', {
      workspace: 'client', input: 'record', expectedSha256: originals.file.sha256, selectionId: current.id,
      name: 'Retained original government acquisition', observation: context.original.observation
    });
    const repeated = await call('merchant_ocds_source_observation_adopt', {
      workspace: 'client', input: 'record', expectedSha256: originals.file.sha256, selectionId: current.id,
      name: 'Retained original government acquisition', observation: context.original.observation
    });
    assert.equal(repeated.window.id, adopted.window.id);
    for (const [index, original] of context.originalDocuments.entries()) {
      const inspected = await call('merchant_ocds_inputs', { workspace: 'client', input: 'document-' + index });
      await call('merchant_ocds_source_original_import', { workspace: 'client', input: 'document-' + index,
        expectedSha256: inspected.file.sha256, selectionId: current.id, ocid: context.ocid, observation: original.observation });
    }
    const windows = await state('client', 'windows');
    const finished = windows.find(window => window.status === 'complete' && window.operation !== 'original-document-import');
    if (finished) {
      const resumed = await call('merchant_ocds_source_refresh', { workspace: 'client', windowId: finished.id });
      assert.equal(resumed.window.id, finished.id);
      assert.equal(resumed.window.status, 'complete');
      const paused = await call('merchant_ocds_source_pause', { workspace: 'client', windowId: finished.id });
      assert.equal(paused.pauseRequested, false);
      await call('merchant_ocds_source_window', { workspace: 'client', windowId: finished.id });
    }
    const reviews = await state('client', 'work');
    const review = reviews.find(item => item.ocid === context.ocid);
    if (review) {
      const detail = await call('merchant_ocds_source_review', { workspace: 'client', reviewId: review.id });
      assert.equal(detail.review.id, review.id);
      const edited = await call('merchant_ocds_source_review_save', { workspace: 'client', reviewId: review.id,
        expectedRevision: review.revision, status: 'reviewing', owner: review.owner || 'Procurement review team',
        nextAction: review.nextAction || 'Review the original publisher changes and retained attachments.' });
      assert.equal(edited.review.revision, review.revision + 1);
      await assert.rejects(() => call('merchant_ocds_source_review_save', { workspace: 'client', reviewId: review.id,
        expectedRevision: review.revision, status: 'reviewing' }), error => error.status === 409);
      receipts.assignedReview = { id: edited.review.id, revision: edited.review.revision, comparisonRetained: true };
    }
    const documents = await state('client', 'documents');
    const document = documents.find(item => item.versions?.some(version => version.sha256 === context.originalDocuments[0].observation.sha256));
    assert.ok(document, 'The original acquired document must be retained');
    const originalDocument = await call('merchant_ocds_source_document_export', { workspace: 'client', documentId: document.id,
      expectedSha256: context.originalDocuments[0].observation.sha256 });
    receipts.originalDocumentFiles = await download('client', originalDocument.publication.id, join(directory, 'document-download'));
    const source = await call('merchant_ocds_source', { workspace: 'client', sourceId: originals.file.sha256 });
    assert.equal(source.source.retrievedAt, context.original.observation.retrievedAt);
    assert.ok(source.source.importedAt); assert.equal(source.source.acquisition.completedBy, context.original.observation.completedBy);
    const beforeExport = await call('merchant_ocds_status', { workspace: 'client' });
    const handoff = await call('merchant_ocds_source_handoff_export', { workspace: 'client',
      expectedRevision: beforeExport.native.revision, ocids: [context.ocid] });
    receipts.handoffFiles = await download('client', handoff.publication.id, downloaded);
    assert.ok(receipts.handoffFiles.some(file => file.file === 'source-operations/assigned-review.html'));
    assert.ok(receipts.handoffFiles.some(file => file.file.startsWith('source-operations/documents/')));
    const manifest = JSON.parse(await readFile(join(downloaded, 'handoff.json'), 'utf8'));
    assert.equal(manifest.handoffId, handoff.handoff.handoffId);
    await call('merchant_ocds_open', { workspace: 'receiver' });
    const exact = await call('merchant_ocds_inputs', { workspace: 'receiver', sourceDelivery: 'original' });
    await assert.rejects(() => call('merchant_ocds_source_handoff_receive', { workspace: 'receiver', sourceDelivery: 'original',
      expectedHandoffId: '0'.repeat(64), expectedRevision: 0 }), error => error.code === 'SOURCE_HANDOFF_CHANGED');
    assert.equal((await call('merchant_ocds_status', { workspace: 'receiver' })).native.revision, 0);
    const receiver = await call('merchant_ocds_source_handoff_receive', { workspace: 'receiver', sourceDelivery: 'original',
      expectedHandoffId: exact.handoffId, expectedRevision: 0 });
    assert.equal(receiver.handoffId, handoff.handoff.handoffId);
    const replay = await call('merchant_ocds_source_handoff_receive', { workspace: 'receiver', sourceDelivery: 'original',
      expectedHandoffId: exact.handoffId, expectedRevision: receiver.native.revision });
    assert.equal(replay.repeated, true); assert.equal(replay.native.revision, receiver.native.revision);
    const copy = await call('merchant_ocds_source', { workspace: 'receiver', sourceId: originals.file.sha256 });
    assert.equal(copy.source.retrievedAt, source.source.retrievedAt);
    assert.equal(copy.source.importedAt, source.source.importedAt);
    assert.deepEqual(copy.source.acquisition, source.source.acquisition);
    await call('merchant_ocds_open', { workspace: 'highway' });
    const highway = await call('merchant_ocds_status', { workspace: 'highway' });
    assert.ok(highway.items.some(project => project.ocid === context.executive.ocid));
    assert.equal(highway.items.some(project => project.ocid === context.ocid), false);
    receipts.clientIsolation = { primaryOcid: context.ocid, secondOcid: context.executive.ocid };
    await merchant.close();
    merchant = new MerchantOcdsWorkspaces(config);
    await call('merchant_ocds_open', { workspace: 'receiver' });
    const reopened = await call('merchant_ocds_source_receiving', { workspace: 'receiver', packageId: exact.sourceOperationsPackageId });
    assert.equal(reopened.receiving.packageId, exact.sourceOperationsPackageId);
    const summary = { schema: 'starforge.ocds.mcp-source-journey.v1', status: 'pass',
      completedAt: new Date().toISOString(), tools: definitions.length, nativeCalls: calls.length,
      calledTools: [...new Set(calls.map(value => value.name))].sort(), handoffId: handoff.handoff.handoffId,
      sourceOperationsPackageId: exact.sourceOperationsPackageId, ...receipts };
    await writeFile(join(directory, 'mcp-source-journey.json'), json({ ...summary, calls }), { flag: 'wx', mode: 0o600 });
    return summary;
  } finally { await merchant.close(); }
}
