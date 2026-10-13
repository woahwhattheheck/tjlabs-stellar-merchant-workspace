#!/usr/bin/env node
// MIT. Complete current SCF application receiving through its maintained server,
// editor, draft store and the original 7108 review. Run once on an owned host.
const fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const {createRequire}=require('node:module');
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const json=v=>JSON.stringify(v,null,2)+'\n';
const cfgPath=process.argv[2];
let currentStage='START',browserServer,browser,listener,output,page;
const stages=[],captures=[],downloads=[],errors=[];
async function write(name,body){await fs.mkdir(path.dirname(path.join(output,name)),{recursive:true});await fs.writeFile(path.join(output,name),body,{mode:0o600});return{name,bytes:Buffer.byteLength(body),sha256:sha(body)};}
async function stage(name,detail={}){currentStage=name;stages.push({name,at:new Date().toISOString(),...detail});await write('progress.json',json({operation:'SCF-GRANT-CURRENT-REVIEW-81CF-20261012',stages}));console.log('SCF_STAGE '+name);}
async function nativeProcessIdentity(pid){
  const base='/proc/'+pid;
  const [raw,boot,namespace]=await Promise.all([
    fs.readFile(base+'/stat','utf8'),fs.readFile('/proc/sys/kernel/random/boot_id','utf8'),fs.readlink(base+'/ns/pid')
  ]);
  const fields=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\s+/);
  return{pid,host_id:require('node:os').hostname(),boot_id:boot.trim(),pid_namespace:namespace,
    start_ticks:fields[19],parent_pid:Number(fields[1]),process_group_id:Number(fields[2]),
    session_id:Number(fields[3]),process_state:fields[0]};
}
async function settle(p,kind){
  const root=kind==='review'?'#review-workspace':'#workspace-root',error=kind==='review'?'#review-error':'#error';
  await p.waitForFunction(selector=>document.querySelector(selector)&&!document.querySelector(selector).inert,root,{timeout:30000});
  if(await p.locator(error).isVisible())throw Error(await p.locator(error).textContent());
}
async function choose(p,button,body,name){
  const waiting=p.waitForEvent('filechooser',{timeout:30000});
  await button.click();const chooser=await waiting;
  await chooser.setFiles({name,mimeType:'application/json',buffer:Buffer.from(body)});
}
async function download(p,button,name){
  const waiting=p.waitForEvent('download',{timeout:30000});await button.click();const d=await waiting;
  const stream=await d.createReadStream();need(stream,'Complete browser download unavailable: '+name);
  const parts=[];let total=0;for await(const part of stream){total+=part.length;need(total<=80*1024*1024,'Unexpected oversized download: '+name);parts.push(part);}
  need(!(await d.failure()),'Browser download failed: '+name);
  const body=Buffer.concat(parts),meta=await write('downloads/'+name,body);
  downloads.push({...meta,suggestedFilename:d.suggestedFilename()});await d.delete();return body;
}
async function screenshot(p,name,width=1440,height=1000){
  await p.setViewportSize({width,height});
  await p.evaluate(selector=>{window.scrollTo({top:0,left:0,behavior:'instant'});document.querySelector(selector)?.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});},name.startsWith('Review')?'#review-editor':'#editor');
  const dimensions=await p.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  const body=await p.screenshot({fullPage:false,animations:'disabled'});
  const meta=await write('captures/'+name+'.png',body);captures.push({...meta,width,height,dimensions});
  need(dimensions.document<=width+1&&dimensions.body<=width+1,'Horizontal page overflow: '+name+' '+JSON.stringify(dimensions));
}
async function savedDraft(p){
  await settle(p,'editor');
  const id=await p.locator('#workspace-root').getAttribute('data-saved-draft-id');need(id,'Save the current full submission draft');
  const record=await p.evaluate(async key=>(await import('./drafts.mjs')).loadDraft(key),id);
  need(record&&record.input,'Original draft store returned no saved record');return record;
}
async function savedReview(p){
  await settle(p,'review');
  const id=await p.locator('#review-workspace').getAttribute('data-review-record-id');need(id,'Save the current complete review');
  const record=await p.evaluate(async key=>(await import('./drafts.mjs')).loadDraft(key),id);
  need(record&&record.input,'Original review store returned no saved record');return record;
}
async function stop(){
  if(browser)await Promise.race([browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,5000))]);
  if(browserServer){await Promise.race([browserServer.close().catch(()=>{}),new Promise(r=>setTimeout(r,5000))]);const proc=browserServer.process();if(proc&&proc.exitCode===null)proc.kill('SIGKILL');}
  if(listener){listener.server.closeAllConnections?.();await Promise.race([listener.stop().catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);}
}
(async()=>{
  const cfg=JSON.parse(await fs.readFile(cfgPath,'utf8'));
  output=path.resolve(cfg.outputDirectory);await fs.mkdir(output,{recursive:true,mode:0o700});
  const root=path.resolve(cfg.sourceRoot),site=path.join(root,'stellar-forge/developer-site'),dist=path.join(site,'dist');
  process.env.TMPDIR=cfg.temporaryDirectory||process.env.TMPDIR;
  const req=createRequire(path.join(cfg.nodeModules,'playwright/package.json'));
  const {chromium}=req('playwright');
  const originalReviewPath=cfg.retainedReviewPath?path.join(path.dirname(root),cfg.retainedReviewPath):path.join(root,cfg.originalReviewPath);
  for(const f of cfg.files){const b=await fs.readFile(path.join(root,f.path));need(b.length===f.bytes&&sha(b)===f.sha256&&git(b)===f.git_blob,'Selected source changed: '+f.path);}
  await stage('complete-source-selected',{files:cfg.files.length,sourceCommit:cfg.sourceCommit,overlay:cfg.overlayBlob});
  const draftCore=await import(pathToFileURL(path.join(dist,'grant-submission-core.mjs')));
  const handover=await import(pathToFileURL(path.join(dist,'grant-handover-source.mjs')));
  const reviewCore=await import(pathToFileURL(path.join(dist,'grant-review-round-core.mjs')));
  const originalReviewText=await fs.readFile(originalReviewPath,'utf8'),originalRound=await reviewCore.importReviewRound(originalReviewText);
  const originalView=await reviewCore.reviewRoundView(originalRound);
  const originalDraftText=originalView.capture.exportText,originalDraft=JSON.parse(originalDraftText).draft;
  need(sha(originalDraftText)===cfg.originalDraftExportSHA256,'Retain the actual selected original complete draft');
  await handover.verifyHandover(originalDraft);
  await write('inputs/Original_Selected_Submission.json',originalDraftText);
  need(originalRound.id==='SCF-TECHNICAL-BUYER-REVIEW-7108-20261012'&&originalRound.events.length===cfg.originalReviewActions,'Retain the original complete reopened technical review');
  need(originalDraft.id==='scf-technical-buyer-draft-7108-20261012'&&originalDraft.fields.length===0,'Retain the original prepared draft and actual field mapping');
  const application=await fs.readFile(path.join(dist,'grant-data/application.md'),'utf8');
  const sourceIndex=JSON.parse(await fs.readFile(path.join(dist,'grant-data/source-index.json'),'utf8'));
  const currentAnswers=draftCore.parseAnswers(application);
  const {startGrantApplication}=await import(pathToFileURL(path.join(site,'grant.mjs')));
  listener=await startGrantApplication({port:cfg.port||0});
  const origin=new URL(listener.url).origin;
  browserServer=await chromium.launchServer({headless:true,executablePath:cfg.chromium,args:['--no-sandbox','--disable-dev-shm-usage'],env:{...process.env,TMPDIR:process.env.TMPDIR}});
  const launchedBrowser=browserServer.process();need(launchedBrowser&&launchedBrowser.pid,'Retain the actual launched browser process');
  await stage('browser-process-started',{owned_processes:[{
    owner:await nativeProcessIdentity(process.pid),process:await nativeProcessIdentity(launchedBrowser.pid)
  }]});
  browser=await chromium.connect(browserServer.wsEndpoint());
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  page=await context.newPage();
  page.on('pageerror',e=>errors.push({stage:currentStage,message:e.message}));
  page.on('dialog',dialog=>dialog.accept().catch(()=>{}));
  const previousOutput=path.resolve(cfg.previousOutputDirectory);
  const fullDraft=await fs.readFile(path.join(previousOutput,'downloads/Current_Complete_Submission.json'));
  const finalDraft=JSON.parse(fullDraft).draft;
  const retainedRecord=JSON.parse(await fs.readFile(path.join(previousOutput,'saved-submission-record.json'),'utf8'));
  need(same(retainedRecord.input,finalDraft),'Resume the actual saved complete current submission');
  need(finalDraft.id===originalDraft.id&&finalDraft.currentSource===sourceIndex.application.sha256,'Resume the selected original draft and current source');
  await handover.verifyHandover(finalDraft);
  for(const answer of currentAnswers)need(finalDraft.answers.find(row=>row.id===answer.id)?.text===answer.text,'Retained answer differs from the selected source: '+answer.id);
  const applicationReceiving=JSON.parse(await fs.readFile(path.join(previousOutput,'application/RESULT.json'),'utf8'));
  const companionReceiving=JSON.parse(await fs.readFile(path.join(previousOutput,'companion/companion-receiving.json'),'utf8'));
  need(applicationReceiving.status==='COMPLETE'&&companionReceiving.status==='complete','Retain the completed original reader and companion receiving');
  await stage('retained-readers-and-current-submission-selected',{previousOutput,recordId:retainedRecord.id,revision:retainedRecord.revision,bytes:fullDraft.length,sourceEditions:finalDraft.sources.length,authoredVersions:finalDraft.versions.length});
  const checkpointPath=path.join(output,'Current_Review_Checkpoint.json');
  let openedText=originalReviewText;
  try{openedText=await fs.readFile(checkpointPath,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  const openedRound=await reviewCore.importReviewRound(openedText);
  need(openedRound.id===originalRound.id&&same(openedRound.events.slice(0,originalRound.events.length),originalRound.events),'Checkpoint must preserve every original review action');
  let currentReviewRecord,currentRound,currentView;
  async function checkpoint(name){
    currentReviewRecord=await savedReview(page);currentRound=currentReviewRecord.input;
    need(currentRound.id===originalRound.id&&same(currentRound.events.slice(0,originalRound.events.length),originalRound.events),'A completed reviewer action changed the original history');
    const exported=await reviewCore.exportReviewRound(currentRound);
    await write('Current_Review_Checkpoint.json',exported);
    await write('current-review-checkpoint-record.json',json(currentReviewRecord));
    await stage(name,{roundId:currentRound.id,actions:currentRound.events.length,recordId:currentReviewRecord.id,revision:currentReviewRecord.revision});
    return currentReviewRecord;
  }
  await page.goto(origin+'/grant-review-round.html',{waitUntil:'load'});await settle(page,'review');
  await choose(page,page.locator('#review-open-round'),openedText,'Retained_Technical_Review.json');await settle(page,'review');
  await page.locator('#review-save-copy').click();await settle(page,'review');
  currentReviewRecord=await savedReview(page);currentRound=currentReviewRecord.input;
  need(same(currentRound,openedRound),'Initial receiving changed the complete retained review');
  currentView=await reviewCore.reviewRoundView(currentRound);
  const participant='TJLabs AI application reviewer 81CF';
  if(!currentView.participants.some(row=>row.label===participant)){
    await page.locator('details').filter({has:page.locator('summary').filter({hasText:'Add a named participant'})}).locator('summary').click();
    await page.locator('#review-new-participant').fill(participant);
    await page.locator('#review-add-person').click();await settle(page,'review');
  }
  await page.locator('#review-person').selectOption({label:participant});await settle(page,'review');
  await checkpoint('retained-review-participant-selected');
  currentView=await reviewCore.reviewRoundView(currentRound);
  if(!same(currentView.draft,finalDraft)){
    if(currentView.status==='COMPLETE'){
      await page.locator('#review-finish').click();await settle(page,'review');
      await page.locator('#review-reopen-note').fill('Receive the cumulative current application while retaining all earlier completed review actions and draft editions.');
      await page.getByRole('button',{name:'Reopen this review',exact:true}).click();await settle(page,'review');
    }
    await page.locator('[data-review-view="compare"]').click();await settle(page,'review');
    await choose(page,page.getByRole('button',{name:'Open revised full draft',exact:true}),fullDraft,'Current_Complete_Submission.json');await settle(page,'review');
    await page.getByRole('button',{name:'Carry all unchanged decisions forward',exact:true}).click();await settle(page,'review');
    await page.locator('#review-receive-note').fill('Receive the cumulative SCF application and complete source bundle from the saved current submission. Keep original decisions only where complete content and source context match; retain all earlier source editions and authored notes.');
    await page.getByRole('button',{name:'Receive this revised draft',exact:true}).click();await settle(page,'review');
    await checkpoint('current-full-draft-received-in-original-review');
  }
  currentView=await reviewCore.reviewRoundView(currentRound);
  need(same(currentView.draft,finalDraft),'The review must contain the exact saved current draft');
  const judgments=cfg.reviewDecisions,resolutions=cfg.reviewResolutions;
  need(Array.isArray(judgments)&&judgments.length===currentView.targets.length,'Supply the substantive current-source review for every target');
  const currentReviewer=currentView.participants.find(row=>row.label===participant);need(currentReviewer,'Retain the named current reviewer');
  const judgmentKeys=new Set();let decisionsAdded=0;
  for(const judgment of judgments){
    const key=judgment.target.kind+':'+judgment.target.id;
    need(!judgmentKeys.has(key),'Duplicate judgment: '+key);judgmentKeys.add(key);
    const selected=currentView.targets.find(row=>row.key===key);
    need(selected&&judgment.applicationSha256===sourceIndex.application.sha256,'Judgment selects a different application: '+key);
    need(['accepted','not-applicable'].includes(judgment.decision)&&judgment.note.trim().length>=50,'Retain the substantive reviewer judgment: '+key);
    const existing=currentView.decisions.find(row=>row.actorId===currentReviewer.id&&same(row.target,judgment.target));
    if(existing&&existing.decision===judgment.decision&&existing.note===judgment.note&&same(existing.references,judgment.references||[]))continue;
    need(currentView.status==='OPEN','Reopen the completed review before changing a recorded judgment');
    await page.locator('[data-target="'+key+'"]').click();await settle(page,'review');
    need(await page.getByLabel('Exact selected text',{exact:true}).inputValue()===selected.text,'Visible selected review text differs: '+key);
    await page.locator('#review-decision').selectOption(judgment.decision);
    await page.locator('#review-decision-note').fill(judgment.note);
    const decisionForm=page.locator('#review-decision-form');
    for(const ref of judgment.references||[]){
      await decisionForm.getByRole('button',{name:'Add supporting reference',exact:true}).click();
      const reference=decisionForm.locator('.review-reference').last();
      await reference.getByLabel('Reference label',{exact:true}).fill(ref.label);
      await reference.getByLabel('HTTPS source URL',{exact:true}).fill(ref.url);
      await reference.getByLabel('What this source shows',{exact:true}).fill(ref.note);
    }
    await decisionForm.getByRole('button',{name:'Record decision',exact:true}).click();await settle(page,'review');
    decisionsAdded++;
    if(decisionsAdded%3===0)await checkpoint('current-editorial-decisions-'+decisionsAdded);
  }
  await checkpoint('all-current-editorial-decisions-recorded');
  currentView=await reviewCore.reviewRoundView(currentRound);
  for(const judgment of judgments){
    const row=currentView.decisions.find(item=>item.actorId===currentReviewer.id&&same(item.target,judgment.target));
    need(row&&row.decision===judgment.decision&&row.note===judgment.note&&same(row.references,judgment.references||[]),'Recorded current judgment differs: '+JSON.stringify(judgment.target));
  }
  need(Array.isArray(resolutions)&&resolutions.length===5,'Retain the five original technical requests');
  await page.locator('[data-review-view="changes"]').click();await settle(page,'review');
  let resolutionsAdded=0;
  for(const resolution of resolutions){
    const change=currentView.changes.find(row=>row.id===resolution.changeId);
    need(change&&resolution.applicationSha256===sourceIndex.application.sha256,'Select the actual original request in this application edition');
    if(change.status==='resolved'&&change.resolutions.at(-1)?.note===resolution.note)continue;
    const card=page.locator('article[data-change-id="'+resolution.changeId+'"]');
    await card.getByText('Resolve or reopen the request',{exact:true}).click();
    const form=card.locator('form[data-resolve-for="'+resolution.changeId+'"]');
    need(await form.locator('select').count()===1&&await form.locator('label > span').first().textContent()==='Reviewer resolution','Select the original reviewer resolution control');
    await form.locator('select').selectOption('resolved');
    await form.getByLabel('Reviewer’s reason',{exact:true}).fill(resolution.note);
    await form.getByRole('button',{name:'Record review resolution',exact:true}).click();await settle(page,'review');
    resolutionsAdded++;
  }
  await checkpoint('original-technical-requests-resolved-for-current-source');
  currentView=await reviewCore.reviewRoundView(currentRound);
  for(const resolution of resolutions){
    const row=currentView.changes.find(item=>item.id===resolution.changeId);
    need(row?.status==='resolved'&&row.resolutions.at(-1).note===resolution.note,'Retained original resolution differs');
  }
  need(currentView.readiness.length===0,'Finish the remaining substantive review work: '+JSON.stringify(currentView.readiness));
  if(currentView.status!=='COMPLETE'){
    await page.locator('#review-finish').click();await settle(page,'review');
    await page.locator('#review-outcome').selectOption('ready-for-author-check');
    await page.locator('#review-finish-note').fill('All nine answers, the complete application and every original requirement have a recorded decision for this exact current source. The technical revisions, independent-use measurement, six prospective packages, customer commissioning roles and funding timing are integrated. The original review, complete draft editions, authored versions, working notes, and product/finance companion remain available for final form preparation.');
    await page.getByRole('button',{name:'Finish this review',exact:true}).click();await settle(page,'review');
  }
  await checkpoint('current-substantive-review-complete');
  currentView=await reviewCore.reviewRoundView(currentRound);
  need(currentView.status==='COMPLETE'&&currentView.readiness.length===0&&currentView.completion.outcome==='ready-for-author-check','Current editorial review did not finish');
  await write('current-editorial-decisions.json',json(judgments));
  await write('current-editorial-resolutions.json',json(resolutions));
  await screenshot(page,'Review_Ready_Desktop',1440,1000);await screenshot(page,'Review_Ready_Phone',390,844);
  const wholeReview=await download(page,page.locator('#review-export'),'Current_Complete_Review.json');
  need(same(await reviewCore.importReviewRound(wholeReview.toString('utf8')),currentRound),'Complete browser export changed review history');
  await download(page,page.locator('#review-report'),'Current_Review_Report.md');
  const selectedDraft=await download(page,page.locator('#review-draft-export'),'Review_Selected_Original_Draft.json');
  need(selectedDraft.equals(fullDraft),'Review did not reproduce the exact selected complete draft');
  await page.locator('[data-review-view="history"]').click();await settle(page,'review');
  await screenshot(page,'Review_History_Desktop',1440,1000);await screenshot(page,'Review_History_Phone',390,844);
  await write('saved-review-record.json',json(currentReviewRecord));
  await stage('complete-review-and-selected-draft-exported',{roundId:currentRound.id,originalActions:originalRound.events.length,actions:currentRound.events.length,originalEditions:originalRound.editions.length,editions:currentRound.editions.length});
  await context.close();
  const independent=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  const p2=await independent.newPage();p2.on('pageerror',e=>errors.push({stage:'independent-receiving',message:e.message}));
  await p2.goto(origin+'/grant-review-round.html',{waitUntil:'load'});await settle(p2,'review');
  await choose(p2,p2.locator('#review-open-round'),wholeReview,'Current_Complete_Review.json');await settle(p2,'review');
  await p2.locator('#review-save-copy').click();await settle(p2,'review');
  const independentRecord=await savedReview(p2);need(same(independentRecord.input,currentRound),'Independent browser changed the complete review');
  const independentReview=await download(p2,p2.locator('#review-export'),'Independently_Received_Review.json');
  need(same(await reviewCore.importReviewRound(independentReview.toString('utf8')),currentRound),'Independent complete review re-export differs');
  await p2.goto(origin+'/grant-submission.html',{waitUntil:'load'});await settle(p2,'editor');
  await choose(p2,p2.locator('#import-draft'),fullDraft,'Current_Complete_Submission.json');await settle(p2,'editor');
  await p2.locator('#save').click();await settle(p2,'editor');
  const independentDraft=await savedDraft(p2);
  need(independentDraft.input.id===finalDraft.id&&same(independentDraft.input.answers,finalDraft.answers)&&same(independentDraft.input.sources,finalDraft.sources),'Independent submission lost its content, notes or source');
  await write('independently-received-submission-record.json',json(independentDraft));
  await write('independently-received-review-record.json',json(independentRecord));
  await stage('independent-review-and-submission-receiving',{reviewRecordId:independentRecord.id,draftRecordId:independentDraft.id});
  need(errors.length===0,'Browser errors: '+JSON.stringify(errors));
  await write('RESULT.json',json({schema:'stellar-forge.current-application-receiving.v1',state:'COMPLETE',operationId:'SCF-GRANT-CURRENT-REVIEW-81CF-20261012',
    originalPublicationOperation:'SCF-GRANT-REVIEWER-PUBLICATION-8910-20261012',completedAt:new Date().toISOString(),sourceCommit:cfg.sourceCommit,overlayBlob:cfg.overlayBlob,
    sourceFiles:cfg.files.length,sourceRoutes:listener.assets,currentApplication:sourceIndex.application,originalDraftId:finalDraft.id,originalReviewId:currentRound.id,
    retainedOriginalActions:originalRound.events.length,reviewActions:currentRound.events.length,sourceEditions:finalDraft.sources.length,authoredVersions:finalDraft.versions.length,
    applicationReceiving,companionReceiving,reviewContinuation:{previousOutput,decisionsAdded,resolutionsAdded},stages,captures,downloads,browserErrors:errors}));
  console.log('SCF_CURRENT_REVIEW_COMPLETE '+JSON.stringify({output,originalDraftId:finalDraft.id,originalReviewId:currentRound.id,reviewActions:currentRound.events.length,captures:captures.length,downloads:downloads.length}));
})().catch(async error=>{
  console.error('SCF_CURRENT_REVIEW_FAILED '+JSON.stringify({stage:currentStage,message:error.message}));
  if(output){
    if(browser){
      const records=[];
      for(const context of browser.contexts())for(const openPage of context.pages()){
        let timer;
        try{
          const received=await Promise.race([openPage.evaluate(async()=>{
            const ids=[['submission',document.querySelector('#workspace-root')?.getAttribute('data-saved-draft-id')],
              ['review',document.querySelector('#review-workspace')?.getAttribute('data-review-record-id')]].filter(([,id])=>id);
            if(!ids.length)return[];
            const {loadDraft}=await import('./drafts.mjs'),saved=[];
            for(const [kind,id]of ids){const record=await loadDraft(id);if(record)saved.push({kind,record});}
            return saved;
          }),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Preserve the current browser records timed out')),5000);})]);
          records.push({url:openPage.url(),records:received});
        }catch(retainError){records.push({url:openPage.url(),error:retainError.message});}
        finally{clearTimeout(timer);}
      }
      await write('partial-saved-browser-records.json',json(records)).catch(()=>{});
    }
    await write('INCOMPLETE.json',json({stage:currentStage,error:error.message,stack:error.stack,stages,captures,downloads,browserErrors:errors})).catch(()=>{});
    if(page){await page.screenshot({path:path.join(output,'Failure.png'),fullPage:false}).catch(()=>{});await fs.writeFile(path.join(output,'Failure.html'),await page.content().catch(()=>''),{mode:0o600}).catch(()=>{});}
  }
  process.exitCode=1;
}).finally(stop);
