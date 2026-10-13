// MIT. Cross-case work over pinned original CaseStore heads and native commissioning commands.
import {createHash} from 'node:crypto';
import {parseWorkspace} from './workspace-file.mjs';
import {operateCaseCommissioning} from './case-commissioning.mjs';
import {newCommissioning,commissioningSummary,commissioningReceivingMatches,commissioningOriginalFiles,
  applyCommissioningCommand} from './commissioning.mjs';
import {PORTFOLIO_SCHEMA,SELECTION_SCHEMA,PREVIEW_SCHEMA,RESULT_SCHEMA,MAX_SELECTION_BYTES,MAX_REPORT_BYTES,
  copy,object,text,day,canonical,digest,byteLength,validateChanges,validateQuery,filterRow,renderPortfolioReport,fail} from './implementation-portfolio-model.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,HASH=/^[a-f0-9]{64}$/;
const sha=value=>createHash('sha256').update(value).digest('hex');
const id=value=>{if(typeof value!=='string'||!UUID.test(value))throw fail('Select an original saved case UUID.');return value;};
const revision=value=>{if(typeof value!=='string'||!HASH.test(value))throw fail('Keep the complete original saved revision.');return value;};
const now=()=>new Date().toISOString();
const bounded=(value,limit,label)=>{if(byteLength(JSON.stringify(value))>limit)throw fail(label+' exceeds its complete-file limit. Narrow the selected cases; no rows were truncated.','PORTFOLIO_TOO_LARGE',413);return value;};
const selectedCase=record=>({id:record.id,revision:record.revision,name:record.name,metadata:copy(record.metadata),
  createdAt:record.createdAt,updatedAt:record.updatedAt});
const caseRef=record=>({id:record.id,revision:record.revision,workspaceSha256:sha(record.workspaceText),
  supportSha256:record.supportText===null?null:sha(record.supportText)});
const links=record=>({case:'/?case='+encodeURIComponent(record.id)+'&revision='+encodeURIComponent(record.revision)+'#implementation',
  current:'/?case='+encodeURIComponent(record.id)+'#implementation',handoff:'/?case='+encodeURIComponent(record.id)+'#case-packages'});
