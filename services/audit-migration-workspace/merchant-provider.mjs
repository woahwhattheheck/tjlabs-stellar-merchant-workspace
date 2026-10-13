// MIT. Lazy source-owned Audit contribution to the original merchant tool host.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {auditTools} from './agent-tools.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'audit-migration',family:'auditMigration',title:'Audit source, evidence and supplier receiving',order:1095,catalogOrder:1095,
 configKey:'auditMigration',summary:true,dependencies:[],concurrency:'provider',concurrentTools:[],shutdown:'provider',maxRequestBytes:1024*1024,
 configuration:{input:'auditMigrationConnection',privateExports:true,read:async(value,{hostPath})=>(await import('./agent-client.mjs')).readAuditConfiguration(hostPath(value))},
 tools:auditTools,load:()=>import('./agent-merchant.mjs'),create:(module,config)=>new module.MerchantAuditMigration(config),
 initialize:async options=>(await import('./agent-setup.mjs')).initializeAuditMerchant(options),
 instructions:[{prefix:'merchant_audit_migration_',order:1095,text:'Use configured complete original files and the exact observed workspace revision/head. Preserve exact source keys, neutral roles, relationship witnesses, document bytes and missing versus empty cells. Permission/history declarations are source data, not enforced authorization or an audit opinion. Saved scopes/reviews, prepared tables and actual returned files retain their original basis. Every mutation uses the caller’s stable original operationId/time and the maintained CLI/kernel lease. Replay a lost response through the same saved operation. A too-large operation can select a complete pinned host JSON with apply_input. Download full bytes through file_read and the original readId/SHA/offset; keep every selection field fixed. Working recovery and HTML/ZIP preserve original browser copy, source history, selection and unfinished form drafts. Supplier imports, rights, agreements and outcomes remain with their actual owners.'}]
});
