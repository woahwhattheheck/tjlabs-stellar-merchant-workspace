// MIT. Typed local client for the original BLS analyst workspace.
import {constants,createReadStream,createWriteStream} from 'node:fs';
import {open,rename,unlink,lstat,realpath,link} from 'node:fs/promises';
import {dirname,resolve,isAbsolute,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const SCHEMA='stellar-forge.bls-workspace-connection.v1';
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const need=(value,message)=>{if(!value)throw new Error(message);};
const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const original=value=>JSON.stringify(canonical(value));
async function privateJSON(path,maximum=8*1024*1024){
  need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path,'Choose an absolute original file path.');
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const stat=await file.stat();
    need(stat.isFile()&&stat.nlink===1&&!(stat.mode&0o077)&&stat.size<=maximum,'Use a private regular original JSON file.');
    const raw=await file.readFile(),after=await file.stat();
    need(raw.length===stat.size&&stat.size===after.size&&stat.mtimeMs===after.mtimeMs&&stat.ctimeMs===after.ctimeMs,'The original file changed during reading.');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  }finally{await file.close();}
}
async function retain(path,request){
  const raw=Buffer.from(JSON.stringify(request,null,2)+'\n');
  need(raw.length<=8*1024*1024,'The complete original request exceeds 8 MiB.');
  const stage=path+'.'+randomUUID()+'.partial',file=await open(stage,'wx',0o600);
  try{await file.writeFile(raw);await file.sync();}finally{await file.close();}
  try{
    try{await link(stage,path);}
    catch(issue){if(issue.code!=='EEXIST')throw issue;need(original(await privateJSON(path))===original(request),'That saved request path belongs to another operation.');}
  }finally{await unlink(stage);}
}

