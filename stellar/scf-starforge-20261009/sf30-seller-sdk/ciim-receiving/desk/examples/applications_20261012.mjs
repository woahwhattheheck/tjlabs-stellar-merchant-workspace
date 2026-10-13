// MIT. Open the original received CIIM desk through the maintained Applications model.
// This operation consumes an actual READY installation and the existing receiving case.
import {createHash,randomUUID} from 'node:crypto';
import {readFile,lstat,open,link,unlink} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {openRuntimeWorkspace} from '../../../../distribution/runtime-workspace/model.mjs';
import {openCiimDesk} from '../model.mjs';
import {privateDirectory,acquireWorkspace,atomicJson} from '../../../postgres/publisher/files.mjs';

const ORIGINAL='CIIM-METADATA-RECEIVING-DESK-ADC6-20261012';
const OPERATION=ORIGINAL+':applications';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(value,code,message)=>{if(!value)throw Object.assign(new Error(message),{code});};
const emit=(event,value={})=>process.stdout.write(JSON.stringify({event,operation:OPERATION,...value})+'\n');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const read=async file=>JSON.parse(await readFile(file,'utf8'));
async function exists(file){try{return await lstat(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function describeFile(file){const h=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(file)){bytes+=chunk.length;h.update(chunk);}return {bytes,sha256:h.digest('hex')};}
function publicRun(run){return {id:run.id,phase:run.phase,active:run.active,createdAt:run.createdAt,stop:run.stop??null,result:run.result??null};}

/**
 * Use the same root as receiving_20261012.mjs after its direct server has closed.
 * runtimeWorkspace/runtimeId are the original runtime console's saved selection.
 * onOpen may inspect the actual private URL in the same browser carrier; its
 * result is retained, while the capability URL stays with Applications.
 */
export async function runApplicationsReceiving({
  root,runtimeWorkspace,runtimeId,python,timeoutMs=180000,onOpen,
}={}){
  need(root&&runtimeWorkspace&&runtimeId&&typeof python==='string'&&isAbsolute(python),'APPLICATION_INPUT_REQUIRED',
    'Supply the original receiving root, actual runtime-workspace directory, selected READY runtime ID and absolute existing Python executable.');
  root=resolve(root);runtimeWorkspace=resolve(runtimeWorkspace);
  need(Number.isSafeInteger(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=900000,
    'APPLICATION_TIMEOUT_INVALID','Use a receiving timeout from 1000 through 900000 milliseconds.');
  const native=await read(join(root,'native-result.json'));
  need(native.operation===ORIGINAL&&['native_complete','browser_complete','browser_needs_continuation'].includes(native.status),
    'ORIGINAL_RECEIVING_REQUIRED','Open the completed original receiving case before its Applications continuation.');
  const workspace=join(root,'desk'),markerBytes=await readFile(join(workspace,'desk.json')),marker=JSON.parse(markerBytes);
  need(marker.workspaceId===native.workspaceId,'ORIGINAL_DESK_CHANGED','The selected directory has a different original desk identity.');
  const directory=join(root,'applications-receiving');
  await privateDirectory(directory,true);
  const release=await acquireWorkspace(directory);
  let model;
  try{
    const inputs={runtimeWorkspace,runtimeId,workspace,workspaceId:marker.workspaceId,markerSha256:hash(markerBytes),python};
    const resultPath=join(directory,'result.json');
    let result=await exists(resultPath)?await read(resultPath):{
      schema:'tjl.ciim.desk-applications-receiving.v1',operation:OPERATION,
      inputs,status:'in_progress',phases:{},requests:{},attempts:[],
    };
    need(result.operation===OPERATION&&isDeepStrictEqual(result.inputs,inputs),
      'APPLICATION_RECEIVING_INPUT_CHANGED','Continue with this operation’s original runtime, Python selection and desk marker.');
    const save=()=>atomicJson(directory,'result.json',result);
    const attempt={startedAt:new Date().toISOString(),node:process.version};
    result.attempts.push(attempt);await save();
    async function phase(name,work){
      if(result.phases[name]?.status==='complete')return result.phases[name].value;
      emit('APPLICATION_PHASE_START',{phase:name});
      try{
        const value=await work();
        result.phases[name]={status:'complete',completedAt:new Date().toISOString(),value};
        await save();emit('APPLICATION_PHASE_COMPLETE',{phase:name});
        return value;
      }catch(error){
        result.status='needs_continuation';
        result.currentFailure={phase:name,code:error.code??null,message:error.message,at:new Date().toISOString()};
        await save();throw error;
      }
    }
    async function request(name,make){
      if(result.requests[name])return result.requests[name];
      const value=await make();result.requests[name]=value;await save();return value;
    }
    model=await openRuntimeWorkspace({directory:runtimeWorkspace});
    const runtimeState=await model.state({runtimeId});
    need(runtimeState.runtimes.some(value=>value.id===runtimeId),
      'ORIGINAL_RUNTIME_NOT_SELECTED','Choose the actual attached installation from the original runtime workspace.');
    if(result.runtimeWorkspaceId)need(result.runtimeWorkspaceId===runtimeState.workspaceId,
      'RUNTIME_WORKSPACE_CHANGED','The original runtime workspace identity changed.');
    else{result.runtimeWorkspaceId=runtimeState.workspaceId;await save();}
    if(result.status==='complete'){
      emit('APPLICATION_RECEIVING_REOPENED',{resultFile:resultPath,applicationId:result.applicationId,workspaceId:marker.workspaceId});
      return result;
    }
    const baseline=await phase('original-desk-before-applications',async()=>{
      const desk=await openCiimDesk({directory:workspace,python});
      try{
        const state=desk.state();
        need(state.workspaceId===marker.workspaceId&&state.editions.length===3&&
          state.editions.reduce((n,edition)=>n+edition.counts.records,0)===569,
        'ORIGINAL_POPULATION_CHANGED','The retained three-edition receiving case must contain all 569 original observations.');
        return state;
      }finally{await desk.close();}
    });
    const review=await phase('review-actual-installed-application',async()=>{
      const value=await model.applicationsReview({
        runtimeId,kind:'ciim-receiving-desk',label:'CIIM original metadata receiving',
        settings:{workspaceDirectory:workspace,pythonExecutable:python,port:0},
      });
      need(value.runtimeId===runtimeId&&value.kind==='ciim-receiving-desk'&&value.command.command==='ciim-desk',
        'APPLICATION_REVIEW_CHANGED','The native review selected a different application or runtime.');
      need(value.command.args.includes('--expected-workspace-id')&&value.command.args.includes(marker.workspaceId)&&
        value.command.args.includes('--expected-marker-sha256')&&value.command.args.includes(inputs.markerSha256),
      'APPLICATION_MARKER_NOT_BOUND','The selected command must retain the original workspace marker.');
      return value;
    });
    result.runtime=review.runtime;await save();
    const saveRequest=await request('save',()=>({
      requestId:randomUUID(),reviewId:review.id,applicationId:null,
    }));
    const saved=await phase('save-original-application-request',()=>model.applicationsSave(saveRequest));
    need(saved.applicationId&&saved.saved,'APPLICATION_SAVE_RECEIPT_REQUIRED','The original application save has no receipt.');
    result.applicationId=saved.applicationId;await save();
    const applicationId=saved.applicationId;
    async function selected(){
      const state=await model.applicationsState({historyLimit:50});
      const application=state.applications.find(value=>value.id===applicationId);
      need(application&&application.kind==='ciim-receiving-desk'&&application.runtimeId===runtimeId,
        'APPLICATION_SELECTION_CHANGED','The original Applications selection is missing or changed.');
      return application;
    }
    async function waitFor(label,readState,ready){
      const end=Date.now()+timeoutMs;let lastEvent=0;
      for(;;){
        const value=await readState();
        if(ready(value))return value;
        if(Date.now()-lastEvent>10000){
          emit('APPLICATION_WAIT',{phase:label,state:value.phase??null,operationId:value.id??null});
          lastEvent=Date.now();
        }
        need(Date.now()<end,'APPLICATION_CONTINUATION_PENDING',
          'The original '+label+' is still retained. Continue this same receiving command and its original operation.');
        await pause(1000);
      }
    }
    await phase('connect-original-installed-release',async()=>{
      const connected=await model.applicationsConnect({applicationId});
      const value=await waitFor('managed adoption',selected,item=>Boolean(item.release));
      need(value.release.id&&value.release.digest&&value.home?.id,
        'APPLICATION_RELEASE_MISSING','The original managed release was not retained.');
      return {connection:connected,release:value.release,home:value.home,phase:value.phase};
    });
    const guideFile=fileURLToPath(new URL('../DESK_OPERATOR_GUIDE.md',import.meta.url));
    const expectedGuide=await describeFile(guideFile);
    const downloadDirectory=join(directory,'downloads');await privateDirectory(downloadDirectory,true);
    async function download(origin,token,path,name,expected){
      const response=await fetch(origin+path,{headers:{'X-CIIM-Session':token}});
      need(response.ok,'APPLICATION_DOWNLOAD_FAILED','The installed original download failed with HTTP '+response.status+'.');
      const target=join(downloadDirectory,name),temporary=target+'.'+randomUUID()+'.pending';
      const f=await open(temporary,'wx',0o600),h=createHash('sha256');let bytes=0;
      try{for await(const chunk of response.body){bytes+=chunk.length;h.update(chunk);await f.writeFile(chunk);}await f.sync();}
      catch(error){await f.close();await unlink(temporary).catch(()=>{});throw error;}
      await f.close();const actual={bytes,sha256:h.digest('hex')};
      try{
        const declared=response.headers.get('x-content-sha256');
        if(declared)need(declared===actual.sha256,'APPLICATION_DOWNLOAD_CHANGED','The original download SHA differs.');
        const length=response.headers.get('content-length');
        if(length)need(Number(length)===bytes,'APPLICATION_DOWNLOAD_INCOMPLETE','The complete original download did not arrive.');
        if(expected)need(isDeepStrictEqual(actual,{bytes:expected.bytes,sha256:expected.sha256}),
          'APPLICATION_DOWNLOAD_CHANGED','The installed original file differs from the retained receiving edition.');
        try{await link(temporary,target);}
        catch(error){if(error.code!=='EEXIST')throw error;need(isDeepStrictEqual(await describeFile(target),actual),
          'APPLICATION_DOWNLOAD_REPLACED','Preserve the existing complete receiving file.');}
      }finally{await unlink(temporary).catch(()=>{});}
      return {file:name,...actual,mime:response.headers.get('content-type')};
    }
    async function cycle(name){
      if(result.phases[name+'-stopped']?.status==='complete')return result.phases[name+'-opened'].value;
      const startReview=await phase(name+'-start-review',()=>model.applicationsStartReview({applicationId}));
      const startRequest=await request(name+'-start',()=>({applicationId,requestId:randomUUID(),reviewId:startReview.id}));
      await phase(name+'-original-start-request',()=>model.applicationsStart(startRequest));
      const operationId=startRequest.requestId;
      async function originalRun(){
        const value=await selected(),run=value.runs.find(item=>item.id===operationId);
        need(run,'APPLICATION_RUN_MISSING','The selected original managed run is missing.');
        return run;
      }
      async function finishStop(){
        return phase(name+'-stopped',async()=>{
          const stopRequest={applicationId,operationId};
          await request(name+'-stop',()=>stopRequest);
          let current=await originalRun();
          if(!current.stop)await model.applicationsStop(stopRequest);
          current=await waitFor(name+' stop',originalRun,value=>!value.active&&!value.privateUrl&&Boolean(value.stop));
          return {applicationId,operationId,run:publicRun(current)};
        });
      }
      if(result.phases[name+'-opened']?.status==='complete'){
        await finishStop();return result.phases[name+'-opened'].value;
      }
      let run=await originalRun();
      need(!run.stop,'APPLICATION_STOPPED_BEFORE_RECEIVING',
        'The original managed run stopped before its receiving observation; retain its history and reopen the application explicitly.');
      if(!run.active&&!run.stop&&!run.privateUrl&&['QUEUED','INTERRUPTED','FAILED','PENDING'].includes(run.phase)){
        const recovery={applicationId,operationId};
        result.recoveries??=[];result.recoveries.push({request:recovery,at:new Date().toISOString(),before:publicRun(run)});
        await save();await model.applicationsRecover(recovery);
      }
      run=await waitFor(name+' start',originalRun,value=>Boolean(value.privateUrl&&value.active));
      const opened=await phase(name+'-opened',async()=>{
        const originalUrl=new URL(run.privateUrl),origin=originalUrl.origin,token=originalUrl.hash.slice(1);
        need(/^[a-f0-9]{64}$/.test(token)&&['127.0.0.1','[::1]','localhost'].includes(originalUrl.hostname),
          'APPLICATION_NATIVE_URL_REQUIRED','Open the original retained private capability URL from Applications.');
        async function get(path){
          const response=await fetch(origin+path,{headers:{'X-CIIM-Session':token}});
          const value=await response.json();
          need(response.ok,'APPLICATION_HTTP_ERROR',value.error?.message??'The original installed operation failed.');
          return value;
        }
        const launch=await get('/api/launch'),state=await get('/api/state');
        need(launch.workspaceId===marker.workspaceId&&launch.markerSha256===inputs.markerSha256&&
          new URL(launch.url).origin===origin,'APPLICATION_LIVE_BINDING_CHANGED','The live installed listener differs from its retained marker.');
        need(isDeepStrictEqual(state,baseline),'APPLICATION_RECEIVING_STATE_CHANGED',
          'Opening the installed application must preserve the complete original receiving state.');
        let rows=0;const populations=[];
        for(const edition of state.editions){
          const ids=new Set();let total;
          for(let offset=0;;offset+=250){
            const page=await get('/api/view?'+new URLSearchParams({view:'records',editionId:edition.id,offset:String(offset),limit:'250'}));
            if(total===undefined)total=page.total;
            need(page.total===total,'APPLICATION_POPULATION_CHANGED','The original record population changed while opening.');
            for(const item of page.items){need(!ids.has(item.id),'APPLICATION_DUPLICATE_ROW','An original record was returned twice.');ids.add(item.id);}
            if(offset+page.items.length>=total)break;
            need(page.items.length>0,'APPLICATION_POPULATION_INCOMPLETE','The original record page ended before its declared population.');
          }
          need(ids.size===edition.counts.records,'APPLICATION_POPULATION_INCOMPLETE','The installed original population is incomplete.');
          rows+=ids.size;populations.push({editionId:edition.id,records:ids.size,populationDigest:edition.populationDigest});
        }
        need(rows===569,'APPLICATION_POPULATION_CHANGED','The installed source population differs from the original case.');
        const guide=await download(origin,token,'/operator-guide.md',name+'-operator-guide.md',expectedGuide);
        const handback=await download(origin,token,'/api/export/handback?'+new URLSearchParams({handbackId:native.handbacks.first}),
          name+'-original-handback.zip',native.firstHandbackExport);
        const workspaceExport=await download(origin,token,'/api/export/workspace',name+'-complete-workspace.zip',
          name==='reopen'?result.phases['first-opened'].value.workspaceExport:null);
        let browser=null;
        if(onOpen)browser=await onOpen({name,url:run.privateUrl,applicationId,operationId,workspaceId:marker.workspaceId,source:review.runtime});
        const current=await get('/api/state');
        need(isDeepStrictEqual(current,baseline),'APPLICATION_OBSERVATION_CHANGED_STATE',
          'This original Applications receiving continuation inspects the retained case without changing its review decisions.');
        if(name==='reopen')need(origin===result.phases['first-opened'].value.origin,
          'APPLICATION_ORIGIN_CHANGED','The original saved listener must reopen on the same browser origin.');
        return {applicationId,operationId,origin,workspaceId:marker.workspaceId,revision:state.revision,
          markerSha256:launch.markerSha256,records:rows,populations,guide,handback,workspaceExport,browser};
      });
      await finishStop();
      return opened;
    }
    await cycle('first');
    // Reopen the actual console model before starting its same saved application.
    await model.close();model=await openRuntimeWorkspace({directory:runtimeWorkspace});
    await cycle('reopen');
    const finalDesk=await openCiimDesk({directory:workspace,python});
    try{need(isDeepStrictEqual(finalDesk.state(),baseline),'APPLICATION_REOPEN_CHANGED_STATE',
      'The complete original receiving workspace did not reopen unchanged.');}
    finally{await finalDesk.close();}
    const final=await selected();
    result.status='complete';result.completedAt=new Date().toISOString();delete result.currentFailure;
    result.final={applicationId,workspaceId:marker.workspaceId,revision:baseline.revision,records:569,
      release:final.release,home:final.home,runs:final.runs.filter(run=>Object.values(result.requests)
        .some(request=>request.requestId===run.id)).map(publicRun)};
    await save();emit('APPLICATION_RECEIVING_COMPLETE',{resultFile:resultPath,applicationId,
      workspaceId:marker.workspaceId,records:569,phases:Object.keys(result.phases).length});
    return result;
  }finally{await model?.close();await release();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),input={};
  const keys={'--root':'root','--runtime-workspace':'runtimeWorkspace','--runtime-id':'runtimeId','--python':'python','--timeout-ms':'timeoutMs'};
  for(let i=0;i<args.length;i+=2){need(keys[args[i]]&&args[i+1],'APPLICATION_ARGUMENT_INVALID',
    'Use --root, --runtime-workspace, --runtime-id, --python and optional --timeout-ms.');input[keys[args[i]]]=args[i]==='--timeout-ms'?Number(args[i+1]):args[i+1];}
  runApplicationsReceiving(input).catch(error=>{emit('APPLICATION_RECEIVING_FAILED',{code:error.code??null,message:error.message});process.exitCode=1;});
}
