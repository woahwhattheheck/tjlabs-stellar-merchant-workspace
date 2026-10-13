'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const cfg=JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'));
const out=cfg.output;let browser,context;
const result={schema:'commons.scf-commercial-changes-browser.v1',state:'STARTING',checkpoints:[],screenshots:[],downloads:[],pageErrors:[],responses:[]};
const check=(ok,message)=>{if(!ok)throw Error(message);};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function persist(){await fs.writeFile(path.join(out,'browser-result.json'),JSON.stringify(result,null,2)+'\n');}
async function saved(name,value){const data=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';await fs.writeFile(path.join(out,name),data);return {path:name,bytes:Buffer.byteLength(data),sha256:hash(data)};}
async function main(){
 await fs.mkdir(out,{recursive:true}); const {chromium}=require(cfg.playwright);
 browser=await chromium.launch({executablePath:cfg.chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update'],timeout:90000});
 context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>result.pageErrors.push(e.message));
 page.on('response',response=>{if(response.url().startsWith(cfg.origin+'/api/'))result.responses.push({url:new URL(response.url()).pathname,status:response.status(),method:response.request().method()});});
 async function point(name,extra={}){result.checkpoints.push({name,at:new Date().toISOString(),...extra});await persist();}
 async function shot(name,width=1440){
  await page.setViewportSize({width,height:width===390?844:1000});await page.waitForTimeout(150);
  const dom=await page.evaluate(()=>{
   const vw=document.documentElement.clientWidth;
   const escapes=[...document.querySelectorAll('body *')].filter(el=>{
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    if(s.display==='none'||s.visibility==='hidden'||r.width===0||r.right<=vw+1||r.left<0)return false;
    for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const st=getComputedStyle(p);if(['auto','scroll','hidden','clip'].includes(st.overflowX))return false;}
    return true;
   }).slice(0,15).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,120),right:el.getBoundingClientRect().right}));
   const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number);
   const lum=color=>color.slice(0,3).map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
   const contrast=[];
   for(const el of document.querySelectorAll('.commercial-changes h2,.commercial-changes h3,.commercial-changes h4,.commercial-changes label>span,.commercial-changes input,.commercial-changes select,.commercial-changes textarea,.commercial-changes button,.commercial-changes dt,.commercial-changes dd')){
    const box=el.getBoundingClientRect(),style=getComputedStyle(el);if(!box.width||!box.height||style.visibility==='hidden')continue;
    let bg=[255,255,255],found=false;
    for(let p=el;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c.length>=3&&(c.length===3||c[3]===1)){bg=c;found=true;break;}}
    const fg=rgb(style.color);if(fg.length<3)continue;
    const a=lum(fg),d=lum(bg),ratio=(Math.max(a,d)+.05)/(Math.min(a,d)+.05);
    const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&parseInt(style.fontWeight)>=700);
    if(ratio+0.01<(large?3:4.5))contrast.push({tag:el.tagName,text:el.textContent.slice(0,80),color:style.color,background:bg,ratio,backgroundFound:found});
   }
   return {viewport:vw,documentWidth:document.documentElement.scrollWidth,escapes,title:document.title,contrastFailures:contrast};
  });
  const target=path.join(out,name+'.png');await page.screenshot({path:target,fullPage:true,animations:'disabled'});
  result.screenshots.push({path:path.basename(target),...dom,width});
  await persist();check(dom.documentWidth<=width+1,'Page exceeds '+width+' px: '+name);check(!dom.escapes.length,'Uncontained content: '+name);check(!dom.contrastFailures.length,'Unreadable component contrast: '+name);
 }
 async function download(button,name){
  const waiting=page.waitForEvent('download');await button.click();const d=await waiting;const target=path.join(out,name);await d.saveAs(target);
  check(!(await d.failure()),'Download failed: '+name);const bytes=await fs.readFile(target);
  result.downloads.push({path:name,bytes:bytes.length,sha256:hash(bytes),suggestedFilename:d.suggestedFilename()});await persist();return target;
 }
 async function responseAction(button,suffix){
  const wait=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(suffix)&&r.request().method()==='POST');
  await button.click();const res=await wait;let body;try{body=await res.json();}catch{throw Error('Unreadable '+suffix+' response');}
  await point(suffix,{status:res.status(),result:body});
  check(res.ok(),'Action '+suffix+' failed: '+JSON.stringify(body));return body;
 }
 async function get(suffix){const res=await page.request.get(cfg.origin+suffix);check(res.ok(),'Native case read failed '+suffix);return res.json();}
 const base='/api/operations/'+encodeURIComponent(cfg.caseId)+'/commercial';
 const rowPath=id=>base+'/changes/'+encodeURIComponent(id);
 async function current(id){return get(rowPath(id));}
 async function openDesk(){
  await page.goto(cfg.origin+'/#access='+cfg.token,{waitUntil:'domcontentloaded'});
  await page.locator('#plan-select').waitFor();await page.locator('#plan-select').selectOption(cfg.planId);
  await page.locator('[data-tab="operations"]').click();
  const cases=page.locator('[name="caseSelect"]');await cases.waitFor();await cases.selectOption(cfg.caseId);
  await page.locator('[name="recordingActor"]').fill(cfg.actor);
  const nav=page.locator('[data-nav-section="commercial"]');await nav.waitFor({state:'attached'});
  const details=nav.locator('xpath=ancestor::details[1]');
  if(await details.count()&&!(await details.getAttribute('open')!==null))await details.locator('summary').first().click();
  if(!(await nav.isVisible())){const toggle=page.locator('[data-nav-toggle]');if(await toggle.isVisible())await toggle.click();}
  await nav.click();
  await page.locator('[name="billing.selected"]').waitFor();await page.locator('[name="billing.selected"]').selectOption(cfg.preparedId);
  const milestone=page.locator('[data-commercial-action="changes"][data-milestone="'+cfg.milestoneId+'"]');
  await milestone.waitFor();await milestone.click();await page.locator('form[data-change-form]').waitFor();
 }
 async function review(values){
  const form=page.locator('form[data-change-form]');
  for(const [name,value] of Object.entries(values)){
   const control=form.locator('[name="'+name+'"]');if(['mode','resolution','sourceIds'].includes(name))await control.selectOption(value);else await control.fill(String(value));
  }
  return responseAction(form.locator('button[type="submit"]'),'/preview');
 }
 const button=action=>page.locator('[data-change-action="'+action+'"]');
 async function openSavedDesk(file,id){
  const before=await current(id),waiting=page.waitForEvent('download');
  await page.locator('input[data-change-desk-file]').setInputFiles(file);
  const safety=await waiting;await safety.saveAs(path.join(out,'safety-'+path.basename(file)));
  await page.waitForFunction(()=>document.querySelector('.change-message')?.textContent.includes('Opened'));
  const after=await current(id);check(JSON.stringify(before)===JSON.stringify(after),'Saved original desk reopening changed its native row');
  return after;
 }
 async function interruptedApply(id,label){
  const rowUrl=cfg.origin+rowPath(id),applyUrl=rowUrl+'/apply';let loss=null;
  // The original command completes. The same brief network interruption also
  // prevents its browser's immediate GET reconciliation; no native data is replaced.
  const blockedRead=async route=>route.request().method()==='GET'?route.abort('failed'):route.continue();
  await page.route(rowUrl,blockedRead);
  await page.route(applyUrl,async route=>{
   await page.unroute(applyUrl);
   const response=await route.fetch(),bytes=await response.body();
   loss={status:response.status(),request:JSON.parse(route.request().postData()),body:JSON.parse(bytes.toString('utf8')),bytes:bytes.length,sha256:hash(bytes)};
   await saved(label+'-original-response.json',loss);await route.abort('failed');
  });
  try{
   await button('apply').click();
   await page.waitForFunction(()=>document.querySelector('[data-change-action="resume"]')&&!document.querySelector('[data-change-action="resume"]').disabled);
   check(loss&&loss.status===200&&loss.body.id===id,'The interrupted action did not retain its actual original success');
   const file=await download(button('download-desk'),label+'-pending-desk.json');
   await shot(label+'-pending-phone',390);
   await page.unroute(rowUrl,blockedRead);
   const before=await current(id);
   const after=await responseAction(button('resume'),'/apply');
   check(after.activeInvoiceId===before.activeInvoiceId&&JSON.stringify(after.commands)===JSON.stringify(before.commands),'Original recovery changed its acknowledged native identity or journal');
   return {row:after,file,original:loss};
  }finally{await page.unroute(rowUrl,blockedRead);}
 }

 await openDesk();await point('original-milestone-opened');await shot('01-original-milestone-desktop');await shot('02-original-milestone-phone',390);
 await page.setViewportSize({width:1440,height:1000});
 await page.emulateMedia({colorScheme:'dark'});
 await page.evaluate(()=>{for(const el of [document.body,document.querySelector('[data-ops-current-panel]')].filter(Boolean)){el.dataset.coursePriorStyle=el.getAttribute('style')||'';el.style.background='#181818';el.style.color='#eee';}});
 await shot('02b-dark-host-desktop');await shot('02c-dark-host-phone',390);
 await page.evaluate(()=>{for(const el of document.querySelectorAll('[data-course-prior-style]')){el.setAttribute('style',el.dataset.coursePriorStyle);delete el.dataset.coursePriorStyle;}});
 await page.emulateMedia({colorScheme:'light'});await page.setViewportSize({width:1440,height:1000});
 const common={sourceIds:[cfg.sourceId],resolution:'CREDIT',targetAmount:cfg.revisedAmount,description:cfg.description,issueDate:cfg.issueDate,dueDate:cfg.dueDate,effectiveDate:cfg.effectiveDate,authorizedOn:cfg.authorizedOn,purchaseOrder:'  F8C1-INTERNAL-RECEIVING  ',note:'  Private restored-copy product demonstration; no customer delivery.  ',reason:cfg.reason,authorization:cfg.authorization};
 // Retain an unused source-backed preparation and its actual cancellation history.
 await review({...common,mode:'REPLACE',reason:cfg.reason+' / earlier unused wording'});
 const unused=await responseAction(button('prepare'),'/prepare');result.cancelledChangeId=unused.id;
 const cancelActor=cfg.actor+' / cancellation recorder',cancelReason='Retain this unused preparation; the following reviewed edition carries the final internal demonstration wording.';
 await page.locator('[name="recordingActor"]').fill(cancelActor);
 const cancelDetails=page.locator('details').filter({has:page.locator('[name="cancelReason"]')});
 if(await cancelDetails.count()&&await cancelDetails.getAttribute('open')===null)await cancelDetails.locator('summary').click();
 await page.locator('[name="cancelReason"]').fill(cancelReason);
 const cancelled=await responseAction(button('cancel'),'/cancel');
 check(cancelled.state==='CANCELLED'&&cancelled.commands.length===0,'Unused preparation was not cancelled without native commands');
 check(cancelled.history.some(x=>x.action==='cancelled'&&x.actor===cancelActor&&x.reason===cancelReason),'Original cancellation actor and reason are absent');
 const cancelledDesk=await download(button('download-desk'),'cancelled-unused-desk.json');
 await openSavedDesk(cancelledDesk,unused.id);await shot('02d-retained-cancellation-desktop');
 await page.locator('[name="recordingActor"]').fill(cfg.actor);
 const preview=await review({...common,mode:'REPLACE'});
 check(preview.proposal.invoiceId===cfg.originalOpenInvoiceId,'Review points away from the original unpaid invoice');
 check(preview.proposal.nativeBefore.invoice.paid===cfg.zero,'Unexpected payment on the correction target');
 check(preview.proposal.authorizationSources.some(x=>x.id===cfg.sourceId),'Original authorization source missing');
 await shot('03-source-review-desktop');await shot('04-source-review-phone',390);await page.setViewportSize({width:1440,height:1000});
 const prepared=await responseAction(button('prepare'),'/prepare');result.replacementId=prepared.id;
 await shot('05-reviewed-preparation-desktop');
 const originalRecovery=await interruptedApply(prepared.id,'06-replacement');
 const recovered=originalRecovery.row;
 await point('original-response-recovered',{changeId:prepared.id,invoiceId:recovered.activeInvoiceId});
 await shot('07-recovered-replacement-phone',390);await page.setViewportSize({width:1440,height:1000});
 // A second source-backed edition refines the same unissued replacement draft.
 const draftPreview=await review({...common,mode:'DRAFT_EDIT',description:cfg.description+' — clarified internal receiving edition',note:'Private receiving copy. Clarified draft terms remain separately reviewed.'});
 check(draftPreview.proposal.invoiceId===recovered.activeInvoiceId,'Draft correction selected another native invoice');
 const draft=await responseAction(button('prepare'),'/prepare');result.draftChangeId=draft.id;
 const draftRecovery=await interruptedApply(draft.id,'08-draft');
 const applied=draftRecovery.row;
 check(applied.activeInvoiceId===recovered.activeInvoiceId,'Draft edit must retain the replacement invoice identity');
 const issue=await responseAction(button('preview-issue'),'/preview-issue');
 check(issue.eligibility&&issue.eligibility.ready,'Original actual milestone prerequisites are not satisfied');
 check(!issue.nativePreview.creditReviewRequired,'Existing native credit-control owner must supply any required decision');
 check(issue.nativePreview.document.totals.total===cfg.revisedAmount,'Issue review amount differs');
 await shot('08-issue-review-desktop');await shot('09-issue-review-phone',390);
 const issued=await responseAction(button('issue'),'/issue');
 check(issued.commands.some(x=>x.action==='issue'&&x.state==='ACKNOWLEDGED'),'Native issue did not return its original acknowledgement');
 result.finalChangeId=issued.id;result.activeInvoiceId=issued.activeInvoiceId;
 // Reopen actual retained pending files after the later native history exists.
 // The original journal now resolves the completed apply prefix without redispatch.
 await openSavedDesk(originalRecovery.file,prepared.id);
 await shot('10a-original-apply-after-later-correction-desktop');
 await openSavedDesk(draftRecovery.file,draft.id);
 await shot('10b-apply-after-native-issue-phone',390);
 check(!(await button('resume').count()),'The completed apply prefix was not reconciled from original history');
 const reconciled=await download(button('download-desk'),'reconciled-after-issue-desk.json');
 const reconciledBody=JSON.parse(await fs.readFile(reconciled,'utf8'));
 check(!reconciledBody.session.pending&&reconciledBody.session.resolvedActions.some(x=>x.action==='apply'&&x.changeId===draft.id&&x.resolution?.outcome==='ACKNOWLEDGED'),'Later issue did not preserve the original acknowledged apply');

 const beforeIssueReplay=await current(issued.id);
 const retainedReview=await responseAction(button('preview-issue'),'/preview-issue');
 check(retainedReview.retainedCommand?.requestId===issued.id+'-issue','The original acknowledged issue review was not retained');
 check(!(await page.locator('[name="creditDecisionId"]').count()),'Retained issue decision became editable');
 await shot('10c-retained-issue-review-desktop');await shot('10d-retained-issue-review-phone',390);
 const sameIssue=await responseAction(button('issue'),'/issue');
 check(JSON.stringify(sameIssue.commands)===JSON.stringify(beforeIssueReplay.commands),'Original issue recovery changed acknowledged commands');
 await responseAction(button('refresh'),'/refresh');
 await shot('10-issued-correction-phone',390);await page.setViewportSize({width:1440,height:1000});await shot('11-issued-correction-desktop');
 const desk=await download(button('download-desk'),'complete-change-desk.json');
 const beforeOpen=await current(issued.id);
 // The control retains a safety download of the currently open desk before importing.
 const safety=page.waitForEvent('download');
 await page.locator('input[data-change-desk-file]').setInputFiles(desk);
 const retained=await safety;await retained.saveAs(path.join(out,'desk-before-reopen.json'));
 await page.waitForFunction(()=>document.querySelector('.change-message')?.textContent.includes('Opened'));
 const afterOpen=await current(issued.id);check(JSON.stringify(beforeOpen)===JSON.stringify(afterOpen),'Reopening the desk changed its native commands');
 await shot('12-reopened-desk-desktop');
 await download(button('export'),'complete-change-and-account.zip');
 await button('close').click();await page.locator('[data-ops-action="export"]').waitFor();
 await download(page.locator('[data-ops-action="export"]'),'complete-operations-case.zip');
 await point('complete-ui-exports-received',{changeId:issued.id,invoiceId:issued.activeInvoiceId});
 // View each linked actual issued rendition, including the preserved paid milestone.
 const creditCommand=recovered.commands.find(c=>c.action==='credit');
 const creditId=creditCommand?.result?.credit?.id||creditCommand?.result?.operation?.result?.creditId;
 check(typeof creditId==='string','Original native credit identity is absent');
 const documents=[
  {id:cfg.originalPaidInvoiceId,name:'invoice.html',label:'13-preserved-paid-invoice'},
  {id:cfg.originalOpenInvoiceId,name:'invoice.html',label:'14-credited-original-invoice'},
  {id:creditId,name:'credit.html',label:'15-actual-credit-note'},
  {id:issued.activeInvoiceId,name:'invoice.html',label:'16-replacement-invoice'}
 ];
 result.nativeDocuments=documents;
 for(const document of documents){
  await page.goto(cfg.nativeBaseUrl+'/documents/'+encodeURIComponent(document.id)+'/files/'+document.name,{waitUntil:'domcontentloaded'});
  await shot(document.label+'-desktop');await shot(document.label+'-phone',390);
 }
 check(!result.pageErrors.length,'Browser runtime errors: '+result.pageErrors.join('; '));
 result.state='BROWSER_COURSE_COMPLETE';result.pixelInspection='Actual PNGs retained for producing-agent visual inspection';await persist();
}
(async()=>{try{await main();}catch(error){result.state='BROWSER_COURSE_ERROR';result.error={message:error.message,stack:error.stack};await persist();process.exitCode=1;}finally{if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});console.log(JSON.stringify({phase:'BROWSER_FINISHED',state:result.state,output:out}));}})();
