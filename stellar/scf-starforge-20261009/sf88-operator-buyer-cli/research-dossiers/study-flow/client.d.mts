export type FlowTemplate='new-databases'|'new-all-sources'|'update-databases'|'update-all-sources';
export type IdentificationRoute='database'|'register'|'website'|'organisation'|'citation'|'other';
export type FlowCount=number|null;
export interface FlowActor{id:string;name:string}
export interface AttributedBasis{editionIds:string[];occurrenceIds:string[];reference:string;locator:string;note:string}
export interface FlowDefinition{
 schema:'sf88-research-study-flow-definition/v1';name:string;description:string;template:FlowTemplate;questionId:string;reviewId:string|null;
 workSetIds:string[];editionIds:string[];
 routes:Array<{editionId:string;kind:IdentificationRoute;label:string}>;
 stages:Array<{workSetId:string;screening:string[];fullText:string[]}>;
 records:Array<{occurrenceId:string;workSetId:string|null;disposition:'candidate'|'duplicate'|'automation'|'other-removal'|'outside-scope';
 duplicateOf:string|null;reportKey:string|null;reason:string;basis:AttributedBasis}>;
 retrievals:Array<{reportKey:string;status:'not-sought'|'sought'|'retrieved'|'not-retrieved';reason:string;basis:AttributedBasis}>;
 reportAnchors:Array<{reportKey:string;occurrenceId:string;reason:string}>;
 reportedCounts:Array<{metric:string;value:FlowCount;reason:string;basis:AttributedBasis}>;
 exclusionReasons:Array<{lane:'databases'|'other';label:string;value:FlowCount;reason:string;basis:AttributedBasis}>;
 previous:{editionId:string|null;studyIdsRemoved:string[];reportKeysRemoved:string[];
 studyLinks:Array<{current:string;previous:string;reason:string}>;reportLinks:Array<{current:string;previous:string;reason:string}>;
 membership:Array<{reportKey:string;studyId:string;reason:string;basis:AttributedBasis}>;
 reason:string;basis:AttributedBasis};
 coverage:{statement:string;completeSearch:boolean;screeningBy:'human'|'automation'|'mixed'|'unspecified';
 screeningByHuman:FlowCount;screeningByAutomation:FlowCount};notes:string;
}
export type FlowSaveData={definition:FlowDefinition;sourceMode?:'current'|'retained';basisEditionId?:string|null;
 supersedes:string|null;reason:string;importFile?:{filename:string;contentType:string;body:string}};
export type FlowRequest={requestId:string;expectedRevision:number;actor:FlowActor;flowId?:string}&(
 {action:'save';data:FlowSaveData}|{action:'review'|'withdraw';data:{editionId:string;reason:string}});
