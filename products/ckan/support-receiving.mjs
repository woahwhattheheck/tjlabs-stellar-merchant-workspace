// MIT. Receive a complete original CKAN archive into a new private Support workspace.
// The optional availability exercise moves only this programme's newly received copy.
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,lstat,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {receiveCkanWorkspaceArchive} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/archive.mjs';
import {reviewCkanSource,collectCkanObservation} from '../../stellar/scf-starforge-20261009/sf93-seller-support-bundle/ckan-source.mjs';
import {readCkanObservationFiles,CKAN_FILES} from '../../stellar/scf-starforge-20261009/sf93-seller-support-bundle/ckan-observation.mjs';
import {initializeIncidentStore,openIncidentStore} from '../../stellar/scf-starforge-20261009/sf93-seller-support-bundle/incident-store.mjs';
import {openIncidentSources} from '../../stellar/scf-starforge-20261009/sf74-merchant-support-console/incident-sources.mjs';
import {serializeWorkspace} from '../../stellar/scf-starforge-20261009/sf74-merchant-support-console/workspace-file.mjs';
import {openCaseStore} from '../../stellar/scf-starforge-20261009/sf74-merchant-support-console/case-store.mjs';
import {inspectRuntimeFiles,exportRuntimeHandoff,importRuntimeHandoff,reviewRuntime,RUNTIME_SCHEMA}
  from '../../stellar/scf-starforge-20261009/sf74-merchant-support-console/runtime-support.mjs';
import {ckanCaptureHtml} from '../../stellar/scf-starforge-20261009/sf74-merchant-support-console/ckan-render.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const assert=(value,message)=>{if(!value)throw new Error(message);};
const stamp=()=>new Date().toISOString();
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const encoded=files=>Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,bytes.toString('base64')]));
async function save(path,value){await mkdir(dirname(path),{recursive:true,mode:0o700});await writeFile(path,value,{mode:0o600});}
async function json(path,value){await save(path,JSON.stringify(value,null,2)+'\n');}
async function filesIn(root,relative=''){
  const result=[];
  for(const name of (await readdir(join(root,relative))).sort()){
    const path=relative?relative+'/'+name:name,full=join(root,path),stat=await lstat(full);
    assert(!stat.isSymbolicLink(),'The received output contains a symbolic link: '+path);
    if(stat.isDirectory())result.push(...await filesIn(root,path));
    else if(stat.isFile()){const bytes=await readFile(full);result.push({path,bytes:bytes.length,sha256:digest(bytes)});}
  }
  return result;
}
function request(value){
  assert(value&&typeof value==='object'&&!Array.isArray(value),'Supply a complete receiving request.');
  const names=['schema','operationId','archive','archiveSha256','directory','inputs','sourceId','refreshId','publicationId',
    'expectedRows','exerciseAvailability','merchantId','label'];
  assert(Object.keys(value).every(key=>names.includes(key))&&value.schema==='stellar-forge.ckan-support-receiving-request.v1',
    'Use the original CKAN Support receiving request schema.');
  assert(typeof value.operationId==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(value.operationId),'Choose a stable operation ID.');
  assert(typeof value.archive==='string'&&typeof value.directory==='string'&&/^[a-f0-9]{64}$/.test(value.archiveSha256??''),
    'Select an original complete archive, its SHA-256 and a private receiving directory.');
  assert(value.exerciseAvailability===undefined||typeof value.exerciseAvailability==='boolean','Use a boolean availability selection.');
  assert(value.expectedRows===undefined||Number.isSafeInteger(value.expectedRows)&&value.expectedRows>=0,'Use the actual original row count.');
  assert(value.inputs&&typeof value.inputs==='object','Supply the operator-selected original case inputs.');
  return {...value,archive:resolve(value.archive),directory:resolve(value.directory),
    merchantId:value.merchantId??'ckan-source',label:value.label??'CKAN received source'};
}

