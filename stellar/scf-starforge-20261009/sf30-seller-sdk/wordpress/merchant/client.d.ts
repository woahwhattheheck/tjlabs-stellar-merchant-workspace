/** MIT. Merchant protocol types from the original 25-tool / 33-action catalog. */
export type UUID = string;
export type SHA256 = string;
export type Alias = string;
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }
export interface WorkspaceSelection { workspace: Alias }
export interface ExportReference extends WorkspaceSelection { exportId: SHA256 }
export interface RequestOptions { requestSignal?: AbortSignal | null; timeoutMs?: number }
export interface ConnectionOptions {
  url: string;
  tokenEnv?: string;
  environment?: Record<string, string | undefined>;
  signal?: AbortSignal;
}
export interface MerchantCaller {
  endpoint: string;
  call<K extends WordPressToolName>(name: K | WordPressPrefixedToolName<K>, args: WordPressToolArguments[K], options?: RequestOptions): Promise<WordPressToolResults[K]>;
}
export type ConnectionSource =
  | (ConnectionOptions & { client?: never })
  | { client: MerchantCaller; url?: never; signal?: AbortSignal };
export type WordPressExportKind = 'native-response' | 'original-artifact' | 'publisher-artifact' | 'source-packet' | 'source-receiving';
export interface RetainedFileIdentity { name: string; bytes: number; sha256: SHA256; contentType: string }
export interface ManifestFileIdentity { name: 'wordpress-merchant-manifest.json'; bytes: number; sha256: SHA256 }
export interface WordPressExportManifest {
  schema: 'stellar-forge.wordpress-merchant-export.v1';
  exportId: SHA256;
  workspace: Alias;
  workspaceId: UUID;
  workspaceIdentity: SHA256;
  kind: WordPressExportKind;
  source: JsonObject;
  files: [RetainedFileIdentity];
}
export interface RetainedNativeValue<T extends JsonValue = JsonValue> {
  completeValue?: boolean;
  value?: T;
  preview?: JsonValue;
}
export interface CompleteWordPressResult<T extends JsonValue = JsonValue> extends RetainedNativeValue<T> {
  schema: 'stellar-forge.wordpress-merchant-result.v1';
  workspace: Alias;
  workspaceId: UUID;
  workspaceIdentity: SHA256;
  exportId: SHA256;
  kind: WordPressExportKind;
  source: JsonObject;
  manifestSha256: SHA256;
  manifestFile: ManifestFileIdentity;
  files: [RetainedFileIdentity];
  retention: { state: 'COMPLETE' };
}
export interface UnretainedWordPressResult<T extends JsonValue = JsonValue> extends RetainedNativeValue<T> {
  schema: 'stellar-forge.wordpress-merchant-result.v1';
  workspace: Alias;
  workspaceId: UUID;
  workspaceIdentity: SHA256;
  exportId: null;
  source: JsonObject;
  retention: { state: 'FAILED'; code: string; recovery: string };
}
export type RetainedWordPressResult<T extends JsonValue = JsonValue> = CompleteWordPressResult<T> | UnretainedWordPressResult<T>;
export interface OpenWordPressResult {
  state: 'OPEN'; ownership: 'OWNED' | 'BORROWED'; url: string;
  workspaceId: UUID; workspaceIdentity: SHA256; instanceId: UUID;
  revision: number; selectionSha256: SHA256;
  applicationId?: string; applicationOperationId?: string;
}
export interface ReleaseWordPressResult {
  state: 'RELEASED'; ownership: 'OWNED' | 'BORROWED'; originalWorkspaceClosed: boolean;
  workspaceId: UUID | null; workspaceIdentity: SHA256 | null;
}
export interface WordPressManifestResult {
  state: 'MANIFEST_RETAINED'; workspace: Alias; workspaceId: UUID; workspaceIdentity: SHA256; exportId: SHA256;
  manifest: WordPressExportManifest; manifestFile: ManifestFileIdentity;
}
export interface RetainedFileRange {
  exportId: SHA256; manifestSha256: SHA256; file: Pick<RetainedFileIdentity, 'name' | 'bytes' | 'sha256'> & { contentType?: string };
  offset: number; bytesRead: number; data: string; nextOffset: number | null; readId: UUID;
}
export interface RetainedJsonPage {
  workspace: Alias; workspaceId: UUID; workspaceIdentity: SHA256;
  exportId: SHA256; manifestSha256: SHA256; file: string; pointer: string;
  type: string; offset: number; total: number; nextOffset: number | null;
  value?: JsonValue; valueAvailableInOriginalFile?: boolean; message?: string;
}
/**
 * Allowed original native input keys. The original action schema validates
 * action-specific required fields and the nested source/payment/review values.
 */
