import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {pathToFileURL} from "node:url";
const input=JSON.parse(await fs.readFile(process.argv[2],"utf8"));
const root=path.resolve(input.outputDirectory),source=path.resolve(input.sourceRoot);
await fs.mkdir(root,{recursive:true});
const digest=b=>crypto.createHash("sha256").update(b).digest("hex");
const canonical=x=>JSON.stringify(x);
const exists=async p=>{try{await fs.access(p);return true}catch{return false}};
const save=async(p,v)=>{const name=p+".partial-"+process.pid;await fs.writeFile(name,Buffer.isBuffer(v)?v:JSON.stringify(v,null,2));await fs.rename(name,p)};
const descriptor=async p=>{const b=await fs.readFile(p);return{path:path.resolve(p),bytes:b.length,sha256:digest(b)}};
async function immutable(p,v){const b=Buffer.from(JSON.stringify(v,null,2));if(await exists(p)){if(!(await fs.readFile(p)).equals(b))throw new Error("Original selection differs: "+p)}else await save(p,b)}
const coreResultIdentity=await descriptor(input.coreResult);
await immutable(path.join(root,"selection.json"),{input,coreResult:coreResultIdentity});
const resultFile=path.join(root,"result.json");
if(await exists(resultFile)){const r=JSON.parse(await fs.readFile(resultFile,"utf8"));for(const f of r.files)if(!same(await descriptor(f.path),f))throw new Error("Completed file differs");process.stdout.write(JSON.stringify(r)+"\n");process.exit(0)}
const core=JSON.parse(await fs.readFile(input.coreResult,"utf8"));if(core.state!=="COMPLETE")throw new Error("Original complete core result required");
for(const f of core.files)if(!same(await descriptor(f.path),f))throw new Error("Core handback changed");
const playwrightPath=input.playwrightModule??process.env.SF30_PLAYWRIGHT_MODULE??"/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs";
const chromiumPath=input.chromiumExecutable??process.env.SF30_CHROMIUM_EXECUTABLE??"/workspace/scratch/705ebf077387/browser-runtime/chrome-headless-shell-linux64/chrome-headless-shell";
await fs.access(chromiumPath);const playwright=await import(pathToFileURL(playwrightPath));const owned=[];
let context=null;
async function server(workspace,label){
 const stdoutPath=path.join(root,label+"-server.stdout"),stderrPath=path.join(root,label+"-server.stderr");
 const stdout=await fs.open(stdoutPath,"a"),stderr=await fs.open(stderrPath,"a");
 const child=spawn(input.pythonExecutable??"python3",["-B",path.join(source,"server.py"),"--workspace",workspace,"--port","0"],{stdio:["ignore","pipe",stderr.fd],env:{...process.env,PYTHONDONTWRITEBYTECODE:"1"}});
 let exit,readyResolve,readyReject;const ready=new Promise((a,b)=>{readyResolve=a;readyReject=b});ready.catch(()=>{});
 let writes=Promise.resolve();let buffer="";child.stdout.on("data",chunk=>{writes=writes.then(()=>stdout.write(chunk));writes.catch(error=>readyReject(error));buffer+=chunk.toString();for(const line of buffer.split("\n").slice(0,-1)){try{const item=JSON.parse(line);if(item.state==="READY")readyResolve(item)}catch{}}buffer=buffer.slice(buffer.lastIndexOf("\n")+1)});
 const ended=new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",(code,signal)=>{exit={code,signal};readyReject(new Error("Server exited before ready"))});child.once("close",(code,signal)=>resolve(exit??{code,signal}))});ended.catch(()=>{});
 const entry={child,ended,stdout,stderr,workspace,label,closed:false,writes:()=>writes};owned.push(entry);
 const timer=setTimeout(()=>readyReject(new Error("Server readiness timeout")),30000);
 try{const state=await ready;return{...state,entry}}finally{clearTimeout(timer)}
}
async function closeServer(s){if(!s)return;const entry=s.entry??s;if(entry.closed)return;const {child,ended,stdout,stderr}=entry;let failure;
 try{if(child.exitCode===null&&child.signalCode===null)child.kill("SIGTERM");await ended}catch(error){failure=error}
 try{await entry.writes()}catch(error){failure??=error}
 const closure=await Promise.allSettled([stdout.close(),stderr.close()]);entry.closed=true;for(const item of closure)if(item.status==="rejected")failure??=item.reason;if(failure)throw failure}
