export const FRED_OPERATING_HELP:string;
export type FredOperatingAction='help'|'archive-export'|'archive-inspect'|'archive-receive'|'capture'|'inspect-package'|'receive-source'|'create'|'record'|'inspect'|'show'|'compare'|'receive';
export interface FredOperatingArguments {action:FredOperatingAction;options:{request?:string;out?:string;plan?:string;existing?:string;source?:string;catalog?:string;revision?:number;format?:'json'|'markdown'|'html'}}
export function parseFredOperatingArguments(input:readonly string[]):FredOperatingArguments;
/** Writes create-only original outputs; identical complete replay is received without replacement. */
export function mainFredOperatingPlan(args?:string[],options?:{log?:(text:string)=>void;signal?:AbortSignal}):Promise<unknown>;
