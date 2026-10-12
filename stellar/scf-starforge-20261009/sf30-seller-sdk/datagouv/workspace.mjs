// MIT. One operator workspace for complete retained source editions and native publication.
import {DatabaseSync} from 'node:sqlite';
import {chmod,mkdir,lstat,readdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join,resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readCapture,retainCapture,projectionFor,compareCaptures,hash,encoded,need,member,regular} from './capture.mjs';
import {openDataGouvPublisher} from './publisher.mjs';
import {loadDatasetConfig} from '../dataset-handler.mjs';
import {privateDirectory,acquireWorkspace,atomicJson,createFile,identity} from '../postgres/publisher/files.mjs';

const SCHEMA='stellar-forge.datagouv-operations.v1';
const HASH=/^[a-f0-9]{64}$/, UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const stamp=()=>new Date().toISOString();
const json=row=>row?JSON.parse(row.data):null;
const text=(v,label,max=2000)=>{need(typeof v==='string'&&v.trim()&&v.length<=max,'Enter '+label);return v.trim();};
const req=id=>{need(UUID.test(id??''),'Use one version-4 UUID for this original request');return id;};
async function exists(file){try{await lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function putExact(file,raw){await mkdir(dirname(file),{recursive:true,mode:0o700});try{await createFile(file,raw);}catch(e){if(e.code!=='EEXIST')throw e;need(hash(await regular(file))===hash(raw),'An original retained file already differs');}}
function safeAliases(header){const used=new Set();return Object.fromEntries(header.map((field,index)=>{let alias=field.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'');if(!/^[a-z]/.test(alias))alias='field_'+(index+1)+'_'+alias;alias=alias.slice(0,58)||'field_'+(index+1);while(used.has(alias))alias=alias.slice(0,57)+'_'+(index+1);used.add(alias);return [alias,{field,type:'string',nullable:false,encoding:'native'}];}));}
export async function openDataGouvWorkspace({directory,create=false,title='Publisher operations'}={}){
  directory=resolve(directory);need(directory!=='/','Select a private workspace directory');
  if(create)need(!await exists(directory),'Reopen the existing workspace without create');
  await privateDirectory(directory,create);const release=await acquireWorkspace(directory);let db,tail=Promise.resolve(),closed=false,active=null;
  try{
    const path=join(directory,'operations.sqlite');
    if(!create)need(await exists(path),'The original operations database is missing');
    db=new DatabaseSync(path);await chmod(path,0o600);
    db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; "+
      "CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,data TEXT NOT NULL); "+
      "CREATE TABLE IF NOT EXISTS captures(hash TEXT PRIMARY KEY,data TEXT NOT NULL); "+
      "CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,kind TEXT NOT NULL,input_hash TEXT NOT NULL,result TEXT); "+
      "CREATE TABLE IF NOT EXISTS publications(id TEXT PRIMARY KEY,data TEXT NOT NULL); "+
      "CREATE TABLE IF NOT EXISTS comparisons(id TEXT PRIMARY KEY,data TEXT NOT NULL); "+
      "CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,created TEXT NOT NULL,kind TEXT NOT NULL,subject TEXT,data TEXT NOT NULL); "+
      "CREATE TABLE IF NOT EXISTS provider_operations(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL);");
    const set=(key,value)=>db.prepare('INSERT INTO settings(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(key,JSON.stringify(value));
    const get=key=>json(db.prepare('SELECT data FROM settings WHERE key=?').get(key));
    const transaction=action=>{db.exec('BEGIN IMMEDIATE');try{const v=action();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}};
    const event=(kind,subject,data={})=>db.prepare('INSERT INTO events(created,kind,subject,data) VALUES(?,?,?,?)').run(stamp(),kind,subject??null,JSON.stringify(data));
    const revision=()=>get('selection');
    if(create){transaction(()=>{set('workspace',{schema:SCHEMA,id:randomUUID(),title:text(title,'a workspace name',160),createdAt:stamp()});set('selection',{revision:0,publicationId:null,updatedAt:stamp()});event('WORKSPACE_CREATED',null);});for(const name of ['captures','publications','comparisons'])await mkdir(join(directory,name),{mode:0o700});}
    need(get('workspace')?.schema===SCHEMA,'This is not the original data.gouv operations workspace');
    const serialize=(kind,action)=>{need(!closed,'Workspace is closed');const result=tail.then(async()=>{active=kind;try{return await action();}finally{active=null;}});tail=result.catch(()=>{});return result;};
    const all=table=>db.prepare('SELECT data FROM '+table).all().map(json);
    const publication=id=>{const p=json(db.prepare('SELECT data FROM publications WHERE id=?').get(id));need(p,'Choose a saved publication');return p;};
    const savePublication=(p,kind)=>{const value={...p,updatedAt:stamp()};transaction(()=>{db.prepare('INSERT INTO publications(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id,JSON.stringify(value));event(kind,value.id,{state:value.state,planId:value.planId,runId:value.runId,error:value.error??null});});return value;};
    const captureRecord=value=>{need(HASH.test(value??''),'Select a retained capture');const c=json(db.prepare('SELECT data FROM captures WHERE hash=?').get(value));need(c,'The selected complete capture is not retained');return c;};
    const capture=async value=>{const c=captureRecord(value);return readCapture(member(directory,c.path),value);};
    function beginRequest(id,kind,input){req(id);const digest=identity(input);const old=db.prepare('SELECT * FROM requests WHERE id=?').get(id);if(old){need(old.kind===kind&&old.input_hash===digest,'This request ID belongs to different original input');return {existing:true,result:old.result?JSON.parse(old.result):null};}db.prepare('INSERT INTO requests(id,kind,input_hash,result) VALUES(?,?,?,NULL)').run(id,kind,digest);return {existing:false,result:null};}
    function finishRequest(id,result){db.prepare('UPDATE requests SET result=? WHERE id=?').run(JSON.stringify(result),id);return result;}
    async function native(p,action){const dir=member(directory,p.nativePath),has=await exists(dir);let publisher;
      if(has&&!await exists(join(dir,'workspace.json')))throw new Error('Inspect the incomplete original native publisher directory before continuing');
      try{publisher=await openDataGouvPublisher({directory:dir,create:!has,sourceFile:member(directory,p.sourcePath),targetDirectory:member(directory,p.targetPath),relativePaths:true});return await action(publisher);}
      finally{await publisher?.close();}
    }
    function mirror(p,run,kind){return savePublication({...p,state:run.state,native:run,reviewId:run.data?.review?.id??p.reviewId??null,error:run.data?.error??null,snapshot:run.data?.publication?.snapshot??run.data?.candidate?.dataset?.snapshot??p.snapshot??null},kind);}
    async function planOriginal(p){const c=await capture(p.captureHash),source=encoded({schema:'stellar-forge.datagouv-source.v1',datasetId:c.manifest.dataset_id,resourceId:c.manifest.resource_id,
        connection:{kind:'retained-public-csv',file:relative(dirname(member(directory,p.sourcePath)),member(directory,captureRecord(p.captureHash).path)).split('\\').join('/'),sha256:p.captureHash},projection:p.input.projection});
      await putExact(member(directory,p.sourcePath),source);
      return native(p,async n=>{const inspected=await n.source();const names=Object.keys(p.input.projection);
        const input={title:p.input.label,query:'dataset',input:{},sourceHash:inspected.hash,
          dataset:{name:p.input.label,columns:Object.fromEntries(names.map(name=>[name,{type:'string',nullable:false}])),filters:names,sorts:names,ranges:[],maxCellChars:p.input.maxCellChars,defaultLimit:50,maxLimit:250,maxPageBytes:921600},
          extraction:{order:p.input.order,maxRows:p.input.maxRows,maxBytes:p.input.maxBytes,maxRowBytes:p.input.maxRowBytes,timeoutMs:p.input.timeoutMs}};
        const saved=await n.savePlan(input,{requestId:p.planRequestId});
        return savePublication({...p,state:'PLAN_READY',planId:saved.id,planDigest:saved.data.digest,error:null},'PUBLICATION_PLAN_SAVED');});
    }
    const datasetCache=new Map();
    const status=()=>({schema:SCHEMA,workspace:get('workspace'),selection:revision(),active,
      captures:all('captures').sort((a,b)=>b.importedAt.localeCompare(a.importedAt)),
      publications:all('publications').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),
      comparisons:all('comparisons').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),
      providerOperations:db.prepare('SELECT id,revision,data FROM provider_operations').all().map(x=>({id:x.id,revision:x.revision,...JSON.parse(x.data)})),
      history:db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 100').all().map(x=>({...x,data:JSON.parse(x.data)}))});
    async function importCapture(input){return serialize('Retaining complete source',async()=>{
      const clean={manifest:resolve(input.manifest),expectedSha256:input.expectedSha256??null,label:text(input.label,'a source edition label',160)};
      const previous=beginRequest(input.requestId,'import',clean);if(previous.result)return previous.result;
      const c=await readCapture(clean.manifest,clean.expectedSha256),path='captures/'+c.manifestHash+'/capture.json';
      await retainCapture(c,dirname(member(directory,path)));
      const existing=json(db.prepare('SELECT data FROM captures WHERE hash=?').get(c.manifestHash));
      const row=existing??{hash:c.manifestHash,path,label:clean.label,importedAt:stamp(),datasetId:c.manifest.dataset_id,resourceId:c.manifest.resource_id,title:c.metadata.title,
        rowCount:c.manifest.row_count,header:c.manifest.header,license:c.metadata.license,sourceUrl:c.metadata.page??c.manifest.dataset_url??null,resourceUrl:c.metadata.resources.find(x=>x.id===c.manifest.resource_id).url,
        originalSha256:c.manifest.files.find(x=>x.path==='original/resource.csv').sha256,sourceDate:c.manifest.captured_at??c.manifest.completed_at??null,
        temporalCoverage:c.metadata.temporal_coverage??null,frequency:c.metadata.frequency??null,keyAnalysis:c.manifest.key_analysis,columns:{blankCells:c.manifest.blank_cells,leadingZeroValues:c.manifest.leading_zero_values,literalNullTokens:c.manifest.literal_null_tokens,maxCellChars:c.manifest.max_cell_chars}};
      transaction(()=>{db.prepare('INSERT OR IGNORE INTO captures(hash,data) VALUES(?,?)').run(row.hash,JSON.stringify(row));event('SOURCE_RETAINED',row.hash,{label:row.label,rowCount:row.rowCount});finishRequest(input.requestId,row);});return row;
    });}
    async function inspectCapture(id,{offset=0,limit=25}={}){const c=await capture(id);need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=250,'Choose a valid source page');return {capture:captureRecord(id),manifest:c.manifest,metadata:c.metadata,projection:safeAliases(c.manifest.header),rows:c.rows.slice(offset,offset+limit),page:{offset,limit,total:c.rows.length,next:offset+limit<c.rows.length?offset+limit:null}};}
    async function preparePublication(input){return serialize('Saving publication plan',async()=>{
      const c=await capture(input.captureHash),projection=projectionFor(c.manifest.header,input.projection),names=Object.keys(projection);
      const order=input.order??[{column:names[0],direction:'asc'}];need(Array.isArray(order)&&order.length>0&&order.every(x=>names.includes(x.column)&&['asc','desc'].includes(x.direction)),'Choose a retained field ordering');
      const clean={captureHash:c.manifestHash,label:text(input.label,'a publication name',128),projection,order,
        maxRows:input.maxRows??1000000,maxBytes:input.maxBytes??268435456,maxRowBytes:input.maxRowBytes??1048576,timeoutMs:input.timeoutMs??300000,maxCellChars:input.maxCellChars??65536};
      const previous=beginRequest(input.requestId,'publication',clean);
      let p=previous.result?publication(previous.result.id):all('publications').find(x=>x.requestId===input.requestId);
      if(!p){p={id:randomUUID(),requestId:input.requestId,captureHash:c.manifestHash,input:clean,label:clean.label,createdAt:stamp(),state:'PLANNING',planRequestId:randomUUID(),runId:randomUUID()};
        p.sourcePath='publications/'+p.id+'/source.json';p.nativePath='publications/'+p.id+'/native';p.targetPath='publications/'+p.id+'/dataset';
        savePublication(p,'PUBLICATION_PREPARED');}
      if(p.planId){finishRequest(input.requestId,{id:p.id});return p;}
      try{p=await planOriginal(p);finishRequest(input.requestId,{id:p.id});return p;}
      catch(e){savePublication({...p,error:e.message},'PLAN_INTERRUPTED');throw e;}
    });}
    async function extract(id){return serialize('Building complete publication',async()=>{let p=publication(id);if(!p.planId)p=await planOriginal(p);
      return native(p,async n=>{let prior;try{prior=n.run(p.runId);}catch(e){if(e.code!=='RUN_NOT_FOUND')throw e;}
        if(prior){if(['FAILED','CANCELLED','INTERRUPTED'].includes(prior.state)){try{prior=await n.recover(p.runId);}catch(e){return mirror(p,{...prior,data:{...prior.data,error:'Original incomplete extraction retained; inspect the stopped run, then use retry-extraction to continue the same saved publication and plan.'}},'EXTRACTION_INSPECTED');}}
          return mirror(p,prior,'EXTRACTION_REOPENED');}
        savePublication({...p,state:'EXTRACTING'},'EXTRACTION_REQUESTED');
        const started=n.startExtraction(p.planId,{id:p.runId}),run=await started.completion;return mirror(p,run,'EXTRACTION_COMPLETED');});
    });}
    async function retryExtraction(id,input){return serialize('Preparing an explicit extraction continuation',async()=>{const p=publication(id),clean={publicationId:id,reason:text(input.reason,'the extraction continuation reason')};const previous=beginRequest(input.requestId,'retry-extraction',clean);if(previous.result)return publication(id);
      return native(p,async n=>{const old=n.run(p.runId);need(['FAILED','CANCELLED','INTERRUPTED'].includes(old.state),'Only a definitively stopped extraction can start a new retained attempt');
        const next=savePublication({...p,state:'PLAN_READY',runId:randomUUID(),reviewId:null,native:null,error:null,snapshot:null,previousRuns:[...(p.previousRuns??[]),{id:p.runId,state:old.state,reason:clean.reason,retainedAt:stamp()}]},'EXTRACTION_CONTINUATION_PREPARED');finishRequest(input.requestId,{id:next.id,runId:next.runId});return next;});});}
    async function inspectPublication(id,query='limit=25'){const p=publication(id);return serialize('Reading original publication',()=>native(p,n=>n.inspect(p.runId,query)));}
    async function review(id,input){return serialize('Recording source review',async()=>{const p=publication(id);
      const clean={reviewer:text(input.reviewer,'the reviewer name',128),note:text(input.note,'the source and publication review'),captureHash:input.captureHash};
      need(clean.captureHash===p.captureHash,'Review the exact retained original source');const previous=beginRequest(input.requestId,'review:'+id,clean);if(previous.result)return publication(id);
      return native(p,async n=>{const current=n.run(p.runId);
        if(current.state==='PUBLISHED')throw new Error('This local edition is already published; use its existing record');
        let run=current;
        if(current.state==='REVIEWED'&&current.data.review?.reviewer===clean.reviewer&&current.data.review?.note===clean.note)run=current;
        else run=await n.review(p.runId,{reviewer:clean.reviewer,note:clean.note,initialize:true});
        const next=mirror(p,run,'PUBLICATION_REVIEWED');finishRequest(input.requestId,{id:next.id,reviewId:next.reviewId});return next;});
    });}
    async function publish(id,input){return serialize('Publishing local edition',async()=>{let p=publication(id);
      const clean={reviewId:input.reviewId};need(typeof clean.reviewId==='string'&&clean.reviewId===p.reviewId,'Select the original exact candidate review');const previous=beginRequest(input.requestId,'publish:'+id,clean);if(previous.result)return publication(id);
      return native(p,async n=>{let run=n.run(p.runId);
        if(['PUBLISHING','PUBLICATION_UNKNOWN'].includes(run.state)){run=await n.recover(p.runId);p=mirror(p,run,'PUBLICATION_RECONCILED');if(run.state!=='PUBLISHED')throw new Error('Original local publication outcome needs reconciliation before another explicit publication');}
        else if(run.state!=='PUBLISHED')run=await n.publish(p.runId,clean.reviewId);
        p=mirror(p,run,'LOCAL_EDITION_PUBLISHED');need(run.state==='PUBLISHED','The native publication did not complete; inspect the original outcome');
        finishRequest(input.requestId,{id:p.id,snapshot:p.snapshot});return p;});
    });}
    async function recover(id){return serialize('Reconciling original native operation',async()=>{const p=publication(id);return native(p,async n=>mirror(p,await n.recover(p.runId),'PUBLICATION_RECONCILED'));});}
    async function select(input){return serialize('Selecting current local edition',async()=>{const p=publication(input.publicationId),clean={publicationId:p.id,expectedRevision:input.expectedRevision,reviewer:text(input.reviewer,'the reviewer name',128),note:text(input.note,'the selection reason')};
      const previous=beginRequest(input.requestId,'select',clean);if(previous.result)return previous.result;need(p.state==='PUBLISHED','Select a fully published local edition');
      return transaction(()=>{const before=revision();need(before.revision===clean.expectedRevision,'The current edition changed; review the current selection');
        const next={revision:before.revision+1,publicationId:p.id,updatedAt:stamp()};set('selection',next);event('CURRENT_EDITION_SELECTED',p.id,{before,...next,reviewer:clean.reviewer,note:clean.note});return finishRequest(input.requestId,next);});
    });}
    async function compare(input){return serialize('Comparing complete editions',async()=>{const clean={before:input.before,after:input.after,keys:input.keys};const previous=beginRequest(input.requestId,'compare',clean);if(previous.result)return previous.result;
      const left=await capture(clean.before),right=await capture(clean.after),comparison=compareCaptures(left,right,clean.keys),id=comparison.sha256,path='comparisons/'+id+'.json';await putExact(member(directory,path),encoded(comparison));
      const {changes,...summary}=comparison;const row={id,path,createdAt:stamp(),state:'AWAITING_DECISION',summary,decision:null};
      transaction(()=>{db.prepare('INSERT OR IGNORE INTO comparisons(id,data) VALUES(?,?)').run(id,JSON.stringify(row));event('EDITIONS_COMPARED',id,{...summary});});
      const retained=json(db.prepare('SELECT data FROM comparisons WHERE id=?').get(id));finishRequest(input.requestId,retained);return retained;});
    }
    async function comparison(id,{offset=0,limit=100}={}){need(HASH.test(id??''),'Select a complete edition comparison');const row=json(db.prepare('SELECT data FROM comparisons WHERE id=?').get(id));need(row,'The comparison is not retained');const data=JSON.parse(await regular(member(directory,row.path)));const {sha256,...plain}=data;need(hash(encoded(plain))===id&&sha256===id,'The full comparison changed');need(Number.isInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0&&limit<=250,'Choose a comparison page');return {...row,changes:data.changes.slice(offset,offset+limit),page:{offset,limit,total:data.changes.length,next:offset+limit<data.changes.length?offset+limit:null}};}
    async function decide(input){return serialize('Recording edition decision',async()=>{need(['keep','accept','withdraw'].includes(input.action),'Choose keep, accept, or withdraw');const row=json(db.prepare('SELECT data FROM comparisons WHERE id=?').get(input.comparisonId));need(row,'Choose the original comparison');
      const clean={comparisonId:row.id,action:input.action,publicationId:input.publicationId??null,expectedRevision:input.expectedRevision,reviewer:text(input.reviewer,'the reviewer name',128),note:text(input.note,'the edition decision')};
      const previous=beginRequest(input.requestId,'decision',clean);if(previous.result)return previous.result;
      if(clean.action==='accept'){const p=publication(clean.publicationId);need(p.state==='PUBLISHED'&&p.captureHash===row.summary.after,'Accept the published local edition made from the compared following source');}
      return transaction(()=>{const before=revision();need(before.revision===clean.expectedRevision,'The active edition changed; review it before recording this decision');
        if(before.publicationId)need(publication(before.publicationId).captureHash===row.summary.before,'The comparison does not begin with the current source edition');
        const next={revision:before.revision+1,publicationId:clean.action==='withdraw'?null:clean.action==='accept'?clean.publicationId:before.publicationId,updatedAt:stamp()};
        const value={...row,state:clean.action.toUpperCase(),decision:{...clean,recordedAt:stamp(),before,after:next}};set('selection',next);db.prepare('UPDATE comparisons SET data=? WHERE id=?').run(JSON.stringify(value),row.id);event('EDITION_'+clean.action.toUpperCase(),row.id,value.decision);return finishRequest(input.requestId,value);});
    });}
    async function query(input={}){const id=input.publicationId??revision().publicationId;need(id,'Select a current local edition before querying');const p=publication(id);need(p.state==='PUBLISHED','The selected local edition is not published');
      const config=member(directory,p.nativePath+'/runs/'+p.runId+'/dataset.json'),csv=member(directory,p.nativePath+'/runs/'+p.runId+'/data.csv');
      const [cs,ds]=await Promise.all([lstat(config),lstat(csv)]),signature=[cs.size,cs.mtimeMs,ds.size,ds.mtimeMs].join(':');
      let entry=datasetCache.get(p.id);
      if(entry)need(entry.signature===signature,'An original published file changed; reopen its retained native record');
      else{const dataset=await loadDatasetConfig(config);need(dataset.describe().snapshot===p.snapshot,'The original published snapshot changed');entry={dataset,signature,rows:dataset.describe().rowCount};datasetCache.set(p.id,entry);}
      datasetCache.delete(p.id);datasetCache.set(p.id,entry);
      while(datasetCache.size>1&&(datasetCache.size>4||[...datasetCache.values()].reduce((n,x)=>n+x.rows,0)>200000))datasetCache.delete(datasetCache.keys().next().value);
      const dataset=entry.dataset;
      const parameters=new URLSearchParams(input.query??'limit=50');const result=dataset.handle({query:parameters});return {...result,headers:{...result.headers,'x-publication-id':p.id,'cache-control':'no-store'}};}
    async function download(kind,id){if(kind==='original'){const c=await capture(id);return {filename:'original-resource.csv',contentType:'text/csv; charset=utf-8',bytes:c.rawFiles.get('original/resource.csv')};}
      if(kind==='manifest'){const c=await capture(id);return {filename:'capture.json',contentType:'application/json',bytes:c.manifestBytes};}
      if(kind==='comparison'){const c=json(db.prepare('SELECT data FROM comparisons WHERE id=?').get(id));need(c,'Select a retained comparison');return {filename:'complete-comparison.json',contentType:'application/json',bytes:await regular(member(directory,c.path))};}
      const p=publication(id);need(p.native?.data?.candidate,'Build the complete local edition first');const name=kind==='csv'?'data.csv':kind==='candidate'?'candidate.json':kind==='config'?'dataset.json':null;need(name,'Unknown export type');
      return {filename:name,contentType:name.endsWith('.csv')?'text/csv; charset=utf-8':'application/json',bytes:await regular(member(directory,p.nativePath+'/runs/'+p.runId+'/'+name))};}
    async function exportArchive({sourceRoot}={}){return serialize('Exporting complete workspace',async()=>{need(typeof sourceRoot==='string','Select the installed application source root');const entries=[];let total=0;
      async function walk(root,folder,prefix){for(const item of (await readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(folder,item.name),rel=relative(root,path).split('\\').join('/');
          if(['publisher.lock','.DS_Store'].includes(item.name)||item.name.startsWith('.pending-'))continue;
          need(!item.isSymbolicLink(),'Portable exports do not follow links');if(item.isDirectory()){await walk(root,path,prefix);continue;}
          need(item.isFile(),'Close active external services before exporting their sockets');need(!/-journal$|-wal$|-shm$/.test(item.name),'A database transaction is still open');
          const raw=await regular(path);total+=raw.length;need(total<=512*1024*1024,'Complete workspace exceeds the reviewed archive limit');entries.push({path:prefix+'/'+rel,bytes:raw.length,sha256:hash(raw),contentBase64:raw.toString('base64')});}}
      await walk(directory,directory,'workspace');
      const applicationRoot=resolve(sourceRoot),inventoryPath=member(applicationRoot,'products/datagouv/application-files.json');
      const inventory=JSON.parse(await regular(inventoryPath,1024*1024));
      need(inventory.schema==='stellar-forge.datagouv-application-files.v1'&&Array.isArray(inventory.files)&&inventory.files.length>0&&inventory.files.length<=512,'Select the complete installed application inventory');
      need(new Set(inventory.files).size===inventory.files.length,'The application inventory contains duplicate paths');
      for(const rel of inventory.files){
        need(typeof rel==='string'&&rel.length>0&&!rel.split('/').some(part=>part.startsWith('.')),'The application inventory must contain ordinary source paths');
        const raw=await regular(member(applicationRoot,rel));total+=raw.length;
        need(total<=512*1024*1024,'Complete workspace exceeds the reviewed archive limit');
        entries.push({path:'application/'+rel,bytes:raw.length,sha256:hash(raw),contentBase64:raw.toString('base64')});
      }
      const file={schema:'stellar-forge.datagouv-portable-workspace.v1',createdAt:stamp(),workspace:get('workspace'),selection:revision(),complete:true,files:entries};
      return {filename:'publisher-workspace.datawork',contentType:'application/octet-stream',bytes:encoded(file),manifest:{files:entries.length,bytes:total}};
    });}
    const loadOperation=async id=>{const row=db.prepare('SELECT revision,data FROM provider_operations WHERE id=?').get(id);return row?{...JSON.parse(row.data),revision:row.revision}:null;};
    const saveOperation=async(id,next,expectedRevision)=>serialize('Saving portal operation',()=>transaction(()=>{need(typeof id==='string'&&id.length>0&&id.length<=160,'Select the original provider operation');const row=db.prepare('SELECT revision FROM provider_operations WHERE id=?').get(id),previous=row?.revision??null;
      if(previous!==expectedRevision)return false;const newRevision=previous===null?0:previous+1;need(next&&typeof next==='object','Provider operation state is required');const data={...next,revision:newRevision};
      db.prepare('INSERT INTO provider_operations(id,revision,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data').run(id,newRevision,JSON.stringify(data));event('PROVIDER_OPERATION_SAVED',id,{revision:newRevision,state:next.state??next.phase??null});return true;}));
    async function history({offset=0,limit=100}={}){need(Number.isInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0&&limit<=250,'Choose an operation history page');const total=db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
      return {rows:db.prepare('SELECT * FROM events ORDER BY id ASC LIMIT ? OFFSET ?').all(limit,offset).map(x=>({...x,data:JSON.parse(x.data)})),page:{offset,limit,total,next:offset+limit<total?offset+limit:null}};}
    async function close(){if(closed)return;closed=true;await tail;db.close();await release();}
    return Object.freeze({directory,status,importCapture,inspectCapture,preparePublication,extract,retryExtraction,inspectPublication,review,publish,recover,select,compare,comparison,decide,query,download,exportArchive,history,loadOperation,saveOperation,close});
  }catch(e){db?.close();await release();throw e;}
}
export async function receiveArchive({file,directory,expectedSha256}={}){
  directory=resolve(directory);need(!await exists(directory),'Receive into one new directory');const raw=await regular(resolve(file),768*1024*1024);
  if(expectedSha256)need(hash(raw)===expectedSha256,'The selected complete archive changed');const packet=JSON.parse(raw);
  need(packet.schema==='stellar-forge.datagouv-portable-workspace.v1'&&packet.complete===true&&Array.isArray(packet.files)&&packet.files.length>0&&packet.files.length<=20000,'A complete publisher workspace archive is required');
  const seen=new Set();let total=0;for(const entry of packet.files){need(!seen.has(entry.path)&&/^(workspace|application)\//.test(entry.path),'Invalid or repeated complete archive member');seen.add(entry.path);member(directory,entry.path);
    const bytes=Buffer.from(entry.contentBase64,'base64');need(bytes.toString('base64')===entry.contentBase64&&bytes.length===entry.bytes&&hash(bytes)===entry.sha256,'Complete archive member changed: '+entry.path);total+=bytes.length;need(total<=512*1024*1024,'Complete archive exceeds its receiving limit');}
  need(seen.has('workspace/operations.sqlite'),'The original workspace database is missing');
  const members=new Map(packet.files.map(entry=>[entry.path,entry]));
  const inventoryMember=members.get('application/products/datagouv/application-files.json');
  need(inventoryMember&&seen.has('application/start-publisher.mjs'),'The complete receiving application is missing');
  const inventory=JSON.parse(Buffer.from(inventoryMember.contentBase64,'base64'));
  need(inventory.schema==='stellar-forge.datagouv-application-files.v1'&&Array.isArray(inventory.files)&&inventory.files.length>0&&inventory.files.length<=512,'The receiving application inventory is invalid');
  need(new Set(inventory.files).size===inventory.files.length&&inventory.files.includes('start-publisher.mjs')&&inventory.files.includes('products/datagouv/application-files.json'),'The complete application entrypoint and inventory must be retained');
  for(const rel of inventory.files){
    need(typeof rel==='string'&&rel.length>0&&!rel.split('/').some(part=>part.startsWith('.')),'The receiving application inventory contains an invalid path');
    member(directory,'application/'+rel);need(seen.has('application/'+rel),'A required receiving application file is missing: '+rel);
  }
  await mkdir(directory,{mode:0o700});
  for(const entry of packet.files)await putExact(member(directory,entry.path),Buffer.from(entry.contentBase64,'base64'));
  const workspace=await openDataGouvWorkspace({directory:join(directory,'workspace')});let result;
  try{result=workspace.status();need(result.workspace.id===packet.workspace?.id&&identity(result.selection)===identity(packet.selection),'The received workspace identity or selected edition differs from its archive');for(const c of result.captures)await workspace.inspectCapture(c.hash,{limit:1});
    for(const p of result.publications.filter(x=>x.state==='PUBLISHED')){const response=await workspace.query({publicationId:p.id,query:'limit=1'});need(response.status===200&&response.body.dataset.snapshot===p.snapshot,'A received published edition did not reopen with its original snapshot');}}
  finally{await workspace.close();}
  await putExact(join(directory,'receiving.json'),encoded({schema:'stellar-forge.datagouv-receiving.v1',receivedAt:stamp(),archiveSha256:hash(raw),members:seen.size,bytes:total,workspaceId:result.workspace.id,selection:result.selection}));
  return {directory,workspaceId:result.workspace.id,files:seen.size,bytes:total,archiveSha256:hash(raw),selection:result.selection};
}
