// MIT. Retained browser drafts and original captured handover operations.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readCapturedApi } from './workspace.mjs';
import {
  CAPTURED_HANDOVER_REQUEST_SCHEMA, inventoryCapturedHandover, prepareCapturedHandover,
  publishCapturedHandover, inspectCapturedHandover, reviewCapturedHandoverReceive,
  receiveCapturedHandover, inspectCapturedHandoverReceive,
} from './handover.mjs';
import { exportCapturedHandoverArchive, receiveCapturedHandoverArchive } from './handover-archive.mjs';
import { inspectCapturedHandoverUpload } from './handover-upload.mjs';
import {
  HASH, METADATA_LIMIT, canonical, digest, encode, decode, exact, plain, title, absolute,
  directory, present, bytes, readJSON, publishJSON, operation, requireEmptyOperation,
} from './handover-files.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const DRAFT = 'stellar-forge.captured-handover-draft.v1';
const EDITION = 'stellar-forge.captured-handover-draft-edition.v1';
const JOB = 'stellar-forge.captured-handover-browser-job.v1';
const RESULT = 'stellar-forge.captured-handover-browser-result.v1';
const failure = (code,message,status=400) => Object.assign(new Error(message),{code,status});
const need = (condition,code,message,status=400) => {if(!condition)throw failure(code,message,status);};
const copy = value => JSON.parse(JSON.stringify(value));
const id = value => {need(UUID.test(value ?? ''),'CAPTURED_DESK_ID','Use the original browser operation identifier.');return value;};
const hash = value => {need(HASH.test(value ?? ''),'CAPTURED_DESK_HASH','Use the exact saved source or review SHA-256.');return value;};
const identity = profile => ({directory:profile.directory,projectsDirectory:profile.projectsDirectory,
  receivingDirectory:profile.receivingDirectory,name:profile.name});
const bound = (value,profile) => canonical(value) === canonical(identity(profile));
const nativeBound = (value,profile) => canonical(value) === canonical({
  directory:profile.directory,projectsDirectory:profile.projectsDirectory,name:profile.name});
const inputHash = value => digest(Buffer.from(canonical(value)));
const documentSummary = ({manifest,review,...value}) => ({...value,
  ...(review ? {packages:review.packages.length,sources:review.sources.length,
    files:review.files.length,totalBytes:review.totalBytes} : {})});
