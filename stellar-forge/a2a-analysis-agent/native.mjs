// SPDX-License-Identifier: MIT
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {createNativeAnalysis} from '../mcp-paid-agent/native-analysis.mjs';
import {need,canonical,digest,queryRecord,viewSelection,procedureRecord,privateDirectory,SCHEMA,HASH,sha} from './config.mjs';

export async function openOriginalAnalysis(config){
  const directory=await privateDirectory(join(config.directory,'native-analysis'),{create:true});
  const original=createNativeAnalysis({manifest:{directory}});
  try{
    for(const w of config.workspaces){
      const received=await original.register({name:w.name,database:w.database});
      need(received.workspaceId===w.workspaceId,'A2A_ANALYSIS_WORKSPACE_ID_CHANGED');
    }
    return {
      async call(workspace,operation,request={},signal){
        const response=await original.call({action:'analysis',analysisWorkspace:workspace,
          analysisOperation:operation,analysisRequest:request},signal?{signal}:{});
        need(response.schema==='stellar-forge.mcp-native-analysis.v1'&&response.analysisWorkspace===workspace&&
          response.operation===operation,'A2A_ANALYSIS_NATIVE_RESPONSE_CHANGED');
        return response.result;
      },
      close:()=>original.close()
    };
  }catch(error){await original.close();throw error;}
}

const procedureId=(kind,name)=>kind+'_'+(name.length<=56?name:name.slice(0,40)+'_'+sha(name).slice(0,12));

export async function captureConfiguration({directory,database,workspace='customer',queries=[],reports=[],
  publicUrl,name='Stellar Forge Analysis',description='Complete analyses from selected source editions.',
  tokenEnv='A2A_ANALYSIS_TOKEN',principal='operator',maxOutputBytes=16*1024*1024,timeoutSeconds=300,
  port=41242,host='127.0.0.1',allowParameters=false}){
  await privateDirectory(directory,{create:true});
  const nativeDirectory=await privateDirectory(join(directory,'native-analysis'),{create:true});
  const original=createNativeAnalysis({manifest:{directory:nativeDirectory}});
  try{
    const registration=await original.register({name:workspace,database});
    const call=async(operation,request={})=>(await original.call({action:'analysis',analysisWorkspace:workspace,
      analysisOperation:operation,analysisRequest:request})).result;
    const state=await call('state'),views=viewSelection(state.views),procedures=[];
    for(const selected of queries){
      const query=queryRecord(await call('saved-query',selected));
      procedures.push(procedureRecord({id:procedureId('query',query.name),kind:'query',workspace,
        workspaceId:registration.workspaceId,name:query.name,description:'Run saved query '+query.name+
          ' revision '+query.revision+' against the selected original source editions.',
        views,query,allowParameters,formats:['jsonl','csv','sqlite'],maxOutputBytes,timeoutSeconds}));
    }
    for(const selected of reports){
      const report=await call('report-definition',selected);
      procedures.push(procedureRecord({id:procedureId('report',report.definition.name),kind:'report',workspace,
        workspaceId:registration.workspaceId,name:report.definition.title,
        description:'Run report '+report.definition.name+' revision '+report.definition.revision+
          ' in one original database snapshot, then receive its complete exports.',
        views,report:{definition:report.definition,sha256:report.sha256},
        formats:['json','html','csv'],maxOutputBytes,timeoutSeconds}));
    }
    need(canonical((await call('state')).views)===canonical(views),'A2A_ANALYSIS_SELECTION_CHANGED_DURING_CAPTURE');
    return {schema:SCHEMA,name,description,directory,publicUrl,listen:{host,port},
      workspaces:[{name:workspace,database,workspaceId:registration.workspaceId}],
      principals:[{name:principal,tokenEnv,procedures:['*']}],procedures,pollMs:500};
  }finally{await original.close();}
}

