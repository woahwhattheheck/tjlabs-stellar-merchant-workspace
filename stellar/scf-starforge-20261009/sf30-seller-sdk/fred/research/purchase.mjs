// MIT. Research edition purchases use the original SF88 intent, review, result and recovery.
import { resolve, join, basename } from 'node:path';
import { readdir } from 'node:fs/promises';
import { privateDirectory, readPrivateJson, withPrivateLock } from '../../routescan/quota.mjs';
import { prepareReview } from '../../../sf88-operator-buyer-cli/prepare.mjs';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { operationId } from '../model.mjs';
import { need, plain, clone, canonical, digest, sha as sha256 } from './model.mjs';
import { readResearchMerchant } from './merchant.mjs';
import { RESEARCH_PACKAGE } from './commerce-model.mjs';
import { decodeResearchEditionDelivery, receiveResearchEditionDelivery, readResearchEditionReceiving } from './delivery.mjs';

export const RESEARCH_PURCHASE = 'stellar-forge.research-purchase.v1';
export const RESEARCH_CUSTOMER_STATE = 'stellar-forge.research-customer-state.v1';
const CUSTOMER_LOCK = 'research-customer-state.lock';
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
      'This original customer intent retains different terms.', 'RESEARCH_PURCHASE_CONFLICT', 409);
  }
}
function identity(value) {
  return { schema: value.schema, publicationId: value.publicationId, editionId: value.editionId,
    productId: value.productId, manifestSha256: value.manifestSha256, deliverySha256: value.deliverySha256,
    sourceProjectId: value.sourceProjectId, planSha256: value.planSha256, intentId: value.intentId,
    url: value.url, file: value.file, expected: value.expected, configSha256: value.configSha256 };
}
function purchaseFromMerchant(merchant, { intentId, file = null, acceptIndex = 0, destination }) {
  operationId(intentId);
  const { edition, plan, offers, offersBytes } = merchant;
  const expected = plan.downloads.find(item => item.path === (file ?? RESEARCH_PACKAGE));
  need(expected, 'Choose an original file offered by this Research publication.');
  const rowIndex = offers.findIndex(offer => (typeof offer.resource === 'string' ? offer.resource : offer.resource.url) === expected.resource);
  need(rowIndex >= 0, 'The original Research edition offer is unavailable.');
  const prepared = prepareReview(offersBytes, { rowIndex, acceptIndex, intentId,
    url: expected.resource, method: 'GET', responseOut: destination });
  const config = { ...prepared.draft, responseFile: { destination, maxBytes: Math.max(1, expected.bytes),
    expectedSha256: expected.sha256, expectedBytes: expected.bytes, expectedContentType: expected.contentType } };
  const purchase = { schema: RESEARCH_PURCHASE, publicationId: plan.publicationId, editionId: edition.editionId,
    productId: edition.productId, manifestSha256: edition.manifestSha256, deliverySha256: edition.deliverySha256,
    sourceProjectId: edition.sourceProjectId, planSha256: plan.planSha256, intentId,
    url: expected.resource, file: expected.path, expected: clone(expected),
    configSha256: sha256(jsonBytes(config)), config };
  purchase.purchaseSha256 = digest(identity(purchase));
  return purchase;
}
export function validateResearchRetainedPurchase(purchase, merchant) {
  need(plain(purchase) && plain(purchase.config) && plain(purchase.config.responseFile) &&
    purchase.schema === RESEARCH_PURCHASE && purchase.purchaseSha256 === digest(identity(purchase)) &&
    sha256(jsonBytes(purchase.config)) === purchase.configSha256,
    'The original prepared Research purchase changed.');
  const destination = purchase.config.responseFile.destination;
  need(typeof destination === 'string' && destination.startsWith('/') && resolve(destination) === destination,
    'Retain the original prepared customer response destination.');
  const expected = purchaseFromMerchant(merchant, { intentId: purchase.intentId, file: purchase.file,
    acceptIndex: purchase.config.preparedFrom?.acceptIndex, destination });
  need(canonical(expected) === canonical(purchase),
    'This intent belongs to another original Research purchase.', 'RESEARCH_PURCHASE_CONFLICT', 409);
  return purchase;
}
export async function prepareResearchPurchase({ directory, intentId, file = null, acceptIndex = 0,
  query = {}, previous = null } = {}) {
  operationId(intentId);
  need([...new URLSearchParams(query)].length === 0 && previous === null,
    'Select the complete Research edition or one original file without observation-page queries.');
  const merchant = await readResearchMerchant(directory);
  return withPrivateLock(resolve(directory), CUSTOMER_LOCK, async () => {
    const root = await privateDirectory(join(resolve(directory), 'customer-requests', intentId));
    const original = await optionalJson(join(root, 'prepared.json'));
    if (original) {
      validateResearchRetainedPurchase(original, merchant);
      need(original.intentId === intentId && original.file === (file ?? RESEARCH_PACKAGE) &&
        original.config.preparedFrom.acceptIndex === acceptIndex,
        'This original customer intent retains different terms.', 'RESEARCH_PURCHASE_CONFLICT', 409);
      return original;
    }
    const purchase = purchaseFromMerchant(merchant, { intentId, file, acceptIndex, destination: join(root, 'response.bin') });
    await exactJson(root, 'prepared.json', purchase);
    return purchase;
  });
}
async function originalPurchase(directory, purchase) {
  const current = validateResearchRetainedPurchase(purchase, await readResearchMerchant(directory));
  return withPrivateLock(resolve(directory), CUSTOMER_LOCK, async () => {
    const root = await privateDirectory(join(resolve(directory), 'customer-requests', current.intentId));
    await exactJson(root, 'prepared.json', current);
    return current;
  });
}
async function bindNativePurchase(operation, current) {
  const bytes = await readBytes(operation.configPath, 65536), config = JSON.parse(bytes.toString('utf8'));
  const metadata = await readPrivateJson(join(operation.directory, 'operation.json'), 65536);
  need(metadata.intentId === current.intentId && metadata.state === 'PREPARED' &&
    metadata.configSha256 === sha256(bytes) && canonical(config.operation) === canonical(current.config.operation) &&
    canonical(config.preparedFrom) === canonical(current.config.preparedFrom) && config.captureBody === false,
    'The existing native intent belongs to another original request.');
  for (const key of ['maxBytes', 'expectedSha256', 'expectedBytes', 'expectedContentType'])
    need(config.responseFile?.[key] === current.config.responseFile?.[key], 'The original Research delivery policy changed.');
  const binding = { ...identity(current), purchaseSha256: current.purchaseSha256, nativeConfigSha256: sha256(bytes) };
  await exactJson(operation.directory, 'research-publication.json', binding);
  return binding;
}
async function receivedResult(result, binding) {
  result.raiseForStatus();
  need(result.record.configSha256 === binding.nativeConfigSha256, 'The original native customer result changed.');
  const bytes = await result.bytes({ limit: Math.max(1, binding.expected.bytes) });
  need(bytes.length === binding.expected.bytes && sha256(bytes) === binding.expected.sha256,
    'The delivered Research edition contains different original bytes.');
  let report = null;
  if (binding.file === RESEARCH_PACKAGE) {
    const checked = decodeResearchEditionDelivery(bytes);
    need(checked.delivery.editionId === binding.editionId && checked.delivery.productId === binding.productId &&
      checked.delivery.manifestSha256 === binding.manifestSha256 && checked.delivery.deliverySha256 === binding.deliverySha256,
      'The complete delivered report belongs to another retained edition.');
    report = { title: checked.edition.title, sources: checked.edition.sources, files: checked.files.length };
  }
  return { state: 'DELIVERED', intentId: binding.intentId, publicationId: binding.publicationId,
    editionId: binding.editionId, productId: binding.productId, metadata: clone(binding.expected),
    bytes: bytes.length, sha256: sha256(bytes), ...(report ? { research: report } : {}), result };
}
export async function executeResearchPurchase({ directory, buyer, purchase, signal } = {}) {
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
  need(review.configSha256 === binding.nativeConfigSha256, 'The original reviewed Research purchase changed.');
  try { return receivedResult(await operation.execute({ review, signal }), binding); }
  catch (error) {
    if (error.code === 'ATTEMPT_ALREADY_RECORDED_USE_RECOVER')
      return recoverResearchPurchase({ directory, buyer, intentId: current.intentId });
    throw error;
  }
}
export async function recoverResearchPurchase({ directory, buyer, intentId } = {}) {
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
export async function exportResearchPurchase(args) {
  const delivered = await recoverResearchPurchase(args);
  need(delivered.result, 'This original intent has no completed saved delivery.');
  return { bytes: await delivered.result.bytes({ limit: Math.max(1, delivered.bytes) }),
    contentType: delivered.metadata.contentType, filename: basename(delivered.metadata.path) };
}
function validateReceivingSelection(value, purchase = null) {
  need(plain(value) && value.schema === 'stellar-forge.research-purchase-receiving.v1' &&
    typeof value.directory === 'string' && value.directory.startsWith('/') && resolve(value.directory) === value.directory &&
    /^[a-f0-9]{64}$/.test(value.packageSha256 ?? '') && /^[a-f0-9]{64}$/.test(value.publicationId ?? '') &&
    typeof value.requestedAt === 'string' && Number.isFinite(Date.parse(value.requestedAt)),
    'The original customer receiving selection changed.');
  operationId(value.intentId);
  if (purchase) need(value.intentId === purchase.intentId && value.publicationId === purchase.publicationId &&
    purchase.file === RESEARCH_PACKAGE && value.packageSha256 === purchase.expected.sha256,
    'The customer receiving selection differs from its original purchase.');
  return value;
}
async function originalReceivingRequest(directory, intentId) {
  operationId(intentId);
  const value = await optionalJson(join(resolve(directory), 'customer-requests', intentId, 'receiving-request.json'));
  if (value) {
    validateReceivingSelection(value);
    need(value.intentId === intentId, 'The original customer receiving intent changed.');
  }
  return value;
}
export async function receiveResearchPurchase({ receivingDirectory = null, ...args } = {}) {
  const delivered = await recoverResearchPurchase(args);
  need(delivered.result && delivered.metadata.path === RESEARCH_PACKAGE,
    'Receive the completed original full Research-package purchase.');
  const requestRoot = join(resolve(args.directory), 'customer-requests', args.intentId);
  return withPrivateLock(requestRoot, 'receiving-selection.lock', async () => {
  const original = await originalReceivingRequest(args.directory, args.intentId);
  const selected = receivingDirectory === null ? original?.directory : receivingDirectory;
  need(typeof selected === 'string' && selected.startsWith('/'), 'Choose the customer’s absolute receiving directory.');
  const target = resolve(selected);
  if (original) need(original.directory === target && original.packageSha256 === delivered.sha256 &&
    original.publicationId === delivered.publicationId, 'Continue this purchase’s original customer receiving selection.',
    'RESEARCH_RECEIVING_SELECTION_CHANGED', 409);
  const request = original ?? { schema: 'stellar-forge.research-purchase-receiving.v1', intentId: delivered.intentId,
    publicationId: delivered.publicationId, directory: target, packageSha256: delivered.sha256,
    requestedAt: new Date().toISOString() };
  await withPrivateLock(resolve(args.directory), CUSTOMER_LOCK, () =>
    exactJson(join(resolve(args.directory), 'customer-requests', args.intentId), 'receiving-request.json', request));
  const bytes = await delivered.result.bytes({ limit: Math.max(1, delivered.bytes) });
  return { ...(await receiveResearchEditionDelivery({ directory: target, bytes })),
    intentId: delivered.intentId, publicationId: delivered.publicationId };
  });
}
export async function readResearchPurchaseReceiving({ directory, intentId } = {}) {
  const request = await originalReceivingRequest(directory, intentId);
  need(request, 'This original purchase has no selected customer receiving directory.', 'RESEARCH_RECEIVING_NOT_SELECTED', 404);
  const prepared = validateResearchRetainedPurchase(
    await readPrivateJson(join(resolve(directory), 'customer-requests', intentId, 'prepared.json'), 131072),
    await readResearchMerchant(directory));
  need(prepared.intentId === intentId, 'The original prepared customer intent changed.');
  validateReceivingSelection(request, prepared);
  const received = await readResearchEditionReceiving(request.directory);
  need(received.receipt.packageSha256 === request.packageSha256 &&
    received.delivery.editionId === prepared.editionId && received.delivery.deliverySha256 === prepared.deliverySha256,
    'The received Research edition belongs to another purchase.');
  return { ...received, intentId, publicationId: request.publicationId };
}
export async function exportResearchPurchaseReceiving({directory,intentId,file=RESEARCH_PACKAGE,editionId=null}={}) {
  const received=await readResearchPurchaseReceiving({directory,intentId});
  need(editionId===null || editionId===received.delivery.editionId,
    'Choose the original issued product in this received Research package.');
  if(file===RESEARCH_PACKAGE)return {bytes:received.bytes,contentType:'application/gzip',
    filename:RESEARCH_PACKAGE,sha256:received.receipt.packageSha256};
  if(file==='manifest.json') {
    const bytes=jsonBytes(received.delivery.manifest);
    need(sha256(bytes)===received.delivery.manifestSha256,'The original Research manifest changed.');
    return {bytes,contentType:'application/json',filename:'manifest.json',sha256:received.delivery.manifestSha256};
  }
  const member=received.files.find(item=>item.path===file);
  need(member,'Choose an original member of this received Research edition.','RESEARCH_RECEIVED_MEMBER_NOT_FOUND',404);
  const bytes=Buffer.from(member.bodyBase64,'base64');
  need(bytes.toString('base64')===member.bodyBase64 && bytes.length===member.bytes && sha256(bytes)===member.sha256,
    'The received original Research member changed.');
  return {bytes,contentType:member.contentType,filename:member.path,sha256:member.sha256};
}
export function validateResearchCustomerState(value, merchant) {
  need(plain(value) && value.schema === RESEARCH_CUSTOMER_STATE && value.publicationId === merchant.plan.publicationId &&
    Array.isArray(value.requests), 'Retain this publication’s complete original customer requests.');
  const intents = new Set();
  for (const record of value.requests) {
    need(plain(record) && plain(record.purchase) && Object.hasOwn(record, 'receiving') &&
      Object.keys(record).every(key => ['purchase', 'receiving'].includes(key)),
      'Retain each original prepared purchase and its receiving selection.');
    const purchase = validateResearchRetainedPurchase(record.purchase, merchant);
    need(!intents.has(purchase.intentId) && jsonBytes(purchase).length <= 131072,
      'The retained customer inventory repeats or changes an original intent.');
    intents.add(purchase.intentId);
    if (record.receiving !== null) {
      validateReceivingSelection(record.receiving, purchase);
      need(jsonBytes(record.receiving).length <= 131072, 'The original receiving selection exceeds its retained size.');
    }
  }
  return value;
}
async function retainedCustomerState(directory, merchant) {
  const root = join(resolve(directory), 'customer-requests');
  const names = await readdir(root).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const requests = [];
  for (const name of names.sort()) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(name)) continue;
    const purchase = await optionalJson(join(root, name, 'prepared.json'));
    const receiving = await originalReceivingRequest(directory, name);
    if (!purchase) {
      need(receiving === null, 'A retained receiving selection lost its original prepared request.');
      continue;
    }
    need(purchase.intentId === name, 'A retained original Research request changed.');
    requests.push({ purchase, receiving });
  }
  return validateResearchCustomerState({ schema: RESEARCH_CUSTOMER_STATE,
    publicationId: merchant.plan.publicationId, requests }, merchant);
}
export async function exportResearchCustomerState(directory, merchant = null) {
  merchant ??= await readResearchMerchant(directory);
  return withPrivateLock(resolve(directory), CUSTOMER_LOCK, () => retainedCustomerState(directory, merchant));
}
export async function receiveResearchCustomerState(directory, value, merchant = null) {
  merchant ??= await readResearchMerchant(directory);
  validateResearchCustomerState(value, merchant);
  return withPrivateLock(resolve(directory), CUSTOMER_LOCK, async () => {
    // A partial receive may complete the same inventory; it cannot add another saved intent.
    const current = await retainedCustomerState(directory, merchant);
    const incoming = new Map(value.requests.map(record => [record.purchase.intentId, record]));
    for (const retained of current.requests) {
      const selected = incoming.get(retained.purchase.intentId);
      need(selected && jsonBytes(retained.purchase).equals(jsonBytes(selected.purchase)) &&
        (retained.receiving === null || selected.receiving !== null &&
          jsonBytes(retained.receiving).equals(jsonBytes(selected.receiving))),
        'This receiving project retains another original customer request.', 'RESEARCH_PURCHASE_CONFLICT', 409);
    }
    // Bind this complete inventory before its first request write, including an empty inventory.
    await exactJson(resolve(directory), 'research-customer-receiving.json', {
      schema: 'stellar-forge.research-customer-receiving.v1',
      publicationId: value.publicationId, customerStateSha256: digest(value)
    });
    for (const record of value.requests) {
      const root = await privateDirectory(join(resolve(directory), 'customer-requests', record.purchase.intentId));
      await exactJson(root, 'prepared.json', record.purchase);
      if (record.receiving !== null) await exactJson(root, 'receiving-request.json', record.receiving);
    }
    return { publicationId: value.publicationId, requests: value.requests.length,
      receiving: value.requests.filter(record => record.receiving !== null).length };
  });
}
export async function listResearchPurchases(directory, { merchant = null } = {}) {
  need(merchant === null || merchant.directory === resolve(directory), 'Use this publication’s original merchant view.');
  const state = await exportResearchCustomerState(directory, merchant);
  return state.requests.map(({ purchase: value, receiving }) => ({
    intentId: value.intentId, publicationId: value.publicationId, editionId: value.editionId,
    file: value.file, url: value.url, purchaseSha256: value.purchaseSha256, expected: clone(value.expected), receiving
  }));
}
