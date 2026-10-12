// SPDX-License-Identifier: MIT
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {AgentEvent} from '@a2a-js/sdk/server';
import {Role,TaskState} from '@a2a-js/sdk';
import {PLAN_SCHEMA,need,object,exactKeys,canonical,digest,sha,safeError,parametersText,
  procedureRecord,allowedProcedures,publicProcedure,HASH} from './config.mjs';
import {verifyProcedure,readOriginalJob,matchJob,readCompleteFile} from './native.mjs';
import {scopeKey} from './task-store.mjs';

const originalId=()=>randomBytes(16).toString('hex');
const terminal=new Set([TaskState.TASK_STATE_COMPLETED,TaskState.TASK_STATE_CANCELED,
  TaskState.TASK_STATE_FAILED,TaskState.TASK_STATE_REJECTED]);
export const isTerminal=task=>terminal.has(task?.status?.state);
const plainPart=text=>({content:{$case:'text',value:text},mediaType:'text/plain',filename:'',metadata:{}});
const now=()=>new Date().toISOString();
function requestValue(message){
  need(message?.role===Role.ROLE_USER&&Array.isArray(message.parts)&&message.parts.length===1,
    'A2A_ANALYSIS_ONE_USER_REQUEST_REQUIRED');
  const part=message.parts[0];let value;
  if(part.content?.$case==='data')value=part.content.value;
  else if(part.content?.$case==='text'){
    try{value=JSON.parse(part.content.value);}catch{need(false,'A2A_ANALYSIS_REQUEST_JSON_REQUIRED');}
  }
  need(object(value),'A2A_ANALYSIS_REQUEST_OBJECT_REQUIRED');
  if(value.action==='catalog'||value.action==='resume')exactKeys(value,['action']);
  else if(value.action==='run')exactKeys(value,['action','procedureId','parametersText'],['action','procedureId']);
  else need(false,'A2A_ANALYSIS_ACTION_UNKNOWN');
  return value;
}
function originalSummary(job){
  const result={id:job.id,kind:job.kind,status:job.status};
  if(job.error)result.error=job.error;
  if(job.result?.result_sha256)result.resultSha256=job.result.result_sha256;
  if(job.result?.manifest_sha256)result.manifestSha256=job.result.manifest_sha256;
  return result;
}
function recoverable(code){
  return /SERVICE_UNAVAILABLE|REPLY_UNCERTAIN|CALL_INTERRUPTED|SELECTED_VIEWS_CHANGED|DATASET_SQL_VIEWS_CHANGED|TASK_SAVE_TIMEOUT/.test(code);
}

