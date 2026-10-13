/** MIT. Complete comparison API over the original Research dossier. */
export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export interface Actor{id:string;name:string}
export interface SourceRef{editionId:string;locator:string;note:string}
export interface Criterion{id:string;label:string;kind:'MEASURED'|'JUDGMENT';unit:string;direction:'HIGHER'|'LOWER'|'DESCRIPTIVE';description:string}
export interface CaseDefinition{questionId:string;title:string;purpose:string;scope:string;criteria:Criterion[];sourceRefs:SourceRef[]}
export interface CandidateDefinition{name:string;kind:'MODEL'|'PLATFORM'|'ARCHITECTURE';version:string;description:string;configuration:Record<string,Json>;sourceRefs:SourceRef[]}
export interface JudgmentDefinition{candidateVersionId:string;criterionId:string;value:string;reviewer:string;reviewedAt:string;rationale:string;sourceRefs:SourceRef[];runIds:string[]}
export interface DecisionDefinition{title:string;candidateVersionIds:string[];runIds:string[];judgmentVersionIds:string[];reviewer:string;reviewedAt:string;recommendation:string;rationale:string;limitations:string;sourceRefs:SourceRef[]}
export interface BlobDescriptor{bytes:number;sha256:string}
export interface Artifact extends BlobDescriptor{id:string;path:string;role:string;mediaType:string}
export interface Metric{id:string;criterionId:string;label:string;value:number|string|null;unit:string;undefinedReason?:string;definition:string;denominator:Record<string,Json>;cohortRef:string;artifactIds:string[]}
export interface RunEnvelope{
 schema:'sf88-research-comparison-run/v1';externalRunId:string;kind:'SOURCE_NATIVE'|'IMPORTED_MEASUREMENT'|'TRAINING_FIXTURE';status:'SUCCEEDED'|'FAILED'|'CANCELLED';
 startedAt:string;finishedAt:string;elapsedMs:number|null;
 engine:{name:string;version:string;command:string[];runtime:Record<string,Json>;configuration:Record<string,Json>};
 input:{cohortId:string;protocolId:string;definition:Record<string,Json>;sourceRefs:SourceRef[];artifactIds:string[]};
 metrics:Metric[];artifacts:(Artifact&{bodyBase64:string})[];result:Record<string,Json>;limitations:string[];
}
export interface VersionRecord<T=CaseDefinition|CandidateDefinition|JudgmentDefinition|DecisionDefinition>{
 id:string;versionId:string;previousVersionId:string|null;caseId:string;caseVersionId:string;definition:T;createdAt:string;actor:Actor;
}
export interface RunRecord extends VersionRecord<Omit<RunEnvelope,'artifacts'|'result'>>{
 candidateId:string;candidateVersionId:string;raw:BlobDescriptor;artifacts:Artifact[];resultSha256:string;
}
type VersionPayload<K extends string,D>={caseId:string;caseVersionId:string;previousVersionId:string|null;definition:D}&Record<K,string|null>;
export type ReviewInput={requestId:string;expectedRevision:number;actor:Actor}&(
 {action:'case.save';payload:{caseId:string|null;previousVersionId:string|null;definition:CaseDefinition}}|
 {action:'candidate.save';payload:VersionPayload<'candidateId',CandidateDefinition>}|
 {action:'judgment.save';payload:VersionPayload<'judgmentId',JudgmentDefinition>}|
 {action:'decision.save';payload:VersionPayload<'decisionId',DecisionDefinition>}|
 {action:'run.import';payload:{caseId:string;caseVersionId:string;candidateVersionId:string;rawText:string}}
);
export interface Operation{schema:'sf88-research-comparison/v1';requestId:string;requestSha256:string;request:Json;action:ReviewInput['action'];record:VersionRecord|RunRecord;createdAt:string;actor:Actor;dossierRevision:number}
export interface CommitResult{dossier:{id:string;revision:number;[key:string]:unknown};operation:Operation;duplicate:boolean}
export type Section='overview'|'cases'|'case-editions'|'candidates'|'candidate-editions'|'runs'|'judgments'|'decisions'|'operations';
export interface Selection{revision?:number;caseId?:string;caseVersionId?:string;signal?:AbortSignal}
export interface PageOptions extends Selection{section?:Section;offset?:number;limit?:number}
export interface Page{
 schema:'sf88-research-comparison/v1';dossierId:string;revision:number;caseId:string|null;caseVersionId:string|null;section:Section;
 items:(VersionRecord|RunRecord|Operation)[];total:number;offset:number;limit:number;nextOffset:number|null;complete:boolean;
 cases?:VersionRecord<CaseDefinition>[];case?:VersionRecord<CaseDefinition>|null;candidates?:VersionRecord<CandidateDefinition>[];counts?:Record<string,number>;
}
export interface Report{
 schema:'sf88-research-comparison/v1';dossierId:string;revision:number;case:VersionRecord<CaseDefinition>;
 caseEditions:VersionRecord<CaseDefinition>[];candidates:VersionRecord<CandidateDefinition>[];candidateEditions:VersionRecord<CandidateDefinition>[];
 runs:RunRecord[];judgments:VersionRecord<JudgmentDefinition>[];decisions:VersionRecord<DecisionDefinition>[];
 operations:Operation[];measurementRows:(Metric&{caseId:string;caseVersionId:string;candidateId:string;candidateVersionId:string;runId:string;externalRunId:string;status:RunEnvelope['status'];kind:RunEnvelope['kind']})[];
 judgmentRows:(JudgmentDefinition&{id:string;versionId:string;caseId:string;caseVersionId:string})[];sourceEditions:unknown[];limitations:string[];
}
export interface Download{file:string;bytes:number;sha256:string;filename?:string;contentType?:string;revision?:number}
export interface DownloadOptions{file:string;expectedSha256?:string;signal?:AbortSignal}
export interface ComparisonClient{
 comparison(id:string,options?:PageOptions):Promise<Page>;
 comparisonReport(id:string,options:Selection&{caseId:string}):Promise<Report>;
 reviewComparison(id:string,input:ReviewInput,options?:{signal?:AbortSignal}):Promise<CommitResult>;
 exportComparison(id:string,options:Selection&DownloadOptions&{caseId:string;format?:'json'|'html'|'csv'}):Promise<Download>;
 comparisonFile(id:string,options:DownloadOptions&{revision?:number;runId:string;artifactId?:string}):Promise<Download>;
}
export function createComparisonClient(transport:{request:Function;download:Function}):ComparisonClient;
