#!/usr/bin/env node
// MIT. One fictional buyer worksheet through the original native platform, client,
// retained-file reader and saved-operation CLI. Reuses the complete earlier fixture.
// No provider, listener, customer case or existing E42D financial operation is opened.
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { readFile, open, mkdir, lstat, realpath, link, unlink, rename } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { openAccountingWorkspace } from '../../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/store.mjs';
import { AccountantWorkspace } from '../../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/accountant-workspace.mjs';
import { qboBuyerRows } from '../../../stellar/scf-starforge-20261009/merchant-settlement-accounting/accountant/qbo-buyer.mjs';
import { qboCanonical } from '../../../stellar/scf-starforge-20261009/merchant-settlement-accounting/accountant/qbo.mjs';
import { parseReturnCsv } from '../../../stellar/scf-starforge-20261009/merchant-settlement-accounting/accountant/engine.mjs';
import { QBO_WORKSHEET_COLUMNS } from '../../../stellar/scf-starforge-20261009/merchant-settlement-accounting/accountant/qbo-worksheet.mjs';
import { MerchantPlatforms } from '../accounting-platforms.mjs';
import { createAccountingPlatformClient } from '../accounting-platform-client.mjs';
import { qboWorksheetFileSelection } from '../accounting-qbo-worksheets-client.mjs';
import { RetainedFileReads } from '../retained-file-reads.mjs';
import { qboWorksheetFileSelectors } from '../catalog/accounting-qbo-worksheets.mjs';
import { prepareAccountingPlatformOperation, runAccountingPlatformOperation,
  downloadAccountingQboWorksheet, downloadAccountingPlatformFile } from '../accounting-platform-cli.mjs';
import { acquireStateLease } from '../../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';

assert.equal(process.argv.length, 4,
  'Usage: node examples/qbo-worksheet-client-receiving.mjs /private/completed-fictional-worksheet /private/client-receiving');
