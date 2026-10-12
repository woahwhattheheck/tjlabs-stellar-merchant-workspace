// MIT. Receive and export complete original CIIM results; never rerun Proteus.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,rename,rm,readFile} from 'node:fs/promises';
import {join,dirname,resolve,relative,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
import {readOaiSourceFile} from '../../oai-pmh/source.mjs';
import {privateDirectory,readPrivate,createFile,syncDirectory,digest,identity,canonical,object,hashPrivate} from '../../postgres/publisher/files.mjs';

export const LIMITS=Object.freeze({archiveBytes:512*1024*1024,expandedBytes:2*1024*1024*1024,
  memberBytes:256*1024*1024,manifestBytes:16*1024*1024,stateBytes:64*1024*1024,
  members:20000,records:250000,pageSize:250});
export const HASH=/^[a-f0-9]{64}$/;
export function fault(code,message=code,status=400,details={}) {
  return Object.assign(new Error(message),{code,status,details});
}
export const jsonBytes=value=>Buffer.from(JSON.stringify(value)+'\n','utf8');
export function parseJson(body,label='JSON') {
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body)); }
  catch { throw fault('INVALID_JSON',label+' must contain valid UTF-8 JSON.'); }
}
export function member(value) {
  if(typeof value!=='string'||!value||value.length>2048||value.startsWith('/')||
      value.includes('\\')||value.includes('\0')||value.split('/').some(x=>!x||x==='.'||x==='..'))
    throw fault('MEMBER_PATH','Use an exact relative member path.');
  return value;
}
function natural(value,maximum=Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value)&&value>=0&&value<=maximum;
}
export async function readMember(root,name,maximum=LIMITS.memberBytes) {
  member(name);const path=join(root,name);
  await privateDirectory(dirname(path));
  if(await realpath(path)!==path)throw fault('MEMBER_SYMLINK','An original member cannot be replaced with a link.');
  return readPrivate(path,maximum);
}
async function archiveCommand(request,{python='python3'}={}) {
  const body=jsonBytes(request);
  if(body.length>8*1024*1024)throw fault('ARCHIVE_REQUEST_LIMIT','Archive request is too large.',413);
  const child=spawn(python,['-I','-B',fileURLToPath(new URL('./archive.py',import.meta.url))],
    {stdio:['pipe','pipe','pipe'],shell:false,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  const output=[],errors=[];let count=0,errorCount=0,timedOut=false;
  let kill;
  const abort=()=>{child.kill('SIGTERM');kill??=setTimeout(()=>child.kill('SIGKILL'),3000);};
  const timer=setTimeout(()=>{timedOut=true;abort();},300000);
  child.stdout.on('data',chunk=>{count+=chunk.length;if(count>8*1024*1024)abort();else output.push(chunk);});
  child.stderr.on('data',chunk=>{errorCount+=chunk.length;if(errorCount<=65536)errors.push(chunk);});
  const completion=new Promise((yes,no)=>{child.once('error',no);child.once('close',code=>yes(code));});
  child.stdin.on('error',()=>{});child.stdin.end(body);
  let code;
  try {code=await completion;} finally {clearTimeout(timer);clearTimeout(kill);}
  if(code!==0||timedOut||count>8*1024*1024) {
    let reported;try{reported=parseJson(Buffer.concat(errors));}catch{}
    throw fault(reported?.error?.code??(timedOut?'ARCHIVE_TIMEOUT':'ARCHIVE_TRANSPORT'),
      reported?.error?.message??'The original ZIP operation did not complete.',code===0?413:400,
      {exitCode:code,timedOut});
  }
  return parseJson(Buffer.concat(output),'Archive result');
}
export async function copyOriginal(input,output,{sha256,bytes}={}) {
  const source=resolve(input);
  if(await realpath(source)!==source)throw fault('ORIGINAL_ARCHIVE_SYMLINK','Choose the original regular archive file.');
  const handle=await open(source,constants.O_RDONLY|constants.O_NOFOLLOW);
  let target;
  try{
    const before=await handle.stat({bigint:true});
    if(!before.isFile()||before.size>BigInt(LIMITS.archiveBytes))throw fault('ARCHIVE_LIMIT','Choose a regular ZIP within the 512 MiB limit.',413);
    target=await open(output,'wx',0o600);
    const hash=createHash('sha256');let size=0;
    for await(const chunk of handle.createReadStream({autoClose:false,highWaterMark:65536})) {
      size+=chunk.length;if(size>LIMITS.archiveBytes)throw fault('ARCHIVE_LIMIT','The input grew beyond its size limit.',413);
      hash.update(chunk);await target.writeFile(chunk);
    }
    const after=await handle.stat({bigint:true}),actual=hash.digest('hex');
    if(before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs||BigInt(size)!==before.size)
      throw fault('SOURCE_CHANGED_DURING_READ','The original archive changed during receiving.',409);
    if(sha256!==undefined&&sha256!==actual||bytes!==undefined&&bytes!==size)
      throw fault('ORIGINAL_ARCHIVE_CHANGED','The received archive differs from the supplied original bytes.',409);
    await target.sync();return {sha256:actual,bytes:size};
  } finally {await target?.close();await handle.close();}
}
export async function unpackOriginal(file,destination,options={}) {
  await privateDirectory(destination,true);
  return archiveCommand({command:'unpack',file:resolve(file),destination},options);
}
async function descriptorBody(directory,d) {
  if(!object(d)||!['gzip','identity'].includes(d.encoding)||!HASH.test(d.sha256??'')||
      !HASH.test(d.storedSha256??'')||!natural(d.bytes,LIMITS.memberBytes)||!natural(d.storedBytes,LIMITS.memberBytes))
    throw fault('NATIVE_MEMBER_DESCRIPTOR','The native result descriptor is incomplete.');
  const stored=await readMember(directory,member(d.file));
  if(stored.length!==d.storedBytes||digest(stored)!==d.storedSha256)
    throw fault('NATIVE_MEMBER_CHANGED','A retained native member differs: '+d.file,409);
  let body;try{body=d.encoding==='gzip'?gunzipSync(stored,{maxOutputLength:LIMITS.memberBytes}):stored;}
  catch{throw fault('NATIVE_MEMBER_ENCODING','A retained gzip member cannot be decoded: '+d.file);}
  if(body.length!==d.bytes||digest(body)!==d.sha256)throw fault('NATIVE_MEMBER_CHANGED','The complete native output differs: '+d.file,409);
  return body;
}
export async function nativeBody(directory,descriptor){return descriptorBody(directory,descriptor);}
function jsonLines(body,label) {
  const text=new TextDecoder('utf-8',{fatal:true}).decode(body),lines=text.split('\n');
  if(lines.at(-1)==='')lines.pop();
  else if(body.length)throw fault('ORIGINAL_JSONL_TERMINATOR',label+' must retain its original final line feed.');
  if(lines.length>LIMITS.records)throw fault('RECORD_LIMIT','The original population exceeds 250,000 records.',413);
  return lines.map((line,index)=>{
    if(!line.trim())throw fault('EMPTY_JSONL_RECORD',label+' has an empty record.',400,{ordinal:index+1});
    const value=parseJson(Buffer.from(line),'Original '+label);
    if(!object(value))throw fault('JSONL_RECORD','Every original record must be an object.');
    return {value,raw:Buffer.from(line+'\n','utf8')};
  });
}
function exact(value,expected,code,message) {
  if(!isDeepStrictEqual(value,expected))throw fault(code,message,409);
}
function textIdentity(value,label) {
  if(typeof value!=='string'||!value.length||value.length>32768||/[\u0000-\u001f\u007f]/.test(value))
    throw fault('ORIGINAL_IDENTITY',label+' must retain its exact nonempty original string.');
  return value;
}
function titleOf(record) {
  const titles=record.resources?.flatMap(resource=>resource.titles??[])??[];
  const values=titles.map(value=>typeof value.content==='string'?value.content:
    Array.isArray(value.mixed)?value.mixed.map(p=>p['@content']??'').join(''):'').filter(Boolean);
  return values[0]??record.identifier;
}
function ensureRecordValues(value) {
  if(typeof value==='number'&&!Number.isSafeInteger(value))
    throw fault('NATIVE_NUMBER_PRECISION','Original metadata values must retain the published string encoding.');
  if(Array.isArray(value))for(const part of value)ensureRecordValues(part);
  else if(object(value))for(const part of Object.values(value))ensureRecordValues(part);
}
/** Validate an already completed original operation. No parser or transform runs. */
export async function readCompletedEdition({tree,manifestPath,sourcePath,label}) {
  member(manifestPath);member(sourcePath);
  const manifestBytes=await readMember(tree,manifestPath,LIMITS.manifestBytes);
  const manifest=parseJson(manifestBytes,'Native manifest'),directory=dirname(join(tree,manifestPath));
  const operationBytes=await readPrivate(join(directory,'operation.json'),LIMITS.manifestBytes);
  const operation=parseJson(operationBytes,'Native operation');
  if(manifest.schema!=='tjl.ciim.metadata-delivery.v1'||manifest.status!=='complete'||
      operation.schema!=='tjl.ciim.transform-operation.v1'||operation.status!=='complete'||
      operation.operationId!==manifest.operationId||operation.result?.file!=='manifest.json'||
      operation.result.sha256!==digest(manifestBytes)||!object(manifest.binding)||
      !Array.isArray(manifest.pages)||!Array.isArray(manifest.profiles)||!Array.isArray(manifest.issues))
    throw fault('COMPLETED_DELIVERY_REQUIRED','Choose a completed original CIIM delivery and operation.');
  exact(operation.binding,manifest.binding,'NATIVE_OPERATION_BINDING','The manifest and original operation differ.');
  exact(operation.receiving,manifest.receiving,'NATIVE_RECEIVING_BINDING','The original receiving selection differs.');
  const source=await readOaiSourceFile(join(tree,sourcePath),{loadDataset:false});
  if(source.sourceHash!==manifest.binding.sourceSha256||digest(source.captureBytes)!==manifest.binding.captureSha256)
    throw fault('NATIVE_SOURCE_BINDING','The native result belongs to a different original source.',409);
  for(const [name,expected]of Object.entries({schema:source.config.schema,repository:source.capture.repository,
      selection:source.capture.selection,edition:source.capture.edition,build:source.capture.build,inventory:source.files}))
    exact(manifest.source?.[name],expected,'NATIVE_SOURCE_BINDING','The native manifest changed its '+name+'.');
  if(!['oai_datacite','oai_dc'].includes(source.capture.selection.metadataPrefix))
    throw fault('NATIVE_PROFILE_FAMILY','This desk supports the original DataCite and Dublin Core result families.');
  const expectedSchema=source.capture.selection.metadataPrefix==='oai_datacite'?
    'tjl.ciim.datacite-record.v1':'tjl.ciim.dublin-core-record.v1';
  const observationsBody=await readPrivate(join(source.root,source.capture.recordsFile),LIMITS.memberBytes);
  if(digest(observationsBody)!==manifest.binding.observationSha256)throw fault('NATIVE_OBSERVATION_BINDING','The original observation file differs.',409);
  const observations=jsonLines(observationsBody,'observations').map(x=>x.value);
  const requests=jsonLines(await readPrivate(join(source.root,source.capture.requestsFile),LIMITS.memberBytes),'requests').map(x=>x.value);
  const requestMap=new Map(),observationMap=new Map(),identifiers=new Set();
  for(const request of requests){
    if(typeof request.id!=='string'||requestMap.has(request.id))throw fault('DUPLICATE_REQUEST','Original request IDs must be unique.');
    requestMap.set(request.id,request);
  }
  for(const observation of observations) {
    textIdentity(observation.identifier,'Identifier');textIdentity(observation.id,'Observation ID');
    if(identifiers.has(observation.identifier)||observationMap.has(observation.id)||
        observation.repositoryId!==source.capture.repository.id||observation.metadataPrefix!==source.capture.selection.metadataPrefix||
        !['active','deleted'].includes(observation.status)||!HASH.test(observation.sourceId??'')||
        !HASH.test(observation.semanticHash??'')||!Number.isSafeInteger(observation.ordinal)||observation.ordinal<1)
      throw fault('ORIGINAL_POPULATION_IDENTITY','The original edition repeats or changes an identity.');
    identifiers.add(observation.identifier);observationMap.set(observation.id,observation);
    const request=requestMap.get(observation.requestId);
    if(!request||request.state!=='PARSED'||!['ListRecords','GetRecord'].includes(request.verb)||
        request.response?.sha256!==observation.sourceId||request.response.xmlSourceId!==observation.sourceId)
      throw fault('ORIGINAL_REQUEST_BINDING','An observation is not bound to its original XML page.');
  }
  for(const [key,file]of [['configuration','config.json'],['xmlSpecification','xml-to-json.spec.json']]){
    if(manifest[key]?.file!==file||manifest[key].sha256!==manifest.binding[key==='configuration'?'configurationSha256':'xmlSpecificationSha256'])
      throw fault('NATIVE_PROFILE_BINDING','The original converter configuration differs.');
    if(digest(await readPrivate(join(directory,file),LIMITS.manifestBytes))!==manifest[key].sha256)
      throw fault('NATIVE_PROFILE_CHANGED','The original converter configuration bytes differ.',409);
  }
  const profiles=new Map();
  for(const descriptor of manifest.profiles) {
    const body=await descriptorBody(directory,descriptor),sha=digest(body);
    if(descriptor.encoding!=='identity'||descriptor.file!=='profiles/'+sha+'.json'||profiles.has(sha)||
        !isDeepStrictEqual(operation.profiles?.[sha],descriptor))
      throw fault('NATIVE_PROFILE_BINDING','The operation and original profile inventory differ.');
    profiles.set(sha,{...descriptor,sha256:sha,specification:parseJson(body,'Native profile')});
  }
  if(Object.keys(operation.profiles??{}).length!==profiles.size)throw fault('NATIVE_PROFILE_BINDING','The operation has a different profile population.');
  const pageMap=new Map(),mappedByObservation=new Map(),issues=[],propertyCounts={},runtime=new Map();
  for(const page of manifest.pages) {
    const saved=operation.pages?.[page.requestId],request=requestMap.get(page.requestId);
    if(!saved||!request||pageMap.has(page.requestId)||!Array.isArray(page.profiles)||
        new Set(page.profiles).size!==page.profiles.length||page.profiles.some(sha=>!profiles.has(sha)))
      throw fault('NATIVE_PAGE_BINDING','Every completed native page needs one original request and profile binding.');
    const {issues:pageIssues,propertyCounts:pageCounts,...savedDescriptor}=saved;
    exact(page,savedDescriptor,'NATIVE_PAGE_BINDING','The completed page and manifest differ.');
    exact(page.page,request.response,'NATIVE_PAGE_BINDING','A completed page changed the original response identity.');
    exact(page.runtime,manifest.binding.runtime,'NATIVE_RUNTIME_BINDING','The original runtime changed between pages.');
    if(page.requestSha256!==digest(jsonBytes(request))||
        page.conversion?.file!=='native-pages/'+request.response.sha256+'.json.gz'||
        page.mapped?.file!=='mapped-pages/'+request.id+'.jsonl.gz')
      throw fault('NATIVE_PAGE_BINDING','The original request or native member locations differ.');
    const raw=await readPrivate(join(source.root,member(request.response.path)),LIMITS.memberBytes);
    if(digest(raw)!==request.response.sha256||request.response.bytes!==undefined&&raw.length!==request.response.bytes)
      throw fault('ORIGINAL_XML_CHANGED','The original XML response differs.',409);
    parseJson(await descriptorBody(directory,page.conversion),'Native XML conversion');
    const mapped=jsonLines(await descriptorBody(directory,page.mapped),'native mapped records');
    const wanted=observations.filter(x=>x.requestId===page.requestId);
    if(mapped.length!==wanted.length)throw fault('NATIVE_PAGE_COVERAGE','A mapped page differs from its original selected population.');
    for(let index=0;index<mapped.length;index++){
      const row=mapped[index],record=row.value,observation=wanted[index];
      ensureRecordValues(record);
      exact(record.observation,observation,'NATIVE_RECORD_BINDING','A mapped record changed its original observation.');
      if(record.schema!==expectedSchema||record.identifier!==observation.identifier||record.status!==observation.status||
          record.datestamp!==observation.datestamp||!Array.isArray(record.resources)||
          record.status==='deleted'&&record.resources.length!==0||
          !isDeepStrictEqual(record.setSpecs,observation.setSpecs)||mappedByObservation.has(observation.id))
        throw fault('NATIVE_RECORD_BINDING','A native record changed its identity, state or lexical metadata.');
      const provenance=record.provenance;
      if(provenance?.sourceSha256!==source.sourceHash||provenance.captureSha256!==manifest.binding.captureSha256||
          provenance.requestId!==request.id||provenance.ordinal!==observation.ordinal)
        throw fault('NATIVE_RECORD_PROVENANCE','A record changed its original source or page.');
      exact(provenance.repository,source.capture.repository,'NATIVE_RECORD_PROVENANCE','The repository changed.');
      exact(provenance.selection,source.capture.selection,'NATIVE_RECORD_PROVENANCE','The selected source interval changed.');
      exact(provenance.edition,source.capture.edition,'NATIVE_RECORD_PROVENANCE','The reviewed edition changed.');
      exact(provenance.build,source.capture.build,'NATIVE_RECORD_PROVENANCE','The native build changed.');
      exact(provenance.page,request.response,'NATIVE_RECORD_PROVENANCE','The record page changed.');
      mappedByObservation.set(observation.id,row);
    }
    if(!Array.isArray(pageIssues)||!object(pageCounts))throw fault('NATIVE_PAGE_COUNTS','The original page issues/counts are incomplete.');
    issues.push(...pageIssues);
    for(const [key,count]of Object.entries(pageCounts)){
      if(!natural(count))throw fault('NATIVE_PAGE_COUNTS','Original property counts must be exact integers.');
      propertyCounts[key]=(propertyCounts[key]??0)+count;
    }
    runtime.set(identity(page.runtime),page.runtime);pageMap.set(page.requestId,page);
  }
  if(Object.keys(operation.pages??{}).length!==pageMap.size||mappedByObservation.size!==observations.length)
    throw fault('NATIVE_POPULATION_COVERAGE','All original observations must occur once in the completed output.');
  exact(manifest.issues,issues,'NATIVE_ISSUES_BINDING','The manifest omitted or changed original source issues.');
  exact(manifest.runtime,[...runtime.values()],'NATIVE_RUNTIME_BINDING','The complete runtime inventory differs.');
  const full=await descriptorBody(directory,manifest.records),fullRows=jsonLines(full,'complete mapped records');
  const ordered=observations.map(observation=>mappedByObservation.get(observation.id));
  if(fullRows.length!==ordered.length||fullRows.some((row,index)=>!row.raw.equals(ordered[index].raw)))
    throw fault('NATIVE_COMPLETE_BYTES','The complete JSONL must preserve every original mapped row, byte for byte.');
  const active=observations.filter(x=>x.status==='active').length,deleted=observations.length-active;
  if(active!==source.capture.edition.activeRecords||deleted!==source.capture.edition.deletedRecords)
    throw fault('ORIGINAL_EDITION_COUNTS','The original captured population counts differ.');
  exact(manifest.counts,{records:observations.length,active,deleted,properties:propertyCounts},
    'NATIVE_POPULATION_COUNTS','The completed native population or property counts differ.');
  if(manifest.report)await descriptorBody(directory,manifest.report);
  const manifestSha256=digest(manifestBytes);
  const id=identity(['tjl.ciim.received-edition.v1',manifestSha256,source.sourceHash]);
  const records=fullRows.map((row,index)=>{
    const native=row.value,recordId=identity(['tjl.ciim.received-record.v1',id,native.observation.id,native.identifier]);
    return {id:recordId,editionId:id,identifier:native.identifier,observationId:native.observation.id,
      ordinal:index+1,status:native.status,datestamp:native.datestamp,title:titleOf(native),
      resourceCount:native.resources.length,issueCount:issues.filter(x=>x.observationId===native.observation.id).length,
      recordSha256:digest(row.raw),raw:row.raw,native};
  });
  const populationDigest=identity(records.map(x=>[x.id,x.recordSha256,x.observationId,x.identifier,x.status]));
  return {id,label:typeof label==='string'&&label?label:source.capture.repository.id+' / '+source.capture.selection.metadataPrefix,
    manifestPath,sourcePath,resultDirectory:relative(tree,directory).split('\\').join('/'),
    sourceRoot:relative(tree,source.root).split('\\').join('/'),repository:source.capture.repository,
    selection:source.capture.selection,nativeEditionId:source.capture.edition.id,operationId:manifest.operationId,
    manifestSha256,sourceSha256:source.sourceHash,captureSha256:manifest.binding.captureSha256,
    counts:manifest.counts,populationDigest,manifest,operation,profiles:[...profiles.values()],records};
}
function verifyInventory(manifest,inventory,self) {
  if(!Array.isArray(manifest.members)||manifest.members.length!==inventory.length-1)
    throw fault('PACKAGE_INVENTORY','The package manifest must cover every other original file.');
  const actual=new Map(inventory.map(x=>[x.file,x])),seen=new Set();
  for(const expected of manifest.members){
    const name=member(expected.file);
    if(name===self||seen.has(name)||!natural(expected.bytes)||!HASH.test(expected.sha256??'')||
        !isDeepStrictEqual(actual.get(name),{file:name,bytes:expected.bytes,sha256:expected.sha256}))
      throw fault('PACKAGE_INVENTORY','The complete original archive inventory differs.',409,{file:name});
    seen.add(name);
  }
}
export async function inspectUnpacked({tree,inventory}) {
  const entries=new Map(inventory.map(x=>[x.file,x]));
  if(entries.has('desk-package.json')){
    const envelope=parseJson(await readMember(tree,'desk-package.json',LIMITS.manifestBytes));
    if(envelope.schema!=='tjl.ciim.desk-package.v1'||!['workspace','handback'].includes(envelope.kind))
      throw fault('DESK_PACKAGE_SCHEMA','Choose a supported complete receiving desk package.');
    verifyInventory(envelope,inventory,'desk-package.json');
    if(envelope.stateFile!=='desk-state.json'||!entries.has(envelope.stateFile))throw fault('DESK_STATE_REQUIRED','The complete retained desk state is missing.');
    const stateBytes=await readMember(tree,envelope.stateFile,LIMITS.stateBytes);
    if(digest(stateBytes)!==envelope.stateSha256)throw fault('DESK_STATE_CHANGED','The retained desk state differs.',409);
    const snapshot=parseJson(stateBytes,'Retained desk state');
    if(snapshot.schema!=='tjl.ciim.desk-snapshot.v1'||snapshot.workspaceId!==envelope.workspaceId||snapshot.revision!==envelope.revision)
      throw fault('DESK_STATE_BINDING','The portable workspace identity differs.');
    return {kind:envelope.kind,envelope,snapshot,editions:[],inventory};
  }
  const caseFiles=inventory.filter(x=>x.file.endsWith('/CASE-MANIFEST.json')||x.file==='CASE-MANIFEST.json');
  if(caseFiles.length!==1)throw fault('NATIVE_CASE_MANIFEST','Choose a complete CIIM case ZIP with its original CASE-MANIFEST.json.');
  const casePath=caseFiles[0].file,caseManifest=parseJson(await readMember(tree,casePath,LIMITS.manifestBytes));
  if(caseManifest.schema!=='tjl.ciim.receiving-case-package.v1'||caseManifest.status!=='complete')
    throw fault('NATIVE_CASE_MANIFEST','The original CIIM case is incomplete.');
  verifyInventory(caseManifest,inventory,casePath);
  const nativePath=member(caseManifest.nativeResult),native=parseJson(await readMember(tree,nativePath,LIMITS.manifestBytes));
  if(native.schema!=='tjl.ciim.original-native-operation.v1'||native.status!=='complete'||!Array.isArray(native.sources))
    throw fault('NATIVE_CASE_RESULT','The original complete native result is missing.');
  const sourceCandidates=inventory.filter(x=>x.file.endsWith('/source.json')||x.file==='source.json');
  const manifests=inventory.filter(x=>x.file.endsWith('/manifest.json')||x.file==='manifest.json');
  const editions=[];
  for(const descriptor of manifests){
    let manifest;try{manifest=parseJson(await readMember(tree,descriptor.file,LIMITS.manifestBytes));}catch(error){if(error.code==='INVALID_JSON')continue;throw error;}
    if(manifest.schema!=='tjl.ciim.metadata-delivery.v1')continue;
    const accepted=native.sources.filter(x=>x.operationId===manifest.operationId&&x.manifestSha256===descriptor.sha256);
    if(!accepted.length)continue;
    if(accepted.length!==1)throw fault('NATIVE_CASE_DUPLICATE','The completed native source selection repeats.');
    for(const key of ['counts','records','report'])exact(accepted[0][key],manifest[key],'NATIVE_CASE_BINDING','The completed native result changed its '+key+'.');
    exact(native.runtime,manifest.binding?.runtime,'NATIVE_CASE_RUNTIME','The completed native operation uses a different retained runtime.');
    const candidates=sourceCandidates.filter(x=>x.sha256===manifest.binding?.sourceSha256);
    if(candidates.length===0)throw fault('ORIGINAL_SOURCE_MISSING','The native delivery lacks its exact source.json.');
    let selected;
    for(const candidate of candidates){
      const edition=await readCompletedEdition({tree,manifestPath:descriptor.file,sourcePath:candidate.file,
        label:typeof accepted[0].name==='string'&&accepted[0].name?accepted[0].name:undefined});
      if(selected&&selected.id!==edition.id)throw fault('ORIGINAL_SOURCE_AMBIGUOUS','The original source copies disagree.');
      selected??=edition;
    }
    if(editions.some(x=>x.id===selected.id))throw fault('NATIVE_EDITION_DUPLICATE','The archive repeats a completed delivery identity.');
    editions.push(selected);
  }
  if(editions.length!==native.sources.length||!editions.length)
    throw fault('NATIVE_CASE_COVERAGE','Every original completed delivery must be included once.');
  return {kind:'native',caseManifest,native,editions,inventory};
}
export function editionSummary(edition) {
  const {records,manifest,operation,profiles,...summary}=edition;
  return {...summary,profiles:profiles.map(({specification,...descriptor})=>descriptor),
    originalReceiving:manifest.receiving,binding:manifest.binding,issues:manifest.issues};
}
export async function createZip({output,files,manifest,python='python3'}) {
  await privateDirectory(dirname(output),true);
  return archiveCommand({command:'pack',output,files,manifest},{python});
}
export async function fileDescriptor(file,path) {
  const actual=await hashPrivate(file,LIMITS.archiveBytes);
  return {path,file,bytes:actual.bytes,sha256:actual.hash};
}
