import type {OperatingPlan,OperatingFile} from './operating-plan.mjs';
import type {SupportOperatingSource,RecordSupportOperatingResultOptions} from './support-operating-plan.mjs';
import type {OperatingPlanReturn,OperatingReturnComparison,OperatingReturnChoice,OperatingReturnJSON} from './operating-plan-return.mjs';
export const SUPPORT_OPERATING_RETURN_SCHEMA:'stellar-forge.oauth-support-operating-return.v1';
export const SUPPORT_OPERATING_WORK_SCHEMA:'stellar-forge.oauth-support-operating-work.v1';
export interface SupportOperatingWorkOptions extends RecordSupportOperatingResultOptions {
  /** Freeze this timestamp before dispatching or persisting the operation. */
  savedAt:string;
  /** Every selected evidence ID carries its complete bytes in the original OperatingFile format. */
  files:Array<{evidenceId:string;file:OperatingFile}>;
}
export interface SupportOperatingReturn {
  schema:typeof SUPPORT_OPERATING_RETURN_SCHEMA;
  /** Original plan descriptor plus each exact case-descendant result source, without duplicate selections. */
  sources:SupportOperatingSource[];
  /** The unchanged original review format retains complete plans, decisions and completion. */
  review:OperatingPlanReturn;
}
export interface CreateSupportOperatingReturnOptions {
  sources:SupportOperatingSource[];id:string;reviewer?:string;notes?:string;createdAt:string;
}
export interface ApplySupportOperatingReturnResult {
  value:SupportOperatingReturn;plan:OperatingPlan;alreadyPresent:boolean;
  addedRevisions:number;reviewedRevisions:number;
}
/** Uses WebCrypto SHA-256 on every selected complete carried evidence file. Does not mutate the native case. */
export function recordSupportOperatingWork(plan:OperatingPlan,options:SupportOperatingWorkOptions):Promise<OperatingPlan>;
/** Complete histories, first source binding, case ancestry, result references and carried bytes are verified.
 * The original SF74 companion receiver separately verifies native CaseStore provenance and full source inventory. */
export function inspectSupportOperatingReturn(value:unknown):Promise<SupportOperatingReturn>;
export function createSupportOperatingReturn(current:OperatingPlan,incoming:OperatingPlan,options:CreateSupportOperatingReturnOptions):Promise<SupportOperatingReturn>;
export function compareSupportOperatingReturn(value:SupportOperatingReturn):Promise<OperatingReturnComparison>;
export function reviseSupportOperatingReturn(value:SupportOperatingReturn,updates:{reviewer?:string;notes?:string}):Promise<SupportOperatingReturn>;
export function decideSupportOperatingReturn(value:SupportOperatingReturn,key:string,
  decision?:{take:OperatingReturnChoice;value?:OperatingReturnJSON;note?:string}|null):Promise<SupportOperatingReturn>;
/** Original current-head guard and completed/later-head replay apply. Save value before the original plan transaction. */
export function applySupportOperatingReturn(value:SupportOperatingReturn,options:{current?:OperatingPlan;savedAt:string}):Promise<ApplySupportOperatingReturnResult>;
/** Includes exact downloadable carried files and the full Support package JSON, escaped as text. */
export function renderSupportOperatingReturnHTML(value:SupportOperatingReturn):Promise<string>;
