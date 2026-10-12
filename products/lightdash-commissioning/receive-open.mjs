// MIT. Reopen the included original application after complete create-only extraction.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {lstat} from 'node:fs/promises';
import {receivingLease} from '../../business/lightdash-commissioning-workspace-20261012/native/lease.mjs';
import {absolute,need,json,exists,objectDigest,fileIdentity,verifyManifest,safeRelative,acquireWorkspace,saveJson} from './common.mjs';
const same=(a,b)=>objectDigest(a)===objectDigest(b);
const order=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
function cleanOperation(value){const result={...value};delete result.updatedAt;delete result.inspection;return result;}
export async function reopenReceived(inputFile){
 absolute(inputFile);const input=await json(inputFile),lease=receivingLease();
 need(lease&&lease.identity.operationId===input.operationId&&lease.identity.inputSha256===input.inputSha256,
  'LIGHTDASH_RECEIVING_LEASE','Use the original complete receiving host lifetime.');
 const root=input.directory,destination=path.join(root,'received'),opened=await json(path.join(root,'open-intent.json')),
  receipt=path.join(destination,'extraction.json'),extraction=await json(receipt);
 need(opened.inputSha256===input.inputSha256&&opened.extraction.file===receipt&&same(await fileIdentity(receipt),
  {bytes:opened.extraction.bytes,sha256:opened.extraction.sha256}),'LIGHTDASH_RECEIVING_EXTRACTION','The complete original extraction receipt changed.');
 const packageDirectory=path.join(destination,'package'),app=path.join(packageDirectory,'app'),workspaceDirectory=path.join(packageDirectory,'workspace');
 need(extraction.state==='COMPLETE'&&extraction.operationId===input.operationId&&extraction.inputSha256===input.inputSha256&&
  extraction.handoverId===input.handoverId&&extraction.workspaceId===input.workspaceId&&extraction.packageDirectory===packageDirectory&&
  extraction.applicationDirectory===app&&extraction.workspaceDirectory===workspaceDirectory&&
  same(extraction.archive,{path:input.archive.file,bytes:input.archive.bytes,sha256:input.archive.sha256}),
  'LIGHTDASH_RECEIVING_EXTRACTION','The selected complete receiving placement changed.');
 const manifestFile=path.join(packageDirectory,'manifest.json');
 need(extraction.manifest.path===manifestFile&&same(await fileIdentity(manifestFile),
  {bytes:extraction.manifest.bytes,sha256:extraction.manifest.sha256}),'LIGHTDASH_RECEIVING_MANIFEST','The original package manifest changed.');
 const manifest=await json(manifestFile);
 need(manifest.schema==='lightdash.commissioning-package.v1'&&manifest.handoverId===input.handoverId&&manifest.workspaceId===input.workspaceId&&
  manifest.workspaceRevision===input.workspaceRevision&&manifest.applicationSourceManifest.sha256===input.application.manifestSha256&&
  (!manifest.includeOperatorPrivate||input.allowOperatorPrivate),'LIGHTDASH_RECEIVING_MANIFEST','The complete package selection differs.');
 const acceptedFile=path.join(root,'accepted.json'),accepted=await exists(acceptedFile)?await json(acceptedFile):null;
 if(accepted)need(accepted.inputSha256===input.inputSha256&&accepted.handoverId===input.handoverId&&accepted.workspaceId===input.workspaceId,
  'LIGHTDASH_RECEIVING_ACCEPTED','A different receiving selection was accepted here.');
 for(const member of manifest.files){
  if(member.path==='workspace/commissioning.sqlite'||accepted&&member.role==='operator-private')continue;
  const filename=path.join(packageDirectory,safeRelative(member.path)),actual=await fileIdentity(filename),info=await lstat(filename);
  need(actual.bytes===member.bytes&&actual.sha256===member.sha256&&Boolean(info.mode&0o111)===Boolean(member.executable),
   'LIGHTDASH_RECEIVING_MEMBER','An included immutable original source or native-content member changed.');
 }
 await verifyManifest({directory:app,manifestFile:path.join(app,'source-manifest.json'),manifestSha256:input.application.manifestSha256});
 const snapshot=await json(path.join(packageDirectory,'workspace.json'));
 need(snapshot.schema==='lightdash.commissioning-handover.v1'&&snapshot.metadata.id===input.workspaceId&&
  snapshot.metadata.revision===input.workspaceRevision,'LIGHTDASH_RECEIVING_SNAPSHOT','The complete original workspace selection differs.');
 const original=await import(pathToFileURL(path.join(app,'workspace.mjs')).href),
  server=await import(pathToFileURL(path.join(app,'server.mjs')).href),
  engine=await import(pathToFileURL(path.join(app,'native/index.mjs')).href);
 const release=await acquireWorkspace(workspaceDirectory);let model,service,result;
 try{
  model=await original.CommissioningWorkspace.open(workspaceDirectory,{engine});
  let current=await model.state(),retained=await model.exportSnapshot();
  need(current.metadata.id===input.workspaceId&&current.metadata.receiving?.originWorkspaceId===input.workspaceId&&
   current.metadata.receiving.originRevision===input.workspaceRevision&&current.metadata.revision>=input.workspaceRevision+1,
   'LIGHTDASH_RECEIVING_WORKSPACE','The included SQLite has another original identity or receiving basis.');
  for(const edition of snapshot.editions){
   const selected=retained.editions.find(x=>x.id===edition.id);need(same(selected,edition),'LIGHTDASH_RECEIVING_EDITION','A complete original source edition is missing or changed.');
   await verifyManifest(await model.nativeEdition(edition.id));
  }
  for(const review of snapshot.reviews)need(same(retained.reviews.find(x=>x.id===review.id),review),
   'LIGHTDASH_RECEIVING_REVIEW','An original review is missing or changed.');
  for(const operation of snapshot.operations){
   const selected=model.operation(operation.id);need(selected.requestSha256===operation.requestSha256,
    'LIGHTDASH_RECEIVING_OPERATION','An original native operation identity changed.');
   if(!accepted)need(same(cleanOperation(selected),cleanOperation(operation)),
    'LIGHTDASH_RECEIVING_OPERATION','The original native result or input did not survive receiving.');
   for(const content of await model.contentExports(operation.id)){
    need(!content.error,'LIGHTDASH_RECEIVING_CONTENT','The included complete original native content did not reopen.');
    await verifyManifest(content);
   }
  }
  if(!accepted){
   need(same(current.metadata.connection,{})&&current.metadata.receiving.connectionDetached===true,
    'LIGHTDASH_RECEIVING_CONNECTION','The original customer copy must first open with its private host connection detached.');
   need(same(order(retained.drafts),order(snapshot.drafts))&&
    same(current.operations.map(x=>x.id).sort(),snapshot.operations.map(x=>x.id).sort()),
    'LIGHTDASH_RECEIVING_COMPLETE_STATE','The complete SQLite drafts and original operations did not survive receiving.');
   for(const operation of snapshot.operations.filter(x=>['SUCCEEDED','FAILED'].includes(x.status))){
    const replay=await model.execute(operation.id);
    need(replay.replayed&&same(replay.operation.nativeResult,operation.nativeResult)&&replay.operation.status===operation.status,
     'LIGHTDASH_RECEIVING_TERMINAL','The original completed result did not replay locally.');
    if(!await exists(path.join(workspaceDirectory,'operations',operation.id,'native','plan.json'))){
     const inspected=await model.execute(operation.id,{inspect:true});
     need(inspected.operation.status===operation.status&&same(inspected.operation.nativeResult,operation.nativeResult)&&
      inspected.operation.inspection?.code==='ORIGINAL_NATIVE_JOURNAL_UNAVAILABLE',
      'LIGHTDASH_RECEIVING_INSPECT','Historical Inspect changed the original completed result.');
    }
   }
  }
  service=await server.createWorkspaceServer({workspace:model,port:0});
  const page=await fetch(service.url,{redirect:'error'});need(page.ok,'LIGHTDASH_RECEIVING_UI','The actual included browser entry did not open.');
  const html=await page.text();need(html.includes('workspace-token')&&html.includes('operation-plan'),'LIGHTDASH_RECEIVING_UI','The included original application page is incomplete.');
  const http=await fetch(new URL('/api/state',service.url),{redirect:'error'});need(http.ok,'LIGHTDASH_RECEIVING_UI','The included application did not reopen its SQLite state.');
  current=await http.json();
  need(current.metadata.id===input.workspaceId&&current.pendingOperationIds.length===0&&model.inflight.size===0,
   'LIGHTDASH_RECEIVING_UI','The included application selected another workspace or dispatched new native work.');
  const acceptance={schema:'stellar-forge.lightdash-received-workspace.v1',state:'COMPLETE',inputSha256:input.inputSha256,
   handoverId:input.handoverId,workspaceId:input.workspaceId,originRevision:input.workspaceRevision,
   sourceEditionIds:snapshot.editions.map(x=>x.id),reviewIds:snapshot.reviews.map(x=>x.id),
   originalOperations:snapshot.operations.map(x=>({id:x.id,status:x.status,requestSha256:x.requestSha256,nativeResultSha256:objectDigest(x.nativeResult??null)})),
   applicationManifestSha256:input.application.manifestSha256,providerDispatch:false};
  if(!accepted)await saveJson(acceptedFile,acceptance,{createOnly:true});
  result={...acceptance,operationId:input.operationId,archive:input.archive,requestFile:input.requestFile,
   applicationDirectory:app,workspaceDirectory,receivingRevision:current.metadata.revision,
   connectionDetached:current.metadata.receiving.connectionDetached,currentConnectionConfigured:Object.keys(current.metadata.connection).length>0,
   customerChangesPreserved:Boolean(accepted),includedApplicationHTTP:200,completedAt:new Date().toISOString()};
 }finally{
  if(service)await service.close();
  if(model){await Promise.allSettled([...model.inflight.values()]);model.close();}
  await release();
 }
 await saveJson(path.join(root,'result.json'),result);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{need(process.argv[2]==='--input'&&process.argv.length===4,'LIGHTDASH_RECEIVING_ARGUMENTS','Use the original --input receiving file.');
  const result=await reopenReceived(absolute(process.argv[3]));console.log(JSON.stringify(result));}
 catch(error){console.error(JSON.stringify({state:'INCOMPLETE',error:{code:error.code??'LIGHTDASH_RECEIVING_FAILED',message:error.message}}));process.exitCode=3;}
}
