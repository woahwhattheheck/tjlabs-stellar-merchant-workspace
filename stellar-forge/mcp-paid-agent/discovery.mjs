// MIT. Shared native Bazaar request, filtering and pagination contracts.
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const text = (value, max = 4096) => typeof value === 'string' && value.length > 0 &&
  value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
const atomic = value => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value);
const filters = ['type', 'payTo', 'network', 'extensions', 'scheme', 'asset', 'maxAmount'];
const filterProperties = {
  catalogId: {type:'string', minLength:1, maxLength:64, pattern:'^[a-z0-9][a-z0-9-]{0,63}$',
    description:'Configured source ID from bazaar_catalogs. Retained through the original page and request.'},
  type: {type:'string', enum:['http','mcp'], description:'Exact advertised resource transport.'},
  payTo: {type:'string', minLength:1, maxLength:4096, description:'Exact recipient within the selected payment option.'},
  network: {type:'string', minLength:1, maxLength:4096, description:'Exact advertised payment network.'},
  extensions: {type:'string', minLength:1, maxLength:4096, description:'Extension key present on the original resource.'},
  scheme: {type:'string', minLength:1, maxLength:4096, description:'Exact advertised payment scheme.'},
  asset: {type:'string', minLength:1, maxLength:4096, description:'Exact payment asset; combined with other payment filters within one option.'},
  maxAmount: {type:'string', pattern:'^(0|[1-9][0-9]*)$', maxLength:128,
    description:'Maximum advertised atomic amount, compared exactly in each selected asset and network.'},
  limit: {type:'integer', minimum:1, maximum:100, default:25, description:'Requested provider page size.'},
};
const annotations = {readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:true};

export const BAZAAR_DISCOVERY_TOOLS = {
  bazaar_catalogs: {
    name:'bazaar_catalogs',
    description:'List the host-configured discovery catalogs and exact default source. Select a catalog ID for browsing or searching.',
    annotations,
    inputSchema:{type:'object', properties:{}, additionalProperties:false},
  },
  bazaar_search: {
    name:'bazaar_search',
    description:'Search the configured Bazaar. Return original-page context and exact continuation arguments. Inspect a returned handle before preparing a request.',
    annotations,
    inputSchema:{type:'object', properties:{
      query:{type:'string', minLength:1, maxLength:1024},
      cursor:{type:'string', minLength:1, maxLength:4096},
      ...filterProperties,
    }, required:['query'], additionalProperties:false},
  },
  bazaar_resources: {
    name:'bazaar_resources',
    description:'Browse the configured Bazaar by original offset and exact resource/payment filters. Return handles for the same describe and preview workflow.',
    annotations,
    inputSchema:{type:'object', properties:{
      offset:{type:'integer', minimum:0, maximum:1000000, default:0},
      ...filterProperties,
    }, additionalProperties:false},
  },
};

/** Return the complete request used by both native transport and client paging. */
export function normalizeDiscoveryArguments(mode, args = {}) {
  if (!['search','resources'].includes(mode)) fail('INVALID_PARAMS', 'Unknown discovery mode');
  if (!plain(args)) fail('INVALID_PARAMS', 'Discovery arguments must be an object');
  const allowed = new Set([...filters, 'catalogId', 'limit', ...(mode === 'search' ? ['query','cursor'] : ['offset'])]);
  if (Object.keys(args).some(key => !allowed.has(key))) fail('INVALID_PARAMS', 'Unknown discovery argument');
  const result = {limit:args.limit === undefined ? 25 : args.limit};
  if (!Number.isSafeInteger(result.limit) || result.limit < 1 || result.limit > 100)
    fail('INVALID_PARAMS', 'limit must be an integer from 1 to 100');
  if (mode === 'search') {
    if (!text(args.query, 1024) || !args.query.trim()) fail('INVALID_PARAMS', 'Search query required');
    result.query = args.query;
    if (args.cursor !== undefined) {
      if (!text(args.cursor)) fail('INVALID_PARAMS', 'Invalid cursor');
      result.cursor = args.cursor;
    }
  } else {
    result.offset = args.offset === undefined ? 0 : args.offset;
    if (!Number.isSafeInteger(result.offset) || result.offset < 0 || result.offset > 1000000)
      fail('INVALID_PARAMS', 'offset must be an integer from 0 to 1000000');
  }
  if (args.catalogId !== undefined) {
    if (typeof args.catalogId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(args.catalogId))
      fail('INVALID_PARAMS', 'Choose an original configured catalog ID');
    result.catalogId = args.catalogId;
  }
  for (const key of filters) {
    if (args[key] === undefined) continue;
    if (!text(args[key], key === 'maxAmount' ? 128 : 4096)) fail('INVALID_PARAMS', 'Invalid ' + key);
    if (key === 'type' && !['http','mcp'].includes(args[key])) fail('INVALID_PARAMS', 'Invalid type');
    if (key === 'maxAmount' && !atomic(args[key]))
      fail('INVALID_PARAMS', 'maxAmount requires nonnegative integer base units');
    result[key] = args[key];
  }
  return result;
}

