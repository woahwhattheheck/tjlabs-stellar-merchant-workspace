// Additive installed-operator receiving inside the original Econdb browser lifetime.
import {readFile,mkdir,open,link,unlink,lstat,readdir} from 'node:fs/promises';
import {join,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex'),json=x=>JSON.stringify(x,null,2)+'\n',need=(x,m)=>{if(!x)throw Error(m)};
async function exists(p){try{await lstat(p);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}
async function retain(p,body){await mkdir(dirname(p),{recursive:true,mode:0o700});const bytes=Buffer.from(body),tmp=p+'.writing-'+randomUUID(),f=await open(tmp,'wx',0o600);try{await f.writeFile(bytes);await f.sync()}finally{await f.close()}try{await link(tmp,p)}catch(e){if(e.code!=='EEXIST')throw e;need((await readFile(p)).equals(bytes),'Original operator course member differs: '+p)}finally{await unlink(tmp)}const d=await open(dirname(p),'r');try{await d.sync()}finally{await d.close()}}
async function inventory(work,root){const rows=[];async function walk(p){const s=await lstat(p);need(!s.isSymbolicLink(),'Operator receiving refuses symlinks');if(s.isDirectory()){for(const n of(await readdir(p)).sort())await walk(join(p,n))}else{need(s.isFile(),'Expected original file');const b=await readFile(p);rows.push({path:relative(work,p),bytes:b.length,sha256:sha(b)})}}await walk(root);return rows}
export async function receiveOperatorBrowser({work,product,page,capture,exactOpen,result}){
 const O=await import(pathToFileURL(join(product,'operator.mjs'))),S=await import(pathToFileURL(join(product,'operator-server.mjs')));
 const root=join(work,'installed-operator'),exported=join(work,'installed-operator-transfer'),received=join(work,'installed-operator-received'),journal=join(work,'installed-operator-course');
 await mkdir(journal,{recursive:true,mode:0o700});await O.initializeOperator({directory:root,title:'Original issuer maritime operating workspace'});
 const checked={state:'RUNNING',controls:[],original_source_role:'issuer_documentation_example',identified_ports:[],payment:'UNSELECTED; no purchase or settlement invoked',views_require_operator_pixel_review:true};
 let running=await S.startOperator({directory:root}),active=root;
 const state=()=>O.operatorStatus(active),refresh=async()=>{
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/state'&&r.request().method()==='GET');
  await page.locator('#refresh').click();const saved=await(await response).json();
  await page.waitForFunction(expected=>document.querySelector('#workspace-name').textContent.includes('revision '+expected.revision+' · '+expected.workspace.id)&&!document.querySelector('#refresh').disabled,saved);
 };
 const tab=async name=>{await page.locator('[data-tab="'+name+'"]').click();checked.controls.push('tab:'+name)};
 async function connect(){await page.goto(running.url,{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('#workspace-name').textContent.includes('revision'));await page.waitForFunction(()=>!document.querySelector('#refresh').disabled)}
 async function saved(label,prepare,selector){
  const path=join(journal,label+'.request.json');let request;
  if(await exists(path)){
   request=JSON.parse(await readFile(path,'utf8'));await refresh();
   const before=await state(),existing=before.records.find(x=>x.id===request.id),pendingVisible=await page.locator('#pending').isVisible(),pendingText=await page.locator('#pending-label').textContent();
   if(pendingVisible&&pendingText.includes(request.id)){
    await page.locator('#retry').click();await page.waitForFunction(()=>document.querySelector('#pending').hidden&&!document.querySelector('#refresh').disabled,null,{timeout:120000});
   }else if(!existing){
    need(!pendingVisible,'Another original browser request must be reconciled first');
    await page.evaluate(async request=>{const cap=sessionStorage.getItem('econdb-capability:'+location.origin),r=await fetch('/api/command',{method:'POST',headers:{Authorization:'Bearer '+cap,'Content-Type':'application/json'},body:JSON.stringify(request)});const out=await r.json();if(!r.ok)throw Error(out.error);},request);
   }
   await refresh();
  }else{
   await prepare();
   const route=async r=>{const body=r.request().postDataJSON();await retain(path,json(body));request=body;await r.continue()};
   await page.route('**/api/command',route);
   try{await page.locator(selector).click();await page.waitForFunction(()=>!document.querySelector('#pending').hidden||document.querySelector('#notice').textContent.includes('saved'));await page.waitForFunction(()=>document.querySelector('#pending').hidden&&document.querySelector('#notice').textContent.includes('saved'),null,{timeout:120000})}
   finally{await page.unroute('**/api/command',route)}
  }
  need(request,'Original browser command was not dispatched');const original=await O.originalRequest(active,request.id);need(sha(json(original))===sha(json(request)),'Browser request changed after dispatch');
  const record=(await state()).records.find(x=>x.id===request.id);need(record&&record.kind!=='preserved-incomplete','Original browser operation did not complete');checked.controls.push(label);return record;
 }
 try{
  await connect();await capture((await state()).records.length?'installed-operator-original-reopen':'installed-operator-empty',page);
  const sources={};
  for(const name of ['capacity','traffic']){
   sources[name]=await saved('source-'+name,async()=>{await tab('sources');await page.locator('#source-form [name=raw]').setInputFiles(join(product,'examples',name+'.response.json'));await page.locator('#source-form [name=descriptor]').setInputFiles(join(product,'examples',name+'.descriptor.json'))},'#source-form button');
  }
  await capture('installed-operator-original-sources',page);
  const analysis=await saved('capacity-analysis',async()=>{await tab('analysis');const f=page.locator('#analysis-form');await f.locator('[name=title]').fill('Original capacity period comparison');await f.locator('[name=sourceId]').selectOption(sources.capacity.id);await f.locator('[name=from]').fill('2022-02-01');await f.locator('[name=until]').fill('2022-04-01');await f.locator('summary').click();for(const [name,value]of Object.entries({beforeFrom:'2022-02-01',beforeUntil:'2022-03-01',afterFrom:'2022-03-01',afterUntil:'2022-04-01'}))await f.locator('[name='+name+']').fill(value)},'#analysis-form > button');
  const config={schema:'econdb.maritime-project.v1',id:'issuer-maritime-examples',title:'Original issuer maritime project',entries:[{id:'capacity',title:'Original operator capacity',current:sources.capacity.id,selection:{from:'2022-02-01',until:'2022-04-01'},before:{from:'2022-02-01',until:'2022-03-01'},after:{from:'2022-03-01',until:'2022-04-01'}},{id:'traffic',title:'Original container traffic',current:sources.traffic.id,selection:{from:'2022-02-01',until:'2022-04-01'}}]};
  const project=await saved('original-project',async()=>{await tab('analysis');await page.locator('summary').filter({hasText:'Build from explicit'}).click();await page.locator('#project-form [name=config]').fill(JSON.stringify(config,null,2))},'#project-form > button:last-child');
  const publication=await saved('project-publication',async()=>{await tab('publication');const f=page.locator('#publication-form');await f.locator('[name=name]').fill('Original issuer project observations');await f.locator('[name=projectId]').selectOption(project.id);await f.locator('[name=editionRoles]').selectOption('current')},'#publication-form > button');
  await tab('publication');await capture('installed-operator-publication-desktop',page);await page.setViewportSize({width:390,height:844});await capture('installed-operator-publication-narrow',page);await page.setViewportSize({width:1440,height:1000});
  // Reconcile the exact originally captured request after completion, without a new mutation.
  const request=JSON.parse(await readFile(join(journal,'project-publication.request.json'),'utf8')),before=await state(),again=await O.operatorCommand({directory:active,request});
  need(again.replayed&&again.record.id===publication.id&&(await state()).revision===before.revision,'Original completed request did not replay exactly');
  for(const record of [analysis,project,publication]){
   await tab('history');await page.locator('[data-files="'+record.id+'"]').first().click();await page.waitForFunction(title=>document.querySelector('#files-title').textContent.startsWith(title),record.title);
   const members=await O.operatorFiles(active,record.id);
   for(const row of members.files){
    const path=join(active,record.directory,row.path);
    if(row.path==='report.html'||row.path==='dataset.csv'||row.path==='observations.csv'){
     const link=page.locator('#file-list a').filter({hasText:'Download'}),href='/api/file?id='+encodeURIComponent(record.id)+'&member='+encodeURIComponent(row.path);
     const a=page.locator('#file-list a[href="'+href+'"]');
     if(await a.count()){const wait=page.waitForEvent('download');await a.click();const downloaded=await wait,target=join(journal,'downloads',record.id,row.path);await mkdir(dirname(target),{recursive:true,mode:0o700});await downloaded.saveAs(target);need(sha(await readFile(target))===sha(await readFile(path)),'Downloaded original bytes differ');await exactOpen(target,'operator-download-'+record.kind+'-'+row.path,{captureImage:true})}
    }
   }
   for(const row of members.files)await exactOpen(join(active,record.directory,row.path),'operator-member-'+record.kind+'-'+row.path.replaceAll('/','-'),{captureImage:row.path.endsWith('.html')});
  }
  await tab('buyer');await capture('installed-operator-original-buyer-unselected',page);await tab('history');await capture('installed-operator-history',page);
  await running.close();running=null;
  const transfer=await O.exportOperator({directory:root,destination:exported});await O.inspectOperatorTransfer(exported);let independent;
  if(await exists(received)){
   const current=await O.operatorStatus(received),original=await O.operatorStatus(root),continuationPath=join(journal,'received-march-analysis.request.json');
   need(current.workspace.id===original.workspace.id&&current.records.length>=5&&current.records.length<=6,'Existing received identity or course changed');
   for(let n=0;n<5;n++){need(JSON.stringify(current.records[n])===JSON.stringify(original.records[n]),'Received original history differs');const request=await O.originalRequest(received,current.records[n].id);need((await O.operatorCommand({directory:received,request})).replayed,'Received original outcome did not replay')}
   if(current.records.length===6){need(await exists(continuationPath),'Received continuation has no original course request');const request=JSON.parse(await readFile(continuationPath,'utf8'));need(current.records[5].id===request.id&&(await O.operatorCommand({directory:received,request})).replayed,'Received continuation differs')}
   independent={status:current};
  }else independent=await O.receiveOperator({directory:exported,destination:received});
  need(independent.status.workspace.id===(await O.operatorStatus(root)).workspace.id,'Independent workspace identity changed');
  active=received;running=await S.startOperator({directory:received});await connect();await tab('history');await capture('installed-operator-independent-reopen',page);
  const receivedStatus=await state();need([5,6].includes(receivedStatus.records.length)&&receivedStatus.records.some(r=>r.id===publication.id),'Original records were not independently received');
  // Continue only the received workspace with an explicit new March selection.
  await saved('received-march-analysis',async()=>{await tab('analysis');const f=page.locator('#analysis-form');await f.locator('[name=title]').fill('Received March source review');await f.locator('[name=sourceId]').selectOption(sources.capacity.id);await f.locator('[name=from]').fill('2022-03-01');await f.locator('[name=until]').fill('2022-04-01')},'#analysis-form > button');
  await capture('installed-operator-received-continuation',page);await running.close();running=null;running=await S.startOperator({directory:received});await connect();await tab('history');need((await state()).records.length===6,'Cold received continuation changed');await capture('installed-operator-received-cold-reopen',page);
  need((await O.operatorStatus(root)).records.length===5,'Independent continuation changed original workspace');
  checked.state='CAPTURED_REQUIRES_PIXEL_REVIEW';checked.original_workspace_id=(await state()).workspace.id;checked.original_records=5;checked.received_records=6;checked.transfer_files=transfer.manifest.files.length;
 }finally{if(running)await running.close()}
 checked.files=[];for(const dir of [root,exported,received,journal])if(await exists(dir))checked.files.push(...await inventory(work,dir));
 return checked;
}