function query(route,input={}){
  const search=new URLSearchParams();
  for(const [key,value] of Object.entries(input))if(value!==undefined)search.set(key,typeof value==='object'?JSON.stringify(value):String(value));
  return route+(search.size?'?'+search:'');
}
export async function openBlsLaborWorkspaceClient({connectionFile,expectedWorkspaceId,expectedBinding,expectedInstanceId}={}){
  const connection=await privateJSON(connectionFile,65536);
  need(connection.schema===SCHEMA&&/^[a-f0-9]{32}$/.test(connection.token)&&/^[a-f0-9]{32}$/.test(connection.instanceId)&&
    typeof connection.workspaceId==='string'&&typeof connection.workspace==='string'&&isAbsolute(connection.workspace),'Choose the original BLS connection file.');
  const origin=new URL(connection.origin);
  need(origin.protocol==='http:'&&origin.hostname==='127.0.0.1'&&Number(origin.port)>0&&
    origin.pathname==='/'&&!origin.search&&!origin.hash&&!origin.username&&!origin.password&&
    connection.origin===origin.origin,'The original BLS connection must use its exact private listener.');
  if(expectedWorkspaceId)need(connection.workspaceId===expectedWorkspaceId,'The workspace identity differs from the requested project.');
  const closing=new AbortController();
  let closed=false;
  async function response(route,{method='GET',body,headers={},signal}={}){
    need(!closed,'The original BLS client is closed.');
    const selectedSignal=signal?AbortSignal.any([signal,closing.signal]):closing.signal;
    const result=await fetch(new URL(route,origin),{method,headers:{...headers,'X-BLS-Session':connection.token},
      body,duplex:body instanceof Readable?'half':undefined,redirect:'error',signal:selectedSignal});
    need(result.headers.get('x-bls-instance')===connection.instanceId,'The original BLS listener changed; read its current connection file.');
    if(!result.ok){const value=await result.json().catch(()=>null);throw Object.assign(new Error(value?.error??('BLS HTTP '+result.status)),{status:result.status});}
    return result;
  }
  async function json(route,options){return (await response(route,options)).json();}
  const launch=await json('/api/launch');
  need(launch.workspaceId===connection.workspaceId&&launch.instanceId===connection.instanceId&&launch.workspace===connection.workspace,
    'The current listener does not match its original project connection.');
  if(expectedInstanceId)need(launch.instanceId===expectedInstanceId,'The original BLS instance changed.');
  if(expectedBinding)need(launch.bindingSha256===expectedBinding,'The original BLS source binding changed.');
  if(connection.launch)need(original(connection.launch)===original(launch),'The live BLS announcement changed.');
  const client={
    workspaceId:connection.workspaceId,instanceId:connection.instanceId,launch:Object.freeze(launch),
    async verify(){const current=await json('/api/launch');need(original(current)===original(launch),'The exact original BLS listener changed.');return current;},
    close(){closed=true;closing.abort(new Error('The original BLS client closed.'));},
    operationLookup:id=>json(query('/api/operation-lookup',{id})),
    stopNative:id=>json('/api/native-stop',{method:'POST',body:JSON.stringify({id}),headers:{'Content-Type':'application/json'}}),
    state:options=>json(query('/api/state',options)),
    defaultSelection:()=>json('/api/default-selection'),
    edition:id=>json(query('/api/edition',{id})),
    observations:options=>json(query('/api/observations',options)),
    note:subject=>json(query('/api/note',{subject})),
    report:options=>json(query('/api/report',options)),
    regionalDefinition:id=>json(query('/api/regional-definition',{id})),
    receiveRegionalDefinition(document){
      const raw=JSON.stringify(document);need(typeof raw==='string'&&Buffer.byteLength(raw)<=8*1024*1024,'Use a complete regional definition up to 8 MiB.');
      return json('/api/regional-definition/receive',{method:'POST',body:raw,headers:{'Content-Type':'application/json'}});
    },
    operation:id=>json(query('/api/operation',{id})),
    request:id=>json(query('/api/request',{id})),
    nativeState:id=>json(query('/api/native-state',{id})),
    async save(request,{requestFile}={}){
      need(plain(request)&&typeof request.id==='string'&&typeof request.kind==='string'&&plain(request.input)&&
        Number.isSafeInteger(request.expected_revision),'Use the complete original operation request.');
      need(typeof requestFile==='string'&&isAbsolute(requestFile),'Retain the complete request in an absolute private requestFile before sending.');
      await retain(requestFile,request);
      const raw=JSON.stringify(request);need(Buffer.byteLength(raw)<=8*1024*1024,'The complete request exceeds 8 MiB.');
      return json('/api/operation',{method:'POST',body:raw,headers:{'Content-Type':'application/json'}});
    },
    async resume(requestFile){return client.save(await privateJSON(requestFile),{requestFile});},
    async wait(operationId,{signal,intervalMs=1000}={}){
      need(Number.isSafeInteger(intervalMs)&&intervalMs>=250&&intervalMs<=60000,'Choose an operation read interval from 250 to 60000 ms.');
      while(true){
        signal?.throwIfAborted();const current=await client.operation(operationId);
        if(['complete','failed','interrupted'].includes(current.state))return current;
        await new Promise((done,reject)=>{const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);done();},intervalMs);
          function abort(){clearTimeout(timer);reject(signal.reason??new Error('Operation read stopped.'));}
          signal?.addEventListener('abort',abort,{once:true});});
      }
    },
    async upload({file,id,name=undefined,signal,expectedSha256}){
      need(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id),'Retain and reuse one original upload ID.');
      need(isAbsolute(file)&&resolve(file)===file&&await realpath(file)===file,'Choose the original full file path.');
      const stat=await lstat(file);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=8*1024**3,'Select a complete source file up to 8 GiB.');
      return json(query('/api/upload',{id,name:name??file.split('/').at(-1)}),{method:'PUT',body:createReadStream(file),
        headers:{'Content-Length':String(stat.size),'Content-Type':'application/octet-stream',...(expectedSha256?{'X-Content-SHA256':expectedSha256}:{})},signal});
    },
    uploadReceipt:id=>json(query('/api/upload',{id})),
    async download({kind,id,name='',destination,signal}){
      need(isAbsolute(destination)&&resolve(destination)===destination,'Choose an absolute receiving file path.');
      const parent=await realpath(dirname(destination));need(parent===dirname(destination),'Use the original receiving directory.');
      const temporary=join(parent,'.bls-download-'+randomUUID());
      const output=createWriteStream(temporary,{flags:'wx',mode:0o600});
      try{
        const result=await response(query('/api/file',{kind,id,name}),{signal});
        need(result.body,'The original file response has no body.');
        const length=result.headers.get('content-length'),size=Number(length),expected=result.headers.get('x-content-sha256');
        need(/^\d+$/.test(length??'')&&Number.isSafeInteger(size)&&size<=8*1024**3&&/^[a-f0-9]{64}$/.test(expected??''),
          'The original complete download must declare its length and SHA-256.');
        const hash=createHash('sha256');let received=0;
        async function* checkedBody(){
          for await(const chunk of Readable.fromWeb(result.body)){
            received+=chunk.length;need(received<=size,'The source exceeded its declared length.');
            hash.update(chunk);yield chunk;
          }
        }
        await pipeline(Readable.from(checkedBody()),output,{signal});
        const digest=hash.digest('hex');
        need(received===size&&digest===expected,'The complete original downloaded file changed.');

        const complete=await open(temporary,'r+');try{await complete.sync();}finally{await complete.close();}
        // Atomic no-replacement publication of a complete streamed file.
        await link(temporary,destination);
        await unlink(temporary);
        return {destination,bytes:(await lstat(destination)).size,sha256:digest,contentType:result.headers.get('content-type')??'application/octet-stream'};
      }catch(issue){output.destroy();await unlink(temporary).catch(()=>{});throw issue;}
    },
  };
  return Object.freeze(client);
}
