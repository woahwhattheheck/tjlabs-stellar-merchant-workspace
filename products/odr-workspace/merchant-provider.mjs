// Apache-2.0. Source-owned original ODR source and review workspaces.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {odrWorkspaceTools} from './catalog.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'odr-workspaces',family:'odrWorkspaces',title:'ODR source and Alpha review',order:179,catalogOrder:779,configKey:'odrWorkspaces',summary:true,dependencies:[],maxRequestBytes:2097152,
 configuration:{input:'odrWorkspaceConnection',privateExports:true,read:async(value,{hostPath})=>(await import('./workspace.mjs')).readOdrWorkspaceConfiguration(hostPath(value))},
 tools:odrWorkspaceTools,
 instructions:[{prefix:'merchant_odr_',order:179,text:'Select the host-configured original installation alias. Inspect its source and workspace, then use the original reads or managed staff Application for source intake and edits. Lifecycle writes retain the exact request UUID and host-selected source/archive. Recover the same retained request after an interrupted response. Close the managed service before source adoption, whole installation snapshot or original export. Independent receiving keeps the actual workspace UUID and full editable application while assigning its own installation identity. Source data, pricing and customer documents remain in their original private case.'}],
 load:()=>import('./workspace.mjs'),create:(module,config)=>new module.MerchantOdrWorkspaces(config)
});
