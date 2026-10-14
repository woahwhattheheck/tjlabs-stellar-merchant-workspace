// MIT. Attached to the original store's serial writer; never opens a second lease.
import {join} from 'node:path';
import {readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {privateDirectory,readJSON,readBytes,writeJSON,json,sha,need,decode} from './io.mjs';
import capture from '../runtime/hubspot-capture.cjs';
import runtime from '../runtime/crm-runtime.cjs';
const ACCOUNT={kind:'account',method:'GET',path:'/account-info/2026-09/details'};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export function configuration(value){
 need(value?.schema==='crm-migration.hubspot-host.v1'&&value.connections&&Object.keys(value.connections).length>0&&Object.keys(value.connections).length<=16,'HUBSPOT_CONFIG','Declare 1–16 host-owned HubSpot connections.');
 const connections={};
 for(const [alias,c]of Object.entries(value.connections)){capture.key(alias);capture.id(c.portalId);need(typeof c.tokenEnv==='string'&&/^[A-Z][A-Z0-9_]{2,99}$/.test(c.tokenEnv),'HUBSPOT_CREDENTIAL','Name the host environment variable containing the access token.');
 connections[alias]={portalId:capture.id(c.portalId),tokenEnv:c.tokenEnv,plan:capture.plan(c.plan)};}
 return {schema:value.schema,connections};
}
async function responseBytes(r){const chunks=[];let total=0,reader=r.body?.getReader();need(reader,'HUBSPOT_EMPTY','HubSpot returned no response body.',502);
 try{for(;;){const n=await reader.read();if(n.done)break;total+=n.value.length;need(total<=16*1024*1024,'HUBSPOT_RESPONSE_SIZE','One HubSpot page exceeded 16 MiB.',502);chunks.push(n.value);}}
 catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}return Buffer.concat(chunks);}
