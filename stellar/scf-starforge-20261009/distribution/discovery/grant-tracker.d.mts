import type { OperatingPlan, OperatingPlanContent, OperatingStep, OperatingFile, receiveOperatingPlan } from './operating-plan.mjs';
import type { OperatingPlanReturn, OperatingReturnDecision, OperatingReturnComparison, applyOperatingPlanReturn } from './operating-plan-return.mjs';
export type GrantField = 'funder'|'program'|'requested'|'stage'|'loiDue'|'proposalDue'|'decisionExpected'|'awardStart'|'reportDue'|'owner'|'contact'|'notes'|'awarded'|'currency';
export type GrantDisposition = 'unresolved'|'candidate'|'active-award'|'historical-award'|'excluded';
export type GrantSourceKind = 'tracker'|'award-terms'|'award-history'|'supporting';
export type GrantObligationKind = 'loi'|'proposal'|'decision'|'report'|'renewal'|'other';
export type GrantObligationState = 'unconfirmed'|'confirmed'|'completed'|'waived';
export const GRANT_FIELDS: readonly {readonly id:GrantField;readonly label:string}[];
export const GRANT_STAGES: readonly string[];
export const GRANT_DISPOSITIONS: readonly GrantDisposition[];
export const GRANT_SOURCE_KINDS: readonly GrantSourceKind[];
export const GRANT_OBLIGATION_KINDS: readonly GrantObligationKind[];
export const GRANT_OBLIGATION_STATES: readonly GrantObligationState[];
export const GRANT_TRACKER_MAX_BYTES: number;
export type GrantMapping = Record<GrantField,number|null>;
export interface GrantObligation {
  id:string;kind:GrantObligationKind;due:string;owner:string;status:GrantObligationState;
  evidenceSourceId:string|null;locator:string;reason:string;recordedResult:string;
}
export interface GrantRowRecord {
  disposition:GrantDisposition;reason:string;
  edits:Partial<Record<GrantField,{value:string;reason:string}>>;
  relationship:{kind:'unresolved'|'distinct'|'related'|'duplicate';target:string|null;reason:string};
  obligations:GrantObligation[];
}
export interface GrantSourceInput {
  id:string;kind:GrantSourceKind;name:string;mediaType?:string;bytes:Uint8Array;
  url?:string;note?:string;format:'csv'|'tsv'|'binary';encoding?:'utf-8'|'windows-1252';
  headerRow?:number;mapping?:GrantMapping;
}
export interface GrantPhysicalRecord {rowNumber:number;line:number;fields:string[]}
export interface GrantSource {
  schema:'summitflow.grant-source.v1';id:string;kind:GrantSourceKind;name:string;mediaType:string;
  bytes:number;sha256:string;url:string;note:string;format:GrantSourceInput['format'];
  encoding:'utf-8'|'windows-1252'|null;headerRow:number|null;mapping:GrantMapping|null;
  original:OperatingFile;descriptorFile:OperatingFile;headers:string[];records:GrantPhysicalRecord[];rows:GrantPhysicalRecord[];
}
export interface GrantRow {
  id:string;sourceId:string;rowNumber:number;line:number;headers:string[];rawFields:string[];
  mapped:Record<GrantField,string|null>;values:Record<GrantField,string|null>;record:GrantRowRecord;
  step:OperatingStep;issues:Array<{code:string;message:string}>;candidates:string[];
}
export interface GrantCounts extends Record<GrantDisposition,number> {sources:number;physicalRows:number;obligations:number;issues:number}
export interface GrantView {plan:OperatingPlan;revision:number;sources:GrantSource[];rows:GrantRow[];counts:GrantCounts;ready:boolean}
export interface GrantWriteOptions {expectedRevision:number;savedAt?:string}
export interface GrantExport {name:string;mediaType:string;content:string}
export function isGrantTracker(plan:unknown):boolean;
export function suggestGrantMapping(headers:string[]):{mapping:GrantMapping;unresolved:Array<{field:GrantField;matches:number[]}>};
export function previewGrantSource(source:Pick<GrantSourceInput,'bytes'|'format'|'encoding'|'headerRow'>):Promise<{
  headers:string[];records:Array<{rowNumber:number;line:number;rawFields:string[]}>;mapping:GrantMapping|null;
  unresolved:Array<{field:GrantField;matches:number[]}>;bytes:number;sha256:string;
}>;
export function createGrantTracker(fields:{id:string;title:string;savedAt?:string}&Partial<Pick<OperatingPlanContent,'customer'|'owner'|'purpose'|'period'|'receiving'|'notes'>>):Promise<OperatingPlan>;
export function inspectGrantTracker(plan:unknown,options?:{revision?:number}):Promise<GrantView>;
export function importGrantSource(plan:OperatingPlan,source:GrantSourceInput,options:GrantWriteOptions):Promise<OperatingPlan>;
export function saveGrantRow(plan:OperatingPlan,rowId:string,record:GrantRowRecord,options:GrantWriteOptions):Promise<OperatingPlan>;
export function saveGrantPlanDetails(plan:OperatingPlan,details:Partial<Omit<OperatingPlanContent,'steps'>>,options:GrantWriteOptions):Promise<OperatingPlan>;
export function receiveGrantTracker(incoming:OperatingPlan,existing?:OperatingPlan|null):Promise<ReturnType<typeof receiveOperatingPlan>>;
export function createGrantReturn(current:OperatingPlan,incoming:OperatingPlan,options:{id:string;reviewer?:string;notes?:string;createdAt?:string}):Promise<OperatingPlanReturn>;
export function compareGrantReturn(review:OperatingPlanReturn):Promise<OperatingReturnComparison&{domainIssues:Array<{code:string;message:string}>}>;
export function decideGrantReturn(review:OperatingPlanReturn,key:string,decision:Omit<OperatingReturnDecision,'key'|'order'>|null):Promise<OperatingPlanReturn>;
export function applyGrantReturn(review:OperatingPlanReturn,options?:{current?:OperatingPlan;savedAt?:string}):Promise<ReturnType<typeof applyOperatingPlanReturn>>;
export function renderGrantReport(plan:OperatingPlan,options?:{revision?:number}):Promise<string>;
export function exportGrantTracker(plan:OperatingPlan,options?:{revision?:number}):Promise<{plan:OperatingPlan;view:GrantView;files:GrantExport[]}>;
