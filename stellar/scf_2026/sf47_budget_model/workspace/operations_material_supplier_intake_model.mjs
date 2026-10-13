// SPDX-License-Identifier: MIT
// Original supplier intake retention; parsing and selection remain native.
import {Sha256} from './operations_installation_source_hash.mjs';
export const SUPPLIER_INTAKE='stellar-forge.material-supplier-intake.v1';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const need=(ok,message)=>{if(!ok)throw Error(message);},clone=v=>structuredClone(v);
export const intakeCanonical=v=>JSON.stringify(v,(_,x)=>object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const intakeDigest=v=>new Sha256().update(new TextEncoder().encode(intakeCanonical(v))).hex();
const same=(a,b)=>intakeCanonical(a)===intakeCanonical(b);
const text=(v,max)=>typeof v==='string'&&v.length<=max,hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(v);
export const pendingSupplierRequests=state=>(state.supplierIntakes??[]).flatMap(intake=>intake.requests.filter(r=>['PREPARED','RUNNING'].includes(r.state)).map(request=>({intake,request})));
export function createSupplierIntake({id:identity,name,scope,at}){
 need(id(identity)&&text(name,300)&&name.trim(),'Name the original supplier intake.');
 return {schema:SUPPLIER_INTAKE,id:identity,name,scope:clone(scope),createdAt:at,updatedAt:at,
 connection:null,draft:{title:'',tenantId:'',catalogId:'',sourceFileId:'',sourceId:'',formatText:'{"kind":"bmecat-xml"}',provenanceText:'{}',mappingText:'',mode:'full',baseEditionId:'',notes:''},
 files:[],workspace:null,observations:[],profiles:[],previews:[],requests:[],bundles:[],history:[]};
}
export function supplierFileBytes(file,maximum){
 need(object(file)&&id(file.id)&&text(file.name,240)&&file.name&&!/[\/\\\u0000-\u001f]/.test(file.name)&&Number.isSafeInteger(file.bytes)&&file.bytes>0&&file.bytes<=maximum&&hash(file.sha256),'Retain the bounded exact original supplier file.');
 need(typeof file.contentBase64==='string'&&file.contentBase64.length<=4*Math.ceil(maximum/3),'The complete encoded supplier file exceeds its limit.');
 const binary=atob(file.contentBase64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 need(bytes.length===file.bytes&&new Sha256().update(bytes).hex()===file.sha256,'The original supplier file differs from its retained byte identity.');return bytes;
}
export function validateSupplierIntake(v,{maximumSource=16*1024*1024,history=true}={}){
 need(object(v)&&v.schema===SUPPLIER_INTAKE&&id(v.id)&&text(v.name,300)&&object(v.scope)&&text(v.scope.caseId,200)&&text(v.scope.planId,200)&&text(v.scope.createdAt,100),'Retain the original named supplier intake and case scope.');
 need(text(v.createdAt,100)&&text(v.updatedAt,100)&&object(v.draft),'Retain the complete supplier draft.');
 const d=v.draft;for(const k of ['title','tenantId','catalogId','sourceFileId','sourceId','mode','baseEditionId'])need(text(d[k],1000),'Retain the unfinished supplier '+k+' field.');
 for(const k of ['formatText','provenanceText','mappingText'])need(text(d[k],2*1024*1024),'Retain bounded complete unfinished '+k+' text.');
 need(text(d.notes,16000),'Retain bounded complete notes.');
 for(const [name,max]of [['files',50],['observations',100],['profiles',100],['previews',100],['requests',200],['bundles',100],['history',50]])need(Array.isArray(v[name])&&v[name].length<=max,'Retain bounded complete supplier '+name+'.');
 const files=new Set();for(const f of v.files){supplierFileBytes(f,maximumSource);need(!files.has(f.id),'Duplicate original supplier file identity.');files.add(f.id);}
 need(!d.sourceFileId||files.has(d.sourceFileId),'The selected original supplier file is missing.');
 need(v.connection===null||object(v.connection)&&text(v.connection.id,200)&&text(v.connection.workspaceId,200)&&hash(v.connection.configurationSha256),'Retain the selected configured native workspace identity.');
 need(v.workspace===null||object(v.workspace),'Retain the exact original workspace observation.');
 const requests=new Set();for(const r of v.requests){
  need(object(r)&&id(r.id)&&text(r.action,80)&&r.action&&object(r.body)&&hash(r.bodySha256)&&r.bodySha256===intakeDigest(r.body)&&text(r.createdAt,100)&&['PREPARED','RUNNING','COMPLETE','FAILED','INTERRUPTED','REJECTED'].includes(r.state),'Retain the exact original request, body identity and native state.');
  need(!requests.has(r.id),'Duplicate original supplier operation.');requests.add(r.id);
  need(r.sourceFileId===null||files.has(r.sourceFileId),'The request original supplier file is missing.');
  need(['upload','save','preview','select'].includes(r.action)&&object(r.body.nativeRequest)&&r.body.nativeRequest.requestId===r.id&&Number.isSafeInteger(r.body.expectedVersion)&&r.body.expectedVersion>0&&v.connection&&r.body.connectionId===v.connection.id&&r.body.expectedWorkspaceId===v.connection.workspaceId&&r.body.expectedConnectionSha256===v.connection.configurationSha256,'Keep the native request bound to its original configured workspace and case version.');
  if(r.action==='upload'){const f=v.files.find(x=>x.id===r.sourceFileId),n=r.body.nativeRequest;need(f&&n.name===f.name&&n.bytes===f.bytes&&n.sha256===f.sha256&&r.body.contentBase64===f.contentBase64,'The retained upload request differs from its complete original file.');}
  if(r.action==='preview')need(object(r.previewBasis)&&r.previewBasis.catalogId===r.body.nativeRequest.catalogId&&r.previewBasis.catalogRevision===r.body.nativeRequest.expectedRevision&&r.previewBasis.sourceId===r.body.nativeRequest.sourceId&&r.previewBasis.mode===r.body.nativeRequest.mode&&r.previewBasis.baseEditionId===r.body.nativeRequest.baseEditionId,'Retain the exact original preview selection.');
  need(Array.isArray(r.exchanges)&&r.exchanges.length<=200,'Retain the bounded complete original request exchanges.');
  if(r.attempts!==undefined){
   need(Array.isArray(r.attempts)&&r.attempts.length<=200,'Retain the bounded original proxy-attempt history.');
   const attempts=new Set();for(const a of r.attempts){need(object(a)&&id(a.id)&&!attempts.has(a.id)&&['mutation','operation-read'].includes(a.kind)&&hash(a.bodySha256)&&['DISPATCHING','UNKNOWN','UNSENT','UNRECORDED','RESPONDED'].includes(a.state)&&text(a.at,100),'Retain the complete original proxy attempt.');attempts.add(a.id);
    const body=a.kind==='mutation'?r.body:{expectedVersion:r.body.expectedVersion,connectionId:r.body.connectionId,expectedWorkspaceId:r.body.expectedWorkspaceId,expectedConnectionSha256:r.body.expectedConnectionSha256,requestId:r.id};
    need(a.bodySha256===intakeDigest(body),'A retained original proxy attempt has a different complete request.');
    if(['UNSENT','UNRECORDED','RESPONDED'].includes(a.state))need(object(a.response),'Retain the actual attempt response.');
   }
  }
  if(r.state!=='PREPARED')need(object(r.response),'Retain the actual original operation response before classifying its outcome.');
 }
 for(const p of v.profiles)need(object(p)&&object(p.value)&&text(p.sourceId,200)&&text(p.at,100),'Retain original source profile observations.');
 for(const p of v.previews)need(object(p)&&object(p.edition)&&hash(p.basisSha256)&&object(p.basis)&&p.basisSha256===intakeDigest(p.basis)&&requests.has(p.requestId),'Retain the source-bound native preview and original request.');
 for(const b of v.bundles){need(object(b)&&id(b.id)&&object(b.selection)&&text(b.at,100),'Retain the exact complete bundle capture.');supplierFileBytes(b.file,128*1024*1024);need(object(b.identity)&&object(b.request)&&object(b.connection),'Retain the frozen capture request, identity and configured workspace.');need(b.file.sha256===b.sha256,'The frozen complete bundle identity differs.');
  need(b.identity.workspaceId===b.connection.workspaceId&&b.identity.catalogId===b.selection.catalogId&&b.identity.revision===b.selection.expectedCatalogRevision&&b.identity.activeEditionId===b.selection.expectedActiveEditionId&&b.identity.tenantId===b.selection.expectedTenantId&&b.identity.mappingSha256===b.selection.expectedMappingSha256,'The frozen complete bundle has a different original catalogue selection.');
  for(const key of ['catalogId','expectedCatalogRevision','expectedActiveEditionId','expectedTenantId','expectedMappingSha256'])need(b.request[key]===b.selection[key],'The original capture request differs from its frozen selection.');}
 if(history)for(const h of v.history){
  need(object(h)&&text(h.label,300)&&text(h.at,100)&&h.sha256===intakeDigest(h.snapshot),'A retained complete supplier checkpoint changed.');
  validateSupplierIntake({...h.snapshot,history:[]},{maximumSource,history:false});
 }
 return v;
}
export function validateSupplierState(state,options={}){
 need(state.supplierIntakes===undefined||Array.isArray(state.supplierIntakes)&&state.supplierIntakes.length<=50,'Retain the complete supplier intake collection.');
 const seen=new Set(),requests=new Map();
 for(const v of state.supplierIntakes??[]){
  validateSupplierIntake(v,options);need(!seen.has(v.id),'Duplicate supplier working-copy ID.');seen.add(v.id);
  for(const r of v.requests){const p=requests.get(r.id);if(p)need(same(p.body,r.body)&&p.action===r.action&&same(p.scope,v.scope),'One native supplier request has conflicting complete input.');else requests.set(r.id,{body:r.body,action:r.action,scope:v.scope});}
 }
 need(state.selectedSupplierIntake===undefined||state.selectedSupplierIntake===null||seen.has(state.selectedSupplierIntake),'Keep the selected supplier intake.');return state;
}
export function checkpointSupplierIntake(intake,label,at){
 need(text(label,300)&&label.trim()&&intake.history.length<50,'Name a bounded complete supplier checkpoint.');
 const next=clone(intake),snapshot=clone(intake);delete snapshot.history;
 next.history.push({label,at,sha256:intakeDigest(snapshot),snapshot});next.updatedAt=at;return next;
}
export function supplierPreviewBasis(intake,catalog,source){
 return {catalogId:catalog.id,catalogRevision:catalog.revision,mappingSha256:catalog.mappingSha256,connection:clone(intake.connection),sourceId:source.id,sourceSha256:source.sha256,mode:intake.draft.mode,baseEditionId:intake.draft.baseEditionId||null,mappingText:intake.draft.mappingText};
}
export function mergeSupplierState(current,incoming,{fork=false,newId=()=>crypto.randomUUID()}={}){
 validateSupplierState(current);validateSupplierState(incoming);const values=clone(current.supplierIntakes??[]);
 for(const row of incoming.supplierIntakes??[]){const prior=values.find(v=>v.id===row.id);
  if(!prior)values.push(clone(row));else if(!same(prior,row)){
   need(fork,'The same supplier intake differs. Receive it as an explicit separate alternative.');
   const next=clone(row);next.id=newId();next.name=next.name.slice(0,280)+' · alternative';values.push(next);
  }
 }
 const result={...current,supplierIntakes:values};
 if(result.selectedSupplierIntake===undefined)result.selectedSupplierIntake=null;
 validateSupplierState(result);return result;
}

export function nativeSupplierRequestIdentity(action,request){
 if(action!=='upload')return clone(request);
 // Original catalogue workspace.upload normalizes metadata before journal reservation.
 // This mirrors only that retained request shape; native source/mapping validation remains authoritative.
 const original=request.format??{},kind=original.kind??'csv',format={kind};
 if(kind==='csv'||kind==='tsv'){
  format.delimiter=original.delimiter??(kind==='tsv'?'\t':',');format.hasHeader=original.hasHeader!==false;
  if(original.columns!==undefined){format.columns=clone(original.columns);if(original.hasHeader===undefined)format.hasHeader=false;}
 }else if(kind==='json')format.rowsPath=original.rowsPath??'';
 const provenance={};for(const key of ['url','revision','publisher','kind','note'])if(request.provenance?.[key]!==undefined)provenance[key]=clone(request.provenance[key]);
 return {requestId:request.requestId,name:request.name,format,bytes:request.bytes,sha256:request.sha256,provenance};
}
