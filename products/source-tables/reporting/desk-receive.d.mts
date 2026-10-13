import type {ReportingProject} from './programme.mjs';
import type {NativeStarter} from '../../../stellar-forge/developer-site/dist/source-table-workspace.mjs';
export interface DeskReceiveContext {operationId:string;at:string;actor:string;expectedProjectSha256?:string;starter?:NativeStarter}
export declare function receiveDeskHandover(input:unknown|null,source:string|Record<string,unknown>,context:DeskReceiveContext):Promise<{project:ReportingProject;replayed:boolean;operation:unknown;projectSha256?:string;sourceSha256?:string;receivedRuns?:number}>;
