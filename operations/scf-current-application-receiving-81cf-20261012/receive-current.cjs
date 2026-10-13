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
  await page.goto(origin+'/grant.html',{waitUntil:'load'});
  const {inspectGrantApplication}=await import(pathToFileURL(path.join(site,'GRANT_RECEIVING.mjs')));
  const example='/examples/fred-briefing-20261012/',report=example+'stellar/scf-starforge-20261009/sf30-seller-sdk/fred/examples/briefing-20261012/';
  const pinnedRoutes=['/grant.html','/grant.css','/grant-data/application.md','/grant-data/budget.csv','/grant-data/product-and-finance.md','/grant-data/source-index.json',
    report+'briefing.html',report+'briefing-measures.csv',report+'briefing.json',example+'START_HERE.md',example+'package-manifest.json',example+'stellar-forge-economic-briefing-20261012.zip'];
  const sourcePins={};for(const route of pinnedRoutes)sourcePins[route]=git(await fs.readFile(path.join(dist,route.slice(1))));
  const applicationReceiving=await inspectGrantApplication(page,{sourceRoot:root,outputDirectory:path.join(output,'application'),expectedOrigin:origin,
    sourceCommit:cfg.sourceCommit,sourcePins,operationId:'SCF-GRANT-CURRENT-REVIEW-81CF-20261012',readPublishedFilm:false,printPdf:true});
  await stage('complete-reader-and-economic-report',{status:applicationReceiving.status,artifacts:applicationReceiving.artifacts.length,origin,routes:listener.assets});
  const {receiveGrantCompanion}=await import(pathToFileURL(path.join(__dirname,'receive-companion.mjs')));
  const companionReceiving=await receiveGrantCompanion(page,{sourceRoot:root,expectedOrigin:origin,outputDirectory:path.join(output,'companion'),
    sourceCommit:cfg.sourceCommit,markdownText:await fs.readFile(path.join(dist,'grant-data/product-and-finance.md'),'utf8'),
    indexText:await fs.readFile(path.join(dist,'grant-data/source-index.json'),'utf8')});
  need(companionReceiving.status==='complete','Receive the whole current companion through its hosted reader and independent offline file');
  await stage('complete-companion-reader-and-offline-handover',{status:companionReceiving.status,chapters:companionReceiving.source.chapters,
    tables:companionReceiving.source.tables,codeBlocks:companionReceiving.source.codeBlocks,artifacts:companionReceiving.artifacts.length});
  await page.goto(origin+'/grant-submission.html',{waitUntil:'load'});await settle(page,'editor');
  await choose(page,page.locator('#import-draft'),originalDraftText,'Original_Technical_Submission.json');await settle(page,'editor');
  const note=originalDraft.answers.find(x=>x.id==='project').note+'\n\n81CF editorial receiving: retain the current T2 same-service testnet facilitator scope and both merchant mainnet installations in T3. The cumulative canonical edition incorporates the completed technical review.';
  await page.locator('#view').selectOption('answers');await settle(page,'editor');
  const selectedProject=currentAnswers.find(answer=>answer.id==='project');
  need(selectedProject.text!==originalDraft.answers.find(answer=>answer.id==='project').baseText,'Receive the actual phase-scope author change');
  await page.getByLabel('Draft answer',{exact:true}).fill(selectedProject.text);
  await page.getByLabel('Working note',{exact:true}).fill(note);
  await page.locator('#save').click();await settle(page,'editor');
  const before=await savedDraft(page);need(before.input.id===originalDraft.id,'Original draft identity changed');
  await download(page,page.locator('#export-draft'),'Prior_Authored_Draft.json');
  await page.locator('#refresh-source').click();await settle(page,'editor');
  await page.getByRole('button',{name:'Receive source and keep edited answers',exact:true}).click();await settle(page,'editor');
  await page.locator('#save').click();await settle(page,'editor');
  const received=await savedDraft(page);
  for(const prior of before.input.answers)if(prior.text!==prior.baseText)need(received.input.answers.find(x=>x.id===prior.id).text===prior.text,'Source reception replaced the authored answer: '+prior.id);
  need(received.input.answers.find(x=>x.id==='project').note===note,'Working note lost while receiving source');
  need(received.input.currentSource===sourceIndex.application.sha256,'Current source selection was not received');
  await download(page,page.locator('#export-draft'),'Received_Source_With_Authored_Answers.json');
  await stage('source-received-with-edits-and-notes',{draftId:received.input.id,sources:received.input.sources.length,versions:received.input.versions.length});
  // Select the already reviewed current canonical answers through each original
  // comparison control. Every preceding authored state remains in Saved versions.
  for(const answer of currentAnswers){
    const row=received.input.answers.find(x=>x.id===answer.id);
    if(row.text===answer.text&&row.baseText===answer.text)continue;
    const details=page.locator('#editor > details').filter({has:page.locator('summary').filter({hasText:draftCore.ANSWERS.find(x=>x[0]===answer.id)[1]+' ·'})});
    need(await details.count()===1,'Select the unique source comparison for '+answer.id);
    await details.locator('summary').click();
    await details.getByRole('button',{name:'Use current source for this answer',exact:true}).click();await settle(page,'editor');
  }
  await page.locator('#save').click();await settle(page,'editor');
  const finalRecord=await savedDraft(page),finalDraft=finalRecord.input;
  for(const answer of currentAnswers)need(finalDraft.answers.find(x=>x.id===answer.id).text===answer.text,'Current complete answer differs: '+answer.id);
  need(finalDraft.answers.find(x=>x.id==='project').note===note&&finalDraft.sources.length>=2&&finalDraft.versions.length>before.input.versions.length,'Complete source and authored history were not retained');
  const fullDraft=await download(page,page.locator('#export-draft'),'Current_Complete_Submission.json');
  need(JSON.parse(fullDraft).sha256===sha(JSON.stringify(finalDraft)),'Downloaded submission differs from its saved record');
  await page.locator('#view').selectOption('answers');await page.locator('#format').selectOption('markdown');await settle(page,'editor');
  const answerDownload=await download(page,page.locator('#export-answers'),'Current_Application_Answers.md');
  need(answerDownload.toString('utf8')===draftCore.applicationOutput(finalDraft,{format:'markdown'}),'Answer download differs from the actual prepared answers');
  await screenshot(page,'Submission_Desktop',1440,1000);await screenshot(page,'Submission_Phone',390,844);
  await page.reload({waitUntil:'load'});await settle(page,'editor');
  await page.locator('#view').selectOption('saved');await settle(page,'editor');
  await page.locator('#editor article[data-saved-draft-id="'+finalRecord.id+'"]').getByRole('button',{name:'Open this draft',exact:true}).click();await settle(page,'editor');
  const reopenedDraft=await savedDraft(page);need(same(reopenedDraft.input,finalDraft),'Browser draft reopening changed the complete saved state');
  await write('saved-submission-record.json',json(reopenedDraft));
  await stage('current-draft-copied-and-reopened',{recordId:finalRecord.id,revision:finalRecord.revision,answers:finalDraft.answers.length,fields:finalDraft.fields.length});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(origin+'/grant-review-round.html',{waitUntil:'load'});await settle(page,'review');
  await choose(page,page.locator('#review-open-round'),originalReviewText,'Original_Reopened_Technical_Review.json');await settle(page,'review');
  await page.locator('#review-save-copy').click();await settle(page,'review');
  const initialReviewRecord=await savedReview(page);
  need(same(initialReviewRecord.input,originalRound),'Original review changed during initial browser receiving');
  const participant='TJLabs AI application reviewer 81CF';
  if(!originalView.participants.some(row=>row.label===participant)){
    await page.locator('details').filter({has:page.locator('summary').filter({hasText:'Add a named participant'})}).locator('summary').click();
    await page.locator('#review-new-participant').fill(participant);await page.locator('#review-add-person').click();await settle(page,'review');
  }
  await page.locator('#review-person').selectOption({label:participant});await settle(page,'review');
  if(originalView.status==='COMPLETE'){
    await page.locator('#review-finish').click();await settle(page,'review');
    await page.locator('#review-reopen-note').fill('Receive and review the cumulative published application while retaining the complete earlier review and every authored source edition.');
    await page.getByRole('button',{name:'Reopen this review',exact:true}).click();await settle(page,'review');
  }
  await page.locator('[data-review-view="compare"]').click();await settle(page,'review');
  await choose(page,page.getByRole('button',{name:'Open revised full draft',exact:true}),fullDraft,'Current_Complete_Submission.json');await settle(page,'review');
  await page.getByRole('button',{name:'Carry all unchanged decisions forward',exact:true}).click();await settle(page,'review');
  await page.locator('#review-receive-note').fill('Receive the current cumulative SCF #46 application and complete source bundle. The current customer, Stellar, tranche, counting and payment terms retain the completed technical changes. Keep original decisions only where the complete content and source context match.');
  await screenshot(page,'Review_Comparison_Desktop',1440,1000);await screenshot(page,'Review_Comparison_Phone',390,844);
  await page.getByRole('button',{name:'Receive this revised draft',exact:true}).click();await settle(page,'review');
  let currentReviewRecord=await savedReview(page),currentRound=currentReviewRecord.input;
  need(currentRound.id===originalRound.id&&same(currentRound.events.slice(0,originalRound.events.length),originalRound.events),'Original review history was replaced');
  let currentView=await reviewCore.reviewRoundView(currentRound);
  need(currentView.draft.id===finalDraft.id&&same(currentView.draft,finalDraft),'Current review does not contain the complete prepared draft');
  // Record the completed current-source editorial review through the actual UI.
  // Each supplied judgment was prepared against the full immutable application.
  const judgments=cfg.reviewDecisions;
  need(Array.isArray(judgments)&&judgments.length===currentView.targets.length,'Supply the completed substantive review for every current target');
  const judgmentKeys=new Set();let recordedJudgments=0;
  async function saveCurrentReviewCheckpoint(){
    const selected=await savedReview(page);
    need(same(selected.input.events.slice(0,originalRound.events.length),originalRound.events),'Retain the complete preceding review during continuation');
    await write('review-continuation/Current_Review_Checkpoint.json',await reviewCore.exportReviewRound(selected.input));
    await write('review-continuation/current-review-checkpoint-record.json',json(selected));
  }
  for(const judgment of judgments){
    const key=judgment.target.kind+':'+judgment.target.id;
    need(!judgmentKeys.has(key),'Duplicate editorial judgment: '+key);judgmentKeys.add(key);
    const selected=currentView.targets.find(row=>row.key===key);
    need(selected&&judgment.applicationSha256===sourceIndex.application.sha256,'Review judgment selects a different application edition: '+key);
    need(['accepted','not-applicable'].includes(judgment.decision)&&judgment.note.trim().length>=50,'Record the substantive selected reviewer judgment: '+key);
    await page.locator('[data-target="'+key+'"]').click();await settle(page,'review');
    need(await page.getByLabel('Exact selected text',{exact:true}).inputValue()===selected.text,'The visible selected review text changed: '+key);
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
    if(++recordedJudgments%3===0)await saveCurrentReviewCheckpoint();
  }
  await saveCurrentReviewCheckpoint();
  currentReviewRecord=await savedReview(page);currentRound=currentReviewRecord.input;
  currentView=await reviewCore.reviewRoundView(currentRound);
  const currentReviewer=currentView.participants.find(row=>row.label===participant);need(currentReviewer,'Retain the named current reviewer');
  for(const judgment of judgments){
    const row=currentView.decisions.find(item=>item.actorId===currentReviewer.id&&same(item.target,judgment.target));
    need(row&&row.decision===judgment.decision&&row.note===judgment.note&&same(row.references,judgment.references||[]),'The recorded current editorial decision differs: '+JSON.stringify(judgment.target));
  }
  const resolutions=cfg.reviewResolutions;
  need(Array.isArray(resolutions)&&resolutions.length===5,'Supply the substantive renewed resolutions for the five original requests');
  await page.locator('[data-review-view="changes"]').click();await settle(page,'review');
  for(const resolution of resolutions){
    const change=currentView.changes.find(row=>row.id===resolution.changeId);
    need(change&&resolution.applicationSha256===sourceIndex.application.sha256,'Select the actual original request in this source edition');
    const card=page.locator('article[data-change-id="'+resolution.changeId+'"]');
    await card.getByText('Resolve or reopen the request',{exact:true}).click();
    const form=card.locator('form[data-resolve-for="'+resolution.changeId+'"]');
    need(await form.locator('select').count()===1&&await form.locator('label > span').first().textContent()==='Reviewer resolution','Select the original reviewer resolution control');
    await form.locator('select').selectOption('resolved');
    await form.getByLabel('Reviewer’s reason',{exact:true}).fill(resolution.note);
    await form.getByRole('button',{name:'Record review resolution',exact:true}).click();await settle(page,'review');
    await saveCurrentReviewCheckpoint();
  }
  currentReviewRecord=await savedReview(page);currentRound=currentReviewRecord.input;
  currentView=await reviewCore.reviewRoundView(currentRound);
  for(const resolution of resolutions){
    const row=currentView.changes.find(item=>item.id===resolution.changeId);
    need(row?.status==='resolved'&&row.resolutions.at(-1).note===resolution.note,'Current original request resolution differs');
  }
  await write('current-editorial-resolutions.json',json(resolutions));
  need(currentView.readiness.length===0,'Complete the actual remaining review work: '+JSON.stringify(currentView.readiness));
  await page.locator('#review-finish').click();await settle(page,'review');
  await page.locator('#review-outcome').selectOption('ready-for-author-check');
  await page.locator('#review-finish-note').fill('The current cumulative SCF #46 application has a recorded editorial decision for all nine answers, the complete application and each original requirement. The author-selected technical revisions, independent-use measurement, six prospective work packages, customer commissioning roles and payment timing are integrated in this exact source edition. The complete original review, source editions, authored versions, working notes and customer/finance companion remain available for the applicant’s final form preparation.');
  await page.getByRole('button',{name:'Finish this review',exact:true}).click();await settle(page,'review');
  await saveCurrentReviewCheckpoint();
  currentReviewRecord=await savedReview(page);currentRound=currentReviewRecord.input;
  currentView=await reviewCore.reviewRoundView(currentRound);
  need(currentView.status==='COMPLETE'&&currentView.readiness.length===0,'The current substantive editorial review did not finish');
  need(same(currentRound.events.slice(0,originalRound.events.length),originalRound.events),'Editorial receiving changed the original review history');
  await screenshot(page,'Review_Ready_Desktop',1440,1000);await screenshot(page,'Review_Ready_Phone',390,844);
  await write('current-editorial-decisions.json',json(judgments));
  await stage('current-substantive-review-complete',{targets:judgments.length,roundId:currentRound.id,actions:currentRound.events.length,outcome:currentView.completion.outcome});
  const wholeReview=await download(page,page.locator('#review-export'),'Current_Complete_Review.json');
  const decodedReview=await reviewCore.importReviewRound(wholeReview.toString('utf8'));need(same(decodedReview,currentRound),'Complete browser review export changed its original history');
  await download(page,page.locator('#review-report'),'Current_Review_Report.md');
  const selectedDraft=await download(page,page.locator('#review-draft-export'),'Review_Selected_Original_Draft.json');
  need(selectedDraft.equals(fullDraft),'Review did not reproduce the original selected full draft bytes');
  await page.locator('[data-review-view="history"]').click();await settle(page,'review');
  await screenshot(page,'Review_History_Desktop',1440,1000);await screenshot(page,'Review_History_Phone',390,844);
  await write('saved-review-record.json',json(currentReviewRecord));
  await stage('original-review-received-current-author',{roundId:currentRound.id,originalActions:originalRound.events.length,actions:currentRound.events.length,originalEditions:originalRound.editions.length,editions:currentRound.editions.length});
  // An independent browser store receives the actual complete UI export.
  const independent=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  const p2=await independent.newPage();p2.on('pageerror',e=>errors.push({stage:'independent-receiving',message:e.message}));
  await p2.goto(origin+'/grant-review-round.html',{waitUntil:'load'});await settle(p2,'review');
  await choose(p2,p2.locator('#review-open-round'),wholeReview,'Current_Complete_Review.json');await settle(p2,'review');
  await p2.locator('#review-save-copy').click();await settle(p2,'review');
  const independentRecord=await savedReview(p2);need(same(independentRecord.input,currentRound),'Independent browser receiving changed the complete review');
  const independentReview=await download(p2,p2.locator('#review-export'),'Independently_Received_Review.json');
  need(same(await reviewCore.importReviewRound(independentReview.toString('utf8')),currentRound),'Independent complete review re-export differs');
  await p2.goto(origin+'/grant-submission.html',{waitUntil:'load'});await settle(p2,'editor');
  await choose(p2,p2.locator('#import-draft'),fullDraft,'Current_Complete_Submission.json');await settle(p2,'editor');
  await p2.locator('#save').click();await settle(p2,'editor');
  const independentDraft=await savedDraft(p2);
  need(independentDraft.input.id===finalDraft.id&&same(independentDraft.input.answers,finalDraft.answers)&&same(independentDraft.input.sources,finalDraft.sources),'Independent submission receiving lost content, notes or source');
  await write('independently-received-submission-record.json',json(independentDraft));
  await write('independently-received-review-record.json',json(independentRecord));
  await stage('independent-review-and-submission-receiving',{reviewRecordId:independentRecord.id,draftRecordId:independentDraft.id});
  need(errors.length===0,'Browser errors were reported: '+JSON.stringify(errors));
  await write('RESULT.json',json({schema:'stellar-forge.current-application-receiving.v1',state:'COMPLETE',operationId:'SCF-GRANT-CURRENT-REVIEW-81CF-20261012',
    originalPublicationOperation:'SCF-GRANT-REVIEWER-PUBLICATION-8910-20261012',completedAt:new Date().toISOString(),sourceCommit:cfg.sourceCommit,overlayBlob:cfg.overlayBlob,
    sourceFiles:cfg.files.length,sourceRoutes:listener.assets,currentApplication:sourceIndex.application,originalDraftId:finalDraft.id,originalReviewId:currentRound.id,
    retainedOriginalActions:originalRound.events.length,reviewActions:currentRound.events.length,sourceEditions:finalDraft.sources.length,authoredVersions:finalDraft.versions.length,
    applicationReceiving,companionReceiving,stages,captures,downloads,browserErrors:errors}));
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
