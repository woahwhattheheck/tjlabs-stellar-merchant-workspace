// MIT. Durable reporting custody inside the maintained Merchant MCP provider.
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ReportingStore,readOriginalFile,digest,MAX_PROJECT_BYTES} from './agent-store.mjs';
import {failure,copy,canonical,pretty,parseOriginal,projectView,executeReportingOperation} from './agent-operations.mjs';
import {openProgramme} from './programme.mjs';
import {RetainedFileReads} from '../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {definitions} from '../../../stellar-forge/mcp-merchant-operator/catalog/reporting-programmes.mjs';

const STATE='stellar-forge.reporting-agent-store.v1',REQUEST='stellar-forge.reporting-agent-request.v1';
const SHA=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const decode=bytes=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
const bytes=text=>new TextEncoder().encode(text);
const hash=value=>digest(bytes(canonical(value)));
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
function validateArguments(name,args){
 const definition=definitions.find(value=>value[0]===name);
 if(!definition||!plain(args))throw failure('ARGUMENT','Choose a declared reporting tool and complete arguments.');
 const properties=definition[2];
 if(Object.keys(args).some(key=>!Object.hasOwn(properties,key))||definition[3].some(key=>!Object.hasOwn(args,key)))
  throw failure('ARGUMENT','Use exactly the declared reporting tool fields.');
 for(const [key,value]of Object.entries(args)){
  const rule=properties[key],types=Array.isArray(rule.type)?rule.type:[rule.type],type=value===null?'null':Number.isSafeInteger(value)?'integer':typeof value;
  if(!types.includes(type)||rule.enum&&!rule.enum.includes(value)||typeof value==='string'&&(rule.pattern&&!new RegExp(rule.pattern).test(value)||rule.minLength!==undefined&&value.length<rule.minLength||rule.maxLength!==undefined&&value.length>rule.maxLength)||
   type==='integer'&&(rule.minimum!==undefined&&value<rule.minimum||rule.maximum!==undefined&&value>rule.maximum))
   throw failure('ARGUMENT','Invalid reporting argument '+key+'.');
 }
 return args;
}
function page(items,{offset=0,limit=50}={}){
 const slice=items.slice(offset,offset+limit);
 return {items:copy(slice),page:{offset,limit,total:items.length,nextOffset:offset+slice.length<items.length?offset+slice.length:null}};
}
function inspectState(value){
 if(!plain(value)||value.schema!==STATE||!UUID.test(value.id)||!Number.isSafeInteger(value.revision)||value.revision<1||
  !Array.isArray(value.operations)||!Array.isArray(value.publications)||!Array.isArray(value.versions)||
  value.current!==null&&(!plain(value.current)||!SHA.test(value.current.projectSha256)||!SHA.test(value.current.file?.sha256)))
  throw failure('STORE_INVALID','Reopen the complete original reporting store.');
 const ids=new Set(),pubs=new Set();
 for(const item of value.operations){
  if(!plain(item)||typeof item.operationId!=='string'||ids.has(item.operationId)||!SHA.test(item.requestSha256)||!SHA.test(item.request?.sha256)||
   !['apply','receive_desk','receive_project','export'].includes(item.kind)||!['prepared','complete','failed'].includes(item.state)||!Array.isArray(item.inputFiles)||!Array.isArray(item.publications))
   throw failure('STORE_INVALID','The complete original operation register is invalid.');
  ids.add(item.operationId);
 }
 for(const item of value.publications){
  if(!plain(item)||!SHA.test(item.publicationId)||pubs.has(item.publicationId)||!SHA.test(item.file?.sha256)||
   !Number.isSafeInteger(item.file.bytes)||item.file.bytes<0||typeof item.file.name!=='string'||/[\\/\x00-\x1f\x7f]/.test(item.file.name))
   throw failure('STORE_INVALID','The original publication register is invalid.');
  pubs.add(item.publicationId);
 }
 const prepared=value.operations.filter(item=>item.state==='prepared');
 if(prepared.length>1||(prepared[0]?.operationId??null)!==value.pending)throw failure('STORE_INVALID','Keep the original prepared operation and its selected pointer together.');
 return value;
}
export class ReportingSession{
 constructor(alias,configuration,store,readers,{instanceId=randomUUID(),readInput=readOriginalFile}={}){
  this.alias=alias;this.configuration=configuration;this.store=store;this.readers=readers;this.instanceId=instanceId;this.readInput=readInput;
  this.state=null;this.project=null;this.view={projectSha256:null,summary:null};this.closing=false;this.tail=Promise.resolve();
 }
 async initialize(){
  const saved=await this.store.load();
  if(saved){
   this.state=inspectState(saved);
   if(saved.current){
    this.project=await openProgramme(decode(await this.store.get(saved.current.file)));
    this.view=await projectView(this.project);
    if(this.view.projectSha256!==saved.current.projectSha256)throw failure('PROJECT_CHANGED','The selected complete native project differs from the retained state.');
   }
   return this;
  }
  let seed=null,source=null;
  if(this.configuration.project){
   const original=await this.readInput(this.configuration.project);
   seed=await openProgramme(decode(original.bytes));source=await this.store.put(original.bytes);
  }
  this.project=seed;this.view=await projectView(seed);
  const selected=seed?{projectSha256:this.view.projectSha256,file:source}:null;
  const state={schema:STATE,id:randomUUID(),revision:1,current:selected,versions:selected?[selected]:[],pending:null,operations:[],publications:[]};
  await this.store.save(state);this.state=state;return this;
 }
 common(){return {workspace:this.alias,native:{id:this.state.id,revision:this.state.revision},instanceId:this.instanceId,project:copy(this.view)};}
 status(){return {...this.common(),pending:this.state.pending?copy(this.state.operations.find(item=>item.operationId===this.state.pending)):null};}
 queue(fn){
  if(this.closing)return Promise.reject(failure('CLOSING','This original reporting workspace is closing.'));
  const task=this.tail.then(()=>{this.store.assert();return fn();});
  this.tail=task.then(()=>{},()=>{});return task;
 }
 async commit(next){
  next={...next,revision:this.state.revision+1};
  await this.store.save(next);this.state=next;
 }
 publication(operationId,format,file,projectSha256){
  const body={operationId,format,projectSha256,file:{name:file.name,bytes:file.bytes,sha256:file.sha256,type:file.type??'application/json'}};
  return {publicationId:hash(body),...body};
 }
 addPublications(state,items){
  const known=new Set(state.publications.map(item=>item.publicationId));
  for(const item of items)if(!known.has(item.publicationId)){state.publications.push(item);known.add(item.publicationId);}
 }
 async original(alias,expectedSha256){
  const configured=this.configuration.inputs[alias];
  if(!configured)throw failure('INPUT_ALIAS','Select an input declared by the original host.');
  const original=await this.readInput(configured.path,MAX_PROJECT_BYTES);
  if(expectedSha256!==undefined&&original.sha256!==expectedSha256)throw failure('INPUT_CHANGED','The complete original input differs from its selected SHA256.');
  const text=decode(original.bytes);
  return {text,bytes:original.bytes,metadata:{alias,file:{name:basename(configured.path),bytes:original.bytes.length,sha256:original.sha256,type:'application/json'}}};
 }
 async inputList(args){
  const aliases=Object.keys(this.configuration.inputs),selection=page(aliases,args),items=[];
  for(const alias of selection.items){
   try{const original=await this.original(alias);items.push({...original.metadata,available:true,label:this.configuration.inputs[alias].label??alias});}
   catch(error){items.push({alias,available:false,error:{code:error.code??'INPUT_UNAVAILABLE',message:'The configured original input could not be read.'}});}
  }
  return {...this.common(),items,page:selection.page};
 }
 async inspectInput(args){
  const original=await this.original(args.input,args.expectedSha256);
  await this.store.put(original.bytes);
  const publication=this.publication('input-'+args.input+'-'+args.expectedSha256,'input',original.metadata.file,null);
  if(!this.state.publications.some(item=>item.publicationId===publication.publicationId)){
   const next=copy(this.state);this.addPublications(next,[publication]);await this.commit(next);
  }
  return {...this.common(),input:original.metadata,publication};
 }
 operation(id){
  const operation=this.state.operations.find(item=>item.operationId===id);
  if(!operation)throw failure('OPERATION_NOT_FOUND','Select the original retained operationId.');
  return operation;
 }
 async request(operation){
  const raw=await this.store.get(operation.request),envelope=parseOriginal(decode(raw));
  if(hash(envelope)!==operation.requestSha256||envelope.schema!==REQUEST||envelope.args?.operationId!==operation.operationId||envelope.kind!==operation.kind)
   throw failure('REQUEST_CHANGED','The complete original retained request changed.');
  return envelope;
 }
 async start(kind,args){
  const existing=this.state.operations.find(item=>item.operationId===args.operationId);
  if(existing){
   const envelope=await this.request(existing);
   if(kind!==existing.kind||canonical(args)!==canonical(envelope.args))throw failure('OPERATION_CONFLICT','Keep the original operation and full arguments unchanged.');
   // Exact repeated dispatch deliberately precedes the old project CAS and does
   // not reread a changed host input. Its full original bytes are already retained.
   return this.finish(existing);
  }
  if(this.state.pending)throw failure('PENDING_OPERATION','Recover the exact prepared original operation before another project transition.');
  if(args.expectedProjectSha256!==this.view.projectSha256)throw failure('PROJECT_CONFLICT','Prepare against the current complete original project identity.');
  const inputs=[];
  if(kind!=='export'){
   for(const [role,alias,pin]of [['input',args.input,args.expectedSha256],...(kind==='receive_desk'?[['context',args.context,args.expectedContextSha256]]:[])]){
    const original=await this.original(alias,pin),ref=await this.store.put(original.bytes);
    inputs.push({role,alias,file:{...original.metadata.file,...ref}});
   }
  }
  const envelope={schema:REQUEST,kind,args:copy(args),inputs},request=await this.store.put(bytes(pretty(envelope)));
  const operation={operationId:args.operationId,requestSha256:hash(envelope),request,kind,state:'prepared',
   beforeProjectSha256:this.view.projectSha256,afterProjectSha256:null,inputFiles:copy(inputs),publications:[],createdAt:new Date().toISOString()};
  const next=copy(this.state),requestPublication=this.publication(args.operationId,'request',{...request,name:'reporting-operation.json',type:'application/json'},this.view.projectSha256);
  const sourcePublications=inputs.map(input=>this.publication(args.operationId,'input',input.file,this.view.projectSha256));
  operation.publications=[requestPublication,...sourcePublications];this.addPublications(next,operation.publications);
  next.operations.push(operation);next.pending=operation.operationId;await this.commit(next);
  return this.finish(operation);
 }
 async finish(operation){
  operation=this.operation(operation.operationId);
  if(operation.state!=='prepared')return {...this.common(),operation:copy(operation),replayed:true};
  if(this.state.pending!==operation.operationId||this.view.projectSha256!==operation.beforeProjectSha256)
   throw failure('PROJECT_CONFLICT','The retained prepared operation must resume against its original selected predecessor.');
  const envelope=await this.request(operation),originals={};
  for(const item of envelope.inputs)originals[item.role]=decode(await this.store.get(item.file));
  let result;
  try{result=await executeReportingOperation(this.project,envelope,originals);}
  catch(error){
   const next=copy(this.state),failed=next.operations.find(item=>item.operationId===operation.operationId);
   failed.state='failed';failed.error={code:error.code??'OPERATION_FAILED',message:String(error.message??error).slice(0,4000)};
   failed.afterProjectSha256=this.view.projectSha256;failed.finishedAt=new Date().toISOString();next.pending=null;
   await this.commit(next);return {...this.common(),operation:copy(failed),replayed:false};
  }
  // IO errors after native computation leave the original prepared operation
  // selected. Its complete unchanged request is the only recovery input.
  const identity=await projectView(result.project),next=copy(this.state),completed=next.operations.find(item=>item.operationId===operation.operationId);
  let current=next.current;
  if(identity.projectSha256!==this.view.projectSha256){
   const ref=await this.store.put(bytes(pretty(result.project)));current={projectSha256:identity.projectSha256,file:ref};
   next.current=current;next.versions.push({...current,operationId:operation.operationId});
  }
  const output=result.output??{bytes:await this.store.get(current.file),name:'reporting-project.json',type:'application/json'};
  const retained=await this.store.put(output.bytes);
  const publication=this.publication(operation.operationId,envelope.kind==='export'?envelope.args.format:'project',{...retained,name:output.name,type:output.type},identity.projectSha256);
  completed.state='complete';completed.afterProjectSha256=identity.projectSha256;completed.finishedAt=new Date().toISOString();completed.domain=copy(result.domain??{});
  completed.publications.push(publication);this.addPublications(next,[publication]);next.pending=null;
  await this.commit(next);this.project=result.project;this.view=identity;
  return {...this.common(),operation:copy(completed),replayed:false};
 }
 async recover(args){
  const operation=this.operation(args.operationId);
  if(operation.requestSha256!==args.expectedRequestSha256)throw failure('REQUEST_CHANGED','Recover the exact complete original request fingerprint.');
  return this.finish(operation);
 }
 async readFile(args){
  const publication=this.state.publications.find(item=>item.publicationId===args.publicationId);
  if(!publication)throw failure('PUBLICATION_NOT_FOUND','Select an existing original publication.');
  if(publication.file.sha256!==args.expectedSha256)throw failure('PUBLICATION_CHANGED','Use the complete original publication SHA256.');
  const range=await this.readers.read({scope:this.state.id,key:publication.publicationId,kind:'reporting-publication',directory:this.store.directory,
   expectedSha256:args.expectedSha256,offset:args.offset,limit:args.limit,readId:args.readId,
   load:async()=>({readonlyFileHandle:await open(this.store.objectPath(publication.file.sha256),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK),
    ...publication.file})});
  return {...this.common(),...range};
 }
 async dispatch(name,args){
  const kind=name.slice('merchant_reporting_'.length);
  if(kind==='status'||kind==='open')return this.status();
  if(kind==='inputs')return this.inputList(args);
  if(kind==='inspect_input')return this.inspectInput(args);
  if(['apply','receive_desk','receive_project','export'].includes(kind))return this.start(kind,args);
  if(kind==='operation')return {...this.common(),operation:copy(this.operation(args.operationId))};
  if(kind==='recover')return this.recover(args);
  if(kind==='history')return {...this.common(),...page(this.state.operations,args)};
  if(kind==='publications')return {...this.common(),...page(this.state.publications,args)};
  if(kind==='publication'){
   const publication=this.state.publications.find(item=>item.publicationId===args.publicationId);
   if(!publication)throw failure('PUBLICATION_NOT_FOUND','Choose an original retained publication.');
   return {...this.common(),publication:copy(publication)};
  }
  if(kind==='file_read')return this.readFile(args);
  if(kind==='file_release'){await this.readers.release(this.state.id,args.readId);return {...this.common(),released:true};}
  throw failure('TOOL','Choose a declared reporting tool.');
 }
 async close(){
  this.closing=true;await this.tail;
  await this.readers.closeScope(this.state.id);await this.store.close();
  return {...this.common(),closed:true};
 }
}
export class MerchantReportingWorkspaces{
 #configured;#sessions=new Map();#opening=new Map();#closed=new Map();#readers;#closing=false;#closeTask=null;
 constructor(config){this.#configured=config.reportingProgrammes?.workspaces??{};this.#readers=new RetainedFileReads({errorPrefix:'REPORTING_FILE'});}
 get summary(){return {configured:Object.keys(this.#configured).length,opened:this.#sessions.size,pending:[...this.#sessions.values()].filter(item=>item.state.pending).length};}
 async #open(alias){
  if(this.#sessions.has(alias))return this.#sessions.get(alias);
  if(!this.#opening.has(alias)){
   const pending=(async()=>{
    const configuration=this.#configured[alias];if(!configuration)throw failure('WORKSPACE','Select an original configured workspace.');
    const store=await ReportingStore.open(configuration.directory);
    try{
     const session=await new ReportingSession(alias,configuration,store,this.#readers).initialize();
     this.#sessions.set(alias,session);this.#closed.delete(alias);return session;
    }catch(error){await store.close();throw error;}
   })().finally(()=>this.#opening.delete(alias));
   this.#opening.set(alias,pending);
  }
  return this.#opening.get(alias);
 }
 async call(name,args={}){
  validateArguments(name,args);
  if(this.#closing)throw failure('CLOSING','The original reporting provider is closing.');
  if(name==='merchant_reporting_workspaces')return {workspaces:Object.entries(this.#configured).map(([workspace,value])=>({workspace,label:value.label,opened:this.#sessions.has(workspace)}))};
  const alias=args.workspace;
  if(!Object.hasOwn(this.#configured,alias))throw failure('WORKSPACE','Select an original configured workspace.');
  if(name==='merchant_reporting_open'){const session=await this.#open(alias);return session.queue(()=>session.status());}
  const session=this.#sessions.get(alias);
  if(name==='merchant_reporting_close'){
   if(!session){const closed=this.#closed.get(alias);if(closed?.instanceId===args.instanceId)return copy(closed);throw failure('INSTANCE','Close only the original opened workspace instance.');}
   if(session.instanceId!==args.instanceId)throw failure('INSTANCE','This close names a different original workspace instance.');
   const result=await session.close();this.#closed.set(alias,result);this.#sessions.delete(alias);return result;
  }
  if(!session)throw failure('WORKSPACE_NOT_OPEN','Open this original reporting workspace explicitly first.');
  return session.queue(()=>session.dispatch(name,args));
 }
 close(){
  if(!this.#closeTask){
   this.#closing=true;
   this.#closeTask=(async()=>{
    await Promise.allSettled([...this.#opening.values()]);
    const outcomes=await Promise.allSettled([...this.#sessions.entries()].map(async([alias,session])=>{const result=await session.close();this.#closed.set(alias,result);this.#sessions.delete(alias);}));
    const failed=outcomes.find(value=>value.status==='rejected');if(failed)throw failed.reason;
    await this.#readers.close();
   })().catch(error=>{this.#closeTask=null;throw error;});
  }
  return this.#closeTask;
 }
}
