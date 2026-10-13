// MIT. Complete humanitarian table and review operations over the original authenticated loopback host.
const JSON_LIMIT=1024*1024, ARCHIVE_LIMIT=2*1024*1024*1024;
const HEX=/^[a-f0-9]{64}$/;
function need(value,message){if(!value)throw new TypeError(message);}
function checkedRevision(value){need(value===undefined||value===null||Number.isSafeInteger(value)&&value>=1,'Select a saved positive revision');return value;}
function id(value){need(typeof value==='string'&&HEX.test(value),'Select an original SHA-256 identity');return value;}
function identifier(value){need(typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value),'Select an original named identifier of at most 80 characters');return value;}
function request(value){need(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.requestId==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value.requestId),'Retain the complete original request and requestId');return value;}
function originalURL(input){
  const raw=typeof input==='string'?input:input?.console||input?.url;const url=new URL(raw);
  const token=url.hash.slice(1)||input?.token;
  need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!url.username&&!url.password&&!url.search&&url.pathname==='/'&&Number(url.port||80)>=1&&Number(url.port||80)<=65535&&/^[A-Za-z0-9_-]{43}$/.test(token),'Select the original private humanitarian console URL');
  url.hash='';return{base:url.origin,token};
}
function blob(value,maximum,label){
  const result=value instanceof Blob?value:typeof value==='string'?new Blob([value]):value instanceof ArrayBuffer||ArrayBuffer.isView(value)?new Blob([value]):null;
  need(result&&result.size<=maximum,label+' requires its complete original bytes within the documented limit');return result;
}
function encoded(value,maximum=JSON_LIMIT){const text=JSON.stringify(value);need(typeof text==='string','Expected complete JSON');const body=new Blob([text+'\n'],{type:'application/json'});need(body.size<=maximum,'Complete JSON exceeds its documented bound');return body;}
export class HumanitarianHttpError extends Error{
  constructor(status,body){super(body?.error||'humanitarian HTTP '+status);this.name='HumanitarianHttpError';this.status=status;this.body=body;this.uncertain=status>=500;}
}
export class HumanitarianClient{
  #base;#token;#fetch;#timeout;#active=new Set();#closed=false;#closing=null;
  constructor(connection,{fetch:fetcher=globalThis.fetch,timeoutMs=120000}={}){
    const selected=originalURL(connection);this.#base=selected.base;this.#token=selected.token;
    need(typeof fetcher==='function'&&Number.isSafeInteger(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=3600000,'Choose the existing fetch transport and a bounded timeout');
    this.#fetch=fetcher;this.#timeout=timeoutMs;
  }
  get origin(){return this.#base;}
  async #response(route,{method='GET',params={},body,headers={},signal}={}){
    need(!this.#closed,'The original humanitarian client has closed admission');
    need(typeof route==='string'&&/^\/api\/[a-z/-]+$/.test(route),'Choose a documented humanitarian route');
    const url=new URL(route,this.#base);for(const[key,value]of Object.entries(params))if(value!==undefined&&value!==null)url.searchParams.set(key,String(value));
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('Original humanitarian request exceeded its selected timeout')),this.#timeout);
    const aborted=()=>controller.abort(signal.reason);if(signal?.aborted)aborted();else signal?.addEventListener('abort',aborted,{once:true});
    let finish,reader=null,streamController=null,ended=false,fetchSettled=false,bodyEnded=false,reads=0,cancellation=null;
    const done=new Promise(resolve=>{finish=resolve;});this.#active.add(done);
    const release=()=>{if(ended||!fetchSettled||!bodyEnded||reads||cancellation)return;ended=true;clearTimeout(timer);signal?.removeEventListener('abort',aborted);controller.signal.removeEventListener('abort',expired);this.#active.delete(done);finish();};
    const cancelReader=reason=>{
      if(!reader)return Promise.resolve();
      if(cancellation)return cancellation;
      // Keep the accepted reader until cancel and every outstanding read settle.
      const pending=Promise.resolve().then(()=>reader.cancel(reason));
      cancellation=pending;
      pending.then(()=>{bodyEnded=true;cancellation=null;release();},()=>{bodyEnded=true;cancellation=null;release();});
      return pending;
    };
    const expired=()=>{
      const error=controller.signal.reason||Error('Original transfer ended');
      try{streamController?.error(error);}catch{}
      // A pre-header abort remains owned by the original awaited fetch/catch.
      if(reader)cancelReader(error).catch(()=>{});
    };
    controller.signal.addEventListener('abort',expired,{once:true});
    try{
      const response=await this.#fetch(url,{method,body,redirect:'error',signal:controller.signal,headers:{authorization:'Bearer '+this.#token,...headers}});
      fetchSettled=true;
      if(controller.signal.aborted){
        if(response.body){reader=response.body.getReader();await cancelReader(controller.signal.reason);}
        bodyEnded=true;release();throw controller.signal.reason||Error('Original transfer ended');
      }
      if(!response.ok){const text=await response.text();let value;try{value=JSON.parse(text);}catch{value={error:text};}throw new HumanitarianHttpError(response.status,value);}
      if(!response.body){bodyEnded=true;release();return response;}
      reader=response.body.getReader();
      const stream=new ReadableStream({
        start(value){streamController=value;},
        async pull(value){
          reads++;
          try{const item=await reader.read();if(item.done){bodyEnded=true;value.close();}else value.enqueue(item.value);}
          catch(error){try{value.error(error);}catch{}await cancelReader(error).catch(()=>{});}
          finally{reads--;release();}
        },
        async cancel(reason){await cancelReader(reason);}
      });
      if(controller.signal.aborted)expired();
      return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
    }catch(error){
      fetchSettled=true;
      if(reader)await cancelReader(error).catch(()=>{});
      bodyEnded=true;release();throw error;
    }
  }
  async #get(route,params){return(await this.#response(route,{params})).json();}
  async #post(route,value){return(await this.#response(route,{method:'POST',body:encoded(value),headers:{'content-type':'application/json'}})).json();}
  launch(){return this.#get('/api/launch');}
  state(){return this.#get('/api/humanitarian/state');}
  async addSource(original,{name,label}){
    need(typeof name==='string'&&name&&typeof label==='string'&&label,'Retain the complete source filename and label');
    return(await this.#response('/api/source',{method:'POST',body:blob(original,100*1024*1024,'Original table source'),headers:{'content-type':'application/octet-stream','X-Humanitarian-Name':encodeURIComponent(name),'X-Humanitarian-Label':encodeURIComponent(label)}})).json();
  }
  source(value){return this.#get('/api/source',{id:id(value)});}
  sourceTable(source,{table='data',offset=0,limit=8}={}){need(typeof table==='string'&&table&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=20,'Choose one complete original table row window');return this.#get('/api/humanitarian/source-table',{source:id(source),table,offset,limit});}
  saveReference(input){return this.#post('/api/humanitarian/reference',request(input));}
  reference(value){return this.#get('/api/humanitarian/reference',{id:id(value)});}
  saveMapping(input){return this.#post('/api/humanitarian/mapping',request(input));}
  mapping(value){return this.#get('/api/humanitarian/mapping',{id:id(value)});}
  saveAlias(input){return this.#post('/api/humanitarian/alias',request(input));}
  alias(value){return this.#get('/api/humanitarian/alias',{id:id(value)});}
  saveReview(input){return this.#post('/api/humanitarian/review',request(input));}
  review(value,revision){return this.#get('/api/humanitarian/review',{id:identifier(value),revision:checkedRevision(revision)});}
  reviews(){return this.#get('/api/humanitarian/reviews');}
  history(value){return this.#get('/api/humanitarian/history',{id:identifier(value)});}
  request(value){return this.#get('/api/humanitarian/request',{id:identifier(value)});}
  report(value,{revision}={}){return this.#get('/api/humanitarian/report',{id:identifier(value),revision:checkedRevision(revision)});}
  rows(value,{revision,edition=0,offset=0,limit=50,issues=false}={}){
    need(Number.isSafeInteger(edition)&&edition>=0&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=1000&&typeof issues==='boolean','Choose a bounded original edition row page');
    return this.#get('/api/humanitarian/rows',{id:identifier(value),revision:checkedRevision(revision),edition,offset,limit,issues:issues?'1':'0'});
  }
  outputRows(value,{revision,edition=0,output,offset=0,limit=50}={}){need(Number.isSafeInteger(edition)&&edition>=0&&edition<=1&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=1000,'Choose a bounded original output page');return this.#get('/api/humanitarian/output-rows',{id:identifier(value),revision:checkedRevision(revision),edition,output:identifier(output),offset,limit});}
  comparisonRows(value,{revision,offset=0,limit=50}={}){need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=1000,'Choose a bounded original comparison page');return this.#get('/api/humanitarian/comparison-rows',{id:identifier(value),revision:checkedRevision(revision),offset,limit});}
  async receive(original){return(await this.#response('/api/import',{method:'POST',body:blob(original,ARCHIVE_LIMIT,'Complete private workspace'),headers:{'content-type':'application/zip'}})).json();}
  exportReview(value,{revision,signal}={}){return this.#response('/api/humanitarian/export',{params:{id:identifier(value),revision:checkedRevision(revision),kind:'workspace'},signal});}
  exportReport(value,{revision,signal}={}){return this.#response('/api/humanitarian/export',{params:{id:identifier(value),revision:checkedRevision(revision),kind:'report'},signal});}
  queryNative(build,query={}){return this.#post('/api/query',{build:id(build),query});}
  exportDataset(build,{signal}={}){return this.#response('/api/dataset-export',{params:{build:id(build)},signal});}
  close(){this.#closed=true;if(!this.#closing)this.#closing=Promise.allSettled([...this.#active]).then(()=>undefined).catch(error=>{this.#closing=null;throw error;});return this.#closing;}
}
export function createHumanitarianClient(connection,options){return new HumanitarianClient(connection,options);}
export async function downloadHumanitarianFile(response,path,options={}){
  try{
    const fs=await import('node:fs/promises'),{dirname,basename,resolve,join}=await import('node:path'),{createHash}=await import('node:crypto');
    const {acquireStateLease}=await import('../../merchant-fleet-gateway/state-lease.mjs');
    const target=resolve(path),parent=dirname(target);
    need(await fs.realpath(parent)===parent,'Output parent must be a real original directory');
    const key=createHash('sha256').update(process.platform==='win32'?basename(target).toLowerCase():basename(target)).digest('hex');
    const directory=join(parent,'.humanitarian-output-'+key);
    await fs.mkdir(directory,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
    const info=await fs.lstat(directory);
    need(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&(!process.getuid||info.uid===process.getuid()),'Original output lease directory must remain private and operator-owned');
    const lease=await acquireStateLease(directory);
    try{return await downloadLocked(response,target,options,lease);}finally{await lease.close();}
  }catch(error){
    // A rejected path/lease still owns this accepted HTTP response.
    // Drain its original reader before returning the unchanged setup error.
    if(response?.body&&!response.body.locked)await response.body.cancel(error).catch(()=>{});
    throw error;
  }
}
async function downloadLocked(response,path,{expectedSha256=null,maxBytes=ARCHIVE_LIMIT}={},lease){
  need(response instanceof Response&&response.ok,'Use the full original successful download response');
  need(typeof path==='string'&&Number.isSafeInteger(maxBytes)&&maxBytes>0,'Choose one complete output and its byte bound');
  const fs=await import('node:fs/promises'),{dirname,basename,resolve}=await import('node:path'),{createHash,randomUUID}=await import('node:crypto');
  const target=resolve(path),parent=dirname(target);
  need(await fs.realpath(parent)===parent,'Output parent must be a real original directory');
  let old=null;try{old=await fs.lstat(target);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(old)need(old.isFile()&&!old.isSymbolicLink(),'Existing output must be a regular original file');
  const stage=parent+'/.humanitarian-'+basename(target)+'-'+randomUUID()+'.partial',handle=await fs.open(stage,'wx',0o600);
  const hash=createHash('sha256');let bytes=0;
  try{for await(const block of response.body){bytes+=block.byteLength;need(bytes<=maxBytes,'Complete download exceeds its selected bound');hash.update(block);let offset=0;while(offset<block.byteLength){const result=await handle.write(block,offset,block.byteLength-offset);need(result.bytesWritten>0,'Output write made no progress');offset+=result.bytesWritten;}}await handle.sync();}finally{await handle.close();}
  const sha256=hash.digest('hex'),declared=response.headers.get('content-length');need(declared===null||/^\d+$/.test(declared)&&Number(declared)===bytes,'Returned file differs from its original full byte count');
  need(expectedSha256===null||HEX.test(expectedSha256)&&sha256===expectedSha256,'Full download differs from its selected SHA-256');
  const stagedHash=createHash('sha256'),stagedFile=await fs.open(stage,'r');let stagedBytes=0;
  try{for await(const part of stagedFile.createReadStream()){stagedHash.update(part);stagedBytes+=part.byteLength;}}finally{await stagedFile.close();}
  need(stagedBytes===bytes&&stagedHash.digest('hex')===sha256,'Full private stage failed readback');
  lease.assertHeld();
  if(old){const actual=await fs.lstat(target);need(actual.dev===old.dev&&actual.ino===old.ino&&actual.size===old.size&&actual.mtimeMs===old.mtimeMs,'Existing output changed during download');const h=createHash('sha256'),f=await fs.open(target,'r');try{for await(const part of f.createReadStream())h.update(part);}finally{await f.close();}need(actual.size===bytes&&h.digest('hex')===sha256,'Existing completed output contains different original bytes');await fs.unlink(stage);}
  else{lease.assertHeld();await fs.rename(stage,target);}
  const directory=await fs.open(parent,'r');try{await directory.sync();}finally{await directory.close();}
  lease.assertHeld();return{path:target,bytes,sha256,reused:Boolean(old)};
}
