// MIT. A paid report retains all original members and its complete predecessor chain.
import { resolve, join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { privateDirectory, atomicJson, readPrivateJson, withPrivateLock } from '../../routescan/quota.mjs';
import { need, plain, clone, canonical } from './model.mjs';
import { digest, sha256 } from './source.mjs';
import { validateQcewFilePackage, receiveQcewFiles, readQcewFiles } from './files.mjs';
import { QCEW_REPORT_PACKAGE, QCEW_PUBLICATION_MAX_BYTES } from './publication-model.mjs';

export const QCEW_REPORT_DELIVERY = 'stellar-forge.qcew-report-delivery.v1';
export const QCEW_REPORT_RECEIVING = 'stellar-forge.qcew-report-receiving.v1';
export const MAX_QCEW_DELIVERY_JSON_BYTES = 256 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const readBytes = async (...args) => (await import('../../../sf88-operator-buyer-cli/node/store.mjs')).readBytes(...args);
const writeBytes = async (...args) => (await import('../../../sf88-operator-buyer-cli/node/store.mjs')).writeBytes(...args);
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const identity = value => ({ schema: value.schema, editionId: value.editionId,
  reportId: value.reportId, manifestSha256: value.manifestSha256, editions: value.editions });

export function validateQcewReportDelivery(value) {
  need(plain(value) && value.schema === QCEW_REPORT_DELIVERY &&
    ['editionId', 'reportId', 'manifestSha256', 'deliverySha256'].every(key => HASH.test(value[key] ?? '')) &&
    Array.isArray(value.editions) && value.editions.length >= 1 && value.editions.length <= 1000 &&
    value.deliverySha256 === digest(identity(value)), 'The complete original county-report delivery changed.');
  let previous = null;
  const seen = new Set(), editions = [];
  for (const packet of value.editions) {
    need(packet?.manifest?.previousEditionId === (previous?.manifest.editionId ?? null) &&
      !seen.has(packet?.manifest?.editionId), 'Retain the report’s complete original predecessor chain.');
    const checked = validateQcewFilePackage(packet, { previousReport: previous?.report ?? null });
    seen.add(checked.manifest.editionId); editions.push(checked); previous = checked;
  }
  need(previous.manifest.editionId === value.editionId && previous.manifest.reportId === value.reportId &&
    previous.manifest.manifestSha256 === value.manifestSha256,
    'The delivered report belongs to another original edition.');
  return { delivery: value, editions, edition: previous };
}
export function createQcewReportDelivery(editions) {
  need(Array.isArray(editions) && editions.length > 0, 'Select the report’s original retained editions.');
  const packets = editions.map(value => ({ manifest: clone(value.manifest), files: clone(value.files) }));
  const manifest = packets.at(-1).manifest;
  const value = { schema: QCEW_REPORT_DELIVERY, editionId: manifest.editionId, reportId: manifest.reportId,
    manifestSha256: manifest.manifestSha256, editions: packets };
  value.deliverySha256 = digest(identity(value));
  validateQcewReportDelivery(value);
  return value;
}
export function encodeQcewReportDelivery(value) {
  validateQcewReportDelivery(value);
  const original = jsonBytes(value);
  need(original.length <= MAX_QCEW_DELIVERY_JSON_BYTES,
    'The complete county-report delivery exceeds the installed report reader capacity.', 'QCEW_DELIVERY_CAPACITY', 413);
  const bytes = gzipSync(original, { level: 6 });
  need(bytes.length <= QCEW_PUBLICATION_MAX_BYTES,
    'The complete compressed county report exceeds the native seller’s file capacity.', 'QCEW_DELIVERY_CAPACITY', 413);
  return bytes;
}
export function decodeQcewReportDelivery(bytes) {
  need(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= QCEW_PUBLICATION_MAX_BYTES,
    'Read the complete original compressed report package.');
  bytes = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let value;
  try {
    const original = gunzipSync(bytes, { maxOutputLength: MAX_QCEW_DELIVERY_JSON_BYTES });
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(original));
  } catch { need(false, 'The complete county-report package is not readable.', 'QCEW_DELIVERY_INVALID'); }
  return validateQcewReportDelivery(value);
}
export async function retainQcewDeliveryBytes(directory, bytes) {
  const path = join(directory, QCEW_REPORT_PACKAGE);
  try { await writeBytes(path, bytes, { exclusive: true }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const retained = await readBytes(path, Math.max(1, bytes.length));
    need(retained.equals(bytes), 'This directory retains another original report package.', 'QCEW_RECEIVING_CONFLICT', 409);
  }
}
function deliverySummary(checked) {
  return { editionId: checked.delivery.editionId, reportId: checked.delivery.reportId,
    manifestSha256: checked.delivery.manifestSha256, deliverySha256: checked.delivery.deliverySha256,
    editions: checked.editions.length, files: checked.editions.reduce((sum, entry) => sum + entry.files.length, 0),
    title: checked.edition.report.profile.definition.title, period: clone(checked.edition.report.period),
    reportFiles: clone(checked.edition.manifest.files) };
}
export async function receiveQcewReportDelivery({ directory, bytes } = {}) {
  const checked = decodeQcewReportDelivery(bytes), packageSha256 = sha256(bytes);
  directory = await privateDirectory(resolve(directory));
  return withPrivateLock(directory, 'county-customer.lock', async () => {
    let retained;
    try { retained = await readPrivateJson(join(directory, 'county-received.json'), 65536); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (retained) need(retained.schema === QCEW_REPORT_RECEIVING && retained.packageSha256 === packageSha256 &&
      retained.deliverySha256 === checked.delivery.deliverySha256,
      'This customer directory received a different report.', 'QCEW_RECEIVING_CONFLICT', 409);
    await retainQcewDeliveryBytes(directory, bytes);
    let previous = null;
    for (const edition of checked.editions) {
      await receiveQcewFiles(directory, edition, { report: edition.report, previousReport: previous?.report ?? null });
      previous = edition;
    }
    const receipt = retained ?? { schema: QCEW_REPORT_RECEIVING, state: 'RECEIVED',
      ...deliverySummary(checked), packageSha256, packageBytes: bytes.length, receivedAt: new Date().toISOString() };
    if (!retained) await atomicJson(directory, 'county-received.json', receipt, { exclusive: true });
    return { ...receipt, directory, reused: Boolean(retained) };
  });
}
export async function readQcewReportReceiving(directory) {
  directory = resolve(directory);
  const receipt = await readPrivateJson(join(directory, 'county-received.json'), 65536);
  need(receipt.schema === QCEW_REPORT_RECEIVING && HASH.test(receipt.packageSha256 ?? '') &&
    Number.isSafeInteger(receipt.packageBytes) && receipt.packageBytes > 0 &&
    receipt.packageBytes <= QCEW_PUBLICATION_MAX_BYTES, 'Open the original received county report.');
  const bytes = await readBytes(join(directory, QCEW_REPORT_PACKAGE), receipt.packageBytes);
  need(bytes.length === receipt.packageBytes && sha256(bytes) === receipt.packageSha256,
    'The received report package changed.');
  const checked = decodeQcewReportDelivery(bytes);
  need(Object.entries(deliverySummary(checked)).every(([key, value]) => canonical(receipt[key]) === canonical(value)),
    'The original county receiving record changed.');
  let previous = null;
  for (const expected of checked.editions) {
    const actual = await readQcewFiles(directory, expected.manifest.editionId);
    validateQcewFilePackage(actual, { report: expected.report, previousReport: previous?.report ?? null });
    need(canonical(actual) === canonical({ manifest: expected.manifest, files: expected.files }),
      'An original received report member changed.');
    previous = expected;
  }
  return { receipt, ...checked, bytes, directory };
}
export async function exportQcewReportReceiving(directory) {
  const received = await readQcewReportReceiving(directory);
  return { bytes: received.bytes, filename: QCEW_REPORT_PACKAGE, contentType: 'application/gzip',
    sha256: received.receipt.packageSha256 };
}
