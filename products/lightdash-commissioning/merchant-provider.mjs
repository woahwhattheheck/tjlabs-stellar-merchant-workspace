// MIT. Source-owned commissioning registration on the existing Merchant lifecycle.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import {lightdashTools} from './catalog.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'lightdash-commissioning',family:'lightdashCommissioning',
 title:'Lightdash commissioning',order:720,catalogOrder:720,configKey:'lightdashCommissioning',
 summary:true,dependencies:[],maxRequestBytes:32*1024*1024,
 configuration:{input:'lightdashWorkspaceConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('./mcp.mjs')).readLightdashConfiguration(hostPath(value))},
 tools:lightdashTools,
 instructions:[{prefix:'merchant_lightdash_',order:720,text:
  'Open a host-declared original Lightdash commissioning workspace. Browser and MCP share one source/SQLite/native lifetime. Inspect declared complete source inputs, intake an immutable edition, edit its saved draft with current revisions, compare and review it, then save the exact original dbt/Lightdash plan before Execute. Retain native operation/project/preview/job/query identifiers. Inspect an uncertain original operation before any deliberately reviewed continuation. Prepare one complete handover UUID; receive both its ZIP and exact original request through retained file chunks. The customer copy retains full source, drafts, reviews and native results with its connection detached. Close drains all original native/packaging/file work. Customer procedures use merchant_lightdash_operating_* with the original OperatingPlan history. Select exact saved source/review/operation/handover IDs; captures are local reads and preserve operator instructions/status. Procedure version CAS and original request UUIDs are distinct from native workspace revisions. Receive complete histories or explicitly review diverged returns. Procedure actions do not dispatch or refresh native work. No metric/query, payment or provider-capture engine is introduced.'}],
 load:()=>import('./mcp.mjs'),
 create:(module,config)=>new module.MerchantLightdashWorkspaces(config)
});
