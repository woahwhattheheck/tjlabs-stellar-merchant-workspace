import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createReadStream, statSync } from 'node:fs';
import { once } from 'node:events';
import { readBrowserAssets } from '../../distribution/browser-assets.mjs';
import { assert, RozoError, integer, digest, canonical } from './model.mjs';
import { deliveryDescriptor } from './delivery.mjs';

const FILES=await readBrowserAssets(new URL('./browser-assets.json',import.meta.url));
const CSP="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
function number(value,fallback){if(value===null)return fallback;assert(/^\d+$/.test(value),'INTEGER','Use a whole nonnegative page value.');return Number(value);}
function equal(a,b){const x=Buffer.from(a??''),y=Buffer.from(b??'');return x.length===y.length&&timingSafeEqual(x,y);}
async function body(request,max=40*1024*1024){const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;assert(size<=max,'BODY_LIMIT','The full original request exceeds the selected limit.',413);chunks.push(chunk);}return Buffer.concat(chunks);}
function headers(response,type='application/json; charset=utf-8'){
  response.setHeader('Content-Type',type);response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('Content-Security-Policy',CSP);
}
function send(response,status,value){const bytes=Buffer.from(JSON.stringify(value));headers(response);response.writeHead(status,{'Content-Length':bytes.length});response.end(bytes);}
function filename(value){return String(value??'source.bin').replace(/[^A-Za-z0-9._-]/g,'_').slice(0,180);}
function range(request,size){
  const header=request.headers.range;if(!header)return {start:0,end:size-1,status:200};
  const m=/^bytes=(\d+)-(\d*)$/.exec(header);assert(m,'RANGE','Use one explicit byte range.',416);
  const start=Number(m[1]),end=m[2]?Number(m[2]):size-1;
  assert(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<size&&end>=start&&end<size,'RANGE','Requested bytes are outside the original file.',416);
  return {start,end,status:206};
}
export async function startRozoServer({service,host='127.0.0.1',port=0,sessionToken=randomBytes(32).toString('hex')}){
  assert(host==='127.0.0.1','LISTENER_HOST','The operator binds its private loopback listener. Forward signed callbacks through your existing TLS ingress.');
  integer(port,'port',0,65535);let origin;const tickets=new Map();
  const server=createServer(async(request,response)=>{
    try{
      const expected=new URL(origin).host;assert(request.headers.host===expected,'HOST','Use the original loopback host.',400);
      let url=new URL(request.url,origin),path=url.pathname;const method=request.method;
      if(path.startsWith('/download/')){
        const ticket=tickets.get(path.slice('/download/'.length));assert(ticket&&ticket.expires>Date.now()&&method==='GET','DOWNLOAD_TICKET','This exact private download link expired; request it again from the original workspace.',404);
        url=new URL(ticket.path,origin);path=url.pathname;request.headers['x-rozo-session']=sessionToken;
      }
      if(path.startsWith('/callbacks/')){
        assert(method==='POST','METHOD','Callbacks use POST.',405);const profile=decodeURIComponent(path.slice('/callbacks/'.length));assert(!profile.includes('/'),'PROFILE','Select one original callback profile.');
        const bytes=await body(request,32*1024*1024),result=service.callback(profile,{rawBody:bytes,headers:request.headers});send(response,result.state==='conflict'?409:200,result);return;
      }
      if(path.startsWith('/api/')){
        assert(equal(String(request.headers['x-rozo-session']??''),sessionToken),'SESSION','Open this workspace from its current private session link.',401);
        assert(!request.headers.origin||request.headers.origin===origin,'ORIGIN','The original operator session must use its selected origin.',403);
        const parts=path.split('/').filter(Boolean).map(decodeURIComponent),q=url.searchParams,w=service.workspace;
        if(method==='GET'){
          if(path==='/api/state'){send(response,200,service.state({profileId:q.get('profileId')||null,offset:number(q.get('offset'),0),limit:number(q.get('limit'),100),query:q.get('query')??'',status:q.get('status')||null,unresolved:q.get('unresolved')==='true'}));return;}
          if(path==='/api/finance/state'){send(response,200,await service.finance.state());return;}
          if(path==='/api/requests'){send(response,200,w.requests({offset:number(q.get('offset'),0),limit:number(q.get('limit'),100)}));return;}
          if(parts[1]==='requests'&&parts.length===3){send(response,200,service.requestStatus(parts[2]));return;}
          if(parts[1]==='payments'&&parts.length===4){send(response,200,service.payment(parts[2],parts[3]));return;}
          if(parts[1]==='records'&&parts.length===5&&parts[4]==='history'){send(response,200,{workspaceId:w.meta().workspaceId,kind:parts[2],id:parts[3],editions:w.history(parts[2],parts[3])});return;}
          if(parts[1]==='contracts'&&parts.length===3){send(response,200,service.contracts(parts[2]));return;}
          if(path==='/api/captures'){send(response,200,w.captures({profileId:q.get('profileId')||undefined,offset:number(q.get('offset'),0),limit:number(q.get('limit'),100)}));return;}
          if(parts[1]==='captures'&&parts.length===3){const value=w.getCapture(parts[2]);assert(value,'SOURCE_MISSING','The retained source capture is absent.',404);send(response,200,value);return;}
          if(parts[1]==='reports'&&parts.length===3){const value=w.get('report',parts[2]);assert(value,'REPORT_MISSING','The retained report is absent.',404);send(response,200,value);return;}
          if(path==='/api/compare'){send(response,200,service.compare(q.get('before'),q.get('after')));return;}
          if(path==='/api/audit'){send(response,200,w.audit({offset:number(q.get('offset'),0),limit:number(q.get('limit'),100)}));return;}
          if(parts[1]==='objects'&&parts.length===3){
            const hash=parts[2],descriptor=w.bytes(hash,{offset:0,length:1}),selected=range(request,descriptor.bytes),length=selected.end-selected.start+1;
            headers(response,descriptor.type);response.setHeader('Content-Disposition','attachment; filename="'+filename(q.get('name'))+'"');response.setHeader('ETag','"'+hash+'"');response.setHeader('X-Content-SHA256',hash);response.setHeader('Accept-Ranges','bytes');
            if(selected.status===206)response.setHeader('Content-Range','bytes '+selected.start+'-'+selected.end+'/'+descriptor.bytes);
            response.writeHead(selected.status,{'Content-Length':length});
            for(let offset=selected.start;offset<=selected.end;){const chunk=w.bytes(hash,{offset,length:Math.min(1024*1024,selected.end-offset+1)});offset+=chunk.length;if(!response.write(chunk.data))await once(response,'drain');}
            response.end();return;
          }
          if(parts[1]==='deliveries'&&parts.length===3){const d=deliveryDescriptor(w,parts[2]);assert(d,'DELIVERY_PENDING','The exact prepared export is not yet complete. Resume the original request.',409);send(response,200,({...d,path:undefined}));return;}
          if(parts[1]==='deliveries'&&parts.length===4&&parts[3]==='file'){
            const d=deliveryDescriptor(w,parts[2]);assert(d,'DELIVERY_PENDING','Resume the original prepared export.',409);assert(statSync(d.path).size===d.bytes,'DELIVERY_SIZE','The saved archive size differs.',409);
            const selected=range(request,d.bytes);headers(response,'application/zip');response.setHeader('Content-Disposition','attachment; filename="'+d.name+'"');response.setHeader('ETag','"'+d.sha256+'"');response.setHeader('X-Content-SHA256',d.sha256);response.setHeader('Accept-Ranges','bytes');
            if(selected.status===206)response.setHeader('Content-Range','bytes '+selected.start+'-'+selected.end+'/'+d.bytes);
            response.writeHead(selected.status,{'Content-Length':selected.end-selected.start+1});const stream=createReadStream(d.path,{start:selected.start,end:selected.end});stream.on('error',()=>response.destroy());response.on('close',()=>stream.destroy());stream.pipe(response);return;
          }
        }
        if(method==='POST'){
          assert(/^application\/json(?:;|$)/i.test(request.headers['content-type']??''),'CONTENT_TYPE','Use the complete JSON operation envelope.',415);
          const raw=await body(request,path.startsWith('/api/finance/')||path==='/api/commands'?128*1024*1024:40*1024*1024);let value;try{value=JSON.parse(raw);}catch{throw new RozoError('JSON','The full original request is not valid JSON.');}
          if(path==='/api/download-ticket'){
            assert(value&&Object.keys(value).length===1&&typeof value.path==='string'&&value.path.startsWith('/api/'),'DOWNLOAD_TARGET','Select one original source or delivery file.');
            const target=new URL(value.path,origin),split=target.pathname.split('/').filter(Boolean).map(decodeURIComponent);let descriptor;
            if(split[1]==='objects'&&split.length===3){const d=w.bytes(split[2],{offset:0,length:1});descriptor={sha256:d.sha256,bytes:d.bytes,name:filename(target.searchParams.get('name'))};}
            else if(split[1]==='deliveries'&&split.length===4&&split[3]==='file'){const d=deliveryDescriptor(w,split[2]);assert(d,'DELIVERY_PENDING','Finish the original prepared archive.',409);descriptor={sha256:d.sha256,bytes:d.bytes,name:d.name};}
            else throw new RozoError('DOWNLOAD_TARGET','Select an original source object or complete archive.');
            for(const [key,ticket]of tickets)if(ticket.expires<Date.now())tickets.delete(key);
            assert(tickets.size<2000,'DOWNLOAD_LIMIT','Finish current downloads before preparing more.',429);
            const ticket=randomBytes(24).toString('hex');tickets.set(ticket,{path:target.pathname+target.search,expires:Date.now()+15*60*1000});
            send(response,200,{...descriptor,url:origin+'/download/'+ticket});return;
          }
          if(path.startsWith('/api/finance/')){
            const finance=service.finance;
            if(path==='/api/finance/report'){send(response,200,finance.report(value));return;}
            if(path==='/api/finance/preview'){send(response,200,await finance.preview(value));return;}
            if(path==='/api/finance/period-preview'){send(response,200,await finance.periodPreview(value));return;}
            if(path==='/api/finance/accountant-preview'){send(response,200,await finance.accountantPreview(value));return;}
            if(path==='/api/finance/buyer-return-preview'){send(response,200,await finance.buyerReturnPreview(value));return;}
            if(path==='/api/finance/read'){send(response,200,await finance.read(value));return;}
            if(path==='/api/finance/file'){
              const file=await finance.file(value),descriptor=w.object(Buffer.from(file.bytes),file.type??'application/octet-stream');
              send(response,200,{...descriptor,name:file.name,path:'/api/objects/'+descriptor.sha256+'?name='+encodeURIComponent(file.name)});return;
            }
          }
          if(path==='/api/commands'){send(response,200,await service.execute(value));return;}
          if(parts[1]==='requests'&&parts.length===4&&parts[3]==='resume'){
            assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>k==='retry')&&(value.retry===undefined||typeof value.retry==='boolean'),'RESUME_INPUT','Resume keeps the original stored input. Only explicit retry may be supplied.');
            send(response,200,await service.resume(parts[2],value));return;
          }
        }
        throw new RozoError('ROUTE','This original operator route is not available.',404);
      }
      const asset=FILES.get(path);
      assert((method==='GET'||method==='HEAD')&&asset,'ROUTE','This operator page does not exist.',404);
      const bytes=await readFile(asset.url);headers(response,asset.type);response.writeHead(200,{'Content-Length':bytes.length});response.end(method==='HEAD'?undefined:bytes);
    }catch(error){
      if(response.headersSent){response.destroy(error);return;}
      send(response,error.status??500,{error:{code:error.code??'OPERATOR_ERROR',message:error.message,details:error.details??{}}});
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  origin='http://'+host+':'+server.address().port;service.startWatchers();
  const m=service.workspace.meta();
  return {server,startup:{schema:'stellar-forge.rozo-payments-server.v1',origin,url:origin+'/#session='+encodeURIComponent(sessionToken),workspaceId:m.workspaceId,originId:m.originId,pid:process.pid,sessionToken,stateEndpoint:origin+'/api/state',sourceIdentity:service.sourceIdentity},
    async close(){await service.close();await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();});}};
}
