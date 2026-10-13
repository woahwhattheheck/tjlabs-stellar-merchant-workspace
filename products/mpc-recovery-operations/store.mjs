// MIT. Persistent custody around the unchanged MPC domain and proposal engines.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,rename,unlink} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import * as Model from './app/domain.mjs';
import * as Proposal from './app/proposal.mjs';
import {operationLease,privateDirectory} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

export const STORE_SCHEMA='stellar-forge.mpc-recovery-store.v1';
const HEAD_SCHEMA='stellar-forge.mpc-recovery-store-head.v1',BRANCH_SCHEMA='mpc-browser-branch.v1';
const MAX_OBJECT=112*1024*1024,MAX_HEAD=24*1024*1024,MAX_REQUESTS=20000,MAX_BRANCHES=256;
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const copy=v=>JSON.parse(Model.canonical(v));
const digest=v=>createHash('sha256').update(v).digest('hex');
export function failure(code,message,status=400){return Object.assign(new Error(message),{code,status});}
function need(ok,code,message,status){if(!ok)throw failure(code,message,status);}
function text(v,label,max=240){need(typeof v==='string'&&v.trim()&&v.length<=max&&!/[\u0000-\u001f]/.test(v),'INVALID',label+' must be bounded text.');return v;}
function key(v,label='Identifier'){text(v,label,180);need(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(v),'INVALID',label+' contains unsupported characters.');return v;}
function hash(v){need(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),'INVALID','A complete SHA-256 is required.');return v;}
function iso(v){need(typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v,'INVALID','A canonical UTC timestamp is required.');return v;}
function exact(v,fields){need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('\0')===fields.slice().sort().join('\0'),'INVALID','Expected fields: '+fields.join(', '));}
function expectedValue(v){exact(v,['workspaceId','revision','snapshotSha256']);text(v.workspaceId,'Workspace ID',160);need(Number.isSafeInteger(v.revision)&&v.revision>=0,'INVALID','A valid reviewed revision is required.');hash(v.snapshotSha256);return v;}
function matches(row,v){return row.workspaceId===v.workspaceId&&row.revision===v.revision&&row.snapshotSha256===v.snapshotSha256;}
function requireExpected(row,v){expectedValue(v);need(matches(row,v),'CONFLICT','This physical branch has advanced. Retain the draft and review its current saved edition.',409);}
function branchSummary(row){const {snapshotObject,...rest}=row;return copy(rest);}
function portable(snapshot){return {format:'mpc-recovery-portable.v1',sha256:Model.sha256(Model.canonical(snapshot)),snapshot};}
function normalizeSnapshot(value){
 if(value?.format==='mpc-recovery-portable.v1'){
  exact(value,['format','sha256','snapshot']);hash(value.sha256);
  need(Model.sha256(Model.canonical(value.snapshot))===value.sha256,'HASH','Portable checksum differs.');
  value=value.snapshot;
 }
 const workspace=Model.receiveSnapshot(value),snapshot=Model.exportSnapshot(workspace);
 need(Model.canonical(value)===Model.canonical(snapshot),'HASH','Receiving changed the complete original snapshot.');
 return {workspace,snapshot,workspaceId:workspace.id,revision:workspace.revision,snapshotSha256:Model.sha256(Model.canonical(snapshot))};
}
async function syncDirectory(path){const f=await open(path,constants.O_RDONLY|constants.O_DIRECTORY);try{await f.sync();}finally{await f.close();}}
async function bytes(path,max=MAX_OBJECT,optional=false){
 let f;try{f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);}catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}
 try{
  const a=await f.stat();need(a.isFile()&&a.nlink===1&&!(a.mode&0o077)&&(process.getuid===undefined||a.uid===process.getuid())&&a.size<=max,'FILE_INVALID','Expected an owned private bounded regular file.');
  const out=await f.readFile(),b=await f.stat(),named=await lstat(path);
  need(a.dev===named.dev&&a.ino===named.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&out.length===a.size,'FILE_CHANGED','The retained file changed during reading.');
  return out;
 }finally{await f.close();}
}
function parse(data){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}catch{throw failure('JSON_INVALID','Retained JSON is not complete UTF-8 JSON.');}}
async function jsonFile(path,max=MAX_HEAD,optional=false){const b=await bytes(path,max,optional);return b===null?null:parse(b);}
async function atomic(path,data,{immutable=false}={}){
 const body=Buffer.isBuffer(data)?data:Buffer.from(data);
 if(immutable){const old=await bytes(path,Math.max(MAX_OBJECT,body.length),true);if(old){need(old.equals(body),'IMMUTABLE_CONFLICT','An immutable retained file differs.',409);return;}}
 const temporary=path+'.pending-'+randomUUID();let f=null,made=false;
 try{
  f=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);made=true;
  await f.writeFile(body);await f.sync();await f.close();f=null;
  // The maintained lifetime lease serializes every writer of these paths.
  await rename(temporary,path);made=false;await syncDirectory(dirname(path));
 }finally{if(f)await f.close();if(made){await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});await syncDirectory(dirname(path));}}
}
function encoded(value,max=MAX_OBJECT){const raw=Buffer.from(Model.canonical(value));need(raw.length<=max,'CAPACITY','Complete retained JSON exceeds its documented capacity.');return raw;}
async function writeObject(root,value){const body=encoded(value),sha256=digest(body);await atomic(join(root,'objects',sha256+'.json'),body,{immutable:true});return {sha256,bytes:body.length};}
async function readObject(root,ref){exact(ref,['sha256','bytes']);hash(ref.sha256);need(Number.isSafeInteger(ref.bytes)&&ref.bytes>=0&&ref.bytes<=MAX_OBJECT,'OBJECT_INVALID','Invalid retained object size.');const b=await bytes(join(root,'objects',ref.sha256+'.json'));need(b.length===ref.bytes&&digest(b)===ref.sha256,'HASH','Retained object bytes/hash differ.');return parse(b);}
function headHash(head){const {sha256,...body}=head;return digest(encoded(body,MAX_HEAD));}
function headCheck(head,identity){
 need(head?.schema===HEAD_SCHEMA&&head.storeId===identity.id&&head.directory===identity.directory&&head.sha256===headHash(head),'HEAD_INVALID','Store head identity or complete hash differs.');
 need(Number.isSafeInteger(head.sequence)&&head.sequence>=0&&head.branches&&head.seeds&&head.requests&&typeof head.branches==='object'&&!Array.isArray(head.branches)&&Object.keys(head.branches).length<=MAX_BRANCHES&&Object.keys(head.requests).length<=MAX_REQUESTS,'HEAD_INVALID','Store indexes exceed their retained contract.');
 need(own(head.branches,head.defaultBranchId),'HEAD_INVALID','Original default branch is absent.');
 for(const [id,row] of Object.entries(head.branches)){
  key(id);need(row?.id===id&&row.schema===BRANCH_SCHEMA&&row.storeId===identity.id,'BRANCH_INVALID','Branch metadata identity differs.');
  text(row.label,'Branch label');iso(row.createdAt);iso(row.updatedAt);expectedValue({workspaceId:row.workspaceId,revision:row.revision,snapshotSha256:row.snapshotSha256});hash(row.creationSha256);
  exact(row.snapshotObject,['sha256','bytes']);hash(row.snapshotObject.sha256);
 }
 for(const [id,row] of Object.entries(head.requests)){key(id,'Request ID');need(row?.requestId===id&&row.inputSha256===row.inputObject?.sha256&&Number.isSafeInteger(row.sequence)&&row.sequence>0&&row.sequence<=head.sequence,'REQUEST_INVALID','Retained request index differs.');exact(row.inputObject,['sha256','bytes']);hash(row.inputObject.sha256);exact(row.resultObject,['sha256','bytes']);hash(row.resultObject.sha256);}
 return head;
}
function record(identity,id,label,selection,origin,at,creationSha256,snapshotObject){
 key(id,'Branch ID');text(label,'Branch label');iso(at);
 return {schema:BRANCH_SCHEMA,id,label,storeId:identity.id,workspaceId:selection.workspaceId,revision:selection.revision,snapshotSha256:selection.snapshotSha256,snapshotObject,createdAt:at,updatedAt:at,origin:copy(origin),creationSha256};
}
async function ownedDirectory(path){try{await mkdir(path,{mode:0o700});await syncDirectory(dirname(path));}catch(e){if(e.code!=='EEXIST')throw e;}return privateDirectory(path);}
function absolute(path){need(typeof path==='string'&&path===resolve(path)&&!path.includes('\0'),'PATH_INVALID','Select an absolute normalized real directory.');return path;}

