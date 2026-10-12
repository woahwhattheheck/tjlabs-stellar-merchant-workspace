// SPDX-License-Identifier: MIT
import { gzipSync, gunzipSync } from 'node:zlib';
import { LIMITS, SCHEMA, fail, sha, canonical, clone, identifier, integer, object, decodeBase64, digest, nativeOutputParts, safeName, mediaType } from './foundation.mjs';

const WORKSPACE='stellar-forge.a2a-portable-workspace.v1';
const RESULT='stellar-forge.a2a-result-edition.v1';
export function encodePacket(packet) {
  const raw=Buffer.from(canonical(packet));if(raw.length>LIMITS.packetBytes)fail('PACKET_LIMIT','The complete packet exceeds the portable limit.');
  const bytes=gzipSync(raw,{level:6,mtime:0});
  return{filename:packet.schema===RESULT?'a2a-result-'+packet.edition.id+'.json.gz':'a2a-workspace-'+packet.projectId+'-r'+packet.revision+'.json.gz',mediaType:'application/gzip',sha256:sha(bytes),bytes,uncompressedBytes:raw.length,manifest:packet};
}
export function decodePacket(input) {
  const bytes=Buffer.from(input);if(bytes.length>LIMITS.packetBytes)fail('PACKET_LIMIT');let raw;
  try{raw=bytes[0]===0x1f&&bytes[1]===0x8b?gunzipSync(bytes,{maxOutputLength:LIMITS.packetBytes}):bytes;}catch{fail('INVALID_PACKET','The complete gzip packet could not be decoded within its limit.');}
  let packet;try{packet=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{fail('INVALID_PACKET_JSON');}canonical(packet);object(packet);
  if(![WORKSPACE,RESULT].includes(packet.schema))fail('PACKET_SCHEMA');
  validateObjects(packet);if(packet.schema===WORKSPACE)validateHistory(packet);else validateResult(packet);
  return packet;
}
function validateObjects(packet){
  if(!Array.isArray(packet.objects)||packet.objects.length>100000)fail('PACKET_OBJECTS');
  const seen=new Set();let bytes=0;
  for(const file of packet.objects){
    object(file);digest(file.sha256);if(seen.has(file.sha256))fail('DUPLICATE_OBJECT');seen.add(file.sha256);
    const data=decodeBase64(file.contentBase64,LIMITS.packetBytes);integer(file.bytes,'object bytes',0,LIMITS.packetBytes);
    if(data.length!==file.bytes||sha(data)!==file.sha256)fail('OBJECT_IDENTITY');bytes+=data.length;if(bytes>LIMITS.packetBytes)fail('PACKET_LIMIT');
  }
  return seen;
}
function validateHistory(packet){
  identifier(packet.projectId);integer(packet.revision,'revision',1,1000000);
  if(!Array.isArray(packet.history)||packet.history.length!==packet.revision||!Array.isArray(packet.requests))fail('PACKET_HISTORY');
  const objects=new Map(packet.objects.map(x=>[x.sha256,x.bytes])),requestIds=new Set();let previous=null;
  for(let i=0;i<packet.history.length;i++){
    const record=packet.history[i],p=record.body;
    if(record.revision!==i+1||p?.id!==packet.projectId||p.schema!==SCHEMA||p.revision!==i+1||sha(canonical(p))!==record.sha256||record.event?.sha256!==record.sha256||record.event.previousSha256!==previous||record.event.revision!==i+1)fail('HISTORY_IDENTITY');
    for(const field of ['sources','cards','messages','observations','operations','artifactCaptures','reviews','editions','handoffs','publications'])if(!Array.isArray(p[field]))fail('HISTORY_FIELDS');
    if(!p.connection||typeof p.connectionId!=='string'||typeof p.originWorkspaceId!=='string'||typeof p.executionWorkspaceId!=='string')fail('HISTORY_FIELDS');
    if(!Array.isArray(p.sources))fail('HISTORY_SOURCES');for(const source of p.sources)if(!objects.has(source.sha256)||objects.get(source.sha256)!==source.bytes)fail('MISSING_SOURCE_OBJECT');
    previous=record.sha256;
  }
  if(packet.history.at(-1).body.operations.some(x=>['prepared','running'].includes(x.state)))fail('PACKET_ACTIVE_OPERATION','Receive only a closed original local capture.');
  for(const request of packet.requests){
    identifier(request.id);if(requestIds.has(request.id)||request.payload?.requestId!==request.id||request.payload.id&&request.payload.id!==packet.projectId||sha(canonical({action:request.action,payload:request.payload}))!==request.fingerprint)fail('REQUEST_IDENTITY');
    integer(request.revision,'request revision',1,packet.revision);requestIds.add(request.id);
  }
}
function validateCapturedOutputs(packet,objects) {
  const original=nativeOutputParts(packet.observation),files=packet.capture.files;
  if(!original.length||!Array.isArray(files)||files.length!==original.length)fail('RESULT_OUTPUT_COMPLETENESS','Every original output part must be retained exactly once.');
  const positions=new Map(original.map(item=>[canonical([item.artifactId,item.index]),item]));
  const seen=new Set(),httpEnds=new Set(),sourceIds=new Map();
  for(const source of packet.sources){
    identifier(source.id,'sourceId');if(sourceIds.has(source.id))fail('RESULT_SOURCE_IDENTITY');
    sourceIds.set(source.id,source);
  }
  const operation=packet.operations.find(item=>item.id===packet.capture.operationId);
  if(!operation||operation.state!=='complete'||!Array.isArray(operation.wire))fail('RESULT_CAPTURE_OPERATION');
  let total=0;
  for(const file of files){
    object(file,'captured file');integer(file.index,'part index',0,100000);
    const key=canonical([file.artifactId,file.index]),item=positions.get(key);
    if(!item||seen.has(key))fail('RESULT_OUTPUT_POSITION','An original output is missing, duplicated, or replaced by an extra part.');
    seen.add(key);
    const part=item.part,source=sourceIds.get(file.sourceId),stored=objects.get(file.sha256);
    if(!source||source.role!=='artifact'||source.operationId!==packet.capture.operationId||
       source.sha256!==file.sha256||source.bytes!==file.bytes||!stored||stored.bytes!==file.bytes)fail('RESULT_ARTIFACTS');
    const bytes=decodeBase64(stored.contentBase64,LIMITS.artifactBytes);
    if(file.name!==item.name||file.declaredFilename!==(part.filename??null)||
       file.declaredMediaType!==(part.mediaType??null)||file.url!==(part.url??null)||
       file.filename!==safeName(part.filename,(item.artifactId??'result')+'-'+item.index)||
       source.filename!==file.filename||source.mediaType!==file.mediaType)fail('RESULT_OUTPUT_METADATA');
    let literal=null;
    if(Object.hasOwn(part,'text'))literal=Buffer.from(part.text,'utf8');
    else if(Object.hasOwn(part,'raw'))literal=decodeBase64(part.raw,LIMITS.artifactBytes);
    else if(Object.hasOwn(part,'data'))literal=Buffer.from(canonical(part.data));
    else {
      // The URL remains the original declared source; its observed bytes are
      // bound to the completed HTTP capture, including the actual status/body.
      const proof=object(file.httpCapture,'URL HTTP capture'),wire=operation.wire;
      for(const field of ['requestIndex','responseIndex','endIndex'])integer(proof[field],field,0,wire.length-1);
      if(!(proof.requestIndex<proof.responseIndex&&proof.responseIndex<proof.endIndex)||httpEnds.has(proof.endIndex))fail('RESULT_URL_CAPTURE');
      httpEnds.add(proof.endIndex);
      const request=wire[proof.requestIndex],response=wire[proof.responseIndex],end=wire[proof.endIndex];
      let url;try{url=new URL(part.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)fail('RESULT_URL_CAPTURE');}catch{fail('RESULT_URL_CAPTURE');}
      if(request.phase!=='request'||request.method!=='GET'||request.url!==url.href||
         response.phase!=='response'||response.url!==url.href||response.status<200||response.status>=300||
         response.wireId!==request.wireId||end.phase!=='end'||end.wireId!==request.wireId||end.complete!==true||
         end.sha256!==file.sha256||end.bytes!==file.bytes||
         (response.headers?.['content-type']??null)!==file.observedMediaType)fail('RESULT_URL_CAPTURE');
      const bodySource=sourceIds.get(end.sourceId);
      if(!bodySource||bodySource.operationId!==packet.capture.operationId||bodySource.role!=='native-http-end'||
         bodySource.sha256!==file.sha256||bodySource.bytes!==file.bytes||
         wire.slice(proof.requestIndex+1,proof.endIndex).some(event=>['request','end','failure'].includes(event.phase)))fail('RESULT_URL_CAPTURE');
    }
    if(literal&&(!literal.equals(bytes)||file.observedMediaType!==null||file.httpCapture!=null))fail('RESULT_LITERAL_OUTPUT','Retained bytes differ from the original raw, text, or data part.');
    const expectedType=mediaType(part.mediaType??file.observedMediaType,typeof part.text==='string'?'text/plain; charset=utf-8':Object.hasOwn(part,'data')?'application/json':'application/octet-stream');
    if(file.mediaType!==expectedType)fail('RESULT_OUTPUT_METADATA');
    total+=bytes.length;if(total>LIMITS.editionBytes)fail('RESULT_OUTPUT_LIMIT');
  }
  if(seen.size!==positions.size||packet.capture.bytes!==total)fail('RESULT_OUTPUT_COMPLETENESS');
}
function validateResult(packet){
  object(packet.edition);object(packet.observation);object(packet.capture);object(packet.review);object(packet.card);
  const objects=new Map(packet.objects.map(x=>[x.sha256,x]));
  if(!Array.isArray(packet.sources)||!Array.isArray(packet.messages)||!Array.isArray(packet.operations))fail('RESULT_SOURCES');
  for(const source of packet.sources)if(!objects.has(source.sha256)||objects.get(source.sha256).bytes!==source.bytes)fail('RESULT_SOURCE_IDENTITY');
  if(packet.edition.selection?.cardSha256!==packet.card.sha256||packet.edition.selection?.cardId!==packet.card.id||packet.edition.reviewId!==packet.review.id||packet.edition.observationSha256!==packet.observation.sha256||packet.capture.observationSha256!==packet.observation.sha256||packet.review.observationSha256!==packet.observation.sha256||packet.review.observationId!==packet.observation.id||!objects.has(packet.card.sha256)||!objects.has(packet.observation.sha256))fail('RESULT_SOURCE_BINDING');
  if(packet.capture.complete!==true||packet.review.decision!=='accepted'||packet.edition.observationId!==packet.observation.id||packet.edition.captureId!==packet.capture.id||packet.review.captureId!==packet.capture.id||packet.capture.observationId!==packet.observation.id)fail('RESULT_BINDING');
  if(!Array.isArray(packet.capture.files)||packet.capture.files.some(x=>!objects.has(x.sha256)||objects.get(x.sha256).bytes!==x.bytes||!packet.sources.some(s=>s.id===x.sourceId&&s.sha256===x.sha256)))fail('RESULT_ARTIFACTS');
  if(packet.observation.kind!=='message'&&(packet.observation.kind!=='task'||packet.observation.value?.status?.state!=='TASK_STATE_COMPLETED'))fail('RESULT_COMPLETION');
  if(sha(canonical(packet.observation.value))!==packet.observation.sha256)fail('RESULT_OBSERVATION_IDENTITY');
  validateCapturedOutputs(packet,objects);
}
function filesFor(workspace,sources,{includePrivate=false}={}){
  const map=new Map();for(const source of sources)map.set(source.sha256,source);
  return [...map.keys()].sort().map(hash=>{
    const entry=workspace.db.prepare('SELECT * FROM objects WHERE sha256=?').get(hash);if(!entry)fail('MISSING_SOURCE_OBJECT');
    if(entry.private&&!includePrivate)fail('PRIVATE_SOURCE','The selected original response contains a configured credential. Keep its full private custody; it cannot be published without explicit private export.',409);
    const bytes=workspace.objects.get(hash);return{sha256:hash,bytes:bytes.length,private:!!entry.private,contentBase64:bytes.toString('base64')};
  });
}
export function makePacket(workspace,projectId,{revision=null,handoffId=null,includePrivate=false}={}){
  const head=workspace.raw(projectId);
  if(handoffId){const handoff=head.handoffs.find(x=>x.id===handoffId);if(!handoff)fail('HANDOFF_NOT_FOUND',undefined,404);if(revision!==null&&revision!==handoff.projectRevision)fail('HANDOFF_REVISION');revision=handoff.projectRevision;}
  const selected=workspace.raw(projectId,revision);
  if(selected.operations.some(x=>['running','prepared'].includes(x.state)))fail('OPERATION_ACTIVE','Freeze a closed capture; an active history cannot be a complete portable handoff.',409);
  const history=workspace.db.prepare('SELECT * FROM history WHERE project_id=? AND revision<=? ORDER BY revision').all(projectId,selected.revision).map(x=>({revision:x.revision,body:JSON.parse(x.body),sha256:x.sha256,event:JSON.parse(x.event)}));
  const revisions=new Map();for(const h of history){const r=h.event.payload?.requestId;if(r)revisions.set(r,h.revision);}
  const requests=workspace.db.prepare('SELECT * FROM requests WHERE project_id=? ORDER BY id').all(projectId).filter(row=>revisions.has(row.id)).map(row=>{
    const op=selected.operations.find(x=>x.requestId===row.id);
    return{id:row.id,action:row.action,fingerprint:row.fingerprint,payload:JSON.parse(row.payload),created:row.created,revision:revisions.get(row.id),state:op?.state??row.state,result:op?(op.result??null):(row.result?JSON.parse(row.result):null),error:op?(op.error??null):(row.error?JSON.parse(row.error):null)};
  });
  const sources=history.flatMap(h=>h.body.sources);
  return{schema:WORKSPACE,projectId:selected.id,revision:selected.revision,createdAt:selected.updatedAt,handoffId,history,requests,objects:filesFor(workspace,sources,{includePrivate})};
}
export function makeResultPacket(workspace,project,editionId,{includePrivate=false}={}){
  const edition=project.editions.find(x=>x.id===editionId);if(!edition)fail('EDITION_NOT_FOUND',undefined,404);
  const p=workspace.raw(project.id,edition.projectRevision),observation=p.observations.find(x=>x.id===edition.observationId),capture=p.artifactCaptures.find(x=>x.id===edition.captureId),review=p.reviews.find(x=>x.id===edition.reviewId),card=p.cards.find(x=>x.id===edition.selection.cardId);
  if(!observation||!capture||!review||!card)fail('EDITION_SOURCE_MISSING');
  const operation=p.operations.find(x=>x.id===observation.operationId),captureOperation=p.operations.find(x=>x.id===capture.operationId);
  const sourceIds=new Set([card.sourceId,observation.sourceId,...observation.sourceIds,...capture.files.map(x=>x.sourceId),...(operation?.sourceIds??[]),...(captureOperation?.sourceIds??[])]);
  const messages=p.messages.filter(x=>x.sendRequestId===observation.operationId||x.adoptedTaskId===observation.value?.id||x.native.message.taskId===observation.value?.id||(observation.value?.history??[]).some(h=>h.messageId===x.native.message.messageId));
  for(const message of messages)sourceIds.add(message.sourceId);
  const sources=p.sources.filter(x=>sourceIds.has(x.id)),packet={schema:RESULT,project:{id:p.id,title:p.title,revision:p.revision,originWorkspaceId:p.originWorkspaceId},createdAt:edition.createdAt,edition:clone(edition),card:clone(card),messages:clone(messages),observation:clone(observation),capture:clone(capture),review:clone(review),operations:[operation,captureOperation].filter(Boolean).map(clone),sources,objects:filesFor(workspace,sources,{includePrivate})};
  validateResult(packet);return packet;
}
export function receiveIntoWorkspace(workspace,packet,{requestId,packetSha256}){
  identifier(requestId,'receive requestId');if(packet.schema!==WORKSPACE)fail('WORKSPACE_PACKET_REQUIRED','Use the result inspection/download workflow for a purchased result edition.');
  const fingerprint=sha(canonical({packetSha256,projectId:packet.projectId})),prior=workspace.db.prepare('SELECT * FROM imports WHERE id=?').get(requestId);
  if(prior){if(prior.fingerprint!==fingerprint)fail('RECEIVE_ID_CONFLICT',undefined,409);return{...JSON.parse(prior.result),replay:true,project:workspace.get(packet.projectId)};}
  if(workspace.db.prepare("SELECT id FROM requests WHERE project_id=? AND state IN ('prepared','running') LIMIT 1").get(packet.projectId))fail('PROJECT_OPERATION_ACTIVE','Close the original local capture before receiving another history for this project.',409);
  // Revalidate callers that use this exported function directly.
  validateObjects(packet);validateHistory(packet);
  let response;
  workspace.transaction(()=>{
    const existing=workspace.db.prepare('SELECT * FROM projects WHERE id=?').get(packet.projectId);
    if(existing){
      const incoming=packet.history[Math.min(existing.revision,packet.revision)-1],local=workspace.db.prepare('SELECT sha256 FROM history WHERE project_id=? AND revision=?').get(packet.projectId,incoming.revision);
      if(!local||incoming.sha256!==local.sha256)fail('DIVERGENT_HISTORY','This received project diverges from the retained original history.',409);
    }
    for(const request of packet.requests){
      const local=workspace.db.prepare('SELECT fingerprint FROM requests WHERE id=?').get(request.id);if(local&&local.fingerprint!==request.fingerprint)fail('IMPORTED_REQUEST_CONFLICT',undefined,409);
    }
    for(const file of packet.objects)workspace.put(decodeBase64(file.contentBase64,LIMITS.packetBytes),{private:file.private===true});
    for(const h of packet.history)if(!existing||h.revision>existing.revision)workspace.db.prepare('INSERT INTO history VALUES(?,?,?,?,?)').run(packet.projectId,h.revision,canonical(h.body),h.sha256,canonical(h.event));
    if(!existing||packet.revision>existing.revision){workspace.db.prepare('DELETE FROM metadata WHERE key=?').run('connection_binding:'+packet.projectId);const h=packet.history.at(-1);workspace.db.prepare('INSERT INTO projects VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body,sha256=excluded.sha256').run(packet.projectId,h.revision,canonical(h.body),h.sha256);}
    for(const r of packet.requests){
      const local=workspace.db.prepare('SELECT revision FROM requests WHERE id=?').get(r.id);
      if(!local)workspace.db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?)').run(r.id,packet.projectId,r.action,r.fingerprint,canonical(r.payload),r.state,r.created,r.revision,r.result===null?null:canonical(r.result),r.error===null?null:canonical(r.error));
      else if(r.revision>local.revision)workspace.db.prepare('UPDATE requests SET state=?,revision=?,result=?,error=? WHERE id=?').run(r.state,r.revision,r.result===null?null:canonical(r.result),r.error===null?null:canonical(r.error),r.id);
    }
    response={projectId:packet.projectId,requestId,status:!existing?'imported':packet.revision>existing.revision?'advanced':packet.revision===existing.revision?'already_present':'older_retained',revision:Math.max(existing?.revision??0,packet.revision),packetSha256};
    workspace.db.prepare('INSERT INTO imports VALUES(?,?,?)').run(requestId,fingerprint,canonical(response));
  });
  return{...response,project:workspace.get(packet.projectId)};
}
export function inspectResultPacket(bytes) {
  const packet=decodePacket(bytes);if(packet.schema!==RESULT)fail('RESULT_PACKET_REQUIRED');
  return{schema:packet.schema,sha256:sha(bytes),project:packet.project,edition:packet.edition,agent:packet.card.card.name,nativeTaskId:packet.observation.kind==='task'?packet.observation.value.id:null,files:packet.capture.files,review:packet.review,packet};
}
