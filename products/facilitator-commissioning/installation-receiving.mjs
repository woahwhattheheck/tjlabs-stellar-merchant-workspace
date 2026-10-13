// SPDX-License-Identifier: MIT
// Continue a complete reviewed preparation through the original SF47 writer.
// Clients are borrowed; this module owns no application, database or financial authority.
import {resolve,join,dirname} from 'node:path';
import {readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readWorkflowSeriesPrivateFile,workflowSeriesPrivateDirectory} from '../../stellar-forge/mcp-merchant-operator/workflow-series-connection.mjs';
import {writeConsoleWorkflowFile} from '../../stellar-forge/mcp-merchant-operator/console/client-files.mjs';
import {lockPrivateDirectory} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/private-directory-lock.mjs';
import {readPreparedInstallation,copyPreparedInstallation} from './installation-receiving-source.mjs';

export const RECEIVING_SCHEMA='stellar-forge.facilitator-installation-receiving.v1';
const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const MAX_FILE=128*1024*1024,MAX_ARCHIVE=32*1024*1024;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const ordered=x=>Array.isArray(x)?x.map(ordered):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;
const canonical=x=>JSON.stringify(ordered(x)),same=(a,b)=>canonical(a)===canonical(b);
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=(code,message)=>Object.assign(new Error(message),{code,status:409});
const need=(ok,message,code='INSTALLATION_RECEIVING')=>{if(!ok)throw fail(code,message);};
function exact(x,keys){need(object(x)&&Object.keys(x).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(x,k)),'Use every complete declared original input field.');}
function operationId(x){need(typeof x==='string'&&UUID.test(x),'Retain the original operation UUID.');return x;}
function text(x,label,max){need(typeof x==='string'&&x.trim()&&x.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x),label+' is required within its native bound.');return x;}
async function raw(path,optional=false){try{return await readWorkflowSeriesPrivateFile(path,MAX_FILE);}catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}}
function parse(bytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
async function json(path,optional=false){const b=await raw(path,optional);return b===null?null:parse(b);}
function binding(x){
  need(object(x)&&typeof x.directory==='string'&&resolve(x.directory)===x.directory&&HASH.test(x.selectionSha256||''),'Select an inspected original Grant workspace binding.');
  return {directory:x.directory,selectionSha256:x.selectionSha256,label:text(x.label,'Workspace label',240)};
}
function originalEdition(value){const {current,...edition}=value;return edition;}
function sourceOf(state){
  need(object(state?.program)&&object(state.plan),'Read the complete original Operations case.');
  return {caseId:state.program.id,version:state.program.version,mode:state.program.mode,
    planId:state.plan.id,planRevision:state.plan.revision,planContentSha256:state.plan.contentSha256,
    planSourceSha256:state.plan.source?.sha256};
}
function responseValue(value){
  need(object(value)&&value.schema===RECEIVING_SCHEMA+'.response'&&object(value.response),'Keep the complete original native response.');
  const r=value.response;
  need(r.encoding==='base64'&&typeof r.content_base64==='string','The original native response bytes are missing.');
  const bytes=Buffer.from(r.content_base64,'base64');
  need(bytes.toString('base64')===r.content_base64&&bytes.length===r.bytes&&sha(bytes)===r.sha256,'The complete original response identity changed.');
  need(typeof r.mediaType==='string'&&Number.isInteger(r.status)&&r.status>=200&&r.status<300,'Keep the actual successful original native response.');
  return {...r,bytes,value:/^application\/json\b/i.test(r.mediaType)?parse(bytes):undefined};
}
function envelope(response){
  need(Buffer.isBuffer(response?.bytes)&&response.bytes.length<=64*1024*1024&&response.sha256===sha(response.bytes),'The native client did not return its complete original bytes.');
  const value={schema:RECEIVING_SCHEMA+'.response',response:{
    encoding:'base64',content_base64:response.bytes.toString('base64'),bytes:response.bytes.length,
    sha256:response.sha256,mediaType:response.mediaType,status:response.status,
    source:response.source??null,filename:response.filename??null}};
  responseValue(value);need(encode(value).length<=MAX_FILE,'The full native response exceeds its retained-file bound.');
  return value;
}

/** One private receiving journal; the existing clients keep their original lifetimes. */
export async function openInstallationReceiving({directory,sourceClient,receivingClient,sourceBinding,receivingBinding}){
  const root=resolve(text(directory,'Private receiving directory',4000));
  const source=binding(sourceBinding),receiving=binding(receivingBinding);
  need(source.directory!==receiving.directory,'Choose the independently receiving original workspace.');
  for(const client of [sourceClient,receivingClient])need(client&&typeof client.read==='function'&&typeof client.download==='function'&&typeof client.importBundle==='function','Use the original GrantWorkspaceClient.');
  await workflowSeriesPrivateDirectory(dirname(root));
  await workflowSeriesPrivateDirectory(root,true);
  const release=await lockPrivateDirectory({directory:root,filename:'installation-receiving.lock',namespace:'facilitator-installation-receiving',
    busyCode:'INSTALLATION_RECEIVING_BUSY',unavailableCode:'INSTALLATION_RECEIVING_LOCK_UNAVAILABLE'});
  let closing=null,stopping=false,queue=Promise.resolve();
  const returned=new Map(),validatedReturns=new Set(),failureObservations=new Map();
  const run=fn=>{if(stopping)return Promise.reject(fail('INSTALLATION_RECEIVING_CLOSING','Finish the original receiving close.'));const p=queue.then(fn);queue=p.catch(()=>{});return p;};
  const owner={schema:RECEIVING_SCHEMA+'.owner',source,receiving};
  try{await writeConsoleWorkflowFile(join(root,'OWNER.json'),owner);}catch(e){await release();throw e;}
  const folder=id=>join(root,operationId(id));
  async function publish(dir,name,value){return writeConsoleWorkflowFile(join(dir,name),Buffer.isBuffer(value)?value:encode(value));}
  async function input(id){
    const dir=folder(id),value=await json(join(dir,'intent.json'));
    need(value.schema===RECEIVING_SCHEMA+'.intent'&&value.operationId===id&&same(value.owner,owner),'The original receiving selection belongs to another host binding.');
    const prepared=await readPreparedInstallation(join(dir,'preparation'),value.preparation.sha256);
    need(prepared.identity.bytes===value.preparation.bytes&&prepared.identity.sha256===value.preparation.sha256,'The full original preparation identity changed.');
    return {dir,intent:value,prepared,caseId:prepared.seed.source.caseId};
  }
  async function failure(dir,name,error,request){
    const observation={schema:RECEIVING_SCHEMA+'.error',operationId:dir.split(/[\\/]/).pop(),phase:name,
      observedAt:new Date().toISOString(),request:clone(request),error:{}};
    for(const field of ['code','message','status','definite','source','requestId','originalCode','originalStatus','route','uncertain'])
      if(error?.[field]!==undefined)observation.error[field]=clone(error[field]);
    if(!Object.hasOwn(observation.error,'message'))observation.error.message=String(error);
    const body=encode(observation),filename=name+'.error.'+sha(body)+'.json',path=join(dir,filename);
    failureObservations.set(path,observation);
    try{await publish(dir,filename,body);}catch(persistenceError){
      error.observationPersistenceError={code:persistenceError.code??null,message:String(persistenceError.message??persistenceError)};
    }
  }
  async function phase(dir,name,perform,validate,request){
    const path=join(dir,name+'.response.json'),key=path;
    let value=returned.get(key),disk=await json(path,true);
    if(value&&disk)need(same(value,disk),'The returned native response differs from its retained complete file.');
    value=disk??value;
    if(!value){
      let result;try{result=await perform();}catch(error){await failure(dir,name,error,request);throw error;}
      value=envelope(result);
      // Preserve a complete return even if validation or immutable publication fails.
      returned.set(key,value);
    }
    const decoded=responseValue(value);
    await validate(decoded);
    validatedReturns.add(key);
    await writeConsoleWorkflowFile(path,encode(value));
    return decoded;
  }
  async function readCurrentEdition(ctx,receipt){
    const selected=receipt.value;
    need(selected.id===ctx.caseId&&selected.action==='installation.save'&&selected.kind==='installation'&&
      typeof selected.recordId==='string'&&Number.isInteger(selected.revision)&&HASH.test(selected.sha256||''),
      'The original save response identifies another Installation.');
    const actual=await sourceClient.read('installation',{caseId:ctx.caseId,installationId:selected.recordId,revision:selected.revision});
    need(actual.value?.sha256===selected.sha256&&actual.value.revision===selected.revision&&actual.value.id===selected.recordId,
      'The original saved Installation is absent or changed. Reopen its complete original workspace; do not resubmit known acceptance.');
    const reviewed=responseValue(await json(join(ctx.dir,'preview.response.json')));
    need(same(actual.value.preview,reviewed.value),'The original saved Installation differs from its exact retained preview.');
    return actual;
  }
  async function retainEdition(dir,name,response){
    const path=join(dir,name+'.response.json'),old=await json(path,true);
    if(old){need(same(originalEdition(responseValue(old).value),originalEdition(response.value)),'The original complete edition changed.');return;}
    await publish(dir,name+'.response.json',envelope(response));
  }
  async function preparedPreview(ctx){
    const preview=responseValue(await json(join(ctx.dir,'preview.response.json')));
    const command=await json(join(ctx.dir,'save-request.json'));
    const expected={...ctx.prepared.previewInput,document:preview.value.document,
      expectedPreviewSha256:preview.value.previewSha256,requestId:'facilitator-installation-save-'+ctx.intent.operationId,
      actor:ctx.intent.actor,note:ctx.intent.note};
    need(same(command,expected),'Keep the complete original save request and reviewed native document.');
    return {preview,command};
  }
  async function prepare(args){
    exact(args,['operationId','preparationDirectory','expectedPreparationSha256','actor','note','receivingName']);
    const id=operationId(args.operationId);
    need(HASH.test(args.expectedPreparationSha256),'Select the actual completed preparation SHA256.');
    text(args.actor,'Recording operator',300);text(args.note,'Installation reason',12000);text(args.receivingName,'Receiving case name',300);
    const dir=folder(id);await workflowSeriesPrivateDirectory(dir,true);
    const prior=await json(join(dir,'intent.json'),true);
    if(prior){
      need(prior.operationId===id&&prior.preparation.sha256===args.expectedPreparationSha256&&prior.actor===args.actor&&
        prior.note===args.note&&prior.receivingName===args.receivingName&&same(prior.owner,owner),
        'This UUID already retains different original preparation or operator choices.');
    }else{
      const prepared=await readPreparedInstallation(resolve(args.preparationDirectory),args.expectedPreparationSha256);
      await copyPreparedInstallation(prepared,join(dir,'preparation'));
      const value={schema:RECEIVING_SCHEMA+'.intent',operationId:id,owner,preparation:prepared.identity,
        actor:args.actor,note:args.note,receivingName:args.receivingName};
      await publish(dir,'intent.json',value);
    }
    const ctx=await input(id);
    const preview=await phase(dir,'preview',async()=>{
      const current=await sourceClient.read('case',{caseId:ctx.caseId});
      need(same(sourceOf(current.value),ctx.prepared.seed.source),'The original case or plan changed. Retain this preparation and select a new current case/seed through the original desk.');
      const priorCase=await json(join(dir,'case-before-preview.response.json'),true);
      if(priorCase)need(same(sourceOf(responseValue(priorCase).value),ctx.prepared.seed.source),'The retained original case observation differs.');
      else await publish(dir,'case-before-preview.response.json',envelope(current));
      return sourceClient.installationPreview(ctx.caseId,ctx.prepared.previewInput);
    },async result=>{
      const v=result.value,expected=ctx.prepared.previewInput;
      need(v?.schema==='stellar-forge.sf47-installation.v1'&&v.installationId===expected.installationId&&v.expectedRevision===expected.expectedRevision&&
        same(v.source,ctx.prepared.seed.source)&&HASH.test(v.previewSha256||''),'The native preview identifies another original case, plan or Installation.');
      for(const key of ['workorder','assignments','checks','workshare','workflowPeriods','coordination'])
        need(same(v.document[key],ctx.prepared.document[key]),'The native preview changed the original funded, commercial or acceptance assignment.');
      for(const expectedProvider of ctx.prepared.document.payment.facilitators){
        const actual=v.document.payment.facilitators.find(x=>x.operatorId===expectedProvider.operatorId&&x.endpoint===expectedProvider.endpoint);
        need(actual&&same(actual.sourceIds,expectedProvider.sourceIds),'The native preview changed an original provider/source selection.');
      }
    },{caseId:ctx.caseId,body:ctx.prepared.previewInput});
    const command={...ctx.prepared.previewInput,document:preview.value.document,expectedPreviewSha256:preview.value.previewSha256,
      requestId:'facilitator-installation-save-'+id,actor:args.actor,note:args.note};
    await publish(dir,'save-request.json',command);
    return read(id);
  }
  async function save(id){
    const ctx=await input(id),{preview,command}=await preparedPreview(ctx);
    const result=await phase(ctx.dir,'save',()=>sourceClient.installationSave(ctx.caseId,command),async response=>{
      const v=response.value;
      need(v?.id===ctx.caseId&&v.action==='installation.save'&&v.kind==='installation'&&
        v.version===preview.value.source.version+1&&v.revision===preview.value.expectedRevision+1&&HASH.test(v.sha256||'')&&
        (preview.value.installationId===null||v.recordId===preview.value.installationId),'The native saved result differs from the retained original request.');
    },{caseId:ctx.caseId,body:command});
    // A retained acceptance is never dispatched into an older restored database.
    const edition=await readCurrentEdition(ctx,result);
    await retainEdition(ctx.dir,'saved-edition',edition);
    return read(id);
  }
  async function exported(id){
    const ctx=await input(id),receiptValue=await json(join(ctx.dir,'save.response.json'));
    const receipt=responseValue(receiptValue);
    const selection={caseId:ctx.caseId,installationId:receipt.value.recordId,revision:receipt.value.revision};
    // A persisted save may precede an interrupted edition read/publication.
    // Finish that original evidence before exposing any complete export.
    if(!await json(join(ctx.dir,'saved-edition.response.json'),true))
      await retainEdition(ctx.dir,'saved-edition',await readCurrentEdition(ctx,receipt));
    await phase(ctx.dir,'export',async()=>{
      await retainEdition(ctx.dir,'saved-edition',await readCurrentEdition(ctx,receipt));
      return sourceClient.download('installation',selection);
    },async response=>{
        need(response.bytes.length>0&&response.bytes.length<=MAX_ARCHIVE&&/^(application\/zip|application\/octet-stream)\b/i.test(response.mediaType),
          'Retain the entire native operating-case ZIP within the original 32 MiB receiving bound.');
      },{kind:'installation',...selection});
    return read(id);
  }
  async function receive(id){
    const ctx=await input(id),saved=responseValue(await json(join(ctx.dir,'save.response.json')));
    const exported=responseValue(await json(join(ctx.dir,'export.response.json')));
    need(exported.bytes.length>0&&exported.bytes.length<=MAX_ARCHIVE,'Use the complete original case ZIP within its receiving bound.');
    const request={name:ctx.intent.receivingName,actor:ctx.intent.actor,requestId:'facilitator-installation-receive-'+id};
    await publish(ctx.dir,'receive-request.json',{schema:RECEIVING_SCHEMA+'.import',archive:{bytes:exported.bytes.length,sha256:exported.sha256},body:request});
    const imported=await phase(ctx.dir,'receive',()=>receivingClient.importBundle('case',exported.bytes,request),async response=>{
      const v=response.value,selection=v?.selectedInstallation;
      need(v?.action==='import'&&typeof v.id==='string'&&selection?.id===saved.value.recordId&&
        selection.revision===saved.value.revision&&selection.sha256===saved.value.sha256,
        'The native receiving result selected a different complete Installation edition.');
    },{kind:'case',archive:{bytes:exported.bytes.length,sha256:exported.sha256},body:request});
    // This read runs for every cold continuation, including a retained original import.
    // Its failure must never create a replacement case.
    const edition=await receivingClient.read('installation',{caseId:imported.value.id,
      installationId:saved.value.recordId,revision:saved.value.revision});
    const original=responseValue(await json(join(ctx.dir,'saved-edition.response.json')));
    need(same(originalEdition(edition.value),originalEdition(original.value)),
      'The independently received original edition is absent or changed. Restore its complete accepted workspace.');
    const state=await receivingClient.read('case',{caseId:imported.value.id});
    need(state.value?.program?.id===imported.value.id&&state.value.program.origin?.archiveSha256===exported.sha256&&
      state.value.program.origin.programId===ctx.caseId,'The receiving case does not retain this exact original whole-case archive.');
    for(const source of ctx.prepared.binding.sourceBindings){
      const actual=state.value.sources.find(x=>x.id===source.sourceId);
      need(actual&&actual.bytes===source.bytes&&actual.sha256===source.sha256,'A complete original commissioning source is missing from the received case.');
    }
    await retainEdition(ctx.dir,'received-edition',edition);
    // Current case observations may advance after independent use. Retain each full observation by bytes.
    await publish(ctx.dir,'received-case-'+state.sha256+'.response.json',envelope(state));
    const result={schema:RECEIVING_SCHEMA+'.complete',operationId:id,preparation:ctx.intent.preparation,
      original:{caseId:ctx.caseId,installationId:saved.value.recordId,revision:saved.value.revision,sha256:saved.value.sha256},
      receiving:{caseId:imported.value.id,planId:imported.value.planId,workspace:receiving,importedVersion:imported.value.version},
      archive:{bytes:exported.bytes.length,sha256:exported.sha256},saveRequestId:'facilitator-installation-save-'+id,
      receiveRequestId:request.requestId};
    await publish(ctx.dir,'RECEIVED.json',result);
    return read(id);
  }
  async function read(id){
    const ctx=await input(id),responses={};
    for(const name of ['preview','save','export','receive']){
      const path=join(ctx.dir,name+'.response.json'),disk=await json(path,true),stored=disk??returned.get(path);
      if(stored){const r=responseValue(stored);responses[name]={validated:!!disk||validatedReturns.has(path),sha256:r.sha256,bytes:r.bytes.length,mediaType:r.mediaType,
        ...(r.value===undefined?{}:{value:r.value})};}
    }
    const errors=new Map();
    for(const filename of (await readdir(ctx.dir)).filter(x=>/^(preview|save|export|receive)\.error\.[a-f0-9]{64}\.json$/.test(x))){
      const body=await raw(join(ctx.dir,filename)),value=parse(body);
      need(filename.split('.')[2]===sha(body)&&value.schema===RECEIVING_SCHEMA+'.error'&&value.operationId===id,'The retained error observation changed.');
      errors.set(filename,value);
    }
    for(const [path,value]of failureObservations)if(dirname(path)===ctx.dir)errors.set(path.split(/[\\/]/).pop(),value);
    const completion=await json(join(ctx.dir,'RECEIVED.json'),true);
    return {schema:RECEIVING_SCHEMA,operationId:id,intent:ctx.intent,
      state:completion?'RECEIVED':responses.receive?.validated?'VERIFY_RECEIVING':responses.export?.validated?'EXPORTED':responses.save?.validated?'SAVED':responses.preview?.validated?'PREVIEWED':'PREPARED',
      preparation:ctx.prepared.identity,basis:ctx.prepared.binding.basis,selections:ctx.prepared.preparation.selections??[],
      responses,errors:[...errors].map(([filename,observation])=>({filename,observation})),completion,saveRequest:await json(join(ctx.dir,'save-request.json'),true),
      receiveRequest:await json(join(ctx.dir,'receive-request.json'),true)};
  }
  async function file(id,name){
    text(name,'Declared file',1000);
    const ctx=await input(id);
    const formats={'native-preview.json':'preview','native-save.json':'save','complete-case.zip':'export','native-receive.json':'receive',
      'original-saved-edition.json':'saved-edition','independently-received-edition.json':'received-edition'};
    if(Object.hasOwn(formats,name)){
      const path=join(ctx.dir,formats[name]+'.response.json'),saved=await json(path,true)??returned.get(path);
      need(saved,'The original response has not returned for this phase.');
      const response=responseValue(saved);
      return {body:response.bytes,bytes:response.bytes.length,sha256:response.sha256,filename:name,contentType:response.mediaType};
    }
    if(name==='operation.json'){const body=encode(await read(id));return{body,bytes:body.length,sha256:sha(body),filename:name,contentType:'application/json'};}
    const allowed=new Set(['intent.json','save-request.json','receive-request.json','RECEIVED.json']);
    if(/^(preview|save|export|receive)\.error\.[a-f0-9]{64}\.json$/.test(name)){const value=(await read(id)).errors.find(x=>x.filename===name);need(value,'Select a retained original error observation.');const body=encode(value.observation);return{body,bytes:body.length,sha256:sha(body),filename:name,contentType:'application/json'};}
    if(allowed.has(name)){const body=await raw(join(ctx.dir,name));return{body,bytes:body.length,sha256:sha(body),filename:name,contentType:'application/json'};}
    if(name.startsWith('preparation/')){
      const relative=name.slice('preparation/'.length),member=ctx.prepared.files.find(x=>x.path===relative);
      need(member,'Select an original complete preparation member.');
      const body=await raw(join(ctx.dir,'preparation',relative));
      need(body.length===member.bytes&&sha(body)===member.sha256,'The complete selected original file changed.');
      return{body,bytes:body.length,sha256:member.sha256,filename:relative.split('/').pop(),contentType:'application/octet-stream'};
    }
    throw fail('INSTALLATION_RECEIVING_FILE','Choose a declared original operation or preparation file.');
  }
  return {
    directory:root,prepare:args=>run(()=>prepare(args)),save:id=>run(()=>save(operationId(id))),
    export:id=>run(()=>exported(operationId(id))),receive:id=>run(()=>receive(operationId(id))),
    read:id=>run(()=>read(operationId(id))),file:(id,name)=>run(()=>file(operationId(id),name)),
    list:()=>run(async()=>{const rows=[];for(const name of (await readdir(root)).filter(x=>UUID.test(x)).sort()){
      if(!await raw(join(root,name,'intent.json'),true))continue;
      const value=await read(name);rows.push({operationId:name,state:value.state,basis:value.basis,preparation:value.preparation});}return{schema:RECEIVING_SCHEMA,owner,items:rows};}),
    close(){if(!closing){stopping=true;closing=(async()=>{await queue;await release();})();}return closing;}
  };
}
