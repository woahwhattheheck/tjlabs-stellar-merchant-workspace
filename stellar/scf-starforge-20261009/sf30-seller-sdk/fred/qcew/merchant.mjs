// MIT. Exact county-report files compose the maintained SF30 asset seller.
import { resolve, join } from 'node:path';
import { privateDirectory, readPrivateJson, withPrivateLock } from '../../routescan/quota.mjs';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { compileHttpSellerOffer } from '../../seller.mjs';
import { readSellerConfig, startSellerService } from '../../serve.mjs';
import { compileAssetRouteOffer, MAX_ASSET_BYTES, MAX_ASSET_BUDGET } from '../../response-asset.mjs';
import { createNativeHttpFactory } from '../../native-http-factory.mjs';
import { need, clone, canonical } from './model.mjs';
import { sha256 } from './source.mjs';
import { qcewMemberBytes } from './files.mjs';
import { createQcewReportDelivery, encodeQcewReportDelivery, decodeQcewReportDelivery,
  retainQcewDeliveryBytes } from './delivery.mjs';
import { QCEW_MERCHANT, QCEW_REPORT_PACKAGE, normalizeQcewMerchantTerms, qcewPublicationId,
  qcewMerchantPlanSha256, validateQcewMerchantPlan } from './publication-model.mjs';

const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const HASH = /^[a-f0-9]{64}$/;
const descriptor = (path, bytes, contentType, role) =>
  ({ path, bytes: bytes.length, sha256: sha256(bytes), contentType, role });
