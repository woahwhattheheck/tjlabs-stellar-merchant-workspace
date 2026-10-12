/// <reference types="node" />
import type {Server} from "node:http";
import type {AlliumConnection} from "./connection.mjs";
export interface AlliumManagedOptions {directory:string;workspaceId?:string;port?:number;env?:NodeJS.ProcessEnv;allowLoopback?:boolean}
export interface AlliumManagedService {
  schema:string;directory:string;workspaceId:string;instanceId:string;pid:number;startedAt:string;
  origin:string;url:string;token:string;server:Server;connection:{path:string;sha256:string;bytes:number;value:AlliumConnection["value"]};
  workspace:unknown;close():Promise<void>;
}
export declare function alliumManagedOptions(argv:string[]):AlliumManagedOptions;
export declare function startManagedAlliumWorkspace(options:AlliumManagedOptions):Promise<AlliumManagedService>;
export declare function alliumStartup(service:AlliumManagedService):{
  schema:"stellar-forge.allium-workspace-startup.v1";status:"ALLIUM_WORKSPACE_READY";directory:string;
  workspaceId:string;instanceId:string;pid:number;connectionFile:string;connectionSha256:string;origin:string;url:string;
};
export declare function runManagedAlliumCli(argv?:string[],options?:{stdout?:Pick<NodeJS.WriteStream,"write">;waitForClose?:boolean}):
  Promise<AlliumManagedService|{help:true}|{status:"CLOSED";instanceId:string}>;