export function attachHubSpot({directory,workspaceId,guard,current,save,fetchImpl=fetch,environment=process.env,clock=()=>new Date().toISOString()}){
 const root=join(directory,'hubspot-captures');
 let lastRequest=0;
 async function roots(){await guard();await privateDirectory(root,{create:true});}
 async function dir(id){capture.key(id);await roots();const path=join(root,id);await privateDirectory(path);await privateDirectory(join(path,'responses'));return path;}
 async function config(){await guard();return configuration((await readJSON(join(directory,'hubspot.json'),1024*1024)).value);}
 async function read(id){const path=await dir(id),a=(await readJSON(join(path,'capture.json'))).value;need(a.sha256===capture.digest(a.capture),'HUBSPOT_CAPTURE_CHANGED','The retained capture checkpoint differs.',409);capture.validate(a.capture);need(a.capture.id===id&&a.capture.workspaceId===workspaceId,'HUBSPOT_CAPTURE_ID','The capture belongs to another workspace.',409);return a.capture;}
 async function write(s){const path=await dir(s.id);capture.validate(s);await guard();await writeJSON(join(path,'capture.json'),{sha256:capture.digest(s),capture:s},{replace:true});}
 async function configured(s){const c=(await config()).connections[s.connection];need(c&&c.portalId===s.portalId&&capture.digest(c.plan)===s.planSha256,'HUBSPOT_PLAN_CHANGED','The host connection or original capture scope changed. Restore that original declaration or start a new capture.',409);
 const token=environment[c.tokenEnv];need(typeof token==='string'&&token.length>10&&!/[\r\n]/.test(token),'HUBSPOT_TOKEN','Set the declared access token on the host process before capture.');return token;}
 async function request(s,req,token){
 await guard();await wait(Math.max(0,1000-(Date.now()-lastRequest)));lastRequest=Date.now();
 const startedAt=clock();let response,bytes;
 try{response=await fetchImpl('https://api.hubapi.com'+req.path,{method:req.method,headers:{authorization:'Bearer '+token,accept:'application/json',...(req.body?{'content-type':'application/json'}:{})},body:req.body?JSON.stringify(req.body):undefined,redirect:'error',signal:AbortSignal.timeout(45000)});bytes=await responseBytes(response);}
 catch(e){throw Object.assign(new Error('HubSpot transport did not complete; the original cursor remains retained. '+(e.code||e.name||'transport')),{code:'HUBSPOT_TRANSPORT',status:502});}
 const finishedAt=clock(),raw={schema:'crm-migration.hubspot-response.v1',captureId:s.id,workspaceId,portalId:s.portalId,request:req,startedAt,finishedAt,status:response.status,headers:Object.fromEntries(['content-type','retry-after','x-hubspot-correlation-id','x-hubspot-ratelimit-remaining','x-hubspot-ratelimit-daily-remaining'].map(n=>[n,response.headers.get(n)]).filter(([,v])=>v!==null)),bodyBytes:bytes.length,bodySha256:sha(bytes),bodyBase64:bytes.toString('base64')};
 const text=json(raw),hash=sha(Buffer.from(text)),path=await dir(s.id);await guard();await writeJSON(join(path,'responses',hash+'.json'),raw);
 const receipt={sha256:hash,bodySha256:raw.bodySha256,kind:req.kind,at:finishedAt,status:response.status};
 if(response.status!==200){let retry=0;const value=raw.headers['retry-after'];if(value){const seconds=Number(value);retry=Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(value)-Date.now());}
 if(response.status===429&&!retry)retry=60000;
 throw Object.assign(new Error('HubSpot returned HTTP '+response.status+'. The complete response is retained.'),{code:'HUBSPOT_HTTP',status:502,receipt,notBefore:retry?new Date(Date.now()+retry).toISOString():null});}
 let data;try{data=JSON.parse(decode(bytes));}catch{throw Object.assign(new Error('HubSpot response is not complete UTF-8 JSON; original bytes retained.'),{code:'HUBSPOT_RESPONSE',status:502,receipt});}
 return {data,receipt};
 }
 async function names(){await roots();return (await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort();}
 async function status(id){const s=await read(id);let adoption;try{adoption=(await readJSON(join(await dir(id),'adoption.json'))).value;}catch(e){if(e.code!=='ENOENT')throw e;}
 return {...capture.summary(s),adoption:adoption?{baseSha256:adoption.baseSha256,requestSha256:capture.digest(adoption),operationIds:adoption.operations.map(o=>o.id)}:null};}
 async function start({id,connection}){
 capture.key(id);capture.key(connection);await roots();const c=(await config()).connections[connection];need(c,'HUBSPOT_CONNECTION','Choose a declared HubSpot connection.');
 let existing;try{existing=await read(id);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(existing){need(existing.connection===connection&&existing.portalId===c.portalId&&existing.planSha256===capture.digest(c.plan),'HUBSPOT_CAPTURE_CONFLICT','That capture ID already names a different original scope.',409);return status(id);}
 const path=join(root,id);await privateDirectory(path,{create:true});await privateDirectory(join(path,'responses'),{create:true});
 const s=capture.create({captureId:id,connection,portalId:c.portalId,workspaceId,plan:c.plan,at:clock()});await write(s);return status(id);
 }
 async function advance({id,expectedSha256}){
 let s=await read(id);need(capture.digest(s)===expectedSha256,'HUBSPOT_CAPTURE_CHANGED','Reload the current saved capture before advancing.',409);
 if(s.phase==='complete')return status(id);
 need(!s.notBefore||Date.parse(s.notBefore)<=Date.now(),'HUBSPOT_RETRY_AT','Wait until '+s.notBefore+' before resuming the original request.',429);
 try{
 const token=await configured(s),account=await request(s,ACCOUNT,token);
 need(capture.id(account.data.portalId)===s.portalId,'HUBSPOT_ACCOUNT_CHANGED','The access token belongs to a different HubSpot account.',409);
 s.accepted.push(account.receipt);
 const req=capture.request(s),response=await request(s,req,token);
 s=capture.accept(s,req,response.data,response.receipt,clock());s.notBefore=new Date(Date.now()+1000).toISOString();await write(s);return status(id);
 }catch(e){s={...s,revision:s.revision+1,updatedAt:clock(),lastError:{code:e.code||'HUBSPOT_CONTRACT',message:e.message,receipt:e.receipt||null},notBefore:e.notBefore||null};await write(s);return status(id);}
 }
 async function files(id){
 const s=await read(id),path=await dir(id),out={'capture.json':json({sha256:capture.digest(s),capture:s}),'README.txt':'HubSpot read-only capture. Records were read over the recorded start/end window, not an atomic database snapshot. The complete configured active-record scope and each original response are retained. Missing and null values become empty CSV cells; the response originals retain that distinction. Preserve this archive with the migration workspace.\n'};
 for(const entry of await readdir(join(path,'responses'),{withFileTypes:true})){need(entry.isFile()&&/^[a-f0-9]{64}\.json$/.test(entry.name),'HUBSPOT_RESPONSE_FILE','Unexpected capture response member.');const r=await readBytes(join(path,'responses',entry.name));need(r.sha256===entry.name.slice(0,-5),'HUBSPOT_RESPONSE_CHANGED','An original retained response changed.',409);const v=JSON.parse(decode(r.bytes)),body=Buffer.from(v.bodyBase64,'base64');need(body.length===v.bodyBytes&&sha(body)===v.bodySha256,'HUBSPOT_BODY_CHANGED','Original response bytes differ.',409);out['responses/'+entry.name]=decode(r.bytes);}
 let replay=capture.create({captureId:s.id,connection:s.connection,portalId:s.portalId,workspaceId,plan:s.plan,at:s.startedAt});
 for(const receipt of s.accepted){
 const text=out['responses/'+receipt.sha256+'.json'];need(text,'HUBSPOT_RESPONSE_MISSING','An accepted original response is missing.',409);const raw=JSON.parse(text);
 need(raw.captureId===s.id&&raw.workspaceId===workspaceId&&raw.portalId===s.portalId&&raw.status===200&&raw.bodySha256===receipt.bodySha256,'HUBSPOT_RESPONSE_BINDING','An accepted response does not belong to this original capture.',409);
 const value=JSON.parse(decode(Buffer.from(raw.bodyBase64,'base64')));
 if(raw.request.kind==='account')need(capture.id(value.portalId)===s.portalId,'HUBSPOT_ACCOUNT_CHANGED','Retained account identity differs.',409);
 else replay=capture.accept(replay,raw.request,value,receipt,receipt.at);
 }
 for(const key of ['phase','objectIndex','familyIndex','after','seenCursors','properties','labels','objects','associations','queue'])need(capture.digest(replay[key])===capture.digest(s[key]),'HUBSPOT_REPLAY_CHANGED','The capture differs from its complete accepted original response replay.',409);
 if(s.phase==='complete')for(const [name,value]of Object.entries(capture.outputs(s)))out['derived/'+name]=value;
 try{out['adoption.json']=decode((await readBytes(join(path,'adoption.json'))).bytes);}catch(e){if(e.code!=='ENOENT')throw e;}
 return out;
 }
 async function adopt({id,expectedSha256,baseSha256,actor,at}){
 const s=await read(id);need(capture.digest(s)===expectedSha256&&s.phase==='complete','HUBSPOT_CAPTURE_CHANGED','Select the exact completed capture.',409);await files(id);
 let saved;const path=join(await dir(id),'adoption.json');
 try{saved=(await readJSON(path)).value;}catch(e){if(e.code!=='ENOENT')throw e;}
 let ws=await current();
 if(!saved){
 need(baseSha256===runtime.comparison.digest(ws),'CRM_BASE_CHANGED','Reload the current workspace before first adoption.',409);
 const operations=Object.entries(capture.outputs(s)).map(([filename,content],i)=>({id:'hubspot-'+id+'-'+filename.slice(0,-4),actor,at,expected_revision:ws.revision+i,kind:'ingest',payload:{id:'hubspot-'+id+'-'+filename.slice(0,-4),filename,content,role:'target',edition:id,origin:'HubSpot portal '+s.portalId+'; capture '+id+'; capture SHA '+expectedSha256+'; window '+s.startedAt+' to '+s.completedAt,delimiter:','}}));
 saved={schema:'crm-migration.hubspot-adoption.v1',captureId:id,captureSha256:expectedSha256,workspaceId,baseSha256,actor,at,operations};
 // Validate every operation before retaining one complete transaction request.
 let trial=ws;for(const op of operations)trial=runtime.workspace.apply(trial,op);
 await guard();await writeJSON(path,saved);
 }else need(saved.captureSha256===expectedSha256&&saved.workspaceId===workspaceId&&saved.baseSha256===baseSha256&&saved.actor===actor&&saved.at===at,'HUBSPOT_ADOPTION_REQUEST','Recover the exact original adoption request, including original actor, time and base SHA.',409);
 const matches=saved.operations.map(op=>ws.operations.find(x=>x.id===op.id));
 if(matches.every(Boolean)){for(let i=0;i<matches.length;i++)need(runtime.comparison.digest(matches[i].request)===runtime.comparison.digest(saved.operations[i]),'HUBSPOT_ADOPTION_CONFLICT','An original adoption operation differs.',409);return {archive:runtime.workspace.archive(ws),reused:true,operationIds:saved.operations.map(x=>x.id)};}
 need(matches.every(x=>!x)&&runtime.comparison.digest(ws)===saved.baseSha256,'CRM_BASE_CHANGED','The original adoption belongs to a different workspace edition; retain it and resolve the original branch.',409);
 let next=ws;for(const op of saved.operations)next=runtime.workspace.apply(next,op);
 const archive=await save(next);return {archive,reused:false,operationIds:saved.operations.map(x=>x.id)};
 }
 return {
 async configure(value){const c=configuration(value);await guard();await writeJSON(join(directory,'hubspot.json'),c,{replace:true});return {connections:Object.keys(c.connections)};},
 async list(){let c;try{c=await config();}catch(e){if(e.code!=='ENOENT')throw e;c={connections:{}};}return {connections:Object.entries(c.connections).map(([connection,v])=>({connection,portalId:v.portalId,plan:v.plan})),captures:await Promise.all((await names()).map(status))};},
 status,start,advance,adopt,files,
 async allFiles(){const out={};for(const id of await names())for(const [path,content]of Object.entries(await files(id)))out['hubspot-captures/'+id+'/'+path]=content;return out;},
 async adoption(id){try{return (await readJSON(join(await dir(id),'adoption.json'))).value;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 };
}
