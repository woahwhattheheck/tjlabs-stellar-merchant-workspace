// MIT. Source-owned provider declaration; listing metadata acquires no workspace.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../provider-contract.mjs';
import {reportingProgrammeTools} from '../catalog/reporting-programmes.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'reporting-programmes',family:'reportingProgrammes',title:'Reporting Programmes',
 order:1085,catalogOrder:1085,configKey:'reportingProgrammes',summary:true,dependencies:[],
 maxRequestBytes:131072,concurrency:'provider',shutdown:'provider',
 configuration:{input:'reportingProgrammesConnection',privateExports:true,dependencies:[],
  read:async(value,{hostPath})=>(await import('../../../products/source-tables/reporting/agent-config.mjs')).readReportingProgrammeConfiguration(hostPath(value))},
 tools:reportingProgrammeTools,
 load:()=>import('../../../products/source-tables/reporting/agent-workspace.mjs'),
 create:(module,config)=>new module.MerchantReportingWorkspaces(config),
 initialize:async options=>(await import('../../../products/source-tables/reporting/agent-config.mjs')).initializeReportingProgrammeMerchant(options),
 instructions:[{order:1085,prefix:'merchant_reporting_',text:
  'Open one explicitly configured original Reporting Programmes store. The installed programme and desk adapter remain the complete domain writers. Inspect and receive whole original SQL, requests, desk context, CSV results, delivery observations and returned projects through declared host inputs; retain their exact SHA256 and native project identity. Preparing or recording a report does not execute provider queries, activate a schedule, send messages or authorize purchases. Provider accounts and actual recipient observations retain their original authority. Before dispatch, save the complete unchanged tool arguments and full source. After interruption inspect the original operation and recover its exact requestSha256; an old request retains its embedded precondition and may replay against a later current project without rewinding it. Different run/route attempts need their own observation identities. A prepared operation owns the next project transition. Export the full native project or complete native handover, inspect its publication, and receive every byte with the original retained reader and installed downloader. Reopen complete projects in the same installed browser or CLI; preserve the previous whole workbench and unfinished edits. A returned project must retain every prior reporting record, source edition and review. Close only the instanceId actually opened by this client; provider shutdown drains admitted work, retained handles and the original native lease.'}]
});