type NativeFields<K extends string> = Partial<Record<K, JsonValue>>;
export interface WordPressActionInputs {
  'source.save': NativeFields<'source'>;
  'source.select': NativeFields<'sourceId'>;
  'source.discover': NativeFields<'sourceId'>;
  'capture.start': NativeFields<'sourceId' | 'discoveryId' | 'selection'>;
  'capture.resume': NativeFields<'sourceId' | 'captureId'>;
  'capture.pause': NativeFields<'sourceId' | 'captureId'>;
  'mapping.save': NativeFields<'sourceId' | 'captureId' | 'expectedCaptureSha256' | 'projection'>;
  'edition.build': NativeFields<'mappingId' | 'dataset' | 'review'>;
  'merchant.save': NativeFields<'editionId' | 'origin' | 'path' | 'payment' | 'reviewer' | 'note'>;
  'edition.export': NativeFields<'editionId' | 'merchantId' | 'productId' | 'productLabel' | 'reviewer' | 'note'>;
  'product.select': NativeFields<'productId'>;
  'source.packet': Record<string, never>;
  'source.files': NativeFields<'packetId' | 'merchantId' | 'productId' | 'productLabel' | 'name' | 'reviewer' | 'note'>;
  'publisher.status': NativeFields<'productId'>;
  /** Original workspace export UUID from state.exports[].id; not a merchant SHA-256 export. */
  'publisher.prepare': { productId?: UUID; exportId?: UUID };
  'publisher.preview': NativeFields<'productId' | 'target' | 'query'>;
  'publisher.reviewDraft': NativeFields<'productId' | 'draftId' | 'expectedSnapshot' | 'expectedRevision'>;
  'publisher.publish': NativeFields<'productId' | 'draftId' | 'expectedSnapshot' | 'expectedRevision'>;
  'publisher.activateSnapshot': NativeFields<'productId' | 'snapshot' | 'expectedSnapshot' | 'expectedRevision'>;
  'publisher.collect': NativeFields<'productId'>;
  'publisher.release.stage': NativeFields<'productId' | 'draftId' | 'id' | 'label' | 'runtime'>;
  'publisher.release.inspect': NativeFields<'productId' | 'id'>;
  'publisher.release.activate': NativeFields<'productId' | 'id' | 'expectedGeneration'>;
  'publisher.release.rollback': NativeFields<'productId' | 'expectedGeneration'>;
  'publisher.release.start': NativeFields<'productId' | 'expectedGeneration'>;
  'publisher.release.stop': NativeFields<'productId'>;
  'publisher.buyer.review': NativeFields<'productId' | 'snapshot' | 'query'>;
  'publisher.buyer.prepare': NativeFields<'productId' | 'review' | 'intentId' | 'acceptIndex' | 'offerSha256'>;
  'publisher.buyer.session': NativeFields<'productId' | 'buyerId' | 'buyerWorkspace' | 'maxPages' | 'maxTotalAtomic' | 'maxRows' | 'maxPageBytes'>;
  'publisher.buyer.run': NativeFields<'productId' | 'id' | 'retryUnpaid' | 'expectedAttemptSha256'>;
  'publisher.buyer.recover': NativeFields<'productId' | 'id'>;
  'publisher.buyer.account': NativeFields<'productId' | 'id'>;
  'publisher.buyer.export': NativeFields<'productId' | 'id'>;
}
export type WordPressActionName = keyof WordPressActionInputs;
export type WordPressActionRequest<A extends WordPressActionName = WordPressActionName> =
  A extends WordPressActionName ? WorkspaceSelection & {
    action: A; operationId: UUID; expectedRevision: number; input: WordPressActionInputs[A];
  } : never;
