// MIT. County report purchases use the original SF88 intent, review, result and recovery.
import { resolve, join, basename } from 'node:path';
import { readdir } from 'node:fs/promises';
import { privateDirectory, readPrivateJson, withPrivateLock } from '../../routescan/quota.mjs';
import { prepareReview } from '../../../sf88-operator-buyer-cli/prepare.mjs';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { operationId } from '../model.mjs';
import { need, clone, canonical } from './model.mjs';
import { digest, sha256 } from './source.mjs';
import { readQcewMerchant } from './merchant.mjs';
import { QCEW_REPORT_PACKAGE } from './publication-model.mjs';
import { decodeQcewReportDelivery, receiveQcewReportDelivery, readQcewReportReceiving } from './delivery.mjs';
import { qcewMemberBytes } from './files.mjs';

export const QCEW_PURCHASE = 'stellar-forge.qcew-purchase.v1';
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
async function optionalJson(path, maximum = 131072) {
  try { return await readPrivateJson(path, maximum); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function exactJson(directory, name, value) {
  const bytes = jsonBytes(value), path = join(directory, name);
  try { await writeBytes(path, bytes, { exclusive: true }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    need((await readBytes(path, Math.max(1, bytes.length))).equals(bytes),
      'This original customer intent retains different terms.', 'QCEW_PURCHASE_CONFLICT', 409);
  }
}
function identity(value) {
  return { schema: value.schema, publicationId: value.publicationId, editionId: value.editionId,
    reportId: value.reportId, manifestSha256: value.manifestSha256, deliverySha256: value.deliverySha256,
    captureSha256: value.captureSha256, planSha256: value.planSha256, intentId: value.intentId,
    url: value.url, file: value.file, expected: value.expected, configSha256: value.configSha256 };
}
export async function prepareQcewPurchase({ directory, intentId, file = null, acceptIndex = 0,
  query = {}, previous = null } = {}) {
  operationId(intentId);
  need([...new URLSearchParams(query)].length === 0 && previous === null,
    'Select the complete county report or one original file without observation-page queries.');
  const { edition, plan, offers, offersBytes } = await readQcewMerchant(directory);
  const expected = plan.downloads.find(item => item.path === (file ?? QCEW_REPORT_PACKAGE));
  need(expected, 'Choose an original file offered by this county publication.');
  const rowIndex = offers.findIndex(offer => (typeof offer.resource === 'string' ? offer.resource : offer.resource.url) === expected.resource);
  need(rowIndex >= 0, 'The original county report offer is unavailable.');
  const root = await privateDirectory(join(resolve(directory), 'customer-requests', intentId));
  const destination = join(root, 'response.bin');
  const prepared = prepareReview(offersBytes, { rowIndex, acceptIndex, intentId,
    url: expected.resource, method: 'GET', responseOut: destination });
  const config = { ...prepared.draft, responseFile: { destination, maxBytes: Math.max(1, expected.bytes),
    expectedSha256: expected.sha256, expectedBytes: expected.bytes, expectedContentType: expected.contentType } };
  const purchase = { schema: QCEW_PURCHASE, publicationId: plan.publicationId, editionId: edition.editionId,
    reportId: edition.reportId, manifestSha256: edition.manifestSha256, deliverySha256: edition.deliverySha256,
    captureSha256: edition.source.captureSha256, planSha256: plan.planSha256, intentId,
    url: expected.resource, file: expected.path, expected: clone(expected),
    configSha256: sha256(jsonBytes(config)), config };
  purchase.purchaseSha256 = digest(identity(purchase));
  await exactJson(root, 'prepared.json', purchase);
  return purchase;
}
async function originalPurchase(directory, purchase) {
  need(purchase?.schema === QCEW_PURCHASE && purchase.purchaseSha256 === digest(identity(purchase)) &&
    sha256(jsonBytes(purchase.config)) === purchase.configSha256, 'The original prepared county purchase changed.');
  const current = await prepareQcewPurchase({ directory, intentId: purchase.intentId, file: purchase.file,
    acceptIndex: purchase.config.preparedFrom.acceptIndex });
  need(current.purchaseSha256 === purchase.purchaseSha256, 'This intent belongs to another original county purchase.');
  return current;
}
async function bindNativePurchase(operation, current) {
  const bytes = await readBytes(operation.configPath, 65536), config = JSON.parse(bytes.toString('utf8'));
  const metadata = await readPrivateJson(join(operation.directory, 'operation.json'), 65536);
  need(metadata.intentId === current.intentId && metadata.state === 'PREPARED' &&
    metadata.configSha256 === sha256(bytes) && canonical(config.operation) === canonical(current.config.operation) &&
    canonical(config.preparedFrom) === canonical(current.config.preparedFrom) && config.captureBody === false,
    'The existing native intent belongs to another original request.');
  for (const key of ['maxBytes', 'expectedSha256', 'expectedBytes', 'expectedContentType'])
    need(config.responseFile?.[key] === current.config.responseFile?.[key], 'The original county delivery policy changed.');
  const binding = { ...identity(current), purchaseSha256: current.purchaseSha256, nativeConfigSha256: sha256(bytes) };
  await exactJson(operation.directory, 'qcew-publication.json', binding);
  return binding;
}
async function receivedResult(result, binding) {
  result.raiseForStatus();
  need(result.record.configSha256 === binding.nativeConfigSha256, 'The original native customer result changed.');
  const bytes = await result.bytes({ limit: Math.max(1, binding.expected.bytes) });
  need(bytes.length === binding.expected.bytes && sha256(bytes) === binding.expected.sha256,
    'The delivered county report contains different original bytes.');
  let report = null;
  if (binding.file === QCEW_REPORT_PACKAGE) {
    const checked = decodeQcewReportDelivery(bytes);
    need(checked.delivery.editionId === binding.editionId && checked.delivery.reportId === binding.reportId &&
      checked.delivery.manifestSha256 === binding.manifestSha256 && checked.delivery.deliverySha256 === binding.deliverySha256,
      'The complete delivered report belongs to another retained edition.');
    report = { title: checked.edition.report.profile.definition.title, period: clone(checked.edition.report.period),
      editions: checked.editions.length, files: checked.editions.reduce((count, item) => count + item.files.length, 0) };
  }
  return { state: 'DELIVERED', intentId: binding.intentId, publicationId: binding.publicationId,
    editionId: binding.editionId, reportId: binding.reportId, metadata: clone(binding.expected),
    bytes: bytes.length, sha256: sha256(bytes), ...(report ? { report } : {}), result };
}
export async function executeQcewPurchase({ directory, buyer, purchase, signal } = {}) {
  need(buyer && typeof buyer.fromConfig === 'function', 'Supply the maintained SF88 Buyer.');
  const current = await originalPurchase(directory, purchase);
  let operation;
  try { operation = await buyer.fromConfig(current.config, { signal }); }
  catch (error) {
    if (error.code !== 'INTENT_ALREADY_EXISTS_USE_RECOVER') throw error;
    operation = buyer.operation(current.intentId);
  }
  const binding = await bindNativePurchase(operation, current);
  const retained = await operation.recover();
  if (retained !== null) return receivedResult(retained, binding);
  const existing = await optionalJson(join(operation.directory, 'attempt.json'));
  if (existing) return { state: 'AWAITING_NATIVE_RESULT', intentId: current.intentId,
    publicationId: current.publicationId, editionId: current.editionId };
  const review = await operation.review({ signal });
  need(review.configSha256 === binding.nativeConfigSha256, 'The original reviewed county purchase changed.');
  try { return receivedResult(await operation.execute({ review, signal }), binding); }
  catch (error) {
    if (error.code === 'ATTEMPT_ALREADY_RECORDED_USE_RECOVER')
      return recoverQcewPurchase({ directory, buyer, intentId: current.intentId });
    throw error;
  }
}
export async function recoverQcewPurchase({ directory, buyer, intentId } = {}) {
  operationId(intentId);
  need(buyer && typeof buyer.operation === 'function', 'Supply the original configured SF88 Buyer.');
  const current = await originalPurchase(directory,
    await readPrivateJson(join(resolve(directory), 'customer-requests', intentId, 'prepared.json'), 131072));
  const operation = buyer.operation(intentId);
  const metadata = await optionalJson(join(operation.directory, 'operation.json'), 65536);
  if (!metadata) return { state: 'PREPARED_NOT_STARTED', intentId, publicationId: current.publicationId, editionId: current.editionId };
  if (metadata.state !== 'PREPARED') return { state: 'NATIVE_PREPARATION_INCOMPLETE', intentId };
  const binding = await bindNativePurchase(operation, current), result = await operation.recover();
  if (result === null) return { state: 'AWAITING_NATIVE_RESULT', intentId, publicationId: current.publicationId, editionId: current.editionId };
  return receivedResult(result, binding);
}
export async function exportQcewPurchase(args) {
  const delivered = await recoverQcewPurchase(args);
  need(delivered.result, 'This original intent has no completed saved delivery.');
  return { bytes: await delivered.result.bytes({ limit: Math.max(1, delivered.bytes) }),
    contentType: delivered.metadata.contentType, filename: basename(delivered.metadata.path) };
}
async function originalReceivingRequest(directory, intentId) {
  operationId(intentId);
  const value = await optionalJson(join(resolve(directory), 'customer-requests', intentId, 'receiving-request.json'));
  if (value) need(value.schema === 'stellar-forge.qcew-purchase-receiving.v1' && value.intentId === intentId &&
    typeof value.directory === 'string' && value.directory.startsWith('/') &&
    /^[a-f0-9]{64}$/.test(value.packageSha256 ?? '') && /^[a-f0-9]{64}$/.test(value.publicationId ?? ''),
    'The original customer receiving selection changed.');
  return value;
}
export async function receiveQcewPurchase({ receivingDirectory = null, ...args } = {}) {
  const delivered = await recoverQcewPurchase(args);
  need(delivered.result && delivered.metadata.path === QCEW_REPORT_PACKAGE,
    'Receive the completed original full report-package purchase.');
  const requestRoot = join(resolve(args.directory), 'customer-requests', args.intentId);
  return withPrivateLock(requestRoot, 'receiving-selection.lock', async () => {
  const original = await originalReceivingRequest(args.directory, args.intentId);
  const selected = receivingDirectory === null ? original?.directory : receivingDirectory;
  need(typeof selected === 'string' && selected.startsWith('/'), 'Choose the customer’s absolute receiving directory.');
  const target = resolve(selected);
  if (original) need(original.directory === target && original.packageSha256 === delivered.sha256 &&
    original.publicationId === delivered.publicationId, 'Continue this purchase’s original customer receiving selection.',
    'QCEW_RECEIVING_SELECTION_CHANGED', 409);
  const request = original ?? { schema: 'stellar-forge.qcew-purchase-receiving.v1', intentId: delivered.intentId,
    publicationId: delivered.publicationId, directory: target, packageSha256: delivered.sha256,
    requestedAt: new Date().toISOString() };
  await exactJson(join(resolve(args.directory), 'customer-requests', args.intentId), 'receiving-request.json', request);
  const bytes = await delivered.result.bytes({ limit: Math.max(1, delivered.bytes) });
  return { ...(await receiveQcewReportDelivery({ directory: target, bytes })),
    intentId: delivered.intentId, publicationId: delivered.publicationId };
  });
}
export async function readQcewPurchaseReceiving({ directory, intentId } = {}) {
  const request = await originalReceivingRequest(directory, intentId);
  need(request, 'This original purchase has no selected customer receiving directory.', 'QCEW_RECEIVING_NOT_SELECTED', 404);
  const prepared = await readPrivateJson(join(resolve(directory), 'customer-requests', intentId, 'prepared.json'), 131072);
  need(prepared.schema === QCEW_PURCHASE && prepared.purchaseSha256 === digest(identity(prepared)) &&
    prepared.intentId === intentId && prepared.publicationId === request.publicationId &&
    prepared.file === QCEW_REPORT_PACKAGE && prepared.expected.sha256 === request.packageSha256,
    'The customer receiving selection differs from its original purchase.');
  const received = await readQcewReportReceiving(request.directory);
  need(received.receipt.packageSha256 === request.packageSha256 &&
    received.delivery.editionId === prepared.editionId && received.delivery.deliverySha256 === prepared.deliverySha256,
    'The received county report belongs to another purchase.');
  return { ...received, intentId, publicationId: request.publicationId };
}
export async function exportQcewPurchaseReceiving({ directory, intentId, file = QCEW_REPORT_PACKAGE, editionId = null } = {}) {
  const received = await readQcewPurchaseReceiving({ directory, intentId });
  if (file === QCEW_REPORT_PACKAGE) return { bytes: received.bytes, contentType: 'application/gzip',
    filename: QCEW_REPORT_PACKAGE, sha256: received.receipt.packageSha256 };
  const edition = editionId === null ? received.edition :
    received.editions.find(item => item.manifest.editionId === editionId);
  need(edition, 'Choose an original edition inside this received report.');
  const member = edition.files.find(item => item.name === file);
  need(member, 'Choose an original member of this received county report.', 'QCEW_RECEIVED_MEMBER_NOT_FOUND', 404);
  return { bytes: qcewMemberBytes(member), contentType: member.contentType, filename: member.name, sha256: member.sha256 };
}
export async function listQcewPurchases(directory) {
  const root = join(resolve(directory), 'customer-requests');
  const names = await readdir(root).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const requests = [];
  for (const name of names.sort()) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(name)) continue;
    const value = await readPrivateJson(join(root, name, 'prepared.json'), 131072);
    need(value.schema === QCEW_PURCHASE && value.intentId === name && value.purchaseSha256 === digest(identity(value)),
      'A retained original county request changed.');
    requests.push({ intentId: value.intentId, publicationId: value.publicationId, editionId: value.editionId,
      file: value.file, url: value.url, purchaseSha256: value.purchaseSha256, expected: clone(value.expected),
      receiving: await originalReceivingRequest(directory, value.intentId) });
  }
  return requests;
}
