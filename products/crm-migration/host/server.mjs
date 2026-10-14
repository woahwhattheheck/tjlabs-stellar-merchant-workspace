// MIT. Local authenticated UI and client share the same original CRM writer.
import http from 'node:http';
import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,readdir,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from './store.mjs';
import {writeJSON,readJSON,readBytes,json,sha,need,MAX_BYTES,decode} from './io.mjs';
import renderer from '../browser/render-desk.cjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export const CONNECTION='crm.connection.json', CONNECTION_SCHEMA='stellar-forge.crm-connection.v1',STARTUP_SCHEMA='stellar-forge.crm-startup.v1';
export async function moduleSources(){
 const files={};
 for(const dir of ['runtime','browser'])for(const name of await readdir(join(root,dir)))
 if(/\.(?:js|cjs)$/.test(name))files[dir+'/'+name]=await readFile(join(root,dir,name),'utf8');
 return files;
}
async function body(req){
 const chunks=[];let bytes=0;
 for await(const b of req){bytes+=b.length;need(bytes<=MAX_BYTES,'CRM_REQUEST_SIZE','Complete request exceeds 256 MiB.',413);chunks.push(b);}
 return JSON.parse(decode(Buffer.concat(chunks)));
}
function send(res,status,value,type='application/json;charset=utf-8'){
 const b=Buffer.isBuffer(value)?value:Buffer.from(type.startsWith('application/json')?json(value):value);
 res.writeHead(status,{'content-type':type,'content-length':b.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(b);
}
export async function startServer({directory,workspaceId,port=0}){
 need(Number.isInteger(port)&&port>=0&&port<=65535,'CRM_PORT','Select a port from 0 to 65535.');
 const store=await openStore(directory),instanceId=randomUUID(),token=randomBytes(32).toString('hex'),pending=new Set();
 let server,connection,origin,closing=false,closePromise;
 let selectedPort=port;
 try{
 need(!workspaceId||workspaceId===store.id,'CRM_WORKSPACE_CHANGED','The selected workspace identity changed.',409);
 const modules=await moduleSources();
 if(port===0){let previous;try{previous=(await readJSON(join(directory,'crm.listener.json'),32768)).value;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(previous){need(previous.schema==='stellar-forge.crm-listener.v1'&&previous.workspaceId===store.id&&Number.isInteger(previous.port)&&previous.port>0&&previous.port<=65535,'CRM_LISTENER_RECORD','The retained listener selection differs from this original workspace.',409);selectedPort=previous.port;}}

 const handler=async(req,res)=>{
  need(!closing,'CRM_CLOSING','The application is closing.',503);
  need(req.headers.host===new URL(origin).host,'CRM_HOST','Use the actual local application origin.',403);
  const url=new URL(req.url,origin);
  if(req.method==='GET'&&url.pathname==='/'){
   // The public shell contains only code; the browser fetches its original edition after authentication.
   const html=renderer.renderDesk(modules,null,{managed:{instanceId,workspaceId:store.id}});
   return send(res,200,html,'text/html;charset=utf-8');
  }
  const supplied=req.headers.authorization?.replace(/^Bearer /,'')??'';
  need(/^[a-f0-9]{64}$/.test(supplied)&&timingSafeEqual(Buffer.from(supplied),Buffer.from(token)),'CRM_AUTH','Use the original private application connection.',401);
  need(req.headers['x-crm-instance']===instanceId,'CRM_INSTANCE_CHANGED','Reconnect the original current application instance.',409);
  need(!req.headers.origin||req.headers.origin===origin,'CRM_ORIGIN','Use the same local application origin.',403);
  if(req.method==='GET'&&url.pathname==='/api/status')return send(res,200,{schema:CONNECTION_SCHEMA,instanceId,workspaceId:store.id,...await store.summary()});
  if(req.method==='GET'&&url.pathname==='/api/workspace')return send(res,200,await store.state());
  if(req.method==='POST'&&url.pathname==='/api/action')return send(res,200,await store.action(await body(req)));
  if(req.method==='POST'&&url.pathname==='/api/export')return send(res,200,await store.export((await body(req)).expectedSha256));
  if(req.method==='GET'&&url.pathname==='/api/file'){
   const id=url.searchParams.get('id'),offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??196608);
   need(/^[a-f0-9]{64}$/.test(id||'')&&Number.isSafeInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0&&limit<=196608,'CRM_FILE_SELECTION','Choose a retained complete file and valid byte range.');
   const r=await readBytes(join(directory,'exports',id+'.zip'));need(r.sha256===id&&offset<=r.bytes.length,'CRM_FILE_CHANGED','Retained file identity or range changed.',409);
   const end=Math.min(offset+limit,r.bytes.length);return send(res,200,{fileId:id,sha256:id,bytes:r.bytes.length,offset,nextOffset:end<r.bytes.length?end:null,contentBase64:r.bytes.subarray(offset,end).toString('base64')});
  }
  send(res,404,{error:{code:'CRM_ROUTE',message:'Unknown CRM operation.'}});
 };
 server=http.createServer((req,res)=>{const work=handler(req,res).catch(e=>{if(!res.headersSent)send(res,e.status??500,{error:{code:e.code??'CRM_OPERATION',message:e.message}});else res.destroy();});pending.add(work);work.finally(()=>pending.delete(work));});
 server.requestTimeout=120000;server.headersTimeout=15000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(selectedPort,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
 origin='http://127.0.0.1:'+server.address().port;
 await writeJSON(join(directory,'crm.listener.json'),{schema:'stellar-forge.crm-listener.v1',workspaceId:store.id,port:server.address().port},{replace:true});
 const value={schema:CONNECTION_SCHEMA,directory,directoryIdentity:store.identity,workspaceId:store.id,instanceId,pid:process.pid,origin,url:origin+'/#token='+token,token};
 const written=await writeJSON(join(directory,CONNECTION),value,{replace:true});connection={...written,value};
 const close=()=>closePromise||(closePromise=(async()=>{
  closing=true;let first;
  try{const current=await readJSON(connection.path,32768);if(current.sha256===connection.sha256)await unlink(connection.path);}catch(e){if(e.code!=='ENOENT')first=e;}
  try{await new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections();});await Promise.allSettled([...pending]);}catch(e){first??=e;}
  try{await store.close();}catch(e){first??=e;}if(first)throw first;
 })());
 return {directory,workspaceId:store.id,instanceId,origin,url:value.url,connection,close};
 }catch(e){if(e.code==='EADDRINUSE'&&port===0&&selectedPort)e.message='The original CRM listener port '+selectedPort+' is occupied. Restore its availability to retain browser request history, or save pending requests before deliberately selecting another port. '+e.message;if(server?.listening)await new Promise(r=>server.close(r));await store.close().catch(c=>{e.cleanupError=c;});throw e;}
}
export function startup(service){return {schema:STARTUP_SCHEMA,status:'CRM_WORKSPACE_READY',directory:service.directory,workspaceId:service.workspaceId,
 instanceId:service.instanceId,pid:process.pid,origin:service.origin,url:service.url,connectionFile:service.connection.path,connectionSha256:service.connection.sha256};}
