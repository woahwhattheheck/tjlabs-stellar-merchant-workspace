import type { A2AWorkspace, Project, Edition, Publication, JsonObject } from './workspace.mjs';
export const MAX_PAID_RESULT_BYTES:number;
export function prepareA2APublication(options:{workspace:A2AWorkspace;project:Project;edition:Edition;input:{requestId:string;title?:string;publicOrigin:string;routePath:string;payment:JsonObject}}):Publication;
export interface PublicationOptions {id:string;publicationId:string;directory?:string|null}
export interface MaterializedPublication {directory:string;configPath:string;assetPath:string;publication:Publication}
export function materializeA2APublication(workspace:A2AWorkspace,options:PublicationOptions):MaterializedPublication;
export interface MerchantOptions extends PublicationOptions {port?:number;nativeFactory?:(...args:any[])=>unknown;facilitator?:string;allowLocalFacilitator?:boolean;availabilityDirectory?:string}
export function startA2AMerchant(workspace:A2AWorkspace,options:MerchantOptions):Promise<{seller:unknown;publication:Publication;url:string;mode:string;close():Promise<unknown>}>;
