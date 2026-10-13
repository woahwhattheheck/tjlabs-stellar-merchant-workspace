// MIT. ROZO source editions, reviewed coding and closes in the original Accounting lease.
import { constants } from 'node:fs';
import { mkdir, lstat, open, link, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assert, fields, id, text, integer, sha, canonical, clone, jsonDigest, digest } from '../../sf30-seller-sdk/rozo-payments/model.mjs';
import { inspectRozoFinanceSource, ROZO_FINANCE_SOURCE_LIMIT } from '../../sf30-seller-sdk/rozo-payments/finance-source.mjs';
import { rozoFinanceMovements } from '../../sf30-seller-sdk/rozo-payments/finance-projection.mjs';
import { ROZO_ACCOUNTANT_SOURCE_SCHEMA, ROZO_PERIOD_CLOSE_SCHEMA, rozoMovementClassification,
  rozoAccountingTotals, inspectRozoAccountantSource } from '../accountant/rozo-source.mjs';
import { accountingWorkspaceBinding } from './binding.mjs';

export const ROZO_ACCOUNTING_SCHEMA='stellar-forge.rozo-accounting.v1';
const REQUEST='stellar-forge.rozo-accounting-request.v1', INTENT='stellar-forge.rozo-accounting-intent.v1';
const LIMIT=192*1024*1024, MAX_RECORDS=10000;
const need=(ok,code,message,status=409)=>assert(ok,code,message,status);
const bytes=value=>Buffer.from(canonical(value)+'\n');
const optional=(value,name,max)=>value===''?'':text(value,name,max);
const day=value=>{
  need(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),'ROZO_DATE','Choose an exact YYYY-MM-DD recognition date.');
  const time=Date.parse(value+'T00:00:00.000Z');
  need(Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value,'ROZO_DATE','Choose a real recognition date.');
  return value;
};
const units=value=>{
  need(typeof value==='string'&&/^(0|[1-9][0-9]{0,99})$/.test(value),'ROZO_UNITS','Use exact nonnegative native units.');
  return BigInt(value);
};
const initial=()=>({schema:ROZO_ACCOUNTING_SCHEMA,sources:[],captures:[],codings:[],dispositions:[],reviews:[],closes:[],requests:[]});
const listLimit=value=>need(value.length<MAX_RECORDS,'ROZO_HISTORY_LIMIT','Retain the completed original accounting project before adding more history.');
async function privateDirectory(path){
  await mkdir(path,{recursive:true,mode:0o700});
  const st=await lstat(path);
  need(st.isDirectory()&&!st.isSymbolicLink()&&!(st.mode&0o077),'ROZO_PRIVATE_PATH','Retain a private ordinary ROZO directory.');
}
async function original(path,limit=LIMIT){
  let handle;
  try{handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
  try{
    const first=await handle.stat();
    need(first.isFile()&&first.nlink===1&&!(first.mode&0o077)&&first.size>0&&first.size<=limit,
      'ROZO_ORIGINAL_FILE','The retained original file is not an ordinary private file within its limit.');
    const value=await handle.readFile(),last=await handle.stat();
    need(first.size===last.size&&first.mtimeMs===last.mtimeMs&&first.ctimeMs===last.ctimeMs&&value.length===first.size,
      'ROZO_ORIGINAL_CHANGED','The original file changed while reading.');
    return value;
  }finally{await handle.close();}
}
async function put(path,value){
  const raw=Buffer.isBuffer(value)?value:bytes(value);
  need(raw.length>0&&raw.length<=LIMIT,'ROZO_FILE_LIMIT','Preserve the complete original file within the delivery limit.');
  await privateDirectory(dirname(path));
  const prior=await original(path);
  if(prior){need(prior.equals(raw),'ROZO_FILE_CONFLICT','An original retained file already has different bytes.');return;}
  const staging=path+'.pending-'+randomUUID();
  const handle=await open(staging,'wx',0o600);
  try{
    try{await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
    try{await link(staging,path);}catch(error){
      if(error.code!=='EEXIST')throw error;
      const accepted=await original(path);
      need(accepted?.equals(raw),'ROZO_FILE_CONFLICT','A concurrent retained original has different bytes.');
    }
  }finally{await unlink(staging);}
  const parent=await open(dirname(path),constants.O_RDONLY);
  try{await parent.sync();}finally{await parent.close();}
}
const parse=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
function sourceInput(payload){
  fields(payload,['name','provenance','dataContext','contentBase64','sha256','previewSha256'],'ROZO source intake');
  text(payload.name,'source name',300);text(payload.provenance,'source provenance',6000);
  need(['development','operational'].includes(payload.dataContext),'ROZO_DATA_CONTEXT','Select the source data context explicitly.');
  sha(payload.sha256,'original source SHA-256');
  need(typeof payload.contentBase64==='string'&&payload.contentBase64.length<=Math.ceil(ROZO_FINANCE_SOURCE_LIMIT/3)*4,
    'ROZO_SOURCE_LIMIT','Retain the complete original report source.');
  const raw=Buffer.from(payload.contentBase64,'base64');
  need(raw.length>0&&raw.length<=ROZO_FINANCE_SOURCE_LIMIT&&raw.toString('base64')===payload.contentBase64&&digest(raw)===payload.sha256,
    'ROZO_SOURCE_BYTES','The complete original source differs from its selected bytes.');
  const inspected=inspectRozoFinanceSource(raw),facts=rozoFinanceMovements(inspected.source);
  return {raw,inspected,facts};
}
function originalRequest(value){
  fields(value,['schema','requestId','expectedRevision','actor','command','payload'],'ROZO accounting request');
  need(value.schema===REQUEST,'ROZO_REQUEST','Retain the original accounting request schema.');
  id(value.requestId,'request ID');integer(value.expectedRevision,'expected accounting revision');text(value.actor,'operator',1000);
  text(value.command,'accounting command',100);need(value.payload&&typeof value.payload==='object'&&!Array.isArray(value.payload),'ROZO_REQUEST','Retain the full original command payload.');
  need(bytes(value).length<=LIMIT,'ROZO_REQUEST_LIMIT','The complete request exceeds its original limit.');
  return clone(value);
}
function selectedPeriod(workspace,value){
  fields(value,['id','version'],'period selection');
  return clone(workspace.periods.selection(value));
}
function codingId(movementId){return 'rozo-coding-'+jsonDigest({movementId});}
function selectedSources(state,sourceIds){
  need(Array.isArray(sourceIds)&&sourceIds.length>0&&sourceIds.length<=1000&&new Set(sourceIds).size===sourceIds.length,
    'ROZO_PERIOD_SOURCES','Select the original sources for this period.');
  for(const key of sourceIds){id(key,'source');need(state.sources.some(row=>row.id===key),'ROZO_SOURCE_NOT_FOUND','Choose a retained ROZO source.',404);}
  return [...sourceIds].sort();
}
export class RozoAccountingWorkspace{
  constructor(workspace){
    need(workspace?.periods&&typeof workspace.serial==='function'&&typeof workspace.commit==='function',
      'ROZO_ACCOUNTING_OWNER','Borrow the existing opened Accounting workspace and its native lease.');
    this.workspace=workspace;this.root=join(workspace.directory,'rozo-finance');
  }
  binding(){return accountingWorkspaceBinding(this.workspace.directory,this.workspace.state);}
  state(){return this.workspace.state.rozoFinance??initial();}
  path(kind,key){return join(this.root,kind,jsonDigest({key})+'.json');}
  async intent(requestId){
    id(requestId,'request ID');
    const raw=await original(this.path('requests',requestId));
    if(!raw)return null;
    const intent=parse(raw),request=originalRequest(intent.request);
    need(intent.schema===INTENT&&request.requestId===requestId&&intent.workspaceId===this.binding().workspaceId&&
      intent.fingerprint===jsonDigest(request)&&intent.beforeFinanceSha256&&intent.afterFinanceState?.schema===ROZO_ACCOUNTING_SCHEMA,
      'ROZO_INTENT_CHANGED','The retained request belongs to another original workspace or body.');
    const {sha256,...body}=intent;need(jsonDigest(body)===sha256,'ROZO_INTENT_CHANGED','The complete prepared original request changed.');
    return intent;
  }
  async pointer(){const raw=await original(join(this.root,'pending.json'),16000);return raw?parse(raw):null;}
  async clearAcceptedPointer(){
    const pointer=await this.pointer();if(!pointer)return;
    const receipt=this.state().requests.find(row=>row.id===pointer.requestId);
    if(!receipt)return;
    need(receipt.fingerprint===pointer.fingerprint,'ROZO_PENDING_CONFLICT','The pending request and accepted receipt differ.');
    await unlink(join(this.root,'pending.json'));
    const parent=await open(this.root,constants.O_RDONLY);try{await parent.sync();}finally{await parent.close();}
  }
  async status(requestId){
    const intent=await this.intent(requestId),receipt=this.state().requests.find(row=>row.id===requestId);
    if(receipt){
      need(intent&&receipt.fingerprint===intent.fingerprint,'ROZO_RECEIPT_CHANGED','Retain the exact original request behind this accepted receipt.');
      return {state:'accepted',requestId,fingerprint:receipt.fingerprint,request:{command:intent.request.command,
        actor:intent.request.actor,expectedRevision:intent.request.expectedRevision},result:clone(receipt.result),
        acceptedRevision:receipt.revision,workspaceId:this.binding().workspaceId,revision:this.workspace.state.revision};
    }
    if(intent)return {state:'pending',requestId,fingerprint:intent.fingerprint,request:{command:intent.request.command,
      actor:intent.request.actor,expectedRevision:intent.request.expectedRevision},workspaceId:intent.workspaceId,
      revision:this.workspace.state.revision,resumable:intent.request.expectedRevision===this.workspace.state.revision&&
        intent.beforeFinanceSha256===jsonDigest(this.state())};
    return {state:'not_found',requestId,workspaceId:this.binding().workspaceId,revision:this.workspace.state.revision};
  }
  async resume(requestId){
    const intent=await this.intent(requestId);need(intent,'ROZO_REQUEST_NOT_FOUND','Choose an existing original prepared operation.',404);
    return this.mutate(intent.request);
  }
  async mutate(value){
    const request=originalRequest(value),fingerprint=jsonDigest(request),workspace=this.workspace;
    return workspace.serial(async()=>{
      const previous=this.state().requests.find(row=>row.id===request.requestId);
      if(previous){need(previous.fingerprint===fingerprint,'ROZO_REQUEST_CONFLICT','This original request ID names another body.');await this.clearAcceptedPointer();return {...clone(previous.result),requestId:request.requestId,fingerprint,reused:true,revision:previous.revision};}
      await this.clearAcceptedPointer();
      const pending=await this.pointer();
      need(!pending||pending.requestId===request.requestId&&pending.fingerprint===fingerprint,
        'ROZO_REQUEST_PENDING','Finish the existing original prepared accounting operation first.');
      workspace.expected(request.expectedRevision);
      let intent=await this.intent(request.requestId);
      if(intent){
        need(intent.fingerprint===fingerprint&&intent.beforeFinanceSha256===jsonDigest(this.state()),
          'ROZO_REQUEST_CONFLICT','The retained original request cannot be rebased onto changed accounting state.');
      }else{
        const state=clone(this.state()),at=new Date().toISOString();
        const result=await this.reduce(state,request,at);
        intent={schema:INTENT,workspaceId:this.binding().workspaceId,request,fingerprint,
          beforeFinanceSha256:jsonDigest(this.state()),afterFinanceState:state,result,preparedAt:at};
        intent.sha256=jsonDigest(intent);
        await put(this.path('requests',request.requestId),intent);
      }
      await put(join(this.root,'pending.json'),{schema:'stellar-forge.rozo-accounting-pending.v1',
        requestId:request.requestId,fingerprint,intentSha256:intent.sha256,workspaceId:intent.workspaceId});
      const next=clone(intent.afterFinanceState);listLimit(next.requests);
      next.requests.push({id:request.requestId,fingerprint,command:request.command,actor:request.actor,
        at:intent.preparedAt,revision:workspace.state.revision+1,result:clone(intent.result)});
      workspace.state.rozoFinance=next;
      await workspace.commit('rozo_'+request.command,request.actor,{requestId:request.requestId,fingerprint});
      let cleanupPending=false;
      try{await this.clearAcceptedPointer();}catch{cleanupPending=true;}
      return {...clone(intent.result),requestId:request.requestId,fingerprint,reused:false,
        revision:workspace.state.revision,cleanupPending};
    });
  }
  async file(captureId){
    const capture=this.state().captures.find(row=>row.id===captureId);
    need(capture,'ROZO_CAPTURE_NOT_FOUND','Choose an original captured source.',404);
    const raw=await original(this.path('sources',capture.fileSha256),ROZO_FINANCE_SOURCE_LIMIT);
    need(raw&&raw.length===capture.fileBytes&&digest(raw)===capture.fileSha256,
      'ROZO_CAPTURE_CHANGED','The original captured source file changed.');
    return {capture:clone(capture),bytes:raw,name:capture.name};
  }
  async captured(capture,state=this.state()){
    const row=state.captures.find(value=>value.id===capture);
    need(row,'ROZO_CAPTURE_NOT_FOUND','Choose a retained original source capture.',404);
    const raw=await original(this.path('sources',row.fileSha256),ROZO_FINANCE_SOURCE_LIMIT);
    need(raw&&raw.length===row.fileBytes&&digest(raw)===row.fileSha256,'ROZO_CAPTURE_CHANGED','The retained original source bytes changed.');
    const checked=inspectRozoFinanceSource(raw);
    need(checked.sha256===row.sourceSha256&&checked.sourceId===row.sourceId,'ROZO_CAPTURE_CHANGED','The retained source identity changed.');
    return {row,raw,checked,facts:rozoFinanceMovements(checked.source)};
  }
  async previewSource(payload){
    const {raw,inspected,facts}=sourceInput(payload),state=this.state();
    const current=state.sources.find(row=>row.id===inspected.sourceId),parentId=current?.acceptedCaptureId??null;
    const selection={workspaceId:this.binding().workspaceId,revision:this.workspace.state.revision,
      sourceId:inspected.sourceId,parentId,fileSha256:digest(raw),fileBytes:raw.length,sourceSha256:inspected.sha256,
      name:payload.name,provenance:payload.provenance,dataContext:payload.dataContext};
    return {...selection,previewSha256:jsonDigest(selection),reportId:inspected.reportId,
      reportSha256:inspected.reportSha256,profileId:inspected.profileId,movements:facts.movements,
      pending:state.captures.filter(row=>row.sourceId===inspected.sourceId&&row.status==='PENDING').map(clone)};
  }
  async rows({sourceIds=null,state=this.state()}={}){
    const rows=[];
    const selected=sourceIds?selectedSources(state,sourceIds):state.sources.map(row=>row.id);
    for(const sourceId of selected){
      const source=state.sources.find(row=>row.id===sourceId);
      if(!source.acceptedCaptureId)continue;
      const captures=state.captures.filter(row=>row.sourceId===sourceId&&row.status==='ACCEPTED');
      const history=new Map();
      for(const capture of captures){
        const value=await this.captured(capture.id,state);
        for(const movement of value.facts.movements)history.set(movement.id,{capture,movement});
      }
      const current=await this.captured(source.acceptedCaptureId,state),present=new Map(current.facts.movements.map(row=>[row.id,row]));
      for(const [movementId,old]of history){
        const movement=present.get(movementId)??old.movement,capture=present.has(movementId)?current.row:old.capture;
        const coding=state.codings.filter(row=>row.movementId===movementId).at(-1)??null;
        const closed=state.closes.filter(row=>row.status==='CLOSED'&&row.movementIds.includes(movementId));
        rows.push({sourceId,captureId:capture.id,sourceSha256:capture.sourceSha256,
          sourceReportId:capture.reportId,sourceReportSha256:capture.reportSha256,dataContext:capture.dataContext,
          missing:!present.has(movementId),movement:clone(movement),coding:clone(coding),
          codingCurrent:Boolean(coding&&coding.basisSha256===movement.basisSha256&&!(!present.has(movementId))),
          closedPeriods:closed.map(row=>({id:row.id,period:clone(row.period),contextSha256:row.contextSha256,
            movementBasisSha256:row.movementBases[movementId]}))});
      }
    }
    return rows.sort((a,b)=>a.movement.id.localeCompare(b.movement.id));
  }
  async view(){
    this.workspace.lease.assertHeld();
    const state=this.state(),pending=await this.pointer();
    return {schema:ROZO_ACCOUNTING_SCHEMA,binding:this.binding(),revision:this.workspace.state.revision,
      reopenRequired:Boolean(this.workspace.commitUncertainty),sources:clone(state.sources),captures:clone(state.captures),
      periods:clone(this.workspace.periods.view()),closes:clone(state.closes),reviews:clone(state.reviews),
      pending:pending&&!state.requests.some(row=>row.id===pending.requestId)?pending:null,
      rows:await this.rows(),requests:state.requests.map(({result,...row})=>clone(row))};
  }
  async periodPreview(payload,state=this.state()){
    fields(payload,['period','sourceIds','dataContext'],'ROZO period review');
    const period=selectedPeriod(this.workspace,payload.period),sourceIds=selectedSources(state,payload.sourceIds);
    need(['development','operational'].includes(payload.dataContext),'ROZO_DATA_CONTEXT','Choose the exact period data context.');
    const rows=await this.rows({sourceIds,state}),issues=[],lines=[],excluded=[],outside=[],sourceCaptures=new Map();
    const problem=(code,row,message)=>issues.push({code,movementId:row?.movement.id??null,sourceId:row?.sourceId??null,message});
    for(const sourceId of sourceIds){
      const source=state.sources.find(row=>row.id===sourceId);
      if(!source.acceptedCaptureId)issues.push({code:'SOURCE_NOT_ACCEPTED',sourceId,movementId:null,message:'Review the original source before closing.'});
      for(const capture of state.captures.filter(row=>row.sourceId===sourceId&&row.status==='PENDING'))
        issues.push({code:'SOURCE_REVIEW_PENDING',sourceId,captureId:capture.id,movementId:null,message:'Resolve the pending source edition.'});
      if(source.acceptedCaptureId){
        const capture=state.captures.find(row=>row.id===source.acceptedCaptureId);
        if(capture.dataContext!==payload.dataContext)issues.push({code:'DATA_CONTEXT_MISMATCH',sourceId,movementId:null,message:'Select sources with the same explicit data context.'});
      }
    }
    for(const row of rows){
      const m=row.movement,coding=row.codingCurrent?row.coding:null;
      const recognised=coding?.recognitionDate??m.sourceDay;
      if(recognised){
        const t=Date.parse(recognised+'T00:00:00.000Z');
        if(t<Date.parse(period.from)||t>=Date.parse(period.until)){outside.push({movementId:m.id,date:recognised,basis:coding?'reviewed_recognition_date':'provider_creation_date'});continue;}
      }
      if(row.closedPeriods.length){
        if(row.closedPeriods.some(close=>close.movementBasisSha256!==m.basisSha256)||row.missing)
          problem('CLOSED_SOURCE_CHANGED',row,'The original movement changed after an issued close. Reopen that original period and review its correction.');
        else excluded.push({movementId:m.id,kind:'already_closed',closes:row.closedPeriods});
        continue;
      }
      const disposition=state.dispositions.filter(value=>value.movementId===m.id&&value.periodId===period.periodId&&value.periodVersion===period.version).at(-1);
      if(disposition&&disposition.basisSha256===m.basisSha256&&disposition.missing===row.missing){
        excluded.push(clone(disposition));continue;
      }
      if(row.missing){problem('MOVEMENT_REMOVED',row,'This original movement is absent from the accepted successor. Record an explicit period disposition.');continue;}
      if(!m.providerConfirmed||!m.amountObserved){problem('PROVIDER_UNRESOLVED',row,'Retain the provider exception or explicitly carry/exclude it for this period.');continue;}
      if(!coding){problem(row.coding?'CODING_STALE':'CODING_REQUIRED',row,'Review the current exact movement and save its recognition date and coding.');continue;}
      if(row.dataContext!==payload.dataContext){problem('DATA_CONTEXT_MISMATCH',row,'Retain the selected source data context.');continue;}
      for(const allocation of coding.allocations)lines.push({
        sourceId:row.sourceId,captureId:row.captureId,sourceSha256:row.sourceSha256,
        sourceReportId:row.sourceReportId,sourceReportSha256:row.sourceReportSha256,
        movementId:m.id,movementBasisSha256:m.basisSha256,paymentId:m.paymentId,movementKind:m.kind,
        classification:rozoMovementClassification(m.kind),recognitionDate:coding.recognitionDate,...clone(m.amount.asset),
        amount:allocation.amount,originalMovementAmount:m.amount.units,providerStatus:m.providerStatus,
        evidenceClass:m.evidenceClass,independentChainProof:false,receiptReference:m.receiptReference??'',
        providerCreatedAt:m.providerCreatedAt,providerUpdatedAt:m.providerUpdatedAt,
        accountCode:allocation.accountCode,costCenter:allocation.costCenter,project:allocation.project,memo:allocation.memo,
        codingId:coding.id,codingVersion:coding.version,line:allocation.line,reviewedBy:coding.actor,reviewReason:coding.reason
      });
      sourceCaptures.set(row.captureId,state.captures.find(value=>value.id===row.captureId));
    }
    // Freeze every selected accepted source, including reference-only and excluded rows.
    for(const sourceId of sourceIds){const source=state.sources.find(row=>row.id===sourceId);if(source.acceptedCaptureId){const capture=state.captures.find(row=>row.id===source.acceptedCaptureId);sourceCaptures.set(capture.id,capture);}}
    const captures=[...sourceCaptures.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(row=>({
      captureId:row.id,sourceId:row.sourceId,sourceSha256:row.sourceSha256,fileSha256:row.fileSha256,fileBytes:row.fileBytes,
      reportId:row.reportId,reportSha256:row.reportSha256,dataContext:row.dataContext
    }));
    lines.sort((a,b)=>a.movementId.localeCompare(b.movementId)||a.line-b.line);
    const basis={period,sourceIds,dataContext:payload.dataContext,sourceCaptures:captures,lines,excluded,outside,issues};
    return {...basis,contextSha256:jsonDigest(basis),ready:issues.length===0,unresolved:issues.length,totals:rozoAccountingTotals(lines)};
  }
  async closeFile(closeId){
    const row=this.state().closes.find(value=>value.id===closeId);
    need(row,'ROZO_CLOSE_NOT_FOUND','Select an issued original ROZO period.',404);
    const raw=await original(this.path('closes',closeId),64*1024*1024);
    need(raw&&raw.length===row.bytes&&digest(raw)===row.sha256,'ROZO_CLOSE_CHANGED','The issued original period source changed.');
    inspectRozoAccountantSource(raw);return {row:clone(row),bytes:raw,name:'rozo-accountant-source-'+closeId+'.json'};
  }
  async reduce(state,request,at){
    const p=request.payload,actor=request.actor,deterministic=prefix=>prefix+'-'+jsonDigest({workspaceId:this.binding().workspaceId,requestId:request.requestId});
    if(request.command==='source.capture'){
      const checked=sourceInput(p),preview=await this.previewSource(p);
      sha(p.previewSha256,'preview SHA-256');need(p.previewSha256===preview.previewSha256,'ROZO_PREVIEW_CHANGED','Review this exact source against the current original accounting state.');
      listLimit(state.captures);
      const sourceId=checked.inspected.sourceId;
      let source=state.sources.find(row=>row.id===sourceId);
      if(!source){source={id:sourceId,originId:checked.inspected.originId,profileId:checked.inspected.profileId,
        workspaceId:checked.inspected.workspaceId,acceptedCaptureId:null,createdAt:at};state.sources.push(source);}
      need(!state.captures.some(row=>row.sourceId===sourceId&&row.status==='PENDING'),'ROZO_SOURCE_PENDING','Review the existing pending source edition before capturing another.');
      const capture={id:deterministic('rozo-capture'),sourceId,parentId:source.acceptedCaptureId,
        name:p.name,provenance:p.provenance,dataContext:p.dataContext,fileSha256:digest(checked.raw),fileBytes:checked.raw.length,
        sourceSha256:checked.inspected.sha256,reportId:checked.inspected.reportId,reportSha256:checked.inspected.reportSha256,
        reportVersion:checked.inspected.reportVersion,reportWorkspaceRevision:checked.inspected.reportWorkspaceRevision,
        status:'PENDING',actor,at,reviews:[]};
      await put(this.path('sources',capture.fileSha256),checked.raw);state.captures.push(capture);
      return {capture:clone(capture)};
    }
    if(request.command==='source.review'){
      fields(p,['captureId','decision','reason'],'source review');id(p.captureId,'capture');text(p.reason,'review reason',6000);
      need(['accept','reject'].includes(p.decision),'ROZO_SOURCE_DECISION','Accept or reject this original source edition.');
      const capture=state.captures.find(row=>row.id===p.captureId);need(capture&&capture.status==='PENDING','ROZO_SOURCE_REVIEW','Choose a pending original source.');
      const source=state.sources.find(row=>row.id===capture.sourceId);
      need(source.acceptedCaptureId===capture.parentId,'ROZO_SOURCE_PARENT','The original source head changed. Review the correct successor.');
      if(p.decision==='accept'){await this.captured(capture.id,state);source.acceptedCaptureId=capture.id;}
      capture.status=p.decision==='accept'?'ACCEPTED':'REJECTED';capture.reviews.push({decision:p.decision,reason:p.reason,actor,at,requestId:request.requestId});
      return {capture:clone(capture),source:clone(source)};
    }
    if(request.command==='coding.save'){
      fields(p,['movementId','basisSha256','expectedVersion','recognitionDate','reason','providerEvidenceAcknowledged','allocations'],'movement coding');
      id(p.movementId,'movement');sha(p.basisSha256,'reviewed movement basis');integer(p.expectedVersion,'coding version');
      day(p.recognitionDate);text(p.reason,'coding reason',6000);
      need(p.providerEvidenceAcknowledged===true,'ROZO_EVIDENCE_REVIEW','Acknowledge that this is original provider evidence, with any selected contract evidence retained separately.');
      const row=(await this.rows({state})).find(row=>row.movement.id===p.movementId),m=row?.movement;
      need(row&&!row.missing&&m.basisSha256===p.basisSha256,'ROZO_CODING_SOURCE','Review the current original movement before coding.');
      need(m.providerConfirmed&&m.amountObserved,'ROZO_CODING_UNRESOLVED','Unresolved provider movements require a period disposition.');
      need(row.closedPeriods.length===0,'ROZO_CODING_CLOSED','Reopen the original issued period before changing its coding.');
      need((row.coding?.version??0)===p.expectedVersion,'ROZO_CODING_VERSION','The original coding edition changed.');
      need(Array.isArray(p.allocations)&&p.allocations.length>0&&p.allocations.length<=200,'ROZO_ALLOCATIONS','Retain one to 200 exact allocation lines.');
      const allocations=p.allocations.map((value,index)=>{
        fields(value,['amount','accountCode','costCenter','project','memo'],'allocation');
        units(value.amount);text(value.accountCode,'account code',160);
        return {line:index+1,amount:value.amount,accountCode:value.accountCode,costCenter:optional(value.costCenter??'','cost center',160),
          project:optional(value.project??'','project',300),memo:optional(value.memo??'','memo',4000)};
      });
      need(allocations.reduce((sum,row)=>sum+units(row.amount),0n)===units(m.amount.units),'ROZO_ALLOCATION_TOTAL','Allocate the exact original movement once in its native units.');
      listLimit(state.codings);
      const coding={id:codingId(m.id),version:p.expectedVersion+1,movementId:m.id,basisSha256:m.basisSha256,
        captureId:row.captureId,recognitionDate:p.recognitionDate,classification:rozoMovementClassification(m.kind),
        allocations,reason:p.reason,providerEvidenceAcknowledged:true,actor,at,requestId:request.requestId};
      state.codings.push(coding);return {coding:clone(coding)};
    }
    if(request.command==='disposition.save'){
      fields(p,['period','movementId','basisSha256','missing','kind','reason'],'period disposition');
      const period=selectedPeriod(this.workspace,p.period);id(p.movementId,'movement');sha(p.basisSha256,'movement basis');
      text(p.reason,'disposition reason',6000);need(['carry_forward','exclude_from_period'].includes(p.kind),'ROZO_DISPOSITION','Carry the exception forward or exclude it from this period.');
      const row=(await this.rows({state})).find(row=>row.movement.id===p.movementId);
      need(row&&row.movement.basisSha256===p.basisSha256&&row.missing===p.missing,'ROZO_DISPOSITION_SOURCE','Review this current source movement and missing status.');
      need(row.closedPeriods.length===0,'ROZO_DISPOSITION_CLOSED','Preserve the original issued movement; reopen its period before correction.');
      listLimit(state.dispositions);
      const disposition={id:deterministic('rozo-disposition'),periodId:period.periodId,periodVersion:period.version,movementId:p.movementId,
        basisSha256:p.basisSha256,missing:p.missing,kind:p.kind,reason:p.reason,actor,at,requestId:request.requestId};
      state.dispositions.push(disposition);return {disposition:clone(disposition)};
    }
    if(request.command==='period.review'){
      fields(p,['period','sourceIds','dataContext','contextSha256','note'],'period review');
      text(p.note,'period review note',6000);sha(p.contextSha256,'review context');
      const selected={period:p.period,sourceIds:p.sourceIds,dataContext:p.dataContext},preview=await this.periodPreview(selected,state);
      need(preview.contextSha256===p.contextSha256,'ROZO_PERIOD_CHANGED','The original source/coding/disposition basis changed after preview.');
      listLimit(state.reviews);
      const review={id:deterministic('rozo-review'),state:preview.ready?'READY':'EXCEPTIONS',selection:selected,
        contextSha256:preview.contextSha256,unresolved:preview.unresolved,actor,at,note:p.note,requestId:request.requestId};
      state.reviews.push(review);return {review:clone(review),preview};
    }
    if(request.command==='period.close'){
      fields(p,['reviewId','contextSha256','note'],'period close');id(p.reviewId,'review');sha(p.contextSha256,'review context');text(p.note,'close note',6000);
      const review=state.reviews.find(row=>row.id===p.reviewId);
      need(review?.state==='READY'&&review.contextSha256===p.contextSha256,'ROZO_CLOSE_REVIEW','Choose a completed review of this exact original period.');
      const preview=await this.periodPreview(review.selection,state);
      need(preview.ready&&preview.contextSha256===p.contextSha256,'ROZO_CLOSE_CHANGED','The reviewed period changed or has unresolved exceptions.');
      need(!state.closes.some(row=>row.period.periodId===preview.period.periodId&&row.status==='CLOSED'),'ROZO_PERIOD_CLOSED','Reopen the original period before issuing a correction.');
      listLimit(state.closes);
      const previous=state.closes.filter(row=>row.period.periodId===preview.period.periodId).at(-1);
      const close={schema:ROZO_PERIOD_CLOSE_SCHEMA,id:deterministic('rozo-close'),status:'CLOSED',ready:true,unresolved:0,
        workspaceId:this.binding().workspaceId,sequence:(previous?.sequence??0)+1,previousCloseId:previous?.id??null,
        createdAt:at,actor,note:p.note,period:preview.period,review:clone(review),contextSha256:preview.contextSha256,
        dataContext:preview.dataContext,lines:preview.lines,sourceCaptures:preview.sourceCaptures,
        excluded:preview.excluded,outside:preview.outside,totals:preview.totals};
      close.sha256=jsonDigest(close);
      const sources=[];
      for(const selected of close.sourceCaptures){const value=await this.captured(selected.captureId,state);sources.push({captureId:selected.captureId,bytes:value.raw.length,sha256:digest(value.raw),base64:value.raw.toString('base64')});}
      const document={schema:ROZO_ACCOUNTANT_SOURCE_SCHEMA,workspaceId:close.workspaceId,sourceRevision:request.expectedRevision+1,close,sources};
      const raw=bytes(document);inspectRozoAccountantSource(raw);await put(this.path('closes',close.id),raw);
      const result={id:close.id,sequence:close.sequence,previousCloseId:close.previousCloseId,status:'CLOSED',period:close.period,
        dataContext:close.dataContext,contextSha256:close.contextSha256,closeSha256:close.sha256,sha256:digest(raw),bytes:raw.length,
        reviewId:review.id,movementIds:[...new Set(close.lines.map(row=>row.movementId))],
        movementBases:Object.fromEntries(close.lines.map(row=>[row.movementId,row.movementBasisSha256])),
        totals:close.totals,actor,at,requestId:request.requestId,reopens:[]};
      state.closes.push(result);return {close:clone(result)};
    }
    if(request.command==='period.reopen'){
      fields(p,['closeId','reason'],'period reopening');id(p.closeId,'close');text(p.reason,'reopening reason',6000);
      const close=state.closes.find(row=>row.id===p.closeId);need(close?.status==='CLOSED','ROZO_REOPEN','Choose the current issued period.');
      close.status='REOPENED';close.reopens.push({actor,at,reason:p.reason,requestId:request.requestId});
      return {close:clone(close)};
    }
    need(false,'ROZO_COMMAND','Choose an original supported ROZO accounting operation.',404);
  }
  savePeriod(value){return this.workspace.periods.save(value,{beforeWrite:async()=>{
    await this.clearAcceptedPointer();need(!await this.pointer(),'ROZO_REQUEST_PENDING','Finish the original prepared accounting operation before changing its native period.',409);
  }});}
}
export async function handleRozoAccountingRequest(workspace,{method,path,query={},value}){
  const parts=path.split('/').filter(Boolean);
  if(parts[0]!=='api'||parts[1]!=='rozo-finance')return null;
  const rozo=workspace.rozoFinance??new RozoAccountingWorkspace(workspace);
  if(method==='GET'&&parts.length===2)return {value:await rozo.view()};
  if(method==='POST'&&parts.length===3&&parts[2]==='source-preview')return {value:await rozo.previewSource(value)};
  if(method==='POST'&&parts.length===3&&parts[2]==='period-preview')return {value:await rozo.periodPreview(value)};
  if(method==='POST'&&parts.length===3&&parts[2]==='mutate')return {value:await rozo.mutate(value)};
  if(parts[2]==='requests'&&parts[3]){
    if(method==='GET'&&parts.length===4)return {value:await rozo.status(parts[3])};
    if(method==='POST'&&parts.length===5&&parts[4]==='resume'){fields(value,[],'resume');return {value:await rozo.resume(parts[3])};}
  }
  if(method==='GET'&&parts.length===4&&parts[2]==='captures')return {file:await rozo.file(parts[3]),type:'application/json'};
  if(method==='GET'&&parts.length===4&&parts[2]==='closes')return {file:await rozo.closeFile(parts[3]),type:'application/json'};
  need(false,'ROZO_ROUTE','Choose a supported original ROZO accounting route.',404);
}