export interface FlowMetric{
 id:string;label:string;unit:'records'|'reports'|'studies';group:string;value:FlowCount;derivedValue:FlowCount;
 mode:'derived'|'reported'|'retained-report';knownCount:number;memberIds:string[];basis:unknown;reason:string;difference?:number|null;
}
export interface FlowIssue{id:string;code:string;level:'info'|'warning'|'error';message:string;[key:string]:unknown}
export interface FlowReport{
 schema:'sf88-research-study-flow/v1';flowId:string|null;edition:{id:string;number:number;revision:number;createdAt:string;actor:FlowActor;reason:string}|null;
 dossier:{id:string;title:string;revision:number};definition:FlowDefinition;status:'draft'|'reviewed'|'withdrawn';review:unknown;
 source:{id:string;sha256:string;sourceRevision:number;sourceRevisionSha256:string;capturedAt:string;selector:unknown;
 question:unknown;review:unknown;editions:unknown[];workSets:unknown[];protocols:unknown[];previous:unknown};
 counts:FlowMetric[];exclusionReasons:unknown[];activeMetricIds:string[];
 included:{studyIds:string[];reportKeys:string[];originalStudyIds:string[];originalReportKeys:string[];
 identityCoverage:{studies:boolean;reports:boolean};reportStudyLinks:Array<{studyId:string;reportKey:string;provenance:unknown[]}>;linksComplete:boolean};
 records:unknown[];reports:unknown[];studies:unknown[];issues:FlowIssue[];reportSha256:string;
 summary:{records:number;reports:number;explicitStudyGroups:number;errorCount:number;warningCount:number;unknownCounts:number;
 mathematicallyConsistent:boolean;reportingComplete:boolean};
 references:unknown[];method:Record<string,string>;
}
export interface DossierMetadata{id:string;title:string;revision:number;[key:string]:unknown}
export interface FlowPage<T=unknown>{
 schema:'sf88-research-study-flow/v1';dossier:DossierMetadata;section:string;flowId:string|null;editionId:string|null;
 flows:unknown[];editions:unknown[];items:T[];offset:number;limit:number;total:number;nextOffset:number|null;
 definition?:FlowDefinition;status?:string;summary?:FlowReport['summary'];source?:FlowReport['source'];counts?:FlowMetric[];
}
export interface FlowSourcePage<T=unknown>{schema:'sf88-research-study-flow/v1';dossier:DossierMetadata;section:'source';
 questions:unknown[];reviews:unknown[];workSets:unknown[];protocols:unknown[];editions:unknown[];items:T[];
 offset:number;limit:number;total:number;nextOffset:number|null}
export interface RenderedFlow{dossier:DossierMetadata;report:FlowReport;svg:string}
export interface FlowOperation{id:string;flowId:string;requestId:string;requestSha256:string;request:FlowRequest;
 action:'save'|'review'|'withdraw';originalRevision:number;revision:number;sha256:string;result:{edition?:{id:string;number:number;[key:string]:unknown};[key:string]:unknown}}
export interface FlowWriteResult{dossier:DossierMetadata;operation:FlowOperation;duplicate:boolean}
export interface PageOptions{revision?:number;flowId?:string;editionId?:string;section?:string;offset?:number;limit?:number;signal?:AbortSignal}
export interface FlowClient{
 studyFlow(dossierId:string,options?:PageOptions):Promise<FlowPage>;
 studyFlowSources(dossierId:string,options?:{revision?:number;questionId?:string;reviewId?:string;workSetId?:string;offset?:number;limit?:number;signal?:AbortSignal}):Promise<FlowSourcePage>;
 studyFlowReport(dossierId:string,options?:{revision?:number;flowId?:string;editionId?:string;signal?:AbortSignal}):Promise<RenderedFlow>;
 previewStudyFlow(dossierId:string,input:{expectedRevision:number;definition:FlowDefinition;flowId?:string;sourceMode?:'current'|'retained';basisEditionId?:string|null},options?:{signal?:AbortSignal}):Promise<RenderedFlow>;
 importStudyFlowCounts(dossierId:string,input:{expectedRevision:number;body:string;filename?:string;reference?:string;reason:string},options?:{signal?:AbortSignal}):Promise<{dossier:DossierMetadata;importFile:{filename:string;contentType:string;body:string};counts:FlowDefinition['reportedCounts'];sha256:string;bytes:number}>;
 reviewStudyFlow(dossierId:string,input:FlowRequest,options?:{signal?:AbortSignal}):Promise<FlowWriteResult>;
 exportStudyFlow(dossierId:string,options:{file:string;format?:'json'|'svg'|'html'|'csv';section?:'counts'|'records'|'reports'|'studies'|'reasons'|'issues';revision?:number;flowId?:string;editionId?:string;signal?:AbortSignal;expectedSha256?:string}):Promise<{file:string;filename:string;contentType:string;bytes:number;sha256:string;revision?:number}>;
}
export function createStudyFlowClient(transport:{request:(route:string,body?:unknown,options?:{signal?:AbortSignal;readOnly?:boolean})=>Promise<unknown>;
 download:(route:string,file:string,options?:unknown)=>Promise<unknown>}):FlowClient;