const fixture = resolve(process.argv[2]), output = resolve(process.argv[3]);
assert(fixture !== output, 'Preserve the original completed fictional fixture separately.');
const alias = 'worksheet-fictional', at = '2026-10-12T12:00:00.000Z';
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const ids = { worksheet: uuid(101), plan: uuid(102), review: uuid(103), response: uuid(104) };
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  assert(info.isDirectory() && !info.isSymbolicLink() && !(info.mode & 0o077) &&
    (!process.getuid || info.uid === process.getuid()) && await realpath(path) === path,
  'Use an owned private original directory without symlink ancestors.');
}
async function read(path, maximum = 64 * 1024 * 1024) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    assert(info.isFile() && info.size <= maximum && (!process.getuid || info.uid === process.getuid()),
      'Keep the original bounded ordinary fixture file.');
    const bytes = await file.readFile(); assert.equal(bytes.length, info.size); return bytes;
  } finally { await file.close(); }
}
async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function sync(path) { const h = await open(path, constants.O_RDONLY); try { await h.sync(); } finally { await h.close(); } }
async function retain(name, value) {
  const bytes = Buffer.isBuffer(value) ? value : typeof value === 'string' ? Buffer.from(value) : json(value);
  const path = join(output, name); await privateDirectory(dirname(path));
  if (await exists(path)) { assert.deepEqual(await read(path), bytes, 'Preserve different retained bytes: ' + name); return path; }
  const temporary = path + '.' + randomUUID() + '.pending', h = await open(temporary, 'wx', 0o600);
  try {
    try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
    try { await link(temporary, path); }
    catch (error) { if (error.code !== 'EEXIST') throw error; assert.deepEqual(await read(path), bytes); }
    await sync(dirname(path)); assert.deepEqual(await read(path), bytes); return path;
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
const readJson = async name => JSON.parse(await read(join(output, name)));
async function retainOrRead(name, produce) {
  if (await exists(join(output, name))) return readJson(name);
  const value = await produce(); await retain(name, value); return value;
}
await privateDirectory(output);
const lease = await acquireStateLease(output);
let workspace, accountant, platforms, files, client, buyerFilesClient, providerCalls = 0, aliasReads = 0;
let blockLookup = false, loseCreateReply = false, lostInThisLifetime = false, createDispatches = 0;
const requests = [], downloadReceipts = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { providerCalls++; throw Error('This fictional native receiving does not contact any provider.'); };
const inputPaths = {
  company: 'aliases/company.json', exported: 'aliases/export.json', reopened: 'aliases/open.json',
  inspection: 'aliases/inspection.json', resolved: 'aliases/resolved.json',
  plan: 'aliases/plan.json', returned: 'aliases/returned.csv', response: 'aliases/response.json'
};
const directory = join(output, 'workspace'), operationDirectory = join(output, 'create-operation');
const transportError = () => Object.assign(Error('Fictional lost create response; original native result retained.'), { code: 'FICTIONAL_RESPONSE_LOST' });
async function moveOriginalAliases() {
  // Keep every original byte under inputs/. Change only this example's declared
  // derived aliases, as a real operator may move/change files after admission.
  const intent = await retainOrRead('alias-change-intent.json', async () => ({
    schema: 'stellar-forge.qbo-worksheet-client-alias-change.v1', planId: ids.plan,
    rows: await Promise.all(['plan', 'returned', 'company'].map(async key => ({
      key, path: inputPaths[key], originalSha256: sha(await read(join(output, inputPaths[key]))),
      replacement: { fixture: true, movedAfterOriginalCreate: true, key, planId: ids.plan }
    })))
  }));
  assert.equal(intent.planId, ids.plan);
  for (const row of intent.rows) {
    const path = join(output, row.path), wanted = json(row.replacement), current = await read(path);
    if (sha(current) === sha(wanted)) continue;
    assert.equal(sha(current), row.originalSha256, 'Preserve an unexpected changed alias.');
    const temp = path + '.' + randomUUID() + '.next', h = await open(temp, 'wx', 0o600);
    try {
      try { await h.writeFile(wanted); await h.sync(); } finally { await h.close(); }
      await rename(temp, path); await sync(dirname(path));
    } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    assert.deepEqual(await read(path), wanted);
  }
  await retain('aliases-changed.json', intent);
}
async function openOwned(issuedPath, issuedSha) {
  workspace = await openAccountingWorkspace({ directory, buyerSourceFile: issuedPath,
    buyerSourceSha256: issuedSha, buyerSourceName: 'Fictional worksheet client receiving', buyerOperator: 'fixture-operator' });
  accountant = new AccountantWorkspace(workspace);
  const handoffId = workspace.state.buyerStartup.handoffId;
  if (!workspace.state.accountantHandoffs?.some(row => row.id === handoffId)) {
    // Original create checks the same retained handoff UUID before revision/source work.
    await accountant.create({ id: handoffId, name: 'Fictional worksheet client handoff', actor: 'fixture-operator',
      revision: workspace.state.revision, buyerStartup: { sha256: issuedSha }, labels: [] });
  }
  platforms = new MerchantPlatforms(workspace, accountant, {
    buyerOnly: true, definition: { qbo: null, xero: null },
    readSource: async (key, maximum) => {
      assert(Object.hasOwn(inputPaths, key), 'Use this original fixture source alias.');
      aliasReads++; return read(join(output, inputPaths[key]), maximum);
    }
  });
  await platforms.init();
  files = new RetainedFileReads({ errorPrefix: 'ACCOUNTING', maxSnapshotBytes: 4 * 1024 * 1024 });
  const call = async (name, args) => {
    assert.equal(args.workspace, alias);
    requests.push({ tool: name, requestSha256: sha(qboCanonical(args)) });
    if (name === 'merchant_accounting_file_release') return { workspace: alias, ...(await files.release(alias, args.readId)) };
    if (name === 'merchant_accounting_file') {
      const selections = ['kind', 'planId', 'responseId', 'handoffId', 'revisionId', 'file', ...qboWorksheetFileSelectors];
      const key = qboCanonical(Object.fromEntries(selections.filter(k => args[k] !== undefined).map(k => [k, args[k]])));
      const result = await files.read({ scope: alias, key, kind: args.kind, directory,
        load: () => args.kind === 'accountant' ? accountant.file(args.handoffId, args.file, { revisionId: args.revisionId }) : platforms.file(args),
        readId: args.readId, offset: args.offset,
        limit: args.limit, expectedSha256: args.expectedSha256 });
      return { workspace: alias, ...Object.fromEntries(selections.filter(k => k !== 'file' && args[k] !== undefined).map(k => [k, args[k]])), ...result };
    }
    if (name === 'merchant_accounting_qbo_worksheet_request' && blockLookup) throw transportError();
    if (name === 'merchant_accounting_qbo_worksheet_create') {
      createDispatches++;
      const result = await platforms.call(name, args);
      await retainOrRead('actual-create-reply.json', async () => result);
      if (loseCreateReply) {
        loseCreateReply = false; blockLookup = true; lostInThisLifetime = true;
        await moveOriginalAliases();
        // This is proof of the one deliberate reply failure in this lifetime.
        await retain('intentional-reply-failure.json', {
          schema: 'stellar-forge.qbo-worksheet-client-lost-reply.v1', planId: ids.plan,
          requestSha256: result.requestSha256, nativeResultRetained: true, providerCalls: 0
        });
        throw transportError();
      }
      return result;
    }
    return platforms.call(name, args);
  };
  client = createAccountingPlatformClient({ workspace: alias, platform: 'qbo', call });
  buyerFilesClient = createAccountingPlatformClient({ workspace: alias, platform: 'buyer', call });
  return handoffId;
}
async function closeOwned() {
  const failures = [];
  try { await client?.disconnect(); } catch (error) { failures.push(error); }
  try { await buyerFilesClient?.disconnect(); } catch (error) { failures.push(error); }
  try { await files?.close(); } catch (error) { failures.push(error); }
  try { await platforms?.close(); } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, 'Original client/platform/file owners did not close.');
  await workspace?.close();
  workspace = accountant = platforms = files = client = buyerFilesClient = null;
}
async function completeDownload(inventory, name, outputName) {
  const selected = qboWorksheetFileSelection(inventory, name), path = join(output, outputName);
  if (await exists(path)) {
    const bytes = await read(path); assert.equal(bytes.length, selected.bytes); assert.equal(sha(bytes), selected.expectedSha256);
  } else await downloadAccountingQboWorksheet({ client, inventory, file: name, output: path, chunkBytes: 257 });
  const bytes = await read(path);
  assert.equal(sha(bytes), selected.expectedSha256);
  downloadReceipts.push({ name: outputName, file: name, bytes: bytes.length, sha256: sha(bytes) });
  return bytes;
}
const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
function returnedCsv(text, callback) {
  const parsed = parseReturnCsv(text, { columns: QBO_WORKSHEET_COLUMNS });
  const rows = parsed.records.map(record => Object.fromEntries(parsed.headers.map((key, i) => [key, record.values[i]])));
  callback(rows);
  return Buffer.from('\uFEFF' + parsed.headers.map(quote).join(',') + '\r\n' +
    rows.reverse().map(row => parsed.headers.map(key => quote(row[key] ?? '')).join(',')).join('\r\n') + '\r\n');
}
try {
  const originalResultBytes = await read(join(fixture, 'RESULT.json')), originalResult = JSON.parse(originalResultBytes);
  assert.equal(originalResult.schema, 'stellar-forge.qbo-worksheet-receiving.v1');
  assert.equal(originalResult.fixture, true); assert.equal(originalResult.providerCalls, 0);
  const expected = new Map(originalResult.files.map(row => [row.name, row]));
  async function original(name) {
    const bytes = await read(join(fixture, name)), entry = expected.get(name);
    assert(entry && entry.bytes === bytes.length && entry.sha256 === sha(bytes), 'Original fixture file differs: ' + name);
    return bytes;
  }
  const issued = await original('fictional-issued-source.json'), company = JSON.parse(await original('company.json'));
  const earlierHandoff = JSON.parse(await original('original-handoff.json'));
  const earlierDraft = JSON.parse(await original('reviewed-preview.json')).candidate;
  const bound = { schema: 'stellar-forge.qbo-worksheet-client-receiving-input.v1', fixture: true,
    fixture, output, fixtureResultSha256: sha(originalResultBytes), issuedSha256: sha(issued), ids };
  await retain('INPUT.json', bound);
  const issuedPath = await retain('inputs/issued.json', issued);
  await retain('inputs/company.json', company);
  if (await exists(join(output, 'RESULT.json'))) {
    const result = await readJson('RESULT.json'); assert.equal(result.inputSha256, sha(json(bound)));
    assert.equal(result.providerCalls, 0); assert.equal(result.plan.id, ids.plan);
    await openOwned(issuedPath, sha(issued));
    assert.equal((await platforms.qbo.plan(ids.plan)).integrity.sha256, result.plan.sha256);
    assert.equal(sha(await read(join(directory, 'workspace.json'))), result.finalWorkspaceSha256);
    await closeOwned(); process.stdout.write(JSON.stringify({ ...result, reentry: 'ORIGINAL_COMPLETE_RESULT' }) + '\n');
  } else {
    const handoffId = await openOwned(issuedPath, sha(issued));
    if (!(await exists(join(operationDirectory, 'request.json')))) {
      await retain('aliases/company.json', company);
      const current = await platforms.qbo.current(handoffId), rows = qboBuyerRows(current.handoff);
      const earlierByItem = new Map(qboBuyerRows(earlierHandoff).map(row => [row.itemId, row.rowId]));
      const base = { valuationBasis: earlierDraft.valuationBasis, rows: rows.map(row => {
        const earlier = earlierDraft.rows.find(item => item.rowId === earlierByItem.get(row.itemId)); assert(earlier);
        return { ...earlier, rowId: row.rowId };
      }) };
      const binding = (await client.worksheetStatus()).binding;
      const exportInput = { binding, environment: 'sandbox', id: ids.worksheet, createdAt: at, handoffId, expectedParentId: null, draft: base };
      await retain('inputs/export.json', exportInput); await retain('aliases/export.json', exportInput);
      const stateBefore = await read(join(directory, 'workspace.json'));
      const exported = await client.worksheetExport({ source: 'exported', companySource: 'company' });
      await retain('export-inventory.json', exported);
      const paged = []; for await (const page of client.worksheetPages('export', { source: 'exported', companySource: 'company' },
        { pageSize: 2, expectedResultSha256: exported.resultSha256 })) paged.push(...page.page.items);
      assert.deepEqual(paged.map(row => row.rowId).sort(), rows.map(row => row.rowId).sort());
      const worksheet = JSON.parse(await completeDownload(exported, 'worksheet.json', 'worksheet.json'));
      const originalCsv = await completeDownload(exported, 'allocations.csv', 'allocations.csv');
      await completeDownload(exported, 'account-reference.csv', 'account-reference.csv');
      const openInput = { binding, environment: 'sandbox', worksheet };
      await retain('aliases/open.json', openInput);
      const reopened = await client.worksheetOpen({ source: 'reopened', companySource: 'company' });
      assert.equal(reopened.files.find(row => row.name === 'allocations.csv').sha256, sha(originalCsv));
      const expense = rows.find(row => row.itemId === 'fictional-two'); assert(expense);
      const later = structuredClone(base); later.valuationBasis = 'Later local client basis';
      Object.assign(later.rows.find(row => row.rowId === expense.rowId), { amount: '21.00', description: 'Keep this later client edit' });
      const returned = returnedCsv(originalCsv.toString('utf8'), csv => {
        csv.find(row => row.rowType === 'JOURNAL').valuationBasis = 'Returned client worksheet basis';
        Object.assign(csv.find(row => row.rowId === expense.rowId), { amount: '19.00', valuationNote: 'Returned individual valuation' });
      });
      await retain('inputs/returned.csv', returned); await retain('aliases/returned.csv', returned);
      const inspectionInput = { ...openInput, currentDraft: later, resolutions: [] };
      await retain('aliases/inspection.json', inspectionInput);
      const unresolved = await client.worksheetInspect({ source: 'inspection', returnedSource: 'returned', companySource: 'company' });
      assert.equal(unresolved.counts.conflicts, 2); assert.equal(unresolved.preview.readyToAdopt, false);
      const conflicts = [];
      for await (const page of client.worksheetPages('inspect', { source: 'inspection', returnedSource: 'returned', companySource: 'company' },
        { view: 'conflicts', pageSize: 1, expectedResultSha256: unresolved.resultSha256 })) conflicts.push(...page.page.items);
      const resolutions = conflicts.map(row => ({ id: row.id, choice: row.field === 'amount' ? 'current' : 'returned' }));
      const resolvedInput = { ...inspectionInput, resolutions };
      await retain('inputs/resolved.json', resolvedInput); await retain('aliases/resolved.json', resolvedInput);
      const inspected = await client.worksheetInspect({ source: 'resolved', returnedSource: 'returned', companySource: 'company' });
      assert.equal(inspected.preview.readyToAdopt, true); assert.equal(inspected.preview.readyForPlan, true);
      const reviewed = JSON.parse(await completeDownload(inspected, 'worksheet-review.json', 'worksheet-review.json'));
      assert.equal(reviewed.csv.sha256, sha(returned));
      assert.equal(reviewed.candidate.rows.find(row => row.rowId === expense.rowId).amount, '21.00');
      assert.equal(reviewed.candidate.rows.find(row => row.rowId === expense.rowId).description, 'Keep this later client edit');
      assert.equal(reviewed.candidate.rows.filter(row => row.decision === 'exclude').length, 2);
      const planInput = { ...resolvedInput, previewSha256: inspected.resultSha256,
        plan: { id: ids.plan, name: 'Fictional original worksheet client journal', actor: 'fixture-operator', createdAt: at, txnDate: '2026-10-12' } };
      await retain('inputs/plan.json', planInput); await retain('aliases/plan.json', planInput);
      const preview = await client.preview('worksheet-create', { source: 'plan', returnedSource: 'returned', companySource: 'company' });
      await retain('native-preview.json', preview);
      const nativeRows = [];
      for await (const page of client.worksheetPages('plan-preview', { source: 'plan', returnedSource: 'returned', companySource: 'company' },
        { pageSize: 2, expectedResultSha256: preview.resultSha256 })) nativeRows.push(...page.page.items);
      assert.equal(nativeRows.length, 3);
      await completeDownload(preview, 'plan-input.json', 'native-create-input.json');
      const plan = JSON.parse(await completeDownload(preview, 'journal-preview.json', 'journal-preview.json'));
      assert.equal(plan.rows.length, 3); assert.equal(plan.excluded.length, 2);
      const occupied = await retain('occupied-output.json', 'Keep this unrelated original output.\n');
      const beforeOccupied = await read(occupied);
      await assert.rejects(downloadAccountingQboWorksheet({ client, inventory: exported, file: 'worksheet.json', output: occupied }));
      assert.deepEqual(await read(occupied), beforeOccupied);
      await assert.rejects(client.worksheetInspect({ source: 'resolved', sourceSha256: sha('different source'),
        returnedSource: 'returned', companySource: 'company' }), error => error.code === 'ACCOUNTING_PLATFORM_SOURCE_CHANGED');
      assert.deepEqual(await read(join(directory, 'workspace.json')), stateBefore, 'All worksheet source/inspection/preview/file reads are nonmutating.');
      await retain('read-only-result.json', { workspaceSha256: sha(stateBefore), handoffId, binding, conflicts: 2,
        included: 3, excluded: 2, returnedSha256: sha(returned), planSha256: plan.integrity.sha256, downloads: downloadReceipts });
      await prepareAccountingPlatformOperation({ directory: operationDirectory, url: 'http://127.0.0.1:8765/mcp',
        workspace: alias, platform: 'qbo', preview });
    }
    const request = JSON.parse(await read(join(operationDirectory, 'request.json')));
    assert.equal(request.operation.binding.planId, ids.plan);
    const beforeDispatch = await client.worksheetRequest({ planId: ids.plan });
    if (beforeDispatch.status === 'NOT_FOUND') {
      loseCreateReply = true;
      await assert.rejects(runAccountingPlatformOperation({ directory: operationDirectory, execute: true, client, maxWaitMs: 0 }), error => error.code === 'FICTIONAL_RESPONSE_LOST');
      assert(lostInThisLifetime);
      await retain('intentional-reply-failure-observed.json', {
        schema: 'stellar-forge.qbo-worksheet-client-observed-reply-loss.v1', planId: ids.plan,
        requestSha256: request.operation.binding.requestSha256, callerCaught: 'FICTIONAL_RESPONSE_LOST'
      });
      const retained = JSON.parse(await read(join(operationDirectory, 'state.json')));
      assert.equal(retained.submissionAttempted, true); assert.equal(retained.sendAttempts, 1);
    } else {
      assert.equal(beforeDispatch.requestSha256, request.operation.binding.requestSha256);
      await moveOriginalAliases();
    }
    await closeOwned(); blockLookup = false;
    await openOwned(issuedPath, sha(issued));
    const readsBeforeRecovery = aliasReads, recovery = await runAccountingPlatformOperation({
      directory: operationDirectory, execute: false, client, maxWaitMs: 0 });
    assert.equal(recovery.found, true); assert.equal(recovery.pending, false);
    assert.equal(aliasReads, readsBeforeRecovery, 'Reconcile the original native request before reopening former aliases.');
    assert.equal(recovery.record.id, ids.plan);
    assert.equal(recovery.record.integrity.sha256, request.operation.binding.previewSha256);
    const replay = await client.command(request.operation);
    assert.equal(replay.duplicate, true); assert.equal(aliasReads, readsBeforeRecovery);
    assert.equal(workspace.state.qboPlans.length, 1);
    await retainOrRead('recovered-original-create.json', async () => recovery);
    const detail = await platforms.qbo.detail(ids.plan);
    const reviewPreview = await retainOrRead('review-preview.json', () => client.preview('review', {
      planId: ids.plan, revision: workspace.state.revision, id: ids.review, actor: 'fixture-independent-reviewer',
      planSha256: detail.plan.integrity.sha256, note: 'Reviewed every original worksheet allocation and exact home-currency value.'
    }));
    const reviewDirectory = join(output, 'review-operation');
    await prepareAccountingPlatformOperation({ directory: reviewDirectory, url: 'http://127.0.0.1:8765/mcp', workspace: alias, platform: 'qbo', preview: reviewPreview });
    const review = await runAccountingPlatformOperation({ directory: reviewDirectory, execute: true, client, maxWaitMs: 0 });
    assert.equal(review.found, true); assert(['REVIEWED', 'BOOKED'].includes(review.record.status));
    assert.equal(review.record.review.id, ids.review);
    assert.equal(review.record.review.actor, 'fixture-independent-reviewer');
    // The fixture's exact native journal response exercises the ordinary operator-file
    // capture and accountant return. It is not an Intuit payment or provider result.
    const response = { JournalEntry: { ...detail.plan.journalEntry, Id: '90001', SyncToken: '0' } };
    await retain('inputs/response.json', response); await retain('aliases/response.json', response);
    const responsePreview = await retainOrRead('response-preview.json', () => client.preview('response-save', {
      planId: ids.plan, source: 'response', id: ids.response, name: 'Fictional original journal response',
      actor: 'fixture-accountant', createdAt: at, realmId: company.realmId, expectedParentId: null
    }));
    const responseDirectory = join(output, 'response-operation');
    await prepareAccountingPlatformOperation({ directory: responseDirectory, url: 'http://127.0.0.1:8765/mcp', workspace: alias, platform: 'qbo', preview: responsePreview });
    const captured = await runAccountingPlatformOperation({ directory: responseDirectory, execute: true, client, maxWaitMs: 0 });
    assert.equal(captured.found, true); assert.equal(captured.pending, false);
    const finalDetail = await platforms.qbo.detail(ids.plan);
    assert.equal(finalDetail.record.status, 'BOOKED');
    const captures = [];
    for (const record of finalDetail.record.responses) {
      for (const file of record.files) {
        const selection = { kind: 'qbo', planId: ids.plan, responseId: record.id, file: file.name };
        const name = 'response-files/' + record.id + '-' + file.name, destination = join(output, name);
        await privateDirectory(dirname(destination));
        if (!(await exists(destination))) await downloadAccountingPlatformFile({ client, selection,
          expectedSha256: file.sha256, output: destination, chunkBytes: 257 });
        const bytes = await read(destination); assert.equal(sha(bytes), file.sha256);
        captures.push({ name, originalName: file.name, bytes: bytes.length, sha256: file.sha256 });
      }
    }
    const originalReturn = accountant.row(finalDetail.plan.handoffId).revisions.find(row => row.id === ids.response);
    assert(originalReturn && originalReturn.id === finalDetail.record.responses.find(row => row.id === ids.response).returnId);
    const accountantFiles = [];
    for (const file of originalReturn.files) {
      const selection = { kind: 'accountant', handoffId: finalDetail.plan.handoffId, revisionId: ids.response, file: file.name };
      const name = 'accountant-return/' + file.name, destination = join(output, name);
      await privateDirectory(dirname(destination));
      if (!(await exists(destination))) await downloadAccountingPlatformFile({ client: buyerFilesClient, selection,
        expectedSha256: file.sha256, output: destination, chunkBytes: 257 });
      const bytes = await read(destination); assert.equal(sha(bytes), file.sha256);
      accountantFiles.push({ name, originalName: file.name, bytes: bytes.length, sha256: file.sha256 });
    }
    assert(accountantFiles.some(row => row.originalName === 'return.json'));
    assert(accountantFiles.some(row => row.originalName === 'buyer-return.json'));
    const finalWorkspace = await read(join(directory, 'workspace.json')), finalWorkspaceSha256 = sha(finalWorkspace);
    await closeOwned();
    await openOwned(issuedPath, sha(issued));
    const reopened = await platforms.qbo.detail(ids.plan);
    assert.equal(reopened.record.status, 'BOOKED');
    assert.equal(reopened.plan.integrity.sha256, request.operation.binding.previewSha256);
    assert.equal(sha(await read(join(directory, 'workspace.json'))), finalWorkspaceSha256);
    assert.equal(sha(await read(issuedPath)), sha(issued));
    const finalOperation = JSON.parse(await read(join(operationDirectory, 'state.json')));
    assert.equal(finalOperation.sendAttempts, 1);
    assert.equal(files.summary.activeFileReads, 0);
    await closeOwned();
    assert.equal(providerCalls, 0);
    const result = { schema: 'stellar-forge.qbo-worksheet-client-receiving.v1', fixture: true,
      inputSha256: sha(json(bound)), existingFinancialWorkspaceOpened: false, providerCalls,
      plan: { id: ids.plan, sha256: request.operation.binding.previewSha256, status: 'BOOKED', included: 3, excluded: 2 },
      originalCreateSendAttempts: finalOperation.sendAttempts, createCallsInThisLifetime: createDispatches,
      intentionalReplyFailureObserved: await exists(join(output, 'intentional-reply-failure-observed.json')),
      nativeCreateRecoveredBeforeAliasRead: true, finalWorkspaceSha256,
      reviewedBy: 'fixture-independent-reviewer', responseId: ids.response, responseFiles: captures, accountantReturnFiles: accountantFiles,
      readOnly: await readJson('read-only-result.json'), requestTrace: requests,
      outcomes: ['complete declared-source worksheet export', 'all original rows paged with one result SHA',
        'exact BOM CSV and every include/exclude choice', 'explicit three-way field decisions', 'complete retained file downloads',
        'original native plan preview', 'one saved create with original request recovery after aliases change',
        'independent journal review', 'fictional native response and original accountant return',
        'complete stopped-workspace reopen', 'zero provider or customer financial calls'] };
    await retain('RESULT.json', result); process.stdout.write(JSON.stringify(result) + '\n');
  }
} finally {
  try { await closeOwned(); }
  finally { globalThis.fetch = originalFetch; await lease.close(); }
}
