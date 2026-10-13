export declare const ALFRED_CAPTURE: 'stellar-forge.alfred-vintage-capture.v1';
export declare const ALFRED_SOURCE: 'stellar-forge.alfred-vintage-source.v1';
export declare const ALFRED_SOURCE_MODE: 'ALFRED_VINTAGE';
export declare const ALFRED_TIME_BASIS: 'ALFRED_VINTAGE_DATE';
export declare const ALFRED_DOCUMENTATION: 'https://alfred.stlouisfed.org/help/downloaddata';
export type FredAlfredMetadataField = 'title' | 'publisher' | 'release' | 'units' | 'frequency' | 'seasonalAdjustment' | 'notes';
export declare const ALFRED_FIELDS: readonly FredAlfredMetadataField[];
export interface FredAlfredSelectionInput {
  schema?: 'stellar-forge.fred-selection.v1';
  series: string[]; asOf: string; start: string; end: string; pageSize?: number; maxRows?: number;
}
export interface FredAlfredSelection extends FredAlfredSelectionInput {
  schema: 'stellar-forge.fred-selection.v1'; pageSize: number; maxRows: number;
}
export interface FredAlfredRequest {
  method: 'GET'; url: string; series: string; vintage: string; start: string; end: string;
  units: 'lin'; output: 'all_observations';
}
export type FredAlfredPublicHeaders = Partial<Record<'content-type' | 'date' | 'etag' | 'last-modified' | 'content-length' | 'retry-after', string>>;
export interface FredAlfredTextSource {
  kind: 'http' | 'file'; url: string; finalUrl: string | null; status: number | null;
  receivedAt: string; headers: FredAlfredPublicHeaders; body: string; bytes: number; sha256: string;
}
export interface FredAlfredTextSpan { start: number; end: number; value: string; }
export interface FredAlfredMetadataFieldEdition {
  text: FredAlfredTextSpan; realtimeStart: FredAlfredTextSpan; realtimeEnd: FredAlfredTextSpan;
}
export interface FredAlfredMetadataEdition {
  schema: 'stellar-forge.alfred-metadata-edition.v1'; source: FredAlfredTextSource;
  series: FredAlfredTextSpan; selectedVintage: FredAlfredTextSpan;
  fields: Record<'title' | 'units' | 'frequency' | 'seasonalAdjustment', FredAlfredMetadataFieldEdition> &
    Partial<Record<'publisher' | 'release' | 'notes', FredAlfredMetadataFieldEdition | null>>;
}
export interface FredAlfredRecord {
  request: FredAlfredRequest; response: FredAlfredTextSource; metadata?: FredAlfredMetadataEdition | null;
}
export interface FredAlfredCapture {
  schema: typeof ALFRED_CAPTURE; selection: FredAlfredSelection; captureSha256: string;
  source: { schema: typeof ALFRED_SOURCE; series: FredAlfredRecord[] };
}
export type FredAlfredMetadataCoverage = 'UNAVAILABLE' | 'PARTIAL_HISTORICAL_EDITION' | 'ALFRED_HISTORICAL_EDITION';
export interface FredAlfredMetadataIssue {
  field: FredAlfredMetadataField; realtimeStart: string; realtimeEnd: string; requestedVintage: string; message: string;
}
export interface FredAlfredSelectedMetadataEdition {
  value: string; realtimeStart: string; realtimeEnd: string; covers: boolean; sourceRange: { start: number; end: number };
}
export interface FredAlfredSourceDescriptor { url: string; receivedAt: string; bytes: number; sha256: string; kind?: 'http' | 'file'; }
export interface FredAlfredMetadataModel {
  coverage: FredAlfredMetadataCoverage; fields: Record<FredAlfredMetadataField,string>;
  editions: Record<FredAlfredMetadataField,FredAlfredSelectedMetadataEdition | null> | null;
  issues?: FredAlfredMetadataIssue[]; source: FredAlfredSourceDescriptor | null;
}
export interface FredAlfredObservation {
  date: string; value: string; missing: boolean; originalRow: number; sourceRange: { start: number; end: number; line: number };
}
export interface FredAlfredCsvModel {
  series: string; vintage: string; header: [string,string]; observations: FredAlfredObservation[]; source: FredAlfredSourceDescriptor;
}
export interface FredAlfredSeries extends Record<FredAlfredMetadataField,string> {
  id: string; observationStart: string | null; observationEnd: string | null; lastUpdated: '';
  sourceUrl: string; asOf: string; requestedVintage: string; returnedVintage: string; returnedColumn: string;
  retrievedAt: string; timeBasis: typeof ALFRED_TIME_BASIS; metadataCoverage: FredAlfredMetadataCoverage;
  metadataEditions: FredAlfredMetadataModel['editions']; metadataIssues: FredAlfredMetadataIssue[];
  metadataSource: FredAlfredSourceDescriptor | null; count: number; originalCount: number; outsideSelection: number; missing: number;
}
export interface FredAlfredRow {
  series: string; date: string; value: string; missing: boolean; as_of: string; time_basis: typeof ALFRED_TIME_BASIS;
  realtime_start: ''; realtime_end: ''; units: string; frequency: string; seasonal_adjustment: string;
}
export interface FredAlfredModel {
  selection: FredAlfredSelection; sourceMode: typeof ALFRED_SOURCE_MODE; timeBasis: typeof ALFRED_TIME_BASIS;
  series: FredAlfredSeries[]; rows: FredAlfredRow[]; rowCount: number; missing: number; sourceResponses: number;
  metadataComplete: boolean; retrievalWindow: { from: string; through: string };
}
export declare function fredAlfredRequest(selection: FredAlfredSelectionInput, series: string): FredAlfredRequest;
export declare function readFredAlfredMetadata(input: FredAlfredMetadataEdition | null | undefined, context: { series: string; vintage: string }): FredAlfredMetadataModel;
export declare function readFredAlfredCsv(record: FredAlfredRecord, selection: FredAlfredSelectionInput): FredAlfredCsvModel;
export declare function inspectFredAlfredCapture(capture: FredAlfredCapture): FredAlfredModel;
export declare function fredAlfredCaptureIdentity(capture: FredAlfredCapture): Omit<FredAlfredCapture,'captureSha256'>;
