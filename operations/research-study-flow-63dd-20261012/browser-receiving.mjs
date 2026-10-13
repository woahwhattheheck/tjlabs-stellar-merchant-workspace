// MIT. Same-store browser receiving for the completed original Study Flow operation.
import {readFile,writeFile,mkdir,rename,open,stat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const PREFIX='stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers';
const OP='STUDY-FLOW-ORIGINAL-RIS-63DD-20261012';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const sha=body=>createHash('sha256').update(body).digest('hex');
async function jsonFile(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function durable(path,value){
 await mkdir(dirname(path),{recursive:true});
 const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value,null,2)+'\n');
 const file=await open(path+'.writing','w',0o600);
 try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
 await rename(path+'.writing',path);
 need((await readFile(path)).equals(bytes),'Output readback changed: '+path);
}
export async function runStudyFlowBrowserReceiving({sourceRoot,operationDirectory,playwrightModule,chromiumExecutable,signal}){
 sourceRoot=resolve(sourceRoot);operationDirectory=resolve(operationDirectory);
 const baseline=await jsonFile(join(operationDirectory,'result.json'));
 need(baseline?.operationId===OP&&baseline.native?.revision===15,'Completed original native operation required');
 const out=join(operationDirectory,'browser-receiving'),journalPath=join(out,'operation.json');
 await mkdir(out,{recursive:true});
 let journal=await jsonFile(journalPath);
 if(!journal){journal={schema:'commons.study-flow-browser-receiving/v1',operationId:OP,
  dossierId:baseline.dossierId,originalRevision:baseline.native.revision,sourcePin:baseline.sourcePin,
  sourceRoot,startedAt:new Date().toISOString(),steps:{},requests:[],downloads:[],screenshots:[],browserErrors:[],httpErrors:[]};
  await durable(journalPath,journal);}
 need(journal.operationId===OP&&journal.dossierId===baseline.dossierId&&journal.sourceRoot===sourceRoot,'Original receiving binding changed');
 if(journal.complete)return journal;
 const checkpoint=async()=>{journal.updatedAt=new Date().toISOString();await durable(journalPath,journal);};
 let app,browser,context,page,aborted=false;
 const cancelled=()=>{if(aborted||signal?.aborted)throw Error('Original browser receiving cancelled; saved journal retained');};
 const abort=()=>{aborted=true;void context?.close().catch(()=>{});void browser?.close().catch(()=>{});};
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const phase=async(name,work)=>{cancelled();journal.phase=name;await checkpoint();
  console.log(JSON.stringify({operationId:OP,phase:name,state:'running'}));
  const value=await work();journal.steps[name]={complete:true,completedAt:new Date().toISOString(),value};await checkpoint();
  console.log(JSON.stringify({operationId:OP,phase:name,state:'complete'}));return value;};
 try{
  const {startDossierWorkspace}=await import(pathToFileURL(join(sourceRoot,PREFIX,'server.mjs')).href);
  app=await startDossierWorkspace({directory:join(operationDirectory,'dossiers'),port:0});
  const auth={Authorization:'Bearer '+app.token,'X-Research-Workspace-Id':app.workspaceId};
  const api=async path=>{const response=await fetch(app.origin+path,{headers:auth});const body=await response.json();
   need(response.ok,'Original HTTP '+response.status+': '+JSON.stringify(body));return body;};
  const endpoint='/api/dossiers/'+encodeURIComponent(baseline.dossierId);
  const overview=await api(endpoint+'/study-flow');
  need(overview.dossier.revision===baseline.native.revision,'Receiving must preserve original dossier revision');
  journal.workspaceId=app.workspaceId;journal.instanceId=app.instanceId;await checkpoint();
  const {receiveStudyFlowMcp}=await import('./mcp-receiving.mjs');
  await phase('same-dossier-mcp-receiving',()=>receiveStudyFlowMcp({app,sourceRoot,operationDirectory,baseline,signal}));
  const {chromium}=await import(pathToFileURL(resolve(playwrightModule)).href);
  console.log(JSON.stringify({operationId:OP,phase:'browser-starting',pid:process.pid,workspaceId:app.workspaceId}));
  browser=await chromium.launch({executablePath:resolve(chromiumExecutable),headless:true,
   args:['--disable-dev-shm-usage','--no-sandbox']});
  context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>journal.browserErrors.push({at:new Date().toISOString(),message:error.message}));
  page.on('response',response=>{if(response.status()>=400)journal.httpErrors.push({at:new Date().toISOString(),status:response.status(),url:new URL(response.url()).pathname});});
  page.on('request',request=>{if(request.method()!=='GET'){const u=new URL(request.url());
   journal.requests.push({at:new Date().toISOString(),method:request.method(),path:u.pathname+u.search,body:request.postData()});}});
  const target=new URL(app.url);const hash=new URLSearchParams(target.hash.slice(1));
  hash.set('dossier',baseline.dossierId);hash.set('view','study-flow');target.hash=hash.toString();
  const root=page.locator('#view-study-flow');
  const idle=async()=>{await page.waitForFunction(id=>{const e=document.querySelector('#view-study-flow');
   return e?.dataset.dossierId===id&&e.dataset.sfBusy==='false'&&e.querySelector('[data-sf="nav-history"]');},baseline.dossierId);};
  const click=async key=>{await root.locator('[data-sf="'+key+'"]').click();await idle();};
  const selected=async id=>page.waitForFunction(id=>{const e=document.querySelector('#view-study-flow');return e?.dataset.editionId===id&&e.dataset.sfBusy==='false'&&e.dataset.reportCurrent==='true';},id);
  const selectEdition=async id=>{
   await click('nav-history');
   const index=overview.editions.findIndex(row=>row.id===id);need(index>=0,'Original edition missing');
   await root.locator('.sf-content table').first().locator('tbody tr').nth(index).getByRole('button',{name:'Inspect',exact:true}).click();
   await selected(id);
  };
  const screenshot=async name=>{const path=join(out,name+'.png');await page.screenshot({path,fullPage:true});
   const body=await readFile(path);const entry={path,bytes:body.length,sha256:sha(body)};journal.screenshots=journal.screenshots.filter(v=>v.path!==path).concat(entry);return entry;};
  const download=async(label,{expected,recordName}={})=>{
   const event=page.waitForEvent('download');await root.getByRole('button',{name:label,exact:true}).click();
   const item=await event;need(!await item.failure(),'Original browser download failed');
   const filename=item.suggestedFilename();need(filename&&!/[\\/\x00-\x1f]/.test(filename),'Invalid download name');
   const directory=join(out,'downloads',recordName??rootName),path=join(directory,filename);await mkdir(directory,{recursive:true});
   await item.saveAs(path);const body=await readFile(path);const entry={path,filename,bytes:body.length,sha256:sha(body)};
   if(expected)need(entry.bytes===expected.bytes&&entry.sha256===expected.sha256,'Browser bytes differ from accepted native export: '+filename);
   journal.downloads=journal.downloads.filter(v=>v.path!==path).concat(entry);await idle();return entry;
  };
  let rootName='original';
  await phase('open-same-dossier',async()=>{await page.goto(target.href,{waitUntil:'domcontentloaded'});await idle();
   need(await root.getAttribute('data-revision')===String(baseline.native.revision),'Wrong original browser revision');
   return {dossierId:baseline.dossierId,revision:baseline.native.revision,workspaceId:app.workspaceId};});
  const views=['diagram','sources','records','reports','counts','previous','history','definition'];
  for(const [label,editionId]of [['reviewed-metadata',baseline.native.secondEditionId],['reviewed-update',baseline.native.updateEditionId]]){
   rootName=label;
   await phase('inspect-'+label,async()=>{await selectEdition(editionId);const captured=[];
    for(const view of views){await click('nav-'+view);const content=await root.locator('.sf-content').innerText();
     need(content.length>0,'Empty original '+view+' view');captured.push({view,text:content});
     if(view==='diagram')need(await root.locator('.sf-diagram svg').count()===1,'Original diagram missing');
     if(view==='records'){const recordButton=root.locator('.sf-content table tbody tr').first().locator('button').first();
      await recordButton.click();await idle();need(await root.getByRole('button',{name:'Download the original source edition',exact:true}).count()===1,'Original record/source detail missing');}
    }
    await durable(join(out,label+'-views.json'),captured);
    await click('nav-diagram');const shot=await screenshot(label);
    return {editionId,views:captured.map(v=>v.view),screenshot:shot};});
   await phase('downloads-'+label,async()=>{await selectEdition(editionId);await click('nav-history');
    await root.getByRole('button',{name:'Load saved operation history',exact:true}).click();await idle();
    const downloads=[];
    for(const [button,suffix]of [['Download JSON','.json'],['Download SVG','.svg'],['Download HTML','.html'],
      ['counts CSV','-counts.csv'],['records CSV','-records.csv'],['reports CSV','-reports.csv']]){
     const expected=baseline.native.files.find(v=>v.filename==='study-flow-'+editionId+suffix);
     need(expected,'Accepted native export missing');downloads.push(await download(button,{expected,recordName:label}));
    }
    const requests=root.getByRole('button',{name:'Download exact request',exact:true});
    need(await requests.count()>0,'Original request history missing');
    const event=page.waitForEvent('download');await requests.first().click();const item=await event;
    const path=join(out,'downloads',label,item.suggestedFilename());await item.saveAs(path);
    const request=JSON.parse(await readFile(path,'utf8'));need(request.requestId&&request.action,'Original saved request incomplete');
    return {editionId,downloads,historyRequest:{path,requestId:request.requestId}};});
  }
  await phase('retained-local-review-reason',async()=>{
   await selectEdition(baseline.native.updateEditionId);
   const reason='Browser receiving: the two original bibliographic records, partial search coverage, automated screening and unestablished study/full-text counts remain explicit.';
   await root.locator('[data-sf="reason"]').fill(reason);
   await page.waitForFunction(async({workspaceId,dossierId,reason})=>{
    const module=await import('/study-extraction-drafts.js'),storage=module.openStudyExtractionDrafts();
    try{return (await storage.get({workspaceId,dossierId},'study-flow/draft'))?.reason===reason;}finally{storage.close();}
   },{workspaceId:app.workspaceId,dossierId:baseline.dossierId,reason});
   await page.reload({waitUntil:'domcontentloaded'});await idle();await selected(baseline.native.updateEditionId);
   need(await root.locator('[data-sf="reason"]').inputValue()===reason,'Original local reason lost on reload');
   await click('refresh');await selected(baseline.native.updateEditionId);
   need(await root.locator('[data-sf="reason"]').inputValue()===reason,'Original local reason lost on refresh');
   await click('nav-history');const shot=await screenshot('history-and-retained-review-draft');
   return {editionId:baseline.native.updateEditionId,reason,reloadPreserved:true,currentRefreshPreserved:true,screenshot:shot};
  });
  const after=await api(endpoint+'/study-flow');
  need(after.dossier.revision===baseline.native.revision,'Read-only receiving changed dossier history');
  need(journal.requests.length===0,'Unexpected browser mutation in receiving');
  need(journal.browserErrors.length===0,'Browser errors retained in receiving journal');
  need(journal.httpErrors.length===0,'HTTP errors retained in receiving journal');
  journal.finalRevision=after.dossier.revision;journal.complete=true;journal.completedAt=new Date().toISOString();
  journal.actualScope='Original same-dossier browser inspection of all eight views for both current saved flows, exact native download comparison, saved request history, and workspace-scoped local review draft/reload/refresh. No source acquisition, screen/review mutation, new flow, native replay or payment.';
  await checkpoint();await durable(join(out,'result.json'),journal);
  console.log(JSON.stringify({operationId:OP,phase:'browser-receiving-complete',revision:journal.finalRevision,downloads:journal.downloads.length,screenshots:journal.screenshots.length}));
  return journal;
 }catch(error){journal.error={at:new Date().toISOString(),message:error.message,phase:journal.phase};await checkpoint().catch(()=>{});throw error;}
 finally{signal?.removeEventListener('abort',abort);await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await app?.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
 const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
 runStudyFlowBrowserReceiving({sourceRoot:args['source-root'],operationDirectory:args.out,
  playwrightModule:args['playwright-module'],chromiumExecutable:args.chromium,signal:controller.signal})
 .catch(error=>{console.error(JSON.stringify({error:error.message,stack:error.stack}));process.exitCode=1;});
}
