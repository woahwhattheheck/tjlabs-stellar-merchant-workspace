// SPDX-License-Identifier: MIT
export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type NativeRecord = Record<string, unknown>;
export type DiscoveryMode = 'search' | 'resources';
export type ResourceType = 'http' | 'mcp';

/** Asset, recipient and network values are copied from original offered terms. */
export interface DiscoveryFilters {
  type?: ResourceType;
  payTo?: string;
  network?: string;
  extensions?: string;
  scheme?: string;
  asset?: string;
  /** Nonnegative integer in the selected asset's atomic units. */
  maxAmount?: string;
  /** 1 through 100; defaults to 25. */
  limit?: number;
}
export interface BrowseRequest extends DiscoveryFilters {
  /** Raw upstream row offset; defaults to 0. */
  offset?: number;
}
export interface SearchRequest extends DiscoveryFilters {
  /** Nonblank text, up to 1,024 characters. */
  query: string;
  cursor?: string;
}
export type NormalizedBrowseRequest = BrowseRequest & { offset: number; limit: number };
export type NormalizedSearchRequest = SearchRequest & { limit: number };
export type DiscoveryContinuation =
  | { tool: 'bazaar_resources'; arguments: NormalizedBrowseRequest }
  | { tool: 'bazaar_search'; arguments: NormalizedSearchRequest };

export interface PaymentOption extends NativeRecord {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
}
export interface ResourceSummary extends NativeRecord {
  handle: string;
  resource: NativeRecord & { url: string };
  resourceType: ResourceType;
  method: string | null;
  toolName: string | null;
  accepts: PaymentOption[];
  allowedOrigin: boolean;
}
export interface ContinuationError {
  code: string;
  message: string;
}
export interface DiscoveryPage {
  resources: ResourceSummary[];
  /** Original upstream flag; an exhausted iterator can still contain partial pages. */
  partialResults: boolean;
  /** Original upstream pagination object, with every supplied field retained. */
  pagination: NativeRecord | null;
  source: {
    url: string;
    observedAt: string;
    mode: DiscoveryMode;
    request: NormalizedBrowseRequest | NormalizedSearchRequest;
    /** Exact retained provider page, when supplied by this server. */
    pageSha256?: string;
    pageBytes?: number;
  };
  page: {
    received: number;
    returned: number;
    filtered: number;
    invalid: number;
    continuationError: ContinuationError | null;
  };
  continuation: DiscoveryContinuation | null;
}
export interface HttpQueryParameter {
  name: string;
  required: boolean;
  type: string | string[] | null;
  itemType: string | string[] | null;
  title: string | null;
  description: string | null;
  encoding: 'literal-or-repeated' | 'form-comma' | 'form-repeated';
  source: string;
}
/** Explicit raw strings are encoded once into their advertised URL segments. */
export type HttpPath = Record<string, string>;
export interface HttpPathParameter {
  name: string;
  required: boolean;
  type: string | string[] | null;
  title: string | null;
  description: string | null;
  source: string;
}
export interface HttpPathInput extends NativeRecord {
  /** Original published route template, or null for an exact resource URL. */
  routeTemplate: string | null;
  advertisedKeys: string[];
  /** Unbound path fields that the caller must explicitly supply. */
  requiredKeys: string[];
  /** Already concrete URL bindings retained by the original advertisement. */
  fixedValues: HttpPath;
  parameters: HttpPathParameter[];
  keysSource: string | null;
  valueType: 'string';
  maxKeys: number;
  maxKeyLength: number;
  maxValueLength: number;
  maxEncodedPathBytes: number;
}
export interface HttpPreviewInput extends NativeRecord {
  container: 'query';
  /** Present on path-aware servers; query metadata remains beside this descriptor. */
  path?: HttpPathInput;
  advertisedKeys: string[];
  keysSource: string | null;
  parameters: HttpQueryParameter[];
  querySerialization: NativeRecord | null;
  inputError: (ContinuationError & { details?: NativeRecord }) | null;
  requiredKeys: string[] | null;
  requiredKeysError: ContinuationError | null;
  valueType?: string;
  maxKeys?: number;
  maxKeyLength?: number;
  maxValueLength?: number;
  maxArrayItems?: number;
  maxEncodedQueryBytes?: number;
}
export interface McpPreviewInput extends NativeRecord {
  container: 'arguments';
  valueType: string;
  maxBytes: number;
  schemaSource: string;
  additionalContainers: false;
  validation: string;
}
export interface ResourceDescription extends NativeRecord {
  handle: string;
  resource: NativeRecord & { url: string };
  bazaar: NativeRecord;
  /** Complete eligible alternatives; these indexes are used unchanged by preview. */
  accepts: PaymentOption[];
  source: NativeRecord & {
    url: string;
    observedAt: string;
    resource: string | NativeRecord;
    /** Exact retained provider response identity, when available on this server. */
    pageSha256?: string;
    pageBytes?: number;
    /** Zero-based original provider row before buyer filtering, when retained by this server. */
    rowIndex?: number;
  };
  /** Milliseconds since the Unix epoch. */
  expiresAt: number;
  preview: NativeRecord & {
    allowedOrigin: boolean;
    resourceType: ResourceType;
    method: string | null;
    methodSupported: boolean;
    input: HttpPreviewInput | McpPreviewInput;
  };
}
export type HttpQueryScalar = string;
export type HttpQuery = Record<string, HttpQueryScalar | HttpQueryScalar[]>;
export interface PreviewRequest {
  handle: string;
  acceptIndex?: number;
  input: { query?: HttpQuery; path?: HttpPath } | { arguments: JsonObject };
}
export interface PreviewHttpRequest {
  handle: string;
  acceptIndex?: number;
  path?: HttpPath;
  /** Defaults to an empty explicit query. Original fixed URL pairs are retained. */
  query?: HttpQuery;
}
export interface PreparedQuote extends NativeRecord {
  quoteId: string;
  status: 'PREVIEWED';
  resource: string;
  requestUrl: string;
  method: string;
  selected: PaymentOption;
  acceptedTerms: PaymentOption;
  expiresAt: number;
  attempts: number;
  createdAt: number;
  signedRequestDispatched: boolean;
  invocation?: NativeRecord;
}
export interface CallOptions {
  signal?: AbortSignal;
  /** 1 through 300,000 milliseconds; defaults to 120,000. */
  timeoutMs?: number;
}
/** The maintained buyer transport returns structured data, throws original tool errors,
 * and honors requestSignal/timeoutMs for cancellation and close. */
