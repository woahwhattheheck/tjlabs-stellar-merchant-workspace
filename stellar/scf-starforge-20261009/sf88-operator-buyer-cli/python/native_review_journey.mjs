#!/usr/bin/env node
// MIT — Continue B41A's original customer review through the maintained Python and browser.
import fs from 'node:fs';
import {join,resolve,isAbsolute,dirname,basename} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {PRODUCT,PROGRAMME,OPERATION,need,sha,json,regular,privateDirectory,identity,atomic,filesBelow,composeOriginalInputs} from './native_review_sources.mjs';

const ACTOR='SCF customer continuation';
const EXPECTED_CAPTURES=['edition-review','returned-journal-conflict','returned-journal-applied',
  'independent-receiving-edit','incoming-review-return','complete-review-report'];
const delay=ms=>new Promise(done=>setTimeout(done,ms));
function options(argv){
  need(argv.length===8,'Use --source ABS_REPOSITORY --work ABS_RECEIVING_DIR --chromium ABS_CHROME --playwright-root ABS_NODE_MODULES.');
  const values={};
  for(let i=0;i<argv.length;i+=2){
    const name=argv[i],value=argv[i+1];
    need(['--source','--work','--chromium','--playwright-root'].includes(name)&&!values[name]&&isAbsolute(value),'Supply each documented absolute path once.');
    values[name]=value;
  }
  need(Object.keys(values).length===4,'Supply all four original runtime paths.');
  return values;
}
function checkedFile(file){
  let current;
  try{current=identity(file.path);}
  catch(error){
    if(error.code!=='ENOENT'||!file.retained_path)throw error;
    const bytes=regular(file.retained_path);
    need(bytes.length===file.bytes&&sha(bytes)===file.sha256,'The retained recovery copy changed: '+file.path);
    atomic(file.path,bytes,{original:true});current=identity(file.path);
  }
  need(current.bytes===file.bytes&&current.sha256===file.sha256,'The retained output changed: '+file.path);
  return current;
}
function parseOutput(text){
  try{return JSON.parse(text.trim());}
  catch{throw new Error('The original native command did not return complete JSON. Read its saved stdout and stderr.');}
}
async function exitOf(child){
  if(child.spawnError)throw child.spawnError;
  if(child.exitCode!==null||child.signalCode!==null)return {code:child.exitCode,signal:child.signalCode};
  return new Promise((done,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>done({code,signal}));});
}
function childWithInput(python,args,env){
  const child=spawn(python,args,{env,stdio:['pipe','pipe','pipe']});
  child.stdin.on('error',()=>{});
  child.once('error',error=>{child.spawnError=error;});
  return child;
}
const SERVER_BOOTSTRAP='import os, signal, sys, threading\n'+
  'def eof():\n    sys.stdin.buffer.read()\n    os.kill(os.getpid(), signal.SIGTERM)\n'+
  'threading.Thread(target=eof, daemon=True).start()\n'+
  'from stellar_forge_buyer.review_cli import main\nraise SystemExit(main(sys.argv[1:]))\n';
const LOCK_BOOTSTRAP='import fcntl, os, sys\n'+
  'fd=os.open(sys.argv[1], os.O_CREAT|os.O_RDWR, 0o600)\n'+
  'fcntl.flock(fd, fcntl.LOCK_EX|fcntl.LOCK_NB)\n'+
  'print("LOCKED", flush=True)\n'+
  'sys.stdin.buffer.read()\n';

