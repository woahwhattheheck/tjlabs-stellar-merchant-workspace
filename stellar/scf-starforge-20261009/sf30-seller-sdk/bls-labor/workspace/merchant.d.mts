export interface BlsAnalystWorkspaceDefinition {label?:string;directory:string;mode?:'managed'|'owned';pythonExecutable?:string;files?:Record<string,string>;destinations?:Record<string,string>}
export interface BlsAnalystConfigurationDocument {schema:'stellar-forge.bls-analyst-connection.v1';workspaces:Record<string,BlsAnalystWorkspaceDefinition>}
export interface BlsAnalystConfiguration {schema:'stellar-forge.bls-analyst-connection.v1';workspaces:Record<string,Record<string,unknown>>}
export function readBlsAnalystConfiguration(path:string):Promise<BlsAnalystConfiguration>;
export class MerchantBlsAnalystWorkspaces {
 constructor(config:{blsAnalystWorkspaces?:BlsAnalystConfiguration;exportsDirectory:string},options?:{environment?:Record<string,string|undefined>});
 readonly summary:Record<string,unknown>;
 call(name:string,args?:Record<string,unknown>):Promise<unknown>;
 requestClose():void;close():Promise<void>;
}
export const BLS_ANALYST_CONNECTION_SCHEMA:'stellar-forge.bls-analyst-connection.v1';
export {blsAnalystTools} from './catalog.mjs';
