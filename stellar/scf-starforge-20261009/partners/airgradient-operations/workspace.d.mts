// SPDX-License-Identifier: MIT
export type Measure='pm25'|'pm10'|'atmp'|'rhum'|'rco2';
export type Bucket='15m'|'1h'|'8h'|'1d';
export interface CustomerProject {
 organisation:string; title:string; owner:string; connectionId:string;
 locations:Array<{id:string;sourceType:'outdoor'|'indoor'|'dashboard';label:string;timezone:string}>; measures:Measure[];
 bucket:Bucket; minimumCoverage:number;
 thresholds:Partial<Record<Measure,{operator:'gte'|'lte';value:number;purpose:string}>>;notes:string;
}
export interface ProjectRevision {schema:'stellar-forge.airgradient-project-revision.v1';id:string;sha256:string;createdAt:string;parentId:string|null;value:CustomerProject}
export interface Period {start:string;end:string;bucket:Bucket;seconds:number;expectedBuckets:number;convention:string}
export interface Plan {schema:'stellar-forge.airgradient-plan.v1';id:string;sha256:string;createdAt:string;projectId:string;connectionId:string;connectionSha256:string;title:string;notes:string;period:Period;baselineReportId:string|null;tasks:Array<{key:string;index:number;kind:'metadata'|'history';locationId:string;locationKey:string;sourceType:'outdoor'|'indoor'|'dashboard';measure?:Measure;measures?:Measure[];url:string;requestSha256:string}>}
export interface ReportRow {locationId:string;locationKey:string;sourceType:'outdoor'|'indoor'|'dashboard';label:string;timezone:string;measure:Measure;measurementLabel:string;unit:string;expectedBuckets:number;returnedBuckets:number;availableBuckets:number;missingBuckets:number;coverage:number;minimumCoverage:number;status:'READY'|'INCOMPLETE'|'NO_VALUES';mean:number|null;minimum:number|null;maximum:number|null;threshold:CustomerProject['thresholds'][Measure]|null;thresholdBuckets:number|null;thresholdFraction:number|null;sourceMeaning:string;comparison:null|{baselineReportId:string;baselinePeriod:Period;baselineMean:number|null;baselineCoverage:number;meanChange:number|null;samePeriod:boolean;sameThreshold:boolean;sameConnection:boolean}}
export interface ReportReview {schema:string;planId:string;planSha256:string;projectId:string;projectSha256:string;connectionId:string;connectionSha256:string;title:string;organisation:string;owner:string;period:Period;notes:string;baselineReportId:string|null;rows:ReportRow[];issues:Array<{task:string;status:string;code:string|null}>;sources:unknown[];locationMetadata:Record<string,unknown>;seriesSha256:string;seriesRows:number;interpretation:string;provenance:unknown;readiness:'READY'|'REVIEW_GAPS';reviewSha256:string}
export interface FrozenReport extends ReportReview {schema:'stellar-forge.airgradient-report.v1';id:string;sha256:string;createdAt:string}
export interface Workspace {
 directory:string;workspaceId:string;configurationSha256:string;store:unknown;
 state():Record<string,unknown>;saveProject(project:CustomerProject,options?:{expectedCurrent?:string|null}):ProjectRevision;
 selectProject(id:string):ProjectRevision;addDashboard(raw:Uint8Array,binding:Record<string,unknown>):Record<string,unknown>;
 createPlan(input:{expectedProjectId:string;period:{start:string;end:string};title?:string;notes?:string;baselineReportId?:string|null}):Plan;
 run(planId:string,options?:{retryFailed?:boolean}):Promise<Record<string,unknown>>;
 start(planId:string,options?:{retryFailed?:boolean}):Promise<{runId:string;planId:string;startedAt:string}>;
 stop():{requested:boolean};reprocess(planId:string):Record<string,unknown>;review(planId:string):ReportReview;commit(planId:string,expectedReviewSha:string):FrozenReport;
 report(id:string):FrozenReport;handover(id:string):Record<string,unknown>;inspectReceiving(input:Uint8Array|Record<string,unknown>):Record<string,unknown>;
 receive(input:Uint8Array|Record<string,unknown>):Record<string,unknown>;files(id:string):Promise<Array<{name:string;bytes:Uint8Array}>>;
 deliver(id:string,destination:string):Promise<Record<string,unknown>>;definition():Promise<Record<string,unknown>>;
 catalogue(page?:number,pagesize?:number,sourceType?:'outdoor'|'indoor'):Promise<Record<string,unknown>>;close():Promise<void>;
}
export function inspectWorkspace(directory:string):Promise<{directory:string;configuration:Record<string,unknown>;configurationSha256:string;workspaceId:string}>;
export function openWorkspace(directory:string,options?:{create?:boolean;network?:{trustedProxy?:Record<string,unknown>;sandboxGatewayIPv4?:string;routes?:Record<string,{trustedProxy?:Record<string,unknown>;sandboxGatewayIPv4?:string}>}}):Promise<Workspace>;
