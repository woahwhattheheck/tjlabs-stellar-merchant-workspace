// MIT. Mounted on the existing authenticated Bloccpay server; no listener.
import {need,jsonBytes} from './files.mjs';
import {parseSourceJSON} from './source-json.mjs';
export const BRIDGE_ASSETS=[
  ['/bridge',['bridge.html','text/html; charset=utf-8']],
  ['/bridge.html',['bridge.html','text/html; charset=utf-8']],
  ['/bridge-desk.mjs',['bridge-desk.mjs','text/javascript; charset=utf-8']],
  ['/bridge.css',['bridge.css','text/css; charset=utf-8']],
];
async function body(request) {
  const chunks=[];let bytes=0;
  for await(const chunk of request){bytes+=chunk.length;need(bytes<=40*1024*1024,'REQUEST_TOO_LARGE');chunks.push(chunk);}
  return parseSourceJSON(Buffer.concat(chunks,bytes),{maxBytes:40*1024*1024}).value;
}
function send(response,bytes,{type='application/json; charset=utf-8',filename=null,sha256=null}={}) {
  response.writeHead(200,{'content-type':type,'content-length':bytes.length,'cache-control':'no-store','x-content-type-options':'nosniff',
    ...(filename?{'content-disposition':'attachment; filename="'+filename+'"'}:{}),
    ...(sha256?{'x-content-sha256':sha256}:{})});
  response.end(bytes);
}
export async function routeBridgeIntake({request,response,url,intake,mutation,signal}) {
  const path=url.pathname;
  if(!path.startsWith('/api/bridge/'))return false;
  if(request.method==='GET'&&path==='/api/bridge/intake'){send(response,jsonBytes(await intake.summary()));return true;}
  if(request.method==='POST'&&['/api/bridge/preview','/api/bridge/decision-preview','/api/bridge/save'].includes(path)){
    mutation(request);const input=await body(request);signal?.throwIfAborted();
    const result=path.endsWith('/decision-preview')?await intake.previewDecision(input):
      path.endsWith('/preview')?await intake.previewReview(input):await intake.save({...input,signal});
    send(response,jsonBytes(result));return true;
  }
  if(request.method==='GET'&&path.startsWith('/api/bridge/reviews/')){
    const parts=path.slice('/api/bridge/reviews/'.length).split('/');
    need(parts.length===1||parts.length===2&&parts[1]==='download','ROUTE_NOT_FOUND');
    const result=await intake.read(decodeURIComponent(parts[0]));
    if(parts.length===2)send(response,jsonBytes(result.document),{filename:'bridge-'+result.request.id.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json',sha256:result.documentSha256});
    else send(response,jsonBytes(result));
    return true;
  }
  if(request.method==='GET'&&path==='/api/bridge/original'){
    const result=await intake.originalBody({table:url.searchParams.get('table'),id:url.searchParams.get('id')});
    send(response,result.body,{type:'application/octet-stream',filename:'bridge-original-'+result.descriptor.sha256+'.bin',sha256:result.descriptor.sha256});return true;
  }
  throw Object.assign(new Error('Bridge route not found.'),{code:'ROUTE_NOT_FOUND'});
}
