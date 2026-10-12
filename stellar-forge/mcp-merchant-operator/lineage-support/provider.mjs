// MIT. This source contribution composes the existing two configured owners.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../provider-contract.mjs';
import {lineageSupportTools} from './catalog.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'lineage-support',family:'lineageSupport',
 title:'Lineage incident Support handover',order:376,catalogOrder:376,
 configKey:null,summary:false,dependencies:['openlineageWorkspaces','support'],
 maxRequestBytes:128*1024,tools:lineageSupportTools,
 load:()=>import('./controller.mjs'),
 create:(module,config,options,owners)=>new module.MerchantLineageSupport({support:owners.support,lineage:owners.openlineageWorkspaces}),
 instructions:[{prefix:'merchant_lineage_support_',order:376,text:
  'Use the original configured Lineage workspace and Support case. Preview complete incident source/report bytes, then retain the same reviewed capture request. Prepare a native decision in that case before execution. Resolve only after an original clear assessment; acceptance is an explicit reasoned alternative. Recover a lost save or native return with its original request UUID and complete saved intent. Source, case and native revisions remain separate. Page retained materials and download every original file at its saved case/material identity. The original Support case export carries all commissioning material; use the original Lineage workspace export for its complete editable source application.'}]
});
