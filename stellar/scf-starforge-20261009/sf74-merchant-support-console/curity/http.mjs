// MIT. Curity provider surface on the original SF74 loopback server.
import {readFile,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {openCurityOperator} from './operator-workspace.mjs';
import {ensure,hash,fields} from './case-io.mjs';

const assets={
 '/curity/':['operator.html','text/html; charset=utf-8'],
 '/curity/operator.mjs':['operator.mjs','text/javascript; charset=utf-8'],
 '/curity/operator.css':['operator.css','text/css; charset=utf-8'],
 '/curity/OPERATOR.md':['OPERATOR.md','text/markdown; charset=utf-8']
};
const send=(res,status,value)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(value)+'\n');};
async function body(req,maximum=2*1024*1024){
 ensure(/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??''),'CONTENT_TYPE','Send JSON for this operation.',415);
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;ensure(size<=maximum,'REQUEST_LIMIT','The selected request is too large.',413);chunks.push(chunk);}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));
}
function query(url,allowed){
 const result={};for(const[k,v]of url.searchParams){ensure(allowed.includes(k)&&!Object.hasOwn(result,k),'QUERY','Select each supported query once.');result[k]=v;}return result;
}
function page(url){const q=query(url,['editionId','after','limit']);for(const k of ['after','limit'])if(q[k]!==undefined){ensure(/^\d+$/.test(q[k]),'PAGE','Use whole-number pages.');q[k]=Number(q[k]);}return q;}
async function download(res,{path,file}){
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const before=await fd.stat({bigint:true});ensure(before.isFile()&&before.size===BigInt(file.bytes),'DOWNLOAD','The selected original file size changed.',409);
  const digest=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);let offset=0;
  for(;;){const got=await fd.read(buffer,0,buffer.length,offset);if(!got.bytesRead)break;digest.update(buffer.subarray(0,got.bytesRead));offset+=got.bytesRead;}
  const after=await fd.stat({bigint:true});ensure(digest.digest('hex')===file.sha256&&['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k]),
    'DOWNLOAD','The complete original file identity changed.',409);
  res.writeHead(200,{'content-type':'application/octet-stream','content-length':String(file.bytes),
    'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name.split('/').at(-1)),
    'x-content-sha256':file.sha256});
  const stream=fd.createReadStream({start:0,autoClose:false});
  try{await new Promise((done,reject)=>{stream.once('error',reject);res.once('error',reject);res.once('finish',done);res.once('close',()=>{stream.destroy();done();});stream.pipe(res);});}
  finally{stream.destroy();}
 }finally{await fd.close();}
}
export function createCurityHttp(controller){
 const active=new Set();let closing=false,closed;
 async function execute(req,res,{origin}){
  const url=new URL(req.url,origin),route=url.pathname;
  if(!(route==='/curity'||route.startsWith('/curity/')||route.startsWith('/api/curity/')))return false;
  res.setHeader('x-curity-workspace',controller.identity);
  ensure(!closing,'CLOSING','The original workspace is closing.',503);
  ensure((!req.headers.origin||req.headers.origin===origin)&&
   (!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site']))&&
   (['GET','HEAD'].includes(req.method)||req.headers.origin===origin),'ORIGIN','Use this original local workspace.',403);
  if(route==='/curity'&&req.method==='GET'){res.writeHead(302,{location:'/curity/'});res.end();return true;}
  if(Object.hasOwn(assets,route)){
   ensure(req.method==='GET'&&!url.search,'METHOD','Use the selected operator page.',405);
   const [file,mime]=assets[route];res.writeHead(200,{'content-type':mime});res.end(await readFile(new URL(file,import.meta.url)));return true;
  }
  if(req.method==='GET'){
   let result;
   if(route==='/api/curity/state'){query(url,[]);result=await controller.state();}
   else if(route==='/api/curity/events')result=await controller.source.events(page(url));
   else if(route==='/api/curity/findings')result=await controller.source.findings(page(url));
   else if(route==='/api/curity/manifest'){const q=query(url,['editionId']);result=await controller.source.manifest(q.editionId);}
   else if(route==='/api/curity/operation'){const q=query(url,['operationId']);result={plan:await controller.bridge.read(q.operationId),applied:await controller.bridge.result(q.operationId)};}
   else if(route==='/api/curity/compare'){const q=query(url,['operationId']);result=await controller.bridge.compare({operationId:q.operationId});}
   else if(route==='/api/curity/comparison')result=await controller.comparison(query(url,['comparisonId']));
   else if(route==='/api/curity/comparison-file'){await download(res,await controller.comparisonFile(query(url,['comparisonId','name'])));return true;}
   else if(route==='/api/curity/source-file'){await download(res,await controller.source.file(query(url,['editionId','sourceId'])));return true;}
   else if(route==='/api/curity/package-file'){await download(res,await controller.packageFile(query(url,['exportId','name'])));return true;}
   else{send(res,404,{error:'CURITY_ROUTE',message:'This operator route does not exist.'});return true;}
   send(res,200,result);return true;
  }
  ensure(req.method==='POST','METHOD','Use the original operator action.',405);
  const routes={
   '/api/curity/source/compare':x=>controller.compareSource(x),
   '/api/curity/source/prepare':x=>controller.prepareSource(x),
   '/api/curity/source/build':x=>controller.buildSource(x),
   '/api/curity/source/review':x=>controller.freezeReview(x),
   '/api/curity/source/original':async x=>{const r=await controller.source.original(x);return {ref:r.ref,sha256:r.sha256,bytes:r.bytes.length,base64:r.bytes.toString('base64')};},
   '/api/curity/case/prepare':x=>controller.bridge.prepare(x),
   '/api/curity/case/apply':x=>controller.bridge.apply(x),
   '/api/curity/case/rollback':x=>controller.bridge.rollback(x),
   '/api/curity/case/acknowledge':x=>controller.bridge.acknowledge(x),
   '/api/curity/package/export':x=>controller.portable.exportPackage(x),
   '/api/curity/package/prepare':x=>controller.preparePackage(x),
   '/api/curity/package/receive':x=>controller.receivePackage(x)
  };
  let result;
  if(route==='/api/curity/source/upload'){
   const q=query(url,['inputId','index']);ensure(/^\d+$/.test(q.index??''),'SOURCE_FILE','Select the original upload index.');
   result=await controller.uploadSource({...q,index:Number(q.index),stream:req});
  }else if(route==='/api/curity/package/upload'){
   const q=query(url,['inputId','name']);result=await controller.uploadPackage({...q,stream:req});
  }else{
   ensure(Object.hasOwn(routes,route),'ROUTE','This operator action does not exist.',404);query(url,[]);
   result=await routes[route](await body(req,route==='/api/curity/package/prepare'?65*1024*1024:2*1024*1024));
  }
  send(res,200,result);return true;
 }
 return Object.freeze({
  handle(req,res,context){
   const route=(req.url??'').split('?')[0];if(!(route==='/curity'||route.startsWith('/curity/')||route.startsWith('/api/curity/')))return Promise.resolve(false);
   const task=execute(req,res,context).catch(error=>{
    if(res.headersSent){res.destroy(error);return true;}
    const status=Number(error.status)||(error instanceof SyntaxError||error instanceof TypeError?422:503);
    send(res,status,{error:error.code??'CURITY_OPERATION',message:String(error.message).slice(0,1600)});return true;
   });
   active.add(task);task.finally(()=>active.delete(task));return task;
  },
  close(){return closed??=(async()=>{closing=true;await Promise.allSettled([...active]);await controller.close();})();}
 });
}
export async function startCurityConsole({directory,applicationFiles,...options}={}){
 const {start}=await import('../server.mjs');
 return start({...options,providerExtensionFactory:async host=>{
  const controller=await openCurityOperator({...host,directory,applicationFiles,
   python:host.environment.SCF_PYTHON??'python3'});
  return {...createCurityHttp(controller),controller};
 }});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  ensure(process.argv.length===4&&process.argv[2]==='--config','CONFIG','Use --config /absolute/private/config.json.');
  const config=JSON.parse(await readFile(resolve(process.argv[3]),'utf8'));
  fields(config,['directory','applicationFiles','casesDir','sourceDir','packageDir','handoffSources','incidentSources','port','allowLoopback']);
  const server=await startCurityConsole(config);let stopping=false;
  const stop=()=>{if(!stopping){stopping=true;void server.close().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});}};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  process.stdout.write(JSON.stringify({url:server.url+'curity/',mode:'ORIGINAL_SF74_CURITY_OPERATOR'})+'\n');
 }catch(error){process.stderr.write('Curity: '+error.message+'\n');process.exitCode=1;}
}
