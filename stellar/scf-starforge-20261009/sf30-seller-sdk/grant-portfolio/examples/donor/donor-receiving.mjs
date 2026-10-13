#!/usr/bin/env node
// MIT. Complete donor reporting and original customer return through three owned consoles.
// The caller owns these servers. This programme borrows and closes only its clients.
import {open,lstat,realpath,mkdir,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {connectGrantPortfolio,saveGrantPortfolioFile} from '../../client.mjs';

const SCHEMA='stellar-forge.donor-receiving.v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PHASES=['draft','submit','source-correction','acknowledge'];
const RETURN_PHASES=['correction-draft','correction-submit'];
const HASH=/^[0-9a-f]{64}$/,OP=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,110}$/;
const need=(v,m)=>{if(!v)throw Error(m);};
const bytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const sha=b=>createHash('sha256').update(b).digest('hex');
const same=isDeepStrictEqual;
async function syncParent(path){const fd=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY);try{await fd.sync();}finally{await fd.close();}}
async function read(path,maximum=64*1024*1024){
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const before=await fd.stat();need(before.isFile()&&before.size<=maximum,'Select a bounded complete regular file.');
  const body=await fd.readFile(),after=await fd.stat(),named=await lstat(path);
  need(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&
   before.ctimeMs===after.ctimeMs&&named.ino===before.ino&&named.dev===before.dev&&body.length===before.size,'The original selected file changed.');
  return body;
 }finally{await fd.close();}
}
async function retain(path,body){
 try{const old=await read(path,Math.max(body.length,64*1024*1024));need(old.equals(body),'An original receiving artifact differs: '+path);await syncParent(path);return;}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const temporary=path+'.pending-'+randomUUID();let fd;
 try{fd=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await fd.writeFile(body);await fd.sync();await fd.close();fd=null;
  try{await link(temporary,path);}catch(e){if(e.code!=='EEXIST')throw e;need((await read(path,Math.max(body.length,64*1024*1024))).equals(body),'A competing output differs.');}
  await syncParent(path);
 }finally{if(fd)await fd.close();await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function fileIdentity(path){
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const before=await fd.stat();need(before.isFile()&&before.size<=4*1024*1024*1024,'Select the bounded original file.');
  const buffer=Buffer.alloc(1024*1024),hash=createHash('sha256');let total=0;
  for(;;){const {bytesRead}=await fd.read(buffer,0,buffer.length,null);if(!bytesRead)break;total+=bytesRead;need(total<=before.size,'The selected file grew.');hash.update(buffer.subarray(0,bytesRead));}
  const after=await fd.stat(),named=await lstat(path);
  need(total===before.size&&before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&
   before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&named.dev===before.dev&&named.ino===before.ino,'The complete original file changed.');
  return {bytes:total,sha256:hash.digest('hex')};
 }finally{await fd.close();}
}

function selectedReport(portfolio,id){
 const report=portfolio.definition.programme?.records.reports.find(row=>row.id===id);
 need(report&&!report.archived,'Select the original active donor report.');return report;
}
function selection(portfolio,id){return {portfolioId:portfolio.id,revision:portfolio.revision,id};}
function reference(portfolio){return {id:portfolio.id,revision:portfolio.revision,snapshot:portfolio.snapshot};}
function safeName(value){need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value),'Use an ordinary retained artifact name.');return value;}
async function optionalJson(path){
 try{return JSON.parse(await read(path));}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function sourceSelection(){
 const sdk=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
 const manifestPath=join(sdk,'grant-portfolio/source-files.json'),manifestBytes=await read(manifestPath,1024*1024);
 const manifest=JSON.parse(manifestBytes);
 need(manifest.schema==='stellar-forge.grant-portfolio-source-files.v1'&&Array.isArray(manifest.files),
  'Select the complete maintained application source.');
 need(same(manifest.files,[...new Set(manifest.files)].sort()),'The complete source list must retain its unique sorted paths.');
 const files=[];
 for(const path of manifest.files){
  need(typeof path==='string'&&!path.startsWith('/')&&!path.includes('\\')&&path.split('/').every(part=>part&&part!=='.'&&part!=='..'),
   'Select only complete original SDK source paths.');
  const selected=join(sdk,path);need(await realpath(selected)===selected,'Keep the exact original source file.');
  files.push({path,...await fileIdentity(selected)});
 }
 for(const path of ['grant-portfolio/donor_reporting.py','grant-portfolio/programme.py',
  'grant-portfolio/client.mjs','grant-portfolio/examples/donor/donor-receiving.mjs',
  'grant-portfolio/examples/donor/DONOR_RECEIVING.md'])
  need(manifest.files.includes(path),'The complete source must include '+path);
 need((await read(manifestPath,1024*1024)).equals(manifestBytes),'The selected source list changed.');
 return {schema:'stellar-forge.donor-receiving-source.v1',manifest:{bytes:manifestBytes.length,sha256:sha(manifestBytes)},files};
}
function validateInput(input){
 need(input.schema===SCHEMA&&OP.test(input.operationId),'Select the complete donor receiving input and retained operation ID.');
 need(typeof input.authorization==='string'&&input.authorization.trim(),'Retain the original case and supplied-action authority.');
 need(/^[0-9a-f]{40}$/.test(input.sourceCommit),'Retain the selected complete published source commit.');
 need(input.portfolio&&UUID.test(input.portfolio.id)&&Number.isSafeInteger(input.portfolio.revision)&&input.portfolio.revision>0&&HASH.test(input.portfolio.snapshot),
  'Select the original complete portfolio and exact revision.');
 need(UUID.test(input.reportId)&&UUID.test(input.correctionReportId)&&input.reportId!==input.correctionReportId,
  'Retain both supplied original report IDs.');
 need(input.archive&&typeof input.archive.path==='string'&&Number.isSafeInteger(input.archive.bytes)&&
  input.archive.bytes>0&&input.archive.bytes<=4*1024*1024*1024&&HASH.test(input.archive.sha256),
  'Select the complete original portfolio archive.');
 need(Array.isArray(input.producerSteps)&&same(input.producerSteps.map(step=>step.phase),PHASES)&&
  Array.isArray(input.recipientSteps)&&same(input.recipientSteps.map(step=>step.phase),RETURN_PHASES),
  'Supply the complete ordered original donor and recipient actions.');
 const ids=[];
 for(const step of [...input.producerSteps,...input.recipientSteps]){
  const request=step.request;
  need(request?.action==='portfolio.save'&&request.payload?.id===input.portfolio.id&&
   request.payload.programme?.schema==='stellar-forge.grant-programme.v1'&&
   Array.isArray(request.payload.programme.changes)&&request.payload.programme.changes.length>0&&
   typeof request.operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(request.operationId),
   'Every supplied stage selects its complete original programme save.');
  need(bytes(request).length<=1024*1024,'Each complete original saved action must fit the maintained one MiB input.');
  ids.push(request.operationId);
 }
 for(const label of ['receive-original','producer-delivery','receive-producer','recipient-return','receive-return'])
  ids.push(input.operationId+':'+label);
 need(new Set(ids).size===ids.length&&ids.every(id=>id.length<=160),'Keep distinct original request identities.');
 for(const name of ['producer','recipient','return'])
  need(typeof input.connections?.[name]==='string'&&resolve(input.connections[name])===input.connections[name],
   'Select three actual existing console connection files.');
}
async function runDonorReceiving(inputFile,out){
 const original=await read(inputFile,8*1024*1024),input=JSON.parse(original);validateInput(input);
 await mkdir(out,{recursive:true,mode:0o700});
 need(await realpath(out)===out,'Keep the exact original receiving directory.');
 const info=await lstat(out);need(info.isDirectory()&&(info.mode&0o077)===0&&
  (typeof process.getuid!=='function'||info.uid===process.getuid()),'Use the private operator-owned output directory.');
 await retain(join(out,'receiving-input.json'),original);
 const source=await sourceSelection();await retain(join(out,'source-selection.json'),bytes(source));
 const binding={schema:SCHEMA,operationId:input.operationId,sourceCommit:input.sourceCommit,
  input:{bytes:original.length,sha256:sha(original)},sourceSha256:sha(bytes(source))};
 await retain(join(out,'selection.json'),bytes(binding));
 const originalArchive=await fileIdentity(resolve(input.archive.path));
 need(originalArchive.bytes===input.archive.bytes&&originalArchive.sha256===input.archive.sha256,'The original selected archive changed.');
 const existing=await optionalJson(join(out,'COMPLETE.json'));
 if(existing){
  const expected=['01-workspaces','02-original-receiving',...PHASES,'04-complete-producer-history','05-customer-delivery',
   '06-customer-receiving','07-original-customer-history',...RETURN_PHASES,'08-complete-customer-history',
   '09-replay-original-delivery','10-complete-customer-return','11-independent-return-receiving','12-complete-return-history'];
  need(existing.schema==='stellar-forge.donor-receiving-result.v1'&&same(existing.binding,binding)&&
   existing.state==='COMPLETE'&&existing.clientsClosed===true&&existing.error===null&&
   Array.isArray(existing.phases)&&same(existing.phases.map(phase=>phase.name),expected)&&
   Array.isArray(existing.artifacts)&&new Set(existing.artifacts.map(row=>row.path)).size===existing.artifacts.length,
   'Reopen the complete original donor receiving result and full ordered journey.');
  for(const artifact of existing.artifacts){
   safeName(artifact.path);need(Number.isSafeInteger(artifact.bytes)&&artifact.bytes>0&&HASH.test(artifact.sha256),
    'Retain the complete original artifact descriptor.');
   const actual=await fileIdentity(join(out,artifact.path));
   need(actual.bytes===artifact.bytes&&actual.sha256===artifact.sha256,'The retained complete artifact changed: '+artifact.path);
  }
  const required=['03-original-portfolio.json','draft-statement.json','submitted-statement.json',
   'after-source-correction-statement.json','acknowledged-statement.json','correction-draft-statement.json',
   'correction-submitted-statement.json','producer-complete-history.json','recipient-original-complete-history.json',
   'recipient-corrected-complete-history.json','return-complete-history.json','producer-delivery.zip','recipient-return.zip',
   ...expected.filter(name=>/^\d/.test(name)).map(name=>name+'.json'),
   ...[...PHASES.map(name=>'producer-'+name),...RETURN_PHASES.map(name=>'recipient-'+name)].flatMap(name=>
    [name+'-request.json',name+'-response.json',name+'-portfolio.json'])];
  need(required.every(path=>existing.artifacts.some(row=>row.path===path)),'The completed receiving omitted an original output.');
  const final=existing.final;
  need(final?.producer?.id===input.portfolio.id&&final.producer.revision===input.portfolio.revision+4&&
   HASH.test(final.producer.snapshot)&&final.recipient?.id===input.portfolio.id&&
   final.recipient.revision===input.portfolio.revision+6&&HASH.test(final.recipient.snapshot)&&
   final.reportId===input.reportId&&final.correctionReportId===input.correctionReportId&&
   HASH.test(final.originalStatementSha256)&&HASH.test(final.correctionStatementSha256),
   'The completed receiving selected different original reports or portfolio editions.');
  for(const [key,name]of [['delivery','producer-delivery.zip'],['returned','recipient-return.zip']]){
   const artifact=existing.artifacts.find(row=>row.path===name),archive=final[key];
   need(archive?.path===join(out,name)&&archive.bytes===artifact.bytes&&archive.sha256===artifact.sha256,
    'The completed customer archive selection differs.');
  }
  const selected=await optionalJson(join(out,'01-workspaces.json'));
  need(selected?.schema==='stellar-forge.donor-receiving-stage.v1'&&same(selected.binding,binding)&&
   selected.value?.workspaces?.length===3&&new Set(selected.value.workspaces).size===3,
   'Keep the original three workspace identities.');
  const borrowed=[];
  try{
   for(const role of ['producer','recipient','return'])borrowed.push(await connectGrantPortfolio({consoleUrlFile:input.connections[role]}));
   const states=await Promise.all(borrowed.map(client=>client.state()));
   need(same(states.map(state=>state.workspaceId),selected.value.workspaces),'The original completed workspace identities changed.');
   const earlier=await borrowed[0].programmeDonorReport({portfolioId:final.producer.id,revision:final.producer.revision,id:input.reportId});
   const following=await borrowed[2].programmeDonorReport({portfolioId:final.recipient.id,revision:final.recipient.revision,id:input.correctionReportId});
   need(earlier.statement.sha256===final.originalStatementSha256&&following.statement.sha256===final.correctionStatementSha256,
    'The completed original reports differ on selected saved readback.');
  }finally{await Promise.all(borrowed.map(client=>client.dispose()));}
  return existing;
 }
 const clients=[],artifacts=[],phases=[];let failure=null,final=null;
 async function save(name,body){
  safeName(name);await retain(join(out,name),body);
  const value={path:name,bytes:body.length,sha256:sha(body)};
  const prior=artifacts.find(row=>row.path===name);need(!prior||same(prior,value),'Retained artifacts conflict.');
  if(!prior)artifacts.push(value);return value;
 }
 const capture=(name,value)=>save(name,bytes(value));
 async function stage(name,fn){
  const filename=name+'.json',prior=await optionalJson(join(out,filename));let record;
  if(prior){
   need(prior.schema==='stellar-forge.donor-receiving-stage.v1'&&prior.name===name&&same(prior.binding,binding)&&
    Object.hasOwn(prior,'value')&&Array.isArray(prior.artifacts),'The original completed stage selection differs.');
   for(const receipt of prior.artifacts){
    safeName(receipt.path);need(Number.isSafeInteger(receipt.bytes)&&receipt.bytes>0&&HASH.test(receipt.sha256),
     'Retain each complete original stage artifact identity.');
    const actual=await fileIdentity(join(out,receipt.path));
    need(actual.bytes===receipt.bytes&&actual.sha256===receipt.sha256,'The accepted stage artifact changed: '+receipt.path);
    const found=artifacts.find(row=>row.path===receipt.path);need(!found||same(found,receipt),'The retained stage artifact conflicts.');
    if(!found)artifacts.push(receipt);
   }
   record=prior;
  }else{
   const value=await fn();record={schema:'stellar-forge.donor-receiving-stage.v1',name,binding,value,artifacts:structuredClone(artifacts)};
  }
  await capture(filename,record);phases.push({name,artifact:filename});return record.value;
 }
 async function action(client,label,request){
  await capture(label+'-request.json',request);
  let result=await client.action(request);
  if(result.state==='RUNNING')result=await client.wait(request.operationId);
  if(result.state!=='COMPLETED'){
   await capture(label+'-interrupted-'+sha(bytes(result))+'.json',result);
   throw Error('Continue the retained original '+label+' request: '+request.operationId+' ('+result.state+').');
  }
  await capture(label+'-response.json',result);
  const replay=await client.action(request);
  need(replay.state==='COMPLETED'&&replay.id===result.id&&replay.inputSha256===result.inputSha256&&same(replay.result,result.result),
   'Reopening the original request changed its completed result.');
  return result.result;
 }
 async function receive(client,archive,label){
  const actual=await fileIdentity(archive.path);
  need(actual.bytes===archive.bytes&&actual.sha256===archive.sha256,'The complete selected archive changed.');
  const upload=await client.uploadFile(archive.path,{sha256:archive.sha256});
  need(upload.bytes===archive.bytes&&upload.sha256===archive.sha256,'The original archive upload differs.');
  return action(client,label,{operationId:input.operationId+':'+label,action:'portfolio.receive',payload:{object:archive.sha256}});
 }
 async function exportOne(client,portfolio,label){
  const descriptor=await action(client,label,{operationId:input.operationId+':'+label,action:'portfolio.export',
   payload:{portfolioId:portfolio.id,revision:portfolio.revision}});
  const name=label+'.zip',path=join(out,name);
  await client.downloadExport(descriptor.sha256,path,{bytes:descriptor.bytes});
  const actual=await fileIdentity(path);need(actual.sha256===descriptor.sha256&&actual.bytes===descriptor.bytes,
   'The complete customer archive changed.');
  await syncParent(path);artifacts.push({path:name,...actual});return {path,...actual};
 }
 async function readReport(client,portfolio,id,label){
  const result=await client.programmeDonorReport(selection(portfolio,id));
  need(result.portfolioId===portfolio.id&&result.revision===portfolio.revision&&result.snapshot===portfolio.snapshot&&
   result.report?.id===id&&same(result.report,selectedReport(portfolio,id))&&
   result.statement?.schema==='stellar-forge.grant-donor-statement.v1',
   'The donor report reader selected another original edition.');
  if(result.frozen)need(same(result.statement,result.report.publication.donorStatement),'The frozen statement differs.');
  await capture(label+'-statement.json',result);return result;
 }
 async function history(client,portfolio,reportIds,label,referenceClient=null){
  const versions=[];
  for(let revision=1;revision<=portfolio.revision;revision++){
   const value=await client.portfolio(portfolio.id,{revision});
   if(referenceClient)need(same(value,await referenceClient.portfolio(portfolio.id,{revision})),
    'Receiving changed an original complete portfolio revision.');
   versions.push(value);
  }
  need(same(versions.at(-1),portfolio),'Complete historical receiving changed the selected current portfolio.');
  const reports=[];
  for(const id of reportIds){
   const record=selectedReport(portfolio,id),history=await client.programmeHistory({...selection(portfolio,id),collection:'reports'});
   need(history.history.length>0&&same(history.history.at(-1).record,record),'Report history lost its selected edition.');
   const statement=await client.programmeDonorReport(selection(portfolio,id));
   if(referenceClient)need(same(statement,await referenceClient.programmeDonorReport(selection(portfolio,id))),
    'The original report changed during independent receiving.');
   reports.push({id,history,statement});
  }
  const value={portfolio:reference(portfolio),versions,reports};
  await capture(label+'-complete-history.json',value);return {portfolio:reference(portfolio),revisions:versions.length,reports:reports.map(r=>r.id)};
 }
 function retainedPublication(portfolio,original){
  const row=selectedReport(portfolio,input.reportId);
  need(same(row.publication,original.report.publication),'Later work changed the original submitted publication.');
 }
 async function applyStep(client,current,step,label){
  const request=step.request,payload=request.payload,programme=current.definition.programme;
  need(payload.id===current.id&&payload.expectedPortfolioRevision===current.revision&&
   payload.programme.expectedProgrammeRevision===programme.revision,
   'The supplied action must select its exact original predecessor: '+step.phase);
  for(const key of ['name','notes','sources','review'])need(same(payload[key],current.definition[key]),
   'This donor journey must retain the current complete '+key+' selection.');
  const result=await action(client,label,request);
  need(result.id===current.id&&result.revision===current.revision+1&&result.snapshot!==current.snapshot,
   'The original stage did not produce its following portfolio edition.');
  need(same(await client.portfolio(result.id,{revision:result.revision}),result),'The saved stage differs on readback.');
  await capture(label+'-portfolio.json',result);return result;
 }
 try{
  for(const role of ['producer','recipient','return']){
   clients.push(await connectGrantPortfolio({consoleUrlFile:input.connections[role]}));
  }
  const [producer,recipient,returnClient]=clients,states=await Promise.all(clients.map(client=>client.state()));
  need(new Set(states.map(state=>state.workspaceId)).size===3,'Use three distinct original workspaces for complete customer return.');
  const workspaceSelection=await stage('01-workspaces',async()=>{
   const prior=await optionalJson(join(out,'01-workspaces.json')),workspaces=states.map(state=>state.workspaceId);
   if(prior){need(same(prior.value.workspaces,workspaces),'The original console workspace identities changed.');return prior.value;}
   return {workspaces};
  });
  need(same(workspaceSelection.workspaces,states.map(state=>state.workspaceId)),'The selected original workspace identities changed.');
  await stage('02-original-receiving',()=>receive(producer,{...input.archive,path:resolve(input.archive.path)},'receive-original'));
  let current=await producer.portfolio(input.portfolio.id,{revision:input.portfolio.revision});
  need(current.snapshot===input.portfolio.snapshot&&current.definition.programme,'The original selected portfolio differs.');
  await capture('03-original-portfolio.json',current);
  let submitted=null,draft=null;
  for(let index=0;index<input.producerSteps.length;index++){
   const step=input.producerSteps[index],before=current;
   if(step.phase==='source-correction'){
    const changes=step.request.payload.programme.changes;
    const references=[...submitted.statement.observations.map(row=>row.reference),
     ...submitted.statement.selectedRecords.map(row=>row.reference),...submitted.statement.documentRefs];
    need(changes.every(change=>['observations','indicators','documents'].includes(change.collection)&&
     before.definition.programme.records[change.collection].some(row=>row.id===change.id&&row.revision===change.expectedRevision))&&
     changes.some(change=>references.some(ref=>ref.collection===change.collection&&ref.id===change.id)),
     'Supply existing source/result/evidence corrections contributing to this selected original statement.');
    need(!step.request.payload.programme.archive?.length,'This source correction retains its selected original records.');
   }
   current=await applyStep(producer,current,step,'producer-'+step.phase);
   const report=selectedReport(current,input.reportId);
   if(step.phase==='draft'){
    need(report.status==='draft'&&report.donorSelection&&!report.publication,'The original first step must create the selected donor draft.');
    need(!before.definition.programme.records.reports.some(row=>row.id===input.reportId),
     'Use a retained new report ID in the supplied draft action.');
    draft=await readReport(producer,current,input.reportId,'draft');
   }else if(step.phase==='submit'){
    need(report.status==='submitted'&&report.publication?.donorStatement,'Submit the complete selected original donor statement.');
    submitted=await readReport(producer,current,input.reportId,'submitted');
    need(submitted.frozen&&same(submitted.statement.selection,draft.statement.selection),
     'Submission must freeze the selected original draft statement.');
   }else if(step.phase==='source-correction'){
    const changes=step.request.payload.programme.changes;
    need(changes.some(change=>selectedReport(current,input.reportId)&&
     before.definition.programme.records[change.collection].find(row=>row.id===change.id).sha256!==
     current.definition.programme.records[change.collection].find(row=>row.id===change.id).sha256),
     'The selected original source/result/evidence edition must actually change.');
    need(changes.some(change=>['observations','indicators','documents'].includes(change.collection))&&
     !changes.some(change=>change.collection==='reports'),'Supply an actual source/result/evidence correction separately from the frozen report.');
    need(changes.every(change=>before.definition.programme.records[change.collection]?.some(row=>
     row.id===change.id&&row.revision===change.expectedRevision)),
     'Corrections must select existing original source/result/evidence editions.');
    retainedPublication(current,submitted);
    const historical=await producer.programmeDonorReport(selection(before,input.reportId));
    need(same(historical.statement,submitted.statement),'The submitted historical statement changed after a source correction.');
    const observed=await readReport(producer,current,input.reportId,'after-source-correction');
    need(same(observed.statement,submitted.statement),'The original report recomputed from later source/result data.');
   }else{
    need(report.status==='acknowledged','The supplied acknowledgment must retain the original report.');
    retainedPublication(current,submitted);
    const observed=await readReport(producer,current,input.reportId,'acknowledged');
    need(same(observed.statement,submitted.statement),'Acknowledgment changed the frozen donor statement.');
   }
   phases.push({name:step.phase,portfolio:reference(current)});
  }
  const produced=current;
  await stage('04-complete-producer-history',()=>history(producer,produced,[input.reportId],'producer'));
  const delivery=await stage('05-customer-delivery',()=>exportOne(producer,produced,'producer-delivery'));
  await stage('06-customer-receiving',()=>receive(recipient,delivery,'receive-producer'));
  await stage('07-original-customer-history',()=>history(recipient,produced,[input.reportId],'recipient-original',producer));
  let corrected=produced,followingDraft=null;
  for(const step of input.recipientSteps){
   const previous=corrected;
   corrected=await applyStep(recipient,corrected,step,'recipient-'+step.phase);
   retainedPublication(corrected,submitted);
   const report=selectedReport(corrected,input.correctionReportId);
   need(report.donorSelection?.supersedesReportId===input.reportId&&report.donorSelection.correctionReason.trim(),
    'The following report must name and explain its original submitted report.');
   if(step.phase==='correction-draft'){
    need(report.status==='draft'&&!report.publication&&!previous.definition.programme.records.reports.some(row=>row.id===input.correctionReportId),
     'Use the supplied new correction draft ID.');
    followingDraft=await readReport(recipient,corrected,input.correctionReportId,'correction-draft');
   }else{
    need(report.status==='submitted'&&report.publication?.donorStatement,'Submit the complete following donor report.');
    const following=await readReport(recipient,corrected,input.correctionReportId,'correction-submitted');
    need(following.frozen&&same(following.statement.selection,followingDraft.statement.selection)&&
     following.statement.supersedes?.report.id===input.reportId&&
     following.statement.supersedes.statementSha256===submitted.statement.sha256,
     'The complete following publication must retain its original report linkage.');
   }
   phases.push({name:step.phase,portfolio:reference(corrected)});
  }
  await stage('08-complete-customer-history',()=>history(recipient,corrected,[input.reportId,input.correctionReportId],'recipient-corrected'));
  await stage('09-replay-original-delivery',async()=>{
   const before=await recipient.state(),selected=before.portfolios.find(row=>row.id===corrected.id);
   need(selected&&selected.revision>=corrected.revision,'Retain the current customer revision.');
   const latest=await recipient.portfolio(corrected.id,{revision:selected.revision});
   await receive(recipient,delivery,'receive-producer');
   const after=await recipient.state(),reopened=after.portfolios.find(row=>row.id===corrected.id);
   need(reopened?.revision===selected.revision&&after.revision===before.revision&&
    same(await recipient.portfolio(corrected.id,{revision:reopened.revision}),latest),
    'Reopening the original delivery changed later customer work.');
   return {portfolio:reference(latest),workspaceRevision:after.revision};
  });
  const returned=await stage('10-complete-customer-return',()=>exportOne(recipient,corrected,'recipient-return'));
  await stage('11-independent-return-receiving',()=>receive(returnClient,returned,'receive-return'));
  await stage('12-complete-return-history',()=>history(returnClient,corrected,[input.reportId,input.correctionReportId],'return',recipient));
  final={producer:reference(produced),recipient:reference(corrected),reportId:input.reportId,
   correctionReportId:input.correctionReportId,originalStatementSha256:submitted.statement.sha256,
   correctionStatementSha256:selectedReport(corrected,input.correctionReportId).publication.donorStatement.sha256,delivery,returned};
 }catch(error){failure={name:error.name,code:error.code??null,message:String(error.message).replace(/https?:\/\/127\.0\.0\.1:\d+\/#[^\s]+/g,'[private console]')};}
 finally{
  const closing=await Promise.allSettled(clients.map(client=>client.dispose()));
  const errors=closing.filter(value=>value.status==='rejected').map(value=>String(value.reason));
  if(errors.length)failure={...(failure??{name:'ClientCloseError'}),closureErrors:errors};
 }
 const result={schema:'stellar-forge.donor-receiving-result.v1',binding,state:failure?'INTERRUPTED':'COMPLETE',
  clientsClosed:clients.length===3&&clients.every(client=>client.closed),phases,artifacts,final,error:failure};
 if(!result.clientsClosed)result.state='INTERRUPTED';
 await retain(join(out,result.state==='COMPLETE'?'COMPLETE.json':'INTERRUPTED-'+sha(bytes(result))+'.json'),bytes(result));
 if(result.state!=='COMPLETE')throw Object.assign(Error('Continue the original donor receiving operation.'),{result});
 return result;
}

/** Prepare all six retained actions from one actual original portfolio read. */
export async function prepareDonorReceivingInput(client,spec){
 const original=structuredClone(spec),portfolio=await client.portfolio(original.portfolio.id,{revision:original.portfolio.revision});
 need(portfolio.snapshot===original.portfolio.snapshot&&portfolio.definition.programme,
  'Prepare against the original selected complete programme.');
 need(typeof original.actor==='string'&&original.actor.trim()&&original.actor.length<=240,'Supply the actual recording actor.');
 const reportId=original.reportId??randomUUID(),correctionReportId=original.correctionReportId??randomUUID();
 need(UUID.test(reportId)&&UUID.test(correctionReportId)&&reportId!==correctionReportId&&
  !portfolio.definition.programme.records.reports.some(row=>[reportId,correctionReportId].includes(row.id)),
  'Retain distinct new report identities.');
 const reportFields=structuredClone(original.reportFields);
 need(reportFields?.donorSelection&&reportFields.status==='draft'&&!reportFields.submittedDate&&
  !Object.hasOwn(reportFields,'publication'),'Supply the complete selected draft fields.');
 need(typeof original.submittedDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(original.submittedDate)&&
  typeof original.correctionSubmittedDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(original.correctionSubmittedDate),
  'Supply actual complete submission dates.');
 need(Array.isArray(original.sourceChanges)&&original.sourceChanges.length>0,
  'Supply the reviewed correction of the original source/result/evidence.');
 const sourceChanges=original.sourceChanges.map(change=>{
  need(['observations','indicators','documents'].includes(change.collection),'Choose original result/evidence corrections.');
  const record=portfolio.definition.programme.records[change.collection].find(row=>row.id===change.id);
  need(record&&!record.archived&&change.expectedRevision===record.revision&&change.fields&&
   typeof change.fields==='object'&&!Array.isArray(change.fields),'Select each actual existing correction and original revision.');
  return structuredClone(change);
 });
 const changes=original.correctionFields??{};
 need(Object.keys(changes).every(key=>['title','owner','dueDate','recipient','documentIds','narrative','notes','sourceRefs','donorSelection'].includes(key)),
  'A following report retains the original project, grant and reporting period.');
 const nextFields={...structuredClone(reportFields),...structuredClone(changes),status:'draft',submittedDate:null,
  donorSelection:{...structuredClone(changes.donorSelection??reportFields.donorSelection),supersedesReportId:reportId,
   correctionReason:original.correctionReason}};
 need(typeof original.correctionReason==='string'&&original.correctionReason.trim(),'Explain the actual following report.');
 const {name,notes,sources,review}=portfolio.definition;let offset=0;
 function step(phase,recordChanges){
  return {phase,request:{operationId:original.operationId+':'+phase,action:'portfolio.save',
   payload:{id:portfolio.id,expectedPortfolioRevision:portfolio.revision+offset,name,notes,
    sources:structuredClone(sources),review:structuredClone(review),programme:{
     schema:'stellar-forge.grant-programme.v1',expectedProgrammeRevision:portfolio.definition.programme.revision+offset++,
     actor:original.actor,changes:recordChanges}}}};
 }
 const change=(id,expectedRevision,fields)=>({collection:'reports',id,expectedRevision,fields});
 const producerSteps=[
  step('draft',[change(reportId,0,reportFields)]),
  step('submit',[change(reportId,1,{status:'submitted',submittedDate:original.submittedDate})]),
  step('source-correction',sourceChanges),
  step('acknowledge',[change(reportId,2,{status:'acknowledged'})]),
 ];
 const recipientSteps=[
  step('correction-draft',[change(correctionReportId,0,nextFields)]),
  step('correction-submit',[change(correctionReportId,1,{status:'submitted',submittedDate:original.correctionSubmittedDate})]),
 ];
 const result={schema:SCHEMA,operationId:original.operationId,authorization:original.authorization,
  sourceCommit:original.sourceCommit,connections:structuredClone(original.connections),archive:structuredClone(original.archive),
  portfolio:reference(portfolio),reportId,correctionReportId,producerSteps,recipientSteps};
 validateInput(result);return result;
}

export {runDonorReceiving};
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==4||!['--input','--prepare'].includes(args[0])||args[2]!=='--out')
  throw Error('Use --input ORIGINAL.json --out PRIVATE_DIRECTORY or --prepare SPEC.json --out PRIVATE_DIRECTORY');
 const out=resolve(args[3]);
 if(args[0]==='--prepare'){
  await mkdir(out,{recursive:true,mode:0o700});const info=await lstat(out);
  need(await realpath(out)===out&&info.isDirectory()&&(info.mode&0o077)===0&&
   (typeof process.getuid!=='function'||info.uid===process.getuid()),'Keep the private original preparation directory.');
  const body=await read(resolve(args[1]),2*1024*1024),spec=JSON.parse(body);
  await retain(join(out,'donor-preparation.json'),body);
  const filename=join(out,'donor-receiving-input.json');let prepared=await optionalJson(filename);
  if(!prepared){
   const client=await connectGrantPortfolio({consoleUrlFile:spec.connections?.producer});
   try{prepared=await prepareDonorReceivingInput(client,spec);await retain(filename,bytes(prepared));}
   finally{await client.dispose();}
  }else validateInput(prepared);
  process.stdout.write(JSON.stringify({schema:SCHEMA,state:'PREPARED',input:filename,operationId:prepared.operationId,...await fileIdentity(filename)})+'\n');
 }else{
  const result=await runDonorReceiving(resolve(args[1]),out);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }
}
