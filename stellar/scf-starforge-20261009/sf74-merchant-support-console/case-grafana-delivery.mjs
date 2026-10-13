// MIT. Native Grafana handover observations through the original SF49 and case writers.
import {spawn} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {parseWorkspace} from './workspace-file.mjs';
import {newCommissioning,commissioningFileBytes,commissioningError,applyCommissioningCommand} from './commissioning.mjs';
import {operateCaseCommissioning} from './case-commissioning.mjs';

export const GRAFANA_DELIVERY_SCHEMA='stellar-forge.grafana-case-delivery-selection.v1';
export const GRAFANA_DELIVERY_BASE='/api/grafana-delivery';
const SHA=/^[a-f0-9]{64}$/,ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/,
  UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX_REPORT=8*1024*1024;
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':
  value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
const copy=value=>JSON.parse(JSON.stringify(value));
const ensure=(value,message,code='GRAFANA_DELIVERY_INPUT',status=422)=>{
  if(!value)throw commissioningError(code,message,status);
};
const fields=(value,allowed)=>ensure(value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).every(k=>allowed.includes(k)),'Unexpected Grafana delivery fields');
const text=(value,max,label,{empty=false}={})=>{
  ensure(typeof value==='string'&&Buffer.byteLength(value)<=max&&(empty||value.trim())&&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),'Invalid '+label);return value;
};
const same=(a,b,message)=>ensure(canonical(a)===canonical(b),message,'GRAFANA_DELIVERY_CONFLICT',409);
const stopped=signal=>{if(signal.aborted)throw commissioningError('GRAFANA_DELIVERY_STOPPED','This original delivery owner is closing.',409);};
function unique(values,label,maximum=2000){
  ensure(Array.isArray(values)&&values.length<=maximum&&values.every(v=>typeof v==='string'&&v.length>0&&v.length<=128)&&
    new Set(values).size===values.length,'Use unique '+label);return values.slice().sort();
}
function keys(requestId){return {intent:requestId+'.intent',attach:requestId+'.bundle',
  archive:requestId+'.archive',report:requestId+'.report',
  intentMaterial:'grafana-'+requestId+'-intent',archiveMaterial:'grafana-'+requestId+'-archive',
  reportMaterial:'grafana-'+requestId+'-report'};}
