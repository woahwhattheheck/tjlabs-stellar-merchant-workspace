// MIT. Immutable complete responses and original streamed artifacts for WordPress merchants.
import {constants} from 'node:fs';
import {mkdir,open,link,unlink,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {privateSupportDirectory} from '../../../../../stellar-forge/mcp-merchant-operator/host-files.mjs';
import {readPrivate,hashPrivate,syncDirectory} from '../files.mjs';
import {EXPORT_SCHEMA,MANIFEST_NAME,MAX_JSON_BYTES,MAX_ARTIFACT_BYTES,ALIAS,SHA,need,checked,
  encode,decode,digest,manifestIdentity,parseWordPressExport,plain,jsonPointer} from './contracts.mjs';
export async function privateExportDirectory(path){
  await mkdir(path,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  await privateSupportDirectory(path);need(await realpath(path)===path,'WORDPRESS_MERCHANT_DIRECTORY_ALIAS');return path;
}
export async function writeImmutable(path,bytes){
  const pending=join(dirname(path),'.pending-'+randomUUID()),handle=await open(pending,'wx',0o600);
  try{await handle.writeFile(bytes);await handle.sync();}
  catch(error){await unlink(pending).catch(()=>{});throw error;}
  finally{await handle.close();}
  try{
    try{await link(pending,path);}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      const prior=await hashPrivate(path,bytes.length);
      need(prior.bytes===bytes.length&&prior.hash===digest(bytes),'WORDPRESS_MERCHANT_RETAINED_CHANGED','The original retained bytes differ.');
    }
  }finally{await unlink(pending);}
  await syncDirectory(dirname(path));
}
function preview(value){
  if(Buffer.byteLength(JSON.stringify(value))<=24000)return {value,completeValue:true};
  const selected=plain(value)?Object.fromEntries(Object.entries(value).slice(0,200).map(([key,item])=>[key,
    Array.isArray(item)?{kind:'array',items:item.length,pointer:'/'+key.replace(/~/g,'~0').replace(/\//g,'~1')}:
    typeof item==='string'?{kind:'string',characters:item.length}:
    plain(item)?{kind:'object',keys:Object.keys(item).slice(0,100)}:item])):
      {kind:Array.isArray(value)?'array':typeof value,...(Array.isArray(value)?{items:value.length}:{})};
  const result={preview:selected,completeValue:false};
  return Buffer.byteLength(JSON.stringify(result))<=32000?result:{completeValue:false,preview:{kind:typeof value}};
}
const safeName=value=>{
  let name=String(value??'original-file.bin').replace(/[^A-Za-z0-9._-]/g,'_').slice(0,230);
  if(!/^[A-Za-z0-9]/.test(name)||name===MANIFEST_NAME)name='original-'+name;
  return name;
};
export class WordPressExports{
  #base;#bindings;
  constructor(config){this.#base=config.exportsDirectory;this.#bindings=config.wordpressWorkspaces?.workspaces??{};}
  #binding(alias){
    checked(alias,ALIAS,'workspace alias');const binding=this.#bindings[alias];
    need(binding,'WORDPRESS_MERCHANT_NOT_CONFIGURED');return binding;
  }
  async root(alias){
    this.#binding(alias);
    return privateExportDirectory(join(await privateExportDirectory(join(this.#base,'wordpress')),alias));
  }
  async #finish(alias,file,original,source,kind){
    const binding=this.#binding(alias),manifest={schema:EXPORT_SCHEMA,workspace:alias,
      workspaceId:original.workspaceId,workspaceIdentity:original.workspaceIdentity,kind,
      source:{...source,hostSelectionSha256:binding.selectionSha256},files:[file]};
    manifest.exportId=manifestIdentity(manifest);
    const bytes=encode(manifest);parseWordPressExport(bytes,manifest.exportId);
    const root=await this.root(alias);await privateExportDirectory(join(root,'exports'));
    await writeImmutable(join(root,'exports',manifest.exportId+'.json'),bytes);
    return {schema:'stellar-forge.wordpress-merchant-result.v1',workspace:alias,workspaceId:manifest.workspaceId,
      workspaceIdentity:manifest.workspaceIdentity,exportId:manifest.exportId,kind,source:manifest.source,
      manifestSha256:digest(bytes),manifestFile:{name:MANIFEST_NAME,bytes:bytes.length,sha256:digest(bytes)},
      files:manifest.files,retention:{state:'COMPLETE'},...(original.value===undefined?{}:preview(original.value))};
  }
  async capture(alias,original,source,{kind='native-response',name='original-response.json'}={}){
    const bytes=original.bytes;
    need(Buffer.isBuffer(bytes)&&bytes.length<=MAX_JSON_BYTES,'WORDPRESS_MERCHANT_RESPONSE_BYTES');
    try{
      const root=await this.root(alias);await privateExportDirectory(join(root,'files'));
      const file={name:safeName(name),bytes:bytes.length,sha256:digest(bytes),contentType:original.contentType??'application/json'};
      await writeImmutable(join(root,'files',file.sha256),bytes);
      return await this.#finish(alias,file,original,source,kind);
    }catch(error){
      return {schema:'stellar-forge.wordpress-merchant-result.v1',workspace:alias,workspaceId:original.workspaceId,
        workspaceIdentity:original.workspaceIdentity,source,exportId:null,
        ...(original.value===undefined?{}:preview(original.value)),retention:{state:'FAILED',code:error.code??error.name,
          recovery:source.operationId?'Read the original operation UUID or repeat its exact input after restoring storage.':
            'Repeat the same original read after restoring storage.'}};
    }
  }
  async stream(alias,original,source,{kind='original-artifact',name}={}){
    const response=original.response;let pending=null,handle=null,closed=false;
    try{
      const length=response.headers.get('content-length'),promised=length===null?null:Number(length),
        expected=response.headers.get('x-content-sha256');
      need(promised===null||/^(0|[1-9][0-9]*)$/.test(length)&&Number.isSafeInteger(promised)&&promised<=MAX_ARTIFACT_BYTES,
        'WORDPRESS_MERCHANT_ARTIFACT_BYTES','Select the complete original artifact size.');
      if(expected!==null)checked(expected,SHA,'original artifact SHA-256');
      const root=await this.root(alias),files=await privateExportDirectory(join(root,'files'));
      pending=join(files,'.pending-'+randomUUID());handle=await open(pending,'wx',0o600);
      const hash=createHash('sha256');let bytes=0;
      for await(const chunk of response.body??[]){
        bytes+=chunk.length;need(bytes<=MAX_ARTIFACT_BYTES,'WORDPRESS_MERCHANT_ARTIFACT_BYTES');
        hash.update(chunk);await handle.writeFile(chunk);
      }
      const sha256=hash.digest('hex');
      need((promised===null||bytes===promised)&&(expected===null||sha256===expected),
        'WORDPRESS_MERCHANT_ARTIFACT_CHANGED','The complete original artifact differs from its server identity.');
      await handle.sync();await handle.close();closed=true;
      const destination=join(files,sha256);
      try{await link(pending,destination);}
      catch(error){
        if(error.code!=='EEXIST')throw error;
        const prior=await hashPrivate(destination,bytes);
        need(prior.bytes===bytes&&prior.hash===sha256,'WORDPRESS_MERCHANT_RETAINED_CHANGED');
      }
      await unlink(pending);pending=null;await syncDirectory(files);
      const disposition=response.headers.get('content-disposition')??'',
        originalName=/filename="([^"]+)"/.exec(disposition)?.[1]??'original-file.bin',
        contentType=response.headers.get('content-type')??'application/octet-stream';
      return await this.#finish(alias,{name:safeName(name??originalName),bytes,sha256,contentType},
        original,{...source,originalFilename:originalName},kind);
    }finally{
      try{
        if(handle&&!closed)await handle.close().catch(()=>{});
        if(pending)await unlink(pending).catch(error=>{if(error.code!=='ENOENT')throw error;});
      }finally{await original.dispose();}
    }
  }
  async manifest(alias,id,expected){
    const binding=this.#binding(alias);checked(id,SHA,'export ID');
    const root=await this.root(alias),bytes=await readPrivate(join(root,'exports',id+'.json'),65000),
      sha256=digest(bytes),manifest=parseWordPressExport(bytes,id);
    need(manifest.workspace===alias&&manifest.source.hostSelectionSha256===binding.selectionSha256&&
      (!binding.workspaceId||manifest.workspaceId===binding.workspaceId)&&
      (!binding.workspaceIdentity||manifest.workspaceIdentity===binding.workspaceIdentity)&&
      (expected===undefined||checked(expected,SHA,'manifest SHA-256')===sha256),
      'WORDPRESS_MERCHANT_EXPORT_CHANGED','Select the original workspace, host configuration and export identity.');
    return {root,bytes,sha256,manifest};
  }
  async selected(saved,name,{memory=false}={}){
    let item,bytes,path;
    if(name===MANIFEST_NAME){
      bytes=saved.bytes;item={name,bytes:bytes.length,sha256:saved.sha256,contentType:'application/json'};
      return {item,bytes,path:null};
    }
    item=saved.manifest.files.find(file=>file.name===name);
    need(item,'WORDPRESS_MERCHANT_FILE_NOT_FOUND','Choose the exact filename in the original manifest.');
    path=join(saved.root,'files',item.sha256);
    if(memory){
      need(item.bytes<=MAX_JSON_BYTES,'WORDPRESS_MERCHANT_JSON_BYTES','Download this complete artifact through the retained-file protocol.');
      bytes=await readPrivate(path,item.bytes);
      need(bytes.length===item.bytes&&digest(bytes)===item.sha256,'WORDPRESS_MERCHANT_RETAINED_CHANGED');
    }
    return {item,path,bytes};
  }
  async nativeHandle(saved,name){
    const selected=await this.selected(saved,name);
    if(selected.bytes)return {name:selected.item.name,type:selected.item.contentType,bytes:selected.bytes};
    const handle=await open(selected.path,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{
      const info=await handle.stat();
      need(info.isFile()&&info.size===selected.item.bytes&&!(info.mode&0o077)&&info.nlink===1,
        'WORDPRESS_MERCHANT_RETAINED_CHANGED','Use the exact retained private file.');
      return {readonlyFileHandle:handle,bytes:selected.item.bytes,sha256:selected.item.sha256,
        name:selected.item.name,type:selected.item.contentType};
    }catch(error){await handle.close();throw error;}
  }
  async json(alias,args){
    const saved=await this.manifest(alias,args.exportId,args.expectedManifestSha256),
      {bytes}=await this.selected(saved,args.file,{memory:true}),
      original=jsonPointer(decode(bytes),args.pointer??''),offset=args.offset??0,limit=args.limit??50;
    let value,total,type,count;
    if(Array.isArray(original)){total=original.length;value=original.slice(offset,offset+limit);type='array';count=value.length;}
    else if(plain(original)){const entries=Object.entries(original);total=entries.length;value=entries.slice(offset,offset+limit);type='object-entries';count=value.length;}
    else if(typeof original==='string'){total=original.length;value=original.slice(offset,offset+limit);type='string';count=value.length;}
    else {need(offset===0,'WORDPRESS_MERCHANT_POINTER_RANGE');total=1;value=original;type=typeof original;count=1;}
    need(offset<=total,'WORDPRESS_MERCHANT_POINTER_RANGE');
    const response={workspace:alias,workspaceId:saved.manifest.workspaceId,workspaceIdentity:saved.manifest.workspaceIdentity,
      exportId:args.exportId,manifestSha256:saved.sha256,file:args.file,
      pointer:args.pointer??'',type,offset,total,value,nextOffset:offset+count<total?offset+count:null};
    return Buffer.byteLength(JSON.stringify(response))<=65536?response:{...response,value:undefined,
      valueAvailableInOriginalFile:true,message:'Download the complete original file for this large selected value.'};
  }
}
