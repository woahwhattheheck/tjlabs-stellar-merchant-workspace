import type {RecoverySource,Environment,OriginalFile,Sha256} from "./recovery-jobs.mjs";
export declare const API_PASS_RECOVERY_PROGRAMME_SCHEMA:"stellar-forge.sf101.api-customer-recovery-programme.v1";
export interface ProgrammeBase {
  schema:typeof API_PASS_RECOVERY_PROGRAMME_SCHEMA;operationId:string;
  directory:string;journalDirectory:string;passEnv?:string;python?:string;
}
export type RecoveryProgrammeInput =
 | (ProgrammeBase&{mode:"capture";source:RecoverySource;output:string;quiesced:true})
 | (ProgrammeBase&{mode:"receive";bundle:string;expectedStateRoot:string;
     recipientEdit?:{profileId:string;label:string};browser?:{module:string;executable:string}});
export interface ProgrammeCompletion {
  schema:typeof API_PASS_RECOVERY_PROGRAMME_SCHEMA;operationId:string;inputSha256:Sha256;
  status:"COMPLETED";completedAt:string;workspaceId:string;verifyRequestId:string;recordSha256:Sha256;
  executionStarted:false;artifacts:Array<OriginalFile&{name:string}>;reused?:boolean;
}
export type RecoveryProgrammeResult =
 | (ProgrammeCompletion&{mode:"capture";captureRequestId:string;revision:number;bundle:string;encryptedFileCount:number})
 | (ProgrammeCompletion&{mode:"receive";restoreRequestId:string;baselineRevision:number;currentRevision:number;
     recipientEdit:{profileId:string;label:string}|null;
     browser:{originalStateReceived:true;urlOrigin:string;workspaceId:string}|null;
     originalCustomerReopened:true;coldReopened:true});
export declare function runApiPassRecoveryProgramme(input:RecoveryProgrammeInput,context?:{
 environment?:Environment;
}):Promise<RecoveryProgrammeResult>;
export declare function main(argv?:string[]):Promise<void>;
