// MIT. All mutations attach to the existing managed writer; declared original input bytes remain exact.
import {join,dirname,resolve,basename} from 'node:path';
import {privateDirectory,readJSON,readBytes,decode,need} from './host/io.mjs';
import {CostingClient} from './host/client.mjs';
import {core,sessions} from './runtime.mjs';
import {model} from './host/store.mjs';
import {costingTools} from './tools.mjs';
const alias=v=>{need(typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v),'COSTING_ALIAS','Choose a declared host alias.');return v;};
const definitions=new Map(costingTools((name,description,properties,required)=>({name,properties,required})).map(x=>[x.name,x]));
export async function readCostingConfiguration(path){
 const file=await readJSON(path,1024*1024),value=file.value;need(value.schema==='stellar-forge.costing-host.v1'&&value.workspaces&&Object.keys(value.workspaces).length>0&&Object.keys(value.workspaces).length<=32,'COSTING_CONFIG','Declare 1–32 original managed workspaces.');
 const workspaces=Object.create(null),seen=new Set();
 for(const [key,input]of Object.entries(value.workspaces)){
  alias(key);const directoryIdentity=await privateDirectory(resolve(dirname(path),input.directory)),directory=directoryIdentity.path;
  need(!seen.has(directory),'COSTING_ALIAS','Declare one alias per original directory.');seen.add(directory);
  const state=model.validate((await readJSON(join(directory,'state.json'))).value);
  need(!input.installationId||input.installationId===state.installationId,'COSTING_INSTALLATION_CHANGED','Configured installation differs.',409);
  const inputs=Object.create(null);
  for(const [name,declared]of Object.entries(input.inputs||{})){alias(name);need(/^[a-f0-9]{64}$/.test(declared.sha256||''),'COSTING_INPUT','Declare complete input hash.');const r=await readBytes(resolve(dirname(path),declared.file));need(r.sha256===declared.sha256,'COSTING_INPUT_CHANGED','Declared input differs.',409);inputs[name]={file:r.path,filename:basename(r.path),bytes:r.bytes.length,sha256:r.sha256};}
  workspaces[key]={label:input.label||key,directory,directoryIdentity,installationId:state.installationId,inputs};
 }return {path,sha256:file.sha256,workspaces};
}
export class MerchantCosting{
 constructor(config){this.config=config;this.clients=new Map();this.tail=Promise.resolve();this.closing=false;}
 get summary(){return {configured:!!this.config.costing,connected:[...this.clients.keys()],closing:this.closing};}
 async dispatch(name,args){
  const definition=definitions.get(name);need(definition&&args&&Object.keys(args).every(k=>Object.hasOwn(definition.properties,k))&&definition.required.every(k=>Object.hasOwn(args,k)),'COSTING_TOOL','Use the declared tool fields.');
  const all=this.config.costing?.workspaces||{};
  if(name==='merchant_costing_status'&&!args.workspace)return {...this.summary,workspaces:Object.entries(all).map(([workspace,s])=>({workspace,label:s.label,installationId:s.installationId,inputs:Object.entries(s.inputs).map(([sourceInput,x])=>({sourceInput,filename:x.filename,bytes:x.bytes,sha256:x.sha256}))}))};
  const scope=all[alias(args.workspace)];need(scope,'COSTING_WORKSPACE','Choose a declared original workspace.',404);let c=this.clients.get(args.workspace);
  if(name==='merchant_costing_connect'){const next=await CostingClient.connect(scope.directory,{installationId:scope.installationId,instanceId:args.instanceId,directoryIdentity:scope.directoryIdentity});await c?.close();this.clients.set(args.workspace,next);return {...next.identity,status:await next.status()};}
  if(name==='merchant_costing_disconnect'){await c?.close();this.clients.delete(args.workspace);return {workspace:args.workspace,state:'DISCONNECTED'};}
  if(name==='merchant_costing_file'){
   const actual=await privateDirectory(scope.directory);need(actual.dev===scope.directoryIdentity.dev&&actual.ino===scope.directoryIdentity.ino,'COSTING_DIRECTORY_CHANGED','The original export directory was replaced.',409);
   const offset=args.offset??0,limit=args.limit??196608;need(/^[a-f0-9]{64}$/.test(args.fileId||'')&&Number.isSafeInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0&&limit<=196608,'COSTING_FILE','Select a retained export and byte range.');
   const r=await readBytes(join(scope.directory,'exports',args.fileId+'.zip'));need(r.sha256===args.fileId&&offset<=r.bytes.length,'COSTING_FILE_CHANGED','Retained original or byte range differs.',409);
   const end=Math.min(r.bytes.length,offset+limit);return {fileId:args.fileId,sha256:r.sha256,bytes:r.bytes.length,offset,nextOffset:end<r.bytes.length?end:null,contentBase64:r.bytes.subarray(offset,end).toString('base64')};
  }
  if(name==='merchant_costing_status'&&!c)return {workspace:args.workspace,state:'DISCONNECTED'};need(c,'COSTING_DISCONNECTED','Connect the existing Applications workspace.',409);
  if(name==='merchant_costing_status')return c.status();
  if(name==='merchant_costing_browser')return c.browser();
  if(name==='merchant_costing_export')return c.export(args.expectedSha256);
  if(['merchant_costing_action','merchant_costing_ingest','merchant_costing_receive'].includes(name)){
   let operation=args.operation,request;
   if(name!=='merchant_costing_action'){
    const selected=scope.inputs[alias(args.sourceInput)];need(selected&&selected.sha256===args.expectedSourceSha256,'COSTING_INPUT','Select a declared complete input hash.',409);
    const original=await readBytes(selected.file);need(original.sha256===selected.sha256&&original.bytes.length===selected.bytes,'COSTING_INPUT_CHANGED','The complete original changed.',409);
    if(name==='merchant_costing_ingest')operation={id:args.request.id,kind:'add-source',actor:args.request.actor,at:args.request.at,expectedRoot:args.expectedRoot,payload:{name:selected.filename,mediaType:args.mediaType,content_base64:original.bytes.toString('base64')}};
    else if(args.kind==='request')request=JSON.parse(decode(original.bytes));
    else{need(args.request,'COSTING_REQUEST','Retain the original save request fields.');const carrier=JSON.parse(decode(original.bytes));sessions.receive(JSON.stringify(carrier));request={schema:'stellar-forge.costing-request.v1',installationId:scope.installationId,...args.request,kind:'save',carrier};}
   }
   request??={schema:'stellar-forge.costing-request.v1',installationId:scope.installationId,...args.request,kind:'action',operation};
   const r=await(args.recoverOnly?c.requestStatus(request):c.apply(request));return {outcome:r.outcome,reused:r.reused,requestSha256:r.record?.requestSha256||r.requestSha256,sequence:r.state.sequence,sha256:r.state.sha256,sessionSha256:r.state.carrier.sha256,error:r.record?.error};
  }
  const state=await c.state();need(state.sha256===args.expectedSha256,'COSTING_BASE_CHANGED','Select the current saved edition before reading or previewing.',409);const w=state.carrier.session.workspace;
  if(name==='merchant_costing_preview'){
   let result;
   if(args.kind==='analysis')result=core.analyse(args.input,w);
   else if(args.kind==='mapping')result=core.mapTable(w,args.input.sourceId,args.input.options);
   else if(args.kind==='comparison')result=core.compare(w,args.input.leftEditionId,args.input.rightEditionId);
   else throw Error('Choose a declared costing preview.');
   return {editionSha256:state.sha256,rootSha256:w.rootSha256,result};
  }
  if(name==='merchant_costing_inspect'){
   let rows,context={};
   if(args.collection==='rows'){const v=core.inspectSource(w,args.id,{format:args.format||'csv',arrayPointer:args.arrayPointer||''});rows=v.rows;context={columns:v.columns,format:v.format,findings:v.findings};}
   else if(args.collection==='requests')rows=[...state.receipts.map(r=>({...r,outcome:'COMMITTED'})),...state.rejections.map(r=>({...r,outcome:'REJECTED_NOT_COMMITTED'}))];
   else if(args.collection==='backups')rows=state.carrier.session.backups.map(b=>({id:b.id,at:b.at,reason:b.reason,sha256:b.sha256,workspaceId:b.snapshot.workspace.initial.id}));
   else if(args.collection==='sources')rows=w.sources.map(({content_base64,...metadata})=>metadata);
   else if(args.collection==='editions')rows=w.editions.map(({input,report,...e})=>({...e,currency:report.currency,asOf:report.asOf,summary:report.summary}));
   else if(args.collection==='operations')rows=w.operations.map(({payload,...o})=>({...o,payloadKeys:Object.keys(payload)}));
   else if(args.collection==='reviews')rows=w.reviews;
   else{const e=w.editions.find(x=>x.id===args.id);need(e,'COSTING_EDITION','Select an exact frozen edition.',404);context={editionId:e.id,inputSha256:e.inputSha256,reportSha256:e.reportSha256,currency:e.report.currency,asOf:e.report.asOf,summary:e.report.summary};if(args.collection==='input'){need(Object.hasOwn(core.fields,args.table),'COSTING_TABLE','Choose a declared input table.');context.table=args.table;rows=e.input[args.table];}else rows=e.report[args.collection];}
   need(Array.isArray(rows),'COSTING_COLLECTION','Select a retained collection.');const offset=args.offset??0,limit=args.limit??20;need(Number.isSafeInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0&&limit<=50,'COSTING_PAGE','Choose offset and 1–50 records.');
   return {sha256:state.sha256,rootSha256:w.rootSha256,collection:args.collection,id:args.id,...context,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit)};
  }
  throw Error('Unknown costing operation');
 }
 call(name,args={}){need(!this.closing,'COSTING_CLOSING','This attachment is closing.',409);const p=this.tail.then(()=>this.dispatch(name,args));this.tail=p.catch(()=>{});return p;}
 close(){if(this.closed)return this.closed;this.closing=true;return this.closed=(async()=>{await this.tail;await Promise.all([...this.clients.values()].map(c=>c.close()));this.clients.clear();})();}
}
