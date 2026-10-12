// MIT. Continue the original CIIM receiving case through its live connected client.
// The existing server remains the only model writer. No transformer is invoked.
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,lstat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {privateDirectory,readPrivate,readJson,atomicJson,acquireWorkspace} from '../../../postgres/publisher/files.mjs';
import {startCiimDeskServer} from '../server.mjs';
import {openConnectedCiimDesk,inspectConnectedPending,describeConnectedDeskOperations,executeConnectedDeskOperation} from '../connected-client.mjs';

export const OPERATION='CIIM-METADATA-RECEIVING-DESK-ADC6-20261012';
const CASE_SHA='26f5cc490aef1e2b292a55e04ba2372d3ca4e2703f8b32bc2d5b52a89c81a91c';
const CASE_BYTES=15587672;
const ACTOR='ADC6 / Commons receiving operator';
const SOURCE='https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/150';
const NOTE='Completed the connected operator receiving continuation over the same original metadata, named authorities and reviewed scope.';
const need=(value,message)=>{if(!value)throw new Error(message);};
const digest=body=>createHash('sha256').update(body).digest('hex');
const event=(name,data={})=>process.stdout.write(JSON.stringify({event:name,operation:OPERATION,...data})+'\n');
const safeError=error=>({code:error.code??null,message:String(error.message)});
async function optional(path){try{return await readJson(path,32*1024*1024);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function fileHash(path){
 const stat=await lstat(path);need(stat.isFile()&&!stat.isSymbolicLink(),'Use the retained original regular file.');
 const h=createHash('sha256');let bytes=0;
 for await(const part of createReadStream(path)){bytes+=part.length;h.update(part);}
 const after=await lstat(path);need(bytes===stat.size&&after.size===stat.size&&after.mtimeMs===stat.mtimeMs&&after.ctimeMs===stat.ctimeMs,'The original file changed during reading.');
 return {bytes,sha256:h.digest('hex')};
}
function command(args){
 return new Promise((done,reject)=>{
  let output='',errors='',failed=false;
  const child=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe'],shell:false});
  const timer=setTimeout(()=>{failed=true;child.kill('SIGTERM');},600000);
  child.stdout.on('data',data=>{output+=data;if(Buffer.byteLength(output)>32*1024*1024){failed=true;child.kill('SIGTERM');}});
  child.stderr.on('data',data=>{errors=(errors+data).slice(-65536);});
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',code=>{clearTimeout(timer);if(failed||code!==0){reject(new Error('The original connected CLI did not finish: '+code+' '+errors));return;}
   try{done(JSON.parse(output));}catch{reject(new Error('The original connected CLI did not return complete JSON.'));}
  });
 });
}
const scope=context=>({institution:context.institution,receivingEnvironment:context.receivingEnvironment,
 processingProfile:context.processingProfile,authorities:context.authorities});
function population(state){
 return state.editions.map(e=>({id:e.id,nativeEditionId:e.nativeEditionId,populationDigest:e.populationDigest,
  sourceSha256:e.sourceSha256,manifestSha256:e.manifestSha256,counts:e.counts})).sort((a,b)=>a.id.localeCompare(b.id));
}

