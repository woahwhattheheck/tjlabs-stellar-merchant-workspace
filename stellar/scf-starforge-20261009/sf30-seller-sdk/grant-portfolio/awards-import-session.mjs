// MIT. Reviewed application CSV sessions over the original retained portfolio actions.
import {createHash} from 'node:crypto';
import {prepareAwardCsvImport,parseAwardCsvText} from './awards-exchange.mjs';
import {originalAwardCsvBytes} from './awards-exchange-core.mjs';

export const AWARD_IMPORT_SESSION_SCHEMA='stellar-forge.awards-csv-import-session.v1';
export const AWARD_IMPORT_BATCH_SCHEMA='stellar-forge.awards-csv-session-batch.v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATION=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const HASH=/^[0-9a-f]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'GRANT_AWARDS_IMPORT_SESSION'});};
const exact=(value,keys,required=keys)=>need(plain(value)&&Object.keys(value).every(k=>keys.includes(k))&&
  required.every(k=>Object.hasOwn(value,k)),'Use the complete declared import-session fields.');
const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const encode=value=>Buffer.from(JSON.stringify(canonical(value)),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const same=(a,b)=>encode(a).equals(encode(b));
const digest=value=>hash(encode(value));
const selectedPortfolio=value=>({id:value.id,revision:value.revision,snapshot:value.snapshot});
function seal(value){return {...value,sha256:digest(value)};}
function originalCsv(csv,descriptor){
  const bytes=originalAwardCsvBytes(csv);
  if(descriptor)need(bytes.length===descriptor.bytes&&hash(bytes)===descriptor.sha256,
    'Select the same complete original CSV, including rows outside this batch.');
  return bytes;
}
function batchInput(session,csv,index){
  const batch=session.batches[index];
  need(batch,'Select one original session batch index.');
  return {...canonical(session.input),csv,operationId:batch.operationId,documentId:batch.documentId,rowIndexes:batch.rowIndexes};
}
function checkRound(portfolio,session){
  const actual=portfolio.definition.awards?.records.rounds.find(row=>row.id===session.round.id);
  need(actual&&!actual.archived&&actual.revision===session.round.revision&&actual.sha256===session.round.sha256,
    'The selected published funding round changed. Keep the original session and explicitly review a successor.');
}
function record(records,id){return records.find(row=>row.id===id)??null;}
function guardSelectedRecords(basis,current,session,index,csv){
  checkRound(current,session);
  const parsed=parseAwardCsvText(new TextDecoder('utf-8',{fatal:true}).decode(csv));
  const {mapping,identities}=session.input;
  const exactRecord=(collection,id)=>{
    const before=record(basis.definition.programme.records[collection],id);
    const after=record(current.definition.programme.records[collection],id);
    need(before&&after&&!after.archived&&before.revision===after.revision&&before.sha256===after.sha256,
      'A selected applicant organisation or project changed. Review a successor session explicitly.');
  };
  for(const indexOfRow of session.batches[index].rowIndexes){
    const row=parsed.rows[indexOfRow],applicationId=identities.applications[row[mapping.reference]];
    const before=record(basis.definition.awards.records.applications,applicationId);
    const after=record(current.definition.awards.records.applications,applicationId);
    need(before===null?after===null:after!==null&&before.revision===after.revision&&before.sha256===after.sha256,
      'An application selected by this undispatched batch changed. Preserve its original session.');
    exactRecord('partners',identities.partners[row[mapping.partnerKey]]);
    if(mapping.projectKey&&row[mapping.projectKey])exactRecord('nodes',identities.projects[row[mapping.projectKey]]);
  }
}
/**
 * Review a complete source and an explicit partition. This does not submit work.
 * Every batch has its own supplied operation/document IDs; all attach the same
 * original CSV object. Preview sizes are estimates on the selected initial basis,
 * not future actions that bypass intervening portfolio revisions.
 */
export function prepareAwardCsvImportSession(portfolio,input){
  exact(input,['sessionId','workspaceId','csv','filename','roundId','actor','mapping','identities','status','batches'],
    ['sessionId','workspaceId','csv','filename','roundId','actor','mapping','identities','batches']);
  need(UUID.test(input.sessionId??'')&&UUID.test(input.workspaceId??''),'Supply stable session and original workspace UUIDs.');
  need(Array.isArray(input.batches)&&input.batches.length>=1&&input.batches.length<=128,
    'Review from one to 128 explicit batches for the complete source.');
  const csv=originalCsv(input.csv),parsed=parseAwardCsvText(new TextDecoder('utf-8',{fatal:true}).decode(csv));
  const indexes=new Set(),operations=new Set(),documents=new Set();
  const common={filename:input.filename,roundId:input.roundId,actor:input.actor,mapping:canonical(clone(input.mapping)),
    identities:canonical(clone(input.identities)),status:input.status??'draft'};
  const batches=[];
  for(const [index,batch]of input.batches.entries()){
    exact(batch,['operationId','documentId','rowIndexes']);
    need(OPERATION.test(batch.operationId??'')&&!operations.has(batch.operationId),
      'Every reviewed batch needs one distinct supplied operation ID.');
    need(UUID.test(batch.documentId??'')&&!documents.has(batch.documentId),
      'Every batch mapping needs a distinct supplied document UUID.');
    operations.add(batch.operationId);documents.add(batch.documentId);
    need(Array.isArray(batch.rowIndexes)&&batch.rowIndexes.length>0,'Select every batch row explicitly.');
    for(const rowIndex of batch.rowIndexes){
      need(Number.isSafeInteger(rowIndex)&&rowIndex>=0&&rowIndex<parsed.rows.length&&!indexes.has(rowIndex),
        'Each original CSV data row must belong to exactly one batch.');
      indexes.add(rowIndex);
    }
    const preview=prepareAwardCsvImport(portfolio,{...common,csv,...batch});
    need(Buffer.byteLength(JSON.stringify(preview.action),'utf8')<1024*1024,
      'Leave room for the original native canonical JSON newline within its 1 MiB action limit.');
    batches.push({index,operationId:batch.operationId,documentId:batch.documentId,rowIndexes:[...batch.rowIndexes],
      rows:preview.rows,previewActionBytes:Buffer.byteLength(JSON.stringify(preview.action),'utf8')});
  }
  need(indexes.size===parsed.rows.length,'The complete reviewed session must account for every original CSV row.');
  need(new Set(parsed.rows.map(row=>common.identities.applications[row[common.mapping.reference]])).size===parsed.rows.length,
    'Each original application reference must retain its own supplied record identity.');
  const first=prepareAwardCsvImport(portfolio,{...common,csv,...input.batches[0]});
  const session=seal({schema:AWARD_IMPORT_SESSION_SCHEMA,sessionId:input.sessionId,workspaceId:input.workspaceId,
    portfolio:selectedPortfolio(portfolio),source:first.source,round:first.round,input:common,
    sourceRows:parsed.rows.length,batches});
  need(encode(session).length<=32*1024*1024,'Keep the complete reviewed session within 32 MiB.');
  return session;
}
function verifySession(basis,session,csv){
  need(session?.schema===AWARD_IMPORT_SESSION_SCHEMA&&HASH.test(session.sha256??''),
    'Open the complete original reviewed import session.');
  const expected=prepareAwardCsvImportSession(basis,{...session.input,sessionId:session.sessionId,
    workspaceId:session.workspaceId,csv,batches:session.batches.map(({operationId,documentId,rowIndexes})=>
      ({operationId,documentId,rowIndexes}))});
  need(same(expected,session),'The saved import session differs from its complete historical source and selection.');
  return expected;
}
async function absentOrRequest(client,id,options){
  try{return await client.request(id,options);}
  catch(error){if(error.status===404&&(error.nativeCode==='NOT_FOUND'||error.details?.error?.code==='NOT_FOUND'))return null;throw error;}
}
async function context(client,session,csv,options){
  const bytes=originalCsv(csv,session.source),state=await client.state(options);
  need(state.workspaceId===session.workspaceId,'Open the original workspace selected by this session.');
  const basis=await client.portfolio(session.portfolio.id,{...options,revision:session.portfolio.revision});
  need(basis.snapshot===session.portfolio.snapshot,'The original session selected another historical portfolio snapshot.');
  verifySession(basis,session,bytes);
  return {basis,bytes};
}
function batchPlan(session,index,plan,prior){
  need(Buffer.byteLength(JSON.stringify(plan.action),'utf8')<1024*1024,
    'The complete batch including the native canonical newline must fit the original 1 MiB limit.');
  return seal({schema:AWARD_IMPORT_BATCH_SCHEMA,sessionId:session.sessionId,sessionSha256:session.sha256,
    workspaceId:session.workspaceId,index,prior,plan});
}
async function verifiedRequest(client,session,index,request,basis,csv,options){
  const selection=session.batches[index];
  need(request?.id===selection.operationId&&request.input?.operationId===selection.operationId&&
    request.input?.action==='portfolio.save'&&request.input.payload?.id===session.portfolio.id,
    'An existing request has a different session, portfolio or operation identity.');
  const revision=request.input.payload.expectedPortfolioRevision;
  need(Number.isSafeInteger(revision)&&revision>=basis.revision,'Keep the original batch portfolio revision.');
  const historical=await client.portfolio(session.portfolio.id,{...options,revision});
  guardSelectedRecords(basis,historical,session,index,csv);
  const plan=prepareAwardCsvImport(historical,batchInput(session,csv,index));
  need(same(request.input,plan.action),'The retained original request differs from this exact reviewed batch.');
  return plan;
}
async function previousReturns(client,session,index,basis,csv,options){
  const prior=[];
  for(let before=0;before<index;before++){
    const request=await absentOrRequest(client,session.batches[before].operationId,options);
    need(request?.state==='COMPLETED','Finish or reconcile each original earlier batch before reviewing its successor.');
    await verifiedRequest(client,session,before,request,basis,csv,options);
    prior.push({index:before,operationId:request.id,requestSha256:digest(request)});
  }
  return prior;
}
/**
 * Read the historical session, all earlier actual returns and the current basis.
 * A previously admitted batch is recovered from its original input; it is never
 * silently rebased. A fresh plan must be retained and reviewed before dispatch.
 */
export async function reviewAwardCsvSessionBatch(client,session,csv,index,options={}){
  session=clone(session);
  need(Number.isSafeInteger(index)&&index>=0&&index<session.batches.length,'Choose the exact original batch index.');
  const {basis,bytes}=await context(client,session,csv,options);
  const prior=await previousReturns(client,session,index,basis,bytes,options);
  const request=await absentOrRequest(client,session.batches[index].operationId,options);
  if(request){
    const plan=await verifiedRequest(client,session,index,request,basis,bytes,options);
    return {batch:batchPlan(session,index,plan,prior),request};
  }
  const current=await client.portfolio(session.portfolio.id,options);
  guardSelectedRecords(basis,current,session,index,bytes);
  const plan=prepareAwardCsvImport(current,batchInput(session,bytes,index));
  return {batch:batchPlan(session,index,plan,prior),request:null};
}
/**
 * Dispatch one saved reviewed action only. It never starts the next batch and
 * never polls or restarts a RUNNING request. A failed original request requires
 * explicit resumeFailed:true and the original provider's retryable flag.
 * Any returned request remains authoritative in the original workspace.
 */
export async function submitAwardCsvSessionBatch(client,session,batch,csv,{resumeFailed=false,signal}={}){
  session=clone(session);batch=clone(batch);
  const options={signal};
  need(batch?.schema===AWARD_IMPORT_BATCH_SCHEMA&&batch.sessionId===session.sessionId&&
    batch.sessionSha256===session.sha256&&batch.workspaceId===session.workspaceId,
    'Select the original reviewed session and batch together.');
  const {basis,bytes}=await context(client,session,csv,options),index=batch.index;
  need(Number.isSafeInteger(index)&&index>=0&&index<session.batches.length,'Keep the original batch index.');
  const prior=await previousReturns(client,session,index,basis,bytes,options);
  const historical=await client.portfolio(session.portfolio.id,{...options,revision:batch.plan?.portfolio?.revision});
  guardSelectedRecords(basis,historical,session,index,bytes);
  const expected=batchPlan(session,index,prepareAwardCsvImport(historical,batchInput(session,bytes,index)),prior);
  need(same(expected,batch),'The reviewed batch changed. Reopen its original complete file.');
  let request=await absentOrRequest(client,session.batches[index].operationId,options);
  if(request){
    await verifiedRequest(client,session,index,request,basis,bytes,options);
    need(same(request.input,batch.plan.action),'The original operation already contains another batch plan.');
    if(request.state==='FAILED'&&resumeFailed){
      need(request.error?.retryable===true,'This original failed request is not eligible for resume.');
      request=await client.resume(request.id,options);
      await verifiedRequest(client,session,index,request,basis,bytes,options);
    }
    return request;
  }
  const current=await client.portfolio(session.portfolio.id,options);
  need(same(selectedPortfolio(current),batch.plan.portfolio),
    'The portfolio changed after this batch was reviewed. Keep the saved plan and explicitly review before dispatch.');
  const uploaded=await client.uploadProgrammeDocument({body:bytes,bytes:bytes.length,sha256:session.source.sha256},options);
  need(uploaded.bytes===bytes.length&&uploaded.sha256===session.source.sha256,'The full original source upload differs.');
  // If the transport outcome is uncertain, the caller reads this exact ID next.
  request=await client.action(batch.plan.action,options);
  await verifiedRequest(client,session,index,request,basis,bytes,options);
  return request;
}
/** Read every actual original operation; do not create, resume or upload anything. */
export async function inspectAwardCsvImportSession(client,session,csv,options={}){
  session=clone(session);
  const {basis,bytes}=await context(client,session,csv,options),batches=[];
  let completedRows=0;
  for(const selection of session.batches){
    const request=await absentOrRequest(client,selection.operationId,options);
    if(request)await verifiedRequest(client,session,selection.index,request,basis,bytes,options);
    if(request?.state==='COMPLETED')completedRows+=selection.rows;
    batches.push({index:selection.index,operationId:selection.operationId,rows:selection.rows,
      state:request?.state??'NOT_ADMITTED',request:request?{id:request.id,state:request.state,
        inputSha256:request.inputSha256,sha256:digest(request),error:clone(request.error??null)}:null});
  }
  return {schema:'stellar-forge.awards-csv-session-observation.v1',sessionId:session.sessionId,
    sessionSha256:session.sha256,workspaceId:session.workspaceId,portfolioId:session.portfolio.id,
    source:clone(session.source),sourceRows:session.sourceRows,completedRows,
    state:batches.every(batch=>batch.state==='COMPLETED')?'COMPLETE':'INCOMPLETE',batches};
}
