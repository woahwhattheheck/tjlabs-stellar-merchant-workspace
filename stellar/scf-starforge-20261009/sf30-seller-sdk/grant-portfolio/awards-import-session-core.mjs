// MIT. Reviewed application CSV sessions over the original retained portfolio actions.
import {parseAwardCsvText,originalAwardCsvBytes,prepareAwardCsvImportStructure,
  createAwardCsvImportPlanner} from './awards-exchange-core.mjs';
import {sha256Bytes,sha256Text} from './awards-import-hash.mjs';
import {verifyAwardCsvRowReview,materializeAwardCsvRowReview,encodeAwardCsvRowReview} from './awards-import-row-review.mjs';
const utf8=text=>new TextEncoder().encode(text);
function prepareAwardCsvImport(portfolio,input){
  const csv=originalAwardCsvBytes(input.csv),plan=prepareAwardCsvImportStructure(portfolio,{...input,csv},sha256Bytes(csv));
  return {...plan,actionSha256:sha256Text(JSON.stringify(plan.action))};
}

export const AWARD_IMPORT_SESSION_SCHEMA='stellar-forge.awards-csv-import-session.v1';
export const AWARD_IMPORT_BATCH_SCHEMA='stellar-forge.awards-csv-session-batch.v1';
export const AWARD_REVIEWED_IMPORT_SESSION_SCHEMA='stellar-forge.awards-csv-import-session.v2';
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
const encode=value=>utf8(JSON.stringify(canonical(value)));
const hash=sha256Bytes;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
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
function guardSelectedRecords(basis,current,session,index,csv,parsedSource){
  checkRound(current,session);
  const parsed=parsedSource??(session.input.rowReview?materializeAwardCsvRowReview(session.input.rowReview,csv):
    parseAwardCsvText(new TextDecoder('utf-8',{fatal:true}).decode(csv)));
  const originalIndexes={applications:new Map(basis.definition.awards.records.applications.map(r=>[r.id,r])),
    ...Object.fromEntries(['partners','nodes'].map(name=>[name,new Map(basis.definition.programme.records[name].map(r=>[r.id,r]))]))};
  const currentIndexes={applications:new Map(current.definition.awards.records.applications.map(r=>[r.id,r])),
    ...Object.fromEntries(['partners','nodes'].map(name=>[name,new Map(current.definition.programme.records[name].map(r=>[r.id,r]))]))};
  const {mapping,identities}=session.input;
  const exactRecord=(collection,id)=>{
    const before=originalIndexes[collection].get(id);
    const after=currentIndexes[collection].get(id);
    need(before&&after&&!after.archived&&before.revision===after.revision&&before.sha256===after.sha256,
      'A selected applicant organisation or project changed. Review a successor session explicitly.');
  };
  for(const indexOfRow of session.batches[index].rowIndexes){
    const row=parsed.rows[indexOfRow],applicationId=session.input.rowReview?
      session.input.rowReview.rows[indexOfRow].applicationId:identities.applications[row[mapping.reference]];
    const before=originalIndexes.applications.get(applicationId)??null;
    const after=currentIndexes.applications.get(applicationId)??null;
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
  exact(input,['sessionId','workspaceId','csv','filename','roundId','actor','mapping','identities','status','batches','rowReview','reviewDocumentId'],
    ['sessionId','workspaceId','csv','filename','roundId','actor','mapping','identities','batches']);
  need(UUID.test(input.sessionId??'')&&UUID.test(input.workspaceId??''),'Supply stable session and original workspace UUIDs.');
  need(Array.isArray(input.batches)&&input.batches.length>=1&&input.batches.length<=25000,
    'Review from one to 25,000 explicit batches, at most one per original source row.');
  const csv=originalCsv(input.csv),parsed=parseAwardCsvText(new TextDecoder('utf-8',{fatal:true}).decode(csv));
  const rowReview=input.rowReview?verifyAwardCsvRowReview(portfolio,input.rowReview,csv):null;
  const materialized=rowReview?materializeAwardCsvRowReview(rowReview,csv):null;
  const acceptedIndexes=materialized?.acceptedRowIndexes??Array.from({length:parsed.rows.length},(_,i)=>i);
  const acceptedSet=new Set(acceptedIndexes);
  need(rowReview||input.reviewDocumentId===undefined,'A row-review document requires the complete retained review.');
  const indexes=new Set(),operations=new Set(),documents=new Set();
  const common={filename:input.filename,roundId:input.roundId,actor:input.actor,mapping:canonical(clone(input.mapping)),
    identities:canonical(clone(input.identities)),status:input.status??'draft',
    ...(rowReview?{rowReview:canonical(clone(rowReview)),reviewDocumentId:input.reviewDocumentId}:{})};
  const planner=createAwardCsvImportPlanner(portfolio,{...common,csv},hash(csv));
  const preparedPlan=selection=>{const plan=planner.plan(selection);return {...plan,actionSha256:sha256Text(JSON.stringify(plan.action))};};
  const batches=[];
  let first;
  for(const [index,batch]of input.batches.entries()){
    exact(batch,['operationId','documentId','rowIndexes']);
    need(OPERATION.test(batch.operationId??'')&&!operations.has(batch.operationId),
      'Every reviewed batch needs one distinct supplied operation ID.');
    need(UUID.test(batch.documentId??'')&&!documents.has(batch.documentId),
      'Every batch mapping needs a distinct supplied document UUID.');
    operations.add(batch.operationId);documents.add(batch.documentId);
    need(Array.isArray(batch.rowIndexes)&&(batch.rowIndexes.length>0||rowReview&&acceptedIndexes.length===0&&input.batches.length===1),
      'Select every accepted batch row explicitly; an all-exception review uses one evidence-only action.');
    for(const rowIndex of batch.rowIndexes){
      need(Number.isSafeInteger(rowIndex)&&rowIndex>=0&&rowIndex<parsed.rows.length&&!indexes.has(rowIndex)&&acceptedSet.has(rowIndex),
        'Each original CSV data row must belong to exactly one batch.');
      indexes.add(rowIndex);
    }
    const preview=preparedPlan(batch);
    first??=preview;
    need(utf8(JSON.stringify(preview.action)).length<1024*1024,
      'Leave room for the original native canonical JSON newline within its 1 MiB action limit.');
    batches.push({index,operationId:batch.operationId,documentId:batch.documentId,rowIndexes:[...batch.rowIndexes],
      rows:preview.rows,previewActionBytes:utf8(JSON.stringify(preview.action)).length});
  }
  need(indexes.size===acceptedIndexes.length,'Every accepted row must belong to exactly one batch; retained exceptions and non-applications are not written.');
  if(!rowReview)need(new Set(parsed.rows.map(row=>common.identities.applications[row[common.mapping.reference]])).size===parsed.rows.length,
    'Each original application reference must retain its own supplied record identity.');
  const session=seal({schema:rowReview?AWARD_REVIEWED_IMPORT_SESSION_SCHEMA:AWARD_IMPORT_SESSION_SCHEMA,sessionId:input.sessionId,workspaceId:input.workspaceId,
    portfolio:selectedPortfolio(portfolio),source:first.source,round:first.round,input:common,
    sourceRows:parsed.rows.length,batches});
  need(encode(session).length<=32*1024*1024,'Keep the complete reviewed session within 32 MiB.');
  return session;
}
function verifySession(basis,session,csv){
  need([AWARD_IMPORT_SESSION_SCHEMA,AWARD_REVIEWED_IMPORT_SESSION_SCHEMA].includes(session?.schema)&&HASH.test(session.sha256??''),
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
// One retained scope per connected client. Values are detached; mutable incoming
// selections and bytes are compared on every call before reuse. Historical source
// is immutable; fresh native summaries still decide every operation's state.
const scopes=new WeakMap();
function requestSummary(request){
  return canonical(Object.fromEntries(['id','state','action','inputSha256','updatedAt','error']
    .filter(key=>Object.hasOwn(request,key)).map(key=>[key,request[key]])));
}
async function context(client,session,csv,options){
  const bytes=originalCsv(csv,session.source),state=await client.state(options);
  need(state.workspaceId===session.workspaceId,'Open the original workspace selected by this session.');
  const key=JSON.stringify(canonical(session));
  let scope=scopes.get(client);
  if(!scope||scope.key!==key){
    const basis=await client.portfolio(session.portfolio.id,{...options,revision:session.portfolio.revision});
    need(basis.snapshot===session.portfolio.snapshot,'The original session selected another historical portfolio snapshot.');
    verifySession(basis,session,bytes);
    scope={key,basis:clone(basis),parsed:session.input.rowReview?materializeAwardCsvRowReview(session.input.rowReview,bytes):
      parseAwardCsvText(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),
      completed:new Map()};
    scopes.set(client,scope);
  }
  return {...scope,bytes,state};
}
function rememberCompleted(scope,request){
  if(request.state==='COMPLETED')scope.completed.set(request.id,
    {summary:requestSummary(request),requestSha256:digest(request)});
}
function retainedCompletion(scope,id){
  const prior=scope.completed.get(id),current=scope.state.requests?.find(row=>row.id===id);
  return prior&&current?.state==='COMPLETED'&&same(prior.summary,requestSummary(current))?prior:null;
}
function batchPlan(session,index,plan,prior){
  need(utf8(JSON.stringify(plan.action)).length<1024*1024,
    'The complete batch including the native canonical newline must fit the original 1 MiB limit.');
  return seal({schema:AWARD_IMPORT_BATCH_SCHEMA,sessionId:session.sessionId,sessionSha256:session.sha256,
    workspaceId:session.workspaceId,index,prior,plan});
}
async function verifiedRequest(client,session,index,request,basis,csv,options,scope){
  const selection=session.batches[index];
  need(request?.id===selection.operationId&&request.input?.operationId===selection.operationId&&
    request.input?.action==='portfolio.save'&&request.input.payload?.id===session.portfolio.id,
    'An existing request has a different session, portfolio or operation identity.');
  const revision=request.input.payload.expectedPortfolioRevision;
  need(Number.isSafeInteger(revision)&&revision>=basis.revision,'Keep the original batch portfolio revision.');
  const historical=await client.portfolio(session.portfolio.id,{...options,revision});
  guardSelectedRecords(basis,historical,session,index,csv,scope?.parsed);
  const plan=prepareAwardCsvImport(historical,batchInput(session,csv,index));
  need(same(request.input,plan.action),'The retained original request differs from this exact reviewed batch.');
  if(scope)rememberCompleted(scope,request);
  return plan;
}
async function previousReturns(client,session,index,basis,csv,options,scope){
  const prior=[];
  for(let before=0;before<index;before++){
    const operationId=session.batches[before].operationId,cached=scope&&retainedCompletion(scope,operationId);
    if(cached){prior.push({index:before,operationId,requestSha256:cached.requestSha256});continue;}
    const request=await absentOrRequest(client,operationId,options);
    need(request?.state==='COMPLETED','Finish or reconcile each original earlier batch before reviewing its successor.');
    await verifiedRequest(client,session,before,request,basis,csv,options,scope);
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
  const scope=await context(client,session,csv,options),{basis,bytes}=scope;
  const prior=await previousReturns(client,session,index,basis,bytes,options,scope);
  const request=await absentOrRequest(client,session.batches[index].operationId,options);
  if(request){
    const plan=await verifiedRequest(client,session,index,request,basis,bytes,options,scope);
    return {batch:batchPlan(session,index,plan,prior),request};
  }
  const current=await client.portfolio(session.portfolio.id,options);
  guardSelectedRecords(basis,current,session,index,bytes,scope.parsed);
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
  const scope=await context(client,session,csv,options),{basis,bytes}=scope,index=batch.index;
  need(Number.isSafeInteger(index)&&index>=0&&index<session.batches.length,'Keep the original batch index.');
  const prior=await previousReturns(client,session,index,basis,bytes,options,scope);
  const historical=await client.portfolio(session.portfolio.id,{...options,revision:batch.plan?.portfolio?.revision});
  guardSelectedRecords(basis,historical,session,index,bytes,scope.parsed);
  const expected=batchPlan(session,index,prepareAwardCsvImport(historical,batchInput(session,bytes,index)),prior);
  need(same(expected,batch),'The reviewed batch changed. Reopen its original complete file.');
  let request=await absentOrRequest(client,session.batches[index].operationId,options);
  if(request){
    await verifiedRequest(client,session,index,request,basis,bytes,options,scope);
    need(same(request.input,batch.plan.action),'The original operation already contains another batch plan.');
    if(request.state==='FAILED'&&resumeFailed){
      need(request.error?.retryable===true,'This original failed request is not eligible for resume.');
      request=await client.resume(request.id,options);
      await verifiedRequest(client,session,index,request,basis,bytes,options,scope);
    }
    return request;
  }
  const current=await client.portfolio(session.portfolio.id,options);
  need(same(selectedPortfolio(current),batch.plan.portfolio),
    'The portfolio changed after this batch was reviewed. Keep the saved plan and explicitly review before dispatch.');
  const uploaded=await client.uploadProgrammeDocument({body:bytes,bytes:bytes.length,sha256:session.source.sha256},options);
  need(uploaded.bytes===bytes.length&&uploaded.sha256===session.source.sha256,'The full original source upload differs.');
  if(session.input.rowReview){
    const body=encodeAwardCsvRowReview(session.input.rowReview),sha256=hash(body);
    need(batch.plan.rowReview?.object.sha256===sha256&&batch.plan.rowReview.object.bytes===body.length,
      'The retained complete row-review evidence differs from this reviewed batch.');
    const uploadedReview=await client.uploadProgrammeDocument({body,bytes:body.length,sha256},options);
    need(uploadedReview.bytes===body.length&&uploadedReview.sha256===sha256,'The complete row-review evidence upload differs.');
  }
  // If the transport outcome is uncertain, the caller reads this exact ID next.
  request=await client.action(batch.plan.action,options);
  await verifiedRequest(client,session,index,request,basis,bytes,options,scope);
  return request;
}
/** Read every actual original operation; do not create, resume or upload anything. */
export async function inspectAwardCsvImportSession(client,session,csv,options={}){
  session=clone(session);
  const scope=await context(client,session,csv,options),{basis,bytes}=scope,batches=[];
  let completedRows=0;
  for(const selection of session.batches){
    const cached=retainedCompletion(scope,selection.operationId);
    if(cached){
      const summary=scope.state.requests.find(row=>row.id===selection.operationId);
      completedRows+=selection.rows;
      batches.push({index:selection.index,operationId:selection.operationId,rows:selection.rows,state:'COMPLETED',
        request:{id:summary.id,state:summary.state,inputSha256:summary.inputSha256,sha256:cached.requestSha256,error:clone(summary.error??null)}});
      continue;
    }
    const request=await absentOrRequest(client,selection.operationId,options);
    if(request)await verifiedRequest(client,session,selection.index,request,basis,bytes,options,scope);
    if(request?.state==='COMPLETED')completedRows+=selection.rows;
    batches.push({index:selection.index,operationId:selection.operationId,rows:selection.rows,
      state:request?.state??'NOT_ADMITTED',request:request?{id:request.id,state:request.state,
        inputSha256:request.inputSha256,sha256:digest(request),error:clone(request.error??null)}:null});
  }
  return {schema:session.input.rowReview?'stellar-forge.awards-csv-session-observation.v2':'stellar-forge.awards-csv-session-observation.v1',sessionId:session.sessionId,
    sessionSha256:session.sha256,workspaceId:session.workspaceId,portfolioId:session.portfolio.id,
    source:clone(session.source),sourceRows:session.sourceRows,completedRows,
    ...(session.input.rowReview?{rowReview:{sha256:session.input.rowReview.sha256,counts:clone(session.input.rowReview.counts),
      documentId:session.input.reviewDocumentId}}:{}),
    state:batches.every(batch=>batch.state==='COMPLETED')?'COMPLETE':'INCOMPLETE',batches};
}

/** Propose a complete explicit partition for the operator to review before saving.
 * The caller supplies all stable operation/document identities; no write occurs. */
export function proposeAwardCsvImportBatches(portfolio,input,{operationPrefix,documentIds,maxRows=1000}={}){
  need(OPERATION.test(operationPrefix??'')&&operationPrefix.length<=150,'Supply the original batch operation prefix.');
  need(Array.isArray(documentIds)&&documentIds.length>0&&documentIds.length<=25000&&
    documentIds.every(id=>UUID.test(id))&&new Set(documentIds).size===documentIds.length,'Supply distinct batch document UUIDs.');
  need(Number.isSafeInteger(maxRows)&&maxRows>=1&&maxRows<=2000,'Choose at most 2,000 rows per reviewed batch.');
  const csv=originalCsv(input.csv),planner=createAwardCsvImportPlanner(portfolio,{...input,csv},hash(csv)),batches=[];
  const accepted=planner.acceptedRowIndexes??Array.from({length:planner.rows},(_,i)=>i);
  if(accepted.length===0){
    const selection={operationId:operationPrefix+'-001',documentId:documentIds[0],rowIndexes:[]};
    planner.plan(selection);return [selection];
  }
  let offset=0;
  while(offset<accepted.length){
    need(batches.length<documentIds.length,'Supply more batch identities for this complete source.');
    const common={operationId:operationPrefix+'-'+String(batches.length+1).padStart(3,'0'),
      documentId:documentIds[batches.length]};
    let low=1,high=Math.min(maxRows,accepted.length-offset),best=0,lastError,firstAttempt=true;
    while(low<=high){
      const count=firstAttempt?high:Math.floor((low+high)/2);firstAttempt=false;
      const rowIndexes=accepted.slice(offset,offset+count);
      try{
        const plan=planner.plan({...common,rowIndexes});
        if(utf8(JSON.stringify(plan.action)).length>=1024*1024)throw Error('The complete mapped action exceeds the original request limit.');
        best=count;low=count+1;
      }catch(error){
        if(!/exceeds the original request limit|mapping must fit the original programme document/.test(error.message))throw error;
        lastError=error;high=count-1;
      }
    }
    if(!best)throw lastError??Error('One complete application cannot fit the original request.');
    batches.push({...common,rowIndexes:accepted.slice(offset,offset+best)});offset+=best;
  }
  return batches;
}
