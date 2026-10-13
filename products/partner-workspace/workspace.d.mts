import type {PartnerReply,PartnerBinding} from './client.mjs';
export interface PartnerConnectionEntry{directory:string;label?:string;sourceDirectory?:string;python?:string;sourceRoot?:string;sourceManifest?:string;workspaceArchive?:string;receiveArchive?:string;transferDirectory?:string;binding?:PartnerBinding;}
export interface PartnerConnection{schema:'stellar-forge.partner-workspace-connection.v1';workspaces:Record<string,PartnerConnectionEntry>;selectionSha256?:string;}
export declare function readPartnerWorkspaceConfiguration(path:string):Promise<PartnerConnection>;
export declare class MerchantPartnerWorkspaces{
 constructor(config:{partnerWorkspaces?:PartnerConnection});
 readonly summary:{configured:boolean;ownership:string;workspaces:{workspace:string;label:string}[];activeCalls:number;closing:boolean};
 call(name:string,args?:Record<string,unknown>):Promise<PartnerReply&{workspace:string}>;close():Promise<void>;
}
