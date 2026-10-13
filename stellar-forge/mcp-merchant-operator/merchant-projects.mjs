// MIT. Existing managed project requests and readonly invoices, with complete retained outputs.
import {connectMerchantProject,projectNeed} from './merchant-project-connection.mjs';
import {MerchantProjectFiles} from './merchant-project-files.mjs';
import {MERCHANT_PROJECT_PREFIX,merchantProjectArguments} from './merchant-project-protocol.mjs';

export class MerchantProjects {
 #projects=new Map();#files=new Map();#pending=new Set();#closing=false;#closed=null;
 constructor(config) {
  for(const [alias,definition] of Object.entries(config.merchantProjects?.projects??{})) {
   this.#projects.set(alias,definition);this.#files.set(alias,new MerchantProjectFiles(definition));
  }
 }
 get summary() {
  return {configured:this.#projects.size>0,closing:this.#closing,pendingRequests:this.#pending.size,
   projects:[...this.#projects].map(([project,definition])=>({project,label:definition.label,
     selectionSha256:definition.selectionSha256}))};
 }
 async #execute(kind,args) {
  if(kind==='projects')return this.summary;
  const definition=this.#projects.get(args.project),files=this.#files.get(args.project);
  projectNeed(definition,'MERCHANT_PROJECT_AGENT_ALIAS_REQUIRED');
  const {project,...input}=args;let native;
  if(kind==='artifacts')native=await files.list(input);
  else if(kind==='file')native=await files.read(input);
  else if(kind==='file_release'){await files.release(input.readId);native={readId:input.readId,released:true};}
  else {
   const client=await connectMerchantProject(definition);
   if(kind==='status')native=await client.status();
   else if(kind==='inventory')native=await client.inventory(input);
   else if(kind==='receive') {
    projectNeed(input.expectedSelectionSha256===client.connection.selectionSha256,
      'MERCHANT_PROJECT_AGENT_REVIEWED_SELECTION_CHANGED');
    native=await client.receive();
   }
   else if(kind==='manifest'||kind==='receipt')
    native={artifact:await files.document(client.connection,kind,await client[kind]())};
   else {
    const review=await client.review();
    if(kind==='register')native=await review.readRegister(input);
    else if(kind==='invoice') {
     const original=await review.inspectInvoice(input.invoiceId);
     native={invoice:{id:original.order.id,state:original.order.state,reference:original.order.reference,
       title:original.order.title,createdAt:original.order.createdAt,updatedAt:original.order.updatedAt},
       artifact:await files.document(client.connection,kind,original,{invoiceId:input.invoiceId})};
    }
    else if(kind==='envelope')native={artifact:await files.document(client.connection,kind,
      await review.paymentEnvelope(input.invoiceId),{invoiceId:input.invoiceId})};
    else if(kind==='result')native={artifact:await files.result(client.connection,review,input.invoiceId)};
    else if(kind==='register_export')native={artifact:await files.register(client.connection,review,input)};
   }
  }
  projectNeed(native!==undefined,'MERCHANT_PROJECT_AGENT_ACTION_REQUIRED');
  const result={project,selectionSha256:definition.selectionSha256,native};
  projectNeed(Buffer.byteLength(JSON.stringify(result))<=900000,'MERCHANT_PROJECT_AGENT_REPLY_REQUIRES_SMALLER_PAGE');
  return result;
 }
 call(name,input={}) {
  projectNeed(!this.#closing,'MERCHANT_PROJECT_AGENT_CLOSING');
  const kind=name.startsWith(MERCHANT_PROJECT_PREFIX)?name.slice(MERCHANT_PROJECT_PREFIX.length):name;
  const args=merchantProjectArguments(kind,input);
  const task=Promise.resolve().then(()=>this.#execute(kind,args)).catch(error=>{
   const code=/^[A-Za-z0-9_.:-]{1,160}$/.test(error?.code??'')?error.code:'MERCHANT_PROJECT_AGENT_FAILED';
   // Provider diagnostics retain source identity, never host credentials or response bodies.
   throw Object.assign(new Error(code),{code,...(Number.isInteger(error.status)?{status:error.status}:{}),
    ...(error.outcomeUnknown?{outcomeUnknown:true,project:args.project,
      selectionSha256:this.#projects.get(args.project)?.selectionSha256,recovery:'merchant_project_status'}:{})});
  });
  this.#pending.add(task);task.finally(()=>this.#pending.delete(task)).catch(()=>{});return task;
 }
 close() {
  if(this.#closed)return this.#closed;this.#closing=true;
  this.#closed=(async()=>{
   await Promise.allSettled([...this.#pending]);
   const results=await Promise.allSettled([...this.#files.values()].map(owner=>owner.close()));
   const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  })().catch(error=>{this.#closed=null;throw error;});return this.#closed;
 }
}
