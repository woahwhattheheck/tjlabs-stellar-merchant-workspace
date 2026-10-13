/** Complete installed make-up operator, original-save recovery and independent handover. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {pathToFileURL} from "node:url";
import {createHash,randomUUID} from "node:crypto";
import {MakeupClient} from "./makeup_client.mjs";
const config=JSON.parse(await fs.readFile(process.argv[2],"utf8"));
for(const key of ["sourceRoot","workspace","recipient","output","python","chromium","playwright","id","uiScenario"])assert.ok(config[key],"Missing complete browser configuration: "+key);
const output=path.resolve(config.output);await fs.mkdir(output,{recursive:true});
await publishJSON(path.join(output,"configuration.json"),config);
const sha=b=>createHash("sha256").update(b).digest("hex");
async function publishJSON(target,value){
 try{const old=JSON.parse(await fs.readFile(target,"utf8"));assert.deepEqual(old,value,"Original complete input differs: "+target);return old;}catch(error){if(error.code!=="ENOENT")throw error;}
 const bytes=Buffer.from(JSON.stringify(value,null,2)+"\n"),temporary=target+"."+randomUUID()+".partial";let handle;
 try{
  handle=await fs.open(temporary,"wx",0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
  assert.ok((await fs.readFile(temporary)).equals(bytes),"Complete original publication stage differs.");
  try{await fs.link(temporary,target);}catch(error){if(error.code!=="EEXIST")throw error;assert.deepEqual(JSON.parse(await fs.readFile(target,"utf8")),value,"Concurrent original input differs.");}
  const directory=await fs.open(path.dirname(target),"r");try{await directory.sync();}finally{await directory.close();}
  return JSON.parse(await fs.readFile(target,"utf8"));
 }finally{if(handle)await handle.close();try{await fs.unlink(temporary);}catch(error){if(error.code!=="ENOENT")throw error;}}
}
async function retained(name,value){const target=path.join(output,name);let old;try{old=JSON.parse(await fs.readFile(target,"utf8"));}catch(e){if(e.code!=="ENOENT")throw e;}if(old!==undefined){if(value!==undefined)assert.deepEqual(old,value,"Original retained browser input differs: "+name);return old;}if(value===undefined)return null;return publishJSON(target,value);}
const children=[],browserErrors=[],captures=[],routeTasks=new Set(),routeFailures=[],interceptions=[];let browser;
async function intercept(page,pattern,handler){
 let resolve,reject;const done=new Promise((yes,no)=>{resolve=yes;reject=no;});done.catch(()=>{});
 const timer=setTimeout(()=>reject(new Error("The original intercepted request did not complete within thirty seconds.")),30000);
 const entry={page,pattern,active:true,done,wrapped:null,timer};interceptions.push(entry);
 entry.wrapped=route=>{const task=(async()=>{try{await handler(route);resolve();}catch(error){routeFailures.push(error);try{await route.abort("failed");}catch{}reject(error);throw error;}finally{clearTimeout(timer);}})();routeTasks.add(task);task.then(()=>routeTasks.delete(task),()=>routeTasks.delete(task));return task;};
 await page.route(pattern,entry.wrapped,{times:1});return entry;
}
async function retireInterception(entry){try{await entry.done;}finally{if(entry.active){await entry.page.unroute(entry.pattern,entry.wrapped);entry.active=false;}}}
function track(child){children.push(child);child.closed=false;child.completion=new Promise(resolve=>child.once("close",()=>{child.closed=true;resolve();}));return child;}
async function pendingFor(page,key){return page.evaluate(k=>({save:JSON.parse(localStorage.getItem(k+":pending")||"null"),receive:JSON.parse(localStorage.getItem(k+":receive")||"null")}),key);}
async function reconcileOwned(page,key,{request,packetSha}){const p=await pendingFor(page,key);if(p.save){assert.ok(request,"An unrelated original save is pending.");assert.deepEqual(p.save,request,"Preserve the existing original pending save.");}if(p.receive){assert.equal(p.receive.packet.sha256,packetSha,"Preserve the existing original pending receiving packet.");}if(p.save||p.receive){await page.locator("#recover").click();await page.waitForSelector("#pending[hidden]",{state:"attached"});await settled(page);}}
async function startServer(label,workspace){
 const child=spawn(config.python,["-B",path.join(config.sourceRoot,"server.py"),"--workspace",workspace],{stdio:["ignore","pipe","pipe"],env:{...process.env,PYTHONDONTWRITEBYTECODE:"1"}});
 track(child);let stdout="",stderr="";
 child.stdout.on("data",b=>stdout+=b);child.stderr.on("data",b=>stderr+=b);
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(label+" server did not return its endpoint: "+stderr)),20000);child.on("error",e=>{clearTimeout(timer);reject(e);});child.on("close",code=>{clearTimeout(timer);reject(new Error(label+" server exited "+code+": "+stderr));});child.stdout.on("data",()=>{for(const line of stdout.split("\n")){try{const r=JSON.parse(line);if(r.state==="READY"){clearTimeout(timer);resolve(r.url);return;}}catch{}}});});
 return {child,url,workspace,label,logs:()=>({stdout,stderr})};
}
async function stop(server){if(!server.child.closed){if(server.child.exitCode===null&&server.child.signalCode===null&&!server.child.killed)server.child.kill("SIGTERM");await server.child.completion;}await fs.writeFile(path.join(output,server.label+"-server.json"),JSON.stringify(server.logs(),null,2)+"\n");}
async function waitForView(client,minimum){const deadline=Date.now()+20000;while(Date.now()<deadline){const v=await client.view(config.id);if(v.revision>=minimum)return v;await new Promise(r=>setTimeout(r,100));}throw new Error("Recorded revision was not available.");}
async function screenshot(page,name){const p=path.join(output,name+".png");await page.screenshot({path:p,fullPage:true});const body=await fs.readFile(p);captures.push({path:p,bytes:body.length,sha256:sha(body)});}
async function field(page,id,value){await page.locator("#"+id).fill(String(value));}
async function select(page,id,value){await page.locator("#"+id).selectOption(String(value));}
async function settled(page){await page.waitForFunction(()=>!document.getElementById("preview").disabled);const text=await page.locator("#status").innerText();assert.ok(!/invalid|unknown|failed|requires|error/i.test(text),"Operator did not accept action: "+text);}
async function cold(directory){const script="import sys,json;sys.path.insert(0,sys.argv[1]);from makeup import MakeupWorkspace;w=MakeupWorkspace(sys.argv[2]);v=w.view(sys.argv[3]);h=w.history(sys.argv[3]);w.close();print(json.dumps({'view':v,'history':h}))";
 return new Promise((resolve,reject)=>{const child=spawn(config.python,["-B","-c",script,config.sourceRoot,directory,config.id],{stdio:["ignore","pipe","pipe"],env:{...process.env,PYTHONDONTWRITEBYTECODE:"1"}});track(child);let out="",err="";child.stdout.on("data",x=>out+=x);child.stderr.on("data",x=>err+=x);child.on("error",reject);child.on("close",code=>{if(code){reject(new Error("Cold reopen failed "+err));return;}try{resolve(JSON.parse(out));}catch(error){reject(error);}});});
}
let sourceServer,recipientServer,sourceBefore,sourceAfter,recipientAfter,primaryFailure;
try{
 sourceServer=await startServer("source",config.workspace);const source=new MakeupClient(sourceServer.url);
 await source.state();sourceBefore=await retained("original-source-before.json");
 if(!sourceBefore)sourceBefore=await retained("original-source-before.json",await source.view(config.id));
 assert.deepEqual(await source.view(config.id,sourceBefore.revision),sourceBefore);
 let priorBrowserRequest=await retained("original-browser-request.json");
 const {chromium}=await import(pathToFileURL(config.playwright).href);
 const context=await chromium.launchPersistentContext(path.join(output,"browser-profile"),{executablePath:config.chromium,headless:true,viewport:{width:1440,height:1000},args:["--no-sandbox","--disable-dev-shm-usage"]});browser=context;
 const page=context.pages()[0]??await context.newPage();
 page.on("pageerror",e=>browserErrors.push(e.message));await page.goto(sourceServer.url+"/makeup");await page.waitForFunction(()=>["Workspace ready.","An original save awaits reconciliation."].includes(document.getElementById("status").textContent));
 const storageKey="family-makeup:"+(await source.state()).workspaceId;
 let committed=null;
 const retainedSourcePending=await pendingFor(page,storageKey);
 if(!priorBrowserRequest&&retainedSourcePending.save){
  const expected=await retained("source-definition-before-save.json");assert.ok(expected,"Preserve an unrelated source pending save.");
  assert.deepEqual(retainedSourcePending.save.definition,expected);assert.equal(retainedSourcePending.save.id,sourceBefore.id);
  assert.equal(retainedSourcePending.save.expectedRevision,sourceBefore.revision);assert.equal(retainedSourcePending.save.actor,"7108 studio engineering operator");
  priorBrowserRequest=await retained("original-browser-request.json",retainedSourcePending.save);
 }
 if(!priorBrowserRequest){
 const existing=await pendingFor(page,storageKey);assert.equal(existing.save,null,"Preserve an unrelated pending source save.");assert.equal(existing.receive,null,"Preserve an unrelated pending source receive.");
 await select(page,"ledger",config.id);await settled(page);
 await field(page,"definition",JSON.stringify(sourceBefore.definition));await page.locator("#apply-definition").click();await settled(page);
 await field(page,"actor","7108 studio engineering operator");
 const scenario=config.uiScenario;
 await select(page,"absence-policy",scenario.absence.policyId);await select(page,"absence-enrollment",scenario.absence.enrollmentId);
 await field(page,"absence-date",scenario.absence.date);await select(page,"absence-slot",scenario.absence.slotId);
 await field(page,"absence-notice",new Date(scenario.absence.noticeAt).toISOString().slice(0,16));
 await field(page,"absence-notice-ref",scenario.absence.noticeRef);await select(page,"absence-reason",scenario.absence.reason??"other");
 await field(page,"absence-note","Original engineering lesson absence entered through the operator.");
 await page.locator("#add-absence").click();await settled(page);
 let draft=JSON.parse(await page.locator("#definition").inputValue());const absence=draft.absences.at(-1);
 assert.equal(absence.date,scenario.absence.date);assert.equal(absence.enrollmentId,scenario.absence.enrollmentId);
 await select(page,"booking-absence",absence.id);await select(page,"booking-kind","book");
 await field(page,"target-date",scenario.booking.date);await select(page,"target-slot",scenario.booking.slotId);
 if(scenario.booking.capacity!==null)await field(page,"target-capacity",scenario.booking.capacity);
 await field(page,"target-capacity-ref",scenario.booking.capacityRef);await field(page,"target-instructor",scenario.booking.instructor);
 await select(page,"target-confirmation","confirmed");await field(page,"target-reference",scenario.booking.reference);
 await field(page,"target-note",scenario.booking.note);await field(page,"booking-note","Confirmed engineering make-up booked through the operator.");
 await page.locator("#add-booking").click();await settled(page);
 draft=JSON.parse(await page.locator("#definition").inputValue());assert.equal(draft.bookingEvents.at(-1).absenceId,absence.id);
 const sourceInterception=await intercept(page,"**/api/makeup/save",async route=>{await retained("original-browser-request.json",route.request().postDataJSON());const response=await route.fetch({timeout:20000});assert.equal(response.status(),200);committed=await response.json();await retained("original-browser-recorded.json",committed);await route.abort("failed");});
 await retained("source-definition-before-save.json",JSON.parse(await page.locator("#definition").inputValue()));
 await page.locator("#save").click();await retireInterception(sourceInterception);
 await page.waitForFunction(()=>!document.getElementById("pending").hidden&&!document.getElementById("recover").disabled);
 assert.ok(committed,"Original HTTP save completed before the intentional lost response");
 }else{
 const existing=await pendingFor(page,storageKey);assert.equal(existing.receive,null,"Preserve the existing original source receiving operation.");if(existing.save)assert.deepEqual(existing.save,priorBrowserRequest,"Preserve the existing complete source save.");
 await page.evaluate(({key,request})=>localStorage.setItem(key+":pending",JSON.stringify(request)),{key:storageKey,request:priorBrowserRequest});
 await page.reload();await page.waitForFunction(()=>!document.getElementById("pending").hidden&&!document.getElementById("recover").disabled);
 const receipt=await source.originalRequest(priorBrowserRequest.requestId);
 if(receipt.state==="RECORDED")committed=await source.view(receipt.result.id,receipt.result.revision);
 }
 const pending=await page.evaluate(k=>JSON.parse(localStorage.getItem(k+":pending")),storageKey);
 assert.ok(pending.requestId);const pendingRecord=await source.originalRequest(pending.requestId);if(pendingRecord.state==="RECORDED")assert.deepEqual(pendingRecord.request,pending);
 await screenshot(page,"source-original-save-pending");
 await page.reload();await page.waitForFunction(()=>!document.getElementById("pending").hidden&&!document.getElementById("recover").disabled);
 await page.locator("#recover").click();await page.waitForSelector("#pending[hidden]",{state:"attached"});await settled(page);
 const originalReceipt=await source.originalRequest(pending.requestId);sourceAfter=await source.view(config.id,originalReceipt.result.revision);assert.equal(sourceAfter.revision,sourceBefore.revision+1);assert.equal(sourceAfter.requestId,pending.requestId);
 assert.equal(sourceAfter.definition.absences.length,sourceBefore.definition.absences.length+1);
 assert.equal(sourceAfter.definition.bookingEvents.length,sourceBefore.definition.bookingEvents.length+1);
 assert.deepEqual(await source.save(pending),sourceAfter);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k+":pending"),storageKey),null);
 await screenshot(page,"source-desktop");
 await select(page,"revision",sourceBefore.revision);await page.waitForFunction(()=>!document.getElementById("historical").hidden);assert.equal(await page.locator("#save").isDisabled(),true);
 await page.locator("#reload").click();await settled(page);
 await select(page,"compare-before",sourceBefore.revision);await select(page,"compare-after",sourceAfter.revision);await page.locator("#compare").click();await page.waitForSelector("#comparison",{state:"visible"});
 const comparison=await source.compare(config.id,sourceBefore.revision,sourceAfter.revision);await fs.writeFile(path.join(output,"comparison.json"),JSON.stringify(comparison,null,2)+"\n");
 const downloadPromise=page.waitForEvent("download");downloadPromise.catch(()=>{});await page.locator("#export").click();const download=await downloadPromise;
 const packetPath=path.join(output,"Family_Makeup_Complete.zip");await download.saveAs(packetPath);const packet=await fs.readFile(packetPath);
 const artifact=await source.export(config.id,sourceAfter.revision);assert.equal(sha(packet),artifact.sha256);assert.equal(packet.length,artifact.bytes);
 await page.setViewportSize({width:390,height:844});await screenshot(page,"source-phone");
 const sourceDimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert.ok(sourceDimensions.document<=sourceDimensions.viewport,"Source phone has page-level horizontal overflow");
 const familyPage=await context.newPage();familyPage.on("pageerror",e=>browserErrors.push(e.message));await familyPage.setViewportSize({width:390,height:844});
 await familyPage.goto(sourceServer.url+"/");await familyPage.waitForFunction(()=>document.getElementById("status").textContent.includes("Family workspace loaded."));
 await familyPage.locator("#reviews").selectOption(sourceAfter.definition.family.id);
 await familyPage.waitForFunction(n=>[...document.getElementById("revisions").options].some(o=>o.value===String(n)),sourceAfter.definition.family.revision);
 await familyPage.locator("#revisions").selectOption(String(sourceAfter.definition.family.revision));
 const familyExpected=await source.family.view(sourceAfter.definition.family.id,sourceAfter.definition.family.revision);
 await familyPage.waitForFunction(name=>document.getElementById("name").value===name,familyExpected.definition.name);
 await screenshot(familyPage,"family-tuition-phone");const familyDimensions=await familyPage.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert.ok(familyDimensions.document<=familyDimensions.viewport,"Family tuition phone has page-level horizontal overflow");
 await familyPage.close();
 recipientServer=await startServer("recipient",config.recipient);const recipient=new MakeupClient(recipientServer.url);await recipient.state();
 const recipientPage=await context.newPage();recipientPage.on("pageerror",e=>browserErrors.push(e.message));await recipientPage.setViewportSize({width:390,height:844});
 await recipientPage.goto(recipientServer.url+"/makeup");await recipientPage.waitForFunction(()=>["Workspace ready.","An original save awaits reconciliation."].includes(document.getElementById("status").textContent));
 const recipientKey="family-makeup:"+(await recipient.state()).workspaceId;
 let originalRecipientRequest=await retained("original-recipient-request.json");
 const existingRecipientPending=await pendingFor(recipientPage,recipientKey);
 if(!originalRecipientRequest&&existingRecipientPending.save){
  const before=await retained("original-recipient-before.json"),expected=await retained("recipient-definition-before-save.json");
  assert.ok(before&&expected,"Preserve a pending recipient save outside this retained operation.");
  assert.deepEqual(existingRecipientPending.save.definition,expected);
  assert.equal(existingRecipientPending.save.id,before.id);assert.equal(existingRecipientPending.save.expectedRevision,before.revision);
  assert.equal(existingRecipientPending.save.actor,"7108 independent receiving operator");
  originalRecipientRequest=await retained("original-recipient-request.json",existingRecipientPending.save);
 }
 await reconcileOwned(recipientPage,recipientKey,{request:originalRecipientRequest,packetSha:artifact.sha256});
 await recipientPage.locator("#receive").setInputFiles(packetPath);await recipientPage.waitForFunction(()=>document.getElementById("packet-status").textContent.startsWith("Received selected revision"));
 assert.deepEqual(await recipient.view(config.id,sourceAfter.revision),sourceAfter);
 const receivingNote="Independent receiving operator retained the complete studio handover.";
 recipientAfter=await recipient.view(config.id);
 if(!recipientAfter.definition.notes.includes(receivingNote)){
 await retained("original-recipient-before.json",recipientAfter);
 await field(recipientPage,"actor","7108 independent receiving operator");
 await field(recipientPage,"notes",recipientAfter.definition.notes+"\n"+receivingNote);
 await retained("recipient-definition-before-save.json",JSON.parse(await recipientPage.locator("#definition").inputValue()));
 const recipientInterception=await intercept(recipientPage,"**/api/makeup/save",async route=>{await retained("original-recipient-request.json",route.request().postDataJSON());await route.continue();});
 await recipientPage.locator("#save").click();await retireInterception(recipientInterception);recipientAfter=await waitForView(recipient,sourceAfter.revision+1);
 await recipientPage.waitForSelector("#pending[hidden]",{state:"attached"});await settled(recipientPage);
 }
 await recipientPage.locator("#receive").setInputFiles(packetPath);
 await recipientPage.waitForFunction(n=>document.getElementById("packet-status").textContent.includes("current local revision "+n),recipientAfter.revision);
 assert.deepEqual(await recipient.view(config.id),recipientAfter);
 assert.deepEqual(await recipient.view(config.id,sourceAfter.revision),sourceAfter);
 await screenshot(recipientPage,"recipient-phone");const recipientDimensions=await recipientPage.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert.ok(recipientDimensions.document<=recipientDimensions.viewport,"Recipient phone has page-level horizontal overflow");
 const reconstructed=await recipient.download(await recipient.export(config.id,sourceAfter.revision));assert.equal(sha(reconstructed),artifact.sha256);
 await fs.writeFile(path.join(output,"source-complete.json"),JSON.stringify({view:sourceAfter,history:await source.history(config.id)},null,2)+"\n");
 await fs.writeFile(path.join(output,"recipient-complete.json"),JSON.stringify({view:recipientAfter,history:await recipient.history(config.id)},null,2)+"\n");
 await context.close();browser=null;await stop(sourceServer);await stop(recipientServer);
 const sourceCold=await cold(config.workspace),recipientCold=await cold(config.recipient);
 assert.deepEqual(sourceCold.view,sourceAfter);assert.deepEqual(recipientCold.view,recipientAfter);assert.equal(browserErrors.length,0);
 const result={schema:"class-intake.makeup-browser-complete.v1",state:"COMPLETE",operationId:config.operationId??"TONDO-MAKEUP-BROWSER-7108-20261013",source:{directory:config.workspace,id:config.id,revision:sourceAfter.revision,derivedSha256:sourceAfter.derivedSha256},recipient:{directory:config.recipient,id:config.id,revision:recipientAfter.revision,derivedSha256:recipientAfter.derivedSha256},packet:{path:packetPath,bytes:packet.length,sha256:sha(packet)},originalRequestId:pending.requestId,phone:{source:sourceDimensions,recipient:recipientDimensions,family:familyDimensions},captures,browserErrors,checks:{operatorAbsenceAndBooking:true,originalSaveLostResponse:true,sameRequestRecovery:true,historicalReadonly:true,fullTypedClient:true,independentCompleteReceive:true,laterRecipientPreserved:true,byteExactPacketReconstruction:true,coldReopen:true,ownedProcessesClosed:true}};
 await fs.writeFile(path.join(output,"browser-result.json"),JSON.stringify(result,null,2)+"\n");process.stdout.write(JSON.stringify(result)+"\n");
}catch(error){primaryFailure=error;}finally{
 const unroutes=await Promise.allSettled(interceptions.filter(x=>x.active).map(async x=>{try{await x.page.unroute(x.pattern,x.wrapped);x.active=false;}finally{clearTimeout(x.timer);}}));
 const callbacks=await Promise.allSettled([...routeTasks]);
 const cleanup=await Promise.allSettled([...(browser?[browser.close()]:[]),...[sourceServer,recipientServer].filter(Boolean).map(stop)]);
 for(const child of children)if(!child.closed&&child.exitCode===null&&child.signalCode===null&&!child.killed)child.kill("SIGTERM");
 const joined=await Promise.allSettled(children.map(child=>child.completion));
 const failures=[...(primaryFailure?[primaryFailure]:[]),...routeFailures,...[...unroutes,...callbacks,...cleanup,...joined].filter(r=>r.status==="rejected").map(r=>r.reason)];
 if(failures.length)throw new AggregateError(failures,"Complete make-up operation retained its execution or cleanup failure.");
}
