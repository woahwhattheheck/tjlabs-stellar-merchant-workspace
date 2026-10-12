import type { A2AWorkspace, JsonObject } from './workspace.mjs';
export function stageA2APublication(workspace:A2AWorkspace,options:{id:string;publicationId:string;releases:string;releaseId:string;label?:string;runtime?:JsonObject}):Promise<Record<string,unknown>>;
