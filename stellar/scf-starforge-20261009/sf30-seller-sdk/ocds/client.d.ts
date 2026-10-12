import type { JsonValue, JsonObject, Source, Summary, DocumentKind, Diagnostic, Comparison } from './domain.js';

export type RequestOptions = { signal?: AbortSignal };
export type ClientOptions = {
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxResponseBytes?: number;
};
export type WorkspaceIdentity = {
  id: string; title: string; revision: number; createdAt: string; updatedAt: string;
};
export type SourceMetadata = Omit<Source, 'id'> & { id: string; sha256?: string; bytes?: number; entryCount?: number };
export type RetainedSource = SourceMetadata & { sha256: string; bytes: number; body: string; document: JsonValue };
export type EntryMetadata = {
  id: string; kind: DocumentKind; ocid: string; releaseId: string | null; date: string | null;
  tags: string[]; sourceId: string; sourcePointer: string; summary: Summary;
};
export type RetainedEntry = EntryMetadata & { document: JsonObject; source: RetainedSource };
export type ReviewDisposition = 'unreviewed' | 'reviewing' | 'pursue' | 'passed';
export type Review = {
  revision: number; disposition: ReviewDisposition; owner: string; nextAction: string;
  note: string; shortlisted: boolean; updatedAt: string | null;
};
export type ReviewUpdate = Partial<Omit<Review, 'revision' | 'updatedAt'>> & {
  /** Revision of this process review, as returned by projects[].review.revision. */
  expectedRevision: number;
};
export type Publication = { id: string; createdAt: string; operator: string; [key: string]: unknown };
export type Project = { ocid: string; summary: Summary; entries: EntryMetadata[]; review: Review };
export type WorkspaceView = {
  workspace: WorkspaceIdentity; sources: SourceMetadata[]; projects: Project[];
  diagnostics: Diagnostic[]; publications: Publication[]; receivings: JsonObject[]; captures: JsonObject[];
};
export type PortableSource = {
  id: string; sha256: string; bytes: number; body: string; metadata: SourceMetadata;
};
export type WorkspacePackage = {
  schema: 'starforge.ocds.workspace.v1';
  packageId: string; exportedAt: string; workspace: WorkspaceIdentity;
  sources: PortableSource[]; selection: { ocids: string[]; entryIds: string[] };
  reviews: (Review & { ocid: string })[];
  audit: JsonObject[]; publications: Publication[]; receivings: JsonObject[];
  captures?: JsonObject[];
};
export type CaptureSelection = { captureId: string } | {
  captureId?: never; kind: 'releases' | 'record'; ocid?: string; noticeId?: string;
  updatedFrom?: string; updatedTo?: string; stages?: string[]; limit?: number;
};
export type ReportOptions = RequestOptions & {
  format?: 'json' | 'csv' | 'html'; scope?: 'all' | 'shortlist'; ocids?: string[];
};
export type TextExport = { mime: string; filename: string | null; body: string; bytes: number };
export type DocumentComparison = Comparison & {
  before: RetainedEntry | EntryMetadata; after: RetainedEntry | EntryMetadata;
};
export declare class OcdsClientError extends Error {
  code: string; status: number | null; details: unknown;
  constructor(message: string, options?: { code?: string; status?: number | null; details?: unknown });
}
/** The same original HTTP routes used by the browser. Requests are never automatically retried. */
export declare class OcdsClient {
  baseUrl: string; fetch: typeof globalThis.fetch; headers: Record<string, string>;
  timeoutMs: number; maxResponseBytes: number;
  constructor(baseUrl: string | URL, options?: ClientOptions);
  request<T = unknown>(path: string, options?: RequestOptions & { method?: string; body?: unknown; raw?: false }): Promise<T>;
  request(path: string, options: RequestOptions & { method?: string; body?: unknown; raw: true }): Promise<TextExport>;
  workspace(options?: RequestOptions): Promise<WorkspaceView>;
  entry(id: string, options?: RequestOptions): Promise<RetainedEntry>;
  source(id: string, options?: RequestOptions): Promise<RetainedSource>;
  captureRecord(id: string, options?: RequestOptions): Promise<JsonObject>;
  receiving(packageId: string, options?: RequestOptions): Promise<JsonObject>;
  compare(before: string, after: string, options?: RequestOptions): Promise<DocumentComparison>;
  importDocument(document: JsonValue, options?: RequestOptions & {
    rawText?: string; label?: string; url?: string;
    /** Global workspace revision, as returned by workspace.revision. */
    expectedRevision?: number;
  }): Promise<WorkspaceView>;
  capture(selection: CaptureSelection, options?: RequestOptions): Promise<WorkspaceView & { capture?: JsonObject }>;
  updateReview(ocid: string, review: ReviewUpdate, options?: RequestOptions): Promise<WorkspaceView>;
  report(options?: ReportOptions): Promise<TextExport>;
  exportPackage(options?: RequestOptions): Promise<WorkspacePackage>;
  /** expectedRevision is the receiving workspace's global revision. */
  receivePackage(pkg: WorkspacePackage, expectedRevision: number, options?: RequestOptions): Promise<WorkspaceView>;
}
