// SPDX-License-Identifier: MIT
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {readFile,open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';
import {openCustomerDesk} from './workspace.mjs';
import {need,bytes,parse,measure,identity} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/files.mjs';
import {readBrowserAssets} from '../../../stellar/scf-starforge-20261009/distribution/browser-assets.mjs';
const ASSETS=await readBrowserAssets(new URL('./browser-assets.json',import.meta.url));
const CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
function send(res,status,value,type='application/json; charset=utf-8'){
 const body=Buffer.isBuffer(value)?value:bytes(value);res.writeHead(status,{'Content-Type':type,'Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':CSP});res.end(body);
}
async function body(req){
 need(String(req.headers['content-type']??'').startsWith('application/json'),'DESK_CONTENT_TYPE','Send the original JSON request.',415);
 let size=0,parts=[];for await(const chunk of req){size+=chunk.length;need(size<=262144,'DESK_REQUEST_LIMIT','The request exceeds 256 KiB.',413);parts.push(chunk);}
 try{return parse(Buffer.concat(parts));}catch(error){if(error.code)throw error;need(false,'DESK_JSON','Send complete UTF-8 JSON.',400);}
}
function authorization(req,token){
 const cookie=String(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('odata_desk='));
 const value=String(req.headers.authorization??(cookie?'Bearer '+cookie.slice(11):'')),expected='Bearer '+token;
 const supplied=Buffer.from(value),wanted=Buffer.from(expected);
 need(supplied.length===wanted.length&&timingSafeEqual(supplied,wanted),'DESK_AUTH','Unlock this customer desk with its local operator token.',401);
}
function number(url,key,fallback){const value=url.searchParams.get(key);if(value===null)return fallback;need(/^(0|[1-9][0-9]*)$/.test(value),'DESK_ARGUMENT','Choose an integer '+key+'.',400);return Number(value);}
async function download(desk,url,res){
 const selected=await desk.file({requestId:url.searchParams.get('requestId'),path:url.searchParams.get('path'),expectedSha256:url.searchParams.get('sha256')});
 const expected={bytes:selected.file.bytes,sha256:selected.file.sha256};
 const handle=await open(selected.path,'r');
 try{
  const before=await handle.stat({bigint:true}),buffer=Buffer.alloc(65536);
  need(before.isFile()&&before.size===BigInt(expected.bytes),'DESK_FILE_CHANGED','The selected original file changed.');
  const hash=createHash('sha256');
  for(let offset=0;offset<expected.bytes;){
   const n=(await handle.read(buffer,0,Math.min(buffer.length,expected.bytes-offset),offset)).bytesRead;
   need(n>0,'DESK_FILE_CHANGED','The retained file ended before its saved digest.');
   hash.update(buffer.subarray(0,n));offset+=n;
  }
  const checked=await handle.stat({bigint:true});
  need(hash.digest('hex')===expected.sha256&&['dev','ino','size','mtimeNs','ctimeNs'].every(k=>checked[k]===before[k]),'DESK_FILE_CHANGED','The opened original file differs from its saved digest.');
  res.writeHead(200,{'Content-Type':selected.file.path.endsWith('.ndjson')?'application/x-ndjson':selected.file.path.endsWith('.csv')?'text/csv; charset=utf-8':'application/octet-stream',
   'Content-Length':expected.bytes,'Content-Disposition':'attachment; filename="'+basename(selected.file.path)+'"','X-Content-SHA256':expected.sha256,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  for(let offset=0;offset<expected.bytes;){
   const n=(await handle.read(buffer,0,Math.min(buffer.length,expected.bytes-offset),offset)).bytesRead;
   need(n>0,'DESK_FILE_CHANGED','The retained file ended early.');const after=await handle.stat({bigint:true});
   need(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>after[k]===before[k]),'DESK_FILE_CHANGED','The original file changed during download.');
   if(!res.write(buffer.subarray(0,n)))await new Promise((ok,fail)=>{const done=()=>{cleanup();ok();},bad=()=>{cleanup();fail(new Error('The original download connection closed.'));};
    const cleanup=()=>{res.off('drain',done);res.off('close',bad);res.off('error',bad);};res.once('drain',done);res.once('close',bad);res.once('error',bad);});
   offset+=n;
  }res.end();
 }finally{await handle.close();}
}
export async function startCustomerDeskServer({directory,connection,sourceRoot,sourceManifest,port=0,token=randomBytes(32).toString('hex')}={}){
 need(Number.isSafeInteger(port)&&port>=0&&port<=65535,'DESK_PORT','Choose a valid loopback port.',400);
 need(typeof token==='string'&&token.length>=32&&token.length<=256&&/^[A-Za-z0-9._~-]+$/.test(token),'DESK_TOKEN','Select a private local operator token.',400);
 const desk=await openCustomerDesk({directory,connection,sourceRoot,sourceManifest}),pending=new Set();let closing=null;
 const server=createServer((req,res)=>{
  const run=(async()=>{try{
   const address=server.address();need(address&&typeof address==='object','DESK_CLOSING','The original customer desk is closing.');
   const origin='http://127.0.0.1:'+address.port;
   need(req.headers.host==='127.0.0.1:'+address.port||req.headers.host==='localhost:'+address.port,'DESK_HOST','Use this desk’s displayed loopback address.',403);
   need(!req.headers.origin||req.headers.origin===origin||req.headers.origin==='http://localhost:'+address.port,'DESK_ORIGIN','Submit from the original customer desk.',403);
   const url=new URL(req.url,origin),asset=ASSETS.get(url.pathname);
   if(req.method==='GET'&&asset){send(res,200,await readFile(asset.url),asset.type);return;}
   authorization(req,token);
   if(req.method==='POST'&&url.pathname==='/api/session'){res.setHeader('Set-Cookie','odata_desk='+token+'; HttpOnly; SameSite=Strict; Path=/');send(res,200,{authenticated:true});return;}
   const profile=url.searchParams.get('profile');
   if(req.method==='GET'){
    if(url.pathname==='/api/state'){send(res,200,await desk.status());return;}
    if(url.pathname==='/api/customer'){send(res,200,{customer:await desk.customer(profile)});return;}
    if(url.pathname==='/api/publisher'){send(res,200,await desk.publisher(profile));return;}
    if(url.pathname==='/api/editions'){send(res,200,await desk.editions({profile,offset:number(url,'offset',0),limit:number(url,'limit',50)}));return;}
    if(url.pathname==='/api/rows'){send(res,200,await desk.rows({profile,offset:number(url,'offset',0),limit:number(url,'limit',100),restoredRequestId:url.searchParams.get('restoredRequestId')??undefined}));return;}
    if(url.pathname==='/api/published-rows'){send(res,200,await desk.publishedRows({profile,revision:number(url,'revision',0),expectedEditionSha256:url.searchParams.get('sha256'),kind:url.searchParams.get('kind')??'changes',offset:number(url,'offset',0),limit:number(url,'limit',100)}));return;}
    if(url.pathname==='/api/history'){send(res,200,await desk.history({profile,offset:number(url,'offset',0),limit:number(url,'limit',30)}));return;}
    if(url.pathname==='/api/request'){send(res,200,await desk.request(url.searchParams.get('id')));return;}
    if(url.pathname==='/api/file'){await download(desk,url,res);return;}
   }
   if(req.method==='POST'&&url.pathname==='/api/actions'){const result=await desk.run(await body(req));send(res,200,result);return;}
   send(res,404,{error:{code:'ODATA_DESK_ROUTE',message:'Customer desk route not found.'}});
  }catch(error){if(res.headersSent)res.destroy(error);else send(res,error.status??500,{error:{code:error.code??'ODATA_DESK_HTTP',message:String(error.message??error),
   ...Object.fromEntries(['applied','outcomeUnknown','reopenRequired','commitUncertainty','requestNotSelected','requestId'].filter(k=>error[k]!==undefined).map(k=>[k,error[k]]))}});}})();
  pending.add(run);run.finally(()=>pending.delete(run));
 });
 try{await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});}
 catch(error){await desk.close();throw error;}
 const origin='http://127.0.0.1:'+server.address().port;
 return {origin,url:origin+'/#token='+encodeURIComponent(token),desk,server,close(){
  return closing??=(async()=>{
   const closed=new Promise((ok,fail)=>server.close(error=>error?fail(error):ok()));
   server.closeIdleConnections?.();await desk.close();await Promise.allSettled([...pending]);await closed;
  })();
 }};
}
