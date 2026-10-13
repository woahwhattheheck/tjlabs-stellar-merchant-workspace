// MIT. Source-owned customer-agent tools for the original Zotero library workspace.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {zoteroTools} from './catalog.mjs';

export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'zotero-workspaces',family:'zoteroWorkspaces',
 title:'Zotero library customer workspaces',order:400,catalogOrder:400,
 configKey:'zoteroWorkspaces',summary:true,dependencies:[],
 maxRequestBytes:1024*1024,concurrency:'provider',shutdown:'provider',
 concurrentTools:['merchant_zotero_cancel','merchant_zotero_close'],
 configuration:{
  input:'zoteroConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('./merchant-agent.mjs')).readZoteroAgentConfiguration(hostPath(value))
 },
 tools:zoteroTools,
 instructions:[{
  prefix:'merchant_zotero_',order:400,
  text:'Use configured private aliases for the existing original Zotero library workspace. Open and verify the actual saved workspace and authenticated listener instance before work. Managed mode attaches to its original private connection; owned mode opens the same maintained Node service over the existing workspace.sqlite and owns only that service object. Browser, CLI and agent continue the same library profiles, captures, exact source documents, collection projects, evidence decisions, comparisons and original Research handoffs. For customer returns, prepare an immutable original project-delivery, receive and edit it in the original child, then import the returned file with merchant_zotero_return_import. Review project.return.preview pages to their terminal offset, save explicit divergent choices with project.return.review and apply only its exact reviewed preview against the current original project. Equal numeric revisions do not establish a common ancestor; use the returned exact source/history identities. Save/review/apply and prepared deliveries remain in the original project transfer. Read complete paginated records and histories to their terminal page. Keep original request UUIDs and their exact inputs; inspect saved native request state after an uncertain response and resume that same request rather than create a replacement. Source-native request histories remain in the original SQLite workspace and complete project transfer. Source files enter through configured aliases and retain complete original bytes and hashes. Download retained artifacts using their full byte length, SHA256 and returned next offset; verify all complete bytes. Receive a whole project through the original named directory/received/name flow, retain its receipt and open that exact receiver through merchant_zotero_receiver. Never substitute an arbitrary destination, silently replace a project or confuse a received child with its source. Preserve linked Research dossier IDs, questions, revisions, original source terms and accepted handoff identities. A metadata catalogue does not grant access or rights to linked attachment bodies. Use merchant_zotero_cancel for the exact original saved request/capture operation; cancellation retains original accepted pages and restart history. Close with merchant_zotero_close using the actual bound listener identity. Managed close detaches; owned close drains only the original service created by this runtime, its accepted work and retained readers. Failed cleanup retains the same owner for continuation. Private API keys and connection tokens remain with the original host environment and private connection. This interface does not mutate the remote Zotero library.'
 }],
 load:()=>import('./merchant-agent.mjs'),
 create:(module,config,options={})=>new module.MerchantZoteroWorkspaces(config,{environment:options.environment}),
 requestClose:runtime=>runtime.requestClose(),
 initialize:async options=>(await import('./merchant-setup.mjs')).initializeZoteroMerchant(options)
});
