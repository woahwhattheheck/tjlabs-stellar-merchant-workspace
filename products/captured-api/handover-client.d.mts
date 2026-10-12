import type { Buffer } from 'node:buffer';

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

/**
 * The original product URL, token and identity are pinned once per client.
 * Every accepted operation uses that same connection. Tokens are never returned.
 */
export interface CapturedHandoverClient {
  readonly info: CapturedHandoverInfo;

  /**
   * Read a relative native handover route, or POST its complete JSON body.
   * Input is captured before asynchronous work. Requests are limited to 1 MiB;
   * use the original archive methods for whole files.
   */
  json<T = unknown>(
    path: string,
    body?: unknown,
    options?: CapturedHandoverRequestOptions,
  ): Promise<T>;

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
