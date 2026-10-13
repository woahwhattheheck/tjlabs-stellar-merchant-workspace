// MIT. Source-owned complete received-project workflow; discovery loads metadata only.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../provider-contract.mjs';
import {merchantProjectTools} from '../merchant-project-protocol.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'merchant-projects',family:'merchantProjects',
 title:'Merchant project intake and received invoices',order:1005,catalogOrder:1005,
 configKey:'merchantProjects',summary:true,dependencies:[],concurrency:'provider',maxRequestBytes:262144,
 configuration:{input:'merchantProjectConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('../merchant-project-connection.mjs')).readMerchantProjectConfiguration(hostPath(value))},
 tools:merchantProjectTools,
 instructions:[{prefix:'merchant_project_',order:1005,
  text:'Select the original configured Merchant project alias. Read status and every inventory page, then receive only its exact reviewed selectionSha256. The running managed Application owns the original receive/replay and readonly store; this consumer never creates a receiver, payment, invoice mutation or server. After an uncertain receive reply read the same status and preserve the original operation. Retain the complete manifest and receipt artifacts. Review original invoice register pages with their exact source revision, original invoice histories and payment envelopes, and stream their complete paid results. Receive every artifact through file until nextOffset is null, checking complete bytes and SHA; restart an expired read with the same artifact/hash/offset. Artifacts remain available after Application/MCP shutdown. Credentials are host environment references. Read PROJECT_AGENT.md for complete private host setup, typed client, caller ownership and same-case cold continuation.'}],
 load:()=>import('../merchant-projects.mjs'),
 create:(module,config)=>new module.MerchantProjects(config),
});
