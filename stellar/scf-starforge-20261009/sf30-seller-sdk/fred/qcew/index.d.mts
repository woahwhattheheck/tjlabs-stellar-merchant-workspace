// MIT. Public county-report types; source values and file bodies remain complete.
export type QcewSha256 = string;
export interface QcewPeriod { year: number; quarter: 1 | 2 | 3 | 4; }
export interface QcewRegion { id: string; label: string; areas: string[]; }
export interface QcewIndustry { code: string; label: string; kind?: 'total' | 'supersector' | 'sector' | 'industry'; ownerships?: string[]; }
export interface QcewProfileDefinition {
  name: string; title?: string; regions: QcewRegion[]; focus?: string; industries?: QcewIndustry[];
  employment?: 'quarter_mean' | 'month3';
  wageMethod?: 'from_totals' | 'published_weighted';
  coverage?: 'complete' | 'disclosed_components';
  baseline?: { year?: number; quarter?: 'same_quarter' | 1 | 2 | 3 | 4 };
  history?: { startYear?: number; tableYears?: number[]; sameQuarterOnly?: true; chartIndustries?: 'highest_current_wage' | string[] };
  price?: {
    dollars?: 'nominal' | 'constant'; seriesId?: string; quarterly?: 'quarter_end' | 'quarter_mean';
    base?: { policy: 'report_period' } | { policy: 'fixed'; period: QcewPeriod };
  };
  publisher?: {
    name?: string; contact?: string; methodologyOwner?: string;
    sponsor?: null | { name: string; line?: string; url?: string };
  };
  decimals?: { employment: 0; wage: 1; ratio: 2; percent: 1 };
  operatorNotes?: string;
}
export interface QcewProfile {
  schema: 'stellar-forge.qcew-wage-profile.v1'; id: QcewSha256; definition: QcewProfileDefinition;
}
export interface QcewCompressedOriginal {
  name?: string; encoding: 'gzip+base64'; bytes: number; sha256: QcewSha256; gzipSha256: QcewSha256; body: string;
}
export interface QcewCapture {
  schema: 'stellar-forge.qcew-capture.v1'; captureSha256: QcewSha256;
  originalManifest: QcewCompressedOriginal; files: Array<QcewCompressedOriginal & { name: string }>;
}
export interface QcewSourceSummary {
  kind: string; retrievedFrom: string; retrievedThrough: string; years: number[]; areas: string[];
  originalFiles: number; originalRows: number; originalBytes: number;
}
export interface QcewSourceRow { [column: string]: string | number; originalRow: number; }
export interface QcewCaptureInspection {
  captureSha256: QcewSha256; intake: Record<string, unknown>; sourceFiles: Array<Record<string, unknown>>;
  originalRows: number; coverage: Map<string, string>; classifications: Set<string>;
  rows: Map<string, { row: QcewSourceRow; file: string; sha256: QcewSha256 }>;
  sourceSummary: QcewSourceSummary;
}
export interface QcewRowSelection {
  keys: Array<{ area: string; industry: string; ownership: string; aggregation: string }>;
  periods: string[]; sizeCode?: string;
}
declare const qcewContextBrand: unique symbol;
export interface QcewCaptureContext {
  readonly captureSha256: QcewSha256;
  readonly [qcewContextBrand]: never;
}
export interface QcewCaptureContextStats {
  readonly captureSha256: QcewSha256; readonly fullCsvPasses: number;
  readonly originalFiles: number; readonly originalRows: number; readonly retainedRows: number;
  readonly selectedCoordinates: number; readonly admittedCaptures: number;
}
export interface QcewCaptureReadOptions {
  select?: null | ((row: QcewSourceRow) => boolean);
  selection?: QcewRowSelection | null; context?: QcewCaptureContext | null;
}
export interface QcewQuantity {
  value: string | null; exact: null | { numerator: string; denominator: string }; status: string;
  [detail: string]: unknown;
}
export interface QcewReport {
  schema: 'stellar-forge.qcew-wage-report.v1'; id: QcewSha256; profile: QcewProfile;
  period: QcewPeriod; periodLabel: string; priceBase: QcewPeriod;
  source: { captureSha256: QcewSha256; files: Array<Record<string, unknown>>; [field: string]: unknown };
  cpi: { captureSha256: QcewSha256; [field: string]: unknown };
  availability: { currentCells: number; weeklyWageStatuses: Record<string, number> };
  tables: Record<string, unknown>; figures: Record<string, unknown>; methodology: Record<string, unknown>;
  [field: string]: unknown;
}
export interface QcewReportFile {
  name: string; contentType: string; bytes: number; sha256: QcewSha256; encoding: 'utf8' | 'base64'; body: string;
}
export interface QcewFileManifest {
  schema: 'stellar-forge.qcew-report-files.v1'; editionId: QcewSha256; reportId: QcewSha256;
  previousEditionId: QcewSha256 | null; formats: ['html'] | ['html', 'pdf'];
  renderer: { html: string; pdf: null | Record<string, unknown> };
  files: Array<Pick<QcewReportFile, 'name' | 'contentType' | 'bytes' | 'sha256'>>;
  manifestSha256: QcewSha256;
}
export interface QcewFilePackage { manifest: QcewFileManifest; files: QcewReportFile[]; }
export interface QcewEdition {
  id: QcewSha256; reportId: QcewSha256; manifestSha256: QcewSha256;
  captureSha256: QcewSha256; cpiCaptureSha256: QcewSha256; profileId: QcewSha256;
  period: QcewPeriod; previousEditionId: QcewSha256 | null; formats: ['html'] | ['html', 'pdf']; createdAt: string;
}
export interface QcewOperation { directory: string; id: string; expectedRevision: number; }
export type QcewResult<T> = T & { revision: number; replayed?: true };
export const BAY_AREA: readonly string[];
export const INDUSTRIES: ReadonlyArray<Readonly<{ code: string; label: string }>>;
export function createQcewProfile(definition: QcewProfileDefinition): QcewProfile;
export function validateQcewProfile(profile: unknown): QcewProfile;
export function defaultSanFranciscoProfile(): QcewProfile;
export function profilePeriods(profile: QcewProfile, reportPeriod: QcewPeriod): {
  current: QcewPeriod; baseline: QcewPeriod; history: QcewPeriod[]; table: QcewPeriod[]; priceBase: QcewPeriod;
};
export function inspectQcewCapture(capture: unknown, options?: QcewCaptureReadOptions): QcewCaptureInspection;
export function createQcewCaptureContext(capture: QcewCapture, options?: { selections?: QcewRowSelection[] }): QcewCaptureContext;
export function qcewCaptureContextStats(context: QcewCaptureContext): QcewCaptureContextStats;
export function sealQcewIntake(directory: string): Promise<QcewCapture>;
export function sealQcewIntakeWithContext(directory: string, options?: { selections?: QcewRowSelection[] }):
  Promise<{ capture: QcewCapture; sourceContext: QcewCaptureContext }>;
