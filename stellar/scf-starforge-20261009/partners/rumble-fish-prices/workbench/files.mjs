// MIT. Durable complete customer files with the original retained-file reader.
import {mkdir,open,unlink,link,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {acquirePrivateDirectoryWriter} from '../../../sf30-seller-sdk/operations/history.mjs';
import {RetainedFileReads} from '../../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {rumbleNeed,rumbleDigest,rumblePrivateDirectory,rumbleReadPrivateFile,rumbleReadPrivateJson,
  rumbleWritePrivateJson,rumbleParseJson,RUMBLE_HASH,RUMBLE_MAX_RESPONSE_BYTES} from './connection.mjs';
const SCHEMA='stellar-forge.rumble-customer-file.v1';
const digest=value=>rumbleDigest(Buffer.from(JSON.stringify(value)));
async function optional(path) {
  try { return (await rumbleReadPrivateJson(path,128*1024)).value; }
  catch(error) { if(error.code==='ENOENT') return null; throw error; }
}
async function folder(path) {
  try { await mkdir(path,{mode:0o700}); } catch(error) { if(error.code!=='EEXIST') throw error; }
  await rumblePrivateDirectory(path); return path;
}
async function writeExact(path,bytes) {
  const temporary=path+'.'+randomUUID()+'.partial'; let file;
  try {
    file=await open(temporary,'wx',0o600); await file.writeFile(bytes); await file.sync(); await file.close(); file=null;
    await link(temporary,path); await unlink(temporary);
  } finally { if(file) await file.close(); await unlink(temporary).catch(error=>{if(error.code!=='ENOENT') throw error;}); }
}
function filename(value,fallback) {
  const name=/(?:^|;\s*)filename="([^"]*)"/.exec(value||'')?.[1]||fallback;
  rumbleNeed(name===basename(name)&&name.length<=240&&!/[\\/\x00-\x1f\x7f]/.test(name),
    'RUMBLE_FILENAME_INVALID','The original download name is invalid.');
  return name;
}
export class RumbleCustomerFiles {
  #directory; #reads=new RetainedFileReads({errorPrefix:'RUMBLE',maxSnapshotBytes:RUMBLE_MAX_RESPONSE_BYTES});
  constructor(directory) { this.#directory=directory; }
  get summary() { return this.#reads.summary; }
  async #root(scope) {
    await rumblePrivateDirectory(this.#directory);
    return folder(join(await folder(join(this.#directory,'rumble')),scope.alias));
  }
  async #record(scope,fileId) {
    rumbleNeed(RUMBLE_HASH.test(fileId ?? ''),'RUMBLE_FILE_ID_INVALID','Choose a retained customer file ID.');
    const root=await this.#root(scope),record=await optional(join(root,fileId+'.json'));
    rumbleNeed(record?.schema===SCHEMA&&record.fileId===fileId&&record.workspace===scope.alias&&
      record.directory===scope.directory&&RUMBLE_HASH.test(record.sha256 ?? '')&&
      Number.isSafeInteger(record.bytes)&&record.bytes>=0&&record.bytes<=RUMBLE_MAX_RESPONSE_BYTES&&
      record.filename===basename(record.filename)&&!/[\\/\x00-\x1f\x7f]/.test(record.filename),
    'RUMBLE_FILE_NOT_FOUND','Choose a completed customer file for this workspace.',404);
    return {root,record};
  }
  async #save(scope,root,fileId,bytes,metadata) {
    const path=join(root,fileId+'.content'),sha256=rumbleDigest(bytes);
    try { await writeExact(path,bytes); }
    catch(error) {
      if(error.code!=='EEXIST') throw error;
      const previous=await rumbleReadPrivateFile(path);
      rumbleNeed(previous.sha256===sha256,'RUMBLE_FILE_CHANGED','A retained file ID contains different bytes.',409);
    }
    const record={schema:SCHEMA,fileId,workspace:scope.alias,directory:scope.directory,
      createdAt:new Date().toISOString(),...metadata,bytes:bytes.length,sha256};
    await rumbleWritePrivateJson(join(root,fileId+'.json'),record);
    return record;
  }
  async export(scope,client,args) {
    const {operationId,kind,consumerId,editionId,expectedRevision}=args;
    rumbleNeed(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{1,95}$/.test(operationId)&&
      ['workspace','values','csv'].includes(kind)&&Number.isSafeInteger(expectedRevision)&&expectedRevision>=0&&
      (kind==='workspace'?!consumerId&&!editionId:typeof consumerId==='string'&&consumerId.length>0),
      'RUMBLE_EXPORT_INPUT_INVALID','Select a complete workspace or customer output, operation ID and expected source revision.');
    const root=await this.#root(scope),lease=await acquirePrivateDirectoryWriter(root);
    const intent={workspace:scope.alias,directory:scope.directory,workspaceId:scope.workspaceId,
      operationId,kind,consumerId:consumerId??null,editionId:editionId??null,expectedRevision};
    const fileId=digest({workspace:scope.alias,directory:scope.directory,operationId});
    try {
      const intentFile=join(root,fileId+'.operation.json'),prior=await optional(intentFile);
      if(prior)rumbleNeed(prior.intentSha256===digest(intent),'RUMBLE_EXPORT_OPERATION_REUSED',
        'This export operation ID belongs to different reviewed input.',409);
      const complete=await optional(join(root,fileId+'.json'));
      if(complete)return{...(await this.#record(scope,fileId)).record,reused:true};
      let bytes,metadata;
      if(prior){
        try {
          bytes=(await rumbleReadPrivateFile(join(root,fileId+'.content'))).bytes;
          metadata=(await rumbleReadPrivateJson(join(root,fileId+'.prepared.json'),128*1024)).value;
        }catch(error){
          if(error.code!=='ENOENT')throw error;
          rumbleNeed(false,'RUMBLE_EXPORT_INTERRUPTED','Inspect the original customer state after the interrupted export and choose a new operation ID for its current revision.',409);
        }
      }else{
        rumbleNeed(client,'RUMBLE_APPLICATION_DISCONNECTED','Connect the original application before a new export.',409);
        await rumbleWritePrivateJson(intentFile,{intent,intentSha256:digest(intent)});
        if(kind==='workspace'){
          const native=await client.exportBundle(),bundle=native.bundle;bytes=native.bytes;
          rumbleNeed(bundle.revision===expectedRevision,'RUMBLE_EXPORT_REVISION_CHANGED','Reload the current workspace revision.',409);
          metadata={kind,operationId,workspaceId:bundle.workspaceId,revision:bundle.revision,files:bundle.files.length,
            filename:bundle.workspaceId+'.rumble-workbench.json',mediaType:'application/json'};
        }else{
          const feed=await client.values({consumerId,editionId});
          rumbleNeed(feed.customerRevision===expectedRevision,'RUMBLE_EXPORT_REVISION_CHANGED','Reload the current customer revision.',409);
          // Derive both output formats from the same verified exact feed, without a second mutable read.
          const {verifyConsumerValues,consumerCsv}=await import('./consumer.mjs');verifyConsumerValues(feed);
          bytes=Buffer.from(kind==='values'?JSON.stringify(feed,null,2)+'\n':consumerCsv(feed));
          metadata={kind,operationId,workspaceId:feed.workspaceId,consumerId,customerRevision:feed.customerRevision,
            editionId:feed.edition.id,editionSha256:feed.edition.sha256,sourceSha256:feed.sha256,
            filename:consumerId+'-'+feed.edition.id+(kind==='values'?'.json':'.csv'),
            mediaType:kind==='values'?'application/json':'text/csv; charset=utf-8'};
        }
        await rumbleWritePrivateJson(join(root,fileId+'.prepared.json'),metadata);
      }
      rumbleNeed(metadata.workspaceId===scope.workspaceId&&metadata.operationId===operationId&&metadata.kind===kind,
        'RUMBLE_EXPORT_CHANGED','The retained export metadata differs from the reviewed customer.',409);
      return await this.#save(scope,root,fileId,bytes,metadata);
    }finally{await lease.release();}
  }
  async list(scope,offset=0,limit=50) {
    rumbleNeed(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=200,
      'RUMBLE_PAGE_INVALID','Choose a nonnegative offset and a page size from 1 to 200.');
    const root=await this.#root(scope),names=(await readdir(root)).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).sort();
    const files=await Promise.all(names.slice(offset,offset+limit).map(async name=>(await this.#record(scope,name.slice(0,-5))).record));
    return {files,offset,limit,total:names.length,nextOffset:offset+limit<names.length?offset+limit:null};
  }
  async read(scope,args) {
    const {root,record}=await this.#record(scope,args.fileId);
    rumbleNeed(!args.expectedSha256||args.expectedSha256===record.sha256,'RUMBLE_FILE_CHANGED','Choose the retained original file SHA.',409);
    return this.#reads.read({scope:scope.alias,key:args.fileId,kind:record.kind,directory:this.#directory,
      readId:args.readId,expectedSha256:args.expectedSha256||record.sha256,offset:args.offset,limit:args.limit,
      load:async()=>({readonlyFileHandle:await open(join(root,args.fileId+'.content'),constants.O_RDONLY|(constants.O_NOFOLLOW??0)),
        name:record.filename,type:record.mediaType,bytes:record.bytes,sha256:record.sha256})});
  }
  release(scope,id) { return this.#reads.release(scope.alias,id); }
  disconnect(scope) { return this.#reads.closeScope(scope.alias); }
  close() { return this.#reads.close(); }
}
