// MIT. Programme routes share the authenticated original Research listener.
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {QUOTE_REQUEST_LIMIT,QUOTE_CASE_TRANSFER_LIMIT,id,hash,need} from './contracts.mjs';
import {RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK} from './programme-upload.mjs';

const PREFIX='/api/customer-quote-programmes';
function query(url,allowed,numeric=[]){
 const selected={};
 for(const [key,value]of url.searchParams){
  need(allowed.includes(key)&&!Object.hasOwn(selected,key),'RESEARCH_QUOTE_PROGRAMME_QUERY_INVALID');
  if(numeric.includes(key)){
   need(/^(0|[1-9][0-9]{0,15})$/.test(value),'RESEARCH_QUOTE_PROGRAMME_QUERY_INVALID');
   const number=Number(value);need(Number.isSafeInteger(number),'RESEARCH_QUOTE_PROGRAMME_QUERY_INVALID');selected[key]=number;
  }else selected[key]=value;
 }
 return selected;
}
function metadata(value){
 need(value===undefined||value==='true','RESEARCH_QUOTE_PROGRAMME_QUERY_INVALID');return value==='true';
}
async function chunk(req,maximum){
 need(req.headers['content-type']?.split(';')[0].trim()==='application/octet-stream',
  'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CONTENT_TYPE');
 const parts=[];let count=0;
 for await(const value of req){count+=value.length;need(count<=maximum,'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK_LIMIT',413);parts.push(value);}
 need(count>0,'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK_REQUIRED');
 const declared=req.headers['content-length'];
 need(declared===undefined||/^[0-9]+$/.test(declared)&&Number(declared)===count,'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK_CHANGED');
 return Buffer.concat(parts,count);
}
async function output(res,source,headers){
 const name=source.name;need(typeof name==='string'&&name.length>0&&name.length<=512&&
  !/[\u0000-\u001f\u007f/\\]/.test(name),'RESEARCH_QUOTE_PROGRAMME_FILE_INVALID');
 res.writeHead(200,{...headers,'Content-Type':source.contentType??'application/octet-stream',
  'Content-Length':source.bytes,'X-Content-SHA256':source.sha256,
  'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())});
 await pipeline(Readable.from(source.stream),res);
}
function selectedRange(value,bytes){
 if(value===undefined)return null;
 need(typeof value==='string','RESEARCH_QUOTE_PROGRAMME_RANGE_INVALID',416);
 const match=/^bytes=(0|[1-9][0-9]*)-(0|[1-9][0-9]*)$/.exec(value);
 need(match,'RESEARCH_QUOTE_PROGRAMME_RANGE_INVALID',416);
 const start=Number(match[1]),end=Number(match[2]);
 need(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>=start&&end<bytes&&
  end-start+1<=RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK,'RESEARCH_QUOTE_PROGRAMME_RANGE_INVALID',416);
 return {start,end,bytes:end-start+1};
}
async function archiveOutput(req,res,source,headers){
 const range=selectedRange(req.headers.range,source.bytes);
 need(req.headers['if-match']===undefined||req.headers['if-match']==='"'+source.sha256+'"',
  'RESEARCH_QUOTE_PROGRAMME_ARCHIVE_CHANGED',412);
 await source.assertHeld();
 const common={...headers,'Content-Type':'application/gzip','Accept-Ranges':'bytes',
  'X-Content-SHA256':source.sha256,'X-Archive-Bytes':source.bytes,ETag:'"'+source.sha256+'"',
  'Content-Disposition':'attachment; filename="'+source.name+'"'};
 if(range){
  const body=Buffer.allocUnsafe(range.bytes);let count=0;
  while(count<body.length){
   const read=await source.handle.read(body,count,body.length-count,range.start+count);
   need(read.bytesRead>0,'RESEARCH_QUOTE_PROGRAMME_ARCHIVE_CHANGED');count+=read.bytesRead;
  }
  await source.assertHeld();
  res.writeHead(206,{...common,'Content-Length':body.length,
   'Content-Range':'bytes '+range.start+'-'+range.end+'/'+source.bytes,
   'X-Chunk-SHA256':createHash('sha256').update(body).digest('hex')});
  await pipeline(Readable.from([body]),res);return;
 }
 res.writeHead(200,{...common,'Content-Length':source.bytes});
 const stream=Readable.from((async function*(){
  for await(const body of source.handle.createReadStream({autoClose:false,start:0}))yield body;
  await source.assertHeld();
 })());
 await pipeline(stream,res);
}
export async function handleResearchQuoteProgrammeRoute({req,res,url,send,readJson,controller,headers={}}={}){
 if(!url.pathname.startsWith(PREFIX+'/'))return false;
 let dispatched=false;
 try{
  need(controller,'RESEARCH_QUOTE_PROGRAMME_DESK_REQUIRED');
  const path=url.pathname.slice(PREFIX.length);
  if(req.method==='GET'){
   if(path==='/info'){query(url,[]);send(200,await controller.info());return true;}
   if(path==='/jobs'){
    send(200,await controller.jobs(query(url,['offset','limit','snapshot','kind'],['offset','limit'])));return true;
   }
   let match=path.match(/^\/jobs\/([a-f0-9-]{36})$/);
   if(match){id(match[1]);const values=query(url,['result']);
    send(200,await controller.job(match[1],{result:metadata(values.result)}));return true;}
   match=path.match(/^\/jobs\/([a-f0-9-]{36})\/files$/);
   if(match){
    id(match[1]);const values=query(url,['name','metadata']);need(values.name,'RESEARCH_QUOTE_PROGRAMME_FILE_REQUIRED');
    if(metadata(values.metadata))send(200,await controller.fileInfo(match[1],values.name,{job:true}));
    else await controller.streamFile(match[1],values.name,source=>output(res,source,headers),{job:true});return true;
   }
   match=path.match(/^\/programmes\/([a-f0-9-]{36})(?:\/steps\/([a-z0-9][a-z0-9._-]{0,79}))?$/);
   if(match){id(match[1]);query(url,[]);send(200,match[2]?await controller.step(match[1],match[2]):await controller.programme(match[1]));return true;}
   match=path.match(/^\/receiving\/([a-f0-9-]{36})$/);
   if(match){id(match[1]);query(url,[]);send(200,await controller.receiving(match[1]));return true;}
   match=path.match(/^\/bundles\/([a-f0-9-]{36})$/);
   if(match){id(match[1]);const values=query(url,['manifestSha256']);
    send(200,await controller.bundle(match[1],values.manifestSha256));return true;}
   match=path.match(/^\/bundles\/([a-f0-9-]{36})\/files$/);
   if(match){
    id(match[1]);const values=query(url,['name','metadata','offset','limit','snapshot'],['offset','limit']);
    if(values.name!==undefined){
     need(values.offset===undefined&&values.limit===undefined&&values.snapshot===undefined,'RESEARCH_QUOTE_PROGRAMME_QUERY_INVALID');
     if(metadata(values.metadata))send(200,await controller.fileInfo(match[1],values.name));
     else await controller.streamFile(match[1],values.name,source=>output(res,source,headers));
    }else{
     need(values.metadata===undefined,'RESEARCH_QUOTE_PROGRAMME_QUERY_INVALID');
     send(200,await controller.files(match[1],values));
    }
    return true;
   }
   match=path.match(/^\/archives\/([a-f0-9-]{36})$/);
   if(match){id(match[1]);const values=query(url,['metadata']);
    if(metadata(values.metadata))send(200,await controller.archive(match[1]));
    else await controller.streamArchive(match[1],source=>archiveOutput(req,res,source,headers));return true;}
   match=path.match(/^\/uploads\/([a-f0-9-]{36})$/);
   if(match){id(match[1]);query(url,[]);send(200,await controller.upload(match[1]));return true;}
  }
  if(req.method==='POST'){
   query(url,[]);
   if(path==='/jobs'||path==='/jobs/case-transfer'){
    const input=await readJson(req,path.endsWith('/case-transfer')?QUOTE_CASE_TRANSFER_LIMIT+65536:QUOTE_REQUEST_LIMIT+65536);
    if(path.endsWith('/case-transfer'))need(input.kind==='SUBMIT'&&input.command==='prepare-case-transfer',
     'RESEARCH_QUOTE_PROGRAMME_JOB_KIND_REQUIRED');
    dispatched=true;send(202,await controller.submit(input));return true;
   }
   const resume=path.match(/^\/jobs\/([a-f0-9-]{36})\/resume$/);
   if(resume){id(resume[1]);const body=await readJson(req,65536);
    need(body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).length===0,
     'RESEARCH_QUOTE_PROGRAMME_JOB_CHANGED');dispatched=true;send(202,await controller.resume(resume[1]));return true;}
   if(path==='/uploads'){
    const input=await readJson(req,65536);dispatched=true;send(200,await controller.startUpload(input));return true;
   }
   const finish=path.match(/^\/uploads\/([a-f0-9-]{36})\/finish$/);
   if(finish){id(finish[1]);const body=await readJson(req,65536);
    need(body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).length===0,
     'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHANGED');dispatched=true;send(200,await controller.finishUpload(finish[1]));return true;}
  }
  if(req.method==='PUT'){
   const match=path.match(/^\/uploads\/([a-f0-9-]{36})$/);
   if(match){
    id(match[1]);const values=query(url,['offset','sha256'],['offset']);hash(values.sha256);
    need(values.offset!==undefined,'RESEARCH_QUOTE_PROGRAMME_UPLOAD_OFFSET_REQUIRED');
    const body=await chunk(req,RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK);dispatched=true;
    send(200,await controller.appendUpload(match[1],{offset:values.offset,sha256:values.sha256,data:body}));return true;
   }
  }
  send(404,{error:'RESEARCH_QUOTE_PROGRAMME_ROUTE_NOT_FOUND'});return true;
 }catch(error){
  if(res.headersSent){res.destroy(error);return true;}
  const code=/^[A-Z0-9_]{1,140}$/.test(error?.code??'')?error.code:'RESEARCH_QUOTE_PROGRAMME_OPERATION_FAILED',
   outcomeUnknown=typeof error?.outcomeUnknown==='boolean'?error.outcomeUnknown:dispatched;
  const status=Number.isInteger(error.status)?error.status:
   outcomeUnknown?503:/LIMIT|CAPACITY/.test(code)?413:/CHANGED|CONFLICT|BUSY|CLOSING/.test(code)?409:
    /NOT_FOUND|MISSING|ENOENT/.test(code)?404:400;
  send(status,{error:code,...(req.method==='GET'?{}:{outcomeUnknown}),
   ...(error?.researchQuoteProgrammeClose?{closeError:error.researchQuoteProgrammeClose}:{})});return true;
 }
}
