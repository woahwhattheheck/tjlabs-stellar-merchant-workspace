// MIT. Complete typed HILA operations over the original authenticated loopback host.
const JSON_LIMIT=64*1024*1024, ARCHIVE_LIMIT=4*1024*1024*1024;
const HEX=/^[a-f0-9]{64}$/;
function need(value,message){if(!value)throw new TypeError(message);}
function id(value){need(typeof value==='string'&&HEX.test(value),'Select an original SHA-256 identity');return value;}
function request(value){need(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.requestId==='string'&&value.requestId.length>=1&&value.requestId.length<=160,'Retain the complete original request and requestId');return value;}
function originalURL(input){
  const raw=typeof input==='string'?input:input?.console||input?.url;const url=new URL(raw);
  const token=url.hash.slice(1)||input?.token;
  need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!url.username&&!url.password&&!url.search&&url.pathname==='/'&&Number(url.port||80)>=1&&Number(url.port||80)<=65535&&/^[A-Za-z0-9_-]{43}$/.test(token),'Select the original private HILA console URL');
  url.hash='';return{base:url.origin,token};
}
function blob(value,maximum,label){
  const result=value instanceof Blob?value:typeof value==='string'?new Blob([value]):value instanceof ArrayBuffer||ArrayBuffer.isView(value)?new Blob([value]):null;
  need(result&&result.size<=maximum,label+' requires its complete original bytes within the documented limit');return result;
}
function encoded(value,maximum=JSON_LIMIT){const text=JSON.stringify(value);need(typeof text==='string','Expected complete JSON');const body=new Blob([text+'\n'],{type:'application/json'});need(body.size<=maximum,'Complete JSON exceeds its documented bound');return body;}
export class HilaHttpError extends Error{
  constructor(status,body){super(body?.error||'HILA HTTP '+status);this.name='HilaHttpError';this.status=status;this.body=body;this.uncertain=status>=500;}
}
export class HilaClient{
  #base;#token;#fetch;#timeout;#active=new Set();#closed=false;#closing=null;
  constructor(connection,{fetch:fetcher=globalThis.fetch,timeoutMs=120000}={}){
    const selected=originalURL(connection);this.#base=selected.base;this.#token=selected.token;
    need(typeof fetcher==='function'&&Number.isSafeInteger(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=3600000,'Choose the existing fetch transport and a bounded timeout');
    this.#fetch=fetcher;this.#timeout=timeoutMs;
  }
  get origin(){return this.#base;}
  async #response(route,{method='GET',params={},body,headers={},signal}={}){
    need(!this.#closed,'The original HILA client has closed admission');
    need(typeof route==='string'&&/^\/api\/[a-z/-]+$/.test(route),'Choose a documented HILA route');
    const url=new URL(route,this.#base);for(const[key,value]of Object.entries(params))if(value!==undefined&&value!==null)url.searchParams.set(key,String(value));
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('Original HILA request exceeded its selected timeout')),this.#timeout);
    const aborted=()=>controller.abort(signal.reason);if(signal?.aborted)aborted();else signal?.addEventListener('abort',aborted,{once:true});
    let finish,reader=null,streamController=null,ended=false;
    const done=new Promise(resolve=>{finish=resolve;});this.#active.add(done);
    const release=()=>{if(ended)return;ended=true;clearTimeout(timer);signal?.removeEventListener('abort',aborted);controller.signal.removeEventListener('abort',expired);this.#active.delete(done);finish();};
    const expired=()=>{const error=controller.signal.reason||Error('Original transfer ended');try{streamController?.error(error);}catch{}const closing=reader?.cancel(error);if(closing)closing.catch(()=>{}).finally(release);else release();};
    controller.signal.addEventListener('abort',expired,{once:true});
    try{
      const response=await this.#fetch(url,{method,body,redirect:'error',signal:controller.signal,headers:{authorization:'Bearer '+this.#token,...headers}});
      if(!response.ok){const text=await response.text();let value;try{value=JSON.parse(text);}catch{value={error:text};}throw new HilaHttpError(response.status,value);}
      if(!response.body){release();return response;}
      reader=response.body.getReader();
      const stream=new ReadableStream({
        start(value){streamController=value;},
        async pull(value){try{const item=await reader.read();if(item.done){value.close();release();}else value.enqueue(item.value);}catch(error){value.error(error);release();}},
        async cancel(reason){try{await reader.cancel(reason);}finally{release();}},
      });
      if(controller.signal.aborted)expired();
      return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
    }catch(error){release();throw error;}
  }
  async #get(route,params){return(await this.#response(route,{params})).json();}
  async #post(route,value){return(await this.#response(route,{method:'POST',body:encoded(value),headers:{'content-type':'application/json'}})).json();}
  launch(){return this.#get('/api/launch');}
  state(){return this.#get('/api/state');}
  questionnaire(value){return this.#get('/api/hila/questionnaire',{id:id(value)});}
  acquisition(value){return this.#get('/api/hila/acquisition',{id:id(value)});}
  async addQuestionnaire(original,provenance){
    const source=blob(original,16*1024*1024,'Original questionnaire'),metadata=encoded(provenance,262144);
    return(await this.#response('/api/hila/questionnaire',{method:'POST',body:new Blob([metadata,source]),headers:{'content-type':'application/octet-stream','X-HILA-Provenance-Bytes':String(metadata.size)}})).json();
  }
  async addSource(original,{name,label}){
    need(typeof name==='string'&&name&&typeof label==='string'&&label,'Retain the complete source filename and label');
    return(await this.#response('/api/source',{method:'POST',body:blob(original,100000000,'Response source'),headers:{'content-type':'application/octet-stream','X-HILA-Name':encodeURIComponent(name),'X-HILA-Label':encodeURIComponent(label)}})).json();
  }
  source(value){return this.#get('/api/source',{id:id(value)});}
  mapping(questionnaire,source){return this.#get('/api/hila/mapping',{questionnaire:id(questionnaire),source:id(source)});}
  rulesTemplate(questionnaire){return this.#get('/api/hila/rules-template',{questionnaire:id(questionnaire)});}
  validateRules(questionnaire,rules){return this.#post('/api/hila/rules',{questionnaire:id(questionnaire),rules});}
  saveEdition(input){return this.#post('/api/hila/edition',request(input));}
  edition(value){return this.#get('/api/hila/edition',{id:id(value)});}
  editions(){return this.#get('/api/hila/editions');}
  rows(edition,{offset=0,limit=50}={}){need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=1000,'Choose a bounded original respondent page');return this.#get('/api/hila/rows',{edition:id(edition),offset,limit});}
  query(build,query={}){return this.#post('/api/query',{build:id(build),query});}
  compareNative(before,after){return this.#post('/api/compare',{before:id(before),after:id(after)});}
  saveReview(input){return this.#post('/api/hila/review',request(input));}
  review(value,revision){return this.#get('/api/hila/review',{id:id(value),revision});}
  reviews(){return this.#get('/api/hila/reviews');}
  history(value){return this.#get('/api/hila/history',{id:id(value)});}
  request(value){need(typeof value==='string'&&value.length<=160,'Select the retained original request');return this.#get('/api/hila/request',{id:value});}
  report(value,{revision,public:released=false}={}){return this.#get('/api/hila/report',{id:id(value),revision,public:released?'1':'0'});}
  async receive(original){return(await this.#response('/api/import',{method:'POST',body:blob(original,ARCHIVE_LIMIT,'Complete private workspace'),headers:{'content-type':'application/zip'}})).json();}
  exportReview(value,{revision,signal}={}){return this.#response('/api/hila/export',{params:{id:id(value),revision,kind:'workspace'},signal});}
  exportReport(value,{revision,public:released=false,signal}={}){return this.#response('/api/hila/export',{params:{id:id(value),revision,kind:released?'public':'report'},signal});}
  offlineHtml(value,{revision,signal}={}){return this.#response('/api/hila/html',{params:{id:id(value),revision},signal});}
  exportDataset(build,{signal}={}){return this.#response('/api/dataset-export',{params:{build:id(build)},signal});}
  close(){this.#closed=true;if(!this.#closing)this.#closing=Promise.allSettled([...this.#active]).then(()=>undefined).catch(error=>{this.#closing=null;throw error;});return this.#closing;}
}
export function createHilaClient(connection,options){return new HilaClient(connection,options);}
export async function downloadHilaFile(response,path,options={}){
  const fs=await import('node:fs/promises'),{dirname,basename,resolve,join}=await import('node:path'),{createHash}=await import('node:crypto');
  const {acquireStateLease}=await import('../../merchant-fleet-gateway/state-lease.mjs');
  const target=resolve(path),parent=dirname(target);
  need(await fs.realpath(parent)===parent,'Output parent must be a real original directory');
  const key=createHash('sha256').update(process.platform==='win32'?basename(target).toLowerCase():basename(target)).digest('hex');
  const directory=join(parent,'.hila-output-'+key);
  await fs.mkdir(directory,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  const info=await fs.lstat(directory);
  need(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&(!process.getuid||info.uid===process.getuid()),'Original output lease directory must remain private and operator-owned');
  const lease=await acquireStateLease(directory);
  try{return await downloadLocked(response,target,options,lease);}finally{await lease.close();}
}
async function downloadLocked(response,path,{expectedSha256=null,maxBytes=ARCHIVE_LIMIT}={},lease){
  need(response instanceof Response&&response.ok,'Use the full original successful download response');
  need(typeof path==='string'&&Number.isSafeInteger(maxBytes)&&maxBytes>0,'Choose one complete output and its byte bound');
  const fs=await import('node:fs/promises'),{dirname,basename,resolve}=await import('node:path'),{createHash,randomUUID}=await import('node:crypto');
  const target=resolve(path),parent=dirname(target);
  need(await fs.realpath(parent)===parent,'Output parent must be a real original directory');
  let old=null;try{old=await fs.lstat(target);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(old)need(old.isFile()&&!old.isSymbolicLink(),'Existing output must be a regular original file');
  const stage=parent+'/.hila-'+basename(target)+'-'+randomUUID()+'.partial',handle=await fs.open(stage,'wx',0o600);
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
