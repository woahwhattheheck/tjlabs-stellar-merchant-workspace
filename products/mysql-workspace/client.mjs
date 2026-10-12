// MIT. Typed product methods and original resumable merchant file transport.
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openMerchantFileClient, createRetainedDownload } from '../../stellar-forge/mcp-merchant-operator/retained-download.mjs';
import { mysqlProductTools } from './merchant-tools.mjs';
import { readPrivate, absolute, need, object, identity, digest, bytes, SESSION_SCHEMA, UUID, SHA } from './setup.mjs';
import { inspectMysqlArchive, restoreMysqlArchive } from './receiving.mjs';

const definitions=new Map(mysqlProductTools((name,description,properties)=>[name,{properties}]));
const MANIFEST='MYSQL_DOWNLOAD.json', DOWNLOAD_SCHEMA='stellar-forge.mysql-product-download.v1';
const MAXIMUM=8*1024*1024*1024;
function session(raw){
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  need(object(value)&&value.schema===SESSION_SCHEMA&&UUID.test(value.productId??'')&&
    /^[a-z][a-z0-9_-]{0,63}$/.test(value.workspace??''),'MYSQL_PRODUCT_CONNECTION_INVALID');
  need(value.state==='OPEN'&&typeof value.mcpUrl==='string','MYSQL_PRODUCT_AGENT_NOT_OPEN',
    'Start this original product with its merchant agent before connecting.');return value;
}
function parseManifest(raw,exportId){
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  need(value.schema===DOWNLOAD_SCHEMA&&value.exportId===exportId&&SHA.test(exportId)&&
    UUID.test(value.productId??'')&&['archive','client'].includes(value.kind)&&Array.isArray(value.files)&&value.files.length===1,
    'MYSQL_PRODUCT_DOWNLOAD_MANIFEST_INVALID');
  const file=value.files[0];
  need(typeof file.name==='string'&&/^[A-Za-z0-9_-]+(?:-customer-client)?(?:\.client)?\.tar\.gz$/.test(file.name)&&
    Number.isSafeInteger(file.bytes)&&file.bytes>0&&file.bytes<=MAXIMUM&&SHA.test(file.sha256)&&file.sha256===exportId,
    'MYSQL_PRODUCT_DOWNLOAD_MANIFEST_INVALID');
  return value;
}
const downloader=createRetainedDownload({manifestName:MANIFEST,parseManifest,maximumBytes:MAXIMUM,
  stateSchema:'stellar-forge.mysql-product-download-state.v1',resultSchema:'stellar-forge.mysql-product-download-result.v1',
  toolPrefix:'mysql_product_receive',errorPrefix:'MYSQL_PRODUCT_FILE',clientName:'starforge-mysql-product',
  validateExportId:value=>need(SHA.test(value),'MYSQL_PRODUCT_DOWNLOAD_ID_INVALID'),
  describe:manifest=>({productId:manifest.productId,workspace:manifest.workspace,kind:manifest.kind})});

