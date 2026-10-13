export interface ZoteroAgentConfiguration{schema:'stellar-forge.zotero-agent-connection.v1';workspaces:Record<string,{label:string;mode:'managed'|'owned';directory:string;connectionFile:string;researchDirectory?:string;files:Record<string,{path:string;identity:Record<string,string>|null}>}>}
export declare function readZoteroAgentConfiguration(path:string):Promise<ZoteroAgentConfiguration>;
export declare class MerchantZoteroWorkspaces{
 constructor(config:{zoteroWorkspaces?:ZoteroAgentConfiguration;exportsDirectory:string},options?:{environment?:Record<string,string|undefined>});
 readonly summary:Record<string,unknown>;call(name:string,args?:Record<string,unknown>):Promise<unknown>;requestClose():void;close():Promise<void>;
}
export declare const ZOTERO_AGENT_CONNECTION_SCHEMA:'stellar-forge.zotero-agent-connection.v1';
export {zoteroTools} from './catalog.mjs';