/** The original archive receiver, watcher and CaseStore own every product write. */
export async function receiveCkanSupport(input,{onProgress=()=>{}}={}){
  const q=request(input),root=q.directory,project=join(root,'project'),parked=join(root,'project-unavailable');
  const stateDirectory=join(root,'incidents'),sourceFile=join(root,'incident-sources.json');
  const report={schema:'stellar-forge.ckan-support-receiving.v1',operationId:q.operationId,
    startedAt:stamp(),state:'RUNNING',archive:{path:q.archive,sha256:q.archiveSha256},phases:[]};
  let desk=null,moved=false;
  async function phase(name,result){
    report.phases.push({name,completedAt:stamp(),result});
    await json(join(root,'receiving.json'),report);onProgress({phase:name,result});
  }
  await mkdir(root,{mode:0o700}); // Create-only: this operation owns its whole receiving copy.
  try{
    const original=await readFile(q.archive);
    assert(digest(original)===q.archiveSha256,'The original archive SHA-256 changed.');
    const received=await receiveCkanWorkspaceArchive({file:q.archive,directory:project,expectedSha256:q.archiveSha256});
    assert(received.state==='COMPLETE','The original archive receiving did not complete.');
    await phase('original-workspace-received',received);
    const selected=Object.fromEntries(['sourceId','refreshId','publicationId'].filter(key=>q[key]!==undefined).map(key=>[key,q[key]]));
    const review=await reviewCkanSource({directory:project,...selected});
    assert(review.summary.coverage==='COMPLETE','Original CKAN source coverage is incomplete.');
    if(q.expectedRows!==undefined)assert(review.summary.publication?.verifiedOutput?.rowCount===q.expectedRows,
      'The retained publication row count differs from the selected original.');
    const merchant={id:q.merchantId,label:q.label,ckan:review.ckan};
    const first=await collectCkanObservation(merchant);
    assert(first.packet?.kind==='CKAN_WORKBENCH','The original CKAN collector did not return its packet.');
    const checked=readCkanObservationFiles(first.packet.files);
    assert(checked.summary.coverage==='COMPLETE'&&checked.summary.workbench.stable===true,'The initial original files changed during collection.');
    for(const name of CKAN_FILES)await save(join(root,'captures','initial',name),first.packet.files[name]);
    await phase('registered-original-source',{registration:review.ckan,summary:review.summary,
      packet:Object.entries(first.packet.files).map(([name,bytes])=>({name,bytes:bytes.length,sha256:digest(bytes)}))});
    await initializeIncidentStore({directory:stateDirectory,config:{
      schema:'stellar-forge.seller-watch-config.v1',pollMs:500,failurePolls:2,recoveryPolls:2,
      captureEveryMs:1000,merchants:[merchant],notification:null}});
    await json(sourceFile,{schema:'stellar-forge.support-incident-sources.v1',sources:[{
      id:'received',label:q.label,directory:stateDirectory,
      ckanWorkspaces:[{id:'original',label:q.label,directory:project}]}]});
    desk=await openIncidentSources({configPath:sourceFile});
    const profiles=desk.profiles(),listed=await desk.list('received');
    assert(profiles.sources[0].ckanWorkspaces[0].id==='original','The named original workspace did not reach the console.');
    const inspected=await desk.inspectCkan('received',{ckanSourceId:'original',
      expectedConfigRevision:listed.configRevision,...selected});
    assert(inspected.ckan.projectCreatedAt===review.ckan.projectCreatedAt,'The console selected a different original project.');
    assert(inspected.originalJson===JSON.stringify(inspected.summary,null,2),'The complete original review did not survive its API projection.');
    await phase('console-registration-reviewed',{profiles,configRevision:listed.configRevision,configHash:listed.configHash,
      summary:inspected.summary});
    await desk.start('received',{expectedConfigRevision:listed.configRevision,expectedConfigHash:listed.configHash});
    const store=await openIncidentStore(stateDirectory);
    async function until(label,select){
      const deadline=Date.now()+120000;
      while(Date.now()<deadline){
        const state=await store.read(),found=select(state);
        if(found)return found;
        if(state.worker?.lastError)throw new Error(label+': '+state.worker.lastError);
        await sleep(100);
      }
      throw new Error('Original watcher timed out while waiting for '+label);
    }
    const healthy=await until('the original complete baseline',state=>
      state.merchants[q.merchantId]?.ckanObservation?.coverage==='COMPLETE'&&
      state.merchants[q.merchantId]?.lastCapture?state.merchants[q.merchantId]:null);
    await phase('watcher-baseline-observed',{capture:healthy.lastCapture,observation:healthy.ckanObservation});
    let incident=null,handoff;
    const workspaceText=await serializeWorkspace({name:q.label+' — original CKAN Support',
      inputs:q.inputs,workorderSource:'runtime',termsText:''});
    if(q.exerciseAvailability){
      await rename(project,parked);moved=true;
      const opened=await until('two observed source failures',state=>state.incidents.find(row=>
        row.merchantId===q.merchantId&&row.kind==='CKAN_SOURCE_UNAVAILABLE'&&row.status==='OPEN'));
      // The operator is this receiving programme, recorded explicitly in the original audit event.
      let acknowledged=false;
      for(let attempt=0;attempt<12&&!acknowledged;attempt++){
        const detail=await desk.view('received',opened.id);
        try{await desk.acknowledge('received',opened.id,{expectedRevision:detail.incident.revision,
          by:'CKAN Support receiving',notes:'Availability exercise on this operation’s newly received private copy.'});acknowledged=true;}
        catch(error){if(!/REVISION_CONFLICT/.test(error.code??error.message)||attempt===11)throw error;}
      }
      await phase('original-incident-opened-and-acknowledged',(await desk.view('received',opened.id)).incident);
      await rename(parked,project);moved=false;
      incident=await until('two fresh complete recovery observations',state=>state.incidents.find(row=>
        row.id===opened.id&&row.status==='RECOVERED'&&row.afterCapture));
      await desk.close();desk=null;
      const reader=await openIncidentSources({configPath:sourceFile});
      try{
        const detail=await reader.view('received',incident.id);
        assert(detail.ckanObservations.after.coverage==='COMPLETE','The original recovered capture is incomplete.');
        const transported=JSON.parse(JSON.stringify(detail));
        assert(transported.ckanObservations.after.originalJson===detail.ckanObservations.after.originalJson,
          'The complete original incident JSON changed in browser delivery.');
        handoff=await reader.prepareCase('received',incident.id,{expectedRevision:detail.incident.revision,
          workspaceText,routeId:q.merchantId});
        await json(join(root,'incident.json'),detail);
        await phase('original-incident-recovered',{incident:detail.incident,route:detail.routes});
      }finally{await reader.close();}
    }else{
      await desk.close();desk=null;
      const second=await collectCkanObservation(merchant);
      assert(second.packet,'The follow-up original capture is missing.');
      const capture=packet=>inspectRuntimeFiles({files:encoded(packet.files),inputs:q.inputs,routeId:q.merchantId}).capture;
      const supportText=JSON.stringify({schema:RUNTIME_SCHEMA,before:capture(first.packet),after:capture(second.packet)},null,2)+'\n';
      handoff=await exportRuntimeHandoff({workspaceText,supportText,metadata:{
        merchant:q.label,owner:'',status:'ready',followUpOn:'',nextAction:'Review the original CKAN source and publication.',notes:''}});
      await phase('original-captures-attached',{before:readCkanObservationFiles(first.packet.files).meta.generatedAt,
        after:readCkanObservationFiles(second.packet.files).meta.generatedAt});
    }
    const restored=await importRuntimeHandoff(handoff.handoff),caseId=randomUUID();
    const cases=await openCaseStore(join(root,'cases'));
    const saved=await cases.save({id:caseId,expectedRevision:null,...restored});
    const reopened=await cases.read(caseId);
    assert(reopened.workspaceText===restored.workspaceText&&reopened.supportText===restored.supportText,
      'The original saved case did not reopen with the same complete sources.');
    const exported=await exportRuntimeHandoff({...restored});
    const imported=await importRuntimeHandoff(exported.handoff);
    const destination=await openCaseStore(join(root,'received-cases')),receivedId=randomUUID();
    const receivedCase=await destination.save({id:receivedId,expectedRevision:null,...imported});
    const independent=await destination.read(receivedId);
    assert(independent.supportText===reopened.supportText&&independent.workspaceText===reopened.workspaceText,
      'Independent case receiving changed the original workspace or Support bytes.');
    const runtime=reviewRuntime(independent.supportText,q.inputs),browser=JSON.parse(JSON.stringify(runtime));
    for(const side of ['before','after']){
      const capture=runtime[side];
      if(!capture)continue;
      assert(capture.kind==='CKAN_WORKBENCH','Case receiving changed the capture kind.');
      const rendered=ckanCaptureHtml(browser[side]);
      await save(join(root,side+'-capture.html'),rendered);
      for(const [name,text] of Object.entries(capture.ckan.originalDocuments)){
        assert(browser[side].ckan.originalDocuments[name]===text,'Browser delivery changed the original '+name);
      }
      const parsed=JSON.parse(independent.supportText)[side];
      for(const [name,file] of Object.entries(parsed.files))
        await save(join(root,'captures',side,name),Buffer.from(file.data,'base64'));
    }
    await save(join(root,'CKAN_Support_Handoff.json'),exported.handoff);
    await save(join(root,'CKAN_Support_Handoff.html'),exported.html);
    await save(join(root,'Merchant_Workspace.json'),independent.workspaceText);
    await save(join(root,'Runtime_Support.json'),independent.supportText);
    await json(join(root,'runtime-review.json'),runtime);
    await phase('original-case-saved-exported-and-received',{sourceCase:saved.case,receivedCase:receivedCase.case,
      workspaceSha256:digest(reopened.workspaceText),supportSha256:digest(reopened.supportText),
      handoffSha256:digest(exported.handoff),comparison:runtime.comparison,
      captureKinds:['before','after'].filter(side=>runtime[side]).map(side=>({side,kind:runtime[side].kind,
        coverage:runtime[side].ckan.coverage,publishedRows:runtime[side].ckan.publication?.verifiedOutput?.rowCount??null}))});
    const final=readCkanObservationFiles((await collectCkanObservation(merchant)).packet.files);
    assert(final.summary.coverage==='COMPLETE'&&final.summary.workbench.stable===true,
      'The original received project did not remain complete after the Support journey.');
    assert(final.summary.workbench.afterSha256===checked.summary.workbench.afterSha256,
      'Support processing changed the original CKAN workbench.');
    await phase('original-workbench-preserved',{sha256:final.summary.workbench.afterSha256,
      publishedRows:final.summary.publication?.verifiedOutput?.rowCount??null});
    report.state='COMPLETE';report.completedAt=stamp();await json(join(root,'receiving.json'),report);
    const files=(await filesIn(root)).filter(row=>row.path!=='files.json');
    await json(join(root,'files.json'),{schema:'stellar-forge.ckan-support-receiving-files.v1',
      operationId:q.operationId,files,bytes:files.reduce((n,row)=>n+row.bytes,0)});
    return report;
  }catch(error){
    report.state='FAILED';report.completedAt=stamp();report.error={code:error.code??null,message:error.message};
    await json(join(root,'receiving.json'),report).catch(()=>{});throw error;
  }finally{
    if(desk)await desk.close();
    if(moved)await rename(parked,project);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    assert(process.argv.length===3,'Usage: node products/ckan/support-receiving.mjs /absolute/support-request.json');
    const value=JSON.parse(await readFile(resolve(process.argv[2]),'utf8'));
    const result=await receiveCkanSupport(value,{onProgress:row=>process.stderr.write(JSON.stringify(row)+'\n')});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(error){process.stderr.write((error.stack??String(error))+'\n');process.exitCode=1;}
}
