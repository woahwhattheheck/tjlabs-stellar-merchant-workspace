// SPDX-License-Identifier: MIT
// Complete original transportation source, service, metric, scenario and report operations.
import {constants} from 'node:fs';
import {open,realpath,link} from 'node:fs/promises';
import {dirname,resolve,basename,join} from 'node:path';
import {createHash} from 'node:crypto';
import {transportPlanningTools,COMMANDS,SOURCE_KINDS,ARTIFACT_KINDS} from './tools.mjs';
import {TransportPlanningFiles,present} from './files.mjs';
import {TransportPlanningRequests,canonical} from './requests.mjs';
import {TransportPlanningClient,need,plain,exact,absolute,identifier,digest,integer,hash,readJson,readFile,readConnection,readLaunchConfiguration,privateDirectory,ownedDirectory,inside,MAX_JSON,MAX_FILE} from './connection.mjs';
export const TRANSPORT_PLANNING_HOST_SCHEMA='stellar-forge.transport-planning-host.v1';
const schemas=new Map(transportPlanningTools((name,description,properties,required)=>({name,properties,required})).map(x=>[x.name,x]));
const alias=v=>{need(typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v),'TRANSPORT_PLANNING_ALIAS','Choose a declared host alias.');return v;};
const label=(v,f)=>{v=v??f;need(typeof v==='string'&&v.length>0&&v.length<=240&&!/[\x00-\x1f\x7f]/.test(v),'TRANSPORT_PLANNING_LABEL','Use a readable label.');return v;};
const same=(a,b)=>['dev','ino','size','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
function mapInput(v,name,max=256){need(v===undefined||plain(v)&&Object.keys(v).length<=max,'TRANSPORT_PLANNING_CONFIGURATION','Declare the complete '+name+' object.');return v??{};}
async function ordinary(path,size){need(await realpath(path)===path,'TRANSPORT_PLANNING_INPUT','Select a canonical ordinary input file.');const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await f.stat();need(s.isFile()&&(size===undefined||s.size===size),'TRANSPORT_PLANNING_INPUT','The declared full file size changed.',409);}finally{await f.close();}}
async function verifyClosed(path,expected){
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const before=await fd.stat();need(before.isFile()&&before.size===expected.bytes&&await realpath(path)===path,'TRANSPORT_PLANNING_INPUT_CHANGED','The retained original input changed.',409);
  const h=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let offset=0;
  while(offset<before.size){const r=await fd.read(buffer,0,Math.min(buffer.length,before.size-offset),offset);need(r.bytesRead>0,'TRANSPORT_PLANNING_INPUT_CHANGED','The retained input ended early.',409);h.update(buffer.subarray(0,r.bytesRead));offset+=r.bytesRead;}
  need(same(before,await fd.stat())&&h.digest('hex')===expected.sha256,'TRANSPORT_PLANNING_INPUT_CHANGED','The exact retained input identity changed.',409);
 }finally{await fd.close();}
}

async function ownedAncestor(path){
 path=absolute(path);
 for(;;){
  try{return await ownedDirectory(path);}
  catch(e){if(e.code!=='ENOENT')throw e;const parent=dirname(path);need(parent!==path,'TRANSPORT_PLANNING_LAYOUT','A declared workspace needs an existing owned canonical ancestor.');path=parent;}
 }
}

