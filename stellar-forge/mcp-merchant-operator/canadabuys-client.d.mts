// MIT. The original CanadaBuys MCP tools with their native source and bidder types.
import type { Stream, SourceMetadata, SourceObservation, OriginalSource, SourceEdition, ReviewPatch,
  WorkshareInput, WorksharePatch, Workshare, WorkshareHistory, NoticeIndex, Notice, Profile, ProfileMatch } from
  '../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/domain.mjs';
import type { WorkspaceMetadata, CaptureRecord, Publication, Receiving } from
  '../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/workspace.mjs';
import type { BidderKind, BidderRecordMap, BidderInputMap, BidderPage, BidderFitResult, BidderAssessResult,
  DecisionSelection, BidderCompareResult } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/bidder-desk-workspace.mjs';
import type { DownloadOptions, DownloadResult, PublicationInspection } from './canadabuys-download.mjs';
export type { BidderKind, BidderRecordMap, BidderInputMap, DecisionSelection };
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface RequestOptions { signal?: AbortSignal; timeoutMs?: number }
export interface NativeMcpClient {
  endpoint: string;
  call(name: string, args: Record<string, unknown>, options?: { requestSignal?: AbortSignal | null; timeoutMs?: number }): Promise<Record<string, unknown>>;
}
export interface OpenOptions {
  client?: NativeMcpClient; workspace: string; workspaceId?: string; url?: string; tokenEnv?: string;
  environment?: Record<string, string | undefined>; signal?: AbortSignal; maximumResponseBytes?: number;
}
export interface WorkspaceSelection { workspace?: string }
export interface PageSelection { offset?: number; limit?: number }
export interface Page { offset: number; limit: number; total: number; nextOffset: number | null }
export interface NativePage<T> { items: T[]; page: Page }
export type Collection = 'notices' | 'sources' | 'sourceObservations' | 'workshares' | 'captures' | 'publications' | 'receivings';
export type Scope = 'all' | 'shortlist' | 'selected';
export type ExportFormat = 'json' | 'csv' | 'html' | 'package' | 'comparison' | 'document' | 'source' |
  'decision-json' | 'decision-csv' | 'decision-html' | 'evidence';
