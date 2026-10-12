// MIT. Durable complete customer files with the original retained-file reader.
import {mkdir,open,unlink,link,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {acquirePrivateDirectoryWriter} from '../../../sf30-seller-sdk/operations/history.mjs';
import {RetainedFileReads} from '../../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {alliumNeed,alliumDigest,alliumPrivateDirectory,alliumReadPrivateFile,alliumReadPrivateJson,
  alliumWritePrivateJson,alliumParseJson,ALLIUM_HASH,ALLIUM_MAX_RESPONSE_BYTES} from './connection.mjs';
const SCHEMA='stellar-forge.allium-customer-file.v1';
const digest=value=>alliumDigest(Buffer.from(JSON.stringify(value)));
async function optional(path) {
  try { return (await alliumReadPrivateJson(path,128*1024)).value; }
  catch(error) { if(error.code==='ENOENT') return null; throw error; }
}
async function folder(path) {
  try { await mkdir(path,{mode:0o700}); } catch(error) { if(error.code!=='EEXIST') throw error; }
  await alliumPrivateDirectory(path); return path;
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
  alliumNeed(name===basename(name)&&name.length<=240&&!/[\\/\x00-\x1f\x7f]/.test(name),
    'ALLIUM_FILENAME_INVALID','The original download name is invalid.');
  return name;
}
export class AlliumCustomerFiles {
  #directory; #reads=new RetainedFileReads({errorPrefix:'ALLIUM',maxSnapshotBytes:ALLIUM_MAX_RESPONSE_BYTES});
  constructor(directory) { this.#directory=directory; }
  get summary() { return this.#reads.summary; }
  async #root(scope) {
    await alliumPrivateDirectory(this.#directory);
    return folder(join(await folder(join(this.#directory,'allium')),scope.alias));
  }
  async #record(scope,fileId) {
    alliumNeed(ALLIUM_HASH.test(fileId ?? ''),'ALLIUM_FILE_ID_INVALID','Choose a retained customer file ID.');
    const root=await this.#root(scope),record=await optional(join(root,fileId+'.json'));
    alliumNeed(record?.schema===SCHEMA&&record.fileId===fileId&&record.workspace===scope.alias&&
      record.directory===scope.directory&&ALLIUM_HASH.test(record.sha256 ?? '')&&
      Number.isSafeInteger(record.bytes)&&record.bytes>=0&&record.bytes<=ALLIUM_MAX_RESPONSE_BYTES&&
      record.filename===basename(record.filename)&&!/[\\/\x00-\x1f\x7f]/.test(record.filename),
    'ALLIUM_FILE_NOT_FOUND','Choose a completed customer file for this workspace.',404);
    return {root,record};
  }
  async #save(scope,root,fileId,bytes,metadata) {
    const path=join(root,fileId+'.content'),sha256=alliumDigest(bytes);
    try { await writeExact(path,bytes); }
    catch(error) {
      if(error.code!=='EEXIST') throw error;
      const previous=await alliumReadPrivateFile(path);
      alliumNeed(previous.sha256===sha256,'ALLIUM_FILE_CHANGED','A retained file ID contains different bytes.',409);
    }
    const record={schema:SCHEMA,fileId,workspace:scope.alias,directory:scope.directory,
      createdAt:new Date().toISOString(),...metadata,bytes:bytes.length,sha256};
    await alliumWritePrivateJson(join(root,fileId+'.json'),record);
    return record;
  }
  async download(scope,client,{acquisitionId,kind}) {
    const root=await this.#root(scope),lease=await acquirePrivateDirectoryWriter(root);
    try {
      const source=await client.download({acquisitionId,kind});
      const fileId=digest({workspaceId:client.connection.workspaceId,acquisitionId,kind,sha256:source.sha256});
      const prior=await optional(join(root,fileId+'.json'));
      if(prior) return {...(await this.#record(scope,fileId)).record,reused:true};
      return await this.#save(scope,root,fileId,source.bytes,{kind:'acquisition',acquisitionId,sourceKind:kind,
        workspaceId:client.connection.workspaceId,
        filename:filename(source.headers.get('content-disposition'),acquisitionId+'-'+kind),
        mediaType:source.headers.get('content-type')||'application/octet-stream'});
    } finally { await lease.release(); }
  }
  async export(scope,client,{operationId,expectedRevision}) {
    const root=await this.#root(scope),lease=await acquirePrivateDirectoryWriter(root);
    const intent={workspace:scope.alias,directory:scope.directory,operationId,expectedRevision};
    const fileId=digest({workspace:scope.alias,directory:scope.directory,operationId});
    try {
      const intentFile=join(root,fileId+'.operation.json'),prior=await optional(intentFile);
      if(prior) alliumNeed(prior.intentSha256===digest(intent),'ALLIUM_EXPORT_OPERATION_REUSED',
        'This export operation ID belongs to different reviewed input.',409);
      const complete=await optional(join(root,fileId+'.json'));
      if(complete) return {...(await this.#record(scope,fileId)).record,reused:true};
      let bytes,bundle;
      if(prior) {
        try {
          bytes=(await alliumReadPrivateFile(join(root,fileId+'.content'))).bytes;
          bundle=alliumParseJson(bytes);
        } catch(error) {
          if(error.code!=='ENOENT') throw error;
          alliumNeed(false,'ALLIUM_EXPORT_INTERRUPTED',
            'Inspect the original workspace after the interrupted export, then export its current revision with a new operation ID.',409);
        }
      } else {
        alliumNeed(client,'ALLIUM_APPLICATION_DISCONNECTED','Connect the original application before a new export.',409);
        await alliumWritePrivateJson(intentFile,{intent,intentSha256:digest(intent)});
        const source=await client.exportBundle({expectedRevision}); bytes=source.bytes; bundle=source.bundle;
      }
      alliumNeed(bundle?.schema==='stellar-forge.allium-workspace-export.v1'&&bundle.runtime==='STOPPED'&&
        ALLIUM_HASH.test(bundle.manifestSha256 ?? '')&&Array.isArray(bundle.files),
      'ALLIUM_EXPORT_INVALID','The retained export is not a complete original Allium workspace.');
      return await this.#save(scope,root,fileId,bytes,{kind:'workspace',operationId,expectedRevision,
        workspaceId:bundle.workspaceId,nativeExportId:bundle.id,manifestSha256:bundle.manifestSha256,
        files:bundle.files.length,filename:bundle.workspaceId+'.allium-workspace.json',mediaType:'application/json'});
    } finally { await lease.release(); }
  }
  async list(scope,offset=0,limit=50) {
    alliumNeed(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=200,
      'ALLIUM_PAGE_INVALID','Choose a nonnegative offset and a page size from 1 to 200.');
    const root=await this.#root(scope),names=(await readdir(root)).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).sort();
    const files=await Promise.all(names.slice(offset,offset+limit).map(async name=>(await this.#record(scope,name.slice(0,-5))).record));
    return {files,offset,limit,total:names.length,nextOffset:offset+limit<names.length?offset+limit:null};
  }
  async read(scope,args) {
    const {root,record}=await this.#record(scope,args.fileId);
    alliumNeed(!args.expectedSha256||args.expectedSha256===record.sha256,'ALLIUM_FILE_CHANGED','Choose the retained original file SHA.',409);
    return this.#reads.read({scope:scope.alias,key:args.fileId,kind:record.kind,directory:this.#directory,
      readId:args.readId,expectedSha256:args.expectedSha256||record.sha256,offset:args.offset,limit:args.limit,
      load:async()=>({readonlyFileHandle:await open(join(root,args.fileId+'.content'),constants.O_RDONLY|(constants.O_NOFOLLOW??0)),
        name:record.filename,type:record.mediaType,bytes:record.bytes,sha256:record.sha256})});
  }
  release(scope,id) { return this.#reads.release(scope.alias,id); }
  disconnect(scope) { return this.#reads.closeScope(scope.alias); }
  close() { return this.#reads.close(); }
}
