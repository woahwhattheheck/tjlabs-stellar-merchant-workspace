/// <reference types="node" />
export interface MunicipalIdentity {
  schema:"stellar-forge.municipal-asset-identity.v1";
  directory:string;
  workspace:{schema:"stellar-forge.municipal-asset-identity.v1";id:string;created_ms:number};
  database:{path:string;dev:string;ino:string};
}
export interface MunicipalInspection {
  schema:"stellar-forge.municipal-asset-inspection.v1";
  binding:MunicipalIdentity;
  bindingSha256:string;
  passwordFile:string;
  sourceSha256:string;
  projects:Array<{id:string;title:string;mode:string;revision:number;created_at:number}>;
  source:{root:string;sha256:string;manifestPath:string;files:Array<{path:string;bytes:number;sha256:string;absolutePath:string}>};
}
export declare const SOURCE:string;
export declare const ROOT:string;
export declare const STARTUP:string;
export declare function inspectSource(root?:string,expected?:string|null):Promise<MunicipalInspection["source"]>;
export declare function inspectWorkspace(python:string,directory:string,options?:{root?:string;sourceSha256?:string|null}):Promise<MunicipalInspection>;
export declare function runNative(python:string,args:string[],options?:{root?:string;stdin?:"inherit"|"ignore"}):Promise<{code:number|null;signal:NodeJS.Signals|null}>;

export interface MunicipalConnection {
  schema:"stellar-forge.municipal-asset-connection.v1";
  url:string;passwordFile:string;binding:MunicipalIdentity;
  bindingSha256:string;sourceSha256:string;instanceId:string;pid:number;
}
export declare function readConnection(request:Record<string,unknown>,startup:Record<string,unknown>):Promise<MunicipalConnection>;
