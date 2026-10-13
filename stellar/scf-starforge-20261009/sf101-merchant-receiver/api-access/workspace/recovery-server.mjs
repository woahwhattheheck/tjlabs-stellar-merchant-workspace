// MIT. Authenticated local handover UI over the original recovery journal.
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readBrowserAssets} from '../../../distribution/browser-assets.mjs';
import {need,codeOf,UUID} from './recovery-files.mjs';
import {serveConfiguredWorkspace} from './cli.mjs';
const ASSETS=await readBrowserAssets(new URL('./recovery-browser-assets.json',import.meta.url));
const equal=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function body(req){
 need((req.headers['content-type']??'').split(';')[0]==='application/json','API_RECOVERY_JSON_REQUIRED',415);
 const chunks=[];let total=0;for await(const c of req){total+=c.length;need(total<=65536,'API_RECOVERY_BODY_TOO_LARGE',413);chunks.push(c);}
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 need(value&&typeof value==='object'&&!Array.isArray(value),'API_RECOVERY_JSON_REQUIRED');return value;
}
export async function startApiPassRecoveryServer({recovery,port=0,host='127.0.0.1',environment=process.env,beforeRelease}={}){
 need(recovery&&typeof recovery.start==='function'&&UUID.test(recovery.journalId??''),'API_RECOVERY_JOURNAL_REQUIRED');
 need(host==='127.0.0.1'&&Number.isInteger(port)&&port>=0&&port<=65535,'API_RECOVERY_LOOPBACK_REQUIRED');
 const token=randomBytes(32).toString('base64url'),pending=new Set(),sockets=new Set();
 let origin,closing=false,closePromise,customer=null,opening=null,failedCustomerOwner=null;
 const send=(res,status,value,type='application/json; charset=utf-8')=>{
  if(res.destroyed||res.writableEnded)return;const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));
  res.writeHead(status,{'Content-Type':type,'Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
   'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(bytes);
 };
 const customerView=()=>customer?{requestId:customer.requestId,workspaceId:customer.app.workspaceId,url:customer.app.url,launchFile:customer.app.launchFile,executionStarted:false}:null;
 async function serve(req,res){
  try{
   need(!closing,'API_RECOVERY_CLOSING',503);need(req.headers.host===new URL(origin).host,'API_RECOVERY_HOST_INVALID',403);
   const url=new URL(req.url,origin),path=url.pathname,asset=ASSETS.get(path);
   if(req.method==='GET'&&asset){send(res,200,await readFile(asset.url),asset.type);return;}
   need(path.startsWith('/api/'),'API_RECOVERY_ROUTE_NOT_FOUND',404);
   need(equal(req.headers.authorization,'Bearer '+token),'API_RECOVERY_AUTHENTICATION_REQUIRED',401);
   need(['GET','POST'].includes(req.method),'API_RECOVERY_METHOD_NOT_ALLOWED',405);
   let match;
   if(req.method==='GET'){
    if(path==='/api/session'){send(res,200,{schema:'stellar-forge.sf101.api-customer-recovery-session.v1',journalId:recovery.journalId,directory:recovery.directory,sourceConfigured:!!recovery.source,customer:customerView()});return;}
    if(path==='/api/operations'){send(res,200,await recovery.list({offset:Number(url.searchParams.get('offset')??0),limit:Number(url.searchParams.get('limit')??50)}));return;}
    if((match=/^\/api\/operations\/([^/]+)$/.exec(path))){send(res,200,await recovery.inspect(match[1]));return;}
    if((match=/^\/api\/operations\/([^/]+)\/files$/.exec(path))){send(res,200,await recovery.encryptedFiles(match[1]));return;}
    if((match=/^\/api\/operations\/([^/]+)\/file$/.exec(path))){send(res,200,await recovery.readEncryptedFile(match[1],{name:url.searchParams.get('name'),offset:Number(url.searchParams.get('offset')??0),limit:Number(url.searchParams.get('limit')??262144)}));return;}
   }else{
    need(req.headers.origin===origin,'API_RECOVERY_ORIGIN_REQUIRED',403);const value=await body(req);let result;
    if(path==='/api/review')result=await recovery.review();
    else if(path==='/api/start')result=await recovery.start(value);
    else if(path==='/api/resume')result=await recovery.resume(value.requestId);
    else if(path==='/api/cancel')result=await recovery.cancel(value.requestId);
    else if(path==='/api/open-result')result=await recovery.openResult(value.requestId);
    else if(path==='/api/open-customer'){
     need(UUID.test(value.requestId??''),'API_RECOVERY_REQUEST_ID_REQUIRED');
     if(customer){need(customer.requestId===value.requestId,'API_RECOVERY_CUSTOMER_ALREADY_OPEN');result=customerView();}
     else{
      need(!opening&&!failedCustomerOwner,'API_RECOVERY_CUSTOMER_OPENING');
      opening=(async()=>{const selected=await recovery.openResult(value.requestId);
       let app;try{app=await serveConfiguredWorkspace({...selected,environment,approvalMode:'terminal'});}catch(e){failedCustomerOwner=e.customerWorkspaceRecovery??e.recovery??null;throw e;}
       customer={requestId:value.requestId,app};return customerView();
      })();
      try{result=await opening;}finally{opening=null;}
     }
    }else if(path==='/api/close-customer'){
     need(customer&&customer.requestId===value.requestId,'API_RECOVERY_CUSTOMER_NOT_OPEN');await customer.app.close();customer=null;result={closed:true};
    }else need(false,'API_RECOVERY_ROUTE_NOT_FOUND',404);
    send(res,200,result);return;
   }
   need(false,'API_RECOVERY_ROUTE_NOT_FOUND',404);
  }catch(e){req.resume();send(res,Number.isInteger(e.status)?e.status:400,{error:codeOf(e)});}
 }
 const server=createServer((req,res)=>{const task=serve(req,res).finally(()=>pending.delete(task));pending.add(task);});
 server.requestTimeout=30000;server.headersTimeout=15000;
 server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
 async function close(){
  if(closePromise)return closePromise;closing=true;
  closePromise=(async()=>{
   const stopped=new Promise((resolve,reject)=>{if(!server.listening){resolve();return;}server.close(e=>e?reject(e):resolve());});stopped.catch(()=>{});
   server.closeIdleConnections?.();const timer=setTimeout(()=>{for(const s of sockets)s.destroy();},20000);timer.unref?.();
   try{
    await opening?.catch(()=>{});while(pending.size)await Promise.allSettled([...pending]);await stopped;
    if(customer){await customer.app.close();customer=null;}if(failedCustomerOwner){await failedCustomerOwner.close();failedCustomerOwner=null;}await beforeRelease?.();await recovery.close();
   }finally{clearTimeout(timer);}
  })().catch(e=>{closePromise=null;throw e;});return closePromise;
 }
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});}
 catch(e){try{await close();}catch(closeError){Object.defineProperty(e,'recovery',{value:{close,error:codeOf(closeError)}});}throw e;}
 origin='http://127.0.0.1:'+server.address().port;
 return {server,recovery,origin,url:origin+'/#'+token,port:server.address().port,journalId:recovery.journalId,close};
}
