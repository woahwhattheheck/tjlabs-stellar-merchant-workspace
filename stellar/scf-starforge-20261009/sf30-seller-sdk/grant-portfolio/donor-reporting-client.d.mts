/** Period-specific donor statements through original programme records and immutable publication. */
import type {ProgrammeId,ProgrammeReportFields,ProgrammeRecord,ProgrammeEnvelope} from './programme-client.mjs';
import type {GrantPortfolioClient,PortfolioSelection,ActionOptions,RequestOptions,RetainedRequest,JsonObject} from './client.mjs';
export interface DonorFinancialLine {
  id:ProgrammeId;title:string;sourceIds:string[];kind:string;currency:string;dimensions:Record<string,string>;
  dateMode:'point'|'contained-period';datePointer:string;endPointer:string|null;basis:string;
}
export interface DonorControlTotal {groupId:string;amount:string;basis:string;}
export interface DonorExclusion {sourceId:string;rowKey:string;sha256:string;reason:string;}
export interface DonorSelection {
  schema:'stellar-forge.grant-donor-selection.v1';agreementId:ProgrammeId|null;
  supersedesReportId:ProgrammeId|null;correctionReason:string;lines:DonorFinancialLine[];
  indicatorIds:ProgrammeId[];resultMode:'period-contained'|'cumulative';
  controlTotals:DonorControlTotal[];exclusions:DonorExclusion[];reviewNote:string;
}
export interface DonorReportRead extends ProgrammeEnvelope {
  report:ProgrammeRecord<'reports'>;frozen:boolean;statement:JsonObject & {
    schema:'stellar-forge.grant-donor-statement.v1';reportId:ProgrammeId;sha256:string;
  };
}
export declare const DONOR_SELECTION_SCHEMA:'stellar-forge.grant-donor-selection.v1';
export declare const DONOR_STATEMENT_SCHEMA:'stellar-forge.grant-donor-statement.v1';
export declare function donorSelection(input?:Partial<Omit<DonorSelection,'schema'>>):DonorSelection;
export declare function donorFinancialLine(input:Omit<DonorFinancialLine,'id'|'dimensions'|'dateMode'|'datePointer'|'endPointer'> &
  Partial<Pick<DonorFinancialLine,'id'|'dimensions'|'dateMode'|'datePointer'|'endPointer'>>):DonorFinancialLine;
export declare function saveDonorReport(client:GrantPortfolioClient,operationId:string,selection:PortfolioSelection,
  input:{actor:string;fields:Partial<ProgrammeReportFields>;record?:ProgrammeRecord<'reports'>|null;id?:ProgrammeId},
  options?:ActionOptions):Promise<RetainedRequest>;
export declare function correctionReport(original:ProgrammeRecord<'reports'>,
  input:{title?:string;owner?:string;dueDate?:string;reason:string;id?:ProgrammeId}):
  {id:ProgrammeId;fields:ProgrammeReportFields};
export declare function readDonorReport(client:GrantPortfolioClient,
  selection:PortfolioSelection & {id:ProgrammeId},options?:RequestOptions):Promise<DonorReportRead>;
