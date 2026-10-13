// MIT. Full input, plan, result and project artifacts for the original live owner.
import {constants} from 'node:fs';
import {mkdir,readdir,open} from 'node:fs/promises';
import {join} from 'node:path';
import {canonicalJson} from '../../products/x402api-merchant-workspace/protocol.mjs';
import {RetainedFileReads} from './retained-file-reads.mjs';
import {retainMerchantArtifactBytes,syncMerchantArtifactDirectory} from './merchant-project-files.mjs';
import {projectPrivateDirectory,projectJSON,projectNeed as need} from './merchant-project-connection.mjs';
import {invoiceHash} from './merchant-invoice-connection.mjs';
const SHA=/^[a-f0-9]{64}$/,SCHEMA='stellar-forge.merchant-invoice-agent-artifact.v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class MerchantInvoiceFiles {
 #root;#ready=null;#reads=new RetainedFileReads({errorPrefix:'MERCHANT_INVOICE_FILE'});
 constructor(definition){this.definition=definition;this.#root=join(definition.exportsDirectory,definition.scope);}
 async directory() {
  if(!this.#ready)this.#ready=(async()=>{
   await projectPrivateDirectory(this.definition.exportsDirectory);
   try{await mkdir(this.#root,{mode:0o700});await syncMerchantArtifactDirectory(this.definition.exportsDirectory);}
   catch(error){if(error.code!=='EEXIST')throw error;}
   return projectPrivateDirectory(this.#root);
  })().catch(error=>{this.#ready=null;throw error;});return this.#ready;
 }
 async #record(kind,payload,details={}) {
  const identity={schema:SCHEMA,...this.definition.identity,scope:this.definition.scope,kind,...details,payload};
  const artifactId=invoiceHash(canonicalJson(identity)),record={...identity,artifactId};
  await retainMerchantArtifactBytes(await this.directory(),artifactId+'.json',Buffer.from(JSON.stringify(record)+'\n'));
  return record;
 }
 async document(kind,native,details={}) {
  const raw=Buffer.from(JSON.stringify(native)+'\n'),sha256=invoiceHash(raw);
  need(raw.length<=64*1024*1024,'MERCHANT_INVOICE_DOCUMENT_CAPACITY');
  await retainMerchantArtifactBytes(await this.directory(),sha256+'.bin',raw);
  return this.#record(kind,{bytes:raw.length,sha256,name:kind+'.json',contentType:'application/json'},details);
 }
 async request(kind,operation,body) {
  need(['intake','project','invoice-charge','invoice-authorization','invoice-reconcile'].includes(kind)&&UUID.test(operation??''),'MERCHANT_INVOICE_OPERATION_REQUIRED');
  const artifact=await this.document(kind+'-request',body,{operation});
  // Immutable original request reference: a changed body cannot replace the same operation.
  await retainMerchantArtifactBytes(await this.directory(),kind+'-'+operation.toLowerCase()+'.request',
   Buffer.from(JSON.stringify({schema:'stellar-forge.merchant-invoice-agent-request.v1',kind,operation,artifactId:artifact.artifactId})+'\n'));
  return artifact;
 }
 async originalRequest(kind,operation,expectedRequestSha256) {
  need(['intake','project','invoice-charge','invoice-authorization','invoice-reconcile'].includes(kind)&&UUID.test(operation??'')&&SHA.test(expectedRequestSha256??''),
   'MERCHANT_INVOICE_REQUEST_SELECTION');
  const ref=await projectJSON(join(await this.directory(),kind+'-'+operation.toLowerCase()+'.request'));
  need(ref.schema==='stellar-forge.merchant-invoice-agent-request.v1'&&ref.kind===kind&&ref.operation===operation,
   'MERCHANT_INVOICE_REQUEST_CHANGED');
  const artifact=await this.inspect(ref.artifactId);
  need(artifact.kind===kind+'-request'&&artifact.operation===operation&&artifact.payload.sha256===expectedRequestSha256,
   'MERCHANT_INVOICE_REQUEST_CHANGED');
  const body=await projectJSON(join(await this.directory(),artifact.payload.sha256+'.bin'),8*1024*1024);
  need(invoiceHash(Buffer.from(JSON.stringify(body)+'\n'))===expectedRequestSha256,'MERCHANT_INVOICE_REQUEST_CHANGED');
  return {artifact,body};
 }
 async download(kind,client,input) {
  const root=await this.directory();let saved,details={},name,type;
  if(kind==='result') {
   const original=await client.inspectInvoice(input.invoiceId),result=original.order?.result;
   need(Number.isSafeInteger(result?.bytes)&&SHA.test(result?.sha256??''),'MERCHANT_INVOICE_RESULT_REQUIRED');
   saved=await client.downloadInvoiceResult(input.invoiceId,join(root,result.sha256+'.bin'));
   need(saved.bytes===result.bytes&&saved.sha256===result.sha256,'MERCHANT_INVOICE_RESULT_CHANGED');
   details={invoiceId:input.invoiceId};name=result.fileName??input.invoiceId+'.bin';type=result.contentType??'application/octet-stream';
  } else if(kind==='register_export') {
   const ticket=await client.prepareRegisterExport(input);
   saved=await client.downloadRegisterExport(ticket,join(root,ticket.sha256+'.bin'));
   details={selection:ticket.selection,revision:ticket.source.revision};name='invoices.'+input.format;
   type=input.format==='csv'?'text/csv':'application/json';
  } else {
   const status=await client.projectStatus(input.operation);
   need(status.state==='COMPLETE'&&SHA.test(status.archive?.sha256??''),'MERCHANT_INVOICE_PROJECT_NOT_READY');
   saved=await client.downloadProject(input.operation,join(root,status.archive.sha256+'.bin'));
   need(saved.sha256===status.archive.sha256&&String(saved.bytes)===String(status.archive.bytes),
    'MERCHANT_INVOICE_PROJECT_CHANGED');
   details={operation:input.operation};name='merchant-project.zip';type='application/zip';
  }
  return this.#record(kind,{bytes:saved.bytes,sha256:saved.sha256,name,contentType:type},details);
 }
 async inspect(artifactId) {
  need(SHA.test(artifactId??''),'MERCHANT_INVOICE_ARTIFACT_REQUIRED');
  const record=await projectJSON(join(await this.directory(),artifactId+'.json'));
  const {artifactId:recorded,...identity}=record;
  need(recorded===artifactId&&invoiceHash(canonicalJson(identity))===artifactId&&identity.schema===SCHEMA&&
   identity.scope===this.definition.scope&&identity.storeId===this.definition.identity.storeId&&
   identity.tenantId===this.definition.identity.tenantId&&identity.connectionSha256===this.definition.identity.connectionSha256&&
   SHA.test(identity.payload?.sha256??'')&&Number.isSafeInteger(identity.payload.bytes)&&identity.payload.bytes>=0&&
   typeof identity.payload.name==='string'&&typeof identity.payload.contentType==='string','MERCHANT_INVOICE_ARTIFACT_CHANGED');
  return record;
 }
 async list({after='',limit=20}={}) {
  const names=(await readdir(await this.directory())).filter(name=>/^[a-f0-9]{64}\.json$/.test(name))
   .map(name=>name.slice(0,-5)).sort().filter(name=>name>after),artifacts=[];
  for(const id of names.slice(0,limit))artifacts.push(await this.inspect(id));
  return {artifacts,nextAfter:names.length>limit?names[limit-1]:null};
 }
 async read(args) {
  const record=await this.inspect(args.artifactId),root=await this.directory();
  return this.#reads.read({scope:this.definition.scope,key:args.artifactId,kind:record.kind,directory:root,
   expectedSha256:args.expectedSha256??record.payload.sha256,offset:args.offset,limit:args.limit,readId:args.readId,
   load:async()=>{
    const handle=await open(join(root,record.payload.sha256+'.bin'),constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const info=await handle.stat();need(info.isFile()&&!(info.mode&0o077)&&
     (process.getuid===undefined||info.uid===process.getuid()),'MERCHANT_INVOICE_PRIVATE_FILE_REQUIRED');
     return {readonlyFileHandle:handle,bytes:record.payload.bytes,sha256:record.payload.sha256,
      name:record.payload.name,type:record.payload.contentType};}
    catch(error){await handle.close();throw error;}
   }});
 }
 release(id){return this.#reads.release(this.definition.scope,id);}
 close(){return this.#reads.close();}
}
