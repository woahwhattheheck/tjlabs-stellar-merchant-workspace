import type { inspectFredOperatingSource,createFredOperatingPlan,recordFredOperatingResult } from '../../stellar/scf-starforge-20261009/distribution/discovery/fred-operating-plan.mjs';
import type { inspectOperatingPlan,compareOperatingPlan,receiveOperatingPlan } from '../../stellar/scf-starforge-20261009/distribution/discovery/operating-plan.mjs';
export type FredOperatingSource=ReturnType<typeof inspectFredOperatingSource>;
export type FredOperatingPlan=ReturnType<typeof inspectOperatingPlan>;
export type FredOperatingCreateInput=Parameters<typeof createFredOperatingPlan>[0]&{savedAt:string};
export type FredOperatingRecordInput=Parameters<typeof recordFredOperatingResult>[1]&{savedAt:string};
export type FredOperatingCatalog=Parameters<typeof compareOperatingPlan>[1];
export type FredOperatingComparison=ReturnType<typeof compareOperatingPlan>;
export type FredOperatingReceiving=ReturnType<typeof receiveOperatingPlan>;
export type FredOperatingRender={format:'json';plan:FredOperatingPlan}|{format:'markdown'|'html';text:string};
export const FRED_OPERATING_MAX_BYTES:number;
export function handlesFredOperating(name:unknown):boolean;
export function callFredOperating(name:'merchant_fred_operating_inspect',args:{source:unknown}):FredOperatingSource;
export function callFredOperating(name:'merchant_fred_operating_create',args:{input:FredOperatingCreateInput}):FredOperatingPlan;
export function callFredOperating(name:'merchant_fred_operating_record',args:{plan:FredOperatingPlan;input:FredOperatingRecordInput}):FredOperatingPlan;
export function callFredOperating(name:'merchant_fred_operating_compare',args:{plan:FredOperatingPlan;catalog:FredOperatingCatalog;revision?:number}):FredOperatingComparison;
export function callFredOperating(name:'merchant_fred_operating_receive',args:{incoming:FredOperatingPlan;existing?:FredOperatingPlan|null}):FredOperatingReceiving;
export function callFredOperating(name:'merchant_fred_operating_render',args:{plan:FredOperatingPlan;format:'json';revision?:number}):{format:'json';plan:FredOperatingPlan};
export function callFredOperating(name:'merchant_fred_operating_render',args:{plan:FredOperatingPlan;format:'markdown'|'html';revision?:number}):{format:'markdown'|'html';text:string};
export class FredOperatingClient {
  inspectSource(source:unknown):FredOperatingSource;
  createPlan(input:FredOperatingCreateInput):FredOperatingPlan;
  recordResult(plan:FredOperatingPlan,input:FredOperatingRecordInput):FredOperatingPlan;
  comparePlan(plan:FredOperatingPlan,catalog:FredOperatingCatalog,options?:{revision?:number}):FredOperatingComparison;
  receivePlan(incoming:FredOperatingPlan,existing?:FredOperatingPlan|null):FredOperatingReceiving;
  renderPlan(plan:FredOperatingPlan,options?:{format?:'json';revision?:number}):{format:'json';plan:FredOperatingPlan};
  renderPlan(plan:FredOperatingPlan,options:{format:'markdown'|'html';revision?:number}):{format:'markdown'|'html';text:string};
}
