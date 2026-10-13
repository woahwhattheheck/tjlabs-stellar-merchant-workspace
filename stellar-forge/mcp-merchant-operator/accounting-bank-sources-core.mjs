// MIT. Complete Bank source transformations through the original profile, collection and parser engines.
import {createHash} from 'node:crypto';
import {PROFILE_LIMITS,createProfileLibrary,validateProfileLibrary,saveProfile,receiveProfileLibrary,previewProfileApplication,applyProfileApplication}
 from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/public/source-profile-model.mjs';
import {COLLECTION_LIMITS,canonical,createCollection,appendFiles,updateItem,renameCollection,receiveCollection,sourceInputForItem}
 from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/public/source-collection-model.mjs';
import {readBankStatementSource} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/source.mjs';
import {sourcePreview,previewIdentity} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/domain.mjs';
import {BANK_SOURCE_MAX_BYTES,BANK_SOURCE_SCHEMA,hashBytes,jsonBytes,canonicalHash,clone,need,integer,validateBankSourceRequest} from './accounting-bank-sources-contract.mjs';
function parse(bytes,limit=BANK_SOURCE_MAX_BYTES){need(bytes.length<=limit,'The complete input exceeds its original byte limit.');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
function stableId(requestId,tag){const h=hashBytes(Buffer.from(requestId+'\0'+tag));return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
export async function runBankSourceTransform(request,inputBytes,createdAt){
 request=validateBankSourceRequest(request);need(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(createdAt)&&Number.isFinite(Date.parse(createdAt)),'Retain the original preparation timestamp.');
 const values=new Map();for(const pin of request.inputs){const bytes=inputBytes.get(pin.key);need(Buffer.isBuffer(bytes)&&bytes.length===pin.bytes&&hashBytes(bytes)===pin.sha256,'The retained complete input differs: '+pin.key,'INPUT_CHANGED');values.set(pin.key,bytes);}
 const p=request.parameters,files=new Map();let summary={},view=null;
 const keep=(name,value)=>{const bytes=Buffer.isBuffer(value)?value:jsonBytes(value);need(bytes.length<=BANK_SOURCE_MAX_BYTES,'A complete output exceeds the original transfer limit.');need(!files.has(name),'Retain each complete output once.');files.set(name,bytes);return value;};
 async function library(){
  const value=values.has('library')?await validateProfileLibrary(parse(values.get('library'),PROFILE_LIMITS.bytes)):createProfileLibrary({id:p.libraryId,workspaceId:request.workspaceId});
  need(value.workspaceId===request.workspaceId,'Receive the profile library into this original workspace before modifying it.','WORKSPACE');
  if(p.libraryId!==undefined)need(value.id===p.libraryId,'Select the exact original library ID.');return value;
 }
 async function collection(receiving=false){
  const value=parse(values.get('collection'));await receiveCollection(value);
  if(!receiving)need(value.workspaceId===request.workspaceId,'Receive this collection into the original workspace before working on it.','WORKSPACE');
  return clone(value);
 }
 if(request.kind==='collection_prepare'){
  let current=createCollection({id:p.collectionId,workspaceId:request.workspaceId,name:p.name});
  current=await appendFiles(current,p.files.map(f=>{const pin=request.inputs.find(x=>x.key===f.sourceKey);return{id:f.id,file:{name:pin.name,bytes:pin.bytes,sha256:pin.sha256,dataBase64:values.get(f.sourceKey).toString('base64')},mapping:f.mapping};}));
  for(const f of p.files)current=updateItem(current,f.id,{included:f.included,note:f.note});
  keep('collection.json',current);view={type:'collection',value:current};
 }else if(request.kind==='collection_receive'){
  const original=await collection(true),current=await receiveCollection(original,{workspaceId:request.workspaceId,id:p.collectionId});
  keep('collection.json',current);view={type:'collection',value:current};
 }else if(request.kind==='collection_edit'){
  let current=await collection();need(current.revision===p.expectedRevision,'The selected collection revision differs.','STALE');
  if(p.name!==undefined)current=renameCollection(current,p.name);
  for(const {id,...patch}of p.items)current=updateItem(current,id,patch);
  keep('collection.json',current);view={type:'collection',value:current};
 }else if(request.kind==='collection_inspect'){
  const current=await collection(),items=[];
  for(const item of current.items){
   const selected={id:item.id,file:{name:item.file.name,bytes:item.file.bytes,sha256:item.file.sha256},included:item.included,note:item.note,mapping:item.mapping};
   keep('original-'+item.id,Buffer.from(item.file.dataBase64,'base64'));
   if(!item.included){items.push({...selected,status:item.note.trim()?'EXCLUDED':'EXCLUSION_NOTE_REQUIRED'});continue;}
   let input,report,preview;
   try{input=sourceInputForItem(item);report=readBankStatementSource(input);preview={...sourcePreview(report),reviewSha256:previewIdentity(report,input)};}
   catch(error){items.push({...selected,status:'SOURCE_REVIEW',problem:{code:error.code||'SOURCE_ERROR',message:String(error.message),details:error.details||{}}});continue;}
   keep('source-'+item.id+'.json',input);keep('preview-'+item.id+'.json',preview);keep('report-'+item.id+'.json',report);
   items.push({...selected,status:'REVIEWED',preview});
  }
  const report={schema:'stellar-forge.bank-source-collection-review.v1',collectionId:current.id,workspaceId:current.workspaceId,revision:current.revision,complete:true,items};
  keep('review.json',report);view={type:'inspection',value:report};
 }else if(request.kind==='profile_save'){
  const current=await saveProfile(await library(),{...p,actor:request.actor,createdAt});
  keep('library.json',current);view={type:'library',value:current};
 }else if(request.kind==='profile_receive'){
  const current=await library(),incoming=await validateProfileLibrary(parse(values.get('incoming'),PROFILE_LIMITS.bytes));let n=0;
  const received=await receiveProfileLibrary(current,incoming,{expectedRevision:p.expectedRevision,makeId:()=>stableId(request.requestId,'received-profile-'+n++)});
  keep('library.json',received.library);summary={received:received.received,existing:received.existing};view={type:'library',value:received.library};
 }else if(request.kind==='profile_review'){
  const current=await collection(),lib=await library(),items=[];
  for(const itemId of p.itemIds){const item=current.items.find(x=>x.id===itemId);need(item,'A selected original is absent.');items.push({itemId,review:await previewProfileApplication(lib,{profileId:p.profileId,version:p.version,file:item.file,mapping:item.mapping})});}
  const review={schema:'stellar-forge.bank-source-profile-collection-review.v1',libraryId:lib.id,librarySha256:hashBytes(values.get('library')),collectionId:current.id,workspaceId:current.workspaceId,collectionRevision:current.revision,collectionSha256:hashBytes(values.get('collection')),items};
  review.sha256=canonicalHash(review);keep('review.json',review);view={type:'profile-review',value:review};
 }else if(request.kind==='profile_apply'){
  let current=await collection();const lib=await library(),review=parse(values.get('review')),material=clone(review);delete material.sha256;
  need(review.schema==='stellar-forge.bank-source-profile-collection-review.v1'&&Array.isArray(review.items)&&review.items.length>0&&review.items.length<=1000,'Use the complete original profile application review.');
  need(review.sha256===canonicalHash(material)&&review.libraryId===lib.id&&review.librarySha256===hashBytes(values.get('library'))&&review.collectionId===current.id&&review.workspaceId===current.workspaceId&&review.collectionRevision===current.revision&&review.collectionSha256===hashBytes(values.get('collection')),'The complete library, collection or reviewed selection changed.','REVIEW_CHANGED');
  const ids=new Set();for(const selected of review.items){need(!ids.has(selected.itemId),'Review each original once.');ids.add(selected.itemId);const item=current.items.find(x=>x.id===selected.itemId);need(item,'The selected original is missing.');const mapping=await applyProfileApplication(lib,selected.review,{file:item.file,mapping:item.mapping});current=updateItem(current,item.id,{mapping});}
  keep('collection.json',current);summary={reviewSha256:review.sha256,selectedOriginals:ids.size};view={type:'collection',value:current};
 }
 if(view.type==='collection')summary={...summary,collectionId:view.value.id,revision:view.value.revision,originals:view.value.items.length,originalBytes:view.value.items.reduce((n,x)=>n+x.file.bytes,0)};
 if(view.type==='library')summary={...summary,libraryId:view.value.id,revision:view.value.revision,profiles:view.value.profiles.length,versions:view.value.profiles.reduce((n,x)=>n+x.versions.length,0)};
 if(view.type==='inspection')summary={...summary,collectionId:view.value.collectionId,revision:view.value.revision,originals:view.value.items.length,reviewed:view.value.items.filter(x=>x.status==='REVIEWED').length,sourceReview:view.value.items.filter(x=>x.status==='SOURCE_REVIEW').length};
 if(view.type==='profile-review')summary={...summary,collectionId:view.value.collectionId,libraryId:view.value.libraryId,reviewSha256:view.value.sha256,selectedOriginals:view.value.items.length};
 return {files,summary,viewType:view.type};
}
export function bankSourceView(kind,value,args={}){
 const offset=integer(args.offset??0),limit=integer(args.limit??25,1,100);let rows,summary;
 if(kind==='report'){
  const section=args.section??'statements';let selected;
  if(['rows','pending','excluded'].includes(section)){selected=value.statements.find(s=>s.id===args.statementId);need(selected,'Select an original statement from this retained report.');}
  if(section==='rows')rows=selected.rows;
  else if(section==='pending')rows=selected.pendingRows;
  else if(section==='excluded')rows=selected.excludedRows??[];
  else if(section==='issues')rows=value.issues;
  else{need(section==='statements','Choose a complete original report view.');rows=value.statements.map(s=>({id:s.id,kind:s.kind,account:s.account,period:s.period,summary:s.summary,balances:s.balances,rows:s.rows.length,pendingRows:s.pendingRows.length,excludedRows:s.excludedRows?.length??0,issues:s.issues}));}
  summary={view:section,itemId:args.itemId,file:value.file,format:value.format,...(selected?{statementId:selected.id}:{})};
 }else if(kind==='library'){
  if(args.profileId){const p=value.profiles.find(x=>x.id===args.profileId);need(p,'Select an original profile.');rows=p.versions;summary={libraryId:value.id,workspaceId:value.workspaceId,revision:value.revision,profileId:p.id,origin:p.origin??null,view:'versions'};}
  else{rows=value.profiles.map(p=>({id:p.id,origin:p.origin??null,versions:p.versions.length,head:p.versions.at(-1)}));summary={libraryId:value.id,workspaceId:value.workspaceId,revision:value.revision,view:'profiles'};}
 }else if(kind==='collection'){rows=value.items.map(({file,preview,...item})=>({...item,file:{name:file.name,bytes:file.bytes,sha256:file.sha256},preview:preview?{reviewSha256:preview.reviewSha256??null}:null}));summary={collectionId:value.id,workspaceId:value.workspaceId,revision:value.revision,name:value.name,origin:value.origin??null,view:'originals'};}
 else if(kind==='inspection'){rows=value.items.map(({preview,...item})=>({...item,...(preview?{reviewSha256:preview.reviewSha256,statementCount:preview.statements.length,reportFile:'report-'+item.id+'.json',previewFile:'preview-'+item.id+'.json',sourceFile:'source-'+item.id+'.json'}:{})}));summary={collectionId:value.collectionId,workspaceId:value.workspaceId,revision:value.revision,view:'inspection'};}
 else{rows=value.items;summary={collectionId:value.collectionId,workspaceId:value.workspaceId,libraryId:value.libraryId,reviewSha256:value.sha256,view:'profile-review'};}
 if(args.itemId&&kind!=='report'){rows=rows.filter(x=>(x.id??x.itemId)===args.itemId);need(rows.length===1,'Select an original item in this complete output.');}
 const page={offset,limit,total:rows.length,items:[]};for(const row of rows.slice(offset,offset+limit)){if(jsonBytes({...summary,page:{...page,items:[...page.items,row]}}).length>4_000_000){need(page.items.length>0,'This single complete original row exceeds the 4 MB wire view. Download its exact original output file.','VIEW_SIZE');break;}page.items.push(row);}
 return{...summary,page};
}
