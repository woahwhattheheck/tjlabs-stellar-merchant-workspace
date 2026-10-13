// MIT. Complete remote subscription artifacts and original offline customer receiving.
import {createHash,randomUUID} from 'node:crypto';
import {resolve,relative,isAbsolute,join,basename,sep} from 'node:path';
import {createRetainedDownload,openMerchantFileClient} from './retained-download.mjs';

export const ODATA_SUBSCRIPTION_DOWNLOAD_SCHEMA='stellar-forge.odata-subscription-download.v1';
export const ODATA_SUBSCRIPTION_RECEIVING_SCHEMA='stellar-forge.odata-subscription-receiving.v1';
const ARTIFACT_SCHEMA='stellar-forge.odata-subscription-artifact.v1';
const STATE_SCHEMA='stellar-forge.odata-subscription-download-state.v1';
const SCOPE_SCHEMA='stellar-forge.odata-subscription-download-scope.v1';
const RECORD='subscription-artifact.json',TOOL='odata_subscription_customer';
const PREFIX='merchant_odata_subscription_';
const HASH=/^[a-f0-9]{64}$/,ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_FILE=256*1024*1024,MAX_TOTAL=512*1024*1024,MAX_METADATA=16*1024*1024;
const KINDS=['transfer','original','publisher-backup','customer-backup','analysis'];
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const bytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const fail=(code,message)=>Object.assign(new Error(message),{code:'ODATA_SUBSCRIPTION_CLIENT_'+code});
const need=(value,code,message)=>{if(!value)throw fail(code,message);};
function hash(value){need(typeof value==='string'&&HASH.test(value),'IDENTITY','Select the complete original SHA-256.');return value;}
function alias(value){need(typeof value==='string'&&ALIAS.test(value),'ALIAS','Choose an original configured publisher or artifact alias.');return value;}
function integer(value,low,high,label){need(Number.isSafeInteger(value)&&value>=low&&value<=high,'ARGUMENTS','Choose a valid '+label+'.');return value;}
function parse(raw){
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
  catch{throw fail('JSON','Retain the complete original UTF-8 JSON file.');}
}
function fileIdentity(file){
  need(plain(file)&&typeof file.path==='string'&&file.path.length>0&&file.path.length<=1024&&
    !file.path.startsWith('/')&&!file.path.includes('\\')&&file.path.split('/').length<=32&&
    file.path.split('/').every(part=>part!=='.'&&part!=='..'&&/^[A-Za-z0-9_.-]+$/.test(part))&&
    file.path!==RECORD&&file.path!=='download-state'&&!file.path.startsWith('download-state/')&&
    Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=MAX_FILE&&HASH.test(file.sha256),
    'FILE','Retain canonical relative file names, complete byte counts and original digests.');
  return {path:file.path,bytes:file.bytes,sha256:file.sha256};
}
function sameFile(a,b){return a?.path===b?.path&&a?.bytes===b?.bytes&&a?.sha256===b?.sha256;}
function nativeManifestName(kind){return kind==='transfer'?'transfer.json':kind==='analysis'?'source.json':kind==='original'?'collection.json':'backup.json';}
function artifactRecord(value,selected,expectedSha256){
  need(plain(value)&&value.schema===ARTIFACT_SCHEMA&&value.state==='COMPLETE'&&KINDS.includes(value.kind),
    'ARTIFACT','Select a complete original subscription artifact.');
  alias(value.artifact);if(selected!==undefined)need(value.artifact===alias(selected),'ARTIFACT_CHANGED','The provider returned another artifact.');
  need(plain(value.selection)&&plain(value.result)&&Array.isArray(value.files)&&value.files.length>0&&value.files.length<=2048,
    'ARTIFACT','The complete retained artifact inventory is missing.');
  const files=value.files.map(fileIdentity),seen=new Set();let total=0;
  for(const file of files){
    need(!seen.has(file.path),'ARTIFACT','The original artifact repeats a file.');
    seen.add(file.path);total+=file.bytes;need(total<=MAX_TOTAL,'LIMIT','The complete artifact exceeds 512 MiB.');
  }
  const manifest=fileIdentity(value.manifest);
  need(manifest.path===nativeManifestName(value.kind)&&manifest.bytes>0&&manifest.bytes<=MAX_METADATA&&
    sameFile(files.find(f=>f.path===manifest.path),manifest)&&value.bytesTotal===total,
    'ARTIFACT','The native manifest and complete artifact inventory disagree.');
  if(expectedSha256!==undefined)need(manifest.sha256===hash(expectedSha256),'ARTIFACT_CHANGED','The artifact differs from its reviewed native manifest SHA-256.');
  // This is the provider's public artifact record, with only its transient reused flag omitted.
  // Every native manifest and payload remains an ordinary unchanged member below.
  return {schema:ARTIFACT_SCHEMA,artifact:value.artifact,kind:value.kind,state:'COMPLETE',
    selection:structuredClone(value.selection),manifest,files,bytesTotal:total,result:structuredClone(value.result)};
}
function parseRecord(raw,exportId){
  hash(exportId);need(raw.length>0&&raw.length<=MAX_METADATA,'LIMIT','The complete artifact record exceeds its metadata limit.');
  const record=artifactRecord(parse(raw),undefined,exportId);
  need(bytes(record).equals(raw),'RECORD_CHANGED','The retained original artifact record encoding changed.');
  return {...record,exportId,files:record.files.map(f=>({name:f.path,bytes:f.bytes,sha256:f.sha256})),record};
}
function describe(value){return {artifact:value.artifact,kind:value.kind,artifactSha256:value.manifest.sha256,nativeManifest:value.manifest.path};}
function downloader(){return createRetainedDownload({manifestName:RECORD,parseManifest:parseRecord,
  maximumBytes:MAX_FILE,maximumManifestBytes:MAX_METADATA,maximumCheckpointBytes:MAX_METADATA,
  stateSchema:STATE_SCHEMA,resultSchema:ODATA_SUBSCRIPTION_DOWNLOAD_SCHEMA,toolPrefix:TOOL,
  errorPrefix:'ODATA_SUBSCRIPTION',clientName:'starforge-odata-subscription-customer',
  nestedFiles:true,validateExportId:hash,describe});}
