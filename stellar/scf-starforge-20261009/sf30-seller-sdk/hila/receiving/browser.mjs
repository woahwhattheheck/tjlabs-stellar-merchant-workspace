// MIT. Complete receiving through the original caller-owned HILA Page.
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const JSON_LIMIT = 64 * 1024 * 1024;
const ARCHIVE_LIMIT = 4 * 1024 * 1024 * 1024;
const WAIT_MS = 180000;
const HEX = /^[a-f0-9]{64}$/;
const DEFINITION = ['name','notes','editions','rules','selection','review','rowDecisions','cellDecisions'];
const CHECKPOINT = 'stellar-forge.hila-page-receiving-checkpoint.v1';
const STORE = 'stellar-forge.hila-browser-operation.v1';
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

function definition(value) { return Object.fromEntries(DEFINITION.map(key => [key, clone(value[key])])); }
function normalized(value) {
  const result = definition(value);
  for (const values of Object.values(result.selection))
    values.sort((a,b) => a === b ? 0 : a === null ? -1 : b === null ? 1 : lexical(a,b));
  result.rowDecisions.sort((a,b) => lexical(a.edition,b.edition) || lexical(a.recordId,b.recordId));
  result.cellDecisions.sort((a,b) => lexical(a.key,b.key));
  return result;
}
function reviewIdentity(view) {
  need(view?.schema === 'stellar-forge.hila-review.v1' && HEX.test(view.id) &&
    Number.isSafeInteger(view.revision) && view.revision > 0 && HEX.test(view.definitionSha256),
    'Select the complete original saved HILA review.');
  need(hash(canonical(definition(view))) === view.definitionSha256,
    'The selected full review definition differs from its original hash.');
  return {id:view.id, revision:view.revision, definitionSha256:view.definitionSha256};
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
  const closed = () => settle(Error('The borrowed HILA Page closed during its original operation.'));
  const timer = setTimeout(() => settle(Error('The original HILA ' + event + ' observation timed out.')), timeout);
  timer.unref?.(); page.on(event, listener); page.on('close', closed);
  return {promise, cancel:() => settle(Error('The owning HILA operation ended this observation.'))};
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
      const request = indexedDB.open('stellar-forge-hila-review',1);
      request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Original HILA browser storage is not initialized.')); };
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
        const digest = await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
        originalBlob={bytes:blob.size,type:blob.type,sha256:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')};
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
  if (request) need(op.id === request.requestId && op.kind === 'review.save' &&
    op.route === '/api/hila/review' && equal(op.body,request) && op.inputSha256 === hash(BODY(request)),
    'The browser operation differs from the exact retained original save input.');
  if (file) need(op.kind === 'receive' && op.route === '/api/import' && op.body === null &&
    op.bytes === file.bytes && op.sha256 === file.sha256 && op.inputSha256 === file.sha256 &&
    record.originalBlob?.bytes === file.bytes && record.originalBlob?.sha256 === file.sha256,
    'The browser receive differs from the complete selected original packet.');
  return op;
}
async function nativeRequest(client, request) {
  try {
    const found = await client.request(request.requestId);
    need(found.schema === 'stellar-forge.hila-request.v1' && found.id === request.requestId &&
      found.kind === 'review.save' && equal(found.input,request) &&
      found.inputSha256 === hash(canonical(request)), 'Native request lookup returned a different original input.');
    return found;
  } catch (error) {
    if ([400,404].includes(error.status) && /Unknown original HILA request/.test(error.body?.error || error.message)) return null;
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
    need(launch.schema === 'stellar-forge.hila-workspace-launch.v1' && launch.workspace === this.directory,
      'The typed client must address the selected original HILA workspace.');
    const current=new URL(this.page.url());
    need(current.origin === this.client.origin && current.pathname === '/',
      'Borrow the Page from the same original HILA application.');
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
    const stage=join(dirname(path),'.hila-page-'+basename(path)+'-'+randomUUID()+'.partial');
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
    await this.write('downloads/'+key+'.intent.json',{schema:'stellar-forge.hila-page-download.v1',name,selection});
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
      const target=this.path('downloads/'+key),temporary=this.path('downloads/.hila-'+key+'-'+randomUUID()+'.partial');
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
      const receipt={schema:'stellar-forge.hila-page-download-result.v1',name,selection,file,temporary,
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
      const failure={schema:'stellar-forge.hila-page-receiving-failure.v1',operationId:this.input.operationId,
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
  await r.page.locator('#saved-review').selectOption(view.id);
  await r.page.locator('#review-open').click(); await idle(r.page,r.directory);
  const latest=await r.client.review(view.id);
  if(latest.revision !== view.revision) {
    await r.page.locator('#history').selectOption(String(view.revision));
    await r.page.locator('#history-open').click(); await idle(r.page,r.directory);
  }
  const actual=await r.client.review(view.id,view.revision);
  need(equal(actual,view),'The current application does not retain the complete selected historical review.');
  const identity=await r.page.locator('#review-identity').textContent();
  need(identity.includes(view.id) && identity.includes('revision '+view.revision),
    'The Page did not open the selected original review revision.');
  return actual;
}
async function loadSavedReport(r, view, expected) {
  await r.page.locator('[data-tab="report"]').click();
  await r.page.locator('#report-load').click(); await idle(r.page,r.directory);
  const report=await r.client.report(view.id,{revision:view.revision});
  need(equal(report,expected) && report.reviewId===view.id && report.revision===view.revision &&
    report.definitionSha256===view.definitionSha256 && hash(canonical(report))===view.report.sha256,
    'The complete Page report differs from its original saved review.');
  const overview=await r.page.locator('#report-overview').evaluate(node =>
    [...node.querySelectorAll('pre')].map(item=>JSON.parse(item.textContent)));
  need(equal(overview,report.editions.map(item=>item.counts)),
    'The Page did not display every original edition denominator.');
  need(equal(JSON.parse(await r.page.locator('#comparison').textContent()),report.comparison),
    'The Page did not retain the full edition comparison.');
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
  return {schema:'stellar-forge.hila-page-receiving-selection.v1',kind,operationId:input.operationId,
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
      throw Error('The original HILA operation retained '+operation.status+': '+(operation.failure?.message||id));
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('The same HILA operation remains unresolved; retain its original browser input and retry its lookup.');
}
async function interruptOriginal(r,{request=null,file=null,trigger,name}) {
  const routePath=request?'/api/hila/review':'/api/import';
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
    await r.page.locator('#retry').click();
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
  need(operation.result?.reconstructed===true && equal(operation.result.packet,{bytes:file.bytes,sha256:file.sha256}),
    'The actual receiving result did not reconstruct the selected complete packet.');
  await r.write(name+'-completed-browser.json',record); return {record,result:operation.result};
}
async function choosePlan(r,before) {
  return r.memo('row-review-plan.json',async()=>{
    need(Object.values(before.selection).every(values=>Array.isArray(values)&&values.length===0),
      'This complete receiving operation selects the original unrestricted r4 cohort.');
    const report=await r.client.report(before.id,{revision:before.revision});
    need(hash(canonical(report))===before.report.sha256,'The original full baseline report changed.');
    let selected=null;
    for(const edition of before.editions) {
      let offset=0;
      while(selected===null) {
        const page=await r.client.rows(edition,{offset,limit:1000});
        need(page.edition===edition && page.offset===offset && Array.isArray(page.rows) &&
          Number.isSafeInteger(page.total), 'The original coded respondent page is inconsistent.');
        const row=page.rows.find(row=>row.consent==='yes' && row.sourceRow>=10 &&
          !before.rowDecisions.some(decision=>decision.edition===edition&&decision.recordId===row.recordId));
        if(row) { selected={edition,row}; break; }
        if(page.nextOffset===null)break;
        need(Number.isSafeInteger(page.nextOffset)&&page.nextOffset>offset,'The original respondent cursor did not advance.');
        offset=page.nextOffset;
      }
      if(selected)break;
    }
    need(selected,'The complete original cohort has no eligible undecided coded row for the named note.');
    const note='Original coded row '+selected.row.sourceRow+' reviewed in '+r.input.operationId+
      '. Source answers and consent are retained; this note changes no inclusion or scoring decision.';
    const change={edition:selected.edition,recordId:selected.row.recordId,decision:'note',reviewer:r.input.actor.label,note};
    const expected=definition(before); expected.rowDecisions.push(change);
    expected.review={status:'reviewed',reviewer:r.input.actor.label,note:before.review.note+
      (before.review.note?'\n\n':'')+'Complete original editions and report reviewed by '+r.input.actor.label+
      ' in '+r.input.operationId+'. The original cohort, rules and all prior decisions are retained.'};
    need(expected.review.note.length<=8000,'The named receiving note exceeds the original review bound.');
    return {schema:'stellar-forge.hila-page-row-review.v1',before:reviewIdentity(before),selected,
      decision:change,expected:normalized(expected),report};
  });
}
async function prepareUiInput(r,before,plan) {
  const prior=await r.read('review-request.json');
  if(prior) { validateSaveInput(prior,before,plan); return prior; }
  // A completed input download is selected before touching an already-edited draft again.
  const downloadReceipt=await r.read('downloads/review-input.json.receipt.json');
  if(!downloadReceipt) {
    await r.safePending();
    await r.memo('initial-browser-state.json',()=>browserRecord(r.page,r.directory));
    await selectReview(r,before);
    await r.page.locator('#rows-edition').selectOption(plan.selected.edition);
    await r.page.locator('#rows-load').click(); await idle(r.page,r.directory);
    let offset=0;
    while(true) {
      const rows=await r.page.locator('#respondent-rows tr').allTextContents();
      if(rows.some(text=>text.includes(plan.selected.row.recordId)))break;
      need(offset<100000 && !await r.page.locator('#rows-next').isDisabled(),
        'The selected original coded row was not displayed by the Page.');
      await r.page.locator('#rows-next').click(); await idle(r.page,r.directory); offset+=50;
    }
    const row=r.page.locator('#respondent-rows tr').filter({hasText:plan.selected.row.recordId});
    need(await row.count()===1,'The original row identity is not unique in the displayed page.');
    await row.getByRole('button',{name:'Review',exact:true}).click();
    const actual=JSON.parse(await r.page.locator('#respondent-json').textContent());
    need(equal(actual,{...plan.selected.row,edition:plan.selected.edition}),'The Page opened another original coded row.');
    await r.page.locator('#row-decision').selectOption('note');
    await r.page.locator('#row-reviewer').fill(plan.decision.reviewer);
    await r.page.locator('#row-note').fill(plan.decision.note);
    await r.page.locator('#row-apply').click(); await idle(r.page,r.directory);
    await r.page.locator('#reviewer').fill(plan.expected.review.reviewer);
    await r.page.locator('#review-note').fill(plan.expected.review.note);
    await r.page.locator('#review-status').selectOption(plan.expected.review.status);
  }
  const file=await r.download('review-input.json','#review-input-download',
    {review:reviewIdentity(before),expected:plan.expected},{maximum:JSON_LIMIT,validate:async selected=>{
      validateSaveInput(JSON.parse(await fs.readFile(selected.path,'utf8')),before,plan);
    }});
  const request=JSON.parse(await fs.readFile(file.path,'utf8'));validateSaveInput(request,before,plan);
  await r.write('review-request.json',request);
  await r.save({request}); return request;
}
function validateSaveInput(request,before,plan) {
  const keys=[...DEFINITION,'requestId','id','expectedRevision'].sort();
  need(request && equal(Object.keys(request).sort(),keys) &&
    typeof request.requestId==='string' && /^[a-f0-9-]{36}$/.test(request.requestId) &&
    request.id===before.id && request.expectedRevision===before.revision &&
    equal(normalized(request),plan.expected),'The full UI input differs from its selected original review and one named note.');
}
async function fiveDownloads(r,review,report) {
  const selected=reviewIdentity(review),result=[];
  result.push(await r.download('report.json','#report-json',selected,{maximum:JSON_LIMIT,validate:async file=>{
    const value=JSON.parse(await fs.readFile(file.path,'utf8')); need(equal(value,report),'The full analyst JSON differs from the original saved report.');
  }}));
  result.push(await r.download('report.html','#report-html',selected,{route:{path:'/api/hila/html',params:{id:review.id,revision:review.revision}}}));
  for(const[name,selector,kind]of [['report.zip','#report-zip','report'],['review.zip','#review-zip','workspace'],['public.zip','#public-zip','public']])
    result.push(await r.download(name,selector,selected,{route:{path:'/api/hila/export',params:{id:review.id,revision:review.revision,kind}}}));
  return result;
}
function fullReportUnchanged(before,after) {
  for(const key of ['schema','reviewId','name','notes','questionnaire','rules','selection','cellDecisions','attribution','editions','comparison','semantics'])
    need(equal(before[key],after[key]),'The row note changed the original report '+key+'.');
}
export async function runHilaBrowserReceiving(input) {
  const before=clone(input.before),selection=await originalSelection(input,'source-review',before);
  const r=new Receiving(input,'source-review',selection);let failure=null;
  try {
    await r.init();
    if(r.state.complete) {
      need(equal(await r.read('receipt.json'),r.state.receipt) &&
        equal(r.state.files.map(file=>file.name).sort(),['public.zip','report.html','report.json','report.zip','review.zip']),
        'The completed browser selection lost an original result or complete download.');
      for(const file of r.state.files) {
        need(file.path===r.path('downloads/'+file.name),'A completed browser file moved outside its original selection.');
        await verifyFile(file);
      }
      need(equal(await r.client.report(r.state.reviewed.id,{revision:r.state.reviewed.revision}),r.state.report),
        'The completed browser report differs from the original saved revision.');
      const native=await nativeRequest(r.client,r.state.request);
      need(native&&equal(native.result,r.state.reviewed),'The completed browser request no longer replays its original result.');
      return clone({request:r.state.request,reviewed:r.state.reviewed,report:r.state.report,
        files:r.state.files,receipt:r.state.receipt,checkpoint:r.state});
    }
    need(equal(await r.client.review(before.id,before.revision),before),'The original complete r4 baseline changed.');
    const plan=await choosePlan(r,before);
    need(equal(plan.before,reviewIdentity(before)),'The named row plan selects another baseline.');
    const request=await prepareUiInput(r,before,plan);
    const nativeBefore=await nativeRequest(r.client,request);
    if(!nativeBefore) {
      const current=await r.client.review(before.id);
      need(equal(current,before),'The current native review changed before the selected original browser save.');
    }
    const requestFile=r.path('review-request.json');
    await interruptOriginal(r,{request,name:'review',trigger:async()=>{
      await r.page.locator('[data-tab="review"]').click();
      await r.page.locator('#review-input-file').setInputFiles(requestFile);
    }});
    const completed=await continueOriginal(r,{request,name:'review'});
    const reviewed=completed.native.result;
    reviewIdentity(reviewed);
    need(reviewed.id===before.id && reviewed.revision===before.revision+1 &&
      reviewed.previousRevision===before.revision && reviewed.created===before.created &&
      equal(definition(reviewed),plan.expected),'The native browser save changed more than the complete selected named review.');
    await r.write('reviewed.json',reviewed);
    await selectReview(r,reviewed);
    const report=await r.client.report(reviewed.id,{revision:reviewed.revision});
    fullReportUnchanged(plan.report,report);
    need(equal(report.rowDecisions,reviewed.rowDecisions)&&equal(report.review,reviewed.review),
      'The complete analyst report lost the named browser decisions.');
    await r.write('report.json',report); await loadSavedReport(r,reviewed,report);
    const files=await fiveDownloads(r,reviewed,report);
    need(r.errors.length===0,'The original Page reported JavaScript errors: '+r.errors.join('; '));
    const receipt={schema:'stellar-forge.hila-page-receiving.v1',state:'COMPLETE',operationId:input.operationId,
      workspace:input.directory,actor:input.actor,before:reviewIdentity(before),reviewed:reviewIdentity(reviewed),
      requestId:request.requestId,requestInputSha256:hash(canonical(request)),browserInputSha256:hash(BODY(request)),
      originalRow:{edition:plan.selected.edition,recordId:plan.selected.row.recordId,sourceRow:plan.selected.row.sourceRow,codedRowSha256:hash(canonical(plan.selected.row))},
      completeOriginalReportPreserved:true,reportSha256:reviewed.report.sha256,
      originalDefinitionFields:DEFINITION,files,pageErrors:[],checks:[
        'original r4 definition and every existing row/cell decision retained',
        'actual coded respondent inspected and named note saved without changing report counts or calculations',
        'full UI-generated UUID/input retained before dispatch; original pre-provider interception and saved-operation continuation',
        'complete native request/result matched to the original browser record',
        'all five complete original browser downloads retained before replay'
      ]};
    await r.write('receipt.json',receipt);
    await r.save({complete:true,request,reviewed,report,files,receipt});
    return clone({request,reviewed,report,files,receipt,checkpoint:r.state});
  } catch(error) { failure=error; throw error; }
  finally { await r.close(failure); }
}
export async function inspectHilaReceivedPage(input) {
  const review=clone(input.review),report=clone(input.report);
  need(typeof input.name==='string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(input.name),
    'Name this original received or reopened Page observation.');
  const selection=await originalSelection(input,'received-'+input.name,review,input.receiveFile||null);
  const r=new Receiving(input,'received-'+input.name,selection);let failure=null;
  try {
    await r.init();
    if(r.state.complete) {
      need(equal(await r.read('receipt.json'),r.state.receipt) && equal(r.state.reviewed,review) && equal(r.state.report,report) &&
        equal(await r.client.review(review.id,review.revision),review) && equal(await r.client.report(review.id,{revision:review.revision}),report),
        'The completed independent Page selection changed.');
      return clone({reviewed:review,report,files:[],receipt:r.state.receipt,checkpoint:r.state});
    }
    let receiving=null;
    if(input.receiveFile) {
      const file=await verifyFile(input.receiveFile);
      await r.write('receive-file.json',{path:file.path,bytes:file.bytes,sha256:file.sha256});
      if(!r.state.steps.received) {
        await r.safePending(null,file);
        await r.page.locator('[data-tab="report"]').click();
        await interruptOriginal(r,{file,name:'receive',trigger:async()=>{
          await r.page.locator('#packet-file').setInputFiles(file.path);
          await r.page.locator('#packet-receive button[type="submit"]').click();
        }});
        const completed=await continueOriginal(r,{file,name:'receive'});
        receiving=completed.result || completed.record.operation.result;
        need(equal(receiving.review,review) && receiving.reconstructed===true &&
          receiving.currentRevision>=review.revision,'The original independent Page receive returned another retained review.');
        await r.write('receiving-result.json',receiving); await r.step('received',receiving);
      } else {
        receiving=await r.read('receiving-result.json');
        need(receiving&&equal(receiving,r.state.steps.received)&&equal(receiving.review,review)&&
          equal(receiving.packet,{bytes:file.bytes,sha256:file.sha256}),
          'The retained original browser receiving result changed.');
      }
    }
    await r.safePending();
    await selectReview(r,review); await loadSavedReport(r,review,report);
    const history=await r.client.history(review.id);
    need(Array.isArray(history)&&history.some(item=>equal(item,review)),
      'The independent application lost the full original reviewed revision.');
    const receipt=await r.memo('receipt.json',async()=>({
      schema:'stellar-forge.hila-received-page.v1',state:'COMPLETE',name:input.name,operationId:input.operationId,
      workspace:input.directory,actor:input.actor,review:reviewIdentity(review),reportSha256:review.report.sha256,
      completeReportPreserved:true,history:history.map(reviewIdentity),receiving:receiving||null,pageErrors:[],
      checks:['actual independent application opens the complete retained review and original report',
        input.receiveFile?'actual Page receives the complete original packet through retained input and same-operation continuation':'same saved workspace is viewed after the caller-owned cold reopen']
    }));
    need(r.errors.length===0,'The received Page reported JavaScript errors: '+r.errors.join('; '));
    await r.save({complete:true,reviewed:review,report,files:[],receipt});
    return clone({reviewed:review,report,files:[],receipt,checkpoint:r.state});
  } catch(error) { failure=error; throw error; }
  finally { await r.close(failure); }
}
