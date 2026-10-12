// MIT. Retained browser drafts and original captured handover operations.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readCapturedApi } from './workspace.mjs';
import { reviewCapturedDraftMerge, createCapturedWorkingEdit, readCapturedWorkingEdit } from './draft-reconciliation.mjs';
import {
  CAPTURED_HANDOVER_REQUEST_SCHEMA, inventoryCapturedHandover, prepareCapturedHandover,
  publishCapturedHandover, inspectCapturedHandover, reviewCapturedHandoverReceive,
  receiveCapturedHandover, inspectCapturedHandoverReceive,
} from './handover.mjs';
import { exportCapturedHandoverArchive, receiveCapturedHandoverArchive } from './handover-archive.mjs';
import { inspectCapturedHandoverUpload } from './handover-upload.mjs';
import { RetainedFileReads } from '../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import { capturedEditionBaselines, prepareCapturedHandoverEditions, readCapturedHandoverEdition,
  assertCapturedHandoverEditions, capturedEditionPage } from './handover-editions.mjs';
import {
  HASH, METADATA_LIMIT, canonical, digest, encode, decode, exact, plain, title, absolute,
  directory, present, bytes, readJSON, publishJSON, operation, requireEmptyOperation,
} from './handover-files.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const DRAFT = 'stellar-forge.captured-handover-draft.v1';
const EDITION = 'stellar-forge.captured-handover-draft-edition.v1';
const JOB = 'stellar-forge.captured-handover-browser-job.v1';
const RESULT = 'stellar-forge.captured-handover-browser-result.v1';
const MERGE_REVIEW = 'stellar-forge.captured-draft-review.v1';
const MERGE_SAVE = 'stellar-forge.captured-draft-save.v1';
const EDITION_DECISION = 'stellar-forge.captured-receiving-edition-decision.v1';
const WORKING_LIMIT = 4*1024*1024;
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
  COMPARE:['id','command','draftId','revision','baselines'],
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
  need(value.sourceJob===undefined||value.sourceJob!==value.id,'CAPTURED_DESK_COMMAND',
    'Choose a different completed original review as the source of this operation.');
  for(const name of ['draftId','sourceJob','uploadId'])if(value[name] !== undefined)id(value[name]);
  for(const name of ['revision','reviewSha256','operationId'])if(value[name] !== undefined)hash(value[name]);
  return copy({...value,...(value.command==='COMPARE'?{baselines:capturedEditionBaselines(value.baselines)}:{})});
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
function mergeInput(value,{save=false}={}) {
  const required=['id','baseRevision','working'];
  const allowed=[...required,'resolutions',...(save?['requestId','expectedRevision','reviewSha256']:['expectedCurrentRevision'])];
  exact(value,allowed,save?[...required,'requestId','expectedRevision','reviewSha256']:required);
  id(value.id);hash(value.baseRevision);
  if(save){id(value.requestId);hash(value.expectedRevision);hash(value.reviewSha256);}
  else if(value.expectedCurrentRevision!==undefined)hash(value.expectedCurrentRevision);
  const resolutions=value.resolutions??{};
  need(plain(resolutions)&&Object.keys(resolutions).length<=3002&&
    Object.values(resolutions).every(choice=>choice==='CURRENT'||choice==='WORKING'),
    'CAPTURED_DESK_MERGE_CHOICES','Choose current or working for each displayed draft conflict.');
  return copy({...value,resolutions});
}
function receivingDecisionInput(value,{save=false}={}) {
  const required=['id','expectedRevision','comparisonId','comparisonSha256','form'];
  exact(value,[...required,...(save?['requestId','reviewSha256']:[])],
    [...required,...(save?['requestId','reviewSha256']:[])]);
  id(value.id);id(value.comparisonId);hash(value.expectedRevision);hash(value.comparisonSha256);
  if(save){id(value.requestId);hash(value.reviewSha256);}
  return {...copy(value),form:form('RECEIVING',value.form)};
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
  const requests=new Set(),activeJobs=new Map(),draftWriters=new Map(),jobWriters=new Map();
  let stopping=false,closing,launching=Promise.resolve();
  const backgroundErrors=new Map();
  const editionReads=new RetainedFileReads({errorPrefix:'CAPTURED_EDITION_FILE'});
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
  function serialize(owners,value,work) {
    const previous=owners.get(value)??Promise.resolve();
    const promise=previous.catch(()=>{}).then(work);
    owners.set(value,promise);
    void promise.finally(()=>{if(owners.get(value)===promise)owners.delete(value);}).catch(()=>{});
    return promise;
  }
  const inDraft = (value,work,{create=false}={}) => serialize(draftWriters,id(value),
    async()=>operation(await draftRoot(value,create),work));
  const inJob = (value,work,{create=false}={}) => serialize(jobWriters,id(value),
    async()=>operation(await jobRoot(value,create),work));
  async function draftMetadata(selected,value,{optional=false}={}) {
    const meta=await readJSON(selected,'operation.json',optional);
    if(!meta)return null;
    need(meta.schema===DRAFT&&meta.id===value&&bound(meta.product,profile)&&
      ['OUTGOING','RECEIVING'].includes(meta.kind)&&title(meta.label)===meta.label&&
      typeof meta.createdAt==='string',
      'CAPTURED_DESK_IDENTITY','This draft belongs to another original product.',409);
    return meta;
  }
  async function finishInitialDraft(selected,meta) {
    // The first edition is determined entirely by the already retained creation.
    // Reentry only completes that original whole-file publication.
    await directory(join(selected,'records'),true);
    if(await present(join(selected,'records',meta.id+'.json')))return;
    await publishJSON(selected,'records/'+meta.id+'.json',{
      schema:EDITION,draftId:meta.id,requestId:meta.id,kind:meta.kind,sequence:1,
      previousRevision:null,createdAt:meta.createdAt,
      form:form(meta.kind,{label:meta.label,...(meta.kind==='OUTGOING'
        ?{packages:[],sources:[]}:{bundle:'',manifestSha256:'',names:{}})}),
    });
  }
  async function readDraft(value) {
    exact(value,['id','revision'],['id']);
    return inDraft(value.id,async selected=>{
      const meta=await draftMetadata(selected,value.id);
      await finishInitialDraft(selected,meta);
      return readDraftRaw(value);
    });
  }
  async function readDraftRaw(value) {
    exact(value,['id','revision'],['id']);
    const selected=await draftRoot(value.id),meta=await draftMetadata(selected,value.id);
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
    return inDraft(value.id,async root=>{
      await requireEmptyOperation(root,'operation.json');
      let original=await readJSON(root,'operation.json',true);
      if(original)need(original.schema===DRAFT&&original.id===value.id&&original.kind===value.kind&&
        original.label===label&&bound(original.product,profile),'CAPTURED_DESK_REQUEST_CHANGED',
        'Continue this draft with its original identity and creation fields.',409);
      else {original={schema:DRAFT,id:value.id,kind:value.kind,label,product,createdAt:new Date().toISOString()};
        await publishJSON(root,'operation.json',original);}
      await finishInitialDraft(root,original);
      return readDraftRaw({id:value.id});
    },{create:true});
  }
  async function saveDraft(value) {
    exact(value,['id','requestId','expectedRevision','form'],['id','requestId','expectedRevision','form']);
    id(value.id);id(value.requestId);hash(value.expectedRevision);
    let resultMayExist=false;
    return inDraft(value.id,async root=>{
      await finishInitialDraft(root,await draftMetadata(root,value.id));
      const current=await readDraftRaw({id:value.id}),selectedForm=form(current.kind,value.form);
      const old=await readJSON(root,'records/'+value.requestId+'.json',true);
      if(old) {
        need(old.schema===EDITION&&old.reconciliation===undefined&&old.receivingDecision===undefined&&old.draftId===value.id&&old.previousRevision===value.expectedRevision&&
          canonical(old.form)===canonical(selectedForm),'CAPTURED_DESK_REQUEST_CHANGED',
          'This save identifier already belongs to another complete draft edit.',409);
        resultMayExist=true;
        return readDraftRaw({id:value.id,revision:digest(encode(old))});
      }
      need(current.currentRevision===value.expectedRevision,'CAPTURED_DESK_DRAFT_CHANGED',
        'Another draft edit is saved. Compare that edition while keeping this form.',409);
      resultMayExist=true;
      return writeDraftEdition(root,current,value,selectedForm);
    }).catch(error=>{if(resultMayExist)error.outcomeUnknown=true;throw error;});
  }
  // Publication and writer release can fail after the immutable edition exists.
  // Keep that request recoverable until its original result is read successfully.
  async function writeDraftEdition(root,current,value,selectedForm,reconciliation,receivingDecision) {
    const edition={schema:EDITION,draftId:value.id,requestId:value.requestId,kind:current.kind,
      sequence:current.edition.sequence+1,previousRevision:value.expectedRevision,
      createdAt:new Date().toISOString(),form:selectedForm,...(reconciliation?{reconciliation}:{}),
      ...(receivingDecision?{receivingDecision}:{})};
    await publishJSON(root,'records/'+value.requestId+'.json',edition);
    return readDraftRaw({id:value.id,revision:digest(encode(edition))});
  }
  async function buildDraftReview(value) {
    // Call only while this draft's original writer is held. Both editions are
    // resolved from the same complete immutable chain, never a caller's base.
    const current=await readDraftRaw({id:value.id});
    if(value.expectedCurrentRevision!==undefined)
      need(current.currentRevision===value.expectedCurrentRevision,'CAPTURED_DESK_DRAFT_CHANGED',
        'The current draft advanced during reconciliation. Review the new edition with this retained working edit.',409);
    const base=await readDraftRaw({id:value.id,revision:value.baseRevision});
    const working=form(current.kind,value.working),resolutions=copy(value.resolutions??{});
    const merge=reviewCapturedDraftMerge({kind:current.kind,base:base.edition.form,
      current:current.edition.form,working,resolutions});
    const binding={schema:MERGE_REVIEW,productId:inputHash(product),id:value.id,kind:current.kind,
      baseRevision:base.revision,currentRevision:current.revision,
      baseSequence:base.edition.sequence,currentSequence:current.edition.sequence,
      base:base.edition.form,current:current.edition.form,working,resolutions,merge};
    return {...binding,reviewSha256:inputHash(binding)};
  }
  async function reviewDraftMerge(value) {
    value=mergeInput(value);
    return inDraft(value.id,async root=>{
      await finishInitialDraft(root,await draftMetadata(root,value.id));
      return buildDraftReview(value);
    });
  }
  async function saveDraftMerge(value) {
    value=mergeInput(value,{save:true});
    let resultMayExist=false;
    return inDraft(value.id,async root=>{
      await finishInitialDraft(root,await draftMetadata(root,value.id));
      const meta=await draftMetadata(root,value.id);
      value={...value,working:form(meta.kind,value.working)};
      const requestSha256=inputHash(value),old=await readJSON(root,'records/'+value.requestId+'.json',true);
      // Resolve the original save before inspecting a later current edition or
      // recomputing a review. Lost replies retain their first immutable result.
      if(old) {
        need(old.schema===EDITION&&old.draftId===value.id&&old.requestId===value.requestId&&
          old.previousRevision===value.expectedRevision&&old.reconciliation?.schema===MERGE_SAVE&&
          old.reconciliation.requestSha256===requestSha256,
          'CAPTURED_DESK_REQUEST_CHANGED','This original save identifier belongs to another complete edit or review.',409);
        resultMayExist=true;
        return readDraftRaw({id:value.id,revision:digest(encode(old))});
      }
      const review=await buildDraftReview({id:value.id,baseRevision:value.baseRevision,
        expectedCurrentRevision:value.expectedRevision,working:value.working,resolutions:value.resolutions});
      need(review.reviewSha256===value.reviewSha256,'CAPTURED_DESK_REVIEW_CHANGED',
        'Save the exact complete reconciliation that was reviewed.',409);
      need(review.merge.status==='READY','CAPTURED_DESK_MERGE_CONFLICTS',
        'Choose current or working for every displayed conflict before saving this edition.',409);
      const current=await readDraftRaw({id:value.id});
      resultMayExist=true;
      return writeDraftEdition(root,current,value,form(current.kind,review.merge.form),{
        schema:MERGE_SAVE,baseRevision:value.baseRevision,reviewSha256:review.reviewSha256,requestSha256,
      });
    }).catch(error=>{if(resultMayExist)error.outcomeUnknown=true;throw error;});
  }
  async function completedComparison(value) {
    const job=await readJob(id(value.comparisonId));
    need(job.command==='COMPARE'&&job.state==='COMPLETE'&&
      job.result?.comparisonSha256===hash(value.comparisonSha256),
      'CAPTURED_EDITION_PENDING','Open the exact completed incoming-edition comparison.',409);
    return {job,root:await jobRoot(job.id)};
  }
  async function buildReceivingDecision(value,comparison) {
    const current=await readDraftRaw({id:value.id}),{job,root}=comparison;
    need(current.kind==='RECEIVING'&&job.selected.draftId===current.id,
      'CAPTURED_EDITION_SELECTION','Use this comparison with its original receiving draft.',409);
    need(current.currentRevision===value.expectedRevision,'CAPTURED_DESK_DRAFT_CHANGED',
      'The receiving draft advanced. Keep your names and compare the current draft before saving.',409);
    const source=job.result.binding;
    for(const selected of [current.edition.form,value.form])
      need(absolute(selected.bundle)===source.bundle&&selected.manifestSha256===source.manifestSha256,
        'CAPTURED_EDITION_SELECTION','Review the same incoming collection that was compared. Start another comparison for another source.',409);
    await assertCapturedHandoverEditions({directory:profile.directory,root,result:job.result});
    const receiving=await reviewCapturedHandoverReceive({directory:profile.directory,
      bundle:source.bundle,expectedManifestSha256:source.manifestSha256,names:value.form.names});
    const binding={schema:EDITION_DECISION,productId:inputHash(product),id:current.id,
      currentRevision:current.revision,comparisonId:job.id,comparisonSha256:job.result.comparisonSha256,
      current:current.edition.form,form:value.form,nativeReviewSha256:receiving.reviewSha256};
    return {...binding,reviewSha256:inputHash(binding),state:receiving.state,receiving};
  }
  async function reviewReceivingDecision(value) {
    value=receivingDecisionInput(value);
    // Resolve the original completed job before taking the draft writer. A job
    // may itself be opening this draft; opposite lock ordering would deadlock.
    const comparison=await completedComparison(value);
    return inDraft(value.id,async root=>{
      await finishInitialDraft(root,await draftMetadata(root,value.id));
      return buildReceivingDecision(value,comparison);
    });
  }
  async function saveReceivingDecision(value) {
    value=receivingDecisionInput(value,{save:true});
    const requestSha256=inputHash(value);let resultMayExist=false;
    const original=async root=>{
      await finishInitialDraft(root,await draftMetadata(root,value.id));
      const old=await readJSON(root,'records/'+value.requestId+'.json',true);
      if(!old)return null;
      need(old.schema===EDITION&&old.draftId===value.id&&old.requestId===value.requestId&&
        old.previousRevision===value.expectedRevision&&old.receivingDecision?.schema===EDITION_DECISION&&
        old.receivingDecision.requestSha256===requestSha256,'CAPTURED_DESK_REQUEST_CHANGED',
        'This save identifier already belongs to another complete receiving decision.',409);
      resultMayExist=true;
      return readDraftRaw({id:value.id,revision:digest(encode(old))});
    };
    try {
      // Replay the completed original save before today's comparison/source.
      // Recheck the same immutable receipt after reacquiring the writer below.
      const saved=await inDraft(value.id,original);if(saved)return saved;
      const comparison=await completedComparison(value);
      return await inDraft(value.id,async root=>{
        const saved=await original(root);if(saved)return saved;
        const review=await buildReceivingDecision(value,comparison);
        need(review.reviewSha256===value.reviewSha256,'CAPTURED_DESK_REVIEW_CHANGED',
          'Save the exact complete receiving decision that was reviewed.',409);
        need(review.state==='READY','CAPTURED_EDITION_RECEIVING_CONFLICT',
          'Choose an available new name or the same exact original package before saving this receiving decision.',409);
        const current=await readDraftRaw({id:value.id});
        resultMayExist=true;
        return writeDraftEdition(root,current,value,value.form,undefined,{
          schema:EDITION_DECISION,comparisonId:value.comparisonId,comparisonSha256:value.comparisonSha256,
          reviewSha256:value.reviewSha256,nativeReviewSha256:review.nativeReviewSha256,requestSha256,
        });
      });
    } catch(error){if(resultMayExist)error.outcomeUnknown=true;throw error;}
  }
  async function editionComparison(value) {
    exact(value,['id','name','view','offset','limit','expectedComparisonSha256'],['id']);
    const job=await readJob(id(value.id));
    need(job.command==='COMPARE'&&job.state==='COMPLETE','CAPTURED_EDITION_PENDING',
      'Finish the original incoming-edition comparison.',409);
    const {id:ignored,...options}=value,input=capturedEditionPage(job.result,options);
    const result=job.result,metadata={schema:result.schema,id:job.id,comparisonSha256:result.comparisonSha256,
      handoverId:result.binding.handoverId,manifestSha256:result.binding.manifestSha256,
      draftId:result.binding.draftId,revision:result.binding.revision,
      packages:result.packages.length,sources:result.sources,view:input.view};
    if(input.view==='summary'&&!input.name)return {...metadata,binding:result.binding};
    if(input.view==='packages')return {...metadata,...page(result.packages,input)};
    need(input.name,'CAPTURED_EDITION_VIEW','Choose an incoming merchant for this comparison section.',400);
    const row=result.packages.find(row=>row.name===input.name);
    need(row,'CAPTURED_EDITION_VIEW','Choose an original compared merchant.',404);
    if(input.view==='summary')return {...metadata,package:row};
    const selected=await readCapturedHandoverEdition({root:await jobRoot(job.id),
      result,name:input.name,side:'comparison'});
    return {...metadata,name:row.name,baselineName:row.baselineName,summary:row.summary,
      file:selected.file,...page(selected.data[input.view],input)};
  }
  async function editionFile(value) {
    exact(value,['id','name','side','expectedComparisonSha256','expectedSha256','offset','limit','readId'],
      ['id','name','side','expectedComparisonSha256','expectedSha256']);
    id(value.id);hash(value.expectedComparisonSha256);hash(value.expectedSha256);
    if(value.readId!==undefined)id(value.readId);
    const job=await readJob(value.id);
    need(job.command==='COMPARE'&&job.state==='COMPLETE'&&
      job.result.comparisonSha256===value.expectedComparisonSha256,'CAPTURED_EDITION_CHANGED',
      'Open the exact completed original comparison.',409);
    const row=job.result.packages.find(row=>row.name===value.name);
    need(row&&['current','incoming','comparison'].includes(value.side),'CAPTURED_EDITION_VIEW',
      'Choose the original current, incoming or comparison file.',400);
    const file=row.files[value.side];
    need(file.sha256===value.expectedSha256,'CAPTURED_EDITION_RECORD_CHANGED',
      'Continue the complete original comparison file SHA-256.',409);
    const scope=job.id+':'+job.result.comparisonSha256,root=await jobRoot(job.id);
    const result=await editionReads.read({scope,key:file.name+':'+file.sha256,kind:'CAPTURED_INCOMING_EDITION',
      directory:root,expectedSha256:file.sha256,offset:Number(value.offset??0),limit:Number(value.limit??65536),
      ...(value.readId?{readId:value.readId}:{}),loadFile:async()=>({
        path:join(root,file.name),name:row.name+'-'+value.side+'.json',bytes:file.bytes,
      })});
    return {id:job.id,name:row.name,side:value.side,comparisonSha256:job.result.comparisonSha256,...result};
  }
  async function releaseEditionFile(value) {
    exact(value,['id','comparisonSha256','readId'],['id','comparisonSha256','readId']);
    id(value.id);hash(value.comparisonSha256);id(value.readId);
    await editionReads.release(value.id+':'+value.comparisonSha256,value.readId);
    return {id:value.id,comparisonSha256:value.comparisonSha256,readId:value.readId,released:true};
  }
  async function exportWorkingEdit(value) {
    exact(value,['id','baseRevision','working'],['id','baseRevision','working']);
    id(value.id);hash(value.baseRevision);value=copy(value);
    return inDraft(value.id,async root=>{
      await finishInitialDraft(root,await draftMetadata(root,value.id));
      const base=await readDraftRaw({id:value.id,revision:value.baseRevision});
      const packet=createCapturedWorkingEdit({productId:inputHash(product),draftId:value.id,kind:base.kind,
        baseRevision:base.revision,base:base.edition.form,working:form(base.kind,value.working)});
      const encoded=encode(packet);
      need(encoded.length<=WORKING_LIMIT,'CAPTURED_DESK_WORKING_LIMIT',
        'The complete working edit file exceeds the 4 MiB portable edit limit.',413);
      return {schema:'stellar-forge.captured-working-export.v1',productId:inputHash(product),
        id:value.id,baseRevision:base.revision,name:'captured-working-'+value.id+'.json',
        bytes:encoded.length,sha256:digest(encoded),content:encoded.toString('utf8')};
    });
  }
  async function importWorkingEdit(value) {
    exact(value,['content','expectedSha256'],['content']);
    need(typeof value.content==='string','CAPTURED_DESK_WORKING_FILE','Read the complete original working edit JSON file.');
    const encoded=Buffer.from(value.content,'utf8');
    need(encoded.length>0&&encoded.length<=WORKING_LIMIT,'CAPTURED_DESK_WORKING_LIMIT',
      'Choose a complete working edit file of at most 4 MiB.',413);
    const sha256=digest(encoded);
    if(value.expectedSha256!==undefined)
      need(hash(value.expectedSha256)===sha256,'CAPTURED_DESK_WORKING_CHANGED','The selected original working edit bytes changed.',409);
    const packet=readCapturedWorkingEdit(decode(encoded));
    need(packet.productId===inputHash(product),'CAPTURED_DESK_PRODUCT_CHANGED',
      'Open this working edit in its original captured product.',409);
    return inDraft(packet.draftId,async root=>{
      await finishInitialDraft(root,await draftMetadata(root,packet.draftId));
      const base=await readDraftRaw({id:packet.draftId,revision:packet.baseRevision});
      need(packet.kind===base.kind&&canonical(packet.base)===canonical(base.edition.form),
        'CAPTURED_DESK_WORKING_BASE','The working edit must retain the exact original saved draft base.',409);
      return {schema:'stellar-forge.captured-working-import.v1',productId:inputHash(product),
        id:packet.draftId,kind:packet.kind,baseRevision:packet.baseRevision,bytes:encoded.length,sha256,
        working:form(base.kind,packet.working),draft:base};
    });
  }
  async function listDrafts(value={}) {
    const rows=[];
    for(const value of await identifiers(roots.drafts))await inDraft(value,async selected=>{
      const meta=await draftMetadata(selected,value,{optional:true});
      if(meta) {
        await finishInitialDraft(selected,meta);
        rows.push({id:meta.id,kind:meta.kind,label:meta.label,createdAt:meta.createdAt});
      }
    });
    rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
    return page(value.kind?rows.filter(row=>row.kind===value.kind):rows,value);
  }
  async function readJob(value) {
    id(value);
    // A live writer already owns its original immutable request. Its staged
    // result becomes public only after that writer has released the lease.
    if(activeJobs.has(value))return readJobRaw(value,{running:true});
    return inJob(value,()=>readJobRaw(value));
  }
  async function readJobRaw(value,{running=false}={}) {
    const selected=await jobRoot(value),record=await readJSON(selected,'operation.json');
    need(record.schema===JOB&&record.request.id===value&&bound(record.product,profile)&&
      record.requestSha256===inputHash(record.request),'CAPTURED_DESK_IDENTITY',
      'Open the original product and saved handover operation.',409);
    const received=running?null:await readJSON(selected,'received.json',true);
    if(received)need(received.schema===RESULT&&received.id===value&&received.requestSha256===record.requestSha256,
      'CAPTURED_DESK_RESULT','The original saved operation result changed.',409);
    const attempts=[];
    if(!running&&await present(join(selected,'records')))
      for(const name of (await readdir(join(selected,'records'))).filter(name=>name.endsWith('.json')))
        attempts.push(await readJSON(selected,'records/'+name));
    attempts.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
    return {id:value,command:record.request.command,requestSha256:record.requestSha256,
      createdAt:record.createdAt,request:record.request,selected:record.selected ?? null,
      state:received?'COMPLETE':running||activeJobs.has(value)?'RUNNING':attempts.length?'INTERRUPTED':'PENDING',
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
    if(request.command==='COMPARE')return prepareCapturedHandoverEditions({directory:profile.directory,
      root:await jobRoot(request.id),request,selection:selected});
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
      if(selected.receivingDecision) {
        const decision=selected.receivingDecision,comparison=await completedComparison({
          comparisonId:decision.comparisonId,comparisonSha256:decision.comparisonSha256,
        });
        await assertCapturedHandoverEditions({directory:profile.directory,root:comparison.root,result:comparison.job.result});
      }
      const reviewed=await reviewCapturedHandoverReceive(args);
      return {...reviewed,...(selected.receivingDecision?{receivingDecision:selected.receivingDecision}:{})};
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
    return operation(join(profile.receivingDirectory,'handovers',request.operationId),()=>
      inspectCapturedHandoverReceive({directory:profile.directory,operationId:request.operationId}));
  }
  function runJob(value) {
    if(activeJobs.has(value))return activeJobs.get(value);
    backgroundErrors.delete(value);
    // The complete accepted promise is registered before any native call starts.
    const promise=track(async()=>{
      await inJob(value,async root=>{
        const job=await readJobRaw(value);
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
    const request=jobInput(value);
    // The accepted original job holds its native writer lease until completion.
    // A repeated HTTP request resolves that owner without reacquiring its lease.
    if(activeJobs.has(request.id)) {
      const current=await readJob(request.id);
      need(canonical(current.request)===canonical(request),'CAPTURED_DESK_REQUEST_CHANGED',
        'This operation already contains a different saved request.',409);
      return current;
    }
    let completed=false;
    await inJob(request.id,async root=>{
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
        selection={draftId:draft.id,revision:draft.revision,kind:draft.kind,form:draft.edition.form,
          ...(draft.edition.receivingDecision?{receivingDecision:draft.edition.receivingDecision}:{})};
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
    },{create:true});
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
      try {
        await operation(join(parent,entry.name),async path=>{
          const request=await readJSON(path,'operation.json',true);
          if(!request)return;
          need(nativeBound(request.product,profile),'CAPTURED_DESK_IDENTITY','A receiving operation belongs to another product.',409);
          const result=await readJSON(path,'received.json',true);
          rows.push({operationId:entry.name,handoverId:request.handoverId,manifestSha256:request.manifestSha256,
            names:request.names,state:result?'RECEIVED':'PENDING'});
        });
      } catch(error) {
        if(error.code!=='DATASET_WRITER_RUNNING')throw error;
        rows.push({operationId:entry.name,names:[],state:'RUNNING'});
      }
    }
    rows.sort((a,b)=>a.operationId.localeCompare(b.operationId));
    return page(rows,value);
  }
  async function close() {
    if(closing)return closing;
    stopping=true;
    closing=(async()=>{
      while(requests.size)await Promise.allSettled([...requests]);
      await editionReads.close();
    })().catch(error=>{closing=null;throw error;});
    return closing;
  }
  return {
    profile,root,roots,accept,close,
    info:()=>({schema:'stellar-forge.captured-handover-browser.v1',product:profile.name,
      productId:inputHash(product),directory:profile.directory,projectsDirectory:profile.projectsDirectory,
      state:stopping?'DRAINING':'OPEN',activeJobs:[...activeJobs.keys()]}),
    inventory:()=>inventoryCapturedHandover({directory:profile.directory}),
    createDraft,readDraft,saveDraft,reviewDraftMerge,saveDraftMerge,exportWorkingEdit,importWorkingEdit,
    reviewReceivingDecision,saveReceivingDecision,editionComparison,editionFile,releaseEditionFile,
    listDrafts,startJob,resumeJob,readJob,listJobs,jobDocument,receivedOperations,listUploads,
  };
}