export async function readTransportPlanningConfiguration(path){
 const source=await readJson(path,2*1024*1024),raw=source.value,base=dirname(source.path);
 exact(raw,['schema','workspaces'],['schema','workspaces']);
 need(raw.schema===TRANSPORT_PLANNING_HOST_SCHEMA&&plain(raw.workspaces)&&Object.keys(raw.workspaces).length>=1&&Object.keys(raw.workspaces).length<=32,'TRANSPORT_PLANNING_HOST','Declare one to32 original transportation installations.');
 const workspaces=Object.create(null),seen=new Set(),connections=new Map();
 for(const[name,v]of Object.entries(raw.workspaces)){
  alias(name);exact(v,['label','directory','connectionFile','inputs','destinations'],['directory','connectionFile']);
  const directory=absolute(resolve(base,v.directory)),connectionFile=absolute(resolve(base,v.connectionFile));
  await ownedAncestor(dirname(directory));await privateDirectory(dirname(connectionFile));
  try{await ownedDirectory(directory);}catch(e){if(e.code!=='ENOENT')throw e;}
  need(!inside(directory,connectionFile)&&connectionFile!==source.path&&(!connections.has(connectionFile)||connections.get(connectionFile)===directory),'TRANSPORT_PLANNING_LAYOUT','Keep each private live connection outside its original workspace.');
  const identity=canonical([directory,connectionFile]);need(!seen.has(identity),'TRANSPORT_PLANNING_LAYOUT','Declare each original listener once.');seen.add(identity);connections.set(connectionFile,directory);
  const inputs=Object.create(null),destinations=Object.create(null);
  for(const[key,x]of Object.entries(mapInput(v.inputs,'complete inputs'))){
   alias(key);exact(x,['label','file','sha256','bytes','filename','mediaType'],['file','sha256','bytes','filename','mediaType']);
   digest(x.sha256);integer(x.bytes,'full input bytes',MAX_FILE);const file=absolute(resolve(base,x.file));await ordinary(file,x.bytes);
   need(typeof x.filename==='string'&&x.filename===basename(x.filename)&&x.filename.length>0&&x.filename.length<=240&&!/[\x00-\x1f\x7f\\]/.test(x.filename),'TRANSPORT_PLANNING_FILENAME','Use the original plain input filename.');
   need(typeof x.mediaType==='string'&&x.mediaType.length>0&&x.mediaType.length<=150&&!/[\r\n]/.test(x.mediaType),'TRANSPORT_PLANNING_MEDIA','Use the original MIME type.');
   inputs[key]={label:label(x.label,key),file,sha256:x.sha256,bytes:x.bytes,filename:x.filename,mediaType:x.mediaType};
  }
  for(const[key,x]of Object.entries(mapInput(v.destinations,'fresh receiving destinations',64))){
   alias(key);exact(x,['label','directory'],['directory']);const output=absolute(resolve(base,x.directory));await privateDirectory(dirname(output));
   need(!inside(directory,output)&&!inside(output,directory),'TRANSPORT_PLANNING_DESTINATION','Receive into a separate declared directory and preserve the original workspace.');
   destinations[key]={label:label(x.label,key),directory:output};
  }
  workspaces[name]={label:label(v.label,name),directory,connectionFile,inputs,destinations};
 }
 const privateFiles=new Set([source.path,...Object.values(workspaces).map(x=>x.connectionFile)]);
 for(const s of Object.values(workspaces))for(const i of Object.values(s.inputs))need(!privateFiles.has(i.file),'TRANSPORT_PLANNING_SECRET_INPUT','Host and connection files are not ordinary inputs.');
 return{configuration:source.path,sha256:source.sha256,workspaces};
}
const request=v=>{need(typeof v==='string'&&v.length>=1&&v.length<=150,'TRANSPORT_PLANNING_REQUEST','Use the original stable request ID, at most150characters.');return v;};
const recordId=v=>{need(typeof v==='string'&&v.length>=1&&v.length<=500,'TRANSPORT_PLANNING_RECORD','Select the complete original record identifier.');return v;};
const utf8=bytes=>{try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{need(false,'TRANSPORT_PLANNING_UTF8','Use the complete valid UTF-8 original source.',400);}};
function artifactSelection(a){
 need(ARTIFACT_KINDS.includes(a.kind),'TRANSPORT_PLANNING_ARTIFACT','Choose an original artifact.',404);
 if(['source','document','edition'].includes(a.kind))recordId(a.recordId);
 else need(a.recordId===undefined,'TRANSPORT_PLANNING_ARTIFACT','This whole artifact does not take a record ID.');
 need(a.kind==='edition'||a.format===undefined,'TRANSPORT_PLANNING_ARTIFACT','A format selects an original published edition only.');
 const id=a.recordId===undefined?'':encodeURIComponent(a.recordId);
 if(a.kind==='source')return{route:'/api/source/'+id,query:{}};
 if(a.kind==='document')return{route:'/api/document/'+id+'/file',query:{}};
 if(a.kind==='edition'){const format=a.format??'zip';need(['zip','html','json','csv'].includes(format),'TRANSPORT_PLANNING_FORMAT','Select an original edition format.');return{route:'/api/edition/'+id+'.'+format,query:{}};}
 return{route:{guide:'/api/guide',recovery:'/api/recovery.zip',application:'/api/application.zip'}[a.kind],query:{}};
}
export class MerchantTransportPlanningWorkspaces{
 #config;#clients=new Map();#files;#requests;#tail=Promise.resolve();#pending=new Set();#closing=false;#closed=null;
 constructor(config){this.#config=config;this.#files=new TransportPlanningFiles(config.exportsDirectory,{authorize:(name,selection)=>this.#authorize(name,selection)});this.#requests=new TransportPlanningRequests(this.#files);}
 get summary(){return{configured:Boolean(this.#config.transportPlanning),connected:[...this.#clients.keys()],pending:this.#pending.size,closing:this.#closing,retainedReads:this.#files.summary};}
 #scope(name){const s=this.#config.transportPlanning?.workspaces?.[alias(name)];need(s,'TRANSPORT_PLANNING_NOT_CONFIGURED','Choose a declared transportation workspace.',404);return{...s,alias:name};}
 #client(s){const c=this.#clients.get(s.alias);need(c,'TRANSPORT_PLANNING_DISCONNECTED','Connect the original managed transportation application.',409);return c;}
 #authority(s){const c=this.#client(s).connection;need(c.directory===s.directory&&typeof c.workspaceId==='string'&&typeof c.applicationDirectory==='string'&&typeof c.sourceManifestSha256==='string'&&typeof c.actor==='string'&&c.actor.length>0,'TRANSPORT_PLANNING_AUTHORITY','Bind the original workspace and full private source.',409);return{directory:c.directory,workspaceId:c.workspaceId,applicationDirectory:c.applicationDirectory,sourceManifestSha256:c.sourceManifestSha256,actor:c.actor};}
 async #access(s){await this.#client(s).info();return this.#authority(s);}
 async #authorize(name,selection){const s=this.#scope(name);need(selection?.access&&canonical(selection.access)===canonical(this.#authority(s)),'TRANSPORT_PLANNING_RETAINED_AUTHORITY','This retained file belongs to another original workspace or source.',403);await this.#client(s).info();}
 #view(s){const c=this.#clients.get(s.alias);return{workspace:s.alias,label:s.label,state:c?'CONNECTED':'DISCONNECTED',...(c?c.connection:{}),
  inputs:Object.entries(s.inputs).map(([sourceInput,x])=>({sourceInput,label:x.label,sha256:x.sha256,bytes:x.bytes,filename:x.filename,mediaType:x.mediaType})),
  destinations:Object.entries(s.destinations).map(([destination,x])=>({destination,label:x.label}))};}
 async #secrets(){
  const result=new Set([this.#config.transportPlanning.configuration]);
  for(const s of Object.values(this.#config.transportPlanning.workspaces)){
   result.add(s.connectionFile);
   try{const c=await readConnection(s.connectionFile,{directory:s.directory}),v=c.value;
    for(const key of ['capabilityFile','configurationFile','sourceManifestFile'])if(v[key])result.add(absolute(v[key]));
    if(v.configurationFile){const launch=await readLaunchConfiguration(v.configurationFile);if(launch.value.sourceManifestFile)result.add(absolute(launch.value.sourceManifestFile));}
   }catch(e){if(e.code!=='ENOENT')throw e;}
  }
  return result;
 }
 async #input(s,name,expected){
  const x=s.inputs[alias(name)];need(x,'TRANSPORT_PLANNING_INPUT','Choose a declared complete source input.',404);need(!expected||digest(expected)===x.sha256,'TRANSPORT_PLANNING_INPUT_SELECTION','Keep the original input hash.',409);
  need(!(await this.#secrets()).has(x.file),'TRANSPORT_PLANNING_SECRET_INPUT','Private capabilities and service-token files cannot become retained input artifacts.',403);
  const access=await this.#access(s);
  const retained=await this.#files.capture(s.alias,{access,operation:'declared-input',sourceInput:name,sourceSha256:x.sha256},async sink=>{
   const fd=await open(x.file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const before=await fd.stat();need(before.isFile()&&before.size===x.bytes&&await realpath(x.file)===x.file,'TRANSPORT_PLANNING_INPUT_CHANGED','The complete selected input changed.',409);
    const h=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let offset=0;
    while(offset<before.size){const r=await fd.read(buffer,0,Math.min(buffer.length,before.size-offset),offset);need(r.bytesRead>0,'TRANSPORT_PLANNING_INPUT_TRUNCATED','The complete source ended early.',409);const b=buffer.subarray(0,r.bytesRead);h.update(b);await sink(b);offset+=b.length;}
    need(same(before,await fd.stat()),'TRANSPORT_PLANNING_INPUT_CHANGED','The original source changed while copied.',409);
    return{bytes:offset,sha256:h.digest('hex'),filename:x.filename,mediaType:x.mediaType};
   }finally{await fd.close();}
  },x);
  const scoped=await this.#files.directory(s.alias),content=join(scoped,retained.sha256+'.content');
  const inputs=join(scoped,'inputs');await privateDirectory(inputs,{create:true});
  const selected=join(inputs,retained.sha256);await privateDirectory(selected,{create:true});
  const path=join(selected,x.filename);await verifyClosed(content,retained);
  try{await link(content,path);const parent=await open(selected,'r');try{await parent.sync();}finally{await parent.close();}}
  catch(e){if(e.code!=='EEXIST')throw e;}
  await verifyClosed(path,retained);
  return{...retained,path};
 }
 async #response(s,response,operation,extra={}){
  const body=response.body??(Buffer.isBuffer(response.bytes)?response.bytes:null);
  need(Buffer.isBuffer(body)&&body.length===(typeof response.bytes==='number'?response.bytes:body.length)&&hash(body)===response.sha256,'TRANSPORT_PLANNING_RESPONSE','Retain the exact original response body and complete digest.',409);
  const access=this.#authority(s),retained=await this.#files.retain(s.alias,{...response,bytes:body},{access,operation,...extra});
  return{...retained,ok:response.ok,status:response.status,originalOutcome:'HTTP_OBSERVED'};
 }
 async #invoke(s,operation,requestId,intent,send,{safeReplay=true,source=null}={}){
  const access=await this.#access(s),record=await this.#requests.prepare(s.alias,access,operation,requestId,intent,source);
  const old=await this.#requests.observations(record);
  if(old.length){const selected=old.find(row=>row.ok===true&&row.responseFile)??(!safeReplay?old.find(row=>row.responseFile):null);if(selected?.responseFile)return{...selected.responseFile,workspace:s.alias,requestId,state:'HTTP_OBSERVED',ok:selected.ok,status:selected.originalStatus,replayed:true,observations:old,originalRequest:record.originalRequest};}
  const dispatch=await this.#requests.begin(record,{operation,selection:intent});
  if(!dispatch.fresh&&!safeReplay)return{workspace:s.alias,requestId,state:'DISPATCH_UNCERTAIN',originalRequest:record.originalRequest,dispatch:dispatch.value,
   recovery:'Inspect the exact original receiving destination and retained archive. A missing response does not establish that receiving failed. Preserve this request and the published destination; do not select a replacement.'};
  const response=await send(),retained=await this.#response(s,response,operation,{requestId,requestKey:record.key});
  await this.#requests.confirm(record,response,retained);
  return{...retained,requestId,originalRequest:record.originalRequest,replayed:!dispatch.fresh};
 }

 async #destination(s,name){
  const d=s.destinations[alias(name)];need(d,'TRANSPORT_PLANNING_DESTINATION','Choose a declared independent receiving destination.',404);
  const source=this.#client(s).connection.applicationDirectory;need(!inside(source,d.directory)&&!inside(d.directory,source),'TRANSPORT_PLANNING_DESTINATION','Keep original source and received output separate.');
  await privateDirectory(dirname(d.directory));return d.directory;
 }
 async #mutation(s,command,requestId,payload,source=null){
  request(requestId);need(COMMANDS.includes(command)&&plain(payload),'TRANSPORT_PLANNING_COMMAND','Select one original command and its complete args.');
  const actor=this.#authority(s).actor,body={request:{id:requestId,command,args:payload},actor};
  need(Buffer.byteLength(JSON.stringify(body))<=MAX_JSON,'TRANSPORT_PLANNING_COMMAND_SIZE','The full original command exceeds the96MiB HTTP bound.',413);
  return this.#invoke(s,'command',requestId,{route:'/api/command',body},()=>this.#client(s).invoke('/api/command',body),{safeReplay:true,source});
 }
 async #preview(s,a,source=null){
  need(SOURCE_KINDS.includes(a.kind)&&typeof a.csv==='string'&&Buffer.byteLength(a.csv)<=32*1024*1024,'TRANSPORT_PLANNING_PREVIEW','Choose the original CSV kind and complete UTF-8 text up to32MiB.');
  for(const key of ['mapping','defaults'])need(a[key]===undefined||plain(a[key]),'TRANSPORT_PLANNING_MAPPING','Keep mapping and defaults as original objects.');
  const body={csv:a.csv,kind:a.kind,mapping:a.mapping??{},defaults:a.defaults??{}};
  need(Buffer.byteLength(JSON.stringify(body))<=MAX_JSON,'TRANSPORT_PLANNING_PREVIEW_SIZE','The whole original preview request exceeds96MiB.',413);
  return this.#response(s,await this.#client(s).invoke('/api/preview',body),'preview',source?{sourceSha256:source.sha256,sourceInputFileId:source.fileId}:{});
 }
 async #action(s,suffix,a){
  if(suffix==='command')return this.#mutation(s,a.command,a.requestId,a.payload);
  const source=await this.#input(s,a.sourceInput,a.expectedSourceSha256);
  if(suffix==='receive'){
   need(['application','recovery'].includes(a.kind),'TRANSPORT_PLANNING_RECEIVE_KIND','Choose the exact original archive reader.');
   const destination=await this.#destination(s,a.destination),intent={kind:a.kind,archivePath:source.path,destination};
   return this.#invoke(s,'receive',request(a.requestId),intent,()=>this.#client(s).receiveWorkspace(intent),{safeReplay:false,source});
  }
  if(suffix==='command_input'){
   need(source.bytes<=MAX_JSON,'TRANSPORT_PLANNING_COMMAND_SIZE','The complete command input exceeds96MiB.',413);
   const command=(await readJson(source.path,MAX_JSON)).value;
   exact(command,['id','command','args'],['command']);
   if(Object.hasOwn(command,'id'))need(command.id===a.requestId,'TRANSPORT_PLANNING_REQUEST','Keep the original selected input request ID.',409);
   return this.#mutation(s,command.command,a.requestId,command.args??{},source);
  }
  const maximum=suffix==='add_document'?64*1024*1024:32*1024*1024;
  need(source.bytes<=maximum,'TRANSPORT_PLANNING_INPUT_SIZE','The complete original source exceeds its native byte bound.',413);
  const raw=(await readFile(source.path,maximum)).bytes;need(raw.length===source.bytes&&hash(raw)===source.sha256,'TRANSPORT_PLANNING_INPUT_CHANGED','The retained input changed.',409);
  if(suffix==='preview_input')return this.#preview(s,{csv:utf8(raw),kind:a.kind,mapping:a.mapping,defaults:a.defaults},source);
  need(plain(a.payload),'TRANSPORT_PLANNING_COMMAND','Supply the complete original command args.');
  if(suffix==='import_csv'){
   need(!Object.hasOwn(a.payload,'csv'),'TRANSPORT_PLANNING_INPUT','CSV comes from the selected complete host file.');
   return this.#mutation(s,'dataset_import',a.requestId,{...a.payload,csv:utf8(raw)},source);
  }
  need(suffix==='add_document','TRANSPORT_PLANNING_COMMAND','Unknown original file operation.');
  exact(a.payload,['title','url','filename','mime','retrieved_at','locator'],['title']);
  need((a.payload.filename===undefined||a.payload.filename===source.filename)&&(a.payload.mime===undefined||a.payload.mime===source.mediaType),'TRANSPORT_PLANNING_DOCUMENT_SELECTION','Keep the host-declared original filename and MIME.',409);
  return this.#mutation(s,'document_add',a.requestId,{...a.payload,filename:source.filename,mime:source.mediaType,base64:raw.toString('base64')},source);
 }
 async #artifact(s,a){
  const selection=artifactSelection(a),access=await this.#access(s);
  let rejected;
  try{return await this.#files.capture(s.alias,{access,operation:'original-artifact',kind:a.kind,...selection},
   async sink=>{const response=await this.#client(s).download(selection.route,{query:selection.query,sink});
    if(response.ok===false){rejected=await this.#response(s,response,'artifact-error',{kind:a.kind,...selection});throw new Error('Original artifact request returned an HTTP error.');}
    return response;},
   {sha256:a.expectedSha256,bytes:a.expectedBytes,filename:a.filename});}
  catch(error){if(rejected)return rejected;throw error;}
 }
 async #call(name,args){
  const schema=schemas.get(name);need(schema,'TRANSPORT_PLANNING_TOOL','Choose an installed Transport Planning tool.',404);exact(args,Object.keys(schema.properties),schema.required);
  const suffix=name.slice('merchant_transport_planning_'.length);
  if(suffix==='connections'&&!args.workspace)return{workspaces:Object.keys(this.#config.transportPlanning?.workspaces??{}).map(n=>this.#view(this.#scope(n)))};
  const s=this.#scope(args.workspace);
  if(suffix==='connections')return this.#view(s);
  if(suffix==='connect'){
   if(this.#clients.has(s.alias)){await this.#client(s).info();if(args.expectedLaunchId)need(this.#client(s).connection.launchId===args.expectedLaunchId,'TRANSPORT_PLANNING_LAUNCH','The selected original launch changed.',409);return this.#view(s);}
   const client=await TransportPlanningClient.connect(s.connectionFile,{directory:s.directory,expectedLaunchId:args.expectedLaunchId});this.#clients.set(s.alias,client);return this.#view(s);
  }
  if(suffix==='disconnect'){const c=this.#client(s);need(c.connection.launchId===args.launchId,'TRANSPORT_PLANNING_LAUNCH','Disconnect only the selected attachment.',409);await c.close();await this.#files.disconnect(s.alias);this.#clients.delete(s.alias);return this.#view(s);}
  if(suffix==='info')return this.#response(s,await this.#client(s).info(),suffix);
  if(suffix==='browser'){await this.#access(s);return this.#client(s).browser();}
  if(suffix==='state')return this.#response(s,await this.#client(s).read('/api/workspace',{}),suffix);
  if(suffix==='catalogue')return this.#response(s,await this.#client(s).read('/api/catalogue',{}),suffix);
  if(suffix==='record'){
   recordId(args.recordId);const offset=args.offset??0,limit=args.limit??1000;
   integer(offset,'original row offset');integer(limit,'original row page',1000,1);
   return this.#response(s,await this.#client(s).read('/api/record/'+encodeURIComponent(args.recordId),{offset,limit}),'record',{recordId:args.recordId,offset,limit});
  }
  if(suffix==='preview')return this.#preview(s,args);
  if(['command','command_input','preview_input','import_csv','add_document','receive'].includes(suffix))return this.#action(s,suffix,args);
  if(suffix==='artifact')return this.#artifact(s,args);
  if(suffix==='files'){await this.#access(s);return this.#files.list(s.alias,args,this.#authority(s));}
  if(suffix==='file')return this.#files.read(s.alias,args);
  if(suffix==='file_release')return this.#files.release(s.alias,args.readId);
  if(suffix==='file_inspect')return this.#files.inspect(s.alias,args);
  if(suffix==='requests'){await this.#access(s);return this.#requests.list(s.alias,args,this.#authority(s));}
  need(false,'TRANSPORT_PLANNING_TOOL','Unknown installed operation.',404);
 }
 call(name,args={}){
  need(!this.#closing,'TRANSPORT_PLANNING_CLOSING','Wait for the original attached client to close.',409);
  const run=this.#tail.then(()=>this.#call(name,args));this.#tail=run.catch(()=>{});this.#pending.add(run);run.finally(()=>this.#pending.delete(run)).catch(()=>{});return run;
 }
 close(){
  if(this.#closed)return this.#closed;this.#closing=true;
  this.#closed=(async()=>{await Promise.allSettled([...this.#pending]);for(const[name,c]of this.#clients){await c.close();await this.#files.disconnect(name);this.#clients.delete(name);}await this.#files.close();})();
  this.#closed=this.#closed.catch(e=>{this.#closed=null;throw e;});return this.#closed;
 }
}
