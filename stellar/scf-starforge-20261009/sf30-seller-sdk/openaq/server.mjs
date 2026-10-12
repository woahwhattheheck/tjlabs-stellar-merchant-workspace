// SPDX-License-Identifier: MIT
// Loopback operator HTTP. Accepted project jobs remain owned by the workspace after an HTTP client closes.
import { createServer } from 'node:http';
import { constants } from 'node:fs';
import { readFile, open, lstat, rename, unlink, link } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { privateDirectory, readJson, createFile, atomicJson, bytes, digest, fault } from '../postgres/publisher/files.mjs';
import { need, uuid, HASH } from './contract.mjs';
import { RetainedFileReads } from '../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
async function jsonBody(req,maximum=2*1024*1024){
 need(/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??''),'OPENAQ_JSON_REQUIRED',undefined,415);
 const parts=[];let n=0;for await(const part of req){n+=part.length;need(n<=maximum,'OPENAQ_REQUEST_TOO_LARGE',undefined,413);parts.push(part);}
 try{const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));need(v&&typeof v==='object'&&!Array.isArray(v),'OPENAQ_JSON_OBJECT_REQUIRED');return v;}
 catch(e){if(e.code)throw e;throw fault('OPENAQ_JSON_INVALID');}
}
const media=name=>name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.json')?'application/json; charset=utf-8':name.endsWith('.csv')?'text/csv; charset=utf-8':name.endsWith('.tgz')?'application/gzip':'application/octet-stream';
async function write(res,chunk){
 if(res.destroyed)throw fault('OPENAQ_DOWNLOAD_CLOSED');
 if(res.write(chunk))return;
 await new Promise((resolve,reject)=>{const done=()=>{clean();resolve();},stop=()=>{clean();reject(fault('OPENAQ_DOWNLOAD_CLOSED'));},clean=()=>{res.off('drain',done);res.off('close',stop);res.off('error',stop);};res.once('drain',done);res.once('close',stop);res.once('error',stop);});
}
async function download(res,file,instanceId){
 const fd=await open(file.path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await fd.stat();need(before.isFile()&&before.nlink===1&&!(before.mode&0o077)&&before.size===file.bytes,'OPENAQ_FILE_CHANGED',undefined,409);
  res.writeHead(200,{'content-type':media(file.name),'content-length':file.bytes,'cache-control':'no-store','content-disposition':'attachment; filename="'+basename(file.name).replace(/[^A-Za-z0-9._-]/g,'_')+'"',
   'x-openaq-instance':instanceId,'x-content-sha256':file.sha256,'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
   'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
  const buffer=Buffer.alloc(65536),hash=createHash('sha256');let offset=0;
  for(;;){const part=await fd.read(buffer,0,buffer.length,offset);if(!part.bytesRead)break;const chunk=buffer.subarray(0,part.bytesRead);hash.update(chunk);offset+=chunk.length;need(offset<=file.bytes,'OPENAQ_FILE_CHANGED');await write(res,chunk);}
  const after=await fd.stat();need(offset===file.bytes&&hash.digest('hex')===file.sha256&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,'OPENAQ_FILE_CHANGED');res.end();
 }catch(e){if(res.headersSent)res.destroy(e);throw e;}finally{await fd.close();}
}
export async function startOpenAQServer({workspace,port=0,sourceIdentity=null,connectionFile=null,ownsWorkspace=true}={}){
 need(workspace&&typeof workspace.start==='function'&&Number.isInteger(port)&&port>=0&&port<=65535,'OPENAQ_SERVER_CONFIGURATION_REQUIRED');
 const token=randomBytes(32).toString('base64url'),instanceId=randomUUID(),pending=new Set();
 let origin,closing=null,draining=false;
 const fileReads=new RetainedFileReads({errorPrefix:'OPENAQ'});
 const assets=new Map(await Promise.all([['/','index.html','text/html; charset=utf-8'],['/app.mjs','app.mjs','text/javascript; charset=utf-8'],['/style.css','style.css','text/css; charset=utf-8'],
  ['/examples/archive-context.json','../examples/archive-context.json','application/json; charset=utf-8']]
 .map(async([route,name,type])=>[route,{data:await readFile(new URL('./public/'+name,import.meta.url)),type}])));
 const identityValue=()=>({schema:'stellar-forge.openaq-workspace-identity.v1',workspaceId:workspace.id,configurationSha256:workspace.configurationSha256,instanceId,sourceIdentity});
 const authenticate=req=>{
  const value=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';
  const a=Buffer.from(value),b=Buffer.from(token);need(a.length===b.length&&timingSafeEqual(a,b),'OPENAQ_AUTH_REQUIRED','Open the private URL printed by the original application.',403);
 };
 const server=createServer((req,res)=>{
  const send=(status,value,type='application/json; charset=utf-8')=>{
   const data=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));need(data.length<=32*1024*1024,'OPENAQ_RESPONSE_TOO_LARGE');
   res.writeHead(status,{'content-type':type,'content-length':data.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-openaq-instance':instanceId,
    'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});res.end(data);
  };
  const work=(async()=>{
   need(!draining,'OPENAQ_SERVER_CLOSING',undefined,503);
   need(req.headers.host===new URL(origin).host&&(!req.headers.origin||req.headers.origin===origin)&&req.headers['sec-fetch-site']!=='cross-site','OPENAQ_LOCAL_ORIGIN_REQUIRED',undefined,403);
   need(typeof req.url==='string'&&req.url.startsWith('/')&&!req.url.startsWith('//'),'OPENAQ_REQUEST_TARGET_INVALID');
   const url=new URL(req.url,origin);
   if(req.method==='GET'&&!url.search&&assets.has(url.pathname)){const asset=assets.get(url.pathname);return send(200,asset.data,asset.type);}
   authenticate(req);
   if(req.method==='GET'&&url.pathname==='/api/identity')return send(200,identityValue());
   if(req.method==='GET'&&url.pathname==='/api/status')return send(200,await workspace.read('status',{offset:Number(url.searchParams.get('offset')??0),limit:Number(url.searchParams.get('limit')??30)}));
   if(req.method==='GET'&&url.pathname==='/api/file')return download(res,await workspace.file(url.searchParams.get('kind'),url.searchParams.get('id'),url.searchParams.get('name')),instanceId);
   if(req.method==='POST'&&url.pathname==='/api/upload'){
    const id=uuid(url.searchParams.get('id')),expected=url.searchParams.get('sha256');need(HASH.test(expected??''),'OPENAQ_ARCHIVE_HASH_REQUIRED');
    const root=join(workspace.directory,'imports','uploads');await privateDirectory(root,true);
    const temp=join(root,'.upload-'+randomUUID()),target=join(root,id+'.tgz');
    const fd=await open(temp,'wx',0o600);let n=0,done=false;const hash=createHash('sha256');
    try{
     for await(const chunk of req){n+=chunk.length;need(n<=256*1024*1024,'OPENAQ_UPLOAD_TOO_LARGE',undefined,413);hash.update(chunk);await fd.writeFile(chunk);}
     await fd.sync();await fd.close();done=true;need(hash.digest('hex')===expected,'OPENAQ_UPLOAD_HASH_CHANGED',undefined,409);
     try{await link(temp,target);}catch(e){if(e.code!=='EEXIST')throw e;const original=await import('../postgres/publisher/files.mjs');const actual=await original.hashPrivate(target,256*1024*1024);need(actual.hash===expected&&actual.bytes===n,'OPENAQ_UPLOAD_ID_CHANGED',undefined,409);}
     await unlink(temp);await atomicJson(root,id+'.json',{id,sha256:expected,bytes:n});return send(200,{uploadId:id,sha256:expected,bytes:n});
    }finally{if(!done)await fd.close().catch(()=>{});await unlink(temp).catch(()=>{});}
   }
   need(req.method==='POST','OPENAQ_ROUTE_NOT_FOUND',undefined,404);
   const input=await jsonBody(req);
   if(url.pathname==='/api/file-read'){
    const key=JSON.stringify([input.kind,input.id,input.name]);
    const result=await fileReads.read({scope:instanceId,key,kind:input.kind,directory:workspace.directory,
     readId:input.readId,expectedSha256:input.expectedSha256,offset:input.offset,limit:input.limit,
     load:async()=>{const file=await workspace.file(input.kind,input.id,input.name);let handle;try{handle=await open(file.path,constants.O_RDONLY|constants.O_NOFOLLOW);return{readonlyFileHandle:handle,bytes:file.bytes,sha256:file.sha256,name:file.name,type:media(file.name)};}catch(e){await handle?.close();throw e;}}});
    return send(200,result);
   }
   if(url.pathname==='/api/file-release'){await fileReads.release(instanceId,uuid(input.readId));return send(200,{released:input.readId});}
   if(url.pathname==='/api/read')return send(200,await workspace.read(input.action,input.input??{}));
   if(url.pathname==='/api/action'){
    if(input.action==='receive'){
     need(input.input?.uploadId,'OPENAQ_UPLOADED_ARCHIVE_REQUIRED');
     const id=uuid(input.input.uploadId),saved=await readJson(join(workspace.directory,'imports','uploads',id+'.json'));
     need(saved.sha256===input.input.sha256,'OPENAQ_UPLOADED_ARCHIVE_CHANGED',undefined,409);
     const {uploadId,...selected}=input.input;input.input={...selected,archivePath:join(workspace.directory,'imports','uploads',id+'.tgz')};
    }
    const result=await workspace.start(input.action,input.input);return send(result.state==='RUNNING'?202:200,result);
   }
   if(url.pathname==='/api/resume'){const result=await workspace.resume(input);return send(result.state==='RUNNING'?202:200,result);}
   if(url.pathname==='/api/cancel')return send(200,await workspace.cancel(input));
   throw fault('OPENAQ_ROUTE_NOT_FOUND','The requested operator action does not exist.',404);
  })().catch(e=>{
   if(!res.headersSent&&!res.destroyed)send([400,403,404,409,413,415,422,429,502,503].includes(e.status)?e.status:422,
    {error:typeof e.code==='string'?e.code:'OPENAQ_REQUEST_FAILED',message:typeof e.code==='string'?e.message:'Inspect the current request and selected source.',...(e.retryAfter?{retryAfter:e.retryAfter}:{})});
   else if(!res.writableEnded)res.destroy();
  });
  pending.add(work);work.finally(()=>pending.delete(work)).catch(()=>{});
 });
 server.requestTimeout=330000;server.headersTimeout=15000;server.keepAliveTimeout=1000;
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
 catch(e){if(ownsWorkspace)await workspace.close();throw e;}
 origin='http://127.0.0.1:'+server.address().port;
 const binding={...identityValue(),schema:'stellar-forge.openaq-connection.v1',directory:workspace.directory,origin,token,createdAt:new Date().toISOString()};
 if(connectionFile){try{await atomicJson(dirname(connectionFile),basename(connectionFile),binding);}catch(e){await new Promise(r=>server.close(r));if(ownsWorkspace)await workspace.close();throw e;}}
 return Object.freeze({server,origin,url:origin+'/#token='+token,instanceId,connection:binding,
  close(){
   if(closing)return closing;draining=true;
   closing=(async()=>{const errors=[];await new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections?.();}).catch(e=>errors.push(e));
    await Promise.allSettled([...pending]);try{await fileReads.close();}catch(e){errors.push(e);}if(ownsWorkspace)try{await workspace.close();}catch(e){errors.push(e);}
    if(errors.length){closing=null;throw new AggregateError(errors,'OpenAQ owned listener/workspace closure failed.');}
   })();return closing;
  }});
}
