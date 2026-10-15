// SPDX-License-Identifier: MIT
// Shared catalog structure and search metadata. Payment admission remains with the catalog owner.
import { inspectResourceURL, resolveCatalogIdentity } from '../../stellar-forge/route-identity/identity.mjs';

const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const printable = (v) => typeof v === 'string' && v.length > 0 && v.length <= 32 && /^[\x20-\x7E]+$/.test(v);
const LOOPBACK_NAMES = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback']);
const UNSAFE_RESOURCE_CHAR = /[\x00-\x20\x7f\\]/;

/** Apply the x402 Bazaar iconUrl soft-drop rules without fetching the URL. */
export function isValidIconUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048 ||
      /[\x00-\x1f\x7f-\x9f]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    // WHATWG URL performs UTS #46 normalization and canonicalizes alternate
    // IPv4 spellings. Decode once more before the required hostname checks so
    // an encoded loopback label cannot survive as apparently public metadata.
    const hostname = decodeURIComponent(url.hostname).toLowerCase().replace(/\.$/, '');
    if (!hostname || LOOPBACK_NAMES.has(hostname) || /^\d+$/.test(hostname) ||
        /^0x[0-9a-f]+$/.test(hostname)) return false;
    // WHATWG represents IPv6 literals in brackets and canonicalizes every
    // accepted IPv4 literal to dotted decimal, including integer/hex forms.
    if (/^\[.*\]$/.test(hostname) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
    return true;
  } catch { return false; }
}

export function sanitizeResourceSearchMetadata(resource) {
  const result = { ...resource };
  if (!printable(result.serviceName)) delete result.serviceName;
  if (!Array.isArray(result.tags)) delete result.tags;
  else {
    const seen = new Set();
    result.tags = result.tags.filter(t => {
      if (!printable(t) || seen.has(t.toLowerCase())) return false;
      seen.add(t.toLowerCase());
      return seen.size <= 5;
    }).slice(0, 5);
  }
  if (!isValidIconUrl(result.iconUrl)) delete result.iconUrl;
  return result;
}

function discoveryURLOf(entry, info) {
  const raw = entry.resource?.url;
  // x402's facilitator drops the fragment before cataloging. Preserve the
  // stricter raw-path inspection here: only the fragment suffix is removed,
  // and unsafe characters anywhere in the seller-supplied URL still fail.
  if (typeof raw !== 'string') throw new TypeError('Invalid resource URL: RESOURCE_URL_MISSING');
  if (raw.length > 4096) throw new TypeError('Invalid resource URL: RESOURCE_URL_TOO_LONG');
  if (UNSAFE_RESOURCE_CHAR.test(raw)) throw new TypeError('Invalid resource URL: RESOURCE_URL_UNSAFE_CHAR');
  const fragmentAt = raw.indexOf('#');
  const fragmentless = fragmentAt === -1 ? raw : raw.slice(0, fragmentAt);
  const inspected = inspectResourceURL(fragmentless);
  if (!inspected.ok) throw new TypeError(`Invalid resource URL: ${inspected.reason}`);
  if (info.type !== 'http') return { resourceURL: `${inspected.url.origin}${inspected.url.pathname}` };
  // Reuse the stricter route binder so a valid-looking template can only
  // collapse concrete paths that it actually describes. Mismatches fall back
  // to the concrete path instead of overwriting an unrelated catalog row.
  const resolved = resolveCatalogIdentity({
    resourceURL: fragmentless,
    input: info,
    routeTemplate: entry.extensions.bazaar.routeTemplate
  });
  const routeTemplate = resolved.status === 'accepted' ? resolved.canonicalRouteTemplate : undefined;
  return {
    resourceURL: `${inspected.url.origin}${routeTemplate ?? inspected.url.pathname}`,
    ...(routeTemplate === undefined ? {} : { routeTemplate })
  };
}

function identityOf(entry) {
  const info = entry.extensions?.bazaar?.info?.input;
  if (!plain(info) || !['http','mcp'].includes(info.type)) throw new TypeError('Valid HTTP or MCP Bazaar info required');
  const discovery = discoveryURLOf(entry, info);
  const { resourceURL } = discovery;
  if (info.type === 'mcp') {
    // The official x402 Bazaar contract deliberately treats an MCP tool name as
    // an opaque, non-empty string. Do not invent an ASCII alphabet or length
    // limit here: doing so would reject conforming tools before cataloging and
    // would change their protocol identity.
    if (typeof info.toolName !== 'string' || info.toolName.length === 0 || !plain(info.inputSchema)) throw new TypeError('Invalid MCP tool');
    return { id: ['mcp',resourceURL,info.toolName].join('|'), resourceURL };
  }
  if (!['GET','HEAD','DELETE','POST','PUT','PATCH'].includes(info.method)) throw new TypeError('Invalid HTTP method');
  // Retain the established implementation-private key layout for queryless
  // resources; canonicalization empties the former search component.
  const canonical = new URL(resourceURL);
  return { id: ['http',canonical.origin,canonical.pathname,'',info.method].join('|'), ...discovery };
}

function validatedIdentityOf(entry) {
  if (!plain(entry?.resource) || !Array.isArray(entry.accepts) || entry.accepts.length === 0 ||
      !plain(entry.extensions?.bazaar) || !plain(entry.extensions.bazaar.info) ||
      !plain(entry.extensions.bazaar.schema)) throw new TypeError('Missing validated Bazaar envelope');
  if (entry.accepts.some(a => !plain(a) || typeof a.network !== 'string' || typeof a.scheme !== 'string' || typeof a.payTo !== 'string')) throw new TypeError('Invalid payment terms');
  return identityOf(entry);
}

/** The exact existing envelope checks and canonical catalog key. */
export function validateCatalogEntryIdentity(entry) {
  return validatedIdentityOf(entry).id;
}

/** Canonical x402 Bazaar discovery URL stored under the catalog identity. */
export function canonicalCatalogResourceURL(entry) {
  return validatedIdentityOf(entry).resourceURL;
}

/** Validated key, canonical URL, and any path-bound canonical route template. */
export function validateCatalogEntryProjection(entry) {
  return validatedIdentityOf(entry);
}

/** Detached fields for search. Metadata is syntax-sanitized but never fetched;
 * pricing remains with its original consumers and does not authorize payment. */
export function projectCatalogSearchEntry(entry) {
  const { id, resourceURL, routeTemplate } = validatedIdentityOf(entry), projected = structuredClone(entry);
  projected.resource = sanitizeResourceSearchMetadata(projected.resource);
  projected.resource.url = resourceURL;
  if (routeTemplate === undefined) delete projected.extensions.bazaar.routeTemplate;
  else projected.extensions.bazaar.routeTemplate = routeTemplate;
  return { id, entry: projected };
}

