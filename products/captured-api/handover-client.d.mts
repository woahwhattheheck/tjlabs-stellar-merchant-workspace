import type { Buffer } from 'node:buffer';
import type { CapturedDraftForm, CapturedDraftKind, CapturedDraftResolutions, CapturedDraftMergeReview } from './draft-reconciliation.mjs';

/** The existing parsed HAR connection definition; all other native fields remain owned by its parser. */
export type CapturedHandoverWorkspaceDefinition = {
  projectsDirectory: string;
  label?: string;
  [field: string]: unknown;
} & (
  | { consoleUrlEnv: string; consoleUrlFile?: never }
  | { consoleUrlFile: string; consoleUrlEnv?: never }
);

export interface CapturedHandoverClientOptions {
  /** Copied before resolving the original private console URL. Defaults to process.env. */
  environment?: Readonly<Record<string, string | undefined>>;
  /** The original product identity returned by its native info route. */
  expectedProductId?: string;
}

export interface CapturedHandoverRequestOptions {
  signal?: AbortSignal;
  /** Per native HTTP request. Omit to use the original Sf61 timeout. */
  timeoutMs?: number;
}

export interface CapturedHandoverProductIdentity {
  productId: string;
  product: string;
  directory: string;
  projectsDirectory: string;
}

export interface CapturedHandoverInfo extends Readonly<CapturedHandoverProductIdentity> {
  readonly schema: 'stellar-forge.captured-handover-browser.v1';
  /** Opening a new client requires an OPEN original product. */
  readonly state: 'OPEN';
  /** Snapshot at opening; use the native info route to observe later activity. */
  readonly activeJobs: readonly string[];
}

/** One exact, completed native PUBLISH operation and its whole compressed archive. */
export interface CapturedHandoverArchiveSelection {
  id: string;
  expectedSha256: string;
  expectedBytes: number;
}

export interface CapturedHandoverArchive {
  readonly id: string;
  readonly handoverId: string;
  readonly manifestSha256: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly name: string;
}

export interface CapturedHandoverRangeSelection extends CapturedHandoverArchiveSelection {
  offset: number;
  /** 1–1,048,576 bytes. The final range is shortened at the exact file end. */
  limit: number;
}

export interface CapturedHandoverPendingChunk {
  offset: number;
  bytes: number;
  sha256: string;
}

export interface CapturedHandoverUploadProgress {
  id: string;
  name: string;
  totalBytes: number;
  receivedBytes: number;
  chunkBytes: 1048576;
  state: 'UPLOADING' | 'READY_TO_FINISH';
  pendingChunk?: CapturedHandoverPendingChunk;
}

export interface CapturedHandoverCompleteUpload {
  id: string;
  name: string;
  totalBytes: number;
  receivedBytes: number;
  chunkBytes: 1048576;
  state: 'COMPLETE';
  path: string;
  sha256: string;
}

export type CapturedHandoverUpload = CapturedHandoverUploadProgress | CapturedHandoverCompleteUpload;

export interface CapturedHandoverArchiveSource extends CapturedHandoverProductIdentity {
  archive: CapturedHandoverArchive;
}

export interface CapturedHandoverUploadDestination extends CapturedHandoverProductIdentity {
  upload: CapturedHandoverCompleteUpload;
}

export interface CapturedHandoverTransferSelection extends CapturedHandoverArchiveSelection {
  /** Retain this original UUID when repeating an interrupted transfer. */
  uploadId: string;
}

export interface CapturedHandoverTransferResult {
  source: CapturedHandoverArchiveSource;
  destination: CapturedHandoverUploadDestination;
}

export interface CapturedHandoverLocalUploadSelection {
  /** Absolute path to the original complete archive. */
  path: string;
  expectedSha256: string;
  expectedBytes: number;
  uploadId: string;
}

export interface CapturedHandoverLocalFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface CapturedHandoverLocalUploadResult {
  source: CapturedHandoverLocalFile;
  destination: CapturedHandoverUploadDestination;
}

export interface CapturedHandoverDownloadSelection extends CapturedHandoverArchiveSelection {
  /** Existing private uploads parent; the native writer retains the file under its UUID child. */
  directory: string;
  /** Defaults to the original PUBLISH UUID. Reuse it to continue the same local payload. */
  downloadId?: string;
}

export interface CapturedHandoverDownloadResult {
  source: CapturedHandoverArchiveSource;
  download: CapturedHandoverCompleteUpload;
}