export class AnalysisExecutor {
  constructor({config,native,taskStore}){
    this.config=config;this.native=native;this.store=taskStore;
    this.running=new Map();this.buses=new WeakMap();this.closing=false;
  }
  isRunning(context,id){return this.running.has(scopeKey(context,id));}
  entryFor(context,id){return this.running.get(scopeKey(context,id));}
  check(entry){
    need(!entry.cancelRequested,'A2A_ANALYSIS_CANCEL_REQUESTED');
    need(!entry.pauseRequested&&!this.closing,'A2A_ANALYSIS_SERVER_RESTART');
  }
  message(entry,text){
    return {role:Role.ROLE_AGENT,messageId:randomUUID(),taskId:entry.taskId,contextId:entry.contextId,
      parts:[plainPart(text)],metadata:{},extensions:[],referenceTaskIds:[]};
  }
  metadata(entry){
    return {analysis:{schema:PLAN_SCHEMA,plan:entry.plan??null,stage:entry.stage,
      nativeJobs:entry.nativeJobs??[],result:entry.result??null,
      ...(entry.reason?{reason:entry.reason}:{}),
      ...(entry.cancelRequested?{cancelRequested:true}:{}),
      ...(entry.cancelResult?{originalCancellation:entry.cancelResult}:{})}};
  }
  async status(entry,state,text){
    const task=await this.store.publish(AgentEvent.statusUpdate({
      taskId:entry.taskId,contextId:entry.contextId,
      status:{state,timestamp:now(),...(text?{message:this.message(entry,text)}:{})},
      metadata:this.metadata(entry)
    }),entry.bus,entry.context);
    entry.task=task;return task;
  }
  async rememberCall(entry,key,operation,request){
    this.check(entry);
    const selected={operation,request:structuredClone(request)};
    if(entry.plan.calls[key]){
      need(canonical(entry.plan.calls[key])===canonical(selected),'A2A_ANALYSIS_RETAINED_CALL_CHANGED');
    }else{
      entry.plan.calls[key]=selected;entry.stage=key;
      await this.status(entry,TaskState.TASK_STATE_WORKING);
    }
    this.check(entry);
    return selected;
  }
  async runJob(entry,key,operation,request){
    const selected=await this.rememberCall(entry,key,operation,request);
    let job=await readOriginalJob(this.native,entry.plan.procedure.workspace,request.id,entry.abort.signal);
    let waiting=false;
    while(!job){
      this.check(entry);
      // The exact original request is committed to the SDK task before this POST.
      // Original AnalysisWorkspace.start itself makes repeated IDs idempotent.
      try{job=await this.native.call(entry.plan.procedure.workspace,operation,selected.request,entry.abort.signal);}
      catch(error){
        if(entry.cancelRequested||entry.pauseRequested)throw error;
        const retained=await readOriginalJob(this.native,entry.plan.procedure.workspace,request.id,entry.abort.signal);
        if(retained){job=retained;break;}
        if((error.code??error.message)!=='ANALYSIS_JOB_RUNNING')throw error;
        if(!waiting){
          entry.stage='waiting_for_original_workspace';
          await this.status(entry,TaskState.TASK_STATE_WORKING,'Waiting for the original analysis workspace to finish its current job.');
          waiting=true;
        }
        await delay(this.config.pollMs,undefined,{signal:entry.abort.signal});
        job=await readOriginalJob(this.native,entry.plan.procedure.workspace,request.id,entry.abort.signal);
      }
    }
    let previous;
    for(;;){
      this.check(entry);matchJob(job,operation,request);
      const summary=originalSummary(job),keyValue=canonical(summary);
      if(keyValue!==previous){
        entry.nativeJobs=entry.nativeJobs.filter(v=>v.id!==job.id).concat(summary);previous=keyValue;
        entry.stage=key;await this.status(entry,TaskState.TASK_STATE_WORKING);
      }
      if(job.status==='COMPLETE')return job;
      if(!['RUNNING','QUEUED','PENDING'].includes(job.status)){
        const code=/^[A-Z0-9_]{1,180}$/.test(job.error??'')?job.error:'A2A_ANALYSIS_ORIGINAL_JOB_'+job.status;
        const error=new Error(code);error.code=code;throw error;
      }
      await delay(this.config.pollMs,undefined,{signal:entry.abort.signal});
      job=await readOriginalJob(this.native,entry.plan.procedure.workspace,request.id,entry.abort.signal);
      need(job,'A2A_ANALYSIS_ORIGINAL_JOB_DISAPPEARED');
    }
  }
  async artifact(entry,filename,raw,mediaType,metadata={}){
    this.check(entry);
    const artifactId=sha(entry.taskId+'\n'+filename);
    const artifact={artifactId,name:filename,description:'Complete retained output.',
      parts:[{content:{$case:'raw',value:raw},filename,mediaType:mediaType||'application/octet-stream',metadata:{}}],
      metadata:{...metadata,sha256:sha(raw),bytes:raw.length},extensions:[]};
    const task=await this.store.publish(AgentEvent.artifactUpdate({
      taskId:entry.taskId,contextId:entry.contextId,artifact,append:false,lastChunk:true,
      metadata:this.metadata(entry)
    }),entry.bus,entry.context);
    entry.task=task;return artifact;
  }
  async originalFile(entry,filename,operation,request,expected){
    need(/^[A-Za-z0-9_.-]{1,240}$/.test(filename)&&HASH.test(expected.sha256??'')&&
      Number.isSafeInteger(expected.bytes)&&expected.bytes>=0,'A2A_ANALYSIS_NATIVE_OUTPUT_INVALID');
    const remaining=entry.plan.procedure.maxOutputBytes-entry.outputBytes;
    need(expected.bytes<=remaining,'A2A_ANALYSIS_COMPLETE_OUTPUT_LIMIT');
    const artifactId=sha(entry.taskId+'\n'+filename);
    const retained=entry.task.artifacts?.find(v=>v.artifactId===artifactId);
    if(retained&&retained.metadata?.sha256===expected.sha256&&retained.metadata?.bytes===expected.bytes&&
      retained.parts?.length===1&&retained.parts[0].content?.$case==='raw'){
      const bytes=Buffer.from(retained.parts[0].content.value);
      need(bytes.length===expected.bytes&&sha(bytes)===expected.sha256,'A2A_ANALYSIS_RETAINED_ARTIFACT_CHANGED');
      entry.outputBytes+=bytes.length;
      entry.outputs.push({filename,artifactId,bytes:bytes.length,sha256:expected.sha256,
        mediaType:retained.parts[0].mediaType,originalJobId:request.id});
      return;
    }
    this.check(entry);
    const file=await readCompleteFile(this.native,entry.plan.procedure.workspace,operation,
      {...request,sha256:expected.sha256},{maxBytes:remaining,signal:entry.abort.signal});
    need(file.bytes===expected.bytes&&file.sha256===expected.sha256,'A2A_ANALYSIS_NATIVE_OUTPUT_CHANGED');
    const artifact=await this.artifact(entry,filename,file.data,file.contentType,{
      originalJobId:request.id,originalWorkspaceId:entry.plan.procedure.workspaceId});
    entry.outputBytes+=file.bytes;
    entry.outputs.push({filename,artifactId:artifact.artifactId,bytes:file.bytes,sha256:file.sha256,
      mediaType:file.contentType,originalJobId:request.id});
  }
  async query(entry){
    const p=entry.plan.procedure,queryRequest={id:entry.plan.ids.query,sql:p.query.sql,
      parameters_text:entry.plan.parametersText,max_rows:p.query.max_rows,expected_views:p.views};
    // Verify the selected saved recipe only before the first original query has been retained.
    if(!entry.plan.calls.query)await verifyProcedure(this.native,p,entry.abort.signal);
    const query=await this.runJob(entry,'query','query',queryRequest);
    const resultSha=query.result?.result_sha256;need(HASH.test(resultSha??''),'A2A_ANALYSIS_QUERY_RESULT_INVALID');
    const exportRequest={id:entry.plan.ids.export,query_id:query.id,result_sha256:resultSha,
      label:p.name.slice(0,160).trim(),formats:p.formats,timeout:p.timeoutSeconds,
      max_rows:null,max_output_bytes:p.maxOutputBytes,spreadsheet_safe:true};
    const exported=await this.runJob(entry,'queryExport','query-export',exportRequest);
    need(exported.result?.manifest?.queryComplete===true&&Array.isArray(exported.result.files)&&
      exported.result.source_query?.id===query.id&&exported.result.source_query?.result_sha256===resultSha,
      'A2A_ANALYSIS_COMPLETE_NATIVE_EXPORT_REQUIRED');
    const expectedNames=p.formats.map(format=>({jsonl:'rows.jsonl',csv:'rows.csv',sqlite:'rows.sqlite3'})[format])
      .concat('manifest.json').sort();
    need(canonical(exported.result.files.map(f=>f.name).sort())===canonical(expectedNames),
      'A2A_ANALYSIS_NATIVE_EXPORT_SET_CHANGED');
    need(exported.result.files.reduce((n,f)=>n+f.bytes,0)<=p.maxOutputBytes,
      'A2A_ANALYSIS_COMPLETE_OUTPUT_LIMIT');
    for(const file of exported.result.files){
      entry.stage='receive_'+file.name;
      await this.originalFile(entry,file.name,'query-export-file',{id:exported.id,filename:file.name},file);
    }
    entry.result={kind:'query',originalWorkspaceId:p.workspaceId,queryId:query.id,
      queryResultSha256:resultSha,exportId:exported.id,manifestSha256:exported.result.manifest_sha256,
      rowCount:exported.result.manifest.rowCount,queryComplete:true,outputs:entry.outputs};
  }
  async publication(entry,report){
    const p=entry.plan.procedure,key='publish';
    for(;;){
      this.check(entry);
      if(!entry.plan.calls[key]){
        const reviewed=await this.native.call(p.workspace,'report-read',{id:report.id,limit:1},entry.abort.signal);
        await this.rememberCall(entry,key,'publish',{report_id:report.id,id:entry.plan.ids.publication,
          result_sha256:report.result.result_sha256,expected_revision:reviewed.publication_revision,
          note:'Retained A2A analytical task '+entry.taskId});
      }
      const selected=entry.plan.calls[key];
      let published;
      try{published=await this.native.call(p.workspace,'publish',selected.request,entry.abort.signal);}
      catch(error){
        if((error.code??error.message)!=='ANALYSIS_REPORT_PUBLICATION_CHANGED')throw error;
        // This exact native error proves that the requested publication ID was absent
        // and its expected head lost the original transaction CAS. Retain that attempt,
        // read the current head and retry through the same publication authority.
        entry.plan.publicationAttempts=[...(entry.plan.publicationAttempts??[]),selected];
        delete entry.plan.calls[key];continue;
      }
      need(published.id===entry.plan.ids.publication&&published.job_id===report.id&&
        published.result_sha256===report.result.result_sha256,'A2A_ANALYSIS_PUBLICATION_CHANGED');
      let before;const seen=new Set();
      for(;;){
        const page=await this.native.call(p.workspace,'publications',{name:p.report.definition.name,
          ...(before===undefined?{}:{before})},entry.abort.signal);
        const found=page.publications?.find(v=>v.publication?.id===published.id);
        if(found){
          need(HASH.test(found.sha256??'')&&canonical(found.publication)===canonical(published),
            'A2A_ANALYSIS_PUBLICATION_CHANGED');
          return {publication:found.publication,sha256:found.sha256};
        }
        need(page.next_before!==null&&page.next_before!==undefined&&!seen.has(page.next_before),
          'A2A_ANALYSIS_PUBLICATION_NOT_RETAINED');
        seen.add(page.next_before);before=page.next_before;
      }
    }
  }
  async report(entry){
    const p=entry.plan.procedure;
    if(!entry.plan.calls.report)await verifyProcedure(this.native,p,entry.abort.signal);
    const report=await this.runJob(entry,'report','report',{id:entry.plan.ids.report,
      name:p.report.definition.name,revision:p.report.definition.revision,
      definition_sha256:p.report.sha256,expected_views:p.views});
    need(HASH.test(report.result?.result_sha256??''),'A2A_ANALYSIS_REPORT_RESULT_INVALID');
    const publication=await this.publication(entry,report);
    const exports=[];
    for(const format of p.formats){
      const exported=await this.runJob(entry,'reportExport_'+format,'report-export',{
        id:entry.plan.ids.exports[format],publication_id:publication.publication.id,
        publication_sha256:publication.sha256,format});
      need(exported.result?.publication_id===publication.publication.id&&
        exported.result.publication_sha256===publication.sha256&&exported.result.format===format,
        'A2A_ANALYSIS_REPORT_EXPORT_CHANGED');
      exports.push(exported);
    }
    need(exports.reduce((n,v)=>n+v.result.bytes,0)<=p.maxOutputBytes,'A2A_ANALYSIS_COMPLETE_OUTPUT_LIMIT');
    for(const exported of exports){
      entry.stage='receive_report_'+exported.result.format;
      await this.originalFile(entry,exported.result.filename,'file',{id:exported.id},exported.result);
    }
    entry.result={kind:'report',originalWorkspaceId:p.workspaceId,reportId:report.id,
      reportResultSha256:report.result.result_sha256,publication:publication.publication,
      publicationSha256:publication.sha256,outputs:entry.outputs};
  }
  async cancelOriginal(plan){
    const call=plan?.calls?.queryExport;
    if(!call)return {status:'NO_QUERY_EXPORT_STARTED'};
    try{
      const job=await readOriginalJob(this.native,plan.procedure.workspace,call.request.id);
      if(!job)return {id:call.request.id,status:'NOT_FOUND'};
      matchJob(job,'query-export',call.request);
      if(job.status!=='RUNNING')return originalSummary(job);
      const cancelled=await this.native.call(plan.procedure.workspace,'cancel-query-export',{id:job.id});
      return originalSummary(cancelled);
    }catch(error){return {id:call.request.id,status:'REQUEST_UNCONFIRMED',error:safeError(error)};}
  }
  async cancelTask(taskId,eventBus){
    const entry=this.buses.get(eventBus);
    need(entry?.taskId===taskId,'A2A_ANALYSIS_TASK_EXECUTION_UNAVAILABLE');
    entry.cancelRequested=true;entry.abort.abort();
    if(entry.active)return; // The original cancel handler now starts its event drain.
    entry.cancelResult=await this.cancelOriginal(entry.plan);
    entry.stage='cancelled';
    // No active executor consumes this sleeping bus. Publish without awaiting a save:
    // the SDK CancelTask drain begins when this callback returns.
    eventBus.publish(AgentEvent.statusUpdate({taskId,contextId:entry.contextId,
      status:{state:TaskState.TASK_STATE_CANCELED,timestamp:now(),message:this.message(entry,'Task cancelled.')},
      metadata:this.metadata(entry)}));
  }
  async execute(requestContext,eventBus){
    const key=scopeKey(requestContext.context,requestContext.taskId);
    need(!this.running.has(key),'A2A_ANALYSIS_TASK_ALREADY_RUNNING');
    const entry={taskId:requestContext.taskId,contextId:requestContext.contextId,context:requestContext.context,
      bus:eventBus,task:requestContext.task,abort:new AbortController(),active:true,stage:'request',
      plan:structuredClone(requestContext.task?.metadata?.analysis?.plan??null),
      nativeJobs:structuredClone(requestContext.task?.metadata?.analysis?.nativeJobs??[]),
      cancelRequested:requestContext.task?.metadata?.analysis?.cancelRequested===true,
      cancelResult:structuredClone(requestContext.task?.metadata?.analysis?.originalCancellation??null),
      outputBytes:0,outputs:[]};
    this.running.set(key,entry);this.buses.set(eventBus,entry);
    entry.done=new Promise(resolve=>{entry.resolve=resolve;});
    try{
      const initial={id:entry.taskId,contextId:entry.contextId,
        status:requestContext.task?.status??{state:TaskState.TASK_STATE_SUBMITTED,timestamp:now()},
        history:requestContext.task?.history??[],artifacts:requestContext.task?.artifacts??[],
        metadata:{...requestContext.task?.metadata,...this.metadata(entry)}};
      entry.task=await this.store.publish(AgentEvent.task(initial),eventBus,entry.context);
      this.check(entry); // Reconcile a retained cancellation before another original call.
      const request=requestValue(requestContext.userMessage),procedures=allowedProcedures(this.config,entry.context);
      if(request.action==='catalog'){
        need(!requestContext.task,'A2A_ANALYSIS_NEW_CATALOG_TASK_REQUIRED');
        const raw=Buffer.from(JSON.stringify({schema:PLAN_SCHEMA,procedures:procedures.map(publicProcedure)},null,2)+'\n');
        await this.artifact(entry,'catalog.json',raw,'application/json');this.check(entry);
        entry.stage='complete';await this.status(entry,TaskState.TASK_STATE_COMPLETED,'Available analytical procedures returned.');return;
      }
      if(request.action==='resume'){
        need(entry.plan?.schema===PLAN_SCHEMA,'A2A_ANALYSIS_RETAINED_PLAN_REQUIRED');
        need(procedures.some(p=>p.id===entry.plan.procedure.id),'A2A_ANALYSIS_PROCEDURE_ACCESS_CHANGED');
        need(digest(procedureRecord(entry.plan.procedure))===entry.plan.procedureSha256,
          'A2A_ANALYSIS_RETAINED_PROCEDURE_CHANGED');
      }else{
        need(!requestContext.task&&!entry.plan,'A2A_ANALYSIS_USE_RESUME_FOR_EXISTING_TASK');
        const configured=procedures.find(p=>p.id===request.procedureId);
        need(configured,'A2A_ANALYSIS_PROCEDURE_UNKNOWN');
        const procedure=procedureRecord(configured);
        if(request.parametersText!==undefined)need(procedure.kind==='query'&&procedure.allowParameters,
          'A2A_ANALYSIS_PROCEDURE_PARAMETERS_FIXED');
        const ids=procedure.kind==='query'?{query:originalId(),export:originalId()}:
          {report:originalId(),publication:originalId(),exports:Object.fromEntries(procedure.formats.map(f=>[f,originalId()]))};
        entry.plan={schema:PLAN_SCHEMA,procedure,procedureSha256:digest(procedure),ids,calls:{},
          ...(procedure.kind==='query'?{parametersText:parametersText(request.parametersText??procedure.query.parameters_text)}:{})};
      }
      entry.stage='selected';
      await this.status(entry,TaskState.TASK_STATE_WORKING,'Running the selected analytical procedure.');
      this.check(entry);
      if(entry.plan.procedure.kind==='query')await this.query(entry);else await this.report(entry);
      this.check(entry);entry.stage='complete';
      const record={schema:PLAN_SCHEMA,taskId:entry.taskId,contextId:entry.contextId,
        procedure:entry.plan.procedure,procedureSha256:entry.plan.procedureSha256,
        ...(entry.plan.parametersText!==undefined?{parametersText:entry.plan.parametersText}:{}),
        nativeJobs:entry.nativeJobs,result:entry.result};
      await this.artifact(entry,'analysis-record.json',Buffer.from(JSON.stringify(record,null,2)+'\n'),'application/json');
      this.check(entry);
      await this.status(entry,TaskState.TASK_STATE_COMPLETED,
        'Analysis complete. '+entry.outputs.length+' complete original files and the analysis record are available.');
    }catch(error){
      entry.reason=safeError(error);
      if(entry.cancelRequested){
        entry.stage='cancelling';
        await this.status(entry,TaskState.TASK_STATE_WORKING);
        entry.cancelResult=await this.cancelOriginal(entry.plan);entry.stage='cancelled';
        await this.status(entry,TaskState.TASK_STATE_CANCELED,'Task cancelled; original job IDs retained.');
      }else if(entry.pauseRequested||this.closing||recoverable(entry.reason)){
        entry.stage='resume_available';
        try{
          await this.status(entry,TaskState.TASK_STATE_INPUT_REQUIRED,
            'The task is retained. Send {"action":"resume"} on this task to continue its original jobs. '+entry.reason);
        }catch(persistenceError){
          // An unacknowledged pause event must not throw into the SDK's executor-failure
          // path and make a previously saved working task terminal. Its original drain
          // can still commit this event; GetTask/resume reopens the last saved plan.
          console.error(JSON.stringify({event:'analysis_pause_save_unconfirmed',taskId:entry.taskId,
            error:safeError(persistenceError)}));
        }
      }else{
        entry.stage='failed';
        await this.status(entry,entry.plan?TaskState.TASK_STATE_FAILED:TaskState.TASK_STATE_REJECTED,
          'The analytical operation returned '+entry.reason+'.');
      }
    }finally{
      entry.active=false;this.running.delete(key);entry.resolve();
    }
  }
  async close(){
    this.closing=true;
    const entries=[...this.running.values()];
    for(const entry of entries){entry.pauseRequested=true;entry.abort.abort();}
    await Promise.all(entries.map(entry=>entry.done));
  }
}
