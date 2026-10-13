// MIT. Handler for an explicitly installed original private-host webhook route.
// It does not listen on a port or acquire another server.
import {randomUUID} from 'node:crypto';
import {BridgeContractError} from './bridge-provider.mjs';
export function createBridgeWebhookHandler({operator,endpointId,publicKeyPem,maxBodyBytes=8388608,onError=()=>{}}) {
  if(!operator?.invoke||typeof endpointId!=='string'||typeof publicKeyPem!=='string')throw new BridgeContractError('ENDPOINT_REQUIRED','Bind the original operator, endpoint and public key.');
  if(!Number.isSafeInteger(maxBodyBytes)||maxBodyBytes<1||maxBodyBytes>8388608)throw new BridgeContractError('BODY_BOUND','Select a finite endpoint body bound at most 8 MiB.');
  const pending=new Set(),requests=new Set();let closing=false,closed=false,closeTask;
  const safeError=error=>{try{onError({code:error?.code??'WEBHOOK_FAILED',message:error?.message??String(error)});}catch{}};
  async function serve(req,res) {
    if(closing){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"ENDPOINT_DRAINING"}');return;}
    const receivedAtMs=Date.now(),requestId=randomUUID();requests.add(req);
    let task;
    task=(async()=>{
      let first,ended=false,responseClosed=res.closed===true,requestClosed=req.closed===true;
      const closedResponse=responseClosed?Promise.resolve():new Promise(resolve=>res.once('close',()=>{responseClosed=true;resolve();}));
      const closedRequest=requestClosed?Promise.resolve():new Promise(resolve=>req.once('close',()=>{requestClosed=true;resolve();}));
      const responseError=error=>{first??=error;},requestError=error=>{first??=error;};
      res.on('error',responseError);req.on('error',requestError);
      try {
        if(req.method!=='POST')throw new BridgeContractError('METHOD_NOT_ALLOWED','Use the original POST delivery.');
        const matches=[];for(let i=0;i<req.rawHeaders.length;i+=2)if(req.rawHeaders[i].toLowerCase()==='x-webhook-signature')matches.push(req.rawHeaders[i+1]);
        if(matches.length!==1)throw new BridgeContractError('SIGNATURE_REQUIRED','Supply one original signature header.');
        if(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')throw new BridgeContractError('ENCODING_UNSUPPORTED','Retain identity-encoded original request bytes.');
        const parts=[];let size=0;
        for await(const part of req){const raw=Buffer.from(part);size+=raw.length;if(size>maxBodyBytes)throw new BridgeContractError('BODY_BOUND','Original delivery exceeds the endpoint body bound.');parts.push(raw);}
        ended=true;if(first)throw first;
        const raw=Buffer.concat(parts,size),overview=await operator.invoke({method:'workspace.describe',args:{}});
        const result=await operator.invoke({method:'bridge.webhook.receive',args:{requestId,expectedRevision:overview.revision,
          endpointId,publicKeyPem,receivedAtMs,signatureHeader:matches[0],rawBodyBase64:raw.toString('base64')}});
        if(first)throw first;
        const answer=JSON.stringify({status:result.status,eventId:result.eventId,deliverySourceId:result.deliverySourceId,eventSourceId:result.eventSourceId});
        res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
        await new Promise((resolve,reject)=>res.end(answer,e=>e?reject(e):resolve()));
      }catch(error){
        first??=error;safeError(first);
        if(!res.headersSent&&!res.destroyed) {
          const code=first.code??'WEBHOOK_FAILED',status=code==='METHOD_NOT_ALLOWED'?405:code==='BODY_BOUND'?413:/SIGNATURE|ENDPOINT_KEY|UTF8|JSON/.test(code)?400:409;
          res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
          await new Promise(resolve=>res.end(JSON.stringify({error:code,requestId}),()=>resolve()));
        }
      }finally{
        if(!ended&&!req.destroyed)req.destroy(first??new Error('Original delivery stopped.'));
        if(!responseClosed){if(!res.writableFinished&&!res.destroyed)res.destroy(first);await closedResponse;}
        if(!requestClosed)await closedRequest;
        req.off('error',requestError);res.off('error',responseError);requests.delete(req);
      }
    })();
    pending.add(task);try{await task;}finally{pending.delete(task);}
  }
  function close() {
    if(closed)return Promise.resolve({state:'CLOSED'});if(closeTask)return closeTask;
    closing=true;
    // Accepted finite HTTP bodies stay owned until complete or native timeout/
    // disconnect. The original host controls its request timeout and sockets.
    closeTask=(async()=>{while(pending.size)await Promise.allSettled([...pending]);closed=true;return {state:'CLOSED'};})();
    closeTask.catch(()=>{closeTask=null;});return closeTask;
  }
  return {handle:serve,close,inspect:()=>({closing,closed,requests:requests.size,active:pending.size})};
}
