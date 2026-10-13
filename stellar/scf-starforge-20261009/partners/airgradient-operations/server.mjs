// SPDX-License-Identifier: MIT
import {createServer} from 'node:http';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {readBrowserAssets} from '../../distribution/browser-assets.mjs';
import {publishJson,readJson} from '../open-meteo-operations/files.mjs';
import {need,now,MAX_PACKAGE,digest} from './contract.mjs';
import {openWorkspace,inspectWorkspace} from './workspace.mjs';
import {zipBytes} from './exports.mjs';

export const STARTUP_SCHEMA='stellar-forge.airgradient-startup.v1';
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function input(request){const chunks=[];let length=0;for await(const chunk of request){length+=chunk.length;need(length<=MAX_PACKAGE,'REQUEST_TOO_LARGE');chunks.push(chunk);}return Buffer.concat(chunks);}
export async function serveWorkspace(directory,{port=0,expectedConfiguration}={}){
 const selected=await inspectWorkspace(directory);if(expectedConfiguration)need(selected.configurationSha256===expectedConfiguration,'WORKSPACE_CONFIGURATION_CHANGED');
 need(Number.isSafeInteger(port)&&port>=0&&port<=65535,'INVALID_PORT');
 const workspace=await openWorkspace(directory),assets=await readBrowserAssets(new URL('./browser-assets.json',import.meta.url)),token=randomBytes(32).toString('hex'),instanceId=randomUUID();
 let origin,connectionFile;
 const server=createServer(async(request,response)=>{
  const reply=(status,value,type='application/json; charset=utf-8',headers={})=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value));
   response.writeHead(status,{'content-type':type,'content-length':bytes.length,'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-frame-options':'DENY',
    'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",...headers});response.end(bytes);};
  try{
   need(request.headers.host===new URL(origin).host,'REQUEST_HOST_CHANGED');const url=new URL(request.url,origin);need(url.origin===origin,'REQUEST_ORIGIN_CHANGED');
   if(request.method==='GET'&&url.pathname==='/connect/'+token){reply(303,'','text/plain',{'set-cookie':'airgradient_session='+token+'; HttpOnly; SameSite=Strict; Path=/','location':'/'});return;}
   if(request.method==='GET'&&url.pathname==='/api/identity'&&equal(request.headers['x-airgradient-startup-token'],token)){
    reply(200,{schema:STARTUP_SCHEMA,state:'READY',workspaceId:workspace.workspaceId,configurationSha256:workspace.configurationSha256,instanceId,origin});return;
   }
   const cookie=String(request.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('airgradient_session='))?.slice('airgradient_session='.length);
   need(equal(cookie,token),'SESSION_REQUIRED');need(request.headers['sec-fetch-site']!=='cross-site','CROSS_SITE_REQUEST');
   if(request.method==='POST')need(request.headers.origin===origin,'REQUEST_ORIGIN_REQUIRED');
   if(request.method==='GET'&&assets.has(url.pathname)){const asset=assets.get(url.pathname);reply(200,await readFile(asset.url),asset.type);return;}
   if(request.method==='GET'&&url.pathname==='/api/state'){reply(200,workspace.state());return;}
   if(request.method==='GET'&&url.pathname==='/api/catalogue'){reply(200,await workspace.catalogue(Number(url.searchParams.get('page')??1),50,url.searchParams.get('sourceType')??'outdoor'));return;}
   if(request.method==='GET'&&url.pathname==='/api/report'){
    const id=url.searchParams.get('id'),format=url.searchParams.get('format')??'html',files=await workspace.files(id);
    need(['html','json','summary','series','handover','zip'].includes(format),'INVALID_EXPORT_FORMAT');
    const name={html:'report.html',json:'report.json',summary:'summary.csv',series:'series.csv',handover:'editable.airgradient.json',zip:'airgradient-study.zip'}[format];
    const bytes=format==='zip'?zipBytes(files):files.find(f=>f.name===name).bytes;
    const type=format==='html'?'text/html; charset=utf-8':format==='zip'?'application/zip':format==='summary'||format==='series'?'text/csv; charset=utf-8':'application/json; charset=utf-8';
    reply(200,bytes,type,{'content-disposition':'attachment; filename="'+name+'"'});return;
   }
   if(request.method==='POST'&&['/api/source/review','/api/source/import'].includes(url.pathname)){
    const bytes=await input(request);if(url.pathname.endsWith('/review')){reply(200,workspace.inspectSource(bytes));return;}
    const expected=url.searchParams.get('expected');need(/^[a-f0-9]{64}$/.test(expected??''),'SOURCE_REVIEW_REQUIRED');reply(200,workspace.importSource(bytes,expected));return;
   }
   if(request.method==='POST'&&['/api/receive/review','/api/receive/commit'].includes(url.pathname)){
    const bytes=await input(request),inspection=workspace.inspectReceiving(bytes);
    if(url.pathname.endsWith('/review')){reply(200,inspection.summary);return;}
    need(inspection.value.sha256===url.searchParams.get('expected'),'RECEIVING_SELECTION_CHANGED');reply(200,workspace.receive(bytes));return;
   }
   if(request.method==='POST'){
    need(/^application\/json(?:;|$)/i.test(request.headers['content-type']??''),'JSON_REQUEST_REQUIRED');
    const data=JSON.parse((await input(request)).toString('utf8'));
    switch(url.pathname){
     case '/api/project':reply(200,workspace.saveProject(data.project,{expectedCurrent:data.expectedCurrent}));return;
     case '/api/project/select':reply(200,workspace.selectProject(data.id));return;
     case '/api/plan':reply(200,workspace.createPlan(data));return;
     case '/api/acquire':reply(202,await workspace.start(data.planId,{retryFailed:data.retryFailed===true}));return;
     case '/api/acquire/stop':reply(200,workspace.stop());return;
     case '/api/acquire/reprocess':reply(200,workspace.reprocess(data.planId));return;
     case '/api/review':reply(200,workspace.review(data.planId));return;
     case '/api/commit':reply(200,workspace.commit(data.planId,data.expectedReviewSha));return;
     case '/api/deliver':reply(200,await workspace.deliver(data.reportId,data.directory));return;
     case '/api/definition':reply(200,await workspace.definition());return;
     case '/api/connection':reply(200,workspace.addDashboard(Buffer.from(data.definitionBase64,'base64'),data.binding));return;
    }
   }
   reply(404,{code:'ROUTE_NOT_FOUND'});
  }catch(error){const code=typeof error.code==='string'&&/^[A-Z0-9_]{1,120}$/.test(error.code)?error.code:'REQUEST_FAILED';reply(code==='SESSION_REQUIRED'?401:400,{code});}
 });
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;connectionFile=join(directory,'connection-'+instanceId+'.json');
  const connection={schema:'stellar-forge.airgradient-connection-file.v1',workspaceId:workspace.workspaceId,configurationSha256:workspace.configurationSha256,instanceId,origin,token,createdAt:now()};
  await publishJson(connectionFile,connection);
  return {schema:STARTUP_SCHEMA,state:'READY',url:origin+'/connect/'+token,origin,workspaceId:workspace.workspaceId,configurationSha256:workspace.configurationSha256,instanceId,connectionFile,
   async close(){workspace.stop();await new Promise(resolve=>server.close(resolve));await workspace.close();}};
 }catch(error){server.close();await workspace.close();throw error;}
}
export async function readConnection(path){const v=await readJson(path);need(v.schema==='stellar-forge.airgradient-connection-file.v1'&&/^[a-f0-9]{64}$/.test(v.token),'INVALID_CONNECTION_FILE');const u=new URL(v.origin);need(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.origin===v.origin&&!u.username&&!u.password&&Number(u.port)>0,'PRIVATE_LISTENER_REQUIRED');return v;}
export async function verifyConnectionFile(v){
 const response=await fetch(v.origin+'/api/identity',{headers:{'x-airgradient-startup-token':v.token},redirect:'error',signal:AbortSignal.timeout(5000)});need(response.status===200,'APPLICATION_LISTENER_UNAVAILABLE');
 const identity=await response.json();need(identity.schema===STARTUP_SCHEMA&&identity.state==='READY'&&identity.workspaceId===v.workspaceId&&identity.instanceId===v.instanceId&&identity.configurationSha256===v.configurationSha256,'APPLICATION_LISTENER_CHANGED');return identity;
}