export interface WordPressToolArguments {
  'workspaces': Record<string, never>;
  'schema': Record<string, never>;
  'open': WorkspaceSelection;
  'release': WorkspaceSelection;
  'state': WorkspaceSelection;
  'operation': WorkspaceSelection & { operationId: UUID };
  'source': WorkspaceSelection & { id: UUID };
  'job': WorkspaceSelection & { sourceId: UUID; id: UUID };
  'records': WorkspaceSelection & { sourceId: UUID; id: UUID; offset?: number; limit?: number; collection?: string };
  'response': WorkspaceSelection & { sourceId: UUID; id: UUID; sequence: number };
  'mapping': WorkspaceSelection & { id: UUID };
  'edition': WorkspaceSelection & { id: UUID };
  'projection': WorkspaceSelection & { sourceId: UUID; id: UUID };
  'compare': WorkspaceSelection & { before: UUID; after: UUID; offset?: number; limit?: number };
  'preview': WorkspaceSelection & { sourceId: UUID; captureId: UUID; projection: JsonObject; offset?: number; limit?: number };
  'dataset_preview': WorkspaceSelection & { editionId: UUID; query?: string };
  'act': WordPressActionRequest;
  'cancel': WorkspaceSelection & { operationId: UUID };
  'artifact': WorkspaceSelection & { kind: 'source' | 'response' | 'edition' | 'export' | 'packet'; id: UUID; name?: string; sourceId?: UUID };
  'publisher_artifact': WorkspaceSelection & { productId: UUID; kind: 'draft-csv' | 'draft-review' | 'buyer-config' | 'session-manifest' | 'session-csv' | 'session-jsonl' | 'session-review'; id: UUID };
  'manifest': ExportReference;
  'file': ExportReference & { file: string; expectedManifestSha256: SHA256; expectedSha256: SHA256; offset?: number; limit?: number; readId?: UUID };
  'file_release': ExportReference & { readId: UUID };
  'json': ExportReference & { file: string; expectedManifestSha256: SHA256; pointer?: string; offset?: number; limit?: number };
  'receive': ExportReference & { expectedManifestSha256: SHA256; receiver: Alias };
}
export interface WordPressToolResults {
  'workspaces': JsonObject;
  'schema': JsonObject;
  'open': OpenWordPressResult;
  'release': ReleaseWordPressResult;
  'state': RetainedWordPressResult;
  'operation': RetainedWordPressResult;
  'source': RetainedWordPressResult;
  'job': RetainedWordPressResult;
  'records': RetainedWordPressResult;
  'response': RetainedWordPressResult;
  'mapping': RetainedWordPressResult;
  'edition': RetainedWordPressResult;
  'projection': RetainedWordPressResult;
  'compare': RetainedWordPressResult;
  'preview': RetainedWordPressResult;
  'dataset_preview': RetainedWordPressResult;
  'act': RetainedWordPressResult;
  'cancel': RetainedWordPressResult;
  'artifact': RetainedWordPressResult;
  'publisher_artifact': RetainedWordPressResult;
  'manifest': WordPressManifestResult;
  'file': RetainedFileRange;
  'file_release': JsonObject;
  'json': RetainedJsonPage;
  'receive': RetainedWordPressResult;
}
export type WordPressToolName = keyof WordPressToolArguments;
export type WordPressPrefixedToolName<K extends WordPressToolName = WordPressToolName> = `merchant_wordpress_${K}`;
export interface WordPressToolDefinition {
  readonly name: WordPressPrefixedToolName;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly annotations: { readOnlyHint: boolean; destructiveHint: false; idempotentHint: true; openWorldHint: boolean };
}
export const wordpressMerchantTools: readonly WordPressToolDefinition[];
export const wordpressTools: Readonly<Record<WordPressToolName, WordPressToolDefinition>>;
export const wordpressActionNames: readonly WordPressActionName[];
export const wordpressActionContract: Readonly<{ [A in WordPressActionName]: readonly (keyof WordPressActionInputs[A])[] }>;
export interface ExportSelectionOptions {
  workspace?: Alias;
  exportId?: SHA256;
  result?: RetainedWordPressResult;
  expectedManifestSha256?: SHA256;
  expectedWorkspaceId?: UUID;
  expectedWorkspaceIdentity?: SHA256;
  signal?: AbortSignal;
}
export interface DownloadSelection extends ExportSelectionOptions { directory: string; chunkSize?: number }
export interface ReadValueSelection extends ExportSelectionOptions { file?: string }
export interface ReceiveSelection extends ExportSelectionOptions { receiver: Alias }
export interface WordPressFileReceipt {
  schema: 'stellar-forge.wordpress-merchant-file-receipt.v1';
  state: 'COMPLETE' | 'REOPENED'; directory: string;
  workspace: Alias; workspaceId: UUID; workspaceIdentity: SHA256;
  exportId: SHA256; manifestSha256: SHA256; files: number; bytes: number;
  kind: WordPressExportKind; source: JsonObject;
}
export interface WordPressMerchantClient {
  readonly endpoint: string;
  call<K extends WordPressToolName>(name: K | WordPressPrefixedToolName<K>, args: WordPressToolArguments[K], options?: RequestOptions): Promise<WordPressToolResults[K]>;
  callValue<K extends WordPressToolName>(name: K | WordPressPrefixedToolName<K>, args: WordPressToolArguments[K], options?: RequestOptions): Promise<{ result: WordPressToolResults[K]; value: JsonValue | WordPressToolResults[K] }>;
  workspaces(args?: WordPressToolArguments['workspaces'], options?: RequestOptions): Promise<WordPressToolResults['workspaces']>;
  schema(args?: WordPressToolArguments['schema'], options?: RequestOptions): Promise<WordPressToolResults['schema']>;
  open(args: WordPressToolArguments['open'], options?: RequestOptions): Promise<WordPressToolResults['open']>;
  release(args: WordPressToolArguments['release'], options?: RequestOptions): Promise<WordPressToolResults['release']>;
  state(args: WordPressToolArguments['state'], options?: RequestOptions): Promise<WordPressToolResults['state']>;
  operation(args: WordPressToolArguments['operation'], options?: RequestOptions): Promise<WordPressToolResults['operation']>;
  source(args: WordPressToolArguments['source'], options?: RequestOptions): Promise<WordPressToolResults['source']>;
  job(args: WordPressToolArguments['job'], options?: RequestOptions): Promise<WordPressToolResults['job']>;
  records(args: WordPressToolArguments['records'], options?: RequestOptions): Promise<WordPressToolResults['records']>;
  response(args: WordPressToolArguments['response'], options?: RequestOptions): Promise<WordPressToolResults['response']>;
  mapping(args: WordPressToolArguments['mapping'], options?: RequestOptions): Promise<WordPressToolResults['mapping']>;
  edition(args: WordPressToolArguments['edition'], options?: RequestOptions): Promise<WordPressToolResults['edition']>;
  projection(args: WordPressToolArguments['projection'], options?: RequestOptions): Promise<WordPressToolResults['projection']>;
  compare(args: WordPressToolArguments['compare'], options?: RequestOptions): Promise<WordPressToolResults['compare']>;
  preview(args: WordPressToolArguments['preview'], options?: RequestOptions): Promise<WordPressToolResults['preview']>;
  datasetPreview(args: WordPressToolArguments['dataset_preview'], options?: RequestOptions): Promise<WordPressToolResults['dataset_preview']>;
  act<A extends WordPressActionName>(args: WordPressActionRequest<A>, options?: RequestOptions): Promise<RetainedWordPressResult>;
  cancel(args: WordPressToolArguments['cancel'], options?: RequestOptions): Promise<WordPressToolResults['cancel']>;
  artifact(args: WordPressToolArguments['artifact'], options?: RequestOptions): Promise<WordPressToolResults['artifact']>;
  publisherArtifact(args: WordPressToolArguments['publisher_artifact'], options?: RequestOptions): Promise<WordPressToolResults['publisher_artifact']>;
  manifest(args: WordPressToolArguments['manifest'], options?: RequestOptions): Promise<WordPressToolResults['manifest']>;
  file(args: WordPressToolArguments['file'], options?: RequestOptions): Promise<WordPressToolResults['file']>;
  fileRelease(args: WordPressToolArguments['file_release'], options?: RequestOptions): Promise<WordPressToolResults['file_release']>;
  json(args: WordPressToolArguments['json'], options?: RequestOptions): Promise<WordPressToolResults['json']>;
  receive(args: WordPressToolArguments['receive'], options?: RequestOptions): Promise<WordPressToolResults['receive']>;
  readValue(args: ReadValueSelection): Promise<JsonValue>;
  downloadExport(args: DownloadSelection): Promise<WordPressFileReceipt>;
  inspectExport(args: ExportSelectionOptions): Promise<{ manifest: WordPressExportManifest; manifestSha256: SHA256 }>;
  reopenExport(args: DownloadSelection): Promise<WordPressFileReceipt>;
  receiveSourcePacket(args: ReceiveSelection): Promise<RetainedWordPressResult>;
}
export function openWordPressMerchantClient(options: ConnectionOptions): Promise<WordPressMerchantClient>;
export function downloadWordPressExport(options: DownloadSelection & ConnectionSource): Promise<WordPressFileReceipt>;
export function inspectWordPressExport(options: ExportSelectionOptions & ConnectionSource): Promise<{ manifest: WordPressExportManifest; manifestSha256: SHA256 }>;
export function reopenWordPressExport(options: DownloadSelection): Promise<WordPressFileReceipt>;
export function readWordPressValue(options: ReadValueSelection & ConnectionSource): Promise<JsonValue>;
export function receiveWordPressSourcePacket(options: ReceiveSelection & ConnectionSource): Promise<RetainedWordPressResult>;
