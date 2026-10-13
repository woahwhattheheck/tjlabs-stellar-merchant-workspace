// MIT. Source-owned customer-agent tools for the original BLS analyst workspace.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {blsAnalystTools} from './catalog.mjs';

export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'bls-analyst-workspaces',family:'blsAnalystWorkspaces',
 title:'BLS regional labor analyst workspaces',order:370,catalogOrder:370,
 configKey:'blsAnalystWorkspaces',summary:true,dependencies:[],
 maxRequestBytes:8*1024*1024,concurrency:'provider',shutdown:'provider',
 concurrentTools:['merchant_bls_analyst_stop','merchant_bls_analyst_close'],
 configuration:{
  input:'blsAnalystConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('./merchant.mjs')).readBlsAnalystConfiguration(hostPath(value))
 },
 tools:blsAnalystTools,
 instructions:[{
  prefix:'merchant_bls_analyst_',order:370,
  text:'Use configured private BLS analyst workspace aliases. Managed mode attaches to the original Applications listener; owned mode starts that same original BLS product through its maintained CLI. Browser and agent share saved official source editions, observations, county and regional definitions, report revisions, commentary and original operations. Keep LAUS resident labor and QCEW workplace employment and wages distinct. Preserve units, adjustment, disclosure, missing-value status and exact source membership; comparable changes require matching coverage. Use actual saved edition/report IDs, expected revisions and stable request IDs. After an uncertain response inspect the original retained operation before retrying. Select input files and receiving destinations only by their configured private aliases, preserving the complete original bytes and source identities. Read retained downloads through the returned file identity, expected SHA256 and exact next offset; reopen the same original artifact after a reader restart. Customer delivery includes complete analysis JSON/CSV/HTML/ZIP and the whole editable workspace with source captures, notes, definitions, report history and original receipts. Receiving a workspace does not publish a dataset or prove buyer acceptance. Existing BLS publisher, candidate review, SF88 and Vitality flows remain their original operations. Use merchant_bls_analyst_stop with the exact saved native-receive operation ID in either attachment mode; the original server verifies the live subprocess ownership, stops only that process group and leaves its saved state resumable. This does not terminate Applications or stop unrelated source capture. Close with merchant_bls_analyst_close and the actual returned instance identity; managed close detaches while Applications retains its listener, and owned close drains accepted work and its process. Reopen after an Applications restart rather than reusing an old instance.'
 }],
 load:()=>import('./merchant.mjs'),
 create:(module,config,options={})=>new module.MerchantBlsAnalystWorkspaces(config,{environment:options.environment}),
 requestClose:runtime=>runtime.requestClose(),
 initialize:async options=>(await import('./merchant-setup.mjs')).initializeBlsAnalystMerchant(options)
});
