export interface FredReleaseSelectionInput {
  schema?: 'stellar-forge.fred-release-selection.v1'; series: string[]; asOf: string;
  calendarStart: string; calendarEnd: string; vintageStart: string; vintageEnd: string;
  pageSize?: number; maxRows?: number;
}
export interface FredReleaseSelection extends Required<FredReleaseSelectionInput> {}
export interface FredReleaseRequest {
  endpoint: 'series' | 'series/release' | 'release/dates' | 'series/vintagedates';
  parameters: Record<string, string>; url: string;
}
export interface FredReleaseReceipt {
  request: FredReleaseRequest; status: 200; receivedAt: string;
  headers: Partial<Record<'content-type' | 'date' | 'etag' | 'last-modified', string>>;
  sha256: string; body: string;
}
export interface FredOriginalRelease {
  id: number; realtime_start: string; realtime_end: string; name: string; press_release: boolean;
  link?: string; notes?: string; [field: string]: unknown;
}
export interface FredOriginalReleaseDate {
  release_id: number; date: string; release_name?: string; release_last_updated?: string; [field: string]: unknown;
}
export interface FredReleaseCalendarRow {
  releaseId: number; date: string; original: FredOriginalReleaseDate; series: string[];
}
export interface FredReleaseVintageRow { series: string; date: string; original: string }
export interface FredReleaseSeries {
  id: string; title: string; units: string; frequency: string; seasonalAdjustment: string;
  observationStart: string; observationEnd: string; lastUpdated: string; notes: string; sourceUrl: string; asOf: string;
  originalMetadata: Record<string, unknown>; releases: FredOriginalRelease[]; releaseIds: number[]; vintageDates: string[];
}
export interface FredRelease {
  id: number; metadata: FredOriginalRelease; series: string[]; dates: string[];
}
export interface FredReleaseFlowModel {
  schema: 'stellar-forge.fred-release-model.v1'; selection: FredReleaseSelection;
  series: FredReleaseSeries[]; releases: FredRelease[]; calendar: FredReleaseCalendarRow[];
  vintages: FredReleaseVintageRow[]; rowCount: number;
}
export interface FredReleaseSourceContext {
  notice: string; terms: string; calendarNotice: string; metadataAsOf: string;
  calendarInterval: { start: string; end: string; includesDatesWithNoData: true };
  vintageInterval: { start: string; end: string }; retrievalWindow: { start: string; end: string }; responseCount: number;
}
export interface FredReleaseModel extends FredReleaseFlowModel { captureSha256: string; source: FredReleaseSourceContext }
export interface FredReleaseCapture {
  schema: 'stellar-forge.fred-release-capture.v1'; selection: FredReleaseSelection;
  records: FredReleaseReceipt[]; captureSha256: string;
}
export interface FredReleaseSourcePage<T> {
  count: number; offset: number; returned: number; nextOffset: number; complete: boolean; rows: T[];
}
export declare const FRED_RELEASE_SELECTION: 'stellar-forge.fred-release-selection.v1';
export declare const FRED_RELEASE_CAPTURE: 'stellar-forge.fred-release-capture.v1';
export declare const FRED_RELEASE_MODEL: 'stellar-forge.fred-release-model.v1';
export declare const FRED_RELEASE_CALENDAR_NOTICE: string;
export declare function releaseHash(value: string | Uint8Array): string;
export declare function releaseDigest(value: unknown): string;
export declare function normalizeFredReleaseSelection(input: FredReleaseSelectionInput): FredReleaseSelection;
export declare function fredReleaseRequest(input: FredReleaseSelectionInput, endpoint: FredReleaseRequest['endpoint'],
  target: string | number, offset?: number): FredReleaseRequest;
export declare function readFredSeriesRelease(receipt: FredReleaseReceipt, input: FredReleaseSelectionInput, series: string):
  { series: string; releases: FredOriginalRelease[] };
export declare function readFredReleaseDates(receipt: FredReleaseReceipt, input: FredReleaseSelectionInput, releaseId: number,
  offset?: number, expectedCount?: number | null): FredReleaseSourcePage<Omit<FredReleaseCalendarRow, 'series'>>;
export declare function readFredSeriesVintageDates(receipt: FredReleaseReceipt, input: FredReleaseSelectionInput, series: string,
  offset?: number, expectedCount?: number | null): FredReleaseSourcePage<FredReleaseVintageRow>;
export declare function fredReleaseSourceFlow(input: FredReleaseSelectionInput): Generator<FredReleaseRequest, FredReleaseFlowModel, FredReleaseReceipt>;
export declare function fredReleaseCaptureIdentity(capture: FredReleaseCapture): Omit<FredReleaseCapture, 'captureSha256'>;
export declare function inspectFredReleaseCapture(capture: unknown): FredReleaseModel;
export declare const validateFredReleaseCapture: typeof inspectFredReleaseCapture;
export declare function sealFredReleaseCapture(input: FredReleaseSelectionInput, records: FredReleaseReceipt[]): FredReleaseCapture;
