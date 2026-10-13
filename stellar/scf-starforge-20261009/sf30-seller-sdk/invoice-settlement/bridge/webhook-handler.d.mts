import type {IncomingMessage,ServerResponse} from 'node:http';
import type {BridgeOperator} from './operator.mjs';
export function createBridgeWebhookHandler(input:{
  operator:BridgeOperator;endpointId:string;publicKeyPem:string;maxBodyBytes?:number;
  onError?:(error:{code:string;message:string})=>void;
}):{handle(request:IncomingMessage,response:ServerResponse):Promise<void>;close():Promise<{state:'CLOSED'}>;inspect():{closing:boolean;closed:boolean;requests:number;active:number}};
