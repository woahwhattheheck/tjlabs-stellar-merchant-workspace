// SPDX-License-Identifier: MIT
// Continue a complete reviewed preparation through the original SF47 writer.
// Clients are borrowed; this module owns no application, database or financial authority.
import {resolve,join,dirname} from 'node:path';
import {readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readWorkflowSeriesPrivateFile,workflowSeriesPrivateDirectory} from '../../stellar-forge/mcp-merchant-operator/workflow-series-connection.mjs';
import {writeConsoleWorkflowFile} from '../../stellar-forge/mcp-merchant-operator/console/client-files.mjs';
import {lockPrivateDirectory} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/private-directory-lock.mjs';
import {readPreparedInstallation,copyPreparedInstallation,validatePreparedInstallationMembers} from './installation-receiving-source.mjs';

export const RECEIVING_SCHEMA='stellar-forge.facilitator-installation-receiving.v1';
const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const MAX_SNAPSHOT_BYTES=512*1024*1024;
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
    await restored(id);
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
    let value=returned.get(key),disk=await json(path,true),observed=await json(join(dir,name+'.observed-response.json'),true);
    for(const prior of [disk,observed])if(value&&prior)need(same(value,prior),'The returned native response differs from its retained complete file.');else if(prior)value=prior;
    if(disk&&observed)need(same(disk,observed),'The observed response differs from its validated receipt.');
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
    const dir=folder(id);await workflowSeriesPrivateDirectory(dir,true);await restored(id);
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
      const path=join(ctx.dir,name+'.response.json'),disk=await json(path,true),stored=disk??returned.get(path)??await json(join(ctx.dir,name+'.observed-response.json'),true);
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
      const path=join(ctx.dir,formats[name]+'.response.json'),saved=await json(path,true)??returned.get(path)??await json(join(ctx.dir,formats[name]+'.observed-response.json'),true);
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

  function validatePreview(ctx,result){
    const v=result.value,expected=ctx.prepared.previewInput;
    need(v?.schema==='stellar-forge.sf47-installation.v1'&&v.installationId===expected.installationId&&v.expectedRevision===expected.expectedRevision&&
      same(v.source,ctx.prepared.seed.source)&&HASH.test(v.previewSha256||''),'The native preview identifies another original case, plan or Installation.');
    for(const key of ['workorder','assignments','checks','workshare','workflowPeriods','coordination'])
      need(same(v.document[key],ctx.prepared.document[key]),'The native preview changed the original funded, commercial or acceptance assignment.');
    for(const expectedProvider of ctx.prepared.document.payment.facilitators){
      const actual=v.document.payment.facilitators.find(x=>x.operatorId===expectedProvider.operatorId&&x.endpoint===expectedProvider.endpoint);
      need(actual&&same(actual.sourceIds,expectedProvider.sourceIds),'The native preview changed an original provider/source selection.');
    }
  }
  function saveCommand(ctx,preview){return {...ctx.prepared.previewInput,document:preview.value.document,
    expectedPreviewSha256:preview.value.previewSha256,requestId:'facilitator-installation-save-'+ctx.intent.operationId,
    actor:ctx.intent.actor,note:ctx.intent.note};}
  function validateSave(ctx,preview,response){
    const v=response.value;
    need(v?.id===ctx.caseId&&v.action==='installation.save'&&v.kind==='installation'&&
      v.version===preview.value.source.version+1&&v.revision===preview.value.expectedRevision+1&&HASH.test(v.sha256||'')&&
      (preview.value.installationId===null||v.recordId===preview.value.installationId),'The native saved result differs from the retained original request.');
    need(typeof v.recordId==='string','The original saved Installation identity is missing.');
  }
  function validateSavedEdition(ctx,receipt,actual,preview){
    const selected=receipt.value;
    need(selected.id===ctx.caseId&&selected.action==='installation.save'&&selected.kind==='installation'&&
      typeof selected.recordId==='string'&&Number.isInteger(selected.revision)&&HASH.test(selected.sha256||''),
      'The original save response identifies another Installation.');
    need(actual.value?.sha256===selected.sha256&&actual.value.revision===selected.revision&&actual.value.id===selected.recordId,
      'The original saved Installation is absent or changed. Reopen its complete original workspace; do not resubmit known acceptance.');
    need(same(actual.value.preview,preview.value),'The original saved Installation differs from its exact retained preview.');
  }
  function validateExport(response){
    need(response.bytes.length>0&&response.bytes.length<=MAX_ARCHIVE&&/^(application\/zip|application\/octet-stream)\b/i.test(response.mediaType),
      'Retain the entire native operating-case ZIP within the original 32 MiB receiving bound.');
  }
  function importRequest(ctx,exported){return {schema:RECEIVING_SCHEMA+'.import',archive:{bytes:exported.bytes.length,sha256:exported.sha256},
    body:{name:ctx.intent.receivingName,actor:ctx.intent.actor,requestId:'facilitator-installation-receive-'+ctx.intent.operationId}};}
  function validateReceive(saved,response){
    const v=response.value,selection=v?.selectedInstallation;
    need(v?.action==='import'&&typeof v.id==='string'&&selection?.id===saved.value.recordId&&
      selection.revision===saved.value.revision&&selection.sha256===saved.value.sha256,
      'The native receiving result selected a different complete Installation edition.');
  }
  function validateReceivedCase(ctx,imported,exported,state){
    need(state.value?.program?.id===imported.value.id&&state.value.program.origin?.archiveSha256===exported.sha256&&
      state.value.program.origin.programId===ctx.caseId,'The receiving case does not retain this exact original whole-case archive.');
    for(const source of ctx.prepared.binding.sourceBindings){
      const actual=state.value.sources.find(x=>x.id===source.sourceId);
      need(actual&&actual.bytes===source.bytes&&actual.sha256===source.sha256,'A complete original commissioning source is missing from the received case.');
    }
  }
  function completeRecord(ctx,saved,exported,imported){return {schema:RECEIVING_SCHEMA+'.complete',operationId:ctx.intent.operationId,preparation:ctx.intent.preparation,
    original:{caseId:ctx.caseId,installationId:saved.value.recordId,revision:saved.value.revision,sha256:saved.value.sha256},
    receiving:{caseId:imported.value.id,planId:imported.value.planId,workspace:receiving,importedVersion:imported.value.version},
    archive:{bytes:exported.bytes.length,sha256:exported.sha256},saveRequestId:'facilitator-installation-save-'+ctx.intent.operationId,
    receiveRequestId:'facilitator-installation-receive-'+ctx.intent.operationId};}


  function snapshotPath(name,id){
    need(typeof name==='string'&&name.length<=1200&&!name.includes('\\')&&
      name.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[:\x00-\x1f\x7f]/.test(part)),
      'Keep every ordinary original receiving snapshot path.');
    need(name==='OWNER.json'||name.startsWith(id+'/'),'The snapshot contains another operation or owner path.');
    return name;
  }
  function fileRow(path,body){return {path,bytes:body.length,sha256:sha(body),encoding:'base64',content_base64:body.toString('base64')};}
  const metadata=packet=>({schema:packet.schema,operationId:packet.operationId,owner:packet.owner,preparation:packet.preparation,
    files:packet.files.map(({path,bytes,sha256})=>({path,bytes,sha256}))});
  function checkedSnapshot(selected){
    exact(selected,['schema','operationId','owner','preparation','files','contentSha256']);
    need(selected.schema===RECEIVING_SCHEMA+'.snapshot'&&same(selected.owner,owner),'Keep this original receiving owner and both exact inspected host bindings.');
    const id=operationId(selected.operationId);
    need(HASH.test(selected.contentSha256)&&Array.isArray(selected.files)&&selected.files.length>0&&selected.files.length<=20000,
      'Select the complete bounded receiving snapshot.');
    need(encode(selected).length<=MAX_SNAPSHOT_BYTES,'The complete receiving snapshot exceeds 512 MiB; no source or history is truncated.');
    need(sha(encode(metadata(selected)))===selected.contentSha256,'The original snapshot content identity changed.');
    const files=new Map();let total=0;
    for(const item of selected.files){
      exact(item,['path','bytes','sha256','encoding','content_base64']);snapshotPath(item.path,id);
      need(item.encoding==='base64'&&typeof item.content_base64==='string'&&Number.isSafeInteger(item.bytes)&&item.bytes>=0&&item.bytes<=MAX_FILE&&HASH.test(item.sha256)&&!files.has(item.path),'The complete snapshot repeats or changes an original file identity.');
      const body=Buffer.from(item.content_base64,'base64');total+=body.length;
      need(body.toString('base64')===item.content_base64&&body.length===item.bytes&&sha(body)===item.sha256&&total<=MAX_SNAPSHOT_BYTES,
        'A complete original snapshot file differs from its retained bytes.');
      files.set(item.path,{path:item.path,bytes:item.bytes,sha256:item.sha256,raw:body});
    }
    const get=name=>{const row=files.get(name==='OWNER.json'?name:id+'/'+name);need(row,'The full original snapshot is missing '+name+'.');return parse(row.raw);};
    const optional=name=>files.has(id+'/'+name)?get(name):null;
    need(same(get('OWNER.json'),owner),'The full original OWNER.json does not match this receiving selection.');
    const intent=get('intent.json');
    need(intent.schema===RECEIVING_SCHEMA+'.intent'&&intent.operationId===id&&same(intent.owner,owner)&&same(intent.preparation,selected.preparation),
      'Keep the complete original operation intention and preparation identity.');
    text(intent.actor,'Recording operator',300);text(intent.note,'Installation reason',12000);text(intent.receivingName,'Receiving case name',300);
    const preparationFiles=[...files.values()].filter(row=>row.path.startsWith(id+'/preparation/'))
      .map(row=>({...row,path:row.path.slice((id+'/preparation/').length)}));
    const prepared=validatePreparedInstallationMembers(preparationFiles,intent.preparation.sha256);
    need(same(prepared.identity,intent.preparation),'The portable original preparation changed.');
    const ctx={dir:folder(id),intent,prepared,caseId:prepared.seed.source.caseId};
    const responses={},observed={};
    for(const phaseName of ['preview','save','export','receive']){
      const value=optional(phaseName+'.response.json'),observation=optional(phaseName+'.observed-response.json');
      if(value)responses[phaseName]=responseValue(value);
      if(observation)observed[phaseName]=responseValue(observation);
      if(value&&observation)need(same(value,observation),'The complete observed return differs from its validated original receipt.');
    }
    const before=optional('case-before-preview.response.json');
    if(before)need(same(sourceOf(responseValue(before).value),prepared.seed.source),'The retained original case observation differs.');
    if(responses.preview){need(before,'The original preview is missing its case observation.');validatePreview(ctx,responses.preview);}
    const saveRequest=optional('save-request.json');
    if(saveRequest){need(responses.preview,'The original save request is missing its validated preview.');need(same(saveRequest,saveCommand(ctx,responses.preview)),'The original save request differs from its complete source selection.');}
    if(responses.save){need(saveRequest,'The original accepted save is missing its request.');validateSave(ctx,responses.preview,responses.save);}
    const saved=optional('saved-edition.response.json');
    if(saved){need(responses.save,'The saved original edition is missing its acceptance.');validateSavedEdition(ctx,responses.save,responseValue(saved),responses.preview);}
    if(responses.export){need(saved,'The complete native archive is missing its saved original edition.');validateExport(responses.export);}
    const receiveRequest=optional('receive-request.json');
    if(receiveRequest){need(responses.export&&responses.save,'The original receiving request is missing the full export or save receipt.');need(same(receiveRequest,importRequest(ctx,responses.export)),'The original receiving request differs from its retained archive.');}
    if(responses.receive){need(receiveRequest,'The native receiving acceptance is missing its original request.');validateReceive(responses.save,responses.receive);}
    const received=optional('received-edition.response.json');
    if(received){need(responses.receive&&saved,'The independently received edition is missing its original acceptance.');need(same(originalEdition(responseValue(received).value),originalEdition(responseValue(saved).value)),'The independent original edition differs from its saved source.');}
    const caseReturns=[];
    for(const row of files.values()){
      if(row.path==='OWNER.json'||row.path.startsWith(id+'/preparation/'))continue;
      const name=row.path.slice(id.length+1);
      if(['intent.json','case-before-preview.response.json','save-request.json','receive-request.json','saved-edition.response.json','received-edition.response.json','RECEIVED.json'].includes(name)||
        /^(preview|save|export|receive)\.(response|observed-response)\.json$/.test(name))continue;
      const error=/^(preview|save|export|receive)\.error\.([a-f0-9]{64})\.json$/.exec(name);
      if(error){
        const value=parse(row.raw);need(error[2]===row.sha256&&value.schema===RECEIVING_SCHEMA+'.error'&&value.operationId===id&&value.phase===error[1]&&object(value.error),'A complete original native error observation changed.');
        const requests={preview:{caseId:ctx.caseId,body:prepared.previewInput},save:saveRequest?{caseId:ctx.caseId,body:saveRequest}:null,
          export:responses.save?{kind:'installation',caseId:ctx.caseId,installationId:responses.save.value.recordId,revision:responses.save.value.revision}:null,
          receive:receiveRequest?{kind:'case',archive:receiveRequest.archive,body:receiveRequest.body}:null};
        need(requests[error[1]]&&same(value.request,requests[error[1]]),'The retained native error belongs to a different original request.');continue;
      }
      const caseReturn=/^received-case-([a-f0-9]{64})\.response\.json$/.exec(name);
      if(caseReturn){const response=responseValue(parse(row.raw));need(response.sha256===caseReturn[1]&&responses.receive&&responses.export,'The returned case observation is missing its original receiving receipt.');validateReceivedCase(ctx,responses.receive,responses.export,response);caseReturns.push(response);continue;}
      if(/^restore-(intent|complete)\.[a-f0-9]{64}\.json$/.test(name))continue;
      need(false,'The complete receiving snapshot includes an undeclared member: '+name+'.');
    }
    for(const phaseName of ['preview','save','export','receive']){
      if(!observed[phaseName])continue;
      if(phaseName==='save')need(saveRequest,'The observed save return is missing its original request.');
      if(phaseName==='export')need(saved,'The observed export is missing its original saved edition.');
      if(phaseName==='receive')need(receiveRequest,'The observed receiving return is missing its original request.');
    }
    const completion=optional('RECEIVED.json');
    if(completion){need(responses.receive&&responses.export&&responses.save&&received&&caseReturns.length,'The completed receiving record is missing a full original phase.');need(same(completion,completeRecord(ctx,responses.save,responses.export,responses.receive)),'The complete receiving record differs from its original receipts.');}
    checkRestoreRecords(id,files,true);
    return {id,files,ctx,packet:clone(selected)};
  }
  function restoreIntent(value,id,digest){
    exact(value,['schema','operationId','owner','preparation','contentSha256','files']);
    need(value.schema===RECEIVING_SCHEMA+'.restore'&&value.operationId===id&&value.contentSha256===digest&&same(value.owner,owner)&&
      Array.isArray(value.files)&&value.files.length>0&&value.files.length<=20000,'The original restore intention changed.');
    const names=new Set();for(const row of value.files){
      exact(row,['path','bytes','sha256']);snapshotPath(row.path,id);
      need(!names.has(row.path)&&Number.isSafeInteger(row.bytes)&&row.bytes>=0&&row.bytes<=MAX_FILE&&HASH.test(row.sha256),'The original restore member identity changed.');names.add(row.path);
    }
    const meta={schema:RECEIVING_SCHEMA+'.snapshot',operationId:id,owner:value.owner,preparation:value.preparation,files:value.files};
    need(sha(encode(meta))===digest,'The original restore file roster changed.');return value;
  }
  function checkRestoreRecords(id,files,requireComplete){
    for(const [path,row]of files){
      const name=path.slice(id.length+1),match=/^restore-intent\.([a-f0-9]{64})\.json$/.exec(name);
      if(!match)continue;
      const intent=parse(row.raw),complete=files.get(id+'/restore-complete.'+match[1]+'.json');
      restoreIntent(intent,id,match[1]);
      if(requireComplete)need(complete,'The original restore is incomplete. Continue with its exact full snapshot before any native work.','INSTALLATION_RESTORE_PENDING');
      if(complete){
        need(same(parse(complete.raw),{...intent,schema:RECEIVING_SCHEMA+'.restored'}),'The completed restore differs from its original intention.');
        for(const expected of intent.files){const actual=files.get(snapshotPath(expected.path,id));need(actual&&actual.bytes===expected.bytes&&actual.sha256===expected.sha256,'A complete restored original member is missing or changed.');}
      }
    }
    for(const path of files.keys())if(path.startsWith(id+'/restore-complete.'))need(files.has(path.replace('/restore-complete.','/restore-intent.')),'The restored record is missing its original intention.');
  }
  async function restored(id){
    const dir=folder(id),required=new Map(),names=await readdir(dir);
    for(const name of names){
      const match=/^restore-intent\.([a-f0-9]{64})\.json$/.exec(name);
      if(!match)continue;
      const value=restoreIntent(await json(join(dir,name)),id,match[1]),complete=await json(join(dir,'restore-complete.'+match[1]+'.json'),true);
      need(complete&&same(complete,{...value,schema:RECEIVING_SCHEMA+'.restored'}),'The original restore is incomplete. Retry its exact full snapshot; do not dispatch native work.','INSTALLATION_RESTORE_PENDING');
      for(const row of value.files){const old=required.get(row.path);need(!old||same(old,row),'The original restore histories disagree about immutable bytes.');required.set(row.path,row);}
    }
    for(const name of names)if(/^restore-complete\.[a-f0-9]{64}\.json$/.test(name))need(names.includes(name.replace('restore-complete.','restore-intent.')),'A restored commitment lost its original intention.');
    for(const row of required.values()){
      let body;try{body=await raw(join(root,row.path));}catch(error){if(error.code!=='ENOENT')throw error;throw fail('INSTALLATION_RESTORE_PENDING','A retained restored member is missing. Restore the exact full original snapshot before any native work.');}
      need(body.length===row.bytes&&sha(body)===row.sha256,'A retained restored member changed. Restore its exact original bytes before any native work.','INSTALLATION_RESTORE_PENDING');
    }
  }
  async function operationFiles(id,expected=null,preparationDirectories=[]){
    const files=new Map(),known=new Map(),rootOwner=await raw(join(root,'OWNER.json'));
    for(const [path,value]of [...returned,...failureObservations])if(dirname(path)===folder(id)){
      const body=encode(value);known.set(id+'/'+path.split(/[\\/]/).pop(),{bytes:body.length,sha256:sha(body),raw:body});
    }
    files.set('OWNER.json',{path:'OWNER.json',bytes:rootOwner.length,sha256:sha(rootOwner),raw:rootOwner});
    const allowedDirectories=expected?new Set([id]):null;
    if(allowedDirectories)for(const name of preparationDirectories)allowedDirectories.add(id+'/preparation/'+name);
    if(allowedDirectories)for(const name of expected.keys()){let parts=name.split('/');parts.pop();while(parts.length){allowedDirectories.add(parts.join('/'));parts.pop();}}
    async function visit(relative){
      if(allowedDirectories)need(allowedDirectories.has(relative),'The destination contains an undeclared original directory.');
      const dir=join(root,relative);await workflowSeriesPrivateDirectory(dir);
      for(const name of (await readdir(dir)).sort()){
        const path=relative+'/'+name,full=join(root,path),stat=await lstat(full);
        need(!stat.isSymbolicLink(),'The original receiving member became a symbolic link.');
        if(stat.isDirectory()){need(path===id+'/preparation'||path.startsWith(id+'/preparation/'),'Keep only the original complete preparation directories.');await visit(path);continue;}
        need(stat.isFile(),'Keep complete regular receiving files.');
        const stage=/^\.(.+)\.pending-([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.exec(name);
        if(stage){
          const finalPath=relative+'/'+stage[1],final=expected?.get(finalPath)??known.get(finalPath);
          let completed;try{completed=await lstat(join(root,finalPath));}catch(error){if(error.code!=='ENOENT')throw error;}
          const body=await raw(full);
          if(final)need(body.length===final.bytes&&sha(body)===final.sha256,'The retained publication stage differs from this exact restore.');
          else need(completed&&completed.isFile()&&!completed.isSymbolicLink()&&(await raw(join(root,finalPath))).equals(body),'An incomplete publication remains; preserve it and reconcile the original writer before snapshot.');
          if(stat.nlink!==1)need(completed&&stat.nlink===2&&completed.nlink===2&&stat.dev===completed.dev&&stat.ino===completed.ino,'The retained private alias differs from the original completed publication.');
          continue;
        }
        const body=await raw(full);files.set(path,{path,bytes:body.length,sha256:sha(body),raw:body});
      }
    }
    let present=true;try{await lstat(folder(id));}catch(error){if(error.code!=='ENOENT')throw error;present=false;}
    if(present)await visit(id);
    return files;
  }
  function memoryFiles(id,files){
    const base=folder(id);
    for(const phaseName of ['preview','save','export','receive']){
      const value=returned.get(join(base,phaseName+'.response.json'));if(!value)continue;
      const standard=id+'/'+phaseName+'.response.json',observed=id+'/'+phaseName+'.observed-response.json',body=encode(value);
      if(files.has(standard)){need(files.get(standard).raw.equals(body),'A complete returned response differs from its retained receipt.');continue;}
      if(files.has(observed))need(files.get(observed).raw.equals(body),'A complete observed response changed.');
      else files.set(observed,{path:observed,bytes:body.length,sha256:sha(body),raw:body});
    }
    for(const [path,value]of failureObservations)if(dirname(path)===base){
      const rel=id+'/'+path.split(/[\\/]/).pop(),body=encode(value);
      if(files.has(rel))need(files.get(rel).raw.equals(body),'The original in-memory error observation changed.');
      else files.set(rel,{path:rel,bytes:body.length,sha256:sha(body),raw:body});
    }
    return files;
  }
  async function snapshot(id){
    await restored(id);
    const ctx=await input(id),files=memoryFiles(id,await operationFiles(id));
    const packet={schema:RECEIVING_SCHEMA+'.snapshot',operationId:id,owner:clone(owner),preparation:clone(ctx.intent.preparation),
      files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path)).map(row=>fileRow(row.path,row.raw))};
    packet.contentSha256=sha(encode(metadata(packet)));
    checkedSnapshot(packet);return packet;
  }
  async function restore(selected){
    const incoming=checkedSnapshot(selected),id=incoming.id,dir=folder(id),digest=incoming.packet.contentSha256;
    const marker={schema:RECEIVING_SCHEMA+'.restore',operationId:id,owner:clone(owner),preparation:incoming.packet.preparation,
      contentSha256:digest,files:metadata(incoming.packet).files};
    const markerPath=id+'/restore-intent.'+digest+'.json',completePath=id+'/restore-complete.'+digest+'.json';
    const anticipated=new Map(incoming.files);
    for(const [path,value]of [[markerPath,marker],[completePath,{...marker,schema:RECEIVING_SCHEMA+'.restored'}]]){
      const body=encode(value);anticipated.set(path,{path,bytes:body.length,sha256:sha(body),raw:body});
    }
    const current=memoryFiles(id,await operationFiles(id,anticipated,incoming.ctx.prepared.directories));
    for(const [path,row]of current){
      const selected=anticipated.get(path);
      need(selected&&selected.raw.equals(row.raw),'Restore would omit or change existing original receiving evidence: '+path+'.');
    }
    // A first restore or an exact retry is allowed. Another incomplete original
    // restore keeps its own evidence and may not be replaced by a different cut.
    for(const path of current.keys())if(/\/restore-intent\.[a-f0-9]{64}\.json$/.test(path)&&!current.has(path.replace('/restore-intent.','/restore-complete.')))
      need(path===markerPath,'Continue the earlier exact original restore before selecting another snapshot.','INSTALLATION_RESTORE_PENDING');
    await workflowSeriesPrivateDirectory(dir,true);
    await publish(dir,'restore-intent.'+digest+'.json',marker);
    const rows=[...incoming.files.values()].filter(row=>row.path!=='OWNER.json');
    rows.sort((a,b)=>(a.path===id+'/intent.json')-(b.path===id+'/intent.json')||a.path.localeCompare(b.path));
    for(const row of rows){
      let parent=root;for(const part of row.path.split('/').slice(0,-1)){parent=join(parent,part);await workflowSeriesPrivateDirectory(parent,true);}
      await writeConsoleWorkflowFile(join(root,row.path),row.raw);
    }
    for(const name of [...incoming.ctx.prepared.directories].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b))){
      let parent=join(dir,'preparation');for(const part of name.split('/')){parent=join(parent,part);await workflowSeriesPrivateDirectory(parent,true);}
    }
    const prepared=await readPreparedInstallation(join(dir,'preparation'),incoming.ctx.intent.preparation.sha256);
    need(same(prepared.identity,incoming.ctx.intent.preparation),'The restored complete preparation changed.');
    for(const row of incoming.files.values()){const body=await raw(join(root,row.path));need(body.equals(row.raw),'The restored original member changed before completion.');}
    await publish(dir,'restore-complete.'+digest+'.json',{...marker,schema:RECEIVING_SCHEMA+'.restored'});
    return read(id);
  }

  return {
    snapshot:id=>run(()=>snapshot(operationId(id))),restore:value=>run(()=>restore(value)),
    directory:root,prepare:args=>run(()=>prepare(args)),save:id=>run(()=>save(operationId(id))),
    export:id=>run(()=>exported(operationId(id))),receive:id=>run(()=>receive(operationId(id))),
    read:id=>run(()=>read(operationId(id))),file:(id,name)=>run(()=>file(operationId(id),name)),
    list:()=>run(async()=>{const rows=[];for(const name of (await readdir(root)).filter(x=>UUID.test(x)).sort()){
      if(!await raw(join(root,name,'intent.json'),true))continue;
      const value=await read(name);rows.push({operationId:name,state:value.state,basis:value.basis,preparation:value.preparation});}return{schema:RECEIVING_SCHEMA,owner,items:rows};}),
    close(){if(!closing){stopping=true;closing=(async()=>{await queue;await release();})();}return closing;}
  };
}
