// MIT License. Continue the original installed five-invoice journey through complete project handover.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, link, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUEST = 'stellar-forge.merchant-portable-request.v1';
const RESULT = 'stellar-forge.merchant-portable-result.v1';
const sha = value => createHash('sha256').update(value).digest('hex');
const readJSON = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const pin = record => ({ bytes: Number(record.bytes), sha256: record.sha256 });
const invoiceIdentity = reads => reads.invoices.map(invoice => ({
  merchantOrderId: invoice.merchantOrderId, paymentId: invoice.paymentId,
  reference: invoice.reference, title: invoice.title, bytes: invoice.bytes, sha256: invoice.sha256,
  historySha256: invoice.historySha256, envelopeSha256: invoice.envelope?.sha256,
})).sort((left, right) => left.merchantOrderId.localeCompare(right.merchantOrderId));

async function settleDownload(download, path, expected, { directory, originalFile }) {
  await directory(dirname(path));
  const temporary = path + '.browser-download';
  await download.saveAs(temporary);
  assert.equal(await download.failure(), null);
  const selected = await originalFile(temporary, expected);
  const handle = await open(temporary, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
  try { await link(temporary, path); }
  catch (error) { if (error.code !== 'EEXIST') throw error; await originalFile(path, expected); }
  const parent = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await parent.sync(); await unlink(temporary); await parent.sync(); } finally { await parent.close(); }
  return { ...selected, path };
}

