// MIT. Invoice workspace metadata; native operators remain lazy and owned.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../provider-contract.mjs';
import {invoiceSettlementTools} from '../catalog/invoice-settlement-workspace.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'invoice-settlement-workspaces',family:'invoiceWorkspaces',
 title:'Invoice & Settlement workspaces',order:540,catalogOrder:540,configKey:'invoiceWorkspaces',
 configuration:{input:'invoiceWorkspaceConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('../invoice-settlement-workspace.mjs')).readInvoiceWorkspaceConfiguration(hostPath(value))},
 tools:invoiceSettlementTools,maxRequestBytes:2097152,
 instructions:[{prefix:'merchant_invoice_',order:540,text:'Select a declared original invoice workspace. Read current identity/revision and native method declarations. Changes preserve their original request UUID and expected revision; request.status reconciles an interrupted original request. Host input aliases retain complete original bytes. Native source capture and listener delivery use the host private connections and original pending request semantics. Horizon review is evidence, and horizon.apply records explicit reviewed decisions, not a payment. Exports use a private host-owned directory and include complete application/source/workspace/runtime bytes. Download every listed member and verify the native manifest before independent cold receiving. Complete exports replay the original UUID rather than selecting a newer revision. Close the exact observed operator instance only when its owner intends to stop it.'}],
 load:()=>import('../invoice-settlement-workspace.mjs'),
 create:(module,config)=>new module.MerchantInvoiceWorkspaces(config)
});
