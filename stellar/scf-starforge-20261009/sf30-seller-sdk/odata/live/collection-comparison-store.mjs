// MIT. Comparison ownership stays with the original live service and workspace.
import { mkdir,readdir,lstat,realpath,readFile } from 'node:fs/promises';
import { join,resolve,basename } from 'node:path';
import { openServiceCollections } from './collection-store.mjs';
import { createCollectionComparison,openCollectionComparison,readComparisonRows,reviewCollectionComparison,
  publishCollectionComparison,restoreCollectionComparison,comparisonRetainedFiles,readComparisonFile,inspectComparisonSource } from './collection-comparison.mjs';
import { atomic,writeNew,formatted,digest,stable,identifier,fault } from '../state.mjs';

const HASH=/^[a-f0-9]{64}$/,ID=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const COLLECTION=/^(?:merchant\.json|projection\.json|dataset\.json|selection\.json|collection\.json|rows\.jsonl|rows-index\.jsonl|analysis-rows\.json|dataset\.csv|pages\/[0-9]{5}\/(?:request|response|buyer|result)\.json|analysis\/source\.json|analysis\/files\/[a-f0-9]{64}\.(?:csv|json|bin))$/;
const SIMPLE=/^(?:service\.json|selection\.json|reviews\.json|data\/(?:comparison\.json|selection\.json|engine\.mjs|collection-engine\.mjs|cells\.jsonl|changes\.csv|entities\.jsonl|analysis\/source\.json|analysis\/files\/[a-f0-9]{64}\.(?:csv|json|bin))|editions\/[a-f0-9]{64}\/(?:source\.json|files\/[a-f0-9]{64}\.(?:csv|json|bin)))$/;
const filePath=path=>typeof path==='string'&&(SIMPLE.test(path)||/^data\/(before|after)\//.test(path)&&COLLECTION.test(path.split('/').slice(2).join('/')));
const need=(condition,code,message,status=409)=>{if(!condition)throw fault('ODATA_COMPARISON_STORE_'+code,message,status);};
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const parse=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
async function privateDirectory(path,create=true){
  path=resolve(path);if(create)await mkdir(path,{recursive:true,mode:0o700});
  const info=await lstat(path);need(info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0&&
    (typeof process.getuid!=='function'||info.uid===process.getuid())&&await realpath(path)===path,
    'DIRECTORY','Use the original private live service directory.');return path;
}
async function selectedFile(directory,name,max=16*1024*1024){
  need(filePath(name),'FILE','Choose a declared comparison file.',404);await privateDirectory(join(directory,...name.split('/').slice(0,-1)),false);
  const {readRequestFile}=await import('../../../sf88-operator-buyer-cli/request-body.mjs');
  return readRequestFile(join(directory,name),max);
}
function bindingShape(value,profile){
  need(plain(value)&&value.schema==='stellar-forge.odata-live-comparison-service.v1'&&ID.test(value.id)&&
    value.serviceId===profile.id&&value.sourceBinding===profile.sourceBinding&&value.operation===profile.operation&&
    HASH.test(value.beforeSha256)&&HASH.test(value.afterSha256)&&
    [value.beforeCollectionId,value.afterCollectionId].every(id=>id===null||typeof id==='string'&&ID.test(id)),
    'BINDING','The comparison belongs to another original live service.');
  return value;
}
function bound(result,profile,record){
  for(const side of ['before','after'])need(result.selection[side].sourceBinding===profile.sourceBinding&&
    result.selection[side].operation===profile.operation&&result.selection[side].collectionSha256===record[side+'Sha256'],
    'SOURCE_CHANGED','The comparison source pair differs from the retained original service.');
  return result;
}
async function retainBinding(directory,record,profile){
  await privateDirectory(directory);
  try{const previous=bindingShape(parse(await selectedFile(directory,'service.json')),profile);
    need(previous.id===record.id&&previous.beforeSha256===record.beforeSha256&&previous.afterSha256===record.afterSha256,
      'SELECTED_PAIR','That comparison ID already names a different original source pair.');return previous;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  await writeNew(join(directory,'service.json'),formatted(record));return record;
}
async function names(parent){
  let entries;try{await privateDirectory(parent,false);entries=await readdir(parent,{withFileTypes:true});}
  catch(error){if(error.code==='ENOENT')return [];throw error;}
  for(const entry of entries)need(entry.isDirectory()&&!entry.isSymbolicLink()&&ID.test(entry.name),'ENTRY','The comparison directory contains an unsupported entry.');
  return entries.map(entry=>entry.name).sort();
}
async function partial(directory,record){
  try{await selectedFile(directory,'data/comparison.json');return null;}catch(error){if(error.code!=='ENOENT')throw error;}
  let selection=null;try{selection=parse(await selectedFile(directory,'selection.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
  return {id:record.id,status:'INCOMPLETE',selection,beforeSha256:record.beforeSha256,afterSha256:record.afterSha256,
    sourceCollections:{before:record.beforeCollectionId,after:record.afterCollectionId}};
}
function brief(id,result){
  return {id,status:'COMPLETE',title:result.selection.title,manifestSha256:result.manifestSha256,
    before:result.selection.before,after:result.selection.after,sameQuery:result.selection.sameQuery,
    sameProjection:result.selection.sameProjection,counts:result.counts,reviewRevision:result.reviews.revision};
}
export async function openServiceComparisons({directory,profile,sequence}={}){
  need(typeof sequence==='function','SEQUENCE','Use the existing live service operation sequence.',400);
  directory=await privateDirectory(directory,false);
  const collections=await openServiceCollections({directory,profile,sequence}),parent=join(directory,'comparisons');
  async function record(id){identifier(id,'comparison ID');const root=await privateDirectory(join(parent,id),false);
    return {root,record:bindingShape(parse(await selectedFile(root,'service.json')),profile)};}
  async function list(){
    const output=[];for(const id of await names(parent)){
      const selected=await record(id),pending=await partial(selected.root,selected.record);
      if(pending){output.push(pending);continue;}
      const value=bound(await openCollectionComparison(selected.root),profile,selected.record);output.push(brief(id,value));
    }return output;
  }
  const inspect=async id=>{const chosen=await record(id),retained=await comparisonRetainedFiles(chosen.root),value=bound(retained.comparison,profile,chosen.record);
    return {id,...value,retainedFiles:retained.files,sourceCollections:{before:chosen.record.beforeCollectionId,after:chosen.record.afterCollectionId}};};
  const rows=async(id,options)=>{const chosen=await record(id);const value=await readComparisonRows(chosen.root,options);return bound(value,profile,chosen.record);};
  const file=async(id,name)=>{const chosen=await record(id);return bound(await readComparisonFile(chosen.root,name),profile,chosen.record);};
  async function create(input={}){
    return sequence(async()=>{
      need(plain(input)&&Object.keys(input).every(key=>['id','beforeCollectionId','afterCollectionId','expectedBeforeSha256','expectedAfterSha256','title','fields','limits'].includes(key)),
        'INPUT','Choose an original collection comparison request.',400);
      const id=identifier(input.id,'comparison ID'),before=await collections.inspect(identifier(input.beforeCollectionId)),
        after=await collections.inspect(identifier(input.afterCollectionId));
      need(before.manifestSha256===input.expectedBeforeSha256&&after.manifestSha256===input.expectedAfterSha256,
        'INPUT_CHANGED','Reopen the two selected original collections before creating a comparison.');
      const root=await privateDirectory(join(parent,id)),record=await retainBinding(root,{
        schema:'stellar-forge.odata-live-comparison-service.v1',id,serviceId:profile.id,sourceBinding:profile.sourceBinding,
        operation:profile.operation,beforeCollectionId:input.beforeCollectionId,afterCollectionId:input.afterCollectionId,
        beforeSha256:before.manifestSha256,afterSha256:after.manifestSha256},profile);
      const value=await createCollectionComparison({directory:root,beforeDirectory:before.directory,afterDirectory:after.directory,
        expectedBeforeSha256:input.expectedBeforeSha256,expectedAfterSha256:input.expectedAfterSha256,title:input.title,fields:input.fields,limits:input.limits});
      return {id,...bound(value,profile,record)};
    });
  }
  const review=(id,input)=>sequence(async()=>{const chosen=await record(id);return reviewCollectionComparison(chosen.root,input);});
  const publish=(id,input)=>sequence(async()=>{const chosen=await record(id);const result=await publishCollectionComparison(chosen.root,input);
    const retained=await comparisonRetainedFiles(chosen.root);
    return {...result,sourceRelative:'editions/'+result.editionId+'/source.json',
      files:retained.files.filter(file=>file.path.startsWith('editions/'+result.editionId+'/'))};});
  async function restore(input={}){
    return sequence(async()=>{
      need(plain(input)&&Object.keys(input).every(key=>['id','sourceManifest','expectedSha256'].includes(key)),
        'RESTORE','Choose an original complete analytical comparison source.',400);
      const id=identifier(input.id,'comparison ID'),selected=await inspectComparisonSource(input.sourceManifest,input.expectedSha256);
      const selection=selected.manifest.selection;
      for(const side of ['before','after'])need(selection[side].sourceBinding===profile.sourceBinding&&selection[side].operation===profile.operation,
        'RESTORE_SOURCE','The complete analytical comparison belongs to another selected original service.');
      const root=await privateDirectory(join(parent,id)),record=await retainBinding(root,{
        schema:'stellar-forge.odata-live-comparison-service.v1',id,serviceId:profile.id,sourceBinding:profile.sourceBinding,
        operation:profile.operation,beforeCollectionId:null,afterCollectionId:null,
        beforeSha256:selection.before.collectionSha256,afterSha256:selection.after.collectionSha256},profile);
      const value=await restoreCollectionComparison({directory:root,sourceManifest:input.sourceManifest,expectedSha256:input.expectedSha256});
      return {id,...bound(value,profile,record)};
    });
  }
  return {list,inspect,rows,create,review,publish,restore,file};
}
/** Existing Workspace.backup holds the live state lease while selecting this closure. */
export async function serviceComparisonFiles({directory,profile}={}){
  const parent=join(await privateDirectory(directory,false),'comparisons'),files=[],comparisons=[];
  for(const id of await names(parent)){
    const root=join(parent,id),raw=await selectedFile(root,'service.json'),record=bindingShape(parse(raw),profile),
      prefix='live/products/'+profile.id+'/comparisons/'+id+'/';
    files.push({path:prefix+'service.json',bytes:raw.length,sha256:digest(raw),bodyBase64:raw.toString('base64')});
    const pending=await partial(root,record);
    if(pending){
      if(pending.selection){const selection=await selectedFile(root,'selection.json');files.push({path:prefix+'selection.json',bytes:selection.length,sha256:digest(selection),bodyBase64:selection.toString('base64')});}
      comparisons.push(pending);continue;
    }
    const retained=await comparisonRetainedFiles(root);bound(retained.comparison,profile,record);
    for(const file of retained.files){const body=await selectedFile(root,file.path,512*1024*1024);
      need(body.length===file.bytes&&digest(body)===file.sha256,'BACKUP_CHANGED','A comparison file changed during its complete workspace backup.');
      files.push({path:prefix+file.path,bytes:file.bytes,sha256:file.sha256,bodyBase64:body.toString('base64')});}
    comparisons.push(brief(id,retained.comparison));
  }
  return {comparisons,files};
}
export function parseComparisonTransferPath(path){
  if(typeof path!=='string')return null;
  const found=path.match(/^live\/products\/([A-Za-z0-9][A-Za-z0-9_.-]{0,127})\/comparisons\/([A-Za-z0-9][A-Za-z0-9_.-]{0,127})\/(.+)$/);
  return found&&filePath(found[3])?{serviceId:found[1],comparisonId:found[2],file:found[3]}:null;
}
/** Source/file closure is validated before the original workspace publishes received state. */
export function validateServiceComparisonTransfer({profile,files}={}){
  const groups=new Map(),prefix='live/products/'+profile.id+'/comparisons/';
  for(const record of files){
    if(typeof record?.path!=='string'||!record.path.startsWith(prefix))continue;
    const selected=parseComparisonTransferPath(record.path);
    need(selected&&selected.serviceId===profile.id&&HASH.test(record.sha256)&&typeof record.bodyBase64==='string',
      'TRANSFER_PATH','The workspace contains an unsupported comparison file.');
    const raw=Buffer.from(record.bodyBase64,'base64');
    need(raw.toString('base64')===record.bodyBase64&&raw.length<=512*1024*1024&&digest(raw)===record.sha256&&
      (record.bytes===undefined||record.bytes===raw.length),'TRANSFER_BYTES','A retained comparison transfer file changed.');
    if(!groups.has(selected.comparisonId))groups.set(selected.comparisonId,new Map());
    const group=groups.get(selected.comparisonId);need(!group.has(selected.file),'TRANSFER_REPEAT','The comparison transfer repeats a file.');
    group.set(selected.file,{raw,bytes:raw.length,sha256:record.sha256});
  }
  const summaries=[];
  for(const [id,group]of groups){
    const get=(path,max=16*1024*1024)=>{const value=group.get(path);need(value&&value.bytes<=max,'TRANSFER_MISSING','The transfer omits '+path+'.');return value;};
    const record=bindingShape(parse(get('service.json').raw),profile);need(record.id===id,'TRANSFER_BINDING','The comparison identifier changed.');
    const expected=new Map([['service.json',get('service.json')]]);
    if(!group.has('data/comparison.json')){
      if(group.has('selection.json')){
        const selected=get('selection.json'),selection=parse(selected.raw);
        need(selection.before?.collectionSha256===record.beforeSha256&&selection.after?.collectionSha256===record.afterSha256&&
          selection.before.sourceBinding===profile.sourceBinding&&selection.after.sourceBinding===profile.sourceBinding,
          'TRANSFER_SELECTION','The unfinished comparison selection belongs to another source pair.');
        expected.set('selection.json',selected);
      }
      need(group.size===expected.size,'TRANSFER_PARTIAL','An unfinished comparison transfer contains uncommitted derived files.');
      summaries.push({id,status:'INCOMPLETE'});continue;
    }
    const manifestRecord=get('data/comparison.json'),manifest=parse(manifestRecord.raw),selected=get('selection.json'),reviews=get('reviews.json');
    need(manifest.schema==='stellar-forge.odata-live-comparison.v1'&&plain(manifest.files)&&
      manifest.selectionSha256===selected.sha256&&stable(parse(selected.raw))===stable(manifest.selection),
      'TRANSFER_MANIFEST','The transferred comparison selection changed.');
    bound(manifest,profile,record);
    for(const [path,file]of Object.entries(manifest.files)){
      need(filePath('data/'+path)&&plain(file)&&HASH.test(file.sha256)&&Number.isSafeInteger(file.bytes)&&file.bytes>=0,
        'TRANSFER_MANIFEST','The comparison manifest declares an unsupported file.');
      expected.set('data/'+path,file);
    }
    expected.set('data/comparison.json',manifestRecord);expected.set('selection.json',selected);expected.set('reviews.json',reviews);
    const sourceDirectories=new Set(['data/analysis']);
    for(const path of group.keys()){
      const match=path.match(/^editions\/([a-f0-9]{64})\//);if(match)sourceDirectories.add('editions/'+match[1]);
    }
    for(const sourceRoot of sourceDirectories){
      const raw=get(sourceRoot+'/source.json',1048576),source=parse(raw.raw);
      need(source.schema==='stellar-forge.analysis-source-document.v1'&&source.complete===true&&source.format==='csv'&&
        plain(source.document)&&Array.isArray(source.originals)&&source.originals.length>=4&&source.originals.length<=32,
        'TRANSFER_SOURCE','The comparison omits its complete analytical source.');
      expected.set(sourceRoot+'/source.json',raw);
      const original=source.originals.find(file=>file.role==='comparison-manifest');
      need(original?.sha256===manifestRecord.sha256&&original.bytes===manifestRecord.bytes,
        'TRANSFER_SOURCE','An analytical edition belongs to another comparison.');
      for(const file of [source.document,...source.originals]){
        const path=sourceRoot+'/'+file.path;
        need(filePath(path)&&file.path==='files/'+file.sha256+'.'+file.path.split('.').at(-1)&&HASH.test(file.sha256)&&
          Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=256*1024*1024,
          'TRANSFER_SOURCE','An analytical source has an invalid declared file.');
        const previous=expected.get(path);need(!previous||previous.bytes===file.bytes&&previous.sha256===file.sha256,
          'TRANSFER_SOURCE','The comparison declares conflicting analytical files.');
        expected.set(path,{bytes:file.bytes,sha256:file.sha256});
      }
    }
    need(group.size===expected.size,'TRANSFER_EXTRA','The comparison transfer includes files outside its complete source closure.');
    for(const [path,file]of expected){const actual=get(path,512*1024*1024);
      need(actual.bytes===file.bytes&&actual.sha256===file.sha256,'TRANSFER_CHANGED','A complete comparison file differs from its selected identity.');}
    summaries.push({id,status:'COMPLETE',manifestSha256:manifestRecord.sha256});
  }
  return summaries;
}
export async function verifyServiceComparisons({directory,profile}={}){
  const parent=join(await privateDirectory(directory,false),'comparisons'),output=[];
  for(const id of await names(parent)){
    const root=join(parent,id),record=bindingShape(parse(await selectedFile(root,'service.json')),profile),pending=await partial(root,record);
    if(pending){output.push(pending);continue;}
    const result=bound(await openCollectionComparison(root,{replay:true}),profile,record);output.push(brief(id,result));
    // This also verifies every frozen review/source edition before state publication.
    await comparisonRetainedFiles(root);
  }
  return output;
}
