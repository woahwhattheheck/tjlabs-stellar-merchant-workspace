// MIT. Complete browser receiving on the original commissioned workspace.
import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {join,basename,resolve,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {privateDirectory,readOwned,atomicJSON,acquireWorkspaceLease} from '../../../stellar-expert/store.mjs';

const SCHEMA='stellar-forge.datacove-browser-receiving.v1';
const STAM='0e414f3441a8773619f242c797fe75e9af3fc04d';
const SECTION={sources:'Sources',mapping:'Mapping and target',plans:'Plan review',jobs:'Native operation',receiving:'Receiving and history'};
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(value);
const fail=(code,message)=>Object.assign(new Error(message),{code});
const digest=value=>createHash('sha256').update(value).digest('hex');
const exists=async path=>{try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
function need(ok,code,message){if(!ok)throw fail(code,message);}
function regexp(value){return new RegExp(String(value).replace(/[.*+?^{}$()|[\]\\]/g,'\\$&'));}
function safeName(value){return basename(String(value)).replace(/[^A-Za-z0-9_.-]+/g,'_').slice(0,140)||'retained-file';}

async function fileIdentity(path){
 const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const before=await handle.stat({bigint:true});
  need(before.isFile(),'BROWSER_FILE','The receiving output must be a regular file.');
  const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let bytes=0;
  for(;;){const read=await handle.read(buffer,0,buffer.length,null);if(!read.bytesRead)break;bytes+=read.bytesRead;hash.update(buffer.subarray(0,read.bytesRead));}
  const after=await handle.stat({bigint:true});
  need(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs&&BigInt(bytes)===before.size,
   'BROWSER_FILE_CHANGED','A receiving output changed during its complete read.');
  return {bytes,sha256:hash.digest('hex')};
 }finally{await handle.close();}
}
function fileReferences(value){
 const found=new Map(),seen=new Set();
 function walk(item,depth){
  if(!item||typeof item!=='object'||depth>12||seen.has(item))return;seen.add(item);
  if(typeof item.sha256==='string'&&/^[a-f0-9]{64}$/.test(item.sha256)&&Number.isSafeInteger(item.bytes)&&item.bytes>=0){
   const id=typeof item.fileId==='string'?item.fileId:item.sha256;
   if(!found.has(id))found.set(id,{id,sha256:item.sha256,bytes:item.bytes});
  }
  if(Array.isArray(item))for(const child of item)walk(child,depth+1);
  else for(const [key,child] of Object.entries(item))if(!['bodyText','sourceJson','configuration'].includes(key))walk(child,depth+1);
 }walk(value,0);return [...found.values()];
}

/**
 * Called after the original native programme retains its complete handoff.
 * The parent owns the server, workspace, jobs, source manifest and lifetime.
 * This phase changes its own browser state and reads the selected application.
 */
export async function receiveBrowser({origin,workspaceId,accessUrl,projectId,primaryJobId,verificationJobId,operationDirectory,browserExecutable,playwrightModule}={}){
 for(const [name,value] of Object.entries({workspaceId,projectId,primaryJobId,verificationJobId}))
  need(identifier(value),'BROWSER_INPUT','Select the original '+name+'.');
 for(const [name,value] of Object.entries({operationDirectory,browserExecutable,playwrightModule}))
  need(typeof value==='string'&&isAbsolute(value),'BROWSER_PATH','Select the absolute original '+name+'.');
 const address=new URL(accessUrl),base=new URL(origin);
 need(['http:','https:'].includes(base.protocol)&&base.origin===origin&&!base.username&&!base.password&&address.origin===origin&&!address.username&&!address.password&&!address.search,
  'BROWSER_ORIGIN','The private access link must belong to the original server origin.');
 const token=address.hash.slice(1);
 need(/^[A-Za-z0-9_-]{32,200}$/.test(token),'BROWSER_SESSION','Use the current original server session.');
 const access=new URL('/commissioning/',origin);access.hash=token;
 const moduleIdentity=await fileIdentity(fileURLToPath(import.meta.url));
 const root=await privateDirectory(resolve(operationDirectory),{create:true}),lease=await acquireWorkspaceLease(root);
 const redact=value=>String(value??'').split(access.href).join('/commissioning/').split(token).join('[private session]');
 const binding={schema:SCHEMA,workspaceId,projectId,primaryJobId,verificationJobId,module:moduleIdentity};
 let browser=null,contexts=[],attempt=null,result=null,failure=null,ownedBinding=false,completeReceiptObserved=false;
 const events=[],errors=[],artifacts=[],stages=[];
 async function keepState(stage,extra={}){
  await atomicJSON(join(root,'state.json'),{schema:SCHEMA,binding,attempt,stage,updatedAt:new Date().toISOString(),completed:false,...extra});
 }
 async function api(path){
  need(path.startsWith('/api/commissioning/'),'BROWSER_API','Use the original commissioning API.');
  const response=await fetch(new URL(path,origin),{method:'GET',headers:{Authorization:'Bearer '+token,'X-SensorThings-Workspace':workspaceId},redirect:'error',signal:AbortSignal.timeout(45000)});
  need(response.ok,'BROWSER_API','The original '+path.split('?')[0]+' returned HTTP'+response.status+'.');
  return response.json();
 }
 async function stage(name,run){
  await keepState(name);
  const value=await run();stages.push({name,completedAt:new Date().toISOString(),result:value});
  await keepState(name+' complete',{stages});return value;
 }
 function panel(page,title){return page.getByRole('heading',{name:title,exact:true}).locator('xpath=..');}
 function detail(container,title){
  const exact=new RegExp('^'+String(title).replace(/[.*+?^{}$()|[\]\\]/g,'\\$&')+'$');
  return container.locator('details').filter({has:container.page().locator('summary').filter({hasText:exact})});
 }
 async function documentJSON(container,title){const node=detail(container,title);await node.waitFor({state:'visible'});return JSON.parse(await node.locator('pre').textContent());}
 async function ready(page){
  await page.locator('#navigation button[data-tab="sources"]').waitFor({state:'visible'});
  await page.waitForFunction(id=>document.querySelector('#identity')?.textContent.includes('Workspace '+id+' · revision '),workspaceId);
  need(new URL(page.url()).hash==='','BROWSER_SESSION_URL','The operator did not remove the private session fragment.');
 }
 async function section(page,key){
  await page.locator('#navigation button[data-tab="'+key+'"]').click();
  await page.getByRole('heading',{name:SECTION[key],exact:true,level:1}).waitFor({state:'visible'});
 }
 async function selectedRow(page,title,id,action){
  need(identifier(id),'BROWSER_RECORD','Select the original '+title+' record.');
  const row=panel(page,title).locator('tbody tr').filter({hasText:regexp(id)});
  need(await row.count()===1,'BROWSER_RECORD','The '+title+' view does not contain one selected original record.');
  await row.getByRole('button',{name:action,exact:true}).click();
 }
 async function selectProject(page){
  await page.getByLabel('Commissioning project',{exact:true}).selectOption(projectId);
  await page.getByRole('heading',{name:'Project sources',exact:true}).waitFor({state:'visible'});
  need(await page.getByLabel('Commissioning project',{exact:true}).inputValue()===projectId,'BROWSER_PROJECT','The selected project changed.');
 }
 async function closeDialog(page){
  if(await page.locator('#record-dialog').isVisible())await page.locator('#record-close').click();
  await page.locator('#record-dialog').waitFor({state:'hidden'});
 }
 async function screenshot(page,name){
  const path=join(root,attempt,name+'.png');
  await page.screenshot({path,fullPage:false,animations:'disabled'});
  const identity=await fileIdentity(path);artifacts.push({kind:'screenshot',path:attempt+'/'+name+'.png',...identity});
 }
 async function noPageError(page){
  const visible=await page.locator('#notice .error, #main .error, .commissioning-map-notice .error').allTextContents();
  need(!visible.length,'BROWSER_OPERATOR',redact(visible.join(' | ')));
  need(!errors.length,'BROWSER_RUNTIME',redact(errors[0]?.message??'The original browser reported an error.'));
 }
 async function trackContext(options){
  const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block',...options});contexts.push(context);
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(['http:','https:'].includes(url.protocol)&&url.origin!==origin){
    errors.push({kind:'unexpected-origin',message:'The private operator requested another origin: '+url.origin,url:url.pathname});
    await route.abort('blockedbyclient');return;
   }
   await route.continue();
  });
  context.on('page',page=>{
   page.on('pageerror',error=>errors.push({kind:'pageerror',message:redact(error.message)}));
   page.on('response',response=>{
    const url=new URL(response.url());
    if(url.origin===origin&&/^\/(?:api|commissioning|desk)\//.test(url.pathname)){
     events.push({method:response.request().method(),path:url.pathname,status:response.status()});
     if(response.status()>=400)errors.push({kind:'http',message:url.pathname+' returned HTTP'+response.status()});
    }
   });
  });
  return context;
 }
 async function waitJSON(page,path,act){
  const pending=page.waitForResponse(response=>{
   const url=new URL(response.url());return url.origin===origin&&url.pathname===path&&response.request().method()==='GET'&&response.status()===200;
  },{timeout:45000});
  const [response]=await Promise.all([pending,act()]);return response.json();
 }
 async function completePages(page,host,path,first,rowsKey,{nextName='Next',rowInspect=null,columns=null}={}){
  let current=first,total=first.total,observed=0,pages=0;const keys=[];
  need(Number.isSafeInteger(total)&&total>=0,'BROWSER_PAGE_TOTAL','The original page has no complete row total.');
  for(;;){
   const rows=current[rowsKey]??[];
   need(current.offset===observed&&current.total===total&&Array.isArray(rows),'BROWSER_PAGE_IDENTITY','The selected original page lost its offset or total.');
   const table=host.locator('table').first(),actual=await table.locator('tbody tr').evaluateAll(trs=>trs.map(tr=>[...tr.cells].map(cell=>cell.textContent)));
   need(actual.length===rows.length,'BROWSER_PAGE_ROWS','The operator did not display every row of the selected page.');
   if(columns)for(let i=0;i<rows.length;i++)columns(rows[i],actual[i]);
   keys.push(...rows.map(row=>row.viewId??row.stepId??row.sourceKey??digest(JSON.stringify(row))));observed+=rows.length;pages++;
   if(rowInspect&&pages===1&&rows.length)await rowInspect(rows[0],table);
   if(current.nextOffset===null||current.nextOffset===undefined)break;
   need(current.nextOffset===observed&&observed<total&&rows.length>0,'BROWSER_PAGE_CONTINUATION','The original page has a non-advancing continuation.');
   current=await waitJSON(page,path,()=>host.getByRole('button',{name:nextName,exact:true}).click());
   await host.locator('table tbody tr').first().waitFor({state:'visible'});
  }
  need(observed===total,'BROWSER_PAGE_TRUNCATED','The operator stopped before the complete retained row total.');
  return {total:observed,pages,orderedIdentitySha256:digest(JSON.stringify(keys))};
 }
 async function download(page,control,fileId,name){
  const metadata=await api('/api/commissioning/files/'+encodeURIComponent(fileId)+'?metadata=1');
  need(metadata.id===fileId&&Number.isSafeInteger(metadata.bytes)&&metadata.bytes>=0&&/^[a-f0-9]{64}$/.test(metadata.sha256),'BROWSER_DOWNLOAD_IDENTITY','The selected complete file has no retained identity.');
  need(metadata.bytes<=128*1024*1024,'BROWSER_DOWNLOAD_RECEIVER','This source requires the installed receiver for files above the browser buffer limit.');
  const pending=page.waitForEvent('download',{timeout:120000}),[saved]=await Promise.all([pending,control.click()]);
  const filename=name+'-'+safeName(saved.suggestedFilename()),path=join(root,attempt,filename);
  await saved.saveAs(path);
  const ended=await saved.failure();need(!ended,'BROWSER_DOWNLOAD',redact(ended));
  const identity=await fileIdentity(path);
  need(identity.bytes===metadata.bytes&&identity.sha256===metadata.sha256,'BROWSER_DOWNLOAD_CHANGED','The complete browser download differs from its retained file.');
  artifacts.push({kind:'download',path:attempt+'/'+filename,fileId,...identity});
  await page.locator('#record-dialog').waitFor({state:'visible'});
  const receipt=await documentJSON(page.locator('#record-body'),'Downloaded complete file');
  need(receipt.id===fileId&&receipt.sha256===identity.sha256&&receipt.bytes===identity.bytes&&receipt.saved===true,'BROWSER_DOWNLOAD_RECEIPT','The original UI receipt names another file.');
  await closeDialog(page);return {fileId,name:metadata.name,...identity};
 }
 try{
  const bindingPath=join(root,'binding.json');
  if(await exists(bindingPath))need(JSON.stringify(JSON.parse((await readOwned(bindingPath,65536)).toString()))===JSON.stringify(binding),'BROWSER_BINDING','The original browser phase has another source or project binding.');
  else await atomicJSON(bindingPath,binding);
  ownedBinding=true;
  const project=await api('/api/commissioning/projects/'+encodeURIComponent(projectId));
  need(project.project?.id===projectId,'BROWSER_PROJECT','The server returned another project.');
  const primary=await api('/api/commissioning/jobs/'+encodeURIComponent(primaryJobId)+'?offset=0&limit=100'),
   verification=await api('/api/commissioning/jobs/'+encodeURIComponent(verificationJobId)+'?offset=0&limit=100'),
   map=await api('/api/commissioning/map/'+encodeURIComponent(primaryJobId)+'/manifest');
  need(primary.id===primaryJobId&&primary.projectId===projectId&&primary.state==='COMPLETE'&&primary.latest?.closed===true,'BROWSER_NATIVE','Receive the original complete, closed commissioning job.');
  need(verification.id===verificationJobId&&verification.projectId===projectId&&verification.state==='COMPLETE'&&verification.latest?.closed===true,'BROWSER_VERIFICATION','Receive the complete final target verification.');
  need(map.jobId===primaryJobId&&map.stamSource===STAM&&/^[a-f0-9]{64}$/.test(map.snapshotSha256),'BROWSER_MAP','The selected original STAM snapshot is missing.');
  const selectionPath=join(root,'selection.json');
  let selection;
  if(await exists(selectionPath)){
   const retained=JSON.parse((await readOwned(selectionPath,65536)).toString());
   need(JSON.stringify(retained.binding)===JSON.stringify(binding),'BROWSER_SELECTION','The original selection belongs to another browser source.');
   selection=retained.selection;
  }else{
   const source=(project.sources??[]).find(x=>x.id===primary.sourceId)??project.sources?.[0],
    plan=(project.plans??[]).find(x=>x.id===primary.planId),mapping=(project.mappings??[]).find(x=>x.id===plan?.mappingId),
    handoff=[...(project.handoffs??[])].reverse().find(x=>x.fileId&&x.direction==='export');
   need(source?.id&&plan?.id&&mapping?.id,'BROWSER_SOURCE','Retain the original source, mapping and native plan before browser receiving.');
   need(handoff?.fileId&&identifier(handoff.id),'BROWSER_HANDOFF_ORDER','Run this browser phase after the original complete-handoff phase.');
   selection={sourceId:source.id,mappingId:mapping.id,planId:plan.id,snapshotSha256:map.snapshotSha256,handoffId:handoff.id,handoffFileId:handoff.fileId};
   await atomicJSON(selectionPath,{binding,selection});
  }
  const source=(project.sources??[]).find(x=>x.id===selection.sourceId),mapping=(project.mappings??[]).find(x=>x.id===selection.mappingId),
   plan=(project.plans??[]).find(x=>x.id===selection.planId),selectedHandoff=(project.handoffs??[]).find(x=>x.id===selection.handoffId);
  need(source&&mapping&&plan&&mapping.sourceId===source.id&&plan.mappingId===mapping.id&&primary.planId===plan.id,
   'BROWSER_SELECTION','The original source, mapping and native plan are no longer present together.');
  need(selectedHandoff?.direction==='export'&&selectedHandoff.fileId===selection.handoffFileId,'BROWSER_HANDOFF_IDENTITY','The first selected complete handoff is no longer present in original history.');
  const priorPath=join(root,'result.json');
  if(await exists(priorPath)){
   const prior=JSON.parse((await readOwned(priorPath,8*1024*1024)).toString());
   completeReceiptObserved=prior.completed===true;
   need(prior.completed===true&&prior.browserClosed===true&&JSON.stringify(prior.binding)===JSON.stringify(binding)&&JSON.stringify(prior.selection)===JSON.stringify(selection)&&Array.isArray(prior.artifacts),
    'BROWSER_RESULT_IDENTITY','The retained completed browser result has another identity.');
   for(const artifact of prior.artifacts){
    need(typeof artifact.path==='string'&&!artifact.path.startsWith('/')&&!artifact.path.split('/').some(x=>!x||x==='.'||x==='..'),'BROWSER_OUTPUT_PATH','The retained browser output path differs.');
    const actual=await fileIdentity(join(root,artifact.path));
    need(actual.bytes===artifact.bytes&&actual.sha256===artifact.sha256,'BROWSER_OUTPUT_CHANGED','The retained original browser output changed.');
   }
   // Later exports and target-read snapshots do not replace this completed receipt.
   return {...prior,reused:true};
  }
  need(map.snapshotSha256===selection.snapshotSha256,'BROWSER_SNAPSHOT_CHANGED','Continue the same selected target-read snapshot before starting another browser attempt.');
  attempt='attempt-'+randomUUID();await privateDirectory(join(root,attempt),{create:true});
  await keepState('opening original browser',{selection});
  const runtime=await import(pathToFileURL(playwrightModule).href),chromium=runtime.chromium??runtime.default?.chromium;
  need(chromium&&typeof chromium.launch==='function','BROWSER_RUNTIME','The selected original module does not expose Playwright Chromium.');
  browser=await chromium.launch({headless:true,executablePath:browserExecutable});
  const context=await trackContext({viewport:{width:1440,height:1000},deviceScaleFactor:1}),page=await context.newPage();
  page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(45000);
  await page.goto(access.href,{waitUntil:'domcontentloaded'});await ready(page);await selectProject(page);
  await stage('source and complete original rows',async()=>{
   const sourcePath='/api/commissioning/sources/'+encodeURIComponent(source.id)+'/rows';
   const first=await waitJSON(page,sourcePath,()=>selectedRow(page,'Project sources',source.id,'Inspect source'));
   const host=panel(page,'Source rows and graph');await host.locator('table tbody tr').first().waitFor({state:'visible'});
   const pages=await completePages(page,host,sourcePath,first,'rows',{rowInspect:async(row,table)=>{
    await table.getByRole('button',{name:'Inspect row',exact:true}).first().click();
    const shown=await documentJSON(page.locator('#record-body'),'Original source row');
    need(JSON.stringify(shown)===JSON.stringify(row),'BROWSER_SOURCE_ROW','The inspected original source row differs.');await closeDialog(page);
   }});
   const metadata=await api('/api/commissioning/sources/'+encodeURIComponent(source.id)),references=fileReferences(metadata).filter(x=>x.bytes>0&&x.bytes<=128*1024*1024);
   need(references.length>0,'BROWSER_SOURCE_FILE','The selected source has no complete downloadable original file.');
   const sourcePanel=panel(page,'Selected source'),file=references[0],row=sourcePanel.locator('tbody tr').filter({hasText:file.sha256});
   need(await row.count()===1,'BROWSER_SOURCE_FILE','The original source download is not uniquely displayed.');
   const original=await download(page,row.getByRole('button',{name:'Download',exact:true}),file.id,'source');
   await noPageError(page);await screenshot(page,'desktop-sources');return {sourceId:source.id,...pages,original};
  });
  await stage('mapping draft and authenticated reopen',async()=>{
   await section(page,'mapping');await selectedRow(page,'Mapping versions',mapping.id,'Load editable configuration');
   const field=page.getByLabel('Mapping label',{exact:true}),original=await field.inputValue(),draft=original+' — receiving draft';
   await field.fill(draft);await section(page,'sources');await section(page,'mapping');
   need(await field.inputValue()===draft,'BROWSER_DRAFT','The editable mapping draft was lost on navigation.');
   await page.reload({waitUntil:'domcontentloaded'});
   await page.getByLabel('Private session token',{exact:true}).fill(token);
   await page.getByRole('button',{name:'Open commissioning',exact:true}).click();await ready(page);
   need(await page.getByLabel('Commissioning project',{exact:true}).inputValue()===projectId,'BROWSER_REOPEN','The original project selection was lost on reopen.');
   need(await page.getByLabel('Mapping label',{exact:true}).inputValue()===draft,'BROWSER_REOPEN','The unsaved mapping draft was lost on authenticated reopen.');
   await page.getByLabel('Mapping label',{exact:true}).fill(original);
   await noPageError(page);await screenshot(page,'desktop-mapping');return {mappingId:mapping.id,navigationRetained:true,reopenRetained:true};
  });
  await stage('complete exact native plan',async()=>{
   await section(page,'plans');
   const path='/api/commissioning/plans/'+encodeURIComponent(plan.id),first=await waitJSON(page,path,()=>selectedRow(page,'Prepared plans',plan.id,'Select plan'));
   const host=panel(page,'Selected plan');await host.locator('table tbody tr').first().waitFor({state:'visible'});
   const pages=await completePages(page,host,path,first,'steps',{rowInspect:async(row,table)=>{
    await table.getByRole('button',{name:'Exact payload and relationships',exact:true}).first().click();
    const shown=await detail(page.locator('#record-body'),'Exact authored request body').locator('pre').textContent();
    need(shown===row.bodyText,'BROWSER_EXACT_PAYLOAD','The UI changed the exact authored native request body.');await closeDialog(page);
   },columns:(row,cells)=>need(cells[0]===row.stepId,'BROWSER_PLAN_STEP','The plan table displays another original step.')});
   await noPageError(page);await screenshot(page,'desktop-plan');return {planId:plan.id,...pages};
  });
  await stage('native history and original record download',async()=>{
   await section(page,'jobs');
   const path='/api/commissioning/jobs/'+encodeURIComponent(primaryJobId),first=await waitJSON(page,path,()=>selectedRow(page,'Native jobs',primaryJobId,'Select job'));
   const host=panel(page,'Selected native job');await host.locator('table tbody tr').first().waitFor({state:'visible'});
   const pages=await completePages(page,host,path,first,'steps',{rowInspect:async(row,table)=>{
    await table.getByRole('button',{name:'Request, response and provenance',exact:true}).first().click();
    const shown=await documentJSON(page.locator('#record-body'),'Original step and complete attempt history');
    need(JSON.stringify(shown)===JSON.stringify(row),'BROWSER_NATIVE_STEP','The original complete native attempt history differs.');
    const refs=fileReferences(row).filter(x=>x.bytes>0&&x.bytes<=128*1024*1024);
    need(refs.length>0,'BROWSER_NATIVE_FILE','The native step has no original response or request file.');
    const file=refs[0],fileRow=page.locator('#record-body tbody tr').filter({hasText:file.sha256});
    need(await fileRow.count()===1,'BROWSER_NATIVE_FILE','The original native file is not uniquely displayed.');
    await download(page,fileRow.getByRole('button',{name:'Download',exact:true}),file.id,'native-record');
   },columns:(row,cells)=>need(cells[0]===row.stepId,'BROWSER_NATIVE_STEP','The native table displays another original step.')});
   await noPageError(page);return {jobId:primaryJobId,...pages};
  });
  await stage('original STAM map and every typed observation',async()=>{
   await page.locator('#refresh').click();
   const mapRoot=page.locator('.commissioning-map');await mapRoot.getByRole('heading',{name:'Retained target map',exact:true}).waitFor({state:'visible'});
   need(map.bounds&&(map.counts.mappedThings||map.counts.mappedFeaturesOfInterest),'BROWSER_GEOGRAPHY','The completed reference has no retained original map geometry.');
   await page.getByRole('region',{name:'Retained native SensorThings map',exact:true}).waitFor({state:'visible'});
   await page.locator('.commissioning-map-view.leaflet-container .leaflet-control-zoom-in').waitFor({state:'visible'});
   need(await page.evaluate(()=>globalThis.L?.version)==='1.9.4','BROWSER_LEAFLET','The actual loaded Leaflet version differs.');
   const mapPath='/api/commissioning/map/'+encodeURIComponent(primaryJobId)+'/entities',
    first=await waitJSON(page,mapPath,()=>mapRoot.getByLabel('Retained entity kind',{exact:true}).selectOption('Observations'));
   const host=mapRoot.getByRole('heading',{name:'Complete retained target entities',exact:true}).locator('xpath=..');
   await host.locator('table tbody tr').first().waitFor({state:'visible'});
   const pages=await completePages(page,host,mapPath,first,'rows',{nextName:'Next entities',columns:(row,cells)=>{
    need(row.jobId===primaryJobId&&row.snapshotSha256===map.snapshotSha256&&row.kind==='Observations'&&cells[0]===row.kind&&cells[1]===row.idJson,
     'BROWSER_TYPED_ID','The map table changed the original typed native identity or snapshot.');
   },rowInspect:async(row,table)=>{
    await table.getByRole('button',{name:'Inspect native result',exact:true}).first().click();
    const shown=await documentJSON(page.locator('#record-body'),'Complete native entity, relationships and observation page');
    need(shown.jobId===primaryJobId&&shown.snapshotSha256===map.snapshotSha256,'BROWSER_MAP_DETAIL','The native detail belongs to another retained map snapshot.');
    const selection=await documentJSON(page.locator('#record-body'),'Original typed identity and map provenance');
    need(selection.idJson===row.idJson&&selection.viewId===row.viewId&&selection.kind===row.kind,'BROWSER_MAP_DETAIL','The original native ID was replaced by a display ID.');
    await closeDialog(page);
   }});
   need(pages.total===660,'BROWSER_OBSERVATION_POPULATION','The original reference map does not contain all660 commissioned observations.');
   await noPageError(page);await mapRoot.scrollIntoViewIfNeeded();await screenshot(page,'desktop-native-map');
   return {jobId:primaryJobId,stamSource:STAM,leafletVersion:'1.9.4',snapshotSha256:map.snapshotSha256,...pages};
  });
  await stage('complete package and retained project history',async()=>{
   await section(page,'receiving');
   const host=panel(page,'Project packages and receiving history'),rows=host.locator('tbody tr').filter({hasText:regexp(selectedHandoff.id)});
   need(await rows.count()===1,'BROWSER_HANDOFF','The original complete package row is not unique.');
   const downloaded=await download(page,rows.getByRole('button',{name:'Download complete package',exact:true}),selectedHandoff.fileId,'complete-project');
   const historyHost=panel(page,'Complete retained project history');
   await historyHost.locator('table tbody tr').first().waitFor({state:'visible'});
   const first=await api('/api/commissioning/projects/'+encodeURIComponent(projectId)+'/history?offset=0&limit=100');
   const history=await completePages(page,historyHost,'/api/commissioning/projects/'+encodeURIComponent(projectId)+'/history',first,'rows');
   await noPageError(page);await screenshot(page,'desktop-receiving');return {package:downloaded,history};
  });
  await stage('fresh mobile operator and keyboard navigation',async()=>{
   const mobileContext=await trackContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true}),mobile=await mobileContext.newPage();
   mobile.setDefaultTimeout(30000);
   await mobile.goto(access.href,{waitUntil:'domcontentloaded'});await ready(mobile);await selectProject(mobile);
   const keyboardContext=await trackContext({viewport:{width:1280,height:900}}),keyboard=await keyboardContext.newPage();
   keyboard.setDefaultTimeout(30000);await keyboard.goto(access.href,{waitUntil:'domcontentloaded'});await ready(keyboard);
   await keyboard.keyboard.press('Tab');
   need(await keyboard.locator('.skip').evaluate(node=>node===document.activeElement),'BROWSER_KEYBOARD','The keyboard skip link is not the first focusable control.');
   await keyboard.keyboard.press('Enter');
   need(await keyboard.locator('#main').evaluate(node=>node===document.activeElement),'BROWSER_KEYBOARD','The skip link did not move focus into commissioning.');
   for(const key of ['mapping','plans','jobs','receiving']){
    await section(mobile,key);
    const dimensions=await mobile.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
    need(dimensions.document<=dimensions.viewport+2,'BROWSER_MOBILE_LAYOUT','The '+SECTION[key]+' view overflows the mobile page.');
    await noPageError(mobile);
   }
   await selectedRow(mobile,'Project packages and receiving history',selectedHandoff.id,'Open record');
   await mobile.locator('#record-dialog').waitFor({state:'visible'});
   await closeDialog(mobile);await screenshot(mobile,'mobile-receiving');
   return {viewport:{width:390,height:844},freshWorkspace:true,keyboardSkip:true,sections:Object.values(SECTION)};
  });
  need(!errors.length,'BROWSER_RUNTIME',redact(errors[0]?.message));
  need(events.every(event=>event.method==='GET'||event.method==='HEAD'),'BROWSER_READ_PHASE','The browser receiving phase dispatched an unexpected application mutation.');
  result={schema:SCHEMA,binding,selection,completed:false,attempt,stages,artifacts,
   network:{responses:events.length,failed:errors.length,paths:[...new Set(events.map(event=>event.path))].sort()},
   actualBrowserVersion:browser.version(),finishedAt:new Date().toISOString()};
 }catch(error){failure=error;}
 finally{
  for(const context of contexts.reverse())try{await context.close();}catch(error){failure??=error;}
  if(browser)try{await browser.close();}catch(error){failure??=error;}
  try{
   if(failure&&ownedBinding){
    // A rejected binding never edits this operation. Preserve an earlier complete
    // receipt even when a later custody check discovers a missing artifact.
    if(!attempt){attempt='attempt-'+randomUUID();await privateDirectory(join(root,attempt),{create:true});}
    const failed={schema:SCHEMA,binding,completed:false,attempt,stages,artifacts,error:{code:failure.code??'BROWSER_RECEIVING',message:redact(failure.message)}};
    await atomicJSON(join(root,attempt,'failure.json'),failed);
    if(!completeReceiptObserved)await keepState('requires continuation',failed);
   }else if(result){
    result.completed=true;result.browserClosed=true;
    await atomicJSON(join(root,'result.json'),result);
    await atomicJSON(join(root,'state.json'),{schema:SCHEMA,binding,completed:true,attempt,stage:'complete',result:'result.json'});
   }
  }catch(error){failure??=error;}
  await lease.close();
 }
 if(failure)throw fail(failure.code??'BROWSER_RECEIVING',redact(failure.message));
 return result;
}
