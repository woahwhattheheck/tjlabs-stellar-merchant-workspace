// MIT. Durable Geoapify jobs, human review and original SF30 dataset editions.
import {mkdir,open,rename,unlink,lstat,realpath} from 'node:fs/promises';
import {resolve,join,dirname,basename,relative,isAbsolute,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {gzipSync} from 'node:zlib';
import {loadDatasetConfig} from '../dataset-handler.mjs';
import {buildDatasetSellerConfig,datasetQueryParameters} from '../dataset-cli.mjs';
import {hash,canonical,json,object,own,fail,parseJSON,text,integer,readCsvRecords,readJSONSourceRecords,
  createIntake,inspectIntake,prepareBatch,inspectRequest,sanitizeReply,inspectReply,reviewIntake,validateDecision,buildRows,csvBytes} from './source.mjs';
import {reviewHtml,sourceComparisonHtml} from './report.mjs';
import {createSourceInspection} from './source-inspection.mjs';
import {inspectGeoapifyPackage} from './package.mjs';
import {createGeoapifyCustomerReviewStore} from './customer-review-store.mjs';
import {compareSources,inheritedMatches,reusableDecisions,validateComparison} from './source-history.mjs';
const SCHEMA='stellar-forge.geoapify-workspace.v1',PACKAGE='stellar-forge.geoapify-package.v1';
const MAX=256*1024*1024,HASH=/^[a-f0-9]{64}$/,now=()=>new Date().toISOString();
const exists=async p=>{try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
function safeFile(v){
  if(typeof v!=='string'||!v||v.length>500||isAbsolute(v)||v.includes('\\')||/[\x00-\x1f\x7f]/.test(v)||
      v.split('/').some(p=>!p||p==='.'||p==='..'))throw fail('FILE','Choose an original retained file.');
  return v;
}
async function syncDirectory(path){const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}
async function privateDirectory(path){
  await mkdir(path,{recursive:true,mode:0o700});
  if(await realpath(path)!==path||!(await lstat(path)).isDirectory())throw fail('DIRECTORY','Use a canonical private directory.');
}
async function atomic(path,bytes){
  await privateDirectory(dirname(path));
  const tmp=path+'.'+randomUUID()+'.pending';
  try{
    const h=await open(tmp,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
    await rename(tmp,path);await syncDirectory(dirname(path));
  }finally{await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function fileBytes(path,max=MAX){
  if((await lstat(path)).isSymbolicLink())throw fail('FILE','Read a regular original file, not a symbolic link.');
  const h=await open(path,'r');
  try{const a=await h.stat({bigint:true});if(!a.isFile()||a.size>BigInt(max))throw fail('FILE','Source exceeds the regular-file byte limit.');
    const b=await h.readFile(),z=await h.stat({bigint:true});
    if(b.length>max||BigInt(b.length)!==a.size||a.size!==z.size||a.mtimeNs!==z.mtimeNs)throw fail('SOURCE_CHANGED','The file changed while being read.',409);
    return b;
  }finally{await h.close();}
}
async function sourceBytes(input){
  const provided=['text','base64','path'].filter(key=>input[key]!==undefined);
  if(provided.length!==1)throw fail('SOURCE_INPUT','Choose exactly one complete source: text, base64 bytes or a host path.');
  let raw;
  if(provided[0]==='path')raw=await fileBytes(resolve(text(input.path,'Original source path')));
  else if(provided[0]==='text'){
    if(typeof input.text!=='string')throw fail('SOURCE_INPUT','Source text must be a string.');
    raw=Buffer.from(input.text,'utf8');
  }else{
    if(typeof input.base64!=='string'||input.base64.length>Math.ceil(MAX/3)*4||
        input.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))
      throw fail('SOURCE_INPUT','Use the complete canonical base64 of the original source bytes.');
    raw=Buffer.from(input.base64,'base64');
    if(raw.toString('base64')!==input.base64)throw fail('SOURCE_INPUT','The source base64 bytes are not canonical.');
  }
  if(raw.length>MAX)throw fail('SOURCE_LIMIT','The original source exceeds256MiB.');
  if(input.expectedSourceSha256!==undefined)sourceGuard(input.expectedSourceSha256,hash(raw),'SOURCE_CHANGED','The original source bytes differ from the inspected file. Inspect this source again.');
  return raw;
}
function sourceGuard(expected,actual,code,message){
  if(expected===undefined)return;
  if(typeof expected!=='string'||!HASH.test(expected))throw fail('SOURCE_GUARD','Use a complete SHA-256 source or mapping guard.');
  if(expected!==actual)throw fail(code,message,409);
}
function mappingGuard(input,value){
  sourceGuard(input.expectedMappingSha256,hash(canonical(value.mapping)),'MAPPING_CHANGED','The selected field mapping differs from the inspected mapping. Preview these choices again.');
}
const descriptor=(file,b)=>({file,bytes:b.length,sha256:hash(b)});
function shape(s){
  if(!object(s)||s.schema!==SCHEMA||!HASH.test(s.id??'')||!Number.isSafeInteger(s.revision)||s.revision<0||
      !['jobs','decisions','editions','exports'].every(k=>Array.isArray(s[k]))||!object(s.queries))
    throw fail('WORKSPACE','Read the complete original Geoapify workspace.');
}
const responseTypes=['PENDING','COMPLETE','PARTIAL'];
function retryDate(value,at){
  if(typeof value!=='string'||!value)return null;
  const seconds=/^\d+$/.test(value)?Number(value):null,date=seconds===null?Date.parse(value):Date.parse(at)+seconds*1000;
  return Number.isFinite(date)&&date>Date.parse(at)?new Date(date).toISOString():null;
}
export async function openGeoapifyWorkspace({directory,apiKey=process.env.GEOAPIFY_API_KEY,fetcher=globalThis.fetch,timeoutMs=120000}={}){
  directory=resolve(text(directory,'Workspace directory'));await privateDirectory(directory);
  await syncDirectory(dirname(directory));
  let lease;
  if(await exists(join(directory,'writer.sqlite'))&&(await lstat(join(directory,'writer.sqlite'))).isSymbolicLink())throw fail('DIRECTORY','The original writer lease must be a regular private file.');
  try{lease=new DatabaseSync(join(directory,'writer.sqlite'));lease.exec('PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE');}
  catch(e){try{lease?.close();}catch{}throw fail('WORKSPACE_BUSY','The private workspace writer could not be acquired: '+e.message,409);}
  const statePath=join(directory,'workspace.json');let state;
  try{state=await exists(statePath)?parseJSON(await fileBytes(statePath)):{
    schema:SCHEMA,id:hash(randomUUID()),revision:0,createdAt:now(),intake:null,jobs:[],decisions:[],editions:[],
    activeEditionId:null,exports:[],queries:{},merchant:null};shape(state);
    if(!await exists(statePath))await atomic(statePath,json(state));
  }catch(e){lease.close();throw e;}
  // Legacy untagged records belong to the original first intake, never the current selection.
  const originalIntake=()=>state.sources?.[0]?.intake??state.intake;
  const sourceEntries=()=>state.sources??(state.intake?[{intake:state.intake,createdAt:state.createdAt,activatedAt:state.createdAt,baselineEditionId:null}]:[]);
  const sourceEntry=sha=>{const found=sourceEntries().find(v=>v.intake.sha256===(sha??state.intake?.sha256));
    if(!found)throw fail('SOURCE_SELECTION','Choose an original retained intake SHA-256.',404);return found;};
  const boundSource=record=>record.intakeSha256??originalIntake()?.sha256;
  const ensureHistory=s=>{s.sources??=s.intake?[{intake:s.intake,createdAt:s.createdAt,activatedAt:s.createdAt,baselineEditionId:null}]:[];s.editors??={};};
  let closed=false,tail=Promise.resolve(),cache=null,comparisonCache=null;
  const serial=fn=>{if(closed)return Promise.reject(fail('CLOSED','The workspace is closed.',409));
    const p=tail.then(fn);tail=p.catch(()=>{});return p;};
  const commit=async mutate=>{
    const next=structuredClone(state);await mutate(next);next.revision=state.revision+1;next.updatedAt=now();
    await atomic(statePath,json(next));state=next;cache=null;
  };
  const inside=async file=>{
    const full=join(directory,safeFile(file)),actual=await realpath(full),rel=relative(directory,actual);
    if(full!==actual||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw fail('FILE','Retained files must remain inside this workspace.');
    return full;
  };
  const read=async d=>{
    if(!d||!HASH.test(d.sha256??''))throw fail('FILE','A retained file identity is missing.');
    const b=await fileBytes(await inside(d.file));
    if(b.length!==d.bytes||hash(b)!==d.sha256)throw fail('RETAINED_CHANGED','Retained bytes differ from their original descriptor.',409);
    return b;
  };
  const immutable=async(file,b)=>{
    const full=join(directory,safeFile(file));
    if(!Buffer.isBuffer(b)||b.length>MAX)throw fail('FILE_LIMIT','A retained file exceeds256MiB. Choose a smaller original source or edition.');
    if(await exists(full)){if(!(await fileBytes(await inside(file))).equals(b))throw fail('RETAINED_CHANGED','An immutable path already has different bytes.',409);}
    else{
      await atomic(full,b);
      // Persist any new nested directory links before state acknowledges the descriptor.
      let p=dirname(full);while(p!==directory){await syncDirectory(dirname(p));p=dirname(p);}
    }
    return descriptor(file,b);
  };
  const getIntake=async sha=>{
    if(!state.intake)throw fail('INTAKE_REQUIRED','Import the original source first.');
    const v=parseJSON(await read(sourceEntry(sha).intake));inspectIntake(v);return v;
  };
  const request=async job=>parseJSON(await read(job.request));
  async function review(sha=state.intake?.sha256){
    if(cache?.revision===state.revision&&cache.sha===sha)return cache.value;
    const entry=sourceEntry(sha),intake=await getIntake(sha);
    const baseline=entry.baselineEditionId?state.editions.find(e=>e.id===entry.baselineEditionId):null;
    if(entry.baselineEditionId&&!baseline)throw fail('EDITION','The retained baseline edition is missing.');
    const matches=inheritedMatches({intake,baselineReview:baseline?parseJSON(await read(baseline.review)):null});
    if(baseline)for(const match of Object.values(matches))match.inheritedFrom={editionId:baseline.id,intakeSha256:boundSource(baseline),reviewSha256:baseline.review.sha256};
    for(const job of state.jobs.filter(j=>boundSource(j)===sha)){
      const req=await request(job);inspectRequest(intake,req);
      for(const event of job.events){
        if(!responseTypes.includes(event.outcome))continue;
        const reply=parseJSON(await read(event.response));
        const parsed=inspectReply({body:reply,request:req,expectedJobId:job.jobId,status:event.status});
        if(parsed.status==='PENDING')continue;
        for(const [id,m] of Object.entries(parsed.matches))matches[id]={...m,responseSha256:event.response.sha256,jobId:job.id};
      }
    }
    const value={...reviewIntake({intake,matches,decisions:state.decisions.filter(d=>boundSource(d)===sha)}),intakeSha256:sha};
    value.rows=value.rows.map(row=>({...row,inheritedFrom:matches[row.id]?.inheritedFrom??null}));
    cache={revision:state.revision,sha,value};return value;
  }
  const active=()=>state.editions.find(e=>e.id===state.activeEditionId);
  async function dataset(edition=active()){
    if(!edition)throw fail('EDITION_REQUIRED','Build and choose a retained dataset edition.');
    await read(edition.csv);await read(edition.config);
    const model=await loadDatasetConfig(await inside(edition.config.file));
    if(model.describe().snapshot!==edition.snapshot)throw fail('EDITION_CHANGED','The original dataset snapshot differs.',409);
    return model;
  }
  async function view(){
    const r=state.intake?await review():null;
    return {schema:SCHEMA,id:state.id,directory,revision:state.revision,createdAt:state.createdAt,updatedAt:state.updatedAt,
      intake:state.intake,source:r?.source??null,mapping:r?.mapping??null,summary:r?.summary??null,sourceCount:sourceEntries().length,
      jobs:state.jobs.map(({queryIds,...job})=>({...job,intakeSha256:boundSource(job),queryCount:queryIds.length})),
      editions:state.editions.map(e=>({...e,intakeSha256:boundSource(e)})),activeEditionId:state.activeEditionId,exports:state.exports,merchant:state.merchant,
      lastQuery:active()?state.queries[active().id]??null:null,editor:state.editor??null,customerReviews:customerReviews.summary(),
      api:{configured:Boolean(apiKey),maximumBatch:1000,minimumPollMs:60000,retentionHours:24,
        notBefore:state.providerNotBefore??null,
        spec:'https://apidocs.geoapify.com/assets/openapi/specs/batch/batch-api-openapi-specs.json'}};
  }
  let sourceInspection=null;
  async function previewSource(input){
    let inspection;
    if(input.inspectionId!==undefined){
      if(['text','base64','path'].some(key=>input[key]!==undefined))throw fail('SOURCE_INPUT','Use the retained inspection or a complete source, not both.');
      if(!HASH.test(input.inspectionId??'')||sourceInspection?.id!==input.inspectionId)
        throw fail('INSPECTION_EXPIRED','This source inspection is no longer open. Inspect the original file again.',409);
      inspection=sourceInspection;
      if(input.format!==undefined&&input.format!==inspection.format)throw fail('SOURCE_CHANGED','The selected format differs from this inspection.',409);
      sourceGuard(input.expectedSourceSha256,inspection.model.source.sha256,'SOURCE_CHANGED','The selected source differs from this inspection.');
    }else{
      const bytes=await sourceBytes(input),id=hash(canonical({sourceSha256:hash(bytes),format:input.format}));
      if(sourceInspection?.id!==id){
        const name=input.name??(input.path?basename(input.path):'address-source');
        sourceInspection={id,format:input.format,model:createSourceInspection({bytes,format:input.format,name})};
      }
      inspection=sourceInspection;
    }
    const result=inspection.model.inspect({mapping:input.mapping,fieldOffset:input.fieldOffset,fieldLimit:input.fieldLimit,
      fieldSearch:input.fieldSearch,rowOffset:input.rowOffset,rowLimit:input.rowLimit});
    if(input.name!==undefined||input.path!==undefined)result.source.name=text(input.name??basename(input.path),'Source name',200);
    return {...result,inspectionId:inspection.id};
  }
  async function importSource(input){
    if(state.intake)throw fail('INTAKE_EXISTS','Use a new workspace for another original source.',409);
    const raw=await sourceBytes(input);
    const records=input.format==='csv'?readCsvRecords(raw).rows:input.format==='json'?readJSONSourceRecords(raw):
      (()=>{throw fail('FORMAT','Choose CSV or JSON records.');})();
    const source={name:text(input.name??(input.path?basename(input.path):'address-source'),'Source name',200),
      url:input.sourceURL??null,format:input.format,bytes:raw.length,sha256:hash(raw),rows:records.length,
      provenance:text(input.provenance,'Source rights and provenance')};
    const value=createIntake({records,source,mapping:input.mapping});mappingGuard(input,value);
    const original=await immutable('source/'+source.sha256+(input.format==='csv'?'.csv':'.json'),raw);
    const body=json(value),record={...await immutable('source/intake-'+hash(body)+'.json',body),original};
    await commit(s=>{s.intake=record;ensureHistory(s);});return {intake:record,summary:inspectIntake(value)};
  }
  async function describeSource(entry,retained){
    const intake=retained?.after??await getIntake(entry.intake.sha256);
    return structuredClone({...entry,source:intake.source,summary:retained?.afterSummary??inspectIntake(intake),active:entry.intake.sha256===state.intake?.sha256});
  }
  async function sourceHistory(input){
    const offset=integer(input.offset??0,'Offset',0,1000000),limit=integer(input.limit??25,'Limit',1,250),entries=sourceEntries();
    return {activeIntakeSha256:state.intake?.sha256??null,total:entries.length,offset,
      sources:await Promise.all(entries.slice(offset,offset+limit).map(describeSource))};
  }
  async function comparisonData(entry){
    if(!entry.comparison||!entry.baselineEditionId)throw fail('COMPARISON','The first source has no prior frozen edition to compare.');
    if(comparisonCache?.sha===entry.comparison.sha256)return comparisonCache.value;
    const edition=state.editions.find(e=>e.id===entry.baselineEditionId);
    if(!edition)throw fail('EDITION','The original comparison baseline edition is missing.');
    const beforeSha256=boundSource(edition),before=await getIntake(beforeSha256),after=await getIntake(entry.intake.sha256);
    const comparison=parseJSON(await read(entry.comparison));
    validateComparison(comparison,{before,after,beforeSha256,afterSha256:entry.intake.sha256,edition});
    const baselineReview=parseJSON(await read(edition.review));
    const reusable=reusableDecisions({intake:after,baselineReview});
    const value={comparison,before,after,afterSummary:inspectIntake(after),edition,reusable};comparisonCache={sha:entry.comparison.sha256,value};return value;
  }
  const comparisonHeader=(comparison,entry)=>{
    const {rows,...header}=comparison;return structuredClone({...header,sha256:entry.comparison.sha256});
  };
  async function stageSource(input){
    if(!state.intake)throw fail('INTAKE_REQUIRED','Import the first original source before staging a following edition.');
    const baseline=state.editions.find(e=>e.id===input.baselineEditionId);
    if(!baseline)throw fail('EDITION','Choose the actual frozen edition used as the comparison baseline.');
    const raw=await sourceBytes(input);
    const records=input.format==='csv'?readCsvRecords(raw).rows:input.format==='json'?readJSONSourceRecords(raw):
      (()=>{throw fail('FORMAT','Choose CSV or JSON records.');})();
    const beforeSha256=boundSource(baseline),before=await getIntake(beforeSha256);
    const source={name:text(input.name??(input.path?basename(input.path):'following-address-source'),'Source name',200),
      url:input.sourceURL??null,format:input.format,bytes:raw.length,sha256:hash(raw),rows:records.length,
      provenance:text(input.provenance,'Source rights and provenance')};
    const value=createIntake({records,source,mapping:input.mapping??before.mapping});mappingGuard(input,value);
    const body=json(value),sha=hash(body);
    const prior=sourceEntries().find(e=>e.intake.sha256===sha);
    if(prior){
      if(prior.baselineEditionId!==baseline.id)throw fail('SOURCE_EXISTS','This exact intake already has its own retained original history and baseline. Select it in source history.',409);
      const {comparison}=await comparisonData(prior);return {source:await describeSource(prior),comparison:comparisonHeader(comparison,prior),reused:true};
    }
    const comparison=compareSources({before,after:value,beforeSha256,afterSha256:sha,edition:baseline});
    const original=await immutable('source/'+source.sha256+(input.format==='csv'?'.csv':'.json'),raw);
    const intake={...await immutable('source/intake-'+sha+'.json',body),original};
    const entry={intake,createdAt:now(),activatedAt:null,baselineEditionId:baseline.id,
      comparison:await immutable('source/'+comparison.id+'.json',json(comparison))};
    await commit(s=>{ensureHistory(s);s.sources.push(entry);});
    return {source:await describeSource(entry),comparison:comparisonHeader(comparison,entry),reused:false};
  }
  async function inspectComparison(input){
    const entry=sourceEntry(input.sourceSha256),retained=await comparisonData(entry),{comparison,before,after,reusable}=retained;
    const offset=integer(input.offset??0,'Offset',0,2000000),limit=integer(input.limit??25,'Limit',1,250),
      reuseOffset=integer(input.reuseOffset??0,'Reuse offset',0,1000000),reuseLimit=integer(input.reuseLimit??25,'Reuse limit',1,250);
    let rows=comparison.rows;
    if(input.status)rows=rows.filter(r=>r.status===input.status);
    if(input.search){const needle=text(input.search,'Comparison search',1000).toLowerCase();rows=rows.filter(r=>
      canonical({identity:r.identity,beforeOrdinal:r.beforeOrdinal,afterOrdinal:r.afterOrdinal,beforeQueryId:r.beforeQueryId,afterQueryId:r.afterQueryId}).toLowerCase().includes(needle));}
    return {source:await describeSource(entry,retained),comparison:comparisonHeader(comparison,entry),total:rows.length,offset,
      rows:structuredClone(rows.slice(offset,offset+limit).map(r=>({...r,before:r.beforeOrdinal?before.rows[r.beforeOrdinal-1]:null,after:r.afterOrdinal?after.rows[r.afterOrdinal-1]:null}))),
      reusableTotal:reusable.length,reuseOffset,reusableQueries:structuredClone(reusable.slice(reuseOffset,reuseOffset+reuseLimit))};
  }
  async function activateSource(input){
    const entry=sourceEntry(input.sourceSha256),sha=entry.intake.sha256;
    if(input.reuseAllEligible!==undefined&&typeof input.reuseAllEligible!=='boolean')throw fail('REUSE','Choose an explicit all-eligible policy.');
    if(input.reuseAllEligible===true&&input.reuseQueryIds!==undefined)throw fail('REUSE','Choose explicit query IDs OR all eligible decisions.');
    if(input.reuseQueryIds!==undefined&&(!Array.isArray(input.reuseQueryIds)||new Set(input.reuseQueryIds).size!==input.reuseQueryIds.length))
      throw fail('REUSE','Choose distinct eligible original query IDs.');
    const requested=input.reuseAllEligible===true||Boolean(input.reuseQueryIds?.length);
    if(entry.activatedAt&&requested)throw fail('REUSE_ALREADY_APPLIED','This source was already activated. Reopen its original review to make further decisions.',409);
    let decisions=[];
    if(!entry.activatedAt){
      const {comparison,reusable}=await comparisonData(entry);
      if(input.expectedComparisonSha256!==entry.comparison.sha256)throw fail('COMPARISON_CHANGED','Review the exact retained source comparison before activating it.',409);
      const chosen=input.reuseAllEligible===true?reusable.map(r=>r.queryId):(input.reuseQueryIds??[]);
      const byId=new Map(reusable.map(r=>[r.queryId,r]));
      if(chosen.some(id=>!byId.has(id)))throw fail('REUSE_CHANGED','A selected query is not an eligible decision in this frozen baseline.',409);
      if(chosen.length){
        const reviewer=text(input.reviewer,'Reviewer',200),note=text(input.note,'Reason for reusing these exact baseline decisions'),current=await review(sha),currentRows=new Map(current.rows.map(r=>[r.id,r]));
        decisions=chosen.map(queryId=>{const old=byId.get(queryId),d=old.baselineDecision;
          return {...validateDecision({review:{rows:[currentRows.get(queryId)]},queryId,action:d.action,candidateId:d.candidateId,
            coordinateChoice:d.coordinateChoice,reviewer,note,expectedResponseSha256:old.baselineResponseSha256}),
            intakeSha256:sha,reusedFrom:{editionId:entry.baselineEditionId,comparisonSha256:entry.comparison.sha256,decision:structuredClone(d)}};});
      }
    }
    await commit(s=>{
      ensureHistory(s);
      if(s.intake&&s.editor)s.editors[s.intake.sha256]=s.editor;
      s.intake=entry.intake;s.editor=s.editors[sha]??null;s.decisions.push(...decisions);
      const saved=s.sources.find(v=>v.intake.sha256===sha);
      if(!saved.activatedAt){saved.activatedAt=now();saved.reuse={count:decisions.length,allEligible:input.reuseAllEligible===true,
        reviewer:decisions[0]?.reviewer??null,note:decisions[0]?.note??null,comparisonSha256:entry.comparison.sha256};}
    });
    return {source:await describeSource(sourceEntry(sha)),reusedDecisions:decisions.length,count:decisions.length};
  }
  async function prepare(input){
    const intake=await getIntake(),r=await review();
    const blocked=new Set(state.jobs.filter(j=>boundSource(j)===state.intake.sha256&&['PREPARED','SENDING','UNCERTAIN','PENDING','POLLING'].includes(j.status)).flatMap(j=>j.queryIds));
    const eligible=r.rows.filter(row=>!blocked.has(row.id)&&(input.refresh===true||['UNQUERIED','MISSING','ERROR','NO_MATCH','AMBIGUOUS'].includes(row.providerStatus))).map(r=>r.id);
    const max=integer(input.maximumInputs??1000,'Explicit batch maximum',1,1000);
    const ids=input.queryIds??eligible.slice(0,max),eligibleSet=new Set(eligible);
    if(!Array.isArray(ids))throw fail('BATCH','Select original query IDs as an array.');
    if(ids.some(id=>blocked.has(id)))throw fail('JOB_PENDING','These queries already belong to a retained open job. Continue or explicitly abandon that job.',409);
    if(ids.some(id=>!eligibleSet.has(id)))throw fail('REFRESH_REQUIRED','To repeat a completed query, select explicit query IDs and request refresh.',409);
    if(input.refresh===true&&!Array.isArray(input.queryIds))throw fail('REFRESH_REQUIRED','Choose explicit original IDs for a refreshed provider request.');
    if(ids.length>max)throw fail('BATCH_LIMIT','The selected IDs exceed the explicit batch maximum.');
    const req=prepareBatch(intake,ids,input.options??{}),id='job-'+randomUUID();
    const job={id,intakeSha256:state.intake.sha256,createdAt:now(),status:'PREPARED',queryIds:ids,providerBodySha256:hash(json(req.body)),providerBodyBytes:json(req.body).length,request:await immutable('requests/'+id+'.json',json(req)),
      jobId:null,events:[],nextPollAt:null,abandonment:null};
    await commit(s=>{s.jobs.push(job);});
    return {job,request:req,selected:ids.length,remainingEligible:eligible.length-ids.length,totalQueries:r.summary.queries};
  }
  const chooseJob=id=>{const j=state.jobs.find(j=>j.id===id);if(!j)throw fail('JOB','Choose an original retained batch job.');return j;};
  async function receive(job,raw,status,{method='IMPORT',retryAfter=null,at=now()}={}){
    let sanitized;
    try{sanitized=sanitizeReply(raw);}
    catch(e){
      // Header-authenticated native transport never stores its API key even if a server echoes it.
      let rawText=Buffer.from(raw).toString('utf8');if(apiKey)rawText=rawText.split(apiKey).join('[credential removed]');
      sanitized={bytes:Buffer.from(rawText),body:null,originalSha256:hash(raw),originalBytes:raw.length,redactions:['unparsed-response']};
    }
    if(apiKey&&sanitized.bytes.includes(Buffer.from(apiKey)))throw fail('CREDENTIAL_ECHO','The provider echoed the account credential. Keep the original job and inspect it in the account.');
    const eventId='return-'+randomUUID(),response=await immutable('provider/'+eventId+'.json',sanitized.bytes);
    const req=await request(job),event={id:eventId,at,method,status,retryAfter,originalSha256:sanitized.originalSha256,
      originalBytes:sanitized.originalBytes,redactions:sanitized.redactions,response,outcome:'PROVIDER_ERROR'};
    let parsed,error;
    if([200,202].includes(status)&&sanitized.body)try{parsed=inspectReply({body:sanitized.body,request:req,expectedJobId:job.jobId,status});event.outcome=parsed.status;event.issues=parsed.issues;}
      catch(e){error={code:e.code,message:e.message};event.outcome='UNBOUND_RESPONSE';event.error=error;}
    const floor=retryDate(retryAfter,at),minimum=new Date(Date.parse(at)+60000).toISOString();
    await commit(s=>{
      const target=s.jobs.find(j=>j.id===job.id);target.events.push(event);
      const providerFloor=floor??(status===429?minimum:null);
      if(providerFloor&&(!s.providerNotBefore||providerFloor>s.providerNotBefore))s.providerNotBefore=providerFloor;
      target.nextPollAt=floor&&floor>minimum?floor:minimum;
      if(parsed){target.jobId=parsed.jobId;target.status=parsed.status;}
      else if(method==='POST')target.status=[400,401,403,404,405,413,415,422,429].includes(status)?'REJECTED':'UNCERTAIN';
      else if(status===404)target.status='EXPIRED';
      else target.status=target.jobId?'PENDING':'UNCERTAIN';
      target.lastError=error??(![200,202].includes(status)?{code:'HTTP_'+status,message:'Provider returned HTTP '+status}:null);
      if(parsed&&parsed.status!=='PENDING')target.completedAt=at;
    });
    return {job:chooseJob(job.id),event,parsed:parsed?{status:parsed.status,issues:parsed.issues}:null};
  }
  async function invoke(input,method){
    let job=chooseJob(input.id);
    if(job.request.sha256!==input.expectedRequestSha256)throw fail('REQUEST_CHANGED','Review the original prepared request before continuing.',409);
    if(state.providerNotBefore&&Date.now()<Date.parse(state.providerNotBefore))
      throw fail('PROVIDER_RETRY','The retained provider retry floor is '+state.providerNotBefore+'.',429);
    if(!apiKey||typeof fetcher!=='function')throw fail('ACCOUNT','Start this workspace with GEOAPIFY_API_KEY and its native HTTP transport.');
    const req=await request(job);inspectRequest(await getIntake(boundSource(job)),req);
    if(method==='POST'&&job.status!=='PREPARED')throw fail('ALREADY_DISPATCHED','Continue the original job. An already dispatched POST is never repeated automatically.',409);
    if(method==='GET'&&(!job.jobId||['COMPLETE','PARTIAL','ABANDONED','REJECTED','EXPIRED'].includes(job.status)))
      throw fail('POLL','Choose an original pending job with its returned provider ID.');
    if(method==='GET'&&job.nextPollAt&&Date.now()<Date.parse(job.nextPollAt))
      throw fail('POLL_TIME','The next permitted poll is '+job.nextPollAt+'. Each poll consumes an API call.',429);
    await commit(s=>{const target=s.jobs.find(j=>j.id===job.id);target.status=method==='POST'?'SENDING':'POLLING';
      target.lastAttempt={method,at:now()};if(method==='GET')target.nextPollAt=new Date(Date.now()+60000).toISOString();});
    job=chooseJob(job.id);const url=new URL(req.endpoint);if(method==='GET')url.searchParams.set('id',job.jobId);
    try{
      const response=await fetcher(url.href,{method,headers:{'x-api-key':apiKey,accept:'application/json',
        ...(method==='POST'?{'content-type':'application/json'}:{})},...(method==='POST'?{body:json(req.body)}:{}),
        redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
      const chunks=[];let size=0;
      if(response.body)for await(const part of response.body){size+=part.length;if(size>MAX)throw fail('PROVIDER_LIMIT','Provider response exceeds256MiB; continue the retained original job.');chunks.push(part);}
      return await receive(job,Buffer.concat(chunks),response.status,{method,retryAfter:response.headers.get('retry-after'),at:now()});
    }catch(error){
      const current=chooseJob(job.id);
      if(['SENDING','POLLING'].includes(current.status))await commit(s=>{
        const target=s.jobs.find(j=>j.id===job.id);target.status=target.jobId?'PENDING':'UNCERTAIN';
        target.lastError={code:error.code??'TRANSPORT',message:apiKey?String(error.message).split(apiKey).join('[credential removed]'):error.message,at:now()};});
      const message=apiKey?String(error.message).split(apiKey).join('[credential removed]'):String(error.message);
      throw fail('TRANSPORT',message,Number.isInteger(error.status)?error.status:502);
    }
  }
  async function importResponse(input){
    const job=chooseJob(input.id);
    if(job.request.sha256!==input.expectedRequestSha256||job.status==='ABANDONED')throw fail('REQUEST_CHANGED','Choose the original open request and its full response.',409);
    const raw=typeof input.text==='string'?Buffer.from(input.text):await fileBytes(resolve(text(input.path,'Original provider response path')));
    // Imported responses must be structurally recognizable; don't add arbitrary files to the provider history.
    sanitizeReply(raw);
    return receive(job,raw,integer(input.status??200,'Original HTTP status',100,599),{method:'IMPORT',retryAfter:input.retryAfter??null});
  }
  async function buildEdition(input){
    const intake=await getIntake(),reviewed=await review(),name=text(input.name,'Dataset name',128);
    const output=buildRows({intake,review:reviewed,sourceColumns:input.sourceColumns??[],scope:input.scope??'all-source'});
    if(!output.rows.length)throw fail('EMPTY_EDITION','The chosen scope contains no original source records.');
    const numbers=new Set(['confidence','provider_latitude','provider_longitude','distance_m','selected_latitude','selected_longitude']);
    const columns=Object.fromEntries(output.columns.map(n=>[n,{type:n==='source_ordinal'?'integer':numbers.has(n)?'number':'string',nullable:numbers.has(n)}]));
    const config={schema:'stellar-forge.csv-dataset.v1',file:'dataset.csv',name,columns,
      filters:['review_state','result_type','match_type','coordinate_choice'],ranges:['confidence','distance_m'],
      sorts:['source_ordinal','confidence','distance_m'],defaultLimit:50,maxLimit:250};
    const csv=csvBytes(output.rows,output.columns),basis={intake:state.intake.sha256,decisions:state.decisions.filter(d=>boundSource(d)===state.intake.sha256),
      responses:state.jobs.filter(j=>boundSource(j)===state.intake.sha256).flatMap(j=>j.events.filter(e=>['COMPLETE','PARTIAL'].includes(e.outcome)).map(e=>({jobId:j.id,sha256:e.response.sha256}))),
      sourceColumns:input.sourceColumns??[],scope:input.scope??'all-source'};
    const id='edition-'+hash(canonical({csv:hash(csv),config,basis})),prior=state.editions.find(e=>e.id===id);
    if(prior){await commit(s=>{s.activeEditionId=id;});return {edition:prior,reused:true};}
    const prefix='editions/'+id,csvFile=await immutable(prefix+'/dataset.csv',csv),configFile=await immutable(prefix+'/dataset.json',json(config));
    const model=await loadDatasetConfig(await inside(configFile.file)),description=model.describe();
    const record={id,name,intakeSha256:state.intake.sha256,createdAt:now(),rowCount:output.rows.length,snapshot:description.snapshot,scope:basis.scope,
      csv:csvFile,config:configFile,basis:await immutable(prefix+'/review-basis.json',json(basis)),
      review:await immutable(prefix+'/address-review.json',json(reviewed)),
      geojson:await immutable(prefix+'/dataset.geojson',json(output.geojson)),
      report:await immutable(prefix+'/review.html',Buffer.from(reviewHtml({intake,review:reviewed,edition:{id,name,...description,scope:basis.scope},rows:output.rows}))),
      sourceColumns:basis.sourceColumns,reviewSummary:reviewed.summary,queryParameters:datasetQueryParameters(description)};
    const source=sourceEntry(state.intake.sha256);
    if(source.comparison){const compared=await comparisonData(source);
      record.comparisonReport=await immutable(prefix+'/source-comparison.html',Buffer.from(sourceComparisonHtml({...compared,edition:record})));}
    await commit(s=>{s.editions.push(record);s.activeEditionId=id;});
    return {edition:record,dataset:description,preview:model.handle({query:{limit:'50'}})};
  }
  const customerReviews=createGeoapifyCustomerReviewStore({getState:()=>state,getIntake,boundSource,read,readInput:fileBytes,readUncommitted:async file=>{try{return await fileBytes(await inside(file));}catch(error){if(error.code==='ENOENT')return null;throw error;}},immutable,commit,currentReview:review});
  async function retainedFiles(){
    const entries=new Map(),add=async d=>{if(d&&!entries.has(d.file))entries.set(d.file,await read(d));};
    for(const source of sourceEntries()){await add(source.intake);await add(source.intake.original);await add(source.comparison);}
    for(const job of state.jobs){await add(job.request);for(const e of job.events)await add(e.response);}
    for(const e of state.editions)for(const key of ['csv','config','basis','review','geojson','report','comparisonReport'])await add(e[key]);
    for(const d of customerReviews.descriptors())await add(d);
    return entries;
  }
  async function exportPackage(input={}){
    // Preserve complete derived comparison reports inside the workspace archive as well.
    // Earlier frozen IDs/files remain unchanged; this only retains their additional report.
    const reports=[];
    for(const edition of state.editions){
      const selectedSource=sourceEntry(boundSource(edition));
      if(!selectedSource.comparison||edition.comparisonReport)continue;
      const compared=await comparisonData(selectedSource),report=await immutable('editions/'+edition.id+'/source-comparison.html',
        Buffer.from(sourceComparisonHtml({...compared,edition})));
      reports.push({id:edition.id,report});
    }
    if(reports.length)await commit(s=>{for(const item of reports)s.editions.find(e=>e.id===item.id).comparisonReport=item.report;});
    const entries=await retainedFiles(),snapshot={...state,exports:[]},portable={schema:PACKAGE,exportedAt:now(),state:snapshot,
      files:[...entries].map(([file,b])=>({...descriptor(file,b),base64:b.toString('base64')}))};
    const portableBytes=json(portable);
    if(portableBytes.length>512*1024*1024)throw fail('PACKAGE_LIMIT','The complete workspace package exceeds its512MiB reopen limit. Retain this original workspace and use another for further source work.');
    const compressed=gzipSync(portableBytes);
    if(compressed.length>MAX)throw fail('PACKAGE_LIMIT','The compressed workspace exceeds256MiB. Retain the original workspace directory.');
    const id='export-'+randomUUID(),prefix='exports/'+id,values={'starforge-geoapify.json.gz':compressed};
    const edition=active();
    if(edition){
      const model=await dataset(),editionSource=sourceEntry(boundSource(edition)),intake=await getIntake(editionSource.intake.sha256);
      for(const [name,key] of [['dataset.csv','csv'],['dataset.json','config'],['dataset.geojson','geojson'],['address-review.json','review'],['review.html','report']])
        values[name]=await read(edition[key]);
      const manifest={schema:'stellar-forge.geoapify-source.v1',provider:'Geoapify',originalSource:intake.source,mapping:intake.mapping,
        intakeSha256:editionSource.intake.sha256,currentIntakeSha256:state.intake.sha256,edition,nativeSnapshot:edition.snapshot,rawRoot:'raw',
        providerDocs:'https://apidocs.geoapify.com/docs/batch',termsURL:'https://www.geoapify.com/terms-and-conditions/',
        attribution:'Geoapify; OpenStreetMap contributors and the original per-feature datasource attributions. Review the applicable plan and source licences before distribution.',
        jobs:state.jobs.filter(j=>boundSource(j)===editionSource.intake.sha256),sources:sourceEntries(),coordinatePolicy:'Original coordinates and chosen provider coordinates are separate. Only explicit retained reviewer decisions choose the published pair.'};
      values['query.json']=json({schema:'stellar-forge.dataset-query.v1',snapshot:edition.snapshot,query:state.queries[edition.id]?.initialQuery??{limit:'50'},queryParameters:datasetQueryParameters(model.describe())});
      if(state.merchant)values['seller.json']=json(await buildDatasetSellerConfig(model,state.merchant));
      if(editionSource.comparison){
        values['source-comparison.json']=await read(editionSource.comparison);
        values['source-comparison.html']=await read(edition.comparisonReport);
      }
      for(const [name,b] of entries)values['raw/'+name]=b;
      values['README.md']=Buffer.from('# Geoapify address review delivery\n\nOpen review.html for the complete frozen edition. Dataset and GeoJSON keep every selected original record, original and proposed coordinates, confidence, match type, source attribution and retained reviewer decision. Review state is explicit; no score automatically approves an address.\n\nImport starforge-geoapify.json.gz into an empty Geoapify workspace to restore original source, requests, provider jobs, complete candidates, review history and dataset editions. Continue original pending job IDs; never repeat an uncertain POST. The provider retains completed jobs for24hours, so retain returned results locally.\n\nThe original merchant publisher reads dataset.csv/dataset.json/source.json and optional seller.json from this directory. Publish only source and provider data you are permitted to distribute and preserve the original attribution fields.\n');
      manifest.sourceFiles=Object.entries(values).filter(([name])=>!['dataset.csv','dataset.json','seller.json'].includes(name))
        .map(([path,b])=>({path,bytes:b.length,sha256:hash(b)}));
      values['source.json']=json(manifest);
    }
    const files=[];for(const [name,b] of Object.entries(values)){const d=await immutable(prefix+'/'+name,b);files.push({name,bytes:d.bytes,sha256:d.sha256});}
    const exported={id,createdAt:now(),directory:join(directory,prefix),editionId:edition?.id??null,snapshot:edition?.snapshot??null,files};
    await commit(s=>{s.exports.push(exported);});return exported;
  }
  async function restore(input){
    if(state.intake||state.jobs.length||state.editions.length)throw fail('RESTORE','Restore into an empty Geoapify workspace.',409);
    const raw=await fileBytes(resolve(text(input.path,'Complete workspace package path')));
    const inspected=await inspectGeoapifyPackage(raw),saved=inspected.state,entries=inspected.files;
    for(const [file,b] of entries)await immutable(file,b);
    const next={...saved,exports:[],restoredAt:now(),revision:saved.revision+1};
    await atomic(statePath,json(next));state=next;cache=null;comparisonCache=null;customerReviews.reset();
    return {restored:true,id:state.id,rows:state.intake?inspected.sourceIntakes.get(state.intake.sha256).rows.length:0,
      jobs:state.jobs.length,editions:state.editions.length};
  }
  const reads=new Set(['intake.preview','status','review.list','review.query','provider.request','source.inspect','source.history','source.compare','customer.list','customer.inspect','customer.preview']);
  async function dispatch(action,input){
    if(action==='customer.issue'||action==='customer.adopt'||action==='customer.receive'){const recovered=await customerReviews.recovery(action,input);if(recovered)return recovered;}
    if(!reads.has(action)&&input.expectedRevision!==state.revision)throw fail('REVISION_CONFLICT','Refresh the original workspace before saving this change.',409);
    if(input.expectedIntakeSha256!==undefined&&['review.decide','provider.prepare','edition.build','editor.save'].includes(action)&&input.expectedIntakeSha256!==state.intake?.sha256)
      throw fail('INTAKE_CHANGED','The selected active intake differs. Reopen its source and review before saving.',409);
    if(action==='status')return {};
    if(action.startsWith('customer.'))return customerReviews.act(action,input);
    if(action==='source.history')return sourceHistory(input);
    if(action==='source.stage')return stageSource(input);
    if(action==='source.compare')return inspectComparison(input);
    if(action==='source.activate')return activateSource(input);
    if(action==='source.inspect'){
      const entry=sourceEntry(input.sourceSha256),source=await getIntake(entry.intake.sha256),offset=integer(input.offset??0,'Offset',0,1000000),limit=integer(input.limit??25,'Limit',1,250);
      return {intakeSha256:entry.intake.sha256,source:source.source,mapping:source.mapping,summary:inspectIntake(source),rows:source.rows.slice(offset,offset+limit),offset,
        duplicateIdentities:source.duplicateIdentities.slice(0,250)};
    }
    if(action==='editor.save'){
      if(!object(input.editor)||json(input.editor).length>262144)throw fail('EDITOR','Save the complete working forms within256KiB.');
      await commit(s=>{ensureHistory(s);s.editor={...structuredClone(input.editor),intakeSha256:s.intake?.sha256??null,savedAt:now()};
        if(s.intake)s.editors[s.intake.sha256]=s.editor;});return {editor:state.editor};
    }
    if(action==='intake.preview')return previewSource(input);
    if(action==='intake.import')return importSource(input);
    if(action==='provider.prepare')return prepare(input);
    if(action==='provider.run')return invoke(input,'POST');
    if(action==='provider.poll')return invoke(input,'GET');
    if(action==='provider.import')return importResponse(input);
    if(action==='provider.request'){const job=chooseJob(input.id);return {job,request:await request(job)};}
    if(action==='provider.abandon'){
      const job=chooseJob(input.id);if(['COMPLETE','PARTIAL','REJECTED','ABANDONED'].includes(job.status))throw fail('ABANDON','Choose an open original job.');
      const reason=text(input.reason,'Abandonment reason'),reviewer=text(input.reviewer,'Reviewer',200);
      await commit(s=>{const j=s.jobs.find(j=>j.id===job.id);j.status='ABANDONED';j.abandonment={at:now(),reason,reviewer,previousStatus:job.status,
        originalJobId:job.jobId,originalRequestSha256:job.request.sha256};});return chooseJob(job.id);
    }
    if(action==='review.list'){
      const r=await review(input.sourceSha256),offset=integer(input.offset??0,'Offset',0,1000000),limit=integer(input.limit??25,'Limit',1,250);
      let rows=r.rows;if(input.status)rows=rows.filter(row=>row.state===input.status);
      if(input.search){const needle=String(input.search).toLowerCase();rows=rows.filter(row=>canonical({id:row.id,params:row.params,ordinals:row.sourceOrdinals}).toLowerCase().includes(needle));}
      return {intakeSha256:r.intakeSha256,summary:r.summary,total:rows.length,offset,rows:rows.slice(offset,offset+limit)};
    }
    if(action==='review.query'){
      const r=await review(input.sourceSha256),row=r.rows.find(row=>row.id===input.queryId);if(!row)throw fail('QUERY','Choose an original source query.');
      return {...row,intakeSha256:r.intakeSha256,originalRows:(await getIntake(r.intakeSha256)).rows.filter(r=>r.queryId===row.id)};
    }
    if(action==='review.decide'){const d={...validateDecision({review:await review(),...input}),intakeSha256:state.intake.sha256};await commit(s=>{s.decisions.push(d);});return d;}
    if(action==='edition.build')return buildEdition(input);
    if(action==='edition.activate'){if(!state.editions.some(e=>e.id===input.editionId))throw fail('EDITION','Choose a retained original edition.');
      await commit(s=>{s.activeEditionId=input.editionId;});return active();}
    if(action==='dataset.query'){
      const model=await dataset(),result=model.handle({query:input.query??{}});
      if(result.status===200){const query={...input.query},initialQuery={...query};delete initialQuery.cursor;
        await commit(s=>{s.queries[s.activeEditionId]={query,initialQuery,snapshot:active().snapshot,nextCursor:result.body.page.nextCursor,at:now()};});}
      return result;
    }
    if(action==='merchant.configure'){await buildDatasetSellerConfig(await dataset(),input.merchant);
      await commit(s=>{s.merchant=structuredClone(input.merchant);});return {merchant:state.merchant};}
    if(action==='package.export')return exportPackage(input);
    if(action==='package.import')return restore(input);
    throw fail('ACTION','Choose a supported Geoapify operation.');
  }
  return {
    state:()=>serial(view),
    act:(action,input={})=>serial(async()=>{if(typeof action!=='string'||!object(input))throw fail('ACTION','Use an action name and object payload.');
      const result=await dispatch(action,input);return {result,state:await view()};}),
    readExport:(id,filename)=>serial(async()=>{
      const record=state.exports.find(e=>e.id===id),item=record?.files.find(f=>f.name===filename);
      if(!item)throw fail('EXPORT','Choose an original retained download.',404);
      const d={...item,file:'exports/'+id+'/'+safeFile(filename)},b=await read(d);
      return {path:await inside(d.file),bytes:b.length,sha256:hash(b),contentType:filename.endsWith('.gz')?'application/gzip':
        filename.endsWith('.html')?'text/html; charset=utf-8':filename.endsWith('.csv')?'text/csv; charset=utf-8':
        filename.endsWith('.json')||filename.endsWith('.geojson')?'application/json; charset=utf-8':'text/plain; charset=utf-8'};
    }),
    close:async()=>{if(closed)return;closed=true;await tail;cache=null;comparisonCache=null;sourceInspection=null;try{lease.exec('ROLLBACK');}finally{lease.close();}}
  };
}