export async function createStore(input){
 const args=copy(input);absolute(args.directory);text(args.title,'Store title',200);iso(args.createdAt);
 need(typeof args.id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(args.id),'INVALID','Physical store ID must be a canonical UUID.');
 const selected=normalizeSnapshot(args.initialSnapshot??Model.exportSnapshot(Model.createWorkspace({id:args.id,title:args.title,createdAt:args.createdAt})));
 const root=args.directory,parent=dirname(root);need(await realpath(parent)===parent,'PATH_INVALID','Store parent must be a real directory.');
 const inputRecord={schema:'stellar-forge.mpc-store-create.v1',id:args.id,title:args.title,createdAt:args.createdAt,directory:root,initialSnapshotSha256:selected.snapshotSha256};
 const creationInputHash=Model.sha256(inputRecord),defaultBranchId='branch-'+args.id;
 const identity={schema:STORE_SCHEMA,id:args.id,title:args.title,createdAt:args.createdAt,directory:root,defaultBranchId,creationInputHash};
 const creationStem=join(parent,'.mpc-create-'+digest(root));
 const guard=await operationLease(creationStem+'.lock');
 try{
  let existed=true;try{await lstat(root);}catch(e){if(e.code==='ENOENT')existed=false;else throw e;}
  const outerIntent=await jsonFile(creationStem+'.json',MAX_HEAD,true);
  if(outerIntent)need(Model.canonical(outerIntent)===Model.canonical(inputRecord),'CREATE_CONFLICT','The original directory creation is bound to different inputs.',409);
  else{
   need(!existed,'CREATE_CONFLICT','An existing directory without its original creation intent cannot be adopted.',409);
   await atomic(creationStem+'.json',encoded(inputRecord),{immutable:true});
  }
  if(!existed)await ownedDirectory(root);else await privateDirectory(root);
  await atomic(join(root,'creation-input.json'),encoded(inputRecord),{immutable:true});
  const prior=await jsonFile(join(root,'creation.json'),MAX_HEAD,true);
  if(prior){need(Model.canonical(prior)===Model.canonical(identity),'CREATE_CONFLICT','Store identity differs from the original creation request.',409);}
  else{
   await ownedDirectory(join(root,'objects'));
   const snapshotObject=await writeObject(root,selected.snapshot);
   const branch=record(identity,defaultBranchId,'Original planning workspace',selected,{kind:'ISSUED_BASELINE',snapshotSha256:selected.snapshotSha256},args.createdAt,Model.sha256({snapshotSha256:selected.snapshotSha256,storeId:args.id}),snapshotObject);
   const head={schema:HEAD_SCHEMA,storeId:args.id,directory:root,sequence:0,defaultBranchId,branches:{[defaultBranchId]:branch},seeds:{['baseline:'+selected.snapshotSha256]:{branchId:defaultBranchId,inputSha256:Model.sha256({snapshotSha256:selected.snapshotSha256,origin:branch.origin})}},requests:{},sha256:''};
   head.sha256=headHash(head);
   await atomic(join(root,'state.json'),encoded(head,MAX_HEAD),{immutable:true});
   await atomic(join(root,'creation.json'),encoded(identity),{immutable:true});
  }
 }finally{await guard.close();}
 return copy(identity);
}
export async function openStore({directory}){
 const root=absolute(directory);await privateDirectory(root);
 const guard=await operationLease(join(root,'service.lock'));let closed=false,closing=false,poisoned=false,tail=Promise.resolve();
 try{
  const identity=await jsonFile(join(root,'creation.json'));
  need(identity?.schema===STORE_SCHEMA&&identity.directory===root&&typeof identity.id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(identity.id),'IDENTITY_INVALID','Store creation identity does not match this physical directory.');
  text(identity.title,'Store title',200);iso(identity.createdAt);key(identity.defaultBranchId);hash(identity.creationInputHash);
  const originalInput=await jsonFile(join(root,'creation-input.json'));
  need(Model.sha256(originalInput)===identity.creationInputHash&&originalInput.id===identity.id&&originalInput.directory===root,'IDENTITY_INVALID','Original store creation input differs.');
  await privateDirectory(join(root,'objects'));
  let head=headCheck(await jsonFile(join(root,'state.json')),identity);
  need(head.defaultBranchId===identity.defaultBranchId,'IDENTITY_INVALID','Original default branch changed.');
  const workspaces=new Map();
  const serial=fn=>{
   if(closing||closed)return Promise.reject(failure('CLOSED','The MPC store is closing.',409));
   const pending=tail.then(()=>{need(!poisoned,'STORE_REOPEN_REQUIRED','A filesystem commit has an uncertain outcome. Close and reopen this original store before continuing.',409);return fn();});
   tail=pending.catch(()=>{});return pending;
  };
  async function selection(row){
   const cached=workspaces.get(row.snapshotSha256);if(cached)return cached;
   const s=normalizeSnapshot(await readObject(root,row.snapshotObject));
   need(matches(row,s),'HASH','Saved branch snapshot differs from its retained identity.');
   workspaces.set(row.snapshotSha256,s);while(workspaces.size>2)workspaces.delete(workspaces.keys().next().value);
   return s;
  }
  function rowFor(id){key(id,'Branch ID');need(own(head.branches,id),'MISSING','The selected physical branch does not exist.',404);return head.branches[id];}
  async function hydrated(row){const s=await selection(row);return {...branchSummary(row),snapshot:copy(s.snapshot)};}
  async function response(stored){
   if(stored.shape==='branch')return hydrated(stored.branch);
   if(stored.shape==='command'||stored.shape==='proposal')return {branch:await hydrated(stored.branch),result:copy(stored.result),replayed:stored.replayed};
   throw failure('RECEIPT_INVALID','Unknown retained result shape.');
  }
  async function priorResult(requestId,inputSha256){
   const prior=own(head.requests,requestId)?head.requests[requestId]:null;
   if(!prior)return null;
   need(prior.inputSha256===inputSha256,'REQUEST_REUSED','This original request ID belongs to different arguments.',409);
   const originalInput=await readObject(root,prior.inputObject);need(Model.sha256(originalInput)===prior.inputSha256,'HASH','Retained request input differs.');
   return response(await readObject(root,prior.resultObject));
  }
  function mutation(kind,args,normalize,work){
   // Snapshot caller-owned JSON before any await or queue admission.
   const frozen=copy(args);
   return serial(async()=>{
    const input=normalize(frozen),inputSha256=Model.sha256({kind,input}),requestId=frozen.requestId??('request-'+inputSha256);
    key(requestId,'Request ID');
    const bound={kind,input};const previous=await priorResult(requestId,Model.sha256(bound));if(previous!==null)return previous;
    let next=copy(head),stored;
    try{
     need(Object.keys(next.requests).length<MAX_REQUESTS,'CAPACITY','Store request capacity reached.');
     stored=await work(frozen,next,input);
     const resultObject=await writeObject(root,stored),inputObject=await writeObject(root,bound);
     next.sequence++;next.requests[requestId]={requestId,inputObject,inputSha256:Model.sha256(bound),sequence:next.sequence,resultObject};
     next.sha256=headHash(next);const body=encoded(next,MAX_HEAD);
     try{await atomic(join(root,'state.json'),body);}catch(e){poisoned=true;e.requestId=requestId;e.notCommitted=false;throw e;}
     head=next;
    }catch(e){
     e.requestId??=requestId;
     if(!poisoned)e.notCommitted=true;
     throw e;
    }
    return response(stored);
   });
  }
  async function install(next,row,selected){
   const snapshotObject=await writeObject(root,selected.snapshot);
   const updated={...row,workspaceId:selected.workspaceId,revision:selected.revision,snapshotSha256:selected.snapshotSha256,snapshotObject,updatedAt:new Date().toISOString()};
   next.branches[row.id]=updated;
   workspaces.set(selected.snapshotSha256,selected);while(workspaces.size>2)workspaces.delete(workspaces.keys().next().value);
   return updated;
  }
  function continuation(old,s){
   need(s.workspaceId===old.workspaceId&&s.revision>=old.revision,'CONFLICT','Save must continue this original portable workspace.',409);
   if(s.revision===old.revision){need(s.snapshotSha256===old.snapshotSha256,'CONFLICT','An equal revision must have identical complete bytes.',409);return;}
  }
  async function checkPrefix(old,s){
   const previous=await selection(old);continuation(old,s);
   need(Model.canonical(previous.workspace.seed)===Model.canonical(s.workspace.seed)&&Model.canonical(s.workspace.operations.slice(0,old.revision))===Model.canonical(previous.workspace.operations),'HISTORY','Save must retain every original command and first result.');
  }
  function snapshotInput(a){
   key(a.id,'Branch ID');const s=normalizeSnapshot(a.snapshot);text(a.label??'unused','Branch label');
   return {id:a.id,label:a.label??null,snapshotSha256:s.snapshotSha256,origin:a.origin??null,expected:a.expected??null};
  }
  async function proposalRegister(){
   // These are the selected original source files, not operator paths.
   const {readFile}=await import('node:fs/promises');
   return {requirements:parse(await readFile(new URL('./app/proposal/requirements.json',import.meta.url))),steps:parse(await readFile(new URL('./app/proposal/acceptance-steps.json',import.meta.url)))};
  }
  const api={
   directory:root,identity:Object.freeze(copy(identity)),
   read(id){const frozen=copy(id);return serial(()=>hydrated(rowFor(frozen)));},
   list(){return serial(()=>Object.values(head.branches).map(branchSummary).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id)));},
   create(args){return mutation('create',args,snapshotInput,async(a,next,input)=>{
    const creationSha256=Model.sha256(input),s=normalizeSnapshot(a.snapshot);text(a.label,'Branch label');
    if(own(next.branches,a.id)){const old=next.branches[a.id];need(old.creationSha256===creationSha256,'CREATE_CONFLICT','This physical branch ID belongs to another original input.',409);return {shape:'branch',branch:old};}
    need(Object.keys(next.branches).length<MAX_BRANCHES,'CAPACITY','Store branch capacity reached.');
    const row=record(identity,a.id,a.label,s,a.origin??null,new Date().toISOString(),creationSha256,await writeObject(root,s.snapshot));
    next.branches[row.id]=row;return {shape:'branch',branch:row};
   });},
   initialize(args){return mutation('initialize',args,a=>{
    const s=normalizeSnapshot(a.initialSnapshot);need(a.legacyRaw===null||a.legacyRaw===undefined||typeof a.legacyRaw==='string','INVALID','Legacy input must be original JSON text.');
    if(a.preferredId!==undefined&&a.preferredId!==null)key(a.preferredId);
    return {initialSnapshotSha256:s.snapshotSha256,legacySha256:a.legacyRaw==null?null:Model.sha256(a.legacyRaw),preferredId:a.preferredId??null};
   },async(a,next,input)=>{
    let migrated=null;
    if(a.legacyRaw!=null){
     const s=normalizeSnapshot(JSON.parse(a.legacyRaw)),seedKey='legacy:'+input.legacySha256;
     if(own(next.seeds,seedKey))migrated=next.branches[next.seeds[seedKey].branchId];
     else{
      need(Object.keys(next.branches).length<MAX_BRANCHES,'CAPACITY','Store branch capacity reached.');
      const rawObject=await writeObject(root,{encoding:'utf8',content:a.legacyRaw,sha256:input.legacySha256});
      const origin={kind:'LEGACY_BROWSER',legacySha256:input.legacySha256,rawObject};
      migrated=record(identity,'branch-'+randomUUID(),'Recovered original browser workspace',s,origin,new Date().toISOString(),Model.sha256({snapshotSha256:s.snapshotSha256,origin}),await writeObject(root,s.snapshot));
      next.branches[migrated.id]=migrated;next.seeds[seedKey]={branchId:migrated.id,inputSha256:input.legacySha256};
     }
    }
    if(a.preferredId&&own(next.branches,a.preferredId))return {shape:'branch',branch:next.branches[a.preferredId]};
    if(migrated)return {shape:'branch',branch:migrated};
    const baseline=next.branches[next.defaultBranchId];
    need(baseline.origin.snapshotSha256===input.initialSnapshotSha256,'BASELINE_MISMATCH','Managed initial snapshot differs from this store’s original baseline.',409);
    return {shape:'branch',branch:baseline};
   });},
   save(args){return mutation('save',args,a=>{const input=snapshotInput(a);expectedValue(a.expected);return input;},async(a,next)=>{
    const old=rowFor(a.id);requireExpected(old,a.expected);const s=normalizeSnapshot(a.snapshot);await checkPrefix(old,s);
    return {shape:'branch',branch:s.snapshotSha256===old.snapshotSha256?old:await install(next,old,s)};
   });},
   command(args){return mutation('command',args,a=>{key(a.id);expectedValue(a.expected);return {id:a.id,expected:a.expected,command:a.command};},async(a,next)=>{
    const old=rowFor(a.id),original=await selection(old),existing=original.workspace.operations.find(op=>op.command.id===a.command?.id);
    if(existing)need(old.workspaceId===a.expected.workspaceId,'CONFLICT','Original command replay must address this portable workspace in this physical branch.',409);
    else requireExpected(old,a.expected);
    const outcome=Model.applyCommand(original.workspace,a.command);
    const s=normalizeSnapshot(Model.exportSnapshot(outcome.workspace));const row=s.snapshotSha256===old.snapshotSha256?old:await install(next,old,s);
    return {shape:'command',branch:row,result:outcome.result,replayed:outcome.replayed};
   });},
   proposal(args){return mutation('proposal',args,a=>{key(a.id);expectedValue(a.expected);return {id:a.id,expected:a.expected,input:a.input};},async(a,next)=>{
    const old=rowFor(a.id);requireExpected(old,a.expected);const original=await selection(old),outcome=Proposal.importProposal(original.workspace,a.input,await proposalRegister());
    const s=normalizeSnapshot(Model.exportSnapshot(outcome.workspace)),row=s.snapshotSha256===old.snapshotSha256?old:await install(next,old,s);
    return {shape:'proposal',branch:row,result:{sourceId:outcome.sourceId,proposal:outcome.proposal,reused:outcome.reused},replayed:outcome.reused};
   });},
   request(requestId){const id=copy(requestId);key(id,'Request ID');return serial(async()=>{
    if(!own(head.requests,id))return null;
    const entry=head.requests[id],input=await readObject(root,entry.inputObject);need(Model.sha256(input)===entry.inputSha256,'HASH','Original request bytes differ.');return {...copy(entry),input,result:await response(await readObject(root,entry.resultObject))};
   });},
   history(args){const a=copy(args);return serial(async()=>{
    const row=rowFor(a.id);requireExpected(row,a.expected);
    const offset=a.offset??0,limit=a.limit??100;
    need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=200,'INVALID','History offset/limit are outside bounds.');
    const {workspace}=await selection(row),total=workspace.operations.length;need(offset<=total,'INVALID','History offset exceeds its frozen total.');
    return {id:row.id,workspaceId:row.workspaceId,revision:row.revision,snapshotSha256:row.snapshotSha256,total,offset,nextOffset:offset+limit<total?offset+limit:null,items:copy(workspace.operations.slice(offset,offset+limit))};
   });},
   report(args){const a=copy(args);return serial(async()=>{
    const row=rowFor(a.id);if(a.expected)requireExpected(row,a.expected);const {workspace:w}=await selection(row),o=a.options??{};let result;
    switch(a.kind){
     case 'overview':result=Model.overview(w,o.asOf??w.updatedAt);break;
     case 'serviceReview':result=Model.serviceReview(w,o);break;
     case 'acceptance':result=Model.acceptance(w,o);break;
     case 'recoveryOrder':result=Model.recoveryOrder(w,o);break;
     case 'restoreDue':result=Model.restoreDue(w,o.asOf??w.updatedAt,{planId:o.planId??w.activePlanId});break;
     case 'hurricaneStatus':result=Model.hurricaneStatus(w,o.eventId,{asOf:o.asOf??w.updatedAt});break;
     case 'incidentStatus':result=Model.incidentStatus(w,o.incidentId,o.asOf??w.updatedAt);break;
     case 'proposals':result=Proposal.retainedProposals(w,await proposalRegister());break;
     case 'proposalPlanDraft':result=Proposal.proposalPlanDraft(w,o.sourceId,{id:o.id,title:o.title},await proposalRegister());break;
     case 'proposalCompare':{
      const left=w.sources.find(s=>s.id===o.leftSourceId),right=w.sources.find(s=>s.id===o.rightSourceId);need(left?.encoding==='utf8'&&right?.encoding==='utf8','MISSING','Select both complete retained proposal sources.',404);
      result=Proposal.compareProposals(left.content,right.content,await proposalRegister());break;
     }
     default:throw failure('REPORT_INVALID','Unknown original report kind.');
    }
    return {branch:branchSummary(row),kind:a.kind,result:copy(result)};
   });},
   exportBranch(args){const a=copy(args);return serial(async()=>{const row=rowFor(a.id);requireExpected(row,a.expected);return portable(copy((await selection(row)).snapshot));});},
   source(args){const a=copy(args);return serial(async()=>{
    const row=rowFor(a.id);requireExpected(row,a.expected);const s=(await selection(row)).workspace.sources.find(s=>s.id===a.sourceId);
    need(s,'MISSING','Original source is absent.',404);const body=Buffer.from(s.content,s.encoding==='base64'?'base64':'utf8');
    need(body.length===s.bytes&&digest(body)===s.sha256,'HASH','Original source bytes differ.');const {content,...descriptor}=s;
    return {branch:branchSummary(row),descriptor:copy(descriptor),bytes:body};
   });},
   close(){if(closed)return Promise.resolve();if(closing)return tail;closing=true;tail=tail.then(async()=>{closed=true;workspaces.clear();await guard.close();});return tail;}
  };
  // Cold opening verifies every active branch against its complete original history.
  for(const row of Object.values(head.branches))await selection(row);
  return Object.freeze(api);
 }catch(e){await guard.close();throw e;}
}
