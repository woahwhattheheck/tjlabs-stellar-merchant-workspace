// MIT. Metadata only; borrow the original Econdb workspace through its maintained native API.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../provider-contract.mjs';
import {econdbWorkspaceTools} from '../catalog/econdb-workspace.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'econdb-workspaces',family:'econdbWorkspaces',
 title:'Econdb maritime workspaces',order:1540,catalogOrder:1540,configKey:'econdbWorkspaces',
 maxRequestBytes:262144,concurrency:'provider',shutdown:'drain',
 configuration:{input:'econdbWorkspaceConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('../econdb-workspace.mjs')).readEcondbWorkspaceConfiguration(hostPath(value))},
 tools:econdbWorkspaceTools,load:()=>import('../econdb-workspace.mjs'),
 create:(module,config)=>new module.MerchantEcondbWorkspaces(config),
 initialize:async options=>(await import('../econdb-workspace.mjs')).initializeEcondbWorkspaceMerchant(options),
 instructions:[{prefix:'merchant_econdb_',order:1540,text:'Operate host-declared original Econdb workspace IDs. The installed browser, original CLI and Merchant tools share the same operator.lock, exact UUID/revision journal and unchanged source/project/publication engines. Read all history/file pages via nextOffset. Supply complete original command files through host input aliases and pin their exact byte SHA before dispatch; do not regenerate an uncertain request, replace its expectedRevision or create a new UUID. Inspect its original request/receipt and repeat identical bytes. All seven original actions remain source-owned. Buyer export only uses a host-declared existing inbox; merchant preparation creates configuration without starting a seller or purchasing. Use the original source capture CLI for optional issuer HTTP acquisition. File reads use original saved hashes and byte offsets; after host restart omit the expired readId. Complete handover retains every source, request, report, publication and original buyer return. Download every manifest member through econdb-mcp download and receive into an explicitly configured independent destination; preserve an advanced destination. Closing this adapter releases only its file reads, never the existing Application, seller or native controller.'}]
});
