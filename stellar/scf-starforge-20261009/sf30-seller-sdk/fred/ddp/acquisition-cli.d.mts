export const FRED_DDP_ACQUISITION_HELP:string;
export function runFredDdpAcquisitionCli(argv?:string[],options?:{
  stdout?:{write(text:string):unknown};stderr?:{write(text:string):unknown};signal?:AbortSignal;fetchImpl?:typeof fetch;
}):Promise<unknown>;
