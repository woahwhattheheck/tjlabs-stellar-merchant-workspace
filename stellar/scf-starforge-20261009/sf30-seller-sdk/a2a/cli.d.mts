export const HELP:string;
export function runA2ACli(argv?:string[],options?:{stdout?:(text:string)=>unknown;signal?:AbortSignal}):Promise<unknown>;