export interface ExportArguments extends WorkspaceSelection {
  expectedRevision: number; format: ExportFormat; scope?: Scope; noticeIds?: string[];
  sourceId?: string; entryId?: string; beforeId?: string; afterId?: string;
  decisionId?: string; evidenceId?: string; recordRevision?: number;
}
export interface FileDescriptor { file: string; mime: string; bytes: number; sha256: string; [key: string]: unknown }
export interface FileChunk {
  readId: string; file: { name: string; type: string; bytes: number; sha256: string; [key: string]: unknown };
  offset: number; bytesRead: number; nextOffset: number | null; encoding: 'base64'; data: string;
}
export interface FilePublication { workspace: string; publication: Publication; files: FileDescriptor[] }
export interface Status extends NativePage<NoticeIndex | SourceMetadata | SourceObservation | Workshare | CaptureRecord | Publication | Receiving> {
  workspace: string; native: WorkspaceMetadata; instanceId: string; browserUrl: string; collection: Collection;
  counts: Record<Collection, number>; seller: Record<string, unknown> | null; fileReads: Record<string, unknown>;
}
export interface BidderCreateArguments<K extends BidderKind = BidderKind> extends WorkspaceSelection {
  kind: K; record: BidderInputMap[K]; expectedRevision: number; commandId?: string; input?: string; expectedSha256?: string;
}
export interface BidderUpdateArguments<K extends BidderKind = BidderKind> extends WorkspaceSelection {
  kind: K; recordId: string; record: Partial<BidderInputMap[K]>; expectedRevision: number;
  commandId?: string; input?: string; expectedSha256?: string;
}
export interface BidderMutation<K extends BidderKind = BidderKind> {
  workspace: string; native: WorkspaceMetadata; record: BidderRecordMap[K]; alreadyApplied: boolean;
}
export interface EvidenceIntakeSelection {
  workspaceId: string; noticeId: string; commandId: string; expectedRevision: number; applyRevision?: number;
}
export interface EvidenceIntakeArguments extends WorkspaceSelection, EvidenceIntakeSelection {
  input: string; expectedSha256: string;
}
export interface EvidenceIntakeInspection {
  workspace: string; native: WorkspaceMetadata; input: string;
  file: { name: string; bytes: number; sha256: string };
  selection: EvidenceIntakeSelection;
  documents: Array<{ index: number; metadata: Record<string, unknown>; bytes: number; sha256: string }>;
  totalBytes: number; mutation: false;
}
export interface EvidenceIntakeResult {
  workspace: string; native: WorkspaceMetadata; schema: 'starforge.canadabuys.evidence-intake.v1';
  commandId: string; intakeSha256: string; noticeId: string;
  records: BidderRecordMap['evidence'][]; alreadyApplied: boolean;
}
export interface ToolArguments {
  workspaces: Record<string, never>;
  open: WorkspaceSelection;
  close: WorkspaceSelection & { instanceId: string };
  status: WorkspaceSelection & PageSelection & { collection?: Collection };
  notice: WorkspaceSelection & { noticeId: string };
  entries: WorkspaceSelection & PageSelection & { noticeId: string };
  entry: WorkspaceSelection & { entryId: string; includeDocument?: boolean };
  compare: WorkspaceSelection & PageSelection & { beforeId: string; afterId: string; includeValues?: boolean };
  source: WorkspaceSelection & { sourceId: string; includeBody?: boolean };
  inputs: WorkspaceSelection & { input?: string };
  import: WorkspaceSelection & { input: string; stream?: Stream; expectedSha256: string; expectedRevision: number };
  capture: WorkspaceSelection & { expectedRevision: number; stream?: Stream; captureId?: string; url?: string; label?: string };
  capture_record: WorkspaceSelection & { captureId: string };
  review: WorkspaceSelection & ReviewPatch & { noticeId: string };
  workshare: WorkspaceSelection & { workshareId: string };
  workshare_create: WorkspaceSelection & { expectedRevision: number; record: WorkshareInput };
  workshare_update: WorkspaceSelection & { workshareId: string; expectedRevision: number; record: Omit<WorksharePatch, 'expectedRevision'> };
  qualify: WorkspaceSelection & PageSelection & { profile: Profile };
  bidder_intake_inspect: WorkspaceSelection & { input: string; expectedSha256?: string };
  bidder_intake: EvidenceIntakeArguments;
  bidder_status: WorkspaceSelection;
  bidder_list: WorkspaceSelection & PageSelection & { kind: BidderKind; noticeId?: string };
  bidder_record: WorkspaceSelection & { kind: BidderKind; recordId: string; revision?: number; history?: boolean };
  bidder_create: BidderCreateArguments;
  bidder_update: BidderUpdateArguments;
  bidder_fit: WorkspaceSelection & PageSelection & { profileId: string; profileRevision?: number; noticeIds?: string[] };
  bidder_assess: WorkspaceSelection & DecisionSelection;
  bidder_compare: WorkspaceSelection & { recordId: string };
  receive: WorkspaceSelection & { input: string; expectedSha256: string; expectedRevision: number };
  receiving: WorkspaceSelection & { packageId: string };
  export: ExportArguments;
  files: WorkspaceSelection & { publicationId: string };
  file_read: WorkspaceSelection & { publicationId: string; file: string; expectedSha256: string; readId?: string; offset?: number; limit?: number };
  file_release: WorkspaceSelection & { readId: string };
  merchant_prepare: WorkspaceSelection & { expectedRevision: number; scope?: Scope; noticeIds?: string[]; name?: string };
  merchant_preview: WorkspaceSelection & { publicationId: string; query?: Record<string, string> };
  merchant_start: WorkspaceSelection & { publicationId: string };
  merchant_stop: WorkspaceSelection & { sellerInstanceId: string };
  delivery_adopt: WorkspaceSelection & { delivery: string; expectedRevision: number };
}
export interface ToolResults {
  workspaces: { configured: boolean; workspaces: Array<{ workspace: string; label: string; open: boolean; instanceId: string | null;
    inputAliases: string[]; deliveryAliases: string[]; [key: string]: unknown }>; [key: string]: unknown };
  open: Status;
  close: { workspace: string; instanceId: string; state: 'CLOSED' };
  status: Status;
  notice: { workspace: string; notice: Notice };
  entries: NativePage<Omit<SourceEdition, 'row'>> & { workspace: string; noticeId: string; review: Notice['review'] };
  entry: { workspace: string; entry: SourceEdition | Omit<SourceEdition, 'row'> };
  compare: NativePage<{ field: string; beforePresent: boolean; afterPresent: boolean; before?: unknown; after?: unknown }> &
    { workspace: string; before: Omit<SourceEdition, 'row'>; after: Omit<SourceEdition, 'row'>; sameNotice: boolean; counts: { changes: number } };
  source: { workspace: string; source: OriginalSource | Omit<OriginalSource, 'rawText'> };
  inputs: { workspace: string; inputs?: Array<{ input: string; label: string; url: string }>; deliveries?: string[];
    input?: string; label?: string; url?: string; file?: { name: string; bytes: number; sha256: string } };
  import: Status & { input: string; sha256: string };
  capture: Status & { capture?: CaptureRecord };
  capture_record: { workspace: string; capture: CaptureRecord };
  review: Status;
  workshare: { workspace: string; workshare: WorkshareHistory };
  workshare_create: Status & { workshare: Workshare };
  workshare_update: Status & { workshare: Workshare };
  qualify: NativePage<ProfileMatch> & { workspace: string; profile: Profile };
  bidder_intake_inspect: EvidenceIntakeInspection;
  bidder_intake: EvidenceIntakeResult;
  bidder_status: { workspace: string; native: WorkspaceMetadata; schema: string; counts: Record<BidderKind, number> };
  bidder_list: BidderPage<BidderKind> & { workspace: string };
  bidder_record: { workspace: string; record: BidderRecordMap[BidderKind] & { history?: BidderRecordMap[BidderKind][] } };
  bidder_create: BidderMutation;
  bidder_update: BidderMutation;
  bidder_fit: NativePage<BidderFitResult['results'][number]> & { workspace: string; profile: BidderFitResult['profile'] };
  bidder_assess: BidderAssessResult & { workspace: string };
  bidder_compare: BidderCompareResult & { workspace: string };
  receive: Status & { input: string; sha256: string };
  receiving: { workspace: string; receiving: Receiving };
  export: FilePublication;
  files: FilePublication;
  file_read: FileChunk;
  file_release: { workspace: string; readId: string; released: true };
  merchant_prepare: { workspace: string; publication: Publication; bundle: Record<string, unknown> };
  merchant_preview: { workspace: string; snapshot: Record<string, unknown>; result: Record<string, unknown> };
  merchant_start: { workspace: string; sellerInstanceId: string; publicationId: string; origin: string | null; snapshot: Record<string, unknown> };
  merchant_stop: { workspace: string; [key: string]: unknown };
  delivery_adopt: Status & { publication: Publication; replay: boolean };
}
export type ToolName = keyof ToolArguments;
export type FullToolName = `merchant_canadabuys_${ToolName}`;
export type SelectedTool = ToolName | FullToolName;
export type ShortTool<N extends SelectedTool> = N extends `merchant_canadabuys_${infer K}` ? K extends ToolName ? K : never : N extends ToolName ? N : never;
export type PagedTool = 'status' | 'entries' | 'compare' | 'qualify' | 'bidder_list' | 'bidder_fit';
export interface CompleteCollection<T = unknown> {
  workspace: string; workspaceId: string; revision: number; tool: FullToolName; complete: true; pages: unknown[]; items: T[];
}
export declare const CANADABUYS_MCP_CLIENT_SCHEMA: 'stellar-forge.canadabuys-mcp-client.v1';
export declare const CANADABUYS_TOOL_PREFIX: 'merchant_canadabuys_';
export declare const MAX_RETAINED_CHUNK_BYTES: number;
export declare function canadaBuysClientError(code: string, message: string, details?: unknown): Error & { code: string; details?: unknown };
export declare function canadaBuysToolName(value: string): FullToolName;
export declare function canadaBuysRequest<N extends SelectedTool>(tool: N, args?: ToolArguments[ShortTool<N>], workspace?: string):
  { name: FullToolName; arguments: ToolArguments[ShortTool<N>] & WorkspaceSelection };
