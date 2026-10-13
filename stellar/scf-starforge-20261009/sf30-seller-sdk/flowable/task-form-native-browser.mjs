// MIT. TJLabs original native task-form desk; caller owns page, context and engine lifetime.
import {readFile,writeFile,mkdir,readdir,lstat,rename,open} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const canon=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const need=(v,m)=>{if(!v)throw new Error(m);};
const same=(a,b)=>canon(a)===canon(b);
const ref=r=>({kind:r.kind,id:r.id,revision:r.revision,sha256:r.sha256});
async function known(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function identity(path){const b=await readFile(path);return{path,bytes:b.length,sha256:hash(b)};}
async function save(path,value){const temp=path+'.partial-'+randomUUID(),h=await open(temp,'wx',0o600);try{await h.writeFile(JSON.stringify(value,null,2)+'\n');await h.sync();}finally{await h.close();}await rename(temp,path);}
async function inventory(root){
 const items=[];async function walk(path){for(const x of await readdir(path,{withFileTypes:true})){if(x.name==='result.json'||x.name==='browser-state.json')continue;
  const full=join(path,x.name);need(!x.isSymbolicLink(),'Retain actual regular browser artifacts.');
  if(x.isDirectory())await walk(full);else if(x.isFile())items.push({...await identity(full),path:relative(root,full)});
 }}await walk(root);return items.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function inspectTaskFormBrowser({page,context,url,directory,mode,selection,client,signal}){
 need(['author','received'].includes(mode),'Select author or received task-form course.');
 await mkdir(directory,{recursive:true,mode:0o700});
 const statePath=join(directory,'browser-state.json'),binding={mode,selection},prior=await known(statePath);
 const state=prior??{schema:'stellar-forge.flowable-task-form-browser.v1',binding,steps:{},createdAt:new Date().toISOString()};
 need(same(state.binding,binding),'Continue the same complete original task-form browser selection.');
 const attempt=join(directory,'attempt-'+randomUUID());await mkdir(attempt,{mode:0o700});
 let tail=Promise.resolve(),handler=null;const errors=[],routeErrors=[];
 if(state.routeError){state.previousRouteErrors??=[];state.previousRouteErrors.push(state.routeError);delete state.routeError;}
 const persist=()=>{const snapshot=JSON.parse(JSON.stringify(state));tail=tail.then(()=>save(statePath,snapshot));return tail;};
 const onError=e=>errors.push(String(e));page.on('pageerror',onError);
 const idle=async()=>{signal?.throwIfAborted();await page.locator('#busy').waitFor({state:'hidden',timeout:180000});};
 const healthy=async()=>{await idle();need(await page.locator('#notice').getAttribute('data-level')!=='error','Original form desk reported: '+await page.locator('#notice').innerText());};
 async function openDesk(){
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#workspace-id')?.textContent?.includes('Workspace '));
  await healthy();await page.locator('#engine-select').selectOption(selection.connectionId);await healthy();await page.locator('[data-page="task-forms"]').click();
 }
 async function screenshot(name){
  await idle();await page.locator('#task-native-original details,#detail-content details').evaluateAll(nodes=>{for(const n of nodes)n.open=true;});
  const path=join(attempt,name+'.png');await page.screenshot({path,fullPage:true});await writeFile(join(attempt,name+'.visible.txt'),await page.locator('body').innerText(),{mode:0o600});return identity(path);
 }
 async function look(path){
  const companion=await context.newPage();try{
   await companion.goto(pathToFileURL(path).href,{waitUntil:'domcontentloaded'});
   await companion.screenshot({path:path+'.png',fullPage:true});await writeFile(path+'.visible.txt',await companion.locator('body').innerText(),{mode:0o600});
  }finally{await companion.close();}
 }
 async function download(locator,name,expected,{inspect=true}={}){
  const waiting=page.waitForEvent('download',{timeout:180000});await locator.click();const d=await waiting,path=join(attempt,name);
  await d.saveAs(path);need(!(await d.failure()),'The actual browser download failed.');const actual=await identity(path);
  if(expected)need(actual.bytes===expected.bytes&&actual.sha256===expected.sha256,'Actual browser source bytes differ from the original source.');
  if(inspect)await look(path);return actual;
 }
 async function openWorking(file){
  const actual=await identity(file.path);need(actual.bytes===file.bytes&&actual.sha256===file.sha256,'Retained full working file changed.');
  const previous=page.waitForEvent('download',{timeout:180000});
  await page.locator('#task-native-working-file').setInputFiles(file.path);
  const d=await previous,p=join(attempt,'Before_Open_'+randomUUID()+'.json');await d.saveAs(p);need(!(await d.failure()),'Prior working copy download failed.');await look(p);await healthy();
 }
 async function openCapture(reference){
  const original=await client.action('readTaskForm',{id:reference.id,revision:reference.revision});
  need(original.capture.sha256===reference.sha256,'Select the exact captured source revision.');
  await page.locator('#task-native-search').fill(reference.id);
  const row=page.locator('#task-native-captures tbody tr');need(await row.count()===1,'Select exactly one original form capture.');
  await row.getByRole('button',{name:'Open typed form',exact:true}).click();await healthy();
  need((await page.locator('#task-native-editing-label').innerText()).includes(reference.id),'The visible editor must identify the selected original capture.');
  return original;
 }
 async function sources(original,prefix){
  await page.locator('#task-native-original').evaluate(el=>{for(let x=el;x;x=x.parentElement)if(x.tagName==='DETAILS')x.open=true;for(const x of el.querySelectorAll('details'))x.open=true;});
  const captured=await download(page.locator('#task-native-original').getByRole('button',{name:'Download complete captured form JSON',exact:true}),prefix+'-captured-form.json');
  need(same(JSON.parse(await readFile(captured.path,'utf8')),original),'Actual captured-form attachment changed original fields.');
  for(const [i,item]of (original.originals??[]).entries()){
   const locator=page.locator('#task-native-original a[href*="/api/source"]').filter({hasText:item.role});
   need(await locator.count()===1,'Every original task/form capture source is visibly downloadable.');
   await download(locator,prefix+'-original-'+i+'.json',item.reference);
  }
  const resourceLinks=page.locator('#task-native-original a[href*="/api/source"]').filter({hasText:'Download complete original'});
  const refs=(original.resources??[]).map(r=>r.originalResource??r.definitionRef).filter(Boolean);
  need(await resourceLinks.count()===refs.length,'Every original native resource has a complete source link.');
  for(let i=0;i<refs.length;i++)await download(resourceLinks.nth(i),prefix+'-resource-'+i+'.txt',refs[i]);
 }
 async function all(kind){let offset=0,snapshot;const rows=[];for(;;){const r=await client.action('listRecords',{kind,offset,limit:31,...(snapshot?{snapshot}:{})});
  need(r.offset===offset&&(!snapshot||snapshot===r.snapshot),'Continue one original record-list snapshot.');snapshot=r.snapshot;rows.push(...r.items);
  if(r.nextOffset===null){need(rows.length===r.total,'Retain the complete original record list.');return rows;}need(r.nextOffset>offset,'Record pages must advance.');offset=r.nextOffset;
 }}
 async function openOperation(id){
  const record=await client.action('getRecord',{kind:'taskFormOperation',id}),list=(await all('taskFormOperation')).filter(r=>r.connectionId===selection.connectionId&&r.label===record.value.label);
  need(list.length===1&&list[0].id===id,'The actual reviewed task-form label must identify this original operation.');
  const table=page.locator('#taskFormOperation-records'),prev=table.getByRole('button',{name:'Previous',exact:true});
  while(await prev.count()&&await prev.isEnabled()){await prev.click();await idle();}
  for(;;){
   const row=table.locator('tbody tr').filter({has:page.getByRole('cell',{name:record.value.label,exact:true})});
   need(await row.count()<=1,'One page must not repeat the original operation label.');
   if(await row.count()){await row.getByRole('button',{name:'Review',exact:true}).click();await healthy();return record;}
   const next=table.getByRole('button',{name:'Next',exact:true});need(await next.count()&&await next.isEnabled(),'Find the original operation through its complete saved pages.');await next.click();await idle();
  }
 }
 async function inspectOperation(reference,prefix){
  const record=await openOperation(reference.id),review=await client.action('readReview',{kind:'taskFormOperation',id:record.id,revision:record.revision});
  need(review.formCapture?.id,'The actual submission review must retain its selected form capture.');
  await writeFile(join(attempt,prefix+'-review.json'),JSON.stringify(review,null,2)+'\n',{mode:0o600});
  for(const [i,item]of review.originals.entries()){
   const link=page.locator('#detail-content a[href*="/api/source"]').filter({hasText:item.role});
   need(await link.count()===1,'Read every original reviewed source and native result attachment.');
   await download(link,prefix+'-source-'+i+'.json',item.reference);
  }
  await screenshot(prefix);return record;
 }
 async function intercept(method,invoke){
  let finish;const done=new Promise(resolve=>{finish=resolve;});let timer;
  handler=async route=>{
   try{
    const request=route.request();let body;try{body=request.postDataJSON();}catch{}
    if(request.method()!=='POST'||body?.method!==method){await route.continue();return;}
    const preparation=method==='prepareTaskFormOperation';
    need(body.args?.connectionId===selection.connectionId||!preparation,'Preparation selected a different engine.');
    if(preparation)need(body.args.captureId===selection.capture.id&&body.args.captureRevision===selection.capture.revision&&
      same(body.args.selection,{taskId:selection.taskId,properties:selection.properties}),'The visible fields changed the actual typed native selection.');
    const working=await download(page.locator('#task-native-working-download'),preparation?'Original_Preparation_Working.json':'Original_Submission_Working.json',null,{inspect:false});
    const packet=JSON.parse(await readFile(working.path,'utf8'));
    const retained=preparation?packet.drafts.find(d=>d.preparation?.requestId===body.args.requestId)?.preparation:
      packet.dispatches.find(d=>d.request.requestId===body.args.requestId)?.request;
    need(same(retained,body.args),'Retain the exact application working file before its original native request.');
    state[preparation?'preparation':'submission']={request:body,working};await persist();
    const response=await route.fetch(),raw=await response.body(),parsed=JSON.parse(raw),path=join(attempt,preparation?'Original_Preparation_Response.json':'Withheld_Submission_Response.json');
    await writeFile(path,raw,{mode:0o600,flag:'wx'});
    need(response.ok()&&parsed.kind==='taskFormOperation'&&(!preparation?parsed.value.dispatchedAt:parsed.value.phase==='PREPARED'),'The original native operation did not produce the expected saved result: '+JSON.stringify(parsed));
    state[preparation?'preparation':'submission'].response=await identity(path);state.operation=ref(parsed);await persist();
    if(preparation)await route.fulfill({response});else await route.abort('failed');
    finish();
   }catch(e){routeErrors.push(String(e));state.routeError={method,message:String(e),at:new Date().toISOString()};await persist().catch(()=>{});await route.abort('failed').catch(()=>{});finish();}
  };
  await page.route('**/api/action',handler);
  try{
   await invoke();
   await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('The original form request did not complete its retained route.')),180000);timer.unref?.();})]);
   await idle();need(!routeErrors.length,routeErrors.join('\n'));
  }finally{clearTimeout(timer);await page.unroute('**/api/action',handler);handler=null;}
 }
 try{
  await persist();await openDesk();
  const original=await openCapture(selection.capture);
  const properties=original.form?.formProperties??[];
  for(const id of selection.hiddenPropertyIds??[])need(!properties.some(p=>p.id===id)&&await page.locator('[data-property-id]').evaluateAll((els,id)=>els.filter(e=>e.dataset.propertyId===id).length,id)===0,'The native hidden property must not become a visible editable field.');
  for(const [id,value]of Object.entries(selection.readonlyValues??{})){
   need(properties.find(p=>p.id===id)?.value===value&&properties.find(p=>p.id===id)?.writable===false,'Retain native read-only property value.');
   const field=page.locator('[data-property-id]').filter({has:page.locator('h3')});
   need(await page.locator('[data-form-property]').evaluateAll((els,id)=>els.filter(e=>e.dataset.formProperty===id).length,id)===0,'Read-only property must have no submission control.');
  }
  await sources(original,'original-form');await screenshot('original-typed-form-desktop');
  if(mode==='author'){
   const label='TJLabs original browser form '+selection.inputSha256.slice(0,12);
   let matches=(await all('taskFormOperation')).filter(r=>r.label===label&&r.connectionId===selection.connectionId);
   need(matches.length<=1,'Retain exactly one original browser form operation.');
   if(state.submission?.working){
    await openWorking(state.submission.working);
   }else if(state.preparation?.working){
    await openWorking(state.preparation.working);
    if(!matches.length){await page.locator('#task-native-prepare').click();await healthy();matches=(await all('taskFormOperation')).filter(r=>r.label===label&&r.connectionId===selection.connectionId);}
   }else if(!matches.length){
    if(state.unfinishedWorking)await openWorking(state.unfinishedWorking);
    else{
     await page.locator('#task-native-submit-form [name="label"]').fill(label);
     await page.locator('#task-native-submit-form [name="note"]').fill('TJLabs isolated actual native task form. Preserve exact long digits, null, empty string and omission; complete source and request history accompany this submission.');
     for(const property of selection.properties){
      const modes=page.locator('[data-form-control="mode"]');
      const index=await modes.evaluateAll((els,id)=>els.findIndex(x=>x.dataset.formProperty===id),property.id);
      need(index>=0,'The original selected native property must be editable: '+property.id);
      await modes.nth(index).selectOption(property.value===null?'null':'value');
      if(property.value!==null){
       const values=page.locator('[data-form-control="value"]'),vi=await values.evaluateAll((els,id)=>els.findIndex(x=>x.dataset.formProperty===id),property.id),input=values.nth(vi);
       if(await input.evaluate(e=>e.tagName)==='SELECT')await input.selectOption(property.value);else await input.fill(property.value);
      }
     }
     state.unfinishedWorking=await download(page.locator('#task-native-working-download'),'Unfinished_Task_Form.json');await persist();
    }
    // Leave the original document, then reopen the real desk in the caller-owned page.
    await page.goto('about:blank');await openDesk();await openWorking(state.unfinishedWorking);
    need(await page.locator('#task-native-submit-form [name="label"]').inputValue()===label,'Actual unfinished working reopening changed the authored form.');
    await screenshot('unfinished-form-reopened');
    await intercept('prepareTaskFormOperation',()=>page.locator('#task-native-prepare').click());await healthy();
    matches=(await all('taskFormOperation')).filter(r=>r.label===label&&r.connectionId===selection.connectionId);
   }
   const id=state.submission?.request.args.id??state.operation?.id??matches[0]?.id;need(id,'Retain the original prepared form ID before dispatch.');
   let record=await openOperation(id);
   if(!state.submission){
    need(record.value.phase==='PREPARED','Read the actual original prepared form before submission.');
    await intercept('dispatchTaskFormOperation',()=>page.locator('#detail-content').getByRole('button',{name:'Submit reviewed form and complete task',exact:true}).click());
   }
   need(state.submission?.working,'Retain the complete original submission working file.');
   await look(state.submission.working.path);
   await page.goto('about:blank');await openDesk();await openWorking(state.submission.working);
   const row=page.locator('#task-native-submissions [data-submission-id]').filter({hasText:id});
   need(await row.count()===1,'The reopened working file must show the exact original native submission.');
   await row.getByRole('button',{name:'Read original submission result',exact:true}).click();await healthy();
   record=await client.action('getRecord',{kind:'taskFormOperation',id});
   need(record.value.dispatchRequestId===state.submission.request.args.requestId&&record.value.state==='CONFIRMED','Original form continuation must preserve the same dispatch and completed native history.');
   state.operation=ref(record);await persist();await openOperation(id);await screenshot('original-form-submission-recovered');
   state.completedWorking=await download(page.locator('#task-native-working-download'),'Completed_Task_Form_Working.json');await persist();
  }else{
   need(selection.completedOperation?.kind==='taskFormOperation','Cold receiving must select the actual completed native form operation.');
   state.operation=selection.completedOperation;await persist();
  }
  await openDesk();
  for(const [name,reference]of [['native',selection.nativeOperation],['rejected',selection.rejectedOperation],['stale',selection.staleOperation],['browser',state.operation]])
   if(reference)await inspectOperation(reference,name+'-submission');
  if(selection.keyOnlyCapture){const keyed=await openCapture(selection.keyOnlyCapture);need(keyed.form.formProperties.length===0&&keyed.form.formKey,'Retain the actual form-key-only response.');await sources(keyed,'form-key-only');await screenshot('form-key-only');}
  await openCapture(selection.capture);await page.setViewportSize({width:390,height:844});await screenshot('typed-form-phone');
  for(const [name,reference]of [['browser',state.operation],['rejected',selection.rejectedOperation],['stale',selection.staleOperation]])if(reference){await openOperation(reference.id);await screenshot(name+'-phone');}
  await page.setViewportSize({width:1440,height:1000});await healthy();
  need(!errors.length&&!routeErrors.length,'Actual native form browser errors: '+errors.concat(routeErrors).join('\n'));
  const result={schema:state.schema,state:'OPERATED',mode,inputSha256:selection.inputSha256,operation:state.operation,files:await inventory(directory)};
  await persist();return result;
 }finally{
  if(handler)await page.unroute('**/api/action',handler);
  page.off('pageerror',onError);await tail;
 }
}
