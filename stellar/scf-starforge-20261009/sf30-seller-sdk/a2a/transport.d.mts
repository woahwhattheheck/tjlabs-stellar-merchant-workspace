import type { Connection, JsonObject, MessageRequest, Selection } from './workspace.mjs';
export function loadA2ASdk():Promise<{types:typeof import('@a2a-js/sdk');client:typeof import('@a2a-js/sdk/client');identity:{package:string;version:string;commit:string}}>;
export function normalizeAgentCard(raw:JsonObject):Promise<JsonObject>;
export function normalizeMessageRequest(value:MessageRequest):Promise<MessageRequest>;
export function selectInterface(card:JsonObject,index:number,connection:Required<Connection>,extensions?:string[]):Selection['interface'];
export interface CapturedFetchOptions {connection:Required<Connection>;endpoint?:string|null;kind?:'agent'|'card'|'artifact';onWire?:(event:Record<string,unknown>)=>void;signal?:AbortSignal;fetchImpl?:typeof fetch|null;maxBytes?:number}
export function createCapturedFetch(options:CapturedFetchOptions):typeof fetch&{close():Promise<void>};
export function captureAgentCard(options:CapturedFetchOptions):Promise<{card:JsonObject;bytes:Buffer}>;
export function executeA2A(options:CapturedFetchOptions&{card:JsonObject;selection:Selection;method:'sendMessage'|'sendMessageStream'|'getTask'|'listTasks'|'cancelTask'|'resubscribeTask';params:JsonObject;onEvent?:(event:{kind:string;value:JsonObject})=>unknown}):Promise<{kind:string;value:JsonObject|null;events?:number;runtime:{package:string;version:string;commit:string}}>;
export function fetchArtifact(options:CapturedFetchOptions&{url:string}):Promise<{bytes:Buffer;headers:Record<string,string>}>;
