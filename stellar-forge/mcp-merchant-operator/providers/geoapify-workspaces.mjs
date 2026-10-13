// MIT. Geoapify metadata and original native operator hooks.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../provider-contract.mjs';
import {geoapifyWorkspaceTools} from '../catalog/geoapify-workspace.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'geoapify-workspaces',family:'geoapifyWorkspaces',
 title:'Geoapify address review and customer datasets',order:221,catalogOrder:181,
 configKey:'geoapifyWorkspaces',summary:true,dependencies:[],maxRequestBytes:524288,
 configuration:{input:'geoapifyWorkspaceConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('../geoapify-workspace.mjs')).readGeoapifyWorkspaceConfiguration(hostPath(value))},
 tools:geoapifyWorkspaceTools,
 instructions:[{prefix:'merchant_geoapify_',text:'Use declared host aliases. Review saved batch inputs before explicit submission; keep uncertain jobs and their IDs for reconciliation. Poll only after nextPollAt. Explicit decisions bind original candidates to the retained response SHA. For recurring customer files, stage a declared successor against a frozen baseline, inspect its retained comparison and explicitly activate its exact intake. Reuse only the reviewed query selection or the explicitly selected complete eligible set. Bind new provider preparation, decisions and edition builds to the active intake SHA. Historical jobs and frozen editions keep their own sources. Complete exports preserve every source revision, jobs, per-source raw forms and dataset editions.'}],
 load:()=>import('../geoapify-workspace.mjs'),
 create:(module,config,options)=>new module.MerchantGeoapifyWorkspaces(config,options),
 initialize:async options=>(await import('../geoapify-setup.mjs')).initializeGeoapifyWorkspaceMerchant(options)
});
