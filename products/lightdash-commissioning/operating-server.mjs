// MIT. A procedure editor borrowing the already running original Merchant workspace.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,timingSafeEqual,randomUUID} from 'node:crypto';
import path from 'node:path';
import {json,readBytes,digest,need,saveJson,privateDirectory,installedSource} from './common.mjs';
import {connectProject} from './client.mjs';
const assets=new Map([['/',['operating-web/index.html','text/html; charset=utf-8']],['/app.js',['operating-web/app.js','text/javascript; charset=utf-8']],['/style.css',['operating-web/style.css','text/css; charset=utf-8']]]);
const methods=new Set(['source','list','read','create','adopt','save','capture','receive','return_preview','return_apply','export','request']);
export const OPERATING_STARTUP_SCHEMA='stellar-forge.lightdash-operating-plan-startup.v1';
export async function createOperatingPlanServer({projectDirectory,port=0,expected={}}){
 if(!Number.isInteger(port)||port<0||port>65535)throw new TypeError('Use a valid loopback port.');
 const client=await connectProject(projectDirectory),token=randomBytes(32).toString('hex'),pending=new Set();
 let closing=false,origin,closePromise,announcement,receiptFile;
 const project=client.project,host=client.session,instanceId=randomUUID();
 const checkHost=async()=>{const current=await json(path.join(projectDirectory,'session.json'));
  need(current.phase==='OPEN'&&current.instanceId===host.instanceId&&current.authoringInstanceId===host.authoringInstanceId&&current.workspaceId===host.workspaceId&&current.workspaceIdentity===host.workspaceIdentity&&current.manifestSha256===host.manifestSha256&&current.mcpUrl===host.mcpUrl,
   'LIGHTDASH_PROCEDURE_HOST_CHANGED','The original project owner changed. Review a new editor Start.');
 };
 let installation,projectSha256;
 try{
  installation=await installedSource(project.installation.runtimeDirectory);projectSha256=digest(await readBytes(path.join(projectDirectory,'project.json'),{maximum:8*1024*1024,privateFile:true}));
  const actual={projectSha256,workspaceId:project.workspace.workspaceId,workspaceIdentity:project.workspaceIdentity,manifestSha256:installation.manifestSha256,hostInstanceId:host.instanceId,authoringInstanceId:host.authoringInstanceId};
  need(Object.keys(expected).every(k=>Object.hasOwn(actual,k)&&expected[k]===actual[k]),'LIGHTDASH_PROCEDURE_START_CHANGED','The reviewed project/host/source selection changed.');await checkHost();
 }catch(error){await client.close();throw error;}
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const server=http.createServer((req,res)=>{
  const call=(async()=>{
   if(closing)return send(res,503,{error:'Procedure editor is closing.'});
   if(req.headers.host!==new URL(origin).host)return send(res,421,{error:'Use this original loopback listener.'});
   const url=new URL(req.url,origin);
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
   res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
   if(req.method==='GET'&&assets.has(url.pathname)){
    if(url.search)return send(res,400,{error:'Use the exact asset path.'});
    const [name,type]=assets.get(url.pathname);let raw=await readFile(new URL(name,import.meta.url));
    if(url.pathname==='/')raw=Buffer.from(raw.toString('utf8').replace('__PROCEDURE_TOKEN__',token));
    res.writeHead(200,{'Content-Type':type});res.end(raw);return;
   }
   if(req.method!=='POST'||url.pathname!=='/api/call'||url.search)return send(res,404,{error:'Unknown procedure route.'});
   const supplied=Buffer.from(String(req.headers['x-procedure-token']??'')),expected=Buffer.from(token);
   if(req.headers.origin!==origin||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return send(res,403,{error:'Use this original editor session.'});
   if(!String(req.headers['content-type']??'').startsWith('application/json'))return send(res,415,{error:'Send JSON.'});
   const chunks=[];let total=0;
   for await(const chunk of req){total+=chunk.length;if(total>28*1024*1024)return send(res,413,{error:'Complete request exceeds 28 MiB.'});chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!body||Object.keys(body).some(k=>!['method','args'].includes(k))||!methods.has(body.method)||!body.args||Array.isArray(body.args)||Object.hasOwn(body.args,'workspace'))return send(res,400,{error:'Use the documented procedure method.'});
   await checkHost();
   const result=await client.call('merchant_lightdash_operating_'+body.method,body.args);
   send(res,200,{...result,editor:{workspaceId:client.workspaceId,title:client.project.title,browserUrl:client.session.browserUrl}});
  })();pending.add(call);call.catch(error=>{if(!res.headersSent)send(res,400,{error:error.message,code:error.code??null});else res.destroy(error);}).finally(()=>pending.delete(call));
 });
 const close=()=>closePromise??=(async()=>{closing=true;server.closeIdleConnections?.();await new Promise(resolve=>server.close(resolve));await Promise.allSettled([...pending]);await client.close();if(announcement)await saveJson(receiptFile,{...announcement,phase:'CLOSED',endedAt:new Date().toISOString()});})();
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  await checkHost();
  need(digest(await readBytes(path.join(projectDirectory,'project.json'),{maximum:8*1024*1024,privateFile:true}))===projectSha256,'LIGHTDASH_PROCEDURE_START_CHANGED','The original project changed during startup.');
  const receiptDirectory=path.join(projectDirectory,'operating-sessions');await privateDirectory(receiptDirectory,true);receiptFile=path.join(receiptDirectory,instanceId+'.json');
  announcement={schema:OPERATING_STARTUP_SCHEMA,status:'LIGHTDASH_OPERATING_PLAN_READY',phase:'OPEN',directory:projectDirectory,projectId:project.id,projectSha256,workspaceId:client.workspaceId,workspaceIdentity:project.workspaceIdentity,
   manifestSha256:installation.manifestSha256,applicationManifestSha256:installation.application.manifestSha256,sourceRoot:installation.sourceRoot,executingSourceRoot:installation.executingRoot,
   hostInstanceId:host.instanceId,authoringInstanceId:host.authoringInstanceId,instanceId,browserUrl:origin+'/',mcpUrl:host.mcpUrl,pid:process.pid,nativeDispatch:false,startedAt:new Date().toISOString()};
  await saveJson(receiptFile,announcement,{createOnly:true});
  return {url:origin+'/',workspaceId:client.workspaceId,announcement,server,close};
 }catch(error){try{await close();}catch(cleanup){error.cleanupError=cleanup;}throw error;}
}
