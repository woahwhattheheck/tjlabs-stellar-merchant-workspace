// MIT. All mutations attach to the existing managed writer; declared original input bytes remain exact.
import {join,dirname,resolve,basename} from 'node:path';
import {privateDirectory,readJSON,readBytes,decode,need} from './host/io.mjs';
import {ShipmentCommissioningClient} from './host/client.mjs';
import {core,sessions,workspaceHead} from './runtime.mjs';
import {previewShipmentCommissioning,inspectShipmentCommissioning} from './host/domain.mjs';
import {model} from './host/store.mjs';
import {shipmentTools} from './tools.mjs';
const alias=v=>{need(typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v),'SHIPMENT_ALIAS','Choose a declared host alias.');return v;};
const definitions=new Map(shipmentTools((name,description,properties,required)=>({name,properties,required})).map(x=>[x.name,x]));
export async function readShipmentCommissioningConfiguration(path){
 const file=await readJSON(path,1024*1024),value=file.value;need(value.schema==='stellar-forge.shipment-host.v1'&&value.workspaces&&Object.keys(value.workspaces).length>0&&Object.keys(value.workspaces).length<=32,'SHIPMENT_CONFIG','Declare 1–32 original managed workspaces.');
 const workspaces=Object.create(null),seen=new Set();
 for(const [key,input]of Object.entries(value.workspaces)){
  alias(key);const directoryIdentity=await privateDirectory(resolve(dirname(path),input.directory)),directory=directoryIdentity.path;
  need(!seen.has(directory),'SHIPMENT_ALIAS','Declare one alias per original directory.');seen.add(directory);
  const state=model.validate((await readJSON(join(directory,'state.json'))).value);
  need(!input.installationId||input.installationId===state.installationId,'SHIPMENT_INSTALLATION_CHANGED','Configured installation differs.',409);
  const inputs=Object.create(null);
  for(const [name,declared]of Object.entries(input.inputs||{})){alias(name);need(/^[a-f0-9]{64}$/.test(declared.sha256||''),'SHIPMENT_INPUT','Declare complete input hash.');const r=await readBytes(resolve(dirname(path),declared.file));need(r.sha256===declared.sha256,'SHIPMENT_INPUT_CHANGED','Declared input differs.',409);inputs[name]={file:r.path,filename:basename(r.path),bytes:r.bytes.length,sha256:r.sha256};}
  workspaces[key]={label:input.label||key,directory,directoryIdentity,installationId:state.installationId,inputs};
 }return {path,sha256:file.sha256,workspaces};
}
export class MerchantShipmentCommissioning{
 constructor(config){this.config=config;this.clients=new Map();this.tail=Promise.resolve();this.closing=false;}
 get summary(){return {configured:!!this.config.shipment,connected:[...this.clients.keys()],closing:this.closing};}
 async dispatch(name,args){
  const definition=definitions.get(name);need(definition&&args&&Object.keys(args).every(k=>Object.hasOwn(definition.properties,k))&&definition.required.every(k=>Object.hasOwn(args,k)),'SHIPMENT_TOOL','Use the declared tool fields.');
  const all=this.config.shipment?.workspaces||{};
  if(name==='merchant_shipment_status'&&!args.workspace)return {...this.summary,workspaces:Object.entries(all).map(([workspace,s])=>({workspace,label:s.label,installationId:s.installationId,inputs:Object.entries(s.inputs).map(([sourceInput,x])=>({sourceInput,filename:x.filename,bytes:x.bytes,sha256:x.sha256}))}))};
  const scope=all[alias(args.workspace)];need(scope,'SHIPMENT_WORKSPACE','Choose a declared original workspace.',404);let c=this.clients.get(args.workspace);
  if(name==='merchant_shipment_connect'){const next=await ShipmentCommissioningClient.connect(scope.directory,{installationId:scope.installationId,instanceId:args.instanceId,directoryIdentity:scope.directoryIdentity});await c?.close();this.clients.set(args.workspace,next);return {...next.identity,status:await next.status()};}
  if(name==='merchant_shipment_disconnect'){await c?.close();this.clients.delete(args.workspace);return {workspace:args.workspace,state:'DISCONNECTED'};}
  if(name==='merchant_shipment_file'){
   const actual=await privateDirectory(scope.directory);need(actual.dev===scope.directoryIdentity.dev&&actual.ino===scope.directoryIdentity.ino,'SHIPMENT_DIRECTORY_CHANGED','The original export directory was replaced.',409);
   const offset=args.offset??0,limit=args.limit??196608;need(/^[a-f0-9]{64}$/.test(args.fileId||'')&&Number.isSafeInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0&&limit<=196608,'SHIPMENT_FILE','Select a retained export and byte range.');
   const r=await readBytes(join(scope.directory,'exports',args.fileId+'.zip'));need(r.sha256===args.fileId&&offset<=r.bytes.length,'SHIPMENT_FILE_CHANGED','Retained original or byte range differs.',409);
   const end=Math.min(r.bytes.length,offset+limit);return {fileId:args.fileId,sha256:r.sha256,bytes:r.bytes.length,offset,nextOffset:end<r.bytes.length?end:null,contentBase64:r.bytes.subarray(offset,end).toString('base64')};
  }
  if(name==='merchant_shipment_status'&&!c)return {workspace:args.workspace,state:'DISCONNECTED'};need(c,'SHIPMENT_DISCONNECTED','Connect the existing Applications workspace.',409);
  if(name==='merchant_shipment_status')return c.status();
  if(name==='merchant_shipment_browser')return c.browser();
  if(name==='merchant_shipment_export')return c.export(args.expectedSha256);
  if(['merchant_shipment_action','merchant_shipment_ingest','merchant_shipment_receive'].includes(name)){
   let operation=args.operation,request;
   if(name==='merchant_shipment_ingest'){
    const selected=scope.inputs[alias(args.sourceInput)];need(selected&&selected.sha256===args.expectedSourceSha256,'SHIPMENT_INPUT','Select a declared complete original hash.',409);
    const original=await readBytes(selected.file);need(original.sha256===selected.sha256&&original.bytes.length===selected.bytes,'SHIPMENT_INPUT_CHANGED','The original changed.',409);const kind='add_original',payload={id:args.originalId,name:selected.filename,media_type:args.mediaType||'application/octet-stream',data:original.bytes.toString('base64'),description:args.description,origin:args.origin};
    operation={id:args.request.id,kind,actor:args.request.actor,at:args.request.at,expectedHead:args.expectedHead,payload};
   }else if(name==='merchant_shipment_receive'){
    const selected=scope.inputs[alias(args.sourceInput)];need(selected&&selected.sha256===args.expectedSourceSha256,'SHIPMENT_INPUT','Select a declared complete input hash.',409);
    const original=await readBytes(selected.file);need(original.sha256===selected.sha256&&original.bytes.length===selected.bytes,'SHIPMENT_INPUT_CHANGED','The complete original changed.',409);
    if(args.kind==='request')request=JSON.parse(decode(original.bytes));
    else{need(args.request,'SHIPMENT_REQUEST','Retain the original save request fields.');const received=sessions.receive(decode(original.bytes));received.draft.actor=args.request.actor;received.workspace.actor=args.request.actor;request={schema:'stellar-forge.shipment-request.v1',installationId:scope.installationId,...args.request,kind:'save',carrier:sessions.pack(received)};}
   }
   request??={schema:'stellar-forge.shipment-request.v1',installationId:scope.installationId,...args.request,kind:'action',operation};
   const r=await(args.recoverOnly?c.requestStatus(request):c.apply(request));return {outcome:r.outcome,reused:r.reused,requestSha256:r.record?.requestSha256||r.requestSha256,sequence:r.state.sequence,sha256:r.state.sha256,sessionSha256:r.state.carrier.sha256,error:r.record?.error};
  }
  const state=await c.state();need(state.sha256===args.expectedSha256,'SHIPMENT_BASE_CHANGED','Select the current saved edition before reading or previewing.',409);const w=state.carrier.session.workspace;
  if(name==='merchant_shipment_preview')return {editionSha256:state.sha256,head:workspaceHead(w),result:previewShipmentCommissioning(core,w,args.kind,args.input)};
  if(name==='merchant_shipment_inspect')return inspectShipmentCommissioning(core,state,args);
  throw Error('Unknown shipment operation');
 }
 call(name,args={}){need(!this.closing,'SHIPMENT_CLOSING','This attachment is closing.',409);const p=this.tail.then(()=>this.dispatch(name,args));this.tail=p.catch(()=>{});return p;}
 close(){if(this.closed)return this.closed;this.closing=true;return this.closed=(async()=>{await this.tail;await Promise.all([...this.clients.values()].map(c=>c.close()));this.clients.clear();})();}
}
