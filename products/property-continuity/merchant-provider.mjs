// MIT. Lazy source-owned merchant provider for the original property commissioning app.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {propertyContinuityTools} from './catalog.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'property-continuity-workspaces',family:'propertyContinuity',title:'Property continuity',
 order:1180,catalogOrder:1180,configKey:'propertyContinuity',summary:true,dependencies:[],concurrency:'provider',
 maxRequestBytes:24*1024*1024,
 configuration:{input:'propertyContinuityConnection',privateExports:true,
  read:(value,{hostPath})=>import('./merchant.mjs').then(m=>m.readPropertyContinuityConfiguration(hostPath(value)))},
 tools:propertyContinuityTools,
 instructions:[{order:1180,prefix:'merchant_property_continuity_',text:'Use the original private managed connection. Every branch operation names the portable workspace UUID and exact physical directory; explicitly open a known receiving branch before using it. Retain complete command envelopes and UUIDs before effects; request reads reconcile uncertain results. Source/file aliases contain host-selected original bytes. Follow every nextOffset for complete source/report/findings/file delivery, preserving numberTokens and UNVERIFIED coverage. Export freezes one revision under its original publication UUID; receive uses the original archive and operation identity, preserving later receiver edits. These tools borrow the original service and do not start another database, alter a source platform or generate operational observations.'}],
 load:()=>import('./merchant.mjs'),create:(module,config)=>new module.MerchantPropertyContinuity(config)
});
