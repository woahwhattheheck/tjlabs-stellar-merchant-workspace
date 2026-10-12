import {PipelineClient} from './pipelines/client.mjs';
import {PreparationWorkspaceClient} from './connection.mjs';
import type {RequestOptions,Source} from './pipelines/client.mjs';
import type {PreparationConnection,PipelineStatus,PipelineDeliveryRequest,DeliveryRecord,
 ManagedReceivedPipeline,PreparationDownloadLink} from './connection.mjs';
export type {Definition,SavedDefinition,Selection,Stage,Execution,RunStatus,Attempt,StageState,
 Source,Page,RowPage,Event,Review,Comparison,ReceivedProject} from './pipelines/client.mjs';
export class PreparationPipelineClient extends PipelineClient {
 constructor(preparation:PreparationWorkspaceClient);
 readonly connection:PreparationConnection;
 browser():Promise<PreparationConnection&{url:string}>;
 status(options?:RequestOptions):Promise<PipelineStatus>;
 importFile(path:string,options:{alias:string;format?:'csv'|'jsonl';label?:string;filename?:string;nullToken?:string;expectedSha256?:string;signal?:AbortSignal}):Promise<Source>;
 openReceived(id:string,options?:RequestOptions):Promise<ManagedReceivedPipeline>;
 receiveProject(path:string,options:{requestKey:string;expectedSha256?:string;signal?:AbortSignal}):Promise<ManagedReceivedPipeline>;
 downloadLink(relative:string,options?:RequestOptions):Promise<PreparationDownloadLink>;
 exportDelivery(request:PipelineDeliveryRequest,options?:RequestOptions):Promise<DeliveryRecord>;
}
