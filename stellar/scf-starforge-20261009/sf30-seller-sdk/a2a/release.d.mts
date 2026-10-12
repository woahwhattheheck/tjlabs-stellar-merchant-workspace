import type { JsonObject } from './workspace.mjs';
export const A2A_SOURCE_SCHEMA:string;
export function prepareA2ARelease(packageDirectory:string):Promise<Record<string,any>>;
export function stageA2ARelease(directory:string,packageDirectory:string):Promise<Record<string,any>>;
export function inspectA2ARelease(directory:string):Promise<Record<string,any>>;
export function startA2ARelease(directory:string,options?:{runtime?:JsonObject;nativeFactory?:(...args:any[])=>unknown}):Promise<Record<string,any>&{close():Promise<unknown>}>;
export function launch(args?:string[]):Promise<Record<string,any>&{close():Promise<unknown>}>;