const fields = {
  PREPARE:['id','command','draftId','revision'],
  INSPECT:['id','command','draftId','revision'],
  REVIEW:['id','command','draftId','revision'],
  PUBLISH:['id','command','sourceJob','reviewSha256'],
  RECEIVE:['id','command','sourceJob','reviewSha256'],
  IMPORT:['id','command','uploadId'],
  REOPEN:['id','command','operationId'],
};
function jobInput(value) {
  need(plain(value) && Object.hasOwn(fields,value.command),'CAPTURED_DESK_COMMAND','Select an existing handover action.');
  exact(value,fields[value.command],fields[value.command]);
  id(value.id);
  for(const name of ['draftId','sourceJob','uploadId'])if(value[name] !== undefined)id(value[name]);
  for(const name of ['revision','reviewSha256','operationId'])if(value[name] !== undefined)hash(value[name]);
  return copy(value);
}
function form(kind,value) {
  exact(value,kind === 'OUTGOING' ? ['label','packages','sources'] : ['label','bundle','manifestSha256','names']);
  const label=title(value.label);
  if(kind === 'OUTGOING') {
    const packages=value.packages ?? [],sources=value.sources ?? [];
    need(Array.isArray(packages) && Array.isArray(sources) && packages.length<=1000 && sources.length<=1000,
      'CAPTURED_DESK_SELECTION','Keep the complete selection within the original collection limits.');
    // Drafts may be incomplete. The original handover compiler validates the final selection.
    for(const row of packages) {
      if(typeof row === 'string')need(row.length<=64,'CAPTURED_DESK_SELECTION','Use an original saved merchant name.');
      else exact(row,['name','manifestSha256'],['name']);
    }
    for(const row of sources)exact(row,['kind','id','revision'],['kind','id']);
    return copy({label,packages,sources});
  }
  const bundle=value.bundle ?? '',manifestSha256=value.manifestSha256 ?? '',names=value.names ?? {};
  need(typeof bundle==='string' && bundle.length<=4096,'CAPTURED_DESK_SOURCE','Choose the original handover directory.');
  if(bundle)absolute(bundle);
  if(manifestSha256)hash(manifestSha256);
  need(plain(names) && Object.keys(names).length<=1000 &&
    Object.entries(names).every(([key,value])=>key.length<=64 && typeof value==='string' && value.length<=64),
    'CAPTURED_DESK_NAMES','Map the original merchant names to their receiving names.');
  return {label,bundle,manifestSha256,names:copy(names)};
}
function paging(value={}) {
  const limit=Number(value.limit ?? 25),offset=Number(value.offset ?? 0);
  need(Number.isSafeInteger(limit)&&limit>=1&&limit<=100 && Number.isSafeInteger(offset)&&offset>=0,
    'CAPTURED_DESK_PAGE','Choose a page of 1–100 rows and a nonnegative offset.');
  return {limit,offset};
}
function page(rows,value={}) {
  const {offset,limit}=paging(value);
  return {rows:rows.slice(offset,offset+limit),offset,limit,total:rows.length,
    nextOffset:offset+limit<rows.length?offset+limit:null};
}
async function identifiers(parent) {
  return (await readdir(parent,{withFileTypes:true})).filter(row=>row.isDirectory()&&UUID.test(row.name))
    .map(row=>row.name);
}
export async function createCapturedHandoverDesk({directory:productDirectory}) {
  const profile=await readCapturedApi(productDirectory), product=identity(profile);
  const root=await directory(join(profile.directory,'handover-desk'),true);
  const roots={};
  for(const key of ['drafts','jobs','uploads','collections'])
    roots[key]=await directory(join(root,key),true);
  const requests=new Set(),activeJobs=new Map();
  let stopping=false,closing,launching=Promise.resolve();
  const backgroundErrors=new Map();
  function launch(work) {
    const result=launching.then(work,work);
    launching=result.catch(()=>{});
    return result;
  }
  function track(work) {
    const promise=Promise.resolve().then(work);requests.add(promise);
    void promise.finally(()=>requests.delete(promise)).catch(()=>{});
    return promise;
  }
  function accept(work) {
    if(stopping)throw failure('CAPTURED_DESK_STOPPING','The original product is finishing accepted handover operations.',503);
    return track(work);
  }
  const draftRoot = async (value,create=false) => directory(join(roots.drafts,id(value)),create);
  const jobRoot = async (value,create=false) => directory(join(roots.jobs,id(value)),create);

  async function readDraft(value) {
    exact(value,['id','revision'],['id']);
    const selected=await draftRoot(value.id),meta=await readJSON(selected,'operation.json');
    need(meta.schema===DRAFT&&meta.id===value.id&&bound(meta.product,profile),
      'CAPTURED_DESK_IDENTITY','This draft belongs to another original product.',409);
    const records=await directory(join(selected,'records'));
    const editions=[];
    for(const name of (await readdir(records)).filter(name=>UUID.test(name.slice(0,-5))&&name.endsWith('.json'))) {
      const raw=await bytes(records,name,METADATA_LIMIT),edition=decode(raw);
      need(edition.schema===EDITION&&edition.draftId===meta.id&&edition.requestId===name.slice(0,-5)&&
        Number.isSafeInteger(edition.sequence)&&edition.sequence>0&&edition.kind===meta.kind,
        'CAPTURED_DESK_HISTORY','The retained draft edition is inconsistent.',409);
      editions.push({...edition,revision:digest(raw)});
    }
    editions.sort((a,b)=>a.sequence-b.sequence);
    for(let index=0;index<editions.length;index++)
      need(editions[index].sequence===index+1 && editions[index].previousRevision===(index?editions[index-1].revision:null),
        'CAPTURED_DESK_HISTORY','Reopen the original complete draft history.',409);
    const current=editions.at(-1) ?? null;
    const edition=value.revision===undefined?current:editions.find(row=>row.revision===hash(value.revision));
    need(value.revision===undefined||edition,'CAPTURED_DESK_EDITION','The selected original draft edition is absent.',404);
    return {id:meta.id,kind:meta.kind,label:meta.label,createdAt:meta.createdAt,
      revision:edition?.revision ?? null,currentRevision:current?.revision ?? null,
      edition,history:editions.map(({form,...row})=>row)};
  }
  async function createDraft(value) {
    exact(value,['id','kind','label'],['id','kind']);
    id(value.id);need(['OUTGOING','RECEIVING'].includes(value.kind),'CAPTURED_DESK_KIND','Choose outgoing or receiving.');
    const label=title(value.label,value.kind==='OUTGOING'?'Merchant collection':'Received merchant collection');
    const selected=await draftRoot(value.id,true);
    await operation(selected,async root=>{
      await requireEmptyOperation(root,'operation.json');
      let original=await readJSON(root,'operation.json',true);
      if(original)need(original.schema===DRAFT&&original.id===value.id&&original.kind===value.kind&&
        original.label===label&&bound(original.product,profile),'CAPTURED_DESK_REQUEST_CHANGED',
        'Continue this draft with its original identity and creation fields.',409);
      else {original={schema:DRAFT,id:value.id,kind:value.kind,label,product,createdAt:new Date().toISOString()};
        await publishJSON(root,'operation.json',original);}
      await directory(join(root,'records'),true);
      const initial={schema:EDITION,draftId:value.id,requestId:value.id,kind:value.kind,sequence:1,
        previousRevision:null,createdAt:original.createdAt,
        form:form(value.kind,{label,...(value.kind==='OUTGOING'?{packages:[],sources:[]}:{bundle:'',manifestSha256:'',names:{}})})};
      await publishJSON(root,'records/'+value.id+'.json',initial);
    });
    return readDraft({id:value.id});
  }
  async function saveDraft(value) {
    exact(value,['id','requestId','expectedRevision','form'],['id','requestId','expectedRevision','form']);
    id(value.id);id(value.requestId);hash(value.expectedRevision);
    const selected=await draftRoot(value.id);
    return operation(selected,async root=>{
      const current=await readDraft({id:value.id}),selectedForm=form(current.kind,value.form);
      const old=await readJSON(root,'records/'+value.requestId+'.json',true);
      if(old) {
        need(old.schema===EDITION&&old.draftId===value.id&&old.previousRevision===value.expectedRevision&&
          canonical(old.form)===canonical(selectedForm),'CAPTURED_DESK_REQUEST_CHANGED',
          'This save identifier already belongs to another complete draft edit.',409);
        return readDraft({id:value.id,revision:digest(encode(old))});
      }
      need(current.currentRevision===value.expectedRevision,'CAPTURED_DESK_DRAFT_CHANGED',
        'Another draft edit is saved. Compare that edition while keeping this form.',409);
      const edition={schema:EDITION,draftId:value.id,requestId:value.requestId,kind:current.kind,
        sequence:current.edition.sequence+1,previousRevision:value.expectedRevision,
        createdAt:new Date().toISOString(),form:selectedForm};
      await publishJSON(root,'records/'+value.requestId+'.json',edition);
      return readDraft({id:value.id,revision:digest(encode(edition))});
    });
  }
  async function listDrafts(value={}) {
    const rows=[];
    for(const value of await identifiers(roots.drafts)) {
      const selected=await draftRoot(value),meta=await readJSON(selected,'operation.json',true);
      if(meta) {
        need(meta.schema===DRAFT&&bound(meta.product,profile),'CAPTURED_DESK_IDENTITY','A draft belongs to another product.',409);
        rows.push({id:meta.id,kind:meta.kind,label:meta.label,createdAt:meta.createdAt});
      }
    }
    rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
    return page(value.kind?rows.filter(row=>row.kind===value.kind):rows,value);
  }
  async function readJob(value) {
    const selected=await jobRoot(value),record=await readJSON(selected,'operation.json');
    need(record.schema===JOB&&record.request.id===value&&bound(record.product,profile)&&
      record.requestSha256===inputHash(record.request),'CAPTURED_DESK_IDENTITY',
      'Open the original product and saved handover operation.',409);
    const received=await readJSON(selected,'received.json',true);
    if(received)need(received.schema===RESULT&&received.id===value&&received.requestSha256===record.requestSha256,
      'CAPTURED_DESK_RESULT','The original saved operation result changed.',409);
    const attempts=[];
    if(await present(join(selected,'records')))
      for(const name of (await readdir(join(selected,'records'))).filter(name=>name.endsWith('.json')))
        attempts.push(await readJSON(selected,'records/'+name));
    attempts.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
    return {id:value,command:record.request.command,requestSha256:record.requestSha256,
      createdAt:record.createdAt,request:record.request,selected:record.selected ?? null,
      state:received?'COMPLETE':activeJobs.has(value)?'RUNNING':attempts.length?'INTERRUPTED':'PENDING',
      result:received?.result ?? null,completedAt:received?.completedAt ?? null,
      error:attempts.at(-1)?.error ?? backgroundErrors.get(value) ?? null,attempts:attempts.length};
  }
  async function sourceJob(record,command) {
    const result=await readJob(record.request.sourceJob);
    need(result.command===command&&result.state==='COMPLETE'&&
      result.result.reviewSha256===record.request.reviewSha256,
      'CAPTURED_DESK_REVIEW_CHANGED','Use the exact completed original review and its SHA-256.',409);
    return result;
  }
  async function execute(record) {
    const request=record.request,selected=record.selected;
    if(request.command==='PREPARE') {
      const out=join(roots.collections,request.id);
      const result=await prepareCapturedHandover({directory:profile.directory,out,
        request:{schema:CAPTURED_HANDOVER_REQUEST_SCHEMA,...selected.form}});
      return documentSummary(result);
    }
    if(request.command==='PUBLISH') {
      const prepared=await sourceJob(record,'PREPARE');
      const published=await publishCapturedHandover({out:prepared.result.directory,
        expectedReviewSha256:request.reviewSha256});
      const archiveDirectory=await directory(join(await jobRoot(request.id),'archive'),true);
      const archive=await exportCapturedHandoverArchive({bundle:published.directory,
        directory:archiveDirectory,expectedManifestSha256:published.manifestSha256});
      return {...published,archive};
    }
    if(['INSPECT','REVIEW'].includes(request.command)) {
      const form=selected.form;
      need(form.bundle,'CAPTURED_DESK_SOURCE','Choose a complete handover directory or import a handover file.');
      const args={directory:profile.directory,bundle:form.bundle,
        ...(form.manifestSha256?{expectedManifestSha256:form.manifestSha256}:{}),names:form.names};
      if(request.command==='INSPECT')return documentSummary(await inspectCapturedHandover(args));
      return reviewCapturedHandoverReceive(args);
    }
    if(request.command==='RECEIVE') {
      const reviewed=await sourceJob(record,'REVIEW');
      const result=await receiveCapturedHandover({directory:profile.directory,
        bundle:reviewed.selected.form.bundle,expectedManifestSha256:reviewed.result.manifestSha256,
        expectedReviewSha256:request.reviewSha256,
        names:Object.fromEntries(reviewed.result.binding.names.map(row=>[row.name,row.targetName]))});
      need(result.operationId===reviewed.result.operationId,'CAPTURED_DESK_RESULT',
        'The native receiving reply belongs to another original operation.',409);
      return result;
    }
    if(request.command==='IMPORT') {
      const uploaded=record.selected;
      const imported=await receiveCapturedHandoverArchive({path:uploaded.path,
        directory:join(roots.collections,request.id),expectedSha256:uploaded.sha256,
        expectedBytes:uploaded.totalBytes});
      return documentSummary(imported);
    }
    return inspectCapturedHandoverReceive({directory:profile.directory,operationId:request.operationId});
  }
  function runJob(value) {
    if(activeJobs.has(value))return activeJobs.get(value);
    backgroundErrors.delete(value);
    // The complete accepted promise is registered before any native call starts.
    const promise=track(async()=>{
      const selected=await jobRoot(value);
      await operation(selected,async root=>{
        const job=await readJob(value);
        if(job.state==='COMPLETE')return;
        const record=await readJSON(root,'operation.json');
        try {
          const result=await execute(record);
          await publishJSON(root,'received.json',{schema:RESULT,id:value,
            requestSha256:record.requestSha256,completedAt:new Date().toISOString(),result});
        } catch(error) {
          const attempt=randomUUID();
          await publishJSON(root,'records/'+attempt+'.json',{id:attempt,at:new Date().toISOString(),
            error:{code:error.code??'CAPTURED_DESK_FAILED',message:error.message,
              ...(error.outcomeUnknown?{outcomeUnknown:true}:{})}});
        }
      });
    });
    activeJobs.set(value,promise);
    void promise.catch(error=>backgroundErrors.set(value,{
      code:error.code??'CAPTURED_DESK_FAILED',message:error.message,
    })).finally(()=>{if(activeJobs.get(value)===promise)activeJobs.delete(value);});
    return promise;
  }
  async function startJob(value) {
    return launch(()=>startOriginalJob(value));
  }
  async function startOriginalJob(value) {
    const request=jobInput(value),selected=await jobRoot(request.id,true);
    // The accepted original job holds its native writer lease until completion.
    // A repeated HTTP request resolves that owner without reacquiring its lease.
    if(activeJobs.has(request.id)) {
      const current=await readJob(request.id);
      need(canonical(current.request)===canonical(request),'CAPTURED_DESK_REQUEST_CHANGED',
        'This operation already contains a different saved request.',409);
      return current;
    }
    let completed=false;
    await operation(selected,async root=>{
      await requireEmptyOperation(root,'operation.json');
      const old=await readJSON(root,'operation.json',true);
      if(old) {
        need(old.schema===JOB&&bound(old.product,profile)&&canonical(old.request)===canonical(request),
          'CAPTURED_DESK_REQUEST_CHANGED','This operation already contains a different saved request.',409);
        completed=Boolean(await readJSON(root,'received.json',true));
        return;
      }
      need(!activeJobs.size,'CAPTURED_DESK_BUSY','Continue the original active handover operation before starting another.',409);
      let selection;
      if(request.draftId) {
        const draft=await readDraft({id:request.draftId,revision:request.revision});
        const expected=request.command==='PREPARE'?'OUTGOING':'RECEIVING';
        need(draft.kind===expected,'CAPTURED_DESK_KIND','Choose the original outgoing or receiving draft.');
        selection={draftId:draft.id,revision:draft.revision,kind:draft.kind,form:draft.edition.form};
      } else if(request.command==='IMPORT') {
        const upload=await inspectCapturedHandoverUpload({root:roots.uploads,id:request.uploadId});
        need(upload.path&&HASH.test(upload.sha256??'')&&upload.receivedBytes===upload.totalBytes,
          'CAPTURED_DESK_UPLOAD_PENDING','Finish the original complete file upload before importing it.',409);
        selection={id:upload.id,path:upload.path,sha256:upload.sha256,totalBytes:upload.totalBytes};
      } else if(request.sourceJob) {
        await sourceJob({request},request.command==='PUBLISH'?'PREPARE':'REVIEW');
      }
      await publishJSON(root,'operation.json',{schema:JOB,request,requestSha256:inputHash(request),
        product,createdAt:new Date().toISOString(),...(selection?{selected:selection}:{})});
    });
    if(!completed) {
      need(!activeJobs.size||activeJobs.has(request.id),'CAPTURED_DESK_BUSY',
        'This request is retained. Continue it after the original active operation finishes.',409);
      runJob(request.id);
    }
    return readJob(request.id);
  }
  async function resumeJob(value) {
    return launch(()=>resumeOriginalJob(value));
  }
  async function resumeOriginalJob(value) {
    exact(value,['id','requestSha256'],['id','requestSha256']);
    const job=await readJob(id(value.id));
    need(job.requestSha256===hash(value.requestSha256),'CAPTURED_DESK_REQUEST_CHANGED',
      'Continue the exact original retained request.',409);
    if(job.state!=='COMPLETE') {
      need(!activeJobs.size||activeJobs.has(job.id),'CAPTURED_DESK_BUSY',
        'Wait for the original active handover operation.',409);
      runJob(job.id);
    }
    return readJob(job.id);
  }
  async function listJobs(value={}) {
    const rows=[];
    for(const value of await identifiers(roots.jobs)) {
      const selected=await jobRoot(value);
      if(!await present(join(selected,'operation.json')))continue;
      const job=await readJob(value);
      rows.push({id:job.id,command:job.command,state:job.state,createdAt:job.createdAt,
        completedAt:job.completedAt,requestSha256:job.requestSha256,error:job.error,
        draftId:job.selected?.draftId??null,label:job.selected?.form?.label??job.command});
    }
    rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
    return page(rows,value);
  }
  async function jobDocument(value) {
    exact(value,['id','view','offset','limit'],['id']);
    const job=await readJob(id(value.id));
    need(job.state==='COMPLETE','CAPTURED_DESK_PENDING','The original operation has not completed.',409);
    let bundle,filename,expected;
    if(job.command==='PREPARE') {
      bundle=job.result.directory;filename='handover-review.json';expected=job.result.reviewSha256;
    } else if(['PUBLISH','IMPORT','INSPECT'].includes(job.command)) {
      bundle=job.result.directory;filename='handover.json';expected=job.result.manifestSha256;
    } else if(job.command==='REVIEW') {
      bundle=job.selected.form.bundle;filename='handover.json';expected=job.result.manifestSha256;
    } else return {jobId:job.id,result:job.result};
    const original=await bytes(bundle,filename,METADATA_LIMIT);
    need(digest(original)===expected,'CAPTURED_DESK_SOURCE_CHANGED','The original retained review document changed.',409);
    const document=decode(original),view=value.view??'summary';
    const summary={label:document.label,createdAt:document.createdAt,
      packages:document.packages.length,sources:document.sources.length,
      files:document.files.length,totalBytes:document.totalBytes,
      handoverId:document.handoverId??null,sha256:expected,directory:bundle};
    if(view==='summary')return {jobId:job.id,summary};
    need(['packages','sources','files'].includes(view),'CAPTURED_DESK_PAGE','Choose packages, sources or files.');
    const rows=document[view].map(row=>view==='packages'?{
      name:row.name,path:row.path,package:row.package,capturedSource:row.capturedSource,
      environment:row.environment,files:row.files.length,
      totalBytes:row.files.reduce((total,file)=>total+file.bytes,0),
    }:view==='sources'?{
      kind:row.kind,id:row.id,path:row.path,sourceSha256:row.sourceSha256,sourceBytes:row.sourceBytes,
      revisions:row.revisions,previousRevisions:row.previousRevisions,lineage:row.lineage,
      files:row.files.length,totalBytes:row.files.reduce((total,file)=>total+file.bytes,0),
    }:row);
    return {jobId:job.id,summary,view,...page(rows,value)};
  }
  async function listUploads(value={}) {
    const rows=[];
    for(const uploadId of await identifiers(roots.uploads)) {
      try {
        const upload=await inspectCapturedHandoverUpload({root:roots.uploads,id:uploadId});
        rows.push(upload);
      } catch(error) {
        if(error.code==='ENOENT')continue;
        rows.push({id:uploadId,state:'INTERRUPTED',error:{code:error.code,message:error.message}});
      }
    }
    rows.sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??'')||a.id.localeCompare(b.id));
    return page(rows,value);
  }
  async function receivedOperations(value={}) {
    const parent=join(profile.receivingDirectory,'handovers');
    if(!await present(parent))return page([],value);
    const rows=[];
    for(const entry of await readdir(await directory(parent),{withFileTypes:true})) {
      if(!entry.isDirectory()||!HASH.test(entry.name))continue;
      const path=await directory(join(parent,entry.name)),request=await readJSON(path,'operation.json',true);
      if(!request)continue;
      need(nativeBound(request.product,profile),'CAPTURED_DESK_IDENTITY','A receiving operation belongs to another product.',409);
      const result=await readJSON(path,'received.json',true);
      rows.push({operationId:entry.name,handoverId:request.handoverId,manifestSha256:request.manifestSha256,
        names:request.names,state:result?'RECEIVED':'PENDING'});
    }
    rows.sort((a,b)=>a.operationId.localeCompare(b.operationId));
    return page(rows,value);
  }
  async function close() {
    if(closing)return closing;
    stopping=true;
    closing=(async()=>{while(requests.size)await Promise.allSettled([...requests]);})();
    return closing;
  }
  return {
    profile,root,roots,accept,close,
    info:()=>({schema:'stellar-forge.captured-handover-browser.v1',product:profile.name,
      productId:inputHash(product),directory:profile.directory,projectsDirectory:profile.projectsDirectory,
      state:stopping?'DRAINING':'OPEN',activeJobs:[...activeJobs.keys()]}),
    inventory:()=>inventoryCapturedHandover({directory:profile.directory}),
    createDraft,readDraft,saveDraft,listDrafts,startJob,resumeJob,readJob,listJobs,jobDocument,receivedOperations,listUploads,
  };
}
