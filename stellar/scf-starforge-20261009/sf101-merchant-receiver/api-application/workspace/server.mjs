// MIT. One local merchant HTTP surface over the original retained operation owner.
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {readBrowserAssets} from '../../../distribution/browser-assets.mjs';
import {need,ownedBytes,parse,safeError,UUID,REF,HASH,integer} from './configuration.mjs';
import {readExport,exportView,openExportFile} from './exports.mjs';

const MAX_BODY=256*1024;
const SECURITY={
 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const bad=(code,status=400)=>Object.assign(new Error(code),{code,status});
function sameSecret(received,expected){
 if(typeof received!=='string')return false;
 const bytes=Buffer.from(received),wanted=Buffer.from(expected);
 return bytes.length===wanted.length&&timingSafeEqual(bytes,wanted);
}
function oneHeader(request,name){
 let count=0;
 for(let i=0;i<request.rawHeaders.length;i+=2)if(request.rawHeaders[i].toLowerCase()===name)count++;
 need(count<=1,'API_MERCHANT_DUPLICATE_HEADER');
 return request.headers[name];
}
function query(url,allowed){
 for(const name of url.searchParams.keys())need(allowed.includes(name)&&url.searchParams.getAll(name).length===1,
  'API_MERCHANT_QUERY_REQUIRED');
}
function page(url){
 const raw=url.searchParams.get('limit')??'50';
 need(/^[1-9][0-9]{0,2}$/.test(raw),'API_MERCHANT_LIMIT_REQUIRED');
 const limit=integer(Number(raw),1,100,'API_MERCHANT_LIMIT_REQUIRED'),after=url.searchParams.get('after');
 need(after===null||after.length>0&&after.length<=256&&!/[\x00-\x20\x7f]/.test(after),'API_MERCHANT_CURSOR_REQUIRED');
 return {limit,...(after!==null?{after}:{})};
}
function json(response,status,value){
 const bytes=Buffer.from(JSON.stringify(value)+'\n');
 response.writeHead(status,{...SECURITY,'Content-Type':'application/json; charset=utf-8','Content-Length':bytes.length});
 response.end(bytes);
}
async function body(request){
 need(!request.headers['content-encoding']||request.headers['content-encoding']==='identity',
  'API_MERCHANT_CONTENT_ENCODING_REQUIRED',415);
 need(/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type']??''),
  'API_MERCHANT_JSON_CONTENT_TYPE_REQUIRED',415);
 const length=oneHeader(request,'content-length');
 if(length!==undefined)need(/^(0|[1-9][0-9]*)$/.test(length)&&Number(length)<=MAX_BODY,
  'API_MERCHANT_REQUEST_TOO_LARGE',413);
 const chunks=[];let size=0;
 for await(const part of request){size+=part.length;need(size<=MAX_BODY,'API_MERCHANT_REQUEST_TOO_LARGE',413);chunks.push(part);}
 const value=parse(Buffer.concat(chunks));
 need(value&&typeof value==='object'&&!Array.isArray(value),'API_MERCHANT_JSON_OBJECT_REQUIRED');
 return value;
}
function rangeOf(header,total){
 if(header===undefined)return null;
 const match=/^bytes=(\d*)-(\d*)$/.exec(header);
 need(match&&(match[1]||match[2])&&total>0,'API_MERCHANT_RANGE_REQUIRED',416);
 let start,end;
 if(!match[1]){
  const suffix=Number(match[2]);need(Number.isSafeInteger(suffix)&&suffix>0,'API_MERCHANT_RANGE_REQUIRED',416);
  start=Math.max(0,total-suffix);end=total-1;
 }else{
  start=Number(match[1]);end=match[2]?Number(match[2]):total-1;
  need(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<total&&end>=start,
   'API_MERCHANT_RANGE_REQUIRED',416);
  end=Math.min(end,total-1);
 }
 return {start,end};
}
async function sendFile(request,response,model,id,name){
 const opened=await openExportFile(model.configuration,id,name),{handle,file}=opened;
 try{
  const etag='"'+file.sha256+'"',match=oneHeader(request,'if-match');
  need(match===undefined||match==='*'||match===etag,'API_MERCHANT_EXPORT_PRECONDITION_FAILED',412);
  const ifRange=oneHeader(request,'if-range');
  const range=rangeOf(ifRange===undefined||ifRange===etag?oneHeader(request,'range'):undefined,file.bytes);
  const headers={...SECURITY,'Content-Type':file.contentType,'Content-Length':range?range.end-range.start+1:file.bytes,
   'Content-Disposition':'attachment; filename="'+file.name+'"','Accept-Ranges':'bytes','ETag':etag,
   'X-Content-SHA256':file.sha256,'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"};
  if(range)headers['Content-Range']='bytes '+range.start+'-'+range.end+'/'+file.bytes;
  response.writeHead(range?206:200,headers);
  if(request.method==='HEAD'||file.bytes===0){response.end();return;}
  await pipeline(handle.createReadStream({autoClose:false,start:range?.start??0,end:range?.end??file.bytes-1}),response);
 }finally{await handle.close();}
}
export async function startMerchantWorkspaceServer(model,{port=0}={}){
 integer(port,0,65535,'API_MERCHANT_PORT_REQUIRED');
 const declared=await readBrowserAssets(new URL('./browser-assets.json',import.meta.url)),assets=new Map();
 for(const [route,asset]of declared){
  const bytes=await ownedBytes(fileURLToPath(asset.url),2*1024*1024,{privateMode:false});
  need(typeof asset.type==='string'&&!/[^\x20-\x7e]/.test(asset.type),'API_MERCHANT_ASSET_TYPE_REQUIRED');
  assets.set(route,{bytes,type:asset.type});
 }
 const cap=randomBytes(32).toString('base64url'),authorization='Bearer '+cap;
 let origin=null,closing=false,closePromise=null;
 const hosts=new Set(),active=new Set(),sockets=new Set();
 async function dispatch(request,response){
  need(!closing,'API_MERCHANT_SERVER_CLOSING',503);
  need(hosts.has(oneHeader(request,'host')),'API_MERCHANT_HOST_REQUIRED',403);
  need(typeof request.url==='string'&&request.url.startsWith('/')&&!request.url.startsWith('//')&&
   !/[\x00-\x20\x7f\\]/.test(request.url),'API_MERCHANT_PATH_REQUIRED');
  const url=new URL(request.url,origin);
  need(url.origin===origin&&!url.hash&&url.pathname+url.search===request.url,'API_MERCHANT_PATH_REQUIRED');
  const suppliedOrigin=oneHeader(request,'origin');
  need(suppliedOrigin===undefined||suppliedOrigin===origin,'API_MERCHANT_ORIGIN_REQUIRED',403);
  const fetchSite=oneHeader(request,'sec-fetch-site');
  need(fetchSite===undefined||['same-origin','none'].includes(fetchSite),'API_MERCHANT_ORIGIN_REQUIRED',403);
  const asset=assets.get(url.pathname);
  if(asset){
   query(url,[]);need(request.method==='GET'||request.method==='HEAD','API_MERCHANT_METHOD_REQUIRED',405);
   response.writeHead(200,{...SECURITY,'Content-Type':asset.type,'Content-Length':asset.bytes.length});
   response.end(request.method==='HEAD'?undefined:asset.bytes);return;
  }
  need(url.pathname.startsWith('/api/'),'API_MERCHANT_NOT_FOUND',404);
  need(sameSecret(oneHeader(request,'authorization'),authorization),'API_MERCHANT_AUTHENTICATION_REQUIRED',401);
  if(request.method==='POST'){
   need(oneHeader(request,'x-workspace-request')==='1','API_MERCHANT_WORKSPACE_REQUEST_REQUIRED',403);
   query(url,[]);
   const value=await body(request);
   if(url.pathname==='/api/preview'){json(response,200,await model.preview(value));return;}
   let match=/^\/api\/actions\/([a-z_]+)$/.exec(url.pathname);
   if(match){json(response,202,await model.act(match[1],value));return;}
   match=/^\/api\/operations\/([^/]+)\/(resume|cancel)$/.exec(url.pathname);
   if(match){
    const id=decodeURIComponent(match[1]);
    need(UUID.test(id)&&Object.keys(value).length===1&&HASH.test(value.requestSha256??''),
     'API_MERCHANT_RETAINED_REQUEST_REQUIRED');
    const result=match[2]==='resume'?await model.resume(id,value.requestSha256):await model.cancel(id,value.requestSha256);
    json(response,200,result);return;
   }
   throw bad('API_MERCHANT_NOT_FOUND',404);
  }
  need(request.method==='GET'||request.method==='HEAD','API_MERCHANT_METHOD_REQUIRED',405);
  let match=/^\/api\/exports\/([^/]+)\/files\/([^/]+)$/.exec(url.pathname);
  if(match){
   query(url,[]);await sendFile(request,response,model,decodeURIComponent(match[1]),decodeURIComponent(match[2]));return;
  }
  need(request.method==='GET','API_MERCHANT_METHOD_REQUIRED',405);
  if(url.pathname==='/api/state'){query(url,[]);json(response,200,await model.view());return;}
  match=/^\/api\/offers\/([^/]+)$/.exec(url.pathname);
  if(match){query(url,[]);const id=decodeURIComponent(match[1]);need(UUID.test(id),'API_MERCHANT_IDENTIFIER_REQUIRED');
   json(response,200,await model.readOffer(id));return;}
  match=/^\/api\/orders\/([^/]+)$/.exec(url.pathname);
  if(match){
   query(url,['after','limit']);const ref=decodeURIComponent(match[1]);need(REF.test(ref),'ORDER_REFERENCE_INVALID');
   json(response,200,await model.readOrder(ref,page(url)));return;
  }
  if(url.pathname==='/api/executions'){
   query(url,['offerId','after','limit']);const offerId=url.searchParams.get('offerId');need(UUID.test(offerId),'API_MERCHANT_IDENTIFIER_REQUIRED');
   json(response,200,await model.executions(offerId,page(url)));return;
  }
  match=/^\/api\/executions\/([^/]+)$/.exec(url.pathname);
  if(match){
   query(url,['offerId']);const offerId=url.searchParams.get('offerId');need(UUID.test(offerId),'API_MERCHANT_IDENTIFIER_REQUIRED');
   json(response,200,await model.execution(offerId,decodeURIComponent(match[1])));return;
  }
  match=/^\/api\/operations\/([^/]+)$/.exec(url.pathname);
  if(match){query(url,[]);json(response,200,await model.operation(decodeURIComponent(match[1])));return;}
  match=/^\/api\/exports\/([^/]+)$/.exec(url.pathname);
  if(match){query(url,[]);json(response,200,exportView(await readExport(model.configuration,decodeURIComponent(match[1]))));return;}
  throw bad('API_MERCHANT_NOT_FOUND',404);
 }
 const server=createServer({maxHeaderSize:16384},(request,response)=>{
  const run=Promise.resolve().then(()=>dispatch(request,response)).catch(error=>{
   if(response.headersSent){response.destroy();return;}
   const safe=safeError(error);
   response.setHeader('Connection','close');json(response,safe.status,{error:safe.code,code:safe.code,status:safe.status});
  });
  active.add(run);run.then(()=>active.delete(run),()=>active.delete(run));
 });
 server.headersTimeout=15000;server.requestTimeout=30000;server.keepAliveTimeout=5000;
 server.setTimeout(120000,socket=>socket.destroy());
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 server.on('checkContinue',(_request,response)=>{response.writeHead(417,{...SECURITY,Connection:'close'});response.end();});
 server.on('upgrade',(_request,socket)=>socket.destroy());
 server.on('clientError',(_error,socket)=>{if(socket.writable)socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
 try{
  await new Promise((accept,reject)=>{
   const fail=error=>{server.off('listening',ready);reject(error);};
   const ready=()=>{server.off('error',fail);accept();};
   server.once('error',fail);server.once('listening',ready);server.listen(port,'127.0.0.1');
  });
  const actual=server.address().port;
  origin=new URL('http://127.0.0.1:'+actual).origin;
  hosts.add('127.0.0.1:'+actual);hosts.add(new URL(origin).host);
  return {url:origin+'/#'+cap,origin,port:actual,pid:process.pid,
   close(){
    if(closePromise)return closePromise;
    closing=true;
    closePromise=(async()=>{
     await new Promise((accept,reject)=>{server.close(error=>error?reject(error):accept());server.closeIdleConnections?.();});
     await Promise.allSettled([...active]);
     for(const socket of sockets)socket.destroy();
    })().catch(error=>{closePromise=null;throw error;});
    return closePromise;
   }};
 }catch(error){server.close();for(const socket of sockets)socket.destroy();throw error;}
}
