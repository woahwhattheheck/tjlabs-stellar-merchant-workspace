// MIT. Complete native delivery → offline recipient → original reconciliation.
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const args={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i+1])throw Error('Use paired receiving options.');args[process.argv[i]]=process.argv[i+1];}
const required=k=>{if(!args[k])throw Error(k+' is required.');return args[k];};
const application=resolve(required('--application')),workspace=resolve(required('--workspace')),workspaceId=required('--workspace-id'),root=resolve(required('--out'));
const operation='OPENFEMA-COMPLETE-RECIPIENT-WORKSPACE-22B7-20261013',hash=b=>createHash('sha256').update(b).digest('hex'),must=(v,m)=>{if(!v)throw Error(m);};
await mkdir(root,{recursive:true,mode:0o700});
const source=[];for(const path of ['core.mjs','delivery.mjs','recipient-core.mjs','recipient.mjs']){const b=await readFile(join(application,path));source.push({path,bytes:b.length,sha256:hash(b)});}
const outputPath=join(root,'recipient-result.json'),planPath=join(root,'original-recipient-plan.json');
try{const prior=JSON.parse(await readFile(outputPath,'utf8'));must(prior.operation===operation&&prior.workspaceId===workspaceId&&JSON.stringify(prior.source)===JSON.stringify(source),'The completed receiving output belongs to another source or workspace.');if(prior.status==='COMPLETE'){for(const f of prior.files){const b=await readFile(f.path);must(b.length===f.bytes&&hash(b)===f.sha256,'A complete original receiving file changed: '+f.name);}console.log(JSON.stringify(prior));process.exit(0);}}catch(e){if(e.code!=='ENOENT')throw e;}
let plan;try{plan=JSON.parse(await readFile(planPath,'utf8'));must(plan.operation===operation&&plan.workspaceId===workspaceId&&plan.workspace===workspace&&JSON.stringify(plan.source)===JSON.stringify(source),'Resume the same recipient source, workspace and original requests.');}catch(e){if(e.code!=='ENOENT')throw e;plan={operation,workspaceId,workspace,source,createdAt:new Date().toISOString(),requests:{},selection:null};await writeFile(planPath,JSON.stringify(plan,null,2),{flag:'wx'});}
const savePlan=async()=>{const tmp=planPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(plan,null,2));await rename(tmp,planPath);};
const attempt=join(root,'attempts',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));await mkdir(attempt,{recursive:true,mode:0o700});
const result={schema:'stellar-forge.openfema-recipient-receiving.v1',operation,workspaceId,source,status:'RUNNING',startedAt:new Date().toISOString(),attempt,steps:[],files:[],screenshots:[]};
const record=async(name,value={})=>{result.steps.push({name,at:new Date().toISOString(),...value});await writeFile(join(attempt,'progress.json'),JSON.stringify(result,null,2));};
async function bind(path,kind){const b=await readFile(path),f={name:basename(path),path:resolve(path),kind,bytes:b.length,sha256:hash(b)};result.files.push(f);return f;}
async function retainedFile(name,body,kind){const path=join(attempt,name);await writeFile(path,body);await bind(path,kind);return path;}
const {openOpenFemaWorkspace}=await import(pathToFileURL(join(application,'core.mjs')));
const {readZip}=await import(pathToFileURL(join(application,'zip.mjs')));
const {createRecipientCore}=await import(pathToFileURL(join(application,'recipient-core.mjs')));
const C=createRecipientCore(),app=await openOpenFemaWorkspace({directory:workspace});
let context,closed=false;
async function action(name,action,payload){
  if(!plan.requests[name]){plan.requests[name]={operationId:operation+':'+name,action,payload,expectedRevision:(await app.view()).revision};await savePlan();}
  const original=plan.requests[name];must(original.action===action&&JSON.stringify(original.payload)===JSON.stringify(payload),'Keep the complete retained original '+name+' request.');
  const value=await app.action(original);must(value.view.workspaceId===workspaceId,'Native result changed the original workspace identity.');
  await retainedFile('native-'+name+'.json',JSON.stringify({request:original,outcome:value},null,2),'complete-native-outcome');return value.result;
}
async function download(page,action,name){
  const waiting=page.waitForEvent('download');await page.locator('[data-action="'+action+'"]').click();const item=await waiting,path=join(attempt,name);await item.saveAs(path);await bind(path,'complete-recipient-download');return path;
}
async function ready(page){await page.locator('h1').filter({hasText:'Recipient review'}).waitFor();await page.waitForFunction(()=>!document.querySelector('#workspace')?.inert);}
async function screenshot(page,name){const path=join(attempt,name);await page.screenshot({path,fullPage:true});result.screenshots.push(await bind(path,'actual-rendered-screen'));}
async function openBrowser(html,profile){
  const {chromium}=await import(pathToFileURL(resolve(required('--playwright'))));
  context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:resolve(required('--chromium')),viewport:{width:1440,height:1000},acceptDownloads:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=context.pages()[0]||await context.newPage();await page.goto(pathToFileURL(html).href);await ready(page);return page;
}
async function receiveIssued(record,label){
  const exported=await app.exported(record.export.id),path=await retainedFile(label+'.zip',exported.bytes,'complete-native-delivery'),members=readZip(exported.bytes);
  const requiredMembers=['projects-target.csv','delivery.json','mapping.json','mapping-review.json','portfolio.json','report.html','TARGET_SCHEMA.txt','START_HERE.txt','recipient.html','recipient-project.json','RECIPIENT_README.txt','recipient-availability.json'];
  for(const f of requiredMembers)must(members.has(f),'The complete native delivery lacks '+f);
  const availability=JSON.parse(members.get('recipient-availability.json').toString('utf8'));must(availability.state==='AVAILABLE'&&availability.deliveryId===record.id,'The original source was not received by its complete recipient workspace.');
  const manifest=JSON.parse(members.get('delivery.json').toString('utf8')),envelope=JSON.parse(members.get('recipient-project.json').toString('utf8')),project=C.importProject(envelope.project);
  must(project.deliveryId===record.id&&project.issued.manifestText===members.get('delivery.json').toString('utf8')&&project.issued.targetCsv===members.get('projects-target.csv').toString('utf8'),'The recipient lost or rewrote complete issued original files.');
  if(members.has('customer-original.csv'))must(project.issued.originalCustomer?.content===members.get('customer-original.csv').toString('utf8'),'The full original customer CSV changed.');
  const html=await retainedFile(label+'-recipient.html',members.get('recipient.html'),'complete-standalone-workspace');
  await retainedFile(label+'-issued-project.json',members.get('recipient-project.json'),'complete-original-recipient');
  await retainedFile(label+'-manifest.json',members.get('delivery.json'),'complete-issued-manifest');
  return {record,path,members,manifest,envelope,project,html};
}
try{
  const view=await app.view();must(view.workspaceId===workspaceId,'Receive the unchanged original workspace identity.');
  if(!plan.selection){
    const selected=view.versions.find(v=>v.id===view.selectedVersionId);must(selected,'Select the complete original portfolio.');
    const rows=await app.rows(selected.id,{table:'projects',offset:0,limit:100});must(rows.total===195,'This receiving course operates the original complete 195-project portfolio.');
    const previous=[...view.projectDeliveries].reverse().find(d=>d.portfolioId===selected.portfolioId);
    must(previous,'Retain the original reviewed customer mapping from the completed merchant exchange.');
    const base=[...view.deliveryReconciliations].reverse().find(r=>r.mappingId===previous.mappingId&&r.mappingSha256===previous.mappingSha256);
    plan.selection={versionId:selected.id,mappingId:previous.mappingId,customerReconciliationId:base?.id??null};await savePlan();
  }
  const selection=plan.selection,issuedRecord=await action('issue','delivery.export',selection),issued=await receiveIssued(issuedRecord,'01-issued');
  await record('complete_native_issue',{deliveryId:issuedRecord.id,rows:issued.manifest.rows.length,originalCustomerBytes:issued.project.issued.originalCustomer?Buffer.byteLength(issued.project.issued.originalCustomer.content):0});
  const profile=join(attempt,'profile');let page=await openBrowser(issued.html,profile);
  const first=issued.manifest.rows[0],columns=issued.manifest.mapping.columns,note=columns.find(c=>c.source==='review.note'),owner=columns.find(c=>c.source==='review.owner'),status=columns.find(c=>c.source==='review.status');
  must(note&&owner&&status,'The original reviewed mapping must include note, owner and status for this complete review course.');
  await page.locator('#reviewer').fill('Receiving programme analyst');
  await page.locator('#review-note').fill('Complete issued recipient review through the original native mapping.');
  await page.locator('[data-cell="'+note.column+'"]').fill('Recipient reviewed the original project scope and retained the published funding values.');
  await page.locator('[data-cell="'+owner.column+'"]').fill('Receiving programme analyst');
  await page.locator('[data-cell="'+status.column+'"]').selectOption('reviewed');
  await page.locator('[data-action="apply"]').click();await ready(page);
  await page.locator('#edition-name').fill('Reviewed programme edition');
  await page.locator('[data-action="edition"]').click();await ready(page);
  const approvedPath=await download(page,'json','02-reviewed-complete-project.json'),approvedEnvelope=JSON.parse(await readFile(approvedPath,'utf8')),approved=C.importProject(approvedEnvelope.project);
  must(C.summary(approved).changedRows===1&&approved.editions.length===1,'The complete reviewed edition did not retain the one selected project.');
  await screenshot(page,'03-reviewed-desktop.png');
  // Unfinished preparation remains in the complete file and survives a cold browser reopen.
  await page.locator('[data-cell="'+note.column+'"]').fill('Unfinished recipient note\nwith the full original second line');
  const preparedPath=await download(page,'json','04-unfinished-complete-project.json'),prepared=JSON.parse(await readFile(preparedPath,'utf8'));
  must(prepared.preparation.drafts[first.key][note.column].includes('second line'),'Full raw preparation was lost from the complete working file.');
  await context.close();context=null;page=await openBrowser(issued.html,profile);
  const offered=page.locator('[data-action="saved"]');if(await offered.count()){await offered.click();await ready(page);}
  must((await page.locator('[data-cell="'+note.column+'"]').inputValue()).includes('second line'),'Cold browser reopen lost unfinished row preparation.');
  await record('complete_raw_preparation_and_cold_reopen',{projectId:approved.id,revision:approved.revision});
  // Import the complete reviewed edition separately, then exercise returned CSV and portable HTML.
  await page.locator('#open-project').setInputFiles(approvedPath);await page.locator('[data-action="import"]').click();await ready(page);
  const returnedPath=await download(page,'csv','05-recipient-return.csv'),returned=await readFile(returnedPath,'utf8');
  must(returned===C.returnedCsv(approved),'The browser return differs from the complete model edition.');
  const standalonePath=await download(page,'html','06-complete-recipient-workspace.html');
  await context.close();context=null;page=await openBrowser(standalonePath,join(attempt,'portable-profile'));
  const reopenedPath=await download(page,'json','07-portable-reopened-project.json'),reopened=JSON.parse(await readFile(reopenedPath,'utf8'));
  must(C.exportProject(C.importProject(reopened.project))===C.exportProject(approved),'Standalone HTML reopen changed the full reviewed project.');
  // Empty search and actual invalid-receive error remain useful visible states.
  await page.locator('#search').fill('UNMATCHED-ORIGINAL-RECEIVING-SEARCH');await page.locator('[data-action="filter"]').click();await ready(page);must(await page.getByText('No rows match the current selection.').isVisible(),'The empty register state did not render.');await screenshot(page,'08-empty-search.png');
  await page.locator('#search').fill('');await page.locator('[data-action="filter"]').click();await ready(page);
  const bad=await retainedFile('invalid-recipient-input.json','{"schema":"wrong"}','deliberate-invalid-input');await page.locator('#open-project').setInputFiles(bad);await page.locator('[data-action="import"]').click();await page.locator('#error').filter({hasText:'complete OpenFEMA recipient'}).waitFor();await screenshot(page,'09-retained-input-error.png');
  const afterError=await download(page,'json','10-after-receive-error.json');must(C.exportProject(C.importProject(JSON.parse(await readFile(afterError,'utf8')).project))===C.exportProject(approved),'Invalid import replaced the current complete project.');
  await page.setViewportSize({width:390,height:844});await screenshot(page,'11-narrow-recipient.png');const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));must(layout.scroll<=layout.width+1,'The narrow workspace has page-level overflow: '+JSON.stringify(layout));
  await page.setViewportSize({width:1440,height:1000});
  // Each issued original is a real complete file download; inspect every byte.
  const originals=C.originals(approved);await page.locator('details').filter({has:page.locator('.original-files')}).evaluate(n=>n.open=true);
  for(let i=0;i<originals.length;i++){const next=page.waitForEvent('download');await page.locator('[data-action="original"][data-index="'+i+'"]').click();const item=await next,path=join(attempt,'original-'+i+'-'+basename(originals[i].name).replace(/[^A-Za-z0-9_.-]/g,'_'));await item.saveAs(path);const actual=await readFile(path);must(actual.equals(Buffer.from(originals[i].content)),'A complete issued original download changed.');await bind(path,'complete-issued-original');}
  await record('portable_html_csv_originals_and_rendered_states',{returnedBytes:Buffer.byteLength(returned),returnedSha256:hash(returned),editions:approved.editions.length,originalFiles:originals.length});
  await context.close();context=null;
  const receiving=await action('receive','delivery.reconcile',{deliveryId:issuedRecord.id,customerFile:{name:'OpenFEMA_Recipient_Return.csv',content:returned}});
  const report=JSON.parse((await app.raw(receiving.documentSha256)).bytes.toString('utf8'));must(report.reviewProposals.length===1,'The original native receiver did not retain exactly one analyst proposal.');
  const before=await app.version(selection.versionId),applied=await action('apply','delivery.review.apply',{reconciliationId:receiving.id,versionId:selection.versionId,rowNumbers:report.reviewProposals.map(r=>r.rowNumber),reviewer:'Receiving programme analyst',note:'Receive the complete reviewed recipient CSV and preserve the original source values.'});
  const after=await app.version(applied.versionId);
  const money=p=>p.projects.map(r=>({id:r.id,disasterNumber:r.disasterNumber,projectCost:r.projectCost,federalObligated:r.federalObligated,totalObligated:r.totalObligated,mitigation:r.mitigation}));
  must(JSON.stringify(money(before.portfolio))===JSON.stringify(money(after.portfolio)),'Native selected review changed one of the four published financial measures.');
  const nextRecord=await action('reissue','delivery.export',{mappingId:selection.mappingId,versionId:applied.versionId,customerReconciliationId:receiving.id});
  const next=await receiveIssued(nextRecord,'12-reissued');
  await action('compare','delivery.compare',{beforeDeliveryId:issuedRecord.id,afterDeliveryId:nextRecord.id});
  await record('original_native_return_selected_apply_and_reissue',{reconciliationId:receiving.id,reviewImportId:applied.id,versionId:applied.versionId,originalRows:issued.manifest.rows.length,reissuedRows:next.manifest.rows.length,summary:report.summary});
  let archivePath;
  if(plan.finalArchive){archivePath=plan.finalArchive.path;const bytes=await readFile(archivePath);must(bytes.length===plan.finalArchive.bytes&&hash(bytes)===plan.finalArchive.sha256,'The complete retained restore input changed.');await bind(archivePath,'complete-native-workspace');}
  else{const archive=await app.archive(),archiveBytes=Buffer.isBuffer(archive)?archive:archive.bytes;must(Buffer.isBuffer(archiveBytes),'Original workspace archive returned no complete bytes.');archivePath=await retainedFile('13-complete-original-workspace.zip',archiveBytes,'complete-native-workspace');plan.finalArchive={path:archivePath,bytes:archiveBytes.length,sha256:hash(archiveBytes)};await savePlan();}
  await app.close();closed=true;
  const restored=join(root,'received-workspace');
  const run=await promisify(execFile)(process.execPath,[join(application,'cli.mjs'),'restore','--archive',archivePath,'--workspace',restored],{maxBuffer:16*1024*1024});
  await retainedFile('14-original-restore.json',run.stdout,'native-original-restore');
  const received=await openOpenFemaWorkspace({directory:restored});try{const current=await received.view();must(current.workspaceId===workspaceId&&current.deliveryReviewImports.some(r=>r.id===applied.id)&&current.projectDeliveries.some(r=>r.id===nextRecord.id),'Complete workspace restore lost the original recipient-return history.');await record('complete_workspace_restore',{workspaceId:current.workspaceId,revision:current.revision,versionId:current.selectedVersionId});}finally{await received.close();}
  result.status='COMPLETE';result.finishedAt=new Date().toISOString();await writeFile(outputPath,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){result.status='FAILED';result.error={name:e.name,message:e.message,stack:e.stack};await writeFile(join(attempt,'failure.json'),JSON.stringify(result,null,2));throw e;}
finally{if(context)await context.close();if(!closed)await app.close();}
