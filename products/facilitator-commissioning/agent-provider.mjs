// SPDX-License-Identifier: MIT
// Metadata discovery never opens the original service or reads private credentials.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {commissioningCustomerTools} from './agent-contracts.mjs';
export default defineMerchantProvider({
  schema:MERCHANT_PROVIDER_SCHEMA,id:'facilitator-commissioning-customer',family:'facilitatorCommissioning',
  title:'Complete same-service facilitator commissioning',order:746,catalogOrder:746,configKey:'facilitatorCommissioning',
  summary:true,dependencies:[],concurrency:'provider',shutdown:'provider',maxRequestBytes:1024*1024,
  configuration:{input:'facilitatorCommissioningConnection',privateExports:true,
    read:async(value,{hostPath,base})=>(await import('./agent-connection.mjs')).readCommissioningCustomerConfiguration(hostPath(value,base))},
  tools:commissioningCustomerTools,load:()=>import('./agent-customer.mjs'),
  create:(module,config)=>new module.CommissioningCustomerAgent(config),
  requestClose:provider=>provider.requestClose(),
  instructions:[{prefix:'merchant_commissioning_',order:746,text:
    'Use the configured original operator and exact job. Keep the complete source population, both provider identities and all agreed requests. '+
    'Import every original file and retain its hash before preparing the exact full command. Prepare preserves its UUID, revision and payload before dispatch. '+
    'After an interrupted write, receive that original UUID. NOT_FOUND permits explicit re-preparation of the same saved command; PENDING or RECONCILIATION_REQUIRED keeps its identity for deliberate apply. '+
    'Native seller ownership, release review, buyer approvals and original SF88 signing remain authoritative. A prepared buyer plan does not make a purchase. '+
    'Follow every history page and capture every required output. Receive captured bytes through EOF with their manifest/hash; complete TAR receiving uses the original receiver and a host-selected destination. '+
    'For customer delivery, open and VIEW the exact populated outgoing product at desktop and narrow widths, operate its important controls/downloads and reopen the received case. Return actual rendered defects to the source owner for repair. '+
    'This provider borrows the existing local listener; closing it never stops that listener or its seller.'}]
});
