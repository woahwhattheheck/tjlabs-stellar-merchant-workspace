import {readFile,writeFile,mkdir,rename,rm,stat,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {VERSION,CONTRACT_SHA256,requestPlan,readSnapshot,selectPeriod,comparePeriods,compareEditions,reportHTML,exportRowsCSV} from './maritime-analysis.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const ENGINE_SHA256=sha(await readFile(new URL('./maritime-analysis.mjs',import.meta.url)));
const json=value=>JSON.stringify(value,null,2)+'\n';
const need=(ok,msg)=>{if(!ok)throw new Error(msg)};
const identifier=value=>{need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value)&&value!=='.'&&value!=='..','Use a plain edition ID of at most 100 characters');return value};
const decode=buffer=>new TextDecoder('utf-8',{fatal:true}).decode(buffer);
async function exists(path){try{await stat(path);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}
async function boundedRead(path,max=128*1024*1024){const info=await stat(path);need(info.isFile()&&info.size<=max,'Input must be a regular file within the 128 MiB receiving limit');return readFile(path)}
async function atomicDirectory(destination,files){
 const target=resolve(destination);await mkdir(dirname(target),{recursive:true});
 need(!await exists(target),'Output already exists; retain it and choose a new explicit destination');
 const temp=target+'.receiving-'+randomUUID();await mkdir(temp);
 try{
  const manifest=[];
  for(const [name,body] of Object.entries(files)){
   need(/^[a-z0-9][a-z0-9._-]*$/i.test(name),'Unsafe bundle filename');
   const bytes=Buffer.isBuffer(body)?body:Buffer.from(body,'utf8');await writeFile(join(temp,name),bytes,{flag:'wx'});
   const actual=await readFile(join(temp,name));need(sha(actual)===sha(bytes),'Received file differs from its source');
   manifest.push({name,bytes:bytes.length,sha256:sha(bytes)});
  }
  await writeFile(join(temp,'manifest.json'),json({schema:'econdb.file-bundle.v1',files:manifest}),{flag:'wx'});
  // Renaming an existing nonempty edition fails; there is no overwrite/replacement path.
  await rename(temp,target);return {directory:target,files:manifest};
 }catch(error){await rm(temp,{recursive:true,force:true});throw error}
}
async function readOriginal(directory){
 const root=resolve(directory),bytes=await boundedRead(join(root,'response.json'));
 const descriptor=JSON.parse(decode(await boundedRead(join(root,'descriptor.json'),2*1024*1024)));
 need(sha(bytes)===descriptor.source_sha256,'Retained original response hash changed');
 const manifest=JSON.parse(decode(await boundedRead(join(root,'manifest.json'),2*1024*1024)));
 for(const name of ['response.json','descriptor.json']){
  const entry=manifest.files.find(x=>x.name===name),body=await boundedRead(join(root,name));
  need(entry&&entry.bytes===body.length&&entry.sha256===sha(body),'Retained edition manifest mismatch: '+name);
 }
 return {directory:root,bytes,descriptor};
}
export async function openEdition(directory){
 const original=await readOriginal(directory),raw=decode(original.bytes),edition=readSnapshot(raw,original.descriptor);
 return {...original,raw,edition};
}
export async function retainEdition({directory,raw,bytes=null,descriptor}){
 identifier(descriptor.id);
 const body=bytes??Buffer.from(raw,'utf8');need(sha(body)===descriptor.source_sha256,'Original response hash disagrees with its descriptor');
 const destination=join(resolve(directory),descriptor.id);
 let edition=null,validationError=null;
 try{edition=readSnapshot(decode(body),descriptor)}catch(error){validationError=error.message}
 const state={id:descriptor.id,status:validationError?'source_review_required':'analyzable',validation_error:validationError,edition};
 if(await exists(destination)){
  const previous=await readOriginal(destination);
  need(previous.bytes.equals(body)&&json(previous.descriptor)===json(descriptor),'An existing edition ID identifies different retained content; choose a new edition ID');
  return {directory:destination,resumed:true,...state};
 }
 const result=await atomicDirectory(destination,{'response.json':body,'descriptor.json':json(descriptor),'receiving-state.json':json({schema:'econdb.source-receiving.v1',id:descriptor.id,status:state.status,validation_error:validationError,received_at:new Date().toISOString()})});
 return {...result,resumed:false,...state};
}
export async function receiveEdition({sourcePath,descriptorPath,directory}){
 const bytes=await boundedRead(sourcePath),descriptor=JSON.parse(decode(await boundedRead(descriptorPath,2*1024*1024)));
 return retainEdition({directory,bytes,descriptor});
}
export async function captureEdition({directory,id,request,token=process.env.ECONDB_TOKEN,timeoutMs=90000,maxBytes=128*1024*1024,fetchImpl=fetch}){
 identifier(id);const plan=requestPlan(request);need(plan.kind!=='ports','Use captureCatalogue for the original port directory');
 const destination=join(resolve(directory),id);
 if(await exists(destination)){
  const previous=await readOriginal(destination);
  need(previous.descriptor.original_url===plan.url,'Saved ID belongs to another request');
  need(previous.descriptor.source_role==='authenticated_response','Saved ID belongs to another source role');
  return retainEdition({directory,bytes:previous.bytes,descriptor:previous.descriptor});
 }
 need(typeof token==='string'&&token.trim()&&!/[\r\n]/.test(token),'Set the existing authorized ECONDB_TOKEN in this process environment');
 const response=await fetchImpl(plan.url,{method:'GET',headers:{Authorization:'Token '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
 need(response.ok,'Econdb returned HTTP '+response.status+'; the prior retained edition remains available');
 const length=Number(response.headers.get('content-length')||0);need(!length||length<=maxBytes,'Response exceeds receiving limit');
 const pieces=[];let count=0;for await(const chunk of response.body){count+=chunk.length;need(count<=maxBytes,'Response exceeds receiving limit');pieces.push(Buffer.from(chunk))}
 const bytes=Buffer.concat(pieces),captured_at=new Date().toISOString();
 const descriptor={id,kind:request.kind,locode:request.locode,source_role:'authenticated_response',captured_at,source_sha256:sha(bytes),original_url:plan.url,basis:{capture:'direct original HTTPS response',http_status:response.status,content_type:response.headers.get('content-type'),etag:response.headers.get('etag'),last_modified:response.headers.get('last-modified')}};
 for(const key of ['flow','operator','top'])if(Object.hasOwn(request,key))descriptor[key]=request[key];
 return retainEdition({directory,bytes,descriptor});
}
export async function captureCatalogue({directory,id,token=process.env.ECONDB_TOKEN,fetchImpl=fetch}){
 identifier(id);const plan=requestPlan({kind:'ports'}),destination=join(resolve(directory),id);
 if(await exists(destination)){
  const oldBytes=await boundedRead(join(destination,'response.json'),16*1024*1024),oldDescriptor=JSON.parse(decode(await boundedRead(join(destination,'descriptor.json'),2*1024*1024)));
  const manifest=JSON.parse(decode(await boundedRead(join(destination,'manifest.json'),2*1024*1024)));
  need(oldDescriptor.kind==='ports'&&oldDescriptor.id===id&&oldDescriptor.source_role==='authenticated_response'&&oldDescriptor.original_url===plan.url&&oldDescriptor.source_sha256===sha(oldBytes),'Existing catalogue has another identity or changed original bytes');
  for(const name of ['response.json','descriptor.json']){const entry=manifest.files.find(x=>x.name===name),body=await boundedRead(join(destination,name));need(entry&&entry.bytes===body.length&&entry.sha256===sha(body),'Catalogue manifest mismatch: '+name)}
  return {directory:destination,resumed:true};
 }
 need(typeof token==='string'&&token.trim()&&!/[\r\n]/.test(token),'Set the existing authorized ECONDB_TOKEN');
 const response=await fetchImpl(plan.url,{headers:{Authorization:'Token '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(90000)});
 need(response.ok,'Port catalogue returned HTTP '+response.status);
 const parts=[];let size=0;for await(const chunk of response.body){size+=chunk.length;need(size<=16*1024*1024,'Port catalogue exceeds receiving limit');parts.push(Buffer.from(chunk))}
 const bytes=Buffer.concat(parts),captured_at=new Date().toISOString();let ports=null,validationError=null,selection=[];
 try{ports=JSON.parse(decode(bytes));need(Array.isArray(ports),'Expected original port catalogue array');selection=ports.map((port,index)=>({source_row:index,name:typeof port?.name==='string'?port.name:null,locode:typeof port?.locode==='string'?port.locode:null,usable:typeof port?.locode==='string'&&/^[A-Z]{2} ?[A-Z0-9]{3}$/.test(port.locode),original:port}))}
 catch(error){validationError=error.message}
 const status=validationError?'source_review_required':'analyzable';
 const result=await atomicDirectory(destination,{'response.json':bytes,'descriptor.json':json({id,kind:'ports',source_role:'authenticated_response',captured_at,source_sha256:sha(bytes),original_bytes:bytes.length,original_url:plan.url,population:'issuer_top_400_ports',ports:Array.isArray(ports)?ports.length:null}),'catalogue-selection.json':json({schema:'econdb.port-selection.v1',population:'issuer_top_400_ports',rows:selection}),'receiving-state.json':json({schema:'econdb.source-receiving.v1',id,status,validation_error:validationError,received_at:captured_at})});
 return {...result,status,validation_error:validationError};
}
export async function analyzeEdition({editionDirectory,selection,directory,before=null,after=null,previousDirectory=null}){
 const current=await openEdition(editionDirectory),period=selectPeriod(current.edition,selection);
 need(Boolean(before)===Boolean(after),'Supply both comparison periods together');
 const comparison=before?comparePeriods(current.edition,before,after):null;
 const previous=previousDirectory?await openEdition(previousDirectory):null;
 const revisions=previous?compareEditions(previous.edition,current.edition,selection):null;
 const files={'current-response.json':current.raw,'current-descriptor.json':json(current.descriptor),'edition.json':json(current.edition),'selected-period.json':json(period),'observations.csv':exportRowsCSV(period),'report.html':reportHTML({edition:current.edition,period,comparison,editionComparison:revisions,engine_sha256:ENGINE_SHA256})};
 if(comparison)files['period-comparison.json']=json(comparison);
 if(revisions){files['edition-comparison.json']=json(revisions);files['previous-response.json']=previous.raw;files['previous-descriptor.json']=json(previous.descriptor)}
 files['analysis-source.json']=json({schema:'econdb.analysis-source.v1',engine:{version:VERSION,sha256:ENGINE_SHA256,contract_sha256:CONTRACT_SHA256},current:{id:current.edition.id,source_sha256:current.descriptor.source_sha256,original_bytes:current.edition.source.original_bytes},previous:previous?{id:previous.edition.id,source_sha256:previous.descriptor.source_sha256}:null,selection:period.selection,generated_at:new Date().toISOString()});
 return atomicDirectory(directory,files);
}
export async function listEditions(directory){
 const result=[];for(const entry of await readdir(resolve(directory),{withFileTypes:true})){
  if(!entry.isDirectory()||entry.name.includes('.receiving-'))continue;
  try{const original=await readOriginal(join(directory,entry.name));let status='analyzable',validation_error=null,locode=original.descriptor.locode??null;try{if(original.descriptor.kind==='ports')need(Array.isArray(JSON.parse(decode(original.bytes))),'Expected original catalogue array');else readSnapshot(decode(original.bytes),original.descriptor)}catch(error){status='source_review_required';validation_error=error.message}result.push({id:original.descriptor.id,kind:original.descriptor.kind,locode,captured_at:original.descriptor.captured_at,sha256:original.descriptor.source_sha256,status,validation_error,directory:original.directory})}
  catch(error){result.push({directory:join(resolve(directory),entry.name),error:error.message})}
 }return result;
}
