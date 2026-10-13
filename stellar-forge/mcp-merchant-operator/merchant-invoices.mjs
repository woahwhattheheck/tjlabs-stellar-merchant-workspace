// MIT. Complete live invoice source -> reviewed original plan -> project consumer.
import {connectMerchantInvoice,selectedInvoiceSource,invoiceHash} from './merchant-invoice-connection.mjs';
import {MerchantInvoiceFiles} from './merchant-invoice-files.mjs';
import {merchantInvoiceArguments,MERCHANT_INVOICE_PREFIX} from './merchant-invoice-protocol.mjs';
import {projectNeed as need} from './merchant-project-connection.mjs';
const SHA=/^[a-f0-9]{64}$/;
export class MerchantInvoices {
 #owners=new Map();#files=new Map();#pending=new Set();#closing=false;#closed=null;
 constructor(config) {
  for(const [alias,definition] of Object.entries(config.merchantInvoices?.merchants??{})) {
   this.#owners.set(alias,definition);this.#files.set(alias,new MerchantInvoiceFiles(definition));
  }
 }
 get summary() {return {configured:this.#owners.size>0,closing:this.#closing,pendingRequests:this.#pending.size,
  merchants:[...this.#owners].map(([merchant,d])=>({merchant,label:d.label,...d.identity,sources:
   Object.entries(d.sources).map(([source,s])=>({source,name:s.name,format:s.format,sha256:s.sha256}))}))};}
 #status(value,definition,operation,expectedPlan) {
  need(value?.schema==='stellar-forge.merchant-intake-status.v1'&&value.operation===operation&&
   value.storeId===definition.identity.storeId&&value.tenantId===definition.identity.tenantId&&SHA.test(value.planSha256??'')&&
   (!expectedPlan||value.planSha256===expectedPlan)&&Array.isArray(value.invoices)&&value.counts&&typeof value.state==='string',
   'MERCHANT_INVOICE_RESPONSE_CHANGED');return value;
 }
 #summary(value) {return {operation:value.operation,state:value.state,planSha256:value.planSha256,
  source:value.source,configurationSha256:value.configurationSha256,configurationCurrent:value.configurationCurrent,
  counts:value.counts,...(value.interruption?{interruption:value.interruption}:{})};}
 async #mutate({kind,operation,request,files,definition,send,expectedPlan}) {
  const recovery={tool:kind==='project'?'merchant_invoice_project_status':'merchant_invoice_status',operation};
  let value;
  try {
   value=await send();
   if(kind==='intake')this.#status(value,definition,operation,expectedPlan);
   else need(value?.operation===operation&&value.storeId===definition.identity.storeId,'MERCHANT_INVOICE_PROJECT_CHANGED');
  } catch(error) {
   // Successful-response validation and original transport failures both follow
   // the selected original operation. Never replace its UUID or repeat implicitly.
   if(error.status===undefined||error.status===null||error.outcome==='UNKNOWN')
    Object.assign(error,{outcome:'UNKNOWN',recovery,requestArtifact:request});
   throw error;
  }
  try {
   const artifact=await files.document(kind+'-status',value,{operation});
   return {requestArtifact:request,artifact,...(kind==='intake'?this.#summary(value):{operation,state:value.state})};
  } catch(error) {
   // The server response was received. An output publication failure does not
   // erase that outcome or change the original operation used for recovery.
   Object.assign(error,{outcome:'RECEIVED',recovery,requestArtifact:request,
    received:kind==='intake'?this.#summary(value):{operation,state:value.state}});
   throw error;
  }
 }
 async #execute(kind,args) {
  if(kind==='merchants')return this.summary;
  const d=this.#owners.get(args.merchant),files=this.#files.get(args.merchant);
  need(d,'MERCHANT_INVOICE_ALIAS_REQUIRED');const {merchant,...a}=args;let native;
  if(kind==='artifacts')native=await files.list(a);
  else if(kind==='file')native=await files.read(a);
  else if(kind==='file_release'){await files.release(a.readId);native={readId:a.readId,released:true};}
  else {
   const client=await connectMerchantInvoice(d);
   if(kind==='context') {
    const v=await client.intakeContext();
    need(v?.storeId===d.identity.storeId&&v.tenantId===d.identity.tenantId&&SHA.test(v.configurationSha256??''),
     'MERCHANT_INVOICE_CONTEXT_CHANGED');
    native={configurationSha256:v.configurationSha256,mode:v.mode,maximumInvoices:v.maximumInvoices,
     maximumSourceRows:v.maximumSourceRows,maximumSourceBytes:v.maximumSourceBytes,
     artifact:await files.document('intake-context',v)};
   } else if(kind==='source') {
    const source=await selectedInvoiceSource(d,a),v=await client.inspectIntakeSource(source);
    need(Array.isArray(v.rows)&&Array.isArray(v.columns)&&v.source?.sha256===invoiceHash(Buffer.from(source.text)),
     'MERCHANT_INVOICE_SOURCE_CHANGED');
    native={source:{name:v.source.name,format:v.source.format,bytes:v.source.bytes,sha256:v.source.sha256},
     columns:v.columns,rows:v.rows.length,artifact:await files.document('intake-source',v)};
   } else if(kind==='prepare'||kind==='resume_prepare') {
    let body,request;
    if(kind==='prepare') {
     const source=await selectedInvoiceSource(d,a);
     need(invoiceHash(Buffer.from(source.text))===a.sourceSha256,'MERCHANT_INVOICE_REVIEWED_SOURCE_CHANGED');
     body={operation:a.operation,storeId:d.identity.storeId,tenantId:d.identity.tenantId,
      configurationSha256:a.configurationSha256,source,mapping:a.mapping};
     request=await files.request('intake',a.operation,body);
    } else {const selected=await files.originalRequest('intake',a.operation,a.expectedRequestSha256);body=selected.body;request=selected.artifact;}
    native=await this.#mutate({kind:'intake',operation:a.operation,request,files,definition:d,send:()=>client.prepareIntake(body)});
   } else if(kind==='run') {
    const request=await files.document('intake-run-request',{operation:a.operation,planSha256:a.expectedPlanSha256},{operation:a.operation});
    native=await this.#mutate({kind:'intake',operation:a.operation,request,files,definition:d,
     expectedPlan:a.expectedPlanSha256,send:()=>client.runIntake(a.operation,a.expectedPlanSha256)});
   } else if(kind==='status') {
    const value=this.#status(await client.readIntake(a.operation),d,a.operation);
    native={...this.#summary(value),artifact:await files.document('intake-status',value,{operation:a.operation})};
   } else if(kind==='plan') {
    const value=await client.exportIntake(a.operation),status=this.#status(value.status,d,a.operation);
    need(value.plan?.planSha256===status.planSha256&&value.plan?.operation===a.operation,'MERCHANT_INVOICE_PLAN_CHANGED');
    native={...this.#summary(status),artifact:await files.document('intake-plan',value,{operation:a.operation})};
   } else if(kind==='intakes') {
    const v=await client.listIntakes();need(Array.isArray(v.intakes),'MERCHANT_INVOICE_LIST_CHANGED');
    const offset=a.offset??0,limit=a.limit??20;
    native={intakes:v.intakes.slice(offset,offset+limit),total:v.intakes.length,
     nextOffset:offset+limit<v.intakes.length?offset+limit:null,artifact:await files.document('intake-list',v)};
   } else if(kind==='register')native=await client.readRegister(a);
   else if(kind==='invoice') {
    const v=await client.inspectInvoice(a.invoiceId);
    native={invoice:{id:v.order.id,state:v.order.state,reference:v.order.reference,title:v.order.title},
     artifact:await files.document('invoice',v,{invoiceId:a.invoiceId})};
   } else if(kind==='envelope')native={artifact:await files.document('envelope',await client.paymentEnvelope(a.invoiceId),{invoiceId:a.invoiceId})};
   else if(['result','register_export','project_download'].includes(kind))native={artifact:await files.download(kind,client,a)};
   else if(kind==='project')native={artifact:await files.document('project-capability',await client.project())};
   else if(kind==='project_begin') {
    const request=await files.request('project',a.operation,{operation:a.operation});
    native=await this.#mutate({kind:'project',operation:a.operation,request,files,definition:d,send:()=>client.beginProject(a.operation)});
   } else if(kind==='project_status') {
    const value=await client.projectStatus(a.operation);
    native={operation:a.operation,state:value.state,artifact:await files.document('project-status',value,{operation:a.operation})};
   } else if(kind==='project_manifest')native={artifact:await files.document('project-manifest',await client.projectManifest(a.operation),{operation:a.operation})};
  }
  need(native!==undefined,'MERCHANT_INVOICE_ACTION_REQUIRED');
  const result={merchant,...d.identity,native};
  need(Buffer.byteLength(JSON.stringify(result))<=900000,'MERCHANT_INVOICE_REPLY_REQUIRES_SMALLER_PAGE');return result;
 }
 call(name,input={}) {
  need(!this.#closing,'MERCHANT_INVOICE_CLOSING');
  const kind=name.startsWith(MERCHANT_INVOICE_PREFIX)?name.slice(MERCHANT_INVOICE_PREFIX.length):name;
  const args=merchantInvoiceArguments(kind,input);
  const task=Promise.resolve().then(()=>this.#execute(kind,args)).catch(error=>{
   const code=/^[A-Za-z0-9_.:-]{1,160}$/.test(error?.code??'')?error.code:'MERCHANT_INVOICE_FAILED';
   throw Object.assign(new Error(code),{code,...(Number.isInteger(error.status)?{status:error.status}:{}),
    ...(error.outcome?{outcome:error.outcome,merchant:args.merchant,...this.#owners.get(args.merchant)?.identity,
     recovery:{...error.recovery,merchant:args.merchant},requestArtifact:error.requestArtifact,received:error.received}:{})});
  });
  this.#pending.add(task);task.finally(()=>this.#pending.delete(task)).catch(()=>{});return task;
 }
 close() {
  if(this.#closed)return this.#closed;this.#closing=true;
  this.#closed=(async()=>{
   await Promise.allSettled([...this.#pending]);
   const results=await Promise.allSettled([...this.#files.values()].map(f=>f.close()));
   const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  })().catch(error=>{this.#closed=null;throw error;});return this.#closed;
 }
}
