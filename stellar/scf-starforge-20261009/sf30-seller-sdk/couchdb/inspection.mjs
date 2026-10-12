// MIT. Original document field inventory and revision comparison.
import { setImmediate } from 'node:timers/promises';
import { readCouchdbCapture } from './capture.mjs';
import { need, integer, identity, digest, sourceValue, pointer, ensureActive } from './common.mjs';
export function captureView(capture){
  const m=capture.manifest,c=m.connection;
  const connection={...c,selection:{...c.selection,...(c.selection.ids?{ids:c.selection.ids.slice(0,20),idCount:c.selection.ids.length,idsTruncated:c.selection.ids.length>20}:{})},
    attachments:{...c.attachments,...(c.attachments.names?{names:c.attachments.names.slice(0,20),nameCount:c.attachments.names.length,namesTruncated:c.attachments.names.length>20}:{})}};
  return {id:m.id,manifestSha256:capture.manifestSha256,sourceId:m.sourceId,engine:m.engine,connection,
    startedAt:m.startedAt,completedAt:m.completedAt,before:m.before,after:m.after,endSequence:m.endSequence,parent:m.parent??null,
    counts:m.counts,documents:m.documentsFile,files:m.files.length,totalBytes:m.files.reduce((n,f)=>n+f.bytes,capture.manifestBytes.length)};
}
export async function inspectCouchdbFields(capture,{documentIds,maxFields=10000,maxDepth=16,signal}={}){
  integer(maxFields,1,100000);integer(maxDepth,1,64);
  const selected=documentIds?new Set(documentIds):null;
  if(selected){const available=new Set(capture.documents.map(doc=>doc.id));need(selected.size===documentIds.length&&[...selected].every(id=>available.has(id)),'COUCHDB_DOCUMENT_OUTSIDE_CAPTURE');}
  const documents=capture.documents.filter(doc=>doc.status==='DOCUMENT'&&(!selected||selected.has(doc.id)));
  const fields=new Map();let scanned=0;
  for(const document of documents){
    ensureActive(signal);const read=await capture.readDocument(document.id),seen=new Set();
    function visit(path,depth){
      const original=sourceValue(read.parsed,path);if(!original.present)return;
      let field=fields.get(path);
      if(!field){need(fields.size<maxFields,'COUCHDB_FIELD_INVENTORY_LIMIT','Select specific documents or increase maxFields to inspect this complete field inventory.');field={pointer:path,documents:0,kinds:{},examples:[]};fields.set(path,field);}
      if(!seen.has(path)){field.documents++;seen.add(path);}field.kinds[original.kind]=(field.kinds[original.kind]??0)+1;
      if(field.examples.length<3&&!field.examples.some(v=>v.kind===original.kind&&v.json===original.text)){
        field.examples.push({kind:original.kind,json:original.text.slice(0,1024),truncated:original.text.length>1024,documentId:document.id,revision:document.revision});
      }
      if(original.kind==='object'&&depth<maxDepth)for(const key of Object.keys(original.value))visit(pointer(path,key),depth+1);
      else if(original.kind==='object'&&Object.keys(original.value).length)field.childrenOutsideDepth=true;
    }
    visit('',0);scanned++;if(scanned%100===0)await setImmediate();
  }
  return {schema:'stellar-forge.couchdb-field-inventory.v1',captureId:capture.manifest.id,manifestSha256:capture.manifestSha256,
    selectedDocuments:documents.length,documentsScanned:scanned,complete:true,arrayEncoding:'Original arrays are complete JSON values.',
    fields:[...fields.values()].sort((a,b)=>a.pointer<b.pointer?-1:a.pointer>b.pointer?1:0).map(field=>({...field,missing:scanned-field.documents}))};
}
function rowIdentity(document){
  if(!document)return null;
  return identity({id:document.id,status:document.status,rev:document.revision,leafRevisions:document.leafRevisions,conflicts:document.conflicts,
    deletedConflicts:document.deletedConflicts,attachments:document.attachments,error:document.error??null});
}
export async function compareCouchdbCaptures(left,right,{offset=0,limit=100,signal}={}){
  integer(offset,0,10000000);integer(limit,1,500);
  need(left.manifest.sourceId===right.manifest.sourceId,'COUCHDB_COMPARE_SOURCE_CHANGED','Select two editions of the same original logical source.');
  const before=new Map(left.documents.map(doc=>[doc.id,doc])),after=new Map(right.documents.map(doc=>[doc.id,doc]));
  const ids=[...new Set([...before.keys(),...after.keys()])].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
  const counts={added:0,removed:0,changed:0,unchanged:0},items=[];let changed=0,index=0;
  for(const id of ids){
    ensureActive(signal);const a=before.get(id),b=after.get(id);let kind,oldBody=null,newBody=null;
    if(!a)kind='added';else if(!b)kind='removed';else{
      let equal=rowIdentity(a)===rowIdentity(b);
      if(a.status==='DOCUMENT'&&b.status==='DOCUMENT'){
        oldBody=digest((await left.readDocument(id)).raw);newBody=digest((await right.readDocument(id)).raw);equal&&=oldBody===newBody;
      }
      kind=equal?'unchanged':'changed';
    }
    counts[kind]++;
    if(kind!=='unchanged'){
      if(changed>=offset&&items.length<limit)items.push({id,kind,before:a?{status:a.status,revision:a.revision,bodySha256:oldBody,conflicts:a.conflicts,leafRevisions:a.leafRevisions}:null,
        after:b?{status:b.status,revision:b.revision,bodySha256:newBody,conflicts:b.conflicts,leafRevisions:b.leafRevisions}:null});
      changed++;
    }
    if(++index%100===0)await setImmediate();
  }
  return {schema:'stellar-forge.couchdb-capture-comparison.v1',sourceId:left.manifest.sourceId,
    left:{id:left.manifest.id,sha256:left.manifestSha256,endSequence:left.manifest.endSequence},
    right:{id:right.manifest.id,sha256:right.manifestSha256,endSequence:right.manifest.endSequence},
    counts,offset,limit,totalChanges:changed,nextOffset:offset+items.length<changed?offset+items.length:null,items};
}
