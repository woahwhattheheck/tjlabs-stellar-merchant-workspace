import type { OperatingPlan } from '../../../distribution/discovery/operating-plan.mjs';
import type { FredOperatingSource, FredOperatingArtifact } from '../../../distribution/discovery/fred-operating-plan.mjs';
export type { FredOperatingSource, FredOperatingArtifact } from '../../../distribution/discovery/fred-operating-plan.mjs';

export const FRED_OPERATING_PACKAGE_SCHEMA: 'stellar-forge.fred-operating-package.v1';
export const FRED_OPERATING_SOURCE_FILE: 'source.json';
export const FRED_OPERATING_MANIFEST_FILE: 'MANIFEST.json';
export const MAX_FRED_OPERATING_DESCRIPTOR_BYTES: number;
export const MAX_FRED_OPERATING_PACKAGE_BYTES: number;
export const MAX_FRED_OPERATING_BUNDLE_BYTES: number;

export interface FredOperatingPackageResult {
  source: FredOperatingSource;
  sourceFile: FredOperatingArtifact;
  manifestFile: FredOperatingArtifact;
  directory: string;
  projectDirectory: string | null;
  reused: boolean;
}
export interface FredOperatingPublicationReceipt {
  id: string;
  projectId: string;
  comparisonId: string;
  requestSha256: string;
  archive: { name: string; bytes: number; sha256: string };
}
export interface FredOperatingReceiveResult extends FredOperatingPackageResult {
  projectDirectory: string;
  publications: FredOperatingPublicationReceipt[];
  plan: OperatingPlan | null;
  receiptFile: FredOperatingArtifact;
  projectReceipt: Record<string, unknown>;
}
export interface CaptureFredOperatingSourceOptions {
  /** Absolute original retained native project directory. */
  directory: string;
  /** Separate private output directory; reuse only for this exact capture selection. */
  outputDirectory: string;
  /** Explicit original UTC capture timestamp; retain it for retries. */
  capturedAt: string;
  /** null carries every operation view and every complete original archive. */
  publicationIds?: string[] | null;
  /** Pass original QCEW source contexts through unchanged. */
  qcewSourceContexts?: Map<string, unknown> | null;
  signal?: AbortSignal;
}
export interface InspectFredOperatingSourcePackageOptions {
  directory: string;
  expectedSource: FredOperatingArtifact;
  signal?: AbortSignal;
}
export interface ReceiveFredOperatingSourceOptions {
  sourceDirectory: string;
  destination: string;
  expectedSource: FredOperatingArtifact;
  qcewSourceContexts?: Map<string, unknown> | null;
  /** Merge with the retained ordinary plan using its original complete revision prefix. */
  plan?: OperatingPlan | null;
  signal?: AbortSignal;
}
/** Complete original operation-prefix hashes, including abandoned actions and full results. */
export function fredOperatingHistory(state: {
  id: string; createdAt: string; revision: number;
  operations: Array<{ id: string; result: { revision: number }; [key: string]: unknown }>;
}): Array<{ revision: number; sha256: string }>;
export function captureFredOperatingSource(options: CaptureFredOperatingSourceOptions): Promise<FredOperatingPackageResult>;
export function inspectFredOperatingSourcePackage(options: InspectFredOperatingSourcePackageOptions): Promise<FredOperatingPackageResult>;
export function receiveFredOperatingSource(options: ReceiveFredOperatingSourceOptions): Promise<FredOperatingReceiveResult>;
