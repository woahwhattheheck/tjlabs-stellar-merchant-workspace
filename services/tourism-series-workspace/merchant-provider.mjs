// MIT. Lazy source-owned Tourism contribution to the original merchant tool host.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {tourismTools} from './agent-tools.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'tourism-series',family:'tourismSeries',title:'Tourism source series and customer receiving',order:1090,catalogOrder:1090,
 configKey:'tourismSeries',summary:true,dependencies:[],concurrency:'provider',concurrentTools:[],shutdown:'provider',maxRequestBytes:1024*1024,
 configuration:{input:'tourismSeriesConnection',privateExports:true,read:async(value,{hostPath})=>(await import('./agent-client.mjs')).readTourismConfiguration(hostPath(value))},
 tools:tourismTools,load:()=>import('./agent-merchant.mjs'),create:(module,config)=>new module.MerchantTourismSeries(config),
 initialize:async options=>(await import('./agent-setup.mjs')).initializeTourismMerchant(options),
 instructions:[{prefix:'merchant_tourism_series_',order:1090,text:'Use configured complete original files and the exact observed workspace revision/head. Preserve registry, geography, period, unit, multiplier, method, population and price basis. Original source rows, attributed corrections, frozen reports, target plans and actual return files stay separate. Every mutation uses the caller’s stable original operationId/time and the maintained CLI/kernel lease. Replay a lost response through the same saved operation. A too-large operation can select a complete pinned host JSON with apply_input. Download full bytes through file_read and the original readId/SHA/offset; keep every selection field fixed. Working recovery and HTML/ZIP preserve original browser copy, source history, selection and unfinished form drafts. Supplier imports, rights, agreements and outcomes remain with their actual owners.'}]
});
