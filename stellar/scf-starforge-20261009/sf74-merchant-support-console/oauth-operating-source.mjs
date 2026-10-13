// MIT. Retain original SF74 case evidence for ordinary editable Operating Plans.
import {constants} from 'node:fs';
import {mkdir,lstat,open,readdir,realpath} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {openCaseStore,retainCaseArtifact} from './case-store.mjs';
import {MAX_WORKSPACE_BYTES} from './workspace-file.mjs';
import {parseRuntime,exportRuntimeHandoff,importRuntimeHandoff,MAX_RUNTIME_BYTES,MAX_HANDOFF_BYTES} from './runtime-support.mjs';
import {acquireStateLease} from '../merchant-fleet-gateway/state-lease.mjs';
import {inspectSupportOperatingSource,SUPPORT_OPERATING_SOURCE_SCHEMA} from '../distribution/discovery/support-operating-plan.mjs';

export const OAUTH_OPERATING_PACKAGE_SCHEMA='stellar-forge.oauth-support-operating-package.v1';
export const OAUTH_OPERATING_SOURCE_FILE='SOURCE.json';
export const OAUTH_OPERATING_MANIFEST_FILE='MANIFEST.json';
export const MAX_OPERATING_DESCRIPTOR_BYTES=32*1024*1024;
export const MAX_OPERATING_PACKAGE_BYTES=4*1024*1024*1024;
const HASH=/^[a-f0-9]{64}$/, ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const EXTERNAL_LIMIT=512*1024*1024, MAX_REVISIONS=100000, MAX_FILES=310000;
const MAX_ARTIFACT_BYTES=Math.max(EXTERNAL_LIMIT,MAX_WORKSPACE_BYTES,MAX_RUNTIME_BYTES,MAX_HANDOFF_BYTES);
const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=(code,message)=>Object.assign(new Error(message),{code});
const need=(ok,message)=>{if(!ok)throw fail('OAUTH_OPERATING_SOURCE_INVALID',message);};
const stop=signal=>signal?.throwIfAborted();
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function instant(value){need(typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,'Use the original exact UTC ISO capture time.');return value;}
function absolute(value,label){need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value,label+' must be an absolute normalized path.');return value;}
function filePath(value){
  need(typeof value==='string'&&value.length<=2000&&!/[\u0000-\u001f\u007f\\]/.test(value)&&
    !value.startsWith('/')&&!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)&&
    value.split('/').every(part=>part&&part!=='.'&&part!=='..'),'Use a relative original artifact path.');
  return value;
}
function ref(value,label='artifact'){
  need(plain(value)&&Object.keys(value).every(k=>['path','bytes','sha256'].includes(k)),label+' reference is invalid.');
  filePath(value.path);need(Number.isSafeInteger(value.bytes)&&value.bytes>0&&value.bytes<=MAX_ARTIFACT_BYTES&&HASH.test(value.sha256??''),label+' length/hash is invalid.');
  return {path:value.path,bytes:value.bytes,sha256:value.sha256};
}
function identity(path,bytes){return {path,bytes:bytes.length,sha256:sha(bytes)};}
function same(a,b,label){need(isDeepStrictEqual(a,b),label+' differs from the original selected value.');}
function parse(bytes,label){try{return JSON.parse(utf8.decode(bytes));}catch{throw fail('OAUTH_OPERATING_SOURCE_INVALID',label+' must contain complete UTF-8 JSON.');}}
async function directory(path,create=false){
  if(create){
    let parent=path;
    for(;;){try{await lstat(parent);break;}catch(error){if(error.code!=='ENOENT')throw error;const next=dirname(parent);need(next!==parent,'No existing output ancestor.');parent=next;}}
    need(await realpath(parent)===resolve(parent),'Output ancestors must not redirect through symlinks.');
    await mkdir(path,{recursive:true,mode:0o700});
  }
  const st=await lstat(path);
  need(st.isDirectory()&&!st.isSymbolicLink()&&(process.platform==='win32'||!(st.mode&0o077)),'Retained directories must be real private directories: '+path);
  need(await realpath(path)===resolve(path),'Retained directory ancestors must not redirect through symlinks.');
}
async function parents(root,path,create=false){
  filePath(path);let current=root;
  await directory(root);
  for(const part of path.split('/').slice(0,-1)){current=join(current,part);await directory(current,create);}
}
async function bytesAt(path,limit,signal){
  stop(signal);const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try{
    const before=await handle.stat();
    need(before.isFile()&&before.size>0&&before.size<=limit&&(process.platform==='win32'||!(before.mode&0o077)),'Original artifact has an invalid type, size or privacy mode: '+path);
    const bytes=Buffer.alloc(before.size);let offset=0;
    while(offset<bytes.length){stop(signal);const r=await handle.read(bytes,offset,Math.min(1024*1024,bytes.length-offset),offset);need(r.bytesRead>0,'Original artifact ended before its selected byte count.');offset+=r.bytesRead;}
    const after=await handle.stat();const named=await lstat(path);
    need(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&
      named.isFile()&&!named.isSymbolicLink()&&named.dev===after.dev&&named.ino===after.ino&&named.size===after.size,'Original artifact changed during the read.');
    stop(signal);return bytes;
  }finally{await handle.close();}
}
async function selectedBytes(root,value,signal){
  const selected=ref(value);await parents(root,selected.path);
  const bytes=await bytesAt(join(root,selected.path),selected.bytes,signal);
  need(bytes.length===selected.bytes&&sha(bytes)===selected.sha256,'Original artifact bytes do not match: '+selected.path);return bytes;
}
async function optionalBytes(root,path,limit,signal){
  try{await parents(root,path);return await bytesAt(join(root,path),limit,signal);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function put(root,path,bytes,signal){
  stop(signal);filePath(path);await parents(root,path,true);
  const saved=await retainCaseArtifact(join(root,path),bytes);stop(signal);
  same(saved,{bytes:bytes.length,sha256:sha(bytes)},'Original retained artifact receipt');return {path,...saved};
}
async function withOwner(root,work,signal){
  absolute(root,'Output directory');stop(signal);await directory(root,true);
  const owner=join(root,'.operating-owner');await directory(owner,true);
  const lease=await acquireStateLease(owner);
  try{stop(signal);lease.assertHeld();return await work(lease);}finally{await lease.close();}
}
function external(value,label){
  if(value===null)return null;
  need(plain(value)&&Object.keys(value).every(k=>['file','bytes','sha256','role'].includes(k)),label+' selection is invalid.');
  absolute(value.file,label+' file');need(Number.isSafeInteger(value.bytes)&&value.bytes>0&&value.bytes<=EXTERNAL_LIMIT&&HASH.test(value.sha256??''),label+' must have a bounded exact length and SHA-256.');
  return {file:value.file,bytes:value.bytes,sha256:value.sha256,...(value.role!==undefined?{role:value.role}:{})};
}
function captureRequest(input){
  const {casesDirectory,caseId,revision,sourceId,capturedAt,incidentSource=null,nativeDelivery=null,evidence=[]}=input;
  absolute(casesDirectory,'Original cases directory');need(UUID.test(caseId??'')&&HASH.test(revision??''),'Select the original case ID and immutable revision.');
  need(ID.test(sourceId??''),'Choose the original stable source ID.');instant(capturedAt);
  if(incidentSource!==null)need(plain(incidentSource)&&Object.keys(incidentSource).every(k=>['id','configurationRevision'].includes(k))&&
    typeof incidentSource.id==='string'&&incidentSource.id.length>0&&incidentSource.id.length<=512&&HASH.test(incidentSource.configurationRevision??''),'Retain the actual selected incident source/configuration revision, or null.');
  need(Array.isArray(evidence)&&evidence.length<=1000,'Choose at most 1000 original result artifacts.');
  const selected=evidence.map(item=>{const e=external(item,'Result');need(e&&ID.test(e.role??''),'Each result needs its original stable role.');return e;});
  need(new Set(selected.map(e=>e.role+'\0'+e.sha256)).size===selected.length,'Do not select duplicate result role/identity pairs.');
  return {schema:'stellar-forge.oauth-support-operating-capture-request.v1',casesDirectory,caseId,revision,sourceId,capturedAt,
    incidentSource:clone(incidentSource),nativeDelivery:external(nativeDelivery,'Native delivery'),evidence:selected};
}
function snapshotRoot(id){return 'case-store/'+id;}
function metadataPath(id,revision){return snapshotRoot(id)+'/versions/'+revision+'.json';}
function workspacePath(id,hash){return snapshotRoot(id)+'/workspaces/'+hash+'.json';}
function runtimePath(id,hash){return snapshotRoot(id)+'/runtime/'+hash+'.json';}
function sourceReferences(source){
  return [...Object.values(source.artifacts),...Object.values(source.captures).filter(Boolean).flatMap(c=>Object.values(c.files)),
    ...(source.nativeDelivery?[source.nativeDelivery]:[]),...source.evidence.map(e=>e.artifact)];
}
function captureDescriptor(sample,side,files){
  if(sample===null||sample.kind!=='OAUTH_RESOURCE')return null;
  const {meta,summary}=sample.original;
  return {kind:'OAUTH_RESOURCE',routeId:sample.scope.routeId,registration:clone(meta.registration),
    resource:summary.resource,configurationSha256:summary.configurationSha256,sessionId:summary.sessionId,
    startedAt:summary.startedAt,capturedAt:summary.capturedAt,sequence:summary.sequence,
    collectionStartedAt:meta.startedAt,collectedAt:meta.generatedAt,
    coverage:{state:summary.coverage,windowComplete:summary.window?.complete??null,sourceError:clone(summary.sourceError??null),identityContradiction:clone(summary.identityContradiction??null)},
    files:Object.fromEntries(['oauth-observation.json','oauth-source.json'].map(name=>[name,files.get('captures/'+side+'/'+name)]))};
}
function actions(report){return report.queue.map(({source,routeId,kind,action})=>({source,routeId,kind,action}));}
function resultFrom(source,sourceFile,manifestFile,root,reused){
  return {source,sourceFile,manifestFile,reused,caseSnapshotDirectory:join(root,'case-store'),selectedRevision:source.case.revision,
    receiving:'ORIGINAL_CASE_SNAPSHOT_VERIFIED',liveCaseAction:'Use the existing Support handoff/import and current CaseStore revision for live continuation.'};
}
async function persistExternal(root,value,signal){
  const path='evidence/'+value.sha256+'.bin',expected={path,bytes:value.bytes,sha256:value.sha256};
  let bytes=await optionalBytes(root,path,value.bytes,signal);
  if(bytes===null){await directory(dirname(value.file));bytes=await bytesAt(value.file,value.bytes,signal);}
  same(identity(path,bytes),expected,'Selected original result');await put(root,path,bytes,signal);return expected;
}

/** Freeze an exact existing case revision, its complete ancestry and actual retained artifacts.
 * No observation read, watcher, verifier, case save or service execution occurs. */
export async function captureOAuthOperatingSource(input){
  const request=captureRequest(input),root=absolute(input.outputDirectory,'Output directory'),signal=input.signal;
  need(root!==request.casesDirectory&&!root.startsWith(request.casesDirectory+'/'),'Use a separate original source output directory.');
  return withOwner(root,async lease=>{
    let selectionBytes=await optionalBytes(root,'SELECTION.json',MAX_OPERATING_DESCRIPTOR_BYTES,signal),selection;
    if(selectionBytes){selection=parse(selectionBytes,'Retained selection');same(selection.request,request,'Retained capture request');}
    else{
      const names=await readdir(root);need(names.every(name=>name==='.operating-owner'),'Choose an empty output directory or this exact retained capture.');
      await directory(request.casesDirectory);
      const original=await openCaseStore(request.casesDirectory),selected=await original.read(request.caseId,request.revision);
      need(selected.supportText!==null,'The selected original case has no runtime source.');
      selection={schema:'stellar-forge.oauth-support-operating-selection.v1',request,
        case:{id:selected.id,revision:selected.revision,currentRevision:selected.currentRevision,createdAt:selected.createdAt,updatedAt:selected.updatedAt}};
      selectionBytes=jsonBytes(selection);await put(root,'SELECTION.json',selectionBytes,signal);
    }
    need(selection.schema==='stellar-forge.oauth-support-operating-selection.v1'&&selection.case.id===request.caseId&&selection.case.revision===request.revision,'Retained selection identity is inconsistent.');
    const terminal=await optionalBytes(root,OAUTH_OPERATING_MANIFEST_FILE,MAX_OPERATING_DESCRIPTOR_BYTES,signal);
    if(terminal){
      const m=parse(terminal,'Original manifest');
      const checked=await inspectOAuthOperatingSourcePackage({directory:root,expectedSource:m.source,signal});
      same(checked.source.id,request.sourceId,'Retained source ID');same(checked.source.case, {...selection.case,ancestors:checked.source.case.ancestors},'Retained selected case');
      same(checked.source.capturedAt,request.capturedAt,'Retained source time');
      return {...checked,reused:true};
    }
    const files=new Map();let total=0;
    const retain=async(path,bytes)=>{
      lease.assertHeld();const value=identity(path,bytes),prior=files.get(path);
      if(prior){same(prior,value,'Repeated artifact');return prior;}
      need(files.size<MAX_FILES&&total+bytes.length<=MAX_OPERATING_PACKAGE_BYTES,'Complete source exceeds the explicit package limit; no history was truncated.');
      const saved=await put(root,path,bytes,signal);files.set(path,saved);total+=bytes.length;return saved;
    };
    const head={schema:'stellar-forge.merchant-case-head.v1',id:request.caseId,revision:request.revision};
    await retain(snapshotRoot(request.caseId)+'/head.json',jsonBytes(head));
    await directory(join(root,'case-store'),true);
    const retainedStore=await openCaseStore(join(root,'case-store'));
    let originalStore=null, next=request.revision, selected=null;const revisions=[],seen=new Set();
    while(next!==null){
      stop(signal);need(revisions.length<MAX_REVISIONS&&!seen.has(next),'Original case history is cyclic or exceeds the explicit revision limit.');
      seen.add(next);let row;
      try{row=await retainedStore.read(request.caseId,next);}
      catch(error){
        if(!['CASE_NOT_FOUND','ENOENT'].includes(error.code))throw error;
        if(!originalStore){await directory(request.casesDirectory);originalStore=await openCaseStore(request.casesDirectory);}
        row=await originalStore.read(request.caseId,next);
      }
      need(row.id===request.caseId&&row.revision===next&&row.createdAt===selection.case.createdAt,'Original case history identity changed.');
      const rawPath=metadataPath(request.caseId,next);
      let raw=await optionalBytes(root,rawPath,65000,signal);
      if(raw===null){await parents(request.casesDirectory,request.caseId+'/versions/'+next+'.json');raw=await bytesAt(join(request.casesDirectory,request.caseId,'versions',next+'.json'),65000,signal);}
      need(sha(raw)===next,'Original case metadata hash differs from its revision.');
      const metadata=parse(raw,'Original case metadata');
      need(metadata.id===row.id&&metadata.previousRevision===row.previousRevision,'Original read and immutable version disagree.');
      await retain(rawPath,raw);
      const wb=Buffer.from(row.workspaceText),wp=workspacePath(row.id,metadata.workspaceSha256);
      need(wb.length===metadata.workspaceBytes&&sha(wb)===metadata.workspaceSha256,'Original workspace identity changed.');
      await retain(wp,wb);
      if(row.supportText!==null){
        const rb=Buffer.from(row.supportText);need(metadata.runtimeSupport&&rb.length===metadata.runtimeSupport.bytes&&sha(rb)===metadata.runtimeSupport.sha256,'Original runtime identity changed.');
        await retain(runtimePath(row.id,metadata.runtimeSupport.sha256),rb);
      }else need(metadata.runtimeSupport==null,'Original runtime metadata and read disagree.');
      if(selected===null)selected={row,metadata};
      revisions.push(next);next=row.previousRevision;
    }
    const row=selected.row;
    need(row.supportText!==null,'The selected revision has no runtime source.');
    const parsed=parseRuntime(row.supportText);
    need([parsed.before,parsed.after].some(s=>s?.kind==='OAUTH_RESOURCE'),'The selected original case contains no OAuth capture.');
    const captures={};
    for(const side of ['before','after']){
      const sample=parsed[side];
      if(sample?.kind==='OAUTH_RESOURCE')for(const name of ['oauth-observation.json','oauth-source.json']){
        const value=sample.files[name],bytes=Buffer.from(value.data,'base64');
        need(bytes.length===value.bytes&&sha(bytes)===value.sha256,'Original OAuth file identity changed.');
        await retain('captures/'+side+'/'+name,bytes);
      }
      captures[side]=captureDescriptor(sample,side,files);
    }
    const exported=await exportRuntimeHandoff({workspaceText:row.workspaceText,supportText:row.supportText,metadata:row.metadata,generatedAt:request.capturedAt});
    const artifacts={
      caseSnapshot:files.get(metadataPath(row.id,row.revision)),
      workspace:files.get(workspacePath(row.id,selected.metadata.workspaceSha256)),
      runtime:files.get(runtimePath(row.id,selected.metadata.runtimeSupport.sha256)),
      handoff:await retain('reports/support-handoff.json',Buffer.from(exported.handoff)),
      report:await retain('reports/runtime-report.json',jsonBytes(exported.report)),
      html:await retain('reports/support-review.html',Buffer.from(exported.html))
    };
    const evidence=[
      {id:'case-revision/'+row.revision,role:'case-revision',artifact:artifacts.caseSnapshot},
      ...Object.entries(captures).filter(([,v])=>v).flatMap(([side,v])=>Object.entries(v.files).map(([name,artifact])=>({id:'oauth-'+side+'/'+name,role:'oauth-'+side+'-'+name.replace(/\.json$/,''),artifact}))),
      ...['handoff','report','html'].map(key=>({id:'support-'+key+'/'+artifacts[key].path,role:'support-'+key,artifact:artifacts[key]}))
    ];
    for(const item of request.evidence){
      const value=await persistExternal(root,item,signal);
      await retain(value.path,await selectedBytes(root,value,signal));
      evidence.push({id:item.role+'/'+value.path,role:item.role,artifact:value});
    }
    let nativeDelivery=null;
    if(request.nativeDelivery){nativeDelivery=await persistExternal(root,request.nativeDelivery,signal);await retain(nativeDelivery.path,await selectedBytes(root,nativeDelivery,signal));evidence.push({id:'native-delivery/'+nativeDelivery.path,role:'native-delivery',artifact:nativeDelivery});}
    const source=inspectSupportOperatingSource({schema:SUPPORT_OPERATING_SOURCE_SCHEMA,id:request.sourceId,capturedAt:request.capturedAt,
      case:{...selection.case,ancestors:revisions.slice(1)},artifacts,captures,actions:actions(exported.report),
      incidentSource:request.incidentSource,nativeDelivery,evidence});
    const sourceBytes=jsonBytes(source);need(sourceBytes.length<=MAX_OPERATING_DESCRIPTOR_BYTES,'The complete source descriptor exceeds its explicit input limit.');
    const sourceFile=await retain(OAUTH_OPERATING_SOURCE_FILE,sourceBytes);
    const manifest={schema:OAUTH_OPERATING_PACKAGE_SCHEMA,source:sourceFile,case:{id:source.case.id,revision:source.case.revision,ancestors:source.case.ancestors},
      files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path)),bytes:total};
    const manifestBytes=jsonBytes(manifest);need(manifestBytes.length<=MAX_OPERATING_DESCRIPTOR_BYTES,'The complete manifest exceeds its explicit limit.');
    await put(root,OAUTH_OPERATING_MANIFEST_FILE,manifestBytes,signal);
    const verified=await inspectOAuthOperatingSourcePackage({directory:root,expectedSource:sourceFile,signal});
    return {...verified,reused:false};
  },signal);
}

