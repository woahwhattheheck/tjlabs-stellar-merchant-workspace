// MIT. Lazy source-owned municipal asset merchant contribution.
import { defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA } from '../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import { municipalAssetTools } from './mcp-tools.mjs';
export default defineMerchantProvider({
  schema:MERCHANT_PROVIDER_SCHEMA,id:'municipal-assets',family:'municipalAssets',
  title:'Municipal asset migration and target receiving',order:1010,catalogOrder:1010,
  configKey:'municipalAssets',summary:true,dependencies:[],
  concurrency:'provider',concurrentTools:[],shutdown:'provider',maxRequestBytes:1024*1024,
  configuration:{input:'municipalAssetConnection',privateExports:true,
    read:async(value,{hostPath})=>(await import('./client.mjs')).readMunicipalAssetConfiguration(hostPath(value))},
  tools:municipalAssetTools,load:()=>import('./mcp.mjs'),
  create:(module,config)=>new module.MerchantMunicipalAssets(config),
  initialize:async options=>(await import('./mcp-setup.mjs')).initializeMunicipalAssetMerchant(options),
  instructions:[{prefix:'merchant_municipal_assets_',order:1010,text:
    'Operate the selected original managed municipal workspace as its configured actor. Read status, select its actual project revision, and retain one requestId for each original mutation. Imports and returned Maximo envelopes select complete pinned host files. A lost reply continues through replay_operation using the same original request, bytes and revision. Public-source refresh and target capture resume use their original refresh/capture operation plus a distinct client requestId. Original data mappings, checker, work-order returns, releases and target result meanings belong to the native application. Page project sections or records for inspection; file_read delivers complete originals with a stable readId, SHA-256 and byte offset. Keep every file selection field unchanged throughout a read. The backup file is the original SQLite backup; use the installed stopped-workspace handover for complete filesystem source history. Read operation for compact request state and download operation for original request/response bytes. Reconnect with the actual Applications startup when its instance changes.'
  }]
});
