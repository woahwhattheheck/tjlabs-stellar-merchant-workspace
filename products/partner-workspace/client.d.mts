export type PartnerProduct = 'mobility' | 'education';
export interface PartnerBinding {installation_id:string;source_identity:string;}
export interface PartnerSelection {directory:string;sourceDirectory?:string;python?:string;binding?:PartnerBinding;environment?:NodeJS.ProcessEnv;}
export interface PartnerSourceSelection {source_root:string;source_manifest:string;}
export interface PartnerPrepare extends PartnerSourceSelection {python?:string;workspace_archive?:string;}
export interface PartnerReceive {archive_path:string;python?:string;}
export interface PartnerInstallationSummary {
 installation_id:string;operation_id:string;source_identity:string;product_source_identity:string;product:PartnerProduct;title:string;workspace_id:string;
 python:{path:string;version:number[];sqlite:string};
 paths:{directory:string;source:string;application:string;workspace:string;database:string;bridge:string};
 binding:{directory:string;device:string;inode:string};received_from:null|{installation_id:string;archive_sha256:string;operation_id:string};
}
export interface PartnerReply<T=unknown>{schema:'stellar-forge.partner-operation-result.v1';ok:true;operation:string;request_id?:string;installation:PartnerInstallationSummary|null;result:T;replayed:boolean;adapter_sha256:string;}
export declare const PARTNER_SOURCE:string;
export declare const PARTNER_REQUEST_SCHEMA:string;
export declare const PARTNER_RESULT_SCHEMA:string;
export declare class PartnerInstallation {
 constructor(selection:PartnerSelection);
 readonly selection:Omit<PartnerSelection,'environment'>;readonly activeCalls:number;
 call<T=unknown>(operation:string,args?:Record<string,unknown>,requestId?:string):Promise<PartnerReply<T>>;
 inspect():Promise<PartnerReply>;source(input:PartnerSourceSelection):Promise<PartnerReply>;
 prepare(input:PartnerPrepare,requestId:string):Promise<PartnerReply>;
 receive(input:PartnerReceive,requestId:string):Promise<PartnerReply>;
 snapshot(output:string,requestId:string):Promise<PartnerReply>;
 adoptSource(input:PartnerSourceSelection,requestId:string):Promise<PartnerReply>;
 state():Promise<PartnerReply>;record(kind:string,id:string):Promise<PartnerReply>;history(kind:string,id:string):Promise<PartnerReply>;
 export(kind:'workspace'|'report'|'csv',output:string,requestId:string):Promise<PartnerReply>;
 request(requestId:string,originInstallationId?:string):Promise<PartnerReply>;close():Promise<void>;
}
export declare function canonicalDirectory(path:string,options?:{missing?:boolean;privateOnly?:boolean}):Promise<string>;
export declare function readPrivateJSON(path:string,maximum?:number):Promise<{path:string;bytes:Uint8Array;value:unknown}>;
export declare function selectedPath(path:string,base?:string):string;
