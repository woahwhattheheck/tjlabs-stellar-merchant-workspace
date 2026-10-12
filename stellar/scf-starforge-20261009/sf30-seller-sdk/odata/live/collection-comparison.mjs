// MIT. Complete retained live-collection comparison, review and analytical receiving.
import { constants } from 'node:fs';
import { mkdir,mkdtemp,lstat,realpath,open,readFile,readdir,rename,rm } from 'node:fs/promises';
import { basename,dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync,gunzipSync } from 'node:zlib';
import { acquireReleaseLease } from '../../../sf82-seller-pilot/release-process.mjs';
import { readRequestFile } from '../../../sf88-operator-buyer-cli/request-body.mjs';
import { VerifiedFile } from '../../../sf88-operator-buyer-cli/node/result.mjs';
import { openCollection,collectionRetainedFiles,ANALYSIS_DOCUMENT_SCHEMA } from './collection.mjs';
import { COMPARISON_ENGINE,COMPARISON_COLUMNS,selectComparison,deriveComparison } from './collection-comparison-engine.mjs';
import { canonical } from '../source.mjs';
import { atomic,writeNew,formatted,digest } from '../state.mjs';

export const COMPARISON_SCHEMA='stellar-forge.odata-live-comparison.v1';
export const REVIEW_SCHEMA='stellar-forge.odata-live-comparison-reviews.v1';
const HASH=/^[a-f0-9]{64}$/;
const COLLECTION_FILE=/^(?:merchant\.json|projection\.json|dataset\.json|selection\.json|collection\.json|rows\.jsonl|rows-index\.jsonl|analysis-rows\.json|dataset\.csv|pages\/[0-9]{5}\/(?:request|response|buyer|result)\.json|analysis\/source\.json|analysis\/files\/[a-f0-9]{64}\.(?:csv|json|bin))$/;
const CORE_FILE=/^(?:selection\.json|engine\.mjs|collection-engine\.mjs|cells\.jsonl|changes\.csv|entities\.jsonl)$/;
const PACKET_SCHEMA='stellar-forge.odata-live-comparison-packet.v1';
const DOCUMENT_MAX=256*1024*1024,MANIFEST_MAX=16*1024*1024,PACKET_MAX=24*1024*1024;
const SOURCE_URL='https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/collection-comparison-engine.mjs';
const need=(condition,code,message,status=409)=>{if(!condition)throw Object.assign(new Error(message),{code:'ODATA_COMPARISON_'+code,status});};
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const same=(a,b)=>canonical(a)===canonical(b);
const parse=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
const identity=raw=>({bytes:raw.length,sha256:digest(raw)});
const ownIdentity=value=>plain(value)&&Number.isSafeInteger(value.bytes)&&value.bytes>=0&&value.bytes<=512*1024*1024&&HASH.test(value.sha256);
const corePath=name=>CORE_FILE.test(name)||/^(before|after)\//.test(name)&&COLLECTION_FILE.test(name.slice(name.indexOf('/')+1));
function safeRelative(name) {
  need(typeof name==='string'&&name&&!name.includes('\\')&&name.split('/').every(part=>part&&part!=='.'&&part!=='..'),
    'PATH','Choose a retained comparison file.');return name;
}
async function privateDirectory(directory,create=true) {
  directory=resolve(directory);if(create)await mkdir(directory,{recursive:true,mode:0o700});
  const stat=await lstat(directory);
  need(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&
    (typeof process.getuid!=='function'||stat.uid===process.getuid())&&await realpath(directory)===directory,
    'DIRECTORY','Use an owned private comparison directory.');return directory;
}
class SavedFile extends VerifiedFile {
  constructor(path,record){super();this.saved={path:resolve(path),bytes:record.bytes,sha256:record.sha256};}
  _metadata(){return this.saved;}
}
async function readAt(root,name,max=MANIFEST_MAX,expected) {
  const path=join(root,safeRelative(name));await privateDirectory(dirname(path),false);
  const raw=await readRequestFile(path,max);
  if(expected)need(ownIdentity(expected)&&raw.length===expected.bytes&&digest(raw)===expected.sha256,
    'FILE_CHANGED','A retained comparison file changed: '+name);
  return raw;
}
async function syncTree(directory) {
  for(const entry of await readdir(directory,{withFileTypes:true}))if(entry.isDirectory())await syncTree(join(directory,entry.name));
  await syncDirectory(directory);
}
async function syncDirectory(directory) {
  const file=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY);
  try{await file.sync();}finally{await file.close();}
}
async function sameFile(root,name,raw) {
  const path=join(root,safeRelative(name));await privateDirectory(dirname(path));
  try{await writeNew(path,raw);}catch(error){if(error.code!=='EEXIST')throw error;
    need((await readAt(root,name,Math.max(MANIFEST_MAX,raw.length))).equals(raw),'FILE_CHANGED','The saved comparison selection changed.');}
  return identity(raw);
}
async function copied(root,name,path,expected) {
  need(ownIdentity(expected),'FILE_IDENTITY','A selected comparison input has no exact byte identity.');
  const target=join(root,safeRelative(name));await privateDirectory(dirname(target));
  const fd=await open(target,'wx',0o600);let length=0;
  try{for await(const chunk of new SavedFile(path,expected).chunks()){await fd.writeFile(chunk);length+=chunk.length;}
    need(length===expected.bytes,'COPY_SIZE','An original input changed while it was retained.');await fd.sync();}
  finally{await fd.close();}
}
async function work(root,selectionSha256,operation) {
  // Only a previous stage carrying this exact selected operation is retired.
  for(const name of await readdir(root))if(/^\.comparison-work-[A-Za-z0-9]{6}$/.test(name)){
    const directory=join(root,name);await privateDirectory(directory,false);
    let record;try{record=parse(await readAt(directory,'working.json',4096));}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(record.schema==='stellar-forge.odata-comparison-working.v1'&&record.selectionSha256===selectionSha256)
      await rm(directory,{recursive:true});
  }
  const directory=await mkdtemp(join(root,'.comparison-work-'));
  await sameFile(directory,'working.json',formatted({schema:'stellar-forge.odata-comparison-working.v1',selectionSha256}));
  try{return await operation(directory);}finally{await rm(directory,{recursive:true,force:true});}
}
function manifestShape(value) {
  need(plain(value)&&value.schema===COMPARISON_SCHEMA&&value.engine===COMPARISON_ENGINE&&
    HASH.test(value.selectionSha256)&&plain(value.selection)&&plain(value.files)&&plain(value.counts)&&plain(value.analysisProjection),
    'MANIFEST','Choose an original complete collection comparison.');
  need(digest(formatted(value.selection))===value.selectionSha256,'SELECTION','The comparison selection identity differs.');
  for(const [name,file]of Object.entries(value.files))need(corePath(name)&&ownIdentity(file),'MANIFEST_FILE','The comparison declares an invalid retained file.');
  for(const name of ['selection.json','engine.mjs','collection-engine.mjs','cells.jsonl','changes.csv','entities.jsonl'])
    need(value.files[name],'MANIFEST_FILE','The comparison omits a required output or original engine.');
  need(value.files['selection.json'].sha256===value.selectionSha256,'SELECTION','The comparison selected source changed.');
  return value;
}
async function sourceContext(directory,collection) {
  return parse(await readAt(directory,'merchant.json',MANIFEST_MAX,collection.files['merchant.json']));
}
async function nativeInputs(root,manifest) {
  const before=await openCollection(join(root,'before')),after=await openCollection(join(root,'after'));
  need(same(selectComparison(before,after,{title:manifest.selection.title,
    fields:manifest.selection.fields.map(field=>field.path),limits:manifest.selection.limits}),manifest.selection),
    'SOURCE_BINDING','The retained original collections differ from the selected comparison.');
  const expected=new Set(['selection.json','engine.mjs','collection-engine.mjs','cells.jsonl','changes.csv','entities.jsonl']);
  for(const [side,collection]of [['before',before],['after',after]])
    for(const record of await collectionRetainedFiles(collection)){
      const name=side+'/'+record.path;expected.add(name);
      need(same(manifest.files[name],{bytes:record.bytes,sha256:record.sha256}),'SOURCE_FILES','The comparison omits or changes an original collection file.');
    }
  need(expected.size===Object.keys(manifest.files).length,'SOURCE_EXTRA','The comparison carries files outside its selected original closure.');
  return {before,after,beforeMerchant:await sourceContext(join(root,'before'),before),
    afterMerchant:await sourceContext(join(root,'after'),after)};
}
function emptyReviews(comparisonSha256) {return {schema:REVIEW_SCHEMA,comparisonSha256,revision:0,history:[]};}
function reviewRequest(input,manifest) {
  need(plain(input)&&Object.keys(input).every(key=>['requestId','expectedRevision','scope','entityKey','field','status','actor','note'].includes(key)),
    'REVIEW_INPUT','Choose a supported review request.',400);
  need(typeof input.requestId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(input.requestId),
    'REVIEW_REQUEST','Retain a stable review request ID.',400);
  need(['comparison','entity','column','cell'].includes(input.scope)&&
    ['accepted','investigate','excluded','note'].includes(input.status),
    'REVIEW_SCOPE','Choose a comparison, entity, column or cell review and a supported decision.',400);
  for(const [key,max]of [['actor',160],['note',8000]])
    need(typeof input[key]==='string'&&input[key].trim()===input[key]&&input[key].length>0&&input[key].length<=max&&
      input[key].isWellFormed()&&!input[key].includes('\0'),'REVIEW_TEXT','Provide a complete reviewer and note.',400);
  const usesKey=['entity','cell'].includes(input.scope),usesField=['column','cell'].includes(input.scope);
  need(usesKey?typeof input.entityKey==='string'&&Buffer.byteLength(input.entityKey)<=2097152:input.entityKey===undefined||input.entityKey===null,
    'REVIEW_KEY','Select the exact retained entity key for this review scope.',400);
  need(usesField?manifest.selection.fields.some(field=>field.path===input.field):input.field===undefined||input.field===null,
    'REVIEW_FIELD','Select an original compared field for this review scope.',400);
  return {requestId:input.requestId,scope:input.scope,entityKey:usesKey?input.entityKey:null,
    field:usesField?input.field:null,status:input.status,actor:input.actor,note:input.note};
}
function checkedReviews(value,comparisonSha256,manifest) {
  need(plain(value)&&value.schema===REVIEW_SCHEMA&&value.comparisonSha256===comparisonSha256&&
    Number.isSafeInteger(value.revision)&&Array.isArray(value.history)&&value.revision===value.history.length&&value.revision<=10000,
    'REVIEWS','The original review history is incomplete or belongs to another comparison.');
  const requests=new Set();
  for(let index=0;index<value.history.length;index++){
    const version=value.history[index],request=reviewRequest(Object.fromEntries(['requestId','scope','entityKey','field','status','actor','note'].map(key=>[key,version[key]])),manifest);
    need(version.version===index+1&&typeof version.savedAt==='string'&&!Number.isNaN(Date.parse(version.savedAt))&&
      version.requestSha256===digest(formatted(request))&&!requests.has(version.requestId),
      'REVIEW_HISTORY','A saved review version or original request identity changed.');
    requests.add(version.requestId);
  }
  need(formatted(value).length<=16*1024*1024,'REVIEW_SIZE','The retained review history exceeds its complete-file limit.');
  return value;
}
async function lines(root,name,record,accept) {
  const decoder=new TextDecoder('utf-8',{fatal:true});let pending='',count=0;
  for await(const chunk of new SavedFile(join(root,name),record).chunks()){
    pending+=decoder.decode(chunk,{stream:true});let end;
    while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);
      need(line,'ROWS','A comparison row is empty.');count++;await accept(parse(Buffer.from(line)),count);}
    need(Buffer.byteLength(pending)<=16*1024*1024,'ROW_SIZE','A comparison row exceeds its complete-file limit.');
  }
  pending+=decoder.decode();need(!pending,'ROWS','The retained comparison row framing changed.');return count;
}
async function reviewEntities(root,manifest,reviews) {
  const wanted=new Set(reviews.history.filter(record=>record.entityKey!==null).map(record=>record.entityKey));
  if(!wanted.size)return;
  await lines(root,'entities.jsonl',manifest.files['entities.jsonl'],row=>wanted.delete(row.entityKey));
  need(!wanted.size,'REVIEW_ENTITY','A review names an entity outside the complete original comparison.');
}
function provenance(manifest,engineSha256) {
  return {kind:'operator-file',publisher:manifest.selection.after.merchantOrigin,
    capturedAt:manifest.selection.after.acquisition.lastReceivedAt,
    scope:manifest.selection.before.entitySet+'; '+manifest.counts.beforeRows+' before rows; '+manifest.counts.afterRows+' after rows; '+manifest.counts.changedCells+' selected changed cells',
    description:'Declared-key comparison of two complete original live OData collections. Every original page, exact scalar and null state, source query, acquisition window, field declaration, review version and comparison transformation is retained. Before-only and after-only mean presence in the selected collections. Source deletion and atomic supplier snapshots are not inferred. Review exclusions label the original comparison without deleting source rows.',
    transform:{name:'Original OData complete collection comparison',sourceUrl:SOURCE_URL,sha256:engineSha256}};
}
function documentRecord(record,extension,contentType,role) {
  return {path:'files/'+record.sha256+'.'+extension,bytes:record.bytes,sha256:record.sha256,contentType,...(role?{role}:{})};
}
async function documentFile(root,record) {
  need(plain(record)&&ownIdentity(record)&&record.path==='files/'+record.sha256+'.'+record.path.split('.').at(-1)&&
    /^files\/[a-f0-9]{64}\.(csv|json|bin)$/.test(record.path),'DOCUMENT_FILE','Choose an exact content-addressed analytical file.');
  return readAt(root,record.path,DOCUMENT_MAX,record);
}
async function buildDocument(dataRoot,manifest,manifestRaw,reviews,directory) {
  await privateDirectory(directory);
  const put=async(raw,extension,type,role)=>{
    const record=documentRecord(identity(raw),extension,type,role);await sameFile(directory,record.path,raw);return record;
  };
  const document=documentRecord(manifest.files['changes.csv'],'csv','text/csv; charset=utf-8');
  await copied(directory,document.path,join(dataRoot,'changes.csv'),document);
  const originals=[
    await put(manifestRaw,'json','application/json','comparison-manifest'),
    await put(formatted(reviews),'json','application/json','comparison-reviews'),
    await put(await readAt(dataRoot,'engine.mjs',1048576,manifest.files['engine.mjs']),'bin','text/javascript; charset=utf-8','comparison-transform')
  ];
  const manifestSha256=digest(manifestRaw),reviewSha256=digest(formatted(reviews));let sequence=1,parts=[],length=0;
  function begin(){const header=Buffer.from(JSON.stringify({schema:PACKET_SCHEMA,sequence,comparisonSha256:manifestSha256,reviewSha256})+'\n');parts=[header];length=header.length;}
  async function flush(){
    if(parts.length===1)return;
    const packed=gzipSync(Buffer.concat(parts),{level:6});
    need(packed.length<=32*1024*1024&&originals.length<32,'DOCUMENT_LIMIT','The complete original comparison requires a smaller selected customer scope for Analysis delivery.');
    originals.push(await put(packed,'bin','application/gzip','source-packet-'+String(sequence).padStart(4,'0')));sequence++;
  }
  begin();
  for(const [path,file]of Object.entries(manifest.files).sort(([a],[b])=>a<b?-1:a>b?1:0)){
    let offset=0,emitted=false;
    for await(const chunk of new SavedFile(join(dataRoot,path),file).chunks()){
      for(let index=0;index<chunk.length;index+=1024*1024){
        const body=chunk.subarray(index,index+1024*1024),line=Buffer.from(JSON.stringify({
          file:{path,...file},offset,bodyBase64:body.toString('base64')})+'\n');
        if(length+line.length>PACKET_MAX){await flush();begin();}
        parts.push(line);length+=line.length;offset+=body.length;emitted=true;
      }
    }
    if(!emitted){const line=Buffer.from(JSON.stringify({file:{path,...file},offset:0,bodyBase64:''})+'\n');
      if(length+line.length>PACKET_MAX){await flush();begin();}parts.push(line);length+=line.length;}
    need(offset===file.bytes,'DOCUMENT_CHANGED','An original file changed during complete analytical publication.');
  }
  await flush();
  const unique=new Map([document,...originals].map(record=>[record.path,record]));
  need([...unique.values()].reduce((sum,file)=>sum+file.bytes,0)<=DOCUMENT_MAX,'DOCUMENT_LIMIT',
    'The complete original comparison exceeds the original Analysis 256 MiB source limit.');
  const source={schema:ANALYSIS_DOCUMENT_SCHEMA,title:manifest.selection.title,format:'csv',document,originals,
    provenance:provenance(manifest,manifest.files['engine.mjs'].sha256),complete:true};
  const raw=formatted(source);need(raw.length<=1048576,'DOCUMENT_LIMIT','The original Analysis document exceeds 1 MiB.');
  await sameFile(directory,'source.json',raw);return {source,raw,...identity(raw),path:join(directory,'source.json'),reviewSha256};
}
async function readDocument(sourceManifest,expectedSha256) {
  const root=await privateDirectory(dirname(resolve(sourceManifest)),false),raw=await readAt(root,basename(sourceManifest),1048576);
  if(expectedSha256!==undefined)need(HASH.test(expectedSha256)&&digest(raw)===expectedSha256,'DOCUMENT_CHANGED','The reviewed analytical source changed.');
  const source=parse(raw);
  need(source.schema===ANALYSIS_DOCUMENT_SCHEMA&&source.complete===true&&source.format==='csv'&&
    Array.isArray(source.originals)&&source.originals.length>=4&&source.originals.length<=32,'DOCUMENT','Choose an original complete comparison source.');
  const roles=new Map();
  for(const file of source.originals){need(typeof file.role==='string'&&!roles.has(file.role)&&file.bytes<=32*1024*1024,
    'DOCUMENT_ROLE','The comparison source repeats or exceeds an original role.');roles.set(file.role,file);}
  const manifestRaw=await documentFile(root,roles.get('comparison-manifest')),manifest=manifestShape(parse(manifestRaw)),manifestSha256=digest(manifestRaw);
  const reviewsRaw=await documentFile(root,roles.get('comparison-reviews')),reviews=checkedReviews(parse(reviewsRaw),manifestSha256,manifest);
  const transform=roles.get('comparison-transform');await documentFile(root,transform);
  need(transform.contentType==='text/javascript; charset=utf-8'&&same({bytes:transform.bytes,sha256:transform.sha256},manifest.files['engine.mjs'])&&
    source.title===manifest.selection.title&&same(source.provenance,provenance(manifest,transform.sha256))&&
    same(source.document,documentRecord(manifest.files['changes.csv'],'csv','text/csv; charset=utf-8')),
    'DOCUMENT_BINDING','The analytical source differs from its complete original comparison.');
  const packets=[...roles.keys()].filter(role=>/^source-packet-[0-9]{4}$/.test(role)).sort();
  need(packets.length>0&&packets.length+3===roles.size,'DOCUMENT_PACKETS','The source omits complete original comparison packets.');
  const unique=new Map();
  for(const file of [source.document,...source.originals]){
    const prior=unique.get(file.path);need(!prior||same(prior,file),'DOCUMENT_IDENTITY','The source has conflicting retained file identities.');
    unique.set(file.path,file);
  }
  need([...unique.values()].reduce((sum,file)=>sum+file.bytes,0)<=DOCUMENT_MAX,'DOCUMENT_LIMIT','The analytical source exceeds 256 MiB.');
  for(const file of unique.values())await documentFile(root,file);
  return {root,raw,source,manifest,manifestRaw,manifestSha256,reviews,reviewsRaw,packets,roles,uniqueFiles:[...unique.values()]};
}
async function unpackDocument(selected,target) {
  const offsets=new Map(),handles=new Map(),hashes=new Map();let selectedFile=null;
  try{
    for(let index=0;index<selected.packets.length;index++){
      const role=selected.packets[index];need(role==='source-packet-'+String(index+1).padStart(4,'0'),'PACKET_ORDER','The original packet sequence changed.');
      const record=selected.roles.get(role);need(record.contentType==='application/gzip','PACKET_TYPE','Use the original compressed source packets.');
      const body=gunzipSync(await documentFile(selected.root,record),{maxOutputLength:PACKET_MAX});
      const records=new TextDecoder('utf-8',{fatal:true}).decode(body).split('\n');
      need(records.pop()===''&&records.length>1,'PACKET','An original packet is incomplete.');
      const header=JSON.parse(records.shift());
      need(header.schema===PACKET_SCHEMA&&header.sequence===index+1&&header.comparisonSha256===selected.manifestSha256&&
        header.reviewSha256===digest(selected.reviewsRaw),'PACKET_BINDING','An original packet belongs to another comparison or review.');
      for(const line of records){
        const item=JSON.parse(line),file=item.file,path=file?.path;
        need(corePath(path)&&ownIdentity(file)&&same({bytes:file.bytes,sha256:file.sha256},selected.manifest.files[path])&&
          Number.isSafeInteger(item.offset)&&item.offset>=0&&typeof item.bodyBase64==='string','PACKET_FILE','An original comparison packet contains an invalid member.');
        const raw=Buffer.from(item.bodyBase64,'base64');
        need(raw.toString('base64')===item.bodyBase64&&raw.length<=1024*1024&&item.offset+raw.length<=file.bytes,
          'PACKET_BYTES','An original comparison chunk changed or exceeds its file.');
        if(selectedFile===path)need(raw.length>0,'PACKET_REPEAT','The source repeats an empty original chunk.');
        else need(raw.length>0||file.bytes===0,'PACKET_BYTES','An original nonempty file begins with an empty chunk.');
        if(selectedFile!==path){
          if(selectedFile!==null){
            const prior=selected.manifest.files[selectedFile];
            need(offsets.get(selectedFile)===prior.bytes&&hashes.get(selectedFile).digest('hex')===prior.sha256,
              'PACKET_FILE_CHANGED','An original comparison file is incomplete.');
            const fd=handles.get(selectedFile);await fd.sync();await fd.close();handles.delete(selectedFile);
          }
          need(!offsets.has(path)&&item.offset===0,'PACKET_REPEAT','The source repeats or reorders an original file.');
          await privateDirectory(dirname(join(target,path)));
          handles.set(path,await open(join(target,path),'wx',0o600));hashes.set(path,createHash('sha256'));offsets.set(path,0);selectedFile=path;
        }
        need(item.offset===offsets.get(path),'PACKET_OFFSET','The source omits or repeats an original file chunk.');
        await handles.get(path).writeFile(raw);hashes.get(path).update(raw);offsets.set(path,item.offset+raw.length);
      }
    }
    if(selectedFile!==null){
      const file=selected.manifest.files[selectedFile];
      need(offsets.get(selectedFile)===file.bytes&&hashes.get(selectedFile).digest('hex')===file.sha256,
        'PACKET_FILE_CHANGED','The final original comparison file is incomplete.');
      const fd=handles.get(selectedFile);await fd.sync();await fd.close();handles.delete(selectedFile);
    }
    need(offsets.size===Object.keys(selected.manifest.files).length,'PACKET_INCOMPLETE','The source omits an original comparison file.');
    await sameFile(target,'comparison.json',selected.manifestRaw);
  }finally{for(const fd of handles.values())await fd.close();}
}
async function replayData(dataRoot,manifest,working) {
  for(const [name,url]of [['engine.mjs',new URL('./collection-comparison-engine.mjs',import.meta.url)],
    ['collection-engine.mjs',new URL('./collection.mjs',import.meta.url)]]){
    const original=await readRequestFile(fileURLToPath(url),1048576);
    need(same(identity(original),manifest.files[name]),'ENGINE_SOURCE',
      'Replay this edition with its retained original application source; the installed comparison transformation differs.');
  }
  const inputs=await nativeInputs(dataRoot,manifest);
  const replay=await deriveComparison({...inputs,selection:manifest.selection,working});
  need(same(replay.counts,manifest.counts)&&same(replay.analysisProjection,manifest.analysisProjection)&&
    Object.entries(replay.outputs).every(([name,record])=>same(record,manifest.files[name])),
    'REPLAY','The received comparison differs from the complete original source pair.');
}
async function dataAt(root,{replay=false,working}={}) {
  const data=await privateDirectory(join(root,'data'),false),manifestRaw=await readAt(data,'comparison.json',MANIFEST_MAX),manifest=manifestShape(parse(manifestRaw));
  const selectedRaw=await readAt(root,'selection.json',MANIFEST_MAX);
  need(selectedRaw.equals(await readAt(data,'selection.json',MANIFEST_MAX,manifest.files['selection.json']))&&
    selectedRaw.equals(formatted(manifest.selection)),'SELECTION_CHANGED','The saved comparison selection changed.');
  let inputBytes=0;
  for(const [path,file]of Object.entries(manifest.files)){
    await privateDirectory(dirname(join(data,path)),false);await new SavedFile(join(data,path),file).verify();
    if(path.startsWith('before/')||path.startsWith('after/'))inputBytes+=file.bytes;
  }
  need(inputBytes<=manifest.selection.limits.maxInputBytes,'INPUT_LIMIT','The selected original inputs exceed their reviewed byte limit.');
  if(replay)await replayData(data,manifest,working);else await nativeInputs(data,manifest);
  const document=await readDocument(join(data,'analysis','source.json'));
  need(document.manifestRaw.equals(manifestRaw),'DOCUMENT_BINDING','The saved analytical source belongs to another comparison.');
  await reviewEntities(data,manifest,document.reviews);
  return {data,manifest,manifestRaw,manifestSha256:digest(manifestRaw),document};
}
async function reviewsAt(root,core) {
  let raw;try{raw=await readAt(root,'reviews.json',MANIFEST_MAX);}catch(error){if(error.code!=='ENOENT')throw error;raw=core.document.reviewsRaw;}
  const reviews=checkedReviews(parse(raw),core.manifestSha256,core.manifest);await reviewEntities(core.data,core.manifest,reviews);return reviews;
}
function summary(root,core,reviews) {
  const current=new Map();
  for(const value of reviews.history)current.set(canonical([value.scope,value.entityKey,value.field]),value);
  return {directory:root,schema:COMPARISON_SCHEMA,status:'COMPLETE',...core.manifest,manifestSha256:core.manifestSha256,
    reviews:{revision:reviews.revision,current:[...current.values()],history:reviews.history},
    analysis:{path:'data/analysis/source.json',...identity(core.document.raw),reviewRevision:core.document.reviews.revision}};
}
// Browser reads and SDK calls can overlap in the same process. Queue them for
// this canonical comparison directory before taking the original kernel lease.
const directoryOperations=new Map();
async function leased(directory,operation) {
  const root=await privateDirectory(directory),previous=directoryOperations.get(root)||Promise.resolve();
  const task=previous.then(async()=>{
    const lease=await acquireReleaseLease(root,'state.lock');
    try{return await operation(root);}finally{await lease?.close();}
  });
  const tail=task.then(()=>undefined,()=>undefined);
  directoryOperations.set(root,tail);
  try{return await task;}finally{if(directoryOperations.get(root)===tail)directoryOperations.delete(root);}
}
/** Commit a complete source pair, native comparison and complete Analysis source together. */
export async function createCollectionComparison({directory,beforeDirectory,afterDirectory,expectedBeforeSha256,expectedAfterSha256,title,fields,limits}={}) {
  need(typeof directory==='string'&&typeof beforeDirectory==='string'&&typeof afterDirectory==='string',
    'INPUT','Select two original collection directories and an owned comparison directory.',400);
  return leased(directory,async root=>{
    const before=await openCollection(beforeDirectory),after=await openCollection(afterDirectory);
    need(HASH.test(expectedBeforeSha256)&&HASH.test(expectedAfterSha256)&&before.manifestSha256===expectedBeforeSha256&&after.manifestSha256===expectedAfterSha256,
      'INPUT_CHANGED','The reviewed before or after collection changed.');
    const selection=selectComparison(before,after,{title,fields,limits}),selectionRaw=formatted(selection),selectionSha256=digest(selectionRaw);
    await sameFile(root,'selection.json',selectionRaw);
    try{const existing=await dataAt(root);return summary(root,existing,await reviewsAt(root,existing));}
    catch(error){if(error.code!=='ENOENT')throw error;}
    return work(root,selectionSha256,async working=>{
      const data=await privateDirectory(join(working,'data')),files={};let inputBytes=0;
      for(const [side,collection]of [['before',before],['after',after]])for(const record of await collectionRetainedFiles(collection)){
        inputBytes+=record.bytes;need(inputBytes<=selection.limits.maxInputBytes,'INPUT_LIMIT','The complete selected source pair exceeds the comparison input limit.');
        const path=side+'/'+record.path;await copied(data,path,join(collection.directory,record.path),record);
        files[path]={bytes:record.bytes,sha256:record.sha256};
      }
      files['selection.json']=await sameFile(data,'selection.json',selectionRaw);
      for(const [name,url]of [['engine.mjs',new URL('./collection-comparison-engine.mjs',import.meta.url)],
        ['collection-engine.mjs',new URL('./collection.mjs',import.meta.url)]]){
        files[name]=await sameFile(data,name,await readRequestFile(fileURLToPath(url),1048576));
      }
      const handles=new Map();
      try{
        for(const name of ['cells.jsonl','changes.csv','entities.jsonl'])handles.set(name,await open(join(data,name),'wx',0o600));
        const result=await deriveComparison({before,after,beforeMerchant:await sourceContext(beforeDirectory,before),
          afterMerchant:await sourceContext(afterDirectory,after),selection,working,
          sink:{write:(name,raw)=>handles.get(name).writeFile(raw)}});
        for(const fd of handles.values())await fd.sync();
        Object.assign(files,result.outputs);
        const manifest={schema:COMPARISON_SCHEMA,engine:COMPARISON_ENGINE,selectionSha256,selection,
          counts:result.counts,analysisProjection:result.analysisProjection,files},manifestRaw=formatted(manifest);
        need(manifestRaw.length<=MANIFEST_MAX,'MANIFEST_LIMIT','The complete comparison manifest exceeds 16 MiB.');
        await sameFile(data,'comparison.json',manifestRaw);
        const reviews=emptyReviews(digest(manifestRaw));
        await buildDocument(data,manifest,manifestRaw,reviews,join(data,'analysis'));
        // Files have all been synced; publish the one complete directory atomically.
        for(const fd of handles.values())await fd.close();handles.clear();
        await syncTree(data);await rename(data,join(root,'data'));await syncDirectory(root);
        await sameFile(root,'reviews.json',formatted(reviews));
        const completed=await dataAt(root);return summary(root,completed,reviews);
      }finally{for(const fd of handles.values())await fd.close();}
    });
  });
}
export async function openCollectionComparison(directory,{replay=false}={}) {
  return leased(directory,async root=>{
    const selected=parse(await readAt(root,'selection.json',MANIFEST_MAX)),selectionSha256=digest(formatted(selected));
    const run=async working=>{const core=await dataAt(root,{replay,working});return summary(root,core,await reviewsAt(root,core));};
    return replay?work(root,selectionSha256,run):run();
  });
}
export async function readComparisonRows(directory,{kind='cells',offset=0,limit=100,status}={}) {
  need(['cells','entities'].includes(kind)&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=500,
    'ROWS','Choose a valid comparison row page.',400);
  need(status===undefined||['changed','unchanged','before_only','after_only'].includes(status),'ROWS_STATUS','Choose a supported entity status.',400);
  return leased(directory,async root=>{
    const core=await dataAt(root),name=kind+'.jsonl',rows=[];let total=0;
    const count=await lines(core.data,name,core.manifest.files[name],value=>{
      if(status!==undefined&&(kind==='cells'?value.entityStatus:value.status)!==status)return;
      if(total>=offset&&rows.length<limit)rows.push(value);total++;
    });
    need(count===(kind==='cells'?core.manifest.counts.changedCells:core.manifest.counts.entities),'ROWS_COUNT','The original comparison row count changed.');
    return {comparisonSha256:core.manifestSha256,selection:core.manifest.selection,kind,offset,total,rows,nextOffset:offset+rows.length<total?offset+rows.length:null};
  });
}
export async function reviewCollectionComparison(directory,input) {
  return leased(directory,async root=>{
    const core=await dataAt(root),request=reviewRequest(input,core.manifest),requestSha256=digest(formatted(request)),reviews=await reviewsAt(root,core);
    const previous=reviews.history.find(record=>record.requestId===request.requestId);
    if(previous){need(previous.requestSha256===requestSha256,'REVIEW_REQUEST_CHANGED','The original review request ID has different selected content.');return {review:previous,reviews,reused:true};}
    need(Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision===reviews.revision,'REVIEW_REVISION','Reopen the current comparison review before saving.');
    const record={...request,requestSha256,version:reviews.revision+1,savedAt:new Date().toISOString()};
    const next={...reviews,revision:record.version,history:[...reviews.history,record]};
    checkedReviews(next,core.manifestSha256,core.manifest);await reviewEntities(core.data,core.manifest,next);
    await atomic(join(root,'reviews.json'),next);return {review:record,reviews:next,reused:false};
  });
}
function mapping(source,sourceRevision) {
  need(typeof source==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(source)&&Number.isSafeInteger(sourceRevision)&&sourceRevision>0,
    'ANALYSIS_SOURCE','Choose the original registered source name and revision.',400);
  return {source,source_revision:sourceRevision,mapping:{collection:'',sse_data:'text',
    columns:COMPARISON_COLUMNS.map(name=>({name,pointer:'/'+name,type:'text',missing:'error'}))}};
}
export const comparisonAnalysisMapping=mapping;
export async function publishCollectionComparison(directory,{expectedRevision}={}) {
  return leased(directory,async root=>{
    const core=await dataAt(root),reviews=await reviewsAt(root,core);
    need(expectedRevision===reviews.revision,'REVIEW_REVISION','Publish the currently selected complete review revision.');
    const reviewRaw=formatted(reviews),editionId=digest(formatted({comparisonSha256:core.manifestSha256,reviewSha256:digest(reviewRaw)}));
    const target=join(root,'editions',editionId);
    try{
      const document=await readDocument(join(target,'source.json'));
      need(document.manifestRaw.equals(core.manifestRaw)&&document.reviewsRaw.equals(reviewRaw),'EDITION_CHANGED','The retained analytical edition changed.');
      return {editionId,comparisonSha256:core.manifestSha256,reviewRevision:reviews.revision,sourceManifest:join(target,'source.json'),...identity(document.raw)};
    }catch(error){if(error.code!=='ENOENT')throw error;}
    return work(root,core.manifest.selectionSha256,async working=>{
      await replayData(core.data,core.manifest,working);
      const stage=join(working,'edition'),document=await buildDocument(core.data,core.manifest,core.manifestRaw,reviews,stage);
      await privateDirectory(dirname(target));await syncTree(stage);await rename(stage,target);await syncDirectory(dirname(target));
      return {editionId,comparisonSha256:core.manifestSha256,reviewRevision:reviews.revision,sourceManifest:join(target,'source.json'),...identity(document.raw)};
    });
  });
}
export async function restoreCollectionComparison({directory,sourceManifest,expectedSha256}={}) {
  need(typeof directory==='string'&&typeof sourceManifest==='string'&&HASH.test(expectedSha256),
    'RESTORE','Select the complete comparison source and reviewed SHA-256.',400);
  const selected=await readDocument(sourceManifest,expectedSha256);
  return leased(directory,async root=>{
    await sameFile(root,'selection.json',formatted(selected.manifest.selection));
    let existing;
    try{existing=await dataAt(root);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(existing){
      need(existing.manifestRaw.equals(selected.manifestRaw),'RESTORE_CHANGED','The receiving directory already contains another original comparison.');
      // A previously accepted manifest does not validate a new source packet framing.
      // Exhaust every selected original chunk before accepting its new frozen edition.
      await work(root,selected.manifest.selectionSha256,async working=>{
        await unpackDocument(selected,await privateDirectory(join(working,'received-closure')));
      });
      const current=await reviewsAt(root,existing),shorter=current.history.length<selected.reviews.history.length?current:selected.reviews;
      const longer=shorter===current?selected.reviews:current;
      need(same(shorter.history,longer.history.slice(0,shorter.history.length)),'REVIEW_CONFLICT','The receiving review histories diverge.');
      await reviewEntities(existing.data,existing.manifest,selected.reviews);
      if(!selected.raw.equals(existing.document.raw)){
        const editionId=digest(formatted({comparisonSha256:existing.manifestSha256,reviewSha256:digest(selected.reviewsRaw)}));
        const target=join(root,'editions',editionId);
        let retained=false;
        try{const prior=await readDocument(join(target,'source.json'));
          need(prior.raw.equals(selected.raw),'RESTORE_EDITION','That retained review edition has different original source bytes.');retained=true;}
        catch(error){if(error.code!=='ENOENT')throw error;}
        if(!retained)await work(root,selected.manifest.selectionSha256,async working=>{
          const stage=await privateDirectory(join(working,'received-edition'));
          for(const file of selected.uniqueFiles)await copied(stage,file.path,join(selected.root,file.path),file);
          await sameFile(stage,'source.json',selected.raw);await syncTree(stage);
          await privateDirectory(dirname(target));await rename(stage,target);await syncDirectory(dirname(target));
        });
      }
      if(longer!==current)await atomic(join(root,'reviews.json'),selected.reviews);
      return {...summary(root,existing,longer),restoredFrom:{sha256:expectedSha256,reviewRevision:selected.reviews.revision},reused:true};
    }
    return work(root,selected.manifest.selectionSha256,async working=>{
      const data=await privateDirectory(join(working,'data'));await unpackDocument(selected,data);
      need((await readAt(data,'selection.json',MANIFEST_MAX)).equals(formatted(selected.manifest.selection)),
        'RESTORE_SELECTION','The received original selection differs.');
      await replayData(data,selected.manifest,working);await reviewEntities(data,selected.manifest,selected.reviews);
      const analysis=await privateDirectory(join(data,'analysis'));
      for(const file of selected.uniqueFiles)await copied(analysis,file.path,join(selected.root,file.path),file);
      await sameFile(analysis,'source.json',selected.raw);await syncTree(data);
      await rename(data,join(root,'data'));await syncDirectory(root);
      await sameFile(root,'reviews.json',selected.reviewsRaw);
      const core=await dataAt(root);return {...summary(root,core,selected.reviews),restoredFrom:{sha256:expectedSha256,reviewRevision:selected.reviews.revision},reused:false};
    });
  });
}
export async function comparisonRetainedFiles(directory) {
  return leased(directory,async root=>{
    const core=await dataAt(root),reviews=await reviewsAt(root,core),files=[];
    const add=(path,record)=>{need(!files.some(file=>file.path===path),'FILE_REPEAT','The complete comparison repeats a file.');files.push({path,...record});};
    add('selection.json',identity(await readAt(root,'selection.json',MANIFEST_MAX)));
    // Materialize the transferred initial reviews before a portable backup.
    await sameFile(root,'reviews.json',formatted(reviews));add('reviews.json',identity(formatted(reviews)));
    add('data/comparison.json',identity(core.manifestRaw));
    for(const [path,record]of Object.entries(core.manifest.files))add('data/'+path,record);
    add('data/analysis/source.json',identity(core.document.raw));
    for(const file of core.document.uniqueFiles)add('data/analysis/'+file.path,{bytes:file.bytes,sha256:file.sha256});
    let entries;try{entries=await readdir(join(root,'editions'),{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;entries=[];}
    for(const entry of entries){
      need(entry.isDirectory()&&!entry.isSymbolicLink()&&HASH.test(entry.name),'EDITION','The comparison edition directory contains an unsupported entry.');
      const document=await readDocument(join(root,'editions',entry.name,'source.json'));
      need(document.manifestRaw.equals(core.manifestRaw)&&same(document.reviews.history,reviews.history.slice(0,document.reviews.history.length)),
        'EDITION_REVIEW','The retained edition belongs to another comparison or review history.');
      const expected=digest(formatted({comparisonSha256:core.manifestSha256,reviewSha256:digest(document.reviewsRaw)}));
      need(entry.name===expected,'EDITION_IDENTITY','The analytical edition identifier changed.');
      add('editions/'+entry.name+'/source.json',identity(document.raw));
      for(const file of document.uniqueFiles)add('editions/'+entry.name+'/'+file.path,{bytes:file.bytes,sha256:file.sha256});
    }
    return {comparison:summary(root,core,reviews),files:files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
  });
}
/** Read only a selected declared file; callers retain its original byte identity. */
export async function readComparisonFile(directory,name) {
  safeRelative(name);const retained=await comparisonRetainedFiles(directory),record=retained.files.find(file=>file.path===name);
  need(record,'DOWNLOAD','Choose an original declared comparison file.',404);
  const bytes=await readAt(resolve(directory),name,512*1024*1024,record);
  return {name:basename(name),relative:name,bytes,sha256:record.sha256,
    comparisonSha256:retained.comparison.manifestSha256,selection:retained.comparison.selection};
}

/** Read a reviewed complete source selection before selecting its receiving service. */
export async function inspectComparisonSource(sourceManifest,expectedSha256) {
  need(typeof sourceManifest==='string'&&HASH.test(expectedSha256),'RESTORE','Select the complete source and exact SHA-256.',400);
  const selected=await readDocument(sourceManifest,expectedSha256);
  return {manifest:selected.manifest,manifestSha256:selected.manifestSha256,reviewRevision:selected.reviews.revision,...identity(selected.raw)};
}
