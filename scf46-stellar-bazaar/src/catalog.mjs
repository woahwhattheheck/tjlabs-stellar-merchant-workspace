// MIT. x402 v2 Bazaar discovery-core prototype: no settlement or external registrations.
import { createHash } from 'node:crypto';
import { inspectResourceURL, inspectRouteTemplate } from '../../stellar-forge/route-identity/identity.mjs';
import { CatalogQueryIndex } from './query-index.mjs';
import { validateCatalogEntryProjection, sanitizeResourceSearchMetadata } from './entry-identity.mjs';
import { sanitizeBazaarPricing, parseAtomicBudget, describeCatalogPricing } from './pricing.mjs';

const ALLOWED = new Set(['type','payTo','network','scheme','asset','extensions']);
const DISCOVERY_RESOURCE_FIELDS = ['description','mimeType','serviceName','tags','iconUrl'];

export function isValidRouteTemplate(template) {
  // Reuse SF28 multi-decode path validation at the actual catalog boundary.
  return inspectRouteTemplate(template).ok;
}

export function sanitizeResourceServiceMetadata(resource) {
  return sanitizeResourceSearchMetadata(resource);
}

function filtersFrom(params) {
  const f = {};
  for (const k of ALLOWED) {
    const v = params.get(k);
    if (v !== null) f[k] = v;
  }
  return f;
}
/**
 * Parse and sanitize a trusted-caller candidate without mutating a catalog.
 * Trust/sequence/ownership checks belong to the caller; this only applies the
 * same structural rules as insertValidated and returns the exact eventual key.
 */
export function validateCatalogEntry(entry) {
  const { id, resourceURL, routeTemplate } = validateCatalogEntryProjection(entry);
  const sanitized = structuredClone(entry);
  sanitized.resource = sanitizeResourceServiceMetadata(sanitized.resource);
  sanitized.resource.url = resourceURL;
  // Proposed upstream optional pricing is catalog-only. Bad seller metadata
  // cannot invalidate an otherwise usable offer or leak unbounded hints.
  const pricing = sanitizeBazaarPricing(sanitized.extensions.bazaar.pricing);
  if (pricing === null) delete sanitized.extensions.bazaar.pricing;
  else sanitized.extensions.bazaar.pricing = pricing;
  if (routeTemplate !== undefined) sanitized.extensions.bazaar.routeTemplate = routeTemplate;
  else delete sanitized.extensions.bazaar.routeTemplate;
  return { id, entry: sanitized };
}
const signature = (query, filters) => createHash('sha256').update(JSON.stringify([query, filters])).digest('hex').slice(0,20);
const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const decode = (str) => {
  // Valid cursors are tiny canonical base64url JSON payloads. Validate length
  // and alphabet before decoding attacker-controlled input.
  if (typeof str !== 'string' || !str.length || str.length > 512 || !/^[A-Za-z0-9_-]+$/.test(str)) throw new RangeError('Invalid cursor');
  try {
    const raw = Buffer.from(str, 'base64url');
    if (raw.toString('base64url') !== str) throw new RangeError('Invalid cursor');
    return JSON.parse(raw.toString('utf8'));
  } catch {throw new RangeError('Invalid cursor');}
};
const asInteger = (v, fallback, max, min = 0) => {
  if (v === null) return fallback;
  if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) < min || Number(v) > max) throw new RangeError('Invalid pagination parameter');
  return Number(v);
};

function discoveryTimestamp(value) {
  if (typeof value !== 'string') throw new TypeError('Trusted catalog observation time required');
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new TypeError('Invalid catalog observation time');
  return instant.toISOString();
}

function discoveryRow(entry, lastUpdated) {
  const input = entry.extensions?.bazaar?.info?.input;
  if (!input || !['http','mcp'].includes(input.type))
    throw new TypeError('Valid HTTP or MCP Bazaar info required');
  const row = {
    resource: entry.resource.url,
    type: input.type,
    x402Version: 2,
    accepts: structuredClone(entry.accepts),
    lastUpdated: discoveryTimestamp(lastUpdated),
  };
  for (const field of DISCOVERY_RESOURCE_FIELDS)
    if (Object.hasOwn(entry.resource, field)) row[field] = structuredClone(entry.resource[field]);
  if (entry.extensions !== undefined) row.extensions = structuredClone(entry.extensions);
  return row;
}

