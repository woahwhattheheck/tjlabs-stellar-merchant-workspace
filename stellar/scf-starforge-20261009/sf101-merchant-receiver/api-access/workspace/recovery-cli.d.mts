import type {RecoverySource,Environment,Sha256} from "./recovery-jobs.mjs";
import type {ApiPassRecoveryServer} from "./recovery-server.mjs";
export declare const API_PASS_RECOVERY_CONFIG_SCHEMA:"stellar-forge.sf101.api-customer-recovery-config.v1";
export declare const API_PASS_RECOVERY_LAUNCH_SCHEMA:"stellar-forge.sf101.api-customer-recovery-launch.v1";
export interface RecoveryConfiguration {
  schema:typeof API_PASS_RECOVERY_CONFIG_SCHEMA;directory:string;source?:RecoverySource;
}
export interface RecoveryLaunch {
  schema:typeof API_PASS_RECOVERY_LAUNCH_SCHEMA;status:"LISTENING"|"STOPPED";instanceId:string;
  journalId:string;directory:string;configFile:string;configSha256:Sha256;url:string;processId:number;
  startedAt:string;stoppedAt?:string;source:{entry:string;sha256:Sha256};sourceConfigured:boolean;
}
export declare function readApiPassRecoveryConfig(path:string):Promise<{
  config:Omit<RecoveryConfiguration,"schema">;configFile:string;configSha256:Sha256;
}>;
export declare function serveConfiguredApiPassRecovery(options:{
  configFile:string;port?:number;environment?:Environment;
}):Promise<ApiPassRecoveryServer&{launch:RecoveryLaunch;launchFile:string}>;
/** The serve command holds the ordinary server lifetime; other commands print complete JSON. */
export declare function main(argv?:string[]):Promise<void>;
