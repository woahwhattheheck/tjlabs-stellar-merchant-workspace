// MIT. Source-owned companion for already configured original HAR workspaces.
import { defineMerchantProvider, MERCHANT_PROVIDER_SCHEMA } from '../../stellar-forge/mcp-merchant-operator/provider-contract.mjs';
import { capturedHandoverTools } from './handover-catalog.mjs';

export default defineMerchantProvider({
  schema:MERCHANT_PROVIDER_SCHEMA,id:'captured-handovers',family:'capturedHandovers',
  title:'Captured merchant handover',order:445,catalogOrder:435,
  // Reuse the original host-declared harWorkspaces configuration without rewriting
  // existing operators. This companion owns only its connected client calls.
  configKey:null,summary:false,dependencies:[],maxRequestBytes:1024*1024,
  concurrency:'provider',shutdown:'drain',
  tools:capturedHandoverTools,
  instructions:[{order:435,prefix:'merchant_handover_',text:
    'Continue the existing captured product through its saved handover drafts, native jobs and complete archives. '+
    'Select a declared workspace and read merchant_handover_info; pin expectedProductId on every further call. '+
    'Page the full inventory, save the complete outgoing package-manifest/source-review selection, PREPARE, read every relevant document page, and PUBLISH the exact returned review SHA. '+
    'Stream a published file to the receiving workspace with merchant_handover_transfer, preserving both product IDs, file bytes/SHA and uploadId on retries. '+
    'After COMPLETE upload, start IMPORT, retain its job and manifest, create a RECEIVING draft and save its complete names with merchant_handover_receiving_save. '+
    'REVIEW that exact draft revision, inspect native source/package conflicts, then RECEIVE its exact review SHA. '+
    'Every mutation keeps its original request UUID; lost replies replay the same request, and interrupted jobs resume with their original request SHA. '+
    'REOPEN the saved receiving operation after restart and use merchant_har_load for the original saved merchant/source. '+
    'Whole files travel through the original stream/upload engines; small archive_read chunks are for explicit file consumers. '+
    'The companion drains its own accepted calls. The existing product retains browser, seller, agent and source ownership.'}],
  load:()=>import('./handover-agent.mjs'),
  create:(module,config,options)=>new module.MerchantCapturedHandovers(config,{environment:options.environment}),
});
