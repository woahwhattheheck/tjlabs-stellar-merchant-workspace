// MIT.
export interface VideoMcpOptions {
  directory?: string;
  getRequestFetch?: () => Promise<typeof globalThis.fetch>;
  baseUrl?: string;
  paymentHeader?: string;
  devBypass?: string;
  paymentContext?: { network?: string; maxPaymentUsd?: string };
  receivingFetch?: typeof globalThis.fetch;
  transport?: unknown;
  requestTimeoutMs?: number;
  maxVideoBytes?: number;
}
export interface VideoFileMetadata { path: string; bytes: number; sha256: string; contentType: string; }
export interface VideoVerifiedFile {
  _metadata(): VideoFileMetadata;
  verify(): Promise<unknown>;
  saveAs(destination: string): Promise<unknown>;
  bytes(options?: { limit?: number }): Promise<Uint8Array>;
  chunks(options?: { signal?: AbortSignal }): AsyncIterable<Uint8Array>;
}
export interface VideoOperation {
  schema: string;
  id: string;
  operationKey: string;
  model: 'seedance-2.5' | 'minimax-h3';
  createdAt: string;
  state: 'PREPARED' | 'CREATION_UNCERTAIN' | 'ACCEPTANCE_RETAINED' | 'PAYMENT_REQUIRED' | 'CREATION_HTTP_ERROR' | 'ACCEPTED' | 'RECEIVED';
  request: { bytes: number; sha256: string };
  creation: { dispatchedAt: string | null; httpStatus: number | null; completeResponse: boolean;
    responseBytes: number | null; responseSha256: string | null; lastError: string | null; recoveredAcceptance: boolean };
  receiving: Record<string, unknown> | null;
}
export interface VideoMcpWorkspace {
  readonly directory: string;
  create(input: { operationKey: string; model: 'seedance-2.5' | 'minimax-h3'; prompt: string; signal?: AbortSignal }): Promise<VideoOperation>;
  inspect(operationKey: string): Promise<VideoOperation>;
  status(operationKey: string, options?: { signal?: AbortSignal }): Promise<VideoOperation>;
  receive(operationKey: string, options?: { signal?: AbortSignal; deadlineMs?: number; output?: string }): Promise<{
    operation: VideoOperation; result: VideoFileMetadata; output: { path: string; bytes: number; sha256: string } | null }>;
  result(operationKey: string): Promise<VideoVerifiedFile>;
  recoverAcceptance(input: { operationKey: string; acceptanceFile: string; sourceReference: string }): Promise<VideoOperation>;
  exportWorkspace(operationKey: string, destination: string): Promise<Record<string, unknown>>;
  openExport(directory: string): Promise<{ directory: string; workspaceDirectory: string; operationKey: string | null;
    receiving: Record<string, unknown>; result: VideoFileMetadata | null }>;
  workspacePath(operationKey: string): Promise<string>;
  list(options?: { cursor?: string; limit?: number }): Promise<{
    schema: string; entries: Array<VideoOperation | { id: string; state: 'READ_ERROR'; error: string }>;
    nextCursor: string | null; complete: boolean }>;
}
export class VideoMcpError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  constructor(code: string, details?: Record<string, unknown>);
  toJSON(): Record<string, unknown>;
}
export function openX402VideoMcpWorkspace(options?: VideoMcpOptions): Promise<VideoMcpWorkspace>;
