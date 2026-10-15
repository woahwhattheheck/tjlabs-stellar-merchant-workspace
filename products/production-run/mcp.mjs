// MIT. All mutations attach to the existing managed writer; declared original input bytes remain exact.
import {join,dirname,resolve,basename} from 'node:path';
import {privateDirectory,readJSON,readBytes,decode,need} from './host/io.mjs';
import {ProductionClient} from './host/client.mjs';
import {core,sessions} from './runtime.mjs';
import {previewProduction,inspectProduction} from './host/domain.mjs';
import {model} from './host/store.mjs';
import {productionTools} from './tools.mjs';
const alias=v=>{need(typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v),'PRODUCTION_ALIAS','Choose a declared host alias.');return v;};
const definitions=new Map(productionTools((name,description,properties,required)=>({name,properties,required})).map(x=>[x.name,x]));
export async function readProductionConfiguration(path){
 const file=await readJSON(path,1024*1024),value=file.value;need(value.schema==='stellar-forge.production-host.v1'&&value.workspaces&&Object.keys(value.workspaces).length>0&&Object.keys(value.workspaces).length<=32,'PRODUCTION_CONFIG','Declare 1–32 original managed workspaces.');
 const workspaces=Object.create(null),seen=new Set();
 for(const [key,input]of Object.entries(value.workspaces)){
  alias(key);const directoryIdentity=await privateDirectory(resolve(dirname(path),input.directory)),directory=directoryIdentity.path;
  need(!seen.has(directory),'PRODUCTION_ALIAS','Declare one alias per original directory.');seen.add(directory);
  const state=model.validate((await readJSON(join(directory,'state.json'))).value);
  need(!input.installationId||input.installationId===state.installationId,'PRODUCTION_INSTALLATION_CHANGED','Configured installation differs.',409);
  const inputs=Object.create(null);
  for(const [name,declared]of Object.entries(input.inputs||{})){alias(name);need(/^[a-f0-9]{64}$/.test(declared.sha256||''),'PRODUCTION_INPUT','Declare complete input hash.');const r=await readBytes(resolve(dirname(path),declared.file));need(r.sha256===declared.sha256,'PRODUCTION_INPUT_CHANGED','Declared input differs.',409);inputs[name]={file:r.path,filename:basename(r.path),bytes:r.bytes.length,sha256:r.sha256};}
  workspaces[key]={label:input.label||key,directory,directoryIdentity,installationId:state.installationId,inputs};
 }return {path,sha256:file.sha256,workspaces};
}
export class MerchantProduction{
 constructor(config){this.config=config;this.clients=new Map();this.tail=Promise.resolve();this.closing=false;}
 get summary(){return {configured:!!this.config.production,connected:[...this.clients.keys()],closing:this.closing};}
 async dispatch(name,args){
  const definition=definitions.get(name);need(definition&&args&&Object.keys(args).every(k=>Object.hasOwn(definition.properties,k))&&definition.required.every(k=>Object.hasOwn(args,k)),'PRODUCTION_TOOL','Use the declared tool fields.');
  const all=this.config.production?.workspaces||{};
  if(name==='merchant_production_status'&&!args.workspace)return {...this.summary,workspaces:Object.entries(all).map(([workspace,s])=>({workspace,label:s.label,installationId:s.installationId,inputs:Object.entries(s.inputs).map(([sourceInput,x])=>({sourceInput,filename:x.filename,bytes:x.bytes,sha256:x.sha256}))}))};
  const scope=all[alias(args.workspace)];need(scope,'PRODUCTION_WORKSPACE','Choose a declared original workspace.',404);let c=this.clients.get(args.workspace);
  if(name==='merchant_production_connect'){const next=await ProductionClient.connect(scope.directory,{installationId:scope.installationId,instanceId:args.instanceId,directoryIdentity:scope.directoryIdentity});await c?.close();this.clients.set(args.workspace,next);return {...next.identity,status:await next.status()};}
  if(name==='merchant_production_disconnect'){await c?.close();this.clients.delete(args.workspace);return {workspace:args.workspace,state:'DISCONNECTED'};}
  if(name==='merchant_production_file'){
   const actual=await privateDirectory(scope.directory);need(actual.dev===scope.directoryIdentity.dev&&actual.ino===scope.directoryIdentity.ino,'PRODUCTION_DIRECTORY_CHANGED','The original export directory was replaced.',409);
   const offset=args.offset??0,limit=args.limit??196608;need(/^[a-f0-9]{64}$/.test(args.fileId||'')&&Number.isSafeInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0&&limit<=196608,'PRODUCTION_FILE','Select a retained export and byte range.');
   const r=await readBytes(join(scope.directory,'exports',args.fileId+'.zip'));need(r.sha256===args.fileId&&offset<=r.bytes.length,'PRODUCTION_FILE_CHANGED','Retained original or byte range differs.',409);
   const end=Math.min(r.bytes.length,offset+limit);return {fileId:args.fileId,sha256:r.sha256,bytes:r.bytes.length,offset,nextOffset:end<r.bytes.length?end:null,contentBase64:r.bytes.subarray(offset,end).toString('base64')};
  }
  if(name==='merchant_production_status'&&!c)return {workspace:args.workspace,state:'DISCONNECTED'};need(c,'PRODUCTION_DISCONNECTED','Connect the existing Applications workspace.',409);
  if(name==='merchant_production_status')return c.status();
  if(name==='merchant_production_browser')return c.browser();
  if(name==='merchant_production_export')return c.export(args.expectedSha256);
  if(['merchant_production_action','merchant_production_ingest','merchant_production_receive'].includes(name)){
   let operation=args.operation,request;
   if(name!=='merchant_production_action'){
    const selected=scope.inputs[alias(args.sourceInput)];need(selected&&selected.sha256===args.expectedSourceSha256,'PRODUCTION_INPUT','Select a declared complete input hash.',409);
    const original=await readBytes(selected.file);need(original.sha256===selected.sha256&&original.bytes.length===selected.bytes,'PRODUCTION_INPUT_CHANGED','The complete original changed.',409);
    if(name==='merchant_production_ingest')operation={id:args.request.id,kind:'add-source',actor:args.request.actor,at:args.request.at,expectedRoot:args.expectedRoot,payload:{name:selected.filename,mediaType:args.mediaType,content_base64:original.bytes.toString('base64')}};
    else if(args.kind==='request')request=JSON.parse(decode(original.bytes));
    else{need(args.request,'PRODUCTION_REQUEST','Retain the original save request fields.');const carrier=JSON.parse(decode(original.bytes));sessions.receive(JSON.stringify(carrier));request={schema:'stellar-forge.production-request.v1',installationId:scope.installationId,...args.request,kind:'save',carrier};}
   }
   request??={schema:'stellar-forge.production-request.v1',installationId:scope.installationId,...args.request,kind:'action',operation};
   const r=await(args.recoverOnly?c.requestStatus(request):c.apply(request));return {outcome:r.outcome,reused:r.reused,requestSha256:r.record?.requestSha256||r.requestSha256,sequence:r.state.sequence,sha256:r.state.sha256,sessionSha256:r.state.carrier.sha256,error:r.record?.error};
  }
  const state=await c.state();need(state.sha256===args.expectedSha256,'PRODUCTION_BASE_CHANGED','Select the current saved edition before reading or previewing.',409);const w=state.carrier.session.workspace;
  if(name==='merchant_production_preview')return {editionSha256:state.sha256,rootSha256:w.rootSha256,result:previewProduction(core,w,args.kind,args.input)};
  if(name==='merchant_production_inspect')return inspectProduction(core,state,args);
  throw Error('Unknown production operation');
 }
 call(name,args={}){need(!this.closing,'PRODUCTION_CLOSING','This attachment is closing.',409);const p=this.tail.then(()=>this.dispatch(name,args));this.tail=p.catch(()=>{});return p;}
 close(){if(this.closed)return this.closed;this.closing=true;return this.closed=(async()=>{await this.tail;await Promise.all([...this.clients.values()].map(c=>c.close()));this.clients.clear();})();}
}