const stopped=signal=>{if(signal?.aborted)throw fail('The original portfolio request was stopped.','PORTFOLIO_ABORTED',409);};
function publicFailure(error,entry){
  return {caseId:entry.id,revision:entry.revision,code:error.code??'PORTFOLIO_SOURCE_UNAVAILABLE',message:String(error.message??error).slice(0,2000)};
}
function receivingIndexes(state){
  const latest=new Map(),superseded=new Set(state.receiving.map(row=>row.supersedesId).filter(Boolean));
  const indexes={tasks:new Map(state.tasks.map(row=>[row.id,row])),materials:new Map(state.materials.map(row=>[row.id,row]))};
  for(const row of state.receiving)if((row.editionId===state.activeEditionId||row.editionId===null)&&!superseded.has(row.id))
    for(const taskId of row.taskIds){
      const key=row.kind+':'+taskId,prior=latest.get(key);
      if(!prior||Date.parse(row.observedAt)>Date.parse(prior.observedAt)||
        Date.parse(row.observedAt)===Date.parse(prior.observedAt)&&Date.parse(row.recordedAt)>=Date.parse(prior.recordedAt))
        latest.set(key,row);
    }
  const projections=new Map();
  function selected(taskId,kind){
    const row=latest.get(kind+':'+taskId);if(!row)return null;
    if(!projections.has(row.id))projections.set(row.id,{id:row.id,kind:row.kind,outcome:row.outcome,
      current:commissioningReceivingMatches(state,row,indexes),observedAt:row.observedAt,recordedAt:row.recordedAt,
      actor:row.actor,subjectSha256:row.subjectSha256,editionId:row.editionId,reference:row.reference});
    return copy(projections.get(row.id));
  }
  return {indexes,selected};
}
function projectTask(record,state,task,asOf,index){
  const technical=index.selected(task.id,'technical'),customer=index.selected(task.id,'customer');
  const dependencies=task.dependencies.map(key=>{const dependency=index.indexes.tasks.get(key);
    return {id:key,title:dependency.title,status:dependency.status,retired:dependency.retired,done:dependency.status==='done'};});
  const active=!task.retired&&task.status!=='retired',open=value=>!value||!value.current||!['accepted','not_applicable'].includes(value.outcome);
  return {caseId:record.id,caseRevision:record.revision,caseName:record.name,merchant:record.metadata.merchant,
    caseOwner:record.metadata.owner,caseStatus:record.metadata.status,caseFollowUpOn:record.metadata.followUpOn,
    implementationRevision:state.revision,activeEditionId:state.activeEditionId,planTitle:state.plan.title,
    implementationOwner:state.plan.implementationOwner,receivingOwner:state.plan.receivingOwner,
    task:{id:task.id,title:task.title,owner:task.owner,dueOn:task.dueOn,status:task.status,retired:task.retired,
      dependencies:copy(task.dependencies),editionId:task.editionId,sourceKey:task.sourceKey},
    dependencies,technical,customer,links:links(record),
    flags:{overdue:active&&task.status!=='done'&&Boolean(task.dueOn)&&task.dueOn<asOf,
      unassigned:active&&!task.owner.trim(),blocked:active&&dependencies.some(row=>!row.done),
      source_changes:active&&Object.keys(task.proposed).length>0,
      receiving_stale:active&&[technical,customer].some(row=>row&&!row.current),
      changes_required:active&&[technical,customer].some(row=>row?.current&&row.outcome==='changes_required'),
      technical_open:active&&open(technical),customer_open:active&&open(customer)}};
}
function caseSummary(record,state){return {case:selectedCase(record),source:caseRef(record),
  plan:copy(state.plan),summary:commissioningSummary(state),links:links(record)};}
function taskIds(value){
  if(!Array.isArray(value)||value.length<1||value.length>2000||new Set(value).size!==value.length||
    value.some(item=>typeof item!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(item)))
    throw fail('Select distinct original tasks from one case.');
  return value.slice();
}
function sourceArgs(args){
  id(args.caseId);revision(args.expectedRevision);return {taskIds:taskIds(args.taskIds),changes:validateChanges(args.changes)};
}
function commandFor(args,preview){return {type:'save_tasks',requestId:args.requestId,
  expectedRevision:preview.implementationRevision,actor:args.actor,recordedAt:args.recordedAt,
  payload:{tasks:preview.taskIds.map(taskId=>({id:taskId,...copy(preview.changes)}))}};}
