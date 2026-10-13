#!/usr/bin/env node
// MIT. One leased host loop for saved read-only payroll collection plans.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {openBloccpayWorkspace} from './lib/workspace.mjs';
import {lease,hash,now,need,publicError,readJSON} from './lib/files.mjs';

export async function startBloccpayWorker({
  directory,configuration={},workspace:provided,signal,pollSeconds=15,maxPages=100,
  onResult=()=>{},
}={}) {
  need(Number.isFinite(pollSeconds) && pollSeconds >= 1 && pollSeconds <= 300,'INVALID_WORKER_POLL');
  const workspace = provided ?? await openBloccpayWorkspace({
    directory,connections:configuration.connections ?? {},name:configuration.name,
    sourceDirectory:configuration.sourceDirectory,runtimeDirectory:configuration.runtimeDirectory,
    expectedManifestSha256:configuration.expectedManifestSha256,
  });
  let guard;
  try { guard = await lease(workspace.directory,'collection-worker'); }
  catch(error) {
    if(!provided) {
      let closed=false,attempt=null;
      const close=()=>{
        if(closed)return Promise.resolve({state:'CLOSED'});
        if(attempt)return attempt;
        const current=(async()=>{await workspace.close();closed=true;return {state:'CLOSED'};})();
        attempt=current;current.catch(()=>{if(attempt===current)attempt=null;});return current;
      };
      try {await close();}catch(cleanupError){error.close=close;error.closeError=cleanupError;}
    }
    throw error;
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason ?? 'worker-stopping');
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  let closePromise=null,guardClosed=false,workspaceClosed=Boolean(provided),closed=false,firstError=null;
  const execute = async request => {
    try {
      let retained;
      try { retained=workspace.item('requests',request.requestId); }
      catch(error) { if(error.code!=='RECORD_NOT_FOUND')throw error; }
      if(retained) {
        need(retained.method===request.method,'WORKER_REQUEST_METHOD_CHANGED');
        request={requestId:retained.id,method:retained.method,args:retained.args};
      }
      const result = await workspace.command({...request,signal:controller.signal});
      await onResult({at:now(),requestId:request.requestId,result});
      return result;
    } catch(error) {
      if(controller.signal.aborted)throw error;
      await onResult({at:now(),requestId:request.requestId,error:publicError(error)});
      return null;
    }
  };
  const running = (async()=>{
      while(!controller.signal.aborted) {
        const selected = workspace.privateList('collections').filter(row=>row.enabled);
        for(const collection of selected) {
          if(controller.signal.aborted)break;
          if(!workspace.privateItem('collections',collection.id).enabled)continue;
          const active=[];
          for(const status of ['READY','RUNNING']) {
            let cursor=null;
            do {
              const page=workspace.list({table:'runs',collectionId:collection.id,status,limit:500,cursor});
              active.push(...page.rows);cursor=page.nextCursor;
            } while(cursor);
          }
          if(active.length) {
            for(const run of active) {
              let original;
              try { original=workspace.item('requests',run.id); } catch {}
              if(original?.status==='RUNNING') {
                await execute({requestId:original.id,method:original.method,args:original.args});
              } else {
                const unfinished=run.passes.findLast(pass=>!pass.completedAt && !pass.interruptedAt);
                let originalPass;
                if(unfinished)try{originalPass=workspace.item('requests',unfinished.requestId);}catch{}
                const requestId=originalPass?.status==='RUNNING' ? originalPass.id :
                  'worker:continue:' + hash(run.id + ':' + run.passes.length);
                await execute({requestId,method:'run.continue',args:{runId:run.id,maxPages}});
              }
            }
            continue;
          }
          const bucket=Math.floor(Date.now()/(collection.intervalSeconds*1000))*collection.intervalSeconds*1000;
          const scheduledFor=new Date(bucket).toISOString();
          const requestId='worker:collection:' + hash(collection.id + ':' + scheduledFor);
          await execute({requestId,method:'collection.run',
            args:{collectionId:collection.id,scheduledFor,maxPages}});
        }
        try { await delay(pollSeconds*1000,undefined,{signal:controller.signal}); }
        catch(error) { if(!controller.signal.aborted)throw error; }
      }
  })();
  running.catch(error=>{firstError ??= error;});
  function inspect() {
    return {closed,guardClosed,workspaceClosed,borrowedWorkspace:Boolean(provided),
      error:firstError ? publicError(firstError) : null};
  }
  function close() {
    controller.abort('worker-stopping');
    if(closed)return Promise.resolve({state:'CLOSED'});
    if(closePromise)return closePromise;
    const attempt=(async()=>{
      // The loop's business failure remains in done/inspect. Actual owner
      // cleanup is retryable independently and cannot release a borrowed DB.
      await running.catch(error=>{firstError ??= error;});
      signal?.removeEventListener('abort',abort);
      if(!guardClosed){await guard.release();guardClosed=true;}
      if(!workspaceClosed){await workspace.close();workspaceClosed=true;}
      closed=true;
      return {state:'CLOSED'};
    })();
    closePromise=attempt;
    attempt.catch(error=>{
      firstError ??= error;
      if(closePromise===attempt)closePromise=null;
    });
    return attempt;
  }
  const done=running.then(
    async value=>{try{await close();return value;}catch(error){error.close=close;error.worker={close,inspect};throw error;}},
    async originalError=>{
      let error=originalError;
      try{await close();}catch(cleanupError){
        if(!error||(typeof error!=='object'&&typeof error!=='function'))
          error=new Error('Collection worker failed.',{cause:originalError});
        error.closeError=cleanupError;error.close=close;error.worker={close,inspect};
      }
      throw error;
    },
  );
  done.catch(()=>{});
  return {workspace,done,close,inspect,identity:guard.owner};
}

if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const flags={};
  for(let index=2;index<process.argv.length;index+=2) {
    need(process.argv[index]?.startsWith('--') && process.argv[index+1],'ARGUMENT_REQUIRED');
    flags[process.argv[index].slice(2)]=process.argv[index+1];
  }
  const configuration=flags.configuration ? await readJSON(path.resolve(flags.configuration)) : {};
  let worker=null,draining=null;
  const controller=new AbortController();
  async function drain(close) {
    if(draining)return draining;
    draining=(async()=>{
      let first=null;
      for(;;) {
        try {await close();break;}
        catch(error) {
          if(!first){first=error;process.exitCode=1;console.error(JSON.stringify(publicError(error)));}
          await delay(200);
        }
      }
    })();
    return draining;
  }
  const stopping=()=>{controller.abort('worker-stop');if(worker)void drain(worker.close);};
  for(const name of ['SIGTERM','SIGINT'])process.on(name,stopping);
  try {
    worker=await startBloccpayWorker({
      directory:path.resolve(flags.directory),configuration,signal:controller.signal,
      pollSeconds:Number(flags['poll-seconds']??15),maxPages:Number(flags['max-pages']??100),
      onResult:value=>process.stdout.write(JSON.stringify(value)+'\n'),
    });
    process.stdout.write('BLOCCPAY_COLLECTION_WORKER_READY '+JSON.stringify({
      directory:worker.workspace.directory,workspaceId:worker.workspace.describe().workspace.id,
    })+'\n');
    await worker.done;
  } catch(error) {
    if(worker)await drain(worker.close);
    else if(error.close)await drain(error.close);
    throw error;
  } finally {
    for(const name of ['SIGTERM','SIGINT'])process.removeListener(name,stopping);
  }
}
