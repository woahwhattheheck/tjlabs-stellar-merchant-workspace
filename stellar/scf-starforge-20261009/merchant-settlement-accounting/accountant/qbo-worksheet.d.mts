/** Source-bound buyer allocation worksheets. No workspace or provider writes. */
export interface QboWorksheetBinding {
  workspaceId:string;sourcesSha256:string;handoffId:string;handoffSha256:string;
  accountantRevisionId:string|null;accountantRevisionSha256:string|null;
  sourceRowsSha256:string;companySha256:string;realmId:string;companyName:string;
  baseCurrency:string;environment:'sandbox'|'production';
}
export interface QboWorksheetContext {
  handoff:unknown;revision?:unknown|null;
  workspaceBinding:{workspaceId:string;sourcesSha256:string};
  companySnapshot:unknown;environment:'sandbox'|'production';
}
export interface QboWorksheetRow {
  rowId:string;decision:'pending'|'include'|'exclude';amount:string;
  debitAccountId:string;creditAccountId:string;valuationNote:string;reason:string;description:string;
}
export interface QboWorksheetDraft {valuationBasis:string;rows:QboWorksheetRow[]}
export interface QboWorksheet {
  schema:'stellar-forge.qbo-allocation-worksheet.v1';id:string;createdAt:string;
  binding:QboWorksheetBinding;columns:string[];sourceCount:number;base:QboWorksheetDraft;
  integrity:{sha256:string};
}
export interface QboWorksheetAccountReference {companySha256:string;realmId:string;csvText:string;csvSha256:string;csvBytes:number}
export interface QboWorksheetExport {worksheet:QboWorksheet;csvText:string;csvSha256:string;csvBytes:number;accountReference:QboWorksheetAccountReference}
export interface QboWorksheetResolution {id:string;choice:'current'|'returned'}
export interface QboWorksheetIssue {
  code:string;message:string;rowId?:string;rowIds?:string[];field?:string;fields?:string[];
  rowNumber?:number|null;lineNumber?:number|null;
}
export interface QboWorksheetConflict {
  id:string;rowId:string;field:string;base:string;current:string;returned:string;
  choice:'current'|'returned'|null;
}
export interface QboWorksheetChange {
  rowId:string;field:string;base:string;current:string;returned:string;value:string;
  status:'CURRENT'|'SAME'|'RETURNED'|'CONFLICT'|'RESOLVED_CURRENT'|'RESOLVED_RETURNED';
  id?:string;choice?:'current'|'returned'|null;
}
export interface QboWorksheetPreview {
  schema:'stellar-forge.qbo-allocation-worksheet-preview.v1';worksheetId:string;worksheetSha256:string;
  binding:QboWorksheetBinding;csv:{sha256:string;bytes:number};currentDraftSha256:string;
  resolutions:QboWorksheetResolution[];
  summary:{allocations:number;included:number;excluded:number;pending:number;changedRows:number;changedFields:number;
    conflicts:number;unresolved:number;sourceIssues:number};
  readyToAdopt:boolean;readyForPlan:boolean;sourceIssues:QboWorksheetIssue[];
  draftIssues:QboWorksheetIssue[];changes:QboWorksheetChange[];conflicts:QboWorksheetConflict[];
  candidate:QboWorksheetDraft|null;integrity:{sha256:string};
}
export const QBO_WORKSHEET_SCHEMA:'stellar-forge.qbo-allocation-worksheet.v1';
export const QBO_WORKSHEET_PREVIEW_SCHEMA:'stellar-forge.qbo-allocation-worksheet-preview.v1';
export const QBO_WORKSHEET_CSV_BYTES:number;
export const QBO_WORKSHEET_FIELDS:readonly string[];
export const QBO_WORKSHEET_COLUMNS:readonly string[];
export function createQboWorksheet(value:QboWorksheetContext&{id:string;createdAt:string;draft:QboWorksheetDraft}):QboWorksheetExport;
export function validateQboWorksheet(worksheet:QboWorksheet,context:QboWorksheetContext):{rows:unknown[];binding:QboWorksheetBinding};
export function openQboWorksheet(value:QboWorksheetContext&{worksheet:QboWorksheet}):QboWorksheetExport;
export function inspectQboWorksheet(value:QboWorksheetContext&{
  worksheet:QboWorksheet;csvBytes:string|Uint8Array;currentDraft:QboWorksheetDraft;resolutions?:QboWorksheetResolution[];
}):QboWorksheetPreview;
export function qboWorksheetSelections(draft:QboWorksheetDraft):{
  valuationBasis:string;
  rows:Array<{rowId:string;decision:'exclude';reason:string}|{
    rowId:string;decision:'include';amount:string;debitAccount:{value:string};creditAccount:{value:string};
    valuationNote:string;description:string;
  }>;
};
