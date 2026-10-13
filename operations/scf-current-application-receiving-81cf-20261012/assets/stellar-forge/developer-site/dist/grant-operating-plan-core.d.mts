import type { OperatingPlan, OperatingRegistration } from
  '../../../stellar/scf-starforge-20261009/distribution/discovery/operating-plan.mjs';
export const GRANT_OPERATING_SELECTION_SCHEMA: 'stellar-forge.grant-operating-selection.v1';
export const GRANT_OPERATING_PREPARATION_SCHEMA: 'stellar-forge.grant-operating-preparation.v1';
export interface NativeGrantPlanningSource {
  schema: 'stellar-forge.grant-plan-source.v1'; sha256: string; filename: string;
  receivedAt: string; bytes: number; base64: string; kind: 'json' | 'zip';
  document: { id: string; name: string; currentRevision: number; revisions: Array<Record<string, any>> };
}
export interface NativeGrantPlanningReview {
  schema: 'stellar-forge.grant-plan-review.v1'; sourceSha: string; revision: number;
  costIds: string[]; note: string; previewText: string; previewBasis: string;
  summaryReviewed: boolean; applications: Array<Record<string, unknown>>;
  operatingSelection?: GrantOperatingSelection;
}
export interface GrantOperatingSelection {
  schema: typeof GRANT_OPERATING_SELECTION_SCHEMA; sourceSha256: string; revision: number;
  title: string; customer: string; purpose: string; owner: string; receiving: string; notes: string;
  bindings: Record<string, OperatingRegistration | null>; prepared: GrantOperatingPreparation[];
}
export interface GrantOperatingPreparation {
  schema: typeof GRANT_OPERATING_PREPARATION_SCHEMA;
  source: { filename: string; sha256: string; bytes: number; planId: string; planName: string;
    revision: number; contentSha256: string; scenarioSourceSha256: string; scenarioCalculationSha256: string };
  packageIds: string[];
  totals: { plannedUsd: string; estimatedHours: string | null; awardRequestUsd: string; projectEndDay: number };
  plan: OperatingPlan;
}
export function newGrantOperatingSelection(source: NativeGrantPlanningSource, revision?: number): GrantOperatingSelection;
export function validateGrantOperatingSelection(value: unknown, source: NativeGrantPlanningSource, revision: number): GrantOperatingSelection;
export function grantOperatingSelectionOf(review: NativeGrantPlanningReview, source: NativeGrantPlanningSource): GrantOperatingSelection;
export function prepareGrantOperatingPlan(source: NativeGrantPlanningSource, review: NativeGrantPlanningReview,
  options: { id: string; savedAt?: string; selection?: GrantOperatingSelection }): GrantOperatingPreparation;