/** The same saved product identity is reread before every native action. Mutations are never retried automatically. */
export class MysqlProductClient{
  #file;#environment;#signal;#identity;#transport;
  constructor({connectionFile,productId,workspace,environment=process.env,signal}={}){
    this.#file=absolute(resolve(connectionFile));this.#environment=environment;this.#signal=signal;
    need((productId===undefined)===(workspace===undefined),'MYSQL_PRODUCT_CLIENT_SELECTION');
    this.#identity=productId===undefined?null:{productId,workspace};
  }
  get endpoint(){need(this.#identity,'MYSQL_PRODUCT_CLIENT_NOT_READY');
    return'mysql-product:'+this.#identity.productId+'/'+this.#identity.workspace;}
  async #connected(){
    const raw=await readPrivate(this.#file,65536),value=session(raw),selected={productId:value.productId,workspace:value.workspace};
    if(this.#identity)need(identity(this.#identity)===identity(selected),'MYSQL_PRODUCT_CLIENT_IDENTITY_CHANGED',
      'The original connection now selects another product. Create an explicitly selected client.');
    this.#identity??=selected;
    const key=digest(Buffer.concat([raw,Buffer.from('\0'+(this.#environment[value.tokenEnv]??''))]));
    if(this.#transport?.key!==key){
      const entry={key,value,promise:openMerchantFileClient({url:value.mcpUrl,tokenEnv:value.tokenEnv,environment:this.#environment,
        signal:this.#signal,errorPrefix:'MYSQL_PRODUCT',clientName:'starforge-mysql-product',maximumResponseBytes:24*1024*1024})};
      this.#transport=entry;entry.promise.catch(()=>{if(this.#transport===entry)this.#transport=null;});
    }
    return{client:await this.#transport.promise,value};
  }
  async ready(){const{value}=await this.#connected();return{...this.#identity,endpoint:this.endpoint,
    browserUrl:value.browserUrl,mcpUrl:value.mcpUrl,nativeInstanceId:value.nativeInstanceId};}
  async call(name,args={},options={}){
    const definition=definitions.get(name);need(definition&&object(args),'MYSQL_PRODUCT_TOOL_INVALID');
    const{client}=await this.#connected(),selected={...args};
    if(Object.hasOwn(definition.properties,'workspace')){
      need(selected.workspace===undefined||selected.workspace===this.#identity.workspace,'MYSQL_PRODUCT_CLIENT_IDENTITY_CHANGED');
      selected.workspace=this.#identity.workspace;
    }
    const value=await client.call(name,selected,options);
    return Object.hasOwn(value,'workspace')&&Object.hasOwn(value,'result')?value.result:value;
  }
  status(){return this.call('merchant_mysql_product_status');}
  catalog(table){return this.call('merchant_mysql_product_catalog',table===undefined?{}:{table});}
  review(choices){return this.call('merchant_mysql_product_review',{choices});}
  preview(selection){return this.call('merchant_mysql_product_preview',selection);}
  prepare(selection){return this.call('merchant_mysql_product_prepare',selection);}
  release(releaseId){return this.call('merchant_mysql_product_release',{releaseId});}
  releases(page=0){return this.call('merchant_mysql_product_releases',{page});}
  saveDraft(input){return this.call('merchant_mysql_product_draft_save',input);}
  draft(draftId,revision){return this.call('merchant_mysql_product_draft',{draftId,...(revision===undefined?{}:{revision})});}
  publicationCreate(input){return this.call('merchant_mysql_product_publication_create',input);}
  publicationOpen(input){return this.call('merchant_mysql_product_publication_open',input);}
  publicationCall(releaseId,instanceId,action,args={}){
    need(/^[a-z_]+$/.test(action),'MYSQL_PRODUCT_PUBLISHER_TOOL_INVALID');
    return this.call('merchant_mysql_product_publish_'+action,{releaseId,instanceId,...args});
  }
  prepareHandover(requestId){return this.call('merchant_mysql_product_archive',{requestId});}
  async receiveFiles({kind='archive',requestId,sha256,directory,chunkSize,onProgress,signal}={}){
    await this.ready();need(['archive','client'].includes(kind),'MYSQL_PRODUCT_DOWNLOAD_KIND');
    const selected=await this.call(kind==='archive'?'merchant_mysql_product_archive_get':'merchant_mysql_product_client_info',
      kind==='archive'?{requestId}:{sha256});
    need(selected.state!=='RESTORED'&&typeof selected.filename==='string'&&SHA.test(selected.sha256)&&
      (sha256===undefined||sha256===selected.sha256),'MYSQL_PRODUCT_DOWNLOAD_SELECTION_CHANGED');
    need(selected.bytes<=MAXIMUM,'MYSQL_PRODUCT_DOWNLOAD_LIMIT','The original native MCP reader accepts one retained file up to 8 GiB.');
    const manifest={schema:DOWNLOAD_SCHEMA,exportId:selected.sha256,...this.#identity,kind,
      ...(kind==='archive'?{requestId}:{}),files:[{name:selected.filename,bytes:selected.bytes,sha256:selected.sha256}]};
    const raw=bytes(manifest),manifestSha256=digest(raw),manifestRead=randomUUID(),self=this;
    const virtual={endpoint:this.endpoint,async call(name,args,options){
      need(args.exportId===manifest.exportId,'MYSQL_PRODUCT_DOWNLOAD_SELECTION_CHANGED');
      if(name==='mysql_product_receive_manifest')return{state:'MANIFEST_RETAINED',exportId:manifest.exportId,
        manifestFile:{name:MANIFEST,bytes:raw.length,sha256:manifestSha256}};
      if(name==='mysql_product_receive_file_release'){
        if(args.readId!==manifestRead)return self.call('merchant_mysql_product_file_release',{readId:args.readId},options);
        return{released:true};
      }
      need(name==='mysql_product_receive_file'&&args.expectedManifestSha256===manifestSha256,
        'MYSQL_PRODUCT_DOWNLOAD_SELECTION_CHANGED');
      if(args.file===MANIFEST){
        need(args.expectedSha256===manifestSha256&&(!args.readId||args.readId===manifestRead),'MYSQL_PRODUCT_DOWNLOAD_SELECTION_CHANGED');
        const data=raw.subarray(args.offset,Math.min(raw.length,args.offset+args.limit));
        return{exportId:manifest.exportId,manifestSha256,readId:manifestRead,
          file:{name:MANIFEST,bytes:raw.length,sha256:manifestSha256},offset:args.offset,bytesRead:data.length,
          nextOffset:args.offset+data.length<raw.length?args.offset+data.length:null,encoding:'base64',data:data.toString('base64')};
      }
      need(args.file===selected.filename&&args.expectedSha256===selected.sha256,'MYSQL_PRODUCT_DOWNLOAD_SELECTION_CHANGED');
      const result=await self.call('merchant_mysql_product_file_read',{kind,...(kind==='archive'?{requestId}:{}),
        sha256:selected.sha256,offset:args.offset,limit:args.limit,...(args.readId?{readId:args.readId}:{})},options);
      return{...result,exportId:manifest.exportId,manifestSha256};
    }};
    const result=await downloader.download({client:virtual,exportId:manifest.exportId,directory,
      chunkSize,onProgress,signal:signal??this.#signal,expectedManifestSha256:manifestSha256});
    return{...result,archive:join(resolve(directory),selected.filename),sha256:selected.sha256,manifest};
  }
  async receiveHandover({requestId,sha256,directory,restoreDirectory,chunkSize,onProgress,signal}={}){
    const received=await this.receiveFiles({kind:'archive',requestId,sha256,directory,chunkSize,onProgress,signal});
    const inspected=await inspectMysqlArchive(received.archive);
    need(inspected.sha256===received.sha256&&inspected.manifest.productId===this.#identity.productId,
      'MYSQL_PRODUCT_RECEIVING_IDENTITY_CHANGED');
    const restored=restoreDirectory===undefined?null:await restoreMysqlArchive({archive:received.archive,directory:restoreDirectory,
      expectedSha256:inspected.sha256,expectedProductId:this.#identity.productId});
    return{...received,inspected,restored};
  }
}
