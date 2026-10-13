/** MIT. Operator-supplied CSV mapping, immutable import plans and application exchange. */
import type {GrantPortfolioClient,JsonObject,OperationId,PortfolioId,PortfolioSaveInput,
  RequestOptions,RetainedRequest,Sha256} from "./client.mjs";
import type {AwardId} from "./awards-client.mjs";
export interface AwardCsvMapping {
  reference:string;title:string;legalName:string;partnerKey:string;projectKey?:string;
  profile?:Partial<Record<'organisationIdentifier'|'contactName'|'contactEmail'|'country'|'summary',string>>;
  amount?:string;currency?:string;answers:Record<string,string>;notes?:string;submittedDate?:string;
}
export interface AwardCsvIdentities {
  applications:Record<string,AwardId>;partners:Record<string,AwardId>;projects?:Record<string,AwardId>;
}
export interface AwardCsvImportInput {
  operationId:OperationId;csv:Uint8Array;filename:string;documentId:AwardId;roundId:AwardId;actor:string;
  mapping:AwardCsvMapping;identities:AwardCsvIdentities;status?:'draft'|'submitted';
  /** Optional explicit zero-based data-row selection; the complete CSV stays attached. */
  rowIndexes?:number[];
}
export interface AwardCsvImportPlan {
  schema:'stellar-forge.awards-csv-import-plan.v1';
  portfolio:{id:PortfolioId;revision:number;snapshot:Sha256};
  source:{sha256:Sha256;bytes:number;filename:string;contentType:'text/csv'};
  documentId:AwardId;round:{id:AwardId;revision:number;sha256:Sha256};
  rows:number;mapping:AwardCsvMapping;actionSha256:Sha256;sourceRows?:number;rowIndexes?:number[];
  action:{operationId:OperationId;action:'portfolio.save';payload:PortfolioSaveInput};
}
export interface AwardApplicationExchange {
  schema:'stellar-forge.awards-exchange-file.v1';portfolioId:PortfolioId;revision:number;snapshot:Sha256;awardsRevision:number;
  format:'json'|'csv';contentType:'application/json'|'text/csv';spreadsheetSafe:boolean;rows:number;
  bytes:Uint8Array;sha256:Sha256;
}
export declare function parseAwardCsvText(text:string):{headers:string[];rows:Record<string,string>[]};
export declare function prepareAwardCsvImport(portfolio:JsonObject,input:AwardCsvImportInput):AwardCsvImportPlan;
export declare function submitAwardCsvImport(client:GrantPortfolioClient,plan:AwardCsvImportPlan,csv:Uint8Array,
  options?:RequestOptions):Promise<RetainedRequest>;
export declare function exportAwardApplications(portfolio:JsonObject,
  options?:{roundId?:AwardId;format?:'json'|'csv';spreadsheetSafe?:boolean}):AwardApplicationExchange;
