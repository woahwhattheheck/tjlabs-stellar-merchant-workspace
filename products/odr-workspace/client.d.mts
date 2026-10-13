export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export interface Binding {installation_id:string; source_identity:string}
export interface Selection {directory:string;sourceDirectory?:string;python?:string;binding?:Binding;environment?:NodeJS.ProcessEnv}
export interface Reply {schema:'stellar-forge.odr-operation-result.v1';ok:true;operation:string;request_id?:string;installation:Json;result:Json;replayed:boolean;adapter_sha256:string}
export declare const ODR_REQUEST_SCHEMA:string,ODR_RESULT_SCHEMA:string,ODR_SOURCE:string,ODR_MAX_REQUEST_BYTES:number,ODR_MAX_REPLY_BYTES:number;
export declare function odrError(code:string,message:string):Error&{code:string};
export declare function plain(value:unknown):boolean;
export declare function exact(value:unknown,fields:string[],required?:string[]):void;
export declare function selectedPath(value:string,base?:string):string;
export declare function requestId(value:string):string;
export declare function readPrivateJSON(path:string,maximum?:number):Promise<{path:string;bytes:Uint8Array;value:Json}>;
export declare function canonicalDirectory(path:string,options?:{missing?:boolean;privateOnly?:boolean}):Promise<string>;
export declare class OdrInstallation {
 constructor(selection:Selection);
 readonly selection:Omit<Selection,'environment'>;
 readonly activeCalls:number;
 call(operation:string,args?:Record<string,Json>,requestId?:string):Promise<Reply>;
 inspect():Promise<Reply>;source(input:{application:string}):Promise<Reply>;
 prepare(input:{application:string;node:string;python?:string;handover?:string},requestId:string):Promise<Reply>;
 receive(input:{archive_path:string;node:string;python?:string},requestId:string):Promise<Reply>;
 snapshot(output:string,requestId:string):Promise<Reply>;
 adoptSource(input:{application:string},requestId:string):Promise<Reply>;
 state():Promise<Reply>;record(kind:string,id:string):Promise<Reply>;history(kind:string,id:string):Promise<Reply>;
 receiveWorkspace(file:string,expectedDigest:string,requestId:string):Promise<Reply>;
 export(kind:'workspace'|'report'|'application',output:string,requestId:string):Promise<Reply>;
 request(requestId:string,originInstallationId?:string):Promise<Reply>;close():Promise<void>;
}
