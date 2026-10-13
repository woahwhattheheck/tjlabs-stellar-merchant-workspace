// SPDX-License-Identifier: MIT
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openA2AWorkspace } from './workspace.mjs';
import { startA2AMerchant } from './merchant.mjs';
import { LIMITS, now, id, sha, canonical, fail, publicError, atomicFile, safeName } from './foundation.mjs';

import { commissioningTemplate } from './commissioning.mjs';

export const A2A_STARTUP_SCHEMA='stellar-forge.a2a-workspace-startup.v1';
export const A2A_PROBE_SCHEMA='stellar-forge.a2a-workspace-probe.v1';
export const A2A_LAUNCH_FILE='operator-listener.json';
const NETWORK=new Set(['capture_card','send_message','get_task','list_tasks','subscribe_task','cancel_task','adopt_task','capture_artifacts']);
function secureEqual(a,b){const x=Buffer.from(String(a??'')),y=Buffer.from(String(b??''));return x.length===y.length&&timingSafeEqual(x,y);}
function processStamp(){try{return readFileSync('/proc/self/stat','utf8').replace(/^.*\) /,'').split(' ')[19];}catch{return null;}}
async function body(req,max){
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)fail('HTTP_BODY_LIMIT','The request exceeds its complete-body limit.',413);chunks.push(chunk);}return Buffer.concat(chunks,size);
}
function queryRevision(url){const value=url.searchParams.get('revision');if(value===null)return null;const n=Number(value);if(!Number.isSafeInteger(n)||n<1)fail('INVALID_REVISION');return n;}
export async function startA2AWorkspaceServer(options={}) {
  const workspace=options.workspace??await openA2AWorkspace(options),ownsWorkspace=!options.workspace||options.closeWorkspace===true;
  const token=randomBytes(32).toString('base64url'),launchId=id(),processIdentity={pid:process.pid,ppid:process.ppid,start:processStamp()};
  let origin,closed=false,closing,merchant=null,merchantOpening=null,merchantSelection=null,merchantTail=Promise.resolve();
  const merchantSummary=()=>merchant?{running:true,publicationId:merchant.publication.id,url:merchant.url,mode:merchant.mode}:{running:false};
  function merchantChange(input){const work=merchantTail.then(async()=>{if(input.action==='stop'){await merchant?.close();merchant=null;return merchantSummary();}if(input.action!=='start')fail('MERCHANT_ACTION');if(merchant){if(merchant.publication.id!==input.publicationId)fail('MERCHANT_ALREADY_RUNNING','Stop the current original seller before selecting another publication.',409);return merchantSummary();}merchant=await startA2AMerchant(workspace,{id:input.id,publicationId:input.publicationId,port:0,nativeFactory:options.nativeFactory??null,...(options.facilitator?{facilitator:options.facilitator,allowLocalFacilitator:options.allowLocalFacilitator===true}:{})});return merchantSummary();});merchantTail=work.catch(()=>{});return work;}
  const pending=new Set(),connections=new Set();
  const server=createServer((req,res)=>{
    const action=handle(req,res).catch(error=>{if(!res.headersSent)json(res,error.status??500,{error:publicError(error)});else res.destroy();});
    pending.add(action);action.finally(()=>pending.delete(action));
  });
  server.on('connection',socket=>{connections.add(socket);socket.once('close',()=>connections.delete(socket));});
  server.requestTimeout=300000;server.headersTimeout=10000;
  function headers(res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");}
  function json(res,status,value){headers(res);res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(canonical(value));}
  function download(res,result,method='GET'){headers(res);res.setHeader('Content-Type',result.mediaType);res.setHeader('Content-Length',result.bytes.length);res.setHeader('Content-Disposition','attachment; filename="'+safeName(result.filename)+'"');res.setHeader('ETag','"'+result.sha256+'"');res.setHeader('X-Content-SHA256',result.sha256);res.writeHead(200);res.end(method==='HEAD'?undefined:result.bytes);}
  function trusted(req) {
    if(req.headers.host!==new URL(origin).host)fail('HOST_NOT_SELECTED',undefined,403);
    if(req.headers.origin&&req.headers.origin!==origin)fail('ORIGIN_NOT_SELECTED',undefined,403);
    if(req.headers['sec-fetch-site']==='cross-site')fail('CROSS_SITE_REQUEST',undefined,403);
  }
  function auth(req){trusted(req);if(!secureEqual(req.headers.authorization,'Bearer '+token))fail('OPERATOR_AUTH_REQUIRED',undefined,401);}
  const probe=()=>({schema:A2A_PROBE_SCHEMA,launchId,workspaceId:workspace.workspaceId,connectionFileSha256:options.connectionFileSha256??null,process:processIdentity,origin});
  async function handle(req,res){
    if(closed)fail('SERVER_CLOSING',undefined,503);trusted(req);const url=new URL(req.url,origin);
    if(['GET','HEAD'].includes(req.method)&&['/','/app.mjs','/commissioning.mjs','/style.css'].includes(url.pathname)){
      const type=url.pathname==='/'?'text/html; charset=utf-8':url.pathname.endsWith('.mjs')?'text/javascript; charset=utf-8':'text/css; charset=utf-8';
      let bytes=readFileSync(new URL('./web/'+(url.pathname==='/'?'index.html':url.pathname.slice(1)),import.meta.url));
      if(url.pathname==='/')bytes=Buffer.from(bytes.toString('utf8').replace('__OPERATOR_TOKEN__',token).replace('__WORKSPACE_ID__',workspace.workspaceId));
      headers(res);res.writeHead(200,{'content-type':type,'content-length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);return;
    }
    auth(req);
    if(req.method==='GET'&&url.pathname==='/api/application'){json(res,200,probe());return;}
    if(req.method==='GET'&&url.pathname==='/api/projects'){json(res,200,workspace.list());return;}
    if(req.method==='GET'&&url.pathname==='/api/project'){json(res,200,workspace.get(url.searchParams.get('id'),{revision:queryRevision(url)}));return;}
    if(req.method==='GET'&&url.pathname==='/api/request'){json(res,200,workspace.request(url.searchParams.get('id')));return;}
    if(['GET','HEAD'].includes(req.method)&&url.pathname==='/api/source'){download(res,workspace.readSource(url.searchParams.get('id'),url.searchParams.get('sha256'),{revision:queryRevision(url)}),req.method);return;}
    if(['GET','HEAD'].includes(req.method)&&url.pathname==='/api/export'){download(res,workspace.exportPacket(url.searchParams.get('id'),{revision:queryRevision(url),handoffId:url.searchParams.get('handoffId')}),req.method);return;}
    if(['GET','HEAD'].includes(req.method)&&url.pathname==='/api/result'){download(res,workspace.exportResult(url.searchParams.get('id'),url.searchParams.get('editionId')),req.method);return;}
    if(['GET','HEAD'].includes(req.method)&&url.pathname==='/api/commissioning/template'){download(res,commissioningTemplate(),req.method);return;}
    if(['GET','HEAD'].includes(req.method)&&url.pathname==='/api/commissioning'){const value=workspace.commissioningReport(url.searchParams.get('id'),{revision:queryRevision(url)}),bytes=Buffer.from(canonical(value)+'\n');download(res,{bytes,sha256:sha(bytes),filename:'a2a-commissioning-'+value.projectId+'-r'+value.revision+'.json',mediaType:'application/json'},req.method);return;}
    if(req.method==='POST'&&['/api/dispatch','/api/commissioning/source'].includes(url.pathname)){
      const upload=url.pathname==='/api/commissioning/source';const bytes=await body(req,upload?Math.ceil(LIMITS.artifactBytes*4/3)+65536:2*LIMITS.requestBytes);let input;try{input=JSON.parse(bytes.toString('utf8'));}catch{fail('JSON_REQUIRED');}
      if(upload&&input.action!=='commission_retain_source')fail('COMMISSION_SOURCE_ACTION');
      const requestId=input?.payload?.requestId,bodySha256=sha(bytes);
      const operation=workspace.dispatch(input.action,input.payload);
      try{
        if(NETWORK.has(input.action)){
          let timer;const selected=await Promise.race([operation.then(result=>({result})),new Promise(resolve=>{timer=setTimeout(()=>resolve({pending:true}),250);})]);clearTimeout(timer);
          if(selected.pending){operation.catch(()=>{});let state;try{state=workspace.request(requestId);}catch{state=null;}json(res,202,{requestId,bodySha256,state:'pending',request:state});return;}
          json(res,200,{...selected.result,requestId,bodySha256});return;
        }
        const result=await operation;json(res,200,{...result,requestId,bodySha256});return;
      }catch(error){
        let retained;try{retained=workspace.request(requestId);}catch{retained=null;}
        json(res,error.status??500,{requestId:requestId??null,bodySha256,state:retained?.state??'rejected',request:retained,error:publicError(error)});return;
      }
    }
    if(req.method==='POST'&&url.pathname==='/api/receive'){
      const bytes=await body(req,LIMITS.packetBytes),requestId=url.searchParams.get('requestId');
      try{const result=workspace.receivePacket(bytes,{requestId});json(res,200,{...result,requestId,bodySha256:sha(bytes),state:'complete'});}catch(error){const retained=typeof requestId==='string'?workspace.db.prepare('SELECT result FROM imports WHERE id=?').get(requestId):null;if(retained){const original=JSON.parse(retained.result);if(original.packetSha256===sha(bytes)){json(res,200,{...original,project:workspace.get(original.projectId),requestId,bodySha256:sha(bytes),state:'complete',replay:true});return;}}json(res,error.status??500,{requestId,bodySha256:sha(bytes),state:'rejected',error:publicError(error)});}return;
    }
    if(req.method==='POST'&&url.pathname==='/api/local-stop'){const input=JSON.parse((await body(req,16384)).toString('utf8'));json(res,200,workspace.stop(input.requestId));return;}
    if(req.method==='GET'&&url.pathname==='/api/merchant'){json(res,200,merchantSummary());return;}
    if(req.method==='POST'&&url.pathname==='/api/merchant'){
      const input=JSON.parse((await body(req,16384)).toString('utf8'));
      json(res,200,await merchantChange(input));return;
    }
    fail('ROUTE_NOT_FOUND','The requested operator route does not exist.',404);
  }
  const close=()=>closing??=(async()=>{
    closed=true;const listenerClosed=new Promise(resolve=>server.close(resolve));
    server.closeIdleConnections?.();for(const socket of connections)socket.destroy();
    await Promise.allSettled([...pending]);await merchantTail;await merchant?.close();
    if(ownsWorkspace)await workspace.close();else{for(const requestId of workspace.active.keys())workspace.stop(requestId);await Promise.allSettled([...workspace.active.values()].map(x=>x.promise));}
    await listenerClosed;return{closed:true,workspaceClosed:ownsWorkspace};
  })();
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(options.port??0,'127.0.0.1',resolve);});
    origin='http://127.0.0.1:'+server.address().port;
    const startup={schema:A2A_STARTUP_SCHEMA,status:'A2A_WORKSPACE_READY',launchId,workspaceId:workspace.workspaceId,connectionFileSha256:options.connectionFileSha256??null,process:processIdentity,origin,url:origin,createdAt:now()};
    // The browser receives the operator token only in the same-origin HTML body.
    // The private launch receipt also supports the original Applications observer.
    atomicFile(join(workspace.directory,A2A_LAUNCH_FILE),Buffer.from(canonical({...startup,token})),{replace:true});
    return{server,workspace,origin,url:origin,token,startup,probe,close};
  }catch(error){await close().catch(()=>{});throw error;}
}
