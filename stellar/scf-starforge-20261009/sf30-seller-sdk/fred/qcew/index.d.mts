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
  /** Present for complete official quarterly CSV slice intakes. */
  periods?: string[];
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
  projectId: string; title: string; revision: number; pending: Record<string, unknown> | null; qcew: QcewProjectInventory
}>;
export function readQcewFiles(directory: string, editionId: QcewSha256, options?: { expectedManifest?: QcewFileManifest | null }):
  Promise<QcewFilePackage>;
export function validateQcewFilePackage(packet: unknown, options?: {
  report?: QcewReport; previousReport?: QcewReport | null; expectedEdition?: QcewEdition | null; rebuildText?: boolean;
}): QcewFilePackage & { report: QcewReport };


export interface QcewPaymentTerms {
  scheme: string; network: string; asset: string; amount: string; payTo: string; maxTimeoutSeconds: number;
  [field: string]: unknown;
}
export interface QcewMerchantTerms { origin: string; path: string; payment: QcewPaymentTerms; }
export interface QcewMerchantFile {
  path: string; bytes: number; sha256: QcewSha256; contentType: string; resource: string;
  role: 'REPORT_PACKAGE' | 'REPORT_MANIFEST' | 'REPORT_MEMBER';
}
export interface QcewMerchantPlan extends QcewMerchantTerms {
  schema: 'stellar-forge.qcew-merchant.v1'; publicationId: QcewSha256; editionId: QcewSha256;
  reportId: QcewSha256; manifestSha256: QcewSha256; deliverySha256: QcewSha256; planSha256: QcewSha256;
  resource: string; downloads: QcewMerchantFile[]; configSha256: QcewSha256; offersSha256: QcewSha256;
}
export interface QcewPublicationRecord extends QcewMerchantTerms {
  id: QcewSha256; editionId: QcewSha256; reportId: QcewSha256; manifestSha256: QcewSha256;
  deliverySha256: QcewSha256; planSha256: QcewSha256; resource: string; createdAt: string;
}
export interface QcewProjectInventory {
  schema: 'stellar-forge.fred-qcew-project.v1';
  captures: Array<{ id: QcewSha256; captureSha256: QcewSha256; summary: QcewSourceSummary; importedAt: string }>;
  profiles: QcewProfile[]; editions: QcewEdition[]; publications: QcewPublicationRecord[];
  selectedCapture: QcewSha256 | null; selectedProfile: QcewSha256 | null;
  selectedEdition: QcewSha256 | null; selectedPublication: QcewSha256 | null;
}
export interface QcewReportDelivery {
  schema: 'stellar-forge.qcew-report-delivery.v1'; editionId: QcewSha256; reportId: QcewSha256;
  manifestSha256: QcewSha256; deliverySha256: QcewSha256; editions: QcewFilePackage[];
}
export interface QcewCheckedReportDelivery {
  delivery: QcewReportDelivery; editions: Array<QcewFilePackage & { report: QcewReport }>;
  edition: QcewFilePackage & { report: QcewReport };
}
export interface QcewReportReceiving {
  schema: 'stellar-forge.qcew-report-receiving.v1'; state: 'RECEIVED'; editionId: QcewSha256;
  reportId: QcewSha256; manifestSha256: QcewSha256; deliverySha256: QcewSha256;
  editions: number; files: number; title: string; period: QcewPeriod; reportFiles: QcewFileManifest['files'];
  packageSha256: QcewSha256; packageBytes: number; receivedAt: string;
}
export interface QcewReceivedReport extends QcewCheckedReportDelivery {
  receipt: QcewReportReceiving; directory: string; bytes: Uint8Array;
}
export interface QcewMerchantEdition {
  schema: 'stellar-forge.qcew-merchant-edition.v1'; editionId: QcewSha256; reportId: QcewSha256;
  manifestSha256: QcewSha256; deliverySha256: QcewSha256; title: string; period: QcewPeriod;
  source: QcewReport['source']; cpi: QcewReport['cpi']; availability: QcewReport['availability'];
  files: QcewFileManifest['files']; predecessorEditions: number;
}
export interface QcewMerchantView {
  edition: QcewMerchantEdition; plan: QcewMerchantPlan; directory: string;
  config: Record<string, unknown>; offers: unknown[]; offersBytes: Uint8Array; deliveryBytes: Uint8Array;
}
export interface QcewMerchantSession {
  url: string; mode: 'NATIVE_SELLER' | 'CHALLENGE_ONLY'; publicationId: QcewSha256;
  editionId: QcewSha256; reportId: QcewSha256; resource: string; close(): Promise<unknown>;
  [field: string]: unknown;
}
export interface QcewPurchase {
  schema: 'stellar-forge.qcew-purchase.v1'; publicationId: QcewSha256; editionId: QcewSha256;
  reportId: QcewSha256; manifestSha256: QcewSha256; deliverySha256: QcewSha256; captureSha256: QcewSha256;
  planSha256: QcewSha256; intentId: string; url: string; file: string; expected: QcewMerchantFile;
  configSha256: QcewSha256; purchaseSha256: QcewSha256;
  config: Record<string, unknown> & { operation: Record<string, unknown>; preparedFrom: { acceptIndex: number; [key: string]: unknown };
    responseFile: { destination: string; maxBytes: number; expectedSha256: QcewSha256; expectedBytes: number; expectedContentType: string } };
}
export interface QcewBuyer {
  fromConfig(config: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>;
  operation(intentId: string): unknown;
}
export interface QcewNativeDeliveryResult {
  record: Record<string, unknown>; raiseForStatus(): void;
  bytes(options: { limit: number }): Promise<Uint8Array>;
}
export type QcewPurchaseOutcome =
  | { state: 'DELIVERED'; intentId: string; publicationId: QcewSha256; editionId: QcewSha256; reportId: QcewSha256;
      metadata: QcewMerchantFile; bytes: number; sha256: QcewSha256; result: QcewNativeDeliveryResult;
      report?: { title: string; period: QcewPeriod; editions: number; files: number } }
  | { state: 'PREPARED_NOT_STARTED' | 'AWAITING_NATIVE_RESULT'; intentId: string; publicationId: QcewSha256; editionId: QcewSha256 }
  | { state: 'NATIVE_PREPARATION_INCOMPLETE'; intentId: string };
export interface QcewPurchaseReceivingSelection {
  schema: 'stellar-forge.qcew-purchase-receiving.v1'; intentId: string; publicationId: QcewSha256;
  directory: string; packageSha256: QcewSha256; requestedAt: string;
}
export interface QcewSavedPurchase {
  intentId: string; publicationId: QcewSha256; editionId: QcewSha256; file: string; url: string;
  purchaseSha256: QcewSha256; expected: QcewMerchantFile; receiving: QcewPurchaseReceivingSelection | null;
}
export interface QcewDeliveredFile { bytes: Uint8Array; filename: string; contentType: string; sha256?: QcewSha256; }
export const QCEW_MERCHANT: 'stellar-forge.qcew-merchant.v1';
export const QCEW_REPORT_PACKAGE: 'report-package.json.gz';
export const QCEW_PURCHASE: 'stellar-forge.qcew-purchase.v1';
export const QCEW_REPORT_DELIVERY: 'stellar-forge.qcew-report-delivery.v1';
export const QCEW_REPORT_RECEIVING: 'stellar-forge.qcew-report-receiving.v1';
export const MAX_QCEW_DELIVERY_JSON_BYTES: number;
export function normalizeQcewMerchantTerms(options: { origin: string; path?: string; payment: QcewPaymentTerms }): QcewMerchantTerms;
export function qcewPublicationId(options: QcewMerchantTerms & { editionId: QcewSha256 }): QcewSha256;
export function validateQcewMerchantPlan(plan: unknown, options?: { record?: QcewPublicationRecord | null; edition?: QcewEdition | null }): QcewMerchantPlan;
export function publishQcewEdition(options: QcewOperation & { editionId: QcewSha256; origin: string; path?: string; payment: QcewPaymentTerms }):
  Promise<QcewResult<{ publicationId: QcewSha256; editionId: QcewSha256; reportId: QcewSha256;
    manifestSha256: QcewSha256; planSha256: QcewSha256; deliverySha256: QcewSha256; resource: string; downloads: QcewMerchantFile[] }>>;
export function selectQcewPublication(directory: string, publicationId: QcewSha256): Promise<string>;
export function qcewPublicationDirectory(directory: string, publicationId: QcewSha256): string;
export function prepareQcewMerchant(options: { directory: string; editions: QcewFilePackage[]; origin: string;
  path?: string; payment: QcewPaymentTerms; originalDeliveryBytes?: Uint8Array | null }):
  Promise<{ edition: QcewMerchantEdition; plan: QcewMerchantPlan; directory: string }>;
export function readQcewMerchant(directory: string): Promise<QcewMerchantView>;
export function startQcewMerchant(options: { directory: string; port?: number; nativeFactory?: unknown; facilitator?: string;
  allowLocalFacilitator?: boolean; maxInFlight?: number; drainGraceMs?: number }): Promise<QcewMerchantSession>;
export function createQcewReportDelivery(editions: QcewFilePackage[]): QcewReportDelivery;
export function validateQcewReportDelivery(value: unknown): QcewCheckedReportDelivery;
export function encodeQcewReportDelivery(value: QcewReportDelivery): Uint8Array;
export function decodeQcewReportDelivery(bytes: Uint8Array): QcewCheckedReportDelivery;
export function receiveQcewReportDelivery(options: { directory: string; bytes: Uint8Array }):
  Promise<QcewReportReceiving & { directory: string; reused: boolean }>;
export function readQcewReportReceiving(directory: string): Promise<QcewReceivedReport>;
export function exportQcewReportReceiving(directory: string): Promise<QcewDeliveredFile & { sha256: QcewSha256 }>;
export function prepareQcewPurchase(options: { directory: string; intentId: string; file?: string | null;
  acceptIndex?: number; query?: URLSearchParams | Record<string, string>; previous?: null }): Promise<QcewPurchase>;
export function executeQcewPurchase(options: { directory: string; buyer: QcewBuyer; purchase: QcewPurchase; signal?: AbortSignal }): Promise<QcewPurchaseOutcome>;
export function recoverQcewPurchase(options: { directory: string; buyer: QcewBuyer; intentId: string }): Promise<QcewPurchaseOutcome>;
export function exportQcewPurchase(options: { directory: string; buyer: QcewBuyer; intentId: string }): Promise<QcewDeliveredFile>;
export function receiveQcewPurchase(options: { directory: string; buyer: QcewBuyer; intentId: string; receivingDirectory?: string | null }):
  Promise<QcewReportReceiving & { directory: string; reused: boolean; intentId: string; publicationId: QcewSha256 }>;
export function listQcewPurchases(directory: string, options?: { merchant?: QcewMerchantView | null }): Promise<QcewSavedPurchase[]>;
export function readQcewPurchaseReceiving(options: { directory: string; intentId: string }):
  Promise<QcewReceivedReport & { intentId: string; publicationId: QcewSha256 }>;
export function exportQcewPurchaseReceiving(options: { directory: string; intentId: string; file?: string; editionId?: QcewSha256 | null }):
  Promise<QcewDeliveredFile & { sha256: QcewSha256 }>;
