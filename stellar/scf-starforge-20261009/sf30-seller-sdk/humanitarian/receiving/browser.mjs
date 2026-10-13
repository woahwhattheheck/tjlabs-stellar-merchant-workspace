// MIT. Complete receiving through the original caller-owned humanitarian Page.
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const JSON_LIMIT = 64 * 1024 * 1024;
const ARCHIVE_LIMIT = 2 * 1024 * 1024 * 1024;
const WAIT_MS = 180000;
const HEX = /^[a-f0-9]{64}$/;
const DEFINITION = ['id','name','editions','aliases','reviewer','notes','rowPolicy'];
const CHECKPOINT = 'stellar-forge.humanitarian-page-receiving-checkpoint.v1';
const STORE = 'stellar-forge.humanitarian-browser-operation.v1';
const BODY = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const clone = value => JSON.parse(JSON.stringify(value));
const need = (value, message) => { if (!value) throw new Error(message); };
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const canonical = value => Buffer.from(JSON.stringify(sorted(value)) + '\n');
const equal = (a,b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const hash = value => createHash('sha256').update(value).digest('hex');
const lexical = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const observed = promise => { promise.catch(() => {}); return promise; };

function definition(value) {
  const selected=value.definition||value;
  return Object.fromEntries(DEFINITION.map(key=>[key,clone(selected[key])]));
}
function normalized(value) { return definition(value); }
function reviewIdentity(view) {
  need(view?.schema==='stellar-forge.humanitarian-review.v1' &&
    /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(view.id) &&
    Number.isSafeInteger(view.revision)&&view.revision>0&&HEX.test(view.report)&&view.definition,
    'Select the complete original saved humanitarian review.');
  need(equal(definition(view),Object.fromEntries(DEFINITION.map(key=>[key,
    key==='editions'?view.editions.map(e=>({source:e.source,mapping:e.mapping,label:e.label,period:e.period})):view[key]]))) &&
    view.reference===view.definition.reference,'The complete saved review definition differs from its retained fields.');
  return {id:view.id,revision:view.revision,report:view.report,definitionSha256:hash(canonical(view.definition))};
}
function semanticReport(report) { return Object.fromEntries(Object.entries(report).filter(([key])=>key!=='files')); }
function reportIdentity(report,view) {
  need(report&&report.review===view.id&&report.revision===view.revision&&report.id===view.report&&
    hash(canonical(Object.fromEntries(Object.entries(report).filter(([key])=>!['id','files'].includes(key)))))===report.id &&
    equal(report.definition,view.definition),'The complete original report identity changed.');
  return report.id;
}
async function existing(path) {
  try { return await fs.lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function privateDirectory(path, create=false) {
  need(isAbsolute(path) && resolve(path) === path, 'Use an absolute original private directory.');
  if (create) await fs.mkdir(path, {mode:0o700}).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const info = await fs.lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && !(info.mode & 0o077) &&
    (!process.getuid || info.uid === process.getuid()) && await fs.realpath(path) === path,
    'The original receiving directory must be private, real and operator-owned.');
}
async function regular(path, maximum=ARCHIVE_LIMIT) {
  const info = await fs.lstat(path);
  need(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 &&
    (!process.getuid || info.uid === process.getuid()) && !(info.mode & 0o077) &&
    info.size <= maximum, 'Retain a complete private regular file without additional hard links: ' + basename(path));
  return info;
}
async function digestFile(path, maximum=ARCHIVE_LIMIT) {
  const before = await regular(path, maximum);
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const digest = createHash('sha256'); let bytes = 0;
  try {
    const opened = await handle.stat();
    need(opened.dev === before.dev && opened.ino === before.ino, 'The selected file changed while opening.');
    for await (const part of handle.createReadStream({autoClose:false})) {
      bytes += part.length; need(bytes <= maximum, 'The complete file exceeds its original selected limit.'); digest.update(part);
    }
    const after = await handle.stat();
    need(after.size === before.size && after.mtimeMs === before.mtimeMs && bytes === before.size,
      'The original file changed during full readback.');
  } finally { await handle.close(); }
  const named = await regular(path, maximum);
  need(named.dev === before.dev && named.ino === before.ino && named.size === before.size &&
    named.mtimeMs === before.mtimeMs, 'The original file name changed during readback.');
  return {path, bytes, sha256:digest.digest('hex')};
}
async function verifyFile(selected, maximum=ARCHIVE_LIMIT) {
  need(selected && isAbsolute(selected.path) && Number.isSafeInteger(selected.bytes) &&
    selected.bytes >= 0 && HEX.test(selected.sha256), 'Retain the complete original file descriptor.');
  const actual = await digestFile(selected.path, maximum);
  need(actual.bytes === selected.bytes && actual.sha256 === selected.sha256,
    'The complete retained file differs: ' + basename(selected.path));
  return {...selected, ...actual};
}
async function syncDirectory(path) {
  const handle = await fs.open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); }
}
function waitEvent(page, event, predicate=()=>true, timeout=WAIT_MS) {
  let resolvePromise, rejectPromise, ended=false;
  const promise = observed(new Promise((resolve,reject) => { resolvePromise=resolve; rejectPromise=reject; }));
  const cleanup = () => { clearTimeout(timer); page.off(event, listener); page.off('close', closed); };
  const settle = (error,value) => { if (ended) return; ended=true; cleanup(); error ? rejectPromise(error) : resolvePromise(value); };
  const listener = value => { try { if (predicate(value)) settle(null,value); } catch (error) { settle(error); } };
  const closed = () => settle(Error('The borrowed humanitarian Page closed during its original operation.'));
  const timer = setTimeout(() => settle(Error('The original humanitarian ' + event + ' observation timed out.')), timeout);
  timer.unref?.(); page.on(event, listener); page.on('close', closed);
  return {promise, cancel:() => settle(Error('The owning humanitarian operation ended this observation.'))};
}
async function idle(page, directory) {
  await page.waitForFunction(value => {
    const identity = document.getElementById('workspace-identity'), main = document.querySelector('main');
    return identity?.textContent === value && main && !main.inert &&
      document.getElementById('connection')?.textContent === 'Original workspace open';
  }, directory, {timeout:WAIT_MS});
}
async function browserRecord(page, directory, id=null) {
  return page.evaluate(async ({directory,id}) => {
    const db = await new Promise((resolve,reject) => {
      const request = indexedDB.open('stellar-forge-humanitarian-review',1);
      request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Original humanitarian browser storage is not initialized.')); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const get = (store,key) => new Promise((resolve,reject) => {
        const query = db.transaction(store,'readonly').objectStore(store).get(key);
        query.onsuccess = () => resolve(query.result ?? null); query.onerror = () => reject(query.error);
      });
      const local = await get('workspaces',directory), operation = id || local?.pending ?
        await get('operations', directory + ':' + (id || local.pending)) : null;
      if (!operation) return {local,operation:null};
      const {blob,...retained} = operation;
      let originalBlob=null;
      if (blob) {
        // Use the original operator's bounded streaming hash over its retained Blob.
        originalBlob={bytes:blob.size,type:blob.type,sha256:await sha(blob)};
      }
      return {local,operation:retained,originalBlob};
    } finally { db.close(); }
  }, {directory,id});
}
function validateBrowserOperation(record, directory, request=null, file=null) {
  const op = record?.operation;
  need(op?.schema === STORE && op.workspace === directory &&
    ['PREPARED','INVOKING','RETURN_UNCERTAIN','REJECTED','COMPLETE'].includes(op.status),
    'The original complete browser operation is unavailable.');
  need(!Object.keys(op.headers || {}).some(key => /authorization|cookie/i.test(key)),
    'Browser input metadata must not contain connection credentials.');
  if (request) need(op.id === request.requestId && op.kind === 'review' &&
    op.route === '/api/humanitarian/review' && equal(op.body,request) && op.inputSha256 === hash(BODY(request)),
    'The browser operation differs from the exact retained original save input.');
  if (file) need(op.kind === 'receive' && op.route === '/api/import' && op.body === null &&
    op.bytes === file.bytes && op.sha256 === file.sha256 && op.inputSha256 === file.sha256 &&
    record.originalBlob?.bytes === file.bytes && record.originalBlob?.sha256 === file.sha256,
    'The browser receive differs from the complete selected original packet.');
  return op;
}
async function nativeRequest(client, request) {
  try {
    const found=await client.request(request.requestId);
    need(found.id===request.requestId&&found.kind==='review'&&found.state==='completed'&&
      equal(found.input,request)&&found.inputSha256===hash(canonical(request)),
      'Native request lookup returned another original input.');
    return found;
  } catch(error) {
    if(error.status===404&&error.body?.requestNotFound===true)return null;
    throw error;
  }
}
class Receiving {
  constructor(input, kind, selection) { this.input=input; this.page=input.page; this.client=input.client;
    this.directory=input.directory; this.root=resolve(input.outputDirectory); this.kind=kind;
    this.selection=selection; this.selectionSha256=hash(canonical(selection)); this.state=null; this.errors=[]; }
  async init() {
    need(this.page && typeof this.page.locator === 'function' && this.client &&
      typeof this.client.review === 'function' && typeof this.input.retain === 'function',
      'Borrow the original Page, typed client and complete checkpoint writer.');
    await privateDirectory(this.root);
    await this.write('selection.json',this.selection);
    const local=await this.read('checkpoint.json'), incoming=this.input.checkpoint;
    for (const item of [local,incoming].filter(Boolean)) need(item.schema === CHECKPOINT &&
      item.kind === this.kind && item.operationId === this.input.operationId &&
      item.selectionSha256 === this.selectionSha256 && Number.isSafeInteger(item.sequence),
      'This checkpoint belongs to another complete browser operation.');
    if (local && incoming && local.sequence === incoming.sequence) need(equal(local,incoming),'The same checkpoint sequence has different complete content.');
    const chosen=!local ? incoming : !incoming || local.sequence >= incoming.sequence ? local : incoming;
    this.state=chosen ? clone(chosen) :
      {schema:CHECKPOINT,kind:this.kind,operationId:this.input.operationId,selectionSha256:this.selectionSha256,sequence:0,files:[],steps:{}};
    const launch=await this.client.launch();
    need(launch.schema === 'stellar-forge.humanitarian-workspace-launch.v1' && launch.workspace === this.directory,
      'The typed client must address the selected original humanitarian workspace.');
    const current=new URL(this.page.url());
    need(current.origin === this.client.origin && current.pathname === '/',
      'Borrow the Page from the same original humanitarian application.');
    await idle(this.page,this.directory);
    this.onPageError=error => this.errors.push(String(error.message || error));
    this.page.on('pageerror',this.onPageError);
    return this;
  }
  path(name) {
    need(typeof name === 'string' && name && !name.includes('\\') && !name.includes('\0') &&
      !name.split('/').some(part => !part || part === '.' || part === '..'), 'Select a receiving-owned relative file.');
    const path=join(this.root,name);
    need(relative(this.root,path) !== '..' && !relative(this.root,path).startsWith('..'+sep),
      'The complete output must remain in its original receiving directory.');
    return path;
  }
  async parents(path) {
    const components=relative(this.root,dirname(path)).split(sep).filter(Boolean); let current=this.root;
    for (const part of components) { current=join(current,part); await privateDirectory(current,true); }
  }
  async read(name) {
    const path=this.path(name); if (!await existing(path)) return null;
    await regular(path,JSON_LIMIT); const bytes=await fs.readFile(path);
    return JSON.parse(bytes.toString('utf8'));
  }
  async write(name,value,{replace=false,bytes=false}={}) {
    const path=this.path(name),body=bytes ? value : BODY(value);
    need(Buffer.isBuffer(body) && body.length <= JSON_LIMIT,'Retain complete bounded JSON or input bytes.');
    await this.parents(path);
    const old=await existing(path);
    if (old) {
      await regular(path,JSON_LIMIT); const previous=await fs.readFile(path);
      if (previous.equals(body)) return path;
      need(replace,'The original completed file differs: '+name);
    }
    const stage=join(dirname(path),'.humanitarian-page-'+basename(path)+'-'+randomUUID()+'.partial');
    const file=await fs.open(stage,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try { await file.writeFile(body); await file.sync(); } finally { await file.close(); }
    const retained=await digestFile(stage,JSON_LIMIT);
    need(retained.bytes === body.length && retained.sha256 === hash(body),'The complete stage did not retain its selected bytes.');
    if (old) {
      const still=await regular(path,JSON_LIMIT);
      need(still.dev===old.dev && still.ino===old.ino && still.size===old.size && still.mtimeMs===old.mtimeMs,
        'The original completed file changed during publication.');
    } else need(!await existing(path),'Another writer published the original output.');
    await fs.rename(stage,path); await syncDirectory(dirname(path)); return path;
  }
  async memo(name, factory) {
    const old=await this.read(name); if(old !== null) return old;
    const value=await factory(); await this.write(name,value); return value;
  }
  async save(patch) {
    const next={...this.state,...clone(patch),sequence:this.state.sequence+1};
    await this.write('checkpoint.json',next,{replace:true});
    this.state=next; await this.input.retain(clone(next)); return next;
  }
  async step(name,value) { await this.save({steps:{...this.state.steps,[name]:clone(value)}}); }
  async safePending(request=null, file=null) {
    const record=await browserRecord(this.page,this.directory,request?.requestId || this.state.receiveOperationId || null);
    if(record.local?.pending) {
      need(request || file,'Continue the current original browser input before selecting another review.');
      const op=validateBrowserOperation(record,this.directory,request,file);
      need(record.local.pending === op.id,'Another browser operation is pending.');
      need(op.status !== 'REJECTED','The original input was rejected; retain it for correction without a new request.');
    }
    return record;
  }
  async download(name, selector, selection, {route=null, maximum=ARCHIVE_LIMIT, validate=null}={}) {
    const key=name.replace(/[^a-zA-Z0-9.-]/g,'_');
    await this.write('downloads/'+key+'.intent.json',{schema:'stellar-forge.humanitarian-page-download.v1',name,selection});
    const receiptPath='downloads/'+key+'.receipt.json', old=await this.read(receiptPath);
    if(old) {
      need(old.name===name && equal(old.selection,selection) && old.file?.path===this.path('downloads/'+key),
        'The retained complete download selects another revision or output.');
      if(!await existing(old.file.path)) {
        need(old.temporary && relative(this.root,old.temporary).startsWith('downloads'+sep),'Original complete download stage is unavailable.');
        await verifyFile({...old.file,path:old.temporary},maximum); await fs.rename(old.temporary,old.file.path); await syncDirectory(dirname(old.file.path));
      }
      const file=await verifyFile(old.file,maximum); if(validate) await validate(file);
      return {name,...file};
    }
    await idle(this.page,this.directory);
    const downloadWait=waitEvent(this.page,'download'), responseWait=route ?
      waitEvent(this.page,'response',response => {
        const url=new URL(response.url()); return url.origin===this.client.origin &&
          url.pathname===route.path && Object.entries(route.params).every(([k,v])=>url.searchParams.get(k)===String(v));
      }) : null;
    let download=null, published=false;
    try {
      await this.page.locator(selector).click();
      download=await downloadWait.promise;
      const response=responseWait?await responseWait.promise:null;
      if(response) need(response.ok(),'The original complete export returned HTTP '+response.status());
      const target=this.path('downloads/'+key),temporary=this.path('downloads/.humanitarian-'+key+'-'+randomUUID()+'.partial');
      need(!await existing(target),'A complete download has no original retained receipt.');
      await download.saveAs(temporary); await fs.chmod(temporary,0o600);
      const handle=await fs.open(temporary,'r+');try{await handle.sync();}finally{await handle.close();}
      const file={path:target,...Object.fromEntries(Object.entries(await digestFile(temporary,maximum)).filter(([k])=>k!=='path'))};
      if(response) {
        const declared=response.headers()['content-length'];
        need(declared===undefined || /^\d+$/.test(declared) && Number(declared)===file.bytes,
          'The full browser download differs from its original response length.');
      }
      if(validate) await validate({...file,path:temporary});
      const receipt={schema:'stellar-forge.humanitarian-page-download-result.v1',name,selection,file,temporary,
        suggestedFilename:download.suggestedFilename(),response:response?{status:response.status(),path:route.path,params:route.params}:null};
      await this.write(receiptPath,receipt);
      await fs.rename(temporary,target); await syncDirectory(dirname(target));
      const complete={name,...await verifyFile(file,maximum)}; published=true; return complete;
    } finally {
      downloadWait.cancel(); responseWait?.cancel();
      // The Playwright owner retains its context. Only this completed transfer's temporary is released.
      if(download && published) await download.delete().catch(()=>{});
    }
  }
  async close(error=null) {
    if(this.onPageError) this.page.off('pageerror',this.onPageError);
    if(error || this.errors.length) {
      const failure={schema:'stellar-forge.humanitarian-page-receiving-failure.v1',operationId:this.input.operationId,
        selectionSha256:this.selectionSha256,error:error?String(error.message||error):null,pageErrors:this.errors,
        checkpointSequence:this.state?.sequence??null};
      await this.write('failures/'+randomUUID()+'.json',failure).catch(()=>{});
    }
  }
}

async function selectReview(r, view) {
  await idle(r.page,r.directory);
  await r.safePending();
  await r.page.locator('[data-tab="review"]').click();
  await r.page.locator('#review-existing').selectOption(view.id);
  await r.page.locator('#review-open').click(); await idle(r.page,r.directory);
  const latest=await r.client.review(view.id);
  if(latest.revision !== view.revision) {
    await r.page.locator('#review-revision').selectOption(String(view.revision));
    await r.page.locator('#review-open-revision').click(); await idle(r.page,r.directory);
  }
  const actual=await r.client.review(view.id,view.revision);
  need(equal(actual,view),'The current application does not retain the complete selected historical review.');
  const identity=await r.page.locator('#review-selection').textContent();
  need(identity.includes(view.id) && identity.includes('revision '+view.revision),
    'The Page did not open the selected original review revision.');
  return actual;
}
async function loadSavedReport(r, view, expected) {
  await r.page.locator('[data-tab="results"]').click();
  await r.page.locator('#results-load').click();await idle(r.page,r.directory);
  const report=await r.client.report(view.id,{revision:view.revision});
  reportIdentity(report,view);
  need(equal(semanticReport(report),semanticReport(expected)),'The complete selected report changed.');
  const detail=JSON.parse(await r.page.locator('#report-detail').textContent());
  need(detail.id===report.id&&detail.review===view.id&&detail.revision===view.revision&&
    equal(detail.editions,report.editions)&&equal(detail.issues,report.issues),
    'The Page opened another complete report.');
  need(equal(JSON.parse(await r.page.locator('#comparison-detail').textContent()),report.comparison),
    'The Page comparison differs from the selected complete report.');
  const cards=await r.page.locator('#results-counts .stat').allTextContents();
  for(const[key,value]of Object.entries(report.counts))
    need(cards.some(text=>text.includes(key)&&text.includes(String(value))),
      'The Page did not display the complete coverage count '+key+'.');
  return report;
}
async function originalSelection(input, kind, view, receiveFile=null) {
  need(typeof input.operationId==='string' && input.operationId.length>=1 && input.operationId.length<=160 &&
    !/[\u0000-\u0020\u007f]/.test(input.operationId), 'Retain one original browser operation ID.');
  need(input.actor && typeof input.actor.id==='string' && input.actor.id &&
    typeof input.actor.label==='string' && input.actor.label && input.actor.label.length<=160,
    'Select the named receiving operator.');
  need(typeof input.directory==='string' && isAbsolute(input.directory) && resolve(input.directory)===input.directory,
    'Select the unchanged original workspace directory.');
  reviewIdentity(view);
  if(receiveFile) await verifyFile(receiveFile);
  return {schema:'stellar-forge.humanitarian-page-receiving-selection.v1',kind,operationId:input.operationId,
    directory:input.directory,outputDirectory:resolve(input.outputDirectory),actor:clone(input.actor),review:clone(view),
    ...(input.name?{name:input.name}:{}),...(receiveFile?{receiveFile:clone(receiveFile)}:{})};
}
async function awaitOperation(r,id,previousFailure=null) {
  const until=Date.now()+WAIT_MS; let record;
  while(Date.now()<until) {
    record=await browserRecord(r.page,r.directory,id);
    const operation=record.operation;
    if(operation?.status==='COMPLETE' && !record.local?.pending) return record;
    if(operation?.status==='REJECTED' || operation?.status==='RETURN_UNCERTAIN' &&
      operation.failure?.observedAt !== previousFailure)
      throw Error('The original humanitarian operation retained '+operation.status+': '+(operation.failure?.message||id));
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('The same humanitarian operation remains unresolved; retain its original browser input and retry its lookup.');
}
async function interruptOriginal(r,{request=null,file=null,trigger,name}) {
  const routePath=request?'/api/humanitarian/review':'/api/import';
  const selected={route:routePath,...(request?{request,bodySha256:hash(BODY(request))}:{file})};
  await r.write(name+'-dispatch-intent.json',selected);
  const retained=await r.read(name+'-intercepted.json');
  if(retained) {
    need(equal(retained.selection,selected),'The original pre-provider selection changed.');
    if(file && !r.state.receiveOperationId) await r.save({receiveOperationId:retained.operation.id});
    const current=await r.safePending(request,file);
    if(current.local?.pending || current.operation?.status==='COMPLETE') return retained;
    if(request && await nativeRequest(r.client,request)) return retained;
    need(request,'Restore the original browser profile for this already-selected receive operation.');
    // A complete UI save input can reopen its same native UUID through the original
    // offline-update action when a restarted application has a new console origin.
  }
  const before=await r.safePending(request,file);
  if(before.local?.pending) {
    const operation=validateBrowserOperation(before,r.directory,request,file);
    await r.write(name+'-existing-operation.json',before);
    if(file) await r.save({receiveOperationId:operation.id});
    return {selection:selected,operation,existing:true};
  }
  if(request) {
    const native=await nativeRequest(r.client,request);
    if(native) return {selection:selected,native,existing:true};
  }
  let resolveIntercept,rejectIntercept,handled=false;
  const intercepted=observed(new Promise((resolve,reject)=>{resolveIntercept=resolve;rejectIntercept=reject;}));
  const match=url=>url.origin===r.client.origin && url.pathname===routePath;
  const activeHandlers=new Set();
  const handler=route=>{
    const task=(async()=>{
    if(route.request().method()!=='POST') return route.fallback();
    if(handled) { await route.abort('failed'); return; }
    handled=true;
    try {
      if(request) {
        const body=route.request().postDataBuffer();
        need(body && body.equals(BODY(request)), 'The actual browser POST differs from the retained complete UI input.');
      }
      const record=await browserRecord(r.page,r.directory,request?.requestId || null);
      const operation=validateBrowserOperation(record,r.directory,request,file);
      need(record.local.pending===operation.id,'The exact operation was not retained before browser dispatch.');
      const prepared={selection:selected,operation,browser:record,outcome:'INTERCEPTED_BEFORE_PROVIDER'};
      await r.write(retained?'observations/'+name+'-reintercept-'+randomUUID()+'.json':name+'-intercepted.json',prepared);
      if(file) await r.save({receiveOperationId:operation.id});
      await r.step(name+'InputRetained',{operationId:operation.id,inputSha256:operation.inputSha256});
      await route.abort('failed');
      await r.write(retained?'observations/'+name+'-abort-'+randomUUID()+'.json':name+'-abort-return.json',
        {operationId:operation.id,outcome:'ABORTED_BEFORE_PROVIDER'});
      resolveIntercept(prepared);
    } catch(error) {
      await route.abort('failed').catch(()=>{}); rejectIntercept(error);
    }
    })();
    activeHandlers.add(task);
    return observed(task.finally(()=>activeHandlers.delete(task)));
  };
  await r.page.route(match,handler);
  const timer=setTimeout(()=>rejectIntercept(Error('The original browser did not dispatch the selected retained input.')),WAIT_MS);
  timer.unref?.();
  try { await trigger(); return await intercepted; }
  finally {
    clearTimeout(timer);
    try { await r.page.unroute(match,handler); }
    finally { await Promise.allSettled([...activeHandlers]); }
  }
}
async function continueOriginal(r,{request=null,file=null,name}) {
  let record=await r.safePending(request,file);
  const id=request?.requestId || r.state.receiveOperationId || record.local?.pending;
  need(id,'Retain the actual original browser operation identity.');
  if(request) {
    const native=await nativeRequest(r.client,request);
    if(native && !record.local?.pending) {
      if(record.operation) validateBrowserOperation(record,r.directory,request);
      await r.write(name+'-native-reconciliation.json',native);
      return {native,record};
    }
  }
  if(record.local?.pending) {
    validateBrowserOperation(record,r.directory,request,file);
    need(record.local.pending===id,'Another original browser input is pending.');
    await r.page.reload({waitUntil:'domcontentloaded'}); await idle(r.page,r.directory);
    record=await r.safePending(request,file);
    need(record.local?.pending===id,'Reload did not retain the same original operation.');
    await r.write(name+'-reload.json',{id,inputSha256:record.operation.inputSha256,
      body:record.operation.body,bytes:record.operation.bytes??null,sha256:record.operation.sha256??null});
    const priorFailure=record.operation.failure?.observedAt || null;
    await r.page.locator('#continue-operation').click();
    record=await awaitOperation(r,id,priorFailure);
  } else {
    need(record.operation?.status==='COMPLETE','The original browser input has no completed or pending operation to continue.');
  }
  const operation=validateBrowserOperation(record,r.directory,request,file);
  need(operation.status==='COMPLETE' && !record.local?.pending,'The browser operation is not complete.');
  if(request) {
    const native=await nativeRequest(r.client,request);
    need(native && equal(native.result,operation.result),'The complete browser and native saved results differ.');
    await r.write(name+'-completed-browser.json',record);
    await r.write(name+'-native-reconciliation.json',native);
    return {native,record};
  }
  need(operation.result?.schema==='stellar-forge.humanitarian-received.v1'&&
    Array.isArray(operation.result.receivedRevisions)&&operation.result.review,
    'The actual receiver returned no complete original history.');
  await r.write(name+'-completed-browser.json',record); return {record,result:operation.result};
}

async function preparePlan(r,before,report,history) {
  reportIdentity(report,before);
  need(history?.id===before.id&&Array.isArray(history.revisions)&&history.revisions.some(v=>equal(v,before)),
    'Retain the entire original selected review history.');
  return r.memo('review-plan.json',async()=>{
    const expected=definition(before);
    expected.reviewer=r.input.actor.label;
    expected.notes=before.notes+(before.notes?'\n\n':'')+
      'Complete original source editions, administrative reference, mappings, named decisions and reporting outputs reviewed by '+
      r.input.actor.label+' in '+r.input.operationId+'. The source selection and reporting policy remain unchanged.';
    need(expected.notes.length<=12000,'The complete named review note exceeds its original bound.');
    return {schema:'stellar-forge.humanitarian-page-review-plan.v1',before:reviewIdentity(before),
      expected,report:clone(report),history:clone(history)};
  });
}
function validateSaveInput(request,before,plan) {
  need(request&&equal(Object.keys(request).sort(),[...DEFINITION,'requestId','expectedRevision'].sort())&&
    /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(request.requestId)&&request.id===before.id&&
    request.expectedRevision===before.revision&&equal(definition(request),plan.expected),
    'The complete UI input changed more than the selected reviewer and named note.');
}
async function prepareUiInput(r,before,plan) {
  const prior=await r.read('review-request.json');
  if(prior){validateSaveInput(prior,before,plan);return prior;}
  let preview=await r.read('review-ui-preview.json');
  if(!preview) {
    const browser=await browserRecord(r.page,r.directory);
    if(browser.local?.pending) {
      preview=browser.operation?.body;
      validateSaveInput(preview,before,plan);
      validateBrowserOperation(browser,r.directory,preview);
    } else {
      await r.memo('initial-browser-state.json',async()=>browser);
      // Recover a UI-generated preview after a lost companion write, before
      // another click could allocate a different original request identifier.
      const text=await r.page.locator('#review-json').inputValue();
      if(text.trim()) {
        try { const candidate=JSON.parse(text);validateSaveInput(candidate,before,plan);preview=candidate; }
        catch {}
      }
      if(!preview) {
        await selectReview(r,before);
        await r.page.locator('#review-reviewer').fill(plan.expected.reviewer);
        await r.page.locator('#review-notes').fill(plan.expected.notes);
        await r.page.locator('[data-preview="review"]').click();await idle(r.page,r.directory);
        preview=JSON.parse(await r.page.locator('#review-json').inputValue());
        validateSaveInput(preview,before,plan);
      }
    }
    await r.write('review-ui-preview.json',preview);
  }
  validateSaveInput(preview,before,plan);
  const pending=await browserRecord(r.page,r.directory,preview.requestId);
  if(!pending.local?.pending) {
    await r.page.locator('[data-tab="review"]').click();
    await r.page.locator('#review-json').evaluate((node,value)=>{
      node.closest('details').open=true;node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));
    },BODY(preview).toString('utf8'));
    const file=await r.download('prepared-review-input.json','[data-download="review"]',
      {before:reviewIdentity(before),request:preview},{maximum:JSON_LIMIT,validate:async selected=>{
        need(equal(JSON.parse(await fs.readFile(selected.path,'utf8')),preview),
          'The full UI preview download changed its original request.');
      }});
    need(equal(JSON.parse(await fs.readFile(file.path,'utf8')),preview),'The original downloaded UI input differs.');
  } else validateBrowserOperation(pending,r.directory,preview);
  await r.write('review-request.json',preview);await r.save({request:preview});return preview;
}
async function clickResponse(r,selector,path,params,action=null) {
  const wait=waitEvent(r.page,'response',response=>{
    const url=new URL(response.url());
    return url.origin===r.client.origin&&url.pathname===path&&
      Object.entries(params).every(([key,value])=>url.searchParams.get(key)===String(value));
  });
  try {
    if(action)await action();else await r.page.locator(selector).click();
    const response=await wait.promise;
    need(response.ok(),'The original Page read failed with HTTP '+response.status());
    const value=await response.json();await idle(r.page,r.directory);return value;
  } finally {wait.cancel();}
}
async function shot(r,name,selection) {
  need(/^[a-z0-9][a-z0-9-]{0,79}$/.test(name),'Use a stable viewport observation name.');
  const viewport=r.page.viewportSize();
  need(viewport&&viewport.width<=1600&&viewport.height<=1200,'Capture a bounded useful original viewport.');
  await r.write('views/'+name+'.intent.json',{name,selection,viewport,scope:'viewport'});
  const key='views/'+name+'.receipt.json',old=await r.read(key),target=r.path('views/'+name+'.png');
  if(old) {
    need(old.file.path===target&&equal(old.selection,selection)&&equal(old.viewport,viewport),
      'The retained viewport selection changed.');
    if(!await existing(target)) {
      need(old.temporary&&dirname(old.temporary)===dirname(target),'The original viewport stage is unavailable.');
      await verifyFile({...old.file,path:old.temporary},JSON_LIMIT);
      await fs.rename(old.temporary,target);await syncDirectory(dirname(target));
    }
    return {name:'view-'+name+'.png',...await verifyFile(old.file,JSON_LIMIT)};
  }
  await r.parents(target);need(!await existing(target),'An original viewport has no complete retained receipt.');
  const temporary=join(dirname(target),'.'+name+'-'+randomUUID()+'.partial');
  await r.page.evaluate(()=>window.scrollTo(0,0));
  await r.page.screenshot({path:temporary,type:'png',fullPage:false,animations:'disabled'});
  await fs.chmod(temporary,0o600);const handle=await fs.open(temporary,'r+');
  try {await handle.sync();} finally {await handle.close();}
  const original=await digestFile(temporary,JSON_LIMIT),file={...original,path:target};
  await r.write(key,{name,selection,viewport,file,temporary,scope:'viewport'});
  await fs.rename(temporary,target);await syncDirectory(dirname(target));
  return {name:'view-'+name+'.png',...await verifyFile(file,JSON_LIMIT)};
}
function historyPrefix(actual,expected,review) {
  need(actual?.id===review.id&&Array.isArray(actual.revisions)&&expected?.id===review.id&&Array.isArray(expected.revisions),
    'The complete original history envelope is unavailable.');
  for(const prior of expected.revisions.filter(v=>v.revision<=review.revision))
    need(equal(actual.revisions.find(v=>v.revision===prior.revision),prior),'The original historical revision changed.');
  need(equal(actual.revisions.find(v=>v.revision===review.revision),review),
    'The complete selected review is absent from retained history.');
}
function selectedHistory(actual,view) {
  need(actual?.id===view.id&&Array.isArray(actual.revisions),'The complete retained history is unavailable.');
  const selected={...clone(actual),revisions:actual.revisions.filter(row=>row.revision<=view.revision)};
  need(equal(selected.revisions.map(row=>row.revision),Array.from({length:view.revision},(_,i)=>i+1)),
    'The selected original history is not a complete ordered prefix.');
  return selected;
}
async function inspectViews(r,view,report,expectedHistory,prefix) {
  await r.safePending();await r.page.setViewportSize({width:1360,height:900});
  await selectReview(r,view);
  const history=selectedHistory(await r.client.history(view.id),view);historyPrefix(history,expectedHistory,view);
  await r.write('observations/'+prefix+'-history.json',history);
  const snapshots=[],sourceIds=[...new Set(view.editions.map(e=>e.source))];
  const reference=await r.client.reference(view.reference);sourceIds.push(reference.source);
  await r.page.locator('[data-tab="sources"]').click();
  for(const id of [...new Set(sourceIds)]) {
    await r.page.locator('#source-selected').selectOption(id);
    const actual=await clickResponse(r,'#source-inspect','/api/source',{id});
    need(equal(actual,await r.client.source(id))&&
      equal(JSON.parse(await r.page.locator('#source-detail').textContent()),actual),
      'The Page lost the complete original source inventory.');
    await r.write('observations/'+prefix+'-source-'+id+'.json',actual);
  }
  snapshots.push(await shot(r,prefix+'-sources',reviewIdentity(view)));
  await r.page.locator('[data-tab="reference"]').click();
  await r.page.locator('#reference-existing').selectOption(view.reference);
  const ref=await clickResponse(r,'#reference-open','/api/humanitarian/reference',{id:view.reference});
  need(equal(ref,reference)&&equal(JSON.parse(await r.page.locator('#reference-result').textContent()),reference),
    'The Page reference differs from the complete original edition.');
  await r.write('observations/'+prefix+'-reference.json',reference);
  snapshots.push(await shot(r,prefix+'-reference',reviewIdentity(view)));
  await r.page.locator('[data-tab="mapping"]').click();
  for(const id of [...new Set(view.editions.map(e=>e.mapping))]) {
    await r.page.locator('#mapping-existing').selectOption(id);
    const mapping=await clickResponse(r,'#mapping-open','/api/humanitarian/mapping',{id});
    need(equal(mapping,await r.client.mapping(id))&&
      equal(JSON.parse(await r.page.locator('#mapping-result').textContent()),mapping),
      'The Page mapping changed an original field or reporting layout.');
    await r.write('observations/'+prefix+'-mapping-'+id+'.json',mapping);
  }
  snapshots.push(await shot(r,prefix+'-mapping',reviewIdentity(view)));
  await r.page.locator('[data-tab="aliases"]').click();
  const aliases=await r.page.locator('#alias-list pre').allTextContents();
  for(const id of view.aliases) {
    const alias=await r.client.alias(id);
    need(aliases.some(text=>equal(JSON.parse(text),alias)),'The Page omitted a selected named resolution decision.');
    await r.write('observations/'+prefix+'-alias-'+id+'.json',alias);
  }
  snapshots.push(await shot(r,prefix+'-resolution',reviewIdentity(view)));
  await selectReview(r,view);snapshots.push(await shot(r,prefix+'-review',reviewIdentity(view)));
  const actualReport=await loadSavedReport(r,view,report);
  for(let edition=0;edition<view.editionCount;edition++) {
    await r.page.locator('#rows-edition').selectOption(String(edition));
    await r.page.locator('#rows-issues').uncheck();await idle(r.page,r.directory);
    let offset=0;
    for(;;) {
      const page=await clickResponse(r,offset?'#rows-next':'#rows-load','/api/humanitarian/rows',
        {id:view.id,revision:view.revision,edition,offset,limit:50,issues:0});
      const expected=await r.client.rows(view.id,{revision:view.revision,edition,offset,limit:50,issues:false});
      need(equal(page,expected)&&page.offset===offset&&Array.isArray(page.rows),
        'The Page normalized source register differs from the complete selected native page.');
      need(await r.page.locator('#rows-table tbody tr').count()===page.rows.length,
        'The Page did not render every selected source row.');
      await r.write('observations/'+prefix+'-rows-'+edition+'-'+offset+'.json',page);
      if(offset+page.rows.length>=page.total)break;
      need(page.rows.length>0,'The complete source register stopped advancing.');offset+=page.rows.length;
    }
  }
  await r.page.locator('#result-search').fill('');
  for(let index=0;index<report.outputs.length;index++) {
    const output=report.outputs[index];let offset=0;
    for(;;) {
      const page=await clickResponse(r,'#output-next','/api/humanitarian/output-rows',
        {id:view.id,revision:view.revision,edition:output.edition,output:output.output,offset,limit:50},
        offset?null:()=>r.page.locator('#result-output').selectOption(String(index)));
      need(equal(page,await r.client.outputRows(view.id,{revision:view.revision,edition:output.edition,
        output:output.output,offset,limit:50}))&&page.offset===offset&&page.total===output.rows,
        'The Page reporting output differs from its complete original native page.');
      need(await r.page.locator('#output-table tbody tr').count()===page.rows.length,
        'The Page did not render every selected reporting row.');
      await r.write('observations/'+prefix+'-output-'+index+'-'+offset+'.json',page);
      if(offset+page.rows.length>=page.total)break;
      need(page.rows.length>0,'The complete reporting output stopped advancing.');offset+=page.rows.length;
    }
  }
  await r.page.locator('#comparison-load').evaluate(node=>{node.closest('details').open=true;});
  let offset=0;
  for(;;) {
    const page=await clickResponse(r,offset?'#comparison-next':'#comparison-load','/api/humanitarian/comparison-rows',
      {id:view.id,revision:view.revision,offset,limit:50});
    need(equal(page,await r.client.comparisonRows(view.id,{revision:view.revision,offset,limit:50})),
      'The Page comparison changed an original key, type or value.');
    need(await r.page.locator('#comparison-table tbody tr').count()===page.rows.length,
      'The Page did not render every selected comparison row.');
    await r.write('observations/'+prefix+'-comparison-'+offset+'.json',page);
    if(offset+page.rows.length>=page.total)break;
    need(page.rows.length>0,'The complete comparison stopped advancing.');offset+=page.rows.length;
  }
  snapshots.push(await shot(r,prefix+'-results',reviewIdentity(view)));
  await r.page.setViewportSize({width:390,height:844});
  await loadSavedReport(r,view,report);
  snapshots.push(await shot(r,prefix+'-phone',reviewIdentity(view)));
  await r.page.locator('[data-tab="transfer"]').click();
  snapshots.push(await shot(r,prefix+'-handover',reviewIdentity(view)));
  await r.page.setViewportSize({width:1360,height:900});
  return {files:snapshots,history,report:actualReport};
}
async function fourDownloads(r,review,report,request) {
  const selected=reviewIdentity(review),files=[];
  await r.page.locator('[data-tab="results"]').click();
  files.push(await r.download('report.json','#download-report-json',selected,{maximum:JSON_LIMIT,validate:async file=>{
    need(equal(JSON.parse(await fs.readFile(file.path,'utf8')),report),'The complete downloaded report JSON changed.');
  }}));
  files.push(await r.download('report.zip','#download-report',selected,
    {route:{path:'/api/humanitarian/export',params:{id:review.id,revision:review.revision,kind:'report'}}}));
  await r.page.locator('[data-tab="transfer"]').click();
  files.push(await r.download('review.zip','#download-workspace',selected,
    {route:{path:'/api/humanitarian/export',params:{id:review.id,revision:review.revision,kind:'workspace'}}}));
  files.push(await r.download('review-input.json','#download-selected-input',selected,{maximum:JSON_LIMIT,validate:async file=>{
    need(equal(JSON.parse(await fs.readFile(file.path,'utf8')),request),'The full downloaded original review input changed.');
  }}));
  return files;
}
function unchangedReport(before,after) {
  for(const key of ['schema','review','status','reference','counts','editions','outputs','comparison','issues','logicalSha256'])
    need(equal(before[key],after[key]),'The named note changed the original complete report '+key+'.');
}
async function completedFiles(r) {
  need(Array.isArray(r.state.files)&&new Set(r.state.files.map(file=>file.name)).size===r.state.files.length,
    'Retain each complete original browser file exactly once.');
  const prefix=r.kind==='source-review'?'source':r.input.name;
  const expected=['sources','reference','mapping','resolution','review','results','phone','handover']
    .map(role=>'view-'+prefix+'-'+role+'.png');
  if(r.kind==='source-review')expected.push('report.json','report.zip','review.zip','review-input.json');
  need(equal(r.state.files.map(file=>file.name).sort(),expected.sort()),
    'The complete browser file selection lost an original download or viewport.');
  for(const file of r.state.files) {
    const expected=file.name.startsWith('view-')?r.path('views/'+file.name.slice(5)):
      r.path('downloads/'+file.name);
    need(file.path===expected,'A complete selected browser file moved outside its original output.');
    await verifyFile(file);
  }
}
export async function runHumanitarianBrowserReceiving(input) {
  const before=clone(input.before),baselineReport=clone(input.report),baselineHistory=clone(input.history);
  const selection={...await originalSelection(input,'source-review',before),report:baselineReport,history:baselineHistory};
  const r=new Receiving(input,'source-review',selection);let failure=null;
  try {
    await r.init();
    if(r.state.complete) {
      need(equal(await r.read('receipt.json'),r.state.receipt),'The complete original browser receipt changed.');
      await completedFiles(r);
      const native=await nativeRequest(r.client,r.state.request);
      need(native&&equal(native.result,r.state.reviewed)&&
        equal(await r.client.report(r.state.reviewed.id,{revision:r.state.reviewed.revision}),r.state.report),
        'The completed original browser revision no longer replays.');
      return clone({reviewed:r.state.reviewed,report:r.state.report,request:r.state.request,
        files:r.state.files,receipt:r.state.receipt,checkpoint:r.state});
    }
    need(equal(await r.client.review(before.id,before.revision),before),'The original source baseline changed.');
    need(equal(await r.client.report(before.id,{revision:before.revision}),baselineReport),
      'The full original baseline report changed.');
    historyPrefix(await r.client.history(before.id),baselineHistory,before);
    const plan=await preparePlan(r,before,baselineReport,baselineHistory);
    need(equal(plan.before,reviewIdentity(before))&&equal(plan.report,baselineReport)&&equal(plan.history,baselineHistory),
      'The retained review plan selected another original baseline.');
    const request=await prepareUiInput(r,before,plan);
    if(!await nativeRequest(r.client,request))
      need(equal(await r.client.review(before.id),before),'The original source head changed before this saved request.');
    await interruptOriginal(r,{request,name:'review',trigger:async()=>{
      await r.page.locator('[data-tab="transfer"]').click();
      await r.page.locator('#review-input-file').setInputFiles(r.path('review-request.json'));
      await r.page.locator('#review-input-receive').click();
    }});
    const completed=await continueOriginal(r,{request,name:'review'}),reviewed=completed.native.result;
    reviewIdentity(reviewed);
    need(reviewed.id===before.id&&reviewed.revision===before.revision+1&&equal(definition(reviewed),plan.expected)&&
      reviewed.reference===before.reference&&equal(reviewed.counts,before.counts),
      'The original saved browser revision changed more than reviewer and notes.');
    const report=await r.client.report(reviewed.id,{revision:reviewed.revision});
    reportIdentity(report,reviewed);unchangedReport(baselineReport,report);
    await r.write('reviewed.json',reviewed);await r.write('report.json',report);
    const history=selectedHistory(await r.client.history(reviewed.id),reviewed);
    historyPrefix(history,baselineHistory,reviewed);
    await r.write('history.json',history);
    const views=await inspectViews(r,reviewed,report,history,'source');
    const files=[...await fourDownloads(r,reviewed,report,request),...views.files];
    need(r.errors.length===0,'The original Page reported JavaScript errors: '+r.errors.join('; '));
    const receipt={schema:'stellar-forge.humanitarian-page-receiving.v1',state:'COMPLETE',
      operationId:input.operationId,workspace:input.directory,actor:input.actor,before:reviewIdentity(before),
      reviewed:reviewIdentity(reviewed),requestId:request.requestId,requestInputSha256:hash(canonical(request)),
      browserInputSha256:hash(BODY(request)),reportId:report.id,history,files,pageErrors:[],
      checks:['complete original source, reference, mappings, named decisions and prior review history retained',
        'actual UI-generated original input saved before pre-provider interruption and same-request reload/continuation',
        'named reviewer and note are the only definition changes; source row counts and all reporting calculations unchanged',
        'all source register, output and comparison pages compared to complete native results',
        'all four actual UI downloads retained and verified before replay',
        'bounded desktop and phone views retained with full original selections']};
    await r.write('receipt.json',receipt);await r.save({complete:true,request,reviewed,report,history,files,receipt});
    return clone({reviewed,report,request,files,receipt,checkpoint:r.state});
  }catch(error){failure=error;throw error;}finally{await r.close(failure);}
}
export async function inspectHumanitarianReceivedPage(input) {
  const review=clone(input.review),report=clone(input.report),history=clone(input.history);
  need(typeof input.name==='string'&&/^[a-z0-9][a-z0-9-]{0,39}$/.test(input.name),
    'Choose a stable received or cold-reopened Page observation name.');
  const selection={...await originalSelection(input,'received-'+input.name,review,input.receiveFile||null),report,history};
  const r=new Receiving(input,'received-'+input.name,selection);let failure=null;
  try {
    await r.init();
    if(r.state.complete) {
      need(equal(await r.read('receipt.json'),r.state.receipt)&&equal(r.state.reviewed,review),
        'The completed recipient Page selection changed.');
      await completedFiles(r);
      need(equal(await r.client.review(review.id,review.revision),review)&&
        equal(semanticReport(await r.client.report(review.id,{revision:review.revision})),semanticReport(report)),
        'The complete original received revision changed.');
      return clone({files:r.state.files,receipt:r.state.receipt,checkpoint:r.state});
    }
    let receiving=null;
    if(input.receiveFile) {
      const file=await verifyFile(input.receiveFile);
      await r.write('receive-file.json',{path:file.path,bytes:file.bytes,sha256:file.sha256});
      if(!r.state.steps.received) {
        await r.safePending(null,file);await r.page.locator('[data-tab="transfer"]').click();
        await interruptOriginal(r,{file,name:'receive',trigger:async()=>{
          await r.page.locator('#receive-file').setInputFiles(file.path);
          await r.page.locator('#receive-form button[type="submit"]').click();
        }});
        const completed=await continueOriginal(r,{file,name:'receive'});
        receiving=completed.result||completed.record.operation.result;
        need(receiving.schema==='stellar-forge.humanitarian-received.v1'&&receiving.review.id===review.id&&
          receiving.review.revision>=review.revision&&
          equal(receiving.receivedRevisions,Array.from({length:review.revision},(_,i)=>i+1)),
          'The independent original receive returned another complete history.');
        await r.write('receiving-result.json',receiving);await r.step('received',receiving);
      }else {
        receiving=await r.read('receiving-result.json');
        need(receiving&&equal(receiving,r.state.steps.received),'The retained complete receive result changed.');
      }
    }
    await r.safePending();await selectReview(r,review);
    const actualReport=await r.client.report(review.id,{revision:review.revision});
    reportIdentity(actualReport,review);
    need(equal(semanticReport(actualReport),semanticReport(report)),'The received complete report semantics changed.');
    const views=await inspectViews(r,review,actualReport,history,input.name);
    need(r.errors.length===0,'The received Page reported JavaScript errors: '+r.errors.join('; '));
    const receipt={schema:'stellar-forge.humanitarian-received-page.v1',state:'COMPLETE',name:input.name,
      operationId:input.operationId,workspace:input.directory,actor:input.actor,review:reviewIdentity(review),
      reportId:actualReport.id,history:views.history,receiving,files:views.files,pageErrors:[],
      checks:['full independently received revision and original source/reference/mapping/decision history reopened',
        'all selected source, output and comparison pages checked through actual Page and original client',
        'desktop and phone viewport observations retained',
        input.receiveFile?'complete original ZIP received through retained Blob and same-operation reload/continuation':
          'same retained workspace viewed after caller-owned cold reopen']};
    await r.write('receipt.json',receipt);await r.save({complete:true,reviewed:review,report:actualReport,files:views.files,receipt});
    return clone({files:views.files,receipt,checkpoint:r.state});
  }catch(error){failure=error;throw error;}finally{await r.close(failure);}
}