export async function main(argv=process.argv.slice(2)){
  const args=options(argv);
  const source=fs.realpathSync(args['--source']),work=privateDirectory(resolve(args['--work']));
  const python=process.env.SCF_CUSTOMER_PYTHON;
  const accepted=process.env.SCF_CUSTOMER_ACCEPTED,retained=process.env.SCF_CUSTOMER_RETAINED_OUTPUTS;
  need(python&&isAbsolute(python)&&accepted&&isAbsolute(accepted)&&retained&&isAbsolute(retained),
    'Use the original customer continuation environment: SCF_CUSTOMER_PYTHON, SCF_CUSTOMER_ACCEPTED, SCF_CUSTOMER_RETAINED_OUTPUTS.');
  const acceptedRoot=fs.realpathSync(accepted),retainedRoot=fs.realpathSync(retained);
  const pythonRoot=join(source,PRODUCT,'python');
  const env={...process.env,PYTHONPATH:pythonRoot+(process.env.PYTHONPATH?':'+process.env.PYTHONPATH:'')};
  const logs=privateDirectory(join(work,'logs')),connections=privateDirectory(join(work,'connections'));
  privateDirectory(join(work,'views'));privateDirectory(join(work,'reviews'));privateDirectory(join(work,'states'));
  const lock=childWithInput(python,['-u','-c',LOCK_BOOTSTRAP,join(work,'journey.lock')],env);
  try {
  let lockText='',lockError='';
  lock.stdout.on('data',data=>{lockText+=data;});lock.stderr.on('data',data=>{lockError+=data;});
  for(let n=0;!lockText.includes('LOCKED')&&n<100;n++){
    need(!lock.spawnError&&lock.exitCode===null,'The existing receiving process owns this journey: '+lockError.trim());await delay(50);
  }
  need(lockText.includes('LOCKED'),'The original receiving lock did not start.');
  const journalPath=join(work,'journey-journal.json'),resultPath=join(work,'browser-result.json');
  let journal=fs.existsSync(journalPath)?JSON.parse(regular(journalPath)):
    {schema:'commons.scf-customer-browser-journal.v1',operation_id:OPERATION,parent_operation_id:PROGRAMME,
      source,accepted:acceptedRoot,retained:retainedRoot,created_at:new Date().toISOString(),
      cli:{},ui:{},phases:{},captures:{},outputs:{},attempts:[]};
  need(journal.operation_id===OPERATION&&journal.source===source&&journal.accepted===acceptedRoot&&journal.retained===retainedRoot,
    'Continue the same selected customer source and original archives.');
  const save=()=>{need(lock.exitCode===null&&!lock.spawnError,'The original receiving lock ended.');atomic(journalPath,json(journal));};
  if(journal.state==='completed'){
    const last=journal.attempts.at(-1),saved=journal.completion;
    need(last?.runner.sha256===identity(fileURLToPath(import.meta.url)).sha256&&
      last?.sources_module.sha256===identity(join(dirname(fileURLToPath(import.meta.url)),'native_review_sources.mjs')).sha256,
      'Continue the completed operation with its original maintained runner source.');
    need(saved?.state==='completed'&&saved.operation_id===OPERATION&&Array.isArray(saved.outputs),
      'Reopen the original complete receiving selection.');
    for(const file of saved.outputs)checkedFile(file);
    // The journal is committed first. A lost, stale or failed result is rebuilt from that exact completed selection.
    const completed={...saved,journal:identity(journalPath),outputs:[...saved.outputs,identity(journalPath)]};
    atomic(resultPath,json(completed));return completed;
  }
  const attempt={started_at:new Date().toISOString(),runner:identity(fileURLToPath(import.meta.url)),
    sources_module:identity(join(dirname(fileURLToPath(import.meta.url)),'native_review_sources.mjs'))};
  journal.attempts.push(attempt);save();
  let browser=null,runError=null,result=null,activeAction=null;
  const activeServers=new Set(),pageErrors=[],consoleErrors=[];
  const outputs=new Map();
  function rememberOutput(path){
    const bytes=regular(path),digest=sha(bytes),retained_path=join(work,'retained-files',digest);
    // Publish the complete immutable bytes before any journal reference or temporary-file cleanup.
    atomic(retained_path,bytes,{original:true});
    const item={path,bytes:bytes.length,sha256:digest,retained_path};
    journal.outputs[path]=item;outputs.set(path,item);save();return item;
  }
  async function phase(name,fn){
    const old=journal.phases[name];
    if(old?.completed){
      for(const item of old.outputs||[])checkedFile(item);
      return old.value;
    }
    const before=new Set(Object.keys(journal.outputs)),pageCount=pageErrors.length,consoleCount=consoleErrors.length,value=await fn();
    need(pageErrors.length===pageCount&&consoleErrors.length===consoleCount,'The current customer phase reported a browser error: '+name);
    const added=Object.entries(journal.outputs).filter(([path])=>!before.has(path)).map(([,item])=>item);
    journal.phases[name]={completed:true,completed_at:new Date().toISOString(),value,outputs:added};save();return value;
  }
  function cliArguments(state,rest){
    return ['--checkout',source,'--state',state,'--node',process.execPath,...rest];
  }
  async function cli(name,state,rest){
    const command=cliArguments(state,rest),old=journal.cli[name];
    need(!old||JSON.stringify(old.argv)===JSON.stringify(command),'The saved native command changed: '+name);
    const record=journal.cli[name]??{argv:command,attempts:[]};journal.cli[name]=record;
    const run={started_at:new Date().toISOString()};record.attempts.push(run);save();
    const child=spawn(python,['-m','stellar_forge_buyer.review_cli',...command],{env,stdio:['ignore','pipe','pipe']});
    let out='',err='';child.stdout.on('data',data=>{out+=data;});child.stderr.on('data',data=>{err+=data;});
    const ended=await exitOf(child);
    const suffix=name+'.'+record.attempts.length;
    const stdout=join(logs,suffix+'.stdout.json'),stderr=join(logs,suffix+'.stderr.txt');
    atomic(stdout,Buffer.from(out),{original:true});atomic(stderr,Buffer.from(err),{original:true});
    Object.assign(run,{ended_at:new Date().toISOString(),...ended,stdout:identity(stdout),stderr:identity(stderr)});save();
    need(ended.code===0,'The original native command failed: '+name+'; read '+stderr);
    const value=parseOutput(out);record.result=value;save();return value;
  }
  async function server(name,state,extra=[]){
    const ready=join(connections,name+'.'+randomUUID()+'.json');
    const command=cliArguments(state,['serve','--ready-file',ready,'--browser-operation-id','scf-b41a-browser-'+name,...extra]);
    const child=childWithInput(python,['-u','-c',SERVER_BOOTSTRAP,...command],env);
    const started={name,state,child,ready,stdout:'',stderr:'',closed:false};
    activeServers.add(started);
    child.stdout.on('data',data=>{started.stdout+=data;});child.stderr.on('data',data=>{started.stderr+=data;});
    for(let n=0;n<1200&&!fs.existsSync(ready);n++){
      need(!child.spawnError&&child.exitCode===null,'The Python-owned browser did not start: '+name+' '+started.stderr);
      await delay(50);
    }
    need(fs.existsSync(ready),'The original browser did not publish its connection: '+name);
    const connection=JSON.parse(regular(ready)),url=new URL(connection.url);
    need(connection.schema==='stellar-forge.python-review-connection.v1'&&connection.stateDirectory===state&&
      ['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.protocol==='http:'&&url.hash,
      'The private browser connection differs from this receiving state.');
    started.connection=connection;return started;
  }
  async function closeServer(host){
    if(host.closed)return;host.closed=true;
    host.child.stdin.end();
    const endedPromise=exitOf(host.child);
    let ended=await Promise.race([endedPromise,delay(10000).then(()=>null)]);
    if(!ended){host.child.kill('SIGTERM');ended=await Promise.race([endedPromise,delay(10000).then(()=>null)]);}
    need(ended,'The owned Python browser has not completed its close.');
    atomic(join(logs,host.name+'.'+sha(Buffer.from(host.ready)).slice(0,12)+'.stdout.json'),Buffer.from(host.stdout),{original:true});
    atomic(join(logs,host.name+'.'+sha(Buffer.from(host.ready)).slice(0,12)+'.stderr.txt'),Buffer.from(host.stderr),{original:true});
    activeServers.delete(host);
    need(ended.code===0,'The Python-owned browser did not close successfully: '+host.name);
  }
  function observe(page){
    page.on('pageerror',error=>pageErrors.push({page:page.url().split('#')[0],message:error.message}));
    page.on('console',event=>{if(event.type()==='error')consoleErrors.push({page:page.url().split('#')[0],message:event.text()});});
  }
  async function newPage(host){
    const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    await context.route('**/api/**',async route=>{
      const request=route.request(),method=request.method();
      let input;try{input=request.postDataJSON();}catch{}
      if(!input?.operationId)return route.continue();
      try{
        need(activeAction,'An unrecorded browser mutation attempted to leave this continuation.');
        const path=new URL(request.url()).pathname;
        need(path===activeAction.path&&method===activeAction.method,'The browser write differs from its selected action.');
        const old=journal.ui[activeAction.name];
        if(activeAction.replay){
          need(old&&JSON.stringify(old.input)===JSON.stringify(input),'Replay the unchanged original native request.');
        }else{
          need(!old,'Replay the saved original request before preparing another browser mutation.');
          journal.ui[activeAction.name]={method,path,input,dispatched_at:new Date().toISOString()};save();
        }
        await route.continue();
      }catch(error){activeAction&&(activeAction.error=error);await route.abort('failed');}
    });
    const page=await context.newPage();observe(page);
    await page.goto(host.connection.url,{waitUntil:'domcontentloaded'});
    return {context,page};
  }
  async function api(page,path,method='GET',input){
    const response=await page.evaluate(async({path,method,input})=>{
      const token=sessionStorage.getItem('sf-resource-session');
      const result=await fetch(path,{method,headers:{Authorization:'Bearer '+token,...(input===undefined?{}:{'Content-Type':'application/json'})},
        body:input===undefined?undefined:JSON.stringify(input)});
      return {status:result.status,value:await result.json()};
    },{path,method,input});
    need(response.status>=200&&response.status<300,'Native '+method+' '+path+': '+JSON.stringify(response.value));
    return response.value;
  }
  async function action(page,name,method,path,perform){
    const saved=journal.ui[name];
    if(saved){
      need(saved.path===path&&saved.method===method,'Reopen the original browser action: '+name);
      // A saved reply can be read again; an interrupted reply is resolved through the SAME native operationId.
      if(saved.result)return saved.result;
      activeAction={name,method,path,replay:true,error:null};
      try{
        const value=await api(page,path,method,saved.input);
        saved.result=value;saved.reconciled_at=new Date().toISOString();save();return value;
      }finally{activeAction=null;}
    }
    const selected={name,method,path,error:null};activeAction=selected;
    try{
      const responsePromise=page.waitForResponse(response=>
        response.request().method()===method&&new URL(response.url()).pathname===path,{timeout:60000});
      responsePromise.catch(()=>{});
      await perform();const response=await responsePromise;
      if(selected.error)throw selected.error;
      const value=await response.json(),record=journal.ui[name];
      need(record,'The browser action was not retained before dispatch.');
      record.response={status:response.status(),value,observed_at:new Date().toISOString()};save();
      need(response.ok(),'The original browser action failed: '+name+' '+JSON.stringify(value));
      record.result=value;save();return value;
    }finally{activeAction=null;}
  }
  async function waitText(page,selector,value){
    await page.waitForFunction(({selector,value})=>document.querySelector(selector)?.textContent.trim()===value,{selector,value},{timeout:60000});
  }
  async function comparisonReady(page,id){
    await waitText(page,'#case-id',id);
    await page.waitForFunction(()=>!document.querySelector('#save')?.disabled,null,{timeout:60000});
    need(new URL(page.url()).searchParams.get('id')===id,'The comparison ID was lost during private-session startup.');
  }
  async function gotoLocal(page,path){await page.goto(new URL(path,page.url()).href,{waitUntil:'domcontentloaded'});}
  async function captures(page,label){
    journal.capture_pending??={};
    for(const width of [1440,390]){
      const key=label+'-'+width,old=journal.captures[key];
      if(old){
        checkedFile(old.file);
        need(old.layout.document<=old.layout.viewport+1&&old.layout.body<=old.layout.viewport+1,'The retained customer view overflows: '+key);
        continue;
      }
      let pending=journal.capture_pending[key];
      const path=join(work,'views',key+'.png');
      if(!pending){
        await page.setViewportSize({width,height:width===390?844:1000});
        await page.evaluate(()=>document.fonts.ready);
        const layout=await page.evaluate(({label,width})=>({label,width,viewport:innerWidth,
          document:document.documentElement.scrollWidth,body:document.body.scrollWidth}),{label,width});
        const temporary=path+'.'+randomUUID()+'.candidate.png';
        await page.screenshot({path:temporary,fullPage:true,animations:'disabled'});
        if(layout.document>layout.viewport+1||layout.body>layout.viewport+1){
          (attempt.failed_captures??=[]).push({layout,file:identity(temporary)});save();
          throw new Error('The current customer page overflows at '+key+'.');
        }
        pending={layout,candidate:identity(temporary),path};journal.capture_pending[key]=pending;save();
      }
      need(pending.path===path,'Retain the original screenshot output path.');
      const bytes=fs.existsSync(pending.candidate.path)?regular(checkedFile(pending.candidate).path):regular(path);
      need(bytes.length===pending.candidate.bytes&&sha(bytes)===pending.candidate.sha256,'The original captured view changed before publication.');
      atomic(path,bytes,{original:true});
      journal.captures[key]={layout:pending.layout,file:rememberOutput(path)};
      delete journal.capture_pending[key];save();
      if(fs.existsSync(pending.candidate.path))fs.unlinkSync(pending.candidate.path);
    }
    await page.setViewportSize({width:1440,height:1000});
  }
  async function withBrowser(name,state,fn,extra=[]){
    const host=await server(name,state,extra);let opened;
    try{opened=await newPage(host);return await fn(opened.page,host);}
    finally{if(opened)await opened.context.close();await closeServer(host);}
  }

  async function openComparison(page,id){
    await gotoLocal(page,'/comparisons?id='+id);await comparisonReady(page,id);
  }
  async function openPlan(page,id,comparisonId){
    await gotoLocal(page,'/review-returns?id='+id+'&comparison='+comparisonId);
    await waitText(page,'#plan-id',id);
    need(new URL(page.url()).searchParams.get('comparison')===comparisonId,'The saved return lost its original comparison.');
    return api(page,'/api/review-returns/plans/'+id);
  }
  async function decision(page,name,comparisonId,note){
    await comparisonReady(page,comparisonId);
    const path='/api/comparisons/'+comparisonId+'/decision',saved=journal.ui[name];
    if(!saved){
      await page.locator('#case-review').click();
      await page.waitForFunction(()=>!document.querySelector('#actor').disabled);
      const history=await api(page,'/api/comparisons/'+comparisonId+'/history?target=*');
      const prior=history.at(-1);
      await page.locator('#actor').fill(ACTOR);
      await page.locator('#decision-status').selectOption(prior?.status??'FOLLOW_UP');
      await page.locator('#note').fill(note);
      await page.waitForFunction(()=>document.querySelector('#draft-state').textContent.includes('Unsaved decision edits'));
      await page.reload({waitUntil:'domcontentloaded'});await comparisonReady(page,comparisonId);
      need(await page.locator('#note').inputValue()===note,'The original browser did not retain the unsaved decision after reopening.');
    }
    const result=await action(page,name,'PATCH',path,()=>page.locator('#save').click());
    await openComparison(page,comparisonId);
    const history=await api(page,'/api/comparisons/'+comparisonId+'/history?target=*');
    const request=journal.ui[name].input,actual=history.find(row=>row.revision===request.expectedRevision+1);
    need(actual&&actual.actor===request.actor&&actual.status===request.status&&actual.note===request.note,
      'The saved native decision differs from the original browser request.');
    need(await page.locator('#note').inputValue()===request.note&&
      (await page.locator('#draft-state').textContent()).includes('matches the saved review'),
      'The completed decision did not reopen as the saved review.');
    return {request:journal.ui[name].input,result,history};
  }
  async function fillReturnedResolutions(page,plan,originalResolution){
    const retained=new Map((originalResolution?.resolutions||[]).map(row=>[row.target,row]));
    let offset=0;
    while(true){
      const current=await api(page,'/api/review-returns/plans/'+plan.id+'?offset='+offset+'&limit=25');
      need(current.baseId===plan.baseId,'The original plan changed during resolution.');
      for(const row of current.targets.items){
        const previous=retained.get(row.target);
        if(row.classification!=='CONFLICT'&&!previous)continue;
        const resolution=previous??{choice:'KEEP_LOCAL',reason:'Keep the original local decision while retaining the complete returned source journal.'};
        const select=page.getByRole('combobox',{name:'Resolution for '+row.target,exact:true});
        await select.selectOption(resolution.choice);
        const tr=select.locator('xpath=ancestor::tr');
        await tr.getByLabel('Resolution reason',{exact:true}).fill(resolution.reason);
        if(resolution.choice==='CUSTOM'){
          await tr.getByLabel('New decision',{exact:true}).selectOption(resolution.status);
          await tr.getByLabel('New finding',{exact:true}).fill(resolution.note);
        }
      }
      offset+=current.targets.items.length;
      if(offset>=current.targets.total)break;
      const response=page.waitForResponse(r=>r.request().method()==='GET'&&
        new URL(r.url()).pathname==='/api/review-returns/plans/'+plan.id&&new URL(r.url()).searchParams.get('offset')===String(offset));
      await page.locator('#target-next').click();await response;
      await page.waitForFunction(expected=>document.querySelector('#target-page').textContent.startsWith(expected+'–'),offset+1);
    }
    await page.locator('#reviewer').fill(ACTOR);
  }
  async function download(page,path,click){
    const old=journal.outputs[path];
    if(old){checkedFile(old);return old;}
    const incoming=page.waitForEvent('download',{timeout:60000});await click();
    const transfer=await incoming;need(!(await transfer.failure()),'The original private download did not finish.');
    const temporary=path+'.'+randomUUID()+'.download';
    await transfer.saveAs(temporary);const bytes=regular(temporary);
    need(bytes.length>0,'The complete review download is empty.');
    atomic(path,bytes,{original:true});fs.unlinkSync(temporary);return rememberOutput(path);
  }
  let input;
  async function exportReviews(page,label,comparisonId){
    await gotoLocal(page,'/review-returns?comparison='+comparisonId);
    await waitText(page,'#context-id',comparisonId);
    const result={};
    for(const format of input.index.formats){
      const path=join(work,'reviews',label+'.'+format);
      await page.locator('#export-format').selectOption(format);
      result[format]=await download(page,path,()=>page.locator('#export-button').click());
    }
    const checked=input.format.verifyReturn(JSON.parse(regular(result.json.path)));
    need(checked.packet.comparison.id===comparisonId,'The complete export belongs to another comparison.');
    return {files:result,comparisonId,journalId:checked.current.id,
      changes:checked.packet.changes.length,decisions:checked.packet.decisions.length,
      sourceJournals:checked.graph.sources.length,receipts:checked.graph.receipts.length};
  }
  function includesOriginal(output){
    const actual=input.format.verifyReturn(JSON.parse(regular(output)));
    const original=input.format.verifyReturn(JSON.parse(regular(input.index.paths.complete)));
    need(actual.packet.comparison.id===original.packet.comparison.id&&
      input.format.same(actual.packet.changes,original.packet.changes),'The complete comparison changed while continuing its review.');
    for(const field of ['sources','plans','receipts'])for(const row of original.graph[field]){
      const found=actual.graph[field].find(value=>value.id===row.id);
      need(found&&input.format.same(found,row),'An original '+field+' record is missing from the complete review.');
    }
    return actual;
  }
  function sameReview(a,b){
    const left=input.format.verifyReturn(JSON.parse(regular(a))),right=input.format.verifyReturn(JSON.parse(regular(b)));
    need(left.packet.comparison.id===right.packet.comparison.id&&
      left.packet.comparison.resultSha256===right.packet.comparison.resultSha256&&
      input.format.same(left.packet.changes,right.packet.changes)&&
      input.format.same(left.packet.decisions,right.packet.decisions)&&input.format.same(left.graph,right.graph),
      'Independent receiving did not preserve the complete original comparison and journal.');
    return right;
  }
  async function incomingChoices(page,id){
    const original=JSON.parse(regular(input.index.paths.incomingState));
    const prior=new Map(original.choices.map(choice=>[choice.target,choice]));
    while(true){
      let unresolved=null,position=0,total=0;
      do{
        const data=await api(page,'/api/comparisons/returns/'+id+'/targets?state=CONFLICT&limit=200&offset='+position);
        total=data.total;const found=data.items.findIndex(row=>!row.choiceCurrent);
        if(found>=0){unresolved=data.items[found];position+=found;break;}
        position+=data.items.length;
        need(data.items.length||position>=total,'The original incoming target page is incomplete.');
      }while(position<total);
      if(!unresolved)break;
      const filtered=page.waitForResponse(r=>r.request().method()==='GET'&&
        new URL(r.url()).pathname==='/api/comparisons/returns/'+id+'/targets'&&
        new URL(r.url()).searchParams.get('offset')==='0'&&new URL(r.url()).searchParams.get('state')==='CONFLICT');
      await page.locator('#filter').selectOption('CONFLICT');await filtered;
      // The original UI pages choices in groups of 25. Every native conflict is visited, including later pages.
      const targetPage=Math.floor(position/25);
      for(let n=0;n<targetPage;n++){
        const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/comparisons/returns/'+id+'/targets'&&
          new URL(r.url()).searchParams.get('offset')===String((n+1)*25));
        await page.locator('#target-next').click();await response;
      }
      const targetButton=page.locator('#targets').getByRole('button',{name:unresolved.path||'(root)',exact:true});
      await targetButton.first().click();
      await page.locator('#choice-form').waitFor({state:'visible'});
      const retained=prior.get(unresolved.target),choice=retained?.choice??'KEEP_LOCAL';
      await page.locator('#choice').selectOption(choice);
      await page.locator('#actor').fill(ACTOR);
      await page.locator('#note').fill(retained?.note||'Retain the original local decision and the complete incoming history.');
      if(choice==='CUSTOM')await page.locator('#status').selectOption(retained.status);
      await action(page,'incoming-choice-'+unresolved.target,'POST','/api/comparisons/returns/'+id+'/choose',
        ()=>page.locator('#save-choice').click());
      await gotoLocal(page,'/comparison-returns?id='+id+'&comparison='+input.index.incoming_comparison_id);
      await waitText(page,'#return-id',id);
    }
  }
  try{
    input=await composeOriginalInputs({source,accepted:acceptedRoot,retained:retainedRoot,work});
    journal.input_index=identity(join(work,'inputs','source-index.json'));save();
    {
      const require=createRequire(import.meta.url),modules=fs.realpathSync(args['--playwright-root']);
      const packageName=['playwright','playwright-core'].find(name=>fs.existsSync(join(modules,name,'package.json')));
      need(packageName,'The supplied native node_modules has no maintained Playwright runtime.');
      const playwright=require(join(modules,packageName));
      browser=await playwright.chromium.launch({executablePath:fs.realpathSync(args['--chromium']),headless:true,
        args:['--no-sandbox','--disable-dev-shm-usage']});
      journal.runtime={python,node:process.execPath,node_version:process.version,chromium:fs.realpathSync(args['--chromium']),
        browser_version:browser.version(),playwright:JSON.parse(regular(join(modules,packageName,'package.json'))).version};save();
      const state=name=>privateDirectory(join(work,'states',name));
      const originState=state('original-review'),receiverState=state('independent-review'),reopenedState=state('reopened-review'),incomingState=state('incoming-review');
      const comparisonId=input.index.comparison_id;
      const origin=await phase('original-review',async()=>{
        await cli('origin-receive',originState,['receive','--input',input.index.paths.base,'--return-format','auto',
          '--operation-id','scf-b41a-current-origin-receive-v1']);
        if(input.index.incoming_comparison_id!==comparisonId)
          await cli('origin-other-case',originState,['receive','--input',input.index.paths.incomingLocal,'--return-format','incoming',
            '--operation-id','scf-b41a-current-other-case-v1']);
        const plan=await cli('origin-restage',originState,['review-returns','restage',input.index.original_plan_id,
          '--operation-id','scf-b41a-current-restage-v1']);
        need(plan.comparisonId===comparisonId&&plan.baseId===input.index.base_journal_id&&plan.sourceId===input.index.returned_journal_id,
          'The retained native plan no longer identifies its original reviewer branches.');
        await withBrowser('origin-review',originState,async page=>{
          await waitText(page,'#plan-id',plan.id);
          need(new URL(page.url()).searchParams.get('comparison')===comparisonId,'CLI restaging reopened the wrong comparison.');
          await page.locator('#open-comparison').click();await comparisonReady(page,comparisonId);
          await captures(page,'edition-review');
          await page.locator('#open-returned-journals').click();await waitText(page,'#plan-id',plan.id);
          let current=await api(page,'/api/review-returns/plans/'+plan.id);
          need(current.counts.CONFLICT>0,'The original saved divergent reviewer branches were not preserved.');
          await captures(page,'returned-journal-conflict');
          if(!journal.ui['origin-apply'])await fillReturnedResolutions(page,current,input.index.original_resolution);
          await action(page,'origin-apply','POST','/api/review-returns/plans/'+plan.id+'/apply',()=>page.locator('#apply-button').click());
          current=await api(page,'/api/review-returns/plans/'+plan.id);
          need(current.status==='APPLIED'&&current.receipt,'The reviewed original return was not applied.');
          if(input.index.incoming_comparison_id!==comparisonId){
            await openComparison(page,input.index.incoming_comparison_id);
            const list=await api(page,'/api/comparisons?limit=1');
            need(list.selection===input.index.incoming_comparison_id,'The other original comparison was not selected.');
          }
        });
        const requestFile=join(work,'inputs','continued-apply-request.json');
        atomic(requestFile,json(journal.ui['origin-apply'].input),{original:true});rememberOutput(requestFile);
        const applied=await cli('origin-apply-replay',originState,['review-returns','apply',plan.id,'--input',requestFile]);
        need(applied.comparisonId===comparisonId&&applied.planId===plan.id,'The original applied receipt changed on native replay.');
        const exported=await withBrowser('origin-after-apply',originState,async page=>{
          await waitText(page,'#plan-id',plan.id);
          need(new URL(page.url()).searchParams.get('comparison')===comparisonId,'CLI apply replay reopened another selected case.');
          await captures(page,'returned-journal-applied');
          await page.locator('#open-comparison').click();await comparisonReady(page,comparisonId);
          await decision(page,'origin-decision',comparisonId,
            'Continued the original saved return through the current customer browser. The earlier reviewer decisions and complete source journals remain retained.');
          return exportReviews(page,'origin-review',comparisonId);
        });
        includesOriginal(exported.files.json.path);
        return {step:'review-original-conflict-apply-export',comparisonId,originalPlanId:input.index.original_plan_id,
          planId:plan.id,receipts:exported.receipts,appliedReceiptId:applied.receipt.id,exports:exported,
          stateDirectory:originState};
      });
      const independent=await phase('independent-review',async()=>{
        const received=await cli('independent-receive',receiverState,['receive','--input',origin.exports.files.json.path,
          '--return-format','auto','--operation-id','scf-b41a-current-independent-receive-v1']);
        need(received.id===comparisonId,'Independent receiving changed the comparison identity.');
        const exported=await withBrowser('independent-review',receiverState,async page=>{
          await comparisonReady(page,comparisonId);
          const status=await api(page,'/api/status');
          need(status.config.kind==='snapshot'&&status.config.source===join(receiverState,'receiver-source.json')&&
            regular(status.config.source).toString().trim()==='[]'&&status.config.roots.every(path=>fs.readdirSync(path).length===0),'The independent workspace depends on the original source files.');
          await decision(page,'independent-decision',comparisonId,
            'Reopened the complete received comparison in an independent workspace and continued its saved whole-case review. The returned and original histories remain available.');
          await captures(page,'independent-receiving-edit');
          return exportReviews(page,'received-review',comparisonId);
        });
        includesOriginal(exported.files.json.path);
        await withBrowser('independent-reopen',receiverState,async page=>{
          await comparisonReady(page,comparisonId);
          const request=journal.ui['independent-decision'].input;
          need(await page.locator('#note').inputValue()===request.note,'The independent saved review did not reopen.');
        });
        await cli('complete-reopen-receive',reopenedState,['receive','--input',exported.files.json.path,
          '--return-format','auto','--operation-id','scf-b41a-current-complete-reopen-v1']);
        const final=await withBrowser('complete-reopen',reopenedState,async page=>{
          await comparisonReady(page,comparisonId);return exportReviews(page,'reopened-review',comparisonId);
        });
        sameReview(exported.files.json.path,final.files.json.path);
        return {step:'independent-source-absent-receiving-edit-reopen',comparisonId,
          stateDirectory:receiverState,reopenedStateDirectory:reopenedState,exports:exported,reopenedExports:final};
      });
      const incoming=await phase('incoming-review',async()=>{
        await cli('incoming-local-receive',incomingState,['receive','--input',input.index.paths.incomingLocal,
          '--return-format','incoming','--operation-id','scf-b41a-current-incoming-local-v1']);
        const received=await cli('incoming-stage',incomingState,['receive','--input',input.index.paths.incoming,
          '--return-format','auto','--stage-return','--operation-id','scf-b41a-current-incoming-stage-v1']);
        need(received.id===input.index.incoming_return_id&&received.comparisonId===input.index.incoming_comparison_id,
          'The incoming review did not retain its original return and comparison identities.');
        const exported=await withBrowser('incoming-review',incomingState,async page=>{
          await waitText(page,'#return-id',received.id);
          need(new URL(page.url()).searchParams.get('comparison')===received.comparisonId,'The incoming CLI return lost its comparison.');
          let current=await api(page,'/api/comparisons/returns/'+received.id);
          if(current.state!=='APPLIED'){
            if(current.counts.unresolved)await incomingChoices(page,received.id);
            await action(page,'incoming-apply','POST','/api/comparisons/returns/'+received.id+'/apply',()=>page.locator('#apply').click());
            await gotoLocal(page,'/comparison-returns?id='+received.id+'&comparison='+received.comparisonId);
            await waitText(page,'#return-id',received.id);
          }
          current=await api(page,'/api/comparisons/returns/'+received.id);
          need(current.state==='APPLIED','The original incoming return did not complete.');
          await captures(page,'incoming-review-return');
          const acceptedDownload=join(work,'reviews','incoming-accepted-review.json');
          await download(page,acceptedDownload,()=>page.locator('#download-accepted').click());
          input.format.verifyReturn(JSON.parse(regular(acceptedDownload)));
          await page.locator('#open-comparison').click();await comparisonReady(page,received.comparisonId);
          const result=await exportReviews(page,'incoming-review',received.comparisonId);
          sameReview(acceptedDownload,result.files.json.path);
          return {...result,acceptedDownload:identity(acceptedDownload),application:current.application};
        });
        return {step:'original-incoming-review-browser',returnId:received.id,comparisonId:received.comparisonId,
          stateDirectory:incomingState,exports:exported};
      });
      await phase('complete-report',async()=>{
        const context=await browser.newContext({viewport:{width:1440,height:1000}});
        const page=await context.newPage();observe(page);
        try{
          await page.goto(pathToFileURL(independent.exports.files.html.path).href,{waitUntil:'load'});
          await page.locator('#review-lineage').waitFor();
          await captures(page,'complete-review-report');
          await page.locator('#lineage-expand').click();
          need(await page.locator('#review-lineage details:not([open])').count()===0,'The complete report did not expand every retained record.');
          await page.locator('#lineage-collapse').click();
          await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
          need(await page.locator('#review-lineage details:not([open])').count()===0,'Print did not include the complete retained record.');
          await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
          return {step:'complete-report-expand-and-print',path:independent.exports.files.html.path};
        }finally{await context.close();}
      });
      await browser.close();browser=null;
      need(!pageErrors.length&&!consoleErrors.length,'The current customer browser reported an error; read browser-result.json.');
      const capturesList=EXPECTED_CAPTURES.flatMap(label=>[1440,390].map(width=>journal.captures[label+'-'+width]));
      need(capturesList.length===12&&capturesList.every(Boolean),'Keep all twelve original customer views.');
      for(const item of capturesList)checkedFile(item.file);
      for(const output of Object.values(journal.outputs))checkedFile(output);
      // Native servers are closed. Retain every complete input and database member before marking completion.
      need(activeServers.size===0,'Close every original native workspace before retaining its final files.');
      for(const root of ['inputs','states','reviews'])for(const path of filesBelow(join(work,root)))rememberOutput(path);
      journal.state='completed';journal.completed_at=new Date().toISOString();attempt.completed_at=journal.completed_at;
      journal.completion={schema:'commons.scf-complete-customer-browser.v1',state:'completed',operation_id:OPERATION,
        parent_operation_id:PROGRAMME,completed_at:journal.completed_at,pageErrors,consoleErrors,
        screenshots:capturesList.map(item=>basename(item.file.path)),layouts:capturesList.map(item=>item.layout),
        steps:[origin,independent,incoming,journal.phases['complete-report'].value],closed:['context','browser'],
        runtime:journal.runtime,inputIndex:identity(join(work,'inputs','source-index.json')),
        outputs:Object.values(journal.outputs),
        retained:{states:join(work,'states'),originalOutputs:retainedRoot,acceptedCustomer:acceptedRoot,
          originalProgramme:PROGRAMME},elapsedMs:Date.now()-Date.parse(attempt.started_at)};
      save();
      result={...journal.completion,journal:identity(journalPath),outputs:[...journal.completion.outputs,identity(journalPath)]};
      atomic(resultPath,json(result));
    }
  }catch(error){
    runError=error;attempt.failed_at=new Date().toISOString();attempt.error=error.message;attempt.pageErrors=pageErrors;attempt.consoleErrors=consoleErrors;
    journal.state='failed';save();
    atomic(resultPath,json({schema:'commons.scf-complete-customer-browser.v1',state:'failed',operation_id:OPERATION,
      parent_operation_id:PROGRAMME,pageErrors,consoleErrors,error:error.message,steps:Object.values(journal.phases).map(row=>row.value),
      layouts:Object.values(journal.captures).map(row=>row.layout),journal:identity(journalPath)}));
  }finally{
    for(const host of [...activeServers])try{await closeServer(host);}catch(error){runError??=error;}
    if(browser)try{await browser.close();}catch(error){runError??=error;}
  }
  if(runError)throw runError;
  return result;
  } finally {
    lock.stdin.end();
    await Promise.race([exitOf(lock).catch(()=>null),delay(5000)]);
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n')).catch(error=>{
    process.stderr.write(JSON.stringify({error:error.code||error.name,message:error.message})+'\n');process.exitCode=1;
  });
}
