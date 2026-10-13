// MIT. Original Econdb APIs, original workspace lock/journal and maintained file receiver.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,link,unlink,rename} from 'node:fs/promises';
import {resolve,dirname,join,sep,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {operatorStatus,operatorCommand,originalRequest,operatorFiles,operatorFile,
 exportOperator,inspectOperatorTransfer,receiveOperator,preserveFailedCommand,MAX_BODY}
 from '../../stellar/scf_2026/sf49_data_commissioning/econdb/operator.mjs';
import {privateDirectory,withPrivateLock} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/routescan/quota.mjs';
import {RetainedFileReads} from './retained-file-reads.mjs';
import {validateArguments} from './catalog/econdb-workspace.mjs';
import {writePrivate,line} from './host-files.mjs';
export const ECONDB_CONNECTION_SCHEMA='stellar-forge.econdb-workspace-connections.v1';
export const HANDOVER_MANIFEST='econdb-merchant-handover.json';
export const HANDOVER_SCHEMA='stellar-forge.econdb-handover.v1';
const HASH=/^[0-9a-f]{64}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})};
const need=(ok,message,code='ECONDB_MCP_INVALID')=>{if(!ok)fail(code,message)};
const hash=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>JSON.stringify(x,(_,v)=>plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const stamp=s=>['dev','ino','size','mtimeNs','ctimeNs'].map(k=>String(s[k])).join(':');
const mime=n=>n.endsWith('.html')?'text/html; charset=utf-8':n.endsWith('.csv')?'text/csv; charset=utf-8':n.endsWith('.json')?'application/json; charset=utf-8':'application/octet-stream';
function exact(x,keys,required=keys){need(plain(x)&&Object.keys(x).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(x,k)),'Use complete documented fields.');}
function member(name){need(typeof name==='string'&&name.length<=4096&&!name.includes('\\')&&!name.includes('\0')&&!name.startsWith('/')&&name.split('/').every(x=>x&&x!=='.'&&x!=='..'),'Select a safe original member.');return name;}
function path(value,base){need(typeof value==='string'&&value.length>0&&!value.includes('\0'),'Declare an original host path.');return resolve(base,value);}
function aliases(value){need(plain(value),'Use an alias map.');for(const k of Object.keys(value))need(ALIAS.test(k),'Use lower-case host aliases.');return value;}
function page(rows,args){const offset=args.offset??0,limit=args.limit??50;return{total:rows.length,offset,items:rows.slice(offset,offset+limit),nextOffset:offset+limit<rows.length?offset+limit:null};}
async function regular(file,{consume=false,maximum=MAX_BODY,privateOnly=false}={}){
 need(await realpath(file)===file,'Original path resolves through a changed alias.','ECONDB_MCP_FILE_CHANGED');
 const f=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const a=await f.stat({bigint:true});need(a.isFile()&&a.nlink===1n&&a.size<=BigInt(maximum)&&(!privateOnly||(a.mode&0o077n)===0n&&a.uid===BigInt(process.getuid())),'Select an original owned regular file within its declared limit.');
  const h=createHash('sha256'),chunks=[];let bytes=0;
  for await(const b of f.createReadStream({autoClose:false})){bytes+=b.length;need(bytes<=maximum,'Original file exceeds its native limit.');h.update(b);if(consume)chunks.push(b);}
  const z=await f.stat({bigint:true});need(stamp(a)===stamp(z)&&BigInt(bytes)===z.size,'Original file changed while reading.','ECONDB_MCP_FILE_CHANGED');
  return{path:file,bytes,sha256:h.digest('hex'),fileIdentity:stamp(z),...(consume?{body:Buffer.concat(chunks,bytes)}:{})};
 }finally{await f.close()}
}
function parse(b){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b));}catch{fail('ECONDB_MCP_INVALID_JSON','Use the complete original UTF-8 JSON file.');}}
async function putExact(file,b){
 try{const old=await regular(file,{maximum:b.length});need(old.bytes===b.length&&old.sha256===hash(b),'Existing retained completion differs.','ECONDB_MCP_FILE_CHANGED');return;}catch(e){if(e.code!=='ENOENT')throw e;}
 const temporary=join(dirname(file),'.econdb-writing-'+randomUUID()),f=await open(temporary,'wx',0o600);
 try{await f.writeFile(b);await f.sync()}finally{await f.close()}
 try{await link(temporary,file);const d=await open(dirname(file),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await d.sync()}finally{await d.close()}}
 catch(e){if(e.code!=='EEXIST')throw e;const old=await regular(file,{maximum:b.length});need(old.bytes===b.length&&old.sha256===hash(b),'Concurrent retained completion differs.');}
 finally{await unlink(temporary).catch(()=>{})}
}
function requestView(r){return{id:r.id,action:r.action,expectedRevision:r.expectedRevision,inputKeys:Object.keys(r.input??{})};}
export async function readEcondbWorkspaceConfiguration(file){
 file=resolve(file);const raw=parse((await regular(file,{consume:true,maximum:1024*1024,privateOnly:true})).body);
 exact(raw,['schema','workspaces']);need(raw.schema===ECONDB_CONNECTION_SCHEMA,'Select the original Econdb connection schema.');
 const base=dirname(file),workspaces=Object.create(null),allRoots=[];
 for(const [alias,e]of Object.entries(aliases(raw.workspaces))){
  exact(e,['label','directory','workspaceId','inputs','buyerInboxes','exportsDirectory','destinations'],['directory','workspaceId','exportsDirectory']);
  need(UUID.test(e.workspaceId),'Bind each alias to its original Econdb workspace UUID.');
  const root=path(e.directory,base),exportsDirectory=path(e.exportsDirectory,base),inputs=Object.create(null),destinations=Object.create(null);
  const label=e.label??alias;need(typeof label==='string'&&label.trim()&&label.length<=240,'Use a short workspace label.');
  for(const [id,v]of Object.entries(aliases(e.inputs??{})))inputs[id]=path(v,base);
  for(const [id,v]of Object.entries(aliases(e.destinations??{})))destinations[id]=path(v,base);
  need(Array.isArray(e.buyerInboxes??[]),'Declare existing buyer inboxes as an array.');
  const buyerInboxes=(e.buyerInboxes??[]).map(v=>path(v,base));
  workspaces[alias]={label,directory:root,workspaceId:e.workspaceId,inputs,buyerInboxes,exportsDirectory,destinations};allRoots.push(root);
 }
 need(Object.keys(workspaces).length>0,'Declare at least one original workspace.');
 for(const e of Object.values(workspaces)){
  const st=await lstat(e.exportsDirectory);need(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&await realpath(e.exportsDirectory)===e.exportsDirectory,'Use existing private canonical handover storage.');
  for(const root of allRoots)need(e.exportsDirectory!==root&&!e.exportsDirectory.startsWith(root+sep)&&!root.startsWith(e.exportsDirectory+sep),'Keep transfer storage separate from every configured workspace.');
  for(const target of Object.values(e.destinations))for(const root of [...allRoots,e.exportsDirectory])need(target!==root&&!target.startsWith(root+sep)&&!root.startsWith(target+sep),'Receive into an independent host-declared destination.');
 }
 return{schema:ECONDB_CONNECTION_SCHEMA,workspaces};
}
async function checkedRequest(e,id){
 const r=await originalRequest(e.directory,id),s=await operatorStatus(e.directory),row=s.records.find(x=>x.id===id)??(s.pending?.id===id?s.pending:null);
 need(row&&hash(canonical(r))===row.requestSha256,'Original request no longer matches its native receipt.');
 const f=await regular(join(e.directory,'operations',id,'request.json'));
 return{request:r,row,status:s,file:f};
}
async function input(e,alias,expectedSha256){
 const file=e.inputs[alias];need(file,'Select a host-declared complete command-file alias.');
 const source=await regular(file,{consume:true,privateOnly:true}),request=parse(source.body);
 if(expectedSha256!==undefined)need(source.sha256===expectedSha256,'Original command file differs from the reviewed SHA256.','ECONDB_MCP_INPUT_CHANGED');
 exact(request,['id','expectedRevision','action','input']);need(UUID.test(request.id)&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0&&plain(request.input),'Use a complete original operator command.');
 if(request.action==='buyer-export'){
  const inbox=request.input.inboxDirectory;
  need(typeof inbox==='string'&&e.buyerInboxes.includes(inbox),'Select an existing inbox declared by this host; other local paths cannot be read.');
  need(await realpath(inbox)===inbox,'Original buyer inbox path changed.');
 }
 return{source,request};
}
function boundManifest(m,workspaceId,exportId){
 exact(m,['schema','exportId','workspaceId','revision','transferSha256','files']);
 need(m.schema===HANDOVER_SCHEMA&&m.workspaceId===workspaceId&&m.exportId===exportId&&Number.isSafeInteger(m.revision)&&m.revision>=0&&HASH.test(m.transferSha256)&&Array.isArray(m.files),'Retained handover identity differs.');
 const seen=new Set();let total=0;
 for(const f of m.files){exact(f,['name','bytes','sha256']);member(f.name);need(f.name==='operator-transfer.json'||f.name.startsWith('workspace/'),'Unexpected handover member.');
  need(!seen.has(f.name)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=8*1024*1024*1024&&HASH.test(f.sha256),'Invalid original handover member.');seen.add(f.name);total+=f.bytes;need(Number.isSafeInteger(total),'Handover byte count exceeds safe integer range.');
 }need(seen.has('operator-transfer.json'),'Original transfer manifest is absent.');return m;
}
export class MerchantEcondbWorkspaces{
 #config;#reads=new RetainedFileReads({errorPrefix:'ECONDB_MCP',maxImmutableFileBytes:8*1024*1024*1024});#closing=false;#active=new Set();#close=null;
 constructor(config){this.#config=config.econdbWorkspaces;need(this.#config?.schema===ECONDB_CONNECTION_SCHEMA,'Attach a configured original Econdb workspace.');}
 get summary(){return{configured:true,workspaces:Object.entries(this.#config.workspaces).map(([workspace,e])=>({workspace,label:e.label,workspaceId:e.workspaceId})),fileReads:this.#reads.summary};}
 #definition(a){const e=this.#config.workspaces[a.workspace];need(e&&e.workspaceId===a.workspaceId,'Select a configured original workspace ID.','ECONDB_MCP_WORKSPACE_CHANGED');return e;}
 async #workspace(a){const e=this.#definition(a),s=await operatorStatus(e.directory);need(s.workspace.id===e.workspaceId,'The configured path belongs to another original workspace.','ECONDB_MCP_WORKSPACE_CHANGED');return{e,s};}
 #scope(a){return a.workspace+':'+a.workspaceId;}
 #exportPath(e,id){return join(e.exportsDirectory,id);}
 async #handover(e,id,{full=false}={}){
  const root=this.#exportPath(e,id),metadata=await regular(join(root,HANDOVER_MANIFEST),{consume:true,maximum:64*1024*1024});
  const manifest=boundManifest(parse(metadata.body),e.workspaceId,id),transfer=await regular(join(root,'operator-transfer.json'),{consume:true,maximum:16*1024*1024});
  need(transfer.sha256===manifest.transferSha256,'Original transfer manifest changed.','ECONDB_MCP_FILE_CHANGED');
  const original=parse(transfer.body);need(original.workspaceId===manifest.workspaceId&&original.revision===manifest.revision&&Array.isArray(original.files),'Original transfer identity differs.');
  const expected=[{name:'operator-transfer.json',bytes:transfer.bytes,sha256:transfer.sha256},...original.files.map(f=>({name:'workspace/'+member(f.path),bytes:f.bytes,sha256:f.sha256}))];
  need(canonical(expected)===canonical(manifest.files),'Handover inventory differs from complete original workspace.');
  if(full)await inspectOperatorTransfer(root);return{root,metadata,manifest};
 }
 async #read(a,key,original){return this.#reads.read({scope:this.#scope(a),key,kind:'econdb-original',expectedSha256:a.expectedSha256,readId:a.readId,offset:a.offset,limit:a.limit,
  load:async()=>{const f=await original();need(f.sha256===a.expectedSha256,'Original selected file SHA256 changed.','ECONDB_MCP_FILE_CHANGED');
   const h=await open(f.path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
   try{const s=await h.stat({bigint:true});need(stamp(s)===f.fileIdentity&&s.isFile()&&s.nlink===1n,'Original opened file changed.');return{readonlyFileHandle:h,bytes:f.bytes,sha256:f.sha256,name:f.name??basename(f.path),type:mime(f.name??f.path)};}catch(e){await h.close();throw e;}
  }});}
 async #call(name,a){
  if(name==='merchant_econdb_workspaces')return this.summary;
  const suffix=name.slice('merchant_econdb_'.length),e=this.#definition(a);
  if(suffix==='file_release'||suffix==='handover_file_release'){await this.#reads.release(this.#scope(a),a.readId);return{released:true,readId:a.readId};}
  // Historic exports remain downloadable even when the source workspace advances.
  if(['handover_manifest','handover_file','receive'].includes(suffix)){
   const h=await this.#handover(e,a.exportId,{full:suffix==='receive'});
   if(suffix==='handover_manifest')return{state:'MANIFEST_RETAINED',exportId:a.exportId,workspaceId:e.workspaceId,revision:h.manifest.revision,files:h.manifest.files.length,manifestFile:{name:HANDOVER_MANIFEST,bytes:h.metadata.bytes,sha256:h.metadata.sha256}};
   need(h.metadata.sha256===a.expectedManifestSha256,'The handover manifest differs from the selected original.','ECONDB_MCP_FILE_CHANGED');
   if(suffix==='receive'){const target=e.destinations[a.destination];need(target,'Choose a host-declared independent receiving destination.');
    const result=await withPrivateLock(e.exportsDirectory,'econdb-receive.lock',()=>receiveOperator({directory:h.root,destination:target}));
    return{workspace:a.workspace,destination:a.destination,workspaceId:result.status.workspace.id,revision:result.status.revision,resumed:result.resumed,records:result.status.records.length,manifestSha256:h.metadata.sha256};
   }
   const f=a.file===HANDOVER_MANIFEST?{name:HANDOVER_MANIFEST,bytes:h.metadata.bytes,sha256:h.metadata.sha256}:h.manifest.files.find(f=>f.name===a.file);
   need(f&&f.sha256===a.expectedSha256,'Choose an exact original handover member and hash.');
   const result=await this.#read(a,'handover:'+a.exportId+':'+f.name,async()=>({...await regular(join(h.root,f.name),{maximum:8*1024*1024*1024}),name:f.name}));
   need(result.file.bytes===f.bytes,'Original file size differs from handover manifest.');return{...result,exportId:a.exportId,manifestSha256:h.metadata.sha256};
  }
  const{s}=await this.#workspace(a);
  if(suffix==='status'){const{records,...status}=s;return{workspace:a.workspace,...status,records:page(records,a)};}
  if(suffix==='inputs')return{workspace:a.workspace,inputs:Object.keys(e.inputs),destinations:Object.keys(e.destinations),buyerInboxCount:e.buyerInboxes.length};
  if(suffix==='input_inspect'||suffix==='command'){
   const selected=await input(e,a.input,a.expectedSha256);
   if(suffix==='input_inspect')return{workspace:a.workspace,input:a.input,bytes:selected.source.bytes,sha256:selected.source.sha256,request:requestView(selected.request)};
   return{workspace:a.workspace,workspaceId:e.workspaceId,inputSha256:selected.source.sha256,...await operatorCommand({directory:e.directory,request:selected.request})};
  }
  if(suffix==='request_file'){
   need(s.records.some(r=>r.id===a.id)||s.pending?.id===a.id,'Select an original saved or pending request.');
   return this.#read(a,'request:'+a.id,async()=>({...await regular(join(e.directory,'operations',a.id,'request.json')),name:'request.json'}));
  }
  if(suffix==='request'){
   const selected=await checkedRequest(e,a.id);
   return{workspace:a.workspace,workspaceId:e.workspaceId,request:requestView(selected.request),state:selected.row.revision===undefined?'pending':'recorded',receipt:selected.row,requestFile:{name:'request.json',bytes:selected.file.bytes,sha256:selected.file.sha256}};
  }
  if(suffix==='preserve_failed')return{workspace:a.workspace,...await preserveFailedCommand({directory:e.directory,id:a.id,expectedRevision:a.expectedRevision,note:a.note})};
  if(suffix==='files'){
   const listed=await operatorFiles(e.directory,a.id),p=page(listed.files,a);
   const files=[];for(const f of p.items){const original=await operatorFile(e.directory,a.id,f.path);files.push({name:f.path,bytes:original.bytes,sha256:original.sha256});}
   return{workspace:a.workspace,record:listed.record,...p,items:files};
  }
  if(suffix==='file_read')return this.#read(a,'artifact:'+a.id+':'+a.file,async()=>{
   const f=await operatorFile(e.directory,a.id,a.file),st=await lstat(f.path,{bigint:true});
   need(['dev','ino','mtimeNs','ctimeNs'].every(k=>String(st[k])===f.fileIdentity[k])&&st.size===BigInt(f.bytes),'Original artifact changed.');
   return{...f,fileIdentity:stamp(st),name:a.file};
  });
  if(suffix==='handover'){
   return withPrivateLock(e.exportsDirectory,'econdb-handover.lock',async()=>{
    const result=await exportOperator({directory:e.directory,destination:this.#exportPath(e,a.exportId)});
    need(result.manifest.workspaceId===e.workspaceId,'Original workspace identity changed.');
    const transfer=await regular(join(result.directory,'operator-transfer.json'),{maximum:16*1024*1024});
    const manifest=boundManifest({schema:HANDOVER_SCHEMA,exportId:a.exportId,workspaceId:e.workspaceId,revision:result.manifest.revision,transferSha256:transfer.sha256,
     files:[{name:'operator-transfer.json',bytes:transfer.bytes,sha256:transfer.sha256},...result.manifest.files.map(f=>({name:'workspace/'+f.path,bytes:f.bytes,sha256:f.sha256}))]},e.workspaceId,a.exportId);
    const b=json(manifest);need(b.length<=64*1024*1024,'Complete transfer manifest exceeds the maintained download contract.');
    await putExact(join(result.directory,HANDOVER_MANIFEST),b);
    return{workspace:a.workspace,workspaceId:e.workspaceId,exportId:a.exportId,revision:manifest.revision,files:manifest.files.length,resumed:result.resumed,manifestSha256:hash(b),state:'MANIFEST_RETAINED'};
   });
  }
  fail('TOOL_NOT_FOUND','Choose an advertised original Econdb operation.');
 }
 async call(name,args={}){
  validateArguments(name,args);need(!this.#closing,'The Merchant adapter is closing.','ECONDB_MCP_CLOSING');
  let done;const active=new Promise(r=>{done=r});this.#active.add(active);
  try{return await this.#call(name,args)}finally{this.#active.delete(active);done()}
 }
 close(){
  if(this.#close)return this.#close;this.#closing=true;
  this.#close=(async()=>{await Promise.allSettled([...this.#active]);await this.#reads.close();})().catch(e=>{this.#close=null;throw e});return this.#close;
 }
}
export async function initializeEcondbWorkspaceMerchant({directory,connection,name='Econdb maritime operator'}){
 const root=resolve(directory),selected=resolve(connection);await readEcondbWorkspaceConfiguration(selected);name=line(name,'Merchant name');
 const file=join(root,'merchant-mcp.json');
 try{
  const old=parse((await regular(file,{consume:true,maximum:1024*1024,privateOnly:true})).body);
  need(old.name===name&&old.econdbWorkspaceConnection===selected,'This Merchant host belongs to another configuration.');
  await(await import('./config.mjs')).readMerchantConfig(file);
  return{schema:'stellar-forge.merchant-mcp.v1',configuration:file,state:'INITIALIZED',econdbWorkspacesConfigured:true,resumed:true};
 }catch(e){if(e.code!=='ENOENT')throw e;}
 const stage=root+'.initializing-'+randomUUID();await privateDirectory(dirname(root));await mkdir(stage,{mode:0o700});
 await(await import('../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs')).initReleaseStore(join(stage,'releases'));
 await mkdir(join(stage,'customer-exports'),{mode:0o700});
 await writePrivate(join(stage,'merchant-mcp.json'),{schema:'stellar-forge.merchant-mcp.v1',name,releaseStore:'./releases',exportsDirectory:'./customer-exports',sources:{},econdbWorkspaceConnection:selected});
 await(await import('./config.mjs')).readMerchantConfig(join(stage,'merchant-mcp.json'));
 // Initialization uses an isolated sibling; an interruption cannot publish a partial host.
 try{await lstat(root);fail('ECONDB_MCP_CONFIG_EXISTS','Destination appeared during initialization; preserve both source directories.');}catch(e){if(e.code!=='ENOENT')throw e;}
 await rename(stage,root);const d=await open(dirname(root),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await d.sync()}finally{await d.close()}
 return{schema:'stellar-forge.merchant-mcp.v1',configuration:file,state:'INITIALIZED',econdbWorkspacesConfigured:true,resumed:false};
}
