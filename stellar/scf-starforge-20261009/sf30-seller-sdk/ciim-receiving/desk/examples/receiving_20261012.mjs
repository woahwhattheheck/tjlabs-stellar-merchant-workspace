// MIT. One operated receiving lifecycle over the original completed CIIM case.
// This imports retained Proteus results; it never invokes the transformer or JVM.
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,open,rename,unlink,link,lstat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {startCiimDeskServer} from '../server.mjs';

export const OPERATION='CIIM-METADATA-RECEIVING-DESK-ADC6-20261012';
const CASE_SHA='26f5cc490aef1e2b292a55e04ba2372d3ca4e2703f8b32bc2d5b52a89c81a91c';
const CASE_BYTES=15587672;
const ORIGINAL_SOURCE='https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/150';
const AUTHORITY='commons-adc6';
const ACTOR='ADC6 / Commons receiving operator';
const event=(name,value={})=>process.stdout.write(JSON.stringify({event:name,operation:OPERATION,...value})+'\n');
const need=(value,message)=>{if(!value)throw new Error(message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function present(path){try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function fileHash(path){const h=createHash('sha256');let bytes=0;for await(const b of createReadStream(path)){bytes+=b.length;h.update(b);}return {bytes,sha256:h.digest('hex')};}
async function writeJson(path,value){await mkdir(dirname(path),{recursive:true,mode:0o700});const tmp=path+'.'+randomUUID()+'.pending';const f=await open(tmp,'wx',0o600);try{await f.writeFile(JSON.stringify(value,null,2)+'\n');await f.sync();}finally{await f.close();}await rename(tmp,path);}
async function readJson(path){return JSON.parse(await readFile(path,'utf8'));}
async function command(argv){return new Promise((resolve,reject)=>{let out='',err='';const p=spawn(process.execPath,argv,{stdio:['ignore','pipe','pipe']});p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.once('error',reject);p.once('close',code=>{if(code!==0)reject(new Error('Original CLI exited '+code+': '+err));else{try{resolve(JSON.parse(out));}catch{reject(new Error('Original CLI returned invalid JSON: '+out.slice(0,300)));}}});});}

export async function runReceiving({root,python='python3'}={}){
 root=resolve(root);await mkdir(root,{recursive:true,mode:0o700});
 const resultFile=join(root,'native-result.json'),requests=join(root,'requests'),exports=join(root,'exports');
 await mkdir(requests,{recursive:true,mode:0o700});await mkdir(exports,{recursive:true,mode:0o700});
 const archive=join(root,'original','CIIM-Proteus-native-receiving-case.zip'),original=await fileHash(archive);
 need(original.bytes===CASE_BYTES&&original.sha256===CASE_SHA,'The original accepted CIIM archive differs.');
 let result=await present(resultFile)?await readJson(resultFile):{schema:'tjl.ciim.desk-operated-receiving.v1',operation:OPERATION,status:'in_progress',original:{...original,libraryFileId:'libfile_4013e27ccff0819184dac304acecd92c'},phases:{},attempts:[]};
 need(result.operation===OPERATION&&result.original.sha256===CASE_SHA,'The retained operation belongs to a different original case.');
 const selection=await readJson(join(root,'source-selection.json'));
 result.attempts.push({startedAt:new Date().toISOString(),source:selection.source,sourceSelectionSha256:hash(await readFile(join(root,'source-selection.json'))),node:process.version,python});
 await writeJson(resultFile,result);
 let running=null,base=null,session=null;
 const paths={primary:join(root,'desk'),historical:join(root,'historical-handback-desk'),restored:join(root,'restored-workspace-desk')};
 const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
 async function save(){await writeJson(resultFile,result);}
 async function phase(key,work){
  if(result.phases[key]?.status==='complete')return result.phases[key].value;
  event('RECEIVING_PHASE_START',{phase:key});
  try{const value=await work();result.phases[key]={status:'complete',completedAt:new Date().toISOString(),value};await save();event('RECEIVING_PHASE_COMPLETE',{phase:key,value});return value;}
  catch(error){result.status='needs_continuation';result.currentFailure={phase:key,message:error.message,code:error.code??null,recordedAt:new Date().toISOString()};await save();event('RECEIVING_PHASE_FAILED',{phase:key,error:result.currentFailure});throw error;}
 }
 async function stop(){if(running){const closing=running;running=null;await closing.close();base=session=null;}}
 async function start(directory,managed=false){
  await stop();
  if(!await present(join(directory,'desk.json')))await command([cli,'init','--workspace',directory,'--python',python]);
  const markerRaw=await readFile(join(directory,'desk.json')),marker=JSON.parse(markerRaw);
  running=await startCiimDeskServer({directory,python,...(managed?{expectedWorkspaceId:marker.workspaceId,expectedMarkerSha256:hash(markerRaw)}:{})});
  const url=new URL(running.startup.url);base=url.origin;session=url.hash.slice(1);
  const actual=await api('/api/launch');
  need(actual.workspaceId===marker.workspaceId&&actual.markerSha256===hash(markerRaw)&&new URL(actual.url).origin===base,'The actual listener does not match its original workspace marker.');
  return {workspaceId:actual.workspaceId,markerSha256:actual.markerSha256,origin:base,workspace:directory};
 }
 async function api(path,{method='GET',data,headers={},body,...options}={}){
  const response=await fetch(base+path,{method,headers:{'X-CIIM-Session':session,...(data!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:data===undefined?body:JSON.stringify(data),...options});
  let value;try{value=await response.json();}catch{throw new Error('Original HTTP response was not JSON for '+path);}
  if(!response.ok){const e=new Error(value.error?.message||'HTTP '+response.status);e.code=value.error?.code;e.status=response.status;e.details=value.error?.details;throw e;}
  return value;
 }
 const view=values=>api('/api/view?'+new URLSearchParams(Object.fromEntries(Object.entries(values).map(([k,v])=>[k,String(v)]))));
 async function act(key,type,data){
  const requestPath=join(requests,hash(key)+'.json');
  let request;
  if(await present(requestPath)){request=await readJson(requestPath);need(request.type===type&&isDeepStrictEqual(request.data,data),'The original '+key+' request is different; preserve the accepted body.');}
  else{const state=await api('/api/state');request={operationId:OPERATION+':'+hash(key).slice(0,24),expectedRevision:state.revision,actor:ACTOR,type,data};await writeJson(requestPath,request);}
  const response=await api('/api/act',{method:'POST',data:request});
  need(response.operationId===request.operationId&&response.type===type,'The original operation receipt differs.');
  return {request,response};
 }
 async function importArchive(path){
  const descriptor=await fileHash(path);
  return api('/api/import',{method:'POST',headers:{'Content-Type':'application/zip','Content-Length':String(descriptor.bytes),'X-CIIM-Filename':encodeURIComponent(path.split('/').at(-1)),'X-CIIM-SHA256':descriptor.sha256},body:createReadStream(path),duplex:'half'});
 }
 async function download(path,target,expected){
  const response=await fetch(base+path,{headers:{'X-CIIM-Session':session}});
  if(!response.ok)throw new Error('Original download failed '+response.status+' '+await response.text());
  const declared=response.headers.get('x-content-sha256'),declaredBytes=Number(response.headers.get('content-length'));
  need(/^[a-f0-9]{64}$/.test(declared||'')&&Number.isSafeInteger(declaredBytes),'Original download identity headers are missing.');
  const tmp=target?target+'.'+randomUUID()+'.pending':null,fd=tmp?await open(tmp,'wx',0o600):null,h=createHash('sha256');let bytes=0;
  try{for await(const chunk of response.body){bytes+=chunk.length;h.update(chunk);if(fd)await fd.writeFile(chunk);}if(fd)await fd.sync();}
  finally{if(fd)await fd.close();}
  const sha256=h.digest('hex');need(bytes===declaredBytes&&sha256===declared,'The actual downloaded bytes differ from their original descriptor.');
  if(expected)need(sha256===expected,'The original download changed.');
  if(target){try{await link(tmp,target);}catch(e){if(e.code!=='EEXIST')throw e;need(isDeepStrictEqual(await fileHash(target),{bytes,sha256}),'The prior retained download differs.');}finally{await unlink(tmp);}}
  return {...(target?{file:target}:{}),bytes,sha256,mime:response.headers.get('content-type'),disposition:response.headers.get('content-disposition')};
 }
 async function retainedDownload(descriptor,name,member){
  need(descriptor&&Number.isSafeInteger(descriptor.bytes)&&/^[a-f0-9]{64}$/.test(descriptor.sha256),'The retained export descriptor is incomplete.');
  const candidates=[join(exports,name),join(root,'receiving',member)];
  for(const file of candidates){
   const st=await present(file);if(!st)continue;
   need(st.isFile()&&!st.isSymbolicLink(),'The retained receiving export is not a regular file.');
   const actual=await fileHash(file);need(actual.bytes===descriptor.bytes&&actual.sha256===descriptor.sha256,'The relocated original receiving export differs.');
   return {...descriptor,...(descriptor.file!==file?{originalFile:descriptor.originalFile??descriptor.file}:{}),file};
  }
  throw new Error('Restore the exact retained '+member+' under the current receiving root before continuing.');
 }
 async function fullRecords(edition){
  const rows=[];let total;
  for(let offset=0;;offset+=73){const page=await view({view:'records',editionId:edition.id,offset,limit:73});if(total===undefined)total=page.total;need(page.total===total,'The original population changed during inspection.');rows.push(...page.items);if(rows.length>=total)break;}
  need(rows.length===edition.counts.records&&new Set(rows.map(x=>x.id)).size===rows.length,'The full original edition coverage differs.');
  return rows;
 }
 async function reviewSet(prefix,editions,note){
  for(const e of editions){
   const profiles=await view({view:'profiles',editionId:e.id,limit:250});
   need(profiles.total===e.profiles.length,'The original profile coverage differs.');
   for(const p of profiles.items)await phase(prefix+'-profile-'+e.id+'-'+p.sha256,async()=>{const x=await act(prefix+'-profile-'+e.id+'-'+p.sha256,'profile.review',{editionId:e.id,profileSha256:p.sha256,decision:'accept',note:'Reviewed the original '+p.sha256+' Proteus specification and its retained native output for this internal receiving case.',authorityId:AUTHORITY,reference:ORIGINAL_SOURCE});return {revision:x.response.revision,profileSha256:p.sha256};});
   await phase(prefix+'-edition-'+e.id,async()=>{const x=await act(prefix+'-edition-'+e.id,'edition.review',{editionId:e.id,decision:'accept',note,authorityId:AUTHORITY,reference:ORIGINAL_SOURCE});return {revision:x.response.revision,editionId:e.id,populationDigest:e.populationDigest};});
  }
 }
 try{
  const started=await start(paths.primary);
  result.workspace=paths.primary;result.workspaceId=started.workspaceId;await save();
  await phase('typed-cli-and-listener',async()=>{
   const description=await command([cli,'describe']),operations=await command([cli,'operations']);
   need(description.workspaceSchema==='tjl.ciim.desk.v1'||description.workspaceSchema===JSON.parse(await readFile(join(paths.primary,'desk.json'))).schema,'The original CLI workspace description differs.');
   const unauth=await fetch(base+'/api/state');need(unauth.status===401,'The private receiving route accepted a request without its local session.');
   return {node:process.version,workspaceId:started.workspaceId,markerSha256:started.markerSha256,origin:base,descriptionSchema:description.schema,typedOperationNames:Array.isArray(operations)?operations.map(x=>x.name):Object.keys(operations),unauthenticatedStatus:unauth.status};
  });
  await phase('complete-operator-guide-download',async()=>{
   const guide=selection.files.find(x=>x.path.endsWith('/desk/DESK_OPERATOR_GUIDE.md'));
   need(guide,'The complete operator guide is absent from the selected source.');
   const response=await fetch(base+'/operator-guide.md');
   need(response.ok,'The complete operator guide route is not available.');
   const bytes=Buffer.from(await response.arrayBuffer());
   need(bytes.length===guide.bytes&&hash(bytes)===guide.sha256,'The served operator guide differs from its selected source.');
   return {bytes:bytes.length,sha256:hash(bytes),path:'/operator-guide.md'};
  });
  const preview=await phase('original-native-intake-preview',async()=>{
   const p=await importArchive(archive);
   need(p.kind==='native'&&p.sha256===CASE_SHA&&p.bytes===CASE_BYTES&&p.editions.length===3,'The complete original native case preview differs.');
   need(p.editions.reduce((n,x)=>n+x.counts.records,0)===569,'The three original source populations differ.');
   return p;
  });
  await phase('retain-all-native-editions',async()=>{
   const x=await act('native-intake','intake.import',{candidateId:preview.candidateId,label:'Original Zenodo and OpenAlex Proteus receiving case',editionIds:preview.editions.map(x=>x.id)});
   const replay=await api('/api/act',{method:'POST',data:x.request});
   need(replay.replayed===true&&replay.revision===x.response.revision,'The original import request did not replay after its first receipt.');
   return {revision:x.response.revision,editionIds:x.response.result.editionIds,operationId:x.request.operationId,replayed:true};
  });
  let state=await api('/api/state'),editions=state.editions;
  const datacite=editions.find(x=>x.counts.records===231&&x.selection.metadataPrefix==='oai_datacite');
  const withdrawal=editions.find(x=>x.counts.records===169&&x.counts.deleted===1);
  const restored=editions.find(x=>x.counts.records===169&&x.counts.deleted===0);
  need(datacite&&withdrawal&&restored&&new Set(editions.map(x=>x.id)).size===3,'The exact three accepted native editions are required.');
  result.editions={datacite:datacite.id,withdrawal:withdrawal.id,restored:restored.id};await save();
  const population=await phase('complete-record-and-original-source-inspection',async()=>{
   const rowsBy={},summary=[],downloads=[];let pages=0;
   for(const e of editions){
    const rows=await fullRecords(e);rowsBy[e.id]=rows;
    const originalManifest=await fetch(base+'/api/attachment?'+new URLSearchParams({editionId:e.id,kind:'manifest'}),{headers:{'X-CIIM-Session':session}});
    need(originalManifest.ok,'The original manifest download failed.');
    const mb=Buffer.from(await originalManifest.arrayBuffer());need(hash(mb)===originalManifest.headers.get('x-content-sha256'),'Original manifest response differs.');
    const manifest=JSON.parse(mb);
    for(const p of manifest.pages){
     downloads.push({editionId:e.id,kind:'xml',requestId:p.requestId,...await download('/api/attachment?'+new URLSearchParams({editionId:e.id,kind:'xml',id:p.requestId}),null,p.page.sha256)});pages++;
    }
    for(const kind of ['native','mapped'])downloads.push({editionId:e.id,kind,requestId:manifest.pages[0].requestId,...await download('/api/attachment?'+new URLSearchParams({editionId:e.id,kind,id:manifest.pages[0].requestId}))});
    for(const p of e.profiles)downloads.push({editionId:e.id,kind:'profile',...await download('/api/attachment?'+new URLSearchParams({editionId:e.id,kind:'profile',id:p.sha256}),null,p.sha256)});
    const first=await api('/api/record?'+new URLSearchParams({editionId:e.id,recordId:rows[0].id}));
    need(first.identifier===rows[0].identifier&&first.observationId===first.native.observation.id,'The original record/observation identity differs.');
    summary.push({editionId:e.id,label:e.label,nativeEditionId:e.nativeEditionId,records:rows.length,active:rows.filter(x=>x.status==='active').length,deleted:rows.filter(x=>x.status==='deleted').length,populationDigest:e.populationDigest,firstRecordId:rows[0].id,firstRequestId:first.native.provenance.requestId});
   }
   const deleted=rowsBy[withdrawal.id].find(x=>x.status==='deleted'),returned=rowsBy[restored.id].find(x=>x.identifier===deleted.identifier);
   need(deleted&&returned&&returned.status==='active'&&deleted.identifier.includes('W116719298'),'The original withdrawal/restoration identity differs.');
   need(pages===13,'The full13 original response-page coverage differs.');
   return {records:569,pages,summary,downloads,withdrawalRecord:deleted,restoredRecord:returned,firstDatacite:rowsBy[datacite.id][0],secondDatacite:rowsBy[datacite.id][1]};
  });
  result.recordSelection={firstDatacite:population.firstDatacite.id,excludedDatacite:population.secondDatacite.id,withdrawalRecord:population.withdrawalRecord.id,restoredRecord:population.restoredRecord.id,originalIdentifier:population.withdrawalRecord.identifier};await save();
  await phase('named-receiving-context',async()=>{
   const x=await act('receiving-context-1','context.save',{label:'CIIM original metadata receiving desk',institution:{name:'TokenJunkieLabs / Commons engineering',reference:'https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791764204380999'},receivingEnvironment:{name:'Local CIIM receiving desk over retained native Proteus output',reference:CASE_SHA},processingProfile:{name:'Retained original Proteus specifications',version:'case-26f5cc49',reference:CASE_SHA},authorities:[{id:AUTHORITY,name:'ADC6 / Commons receiving operator',reference:'https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791808578283069'}],note:'Selected the original native case, local receiving environment and named internal review authority.'});
   return {revision:x.response.revision,contextDigest:x.response.result.contextDigest};
  });
  await phase('record-specific-review-before-context-revision',async()=>{const x=await act('early-record-exclusion','records.review',{editionId:datacite.id,recordIds:[population.firstDatacite.id],decision:'exclude',note:'Kept this original record outside the first review scope while its current authority reference was being finalized.',authorityId:AUTHORITY});return {revision:x.response.revision,recordId:population.firstDatacite.id};});
  await phase('authority-reference-revision',async()=>{const x=await act('receiving-context-2','context.save',{authorities:[{id:AUTHORITY,name:'ADC6 / Commons receiving operator',reference:ORIGINAL_SOURCE}],note:'Bound the same named receiving authority to the complete published desk source before the population review.'});return {revision:x.response.revision,contextDigest:x.response.result.contextDigest};});
  const firstReviewNote='Reviewed this complete original edition, its identity, source pages and retained native mappings under the current published-source authority.';
  await reviewSet('review-1',editions,firstReviewNote);
  await phase('effective-record-review-attribution',async()=>{
   const detail=await api('/api/record?'+new URLSearchParams({editionId:datacite.id,recordId:population.firstDatacite.id}));
   need(detail.effectiveDecision==='accept'&&detail.review.note===firstReviewNote&&detail.review.authority.reference===ORIGINAL_SOURCE,'The effective accepted outcome cites a stale explicit record review.');
   return {recordId:detail.id,effectiveDecision:detail.effectiveDecision,reviewOperation:detail.review.operationId,authority:detail.review.authority};
  });
  await phase('reasoned-selected-record-exclusion',async()=>{const x=await act('selected-record-exclusion','records.review',{editionId:datacite.id,recordIds:[population.secondDatacite.id],decision:'exclude',note:'Excluded this one record from the selected first internal handback scope; its original bytes, source identity and correction history remain in the complete source population.',authorityId:AUTHORITY});return {revision:x.response.revision,recordId:population.secondDatacite.id};});
  const forward=await phase('chronological-restoration-comparison',async()=>{
   const x=await act('comparison-restoration','comparison.create',{beforeEditionId:withdrawal.id,afterEditionId:restored.id,label:'Original OpenAlex withdrawal edition to restored edition'});
   const item=x.response.state.comparisons.find(c=>c.beforeEditionId===withdrawal.id&&c.afterEditionId===restored.id);
   need(item?.counts.records===169&&item.counts.restored===1&&item.counts.unchanged===168,'The original full restoration comparison differs.');
   return {id:item.id,counts:item.counts,populationDigest:item.populationDigest};
  });
  const reverse=await phase('explicit-reverse-withdrawal-inspection',async()=>{
   const x=await act('comparison-reverse','comparison.create',{beforeEditionId:restored.id,afterEditionId:withdrawal.id,label:'Reverse comparison: restored edition against retained withdrawal edition'});
   const item=x.response.state.comparisons.find(c=>c.beforeEditionId===restored.id&&c.afterEditionId===withdrawal.id);
   need(item?.counts.records===169&&item.counts.withdrawn===1&&item.counts.unchanged===168,'The explicit reverse inspection differs.');
   return {id:item.id,counts:item.counts,populationDigest:item.populationDigest,note:'Comparison direction is reversed for inspection; original source dates are unchanged.'};
  });
  result.comparisons={forward:forward.id,reverse:reverse.id};await save();
  for(const pair of [forward,reverse])await phase('comparison-review-1-'+pair.id,async()=>{const x=await act('comparison-review-1-'+pair.id,'comparison.review',{comparisonId:pair.id,decision:'accept',note:pair.id===forward.id?'Reviewed all169 original identifiers and the one original restoration.':'Reviewed all169 identifiers in the explicitly reversed comparison; original edition dates and source order remain visible.',authorityId:AUTHORITY,reference:ORIGINAL_SOURCE});return {revision:x.response.revision,comparisonId:pair.id};});
  await phase('filtered-comparison-keeps-full-scope',async()=>{const page=await view({view:'comparison',comparisonId:forward.id,status:'restored',limit:50});need(page.total===1&&page.counts.records===169&&page.items[0].identifier===population.withdrawalRecord.identifier,'The filtered original comparison lost its full population scope.');return {visible:page.total,population:page.counts.records,identifier:page.items[0].identifier};});
  const firstHandback=await phase('first-complete-reviewed-handback',async()=>{
   const x=await act('first-handback','handback.create',{label:'Original metadata receiving — selected first scope',editionIds:editions.map(x=>x.id),comparisonIds:[forward.id,reverse.id],note:'Complete reviewed handback of the original three editions, named authority decisions, explicit one-record scope exclusion, and both labelled comparison directions.',authorityId:AUTHORITY});
   const item=x.response.state.handbacks.at(-1);
   return {id:item.id,revision:x.response.revision,counts:item.counts,sha256:item.sha256};
  });
  result.handbacks={first:firstHandback.id};await save();
  result.firstHandbackExport=await phase('download-first-handback',()=>download('/api/export/handback?'+new URLSearchParams({handbackId:firstHandback.id}),join(exports,'first-handback.zip')));
  result.firstHandbackExport=await retainedDownload(result.firstHandbackExport,'first-handback.zip','firstHandbackExport.zip');
  result.firstHandbackExport.kind='handback';result.firstHandbackExport.handbackId=firstHandback.id;await save();
  await phase('later-receiving-context-change',async()=>{const x=await act('receiving-context-3','context.save',{processingProfile:{name:'Retained original Proteus specifications',version:'case-26f5cc49-reviewed-scope-2',reference:CASE_SHA},note:'Opened the next internal receiving scope to include the retained record previously excluded from the first handback.'});need(x.response.state.editions.every(e=>!e.readiness.ready),'The earlier current reviews remained fresh after the receiving context changed.');return {revision:x.response.revision,contextDigest:x.response.result.contextDigest};});
  await phase('historical-handback-immutable-after-context-change',async()=>{const downloaded=await download('/api/export/handback?'+new URLSearchParams({handbackId:firstHandback.id}),null,result.firstHandbackExport.sha256);return downloaded;});
  await reviewSet('review-2',editions,'Reviewed the full original edition for the second internal receiving scope, preserving all prior decisions in its history.');
  await phase('restore-original-record-to-reviewed-scope',async()=>{const x=await act('include-previously-excluded-record','records.review',{editionId:datacite.id,recordIds:[population.secondDatacite.id],decision:'accept',note:'Accepted the same retained original record into the second handback after reviewing its original identity and mapped properties.',authorityId:AUTHORITY,reference:ORIGINAL_SOURCE});return {revision:x.response.revision,recordId:population.secondDatacite.id};});
  for(const pair of [forward,reverse])await phase('comparison-review-2-'+pair.id,async()=>{const x=await act('comparison-review-2-'+pair.id,'comparison.review',{comparisonId:pair.id,decision:'accept',note:'Reviewed the same complete comparison under the second receiving context; original source identities and comparison direction are unchanged.',authorityId:AUTHORITY,reference:ORIGINAL_SOURCE});return {revision:x.response.revision,comparisonId:pair.id};});
  const secondHandback=await phase('second-complete-reviewed-handback',async()=>{
   const x=await act('second-handback','handback.create',{label:'Original metadata receiving — complete second scope',editionIds:editions.map(x=>x.id),comparisonIds:[forward.id,reverse.id],note:'Complete original populations accepted for the second receiving scope, with the first scoped handback and all named decision history retained.',authorityId:AUTHORITY});
   const item=x.response.state.handbacks.at(-1);need(x.response.state.editions.every(e=>e.readiness.ready),'The complete second scope is not ready.');
   return {id:item.id,revision:x.response.revision,counts:item.counts,sha256:item.sha256};
  });
  result.handbacks.second=secondHandback.id;
  result.workspaceExport=await phase('download-complete-workspace',()=>download('/api/export/workspace',join(exports,'complete-workspace.zip')));
  result.workspaceExport=await retainedDownload(result.workspaceExport,'complete-workspace.zip','workspaceExport.zip');
  result.workspaceExport.kind='workspace';result.workspaceExport.revision=(await api('/api/state')).revision;await save();
  const mainState=await api('/api/state');result.acceptedRevision=mainState.revision;await save();
  await stop();
  await phase('typed-cli-original-record-download',async()=>{
   const status=await command([cli,'status','--workspace',paths.primary,'--python',python]);
   const replayRequest=join(requests,hash('native-intake')+'.json');
   const replay=await command([cli,'act','--workspace',paths.primary,'--python',python,'--request',replayRequest]);
   need(replay.replayed===true&&replay.state.revision===status.revision,'The typed CLI changed a completed original operation.');
   const sourcePage=population.summary.find(x=>x.editionId===datacite.id).firstRequestId;
   const received=await command([cli,'attachment','--workspace',paths.primary,'--python',python,'--edition',datacite.id,'--kind','xml','--id',sourcePage,'--out',join(exports,'original-datacite-page.xml')]);
   const actual=await fileHash(join(exports,'original-datacite-page.xml'));
   need(received.sha256===actual.sha256&&received.bytes===actual.bytes,'The typed original attachment download differs.');
   return {workspaceId:status.workspaceId,revision:status.revision,replayed:true,attachment:actual};
  });
  for(const spec of [
   {key:'historical',directory:paths.historical,file:result.firstHandbackExport.file,kind:'handback'},
   {key:'restored',directory:paths.restored,file:result.workspaceExport.file,kind:'workspace'}
  ]){
   await start(spec.directory);
   const candidate=await phase(spec.key+'-portable-preview',async()=>{const p=await importArchive(spec.file);need(p.kind===spec.kind&&p.workspace.workspaceId===result.workspaceId,'The original portable workspace identity differs.');return p;});
   await phase(spec.key+'-portable-restore',async()=>{
    const x=await act(spec.key+'-restore','workspace.restore',{candidateId:candidate.candidateId,note:'Reopened the exact '+spec.kind+' package of the same original receiving workspace.'});
    need(x.response.state.workspaceId===result.workspaceId&&x.response.state.editions.length===3,'The restored original source scope differs.');
    const target=await api('/api/record?'+new URLSearchParams({editionId:datacite.id,recordId:population.secondDatacite.id}));
    need(target.effectiveDecision===(spec.key==='historical'?'exclude':'accept'),'The restored receiving decision differs from its original revision.');
    const launch=await api('/api/launch');need(launch.workspaceId===result.workspaceId,'The live restored marker identity was not refreshed.');
    return {revision:x.response.revision,workspaceId:x.response.state.workspaceId,operationId:x.request.operationId,markerSha256:launch.markerSha256,effectiveDecision:target.effectiveDecision,origin:new URL(launch.url).origin};
   });
   const oldOrigin=base;await stop();await start(spec.directory);need(base===oldOrigin,'An ordinary reopen changed the original browser origin.');
   await phase(spec.key+'-restore-receipt-replay-after-reopen',async()=>{
    const request=await readJson(join(requests,hash(spec.key+'-restore')+'.json'));
    need(request.expectedRevision===0,'The original fresh receiving request lost its revision0.');
    const replay=await api('/api/act',{method:'POST',data:request});
    need(replay.replayed===true&&replay.state.workspaceId===result.workspaceId,'The original restore receipt did not replay after identity change and restart.');
    const exported=await download('/api/export/handback?'+new URLSearchParams({handbackId:firstHandback.id}),null,result.firstHandbackExport.sha256);
    let count=0;for(const e of replay.state.editions)count+=(await fullRecords(e)).length;
    need(count===569,'The reopened portable case lost original records.');
    return {revision:replay.revision,replayed:true,records:count,origin:base,firstHandbackSha256:exported.sha256};
   });
   await stop();
  }
  await start(paths.primary,true);
  await phase('managed-original-marker-and-port-reopen',async()=>{
   need(base===started.origin,'The primary original port preference changed.');
   const before=await api('/api/state');
   let code,status;
   try{await api('/api/act',{method:'POST',data:{operationId:OPERATION+':managed-restore-should-select-fresh-desk',expectedRevision:before.revision,actor:ACTOR,type:'workspace.restore',data:{candidateId:preview.candidateId,note:'Select a fresh desk before changing an Applications-bound marker.'}}});}
   catch(error){code=error.code;status=error.status;}
   need(code==='MANAGED_WORKSPACE_BINDING'&&status===409,'The managed original marker did not preserve its selected workspace.');
   const after=await api('/api/state');need(after.revision===before.revision,'The rejected managed restore changed the original receiving state.');
   const first=await download('/api/export/handback?'+new URLSearchParams({handbackId:firstHandback.id}),null,result.firstHandbackExport.sha256);
   return {workspaceId:after.workspaceId,revision:after.revision,origin:base,rejectedRestore:{code,status},firstHandbackSha256:first.sha256};
  });
  result.status='native_complete';delete result.currentFailure;result.completedAt=new Date().toISOString();result.state=await api('/api/state');result.browser={status:'prepared',workspace:paths.primary};await save();
  await stop();
  event('BEFORE_BROWSER_CHECKPOINT',{resultFile,workspace:paths.primary,records:569,editionCounts:[231,169,169],workspaceExport:result.workspaceExport,firstHandbackExport:result.firstHandbackExport,completedPhases:Object.keys(result.phases).length});
  return result;
 }finally{await stop();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);let root,python='python3';
 for(let i=0;i<args.length;i+=2){if(args[i]==='--root')root=args[i+1];else if(args[i]==='--python')python=args[i+1];else throw new Error('Use --root and optional --python.');}
 if(!root)throw new Error('Use the original receiving root.');
 runReceiving({root,python}).catch(error=>{event('RECEIVING_FAILED',{code:error.code??null,message:error.message,stack:error.stack});process.exitCode=1;});
}
