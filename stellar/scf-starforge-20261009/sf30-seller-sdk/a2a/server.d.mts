import type { Server } from 'node:http';
import type { A2AWorkspace, WorkspaceOptions, JsonObject } from './workspace.mjs';
export const A2A_STARTUP_SCHEMA:string;
export const A2A_PROBE_SCHEMA:string;
export const A2A_LAUNCH_FILE:string;
export interface A2AServerOptions extends Partial<WorkspaceOptions> {workspace?:A2AWorkspace;closeWorkspace?:boolean;port?:number;connectionFileSha256?:string|null;nativeFactory?:(...args:any[])=>unknown;facilitator?:string;allowLocalFacilitator?:boolean}
export interface A2AService {server:Server;workspace:A2AWorkspace;origin:string;url:string;token:string;startup:JsonObject;probe():JsonObject;close():Promise<{closed:boolean;workspaceClosed:boolean}>}
export function startA2AWorkspaceServer(options:A2AServerOptions):Promise<A2AService>;
