// SPDX-License-Identifier: MIT
import type {
  BazaarDiscoveryClient, CallOptions, DiscoveryClientOptions, DiscoveryPage,
  HttpQuery, NativeRecord, PaymentOption,
} from './discovery-client.mjs';
import type { Buffer } from 'node:buffer';

export type NativeIntentState =
  | 'QUEUED' | 'RUNNING_OR_INTERRUPTED' | 'ATTEMPT_RECORDED' | 'RECOVERED' | 'CANCELLED';
export type NativeRequestAction =
  | 'request-workspace' | 'request-prepare' | 'request-review'
  | 'execute' | 'status' | 'history' | 'recover' | 'cancel' | 'read';
export interface NativeWorkspaceDescription {
  schema: 'stellar-forge.mcp-native-request-workspace.v1';
  available: true;
  route: {
    origin: string;
    pathname: string;
    method: string;
    contentType: string | null;
  };
  payment: {
    scheme: string;
    network: string;
    asset: string;
    payTo: string;
    maxAtomic: string;
  };
  limits: {
    bodyBytes: number;
    toolRequestBytes: number;
    sourcePageBytes: number;
    preparedConfigBytes: number;
    /** The original operator's configured maximum saved response size. */
    responseBytes: number;
  };
  actions: NativeRequestAction[];
}
export interface NativeExpectedPayment extends NativeRecord {
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  maxAtomic: string;
}
export interface NativeIntent extends NativeRecord {
  schema: 'stellar-forge.mcp-native-buyer.v1';
  intentId: string;
  state: NativeIntentState;
  /** Original ISO timestamp from the durable inbox. */
  createdAt: string;
  request: {
    url: string;
    method: string;
    expected: NativeExpectedPayment;
    bodySha256: string | null;
    bodyBytes: number;
  };
  attempt: {
    id: string;
    kind: string;
    startedAt: string;
  } | null;
  originalBuyer: NativeRecord | null;
  originalRecovery: NativeRecord | null;
  lastError: unknown;
  retry: 'NO_AUTOMATIC_RETRY';
  /** Original child status, when execution returned one. */
  execution?: 'OPERATOR_BUSY' | NativeRecord;
}
export interface PrepareNativeRequest {
  /** Stable 1–128 character ID: letters, digits, period, underscore, colon or hyphen. */
  intentId: string;
  /** Handle returned by the same endpoint's complete browse/search workflow. */
  handle: string;
  /** Index in the handle's eligible accepts array; the server preserves the original page index. */
  acceptIndex?: number;
  /** Positive integer in the selected asset's atomic units, within operator limits. */
  maxAtomic: string;
  input: {
    /** Explicit strings or string arrays under the advertised HTTP query schema. */
    query?: HttpQuery;
    /** Exact UTF-8 request text for the configured body-bearing route. */
    body?: string;
  };
}
export interface NativePreparation {
  /** The current complete discovery source, or the original legacy source URL. */
  source: DiscoveryPage['source'] | string | NativeRecord;
  pageSha256: string;
  rowIndex: number;
  /** Original upstream listing's payment alternative index. */
  acceptIndex: number;
  originalListing: NativeRecord;
  accepted: PaymentOption;
  body: {
    text: string;
    bytes: number;
    sha256: string;
    contentType: string | null;
  } | null;
}
export interface PreparedNativeIntent extends NativeIntent {
  preparation: NativePreparation;
  /** Actions currently offered by the original native workspace. */
  availableActions: NativeRequestAction[];
}
export interface NativeHistoryRequest {
  limit?: number;
  /** Original 64-character hexadecimal queue cursor. */
  cursor?: string;
}
export interface NativeHistoryPage {
  schema: 'stellar-forge.mcp-native-buyer.v1';
  total: number;
  records: NativeIntent[];
  nextCursor: string | null;
}
export interface NativeReadRequest {
  intentId: string;
  byteOffset?: number;
  /** 1 through 65,536; defaults to 32,768. */
  maxBytes?: number;
}
export interface NativeResultRange {
  schema: 'stellar-forge.mcp-native-buyer.v1';
  intentId: string;
  state: NativeIntentState;
  result: {
    contentType: string | null;
    bytes: number;
    sha256: string;
    byteOffset: number;
    returnedBytes: number;
    encoding: 'base64';
    data: string;
    /** Present only when this single range contains the complete valid UTF-8 file. */
    text?: string;
    nextByteOffset: number | null;
    verifiedSavedFile: true;
  };
  retry: 'NO_AUTOMATIC_RETRY';
}
export interface NativeResultChunk extends NativeResultRange {
  /** Canonically decoded bytes for this range; whole digest checked before the final yield. */
  bytes: Buffer;
}
export interface NativeResultRequest {
  intentId: string;
  /** 1 through 65,536; defaults to 65,536. */
  chunkSize?: number;
  /** Optional local limit. Defaults to the actual operator's responseBytes. */
  maxResultBytes?: number;
}
export interface NativeDownloadRequest extends NativeResultRequest {
  /** New absolute filename. Parent directory must already exist. */
  destination: string;
}
export interface SavedNativeResult {
  status: 'SAVED';
  intentId: string;
  state: NativeIntentState;
  destination: string;
  bytes: number;
  sha256: string;
  contentType: string | null;
  verifiedSavedFile: true;
}
export type NativeRequestClientOptions = DiscoveryClientOptions;
export interface NativeRequestClient {
  readonly endpoint: string;
  /** Uses this same connection, full cursor/offset discovery and schema inspection. */
  readonly discovery: BazaarDiscoveryClient;
  workspace(options?: CallOptions): Promise<NativeWorkspaceDescription>;
  /** Retain the selected catalog offer and enqueue the original SF88 request. */
  prepare(request: PrepareNativeRequest, options?: CallOptions): Promise<PreparedNativeIntent>;
  /** Reopen retained source, exact body, original offer and currently available actions. */
  review(intentId: string, options?: CallOptions): Promise<PreparedNativeIntent>;
  /** Explicitly invoke the original operator's terminal approval, signer and queue. */
  execute(intentId: string, options?: CallOptions): Promise<NativeIntent>;
  status(intentId: string, options?: CallOptions): Promise<NativeIntent>;
  history(request?: NativeHistoryRequest, options?: CallOptions): Promise<NativeHistoryPage>;
  historyPages(request?: NativeHistoryRequest, options?: CallOptions): AsyncGenerator<NativeHistoryPage, void, unknown>;
  /** Reconcile this original attempt with the existing recovery module. */
  recover(intentId: string, options?: CallOptions): Promise<NativeIntent>;
  cancel(intentId: string, options?: CallOptions): Promise<NativeIntent>;
  read(request: NativeReadRequest, options?: CallOptions): Promise<NativeResultRange>;
  /** Ordered complete ranges with stable identity and an incremental whole-file SHA-256. */
  resultChunks(request: NativeResultRequest, options?: CallOptions): AsyncGenerator<NativeResultChunk, void, unknown>;
  /** Write mode 0600 temporary bytes, validate the complete digest, then publish exclusively. */
  downloadResult(request: NativeDownloadRequest, options?: CallOptions): Promise<SavedNativeResult>;
  /** Abort this client's calls/downloads and await cleanup. Borrowed transport ownership is retained. */
  close(): Promise<void>;
}
export interface NativeRequestError extends Error {
  code?: string;
  details?: NativeRecord;
  recovery?: NativeRecord;
  /** Original mutation intent retained on an uncertain/error response. */
  nativeRequest?: {
    action: 'request-prepare' | 'execute' | 'recover' | 'cancel';
    intentId: string;
    inspect: {
      tool: 'sf43_discover_review_and_pay';
      arguments: { action: 'status'; intentId: string };
    };
  };
}
export declare function openNativeRequestClient(
  options: NativeRequestClientOptions,
): Promise<NativeRequestClient>;
