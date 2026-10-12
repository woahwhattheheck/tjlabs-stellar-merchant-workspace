// MIT. Durable complete public Board downloads and original DDP capture receiving.
import { resolve,join,dirname,basename } from 'node:path';
import { privateDirectory,atomicJson,readPrivateJson,withPrivateLock } from '../../routescan/quota.mjs';
import { canonical,clone,need,plain } from '../model.mjs';
import { DDP_CROSSWALK_URL,DDP_H15_ARCHIVE_URL,MAX_DDP_FILE_BYTES,MAX_DDP_CAPTURE_BYTES,ddpBoardUrl,ddpFileName,ddpHash,
  createFredDdpSourceFile,fredDdpFileDescriptor,validateFredDdpSourceFile,normalizeFredDdpRelease } from './files.mjs';
import { sealFredDdpCrosswalk,inspectFredDdpCrosswalk } from './crosswalk.mjs';
import { sealFredDdpPackage,inspectFredDdpPackage,FRED_DDP_PACKAGE_FORMATS,normalizeFredDdpCsvLayout } from './package.mjs';
const SCHEMA='stellar-forge.fred-ddp-acquisition.v1';
const same=(a,b)=>canonical(a)===canonical(b);
const inspect=(kind,capture)=>kind==='crosswalk'?inspectFredDdpCrosswalk(capture):inspectFredDdpPackage(capture);
const seal=(kind,request,files)=>kind==='crosswalk'?sealFredDdpCrosswalk({file:files[0]}):sealFredDdpPackage({file:files[0],release:request.release,
  format:request.format,csvLayout:request.csvLayout,supplementalFiles:files.slice(1)});
