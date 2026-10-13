import type {ConsumerConfigurationInput,CreateConsumerEditionInput,ReviewConsumerEditionInput} from './consumer.mjs';
export const RUMBLE_MCP_CONNECTION_SCHEMA:'stellar-forge.rumble-workspace-connection.v1';
export interface RumbleHostWorkspace {
  label?:string;directory:string;workspaceId:string;
  inputs?:Record<string,{label?:string;kind:'book'|'configuration'|'plan'|'bundle';file:string;sha256:string}>;
  destinations?:Record<string,{label?:string;directory:string}>;
  wallets?:Record<string,{label?:string;directory:string}>;
}
export interface RumbleHostConfiguration {schema:typeof RUMBLE_MCP_CONNECTION_SCHEMA;workspaces:Record<string,RumbleHostWorkspace>}
export interface RumbleResolvedConfiguration {configuration:string;sha256:string;workspaces:Record<string,unknown>}
export function readRumbleWorkspaceConfiguration(path:string):Promise<RumbleResolvedConfiguration>;
type Scope={workspace:string};type Source=Scope&{sourceInput:string;expectedSourceSha256:string};
export interface RumbleToolArguments {
  merchant_rumble_status:{workspace?:string;offset?:number;limit?:number;expectedRevision?:number};
  merchant_rumble_connect:Scope&{expectedInstanceId?:string};
  merchant_rumble_disconnect:Scope&{instanceId:string};
  merchant_rumble_browser:Scope;
  merchant_rumble_consumer:Scope&{consumerId:string};
  merchant_rumble_edition:Scope&{consumerId:string;editionId:string};
  merchant_rumble_save_consumer:Source&{consumerId:string;expectedRevision:number};
  merchant_rumble_create_edition:Scope&CreateConsumerEditionInput;
  merchant_rumble_review_edition:Scope&ReviewConsumerEditionInput;
  merchant_rumble_configure:Source&{expectedRevision:number};
  merchant_rumble_plan:Source;
  merchant_rumble_get_plan:Scope&{planId:string};
  merchant_rumble_start:Scope&{planId:string};
  merchant_rumble_pause:Scope;
  merchant_rumble_resume:Scope&{runId:string};
  merchant_rumble_result:Scope&{runId:string;taskId:string};
  merchant_rumble_export:Scope&{operationId:string;kind:'workspace'|'values'|'csv';consumerId?:string;editionId?:string;expectedRevision:number};
  merchant_rumble_exports:Scope&{offset?:number;limit?:number};
  merchant_rumble_file:Scope&{fileId:string;readId?:string;expectedSha256?:string;offset?:number;limit?:number};
  merchant_rumble_file_release:Scope&{readId:string};
  merchant_rumble_receive:Source&{destination:string};
  merchant_rumble_received:Scope&{destination:string};
  merchant_rumble_wallet_receive:Scope&{consumerId:string;editionId?:string;wallet:string;expectedWalletSha256:string|null};
  merchant_rumble_wallet:Scope&{wallet:string};
}
export class MerchantRumbleWorkspaces {
  constructor(config:{rumbleWorkspaces?:RumbleResolvedConfiguration;exportsDirectory:string});
  readonly summary:{configured:boolean;connected:string[];pending:number;closing:boolean;[key:string]:unknown};
  call<K extends keyof RumbleToolArguments>(name:K,args:RumbleToolArguments[K]):Promise<unknown>;
  close():Promise<void>;
}
export function rumbleWorkspaceTools<T>(tool:(name:string,description:string,properties:Record<string,unknown>,required:string[],
  annotations?:{readOnly?:boolean;idempotent?:boolean;openWorld?:boolean})=>T):T[];
