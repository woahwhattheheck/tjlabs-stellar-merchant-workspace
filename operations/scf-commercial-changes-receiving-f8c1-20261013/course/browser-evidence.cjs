'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const cfg=JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'));
const out=cfg.output;let browser,context;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),enc=encodeURIComponent;
const result={schema:'commons.scf-billing-evidence-browser.v1',state:'STARTING',checkpoints:[],screenshots:[],downloads:[],renderedDocuments:[],pageErrors:[],responses:[]};
const check=(v,m)=>{if(!v)throw Error(m);};
async function persist(){await fs.writeFile(path.join(out,'browser-result.json'),JSON.stringify(result,null,2)+'\n');}
async function recordFile(filename){const b=await fs.readFile(path.join(out,filename));return{path:filename,bytes:b.length,sha256:hash(b)};}
async function main(){
 await fs.mkdir(out,{recursive:true});
 for(const key of ['origin','token','caseId','reviewId','chrome','playwright','output','actor'])check(typeof cfg[key]==='string'&&cfg[key].length,'Missing original evidence configuration '+key);
 check(Number.isSafeInteger(cfg.revision)&&cfg.revision>0,'Retain the actual saved evidence revision');
 const {chromium}=require(cfg.playwright);
 browser=await chromium.launch({executablePath:cfg.chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update'],timeout:90000});
 context=await browser.newContext({viewport:{width:1365,height:1000},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',e=>result.pageErrors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(cfg.origin+'/api/'))result.responses.push({path:new URL(r.url()).pathname,status:r.status(),method:r.request().method()});});
 const base='/api/operations/'+enc(cfg.caseId)+'/billing-evidence';
 const desk=()=>page.locator('.billing-evidence'),button=a=>desk().locator('[data-be-action="'+a+'"]');
 async function point(name,value={}){result.checkpoints.push({name,at:new Date().toISOString(),...value});await persist();}
 async function idle(){await page.waitForFunction(()=>document.querySelector('.billing-evidence')?.getAttribute('aria-busy')==='false');}
 async function reveal(el){const parents=el.locator('xpath=ancestor::details');for(let i=0;i<await parents.count();i++){const d=parents.nth(i);if(await d.getAttribute('open')===null)await d.locator(':scope > summary').click();}}
 async function action(a,allowError=false){await reveal(button(a));await button(a).click();await idle();const e=desk().locator('.be-error');if(!allowError&&await e.count()&&(await e.innerText()).trim())throw Error(a+': '+await e.innerText());}
 async function get(url){const r=await page.request.get(cfg.origin+url);check(r.ok(),'Original read failed '+url+' '+r.status());return r.json();}
 async function shot(name,width){
  await page.setViewportSize({width,height:width===390?844:1000});
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(120);
  const metrics=await page.evaluate(()=>{
   const vw=document.documentElement.clientWidth;const escape=[];
   for(const el of document.querySelectorAll('body *')){const r=el.getBoundingClientRect(),s=getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden'||r.width===0||r.right<=vw+1||r.left<0)continue;
    let clipped=false;for(let p=el.parentElement;p;p=p.parentElement)if(['auto','scroll','hidden','clip'].includes(getComputedStyle(p).overflowX)){clipped=true;break;}
    if(!clipped&&escape.length<12)escape.push({tag:el.tagName,text:el.textContent.slice(0,100),right:r.right});
   }
   const labels=[...document.querySelectorAll('.billing-evidence h2,.billing-evidence h3,.billing-evidence button,.billing-evidence label')].slice(0,30).map(el=>({text:el.textContent.slice(0,70),color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
   return {width:vw,scroll:document.documentElement.scrollWidth,escape,labels};
  });
  check(metrics.scroll<=width+1&&!metrics.escape.length,'Horizontal overflow in '+name+': '+JSON.stringify(metrics));
  const filename=name+'.png';await page.screenshot({path:path.join(out,filename),fullPage:true});
  result.screenshots.push({...await recordFile(filename),width,metrics});await persist();
 }
 async function downloadAction(a,filename){
  const waiting=page.waitForEvent('download');await action(a);const d=await waiting;await d.saveAs(path.join(out,filename));check(!(await d.failure()),'Download failed '+filename);
  result.downloads.push({...await recordFile(filename),suggestedFilename:d.suggestedFilename()});await persist();return path.join(out,filename);
 }
 await page.goto(cfg.origin+'/#access='+cfg.token,{waitUntil:'domcontentloaded'});
 await page.locator('#plan-select').waitFor();
 const originalCase=await get('/api/operations/'+enc(cfg.caseId));
 check(originalCase.program?.id===cfg.caseId&&originalCase.program?.planId,'Select the retained original case and plan');
 await page.locator('#plan-select').selectOption(originalCase.program.planId);
 await page.locator('[data-tab="operations"]').click();
 await page.locator('[name="caseSelect"]').selectOption(cfg.caseId);
 await page.locator('[name="recordingActor"]').fill(cfg.actor);
 const nav=page.locator('[data-nav-section="billing-evidence"]');await nav.waitFor({state:'attached'});await reveal(nav);
 if(!(await nav.isVisible())){const toggle=page.locator('[data-nav-toggle]');if(await toggle.isVisible())await toggle.click();}
 await nav.click();await desk().waitFor();await page.waitForFunction(()=>document.querySelector('.billing-evidence [name="accountKey"]'));await idle();
 const original=await get(base+'/'+enc(cfg.reviewId)+'?revision='+cfg.revision);
 result.original={reviewId:cfg.reviewId,revision:cfg.revision,sourceSha256:original.source.sha256};
 await desk().locator('[data-be-action="load"][data-review-id="'+cfg.reviewId+'"][data-revision="'+cfg.revision+'"]').click();await idle();
 await action('compare');await point('saved-current-comparison');
 await shot('01-saved-evidence-desktop',1365);await shot('02-saved-evidence-phone',390);
 await action('revise');
 const selectedCards=desk().locator('[data-be-item]').filter({has:page.locator('[data-item-field="selected"]:checked')});
 check(await selectedCards.count()>=3,'Retain actual milestone, expense and Work evidence');
 const first=selectedCards.first();
 await first.locator('[data-item-field="shareDescriptions"]').uncheck();
 await first.locator('[data-item-field="shareQuantities"]').uncheck();
 await action('preview');
 check(await button('save').isEnabled(),'Actual selected preview is saveable');
 await first.locator('[data-item-field="shareQuantities"]').check();
 check(await button('save').isDisabled(),'A disclosure change must invalidate the reviewed preview');
 await first.locator('[data-item-field="shareQuantities"]').uncheck();
 await action('preview');
 await desk().locator('[name="actor"]').fill(cfg.actor);
 check(await button('save').isEnabled(),'Recording actor does not change the reviewed selection');
 let originalRequest=null,committed=null;
 await page.route('**'+base+'/save',async route=>{
  if(originalRequest){await route.continue();return;}
  originalRequest=route.request().postDataJSON();
  const response=await route.fetch();committed={status:response.status(),body:await response.json()};
  await fs.writeFile(path.join(out,'original-save-response.json'),JSON.stringify({request:originalRequest,response:committed},null,2)+'\n');
  if(!response.ok()){await route.fulfill({response});return;}
  await route.abort('failed');
 });
 await action('save',true);
 check(committed&&committed.status>=200&&committed.status<300,'The actual evidence save was refused: '+JSON.stringify(committed));
 check(await button('resume').count()===1,'Lost response retained the original evidence request');
 const replay=page.waitForRequest(r=>new URL(r.url()).pathname===base+'/save'&&r.method()==='POST');
 await action('resume');
 check(JSON.stringify((await replay).postDataJSON())===JSON.stringify(originalRequest),'Replay must use the unchanged complete original save body');
 await page.unroute('**'+base+'/save');
 const receipt=committed.body;
 check(receipt.reviewId===cfg.reviewId&&receipt.revision===cfg.revision+1,'Original evidence review receives one successor revision');
 const frozen=await get(base+'/'+enc(receipt.reviewId)+'?revision='+receipt.revision);
 check(frozen.record.id===receipt.reviewId&&frozen.record.revision===receipt.revision,'Saved evidence opens by exact revision');
 check((await get(base+'/'+enc(cfg.reviewId)+'?revision='+cfg.revision)).source.sha256===result.original.sourceSha256,'The original saved source edition remains unchanged');
 result.saved=receipt;
 await fs.writeFile(path.join(out,'final-saved-evidence.json'),JSON.stringify(frozen,null,2)+'\n');
 await point('original-save-response-loss-recovered',{receipt});
 const customerZip=await downloadAction('customer-export','customer-billing-evidence.zip');
 await downloadAction('internal-export','complete-billing-evidence.zip');
 await downloadAction('save-desk','billing-evidence-working-desk.json');
 await desk().locator('[data-be-inspect]').setInputFiles(customerZip);await idle();
 check((await desk().innerText()).includes('Reopened ZIP — read only'),'Downloaded customer evidence is independently inspectable');
 check((await desk().innerText()).includes('contains no Operations case'),'Customer inspection cannot receive a private operating case');
 await shot('03-customer-inspection-desktop',1365);await shot('04-customer-inspection-phone',390);
 await desk().locator('[data-be-inspect]').setInputFiles(path.join(out,'complete-billing-evidence.zip'));await idle();
 check((await desk().innerText()).includes('full internal case can be received'),'Complete private evidence ZIP retains native case receiving');
 await page.emulateMedia({colorScheme:'dark'});
 await page.addStyleTag({content:'body{background:#14191f!important;color:#f0f3f6!important}'});
 await shot('05-evidence-dark-context-desktop',1365);await shot('06-evidence-dark-context-phone',390);
 const completeExport=page.locator('[data-ops-action="export"]');check(await completeExport.count()===1,'Original Operations export control missing');
 const waiting=page.waitForEvent('download');await reveal(completeExport);await completeExport.click();const d=await waiting;await d.saveAs(path.join(out,'complete-operations-case.zip'));check(!(await d.failure()),'Complete original case export failed');
 result.downloads.push(await recordFile('complete-operations-case.zip'));
 await point('complete-case-and-both-evidence-audiences-exported');
 // Reopen the actual downloaded report and issued native HTML members with no model substitute.
 const extract=String.raw`
import hashlib,json,pathlib,stat,sys,zipfile
archive=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(mode=0o700,parents=True,exist_ok=True)
rows=[]
with zipfile.ZipFile(archive) as z:
 infos=z.infolist();names=[i.filename for i in infos]
 if len(names)!=len(set(names)) or len(names)>1600 or sum(i.file_size for i in infos)>64*1024*1024:raise ValueError("Invalid complete archive inventory")
 for info in infos:
  p=pathlib.PurePosixPath(info.filename)
  if p.is_absolute() or ".." in p.parts or "\\" in info.filename or stat.S_ISLNK(info.external_attr>>16):raise ValueError("Invalid original member path")
  if info.is_dir():continue
  content=z.read(info);target=out.joinpath(*p.parts)
  target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
  if info.filename=="report.html" or (info.filename.startswith("native/documents/") and info.filename.endswith(".html")):
   rows.append({"member":info.filename,"path":str(target),"bytes":len(content),"sha256":hashlib.sha256(content).hexdigest()})
rows.sort(key=lambda r:r["member"]!="report.html")
if not rows or rows[0]["member"]!="report.html":raise ValueError("Original report is absent")
print(json.dumps(rows))
`;
 const extracted=spawnSync(cfg.python||'python3',['-B','-c',extract,customerZip,path.join(out,'rendered-original-documents')],{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
 await fs.writeFile(path.join(out,'html-extraction.stdout'),extracted.stdout||'');await fs.writeFile(path.join(out,'html-extraction.stderr'),extracted.stderr||'');
 check(!extracted.error&&extracted.status===0,'Original downloaded HTML extraction failed: '+(extracted.error?.message||extracted.stderr));
 const docs=JSON.parse(extracted.stdout);check(docs.length>=2,'Retain the actual report and original native invoice/credit documents');
 await page.emulateMedia({colorScheme:'light'});
 const report=docs.find(d=>d.member==='report.html'),reportUrl=pathToFileURL(report.path).href;
 await page.goto(reportUrl,{waitUntil:'domcontentloaded'});
 const links=await page.locator('a[href]').evaluateAll(all=>all.map(a=>a.getAttribute('href')));
 result.reportLinks=[];
 for(const href of links){
  check(typeof href==='string'&&!/^(?:[a-z]+:|\/|\\)/i.test(href),'Report link must retain its original relative member path');
  const target=path.resolve(path.dirname(report.path),href),root=path.resolve(path.dirname(report.path))+path.sep;
  check(target.startsWith(root),'Report link escapes original extracted customer package');
  const b=await fs.readFile(target);result.reportLinks.push({href,path:path.relative(out,target),bytes:b.length,sha256:hash(b)});
 }
 for(let i=0;i<docs.length;i++){
  const doc=docs[i],bytes=await fs.readFile(doc.path);check(hash(bytes)===doc.sha256,'Original rendered member differs');
  if(doc.member==='report.html')await page.goto(reportUrl,{waitUntil:'domcontentloaded'});
  else{
   await page.goto(reportUrl,{waitUntil:'domcontentloaded'});
   const exact=page.locator('a[href="'+doc.member.replace(/"/g,'\\"')+'"]');
   check(await exact.count()>=1,'Original report links every retained invoice/credit HTML: '+doc.member);
   await exact.first().click();await page.waitForURL(pathToFileURL(doc.path).href);
  }
  check((await page.locator('body').innerText()).trim().length>20,'Original document rendered empty');
  await shot('document-'+String(i).padStart(2,'0')+'-desktop',1365);await shot('document-'+String(i).padStart(2,'0')+'-phone',390);
  result.renderedDocuments.push({...doc,path:path.relative(out,doc.path)});await persist();
 }
 check(!result.pageErrors.length,'Actual page runtime errors: '+result.pageErrors.join('; '));
 result.state='COMPLETE';result.reviewId=receipt.reviewId;result.revision=receipt.revision;
 result.pixelInspection='The producing agent must personally open and LOOK at every saved PNG and actual customer/internal archive, report and native document before rendered delivery is complete.';
 await persist();
}
(async()=>{try{await main();}catch(error){result.state='BROWSER_COURSE_ERROR';result.error={message:error.message,stack:error.stack};await persist();process.exitCode=1;}finally{if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});console.log(JSON.stringify({phase:'BILLING_EVIDENCE_BROWSER_FINISHED',state:result.state,output:out}));}})();
