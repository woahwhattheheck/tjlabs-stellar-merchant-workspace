// MIT. One original private CouchDB operator and durable publication workspace.
import { open, readdir, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateConnection, sourceIdentity, compileQueries, readCouchdbSourceFile } from './declaration.mjs';
import { collectCouchdbCapture, readCouchdbCapture, cloneCouchdbCapture } from './capture.mjs';
import { captureView, inspectCouchdbFields, compareCouchdbCaptures } from './inspection.mjs';
import { openCouchdbSourceFile, reviewedCouchdbDocuments } from './source.mjs';
import { openCouchdbPublisher } from './publisher.mjs';
import { reviewCouchdbDeployment, prepareCouchdbDeployment, inspectCouchdbDeployment, stageCouchdbDeployment, rebindCouchdbDeployment, readCouchdbDeploymentFile } from './deployment.mjs';
import { MerchantClientExports } from '../../../../stellar-forge/mcp-merchant-operator/client-exports.mjs';
import { RetainedFileReads } from '../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import { readSellerClientManifest, CLIENT_EXPORT_FILES, CLIENT_EXPORT_MANIFEST } from '../developer/client-export.mjs';
import { need, object, only, text, integer, UUID, HASH, MAX_BODY, bytes, identity, digest, privateDirectory, readPrivate, readJson,
  acquireWorkspace, retain, retainJSON, atomicJson, exists, syncDirectory, stamp, safeIssue, ensureActive } from './common.mjs';

