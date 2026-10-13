// MIT. Retained CIIM receiving desk: original results plus named staff decisions.
import {DatabaseSync} from 'node:sqlite';
import {mkdir,lstat,chmod,rename,rm,open,readFile} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
import {privateDirectory,acquireWorkspace,readPrivate,readJson,createFile,syncDirectory,atomicJson,
  digest,identity,canonical,object,stamp,hashPrivate} from '../../postgres/publisher/files.mjs';
import {LIMITS,HASH,fault,jsonBytes,parseJson,member,copyOriginal,unpackOriginal,
  inspectUnpacked,readCompletedEdition,editionSummary,readMember,nativeBody,createZip,fileDescriptor} from './portable.mjs';

export {LIMITS};
const SCHEMA='tjl.ciim.receiving-desk.v1';
const MARKER='desk.json';
const NOTE=8192;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const clone=value=>structuredClone(value);
const text=(value,name,maximum=512)=>{
  if(typeof value!=='string'||!value.trim()||value.length>maximum||(maximum===NOTE?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(value))
    throw fault('TEXT_REQUIRED','Enter '+name+'.',400,{field:name});
  return value;
};
const optionalText=(value,name,maximum=2048)=>value===null||value===undefined||value===''?null:text(value,name,maximum);
const opaque=(value,name)=>text(value,name,32768);
function only(value,keys,label) {
  if(!object(value)||Object.keys(value).some(key=>!keys.includes(key)))throw fault('OPERATION_FIELDS','Use the declared '+label+' fields.');
}
function uniqueIds(values,label,maximum=LIMITS.records) {
  if(!Array.isArray(values)||!values.length||values.length>maximum)throw fault('SELECTION_REQUIRED','Choose '+label+'.');
  const out=values.map(value=>opaque(value,label));
  if(new Set(out).size!==out.length)throw fault('DUPLICATE_SELECTION','Choose each '+label+' once.');
  return out;
}
function reference(value,label,{version=false}={}) {
  if(value===null)return null;
  only(value,version?['name','reference','version']:['name','reference'],label);
  return {name:text(value.name,label+' name'),reference:text(value.reference,label+' reference',4096),
    ...(version?{version:text(value.version,label+' version')}: {})};
}
function contextDigest(context) {
  return identity({institution:context.institution,receivingEnvironment:context.receivingEnvironment,
    processingProfile:context.processingProfile,authorities:context.authorities});
}
const contextEmpty=()=>({label:'CIIM receiving desk',institution:null,receivingEnvironment:null,
  processingProfile:null,authorities:[],note:null});
const actions=Object.freeze(['context.save','intake.import','workspace.restore','edition.review','profile.review',
  'records.review','comparison.create','comparison.review','handback.create']);
export function describeCiimDesk() {
  return {schema:'tjl.ciim.desk-description.v1',workspaceSchema:SCHEMA,marker:MARKER,
    actions:[...actions],limits:{...LIMITS},decisions:{edition:['accept','needs_changes','reopen'],
      profile:['accept','needs_changes','reopen'],record:['accept','exclude','needs_changes','reopen'],
      comparison:['accept','needs_changes','reopen']},
    views:['imports','editions','records','profiles','comparison','history','handbacks'],
    recordFilters:['all','active','deleted','issues','unreviewed','accept','exclude','needs_changes','reopen'],
    comparisonFilters:['all','added','not_present','withdrawn','restored','changed','unchanged'],
    attachmentKinds:['xml','native','mapped','profile','manifest','operation','source'],
    originalIdentity:{fields:['repository.id','selection.metadataPrefix','identifier'],normalization:'none',
      deleted:'An explicit original deleted OAI header',notPresent:'Outside this edition; no deletion inferred',
      values:'Original strings, ordered arrays, null and absence are retained separately.'},
    handbackArchivePolicy:'The complete original input ZIPs are retained alongside the selected review scope. Their full native-edition coverage is listed in each handback.',
    reviewRules:['A named authority and reason accompany every decision.',
      'Whole-edition acceptance supplies the initial review for its full population.',
      'Later explicit record decisions override that population review.',
      'Institution, receiving environment, processing profile and authority changes make earlier current reviews stale.',
      'A draft workspace export remains available throughout. Historical handbacks retain their original review revision.']};
}
async function exists(path) {try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
function unpack(row){return row?JSON.parse(row.data):null;}
function errorResult(issue){return {code:issue.code??'DESK_OPERATION_FAILED',message:issue.message,status:issue.status??500,details:issue.details??{}};}
const ptr=key=>String(key).replace(/~/g,'~0').replace(/\//g,'~1');
function differences(before,after,path='',beforePresent=true,afterPresent=true,out=[],depth=0) {
  if(depth>256)throw fault('METADATA_DEPTH','The original metadata exceeds the comparison depth limit.',413);
  if(beforePresent===afterPresent&&isDeepStrictEqual(before,after))return out;
  if(beforePresent&&afterPresent&&Array.isArray(before)&&Array.isArray(after)){
    for(let i=0;i<Math.max(before.length,after.length);i++)
      differences(before[i],after[i],path+'/'+i,i<before.length,i<after.length,out,depth+1);
  }else if(beforePresent&&afterPresent&&object(before)&&object(after)){
    for(const key of [...new Set([...Object.keys(before),...Object.keys(after)])].sort())
      differences(before[key],after[key],path+'/'+ptr(key),own(before,key),own(after,key),out,depth+1);
  }else{
    out.push({path,before:{present:beforePresent,...(beforePresent?{value:before}:{})},
      after:{present:afterPresent,...(afterPresent?{value:after}:{})}});
  }
  if(out.length>1000000)throw fault('COMPARISON_LIMIT','The complete comparison exceeds one million property changes.',413);
  return out;
}
function compareProjection(record) {
  return Object.fromEntries(['status','datestamp','setSpecs','wrapper','resources','sourceAbout','originalRecord']
    .filter(key=>own(record,key)).map(key=>[key,record[key]]));
}
function recordPointer(row) {return row?{recordId:row.id,observationId:row.observationId,status:row.status,
  datestamp:row.datestamp,recordSha256:row.recordSha256}:null;}

function buildComparison(before,after,label,createdAt,actor) {
  if(before.id===after.id||before.repository.id!==after.repository.id||before.selection.metadataPrefix!==after.selection.metadataPrefix)
    throw fault('COMPARISON_SOURCE_SCOPE','Choose different editions of the same original repository and metadata prefix.');
  const left=new Map(before.records.map(x=>[x.identifier,x])),right=new Map(after.records.map(x=>[x.identifier,x]));
  const id=identity(['tjl.ciim.edition-comparison.v1',before.id,before.populationDigest,after.id,after.populationDigest]);
  const rows=[],counts={records:0,added:0,not_present:0,withdrawn:0,restored:0,changed:0,unchanged:0};
  for(const identifier of [...new Set([...left.keys(),...right.keys()])].sort()){
    const prior=left.get(identifier),next=right.get(identifier);
    const changes=prior&&next?differences(compareProjection(prior.native),compareProjection(next.native)):[];
    const change=!prior?'added':!next?'not_present':prior.status==='active'&&next.status==='deleted'?'withdrawn':
      prior.status==='deleted'&&next.status==='active'?'restored':changes.length?'changed':'unchanged';
    rows.push({id:identity([id,identifier]),identifier,change,before:recordPointer(prior),after:recordPointer(next),changes});
    counts.records++;counts[change]++;
  }
  return {id,label,beforeEditionId:before.id,afterEditionId:after.id,
    beforePopulationDigest:before.populationDigest,afterPopulationDigest:after.populationDigest,
    repositoryId:before.repository.id,metadataPrefix:before.selection.metadataPrefix,
    counts,populationDigest:identity(rows),rows,createdAt,actor};
}

export async function openCiimDesk({directory,create=false,python='python3'}={}) {
  if(typeof directory!=='string'||resolve(directory)!==directory||directory==='/')throw fault('ABSOLUTE_PATH_REQUIRED','Choose an absolute private desk directory.');
  if(typeof create!=='boolean'||typeof python!=='string'||!python)throw fault('DESK_OPTIONS','Use the declared desk options.');
  const present=await exists(directory);
  if(create&&present)throw fault('DESK_EXISTS','Open the retained desk without --create.',409);
  if(!create&&!present)throw fault('DESK_NOT_FOUND','Choose the existing receiving desk.',404);
  await privateDirectory(directory,create);
  const release=await acquireWorkspace(directory);
  let db;
  try{
    const database=join(directory,'desk.sqlite');
    if(!create){
      await readPrivate(join(directory,MARKER),4096);
      const s=await lstat(database);
      if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.mode&0o077)throw fault('PRIVATE_DATABASE_REQUIRED','The original desk database must remain private.');
    }
    db=new DatabaseSync(database);await chmod(database,0o600);
    db.exec([
      'PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;',
      'CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY,data TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,data TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS editions(id TEXT PRIMARY KEY,import_id TEXT NOT NULL,data TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,edition_id TEXT NOT NULL,identifier TEXT NOT NULL,ordinal INTEGER NOT NULL,status TEXT NOT NULL,datestamp TEXT NOT NULL,title TEXT NOT NULL,issue_count INTEGER NOT NULL,data TEXT NOT NULL,body BLOB NOT NULL,UNIQUE(edition_id,identifier),UNIQUE(edition_id,ordinal));',
      'CREATE INDEX IF NOT EXISTS records_by_edition ON records(edition_id,ordinal);',
      'CREATE TABLE IF NOT EXISTS reviews(scope TEXT NOT NULL,subject TEXT NOT NULL,edition_id TEXT,decision TEXT NOT NULL,context_digest TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(scope,subject));',
      'CREATE TABLE IF NOT EXISTS comparisons(id TEXT PRIMARY KEY,data TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS comparison_rows(id TEXT PRIMARY KEY,comparison_id TEXT NOT NULL,identifier TEXT NOT NULL,ordinal INTEGER NOT NULL,change TEXT NOT NULL,data BLOB NOT NULL,UNIQUE(comparison_id,identifier));',
      'CREATE INDEX IF NOT EXISTS comparison_population ON comparison_rows(comparison_id,ordinal);',
      'CREATE TABLE IF NOT EXISTS handbacks(id TEXT PRIMARY KEY,data TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS handback_files(id TEXT PRIMARY KEY,sha256 TEXT NOT NULL,bytes INTEGER NOT NULL);',
      'CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,revision INTEGER NOT NULL UNIQUE,request_hash TEXT NOT NULL,type TEXT NOT NULL,actor TEXT NOT NULL,created TEXT NOT NULL,request TEXT NOT NULL,result TEXT NOT NULL);'
    ].join('\n'));
    const putMeta=(key,value)=>db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
    const getMeta=key=>{const row=db.prepare('SELECT value FROM meta WHERE key=?').get(key);return row?JSON.parse(row.value):null;};
    function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
    if(create){
      const createdAt=stamp(),workspaceId=randomUUID();
      transaction(()=>{putMeta('schema',SCHEMA);putMeta('workspaceId',workspaceId);putMeta('revision',0);
        putMeta('createdAt',createdAt);putMeta('updatedAt',createdAt);putMeta('context',contextEmpty());});
      await createFile(join(directory,MARKER),jsonBytes({schema:SCHEMA,workspaceId,createdAt}));
      for(const name of ['candidates','exports'])await privateDirectory(join(directory,name),true);
      await syncDirectory(directory);
    }
    async function repairMarker() {
      const pending=getMeta('pendingMarker');
      if(!pending)return;
      const current=await readJson(join(directory,MARKER),4096);
      if(!object(pending.old)||!object(pending.next)||pending.next.schema!==SCHEMA||
          pending.next.workspaceId!==getMeta('workspaceId')||pending.next.createdAt!==getMeta('createdAt')||
          !isDeepStrictEqual(current,pending.old)&&!isDeepStrictEqual(current,pending.next))
        throw fault('RESTORE_MARKER_CHANGED','The original receiving marker changed during recovery.',409);
      if(!isDeepStrictEqual(current,pending.next))await atomicJson(directory,MARKER,pending.next);
      transaction(()=>putMeta('pendingMarker',null));
    }
    await repairMarker();
    const marker=await readJson(join(directory,MARKER),4096);
    if(getMeta('schema')!==SCHEMA||marker.schema!==SCHEMA||getMeta('workspaceId')!==marker.workspaceId||
        getMeta('createdAt')!==marker.createdAt||!Number.isSafeInteger(getMeta('revision')))
      throw fault('DESK_BINDING_CHANGED','The retained workspace marker and database disagree.',409);
    await privateDirectory(join(directory,'candidates'));await privateDirectory(join(directory,'exports'));
    let admission=true,closed=false,closing=null,tail=Promise.resolve();
    const editionCache=new Map();
    const available=()=>{if(closed)throw fault('DESK_CLOSED','This receiving desk is closed.',409);};
    const currentRevision=()=>getMeta('revision');
    const currentContext=()=>getMeta('context');
    const currentContextDigest=()=>contextDigest(currentContext());
    function serialize(fn){if(!admission||closed)throw fault('DESK_CLOSED','This receiving desk is closed.',409);const result=tail.then(()=>{if(closed)throw fault('DESK_CLOSED','This receiving desk is closed.',409);return fn();});tail=result.catch(()=>{});return result;}
    function candidate(id){const value=unpack(db.prepare('SELECT data FROM candidates WHERE id=?').get(id));if(!value)throw fault('CANDIDATE_NOT_FOUND','Choose a retained import preview.',404);return value;}
    function edition(id){const value=unpack(db.prepare('SELECT data FROM editions WHERE id=?').get(id));if(!value)throw fault('EDITION_NOT_FOUND','Choose an original received edition.',404);return value;}
    function comparison(id){const value=unpack(db.prepare('SELECT data FROM comparisons WHERE id=?').get(id));if(!value)throw fault('COMPARISON_NOT_FOUND','Choose a retained comparison.',404);return value;}
    function handback(id){const value=unpack(db.prepare('SELECT data FROM handbacks WHERE id=?').get(id));if(!value)throw fault('HANDBACK_NOT_FOUND','Choose a retained reviewed handback.',404);return value;}
    function review(scope,subject) {
      const value=unpack(db.prepare('SELECT data FROM reviews WHERE scope=? AND subject=?').get(scope,subject));
      return value?{...value,stale:value.contextDigest!==currentContextDigest()}:null;
    }
    function effectiveReview(recordSummary) {
      const ownReview=review('record',recordSummary.id),whole=review('edition',recordSummary.editionId);
      const selected=ownReview&&!ownReview.stale?ownReview:whole&&!whole.stale?whole:null;
      return {review:selected??ownReview??whole,effectiveDecision:selected?.decision??'unreviewed'};
    }
    function rawRecord(row) {
      if(!row)throw fault('RECORD_NOT_FOUND','Choose an original retained record.',404);
      const summary=JSON.parse(row.data),raw=gunzipSync(Buffer.from(row.body),{maxOutputLength:LIMITS.memberBytes});
      if(digest(raw)!==summary.recordSha256)throw fault('RETAINED_RECORD_CHANGED','The retained original record differs.',409);
      return {summary,raw,native:parseJson(raw,'Native mapped record')};
    }
    function recordsFor(editionId) {
      edition(editionId);
      return db.prepare('SELECT * FROM records WHERE edition_id=? ORDER BY ordinal').all(editionId).map(rawRecord);
    }
    function recordSummary(row) {const value=JSON.parse(row.data);return {...value,...effectiveReview(value)};}
    async function loadEdition(editionId) {
      const saved=edition(editionId);
      if(editionCache.has(editionId))return editionCache.get(editionId);
      const input=candidate(saved.candidateId),tree=join(directory,'candidates',input.id,'tree');
      const live=await readCompletedEdition({tree,manifestPath:saved.manifestPath,sourcePath:saved.sourcePath,label:saved.label});
      if(live.id!==saved.id||live.populationDigest!==saved.populationDigest)throw fault('RETAINED_EDITION_CHANGED','The original edition bytes differ.',409);
      const rows=db.prepare('SELECT id,data FROM records WHERE edition_id=? ORDER BY ordinal').all(editionId);
      if(rows.length!==live.records.length||rows.some((row,i)=>{const {raw,native,...expected}=live.records[i];return row.id!==expected.id||!isDeepStrictEqual(JSON.parse(row.data),expected);}))
        throw fault('RETAINED_POPULATION_CHANGED','The retained record index differs from the complete original edition.',409);
      editionCache.set(editionId,live);return live;
    }
    function populationCounts(editionId) {
      const rows=db.prepare('SELECT data FROM records WHERE edition_id=? ORDER BY ordinal').all(editionId);
      const counts={records:rows.length,active:0,deleted:0,accepted:0,excluded:0,unreviewed:0,needs_changes:0,reopen:0,issues:0};
      for(const row of rows){
        const value=JSON.parse(row.data),selected=effectiveReview(value).effectiveDecision;
        counts[value.status]++;counts[selected==='accept'?'accepted':selected==='exclude'?'excluded':selected]++;
        if(value.issueCount)counts.issues++;
      }
      return counts;
    }
    function readiness(editionId) {
      const item=edition(editionId),context=currentContext(),selected=review('edition',editionId),missing=[];
      if(!context.institution)missing.push({code:'INSTITUTION_REQUIRED',message:'Enter the institution and its reference.'});
      if(!context.receivingEnvironment)missing.push({code:'ENVIRONMENT_REQUIRED',message:'Enter the receiving environment and its reference.'});
      if(!context.processingProfile)missing.push({code:'PROCESSING_PROFILE_REQUIRED',message:'Enter the institutional processing profile and version.'});
      if(!selected||selected.stale||selected.decision!=='accept')missing.push({code:'EDITION_REVIEW_REQUIRED',message:'Review the complete original edition.'});
      for(const profile of item.profiles){
        const decision=review('profile',editionId+':'+profile.sha256);
        if(!decision||decision.stale||decision.decision!=='accept')
          missing.push({code:'PROFILE_REVIEW_REQUIRED',profileSha256:profile.sha256,message:'Review this original Proteus profile.'});
      }
      const counts=populationCounts(editionId);
      if(counts.unreviewed||counts.needs_changes||counts.reopen)
        missing.push({code:'RECORD_REVIEW_REQUIRED',message:'Resolve the remaining original record decisions.',counts});
      return {ready:missing.length===0,missing,counts};
    }
    function state() {
      available();
      const context=currentContext(),revision=currentRevision();
      const imports=db.prepare('SELECT data FROM imports ORDER BY rowid').all().map(unpack);
      const editions=db.prepare('SELECT data FROM editions ORDER BY rowid').all().map(row=>{
        const value=unpack(row);return {...value,review:review('edition',value.id),readiness:readiness(value.id)};
      });
      const comparisons=db.prepare('SELECT data FROM comparisons ORDER BY rowid').all().map(row=>{
        const value=unpack(row);return {...value,review:review('comparison',value.id)};
      });
      const handbacks=db.prepare('SELECT data FROM handbacks ORDER BY rowid').all().map(row=>{
        const {frozen,...value}=unpack(row);return value;
      });
      return {schema:'tjl.ciim.desk-state.v1',workspaceId:getMeta('workspaceId'),revision,
        createdAt:getMeta('createdAt'),updatedAt:getMeta('updatedAt'),context,contextDigest:contextDigest(context),
        imports,editions,comparisons,handbacks,limits:{...LIMITS}};
    }
    function pageOptions(options) {
      const offset=options.offset??0,limit=options.limit??50;
      if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>LIMITS.pageSize)
        throw fault('PAGE_OPTIONS','Use a nonnegative offset and 1–250 records per page.');
      const query=options.query??'',status=options.status??'all';
      if(typeof query!=='string'||query.length>2048||typeof status!=='string')throw fault('PAGE_OPTIONS','Use the declared search and filter fields.');
      return {offset,limit,query,status};
    }
    async function view(options={}) {
      available();only(options,['view','editionId','comparisonId','offset','limit','status','query'],'view');
      const selected=options.view??'editions',{offset,limit,query,status}=pageOptions(options),revision=currentRevision();
      let items,counts,populationDigest;
      if(selected==='records'){
        const item=edition(opaque(options.editionId,'edition'));await loadEdition(item.id);
        if(!describeCiimDesk().recordFilters.includes(status))throw fault('RECORD_FILTER','Choose a declared record filter.');
        items=db.prepare('SELECT data FROM records WHERE edition_id=? ORDER BY ordinal').all(item.id).map(recordSummary);
        counts=populationCounts(item.id);populationDigest=item.populationDigest;
        if(query){const q=query.toLocaleLowerCase();items=items.filter(x=>[x.identifier,x.observationId,x.title,x.datestamp].some(v=>String(v).toLocaleLowerCase().includes(q)));}
        if(status!=='all')items=items.filter(x=>status==='active'||status==='deleted'?x.status===status:status==='issues'?x.issueCount>0:x.effectiveDecision===status);
      }else if(selected==='profiles'){
        const item=await loadEdition(opaque(options.editionId,'edition'));
        items=item.profiles.map(value=>({...value,review:review('profile',item.id+':'+value.sha256)}));
      }else if(selected==='comparison'){
        const item=comparison(opaque(options.comparisonId,'comparison'));
        if(!describeCiimDesk().comparisonFilters.includes(status))throw fault('COMPARISON_FILTER','Choose a declared comparison filter.');
        const parameters=[item.id];let where='comparison_id=?';
        if(status!=='all'){where+=' AND change=?';parameters.push(status);}
        if(query){where+=' AND instr(lower(identifier),lower(?))>0';parameters.push(query);}
        const total=Number(db.prepare('SELECT count(*) n FROM comparison_rows WHERE '+where).get(...parameters).n);
        const rows=db.prepare('SELECT data FROM comparison_rows WHERE '+where+' ORDER BY ordinal LIMIT ? OFFSET ?').all(...parameters,limit,offset);
        return {revision,view:selected,total,offset,limit,items:rows.map(row=>parseJson(gunzipSync(Buffer.from(row.data),{maxOutputLength:LIMITS.memberBytes}))),
          counts:item.counts,populationDigest:item.populationDigest};
      }else if(selected==='history'){
        const total=Number(db.prepare('SELECT count(*) n FROM operations').get().n);
        const rows=db.prepare('SELECT * FROM operations ORDER BY revision DESC LIMIT ? OFFSET ?').all(limit,offset);
        return {revision,view:selected,total,offset,limit,items:rows.map(row=>({operationId:row.id,revision:row.revision,type:row.type,
          actor:row.actor,createdAt:row.created,request:JSON.parse(row.request),result:JSON.parse(row.result)}))};
      }else if(['imports','editions','handbacks'].includes(selected))items=state()[selected];
      else throw fault('VIEW_NOT_FOUND','Choose a declared desk view.',404);
      if(query&&selected!=='records'){const q=query.toLocaleLowerCase();items=items.filter(x=>JSON.stringify(x).toLocaleLowerCase().includes(q));}
      return {revision,view:selected,total:items.length,offset,limit,items:items.slice(offset,offset+limit),
        ...(counts?{counts}:{}),...(populationDigest?{populationDigest}:{})};
    }
    async function record({editionId,recordId}={}) {
      available();const original=await loadEdition(opaque(editionId,'edition'));
      const value=rawRecord(db.prepare('SELECT * FROM records WHERE id=? AND edition_id=?').get(opaque(recordId,'record'),editionId));
      const page=original.manifest.pages.find(x=>x.requestId===value.native.provenance.requestId);
      return {...value.summary,...effectiveReview(value.summary),native:value.native,
        issues:original.manifest.issues.filter(x=>x.observationId===value.summary.observationId),
        provenance:value.native.provenance,profileSha256s:page.profiles,
        source:{requestId:page.requestId,page:page.page}};
    }

    function publicCandidate(value) {
      const existingEditionIds=value.editions.map(x=>x.id).filter(id=>db.prepare('SELECT id FROM editions WHERE id=?').get(id));
      return {candidateId:value.id,kind:value.kind,filename:value.filename,sha256:value.sha256,bytes:value.bytes,
        memberCount:value.memberCount,expandedBytes:value.expandedBytes,editions:value.editions,existingEditionIds,
        ...(value.workspace?{workspace:value.workspace}:{}),warnings:value.warnings??[]};
    }
    async function prepareArchive({archiveFile,filename,sha256,bytes}={}) {
      if(typeof archiveFile!=='string'||resolve(archiveFile)!==archiveFile)throw fault('ARCHIVE_FILE_REQUIRED','Supply the received original ZIP file.');
      filename=text(filename??basename(archiveFile),'original filename',1024);
      if(sha256!==undefined&&!HASH.test(sha256)||bytes!==undefined&&(!Number.isSafeInteger(bytes)||bytes<0||bytes>LIMITS.archiveBytes))
        throw fault('ARCHIVE_DESCRIPTOR','Use the original SHA-256 and byte count.');
      const temporary=join(directory,'candidates','.pending-'+randomUUID());
      await privateDirectory(temporary,true);
      let published=false;
      try{
        const archive=join(temporary,'archive.zip'),actual=await copyOriginal(archiveFile,archive,{sha256,bytes});
        const id=actual.sha256,target=join(directory,'candidates',id);
        if(await exists(target)){
          const saved=await readJson(join(target,'candidate.json'),LIMITS.manifestBytes);
          const retained=await hashPrivate(join(target,'archive.zip'),LIMITS.archiveBytes);
          if(saved.id!==id||saved.sha256!==id||saved.bytes!==actual.bytes||retained.hash!==id||retained.bytes!==actual.bytes)
            throw fault('RETAINED_ARCHIVE_CHANGED','The existing original input changed.',409);
          db.prepare('INSERT INTO candidates(id,data) VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(id,JSON.stringify(saved));
          return publicCandidate(saved);
        }
        const tree=join(temporary,'tree'),unpacked=await unpackOriginal(archive,tree,{python});
        const inspected=await inspectUnpacked({tree,inventory:unpacked.members});
        const summaries=inspected.kind==='native'?inspected.editions.map(editionSummary):
          (inspected.snapshot.editions??[]).map(x=>typeof x.data==='string'?JSON.parse(x.data):x);
        const value={schema:'tjl.ciim.desk-import.v1',id,kind:inspected.kind,filename,sha256:id,bytes:actual.bytes,
          memberCount:unpacked.members.length,expandedBytes:unpacked.expandedBytes,createdAt:stamp(),
          editions:summaries,inventory:unpacked.members,
          ...(inspected.snapshot?{workspace:{workspaceId:inspected.snapshot.workspaceId,revision:inspected.snapshot.revision}}:{})};
        await createFile(join(temporary,'candidate.json'),jsonBytes(value));
        await syncDirectory(temporary);
        await rename(temporary,target);published=true;await syncDirectory(join(directory,'candidates'));
        db.prepare('INSERT INTO candidates(id,data) VALUES(?,?)').run(id,JSON.stringify(value));
        return publicCandidate(value);
      }finally{if(!published)await rm(temporary,{recursive:true,force:true});}
    }
    async function prepareImport(options){return serialize(()=>prepareArchive(options));}
    function makeContext(data) {
      only(data,['label','institution','receivingEnvironment','processingProfile','authorities','note'],'context');
      const current=clone(currentContext());
      if(own(data,'label'))current.label=text(data.label,'desk label',256);
      for(const name of ['institution','receivingEnvironment','processingProfile'])
        if(own(data,name))current[name]=reference(data[name],name,{version:name==='processingProfile'});
      if(own(data,'authorities')){
        if(!Array.isArray(data.authorities)||data.authorities.length>200)throw fault('AUTHORITIES_REQUIRED','Use the named institutional authorities.');
        const ids=new Set();
        current.authorities=data.authorities.map(authority=>{
          only(authority,['id','name','reference'],'authority');
          const id=text(authority.id,'authority identifier',128);
          if(ids.has(id))throw fault('DUPLICATE_AUTHORITY','Preserve one exact authority identity.');
          ids.add(id);return {id,name:text(authority.name,'authority name'),reference:text(authority.reference,'authority reference',4096)};
        });
      }
      current.note=text(data.note,'context change reason',NOTE);return current;
    }
    function authority(id) {
      const found=currentContext().authorities.find(x=>x.id===id);
      if(!found)throw fault('AUTHORITY_REQUIRED','Select the named institutional authority for this decision.',400,{authorityId:id??null});
      return clone(found);
    }
    function reviewData(data,scope,subject,populationDigest,env) {
      const allowed=describeCiimDesk().decisions[scope];
      if(!allowed?.includes(data.decision))throw fault('REVIEW_DECISION','Choose a declared '+scope+' decision.');
      return {scope,subject,decision:data.decision,note:text(data.note,'review reason',NOTE),authority:authority(data.authorityId),
        reference:optionalText(data.reference,'decision reference',4096),actor:env.actor,createdAt:env.createdAt,
        revision:env.revision,operationId:env.operationId,contextDigest:currentContextDigest(),populationDigest};
    }
    function saveReview(value,editionId=null) {
      db.prepare('INSERT INTO reviews(scope,subject,edition_id,decision,context_digest,data) VALUES(?,?,?,?,?,?) ON CONFLICT(scope,subject) DO UPDATE SET edition_id=excluded.edition_id,decision=excluded.decision,context_digest=excluded.context_digest,data=excluded.data')
        .run(value.scope,value.subject,editionId,value.decision,value.contextDigest,JSON.stringify(value));
    }
    async function prepareAction(type,data,env) {
      if(type==='intake.import'){
        only(data,['candidateId','label','editionIds'],'intake import');
        const input=candidate(opaque(data.candidateId,'candidate'));
        if(input.kind!=='native')throw fault('DESK_RESTORE_REQUIRED','Use workspace.restore to reopen a retained desk package.');
        const ids=data.editionIds===undefined?input.editions.map(x=>x.id):uniqueIds(data.editionIds,'original editions',1000);
        const available=new Map(input.editions.map(x=>[x.id,x]));
        if(ids.some(id=>!available.has(id)))throw fault('EDITION_SELECTION','Choose editions from this original input.');
        const label=text(data.label,'intake label',512),selected=[];
        const tree=join(directory,'candidates',input.id,'tree');
        const archive=await hashPrivate(join(directory,'candidates',input.id,'archive.zip'),LIMITS.archiveBytes);
        if(archive.hash!==input.sha256||archive.bytes!==input.bytes)throw fault('RETAINED_ARCHIVE_CHANGED','The original input archive differs.',409);
        for(const id of ids){
          const summary=available.get(id),original=await readCompletedEdition({tree,manifestPath:summary.manifestPath,sourcePath:summary.sourcePath,label:summary.label});
          if(original.id!==id||original.populationDigest!==summary.populationDigest)throw fault('PREVIEW_CHANGED','The original import preview changed.',409);
          selected.push(original);
        }
        return {input,label,selected,id:identity(['tjl.ciim.intake.v1',input.id,[...ids].sort()])};
      }
      if(type==='comparison.create'){
        only(data,['beforeEditionId','afterEditionId','label'],'comparison');
        const before=await loadEdition(opaque(data.beforeEditionId,'previous edition'));
        const after=await loadEdition(opaque(data.afterEditionId,'next edition'));
        return buildComparison(before,after,text(data.label,'comparison label',512),env.createdAt,env.actor);
      }
      if(type==='handback.create'){
        only(data,['label','editionIds','comparisonIds','note','authorityId'],'handback');
        const editionIds=uniqueIds(data.editionIds,'reviewed editions',1000),comparisonIds=data.comparisonIds??[];
        if(!Array.isArray(comparisonIds)||new Set(comparisonIds).size!==comparisonIds.length||comparisonIds.length>1000)
          throw fault('COMPARISON_SELECTION','Choose each retained comparison once.');
        const missing=[];
        for(const id of editionIds){await loadEdition(id);const status=readiness(id);if(!status.ready)missing.push({editionId:id,...status});}
        const comparisons=comparisonIds.map(id=>{
          const item=comparison(id),decision=review('comparison',id);
          if(!editionIds.includes(item.beforeEditionId)||!editionIds.includes(item.afterEditionId))
            throw fault('HANDBACK_COMPARISON_SCOPE','Include both original editions of each selected comparison.');
          if(!decision||decision.stale||decision.decision!=='accept')missing.push({comparisonId:id,code:'COMPARISON_REVIEW_REQUIRED'});
          return {...item,review:decision};
        });
        if(missing.length)throw fault('HANDBACK_REVIEW_REQUIRED','Complete the named reviews for this handback.',409,{missing});
        const label=text(data.label,'handback label',512),note=text(data.note,'handback reason',NOTE),reviewer=authority(data.authorityId);
        const editions=editionIds.map(id=>{
          const item=edition(id),rows=db.prepare('SELECT data FROM records WHERE edition_id=? ORDER BY ordinal').all(id).map(recordSummary);
          return {...item,originalReport:editionCache.get(id).manifest.report??null,
            review:review('edition',id),profiles:item.profiles.map(profile=>({...profile,review:review('profile',id+':'+profile.sha256)})),
            reconciliation:{sourceRecords:rows.length,accepted:rows.filter(x=>x.effectiveDecision==='accept').length,
              excluded:rows.filter(x=>x.effectiveDecision==='exclude').length,
              rows:rows.map(x=>({id:x.id,identifier:x.identifier,observationId:x.observationId,status:x.status,
                recordSha256:x.recordSha256,decision:x.effectiveDecision,review:x.review}))}};
        });
        const archiveIds=[...new Set(db.prepare('SELECT data FROM imports ORDER BY id').all().map(row=>JSON.parse(row.data).candidateId))];
        const originalArchives=archiveIds.map(id=>{
          const input=candidate(id);return {id,filename:input.filename,sha256:input.sha256,bytes:input.bytes,
            editionCoverage:input.editions.map(x=>({id:x.id,repository:x.repository.id,metadataPrefix:x.selection.metadataPrefix,nativeEditionId:x.nativeEditionId,records:x.counts.records}))};
        });
        const frozen={schema:'tjl.ciim.reviewed-handback.v1',workspaceId:getMeta('workspaceId'),revision:env.revision,
          createdAt:env.createdAt,actor:env.actor,authority:reviewer,label,note,context:clone(currentContext()),
          contextDigest:currentContextDigest(),editions,comparisons,originalArchives,
          populationPolicy:'Every selected original row remains in reconciliation and in its complete original input; reviewed output contains accepted rows in original order.'};
        const id=identity(frozen),counts={editions:editions.length,comparisons:comparisons.length,
          sourceRecords:editions.reduce((n,x)=>n+x.counts.records,0),accepted:editions.reduce((n,x)=>n+x.reconciliation.accepted,0),
          excluded:editions.reduce((n,x)=>n+x.reconciliation.excluded,0)};
        const item={id,label,revision:env.revision,createdAt:env.createdAt,actor:env.actor,editionIds,comparisonIds,counts,sha256:digest(jsonBytes(frozen)),frozen};
        return {...item,_checkpoint:await makeHandbackCheckpoint(item,env)};
      }
      if(type==='workspace.restore')return prepareRestore(data,env);
      return null;
    }
    function applyAction(type,data,prepared,env) {
      if(type==='context.save'){
        const context=makeContext(data);putMeta('context',context);return {contextDigest:contextDigest(context)};
      }
      if(type==='intake.import'){
        const {input,label,selected,id}=prepared;
        const prior=unpack(db.prepare('SELECT data FROM imports WHERE id=?').get(id));
        if(prior)return {importId:id,editionIds:prior.editionIds,alreadyImported:true};
        const intake={id,label,candidateId:input.id,filename:input.filename,sha256:input.sha256,bytes:input.bytes,
          editionIds:selected.map(x=>x.id),importedAt:env.createdAt,actor:env.actor,operationId:env.operationId};
        db.prepare('INSERT INTO imports(id,data) VALUES(?,?)').run(id,JSON.stringify(intake));
        for(const original of selected){
          const priorEdition=unpack(db.prepare('SELECT data FROM editions WHERE id=?').get(original.id));
          if(priorEdition){if(priorEdition.populationDigest!==original.populationDigest)throw fault('EDITION_IDENTITY_CONFLICT','The original edition identity differs.',409);continue;}
          const summary={...editionSummary(original),importId:id,candidateId:input.id};
          db.prepare('INSERT INTO editions(id,import_id,data) VALUES(?,?,?)').run(summary.id,id,JSON.stringify(summary));
          const insert=db.prepare('INSERT INTO records(id,edition_id,identifier,ordinal,status,datestamp,title,issue_count,data,body) VALUES(?,?,?,?,?,?,?,?,?,?)');
          for(const record of original.records){
            const {raw,native,...row}=record;
            insert.run(row.id,row.editionId,row.identifier,row.ordinal,row.status,row.datestamp,row.title,row.issueCount,JSON.stringify(row),gzipSync(raw,{level:6,mtime:0}));
          }
          editionCache.set(original.id,original);
        }
        return {importId:id,editionIds:intake.editionIds,alreadyImported:false};
      }
      if(type==='edition.review'){
        only(data,['editionId','decision','note','authorityId','reference'],'edition review');
        const item=edition(opaque(data.editionId,'edition'));
        const value=reviewData(data,'edition',item.id,item.populationDigest,env);
        saveReview(value,item.id);return {editionId:item.id,review:value};
      }
      if(type==='profile.review'){
        only(data,['editionId','profileSha256','decision','note','authorityId','reference'],'profile review');
        const item=edition(opaque(data.editionId,'edition'));
        if(!item.profiles.some(x=>x.sha256===data.profileSha256))throw fault('PROFILE_NOT_FOUND','Choose an original profile from this edition.',404);
        const value=reviewData(data,'profile',item.id+':'+data.profileSha256,data.profileSha256,env);
        saveReview(value,item.id);return {editionId:item.id,profileSha256:data.profileSha256,review:value};
      }
      if(type==='records.review'){
        only(data,['editionId','recordIds','populationDigest','decision','note','authorityId','reference'],'record review');
        const item=edition(opaque(data.editionId,'edition'));
        if(own(data,'recordIds')===own(data,'populationDigest'))throw fault('REVIEW_SCOPE','Choose exact record IDs or the complete original population digest.');
        let ids;
        if(own(data,'populationDigest')){
          if(data.populationDigest!==item.populationDigest)throw fault('POPULATION_CHANGED','The reviewed original population differs.',409);
          ids=db.prepare('SELECT id FROM records WHERE edition_id=? ORDER BY ordinal').all(item.id).map(x=>x.id);
        }else ids=uniqueIds(data.recordIds,'original records');
        if(ids.some(id=>!db.prepare('SELECT id FROM records WHERE id=? AND edition_id=?').get(id,item.id)))
          throw fault('RECORD_SCOPE','Choose records from this original edition.');
        for(const id of ids)saveReview(reviewData(data,'record',id,item.populationDigest,env),item.id);
        return {editionId:item.id,recordIds:ids,decision:data.decision,populationDigest:item.populationDigest};
      }
      if(type==='comparison.create'){
        const {rows,...value}=prepared;
        const prior=unpack(db.prepare('SELECT data FROM comparisons WHERE id=?').get(value.id));
        if(prior)return {comparisonId:value.id,alreadyCompared:true};
        db.prepare('INSERT INTO comparisons(id,data) VALUES(?,?)').run(value.id,JSON.stringify(value));
        const insert=db.prepare('INSERT INTO comparison_rows(id,comparison_id,identifier,ordinal,change,data) VALUES(?,?,?,?,?,?)');
        rows.forEach((row,i)=>insert.run(row.id,value.id,row.identifier,i+1,row.change,gzipSync(jsonBytes(row),{level:6,mtime:0})));
        return {comparisonId:value.id,counts:value.counts,populationDigest:value.populationDigest,alreadyCompared:false};
      }
      if(type==='comparison.review'){
        only(data,['comparisonId','decision','note','authorityId','reference'],'comparison review');
        const item=comparison(opaque(data.comparisonId,'comparison'));
        const value=reviewData(data,'comparison',item.id,item.populationDigest,env);
        saveReview(value);return {comparisonId:item.id,review:value};
      }
      if(type==='handback.create'){
        const {_checkpoint,...item}=prepared;
        db.prepare('INSERT INTO handbacks(id,data) VALUES(?,?)').run(item.id,JSON.stringify(item));
        db.prepare('INSERT INTO handback_files(id,sha256,bytes) VALUES(?,?,?)').run(item.id,_checkpoint.sha256,_checkpoint.bytes);
        return {handbackId:item.id,sha256:item.sha256,counts:item.counts};
      }
      if(type==='workspace.restore')return applyRestore(prepared,env);
      throw fault('OPERATION_NOT_FOUND','Choose a declared desk operation.',404);
    }

    function snapshot() {
      const meta={schema:getMeta('schema'),workspaceId:getMeta('workspaceId'),revision:currentRevision(),
        createdAt:getMeta('createdAt'),updatedAt:getMeta('updatedAt'),context:currentContext(),
        receivedFrom:getMeta('receivedFrom')??[]};
      const imports=db.prepare('SELECT * FROM imports ORDER BY id').all();
      const ids=[...new Set(imports.map(row=>JSON.parse(row.data).candidateId))];
      const candidates=ids.map(id=>candidate(id));
      const records=db.prepare('SELECT * FROM records ORDER BY edition_id,ordinal').all().map(row=>{
        rawRecord(row);return {...row,body:Buffer.from(row.body).toString('base64')};
      });
      return {schema:'tjl.ciim.desk-snapshot.v1',workspaceId:meta.workspaceId,revision:meta.revision,meta,candidates,imports,
        editions:db.prepare('SELECT * FROM editions ORDER BY id').all(),records,
        reviews:db.prepare('SELECT * FROM reviews ORDER BY scope,subject').all(),
        comparisons:db.prepare('SELECT * FROM comparisons ORDER BY id').all(),
        comparisonRows:db.prepare('SELECT * FROM comparison_rows ORDER BY comparison_id,ordinal').all()
          .map(row=>({...row,data:Buffer.from(row.data).toString('base64')})),
        handbacks:db.prepare('SELECT * FROM handbacks ORDER BY id').all(),
        operations:db.prepare('SELECT * FROM operations ORDER BY revision').all()};
    }
    function decode64(value,label) {
      if(typeof value!=='string'||value.length>LIMITS.stateBytes*2||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
        throw fault('SNAPSHOT_ENCODING','The retained '+label+' encoding differs.');
      const body=Buffer.from(value,'base64');
      if(body.toString('base64')!==value)throw fault('SNAPSHOT_ENCODING','The retained '+label+' encoding differs.');
      return body;
    }
    async function prepareRestore(data,env) {
      only(data,['candidateId','note'],'workspace restore');
      const input=candidate(opaque(data.candidateId,'candidate'));
      if(!['workspace','handback'].includes(input.kind))throw fault('DESK_PACKAGE_REQUIRED','Choose a complete retained desk package.');
      if(currentRevision()!==0||db.prepare('SELECT count(*) n FROM editions').get().n!==0)
        throw fault('FRESH_DESK_REQUIRED','Restore into a fresh empty desk so existing work remains intact.',409);
      const tree=join(directory,'candidates',input.id,'tree');
      const descriptor=input.inventory.find(x=>x.file==='desk-state.json');
      const body=await readMember(tree,'desk-state.json',LIMITS.stateBytes);
      if(!descriptor||descriptor.sha256!==digest(body)||descriptor.bytes!==body.length)
        throw fault('SNAPSHOT_CHANGED','The retained complete desk state differs.',409);
      const saved=parseJson(body,'Retained desk snapshot');
      only(saved,['schema','workspaceId','revision','meta','candidates','imports','editions','records','reviews',
        'comparisons','comparisonRows','handbacks','operations'],'desk snapshot');
      if(saved.schema!=='tjl.ciim.desk-snapshot.v1'||!object(saved.meta)||saved.meta.schema!==SCHEMA||
          saved.workspaceId!==saved.meta.workspaceId||saved.revision!==saved.meta.revision||
          !Number.isSafeInteger(saved.revision)||saved.revision<0||saved.revision>1000000)
        throw fault('SNAPSHOT_IDENTITY','The retained workspace identity or revision is invalid.');
      text(saved.workspaceId,'original workspace identity',128);
      if(!Number.isFinite(Date.parse(saved.meta.createdAt))||!Number.isFinite(Date.parse(saved.meta.updatedAt)))
        throw fault('SNAPSHOT_DATE','Retain the original workspace dates.');
      const ctx=saved.meta.context;
      if(!object(ctx)||!Array.isArray(ctx.authorities)||ctx.authorities.length>200)
        throw fault('SNAPSHOT_CONTEXT','The retained receiving context is incomplete.');
      text(ctx.label,'retained desk label',256);
      for(const key of ['institution','receivingEnvironment','processingProfile'])reference(ctx[key],key,{version:key==='processingProfile'});
      const authorityIds=new Set();
      for(const item of ctx.authorities){
        only(item,['id','name','reference'],'retained authority');text(item.id,'authority id',128);
        text(item.name,'authority name');text(item.reference,'authority reference',4096);
        if(authorityIds.has(item.id))throw fault('SNAPSHOT_AUTHORITY','The retained authority identity repeats.');
        authorityIds.add(item.id);
      }
      for(const name of ['candidates','imports','editions','records','reviews','comparisons','comparisonRows','handbacks','operations']){
        if(!Array.isArray(saved[name])||saved[name].length>1000000)
          throw fault('SNAPSHOT_TABLE','The retained '+name+' table is incomplete or exceeds its limit.');
      }
      if(saved.candidates.length>1000||saved.editions.length>1000||saved.comparisons.length>1000)
        throw fault('SNAPSHOT_LIMIT','The complete retained workspace exceeds its edition limit.',413);
      const inputs=new Map(),native=new Map();
      for(const original of saved.candidates){
        if(!HASH.test(original.id??'')||original.id!==original.sha256||original.kind!=='native'||inputs.has(original.id))
          throw fault('SNAPSHOT_SOURCE_IDENTITY','Every retained original input needs one exact archive identity.');
        const sourcePath='originals/'+original.id+'.zip',file=join(tree,sourcePath);
        if(!input.inventory.some(x=>x.file===sourcePath&&x.sha256===original.sha256&&x.bytes===original.bytes))
          throw fault('SNAPSHOT_SOURCE_MISSING','The complete original input archive is missing.');
        const prepared=await prepareArchive({archiveFile:file,filename:original.filename,sha256:original.sha256,bytes:original.bytes});
        if(prepared.kind!=='native'||prepared.candidateId!==original.id)throw fault('SNAPSHOT_SOURCE_CHANGED','The original input differs.',409);
        inputs.set(original.id,candidate(original.id));
      }
      const imports=new Map();
      for(const row of saved.imports){
        const item=JSON.parse(row.data);
        if(row.id!==item.id||imports.has(row.id)||!inputs.has(item.candidateId)||
            item.sha256!==inputs.get(item.candidateId).sha256||item.bytes!==inputs.get(item.candidateId).bytes||
            !Array.isArray(item.editionIds)||new Set(item.editionIds).size!==item.editionIds.length)
          throw fault('SNAPSHOT_INTAKE_BINDING','A retained intake changed its complete original source.');
        imports.set(item.id,item);
      }
      const editions=new Map();
      for(const row of saved.editions){
        const item=JSON.parse(row.data),original=inputs.get(item.candidateId);
        if(row.id!==item.id||row.import_id!==item.importId||!imports.get(item.importId)?.editionIds.includes(item.id)||
            !original||editions.has(item.id))throw fault('SNAPSHOT_EDITION_BINDING','A retained edition lost its original intake.');
        const selected=original.editions.find(x=>x.id===item.id);
        if(!selected)throw fault('SNAPSHOT_EDITION_BINDING','The native original edition is missing.');
        const complete=await readCompletedEdition({tree:join(directory,'candidates',original.id,'tree'),
          manifestPath:selected.manifestPath,sourcePath:selected.sourcePath,label:selected.label});
        const expected={...editionSummary(complete),importId:item.importId,candidateId:original.id};
        if(!isDeepStrictEqual(item,expected))throw fault('SNAPSHOT_EDITION_CHANGED','The retained edition index differs from its original source.',409);
        editions.set(item.id,item);native.set(item.id,complete);
      }
      for(const item of imports.values())if(item.editionIds.some(id=>!editions.has(id)))
        throw fault('SNAPSHOT_INTAKE_COVERAGE','An intake omitted one of its retained original editions.');
      const expectedRecords=new Map();
      for(const item of native.values())for(const record of item.records)expectedRecords.set(record.id,record);
      const seenRecords=new Set(),restoredRecords=[];
      for(const row of saved.records){
        const expected=expectedRecords.get(row.id);
        if(!expected||seenRecords.has(row.id))throw fault('SNAPSHOT_RECORD_COVERAGE','An original record is repeated or outside its edition.');
        const {native:nativeValue,raw,...summary}=expected;
        if(!isDeepStrictEqual(JSON.parse(row.data),summary)||row.edition_id!==summary.editionId||row.identifier!==summary.identifier||
            row.ordinal!==summary.ordinal||row.status!==summary.status||row.datestamp!==summary.datestamp||
            row.title!==summary.title||row.issue_count!==summary.issueCount)
          throw fault('SNAPSHOT_RECORD_CHANGED','An original record index differs.',409);
        const compressed=decode64(row.body,'record'),decoded=gunzipSync(compressed,{maxOutputLength:LIMITS.memberBytes});
        if(!decoded.equals(raw))throw fault('SNAPSHOT_RECORD_CHANGED','An original mapped row differs byte for byte.',409);
        seenRecords.add(row.id);restoredRecords.push({...row,body:compressed});
      }
      if(seenRecords.size!==expectedRecords.size)throw fault('SNAPSHOT_RECORD_COVERAGE','The complete original row population is missing.');
      const comparisons=new Map(),comparisonRows=[];
      for(const row of saved.comparisons){
        const item=JSON.parse(row.data),before=native.get(item.beforeEditionId),after=native.get(item.afterEditionId);
        if(row.id!==item.id||comparisons.has(item.id)||!before||!after||before.repository.id!==after.repository.id||
            before.selection.metadataPrefix!==after.selection.metadataPrefix)
          throw fault('SNAPSHOT_COMPARISON_SCOPE','A retained comparison lost its original source editions.');
        const expected=buildComparison(before,after,item.label,item.createdAt,item.actor);
        const {rows,...summary}=expected;
        if(!isDeepStrictEqual(item,summary))throw fault('SNAPSHOT_COMPARISON_CHANGED','The retained comparison differs from its original editions.',409);
        const savedRows=saved.comparisonRows.filter(x=>x.comparison_id===item.id).sort((a,b)=>a.ordinal-b.ordinal);
        if(savedRows.length!==rows.length)throw fault('SNAPSHOT_COMPARISON_COVERAGE','The complete comparison population is missing.');
        for(let i=0;i<rows.length;i++){
          const current=savedRows[i],raw=decode64(current.data,'comparison row');
          if(current.id!==rows[i].id||current.identifier!==rows[i].identifier||current.ordinal!==i+1||current.change!==rows[i].change||
              !isDeepStrictEqual(parseJson(gunzipSync(raw,{maxOutputLength:LIMITS.memberBytes})),rows[i]))
            throw fault('SNAPSHOT_COMPARISON_CHANGED','A retained comparison row differs.',409);
          comparisonRows.push({...current,data:raw});
        }
        comparisons.set(item.id,item);
      }
      if(comparisonRows.length!==saved.comparisonRows.length)throw fault('SNAPSHOT_COMPARISON_COVERAGE','Unexpected comparison rows were retained.');
      const reviewKeys=new Set();
      for(const row of saved.reviews){
        const value=JSON.parse(row.data),key=row.scope+':'+row.subject;
        if(reviewKeys.has(key)||value.scope!==row.scope||value.subject!==row.subject||value.decision!==row.decision||
            value.contextDigest!==row.context_digest||!HASH.test(value.contextDigest??'')||
            !describeCiimDesk().decisions[row.scope]?.includes(value.decision)||!Number.isSafeInteger(value.revision)||
            value.revision<1||value.revision>saved.revision||!object(value.authority))
          throw fault('SNAPSHOT_REVIEW_BINDING','A retained named review is incomplete.');
        text(value.actor,'original reviewer',256);text(value.note,'original review reason',NOTE);
        text(value.authority.id,'original authority identifier',128);text(value.authority.name,'original authority name');
        text(value.authority.reference,'original authority reference',4096);
        let expected;
        if(row.scope==='edition')expected=editions.get(row.subject)?.populationDigest;
        else if(row.scope==='record')expected=editions.get(expectedRecords.get(row.subject)?.editionId)?.populationDigest;
        else if(row.scope==='profile'){
          const selected=editions.get(row.edition_id);
          expected=selected?.profiles.find(x=>row.subject===selected.id+':'+x.sha256)?.sha256;
        }else expected=comparisons.get(row.subject)?.populationDigest;
        if(!expected||value.populationDigest!==expected)throw fault('SNAPSHOT_REVIEW_SCOPE','A review changed its original population.');
        reviewKeys.add(key);
      }
      const handbackIds=new Set();
      for(const row of saved.handbacks){
        const item=JSON.parse(row.data);
        if(row.id!==item.id||handbackIds.has(item.id)||identity(item.frozen)!==item.id||
            digest(jsonBytes(item.frozen))!==item.sha256||item.frozen.schema!=='tjl.ciim.reviewed-handback.v1'||
            item.frozen.workspaceId!==saved.workspaceId||item.revision!==item.frozen.revision||
            item.revision>saved.revision||item.editionIds.some(id=>!editions.has(id))||
            item.comparisonIds.some(id=>!comparisons.has(id)))
          throw fault('SNAPSHOT_HANDBACK_BINDING','A retained historical handback differs.');
        for(const received of item.frozen.editions){
          const original=native.get(received.id),rows=received.reconciliation.rows;
          if(!original||rows.length!==original.records.length||rows.some((x,i)=>x.id!==original.records[i].id||
              x.recordSha256!==original.records[i].recordSha256||!['accept','exclude'].includes(x.decision)))
            throw fault('SNAPSHOT_HANDBACK_COVERAGE','A historical handback lost an original row or decision.');
        }
        handbackIds.add(item.id);
      }
      if(saved.operations.length!==saved.revision)throw fault('SNAPSHOT_HISTORY','The original revision history is incomplete.');
      const operationIds=new Set();
      for(let i=0;i<saved.operations.length;i++){
        const row=saved.operations[i],request=JSON.parse(row.request);
        if(row.revision!==i+1||operationIds.has(row.id)||row.id===env.operationId||request.operationId!==row.id||
            request.type!==row.type||request.actor!==row.actor||identity(request)!==row.request_hash)
          throw fault('SNAPSHOT_HISTORY','The original operation/revision history differs; use a new receiving operation ID.');
        parseJson(Buffer.from(row.result),'Original operation result');operationIds.add(row.id);
      }
      const envelope=parseJson(await readMember(tree,'desk-package.json',LIMITS.manifestBytes));
      if(!Array.isArray(envelope.checkpoints)||envelope.checkpoints.length!==saved.handbacks.length)
        throw fault('SNAPSHOT_HANDBACK_CHECKPOINTS','Every historical handback needs its complete original checkpoint.');
      const checkpoints=[],checkpointIds=new Set();
      for(const item of envelope.checkpoints){
        if(!handbackIds.has(item.id)||checkpointIds.has(item.id)||item.file!=='handback-state/'+item.id+'.json')
          throw fault('SNAPSHOT_HANDBACK_CHECKPOINTS','A historical handback checkpoint is repeated or outside the retained state.');
        const raw=await readMember(tree,item.file,LIMITS.stateBytes);
        if(raw.length!==item.bytes||digest(raw)!==item.sha256)throw fault('SNAPSHOT_HANDBACK_CHECKPOINTS','A historical handback checkpoint differs.',409);
        const historical=parseJson(raw,'Historical handback checkpoint');
        const original=JSON.parse(saved.handbacks.find(x=>x.id===item.id).data);
        if(historical.schema!=='tjl.ciim.desk-snapshot.v1'||historical.workspaceId!==saved.workspaceId||historical.revision!==original.revision||
            !historical.handbacks?.some(x=>x.id===item.id&&isDeepStrictEqual(JSON.parse(x.data),original)))
          throw fault('SNAPSHOT_HANDBACK_CHECKPOINTS','The historical checkpoint has a different original review identity.');
        checkpoints.push(await retainCheckpoint(item.id,raw));checkpointIds.add(item.id);
      }
      return {input,saved,inputs:[...inputs.values()],records:restoredRecords,comparisonRows,native,checkpoints,
        note:text(data.note,'receiving reason',NOTE)};
    }
    function applyRestore(prepared,env) {
      const {saved,input}=prepared;
      const oldMarker={schema:SCHEMA,workspaceId:getMeta('workspaceId'),createdAt:getMeta('createdAt')};
      const newMarker={schema:SCHEMA,workspaceId:saved.workspaceId,createdAt:saved.meta.createdAt};
      for(const table of ['imports','editions','records','reviews','comparisons','comparison_rows','handbacks','handback_files','operations'])
        db.exec('DELETE FROM '+table);
      for(const row of saved.imports)db.prepare('INSERT INTO imports(id,data) VALUES(?,?)').run(row.id,row.data);
      for(const row of saved.editions)db.prepare('INSERT INTO editions(id,import_id,data) VALUES(?,?,?)').run(row.id,row.import_id,row.data);
      const insertRecord=db.prepare('INSERT INTO records(id,edition_id,identifier,ordinal,status,datestamp,title,issue_count,data,body) VALUES(?,?,?,?,?,?,?,?,?,?)');
      for(const row of prepared.records)insertRecord.run(row.id,row.edition_id,row.identifier,row.ordinal,row.status,row.datestamp,row.title,row.issue_count,row.data,row.body);
      for(const row of saved.reviews)db.prepare('INSERT INTO reviews(scope,subject,edition_id,decision,context_digest,data) VALUES(?,?,?,?,?,?)')
        .run(row.scope,row.subject,row.edition_id,row.decision,row.context_digest,row.data);
      for(const row of saved.comparisons)db.prepare('INSERT INTO comparisons(id,data) VALUES(?,?)').run(row.id,row.data);
      for(const row of prepared.comparisonRows)db.prepare('INSERT INTO comparison_rows(id,comparison_id,identifier,ordinal,change,data) VALUES(?,?,?,?,?,?)')
        .run(row.id,row.comparison_id,row.identifier,row.ordinal,row.change,row.data);
      for(const row of saved.handbacks)db.prepare('INSERT INTO handbacks(id,data) VALUES(?,?)').run(row.id,row.data);
      for(const row of prepared.checkpoints)db.prepare('INSERT INTO handback_files(id,sha256,bytes) VALUES(?,?,?)').run(row.id,row.sha256,row.bytes);
      for(const row of saved.operations)db.prepare('INSERT INTO operations(id,revision,request_hash,type,actor,created,request,result) VALUES(?,?,?,?,?,?,?,?)')
        .run(row.id,row.revision,row.request_hash,row.type,row.actor,row.created,row.request,row.result);
      putMeta('workspaceId',saved.workspaceId);putMeta('createdAt',saved.meta.createdAt);putMeta('context',saved.meta.context);
      putMeta('receivedFrom',[...(saved.meta.receivedFrom??[]),{workspaceId:saved.workspaceId,revision:saved.revision,
        archiveSha256:input.sha256,archiveBytes:input.bytes,filename:input.filename,actor:env.actor,
        receivedAt:env.createdAt,operationId:env.operationId,note:prepared.note}]);
      putMeta('pendingMarker',{old:oldMarker,next:newMarker});
      editionCache.clear();for(const [id,value]of prepared.native)editionCache.set(id,value);
      return {workspaceId:saved.workspaceId,originalRevision:saved.revision,editionIds:saved.editions.map(x=>x.id),
        records:prepared.records.length,receivedArchiveSha256:input.sha256};
    }
    async function act(request) {
      return serialize(async()=>{
        only(request,['operationId','expectedRevision','actor','type','data'],'operation envelope');
        const operationId=text(request.operationId,'stable operation ID',128),actor=text(request.actor,'reviewer name',256),
          type=request.type,data=request.data??{};
        if(!actions.includes(type)||!object(data)||!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0)
          throw fault('OPERATION_ENVELOPE','Use a declared type, data object and exact expectedRevision.');
        const normalized={operationId,expectedRevision:request.expectedRevision,actor,type,data},requestHash=identity(normalized);
        const prior=db.prepare('SELECT * FROM operations WHERE id=?').get(operationId);
        if(prior){
          if(prior.request_hash!==requestHash)throw fault('OPERATION_ID_REUSED','This operation ID already belongs to a different original request.',409);
          await repairMarker();
          return {operationId,type:prior.type,revision:prior.revision,replayed:true,result:JSON.parse(prior.result),state:state()};
        }
        if(request.expectedRevision!==currentRevision())
          throw fault('REVISION_CONFLICT','The retained desk changed. Read its current state before applying a new decision.',409,
            {expectedRevision:request.expectedRevision,actualRevision:currentRevision()});
        const env={operationId,actor,type,createdAt:stamp(),revision:currentRevision()+1,request:normalized,requestHash};
        const prepared=await prepareAction(type,data,env);
        if(type==='workspace.restore')env.revision=prepared.saved.revision+1;
        const result=transaction(()=>{
          const value=applyAction(type,data,prepared,env);
          putMeta('revision',env.revision);putMeta('updatedAt',env.createdAt);
          db.prepare('INSERT INTO operations(id,revision,request_hash,type,actor,created,request,result) VALUES(?,?,?,?,?,?,?,?)')
            .run(operationId,env.revision,requestHash,type,actor,env.createdAt,JSON.stringify(normalized),JSON.stringify(value));
          return value;
        });
        await repairMarker();
        return {operationId,type,revision:env.revision,replayed:false,result,state:state()};
      });
    }

    async function retainCheckpoint(id,body) {
      const folder=join(directory,'exports','handback-state');await privateDirectory(folder,true);
      const file=join(folder,id+'.json');
      if(await exists(file)){
        const old=await readPrivate(file,LIMITS.stateBytes);
        if(!old.equals(body))throw fault('HANDBACK_CHECKPOINT_CHANGED','The retained historical handback checkpoint differs.',409);
      }else{
        const temporary=join(folder,'.pending-'+randomUUID());
        try{await createFile(temporary,body);await rename(temporary,file);await syncDirectory(folder);}
        finally{await rm(temporary,{force:true});}
      }
      return {id,sha256:digest(body),bytes:body.length};
    }
    async function makeHandbackCheckpoint(item,env) {
      const saved=snapshot();
      saved.revision=env.revision;saved.meta.revision=env.revision;saved.meta.updatedAt=env.createdAt;
      saved.handbacks.push({id:item.id,data:JSON.stringify(item)});
      saved.handbacks.sort((a,b)=>a.id.localeCompare(b.id));
      saved.operations.push({id:env.operationId,revision:env.revision,request_hash:env.requestHash,type:env.type,
        actor:env.actor,created:env.createdAt,request:JSON.stringify(env.request),
        result:JSON.stringify({handbackId:item.id,sha256:item.sha256,counts:item.counts})});
      const body=jsonBytes(saved);
      if(body.length>LIMITS.stateBytes)throw fault('WORKSPACE_EXPORT_LIMIT','The complete retained handback exceeds the state limit.',413);
      return retainCheckpoint(item.id,body);
    }
    async function checkpointBody(id) {
      const expected=db.prepare('SELECT * FROM handback_files WHERE id=?').get(id);
      if(!expected)throw fault('HANDBACK_CHECKPOINT_MISSING','The complete historical handback checkpoint is missing.',409);
      const body=await readPrivate(join(directory,'exports','handback-state',id+'.json'),LIMITS.stateBytes);
      if(body.length!==expected.bytes||digest(body)!==expected.sha256)
        throw fault('HANDBACK_CHECKPOINT_CHANGED','The complete historical handback differs.',409);
      return body;
    }
    async function attachment({editionId,kind,id}={}) {
      available();const original=await loadEdition(opaque(editionId,'edition'));
      const item=edition(editionId),input=candidate(item.candidateId),tree=join(directory,'candidates',input.id,'tree'),
        resultRoot=join(tree,item.resultDirectory),sourceRoot=join(tree,item.sourceRoot);
      let body,filename,mime='application/json';
      if(kind==='manifest'){body=await readMember(tree,item.manifestPath,LIMITS.manifestBytes);filename='manifest.json';}
      else if(kind==='operation'){body=await readPrivate(join(resultRoot,'operation.json'),LIMITS.manifestBytes);filename='operation.json';}
      else if(kind==='source'){body=await readMember(tree,item.sourcePath,LIMITS.manifestBytes);filename='source.json';}
      else if(kind==='profile'){
        const descriptor=original.manifest.profiles.find(x=>x.sha256===id);
        if(!descriptor)throw fault('PROFILE_NOT_FOUND','Choose an original profile.',404);
        body=await nativeBody(resultRoot,descriptor);filename=id+'.profile.json';
      }else if(['xml','native','mapped'].includes(kind)){
        const page=original.manifest.pages.find(x=>x.requestId===id);
        if(!page)throw fault('PAGE_NOT_FOUND','Choose an original request page.',404);
        if(kind==='xml'){
          body=await readPrivate(join(sourceRoot,member(page.page.path)),LIMITS.memberBytes);
          if(digest(body)!==page.page.sha256)throw fault('ORIGINAL_XML_CHANGED','The original XML bytes differ.',409);
          filename=page.page.sha256+'.xml';mime='application/xml';
        }else{
          const descriptor=kind==='native'?page.conversion:page.mapped;
          body=await nativeBody(resultRoot,descriptor);filename=id+(kind==='native'?'.native.json':'.mapped.jsonl');
          if(kind==='mapped')mime='application/x-ndjson';
        }
      }else throw fault('ATTACHMENT_KIND','Choose a declared original attachment.',404);
      return {body,filename,mime,bytes:body.length,sha256:digest(body)};
    }
    const html=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    function handbackReport(item) {
      const f=item.frozen;
      const content=f.editions.map(edition=>{
        const profileRows=edition.profiles.map(profile=>'<tr><td class="mono">'+html(profile.sha256)+'</td><td>'+html(profile.review?.decision)+'</td><td>'+html(profile.review?.actor)+'</td><td>'+html(profile.review?.authority?.name)+'</td><td>'+html(profile.review?.authority?.reference)+'</td><td>'+html(profile.review?.note)+'</td></tr>').join('');
        const report=edition.originalReport?'<p><a href="original-reports/'+html(edition.id)+'.html">Open the complete original native report</a></p>':'';
        const rows=edition.reconciliation.rows.map(row=>'<tr><td>'+html(row.identifier)+'</td><td>'+html(row.status)+'</td><td>'+
          html(row.decision)+'</td><td>'+html(row.review?.actor)+'</td><td>'+html(row.review?.authority?.name)+'</td><td>'+
          html(row.review?.note)+'</td><td class="mono">'+html(row.recordSha256)+'</td></tr>').join('');
        return '<section><h2>'+html(edition.label)+'</h2><p>'+edition.counts.records+' original records; '+
          edition.reconciliation.accepted+' accepted; '+edition.reconciliation.excluded+' excluded.</p><p>Repository: '+
          html(edition.repository.id)+' · Metadata prefix: '+html(edition.selection.metadataPrefix)+'</p>'+report+
          '<h3>Named original-profile reviews</h3><table><thead><tr><th>Original profile SHA-256</th><th>Decision</th><th>Reviewer</th><th>Authority</th><th>Authority reference</th><th>Reason</th></tr></thead><tbody>'+profileRows+'</tbody></table><h3>Complete original-record decisions</h3><table><thead><tr>'+
          '<th>Original identifier</th><th>Source state</th><th>Decision</th><th>Reviewer</th><th>Authority</th><th>Reason</th><th>Original mapped-row SHA-256</th>'+
          '</tr></thead><tbody>'+rows+'</tbody></table></section>';
      }).join('');
      return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
        '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;">'+
        '<title>'+html(f.label)+'</title><style>body{font:15px system-ui,sans-serif;color:#202124;background:#fff;max-width:1300px;margin:32px auto;padding:0 20px;line-height:1.5}h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;border:1px solid #b8b8b8;padding:8px;overflow-wrap:anywhere}th{background:#f1f1f1}.mono{font-family:monospace}section{margin:30px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{max-width:none;margin:0}tr{break-inside:avoid}}</style>'+
        '<h1>'+html(f.label)+'</h1><p>Recorded by '+html(f.actor)+' for '+html(f.authority.name)+' on '+html(f.createdAt)+
        '. Original desk revision '+f.revision+'.</p><p>'+html(f.note)+'</p><h2>Receiving context</h2><pre>'+html(JSON.stringify(f.context,null,2))+
        '</pre><p>'+html(f.populationPolicy)+'</p>'+content+'<h2>Original edition comparisons</h2><pre>'+
        html(JSON.stringify(f.comparisons,null,2))+'</pre><h2>Complete original input coverage</h2><pre>'+
        html(JSON.stringify(f.originalArchives,null,2))+'</pre><p class="mono">Handback '+html(item.id)+' · Frozen review SHA-256 '+html(item.sha256)+'</p></html>';
    }
    async function exportComplete(kind,handbackId) {
      await repairMarker();
      let saved,stateBody,selected;
      if(kind==='handback'){
        selected=handback(opaque(handbackId,'handback'));
        stateBody=await checkpointBody(selected.id);saved=parseJson(stateBody,'Historical handback checkpoint');
      }else{
        for(const row of db.prepare('SELECT id FROM editions').all())await loadEdition(row.id);
        saved=snapshot();stateBody=jsonBytes(saved);
      }
      if(stateBody.length>LIMITS.stateBytes)throw fault('WORKSPACE_EXPORT_LIMIT','The complete retained state exceeds the export limit.',413);
      const stateSha256=digest(stateBody),exportId=kind==='handback'?selected.id:stateSha256;
      const filename=kind==='handback'?'CIIM-reviewed-handback-'+exportId.slice(0,16)+'.zip':'CIIM-receiving-workspace-'+exportId.slice(0,16)+'.zip';
      const output=join(directory,'exports',filename),work=join(directory,'exports','.build-'+randomUUID());
      await privateDirectory(work,true);
      try{
        const files=[],add=async(path,body)=>{
          member(path);const file=join(work,path);await privateDirectory(dirname(file),true);
          await createFile(file,body);files.push({path,file,bytes:body.length,sha256:digest(body)});
        };
        await add('desk-state.json',stateBody);
        const originalArchives=[];
        for(const input of saved.candidates){
          const file=join(directory,'candidates',input.id,'archive.zip');
          const actual=await fileDescriptor(file,'originals/'+input.id+'.zip');
          if(actual.bytes!==input.bytes||actual.sha256!==input.sha256)throw fault('RETAINED_ARCHIVE_CHANGED','The complete original input differs.',409);
          files.push(actual);originalArchives.push({id:input.id,filename:input.filename,bytes:input.bytes,sha256:input.sha256,
            editionCoverage:input.editions.map(x=>({id:x.id,repository:x.repository.id,metadataPrefix:x.selection.metadataPrefix,nativeEditionId:x.nativeEditionId,records:x.counts.records}))});
        }
        const checkpoints=[];
        for(const row of saved.handbacks){
          const body=await checkpointBody(row.id),path='handback-state/'+row.id+'.json';
          await add(path,body);checkpoints.push({id:row.id,file:path,bytes:body.length,sha256:digest(body)});
        }
        if(selected){
          if(digest(jsonBytes(selected.frozen))!==selected.sha256||identity(selected.frozen)!==selected.id)
            throw fault('HANDBACK_CHANGED','The frozen named review differs.',409);
          await add('handback.json',jsonBytes(selected.frozen));
          await add('review.html',Buffer.from(handbackReport(selected),'utf8'));
          await add('reconciliation.json',jsonBytes({schema:'tjl.ciim.handback-reconciliation.v1',handbackId:selected.id,
            counts:selected.counts,editions:selected.frozen.editions.map(x=>({editionId:x.id,repository:x.repository,
              selection:x.selection,nativeEditionId:x.nativeEditionId,...x.reconciliation})),originalArchives}));
          for(const item of selected.frozen.editions){
            const original=await loadEdition(item.id);
            if(item.originalReport){
              if(!isDeepStrictEqual(item.originalReport,original.manifest.report))throw fault('NATIVE_REPORT_CHANGED','The original report descriptor differs.',409);
              const input=candidate(edition(item.id).candidateId);
              const resultRoot=join(directory,'candidates',input.id,'tree',item.resultDirectory);
              await add('original-reports/'+item.id+'.html',await nativeBody(resultRoot,item.originalReport));
            }
            const accepted=new Set(item.reconciliation.rows.filter(x=>x.decision==='accept').map(x=>x.id));
            const included=original.records.filter(x=>accepted.has(x.id));
            if(included.length!==item.reconciliation.accepted)throw fault('HANDBACK_COVERAGE','The reviewed original row population differs.',409);
            const raw=Buffer.concat(included.map(x=>x.raw));
            await add('reviewed/'+item.id+'.jsonl.gz',gzipSync(raw,{level:6,mtime:0}));
            await add('reviewed/'+item.id+'.json',jsonBytes({schema:'tjl.ciim.reviewed-population.v1',editionId:item.id,
              sourceRecords:item.counts.records,accepted:included.length,excluded:item.reconciliation.excluded,
              uncompressedBytes:raw.length,uncompressedSha256:digest(raw),originalManifestSha256:item.manifestSha256,
              sourceSha256:item.sourceSha256,profileReviews:item.profiles,editionReview:item.review}));
          }
          for(const item of selected.frozen.comparisons){
            const rows=db.prepare('SELECT data FROM comparison_rows WHERE comparison_id=? ORDER BY ordinal').all(item.id)
              .map(row=>parseJson(gunzipSync(Buffer.from(row.data),{maxOutputLength:LIMITS.memberBytes})));
            if(identity(rows)!==item.populationDigest)throw fault('COMPARISON_CHANGED','The frozen comparison population differs.',409);
            await add('comparisons/'+item.id+'.jsonl.gz',gzipSync(Buffer.concat(rows.map(jsonBytes)),{level:6,mtime:0}));
          }
        }
        const readme='# CIIM receiving '+(kind==='handback'?'reviewed handback':'workspace')+'\n\n'+
          'This complete package retains the original input ZIPs and exact native source/result editions. '+
          'No Proteus transformation is repeated by receiving or reopening this desk.\n\n'+
          'Open review.html for the named handback decisions when present. handback.json and reconciliation.json retain the full selected review population, including excluded original rows. '+
          'reviewed/*.jsonl.gz contains accepted native rows in their original order and encoding. An original deleted header remains an explicit withdrawal; absence from a later selection is never converted into deletion.\n\n'+
          'The complete desk checkpoint is desk-state.json. The original archives under originals/ include the full input case, so additional original editions can remain present beyond the selected review scope. '+
          'desk-package.json lists every member and the complete original input coverage. Historical handback checkpoints remain under handback-state/.\n\n'+
          'Reopen the package with the maintained CIIM desk CLI or its authenticated browser: prepare the ZIP, then workspace.restore into a fresh empty desk. '+
          'The original workspace, record, operation, comparison and review identities survive that receiving step. Choose the restored desk in Applications after receiving, so its exact marker is selected.\n\n'+
          'The recorded processing profile, authorities and receiving environment are explicit institutional choices. This package carries complete reviewed data; no external CIIM endpoint or credentials are embedded or invoked.\n';
        await add('README.md',Buffer.from(readme,'utf8'));
        const manifest={schema:'tjl.ciim.desk-package.v1',kind,workspaceId:saved.workspaceId,revision:saved.revision,
          stateFile:'desk-state.json',stateSha256,originalArchives,checkpoints,
          ...(selected?{handbackId:selected.id,handbackSha256:selected.sha256,reviewedEditionIds:selected.editionIds}: {})};
        const result=await createZip({output,files,manifest,python});
        return {file:result.file,filename,mime:'application/zip',bytes:result.bytes,sha256:result.sha256,kind,
          revision:saved.revision,...(selected?{handbackId:selected.id}:{})};
      }finally{await rm(work,{recursive:true,force:true});}
    }
    async function close() {
      if(closing)return closing;
      admission=false;
      closing=(async()=>{await tail;closed=true;editionCache.clear();db.close();await release();})();
      return closing;
    }
    const requireAdmission=fn=>(...args)=>{if(!admission||closed)throw fault('DESK_CLOSED','This receiving desk is closed.',409);return fn(...args);};
    return Object.freeze({directory,describe:describeCiimDesk,state:requireAdmission(state),
      view:options=>serialize(()=>view(options)),record:options=>serialize(()=>record(options)),prepareImport,act,
      exportWorkspace:()=>serialize(()=>exportComplete('workspace')),
      exportHandback:({handbackId}={})=>serialize(()=>exportComplete('handback',handbackId)),
      attachment:options=>serialize(()=>attachment(options)),close});
  }catch(error){try{db?.close();}finally{await release();}throw error;}
}
