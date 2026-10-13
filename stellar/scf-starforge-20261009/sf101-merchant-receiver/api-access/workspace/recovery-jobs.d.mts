/** Exact retained request interface for the API customer recovery journal. */
/** Complete original application binding retained inside the encrypted recovery record. */
export interface OriginalFile {path:string;bytes:number;sha256:Sha256;}
export interface RecoveryProfile {
  schema:"stellar-forge.sf101.api-customer-recovery.v1"; source:RecoverySource;
  stateRoot:string; configFile:string; configSha256:Sha256; directory:string; workspaceId:string;
  revision:number; workspaceSha256:Sha256; authority:Record<string,unknown>; claimEnvs:string[];
  profiles:Array<{id:string;orderReference:string;manifestSha256:Sha256;mode:string;archived:boolean;replacesProfileId:string|null}>;
  callCount:number;taskCount:number;
  unresolvedTasks:Array<{id:string;kind:string;status:string;profileId:string;callId:string|null}>;
  retainedInputs:OriginalFile[]; selectedPaths:string[]; missingPaths:string[];
  agent:null|{directory:string;members:Array<OriginalFile&{name:string}>;sha256:Sha256};
  reviewSha256:Sha256;
}
export interface RecoveryApplication {
  schema:"stellar-forge.sf101.api-customer-recovery.v1";operationId:RequestId;profile:RecoveryProfile;
}
/** Original SF88 result members remain available without narrowing away provider evidence. */
export interface RecoveryResult {
  [key:string]:unknown;
  status:string;recordSha256:Sha256;application:RecoveryApplication;
  bundle:string;encryptedFiles:EncryptedFile[];executionStarted:false;
  publicationRecovered?:true;originalStateRetained?:true;
}
export interface RecoveryReview {
  schema:"stellar-forge.sf101.api-customer-recovery.v1";profile:RecoveryProfile;
  native:Record<string,unknown>;executionStarted:false;
  prerequisites:{customerStopped:true;otherWritersMustBeQuiesced:true;environmentNames:string[];runtime:unknown};
}
export interface RestoredCustomerSelection {
  schema:"stellar-forge.sf101.api-customer-recovery.v1";configFile:string;
  expectedConfigSha256:Sha256;expectedWorkspaceSha256:Sha256;workspaceId:string;revision:number;
  approvalMode:"terminal";agentDirectory?:string;expectedAgentSetupSha256?:Sha256;
  recordSha256:Sha256;existingOnly:true;executionStarted:false;
}

export type Sha256 = string;
export type RequestId = string;
export type Environment = Record<string, string | undefined>;
export type Json = null | boolean | number | string | Json[] | { [key:string]: Json };
export interface RecoverySource { configFile:string; stateRoot:string; agentDirectory?:string; }
export interface SnapshotOptions {
  output:string; expectedReviewSha256:Sha256; passEnv?:string; quiesced:true;
}
export interface VerifyOptions { bundle:string; passEnv?:string; python?:string; }
export interface RestoreOptions {
  /** Completed VERIFY request in this exact journal. */
  verifiedRequestId:RequestId; expectedStateRoot:string; passEnv?:string; python?:string;
}
export type RecoveryStart =
  | {requestId?:RequestId; kind:"SNAPSHOT"; options:SnapshotOptions}
  | {requestId?:RequestId; kind:"VERIFY"; options:VerifyOptions}
  | {requestId?:RequestId; kind:"RESTORE"; options:RestoreOptions};
export type RecoveryState = "RUNNING" | "CANCELLING" | "COMPLETED" | "FAILED" | "CANCELLED" | "UNFINISHED" | "RETURN_PENDING";
export interface RecoveryError { code:string; }
export interface RecoveryProgress { observedAt:string; [key:string]:unknown; }
export interface RecoveryOperation<R = RecoveryResult> {
  schema:typeof API_PASS_RECOVERY_OPERATION_SCHEMA; requestId:RequestId;
  kind:"SNAPSHOT"|"VERIFY"|"RESTORE";
  options:(SnapshotOptions|VerifyOptions|RestoreOptions)&{passEnv:string};
  createdAt:string; state:RecoveryState; result:R|null; error:RecoveryError|null;
  progress:RecoveryProgress[]; persistenceError:string|null; completedAt:string|null;
  /** No customer API request, purchase, or queue execution is dispatched. */
  executionStarted:false; reused?:boolean;
}
export interface EncryptedFile {name:string; path:string; bytes:number; sha256:Sha256;}
export interface RecoveryListResult {
  status?:string; recordSha256?:Sha256; workspaceId?:string; revision?:number;
  bundle?:string; encryptedFileCount?:number; executionStarted:false;
}
export interface RecoveryList {
  schema:typeof API_PASS_RECOVERY_OPERATION_SCHEMA; directory:string; sourceConfigured:boolean;
  offset:number; limit:number; total:number; nextOffset:number|null;
  items:Array<RecoveryOperation<RecoveryListResult>>; activeRequestId:RequestId|null;
}
export interface EncryptedFiles {
  requestId:RequestId; recordSha256:Sha256; bundle:string; files:EncryptedFile[];
}
export interface EncryptedFilePage {
  requestId:RequestId; name:string; offset:number; bytes:number; totalBytes:number;
  sha256:Sha256; chunkSha256:Sha256; base64:string; nextOffset:number|null; recordSha256:Sha256;
}
export interface RecoveryJournal {
  readonly directory:string; readonly source:RecoverySource|null; readonly journalId:string;
  readonly busy:boolean;
  review():Promise<RecoveryReview>;
  start(request:RecoveryStart):Promise<RecoveryOperation>;
  /** Resume the immutable original request, including its original options. */
  resume(requestId:RequestId):Promise<RecoveryOperation>;
  inspect(requestId:RequestId):Promise<RecoveryOperation>;
  list(options?:{offset?:number; limit?:number}):Promise<RecoveryList>;
  wait(requestId:RequestId):Promise<RecoveryOperation>;
  cancel(requestId:RequestId):Promise<RecoveryOperation>;
  /** Verifies restored pins and returns a launch selection; does not launch it. */
  openResult(requestId:RequestId):Promise<RestoredCustomerSelection>;
  encryptedFiles(requestId:RequestId):Promise<EncryptedFiles>;
  readEncryptedFile(requestId:RequestId,options:{name:string;offset?:number;limit?:number}):Promise<EncryptedFilePage>;
  /** Drains active work and persists a known native return before releasing its lease. */
  close():Promise<void>;
}
export declare const API_PASS_RECOVERY_OPERATION_SCHEMA:"stellar-forge.sf101.api-customer-recovery-operation.v1";
export declare function openApiPassRecovery(options:{
  directory:string; source?:RecoverySource; environment?:Environment;
}):Promise<RecoveryJournal>;
