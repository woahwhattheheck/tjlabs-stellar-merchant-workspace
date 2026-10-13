// SPDX-License-Identifier: MIT
// Original transportation controls, complete dataset pages, native editions and exact request replay.
import {readFile,open,mkdir,lstat,realpath,rename,link,unlink} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {readConnection} from './connection.mjs';
import {acquireLease} from './managed.mjs';

const SCHEMA='stellar-forge.transport-planning-browser-receiving.v1';
const hash=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const same=(a,b)=>canonical(a)===canonical(b);
const need=(yes,message)=>{if(!yes)throw Object.assign(new Error(message),{code:'TRANSPORT_PLANNING_BROWSER_RECEIVING'});};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const now=()=>new Date().toISOString();
async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function json(path){return JSON.parse(await readFile(path,'utf8'));}
async function syncDirectory(path){const fd=await open(path,'r');try{await fd.sync();}finally{await fd.close();}}
async function bytes(path,raw,{immutable=true}={}){
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  if(immutable&&await exists(path)){need((await readFile(path)).equals(raw),'The saved browser artifact differs.');return{path,bytes:raw.length,sha256:hash(raw)};}
  const temporary=path+'.writing-'+randomUUID(),fd=await open(temporary,'wx',0o600);
  try{await fd.writeFile(raw);await fd.sync();}finally{await fd.close();}
  try{if(immutable){try{await link(temporary,path);}catch(e){if(e.code!=='EEXIST')throw e;need((await readFile(path)).equals(raw),'The original browser artifact changed.');}}
    else await rename(temporary,path);await syncDirectory(dirname(path));}
  finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  return{path,bytes:raw.length,sha256:hash(raw)};
}
const save=(path,value,options)=>bytes(path,Buffer.from(JSON.stringify(value,null,2)+'\n'),options);
async function verify(row){
  const before=await lstat(row.path);need(before.isFile()&&!before.isSymbolicLink()&&await realpath(row.path)===row.path,'Keep an ordinary complete browser artifact.');
  const file=await open(row.path,'r'),digest=createHash('sha256');let count=0;
  try{for await(const chunk of file.createReadStream({autoClose:false})){digest.update(chunk);count+=chunk.length;}
    const after=await file.stat();need(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&count===after.size,'The browser artifact changed while reading.');
  }finally{await file.close();}
  need(count===row.bytes&&digest.digest('hex')===row.sha256,'A completed browser artifact changed.');
}
async function privateDirectory(path){await mkdir(path,{recursive:true,mode:0o700});const st=await lstat(path);need(st.isDirectory()&&!st.isSymbolicLink()&&await realpath(path)===path&&!(st.mode&0o077)&&(!process.getuid||st.uid===process.getuid()),'Use the original private browser directory.');}

