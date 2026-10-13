// MIT. Installed Econdb operator; original source/project/publication engines remain authoritative.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,readdir,rename,unlink,link,chmod} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {VERSION,CONTRACT_SHA256,selectPeriod,comparePeriods,compareEditions,reportHTML,exportRowsCSV} from './maritime-analysis.mjs';
import {privateDirectory,atomicJson,readPrivateJson,withPrivateLock} from '../../../scf-starforge-20261009/sf30-seller-sdk/routescan/quota.mjs';
import {openEdition,retainEdition,analyzeEdition} from './maritime-native.mjs';
import {buildProject,importProjectWorkspace,verifyProject} from './maritime-project-native.mjs';
import {createPublication,createProjectPublication,inspectPublication,configureMerchant,exportBuyerReturn} from './sf30-publication.mjs';
export const OPERATOR_SCHEMA='econdb.operator-workspace.v1';
export const MAX_BODY=256*1024*1024;
export const ACTIONS=Object.freeze(['receive-source','analyze','project-build','project-import','publication-build','merchant-prepare','buyer-export']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH=/^[0-9a-f]{64}$/;
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(x);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const sha=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(x===null||typeof x!=='object'?x:Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])));
const digest=x=>sha(canonical(x)),json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const fail=(m,code='ECONDB_OPERATOR_INVALID',status=400)=>{throw Object.assign(new Error(m),{code,status})};
const need=(x,m,code,status)=>{if(!x)fail(m,code,status)};
const decode=b=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);
const clone=x=>JSON.parse(JSON.stringify(x));
const moduleRoot=dirname(fileURLToPath(import.meta.url));
const ENGINE_SHA256=sha(await bytes(join(moduleRoot,'maritime-analysis.mjs')));
const ENGINE_NAMES=['maritime-analysis.mjs','maritime-native.mjs','maritime-project-analysis.mjs','maritime-project-native.mjs','maritime-project-workspace.mjs','sf30-publication.mjs'];
async function engineIdentity(){const out={};for(const n of ENGINE_NAMES)out[n]=sha(await bytes(join(moduleRoot,n)));return out;}
function fields(x,names){need(plain(x)&&Object.keys(x).every(k=>names.includes(k)),'Use only the documented input fields: '+names.join(', '));}
function label(x,name,max=500){need(typeof x==='string'&&x.trim()&&x.length<=max&&!x.includes('\0'),'Supply '+name+' within '+max+' characters');return x;}
async function exists(path){try{await lstat(path);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}
async function syncDir(path){const f=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await f.sync()}finally{await f.close()}}
async function bytes(path,max=MAX_BODY){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const a=await file.stat({bigint:true});need(a.isFile()&&a.nlink===1n&&a.size<=BigInt(max),'Expected bounded regular original file');const b=await file.readFile(),z=await file.stat({bigint:true});need(b.length<=max&&a.dev===z.dev&&a.ino===z.ino&&a.size===z.size&&a.mtimeNs===z.mtimeNs&&a.ctimeNs===z.ctimeNs&&BigInt(b.length)===z.size,'Original file changed while reading');return b}finally{await file.close()}
}
async function exact(path,data){
 data=Buffer.isBuffer(data)?data:Buffer.from(data);need(data.length<=MAX_BODY,'Original member exceeds256MiB');
 if(await exists(path)){need((await bytes(path)).equals(data),'An existing original member differs','ECONDB_ORIGINAL_CHANGED',409);return}
 const tmp=join(dirname(path),'.writing-'+randomUUID()),f=await open(tmp,'wx',0o600);
 try{await f.writeFile(data);await f.sync()}finally{await f.close()}
 try{await link(tmp,path);await syncDir(dirname(path))}catch(e){if(e.code!=='EEXIST')throw e;need((await bytes(path)).equals(data),'Concurrent original member differs','ECONDB_ORIGINAL_CHANGED',409)}finally{await unlink(tmp).catch(()=>{})}
}
async function rootDirectory(root){root=resolve(root);const s=await lstat(root);need(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&await realpath(root)===root,'Use the original private canonical workspace directory');return root}
function validateState(s){
 need(s?.schema===OPERATOR_SCHEMA&&UUID.test(s.workspaceId)&&Number.isSafeInteger(s.revision)&&s.revision>=0&&Array.isArray(s.records)&&s.records.length===s.revision&&s.records.length<=10000,'Invalid original operator state');
 const ids=new Set();for(const r of s.records){need(UUID.test(r.id)&&!ids.has(r.id)&&ACTIONS.includes(r.action)&&HASH.test(r.requestSha256)&&r.revision===ids.size+1,'Invalid saved command identity');ids.add(r.id)}
 if(s.pending)need(UUID.test(s.pending.id)&&ACTIONS.includes(s.pending.action)&&HASH.test(s.pending.requestSha256)&&!ids.has(s.pending.id),'Invalid pending command');
 return s;
}
async function readState(root){return validateState(await readPrivateJson(join(root,'state.json'),16*1024*1024))}
async function currentRoot(root){root=await rootDirectory(root);const identity=await readPrivateJson(join(root,'workspace.json'),65536),state=await readState(root);need(identity.schema===OPERATOR_SCHEMA&&identity.id===state.workspaceId,'Workspace identity changed');return{root,identity,state}}
export async function initializeOperator({directory,title='Econdb maritime operator'}={}){
 const root=await privateDirectory(resolve(directory));label(title,'workspace title');
 return withPrivateLock(root,'operator.lock',async()=>{
  if(await exists(join(root,'workspace.json')))return operatorStatus(root);
  const entries=await readdir(root),resuming=await exists(join(root,'initializing.json'));
  const allowed=resuming?['operator.lock','initializing.json','state.json','operations','editions','artifacts','handover']:['operator.lock'];
  need(entries.every(x=>allowed.includes(x)||/^\.write-[0-9a-f-]{36}$/.test(x)),'New operator directory contains unrelated files; preserve them and choose its original workspace');
  const id=randomUUID(),createdAt=new Date().toISOString();
  // The complete pair is installed under a retained initialization directory before the identity appears.
  const pending=join(root,'initializing.json');let identity;
  if(await exists(pending)){identity=await readPrivateJson(pending);need(identity.schema===OPERATOR_SCHEMA&&UUID.test(identity.id)&&identity.title===title,'Retained initialization belongs to another title')}
  else{identity={schema:OPERATOR_SCHEMA,id,title,createdAt,engine:await engineIdentity()};await atomicJson(root,'initializing.json',identity,{exclusive:true})}
  for(const name of ['operations','editions','artifacts','handover']){await privateDirectory(join(root,name));need((await readdir(join(root,name))).length===0,'Unfinished initialization contains other operational data; preserve it');}
  const state={schema:OPERATOR_SCHEMA,workspaceId:identity.id,revision:0,records:[],pending:null};
  if(!await exists(join(root,'state.json')))await atomicJson(root,'state.json',state,{exclusive:true});
  else need(digest(await readState(root))===digest(state),'Unfinished initialization has different state');
  await atomicJson(root,'workspace.json',identity,{exclusive:true});
  await unlink(pending).catch(e=>{if(e.code!=='ENOENT')throw e});await syncDir(root);return operatorStatus(root);
 });
}
export async function operatorStatus(directory){
 const {root,identity,state}=await currentRoot(directory);
 return{schema:OPERATOR_SCHEMA,workspace:identity,revision:state.revision,records:state.records,pending:state.pending,
  capabilities:{actions:ACTIONS,engineMatches:digest(identity.engine)===digest(await engineIdentity()),networkCapture:'original econdb-source capture command',payments:'original SF30 native configuration and version CLI; no purchase dispatched by this workspace'},
  limits:{bodyBytes:MAX_BODY,records:10000,sourceCells:500000,selectedDatasetRows:250000}};
}
function record(s,id,kind){const r=s.records.find(r=>r.id===id);need(r&&(!kind||r.kind===kind),'Select an original saved '+(kind||'record'));return r}
function artifact(root,r){need(r.directory&&r.directory.split('/').every(safe),'Invalid original artifact path');return join(root,r.directory)}
async function source(root,s,id){const r=record(s,id,'source');return{r,opened:await openEdition(artifact(root,r))}}
async function compactResult(root,request,state,op){
 const i=request.input,output=join(root,'artifacts',request.id),now=new Date().toISOString();
 const base={id:request.id,action:request.action,revision:request.expectedRevision+1,requestSha256:digest(request),createdAt:now};
 if(request.action==='receive-source'){
  fields(i,['raw','descriptor']);need(typeof i.raw==='string'&&Buffer.byteLength(i.raw)<=128*1024*1024&&plain(i.descriptor)&&safe(i.descriptor.id),'Supply the complete original UTF-8 source and descriptor');
  const result=await retainEdition({directory:join(root,'editions'),raw:i.raw,descriptor:i.descriptor});
  return{...base,kind:'source',title:i.descriptor.title??i.descriptor.id,directory:'editions/'+i.descriptor.id,sourceId:i.descriptor.id,sourceSha256:i.descriptor.source_sha256,status:result.status,validationError:result.validation_error??null};
 }
 if(request.action==='analyze'){
  fields(i,['sourceId','previousId','selection','before','after','title']);label(i.title,'analysis title');
  const current=await source(root,state,i.sourceId),previous=i.previousId?await source(root,state,i.previousId):null;
  if(!await exists(output))await analyzeEdition({editionDirectory:artifact(root,current.r),previousDirectory:previous?artifact(root,previous.r):null,selection:i.selection,before:i.before??null,after:i.after??null,directory:output});
  await verifyBundle(output);
  const binding=JSON.parse(decode(await bytes(join(output,'analysis-source.json')))),period=selectPeriod(current.opened.edition,i.selection);
  need(Boolean(i.before)===Boolean(i.after),'Supply both comparison periods together');
  const comparison=i.before?comparePeriods(current.opened.edition,i.before,i.after):null,revisions=previous?compareEditions(previous.opened.edition,current.opened.edition,i.selection):null;
  need(binding.engine.sha256===ENGINE_SHA256&&binding.engine.version===VERSION&&binding.engine.contract_sha256===CONTRACT_SHA256&&binding.current.source_sha256===current.opened.descriptor.source_sha256&&digest(binding.selection)===digest(period.selection)&&(!previous?binding.previous===null:binding.previous?.source_sha256===previous.opened.descriptor.source_sha256),'Retained analysis differs from original engine/source/selection');
  const expected={'current-response.json':current.opened.raw,'current-descriptor.json':json(current.opened.descriptor),'edition.json':json(current.opened.edition),'selected-period.json':json(period),'observations.csv':exportRowsCSV(period),'report.html':reportHTML({edition:current.opened.edition,period,comparison,editionComparison:revisions,engine_sha256:ENGINE_SHA256})};
  if(comparison)expected['period-comparison.json']=json(comparison);
  if(revisions){expected['edition-comparison.json']=json(revisions);expected['previous-response.json']=previous.opened.raw;expected['previous-descriptor.json']=json(previous.opened.descriptor)}
  for(const [name,value] of Object.entries(expected))need((await bytes(join(output,name))).equals(Buffer.from(value)),'Retained analysis content differs: '+name);
  const actualNames=(await readdir(output)).sort(),expectedNames=[...Object.keys(expected),'analysis-source.json','manifest.json'].sort();need(digest(actualNames)===digest(expectedNames),'Retained analysis contains different comparison members');
  return{...base,kind:'analysis',title:i.title,directory:'artifacts/'+request.id,sourceRecordId:i.sourceId,previousRecordId:i.previousId??null};
 }
 if(request.action==='project-build'){
  fields(i,['config']);need(plain(i.config)&&Array.isArray(i.config.entries),'Supply the original explicit project');
  const config=clone(i.config);
  for(const entry of config.entries){const c=await source(root,state,entry.current);entry.current=artifact(root,c.r);if(entry.previous){const p=await source(root,state,entry.previous);entry.previous=artifact(root,p.r)}}
  const result=await buildProject({config,baseDirectory:root,directory:output});
  return{...base,kind:'project',title:config.title,directory:'artifacts/'+request.id,inputSha256:result.input_sha256,projectId:config.id};
 }
 if(request.action==='project-import'){
  fields(i,['workspace']);need(typeof i.workspace==='string','Supply the complete saved browser project text');await exact(join(op,'browser-workspace.json'),i.workspace);
  const result=await importProjectWorkspace({workspacePath:join(op,'browser-workspace.json'),directory:output});
  const project=await verifyProject(output,{requireCurrentSource:true});
  return{...base,kind:'project',title:project.config.title,directory:'artifacts/'+request.id,inputSha256:result.input_sha256,projectId:project.config.id};
 }
 if(request.action==='publication-build'){
  fields(i,['projectId','sourceId','selection','editionRoles','name']);label(i.name,'dataset name');
  let result;
  if(i.projectId){need(!i.sourceId&&!i.selection,'Select one complete project or one original source');result=await createProjectPublication({project:artifact(root,record(state,i.projectId,'project')),editionRoles:i.editionRoles,name:i.name,directory:output})}
  else{const s=await source(root,state,i.sourceId);need(i.editionRoles===undefined,'Edition role choice belongs to complete projects');result=await createPublication({rawPath:join(artifact(root,s.r),'response.json'),descriptorPath:join(artifact(root,s.r),'descriptor.json'),from:i.selection?.from,until:i.selection?.until,name:i.name,directory:output})}
  const original=await inspectPublication(output);
  return{...base,kind:'publication',title:i.name,directory:'artifacts/'+request.id,publicationId:original.manifest.publication_id,snapshot:original.manifest.dataset.snapshot,rows:original.manifest.dataset.rowCount,sourceRecordId:i.projectId??i.sourceId};
 }
 if(request.action==='merchant-prepare'){
  fields(i,['publicationId','payment','origin','path','title']);label(i.title,'public terms title');
  const publication=artifact(root,record(state,i.publicationId,'publication'));await privateDirectory(output);
  const target=join(output,'seller.json');
  const temp=join(op,'seller-recomputed-'+randomUUID()+'.json');
  try{await configureMerchant({publication,payment:i.payment,origin:i.origin,path:i.path??'/data',output:temp});await exact(target,await bytes(temp))}finally{await unlink(temp).catch(()=>{})}

  return{...base,kind:'merchant-terms',title:i.title,directory:'artifacts/'+request.id,publicationRecordId:i.publicationId,mode:'CONFIG_GENERATED_NOT_RUNNING'};
 }
 if(request.action==='buyer-export'){
  fields(i,['publicationId','inboxDirectory','intents','title']);label(i.title,'customer return title');need(Array.isArray(i.intents)&&i.intents.length>0,'Choose the original ordered paid/returned request intents');
  need(typeof i.inboxDirectory==='string'&&resolve(i.inboxDirectory)===i.inboxDirectory,'Select the original local buyer inbox explicitly');
  const result=await exportBuyerReturn({publication:artifact(root,record(state,i.publicationId,'publication')),root:i.inboxDirectory,intents:i.intents,destination:output});
  return{...base,kind:'buyer-return',title:i.title,directory:'artifacts/'+request.id,publicationRecordId:i.publicationId,binding:result,mode:'EXISTING_RETURN_EXPORTED_NO_PURCHASE'};
 }
 fail('Unknown original operator action');
}
async function verifyBundle(directory){
 const m=JSON.parse(decode(await bytes(join(directory,'manifest.json'),2*1024*1024)));
 need(m.schema==='econdb.file-bundle.v1'&&Array.isArray(m.files),'Original analysis manifest is absent');
 for(const e of m.files){need(safe(e.name),'Invalid analysis member');const b=await bytes(join(directory,e.name));need(b.length===e.bytes&&sha(b)===e.sha256,'Original analysis member changed: '+e.name)}return m;
}
export async function operatorCommand({directory,request}){
 const root=await rootDirectory(directory);fields(request,['id','expectedRevision','action','input']);
 need(UUID.test(request.id)&&Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0&&ACTIONS.includes(request.action)&&plain(request.input),'Supply an original UUID, revision, action and input');
 need(json(request).length<=MAX_BODY,'Command exceeds256MiB');
 return withPrivateLock(root,'operator.lock',async()=>{
  const state=await readState(root),hash=digest(request),saved=state.records.find(r=>r.id===request.id);
  if(saved){need(saved.requestSha256===hash,'Request UUID already belongs to different original inputs','ECONDB_REQUEST_CONFLICT',409);await verifyRecord(root,saved);return{record:saved,revision:state.revision,replayed:true}}
  need(state.records.length<10000,'This workspace has reached its10000-command capacity. Retain a complete handover before starting a separate workspace.');
  if(state.pending)need(state.pending.id===request.id&&state.pending.requestSha256===hash,'Another original command is pending; resume its UUID and exact input','ECONDB_PENDING',409);
  else if(state.revision!==request.expectedRevision)throw Object.assign(new Error('Workspace changed; review current saved state'),{code:'ECONDB_REVISION_CHANGED',status:409,notStarted:true});
  need(digest((await currentRoot(root)).identity.engine)===digest(await engineIdentity()),'The installed calculation source differs from this workspace. Reopen it with its original source before new commands.','ECONDB_ENGINE_CHANGED',409);
  const op=await privateDirectory(join(root,'operations',request.id));
  await exact(join(op,'request.json'),json(request));
  if(!state.pending){state.pending={id:request.id,action:request.action,requestSha256:hash,startedAt:new Date().toISOString()};await atomicJson(root,'state.json',state)}
  let result;
  try{
   if(await exists(join(op,'result.json')))result=await readPrivateJson(join(op,'result.json'),8*1024*1024);
   else{result=await compactResult(root,request,state,op);await chmod(artifact(root,result),0o700);const inventory=await inventoryUnder(root,result.directory);result.artifactManifest={path:'operations/'+request.id+'/artifact-manifest.json',sha256:digest(inventory)};await exact(join(op,'artifact-manifest.json'),json(inventory));await atomicJson(op,'result.json',result,{exclusive:true})}
   await verifyRecord(root,result);
   need(result.id===request.id&&result.requestSha256===hash&&result.revision===state.revision+1,'Original result differs from its request/revision');
   state.records.push(result);state.revision++;state.pending=null;await atomicJson(root,'state.json',state);
   return{record:result,revision:state.revision,replayed:false};
  }catch(error){await atomicJson(op,'last-error.json',{at:new Date().toISOString(),message:error.message,code:error.code??'ECONDB_OPERATOR',requestSha256:hash});throw error}
 });
}
export async function originalRequest(directory,id){const{root,state}=await currentRoot(directory);need(UUID.test(id)&&(state.pending?.id===id||state.records.some(r=>r.id===id)),'Original request not found');return readPrivateJson(join(root,'operations',id,'request.json'),MAX_BODY)}
async function filesUnder(root,prefix=''){
 const rows=[];for(const d of(await readdir(join(root,prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  need(safe(d.name)||d.name.startsWith('.'),'Invalid retained filename');const name=prefix?prefix+'/'+d.name:d.name;
  if(!prefix&&d.name==='operator.lock')continue;
  if(/^\.write-[0-9a-f-]{36}$/.test(d.name)||/^\.writing-[0-9a-f-]{36}$/.test(d.name))continue;
  const st=await lstat(join(root,name));need(!st.isSymbolicLink(),'Retained workspace contains a symlink');
  if(st.isDirectory())rows.push(...await filesUnder(root,name));else{need(st.isFile()&&st.nlink===1,'Retained workspace contains a nonregular or hard-linked member');rows.push(name)}
 }return rows;
}
function relativeMember(name){need(typeof name==='string'&&!name.includes('\\')&&!name.startsWith('/')&&name.split('/').every(x=>x&&x!=='.'&&x!=='..'),'Unsafe received member');return name}
async function hashFile(file){
 const f=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK),h=createHash('sha256');let length=0;
 try{const a=await f.stat({bigint:true});need(a.isFile()&&a.nlink===1n,'Expected original regular file');for await(const b of f.createReadStream({autoClose:false})){length+=b.length;h.update(b)}const z=await f.stat({bigint:true});need(a.dev===z.dev&&a.ino===z.ino&&a.size===z.size&&a.mtimeNs===z.mtimeNs&&a.ctimeNs===z.ctimeNs&&BigInt(length)===z.size,'Original member changed during transfer');return{bytes:length,sha256:h.digest('hex')}}finally{await f.close()}
}
async function copyMember(from,to,expected){
 await privateDirectory(dirname(to));const old=await hashFile(from);if(expected)need(old.bytes===expected.bytes&&old.sha256===expected.sha256,'Original transferred member differs');
 if(await exists(to)){const r=await hashFile(to);need(r.bytes===old.bytes&&r.sha256===old.sha256,'Existing received member differs');return old}
 const tmp=join(dirname(to),'.writing-'+randomUUID()),input=await open(from,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK),output=await open(tmp,'wx',0o600),h=createHash('sha256');let n=0;
 try{for await(const b of input.createReadStream({autoClose:false})){n+=b.length;h.update(b);await output.writeFile(b)}need(n===old.bytes&&h.digest('hex')===old.sha256,'Source changed while copying');await output.sync()}finally{await input.close();await output.close()}
 try{await link(tmp,to);await syncDir(dirname(to))}finally{await unlink(tmp).catch(()=>{})}return old;
}
/** Export one exact original workspace as a complete manifest-bound directory. No state is omitted. */
export async function exportOperator({directory,destination}){
 const root=await rootDirectory(directory),target=resolve(destination);need(target!==root&&!target.startsWith(root+sep),'Export to a separate new directory');
 return withPrivateLock(root,'operator.lock',async()=>{
  const{identity,state}=await currentRoot(root);need(!state.pending,'Finish the original pending command before a complete handover','ECONDB_PENDING',409);
  const names=await filesUnder(root),rows=[];for(const path of names)rows.push({path,...await hashFile(join(root,path))});
  const binding={schema:'econdb.operator-transfer.v1',workspaceId:identity.id,revision:state.revision,files:rows};
  if(await exists(target)){await inspectOperatorTransfer(target);need(digest(await readPrivateJson(join(target,'operator-transfer.json'),16*1024*1024))===digest(binding),'Existing export belongs to another original edition');return{directory:target,manifest:binding,resumed:true}}
  const stage=target+'.receiving';await privateDirectory(dirname(target));
  if(await exists(stage)){need(digest(await readPrivateJson(join(stage,'transfer-binding.json'),16*1024*1024))===digest(binding),'Existing handover stage has another source edition')}
  else{const init=stage+'.initializing-'+randomUUID();await privateDirectory(init);await atomicJson(init,'transfer-binding.json',binding,{exclusive:true});await rename(init,stage);await syncDir(dirname(stage))}
  for(const row of rows)await copyMember(join(root,row.path),join(stage,'workspace',row.path),row);
  const final=await filesUnder(root);need(digest(final)===digest(names),'Workspace members changed during handover');for(const row of rows){const r=await hashFile(join(root,row.path));need(r.bytes===row.bytes&&r.sha256===row.sha256,'Workspace changed during handover')}
  await exact(join(stage,'operator-transfer.json'),json(binding));await inspectOperatorTransfer(stage);await rename(stage,target);await syncDir(dirname(target));return{directory:target,manifest:binding,resumed:false};
 });
}
export async function inspectOperatorTransfer(directory){
 const root=await rootDirectory(directory),m=await readPrivateJson(join(root,'operator-transfer.json'),16*1024*1024);need(m.schema==='econdb.operator-transfer.v1'&&UUID.test(m.workspaceId)&&Array.isArray(m.files),'Unknown original transfer');
 const seen=new Set();for(const row of m.files){relativeMember(row.path);need(!seen.has(row.path)&&HASH.test(row.sha256)&&Number.isSafeInteger(row.bytes)&&row.bytes>=0,'Invalid transfer member');seen.add(row.path);const got=await hashFile(join(root,'workspace',row.path));need(got.bytes===row.bytes&&got.sha256===row.sha256,'Transferred original differs: '+row.path)}
 const names=await filesUnder(join(root,'workspace'));need(digest([...names].sort())===digest([...seen].sort()),'Transferred file population differs');const status=await operatorStatus(join(root,'workspace'));for(const record of status.records){const request=await readPrivateJson(join(root,'workspace','operations',record.id,'request.json'),MAX_BODY);need(request.id===record.id&&digest(request)===record.requestSha256,'Transferred original request binding differs');await verifyRecord(join(root,'workspace'),record)}need(status.workspace.id===m.workspaceId&&status.revision===m.revision&&!status.pending,'Transferred original state differs');return{directory:root,manifest:m,status};
}
export async function receiveOperator({directory,destination}){
 const checked=await inspectOperatorTransfer(directory),target=resolve(destination);need(target!==checked.directory&&!target.startsWith(checked.directory+sep)&&!checked.directory.startsWith(target+sep),'Receive to an independent directory');
 if(await exists(target)){const status=await operatorStatus(target);need(status.workspace.id===checked.manifest.workspaceId&&status.revision===checked.manifest.revision&&!status.pending,'Destination belongs to another project or has advanced');need(digest((await filesUnder(target)).sort())===digest(checked.manifest.files.map(x=>x.path).sort()),'Existing received file population differs');for(const row of checked.manifest.files){const actual=await hashFile(join(target,row.path));need(actual.bytes===row.bytes&&actual.sha256===row.sha256,'Existing received workspace has advanced or differs; preserve it')}return{directory:target,status,resumed:true}}
 const stage=target+'.receiving';await privateDirectory(dirname(target));
 const bindingFile=stage+'.binding.json',binding=checked.manifest;
 if(await exists(stage)){need(await exists(bindingFile)&&digest(await readPrivateJson(bindingFile,16*1024*1024))===digest(binding),'Existing receiving stage has no matching original binding')}
 else{
  await exact(bindingFile,json(binding));
  await privateDirectory(stage);
 }
 for(const row of checked.manifest.files)await copyMember(join(checked.directory,'workspace',row.path),join(stage,row.path),row);
 const stagedNames=await filesUnder(stage);need(digest(stagedNames.sort())===digest(checked.manifest.files.map(x=>x.path).sort()),'Receiving stage contains other files');
 const status=await operatorStatus(stage);need(status.workspace.id===checked.manifest.workspaceId&&status.revision===checked.manifest.revision,'Received state differs');
 await rename(stage,target);await syncDir(dirname(target));return{directory:target,status,resumed:false};
}
export async function operatorFiles(directory,recordId){
 const{root,state}=await currentRoot(directory),r=record(state,recordId),base=artifact(root,r),rows=[];
 if(r.kind!=='preserved-incomplete'){const manifest=await readPrivateJson(join(root,r.artifactManifest.path),16*1024*1024);need(digest(manifest)===r.artifactManifest.sha256&&manifest.directory===r.directory,'Original artifact inventory changed');return{record:r,files:manifest.files.map(({path,bytes})=>({path,bytes}))};}
 async function walk(prefix=''){for(const e of await readdir(join(base,prefix),{withFileTypes:true})){need(safe(e.name),'Invalid artifact member');const p=prefix?prefix+'/'+e.name:e.name,st=await lstat(join(base,p));need(!st.isSymbolicLink(),'Artifact symlink refused');if(st.isDirectory())await walk(p);else{need(st.isFile()&&st.nlink===1,'Artifact must be a regular original');rows.push({path:p,bytes:st.size})}}}
 await walk();return{record:r,files:rows.sort((a,b)=>a.path.localeCompare(b.path))};
}
export async function operatorFile(directory,recordId,member){
 relativeMember(member);const{root,state}=await currentRoot(directory),r=record(state,recordId),base=artifact(root,r),file=join(base,member);need((await realpath(file))===file&&file.startsWith(base+sep),'Artifact path changed');
 const before=await lstat(file,{bigint:true}),identity=await hashFile(file),after=await lstat(file,{bigint:true});
 need(before.dev===after.dev&&before.ino===after.ino&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs,'Original download changed during receiving');
 if(r.kind!=='preserved-incomplete'){
  const manifest=await readPrivateJson(join(root,r.artifactManifest.path),16*1024*1024);need(digest(manifest)===r.artifactManifest.sha256&&manifest.directory===r.directory,'Original artifact inventory changed');
  const expected=manifest.files.find(x=>x.path===member);need(expected&&expected.bytes===identity.bytes&&expected.sha256===identity.sha256,'Downloaded member differs from its saved original');
 }
 return{path:file,...identity,fileIdentity:{dev:String(after.dev),ino:String(after.ino),mtimeNs:String(after.mtimeNs),ctimeNs:String(after.ctimeNs)}};
}

async function inventoryUnder(root,relative){
 const base=join(root,relative),files=await filesUnder(base),rows=[];
 for(const path of files)rows.push({path,...await hashFile(join(base,path))});
 return{schema:'econdb.operator-artifact.v1',directory:relative,files:rows};
}
async function verifyRecord(root,record){
 if(record.kind==='preserved-incomplete'){need(await exists(join(root,'operations',record.id,'request.json')),'Original preserved request is absent');return}
 need(record.artifactManifest&&relativeMember(record.artifactManifest.path),'Original artifact inventory is absent');
 const manifest=await readPrivateJson(join(root,record.artifactManifest.path),16*1024*1024);
 need(digest(manifest)===record.artifactManifest.sha256&&manifest.directory===record.directory,'Original artifact binding changed');
 need(digest(await inventoryUnder(root,record.directory))===digest(manifest),'Original artifact files changed');
}
export async function preserveFailedCommand({directory,id,expectedRevision,note}){
 label(note,'reason for preserving the unfinished command',4000);need(UUID.test(id),'Select the original pending UUID');
 const root=await rootDirectory(directory);
 return withPrivateLock(root,'operator.lock',async()=>{
  const state=await readState(root),prior=state.records.find(r=>r.id===id);
  if(prior){need(prior.kind==='preserved-incomplete'&&prior.preservationNote===note,'Original command already has another outcome');return{record:prior,revision:state.revision,replayed:true}}
  need(state.revision===expectedRevision&&state.pending?.id===id,'Original pending command or revision changed','ECONDB_REVISION_CHANGED',409);
  const op=join(root,'operations',id);need(await exists(join(op,'last-error.json'))&&!await exists(join(op,'result.json')),'Only a failed command without a completed result can be preserved');
  const request=await readPrivateJson(join(op,'request.json'),MAX_BODY);
  need(digest(request)===state.pending.requestSha256,'Original pending request changed');
  const record={id,action:request.action,revision:state.revision+1,requestSha256:digest(request),createdAt:new Date().toISOString(),kind:'preserved-incomplete',title:'Preserved unfinished '+request.action,directory:'operations/'+id,preservationNote:note,disposition:'ORIGINAL_BYTES_RETAINED_NO_SUCCESS_CLAIM'};
  const preserved=join(op,'preserved.json');let finalRecord=record;if(await exists(preserved)){finalRecord=await readPrivateJson(preserved);need(finalRecord.id===id&&finalRecord.requestSha256===record.requestSha256&&finalRecord.revision===record.revision&&finalRecord.preservationNote===note,'Retained preservation decision differs')}else await exact(preserved,json(record));state.records.push(finalRecord);state.revision++;state.pending=null;await atomicJson(root,'state.json',state);return{record:finalRecord,revision:state.revision,replayed:false};
 });
}
