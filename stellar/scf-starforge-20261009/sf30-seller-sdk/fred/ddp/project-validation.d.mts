import type { FredDdpCrosswalkCapture, FredDdpCrosswalkModel } from './crosswalk.mjs';
import type { FredDdpPackageCapture, FredDdpPackageModel } from './package.mjs';
import type { FredDdpMigrationPlan } from './migration.mjs';
import type { FredDdpReceiving } from './receiving.mjs';
import type { FredDdpReceivingFileManifest } from './receiving-report.mjs';
import type {
  FredDdpCrosswalkSummary, FredDdpPackageSummary, FredDdpMigrationSummary,
  FredDdpReceivingCoreSummary, FredDdpReceivingSummary, FredDdpProjectFamilyState, FredDdpMigrationInput
} from './project-types.mjs';

export declare const FRED_DDP_PROJECT_BUNDLE: 'stellar-forge.fred-project-bundle.v5';
export declare const FRED_DDP_PROJECT_BUNDLE_MAX_BYTES: number;
export declare const FRED_DDP_PROJECT_KEYS: ReadonlyArray<'ddpCrosswalks' | 'ddpPackages' | 'ddpMigrations' | 'ddpReceivings'>;
export declare function fredDdpStatePresent(state: FredDdpProjectFamilyState): boolean;
export declare function fredDdpSourceSummary(kind: 'crosswalk', capture: FredDdpCrosswalkCapture,
  model?: FredDdpCrosswalkModel): FredDdpCrosswalkSummary;
export declare function fredDdpSourceSummary(kind: 'package', capture: FredDdpPackageCapture,
  model?: FredDdpPackageModel): FredDdpPackageSummary;
export declare function fredDdpMigrationSummary(plan: FredDdpMigrationPlan): FredDdpMigrationSummary;
export declare function fredDdpReceivingCoreSummary(receiving: FredDdpReceiving): FredDdpReceivingCoreSummary;
export declare function fredDdpReceivingSummary(receiving: FredDdpReceiving,
  manifest: FredDdpReceivingFileManifest): FredDdpReceivingSummary;
export declare function fredDdpMigrationPreviewIdentity(projectId: string, migrationId: FredDdpMigrationPlan['id']): string;
export declare function fredDdpMigrationSavePayload(projectId: string, plan: FredDdpMigrationPlan):
  FredDdpMigrationInput & { previewId: string };
export declare function validateFredDdpProjectState<T>(state: T): T & FredDdpProjectFamilyState;
export interface FredDdpProjectBundleGraph {
  state: unknown;
  captures: unknown;
  ddpCrosswalks: unknown;
  ddpPackages: unknown;
  ddpMigrations: unknown;
  ddpReceivings: unknown;
}
/** Fully rebuild the DDP source/plan/receiving graph and its original operation chronology. */
export declare function validateFredDdpProjectBundle(input: FredDdpProjectBundleGraph): true;
