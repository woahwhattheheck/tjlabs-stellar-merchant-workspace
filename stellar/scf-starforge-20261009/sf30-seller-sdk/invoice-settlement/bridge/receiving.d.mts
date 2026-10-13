import type {BridgeReceivingInput,BridgeReceivingResult} from './operator.mjs';
export function runBridgeReceiving(input:BridgeReceivingInput,options?:{signal?:AbortSignal;inspectOnly?:boolean}):Promise<BridgeReceivingResult>;
