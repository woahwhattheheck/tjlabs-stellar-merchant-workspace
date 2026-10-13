// MIT. Authenticated typed client of the original municipal workspace HTTP boundary.
import { basename, dirname, resolve, join } from 'node:path';
import { realpath } from 'node:fs/promises';
import { readConnection, regular } from './managed.mjs';
import { readPrivateJson, privateDirectory, atomicJson, withPrivateLock } from '../routescan/quota.mjs';
import { HOST_SCHEMA,JOURNAL_SCHEMA,HASH,MAX_FILE,KINDS,INPUT_KINDS,FORMATS,need,exact,plain,clone,canonical,digest,identifier,text,operation,revision,fail } from './agent-contracts.mjs';
import { actionSchemas } from './mcp-tools.mjs';
import { validate } from './agent-contracts.mjs';

const utf8 = bytes => new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const safePath = (value,base,label) => {
  text(value,label,8192);need(!/[\x00-\x1f\x7f]/.test(value),'Select an ordinary host '+label+'.');
  return resolve(base,value);
};
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export async function readMunicipalAssetConfiguration(path) {
  path=resolve(text(path,'private connection file',8192));
  const raw=await readPrivateJson(path,4*1024*1024);exact(raw,['schema','workspaces'],['schema','workspaces']);
  need(raw.schema===HOST_SCHEMA&&plain(raw.workspaces)&&Object.keys(raw.workspaces).length>=1&&Object.keys(raw.workspaces).length<=128,
    'Configure one to 128 original managed municipal workspaces.','CONFIGURATION_ERROR');
  const workspaces=Object.create(null),base=dirname(path),journals=new Set(),instances=new Set();
  for(const [alias,value]of Object.entries(raw.workspaces)){
    identifier(alias);exact(value,['label','actor','request','startup','operationDirectory','inputs'],['actor','request','startup','operationDirectory']);
    text(value.actor,'original actor name',150);need(value.actor.trim()===value.actor,'Keep the exact original actor name.');
    need(plain(value.request)&&plain(value.startup),'Retain the original Applications request and complete observed startup.');
    const directory=safePath(value.operationDirectory,base,'operation directory');
    await privateDirectory(directory);
    need(await realpath(directory)===directory&&!journals.has(directory),'Select a distinct private operation directory per original workspace.');
    journals.add(directory);
    need(typeof value.startup.instanceId==='string'&&!instances.has(value.startup.instanceId),'Keep one configured alias per original native instance.');
    instances.add(value.startup.instanceId);
    const entry={label:text(value.label??alias,'workspace label',150),actor:value.actor,request:clone(value.request),
      startup:clone(value.startup),operationDirectory:directory,inputs:Object.create(null)};
    need(plain(value.inputs??{})&&Object.keys(value.inputs??{}).length<=128,'Configure at most 128 original input files.');
    for(const [inputAlias,input]of Object.entries(value.inputs??{})){
      identifier(inputAlias);exact(input,['label','path','sha256','kind','format'],['path','sha256','kind','format']);
      need(HASH.test(input.sha256??''),'Pin the complete original file SHA-256.');
      need(INPUT_KINDS.includes(input.kind)||input.kind==='maximo-result','Choose an original dataset kind or maximo-result.');
      need(FORMATS.includes(input.format)&& (input.kind!=='maximo-result'||input.format==='json'),'Select the actual original file format.');
      need(input.kind!=='roundtrips'||input.format==='jsonl','Original round-trip evidence uses JSONL.');
      entry.inputs[inputAlias]={label:text(input.label??inputAlias,'input label',150),path:safePath(input.path,base,'input file'),
        sha256:input.sha256,kind:input.kind,format:input.format};
    }
    workspaces[alias]=entry;
  }
  return freeze({schema:HOST_SCHEMA,path,workspaces});
}
export async function readMunicipalAssetInput(entry,alias,expectedSha256) {
  identifier(alias);const input=entry.inputs[alias];need(input,'Select a configured original input.','MUNICIPAL_ASSET_INPUT_UNKNOWN');
  if(expectedSha256!==undefined)need(expectedSha256===input.sha256,'The input selection differs from its original hash.','MUNICIPAL_ASSET_INPUT_CHANGED');
  const bytes=await regular(input.path,{maximum:32*1024*1024});
  need(bytes.length>0&&digest(bytes)===input.sha256,'The complete original input file changed.','MUNICIPAL_ASSET_INPUT_CHANGED');
  return {input,bytes,name:basename(input.path),sha256:input.sha256};
}
function responseValue(response) {
  let value;
  try{value=JSON.parse(utf8(response.bytes));}
  catch{throw fail('MUNICIPAL_ASSET_RESPONSE_INVALID','The original application returned an unreadable JSON response.');}
  if(response.status<200||response.status>=300){
    const error=fail(response.status===409?'MUNICIPAL_ASSET_REVISION_CONFLICT':'MUNICIPAL_ASSET_HTTP_'+response.status,
      typeof value.error==='string'?value.error:'The original application did not accept this operation.');
    error.status=response.status;error.original=value;throw error;
  }
  return value;
}
export class MunicipalAssetClient {
  #entry;#connection;#cookie=null;#csrf=null;#closing=false;#tail=Promise.resolve();#startup;
  constructor(entry,connection) { this.#entry=entry;this.#connection=connection;this.#startup=clone(entry.startup); }
  static async open(entry) {
    need(plain(entry),'Select an original managed workspace configuration.');
    const frozen=freeze(clone(entry));text(frozen.actor,'original actor',150);
    await privateDirectory(frozen.operationDirectory);
    const connection=await readConnection(frozen.request,frozen.startup);
    const client=new MunicipalAssetClient(frozen,connection);
    await client.#signIn();await client.#assertInstance();return client;
  }
  get identity() {
    const c=this.#connection;return clone({url:c.url,binding:c.binding,bindingSha256:c.bindingSha256,
      sourceSha256:c.sourceSha256,instanceId:c.instanceId,pid:c.pid,actor:this.#entry.actor});
  }
  async #http(path,{method='GET',body,headers={},maximum=MAX_FILE,auth=true,timeout=60000}={}) {
    need(!this.#closing,'This municipal client is closing.','MUNICIPAL_ASSET_CLOSING');
    need(typeof path==='string'&&path.startsWith('/api/')&&!/[\x00-\x20\\]/.test(path),'Use the original local API path.');
    const url=new URL(path,this.#connection.url);
    need(url.origin===new URL(this.#connection.url).origin,'Keep the selected original local listener.');
    const response=await fetch(url,{method,headers:{Origin:url.origin,...(auth&&this.#cookie?{Cookie:this.#cookie}:{}),
      ...(auth&&method==='POST'?{'X-Workspace-CSRF':this.#csrf}:{}),...headers},
      ...(body!==undefined?{body}:{}),redirect:'error',signal:AbortSignal.timeout(timeout)});
    const chunks=[];let count=0;
    const declared=response.headers.get('content-length');
    if(declared&&/^\d+$/.test(declared)&&Number(declared)>maximum){await response.body?.cancel();throw fail('MUNICIPAL_ASSET_RESPONSE_TOO_LARGE','The original response exceeds this selected transfer limit.');}
    for await(const part of response.body??[]){
      count+=part.length;
      if(count>maximum){throw fail('MUNICIPAL_ASSET_RESPONSE_TOO_LARGE','The original response exceeds this selected transfer limit.');}
      chunks.push(part);
    }
    return {status:response.status,type:response.headers.get('content-type')??'application/octet-stream',
      cookie:response.headers.get('set-cookie'),bytes:Buffer.concat(chunks,count)};
  }
  async #signIn() {
    const password=utf8(await regular(this.#connection.passwordFile,{maximum:4096,privateOnly:true})).trim();
    const response=await this.#http('/api/login',{method:'POST',auth:false,body:JSON.stringify({actor:this.#entry.actor,password}),
      headers:{'Content-Type':'application/json'},maximum:65536,timeout:5000});
    const value=responseValue(response),cookie=response.cookie?.split(';',1)[0];
    need(value.actor===this.#entry.actor&&typeof value.csrf==='string'&&value.csrf.length>=16&&
      /^mcpherson_workspace=[A-Za-z0-9_-]+$/.test(cookie??''),'The original application session differs.','MUNICIPAL_ASSET_SESSION_CHANGED');
    this.#cookie=cookie;this.#csrf=value.csrf;
  }
  async #assertInstance() {
    let response=await this.#http('/api/managed-instance',{maximum:65536,timeout:5000});
    if(response.status===401){await this.#signIn();response=await this.#http('/api/managed-instance',{maximum:65536,timeout:5000});}
    const live=responseValue(response);
    need(canonical(live)===canonical(this.#startup),'The original managed process, source or workspace identity changed. Reconnect using its actual current Applications startup.','MUNICIPAL_ASSET_INSTANCE_CHANGED');
    return this.identity;
  }
  async #get(path,maximum=MAX_FILE) { await this.#assertInstance();return responseValue(await this.#http(path,{maximum})); }
  #project(id){return '/api/projects/'+encodeURIComponent(text(id,'project ID',100));}
  #journalName(id){return 'operation-'+digest(operation(id))+'.json';}
  async #journal(id) {
    const value=await readPrivateJson(join(this.#entry.operationDirectory,this.#journalName(id)),MAX_FILE);
    need(value.schema===JOURNAL_SCHEMA&&value.requestId===id&&plain(value.binding)&&plain(value.request)&&Array.isArray(value.attempts),
      'The original operation journal is invalid.','MUNICIPAL_ASSET_OPERATION_CHANGED');
    need(value.binding.bindingSha256===this.#connection.bindingSha256&&value.binding.actor===this.#entry.actor,
      'This retained request belongs to another physical workspace or original actor.','MUNICIPAL_ASSET_OPERATION_CHANGED');
    const bytes=Buffer.from(value.request.body,'base64');
    need(bytes.toString('base64')===value.request.body&&digest(bytes)===value.request.sha256&&bytes.length===value.request.bytes,
      'The original request bytes changed.','MUNICIPAL_ASSET_OPERATION_CHANGED');
    exact(value.request.headers,['Content-Type','X-Revision','X-Operation-Id'],['Content-Type']);
    need(value.request.method==='POST'&&typeof value.request.path==='string','Keep the original POST request.');
    if(value.response){
      const response=Buffer.from(value.response.body,'base64');
      need(response.toString('base64')===value.response.body&&response.length===value.response.bytes&&digest(response)===value.response.sha256,
        'The original response bytes changed.','MUNICIPAL_ASSET_OPERATION_CHANGED');
    }
    return value;
  }
  async #dispatch(record) {
    await this.#assertInstance();
    record.attempts.push({at:new Date().toISOString(),instanceId:this.#connection.instanceId,sourceSha256:this.#connection.sourceSha256,state:'INVOKING'});
    record.state='INVOKING';
    await atomicJson(this.#entry.operationDirectory,this.#journalName(record.requestId),record);
    let response;
    try {
      response=await this.#http(record.request.path,{method:'POST',body:Buffer.from(record.request.body,'base64'),
        headers:record.request.headers,maximum:64*1024*1024});
    } catch(error) {
      record.state='CONTINUE_ORIGINAL_REQUEST';record.attempts.at(-1).state=record.state;
      record.attempts.at(-1).error={code:String(error.code??'TRANSPORT_INTERRUPTED'),message:String(error.message??'The original response was interrupted.')};
      await atomicJson(this.#entry.operationDirectory,this.#journalName(record.requestId),record);
      error.requestId=record.requestId;throw error;
    }
    record.response={status:response.status,contentType:response.type,bytes:response.bytes.length,sha256:digest(response.bytes),
      body:response.bytes.toString('base64'),receivedAt:new Date().toISOString()};
    const responseFile='response-'+digest(record.requestId)+'-'+record.attempts.length+'.json';
    await atomicJson(this.#entry.operationDirectory,responseFile,record.response,{exclusive:true});
    record.attempts.at(-1).responseFile=responseFile;
    record.attempts.at(-1).responseSha256=digest(Buffer.from(canonical(record.response)));
    record.state=response.status>=200&&response.status<300?'COMPLETED':'RETURNED';
    record.attempts.at(-1).state=record.state;record.attempts.at(-1).status=response.status;
    await atomicJson(this.#entry.operationDirectory,this.#journalName(record.requestId),record);
    return responseValue(response);
  }
  #serial(work) {
    const pending=this.#tail.then(()=>{need(!this.#closing,'This municipal client is closing.');return work();});
    this.#tail=pending.catch(()=>{});return pending;
  }
  #mutate(requestId,path,body,headers={'Content-Type':'application/json'}) {
    operation(requestId);body=Buffer.isBuffer(body)?Buffer.from(body):Buffer.from(canonical(body));
    const maximum=path.includes('/inputs?')?32*1024*1024:path.endsWith('/maximo')?16*1024*1024:1024*1024;
    need(body.length>0&&body.length<=maximum,'Keep the complete original request within its native transfer limit.');
    const request={method:'POST',path,headers:clone(headers),bytes:body.length,sha256:digest(body),body:body.toString('base64')};
    return this.#serial(()=>withPrivateLock(this.#entry.operationDirectory,'municipal-asset-agent.lock',async()=>{
      let record;
      try{record=await this.#journal(requestId);}catch(error){if(error.code!=='ENOENT')throw error;}
      if(record){
        need(canonical(record.request)===canonical(request),'This request ID already belongs to different original input, revision or action.','MUNICIPAL_ASSET_OPERATION_CONFLICT');
        if(record.state==='COMPLETED')return responseValue({status:record.response.status,bytes:Buffer.from(record.response.body,'base64')});
      }else{
        record={schema:JOURNAL_SCHEMA,requestId,binding:{bindingSha256:this.#connection.bindingSha256,actor:this.#entry.actor,
          workspaceId:this.#connection.binding.workspace.id},request,createdAt:new Date().toISOString(),state:'PREPARED',attempts:[]};
        await atomicJson(this.#entry.operationDirectory,this.#journalName(requestId),record,{exclusive:true});
      }
      return this.#dispatch(record);
    }));
  }
  async status() { const identity=await this.#assertInstance();return {...identity,...await this.#get('/api/projects',16*1024*1024)}; }
  async project(projectId,expectedRevision) {
    revision(expectedRevision);const value=await this.#get(this.#project(projectId));
    need(value.project?.revision===expectedRevision,'The original project revision changed. Refresh its current status.','MUNICIPAL_ASSET_REVISION_CONFLICT');return value;
  }
  async records({projectId,expectedRevision,kind,query='',page=0,pageSize=50,recordId}) {
    revision(expectedRevision);need(KINDS.includes(kind),'Choose an original dataset.');revision(page);
    need(Number.isSafeInteger(pageSize)&&pageSize>=1&&pageSize<=200,'Use a page size from 1 to 200.');
    const params=new URLSearchParams({kind,query:text(query,'search query',2000,0),page:String(page),page_size:String(pageSize)});
    if(recordId!==undefined)params.set('record_id',text(recordId,'record identifier',10000));
    const value=await this.#get(this.#project(projectId)+'/records?'+params,16*1024*1024);
    need(value.revision===expectedRevision,'The original record page belongs to a different revision.','MUNICIPAL_ASSET_REVISION_CONFLICT');return value;
  }
  createProject({requestId,title,mode}) {
    text(title,'project title',150);need(['development','vendor-authorized','public-reference'].includes(mode),'Choose the original project mode.');
    return this.#mutate(requestId,'/api/projects',{operation:requestId,title,mode});
  }
  importInput({requestId,projectId,expectedRevision,kind,format,name,bytes}) {
    revision(expectedRevision);need(INPUT_KINDS.includes(kind)&&FORMATS.includes(format),'Select the original dataset and format.');
    need(kind!=='roundtrips'||format==='jsonl','Original round-trip evidence uses JSONL.');
    need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=32*1024*1024,'Supply the complete original input bytes.');
    const params=new URLSearchParams({kind,format,filename:text(name,'original filename',180)});
    return this.#mutate(requestId,this.#project(projectId)+'/inputs?'+params,bytes,
      {'Content-Type':'application/octet-stream','X-Revision':String(expectedRevision),'X-Operation-Id':operation(requestId)});
  }
  action(name,{requestId,projectId,expectedRevision,...payload}) {
    revision(expectedRevision);need(Object.hasOwn(actionSchemas,name),'Choose an original municipal action.');validate(payload,actionSchemas[name]);
    return this.#mutate(requestId,this.#project(projectId)+'/action',{operation:requestId,revision:expectedRevision,action:name,payload});
  }
  saveMapping(input){return this.action('mapping',input);}
  selectInput(input){return this.action('select_input',input);}
  saveSettings(input){return this.action('settings',input);}
  review(input){return this.action('review',input);}
  exclude(input){return this.action('exclude',input);}
  proposeRepair(input){return this.action('repair',input);}
  requestStatus(input){return this.action('request_status',input);}
  applyReturns(input){return this.action('apply_returns',input);}
  withdrawChange(input){return this.action('withdraw_change',input);}
  nativeCheck(input){return this.action('native_check',input);}
  release(input){return this.action('release',input);}
  restoreRevision(input){return this.action('restore_revision',input);}
  refreshStatus(projectId){return this.#get(this.#project(projectId)+'/refresh',16*1024*1024);}
  refreshStart({requestId,projectId,expectedRevision,pageWidth=500,geometryWidth=100,sourceOperation}) {
    revision(expectedRevision);text(requestId,'original refresh operation',64);if(sourceOperation!==undefined)text(sourceOperation,'original source operation',64);
    need(Number.isSafeInteger(pageWidth)&&pageWidth>=1&&pageWidth<=2000&&
      Number.isSafeInteger(geometryWidth)&&geometryWidth>=1&&geometryWidth<=2000,'Select supported original refresh widths.');
    return this.#mutate(requestId,this.#project(projectId)+'/refresh',{action:'start',operation:requestId,revision:expectedRevision,
      page_width:pageWidth,geometry_width:geometryWidth,...(sourceOperation?{source_operation:operation(sourceOperation)}:{})});
  }
  refreshResume({requestId,projectId,refreshOperation}) {
    return this.#mutate(requestId,this.#project(projectId)+'/refresh',{action:'resume',operation:text(refreshOperation,'original refresh operation',64)});
  }
  maximoStatus(projectId){return this.#get(this.#project(projectId)+'/maximo',32*1024*1024);}
  maximoStart({requestId,projectId,expectedRevision,profileId}) {
    revision(expectedRevision);return this.#mutate(requestId,this.#project(projectId)+'/maximo',
      {action:'start',operation:requestId,revision:expectedRevision,profile_id:operation(profileId)});
  }
  maximoResume({requestId,projectId,captureOperation}) {
    return this.#mutate(requestId,this.#project(projectId)+'/maximo',{action:'resume',operation:operation(captureOperation)});
  }
  maximoReceive({requestId,projectId,expectedRevision,captureOperation}) {
    revision(expectedRevision);return this.#mutate(requestId,this.#project(projectId)+'/maximo',
      {action:'receive',operation:requestId,revision:expectedRevision,capture_operation:operation(captureOperation)});
  }
  maximoPrepareLoad({requestId,projectId,expectedRevision,captureOperation,mapping}) {
    revision(expectedRevision);need(plain(mapping),'Supply the explicit native Maximo mapping.');
    return this.#mutate(requestId,this.#project(projectId)+'/maximo',
      {action:'prepare-load',operation:requestId,revision:expectedRevision,capture_operation:operation(captureOperation),mapping});
  }
  maximoReceiveLoad({requestId,projectId,loadId,returnedBytes}) {
    need(Buffer.isBuffer(returnedBytes)&&returnedBytes.length>0&&returnedBytes.length<=16*1024*1024,'Select the complete original returned JSON envelope.');
    const original=utf8(returnedBytes);need(plain(JSON.parse(original)),'Select the original returned JSON object.');
    const prefix=canonical({action:'receive-load',operation:operation(requestId),load_id:operation(loadId)}).slice(0,-1);
    const body=Buffer.from(prefix+',"returned":'+original+'}');
    need(body.length<=16*1024*1024,'The original returned envelope and request fields must fit the native 16 MiB limit.');
    return this.#mutate(requestId,this.#project(projectId)+'/maximo',body);
  }
  maximoResult({projectId,operationId,offset=0,limit=100}) {
    revision(offset);need(Number.isSafeInteger(limit)&&limit>=1&&limit<=250,'Select 1 to 250 original result rows.');
    return this.#get(this.#project(projectId)+'/maximo-result?'+new URLSearchParams({operation:operation(operationId),offset:String(offset),limit:String(limit)}),4*1024*1024);
  }
  async operation(requestId) {
    const record=await this.#journal(operation(requestId));
    const {body,...request}=record.request,{body:responseBody,...response}=record.response??{};
    return {schema:record.schema,requestId,state:record.state,binding:record.binding,createdAt:record.createdAt,
      request,response:record.response?response:null,attempts:record.attempts};
  }
  replayOperation(requestId) {
    operation(requestId);
    return this.#serial(()=>withPrivateLock(this.#entry.operationDirectory,'municipal-asset-agent.lock',async()=>{
      const record=await this.#journal(requestId);
      if(record.state==='COMPLETED')return responseValue({status:record.response.status,bytes:Buffer.from(record.response.body,'base64')});
      return this.#dispatch(record);
    }));
  }
  async originalFile(selection) {
    const {kind,projectId,expectedRevision,releaseId,operationId,name,requestId}=selection;
    if(kind==='operation'){
      const record=await this.#journal(operation(requestId));
      const responses=[];
      for(const attempt of record.attempts){
        if(!attempt.responseFile)continue;
        need(/^response-[a-f0-9]{64}-[1-9][0-9]*\.json$/.test(attempt.responseFile),'Keep the original response sidecar name.');
        const original=await readPrivateJson(join(this.#entry.operationDirectory,attempt.responseFile),96*1024*1024);
        need(digest(Buffer.from(canonical(original)))===attempt.responseSha256,'The original retained response changed.');
        responses.push({file:attempt.responseFile,original});
      }
      return {name:'Municipal-Agent-Operation-'+digest(requestId)+'.json',type:'application/json',bytes:Buffer.from(JSON.stringify({...record,responses},null,2)+'\n')};
    }
    let path,filename;
    if(kind==='backup'){path='/api/backup';filename='Municipal-Workspace-SQLite-Backup.zip';}
    else{
      const root=this.#project(projectId);
      if(['project','report','export'].includes(kind)){
        revision(expectedRevision);
        await this.project(projectId,expectedRevision);
        if(kind==='project'){path=root;filename='Municipal-Project.json';}
        if(kind==='report'){path=root+'/report';filename='Municipal-Asset-Handoff.html';}
        if(kind==='export'){path=root+'/export'+(releaseId?'?'+new URLSearchParams({release:operation(releaseId)}):'');filename='Municipal-Asset-Handoff.zip';}
      }else if(kind==='refresh-status'||kind==='maximo-status'){
        path=root+(kind==='refresh-status'?'/refresh':'/maximo');filename=kind==='refresh-status'?'Municipal-Refresh-Operations.json':'Municipal-Maximo-Operations.json';
      }else if(kind==='refresh'){
        need(['capture','source_archive','report','handoff','workspace','geometry','result'].includes(name),'Select an original refresh file.');
        path=root+'/refresh-file?'+new URLSearchParams({operation:operation(operationId),name});
        const names={capture:'Belleville-Refreshed-Source.json',source_archive:'Belleville-Complete-Public-Source.zip',report:'Belleville-Asset-Handoff.html',
          handoff:'Belleville-Asset-Handoff.zip',workspace:'Belleville-Editable-Workspace.zip',geometry:'Belleville-Original-Geometry.geojson',result:'Refresh-Result.json'};
        filename=names[name];
      }else{
        const selected={'maximo-capture':'capture','maximo-load':'load','maximo-result':'result'}[kind];
        need(selected,'Select an original municipal file kind.');
        path=root+'/maximo-file?'+new URLSearchParams({kind:selected,operation:operation(operationId)});filename='Maximo-Original-'+selected+'.json';
      }
    }
    await this.#assertInstance();const response=await this.#http(path);
    if(response.status!==200)responseValue(response);
    if(['project','report','export'].includes(kind)){
      if(kind==='project')need(JSON.parse(utf8(response.bytes)).project?.revision===expectedRevision,'The downloaded project changed revision.','MUNICIPAL_ASSET_REVISION_CONFLICT');
      await this.project(projectId,expectedRevision);
    }
    return {name:filename,type:response.type,bytes:response.bytes};
  }
  async close() {
    await this.#tail;
    if(this.#closing)return;
    try{if(this.#cookie&&this.#csrf)await this.#http('/api/logout',{method:'POST',body:'{}',
      headers:{'Content-Type':'application/json'},maximum:65536,timeout:5000});}
    finally{this.#closing=true;this.#cookie=null;this.#csrf=null;}
  }
}
