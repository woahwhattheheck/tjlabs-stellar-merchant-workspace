// MIT. Source-owned merchant console metadata; runtime imports remain lazy.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../provider-contract.mjs';
import {apiMerchantWorkspaceTools} from '../api-merchant-protocol.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'api-merchant-workspaces',family:'apiMerchantWorkspaces',
 title:'API merchant console',order:75,catalogOrder:25,configKey:'apiMerchantWorkspaces',summary:true,dependencies:[],
 concurrency:'provider',maxRequestBytes:262144,
 configuration:{input:'apiMerchantWorkspaceConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('../api-merchant-connection.mjs')).readApiMerchantWorkspaceConfiguration(hostPath(value))},
 tools:apiMerchantWorkspaceTools,
 instructions:[{
  prefix:'merchant_api_console_',order:95,
  text:'For API merchants, select the original configured console alias and workspace ID. Inspect its actual functions, source SHA and complete revision-pinned inventories. Prepare and publish offers, adopt host-declared existing applications and original paid orders, manage access and recover exact original calls through the same running console. Retain each operationId, expectedRevision and accepted request SHA; after a lost reply read operation and resume that exact saved request. Use the original operation terminal result before the next dependent action. Export complete usage and execution results and capture complete encrypted backups through native operations. Receive all original export files with the typed client and its saved manifest SHA, endpoint, alias and workspace ID; full files remain available after the serving console stops. Restore a downloaded and extracted backup using its host-declared receiving handle and full companion metadata SHA. Read the source-owned AGENT_OPERATING.md for setup, full workflows, complete-file receiving and original process ownership.',
 }],
 load:()=>import('../api-merchant-workspace.mjs'),
 create:(module,config)=>new module.MerchantApiMerchantWorkspaces(config),
 initialize:async options=>(await import('../api-merchant-setup.mjs')).initializeApiMerchantWorkspaceMerchant(options),
});
