export declare const FRED_DDP_PROJECT_COMMANDS: readonly [
  'ddp-sources', 'ddp-crosswalk', 'ddp-crosswalk-file', 'ddp-crosswalk-import', 'ddp-crosswalk-acquire',
  'ddp-package', 'ddp-package-file', 'ddp-package-import',
  'ddp-migration-preview', 'ddp-migration-save', 'ddp-migration', 'ddp-migration-file', 'ddp-migration-acquire',
  'ddp-receiving', 'ddp-receiving-file'
];
export declare const FRED_DDP_PROJECT_USAGE: string;
/** Runs one native command; acquisition cancellation retains the original operation and batch progress. */
export declare function runFredDdpProjectCommand(args: string[]): Promise<unknown>;
export declare function main(args?: string[]): Promise<unknown>;
