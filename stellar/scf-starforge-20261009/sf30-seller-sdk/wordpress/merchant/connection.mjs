// MIT. Borrow the original WordPress controller or own its existing server lifecycle.
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpath,lstat} from 'node:fs/promises';
import {readPrivate,privateDirectory} from '../files.mjs';
import {inspectWordPressWorkspaceBinding,inspectWordPressLaunchSource,WORDPRESS_STARTUP_SCHEMA} from '../managed.mjs';
import {CONNECTION_SCHEMA,MAX_JSON_BYTES,MAX_REQUEST_BYTES,UUID,SHA,ALIAS,
  plain,need,checked,text,exact,decode,identity,failure} from './contracts.mjs';
const nativeSource=resolve(fileURLToPath(new URL('../',import.meta.url)));
const absolute=(value,base)=>{
  text(value,'Original host path',4096);
  return isAbsolute(value)?resolve(value):resolve(base,value);
};
async function canonicalDirectory(path,{missing=false}={}){
  try{await privateDirectory(path);need(await realpath(path)===path,'WORDPRESS_MERCHANT_DIRECTORY_ALIAS');}
  catch(error){
    if(error.code!=='ENOENT'||!missing)throw error;
    await privateDirectory(dirname(path));need(await realpath(dirname(path))===dirname(path),'WORDPRESS_MERCHANT_DIRECTORY_ALIAS');
  }
  return path;
}
function loopback(value){
  const url=new URL(value);
  need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&url.pathname==='/'&&
    !url.username&&!url.password&&!url.search&&!url.hash,'WORDPRESS_MERCHANT_LOOPBACK',
    'Select the original private WordPress listener on 127.0.0.1.');
  return url.origin;
}
async function optionalBinding(directory,expected){
  try{return await inspectWordPressWorkspaceBinding(directory,expected);}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function aliasDirectories(values,base,label,missing){
  need(plain(values)&&Object.keys(values).length<=64,'WORDPRESS_MERCHANT_CONFIGURATION','Declare up to 64 '+label+' aliases.');
  const result=Object.create(null),seen=new Set();
  for(const [alias,value] of Object.entries(values)){
    checked(alias,ALIAS,label+' alias');exact(value,['directory','label'],['directory']);
    const directory=absolute(value.directory,base);
    need(!seen.has(directory),'WORDPRESS_MERCHANT_CONFIGURATION','Give each '+label+' directory one alias.');
    seen.add(directory);await canonicalDirectory(directory,{missing});
    result[alias]={directory,label:text(value.label??alias,label+' label')};
  }
  return result;
}
/** Source credentials stay in the original source environment, referenced by name. */
export async function readWordPressConfiguration(filename){
  filename=resolve(filename);const raw=decode(await readPrivate(filename,MAX_REQUEST_BYTES)),base=dirname(filename);
  exact(raw,['schema','workspaces','buyerWorkspaces','receivers'],['schema','workspaces']);
  need(raw.schema===CONNECTION_SCHEMA&&plain(raw.workspaces)&&Object.keys(raw.workspaces).length>=1&&
    Object.keys(raw.workspaces).length<=32,'WORDPRESS_MERCHANT_CONFIGURATION','Declare one through 32 original WordPress workspaces.');
  const workspaces=Object.create(null),seen=new Set();
  for(const [alias,item] of Object.entries(raw.workspaces)){
    checked(alias,ALIAS,'workspace alias');
    exact(item,['directory','label','allowStart','workspaceId','workspaceIdentity','sourceDirectory','sourceSha256','python','url','applications'],['directory']);
    const directory=absolute(item.directory,base),allowStart=item.allowStart??false;
    need(typeof allowStart==='boolean'&&!seen.has(directory),'WORDPRESS_MERCHANT_CONFIGURATION','Use one alias per original directory.');
    seen.add(directory);await canonicalDirectory(directory,{missing:allowStart});
    const expected={...(item.workspaceId===undefined?{}:{expectedWorkspaceId:checked(item.workspaceId,UUID,'workspace UUID')}),
      ...(item.workspaceIdentity===undefined?{}:{expectedWorkspaceIdentity:checked(item.workspaceIdentity,SHA,'workspace identity')})};
    const original=await optionalBinding(directory,expected);
    need(original||allowStart,'WORDPRESS_MERCHANT_WORKSPACE_MISSING','Initialize the original WordPress workspace or enable its host-owned first start.');
    const sourceDirectory=absolute(item.sourceDirectory??nativeSource,base),
      selectedSource=await inspectWordPressLaunchSource(sourceDirectory,{...(item.sourceSha256===undefined?{}:{expectedSha256:checked(item.sourceSha256,SHA,'source SHA-256')})});
    let applications=null,url=null;
    if(item.applications!==undefined){
      exact(item.applications,['directory','applicationId'],['directory','applicationId']);
      checked(item.applications.applicationId,'^[a-f0-9]{24}$','original Applications ID');
      applications={directory:await canonicalDirectory(absolute(item.applications.directory,base)),applicationId:item.applications.applicationId};
      need(!allowStart&&item.url===undefined,'WORDPRESS_MERCHANT_CONFIGURATION','The original Applications operation owns the configured controller.');
    }else if(item.url!==undefined)url=loopback(item.url);
    const declared={directory,label:text(item.label??alias,'Workspace label'),allowStart,applications,url,
      sourceDirectory,sourceSha256:selectedSource.sha256,python:text(item.python??'python3','Original Python command',4096),
      expectedWorkspaceId:item.workspaceId??null,expectedWorkspaceIdentity:item.workspaceIdentity??null};
    workspaces[alias]={...declared,workspaceId:original?.workspaceId??item.workspaceId??null,
      workspaceIdentity:original?.sha256??item.workspaceIdentity??null,selectionSha256:identity(declared)};
  }
  return {schema:CONNECTION_SCHEMA,workspaces,
    buyerWorkspaces:await aliasDirectories(raw.buyerWorkspaces??{},base,'Buyer',false),
    receivers:await aliasDirectories(raw.receivers??{},base,'receiving',true)};
}
export async function responseBytes(response,maximum=MAX_JSON_BYTES){
  const chunks=[];let bytes=0;
  try{
    for await(const chunk of response.body??[]){
      bytes+=chunk.length;need(bytes<=maximum,'WORDPRESS_MERCHANT_RESPONSE_BYTES','The complete original response exceeds its declared JSON limit.');
      chunks.push(chunk);
    }
  }catch(error){await response.body?.cancel().catch(()=>{});throw error;}
  return Buffer.concat(chunks,bytes);
}
export class WordPressConnection{
  #binding;#owned=null;#opening=null;#closed=false;#draining=false;#leases=new Set();#known;#token=null;
  constructor(binding){this.#binding=binding;this.#known={workspaceId:binding.workspaceId,workspaceIdentity:binding.workspaceIdentity};}
  get summary(){return {workspaceId:this.#known.workspaceId,workspaceIdentity:this.#known.workspaceIdentity,
    allowStart:this.#binding.allowStart,owned:Boolean(this.#owned),closed:this.#closed,
    selectionSha256:this.#binding.selectionSha256,applicationId:this.#binding.applications?.applicationId??null};}
  async #address(){
    if(this.#owned)return {url:this.#owned.url,instanceId:this.#owned.instanceId,pid:this.#owned.pid};
    if(this.#binding.applications){
      const selected=this.#binding.applications,{applicationsHistory}=await import('../../../distribution/runtime-workspace/applications.mjs');
      let cursor;
      for(;;){
        const page=await applicationsHistory(selected.directory,{applicationId:selected.applicationId,limit:30,...(cursor?{cursor}:{})});
        for(const run of page.runs){
          if(!run.active||run.stop)continue;
          const original=run.url?.original;
          need(run.command==='wordpress'&&run.privateUrl&&original?.schema===WORDPRESS_STARTUP_SCHEMA&&
            original.directory===this.#binding.directory&&original.sourceSha256===this.#binding.sourceSha256&&
            (original.sourceDirectory===this.#binding.sourceDirectory||original.launchSourceDirectory===this.#binding.sourceDirectory),
            'WORDPRESS_MERCHANT_APPLICATION_CHANGED','The current original Applications operation does not match this reviewed WordPress source.');
          return {url:loopback(run.privateUrl),...original,applicationId:selected.applicationId,applicationOperationId:run.id};
        }
        if(!page.nextCursor)return null;cursor=page.nextCursor;
      }
    }
    return this.#binding.url?{url:this.#binding.url}:null;
  }
  async #live(){
    const selected=await this.#address();if(!selected)return null;
    const url=loopback(selected.url);
    let response;
    try{response=await fetch(new URL('/api/health',url),{redirect:'error',signal:AbortSignal.timeout(5000)});}
    catch{return null;}
    const health=decode(await responseBytes(response,65536));
    const original=await inspectWordPressWorkspaceBinding(this.#binding.directory,{
      ...(this.#known.workspaceId?{expectedWorkspaceId:this.#known.workspaceId}:{}),
      ...(this.#known.workspaceIdentity?{expectedWorkspaceIdentity:this.#known.workspaceIdentity}:{})});
    need(response.ok&&health.status==='ok'&&health.workspaceId===original.workspaceId&&
      health.workspaceIdentity===original.sha256&&health.createdAt===original.createdAt&&
      new RegExp(UUID).test(health.instanceId??'')&&Number.isSafeInteger(health.pid)&&health.pid>0&&
      (selected.instanceId===undefined||selected.instanceId===health.instanceId)&&
      (selected.pid===undefined||selected.pid===health.pid)&&
      (selected.workspaceId===undefined||selected.workspaceId===health.workspaceId)&&
      (selected.workspaceIdentity===undefined||selected.workspaceIdentity===health.workspaceIdentity),
      'WORDPRESS_MERCHANT_CONTROLLER_CHANGED','The live original listener differs from its retained workspace or Applications operation.');
    this.#known={workspaceId:original.workspaceId,workspaceIdentity:original.sha256};
    if(!this.#token||this.#token.instanceId!==health.instanceId||this.#token.url!==url){
      const page=await fetch(new URL('/',url),{redirect:'error',signal:AbortSignal.timeout(5000)}),
        html=(await responseBytes(page,1024*1024)).toString('utf8'),
        match=/<meta name="workspace-token" content="([a-f0-9]{64})">/.exec(html);
      need(page.ok&&match,'WORDPRESS_MERCHANT_PRIVATE_CODE','Read the original operator page from the selected listener.');
      this.#token={url,instanceId:health.instanceId,value:match[1]};
    }
    return {...health,url,token:this.#token.value,...(selected.applicationId?{
      applicationId:selected.applicationId,applicationOperationId:selected.applicationOperationId}:{})};
  }
  async #ensure(start=false){
    need(!this.#closed&&!this.#draining,'WORDPRESS_MERCHANT_CLOSING','The original merchant connection is draining.');
    if(this.#opening)return this.#opening;
    this.#opening=(async()=>{
      const current=await this.#live();if(current)return current;
      need(start&&this.#binding.allowStart&&!this.#binding.applications,'WORDPRESS_MERCHANT_NOT_RUNNING',
        'Start the selected original application, or explicitly open this host-authorized standalone workspace.');
      // Only the original kernel lease admits a new server; a missing health
      // response never removes or replaces another owner's workspace lease.
      if(this.#owned){await this.#owned.close();this.#owned=null;this.#token=null;}
      await inspectWordPressLaunchSource(nativeSource,{expectedSha256:this.#binding.sourceSha256});
      const {start:originalStart}=await import('../server.mjs');
      const original=await originalStart({directory:this.#binding.directory,python:this.#binding.python,
        ...(this.#known.workspaceId?{expectedWorkspaceId:this.#known.workspaceId}:{}),
        ...(this.#known.workspaceIdentity?{expectedWorkspaceIdentity:this.#known.workspaceIdentity}:{})});
      this.#owned=original;
      try{const connected=await this.#live();need(connected,'WORDPRESS_MERCHANT_CONNECTION_UNAVAILABLE');return connected;}
      catch(error){await original.close();this.#owned=null;throw error;}
    })();
    try{return await this.#opening;}finally{this.#opening=null;}
  }
  async open(){
    const original=await this.#ensure(true);
    return {state:'OPEN',ownership:this.#owned?'OWNED':'BORROWED',url:original.url,
      workspaceId:original.workspaceId,workspaceIdentity:original.workspaceIdentity,
      instanceId:original.instanceId,revision:original.revision,selectionSha256:this.#binding.selectionSha256,
      ...(original.applicationId?{applicationId:original.applicationId,applicationOperationId:original.applicationOperationId}:{})};
  }
  async request(method,path,input){
    need(!this.#closed&&!this.#draining,'WORDPRESS_MERCHANT_CLOSING');
    let finish;const lease=new Promise(resolve=>{finish=resolve;});this.#leases.add(lease);
    let ended=false;const done=()=>{if(!ended){ended=true;finish();this.#leases.delete(lease);}};
    let original;
    try{
      original=await this.#ensure();
      const body=input===undefined?undefined:JSON.stringify(input);
      need(body===undefined||Buffer.byteLength(body)<=MAX_REQUEST_BYTES,'WORDPRESS_MERCHANT_REQUEST_BYTES',
        'The original WordPress command accepts at most one MiB.');
      const response=await fetch(new URL(path,original.url),{method,redirect:'error',signal:AbortSignal.timeout(120000),
        headers:{'x-workspace-token':original.token,accept:'application/json',
          ...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body})});
      if(!response.ok){
        const bytes=await responseBytes(response,MAX_JSON_BYTES);
        let error;try{error=decode(bytes).error;}catch{}
        throw failure(typeof error?.code==='string'?error.code:'WORDPRESS_MERCHANT_HTTP_'+response.status,
          typeof error?.message==='string'?error.message:'The original WordPress operation rejected this request.',
          {status:response.status,...(input?.operationId?{operationId:input.operationId}:{})});
      }
      return {response,workspaceId:original.workspaceId,workspaceIdentity:original.workspaceIdentity,
        instanceId:original.instanceId,dispose:async()=>{await response.body?.cancel().catch(()=>{});done();},done};
    }catch(error){
      done();
      if(error.code)throw error;
      throw failure(input?'WORDPRESS_MERCHANT_REQUEST_UNCERTAIN':'WORDPRESS_MERCHANT_CONNECTION_UNAVAILABLE',
        input?'The original request may have completed. Read its original operation UUID or repeat that exact UUID and input.':
          'Read the current original Applications listener or explicitly reopen the configured controller.',
        {workspaceId:original?.workspaceId??this.#known.workspaceId,
          ...(input?.operationId?{operationId:input.operationId}:{}),cause:error.name});
    }
  }
  async json(method,path,input){
    const original=await this.request(method,path,input);
    try{
      const bytes=await responseBytes(original.response,MAX_JSON_BYTES);
      return {bytes,value:decode(bytes),contentType:original.response.headers.get('content-type')??'application/json',
        workspaceId:original.workspaceId,workspaceIdentity:original.workspaceIdentity,instanceId:original.instanceId};
    }catch(error){
      if(input)throw failure('WORDPRESS_MERCHANT_REQUEST_UNCERTAIN',
        'The original response ended after dispatch. Read its saved operation UUID before any different action.',
        {operationId:input.operationId,workspaceId:original.workspaceId,cause:error.code??error.name});
      throw error;
    }finally{await original.dispose();}
  }
  async release(){
    this.#draining=true;
    try{
      if(this.#opening)await this.#opening;
      await Promise.allSettled([...this.#leases]);
      const original=this.#owned;
      if(original){await original.close();if(this.#owned===original)this.#owned=null;}
      this.#token=null;
      return {state:'RELEASED',ownership:original?'OWNED':'BORROWED',originalWorkspaceClosed:Boolean(original),...this.#known};
    }finally{this.#draining=false;}
  }
  async close(){if(this.#closed)return;await this.release();this.#closed=true;}
}
