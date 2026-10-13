// MIT. Source-owned customer-agent tools for the original TIND application.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {tindWorkspaceTools} from './catalog.mjs';

export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'tind-workspaces',family:'tindWorkspaces',
 title:'TIND scholarly migration workspaces',order:360,catalogOrder:360,
 configKey:'tindWorkspaces',summary:true,dependencies:[],
 maxRequestBytes:8*1024*1024,concurrency:'provider',shutdown:'provider',
 concurrentTools:['merchant_tind_source_pause','merchant_tind_close'],
 configuration:{
  input:'tindWorkspaceConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('./merchant.mjs')).readTindWorkspaceConfiguration(hostPath(value))
 },
 tools:tindWorkspaceTools,
 instructions:[{
  prefix:'merchant_tind_',order:360,
  text:'Use configured private TIND workspace aliases. Attach to the original running Applications workspace in managed mode; owned mode starts that same original product through its supported source. Browser and agent share the saved project, source editions, staff decisions, production waves, native jobs and operation history. Retain actual project IDs, expected revisions and stable operation IDs; inspect the original saved operation after an uncertain response before retrying it. Review the original source, frozen batch, selected destination and actual response before native reconciliation. A prepared batch or HTTP acceptance is not destination completion. Keep access, embargo, attachment and withdrawal decisions attached to their original records. Downloads select the original retained file and SHA256; continue using readId, expectedSha256 and nextOffset, or after restart select the same file/SHA256/offset without the expired readId. Complete customer delivery includes its original files and the full editable workspace handover. Pause only the selected original source acquisition with merchant_tind_source_pause. Use merchant_tind_close with the returned current instance ID; managed close detaches the agent while Applications retains listener ownership, and owned close drains the original process. Reopen after an Applications restart rather than reusing an old instance.'
 }],
 load:()=>import('./merchant.mjs'),
 create:(module,config,options={})=>new module.MerchantTindWorkspaces(config,{environment:options.environment}),
 requestClose:runtime=>runtime.requestClose(),
 initialize:async options=>(await import('./merchant-setup.mjs')).initializeTindWorkspaceMerchant(options)
});