async function inspectPackage(directoryPath,expectedSource,signal){
  const root=absolute(directoryPath,'Source directory');await directory(root);stop(signal);
  const sourceRef=ref(expectedSource,'Selected descriptor');need(sourceRef.bytes<=MAX_OPERATING_DESCRIPTOR_BYTES,'Source descriptor exceeds its explicit limit.');need(sourceRef.path===OAUTH_OPERATING_SOURCE_FILE,'Select the exact SOURCE.json identity.');
  const sourceBytes=await selectedBytes(root,sourceRef,signal);need(sourceBytes.length<=MAX_OPERATING_DESCRIPTOR_BYTES,'Source descriptor exceeds its explicit limit.');
  const source=inspectSupportOperatingSource(parse(sourceBytes,'Source descriptor'));
  const mb=await bytesAt(join(root,OAUTH_OPERATING_MANIFEST_FILE),MAX_OPERATING_DESCRIPTOR_BYTES,signal),manifest=parse(mb,'Package manifest');
  need(manifest.schema===OAUTH_OPERATING_PACKAGE_SCHEMA&&Array.isArray(manifest.files)&&manifest.files.length<=MAX_FILES,'Original package manifest is invalid.');
  same(manifest.source,sourceRef,'Manifest descriptor identity');same(manifest.case,{id:source.case.id,revision:source.case.revision,ancestors:source.case.ancestors},'Manifest case selection');
  const inventory=new Map();let total=0;
  for(const item of manifest.files){const value=ref(item);need(!inventory.has(value.path),'Manifest repeats a member.');inventory.set(value.path,value);total+=value.bytes;need(total<=MAX_OPERATING_PACKAGE_BYTES,'Complete source exceeds its explicit limit.');}
  need(total===manifest.bytes,'Manifest total differs from complete files.');
  const expected=new Map();
  const get=async value=>{const r=ref(value);same(inventory.get(r.path),r,'Manifest original artifact');const old=expected.get(r.path);if(old)same(old,r,'Repeated reference');else expected.set(r.path,r);return selectedBytes(root,r,signal);};
  await get(sourceRef);
  for(const value of sourceReferences(source))await get(value);
  const headPath=snapshotRoot(source.case.id)+'/head.json',headBytes=jsonBytes({schema:'stellar-forge.merchant-case-head.v1',id:source.case.id,revision:source.case.revision});
  same(await get(identity(headPath,headBytes)),headBytes,'Frozen original snapshot head');
  const revisions=[source.case.revision,...source.case.ancestors];need(revisions.length<=MAX_REVISIONS,'Case history exceeds its explicit limit.');
  const store=await openCaseStore(join(root,'case-store'));let selected=null;
  for(let i=0;i<revisions.length;i++){
    stop(signal);const rev=revisions[i],path=metadataPath(source.case.id,rev),entry=inventory.get(path);
    need(entry&&entry.sha256===rev&&entry.bytes<=65000,'Original case metadata is not bound to its revision.');
    const raw=await get(entry),metadata=parse(raw,'Original case version');
    need(metadata.id===source.case.id&&metadata.previousRevision===(revisions[i+1]??null)&&metadata.createdAt===source.case.createdAt,'The complete original case lineage does not match.');
    const wr={path:workspacePath(source.case.id,metadata.workspaceSha256),bytes:metadata.workspaceBytes,sha256:metadata.workspaceSha256};
    need(wr.bytes<=MAX_WORKSPACE_BYTES,'Original workspace exceeds its own limit.');await get(wr);
    if(metadata.runtimeSupport){const rr={path:runtimePath(source.case.id,metadata.runtimeSupport.sha256),bytes:metadata.runtimeSupport.bytes,sha256:metadata.runtimeSupport.sha256};need(rr.bytes<=MAX_RUNTIME_BYTES,'Original runtime exceeds its own limit.');await get(rr);}
    const row=await store.read(source.case.id,rev);
    if(i===0)selected={row,metadata};
  }
  const row=selected.row;
  need(row.createdAt===source.case.createdAt&&row.updatedAt===source.case.updatedAt&&row.supportText!==null,'Selected case times/runtime differ.');
  same(source.artifacts.caseSnapshot,inventory.get(metadataPath(row.id,row.revision)),'Selected case snapshot');
  same(source.artifacts.workspace,inventory.get(workspacePath(row.id,selected.metadata.workspaceSha256)),'Selected workspace');
  same(source.artifacts.runtime,inventory.get(runtimePath(row.id,selected.metadata.runtimeSupport.sha256)),'Selected runtime');
  const parsed=parseRuntime(row.supportText);
  const actualCaptures={};
  for(const side of ['before','after']){
    const sample=parsed[side],refs=new Map();
    if(sample?.kind==='OAUTH_RESOURCE')for(const name of ['oauth-observation.json','oauth-source.json']){
      const original=Buffer.from(sample.files[name].data,'base64'),path='captures/'+side+'/'+name,r=identity(path,original);
      same(await get(r),original,'Selected original OAuth source');refs.set(path,r);
    }
    actualCaptures[side]=captureDescriptor(sample,side,refs);
  }
  same(source.captures,actualCaptures,'Original OAuth capture descriptor');
  const exported=await exportRuntimeHandoff({workspaceText:row.workspaceText,supportText:row.supportText,metadata:row.metadata,generatedAt:source.capturedAt});
  same(source.actions,actions(exported.report),'Original report action queue');
  for(const [key,bytes]of [['handoff',Buffer.from(exported.handoff)],['report',jsonBytes(exported.report)],['html',Buffer.from(exported.html)]]){
    if(source.artifacts[key])same(await get(source.artifacts[key]),bytes,'Original '+key);
  }
  if(source.artifacts.handoff){
    const imported=await importRuntimeHandoff(utf8.decode(await get(source.artifacts.handoff)));
    same(imported,{workspaceText:row.workspaceText,supportText:row.supportText,metadata:row.metadata},'Original handoff import');
  }
  need(expected.size===inventory.size&&[...inventory.keys()].every(path=>expected.has(path)),'Manifest contains a member outside the complete selected source.');
  return {source,manifest,sourceFile:sourceRef,manifestFile:identity(OAUTH_OPERATING_MANIFEST_FILE,mb),root,
    result:resultFrom(source,sourceRef,identity(OAUTH_OPERATING_MANIFEST_FILE,mb),root,true)};
}
/** Verify exact source files, original parser/export round-trip and every selected case revision. */
export async function inspectOAuthOperatingSourcePackage({directory:root,expectedSource,signal}={}){
  return (await inspectPackage(root,expectedSource,signal)).result;
}
function receivingReceipt(result){
  return {schema:'stellar-forge.oauth-support-operating-received.v1',sourceFile:result.sourceFile,manifestFile:result.manifestFile,
    case:{id:result.source.case.id,revision:result.source.case.revision},caseRevisions:result.source.case.ancestors.length+1,
    verification:'FULL_ORIGINAL_CASE_HISTORY_AND_ARTIFACTS',liveCaseHeadChanged:false};
}
/** Receive the selected complete immutable companion without changing a live CaseStore head. */
export async function receiveOAuthOperatingSource({sourceDirectory,destination,expectedSource,signal}={}){
  absolute(sourceDirectory,'Source directory');absolute(destination,'Receiving directory');
  need(destination!==sourceDirectory&&!destination.startsWith(sourceDirectory+'/')&&!sourceDirectory.startsWith(destination+'/'),'Use a separate receiving directory.');
  const selected=ref(expectedSource,'Selected source');
  return withOwner(destination,async lease=>{
    const request={schema:'stellar-forge.oauth-support-operating-receive-request.v1',source:selected};
    const retained=await optionalBytes(destination,'RECEIVE.json',MAX_OPERATING_DESCRIPTOR_BYTES,signal);
    if(retained)same(parse(retained,'Receiving selection'),request,'Original receiving selection');
    else{
      const names=await readdir(destination);need(names.every(name=>name==='.operating-owner'),'Choose a fresh receiving directory or this original receiving operation.');
      await put(destination,'RECEIVE.json',jsonBytes(request),signal);
    }
    const terminal=await optionalBytes(destination,'RECEIVED.json',MAX_OPERATING_DESCRIPTOR_BYTES,signal);
    if(terminal){
      const value=parse(terminal,'Receiving receipt');same(value.sourceFile,selected,'Receiving source identity');
      const result=await inspectOAuthOperatingSourcePackage({directory:destination,expectedSource:selected,signal});
      same(value,receivingReceipt(result),'Complete original receiving receipt');
      same(terminal,jsonBytes(receivingReceipt(result)),'Exact original receiving receipt bytes');
      return {...result,reused:true,receiptFile:identity('RECEIVED.json',terminal)};
    }
    const completedManifest=await optionalBytes(destination,OAUTH_OPERATING_MANIFEST_FILE,MAX_OPERATING_DESCRIPTOR_BYTES,signal);
    let original=null;
    if(completedManifest)await inspectPackage(destination,selected,signal);
    else original=await inspectPackage(sourceDirectory,selected,signal);
    for(const value of original?.manifest.files??[]){
      stop(signal);lease.assertHeld();let bytes=await optionalBytes(destination,value.path,value.bytes,signal);
      if(bytes!==null)same(identity(value.path,bytes),value,'Retained receiving member');
      else bytes=await selectedBytes(sourceDirectory,value,signal);
      await put(destination,value.path,bytes,signal);
    }
    if(original)await put(destination,OAUTH_OPERATING_MANIFEST_FILE,await selectedBytes(sourceDirectory,original.manifestFile,signal),signal);
    const result=await inspectOAuthOperatingSourcePackage({directory:destination,expectedSource:selected,signal});
    const receipt=receivingReceipt(result);
    const receiptFile=await put(destination,'RECEIVED.json',jsonBytes(receipt),signal);
    return {...result,reused:false,receiptFile};
  },signal);
}
