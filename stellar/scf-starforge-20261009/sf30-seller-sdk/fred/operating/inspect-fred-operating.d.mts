import type { FredOperatingArchiveFile } from './archive.mjs';
export declare const MAX_FRED_OPERATING_INSPECTION_JSON_BYTES: number;
export interface FredOperatingInspectionReceipt {
  schema: 'stellar-forge.fred-operating-inspection-receipt.v1';
  archive: FredOperatingArchiveFile;
  result: { bytes: number; sha256: string };
}
export declare function runFredOperatingInspectionCli(argv?: string[]): Promise<FredOperatingInspectionReceipt>;
