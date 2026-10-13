import type {CommandCatalog} from '../../../distribution/discovery/catalog.mjs';
import type {OperatingPlan,OperatingPlanDraft} from '../../../distribution/discovery/operating-plan.mjs';
import type {OperatingPlanReturn,OperatingReturnComparison,OperatingReturnChoice,OperatingReturnJSON} from '../../../distribution/discovery/operating-plan-return.mjs';
export const PROCEDURE_SCHEMA:'stellar-forge.grist-operating-procedure.v1';
export const CAPTURE_SCHEMA:'stellar-forge.grist-operating-capture.v1';
export type GristSourceKind='documents'|'discoveries'|'captures'|'versions'|'operations';
export const SOURCE_KINDS:readonly GristSourceKind[];
export interface GristProcedureOrigin {settingsSha256:string;createdAt:string}
export interface GristSourceBinding {kind:GristSourceKind;id:string;stepId:string;identitySha256:string;identity:Record<string,unknown>}
export interface GristSourceItem {kind:GristSourceKind;id:string;title:string;identitySha256:string;identity:Record<string,unknown>;observation:Record<string,unknown>}
export interface GristSourceSnapshot {
 origin:GristProcedureOrigin;rows:GristSourceItem[];
 authoringState:{draftRevision:number;selectedVersion:number|null;selectionRevision:number};
}
export interface GristProcedureCapture {
 schema:typeof CAPTURE_SCHEMA;id:string;origin:GristProcedureOrigin;observedAt:string;
 authoringState:GristSourceSnapshot['authoringState'];atomicSnapshot:false;nativeDispatch:false;
 rows:Array<Pick<GristSourceBinding,'kind'|'id'|'stepId'|'identitySha256'>&{observation:Record<string,unknown>}>;
}
export interface GristProcedure {
 schema:typeof PROCEDURE_SCHEMA;id:string;origin:GristProcedureOrigin;createdAt:string;updatedAt:string;version:number;
 plan:OperatingPlan;bindings:GristSourceBinding[];captures:GristProcedureCapture[];returns:OperatingPlanReturn[];
}
export interface GristProcedureView {procedure:GristProcedure;draft:OperatingPlanDraft;version:number;planRevision:number}
export interface GristProcedureRequest {
 schema:'stellar-forge.grist-operating-request.v1';requestId:string;method:string;planId:string;inputSha256:string;
 previousVersion:number;version:number;planRevision:number;procedureSha256:string;savedAt:string;nativeDispatch:false;
}
export type GristProcedureMutationResult=GristProcedureView&{receipt:GristProcedureRequest};
export interface GristReturnChoice {key:string;decision:{take:OperatingReturnChoice;value?:OperatingReturnJSON;note?:string}|null}
export function inspectProcedure(value:unknown):GristProcedure;
export function createGristProcedure(input:{
 id:string;title:string;customer?:string;purpose?:string;period?:string;owner?:string;receiving?:string;notes?:string;
 snapshot:GristSourceSnapshot;catalog:CommandCatalog;savedAt:string;
}):GristProcedure;
export function captureGristProcedure(value:GristProcedure,input:{
 snapshot:GristSourceSnapshot;captureId:string;observedAt:string;stepIds:string[];
}):GristProcedure;
export function saveGristProcedure(value:GristProcedure,input:{draft:OperatingPlanDraft;savedAt:string}):GristProcedure;
export function receiveGristPlan(value:GristProcedure,input:{incoming:GristProcedure|OperatingPlan;savedAt:string}):GristProcedure;
export function reviewGristReturn(value:GristProcedure,input:{
 incoming:GristProcedure|OperatingPlan;reviewId:string;reviewer:string;notes?:string;decisions?:GristReturnChoice[];savedAt:string;
}):{review:OperatingPlanReturn;comparison:OperatingReturnComparison};
export function applyGristReturn(value:GristProcedure,input:{review:OperatingPlanReturn;savedAt:string}):GristProcedure;
export function exportGristProcedure(value:GristProcedure,format?:'json'|'plan'|'markdown'|'html'):
 {filename:string;contentType:string;content:string};

export interface GristOperatingMutation {planId:string;requestId:string;expectedVersion:number}
export type GristOperatingSelection=Record<GristSourceKind,string[]>;
export interface GristAuthoringOperation {
 id:string;kind:string;status:'pending'|'complete'|'interrupted'|'failed';createdAt:string;updatedAt:string;
 result:unknown|null;error:{code:string;message:string;status:number}|null;
}
export interface GristOperatingMethods {
 source:{input:{kind:GristSourceKind;offset?:number;limit?:number};output:{
  origin:GristProcedureOrigin;kind:GristSourceKind;items:GristSourceItem[];total:number;offset:number;limit:number;nativeDispatch:false}};
 list:{input:{offset?:number;limit?:number};output:{origin:GristProcedureOrigin;total:number;offset:number;limit:number;
  procedures:Array<{id:string;title:string;version:number;planRevision:number;updatedAt:string;captures:number}>;nativeDispatch:false}};
 read:{input:{planId:string};output:GristProcedureView};
 request:{input:{requestId:string};output:GristAuthoringOperation|null};
 create:{input:GristOperatingMutation&{title:string;customer?:string;purpose?:string;period?:string;owner?:string;receiving?:string;notes?:string;selection:GristOperatingSelection};output:GristProcedureMutationResult};
 adopt:{input:GristOperatingMutation&{procedure:GristProcedure};output:GristProcedureMutationResult};
 save:{input:GristOperatingMutation&{draft:OperatingPlanDraft};output:GristProcedureMutationResult};
 capture:{input:GristOperatingMutation&{captureId:string;stepIds:string[]};output:GristProcedureMutationResult};
 receive:{input:GristOperatingMutation&{incoming:GristProcedure|OperatingPlan};output:GristProcedureMutationResult};
 return_preview:{input:{planId:string;incoming:GristProcedure|OperatingPlan;reviewId:string;reviewer:string;notes?:string;decisions?:GristReturnChoice[]};output:{version:number;review:OperatingPlanReturn;comparison:OperatingReturnComparison}};
 return_apply:{input:GristOperatingMutation&{review:OperatingPlanReturn};output:GristProcedureMutationResult};
 export:{input:{planId:string;format?:'json'|'plan'|'markdown'|'html'};output:{filename:string;contentType:string;content:string;version:number;bytes:number;sha256:string}};
}
/** Structural API on the existing openGristAuthoring result. Its original owner closes it. */
export interface GristOperatingWorkspace {
 operating<K extends keyof GristOperatingMethods>(method:K,args:GristOperatingMethods[K]['input']):Promise<GristOperatingMethods[K]['output']>;
}
