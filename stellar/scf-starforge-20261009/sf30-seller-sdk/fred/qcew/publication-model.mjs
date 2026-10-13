// MIT. County publication terms and complete retained project identities.
import { createHash } from 'node:crypto';
import { need, plain, clone, canonical } from './model.mjs';

export const QCEW_MERCHANT = 'stellar-forge.qcew-merchant.v1';
export const QCEW_PUBLICATION_EXTENSION = 'stellar-forge.fred-qcew-extension.v2';
export const QCEW_CUSTOMER_EXTENSION = 'stellar-forge.fred-qcew-extension.v3';
export const QCEW_REPORT_PACKAGE = 'report-package.json.gz';
export const QCEW_PUBLICATION_MAX_BYTES = 16 * 1024 * 1024;
export const QCEW_PUBLICATION_MAX_BUDGET = 64 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const files = new Set(['report-package.json.gz', 'manifest.json', 'report.html', 'report.json',
  'data.csv', 'source-rows.csv', 'methodology.md', 'changes.json', 'changes.csv', 'report.pdf']);

export function normalizeQcewMerchantTerms({ origin, path = '/county-reports', payment } = {}) {
  let url;
  try { url = new URL(origin); } catch { need(false, 'Choose the merchant’s public HTTPS origin.'); }
  need(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash &&
    url.pathname === '/' && [url.origin, url.origin + '/'].includes(origin),
    'Choose the merchant’s canonical public HTTPS origin.');
  need(typeof path === 'string' && (path === '' || /^\/[A-Za-z0-9_.~/-]*$/.test(path)) && !path.includes('//') &&
    path !== '/_seller' && !path.startsWith('/_seller/') && (path === '' || new URL(path, url.origin).pathname === path),
    'Choose a canonical county-report resource path.');
  path = path.replace(/\/$/, '');
  need(plain(payment), 'Use the merchant’s original public payment terms.');
  return { origin: url.origin, path, payment: clone(payment) };
}
export function qcewPublicationId({ editionId, origin, path, payment }) {
  need(HASH.test(editionId ?? ''), 'Choose a saved county-report edition.');
  const terms = normalizeQcewMerchantTerms({ origin, path, payment });
  return digest({ schema: QCEW_MERCHANT, editionId, ...terms });
}
export function qcewMerchantPlanIdentity(plan) {
  return { schema: plan.schema, publicationId: plan.publicationId, editionId: plan.editionId,
    reportId: plan.reportId, manifestSha256: plan.manifestSha256, deliverySha256: plan.deliverySha256,
    origin: plan.origin, path: plan.path, payment: plan.payment, resource: plan.resource,
    downloads: plan.downloads, configSha256: plan.configSha256, offersSha256: plan.offersSha256 };
}
export function qcewMerchantPlanSha256(plan) { return digest(qcewMerchantPlanIdentity(plan)); }
export function qcewPublicationRecord(plan, createdAt) {
  return { id: plan.publicationId, editionId: plan.editionId, reportId: plan.reportId,
    manifestSha256: plan.manifestSha256, deliverySha256: plan.deliverySha256, planSha256: plan.planSha256,
    origin: plan.origin, path: plan.path, payment: clone(plan.payment), resource: plan.resource, createdAt };
}
export function validateQcewPublicationRecord(record, edition) {
  need(plain(record) && ['id', 'editionId', 'reportId', 'manifestSha256', 'deliverySha256', 'planSha256']
    .every(key => HASH.test(record[key] ?? '')), 'The retained county publication identity changed.');
  const terms = normalizeQcewMerchantTerms(record);
  need(canonical(terms) === canonical({ origin: record.origin, path: record.path, payment: record.payment }) &&
    record.id === qcewPublicationId(record) &&
    record.resource === record.origin + record.path + '/' + record.id + '/files/' + QCEW_REPORT_PACKAGE &&
    typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt)),
    'The retained county publication terms changed.');
  if (edition) need(record.editionId === edition.id && record.reportId === edition.reportId &&
    record.manifestSha256 === edition.manifestSha256, 'The publication lost its original county edition.');
  return record;
}
export function validateQcewMerchantPlan(plan, { record = null, edition = null } = {}) {
  need(plain(plan) && plan.schema === QCEW_MERCHANT &&
    ['publicationId', 'editionId', 'reportId', 'manifestSha256', 'deliverySha256', 'planSha256',
      'configSha256', 'offersSha256'].every(key => HASH.test(plan[key] ?? '')),
    'The complete original county merchant plan is invalid.');
  const terms = normalizeQcewMerchantTerms(plan);
  need(canonical(terms) === canonical({ origin: plan.origin, path: plan.path, payment: plan.payment }) &&
    plan.publicationId === qcewPublicationId(plan) && plan.planSha256 === qcewMerchantPlanSha256(plan),
    'The original county merchant terms or plan identity changed.');
  const base = plan.origin + plan.path + '/' + plan.publicationId + '/files/';
  need(Array.isArray(plan.downloads) && plan.downloads.length >= 7 && plan.downloads.length <= files.size &&
    new Set(plan.downloads.map(file => file?.path)).size === plan.downloads.length,
    'Retain the complete county merchant file inventory.');
  let total = 0;
  for (const file of plan.downloads) {
    need(plain(file) && files.has(file.path) && HASH.test(file.sha256 ?? '') &&
      Number.isSafeInteger(file.bytes) && file.bytes >= 0 && file.bytes <= QCEW_PUBLICATION_MAX_BYTES &&
      typeof file.contentType === 'string' && file.contentType.length <= 200 &&
      ['REPORT_PACKAGE', 'REPORT_MANIFEST', 'REPORT_MEMBER'].includes(file.role) &&
      file.resource === base + file.path, 'An original county merchant resource changed.');
    total += file.bytes;
  }
  need(total <= QCEW_PUBLICATION_MAX_BUDGET &&
    ['report-package.json.gz', 'manifest.json', 'report.html', 'report.json', 'data.csv',
      'source-rows.csv', 'methodology.md'].every(path => plan.downloads.some(file => file.path === path)) &&
    plan.resource === base + QCEW_REPORT_PACKAGE, 'The complete county report resources changed.');
  if (record) {
    validateQcewPublicationRecord(record, edition);
    need(canonical(record) === canonical(qcewPublicationRecord(plan, record.createdAt)),
      'The saved publication differs from its original merchant plan.');
  } else if (edition) need(plan.editionId === edition.id && plan.reportId === edition.reportId &&
    plan.manifestSha256 === edition.manifestSha256, 'The merchant plan lost its saved county report.');
  return plan;
}
