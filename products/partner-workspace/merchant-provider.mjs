// Apache-2.0. Source-owned original mobility and education workspaces.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {partnerWorkspaceTools} from './catalog.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'partner-workspaces',family:'partnerWorkspaces',title:'Mobility and education workbenches',order:168,catalogOrder:768,configKey:'partnerWorkspaces',summary:true,dependencies:[],maxRequestBytes:2097152,
 configuration:{input:'partnerWorkspaceConnection',privateExports:true,read:async(value,{hostPath})=>(await import('./workspace.mjs')).readPartnerWorkspaceConfiguration(hostPath(value))},
 tools:partnerWorkspaceTools,
 instructions:[{prefix:'merchant_partner_',order:168,text:'Select the host-configured original installation alias. Inspect its source, workspace and product, then use the original reads or managed staff Application for source intake and edits. Lifecycle writes retain the exact request UUID and host-selected source/archive. Recover the same retained request after an interrupted response. Close the managed service before source adoption, whole installation snapshot or original export. Independent receiving keeps the actual workspace UUID and full editable application while assigning its own installation identity. Source data, pricing and customer documents remain in their original private case.'}],
 load:()=>import('./workspace.mjs'),create:(module,config)=>new module.MerchantPartnerWorkspaces(config)
});
