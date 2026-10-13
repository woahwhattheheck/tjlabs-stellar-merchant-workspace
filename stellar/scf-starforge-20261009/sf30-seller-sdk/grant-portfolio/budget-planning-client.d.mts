/** Exact planning amounts are strings. Unknown amounts are null. */
import type {GrantPortfolioClient,PortfolioSelection,ReviewReference,OperationId,RequestOptions,ActionOptions,RetainedRequest,JsonObject} from './client.mjs';
import type {ProgrammeRecord,ProgrammeMetadata} from './programme-client.mjs';
export type PlanningCollection = 'scenarios'|'lines';
export interface PlanningReference {id:string;revision:number;sha256:string;}
export interface PlanningMoney {currency:string;value:string;}
export interface PlanningCommon {documentIds?:string[];sourceRefs?:ReviewReference[];notes?:string;}
export interface PlanningScenarioFields extends PlanningCommon {
  code:string;title:string;nodeId:string;owner:string;startMonth:string;endMonth:string;description?:string;
  openingBalances?:PlanningMoney[];basedOn?:PlanningReference|null;reviewStatus?:'working'|'reviewed';
  reviewer?:string;reviewNote?:string;
}
export interface PlanningLineFields extends PlanningCommon {
  scenarioId:string;nodeId:string;grantId?:string|null;code:string;title:string;
  direction:'inflow'|'outflow';category:string;period:string;amount?:string|null;currency:string;
  classification:'forecast'|'committed';commitmentReference?:string;cashDate?:string|null;milestoneId?:string|null;
}
export interface PlanningFields {scenarios:PlanningScenarioFields;lines:PlanningLineFields;}
export type PlanningRecord<C extends PlanningCollection=PlanningCollection> =
  {[K in C]:ProgrammeMetadata & Required<PlanningFields[K]>}[C];
export type PlanningChange<C extends PlanningCollection=PlanningCollection> =
  {[K in C]:{collection:K;id:string;expectedRevision:number;fields:Partial<PlanningFields[K]>}}[C];
export interface PlanningArchive {collection:PlanningCollection;id:string;expectedRevision:number;reason:string;}
export interface PlanningChangeSet {
  schema:'stellar-forge.grant-budget-planning.v1';actor:string;expectedPlanningRevision:number;
  changes:PlanningChange[];archive:PlanningArchive[];
}
export interface PlanningModel {
  schema:'stellar-forge.grant-budget-planning.v1';revision:number;
  records:{scenarios:PlanningRecord<'scenarios'>[];lines:PlanningRecord<'lines'>[]};
}
export interface PlanningRecordSelection<C extends PlanningCollection=PlanningCollection> extends PortfolioSelection {collection:C;id:string;}
export interface PlanningSummarySelection extends PortfolioSelection {scenarioId:string;compareScenarioId?:string;granularity?:'month'|'year';}
export interface PlanningReportSelection extends PlanningSummarySelection {format:'json'|'csv'|'html';}
export interface PlanningEnvelope extends PortfolioSelection {
  schema:'stellar-forge.grant-budget-planning.v1';snapshot:string;planningRevision:number;
}
export interface PlanningRecordRead<C extends PlanningCollection=PlanningCollection> extends PlanningEnvelope {collection:C;record:PlanningRecord<C>;}
export interface PlanningHistoryRead<C extends PlanningCollection=PlanningCollection> extends PlanningEnvelope {
  collection:C;id:string;history:{portfolioRevision:number;snapshot:string;operationId:OperationId;record:PlanningRecord<C>}[];
}
export interface PlanningAmountBucket {known:string;missing:number;count:number;}
export interface PlanningDirectionBucket extends PlanningAmountBucket {forecast:PlanningAmountBucket;committed:PlanningAmountBucket;}
export interface PlanningPeriodRow {
  period:string;currency:string;inflow:PlanningDirectionBucket;outflow:PlanningDirectionBucket;netKnown:string;complete:boolean;unallocatedAnnualCount?:number;
}
export interface PlanningCashRow extends PlanningPeriodRow {
  opening:string|null;closingKnown:string|null;missingOpening:boolean;
}
export interface PlanningComparisonRow<R extends PlanningPeriodRow=PlanningPeriodRow> {
  period:string;currency:string;base:R|null;compared:R|null;netKnownDifference:string|null;complete:boolean;
}
export interface PlanningSummary {
  scenario:PlanningRecord<'scenarios'>;granularity:'month'|'year';
  rows:PlanningPeriodRow[];cashRows:PlanningCashRow[];
  undatedCashRows:PlanningRecord<'lines'>[];missingAmounts:PlanningRecord<'lines'>[];unallocatedBudgetRows:PlanningRecord<'lines'>[];
  workplan:ProgrammeRecord<'milestones'>[];warnings:unknown[];
  comparison:null|{scenario:PlanningRecord<'scenarios'>;rows:PlanningComparisonRow[];cashRows:PlanningComparisonRow<PlanningCashRow>[]};
}
export interface PlanningSummaryRead extends PlanningEnvelope {scenario:PlanningReference;summary:PlanningSummary;}
export interface PlanningReportRead extends PlanningSummaryRead {lines:PlanningRecord<'lines'>[];}
export interface PlanningFileDescriptor {sha256:string;bytes:number;filename:string;contentType:'application/json'|'text/csv'|'text/html';}
export interface PlanningFile {descriptor:PlanningFileDescriptor;response:Response;}
export interface SavedPlanningFile extends PlanningFileDescriptor {path:string;retained:true;}
export interface PlanningDraft {
  schema:'stellar-forge.grant-budget-planning-draft.v1';
  basis:PortfolioSelection & {snapshot:string;planningRevision:number};actor:string;createdAt:string;
  changes:PlanningChange[];archive:PlanningArchive[];
  recordBases:Record<string,{revision:number;sha256:string}|null>;
  operation?:{operationId:OperationId;action:'portfolio.save';payload:JsonObject};
}
export declare const GRANT_BUDGET_PLANNING_SCHEMA:'stellar-forge.grant-budget-planning.v1';
export declare const GRANT_BUDGET_PLANNING_COLLECTIONS:readonly PlanningCollection[];
export declare function planningBatch(actor:string,expectedPlanningRevision:number,changes:PlanningChange[],options?:{archive?:PlanningArchive[]}):PlanningChangeSet;
export declare function newPlanningRecord<C extends PlanningCollection>(collection:C,fields:PlanningFields[C],id?:string):PlanningChange<C>;
export declare function revisePlanningRecord<C extends PlanningCollection>(collection:C,record:PlanningRecord<C>,fields:Partial<PlanningFields[C]>):PlanningChange<C>;
export declare function saveGrantBudgetPlanning(client:GrantPortfolioClient,operationId:OperationId,
  selection:PortfolioSelection,planning:PlanningChangeSet,options?:ActionOptions):Promise<RetainedRequest>;
export declare function copyPlanningScenario(scenario:PlanningRecord<'scenarios'>,lines:PlanningRecord<'lines'>[],
  options:{code:string;title:string;id?:string;lineIds?:string[]}):{scenarioId:string;basedOn:PlanningReference;changes:PlanningChange[]};