export function createTransportPlanningReceivingBrowser(options){return new BrowserCourse(options);}
class BrowserCourse{
  constructor(options){
    this.o=options;this.root=resolve(options.directory);this.path=join(this.root,'browser-operation.json');
    this.context=null;this.contextAcquisition=null;this.lease=null;this.leaseAcquisition=null;this.page=null;
    this.pageAcquisitions=new Set();this.contextWasOpened=false;this.recoveringEdit=false;this.routes=new Set();this.routeHandler=null;this.closing=null;this.writeTail=Promise.resolve();this.stopping=false;this.stopClosing=null;
  }
  requestStop(signal){
    this.stopping=true;
    this.stopClosing??=this.closeContext().catch(error=>{
      if(this.state){this.state.errors.push({type:'stop-closure',message:error.message,signal,at:now()});void this.save().catch(()=>{});}
    });
  }
  checkStopping(){need(!this.stopping,'The selected original browser course is stopping.');}
  save(){const snapshot=JSON.parse(JSON.stringify(this.state));const p=this.writeTail.then(()=>save(this.path,snapshot,{immutable:false}));this.writeTail=p.catch(()=>{});return p;}
  async phase(name,run){this.checkStopping();if(this.state.phases[name]?.complete)return this.state.phases[name].value;
    this.state.activePhase=name;await this.save();try{await this.o.onProgress?.({phase:name});}catch{}
    const value=await run();this.state.phases[name]={complete:true,at:now(),value};await this.save();this.checkStopping();return value;}
  async retain(row){await verify(row);this.state.files[row.path]=row;await this.save();return row;}
  async publishCandidate(name,producer){
    const candidatePath=join(this.root,'candidates',name+'.json');
    let candidate;
    if(await exists(candidatePath))candidate=await json(candidatePath);
    else{
      const produced=await producer(),raw=produced.bytes;
      candidate={schema:'stellar-forge.transport-planning-browser-artifact.v1',name,bytes:raw.length,sha256:hash(raw),
        base64:raw.toString('base64'),metadata:produced.metadata??{}};
      await save(candidatePath,candidate);
    }
    need(candidate.schema==='stellar-forge.transport-planning-browser-artifact.v1'&&candidate.name===name,'Keep the same browser artifact candidate.');
    const raw=Buffer.from(candidate.base64,'base64');
    need(raw.toString('base64')===candidate.base64&&raw.length===candidate.bytes&&hash(raw)===candidate.sha256,'The retained complete browser bytes changed.');
    const target=join(this.root,'artifacts',name),published=await bytes(target,raw);
    await this.retain(published);return{...published,metadata:candidate.metadata};
  }
  async screenshot(name,page=this.page,{fullPage=true}={}){
    return this.publishCandidate(name,async()=>{
      const before=await page.evaluate(()=>({scrollY,scrollX,activeElement:document.activeElement?.id??null,
        viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}}));
      await page.evaluate(()=>{document.activeElement?.blur?.();scrollTo(0,0);});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const after=await page.evaluate(()=>({scrollY,scrollX,viewport:{width:innerWidth,height:innerHeight},
        document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},
        overflow:[...document.querySelectorAll('body *')].filter(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return r.width>0&&r.right>innerWidth+2&&s.position!=='fixed'&&!n.closest('table,pre,[class*="scroll"]');}).slice(0,30).map(n=>({tag:n.tagName,id:n.id,className:String(n.className)}))}));
      return{bytes:await page.screenshot({fullPage}),metadata:{before,after,fullPage}};
    });
  }



  async api(route,body,{allowError=false}={}){
    return this.page.evaluate(async({route,body,allowError})=>{
      const response=await fetch(route,{method:body===undefined?'GET':'POST',credentials:'same-origin',
        headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const value=await response.json();if(!response.ok&&!allowError)throw Error(value.error??'Original request failed.');
      return allowError?{status:response.status,value}:value;
    },{route,body,allowError});
  }
  async enter(){
    const c=await readConnection(this.o.connectionFile,{directory:this.o.workspaceDirectory,
      applicationDirectory:this.o.applicationDirectory,sourceManifestSha256:this.o.sourceManifestSha256});
    need(c.value.actor===this.o.actor&&c.value.workspaceId===this.o.workspaceId,'Preserve the exact selected original actor and workspace.');
    if(this.state.origin!==c.value.origin){this.state.origins.push({origin:c.value.origin,instanceId:c.value.instanceId,at:now()});this.state.origin=c.value.origin;await this.save();}
    await this.page.goto(c.value.origin+'/#'+c.token,{waitUntil:'domcontentloaded'});
    await this.page.waitForFunction(()=>typeof state!=='undefined'&&state&&typeof catalogue!=='undefined'&&catalogue);
    await this.page.locator('#profile').selectOption(this.o.actor);
    const value=await this.api('/api/workspace');need(value.workspace_id===this.o.workspaceId,'The rendered application selected another workspace.');
    return value;
  }
  async views(){
    const result=[],expected=this.baseline;
    for(const name of ['overview','sources','services','performance','scenarios','actions','reports','delivery']){
      await this.page.locator('[data-page="'+name+'"]').click();
      await this.page.locator('#main').waitFor();await this.page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
      result.push({name,desktop:await this.screenshot(name+'-desktop.png'),narrow:await this.narrow(name+'-narrow.png')});
    }
    const records=[];
    for(const row of expected.records){
      const actual=await this.api('/api/record/'+encodeURIComponent(row.id)+'?offset=0&limit=1000');
      need(actual.id===row.id&&actual.kind===row.kind&&actual.revision===row.revision&&same(actual.value,row.value),'Original record or complete value differs: '+row.id);
      need(same(actual.history,row.history.map(({revision,at,actor})=>({revision,at,actor}))),'Original full history metadata differs.');
      if(row.kind==='dataset'){
        const wanted=expected.tables.dataset_rows.filter(x=>x.dataset_id===row.id).sort((a,b)=>a.row_no-b.row_no).map(x=>JSON.parse(x.body));
        const all=[];let offset=0;
        for(;;){const page=offset===0?actual:await this.api('/api/record/'+encodeURIComponent(row.id)+'?offset='+offset+'&limit=1000');
          need(page.offset===offset&&page.total===wanted.length,'Original complete dataset cursor changed.');all.push(...page.rows);
          if(all.length===wanted.length)break;need(page.rows.length>0&&all.length<wanted.length,'Original dataset paging stalled.');offset=all.length;}
        need(same(all,wanted),'Every original dataset cell and row must survive receiving.');
      }
      records.push({id:row.id,revision:row.revision});
    }
    await this.page.locator('[data-page="sources"]').click();
    for(const row of expected.records.filter(x=>x.kind==='dataset')){
      await this.page.locator('[data-act="view"][data-id="'+row.id+'"]').first().click();
      let rowsSeen=0;const screens=[];
      for(;;){await this.page.locator('#dialog-body').waitFor();screens.push(await this.screenshot('dataset-'+hash(row.id)+'-'+rowsSeen+'.png'));
        const next=this.page.locator('[data-act="row-next"]');if(!await next.count()||await next.isDisabled())break;
        const before=await this.page.locator('#dialog-body').getAttribute('data-offset');await next.click();
        await this.page.waitForFunction(old=>document.querySelector('#dialog-body').dataset.offset!==old,before);rowsSeen+=100;}
      await this.page.locator('#close-dialog').click();records.find(x=>x.id===row.id).screens=screens;
    }
    return{panes:result,records,datasets:expected.records.filter(x=>x.kind==='dataset').length};
  }
  async installRoute(){
    if(this.routeHandler)return;this.noteRoute='**/api/command';
    this.routeHandler=route=>{
      const task=(async()=>{
        const wire=route.request().postDataJSON();
        need(wire.actor===this.o.actor&&wire.request?.command==='action_save'&&same(wire.request.args,this.o.operation.request.args),'The browser must submit only the selected original action note.');
        if(this.state.editRequest)need(same(wire,this.state.editRequest),'Resume the exact original browser-generated request ID and body.');
        else{this.state.editRequest=wire;await this.save();await this.retain(await save(join(this.root,'original-browser-request.json'),wire));}
        const response=await route.fetch(),raw=await response.body(),value=JSON.parse(raw.toString('utf8'));
        need(response.ok()&&!value.error,'The original technical note was not accepted.');
        const path=join(this.root,'original-browser-response.json');
        if(await exists(path))need(same(await json(path),value),'Exact native replay must return the same complete original result.');
        else await this.retain(await save(path,value));
        if(!this.state.lostResponse){this.state.lostResponse=true;await this.save();await route.abort('failed');}
        else{this.state.replayObserved=true;await this.save();await route.fulfill({response,body:raw});}
      })();
      this.routes.add(task);task.finally(()=>this.routes.delete(task)).catch(()=>{});
      return task;
    };await this.page.route(this.noteRoute,this.routeHandler);
  }
  async restorePending(){
    const wire=this.state.editRequest;need(wire,'Retain the original browser request before recovery.');
    await this.page.evaluate(async wire=>{
      const db=await new Promise((ok,no)=>{const r=indexedDB.open('transport-production-operations',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('pending'))r.result.createObjectStore('pending',{keyPath:'key'});};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
      try{await new Promise((ok,no)=>{const tx=db.transaction('pending','readwrite'),s=tx.objectStore('pending'),key='transport-production.pending.'+state.workspace_id,r=s.get(key);
        r.onsuccess=()=>{if(r.result&&JSON.stringify(r.result.payload)!==JSON.stringify(wire)){tx.abort();return;}if(!r.result)s.add({key,payload:wire});};
        tx.oncomplete=ok;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(Error('A different original pending request is retained.'));});}
      finally{db.close();}
    },wire);
    await this.page.reload({waitUntil:'domcontentloaded'});await this.page.waitForFunction(()=>typeof state!=='undefined'&&state);
  }
  async actionEdit(){
    await this.installRoute();const selected=this.o.operation.request.args;
    if(!this.state.editRequest){
      await this.page.locator('[data-page="actions"]').click();
      await this.page.locator('[data-act="action"][data-id="'+selected.record_id+'"]').click();
      await this.page.locator('#form [name="decision_note"]').fill(selected.decision_note);
      await this.page.locator('#form button[type="submit"]').click();
      await this.page.waitForFunction(()=>typeof pending==='function'&&pending());
      for(let i=0;i<600&&!this.state.lostResponse;i++){this.checkStopping();await delay(100);}
      need(this.state.editRequest&&this.state.lostResponse,'The actual original mutation and lost response were not retained.');
      await this.screenshot('actual-uncertain-command.png');
    }
    while(!this.state.replayObserved){
      const losingFirstResponse=!this.state.lostResponse;
      await this.restorePending();await this.page.locator('[data-act="resume"]').click();
      for(let i=0;i<600&&!(losingFirstResponse?this.state.lostResponse:this.state.replayObserved);i++){this.checkStopping();await delay(100);}
      need(losingFirstResponse?this.state.lostResponse:this.state.replayObserved,'The exact original lost-response or replay stage remains unresolved; retain the same request.');
      await Promise.allSettled([...this.routes]);
    }
    await this.page.waitForFunction(()=>typeof pending==='function'&&!pending());
    const actual=await this.api('/api/record/'+encodeURIComponent(selected.record_id));
    need(actual.revision===selected.expected+1&&actual.value.decision_note===selected.decision_note.trim(),'The original action note revision differs.');
    await this.page.locator('[data-page="actions"]').click();
    const screenshot=await this.screenshot('action-after-exact-replay.png');
    return{operation:this.state.editRequest,result:await json(join(this.root,'original-browser-response.json')),screenshot,
      lostResponse:true,replayed:true,requestFile:await this.retain(await save(join(this.root,'original-browser-request.json'),this.state.editRequest))};
  }
  async editions(){
    const result=[];
    for(const row of this.baseline.records.filter(x=>['performance','scenario_edition','plan','report'].includes(x.kind))){
      const pane={performance:'performance',scenario_edition:'scenarios',plan:'actions',report:'reports'}[row.kind];
      await this.page.locator('[data-page="'+pane+'"]').click();
      const base='/api/edition/'+encodeURIComponent(row.id),key=hash(row.id);
      const csv=await this.downloaded(key+'.csv',()=>this.page.locator('a[href="'+base+'.csv"]').first().click());
      const archive=await this.downloaded(key+'.zip',()=>this.page.locator('a[href="'+base+'.zip"]').first().click());
      const acquisition=this.context.newPage();this.pageAcquisitions.add(acquisition);let page;
      try{page=await acquisition;}finally{this.pageAcquisitions.delete(acquisition);}
      let html,desktop,narrow;
      try{const response=await page.goto(this.state.origin+base+'.html',{waitUntil:'load'});need(response?.ok(),'The exact native edition did not render.');
        html=await this.publishCandidate(key+'.html',async()=>({bytes:await response.body()}));
        desktop=await this.screenshot(key+'-edition-desktop.png',page);await page.setViewportSize({width:390,height:844});narrow=await this.screenshot(key+'-edition-narrow.png',page);
        await page.goto(pathToFileURL(html.path).href,{waitUntil:'load'});await this.screenshot(key+'-edition-file-reopened.png',page);
      }finally{await page.close();}
      result.push({recordId:row.id,csv,archive,html,desktop,narrow,reopenedCsv:await this.reopenText(csv,key+'-csv')});
    }return result;
  }
  async downloaded(name,click){
    const directory=join(this.root,'candidates');await privateDirectory(directory);
    const descriptorPath=join(directory,name+'.download.json'),closedPath=join(directory,name+'.download.closed');
    let candidate;
    if(await exists(descriptorPath))candidate=await json(descriptorPath);
    else{
      const partial=join(directory,name+'.downloading');
      if(await exists(partial)){await rename(partial,partial+'.interrupted-'+randomUUID());await syncDirectory(directory);}
      need(!await exists(closedPath),'A closed download must retain its original candidate descriptor.');
      const waiting=this.page.waitForEvent('download',{timeout:120000});waiting.catch(()=>{});
      await click();const download=await waiting;
      need(!await download.failure(),'The complete original download failed.');
      const stream=await download.createReadStream();need(stream,'The original complete download stream is absent.');
      const file=await open(partial,'wx',0o600),digest=createHash('sha256');let count=0;
      try{
        for await(const chunk of stream){count+=chunk.length;need(Number.isSafeInteger(count),'The complete original download size is invalid.');digest.update(chunk);await file.writeFile(chunk);}
        await file.sync();
      }finally{stream.destroy?.();await file.close();}
      candidate={schema:'stellar-forge.transport-planning-browser-download.v1',name,
        path:closedPath,partial,bytes:count,sha256:digest.digest('hex'),
        metadata:{filename:download.suggestedFilename(),url:download.url()}};
      await verify({...candidate,path:partial});
      // The full closed descriptor precedes publication. A lost rename is
      // reconciled from this exact complete part; an unclosed part is retained.
      await save(descriptorPath,candidate);
    }
    need(candidate.schema==='stellar-forge.transport-planning-browser-download.v1'&&candidate.name===name&&
      candidate.path===closedPath&&candidate.partial===join(directory,name+'.downloading'),'Keep the original complete download candidate.');
    if(!await exists(closedPath)){await verify({...candidate,path:candidate.partial});await rename(candidate.partial,closedPath);await syncDirectory(directory);}
    await verify(candidate);
    const target=join(this.root,'artifacts',name);await privateDirectory(dirname(target));
    try{await link(closedPath,target);}catch(error){if(error.code!=='EEXIST')throw error;}
    await syncDirectory(dirname(target));await verify({...candidate,path:target});
    const published={path:target,bytes:candidate.bytes,sha256:candidate.sha256};
    await this.retain(published);await this.retain({path:descriptorPath,bytes:(await readFile(descriptorPath)).length,sha256:hash(await readFile(descriptorPath))});
    return{...published,metadata:candidate.metadata};
  }
  async narrow(name){
    await this.page.setViewportSize({width:390,height:844});
    try{return await this.screenshot(name);}finally{await this.page.setViewportSize({width:1440,height:1000});}
  }
  async reopenJson(file,name,expected){
    const raw=await readFile(file.path),parsed=JSON.parse(raw.toString('utf8'));need(same(parsed,expected),'Reopened original JSON differs.');
    const acquisition=this.context.newPage();this.pageAcquisitions.add(acquisition);let page;
    try{page=await acquisition;}finally{this.pageAcquisitions.delete(acquisition);}
    try{await page.goto(pathToFileURL(file.path).href,{waitUntil:'load'});await page.locator('body').waitFor();
      return{file,desktop:await this.screenshot(name+'-desktop.png',page),parsed:true};
    }finally{await page.close();}
  }

  async reopenText(file,name){
    await verify(file);
    const text=await readFile(file.path,'utf8'),acquisition=this.context.newPage();this.pageAcquisitions.add(acquisition);let page;
    try{page=await acquisition;}finally{this.pageAcquisitions.delete(acquisition);}
    try{await page.setContent('<!doctype html><meta charset="utf-8"><title>Retained original report</title><style>body{font:15px/1.5 system-ui;margin:24px;color:#202124;background:white}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Retained original report</h1><pre></pre>');
      await page.locator('pre').evaluate((node,value)=>{node.textContent=value;},text);
      need(await page.locator('pre').textContent()===text,'Complete report text did not reopen.');
      const desktop=await this.screenshot(name+'-opened.png',page);return{file,desktop};
    }finally{await page.close();}
  }
  async run(){
    await privateDirectory(this.root);this.checkStopping();
    try{
      this.leaseAcquisition=acquireLease(join(this.root,'browser-operation'));
      this.lease=await this.leaseAcquisition;this.leaseAcquisition=null;this.checkStopping();
      await verify(this.o.baseline);this.baseline=await json(this.o.baseline.path);
      need(this.baseline.workspaceId===this.o.workspaceId,'Browser baseline belongs to another original workspace.');
      const selected=JSON.parse(JSON.stringify({actor:this.o.actor,workspaceDirectory:this.o.workspaceDirectory,
        workspaceId:this.o.workspaceId,applicationDirectory:this.o.applicationDirectory,
        sourceManifestSha256:this.o.sourceManifestSha256,baseline:this.o.baseline,operation:this.o.operation??null,
        browser:this.o.chromium,playwright:this.o.playwright,source:this.o.source}));
      this.state=await exists(this.path)?await json(this.path):null;
      if(this.state)need(this.state.schema===SCHEMA&&same(this.state.selection,selected),'The original browser selection changed.');
      const candidatePath=join(this.root,'browser-candidate.json'),resultPath=join(this.root,'browser-result.json');
      if(await exists(candidatePath)||await exists(resultPath)){
        const candidate=await json(await exists(candidatePath)?candidatePath:resultPath);
        need(this.state&&same(candidate.selection,selected)&&candidate.schema==='stellar-forge.transport-planning-browser-result.v1'&&
          candidate.state==='COMPLETE'&&typeof candidate.ownersClosedAt==='string','The closed browser result selected another course.');
        for(const row of candidate.files)await verify(row);
        await save(resultPath,candidate);this.state.status='complete';
        this.state.result={path:resultPath,bytes:(await readFile(resultPath)).length,sha256:hash(await readFile(resultPath))};await this.save();
        return{...candidate,resultFile:this.state.result};
      }
      const current=await readConnection(this.o.connectionFile,{directory:this.o.workspaceDirectory,
        applicationDirectory:this.o.applicationDirectory,sourceManifestSha256:this.o.sourceManifestSha256});
      need(current.value.workspaceId===this.o.workspaceId,'Preserve the selected original native workspace.');
      this.state??={schema:SCHEMA,selection:selected,origin:current.value.origin,origins:[{origin:current.value.origin,instanceId:current.value.instanceId,at:now()}],
        startedAt:now(),phases:{},files:{},errors:[],status:'running'};
      await this.save();
      this.checkStopping();const module=await import(pathToFileURL(this.o.playwright).href),chromium=module.chromium??module.default?.chromium;
      need(chromium,'Select the actual installed Playwright module.');this.checkStopping();
      this.contextAcquisition=chromium.launchPersistentContext(join(this.root,'profile'),{
        executablePath:this.o.chromium,headless:true,args:['--no-sandbox'],viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true});
      this.context=await this.contextAcquisition;this.contextAcquisition=null;this.contextWasOpened=true;this.checkStopping();
      this.state.ownersClosedAt=null;await this.save();
      this.page=this.context.pages()[0]??await this.context.newPage();this.page.setDefaultTimeout(60000);
      this.page.on('pageerror',error=>{this.state.errors.push({type:'pageerror',message:error.message,at:now()});void this.save().catch(()=>{});});
      await this.enter();
      const views=await this.phase('complete-original-eight-views',()=>this.views());
      const edit=this.o.operation?await this.phase('original-action-request-recovery',()=>this.actionEdit()):null;
      const editions=await this.phase('all-published-editions-reopened',()=>this.editions());
      const handover=await this.phase('complete-native-handover-downloads',async()=>{
        await this.page.locator('[data-page="delivery"]').click();
        return{application:await this.downloaded('complete-application.zip',()=>this.page.locator('a[href="/api/application.zip"]').click()),
          recovery:await this.downloaded('complete-workspace.zip',()=>this.page.locator('a[href="/api/recovery.zip"]').click())};
      });
      const final=await this.api('/api/workspace');
      await this.retain(await save(join(this.root,'final-browser-projection.json'),final));
      await this.closeContext();
      const candidate={schema:'stellar-forge.transport-planning-browser-result.v1',state:'COMPLETE',selection:selected,
        origins:this.state.origins,views,edit,editions,handover,completedAt:now(),ownersClosedAt:this.state.ownersClosedAt,
        files:Object.values(this.state.files),pageErrors:this.state.errors};
      need(!candidate.pageErrors.some(e=>e.type==='pageerror'),'Repair actual page errors before completing the receiving course.');
      for(const row of candidate.files)await verify(row);
      await save(candidatePath,candidate);await save(resultPath,candidate);
      this.state.status='complete';this.state.result={path:resultPath,bytes:(await readFile(resultPath)).length,sha256:hash(await readFile(resultPath))};await this.save();
      return{...candidate,resultFile:this.state.result};
    }catch(error){if(this.state){this.state.errors.push({type:'course',message:error.message,at:now()});await this.save();}throw error;}
    finally{await this.close();}
  }
  async closeContext(){
    if(this.contextAcquisition){try{this.context=await this.contextAcquisition;this.contextWasOpened=true;}finally{this.contextAcquisition=null;}}
    await Promise.allSettled([...this.pageAcquisitions]);
    for(;;){
      await Promise.allSettled([...this.routes]);if(!this.routes.size)break;
    }
    if(this.page&&this.routeHandler){await this.page.unroute(this.noteRoute,this.routeHandler);this.routeHandler=null;}
    if(this.context){await this.context.close();this.context=null;this.page=null;}
    if(this.state&&this.contextWasOpened){this.state.ownersClosedAt=now();this.contextWasOpened=false;await this.save();}
  }
  close(){
    if(this.closing)return this.closing;
    this.closing=(async()=>{
      if(this.stopClosing)await this.stopClosing;
      for(;;){try{await this.closeContext();break;}catch(error){
        if(this.state){this.state.errors.push({type:'closure',message:error.message,at:now()});await this.save().catch(()=>{});}
        process.stderr.write(JSON.stringify({state:'TRANSPORT_PLANNING_BROWSER_CLOSING',message:error.message})+'\n');await delay(1000);
      }}
      await this.writeTail;
      if(this.leaseAcquisition){try{this.lease=await this.leaseAcquisition;}finally{this.leaseAcquisition=null;}}
      if(this.lease){await this.lease.close();this.lease=null;}
    })().finally(()=>{this.closing=null;});return this.closing;
  }
}
