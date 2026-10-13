// MIT. Agent operation of original SF30 query studies and complete native results.
import { constants } from 'node:fs';
import { open, realpath, lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { exact, failure, identifier, line, plain, privateSupportDirectory } from './host-files.mjs';
import { RetainedFileReads } from './retained-file-reads.mjs';
import {parseDatasetStudyDownloadManifest,validateDatasetStudyExportId,datasetStudyExportId,
 DATASET_STUDY_DOWNLOAD_SCHEMA} from './dataset-studies-download-contract.mjs';
export {DATASET_STUDY_DOWNLOAD_SCHEMA} from './dataset-studies-download-contract.mjs';
import { createStudy, validateStudy, updateStudy, checkpointStudy, forkStudy, restoreEdition,
  rebindStudy, sameSource, queryFromDraft, STUDY_MAX_BYTES } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-study-core.mjs';
export { datasetStudyTools } from './catalog/dataset-studies.mjs';

export const DATASET_STUDIES_CONNECTION_SCHEMA = 'stellar-forge.merchant-dataset-studies.v1';
const PREFIX = 'merchant_dataset_study_';
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const json = value => Buffer.from(JSON.stringify(value) + '\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const need = (ok, message, code='DATASET_STUDY_INVALID') => { if (!ok) throw failure(code,message); };
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
function count(value,minimum=0,maximum=Number.MAX_SAFE_INTEGER) {
  need(Number.isSafeInteger(value)&&value>=minimum&&value<=maximum,'Use an integer from '+minimum+' to '+maximum+'.'); return value;
}
function studyId(value) { need(typeof value==='string'&&ID.test(value),'Choose an original study ID.'); return value; }
function at(value) {
  need(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&
    !Number.isNaN(Date.parse(value)),'Supply the explicit original operation time in ISO UTC milliseconds.'); return value;
}
function pathValue(value,base) {
  need(typeof value==='string'&&value.length>0&&value.length<=4096&&!/[\x00-\x1f\x7f]/.test(value),
    'Declare original host paths in the private connection file.','CONFIGURATION_ERROR');
  return resolve(base,value);
}
async function canonical(value,base,kind) {
  const path=pathValue(value,base),actual=await realpath(path),info=await lstat(path);
  need(actual===path&&!info.isSymbolicLink()&&(kind==='file'?info.isFile():info.isDirectory()),
    'Select an existing canonical original '+kind+'.','CONFIGURATION_ERROR');
  return path;
}
async function readJSON(path,maximum,{privateFile=false}={}) {
  need(await realpath(path)===resolve(path),'The declared original input moved.','DATASET_STUDY_SOURCE_CHANGED');
  const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try {
    const before=await file.stat({bigint:true});
    need(before.isFile()&&before.size<=BigInt(maximum)&&(!privateFile||process.platform==='win32'||
      (before.mode&0o077n)===0n&&(!process.getuid||before.uid===BigInt(process.getuid()))),
      'Use an original regular file within its declared byte limit and private connection permissions.','CONFIGURATION_ERROR');
    const bytes=await file.readFile(),after=await file.stat({bigint:true});
    need(bytes.length<=maximum&&['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k]),
      'The original input changed while it was read.','DATASET_STUDY_SOURCE_CHANGED');
    return {value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),bytes,sha256:sha(bytes)};
  } finally { await file.close(); }
}
/** Bind declared local inputs without opening a dataset or starting a service. */
export async function readDatasetStudiesConfiguration(path) {
  path=resolve(path);
  const {value:raw}=await readJSON(path,1024*1024,{privateFile:true});
  exact(raw,['schema','workspaces'],['schema','workspaces']);
  need(raw.schema===DATASET_STUDIES_CONNECTION_SCHEMA&&plain(raw.workspaces)&&
    Object.keys(raw.workspaces).length>0&&Object.keys(raw.workspaces).length<=32,
    'Declare 1–32 original dataset study workspaces.','CONFIGURATION_ERROR');
  const base=dirname(path),workspaces=Object.create(null),directories=new Set();
  for(const [name,input] of Object.entries(raw.workspaces)) {
    identifier(name,'Dataset study workspace alias');
    exact(input,['label','datasetPath','stateDirectory','resource','catalogDirectory','studiesDirectory','imports'],['studiesDirectory']);
    need(own(input,'datasetPath')!==own(input,'stateDirectory'),'Select one original dataset configuration or service state directory.','CONFIGURATION_ERROR');
    const studiesDirectory=await canonical(input.studiesDirectory,base,'directory');
    await privateSupportDirectory(studiesDirectory);
    need(!directories.has(studiesDirectory),'Give each original studies directory one alias.','CONFIGURATION_ERROR');
    directories.add(studiesDirectory);
    const entry={label:line(input.label??name),studiesDirectory,imports:Object.create(null)};
    if(own(input,'datasetPath'))entry.datasetPath=await canonical(input.datasetPath,base,'file');
    else entry.stateDirectory=await canonical(input.stateDirectory,base,'directory');
    if(input.catalogDirectory!==undefined)entry.catalogDirectory=await canonical(input.catalogDirectory,base,'directory');
    if(input.resource!==undefined) {
      let url;try{url=new URL(input.resource);}catch{throw failure('CONFIGURATION_ERROR','Use the original canonical public dataset resource.');}
      need(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.href===input.resource,
        'Use the canonical HTTPS dataset resource.','CONFIGURATION_ERROR');
      entry.resource=input.resource;
    }
    need(input.imports===undefined||plain(input.imports)&&Object.keys(input.imports).length<=64,
      'Declare up to 64 complete study import files.','CONFIGURATION_ERROR');
    for(const [alias,value] of Object.entries(input.imports??{})) {
      identifier(alias,'Study import alias');entry.imports[alias]=await canonical(value,base,'file');
    }
    workspaces[name]=entry;
  }
  return {schema:DATASET_STUDIES_CONNECTION_SCHEMA,workspaces};
}
function page(values,offset=0,limit=20) {
  count(offset);count(limit,1,50);
  const selected=[];let size=0,index=offset,oversized=null;
  while(index<values.length&&selected.length<limit) {
    const bytes=json(values[index]).length;
    if(size+bytes>256*1024) {
      if(!selected.length){oversized={index,bytes,wholeFileAvailable:true};index++;}
      break;
    }
    selected.push(values[index++]);size+=bytes;
  }
  return {values:selected,page:{offset,limit,total:values.length,nextOffset:index<values.length?index:null,
    ...(oversized?{oversized}:{})}};
}
function sourceSummary(value) {
  return {mode:value.mode,resource:value.resource,dataset:{name:value.dataset.name,snapshot:value.dataset.snapshot,
    rowCount:value.dataset.rowCount,columns:value.dataset.columns.length},semanticsAvailable:Boolean(value.dataset.semantics)};
}
function successSummary(value) {
  return value?{snapshot:value.snapshot,query:value.query,executedAt:value.executedAt,
    requestUrl:value.requestUrl??null,requestUnavailable:value.requestUnavailable??null,
    fields:value.result.fields,page:value.result.page}:null;
}
function savedSummary(saved) {
  const s=saved.study;
  return {studyId:s.id,title:s.title,storageRevision:saved.storageRevision,updatedAt:s.updatedAt,
    editionCount:s.editions.length,source:sourceSummary(s.working.source),lastSuccess:successSummary(s.working.lastSuccess),
    exportId:datasetStudyExportId(s.id,saved.storageRevision),...(saved.recovered?{recovered:true}:{})};
}
function selectedExport(value) {
  const selected=validateDatasetStudyExportId(value);
  return selected.kind==='result'?{kind:'result',id:selected.exportId}:
    {kind:'study',id:selected.studyId,revision:selected.storageRevision};
}
async function withNative(h,original,operation) {
  const handle=original.readonlyFileHandle;h.metadataHandles.add(handle);
  try{return await operation(original);}
  finally{await handle.close();h.metadataHandles.delete(handle);}
}
async function nativeJSON(h,original,maximum) {
  return withNative(h,original,async()=>{
    const handle=original.readonlyFileHandle;
    need(original.bytes<=maximum,'The original native metadata exceeds its complete byte limit.');
    const bytes=Buffer.alloc(original.bytes);let position=0;
    while(position<bytes.length) {
      const result=await handle.read(bytes,position,bytes.length-position,position);
      need(result.bytesRead>0,'The original native metadata ended early.','DATASET_STUDY_CORRUPT');position+=result.bytesRead;
    }
    need(sha(bytes)===original.sha256,'The original native metadata changed.','DATASET_STUDY_CORRUPT');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  });
}
const operations = {
 list:['offset','limit'],open:['workspace'],status:['workspace','offset','limit'],
 inspect:['workspace','workspaceId','instanceId','studyId','revision','section','offset','limit'],
 create:['workspace','workspaceId','instanceId','studyId','title','at'],
 save:['workspace','workspaceId','instanceId','studyId','expectedRevision','changes','at','reason'],
 import_inspect:['workspace','workspaceId','instanceId','sourceImport'],
 import:['workspace','workspaceId','instanceId','sourceImport','expectedSourceSha256','expectedRevision','targetId','title','at'],
 fork:['workspace','workspaceId','instanceId','studyId','revision','targetId','title','at'],
 restore:['workspace','workspaceId','instanceId','studyId','expectedRevision','edition','at'],
 rebind:['workspace','workspaceId','instanceId','studyId','expectedRevision','expectedSnapshot','at'],
 query:['workspace','workspaceId','instanceId','studyId','expectedRevision','at','offset','limit'],
 export_start:['workspace','workspaceId','instanceId','studyId','expectedRevision','requestId'],
 export_resume:['workspace','workspaceId','instanceId','exportId'],
 exports:['workspace','workspaceId','instanceId','studyId','exportId','offset','limit'],
 manifest:['workspace','workspaceId','instanceId','exportId'],
 file:['workspace','workspaceId','instanceId','exportId','file','expectedManifestSha256','expectedSha256','readId','offset','limit'],
 file_release:['workspace','workspaceId','instanceId','exportId','readId'],
 browser_open:['workspace','workspaceId','instanceId','port'],
 browser_close:['workspace','workspaceId','instanceId'],
 close:['workspace','workspaceId','instanceId']
};
export class MerchantDatasetStudies {
  #config;#handles=new Map();#pending=new Set();#closing=false;#close;
  #reads=new RetainedFileReads({errorPrefix:'DATASET_STUDY',maxImmutableFileBytes:256*1024*1024});
  constructor(config){this.#config=config;}
  get summary(){return {configured:Boolean(this.#config.datasetStudies),opened:[...this.#handles.keys()],
    pending:this.#pending.size,closing:this.#closing,...this.#reads.summary};}
  #declared(name) {
    identifier(name,'Dataset study workspace alias');const entry=this.#config.datasetStudies?.workspaces?.[name];
    need(entry,'Choose a declared workspace from merchant_dataset_study_list.','DATASET_STUDY_NOT_CONFIGURED');return entry;
  }
  #list(args) {
    const entries=Object.entries(this.#config.datasetStudies?.workspaces??{}).map(([workspace,entry])=>({
      workspace,label:entry.label,source:entry.datasetPath?'file':'service',state:this.#handles.has(workspace)?'OPEN':'CLOSED',
      imports:Object.keys(entry.imports??{})}));
    return {...this.summary,...page(entries,args.offset,args.limit)};
  }
  async #open(name) {
    const entry=this.#declared(name);
    if(!this.#handles.has(name)) {
      const opening=(async()=>{
        const {openDatasetStudyWorkspace}=await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-workspace.mjs');
        const {label,imports,...options}=entry,operator=await openDatasetStudyWorkspace(options);
        return {entry,operator,instanceId:randomUUID(),tail:Promise.resolve(),closing:false,browser:null,close:null,metadataHandles:new Set(),manifests:new Map(),readExports:new Map()};
      })();
      this.#handles.set(name,opening);
      try{await opening;}catch(error){if(this.#handles.get(name)===opening)this.#handles.delete(name);throw error;}
    }
    return this.#status(name,{});
  }
  async #status(name,args) {
    const entry=this.#declared(name),opening=this.#handles.get(name);
    if(!opening)return {workspace:name,label:entry.label,state:'CLOSED'};
    const h=await opening,schema=await h.operator.source.schema(),listed=await h.operator.studies.list();
    const {values:studies,page:studiesPage}=page(listed.studies,args.offset,args.limit);
    return {workspace:name,label:entry.label,workspaceId:h.operator.workspaceId,instanceId:h.instanceId,
      state:h.closing?'CLOSING':'OPEN',source:sourceSummary({mode:schema.source,resource:schema.resource??null,dataset:schema.dataset}),
      studies,studiesPage,browser:{open:Boolean(h.browser),...(h.browser?{url:h.browser.url}:{})},
      imports:Object.keys(entry.imports??{}),fileReads:this.#reads.status(name)};
  }
  #identity(h,args) {
    need(args.workspaceId===h.operator.workspaceId&&args.instanceId===h.instanceId,
      'Reopen the declared workspace and use its actual workspaceId and current process instanceId.','DATASET_STUDY_INSTANCE_CONFLICT');
  }
  async #stop(name,h) {
    h.closing=true;
    if(!h.close)h.close=(async()=>{
      await h.tail;
      await this.#reads.closeScope(name);
      const closed=await Promise.allSettled([...h.metadataHandles].map(async handle=>{await handle.close();h.metadataHandles.delete(handle);}));
      need(closed.every(r=>r.status==='fulfilled'),'Retry closing retained native metadata handles.','DATASET_STUDY_CLOSE_INCOMPLETE');
      await h.operator.close();h.browser=null;this.#handles.delete(name);
      return {workspace:name,workspaceId:h.operator.workspaceId,instanceId:h.instanceId,state:'CLOSED'};
    })().catch(error=>{h.close=null;throw error;});
    return h.close;
  }
  async #manifest(h,exportId) {
    const selected=selectedExport(exportId),store=h.operator.studies;
    const cached=h.manifests.get(exportId);
    if(cached){h.manifests.delete(exportId);h.manifests.set(exportId,cached);return cached;}
    let files,studyId_,revision;
    if(selected.kind==='study') {
      const saved=await store.get(selected.id,{revision:selected.revision});
      const original=await store.openStudyFile(selected.id,{revision:selected.revision});
      files=await withNative(h,original,async value=>[{name:'study.json',bytes:value.bytes,sha256:value.sha256}]);
      studyId_=saved.study.id;revision=saved.storageRevision;
    } else {
      const {export:status}=await store.exportStatus(selected.id);
      need(status.status==='COMPLETE','Resume this same original result until complete before downloading its full package.','DATASET_STUDY_EXPORT_INCOMPLETE');
      const original=await nativeJSON(h,await store.openExportFile(selected.id,'manifest.json'),8*1024*1024);
      need(original.id===selected.id&&Array.isArray(original.pages),'The native completion manifest differs.','DATASET_STUDY_CORRUPT');
      files=[...status.files,...original.pages].map(({name,bytes,sha256})=>({name,bytes,sha256}));
      studyId_=status.studyId;revision=status.storageRevision;
    }
    need(files.length>0&&files.length<=4101&&new Set(files.map(f=>f.name)).size===files.length&&
      files.every(f=>typeof f.name==='string'&&/^[A-Za-z0-9_.-]+$/.test(f.name)&&
        Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=256*1024*1024&&HASH.test(f.sha256))&&
      files.reduce((sum,f)=>sum+f.bytes,0)<=1024*1024*1024,'The complete native file inventory differs.','DATASET_STUDY_CORRUPT');
    const manifest={schema:DATASET_STUDY_DOWNLOAD_SCHEMA,mode:'LOCAL_OPERATOR_PREVIEW',workspaceId:h.operator.workspaceId,
      exportId,kind:selected.kind,studyId:studyId_,storageRevision:revision,files},bytes=json(manifest);
    need(bytes.length<=8*1024*1024,'The complete download manifest exceeds its declared maximum.');
    parseDatasetStudyDownloadManifest(bytes,exportId);
    const retained={selected,manifest,bytes,descriptor:{name:'download-manifest.json',bytes:bytes.length,sha256:sha(bytes)}};
    h.manifests.set(exportId,retained);
    while(h.manifests.size>32||[...h.manifests.values()].reduce((sum,v)=>sum+v.bytes.length,0)>16*1024*1024)
      h.manifests.delete(h.manifests.keys().next().value);
    return retained;
  }
  async #execute(action,h,args) {
    const store=h.operator.studies;
    const loadRevision=async()=>store.get(studyId(args.studyId),{revision:count(args.expectedRevision,1)});
    const save=async study=>savedSummary(await store.save({study,expectedRevision:args.expectedRevision}));
    if(action==='inspect') {
      const saved=await store.get(studyId(args.studyId),args.revision===undefined?{}:{revision:count(args.revision,1)});
      const section=args.section??'working',s=saved.study;
      if(section==='history')return {...savedSummary(saved),section,...page(await store.history(s.id),args.offset,args.limit)};
      if(section==='editions')return {...savedSummary(saved),section,...page(s.editions.map(e=>({
        number:e.number,at:e.at,reason:e.reason,title:e.title,source:sourceSummary(e.source),success:e.success,
        draft:{mode:e.draft.mode,raw:e.draft.raw,selectedSnapshot:e.draft.selectedSnapshot,sort:e.draft.sort,descending:e.draft.descending,limit:e.draft.limit}})),args.offset,args.limit)};
      if(section==='rows')return {...savedSummary(saved),section,...page(s.working.lastSuccess?.result.rows??[],args.offset,args.limit)};
      need(section==='working','Select working, editions, history or rows.');
      const {columns,...draft}=s.working.draft;
      const fieldRows=columns.map(c=>({definition:s.working.source.dataset.columns.find(d=>d.name===c.name),draft:c}));
      return {...savedSummary(saved),section,createdAt:s.createdAt,parent:s.parent,draft,...page(fieldRows,args.offset,args.limit)};
    }
    if(action==='create') {
      const study=createStudy({schema:await h.operator.source.schema(),id:studyId(args.studyId),title:args.title,at:at(args.at)});
      return savedSummary(await store.save({study,expectedRevision:null}));
    }
    if(action==='save') {
      const prior=await loadRevision();exact(args.changes,['title','draft']);
      const study=checkpointStudy(updateStudy(prior.study,args.changes),{at:at(args.at),reason:args.reason});
      return save(study);
    }
    if(action==='import_inspect') {
      const path=h.entry.imports[identifier(args.sourceImport,'Study import alias')];
      need(path,'Choose a host-declared complete study import.','DATASET_STUDY_IMPORT_NOT_CONFIGURED');
      const imported=await readJSON(path,STUDY_MAX_BYTES),study=validateStudy(imported.value);
      return {sourceImport:args.sourceImport,sourceBytes:imported.bytes.length,sourceSha256:imported.sha256,
        studyId:study.id,title:study.title,editionCount:study.editions.length,source:sourceSummary(study.working.source),
        sourceMatches:sameSource(study,await h.operator.source.schema())};
    }
    if(action==='import') {
      const path=h.entry.imports[identifier(args.sourceImport,'Study import alias')];
      need(path,'Choose a host-declared complete study import.','DATASET_STUDY_IMPORT_NOT_CONFIGURED');
      need(HASH.test(args.expectedSourceSha256??''),'Pin the complete import to its original SHA256.');
      const imported=await readJSON(path,STUDY_MAX_BYTES);
      need(imported.sha256===args.expectedSourceSha256,'The declared whole study differs from the selected import.','DATASET_STUDY_SOURCE_CHANGED');
      let study=validateStudy(imported.value);
      if(args.targetId!==undefined) {
        need(args.expectedRevision===null,'A fork imports into a new study identity.');
        study=forkStudy(study,{id:studyId(args.targetId),title:args.title,at:at(args.at)});
      } else need(args.title===undefined&&args.at===undefined,'Preserve the complete original file or select an explicit fork.');
      need(args.expectedRevision===null||Number.isSafeInteger(args.expectedRevision)&&args.expectedRevision>0,
        'Select null for a new identity or its original expected storage revision.');
      const saved=await store.save({study,expectedRevision:args.expectedRevision});
      return {...savedSummary(saved),sourceSha256:imported.sha256,sourceBytes:imported.bytes.length,
        sourceMatches: sameSource(study,await h.operator.source.schema())};
    }
    if(action==='fork') {
      const original=await store.get(studyId(args.studyId),{revision:count(args.revision,1)});
      const study=forkStudy(original.study,{id:studyId(args.targetId),title:args.title,at:at(args.at)});
      need(study.id!==original.study.id,'Fork into a different study identity.');
      return savedSummary(await store.save({study,expectedRevision:null}));
    }
    if(action==='restore') {
      const prior=await loadRevision();return save(restoreEdition(prior.study,{number:count(args.edition,1,200),at:at(args.at)}));
    }
    if(action==='rebind') {
      const prior=await loadRevision(),schema=await h.operator.source.schema();
      need(args.expectedSnapshot===schema.dataset.snapshot,'Reopen the current source description before explicitly rebinding.','DATASET_STUDY_SOURCE_CHANGED');
      return save(rebindStudy(prior.study,{schema,at:at(args.at)}));
    }
    if(action==='query') {
      const prior=await loadRevision(),schema=await h.operator.source.schema();
      need(sameSource(prior.study,schema),'Explicitly rebind this study to the selected original source before querying.','DATASET_STUDY_SOURCE_CHANGED');
      at(args.at);
      const draft=prior.study.working.draft,raw=draft.mode==='raw'?draft.raw:queryFromDraft(draft,prior.study.working.source.dataset,{service:schema.source==='service'});
      const query=new URLSearchParams(raw);
      if(schema.source==='service') {
        const pinned=draft.selectedSnapshot||prior.study.working.source.dataset.snapshot;
        need(!query.has('snapshot')||query.get('snapshot')===pinned,'Select this raw query snapshot explicitly in the saved study controls.','DATASET_STUDY_SOURCE_CHANGED');
        query.set('snapshot',pinned);
      }
      const result=await h.operator.source.preview(query.toString());
      const study=checkpointStudy(updateStudy(prior.study,{lastSuccess:{...result,executedAt:at(args.at)}}),
        {at:args.at,reason:'Executed original dataset query'});
      const saved=await save(study);
      return {...saved,...page(result.result.rows,args.offset,args.limit)};
    }
    if(action==='export_start') {
      need(UUID.test(args.requestId??''),'Supply the original full-result request UUID.');
      const saved=await loadRevision(),success=saved.study.working.lastSuccess;
      need(success,'Run and save an original query before exporting its complete result.');
      return store.beginExport({studyId:saved.study.id,expectedRevision:args.expectedRevision,
        query:success.query,snapshot:success.snapshot,requestId:args.requestId});
    }
    if(action==='export_resume') {
      need(HASH.test(args.exportId??''),'Choose the original native full-result ID.');return store.resumeExport(args.exportId);
    }
    if(action==='exports') {
      if(args.exportId!==undefined){need(HASH.test(args.exportId),'Choose an original result ID.');return store.exportStatus(args.exportId);}
      const value=await store.listExports(args.studyId===undefined?{}:{studyId:studyId(args.studyId)});
      return page(value.exports,args.offset,args.limit);
    }
    if(action==='manifest') {
      const value=await this.#manifest(h,args.exportId);
      return {state:'MANIFEST_RETAINED',exportId:args.exportId,manifestFile:value.descriptor,
        kind:value.manifest.kind,fileCount:value.manifest.files.length,workspaceId:h.operator.workspaceId};
    }
    if(action==='file') {
      const value=await this.#manifest(h,args.exportId);
      need(args.expectedManifestSha256===value.descriptor.sha256,'Use the exact retained download manifest SHA256.','DATASET_STUDY_MANIFEST_CHANGED');
      const file=args.file===value.descriptor.name?value.descriptor:value.manifest.files.find(f=>f.name===args.file);
      need(file&&args.expectedSha256===file.sha256,'Choose a complete original file and its SHA256 from this manifest.','DATASET_STUDY_FILE_NOT_FOUND');
      const result=await this.#reads.read({scope:args.workspace,key:args.exportId+':'+args.file,kind:value.selected.kind,
        directory:this.#config.exportsDirectory,expectedSha256:file.sha256,readId:args.readId,offset:args.offset,limit:args.limit,
        load:async()=>args.file===value.descriptor.name?{bytes:value.bytes,name:file.name,type:'application/json'}:
          value.selected.kind==='study'?store.openStudyFile(value.selected.id,{revision:value.selected.revision}):
          store.openExportFile(value.selected.id,file.name)});
      const activeReads=new Set(this.#reads.status(args.workspace).sessions.map(read=>read.readId));
      for(const id of h.readExports.keys())if(!activeReads.has(id))h.readExports.delete(id);
      if(result.nextOffset===null)h.readExports.delete(result.readId);else h.readExports.set(result.readId,args.exportId);
      return {...result,exportId:args.exportId,manifestSha256:value.descriptor.sha256};
    }
    if(action==='file_release') {
      selectedExport(args.exportId);
      need(!h.readExports.has(args.readId)||h.readExports.get(args.readId)===args.exportId,
        'Release this read only with its original selected export.','DATASET_STUDY_READ_CONFLICT');
      await this.#reads.release(args.workspace,args.readId);h.readExports.delete(args.readId);
      return {released:true,exportId:args.exportId,readId:args.readId};
    }
    if(action==='browser_open') {
      h.browser=await h.operator.openBrowser({port:count(args.port??0,0,65535)});
      return {workspace:args.workspace,state:'OPEN',url:h.browser.url,workspaceId:h.operator.workspaceId,instanceId:h.instanceId};
    }
    if(action==='browser_close') {
      if(h.browser){await h.browser.close();h.browser=null;}return {workspace:args.workspace,state:'CLOSED',workspaceId:h.operator.workspaceId,instanceId:h.instanceId};
    }
    throw failure('TOOL_NOT_FOUND','Unknown dataset study operation.');
  }
  async #dispatch(name,args) {
    need(typeof name==='string'&&name.startsWith(PREFIX),'Choose an original dataset study tool.','TOOL_NOT_FOUND');
    const action=name.slice(PREFIX.length);need(own(operations,action),'Unknown dataset study operation.','TOOL_NOT_FOUND');
    exact(args,operations[action]);
    if(action==='list')return this.#list(args);
    if(action==='open')return this.#open(args.workspace);
    if(action==='status')return args.workspace===undefined?this.#list(args):this.#status(args.workspace,args);
    this.#declared(args.workspace);
    const opening=this.#handles.get(args.workspace);
    need(opening,'Open the selected original workspace first.','DATASET_STUDY_CLOSED');
    const h=await opening;this.#identity(h,args);
    if(action==='close')return this.#stop(args.workspace,h);
    need(!h.closing,'The original workspace is closing.','DATASET_STUDY_CLOSING');
    const operation=h.tail.then(()=>this.#execute(action,h,args));h.tail=operation.then(()=>{},()=>{});return operation;
  }
  async call(name,args={}) {
    need(!this.#closing,'The dataset studies adapter is closing.','DATASET_STUDY_CLOSING');
    const operation=this.#dispatch(name,args);this.#pending.add(operation);
    try{return await operation;}finally{this.#pending.delete(operation);}
  }
  close() {
    this.#closing=true;
    if(!this.#close)this.#close=(async()=>{
      await Promise.allSettled([...this.#pending]);
      const outcomes=await Promise.allSettled([...this.#handles].map(async([name,pending])=>this.#stop(name,await pending)));
      await this.#reads.close();
      need(outcomes.every(o=>o.status==='fulfilled'),'Retry closing the same original dataset owner.','DATASET_STUDY_CLOSE_INCOMPLETE');
    })().catch(error=>{this.#close=null;throw error;});
    return this.#close;
  }
}