async function originalClient(input){
  if(input.client!==undefined){
    need(plain(input.client)&&typeof input.client.call==='function'&&typeof input.client.endpoint==='string'&&
      input.client.endpoint.length>0&&input.client.endpoint.length<=3072&&!/[\0\r\n]/.test(input.client.endpoint)&&input.url===undefined,
      'CONNECTION','Supply one original merchant client and stable endpoint, or its URL.');
    return {endpoint:input.client.endpoint,call:input.client.call.bind(input.client)};
  }
  return openMerchantFileClient({url:input.url,tokenEnv:input.tokenEnv,environment:input.environment,signal:input.signal,
    errorPrefix:'ODATA_SUBSCRIPTION',clientName:'starforge-odata-subscription-customer',maximumResponseBytes:32*1024*1024});
}
async function call(client,name,args,signal){
  signal?.throwIfAborted();const result=await client.call(PREFIX+name,args,signal?{requestSignal:signal}:{});
  need(plain(result),'REPLY','The original subscription tool returned no structured result.');return result;
}
function scope(endpoint,record){
  const value=JSON.stringify({schema:SCOPE_SCHEMA,endpoint,artifact:record.artifact,kind:record.kind,artifactSha256:record.manifest.sha256});
  need(value.length<=4096,'CONNECTION','The complete endpoint and selected artifact exceed the retained scope limit.');return value;
}
function readScope(value,record){
  let selected;try{selected=JSON.parse(value);}catch{throw fail('SCOPE','The original retained merchant scope is missing.');}
  need(selected?.schema===SCOPE_SCHEMA&&typeof selected.endpoint==='string'&&selected.endpoint.length>0&&
    selected.endpoint.length<=3072&&!/[\0\r\n]/.test(selected.endpoint)&&
    selected.artifact===record.artifact&&selected.kind===record.kind&&selected.artifactSha256===record.manifest.sha256,
    'SCOPE','The saved download selects another merchant artifact.');
  return selected;
}
function adapter(client,record){
  const recordBytes=bytes(record),recordSha=sha(recordBytes),exportId=record.manifest.sha256;
  need(recordBytes.length<=MAX_METADATA,'LIMIT','The complete public artifact record exceeds 16 MiB.');
  const manifestFile={name:RECORD,bytes:recordBytes.length,sha256:recordSha};
  const files=new Map(record.files.map(f=>[f.path,f])),metadataReads=new Set();
  return {endpoint:scope(client.endpoint,record),async call(name,args,options){
    need(args.exportId===exportId,'ARTIFACT_CHANGED','The download selected another native manifest.');
    if(name===TOOL+'_manifest')return {state:'MANIFEST_RETAINED',exportId,manifestFile};
    if(name===TOOL+'_file_release'){
      if(metadataReads.delete(args.readId))return {exportId,readId:args.readId,state:'RELEASED'};
      const result=await client.call(PREFIX+'file_release',{readId:args.readId},options);
      need(result.readId===args.readId&&result.state==='RELEASED','READ','The original file release returned another read.');
      return {...result,exportId};
    }
    need(name===TOOL+'_file'&&args.expectedManifestSha256===recordSha,'RECORD_CHANGED','The selected artifact record changed.');
    if(args.file===RECORD){
      need(args.expectedSha256===recordSha,'RECORD_CHANGED','The selected public artifact record changed.');
      integer(args.offset,0,recordBytes.length,'record offset');integer(args.limit,1,196608,'record range');
      const readId=args.readId??randomUUID();
      need(!args.readId||metadataReads.has(readId),'READ','The selected local metadata read is no longer open.');
      metadataReads.add(readId);const data=recordBytes.subarray(args.offset,Math.min(recordBytes.length,args.offset+args.limit));
      const nextOffset=args.offset+data.length<recordBytes.length?args.offset+data.length:null;
      if(nextOffset===null)metadataReads.delete(readId);
      return {exportId,manifestSha256:recordSha,file:manifestFile,readId,offset:args.offset,bytesRead:data.length,
        nextOffset,encoding:'base64',data:data.toString('base64')};
    }
    const selected=files.get(args.file);
    need(selected&&selected.sha256===args.expectedSha256,'FILE','Read only a member of this complete original artifact.');
    const result=await client.call(PREFIX+'file',{artifact:record.artifact,path:selected.path,expectedSha256:selected.sha256,
      offset:args.offset,limit:args.limit,...(args.readId?{readId:args.readId}:{})},options);
    need(result.file?.name===basename(selected.path)&&result.file?.bytes===selected.bytes&&result.file?.sha256===selected.sha256,
      'FILE_CHANGED','The original ranged file differs from the selected inventory.');
    return {...result,exportId,manifestSha256:recordSha,file:{...result.file,name:selected.path}};
  }};
}
function page(value,offset,limit){
  need(value.offset===offset&&Number.isSafeInteger(value.total)&&value.total>=0&&Array.isArray(value.items)&&value.items.length<=limit&&
    (value.nextOffset===null||value.nextOffset===offset+value.items.length&&value.nextOffset>offset&&value.nextOffset<value.total),
    'PAGE','The native page has an inconsistent offset, total or continuation.');
  need(value.items.length===Math.min(limit,Math.max(0,value.total-offset)),'PAGE','The native page omitted part of its selected range.');
  return value;
}
function pageArgs(input,maximum=100000){return {offset:integer(input.offset??0,0,maximum,'page offset'),limit:integer(input.limit??50,1,100,'page size')};}

