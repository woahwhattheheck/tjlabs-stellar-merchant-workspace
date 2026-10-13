// SPDX-License-Identifier: MIT
// Interactive work over the original commissioning job and native release owner.
import {constants, createReadStream} from 'node:fs';
import {open, mkdir, lstat, realpath, readdir, link, unlink, readFile} from 'node:fs/promises';
import {join, resolve, dirname, basename} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createCommissioningJob, openCommissioningJob, inspectCommissioningTransfer, SCHEMA} from './commissioning.mjs';
import {renderCommissioningReport} from './report.mjs';
import {createInstallationDesk} from './installation-desk.mjs';
import {normalizeFacilitatorProfiles} from '../../stellar/scf-starforge-20261009/sf82-seller-pilot/release-facilitator.mjs';
import {inspectRelease, releaseStatus} from '../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs';
import {config as readBuyerConfiguration,execution as validateBuyerExecution} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/config.mjs';
import {lockPrivateDirectory} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/private-directory-lock.mjs';

export const OPERATOR_SCHEMA='stellar-forge.facilitator-commissioning-operator.v1';
export const FILE_LIMIT=64*1024*1024, CHUNK_LIMIT=1024*1024;
const HASH=/^[a-f0-9]{64}$/, UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/, ID=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const stable=x=>JSON.stringify(x,(_k,v)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const digest=x=>createHash('sha256').update(x).digest('hex');
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const fail=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
function need(ok,code,message,status){if(!ok)throw fail(code,message,status);}
function exact(x,keys,required=keys){need(object(x)&&Object.keys(x).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(x,k)),'INPUT_FIELDS','Use the documented complete input fields.');}
function identifier(x){need(typeof x==='string'&&ID.test(x),'IDENTIFIER','Use a stable lowercase identifier.');return x;}
function operation(x){need(typeof x==='string'&&UUID.test(x),'OPERATION_ID','Retain one original operation UUID.');return x;}
function text(x,label,max=4000){need(typeof x==='string'&&x.trim()&&x.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x),'TEXT_REQUIRED',label+' is required.');return x.trim();}
async function ordinary(path,maximum=FILE_LIMIT){const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat();need(s.isFile()&&s.size<=maximum,'FILE_REQUIRED','Use a complete ordinary source file within its limit.');const raw=await h.readFile();need(raw.length===s.size,'FILE_CHANGED','The selected source changed during reading.');return raw;}finally{await h.close();}}
async function json(path,optional=false){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await ordinary(path)));}catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}}
async function directory(path,create=false){if(create)await mkdir(path,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&await realpath(path)===path&&(process.platform==='win32'||(s.mode&0o077)===0&&s.uid===process.getuid()),'PRIVATE_DIRECTORY','Use a private directory owned by the current operator.');}
async function publish(path,raw){try{need((await ordinary(path)).equals(raw),'RETAINED_CONFLICT','The retained original file has different content.',409);return;}catch(e){if(e.code!=='ENOENT')throw e;}const tmp=join(dirname(path),'.operator-'+randomUUID());const h=await open(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{try{await h.writeFile(raw);await h.sync();}finally{await h.close();}try{await link(tmp,path);}catch(e){if(e.code!=='EEXIST')throw e;need((await ordinary(path)).equals(raw),'RETAINED_CONFLICT','The original publication differs.',409);}const d=await open(dirname(path),'r');try{await d.sync();}finally{await d.close();}}finally{await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
async function hashFile(path){const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat();need(s.isFile(),'FILE_REQUIRED','The original file is unavailable.');const hash=createHash('sha256');for await(const b of h.createReadStream({autoClose:false}))hash.update(b);const after=await h.stat();need(after.size===s.size&&after.mtimeMs===s.mtimeMs&&after.ctimeMs===s.ctimeMs,'FILE_CHANGED','The selected file changed.');return{bytes:s.size,sha256:hash.digest('hex')};}finally{await h.close();}}
async function configFile(path){if(!path)return null;const raw=await ordinary(resolve(path),1024*1024), c=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));exact(c,['store','profilesFile','buyerTemplates'],['store','profilesFile']);const base=dirname(resolve(path));const templates={};for(const [alias,v]of Object.entries(c.buyerTemplates??{})){identifier(alias);exact(v,['title','file']);templates[alias]={title:text(v.title,'Buyer template title',240),file:resolve(base,text(v.file,'Original buyer template path'))};}return{store:await realpath(resolve(base,c.store)),profilesFile:resolve(base,c.profilesFile),buyerTemplates:templates,sha256:digest(raw)};}
function page(items,offset=0,limit=50){need(Number.isInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>=1&&limit<=250,'PAGE_RANGE','Choose a page of 1–250 records.');return{items:items.slice(offset,offset+limit),offset,limit,total:items.length,next_offset:offset+limit<items.length?offset+limit:null};}

