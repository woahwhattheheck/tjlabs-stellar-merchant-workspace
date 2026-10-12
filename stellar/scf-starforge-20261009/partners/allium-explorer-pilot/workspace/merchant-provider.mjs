// MIT. Source-owned Allium provider for the maintained merchant registry.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {alliumWorkspaceTools} from './tools.mjs';
export default defineMerchantProvider({
  schema:MERCHANT_PROVIDER_SCHEMA,id:'allium-workspaces',family:'alliumWorkspaces',
  title:'Allium data workspaces',order:1020,catalogOrder:1020,
  configKey:'alliumWorkspaces',summary:true,dependencies:[],
  configuration:{input:'alliumWorkspaceConnection',privateExports:true,
    read:async(value,{hostPath})=>(await import('./mcp.mjs')).readAlliumWorkspaceConfiguration(hostPath(value))},
  tools:alliumWorkspaceTools,load:()=>import('./mcp.mjs'),
  create:(module,config)=>new module.MerchantAlliumWorkspaces(config),
  initialize:async options=>(await import('./setup.mjs')).initializeAlliumWorkspaceMerchant(options),
  maxRequestBytes:2*1024*1024,
  instructions:[{prefix:'merchant_allium_',order:1020,
    text:'Allium tools attach to the original listener started by Applications. Inspect status, connect the declared workspace and retain original product head, acquisition, operation, configuration, snapshot, version and session IDs. Every query, preview, merchant and publisher action uses the native engine. Host-declared input files and profiles supply reviewed source bytes and payment terms. Recover an interrupted provider run through its actual saved acquisition and run ID. Complete export stops the original merchant and publisher and retains every portable source/history file. Completed export operations reopen exact retained bytes; a file reader continues its SHA and byte offset after restart. Receive the complete export into a declared customer directory, then attach that original workspace in Applications. Disconnect releases only this attachment; Applications Stop owns the source writer and drains its services.'}],
});