export function discoveryRequestUrl(base, mode, args) {
  const url = new URL(base);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  url.pathname += 'discovery/' + mode;
  for (const [key, value] of Object.entries(args)) {
    // The cap and host catalog selection are local; preserve the native provider protocol.
    if (key !== 'maxAmount' && key !== 'catalogId') url.searchParams.set(key, String(value));
  }
  return url;
}

/** Compare all selected payment fields inside one original accepted option. */
export function eligibleDiscoveryOptions(row, args) {
  if (args.type !== undefined && row.extensions?.bazaar?.info?.input?.type !== args.type) return [];
  if (args.extensions !== undefined && (!plain(row.extensions) || !own(row.extensions, args.extensions))) return [];
  return row.accepts.filter(option => {
    if (!plain(option) || !['scheme','network','asset','amount','payTo'].every(key => text(option[key])) ||
        !atomic(option.amount)) return false;
    if (['payTo','network','scheme','asset'].some(key => args[key] !== undefined && option[key] !== args[key])) return false;
    return args.maxAmount === undefined || option.amount.length < args.maxAmount.length ||
      (option.amount.length === args.maxAmount.length && option.amount <= args.maxAmount);
  });
}

const pageIssue = (code, message) => ({continuation:null, continuationError:{code, message}});
const next = (mode, args, page) => ({
  continuation:{tool:'bazaar_' + mode, arguments:{...args, ...page}},
  continuationError:null,
});

/** Advance by the provider page, including rows excluded by local offer filters. */
export function discoveryContinuation(mode, args, body, received) {
  const pagination = body.pagination;
  if (pagination !== undefined && pagination !== null && !plain(pagination))
    return pageIssue('DISCOVERY_PAGINATION_INVALID', 'The provider returned invalid pagination metadata.');
  const page = pagination ?? {};
  if (mode === 'search') {
    const key = ['cursor','nextCursor','next_cursor'].find(name => own(page, name));
    const cursor = key === undefined ? null : page[key];
    if (cursor === null || cursor === undefined || cursor === '') {
      if (body.partialResults === true)
        return pageIssue('DISCOVERY_CONTINUATION_UNAVAILABLE', 'The provider reports partial results without a usable continuation cursor.');
      return {continuation:null, continuationError:null};
    }
    if (!text(cursor)) return pageIssue('DISCOVERY_CURSOR_INVALID', 'The provider returned an invalid continuation cursor.');
    if (cursor === args.cursor) return pageIssue('DISCOVERY_CURSOR_REPEATED', 'The provider returned the current cursor again.');
    return next(mode, args, {cursor});
  }
  if (own(page, 'offset') && (!Number.isSafeInteger(page.offset) || page.offset !== args.offset))
    return pageIssue('DISCOVERY_OFFSET_MISMATCH', 'The provider page does not match the requested offset.');
  if (own(page, 'total') && (!Number.isSafeInteger(page.total) || page.total < 0))
    return pageIssue('DISCOVERY_PAGINATION_INVALID', 'The provider returned an invalid total.');
  if (own(page, 'limit') && (!Number.isSafeInteger(page.limit) || page.limit < 0))
    return pageIssue('DISCOVERY_PAGINATION_INVALID', 'The provider returned an invalid page limit.');
  const offset = args.offset + received;
  const hasMore = Number.isSafeInteger(page.total) ? offset < page.total :
    received >= (page.limit > 0 ? page.limit : args.limit) || body.partialResults === true;
  if (!hasMore) return {continuation:null, continuationError:null};
  if (!received) return pageIssue('DISCOVERY_PAGE_EMPTY', 'The provider reports more resources but returned an empty page.');
  if (!Number.isSafeInteger(offset) || offset > 1000000)
    return pageIssue('DISCOVERY_OFFSET_LIMIT', 'The next provider offset exceeds the supported range.');
  return next(mode, args, {offset});
}
