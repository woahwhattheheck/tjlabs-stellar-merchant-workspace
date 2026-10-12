// SPDX-License-Identifier: MIT
// The merchant-client leg of the original native analysis commissioning operation.
import { realpathSync, existsSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { acquireDatasetLease } from '../../dataset-refresh/writer-lease.mjs';
import { openA2AWorkspace } from '../workspace.mjs';
import { startA2AMerchant, materializeA2APublication } from '../merchant.mjs';
import { startA2AWorkspaceServer } from '../server.mjs';
import { stageA2APublication } from '../sf82.mjs';
import { loadA2ASdk } from '../transport.mjs';
import { decodePacket, encodePacket, inspectResultPacket } from '../portable.mjs';
import { canonical, clone, sha, atomicFile, readVerifiedFile, privateDirectory, fail } from '../foundation.mjs';
import { readReleaseState, activateRelease, rollbackRelease, runActiveRelease, releaseStatus } from '../../../sf82-seller-pilot/releases.mjs';

export const COMMISSION_SCHEMA='stellar-forge.a2a-merchant-commission.v1';
export const COMMISSION_ID='SCF-A2A-MERCHANT-TASK-WORKSPACE-0C7A-20261012';
const REL='stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/';
const READS=new Set(['capture_card','get_task','list_tasks','subscribe_task','capture_artifacts','adopt_task']);
const TERMINAL=new Set(['TASK_STATE_COMPLETED','TASK_STATE_FAILED','TASK_STATE_CANCELED','TASK_STATE_REJECTED']);
const json=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
function need(value,code){if(!value)fail(code,code,409);}
function maybeJSON(path){try{return json(readVerifiedFile(path));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function summary(receipt){const {project,...retained}=receipt;return retained;}
async function originalCommand(argv,{cwd,env=process.env,maximum=16*1024*1024}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,argv,{cwd,env,stdio:['ignore','pipe','pipe'],shell:false}),stdout=[],stderr=[];
    let size=0,overflow=false;
    child.stdout.on('data',b=>{size+=b.length;if(size>maximum){overflow=true;child.kill('SIGTERM');}else stdout.push(b);});
    child.stderr.on('data',b=>{if(Buffer.concat(stderr).length<65536)stderr.push(b);});
    child.once('error',reject);child.once('exit',(code,signal)=>{
      if(overflow||code!==0){const error=new Error('Original CLI exited without successful completion.');error.code=overflow?'COMMISSION_CLI_LIMIT':'COMMISSION_CLI_FAILED';error.details={code,signal,stderr:Buffer.concat(stderr).toString('utf8')};reject(error);}
      else resolve({stdout:Buffer.concat(stdout),stderr:Buffer.concat(stderr),exitCode:code});
    });
  });
}
function validateFinal(directory,data){
  const result=json(readVerifiedFile(join(directory,'result.json')));
  need(data.finalCandidate&&canonical(result)===canonical(data.finalCandidate),'COMMISSION_RESULT_CHANGED');
  for(const file of result.files){const bytes=readVerifiedFile(join(directory,file.path));need(bytes.length===file.bytes&&sha(bytes)===file.sha256,'COMMISSION_FILE_CHANGED');}
  return result;
}
export async function commissionA2AMerchant({directory,agentUrl,token,procedureId='query_observations_complete',sourceRoot,onProgress,
  playwright=process.env.A2A_RECEIVING_PLAYWRIGHT,chromium=process.env.A2A_RECEIVING_CHROMIUM,expectedRows=660}){
  const root=privateDirectory(directory),actualSource=realpathSync(fileURLToPath(new URL('../../../../../',import.meta.url)));
  need(realpathSync(sourceRoot)===actualSource,'COMMISSION_SOURCE_ROOT_CHANGED');
  const endpoint=new URL(agentUrl);
  need(endpoint.pathname==='/a2a'&&!endpoint.search&&!endpoint.hash&&!endpoint.username&&!endpoint.password&&
    (endpoint.protocol==='https:'||endpoint.protocol==='http:'&&endpoint.hostname==='127.0.0.1'),'COMMISSION_AGENT_URL');
  need(typeof token==='string'&&token.length>=32&&!/\s/.test(token),'COMMISSION_TOKEN');
  need(typeof playwright==='string'&&typeof chromium==='string','COMMISSION_BROWSER_RUNTIME_REQUIRED');
  const selected={operationId:COMMISSION_ID,sourceRoot:actualSource,sourceSha256:sha(readVerifiedFile(fileURLToPath(import.meta.url))),
    agentUrl:endpoint.href,tokenSha256:sha(token),procedureId,expectedRows,
    playwright:resolve(playwright),chromium:resolve(chromium)};
  let workspace,receiver,operator,release,closing=false;
  const envKey='A2A_COMMISSION_'+sha(root).slice(0,20).toUpperCase(),previousEnvironment=process.env[envKey];
  need(previousEnvironment===undefined||previousEnvironment===token,'COMMISSION_CREDENTIAL_REFERENCE_BUSY');
  const owner=await acquireDatasetLease(privateDirectory(join(root,'commission-owner')));
  process.env[envKey]=token;
  const connections=[{id:'commissioned-analysis',label:'Original Hamburg analysis agent',cardUrl:new URL('/.well-known/agent-card.json',endpoint).href,
    allowedOrigins:[endpoint.origin],trustedOrigins:endpoint.protocol==='http:'?[endpoint.origin]:[],artifactOrigins:[],
    credential:{scheme:'Bearer',env:envKey},timeoutMs:30000,streamMs:120000}];
  const journalPath=join(root,'commission.json');
  let data=maybeJSON(journalPath);
  const save=()=>{owner.assertHeld();atomicFile(journalPath,Buffer.from(canonical(data)),{replace:true});};
  const progress=async(stage,details={})=>{data.stage=stage;data.updatedAt=new Date().toISOString();save();if(onProgress)await onProgress({operationId:COMMISSION_ID,stage,...details});};
  const retain=(path,bytes,mediaType='application/json')=>{
    const absolute=join(root,path);need(!relative(root,absolute).startsWith('..'+sep),'COMMISSION_OUTPUT_PATH');
    atomicFile(absolute,bytes);const record={path,bytes:bytes.length,sha256:sha(bytes),mediaType};
    if(data.files[path])need(canonical(data.files[path])===canonical(record),'COMMISSION_OUTPUT_IDENTITY');
    data.files[path]=record;save();return record;
  };
  const project=()=>workspace.get(data.projectId);
  async function action(name,kind,fields={},target=workspace,projectId=data.projectId,{allowFailure=false}={}){
    let step=data.steps[name];
    if(!step){step={name,action:kind,attempts:[]};data.steps[name]=step;}
    need(step.action===kind,'COMMISSION_ACTION_CHANGED');
    let attempt=step.attempts.at(-1),prior=null;
    if(attempt)try{prior=target.request(attempt.payload.requestId);}catch(error){if(error.code!=='REQUEST_NOT_FOUND')throw error;}
    if(attempt&&READS.has(kind)&&['failed','interrupted'].includes(prior?.state)&&attempt.run<data.run){attempt=null;}
    if(!attempt){
      const specific=typeof fields==='function'?fields():fields,payload={requestId:randomUUID(),...clone(specific)};
      if(kind!=='create')Object.assign(payload,{id:projectId,expectedRevision:target.get(projectId).revision});
      attempt={payload,run:data.run};step.attempts.push(attempt);save();
    }
    const response=await target.dispatch(kind,attempt.payload);attempt.receipt=summary(response);save();
    if(response.state!=='complete'&&!allowFailure)need(false,'COMMISSION_'+kind.toUpperCase()+'_'+response.state.toUpperCase());
    return response;
  }
  async function closed(){
    if(closing)return;closing=true;
    const errors=[];
    for(const item of [release,operator,receiver,workspace])if(item)try{await item.close();}catch(error){errors.push(error);}
    release=operator=receiver=workspace=null;
    if(errors.length)throw errors[0];
  }
  async function findTask(name,message,send){
    const p=project();
    let taskId=send.result?.taskId??message.adoptedTaskId??[...p.observations].reverse().find(x=>x.operationId===send.requestId&&x.kind==='task')?.value.id;
    if(!taskId){
      // Reconcile an uncertain original send through native reads; never resend it.
      let pageToken;
      for(let page=0;page<20&&!taskId;page++){
        const listing=await action(name+'-locate-page-'+page,'list_tasks',{pageSize:100,...(pageToken?{pageToken}:{})});
        const observation=[...project().observations].reverse().find(x=>x.operationId===listing.requestId&&x.kind==='task_list');
        need(observation,'COMMISSION_TASK_LIST_MISSING');
        for(const listed of observation.value.tasks??[]){
          const read=await action(name+'-locate-task-'+sha(listed.id).slice(0,24),'get_task',{taskId:listed.id});
          const found=[...project().observations].reverse().find(x=>x.operationId===read.requestId&&x.kind==='task');
          if(found?.value.history?.some(m=>m.messageId===message.native.message.messageId)){
            await action(name+'-adopt-original','adopt_task',{messageId:message.id,taskId:listed.id,note:'Recover the original commissioning message by exact native history and input identity.'});
            taskId=listed.id;break;
          }
        }
        pageToken=observation.value.nextPageToken;if(!pageToken)break;
      }
    }
    need(taskId,'COMMISSION_ORIGINAL_TASK_UNRESOLVED');return taskId;
  }
  async function completeTask(name,input,{stream=false}={}){
    if(data.results[name]){
      const result=data.results[name],observation=project().observations.find(x=>x.id===result.observationId);
      need(observation?.sha256===result.observationSha256&&observation.value.id===result.taskId,'COMMISSION_TASK_SELECTION_CHANGED');
      return observation;
    }
    const prepared=await action(name+'-prepare','prepare_message',()=>({message:{messageId:randomUUID(),role:'ROLE_USER',parts:[{data:input}]},
      configuration:{returnImmediately:true},note:'Commission the original approved '+(input.action==='catalog'?'agent catalog':'complete saved Hamburg query')+' and retain every native output.'}));
    const message=project().messages.find(x=>x.id===prepared.result.messageId);need(message,'COMMISSION_MESSAGE_MISSING');
    const sent=await action(name+'-send','send_message',{messageId:message.id,stream},workspace,data.projectId,{allowFailure:true});
    const taskId=await findTask(name,message,sent);
    let last=[...project().observations].reverse().find(x=>x.kind==='task'&&x.value.id===taskId);
    if(last&&!TERMINAL.has(last.value.status?.state))
      await action(name+'-subscription','subscribe_task',{taskId},workspace,data.projectId,{allowFailure:true});
    const deadline=Date.now()+180000;
    for(let n=0;;n++){
      const got=await action(name+'-get-'+n,'get_task',{taskId});
      last=[...project().observations].reverse().find(x=>x.operationId===got.requestId&&x.kind==='task');
      need(last?.value.id===taskId,'COMMISSION_NATIVE_TASK_CHANGED');
      if(TERMINAL.has(last.value.status?.state)){
        need(last.value.status.state==='TASK_STATE_COMPLETED','COMMISSION_NATIVE_TASK_NOT_COMPLETE');
        data.results[name]={taskId,observationId:last.id,observationSha256:last.sha256};save();return last;
      }
      need(!['TASK_STATE_INPUT_REQUIRED','TASK_STATE_AUTH_REQUIRED'].includes(last.value.status?.state),'COMMISSION_NATIVE_INPUT_REQUIRED');
      need(Date.now()<deadline,'COMMISSION_NATIVE_WAIT_INTERRUPTED');
      await delay(300);
    }
  }
  async function retainTaskResult(name,observation){
    const captured=await action(name+'-capture','capture_artifacts',{observationId:observation.id});
    const capture=project().artifactCaptures.find(x=>x.id===captured.result.captureId);need(capture?.complete,'COMMISSION_CAPTURE_INCOMPLETE');
    const [{types},{receiveCompletedTask}]=await Promise.all([loadA2ASdk(),import(pathToFileURL(join(actualSource,'stellar-forge/a2a-analysis-agent/receive.mjs')).href)]);
    const native=await receiveCompletedTask(join(root,'native-receiver',name),types.Task.fromJSON(observation.value));
    need(capture.files.length===native.files.length,'COMMISSION_NATIVE_ARTIFACT_SET');
    for(const file of capture.files){
      const original=native.files.find(x=>x.artifactId===file.artifactId);
      need(original&&original.bytes===file.bytes&&original.sha256===file.sha256&&original.filename===file.declaredFilename&&original.mediaType===file.declaredMediaType,'COMMISSION_NATIVE_ARTIFACT_IDENTITY');
      const source=workspace.readSource(data.projectId,file.sha256);need(source.bytes.length===file.bytes,'COMMISSION_SOURCE_BYTES');
      retain('artifacts/'+name+'/'+file.filename,source.bytes,file.mediaType);
    }
    data.results[name].captureId=capture.id;data.results[name].files=capture.files;save();return capture;
  }
  async function challenge(name,owner,publication){
    const base=owner.url,url=new URL(publication.service.routes[0].path,base);
    const [healthResponse,offersResponse,response]=await Promise.all([
      fetch(base+'/_seller/health',{redirect:'error'}),fetch(base+'/_seller/offers',{redirect:'error'}),
      fetch(url,{redirect:'error'})
    ]);
    const health=await healthResponse.json(),offers=await offersResponse.json(),body=Buffer.from(await response.arrayBuffer());
    need(healthResponse.ok&&offersResponse.ok&&response.status===402&&health.mode==='CHALLENGE_ONLY'&&owner.mode==='CHALLENGE_ONLY','COMMISSION_ORIGINAL_CHALLENGE');
    need(Array.isArray(offers)&&offers.length===1&&offers[0].resource.url===publication.service.publicOrigin+publication.service.routes[0].path,'COMMISSION_ORIGINAL_OFFER');
    const record={schema:'stellar-forge.a2a-commission-seller.v1',mode:owner.mode,status:response.status,
      publicationId:publication.id,assetSha256:publication.asset.sha256,health,offers,
      paymentRequired:response.headers.get('payment-required'),bodyBase64:body.toString('base64'),
      paymentVerified:false,settlementObserved:false};
    const filename='merchant/'+name+'.json',existing=data.files[filename];
    if(existing){const prior=json(readVerifiedFile(join(root,filename)));need(prior.publicationId===record.publicationId&&prior.assetSha256===record.assetSha256&&prior.status===402&&canonical(prior.offers)===canonical(record.offers),'COMMISSION_CHALLENGE_CHANGED');return prior;}
    retain(filename,Buffer.from(canonical(record)));return record;
  }
  async function selection(name,target,reason,{rollback=false}={}){
    let retained=data.releaseSelections[name];
    if(!retained){const state=await readReleaseState(join(root,'releases'));retained={fromGeneration:state.generation,to:target,reason,rollback};data.releaseSelections[name]=retained;save();}
    const state=await readReleaseState(join(root,'releases'));
    const prior=state.history.find(h=>h.generation===retained.fromGeneration+1&&h.to===target&&h.reason===reason&&h.operation===(rollback?'rollback':'activate'));
    if(prior){retained.result={changed:true,state};save();return state;}
    need(state.generation===retained.fromGeneration,'COMMISSION_RELEASE_SELECTION_CHANGED');
    const result=rollback?await rollbackRelease(join(root,'releases'),{expectedGeneration:state.generation,to:target,reason}):
      await activateRelease(join(root,'releases'),target,{expectedGeneration:state.generation,reason});
    retained.result=result;save();return result.state;
  }
  try{
    if(data){need(data.schema===COMMISSION_SCHEMA&&canonical(data.selection)===canonical(selected),'COMMISSION_SELECTION_CHANGED');if(data.complete)return validateFinal(root,data);}
    else{data={schema:COMMISSION_SCHEMA,operationId:COMMISSION_ID,selection:selected,createdAt:new Date().toISOString(),
      run:0,complete:false,steps:{},results:{},releaseSelections:{},files:{}};save();}
    if(data.finalCandidate){atomicFile(join(root,'result.json'),Buffer.from(canonical(data.finalCandidate)));data.complete=true;save();return validateFinal(root,data);}
    data.run++;save();
    workspace=await openA2AWorkspace({directory:join(root,'workspace'),operator:'A2A commissioning operator',connections});
    const created=await action('create','create',{title:'Hamburg observations — original analysis agent',connectionId:connections[0].id,
      notes:'Complete native query over the retained 28-response, 660-row Hamburg source package; deployment receiving uses unverified demonstration payment terms.'},workspace,null);
    data.projectId=created.result.projectId;save();
    await progress('retaining-original-agent',{projectId:data.projectId});
    const cardResponse=await action('card','capture_card'),card=project().cards.find(c=>c.id===cardResponse.result.cardId);
    need(card&&card.card.supportedInterfaces.some(i=>i.url===endpoint.href),'COMMISSION_CARD_ENDPOINT');
    await action('agent-selection','select_agent',{cardId:card.id,interfaceIndex:card.card.supportedInterfaces.findIndex(i=>i.url===endpoint.href&&i.protocolBinding==='JSONRPC'),skillIds:['analysis_catalog','analysis_run'],extensions:[],
      note:'Select the native SDK JSONRPC interface and original catalog/approved-query skills on the actual retained analysis service.'});
    const catalog=await completeTask('catalog',{action:'catalog'},{stream:true});await retainTaskResult('catalog',catalog);
    await progress('running-original-approved-query',{procedureId});
    const query=await completeTask('query',{action:'run',procedureId,parametersText:'[]'});
    const capture=await retainTaskResult('query',query);
    const jsonl=capture.files.find(f=>/\.jsonl$/.test(f.filename));
    need(jsonl,'COMMISSION_COMPLETE_JSONL_REQUIRED');
    const rows=workspace.readSource(data.projectId,jsonl.sha256).bytes.toString('utf8').split('\n').filter(x=>x.length);
    rows.forEach(row=>JSON.parse(row));need(rows.length===expectedRows,'COMMISSION_ORIGINAL_ROW_COUNT');
    data.results.query.rowCount=rows.length;save();
    await action('accept-query','review_result',{observationId:query.id,captureId:capture.id,decision:'accepted',
      note:'The original SDK completed task, original analysis-record output set and all native hashes match. The complete JSONL contains '+rows.length+' original query rows; CSV/SQLite/manifest remain exact native exports. This reviews delivery completeness, not an independent change to the source measurements.'});
    const frozen=await action('freeze-query','freeze_result',{observationId:query.id,title:'Complete Hamburg observations — reviewed result'});
    data.editionId=frozen.result.editionId;save();
    const packet=workspace.exportResult(data.projectId,data.editionId),inspection=inspectResultPacket(packet.bytes);
    need(inspection.edition.id===data.editionId,'COMMISSION_RESULT_EDITION');retain('handoff/result-v1.json.gz',packet.bytes,packet.mediaType);
    // Exercise the reviewed receiving boundary using the actual completed
    // population. A claimed complete packet with one missing native part fails.
    const omitted=clone(inspection.packet);omitted.capture.files.pop();let missingPartCode=null;
    try{inspectResultPacket(encodePacket(omitted).bytes);}catch(error){missingPartCode=error.code;}
    need(missingPartCode==='RESULT_OUTPUT_COMPLETENESS','COMMISSION_INCOMPLETE_RESULT_ACCEPTED');
    data.resultCompleteness={originalParts:inspection.files.length,omittedParts:omitted.capture.files.length,rejectedWith:missingPartCode};save();
    const termsPath=join(actualSource,'stellar/scf-starforge-20261009/sf30-seller-sdk/sqlite/example-service.json'),termsBytes=readVerifiedFile(termsPath);
    const payment=json(termsBytes).routes[0].definition.payment;
    need(payment.network==='stellar:testnet'&&payment.asset==='UNVERIFIED_DEMO_ASSET'&&payment.payTo==='UNVERIFIED_DEMO_RECIPIENT','COMMISSION_DEMONSTRATION_TERMS_CHANGED');
    retain('sources/original-demo-seller.json',termsBytes);
    const published=await action('publication-v1','prepare_publication',{editionId:data.editionId,title:'Complete Hamburg observations',publicOrigin:'https://merchant.example',routePath:'/a2a/hamburg-observations',payment});
    data.publicationId=published.result.publicationId;save();
    let publication=project().publications.find(x=>x.id===data.publicationId);
    await progress('original-seller-and-release',{publicationId:data.publicationId});
    operator=await startA2AMerchant(workspace,{id:data.projectId,publicationId:data.publicationId,port:0});
    data.seller=await challenge('direct-v1',operator,publication);save();await operator.close();operator=null;
    await stageA2APublication(workspace,{id:data.projectId,publicationId:data.publicationId,releases:join(root,'releases'),releaseId:'hamburg-v1',label:'Original Hamburg result',runtime:{port:0}});
    const changed=await action('freeze-query-v2','freeze_result',{observationId:query.id,title:'Complete Hamburg observations — receiving edition 2'});
    const second=await action('publication-v2','prepare_publication',{editionId:changed.result.editionId,title:'Complete Hamburg observations — receiving edition 2',publicOrigin:'https://merchant.example',routePath:'/a2a/hamburg-observations',payment});
    data.edition2Id=changed.result.editionId;data.publication2Id=second.result.publicationId;save();
    await stageA2APublication(workspace,{id:data.projectId,publicationId:data.publication2Id,releases:join(root,'releases'),releaseId:'hamburg-v2',label:'Second reviewed delivery edition',runtime:{port:0}});
    if(!data.releaseCompleted){
      await selection('activate-v1','hamburg-v1','Commission the original complete Hamburg result.');
      await selection('activate-v2','hamburg-v2','Review the second delivery edition of the same completed original task.');
      await selection('rollback-v1','hamburg-v1','Return to the original reviewed delivery edition.',{rollback:true});
      data.releaseCompleted=true;save();
    }
    if(!data.releaseReadback){
      const state=await readReleaseState(join(root,'releases'));need(state.active==='hamburg-v1','COMMISSION_ACTIVE_RELEASE_CHANGED');
      release=await runActiveRelease(join(root,'releases'),{expectedGeneration:state.generation,handleSignals:false});
      const result=await challenge('sf82-rollback-v1',release,publication);
      await release.close();release=null;
      data.releaseReadback={generation:state.generation,active:state.active,challenge:result,closed:true};save();
    }
    const handoff=await action('handoff-original','create_handoff',{title:'Complete original A2A merchant handoff',notes:'Original task, full native query exports, source-bound review, two fixed publication editions and original request history.'});
    data.handoffId=handoff.result.handoffId;save();
    const first=workspace.exportPacket(data.projectId,{handoffId:data.handoffId});
    retain('handoff/workspace-original.json.gz',first.bytes,first.mediaType);
    receiver=await openA2AWorkspace({directory:join(root,'received'),connections,operator:'Receiving operator'});
    data.receives??={};
    const receive=(name,bytes)=>{const step=data.receives[name]??={requestId:randomUUID(),sha256:sha(bytes)};need(step.sha256===sha(bytes),'COMMISSION_RECEIVING_INPUT_CHANGED');save();const result=receiver.receivePacket(bytes,{requestId:step.requestId});step.result={...result,project:undefined};delete step.result.project;save();return result;};
    const imported=receive('first',first.bytes);need(!receiver.get(data.projectId).networkEnabled,'COMMISSION_RECEIVED_CONNECTION_AUTHORITY');
    const same=receive('same',first.bytes);need(same.status==='already_present','COMMISSION_SAME_RECEIVE');
    await action('delivery-notes','update',{notes:project().notes+'\nThe original seller/SF82 challenge and rollback were observed; no payment verification or settlement is claimed.'});
    const forwardHandoff=await action('handoff-forward','create_handoff',{title:'Reviewed receiving and deployment handoff',notes:'Adds the actual original release receiving decision while preserving the first fixed handoff.'});
    data.forwardHandoffId=forwardHandoff.result.handoffId;save();
    const forward=workspace.exportPacket(data.projectId,{handoffId:data.forwardHandoffId});retain('handoff/workspace-forward.json.gz',forward.bytes,forward.mediaType);
    const advanced=receive('forward',forward.bytes);need(['advanced','already_present'].includes(advanced.status),'COMMISSION_FORWARD_RECEIVE');
    const currentRevision=receiver.get(data.projectId).revision;
    const older=receive('older',first.bytes);need(older.status==='older_retained'&&receiver.get(data.projectId).revision===currentRevision,'COMMISSION_OLDER_RECEIVE');
    need(receiver.exportPacket(data.projectId,{handoffId:data.handoffId}).sha256===first.sha256&&receiver.exportPacket(data.projectId,{handoffId:data.forwardHandoffId}).sha256===forward.sha256,'COMMISSION_NAMED_RECEIVING_BYTES');
    need(receiver.exportResult(data.projectId,data.editionId).sha256===packet.sha256,'COMMISSION_RECEIVED_RESULT_BYTES');
    await receiver.close();receiver=null;
    const source=workspace.readSource(data.projectId,jsonl.sha256);retain('handoff/complete-original-query.jsonl',source.bytes,source.mediaType);
    await workspace.close();workspace=null;
    await progress('original-cli-and-reopen');
    const cli=join(actualSource,REL,'cli.mjs'),cliOut=join(root,'cli-original-handoff.json.gz');
    await originalCommand([cli,'export','--workspace',join(root,'workspace'),'--id',data.projectId,'--handoff',data.handoffId,'--out',cliOut],{cwd:actualSource});
    need(sha(readVerifiedFile(cliOut))===first.sha256,'COMMISSION_CLI_HANDOFF_BYTES');retain('cli-original-handoff.json.gz',readVerifiedFile(cliOut),'application/gzip');
    const cliInspection=await originalCommand([cli,'inspect-result','--input',join(root,'handoff/result-v1.json.gz')],{cwd:actualSource});
    need(json(cliInspection.stdout).edition.id===data.editionId,'COMMISSION_CLI_RESULT_IDENTITY');retain('cli-result-inspection.json',cliInspection.stdout);
    workspace=await openA2AWorkspace({directory:join(root,'workspace'),connections,operator:'A2A commissioning operator'});
    need(workspace.exportPacket(data.projectId,{handoffId:data.handoffId}).sha256===first.sha256,'COMMISSION_REOPEN_CHANGED');
    await progress('desktop-mobile-operator');
    operator=await startA2AWorkspaceServer({workspace,port:data.operatorPort??0});
    if(data.operatorPort)need(new URL(operator.origin).port===String(data.operatorPort),'COMMISSION_OPERATOR_ORIGIN_CHANGED');
    data.operatorPort=Number(new URL(operator.origin).port);save();
    const {receiveA2ABrowser}=await import('./browser.mjs');
    const browser=await receiveA2ABrowser({directory:join(root,'browser'),url:operator.origin,workspaceId:workspace.workspaceId,projectId:data.projectId,
      editionId:data.editionId,handoffId:data.handoffId,handoffSha256:first.sha256,resultSha256:packet.sha256,
      historicalRevision:first.manifest.revision,playwright:selected.playwright,chromium:selected.chromium});
    for(const file of browser.files)retain('browser/'+file.path,readVerifiedFile(join(root,'browser',file.path)),file.mediaType);
    data.browser={complete:browser.complete,files:browser.files,projectId:browser.projectId};save();
    await operator.close();operator=null;await workspace.close();workspace=null;
    const status=await releaseStatus(join(root,'releases'));need(status.runtime.state==='STOPPED','COMMISSION_RELEASE_OWNER_REMAINS');
    await progress('all-original-owners-closed');
    data.finalCandidate={schema:COMMISSION_SCHEMA,operationId:COMMISSION_ID,complete:true,completedAt:new Date().toISOString(),
      selection:selected,projectId:data.projectId,task:data.results.query,editionId:data.editionId,publicationId:data.publicationId,
      handoffId:data.handoffId,forwardHandoffId:data.forwardHandoffId,receives:data.receives,release:data.releaseReadback,
      browser:data.browser,outputCompleteness:data.resultCompleteness,ownersClosed:true,payment:{mode:'CHALLENGE_ONLY',verified:false,settled:false},
      files:Object.values(data.files).sort((a,b)=>a.path.localeCompare(b.path))};
    save();atomicFile(join(root,'result.json'),Buffer.from(canonical(data.finalCandidate)));data.complete=true;save();
    return validateFinal(root,data);
  }catch(error){
    if(data&&!data.complete){data.lastError={code:error.code??'COMMISSION_FAILED',stage:data.stage??null,at:new Date().toISOString()};try{save();}catch{}}
    throw error;
  }finally{
    try{await closed();}finally{if(previousEnvironment===undefined)delete process.env[envKey];else process.env[envKey]=previousEnvironment;await owner.close();}
  }
}
