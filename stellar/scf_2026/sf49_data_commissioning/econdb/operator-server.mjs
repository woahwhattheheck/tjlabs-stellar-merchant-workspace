// MIT. Private loopback operator for the original Econdb workspace.
import {createServer} from 'node:http';
import {readFile,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {operatorStatus,operatorCommand,originalRequest,operatorFiles,operatorFile,preserveFailedCommand,MAX_BODY} from './operator.mjs';
const json=x=>JSON.stringify(x),error=(m,status=400)=>Object.assign(new Error(m),{status});
const MIME={'.json':'application/json','.csv':'text/csv; charset=utf-8','.html':'text/html; charset=utf-8','.md':'text/markdown; charset=utf-8'};
export async function startOperator({directory,port=0}){
 if(!Number.isInteger(port)||port<0||port>65535)throw error('Use an available loopback port');
 await operatorStatus(directory);
 const capability=randomBytes(32).toString('base64url'),cookieName='econdb_'+randomBytes(12).toString('hex');
 const same=x=>typeof x==='string'&&x.length===capability.length&&timingSafeEqual(Buffer.from(x),Buffer.from(capability));
 const assets=new Map(await Promise.all(['operator.html','operator.js','operator.css','maritime-workbench.html'].map(async n=>[n,await readFile(new URL('./'+n,import.meta.url))])));
 let origin,closing=false;const running=new Set();
 async function body(req){if(req.headers['content-type']?.split(';')[0]!=='application/json')throw error('Send application/json',415);
  const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>MAX_BODY)throw error('Complete command exceeds256MiB',413);chunks.push(part)}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}catch(e){if(e.status)throw e;throw error('Supply valid UTF-8 JSON')}
 }
 function send(res,status,value){const b=Buffer.from(json(value));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':b.length});res.end(b)}
 const server=createServer((req,res)=>{const promise=handle(req,res).catch(e=>{if(!res.headersSent)send(res,e.status??e.statusCode??500,{error:e.message,code:e.code??'ECONDB_OPERATOR',...(e.notStarted===true?{notStarted:true}:{})});else res.destroy(e)}).finally(()=>running.delete(promise));running.add(promise)});
 async function handle(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  if(closing)throw error('The original operator is closing',503);
  if(req.headers.host!==new URL(origin).host)throw error('Use the original loopback origin',403);
  if(req.headers.origin&&req.headers.origin!==origin)throw error('Another browser origin cannot use this workspace',403);
  const url=new URL(req.url,origin),path=url.pathname;
  if(req.method==='GET'&&['/','/operator.js','/operator.css'].includes(path)){
   const name=path==='/'?'operator.html':path.slice(1),b=assets.get(name);
   res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Content-Length':b.length});res.end(b);return;
  }
  const bearer=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):null;
  const cookies=Object.fromEntries((req.headers.cookie??'').split(';').map(x=>x.trim().split('=')));
  const fileGet=req.method==='GET'&&['/api/file','/workbench'].includes(path);
  if(!same(bearer)&&!(fileGet&&same(cookies[cookieName])))throw error('Open the original private operator URL to sign in',403);
  if(req.method==='POST'&&path==='/api/session'){await body(req);res.setHeader('Set-Cookie',cookieName+'='+capability+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800');send(res,200,{connected:true});return}
  if(req.method==='GET'&&path==='/api/state'){send(res,200,await operatorStatus(directory));return}
  if(req.method==='GET'&&path==='/api/request'){send(res,200,await originalRequest(directory,url.searchParams.get('id')));return}
  if(req.method==='GET'&&path==='/api/files'){send(res,200,await operatorFiles(directory,url.searchParams.get('id')));return}
  if(req.method==='POST'&&path==='/api/command'){send(res,200,await operatorCommand({directory,request:await body(req)}));return}
  if(req.method==='POST'&&path==='/api/pending/preserve'){const b=await body(req);send(res,200,await preserveFailedCommand({directory,id:b.id,expectedRevision:b.expectedRevision,note:b.note}));return}
  if(req.method==='GET'&&path==='/workbench'){
   const b=assets.get('maritime-workbench.html');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':b.length});res.end(b);return;
  }
  if(req.method==='GET'&&path==='/api/file'){
   const original=await operatorFile(directory,url.searchParams.get('id'),url.searchParams.get('member')),f=await open(original.path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
   const stat=await f.stat({bigint:true});if(!stat.isFile()||stat.size!==BigInt(original.bytes)||stat.nlink!==1n||['dev','ino','mtimeNs','ctimeNs'].some(k=>String(stat[k])!==original.fileIdentity[k])){await f.close();throw error('Original selected file changed',409)}
   const name=original.path.split('/').pop(),ext=name.slice(name.lastIndexOf('.'));
   res.writeHead(200,{'Content-Type':MIME[ext]??'application/octet-stream','Content-Length':original.bytes,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(name),'ETag':'"'+original.sha256+'"'});
   const stream=f.createReadStream({autoClose:true});stream.on('error',e=>res.destroy(e));res.on('close',()=>stream.destroy());stream.pipe(res);return;
  }
  throw error('Unknown original operator route',404);
 }
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
 origin='http://127.0.0.1:'+server.address().port;
 let closePromise=null;
 function close(){if(closePromise)return closePromise;closing=true;closePromise=(async()=>{await new Promise(resolve=>server.close(resolve));await Promise.allSettled([...running])})();return closePromise}
 return{directory,url:origin+'/#'+capability,origin,close,server};
}