/** The browser selects and downloads its own original retained export. */
export async function exportProjectFromBrowser({ page, opening, scenario, root, identity, get,
  save, directory, originalFile, capture, stopped, retainCompleted }) {
  const initial = (await get(opening.url, scenario.operatorToken, '/api/project')).json();
  assert.equal(initial.available, true);
  const operation = identity('portable-browser-export'), selectionPath = join(root, 'portable/export-selection.json');
  const selected = { operation, storeId: initial.storeId, sourceSha256: initial.sourceSha256 };
  await save(selectionPath, selected, { original: true });
  let record = initial.exports.find(value => value.operation === operation);
  if (record?.state !== 'COMPLETE') {
    await page.evaluate(({ storeId, operation }) => {
      sessionStorage.setItem('merchant.pending-project-export.v1.' + storeId, operation);
    }, selected);
    const acknowledgement = page.waitForResponse(response => new URL(response.url()).origin === new URL(opening.url).origin &&
      new URL(response.url()).pathname === '/api/project/exports' && response.request().method() === 'POST', { timeout: 30000 });
    await page.locator('#export-project').click();
    const accepted = await acknowledgement;
    assert([200, 202].includes(accepted.status()), 'Receive the actual original export request response.');
    record = await accepted.json(); assert.equal(record.operation, operation);
    for (;;) {
      stopped();
      record = (await get(opening.url, scenario.operatorToken, '/api/project/exports/' + operation)).json();
      if (record.state === 'COMPLETE') break;
      assert.equal(record.state, 'PREPARING', 'Continue the original export after its actual native error: ' + (record.error ?? record.state));
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  assert.equal(record.storeId, selected.storeId);
  assert.equal(record.snapshot.tableCounts.merchant_orders, '5');
  assert.equal(record.source.sha256, selected.sourceSha256);
  await page.locator('#refresh').click();
  const row = page.locator('#project-export-rows tr').filter({ hasText: operation });
  await row.getByRole('button', { name: 'Download project', exact: true }).waitFor({ state: 'visible' });
  await page.locator('#project-panel').evaluate(element => element.scrollIntoView({ block: 'start' }));
  await capture('merchant-portable-export.png');
  const downloadEvent = page.waitForEvent('download', { timeout: 30000 });
  await row.getByRole('button', { name: 'Download project', exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'merchant-project-' + operation + '.zip');
  const archive = await settleDownload(download, join(root, 'downloads/portable/merchant-project-' + operation + '.zip'),
    pin(record.archive), { directory, originalFile });

  const manifest = (await get(opening.url, scenario.operatorToken,
    '/api/project/exports/' + operation + '/manifest')).json();
  const manifestEvent = page.waitForEvent('download', { timeout: 30000 });
  await row.getByRole('button', { name: 'Contents', exact: true }).click();
  const manifestDownload = await manifestEvent;
  const manifestPath = join(root, 'downloads/portable/merchant-project-' + operation + '-contents.json');
  await directory(dirname(manifestPath)); await manifestDownload.saveAs(manifestPath);
  assert.equal(await manifestDownload.failure(), null);
  const bytes = await readFile(manifestPath);
  assert.deepEqual(JSON.parse(bytes), manifest);
  const manifestFile = await originalFile(manifestPath, { bytes: bytes.length, sha256: sha(bytes) });
  assert.equal(manifest.schema, 'stellar-forge.merchant-portable-project.v1');
  assert.equal(manifest.original.storeId, selected.storeId);
  assert.equal(manifest.source.sha256, selected.sourceSha256);
  const result = { operation, storeId: selected.storeId, record, archive, manifestFile, manifest };
  await retainCompleted('portable-original-browser-export', () =>
    save(join(root, 'portable/export-complete.json'), result, { original: true }));
  return result;
}

/** Every external command keeps one selected request and the native programme's
 * existing close/output retention. The original receive UUID is reused on retry.
 */
export async function receivePortableProject({ root, sourceRoot, scenario, completed, exported, firstReads,
  identity, get, save, directory, originalFile, databaseSnapshot, receiveReads, receiveBrowser,
  runCommand, stopped, retainCompleted }) {
  const resultPath = join(root, 'portable/complete.json'), previous = await readJSON(resultPath);
  if (previous) { await verifyPortableReceiving(previous, { originalFile }); return previous; }
  await originalFile(exported.archive.path, exported.archive);
  await originalFile(exported.manifestFile.path, exported.manifestFile);
  const sourceCLI = join(sourceRoot, 'products/x402api-merchant-workspace/portable.mjs');
  async function native(label, action, fields, cli = sourceCLI) {
    stopped();
    const request = { schema: REQUEST, action, operation: identity(label), ...fields };
    const requestPath = join(root, 'portable/requests/' + label + '.json');
    await save(requestPath, request, { original: true });
    const command = { executable: process.execPath, args: ['--max-old-space-size=256', cli, action, '--request', requestPath], cwd: root };
    const ended = await runCommand(label, command);
    const value = JSON.parse(ended.stdout);
    assert.equal(value.schema, RESULT); assert.equal(value.state, 'COMPLETE');
    assert.equal(value.action, action); assert.equal(value.operation, request.operation);
    await retainCompleted(label + '-original-native-result', () =>
      save(join(root, 'portable/native/' + label + '.json'), value, { original: true }));
    return value;
  }
  const archiveSelection = { archive: exported.archive.path, archiveSha256: exported.archive.sha256 };
  const inspected = await native('portable-inspect', 'inspect', archiveSelection);
  assert.deepEqual(inspected.manifest, exported.manifest);
  const receiving = await native('portable-receive', 'receive',
    { ...archiveSelection, destination: join(root, 'portable/received') });
  assert.equal(receiving.received.storeId, exported.storeId);
  assert.equal(receiving.manifest.snapshot.allRowsSha256, inspected.manifest.snapshot.allRowsSha256);
  assert.equal(receiving.received.originalRowsSha256, inspected.manifest.snapshot.allRowsSha256);
  const received = receiving.received, database = join(received.workspaceDirectory, 'merchant.sqlite3');
  const baselinePath = join(root, 'portable/snapshots/received.private.json');
  const baseline = await readJSON(baselinePath) ?? databaseSnapshot(database);
  await save(baselinePath, baseline, { original: true });
  const serverModule = await import(pathToFileURL(join(received.sourceDirectory, 'products/x402api-merchant-workspace/server.mjs')));
  const workspaceModule = await import(pathToFileURL(join(received.sourceDirectory, 'products/x402api-merchant-workspace/workspace.mjs')));
  const projectModule = await import(pathToFileURL(join(received.sourceDirectory, 'products/x402api-merchant-workspace/portable.mjs')));
  const reviewToken = sha(identity('portable-review-token'));
  // Only the review operator reference is supplied for the received read-only
  // application. The actual original tenant and webhook environment are absent.
  const reviewConfiguration = await serverModule.loadMerchantReviewConfiguration(received.reviewConfigPath,
    { allowLoopback: true, env: { MERCHANT_REVIEW_OPERATOR_TOKEN: reviewToken } });
  const reviewScenario = { ...scenario, operatorToken: reviewToken };
  let currentHost = null;
  async function openReview(label, visual) {
    stopped();
    const savedPath = join(root, 'portable/' + label + '.json'), previous = await readJSON(savedPath);
    if (previous) return previous;
    const workspace = await workspaceModule.openMerchantReview({ directory: received.workspaceDirectory,
      ...reviewConfiguration, allowLoopback: true });
    let reviewed;
    try {
      currentHost = await serverModule.startMerchantServer({ workspace, operatorToken: reviewToken, port: 0 });
      const opening = { url: currentHost.url, operationId: identity(label) };
      const reads = await receiveReads(opening, reviewScenario, completed, label);
      assert.equal(reads.mode, 'review');
      assert.deepEqual(invoiceIdentity(reads), invoiceIdentity(firstReads));
      const browser = visual ? await receiveBrowser(opening, reviewScenario, reads,
        { label, review: true, exportProject: false }) : null;
      reviewed = { reads, browser };
    } finally {
      if (currentHost) { await currentHost.close(); currentHost = null; }
      else await workspace.close();
    }
    reviewed.allUserRowsSha256 = databaseSnapshot(database).allUserRowsSha256;
    assert.equal(reviewed.allUserRowsSha256, baseline.allUserRowsSha256);
    await retainCompleted(label + '-original-review', () => save(savedPath, reviewed, { original: true }));
    return reviewed;
  }
  const review = await openReview('portable-review', true);
  assert.equal(review.allUserRowsSha256, baseline.allUserRowsSha256);
  const reopened = await openReview('portable-review-reopened', false);
  assert.equal(reopened.allUserRowsSha256, baseline.allUserRowsSha256);

  const env = { MERCHANT_LOCAL_TENANT: scenario.credential, MERCHANT_LOCAL_OPERATOR: scenario.operatorToken,
    MERCHANT_LOCAL_WEBHOOK: scenario.webhookSecretsByVersion['1'] };
  const inputModule = await import(pathToFileURL(join(received.sourceDirectory, 'products/x402api-merchant-workspace/application-inputs.mjs')));
  const activationInputs = await inputModule.reviewMerchantInputs(received.activationConfigPath,
    { allowLoopback: true, validateConfig: workspaceModule.validateConfig });
  const activation = await serverModule.loadMerchantConfiguration(received.activationConfigPath,
    { allowLoopback: true, env, expectedInputsSha256: activationInputs.inputsSha256 });
  if (typeof activation.fulfillment.doctor === 'function')
    await activation.fulfillment.doctor({ binding: activation.config.fulfillmentBinding });
  const selectedSource = await projectModule.resolveMerchantProjectSource();
  assert.equal(selectedSource.sourceArchive, received.sourceArchive);
  assert.equal(selectedSource.sourceSha256, received.sourceSha256);
  const activationPath = join(root, 'portable/activation.json');
  let activated = await readJSON(activationPath), afterActivation;
  if (!activated) {
    const workspace = await workspaceModule.openMerchantWorkspace({ ...activation,
      directory: received.workspaceDirectory, allowLoopback: true });
    let project = null;
    try {
    project = await projectModule.createMerchantProject({ workspace, configurationFile: received.activationConfigPath,
      ...selectedSource, outputDirectory: received.workspaceDirectory + '-exports', reviewedInputs: activation.reviewedInputs,
      allowLoopback: true });
    currentHost = await serverModule.startMerchantServer({ workspace, operatorToken: scenario.operatorToken, port: 0, project });
    const opening = { url: currentHost.url, operationId: identity('portable-activated') };
    const activatedReads = await receiveReads(opening, scenario, completed, 'portable-activated');
    assert.equal(activatedReads.mode, 'live');
    assert.deepEqual(invoiceIdentity(activatedReads), invoiceIdentity(firstReads));
    const available = (await get(currentHost.url, scenario.operatorToken, '/api/project')).json();
    assert.equal(available.available, true); assert.equal(available.storeId, exported.storeId);
    assert.equal(available.sourceSha256, received.sourceSha256);
    activated = { reads: activatedReads, project: available };
  } finally {
    if (currentHost) { await currentHost.close(); currentHost = null; }
    else { if (project) await project.close(); await workspace.close(); }
  }
    afterActivation = databaseSnapshot(database);
    assert.equal(afterActivation.businessSha256, baseline.businessSha256);
    assert.notEqual(afterActivation.allUserRowsSha256, baseline.allUserRowsSha256);
    activated.afterBusinessSha256 = afterActivation.businessSha256;
    activated.allUserRowsSha256 = afterActivation.allUserRowsSha256;
    activated.snapshot = afterActivation;
    // Publish the full completed activation before its derived snapshot file.
    // A resumed programme can recover both from this one retained return.
    await retainCompleted('portable-original-activation', () => save(activationPath, activated, { original: true }));
  } else {
    afterActivation = databaseSnapshot(database);
    assert.equal(afterActivation.businessSha256, activated.afterBusinessSha256);
    assert.equal(afterActivation.allUserRowsSha256, activated.allUserRowsSha256);
  }
  assert.equal(activated.snapshot.allUserRowsSha256, activated.allUserRowsSha256);
  await retainCompleted('portable-original-activation-snapshot', () =>
    save(join(root, 'portable/snapshots/activated.private.json'), activated.snapshot, { original: true }));
  // This is the same original receiving operation, after its actual application
  // has added runtime history. It must preserve that used runtime in place.
  const repeatRequest = { schema: REQUEST, action: 'receive', operation: receiving.operation,
    ...archiveSelection, destination: join(root, 'portable/received') };
  const repeatPath = join(root, 'portable/requests/portable-repeat-receive.json');
  await save(repeatPath, repeatRequest, { original: true });
  const repeatedCommand = await runCommand('portable-repeat-receive', { executable: process.execPath,
    args: ['--max-old-space-size=256', sourceCLI, 'receive', '--request', repeatPath], cwd: root });
  const repeated = JSON.parse(repeatedCommand.stdout);
  assert.equal(repeated.state, 'COMPLETE'); assert.equal(repeated.operation, receiving.operation); assert.equal(repeated.reused, true);
  assert.equal(databaseSnapshot(database).allUserRowsSha256, afterActivation.allUserRowsSha256);
  await retainCompleted('portable-original-repeat-receive', () =>
    save(join(root, 'portable/native/portable-repeat-receive.json'), repeated, { original: true }));

  // The receiving operator can carry this complete project onward. Use the
  // restored source, relocated built-in inputs and stopped original workspace.
  const onward = await native('portable-onward-export', 'export', {
    directory: received.workspaceDirectory, config: received.activationConfigPath,
    sourceArchive: received.sourceArchive, sourceSha256: received.sourceSha256,
    expectedStoreId: exported.storeId, outputDirectory: join(root, 'portable/onward-exports'),
    inputFiles: activation.reviewedInputs.inputs.files.map(file => ({
      path: file.path, bytes: String(file.bytes), sha256: file.sha256, role: 'declared-input',
    })),
  }, join(received.sourceDirectory, 'products/x402api-merchant-workspace/portable.mjs'));
  const onwardFile = await originalFile(onward.archive.path, pin(onward.archive));
  const onwardInspection = await native('portable-onward-inspect', 'inspect',
    { archive: onwardFile.path, archiveSha256: onwardFile.sha256 });
  const onwardReceiving = await native('portable-onward-receive', 'receive', {
    archive: onwardFile.path, archiveSha256: onwardFile.sha256, destination: join(root, 'portable/onward-received'),
  });
  const second = onwardReceiving.received;
  assert.equal(second.storeId, exported.storeId);
  const secondServer = await import(pathToFileURL(join(second.sourceDirectory, 'products/x402api-merchant-workspace/server.mjs')));
  const secondWorkspace = await import(pathToFileURL(join(second.sourceDirectory, 'products/x402api-merchant-workspace/workspace.mjs')));
  const secondConfig = await secondServer.loadMerchantReviewConfiguration(second.reviewConfigPath,
    { allowLoopback: true, env: { MERCHANT_REVIEW_OPERATOR_TOKEN: reviewToken } });
  const secondStore = await secondWorkspace.openMerchantReview({ ...secondConfig, directory: second.workspaceDirectory, allowLoopback: true });
  let secondHost = null, onwardReads;
  try {
    secondHost = await secondServer.startMerchantServer({ workspace: secondStore, operatorToken: reviewToken, port: 0 });
    onwardReads = await receiveReads({ url: secondHost.url, operationId: identity('portable-onward-review') },
      reviewScenario, completed, 'portable-onward-review');
    assert.deepEqual(invoiceIdentity(onwardReads), invoiceIdentity(firstReads));
  } finally { if (secondHost) await secondHost.close(); else await secondStore.close(); }

  const result = { schema: 'stellar-forge.merchant-portable-receiving-journey.v1', state: 'COMPLETE',
    originalExportOperation: exported.operation, storeId: exported.storeId,
    export: exported, inspection: inspected, receiving, review, reopened,
    activation: { reads: activated.reads, beforeBusinessSha256: baseline.businessSha256,
      afterBusinessSha256: afterActivation.businessSha256, originalRowsSha256: baseline.allUserRowsSha256,
      activatedRowsSha256: afterActivation.allUserRowsSha256 },
    repeatedReceive: { operation: repeated.operation, reused: repeated.reused,
      retainedRowsSha256: databaseSnapshot(database).allUserRowsSha256 },
    onward: { export: onward, inspection: onwardInspection, receiving: onwardReceiving, reads: onwardReads, archive: onwardFile },
    completedAt: new Date().toISOString() };
  await verifyPortableReceiving(result, { originalFile });
  await retainCompleted('portable-original-complete-journey', () => save(resultPath, result, { original: true }));
  return result;
}

export async function verifyPortableReceiving(result, { originalFile }) {
  assert.equal(result.schema, 'stellar-forge.merchant-portable-receiving-journey.v1');
  assert.equal(result.state, 'COMPLETE');
  const files = [result.export.archive, result.export.manifestFile, result.onward.archive,
    ...result.review.browser.images, ...result.review.browser.downloads,
    ...result.review.reads.invoices.flatMap(value => [value.download, value.envelope]),
    ...result.reopened.reads.invoices.flatMap(value => [value.download, value.envelope]),
    ...result.activation.reads.invoices.flatMap(value => [value.download, value.envelope]),
    ...result.onward.reads.invoices.flatMap(value => [value.download, value.envelope])];
  for (const file of files) { assert(file && typeof file.path === 'string'); await originalFile(file.path, file); }
  assert.equal(result.activation.beforeBusinessSha256, result.activation.afterBusinessSha256);
  assert.equal(result.activation.activatedRowsSha256, result.repeatedReceive.retainedRowsSha256);
  assert.equal(result.repeatedReceive.reused, true);
  assert.deepEqual(result.review.browser.pageErrors, []); assert.deepEqual(result.review.browser.consoleErrors, []);
  return { state: 'COMPLETE', files: files.length, storeId: result.storeId };
}
