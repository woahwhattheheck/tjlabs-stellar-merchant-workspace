import type {Server} from "node:http";
import type {RecoveryJournal,Environment} from "./recovery-jobs.mjs";
export interface ApiPassRecoveryServer {
  server:Server;recovery:RecoveryJournal;origin:string;url:string;port:number;journalId:string;
  close():Promise<void>;
}
export declare function startApiPassRecoveryServer(options:{
  recovery:RecoveryJournal;port?:number;host?:"127.0.0.1";environment?:Environment;
  beforeRelease?:()=>void|Promise<void>;
}):Promise<ApiPassRecoveryServer>;
