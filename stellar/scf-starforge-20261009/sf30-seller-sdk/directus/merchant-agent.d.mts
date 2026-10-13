export interface DirectusWorkspaceDefinition {label?:string;directory:string;workspaceDirectory?:string;projectKey?:string;mode?:'managed'|'owned';files?:Record<string,string>;connections?:Record<string,{baseUrl:string;tokenEnv:string}>;runtimes?:Record<string,string>}
export interface DirectusConfigurationDocument {schema:'stellar-forge.directus-agent-connection.v1';workspaces:Record<string,DirectusWorkspaceDefinition>}
export interface DirectusConfiguration {schema:'stellar-forge.directus-agent-connection.v1';workspaces:Record<string,Record<string,unknown>>}
export function readDirectusConfiguration(path:string):Promise<DirectusConfiguration>;
export class MerchantDirectusWorkspaces {
 constructor(config:{directusWorkspaces?:DirectusConfiguration;exportsDirectory:string},options?:{environment?:Record<string,string|undefined>});
 readonly summary:Record<string,unknown>;
 call(name:string,args?:Record<string,unknown>):Promise<unknown>;requestClose():void;close():Promise<void>;
}
export const DIRECTUS_AGENT_CONNECTION_SCHEMA:'stellar-forge.directus-agent-connection.v1';
export {directusTools} from './catalog.mjs';