export async function inspectMerchantODataSubscriptions(input={}){
  const client=await originalClient(input),result=await call(client,'status',{},input.signal);
  need(result.configured===true&&result.schema==='stellar-forge.odata-subscription-operator.v1',
    'NOT_CONFIGURED','Select a merchant with its original subscription connection configured.');
  return {...result,endpoint:client.endpoint};
}
export async function inspectMerchantODataSubscriptionPublisher(input={}){
  const client=await originalClient(input),publisher=alias(input.publisher),result=await call(client,'publisher_inspect',{publisher},input.signal);
  need(result.schema==='stellar-forge.odata-subscription-inspection.v1'&&HASH.test(result.definitionSha256)&&
    Number.isSafeInteger(result.head)&&result.head>=0&&result.head<=10000,'PUBLISHER','The original publisher inspection is incomplete.');
  return {...result,publisher,endpoint:client.endpoint};
}
export async function listMerchantODataSubscriptionEditions(input={}){
  const client=await originalClient(input),publisher=alias(input.publisher),args=pageArgs(input,10000);
  const result=page(await call(client,'publisher_editions',{publisher,...args},input.signal),args.offset,args.limit);
  need(HASH.test(result.definitionSha256)&&result.items.every((e,i)=>e.revision===args.offset+i+1&&HASH.test(e.manifestSha256)),
    'EDITION','The original published edition order or identity changed.');
  return {...result,publisher,endpoint:client.endpoint};
}
export async function readMerchantODataSubscriptionRows(input={}){
  const client=await originalClient(input),publisher=alias(input.publisher),revision=integer(input.revision,1,10000,'published edition');
  const kind=input.kind??'rows';need(['rows','changes'].includes(kind),'KIND','Choose complete rows or keyed changes.');
  const args=pageArgs(input,2000000),result=page(await call(client,'publisher_rows',{publisher,revision,kind,...args},input.signal),args.offset,args.limit);
  need(result.revision===revision&&result.kind===kind&&HASH.test(result.editionSha256),'EDITION','The row page belongs to another published edition.');
  if(input.expectedEditionSha256!==undefined)need(result.editionSha256===hash(input.expectedEditionSha256),'EDITION_CHANGED','The published row page differs from its selected edition.');
  return {...result,publisher,endpoint:client.endpoint};
}
export async function listMerchantODataSubscriptionArtifacts(input={}){
  const client=await originalClient(input),args=pageArgs(input);
  const result=page(await call(client,'artifacts',args,input.signal),args.offset,args.limit);
  return {...result,endpoint:client.endpoint};
}
async function selectedArtifact(client,input){
  const record=artifactRecord(await call(client,'artifact',{artifact:alias(input.artifact)},input.signal),input.artifact,input.expectedSha256);
  return record;
}
export async function inspectMerchantODataSubscriptionArtifact(input={}){
  const client=await originalClient(input),record=await selectedArtifact(client,input);
  return {schema:ODATA_SUBSCRIPTION_DOWNLOAD_SCHEMA,state:'INSPECTED',endpoint:client.endpoint,
    artifact:record,artifactSha256:record.manifest.sha256,recordSha256:sha(bytes(record))};
}
export async function createMerchantODataSubscriptionDelivery(input={}){
  const client=await originalClient(input),publisher=alias(input.publisher),artifact=alias(input.artifact);
  const fromRevision=integer(input.fromRevision,0,9999,'starting edition'),toRevision=integer(input.toRevision,1,10000,'ending edition');
  need(toRevision>fromRevision&&(fromRevision===0||toRevision-fromRevision<=100),'RANGE','Select a full baseline or at most 100 consecutive new editions.');
  const expectedEditionSha256=hash(input.expectedEditionSha256);
  const expectedFromEditionSha256=fromRevision===0?null:hash(input.expectedFromEditionSha256);
  need(fromRevision>0||input.expectedFromEditionSha256===undefined||input.expectedFromEditionSha256===null,
    'RANGE','A complete baseline has no prior customer edition.');
  // Both endpoints are reviewed before requesting the native immutable artifact.
  // Native publisher editions are immutable; the returned transfer is checked again below.
  for(const [revision,expected] of [[toRevision,expectedEditionSha256],...(fromRevision?[[fromRevision,expectedFromEditionSha256]]:[])]){
    const result=page(await call(client,'publisher_editions',{publisher,offset:revision-1,limit:1},input.signal),revision-1,1);
    need(result.items.length===1&&result.items[0].revision===revision&&result.items[0].manifestSha256===expected,
      'EDITION_CHANGED','The publisher differs from the reviewed delivery endpoint.');
  }
  const request={publisher,artifact,fromRevision,toRevision};
  const record=artifactRecord(await call(client,'publisher_delivery',request,input.signal),artifact);
  need(record.kind==='transfer'&&Object.keys(record.selection).length===Object.keys(request).length&&
    Object.entries(request).every(([key,value])=>record.selection[key]===value)&&
    record.result.fromRevision===fromRevision&&record.result.toRevision===toRevision&&
    record.result.fromEditionSha256===expectedFromEditionSha256&&record.result.toEditionSha256===expectedEditionSha256,
    'DELIVERY_CHANGED','The original retained delivery differs from its selected editions.');
  return {schema:ODATA_SUBSCRIPTION_DOWNLOAD_SCHEMA,state:'SELECTED',endpoint:client.endpoint,
    artifact:record,artifactSha256:record.manifest.sha256,recordSha256:sha(bytes(record))};
}

