// MIT. Source-owned Rumble provider for the maintained merchant registry.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {rumbleWorkspaceTools} from './tools.mjs';
export default defineMerchantProvider({
  schema:MERCHANT_PROVIDER_SCHEMA,id:'rumble-workspaces',family:'rumbleWorkspaces',
  title:'Rumble data workspaces',order:1140,catalogOrder:1140,
  configKey:'rumbleWorkspaces',summary:true,dependencies:[],
  configuration:{input:'rumbleWorkspaceConnection',privateExports:true,
    read:async(value,{hostPath})=>(await import('./mcp.mjs')).readRumbleWorkspaceConfiguration(hostPath(value))},
  tools:rumbleWorkspaceTools,load:()=>import('./mcp.mjs'),
  create:(module,config)=>new module.MerchantRumbleWorkspaces(config),
  initialize:async options=>(await import('./setup.mjs')).initializeRumbleWorkspaceMerchant(options),
  maxRequestBytes:2*1024*1024,
  instructions:[{prefix:'merchant_rumble_',order:1140,
    text:'Rumble tools attach to the original customer listener started by Applications. Read status, connect the declared workspace, and preserve its source plan/run IDs, customer revision, edition and review. Host-declared book, configuration and request-plan files supply complete reviewed bytes. Start and resume use the original provider runner and its quota/reset state. An uncertain edition creation reuses its exact operationId and input; inspect other uncertain mutations before retrying. Customer JSON and CSV preserve decimal strings and explicit unavailable values. Export pauses the original request runner and retains the complete source and customer history while excluding private connection credentials. Completed export operations reopen the same retained bytes. Continue file reads with their readId, SHA and byte offset, or reopen the retained file after restart. Receive into a declared new customer directory and select its workspace in Applications. Wallet adoption uses the original revision-aware receiver; an older received edition cannot replace its current edition. Disconnect releases this attachment; Applications Stop owns the writer.'}],
});
