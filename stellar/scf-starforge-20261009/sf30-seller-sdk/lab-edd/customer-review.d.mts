import type { LabCustomerReview, LabCustomerFindingTarget, LabResultFolderIdentity } from './received-result.mjs';
export interface LabInspectionRow {
  recordId: string; rowNumber: number; rowSha256: string;
  fields: string[]; values: Record<string,string>; cells?: unknown[];
  line?: number; sourceRowSha256?: string; changes?: unknown[];
}
export interface LabInspectionTable {
  tableId: string; id: string; filename: string; sha256: string; bytes: number;
  headers: string[]; keys: string[]; origin: Record<string,unknown>;
  rows: Array<{ original: LabInspectionRow; reviewed: LabInspectionRow }>;
}
export interface LabCustomerInspection {
  schema: 'starforge.lab-edd-customer-inspection.v1';
  identity: LabResultFolderIdentity;
  families: Array<{
    edition: 'current'|'baseline'; profile: {id:string;version:string};
    source: Record<string,unknown>; tables: LabInspectionTable[];
    originalReport: Record<string,unknown>; report: Record<string,unknown>;
    document: {decisions:unknown[];[key:string]:unknown};
    changes: Record<string,unknown>; nativePreparation: Record<string,unknown>;
  }>;
  reconciliation: null | {comparison:Record<string,unknown>;document:Record<string,unknown>;review:Record<string,unknown>;outputComparison:Record<string,unknown>};
}
export const LAB_CUSTOMER_REVIEW_SCHEMA:'starforge.lab-edd-customer-review.v1';
export const LAB_INSPECTION_SCHEMA:'starforge.lab-edd-customer-inspection.v1';
export function customerCanonical(value:unknown):string;
export function emptyLabCustomerReview(inspection:LabCustomerInspection):LabCustomerReview;
export function customerTarget(inspection:LabCustomerInspection,edition:'current'|'baseline',tableId:string,recordId:string,field?:string|null):LabCustomerFindingTarget;
export function normalizeLabCustomerReview(inspection:LabCustomerInspection,input:unknown):LabCustomerReview;
/** Pass the complete return from the maintained readLabResult verifier. */
export function inspectLabCustomerResult(result:Record<string,any>,identity:LabResultFolderIdentity):LabCustomerInspection;
