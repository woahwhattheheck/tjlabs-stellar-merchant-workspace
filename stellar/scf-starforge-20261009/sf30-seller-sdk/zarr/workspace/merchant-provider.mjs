/** Source-owned lazy Merchant registration; attachment uses the original listener. */
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {zarrWorkspaceTools} from './catalog.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'zarr-workspaces',family:'zarrWorkspaces',title:'Zarr workspaces',
 order:1260,catalogOrder:1260,configKey:'zarrWorkspaces',summary:true,dependencies:[],
 configuration:{input:'zarrWorkspaceConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('./mcp.mjs')).readZarrWorkspaceConfiguration(hostPath(value))},
 tools:zarrWorkspaceTools,load:()=>import('./mcp.mjs'),create:(module,config)=>new module.MerchantZarrWorkspaces(config),
 maxRequestBytes:1024*1024,concurrency:'provider',shutdown:'drain',
 instructions:[{prefix:'merchant_zarr_',order:1260,text:
  'Zarr tools attach to one host-declared original Applications/operator workspace. Inspect aliases and connect its current instance. Retain one UUID and the complete prepared request before applying import, selection, run, review, freeze or abandon. Inspect or resume that exact original operation after response loss. Read complete immutable result pages with native value tags and source coordinates. Freeze only the latest accepted result review with an explicit text, number or boolean projection. The original dataset publisher uses the returned selected-query string/number/boolean column types and durable request IDs for plan, review and buyer actions. Every publisher run retains its original UUID; publication uses its exact current review. Source-workspace ZIPs include complete native source, selections, results, reviews and frozen editions, while publisher/dataset stores are part of the separate full merchant handover. Read every file range against the same full SHA-256. Disconnect drains only this attachment; Applications Stop owns closing the original listener and native writers.'}]
});
