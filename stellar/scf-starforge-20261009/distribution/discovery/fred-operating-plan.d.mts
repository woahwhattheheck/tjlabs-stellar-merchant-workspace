import type { CommandCatalog } from './catalog.mjs';
import type { OperatingPlan, OperatingStepState } from './operating-plan.mjs';

export const FRED_OPERATING_SOURCE_SCHEMA: 'stellar-forge.fred-operating-source.v1';
export const FRED_OPERATING_PHASES: readonly [
  'sources','acquisition','review','recurring','releases','migration','historical','publications','customer','handover'
];
export type FredOperatingPhase = typeof FRED_OPERATING_PHASES[number];
export interface FredOperatingArtifact { path: string; bytes: number; sha256: string }
export interface FredOperatingSource {
  schema: typeof FRED_OPERATING_SOURCE_SCHEMA;
  id: string;
  capturedAt: string;
  project: {
    id: string; title: string; revision: number; createdAt: string;
    selection: Record<string, unknown>; bundleSha256: string;
  };
  artifact: FredOperatingArtifact;
  history: Array<{ revision: number; sha256: string }>;
  inventory: Record<string, unknown>;
  published: Array<{
    id: string; view: Record<string, unknown>; artifact: FredOperatingArtifact | null;
  }>;
  evidence: Array<{ id: string; kind: string; reference: string; artifact: FredOperatingArtifact }>;
}
export interface CreateFredOperatingPlanOptions {
  source: FredOperatingSource;
  catalog?: CommandCatalog;
  id: string;
  title?: string; customer?: string; owner?: string; period?: string; savedAt?: string;
  registrations?: Partial<Record<FredOperatingPhase, string>>;
  argvByPhase?: Partial<Record<FredOperatingPhase, string[]>>;
}
export interface RecordFredOperatingResultOptions {
  source: FredOperatingSource;
  stepId: string;
  status: OperatingStepState;
  result: { summary: string; evidenceIds: string[] };
  owner?: string;
  savedAt?: string;
}
/** Validate shape and return an independent complete descriptor; native receiving verifies all original bytes and hashes. */
export function inspectFredOperatingSource(value: unknown): FredOperatingSource;
/** Create ten ordinary editable procedure steps against the actual selected catalog registrations. */
export function createFredOperatingPlan(options: CreateFredOperatingPlanOptions): OperatingPlan;
/** Append to the latest plan only for the original project/history prefix, preserving customer edits and past outcomes. */
export function recordFredOperatingResult(plan: OperatingPlan, options: RecordFredOperatingResultOptions): OperatingPlan;

/** Require the carried procedure and source to share the original economic project history. */
export function inspectFredOperatingPlanSource(plan: OperatingPlan, source: FredOperatingSource): { plan: OperatingPlan; source: FredOperatingSource };
