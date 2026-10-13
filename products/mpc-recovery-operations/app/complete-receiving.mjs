import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import * as Model from './domain.mjs';
import * as Proposal from './proposal.mjs';
if(process.argv.includes('--browser-branches')){await import('./branch-receiving.mjs');process.exit(process.exitCode||0);}
const root=process.cwd(),out=resolve(root,'receiving');
await mkdir(out,{recursive:true});
let previous;try{previous=JSON.parse(await readFile(resolve(out,'result.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const operation='mpc-recovery-complete-receiving-20261013';
if(previous&&previous.operation!==operation)throw Error('Existing receiving result belongs to a different operation.');
if(previous?.status==='COMPLETE'){console.log(JSON.stringify(previous));process.exit(0);}
const attempts=previous?.attempts||[];
if(previous)attempts.push({startedAt:previous.attemptStartedAt||previous.startedAt,endedAt:new Date().toISOString(),phases:previous.phases,status:previous.status,error:previous.error});
const report={operation,startedAt:previous?.startedAt||new Date().toISOString(),attemptStartedAt:new Date().toISOString(),attempts,phases:[]};
const retain=()=>writeFile(resolve(out,'result.json'),JSON.stringify(report,null,2)+'\n');
let browser,server;
try{
 const initial=JSON.parse(await readFile('initial-snapshot.json','utf8')),workspace=Model.receiveSnapshot(initial);
 report.phases.push({name:'original-source-receiving',...Model.inspectWorkspace(workspace),status:'COMPLETE'});
 const cliRetained=previous?.phases?.some(p=>p.name==='native-cli-receiving'&&p.status==='COMPLETE');
 if(!cliRetained){const cli=spawnSync(process.execPath,['cli.mjs','receive','initial-snapshot.json',resolve(out,'cli-received.json')],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
 if(cli.status!==0)throw Error('Actual CLI receiving failed: '+cli.stderr);}
 const received=JSON.parse(await readFile(resolve(out,'cli-received.json'),'utf8'));
 if(Model.canonical(Model.receiveSnapshot(received.snapshot))!==Model.canonical(workspace))throw Error('CLI receiving changed the complete source/workspace.');
 report.phases.push({name:'native-cli-receiving',status:'COMPLETE',retained:!!cliRetained});await retain();
 const require=createRequire(import.meta.url),modules=[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules',resolve(root,'node_modules')].filter(Boolean);
 let playwright;try{playwright=require('playwright');}catch{}
 for(const base of modules){if(playwright)break;try{playwright=require(resolve(base,'playwright'));}catch{}}
 if(!playwright)throw Error('Existing Playwright installation is unavailable.');
 const html=await readFile('recovery-operations.html'),plannerHtml=await readFile('proposal/workspace.html');let receivingHtml=null;
 server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.url==='/proposal'?plannerHtml:req.url==='/received-application'&&receivingHtml?receivingHtml:html);});
 await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
 const url='http://127.0.0.1:'+server.address().port+'/';
 const launchBrowser=()=>playwright.chromium.launch({headless:true,...(process.env.MPC_CHROMIUM_EXECUTABLE?{executablePath:process.env.MPC_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
 browser=await launchBrowser();
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
 context.setDefaultTimeout(120000);context.setDefaultNavigationTimeout(120000);
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 const proposalFile=resolve(out,'MPC-implementation-planning-case.json'),register={requirements:JSON.parse(await readFile('proposal/requirements.json','utf8')),steps:JSON.parse(await readFile('proposal/acceptance-steps.json','utf8'))};
 const notes={'MPC-022':'Engineering planning edition: retain the calculated local capacity shortfall and obtain actual repository quotations. The 0.85 throughput factor is an explicit scenario assumption for implementation planning.','MPC-064':'The recovery operations workspace now supplies job exceptions, recovery observations, incident follow-through and complete monthly service-review exports.'};
 const retainedProposal=[...(previous?.phases||[]),...attempts.flatMap(a=>a.phases||[])].find(p=>p.name==='original-proposal-edit-save-receive-and-report'&&p.status==='COMPLETE');
 let caseContent,caseReview;
 if(retainedProposal){
  caseContent=await readFile(proposalFile,'utf8');caseReview=Proposal.inspectProposal(caseContent,register);
  if(caseReview.sourceSha256!==retainedProposal.sourceSha256||caseReview.case.assumptions.throughputFactor!==0.85||Object.entries(notes).some(([id,note])=>caseReview.case.responses[id]?.notes!==note))throw Error('Retained planner edition differs from its completed original phase.');
 }else{
 const proposalPage=await context.newPage();proposalPage.on('pageerror',e=>errors.push(e.stack||e.message));
 await proposalPage.goto(url+'proposal',{waitUntil:'domcontentloaded'});
 await proposalPage.locator('#a-throughputFactor').fill('0.85');await proposalPage.locator('#a-throughputFactor').dispatchEvent('change');
 await proposalPage.locator('[data-tab="requirements"]').click();

 for(const [id,note]of Object.entries(notes)){const field=proposalPage.locator('[data-entry="responses.'+id+'.notes"]');await field.locator('xpath=ancestor::details').evaluate(e=>e.open=true);await field.fill(note);await field.dispatchEvent('change');const status=proposalPage.locator('[data-entry="responses.'+id+'.status"]');await status.selectOption('selected');}
 const [caseDownload]=await Promise.all([proposalPage.waitForEvent('download'),proposalPage.locator('#export-case').click()]);
 await caseDownload.saveAs(proposalFile);
 caseContent=await readFile(proposalFile,'utf8');caseReview=Proposal.inspectProposal(caseContent,register);
 if(caseReview.case.assumptions.throughputFactor!==0.85||Object.entries(notes).some(([id,note])=>caseReview.case.responses[id]?.notes!==note))throw Error('Original planner saved case differs from the actual entered planning edition.');
 await proposalPage.locator('#import-case').setInputFiles(proposalFile);
 for(const section of ['planning','requirements','recovery','quoting','methods']){await proposalPage.locator('[data-tab="'+section+'"]').click();await proposalPage.screenshot({path:resolve(out,'proposal-'+section+'-desktop.png'),fullPage:true});}
 for(const [control,name]of [['#download-report','proposal-complete-report.html'],['#export-register','proposal-response-register.csv']]){const [d]=await Promise.all([proposalPage.waitForEvent('download'),proposalPage.locator(control).click()]);await d.saveAs(resolve(out,name));}

 await proposalPage.close();
 }
 const proposalReport=await readFile(resolve(out,'proposal-complete-report.html'),'utf8');
 if(register.requirements.some(r=>!proposalReport.includes(r.id))||register.steps.some(r=>!proposalReport.includes(r.id)))throw Error('Original proposal report omitted retained response or acceptance entries.');
 report.phases.push({name:'original-proposal-edit-save-receive-and-report',requirements:caseReview.requirements.length,acceptanceSteps:caseReview.acceptance.length,sourceSha256:caseReview.sourceSha256,status:'COMPLETE',retained:!!retainedProposal});await retain();
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('#main h2').first().waitFor();
 await page.locator('#actor').fill('TJLabs receiving engineer');
 await page.locator('[data-tab="proposal"]').click();await page.locator('#proposal-file').setInputFiles(proposalFile);await page.locator('#proposal-origin').fill('Saved original planner implementation edition from this complete receiving operation');await page.locator('#proposal-import button').click();
 await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Complete proposal received'));
 await page.locator('#proposal-plan').click();await page.locator('#save-plan').click();
 await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Complete plan edition saved'));
 const tabs=['overview','proposal','plan','jobs','recovery','incidents','acceptance','sources','history'];
 for(const tab of tabs){await page.locator('[data-tab="'+tab+'"]').click();await page.locator('#main h2').first().waitFor();await page.screenshot({path:resolve(out,tab+'-desktop.png'),fullPage:true});}
 await page.locator('[data-tab="acceptance"]').click();
 const [handover]=await Promise.all([page.waitForEvent('download'),page.locator('#freeze-handover').click()]);await handover.saveAs(resolve(out,'source-handover.zip'));
 const [app]=await Promise.all([page.waitForEvent('download'),page.locator('#download-app').click()]);await app.saveAs(resolve(out,'complete-application.zip'));
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);const file=resolve(out,'browser-workspace.json');await download.saveAs(file);
 const browserPacket=JSON.parse(await readFile(file,'utf8'));
 const operated=Model.receiveSnapshot(browserPacket.snapshot),retained=Proposal.retainedProposals(operated,register);
 if(!retained.some(p=>p.source.content===caseContent)||operated.plans.length!==1||operated.plans[0].workloads.length!==0||!operated.plans[0].sourceRefs.some(r=>retained.find(x=>x.source.id===r.sourceId)?.source.content===caseContent))throw Error('Complete proposal or installation design source was lost in the operating workspace.');
 const extracted=spawnSync(process.env.MPC_RECEIVING_PYTHON||'python3',['-c','import pathlib,sys,zipfile; pathlib.Path(sys.argv[2]).write_bytes(zipfile.ZipFile(sys.argv[1]).read("recovery-operations.html"))',resolve(out,'complete-application.zip'),resolve(out,'received-application.html')],{encoding:'utf8'});
 if(extracted.status!==0)throw Error('Receiving the actual downloaded application failed: '+extracted.stderr);
 receivingHtml=await readFile(resolve(out,'received-application.html'));
 await browser.close();browser=null;
 browser=await launchBrowser();
 const receiving=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),reopen=await receiving.newPage();receiving.setDefaultTimeout(120000);receiving.setDefaultNavigationTimeout(120000);reopen.on('pageerror',e=>errors.push(e.stack||e.message));
 await reopen.goto(url+'received-application',{waitUntil:'domcontentloaded'});await reopen.locator('#main h2').first().waitFor();await reopen.locator('#receive').setInputFiles(file);
 await reopen.waitForFunction(()=>document.querySelector('#notice').textContent.includes('received and reopened'));
 const saved=await reopen.evaluate(()=>JSON.parse(localStorage.getItem('mpc-recovery-operations.v1')));
 if(Model.canonical(Model.receiveSnapshot(saved))!==Model.canonical(operated))throw Error('Independent browser receiving changed source/history.');
 await reopen.setViewportSize({width:390,height:844});
 for(const tab of ['overview','proposal','plan','jobs','incidents','acceptance']){await reopen.locator('[data-tab="'+tab+'"]').click();await reopen.screenshot({path:resolve(out,tab+'-mobile.png'),fullPage:true});const size=await reopen.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));if(size.scroll>size.width)throw Error(tab+' has horizontal viewport overflow: '+JSON.stringify(size));}
 if(errors.length)throw Error(errors.join('\n'));
 report.phases.push({name:'browser-all-sections-and-full-downloads',sections:tabs.length,status:'COMPLETE'});
 report.phases.push({name:'independent-browser-receiving',revision:operated.revision,status:'COMPLETE'});
 report.phases.push({name:'mobile-operation-views',sections:6,status:'COMPLETE'});
 report.status='COMPLETE';report.completedAt=new Date().toISOString();await retain();console.log(JSON.stringify(report));
}catch(error){report.status='INCOMPLETE';report.error=error.stack||String(error);await retain();console.error(report.error);process.exitCode=1;}
finally{if(browser)await browser.close().catch(()=>{});if(server)await new Promise(resolve=>server.close(resolve));}
