import type { FredReleaseCapture, FredReleaseSelection, FredReleaseCalendarRow, FredReleaseVintageRow } from './model.mjs';
import type { FredReleaseWatch, FredReleaseWatchId } from './watch.mjs';
export declare const FRED_RELEASE_PLAN: 'stellar-forge.fred-release-plan.v1';
export type FredReleasePlanId = `fred-release-plan-${string}`;
export interface FredReleaseInterval { start: string; end: string }
export interface FredReleaseCoverage {
  baselineAsOf: string; start: string | null; end: string; complete: boolean; missingSpans: FredReleaseInterval[];
  calendar: { before: FredReleaseInterval | null; after: FredReleaseInterval };
  vintages: { before: FredReleaseInterval | null; after: FredReleaseInterval };
}
export type FredCalendarChangeKind = 'INITIAL_CALENDAR_DATE' | 'RELEASE_ENTERED_SELECTION' | 'ADDED_CALENDAR_DATE' |
  'ENTERED_CALENDAR_COVERAGE' | 'CALENDAR_DETAILS_CHANGED' | 'RELEASE_LEFT_SELECTION' | 'REMOVED_CALENDAR_DATE' | 'LEFT_CALENDAR_COVERAGE';
export interface FredReleaseCalendarChange {
  kind: FredCalendarChangeKind; releaseId: number; date: string;
  before: FredReleaseCalendarRow | null; after: FredReleaseCalendarRow | null;
}
export type FredVintageChangeKind = 'INITIAL_VINTAGE_DATE' | 'LATE_DISCOVERED_VINTAGE' | 'ENTERED_VINTAGE_COVERAGE' |
  'VINTAGE_NO_LONGER_RETURNED' | 'LEFT_VINTAGE_COVERAGE';
export interface FredReleaseVintageChange {
  kind: FredVintageChangeKind; series: string; date: string; before: FredReleaseVintageRow | null; after: FredReleaseVintageRow | null;
}
export type FredReleaseAcquisitionReason = 'NEW_VINTAGE' | 'KNOWN_UNCOMPLETED_VINTAGE' | 'NEWLY_COVERED_VINTAGE' |
  'LATE_DISCOVERED_VINTAGE' | 'SOURCE_UPDATE_RECHECK';
export interface FredReleaseEvent {
  series: string; date: string; kind: FredVintageChangeKind | 'RETAINED_VINTAGE_DATE';
  reasons: FredReleaseAcquisitionReason[]; completed: boolean;
}
export interface FredReleaseObservationSelection {
  schema: 'stellar-forge.fred-selection.v1'; series: string[]; asOf: string; start: string; end: string;
  pageSize: number; maxRows: number;
}
export interface FredReleaseAcquisition {
  asOf: string; changedSeries: string[]; triggerVintageDates: string[];
  reasons: FredReleaseAcquisitionReason[]; selection: FredReleaseObservationSelection;
}
export interface FredReleaseMeaningChange {
  series: string; field: string; before: unknown; after: unknown; basis: 'previous_capture' | 'watch_template';
}
export interface FredReleaseSourceChange { series: string; field: string; before: unknown; after: unknown }
export interface FredReleaseScheduleRow extends FredReleaseCalendarRow {
  phase: 'UPCOMING_CALENDAR_DATE' | 'PUBLISHED_CALENDAR_DATE';
}
export interface FredReleasePlanSummary {
  series: number; releases: number; calendarDates: number; vintageDates: number; calendarChanges: number;
  vintageChanges: number; lateDiscoveredVintages: number; observationAcquisitions: number;
  completedAsOf: number; meaningChanges: number; completeCatchUpCoverage: boolean;
}
export interface FredReleasePlan {
  schema: 'stellar-forge.fred-release-plan.v1'; id: FredReleasePlanId; watchId: FredReleaseWatchId; watch: FredReleaseWatch;
  beforeCaptureSha256: string | null; afterCaptureSha256: string; metadataAsOf: string; completedAsOf: string[];
  coverage: FredReleaseCoverage; requiredSourceSelections: FredReleaseSelection[];
  meaningChanges: FredReleaseMeaningChange[]; sourceChanges: FredReleaseSourceChange[];
  calendarChanges: FredReleaseCalendarChange[]; vintageChanges: FredReleaseVintageChange[]; events: FredReleaseEvent[];
  acquisitions: FredReleaseAcquisition[]; schedule: FredReleaseScheduleRow[]; summary: FredReleasePlanSummary;
}
export type FredReleasePlanSection = 'acquisitions' | 'calendarChanges' | 'vintageChanges' | 'events' | 'schedule';
export interface FredReleasePlanPage {
  id: FredReleasePlanId; watchId: FredReleaseWatchId; beforeCaptureSha256: string | null; afterCaptureSha256: string;
  metadataAsOf: string; summary: FredReleasePlanSummary; coverage: FredReleaseCoverage;
  section: FredReleasePlanSection; offset: number; limit: number; count: number; nextOffset: number | null;
  rows: Array<FredReleaseAcquisition | FredReleaseCalendarChange | FredReleaseVintageChange | FredReleaseEvent | FredReleaseScheduleRow>;
}
export declare function planFredReleaseCatchUp(input: {
  watch: FredReleaseWatch; before?: FredReleaseCapture | null; after: FredReleaseCapture; completedAsOf?: string[];
}): FredReleasePlan;
export declare function validateFredReleasePlan(input: unknown,
  context?: { before?: FredReleaseCapture | null; after: FredReleaseCapture }): FredReleasePlan;
export declare function pageFredReleasePlan(plan: FredReleasePlan,
  options?: { section?: FredReleasePlanSection; offset?: number; limit?: number }): FredReleasePlanPage;