export class BazaarCatalog {
  #entries = new Map(); #version = 0;
  #lastUpdated = new Map();
  #queries = new CatalogQueryIndex(this.#entries);
  // Call only from a trusted post-verification facilitator hook AFTER checking the
  // settlement, seller/recipient binding, and JSON Schema Draft 2020-12. NEVER
  // route this method directly to an unauthenticated HTTP client or payment payload.
  insertValidated(entry, { lastUpdated } = {}) {
    const { id, entry: sanitized } = validateCatalogEntry(entry);
    const previous = this.#entries.get(id);
    const timestamp = lastUpdated === undefined ? this.#lastUpdated.get(id) : discoveryTimestamp(lastUpdated);
    this.#entries.set(id, sanitized); this.#version++;
    if (timestamp === undefined) this.#lastUpdated.delete(id);
    else this.#lastUpdated.set(id, timestamp);
    this.#queries.changed(id, previous, sanitized);
    return id;
  }
  /** Internal integration primitive: remove an already-authorized key. */
  removeValidated(id) {
    if (typeof id !== 'string') throw new TypeError('Catalog key required');
    const previous = this.#entries.get(id);
    const removed = this.#entries.delete(id);
    if (removed) { this.#lastUpdated.delete(id); this.#version++; this.#queries.changed(id, previous, undefined); }
    return removed;
  }
  /** Stage an isolated transaction while preserving the cursor generation. */
  clone() {
    const copy = new BazaarCatalog();
    copy.#entries = new Map([...this.#entries].map(([key, value]) => [key, structuredClone(value)]));
    copy.#lastUpdated = new Map(this.#lastUpdated);
    copy.#version = this.#version;
    copy.#queries = new CatalogQueryIndex(copy.#entries);
    return copy;
  }
  list(params = new URLSearchParams()) {
    const filters = filtersFrom(params);
    const offset = asInteger(params.get('offset'),0,1_000_000);
    const limit = asInteger(params.get('limit'),20,100,1);
    // The original ordering/filtering contract now reuses the private query index.
    const all = this.#queries.list(filters);
    // Public read results must not expose the authoritative mutable entry objects.
    // Clone only the returned page, not the whole filtered catalog.
    return { resources: all.slice(offset,offset+limit).map(row => structuredClone(row)),pagination:{offset,limit,total:all.length} };
  }
  search(params = new URLSearchParams()) {
    const q = params.get('query');
    if (typeof q !== 'string' || !q.trim() || q.length > 1024) throw new RangeError('query is required (max 1024 chars)');
    const filters = filtersFrom(params);
    const limit = asInteger(params.get('limit'),20,100,1);
    const digest = signature(q, filters);
    let at = 0;
    if (params.has('cursor')) {
      const c = decode(params.get('cursor'));
      if (c?.v !== this.#version || c?.h !== digest || !Number.isSafeInteger(c.at) || c.at < 0) throw new RangeError('Stale or invalid cursor');
      at = c.at;
    }
    const ranked = this.#queries.search(filters, q);
    const page = ranked.slice(at,at+limit).map(row => structuredClone(row));
    const next = at+limit < ranked.length ? encode({v:this.#version,h:digest,at:at+limit}) : null;
    return { resources:page,partialResults:next !== null,pagination:{limit:page.length,cursor:next} };
  }
  /** Official x402 Bazaar list envelope. Internal list() remains unchanged. */
  listDiscovery(params = new URLSearchParams()) {
    const page = this.list(params);
    return { x402Version: 2,
      items: page.resources.map(entry => discoveryRow(entry,
        this.#lastUpdated.get(validateCatalogEntryProjection(entry).id))),
      pagination: page.pagination };
  }
  /** Official x402 Bazaar search envelope. Internal search() remains unchanged. */
  searchDiscovery(params = new URLSearchParams()) {
    const page = this.search(params);
    return { x402Version: 2,
      resources: page.resources.map(entry => discoveryRow(entry,
        this.#lastUpdated.get(validateCatalogEntryProjection(entry).id))),
      partialResults: page.partialResults,
      pagination: page.pagination };
  }
  /**
   * Aggregate preflight for an operator that is about to expose discovery.
   * The snapshot contains no resource, payment or query data. A catalog can
   * remain useful to internal callers while reporting that one or more rows
   * lack the trusted observation time required by the public x402 v2 wire.
   */
  discoveryReadiness() {
    let observedResources = 0;
    let unreadyResources = 0;
    for (const [id, entry] of this.#entries) {
      try {
        discoveryRow(entry, this.#lastUpdated.get(id));
        observedResources++;
      } catch {
        unreadyResources++;
      }
    }
    return {
      ready: unreadyResources === 0,
      x402Version: 2,
      catalogVersion: this.#version,
      resources: this.#entries.size,
      observedResources,
      unreadyResources,
    };
  }
  /**
   * Opt-in buyer-facing discovery. Never silently drop metered routes whose
   * authorization ceiling exceeds a buyer's expected per-call spend.
   * Comparisons are per-network, per-asset atomic units, and are not
   * authorizations or observations of settled amounts.
   */
  pricing(params = new URLSearchParams()) {
    const rawBudget = params.get('budgetAtomic');
    if (rawBudget !== null && (!params.get('network') || !params.get('asset')))
      throw new RangeError('budgetAtomic requires network and asset filters');
    const budget = rawBudget === null ? null : parseAtomicBudget(rawBudget);
    const filters = filtersFrom(params);
    const page = this.list(params);
    return {
      resources: page.resources.map(row => ({
        ...row,
        pricingView: {
          offers: describeCatalogPricing(row, filters, budget),
          budgetAtomic: rawBudget,
          note: 'Seller-declared snapshot only. Fetch live 402 and obtain buyer approval before authorization.'
        }
      })),
      pagination: page.pagination,
      pricingViewVersion: 'stellar-bazaar-pricing-v1'
    };
  }
  get size() {return this.#entries.size;}
  get version() {return this.#version;}
  /** Detached process-local diagnostics; no rows, queries or payment data. */
  get queryStats() {return this.#queries.stats;}
}

export function createDiscoveryServer(catalog) {
  if (!catalog || typeof catalog.listDiscovery !== 'function' ||
      typeof catalog.searchDiscovery !== 'function' ||
      typeof catalog.discoveryReadiness !== 'function')
    throw new TypeError('Official Bazaar discovery catalog required');
  // Read-only HTTP API. No endpoint permits client-injected catalog records.
  return async function handler(req,res) {
    try {
      const u = new URL(req.url,'http://localhost');
      if (req.method !== 'GET') {res.writeHead(405,{'content-type':'application/json'});res.end(JSON.stringify({error:'METHOD_NOT_ALLOWED',reason:'GET only'}));return;}
      let status = 200;
      const data = u.pathname === '/discovery/resources' ? catalog.listDiscovery(u.searchParams)
        : u.pathname === '/discovery/search' ? catalog.searchDiscovery(u.searchParams)
        : u.pathname === '/discovery/pricing' ? catalog.pricing(u.searchParams)
        : u.pathname === '/discovery/readiness' ? catalog.discoveryReadiness() : null;
      if (!data) {res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:'NOT_FOUND',reason:'Unknown endpoint'}));return;}
      if (u.pathname === '/discovery/readiness' && !data.ready) status = 503;
      res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify(data));
    } catch(e) {
      const code = e instanceof RangeError ? 400 : 500;
      res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({error:code===400?'INVALID_REQUEST':'INTERNAL_ERROR',reason:code===400?e.message:'Internal error'}));
    }
  };
}
