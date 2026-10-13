/**
 * Immutable, bounded Curity audit-source editions. Node 22+; built-ins only.
 * This is a source companion, not another incident or customer-case database.
 */
import {createHash,randomBytes} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {open,mkdir,rename,stat,lstat,readFile,realpath} from 'node:fs/promises';
import {resolve,join,relative,dirname,isAbsolute,sep} from 'node:path';
import {parseLossless,atPath,canonicalLossless,fieldValue,exactInstant,compareInstants,parseCurityMessage} from './lossless-json.mjs';

export const SCHEMA='curity.audit-edition/v1';
export const LIMITS=Object.freeze({files:20,bytes:1073741824,records:1000000,recordBytes:8388608,selected:1000});
const SHA=/^[a-f0-9]{64}$/;
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function stable(value) {
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  throw new TypeError('Only complete JSON values may enter a frozen edition');
}
const clone=v=>JSON.parse(stable(v));
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const text=(v,label,max=2048)=>{need(typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f]/.test(v),label);return v;};
const typedString=v=>v?.present===true&&v.type==='string'?v.value:undefined;
const refKey=r=>r.sourceId+':'+r.recordOrdinal;
const selectorKey=r=>r.sourceId+':'+r.recordOrdinal;
function safeRelative(path) {
  need(typeof path==='string'&&path.length>0&&!path.includes('\\')&&!path.includes('\0')&&!isAbsolute(path)&&path.split('/').every(p=>p&&p!=='.'&&p!=='..'),'Unsafe source companion path');
  return path;
}
async function retainedPath(directory,path) {
  const root=await realpath(directory),target=join(root,safeRelative(path));
  let cursor=root;for(const part of path.split('/')){cursor=join(cursor,part);const s=await lstat(cursor);need(!s.isSymbolicLink(),'A source companion member is a symbolic link');}
  const actual=await realpath(target);need(actual.startsWith(root+sep),'Source path escaped its edition');
  need((await stat(actual)).isFile(),'Source member must be a regular file');return actual;
}
async function digestFile(path) {
  const sha=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(path)){sha.update(chunk);bytes+=chunk.length;}return {sha256:sha.digest('hex'),bytes};
}
async function writeFileExclusive(path,content) {
  await mkdir(dirname(path),{recursive:true,mode:0o700});const handle=await open(path,'wx',0o600);
  try{await handle.writeFile(content);await handle.sync();}finally{await handle.close();}
}
function normalizedMapping(value) {
  need(value&&value.schema==='curity.audit-mapping/v1','Select a Curity mapping revision');
  need(['fields','curity-message'].includes(value.layout),'Select fields or curity-message layout');
  const fields=value.fields??{};need(fields&&typeof fields==='object'&&!Array.isArray(fields),'Explicit field paths required');
  for(const [name,path]of Object.entries(fields)){text(name,'Invalid mapped field',128);need(Array.isArray(path)&&path.length<=32&&path.every(p=>typeof p==='string'||Number.isSafeInteger(p)&&p>=0),'Invalid field path');}
  if(value.layout==='fields')for(const required of ['type','id','instant','message'])need(Object.hasOwn(fields,required),'Map required field '+required);
  if(value.layout==='curity-message')need(Array.isArray(value.messagePath),'Select the exact JSON envelope message path');
  if(value.contentPath!==undefined)need(Array.isArray(value.contentPath),'Select the event content path');
  if(value.outerTimestamp!==undefined){need(Array.isArray(value.outerTimestamp.path),'Select outer timestamp path');need(['seconds','milliseconds','microseconds','nanoseconds','literal-only'].includes(value.outerTimestamp.unit),'Supply the confirmed outer timestamp unit or literal-only');}
  return clone(value);
}
function normalizedBinding(value,installationId) {
  need(value&&value.installationId===installationId,'Bind the selected installation');
  text(value.resourceId,'Select the original resource identity');need(SHA.test(value.configurationHash??''),'Supply the actual configuration SHA256');
  need(value.window&&compareInstants(value.window.start,value.window.end)<0,'Select a nonempty exact event-time window');
  if(value.observation!==null&&value.observation!==undefined){
    const o=value.observation;need(SHA.test(o.sha256??'')&&o.configurationHash===value.configurationHash,'Observation must bind the same reviewed configuration and actual source hash');
    text(o.endpoint,'Retain the selected observation endpoint');
    need(Array.isArray(o.stages)&&o.stages.every(s=>['authentication','authorization','hostAuthority','jwks'].includes(s)),'Retain original observation stages');
    need(o.window&&compareInstants(o.window.start,o.window.end)<0,'Retain exact observation window');
  }
  return clone({...value,observation:value.observation??null});
}
/** Source byte framing. Oversized rows retain their full original byte range. */
async function* frames(path,format) {
  let position=0,start=0,size=0,pieces=[],overflow=false,ordinal=0;
  const append=byte=>{size++;if(size<=LIMITS.recordBytes)pieces.push(byte);else overflow=true;};
  const reset=at=>{start=at;size=0;pieces=[];overflow=false;};
  const emit=()=>({recordOrdinal:++ordinal,byteStart:start,byteEnd:start+size,bytes:overflow?null:Buffer.from(pieces),oversize:overflow});
  if(format==='ndjson'){
    for await(const chunk of createReadStream(path))for(const byte of chunk){
      if(byte===10){const row=emit();if(row.bytes&&!row.bytes.some(b=>![9,13,32].includes(b)))row.blank=true;yield row;reset(position+1);}else append(byte);position++;
    }
    if(size){const row=emit();if(row.bytes&&!row.bytes.some(b=>![9,13,32].includes(b)))row.blank=true;yield row;}return;
  }
  need(format==='json','Select json or ndjson source framing');
  let mode='initial',depth=0,inString=false,escape=false,ended=false,expectValue=true,hadValue=false,invalidReason=null;
  let firstChunk=true;
  for await(const suppliedChunk of createReadStream(path)) {
    let chunk=suppliedChunk;
    if(firstChunk&&chunk.length>=3&&chunk[0]===239&&chunk[1]===187&&chunk[2]===191){chunk=chunk.subarray(3);position=3;start=3;}
    firstChunk=false;
    for(const byte of chunk){
    const at=position++;
    if(mode==='initial'){
      if([9,10,13,32].includes(byte))continue;
      if(byte===91){mode='array';reset(position);continue;}
      mode='single';reset(at);
    }
    if(mode==='single'){append(byte);continue;}
    if(ended){if(![9,10,13,32].includes(byte)){reset(at);append(byte);invalidReason='Unclassifiable complete trailing range after JSON array';ended=false;mode='invalid';}continue;}
    if(mode==='invalid'){append(byte);continue;}
    if(expectValue&&size===0){
      if([9,10,13,32].includes(byte)){start=position;continue;}
      if(byte===93){if(hadValue)yield {recordOrdinal:++ordinal,byteStart:at,byteEnd:position,bytes:null,error:'Trailing comma in JSON array'};ended=true;continue;}
      expectValue=false;start=at;
    }
    if(!inString&&depth===0&&(byte===44||byte===93)){
      const row=emit();yield row;hadValue=true;reset(position);expectValue=true;if(byte===93)ended=true;continue;
    }
    append(byte);
    if(inString){if(escape)escape=false;else if(byte===92)escape=true;else if(byte===34)inString=false;}
    else if(byte===34)inString=true;else if(byte===123||byte===91)depth++;else if(byte===125||byte===93)depth--;
    if(depth<0){invalidReason='Unclassifiable complete remainder after unbalanced JSON structure';mode='invalid';}
  }
  }
  if(mode==='single'&&size)yield emit();
  else if(mode==='invalid')yield {...emit(),bytes:null,error:invalidReason};
  else if(mode==='array'&&!ended)yield {...emit(),bytes:null,error:'Incomplete JSON array'};
  else if(mode==='initial')yield {recordOrdinal:++ordinal,byteStart:0,byteEnd:position,bytes:null,error:'Empty JSON document'};
}
function mappedEvent(node,mapping) {
  let event=node;
  if(mapping.layout==='curity-message'){
    const supplied=atPath(node,mapping.messagePath);need(supplied?.kind==='string','Selected envelope message must be a string');
    event=parseCurityMessage(supplied.value);
  }
  const fields={};
  if(mapping.layout==='curity-message'){
    for(const [name,value]of event.members)Object.defineProperty(fields,name,{value:fieldValue(value),enumerable:true,writable:true});
    for(const name of ['subject','client','resource','authenticatedSubject','authenticatedClient','acr','endpoint','session'])if(!Object.hasOwn(fields,name))Object.defineProperty(fields,name,{value:{present:false},enumerable:true,writable:true});
  }else for(const [name,path]of Object.entries(mapping.fields))Object.defineProperty(fields,name,{value:fieldValue(atPath(event,path)),enumerable:true,writable:true});
  for(const name of ['type','id','instant','message'])need(fields[name]?.present===true&&fields[name].type==='string','Required field '+name+' must be present as text');
  need(fields.type.value.length>0&&fields.id.value.length>0,'Event type and ID must be nonempty');
  const instant=exactInstant(fields.instant.value);
  const content=mapping.layout==='curity-message'?event:atPath(node,mapping.contentPath??[]);
  need(content!==undefined,'Selected event content path is absent');
  const outerTimestamp=mapping.outerTimestamp?{...fieldValue(atPath(node,mapping.outerTimestamp.path)),unit:mapping.outerTimestamp.unit}:null;
  return {fields,instant,outerTimestamp,contentSha256:hash(canonicalLossless(content)+'\n'+stable(fields))};
}
function validateReview(input) {
  const value=clone({confirmed:false,operator:null,reason:null,decisions:[],selection:[],...(input??{})});
  need(typeof value.confirmed==='boolean','Review confirmed flag required');
  need(Array.isArray(value.decisions)&&value.decisions.length<=LIMITS.records&&Array.isArray(value.selection)&&value.selection.length<=LIMITS.selected,'Bound review decisions and selected evidence');
  if(value.confirmed){text(value.operator,'Name the reviewing operator');text(value.reason,'Record the review reason',10000);}
  const decisions=new Map(),selected=new Map();
  for(const row of value.decisions){text(row.sourceId,'Retain original source ID',80);need(Number.isSafeInteger(row.recordOrdinal)&&row.recordOrdinal>0,'Retain record ordinal');need(['include','exclude','accept-collision'].includes(row.action),'Select an explicit review action');text(row.reason,'Explain each decision',4000);need(!decisions.has(selectorKey(row)),'Duplicate review decision');decisions.set(selectorKey(row),row);}
  for(const row of value.selection){text(row.sourceId,'Select source ID',80);need(Number.isSafeInteger(row.recordOrdinal)&&row.recordOrdinal>0,'Select record ordinal');need(!selected.has(selectorKey(row)),'Duplicate evidence selection');selected.set(selectorKey(row),row);}
  return {value,decisions,selected};
}
/** Build into a new immutable destination. An incomplete build never becomes an edition. */
export async function buildEdition(input) {
  need(input&&typeof input==='object','Source selection required');
  const directory=resolve(input.directory);text(input.installationId,'Select installation identity');
  need(['PUBLISHER_EXAMPLE','SUPPLIER_EXPORT'].includes(input.sourceContext),'Label actual source context');
  text(input.sourceEdition,'Retain supplied export edition');
  need(Array.isArray(input.files)&&input.files.length>0&&input.files.length<=LIMITS.files,'Select 1–20 complete original files');
  const mapping=normalizedMapping(input.mapping),mappingRevision=hash(stable(mapping)),binding=normalizedBinding(input.binding,input.installationId);
  need(input.coverage&&typeof input.coverage==='object'&&Array.isArray(input.coverage.profiles)&&Array.isArray(input.coverage.listeners),'Retain explicit listener and profile coverage');
  const coverage=clone(input.coverage),review=validateReview(input.review);
  try{await lstat(directory);throw new Error('Immutable destination exists; reopen it with openEdition or select a new review-edition directory');}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(dirname(directory),{recursive:true,mode:0o700});
  const stage=directory+'.building-'+process.pid+'-'+randomBytes(6).toString('hex');
  await mkdir(stage,{recursive:false,mode:0o700});await mkdir(join(stage,'originals'),{mode:0o700});await mkdir(join(stage,'indexes'),{mode:0o700});
  const sourceFiles=[];let totalBytes=0;
  // Copy first; no parsing is allowed until all full originals are retained.
  for(let index=0;index<input.files.length;index++){
    const selected=input.files[index];text(selected.name,'Retain original source filename');
    need(['json','ndjson'].includes(selected.format),'Select source framing');
    const original=await realpath(selected.path),before=await stat(original);need(before.isFile(),'Select a regular original source file');
    const temp=join(stage,'originals','input-'+index),handle=await open(temp,'wx',0o600),digest=createHash('sha256');let bytes=0;
    try{for await(const chunk of createReadStream(original)){bytes+=chunk.length;totalBytes+=chunk.length;need(totalBytes<=LIMITS.bytes,'Selected complete source exceeds 1 GiB');digest.update(chunk);await handle.writeFile(chunk);}await handle.sync();}finally{await handle.close();}
    const after=await stat(original);need(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&bytes===after.size,'Original source changed during retention');
    const sha256=digest.digest('hex');if(selected.sha256!==undefined)need(selected.sha256===sha256,'Supplied source SHA256 differs');
    const path='originals/'+sha256+'.bin';
    try{await lstat(join(stage,path));const old=await digestFile(join(stage,path));need(old.sha256===sha256&&old.bytes===bytes,'Original hash collision');const {unlink}=await import('node:fs/promises');await unlink(temp);}catch(error){if(error.code==='ENOENT')await rename(temp,join(stage,path));else throw error;}
    sourceFiles.push({sourceId:'source-'+(index+1),index,name:selected.name,path,sha256,bytes,format:selected.format,sourceUri:selected.sourceUri??null,exportId:selected.exportId??null,metadata:clone(selected.metadata??{}),sourceEdition:input.sourceEdition});
  }
  const events=await open(join(stage,'events.jsonl'),'wx',0o600),findings=await open(join(stage,'findings.jsonl'),'wx',0o600);
  const counts={sourceRecords:0,blankLines:0,classifiable:0,selectedWindow:0,outsideWindow:0,accepted:0,repeats:0,collisions:0,unresolvedCollisions:0,rejected:0,unclassifiable:0,findings:0,dispositions:{}};
  const identities=new Map(),optionalCoverage={},selectedReferences=[],seenReview=new Set(),seenSelected=new Set();
  let firstInstant=null,lastInstant=null,eventOffset=0,findingOffset=0,eventLine=0,findingLine=0;
  const eventIndex=[],findingIndex=[];
  async function append(handle,row,kind){
    const bytes=Buffer.from(JSON.stringify(row)+'\n');
    if(kind==='event'){if(eventLine%100===0)eventIndex.push({row:eventLine,offset:eventOffset});eventOffset+=bytes.length;eventLine++;}
    else{if(findingLine%100===0)findingIndex.push({row:findingLine,offset:findingOffset});findingOffset+=bytes.length;findingLine++;}
    await handle.writeFile(bytes);
  }
  async function finding(ref,code,message,severity='error'){counts.findings++;await append(findings,{ref,code,message,severity},'finding');}
  try{
    for(const file of sourceFiles)for await(const frame of frames(join(stage,file.path),file.format)){
      const ref={sourceId:file.sourceId,fileSha256:file.sha256,recordOrdinal:frame.recordOrdinal,byteStart:frame.byteStart,byteEnd:frame.byteEnd,mappingRevision};
      if(frame.blank){counts.blankLines++;await finding(ref,'BLANK_LINE','Blank framing line retained','information');continue;}
      counts.sourceRecords++;need(counts.sourceRecords<=LIMITS.records,'Selected source exceeds one million records');
      const key=refKey(ref),decision=review.decisions.get(key);if(decision)seenReview.add(key);
      if(review.selected.has(key))seenSelected.add(key);
      let row={ref,sourceOrder:counts.sourceRecords-1,disposition:'unclassifiable'};
      try{
        need(!frame.error,frame.error);need(!frame.oversize,'Record exceeds selected 8 MiB parser bound; full original bytes retained');need(frame.bytes!==null,'Source framing incomplete');
        let bytes=frame.bytes;if(ref.byteStart===0&&bytes.length>=3&&bytes[0]===239&&bytes[1]===187&&bytes[2]===191)bytes=bytes.subarray(3);
        const node=parseLossless(new TextDecoder('utf-8',{fatal:true}).decode(bytes));need(node.kind==='object','Each selected audit record must be a JSON object');
        const parsed=mappedEvent(node,mapping);counts.classifiable++;
        const eventId=typedString(parsed.fields.id),eventKey=hash(stable({installationId:input.installationId,eventId}));
        const inside=compareInstants(parsed.instant,binding.window.start)>=0&&compareInstants(parsed.instant,binding.window.end)<0;
        row={...row,...parsed,eventId,eventKey,rawSha256:hash(frame.bytes),withinWindow:inside,reviewDecision:decision??null};
        if(!firstInstant||compareInstants(parsed.instant,firstInstant)<0)firstInstant=parsed.instant;
        if(!lastInstant||compareInstants(parsed.instant,lastInstant)>0)lastInstant=parsed.instant;
        for(const [name,value]of Object.entries(parsed.fields)){
          if(!Object.hasOwn(optionalCoverage,name))Object.defineProperty(optionalCoverage,name,{value:{absent:0,null:0,empty:0,present:0},enumerable:true});
          const tally=optionalCoverage[name];
          if(!value.present)tally.absent++;else if(value.type==='null')tally.null++;else if(value.type==='string'&&value.value==='')tally.empty++;else tally.present++;
        }
        let identity=identities.get(eventKey);
        if(!identity){identity={eventKey,eventId,variants:new Map(),occurrences:0,occurrencesSha256:hash('')};identities.set(eventKey,identity);}
        const same=identity.variants.has(parsed.contentSha256),collision=!same&&identity.variants.size>0;
        identity.occurrences++;identity.occurrencesSha256=hash(identity.occurrencesSha256+'\n'+stable({ref,contentSha256:parsed.contentSha256}));if(!same)identity.variants.set(parsed.contentSha256,{contentSha256:parsed.contentSha256,firstRef:ref,occurrences:0});
        identity.variants.get(parsed.contentSha256).occurrences++;
        if(inside)counts.selectedWindow++;else counts.outsideWindow++;
        if(decision?.action==='exclude'){row.disposition='excluded';counts.rejected++;}
        else if(!inside){row.disposition='outside-window';}
        else if(collision){row.disposition=decision?.action==='accept-collision'?'collision-accepted':'collision';counts.collisions++;if(row.disposition==='collision')counts.unresolvedCollisions++;await finding(ref,'EVENT_ID_COLLISION','Same installation/event ID has different preserved content',row.disposition==='collision'?'error':'reviewed');}
        else if(same){row.disposition='repeat';counts.repeats++;}
        else {row.disposition='accepted';counts.accepted++;}
        // A later variant makes the ID ambiguous; all variants stay in the identity index.
        if(review.selected.has(key))selectedReferences.push({...ref,eventId,eventKey,contentSha256:parsed.contentSha256,disposition:row.disposition});
      }catch(error){
        row.error=String(error.message).slice(0,2000);counts.unclassifiable++;await finding(ref,'UNCLASSIFIABLE_RECORD',row.error);
        if(decision?.action==='exclude'){row.reviewDecision=decision;row.disposition='excluded-unclassifiable';counts.rejected++;}
        if(review.selected.has(key))selectedReferences.push({...ref,eventId:null,eventKey:null,contentSha256:null,disposition:row.disposition});
      }
      counts.dispositions[row.disposition]=(counts.dispositions[row.disposition]??0)+1;
      await append(events,row,'event');
    }
    for(const key of review.decisions.keys())need(seenReview.has(key),'Review decision references an absent source record: '+key);
    for(const key of review.selected.keys())need(seenSelected.has(key),'Evidence selection references an absent source record: '+key);
    for(const ref of selectedReferences){
      const identity=identities.get(ref.eventKey);
      if(identity&&identity.variants.size>1&&review.decisions.get(refKey(ref))?.action!=='accept-collision'&&ref.disposition!=='excluded'){
        ref.disposition='collision';await finding(ref,'SELECTED_ID_AMBIGUOUS','Select an explicit collision disposition for this exact occurrence');
      }
    }
    await events.sync();await findings.sync();
  }finally{await events.close();await findings.close();}
  const indexHandle=await open(join(stage,'indexes/identities.jsonl'),'wx',0o600);
  try{for(const row of identities.values())await indexHandle.writeFile(JSON.stringify({...row,variants:[...row.variants.values()]})+'\n');await indexHandle.sync();}finally{await indexHandle.close();}
  await writeFileExclusive(join(stage,'indexes/pages.json'),JSON.stringify({events:eventIndex,findings:findingIndex,eventRows:eventLine,findingRows:findingLine})+'\n');
  need(counts.classifiable+counts.unclassifiable===counts.sourceRecords&&Object.values(counts.dispositions).reduce((a,b)=>a+b,0)===counts.sourceRecords,'Source record accounting must reconcile');
  const reviewValue={schema:'curity.audit-review/v1',...review.value,selectedReferences};
  const reviewHash=hash(stable(reviewValue)),reviewId='review-'+reviewHash;
  await writeFileExclusive(join(stage,'review.json'),JSON.stringify({...reviewValue,id:reviewId})+'\n');
  await writeFileExclusive(join(stage,'mapping.json'),JSON.stringify(mapping)+'\n');
  const fileNames=[...new Set(sourceFiles.map(f=>f.path)),'events.jsonl','findings.jsonl','indexes/identities.jsonl','indexes/pages.json','review.json','mapping.json'];
  const files=[];for(const path of fileNames)files.push({path,...await digestFile(join(stage,path)),role:path.startsWith('originals/')?'original':path==='events.jsonl'?'events':path==='findings.jsonl'?'findings':'review'});
  const manifest={schema:SCHEMA,installationId:input.installationId,sourceContext:input.sourceContext,sourceEdition:input.sourceEdition,
    sourceFiles,files,mappingRevision,configurationHash:binding.configurationHash,binding,coverage,
    coverageInterpretation:'CONFIGURATION_AND_EXPORT_DECLARATION_ONLY',counts,eventTimeSpan:{first:firstInstant,last:lastInstant},
    optionalCoverage,state:counts.unclassifiable||counts.unresolvedCollisions?'INCOMPLETE_SOURCE':'COMPLETE',
    review:{id:reviewId,confirmed:review.value.confirmed,operator:review.value.operator??null,reason:review.value.reason??null,
      selectedReferences,decisionCount:review.value.decisions.length,sha256:files.find(f=>f.path==='review.json').sha256}};
  manifest.id='curity-'+hash(stable(manifest));await writeFileExclusive(join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  try{await lstat(directory);throw new Error('Immutable destination already exists; select a new edition directory');}catch(error){if(error.code!=='ENOENT')throw error;}
  await rename(stage,directory);return manifest;
}
export async function openEdition(directory,{verify=true}={}) {
  const root=await realpath(directory),manifestPath=await retainedPath(root,'manifest.json');
  const value=JSON.parse(await readFile(manifestPath,'utf8'));need(value.schema===SCHEMA&&typeof value.id==='string'&&Array.isArray(value.files),'Invalid Curity edition');
  const {id,...body}=value;need(id==='curity-'+hash(stable(body)),'Curity edition identity differs from its manifest');
  need(value.files.length<=LIMITS.files+6,'Unexpected source closure size');
  const names=new Set();for(const file of value.files){safeRelative(file.path);need(!names.has(file.path)&&SHA.test(file.sha256)&&Number.isSafeInteger(file.bytes)&&file.bytes>=0,'Invalid source file declaration');names.add(file.path);if(verify){const actual=await digestFile(await retainedPath(root,file.path));need(actual.sha256===file.sha256&&actual.bytes===file.bytes,'Source member differs: '+file.path);}}
  for(const required of ['events.jsonl','findings.jsonl','review.json','mapping.json','indexes/identities.jsonl','indexes/pages.json'])need(names.has(required),'Incomplete source companion');
  for(const file of value.sourceFiles)need(names.has(file.path)&&value.files.some(f=>f.path===file.path&&f.sha256===file.sha256&&f.bytes===file.bytes),'Original source declaration differs');
  need(value.review?.sha256===value.files.find(f=>f.path==='review.json').sha256,'Review file binding changed');
  if(verify){
    const review=JSON.parse(await readFile(await retainedPath(root,'review.json'),'utf8'));
    const {id:reviewId,...reviewBody}=review;
    need(reviewId==='review-'+hash(stable(reviewBody))&&reviewId===value.review.id,'Review identity changed');
    need(stable(review.selectedReferences)===stable(value.review.selectedReferences)&&review.confirmed===value.review.confirmed&&review.operator===value.review.operator&&review.reason===value.review.reason,'Reviewed selection differs');
    const mapping=JSON.parse(await readFile(await retainedPath(root,'mapping.json'),'utf8'));need(hash(stable(mapping))===value.mappingRevision,'Mapping revision differs');
    for(const ref of value.review.selectedReferences){
      // Verify classified selected content directly against original bytes.
      if(!ref.eventKey)continue;
      const file=value.sourceFiles.find(f=>f.sourceId===ref.sourceId&&f.sha256===ref.fileSha256);
      need(file&&Number.isSafeInteger(ref.byteStart)&&Number.isSafeInteger(ref.byteEnd)&&ref.byteStart>=0&&ref.byteEnd>=ref.byteStart&&ref.byteEnd<=file.bytes&&ref.byteEnd-ref.byteStart<=LIMITS.recordBytes,'Selected evidence source range differs');
      const handle=await open(await retainedPath(root,file.path),'r');
      let bytes=Buffer.alloc(ref.byteEnd-ref.byteStart);
      try{let at=0;while(at<bytes.length){const r=await handle.read(bytes,at,bytes.length-at,ref.byteStart+at);need(r.bytesRead>0,'Selected original ended early');at+=r.bytesRead;}}finally{await handle.close();}
      if(ref.byteStart===0&&bytes.length>=3&&bytes[0]===239&&bytes[1]===187&&bytes[2]===191)bytes=bytes.subarray(3);
      const event=mappedEvent(parseLossless(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),mapping);
      const eventId=typedString(event.fields.id),eventKey=hash(stable({installationId:value.installationId,eventId}));
      need(eventId===ref.eventId&&eventKey===ref.eventKey&&event.contentSha256===ref.contentSha256&&ref.mappingRevision===value.mappingRevision,'Selected evidence differs from original source content');
    }
  }
  return value;
}
async function page(directory,kind,{after=0,limit=100}={}) {
  need(Number.isSafeInteger(after)&&after>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=1000,'Select a bounded source page');
  const manifest=await openEdition(directory,{verify:false}),pages=JSON.parse(await readFile(await retainedPath(directory,'indexes/pages.json'),'utf8'));
  const total=kind==='events'?pages.eventRows:pages.findingRows;
  if(after>=total)return {items:[],nextAfter:null,total,editionId:manifest.id};
  const checkpoints=pages[kind],point=[...checkpoints].reverse().find(p=>p.row<=after)??{row:0,offset:0};
  const stream=createReadStream(await retainedPath(directory,kind+'.jsonl'),{start:point.offset});
  let pending=Buffer.alloc(0),row=point.row;const items=[];
  try{for await(const chunk of stream){pending=Buffer.concat([pending,chunk]);let index;while((index=pending.indexOf(10))>=0){const line=pending.subarray(0,index);pending=pending.subarray(index+1);if(row++<after)continue;const value=JSON.parse(line);if(value.ref)value.ref={...value.ref,editionId:manifest.id};items.push(value);if(items.length===limit)return {items,nextAfter:after+items.length<total?after+items.length:null,total,editionId:manifest.id};}}}finally{stream.destroy();}
  return {items,nextAfter:null,total,editionId:manifest.id};
}
export const readEventPage=(directory,options)=>page(directory,'events',options);
export const readFindingPage=(directory,options)=>page(directory,'findings',options);
export async function readSourceRecord(directory,ref) {
  const manifest=await openEdition(directory,{verify:false});if(ref.editionId!==undefined)need(ref.editionId===manifest.id,'Source edition differs');
  const file=manifest.sourceFiles.find(f=>f.sourceId===ref.sourceId&&f.sha256===ref.fileSha256);need(file,'Retain original source identity');
  need(Number.isSafeInteger(ref.byteStart)&&Number.isSafeInteger(ref.byteEnd)&&ref.byteStart>=0&&ref.byteEnd>=ref.byteStart&&ref.byteEnd<=file.bytes,'Invalid original byte range');
  need(ref.byteEnd-ref.byteStart<=LIMITS.recordBytes,'Use complete original file download for an oversized source record');
  const handle=await open(await retainedPath(directory,file.path),'r');try{const bytes=Buffer.alloc(ref.byteEnd-ref.byteStart);let at=0;while(at<bytes.length){const r=await handle.read(bytes,at,bytes.length-at,ref.byteStart+at);need(r.bytesRead>0,'Original source ended early');at+=r.bytesRead;}return {bytes,ref:{...ref,editionId:manifest.id},sha256:hash(bytes)};}finally{await handle.close();}
}
/** Complete files stay opaque to the existing case store; the receiver verifies this closure. */
export async function editionFiles(directory) {
  const manifest=await openEdition(directory);
  return {manifest,files:[{path:'manifest.json',...await digestFile(await retainedPath(directory,'manifest.json'))},...manifest.files]};
}

/** Full identity/content/occurrence comparison, streamed into a new companion. */
export async function compareSourceEditions(beforeDirectory,afterDirectory,{directory}={}) {
  const before=await openEdition(beforeDirectory),after=await openEdition(afterDirectory);
  need(before.installationId===after.installationId,'Compare source editions from the same selected installation');
  const destination=resolve(directory);await mkdir(dirname(destination),{recursive:true,mode:0o700});
  const request={schema:'curity.source-comparison-request/v1',scope:'ALL_CLASSIFIABLE_EVENT_IDENTITIES',
    installationId:after.installationId,
    before:{id:before.id,manifestSha256:hash(await readFile(await retainedPath(beforeDirectory,'manifest.json')))},
    after:{id:after.id,manifestSha256:hash(await readFile(await retainedPath(afterDirectory,'manifest.json')))}};
  async function completed(){
    let selected;try{selected=await lstat(destination);}catch(error){if(error.code==='ENOENT')return null;throw error;}
    need(selected.isDirectory()&&!selected.isSymbolicLink(),'Retain the original comparison destination; it is not an ordinary directory');
    let old;try{old=JSON.parse(await readFile(await retainedPath(destination,'comparison.json'),'utf8'));}
    catch(error){if(error.code==='ENOENT')throw new Error('Retain the existing comparison directory without a published result; this producer publishes only complete directories and will not replace unrelated or damaged data');throw error;}
    const {id,...value}=old;
    need(old.schema==='curity.complete-source-comparison/v1'&&id==='curity-comparison-'+hash(stable(value)),
      'The retained complete comparison identity changed');
    need(old.scope===request.scope&&old.installationId===request.installationId&&old.before===before.id&&old.after===after.id,
      'The retained comparison belongs to another exact source selection');
    need(old.changes?.path==='changes.jsonl','Retain the original complete changes filename');
    const actual=await digestFile(await retainedPath(destination,'changes.jsonl'));
    need(actual.bytes===old.changes.bytes&&actual.sha256===old.changes.sha256,'The retained complete changes bytes changed');
    try{const originalRequest=JSON.parse(await readFile(await retainedPath(destination,'INPUT.json'),'utf8'));
      need(stable(originalRequest)===stable(request),'The comparison request changed');}
    catch(error){if(error.code!=='ENOENT')throw error;} // Original completed editions predate the request member.
    return old;
  }
  const published=await completed();if(published)return published;
  const stage=destination+'.building-'+process.pid+'-'+randomBytes(6).toString('hex');await mkdir(stage,{mode:0o700});
  // Each attempt retains exact source identity before output. Interrupted siblings
  // are kept; re-entry uses a fresh attempt and never truncates their files.
  await writeFileExclusive(join(stage,'INPUT.json'),JSON.stringify(request,null,2)+'\n');
  const {createInterface}=await import('node:readline');
  async function* rows(root){
    const stream=createReadStream(await retainedPath(root,'indexes/identities.jsonl'));
    const lines=createInterface({input:stream,crlfDelay:Infinity});
    try{for await(const line of lines)if(line)yield JSON.parse(line);}finally{lines.close();stream.destroy();}
  }
  const previous=new Map();for await(const row of rows(beforeDirectory))previous.set(row.eventKey,row);
  const out=await open(join(stage,'changes.jsonl'),'wx',0o600);
  const counts={unchanged:0,added:0,removed:0,contentChanged:0,occurrencesChanged:0,changes:0};
  const write=async row=>{await out.writeFile(JSON.stringify(row)+'\n');counts.changes++;};
  try{
    for await(const current of rows(afterDirectory)){
      const old=previous.get(current.eventKey);previous.delete(current.eventKey);
      if(!old){counts.added++;await write({kind:'added',eventKey:current.eventKey,before:null,after:current});continue;}
      const variants=row=>row.variants.map(v=>v.contentSha256).sort();
      if(stable(variants(old))!==stable(variants(current))){counts.contentChanged++;await write({kind:'content-variants-changed',eventKey:current.eventKey,before:old,after:current});}
      else {
        const occurrences=row=>row.variants.map(v=>({sha256:v.contentSha256,count:v.occurrences,firstRef:v.firstRef})).sort((a,b)=>a.sha256.localeCompare(b.sha256));
        if(stable(occurrences(old))!==stable(occurrences(current))||old.occurrences!==current.occurrences||old.occurrencesSha256!==current.occurrencesSha256){counts.occurrencesChanged++;await write({kind:'source-occurrences-changed',eventKey:current.eventKey,before:old,after:current});}
        else counts.unchanged++;
      }
    }
    for(const old of previous.values()){counts.removed++;await write({kind:'removed',eventKey:old.eventKey,before:old,after:null});}
    await out.sync();
  }finally{await out.close();}
  // Complete descriptors retain repeated/empty file occurrences, order, framing and metadata.
  const sourceIdentity=f=>stable(f);
  const oldFiles=new Set(before.sourceFiles.map(sourceIdentity)),newFiles=new Set(after.sourceFiles.map(sourceIdentity));
  const result={schema:'curity.complete-source-comparison/v1',before:before.id,after:after.id,scope:'ALL_CLASSIFIABLE_EVENT_IDENTITIES',
    installationId:after.installationId,counts,sourceState:{before:before.state,after:after.state},
    mappingChanged:before.mappingRevision!==after.mappingRevision,configurationChanged:before.configurationHash!==after.configurationHash,
    addedFiles:after.sourceFiles.filter(f=>!oldFiles.has(sourceIdentity(f))),removedFiles:before.sourceFiles.filter(f=>!newFiles.has(sourceIdentity(f))),
    findings:{before:before.files.find(f=>f.path==='findings.jsonl'),after:after.files.find(f=>f.path==='findings.jsonl'),
      interpretation:'Complete original findings remain in each retained edition; unclassifiable internal events are not assigned invented IDs.'},
    changes:{path:'changes.jsonl',...await digestFile(join(stage,'changes.jsonl'))}};
  result.id='curity-comparison-'+hash(stable(result));await writeFileExclusive(join(stage,'comparison.json'),JSON.stringify(result,null,2)+'\n');
  try{await rename(stage,destination);}catch(error){
    if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;
    const winner=await completed();need(winner,'The comparison destination changed during publication');return winner;
  }
  return result;
}
