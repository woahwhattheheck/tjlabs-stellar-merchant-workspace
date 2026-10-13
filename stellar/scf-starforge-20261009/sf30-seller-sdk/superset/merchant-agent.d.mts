export interface SupersetWorkspaceDefinition {label?:string;directory:string;workspaceDirectory?:string;mode?:'managed'|'owned';runtimeFile?:string;files?:Record<string,string>;destinations?:Record<string,string>}
export interface SupersetConfigurationDocument {schema:'stellar-forge.superset-agent-connection.v1';workspaces:Record<string,SupersetWorkspaceDefinition>}
export interface SupersetConfiguration {schema:'stellar-forge.superset-agent-connection.v1';workspaces:Record<string,Record<string,unknown>>}
export function readSupersetConfiguration(path:string):Promise<SupersetConfiguration>;
export class MerchantSupersetWorkspaces {
 constructor(config:{supersetWorkspaces?:SupersetConfiguration;exportsDirectory:string},options?:{environment?:Record<string,string|undefined>});
 readonly summary:Record<string,unknown>;
 call(name:string,args?:Record<string,unknown>):Promise<unknown>;
 requestClose():void;close():Promise<void>;
}
export const SUPERSET_AGENT_CONNECTION_SCHEMA:'stellar-forge.superset-agent-connection.v1';
export {supersetTools} from './catalog.mjs';
