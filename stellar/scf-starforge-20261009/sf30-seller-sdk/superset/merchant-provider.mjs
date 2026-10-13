// MIT. Source-owned customer-agent tools for the original Superset workspace.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {supersetTools} from './catalog.mjs';

export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'superset-workspaces',family:'supersetWorkspaces',
 title:'Superset customer workspaces',order:380,catalogOrder:380,
 configKey:'supersetWorkspaces',summary:true,dependencies:[],
 maxRequestBytes:1024*1024,concurrency:'provider',shutdown:'provider',
 concurrentTools:['merchant_superset_cancel','merchant_superset_close'],
 configuration:{
  input:'supersetConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('./merchant-agent.mjs')).readSupersetConfiguration(hostPath(value))
 },
 tools:supersetTools,
 instructions:[{
  prefix:'merchant_superset_',order:380,
  text:'Use configured private aliases for an existing original Superset operator and saved workspace. Managed mode attaches to its authenticated operator-launch.json instance; owned mode opens the same maintained Node service and owns only that service object. Browser and agent use the same sources, captures, editions, reviews, comparisons, saved operations and original publisher/buyer history. Read complete paginated inventories and retain actual source, edition, review and operation IDs. Save original requests before continuing acquisition or customer work; after an uncertain response inspect the same retained operation rather than create a replacement. Preserve the original source and approval environment references. Payment approval, merchant publication and buyer receiving remain governed by the original native source/session engines. Select complete input files and independent receiving destinations only through configured aliases. Download the exact retained artifact using its returned byte length, SHA256 and next offset, and verify all complete bytes before customer use. Complete delivery includes customer files, original source observations and the whole editable project for independent receiving. Use merchant_superset_cancel with the exact original operation ID in either mode; the original workspace cancels queued work or aborts its active acquisition/session while preserving its saved operation. Close with merchant_superset_close and the actual current instance identity. Managed close detaches while the original operator retains its listener; owned close drains only the service created by this runtime. Reopen after the original listener restarts rather than reuse a stale instance.'
 }],
 load:()=>import('./merchant-agent.mjs'),
 create:(module,config,options={})=>new module.MerchantSupersetWorkspaces(config,{environment:options.environment}),
 requestClose:runtime=>runtime.requestClose(),
 initialize:async options=>(await import('./merchant-setup.mjs')).initializeSupersetMerchant(options)
});
