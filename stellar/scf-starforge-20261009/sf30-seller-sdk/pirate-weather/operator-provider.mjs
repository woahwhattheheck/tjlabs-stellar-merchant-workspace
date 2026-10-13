// SPDX-License-Identifier: MIT
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {pirateMerchantTools} from './operator-tools.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'pirate-weather',family:'pirateWeather',configKey:'pirateWeatherWorkspaces',
 title:'Pirate Weather forecast reports and delivery',order:1460,catalogOrder:1460,summary:true,dependencies:[],
 configuration:{input:'pirateWeatherConnection',privateExports:true,read:async(value,{hostPath})=>(await import('./operator.mjs')).readPirateOperatorConfiguration(hostPath(value))},
 tools:pirateMerchantTools,maxRequestBytes:12582912,concurrency:'provider',concurrentTools:['merchant_pirate_disconnect','merchant_pirate_file_release'],
 shutdown:'provider',requestClose:runtime=>runtime.close(),load:()=>import('./operator.mjs'),create:(module,config)=>new module.MerchantPirateWeather(config.pirateWeatherWorkspaces),
 instructions:[{order:1460,prefix:'merchant_pirate_',text:'Preserve the original Pirate response bytes, HTTP/body outcome, exact number tokens, requested and returned location, units, timestamps, flags and attribution. A forecast report is a projection of those saved sources; it is not an observation or an independent forecast. Prepare one contract for up to three locations and two named daily cadences. Every provider request is explicit; retain its UUID before calling, preserve rate-limit evidence/deadlines and never repeat an unknown invocation. Review each complete 48-hour report before export or native dataset preparation. The existing SF30 versioned dataset, SF82 merchant release and SF88 Buyer Inbox keep their original source, payment, release and request IDs. Native starts and Buyer receipt intake remain explicit. A complete project includes actual selected package source, original responses, decisions and original workspace history; verify the same trusted application before receiving it. Applications owns Start/Open/Stop; disconnect closes only this operator connection and its readers.'}]
});
