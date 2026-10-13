// SPDX-License-Identifier: MIT
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {openCommissioningOperator,CHUNK_LIMIT} from './operator.mjs';
import {readBrowserAssets} from '../../stellar/scf-starforge-20261009/distribution/browser-assets.mjs';
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
const equal=(a,b)=>{const x=Buffer.from(a??''),y=Buffer.from(b??'');return x.length===y.length&&timingSafeEqual(x,y);};
async function body(request,maximum){const chunks=[];let total=0;for await(const chunk of request){total+=chunk.length;if(total>maximum)throw Object.assign(new Error('Request exceeds its complete input limit.'),{status:413,code:'REQUEST_LIMIT'});chunks.push(chunk);}return Buffer.concat(chunks);}
async function json(request){if(!(request.headers['content-type']??'').startsWith('application/json'))throw Object.assign(new Error('Send JSON with application/json.'),{status:415,code:'JSON_REQUIRED'});try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await body(request,1024*1024)));}catch(e){if(e.status)throw e;throw Object.assign(new Error('Send a complete UTF-8 JSON object.'),{status:400,code:'JSON_INVALID'});}}
export async function startCommissioningOperator({directory,store,setupFile,exportDirectory,port=0,operator:supplied}={}){
  if(!Number.isInteger(port)||port<0||port>65535)throw new TypeError('Choose a port from 0 through 65535.');
  const owned=!supplied,operator=supplied??await openCommissioningOperator({directory,store,setupFile,exportDirectory});
  let assets;
  try{const original=await readBrowserAssets(new URL('./browser-assets.json',import.meta.url));assets=new Map(await Promise.all([...original].map(async([route,entry])=>[route,{body:await readFile(entry.url),type:entry.type}])));}
  catch(e){if(owned)try{await operator.close();}catch(c){throw new AggregateError([e,c],'Application assets and owner close both failed.');}throw e;}
  const token=randomBytes(32).toString('base64url'),cookie='commissioning_session='+token;
  let origin,closing=false,closePromise;
  const server=createServer({maxHeaderSize:16384,requestTimeout:30000,headersTimeout:15000,keepAliveTimeout:1000},async(req,res)=>{
    const reply=(status,value,type='application/json; charset=utf-8',extra={})=>{if(res.destroyed)return;res.writeHead(status,{...headers,'content-type':type,...extra});res.end(type.startsWith('application/json')?JSON.stringify(value):value);};
    try{
      if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')return reply(403,{error:'LOCAL_ORIGIN',message:'Use this original local operator address.'});
      const url=new URL(req.url,origin);
      if(req.method==='GET'&&assets.has(url.pathname)){const file=assets.get(url.pathname);return reply(200,file.body,file.type);}
      if(req.method==='GET'&&url.pathname==='/favicon.ico')return reply(204,'','text/plain');
      if(closing)return reply(409,{error:'OPERATOR_CLOSING',message:'The original owner is closing.'});
      if(req.method==='POST'&&url.pathname==='/api/session'){
        const input=await json(req);if(!equal(input.token,token))return reply(401,{error:'SESSION_REQUIRED',message:'Open the exact private session address printed by the foreground command.'});
        return reply(200,{authenticated:true},undefined,{'set-cookie':cookie+'; HttpOnly; SameSite=Strict; Path=/'});
      }
      const cookies=(req.headers.cookie??'').split(';').map(s=>s.trim());
      if(!equal(req.headers.authorization,'Bearer '+token)&&!cookies.some(v=>equal(v,cookie)))return reply(401,{error:'SESSION_REQUIRED',message:'Open the original private session address printed by the command.'});
      if(req.method==='GET'&&url.pathname==='/api/state')return reply(200,await operator.state());
      if(req.method==='GET'&&url.pathname==='/api/history')return reply(200,await operator.history({kind:url.searchParams.get('kind')??'results',offset:Number(url.searchParams.get('offset')??0),limit:Number(url.searchParams.get('limit')??50),...(url.searchParams.has('revision')?{revision:Number(url.searchParams.get('revision'))}:{})}));
      if(req.method==='GET'&&url.pathname==='/api/installation-receivings')return reply(200,await operator.installationReceivings());
      if(req.method==='GET'&&url.pathname==='/api/installation-receiving')return reply(200,await operator.installationReceiving({id:url.searchParams.get('id'),kind:url.searchParams.get('kind')??'summary',offset:Number(url.searchParams.get('offset')??0),limit:Number(url.searchParams.get('limit')??50),expectedSnapshotSha256:url.searchParams.get('snapshotSha256')??undefined}));
      if(req.method==='GET'&&url.pathname==='/api/installations')return reply(200,await operator.installations());
      if(req.method==='GET'&&url.pathname==='/api/installation')return reply(200,await operator.installation({id:url.searchParams.get('id'),kind:url.searchParams.get('kind')??'summary',offset:Number(url.searchParams.get('offset')??0),limit:Number(url.searchParams.get('limit')??50)}));
      if(req.method==='GET'&&url.pathname==='/api/installation/archive'){
        const file=await operator.installationArchive(url.searchParams.get('operationId'));
        res.writeHead(200,{...headers,'content-type':file.contentType,'content-length':file.bytes,'x-content-sha256':file.sha256,'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.filename)});
        await pipeline(createReadStream(file.path),res);return;
      }
      if(req.method==='GET'&&url.pathname==='/api/release')return reply(200,await operator.originalRelease(url.searchParams.get('id')));
      if(req.method==='GET'&&url.pathname==='/api/receive')return reply(200,await operator.receive(url.searchParams.get('operationId')));
      const upload=/^\/api\/uploads\/([a-f0-9-]{36})(\/complete)?$/.exec(url.pathname);
      if(req.method==='POST'&&url.pathname==='/api/uploads')return reply(200,await operator.beginUpload(await json(req)));
      if(upload&&req.method==='GET'&&!upload[2])return reply(200,await operator.uploadState(upload[1]));
      if(upload&&req.method==='PUT'&&!upload[2]){if(req.headers['content-type']!=='application/octet-stream')return reply(415,{error:'BINARY_REQUIRED',message:'Use original binary file chunks.'});return reply(200,await operator.uploadChunk(upload[1],Number(url.searchParams.get('offset')),await body(req,CHUNK_LIMIT)));}
      if(upload&&req.method==='POST'&&upload[2])return reply(200,await operator.completeUpload(upload[1]));
      if(req.method==='POST'&&url.pathname==='/api/requests')return reply(200,await operator.prepare(await json(req)));
      if(req.method==='POST'&&url.pathname==='/api/action')return reply(200,await operator.act(await json(req)));
      if(req.method==='GET'&&url.pathname==='/api/file'){
        const file=await operator.readFile({kind:url.searchParams.get('kind'),id:url.searchParams.get('id'),name:url.searchParams.get('name')??undefined,snapshotSha256:url.searchParams.get('snapshotSha256')??undefined});
        res.writeHead(200,{...headers,'content-type':file.contentType,'content-length':file.bytes,'x-content-sha256':file.sha256,'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.filename).replaceAll("'",'%27')});
        if(file.body)res.end(file.body);else await pipeline(createReadStream(file.path),res);return;
      }
      if(req.method==='GET'&&url.pathname==='/api/archive'){
        const file=await operator.archive(url.searchParams.get('operationId'));
        res.writeHead(200,{...headers,'content-type':file.contentType,'content-length':file.bytes,'x-content-sha256':file.sha256,'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.filename)});
        await pipeline(createReadStream(file.path),res);return;
      }
      return reply(404,{error:'NOT_FOUND',message:'Choose a documented operator action.'});
    }catch(e){if(res.headersSent||res.destroyed){if(!res.writableEnded)res.end();return;}const status=Number.isInteger(e.status)?e.status:e.code==='ENOENT'?404:e instanceof TypeError||e instanceof SyntaxError?400:500;reply(status,{error:e.code??'OPERATOR_FAILED',message:e.message});}
  });
  server.maxRequestsPerSocket=100;
  server.on('clientError',(_e,s)=>s.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  try{await new Promise((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',()=>{server.off('error',no);yes();});});origin='http://127.0.0.1:'+server.address().port;}
  catch(e){if(owned)try{await operator.close();}catch(c){throw new AggregateError([e,c],'Listener and original owner close both failed.');}throw e;}
  return{origin,url:origin+'/#'+token,token,operator,
    close(){if(!closePromise){closing=true;closePromise=(async()=>{const errors=[];try{await new Promise((yes,no)=>{server.close(e=>e?no(e):yes());server.closeIdleConnections?.();});}catch(e){errors.push(e);}try{if(owned)await operator.close();}catch(e){errors.push(e);}if(errors.length)throw new AggregateError(errors,'Listener and original owner close failed.');})();}return closePromise;}
  };
}
