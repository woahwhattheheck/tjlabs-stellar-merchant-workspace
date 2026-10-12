// MIT. Captured handover routes on the original authenticated merchant browser.
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createCapturedHandoverDesk } from './handover-desk.mjs';
import { openCapturedHandoverArchive } from './handover-archive.mjs';
import {
  initializeCapturedHandoverUpload, appendCapturedHandoverUpload,
  inspectCapturedHandoverUpload, finishCapturedHandoverUpload,
} from './handover-upload.mjs';
import { HASH, exact } from './handover-files.mjs';

const PREFIX='/api/captured-handover',PUBLIC='/captured-handover/';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX_BODY=1024*1024,DOWNLOAD_COOKIE='sf_captured_handover';
const STATIC=new Map([
  [PUBLIC,{file:'index.html',type:'text/html; charset=utf-8'}],
  [PUBLIC+'browser.mjs',{file:'browser.mjs',type:'text/javascript; charset=utf-8'}],
  [PUBLIC+'style.css',{file:'style.css',type:'text/css; charset=utf-8'}],
]);
const fail=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
const query=url=>Object.fromEntries(url.searchParams);
const send=(res,status,value)=>{
  if(res.destroyed||res.writableEnded)return;
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(value));
};
const hash=value=>createHash('sha256').update(value).digest('hex');
function equal(left,right) {
  return typeof left==='string'&&typeof right==='string'&&left.length===right.length&&
    timingSafeEqual(Buffer.from(left),Buffer.from(right));
}
async function body(req,{raw=false}={}) {
  const type=String(req.headers['content-type']??'').split(';')[0].trim().toLowerCase();
  if(type!==(raw?'application/octet-stream':'application/json'))
    throw fail('CAPTURED_DESK_CONTENT_TYPE',raw?'Send the original file bytes.':'Send the original JSON request.',415);
  const declared=Number(req.headers['content-length']??0);
  if(!Number.isSafeInteger(declared)||declared<0||declared>MAX_BODY)
    throw fail('CAPTURED_DESK_BODY_LIMIT','Send one file chunk or a complete draft of at most 1 MiB.',413);
  const chunks=[];let size=0;
  for await(const chunk of req) {
    size+=chunk.length;
    if(size>MAX_BODY)throw fail('CAPTURED_DESK_BODY_LIMIT','Send one file chunk or a complete draft of at most 1 MiB.',413);
    chunks.push(chunk);
  }
  const value=Buffer.concat(chunks,size);
  if(raw)return value;
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(value));}
  catch{throw fail('CAPTURED_DESK_JSON','Send the complete original JSON request.');}
}
function range(value,total) {
  if(!value)return {start:0,end:total-1,partial:false};
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);
  if(!match||!match[1]&&!match[2])throw fail('CAPTURED_DESK_RANGE','Choose one retained file byte range.',416);
  let start,end;
  if(!match[1]) {
    const count=Number(match[2]);
    if(!Number.isSafeInteger(count)||count<1)throw fail('CAPTURED_DESK_RANGE','Choose a positive suffix byte count.',416);
    start=Math.max(0,total-count);end=total-1;
  } else {
    start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),total-1):total-1;
  }
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=total||end<start)
    throw fail('CAPTURED_DESK_RANGE','The requested file range is outside the retained archive.',416);
  return {start,end,partial:true};
}
export async function createCapturedHandoverWeb({directory}) {
  const desk=await createCapturedHandoverDesk({directory}),downloads=new Map();
  let closing;
  const navigation={label:'Merchant handover',href:PUBLIC};
  async function caught(res,work) {
    try{return await desk.accept(work);}
    catch(error) {
      if(res.headersSent){res.destroy(error);return;}
      send(res,error.status??(error.code==='ENOENT'?404:409),{
        error:error.message,code:error.code??'CAPTURED_DESK_FAILED',
        ...(error.outcomeUnknown?{outcomeUnknown:true}:{}),
      });
    }
  }
  async function download(req,res,url) {
    const id=url.pathname.slice((PUBLIC+'download/').length);
    if(!UUID.test(id))throw fail('CAPTURED_DESK_DOWNLOAD','Choose the completed original handover.',404);
    const cookie=String(req.headers.cookie??'').split(';').map(value=>value.trim())
      .find(value=>value.startsWith(DOWNLOAD_COOKIE+'='))?.slice(DOWNLOAD_COOKIE.length+1);
    const permission=downloads.get(id);
    if(!permission||permission.expires<=Date.now()||!equal(cookie,permission.nonce))
      throw fail('CAPTURED_DESK_DOWNLOAD','Open Download in the original authenticated workspace again.',401);
    const job=await desk.readJob(id),archive=job.result?.archive;
    if(job.command!=='PUBLISH'||job.state!=='COMPLETE'||!archive||
       archive.sha256!==permission.sha256||archive.bytes!==permission.bytes)
      throw fail('CAPTURED_DESK_DOWNLOAD','The selected original archive changed.',409);
    const original=await openCapturedHandoverArchive({
      path:archive.path,expectedBytes:archive.bytes,expectedSha256:archive.sha256,
    });
    try {
      await original.assertHeld();
      const etag='"'+archive.sha256+'"';
      let selected;
      try{selected=range(req.headers['if-range']&&req.headers['if-range']!==etag?null:req.headers.range,original.bytes);}
      catch(error){res.setHeader('Content-Range','bytes */'+original.bytes);throw error;}
      const length=selected.end-selected.start+1;
      res.setHeader('Content-Type','application/octet-stream');
      res.setHeader('Content-Disposition','attachment; filename="captured-'+job.result.handoverId+'.sfhandover"');
      res.setHeader('Accept-Ranges','bytes');
      res.setHeader('ETag',etag);
      res.setHeader('Content-Length',String(length));
      if(selected.partial)res.setHeader('Content-Range','bytes '+selected.start+'-'+selected.end+'/'+original.bytes);
      res.writeHead(selected.partial?206:200);
      if(req.method==='HEAD'){res.end();return;}
      // The held original descriptor survives path replacement. Positional reads
      // permit resumed downloads without buffering the complete collection.
      async function* chunks() {
        let position=selected.start;
        while(position<=selected.end) {
          await original.assertHeld();
          const buffer=Buffer.alloc(Math.min(256*1024,selected.end-position+1));
          const {bytesRead}=await original.handle.read(buffer,0,buffer.length,position);
          if(!bytesRead)throw fail('CAPTURED_DESK_DOWNLOAD_CHANGED','The retained archive ended during download.',409);
          position+=bytesRead;
          yield bytesRead===buffer.length?buffer:buffer.subarray(0,bytesRead);
        }
        await original.assertHeld();
      }
      res.setTimeout(30000,()=>res.destroy(new Error('Resume the retained handover download.')));
      await pipeline(Readable.from(chunks()),res);
    } finally {await original.close();}
  }
  async function servePublic(req,res,url) {
    if(!url.pathname.startsWith(PUBLIC))return false;
    await caught(res,async()=>{
      const asset=STATIC.get(url.pathname);
      if(asset&&req.method==='GET') {
        res.writeHead(200,{'Content-Type':asset.type});
        res.end(await readFile(new URL('./web/'+asset.file,import.meta.url)));return;
      }
      if(url.pathname.startsWith(PUBLIC+'download/')&&['GET','HEAD'].includes(req.method))
        return download(req,res,url);
      send(res,404,{error:'Not found'});
    });
    return true;
  }
  async function api(req,res,url) {
    if(!url.pathname.startsWith(PREFIX+'/'))return false;
    await caught(res,async()=>{
      const path=url.pathname.slice(PREFIX.length),params=query(url);
      if(req.method==='GET') {
        if(path==='/info')return send(res,200,desk.info());
        if(path==='/inventory')return send(res,200,await desk.inventory());
        if(path==='/drafts')return send(res,200,await desk.listDrafts(params));
        if(path==='/draft')return send(res,200,await desk.readDraft(params));
        if(path==='/jobs')return send(res,200,await desk.listJobs(params));
        if(path==='/job') {exact(params,['id'],['id']);return send(res,200,await desk.readJob(params.id));}
        if(path==='/document')return send(res,200,await desk.jobDocument(params));
        if(path==='/received')return send(res,200,await desk.receivedOperations(params));
        if(path==='/uploads')return send(res,200,await desk.listUploads(params));
        if(path==='/uploads/status') {
          exact(params,['id'],['id']);
          return send(res,200,await inspectCapturedHandoverUpload({root:desk.roots.uploads,id:params.id}));
        }
        return send(res,404,{error:'Not found'});
      }
      if(req.method!=='POST')return send(res,405,{error:'Use GET or POST'});
      if(path==='/uploads/chunk') {
        exact(params,['id','offset','sha256'],['id','offset','sha256']);
        if(!HASH.test(params.sha256))throw fail('CAPTURED_DESK_UPLOAD','Use this original chunk’s SHA-256.');
        const value=await body(req,{raw:true});
        if(hash(value)!==params.sha256)throw fail('CAPTURED_DESK_UPLOAD','The original chunk bytes changed.',409);
        return send(res,200,await appendCapturedHandoverUpload({root:desk.roots.uploads,id:params.id,
          offset:Number(params.offset),bytes:value,sha256:params.sha256}));
      }
      const value=await body(req);
      if(path==='/draft/create')return send(res,200,await desk.createDraft(value));
      if(path==='/draft/save')return send(res,200,await desk.saveDraft(value));
      if(path==='/jobs/start') {
        const job=await desk.startJob(value);return send(res,job.state==='COMPLETE'?200:202,job);
      }
      if(path==='/jobs/resume') {
        const job=await desk.resumeJob(value);return send(res,job.state==='COMPLETE'?200:202,job);
      }
      if(path==='/uploads/init') {
        exact(value,['id','name','bytes','expectedSha256'],['id','name','bytes']);
        return send(res,200,await initializeCapturedHandoverUpload({root:desk.roots.uploads,...value}));
      }
      if(path==='/uploads/finish') {
        exact(value,['id'],['id']);
        return send(res,200,await finishCapturedHandoverUpload({root:desk.roots.uploads,id:value.id}));
      }
      if(path==='/download') {
        exact(value,['id'],['id']);
        const job=await desk.readJob(value.id),archive=job.result?.archive;
        if(job.command!=='PUBLISH'||job.state!=='COMPLETE'||!archive)
          throw fail('CAPTURED_DESK_DOWNLOAD','Publish the complete original handover before downloading it.',409);
        for(const [id,row] of downloads)if(row.expires<=Date.now())downloads.delete(id);
        if(downloads.size>=128&&!downloads.has(value.id))
          throw fail('CAPTURED_DESK_DOWNLOAD_BUSY','Finish an original active download and reopen Download.',409);
        const nonce=randomBytes(32).toString('hex'),path=PUBLIC+'download/'+job.id;
        downloads.set(job.id,{nonce,expires:Date.now()+300000,sha256:archive.sha256,bytes:archive.bytes});
        res.setHeader('Set-Cookie',DOWNLOAD_COOKIE+'='+nonce+'; Path='+path+'; HttpOnly; SameSite=Strict; Max-Age=300');
        return send(res,200,{url:path,bytes:archive.bytes,sha256:archive.sha256});
      }
      send(res,404,{error:'Not found'});
    });
    return true;
  }
  async function close() {
    if(closing)return closing;
    closing=(async()=>{await desk.close();downloads.clear();})();
    return closing;
  }
  return {navigation,servePublic,api,close};
}
