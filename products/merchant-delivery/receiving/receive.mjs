#!/usr/bin/env node
// MIT. Customer receiving through the original SF98 exchange and retained downloader.
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { receiveDeliveryDownload } from '../../../stellar-forge/mcp-merchant-operator/delivery-download.mjs';
import { openDestinationWorkspace } from '../../../stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/model.mjs';
import { ROOT_SCHEMA, privateDirectory, readPrivate, readJSON, hash, eventPattern, idPattern, fault, codeOf }
  from '../../../stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/storage.mjs';

export const RECEIVED_SCHEMA = 'stellar-forge.sf98.destinations-received.v1';
export const RECEIVING_SCHEMA = 'stellar-forge.product.delivery-receiving.v1';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requiredPath = (value, code) => {
  if (typeof value !== 'string' || !value.trim()) throw fault(code);
  return resolve(value);
};
function fingerprint(value, optional = false) {
  if (optional && value === undefined) return;
  if (!eventPattern.test(value ?? '')) throw fault('DELIVERY_RECEIVING_FINGERPRINT_REQUIRED');
}
function validateReceipt(receipt, directory) {
  if (!object(receipt) || receipt.schema !== RECEIVED_SCHEMA ||
      !eventPattern.test(receipt.fingerprint ?? '') ||
      !eventPattern.test(receipt.sourceNativeFingerprint ?? '') ||
      typeof receipt.receivedAt !== 'string' || !Number.isFinite(Date.parse(receipt.receivedAt)) ||
      typeof receipt.originalSourceDirectory !== 'string' ||
      receipt.sourceDirectory !== join(directory, 'source') ||
      receipt.workspaceDirectory !== join(directory, 'workspace') ||
      receipt.serviceStarted !== false || !Array.isArray(receipt.destinations) ||
      receipt.destinations.length > 128)
    throw fault('DELIVERY_RECEIVING_RECEIPT_CHANGED', 409);
  const ids = new Set();
  for (const destination of receipt.destinations) {
    if (!object(destination) || !idPattern.test(destination.id ?? '') ||
        !eventPattern.test(destination.nativeFingerprint ?? '') || ids.has(destination.id))
      throw fault('DELIVERY_RECEIVING_RECEIPT_CHANGED', 409);
    ids.add(destination.id);
  }
}

/** Open existing received state without the seller or the original download.
 * The immutable receiving receipt establishes provenance. Current destination
 * revisions, cursors and delivery records remain owned by the original model.
 */
export async function inspectReceivedDelivery({
  receivedDirectory, expectedFingerprint, expectedReceiptSha256, environment = process.env,
} = {}) {
  const directory = requiredPath(receivedDirectory, 'DELIVERY_RECEIVING_DIRECTORY_REQUIRED');
  fingerprint(expectedFingerprint, true);
  if (expectedReceiptSha256 !== undefined && !eventPattern.test(expectedReceiptSha256))
    throw fault('DELIVERY_RECEIVING_RECEIPT_SHA_REQUIRED');
  await privateDirectory(directory);
  const raw = await readPrivate(join(directory, 'received.json'));
  let receipt;
  try { receipt = JSON.parse(raw); }
  catch { throw fault('DELIVERY_RECEIVING_RECEIPT_INVALID'); }
  validateReceipt(receipt, directory);
  const receiptSha256 = hash(raw);
  if (expectedFingerprint !== undefined && receipt.fingerprint !== expectedFingerprint ||
      expectedReceiptSha256 !== undefined && receiptSha256 !== expectedReceiptSha256)
    throw fault('DELIVERY_RECEIVING_RECEIPT_CHANGED', 409);
  await privateDirectory(receipt.sourceDirectory);
  await privateDirectory(receipt.workspaceDirectory);
  await privateDirectory(join(receipt.workspaceDirectory, 'destinations'));
  const config = await readJSON(join(receipt.workspaceDirectory, 'workspace.json'));
  if (config.schema !== ROOT_SCHEMA || config.sourceDirectory !== receipt.sourceDirectory)
    throw fault('DELIVERY_RECEIVING_SOURCE_BINDING_CHANGED', 409);
  const model = await openDestinationWorkspace({
    directory: receipt.workspaceDirectory, sourceDirectory: receipt.sourceDirectory, environment,
  });
  try {
    return { schema: RECEIVING_SCHEMA, receivedDirectory: directory,
      fingerprint: receipt.fingerprint, receiptSha256, receipt, current: await model.state() };
  } finally { await model.close(); }
}

/** Receive the completed original transfer once; repeat it to reopen its receipt.
 * The original receiver verifies every downloaded member and retains later local
 * destination changes when the same transfer is selected again.
 */
export async function receiveDeliveryWorkspace({
  downloadDirectory, id, expectedFingerprint, receivedDirectory, signal,
} = {}) {
  const directory = requiredPath(downloadDirectory, 'DELIVERY_RECEIVING_DOWNLOAD_REQUIRED');
  const workspace = requiredPath(receivedDirectory, 'DELIVERY_RECEIVING_DIRECTORY_REQUIRED');
  fingerprint(expectedFingerprint);
  const result = await receiveDeliveryDownload({ directory, id, expectedFingerprint, workspace, signal });
  const inspected = await inspectReceivedDelivery({ receivedDirectory: workspace, expectedFingerprint });
  return { ...inspected, operation: 'receive', retained: result.retained === true };
}

const usage = `Delivery receiving

node products/merchant-delivery/receiving/receive.mjs receive --download COMPLETE_DOWNLOAD --id ORIGINAL_TRANSFER_ID --fingerprint ORIGINAL_SHA256 --received NEW_PRIVATE_DIRECTORY
node products/merchant-delivery/receiving/receive.mjs inspect --received RECEIVED_DIRECTORY [--fingerprint ORIGINAL_SHA256]

receive uses the original verified transfer and SF98 receiver. Repeating the same
transfer reopens its receipt and preserves current destination revisions.
inspect opens the received workspace from its retained receipt. The original
download and seller connection are no longer required for that read.

Use configure.mjs to prepare this same received workspace for Applications.
Signing keys are supplied through the destination's original environment names.
`;

export async function main(args = process.argv.slice(2), { signal } = {}) {
  if (!args.length || args.length === 1 && ['help', '--help', '-h'].includes(args[0])) {
    process.stdout.write(usage); return { help: true };
  }
  const [command, ...rest] = args;
  const allowed = command === 'receive' ? ['--download', '--id', '--fingerprint', '--received'] :
    command === 'inspect' ? ['--received', '--fingerprint'] : null;
  if (!allowed || rest.length % 2) throw fault('INVALID_DELIVERY_RECEIVING_USAGE');
  const options = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index], value = rest[index + 1];
    if (!allowed.includes(name) || options.has(name) || !value)
      throw fault('INVALID_DELIVERY_RECEIVING_OPTION');
    options.set(name, value);
  }
  const result = command === 'receive' ? await receiveDeliveryWorkspace({
    downloadDirectory: options.get('--download'), id: options.get('--id'),
    expectedFingerprint: options.get('--fingerprint'), receivedDirectory: options.get('--received'), signal,
  }) : await inspectReceivedDelivery({
    receivedDirectory: options.get('--received'), expectedFingerprint: options.get('--fingerprint'),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const controller = new AbortController();
  const stop = () => controller.abort(new Error('DELIVERY_RECEIVING_STOPPED'));
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  main(process.argv.slice(2), { signal: controller.signal }).catch(error => {
    process.stderr.write(codeOf(error) + '\n'); process.exitCode = 1;
  }).finally(() => {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  });
}
