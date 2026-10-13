export type ZoteroRequestId=string;
export type ZoteroReadMethod='state'|'record.get'|'record.list'|'record.history'|'edition.get'|'project.get'|'project.page'|'capture.get'|'research.get'|'research.preview'|'project.return.preview';
export type ZoteroMethod='profile.save'|'capture.prepare'|'capture.control'|'project.save'|'project.decide'|'edition.compare'|'research.prepare'|'research.receive'|'project.return.prepare'|'project.return.review'|'project.return.apply';
export interface ZoteroRequest{requestId:ZoteroRequestId;method:ZoteroMethod;input:Record<string,unknown>}
export interface ZoteroAttachment{directory:string;mode?:'managed'|'owned';connectionFile?:string;researchDirectory?:string;exportDirectory:string;environment?:Record<string,string|undefined>}
export interface ZoteroRequestRecord{id:string;revision:number;requestId:string;requestSha256:string;request:{requestId:string;method:string;input:Record<string,unknown>;source?:{bytes:number;sha256:string}};status:'PREPARED'|'RUNNING'|'COMPLETE'|'RESUME_REQUIRED';active:boolean;displayStatus:string;result:unknown;lastError:string|null}
export interface ZoteroExportSelection{kind:'workspace'|'record';record?:{kind:string;id:string;revision?:number;role?:string;name?:string}}
export interface ZoteroExport{request:{workspaceId:string;requestId:string;selection:ZoteroExportSelection};chosen:ZoteroExportSelection;file:{name:string;bytes:number;sha256:string;contentType:string}}
export declare function attachZoteroWorkspace(options:ZoteroAttachment):Promise<ZoteroOperatorClient>;
export declare class ZoteroOperatorClient{
 readonly instanceId:string;readonly workspaceId:string;readonly summary:{instanceId:string;workspaceId:string;mode:'managed'|'owned';sourceSha256:string};
 verify():Promise<ZoteroOperatorClient['summary']>;
 view(method:ZoteroReadMethod,input?:Record<string,unknown>):Promise<unknown>;
 request(id:string):Promise<ZoteroRequestRecord|null>;
 save(request:ZoteroRequest):Promise<ZoteroRequestRecord>;
 resume(id:string):Promise<ZoteroRequestRecord>;
 cancel(requestId:string,captureId:string):Promise<ZoteroRequestRecord>;
 importDocuments(input:{requestId:string;profileId:string;profileRevision:number},sourcePath:string,options?:{sourceAlias?:string|null;verifySource?:()=>Promise<unknown>}):Promise<ZoteroRequestRecord>;
 importProjectReturn(input:{requestId:string;projectId:string},sourcePath:string,options?:{sourceAlias?:string|null;verifySource?:()=>Promise<unknown>}):Promise<ZoteroRequestRecord>;
 receive(input:{requestId:string;name:string},sourcePath:string,options?:{sourceAlias?:string|null;verifySource?:()=>Promise<unknown>}):Promise<unknown>;
 receiver(name:string):Promise<unknown>;
 export(id:string,selection?:ZoteroExportSelection):Promise<ZoteroExport>;
 retained(id:string):Promise<{readonlyFileHandle:import('node:fs/promises').FileHandle;bytes:number;sha256:string;name:string;type:string}>;
 requestClose():void;close():Promise<{instanceId:string;state:'CLOSED'|'DETACHED'}>;
}
export declare function privateDirectory(path:string,options?:{create?:boolean}):Promise<string>;
export declare function readPrivate(path:string,maximum?:number):Promise<Buffer>;
export declare function originalFile(path:string,maximum?:number):Promise<{path:string;bytes:number;sha256:string;identity:Record<string,string>}>;
