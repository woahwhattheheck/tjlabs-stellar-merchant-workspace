import type { A2AWorkspace, Project, JsonObject, Exported, Received, Edition, ArtifactFile, Review } from './workspace.mjs';
export function encodePacket(packet:JsonObject):Exported;
export function decodePacket(bytes:Buffer|Uint8Array):JsonObject;
export function makePacket(workspace:A2AWorkspace,projectId:string,options?:{revision?:number|null;handoffId?:string|null;includePrivate?:boolean}):JsonObject;
export function makeResultPacket(workspace:A2AWorkspace,project:Project,editionId:string,options?:{includePrivate?:boolean}):JsonObject;
export function receiveIntoWorkspace(workspace:A2AWorkspace,packet:JsonObject,options:{requestId:string;packetSha256:string}):Received;
export function inspectResultPacket(bytes:Buffer|Uint8Array):{schema:string;sha256:string;project:{id:string;title:string;revision:number;originWorkspaceId:string};edition:Edition;agent:string;nativeTaskId:string|null;files:ArtifactFile[];review:Review;packet:JsonObject};
