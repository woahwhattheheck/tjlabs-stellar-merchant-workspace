// SPDX-License-Identifier: MIT
// Authenticated local operator host; accepted Buyer work survives HTTP disconnect.
import {createServer} from 'node:http';
import {readFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {once} from 'node:events';
import * as F from '../files.mjs';
import {openCustomerConsole} from './controller.mjs';
import {inspectConsoleSource} from './managed.mjs';
import {CONNECTION_SCHEMA,STARTUP_SCHEMA} from './config.mjs';
const publicDirectory=fileURLToPath(new URL('./public/',import.meta.url));
const responseCode=error=>/^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code??error?.message??'')?
 error.code??error.message:'OPENAQ_CUSTOMER_REQUEST_FAILED';
export async function startCustomerConsole({directory,port=0,expectedConfiguration,expectedSource,
 environment=process.env,brokerDirectory}={}){
 F.need(Number.isSafeInteger(port)&&port>=0&&port<=65535,'OPENAQ_CUSTOMER_PORT_INVALID');
 const sourceIdentity=await inspectConsoleSource(undefined,expectedSource);
 const application=await openCustomerConsole({directory,expectedConfiguration,environment,brokerDirectory});
 const instanceId=randomUUID(),token=randomBytes(32).toString('base64url'),secret=Buffer.from(token),active=new Set(),downloads=new Set();
 let origin,stopping=false,closed=false,closePromise,serverClosed=false,serverClosing;
 const assets=new Map(),identity={consoleId:application.settings.id,instanceId,
  configurationSha256:application.settings.configurationSha256,sourceIdentity};
 try{
  for(const [url,name,type] of [['/','index.html','text/html; charset=utf-8'],
   ['/app.mjs','app.mjs','text/javascript; charset=utf-8'],['/style.css','style.css','text/css; charset=utf-8']]){
   const raw=await readFile(join(publicDirectory,name)),pin=sourceIdentity.files.find(file=>file.path==='public/'+name);
   F.need(pin&&raw.length===pin.bytes&&F.digest(raw)===pin.sha256,'OPENAQ_CUSTOMER_SOURCE_CHANGED');
   assets.set(url,{raw,type});
  }
 }catch(error){await application.close();throw error;}
 function headers(res){
  res.setHeader('x-openaq-customer-instance',instanceId);res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');
  res.setHeader('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 }
 function json(res,status,value){if(res.destroyed)return;headers(res);const raw=Buffer.from(JSON.stringify(value));
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':raw.length});res.end(raw);}
 async function body(req){
  F.need(req.headers['content-type']?.split(';')[0]==='application/json','OPENAQ_CUSTOMER_JSON_REQUIRED');
  const parts=[];let count=0;for await(const part of req){count+=part.length;F.need(count<=131072,'OPENAQ_CUSTOMER_INPUT_LIMIT');parts.push(part);}
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}catch{}
  F.need(F.object(value),'OPENAQ_CUSTOMER_JSON_REQUIRED');return value;
 }
 async function handle(req,res){
  headers(res);
  F.need(!stopping,'OPENAQ_CUSTOMER_CLOSING');
  const url=new URL(req.url??'/',origin),host=new URL(origin).host;
  F.need(req.headers.host===host&&url.origin===origin,'OPENAQ_CUSTOMER_HOST_INVALID');
  F.need(!req.headers.origin||req.headers.origin===origin,'OPENAQ_CUSTOMER_ORIGIN_INVALID');
  F.need(!['cross-site','same-site'].includes(req.headers['sec-fetch-site']),'OPENAQ_CUSTOMER_ORIGIN_INVALID');
  if(!url.pathname.startsWith('/api/')){
   const asset=assets.get(url.pathname);F.need(req.method==='GET'&&asset&&!url.search,'OPENAQ_CUSTOMER_NOT_FOUND');
   res.writeHead(200,{'content-type':asset.type,'content-length':asset.raw.length});res.end(asset.raw);return;
  }
  const supplied=Buffer.from(typeof req.headers.authorization==='string'?req.headers.authorization.replace(/^Bearer /,''):'');
  F.need(req.headers.authorization?.startsWith('Bearer ')&&supplied.length===secret.length&&timingSafeEqual(secret,supplied),
   'OPENAQ_CUSTOMER_UNAUTHORIZED');
  if(req.method==='GET'&&url.pathname==='/api/identity'){json(res,200,identity);return;}
  if(req.method==='GET'&&url.pathname==='/api/state'){json(res,200,await application.view());return;}
  if(req.method==='GET'&&url.pathname.startsWith('/api/jobs/')){
   const job=application.job(decodeURIComponent(url.pathname.slice(10)));json(res,job?200:404,job??{error:'OPENAQ_CUSTOMER_JOB_NOT_IN_THIS_INSTANCE'});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/rows'){
   F.need([...url.searchParams.keys()].every(key=>key==='limit')&&url.searchParams.getAll('limit').length<=1,'OPENAQ_CUSTOMER_QUERY_INVALID');
   json(res,200,await application.rows({limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):100}));return;
  }
  if(req.method==='GET'&&url.pathname==='/api/files'){
   F.need([...url.searchParams.keys()].every(key=>['kind','name'].includes(key))&&
    url.searchParams.getAll('kind').length===1&&url.searchParams.getAll('name').length===1,'OPENAQ_CUSTOMER_QUERY_INVALID');
   downloads.add(res);
   try{await application.streamFile({kind:url.searchParams.get('kind'),name:url.searchParams.get('name')},async(meta,chunks)=>{
    const abort=new AbortController(),disconnect=()=>abort.abort();res.once('close',disconnect);
    try{
     res.writeHead(200,{'content-type':'application/octet-stream','content-length':meta.bytes,
      'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(meta.name.split('/').at(-1)),
      'x-content-sha256':meta.sha256,'content-security-policy':"default-src 'none'; sandbox"});
     for await(const chunk of chunks){F.need(!res.destroyed,'OPENAQ_CUSTOMER_DOWNLOAD_INTERRUPTED');
      if(!res.write(chunk))await once(res,'drain',{signal:abort.signal});}
     res.end();
    }finally{res.removeListener('close',disconnect);abort.abort();}
   });}finally{downloads.delete(res);}return;
  }
  F.need(req.method==='POST'&&!url.search,'OPENAQ_CUSTOMER_NOT_FOUND');
  const input=await body(req);
  if(url.pathname==='/api/review'){json(res,200,await application.review(input));return;}
  if(url.pathname==='/api/actions'){json(res,202,await application.submit(input));return;}
  if(url.pathname==='/api/approval'){json(res,200,application.decide(input));return;}
  if(url.pathname==='/api/cancel'){F.need(Object.keys(input).length===1,'OPENAQ_CUSTOMER_INPUT_INVALID');json(res,200,application.cancel(input.id));return;}
  F.need(false,'OPENAQ_CUSTOMER_NOT_FOUND');
 }
 const server=createServer((req,res)=>{
  const task=handle(req,res).catch(error=>{
   if(res.headersSent){res.destroy();return;}
   const code=responseCode(error),status=code.includes('UNAUTHORIZED')?401:code.includes('NOT_FOUND')?404:
    /BUSY|CHANGED|CLOSED|CLOSING/.test(code)?409:400;
   json(res,status,{error:code});
  });
  active.add(task);task.then(()=>active.delete(task),()=>active.delete(task));
 });
 server.requestTimeout=30000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 function stopServer(){
  if(serverClosed)return Promise.resolve();if(serverClosing)return serverClosing;
  serverClosing=new Promise((resolve,reject)=>server.close(error=>{
   if(error&&error.code!=='ERR_SERVER_NOT_RUNNING'){serverClosing=null;reject(error);}
   else{serverClosed=true;resolve();}
  }));server.closeIdleConnections();return serverClosing;
 }
 async function close(){
  if(closed)return;if(closePromise)return closePromise;stopping=true;
  closePromise=(async()=>{
   const failures=[],stopped=stopServer();stopped.catch(()=>{});
   for(const response of downloads)response.destroy();
   try{await application.close();}catch(error){failures.push(error);}
   await Promise.allSettled([...active]);server.closeIdleConnections();server.closeAllConnections();
   try{await stopped;}catch(error){failures.push(error);}
   if(!failures.length){
    try{if(await F.exists(application.paths.connection)){
     const current=await F.json(application.paths.connection,262144);
     if(current.instanceId===instanceId){await unlink(application.paths.connection);await F.sync(application.settings.directory);}
    }}catch(error){failures.push(error);}
   }
   if(failures.length)throw new AggregateError(failures,'OPENAQ_CUSTOMER_SERVER_CLOSE_INCOMPLETE');closed=true;
  })().finally(()=>{if(!closed)closePromise=null;});
  return closePromise;
 }
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  const binding={schema:CONNECTION_SCHEMA,...identity,directory:application.settings.directory,origin,token};
  await F.replaceJson(application.paths.connection,binding);
  const startup={schema:STARTUP_SCHEMA,state:'READY',...identity,connectionFile:application.paths.connection,
   url:origin+'/#token='+token};
  return Object.freeze({application,origin,instanceId,connectionFile:application.paths.connection,startup,close});
 }catch(error){try{await close();}catch(closeError){error.closeError=closeError;}throw error;}
}