function taskDefinitions(state,ids){
  return ids.map(id=>{const task=state.tasks.find(row=>row.id===id);
    ensure(task&&!task.retired&&task.status!=='retired','Select current implementation tasks','GRAFANA_TASK_CHANGED',409);
    return {id:task.id,title:task.title,acceptance:task.acceptance,dependencies:task.dependencies.slice().sort(),retired:task.retired};
  });
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function grafanaDeliveryReport(selection){
  const report=JSON.parse(selection.inspectionText),table=(heads,rows)=>
    '<table><thead><tr>'+heads.map(x=>'<th>'+escape(x)+'</th>').join('')+'</tr></thead><tbody>'+
    rows.map(row=>'<tr>'+row.map(x=>'<td>'+escape(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>Grafana delivery · '+escape(report.project.name)+'</title><style>body{background:#f4f4f4;color:#191919;font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 24px}h1,h2{letter-spacing:-.02em}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border:1px solid #aaa;padding:10px;overflow-wrap:anywhere}th{background:#ddd}code{overflow-wrap:anywhere}.note{padding:16px;border-left:4px solid #555;background:#e7e7e7}@media(max-width:700px){body{margin:20px auto}table{display:block;overflow:auto}}</style>'+
    '<h1>Grafana delivery</h1><p>'+escape(report.project.name)+' · '+escape(report.integration_id)+'</p>'+
    '<p class="note">Original source observations. Customer acceptance is recorded separately in the existing Support receiving workflow. This private checkpoint includes other integration jobs and does not establish that the original worker has stopped.</p>'+
    '<h2>Selected source</h2>'+table(['Field','Value'],[
      ['Original handover SHA256',report.archive.sha256],['Project revision',report.project.revision],
      ['Project state SHA256',report.project.sha256],['Prepared',report.prepared_at],
      ['Prepared by',report.prepared_by],['Support operator',selection.actor],
      ['Reviewed',selection.recordedAt],['Original Support case',selection.caseId],
      ['Native target jobs pending',report.receiving_state.pending_target_jobs],
      ['Target actions requiring investigation',report.receiving_state.unresolved_target_actions]])+
    '<h2>Implementation tasks</h2>'+table(['ID','Task','Acceptance definition'],selection.taskDefinitions.map(t=>[t.id,t.title,t.acceptance]))+
    '<h2>Selected native operations</h2>'+table(['ID','Stream','Native status','Updated','Native error'],
      report.operations.filter(r=>selection.operationIds.includes(r.id)).map(r=>[r.id,r.stream,r.status,r.updated_at,r.error]))+
    '<h2>Native actions</h2>'+table(['Operation','Resource','Status','Original body SHA256'],
      report.actions.filter(r=>selection.operationIds.includes(r.job_id)).map(r=>[r.job_id,r.resource_id,r.status,r.body_sha256]))+
    '<h2>Retained source editions</h2>'+table(['Source','Edition','Original source SHA256','Effective SHA256'],
      report.source_editions.map(r=>[r.source_id,r.edition_id,r.source_sha256,r.effective_sha256]))+
    '<h2>Operator notes</h2><p>'+escape(selection.notes).replace(/\n/g,'<br>')+'</p>'+
    '<h2>Receiving</h2><p>The original archive and every source member remain in the SF49 bundle. Export the complete case/source package to preserve history and unassigned files. Receiving reopens the original file and repeats the native read-only inspector. A completed query job may contain failed measurements; reviewed, applied, rolled back and accepted are distinct observations.</p></html>\n';
}

function materialOperations(selection,editionId){
  const ids=keys(selection.requestId);
  return [
          {requestId:ids.archive,payload:{id:ids.archiveMaterial,name:selection.source.path.split('/').at(-1),
            mediaType:'application/zip',kind:'deliverable',description:'Complete private original Grafana project/source/provider handover. Native outcomes remain distinct from receiving acceptance.',
            taskIds:selection.taskIds,editionId,reference:'grafana-handover:'+selection.source.sha256,
            sourceFile:{bundleId:selection.source.bundleId,manifestSha256:selection.source.manifestSha256,path:selection.source.path}}},
          {requestId:ids.report,payload:{id:ids.reportMaterial,name:'Grafana_Delivery_Review.html',
            mediaType:'text/html',kind:'observation',description:'Native source and operation inspection, with selected implementation tasks.',
            taskIds:selection.taskIds,editionId,reference:'grafana-handover:'+selection.source.sha256,
            data:Buffer.from(grafanaDeliveryReport(selection)).toString('base64')}}];
}

/** One adapter; SF49 transfers and CaseStore history retain every durable result. */
export async function openGrafanaCaseDelivery({store,sourceDelivery,grafanaSource,
  python=process.env.SCF_PYTHON||'python3',environment=process.env,resolveReceiving=null}={}){
  ensure(store&&typeof store.read==='function'&&sourceDelivery?.service&&
    typeof sourceDelivery.service.attachmentStatus==='function'&&typeof sourceDelivery.previewAttachment==='function',
    'Use the original case store and source delivery with attachment status.');
  ensure(typeof grafanaSource==='string'&&isAbsolute(grafanaSource),'Select the installed original Grafana application source.');
  const source=resolve(grafanaSource),inspector=join(source,'integrations/grafana_handover_inspect.py');
  const selectedInspector=hash(await readFile(inspector));
  ensure((await stat(inspector)).isFile(),'The original Grafana inspector is missing.');
  const active=new Set(),caseOwners=new Set(),cache=new Map();
  let closing=false,closingPromise;
  const available=()=>ensure(!closing,'The original Grafana delivery owner is closing.','GRAFANA_DELIVERY_CLOSING',503);
  function run(work){
    available();
    const controller=new AbortController(),entry={controller,promise:null};
    entry.promise=Promise.resolve().then(()=>{available();return work(controller.signal);}).finally(()=>active.delete(entry));
    active.add(entry);return entry.promise;
  }
  async function selectedCase(id){
    ensure(UUID.test(id),'Select an original saved Support case.');
    const record=await store.read(id),workspace=await parseWorkspace(record.workspaceText);
    return {record,workspace,state:workspace.commissioning??newCommissioning()};
  }
  async function nativeInspect(file,signal){
    stopped(signal);
    ensure(hash(await readFile(inspector))===selectedInspector,
      'The selected original Grafana inspector changed. Reopen the owner with its reviewed source.','GRAFANA_INSPECTOR_CHANGED',409);
    const cacheKey=file.sha256+':'+file.bytes+':'+selectedInspector;
    // The native source resolver has just validated the exact immutable member.
    if(cache.has(cacheKey))return copy(cache.get(cacheKey));
    const result=await new Promise((resolveResult,reject)=>{
      let child,output=[],errors=[],count=0,errorCount=0,ended=false,problem=null,timer;
      const terminate=()=>{
        if(ended||!child?.pid)return;
        try{process.kill(-child.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')problem??=e;}
        timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')problem??=e;}},3000);
        timer.unref?.();
      };
      try{child=spawn(python,['-B','-m','integrations.grafana_handover_inspect','--archive',file.path,
        '--expected-sha256',file.sha256],{cwd:source,env:environment,stdio:['ignore','pipe','pipe'],detached:true});}
      catch(e){reject(e);return;}
      const abort=()=>{problem??=commissioningError('GRAFANA_INSPECTION_STOPPED','The original inspection was stopped.',409);terminate();};
      signal.addEventListener('abort',abort,{once:true});
      child.on('error',e=>{problem??=e;});
      child.stdout.on('data',data=>{count+=data.length;if(count>MAX_REPORT){problem??=commissioningError('GRAFANA_INSPECTION_LIMIT','The complete inspection exceeds 8 MiB.',413);terminate();}else output.push(data);});
      child.stderr.on('data',data=>{errorCount+=data.length;if(errorCount<=65536)errors.push(data);});
      child.once('close',(code,termSignal)=>{
        ended=true;clearTimeout(timer);signal.removeEventListener('abort',abort);
        if(problem){reject(problem);return;}
        const raw=Buffer.concat(output).toString('utf8');let value;
        try{value=JSON.parse(raw);}catch{reject(commissioningError('GRAFANA_INSPECTION_FAILED','The original inspector did not return its complete JSON result.',502));return;}
        if(code!==0||termSignal){reject(commissioningError('GRAFANA_INSPECTION_FAILED',
          typeof value.message==='string'?value.message:'The original inspection failed.',422));return;}
        if(value.schema!=='grafana-support-handover-inspection/1'||value.archive?.sha256!==file.sha256||
          value.archive.bytes!==file.bytes){reject(commissioningError('GRAFANA_INSPECTION_CHANGED','The inspector returned another archive.',409));return;}
        resolveResult({inspection:value,inspectionText:raw,inspectionSha256:hash(raw)});
      });
      if(signal.aborted)abort();
    });
    if(cache.size>=8)cache.delete(cache.keys().next().value);
    cache.set(cacheKey,result);return copy(result);
  }
  async function inspectTransfer(args,signal){
    fields(args,['transferId','memberPath']);
    const transfer=await sourceDelivery.service.get({id:args.transferId});
    ensure(transfer.descriptor&&transfer.state==='READY','Prepare the original SF49 source bundle before inspection.');
    const member=transfer.descriptor.files.find(r=>r.path===args.memberPath);
    ensure(member&&member.role==='grafana-target-handover'&&member.path.startsWith('attachments/'),
      'Select the complete native Grafana handover attachment.');
    const file=await sourceDelivery.resolveFile({bundleId:transfer.descriptor.bundleId,
      manifestSha256:transfer.descriptor.manifestSha256,path:member.path});
    const inspected=await nativeInspect(file,signal);
    return {...inspected,source:{transferId:transfer.id,bundleId:transfer.descriptor.bundleId,
      manifestSha256:transfer.descriptor.manifestSha256,path:member.path,bytes:file.bytes,sha256:file.sha256},
      sourceCase:{id:transfer.caseId,revision:transfer.caseRevision}};
  }
  function validateSelection(value){
    fields(value,['schema','caseId','expectedRevision','requestId','actor','recordedAt','taskIds','operationIds',
      'notes','privateScopeAcknowledged','source','inspectionSha256','inspectionText','taskDefinitions','plan','preparedTaskDefinitions','preparedPlan','workorderChanges']);
    ensure(value.schema===GRAFANA_DELIVERY_SCHEMA&&UUID.test(value.caseId)&&SHA.test(value.expectedRevision)&&
      ID.test(value.requestId)&&SHA.test(value.inspectionSha256)&&value.privateScopeAcknowledged===true,
      'Keep the complete reviewed case delivery selection.');
    text(value.actor,200,'operator');text(value.notes,10000,'notes',{empty:true});
    ensure(typeof value.recordedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value.recordedAt)&&Number.isFinite(Date.parse(value.recordedAt)),
      'Keep the original reviewed UTC time.');
    same(unique(value.taskIds,'task IDs'),value.taskIds,'Task order changed.');
    same(unique(value.operationIds,'operation IDs',1000),value.operationIds,'Operation order changed.');
    ensure(value.taskIds.length>0&&typeof value.inspectionText==='string'&&Buffer.byteLength(value.inspectionText)<=MAX_REPORT&&
      hash(value.inspectionText)===value.inspectionSha256,'The exact native inspection changed.');
    fields(value.source,['transferId','bundleId','manifestSha256','path','bytes','sha256']);
    ensure(typeof value.source.transferId==='string'&&SHA.test(value.source.bundleId)&&SHA.test(value.source.manifestSha256)&&
      SHA.test(value.source.sha256)&&typeof value.source.path==='string'&&Number.isSafeInteger(value.source.bytes),
      'Keep the exact original SF49 member identity.');
    const report=JSON.parse(value.inspectionText);
    ensure(report.schema==='grafana-support-handover-inspection/1'&&report.archive?.sha256===value.source.sha256&&
      report.archive.bytes===value.source.bytes&&value.operationIds.every(id=>report.selected_operation_ids.includes(id)),
      'Select native operations included by the original handover owner.');
    return value;
  }
  async function retainedSelection(context,requestId){
    const ids=keys(requestId),event=context.state.events.find(row=>row.id===ids.intent);
    if(!event)return null;
    ensure(event.type==='add_material'&&event.result?.materialId===ids.intentMaterial,
      'This original request belongs to another case operation.','GRAFANA_DELIVERY_CONFLICT',409);
    const material=context.state.materials.find(row=>row.id===ids.intentMaterial);
    ensure(material&&!material.sourceFile,'The original reviewed delivery material is missing.');
    const selection=JSON.parse(Buffer.from(commissioningFileBytes(context.state,material.sha256)).toString('utf8'));
    validateSelection(selection);
    ensure(selection.requestId===requestId,'The original delivery request differs.');
    if(selection.caseId!==context.record.id){
      ensure(typeof resolveReceiving==='function','Open this case through its original complete-package receiving context.','GRAFANA_RECEIVING_CONTEXT_REQUIRED',409);
      const received=await resolveReceiving({caseId:context.record.id});
      const importedRevision=received?.case?.importedRevision??received?.importedRevision;
      ensure(received?.case?.id===context.record.id&&SHA.test(importedRevision??'')&&UUID.test(received?.sourceCase?.id??''),
        'The original package receiver does not identify this local case.','GRAFANA_RECEIVING_CONTEXT_CHANGED',409);
      const initial=await store.read(context.record.id,importedRevision),initialWorkspace=await parseWorkspace(initial.workspaceText);
      const original=initialWorkspace.commissioning?.materials.find(row=>row.id===ids.intentMaterial);
      const receipt=initialWorkspace.commissioning?.events.find(row=>row.id===ids.intent);
      ensure(original?.sha256===material.sha256&&receipt?.requestSha256===event.requestSha256&&receipt?.type===event.type,
        'The original imported case does not retain this exact delivery selection.','GRAFANA_RECEIVING_CONTEXT_CHANGED',409);
    }
    return selection;
  }
  async function status({caseId,requestId}){
    ensure(ID.test(requestId),'Use the original delivery request ID.');
    const context=await selectedCase(caseId),selection=await retainedSelection(context,requestId);
    if(!selection)return {schema:'stellar-forge.grafana-case-delivery-result.v1',state:'NOT_STARTED',caseId,requestId};
    const ids=keys(requestId),events=Object.fromEntries(['intent','attach','archive','report'].map(k=>
      [k,context.state.events.find(e=>e.id===ids[k])??null]));
    const done=Object.values(events).every(Boolean);
    if(events.attach){
      ensure(events.attach.type==='record_workorder'&&events.attach.actor===selection.actor,
        'The original source attachment receipt belongs to another command.','GRAFANA_DELIVERY_CONFLICT',409);
      const edition=context.state.editions.find(row=>row.id===events.attach.result?.editionId);
      ensure(edition?.sourceBundle?.bundleId===selection.source.bundleId&&
        edition.sourceBundle.manifestSha256===selection.source.manifestSha256,
        'The original attachment receipt identifies another source bundle.','GRAFANA_DELIVERY_CONFLICT',409);
      for(const command of materialOperations(selection,edition.id)){
        if(context.state.events.some(row=>row.id===command.requestId)){
          const replay=await applyCommissioningCommand(context.state,{type:'add_material',
            requestId:command.requestId,actor:selection.actor,recordedAt:selection.recordedAt,
            expectedRevision:context.state.revision,payload:command.payload});
          ensure(replay.replayed,'An original material receipt could not be reconciled.');
        }
      }
    }
    return {schema:'stellar-forge.grafana-case-delivery-result.v1',state:done?'COMPLETE':'NEEDS_CONTINUATION',
      caseId,requestId,sourceCaseId:selection.caseId,caseRevision:context.record.revision,selection,reviewSha256:hash(canonical(selection)),
      editionId:events.attach?.result.editionId??null,
      materialIds:[ids.intentMaterial,...(events.archive?[ids.archiveMaterial]:[]),...(events.report?[ids.reportMaterial]:[])],
      steps:Object.fromEntries(Object.entries(events).map(([k,v])=>[k,v?{requestId:v.id,result:v.result}:null])),
      customerAcceptance:'not recorded by this attachment'};
  }
  const api={
    inspect:args=>run(signal=>inspectTransfer(args,signal)),
    review:args=>run(async signal=>{
      fields(args,['transferId','memberPath','caseId','expectedRevision','requestId','actor','recordedAt',
        'taskIds','operationIds','notes','privateScopeAcknowledged']);
      const context=await selectedCase(args.caseId);
      const retained=ID.test(args.requestId??'')?await retainedSelection(context,args.requestId):null;
      if(retained)throw commissioningError('GRAFANA_DELIVERY_ALREADY_REVIEWED','Reopen the original retained delivery and continue its exact selection.',409);
      ensure(context.record.revision===args.expectedRevision,'The case changed. Review its current task definitions.','CASE_CONFLICT',409);
      const original=await inspectTransfer({transferId:args.transferId,memberPath:args.memberPath},signal);
      ensure(original.sourceCase.id===args.caseId&&original.sourceCase.revision===args.expectedRevision,
        'Prepare the source from the exact saved case revision being reviewed.','GRAFANA_SOURCE_CASE_CHANGED',409);
      const taskIds=unique(args.taskIds,'task IDs'),operationIds=unique(args.operationIds,'operation IDs',1000);
      const prepared=await sourceDelivery.previewAttachment({id:args.transferId,caseId:args.caseId,
        expectedRevision:args.expectedRevision,requestId:keys(args.requestId).attach,actor:args.actor,recordedAt:args.recordedAt});
      const selection=validateSelection({schema:GRAFANA_DELIVERY_SCHEMA,caseId:args.caseId,
        expectedRevision:args.expectedRevision,requestId:args.requestId,actor:args.actor,recordedAt:args.recordedAt,
        taskIds,operationIds,notes:args.notes??'',privateScopeAcknowledged:args.privateScopeAcknowledged,
        source:original.source,inspectionSha256:original.inspectionSha256,inspectionText:original.inspectionText,
        taskDefinitions:taskDefinitions(context.state,taskIds),plan:copy(context.state.plan),
        preparedTaskDefinitions:taskDefinitions(prepared.state,taskIds),preparedPlan:copy(prepared.state.plan),
        workorderChanges:copy(prepared.result)});
      stopped(signal);
      ensure((await store.read(args.caseId)).revision===args.expectedRevision,
        'The case changed during inspection. Review the current saved edition.','CASE_CONFLICT',409);
      return {selection,reviewSha256:hash(canonical(selection)),inspection:original.inspection};
    }),
    apply:args=>run(async signal=>{
      fields(args,['selection','reviewSha256']);const selection=copy(validateSelection(args.selection));
      ensure(args.reviewSha256===hash(canonical(selection)),'The reviewed selection changed.','GRAFANA_REVIEW_CHANGED',409);
      const ids=keys(selection.requestId);
      ensure(!caseOwners.has(selection.caseId),'This case already has an active original Grafana delivery.','GRAFANA_DELIVERY_BUSY',409);
      caseOwners.add(selection.caseId);
      try{
        let context=await selectedCase(selection.caseId),retained=await retainedSelection(context,selection.requestId);
        if(retained)same(retained,selection,'This delivery request retains different original input.');
        const existing=await status({caseId:selection.caseId,requestId:selection.requestId});
        if(existing.state==='COMPLETE')return existing;
        if(!retained){
          ensure(context.record.revision===selection.expectedRevision,'The case changed. Retain a new reviewed selection.','CASE_CONFLICT',409);
          same(taskDefinitions(context.state,selection.taskIds),selection.taskDefinitions,'Selected task definitions changed.');
          same(context.state.plan,selection.plan,'The reviewed implementation plan changed.');
          const actual=await inspectTransfer({transferId:selection.source.transferId,memberPath:selection.source.path},signal);
          same(actual.source,selection.source,'The original source bundle changed.');
          ensure(actual.inspectionSha256===selection.inspectionSha256,'The original native inspection changed.','GRAFANA_REVIEW_CHANGED',409);
          stopped(signal);
          await operateCaseCommissioning(store,{id:selection.caseId,expectedRevision:selection.expectedRevision,
            command:{type:'add_material',requestId:ids.intent,actor:selection.actor,recordedAt:selection.recordedAt,
              expectedRevision:context.state.revision,payload:{id:ids.intentMaterial,name:'Grafana_Delivery_Selection.json',
                mediaType:'application/json',data:encode(selection).toString('base64'),kind:'observation',
                description:'Reviewed original Grafana handover and exact task definitions. Customer acceptance remains separate.',
                taskIds:[],editionId:context.state.activeEditionId,reference:'grafana-handover:'+selection.source.sha256}}});
        }
        context=await selectedCase(selection.caseId);
        if(!context.state.events.some(row=>row.id===ids.attach)){
          same(taskDefinitions(context.state,selection.taskIds),selection.taskDefinitions,'Selected task definitions changed during this delivery; preserve its retained source and resolve the task change.');
          same(context.state.plan,selection.plan,'The original implementation plan changed during this delivery.');
        }
        stopped(signal);
        let attachment=await sourceDelivery.service.attachmentStatus({id:selection.source.transferId,requestId:ids.attach});
        if(!context.state.events.some(row=>row.id===ids.attach)){
          const expected=attachment?.request.expectedRevision??context.record.revision;
          await sourceDelivery.service.attach({id:selection.source.transferId,caseId:selection.caseId,
            expectedRevision:expected,requestId:ids.attach,actor:selection.actor});
        }
        context=await selectedCase(selection.caseId);
        const editionId=context.state.events.find(row=>row.id===ids.attach)?.result?.editionId;
        const edition=context.state.editions.find(row=>row.id===editionId);
        ensure(edition?.sourceBundle?.bundleId===selection.source.bundleId&&
          edition.sourceBundle.manifestSha256===selection.source.manifestSha256,
          'The attached native source workorder differs.','GRAFANA_SOURCE_CASE_CHANGED',409);
        const operations=materialOperations(selection,editionId);
        for(const operation of operations){
          context=await selectedCase(selection.caseId);stopped(signal);
          // A completed native command replays before current edits are compared.
          if(!context.state.events.some(row=>row.id===operation.requestId)){
            same(taskDefinitions(context.state,selection.taskIds),selection.preparedTaskDefinitions,'The received task definitions changed.');
            same(context.state.plan,selection.preparedPlan,'The implementation plan changed.');
          }
          await operateCaseCommissioning(store,{id:selection.caseId,expectedRevision:context.record.revision,
            command:{type:'add_material',requestId:operation.requestId,actor:selection.actor,recordedAt:selection.recordedAt,
              expectedRevision:context.state.revision,payload:operation.payload}});
        }
        return status({caseId:selection.caseId,requestId:selection.requestId});
      }finally{caseOwners.delete(selection.caseId);}
    }),
    inspectCase:args=>run(()=>status(args)),
    list:args=>run(async()=>{
      fields(args,['caseId','offset','limit']);
      const context=await selectedCase(args.caseId),offset=args.offset??0,limit=args.limit??50;
      ensure(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'Select a valid delivery page.');
      const rows=context.state.materials.filter(row=>row.name==='Grafana_Delivery_Selection.json'&&row.id.startsWith('grafana-')&&row.id.endsWith('-intent'));
      const results=[];
      for(const material of rows.slice(offset,offset+limit)){
        const selection=JSON.parse(Buffer.from(commissioningFileBytes(context.state,material.sha256)).toString('utf8'));
        const result=await status({caseId:args.caseId,requestId:selection.requestId});
        results.push({requestId:selection.requestId,actor:selection.actor,recordedAt:selection.recordedAt,
          archiveSha256:selection.source.sha256,state:result.state,taskIds:selection.taskIds,operationIds:selection.operationIds});
      }
      return {caseId:args.caseId,caseRevision:context.record.revision,total:rows.length,offset,limit,
        nextOffset:offset+limit<rows.length?offset+limit:null,rows:results};
    }),
    reopen:args=>run(async signal=>{
      const result=await status(args);
      ensure(result.state==='COMPLETE','Continue this original delivery before reopening its complete receiving source.');
      const value=result.selection;
      const file=await sourceDelivery.resolveFile({bundleId:value.source.bundleId,
        manifestSha256:value.source.manifestSha256,path:value.source.path});
      ensure(file.sha256===value.source.sha256&&file.bytes===value.source.bytes,'The received original archive differs.');
      // Force a fresh original inspector for receiving; never infer it from the
      // previous browser cache or another host's report.
      cache.delete(file.sha256+':'+file.bytes+':'+selectedInspector);
      const inspection=await nativeInspect(file,signal);
      ensure(inspection.inspectionSha256===value.inspectionSha256,
        'The current native inspection differs from the retained original report. Preserve both for operator review.','GRAFANA_RECEIVING_CHANGED',409);
      return {...result,reopened:{archiveSha256:file.sha256,inspectionSha256:inspection.inspectionSha256,
        originalSourceComplete:true,nativeWorkerStarted:false,caseHistoryPreserved:true},
        inspection:inspection.inspection};
    }),
    async close(){
      if(closingPromise)return closingPromise;closing=true;
      closingPromise=(async()=>{const accepted=[...active];for(const row of accepted)row.controller.abort();
        await Promise.allSettled(accepted.map(row=>row.promise));cache.clear();})();
      return closingPromise;
    }
  };
  return api;
}