/** Own one original job and one browser input journal for the entire foreground lifetime. */
export async function openCommissioningOperator({directory:where,store,setupFile,exportDirectory}={}){
  const root=resolve(text(where,'Job directory'));await directory(root,true);
  const ui=join(root,'.operator');await directory(ui,true);
  for(const n of ['uploads','inputs','requests','results','plans','native-requests'])await directory(join(ui,n),true);
  const release=await lockPrivateDirectory({directory:ui,filename:'operator.lock',namespace:'facilitator-operator',busyCode:'OPERATOR_ALREADY_OWNED',unavailableCode:'OPERATOR_LOCK_UNAVAILABLE'});
  let exportsRoot,instanceId;
  try{
    const instanceFile=join(ui,'instance.json');let instance=await json(instanceFile,true);
    if(!instance){instance={schema:OPERATOR_SCHEMA,id:randomUUID()};await publish(instanceFile,encode(instance));}
    operation(instance.id);instanceId=instance.id;
    exportsRoot=resolve(exportDirectory??join(dirname(root),basename(root)+'-commissioning-exports'));
    need(exportsRoot!==root&&!exportsRoot.startsWith(root+'/'),'EXPORT_DESTINATION','Choose a separate private export directory outside the original job.');
    await directory(exportsRoot,true);const marker=join(exportsRoot,'OWNER.json'),owner=await json(marker,true);
    const binding={schema:'stellar-forge.facilitator-operator-export-owner.v1',operatorInstanceId:instance.id};
    if(owner)need(stable(owner)===stable(binding),'EXPORT_OWNER','This export directory belongs to another original operator.',409);
    else{need((await readdir(exportsRoot)).length===0,'EXPORT_OWNER','Choose an empty or already-owned export directory.',409);await publish(marker,encode(binding));}
  }catch(e){await release();throw e;}
  let job=null,active=null,closing=null,stopping=false,queue=Promise.resolve();
  const setup=await configFile(setupFile).catch(async e=>{await release();throw e;});
  let selectedStore;
  try{const existing=await json(join(root,'job.json'),true);selectedStore=store?await realpath(resolve(store)):setup?.store??existing?.store;}catch(e){await release();throw e;}
  const run=fn=>{if(stopping)return Promise.reject(fail('OPERATOR_CLOSING','The operator is closing.',409));const p=queue.then(fn);queue=p.catch(()=>{});return p;};
  const jobRequired=()=>{need(job,'JOB_REQUIRED','Prepare or receive the original job first.',409);return job;};
  const uploadPath=id=>join(ui,'uploads',operation(id)+'.json');
  const inputPath=sha=>{need(HASH.test(sha),'SOURCE_HASH','Select a complete retained source file.');return join(ui,'inputs',sha);};
  async function input(ref){exact(ref,['sha256','bytes']);need(HASH.test(ref.sha256)&&Number.isSafeInteger(ref.bytes)&&ref.bytes>=0&&ref.bytes<=FILE_LIMIT,'SOURCE_IDENTITY','Select a completed upload.');const p=inputPath(ref.sha256),actual=await hashFile(p);need(actual.bytes===ref.bytes&&actual.sha256===ref.sha256,'SOURCE_CHANGED','Original input bytes changed.');return p;}
  const installation=createInstallationDesk({root,ui,exportsRoot,input});
  async function uploadRows(){const names=(await readdir(join(ui,'uploads'))).filter(n=>UUID.test(n.slice(0,-5))&&n.endsWith('.json'));return Promise.all(names.map(n=>json(join(ui,'uploads',n))));}
  async function uploadState(id){const v=await json(uploadPath(id));const completed=await json(join(ui,'uploads',id+'.complete.json'),true);if(completed){await input(completed.file);return{...v,state:'COMPLETE',file:completed.file,offset:v.bytes};}const part=join(ui,'uploads',id+'.part');let s;try{s=await lstat(part);}catch(e){if(e.code!=='ENOENT')throw e;}need(!s||s.isFile()&&!s.isSymbolicLink()&&s.size<=v.bytes,'UPLOAD_CHANGED','The original upload staging changed.');return{...v,state:'UPLOADING',offset:s?.size??0};}
  async function view(){
    const state=job?await job.inspect():null,report=job?await job.report():null;
    const releaseState=job&&selectedStore?await releaseStatus(selectedStore):null;
    const configuredProfiles=setup?normalizeFacilitatorProfiles(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await ordinary(setup.profilesFile,65536)))):null;
    return{schema:OPERATOR_SCHEMA,instanceId,job:state?{...state,results:undefined,runs:undefined,pending:undefined}:null,report,
      counts:state?{results:state.results.length,runs:state.runs.length,pending:state.pending.length}:null,
      activeRun:active?{operationId:active.operationId,provider:active.provider,started:active.started}:null,
      nativeRuntime:releaseState?.runtime??null,
      setup:setup?{configured:true,profiles:Object.entries(configuredProfiles.providers).map(([alias,p])=>({alias,label:p.label??alias,url:p.url})),buyerTemplates:Object.entries(setup.buyerTemplates).map(([alias,t])=>({alias,title:t.title})),sourceSha256:setup.sha256}:{configured:false,profiles:[],buyerTemplates:[]},
      uploads:await Promise.all((await uploadRows()).map(v=>uploadState(v.id))),
      pendingRequests:(await Promise.all((await readdir(join(ui,'requests'))).filter(n=>n.endsWith('.json')).map(async n=>{
        const request=await json(join(ui,'requests',n));if(await json(join(ui,'results',n),true))return null;
        return{operationId:request.operationId,action:request.action,expectedRevision:request.expectedRevision};
      }))).filter(Boolean),
      transfers:(await Promise.all((await readdir(exportsRoot)).filter(n=>UUID.test(n)).map(async n=>{
        const m=await json(join(exportsRoot,n,'OPERATOR_TRANSFER.json'),true);return m?{id:m.id,jobId:m.jobId,files:m.files.length,originalManifestSha256:m.originalManifestSha256}:null;
      }))).filter(Boolean)};
  }
  async function commandInput(action,p){
    if(action==='review'){exact(p,['provider','review'],['provider']);return{provider:p.provider,...(p.review?{reviewFile:await input(p.review)}:{})};}
    if(action==='stage'){exact(p,['reviewOperationId']);return p;}
    if(action==='select'){exact(p,['provider','expectedGeneration','reason']);return p;}
    if(action==='receive-run'){exact(p,['runOperationId','nativeInstanceId']);return p;}
    if(action==='receive'){
      exact(p,['provider','requestId','runOperationId','summary','evidence','output','receiving','supersedesOperationId'],['provider','requestId','runOperationId','summary','evidence','receiving']);
      return{provider:p.provider,requestId:p.requestId,runOperationId:p.runOperationId,summaryFile:await input(p.summary),evidenceFile:await input(p.evidence),...(p.output?{outputFile:await input(p.output)}:{}),receiving:p.receiving,...(p.supersedesOperationId?{supersedesOperationId:p.supersedesOperationId}:{})};
    }
    throw fail('ACTION_REQUIRED','Choose an original review, stage, selection or receiving action.');
  }

  async function nativeBinding(command,payload) {
    const target=join(ui,'native-requests',command.operationId+'.json'),prior=await json(target,true),logicalSha256=digest(stable(command));
    if(prior){need(prior.logicalSha256===logicalSha256,'REQUEST_CONFLICT','The original logical command differs.',409);return prior.command;}
    const fields=command.action==='review'?['reviewFile']:command.action==='receive'?['summaryFile','evidenceFile','outputFile']:command.action==='buyer-plan'?['templateFile']:[];
    const inputs={};
    for(const field of fields)if(payload[field]){
      const raw=await ordinary(payload[field]),sha256=digest(raw);await publish(inputPath(sha256),raw);
      inputs[field]={originalPath:payload[field],sha256,bytes:raw.length};
    }
    const original={...command,payload};
    await publish(target,encode({schema:'stellar-forge.facilitator-operator-native-inputs.v1',logicalSha256,command:original,commandSha256:digest(stable(original)),originalRoot:root,inputs}));
    return original;
  }
  async function resolveCommandInputs(command) {
    const binding=await json(join(ui,'native-requests',command.operationId+'.json'),true);
    if(!binding)return null;
    need(binding.commandSha256===digest(stable(command))&&stable(binding.command)===stable(command),'COMMAND_SOURCE_BINDING','The retained native command differs.',409);
    const inputs={};for(const [field,ref]of Object.entries(binding.inputs))inputs[field]={...ref,path:await input({sha256:ref.sha256,bytes:ref.bytes})};
    let outputDirectory;
    if(command.action==='buyer-plan'){outputDirectory=join(ui,'plans',command.operationId);await directory(outputDirectory,true);}
    return{commandSha256:binding.commandSha256,originalRoot:binding.originalRoot,inputs,outputDirectory};
  }
  async function executeBound(command,build) {
    const existing=await json(join(ui,'native-requests',command.operationId+'.json'),true);
    const native=existing?await nativeBinding(command,null):await nativeBinding(command,await build());
    return jobRequired().execute(native);
  }

  async function retained(command,work){
    operation(command.operationId);const requestPath=join(ui,'requests',command.operationId+'.json');
    const old=await json(requestPath,true);
    if(old)need(stable(old)===stable(command),'REQUEST_CONFLICT','Reuse the exact original operator request.',409);
    else await publish(requestPath,encode(command));
    const complete=await json(join(ui,'results',command.operationId+'.json'),true);
    if(complete)return{...complete,replayed:true};
    const result=await work();const receipt={schema:OPERATOR_SCHEMA,operationId:command.operationId,action:command.action,completedAt:new Date().toISOString(),result};
    await publish(join(ui,'results',command.operationId+'.json'),encode(receipt));return receipt;
  }
  async function initialize(command){
    const retainedInitial=await json(join(ui,'native-requests',command.operationId+'.json'),true);
    if(job&&retainedInitial){need(retainedInitial.logicalSha256===digest(stable(command)),'REQUEST_CONFLICT','The original initialization differs.',409);const state=await job.inspect();need(state.selectionSha256===digest(stable(retainedInitial.selection)),'JOB_ALREADY_SELECTED','The original selection differs.',409);return state;}
    exact(command.payload,['id','title','releaseId','providers','service','requests']);
    need(setup,'SETUP_REQUIRED','The host must select its original store and provider configuration.',409);
    const p=command.payload;
    need(Array.isArray(p.providers)&&Array.isArray(p.requests),'SELECTION_REQUIRED','Select providers and the complete original request set.');
    const providers=[];for(const v of p.providers){exact(v,['alias','releaseId','operatorId','operatorName','authorityReference','authority','supportedResponse'],['alias','releaseId','operatorId','operatorName','authorityReference','authority']);providers.push({alias:v.alias,releaseId:v.releaseId,operatorId:v.operatorId,operatorName:v.operatorName,authorityReference:v.authorityReference,authorityFile:await input(v.authority),...(v.supportedResponse?{supportedResponseFile:await input(v.supportedResponse)}:{})});}
    const s=p.service;exact(s,['purpose','sourceReference','sourceEdition','receiver','scope','schema','acceptance']);
    const requests=[];for(const r of p.requests){exact(r,['id','routeId','url','method','body','output','mediaType'],['id','routeId','url','method','output','mediaType']);requests.push({id:r.id,routeId:r.routeId,url:r.url,method:r.method,outputFile:await input(r.output),mediaType:r.mediaType,...(r.body?{bodyFile:await input(r.body)}:{})});}
    let selection={schema:SCHEMA,id:p.id,title:p.title,releaseId:p.releaseId,store:setup.store,profilesFile:setup.profilesFile,providers,requests,service:{purpose:s.purpose,sourceReference:s.sourceReference,sourceEdition:s.sourceEdition,receiver:s.receiver,scopeFile:await input(s.scope),schemaFile:await input(s.schema),acceptanceFile:await input(s.acceptance)}};
    const initialPath=join(ui,'native-requests',command.operationId+'.json'),bound=await json(initialPath,true);
    if(bound){need(bound.logicalSha256===digest(stable(command)),'REQUEST_CONFLICT','The original initialization differs.',409);selection=bound.selection;}
    else await publish(initialPath,encode({schema:'stellar-forge.facilitator-operator-initialize.v1',logicalSha256:digest(stable(command)),selection}));
    if(job){const current=await job.inspect();need(current.selectionSha256===digest(stable(selection)),'JOB_ALREADY_SELECTED','The current job has another retained selection.',409);return current;}
    const result=await createCommissioningJob({directory:root,selection});
    job=await openCommissioningJob({directory:root,...(selectedStore?{store:selectedStore}:{}),resolveCommandInputs});return result;
  }
  async function transfer(command){
    const id=command.operationId, destination=join(exportsRoot,id);await directory(destination,true);
    const cut=await json(join(destination,'OPERATOR_TRANSFER.json'),true);
    if(cut){for(const f of cut.files){const got=await hashFile(join(destination,f.path));need(stable(got)===stable({bytes:f.bytes,sha256:f.sha256}),'TRANSFER_CHANGED','Retained transfer member changed.',409);}await inspectCommissioningTransfer(join(destination,'job'));return cut;}
    need(!active,'SELLER_RUNNING','Stop this operator’s selected seller before retaining a complete transfer.',409);
    let nativeManifest=await json(join(destination,'job','TRANSFER.json'),true),original;
    if(nativeManifest){await inspectCommissioningTransfer(join(destination,'job'));original={manifestSha256:digest(await ordinary(join(destination,'job','TRANSFER.json')))};}
    else{const status=await jobRequired().inspect();need(command.expectedRevision===status.revision,'REVISION_CONFLICT','Refresh the selected job before retaining a new complete transfer.',409);original=await job.export(join(destination,'job'));nativeManifest=await json(join(destination,'job','TRANSFER.json'));}
    const intentPath=join(destination,'.operator-export-intent.json');
    let intent=await json(intentPath,true);
    if(!intent){
      const rows=[{path:'operator/instance.json',...await hashFile(join(ui,'instance.json'))},...nativeManifest.files.map(f=>({...f,path:'job/'+f.path})),{path:'job/TRANSFER.json',...await hashFile(join(destination,'job','TRANSFER.json'))}];
      for(const folder of ['uploads','inputs','requests','results','native-requests'])for(const name of (await readdir(join(ui,folder))).sort()){
        if(name.startsWith('.')||name.endsWith('.part'))continue;
        const f=join(ui,folder,name);rows.push({path:'operator/'+folder+'/'+name,...await hashFile(f)});
      }
      intent={schema:'stellar-forge.facilitator-operator-transfer.v1',id,jobId:nativeManifest.jobId,selectionSha256:nativeManifest.selectionSha256,originalManifestSha256:original.manifestSha256,files:rows};
      await publish(intentPath,encode(intent));
    }
    for(const f of intent.files){
      if(f.path.startsWith('job/'))continue;
      const relative=f.path.slice('operator/'.length),src=join(ui,relative),dst=join(destination,f.path);
      await directory(join(destination,'operator'),true);await directory(dirname(dst),true);
      const raw=await ordinary(src);need(raw.length===f.bytes&&digest(raw)===f.sha256,'EXPORT_SOURCE_CHANGED','The retained operator source cut changed.',409);await publish(dst,raw);
    }
    await publish(join(destination,'OPERATOR_TRANSFER.json'),encode(intent));
    return intent;
  }
  try{
    if(await json(join(root,'job.json'),true))job=await openCommissioningJob({directory:root,...(selectedStore?{store:selectedStore}:{}),resolveCommandInputs});
    return{
      directory:root,state:()=>run(view),
      history:({kind='results',offset=0,limit=50,revision}={})=>run(async()=>{
        need(['results','runs','pending'].includes(kind),'HISTORY_KIND','Select commands, runs or pending work.');
        const s=await jobRequired().inspect();need(revision===undefined||revision===s.revision,'REVISION_CONFLICT','Refresh the history snapshot before paging.',409);
        return{...page(s[kind],offset,limit),revision:s.revision,jobId:s.id};
      }),
      originalRelease:releaseId=>run(async()=>{need(setup,'SETUP_REQUIRED','Configure the original host store.',409);return inspectRelease(setup.store,identifier(releaseId));}),
      beginUpload:input=>run(async()=>{exact(input,['id','name','bytes','sha256']);operation(input.id);text(input.name,'Original filename',240);need(!/[\/\\]/.test(input.name)&&HASH.test(input.sha256)&&Number.isSafeInteger(input.bytes)&&input.bytes>=0&&input.bytes<=FILE_LIMIT,'UPLOAD_IDENTITY','Choose one complete original file up to 64 MiB.');await publish(uploadPath(input.id),encode(input));return uploadState(input.id);}),
      uploadState:id=>run(()=>uploadState(operation(id))),
      uploadChunk:(id,offset,body)=>run(async()=>{
        operation(id);need(Buffer.isBuffer(body)&&body.length<=CHUNK_LIMIT&&Number.isSafeInteger(offset)&&offset>=0,'UPLOAD_CHUNK','Use an original chunk up to 1 MiB.');
        const v=await uploadState(id);if(v.state==='COMPLETE'){const h=await open(inputPath(v.sha256),'r');try{const b=Buffer.alloc(body.length),r=await h.read(b,0,b.length,offset);need(r.bytesRead===body.length&&b.equals(body),'UPLOAD_CONFLICT','The retained original chunk differs.',409);}finally{await h.close();}return v;}
        need(offset<=v.offset&&offset+body.length<=v.bytes,'UPLOAD_OFFSET','Continue at the returned original upload offset.',409);
        const path=join(ui,'uploads',id+'.part'),h=await open(path,constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
        try{const s=await h.stat();need(s.isFile()&&s.size===v.offset,'UPLOAD_CHANGED','The original upload changed.',409);if(offset<v.offset){need(offset+body.length<=v.offset,'UPLOAD_OFFSET','Retry one complete retained chunk or continue at its current offset.',409);const b=Buffer.alloc(body.length),r=await h.read(b,0,b.length,offset);need(r.bytesRead===body.length&&b.equals(body),'UPLOAD_CONFLICT','Original chunk bytes differ.',409);}else{let written=0;while(written<body.length){const r=await h.write(body,written,body.length-written,offset+written);need(r.bytesWritten>0,'UPLOAD_WRITE','The source chunk could not be completed.');written+=r.bytesWritten;}await h.sync();}}finally{await h.close();}
        return uploadState(id);
      }),
      completeUpload:id=>run(async()=>{operation(id);const v=await uploadState(id);if(v.state==='COMPLETE')return v;need(v.offset===v.bytes,'UPLOAD_INCOMPLETE','Continue the original upload to its complete length.',409);const part=join(ui,'uploads',id+'.part');if(v.bytes===0)await publish(part,Buffer.alloc(0));const got=await hashFile(part);need(got.sha256===v.sha256&&got.bytes===v.bytes,'UPLOAD_HASH','The complete uploaded bytes differ from the selected original file.',409);await publish(inputPath(v.sha256),await ordinary(part));await publish(join(ui,'uploads',id+'.complete.json'),encode({file:got}));await unlink(part);return uploadState(id);}),
      prepare:command=>run(async()=>{
        exact(command,['operationId','expectedRevision','action','payload']);operation(command.operationId);
        need(['initialize','review','stage','select','receive-run','buyer-plan','receive','start','stop','export','installation-template','installation-prepare'].includes(command.action)&&object(command.payload)&&Number.isInteger(command.expectedRevision)&&command.expectedRevision>=0,'COMMAND_REQUIRED','Choose a complete documented command.');
        const path=join(ui,'requests',command.operationId+'.json'),old=await json(path,true);
        if(old){need(stable(old)===stable(command),'REQUEST_CONFLICT','The original prepared request differs.',409);return{request:old,replayed:true};}
        const revision=job?(await job.inspect()).revision:0;
        need(command.expectedRevision===revision,'REVISION_CONFLICT','Refresh the original job before preparing new work.',409);
        if(command.action==='installation-template'||command.action==='installation-prepare')await installation.binding(command,await jobRequired().inspect());
        await publish(path,encode(command));return{request:command,replayed:false};
      }),
      receive:operationId=>run(async()=>{
        operation(operationId);const request=await json(join(ui,'requests',operationId+'.json'),true),complete=await json(join(ui,'results',operationId+'.json'),true);
        if(complete)return{state:'COMPLETE',request,receipt:complete};
        if(!request)return{state:'NOT_FOUND',operationId};
        const s=job?await job.inspect():null,original=s?.results.find(r=>r.operationId===operationId);
        return{state:original?'RECONCILIATION_REQUIRED':'PENDING',request,nativeResultPresent:!!original,message:original?'Apply the exact retained request to compare its complete native command identity.':undefined,runs:s?.runs.filter(r=>r.operationId===operationId)??[]};
      }),
      act:command=>run(async()=>{
        exact(command,['operationId','expectedRevision','action','payload']);operation(command.operationId);
        need(Number.isInteger(command.expectedRevision)&&command.expectedRevision>=0&&typeof command.action==='string'&&object(command.payload),'COMMAND_REQUIRED','Select an exact original operation and revision.');
        return retained(command,async()=>{
          if(command.action==='initialize')return initialize(command);
          const current=await jobRequired().inspect();
          if(command.action==='buyer-plan'){
            const p=command.payload;exact(p,['provider','template','requests']);
            if(await json(join(ui,'native-requests',command.operationId+'.json'),true))return executeBound(command,()=>{throw new Error('Existing native binding required.');});
            need(setup?.buyerTemplates[p.template],'BUYER_TEMPLATE_REQUIRED','Select an original host-declared buyer template.');
            const out=join(ui,'plans',command.operationId);await directory(out,true);
            return executeBound(command,async()=>({provider:p.provider,templateFile:setup.buyerTemplates[p.template].file,outputDirectory:out,requests:p.requests}));
          }
          if(command.action==='start'){
            exact(command.payload,['provider','expectedGeneration']);
            const recorded=current.runs.filter(r=>r.operationId===command.operationId);
            if(recorded.length){
              const intent=await json(join(root,'runs',command.operationId+'.json'));
              need(intent.operationId===command.operationId&&intent.provider===command.payload.provider&&intent.generation===command.payload.expectedGeneration,'RUN_INTENT_CONFLICT','The original run UUID belongs to a different provider or selection generation.',409);
              return{state:'ORIGINAL_RUN_RECORDED',operationId:command.operationId,runs:recorded};
            }
            need(command.expectedRevision===current.revision,'REVISION_CONFLICT','Refresh the job before starting a selected run.',409);
            const live=await job.start({operationId:command.operationId,...command.payload});
            const {completion,close,...started}=live;active={operationId:command.operationId,provider:command.payload.provider,started,close,completion};
            completion.then(()=>{if(active?.operationId===command.operationId)active=null;},()=>{if(active?.operationId===command.operationId)active=null;});
            return started;
          }
          if(command.action==='stop'){
            exact(command.payload,['runOperationId']);operation(command.payload.runOperationId);
            if(active){need(active.operationId===command.payload.runOperationId,'RUN_OWNER','Stop only this operator’s selected owned run.',409);await active.close();active=null;}
            const s=await job.inspect(),runs=s.runs.filter(r=>r.operationId===command.payload.runOperationId);
            need(runs.some(r=>r.endedAt),'RUN_OWNER','This process has no live owner for that run; inspect its original native observation.',409);return{runOperationId:command.payload.runOperationId,runs};
          }
          if(command.action==='export'){exact(command.payload,[]);return transfer(command);}
          if(command.action==='installation-template'||command.action==='installation-prepare')return installation.execute(command,current);
          return executeBound(command,()=>commandInput(command.action,command.payload));
        });
      }),
      installations:()=>run(async()=>installation.catalog(await jobRequired().inspect())),
      installationArchive:id=>run(()=>installation.archive(operation(id))),
      installation:({id,kind,offset=0,limit=50})=>run(()=>installation.view(operation(id),{kind,offset,limit})),
      readFile:({kind,id,name}={})=>run(async()=>{
        if(kind==='installation')return installation.file(operation(id),text(name,'Original preparation filename',1000));
        let path,filename,type='application/octet-stream';
        if(kind==='input'){need(HASH.test(id),'FILE_ID','Select an original input hash.');path=inputPath(id);filename=name?text(name,'Filename',240).replace(/[\/\\\r\n]/g,'_'):id;}
        else if(kind==='blob'){need(HASH.test(id),'FILE_ID','Select an original source hash.');jobRequired();path=join(root,'blobs',id);filename=id;}
        else if(kind==='buyer'){need(/^[a-f0-9-]{36}-[a-z0-9_-]{1,64}\.(?:json|body)$/.test(id),'FILE_ID','Select the complete prepared buyer file.');jobRequired();path=join(root,'buyers',id);filename=id;}
        else if(kind==='buyer-execution'){
          need(/^[a-f0-9-]{36}-[a-z0-9_-]{1,64}\.json$/.test(id),'FILE_ID','Select an original prepared buyer configuration.');
          const operationId=id.slice(0,36),requestId=id.slice(37,-5),s=await jobRequired().inspect(),result=s.results.find(r=>r.operationId===operationId&&r.action==='buyer-plan');
          const file=result?.result.files.find(f=>f.requestId===requestId);
          need(file,'ORIGINAL_BUYER_PLAN_REQUIRED','Select the complete original buyer plan.',404);
          const raw=await ordinary(join(root,'buyers',id));need(digest(raw)===file.configSha256,'BUYER_SOURCE_CHANGED','The original buyer configuration differs.',409);
          const config=JSON.parse(raw.toString('utf8')),destination=join(ui,'plans',operationId);await directory(destination,true);
          const originalRequest=await json(join(ui,'requests',operationId+'.json'),true),alias=originalRequest?.payload?.template;
          if(setup&&alias&&setup.buyerTemplates[alias]){
            const host=await readBuyerConfiguration(setup.buyerTemplates[alias].file);validateBuyerExecution(host);
            need(host.operator.actor===config.operator.actor&&host.operator.service===config.operator.service&&(host.trustedPayer??null)===(config.trustedPayer??null),'BUYER_OWNER_CHANGED','The current host template must retain the original buyer actor, service and trusted payer.',409);
            config.operator={...config.operator,python:host.operator.python,policy:host.operator.policy,ledger:host.operator.ledger};
            config.signerModule=host.signerModule;config.evidenceDir=host.evidenceDir;
          }
          if(config.operation.bodyFile){
            const bodyPath=join(root,'buyers',operationId+'-'+requestId+'.body'),actual=await hashFile(bodyPath);
            need(actual.bytes===config.operation.bodyBytes&&actual.sha256===config.operation.bodySha256,'BUYER_SOURCE_CHANGED','The original request body differs.',409);
            config.operation.bodyFile=bodyPath;
          }
          config.responseFile.destination=join(destination,operationId+'-'+requestId+'.response');
          validateBuyerExecution(config);const content=encode(config);return{body:content,bytes:content.length,sha256:digest(content),filename:id.replace('.json','-execution.json'),contentType:'application/json'};
        }
        else if(kind==='command'){operation(id);path=join(ui,'requests',id+'.json');filename='original-command-'+id+'.json';type='application/json';}
        else if(kind==='report'){const content=Buffer.from(renderCommissioningReport(await jobRequired().report(),await job.inspect()));return{body:content,bytes:content.length,sha256:digest(content),filename:'commissioning-report.html',contentType:'text/html; charset=utf-8'};}
        else if(kind==='transfer'){operation(id);const base=join(exportsRoot,id),manifest=await json(join(base,'OPERATOR_TRANSFER.json'));if(name==='OPERATOR_TRANSFER.json'){path=join(base,name);filename=name;}else{const f=manifest.files.find(f=>f.path===name);need(f,'FILE_ID','Select a complete retained transfer member.',404);path=join(base,f.path);filename=f.path.split('/').pop();const got=await hashFile(path);need(got.sha256===f.sha256&&got.bytes===f.bytes,'TRANSFER_CHANGED','The retained transfer changed.',409);}}
        else throw fail('FILE_KIND','Choose an original source, report, buyer configuration or retained transfer file.');
        const metadata=await hashFile(path);return{path,filename,contentType:type,...metadata};
      }),
      archive:operationId=>run(async()=>{
        operation(operationId);const base=join(exportsRoot,operationId),manifest=await json(join(base,'OPERATOR_TRANSFER.json'));
        const exportReceipt=await json(join(ui,'results',operationId+'.json'));
        need(exportReceipt.action==='export'&&stable(exportReceipt.result)===stable(manifest),'EXPORT_RECEIPT_REQUIRED','Receive the completed original export before downloading it.',409);
        await publish(join(base,'OPERATOR_EXPORT_RECEIPT.json'),encode(exportReceipt));
        for(const f of manifest.files){const got=await hashFile(join(base,f.path));need(got.bytes===f.bytes&&got.sha256===f.sha256,'TRANSFER_CHANGED','A selected complete transfer member changed.',409);}
        const target=join(exportsRoot,operationId+'.tar'),receipt=target+'.json';
        const complete=await json(receipt,true);
        if(complete){const got=await hashFile(target);need(got.bytes===complete.bytes&&got.sha256===complete.sha256,'TRANSFER_CHANGED','The retained complete archive changed.',409);return{path:target,filename:'commissioning-'+operationId+'.tar',contentType:'application/x-tar',...got};}
        const temporary=join(exportsRoot,'.'+operationId+'-'+randomUUID()+'.tar');
        try{
          await new Promise((yes,no)=>{
            const child=spawn('tar',['--format=ustar','--numeric-owner','--owner=0','--group=0','--mtime=@0','-cf',temporary,'-C',base,'.'],{stdio:['ignore','ignore','pipe'],env:{...process.env,LC_ALL:'C'}});
            let errorText='',spawnError=null,timedOut=false;child.stderr.on('data',b=>{errorText=(errorText+b.toString()).slice(-8000);});
            const timeout=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},120000);
            const kill=setTimeout(()=>child.kill('SIGKILL'),125000);
            child.once('error',e=>{spawnError=e;});
            child.once('close',code=>{clearTimeout(timeout);clearTimeout(kill);if(spawnError)no(spawnError);else if(code!==0||timedOut)no(fail('ARCHIVE_INTERRUPTED','The complete source remains retained. TAR '+(timedOut?'timed out':String(code))+': '+errorText,500));else yes();});
          });
          const actual=await hashFile(temporary);
          for(const f of manifest.files){const got=await hashFile(join(base,f.path));need(got.bytes===f.bytes&&got.sha256===f.sha256,'TRANSFER_CHANGED','A retained source changed during archive creation.',409);}
          try{await link(temporary,target);}catch(e){if(e.code!=='EEXIST')throw e;const original=await hashFile(target);need(original.sha256===actual.sha256&&original.bytes===actual.bytes,'ARCHIVE_CHANGED','An existing original archive has different bytes.',409);}
          await publish(receipt,encode({...actual,operationId,manifestSha256:digest(await ordinary(join(base,'OPERATOR_TRANSFER.json')))}));
          return{path:target,filename:'commissioning-'+operationId+'.tar',contentType:'application/x-tar',...actual};
        }finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
      }),
      async close(){if(!closing){stopping=true;closing=(async()=>{await queue;const errors=[];try{if(job)await job.close();}catch(e){errors.push(e);}try{await release();}catch(e){errors.push(e);}if(errors.length)throw new AggregateError(errors,'The original commissioning owner could not close cleanly.');})();}return closing;},
    };
  }catch(e){try{if(job)await job.close();}catch(closeError){e=new AggregateError([e,closeError],'Opening and closing the original job both failed.');}await release();throw e;}
}
