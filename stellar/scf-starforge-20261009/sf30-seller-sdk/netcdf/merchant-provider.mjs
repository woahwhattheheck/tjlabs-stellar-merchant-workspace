// MIT. Source-owned provider joins the original Merchant configuration and shutdown.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {netCDFTools} from './mcp-tools.mjs';
export default defineMerchantProvider({
  schema:MERCHANT_PROVIDER_SCHEMA,id:'netcdf-workspaces',family:'netcdfWorkspaces',title:'NetCDF scientific workspaces',
  order:1250,catalogOrder:1250,configKey:'netcdfWorkspaces',summary:true,dependencies:[],concurrency:'host',concurrentTools:[],shutdown:'provider',maxRequestBytes:262144,
  configuration:{input:'netcdfWorkspaceConnection',privateExports:true,read:async(value,{hostPath})=>(await import('./client.mjs')).readNetCDFConfiguration(hostPath(value))},
  tools:netCDFTools,load:()=>import('./mcp.mjs'),create:(module,config)=>new module.MerchantNetCDFWorkspaces(config),
  instructions:[{prefix:'merchant_netcdf_',order:1250,text:'Keep exact original NetCDF source SHA, group/dimension identity and explicit half-open positive-step slice choices. Raw values retain integer, string, bytes, enum, compound and variable-length identity; decoded CF values are additional selected context. Save and repeat the same original request ID for import, selection, run and review. Read complete paginated populations or receive the complete native result/report objects through EOF. Whole-project receiving preserves every original source, selection, result, review, request and editable application. File aliases, Python runtime and receiving/export paths are declared by the host. Shutdown drains the current retained native clients.'}],
});
