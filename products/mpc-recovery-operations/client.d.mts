export type Json = null|boolean|number|string|Json[]|{[key:string]:Json};
export interface Expected {workspaceId:string;revision:number;snapshotSha256:string}
export interface Snapshot {schema:"mpc.recovery-snapshot.v1";workspace:Workspace;sha256:string}
export interface Portable {format:"mpc-recovery-portable.v1";sha256:string;snapshot:Snapshot}
export interface SourceRef {sourceId:string;locator:string}
export interface Source {id:string;name:string;mediaType:string;encoding:"utf8"|"base64";content:string;bytes:number;sha256:string;origin:string;observedAt:string}
export interface Repository {id:string;name:string;location:"local"|"offsite";kind:string;sourceRefs:SourceRef[]}
export interface Workload {id:string;name:string;kind:string;description:string;dependencies:string[];repositoryIds:string[];rpoMinutes:number|null;rtoMinutes:number|null;restoreIntervalDays:number|null;sourceRefs:SourceRef[]}
export interface Plan {id:string;title:string;previousPlanId:string|null;note:string;sourceRefs:SourceRef[];repositories:Repository[];workloads:Workload[]}
export type CommandType="source.import"|"plan.save"|"plan.approve"|"backup.import"|"backup.correct"|"recovery.record"|"recovery.correct"|"acceptance.record"|"acceptance.check"|"restoreSchedule.save"|"hurricane.record"|"hurricane.correct"|"incident.record"|"incident.correct"|"communication.record"|"incidentReport.record";
export interface Command {id:string;actor:string;at:string;expectedRevision:number;type:CommandType;payload:Json}
export interface Operation {command:Command;requestSha256:string;result:Json;previousSha256:string;sha256:string}
export interface Workspace {schema:"mpc.recovery-workspace.v1";id:string;title:string;createdAt:string;updatedAt:string;revision:number;activePlanId:string|null;seed:Json;assumptions:Json[];sources:Source[];plans:(Plan&{createdAt:string;actor:string;requestId:string;sha256:string})[];approvals:Json[];backups:Json[];recoveries:Json[];hurricanes:Json[];incidents:Json[];acceptanceRecords:Json[];acceptanceChecks:Json[];restoreSchedules:Json[];incidentReports:Json[];communications:Json[];operations:Operation[]}
export interface BranchSummary extends Expected {schema:"mpc-browser-branch.v1";id:string;label:string;storeId:string;createdAt:string;updatedAt:string;origin:Json;creationSha256:string}
export interface BranchRecord extends BranchSummary {snapshot:Snapshot}
export interface StoreIdentity {schema:"stellar-forge.mpc-recovery-store.v1";id:string;directory:string;title:string;createdAt:string;defaultBranchId:string;creationInputHash:string;sourceSha256:string}
export interface Selection {id:string;expected:Expected}
export interface CreateInput {id:string;label:string;snapshot:Snapshot;origin:Json;requestId:string}
export interface SaveInput extends Selection {snapshot:Snapshot;requestId:string}
export interface CommandInput extends Selection {command:Command;requestId:string}
export interface CommandResult {branch:BranchRecord;result:Json;replayed:boolean}
export interface ProposalInput extends Selection {input:{id:string;actor:string;at:string;name:string;origin:string;content:string};requestId:string}
export type ReportKind="overview"|"serviceReview"|"acceptance"|"recoveryOrder"|"restoreDue"|"hurricaneStatus"|"incidentStatus"|"proposals"|"proposalPlanDraft"|"proposalCompare";
export interface ReportInput {id:string;expected?:Expected;kind:ReportKind;options?:{[key:string]:Json}}
export interface ReportResult {branch:BranchSummary;kind:ReportKind;result:Json}
export interface HistoryPage extends Expected {id:string;total:number;offset:number;nextOffset:number|null;items:Operation[]}
export interface FileIdentity {bytes:number;sha256:string}
export interface SourceSelection extends Selection,FileIdentity {sourceId:string}
export interface Download extends FileIdentity {mediaType:string}
export interface ConnectionOptions {connectionFile:string;storeId:string;storeDirectory:string;timeoutMs?:number}
export interface RequestReceipt {requestId:string;inputObject:FileIdentity;inputSha256:string;sequence:number;resultObject:FileIdentity;input:Json;result:BranchRecord|CommandResult}
export class MpcRecoveryError extends Error {constructor(code:string,message:string,options?:{status?:number|null;result?:unknown;uncertain?:boolean;requestId?:string|null});code:string;status:number|null;result:unknown;uncertain:boolean;requestId:string|null}
export class MpcRecoveryClient {
 constructor(options:ConnectionOptions);
 readonly selectedStore:{storeId:string;storeDirectory:string};
 state():Promise<StoreIdentity>;
 branches():Promise<BranchSummary[]>;
 branch(id:string):Promise<BranchRecord>;
 request(requestId:string):Promise<RequestReceipt|null>;
 createBranch(input:CreateInput):Promise<BranchRecord>;
 saveSnapshot(input:SaveInput):Promise<BranchRecord>;
 command(input:CommandInput):Promise<CommandResult>;
 importProposal(input:ProposalInput):Promise<CommandResult>;
 report(input:ReportInput):Promise<ReportResult>;
 historyPage(input:Selection&{offset?:number;limit?:number}):Promise<HistoryPage>;
 history(input:Selection&{limit?:number}):AsyncGenerator<HistoryPage,void,unknown>;
 exportBranch(input:Selection):Promise<Portable>;
 downloadSource(input:SourceSelection,onChunk:(chunk:Uint8Array)=>void|Promise<void>):Promise<Download>;
 receiveFile(input:Omit<CreateInput,"snapshot">,file:string,descriptor:FileIdentity):Promise<BranchRecord>;
 importSourceFile(input:CommandInput,file:string,descriptor:FileIdentity):Promise<CommandResult>;
 close():Promise<void>;
}
export function createMpcRecoveryClient(options:ConnectionOptions):MpcRecoveryClient;