/** Retain the whole public artifact record and every unchanged native file. */
export async function downloadMerchantODataSubscriptionArtifact(input={}){
  hash(input.expectedSha256);const client=await originalClient(input),record=await selectedArtifact(client,input),native=downloader();
  const result=await native.download({client:adapter(client,record),exportId:record.manifest.sha256,
    expectedManifestSha256:sha(bytes(record)),directory:input.directory,signal:input.signal,
    chunkSize:input.chunkSize,onProgress:input.onProgress});
  return {...result,endpoint:client.endpoint,artifactRecord:join(result.directory,RECORD),
    nativeManifest:join(result.directory,record.manifest.path)};
}
async function verifiedDownload(input,operation){
  const native=downloader();
  return native.lockedDownload(input.directory,async context=>{
    const raw=await native.bytesAt(join(context.root,RECORD),MAX_METADATA),initial=parse(raw);
    const expected=input.expectedSha256===undefined?initial?.manifest?.sha256:hash(input.expectedSha256);
    const selected=parseRecord(raw,expected),record=selected.record;
    const saved=parse(await native.bytesAt(join(context.stateDirectory,'checkpoint.json'),MAX_METADATA));
    need(saved.schema===STATE_SCHEMA&&saved.exportId===expected&&saved.manifestSha256===sha(raw),
      'CHECKPOINT','The completed artifact has another original download checkpoint.');
    const selectedScope=readScope(saved.endpoint,record);
    await native.loadContext(context,raw,expected,saved.endpoint);
    for(const file of selected.files){
      const retained=context.state.files[file.name];
      need(retained?.complete===true&&retained.bytes===file.bytes&&retained.sha256===file.sha256,
        'INCOMPLETE','Complete every original artifact file before receiving.');
      await native.verifiedFile(join(context.root,file.name),file,input.signal);
    }
    await nativeInventory(context.root,record,native);
    input.signal?.throwIfAborted();
    return operation({native,context,record,scope:selectedScope});
  });
}
async function nativeInventory(root,record,native){
  const raw=await native.bytesAt(join(root,record.manifest.path),MAX_METADATA),value=parse(raw);
  const actual=new Map(record.files.map(f=>[f.path,f]));
  if(['transfer','publisher-backup','customer-backup'].includes(record.kind)){
    const schemas={transfer:'stellar-forge.odata-subscription-transfer.v1','publisher-backup':'stellar-forge.odata-subscription-backup.v1',
      'customer-backup':'stellar-forge.odata-subscription-customer-backup.v1'};
    need(value.schema===schemas[record.kind]&&Array.isArray(value.files),'NATIVE_MANIFEST','Choose the matching complete original native manifest.');
    const expected=new Map([[record.manifest.path,record.manifest]]);
    for(const item of value.files){const file=fileIdentity(item);need(!expected.has(file.path),'NATIVE_MANIFEST','The native manifest repeats an artifact member.');expected.set(file.path,file);}
    need(actual.size===expected.size&&[...expected].every(([name,file])=>sameFile(file,actual.get(name))),
      'NATIVE_MANIFEST','The public artifact must retain exactly every original native manifest member.');
  }else if(record.kind==='analysis'){
    need(value.schema==='stellar-forge.analysis-source-document.v1'&&value.complete===true&&value.format==='csv'&&Array.isArray(value.originals),
      'NATIVE_MANIFEST','Choose a complete original subscription Analysis source.');
    const selected=[value.document,...value.originals].map(fileIdentity);
    for(const file of selected)need(sameFile(file,actual.get(file.path)),'NATIVE_MANIFEST','An original Analysis member differs from the complete artifact.');
    const names=new Set(['source.json','dataset.csv','customer.json',...selected.map(f=>f.path)]);
    need(names.size===actual.size&&[...actual.keys()].every(name=>names.has(name))&&
      actual.get('dataset.csv')?.sha256===value.document.sha256&&actual.get('dataset.csv')?.bytes===value.document.bytes,
      'NATIVE_MANIFEST','The complete customer Analysis artifact omits or substitutes original members.');
  }
}
export async function inspectODataSubscriptionDownload(input={}){
  return verifiedDownload(input,({context,record,scope:selected})=>({schema:ODATA_SUBSCRIPTION_DOWNLOAD_SCHEMA,state:'COMPLETE',
    directory:context.root,endpoint:selected.endpoint,artifact:record,artifactSha256:record.manifest.sha256,
    recordSha256:context.manifestSha256,nativeManifest:join(context.root,record.manifest.path),artifactRecord:join(context.root,RECORD)}));
}
function disjoint(left,right){
  need(typeof left==='string'&&left.length>0&&!left.includes('\0')&&typeof right==='string'&&right.length>0&&!right.includes('\0'),
    'DIRECTORY','Select separate private source and destination directories.');
  const a=resolve(left),b=resolve(right),inside=(parent,child)=>{const path=relative(parent,child);return path===''||(!path.startsWith('..'+sep)&&path!=='..'&&!isAbsolute(path));};
  need(a!=='/'&&b!=='/'&&!inside(a,b)&&!inside(b,a),'DIRECTORY','Keep the full input and customer/export directory separate.');
  return {source:a,destination:b};
}
const customerModule=()=>import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/customer.mjs');

