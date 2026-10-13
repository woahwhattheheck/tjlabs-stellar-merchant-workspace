// SPDX-License-Identifier: MIT
// One original loopback owner. HTTP disconnect does not repeat or cancel an accepted source request.
import {createServer} from 'node:http';
import {constants} from 'node:fs';
import {open,readFile} from 'node:fs/promises';
import {join,dirname,basename} from 'node:path';
import {randomBytes,randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import {atomicJSON,privateDirectory} from '../stellar-expert/store.mjs';
import {RetainedFileReads} from '../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {need,fault,safeError,sha,uuid,whole,MAX_INPUT} from './contract.mjs';
import {CONNECTION_SCHEMA} from './managed.mjs';
const media=n=>n.endsWith('.html')?'text/html; charset=utf-8':n.endsWith('.json')?'application/json; charset=utf-8':n.endsWith('.csv')?'text/csv; charset=utf-8':n.endsWith('.zip')?'application/zip':'application/octet-stream';
async function jsonBody(request){
 need(/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']??''),'PIRATE_JSON_REQUIRED','Use an original JSON operation.',415);
 const parts=[];let size=0;for await(const chunk of request){size+=chunk.length;need(size<=MAX_INPUT,'PIRATE_INPUT_CAPACITY','The source request is too large.',413);parts.push(chunk);}
 try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));need(value&&typeof value==='object'&&!Array.isArray(value),'PIRATE_JSON_OBJECT','Use a JSON object.');return value;}
 catch(e){if(e.code)throw e;throw fault('PIRATE_JSON_INVALID','Use valid UTF-8 JSON.');}
}
async function write(response,chunk){
 if(response.destroyed)throw fault('PIRATE_DOWNLOAD_CLOSED','The original download connection closed.');
 if(response.write(chunk))return;
 await new Promise((yes,no)=>{const clean=()=>{response.off('drain',done);response.off('close',failed);response.off('error',failed);};
  const done=()=>{clean();yes();},failed=()=>{clean();no(fault('PIRATE_DOWNLOAD_CLOSED','The original download connection closed.'));};
  response.once('drain',done);response.once('close',failed);response.once('error',failed);});
}
async function download(response,file,instanceId){
 const handle=await open(file.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const before=await handle.stat({bigint:true});
  need(before.isFile()&&before.nlink===1n&&(before.mode&0o077n)===0n&&before.size===BigInt(file.bytes),'PIRATE_FILE_CHANGED','The retained original output changed.',409);
  response.writeHead(200,{'content-type':file.type??media(file.filename),'content-length':file.bytes,'cache-control':'no-store',
   'content-disposition':'attachment; filename="'+basename(file.filename).replace(/[^A-Za-z0-9._-]/g,'_')+'"','x-pirate-instance':instanceId,'x-content-sha256':file.sha256,
   'x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
  const buffer=Buffer.alloc(65536),checksum=createHash('sha256');let offset=0;
  for(;;){const part=await handle.read(buffer,0,buffer.length,offset);if(!part.bytesRead)break;const chunk=buffer.subarray(0,part.bytesRead);offset+=chunk.length;need(offset<=file.bytes,'PIRATE_FILE_CHANGED');checksum.update(chunk);await write(response,chunk);}
  const after=await handle.stat({bigint:true});
  need(offset===file.bytes&&checksum.digest('hex')===file.sha256&&before.size===after.size&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs,'PIRATE_FILE_CHANGED','The original output changed during transfer.',409);
  response.end();
 }catch(e){if(response.headersSent)response.destroy();throw e;}finally{await handle.close();}
}
export async function startPirateServer({workspace,sourceIdentity,port=0,connectionFile=null,ownsWorkspace=true}={}){
 need(workspace&&typeof workspace.act==='function','PIRATE_WORKSPACE_REQUIRED','Open the original workspace first.');
 whole(port,'the original loopback port',0,65535);
 const token=randomBytes(32).toString('base64url'),instanceId=randomUUID(),pending=new Set(),children=new Map();
 let origin,closing=null,draining=false;
 const reads=new RetainedFileReads({errorPrefix:'PIRATE',maxImmutableFileBytes:1024*1024*1024});
 const assets=new Map(await Promise.all([['/','index.html','text/html; charset=utf-8'],['/app.mjs','app.mjs','text/javascript; charset=utf-8'],['/style.css','style.css','text/css; charset=utf-8']]
  .map(async([route,name,type])=>[route,{data:await readFile(new URL('./public/'+name,import.meta.url)),type}])));
 const identity=()=>({schema:'stellar-forge.pirate-weather-identity.v1',workspaceId:workspace.workspaceId,configurationSha256:workspace.configurationSha256,instanceId,sourceIdentity});
 const authenticate=request=>{const value=request.headers.authorization?.startsWith('Bearer ')?request.headers.authorization.slice(7):'',a=Buffer.from(value),b=Buffer.from(token);
  need(a.length===b.length&&timingSafeEqual(a,b),'PIRATE_AUTH_REQUIRED','Open the private URL printed by this original workspace.',403);};
 const server=createServer((request,response)=>{
  const send=(status,value,type='application/json; charset=utf-8')=>{
   const raw=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));need(raw.length<=32*1024*1024,'PIRATE_REPLY_CAPACITY','Use the original paged view.',413);
   response.writeHead(status,{'content-type':type,'content-length':raw.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-pirate-instance':instanceId,
    'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});response.end(raw);
  };
  const work=(async()=>{
   need(!draining,'PIRATE_CLOSING','The original workspace is draining its accepted requests.',503);
   need(request.headers.host===new URL(origin).host&&(!request.headers.origin||request.headers.origin===origin)&&request.headers['sec-fetch-site']!=='cross-site','PIRATE_LOCAL_ORIGIN','Use the original loopback workspace.',403);
   need(typeof request.url==='string'&&request.url.startsWith('/')&&!request.url.startsWith('//'),'PIRATE_ROUTE','Invalid original request target.');
   const url=new URL(request.url,origin);
   if(request.method==='GET'&&!url.search&&assets.has(url.pathname)){const asset=assets.get(url.pathname);return send(200,asset.data,asset.type);}
   authenticate(request);
   if(request.method==='GET'&&url.pathname==='/api/identity')return send(200,identity());
   if(request.method==='GET'&&url.pathname==='/api/state')return send(200,await workspace.read('state'));
   if(request.method==='GET'&&url.pathname==='/api/file')return download(response,await workspace.fileSource(sha(url.searchParams.get('id'))),instanceId);
   if(request.method==='POST'&&url.pathname==='/api/upload'){
    const {retainProjectUpload}=await import('./package.mjs');
    return send(200,await retainProjectUpload(workspace.directory,{id:uuid(url.searchParams.get('id')),expectedSha256:sha(url.searchParams.get('sha256')),stream:request}));
   }
   need(request.method==='POST','PIRATE_ROUTE_NOT_FOUND','This original route does not exist.',404);
   const input=await jsonBody(request);
   if(url.pathname==='/api/read')return send(200,await workspace.read(input.method,input.input??{}));
   if(url.pathname==='/api/action')return send(200,await workspace.act(input));
   if(url.pathname==='/api/resume')return send(200,await workspace.resume(uuid(input.operationId)));
   if(url.pathname==='/api/file-read'){
    sha(input.id);
    const result=await reads.read({scope:instanceId,key:input.id,kind:'pirate-weather-output',directory:workspace.directory,
     readId:input.readId,expectedSha256:input.expectedSha256,offset:input.offset,limit:input.limit,
     load:async()=>{const file=await workspace.fileSource(input.id);let handle;try{handle=await open(file.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
      return {readonlyFileHandle:handle,bytes:file.bytes,sha256:file.sha256,name:file.filename,type:file.type??media(file.filename)};}catch(e){await handle?.close();throw e;}}});
    return send(200,result);
   }
   if(url.pathname==='/api/file-release'){await reads.release(instanceId,uuid(input.readId));return send(200,{released:input.readId});}
   if(url.pathname==='/api/received/open'){
    uuid(input.operationId);
    const op=await workspace.read('operation',{operationId:input.operationId});
    need(op.action==='project.receive'&&op.state==='COMPLETE','PIRATE_RECEIVING_REQUIRED','Receive the exact project before opening it.',409);
    const originalReceivingId=op.acceptedResult.operationId;
    if(!children.has(originalReceivingId)){
     const opening=(async()=>{const {openReceivedProject}=await import('./package.mjs');
      const received=await openReceivedProject(workspace.directory,op.acceptedResult),{openPirateWorkspace}=await import('./core.mjs');
      const child=await openPirateWorkspace(received.workspaceDirectory,{applicationSource:received.applicationDirectory});
      try{return await startPirateServer({workspace:child,sourceIdentity,connectionFile:join(received.workspaceDirectory,'connection.json')});}
      catch(e){await child.close();throw e;}
     })();children.set(originalReceivingId,opening);void opening.catch(()=>{if(children.get(originalReceivingId)===opening)children.delete(originalReceivingId);});
    }
    const child=await children.get(originalReceivingId);return send(200,{url:child.url,instanceId:child.instanceId,workspaceId:child.connection.workspaceId,processOwner:'this original workspace host'});
   }
   throw fault('PIRATE_ROUTE_NOT_FOUND','This original route does not exist.',404);
  })().catch(error=>{
   const e=safeError(error);
   if(!response.headersSent&&!response.destroyed)send([400,403,404,409,413,415,422,429,502,503,507].includes(e.status)?e.status:503,
    {error:e.code,message:e.message,operationId:error.operationId??null,currentRevision:error.currentRevision??null});
   else if(!response.writableEnded)response.destroy();
  });
  pending.add(work);void work.finally(()=>pending.delete(work)).catch(()=>{});
 });
 server.requestTimeout=330000;server.headersTimeout=15000;server.keepAliveTimeout=1000;
 try{await new Promise((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes);});}
 catch(e){await reads.close();if(ownsWorkspace)await workspace.close();throw e;}
 origin='http://127.0.0.1:'+server.address().port;
 const connection={...identity(),schema:CONNECTION_SCHEMA,directory:workspace.directory,origin,token,createdAt:new Date().toISOString()};
 try{if(connectionFile){await privateDirectory(dirname(connectionFile),{create:true});await atomicJSON(connectionFile,connection);}}
 catch(e){await new Promise(r=>server.close(r));await reads.close();if(ownsWorkspace)await workspace.close();throw e;}
 const done=new Promise((yes,no)=>{server.once('close',yes);server.on('error',no);});
 return {server,origin,url:origin+'/#token='+token,instanceId,connection,connectionFile,done,publicIdentity:identity,close(){
  if(closing)return closing;draining=true;workspace.requestClose?.();
  closing=(async()=>{
   const errors=[];await new Promise((yes,no)=>{server.close(e=>e?no(e):yes());server.closeIdleConnections?.();}).catch(e=>errors.push(e));
   await Promise.allSettled([...pending]);
   for(const child of children.values())try{await(await child).close();}catch(e){errors.push(e);}
   try{await reads.close();}catch(e){errors.push(e);}
   if(ownsWorkspace)try{await workspace.close();}catch(e){errors.push(e);}
   if(errors.length)throw new AggregateError(errors,'The original workspace has pending resource cleanup.');
  })();return closing;
 }};
}
