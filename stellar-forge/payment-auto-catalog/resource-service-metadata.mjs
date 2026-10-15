/**
 * Bazaar resource metadata soft-drop boundary.
 * Source pin: x402-foundation/x402@faa1c694c66a3732aaabbce93bdae140e521a67d
 * Bazaar spec blob: 442708e76d5a129e0c1393471d8ed71e3604c94e
 * Core ResourceInfo schema blob: 2fd54484b1a3c44dce537315946d26a1e52467de
 * Facilitator extractor blob: 083013ee19544e182c2e3185d7853309c34b9d9c
 */
import { domainToASCII } from 'node:url';

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;
const CONTROL_CHAR = /[\x00-\x1f\x7f]/;
const UNICODE_CONTROL = /\p{Cc}/u;
const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const ALL_DIGITS = /^\d+$/;
const HEX_LITERAL = /^0x[0-9a-f]+$/i;
const LOOPBACK_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
]);

export function isValidServiceName(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 32 &&
    !UNICODE_CONTROL.test(value) && PRINTABLE_ASCII.test(value);
}

export function sanitizeTags(value) {
  if (!Array.isArray(value)) return undefined;
  const tags = [];
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 32 ||
        UNICODE_CONTROL.test(entry) || !PRINTABLE_ASCII.test(entry)) continue;
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(entry);
    if (tags.length === 5) break;
  }
  return tags.length ? tags : undefined;
}

export function isValidIconUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048 ||
      CONTROL_CHAR.test(value)) return false;
  let url;
  try { url = new URL(value); }
  catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '')
    return false;
  // WHATWG URL retains brackets in host for IPv6 literals.
  if (url.host.startsWith('[')) return false;
  let hostname;
  try { hostname = decodeURIComponent(url.hostname); }
  catch { return false; }
  hostname = domainToASCII(hostname).toLowerCase();
  if (!hostname || LOOPBACK_HOSTS.has(hostname) || IPV4.test(hostname) ||
      ALL_DIGITS.test(hostname) || HEX_LITERAL.test(hostname)) return false;
  return true;
}

export function sanitizeResourceServiceMetadata(resource) {
  if (resource == null || typeof resource !== 'object' || Array.isArray(resource)) return {};
  const metadata = {};
  if (isValidServiceName(resource.serviceName)) metadata.serviceName = resource.serviceName;
  const tags = sanitizeTags(resource.tags);
  if (tags) metadata.tags = tags;
  if (isValidIconUrl(resource.iconUrl)) metadata.iconUrl = resource.iconUrl;
  return metadata;
}

export function sanitizeResourceForCatalog(resource) {
  const safe = structuredClone(resource);
  for (const field of ['description', 'mimeType']) {
    if (typeof safe[field] !== 'string') delete safe[field];
  }
  delete safe.serviceName;
  delete safe.tags;
  delete safe.iconUrl;
  return Object.assign(safe, sanitizeResourceServiceMetadata(resource));
}
