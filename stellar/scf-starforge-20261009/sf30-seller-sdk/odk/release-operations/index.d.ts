/** MIT. Same-workspace coupled application / Central release operations. */
export type SourceKind = 'gitlab' | 'central-handover' | 'central-release' | 'central-snapshot' | 'central-restore' | 'operator-evidence' | 'upgrade-instructions' | 'form-publication' | 'gitlab-artifact';
export type Phase = 'release' | 'recovery';
export type StepKind = 'app-deploy' | 'central-upgrade' | 'restore' | 'form-publish' | 'verify';
export type EvidenceKind = 'deployment' | 'host' | 'restore' | 'form-publication' | 'operator';
export interface GitLabConnection {
 id: string; name: string; url: string;
 /** Trusted server-only environment alias; never sent by the browser. */
 tokenEnv: string; projectIds?: Array<string | number>;
}
export interface GitLabSelection {
 id: string; name: string; connectionId: string; projectId: string | number; pipelineId: string | number;
 jobIds: Array<string | number>; deploymentIds: Array<string | number>; artifactJobIds: Array<string | number>;
}
export interface Resource {
 key: string; name: string; kind: string; status: 'COMPLETE'; sha256: string; bytes: number;
 receipt?: {method:'GET'; url:string; status:number; headers:Record<string,string>; observedAt:string; nextPage:number|null; retryAt:string|null};
 facts: Record<string,unknown>;
}
export interface Source {
 id:string; revision:number; schema:string; name:string; kind:SourceKind;
 status:'PAUSED'|'CAPTURING'|'COMPLETE'|'FAILED';
 /** Exact normalized original selection, including ID and name. */
 request:Record<string,unknown>;
 resources:Resource[]; facts:Record<string,unknown>; contentHash:string|null;
 attempts?:Array<Record<string,unknown>>; queue?:Array<Record<string,unknown>>; cursor?:number;
 retryAt?:string|null; error?:{code:string;message:string;resourceKey?:string}|null;
}
export interface Definition {
 application:{baselineSourceId:string;candidateSourceId:string;projectId:string;environmentId:string;
  /** Candidate resource keys, or an explicitly selected uploaded sourceId/original. */
  artifactKeys:string[]};
 central:{baselineSourceId:string;candidateSourceId:string;connectionId:string;origin:string};
 dependencies:Array<{id:string;label:string;sourceId:string;requirement:string;owner:string}>;
 recovery:{snapshotSourceId:string;restoreSourceId:string;custodian:string;procedure:string;quiescence:string;acceptedLossWindow:string;
  coverage:Array<{id:string;label:string;sourceId:string;status:'covered'|'not-applicable'|'missing';note:string}>};
 steps:Array<{id:string;title:string;phase:Phase;kind:StepKind;owner:string;dependsOn:string[];procedure:string;
  expectedSourceId:string;evidenceKind:EvidenceKind;formPlanId?:string}>;
 checks:Array<{id:string;label:string;phase:Phase;component:'application'|'central'|'joint';expected:string;sourceId:string;required:boolean;procedure:string}>;
}
export interface ReviewWrite {id:string;expectedRevision:number;requestId:string;reviewer:string;note:string}
export interface Decision {issueId:string;decision:'accept'|'revise'|'not-applicable';note:string}
export interface Assessment {
 hash:string; inventory:Record<string,unknown>; changes:{application:boolean;central:boolean};
 issues:Array<{id:string;code:string;severity:'blocking'|'review';label:string;detail:string;allowed:Decision['decision'][]}>;
 sourceBindings:Array<{sourceId:string;contentHash:string;kind:SourceKind;resources:Array<{key:string;sha256:string;bytes:number}>}>;
 formBindings:Array<{planId:string;contentHash:string}>;stepOrder:string[];
}
export interface StepResult {
 id:string;stepId:string;phase:Phase;sourceId:string;resourceKey:string;sourceContentHash:string;resourceSha256:string;
 reportedOutcome:'success'|'failure'|'unknown';derivedOutcome:'success'|'failure'|'unknown'|'operator-review';
 differences:string[];accepted:boolean;at:string;reviewer:string;note:string;requestId:string;
 predecessors:Array<{stepId:string;resultId:string|null}>;
}
export interface Operation {
 id:string;revision:number;name:string;schema:string;status:'DRAFT'|'FROZEN'|'RECEIVING'|'RECOVERING'|'ACCEPTED'|'RECOVERED';
 activePhase:Phase;definition:Definition;assessment:Assessment;decisions:Decision[];decisionEvents:Array<Record<string,unknown>>;
 planId:string|null;results:StepResult[];checkResults:Array<Record<string,unknown>>;history:Array<Record<string,unknown>>;
 readiness:{canFreeze:boolean;canAccept:boolean;issues:Array<Record<string,unknown>>};fromId:string|null;
}
export interface ReleaseOperations {
 state():{schema:string;workspaceId:string;capabilities:{gitlabReadOnly:true;softwareMutation:false};
  sources:Source[];operations:Array<Partial<Operation>>;activeOperations:string[];sourceKinds:SourceKind[];stepKinds:StepKind[];evidenceKinds:EvidenceKind[];
  connections:Array<{id:string;name:string;url:string;projectIds:string[]|null}>;centralConnections:Array<{id:string;name:string;url:string;verifiedAt:string}>;formPlans:Array<Record<string,unknown>>};
 receiveGitLab(input:GitLabSelection):Source;
 resumeSource(input:{id:string}):Source;
 receiveOriginal(input:{id:string;kind:Exclude<SourceKind,'gitlab'>;name:string;gitlabSourceId?:string;jobId?:string},stream:AsyncIterable<Uint8Array>):Promise<Source>;
 getSource(input:{id:string}|string):Source;
 getOperation(input:{id:string}|string):Operation;
 getPlan(input:{id:string}|string):Record<string,unknown>;
 getRequest(input:{requestId:string}|string):{requestId:string;action:string;input:Record<string,unknown>;result:Operation;at:string};
 createOperation(input:{id:string;name:string;definition:Definition;requestId:string}):Operation;
 successorOperation(input:{id:string;fromId:string;name:string;definition:Definition;requestId:string;reviewer:string;note:string}):Operation;
 reviseOperation(input:ReviewWrite&{name?:string;definition:Definition}):Operation;
 decide(input:ReviewWrite&{decisions:Decision[]}):Operation;
 freeze(input:ReviewWrite):Operation;
 receiveStep(input:ReviewWrite&{stepId:string;sourceId:string;resourceKey:string;reportedOutcome:'success'|'failure'|'unknown'}):Operation;
 recordCheck(input:ReviewWrite&{checkId:string;actual:string;sourceId:string;resourceKey:string;decision:'accept'|'reject'|'pending'}):Operation;
 beginRecovery(input:ReviewWrite):Operation;
 acceptOperation(input:ReviewWrite):Operation;
 file(input:{sourceId:string;resourceKey:string}):Promise<{path:string;name:string;kind:string;sourceId:string;sha256:string;bytes:number}>;
 exportHandover(input:{id:string}):Record<string,unknown>;
}
export declare const RELEASE_OPERATIONS_SCHEMA:string;
export declare function createCentralReleaseOperations(options:{workspace:unknown;store:unknown;formReleases?:unknown;fetchImpl?:typeof fetch;gitlabConnections?:GitLabConnection[]}):ReleaseOperations;
export declare function composeCentralReleaseOperations(options:{workspace:unknown;store:unknown;formReleases?:unknown;fetchImpl?:typeof fetch;gitlabConnections?:GitLabConnection[]}):{operations:ReleaseOperations;extension:unknown};
export declare function openCentralReleaseOperations(options:{directory:string;fetchImpl?:typeof fetch;gitlabConnections?:GitLabConnection[];extend?:(context:unknown)=>void|Promise<void>}):Promise<{workspace:unknown;operations:ReleaseOperations;extensions:unknown[];close():Promise<void>}>;