export interface CapturedDraftMergeInput {
  id:string;baseRevision:string;working:CapturedDraftForm;resolutions?:CapturedDraftResolutions;
  expectedCurrentRevision?:string;
}
export interface CapturedDraftMergeSaveInput {
  id:string;requestId:string;baseRevision:string;expectedRevision:string;
  working:CapturedDraftForm;resolutions?:CapturedDraftResolutions;reviewSha256:string;
}
export interface CapturedWorkingEditInput {id:string;baseRevision:string;working:CapturedDraftForm}
export interface CapturedWorkingImportInput {content:string;expectedSha256?:string}
export interface CapturedDraftNativeReview {
  schema:'stellar-forge.captured-draft-review.v1';productId:string;id:string;kind:CapturedDraftKind;
  baseRevision:string;currentRevision:string;baseSequence:number;currentSequence:number;
  base:CapturedDraftForm;current:CapturedDraftForm;working:CapturedDraftForm;
  resolutions:CapturedDraftResolutions;merge:CapturedDraftMergeReview;reviewSha256:string;
}
export interface CapturedDraftEdition {
  schema:'stellar-forge.captured-handover-draft-edition.v1';draftId:string;requestId:string;
  kind:CapturedDraftKind;sequence:number;previousRevision:string|null;createdAt:string;
  form:CapturedDraftForm;revision:string;
  reconciliation?:{schema:'stellar-forge.captured-draft-save.v1';baseRevision:string;reviewSha256:string;requestSha256:string};
}
export interface CapturedDraftNative {
  id:string;kind:CapturedDraftKind;label:string;createdAt:string;revision:string;currentRevision:string;
  edition:CapturedDraftEdition;history:Array<Omit<CapturedDraftEdition,'form'>>;
}
export interface CapturedWorkingExport {
  schema:'stellar-forge.captured-working-export.v1';productId:string;id:string;baseRevision:string;
  name:string;bytes:number;sha256:string;content:string;
}
export interface CapturedWorkingImport {
  schema:'stellar-forge.captured-working-import.v1';productId:string;id:string;kind:CapturedDraftKind;
  baseRevision:string;bytes:number;sha256:string;working:CapturedDraftForm;draft:CapturedDraftNative;
}

/**
 * The original product URL, token and identity are pinned once per client.
 * Every accepted operation uses that same connection. Tokens are never returned.
 */
export interface CapturedHandoverClient {
  readonly info: CapturedHandoverInfo;

  /**
   * Read a relative native handover route, or POST its complete JSON body.
   * Input is captured before asynchronous work. Ordinary requests are limited
   * to 1 MiB; collaboration requests use 4 MiB and working-import uses an 8 MiB
   * JSON wrapper for the complete 4 MiB edit file. Whole archives stream below.
   */
  json<T = unknown>(
    path: string,
    body?: unknown,
    options?: CapturedHandoverRequestOptions,
  ): Promise<T>;

  /** Read exact original base/current editions and reconcile the complete working form. */
  reviewDraftMerge(input:CapturedDraftMergeInput,options?:CapturedHandoverRequestOptions):Promise<CapturedDraftNativeReview>;
  /** Repeat the original request ID to reopen its first saved edition after later edits. */
  saveDraftMerge(input:CapturedDraftMergeSaveInput,options?:CapturedHandoverRequestOptions):Promise<CapturedDraftNative>;
  /** Export the complete original working-edit JSON bytes, source identity and saved base. */
  exportWorkingEdit(input:CapturedWorkingEditInput,options?:CapturedHandoverRequestOptions):Promise<CapturedWorkingExport>;
  /** Verify exact file bytes and their native product/draft/base without replacing the working editor. */
  importWorkingEdit(input:CapturedWorkingImportInput,options?:CapturedHandoverRequestOptions):Promise<CapturedWorkingImport>;

  /** Reopen the exact COMPLETE PUBLISH result and verify its native archive identity. */
  archive(
    selection: CapturedHandoverArchiveSelection,
    options?: CapturedHandoverRequestOptions,
  ): Promise<CapturedHandoverArchive>;

  /** Read one verified native HTTP Range without buffering the whole archive. */
  readArchive(
    selection: CapturedHandoverRangeSelection,
    options?: CapturedHandoverRequestOptions,
  ): Promise<Buffer>;

  /**
   * Stream to the selected original receiving product through its native upload writer.
   * Repeats reconcile the retained pending chunk and continue the same payload inode.
   * Both clients admit and drain the whole transfer as one accepted operation.
   */
  transferTo(
    target: CapturedHandoverClient,
    selection: CapturedHandoverTransferSelection,
    options?: CapturedHandoverRequestOptions,
  ): Promise<CapturedHandoverTransferResult>;

  /**
   * Verify and hold the complete local source before initializing its native upload.
   * Its hash-derived receiving filename permits an unchanged source to be relocated.
   */
  uploadFile(
    selection: CapturedHandoverLocalUploadSelection,
    options?: CapturedHandoverRequestOptions,
  ): Promise<CapturedHandoverLocalUploadResult>;

  /** Retain a complete local download through the same original resumable upload engine. */
  downloadFile(
    selection: CapturedHandoverDownloadSelection,
    options?: CapturedHandoverRequestOptions,
  ): Promise<CapturedHandoverDownloadResult>;

  /**
   * Stop new admission and drain accepted work. This never closes the original host.
   * If an owned local file close fails, retain this client and retry this same method.
   */
  close(): Promise<void>;
}

/** Open the already configured original product through its native Sf61 connection. */
export function openCapturedHandoverClient(
  definition: CapturedHandoverWorkspaceDefinition,
  options?: CapturedHandoverClientOptions,
): Promise<CapturedHandoverClient>;
