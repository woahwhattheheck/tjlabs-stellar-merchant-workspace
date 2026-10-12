/** MIT. Typed HTTP client for the native pipeline operator. Node 22+. */
import { createWriteStream } from 'node:fs';
import { open, link, unlink, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export class PipelineClient {
  constructor(origin, {fetch: transport = globalThis.fetch} = {}) {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new TypeError('Use the exact http://127.0.0.1:PORT origin printed by the pipeline operator');
    }
    this.origin = parsed.origin;
    this.fetch = transport;
  }
  async request(path, {body, signal} = {}) {
    if (!path.startsWith('/api/')) throw new TypeError('Expected a pipeline API route');
    const response = await this.fetch(this.origin + path, {method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : {'Content-Type':'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body), signal});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Pipeline request failed (${response.status})`);
    return result;
  }
  state(options) { return this.request('/api/state', options); }
  list(collection='pipelines', {offset=0,limit=100,...options}={}) { return this.request('/api/list?'+new URLSearchParams({collection,offset,limit}),options); }
  definition(id, {revision,...options}={}) { return this.request('/api/definition?'+new URLSearchParams({id,...(revision===undefined?{}:{revision})}),options); }
  save(definition, {pipelineId,expectedRevision=0,signal}={}) {
    for(const stage of definition.stages||[])for(const value of Object.values(stage.parameters||{}))if(typeof value==='number'&&!Number.isSafeInteger(value))throw new TypeError('Use text for decimal amounts and integers outside the safe JavaScript range');
    return this.request('/api/save',{body:{definition,pipeline_id:pipelineId,expected_revision:expectedRevision},signal}); }
  fromRecipe(recipeId,{revision,signal}={}) { return this.request('/api/from-recipe',{body:{recipe_id:recipeId,revision},signal}); }
  enqueue(pipelineId, requestKey, {revision,inputs,signal}={}) { return this.request('/api/enqueue',{body:{pipeline_id:pipelineId,request_key:requestKey,revision,inputs},signal}); }
  execute(executionId,{resume=false,signal}={}) { return this.request('/api/execute',{body:{execution_id:executionId,resume},signal}); }
  execution(id,options) { return this.request('/api/execution?'+new URLSearchParams({id}),options); }
  cancel(executionId,options={}) { return this.request('/api/cancel',{...options,body:{execution_id:executionId}}); }
  recover(options={}) { return this.request('/api/recover',{...options,body:{}}); }
  events(id,{after=0,limit=100,...options}={}) { return this.request('/api/events?'+new URLSearchParams({id,after,limit}),options); }
  rows(id,stage,{offset=0,limit=100,...options}={}) { return this.request('/api/rows?'+new URLSearchParams({id,stage,offset,limit}),options); }
  review(executionId,stageId,{decision,reviewer,note='',expectedRevision=0,signal}) { return this.request('/api/review',{body:{execution_id:executionId,stage_id:stageId,decision,reviewer,note,expected_revision:expectedRevision},signal}); }
  compare(before,after,options) { return this.request('/api/compare?'+new URLSearchParams({before,after}),options); }
  exportProject(options={}) { return this.request('/api/export',{...options,body:{}}); }
  report(executionId,options={}) { return this.request('/api/report',{...options,body:{execution_id:executionId}}); }
  deliver(executionId,options={}) { return this.request('/api/deliver',{...options,body:{execution_id:executionId}}); }
  merchant(executionId,stageId,options={}) { return this.request('/api/merchant',{...options,body:{execution_id:executionId,stage_id:stageId}}); }
  resultURL(id,stage,file='result.jsonl') {
    if (!['result.jsonl','result.csv','schema.json'].includes(file)) throw new TypeError('Unknown result representation');
    return '/api/result?'+new URLSearchParams({id,stage,file});
  }
  async importFile(path,{alias,format='csv',label,filename,nullToken,signal}={}) {
    const { basename } = await import('node:path');
    const { createReadStream } = await import('node:fs');
    const size = (await stat(path)).size;
    const q = new URLSearchParams({alias,format,filename:filename||basename(path),...(label?{label}:{}),...(nullToken===undefined?{}:{nullToken})});
    const response = await this.fetch(this.origin+'/api/upload?'+q,{method:'POST',headers:{'Content-Length':String(size)},body:createReadStream(path),duplex:'half',signal});
    const result = await response.json();
    if(!response.ok)throw new Error(result.error||`Upload failed (${response.status})`);
    return result;
  }
  async *all(collection='pipelines', {pageSize=100,signal}={}) {
    let offset=0;
    do {const page=await this.list(collection,{offset,limit:pageSize,signal});yield*page.items;offset=page.nextOffset;} while(offset!==null);
  }
  async *allRows(id,stage,{pageSize=200,signal}={}) {
    let offset=0;
    do {const page=await this.rows(id,stage,{offset,limit:pageSize,signal});for(const row of page.rows)yield Object.fromEntries(page.columns.map((k,i)=>[k,row[i]]));offset=page.nextOffset;} while(offset!==null);
  }
  async *allEvents(id,{pageSize=200,signal}={}) {
    let after=0;
    do {const page=await this.events(id,{after,limit:pageSize,signal});yield*page.items;after=page.nextAfter;} while(after!==null);
  }
  async wait(executionId,{signal,intervalMs=300}={}) {
    const {setTimeout: delay}=await import('node:timers/promises');
    let run;
    do {run=await this.execution(executionId,{signal});if(!['QUEUED','RUNNING'].includes(run.status))return run;await delay(intervalMs,undefined,{signal});} while(true);
  }
  async download(relative, destination, {sha256,bytes,signal}={}) {
    if(!/^\/downloads\/[a-f0-9]{32}\.(zip|html)$/.test(relative)&&!relative.startsWith('/api/result?'))throw new TypeError('Use a result URL or the saved download path returned by the server');
    destination=resolve(destination);await mkdir(dirname(destination),{recursive:true});
    const temporary=destination+'.'+randomUUID()+'.part';const hash=createHash('sha256');let size=0;
    try {
      const response=await this.fetch(this.origin+relative,{signal});
      if(!response.ok||!response.body)throw new Error(`Download failed (${response.status})`);
      const expected=Number(response.headers.get('content-length'));
      const inspect=new Transform({transform(chunk,_encoding,next){size+=chunk.length;hash.update(chunk);next(null,chunk);}});
      await pipeline(Readable.fromWeb(response.body),inspect,createWriteStream(temporary,{flags:'wx',mode:0o600}),{signal});
      const actual=hash.digest('hex');
      if((Number.isFinite(expected)&&size!==expected)||(bytes!==undefined&&size!==bytes)||(sha256&&sha256!==actual))throw new Error('Received file size or digest differs from the complete delivery');
      const handle=await open(temporary,'r');try{await handle.sync();}finally{await handle.close();}
      await link(temporary,destination);
      return {path:destination,bytes:size,sha256:actual};
    } finally {await unlink(temporary).catch(()=>{});}
  }
}
