// MIT. Read-only CKAN source collection for SF93; the original project keeps its writer.
import {lstat,realpath,readdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {readPrivate,identity} from '../sf30-seller-sdk/postgres/publisher/files.mjs';
import {readCkanCapture,parseCkanJson} from '../sf30-seller-sdk/ckan/capture.mjs';
import {readCkanRefreshComparison} from '../sf30-seller-sdk/ckan/refresh.mjs';
import {loadDatasetConfig} from '../sf30-seller-sdk/dataset-handler.mjs';
import {inspectCkanMerchantPackage} from '../sf30-seller-sdk/ckan/publisher/release.mjs';
import {normalizeCkanSource,createCkanObservation,readCkanWorkbenchState,selectCkanRecords,
  ckanObservationHash,ckanRetainedPath} from './ckan-observation.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const iso=()=>new Date().toISOString();
const fail=code=>{throw Object.assign(new Error(code),{code});};
const check=signal=>{if(signal?.aborted)fail('CKAN_SOURCE_READ_ABORTED');};
const codeOf=error=>{
  if(error?.code==='ENOENT')return 'CKAN_SOURCE_UNAVAILABLE';
  if(/^[A-Z0-9_]{1,120}$/.test(error?.code??''))return error.code;
  return 'CKAN_SOURCE_READ_FAILED';
};
async function within(timeoutMs,outer,callback){
  if(outer!==undefined&&!(outer instanceof AbortSignal))fail('CKAN_SOURCE_ABORT_SIGNAL_INVALID');
  const controller=new AbortController(),stop=()=>controller.abort();
  if(outer?.aborted)stop();else outer?.addEventListener('abort',stop,{once:true});
  const timer=setTimeout(stop,timeoutMs);
  try{check(controller.signal);return await callback(controller.signal);}
  finally{clearTimeout(timer);outer?.removeEventListener('abort',stop);}
}
function signature(stat){
  return [stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs,stat.mode,stat.uid,stat.nlink].join(':');
}
async function privateRoot(directory){
  if(typeof directory!=='string'||directory!==resolve(directory)||directory==='/')fail('CKAN_SOURCE_DIRECTORY_INVALID');
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)||stat.uid!==process.getuid()||
      await realpath(directory)!==directory)fail('CKAN_SOURCE_PRIVATE_DIRECTORY_REQUIRED');
  return signature(stat).split(':').slice(0,2).join(':');
}
async function sourceReader(selection,signal){
  const root=selection.directory,rootIdentity=await privateRoot(root);
  const files=new Map(),missing=new Set();let total=0;
  async function parents(relative){
    ckanRetainedPath(relative);check(signal);
    if(await privateRoot(root)!==rootIdentity)fail('CKAN_SOURCE_CHANGED_DURING_READ');
    let path=root;
    for(const name of relative.split('/').slice(0,-1)){
      path=join(path,name);const stat=await lstat(path);
      if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)||stat.uid!==process.getuid())
        fail('CKAN_SOURCE_PRIVATE_DIRECTORY_REQUIRED');
    }
    if(await realpath(dirname(join(root,relative)))!==dirname(join(root,relative)))fail('CKAN_SOURCE_PATH_CHANGED');
  }
  async function raw(relative,maximum,{optional=false}={}){
    check(signal);
    let before;
    try{
      await parents(relative);
      before=await lstat(join(root,relative));
    }catch(error){
      if(error.code==='ENOENT'&&optional){missing.add(relative);return null;}
      throw error;
    }
    if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||(before.mode&0o077)||before.uid!==process.getuid())
      fail('CKAN_SOURCE_PRIVATE_FILE_REQUIRED');
    if(before.size>maximum)fail('CKAN_OBSERVATION_WORKLOAD_LIMIT');
    const buffer=await readPrivate(join(root,relative),maximum);
    check(signal);await parents(relative);
    const after=await lstat(join(root,relative));
    if(signature(before)!==signature(after)||buffer.length!==before.size)fail('CKAN_SOURCE_CHANGED_DURING_READ');
    return buffer;
  }
  function bind(buffer,descriptor){
    if(!descriptor)return;
    if(!HASH.test(descriptor.sha256??'')||descriptor.bytes!==undefined&&
      (!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<0))fail('CKAN_RETAINED_DESCRIPTOR_INVALID');
    if(ckanObservationHash(buffer)!==descriptor.sha256||
      descriptor.bytes!==undefined&&buffer.length!==descriptor.bytes)fail('CKAN_RETAINED_DIGEST_CHANGED');
  }
  async function add(path,role,descriptor,{optional=false,limit=selection.maxBytes}={}){
    ckanRetainedPath(path);check(signal);
    if(files.has(path)){const row=files.get(path);bind(row.buffer,descriptor);return row.buffer;}
    if(files.size>=selection.maxFiles)fail('CKAN_OBSERVATION_WORKLOAD_LIMIT');
    if(descriptor?.bytes!==undefined&&descriptor.bytes>selection.maxBytes-total)fail('CKAN_OBSERVATION_WORKLOAD_LIMIT');
    let buffer;
    try{buffer=await raw(path,Math.min(limit,selection.maxBytes-total),{optional});}
    catch(error){if(error.code==='ENOENT')fail('CKAN_RETAINED_FILE_MISSING');throw error;}
    if(buffer===null)return null;
    // Retain changed original bytes as evidence before reporting the failed binding.
    files.set(path,{path,role,buffer});total+=buffer.length;bind(buffer,descriptor);
    return buffer;
  }
  async function capture(base,expectedHash){
    const manifestRaw=await add(base+'capture.json','edition-manifest',{sha256:expectedHash});
    const manifest=parseCkanJson(manifestRaw);
    if(!Array.isArray(manifest.files))fail('CKAN_CAPTURE_MANIFEST_INVALID');
    for(const row of manifest.files){
      if(!/^(package|resource|resource-after|schema|schema-after)\.json$|^pages\/\d{8}\.json$/.test(row.file??''))
        fail('CKAN_CAPTURE_FILE_INVALID');
      await add(base+row.file,'edition-member',row);
    }
    check(signal);
    // Original validator owns DataStore identity, exact numbers, paging and CSVW consistency.
    const value=await readCkanCapture(join(root,base,'capture.json'),expectedHash);
    check(signal);return value;
  }
  async function verifyStable(){
    for(const row of files.values()){
      const current=await raw(row.path,row.buffer.length);
      if(!current.equals(row.buffer))fail('CKAN_SOURCE_CHANGED_DURING_READ');
    }
    for(const path of missing){
      check(signal);
      try{await lstat(join(root,path));fail('CKAN_SOURCE_CHANGED_DURING_READ');}
      catch(error){if(error.code!=='ENOENT')throw error;}
    }
  }
  return {root,files,raw,add,capture,verifyStable,get total(){return total;}};
}
async function publicationFiles(reader,record,selection,signal){
  const base='publications/'+record.id+'/',candidate=record.run?.data?.candidate;
  await reader.add(base+'workspace.json','publication-workspace',undefined,{optional:!candidate,limit:262144});
  if(!candidate)return;
  if(!UUID.test(record.runId??'')||record.run?.id!==record.runId)fail('CKAN_PUBLICATION_BINDING_CHANGED');
  const run=base+'runs/'+record.runId+'/';
  await reader.add(run+'candidate.json','publication-candidate',undefined,{limit:262144});
  const configRaw=await reader.add(run+'dataset.json','publication-dataset',{sha256:candidate.configHash},{limit:65536});
  const config=parseCkanJson(configRaw);
  // The selected candidate's file must stay inside this exact native run.
  if(config.schema!=='stellar-forge.csv-dataset.v1'||config.file!=='data.csv')fail('CKAN_PUBLICATION_DATASET_INVALID');
  await reader.add(run+'data.csv','publication-data',{sha256:candidate.csvHash,bytes:candidate.csvBytes});
  check(signal);
  const dataset=await loadDatasetConfig(join(reader.root,run,'dataset.json'));
  if(identity(dataset.describe())!==identity(candidate.dataset))fail('CKAN_OUTPUT_INVALID');
  check(signal);
  // SQLite plan IDs differ from the original immutable folder UUID. Select the
  // retained plan by its candidate digest, keeping the original DB read-only.
  const directories=await readdir(join(reader.root,base,'plans'),{withFileTypes:true});
  if(directories.length>selection.maxFiles)fail('CKAN_OBSERVATION_WORKLOAD_LIMIT');
  const matches=[];
  for(const entry of directories){
    check(signal);
    if(!UUID.test(entry.name)||!entry.isDirectory()||entry.isSymbolicLink())fail('CKAN_PUBLICATION_PLAN_INVALID');
    const path=base+'plans/'+entry.name+'/',raw=await reader.raw(path+'plan.json',Math.min(selection.maxBytes,262144));
    const plan=parseCkanJson(raw);
    if(plan.digest===candidate.planDigest)matches.push({path,raw,plan});
  }
  if(matches.length!==1)fail('CKAN_PUBLICATION_PLAN_INVALID');
  const {path,plan}=matches[0];
  await reader.add(path+'plan.json','publication-plan',{sha256:ckanObservationHash(matches[0].raw)});
  await reader.add(path+'original-source.json','publication-source',{sha256:plan.sourceHash,bytes:plan.sourceBytes},{limit:262144});
  await reader.add(path+'source.json','publication-source',{sha256:plan.runtimeSourceHash},{limit:262144});
  await reader.add(path+'schema.csv','publication-schema',undefined,{limit:65536});
  await reader.capture(path+'capture/',plan.retainedCapture?.manifestSha256);
}
async function collectSelected(reader,state,selection,signal){
  const selected=selectCkanRecords(state,selection);
  for(const source of selected.sources){
    await reader.add('sources/'+source.id+'.json','source-declaration',{sha256:source.sha256},{limit:262144});
  }
  for(const edition of selected.editions){
    if(edition.state!=='COMPLETE')fail('CKAN_CAPTURE_MANIFEST_INVALID');
    await reader.capture('editions/'+edition.id+'/',edition.manifestSha256);
  }
  if(selected.refresh){
    const row=selected.refresh,base='refreshes/'+row.id+'/';
    if(row.comparisonSha256){
      const raw=await reader.add(base+'comparison.json','refresh-comparison',
        {sha256:row.comparisonSha256,bytes:row.comparisonBytes});
      const comparison=parseCkanJson(raw);
      await reader.add(base+'input.json','refresh-input',undefined,{limit:16384});
      await reader.add(base+'changes.jsonl','refresh-changes',comparison.changes);
      await reader.add(base+'changes.idx','refresh-index',comparison.index);
      check(signal);
      await readCkanRefreshComparison({directory:join(reader.root,base),expectedSha256:row.comparisonSha256});
      check(signal);
    }else{
      await reader.add(base+'progress.json','refresh-progress',undefined,{optional:true,limit:262144});
    }
    await reader.add(base+'decision.json','refresh-decision',row.decisionSha256?{sha256:row.decisionSha256}:undefined,
      {optional:!row.decisionSha256,limit:262144});
  }
  if(selected.publication)await publicationFiles(reader,selected.publication,selection,signal);
  for(const record of selected.exports){
    const base='merchant-packages/'+record.id+'/',raw=await reader.add(base+'merchant-manifest.json',
      'merchant-manifest',{sha256:record.manifestSha256},{limit:262144});
    const manifest=parseCkanJson(raw);
    if(!Array.isArray(manifest.files))fail('CKAN_MERCHANT_MANIFEST_INVALID');
    for(const file of manifest.files)await reader.add(base+ckanRetainedPath(file.file),'merchant-member',file);
    await reader.add(base+'handlers.mjs','merchant-handler',{sha256:record.handlerSha256},{limit:65536});
    check(signal);
    // Original package inspection also checks its handler entry and dataset snapshot.
    await inspectCkanMerchantPackage(join(reader.root,base),record.manifestSha256);
    check(signal);
  }
  return selected;
}
export async function collectCkanObservation(merchant,outerSignal){
  const selection=normalizeCkanSource(merchant.ckan),startedAt=iso();
  let before=null,after=null,errorCode=null,reader=null;
  try{
    await within(selection.timeoutMs,outerSignal,async signal=>{
      reader=await sourceReader(selection,signal);
      before=await reader.raw('workbench.json',selection.maxStateBytes);
      const state=readCkanWorkbenchState(before);
      if(state.createdAt!==selection.projectCreatedAt||state.catalogOrigin!==selection.catalogOrigin){
        errorCode='CKAN_PROJECT_IDENTITY_CHANGED';
      }else{
        try{await collectSelected(reader,state,selection,signal);await reader.verifyStable();}
        catch(error){errorCode=codeOf(error);}
      }
      // Even a failed selected-file read gets a second original state snapshot.
      // A concurrent atomic project update is unstable coverage, not corruption.
      after=await reader.raw('workbench.json',selection.maxStateBytes);
      if(!before.equals(after))errorCode='CKAN_SOURCE_CHANGED_DURING_READ';
    });
  }catch(error){
    if(outerSignal?.aborted)return {error:'STOPPING'};
    errorCode=codeOf(error);
  }
  const input={registration:{id:merchant.id,label:merchant.label},selection,startedAt,generatedAt:iso(),
    before,after,files:reader?[...reader.files.values()]:[],errorCode};
  try{return {packet:createCkanObservation(input)};}
  catch(error){
    // A format boundary yields an explicit unavailable observation. Complete raw
    // source remains in the project; no truncated capture is marked successful.
    return {packet:createCkanObservation({...input,before:null,after:null,files:[],
      errorCode:error.code==='CKAN_OBSERVATION_SIZE_LIMIT'?error.code:'CKAN_OBSERVATION_FORMAT_INVALID'})};
  }
}
/** Review a real private project once, then explicitly configure the returned pins. */
export async function reviewCkanSource(input,{signal}={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).some(key=>!['directory','sourceId','refreshId','publicationId','maxBytes','maxFiles',
      'maxStateBytes','timeoutMs','operationAfterSeconds','reviewAfterSeconds','publicationAfterSeconds','requirePublication'].includes(key)))
    fail('CKAN_SOURCE_REVIEW_INVALID');
  const maximum=input.maxStateBytes??2*1024*1024;
  if(!Number.isSafeInteger(maximum)||maximum<1024||maximum>3*1024*1024-65536)fail('CKAN_SOURCE_MAXSTATEBYTES_INVALID');
  const timeout=input.timeoutMs??30000;
  if(!Number.isSafeInteger(timeout)||timeout<100||timeout>300000)fail('CKAN_SOURCE_TIMEOUTMS_INVALID');
  await privateRoot(input.directory);check(signal);
  const state=readCkanWorkbenchState(await readPrivate(join(input.directory,'workbench.json'),maximum));
  const ckan=normalizeCkanSource({...input,catalogOrigin:state.catalogOrigin,projectCreatedAt:state.createdAt});
  const observation=await collectCkanObservation({id:'ckan-source-review',label:'CKAN source review',ckan},signal);
  if(!observation.packet)fail(observation.error??'CKAN_SOURCE_READ_FAILED');
  if(observation.packet.ckan.summary.coverage!=='COMPLETE')
    fail(observation.packet.ckan.summary.sourceError??'CKAN_SOURCE_REVIEW_INCOMPLETE');
  return {schema:'stellar-forge.sf93.ckan-source-review.v1',ckan,observedAt:observation.packet.ckan.generatedAt,
    summary:observation.packet.ckan.summary,
    authority:'ORIGINAL_PRIVATE_WORKBENCH_AND_RETAINED_SOURCE; READ_ONLY'};
}