export const COUCHDB_WORKSPACE_SCHEMA='stellar-forge.couchdb-workspace.v1';
export const COUCHDB_COMMANDS=Object.freeze([
  'connection.save','connection.import','capture','capture.import','capture.fields',
  'mapping.save','product.create','product.select','publisher.plan','publisher.extract','publisher.review','publisher.publish','publisher.recover',
  'deployment.review','deployment.prepare','deployment.rebind','release.stage','release.console.open','release.console.close','release.command',
  'client.generate','client.adopt','client.receive','project.export','project.receive',
]);
const DIRECTORY_NAMES=['connections','captures','mappings','products','publishers','datasets','operations','deployments','customers','exports','receiving','uploads'];
const identifier=value=>{need(UUID.test(value??''),'COUCHDB_OPERATION_ID_REQUIRED');return value;};
const hash=value=>{need(HASH.test(value??''),'COUCHDB_SOURCE_HASH_REQUIRED');return value;};
const optionalJSON=async(path,limit=MAX_BODY)=>await exists(path)?readJson(path,limit):null;
const decode=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
function operationSummary(request,state,result,requestSha256=identity(request)){
  const value=result?.value;
  return {id:request.id,command:request.command,requestSha256,state:result?'COMPLETE':state?.state??'RETAINED',
    startedAt:state?.startedAt??null,updatedAt:state?.updatedAt??null,error:result?null:state?.error??null,
    ...(result?{resultSha256:identity(result),result:{
      ...(value?.id?{id:value.id}:{}),...(value?.mappingId?{mappingId:value.mappingId}:{}),...(value?.productId?{productId:value.productId}:{}),
      ...(value?.state?{state:value.state}:{}),...(value?.manifestSha256?{manifestSha256:value.manifestSha256}:{}),
      ...(value?.sourceSha256?{sourceSha256:value.sourceSha256}:{}),...(value?.exportId?{exportId:value.exportId}:{})}}:{})};
}
function compactConnection(connection){
  const selected=connection.selection;
  return {...connection,selection:{...selected,...(selected.ids?{ids:selected.ids.slice(0,10),idCount:selected.ids.length,idsTruncated:selected.ids.length>10}:{}),
    ...(connection.attachments.names?{}:{})},
    attachments:{...connection.attachments,...(connection.attachments.names?{names:connection.attachments.names.slice(0,10),nameCount:connection.attachments.names.length,namesTruncated:connection.attachments.names.length>10}:{})}};
}
export async function readCouchdbWorkspaceIdentity(directory){
  const root=resolve(directory);await privateDirectory(root);
  const path=join(root,'workspace.json'),raw=await readPrivate(path,4096),value=decode(raw);
  only(value,['schema','id'],'COUCHDB_WORKSPACE_IDENTITY_INVALID');
  need(value.schema===COUCHDB_WORKSPACE_SCHEMA&&UUID.test(value.id??''),'COUCHDB_WORKSPACE_IDENTITY_INVALID');
  return {...value,directory:root,path,sha256:digest(raw)};
}
export async function initializeCouchdbWorkspace({directory,id}={}){
  const root=resolve(directory);if(id!==undefined)identifier(id);await privateDirectory(root,true);const unlock=await acquireWorkspace(root);
  try{
    if(await exists(join(root,'workspace.json'))){const current=await readCouchdbWorkspaceIdentity(root);need(id===undefined||current.id===id,'COUCHDB_WORKSPACE_ALREADY_EXISTS','Reopen this retained workspace using its original identity.',409);return current;}
    await retainJSON(join(root,'workspace.json'),{schema:COUCHDB_WORKSPACE_SCHEMA,id:id??randomUUID()});
    for(const name of DIRECTORY_NAMES)await privateDirectory(join(root,name),true);
    await syncDirectory(root);return readCouchdbWorkspaceIdentity(root);
  }finally{await unlock();}
}
export async function openCouchdbWorkspace({directory,expectedWorkspaceId,environment=process.env}={}){
  const root=resolve(directory);await privateDirectory(root);const unlock=await acquireWorkspace(root);
  let closed=false,closing=null,tail=Promise.resolve(),intake=Promise.resolve(),releaseConsole=null;
  const active=new Map(),controllers=new Map(),captureCache=new Map();
  let clients;const fileReads=new RetainedFileReads({errorPrefix:'COUCHDB',maxSnapshotBytes:MAX_BODY});
  try{
    const workspace=await readCouchdbWorkspaceIdentity(root);
    if(expectedWorkspaceId!==undefined)need(workspace.id===expectedWorkspaceId,'COUCHDB_WORKSPACE_CHANGED',undefined,409);
    for(const name of DIRECTORY_NAMES)await privateDirectory(join(root,name),true);
    clients=new MerchantClientExports({directory:join(root,'customers')});
    const releaseRoot=join(root,'releases');
    const captureFile=id=>join(root,'captures',identifier(id),'capture.json');
    const operationPath=id=>join(root,'operations',identifier(id));
    const productPath=id=>join(root,'products',identifier(id));
    function available(){need(!closed,'COUCHDB_WORKSPACE_CLOSED');}
    async function capture(id){
      id=identifier(id);
      // Complete native captures are immutable; cache only one verified edition.
      if(captureCache.has(id))return captureCache.get(id);
      const value=await readCouchdbCapture(captureFile(id));captureCache.clear();captureCache.set(id,value);return value;
    }
    async function mapping(id){
      const folder=join(root,'mappings',identifier(id)),record=await readJson(join(folder,'mapping.json'),262144);
      need(record.schema==='stellar-forge.couchdb-mapping.v1'&&record.id===id,'COUCHDB_MAPPING_CHANGED');
      const selected=await readCouchdbSourceFile(join(folder,'source.json'));
      need(selected.hash===record.sourceHash&&selected.config.capture.sha256===record.captureSha256&&selected.captureFile===captureFile(record.captureId),'COUCHDB_MAPPING_CHANGED');
      return {...record,source:selected};
    }
    async function product(id){
      const folder=productPath(id),record=await readJson(join(folder,'product.json'),16384),selection=await readJson(join(folder,'selection.json'),16384);
      need(record.schema==='stellar-forge.couchdb-product.v1'&&record.id===id&&selection.schema==='stellar-forge.couchdb-product-selection.v1'&&selection.productId===id,'COUCHDB_PRODUCT_CHANGED');
      integer(selection.revision,1,Number.MAX_SAFE_INTEGER);identifier(selection.mappingId);hash(selection.sourceHash);
      const selected=await mapping(selection.mappingId);
      need(selected.sourceHash===selection.sourceHash,'COUCHDB_PRODUCT_SOURCE_CHANGED');
      const actual=await readPrivate(join(folder,'current-source.json'),262144);
      need(digest(actual)===selection.sourceHash,'COUCHDB_PRODUCT_SELECTION_PENDING','Resume the original saved source-selection operation.',409);
      return {...record,selection};
    }
    async function bootstrapPublisher(productId){
      const selected=await product(productId),folder=join(root,'publishers',productId);
      await privateDirectory(folder,true);const release=await acquireWorkspace(folder);
      try{
        const expected={schema:'stellar-forge.couchdb-publisher-workspace.v1',sourceFile:join(productPath(productId),'current-source.json'),
          targetDirectory:join(root,'datasets',productId),createdAt:selected.createdAt};
        await retainJSON(join(folder,'workspace.json'),expected);
        for(const name of ['plans','runs'])await privateDirectory(join(folder,name),true);
        const database=join(folder,'publisher.sqlite');
        if(!await exists(database)){
          const file=await open(database,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);await file.close();await syncDirectory(folder);
        }
        const stat=await lstat(database);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&!(stat.mode&0o077),'COUCHDB_PUBLISHER_DATABASE_CHANGED');
        // The original publisher creates/reopens its own SQLite tables. The
        // empty private file makes interrupted initial creation reopenable.
      }finally{await release();}
      return openCouchdbPublisher({directory:folder,environment});
    }
    async function withPublisher(productId,fn){
      const selected=await bootstrapPublisher(identifier(productId));try{return await fn(selected);}finally{await selected.close();}
    }
    async function originalConsole(method,path,input){
      need(releaseConsole,'COUCHDB_RELEASE_CONSOLE_REQUIRED','Open the original release console.',409);
      const selected=releaseConsole,base=new URL(selected.native.url),token=selected.native.token;base.hash='';
      const response=await fetch(new URL(path,base),{method,redirect:'error',signal:AbortSignal.timeout(300000),
        headers:{origin:base.origin,'x-release-token':token,...(input===undefined?{}:{'content-type':'application/json'})},...(input===undefined?{}:{body:JSON.stringify(input)})});
      const parts=[];let size=0;for await(const chunk of response.body??[]){size+=chunk.length;need(size<=32*1048576,'COUCHDB_RELEASE_RESPONSE_TOO_LARGE');parts.push(chunk);}
      const value=decode(Buffer.concat(parts,size));
      need(response.ok,'COUCHDB_RELEASE_ACTION_FAILED',value.message??value.error??'The original release operation returned HTTP '+response.status+'.',response.status);
      need(releaseConsole===selected,'COUCHDB_RELEASE_CONSOLE_CHANGED');return value;
    }
    function consoleView(){return releaseConsole?{running:true,instanceId:releaseConsole.id,url:releaseConsole.native.operatorUrl,releaseDirectory:releaseRoot}:{running:false,releaseDirectory:releaseRoot};}
    async function releaseState(){
      if(releaseConsole)return {...consoleView(),native:await originalConsole('GET','/api/status')};
      if(!await exists(releaseRoot))return {...consoleView(),native:null};
      const {releaseStatus}=await import('../../sf82-seller-pilot/releases.mjs');
      return {...consoleView(),native:await releaseStatus(releaseRoot)};
    }
    async function signature(path){
      if(!await exists(path))return null;
      const stat=await lstat(path,{bigint:true});
      need(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1n&&!(stat.mode&0o077n),'COUCHDB_OPERATION_FILE_CHANGED');
      return Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs'].map(key=>[key,String(stat[key])]));
    }
    async function operation(id,{includeResult=true}={}){
      const folder=operationPath(id),requestFile=join(folder,'request.json'),resultFile=join(folder,'result.json');
      const requestSignature=await signature(requestFile);need(requestSignature,'COUCHDB_OPERATION_NOT_FOUND',undefined,404);
      let meta=await optionalJSON(join(folder,'metadata.json'),16384),state=await optionalJSON(join(folder,'state.json'),16384);
      const resultSignature=await signature(resultFile);
      const validMeta=meta?.schema==='stellar-forge.couchdb-operation-metadata.v1'&&meta.id===id&&meta.workspaceId===workspace.id&&
        COUCHDB_COMMANDS.includes(meta.command)&&HASH.test(meta.requestSha256??'')&&object(meta.requestSignature)&&identity(meta.requestSignature)===identity(requestSignature);
      const validState=state?.schema==='stellar-forge.couchdb-operation-state.v1'&&state.id===id&&state.requestSha256===meta?.requestSha256&&
        Number.isFinite(Date.parse(state.startedAt))&&['RUNNING','COMPLETE','FAILED','INTERRUPTED'].includes(state.state);
      if(!includeResult&&validMeta&&(!state||validState)){
        if(!resultSignature&&state?.state!=='COMPLETE')return operationSummary(meta,state,null,meta.requestSha256);
        const summary=state?.summary;
        if(resultSignature&&state?.state==='COMPLETE'&&object(state.resultSignature)&&identity(state.resultSignature)===identity(resultSignature)&&summary?.id===id&&
          summary.command===meta.command&&summary.requestSha256===meta.requestSha256&&summary.state==='COMPLETE'&&HASH.test(summary.resultSha256??''))return summary;
      }
      const request=await readJson(requestFile,MAX_BODY);
      need(request.schema==='stellar-forge.couchdb-operation.v1'&&request.id===id&&request.workspaceId===workspace.id&&COUCHDB_COMMANDS.includes(request.command),'COUCHDB_OPERATION_CHANGED');
      need(identity(requestSignature)===identity(await signature(requestFile)),'COUCHDB_OPERATION_CHANGED');
      const requestSha256=identity(request),result=await optionalJSON(resultFile);
      if(state)need(state.schema==='stellar-forge.couchdb-operation-state.v1'&&state.id===id&&state.requestSha256===requestSha256&&Number.isFinite(Date.parse(state.startedAt)),'COUCHDB_OPERATION_STATE_CHANGED');
      if(result)need(result.schema==='stellar-forge.couchdb-operation-result.v1'&&result.requestSha256===requestSha256&&result.workspaceId===workspace.id&&result.id===id,'COUCHDB_OPERATION_RESULT_CHANGED');
      else need(state?.state!=='COMPLETE','COUCHDB_OPERATION_RESULT_MISSING');
      meta={schema:'stellar-forge.couchdb-operation-metadata.v1',id,workspaceId:workspace.id,command:request.command,requestSha256,requestSignature};
      if(!validMeta)await atomicJson(folder,'metadata.json',meta);
      if(result){
        const oldSummary=state?.summary??null,oldResultSignature=state?.resultSignature??null;
        need(identity(resultSignature)===identity(await signature(resultFile)),'COUCHDB_OPERATION_RESULT_CHANGED');
        state={...state,schema:'stellar-forge.couchdb-operation-state.v1',id,requestSha256,state:'COMPLETE',startedAt:state?.startedAt??stamp(),updatedAt:state?.updatedAt??stamp(),resultSignature};
        state.summary=operationSummary(request,state,result,requestSha256);
        if(!validState||identity(state.summary)!==identity(oldSummary)||identity(state.resultSignature)!==identity(oldResultSignature))await atomicJson(folder,'state.json',state);
      }
      const summary=operationSummary(request,state,result,requestSha256);
      return {...summary,...(includeResult?{request,...(result?{value:result.value}:{})}:{})};
    }
    async function page(folder,{after,limit=30}={},read){
      integer(limit,1,100);if(after!==undefined)text(after,128);
      const names=(await readdir(folder,{withFileTypes:true})).filter(item=>item.isDirectory()&&!item.isSymbolicLink()&&!item.name.startsWith('.')&&(!after||item.name>after)).map(item=>item.name).sort();
      const values=[];let last=null;
      for(const name of names){
        const value=await read(name);if(value===null)continue;
        if(values.length===limit)return {items:values,nextCursor:last};
        values.push(value);last=name;
      }
      return {items:values,nextCursor:null};
    }
    async function selectProduct(productId,mappingId,expectedRevision,ctx){
      const folder=productPath(productId),selected=await mapping(mappingId),current=await readJson(join(folder,'selection.json'),16384);
      integer(expectedRevision,1,Number.MAX_SAFE_INTEGER);
      const next={schema:'stellar-forge.couchdb-product-selection.v1',productId,revision:expectedRevision+1,mappingId,sourceHash:selected.sourceHash,operationId:ctx.id};
      if(current.revision===next.revision&&identity(current)===identity(next)){
        need((await readPrivate(join(folder,'current-source.json'),262144)).equals(selected.source.original),'COUCHDB_PRODUCT_SOURCE_CHANGED');return product(productId);
      }
      need(current.revision===expectedRevision,'COUCHDB_PRODUCT_REVISION_CHANGED','Reload the saved product before selecting another mapping.',409);
      const actual=await readPrivate(join(folder,'current-source.json'),262144);
      need([current.sourceHash,selected.sourceHash].includes(digest(actual)),'COUCHDB_PRODUCT_SOURCE_CHANGED');
      await atomicJson(folder,'current-source.json',selected.source.config);
      need(digest(await readPrivate(join(folder,'current-source.json'),262144))===selected.sourceHash,'COUCHDB_PRODUCT_SOURCE_CHANGED');
      await atomicJson(folder,'selection.json',next);return product(productId);
    }
    async function execute(command,input,ctx){
      const {id,signal,folder}=ctx;ensureActive(signal);
      const checkpoint=async(name,value)=>{const file=join(folder,name+'.json');if(await exists(file))return readJson(file,MAX_BODY);await retainJSON(file,value);return value;};
      if(command==='connection.save'||command==='connection.import'){
        only(input,command==='connection.save'?['label','connection']:['label','file','expectedSha256'],'COUCHDB_CONNECTION_INPUT_INVALID');
        let selected=input.connection;
        if(command==='connection.import'){
          const original=await readPrivate(resolve(input.file),MAX_BODY);need(digest(original)===hash(input.expectedSha256),'COUCHDB_CONNECTION_INPUT_CHANGED');selected=decode(original);
        }
        const connection=validateConnection(selected),label=text(input.label,128),sourceId=sourceIdentity(connection),sha256=identity(connection);
        const path=join(root,'connections',sha256);await privateDirectory(path,true);
        await retainJSON(join(path,'connection.json'),connection);
        // Labels are original saved observations; connection identity is native.
        await retainJSON(join(path,id+'.json'),{operationId:id,label,sourceId,connectionSha256:sha256});
        return {id:sha256,label,sourceId,connection:compactConnection(connection)};
      }
      if(command==='capture'){
        only(input,['connectionId','baseCaptureId'],'COUCHDB_CAPTURE_INPUT_INVALID');
        const connection=await readJson(join(root,'connections',hash(input.connectionId),'connection.json'),MAX_BODY);
        need(identity(validateConnection(connection))===input.connectionId,'COUCHDB_CONNECTION_CHANGED');
        const base=input.baseCaptureId?await capture(input.baseCaptureId):null;
        const received=await collectCouchdbCapture({directory:join(root,'captures',id),connection,id,
          baseCaptureFile:base?.manifestFile??null,baseCaptureSha256:base?.manifestSha256??null,environment,signal});
        captureCache.clear();return captureView(received);
      }
      if(command==='capture.import'){
        only(input,['file','expectedSha256'],'COUCHDB_CAPTURE_IMPORT_INVALID');
        const original=await readCouchdbCapture(resolve(input.file),hash(input.expectedSha256));
        const target=join(root,'captures',original.manifest.id);
        if(resolve(input.file)!==join(target,'capture.json'))await cloneCouchdbCapture(original,target);
        captureCache.clear();return captureView(await capture(original.manifest.id));
      }
      if(command==='capture.fields'){
        only(input,['captureId','documentIds','maxFields','maxDepth'],'COUCHDB_FIELDS_INPUT_INVALID');
        return inspectCouchdbFields(await capture(input.captureId),{documentIds:input.documentIds,maxFields:input.maxFields,maxDepth:input.maxDepth,signal});
      }
      if(command==='mapping.save'){
        only(input,['captureId','expectedCaptureSha256','title','queries'],'COUCHDB_MAPPING_INPUT_INVALID');
        const selected=await capture(input.captureId);need(selected.manifestSha256===hash(input.expectedCaptureSha256),'COUCHDB_CAPTURE_CHANGED');
        text(input.title,128);const queries=compileQueries(input.queries);
        for(const query of Object.values(queries))reviewedCouchdbDocuments(selected,query);
        const target=join(root,'mappings',id);await privateDirectory(target,true);
        const config={schema:'stellar-forge.couchdb-source.v1',capture:{file:'../../captures/'+selected.manifest.id+'/capture.json',sha256:selected.manifestSha256},queries:input.queries};
        const raw=bytes(config);need(raw.length<=262144,'COUCHDB_SOURCE_CONFIG_TOO_LARGE');
        const record={schema:'stellar-forge.couchdb-mapping.v1',id,title:input.title.trim(),captureId:selected.manifest.id,captureSha256:selected.manifestSha256,
          sourceId:selected.manifest.sourceId,sourceHash:digest(raw),createdAt:ctx.startedAt};
        await retain(join(target,'source.json'),raw);await retainJSON(join(target,'mapping.json'),record);
        return record;
      }
      if(command==='product.create'){
        only(input,['title','mappingId'],'COUCHDB_PRODUCT_INPUT_INVALID');const selected=await mapping(input.mappingId);text(input.title,128);
        const target=productPath(id);await privateDirectory(target,true);
        await retainJSON(join(target,'product.json'),{schema:'stellar-forge.couchdb-product.v1',id,title:input.title.trim(),createdAt:ctx.startedAt});
        await retain(join(target,'current-source.json'),selected.source.original);
        await retainJSON(join(target,'selection.json'),{schema:'stellar-forge.couchdb-product-selection.v1',productId:id,revision:1,mappingId:input.mappingId,sourceHash:selected.sourceHash,operationId:id});
        return product(id);
      }
      if(command==='product.select'){
        only(input,['productId','mappingId','expectedRevision'],'COUCHDB_PRODUCT_INPUT_INVALID');
        return selectProduct(input.productId,input.mappingId,input.expectedRevision,ctx);
      }
      if(command==='publisher.plan'){
        only(input,['productId','plan'],'COUCHDB_PUBLICATION_INPUT_INVALID');
        return withPublisher(input.productId,async publisher=>{
          let offset=0;
          for(;;){const status=publisher.status({limit:100,plansOffset:offset});const existing=status.plans.find(plan=>plan.data.operationId===id);
            if(existing){need(existing.data.sourceHash===input.plan.sourceHash,'COUCHDB_PLAN_OPERATION_CHANGED');return existing;}
            if(status.pages.plans.next===null)break;offset=status.pages.plans.next;}
          return publisher.savePlan({...input.plan,operationId:id});
        });
      }
      if(command==='publisher.extract'){
        only(input,['productId','planId'],'COUCHDB_EXTRACTION_INPUT_INVALID');
        return withPublisher(input.productId,async publisher=>{
          let existing;try{existing=publisher.run(id);}catch(error){if(error.code!=='RUN_NOT_FOUND')throw error;}
          if(existing){
            need(existing.plan===input.planId,'COUCHDB_EXTRACTION_OPERATION_CHANGED');
            if(['INTERRUPTED','FAILED','CANCELLED'].includes(existing.state)){
              try{return await publisher.recover(id);}catch(error){if(!['ENOENT','CANDIDATE_MANIFEST_INVALID'].includes(error.code))throw error;}
            }
            return existing;
          }
          const started=publisher.startExtraction(input.planId,{id});
          const cancel=()=>{try{publisher.cancel(id);}catch{}};
          signal.addEventListener('abort',cancel,{once:true});
          try{if(signal.aborted)cancel();return await started.completion;}finally{signal.removeEventListener('abort',cancel);}
        });
      }
      if(command==='publisher.review'){
        only(input,['productId','runId','expectedCandidateDigest','review'],'COUCHDB_REVIEW_INPUT_INVALID');
        return withPublisher(input.productId,async publisher=>{
          const candidate=await publisher.candidate(input.runId);need(candidate.manifest.candidateDigest===hash(input.expectedCandidateDigest),'COUCHDB_CANDIDATE_CHANGED');
          const before=await checkpoint('review-before',{reviewId:publisher.run(input.runId).data.review?.id??null,candidateDigest:input.expectedCandidateDigest});
          const current=publisher.run(input.runId),review=current.data.review;
          if(review&&review.id!==before.reviewId){
            const match=review.candidateDigest===input.expectedCandidateDigest&&review.reviewer===input.review.reviewer?.trim()&&review.note===input.review.note?.trim()&&
              (input.review.initialize===true?review.target.mode==='initialize':review.target.mode==='refresh'&&review.target.expectedSnapshot===input.review.expectedSnapshot&&review.target.expectedRevision===input.review.expectedRevision);
            need(match,'COUCHDB_REVIEW_OPERATION_CHANGED');return current;
          }
          return publisher.review(input.runId,input.review);
        });
      }
      if(command==='publisher.publish'||command==='publisher.recover'){
        only(input,command==='publisher.publish'?['productId','runId','reviewId']:['productId','runId'],'COUCHDB_PUBLICATION_INPUT_INVALID');
        return withPublisher(input.productId,async publisher=>{
          const current=publisher.run(input.runId);
          if(command==='publisher.recover')return publisher.recover(input.runId);
          need(current.data.review?.id===input.reviewId,'COUCHDB_REVIEW_CHANGED');
          if(current.state==='PUBLISHED')return current;
          if(current.state==='PUBLICATION_UNKNOWN')return publisher.recover(input.runId);
          return publisher.publish(input.runId,input.reviewId);
        });
      }
      if(command==='deployment.review'){
        only(input,['productId','runId','terms'],'COUCHDB_DEPLOYMENT_INPUT_INVALID');
        return withPublisher(input.productId,publisher=>reviewCouchdbDeployment({publisher,runId:input.runId,terms:input.terms}));
      }
      if(command==='deployment.prepare'){
        only(input,['productId','runId','terms','expectedReviewSha256'],'COUCHDB_DEPLOYMENT_INPUT_INVALID');
        return withPublisher(input.productId,publisher=>prepareCouchdbDeployment({publisher,runId:input.runId,terms:input.terms,expectedReviewSha256:input.expectedReviewSha256,directory:join(root,'deployments',id)}));
      }
      if(command==='deployment.rebind'){
        only(input,['productId','deploymentId','expectedSourceSha256','expectedExecutionSha256'],'COUCHDB_REBIND_INPUT_INVALID');
        await product(identifier(input.productId));
        return rebindCouchdbDeployment({packageDirectory:join(root,'deployments',identifier(input.deploymentId)),datasetDirectory:join(root,'datasets',input.productId),
          workspaceId:workspace.id,expectedSourceSha256:input.expectedSourceSha256,expectedExecutionSha256:input.expectedExecutionSha256,directory:join(root,'deployments',id)});
      }
      if(command==='release.stage'){
        only(input,['deploymentId','expectedSourceSha256','releaseId','label','runtime'],'COUCHDB_RELEASE_INPUT_INVALID');
        return stageCouchdbDeployment({packageDirectory:join(root,'deployments',identifier(input.deploymentId)),releaseDirectory:releaseRoot,
          id:input.releaseId,label:input.label??input.releaseId,runtime:input.runtime??{port:0},expectedSourceSha256:input.expectedSourceSha256});
      }
      if(command==='release.console.open'){
        only(input,[],'COUCHDB_RELEASE_INPUT_INVALID');
        if(!releaseConsole){
          const {initReleaseStore}=await import('../../sf82-seller-pilot/releases.mjs');
          const {startReleaseConsole}=await import('../../sf82-seller-pilot/release-console.mjs');
          await initReleaseStore(releaseRoot);
          releaseConsole={id:randomUUID(),native:await startReleaseConsole(releaseRoot,{port:0,clientExportsDirectory:join(root,'customers'),env:environment})};
        }
        return consoleView();
      }
      if(command==='release.console.close'){
        only(input,['instanceId'],'COUCHDB_RELEASE_INPUT_INVALID');
        if(releaseConsole){need(releaseConsole.id===input.instanceId,'COUCHDB_RELEASE_CONSOLE_CHANGED');const selected=releaseConsole;await selected.native.close();if(releaseConsole===selected)releaseConsole=null;}
        return consoleView();
      }
      if(command==='release.command'){
        only(input,['consoleInstanceId','action','expectedGeneration','expectedDigest','parameters'],'COUCHDB_RELEASE_INPUT_INVALID');
        need(['activate','rollback','run','stop','restart'].includes(input.action),'COUCHDB_RELEASE_ACTION_INVALID');
        need(releaseConsole?.id===input.consoleInstanceId,'COUCHDB_RELEASE_CONSOLE_CHANGED');
        only(input.parameters??{},['id','to','instanceId','reason','receiving'],'COUCHDB_RELEASE_INPUT_INVALID');
        if(await exists(join(folder,'release-before.json')))return {mode:'OBSERVED_ORIGINAL_STATE',action:input.action,originalOperationId:id,...await releaseState()};
        const current=await originalConsole('GET','/api/status');
        need(current.state.generation===input.expectedGeneration,'COUCHDB_RELEASE_GENERATION_CHANGED',undefined,409);
        if(input.action!=='stop'){
          const {inspectRelease}=await import('../../sf82-seller-pilot/releases.mjs');
          const releaseId=input.action==='activate'?input.parameters?.id:input.action==='rollback'?input.parameters?.to??current.state.previous:current.state.active;
          need((await inspectRelease(releaseRoot,releaseId)).digest===hash(input.expectedDigest),'COUCHDB_RELEASE_CHANGED');
        }
        await checkpoint('release-before',{consoleInstanceId:releaseConsole.id,native:current});
        return {mode:'ORIGINAL_CONSOLE_REPLY',action:input.action,native:await originalConsole('POST','/api/'+input.action,{...input.parameters,expectedGeneration:input.expectedGeneration})};
      }
      if(command==='client.generate'){
        only(input,['consoleInstanceId','instanceId'],'COUCHDB_CLIENT_INPUT_INVALID');
        const beforeFile=join(folder,'client-before.json'),before=await optionalJSON(beforeFile,16384);
        if(before)need(before.schema==='stellar-forge.couchdb-client-generation.v1'&&before.exportId===id&&
          before.consoleInstanceId===input.consoleInstanceId&&before.instanceId===input.instanceId&&
          typeof before.releaseId==='string'&&HASH.test(before.releaseDigest??''),'COUCHDB_CLIENT_SOURCE_CHANGED');
        let completed;
        try{completed=await clients.call('merchant_client_export_manifest',{exportId:id});}
        catch(error){if(!['ENOENT','CLIENT_EXPORT_MANIFEST_REQUIRED'].includes(error.code))throw error;}
        if(completed){
          need(before&&identity(completed.manifest.provenance)===identity({exportId:id,releaseId:before.releaseId,
            releaseDigest:before.releaseDigest,instanceId:before.instanceId}),'COUCHDB_CLIENT_SOURCE_CHANGED');
          return clients.inspect({exportId:id,includeOffers:true});
        }
        need(releaseConsole?.id===input.consoleInstanceId,'COUCHDB_RELEASE_CONSOLE_CHANGED');
        const current=await originalConsole('GET','/api/status');
        need(current.console?.managesRunningSeller&&current.console.instanceId===input.instanceId,'COUCHDB_CLIENT_INSTANCE_CHANGED');
        const {inspectRelease}=await import('../../sf82-seller-pilot/releases.mjs');
        const selected=await inspectRelease(releaseRoot,current.state.active);
        const expected={schema:'stellar-forge.couchdb-client-generation.v1',exportId:id,
          consoleInstanceId:input.consoleInstanceId,instanceId:input.instanceId,releaseId:selected.id,releaseDigest:selected.digest};
        if(before)need(identity(before)===identity(expected),'COUCHDB_CLIENT_SOURCE_CHANGED');
        else await checkpoint('client-before',expected);
        return originalConsole('POST','/api/clients/generate',{id,instanceId:input.instanceId});
      }
      if(command==='client.adopt'){
        only(input,['exportId','expectedFilesSha256'],'COUCHDB_CLIENT_INPUT_INVALID');
        return clients.call('merchant_client_export_adopt',input);
      }
      if(command==='client.receive'){
        only(input,['directory','exportId','expectedManifestSha256'],'COUCHDB_CLIENT_INPUT_INVALID');
        const from=resolve(input.directory),selected=await readSellerClientManifest({directory:from,exportId:input.exportId});
        need(selected.manifestFile.sha256===hash(input.expectedManifestSha256),'COUCHDB_CLIENT_MANIFEST_CHANGED');
        const target=join(root,'customers',input.exportId);need(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(input.exportId),'COUCHDB_CLIENT_ID_INVALID');
        need(target!==from&&!target.startsWith(from+'/')&&!from.startsWith(target+'/'),'COUCHDB_CLIENT_DIRECTORY_OVERLAP');
        await privateDirectory(target,true);
        for(const file of [...selected.manifest.files,selected.manifestFile]){
          need([...CLIENT_EXPORT_FILES,CLIENT_EXPORT_MANIFEST].includes(file.name),'COUCHDB_CLIENT_FILE_CHANGED');
          const raw=await readPrivate(join(from,file.name),Math.max(file.bytes,1));need(raw.length===file.bytes&&digest(raw)===file.sha256,'COUCHDB_CLIENT_FILE_CHANGED');
          await retain(join(target,file.name),raw);
        }
        return clients.inspect({exportId:input.exportId,includeOffers:true});
      }
      if(command==='project.receive'){
        only(input,['file','expectedSha256','directory'],'COUCHDB_RECEIVING_INPUT_INVALID');
        const {receiveCouchdbProject}=await import('./portable.mjs');
        return receiveCouchdbProject({file:input.file,expectedSha256:input.expectedSha256,directory:input.directory,environment,signal});
      }
      if(command==='project.export'){
        only(input,[],'COUCHDB_EXPORT_INPUT_INVALID');
        const state=await releaseState();need(!state.native?.console?.managesRunningSeller,'COUCHDB_EXPORT_RUNNING_SELLER','Stop this workspace’s selected seller before capturing its complete private version store.',409);
        const {exportCouchdbProject}=await import('./portable.mjs');
        return exportCouchdbProject({workspaceRoot:root,workspace,operationId:id,directory:join(root,'exports',id),environment,signal});
      }
      need(false,'COUCHDB_COMMAND_NOT_FOUND',undefined,404);
    }
    async function queue(request){
      const id=request.id;
      if(active.has(id))return active.get(id);
      const job=tail.then(async()=>{
        available();const folder=operationPath(id),old=await optionalJSON(join(folder,'state.json'));
        const completed=await optionalJSON(join(folder,'result.json'));
        if(completed){need(completed.requestSha256===identity(request),'COUCHDB_OPERATION_RESULT_CHANGED');return completed.value;}
        if(old)need(old.schema==='stellar-forge.couchdb-operation-state.v1'&&old.id===id&&old.requestSha256===identity(request)&&Number.isFinite(Date.parse(old.startedAt)),'COUCHDB_OPERATION_STATE_CHANGED');
        const controller=new AbortController();controllers.set(id,controller);
        const state={schema:'stellar-forge.couchdb-operation-state.v1',id,requestSha256:identity(request),state:'RUNNING',startedAt:old?.startedAt??stamp(),updatedAt:stamp()};
        await atomicJson(folder,'state.json',state);
        try{
          const value=await execute(request.command,request.input,{id,folder,signal:controller.signal,startedAt:state.startedAt});
          const result={schema:'stellar-forge.couchdb-operation-result.v1',workspaceId:workspace.id,id,requestSha256:identity(request),value};
          need(bytes(result).length<=MAX_BODY,'COUCHDB_OPERATION_RESULT_TOO_LARGE');
          await retainJSON(join(folder,'result.json'),result);
          const completedState={...state,state:'COMPLETE',updatedAt:stamp(),resultSignature:await signature(join(folder,'result.json'))};
          completedState.summary=operationSummary(request,completedState,result);
          await atomicJson(folder,'state.json',completedState);
          return value;
        }catch(error){
          await atomicJson(folder,'state.json',{...state,state:controller.signal.aborted?'INTERRUPTED':'FAILED',updatedAt:stamp(),error:safeIssue(error)}).catch(()=>{});
          throw error;
        }finally{controllers.delete(id);}
      });
      tail=job.catch(()=>{});active.set(id,job);job.finally(()=>{if(active.get(id)===job)active.delete(id);}).catch(()=>{});return job;
    }
    async function retainRequest(command,input,{id=randomUUID()}={}){
      available();identifier(id);need(COUCHDB_COMMANDS.includes(command)&&object(input),'COUCHDB_COMMAND_INPUT_INVALID');
      const request={schema:'stellar-forge.couchdb-operation.v1',workspaceId:workspace.id,id,command,input};
      const raw=bytes(request);need(raw.length<=MAX_BODY,'COUCHDB_OPERATION_REQUEST_TOO_LARGE');
      const write=intake.then(async()=>{const folder=operationPath(id);await privateDirectory(folder,true);await retain(join(folder,'request.json'),raw);
        await atomicJson(folder,'metadata.json',{schema:'stellar-forge.couchdb-operation-metadata.v1',id,workspaceId:workspace.id,command,requestSha256:identity(request),requestSignature:await signature(join(folder,'request.json'))});return request;});
      intake=write.catch(()=>{});return write;
    }
    async function run(command,input,options){const request=await retainRequest(command,input,options);return queue(request);}
    async function start(command,input,options){const request=await retainRequest(command,input,options);queue(request).catch(()=>{});return operation(request.id,{includeResult:false});}
    async function resume(id){const current=await operation(identifier(id));return queue(current.request);}
    async function query(name,input={}){
      available();need(object(input),'COUCHDB_QUERY_INPUT_INVALID');
      if(name==='info'){only(input,[],'COUCHDB_QUERY_INPUT_INVALID');return {schema:COUCHDB_WORKSPACE_SCHEMA,workspaceId:workspace.id,workspaceIdentitySha256:workspace.sha256,directory:root,commands:COUCHDB_COMMANDS,active:[...active.keys()],release:consoleView()};}
      if(name==='operation'){only(input,['id','includeResult'],'COUCHDB_QUERY_INPUT_INVALID');return operation(input.id,{includeResult:input.includeResult!==false});}
      if(name==='operations')return page(join(root,'operations'),input,async id=>await exists(join(operationPath(id),'request.json'))?operation(id,{includeResult:false}):null);
      if(name==='connections')return page(join(root,'connections'),input,async id=>{const connection=await readJson(join(root,'connections',hash(id),'connection.json'),MAX_BODY);need(identity(validateConnection(connection))===id,'COUCHDB_CONNECTION_CHANGED');return {id,sourceId:sourceIdentity(connection),connection:compactConnection(connection)};});
      if(name==='captures')return page(join(root,'captures'),input,async id=>await exists(captureFile(id))?captureView(await capture(id)):{id,state:'INCOMPLETE'});
      if(name==='capture'){only(input,['id','offset','limit'],'COUCHDB_QUERY_INPUT_INVALID');const c=await capture(input.id),offset=integer(input.offset??0,0,10000000),limit=integer(input.limit??50,1,500);return {...captureView(c),items:c.documents.slice(offset,offset+limit),offset,nextOffset:offset+limit<c.documents.length?offset+limit:null};}
      if(name==='document'){only(input,['captureId','documentId'],'COUCHDB_QUERY_INPUT_INVALID');const c=await capture(input.captureId),d=await c.readDocument(input.documentId);return {captureId:input.captureId,manifestSha256:c.manifestSha256,document:d.document,bodySha256:d.raw?digest(d.raw):null,bytes:d.raw?.length??0,json:d.raw?.toString('utf8')??null};}
      if(name==='compare'){only(input,['left','right','offset','limit'],'COUCHDB_QUERY_INPUT_INVALID');return compareCouchdbCaptures(await capture(input.left),await capture(input.right),{offset:input.offset,limit:input.limit});}
      if(name==='mappings')return page(join(root,'mappings'),input,async id=>{if(!await exists(join(root,'mappings',id,'mapping.json')))return null;const m=await mapping(id);return {...m,source:undefined};});
      if(name==='mapping'){only(input,['id'],'COUCHDB_QUERY_INPUT_INVALID');const m=await mapping(input.id);return {...m,source:{hash:m.source.hash,config:m.source.config,queries:m.source.queries}};}
      if(name==='products')return page(join(root,'products'),input,async id=>await exists(join(productPath(id),'selection.json'))?product(id):null);
      if(name==='product'){only(input,['id'],'COUCHDB_QUERY_INPUT_INVALID');return product(input.id);}
      if(name==='publisher.status'||name==='publisher.inspect'||name==='publisher.target'){
        const {productId,...options}=input;
        const job=tail.then(()=>withPublisher(productId,publisher=>name==='publisher.status'?publisher.status(options):name==='publisher.inspect'?publisher.inspect(options.runId,options.query):publisher.target()));
        tail=job.catch(()=>{});return job;
      }
      if(name==='deployment'){only(input,['id'],'COUCHDB_QUERY_INPUT_INVALID');return inspectCouchdbDeployment(join(root,'deployments',identifier(input.id)));}
      if(name==='release.status'){only(input,[],'COUCHDB_QUERY_INPUT_INVALID');return releaseState();}
      if(name==='release.compare'){only(input,['from','to'],'COUCHDB_QUERY_INPUT_INVALID');const {compareReleases,readReleaseState}=await import('../../sf82-seller-pilot/releases.mjs');const state=await readReleaseState(releaseRoot);return {generation:state.generation,...await compareReleases(releaseRoot,input.from??state.active,input.to)};}
      if(name==='file.metadata'||name==='file.read'){
        only(input,['kind','input','expectedSha256','readId','offset','limit'],'COUCHDB_FILE_QUERY_INVALID');
        need(typeof input.kind==='string'&&object(input.input),'COUCHDB_FILE_QUERY_INVALID');
        if(name==='file.metadata'){const selected=await file(input.kind,input.input);return {name:selected.filename,contentType:selected.mime,sha256:selected.sha256,bytes:selected.bytes?.length??selected.bytesLength};}
        hash(input.expectedSha256);
        return fileReads.read({scope:workspace.id,key:identity({kind:input.kind,input:input.input}),kind:input.kind,directory:root,
          readId:input.readId,expectedSha256:input.expectedSha256,offset:input.offset,limit:input.limit,
          load:async()=>{
            const selected=await file(input.kind,input.input),metadata={name:selected.filename,contentType:selected.mime,sha256:selected.sha256,bytes:selected.bytes?.length??selected.bytesLength};
            need(metadata.sha256===input.expectedSha256,'COUCHDB_FILE_CHANGED');
            if(selected.bytes)return {bytes:selected.bytes,name:metadata.name,type:metadata.contentType};
            const handle=await open(selected.path,constants.O_RDONLY|constants.O_NOFOLLOW);
            try{const stat=await handle.stat({bigint:true}),named=await lstat(selected.path,{bigint:true});
              need(stat.isFile()&&stat.nlink===1n&&!(stat.mode&0o077n)&&['dev','ino','size','mtimeNs','ctimeNs'].every(key=>stat[key]===named[key]),'COUCHDB_PRIVATE_FILE_REQUIRED');
              return {readonlyFileHandle:handle,bytes:metadata.bytes,sha256:metadata.sha256,name:metadata.name,type:metadata.contentType};
            }catch(error){await handle.close();throw error;}
          }});
      }
      if(name==='file.release'){only(input,['readId'],'COUCHDB_FILE_QUERY_INVALID');await fileReads.release(workspace.id,identifier(input.readId));return {released:true,readId:input.readId};}
      if(name==='clients'){const original=await clients.list(input);return {...original,items:original.entries,nextCursor:original.nextAfter};}
      if(name==='client')return clients.inspect({...input,includeOffers:true});
      if(name==='client.manifest')return clients.call('merchant_client_export_manifest',input);
      if(name==='client.file')return clients.call('merchant_client_export_file',input);
      if(name==='client.file.close')return clients.call('merchant_client_export_file_release',input);
      need(false,'COUCHDB_QUERY_NOT_FOUND',undefined,404);
    }
    async function file(kind,input){
      if(kind==='document'){const c=await capture(input.captureId),d=await c.readDocument(input.documentId);need(d.raw,'COUCHDB_DOCUMENT_BODY_ABSENT','This native row records a missing document; the complete capture retains its original response.',404);return {bytes:d.raw,sha256:digest(d.raw),filename:'document-'+digest(Buffer.from(input.documentId)).slice(0,16)+'.json',mime:'application/json; charset=utf-8'};}
      if(kind==='attachment'){const c=await capture(input.captureId),r=await c.readAttachment(input.documentId,input.name);return {bytes:r.raw,sha256:r.attachment.sha256,filename:input.name.split(/[\\/]/).at(-1).replace(/[^A-Za-z0-9_.-]/g,'_')||'attachment',mime:'application/octet-stream'};}
      if(kind==='capture'){const c=await capture(input.id);return {bytes:c.manifestBytes,sha256:c.manifestSha256,filename:'capture.json',mime:'application/json; charset=utf-8'};}
      if(kind==='mapping'){const selected=await mapping(input.id);return {bytes:selected.source.original,sha256:selected.sourceHash,filename:'couchdb-source.json',mime:'application/json; charset=utf-8'};}
      if(kind==='deployment')return readCouchdbDeploymentFile(join(root,'deployments',identifier(input.id)),input.file);
      if(kind==='connection'){const raw=await readPrivate(join(root,'connections',hash(input.id),'connection.json'),MAX_BODY);return {bytes:raw,sha256:digest(raw),filename:'couchdb-connection.json',mime:'application/json; charset=utf-8'};}
      if(kind==='export'){
        const saved=await operation(identifier(input.id));need(saved.command==='project.export'&&saved.state==='COMPLETE','COUCHDB_EXPORT_NOT_COMPLETE');
        const path=join(root,'exports',input.id,'workspace.zip');return {path,sha256:saved.value.archive.sha256,bytesLength:Number(saved.value.archive.bytes),filename:'couchdb-workspace-'+workspace.id+'.zip',mime:'application/zip'};
      }
      need(false,'COUCHDB_FILE_NOT_FOUND',undefined,404);
    }
    function cancel(id){identifier(id);const controller=controllers.get(id);need(controller,'COUCHDB_OPERATION_NOT_RUNNING',undefined,409);controller.abort();return {id,cancelling:true};}
    async function close(){
      if(closing)return closing;closed=true;for(const controller of controllers.values())controller.abort();
      closing=(async()=>{await intake;await tail;try{await releaseConsole?.native.close();}finally{try{await fileReads.close();}finally{try{await clients.close();}finally{await unlock();}}}})();return closing;
    }
    return Object.freeze({directory:root,identity:workspace,query,run,start,resume,cancel,file,close});
  }catch(error){try{await fileReads.close();}finally{try{await clients?.close();}finally{await unlock();}}throw error;}
}