async function optional(path){try{return await readPrivateJson(path,MAX_DDP_CAPTURE_BYTES);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function normalizedSource(value){
  if(typeof value==='string')return {url:ddpBoardUrl(value),name:null};
  need(plain(value)&&Object.keys(value).every(key=>['url','name'].includes(key)),'Select an original source URL and optional original filename.');
  return {url:ddpBoardUrl(value.url),name:value.name===undefined||value.name===null?null:ddpFileName(value.name)};
}
export function normalizeFredDdpAcquisition(input){
  need(plain(input)&&['crosswalk','package'].includes(input.kind),'Choose crosswalk or package acquisition.');
  const source=normalizedSource({url:input.url??(input.kind==='crosswalk'?DDP_CROSSWALK_URL:DDP_H15_ARCHIVE_URL),name:input.name??null});
  if(input.kind==='crosswalk')return {kind:'crosswalk',sources:[source]};
  const release=normalizeFredDdpRelease(input.release??'H15'),format=input.format??'board-sdmx-zip';
  need(FRED_DDP_PACKAGE_FORMATS.includes(format),'Choose the original package format.');
  need(Array.isArray(input.supplementalUrls??[])&&(input.supplementalUrls??[]).length<=1024,'Invalid original supplemental source URLs.');
  const sources=[source,...(input.supplementalUrls??[]).map(normalizedSource)];
  need(new Set(sources.map(item=>item.url)).size===sources.length,'Acquire each original source URL once.');
  const csvLayout=normalizeFredDdpCsvLayout(input.csvLayout??null);need(format==='ddp-csv'||csvLayout===null,'CSV cell layout belongs to CSV source only.');
  return {kind:'package',sources,release,format,csvLayout};
}
function safeHeaders(headers){
  const out={};
  for(const name of ['content-type','content-length','content-disposition','content-encoding','date','etag','last-modified','cache-control']){
    const value=headers.get(name);if(value!==null)out[name]=value;
  }return out;
}
function responseName(response,url,selected){
  if(selected)return selected;
  const disposition=response.headers.get('content-disposition')||'';
  const encoded=/filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const quoted=/filename\s*=\s*"([^"]+)"/i.exec(disposition)?.[1];
  const bare=/filename\s*=\s*([^;\s]+)/i.exec(disposition)?.[1];
  let name=encoded||quoted||bare;
  if(encoded){try{name=decodeURIComponent(encoded);}catch{need(false,'Invalid original UTF-8 response filename.');}}
  if(!name){const path=new URL(url).pathname.split('/').at(-1);try{name=decodeURIComponent(path);}catch{name=path;}}
  return ddpFileName(name||'original-source');
}
function retryTime(value,now){
  if(value===null)return null;
  if(/^\d+$/.test(value)){const at=now+Number(value)*1000;return Number.isFinite(at)&&Math.abs(at)<=8.64e15?new Date(at).toISOString():null;}
  const parsed=Date.parse(value);return Number.isFinite(parsed)?new Date(Math.max(parsed,now)).toISOString():null;
}
export async function requestFredDdpFile({url,name=null},{fetchImpl=globalThis.fetch,signal,maxBytes=MAX_DDP_FILE_BYTES}={}){
  need(typeof fetchImpl==='function','The original public-source HTTP client is unavailable.');
  need(Number.isInteger(maxBytes)&&maxBytes>0&&maxBytes<=MAX_DDP_FILE_BYTES,'Invalid complete original file capacity.');
  const originalUrl=ddpBoardUrl(url);let current=originalUrl,response;
  for(let redirects=0;;redirects++){
    signal?.throwIfAborted();
    response=await fetchImpl(current,{method:'GET',redirect:'manual',signal,headers:{accept:'text/csv, application/zip, application/xml, text/xml, */*;q=0.5'}});
    need(response&&Number.isInteger(response.status)&&response.status>=100&&response.status<=599&&response.headers,'The original source response is invalid.');
    if([301,302,303,307,308].includes(response.status)){
      need(redirects<5,'The original Board source redirected too many times.');
      const location=response.headers.get('location');need(location,'The original source redirect has no location.');
      await response.body?.cancel?.();current=ddpBoardUrl(new URL(location,current).href);continue;
    }
    break;
  }
  const headers=safeHeaders(response.headers),parts=[];let bytes=0;
  if(response.body?.getReader){
    const reader=response.body.getReader();
    try{for(;;){signal?.throwIfAborted();const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
      need(bytes<=maxBytes,'The original public source exceeds the selected complete file capacity.');parts.push(Buffer.from(part.value));}}
    catch(error){try{await reader.cancel();}catch{}throw error;}finally{reader.releaseLock();}
  }else{
    const body=Buffer.from(await response.arrayBuffer());bytes=body.length;
    need(bytes<=maxBytes,'The original public source exceeds the selected complete file capacity.');parts.push(body);
  }
  const body=Buffer.concat(parts,bytes),receivedAt=new Date().toISOString(),finalUrl=ddpBoardUrl(response.url||current);
  if(response.status!==200){
    const retryAt=retryTime(response.headers.get('retry-after'),Date.now());
    const error=Object.assign(new Error('The original Board source returned HTTP '+response.status+'.'),{
      code:response.status===429?'DDP_RATE_LIMITED':'DDP_SOURCE_HTTP',status:response.status,retryAt,
      retainedResponse:{url:originalUrl,finalUrl,status:response.status,headers,receivedAt,bytes,sha256:ddpHash(body),base64:body.toString('base64')}});
    throw error;
  }
  return createFredDdpSourceFile({name:responseName(response,current,name),mediaType:headers['content-type']||'application/octet-stream',content:body,
    provenance:{kind:'http',url:originalUrl,finalUrl,status:200,headers,receivedAt}});
}
function progressIdentity(progress,request){
  need(progress===null||plain(progress)&&progress.schema===SCHEMA&&same(progress.request,request)&&Array.isArray(progress.files),
    'This directory belongs to another original DDP acquisition.','FRED_CAPTURE_CONFLICT',409);
  if(!progress)return;
  need(progress.files.length<=request.sources.length,'The acquisition contains unplanned original sources.');
  for(const [index,file] of progress.files.entries()){
    validateFredDdpSourceFile(file);need(file.provenance.kind==='http'&&file.provenance.url===request.sources[index].url&&
      (request.sources[index].name===null||file.name===request.sources[index].name),'A retained original source changed its requested identity.');
  }
}
async function readCapture(path,kind){
  const file=resolve(path),capture=await readPrivateJson(file,MAX_DDP_CAPTURE_BYTES),model=inspect(kind,capture);
  return {directory:dirname(file),capture,model,reused:true};
}
export const readFredDdpCrosswalkCapture=path=>readCapture(path,'crosswalk');
export const readFredDdpPackageCapture=path=>readCapture(path,'package');
async function storeCapture(directory,supplied,kind){
  const model=inspect(kind,supplied),capture=clone(supplied);directory=await privateDirectory(resolve(directory));
  return withPrivateLock(directory,'capture.lock',async()=>{
    const previous=await optional(join(directory,'capture.json'));
    if(previous){inspect(kind,previous);need(same(previous,capture),'Another complete original source owns this directory.','FRED_CAPTURE_CONFLICT',409);return {directory,capture:previous,model,reused:true};}
    const progress=await optional(join(directory,'progress.json'));
    if(progress){
      progressIdentity(progress,progress.request);need(progress.request.kind===kind,'The received source differs from the original acquisition kind.','FRED_CAPTURE_CONFLICT',409);
      const files=kind==='crosswalk'?[capture.file]:[capture.file,...capture.supplementalFiles];
      need(progress.files.every((file,index)=>same(file,files[index])),'The received source differs from a returned original file.','FRED_CAPTURE_CONFLICT',409);
      need(progress.request.sources.length===files.length&&files.every((file,index)=>file.provenance.kind==='http'&&file.provenance.url===progress.request.sources[index].url),
        'The received complete source differs from its original request graph.','FRED_CAPTURE_CONFLICT',409);
      if(kind==='package')need(capture.release===progress.request.release&&capture.format===progress.request.format&&same(capture.csvLayout,progress.request.csvLayout),
        'The received package interpretation differs from the original acquisition.','FRED_CAPTURE_CONFLICT',409);
    }
    await atomicJson(directory,'capture.json',capture,{exclusive:true});
    return {directory,capture,model,reused:false};
  });
}
export const storeFredDdpCrosswalkCapture=(directory,capture)=>storeCapture(directory,capture,'crosswalk');
export const storeFredDdpPackageCapture=(directory,capture)=>storeCapture(directory,capture,'package');
async function acquire({directory,kind,signal,fetchImpl,onProgress,...input}){
  const request=normalizeFredDdpAcquisition({kind,...input});directory=await privateDirectory(resolve(directory));
  return withPrivateLock(directory,'capture.lock',async()=>{
    const previous=await optional(join(directory,'progress.json'));progressIdentity(previous,request);
    const complete=await optional(join(directory,'capture.json'));
    if(complete){
      const model=inspect(kind,complete),files=kind==='crosswalk'?[complete.file]:[complete.file,...complete.supplementalFiles];
      need(files.length===request.sources.length&&files.every((file,index)=>file.provenance.kind==='http'&&file.provenance.url===request.sources[index].url&&
        (request.sources[index].name===null||request.sources[index].name===file.name)),'The saved capture belongs to another original source request.','FRED_CAPTURE_CONFLICT',409);
      if(kind==='package')need(complete.release===request.release&&complete.format===request.format&&same(complete.csvLayout,request.csvLayout),
        'The saved package belongs to another source interpretation.','FRED_CAPTURE_CONFLICT',409);
      return {directory,capture:complete,model,reused:true};
    }
    const progress=previous??{schema:SCHEMA,request,startedAt:new Date().toISOString(),files:[],state:'CAPTURING',lastError:null,lastResponse:null};
    if(progress.lastError?.retryAt&&Date.parse(progress.lastError.retryAt)>Date.now())
      throw Object.assign(new Error('Continue the original Board acquisition at its retained provider retry time.'),{code:'DDP_RATE_LIMITED',status:429,retryAt:progress.lastError.retryAt});
    await atomicJson(directory,'progress.json',progress);
    try{
      while(progress.files.length<request.sources.length){
        signal?.throwIfAborted();
        const selected=request.sources[progress.files.length],remaining=MAX_DDP_FILE_BYTES-progress.files.reduce((sum,file)=>sum+file.bytes,0);
        need(remaining>0,'The complete source package exceeds its file capacity.');
        const file=await requestFredDdpFile(selected,{fetchImpl,signal,maxBytes:remaining});
        progress.files.push(file);progress.lastError=null;progress.lastResponse=null;
        progress.state=progress.files.length===request.sources.length?'SOURCE_RECEIVED':'CAPTURING';
        need(Buffer.byteLength(JSON.stringify(progress))<=MAX_DDP_CAPTURE_BYTES,'The complete retained source acquisition exceeds its JSON capacity.');
        // Keep every complete original response before package interpretation.
        await atomicJson(directory,'progress.json',progress);
        if(onProgress)await onProgress({files:progress.files.length,total:request.sources.length,name:file.name,bytes:file.bytes,sha256:file.sha256});
      }
      const capture=seal(kind,request,progress.files),model=inspect(kind,capture);
      await atomicJson(directory,'capture.json',capture,{exclusive:true});
      progress.state='COMPLETE';progress.completedAt=new Date().toISOString();progress.lastError=null;
      await atomicJson(directory,'progress.json',progress);
      return {directory,capture,model,reused:false};
    }catch(error){
      progress.state=progress.files.length===request.sources.length?'SOURCE_RECEIVED':'INTERRUPTED';
      progress.lastError={code:typeof error.code==='string'?error.code:'DDP_SOURCE_INTERRUPTED',status:Number.isInteger(error.status)?error.status:null,
        message:String(error.message||'Original source acquisition interrupted.').slice(0,2000),at:new Date().toISOString(),retryAt:error.retryAt??null};
      if(error.retainedResponse)progress.lastResponse=error.retainedResponse;
      if(Buffer.byteLength(JSON.stringify(progress))<=MAX_DDP_CAPTURE_BYTES)await atomicJson(directory,'progress.json',progress);
      throw error;
    }
  });
}
export const captureFredDdpCrosswalk=input=>acquire({...input,kind:'crosswalk'});
export const captureFredDdpPackage=input=>acquire({...input,kind:'package'});
export async function inspectFredDdpAcquisition({directory}){
  directory=await privateDirectory(resolve(directory));
  const complete=await optional(join(directory,'capture.json'));
  if(complete){
    const kind=complete.schema==='stellar-forge.fred-ddp-crosswalk.v1'?'crosswalk':'package',model=inspect(kind,complete);
    return {directory,state:'COMPLETE',kind,captureId:model.id,captureSha256:model.captureSha256,summary:model.summary,nextRequest:null,lastError:null};
  }
  const progress=await optional(join(directory,'progress.json'));
  if(!progress)return {directory,state:'EMPTY',files:[],nextRequest:null,lastError:null};
  need(plain(progress.request),'The original acquisition request is missing.');progressIdentity(progress,progress.request);
  return {directory,state:progress.state,kind:progress.request.kind,request:clone(progress.request),startedAt:progress.startedAt,
    files:progress.files.map(fredDdpFileDescriptor),nextRequest:clone(progress.request.sources[progress.files.length]??null),lastError:clone(progress.lastError),
    lastResponse:progress.lastResponse?(({base64,...descriptor})=>descriptor)(progress.lastResponse):null};
}
