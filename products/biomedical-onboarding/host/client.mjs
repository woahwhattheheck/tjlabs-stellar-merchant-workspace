// MIT. Typed operations attach to one host-owned biomedical listener.
import {join} from 'node:path';
import {readJSON,privateDirectory,need,MAX_BYTES,decode} from './io.mjs';
export const CONNECTION_SCHEMA='stellar-forge.biomedical-connection.v1';
export async function readConnection(directory,expected={}){
 const identity=await privateDirectory(directory);
 const file=await readJSON(join(directory,'biomedical.connection.json'),32768),v=file.value;
 let u;try{u=new URL(v.origin);}catch{}
 need(v.schema===CONNECTION_SCHEMA&&v.directory===directory&&u?.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.origin===v.origin&&u.port&&
 !u.username&&!u.password&&/^[a-f0-9]{64}$/.test(v.token||'')&&typeof v.instanceId==='string'&&typeof v.installationId==='string',
 'BIOMEDICAL_CONNECTION','Select the current original biomedical connection.');
 need(v.directoryIdentity?.path===identity.path&&v.directoryIdentity?.dev===identity.dev&&v.directoryIdentity?.ino===identity.ino,'BIOMEDICAL_DIRECTORY_CHANGED','The original listener directory was moved or replaced.',409);
 need(!expected.directoryIdentity||(expected.directoryIdentity.dev===identity.dev&&expected.directoryIdentity.ino===identity.ino),'BIOMEDICAL_DIRECTORY_CHANGED','The configured original directory identity changed.',409);
 need(!expected.installationId||expected.installationId===v.installationId,'BIOMEDICAL_WORKSPACE_CHANGED','The original workspace identity changed.',409);
 need(!expected.instanceId||expected.instanceId===v.instanceId,'BIOMEDICAL_INSTANCE_CHANGED','The application instance changed; reconnect.',409);
 return {...file,value:v};
}
async function fullResponse(response){
 const chunks=[];let total=0;const reader=response.body?.getReader();
 if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;need(total<=MAX_BYTES,'BIOMEDICAL_RESPONSE_SIZE','Response exceeds complete-file limit.');chunks.push(value);}}
 catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 return JSON.parse(decode(Buffer.concat(chunks)));
}
export class BiomedicalOnboardingClient{
 constructor(connection){this.connection=connection;this.closed=false;}
 static async connect(directory,expected={}){
  const c=new BiomedicalOnboardingClient(await readConnection(directory,expected)),s=await c.call('/api/status');
  need(s.instanceId===c.connection.value.instanceId&&s.installationId===c.connection.value.installationId,'BIOMEDICAL_LISTENER_CHANGED','Original listener identity differs.',409);return c;
 }
 get identity(){const v=this.connection.value;return {installationId:v.installationId,instanceId:v.instanceId,origin:v.origin};}
 async call(path,payload){
  need(!this.closed,'BIOMEDICAL_CLIENT_CLOSED','Reconnect the biomedical application.',409);
  const v=this.connection.value,current=await readConnection(v.directory,{instanceId:v.instanceId,installationId:v.installationId});
  need(current.sha256===this.connection.sha256,'BIOMEDICAL_CONNECTION_CHANGED','The original private connection changed.',409);
  const text=payload===undefined?undefined:JSON.stringify(payload);need(text===undefined||Buffer.byteLength(text)<=MAX_BYTES,'BIOMEDICAL_REQUEST_SIZE','Request exceeds complete-file limit.');
  const response=await fetch(v.origin+path,{method:payload===undefined?'GET':'POST',headers:{authorization:'Bearer '+v.token,'x-biomedical-instance':v.instanceId,...(text?{'content-type':'application/json'}:{})},body:text,redirect:'error',signal:AbortSignal.timeout(121000)});
  const result=await fullResponse(response);if(!response.ok)throw Object.assign(new Error(result.error?.message||'biomedical request failed'),{code:result.error?.code||'BIOMEDICAL_TRANSPORT',status:response.status});
  return result;
 }
 status(){return this.call('/api/status');}
 state(){return this.call('/api/state');}
 apply(request){return this.call('/api/request',request);}
 requestStatus(request){return this.call('/api/request-status',request);}
 export(expectedSha256){return this.call('/api/export',{expectedSha256});}
 file(fileId,offset=0,limit=196608){return this.call('/api/file?id='+encodeURIComponent(fileId)+'&offset='+offset+'&limit='+limit);}
 async browser(){await this.status();return {url:this.connection.value.url,...this.identity};}
 async close(){this.closed=true;}
}
