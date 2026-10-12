// MIT. Authenticated loopback operator over the original private workspace.
import { createServer } from 'node:http';
import { open, lstat, rename, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { openCouchdbWorkspace } from './operator.mjs';
import { need, only, object, UUID, HASH, MAX_BODY, integer, bytes, digest, identity, privateDirectory, readPrivate, readJson, retainJSON, atomicJson, syncDirectory, exists, safeIssue } from './common.mjs';
export const COUCHDB_STARTUP_SCHEMA='stellar-forge.couchdb-workspace-startup.v1';
const ASSETS=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
const UPLOAD_MAX=8*1024**3+16*1048576;
const decode=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
const safeHeaders={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
async function requestJSON(req,maximum=MAX_BODY){
  need(/^application\/json(?:;|$)/i.test(req.headers['content-type']??''),'COUCHDB_JSON_REQUIRED',undefined,415);
  const declared=req.headers['content-length'];
  if(declared!==undefined)need(/^\d+$/.test(declared)&&Number(declared)<=maximum,'COUCHDB_REQUEST_TOO_LARGE',undefined,413);
  const parts=[];let size=0;
  for await(const part of req){size+=part.length;need(size<=maximum,'COUCHDB_REQUEST_TOO_LARGE',undefined,413);parts.push(part);}
  const value=decode(Buffer.concat(parts,size));need(object(value),'COUCHDB_JSON_OBJECT_REQUIRED');return value;
}
function stable(a,b){return ['dev','ino','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);}
async function pinnedFile(path,maximum=UPLOAD_MAX){
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await handle.stat({bigint:true}),named=await lstat(path,{bigint:true});
    need(before.isFile()&&before.nlink===1n&&!(before.mode&0o077n)&&before.size<=BigInt(maximum)&&stable(before,named),'COUCHDB_PRIVATE_FILE_REQUIRED');
    const hash=createHash('sha256');let offset=0;const buffer=Buffer.allocUnsafe(1048576);
    for(;;){const read=await handle.read(buffer,0,buffer.length,offset);if(!read.bytesRead)break;offset+=read.bytesRead;need(offset<=maximum,'COUCHDB_FILE_TOO_LARGE');hash.update(buffer.subarray(0,read.bytesRead));}
    need(BigInt(offset)===before.size&&stable(before,await handle.stat({bigint:true}))&&stable(before,await lstat(path,{bigint:true})),'COUCHDB_FILE_CHANGED');
    return {handle,before,bytes:offset,sha256:hash.digest('hex')};
  }catch(error){await handle.close();throw error;}
}
export async function startCouchdbWorkspace({directory,expectedWorkspaceId,port=0,connectionFile,environment=process.env}={}){
  integer(port,0,65535);const root=resolve(directory),recordFile=connectionFile??join(root,'connection.json');
  need(resolve(recordFile)===join(root,'connection.json'),'COUCHDB_CONNECTION_FILE_INVALID');
  const model=await openCouchdbWorkspace({directory:root,expectedWorkspaceId,environment});
  const token=randomBytes(32).toString('hex'),instanceId=randomUUID(),inflight=new Map(),requests=new Set();
  let hosts=new Set(),origin,closing,stopping=false;
  function auth(req,{bootstrap=false}={}){
    need(hosts.has(req.headers.host),'COUCHDB_HOST_REQUIRED',undefined,403);
    if(req.headers.origin!==undefined)need(req.headers.origin===origin,'COUCHDB_ORIGIN_REQUIRED',undefined,403);
    const supplied=req.headers['x-workspace-token'];
    need(typeof supplied==='string'&&/^[a-f0-9]{64}$/.test(supplied)&&timingSafeEqual(Buffer.from(token),Buffer.from(supplied)),'COUCHDB_TOKEN_REQUIRED',undefined,403);
    need(bootstrap&&!req.headers['x-couchdb-workspace-id']||req.headers['x-couchdb-workspace-id']===model.identity.id,'COUCHDB_WORKSPACE_CHANGED',undefined,409);
  }
  function send(res,status,data){
    if(res.destroyed||res.writableEnded)return;
    const raw=bytes({workspaceId:model.identity.id,instanceId,data});
    need(raw.length<=MAX_BODY+16384,'COUCHDB_RESPONSE_TOO_LARGE');
    res.writeHead(status,{...safeHeaders,'content-type':'application/json; charset=utf-8','content-length':raw.length});res.end(raw);
  }
  async function uploadState(id){
    need(UUID.test(id??''),'COUCHDB_UPLOAD_ID_REQUIRED');const folder=join(root,'uploads',id);
    if(!await exists(join(folder,'request.json')))return {id,state:'EMPTY',offset:0};
    const request=await readJson(join(folder,'request.json'),4096);
    if(await exists(join(folder,'file.bin'))){
      const file=await pinnedFile(join(folder,'file.bin'));try{
        need(file.sha256===request.sha256&&file.bytes===request.bytes,'COUCHDB_UPLOAD_CHANGED');
        return {id,state:'COMPLETE',offset:file.bytes,bytes:file.bytes,sha256:file.sha256,file:join(folder,'file.bin')};
      }finally{await file.handle.close();}
    }
    let offset=0;
    if(await exists(join(folder,'.body.couchdb-upload'))){const s=await lstat(join(folder,'.body.couchdb-upload'));need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&!(s.mode&0o077),'COUCHDB_UPLOAD_CHANGED');offset=s.size;}
    need(offset<=request.bytes,'COUCHDB_UPLOAD_CHANGED');return {id,state:'RECEIVING',offset,bytes:request.bytes,sha256:request.sha256};
  }
  async function upload(req,url){
    const id=url.searchParams.get('id');need(UUID.test(id??''),'COUCHDB_UPLOAD_ID_REQUIRED');
    need(!inflight.has(id),'COUCHDB_UPLOAD_RUNNING',undefined,409);
    let finish;const done=new Promise(resolve=>{finish=resolve;});inflight.set(id,done);
    try{
      const sha256=url.searchParams.get('sha256'),size=Number(url.searchParams.get('bytes')),offset=Number(url.searchParams.get('offset')??'0');
      need(HASH.test(sha256??''),'COUCHDB_UPLOAD_SHA_REQUIRED');integer(size,0,UPLOAD_MAX);integer(offset,0,size);
      need(/^\d+$/.test(req.headers['content-length']??'')&&Number(req.headers['content-length'])===size-offset,'COUCHDB_UPLOAD_LENGTH_REQUIRED');
      const folder=join(root,'uploads',id);await privateDirectory(folder,true);
      await retainJSON(join(folder,'request.json'),{schema:'stellar-forge.couchdb-upload.v1',id,bytes:size,sha256});
      const state=await uploadState(id);
      if(state.state==='COMPLETE'){req.resume();return state;}
      need(state.offset===offset,'COUCHDB_UPLOAD_OFFSET_CHANGED','Read this saved upload and continue at its original offset.',409);
      const file=await open(join(folder,'.body.couchdb-upload'),constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600);
      let position=offset;
      try{
        const before=await file.stat();need(before.isFile()&&before.nlink===1&&!(before.mode&0o077)&&before.size===offset,'COUCHDB_UPLOAD_CHANGED');
        for await(const part of req){
          need(position+part.length<=size,'COUCHDB_UPLOAD_TOO_LARGE',undefined,413);
          let written=0;while(written<part.length){const step=await file.write(part,written,part.length-written,position+written);need(step.bytesWritten>0,'COUCHDB_UPLOAD_WRITE_FAILED');written+=step.bytesWritten;}position+=part.length;
        }
        await file.sync();
      }finally{await file.close();}
      need(position===size,'COUCHDB_UPLOAD_INCOMPLETE',undefined,409);
      const complete=await pinnedFile(join(folder,'.body.couchdb-upload'));
      try{need(complete.bytes===size&&complete.sha256===sha256,'COUCHDB_UPLOAD_SHA_CHANGED');}finally{await complete.handle.close();}
      await rename(join(folder,'.body.couchdb-upload'),join(folder,'file.bin'));await syncDirectory(folder);
      return uploadState(id);
    }finally{inflight.delete(id);finish();}
  }
  async function download(req,res,selected){
    const mime=selected.mime??'application/octet-stream',filename=String(selected.filename??'download').replace(/[^A-Za-z0-9_.-]/g,'_');
    let start=0,end,handle,original,raw=selected.bytes;
    try{
      let size;
      if(selected.path){const opened=await pinnedFile(selected.path,UPLOAD_MAX);handle=opened.handle;original=opened.before;size=opened.bytes;need(opened.sha256===selected.sha256&&size===selected.bytesLength,'COUCHDB_DOWNLOAD_CHANGED');}
      else{need(Buffer.isBuffer(raw)&&digest(raw)===selected.sha256,'COUCHDB_DOWNLOAD_CHANGED');size=raw.length;}
      end=size-1;let status=200;
      if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);need(match,'COUCHDB_RANGE_INVALID',undefined,416);start=Number(match[1]);end=match[2]?Number(match[2]):size-1;need(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<=end&&end<size,'COUCHDB_RANGE_INVALID',undefined,416);status=206;}
      const length=Math.max(0,end-start+1);
      res.writeHead(status,{...safeHeaders,'content-type':mime,'content-disposition':'attachment; filename="'+filename+'"','accept-ranges':'bytes',
        'content-length':length,'x-content-sha256':selected.sha256,etag:'"'+selected.sha256+'"',...(status===206?{'content-range':'bytes '+start+'-'+end+'/'+size}:{})});
      if(handle){const buffer=Buffer.allocUnsafe(262144);let position=start;
        while(position<=end&&!res.destroyed){const read=await handle.read(buffer,0,Math.min(buffer.length,end-position+1),position);need(read.bytesRead>0,'COUCHDB_DOWNLOAD_CHANGED');position+=read.bytesRead;if(!res.write(Buffer.from(buffer.subarray(0,read.bytesRead))))await Promise.race([once(res,'drain'),once(res,'close')]);}
        need(stable(original,await handle.stat({bigint:true}))&&stable(original,await lstat(selected.path,{bigint:true})),'COUCHDB_DOWNLOAD_CHANGED');
      }else if(length)res.write(raw.subarray(start,end+1));
      res.end();
    }finally{await handle?.close();}
  }
  const server=createServer((req,res)=>{
    requests.add(req);res.once('close',()=>requests.delete(req));
    const work=async()=>{
      need(!stopping,'COUCHDB_WORKSPACE_STOPPING',undefined,503);
      need(hosts.has(req.headers.host),'COUCHDB_HOST_REQUIRED',undefined,403);
      const url=new URL(req.url,origin);
      if(req.method==='GET'&&ASSETS.has(url.pathname)){
        const [name,mime]=ASSETS.get(url.pathname),raw=await readFile(new URL('./public/'+name,import.meta.url));
        res.writeHead(200,{...safeHeaders,'content-type':mime,'content-length':raw.length});res.end(raw);return;
      }
      auth(req,{bootstrap:req.method==='GET'&&url.pathname==='/api/info'});
      if(req.method==='GET'&&url.pathname==='/api/info'){send(res,200,{...await model.query('info'),instanceId,pid:process.pid,connectionFile:recordFile});return;}
      if(req.method==='GET'&&url.pathname==='/api/upload'){send(res,200,await uploadState(url.searchParams.get('id')));return;}
      if(req.method==='PUT'&&url.pathname==='/api/upload'){send(res,200,await upload(req,url));return;}
      if(req.method==='GET'&&url.pathname==='/api/file'){const input=decode(Buffer.from(url.searchParams.get('input')??'{}'));await download(req,res,await model.file(url.searchParams.get('kind'),input));return;}
      if(req.method==='POST'&&url.pathname==='/api/query'){const body=await requestJSON(req);only(body,['name','input'],'COUCHDB_QUERY_INPUT_INVALID');send(res,200,await model.query(body.name,body.input??{}));return;}
      if(req.method==='POST'&&url.pathname==='/api/action'){
        const body=await requestJSON(req);only(body,['workspaceId','id','command','input'],'COUCHDB_ACTION_INPUT_INVALID');
        need(body.workspaceId===model.identity.id&&UUID.test(body.id??''),'COUCHDB_ACTION_IDENTITY_CHANGED');
        send(res,202,await model.start(body.command,body.input??{},{id:body.id}));return;
      }
      if(req.method==='POST'&&url.pathname==='/api/resume'){
        const body=await requestJSON(req,4096);only(body,['id'],'COUCHDB_ACTION_INPUT_INVALID');await model.query('operation',{id:body.id,includeResult:false});
        model.resume(body.id).catch(()=>{});send(res,202,await model.query('operation',{id:body.id,includeResult:false}));return;
      }
      if(req.method==='POST'&&url.pathname==='/api/cancel'){const body=await requestJSON(req,4096);only(body,['id'],'COUCHDB_ACTION_INPUT_INVALID');send(res,200,model.cancel(body.id));return;}
      need(false,'COUCHDB_HTTP_ROUTE_NOT_FOUND',undefined,404);
    };
    work().catch(error=>{
      if(res.headersSent){res.destroy(error);return;}
      const issue=safeIssue(error);try{send(res,issue.status,{error:issue});}catch{res.destroy(error);}
      if(!req.complete)req.resume();
    });
  });
  server.requestTimeout=300000;server.headersTimeout=15000;server.keepAliveTimeout=2000;
  try{
    await new Promise((done,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',done);});
    const assigned=server.address().port;origin='http://127.0.0.1:'+assigned;hosts=new Set(['127.0.0.1:'+assigned]);
    const startup={schema:COUCHDB_STARTUP_SCHEMA,workspaceId:model.identity.id,workspaceIdentitySha256:model.identity.sha256,instanceId,pid:process.pid,stateDirectory:root,
      connectionFile:recordFile,workspace:origin+'/#'+token};
    await atomicJson(root,'connection.json',startup);
    async function close(){
      if(closing)return closing;stopping=true;
      closing=(async()=>{const stopped=new Promise((done,fail)=>server.close(error=>error?fail(error):done()));server.closeAllConnections?.();
        for(const request of requests)request.destroy();
        try{await model.close();await Promise.allSettled([...inflight.values()]);}finally{await stopped;}})();return closing;
    }
    return {model,server,startup,url:startup.workspace,close};
  }catch(error){server.closeAllConnections?.();server.close();await model.close();throw error;}
}