async function exactFile(directory, name, bytes) {
  try { await writeBytes(join(directory, name), bytes, { exclusive: true }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const original = await readBytes(join(directory, name), Math.max(bytes.length, 1));
    need(original.equals(bytes), 'The immutable county merchant file contains other bytes.', 'QCEW_PUBLICATION_CONFLICT', 409);
  }
}
export function qcewPublicationDirectory(directory, publicationId) {
  need(HASH.test(publicationId ?? ''), 'Choose a retained county publication.');
  return join(resolve(directory), 'qcew', 'publications', publicationId);
}
function merchantDefinition({ deliveryBytes, origin, path, payment }) {
  const checked = decodeQcewReportDelivery(deliveryBytes);
  const terms = normalizeQcewMerchantTerms({ origin, path, payment });
  const edition = checked.edition, manifest = edition.manifest;
  const publicationId = qcewPublicationId({ editionId: manifest.editionId, ...terms });
  const base = terms.path + '/' + publicationId + '/files/';
  const assets = [
    { ...descriptor(QCEW_REPORT_PACKAGE, deliveryBytes, 'application/gzip', 'REPORT_PACKAGE'), body: deliveryBytes },
    { ...descriptor('manifest.json', jsonBytes(manifest), 'application/json; charset=utf-8', 'REPORT_MANIFEST'), body: jsonBytes(manifest) },
    ...edition.files.map(file => ({ ...descriptor(file.name, qcewMemberBytes(file), file.contentType, 'REPORT_MEMBER'),
      body: qcewMemberBytes(file) }))
  ];
  need(assets.every(file => file.bytes <= MAX_ASSET_BYTES) &&
    assets.reduce((sum, file) => sum + file.bytes, 0) <= MAX_ASSET_BUDGET,
    'The complete report resources exceed the native seller’s asset capacity.', 'QCEW_PUBLICATION_CAPACITY', 413);
  const config = { schema: 'stellar-forge.seller-service.v1', publicOrigin: terms.origin,
    maxResponseBytes: Math.max(1, ...assets.map(file => file.bytes)), assetBudgetBytes: MAX_ASSET_BUDGET,
    routes: assets.map(file => ({ id: 'county-' + file.path.replaceAll('.', '-'), path: base + file.path,
      definition: { method: 'GET', serviceName: 'County economic reports',
        description: file.path === QCEW_REPORT_PACKAGE
          ? 'Complete saved county report, original report files and predecessor editions'
          : 'Original county report file: ' + file.path, payment: clone(terms.payment) },
      responseAsset: { file: file.path, sha256: file.sha256, contentType: file.contentType, downloadName: file.path } })) };
  const offers = config.routes.map(route => compileAssetRouteOffer(route, terms.origin, compileHttpSellerOffer));
  const configBytes = jsonBytes(config), offersBytes = jsonBytes({ resources: offers });
  const plan = { schema: QCEW_MERCHANT, publicationId, editionId: manifest.editionId,
    reportId: manifest.reportId, manifestSha256: manifest.manifestSha256,
    deliverySha256: checked.delivery.deliverySha256, ...terms,
    resource: terms.origin + base + QCEW_REPORT_PACKAGE,
    downloads: assets.map(({ body, ...file }) => ({ ...file, resource: terms.origin + base + file.path })),
    configSha256: sha256(configBytes), offersSha256: sha256(offersBytes) };
  plan.planSha256 = qcewMerchantPlanSha256(plan);
  validateQcewMerchantPlan(plan);
  return { checked, assets, plan, config, configBytes, offers, offersBytes };
}
function editionView(checked) {
  const { edition, delivery } = checked;
  return { schema: 'stellar-forge.qcew-merchant-edition.v1', editionId: delivery.editionId,
    reportId: delivery.reportId, manifestSha256: delivery.manifestSha256, deliverySha256: delivery.deliverySha256,
    title: edition.report.profile.definition.title, period: clone(edition.report.period),
    source: clone(edition.report.source), cpi: clone(edition.report.cpi),
    availability: clone(edition.report.availability), files: clone(edition.manifest.files),
    predecessorEditions: checked.editions.length - 1 };
}
export async function prepareQcewMerchant({ directory, editions, origin, path = '/county-reports', payment,
  originalDeliveryBytes = null } = {}) {
  const delivery = createQcewReportDelivery(editions);
  directory = await privateDirectory(resolve(directory));
  return withPrivateLock(directory, 'county-merchant.lock', async () => {
    let deliveryBytes = originalDeliveryBytes;
    if (deliveryBytes === null) {
      try { deliveryBytes = await readBytes(join(directory, QCEW_REPORT_PACKAGE), MAX_ASSET_BYTES); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    deliveryBytes ??= encodeQcewReportDelivery(delivery);
    need(canonical(decodeQcewReportDelivery(deliveryBytes).delivery) === canonical(delivery),
      'Retain the exact original paid report package for these complete editions.');
    const value = merchantDefinition({ deliveryBytes, origin, path, payment });
    await retainQcewDeliveryBytes(directory, deliveryBytes);
    for (const file of value.assets) if (file.path !== QCEW_REPORT_PACKAGE) await exactFile(directory, file.path, file.body);
    await exactFile(directory, 'merchant-config.json', value.configBytes);
    await exactFile(directory, 'offers.json', value.offersBytes);
    await readSellerConfig(join(directory, 'merchant-config.json'));
    await exactFile(directory, 'merchant-plan.json', jsonBytes(value.plan));
    return { edition: editionView(value.checked), plan: value.plan, directory };
  });
}
export async function readQcewMerchant(directory) {
  directory = resolve(directory);
  const plan = validateQcewMerchantPlan(await readPrivateJson(join(directory, 'merchant-plan.json'), 256 * 1024));
  const packageFile = plan.downloads.find(file => file.path === QCEW_REPORT_PACKAGE);
  const deliveryBytes = await readBytes(join(directory, QCEW_REPORT_PACKAGE), packageFile.bytes);
  need(deliveryBytes.length === packageFile.bytes && sha256(deliveryBytes) === packageFile.sha256,
    'The original paid report package changed.');
  const value = merchantDefinition({ deliveryBytes, origin: plan.origin, path: plan.path, payment: plan.payment });
  need(canonical(plan) === canonical(value.plan), 'The original county merchant plan or file inventory changed.');
  for (const asset of value.assets) {
    if (asset.path === QCEW_REPORT_PACKAGE) continue;
    const bytes = await readBytes(join(directory, asset.path), Math.max(1, asset.bytes));
    need(bytes.length === asset.bytes && sha256(bytes) === asset.sha256,
      'The original county merchant resource changed: ' + asset.path);
  }
  const configBytes = await readBytes(join(directory, 'merchant-config.json'), 256 * 1024);
  const offersBytes = await readBytes(join(directory, 'offers.json'), 256 * 1024);
  need(configBytes.equals(value.configBytes) && offersBytes.equals(value.offersBytes),
    'The original county seller configuration or offers changed.');
  return { edition: editionView(value.checked), plan, directory,
    config: await readSellerConfig(join(directory, 'merchant-config.json')), offers: value.offers, offersBytes, deliveryBytes };
}
export async function startQcewMerchant({ directory, port = 0, nativeFactory, facilitator,
  allowLocalFacilitator = false, maxInFlight = 64, drainGraceMs = 60000 } = {}) {
  need(!(nativeFactory && facilitator), 'Choose the existing native factory or configured facilitator.');
  const { edition, plan, config } = await readQcewMerchant(directory);
  const factory = nativeFactory ?? (facilitator ? await createNativeHttpFactory({ facilitator, allowLocalFacilitator }) : null);
  const session = await startSellerService({ config, port, nativeFactory: factory, maxInFlight, drainGraceMs });
  return { ...session, publicationId: plan.publicationId, editionId: edition.editionId,
    reportId: edition.reportId, resource: plan.resource, mode: factory ? 'NATIVE_SELLER' : 'CHALLENGE_ONLY' };
}
