// MIT. Source-owned lazy provider in the maintained Merchant Workspace host.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {dbtProjectTools} from './mcp-tools.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'dbt-projects',family:'dbtProjects',title:'dbt project operations',order:412,catalogOrder:412,
 configKey:'dbtProjects',summary:true,dependencies:[],concurrency:'host',concurrentTools:[],shutdown:'provider',maxRequestBytes:131072,
 configuration:{input:'dbtProjectConnection',privateExports:true,read:async(value,{hostPath})=>(await import('./client.mjs')).readDbtProjectConfiguration(hostPath(value))},
 tools:dbtProjectTools,load:()=>import('./mcp.mjs'),create:(module,config)=>new module.MerchantDbtProjects(config),
 instructions:[{prefix:'merchant_dbt_',order:412,text:'Use only the host-configured original project and source aliases. Retain complete manifest/catalog/run-results/sources/freshness artifact bytes, schema versions and invocation identities; absent outcomes do not indicate success. Bind explicit editions, inspect resource SQL and columns, follow original dependency IDs, and compare both graph editions. Save named review revisions with their original expected_revision and stable request ID. Proposed SQL is an annotation, never an implicit database execution. Bind existing native publisher/customer results with their original query and provenance. Complete JSON/CSV/HTML reports and project ZIPs remain digest-addressed files; read every chunk and verify the full digest. A received project is editable and retains original review history. Provider close drains current native operations.'}]
});
