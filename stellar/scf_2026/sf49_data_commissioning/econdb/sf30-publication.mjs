// MIT. Econdb retained-source publication through the ORIGINAL SF30 dataset engine.
import {constants} from 'node:fs';
import {open, mkdir, lstat, readFile, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readSnapshot, selectPeriod, VERSION, CONTRACT_SHA256} from './maritime-analysis.mjs';
import {loadDatasetConfig} from '../../../scf-starforge-20261009/sf30-seller-sdk/dataset-handler.mjs';
import {buildDatasetSellerConfig} from '../../../scf-starforge-20261009/sf30-seller-sdk/dataset-cli.mjs';
import {openDatasetVersions} from '../../../scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/versions.mjs';
import {datasetControl} from '../../../scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/service.mjs';

const MAX_SOURCE_BYTES=64*1024*1024, MAX_ROWS=250000, MAX_CSV_BYTES=64*1024*1024;
const MAX_METADATA_BYTES=16*1024*1024;
const FORMAT='econdb.sf30-publication.v1';
const HASH=/^[a-f0-9]{64}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function need(ok,message){if(!ok)throw new TypeError(message);}
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(object(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 need(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value),'Finite JSON values required');
 return value;
}
const json=value=>Buffer.from(JSON.stringify(canonical(value),null,2)+'\n','utf8');
const identity=value=>hash(Buffer.from(JSON.stringify(canonical(value))));
const ENGINE_URL=new URL('./maritime-analysis.mjs',import.meta.url);
const ENGINE_SHA256=hash(await readFile(ENGINE_URL));
const COLUMN_TYPES=Object.freeze({
 edition_id:'string',locode:{type:'string',nullable:true},endpoint:'string',
 flow:{type:'string',nullable:true},measure:{type:'string',nullable:true},population:'string',
 date:'string',series:'string',status:'string',
 exact_value:{type:'string',nullable:true},source_lexeme:{type:'string',nullable:true},
 source_row:'integer',source_sha256:'string',captured_at:'string',source_role:'string',
 original_url:{type:'string',nullable:true},frequency:{type:'string',nullable:true}
});
const COLUMN_NAMES=Object.keys(COLUMN_TYPES);
const FILES=['source.json','source-descriptor.json','dataset.csv','dataset.json'];
function csvCell(value){
 if(value===null)return '';
 if(typeof value==='number'){need(Number.isSafeInteger(value),'Only safe integer source row numbers use numeric CSV encoding');return String(value);}
 need(typeof value==='string','Dataset strings must remain exact source text');
 need(Buffer.from(value,'utf8').toString('utf8')===value,'Source string cannot be represented losslessly as UTF-8');
 return '"'+value.replace(/"/g,'""')+'"';
}
function projectedRow(period,row){
 return {edition_id:period.edition_id,locode:period.request.locode??null,endpoint:period.request.kind,
  flow:period.request.query?.flow??null,measure:period.request.measure??null,population:period.request.population,
  date:row.date,series:row.series,status:row.status,exact_value:row.exact,source_lexeme:row.source_lexeme,
  source_row:row.source_row,source_sha256:period.source.source_sha256,captured_at:period.source.captured_at,
  source_role:period.source.source_role,original_url:period.source.original_url??null,
  frequency:period.frequency??null};
}
function* csvLines(period){
 yield COLUMN_NAMES.map(csvCell).join(',')+'\r\n';
 for(const row of period.rows){const values=projectedRow(period,row);yield COLUMN_NAMES.map(k=>csvCell(values[k])).join(',')+'\r\n';}
}
function derive(rawText,descriptor,{from,until,name,defaultLimit=50,maxLimit=250}){
 need(typeof name==='string'&&name.trim()&&name.length<=2000,'A reviewed dataset name is required');
 need(Number.isSafeInteger(defaultLimit)&&defaultLimit>=1&&Number.isSafeInteger(maxLimit)&&maxLimit>=defaultLimit&&maxLimit<=250,'Page limits must satisfy 1 <= defaultLimit <= maxLimit <= 250');
 const raw=Buffer.from(rawText,'utf8');
 need(raw.length<=MAX_SOURCE_BYTES,'Original response exceeds the 64 MiB publication source limit');
 const edition=readSnapshot(rawText,descriptor),period=selectPeriod(edition,{from,until});
 need(period.rows.length<=MAX_ROWS,'Selected source exceeds the 250,000-row dataset limit; choose a smaller explicit local period');
 const config={schema:'stellar-forge.csv-dataset.v1',file:'dataset.csv',name,columns:COLUMN_TYPES,
  filters:['edition_id','locode','endpoint','flow','measure','population','series','status'],
  ranges:['date'],sorts:['date','source_row','series','locode','endpoint'],
  nullEncoding:'unquoted-empty',maxBytes:MAX_CSV_BYTES,maxRows:MAX_ROWS,maxCellChars:65536,
  defaultLimit,maxLimit,maxPageBytes:900*1024};
 const counts={known:0,null:0,absent:0,unsupported_value:0};
 for(const row of period.rows){
  need(Object.hasOwn(counts,row.status),'Unsupported source value status');counts[row.status]++;
  need((row.status==='known')===(typeof row.exact==='string'&&typeof row.source_lexeme==='string'),'Known values require their exact decimal and original numeric lexeme');
 }
 const csvHash=createHash('sha256');let csvBytes=0;
 for(const line of csvLines(period)){const bytes=Buffer.from(line);csvBytes+=bytes.length;need(csvBytes<=MAX_CSV_BYTES,'Projected CSV exceeds 64 MiB; choose a smaller explicit local period');csvHash.update(bytes);}
 const metadata={edition_id:period.edition_id,selection:period.selection,source:period.source,request:period.request,
  series:period.series,dates:period.dates,expected_dates:period.expected_dates,missing_dates:period.missing_dates,
  frequency:period.frequency,issues:period.issues,selected_rows:period.rows.length,value_counts:counts,
  source_row_numbering:'zero-based original source.data row; repeated dates remain separate rows',
  exact_value:'Canonical decimal text from the retained original JSON numeric lexeme; null for all non-known statuses',
  status:'known, null, absent and unsupported_value remain distinct; none is imputed as zero',
  date_range:'YYYY-MM-DD source labels; local half-open selection, never a provider-side date request',
  csv_nulls:'Unquoted empty means null; quoted empty means an original empty string',
  source_role:period.source.source_role,
  example_notice:period.source.source_role==='issuer_documentation_example'?'This is the issuer documentation example, not an observed port or authenticated acquisition.':null};
 need(json(metadata).length<=MAX_METADATA_BYTES,'Retained publication metadata exceeds 16 MiB');
 const engine={file:'maritime-analysis.mjs',version:VERSION,contract_sha256:CONTRACT_SHA256,sha256:ENGINE_SHA256};
 const publication_id=identity({format:FORMAT,descriptor,selection:period.selection,config,source_sha256:hash(raw),engine});
 return {raw,period,config,metadata,engine,publication_id,csv:{bytes:csvBytes,sha256:csvHash.digest('hex')}};
}
async function regularBytes(path,limit){
 const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const before=await file.stat({bigint:true});need(before.isFile()&&before.size<=BigInt(limit),'Expected a bounded regular file: '+path);
  const bytes=await file.readFile();const after=await file.stat({bigint:true});
  need(bytes.length<=limit&&before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs,'Source changed during read: '+path);
  return bytes;
 }finally{await file.close();}
}
function strictText(bytes){const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);need(Buffer.from(text).equals(bytes),'Source must round-trip exact UTF-8 bytes');return text;}
async function readJSON(path,limit=MAX_METADATA_BYTES){return JSON.parse(strictText(await regularBytes(path,limit)));}
async function privateFile(path,bytes){
 const f=await open(path,'wx',0o600);
 try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}
 return {path:path.split(/[\\/]/).pop(),bytes:bytes.length,sha256:hash(bytes)};
}
async function syncDirectory(path){const f=await open(path,'r');try{await f.sync();}finally{await f.close();}}
async function privateDirectory(path){
 const info=await lstat(path);
 need(info.isDirectory()&&!info.isSymbolicLink()&&await realpath(path)===path,'Expected a real canonical directory: '+path);
 if(process.platform!=='win32')need((info.mode&0o077)===0&&(typeof process.getuid!=='function'||info.uid===process.getuid()),'Publication directory must be private and owned by the current operator: '+path);
}
async function assertEngine(){need(hash(await readFile(ENGINE_URL))===ENGINE_SHA256,'Analysis source changed after this process loaded it; retain the original edition and reopen its selected source');}

