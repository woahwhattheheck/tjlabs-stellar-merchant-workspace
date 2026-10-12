// MIT. Lazy provider registration; original runtime and configuration remain source owned.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../provider-contract.mjs';
import {odataSubscriptionTools} from '../catalog/odata-subscriptions.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'odata-subscriptions',family:'odataSubscriptions',title:'OData collection subscriptions',
 order:202,catalogOrder:152,configKey:'odataSubscriptions',summary:true,dependencies:[],maxRequestBytes:131072,
 concurrency:'provider',shutdown:'provider',
 configuration:{input:'odataSubscriptionConnection',privateExports:true,read:async(value,{hostPath})=>
  (await import('../odata-subscriptions.mjs')).readSubscriptionConnection(hostPath(value))},
 tools:odataSubscriptionTools,
 instructions:[{prefix:'merchant_odata_subscription_',order:382,text:'Operate original complete collection subscription publishers and customers. Choose only configured aliases. Preserve create/append requestId and exact bodies; select reviewed edition identities for exports. A removal describes selected collection membership. Download every declared artifact member with its exact SHA; receive the original baseline followed by ordered deliveries. Use the actual Analysis source alias/revision when producing the mapping.'}],
 load:()=>import('../odata-subscriptions.mjs'),create:(module,config)=>new module.MerchantODataSubscriptions(config),
 initialize:async options=>(await import('../odata-subscriptions.mjs')).initializeODataSubscriptionMerchant(options)
});
