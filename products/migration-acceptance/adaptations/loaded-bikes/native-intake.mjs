// SPDX-License-Identifier: MIT
// Additive source retention; unchanged Workspace owns uploads, requests and native jobs.
import {readFileSync,lstatSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {atomicJson,atomicBytes,identity,canonical,safeRelative} from '../../workbench/vendor/dlt/vendor/sling/core/common.mjs';
import {compilePipeline} from '../../workbench/vendor/dlt/pipeline/plan.mjs';
import {prepareCatalogue,buildPipelineInput} from './catalogue.mjs';
import {validateProject} from './review-state.mjs';
import {verifySourceClaims} from './acceptance.mjs';
const check=(yes,message)=>{if(!yes)throw new Error(message);};
const hash=body=>createHash('sha256').update(body).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const pin=body=>({bytes:body.length,sha256:hash(body)});
const descriptor=file=>({path:file.path,bytes:file.bytes,sha256:file.sha256});
export async function prepareProject(project){
  validateProject(project);
  if(project.claims)verifySourceClaims({catalogue:project.capture,claims:project.claims});
  const prepared=await prepareCatalogue({capture:project.capture,review:project.review});
  const files=prepared.files.map(({content,...f})=>({...f,raw:Buffer.from(content,'utf8')}));
  const add=(path,value,role)=>{const raw=Buffer.from(json(value));files.push({path,role,raw,...pin(raw)});};
  add('review/project.json',project,'loaded-bikes-editable-review');
  if(project.claims){
    add('source/source-claims.json',project.claims,'loaded-bikes-published-claims');
    for(const response of project.claims.original_response_additions??[]){
      safeRelative(response.path);check(!files.some(f=>f.path===response.path),'Supplemental original source path collides: '+response.path);
      const raw=Buffer.from(response.content_base64,'base64');
      check(raw.length===response.bytes&&hash(raw)===response.sha256,'Supplemental original source identity changed.');
      files.push({path:response.path,role:'loaded-bikes-original-response',mediaType:'application/json',raw,...pin(raw)});
    }
  }
  // Keep the complete editable customer review as an explicit source, including decision history.
  const {bindingSha256,...binding}=prepared.binding;
  binding.editableProject=descriptor(files.find(f=>f.path==='review/project.json'));
  if(project.claims)binding.publishedClaims=descriptor(files.find(f=>f.path==='source/source-claims.json'));
  binding.sourceFiles=files.map(({raw,...f})=>f);binding.bindingSha256=hash(Buffer.from(canonical(binding)));
  return {...prepared,binding,files,project};
}
export function materializePrepared(prepared,directory){
  const root=resolve(directory);mkdirSync(root,{recursive:true,mode:0o700});
  for(const file of prepared.files){safeRelative(file.path);check(file.raw.length===file.bytes&&hash(file.raw)===file.sha256,'Prepared file identity changed.');atomicBytes(join(root,file.path),file.raw,{immutable:true});}
  atomicJson(join(root,'integration/CATALOGUE_BINDING.json'),prepared.binding,{immutable:true});
  return root;
}
export function compileCatalogueInput(prepared,intake,options={}){
  const input=buildPipelineInput(prepared,{sourceIds:intake.sourceIds,expectedSourceIds:intake.expectedSourceIds,...options});
  const compiled=compilePipeline(input);check(compiled.ready,'The original native compiler requires further mapping review.');return {input,compiled};
}
export async function retainCatalogueInputs(workspace,actor,{projectId,operationId,prepared}){
  check(typeof operationId==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(operationId),'Use one original stable intake operation ID.');
  check(workspace.store.exists(projectId),'Select the existing original product project.');
  const {bindingSha256,...body}=prepared.binding;check(hash(Buffer.from(canonical(body)))===bindingSha256,'Prepared source mapping changed.');
  // A completed intake travels as a normal immutable source in the original archive.
  // Adopt its exact original requests on a portable reopen; never reconstruct old revision guards.
  const current=workspace.store.get(projectId);
  for(const candidate of current.sources.filter(x=>x.role==='loaded-bikes-intake-requests')){
    const raw=workspace.store.objects.read(candidate.sha256,candidate.bytes);
    check(raw.length===candidate.bytes&&hash(raw)===candidate.sha256,'Retained intake journal bytes differ.');
    const ledger=JSON.parse(raw.toString('utf8'));
    if(ledger.operationId!==operationId||ledger.projectId!==projectId)continue;
    check(ledger.schema==='tjlabs.loaded-bikes-original-source-retention.v1'&&ledger.mappingSha256===bindingSha256,'Original intake operation selects another source edition.');
    const expectedFiles=[...prepared.files,{path:'integration/CATALOGUE_BINDING.json',raw:Buffer.from(json(prepared.binding))}];
    check(Array.isArray(ledger.receipts)&&ledger.receipts.length===expectedFiles.length,'Retained intake request set is incomplete.');
    const byPath=Object.create(null);
    for(let i=0;i<expectedFiles.length;i++){
      const f=expectedFiles[i],r=ledger.receipts[i],actual=pin(f.raw);
      check(r.path===f.path&&r.source.sha256===actual.sha256&&r.source.bytes===actual.bytes&&r.request.projectId===projectId&&r.intent.operationId===operationId,'Retained original intake request selection differs.');
      const original=workspace.store.request(actor.id,r.request.requestId,r.request);
      check(original&&original.result.sourceId===r.source.id&&original.view.revision===r.result.revision,'Original saved intake request is absent or differs.');
      const selected=current.sources.find(x=>x.id===r.source.id);
      check(selected&&selected.sha256===actual.sha256&&selected.bytes===actual.bytes,'Received original source is missing.');
      byPath[f.path]=r.source.id;
    }
    const sourceIds={},expectedSourceIds={};for(const t of prepared.binding.tables){sourceIds[t.sourceTable]=byPath[t.source.path];expectedSourceIds[t.sourceTable]=byPath[t.expected.path];}
    return {schema:'tjlabs.loaded-bikes-original-input-binding.v1',workspaceInstanceId:workspace.store.instanceId,sourceWorkspaceInstanceId:ledger.workspaceInstanceId,projectId,operationId,mappingSha256:bindingSha256,
      sourceIds,expectedSourceIds,bindingSourceId:byPath['integration/CATALOGUE_BINDING.json'],ledgerSourceId:candidate.id,receipts:ledger.receipts,byPath,nativeJobStarted:false,completedOriginalIntakeAdopted:true};
  }
  const receipts=[],byPath=Object.create(null);
  async function retain(file,role){
    check(file.raw.length===file.bytes&&hash(file.raw)===file.sha256,'Source bytes changed before original retention.');
    const requestId='loaded_bikes_'+identity({actorId:actor.id,projectId,operationId,path:file.path,role}).slice(0,48);
    const uploadId='loaded_bikes_'+identity({actorId:actor.id,requestId,sha256:file.sha256}).slice(0,48);
    const intent={schema:'tjlabs.loaded-bikes-original-intake-intent.v1',projectId,operationId,sourceMappingSha256:bindingSha256,path:file.path,bytes:file.bytes,sha256:file.sha256,role};
    const requestPath=join(workspace.directory,'cli-requests',identity({actorId:actor.id,requestId})+'.json');
    let input;
    if(existsSync(requestPath)){check(!lstatSync(requestPath).isSymbolicLink(),'Retain the original ordinary request journal.');const old=JSON.parse(readFileSync(requestPath,'utf8'));
      check(old.intentSha256===identity(intent),'Original intake request names another full source edition.');input=old.input;}
    else{
      input={projectId,requestId,expectedRevision:workspace.store.head(projectId),action:'source.retain',
        payload:{uploadId,title:file.path,role,url:'',notes:'Complete original Loaded Bikes catalogue intake '+operationId+'; mapping '+bindingSha256}};
      atomicJson(requestPath,{schema:'tjlabs.sling-cli-request.v1',actorId:actor.id,requestId,intentSha256:identity(intent),input,intent},{immutable:true});
    }
    const previous=workspace.store.request(actor.id,requestId,input);
    if(!previous){
      let current=await workspace.uploads.start(actor,{uploadId,filename:file.path.split('/').at(-1),mediaType:file.path.endsWith('.json')?'application/json':(file.path.endsWith('.jsonl')||file.path.endsWith('.ndjson'))?'application/x-ndjson':'application/octet-stream',bytes:file.bytes,sha256:file.sha256});
      while(current.offset<file.bytes){const start=current.offset,end=Math.min(start+8*1024*1024,file.bytes),chunk=file.raw.subarray(start,end);
        current=await workspace.uploads.chunk(actor,uploadId,{start,end:end-1,total:file.bytes,sha256:hash(chunk)},chunk);}
      await workspace.uploads.finish(actor,uploadId);
    }
    const result=await workspace.dispatch(actor,input),sourceId=result.result?.sourceId;
    const selected=workspace.store.get(projectId).sources.find(x=>x.id===sourceId);
    check(selected&&selected.bytes===file.bytes&&selected.sha256===file.sha256,'Original source retention result does not bind the full selected bytes.');
    receipts.push({path:file.path,request:input,intent,result:{sourceId,revision:result.view.revision},source:{id:sourceId,...descriptor(file)}});
    byPath[file.path]=sourceId;return sourceId;
  }
  // Every original response, review, staging table, independent expected table and assertion is retained.
  for(const file of prepared.files)await retain(file,'loaded-bikes-reference-'+hash(Buffer.from(file.path)).slice(0,24));
  const bindingRaw=Buffer.from(json(prepared.binding)),bindingFile={path:'integration/CATALOGUE_BINDING.json',raw:bindingRaw,...pin(bindingRaw)};
  await retain(bindingFile,'loaded-bikes-reference-binding');
  // Full exact previous request inputs survive portable product receiving as an ordinary source.
  // The final ledger retention request remains in the original CLI journal and product request history.
  const ledger={schema:'tjlabs.loaded-bikes-original-source-retention.v1',workspaceInstanceId:workspace.store.instanceId,projectId,operationId,mappingSha256:bindingSha256,receipts:[...receipts]};
  const ledgerRaw=Buffer.from(json(ledger));const ledgerSourceId=await retain({path:'integration/INTAKE_REQUESTS.json',raw:ledgerRaw,...pin(ledgerRaw)},'loaded-bikes-intake-requests');
  const sourceIds={},expectedSourceIds={};for(const t of prepared.binding.tables){sourceIds[t.sourceTable]=byPath[t.source.path];expectedSourceIds[t.sourceTable]=byPath[t.expected.path];}
  return {schema:'tjlabs.loaded-bikes-original-input-binding.v1',workspaceInstanceId:workspace.store.instanceId,projectId,operationId,mappingSha256:bindingSha256,
    sourceIds,expectedSourceIds,bindingSourceId:byPath[bindingFile.path],ledgerSourceId,receipts,byPath,nativeJobStarted:false};
}
