// MIT. Source-owned provider for the maintained merchant operator.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {blendTools} from './mcp-tools.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'data-blends',family:'dataBlends',title:'Saved data blending',order:438,catalogOrder:438,configKey:'dataBlends',
 summary:true,dependencies:[],concurrency:'host',concurrentTools:[],shutdown:'provider',maxRequestBytes:131072,
 configuration:{input:'dataBlendsConnection',privateExports:true,read:async(value,{hostPath})=>(await import('./client.mjs')).readBlendConfiguration(hostPath(value))},
 tools:blendTools,load:()=>import('./mcp.mjs'),create:(module,config)=>new module.MerchantDataBlends(config),
 instructions:[{prefix:'merchant_blends_',order:438,text:'Use the configured workspace and input aliases. Recipes select immutable source editions, ordered join keys and explicit output columns. Reuse a request UUID only for the same operation, and resume it after response loss. Row pages contain full values and source-record numbers. Customer files contain only selected output columns; workspace backups retain private inputs and reviews. Receive every export byte through file_read and its original digest.'}]
});