export async function verifyProcedure(native,p,signal){
  const state=await native.call(p.workspace,'state',{},signal);
  need(state.workspace_id===p.workspaceId,'A2A_ANALYSIS_WORKSPACE_ID_CHANGED');
  need(canonical(state.views)===canonical(p.views),'A2A_ANALYSIS_SELECTED_VIEWS_CHANGED');
  if(p.kind==='query'){
    const current=queryRecord(await native.call(p.workspace,'saved-query',
      {name:p.query.name,revision:p.query.revision},signal));
    need(digest(current)===digest(p.query),'A2A_ANALYSIS_SAVED_QUERY_CHANGED');
  }else{
    const current=await native.call(p.workspace,'report-definition',
      {name:p.report.definition.name,revision:p.report.definition.revision},signal);
    need(current.sha256===p.report.sha256&&canonical(current.definition)===canonical(p.report.definition),
      'A2A_ANALYSIS_REPORT_DEFINITION_CHANGED');
  }
  return {workspaceId:state.workspace_id,procedureSha256:digest(procedureRecord(p)),views:p.views};
}

export async function readOriginalJob(native,workspace,id,signal){
  try{return await native.call(workspace,'job',{id,limit:1},signal);}
  catch(error){if((error.code??error.message)==='ANALYSIS_JOB_NOT_FOUND')return undefined;throw error;}
}

export function matchJob(job,operation,request){
  need(job?.id===request.id&&job.kind===operation&&job.request?.id===request.id,
    'A2A_ANALYSIS_ORIGINAL_JOB_CHANGED');
  for(const [key,value] of Object.entries(request)){
    need(canonical(job.request[key])===canonical(value),'A2A_ANALYSIS_ORIGINAL_JOB_REQUEST_CHANGED');
  }
  return job;
}

export async function readCompleteFile(native,workspace,operation,request,{maxBytes,signal,onProgress}={}){
  let first,offset=0,bytes,hash=createHash('sha256');
  for(;;){
    const selected={...request,byteOffset:offset,maxBytes:65536};
    if(first)selected.sha256=first.sha256;
    const response=await native.call(workspace,operation,selected,signal),file=response?.file;
    need(file?.verifiedSavedFile===true&&file.encoding==='base64'&&HASH.test(file.sha256??'')&&
      Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.byteOffset===offset&&
      Number.isSafeInteger(file.returnedBytes)&&file.returnedBytes>=0&&file.returnedBytes<=65536,
      'A2A_ANALYSIS_ORIGINAL_FILE_INVALID');
    if(!first){
      need(Number.isSafeInteger(maxBytes)&&file.bytes<=maxBytes,'A2A_ANALYSIS_COMPLETE_OUTPUT_LIMIT');
      first={bytes:file.bytes,sha256:file.sha256,contentType:file.contentType};
      bytes=Buffer.alloc(file.bytes);
    }
    need(file.bytes===first.bytes&&file.sha256===first.sha256&&file.contentType===first.contentType,
      'A2A_ANALYSIS_ORIGINAL_FILE_CHANGED');
    const chunk=Buffer.from(file.data,'base64');
    need(chunk.length===file.returnedBytes&&chunk.toString('base64')===file.data&&
      offset+chunk.length<=first.bytes,'A2A_ANALYSIS_ORIGINAL_FILE_RANGE_INVALID');
    chunk.copy(bytes,offset);hash.update(chunk);offset+=chunk.length;
    if(onProgress)await onProgress({bytes:offset,total:first.bytes});
    if(file.nextByteOffset===null){
      need(offset===first.bytes,'A2A_ANALYSIS_ORIGINAL_FILE_INCOMPLETE');break;
    }
    need(chunk.length>0&&file.nextByteOffset===offset&&offset<first.bytes,
      'A2A_ANALYSIS_ORIGINAL_FILE_CURSOR_INVALID');
  }
  need(hash.digest('hex')===first.sha256,'A2A_ANALYSIS_ORIGINAL_FILE_DIGEST_CHANGED');
  return {...first,bytes:bytes.length,data:bytes};
}
