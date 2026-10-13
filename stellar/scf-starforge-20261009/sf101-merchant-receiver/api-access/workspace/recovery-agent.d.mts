import type {GeneratedRecoveryAgent,ManualRecoveryAgent,RetainedManualAgentSelection,OriginalFile} from './recovery-jobs.mjs';
export declare const API_PASS_MANUAL_AGENT_RECOVERY_SCHEMA:"stellar-forge.sf101.api-pass-manual-agent-recovery.v1";
export declare function inspectApiPassRecoveryAgent(options:{
 directory:string;workspaceDirectory:string;workspaceId:string;stateRoot:string;
 map?:(path:string)=>string;signal?:AbortSignal;
 include?:(path:string,options?:{missing?:boolean;expected?:{bytes?:number;sha256:string}})=>Promise<OriginalFile|null|unknown>;
}):Promise<GeneratedRecoveryAgent|ManualRecoveryAgent>;
export declare function reopenApiPassRecoveryAgent(retained:GeneratedRecoveryAgent|ManualRecoveryAgent,
 options:{stateRoot:string;workspaceDirectory:string;workspaceId:string}):Promise<
 {agentDirectory:string;expectedAgentSetupSha256:string}|{manualAgent:RetainedManualAgentSelection}
>;
