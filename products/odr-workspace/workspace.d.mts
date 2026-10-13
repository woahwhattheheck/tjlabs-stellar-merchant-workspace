import type {Reply} from './client.mjs';
export declare const ODR_WORKSPACE_CONNECTION_SCHEMA:string;
export interface OdrWorkspaceSelection {directory:string;label?:string;sourceDirectory?:string;python?:string;node?:string;application?:string;handover?:string;receiveHandover?:string;receiveArchive?:string;transferDirectory?:string;binding?:{installation_id:string;source_identity:string}}
export declare function readOdrWorkspaceConfiguration(path:string):Promise<{schema:string;selectionSha256:string;workspaces:Record<string,OdrWorkspaceSelection>}>;
export declare class MerchantOdrWorkspaces {
 constructor(config:{odrWorkspaces?:{workspaces:Record<string,OdrWorkspaceSelection>}});
 readonly summary:{configured:boolean;ownership:string;workspaces:{workspace:string;label?:string}[];activeCalls:number;closing:boolean};
 call(name:string,args?:Record<string,unknown>):Promise<Reply&{workspace:string}>;
 close():Promise<void>;
}
