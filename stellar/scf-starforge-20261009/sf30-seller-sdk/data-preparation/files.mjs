// MIT. Restartable readers over immutable complete native preparation deliveries.
import {readdir} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {RetainedFileReads} from '../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {PREPARATION_HASH,PREPARATION_DEFAULT_RECEIVING_BYTES,preparationNeed,preparationDigest,
  preparationPrivateDirectory,preparationReadJson,preparationOpenFile,preparationWorkspaceIdentity} from './connection.mjs';
export class PreparationCustomerFiles{
  #reads;
  constructor(maximum=PREPARATION_DEFAULT_RECEIVING_BYTES){
    this.#reads=new RetainedFileReads({errorPrefix:'PREPARATION',maxImmutableFileBytes:maximum});
  }
  get summary(){return this.#reads.summary;}
  async root(scope){
    const identity=await preparationWorkspaceIdentity(scope.directory);
    preparationNeed(identity.workspaceSha256===scope.workspaceSha256&&
      identity.directoryIdentity.dev===scope.directoryIdentity.dev&&identity.directoryIdentity.ino===scope.directoryIdentity.ino,
    'PREPARATION_WORKSPACE_CHANGED','The configured original workspace directory changed.',409);
    const root=join(scope.directory,'managed-deliveries');await preparationPrivateDirectory(root);return root;
  }
  async record(scope,fileId){
    preparationNeed(PREPARATION_HASH.test(fileId??''),'PREPARATION_FILE_ID_INVALID','Choose a completed original file ID.');
    const root=await this.root(scope),record=(await preparationReadJson(join(root,fileId+'.json'),{maximum:128*1024})).value;
    preparationNeed(record?.schema==='stellar-forge.data-preparation-delivery.v1'&&record.fileId===fileId&&
      record.workspaceSha256===scope.workspaceSha256&&PREPARATION_HASH.test(record.sha256??'')&&
      PREPARATION_HASH.test(record.stateSha256??'')&&Number.isSafeInteger(record.bytes)&&record.bytes>=0&&
      ['project','merchant','report','result'].includes(record.kind)&&
      record.filename===basename(record.filename)&&!/[\\/\x00-\x1f\x7f]/.test(record.filename)&&
      typeof record.mediaType==='string'&&
      preparationDigest(Buffer.from(JSON.stringify([scope.workspaceSha256,record.operationId])))===fileId,
    'PREPARATION_DELIVERY_INVALID','Choose a complete original delivery for this workspace.');
    return {root,record,path:join(root,fileId+'.content')};
  }
  async list(scope,{offset=0,limit=50,expectedInventorySha256}={}){
    preparationNeed(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=200,
      'PREPARATION_PAGE_INVALID','Use a nonnegative offset and a page of 1–200 completed deliveries.');
    let root;
    try{root=await this.root(scope);}catch(error){if(error.code!=='ENOENT')throw error;}
    const names=root?(await readdir(root)).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).sort():[];
    const inventorySha256=preparationDigest(Buffer.from(JSON.stringify(names)));
    preparationNeed(expectedInventorySha256===undefined||expectedInventorySha256===inventorySha256,
      'PREPARATION_INVENTORY_CHANGED','A new delivery changed the inventory; reopen its first page.',409);
    const files=await Promise.all(names.slice(offset,offset+limit).map(async name=>(await this.record(scope,name.slice(0,-5))).record));
    return {files,inventorySha256,offset,limit,total:names.length,nextOffset:offset+limit<names.length?offset+limit:null};
  }
  async read(scope,args){
    const {record,path,root}=await this.record(scope,args.fileId);
    preparationNeed(args.expectedSha256===undefined||args.expectedSha256===record.sha256,'PREPARATION_DELIVERY_CHANGED',
      'Continue the complete original file SHA-256.',409);
    return this.#reads.read({scope:scope.alias,key:args.fileId,kind:record.kind,directory:root,
      readId:args.readId,expectedSha256:args.expectedSha256??record.sha256,offset:args.offset,limit:args.limit,
      load:async()=>{
        const source=await preparationOpenFile(path,{privateOnly:true});
        return {readonlyFileHandle:source.handle,bytes:record.bytes,sha256:record.sha256,name:record.filename,type:record.mediaType};
      }});
  }
  release(scope,readId){return this.#reads.release(scope.alias,readId);}
  disconnect(scope){return this.#reads.closeScope(scope.alias);}
  close(){return this.#reads.close();}
}
