import type { FredOperatingSource } from '../../../distribution/discovery/fred-operating-plan.mjs';
import type { OperatingPlan } from '../../../distribution/discovery/operating-plan.mjs';

export interface FredOperatingArchiveFile { path: string; bytes: number; sha256: string; }
export interface FredOperatingArchiveExportOptions {
  directory: string; outputDirectory: string; capturedAt: string;
  publicationIds?: string[] | null; plan?: OperatingPlan | null;
  expectedProject?: { id: string; revision: number } | null;
  qcewSourceContexts?: Map<string, unknown> | null; signal?: AbortSignal;
}
export interface FredOperatingArchiveInspectOptions {
  archivePath: string; directory: string; expectedArchive?: FredOperatingArchiveFile | null; signal?: AbortSignal;
}
export interface FredOperatingArchiveReceiveOptions {
  archivePath: string; destination: string; expectedArchive?: FredOperatingArchiveFile | null;
  qcewSourceContexts?: Map<string, unknown> | null; signal?: AbortSignal;
}
export interface FredOperatingArchiveResult {
  schema: 'stellar-forge.fred-operating-archive-result.v1';
  archive: FredOperatingArchiveFile; archivePath: string; directory: string; sourceDirectory: string;
  source: FredOperatingSource; sourceFile: FredOperatingArchiveFile; manifestFile: FredOperatingArchiveFile;
  plan: OperatingPlan | null; projectDirectory: string | null; reused: boolean;
  publications?: Array<{ id: string; projectId: string; comparisonId: string; requestSha256: string; archive: { name: string; bytes: number; sha256: string } }>;
  receiptFile?: FredOperatingArchiveFile; projectReceipt?: unknown;
}
export declare const MAX_FRED_OPERATING_ARCHIVE_BYTES: number;
export declare const MAX_FRED_OPERATING_PLAN_BYTES: number;
export declare const MAX_FRED_OPERATING_EXPORT_REQUEST_BYTES: number;
export declare const FRED_OPERATING_ARCHIVE_SCHEMA: 'stellar-forge.fred-operating-archive.v1';
export declare const FRED_OPERATING_ARCHIVE_RESULT: 'stellar-forge.fred-operating-archive-result.v1';
export declare const FRED_OPERATING_ARCHIVE_NAME: 'fred-operating-handover.tar.gz';
export declare const FRED_OPERATING_HANDOVER_FILE: 'HANDOVER.json';
export declare function exportFredOperatingArchive(options: FredOperatingArchiveExportOptions): Promise<FredOperatingArchiveResult>;
export declare function inspectFredOperatingArchive(options: FredOperatingArchiveInspectOptions): Promise<FredOperatingArchiveResult>;
export declare function receiveFredOperatingArchive(options: FredOperatingArchiveReceiveOptions): Promise<FredOperatingArchiveResult>;

export interface FredOperatingArchiveReadOnlyOptions {
  archivePath: string; expectedArchive: FredOperatingArchiveFile; signal?: AbortSignal;
}
export interface FredOperatingArchiveReadOnlyResult {
  schema: 'stellar-forge.fred-operating-archive-readonly.v1';
  archive: FredOperatingArchiveFile;
  source: FredOperatingSource;
  sourceFile: FredOperatingArchiveFile;
  manifestFile: FredOperatingArchiveFile;
  manifest: {
    schema: 'stellar-forge.fred-operating-archive.v1';
    sourceId: string; projectId: string; sourceFile: FredOperatingArchiveFile;
    manifestFile: FredOperatingArchiveFile; plan: FredOperatingArchiveFile | null;
    files: FredOperatingArchiveFile[]; bytes: number;
  };
  packageManifest: {
    schema: 'stellar-forge.fred-operating-package.v1';
    source: FredOperatingArchiveFile; projectId: string; bundleSha256: string;
    files: FredOperatingArchiveFile[]; bytes: number;
  };
  plan: OperatingPlan | null;
  /** Full actual member inventory, including HANDOVER.json. */
  files: FredOperatingArchiveFile[];
}
/** Uses fixed installed source; reads all original bytes without extraction or writer locks. */
export declare function inspectFredOperatingArchiveReadOnly(options: FredOperatingArchiveReadOnlyOptions): Promise<FredOperatingArchiveReadOnlyResult>;
