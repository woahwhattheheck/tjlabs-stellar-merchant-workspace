import type {RumbleConnection} from './connection.mjs';
export interface ManagedRumbleOptions {directory:string;workspaceId?:string;port?:number;apiKey?:string}
export function rumbleManagedOptions(argv:string[]):ManagedRumbleOptions;
export function startManagedRumbleWorkspace(options:ManagedRumbleOptions):Promise<{directory:string;workspaceId:string;instanceId:string;startedAt:string;origin:string;url:string;connection:RumbleConnection;close():Promise<void>}>;
export function runManagedRumbleCli(argv?:string[],options?:{stdout?:{write(text:string):unknown};waitForClose?:boolean}):Promise<unknown>;