export function readQcewCapture(directory: string, captureSha256: QcewSha256, options?: QcewCaptureReadOptions):
  Promise<{ capture: QcewCapture; model: QcewCaptureInspection }>;
export function readQcewCaptureWithContext(directory: string, captureSha256: QcewSha256, options?: { selections?: QcewRowSelection[] }):
  Promise<{ capture: QcewCapture; sourceContext: QcewCaptureContext; model: QcewCaptureInspection }>;
export function readQcewOriginalMember(directory: string, captureSha256: QcewSha256, name: string, options?: { context?: QcewCaptureContext | null }):
  Promise<{ name: string; bytes: Uint8Array; sha256: QcewSha256 }>;
export function qcewReportRowSelection(profile: QcewProfile, period: QcewPeriod): QcewRowSelection;
export function buildQcewReport(options: { capture: QcewCapture; cpiCapture: unknown; profile: QcewProfile; period: QcewPeriod;
  sourceContext?: QcewCaptureContext | null }): QcewReport;
export function validateQcewReport(report: unknown, options?: { capture?: QcewCapture; cpiCapture?: unknown;
  sourceContext?: QcewCaptureContext | null }): QcewReport;
export function compareQcewReports(previous: QcewReport, current: QcewReport): Record<string, unknown>;
export function buildQcewReportFiles(report: QcewReport): Array<Omit<QcewReportFile, 'encoding'>>;
export function renderQcewReport(report: QcewReport): string;
export function importQcewSource(options: QcewOperation & (
  { capture: QcewCapture; inputDirectory?: never; sourceContext?: QcewCaptureContext | null; selections?: QcewRowSelection[] } |
  { inputDirectory: string; capture?: never; sourceContext?: never; selections?: QcewRowSelection[] }
)): Promise<QcewResult<{ captureSha256: QcewSha256; source: QcewSourceSummary }>>;
export function saveQcewProfile(options: QcewOperation & { profile: QcewProfile | QcewProfileDefinition }):
  Promise<QcewResult<{ profile: QcewProfile }>>;
export function produceQcewEdition(options: QcewOperation & {
  captureSha256: QcewSha256; cpiCaptureSha256: QcewSha256; profileId: QcewSha256;
  period: QcewPeriod; previousEditionId?: QcewSha256 | null; browserPath?: string | null; sourceContext?: QcewCaptureContext | null;
}): Promise<QcewResult<{ edition: QcewEdition; directory: string; availability: QcewReport['availability']; files: QcewFileManifest['files'] }>>;
export function getQcewEdition(directory: string, editionId?: QcewSha256, options?: { validateSources?: boolean; sourceContext?: QcewCaptureContext | null }):
  Promise<QcewFilePackage & { report: QcewReport; entry: QcewEdition; directory: string }>;
export function downloadQcewMember(options: { directory: string; editionId?: QcewSha256; name: string }):
  Promise<{ name: string; contentType: string; bytes: Uint8Array; sha256: QcewSha256 }>;
export function viewQcewProject(options: { directory: string }): Promise<{
  projectId: string; title: string; revision: number; pending: Record<string, unknown> | null; qcew: Record<string, unknown>
}>;
export function readQcewFiles(directory: string, editionId: QcewSha256, options?: { expectedManifest?: QcewFileManifest | null }):
  Promise<QcewFilePackage>;
export function validateQcewFilePackage(packet: unknown, options?: {
  report?: QcewReport; previousReport?: QcewReport | null; expectedEdition?: QcewEdition | null; rebuildText?: boolean;
}): QcewFilePackage & { report: QcewReport };
