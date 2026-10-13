/** Authenticated loopback operator; every mutation delegates to the original stores. */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {ZARR_ROOT,UUID,HASH,CONNECTION_SCHEMA,CONNECTION_FILENAME,need,fields,sha,encoded,exact,
 safeError,parseExactJson,readJson,writePrivate,fileIdentity,openZarrWorkspace,readZarrConnections,
 publicConnections,bearerMatches,ZarrOperatorError} from './bridge.mjs';
const ASSETS=new Map([['/',['index.html','text/html; charset=utf-8']],['/browser.mjs',['browser.mjs','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
const READ_ACTIONS=new Set(['source','status','target','plan','run','inspect','buyer-offer']);
const WRITE_ACTIONS=new Set(['save-plan','extract','cancel','review','publish','recover','prepare-buyer']);
async function absent(path){try{await fsp.lstat(path);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}
async function body(req){
 const chunks=[];let bytes=0;
 for await(const b of req){bytes+=b.length;need(bytes<=1024*1024,'ZARR_REQUEST_LIMIT','The complete request exceeds 1 MiB',413);chunks.push(b);}
 try{return parseExactJson(Buffer.concat(chunks).toString('utf8'));}catch(error){if(error instanceof ZarrOperatorError)throw error;throw new ZarrOperatorError('ZARR_JSON','Send one complete JSON request');}
}
async function writeOnce(path,value){
 await fsp.mkdir(dirname(path),{recursive:true,mode:0o700});
 const temporary=path+'.retaining-'+randomUUID();await writePrivate(temporary,value);
 try{await fsp.link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;exact((await readJson(path,{maximum:4*1024*1024})).value,value,'The retained original request differs');}
 finally{await fsp.unlink(temporary).catch(()=>{});}
 const dir=await fsp.open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}
}
function subset(expected,actual){
 if(expected===null||typeof expected!=='object')return expected===actual;
 if(Array.isArray(expected))return Array.isArray(actual)&&expected.length===actual.length&&expected.every((v,i)=>subset(v,actual[i]));
 return actual&&typeof actual==='object'&&Object.keys(expected).every(k=>subset(expected[k],actual[k]));
}
export async function startZarrServer({
 directory,connectionsFile,connections,python='python3',sourceDirectory=ZARR_ROOT,sourceSha256=null,port=8471
}){
 need(Number.isInteger(port)&&port>=0&&port<=65535,'ZARR_PORT','Choose a loopback port from 0 to 65535');
 const config=connections??await readZarrConnections(connectionsFile);
 const workspace=await openZarrWorkspace({directory:resolve(directory),python,sourceDirectory,connections:config,owner:true});
 const instanceId=randomUUID(),token=randomBytes(32).toString('hex'),connectionFile=join(workspace.directory,CONNECTION_FILENAME);
 const pending=new Set(),publishers=new Map(),publisherTails=new Map(),transportPending=new Map();
 let server,origin,url,closing=false,closePromise,connectionSha256,runtime;
 try{runtime=await workspace.runtime();}catch(error){await workspace.close();throw error;}
 function track(promise){pending.add(promise);return promise.finally(()=>pending.delete(promise));}
 async function publisher(frozenId){
  need(HASH.test(frozenId),'ZARR_FROZEN_ID','Choose an original reviewed frozen source');
  const frozen=await workspace.frozen(frozenId);
  need(frozen.id===frozenId&&frozen.sourceSha256===frozenId,'ZARR_PUBLISHER_SOURCE','The original frozen source identity changed',409);
  const checked=await fileIdentity(frozen.sourceFile);need(checked.sha256===frozenId&&checked.bytes===frozen.sourceBytes,'ZARR_PUBLISHER_SOURCE','The original reviewed scalar source changed',409);
  if(!publishers.has(frozenId)){
   need(!closing,'ZARR_CLOSING','The original operator is closing',409);
   const promise=(async()=>{
    const {openZarrPublisher}=await import(pathToFileURL(join(workspace.sourceDirectory,'publisher/model.mjs')).href);
    const root=join(workspace.directory,'publishers'),target=join(workspace.directory,'datasets');
    await fsp.mkdir(root,{recursive:true,mode:0o700});await fsp.mkdir(target,{recursive:true,mode:0o700});
    const directory=join(root,frozenId),value=await openZarrPublisher({directory,create:await absent(directory),
     sourceFile:frozen.sourceFile,targetDirectory:join(target,frozenId),environment:process.env,
     seller:config.publisher?.seller??null,resource:config.publisher?.resource??null,relativePaths:true});
    try{
     need(value.reviewRequestVersion===1,'ZARR_PUBLISHER_VERSION','Use the original publisher with durable action request support',409);
     need(!closing,'ZARR_CLOSING','The original operator is closing',409);
     return value;
    }catch(error){
     try{await value.close();}
     catch(closeError){
      const failure=new AggregateError([error,closeError],error.message+'; original publisher startup cleanup failed: '+closeError.message,{cause:error});
      failure.code='ZARR_PUBLISHER_STARTUP_DRAIN';failure.status=500;throw failure;
     }
     throw error;
    }
   })();
   publishers.set(frozenId,promise);
   promise.catch(()=>{if(publishers.get(frozenId)===promise)publishers.delete(frozenId);});
  }
  return publishers.get(frozenId);
 }
 function serializedPublisher(id,callback){
  const prior=publisherTails.get(id)??Promise.resolve(),p=prior.then(callback);
  publisherTails.set(id,p.catch(()=>{}));return p;
 }
 function inspectArguments(action,input){
  const shapes={source:[],status:['options'],target:[],plan:['planId'],run:['runId'],inspect:['runId','query'],'buyer-offer':['runId','query'],
   'save-plan':['plan'],extract:['planId','runId'],cancel:['runId'],review:['runId','review'],publish:['runId','reviewId'],recover:['runId'],'prepare-buyer':['runId','buyer']};
  const optional={status:[],inspect:['runId'],'buyer-offer':['runId']};
  fields(input,shapes[action],optional[action]??shapes[action],'publisher '+action);
  if('runId'in input)need(UUID.test(input.runId),'ZARR_PUBLISHER_RUN','Use the original extraction UUID');
  if('planId'in input)need(Number.isSafeInteger(input.planId)&&input.planId>0,'ZARR_PUBLISHER_PLAN','Use the original numeric plan ID');
  if('query'in input)need(typeof input.query==='string'&&input.query.length<=8192,'ZARR_PUBLISHER_QUERY','Use the reviewed query string');
 }
 async function invoke(pub,action,input,requestId){
  inspectArguments(action,input);
  switch(action){
   case 'source':return pub.source();
   case 'status':return pub.status(input.options??{});
   case 'target':return pub.target();
   case 'plan':return pub.plan(input.planId);
   case 'run':return pub.run(input.runId);
   case 'inspect':return pub.inspect(input.runId,input.query);
   case 'buyer-offer':return pub.buyerOffer(input.runId,input.query??'');
   case 'save-plan':return pub.savePlan(input.plan,{requestId});
   case 'extract':return (pub.startExtraction(input.planId,{id:input.runId})).completion;
   case 'cancel':return pub.cancel(input.runId);
   case 'review':return pub.review(input.runId,{...input.review,requestId});
   case 'publish':return pub.publish(input.runId,input.reviewId);
   case 'recover':return pub.recover(input.runId);
   case 'prepare-buyer':return pub.prepareBuyer(input.runId,{...input.buyer,requestId});
  }
 }
 async function observeTransport(pub,record){
  const {action,input}=record.request;
  if(action==='extract'){
   try{const run=pub.run(input.runId);if(run.plan===input.planId)return {recovered:true,value:run};}
   catch(error){if(error.status!==404)throw error;}
  }
  if(['save-plan','review','prepare-buyer'].includes(action)){
   return {recovered:true,value:await invoke(pub,action,input,record.request.requestId)};
  }
  if(action==='publish'){
   const run=pub.run(input.runId),review=run.data.review;
   if(action==='publish'&&run.state==='PUBLISHED'&&review?.id===input.reviewId)return {recovered:true,value:run};
  }
  return null;
 }
 async function publisherAction(value){
  value=JSON.parse(encoded(value));
  fields(value,['frozenId','action','input','requestId'],['frozenId','action','input'],'publisher action');
  need(READ_ACTIONS.has(value.action)||WRITE_ACTIONS.has(value.action),'ZARR_PUBLISHER_ACTION','Choose an original publisher action');
  inspectArguments(value.action,value.input);
  const pub=await publisher(value.frozenId);
  if(READ_ACTIONS.has(value.action))return invoke(pub,value.action,value.input);
  need(UUID.test(value.requestId??''),'ZARR_REQUEST_ID','Retain one UUID before the publisher request');
  const request={workspaceId:workspace.identity.workspaceId,frozenId:value.frozenId,action:value.action,input:value.input,requestId:value.requestId};
  const digest=sha(encoded(request)),key=value.requestId,active=transportPending.get(key);
  if(active){need(active.digest===digest,'ZARR_REQUEST_CHANGED','This publisher request UUID is already bound',409);return active.promise;}
  const call=async()=>{
   const path=join(workspace.directory,'operator-publisher-requests',key+'.json');let record;
   if(!await absent(path)){
    record=(await readJson(path,{maximum:4*1024*1024})).value;exact(record.request,request,'This UUID binds another original publisher request');
    if(record.state==='COMPLETE')return {...record.response,transportReplayed:true};
    need(record.state!=='CLOSED_UNCONFIRMED','ZARR_PUBLISHER_REQUEST_CLOSED','This original transport request was explicitly closed; use its retained native history',409);
    const observed=await observeTransport(pub,record);
    if(observed){record={...record,state:'COMPLETE',response:observed.value,recoveredFromOriginal:true};await writePrivate(path,record);return {...observed.value,transportReplayed:true};}
    throw new ZarrOperatorError('ZARR_PUBLISHER_OUTCOME_UNKNOWN','This original publisher request has an unrecorded outcome. Inspect its retained plans/run and use the original run recovery; do not issue another copy.',409);
   }
   const unresolved=(await transportHistory()).filter(x=>x.frozenId===value.frozenId&&!['COMPLETE','CLOSED_UNCONFIRMED'].includes(x.state));
   need(!unresolved.length||['recover','cancel'].includes(value.action),'ZARR_PUBLISHER_REQUEST_PENDING','Inspect, reconcile or explicitly close the retained original publisher request before another write',409);
   const status=pub.status({limit:1});
   const before={lastPlanId:status.plans[0]?.id??0,reviewId:null};
   if(value.input.runId&&value.action!=='extract'){try{before.reviewId=pub.run(value.input.runId).data.review?.id??null;}catch(error){if(error.status!==404)throw error;}}
   record={schema:'stellar-forge.zarr-publisher-transport.v1',request,state:'DISPATCHING',before};
   await writeOnce(path,record);
   try{const response=await invoke(pub,value.action,value.input,value.requestId);await writePrivate(path,{...record,state:'COMPLETE',response});return response;}
   catch(error){await writePrivate(path,{...record,state:'OUTCOME_UNKNOWN',error:safeError(error)}).catch(()=>{});throw error;}
  };
  // Cancellation must reach the currently active original extractor.
  const promise=value.action==='cancel'?call():serializedPublisher(value.frozenId,call);
  transportPending.set(key,{digest,promise});
  try{return await promise;}finally{transportPending.delete(key);}
 }
 async function closeTransport({requestId,reason}){
  need(UUID.test(requestId)&&typeof reason==='string'&&reason.trim()&&reason.length<=4000,'ZARR_PUBLISHER_CLOSE','Retain the original request and a reason for closing its unknown transport outcome');
  need(!transportPending.has(requestId),'ZARR_PUBLISHER_REQUEST_ACTIVE','The accepted publisher request is still executing',409);
  const path=join(workspace.directory,'operator-publisher-requests',requestId+'.json'),record=(await readJson(path,{maximum:4*1024*1024})).value;
  need(record.request.workspaceId===workspace.identity.workspaceId,'ZARR_PUBLISHER_BINDING','This request belongs to another original workspace',409);
  if(record.state==='CLOSED_UNCONFIRMED'){need(record.closure.reason===reason.trim(),'ZARR_PUBLISHER_CLOSE_CHANGED','Preserve the original closure reason',409);return record;}
  need(['DISPATCHING','OUTCOME_UNKNOWN'].includes(record.state),'ZARR_PUBLISHER_REQUEST_STATE','Only an unrecorded publisher response can be closed',409);
  const pub=await publisher(record.request.frozenId),observed=pub.status({limit:100});
  need(observed.active===null&&!transportPending.has(requestId),'ZARR_PUBLISHER_REQUEST_ACTIVE','The original publisher still owns an active operation',409);
  const result={...record,state:'CLOSED_UNCONFIRMED',closure:{reason:reason.trim(),originalHistory:observed,nativeDataChanged:false}};
  await writePrivate(path,result);return result;
 }
 async function transportHistory(){
  const root=join(workspace.directory,'operator-publisher-requests');if(await absent(root))return [];
  const result=[];
  for(const name of (await fsp.readdir(root)).sort()){
   if(!/^[a-f0-9-]{36}\.json$/.test(name))continue;
   const record=(await readJson(join(root,name),{maximum:4*1024*1024})).value;
   result.push({requestId:record.request.requestId,frozenId:record.request.frozenId,action:record.request.action,
    input:record.request.input,state:record.state,error:record.error??null,response:record.state==='COMPLETE'?record.response:null});
  }
  return result;
 }
 function json(res,status,value){const raw=Buffer.from(JSON.stringify(value));res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':raw.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(raw);}
 async function sendFile(res,file){
  const handle=await fsp.open(file.path,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
   const s=await handle.stat({bigint:true});
   need(s.isFile()&&String(s.dev)===file.device&&String(s.ino)===file.inode&&s.size===BigInt(file.bytes),'ZARR_FILE_CHANGED','The complete export changed',409);
   res.writeHead(200,{'content-type':'application/zip','content-length':file.bytes,
    'content-disposition':'attachment; filename="'+file.name+'"','x-content-sha256':file.sha256,'cache-control':'no-store','x-content-type-options':'nosniff'});
   const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let offset=0;
   while(offset<file.bytes){
    const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,file.bytes-offset),offset);
    need(bytesRead>0,'ZARR_FILE_CHANGED','The retained export ended early',409);
    hash.update(buffer.subarray(0,bytesRead));offset+=bytesRead;
    if(!res.write(Buffer.from(buffer.subarray(0,bytesRead))))await new Promise((done,fail)=>{
     const clean=()=>{res.off('drain',ready);res.off('error',failed);res.off('close',closed);};
     const ready=()=>{clean();done();},failed=error=>{clean();fail(error);},closed=()=>failed(new Error('Download connection closed'));
     res.once('drain',ready);res.once('error',failed);res.once('close',closed);
    });
   }
   need(hash.digest('hex')===file.sha256,'ZARR_FILE_CHANGED','The complete export hash changed while downloading',409);res.end();
  }finally{await handle.close();}
 }
 async function route(req,res){
  need(req.headers.host===new URL(origin).host,'ZARR_HOST','Use the original loopback host',403);
  const u=new URL(req.url,origin);
  need(u.origin===origin&&!u.username&&!u.password,'ZARR_ORIGIN','Use the original operator origin',403);
  if(req.method==='GET'&&u.pathname==='/api/health')return json(res,200,{ready:!closing,service:'zarr-source-authoring'});
  if(req.method==='GET'&&ASSETS.has(u.pathname)){
   const [name,type]=ASSETS.get(u.pathname),raw=await fsp.readFile(join(workspace.sourceDirectory,'workspace',name));
   res.writeHead(200,{'content-type':type,'content-length':raw.length,'cache-control':'no-store','x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'referrer-policy':'no-referrer'});return res.end(raw);
  }
  need(bearerMatches(req.headers.authorization,token),'ZARR_AUTH','Open the private original operator link',401);
  need(!req.headers.origin||req.headers.origin===origin,'ZARR_ORIGIN','Use the original same-origin operator',403);
  need(!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site']),'ZARR_ORIGIN','Cross-site calls are not accepted',403);
  need(!closing,'ZARR_CLOSING','The original operator is closing; retain the current request',503);
  if(req.method==='POST')need(req.headers.origin===origin&&String(req.headers['content-type']??'').startsWith('application/json'),
   'ZARR_ORIGIN','Use the original same-origin JSON interface',403);
  const op=u.pathname.match(/^\/api\/operations\/([a-f0-9-]{36})$/);
  const result=u.pathname.match(/^\/api\/results\/([a-f0-9]{64})$/);
  const frozen=u.pathname.match(/^\/api\/frozen\/([a-f0-9]{64})$/);
  const file=u.pathname.match(/^\/api\/files\/([a-f0-9-]{36})(\/read)?$/);
  if(req.method==='GET'&&u.pathname==='/api/session')return json(res,200,{schema:'stellar-forge.zarr-operator-session.v1',
   instanceId,pid:process.pid,workspaceId:workspace.identity.workspaceId,workspaceSha256:workspace.identity.sha256,
   workspaceIdentity:workspace.identity,sourceSha256,connections:publicConnections(config),runtime});
  if(req.method==='GET'&&u.pathname==='/api/status')return json(res,200,await workspace.status());
  if(req.method==='GET'&&op)return json(res,200,await workspace.operation(op[1]));
  if(req.method==='GET'&&result)return json(res,200,await workspace.result(result[1],Number(u.searchParams.get('offset')??0),Number(u.searchParams.get('limit')??100)));
  if(req.method==='GET'&&frozen){const value=await workspace.frozen(frozen[1]);return json(res,200,value);}
  if(req.method==='POST'&&u.pathname==='/api/prepare')return json(res,200,await workspace.prepare(await body(req)));
  if(req.method==='POST'&&u.pathname==='/api/apply')return json(res,200,await workspace.apply(await body(req)));
  if(req.method==='POST'&&u.pathname==='/api/resume'){const value=fields(await body(req),['id']);return json(res,200,await workspace.resume(value.id));}
  if(req.method==='POST'&&u.pathname==='/api/export'){const value=fields(await body(req),['id']);return json(res,200,await workspace.export(value.id));}
  if(req.method==='POST'&&u.pathname==='/api/receive'){const value=fields(await body(req),['id','inputId','destinationId']);return json(res,200,await workspace.receive(value));}
  if(req.method==='POST'&&u.pathname==='/api/publisher')return json(res,200,await publisherAction(await body(req)));
  if(req.method==='GET'&&u.pathname==='/api/publisher-requests')return json(res,200,{requests:await transportHistory()});
  if(req.method==='POST'&&u.pathname==='/api/publisher-request/close')return json(res,200,await closeTransport(fields(await body(req),['requestId','reason'])));
  if(req.method==='POST'&&u.pathname==='/api/publisher-request/recover'){
   const input=fields(await body(req),['requestId']);need(UUID.test(input.requestId),'ZARR_REQUEST_ID','Use the retained publisher request UUID');
   const record=(await readJson(join(workspace.directory,'operator-publisher-requests',input.requestId+'.json'),{maximum:4*1024*1024})).value;
   need(record.request.workspaceId===workspace.identity.workspaceId,'ZARR_PUBLISHER_BINDING','The original request selects another workspace',409);
   const {frozenId,action,requestId,input:originalInput}=record.request;
   return json(res,200,await publisherAction({frozenId,action,requestId,input:originalInput}));
  }
  if(req.method==='GET'&&u.pathname==='/api/files'){
   const rows=[];for(const name of await fsp.readdir(join(workspace.directory,'exports')).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){
    if(!/^[a-f0-9-]{36}\.zip$/.test(name))continue;
    const value=await workspace.exportIdentity(name.slice(0,-4));rows.push({id:value.id,name:value.name,bytes:value.bytes,sha256:value.sha256});
   }return json(res,200,{files:rows});
  }
  if(req.method==='GET'&&file){
   const value=await workspace.exportIdentity(file[1]);
   if(!file[2])return sendFile(res,value);
   const offset=Number(u.searchParams.get('offset')??0),limit=Number(u.searchParams.get('limit')??262144);
   need(Number.isSafeInteger(offset)&&offset>=0&&offset<=value.bytes&&Number.isSafeInteger(limit)&&limit>=1&&limit<=1048576,'ZARR_FILE_RANGE','Use an exact byte range of at most 1 MiB');
   const handle=await fsp.open(value.path,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
   try{
    const s=await handle.stat({bigint:true});need(String(s.dev)===value.device&&String(s.ino)===value.inode&&s.size===BigInt(value.bytes),'ZARR_FILE_CHANGED','The original export changed',409);
    const buffer=Buffer.alloc(Math.min(limit,value.bytes-offset)),r=await handle.read(buffer,0,buffer.length,offset);
    need(r.bytesRead===buffer.length,'ZARR_FILE_CHANGED','The exact retained range ended early',409);
    return json(res,200,{file:{id:value.id,name:value.name,bytes:value.bytes,sha256:value.sha256},offset,bytes:buffer.length,
     next:offset+buffer.length<value.bytes?offset+buffer.length:null,sha256:sha(buffer),encoding:'base64',content:buffer.toString('base64')});
   }finally{await handle.close();}
  }
  throw new ZarrOperatorError('ZARR_ROUTE','The original operator route does not exist',404);
 }
 server=http.createServer((req,res)=>{
  const promise=route(req,res).catch(error=>{if(res.headersSent)res.destroy(error);else json(res,error.status??500,safeError(error));});
  void track(promise).catch(()=>{});
 });
 server.requestTimeout=120000;server.headersTimeout=30000;
 async function close(){
  if(closePromise)return closePromise;closing=true;
  closePromise=(async()=>{
   const ended=new Promise((done,fail)=>{if(!server.listening)return done();server.close(error=>error?fail(error):done());server.closeIdleConnections?.();});
   // Native publisher.close aborts its owned extractor and awaits its original writer.
   await Promise.allSettled([...publishers.values()].map(async p=>(await p).close()));
   while(pending.size)await Promise.allSettled([...pending]);
   await workspace.close();await ended;
   try{const current=(await readJson(connectionFile,{privateFile:true})).value;if(current.instanceId===instanceId&&current.token===token)await fsp.unlink(connectionFile);}
   catch(error){if(error.code!=='ENOENT')throw error;}
  })();return closePromise;
 }
 workspace.onOwnerLost=()=>{void close().catch(()=>{});};
 try{
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',done);});
  origin='http://127.0.0.1:'+server.address().port;url=origin+'/#token='+token;
  const connection={schema:CONNECTION_SCHEMA,instanceId,pid:process.pid,workspaceId:workspace.identity.workspaceId,
   workspaceSha256:workspace.identity.sha256,directory:workspace.directory,sourceSha256,connectionsSha256:config.sha256,origin,token};
  connectionSha256=(await writePrivate(connectionFile,connection)).sha256;
  return {server,workspace,instanceId,origin,url,connectionFile,connectionSha256,close,
   withPublisher:(id,callback)=>serializedPublisher(id,async()=>callback(await publisher(id))),
   publisherAction:input=>track(publisherAction(input))};
 }catch(error){await close();throw error;}
}