async function pendingRecord(page,workspaceId){return page.evaluate(async key=>new Promise((resolve,reject)=>{const r=indexedDB.open("class-intake-operator-v1",1);r.onsuccess=()=>{const db=r.result,q=db.transaction("pending").objectStore("pending").get(key);q.onsuccess=async()=>{try{const v=q.result;if(v?.body instanceof Blob){const bytes=await v.body.arrayBuffer();v.packet={bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),n=>n.toString(16).padStart(2,"0")).join("")};delete v.body}resolve(v??null)}catch(e){reject(e)}finally{db.close()}};q.onerror=()=>{db.close();reject(q.error)}};r.onerror=()=>reject(r.error)}),workspaceId)}
function same(a,b){return JSON.stringify(sort(a))===JSON.stringify(sort(b))}
async function state(url){const r=await fetch(url+"/api/state");if(!r.ok)throw new Error("State failed");return r.json()}
const failures=[];const files=[];let primary,recipient;
try{
 primary=await server(core.workspace,"original");recipient=await server(path.join(root,"browser-independent-receiver"),"recipient");
 context=await playwright.chromium.launchPersistentContext(path.join(root,"browser-profile"),{executablePath:chromiumPath,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"],viewport:{width:1360,height:1000},acceptDownloads:true});
 const page=context.pages()[0]??await context.newPage();page.on("pageerror",e=>failures.push(String(e)));await page.goto(primary.url,{waitUntil:"domcontentloaded"});await page.locator("#reviews option").filter({hasText:core.sourceCase.id}).count().catch(()=>0);
 await page.waitForFunction(()=>document.querySelector("#reviews").options.length>1);
 await page.selectOption("#reviews",core.sourceCase.id);await page.waitForFunction(()=>document.querySelector("#catalogue table tbody")?.children.length===26);
 const requestFile=path.join(root,"original-browser-save-request.json"),intentFile=path.join(root,"original-browser-save-intent.json");let original;
 const primaryState=await state(primary.url);let intent;
 if(await exists(intentFile))intent=JSON.parse(await fs.readFile(intentFile,"utf8"));
 else{
  const selected=primaryState.reviews.find(r=>r.id===core.sourceCase.id);
  if(!selected||selected.revision!==core.sourceCase.revision)throw new Error("Initial original review changed before browser intent selection");
  const definition=structuredClone(selected.definition);definition.notes="Public catalogue source review. Browser handback uses synthetic registrations and confirms retained-request recovery; original source conflicts stay open.";
  intent={coreResult:coreResultIdentity,workspaceId:primaryState.workspaceId,actor:"7108 browser engineering receiver",id:selected.id,expectedRevision:selected.revision,definition};
  await immutable(intentFile,intent);
 }
 if(intent.workspaceId!==primaryState.workspaceId||!same(intent.coreResult,coreResultIdentity))throw new Error("Original browser workspace or complete core result changed");
 let pending=await pendingRecord(page,primaryState.workspaceId);
 function validateSave(body){if(!body||body.actor!==intent.actor||body.id!==intent.id||body.expectedRevision!==intent.expectedRevision||!same(body.definition,intent.definition)||typeof body.requestId!=="string"||typeof body.at!=="string")throw new Error("Pending save differs from original full browser intent")}
 if(await exists(requestFile)){original=JSON.parse(await fs.readFile(requestFile,"utf8"));validateSave(original)}
 else if(pending){if(pending.kind!=="save"||pending.workspaceId!==intent.workspaceId)throw new Error("Another original browser operation is pending");validateSave(pending.body);original=pending.body;await immutable(requestFile,original)}
 if(original){
  if(pending&&(pending.kind!=="save"||pending.workspaceId!==intent.workspaceId||!same(pending.body,original)))throw new Error("Existing pending operation differs; it remains untouched");
  const lookupResponse=await fetch(primary.url+"/api/request?id="+encodeURIComponent(original.requestId));if(!lookupResponse.ok)throw new Error("Original request lookup failed");const lookup=await lookupResponse.json();
  if(lookup.state==="RECORDED"&&!same(lookup.request,original))throw new Error("Recorded original request differs");
  if(!pending&&lookup.state!=="RECORDED"){
   await page.evaluate(async({workspaceId,body})=>new Promise((resolve,reject)=>{const r=indexedDB.open("class-intake-operator-v1",1);r.onsuccess=()=>{const db=r.result,tx=db.transaction("pending","readwrite"),store=tx.objectStore("pending"),prior=store.get(workspaceId);prior.onsuccess=()=>{if(prior.result){tx.abort();return}store.put({kind:"save",workspaceId,body,createdAt:body.at},workspaceId)};tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>{db.close();reject(new Error("Pending operation changed before recovery"))};tx.onerror=()=>reject(tx.error)};r.onerror=()=>reject(r.error)}),{workspaceId:intent.workspaceId,body:original});
   await page.reload({waitUntil:"domcontentloaded"});await page.waitForSelector("#pending:not([hidden])");pending=await pendingRecord(page,intent.workspaceId);
  }
  if(pending){if(pending.kind!=="save"||!same(pending.body,original)||pending.workspaceId!==intent.workspaceId)throw new Error("Pending retry differs");await page.click("#retry")}
 }else{
  if(pending)throw new Error("An unrelated original pending operation exists");
  await page.fill("#actor",intent.actor);await page.fill("#notes",intent.definition.notes);
  let interceptedResolve,interceptedReject;const intercepted=new Promise((a,b)=>{interceptedResolve=a;interceptedReject=b});intercepted.catch(()=>{});
  const routeTasks=new Set();
  const handler=route=>{const task=(async()=>{try{original=route.request().postDataJSON();validateSave(original);await immutable(requestFile,original);const response=await route.fetch({timeout:30000});await save(path.join(root,"original-browser-save-response.json"),{status:response.status(),body:await response.json()});await route.abort("failed");interceptedResolve()}catch(e){interceptedReject(e);await route.abort("failed").catch(()=>{})}})();routeTasks.add(task);task.finally(()=>routeTasks.delete(task)).catch(()=>{});return task};
  await page.route("**/api/save",handler);
  let timer;
  try{
   const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Original save did not reach dispatch within 30 seconds; its pending request is retained")),30000)});deadline.catch(()=>{});
   await page.click("#save");await Promise.race([intercepted,deadline]);
  }catch(error){
   let retainedPending=null,pendingReadError=null;
   try{retainedPending=await pendingRecord(page,intent.workspaceId);if(retainedPending?.kind==="save"&&retainedPending.workspaceId===intent.workspaceId){validateSave(retainedPending.body);await immutable(requestFile,retainedPending.body)}}catch(readError){pendingReadError=String(readError)}
   await save(path.join(root,"original-browser-save-interruption.json"),{message:String(error),workspaceId:intent.workspaceId,pending:retainedPending,pendingReadError});throw error;
  }finally{clearTimeout(timer);try{await page.unroute("**/api/save",handler)}finally{await Promise.allSettled([...routeTasks])}}
  await page.waitForSelector("#pending:not([hidden])");pending=await pendingRecord(page,intent.workspaceId);
  if(pending?.kind!=="save"||pending.workspaceId!==intent.workspaceId||!same(pending.body,original))throw new Error("Original pending body was not retained");
  await page.click("#retry");
 }
 await page.waitForSelector("#pending[hidden]",{state:"attached"});
 const requestReply=await fetch(primary.url+"/api/request?id="+encodeURIComponent(original.requestId));const received=await requestReply.json();
 if(received.state!=="RECORDED"||JSON.stringify(received.request)!==JSON.stringify(original)&&JSON.stringify(sort(received.request))!==JSON.stringify(sort(original)))throw new Error("Recorded request mismatch");
 await save(path.join(root,"request-recovery.json"),received);files.push(path.join(root,"request-recovery.json"));
 await page.selectOption("#reviews",core.sourceCase.id);await page.waitForFunction(()=>document.querySelector("#catalogue table tbody")?.children.length===26);
 await page.screenshot({path:path.join(root,"desktop.png"),fullPage:true});files.push(path.join(root,"desktop.png"));
 await page.selectOption("#revisions","1");await page.waitForFunction(()=>document.querySelector("#edition-note").textContent.startsWith("Historical"));
 if(!await page.locator("#save").isDisabled())throw new Error("Historical save not disabled");
 await page.selectOption("#revisions",String(received.result.revision));await page.fill("#compare-before","1");await page.fill("#compare-after",String(received.result.revision));await page.click("#compare");await page.waitForFunction(()=>document.querySelector("#comparison").textContent.includes("beforeRevision"));
 await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(root,"mobile.png"),fullPage:true});files.push(path.join(root,"mobile.png"));
 const downloadWait=page.waitForEvent("download");downloadWait.catch(()=>{});await page.click("#export");const download=await downloadWait;const packetPath=path.join(root,"Class_Intake_Browser_Complete.zip");await download.saveAs(packetPath);files.push(packetPath);
 const other=await context.newPage();await other.goto(recipient.url,{waitUntil:"domcontentloaded"});await other.waitForFunction(()=>document.querySelector("#status").textContent.includes("Saved workspace loaded"));const recipientState=await state(recipient.url),packetIdentity=await descriptor(packetPath);await immutable(path.join(root,"original-browser-receive-intent.json"),{workspaceId:recipientState.workspaceId,packet:packetIdentity});
 const incomingPending=await pendingRecord(other,recipientState.workspaceId);
 if(incomingPending){if(incomingPending.kind!=="receive"||incomingPending.workspaceId!==recipientState.workspaceId||incomingPending.packet?.sha256!==packetIdentity.sha256||incomingPending.packet?.bytes!==packetIdentity.bytes)throw new Error("Independent receiver has a different original pending operation");await other.click("#retry")}
 else{await other.setInputFiles("#receive-file",packetPath);await other.click("#receive")}
 await other.waitForFunction(()=>document.querySelector("#status").textContent.includes("Complete operation received"));
 const receivedState=await state(recipient.url);const exact=receivedState.reviews.find(r=>r.id===core.sourceCase.id);if(!exact||exact.revision!==received.result.revision||exact.derived.datasets.catalogue.length!==26)throw new Error("Independent UI receive mismatch");
 await other.setViewportSize({width:1360,height:1000});await other.screenshot({path:path.join(root,"independent-receiver.png"),fullPage:true});files.push(path.join(root,"independent-receiver.png"));
 await save(path.join(root,"independent-receive.json"),exact);files.push(path.join(root,"independent-receive.json"));
 await context.close();context=null;await closeServer(primary);primary=null;await closeServer(recipient);recipient=null;
 const cold=await server(path.join(root,"browser-independent-receiver"),"cold-reopen");const coldState=await state(cold.url);const reopened=coldState.reviews.find(r=>r.id===core.sourceCase.id);if(reopened?.derivedSha256!==exact.derivedSha256)throw new Error("Cold reopened derivation differs");await closeServer(cold);
 if(failures.length)throw new Error("Browser errors: "+failures.join("; "));
 for(const p of [path.join(root,"selection.json"),intentFile,requestFile,path.join(root,"original-browser-receive-intent.json"),path.join(root,"original-browser-save-response.json"),path.join(root,"original-browser-save-interruption.json"),...["original","recipient","cold-reopen"].flatMap(label=>["stdout","stderr"].map(ext=>path.join(root,label+"-server."+ext)))])if(await exists(p))files.push(p);
 const result={schema:"class-intake.browser-receiving.v1",state:"COMPLETE",operationId:"CLASS-INTAKE-BEREA-BROWSER-7108-20261013",review:core.sourceCase.id,revision:received.result.revision,sourceRows:26,providerWrites:0,files:await Promise.all(files.map(descriptor)),browserErrors:failures};
 await save(resultFile,result);process.stdout.write(JSON.stringify(result)+"\n");
}finally{const errors=[];if(context)try{await context.close()}catch(e){errors.push(e)}for(const entry of owned)try{await closeServer(entry)}catch(e){errors.push(e)}if(errors.length)throw new AggregateError(errors,"Owned browser/server cleanup failed")}
function sort(v){if(Array.isArray(v))return v.map(sort);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v}