/** Consume exact original UTF-8 response + descriptor; cached period objects are never trusted. */
export async function createPublication({rawPath,descriptorPath,from,until,directory,name,defaultLimit=50,maxLimit=250}){
 await assertEngine();
 const raw=await regularBytes(resolve(rawPath),MAX_SOURCE_BYTES),descriptor=await readJSON(resolve(descriptorPath),65536);
 const options={from,until,name,defaultLimit,maxLimit};
 const built=derive(strictText(raw),descriptor,options),target=resolve(directory);
 await privateDirectory(dirname(target));
 let exists=false;try{const st=await lstat(target);need(st.isDirectory()&&!st.isSymbolicLink(),'Publication destination must be a real private directory');exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(exists){const prior=await inspectPublication(target);need(prior.manifest.publication_id===built.publication_id,'Existing publication has a different exact source/selection/configuration');return {...prior,reused:true};}
 // A create-only directory and final manifest prevent overwriting another edition.
 // An interrupted directory without release.json is retained for explicit recovery.
 await mkdir(target,{mode:0o700});await privateDirectory(target);
 const files=[];
 files.push(await privateFile(join(target,'source.json'),raw));
 files.push(await privateFile(join(target,'source-descriptor.json'),json(descriptor)));
 const csv=await open(join(target,'dataset.csv'),'wx',0o600);
 try{let chunk='';for(const line of csvLines(built.period)){chunk+=line;if(Buffer.byteLength(chunk)>=65536){await csv.writeFile(chunk);chunk='';}}if(chunk)await csv.writeFile(chunk);await csv.sync();}finally{await csv.close();}
 files.push({path:'dataset.csv',...built.csv});
 files.push(await privateFile(join(target,'dataset.json'),json(built.config)));
 const dataset=await loadDatasetConfig(join(target,'dataset.json')),description=dataset.describe();
 need(description.rowCount===built.period.rows.length,'Original dataset row count differs from the selected source');
 await assertEngine();
 const manifest={format:FORMAT,publication_id:built.publication_id,created_at:new Date().toISOString(),
  options,engine:built.engine,source:built.metadata,dataset:description,files,
  disposition:'RETAINED_TYPED_DATASET_NOT_A_PURCHASE',rendered_receiving:null};
 const manifestBytes=json(manifest);need(manifestBytes.length<=MAX_METADATA_BYTES,'Complete release manifest exceeds the 16 MiB receiving limit');
 await privateFile(join(target,'release.json'),manifestBytes);await syncDirectory(target);await syncDirectory(dirname(target));
 return {directory:target,configPath:join(target,'dataset.json'),manifest,reused:false};
}

/** Rebuild provenance from retained original bytes, verify every file and original native snapshot. */
export async function inspectPublication(directory){
 await assertEngine();const target=resolve(directory),st=await lstat(target);
 need(st.isDirectory()&&!st.isSymbolicLink(),'Publication directory must be real');await privateDirectory(target);
 const manifest=await readJSON(join(target,'release.json'));
 need(manifest.format===FORMAT&&HASH.test(manifest.publication_id??'')&&Array.isArray(manifest.files),'Unknown or incomplete publication');
 need(manifest.files.length===FILES.length&&FILES.every(name=>manifest.files.filter(x=>x.path===name).length===1),'Publication file inventory changed');
 const held={};
 for(const record of manifest.files){
  need(HASH.test(record.sha256??'')&&Number.isSafeInteger(record.bytes)&&record.bytes>=0,'Invalid original file identity');
  const max=record.path==='source.json'?MAX_SOURCE_BYTES:record.path==='dataset.csv'?MAX_CSV_BYTES:MAX_METADATA_BYTES;
  const bytes=await regularBytes(join(target,record.path),max);
  need(bytes.length===record.bytes&&hash(bytes)===record.sha256,'Retained publication file changed: '+record.path);
  if(record.path!=='dataset.csv')held[record.path]=bytes;
 }
 const descriptor=JSON.parse(strictText(held['source-descriptor.json']));
 const built=derive(strictText(held['source.json']),descriptor,manifest.options);
 need(built.publication_id===manifest.publication_id&&identity(built.engine)===identity(manifest.engine),'Publication source/selection/engine identity changed');
 need(identity(built.metadata)===identity(manifest.source),'Retained source meaning changed');
 const csv=manifest.files.find(x=>x.path==='dataset.csv');
 need(csv.bytes===built.csv.bytes&&csv.sha256===built.csv.sha256,'CSV is not the exact selected original response');
 need(identity(JSON.parse(strictText(held['dataset.json'])))===identity(built.config),'Dataset declaration changed');
 const dataset=await loadDatasetConfig(join(target,'dataset.json'));
 need(identity(dataset.describe())===identity(manifest.dataset),'Original SF30 dataset snapshot changed');
 await assertEngine();
 return {directory:target,configPath:join(target,'dataset.json'),manifest};
}

/** First store only. Existing stores reopen through the unchanged original tools. */
export async function initializeMerchant({publication,directory,retentionMs=3600000,maxVersions=4,maxRetainedBytes=256*1024*1024}){
 const release=await inspectPublication(publication),stateDirectory=resolve(directory);
 await privateDirectory(dirname(stateDirectory));
 // Claim a new original store. Never open/collect an existing store through init.
 await mkdir(stateDirectory,{mode:0o700});
 const versions=await openDatasetVersions({directory:stateDirectory,initialConfig:release.configPath,retentionMs,maxVersions,maxRetainedBytes});
 try{const status=versions.status();need(status.current===release.manifest.dataset.snapshot,'Original store current snapshot does not match this publication');return {publication_id:release.manifest.publication_id,status};}finally{await versions.close();}
}
/** Generate original public terms without a seller launch, purchase or settlement. */
export async function configureMerchant({publication,payment,origin,path='/data',output}){
 const release=await inspectPublication(publication),dataset=await loadDatasetConfig(release.configPath);
 need(identity(dataset.describe())===identity(release.manifest.dataset),'Dataset changed after publication inspection');
 const config=await buildDatasetSellerConfig(dataset,{payment,origin,path});
 await privateDirectory(dirname(resolve(output)));
 const file=await privateFile(resolve(output),json(config));await syncDirectory(dirname(resolve(output)));
 return {publication_id:release.manifest.publication_id,snapshot:release.manifest.dataset.snapshot,
  seller:resolve(output),file,mode:'CONFIG_GENERATED_NOT_RUNNING'};
}
/** Running original store only; exact revision is mandatory, including after A-to-B-to-A. */
export async function refreshMerchant({publication,directory,expectedSnapshot,expectedRevision}){
 need(HASH.test(expectedSnapshot??'')&&Number.isSafeInteger(expectedRevision)&&expectedRevision>=1,'Current snapshot and revision are required');
 const release=await inspectPublication(publication);
 const status=await datasetControl(resolve(directory),'refresh',{configPath:release.configPath,expectedSnapshot,expectedRevision});
 return {publication_id:release.manifest.publication_id,status};
}
async function digestFile(path,maxBytes){
 const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let bytes=0;const digest=createHash('sha256');
 try{
  const before=await f.stat({bigint:true});need(before.isFile()&&before.size<=BigInt(maxBytes),'Original delivery file exceeds its bound');
  for await(const chunk of f.createReadStream({autoClose:false})){bytes+=chunk.length;need(bytes<=maxBytes,'Delivery file grew beyond its bound');digest.update(chunk);}
  const after=await f.stat({bigint:true});
  need(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs&&BigInt(bytes)===after.size,'Original delivery file changed during receiving');
  return {bytes,sha256:digest.digest('hex')};
 }finally{await f.close();}
}
/** Finish only the missing Econdb join on an already completed original export. */
export async function bindBuyerReturn({publication,root,intents,destination}){
 const release=await inspectPublication(publication),out=resolve(destination);
 await privateDirectory(out);await privateDirectory(join(out,'sources'));await privateDirectory(join(out,'dataset'));await privateDirectory(join(out,'dataset','pages'));
 const bytes=await regularBytes(join(out,'delivery.json'),32*1024*1024),original=JSON.parse(strictText(bytes));
 need(original.schema==='stellar-forge.sf88.queue-dataset-delivery.v1'&&original.queueRoot===resolve(root),'Original buyer export belongs to another inbox');
 need(Array.isArray(intents)&&intents.length>0&&intents.length<=4096&&new Set(intents).size===intents.length&&identity(original.selection?.intents)===identity(intents),'Original ordered buyer intents changed');
 need(original.selection.sha256===hash(Buffer.from(JSON.stringify(intents,null,2)+'\n')),'Original buyer selection identity changed');
 need(Array.isArray(original.operations)&&original.operations.length===intents.length,'Original operation count changed');
 async function match(relative,record,max){
  need(object(record)&&record.path===relative&&HASH.test(record.sha256??'')&&Number.isSafeInteger(record.bytes)&&record.bytes>=0&&record.bytes<=max,'Invalid original delivery file declaration');
  const actual=await digestFile(join(out,relative),max);
  need(actual.bytes===record.bytes&&actual.sha256===record.sha256,'Original completed file changed: '+relative);return actual;
 }
 await match('dataset/manifest.json',original.originalDatasetManifest,8*1024*1024);
 const native=await readJSON(join(out,'dataset','manifest.json'),8*1024*1024);
 const {scan,retainDeliveryFile}=await import('../../../scf-starforge-20261009/sf100-buyer-dataset-delivery/deliver.mjs');
 const state=await scan(join(out,'dataset'),{retainPayload:false});
 need(state.finalized&&state.pages.length===intents.length&&state.nextCursor===null&&state.count===state.total,'Original buyer export is incomplete');
 need(state.snapshot===release.manifest.dataset.snapshot,'Original buyer pages belong to another dataset snapshot; their completed export remains intact');
 need(identity(original.dataset)===identity({name:state.name,snapshot:state.snapshot,pages:state.pages.length,rows:state.count,total:state.total}),'Original buyer completion summary changed');
 need(native.schema==='stellar-forge.buyer-delivery-manifest.v1'&&native.chainDigest===state.chain&&native.dataset?.name===state.name&&native.dataset?.snapshot===state.snapshot&&native.dataset?.rows===state.count&&native.dataset?.originalQueryHash===state.queryHash,'Original native delivery identity changed');
 need(identity(native.dataset.projectedFields)===identity(state.fields)&&identity(native.dataset.filters)===identity(state.filters)&&identity(native.dataset.ranges)===identity(state.ranges)&&identity(native.dataset.order)===identity(state.order??'csv-record-order'),'Original query projection changed');
 const pages=state.pages.map(x=>({index:x.index,intent:x.intent,sourceSha256:x.sourceSha256,evidenceSha256:x.evidenceSha256,recordDigest:x.chain,rows:x.returned,requestedCursor:x.requestCursor}));
 need(identity(native.sourcePages)===identity(pages),'Original native page identities changed');
 let copiedBytes=0;
 for(let i=0;i<intents.length;i++){
  const op=original.operations[i],page=state.pages[i],prefix=String(i).padStart(5,'0');
  need(op.index===i&&op.intentId===intents[i]&&page.intent===intents[i],'Original page/intent order changed');
  need(op.source?.sha256===page.sourceSha256&&(op.evidence?.sha256??null)===page.evidenceSha256,'Original copied page or evidence differs from the native archive');
  copiedBytes+=(await match('sources/'+prefix+'.response.json',op.source,2*1024*1024)).bytes;
  copiedBytes+=(await match('sources/'+prefix+'.operation.json',op.originalOperation,32*1024*1024)).bytes;
  if(op.evidence!==null)copiedBytes+=(await match('sources/'+prefix+'.evidence.json',op.evidence,2*1024*1024)).bytes;
  need(copiedBytes<=256*1024*1024,'Original copied source total exceeds its export limit');
 }
 const outputNames=['dataset.jsonl','dataset.csv','review.html'];
 need(object(native.outputs)&&Object.keys(native.outputs).length===outputNames.length&&outputNames.every(k=>Object.hasOwn(native.outputs,k)),'Original Econdb output inventory changed');
 let outputBytes=0;
 for(const name of outputNames){const record=native.outputs[name];outputBytes+=(await match('dataset/'+name,{path:'dataset/'+name,...record},256*1024*1024)).bytes;}
 need(outputBytes<=256*1024*1024+16*1024*1024,'Original export output total exceeds its declared capacity');
 const manifestFile={path:join(out,'delivery.json'),bytes:bytes.length,sha256:hash(bytes)};
 const binding={format:'econdb.sf30-buyer-source-binding.v1',publication_id:release.manifest.publication_id,
  snapshot:state.snapshot,source_sha256:release.manifest.source.source.source_sha256,
  edition_id:release.manifest.source.edition_id,selection:release.manifest.source.selection,
  original_buyer_manifest:manifestFile,original_intents:[...intents],
  returned_rows:state.count,query_total:state.total,pages:state.pages.length,
  source_manifest:release.manifest,
  payment_classification:'Retained original SF88 outcomes are authoritative; this source join neither purchases nor settles.',
  empty_snapshot_notice:state.count===0?'The physical empty dataset snapshot alone does not identify an Econdb source edition; this explicit retained release binding supplies that identity.':null};
 const bindingBytes=json(binding);need(bindingBytes.length<=32*1024*1024,'Buyer source binding exceeds 32 MiB; original completed export remains intact');
 const bindingPath=join(out,'econdb-publication.json');
 // Original atomic create-or-identical publication survives a disconnect after link/fsync.
 await retainDeliveryFile(out,bindingPath,bindingBytes);await syncDirectory(out);
 return {action:'ECONDB_BUYER_RETURN_BOUND',directory:out,manifest:manifestFile,
  review:join(out,'dataset','review.html'),jsonl:join(out,'dataset','dataset.jsonl'),csv:join(out,'dataset','dataset.csv'),
  name:state.name,snapshot:state.snapshot,pages:state.pages.length,rows:state.count,total:state.total,
  econdb:{publication_id:release.manifest.publication_id,binding:{path:bindingPath,bytes:bindingBytes.length,sha256:hash(bindingBytes)}}};
}
export async function exportBuyerReturn({publication,root,intents,destination}){
 await inspectPublication(publication);
 const out=resolve(destination);let exists=false;
 try{await lstat(out);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!exists){
  const {exportQueueDataset}=await import('../../../scf-starforge-20261009/sf88-operator-buyer-cli/queue-dataset.mjs');
  await exportQueueDataset({root:resolve(root),intents,destination:out});
 }
 // Existing completed destination: verify every retained identity and finish only the join.
 // Existing incomplete destination: bindBuyerReturn refuses it without replaying export.
 return bindBuyerReturn({publication,root,intents,destination:out});
}
const HELP=`Usage:
 node sf30-publication.mjs build --source RESPONSE.json --descriptor DESCRIPTOR.json --from YYYY-MM-DD --until YYYY-MM-DD --name NAME --out NEW_PUBLICATION
 node sf30-publication.mjs inspect --publication DIRECTORY
 node sf30-publication.mjs merchant-init --publication DIRECTORY --state PRIVATE_STORE
 node sf30-publication.mjs merchant-configure --publication DIRECTORY --payment PUBLIC_TERMS.json --origin HTTPS_ORIGIN --path /data --out NEW_SELLER.json
 node sf30-publication.mjs merchant-refresh --publication DIRECTORY --state PRIVATE_STORE --expect SNAPSHOT --expect-revision REVISION
 node sf30-publication.mjs buyer-export --publication DIRECTORY --root EXISTING_BUYER_INBOX --selection EXISTING_SELECTION.json --out NEW_CUSTOMER_DIRECTORY
 node sf30-publication.mjs original-version-cli <unchanged dataset-refresh/cli.mjs arguments>
Original-version-cli exposes existing status/serve/configure/activate/collect; it does not create another server or payment engine.
Build consumes exact retained source and descriptor, never a modified cached period. Existing incomplete directories are retained, not overwritten.`;
function args(values,allowed){
 const result={};for(let i=0;i<values.length;i+=2){const key=values[i];need(allowed.includes(key)&&!Object.hasOwn(result,key)&&typeof values[i+1]==='string'&&!values[i+1].startsWith('--'),'Unknown, duplicate or missing option: '+key);result[key]=values[i+1];}return result;
}
function required(o,k){need(typeof o[k]==='string'&&o[k].length,'Missing '+k);return o[k];}
export async function main(input=process.argv.slice(2)){
 const [command,...rest]=input;
 if(command==='--help'||!command){process.stdout.write(HELP+'\n');return;}
 if(command==='original-version-cli'){const original=await import('../../../scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/cli.mjs');return original.main(rest);}
 let result;
 if(command==='build'){
  const o=args(rest,['--source','--descriptor','--from','--until','--name','--out']);
  result=await createPublication({rawPath:required(o,'--source'),descriptorPath:required(o,'--descriptor'),from:required(o,'--from'),until:required(o,'--until'),name:required(o,'--name'),directory:required(o,'--out')});
 }else if(command==='inspect'){const o=args(rest,['--publication']);result=await inspectPublication(required(o,'--publication'));}
 else if(command==='merchant-init'){const o=args(rest,['--publication','--state']);result=await initializeMerchant({publication:required(o,'--publication'),directory:required(o,'--state')});}
 else if(command==='merchant-configure'){const o=args(rest,['--publication','--payment','--origin','--path','--out']);result=await configureMerchant({publication:required(o,'--publication'),payment:await readJSON(resolve(required(o,'--payment')),16384),origin:required(o,'--origin'),path:o['--path']??'/data',output:required(o,'--out')});}
 else if(command==='merchant-refresh'){const o=args(rest,['--publication','--state','--expect','--expect-revision']);const text=required(o,'--expect-revision');need(/^[1-9][0-9]*$/.test(text),'Revision must be positive integer text');result=await refreshMerchant({publication:required(o,'--publication'),directory:required(o,'--state'),expectedSnapshot:required(o,'--expect'),expectedRevision:Number(text)});}
 else if(command==='buyer-export'){
  const o=args(rest,['--publication','--root','--selection','--out']);
  const {readDatasetSelection}=await import('../../../scf-starforge-20261009/sf88-operator-buyer-cli/queue-dataset.mjs');
  result=await exportBuyerReturn({publication:required(o,'--publication'),root:required(o,'--root'),intents:await readDatasetSelection(resolve(required(o,'--selection'))),destination:required(o,'--out')});
 }else throw new TypeError('Unknown command; use --help');
 process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{process.stderr.write(String(error.code??'PUBLICATION')+': '+error.message+'\n');process.exitCode=1;});
