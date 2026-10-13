// MIT. Whole original agent documents and result bytes with the shared immutable reader.
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir,mkdtemp,open,link,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {canonicalJson} from '../../products/x402api-merchant-workspace/protocol.mjs';
import {readMerchantInput} from '../../products/x402api-merchant-workspace/application-inputs.mjs';
import {RetainedFileReads} from './retained-file-reads.mjs';
import {projectNeed,projectPrivateDirectory,projectJSON} from './merchant-project-connection.mjs';

const SHA=/^[a-f0-9]{64}$/;
const SCHEMA='stellar-forge.merchant-project-agent-artifact.v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
async function sync(path) {
  const handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await handle.sync();}finally{await handle.close();}
}
async function save(root,name,raw) {
  const destination=join(root,name),stage=await mkdtemp(join(root,'.project-document-'));
  try {
    const temporary=join(stage,'complete'),file=await open(temporary,'wx',0o600);
    try{await file.writeFile(raw);await file.sync();}finally{await file.close();}
    try{await link(temporary,destination);}
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      const original=await readMerchantInput(destination,{maximum:raw.length,privateOnly:true,allowMultipleLinks:true});
      projectNeed(original.descriptor.bytes===raw.length&&original.descriptor.sha256===hash(raw),
        'MERCHANT_PROJECT_AGENT_RETAINED_FILE_CHANGED');
    }
    await rm(temporary);await sync(root);return destination;
  } finally {await rm(stage,{recursive:true,force:true});}
}
export class MerchantProjectFiles {
  #definition;#root;#ready=null;#reads=new RetainedFileReads({errorPrefix:'MERCHANT_PROJECT_FILE'});
  constructor(definition){this.#definition=definition;this.#root=join(definition.exportsDirectory,definition.selectionSha256);}
  async #directory() {
    if(!this.#ready)this.#ready=(async()=>{
      await projectPrivateDirectory(this.#definition.exportsDirectory);
      try{await mkdir(this.#root,{mode:0o700});await sync(this.#definition.exportsDirectory);}
      catch(error){if(error.code!=='EEXIST')throw error;}
      return projectPrivateDirectory(this.#root);
    })().catch(error=>{this.#ready=null;throw error;});
    return this.#ready;
  }
  async #record(connection,kind,payload,details={}) {
    projectNeed(connection.selectionSha256===this.#definition.selectionSha256,
      'MERCHANT_PROJECT_AGENT_ARTIFACT_SELECTION_CHANGED');
    const identity={schema:SCHEMA,selectionSha256:connection.selectionSha256,
      operation:connection.operation,storeId:connection.storeId,manifestSha256:connection.manifestSha256,
      kind,...details,payload};
    const artifactId=hash(canonicalJson(identity)),record={...identity,artifactId};
    await save(await this.#directory(),artifactId+'.json',Buffer.from(JSON.stringify(record)+'\n'));
    return record;
  }
  async document(connection,kind,native,details={}) {
    const raw=Buffer.from(JSON.stringify(native)+'\n'),root=await this.#directory(),sha256=hash(raw);
    projectNeed(raw.length<=64*1024*1024,'MERCHANT_PROJECT_AGENT_DOCUMENT_CAPACITY');
    await save(root,sha256+'.bin',raw);
    return this.#record(connection,kind,{bytes:raw.length,sha256,name:kind+'.json',contentType:'application/json'},details);
  }
  async result(connection,review,invoiceId) {
    const original=await review.inspectInvoice(invoiceId),result=original.order?.result;
    projectNeed(original.order?.id===invoiceId&&Number.isSafeInteger(result?.bytes)&&result.bytes>=0&&
      SHA.test(result?.sha256??''),'MERCHANT_PROJECT_AGENT_ORIGINAL_RESULT_REQUIRED');
    const root=await this.#directory(),saved=await review.downloadInvoiceResult(invoiceId,join(root,result.sha256+'.bin'));
    projectNeed(saved.bytes===result.bytes&&saved.sha256===result.sha256,'MERCHANT_PROJECT_AGENT_RESULT_CHANGED');
    return this.#record(connection,'invoice-result',{bytes:saved.bytes,sha256:saved.sha256,
      name:result.fileName??invoiceId+'.bin',contentType:result.contentType??'application/octet-stream'},{invoiceId});
  }
  async register(connection,review,options) {
    const ticket=await review.prepareRegisterExport(options),root=await this.#directory();
    const saved=await review.downloadRegisterExport(ticket,join(root,ticket.sha256+'.bin'));
    return this.#record(connection,'invoice-register',{bytes:saved.bytes,sha256:saved.sha256,
      name:options.format==='csv'?'invoices.csv':'invoices.json',
      contentType:options.format==='csv'?'text/csv':'application/json'},
      {selection:ticket.selection,revision:ticket.source.revision});
  }
  async inspect(artifactId) {
    projectNeed(SHA.test(artifactId??''),'MERCHANT_PROJECT_AGENT_ARTIFACT_ID_REQUIRED');
    const root=await this.#directory(),record=await projectJSON(join(root,artifactId+'.json'),1024*1024);
    const {artifactId:recorded,...identity}=record;
    projectNeed(recorded===artifactId&&hash(canonicalJson(identity))===artifactId&&identity.schema===SCHEMA&&
      identity.selectionSha256===this.#definition.selectionSha256&&SHA.test(identity.payload?.sha256??'')&&
      Number.isSafeInteger(identity.payload.bytes)&&identity.payload.bytes>=0&&
      typeof identity.payload.name==='string'&&typeof identity.payload.contentType==='string',
      'MERCHANT_PROJECT_AGENT_ARTIFACT_CHANGED');
    return record;
  }
  async list({after='',limit=20}={}) {
    projectNeed((after===''||SHA.test(after))&&Number.isSafeInteger(limit)&&limit>=1&&limit<=50,
      'MERCHANT_PROJECT_AGENT_ARTIFACT_PAGE');
    const names=(await readdir(await this.#directory())).filter(name=>/^[a-f0-9]{64}\.json$/.test(name))
      .map(name=>name.slice(0,-5)).sort().filter(name=>name>after);
    const selected=names.slice(0,limit),artifacts=[];
    for(const id of selected)artifacts.push(await this.inspect(id));
    return {selectionSha256:this.#definition.selectionSha256,artifacts,
      nextAfter:names.length>limit?selected.at(-1):null};
  }
  async read(args) {
    const record=await this.inspect(args.artifactId),root=await this.#directory();
    return this.#reads.read({scope:this.#definition.selectionSha256,key:args.artifactId,kind:record.kind,
      directory:root,expectedSha256:args.expectedSha256??record.payload.sha256,
      offset:args.offset,limit:args.limit,readId:args.readId,
      load:async()=>{
        const handle=await open(join(root,record.payload.sha256+'.bin'),constants.O_RDONLY|constants.O_NOFOLLOW);
        try {
          const info=await handle.stat();
          projectNeed(info.isFile()&&!(info.mode&0o077)&&
            (process.getuid===undefined||info.uid===process.getuid()),'MERCHANT_PROJECT_AGENT_PRIVATE_ARTIFACT_REQUIRED');
          return {readonlyFileHandle:handle,bytes:record.payload.bytes,sha256:record.payload.sha256,
            name:record.payload.name,type:record.payload.contentType};
        } catch(error){await handle.close();throw error;}
      }});
  }
  release(readId){return this.#reads.release(this.#definition.selectionSha256,readId);}
  close(){return this.#reads.close();}
}

export {save as retainMerchantArtifactBytes,sync as syncMerchantArtifactDirectory};