export interface NativeClient {
  endpoint: string;
  call(
    tool: string,
    arguments_: NativeRecord,
    options?: { requestSignal?: AbortSignal; timeoutMs?: number },
  ): Promise<NativeRecord>;
}
export type DiscoveryClientOptions = {
  tokenEnv?: string;
  environment?: Record<string, string | undefined>;
  signal?: AbortSignal;
} & (
  | { url: string; client?: never }
  | { client: NativeClient; url?: never }
);
export interface BazaarDiscoveryClient {
  readonly endpoint: string;
  browse(request?: BrowseRequest, options?: CallOptions): Promise<DiscoveryPage>;
  search(request: SearchRequest, options?: CallOptions): Promise<DiscoveryPage>;
  /** Demand-driven pages preserve source coverage and partialResults. */
  browsePages(request?: BrowseRequest, options?: CallOptions): AsyncGenerator<DiscoveryPage, void, unknown>;
  /** Filter-preserving continuation; malformed or repeated pages raise an error. */
  searchPages(request: SearchRequest, options?: CallOptions): AsyncGenerator<DiscoveryPage, void, unknown>;
  describe(handle: string, options?: CallOptions): Promise<ResourceDescription>;
  preview(request: PreviewRequest, options?: CallOptions): Promise<PreparedQuote>;
  /** Prepare a concrete GET/HEAD request from the original advertised route and explicit inputs. */
  previewHttp(request: PreviewHttpRequest, options?: CallOptions): Promise<PreparedQuote>;
  previewHttpQuery(
    request: { handle: string; query: HttpQuery; acceptIndex?: number },
    options?: CallOptions,
  ): Promise<PreparedQuote>;
  previewMcpArguments(
    request: { handle: string; arguments: JsonObject; acceptIndex?: number },
    options?: CallOptions,
  ): Promise<PreparedQuote>;
  /** Abort owned pending requests and await them; a borrowed transport stays with its owner. */
  close(): Promise<void>;
}
/** Server continuation errors retain the already returned discovery page. */
export interface DiscoveryError extends Error {
  code?: string;
  page?: DiscoveryPage;
  details?: NativeRecord;
  recovery?: NativeRecord;
}
export declare function openBazaarDiscoveryClient(
  options: DiscoveryClientOptions,
): Promise<BazaarDiscoveryClient>;
