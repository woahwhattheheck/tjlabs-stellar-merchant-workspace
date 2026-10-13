// MIT. The source-owned Merchant provider for an original TIND workspace.
import type {JSONObject} from './client.mjs';
export interface TindWorkspaceHostInput {label?:string;directory:string;mode?:'managed'|'owned';pythonExecutable?:string;files?:Record<string,string>;directories?:Record<string,string>;authorizationEnvironments?:string[]}
export interface TindConnectionDocument {schema:'stellar-forge.tind-workspace-connection.v1';workspaces:Record<string,TindWorkspaceHostInput>}
export interface ConfiguredPath {path:string;identity:{dev:string;ino:string;size:string;mtime:string}}
export interface TindWorkspaceDefinition {label:string;directory:string;mode:'managed'|'owned';pythonExecutable?:string;files:Record<string,ConfiguredPath>;directories:Record<string,ConfiguredPath>;authorizationEnvironments:string[]}
export interface TindWorkspaceConfiguration {schema:'stellar-forge.tind-workspace-connection.v1';workspaces:Record<string,TindWorkspaceDefinition>}
export const TIND_WORKSPACE_CONNECTION_SCHEMA:string;
export function readTindWorkspaceConfiguration(path:string):Promise<TindWorkspaceConfiguration>;
export function tindWorkspaceTools<T>(tool:(name:string,description:string,properties:Record<string,unknown>,required:string[],annotations:Record<string,boolean>)=>T):T[];
export class MerchantTindWorkspaces {
 constructor(config:{exportsDirectory:string;tindWorkspaces?:TindWorkspaceConfiguration},options?:{environment?:Record<string,string|undefined>});
 readonly summary:JSONObject;
 call(name:string,args?:JSONObject):Promise<unknown>;
 requestClose():void;
 close():Promise<void>;
}
