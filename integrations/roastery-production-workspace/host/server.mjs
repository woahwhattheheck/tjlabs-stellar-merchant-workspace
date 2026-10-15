// MIT. Authenticated loopback listener owns the complete private session writer.
import http from 'node:http';
import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {openStore} from './store.mjs';
import {writeJSON,readJSON,readBytes,privateDirectory,json,need,MAX_BYTES,decode} from './io.mjs';
import {moduleSources,buildExport} from './export.mjs';
import {buildRoasteryDesk} from '../src/build-installed.mjs';
import {codec} from '../runtime.mjs';
export const CONNECTION='roastery.connection.json',CONNECTION_SCHEMA='stellar-forge.roastery-connection.v1',STARTUP_SCHEMA='stellar-forge.roastery-startup.v1';
async function body(req){const chunks=[];let bytes=0;for await(const b of req){bytes+=b.length;need(bytes<=MAX_BYTES,'ROASTERY_SIZE','Complete request exceeds 256 MiB.',413);chunks.push(b);}return JSON.parse(decode(Buffer.concat(chunks)));}
function send(res,status,value,type='application/json;charset=utf-8'){const b=Buffer.from(type.startsWith('application/json')?json(value):value);res.writeHead(status,{'content-type':type,'content-length':b.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});res.end(b);}
export async function startServer({directory,installationId,port=0}){
 need(Number.isInteger(port)&&port>=0&&port<=65535,'ROASTERY_PORT','Select a port from 0 to 65535.');
 const store=await openStore(directory),instanceId=randomUUID(),token=randomBytes(32).toString('hex'),pending=new Set();let server,connection,origin,closing=false,closePromise,selectedPort=port;
 try{
  need(!installationId||installationId===store.id,'ROASTERY_INSTALLATION_CHANGED','The selected installation differs.',409);const files=await moduleSources();
  if(port===0){let prior;try{prior=(await readJSON(join(directory,'roastery.listener.json'),32768)).value;}catch(e){if(e.code!=='ENOENT')throw e;}
   if(prior){need(prior.schema==='stellar-forge.roastery-listener.v1'&&prior.installationId===store.id&&Number.isInteger(prior.port)&&prior.port>0&&prior.port<=65535,'ROASTERY_LISTENER','Original listener selection differs.',409);selectedPort=prior.port;}}
  const handler=async(req,res)=>{
   need(!closing,'ROASTERY_CLOSING','The application is closing.',503);need(req.headers.host===new URL(origin).host,'ROASTERY_HOST','Use the actual loopback origin.',403);const u=new URL(req.url,origin);
   if(req.method==='GET'&&u.pathname==='/')return send(res,200,buildRoasteryDesk(files,{managed:{installationId:store.id,instanceId}}),'text/html;charset=utf-8');
   const bearer=req.headers.authorization?.replace(/^Bearer /,'')||'';
   need(/^[a-f0-9]{64}$/.test(bearer)&&timingSafeEqual(Buffer.from(bearer),Buffer.from(token)),'ROASTERY_AUTH','Open the current private application connection.',401);
   need(req.headers['x-roastery-instance']===instanceId,'ROASTERY_INSTANCE_CHANGED','Reconnect the current application instance.',409);
   need(!req.headers.origin||req.headers.origin===origin,'ROASTERY_ORIGIN','Use the same application origin.',403);
   if(req.method==='GET'&&u.pathname==='/api/status')return send(res,200,{schema:CONNECTION_SCHEMA,instanceId,...await store.summary()});
   if(req.method==='GET'&&u.pathname==='/api/state')return send(res,200,await store.state());
   if(req.method==='POST'&&u.pathname==='/api/request')return send(res,200,await store.apply(await body(req)));
   if(req.method==='POST'&&u.pathname==='/api/request-status')return send(res,200,await store.requestStatus(await body(req)));
   if(req.method==='POST'&&u.pathname==='/api/export'){const r=await body(req);return send(res,200,await store.export(r.expectedSha256,(state,records,editions)=>buildExport(files,state,records,editions)));}
   if(req.method==='GET'&&u.pathname==='/api/file'){
    const id=u.searchParams.get('id'),offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||196608);need(/^[a-f0-9]{64}$/.test(id||'')&&Number.isSafeInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0&&limit<=196608,'ROASTERY_FILE','Choose a retained file and byte range.');
    const identity=await privateDirectory(directory);need(identity.dev===store.identity.dev&&identity.ino===store.identity.ino,'ROASTERY_DIRECTORY_CHANGED','The original export directory changed.',409);
    const r=await readBytes(join(directory,'exports',id+'.zip'));need(r.sha256===id&&offset<=r.bytes.length,'ROASTERY_FILE_CHANGED','Retained export or range differs.',409);
    const end=Math.min(r.bytes.length,offset+limit);return send(res,200,{fileId:id,sha256:id,bytes:r.bytes.length,offset,nextOffset:end<r.bytes.length?end:null,contentBase64:r.bytes.subarray(offset,end).toString('base64')});
   }
   return send(res,404,{error:{code:'ROASTERY_ROUTE',message:'Unknown managed operation.'}});
  };
  server=http.createServer((req,res)=>{const p=handler(req,res).catch(e=>{if(!res.headersSent)send(res,e.status||500,{error:{code:e.code||'ROASTERY_FAILED',message:e.message}});else res.destroy();});pending.add(p);p.finally(()=>pending.delete(p));});server.requestTimeout=120000;server.headersTimeout=15000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(selectedPort,'127.0.0.1',()=>{server.off('error',reject);resolve();});});origin='http://127.0.0.1:'+server.address().port;
  await writeJSON(join(directory,'roastery.listener.json'),{schema:'stellar-forge.roastery-listener.v1',installationId:store.id,port:server.address().port},{replace:true});
  const value={schema:CONNECTION_SCHEMA,directory,directoryIdentity:store.identity,installationId:store.id,instanceId,pid:process.pid,origin,url:origin+'/#token='+token,token};const saved=await writeJSON(join(directory,CONNECTION),value,{replace:true});connection={...saved,value};
  const close=()=>closePromise||(closePromise=(async()=>{closing=true;let failure;try{const c=await readJSON(connection.path,32768);if(c.sha256===connection.sha256)await unlink(connection.path);}catch(e){if(e.code!=='ENOENT')failure=e;}try{await new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections();});await Promise.allSettled([...pending]);}catch(e){failure??=e;}try{await store.close();}catch(e){failure??=e;}if(failure)throw failure;})());
  return {directory,installationId:store.id,instanceId,origin,url:value.url,connection,close};
 }catch(e){if(e.code==='EADDRINUSE'&&port===0)e.message='Original listener port is occupied. Preserve complete recovery JSON before deliberately choosing a new port. '+e.message;if(server?.listening)await new Promise(r=>server.close(r));await store.close();throw e;}
}
export function startup(s){return {schema:STARTUP_SCHEMA,status:'ROASTERY_READY',directory:s.directory,installationId:s.installationId,instanceId:s.instanceId,pid:process.pid,origin:s.origin,url:s.url,connectionFile:s.connection.path,connectionSha256:s.connection.sha256};}
