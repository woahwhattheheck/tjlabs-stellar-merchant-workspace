// MIT. Native _all_docs/_changes capture, original revision attachments and receiving.
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { validateConnection, sourceIdentity, databaseURL, documentRoute } from './declaration.mjs';
import { readCouchdbStep, nativeRequest, decodeResponse, MAX_EXCHANGE } from './transport.mjs';
import { SCHEMA, HASH, UUID, MAX_BODY, object, need, integer, text, identity, digest, bytes, parseOriginal, sourceValue, originalBytes, originalCounter, sequence, sameSequence, checkSequence, privateDirectory, acquireWorkspace, retain, retainJSON, readPrivate, readJson, exists, verifyFile, copyFileRecord, listFiles, stamp, ensureActive, pointer } from './common.mjs';
const DOCUMENTS='documents.ndjson';
const REVISION_MAX=4096;
function stringValue(parsed,path,{optional=false,max=4096}={}) {
  const value=sourceValue(parsed,path);
  if(optional&&!value.present)return null;
  need(value.kind==='string'&&value.value.length<=max&&value.value.isWellFormed()&&!value.value.includes('\0'),'COUCHDB_NATIVE_TEXT_INVALID');
  return value.value;
}
function boolValue(parsed,path){const value=sourceValue(parsed,path);need(!value.present||value.kind==='boolean','COUCHDB_NATIVE_BOOLEAN_INVALID');return value.present&&value.value;}
function revisions(parsed,path) {
  const value=sourceValue(parsed,path);if(!value.present)return [];
  need(value.kind==='array','COUCHDB_NATIVE_REVISIONS_INVALID');
  return value.value.map((_,index)=>{const revision=stringValue(parsed,path+'/'+index,{max:REVISION_MAX});need(revision.length,'COUCHDB_NATIVE_REVISION_INVALID');return revision;});
}
function documentFromRow(parsed,rowPointer,mode,origin) {
  const row=sourceValue(parsed,rowPointer);need(row.kind==='object','COUCHDB_NATIVE_ROW_INVALID');
  const id=stringValue(parsed,rowPointer+(mode==='ids'?'/key':'/id'));
  need(id.length,'COUCHDB_NATIVE_DOCUMENT_ID_INVALID');
  const rowId=stringValue(parsed,rowPointer+'/id',{optional:true});
  need(rowId===null||rowId===id,'COUCHDB_NATIVE_DOCUMENT_ID_CHANGED');
  const error=stringValue(parsed,rowPointer+'/error',{optional:true});
  const docPointer=rowPointer+'/doc',doc=sourceValue(parsed,docPointer);
  need(!doc.present||doc.kind==='object'||doc.kind==='null','COUCHDB_NATIVE_DOCUMENT_INVALID');
  const hasDocument=doc.kind==='object';
  if(hasDocument)need(stringValue(parsed,docPointer+'/_id')===id,'COUCHDB_NATIVE_DOCUMENT_ID_CHANGED');
  const deleted=boolValue(parsed,rowPointer+'/deleted')||boolValue(parsed,rowPointer+'/value/deleted')||(hasDocument&&boolValue(parsed,docPointer+'/_deleted'));
  const revision=hasDocument?stringValue(parsed,docPointer+'/_rev',{max:REVISION_MAX}):stringValue(parsed,rowPointer+'/value/rev',{optional:true,max:REVISION_MAX});
  const conflicts=hasDocument?revisions(parsed,docPointer+'/_conflicts'):[],deletedConflicts=hasDocument?revisions(parsed,docPointer+'/_deleted_conflicts'):[];
  let leaves=[];
  if(mode==='changes'){
    const changes=sourceValue(parsed,rowPointer+'/changes');need(changes.kind==='array'&&changes.value.length,'COUCHDB_NATIVE_REVISIONS_INVALID');
    leaves=changes.value.map((_,index)=>stringValue(parsed,rowPointer+'/changes/'+index+'/rev',{max:REVISION_MAX}));
    sequence(parsed,rowPointer+'/seq');
  }else leaves=[...(revision?[revision]:[]),...conflicts,...deletedConflicts];
  need(error||deleted||hasDocument,'COUCHDB_NATIVE_DOCUMENT_BODY_MISSING');
  need(!hasDocument||revision?.length,'COUCHDB_NATIVE_REVISION_INVALID');
  const status=error?'MISSING':deleted?'DELETED':'DOCUMENT';
  const attachments=[];
  if(hasDocument){
    const nativeAttachments=sourceValue(parsed,docPointer+'/_attachments');
    need(!nativeAttachments.present||nativeAttachments.kind==='object','COUCHDB_NATIVE_ATTACHMENTS_INVALID');
    if(nativeAttachments.present)for(const name of Object.keys(nativeAttachments.value)){
      need(name.length&&name.isWellFormed()&&!name.includes('\0'),'COUCHDB_NATIVE_ATTACHMENT_NAME_INVALID');
      const location=pointer(docPointer+'/_attachments',name),stub=sourceValue(parsed,location);
      need(stub.kind==='object','COUCHDB_NATIVE_ATTACHMENT_STUB_INVALID');
      const length=sourceValue(parsed,location+'/length');
      attachments.push({name,stubPointer:location,length:length.present?originalCounter(parsed,location+'/length'):null,
        contentType:stringValue(parsed,location+'/content_type',{optional:true,max:8192}),digest:stringValue(parsed,location+'/digest',{optional:true,max:8192}),encoding:stringValue(parsed,location+'/encoding',{optional:true,max:128})});
    }
  }
  return {id,revision,status,conflicts,deletedConflicts,leafRevisions:[...new Set(leaves)],error,
    ...(mode==='changes'?{changeSequence:sequence(parsed,rowPointer+'/seq')} : {}),
    source:{...origin,rowPointer,documentPointer:hasDocument?docPointer:null},attachments};
}
function initialCursor(connection){
  return connection.selection.kind==='ids'?{offset:0}:connection.selection.kind==='range'?{anchor:null}:{since:connection.selection.since};
}
function pageRequest(connection,cursor){
  const mode=connection.selection.kind,url=new URL(databaseURL(connection,mode==='changes'?'_changes':'_all_docs'));
  url.searchParams.set('include_docs','true');url.searchParams.set('conflicts','true');url.searchParams.set('attachments','false');
  url.searchParams.set('att_encoding_info','true');
  if(mode==='changes'){
    url.searchParams.set('feed','normal');url.searchParams.set('style','all_docs');url.searchParams.set('since',cursor.since.query);url.searchParams.set('limit',String(connection.limits.pageSize));
    if(connection.selection.ids){url.searchParams.set('filter','_doc_ids');return {method:'POST',url:url.href,body:JSON.stringify({doc_ids:connection.selection.ids})};}
    return {method:'GET',url:url.href};
  }
  url.searchParams.set('update_seq','true');
  if(mode==='ids'){
    const keys=connection.selection.ids.slice(cursor.offset,cursor.offset+connection.limits.pageSize);
    return {method:'POST',url:url.href,body:JSON.stringify({keys})};
  }
  url.searchParams.set('limit',String(connection.limits.pageSize+(cursor.anchor===null?0:1)));
  const start=cursor.anchor===null?connection.selection.startKey:cursor.anchor;
  if(start!==undefined)url.searchParams.set('startkey',JSON.stringify(start));
  if(connection.selection.endKey!==undefined)url.searchParams.set('endkey',JSON.stringify(connection.selection.endKey));
  url.searchParams.set('inclusive_end',String(connection.selection.inclusiveEnd));
  return {method:'GET',url:url.href};
}
function parsePage(connection,raw,cursor,origin){
  const parsed=parseOriginal(raw),mode=connection.selection.kind,location=mode==='changes'?'/results':'/rows',rows=sourceValue(parsed,location);
  need(rows.kind==='array','COUCHDB_NATIVE_ROWS_MISSING');
  const requested=connection.limits.pageSize+(mode==='range'&&cursor.anchor!==null?1:0);
  need(rows.value.length<=requested,'COUCHDB_NATIVE_PAGE_LIMIT_CHANGED');
  let documents=rows.value.map((_,index)=>documentFromRow(parsed,location+'/'+index,mode,origin)),next,complete=false;
  if(mode==='ids'){
    const keys=connection.selection.ids.slice(cursor.offset,cursor.offset+connection.limits.pageSize);
    need(documents.length===keys.length&&documents.every((doc,index)=>doc.id===keys[index]),'COUCHDB_NATIVE_SELECTED_IDS_CHANGED');
    next={offset:cursor.offset+keys.length};complete=next.offset===connection.selection.ids.length;
  }else if(mode==='range'){
    for(let index=0;index<documents.length;index++){
      const id=documents[index].id;
      need(index===0||Buffer.compare(Buffer.from(documents[index-1].id),Buffer.from(id))<0,'COUCHDB_NATIVE_ID_ORDER_CHANGED');
      const start=cursor.anchor??connection.selection.startKey;
      if(start!==undefined)need(Buffer.compare(Buffer.from(id),Buffer.from(start))>=0,'COUCHDB_NATIVE_RANGE_CHANGED');
      if(connection.selection.endKey!==undefined){const order=Buffer.compare(Buffer.from(id),Buffer.from(connection.selection.endKey));need(order<0||order===0&&connection.selection.inclusiveEnd,'COUCHDB_NATIVE_RANGE_CHANGED');}
    }
    if(cursor.anchor!==null&&documents[0]?.id===cursor.anchor)documents=documents.slice(1);
    complete=rows.value.length<requested;
    next={anchor:documents.at(-1)?.id??cursor.anchor};
    need(complete||next.anchor!==cursor.anchor,'COUCHDB_NATIVE_RANGE_DID_NOT_ADVANCE');
  }else{
    if(connection.selection.ids){const selected=new Set(connection.selection.ids);need(documents.every(doc=>selected.has(doc.id)),'COUCHDB_NATIVE_SELECTED_IDS_CHANGED');}
    const since=sequence(parsed,'/last_seq'),pending=sourceValue(parsed,'/pending');
    next={since};
    complete=pending.present?originalCounter(parsed,'/pending')===0:documents.length<requested;
    need(complete||!sameSequence(since,cursor.since),'COUCHDB_NATIVE_SEQUENCE_DID_NOT_ADVANCE');
  }
  return {documents,next,complete,rows:rows.value.length,...(sourceValue(parsed,'/update_seq').present?{updateSequence:sequence(parsed,'/update_seq')}:{}),...(mode==='changes'?{lastSequence:sequence(parsed,'/last_seq')}: {})};
}
function serverInfo(raw){
  const p=parseOriginal(raw);
  need(sourceValue(p,'').kind==='object','COUCHDB_NATIVE_SERVER_INVALID');
  const couchdb=stringValue(p,'/couchdb'),version=stringValue(p,'/version',{max:256});
  need(couchdb.length&&version.length,'COUCHDB_NATIVE_SERVER_INVALID');
  return {couchdb,version,vendor:sourceValue(p,'/vendor').present?sourceValue(p,'/vendor').text:null,uuid:stringValue(p,'/uuid',{optional:true})};
}
function databaseInfo(connection,raw){
  const p=parseOriginal(raw),name=stringValue(p,'/db_name');
  need(name===connection.database,'COUCHDB_NATIVE_DATABASE_CHANGED');
  return {name,updateSequence:sequence(p,'/update_seq'),uuid:stringValue(p,'/uuid',{optional:true}),instanceStartTime:stringValue(p,'/instance_start_time',{optional:true}),docCount:sourceValue(p,'/doc_count').present?originalCounter(p,'/doc_count'):null,deletedCount:sourceValue(p,'/doc_del_count').present?originalCounter(p,'/doc_del_count'):null};
}
function sortedDocuments(map){return [...map.values()].sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)));}
function shiftedDocument(document,prefix){
  return {...document,source:{...document.source,file:{...document.source.file,path:prefix+document.source.file.path}}};
}
function attachmentSelections(connection,documents){
  const selected=[],missing=[];
  if(connection.attachments.mode==='none')return {selected,missing};
  const requested=new Map((connection.attachments.names??[]).map(row=>[identity(row),row]));
  for(const doc of documents){
    if(doc.status!=='DOCUMENT')continue;
    for(const stub of doc.attachments){
      const key=identity({documentId:doc.id,name:stub.name});
      if(connection.attachments.mode==='all'||requested.has(key)){selected.push({documentId:doc.id,revision:doc.revision,...stub,documentSource:doc.source});requested.delete(key);}
    }
  }
  if(connection.attachments.mode==='names')for(const row of requested.values())missing.push({...row,status:'ABSENT_FROM_SELECTED_REVISION'});
  return {selected,missing};
}
const inheritedIndexes=new WeakMap();
function inheritedAttachment(base,selected){
  if(!base)return null;
  let index=inheritedIndexes.get(base);
  if(!index){
    index={documents:new Map(base.documents.map(doc=>[doc.id,{revision:doc.revision,stubs:new Map(doc.attachments.map(stub=>[stub.name,stub]))}])),attachments:new Map(base.manifest.attachments.map(item=>[identity({documentId:item.documentId,revision:item.revision,name:item.name}),item]))};
    inheritedIndexes.set(base,index);
  }
  const document=index.documents.get(selected.documentId);
  const stub=document?.revision===selected.revision?document.stubs.get(selected.name):null;
  if(!stub||['name','length','contentType','digest','encoding'].some(key=>stub[key]!==selected[key]))return null;
  const retained=index.attachments.get(identity({documentId:selected.documentId,revision:selected.revision,name:selected.name}));
  return retained?.status==='RETAINED'?retained:null;
}
function shiftedRead(read,prefix){return {...read,file:{...read.file,path:prefix+read.file.path}};}
function attachmentRequest(connection,selected){
  const url=new URL(databaseURL(connection,documentRoute(selected.documentId)+'/'+encodeURIComponent(selected.name)));
  url.searchParams.set('rev',selected.revision);
  return {method:'GET',url:url.href,maximum:connection.limits.maxAttachmentBytes};
}
function validateAttachment(selected,raw,meta){
  if(meta.status===404){const p=parseOriginal(raw);need(sourceValue(p,'/error').kind==='string','COUCHDB_NATIVE_ATTACHMENT_ERROR_INVALID');return {status:'REVISION_ATTACHMENT_NOT_FOUND',bytes:0,sha256:null};}
  if(selected.length!==null)need(raw.length===selected.length,'COUCHDB_ATTACHMENT_LENGTH_CHANGED');
  if(!selected.encoding&&!meta.headers['content-encoding']&&selected.digest?.startsWith('md5-'))need(createHash('md5').update(raw).digest('base64')===selected.digest.slice(4),'COUCHDB_ATTACHMENT_DIGEST_CHANGED');
  return {status:'RETAINED',bytes:raw.length,sha256:digest(raw),contentType:meta.headers['content-type']??selected.contentType??'application/octet-stream'};
}
function countsFor(documents,attachments,missing,pages,before,after){
  return {documents:documents.length,activeDocuments:documents.filter(d=>d.status==='DOCUMENT').length,deletedDocuments:documents.filter(d=>d.status==='DELETED').length,missingDocuments:documents.filter(d=>d.status==='MISSING').length,
    conflictDocuments:documents.filter(d=>d.conflicts.length||d.deletedConflicts.length||d.leafRevisions.length>1).length,
    retainedAttachments:attachments.filter(a=>a.status==='RETAINED').length,missingAttachments:missing.length+attachments.filter(a=>a.status!=='RETAINED').length,
    pages:pages.length,nativeRows:pages.reduce((sum,page)=>sum+page.rows,0),concurrentChanges:!sameSequence(before.updateSequence,after.updateSequence)};
}
async function readBoundResponse(root,record,connection,supplied){
  need(object(record)&&record.schema==='stellar-forge.couchdb-accepted-read.v1','COUCHDB_SOURCE_READ_INVALID');
  const raw=await verifyFile(root,record.file,MAX_EXCHANGE),decoded=decodeResponse(raw),request=nativeRequest(connection,supplied);
  need(decoded.meta.requestSha256===identity(request)&&record.requestSha256===identity(request)&&record.status===decoded.meta.status&&record.receivedAt===decoded.meta.receivedAt,'COUCHDB_SOURCE_READ_BINDING_CHANGED');
  need(record.body?.offset===decoded.offset&&record.body?.bytes===decoded.body.length&&record.body?.sha256===digest(decoded.body),'COUCHDB_SOURCE_BODY_BINDING_CHANGED');
  return decoded;
}
export async function collectCouchdbCapture({directory,connection:input,id,baseCaptureFile=null,baseCaptureSha256=null,environment=process.env,signal,onProgress}={}) {
  const root=resolve(directory),connection=validateConnection(input);
  need(UUID.test(id??''),'COUCHDB_CAPTURE_ID_REQUIRED');need(process.platform==='linux','COUCHDB_LINUX_RECEIVER_REQUIRED');
  const requested={schema:'stellar-forge.couchdb-capture-request.v1',id,connection,baseCaptureSha256};
  const requestBytes=bytes({request:requested});
  need(requestBytes.length<=MAX_BODY&&requestBytes.length<=connection.limits.maxTotalBytes,'COUCHDB_CAPTURE_REQUEST_TOO_LARGE','The complete native selection exceeds its retained request limit.',413);
  await privateDirectory(root,true);const release=await acquireWorkspace(root);
  try{
    const requestPath=join(root,'capture-request.json'),prior=await exists(requestPath)?await readJson(requestPath,MAX_BODY):null;
    let base=null;
    if(baseCaptureFile){need(HASH.test(baseCaptureSha256??''),'COUCHDB_BASE_CAPTURE_HASH_REQUIRED');base=await readCouchdbCapture(baseCaptureFile,baseCaptureSha256);}
    else if(await exists(join(root,'parent','capture.json')))base=await readCouchdbCapture(join(root,'parent','capture.json'),baseCaptureSha256);
    need(!baseCaptureSha256||base,'COUCHDB_BASE_CAPTURE_REQUIRED');
    if(base){need(connection.selection.kind==='changes'&&base.manifest.sourceId===sourceIdentity(connection)&&sameSequence(connection.selection.since,base.manifest.endSequence),'COUCHDB_BASE_SEQUENCE_CHANGED','An incremental feed must start at the exact completed original capture sequence.');}
    else if(connection.selection.kind==='changes')need(sameSequence(connection.selection.since,{kind:'number',json:'0',query:'0'}),'COUCHDB_BASE_CAPTURE_REQUIRED','A complete initial changes capture starts at zero; later sequences require the original complete base capture.');
    if(prior)need(identity(prior.request)===identity(requested),'COUCHDB_CAPTURE_REQUEST_CHANGED','Resume this capture with its original selection and limits.',409);
    else await retain(requestPath,requestBytes);
    if(await exists(join(root,'capture.json')))return readCouchdbCapture(join(root,'capture.json'));
    if(base){
      if(!(await exists(join(root,'parent','capture.json'))))await cloneCouchdbCapture(base,join(root,'parent'));
      base=await readCouchdbCapture(join(root,'parent','capture.json'),baseCaptureSha256);
    }
    const nativeOptions={environment,signal,session:{}};
    const reads={},pages=[],wins=new Map((base?.documents??[]).map(doc=>[doc.id,shiftedDocument(doc,'parent/')]));
    const step=async(label,req,validate,options={})=>readCouchdbStep(root,connection,label,req,validate,{...nativeOptions,...options});
    const server=await step('server',{method:'GET',url:connection.baseUrl+'/'},serverInfo);reads.server=server.record;
    const before=await step('before',{method:'GET',url:databaseURL(connection)},raw=>databaseInfo(connection,raw));reads.before=before.record;
    let cursor=initialCursor(connection),complete=false,retainedBytes=base?base.manifest.files.reduce((n,f)=>n+f.bytes,base.manifestBytes.length):0;
    for(let index=0;!complete;index++){
      ensureActive(signal);need(index<connection.limits.maxPages,'COUCHDB_CAPTURE_PAGE_LIMIT','The original selection exceeds its page limit. Its accepted pages remain available.',413);
      const label='page-'+String(index).padStart(8,'0'),req=pageRequest(connection,cursor);
      const response=await step(label,req,raw=>parsePage(connection,raw,cursor,{file:null,bodySha256:digest(raw)}));
      const page=parsePage(connection,response.body,cursor,{file:response.record.file,bodySha256:response.record.body.sha256});
      for(const document of page.documents)wins.set(document.id,document);
      need(wins.size<=connection.limits.maxDocuments,'COUCHDB_CAPTURE_DOCUMENT_LIMIT','The original selection exceeds its document limit.',413);
      retainedBytes+=response.record.file.bytes;
      need(retainedBytes<=connection.limits.maxTotalBytes,'COUCHDB_CAPTURE_BYTE_LIMIT','The complete native capture exceeds its retained byte limit.',413);
      pages.push({label,cursor,read:response.record,rows:page.rows,documents:page.documents.length,next:page.next,complete:page.complete,...(page.updateSequence?{updateSequence:page.updateSequence}:{}),...(page.lastSequence?{lastSequence:page.lastSequence}:{})});
      cursor=page.next;complete=page.complete;
      await onProgress?.({id,phase:'CAPTURING',pages:pages.length,documents:wins.size,retainedBytes});
    }
    const documents=sortedDocuments(wins),selection=attachmentSelections(connection,documents),attachments=[];
    for(const selected of selection.selected){
      ensureActive(signal);
      const inherited=inheritedAttachment(base,selected);
      if(inherited){
        const record=shiftedRead(inherited.read,'parent/'),response=decodeResponse(await verifyFile(root,record.file,MAX_EXCHANGE));
        attachments.push({...selected,...validateAttachment(selected,response.body,response.meta),read:record,inheritedFrom:base.manifestSha256});
        continue;
      }
      const label='attachment-'+identity({documentId:selected.documentId,revision:selected.revision,name:selected.name});
      const response=await step(label,attachmentRequest(connection,selected),(raw,meta)=>validateAttachment(selected,raw,meta),{allowedStatuses:[200,404]});
      const value=validateAttachment(selected,response.body,response.meta);
      attachments.push({...selected,...value,read:response.record});retainedBytes+=response.record.file.bytes;
      need(retainedBytes<=connection.limits.maxTotalBytes,'COUCHDB_CAPTURE_BYTE_LIMIT','The complete native capture exceeds its retained byte limit.',413);
      await onProgress?.({id,phase:'ATTACHMENTS',documents:documents.length,attachments:attachments.length,totalAttachments:selection.selected.length,retainedBytes});
    }
    const after=await step('after',{method:'GET',url:databaseURL(connection)},raw=>databaseInfo(connection,raw));reads.after=after.record;
    need(!before.value.uuid||!after.value.uuid||before.value.uuid===after.value.uuid,'COUCHDB_DATABASE_REPLACED');
    need(!before.value.instanceStartTime||!after.value.instanceStartTime||before.value.instanceStartTime===after.value.instanceStartTime,'COUCHDB_DATABASE_REPLACED');
    const docBytes=Buffer.from(documents.map(doc=>JSON.stringify(doc)).join('\n')+(documents.length?'\n':''));
    need(docBytes.length<=MAX_BODY,'COUCHDB_DOCUMENT_INDEX_TOO_LARGE','The original document index exceeds its retained receiving limit.',413);
    await retain(join(root,DOCUMENTS),docBytes);
    const files=await listFiles(root,{exclude:['capture.json']});
    need(files.reduce((total,file)=>total+file.bytes,0)<=connection.limits.maxTotalBytes,'COUCHDB_CAPTURE_BYTE_LIMIT','The complete retained source and its native request records exceed the selected byte limit.',413);
    const manifest={schema:SCHEMA,id,sourceId:sourceIdentity(connection),startedAt:server.meta.startedAt,completedAt:after.meta.receivedAt,connection,readOnly:true,
      engine:server.value,reads,before:before.value,after:after.value,endSequence:connection.selection.kind==='changes'?cursor.since:after.value.updateSequence,
      ...(base?{parent:{file:'parent/capture.json',sha256:base.manifestSha256,id:base.manifest.id,endSequence:base.manifest.endSequence}}:{}),
      pages,documentsFile:{path:DOCUMENTS,bytes:docBytes.length,sha256:digest(docBytes)},attachments,missingAttachments:selection.missing,
      counts:countsFor(documents,attachments,selection.missing,pages,before.value,after.value),files,
      consistency:'Native paginated reads retain each returned winning revision and reported leaf/conflict metadata. Sequence tokens are original opaque JSON. This capture is not a database transaction.'};
    const manifestBytes=bytes(manifest);
    need(manifestBytes.length<=MAX_BODY&&files.reduce((total,file)=>total+file.bytes,manifestBytes.length)<=connection.limits.maxTotalBytes,'COUCHDB_CAPTURE_BYTE_LIMIT','The complete source manifest and its native files exceed the selected byte limit.',413);
    await retain(join(root,'capture.json'),manifestBytes);
    return readCouchdbCapture(join(root,'capture.json'));
  }finally{await release();}
}
export async function readCouchdbCapture(filename,expectedSha256=null,{depth=0}={}) {
  need(depth<64,'COUCHDB_CAPTURE_ANCESTRY_LIMIT');
  const file=resolve(filename),root=dirname(file);await privateDirectory(root);
  const raw=await readPrivate(file,MAX_BODY),manifestSha256=digest(raw);
  if(expectedSha256!==null)need(HASH.test(expectedSha256)&&manifestSha256===expectedSha256,'COUCHDB_CAPTURE_HASH_CHANGED');
  let manifest;try{manifest=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));}catch{need(false,'COUCHDB_CAPTURE_JSON_INVALID');}
  need(manifest?.schema===SCHEMA&&UUID.test(manifest.id??'')&&manifest.readOnly===true,'COUCHDB_CAPTURE_MANIFEST_INVALID');
  const connection=validateConnection(manifest.connection);
  need(manifest.sourceId===sourceIdentity(connection)&&Array.isArray(manifest.files)&&Array.isArray(manifest.pages)&&manifest.pages.length>0&&manifest.pages.length<=connection.limits.maxPages,'COUCHDB_CAPTURE_MANIFEST_INVALID');
  const fileMap=new Map();
  for(const record of manifest.files){need(!fileMap.has(record.path)&&record.path!=='capture.json','COUCHDB_CAPTURE_FILE_DUPLICATED');fileMap.set(record.path,record);await verifyFile(root,record,MAX_EXCHANGE);}
  function bound(record){const declared=fileMap.get(record?.path);need(declared&&identity(declared)===identity(record),'COUCHDB_CAPTURE_SOURCE_UNDECLARED');return record;}
  const requestBytes=await verifyFile(root,bound(fileMap.get('capture-request.json')),MAX_EXCHANGE),intent=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(requestBytes));
  need(identity(intent.request)===identity({schema:'stellar-forge.couchdb-capture-request.v1',id:manifest.id,connection,baseCaptureSha256:manifest.parent?.sha256??null}) ,'COUCHDB_CAPTURE_REQUEST_CHANGED');
  const fromRead=async(record,request)=>{bound(record?.file);return readBoundResponse(root,record,connection,request);};
  const server=await fromRead(manifest.reads?.server,{method:'GET',url:connection.baseUrl+'/'}),before=await fromRead(manifest.reads?.before,{method:'GET',url:databaseURL(connection)}),after=await fromRead(manifest.reads?.after,{method:'GET',url:databaseURL(connection)});
  need(server.meta.status===200&&before.meta.status===200&&after.meta.status===200,'COUCHDB_NATIVE_CAPTURE_READ_FAILED');
  need(server.meta.startedAt===manifest.startedAt,'COUCHDB_CAPTURE_START_CHANGED');
  const actualServer=serverInfo(server.body),actualBefore=databaseInfo(connection,before.body),actualAfter=databaseInfo(connection,after.body);
  need(identity(actualServer)===identity(manifest.engine)&&identity(actualBefore)===identity(manifest.before)&&identity(actualAfter)===identity(manifest.after)&&after.meta.receivedAt===manifest.completedAt,'COUCHDB_CAPTURE_OBSERVATION_CHANGED');
  let base=null;
  if(manifest.parent){
    need(manifest.parent.file==='parent/capture.json'&&HASH.test(manifest.parent.sha256??''),'COUCHDB_CAPTURE_PARENT_INVALID');
    const parentDescriptor=bound(fileMap.get(manifest.parent.file));need(parentDescriptor.sha256===manifest.parent.sha256,'COUCHDB_CAPTURE_PARENT_CHANGED');
    base=await readCouchdbCapture(join(root,'parent','capture.json'),manifest.parent.sha256,{depth:depth+1});
    need(connection.selection.kind==='changes'&&manifest.parent.id===base.manifest.id&&identity(manifest.parent.endSequence)===identity(base.manifest.endSequence)&&base.manifest.sourceId===manifest.sourceId&&sameSequence(connection.selection.since,base.manifest.endSequence),'COUCHDB_BASE_SEQUENCE_CHANGED');
  }else if(connection.selection.kind==='changes')need(sameSequence(connection.selection.since,{kind:'number',json:'0',query:'0'}),'COUCHDB_BASE_CAPTURE_REQUIRED');
  const wins=new Map((base?.documents??[]).map(doc=>[doc.id,shiftedDocument(doc,'parent/')]));
  let cursor=initialCursor(connection),complete=false;
  for(let index=0;index<manifest.pages.length;index++){
    need(!complete,'COUCHDB_CAPTURE_EXTRA_PAGE');
    const page=manifest.pages[index],label='page-'+String(index).padStart(8,'0');
    need(page.label===label&&identity(page.cursor)===identity(cursor),'COUCHDB_CAPTURE_CURSOR_CHANGED');
    const response=await fromRead(page.read,pageRequest(connection,cursor));need(response.meta.status===200,'COUCHDB_NATIVE_CAPTURE_READ_FAILED');
    const parsed=parsePage(connection,response.body,cursor,{file:page.read.file,bodySha256:page.read.body.sha256});
    const expected={label,cursor,read:page.read,rows:parsed.rows,documents:parsed.documents.length,next:parsed.next,complete:parsed.complete,...(parsed.updateSequence?{updateSequence:parsed.updateSequence}:{}),...(parsed.lastSequence?{lastSequence:parsed.lastSequence}:{})};
    need(identity(page)===identity(expected),'COUCHDB_CAPTURE_PAGE_CHANGED');
    for(const document of parsed.documents)wins.set(document.id,document);
    cursor=parsed.next;complete=parsed.complete;
  }
  need(complete&&wins.size<=connection.limits.maxDocuments,'COUCHDB_CAPTURE_INCOMPLETE');
  const documents=sortedDocuments(wins),docBytes=await verifyFile(root,bound(manifest.documentsFile),MAX_BODY);
  const actualDocBytes=Buffer.from(documents.map(doc=>JSON.stringify(doc)).join('\n')+(documents.length?'\n':''));
  need(docBytes.equals(actualDocBytes),'COUCHDB_CAPTURE_DOCUMENTS_CHANGED');
  const selected=attachmentSelections(connection,documents);
  need(Array.isArray(manifest.attachments)&&manifest.attachments.length===selected.selected.length&&identity(selected.missing)===identity(manifest.missingAttachments),'COUCHDB_CAPTURE_ATTACHMENT_SELECTION_CHANGED');
  for(let index=0;index<selected.selected.length;index++){
    const original=selected.selected[index],retained=manifest.attachments[index];
    let response,inherited=null;
    if(retained.inheritedFrom){
      inherited=inheritedAttachment(base,original);
      need(inherited&&retained.inheritedFrom===base.manifestSha256&&identity(retained.read)===identity(shiftedRead(inherited.read,'parent/')),'COUCHDB_CAPTURE_INHERITED_ATTACHMENT_CHANGED');
      bound(retained.read.file);
      response=await readBoundResponse(root,retained.read,base.manifest.connection,attachmentRequest(base.manifest.connection,original));
    }else response=await fromRead(retained.read,attachmentRequest(connection,original));
    need([200,404].includes(response.meta.status),'COUCHDB_CAPTURE_ATTACHMENT_READ_FAILED');
    const expected={...original,...validateAttachment(original,response.body,response.meta),read:retained.read,...(inherited?{inheritedFrom:base.manifestSha256}:{})};
    need(identity(expected)===identity(retained),'COUCHDB_CAPTURE_ATTACHMENT_CHANGED');
  }
  need(identity(countsFor(documents,manifest.attachments,selected.missing,manifest.pages,actualBefore,actualAfter))===identity(manifest.counts),'COUCHDB_CAPTURE_COUNTS_CHANGED');
  need(sameSequence(checkSequence(manifest.endSequence),connection.selection.kind==='changes'?cursor.since:actualAfter.updateSequence),'COUCHDB_CAPTURE_SEQUENCE_CHANGED');
  need(manifest.files.reduce((total,item)=>total+item.bytes,raw.length)<=connection.limits.maxTotalBytes,'COUCHDB_CAPTURE_BYTE_LIMIT');
  const documentMap=new Map(documents.map(doc=>[doc.id,doc]));let cached=null;
  async function readDocument(id){
    const document=documentMap.get(id);need(document,'COUCHDB_DOCUMENT_NOT_FOUND','Choose an original retained document ID.',404);
    if(document.source.documentPointer===null)return {document,raw:null,parsed:null};
    if(cached?.fileSha!==document.source.file.sha256){bound(document.source.file);const framed=await verifyFile(root,document.source.file,MAX_EXCHANGE),response=decodeResponse(framed);need(digest(response.body)===document.source.bodySha256,'COUCHDB_DOCUMENT_SOURCE_CHANGED');cached={fileSha:document.source.file.sha256,parsed:parseOriginal(response.body)};}
    const native=originalBytes(cached.parsed,document.source.documentPointer);
    return {document,raw:native,parsed:parseOriginal(native)};
  }
  async function readAttachment(documentId,name){
    const attachment=manifest.attachments.find(item=>item.documentId===documentId&&item.name===name);
    need(attachment?.status==='RETAINED','COUCHDB_ATTACHMENT_NOT_RETAINED','Choose an originally retained revision attachment.',404);
    const original=decodeResponse(await verifyFile(root,bound(attachment.read.file),MAX_EXCHANGE));
    need(original.body.length===attachment.bytes&&digest(original.body)===attachment.sha256,'COUCHDB_ATTACHMENT_BYTES_CHANGED');
    return {attachment,raw:original.body};
  }
  return {directory:root,manifestFile:file,manifest,manifestBytes:raw,manifestSha256,documents,readDocument,readAttachment};
}
export async function cloneCouchdbCapture(capture,directory){
  const source=typeof capture==='string'?await readCouchdbCapture(capture):capture;
  need(source?.manifest&&source?.manifestBytes&&HASH.test(source.manifestSha256??''),'COUCHDB_CAPTURE_REQUIRED');
  need(digest(source.manifestBytes)===source.manifestSha256&&identity(JSON.parse(source.manifestBytes.toString('utf8')))===identity(source.manifest),'COUCHDB_CAPTURE_SOURCE_CHANGED');
  const target=resolve(directory);need(target!==source.directory&&!target.startsWith(source.directory+'/')&&!source.directory.startsWith(target+'/'),'COUCHDB_CAPTURE_DIRECTORY_OVERLAP');
  await privateDirectory(target,true);
  for(const file of source.manifest.files)await copyFileRecord(source.directory,target,file);
  await retain(join(target,'capture.json'),source.manifestBytes);
  return {directory:target,file:join(target,'capture.json'),sha256:source.manifestSha256};
}
