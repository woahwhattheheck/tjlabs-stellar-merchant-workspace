import type { CommandCatalog } from '../../../distribution/discovery/catalog.mjs';
import type { OperatingPlan } from '../../../distribution/discovery/operating-plan.mjs';
import type { DocumentEvidencePlan, DocumentEvidenceRow, DocumentObservation,
  DocumentEvidenceComparison, DocumentEvidenceCorrectionDraft } from '../document_evidence_client.mjs';
export const IATI_OPERATING_SOURCE_SCHEMA: 'stellar-forge.iati-document-operating-source.v1';
export const IATI_OPERATING_PROCEDURE_SCHEMA: 'stellar-forge.iati-document-operating-procedure.v1';
export interface DocumentOperatingSource {
  schema: typeof IATI_OPERATING_SOURCE_SCHEMA;
  capturedAt: string; workspaceSha256: string;
  plan: DocumentEvidencePlan; history: DocumentEvidencePlan[];
  organisation: Record<string, unknown> & { id: string; revision: number; recordSha256: string };
  rows: DocumentEvidenceRow[]; snapshotSha256: string;
  observations: DocumentObservation[]; comparisons: DocumentEvidenceComparison[];
  correction: DocumentEvidenceCorrectionDraft;
}
export interface DocumentOperatingOptions {
  id: string; savedAt?: string; title?: string; customer?: string; purpose?: string;
  period?: string; owner?: string; receiving?: string;
  /** Path to the existing private file; its contents stay outside the package. */
  connectionFile?: string;
  /** New output path for the original complete workspace export. */
  packetFile?: string;
}
export interface DocumentOperatingProcedure {
  schema: typeof IATI_OPERATING_PROCEDURE_SCHEMA;
  createdAt: string; source: DocumentOperatingSource; catalog: CommandCatalog; plan: OperatingPlan;
}
export interface DocumentOperatingSummary {
  id: string; revision: number; recordSha256: string; name: string; state: string;
  documents: number; observations: number; completeDocuments: number;
  decisions: Record<'usable' | 'needs_correction' | 'not_applicable' | 'deferred' | 'unreviewed', number>;
  sourceRevisions: number; comparisons: number; proposedCorrections: number;
}
export function inspectDocumentOperatingSource(input: unknown): DocumentOperatingSource;
export function summarizeDocumentOperatingSource(input: unknown): DocumentOperatingSummary;
export function createDocumentOperatingProcedure(input: unknown, catalog: CommandCatalog,
  options: DocumentOperatingOptions): DocumentOperatingProcedure;
export function inspectDocumentOperatingProcedure(input: unknown): DocumentOperatingProcedure;
export function receiveDocumentOperatingProcedure(input: unknown, editedPlan?: unknown): DocumentOperatingProcedure;
export function renderDocumentOperatingProcedure(input: unknown, format?: 'package'): DocumentOperatingProcedure;
export function renderDocumentOperatingProcedure(input: unknown, format: 'plan'): OperatingPlan;
export function renderDocumentOperatingProcedure(input: unknown, format: 'source'): DocumentOperatingSource;
export function renderDocumentOperatingProcedure(input: unknown, format: 'catalog'): CommandCatalog;
export function renderDocumentOperatingProcedure(input: unknown, format: 'markdown' | 'html'): string;
