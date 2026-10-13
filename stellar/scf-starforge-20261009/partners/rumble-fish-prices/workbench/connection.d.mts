import type {ConsumerState,ConsumerSummary,ConsumerEdition,ConsumerValues,ConsumerConfigurationInput,CreateConsumerEditionInput,ReviewConsumerEditionInput} from './consumer.mjs';
import type {Workbench,JsonResult} from './runner.mjs';
export interface RumbleConnectionView {instanceId:string;workspaceId:string;startedAt:string;origin:string;pid:number}
export interface RumbleConnection {path:string;sha256:string;token:string;value:RumbleConnectionView&{schema:string;directory:string;directoryIdentity:{dev:string;ino:string};url:string}}
export const RUMBLE_CONNECTION_SCHEMA:string;
export const RUMBLE_STARTUP_SCHEMA:string;
export const RUMBLE_CONNECTION_FILENAME:'rumble.connection.json';
export const RUMBLE_MAX_RESPONSE_BYTES:number;
export function readRumbleConnection(path:string,options?:{directory?:string;workspaceId?:string}):Promise<RumbleConnection>;
export function inspectRumbleListener(connection:RumbleConnection):Promise<RumbleConnectionView&{schema:string;revision:number}>;
export class RumbleWorkspaceClient {
  static connect(path:string,options?:{directory?:string;workspaceId?:string;expectedInstanceId?:string}):Promise<RumbleWorkspaceClient>;
  readonly connection:RumbleConnectionView;
  browser():Promise<RumbleConnectionView&{url:string}>;
  state():ReturnType<Workbench['snapshot']>;
  consumers():Promise<ConsumerSummary[]>;
  consumer(input:{consumerId:string}):Promise<ConsumerState>;
  edition(input:{consumerId:string;editionId?:string}):Promise<ConsumerEdition>;
  values(input:{consumerId:string;editionId?:string}):Promise<ConsumerValues>;
  csv(input:{consumerId:string;editionId?:string}):Promise<{bytes:Uint8Array;sha256:string;contentType:string|null}>;
  saveConsumer(input:{consumerId:string;expectedRevision:number;configuration:ConsumerConfigurationInput}):ReturnType<Workbench['saveConsumer']>;
  createEdition(input:CreateConsumerEditionInput):ReturnType<Workbench['createConsumerEdition']>;
  reviewEdition(input:ReviewConsumerEditionInput):ReturnType<Workbench['reviewConsumerEdition']>;
  configure(input:Parameters<Workbench['save']>[0]):ReturnType<Workbench['save']>;
  plan(input:Parameters<Workbench['plan']>[0]):ReturnType<Workbench['plan']>;
  getPlan(input:{planId:string}):ReturnType<Workbench['getPlan']>;
  start(input:{planId:string}):ReturnType<Workbench['start']>;
  pause():ReturnType<Workbench['pause']>;
  resume(input:{runId:string}):ReturnType<Workbench['resume']>;
  result(input:{runId:string;taskId:string}):Promise<JsonResult>;
  exportBundle():Promise<{bytes:Uint8Array;sha256:string;bundle:{schema:string;workspaceId:string;revision:number;files:Record<string,unknown>[]}}>;
  close():Promise<void>;
}
