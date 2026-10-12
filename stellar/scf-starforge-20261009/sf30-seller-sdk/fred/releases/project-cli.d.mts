// MIT. The original fred dispatcher calls this runner without duplicate printing.
export declare const FRED_RELEASE_PROJECT_COMMANDS: readonly [
  'release-captures', 'release-source', 'release-import', 'release-acquire',
  'release-watches', 'release-watch-save', 'release-plan-preview', 'release-plan-save',
  'release-plan', 'release-plan-file', 'release-vintage-acquire',
];
export declare const FRED_RELEASE_PROJECT_USAGE: string;
/** Installs and cleans up source acquisition cancellation for both installed and standalone callers. */
export declare function runFredReleaseProjectCommand(args: string[]): Promise<unknown>;
export declare function main(args?: string[]): Promise<unknown>;
export type {
  FredReleaseProjectApi, FredReleaseProjectState, FredReleaseCaptureSummary,
  FredReleasePlanSummary, FredReleaseCatchUp, FredReleaseCaptureInventory,
  FredReleaseWatchInventory, FredReleasePlanPreview, FredReleasePlanView,
  FredReleasePlanFile, FredReleaseCaptureResult, FredReleaseWatchResult,
  FredReleasePlanResult, FredPlannedVintageResult, FredReleaseProjectBundleV4,
} from './project-types.mjs';
