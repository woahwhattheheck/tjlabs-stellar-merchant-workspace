// MIT. Source-owned declaration for the existing merchant host and browser owner.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import { couchdbWorkspaceTools } from './catalog.mjs';
export default defineMerchantProvider({
  schema:MERCHANT_PROVIDER_SCHEMA,id:'couchdb-workspaces',family:'couchdbWorkspaces',title:'CouchDB merchant workspaces',
  order:694,catalogOrder:694,configKey:'couchdbWorkspaces',
  configuration:{input:'couchdbWorkspaceConnection',privateExports:true,
    read:async(value,{hostPath})=>(await import('./client.mjs')).readCouchdbWorkspaceConfiguration(hostPath(value))},
  tools:couchdbWorkspaceTools,maxRequestBytes:1048576,concurrency:'provider',
  load:()=>import('./client.mjs'),create:(module,config)=>new module.MerchantCouchdbWorkspaces(config),
  initialize:options=>import('./setup.mjs').then(module=>module.initializeCouchdbWorkspaceMerchant(options)),
  instructions:[{order:694,prefix:'merchant_couchdb_',text:
    'Use the selected workspace alias and exact workspaceId. The existing authenticated browser owns native reads and all saved operations. Read actual CouchDB revisions and retained field metadata, review original capture/mapping SHA and native publication terms, then retain one operationId with unchanged complete input. Poll operation; resume only its original request after interruption. Host import aliases supply original complete source bytes and approved digests; environment variable names reference existing CouchDB credentials. Public customer clients use the original exporter. Whole project ZIPs include the private original source and receiving history. Read metadata and download all bytes against its original SHA; use readId/nextOffset or the same download operation after an interrupted transfer. Receiving uses host-declared aliases. Original SF82 tools own release decisions, seller execution and settlement.'}]
});
