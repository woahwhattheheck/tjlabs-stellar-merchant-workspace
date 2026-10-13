// MIT. Complete weather report renewal contract.
import type {JsonObject,WeatherCaptureDescriptor,WeatherCaptureSource,WeatherDecision,WeatherReport,WeatherRenewalRecord} from './portable.mjs';
export interface WeatherRenewalEntry {
 decisionId: string; expectedRevision: number; captureId: string; startUtc: string; endUtc: string;
 disposition: WeatherDecision['disposition']; notes?: string;
}
export interface WeatherRenewalSelection {
 reportId: string; expectedReportSha256: string; title: string; owner: string; notes?: string;
 entries: WeatherRenewalEntry[];
}
export interface WeatherRenewalComparison {
 previousOutcome: string; nextOutcome: string; outcomeChanged: boolean;
 previousAggregate: number | null; nextAggregate: number | null; previousUnit: string; nextUnit: string;
 previousEligibleMembers: number; nextEligibleMembers: number; windowChanged: boolean;
 ruleChanges: string[]; localRuleRevision: number; sourceChanged: boolean; modelChanged: boolean; gridChanged: boolean;
 previousModel: string; nextModel: string; previousGrid: JsonObject; nextGrid: JsonObject;
 previousRetrievedAt: string; nextRetrievedAt: string; sameUtcWindow: boolean; meaning: string;
}
export interface WeatherRenewalReview {
 schema: 'stellar-forge.weather-report-renewal-review.v1';
 selection: WeatherRenewalSelection; sourceReport: WeatherRenewalRecord['sourceReport'];
 entries: { baseline: WeatherDecision; ruleSource: WeatherDecision; proposed: Omit<WeatherDecision,'createdAt'>;
  source: Omit<WeatherCaptureDescriptor,'requestId'>; comparison: WeatherRenewalComparison }[];
 selectionSha256: string; reviewSha256: string;
 summary: { decisions: number; sources: number; changedOutcomes: number; changedSources: number; insufficientCoverage: number };
}
export interface WeatherRenewalChoices {
 report: WeatherReport; selection: WeatherRenewalSelection;
 entries: { baseline: WeatherDecision; working: WeatherDecision; candidates: WeatherCaptureDescriptor[];
  selection: WeatherRenewalEntry }[];
}
export interface WeatherRenewalResult {
 schema: 'stellar-forge.weather-report-renewal-result.v1'; reopened: boolean; reviewSha256: string; report: WeatherReport;
}
export interface WeatherRenewalWorkspace {
 renewalChoices(reportId: string): Promise<WeatherRenewalChoices>;
 reviewRenewal(selection: WeatherRenewalSelection): Promise<WeatherRenewalReview>;
 commitRenewal(selection: WeatherRenewalSelection,options: { expectedReviewSha256: string }): Promise<WeatherRenewalResult>;
}
export const WEATHER_RENEWAL_SCHEMA: 'stellar-forge.weather-report-renewal.v1';
export function normalizeWeatherRenewal(input: WeatherRenewalSelection): WeatherRenewalSelection;
export function weatherRenewalSourceMatches(previous: WeatherCaptureDescriptor,next: WeatherCaptureDescriptor,variable: string): boolean;
export function describeWeatherRenewal(baseline: WeatherDecision,current: WeatherDecision,updated: Omit<WeatherDecision,'createdAt'>,
 previousCapture: WeatherCaptureDescriptor,nextCapture: WeatherCaptureDescriptor): WeatherRenewalComparison;
export function reviewWeatherRenewal(input: { originId: string; report: WeatherReport; currentDecisions: WeatherDecision[];
 captures: (WeatherCaptureSource & { view: unknown })[]; input: WeatherRenewalSelection }): WeatherRenewalReview;
export function weatherRenewalRecord(review: WeatherRenewalReview,updated: WeatherDecision[]): WeatherRenewalRecord;
export function validateWeatherRenewal(record: WeatherRenewalRecord | undefined,selected: WeatherDecision[],history: WeatherDecision[]): void;
export function mapWeatherRenewal(record: WeatherRenewalRecord | undefined,
 mapDecision: (reference: { id: string; revision: number }) => WeatherDecision | undefined): WeatherRenewalRecord | undefined;
