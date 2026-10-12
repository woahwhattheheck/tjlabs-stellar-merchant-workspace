// MIT. Public editable weather receiving contract.
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export interface WeatherSite {
 id: string; revision: number; createdAt: string; name: string; latitude: number; longitude: number;
 timezone: string; cellSelection: 'land' | 'sea' | 'nearest'; notes: string; elevation?: number | 'nan';
}
export interface WeatherRequest {
 family: 'forecast' | 'history' | 'ensemble'; model: string; latitude: number; longitude: number;
 timezone: string; cellSelection: 'land' | 'sea' | 'nearest'; variables: string[];
 startDate: string; endDate: string; elevation?: number | 'nan';
 units: { temperature: 'celsius' | 'fahrenheit'; wind: 'kmh' | 'ms' | 'mph' | 'kn'; precipitation: 'mm' | 'inch' };
}
export interface WeatherRequestSpec { title: string; site: WeatherSite; request: WeatherRequest }
export interface WeatherCaptureDescriptor {
 id: string; requestId: string; specSha256: string; sha256: string; bytes: number;
 provenance: JsonObject; metadata: JsonObject; capturedAt: string; request: WeatherRequestSpec;
}
export interface WeatherCaptureSource extends WeatherCaptureDescriptor { raw: Uint8Array; view?: unknown }
export interface WeatherDecision {
 id: string; revision: number; captureId: string; title: string; owner: string;
 disposition: 'review' | 'monitor' | 'reschedule' | 'proceed'; notes: string;
 rule: JsonObject; result: JsonObject; createdAt: string;
}
export interface WeatherReport {
 schema: 'stellar-forge.weather-report.v1'; id: string; createdAt: string; title: string; owner: string; notes: string;
 decisions: WeatherDecision[]; captures: WeatherCaptureDescriptor[]; attribution: JsonObject; sha256: string;
 receivedFrom?: { originId: string; reportId: string; reportSha256: string };
}
export interface WeatherOriginalArchive {
 format: 'stellar-forge.weather-report-zip.v1'; bytes: number; sha256: string; reportId: string;
 reportSha256: string; encoding: 'base64'; content: string;
}
export interface WeatherReceivingMapping {
 sites: { original: string; local: string; revision: number }[];
 requests: { original: string; local: string }[];
 captures: { original: string; local: string }[];
 decisions: { original: string; local: string; revision: number }[];
 report: { original: string; originalSha256: string; local: string; localSha256: string };
}
export interface WeatherReceivingRecord {
 schema: 'stellar-forge.weather-receiving-record.v1'; id: string; receivingOriginId: string;
 packageSha256: string; contentSha256: string; sourceOriginId: string; receivedAt: string;
 originalReport: WeatherReport; originalDecisions: WeatherDecision[]; originalSources: WeatherCaptureDescriptor[];
 originalArchive?: WeatherOriginalArchive; mapping: WeatherReceivingMapping; historyIds: string[];
}
export interface WeatherHandover {
 schema: 'stellar-forge.weather-report-handover.v1'; originId: string; report: WeatherReport;
 sources: { capture: WeatherCaptureDescriptor; encoding: 'base64'; content: string }[];
 decisionHistory: WeatherDecision[]; receivingHistory: WeatherReceivingRecord[];
 legacyArchive?: WeatherOriginalArchive; contentSha256: string;
}
export interface WeatherHandoverReview {
 schema: 'stellar-forge.weather-handover-review.v1'; packageSha256: string; contentSha256: string; originId: string;
 reportId: string; reportSha256: string; title: string; owner: string; createdAt: string; sourceCount: number;
 sourceBytes: number; selectedDecisions: number; decisionRevisions: number; receivingHistory: number;
 originalArchive?: { sha256: string; bytes: number }; historyScope?: string;
 sources: { id: string; sha256: string; bytes: number; title: string; site: string; family: string;
  model: string; timezone: string; timestamps: number; columns: number; provenance: JsonObject }[];
}
export interface WeatherHandoverInspection {
 value: WeatherHandover; packageSha256: string; contentSha256: string;
 captures: WeatherCaptureSource[]; decisions: WeatherDecision[]; review: WeatherHandoverReview;
}
export interface WeatherReceivingPlan {
 sites: WeatherSite[];
 requests: { id: string; spec: WeatherRequestSpec; specSha256: string }[];
 captures: WeatherCaptureSource[]; decisions: WeatherDecision[]; report: WeatherReport; mapping: WeatherReceivingMapping;
}
export const WEATHER_HANDOVER_SCHEMA: 'stellar-forge.weather-report-handover.v1';
export const MAX_HANDOVER_BYTES: number;
export const MAX_LEGACY_ARCHIVE_BYTES: number;
export function createWeatherHandover(input: {
 originId: string; report: WeatherReport; captures: WeatherCaptureSource[]; decisionHistory?: WeatherDecision[];
 receivingHistory?: WeatherReceivingRecord[]; legacyArchive?: WeatherOriginalArchive;
}): WeatherHandover;
export function inspectWeatherHandover(content: string): WeatherHandoverInspection;
export function prepareWeatherReceiving(inspection: WeatherHandoverInspection): WeatherReceivingPlan;
export function weatherReceivingIdentity(originId: string,packageSha256: string): string;
