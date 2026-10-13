// MIT. Private first-use chooser over the original customer handover intake.
import {createServer} from 'node:http';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readdir} from 'node:fs/promises';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {withPrivateLock} from '../../../sf30-seller-sdk/routescan/quota.mjs';
import {exists,jsonBytes} from '../../node/store.mjs';
import {readResearchHostFile,openResearchSource} from '../workspace-files.mjs';
import {customerDirectory,readCustomerJson,retainCustomerJson} from './files.mjs';
import {openCustomerHandoverIntake,INTAKE_SCHEMA} from './handover-intake.mjs';
import {startCustomerHandoverDesk} from './handover-desk.mjs';

const HERE=dirname(fileURLToPath(import.meta.url)),JSON_LIMIT=16*1024*1024,WIRE_LIMIT=256*1024*1024;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function need(ok,code,status=409){if(!ok)throw Object.assign(new Error(code),{code,status});}
function fields(value,names){need(object(value)&&Object.keys(value).every(k=>names.includes(k)),'INTAKE_FIELDS_INVALID',400);}
function absolute(value){need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&value!=='/','INTAKE_PATH_INVALID',400);return value;}
const errorCode=error=>/^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code??'')?error.code:'INTAKE_OPERATION_FAILED';
async function bodyJson(request){
  need((request.headers['content-type']??'').split(';')[0].trim()==='application/json','INTAKE_JSON_REQUIRED',415);
  const length=request.headers['content-length'];
  if(length!==undefined)need(/^(0|[1-9][0-9]*)$/.test(length)&&Number(length)<=JSON_LIMIT,'INTAKE_BODY_TOO_LARGE',413);
  const parts=[];let count=0;
  for await(const part of request){count+=part.length;need(count<=JSON_LIMIT,'INTAKE_BODY_TOO_LARGE',413);parts.push(part);}
  need(length===undefined||Number(length)===count,'INTAKE_BODY_INCOMPLETE',400);
  const wire=Buffer.concat(parts,count);
  need(Buffer.from(wire.toString('utf8'),'utf8').equals(wire),'INTAKE_JSON_UTF8_INVALID',400);
  try{return JSON.parse(wire.toString('utf8'));}catch{need(false,'INTAKE_JSON_INVALID',400);}
}
function securityHeaders(){
  return {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy':'same-origin'};
}
function reply(response,status,value){
  if(response.destroyed||response.writableEnded)return;
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...securityHeaders()});
  response.end(JSON.stringify(value)+'\n');
}
function filenameHeader(value){
  const safe=value.replace(/[\u0000-\u001f\u007f]/g,'_').replace(/[\\/]/g,'_');
  return 'attachment; filename="'+safe.replace(/[^\x20-\x7e]|["\\]/g,'_')+'"; filename*=UTF-8\'\''+
    encodeURIComponent(safe).replace(/['()*]/g,x=>'%'+x.charCodeAt(0).toString(16).toUpperCase());
}
function number(value,defaultValue){
  if(value===null)return defaultValue;
  need(/^(0|[1-9][0-9]*)$/.test(value)&&Number.isSafeInteger(Number(value)),'INTAKE_INTEGER_INVALID',400);
  return Number(value);
}
/** The host owns its original client and every explicitly launched desk until close succeeds. */
export async function startCustomerHandoverIntakeDesk({client,clientFactory,directory,engineRoot,engineManifest,
  engineManifestSha256,port=0,python='python3',node=process.execPath}={}){
  absolute(directory);need(client&&typeof client.close==='function','INTAKE_CLIENT_REQUIRED',400);
  need(typeof clientFactory==='function','INTAKE_CLIENT_FACTORY_REQUIRED',400);
  need(Number.isSafeInteger(port)&&port>=0&&port<=65535,'INTAKE_PORT_INVALID',400);
  const root=await customerDirectory(directory),hostRoot=await customerDirectory(join(root,'intake-private'));
  const token=randomBytes(32).toString('base64url'),tokenBytes=Buffer.from(token);
  let intake,server,origin,active=null,job=null,desk=null,pendingDeskClient=null,closing=false,clientClosed=false;
  let resolveReady,rejectReady,resolveStop;
  const ready=new Promise((yes,no)=>{resolveReady=yes;rejectReady=no;}),stopped=new Promise(yes=>{resolveStop=yes;});
  async function closeClient(){if(!clientClosed){await client.close();clientClosed=true;}}
  async function save(name,value){
    const parts=name.split('/'),filename=parts.pop(),location=await customerDirectory(join(hostRoot,...parts));
    need(jsonBytes(value).length<=JSON_LIMIT,'INTAKE_RETAINED_JSON_TOO_LARGE',413);
    return retainCustomerJson(location,filename,value);
  }
  async function optional(file){try{return await readCustomerJson(file,JSON_LIMIT);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async function recoverJob(){
    const location=join(hostRoot,'jobs');if(!await exists(location))return;
    const names=(await readdir(location)).filter(name=>/^[0-9]+-[a-f0-9-]+\.started\.json$/.test(name)).sort(),last=names.at(-1);
    if(!last)return;
    const before=(await readCustomerJson(join(location,last),JSON_LIMIT)).value,
      after=await optional(join(location,last.replace('.started.json','.result.json')));
    job=after?{id:before.id,action:before.action,state:after.value.state,...(after.value.error?{error:after.value.error}:{})}:
      {...before,state:before.action==='prepare'?'OUTCOME_UNCONFIRMED':'INTERRUPTED'};
  }
  async function startJob(action,work){
    need(!closing,'INTAKE_CLOSING',503);need(!active,'INTAKE_JOB_RUNNING');
    let resolveActive;active=new Promise(yes=>{resolveActive=yes;});
    const current={id:Date.now()+'-'+randomUUID(),action,state:'RUNNING'};job=current;
    try{await save('jobs/'+current.id+'.started.json',current);}
    catch(error){active=null;resolveActive();job={...current,state:'FAILED',error:{code:errorCode(error)}};throw error;}
    void(async()=>{
      try{
        const result=await work(),finished={...current,state:'SUCCEEDED'};
        // Launch's bearer URL lives only in memory and authenticated status.
        await save('jobs/'+current.id+'.result.json',{...finished,result});job=finished;
      }catch(error){
        const finished={...current,state:action==='prepare'?'OUTCOME_UNCONFIRMED':'FAILED',error:{code:errorCode(error)}};
        try{await save('jobs/'+current.id+'.result.json',finished);}catch{finished.retentionPending=true;}
        job=finished;
      }finally{active=null;resolveActive();}
    })();
    return current;
  }
  async function synchronous(action,work){
    need(!closing,'INTAKE_CLOSING',503);need(!active,'INTAKE_JOB_RUNNING');
    let resolveActive;active=new Promise(yes=>{resolveActive=yes;});
    const current={id:Date.now()+'-'+randomUUID(),action,state:'RUNNING'};job=current;
    try{const result=await work();job={...current,state:'SUCCEEDED'};return result;}
    catch(error){job={...current,state:'FAILED',error:{code:errorCode(error)}};throw error;}
    finally{active=null;resolveActive();}
  }
  async function launch(){
    if(desk)return {state:'OPEN'};
    need(!pendingDeskClient,'INTAKE_DESK_CLOSE_REQUIRED');
    const selected=await intake.launchSelection();
    pendingDeskClient=await clientFactory();
    need(pendingDeskClient&&pendingDeskClient!==client&&typeof pendingDeskClient.close==='function','INTAKE_DESK_CLIENT_REQUIRED');
    try{
      desk=await startCustomerHandoverDesk({client:pendingDeskClient,directory:selected.directory,
        selectionFile:selected.selectionFile,selectionSha256:selected.selectionSha256,python,node});
      pendingDeskClient=null;return {state:'OPEN'};
    }catch(error){
      // Retain a failed detach for close retry rather than dropping the owned client.
      await pendingDeskClient.close();pendingDeskClient=null;throw error;
    }
  }
  function authorize(request){
    need(request.headers.host===new URL(origin).host,'INTAKE_HOST_INVALID',403);
    const site=request.headers['sec-fetch-site'];
    need(!site||site==='same-origin'||site==='none','INTAKE_ORIGIN_INVALID',403);
    if(request.headers.origin!==undefined)need(request.headers.origin===origin,'INTAKE_ORIGIN_INVALID',403);
    const header=request.headers.authorization??'',value=Buffer.from(header.startsWith('Bearer ')?header.slice(7):'');
    need(value.length===tokenBytes.length&&timingSafeEqual(value,tokenBytes),'INTAKE_AUTH_REQUIRED',401);
    if(request.method==='POST')need(request.headers.origin===origin,'INTAKE_ORIGIN_REQUIRED',403);
  }
  async function download(response,id){
    const selected=await intake.download(id),source=await openResearchSource(selected.path,WIRE_LIMIT,{sha256:selected.sha256});
    try{
      need(source.bytes===selected.bytes,'INTAKE_DOWNLOAD_CHANGED');
      response.writeHead(200,{...securityHeaders(),'Content-Type':'application/octet-stream','Content-Length':source.bytes,
        'Content-Disposition':filenameHeader(selected.filename),'X-Content-SHA256':source.sha256,
        'Content-Security-Policy':"default-src 'none'; sandbox"});
      await pipeline(source.stream,response);
    }finally{await source.close();}
  }
  async function handler(request,response){
    try{
      need(request.headers.host===new URL(origin).host,'INTAKE_HOST_INVALID',403);
      const url=new URL(request.url,origin);
      if(request.method==='GET'&&['/','/index.html','/intake.js','/intake.css'].includes(url.pathname)){
        need(!url.search,'INTAKE_ROUTE_UNKNOWN',404);
        if(request.headers.origin!==undefined)need(request.headers.origin===origin,'INTAKE_ORIGIN_INVALID',403);
        const filename=url.pathname==='/'?'index.html':url.pathname.slice(1);
        const wire=await readResearchHostFile(join(HERE,'handover-intake-public',filename),2*1024*1024);
        response.writeHead(200,{...securityHeaders(),'Content-Type':filename.endsWith('.js')?'text/javascript; charset=utf-8':
          filename.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});response.end(wire);return;
      }
      authorize(request);
      if(request.method==='GET'){
        if(url.pathname==='/api/status'){
          reply(response,200,{...await intake.status(),job,desk:desk?{url:desk.url}:null});return;
        }
        if(url.pathname==='/api/dossiers'){
          reply(response,200,await intake.listDossiers({offset:number(url.searchParams.get('offset'),0),
            snapshot:url.searchParams.get('snapshot')??undefined}));return;
        }
        if(url.pathname==='/api/deliveries'){
          reply(response,200,await intake.listDeliveries({dossierId:url.searchParams.get('dossierId'),
            revision:number(url.searchParams.get('revision'),undefined),offset:number(url.searchParams.get('offset'),0)}));return;
        }
        if(url.pathname==='/api/download'){await download(response,url.searchParams.get('id'));return;}
      }
      if(request.method==='POST'){
        const input=await bodyJson(request);
        if(url.pathname==='/api/baseline'){
          fields(input,['dossierId','deliveryId','revision','sourceWorkspace']);
          reply(response,202,{job:await startJob('baseline',()=>intake.createBaseline(input))});return;
        }
        if(url.pathname==='/api/draft'){
          fields(input,['expectedSha256','value']);
          reply(response,200,await synchronous('draft',()=>intake.saveDraft(input)));return;
        }
        if(url.pathname==='/api/preview'){
          fields(input,['draftSha256']);reply(response,202,{job:await startJob('preview',()=>intake.preview(input))});return;
        }
        if(url.pathname==='/api/prepare'){
          fields(input,['previewSha256']);need(!desk,'INTAKE_DESK_ALREADY_OPEN');
          reply(response,202,{job:await startJob('prepare',()=>intake.prepare(input))});return;
        }
        if(url.pathname==='/api/launch'){
          fields(input,[]);reply(response,202,{job:await startJob('launch',launch)});return;
        }
      }
      need(false,'INTAKE_ROUTE_UNKNOWN',404);
    }catch(error){
      if(response.headersSent){response.destroy();return;}
      reply(response,error.status??(error.code==='ENOENT'?404:409),{error:{code:errorCode(error),
        message:'The selected intake could not complete. Keep its original baseline and scope, refresh status, and resolve the reported condition.'}});
    }
  }
  const lifetime=withPrivateLock(hostRoot,'handover-intake-host.lock',async()=>{
    try{
      intake=await openCustomerHandoverIntake({client,directory,engineRoot,engineManifest,engineManifestSha256});
      await recoverJob();
      server=createServer((request,response)=>{void handler(request,response);});server.requestTimeout=0;server.headersTimeout=30000;
      await new Promise((yes,no)=>{
        server.once('error',no);server.listen(port,'127.0.0.1',()=>{server.off('error',no);yes();});
      });
      origin='http://127.0.0.1:'+server.address().port;
      let closePromise;
      const close=()=>closePromise??=(async()=>{
        closing=true;if(active)await active;
        if(desk){await desk.close();desk=null;}
        if(pendingDeskClient){await pendingDeskClient.close();pendingDeskClient=null;}
        await closeClient();
        const closed=new Promise(yes=>server.close(yes));server.closeIdleConnections?.();await closed;resolveStop();
      })().catch(error=>{closePromise=null;throw error;});
      resolveReady({url:origin+'/#token='+token,port:server.address().port,close,intake});
      await stopped;
    }catch(error){rejectReady(error);throw error;}
    finally{if(server?.listening)server.close();await closeClient();}
  });
  void lifetime.catch(error=>{rejectReady(error);});return ready;
}