/** This invokes the original native receiver; the transport metadata is never a replacement native source. */
export async function receiveODataSubscriptionDownload(input={}){
  hash(input.expectedSha256);const paths=disjoint(input.directory,input.customerDirectory);
  return verifiedDownload({...input,directory:paths.source},async({context,record,scope:selected})=>{
    need(['transfer','customer-backup','analysis'].includes(record.kind),'RECEIVING_KIND',
      'Customer receiving accepts a complete transfer, customer backup or customer Analysis source.');
    const native=await customerModule();input.signal?.throwIfAborted();let result;
    if(record.kind==='transfer')result=await native.receiveSubscription({directory:paths.destination,transferDirectory:context.root,expectedSha256:record.manifest.sha256});
    else if(record.kind==='customer-backup')result=await native.restoreSubscriptionCustomer({directory:paths.destination,source:context.root,expectedSha256:record.manifest.sha256});
    else result=await native.restoreSubscriptionAnalytical({directory:paths.destination,sourceManifest:join(context.root,'source.json'),expectedSha256:record.manifest.sha256});
    return {schema:ODATA_SUBSCRIPTION_RECEIVING_SCHEMA,state:'COMPLETE',endpoint:selected.endpoint,artifact:record.artifact,kind:record.kind,
      artifactSha256:record.manifest.sha256,downloadDirectory:context.root,customerDirectory:paths.destination,result};
  });
}
export async function fetchODataSubscription(input={}){
  disjoint(input.directory,input.customerDirectory);
  const selected=await createMerchantODataSubscriptionDelivery(input);
  const download=await downloadMerchantODataSubscriptionArtifact({...input,expectedSha256:selected.artifactSha256});
  const receiving=await receiveODataSubscriptionDownload({directory:download.directory,customerDirectory:input.customerDirectory,
    expectedSha256:selected.artifactSha256,signal:input.signal});
  return {schema:ODATA_SUBSCRIPTION_RECEIVING_SCHEMA,state:'COMPLETE',selection:selected,download,receiving};
}
export async function inspectReceivedODataSubscription({directory}={}){
  need(typeof directory==='string'&&directory.length>0,'DIRECTORY','Choose the original customer directory.');
  return (await customerModule()).inspectSubscriptionCustomer(resolve(directory));
}
export async function readReceivedODataSubscriptionRows({directory,offset=0,limit=100}={}){
  integer(offset,0,1000000,'row offset');integer(limit,1,500,'row page size');
  need(typeof directory==='string'&&directory.length>0,'DIRECTORY','Choose the original customer directory.');
  return (await customerModule()).subscriptionCustomerRows(resolve(directory),{offset,limit});
}
export async function backupReceivedODataSubscription(input={}){
  const paths=disjoint(input.directory,input.output);
  integer(input.expectedRevision,1,10000,'customer edition');hash(input.expectedEditionSha256);
  return (await customerModule()).subscriptionCustomerBackup(paths.source,{output:paths.destination,
    expectedRevision:input.expectedRevision,expectedEditionSha256:input.expectedEditionSha256});
}
export async function exportReceivedODataSubscription(input={}){
  const paths=disjoint(input.directory,input.output);
  integer(input.expectedRevision,1,10000,'customer edition');hash(input.expectedEditionSha256);
  return (await customerModule()).exportSubscriptionCustomer(paths.source,{output:paths.destination,title:input.title,
    expectedRevision:input.expectedRevision,expectedEditionSha256:input.expectedEditionSha256});
}
export async function restoreODataSubscriptionCustomer(input={}){
  const paths=disjoint(input.sourceDirectory,input.customerDirectory);hash(input.expectedSha256);
  need(['customer-backup','analysis'].includes(input.kind),'RECEIVING_KIND','Restore a complete native customer backup or customer Analysis source.');
  const native=await customerModule();input.signal?.throwIfAborted();
  return input.kind==='analysis'?native.restoreSubscriptionAnalytical({directory:paths.destination,
    sourceManifest:join(paths.source,'source.json'),expectedSha256:input.expectedSha256}):
    native.restoreSubscriptionCustomer({directory:paths.destination,source:paths.source,expectedSha256:input.expectedSha256});
}
export async function receivedODataSubscriptionAnalysisMapping({directory,source,sourceRevision}={}){
  const native=await customerModule(),current=await inspectReceivedODataSubscription({directory});
  return native.subscriptionAnalysisMapping(current.definition,{source,sourceRevision});
}
