// MIT. Local SF74 HTTP transport for the original case review service.
import {createImplementationReview} from './case-implementation-review.mjs';
import {MAX_REVIEW_BYTES} from './implementation-review-model.mjs';

export const IMPLEMENTATION_REVIEW_HTTP_BASE='/api/implementation-review';
export const MAX_REVIEW_HTTP_BYTES=64*1024*1024;
const failure=(code,message,status)=>Object.assign(new Error(message),{code,status});
function json(res,status,value){
  if(res.destroyed||res.writableEnded)return;
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify(value)+'\n');
}
function readBody(req,signal){
  return new Promise((resolve,reject)=>{
    const chunks=[];let total=0,settled=false;
    const cleanup=()=>{req.off('data',data);req.off('end',end);req.off('error',error);signal.removeEventListener('abort',aborted);};
    const done=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value);};
    const error=e=>done(reject,e);
    const aborted=()=>{req.resume();error(failure('IMPLEMENTATION_REVIEW_ABORTED','The review request was stopped.',409));};
    const data=chunk=>{
      total+=chunk.length;
      if(total>MAX_REVIEW_HTTP_BYTES){req.resume();error(failure('REVIEW_BODY_TOO_LARGE','Review request exceeds 64 MiB.',413));return;}
      chunks.push(chunk);
    };
    const end=()=>{
      try{
        const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
        const value=JSON.parse(raw);
        if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Use an object.');
        done(resolve,value);
      }catch{error(failure('INVALID_REVIEW_JSON','Supply a complete UTF-8 JSON review request.',400));}
    };
    if(signal.aborted){aborted();return;}
    signal.addEventListener('abort',aborted,{once:true});req.on('data',data);req.once('end',end);req.once('error',error);
  });
}
export function createImplementationReviewHttp({store,sourceDelivery,workspaceId}={}){
  if(typeof workspaceId!=='string'||!workspaceId)throw failure('REVIEW_WORKSPACE_REQUIRED','Bind the actual original case directory identity.',422);
  const service=createImplementationReview({store,sourceDelivery}),active=new Set(),controllers=new Set();let closing=false;
  async function dispatch(req,res,{origin}={}){
    const url=new URL(req.url,origin),route=url.pathname;
    if(route!==IMPLEMENTATION_REVIEW_HTTP_BASE&&!route.startsWith(IMPLEMENTATION_REVIEW_HTTP_BASE+'/'))return false;
    const controller=new AbortController();controllers.add(controller);
    const abort=()=>{if(!res.writableEnded)controller.abort();};
    req.once('aborted',abort);res.once('close',abort);
    try{
      if(closing)throw failure('IMPLEMENTATION_REVIEW_CLOSED','The review desk is closing.',503);
      if(typeof origin!=='string'||req.headers.origin&&req.headers.origin!==origin||
        req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))
        throw failure('ORIGIN_MISMATCH','Use the original local Support desk.',403);
      if(url.search)throw failure('UNEXPECTED_QUERY','Review methods use their original JSON input.',400);
      const method=route.slice(IMPLEMENTATION_REVIEW_HTTP_BASE.length+1);
      if(method==='config'){
        if(req.method!=='GET')throw failure('METHOD_NOT_ALLOWED','Use GET for the original workspace identity.',405);
        json(res,200,{workspaceId,packetBytes:MAX_REVIEW_BYTES,returnBytes:MAX_REVIEW_BYTES,requestBytes:MAX_REVIEW_HTTP_BYTES});return true;
      }
      if(!['prepare','preview','apply','status'].includes(method))throw failure('REVIEW_ROUTE_NOT_FOUND','Unknown implementation review route.',404);
      if(req.method!=='POST')throw failure('METHOD_NOT_ALLOWED','Use the original POST operation.',405);
      if(req.headers.origin!==origin)throw failure('ORIGIN_MISMATCH','Use the same-origin Support desk for review operations.',403);
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??''))throw failure('REVIEW_JSON_REQUIRED','Use application/json.',415);
      if(req.headers['content-length']!==undefined&&(!/^\d+$/.test(req.headers['content-length'])||Number(req.headers['content-length'])>MAX_REVIEW_HTTP_BYTES))
        throw failure('REVIEW_BODY_TOO_LARGE','Review request exceeds 64 MiB.',413);
      const args=await readBody(req,controller.signal);
      if(Object.hasOwn(args,'signal'))throw failure('INVALID_REVIEW_JSON','Signal is owned by the original host.',400);
      const result=await service[method]({...args,signal:controller.signal});json(res,200,result);return true;
    }catch(error){json(res,Number.isInteger(error.status)?error.status:500,
      {error:error.code??'IMPLEMENTATION_REVIEW_FAILED',detail:error.message,
        ...(error.currentRevision?{currentRevision:error.currentRevision}:{})});return true;}
    finally{req.off('aborted',abort);res.off('close',abort);controllers.delete(controller);}
  }
  function handle(req,res,context){
    if(closing&&!(req.url??'').startsWith(IMPLEMENTATION_REVIEW_HTTP_BASE))return Promise.resolve(false);
    const promise=dispatch(req,res,context);active.add(promise);promise.finally(()=>active.delete(promise)).catch(()=>{});return promise;
  }
  return {handle,service,async close(){closing=true;for(const controller of controllers)controller.abort();
    await Promise.allSettled([...active]);await service.close();}};
}
