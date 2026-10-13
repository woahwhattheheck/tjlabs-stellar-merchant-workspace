// MIT. Attach to the existing MPC Application without starting another owner.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {mpcRecoveryTools} from './catalog.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'mpc-recovery-workspaces',family:'mpcRecovery',title:'MPC recovery operations',
 order:1190,catalogOrder:1190,configKey:'mpcRecovery',summary:true,dependencies:[],concurrency:'provider',maxRequestBytes:8*1024*1024,
 configuration:{input:'mpcRecoveryConnection',privateExports:true,read:(value,{hostPath})=>import('./merchant.mjs').then(m=>m.readMpcRecoveryConfiguration(hostPath(value)))},
 tools:mpcRecoveryTools,
 instructions:[{order:1190,prefix:'merchant_mpc_recovery_',text:'Select the configured physical store ID/directory and a physical branch ID. The portable workspace ID can be shared by received branches, so every model mutation also retains expected workspaceId/revision/snapshotSha256 and the original command and transport UUIDs. These tools borrow one existing managed owner; they do not contact backup platforms or invent acceptance, restore or incident observations. Reconcile uncertain requests through request; do not replace their UUID or inputs. Page complete records/history and read every retained-file chunk. Receiving creates a distinct physical branch and preserves later edits on repeated original receiving. Original model/proposal validation remains authoritative; reports and backup observations describe the retained evidence, not independently performed external recovery.'}],
 load:()=>import('./merchant.mjs'),create:(module,config)=>new module.MerchantMpcRecovery(config)
});
