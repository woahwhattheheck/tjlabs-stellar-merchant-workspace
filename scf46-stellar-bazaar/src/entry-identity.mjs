// SPDX-License-Identifier: MIT
// Shared catalog structure and search metadata. Payment admission remains with the catalog owner.
import { inspectResourceURL, inspectRouteTemplate } from '../../stellar-forge/route-identity/identity.mjs';

const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const printable = (v) => typeof v === 'string' && v.length > 0 && v.length <= 32 && /^[\x20-\x7E]+$/.test(v);
const MCP_TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const LOOPBACK_NAMES = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback']);

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

function keyOf(entry) {
  const info = entry.extensions?.bazaar?.info?.input;
  if (!plain(info) || !['http','mcp'].includes(info.type)) throw new TypeError('Valid HTTP or MCP Bazaar info required');
  // Reject raw encoded traversal before WHATWG URL normalization.
  const checked = inspectResourceURL(entry.resource?.url);
  if (!checked.ok) throw new TypeError(`Invalid resource URL: ${checked.reason}`);
  const url = checked.url;
  if (info.type === 'mcp') {
    if (typeof info.toolName !== 'string' || !MCP_TOOL_NAME.test(info.toolName) || !plain(info.inputSchema)) throw new TypeError('Invalid MCP tool');
    return ['mcp',url.href,info.toolName].join('|');
  }
  if (!['GET','HEAD','DELETE','POST','PUT','PATCH'].includes(info.method)) throw new TypeError('Invalid HTTP method');
  // Different concrete path parameter values collapse to the same canonical entry.
  const template = inspectRouteTemplate(entry.extensions.bazaar.routeTemplate);
  const path = template.ok ? template.canonicalPath : url.pathname;
  return ['http',url.origin,path,url.search,info.method].join('|');
}


/** The exact existing envelope checks and canonical catalog key. */
export function validateCatalogEntryIdentity(entry) {
  if (!plain(entry?.resource) || !Array.isArray(entry.accepts) || entry.accepts.length === 0 ||
      !plain(entry.extensions?.bazaar) || !plain(entry.extensions.bazaar.info) ||
      !plain(entry.extensions.bazaar.schema)) throw new TypeError('Missing validated Bazaar envelope');
  if (entry.accepts.some(a => !plain(a) || typeof a.network !== 'string' || typeof a.scheme !== 'string' || typeof a.payTo !== 'string')) throw new TypeError('Invalid payment terms');
  return keyOf(entry);
}

/** Detached fields for search. Metadata is syntax-sanitized but never fetched;
 * pricing remains with its original consumers and does not authorize payment. */
export function projectCatalogSearchEntry(entry) {
  const id = validateCatalogEntryIdentity(entry), projected = structuredClone(entry);
  projected.resource = sanitizeResourceSearchMetadata(projected.resource);
  return { id, entry: projected };
}

