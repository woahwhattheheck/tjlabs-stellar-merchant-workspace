import type {OperationRequest,Operation,RegionalDefinition} from './client.mjs';
export interface BlsAttachmentOptions {directory:string;mode?:'managed'|'owned';pythonExecutable?:string;environment?:Record<string,string|undefined>;exportDirectory:string}
export interface BlsAttachmentSummary {workspaceId:string;instanceId:string;ownership:'managed'|'owned';origin:string;bindingSha256:string}
export interface BlsAgentExport {schema:'stellar-forge.bls-agent-export.v1';exportId:string;selection:{kind:'source'|'report'|'export';id:string;name:string};workspaceId:string;filename:string;file:{name:string;bytes:number;sha256:string;type:string}}
export interface BlsSourceBinding {path:string;bytes:number;sha256:string;device:string;inode:string;modifiedNs:string;changedNs:string}
export interface BlsSavedIntent {schema:'stellar-forge.bls-agent-intent.v1';logical:{request:OperationRequest;sourceAlias:string|null;destinationAlias:string|null};workspaceId:string;workspaceDirectory:string;source:BlsSourceBinding|null;destination:string|null}
export class BlsAnalystClient {
 constructor(context:unknown);
 readonly instanceId:string;readonly summary:BlsAttachmentSummary;
 verify():Promise<BlsAttachmentSummary>;
 view(view:'state'|'default-selection'|'edition'|'observations'|'note'|'report'|'regional-definition'|'native-state',query?:Record<string,unknown>):Promise<Record<string,unknown>>;
 operation(operationId:string):Promise<{saved:BlsSavedIntent|null;request:OperationRequest|null;observed:{found:boolean;workspace_id:string;operation?:Operation;request?:OperationRequest}}>;
 save(request:OperationRequest,options?:{sourcePath?:string;sourceAlias?:string;destinationPath?:string;destinationAlias?:string}):Promise<Operation>;
 resume(operationId:string):Promise<Operation>;
 previewDefinition(document:RegionalDefinition):Promise<Record<string,unknown>>;
 stop(operationId:string):Promise<{operation_id:string;state:string;signal_sent:boolean}>;
 download(input:{exportId:string;kind:'source'|'report'|'export';id:string;name?:string}):Promise<BlsAgentExport>;
 retained(exportId:string):Promise<{readonlyFileHandle:import('node:fs/promises').FileHandle;bytes:number;sha256:string;name:string;type:string}>;
 requestClose():void;close():Promise<{instanceId:string;ownership:'managed'|'owned';state:'DETACHED'|'CLOSED'}>;
}
export function attachBlsAnalystWorkspace(options:BlsAttachmentOptions):Promise<BlsAnalystClient>;
export function bindBlsSource(path:string):Promise<BlsSourceBinding>;
export function readPrivate(path:string,maximum?:number):Promise<Buffer>;
export function privateDirectory(path:string,options?:{create?:boolean}):Promise<string>;
export function blsError(code:string,message:string,extra?:Record<string,unknown>):Error&{code:string};
export const MAX_BLS_PACKAGE_BYTES:number;
