import type {ServicePlannerInventory,ServiceClosePlan} from './accounting-statement-service-planner.mjs';
export interface ServiceCalendarDefinition {
  name:string;active:boolean;customerId:string;bindingId:string;periodIdentitySha256:string;orderRef:string;
  anchor:string;cadence:'weekly'|'monthly';interval:number;dueDays:number;endDate:string|null;notes:string;
}
export interface ServiceCalendarSaveRequest {requestId:string;expectedRevision:number;id:string|null;inputSha256:string}
export interface ServiceCalendarVersion extends ServiceCalendarDefinition {id:string;version:number;savedAt:string;sha256:string;saveRequest?:ServiceCalendarSaveRequest}
export interface ServiceCalendarCatalogue {
  schema:'stellar-forge.accounting-statement-service-schedules.v1';workspace:string;endpoint:string;revision:number;
  definitions:Array<{id:string;versions:ServiceCalendarVersion[]}>;
}
export interface ServiceCalendarPeriod {
  id:string;scheduleId:string;version:number;index:number;name:string;from:string;until:string;
  openingAt:string;closingAt:string;dueAt:string;timing:'UPCOMING'|'READY'|'DUE'|'OVERDUE';
}
export interface ServiceCalendarSelection {
  scheduleId:string;version:number;index:number;runId:string;usageOpeningId:string;usageId:string;acceptDifferentBoundaries?:boolean;
}
export interface ScheduledServicePlan {
  schema:'stellar-forge.accounting-statement-service-schedules-plan.v1';workspace:string;endpoint:string;catalogueRevision:number;
  targets:Array<{scheduleId:string;version:number;index:number;periodId:string;name:string;definitionSha256:string;from:string;until:string;
    dueAt:string;actualOpeningAt:string;actualClosingAt:string;boundaryDifference:boolean}>;
  plan:ServiceClosePlan;sha256:string;
}
export interface ServiceCalendarPreparation {
  schema:'stellar-forge.accounting-statement-service-schedules-preparation.v1';workspace:string;endpoint:string;requestId:string;
  bodySha256:string;label:string;createdAt:string;cycleKey:string;scheduledPlan:ScheduledServicePlan;imported:boolean;
}
export interface ServiceCalendarBundle {
  schema:'stellar-forge.accounting-statement-service-schedules-bundle.v1';exportedAt:string;
  catalogue:ServiceCalendarCatalogue;preparations:ServiceCalendarPreparation[];sha256:string;
}
export interface ServiceCalendarWindow {from:string;until:string;asOf?:string;includePaused?:boolean;offset?:number;limit?:number}
export interface ServiceCalendarRow extends ServiceCalendarPeriod {
  active:boolean;definitionSha256:string;customer:{id:string;name:string;[key:string]:unknown};orderRef:string;rowId:string|null;
  sourceState:'ASSIGNMENT_CHANGED'|'EXACT_CAPTURES_AVAILABLE'|'CHOOSE_CAPTURES';openingCaptureId:string|null;closingCaptureId:string|null;
  openingCandidates:string[];closingCandidates:string[];currentStatements:Array<{id:string;number:string;status:string;from:string;until:string}>;
  preparations:Array<{requestId:string;cycleKey:string;label:string;createdAt:string;imported:boolean;actualOpeningAt:string;actualClosingAt:string}>;
}
export interface ServiceCalendarPage {
  schema:string;workspace:string;endpoint:string;revision:number;from:string;until:string;asOf:string;
  inventory:ServicePlannerInventory;counts:{total:number;due:number;prepared:number;current:number};
  total:number;offset:number;nextOffset:number|null;items:ServiceCalendarRow[];
}
export interface CalendarFile {filename:string;mimeType:string;content:string;total:number}
export interface ServiceCalendarStore {
  catalogue():Promise<ServiceCalendarCatalogue&{current:ServiceCalendarVersion[]}>;
  save(input:{requestId?:string|null;expectedRevision:number;id?:string|null;definition:ServiceCalendarDefinition}):Promise<{revision:number;definition:ServiceCalendarVersion;replayed?:boolean}>;
  calendar(input:ServiceCalendarWindow&{format?:null}):Promise<ServiceCalendarPage>;
  calendar(input:ServiceCalendarWindow&{format:'csv'|'html'}):Promise<CalendarFile>;
  compile(input:{selections:ServiceCalendarSelection[]}):Promise<ScheduledServicePlan>;
  prepare(input:{requestId:string;label:string;scheduledPlan:ScheduledServicePlan}):Promise<{preparation:ServiceCalendarPreparation;cycle:Record<string,unknown>}>;
  request(input:{requestId:string}):Promise<{requestId:string;found:boolean;preparation?:ServiceCalendarPreparation}>;
  resume(input:{requestId:string}):ReturnType<ServiceCalendarStore['prepare']>;
  history(input?:{scheduleId?:string|null;offset?:number;limit?:number}):Promise<{items:ServiceCalendarPreparation[];total:number;offset:number;nextOffset:number|null}>;
  exportBundle():Promise<ServiceCalendarBundle>;
  importBundle(input:{bundle:ServiceCalendarBundle;expectedRevision:number}):Promise<{revision:number;calendars:number;preparations:number}>;
}
export function serviceScheduleBoundary(definition:ServiceCalendarDefinition,index:number):string;
export function serviceSchedulePeriods(definition:ServiceCalendarVersion,window:{from:string;until:string;asOf?:string}):ServiceCalendarPeriod[];
export function createAccountingStatementServiceSchedules(options:{
  directory:string;url:string;workspace:string;
  readInventory:()=>Promise<ServicePlannerInventory>;
  prepareCycle:(input:{requestId:string;label:string;plan:ServiceClosePlan})=>Promise<Record<string,unknown>>;
  readCycle:(key:string)=>Promise<Record<string,unknown>>;
}):Promise<ServiceCalendarStore>;
