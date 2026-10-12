import type {ResearchClient,RequestOptions,DownloadTicket} from '../content-search/client.mjs';
import type {CaptureRequest,CaptureSummary,Captured,PrepareRequest,HandoverOperation,ExchangeStatus} from './exchange.mjs';
export class ReadingExchangeClient{
 constructor(client:ResearchClient);
 status(options?:RequestOptions):Promise<ExchangeStatus>;
 capture(value:CaptureRequest,options?:RequestOptions):Promise<CaptureSummary>;
 show(captureSha256:string,options?:RequestOptions):Promise<Captured>;
 prepare(value:PrepareRequest,options?:RequestOptions):Promise<HandoverOperation>;
 operation(operationId:string,options?:RequestOptions):Promise<HandoverOperation>;
 download(operationId:string,options?:RequestOptions):Promise<DownloadTicket>;
}
