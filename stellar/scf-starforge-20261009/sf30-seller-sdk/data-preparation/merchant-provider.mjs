// MIT. Source-owned merchant registration for the original preparation engine.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {preparationWorkspaceTools} from './tools.mjs';
export default defineMerchantProvider({
  schema:MERCHANT_PROVIDER_SCHEMA,id:'data-preparation-workspaces',family:'preparationWorkspaces',
  title:'Data preparation workspaces',order:1050,catalogOrder:1050,configKey:'preparationWorkspaces',summary:true,dependencies:[],
  configuration:{input:'preparationWorkspaceConnection',privateExports:true,
    read:async(value,{hostPath})=>(await import('./mcp.mjs')).readPreparationWorkspaceConfiguration(hostPath(value))},
  tools:preparationWorkspaceTools,load:()=>import('./mcp.mjs'),
  create:(module,config)=>new module.MerchantPreparationWorkspaces(config),
  initialize:async options=>(await import('./setup.mjs')).initializePreparationWorkspaceMerchant(options),
  maxRequestBytes:2*1024*1024,
  instructions:[{prefix:'merchant_preparation_',order:1050,
    text:'Preparation tools share the original SQL engine and Applications listener. Inspect configured aliases, connect the current private instance, import complete declared source files at their SHA, save recipe editions and retain original source, recipe, run and review IDs. Read complete result pages or export full immutable files. Each native export keeps its operation ID, reviewed state SHA and full byte digest; an exact retry reopens the original completed delivery. File readers can continue the same SHA and offset after Applications or MCP restart. Receive the complete project through the original transfer engine into a declared separate customer directory, preserving all original inputs, recipe editions, results and review history. Disconnect releases only the current attachment and its reads. Applications Stop drains its actual SQL jobs and listener.'}],
});
