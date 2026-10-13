// MIT. Preserve each actual provider response before interpreting weather data.
import {MAX_RESPONSE_BYTES,need} from './contract.mjs';

export const isWeatherSourceRead=read=>read?.provenance?.kind==='PROVIDER_CAPTURE'&&
 read.provenance.httpStatus===200&&read.provenance.bodyComplete!==false&&
 (read.provenance.contentType===undefined||/^application\/json(?:;|$)/i.test(read.provenance.contentType));

/** Read at most the existing response limit; retain an explicitly incomplete prefix on interruption. */
export async function readProviderResponse(response){
 need(Number.isInteger(response.status),'WEATHER_PROVIDER_STATUS_INVALID');
 const contentType=response.headers.get('content-type')??'';
 const retryAfter=response.headers.get('retry-after');
 const metadata={httpStatus:response.status,contentType,bodyComplete:false,observedBytes:0,
  ...(retryAfter===null?{}:{retryAfter})};
 const chunks=[];let retained=0,reader;
 try{
  if(response.body===null){metadata.bodyComplete=true;return {bytes:Buffer.alloc(0),metadata};}
  need(response.body&&typeof response.body.getReader==='function','WEATHER_PROVIDER_BODY_MISSING');
  reader=response.body.getReader();
  for(;;){
   const {done,value}=await reader.read();
   if(done){metadata.bodyComplete=true;break;}
   need(value instanceof Uint8Array,'WEATHER_PROVIDER_BODY_INVALID');
   metadata.observedBytes+=value.byteLength;
   const remaining=MAX_RESPONSE_BYTES-retained;
   if(remaining>0){const part=Buffer.from(value.subarray(0,remaining));chunks.push(part);retained+=part.length;}
   need(metadata.observedBytes<=MAX_RESPONSE_BYTES,'WEATHER_RESPONSE_TOO_LARGE');
  }
 }catch(error){
  const code=String(error?.code??'');
  metadata.readErrorCode=/^[A-Z][A-Z0-9_]{0,119}$/.test(code)?code:
   error?.name==='AbortError'?'WEATHER_PROVIDER_READ_CANCELLED':'WEATHER_PROVIDER_READ_INTERRUPTED';
  try{await reader?.cancel();}catch{}
 }finally{try{reader?.releaseLock();}catch{}}
 return {bytes:Buffer.concat(chunks),metadata};
}
