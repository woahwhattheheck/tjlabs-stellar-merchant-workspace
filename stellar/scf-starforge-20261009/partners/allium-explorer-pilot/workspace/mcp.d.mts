import type {MerchantTerms,MerchantLaunch} from "./connection.mjs";
export declare const ALLIUM_MCP_CONNECTION_SCHEMA:"stellar-forge.allium-workspace-connection.v1";
export interface AlliumHostWorkspace {
  label?:string;directory:string;workspaceId?:string;
  inputs?:Record<string,{label?:string;kind:"product"|"result"|"bundle";file:string;sha256:string}>;
  merchants?:Record<string,MerchantTerms&{label?:string}>;
  launches?:Record<string,MerchantLaunch&{label?:string}>;
  destinations?:Record<string,{label?:string;directory:string}>;
}
export interface AlliumHostConfiguration {
  schema:typeof ALLIUM_MCP_CONNECTION_SCHEMA;workspaces:Record<string,AlliumHostWorkspace>;
}
export interface AlliumResolvedConfiguration {configuration:string;sha256:string;workspaces:Record<string,unknown>}
export declare function readAlliumWorkspaceConfiguration(path:string):Promise<AlliumResolvedConfiguration>;
export interface AlliumToolArguments {
  "merchant_allium_status":{workspace?:string;offset?:number;limit?:number;expectedRevision?:number};
  "merchant_allium_connect":{workspace:string;expectedInstanceId?:string};
  "merchant_allium_disconnect":{workspace:string;instanceId:string};
  "merchant_allium_browser":{workspace:string};
  "merchant_allium_revision":{workspace:string;revisionId:string};
  "merchant_allium_acquisition":{workspace:string;acquisitionId:string};
  "merchant_allium_save_product":{workspace:string;operationId:string;expectedHead:string;sourceInput:string;expectedSourceSha256:string;note?:string};
  "merchant_allium_import_result":{workspace:string;operationId:string;revisionId:string;sourceInput:string;expectedSourceSha256:string;note?:string};
  "merchant_allium_configure":{workspace:string;operationId:string;acquisitionId:string;expectedConfigurationId:string|null;profile:string};
  "merchant_allium_merchant_start":{workspace:string;expectedConfigurationId:string;profile:string};
  "merchant_allium_download":{workspace:string;acquisitionId:string;kind:"result"|"source"|"csv"|"dataset"|"run"};
  "merchant_allium_export":{workspace:string;operationId:string;expectedRevision:number};
  "merchant_allium_exports":{workspace:string;offset?:number;limit?:number};
  "merchant_allium_file":{workspace:string;fileId:string;readId?:string;expectedSha256?:string;offset?:number;limit?:number};
  "merchant_allium_file_release":{workspace:string;readId:string};
  "merchant_allium_receive":{workspace:string;sourceInput:string;expectedSourceSha256:string;destination:string};
  "merchant_allium_received":{workspace:string;destination:string};
  "merchant_allium_restore_product":{workspace:string;operationId:string;expectedHead:string;revisionId:string;note?:string};
  "merchant_allium_start_query":{workspace:string;operationId:string;revisionId:string;note?:string};
  "merchant_allium_resume_query":{workspace:string;acquisitionId:string};
  "merchant_allium_collect_query":{workspace:string;acquisitionId:string};
  "merchant_allium_recover_query":{workspace:string;acquisitionId:string;runId:string};
  "merchant_allium_query":{workspace:string;acquisitionId:string;query?:string};
  "merchant_allium_merchant_stop":{workspace:string;expectedSessionId:string};
  "merchant_allium_refresh":{workspace:string;acquisitionId:string;expectedSnapshot:string;expectedRevision:number};
  "merchant_allium_activate":{workspace:string;snapshot:string;expectedSnapshot:string;expectedRevision:number};
  "merchant_allium_collect_versions":{workspace:string};
  "merchant_allium_publisher":{workspace:string};
  "merchant_allium_stage_publisher":{workspace:string;operationId:string;acquisitionId:string};
}
export declare class MerchantAlliumWorkspaces {
  constructor(config:{alliumWorkspaces?:AlliumResolvedConfiguration;exportsDirectory:string});
  readonly summary:{configured:boolean;connected:string[];pending:number;closing:boolean;[field:string]:unknown};
  call<K extends keyof AlliumToolArguments>(name:K,args:AlliumToolArguments[K]):Promise<unknown>;
  close():Promise<void>;
}
export declare function alliumWorkspaceTools<T>(tool:(name:string,description:string,properties:Record<string,unknown>,required:string[],
  annotations?:{readOnly?:boolean;idempotent?:boolean;openWorld?:boolean})=>T):T[];