export declare function canadaBuysTools(): Array<{ name: FullToolName; description: string; inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; idempotentHint: boolean; openWorldHint: boolean } }>;
export declare function canadaBuysReplayPolicy<N extends SelectedTool>(tool: N, args?: ToolArguments[ShortTool<N>]):
  { replayable: boolean; basis: string; commandId?: string; captureId?: string; inputSha256?: string };
export declare class CanadaBuysMerchantClient {
  constructor(options: { client: NativeMcpClient; workspace: string; workspaceId?: string });
  readonly endpoint: string; readonly workspace: string; readonly workspaceId: string | undefined;
  readonly closed: boolean; readonly activeFileReads: number;
  call<N extends SelectedTool>(tool: N, args: ToolArguments[ShortTool<N>], options?: RequestOptions): Promise<ToolResults[ShortTool<N>]>;
  workspaces(options?: RequestOptions): Promise<ToolResults['workspaces']>;
  open(options?: RequestOptions): Promise<Status>;
  status(args?: ToolArguments['status'], options?: RequestOptions): Promise<Status>;
  closeWorkspace(instanceId: string, options?: RequestOptions): Promise<ToolResults['close']>;
  notice(args: ToolArguments['notice'], options?: RequestOptions): Promise<ToolResults['notice']>;
  entries(args: ToolArguments['entries'], options?: RequestOptions): Promise<ToolResults['entries']>;
  entry(args: ToolArguments['entry'], options?: RequestOptions): Promise<ToolResults['entry']>;
  compare(args: ToolArguments['compare'], options?: RequestOptions): Promise<ToolResults['compare']>;
  source(args: ToolArguments['source'], options?: RequestOptions): Promise<ToolResults['source']>;
  inputs(args?: ToolArguments['inputs'], options?: RequestOptions): Promise<ToolResults['inputs']>;
  importSource(args: ToolArguments['import'], options?: RequestOptions): Promise<ToolResults['import']>;
  capture(args: ToolArguments['capture'], options?: RequestOptions): Promise<ToolResults['capture']>;
  captureRecord(args: ToolArguments['capture_record'], options?: RequestOptions): Promise<ToolResults['capture_record']>;
  review(args: ToolArguments['review'], options?: RequestOptions): Promise<Status>;
  workshare(args: ToolArguments['workshare'], options?: RequestOptions): Promise<ToolResults['workshare']>;
  createWorkshare(args: ToolArguments['workshare_create'], options?: RequestOptions): Promise<ToolResults['workshare_create']>;
  updateWorkshare(args: ToolArguments['workshare_update'], options?: RequestOptions): Promise<ToolResults['workshare_update']>;
  qualify(args: ToolArguments['qualify'], options?: RequestOptions): Promise<ToolResults['qualify']>;
  inspectEvidenceIntake(args: ToolArguments['bidder_intake_inspect'], options?: RequestOptions): Promise<EvidenceIntakeInspection>;
  intakeEvidence(args: EvidenceIntakeArguments, options?: RequestOptions): Promise<EvidenceIntakeResult>;
  bidderStatus(options?: RequestOptions): Promise<ToolResults['bidder_status']>;
  bidderList<K extends BidderKind>(args: Omit<ToolArguments['bidder_list'], 'kind'> & { kind: K }, options?: RequestOptions): Promise<BidderPage<K> & { workspace: string }>;
  bidderRecord<K extends BidderKind>(args: Omit<ToolArguments['bidder_record'], 'kind'> & { kind: K }, options?: RequestOptions): Promise<{ workspace: string; record: BidderRecordMap[K] & { history?: BidderRecordMap[K][] } }>;
  bidderCreate<K extends BidderKind>(args: BidderCreateArguments<K>, options?: RequestOptions): Promise<BidderMutation<K>>;
  bidderUpdate<K extends BidderKind>(args: BidderUpdateArguments<K>, options?: RequestOptions): Promise<BidderMutation<K>>;
  bidderFit(args: ToolArguments['bidder_fit'], options?: RequestOptions): Promise<ToolResults['bidder_fit']>;
  bidderAssess(args: ToolArguments['bidder_assess'], options?: RequestOptions): Promise<ToolResults['bidder_assess']>;
  bidderCompare(args: ToolArguments['bidder_compare'], options?: RequestOptions): Promise<ToolResults['bidder_compare']>;
  receive(args: ToolArguments['receive'], options?: RequestOptions): Promise<ToolResults['receive']>;
  receiving(args: ToolArguments['receiving'], options?: RequestOptions): Promise<ToolResults['receiving']>;
  export(args: ExportArguments, options?: RequestOptions): Promise<FilePublication>;
  files(args: ToolArguments['files'], options?: RequestOptions): Promise<FilePublication>;
  fileRead(args: ToolArguments['file_read'], options?: RequestOptions): Promise<FileChunk>;
  fileRelease(args: ToolArguments['file_release'], options?: RequestOptions): Promise<ToolResults['file_release']>;
  prepareMerchant(args: ToolArguments['merchant_prepare'], options?: RequestOptions): Promise<ToolResults['merchant_prepare']>;
  previewMerchant(args: ToolArguments['merchant_preview'], options?: RequestOptions): Promise<ToolResults['merchant_preview']>;
  startMerchant(args: ToolArguments['merchant_start'], options?: RequestOptions): Promise<ToolResults['merchant_start']>;
  stopMerchant(args: ToolArguments['merchant_stop'], options?: RequestOptions): Promise<ToolResults['merchant_stop']>;
  adoptDelivery(args: ToolArguments['delivery_adopt'], options?: RequestOptions): Promise<ToolResults['delivery_adopt']>;
  pages<K extends PagedTool>(tool: K | `merchant_canadabuys_${K}`, args?: ToolArguments[K], options?: RequestOptions): AsyncGenerator<ToolResults[K]>;
  collect<K extends PagedTool>(tool: K | `merchant_canadabuys_${K}`, args?: ToolArguments[K], options?: RequestOptions): Promise<CompleteCollection>;
  inspectPublication(publicationId: string, options?: RequestOptions): Promise<PublicationInspection>;
  downloadPublication(publicationId: string, directory: string, options?: Omit<DownloadOptions, 'client' | 'publicationId' | 'directory'>): Promise<DownloadResult>;
  /** Drains only this client's pending requests and original file leases. */
  disconnect(): Promise<void>;
}
export declare function openCanadaBuysMerchantClient(options: OpenOptions): Promise<CanadaBuysMerchantClient>;
