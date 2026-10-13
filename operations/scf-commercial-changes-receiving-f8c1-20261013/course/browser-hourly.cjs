'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const cfg=JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'));
const out=cfg.output;let browser,context;
const result={schema:'commons.scf-hourly-billing-browser.v1',state:'STARTING',checkpoints:[],screenshots:[],downloads:[],pageErrors:[],responses:[],charges:[],nativeDocuments:[]};
const check=(ok,message)=>{if(!ok)throw Error(message);};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const enc=encodeURIComponent;
const clone=v=>JSON.parse(JSON.stringify(v));
async function persist(){await fs.writeFile(path.join(out,'browser-result.json'),JSON.stringify(result,null,2)+'\n');}
async function saved(name,value){const data=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';await fs.writeFile(path.join(out,name),data);return{path:name,bytes:Buffer.byteLength(data),sha256:hash(data)};}
async function main(){
 await fs.mkdir(out,{recursive:true});
 for(const key of ['origin','token','nativeBaseUrl','output','chrome','playwright','caseId','planId','actor','endpointId','customerId','sourceId','workId','contributorId','costId','chargeHours','creditHours','replacementHours','hourlyRate','amount','creditAmount','replacementAmount','controlDir','protectedSnapshotsFile'])check(typeof cfg[key]==='string'&&cfg[key].length,'Missing original receiving configuration '+key);
 check(Array.isArray(cfg.protectedInvoiceIds)&&cfg.protectedInvoiceIds.length>=2,'Retain original paid/open protected invoice identities');
 check(cfg.currency?.code==='USD'&&cfg.currency.scale===2,'This original course uses the declared USD two-decimal internal terms');
 const protectedBytes=await fs.readFile(cfg.protectedSnapshotsFile);
 result.protectedBaseline={path:cfg.protectedSnapshotsFile,bytes:protectedBytes.length,sha256:hash(protectedBytes),invoiceIds:cfg.protectedInvoiceIds};
 const {chromium}=require(cfg.playwright);
 browser=await chromium.launch({executablePath:cfg.chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update'],timeout:90000});
 context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',e=>result.pageErrors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(cfg.origin+'/api/'))result.responses.push({url:new URL(r.url()).pathname,status:r.status(),method:r.request().method()});});
 const base='/api/operations/'+enc(cfg.caseId)+'/work-billing',rowPath=id=>base+'/'+enc(id);
 const desk=()=>page.locator('.work-billing');
 const button=action=>desk().locator('[data-eb-action="'+action+'"]');
 const field=name=>desk().locator('[name="'+name+'"]');
 async function point(name,extra={}){result.checkpoints.push({name,at:new Date().toISOString(),...extra});await persist();}
 async function idle(){await page.waitForFunction(()=>document.querySelector('.work-billing')?.getAttribute('aria-busy')==='false');}
 async function reveal(locator){
  const ancestors=locator.locator('xpath=ancestor::details');
  for(let i=0;i<await ancestors.count();i++){const d=ancestors.nth(i);if(await d.getAttribute('open')===null)await d.locator(':scope > summary').click();}
 }
 async function action(name,options={}){
  const b=button(name);await reveal(b);await b.click();await idle();
  const alert=desk().locator('.eb-message[role="alert"]');
  if(!options.allowError&&await alert.count()&&(await alert.innerText()).trim())throw Error(name+': '+await alert.innerText());
 }
 async function post(name,suffix,options={}){
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname===suffix&&r.request().method()==='POST');
  await action(name,{allowError:true});const response=await pending,body=await response.json();
  await point(name,{path:suffix,status:response.status(),response:body});
  if(!options.allowError)check(response.ok(),'Original '+name+' failed: '+JSON.stringify(body));
  return{status:response.status(),body};
 }
 async function get(url){const r=await page.request.get(cfg.origin+url);check(r.ok(),'Read '+url+' failed '+r.status());return r.json();}
 async function current(id){return get(rowPath(id));}
 async function shot(name,width=1440){
  await page.setViewportSize({width,height:width===390?844:1000});await page.waitForTimeout(150);
  const dom=await page.evaluate(()=>{
   const vw=document.documentElement.clientWidth;
   const escapes=[...document.querySelectorAll('body *')].filter(el=>{
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    if(s.display==='none'||s.visibility==='hidden'||r.width===0||r.right<=vw+1||r.left<0)return false;
    for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement)if(['auto','scroll','hidden','clip'].includes(getComputedStyle(p).overflowX))return false;
    return true;
   }).slice(0,15).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,100),right:el.getBoundingClientRect().right}));
   const rgb=v=>(v.match(/[\d.]+/g)||[]).map(Number);
   const lum=c=>c.slice(0,3).map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
   const contrast=[];
   for(const el of document.querySelectorAll('.work-billing h2,.work-billing h3,.work-billing label>span,.work-billing input,.work-billing select,.work-billing textarea,.work-billing button,.work-billing dt,.work-billing dd')){
    const box=el.getBoundingClientRect(),style=getComputedStyle(el);if(!box.width||!box.height||style.visibility==='hidden'||el.disabled)continue;
    let bg=[255,255,255];for(let p=el;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length>=3&&(c.length===3||c[3]===1)){bg=c;break;}}
    const fg=rgb(style.color);if(fg.length<3)continue;
    const a=lum(fg),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&parseInt(style.fontWeight)>=700);
    if(ratio+.01<(large?3:4.5))contrast.push({tag:el.tagName,text:el.textContent.slice(0,80),color:style.color,background:bg,ratio});
   }
   return{viewport:vw,documentWidth:document.documentElement.scrollWidth,escapes,contrastFailures:contrast,title:document.title};
  });
  const target=path.join(out,name+'.png');await page.screenshot({path:target,fullPage:true,animations:'disabled'});
  result.screenshots.push({path:path.basename(target),width,...dom});await persist();
  check(dom.documentWidth<=width+1,'Page exceeds '+width+'px: '+name);check(!dom.escapes.length,'Uncontained content: '+name);check(!dom.contrastFailures.length,'Unreadable contrast: '+name);
 }
 async function download(name,filename){
  const waiting=page.waitForEvent('download');await button(name).click();const d=await waiting,target=path.join(out,filename);
  await d.saveAs(target);check(!(await d.failure()),'Download failed '+filename);const bytes=await fs.readFile(target);
  result.downloads.push({path:filename,bytes:bytes.length,sha256:hash(bytes),suggestedFilename:d.suggestedFilename()});await persist();return target;
 }
 async function openDesk(){
  await page.goto(cfg.origin+'/#access='+cfg.token,{waitUntil:'domcontentloaded'});
  await page.locator('#plan-select').waitFor();await page.locator('#plan-select').selectOption(cfg.planId);
  await page.locator('[data-tab="operations"]').click();
  await page.locator('[name="caseSelect"]').waitFor();await page.locator('[name="caseSelect"]').selectOption(cfg.caseId);
  await page.locator('[name="recordingActor"]').fill(cfg.actor);
  const nav=page.locator('[data-nav-section="work-billing"]');await nav.waitFor({state:'attached'});await reveal(nav);
  if(!(await nav.isVisible())){const toggle=page.locator('[data-nav-toggle]');if(await toggle.isVisible())await toggle.click();}
  await nav.click();await desk().waitFor();await page.waitForFunction(()=>document.querySelector('.work-billing [name="authorityId"]'));await idle();
 }
 async function fillTerms(reason){
  const values={reason,issueDate:cfg.issueDate,dueDate:cfg.dueDate,effectiveDate:cfg.effectiveDate,purchaseOrder:'F8C1-INTERNAL-HOURLY-RECEIVING',note:'Original private receiving course; full customer terms retained separately.'};
  for(const [name,value]of Object.entries(values)){check(typeof value==='string'&&value.length,'Missing reviewed '+name);await field(name).fill(value);}
 }
 async function recordAuthority(){
  await action('new-authority');await reveal(field('endpointId'));await field('endpointId').selectOption(cfg.endpointId);await idle();
  await field('customerId').selectOption(cfg.customerId);
  const values={'a.title':'Original private hourly receiving agreement','a.authorization':cfg.authorization,
   'a.authorizedOn':cfg.authorizedOn,'a.currency':cfg.currency.code,'a.scale':String(cfg.currency.scale),
   'a.periodStart':cfg.issueDate,'a.periodEnd':cfg.dueDate,'a.hoursCap':'0.2000','a.amountCap':'25.00'};
  for(const [key,value]of Object.entries(values))await field(key).fill(value);
  await field('a.sourceIds').selectOption([cfg.sourceId]);await field('a.rounding').selectOption('EXACT');
  await action('add-rate');const rate=desk().locator('[data-hourly-rate]');check(await rate.count()===1,'One original hourly rate required');
  await rate.locator('[data-rate-field="label"]').fill('Private reviewed implementation hourly rate');
  await rate.locator('[data-rate-field="hourlyRate"]').fill(cfg.hourlyRate);
  await rate.locator('[data-rate-field="contributorIds"]').selectOption([cfg.contributorId]);
  await rate.locator('[data-rate-field="costIds"]').selectOption([cfg.costId]);
  await shot('03-hourly-authority-desktop');await shot('04-hourly-authority-phone',390);await page.setViewportSize({width:1440,height:1000});
  const row=(await post('save-authority',base+'/authorities')).body;
  check(row.terms.rates.length===1&&row.terms.rates[0].hourlyRate===cfg.hourlyRate,'Retained actual rate differs');
  cfg.authorityId=row.id;cfg.rateId=row.terms.rates[0].id;result.authorityId=row.id;
  await field('authorityId').selectOption(row.id);await idle();
  await saved('original-hourly-authority.json',row);
 }
 async function fillLine(amount,description){
  const line=desk().locator('[data-eb-line]');check(await line.count()===1,'Select exactly the original Work record');
  const quantity=amount===cfg.amount?cfg.chargeHours:amount===cfg.creditAmount?cfg.creditHours:amount===cfg.replacementAmount?cfg.replacementHours:null;
  check(quantity,'Retain the declared original hourly amount/quantity binding');
  await line.locator('[data-line-field="hours"]').fill(quantity);
  await line.locator('[data-line-field="rateId"]').selectOption(cfg.rateId);
  await line.locator('[data-line-field="description"]').fill(description);
 }
 async function newReview(reason,amount=cfg.amount){
  await action('new');await field('authorityId').selectOption(cfg.authorityId);await idle();
  const row=desk().locator('tr[data-work-id="'+cfg.workId+'"]');
  check(await row.count()===1,'Original Work selection is not unique');
  await row.locator('[data-eb-action="select-line"]').click();await idle();
  await fillLine(amount,'Original accepted hourly Work / '+cfg.workId);await fillTerms(reason);
  const r=await post('preview',base+'/preview');
  check(r.body.proposal.lines.length===1&&r.body.proposal.lines[0].work.id===cfg.workId,'Preview selected another original Work');
  check(r.body.proposal.authority.id===cfg.authorityId&&r.body.proposal.customer.id===cfg.customerId&&r.body.proposal.endpointId===cfg.endpointId,'Preview selected another customer/account or authority');
  check(r.body.proposal.amount===amount,'Customer hourly preview amount differs');return r.body;
 }
 async function prepare(label){
  const r=await post('prepare',base+'/prepare');check(/^work-billing-[a-f0-9]{32}$/.test(r.body.id),'Original prepared charge ID missing');
  result.charges.push({label,id:r.body.id,proposalSha256:r.body.proposalSha256});return r.body;
 }
 async function cancel(id,reason){
  await reveal(field('cancelReason'));await field('cancelReason').fill(reason);await post('cancel',rowPath(id)+'/cancel');
  const row=await current(id);check(row.state==='CANCELLED','Unused source preparation did not cancel');
  check(row.history.some(h=>h.action==='cancelled'&&h.reason===reason),'Cancellation reason missing');return row;
 }
 async function control(request){
  const dir=cfg.controlDir;await fs.mkdir(dir,{recursive:true});
  const target=path.join(dir,'request.json'),response=path.join(dir,'response.json');
  try{const prior=JSON.parse(await fs.readFile(target,'utf8'));check(JSON.stringify(prior)===JSON.stringify(request),'Original source-change request identity differs');}catch(e){if(e.code!=='ENOENT')throw e;const temp=target+'.'+process.pid+'.tmp';await fs.writeFile(temp,JSON.stringify(request,null,2)+'\n',{flag:'wx'});await fs.rename(temp,target);}
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
   try{const r=JSON.parse(await fs.readFile(response,'utf8'));if(r.id===request.id){await saved('source-change-native-response.json',r);check(r.state==='COMPLETED'||r.ok===true,'Original source change failed: '+JSON.stringify(r));return r;}}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error('Original source-change response did not arrive; retained request '+request.id);
 }
 async function workingDesk(filename){const file=await download('save-desk',filename);return{file,body:JSON.parse(await fs.readFile(file,'utf8'))};}
 async function interruptedApply(id,label){
  const url=cfg.origin+rowPath(id)+'/apply';let original=null;
  await page.route(url,async route=>{
   await page.unroute(url);const response=await route.fetch(),bytes=await response.body();
   original={status:response.status(),request:JSON.parse(route.request().postData()),body:JSON.parse(bytes.toString('utf8')),bytes:bytes.length,sha256:hash(bytes)};
   await saved(label+'-original-response.json',original);await route.abort('failed');
  });
  try{
   await action('apply',{allowError:true});
   check(original?.status===200&&original.body.id===id,'Interrupted apply lacks original native success');
   const retained=await workingDesk(label+'-pending-desk.json');
   check(retained.body.session.pending?.chargeId===id&&retained.body.session.pending.action==='apply','Original pending apply was not saved');
   await shot(label+'-pending-phone',390);await page.setViewportSize({width:1440,height:1000});
   const before=await current(id),resumed=(await post('resume',rowPath(id)+'/apply')).body;
   check(resumed.activeInvoiceId===before.activeInvoiceId&&JSON.stringify(resumed.commands)===JSON.stringify(before.commands),'Resume changed acknowledged original invoice/commands');
   const settled=await workingDesk(label+'-settled-desk.json');check(settled.body.session.pending===null,'Original request did not settle');
   return{row:resumed,pendingFile:retained.file};
  }finally{await page.unroute(url);}
 }
 async function correction(mode,amount,label){
  const b=desk().locator('[data-eb-action="correct"][data-mode="'+mode+'"]');await b.click();await idle();
  await fillLine(amount,label+' / '+cfg.workId);await fillTerms(cfg.reason+' / '+label);
  if(mode==='REPLACE')await field('resolution').selectOption('CREDIT');
  const review=(await post('preview',base+'/preview')).body;
  check(review.proposal.mode===mode&&review.proposal.amount===amount,'Reviewed correction differs');
  const row=await prepare(label);return{row,review};
 }
 async function issue(id,label){
  const review=(await post('preview-issue',rowPath(id)+'/preview-issue')).body;
  check(review.invoiceId&&!cfg.protectedInvoiceIds.includes(review.invoiceId),'Issue review targets a protected original invoice');
  if(review.nativePreview.creditReviewRequired){
   const decision=cfg.creditDecisionIds?.[id]||(!review.nativePreview.creditDecisionStale&&review.nativePreview.creditDecisionId);
   check(typeof decision==='string'&&decision.length,'Original native credit-control decision must be reviewed by its receiving owner');
   await field('creditDecisionId').fill(decision);
  }
  await shot(label+'-review-desktop');await shot(label+'-review-phone',390);await page.setViewportSize({width:1440,height:1000});
  const row=(await post('issue',rowPath(id)+'/issue')).body;
  check(row.commands.some(c=>c.action==='issue'&&c.state==='ACKNOWLEDGED'),'Native issue acknowledgement missing');
  check(!cfg.protectedInvoiceIds.includes(row.activeInvoiceId),'Hourly issue changed protected native identity');return row;
 }
 async function reopen(file,id,label){
  const before=await current(id),waiting=page.waitForEvent('download'),chooser=page.waitForEvent('filechooser');
  await button('open-desk').click();await(await chooser).setFiles(file);
  const safety=await waiting;await safety.saveAs(path.join(out,label+'-safety-desk.json'));
  await page.waitForFunction(()=>document.querySelector('.eb-message')?.textContent.includes('Opened the original working desk'));await idle();
  const after=await current(id);check(JSON.stringify(before)===JSON.stringify(after),'Opening a saved desk changed original financial rows');return after;
 }

 await openDesk();await point('original-hourly-case-opened');await recordAuthority();await shot('01-original-hourlys-desktop');await shot('02-original-hourlys-phone',390);
 await page.emulateMedia({colorScheme:'dark'});
 await page.evaluate(()=>{for(const el of [document.body,document.querySelector('[data-ops-current-panel]')].filter(Boolean)){el.dataset.hourlyPriorStyle=el.getAttribute('style')||'';el.style.background='#181818';el.style.color='#eee';}});
 await shot('03-dark-host-desktop');await shot('04-dark-host-phone',390);
 await page.evaluate(()=>{for(const el of document.querySelectorAll('[data-hourly-prior-style]')){el.setAttribute('style',el.dataset.hourlyPriorStyle);delete el.dataset.hourlyPriorStyle;}});
 await page.emulateMedia({colorScheme:'light'});await page.setViewportSize({width:1440,height:1000});

 await newReview(cfg.reason+' / unused cancellation edition');const unused=await prepare('unused cancellation edition');
 await reveal(field('cancelReason'));await field('cancelReason').fill('');const posts=result.responses.filter(r=>r.method==='POST'&&r.url.endsWith('/cancel')).length;
 await action('cancel',{allowError:true});check((await desk().locator('.eb-message').innerText()).includes('Enter the reason'),'Blank cancellation explanation missing');
 check(result.responses.filter(r=>r.method==='POST'&&r.url.endsWith('/cancel')).length===posts,'Blank cancellation dispatched');
 const blank=await workingDesk('05-blank-cancellation-desk.json');check(blank.body.session.pending===null,'Blank cancellation stranded the desk');
 await cancel(unused.id,'Retain unused original preparation before the complete source-backed receiving course.');
 await point('blank-cancellation-corrected',{id:unused.id});

 const priorPreview=await newReview(cfg.reason+' / original source review before actual note correction');
 const stale=await prepare('source changes before native dispatch');
 await control({id:'change-source-once',action:'revise-work',workId:cfg.workId,expectedWorkSha256:priorPreview.proposal.lines[0].workSha256});
 const refused=await post('apply',rowPath(stale.id)+'/apply',{allowError:true});
 check(![200,201].includes(refused.status)&&refused.body.error?.code==='WORK_BILLING_APPLY_REVIEW','Original changed source did not produce its specific pre-dispatch refusal');
 const refusedDesk=await workingDesk('06-source-review-refusal-desk.json');
 check(refusedDesk.body.session.pending===null,'Source refusal stranded the browser request');
 const refusedRow=await current(stale.id);check(refusedRow.commands.length===0,'Changed source was dispatched natively');
 await shot('06-source-review-refusal-desktop');
 await cancel(stale.id,'Retain earlier source review after its real source-note correction; select the current reviewed edition.');
 await action('refresh');

 const freshPreview=await newReview(cfg.reason+' / current reviewed source');
 check(freshPreview.proposal.lines[0].workSha256!==priorPreview.proposal.lines[0].workSha256,'Current reviewed source edition was not selected');
 await shot('07-current-source-preview-desktop');await shot('08-current-source-preview-phone',390);await page.setViewportSize({width:1440,height:1000});
 const original=await prepare('current source customer charge');
 const applied=await interruptedApply(original.id,'09-first-charge');
 result.originalHourlyInvoiceId=applied.row.activeInvoiceId;
 check(applied.row.state==='APPLIED'&&!cfg.protectedInvoiceIds.includes(applied.row.activeInvoiceId),'Hourly draft identity is invalid');
 const draft=await correction('DRAFT_EDIT',cfg.amount,'clarified original hourly description');
 const edited=await interruptedApply(draft.row.id,'10-draft-correction');
 check(edited.row.activeInvoiceId===applied.row.activeInvoiceId,'Draft correction replaced original hourly invoice identity');
 const issued=await issue(draft.row.id,'11-original-hourly-issue');
 await point('original-hourly-invoice-issued',{chargeId:issued.id,invoiceId:issued.activeInvoiceId});

 const credit=await correction('CREDIT',cfg.creditAmount,'retained customer price reduction');
 const credited=(await post('apply',rowPath(credit.row.id)+'/apply')).body;
 check(credited.state==='APPLIED'&&credited.activeInvoiceId===issued.activeInvoiceId,'Credit did not preserve original hourly invoice');
 check(credited.commands.some(c=>c.action==='credit'&&c.state==='ACKNOWLEDGED'),'Original hourly credit acknowledgement missing');
 await shot('12-credited-original-desktop');await shot('13-credited-original-phone',390);await page.setViewportSize({width:1440,height:1000});
 const replacement=await correction('REPLACE',cfg.replacementAmount,'reviewed remaining amount and replacement');
 const replaced=await interruptedApply(replacement.row.id,'14-replacement');
 check(replaced.row.activeInvoiceId!==issued.activeInvoiceId&&!cfg.protectedInvoiceIds.includes(replaced.row.activeInvoiceId),'Replacement did not create its own hourly invoice');
 const final=await issue(replacement.row.id,'15-replacement-issue');
 result.finalChargeId=final.id;result.finalInvoiceId=final.activeInvoiceId;

 await reopen(applied.pendingFile,original.id,'16-original-pending-after-successors');
 await action('reconcile');
 const reopened=await workingDesk('16-reconciled-original-desk.json');
 check(reopened.body.session.pending===null&&reopened.body.session.lastRequest.outcome==='ACKNOWLEDGED','Historical apply request failed to reconcile');
 const finalButton=desk().locator('[data-eb-action="open-charge"][data-id="'+final.id+'"]');await finalButton.click();await idle();
 const finalDesk=await workingDesk('17-complete-hourly-desk.json');
 await reopen(finalDesk.file,final.id,'18-complete-hourly-desk');
 await shot('18-reopened-hourly-desk-desktop');await shot('19-reopened-hourly-desk-phone',390);await page.setViewportSize({width:1440,height:1000});

 const beforeReplay=await current(final.id);
 const retained=(await post('preview-issue',rowPath(final.id)+'/preview-issue')).body;
 check(retained.retainedCommand?.state==='ACKNOWLEDGED','Original acknowledged issue review missing');
 const replay=(await post('issue',rowPath(final.id)+'/issue')).body;
 check(JSON.stringify(replay.commands)===JSON.stringify(beforeReplay.commands),'Issue replay changed original native command history');
 await post('refresh-charge',rowPath(final.id)+'/refresh');
 await download('export','complete-hourly-billing.zip');
 const caseExport=page.locator('[data-ops-action="export"]');
 check(await caseExport.count()===1,'Original Operations case export control missing');
 {
  const waiting=page.waitForEvent('download');await reveal(caseExport);await caseExport.click();const d=await waiting,target=path.join(out,'complete-operations-case.zip');await d.saveAs(target);
  check(!(await d.failure()),'Original case export failed');const bytes=await fs.readFile(target);result.downloads.push({path:path.basename(target),bytes:bytes.length,sha256:hash(bytes)});
 }
 await point('complete-hourly-case-and-desk-exported');

 const rows=await Promise.all([current(original.id),current(draft.row.id),current(credit.row.id),current(replacement.row.id)]);
 await saved('full-original-hourly-billing-rows.json',rows);
 const documents=cfg.protectedInvoiceIds.map((id,i)=>({id,name:'invoice.html',label:'20-protected-original-'+i}));
 documents.push({id:issued.activeInvoiceId,name:'invoice.html',label:'21-credited-hourly-invoice'});
 for(const row of rows)for(const c of row.commands.filter(c=>c.action==='credit'&&c.state==='ACKNOWLEDGED')){
  const id=c.result?.credit?.id||c.result?.operation?.result?.creditId;check(typeof id==='string','Retain actual native credit identity');if(!documents.some(d=>d.id===id))documents.push({id,name:'credit.html',label:'22-credit-'+documents.filter(d=>d.name==='credit.html').length});
 }
 documents.push({id:final.activeInvoiceId,name:'invoice.html',label:'23-replacement-invoice'});
 result.nativeDocuments=documents;
 for(const d of documents){const response=await page.goto(cfg.nativeBaseUrl+'/documents/'+enc(d.id)+'/files/'+d.name,{waitUntil:'domcontentloaded'});check(response?.ok(),'Native document failed to open '+d.id+' / '+d.name);check((response.headers()['content-type']||'').includes('text/html'),'Native invoice rendition is not HTML');const bytes=await response.body(),filename=d.label+'-'+d.name;await fs.writeFile(path.join(out,filename),bytes);d.file={path:filename,bytes:bytes.length,sha256:hash(bytes)};await shot(d.label+'-desktop');await shot(d.label+'-phone',390);}
 check(!result.pageErrors.length,'Browser runtime errors: '+result.pageErrors.join('; '));
 check(hash(await fs.readFile(cfg.protectedSnapshotsFile))===result.protectedBaseline.sha256,'Original protected baseline was modified');
 result.state='COMPLETE';result.chargeIds=result.charges.map(x=>x.id);result.pixelInspection='Producing agent must open and LOOK at every retained final PNG and native document; captures are ready for that inspection.';
 await persist();
}
(async()=>{try{await main();}catch(error){result.state='BROWSER_COURSE_ERROR';result.error={message:error.message,stack:error.stack};await persist();process.exitCode=1;}finally{if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});console.log(JSON.stringify({phase:'HOURLY_BROWSER_FINISHED',state:result.state,output:out}));}})();
