// SPDX-License-Identifier: MIT
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openWorkspace } from './workspace.mjs';
import { dispatch } from './dispatch.mjs';
import { writeJson } from './io.mjs';

async function receive(request,maximum){
  const parts=[];let size=0;
  for await(const part of request){size+=part.length;if(size>maximum)throw new Error('Request exceeds its complete byte limit');parts.push(part);}
  return Buffer.concat(parts,size);
}
function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
export async function serve({directory,create=false,label,config,port=0,connectionFile}={}){
  const workspace=await openWorkspace(directory,{create,label,config});
  const token=randomBytes(32).toString('base64url'),assets=new Map();
  for(const[name,type]of [['index.html','text/html; charset=utf-8'],['operator.mjs','text/javascript; charset=utf-8'],['reviews.mjs','text/javascript; charset=utf-8'],['style.css','text/css; charset=utf-8']])
    assets.set(name,{body:await readFile(fileURLToPath(new URL('./public/'+name,import.meta.url))),type});
  let serial=Promise.resolve(),origin;
  function json(response,status,value){const body=Buffer.from(JSON.stringify(value));response.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,'Cache-Control':'no-store'});response.end(body);}
  const server=createServer((request,response)=>{
    const handle=async()=>{
      const host=request.headers.host;
      if(host!==new URL(origin).host)throw new Error('Use the original loopback operator address');
      const url=new URL(request.url,origin);
      if(request.headers.origin&&request.headers.origin!==origin)throw new Error('Use the current operator origin');
      const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
      for(const[name,value]of Object.entries(headers))response.setHeader(name,value);
      if(request.method==='GET'&&['/','/operator.mjs','/reviews.mjs','/style.css'].includes(url.pathname)){
        const asset=assets.get(url.pathname==='/'?'index.html':url.pathname.slice(1));
        response.writeHead(200,{'Content-Type':asset.type,'Content-Length':asset.body.length});response.end(asset.body);return;
      }
      if(!equal(request.headers.authorization,'Bearer '+token)){json(response,401,{error:'Open this operator using its original private launch URL'});return;}
      if(request.method==='GET'&&url.pathname==='/api/state'){json(response,200,workspace.state());return;}
      if(request.method==='POST'&&url.pathname==='/api/action'){
        if(!String(request.headers['content-type']).startsWith('application/json'))throw new Error('Use JSON action input');
        const body=JSON.parse((await receive(request,16*1024*1024)).toString('utf8'));
        json(response,200,await dispatch(workspace,body.action,body.input||{},body.operation_id));return;
      }
      if(request.method==='POST'&&url.pathname==='/api/review-return'){
        const body=await receive(request,512*1024*1024);
        json(response,200,await workspace.reviewReceive(url.searchParams.get('operation_id'),body));return;
      }
      if(request.method==='GET'&&url.pathname==='/api/review-return'){
        const value=await workspace.reviewReturnFile(url.searchParams.get('id'));
        response.writeHead(200,{'Content-Type':value.content_type,'Content-Disposition':'attachment; filename="customer-review-return.json"','Content-Length':value.body.length});response.end(value.body);return;
      }
      if(request.method==='GET'&&url.pathname==='/api/project'){
        const body=await workspace.exportProject();response.writeHead(200,{'Content-Type':'application/gzip',
          'Content-Disposition':'attachment; filename="economic-client-project.json.gz"','Content-Length':body.length});response.end(body);return;
      }
      if(request.method==='POST'&&url.pathname==='/api/project'){
        const bytes=await receive(request,512*1024*1024);
        json(response,200,await workspace.importProject(bytes));return;
      }
      if(request.method==='GET'&&['/api/file','/api/companion-file','/api/review-file'].includes(url.pathname)){
        const value=url.pathname==='/api/review-file'?await workspace.reviewFile(url.searchParams.get('id'),url.searchParams.get('name')):url.pathname==='/api/file'?await workspace.file(url.searchParams.get('id'),url.searchParams.get('name')):
          await workspace.companionFile(url.searchParams.get('id'),url.searchParams.get('name'));
        response.writeHead(200,{'Content-Type':value.content_type,'Content-Disposition':'attachment; filename="'+
          String(url.searchParams.get('name')).replace(/[^A-Za-z0-9._-]/g,'_')+'"','Content-Length':value.body.length});response.end(value.body);return;
      }
      json(response,404,{error:'Unknown original workspace route'});
    };
    // All operator actions use the one original project owner; no overlapping
    // revision or source-journal writes are admitted in the same process.
    const next=serial.then(handle);serial=next.catch(()=>{});
    next.catch(error=>{if(!response.headersSent)json(response,400,{error:error.message});else response.destroy(error);});
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  const connection={schema:'tjl.economic-client-connection.v1',base_url:origin,token,project_directory:workspace.directory,
    process_id:process.pid};
  const connectionPath=connectionFile||join(workspace.directory,'connection.json');await writeJson(connectionPath,connection);
  let closing;
  const close=()=>closing??=(async()=>{await new Promise(resolve=>server.close(resolve));await serial;await workspace.close();})();
  return {workspace,server,connection,connectionFile:connectionPath,url:origin+'/#'+token,close};
}
