/** Complete local working files. These APIs never submit native actions. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface IntakePortfolioIdentity { id: string; revision: number; snapshot: string }
export interface IntakeSource { sha256: string; bytes: number; filename: string }
export interface IntakeRowDecision {
  rowIndex: number;
  disposition: "pending" | "accepted" | "exception" | "non_application";
  reason: string;
  applicationId: string;
  corrections: Record<string,string>;
  correctionDrafts?: Record<string,string>;
  [key: string]: unknown;
}
export interface IntakeWork {
  stage: "file" | "mapping" | "rows" | "identities" | "session" | "review";
  filename: string; roundId: string; actor: string; status: string;
  mapping: Record<string,unknown>; identities: Record<string,unknown>;
  operationId: string; documentId: string; sessionId: string; reviewId: string; reviewDocumentId: string;
  batchDocumentIds: string[];
  rowDecisions: IntakeRowDecision[] | null;
  plan: Record<string,unknown> | null; session: Record<string,unknown> | null;
  batch: Record<string,unknown> | null; rowReview: Record<string,unknown> | null;
  rowFilter: string; rowSearch: string; rowOffset: number;
  continuation?: Record<string,unknown> | null; continuationDocumentId?: string | null;
  continuationWorking?: IntakeWork | null;
  editorRow?: number | null; editorColumnOffset?: number; batchRowsLiteral?: string;
  [key: string]: unknown;
}
export interface IntakeCheckpoint { id: string; label: string; createdAt: string; work: IntakeWork }
export interface IntakeRecord {
  schema: "stellar-forge.awards-intake-working-record.v1";
  id: string; label: string; workspaceId: string; portfolio: IntakePortfolioIdentity;
  source: IntakeSource; createdAt: string; updatedAt: string; revision: number;
  work: IntakeWork; checkpoints: IntakeCheckpoint[];
  importedRecord?: IntakeRecord;
  origin?: { id: string; label: string; revision: number; workspaceId: string };
  [key: string]: unknown;
}
export interface IntakeSummary {
  id: string; label: string; workspaceId: string; portfolio: IntakePortfolioIdentity;
  source: IntakeSource; updatedAt: string; revision: number; stage: IntakeWork["stage"]; checkpoints: number;
}
export interface IntakeLibrary {
  list(workspaceId: string, portfolioId: string): Promise<IntakeSummary[]>;
  get(id: string): Promise<IntakeRecord | null>;
  source(sha256: string): Promise<Uint8Array>;
  put(record: IntakeRecord, options?: {expectedRevision?: number | null; csv?: Uint8Array}): Promise<IntakeRecord>;
}
export const WORKING_SCHEMA: "stellar-forge.awards-intake-working-file.v1";
export function validateIntakeWork(value: unknown): IntakeWork;
export function verifyIntakeSource(source: IntakeSource, bytes: Uint8Array): Uint8Array;
export function createIntakeRecord(input: {
  id: string; label: string; workspaceId: string; portfolio: IntakePortfolioIdentity;
  source: IntakeSource; work: IntakeWork; now?: string;
}): IntakeRecord;
export function validateIntakeRecord(value: unknown): IntakeRecord;
export function updateIntakeRecord(record: IntakeRecord, work: IntakeWork, options?: {
  label?: string; checkpointId?: string; checkpointLabel?: string; now?: string;
}): IntakeRecord;
export function encodeIntakeWorkingFile(record: IntakeRecord, csv: Uint8Array): Uint8Array;
export function parseIntakeWorkingFile(bytes: Uint8Array): {record: IntakeRecord; csv: Uint8Array; sha256: string};
export function compareIntakeContext(record: IntakeRecord, context: {
  workspaceId: string; portfolio: IntakePortfolioIdentity;
}): {sameWorkspace: boolean; samePortfolio: boolean; sameBasis: boolean; canRestore: boolean; message: string};
export function createIntakeLibrary(options?: {indexedDB?: IDBFactory; name?: string}): IntakeLibrary;
