// MIT. Industrial local controls over the original configured subscription operator.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openSubscriptionOperator} from './operator.mjs';
import {readBrowserAssets} from '../../../../distribution/browser-assets.mjs';
import {need,plain,shape,parse} from './files.mjs';
const assets=await readBrowserAssets(new URL('./browser-assets.json',import.meta.url));
function send(res,status,value,type='application/json; charset=utf-8'){
 const raw=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));
 res.writeHead(status,{'Content-Type':type,'Content-Length':raw.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(raw);
}
async function input(req){let length=0,parts=[];for await(const chunk of req){length+=chunk.length;need(length<=131072,'REQUEST_LIMIT','The selected request exceeds128KiB.',413);parts.push(chunk);}try{return parse(Buffer.concat(parts));}catch(error){if(error.code)throw error;need(false,'REQUEST_JSON','Use a JSON request.',400);}}
async function drained(res){return new Promise((resolve,reject)=>{const cleanup=()=>{res.off('drain',ok);res.off('error',fail);res.off('close',closed);};const ok=()=>{cleanup();resolve();},fail=error=>{cleanup();reject(error);},closed=()=>fail(new Error('The original download connection closed.'));res.once('drain',ok);res.once('error',fail);res.once('close',closed);});}
async function download(operator,req,res,url){
 const selected=await operator.artifactFile({artifact:url.searchParams.get('artifact'),path:url.searchParams.get('path'),expectedSha256:url.searchParams.get('sha256')});
 const handle=selected.readonlyFileHandle;
 try{
  const before=await handle.stat({bigint:true}),hash=createHash('sha256'),buffer=Buffer.alloc(65536);
  for(let offset=0;offset<selected.bytes;){const n=(await handle.read(buffer,0,Math.min(buffer.length,selected.bytes-offset),offset)).bytesRead;need(n>0,'FILE_CHANGED','The selected download ended early.');hash.update(buffer.subarray(0,n));offset+=n;}
  const same=async()=>{const now=await handle.stat({bigint:true});need(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>now[k]===before[k]),'FILE_CHANGED','The selected download changed.');};
  await same();need(hash.digest('hex')===selected.sha256,'FILE_CHANGED','The selected download differs from its retained SHA256.');
  res.writeHead(200,{'Content-Type':selected.type,'Content-Length':selected.bytes,'Content-Disposition':'attachment; filename="'+selected.name+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','ETag':'"'+selected.sha256+'"'});
  for(let offset=0;offset<selected.bytes;){await same();const n=(await handle.read(buffer,0,Math.min(buffer.length,selected.bytes-offset),offset)).bytesRead;need(n>0,'FILE_CHANGED','The selected file ended during download.');await same();if(!res.write(buffer.subarray(0,n)))await drained(res);offset+=n;}
  await same();res.end();
 }finally{await handle.close();}
}
export function subscriptionHttpHandler({operator,basePath='/subscriptions'}){
 need(operator&&typeof operator.call==='function'&&/^\/[a-z][a-z0-9/-]*$/.test(basePath),'HTTP_CONFIG','Choose the original operator and a local route.',400);
 const prefix=basePath.replace(/\/+$/,'')+'/';
 return async function handle(req,res,url){
  if(url.pathname===prefix.slice(0,-1)){res.writeHead(303,{Location:prefix});res.end();return true;}
  if(!url.pathname.startsWith(prefix))return false;
  const path=url.pathname.slice(prefix.length);
  try{
   const asset=assets.get('/subscriptions/'+path);
   if(req.method==='GET'&&asset){send(res,200,await readFile(asset.url),asset.type);return true;}
   if(req.method==='GET'&&path==='api/status'){send(res,200,await operator.call('status'));return true;}
   if(req.method==='GET'&&path==='api/file'){await download(operator,req,res,url);return true;}
   if(req.method==='POST'&&path==='api/operate'){
    need(String(req.headers['content-type']??'').startsWith('application/json'),'CONTENT_TYPE','Send a JSON operation.',415);
    const request=await input(req);shape(request,['operation','args'],'operator request');need(typeof request.operation==='string'&&plain(request.args),'REQUEST','Choose an operation and request object.',400);
    send(res,200,await operator.call(request.operation,request.args));return true;
   }
   need(false,'ROUTE','Subscription operation not found.',404);
  }catch(error){if(!res.headersSent)send(res,error.status??500,{error:error.code??'ODATA_SUBSCRIPTION_HTTP',message:error.message});else res.destroy(error);return true;}
 };
}
export async function startSubscriptionServer({connection,operator:provided,port=0}={}){
 need(Number.isInteger(port)&&port>=0&&port<=65535,'PORT','Choose a local TCP port.',400);
 const operator=provided??await openSubscriptionOperator({connection}),handler=subscriptionHttpHandler({operator}),pending=new Set();
 let closing;const server=createServer((req,res)=>{
  const run=(async()=>{try{const host='127.0.0.1:'+server.address().port,origin='http://'+host;
   need(req.headers.host===host||req.headers.host==='localhost:'+server.address().port,'LOCAL_HOST','Use the displayed local subscription address.',400);
   need(!req.headers.origin||req.headers.origin===origin||req.headers.origin==='http://localhost:'+server.address().port,'LOCAL_ORIGIN','Open the local subscription operator before submitting.',403);
   const url=new URL(req.url,origin);if(url.pathname==='/'){res.writeHead(303,{Location:'/subscriptions/'});res.end();return;}
   if(!await handler(req,res,url))send(res,404,{error:'ODATA_SUBSCRIPTION_ROUTE',message:'Operation not found.'});
  }catch(error){if(!res.headersSent)send(res,error.status??500,{error:error.code??'ODATA_SUBSCRIPTION_HTTP',message:error.message});else res.destroy(error);}})();
  pending.add(run);run.finally(()=>pending.delete(run));
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {server,url:'http://127.0.0.1:'+server.address().port+'/subscriptions/',operator,
 close:()=>closing??=(async()=>{await new Promise(resolve=>server.close(resolve));await Promise.allSettled([...pending]);if(!provided)await operator.close();})()};
}
