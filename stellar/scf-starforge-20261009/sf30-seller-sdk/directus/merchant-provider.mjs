// MIT. Source-owned customer-agent tools for the original Directus workspace.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {directusTools} from './catalog.mjs';

export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'directus-workspaces',family:'directusWorkspaces',
 title:'Directus customer workspaces',order:390,catalogOrder:390,
 configKey:'directusWorkspaces',summary:true,dependencies:[],
 maxRequestBytes:2*1024*1024,concurrency:'provider',shutdown:'provider',
 concurrentTools:['merchant_directus_cancel','merchant_directus_close'],
 configuration:{
  input:'directusConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('./merchant-agent.mjs')).readDirectusConfiguration(hostPath(value))
 },
 tools:directusTools,
 instructions:[{
  prefix:'merchant_directus_',order:390,
  text:'Use configured private aliases for an existing original Directus operator and saved project. Keep its complete operatorId, instanceId, projectKey and workspaceId scope: independent received projects may retain the original workspace identity but have a distinct registry project key. Managed mode attaches to the authenticated original operator-launch.json instance; owned mode opens the same maintained Node service and owns only that service object. Browser and agent continue the same schema and item captures, records, content versions, comparisons, saved operations, native mutation history and original publisher/buyer sessions. Read complete paginated inventories to their actual end. Save original requests and exact operation IDs before continuing work; after an uncertain response inspect the same retained operation and reconciliation history rather than create a replacement. Select Directus connections by configured alias; tokenEnv names resolve only in the original host environment and credentials remain private. Select merchant runtime settings through their configured private aliases, preserving the original port, facilitator, allowLocalFacilitator, purchase approval and budget contracts. Select complete source or project input only through configured file aliases. Download the exact retained artifact using returned byte length, SHA256 and next offset; verify all complete bytes before customer use. Receive the whole editable project through the original operator registry into its independent received-project directory and retain the returned new project scope. No arbitrary host path or replacement project is supplied through tools. Use merchant_directus_cancel with the exact original operation ID to abort that native or buyer operation while preserving its uncertain and recovery history. Close with merchant_directus_close and the actual bound operator identity. Managed close detaches; owned close drains only the original service created by this runtime. Reopen after a listener restart instead of reusing stale instance bindings.'
 }],
 load:()=>import('./merchant-agent.mjs'),
 create:(module,config,options={})=>new module.MerchantDirectusWorkspaces(config,{environment:options.environment}),
 requestClose:runtime=>runtime.requestClose(),
 initialize:async options=>(await import('./merchant-setup.mjs')).initializeDirectusMerchant(options)
});