function operationInput(args){
  object(args,['caseId','expectedRevision','taskIds','changes','previewSha256','requestId','actor','recordedAt','signal'],'portfolio operation');
  sourceArgs(args);revision(args.previewSha256);id(args.requestId);text(args.actor,200,'actual operator',{empty:false});
  if(typeof args.recordedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(args.recordedAt)||
    !Number.isFinite(Date.parse(args.recordedAt))||new Date(args.recordedAt).toISOString().slice(0,19)!==args.recordedAt.slice(0,19))
    throw fail('Retain the actual operation time in UTC.');
  const {signal,...input}=args;return copy(input);
}
export function createImplementationPortfolio({store,workspaceId}={}){
  if(!store?.catalog||!store?.read||!store?.save)throw fail('Use the original case store with complete head capture.');
  text(workspaceId,256,'workspace identity',{empty:false});
  let closed=false;const active=new Set();
  function track(action,args){if(closed)return Promise.reject(fail('The portfolio is closing.','PORTFOLIO_CLOSED',503));
    const p=Promise.resolve().then(()=>action(args));active.add(p);p.finally(()=>active.delete(p)).catch(()=>{});return p;}
  async function load(caseId,rev,signal){
    stopped(signal);const record=await store.read(id(caseId),revision(rev));stopped(signal);
    const workspace=await parseWorkspace(record.workspaceText);stopped(signal);
    return {record,state:workspace.commissioning??newCommissioning()};
  }
  async function selection(value){
    object(value,['schema','workspaceId','capturedAt','asOf','caseQuery','cases','unavailable','selectionSha256'],'portfolio selection');
    bounded(value,MAX_SELECTION_BYTES,'The full case selection');
    if(value.schema!==SELECTION_SCHEMA||value.workspaceId!==workspaceId||!Array.isArray(value.cases)||value.cases.length>2000||
      !Array.isArray(value.unavailable)||value.unavailable.length>2000)throw fail('Use a complete selection from this original Support workspace.');
    day(value.asOf,'report date');text(value.capturedAt,40,'capture time',{empty:false});
    if(!Number.isFinite(Date.parse(value.capturedAt)))throw fail('Invalid capture time.');
    const seen=new Set();for(const row of value.cases){object(row,['id','revision','name','metadata','createdAt','updatedAt'],'captured case');
      id(row.id);revision(row.revision);if(seen.has(row.id))throw fail('Repeated captured case.');seen.add(row.id);}
    value.unavailable.forEach(id);const {selectionSha256,...body}=value;revision(selectionSha256);
    if(await digest(body)!==selectionSha256)throw fail('The original case selection changed. Reopen the complete saved selection.');
    return copy(value);
  }
  async function capture(args={}){
    object(args,['q','status','dueOn','asOf','signal'],'case capture');day(args.asOf,'report date');
    const caseQuery={q:args.q??'',status:args.status??'',dueOn:args.dueOn??''};
    stopped(args.signal);const catalog=await store.catalog(caseQuery);stopped(args.signal);
    const body={schema:SELECTION_SCHEMA,workspaceId,capturedAt:now(),asOf:args.asOf,caseQuery,
      cases:catalog.cases.map(selectedCase),unavailable:catalog.unavailable.slice()};
    return bounded({...body,selectionSha256:await digest(body)},MAX_SELECTION_BYTES,'The full case selection');
  }
  async function page(args){
    object(args,['selection','query','cursor','limit','signal'],'portfolio page');
    const selected=await selection(args.selection),query=validateQuery(args.query??{}),limit=args.limit??100;
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw fail('Use a task page size from 1 to 100.');
    const cursor=args.cursor??{caseOffset:0,taskOffset:0};object(cursor,['caseOffset','taskOffset'],'portfolio cursor');
    if(!Number.isSafeInteger(cursor.caseOffset)||cursor.caseOffset<0||cursor.caseOffset>selected.cases.length||
      !Number.isSafeInteger(cursor.taskOffset)||cursor.taskOffset<0||cursor.taskOffset>2000)throw fail('Use the original page cursor.');
    let ci=cursor.caseOffset,ti=cursor.taskOffset,visited=0;
    const rows=[],caseSummaries=[],unavailable=[];
    while(ci<selected.cases.length&&rows.length<limit&&visited<20){
      const entry=selected.cases[ci];let context;
      try{context=await load(entry.id,entry.revision,args.signal);
        if(canonical(selectedCase(context.record))!==canonical(entry))throw fail('The captured case metadata differs from its original saved revision.','PORTFOLIO_SOURCE_CHANGED',409);
      }catch(error){stopped(args.signal);unavailable.push(publicFailure(error,entry));ci++;ti=0;visited++;continue;}
      const {record,state}=context,index=receivingIndexes(state);caseSummaries.push(caseSummary(record,state));visited++;
      if(ti>state.tasks.length)throw fail('The page cursor exceeds the original task count.');
      while(ti<state.tasks.length&&rows.length<limit){
        const row=projectTask(record,state,state.tasks[ti++],selected.asOf,index);
        if(filterRow(row,query))rows.push(row);
      }
      if(ti===state.tasks.length){ci++;ti=0;}
    }
    const nextCursor=ci<selected.cases.length?{caseOffset:ci,taskOffset:ti}:null;
    return bounded({schema:PORTFOLIO_SCHEMA,selectionSha256:selected.selectionSha256,workspaceId,asOf:selected.asOf,query,
      rows,caseSummaries,unavailable,nextCursor,scannedCaseOffset:ci,totalSelectedCases:selected.cases.length,complete:nextCursor===null},
      MAX_REPORT_BYTES,'The complete task page');
  }
  async function detail(args){
    object(args,['caseId','revision','taskId','asOf','signal'],'task detail');day(args.asOf,'report date');
    const {record,state}=await load(args.caseId,args.revision,args.signal),task=state.tasks.find(row=>row.id===args.taskId);
    if(!task)throw fail('That task is absent from the selected saved case.','PORTFOLIO_TASK_MISSING',404);
    const receiving=state.receiving.filter(row=>row.taskIds.includes(task.id)),selectedMaterials=new Set(receiving.flatMap(row=>row.materialIds));
    const files=commissioningOriginalFiles(state),byHash=new Map(files.map(row=>[row.sha256,row]));
    const materials=state.materials.filter(row=>row.taskIds.includes(task.id)||selectedMaterials.has(row.id)).map(row=>({...copy(row),bytes:byHash.get(row.sha256)?.bytes??null}));
    return bounded({case:caseRef(record),currentRevision:record.currentRevision,plan:copy(state.plan),task:copy(task),materials,
      receiving:copy(receiving),sourceChanges:copy(task.proposed),links:links(record),summary:commissioningSummary(state),
      row:projectTask(record,state,task,args.asOf,receivingIndexes(state))},MAX_REPORT_BYTES,'The complete task detail');
  }
  async function buildPreview(args){
    const parsed=sourceArgs(args),{record,state}=await load(args.caseId,args.expectedRevision,args.signal),before=[],after=[];
    for(const taskId of parsed.taskIds){
      const task=state.tasks.find(row=>row.id===taskId);
      if(!task)throw fail('One selected task is absent from the original case.','PORTFOLIO_TASK_MISSING',404);
      before.push(copy(task));after.push({...copy(task),...copy(parsed.changes)});
    }
    if(before.every((row,i)=>canonical(row)===canonical(after[i])))throw fail('The selected operational fields are unchanged.');
    const warnings=[];
    if(before.some(row=>row.retired))warnings.push('A task has its original retired flag. Editing work status will not remove that source-retirement flag.');
    if(parsed.changes.status==='done')warnings.push('Done records work progress only. It does not create technical or customer acceptance.');
    if(parsed.changes.status==='retired')warnings.push('Retired status removes the selected tasks from the default active work view; original definitions and history remain.');
    if(before.some(row=>row.dependencies.some(key=>state.tasks.find(task=>task.id===key)?.status!=='done')))
      warnings.push('One or more selected tasks have dependencies whose saved work status is not done. This edit does not change those dependencies.');
    const body={schema:PREVIEW_SCHEMA,case:caseRef(record),implementationRevision:state.revision,
      taskIds:parsed.taskIds,changes:parsed.changes,before,after,warnings};
    return {preview:{...body,previewSha256:await digest(body)},record,state};
  }
  async function preview(args){
    object(args,['caseId','expectedRevision','taskIds','changes','signal'],'portfolio preview');
    const result=await buildPreview(args);
    if(result.record.currentRevision!==args.expectedRevision)throw Object.assign(fail('This saved case has changed. Reopen its current revision before reviewing an edit.','CASE_CONFLICT',409),{currentRevision:result.record.currentRevision});
    return result.preview;
  }
  async function prepared(args){
    const input=operationInput(args),built=await buildPreview(args);
    if(built.preview.previewSha256!==args.previewSha256)throw fail('The exact reviewed task changes differ. Reopen the retained original preview.','PORTFOLIO_PREVIEW_CHANGED',409);
    const command=commandFor(args,built.preview),inputSha256=await digest(input);
    const requestSha256=await digest({type:command.type,actor:command.actor,payload:command.payload,recordedAt:command.recordedAt});
    return {input,built,command,inputSha256,requestSha256};
  }
  function complete(args,prepared,result){return {schema:RESULT_SCHEMA,state:'COMPLETE',workspaceId,
    case:result.case,requestId:args.requestId,inputSha256:prepared.inputSha256,requestSha256:prepared.requestSha256,
    taskIds:prepared.built.preview.taskIds.slice(),result:copy(result.result),revision:result.revision,
    summary:copy(result.summary),replayed:result.replayed};}
  async function apply(args){
    const request=await prepared(args);stopped(args.signal);
    // Original native request hash replay precedes mutable current-case checks.
    const result=await operateCaseCommissioning(store,{id:args.caseId,expectedRevision:args.expectedRevision,command:request.command});
    return complete(args,request,result);
  }
  async function status(args){
    const request=await prepared(args),record=await store.read(args.caseId);
    const workspace=await parseWorkspace(record.workspaceText),state=workspace.commissioning??newCommissioning();
    const retained=state.events.find(row=>row.id===args.requestId);
    if(!retained)return {schema:RESULT_SCHEMA,state:'NOT_STARTED',workspaceId,case:caseRef(record),
      requestId:args.requestId,inputSha256:request.inputSha256,requestSha256:request.requestSha256,taskIds:request.built.preview.taskIds.slice()};
    const result=await applyCommissioningCommand(state,request.command);
    return complete(args,request,{...result,case:caseRef(record),summary:commissioningSummary(state)});
  }
  async function exportReport(args){
    object(args,['selection','query','format','signal'],'portfolio export');
    const selected=await selection(args.selection),query=validateQuery(args.query??{}),format=args.format??'json';
    if(!['json','html'].includes(format))throw fail('Choose the complete JSON or HTML operating report.');
    const rows=[],summaries=new Map(),unavailable=new Map(selected.unavailable.map(caseId=>[caseId,{caseId,code:'CASE_CATALOG_UNAVAILABLE',
      message:'The original case head could not be read during capture; it is not silently omitted from coverage.'}]));
    let cursor=null,estimated=byteLength(JSON.stringify(selected));
    do{
      stopped(args.signal);const result=await page({selection:selected,query,cursor,limit:100,signal:args.signal});
      rows.push(...result.rows);
      for(const summary of result.caseSummaries)if(!summaries.has(summary.case.id)){summaries.set(summary.case.id,summary);estimated+=byteLength(JSON.stringify(summary));}
      for(const error of result.unavailable)unavailable.set(error.caseId,error);
      estimated+=byteLength(JSON.stringify(result.rows));if(estimated>MAX_REPORT_BYTES)throw fail('The complete report exceeds 64 MiB. Narrow its captured case selection or task query.','PORTFOLIO_TOO_LARGE',413);
      cursor=result.nextCursor;
    }while(cursor);
    const report={schema:PORTFOLIO_SCHEMA,selection:selected,query,caseSummaries:[...summaries.values()],rows,
      coverage:{complete:unavailable.size===0,selectedCases:selected.cases.length,readableCases:summaries.size,
        unavailable:[...unavailable.values()]}};
    const output=format==='html'?renderPortfolioReport(report):JSON.stringify(report,null,2)+'\n',bytes=byteLength(output);
    if(bytes>MAX_REPORT_BYTES)throw fail('The complete rendered report exceeds 64 MiB. Narrow its original selection.','PORTFOLIO_TOO_LARGE',413);
    return {name:'implementation-portfolio-'+selected.asOf+'-'+selected.selectionSha256.slice(0,12)+'.'+format,
      mediaType:format==='html'?'text/html; charset=utf-8':'application/json; charset=utf-8',text:output,bytes,sha256:await digest(output)};
  }
  return Object.freeze({capture:args=>track(capture,args),page:args=>track(page,args),detail:args=>track(detail,args),
    preview:args=>track(preview,args),apply:args=>track(apply,args),status:args=>track(status,args),
    export:args=>track(exportReport,args),async close(){closed=true;await Promise.allSettled([...active]);}});
}
