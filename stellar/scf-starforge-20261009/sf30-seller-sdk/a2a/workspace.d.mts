import type { Buffer } from 'node:buffer';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export interface Connection {
  id:string; label?:string; cardUrl:string; allowedOrigins:string[]; trustedOrigins?:string[]; artifactOrigins?:string[];
  credential?:{scheme:'Bearer'|'Basic'|'ApiKey';env:string}; timeoutMs?:number; streamMs?:number;
}
export interface ConnectionView { id:string;label:string;cardUrl:string;allowedOrigins:string[];trustedOrigins:string[];artifactOrigins:string[];authentication:{scheme:string;configured:boolean};timeoutMs:number;streamMs:number }
export interface Part { text?:string;raw?:string;url?:string;data?:Json;filename?:string;mediaType?:string;metadata?:JsonObject }
export interface Message {messageId:string;role:'ROLE_USER'|'ROLE_AGENT';parts:Part[];taskId?:string;contextId?:string;metadata?:JsonObject;extensions?:string[];referenceTaskIds?:string[]}
export interface MessageRequest {message:Message;configuration?:JsonObject;metadata?:JsonObject}
export interface AgentInterface {url:string;protocolBinding:string;protocolVersion:string;tenant?:string}
export interface Selection {id:string;cardId:string;cardSha256:string;interfaceIndex:number;interface:AgentInterface;skillIds:string[];extensions:string[];reviewedAt:string;note:string}
export interface Source {id:string;createdAt:string;sha256:string;bytes:number;private:boolean;role:string;filename:string;mediaType:string;operationId:string}
export interface Card {id:string;createdAt:string;url:string;sha256:string;sourceId:string;card:JsonObject;private?:boolean}
export interface Observation {id:string;createdAt:string;operationId:string;kind:'task'|'message'|'task_list'|'stream';value:JsonObject;sha256:string;sourceId:string;sourceIds:string[];selection:Selection;private?:boolean}
export interface PreparedMessage {id:string;createdAt:string;native:MessageRequest;sha256:string;sourceId:string;selection:Selection;note:string;sendRequestId:string|null;adoptedTaskId:string|null;private?:boolean}
export interface ArtifactFile {artifactId:string|null;name:string;index:number;sourceId:string;sha256:string;bytes:number;filename:string;mediaType:string;declaredFilename:string|null;declaredMediaType:string|null;observedMediaType:string|null;url:string|null;httpCapture:{requestIndex:number;responseIndex:number;endIndex:number}|null}
export interface ArtifactCapture {id:string;createdAt:string;observationId:string;observationSha256:string;operationId:string;files:ArtifactFile[];bytes:number;complete:boolean}
export interface Review {id:string;createdAt:string;observationId:string;observationSha256:string;captureId:string|null;decision:'accepted'|'needs_work'|'rejected';note:string}
export interface Edition {id:string;createdAt:string;title:string;observationId:string;observationSha256:string;reviewId:string;captureId:string;selection:Selection;projectRevision:number}
export interface Handoff {id:string;createdAt:string;title:string;notes:string;projectRevision:number}
export type OperationState='prepared'|'running'|'complete'|'failed'|'interrupted'|'unknown';
export interface Operation {id:string;requestId:string;action:string;state:OperationState;createdAt:string;selection:Selection|null;params:JsonObject|null;wire:JsonObject[];observationIds:string[];sourceIds:string[];target:string|null;dispatchedAt?:string;finishedAt?:string;result?:Json|null;error?:PublicError|null;private?:boolean}
export interface History {revision:number;kind:string;actor:string;at:string;previousSha256:string|null;sha256:string;payload:JsonObject}
export interface Publication {id:string;createdAt:string;title:string;editionId:string;projectId:string;projectRevision:number;asset:{file:string;sha256:string;contentType:string;downloadName:string;sourceId:string;bytes:number};service:JsonObject;source:{agentCardSha256:string;observationSha256:string;editionId:string};paymentAuthority:'original-sf30-x402'}
export interface Project {schema:string;id:string;title:string;notes:string;revision:number;createdAt:string;updatedAt:string;originWorkspaceId:string;executionWorkspaceId:string;connectionId:string;connection:ConnectionView;cards:Card[];selection:Selection|null;messages:PreparedMessage[];observations:Observation[];operations:Operation[];sources:Source[];artifactCaptures:ArtifactCapture[];reviews:Review[];editions:Edition[];handoffs:Handoff[];publications:Publication[]}
export interface ProjectView extends Project {currentRevision:number;historical:boolean;localWorkspaceId:string;networkEnabled:boolean;history:History[]}
export interface PublicError {code:string;message:string;details?:Json}
export interface RequestReceipt {id:string;requestId:string;action:string;state:OperationState;createdAt:string;revision:number;result:Json|null;error:PublicError|null;active:boolean}
export interface DispatchResult extends RequestReceipt {project:ProjectView;replay?:boolean}
export interface RevisionInput {id:string;expectedRevision:number;requestId:string}
export interface ActionPayloads {
  create:{title:string;connectionId:string;notes?:string;requestId:string};
  update:RevisionInput&{title?:string;notes?:string};
  capture_card:RevisionInput;
  select_agent:RevisionInput&{cardId:string;interfaceIndex:number;skillIds:string[];note:string;extensions?:string[]};
  bind_connection:RevisionInput&{connectionId:string;note:string};
  prepare_message:RevisionInput&MessageRequest&{note:string};
  send_message:RevisionInput&{messageId:string;stream?:boolean};
  get_task:RevisionInput&{taskId:string};
  list_tasks:RevisionInput&{contextId?:string;pageToken?:string;pageSize?:number};
  subscribe_task:RevisionInput&{taskId:string};
  cancel_task:RevisionInput&{taskId:string;reason:string};
  adopt_task:RevisionInput&{messageId:string;taskId:string;note:string};
  capture_artifacts:RevisionInput&{observationId:string};
  review_result:RevisionInput&{observationId:string;captureId?:string;decision:'accepted'|'needs_work'|'rejected';note:string};
  freeze_result:RevisionInput&{observationId:string;title:string};
  create_handoff:RevisionInput&{title:string;notes?:string};
  prepare_publication:RevisionInput&{editionId:string;title:string;publicOrigin:string;routePath:string;payment:JsonObject};
}
export interface Exported {filename:string;mediaType:string;sha256:string;bytes:Buffer;uncompressedBytes:number;manifest:JsonObject}
export interface Received {projectId:string;requestId:string;status:'imported'|'advanced'|'already_present'|'older_retained';revision:number;packetSha256:string;replay?:boolean;project:ProjectView}
export interface WorkspaceOptions {directory:string;operator?:string;connections?:Connection[];fetchImpl?:typeof fetch|null}
export class A2AWorkspace {
  readonly directory:string; readonly workspaceId:string;
  list():{schema:string;workspaceId:string;sdk:{name:string;version:string;commit:string};connections:ConnectionView[];projects:Array<{id:string;title:string;notes:string;revision:number;updatedAt:string;connectionId:string;taskCount:number;editionCount:number;handoffCount:number}>};
  get(projectId:string,options?:{revision?:number|null}):ProjectView;
  request(requestId:string):RequestReceipt;
  dispatch<K extends keyof ActionPayloads>(action:K,payload:ActionPayloads[K]):Promise<DispatchResult>;
  readSource(projectId:string,sha256:string,options?:{revision?:number|null;includePrivate?:boolean}):{filename:string;mediaType:string;sha256:string;bytes:Buffer;metadata:Source};
  exportPacket(projectId:string,options?:{revision?:number|null;handoffId?:string|null;includePrivate?:boolean}):Exported;
  exportResult(projectId:string,editionId:string,options?:{includePrivate?:boolean}):Exported;
  receivePacket(bytes:Buffer|Uint8Array,options:{requestId:string}):Received;
  stop(requestId:string):{requestId:string;active:boolean;remoteCancellation?:false};
  close():Promise<void>;
}
export function openA2AWorkspace(options:WorkspaceOptions):Promise<A2AWorkspace>;
