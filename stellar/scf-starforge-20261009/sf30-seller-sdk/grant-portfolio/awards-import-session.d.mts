/** MIT. Explicit complete-source application import sessions. */
import type {GrantPortfolioClient,JsonObject,PortfolioId,OperationId,RequestOptions,RetainedRequest,Sha256} from './client.mjs';
import type {AwardCsvImportInput,AwardCsvImportPlan} from './awards-exchange.mjs';
export interface AwardImportPartition {operationId:OperationId;documentId:string;rowIndexes:number[]}
export interface AwardImportSessionInput extends Omit<AwardCsvImportInput,'operationId'|'documentId'|'rowIndexes'> {
  sessionId:string;workspaceId:string;batches:AwardImportPartition[];
}
export interface AwardImportSession {
  schema:'stellar-forge.awards-csv-import-session.v1';sessionId:string;workspaceId:string;sha256:Sha256;
  portfolio:{id:PortfolioId;revision:number;snapshot:Sha256};source:AwardCsvImportPlan['source'];round:AwardCsvImportPlan['round'];
  input:Omit<AwardCsvImportInput,'csv'|'operationId'|'documentId'|'rowIndexes'>;sourceRows:number;
  batches:(AwardImportPartition&{index:number;rows:number;previewActionBytes:number})[];
}
export interface AwardImportSessionBatch {
  schema:'stellar-forge.awards-csv-session-batch.v1';sessionId:string;sessionSha256:Sha256;workspaceId:string;
  index:number;prior:{index:number;operationId:OperationId;requestSha256:Sha256}[];plan:AwardCsvImportPlan;sha256:Sha256;
}
export interface AwardImportSessionObservation {
  schema:'stellar-forge.awards-csv-session-observation.v1';sessionId:string;sessionSha256:Sha256;workspaceId:string;
  portfolioId:PortfolioId;source:AwardCsvImportPlan['source'];sourceRows:number;completedRows:number;
  state:'COMPLETE'|'INCOMPLETE';
  batches:{index:number;operationId:OperationId;rows:number;state:'NOT_ADMITTED'|'RUNNING'|'FAILED'|'COMPLETED';
    request:{id:OperationId;state:string;inputSha256:Sha256;sha256:Sha256;error:JsonObject|null}|null}[];
}
export declare const AWARD_IMPORT_SESSION_SCHEMA:'stellar-forge.awards-csv-import-session.v1';
export declare const AWARD_IMPORT_BATCH_SCHEMA:'stellar-forge.awards-csv-session-batch.v1';
export declare function prepareAwardCsvImportSession(portfolio:JsonObject,input:AwardImportSessionInput):AwardImportSession;
export declare function reviewAwardCsvSessionBatch(client:GrantPortfolioClient,session:AwardImportSession,csv:Uint8Array,
  index:number,options?:RequestOptions):Promise<{batch:AwardImportSessionBatch;request:RetainedRequest|null}>;
export declare function submitAwardCsvSessionBatch(client:GrantPortfolioClient,session:AwardImportSession,batch:AwardImportSessionBatch,
  csv:Uint8Array,options?:RequestOptions&{resumeFailed?:boolean}):Promise<RetainedRequest>;
export declare function inspectAwardCsvImportSession(client:GrantPortfolioClient,session:AwardImportSession,csv:Uint8Array,
  options?:RequestOptions):Promise<AwardImportSessionObservation>;
