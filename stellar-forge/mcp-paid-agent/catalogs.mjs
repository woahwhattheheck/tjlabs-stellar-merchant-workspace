// SPDX-License-Identifier: MIT
// Trusted host catalog configuration. Remote tool input selects an ID only.
export const BAZAAR_CATALOGS_SCHEMA = 'stellar-forge.bazaar-catalogs.v1';
export const MAX_BAZAAR_CATALOGS = 16;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function invalid(message, details) {
  throw Object.assign(new TypeError(message), {code:'BAZAAR_CATALOG_CONFIGURATION_INVALID',
    ...(details === undefined ? {} : {details})});
}
export function catalogIdentifier(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value))
    invalid('Catalog IDs use 1–64 lowercase letters, digits or hyphens, starting with a letter or digit.');
  return value;
}
export function normalizeCatalogUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.trim() !== value ||
      /[\u0000-\u0020\u007f]/.test(value))
    invalid('Supply the complete configured HTTP or HTTPS catalog base URL.');
  let url;
  try { url = new URL(value); } catch { invalid('Invalid configured catalog URL.'); }
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    invalid('Catalog base URLs cannot contain credentials, query parameters or a fragment.');
  return url.href;
}
export function normalizeCatalogDescription(value) {
  if (!plain(value) || Object.keys(value).some(key => !['id','label','url'].includes(key)))
    invalid('Each configured catalog requires its ID, label and base URL.');
  const id = catalogIdentifier(value.id);
  if (typeof value.label !== 'string' || !value.label || value.label.length > 80 ||
      value.label.trim() !== value.label || /[\u0000-\u001f\u007f]/.test(value.label))
    invalid('A catalog label contains 1–80 visible characters.', {catalogId:id});
  return {id, label:value.label, url:normalizeCatalogUrl(value.url)};
}
/** The original single-URL host remains a one-entry configuration named default. */
export function normalizeCatalogConfiguration({discoveryUrl, discoveryCatalogs} = {}) {
  if (discoveryCatalogs === undefined) {
    if (discoveryUrl === undefined) invalid('Configure a discovery URL or an explicit catalog list.');
    return {schema:BAZAAR_CATALOGS_SCHEMA, defaultCatalogId:'default', catalogs:[
      {id:'default', label:'Configured catalog', url:normalizeCatalogUrl(discoveryUrl)},
    ]};
  }
  if (!plain(discoveryCatalogs) || Object.keys(discoveryCatalogs).some(key =>
      !['schema','defaultCatalogId','catalogs'].includes(key)) ||
      discoveryCatalogs.schema !== BAZAAR_CATALOGS_SCHEMA ||
      !Array.isArray(discoveryCatalogs.catalogs) || discoveryCatalogs.catalogs.length < 1 ||
      discoveryCatalogs.catalogs.length > MAX_BAZAAR_CATALOGS)
    invalid('Configure one through sixteen original catalogs with an explicit defaultCatalogId.');
  const catalogs = discoveryCatalogs.catalogs.map(normalizeCatalogDescription);
  // These URL forms reach the same discovery base. Do not advertise them as two sources.
  const baseIdentity = value => value.endsWith('/') ? value : value + '/';
  if (new Set(catalogs.map(value => value.id)).size !== catalogs.length ||
      new Set(catalogs.map(value => baseIdentity(value.url))).size !== catalogs.length)
    invalid('Configured catalogs need distinct IDs and discovery bases.');
  const defaultCatalogId = catalogIdentifier(discoveryCatalogs.defaultCatalogId);
  const selected = catalogs.find(value => value.id === defaultCatalogId);
  if (!selected) invalid('The default catalog must be present in the configured list.');
  if (discoveryUrl !== undefined && normalizeCatalogUrl(discoveryUrl) !== selected.url)
    invalid('BAZAAR_DISCOVERY_URL must identify the configured default catalog.');
  return {schema:BAZAAR_CATALOGS_SCHEMA, defaultCatalogId, catalogs};
}
export function selectCatalog(configuration, catalogId = configuration.defaultCatalogId) {
  catalogIdentifier(catalogId);
  const selected = configuration.catalogs.find(value => value.id === catalogId);
  if (!selected) throw Object.assign(new Error('The selected catalog is not configured on this buyer host.'),
    {code:'BAZAAR_CATALOG_UNKNOWN', details:{catalogId}});
  return {...selected};
}
/** Source labels are presentation; the original ID and URL determine continuity. */
export function sameCatalog(a, b) {
  return plain(a) && plain(b) && a.id === b.id && a.url === b.url;
}
