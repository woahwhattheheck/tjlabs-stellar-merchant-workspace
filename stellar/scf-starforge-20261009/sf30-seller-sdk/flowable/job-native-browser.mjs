// MIT. TJLabs actual installed Flowable job desk; caller owns browser/context lifetime.
import {readFile,mkdir,writeFile,readdir,lstat,rename} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(v,m)=>{if(!v)throw new Error(m);};
const queues=['jobs','timerJobs','suspendedJobs','deadLetterJobs','historyJobs'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function known(p){try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function save(p,v){const t=p+'.partial-'+randomUUID();await writeFile(t,JSON.stringify(v,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(t,p);}
async function identity(p){const b=await readFile(p);return{path:p,bytes:b.length,sha256:sha(b)};}
async function inventory(root){const all=[];async function scan(p){for(const x of await readdir(p,{withFileTypes:true})){if(x.name==='result.json'||x.name==='browser-state.json')continue;const q=join(p,x.name);need(!x.isSymbolicLink(),'Retain regular actual browser outputs.');if(x.isDirectory())await scan(q);else if(x.isFile())all.push({...await identity(q),path:relative(root,q)});}}await scan(root);return all;}
export async function inspectJobRecoveryBrowser({page,context,url,directory,mode,selection,client,signal}){
 need(['author','received'].includes(mode),'Select the original operating or cold receiving chapter.');
 await mkdir(directory,{recursive:true,mode:0o700});
 const statePath=join(directory,'browser-state.json'),prior=await known(statePath),binding={mode,inputSha256:selection.inputSha256,connectionId:selection.connectionId,portfolio:selection.portfolio,selected:selection.selected,timerDueDate:selection.timerDueDate??null};
 const state=prior??{schema:'stellar-forge.flowable-job-browser.v1',binding,steps:{},createdAt:new Date().toISOString()};
 need(same(state.binding,binding),'Continue the same original browser selection.');
 const persist=()=>save(statePath,state),attempt=join(directory,'attempt-'+randomUUID());await mkdir(attempt,{mode:0o700});
 const errors=[],routeFailures=[];let handler;
 const onError=e=>errors.push(String(e));page.on('pageerror',onError);
 const idle=async()=>{signal?.throwIfAborted();await page.locator('#busy').waitFor({state:'hidden',timeout:120000});};
 const healthy=async()=>{await idle();need(await page.locator('#notice').getAttribute('data-level')!=='error','The original job desk reported: '+await page.locator('#notice').innerText());};
 async function open(){await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#workspace-id')?.textContent?.includes('Workspace '));await healthy();
  await page.locator('#engine-select').selectOption(selection.connectionId);await healthy();await page.locator('[data-page="jobs"]').click();
  await page.locator('#job-portfolio-select').selectOption(selection.portfolio.id);await healthy();}
 async function screenshot(name){await idle();await page.locator('#detail-content details').evaluateAll(nodes=>{for(const n of nodes)n.open=true;});const p=join(attempt,name+'.png');await page.screenshot({path:p,fullPage:true});await writeFile(join(attempt,name+'.txt'),await page.locator('body').innerText(),{mode:0o600});return identity(p);}
 async function retainDownload(d,name,expected){
  const p=join(attempt,name);await d.saveAs(p);need(!(await d.failure()),'Original download failed.');
  const actual=await identity(p);if(expected)need(actual.bytes===expected.bytes&&actual.sha256===expected.sha256,'Downloaded source differs from its original native bytes.');
  const companion=await context.newPage();
  try{const ext=name.split('.').pop();if(['json','txt','xml'].includes(ext)){await companion.goto(pathToFileURL(p).href,{waitUntil:'domcontentloaded'});await companion.screenshot({path:p+'.png',fullPage:true});await writeFile(p+'.visible.txt',await companion.locator('body').innerText(),{mode:0o600});}}finally{await companion.close();}
  return actual;
 }
 async function download(locator,name,expected){
  const waiting=page.waitForEvent('download',{timeout:120000});await locator.click();return retainDownload(await waiting,name,expected);
 }
 async function inspect(collection){
  await page.locator('#job-collection-select').selectOption(collection);await healthy();await page.locator('#job-search').fill(selection.selected[collection].id);
  const row=page.locator('#jobs-table tbody tr').filter({hasText:selection.selected[collection].id});need(await row.count()===1,'Show exactly the retained native job.');
  await row.getByRole('button',{name:'Inspect / prepare',exact:true}).click();await healthy();
  const detail=await client.action('readJob',{portfolioId:selection.portfolio.id,revision:selection.portfolio.revision,collection,jobId:selection.selected[collection].id});
  need((await page.locator('#detail-content').innerText()).includes(detail.job.id),'Open the actual captured native job.');
  const refs=(detail.resources??[]).map(r=>r.originalResource??r.definitionRef).filter(Boolean);
  const links=page.locator('#detail-content a[href*="/api/source"]').filter({hasText:'Download complete native exception'});
  need(await links.count()===refs.length,'Every retained native exception must have its actual source link.');
  for(const [i,reference]of refs.entries())await download(links.nth(i),collection+'-exception-'+i+'.txt',reference);
  await screenshot(collection);return detail;
 }
 async function all(kind){let offset=0,snapshot,result=[];for(;;){
  const r=await client.action('listRecords',{kind,offset,limit:500,...(snapshot?{snapshot}:{})});
  need(r.offset===offset&&(!snapshot||r.snapshot===snapshot),'Continue the same complete original record snapshot.');
  snapshot=r.snapshot;result.push(...r.items);if(r.nextOffset===null){need(result.length===r.total,'Read every original record before selecting.');return result;}
  need(r.nextOffset>offset,'Original record pages must advance.');offset=r.nextOffset;
 }}
 async function openOperation(id){
  const r=await client.action('getRecord',{kind:'jobOperation',id});
  const selected=(await all('jobOperation')).filter(x=>x.connectionId===selection.connectionId&&x.label===r.value.label);
  need(selected.length===1&&selected[0].id===id,'The exact original label must identify only the requested native record.');
  await page.locator('#job-search').fill('');const table=page.locator('#jobOperation-records');
  const previous=table.getByRole('button',{name:'Previous',exact:true});
  while(await previous.count()&&await previous.isEnabled()){await previous.click();await idle();}
  for(;;){
   const row=table.locator('tbody tr').filter({has:page.getByRole('cell',{name:r.value.label,exact:true})});
   need(await row.count()<=1,'One original table page contains duplicate recovery labels.');
   if(await row.count()===1){await row.getByRole('button',{name:'Review',exact:true}).click();await healthy();return r;}
   const next=table.getByRole('button',{name:'Next',exact:true});need(await next.count()&&await next.isEnabled(),'Find the selected original recovery review through complete table pages.');
   await next.click();await idle();
  }
 }
 try{
  await persist();await open();
  for(const q of queues)await inspect(q);
  await page.locator('#job-search').fill('tjlabs-absent-'+selection.inputSha256);need(await page.locator('#jobs-table tbody tr').count()===0,'An absent search should not select a job.');await screenshot('empty-search');
  if(mode==='author'){
   const label='TJLabs original browser timer '+selection.inputSha256.slice(0,12);
   let matches=(await all('jobOperation')).filter(x=>x.label===label);need(matches.length<=1,'The original timer review must be unique.');
   if(!matches.length){
    // Reuse the complete retained local draft after an interrupted preparation.
    const pending=page.locator('#pending');
    if(await pending.isVisible()){await page.locator('#resume').click();await healthy();matches=(await all('jobOperation')).filter(x=>x.label===label);}
   }
   if(!matches.length){
    await inspect('timerJobs');
    await page.locator('#jobOperation-form [name="label"]').fill(label);
    await page.locator('#jobOperation-form [name="note"]').fill('TJLabs isolated native timer. Preserve this original reschedule request and its actual engine result.');
    await page.locator('#jobOperation-form [name="action"]').selectOption('reschedule');
    await page.locator('#jobOperation-form [name="dueDate"]').fill(selection.timerDueDate);
    state.working=await download(page.locator('#job-working-download'),'Original_Timer_Working.json');
    await persist();
    // Reopen the actual complete unfinished file through the ordinary UI.
    const beforeOpen=page.waitForEvent('download',{timeout:120000});
    await page.locator('#job-working-file').setInputFiles(state.working.path);
    state.previousWorking=await retainDownload(await beforeOpen,'Flowable_Job_Working_Before_Open.json',state.working);await persist();await healthy();
    need(await page.locator('#jobOperation-form [name="label"]').inputValue()===label,'Working receiving changed the complete authored draft.');
    await page.locator('#job-prepare').click();await healthy();
    matches=(await all('jobOperation')).filter(x=>x.label===label);need(matches.length===1,'Save exactly one original browser review.');
   }
   const id=matches[0].id;let record=await openOperation(id);state.operationId=id;await persist();
   if(!record.value.dispatchedAt){
    need(record.value.phase==='PREPARED','The selected original timer review is not ready.');
    let finished;const routeDone=new Promise(resolve=>{finished=resolve;});
    handler=async route=>{
     try{
      const request=route.request();let body;try{body=request.postDataJSON();}catch{}
      if(request.method()!=='POST'||new URL(request.url()).pathname!=='/api/action'||body?.method!=='dispatchJobOperation'||body.args?.id!==id){await route.continue();return;}
      // Keep the real application result before withholding this one browser reply.
      const response=await route.fetch(),raw=await response.body(),actual=JSON.parse(raw);
      need(response.ok()&&actual.id===id&&actual.value.dispatchedAt,'The original dispatch response must identify its real saved operation.');
      const name=join(attempt,'withheld-original-dispatch.json');await writeFile(name,raw,{mode:0o600,flag:'wx'});
      state.interruption={request:body,resultFile:await identity(name),status:response.status(),originalDispatchRequestId:actual.value.dispatchRequestId};
      await persist();await route.abort('failed');finished();
     }catch(e){routeFailures.push(String(e));state.routeFailure=String(e);await persist().catch(()=>{});await route.abort('failed').catch(()=>{});finished();}
    };
    await page.route('**/api/action',handler);
    await page.locator('#detail-content').getByRole('button',{name:'Execute reviewed job recovery',exact:true}).click();
    let timer;try{await Promise.race([routeDone,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Original dispatch interception did not finish.')),120000);timer.unref?.();})]);}finally{clearTimeout(timer);}
    await idle();await page.unroute('**/api/action',handler);handler=null;need(!routeFailures.length,routeFailures.join('\n'));
    need(await page.locator('#pending').isVisible(),'The interrupted original dispatch must remain recoverable.');
   }
   if(await page.locator('#pending').isVisible()){await page.reload({waitUntil:'domcontentloaded'});await idle();await page.locator('#resume').click();await healthy();}
   record=await client.action('getRecord',{kind:'jobOperation',id});
   need(record.value.dispatchedAt&&['CONFIRMED','ACCEPTED'].includes(record.value.state),'The exact original saved dispatch must finish without a second native request.');
   if(state.interruption)need(record.value.dispatchRequestId===state.interruption.originalDispatchRequestId,'Resuming changed the original dispatch identity.');
   await open();await openOperation(id);await screenshot('original-dispatch-recovered');
   state.operation={id,revision:record.revision,sha256:record.sha256,dispatchRequestId:record.value.dispatchRequestId};await persist();
  }
  await open();
  const operations=await all('jobOperation');
  for(const op of operations.filter(x=>x.connectionId===selection.connectionId)){
   const record=await openOperation(op.id),review=await client.action('readReview',{kind:'jobOperation',id:op.id,revision:record.revision});
   await writeFile(join(attempt,'review-'+op.id+'.json'),JSON.stringify(review,null,2)+'\n',{mode:0o600});
   for(const [i,item]of review.originals.entries()){
    const link=page.locator('#detail-content a[href*="/api/source"]').filter({hasText:item.role});
    need(await link.count()===1,'Show every actual native request/response/source link.');
    await download(link,op.id+'-source-'+i+'.json',item.reference);
   }
   await screenshot('review-'+op.id);
  }
  await page.setViewportSize({width:390,height:844});for(const q of queues){await inspect(q);await screenshot('phone-'+q);}
  await page.setViewportSize({width:1440,height:1000});await healthy();
  need(!errors.length&&!routeFailures.length,'Actual browser errors: '+errors.concat(routeFailures).join('\n'));
  const result={schema:state.schema,state:'OPERATED',mode,inputSha256:selection.inputSha256,binding,operation:state.operation??null,files:await inventory(directory)};
  await persist();return result;
 }finally{if(handler)await page.unroute('**/api/action',handler);page.off('pageerror',onError);}
}
