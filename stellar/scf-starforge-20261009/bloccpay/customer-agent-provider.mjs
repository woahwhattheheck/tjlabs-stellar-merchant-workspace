// MIT. Declaration only; native host access remains lazy and source-owned.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import { bloccpayTools } from './customer-agent-catalog.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'bloccpay',family:'bloccpay',title:'Bloccpay operations',
 order:540,catalogOrder:540,configKey:'bloccpay',summary:true,dependencies:[],
 concurrency:'provider',shutdown:'provider',maxRequestBytes:1024*1024,
 configuration:{input:'bloccpayConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('./customer-agent.mjs')).readBloccpayAgentConfiguration(hostPath(value))},
 tools:bloccpayTools,load:()=>import('./customer-agent.mjs'),
 create:(module,config,options)=>new module.MerchantBloccpay(config,options.bloccpay),
 instructions:[{prefix:'merchant_bloccpay_',text:'Use one declared original Bloccpay host. Read bootstrap and exact native records before selecting commands. Keep requestId, method, args and expectedRevision together; inspect a request after interruption and use resume:true only for that original request. Provider writes retain the original operation.prepare/operation.dispatch workflow, delivery-enabled setting and connection scope. Signed SDP events are metadata; original webhook.project/reconcile reads full resources before projection. Received workspaces keep received IDs and original provenance; no provider read or collection is started by this adapter. Downloads contain the original visible file or complete existing archive with full hash and paginated bytes. Closing the agent drains its own requests, bodies and files while the Applications host remains owned by its managed lifecycle. See APPLICATIONS.md.'}],
});
