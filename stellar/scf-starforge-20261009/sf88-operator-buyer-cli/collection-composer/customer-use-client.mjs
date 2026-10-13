// MIT. Typed operations over the existing private Collections listener.
const need=(value,code,message)=>{if(!value)throw Object.assign(new Error(message??code),{code});};
const id=value=>{need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value),'CUSTOMER_USE_ID_INVALID');return encodeURIComponent(value);};
const sha=value=>{need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'CUSTOMER_USE_HASH_INVALID');return value;};
const uuid=value=>{need(typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value),'CUSTOMER_USE_REQUEST_ID_REQUIRED');return value;};
const root='/api/customer-use';
async function digest(bytes){return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');}
export function createCustomerUseClient({url,fetch:send=globalThis.fetch}={}) {
  let parsed;try{parsed=new URL(url);}catch{}
  need(parsed&&!parsed.username&&!parsed.password&&!parsed.search&&parsed.pathname==='/'&&typeof send==='function'
    &&(parsed.protocol==='https:'||parsed.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(parsed.hostname)),
    'CUSTOMER_USE_CONNECTION_INVALID');
  const token=parsed.hash.slice(1);sha(token);const origin=parsed.origin;
  async function request(path,input,{signal,raw=false,headers={},download=false}={}) {
    const response=await send(origin+path,{method:input===undefined?'GET':'POST',
      headers:{Authorization:'Bearer '+token,...(input===undefined?{}:{'Content-Type':raw?'application/octet-stream':'application/json'}),...headers},
      ...(input===undefined?{}:{body:raw?input:JSON.stringify(input)}),signal,cache:'no-store',credentials:'omit',redirect:'error'});
    need(response&&typeof response.json==='function','CUSTOMER_USE_RESPONSE_INVALID');
    if(!response.ok){
      let value;try{value=await response.json();}catch{}
      const code=/^[A-Z0-9_]{1,120}$/.test(value?.error??'')?value.error:'CUSTOMER_USE_REQUEST_FAILED';
      throw Object.assign(new Error(value?.message??code),{code,status:response.status,details:value?.details});
    }
    if(download){
      const maximum=64*1024*1024,parts=[];let count=0;
      const length=response.headers.get('content-length');
      need(length===null||/^\d+$/.test(length)&&Number(length)<=maximum,'CUSTOMER_USE_EXPORT_SIZE');
      if(response.body?.getReader){
        const reader=response.body.getReader();
        try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;
          need(count<=maximum,'CUSTOMER_USE_EXPORT_SIZE');parts.push(value);}}
        catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
      }else{const bytes=new Uint8Array(await response.arrayBuffer());count=bytes.length;need(count<=maximum,'CUSTOMER_USE_EXPORT_SIZE');parts.push(bytes);}
      const bytes=new Uint8Array(count);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
      const expected=sha(response.headers.get('x-content-sha256')),actual=await digest(bytes);
      need(actual===expected&&(length===null||count===Number(length)),'CUSTOMER_USE_EXPORT_CHANGED');
      return {bytes,sha256:actual,revisionSha256:sha(response.headers.get('x-customer-use-revision')),
        type:response.headers.get('content-type')??'application/octet-stream'};
    }
    const value=await response.json();need(value&&typeof value==='object'&&!Array.isArray(value),'CUSTOMER_USE_RESPONSE_INVALID');return value;
  }
  return Object.freeze({
    origin,
    importSource:async({bytes,name='customer-use-calendar.json',expectedSha256},options={})=>{
      need(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=32*1024*1024,'CUSTOMER_USE_SOURCE_SIZE');
      const actual=await digest(bytes);if(expectedSha256!==undefined)need(sha(expectedSha256)===actual,'CUSTOMER_USE_SOURCE_CHANGED');
      need(typeof name==='string'&&name.length>0&&name.length<=240&&!name.includes('\0'),'CUSTOMER_USE_SOURCE_NAME_INVALID');
      return request(root+'/sources/'+actual,bytes,{...options,raw:true,headers:{'X-Customer-Use-Name':encodeURIComponent(name)}});
    },
    listSources:options=>request(root+'/sources',undefined,options),
    source:({sha256},options)=>request(root+'/sources/'+sha(sha256),undefined,options),
    list:options=>request(root+'/commissions',undefined,options),
    inspect:({id:reference,sha256},options)=>request(root+'/commissions/'+id(reference)+(sha256?'/revisions/'+sha(sha256):''),undefined,options),
    save:(input,options)=>request(root+'/commissions',input,options),
    prepare:({id:reference,...input},options)=>request(root+'/commissions/'+id(reference)+'/prepare',input,options),
    create:({id:reference,...input},options)=>request(root+'/commissions/'+id(reference)+'/create',input,options),
    capture:({id:reference,...input},options)=>request(root+'/commissions/'+id(reference)+'/capture',input,options),
    returnedFile:({id:reference,requestId},options)=>request(root+'/commissions/'+id(reference)+'/returns/'+uuid(requestId),undefined,{...options,download:true}),
    action:({id:reference,requestId},options)=>request(root+'/commissions/'+id(reference)+'/actions/'+uuid(requestId),undefined,options),
    export:({id:reference,sha256,format='json'},options)=>{
      need(['json','csv'].includes(format),'CUSTOMER_USE_EXPORT_FORMAT');
      return request(root+'/commissions/'+id(reference)+'/revisions/'+sha(sha256)+'/export/'+format,undefined,{...options,download:true});
    },
    verifyReceiving:options=>request(root+'/receiving',undefined,options),
  });
}
