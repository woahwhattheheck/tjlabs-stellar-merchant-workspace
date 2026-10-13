// MIT. Direct managed loopback host for the complete original offline ODR application.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {installedEngine,readJSON,atomic,sha,commitHandover} from './engine.mjs';
const args={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i]?.startsWith('--')||!process.argv[i+1])throw Error('Complete original service arguments required.');args[process.argv[i].slice(2)]=process.argv[i+1];}
const root=path.resolve(args.directory),ctx=await installedEngine(root),i=ctx.installation;
for(const [key,value]of [['installation-id',i.installation_id],['source-identity',i.source_identity],['workspace-id',i.workspace_id]])if(args[key]!==value)throw Error('Original service selection changed: '+key);
const port=Number(args.port||0);if(!Number.isInteger(port)||port<0||port>65535)throw Error('Select an available loopback port.');
const selectedRoot=await fs.lstat(root,{bigint:true});if(selectedRoot.dev.toString()!==args.device||selectedRoot.ino.toString()!==args.inode)throw Error('Original installation directory identity changed.');
const htmlPath=path.join(ctx.edition,'built','ODR_Alpha_Workbench.html'),html=await fs.readFile(htmlPath,'utf8');
const build=await readJSON(path.join(ctx.edition,'BUILD.json'));if(sha(html)!==build.html.sha256)throw Error('Original built application changed.');
const token=randomBytes(32).toString('hex'),cookie=randomBytes(32).toString('hex'),cookieName='odr_'+i.installation_id.replaceAll('-','')+'_'+randomBytes(8).toString('hex');
const equal=(a,b)=>typeof a==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
let origin,tail=Promise.resolve(),closing=false;const active=new Set();
const serial=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
function send(res,status,value,type='application/json',extra={}){
 if(res.destroyed||res.writableEnded)return;
 const text=typeof value==='string'?value:JSON.stringify(value);res.writeHead(status,{'Content-Type':type,'Content-Length':Buffer.byteLength(text),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Connection':'close',...extra});res.end(text);
}
const scriptJSON=v=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
async function installedPage(){
 const current=await readJSON(ctx.currentPath);ctx.engine.validate(current);
 const descriptor={schema:'commons.odr-installed-host.v1',installationId:i.installation_id,sourceIdentity:i.source_identity,initialHandover:current,currentDigest:current.payload_sha256,selectedApplication:{schema:ctx.application.schema,sha256:ctx.engine.applicationDigest,manifest:ctx.application.manifest}};
 const script='<script>window.ODR_INSTALLED=Object.assign('+scriptJSON(descriptor)+',{save:async function(handover,expectedDigest){const r=await fetch("/api/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({handover:handover,expectedDigest:expectedDigest})});const v=await r.json();if(!r.ok){const e=new Error(v.message||"Installed save failed");Object.assign(e,v);throw e;}return v;}});</script>';
 if(!html.includes('<script id="application-source"'))throw Error('Original application has no selected source bootstrap seam.');
 return html.replace('<script id="application-source"',()=>script+'<script id="application-source"');
}
const server=http.createServer((req,res)=>{
 const task=(async()=>{
  if(req.headers.host!==new URL(origin).host)return send(res,421,{code:'ODR_HOST',message:'Select the original loopback host.'});
  const url=new URL(req.url,origin);
  if(url.pathname==='/'&&req.method==='GET'&&url.searchParams.has('key')){
   if(!equal(url.searchParams.get('key'),token))return send(res,403,{code:'ODR_SESSION',message:'Receive the selected original ready URL.'});
   return send(res,303,'','text/plain',{'Location':'/','Set-Cookie':cookieName+'='+cookie+'; HttpOnly; SameSite=Strict; Path=/'});
  }
  const selected=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!equal(selected,cookie))return send(res,403,{code:'ODR_SESSION',message:'Open the selected private application session.'});
  if(req.method==='GET'&&url.pathname==='/'&&!url.search)return send(res,200,await installedPage(),'text/html; charset=utf-8');
  if(req.method==='GET'&&url.pathname==='/api/current')return send(res,200,await readJSON(ctx.currentPath));
  if(req.method==='GET'&&url.pathname==='/healthz')return send(res,200,{schema:'commons.odr-installed-health.v1',installationId:i.installation_id,workspaceId:i.workspace_id,sourceIdentity:i.source_identity});
  if(req.method!=='POST'||url.pathname!=='/api/save')return send(res,404,{code:'ODR_ROUTE',message:'Use the original installed application.'});
  if(closing)return send(res,503,{code:'ODR_CLOSING',message:'The original service is draining saved work.'});
  if(req.headers.origin!==origin||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(res,403,{code:'ODR_ORIGIN',message:'Use the original same-origin application controls.'});
  const chunks=[];let size=0;
  for await(const block of req){size+=block.length;if(size>128*1024*1024)return send(res,413,{code:'ODR_SIZE',message:'The full handover exceeds the declared 128 MiB receiving limit.'});chunks.push(block);}
  const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  if(Object.keys(input).sort().join(',')!=='expectedDigest,handover')return send(res,400,{code:'ODR_FIELDS',message:'Retain the complete original save payload and expected digest.'});
  const receipt=await serial(()=>commitHandover(ctx,input.handover,input.expectedDigest));send(res,200,receipt);
 })().catch(e=>send(res,e.code==='ODR_REVISION_CONFLICT'?409:400,{code:e.code||'ODR_RECEIVING',message:e.message,...(e.currentDigest?{currentDigest:e.currentDigest,currentHandover:e.currentHandover}:{})}));
 active.add(task);task.finally(()=>active.delete(task));
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
origin='http://127.0.0.1:'+server.address().port;
const identity={schema:'stellar-forge.odr-process.v1',pid:process.pid,role:'operator',directory:root,installation_id:i.installation_id,source_identity:i.source_identity,workspace_id:i.workspace_id,device:selectedRoot.dev.toString(),inode:selectedRoot.ino.toString(),ready_file:args['ready-file'],origin,entry_sha256:sha(await fs.readFile(new URL(import.meta.url))),engine_sha256:sha(await fs.readFile(new URL('./engine.mjs',import.meta.url))),application_sha256:ctx.engine.applicationDigest};
const ready={...identity,url:origin+'/?key='+token};const file=await fs.open(args['ready-file'],'wx',0o600);try{await file.writeFile(JSON.stringify(ready)+'\n');await file.sync();}finally{await file.close();}
const dir=await fs.open(path.dirname(args['ready-file']),'r');try{await dir.sync();}finally{await dir.close();}
process.stdout.write(JSON.stringify(identity)+'\n');
async function stop(){if(closing)return;closing=true;server.close();await Promise.allSettled([...active]);await tail;server.closeAllConnections?.();process.exitCode=0;}
process.on('SIGTERM',()=>{void stop();});process.on('SIGINT',()=>{void stop();});
