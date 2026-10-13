import type {OperatingPlan,OperatingPlanDraft} from '../../stellar/scf-starforge-20261009/distribution/discovery/operating-plan.mjs';
export interface NativeSelections {editions:string[];reviews:string[];operations:string[];handovers:string[]}
export interface ProcedureBinding {id:string;stepId:string;[key:string]:unknown}
export interface Procedure {
 schema:'stellar-forge.lightdash-operating-procedure.v1';id:string;workspaceId:string;
 createdAt:string;updatedAt:string;version:number;plan:OperatingPlan;
 bindings:{workspaceId:string;sourceCommit:string;applicationManifestSha256:string;editions:ProcedureBinding[];reviews:ProcedureBinding[];operations:ProcedureBinding[];handovers:ProcedureBinding[]};
 captures:Array<{schema:'stellar-forge.lightdash-operating-capture.v1';id:string;workspaceId:string;workspaceRevision:number;observedAt:string;atomicSnapshot:false;rows:unknown[]}>;
 returns:unknown[];
}
export interface ProcedureChange {planId:string;requestId:string;expectedVersion:number}
export interface ProcedureRead {workspace:string;receivingWorkspaceId:string;procedure:Procedure;draft:OperatingPlanDraft;version:number;planRevision:number}
export interface ProcedureReceipt {requestId:string;action:string;planId:string;workspaceId:string;inputSha256:string;previousVersion:number;version:number;planRevision:number;procedureSha256:string;savedAt:string;nativeDispatch:false}
export interface ProcedureSaved extends ProcedureRead {receipt:ProcedureReceipt;replayed:boolean}
export function inspectProcedure(value:unknown):Procedure;
export function createCommissioningProcedure(input:{id:string;title:string;customer?:string;purpose?:string;period?:string;owner?:string;receiving?:string;notes?:string;snapshot:Record<string,any>;selection:NativeSelections;catalog:unknown;sourceCommit:string;applicationManifestSha256:string;savedAt:string}):Procedure;
export function captureCommissioningProcedure(value:Procedure,input:{snapshot:Record<string,any>;captureId:string;observedAt:string;stepIds:string[]}):Procedure;
export function saveCommissioningProcedure(value:Procedure,input:{draft:OperatingPlanDraft;savedAt:string}):Procedure;
export function receiveCommissioningPlan(value:Procedure,input:{incoming:OperatingPlan|Procedure;savedAt:string}):Procedure;
export function reviewCommissioningReturn(value:Procedure,input:{incoming:OperatingPlan;reviewId:string;reviewer:string;notes?:string;decisions?:Array<{key:string;decision:unknown}>;savedAt:string}):{review:unknown;comparison:unknown};
export function applyCommissioningReturn(value:Procedure,input:{review:unknown;savedAt:string}):Procedure;
export function exportCommissioningProcedure(value:Procedure,format?:'json'|'plan'|'markdown'|'html'):{filename:string;contentType:string;content:string};
