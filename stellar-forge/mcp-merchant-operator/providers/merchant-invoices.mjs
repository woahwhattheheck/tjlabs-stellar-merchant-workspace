// MIT. Lazy source-owned live invoice consumer; discovery loads metadata only.
import {defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA} from '../provider-contract.mjs';
import {merchantInvoiceTools} from '../merchant-invoice-protocol.mjs';
export default defineMerchantProvider({
 schema:MERCHANT_PROVIDER_SCHEMA,id:'merchant-invoices',family:'merchantInvoices',title:'Merchant invoice operation and complete customer delivery',
 order:1006,catalogOrder:1006,configKey:'merchantInvoices',summary:true,dependencies:[],
 concurrency:'provider',maxRequestBytes:8*1024*1024,
 configuration:{input:'merchantInvoiceConnection',privateExports:true,
  read:async(value,{hostPath})=>(await import('../merchant-invoice-connection.mjs')).readMerchantInvoiceConfiguration(hostPath(value))},
 tools:merchantInvoiceTools,
 instructions:[{prefix:'merchant_invoice_',order:1006,text:
  'Use the original configured live merchant alias and read context. Inspect complete CSV/JSON source or its host-selected file, then prepare one retained operation with the exact source and configuration SHA. Download the whole plan artifact and review every invoice, rail and amount before run with its original planSha256. After an uncertain mutation read that same status; resume_prepare sends only the exact retained request. Original intake creates local drafts through the existing owner. For a selected original invoice, payment retains its complete terms/history and wallet envelope. Charge creates or recovers its original charge. Receive a buyer-provided authorization through the buyer’s existing wallet workflow; authorize requires that exact envelope SHA and can submit a real payment. It neither signs nor changes the buyer’s approval. Reconcile follows the original retained authorization, terminal responses, nextActionAt and fulfillment. After an unknown mutation inspect payment; resume_payment uses only the selected exact original request. Authorization bytes remain in private request artifacts and the original store. Receive complete original invoice/envelope/result/register artifacts. Begin one retained project operation, read status until complete, then receive its original manifest and whole ZIP. Select that exact ZIP through the existing managed Applications intake and merchant_project tools. Artifacts remain available offline; continue file using SHA/readId/offset until nextOffset is null. Credentials are environment references. See INVOICE_AGENT.md.'}],
 load:()=>import('../merchant-invoices.mjs'),create:(module,config)=>new module.MerchantInvoices(config),
});