export async function runConnectedReceiving({root,python='python3'}={}){
 need(typeof root==='string'&&resolve(root)===root&&root!=='/','Use the absolute original receiving root.');
 await privateDirectory(root);
 const directory=join(root,'connected-receiving');
 await privateDirectory(directory,true);
 const release=await acquireWorkspace(directory);
 let running=null,client=null,connectionFile=null,journalDirectory=null,activeWorkspace=null;
 const nativePath=join(root,'native-result.json'),resultPath=join(directory,'result.json');
 let native,result;
 const requests=join(directory,'requests'),outputs=join(directory,'files'),journals=join(directory,'journals');
 const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
 const connectionCli=fileURLToPath(new URL('../connected-cli.mjs',import.meta.url));
 const save=()=>atomicJson(directory,'result.json',result);
 async function stop(){
  if(client){const old=client;client=null;await old.close();}
  if(running){const old=running;running=null;await old.close();}
 }
 async function start(workspace){
  await stop();
  await privateDirectory(workspace);
  const markerRaw=await readPrivate(join(workspace,'desk.json'),65536),marker=JSON.parse(markerRaw);
  need(marker.workspaceId===native.workspaceId,'The continuation selected a different original receiving workspace.');
  running=await startCiimDeskServer({directory:workspace,python});
  connectionFile=running.connectionFile;
  need(connectionFile===join(workspace,'desk-connection.json'),'The original server returned a different connection file.');
  // A relocated receiving carrier gets its own physical journal. The retained
  // original operation body is replayed; an older journal is never rewritten.
  journalDirectory=join(journals,digest(workspace));
  client=await openConnectedCiimDesk({connectionFile,journalDirectory,expectedWorkspaceId:marker.workspaceId,
   expectedMarkerSha256:digest(markerRaw)});
  activeWorkspace=workspace;
  const binding=await client.connection();
  need(binding.workspaceId===native.workspaceId,'The connected listener differs from the original marker.');
  return binding;
 }
 async function phase(name,work){
  if(result.phases[name]?.status==='complete')return result.phases[name].value;
  event('CONNECTED_PHASE_START',{phase:name});
  try{
   const value=await work();result.phases[name]={status:'complete',completedAt:new Date().toISOString(),value};
   await save();event('CONNECTED_PHASE_COMPLETE',{phase:name});return value;
  }catch(error){
   result.status='needs_continuation';result.currentFailure={phase:name,...safeError(error),recordedAt:new Date().toISOString()};
   await save();event('CONNECTED_PHASE_FAILED',{phase:name,...safeError(error)});throw error;
  }
 }
 async function originalRequest(key,type,data){
  const filename=digest(key)+'.json',old=await optional(join(requests,filename));
  if(old){need(old.type===type&&isDeepStrictEqual(old.data,data),'Preserve the unchanged original connected request.');return old;}
  const state=await client.state();
  const request={operationId:OPERATION+':connected:'+digest(key).slice(0,24),expectedRevision:state.revision,actor:ACTOR,type,data};
  await atomicJson(requests,filename,request);return request;
 }
 async function assertScope(){
  const current=await client.state();
  need(current.workspaceId===result.workspaceId&&isDeepStrictEqual(scope(current.context),result.reviewedScope)&&
   current.contextDigest===result.contextDigest&&isDeepStrictEqual(population(current),result.population),
   'The original metadata population or named receiving scope changed.');
  need(current.editions.every(e=>e.readiness.ready),'The accepted original receiving scope is no longer ready.');
  return current;
 }
 async function invoke(args,{connected=true}={}){
  return command([connected?cli:connectionCli,...(connected?['connected']:[]),...args,
   '--connection',connectionFile,'--requests',journalDirectory]);
 }
 async function exactDownload(descriptor){
  const actual=await fileHash(descriptor.file);
  need(actual.bytes===descriptor.bytes&&actual.sha256===descriptor.sha256,'The complete connected output differs from its descriptor.');
  return descriptor;
 }
 async function checkpoint(){
  if(!native||!result)return;
  const primary=join(root,'desk');
  if(activeWorkspace!==primary||!client)await start(primary);
  const state=await assertScope();
  const path=join(outputs,'workspace-r'+state.revision+'.zip');
  const exported=await exactDownload(await client.exportWorkspace({out:path}));
  const first=await exactDownload(await client.exportHandback({handbackId:native.handbacks.first,
   out:join(outputs,'original-first-handback.zip')}));
  need(first.sha256===native.firstHandbackExport.sha256&&first.bytes===native.firstHandbackExport.bytes,
   'The original immutable first handback changed.');
  result.checkpoint={...exported,workspaceId:state.workspaceId,revision:state.revision};
  result.firstHandback={...first,handbackId:native.handbacks.first};
  result.state=state;await save();
  native=await readJson(nativePath,32*1024*1024);
  native.workspace=primary;native.workspaceExport={...exported,kind:'workspace',revision:state.revision};
  native.state=state;native.connected={status:result.status,result:'connected-receiving/result.json',
   revision:state.revision,completedAt:result.completedAt??null};
  await atomicJson(root,'native-result.json',native);
  event('CONNECTED_CHECKPOINT_READY',{resultFile:resultPath,workspaceId:state.workspaceId,
   revision:state.revision,workspaceExport:result.checkpoint,firstHandbackSha256:first.sha256});
 }
 try{
  for(const path of [requests,outputs,journals])await privateDirectory(path,true);
  native=await readJson(nativePath,32*1024*1024);
  need(native.operation===OPERATION&&['native_complete','browser_complete','browser_needs_continuation'].includes(native.status),
   'Complete the original native receiving and save its checkpoint before this continuation.');
  need(native.original.bytes===CASE_BYTES&&native.original.sha256===CASE_SHA,'The original native input differs.');
  const checkpointReceipt=await optional(join(root,'delivery','checkpoint-library-result.json'));
  need(checkpointReceipt?.returncode===0&&checkpointReceipt.result?.results?.length&&
   checkpointReceipt.result.results.every(x=>x.status==='succeeded'&&x.local_metadata_applied),
   'Save the complete native receiving checkpoint before this connected continuation.');
  const archive=join(root,'original','CIIM-Proteus-native-receiving-case.zip'),original=await fileHash(archive);
  need(original.bytes===CASE_BYTES&&original.sha256===CASE_SHA,'The complete accepted original input differs.');
  const primary=join(root,'desk');
  result=await optional(resultPath)??{schema:'tjl.ciim.connected-operated-receiving.v1',operation:OPERATION,
   workspaceId:native.workspaceId,original:{...original,libraryFileId:native.original.libraryFileId},
   status:'in_progress',phases:{},attempts:[]};
  need(result.operation===OPERATION&&result.workspaceId===native.workspaceId&&result.original.sha256===CASE_SHA,
   'This continuation belongs to another original case.');
  const source=[];
  for(const path of ['../connected-client.mjs','../connected-cli.mjs','../cli.mjs','../server.mjs','../archive.py','./connected_20261012.mjs']){
   const file=fileURLToPath(new URL(path,import.meta.url));
   source.push({file:path,...await fileHash(file)});
  }
  result.attempts.push({startedAt:new Date().toISOString(),root,node:process.version,python,source,reference:SOURCE});
  result.status='in_progress';await save();
  const started=await start(primary),initial=await client.state();
  if(!result.population){
   result.population=population(initial);result.reviewedScope=scope(initial.context);result.contextDigest=initial.contextDigest;
   result.startRevision=initial.revision;await save();
  }
  await assertScope();
  await phase('connected-catalogue-and-original-live-writer',async()=>{
   const described=await command([cli,'connected','operations']);
   const original=describeConnectedDeskOperations(),status=await invoke(['status']);
   need(isDeepStrictEqual(described,original),'The original CLI typed catalogue differs from the connected API.');
   need(status.workspaceId===native.workspaceId&&status.revision===initial.revision,
    'The connected CLI selected a different original live writer.');
   return {workspaceId:status.workspaceId,revision:status.revision,origin:started.origin,
    operations:described.operations.map(item=>item.name)};
  });
  await phase('complete-source-population-and-original-record',async()=>{
   const descriptions=describeConnectedDeskOperations(),remote=await client.describe(),cliState=await invoke(['status']);
   need(cliState.workspaceId===native.workspaceId&&cliState.revision===(await client.state()).revision,'The connected CLI opened a different live state.');
   const summaries=[];let total=0;
   for(const edition of initial.editions){
    const seen=new Set();let offset=0,pageTotal;
    for(;;){
     const page=await client.view({view:'records',editionId:edition.id,offset,limit:83});
     need(page.revision===(await client.state()).revision,'The source population changed during the connected read.');
     if(pageTotal===undefined)pageTotal=page.total;
     need(page.total===pageTotal&&page.populationDigest===edition.populationDigest,'The complete original edition changed during pagination.');
     for(const row of page.items){need(!seen.has(row.id),'The original record appeared twice.');seen.add(row.id);}
     offset+=page.items.length;if(offset>=page.total)break;need(page.items.length>0,'The connected result stopped before full population coverage.');
    }
    need(seen.size===edition.counts.records,'The connected read omitted original records.');
    total+=seen.size;summaries.push({editionId:edition.id,records:seen.size,populationDigest:edition.populationDigest});
   }
   need(total===569,'The original three-edition record population changed.');
   const record=await executeConnectedDeskOperation(client,{name:'desk.record',arguments:{editionId:native.editions.datacite,recordId:native.recordSelection.firstDatacite}});
   need(record.observationId===record.native.observation.id&&record.identifier===record.native.observation.identifier,
    'The connected original record/observation identity differs.');
   return {records:total,editions:summaries,workspaceId:cliState.workspaceId,revision:cliState.revision,
    remoteSchema:remote.schema,operationNames:descriptions.operations.map(o=>o.name),
    record:{id:record.id,identifier:record.identifier,recordSha256:record.recordSha256}};
  });
  await phase('complete-streamed-original-import',async()=>{
   const before=await client.state();
   const candidate=await client.prepareImport({archiveFile:archive,filename:'CIIM-Proteus-native-receiving-case.zip',...original});
   need(candidate.kind==='native'&&candidate.sha256===CASE_SHA&&candidate.bytes===CASE_BYTES&&candidate.editions.length===3,
    'The streamed original archive differs from its exact native input.');
   need(new Set(candidate.existingEditionIds).size===3&&candidate.editions.reduce((n,e)=>n+e.counts.records,0)===569,
    'The streamed preview lost an original received edition.');
   const after=await client.state();need(isDeepStrictEqual(after,before),'Preparing the same original bytes changed accepted receiving decisions.');
   return {candidateId:candidate.candidateId,bytes:candidate.bytes,sha256:candidate.sha256,
    existingEditionIds:candidate.existingEditionIds,records:569};
  });
  await phase('complete-connected-guide-and-xml',async()=>{
   const selection=await readJson(join(root,'source-selection.json'),32*1024*1024);
   const guide=selection.files.find(f=>f.path.endsWith('/desk/DESK_OPERATOR_GUIDE.md'));
   need(guide,'The original complete guide is missing from the selected source.');
   const guideOutput=await exactDownload(await client.guide({out:join(outputs,'DESK_OPERATOR_GUIDE.md'),sha256:guide.sha256}));
   need(guideOutput.bytes===guide.bytes,'The served complete guide byte count differs.');
   const record=await client.record({editionId:native.editions.datacite,recordId:native.recordSelection.firstDatacite});
   const requestId=record.native.provenance.requestId;
   const expected=native.phases['complete-record-and-original-source-inspection'].value.downloads.find(d=>
    d.editionId===native.editions.datacite&&d.kind==='xml'&&d.requestId===requestId);
   need(expected,'The original XML page descriptor is missing.');
   const xml=await invoke(['attachment','--edition',native.editions.datacite,'--kind','xml','--id',requestId,
    '--out',join(outputs,'original-datacite-page.xml')]);
   await exactDownload(xml);need(xml.sha256===expected.sha256&&xml.bytes===expected.bytes,'The connected CLI did not retain the exact original XML page.');
   return {guide:guideOutput,xml:{...xml,requestId}};
  });
  await phase('lost-response-original-request-and-offline-inspection',async()=>{
   const request=await originalRequest('connected-note','context.save',{note:NOTE});
   const interruptionFile='interrupted-response-'+result.attempts.length+'.json';
   const pending=await client.pending();
   if(pending.pending)need(isDeepStrictEqual(pending.pending.request,request),'Another original connected request is awaiting recovery.');
   if(!pending.pending){
    const actualFetch=globalThis.fetch;let intercepted=false;
    globalThis.fetch=async(input,options={})=>{
     const url=new URL(typeof input==='string'?input:input.url);
     if(url.origin===new URL(running.startup.url).origin&&url.pathname==='/api/act'&&options.method==='POST'){
      const sent=JSON.parse(Buffer.from(options.body).toString('utf8'));
      if(sent.operationId===request.operationId){
       need(isDeepStrictEqual(sent,request),'The connected client changed the retained original request.');
       const response=await actualFetch(input,options),receipt=await response.clone().json();
       need(response.ok&&receipt.operationId===request.operationId&&receipt.type===request.type,
        'The original note was not accepted before the controlled response interruption.');
       await atomicJson(directory,interruptionFile,{request,receipt,recordedAt:new Date().toISOString(),
        reason:'The native receiving example deliberately discards this accepted response to exercise the existing request recovery.'});
       result.interruptions??=[];result.interruptions.push({file:interruptionFile,operationId:request.operationId,revision:receipt.revision,replayed:receipt.replayed});await save();
       await response.arrayBuffer();intercepted=true;
       throw new Error('Controlled response interruption after the original server accepted its request.');
      }
     }
     return actualFetch(input,options);
    };
    try{
     let failure;
     try{await client.act(request);}catch(error){failure=error;}
     need(intercepted&&failure?.code==='CONNECTED_RESPONSE_UNCERTAIN','The controlled response interruption did not preserve the original pending request.');
    }finally{globalThis.fetch=actualFetch;}
   }
   const retained=await client.pending();
   need(isDeepStrictEqual(retained.pending?.request,request),'The original exact pending request was not retained.');
   const binding=await client.connection(),sameConnection=connectionFile,sameJournal=journalDirectory;
   await stop();
   const offline=await inspectConnectedPending({connectionFile:sameConnection,journalDirectory:sameJournal,expectedWorkspaceId:native.workspaceId});
   const offlineCli=await command([cli,'connected','pending','--connection',sameConnection,'--requests',sameJournal]);
   need(isDeepStrictEqual(offline.pending?.request,request)&&isDeepStrictEqual(offlineCli.pending?.request,request),
    'Offline inspection lost or changed the original pending body.');
   return {request,origin:binding.origin,journal:sameJournal,requestSha256:offline.pending.requestSha256,
    offlineApi:true,offlineCli:true,interruptedReceipts:result.interruptions??[]};
  });
  await phase('same-listener-and-original-request-recovery',async()=>{
   const prior=result.phases['lost-response-original-request-and-offline-inspection'].value;
   const reopened=await start(primary);
   if(result.attempts.at(-1).root===result.attempts[0].root)need(reopened.origin===prior.origin,
    'An ordinary listener restart changed the original receiving origin.');
   const request=prior.request,pending=await client.pending();
   if(pending.pending)need(isDeepStrictEqual(pending.pending.request,request),'The retained pending request differs before recovery.');
   const recovered=pending.pending?await client.recover():await client.act(request);
   need(recovered.replayed===true&&recovered.operationId===request.operationId&&recovered.revision===request.expectedRevision+1,
    'Recovery did not replay the exact original accepted operation.');
   need(!(await client.pending()).pending,'The completed original request remained pending.');
   const replayed=await invoke(['act','--request',join(requests,digest('connected-note')+'.json')]);
   need(replayed.replayed===true&&replayed.operationId===request.operationId&&replayed.revision===recovered.revision,
    'The original typed CLI changed the completed request identity.');
   const current=await assertScope();
   need(current.context.note===NOTE,'The original connected note was lost.');
   return {operationId:request.operationId,revision:recovered.revision,currentRevision:current.revision,
    origin:reopened.origin,requestSha256:prior.requestSha256,replayed:true,cliReplayed:true};
  });
  await phase('historical-handback-and-complete-current-export',async()=>{
   const first=await exactDownload(await client.exportHandback({handbackId:native.handbacks.first,out:join(outputs,'original-first-handback.zip')}));
   need(first.sha256===native.firstHandbackExport.sha256&&first.bytes===native.firstHandbackExport.bytes,
    'A later connected operation changed the original historical handback.');
   const current=await assertScope();
   const exported=await invoke(['export','--kind','workspace','--out',join(outputs,'workspace-r'+current.revision+'.zip')]);
   await exactDownload(exported);
   const callFile=join(requests,'typed-state-call.json');
   await atomicJson(requests,'typed-state-call.json',{name:'desk.state',arguments:{}});
   const typed=await invoke(['call','--file',callFile]);
   need(isDeepStrictEqual(typed,current),'The connected typed operation did not return the original live state.');
   return {firstHandback:first,workspaceExport:{...exported,revision:current.revision},revision:current.revision};
  });
  // Reuse the two already-operated native receiving desks and original restore
  // requests. Their revision-zero requests replay without a new workspace or import.
  for(const name of ['historical','restored']){
   await phase('original-'+name+'-receiving-replay',async()=>{
    const target=join(root,name==='historical'?'historical-handback-desk':'restored-workspace-desk');
    const request=await readJson(join(root,'requests',digest(name+'-restore')+'.json'),16*1024*1024);
    need(request.type==='workspace.restore'&&request.expectedRevision===0,'The original receiving request differs.');
    const binding=await start(target),before=await client.state();
    const response=await client.act(request);
    need(response.replayed===true&&response.state.workspaceId===native.workspaceId&&isDeepStrictEqual(response.state,before),
     'The original restored workspace changed when its exact receiving request replayed.');
    const record=await client.record({editionId:native.editions.datacite,recordId:native.recordSelection.excludedDatacite});
    need(record.effectiveDecision===(name==='historical'?'exclude':'accept'),
     'The original historical or later receiving decision changed.');
    const launch=await client.connection();need(launch.workspaceId===native.workspaceId&&launch.markerSha256===binding.markerSha256,
     'The connected restored marker differs from its original receiving identity.');
    await stop();const reopened=await start(target);
    need(reopened.origin===binding.origin,'The already-operated receiving desk changed its original listener.');
    const again=await client.act(request);
    need(again.replayed===true&&isDeepStrictEqual(again.state,before),'The original restore request changed across connected reopen.');
    return {workspaceId:before.workspaceId,revision:before.revision,operationId:request.operationId,replayed:true,
     originalExpectedRevision:0,effectiveDecision:record.effectiveDecision,markerSha256:launch.markerSha256,origin:binding.origin};
   });
  }
  await start(primary);const final=await assertScope();
  need(final.context.note===NOTE,'The primary connected receiving note changed.');
  result.status='complete';result.completedAt=new Date().toISOString();delete result.currentFailure;
  await checkpoint();
  event('CONNECTED_COMPLETE',{resultFile:resultPath,workspaceId:result.workspaceId,revision:result.state.revision,
   records:569,phases:Object.keys(result.phases).length,checkpoint:result.checkpoint});
  return result;
 }catch(error){
  if(result){
   result.status='needs_continuation';result.currentFailure??={...safeError(error),recordedAt:new Date().toISOString()};
   await save().catch(()=>{});
   try{await checkpoint();}catch(checkpointError){result.checkpointFailure={...safeError(checkpointError),recordedAt:new Date().toISOString()};await save().catch(()=>{});}
  }
  throw error;
 }finally{try{await stop();}finally{await release();}}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);let root,python='python3';
 for(let i=0;i<args.length;i+=2){
  need(typeof args[i+1]==='string','Every receiving option needs its original value.');
  if(args[i]==='--root')root=args[i+1];else if(args[i]==='--python')python=args[i+1];else throw new Error('Use --root and optional --python.');
 }
 runConnectedReceiving({root,python}).catch(error=>{event('CONNECTED_FAILED',safeError(error));process.exitCode=1;});
}
