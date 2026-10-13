import {spawn} from "node:child_process";
import {mkdir,readFile,writeFile,rename} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {ClassIntakeClient} from "./client.mjs";
import {AttendanceClient} from "./attendance-client.mjs";
const HERE=dirname(fileURLToPath(import.meta.url)),need=(v,m)=>{if(!v)throw new Error(m)};
const same=(a,b)=>{const order=v=>Array.isArray(v)?v.map(order):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,order(v[k])])):v;return JSON.stringify(order(a))===JSON.stringify(order(b))};
const hash=b=>createHash("sha256").update(b).digest("hex"),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function retain(path,value){const body=Buffer.from(JSON.stringify(value,null,2)+"\n"),stage=path+"."+randomUUID()+".partial";await writeFile(stage,body,{mode:0o600});await rename(stage,path)}
async function immutable(path,value){try{need(same(JSON.parse(await readFile(path,"utf8")),value),"Original retained selection changed: "+path)}catch(error){if(error.code!=="ENOENT")throw error;await retain(path,value)}}
async function originalPending(page,workspaceId){return page.evaluate(key=>new Promise((accept,reject)=>{const r=indexedDB.open("class-attendance-operations",1);r.onupgradeneeded=()=>r.result.createObjectStore("pending");r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction("pending"),q=tx.objectStore("pending").get(key);q.onerror=()=>{db.close();reject(q.error)};q.onsuccess=async()=>{try{const v=q.result;if(v?.file instanceof Blob){const raw=await v.file.arrayBuffer();v.packet={bytes:raw.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest("SHA-256",raw))].map(n=>n.toString(16).padStart(2,"0")).join("")};delete v.file}accept(v??null)}catch(e){reject(e)}finally{db.close()}}}}),workspaceId+":attendance")}
async function restoreSave(page,workspaceId,body){await page.evaluate(({key,body})=>new Promise((accept,reject)=>{const r=indexedDB.open("class-attendance-operations",1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction("pending","readwrite"),s=tx.objectStore("pending"),q=s.get(key);q.onsuccess=()=>{if(q.result){tx.abort();return}s.put({kind:"save",body},key)};tx.oncomplete=()=>{db.close();accept()};tx.onabort=()=>{db.close();reject(new Error("Original pending operation changed"))};tx.onerror=()=>reject(tx.error)}}),{key:workspaceId+":attendance",body});await page.reload();await page.waitForSelector("#pending:not([hidden])")}
async function identity(path){const b=await readFile(path);return{path,bytes:b.length,sha256:hash(b)}}
async function until(fn,test,timeout=90000){const end=Date.now()+timeout;let value;while(Date.now()<end){value=await fn();if(test(value))return value;await pause(250)}throw new Error("The original operator state did not finish: "+JSON.stringify(value))}
export async function runAttendanceBrowser(config){
 const root=resolve(config.outputDirectory),core=JSON.parse(await readFile(config.coreResult,"utf8"));
 need(core.operation==="CLASS-INTAKE-BEREA-ATTENDANCE-7108-20261013"&&core.state==="COMPLETE","Select the completed original attendance operation");
 for(const f of core.files)need(same(await identity(f.path),f),"A complete original operated file changed");
 await mkdir(root,{recursive:true,mode:0o700});
 const selection={operation:"CLASS-INTAKE-BEREA-ATTENDANCE-BROWSER-7108-20261013",core:await identity(config.coreResult),
  python:config.pythonExecutable,chromium:config.chromiumExecutable,playwright:config.playwrightModule,actor:config.actor};
 const input=join(root,"selection.json");let prior;try{prior=JSON.parse(await readFile(input,"utf8"))}catch(e){if(e.code!=="ENOENT")throw e}
 if(prior)need(JSON.stringify(prior)===JSON.stringify(selection),"Continue the same complete browser selection");else await retain(input,selection);
 const resultPath=join(root,"result.json");try{const complete=JSON.parse(await readFile(resultPath,"utf8"));for(const f of complete.files)need(same(await identity(f.path),f),"Completed browser output changed");return complete}catch(e){if(e.code!=="ENOENT")throw e}
 const module=await import(pathToFileURL(config.playwrightModule).href),pw=module.chromium?module:module.default;
 let server=null,context=null;const files=[];
 async function stop(){const errors=[],ownedContext=context,ownedServer=server;context=null;server=null;await Promise.all([ownedContext?ownedContext.close().catch(e=>errors.push(e)):Promise.resolve(),ownedServer?(async()=>{try{if(ownedServer.child.exitCode===null&&ownedServer.child.signalCode===null)ownedServer.child.kill("SIGINT");await ownedServer.closed}catch(e){errors.push(e)}})():Promise.resolve()]);if(errors.length)throw new AggregateError(errors,"Original attendance operator cleanup failed")}
 async function start(directory,label){
  const child=spawn(config.pythonExecutable,["-B",join(HERE,"server.py"),"--workspace",directory],{cwd:HERE,env:{...process.env,PYTHONDONTWRITEBYTECODE:"1"},stdio:["ignore","pipe","pipe"]});const closed=new Promise((accept,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>accept({code,signal}))});closed.catch(()=>{});server={child,closed};
  let stdout="",stderr="";child.stdout.on("data",b=>stdout+=b);child.stderr.on("data",b=>stderr+=b);
  const launch=await new Promise((accept,reject)=>{const timer=setTimeout(()=>reject(new Error("Original attendance server startup timed out")),60000);
   child.once("error",error=>{clearTimeout(timer);reject(error)});child.once("exit",code=>{clearTimeout(timer);reject(new Error("Original server exited "+code+": "+stderr))});
   child.stdout.on("data",()=>{const line=stdout.split("\n")[0];try{const v=JSON.parse(line);if(v.state==="READY"){clearTimeout(timer);accept(v)}}catch{}})});
  await retain(join(root,label+"-startup.json"),{workspace:launch.workspace,url:launch.url});
  context=await pw.chromium.launchPersistentContext(join(root,"private-profile-"+label),{executablePath:config.chromiumExecutable,headless:true,acceptDownloads:true,viewport:{width:1365,height:960},args:config.chromiumArgs??["--no-sandbox","--disable-dev-shm-usage"]});
  const page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(90000);await page.goto(launch.url+"/attendance");
  await page.waitForFunction(()=>document.getElementById("status").textContent.startsWith("Local workspace ready."));
  const intake=new ClassIntakeClient(launch.url),workspace=await intake.state();return{page,url:launch.url,label,workspaceId:workspace.workspaceId,client:new AttendanceClient(intake)};
 }
 async function open(page,id){await page.locator("#reviews").selectOption(id);await page.waitForFunction(id=>document.getElementById("revision").textContent.includes(id),id)}
 async function decision(opened,reason){
  const {page,client,workspaceId,label}=opened;
  const intentPath=join(root,label+"-session-intent.json"),requestPath=join(root,label+"-session-request.json");
  let intent;try{intent=JSON.parse(await readFile(intentPath,"utf8"))}catch(error){
   if(error.code!=="ENOENT")throw error;
   const latest=await client.view(core.attendance.id),definition=structuredClone(latest.definition);
   const session=definition.sessions.find(x=>x.id==="drawing-oct21");need(session,"Original dated session is absent");
   session.state="cancelled";session.reason=reason;definition.note=reason;
   intent={workspaceId,bookId:latest.id,expectedRevision:latest.revision,actor:config.actor,definition};
   await immutable(intentPath,intent);
  }
  need(intent.workspaceId===workspaceId&&intent.bookId===core.attendance.id&&intent.actor===config.actor,"Original attendance intent changed");
  const validate=body=>need(body&&body.id===intent.bookId&&body.expectedRevision===intent.expectedRevision&&body.actor===intent.actor&&same(body.definition,intent.definition)&&typeof body.requestId==="string"&&typeof body.at==="string","Original pending attendance request differs");
  let body,pending=await originalPending(page,workspaceId);
  try{body=JSON.parse(await readFile(requestPath,"utf8"));validate(body)}catch(error){if(error.code!=="ENOENT")throw error}
  if(pending){need(pending.kind==="save","Another complete receiving operation is pending");validate(pending.body);if(body)need(same(body,pending.body),"Retained request differs from browser pending body");else{body=pending.body;await immutable(requestPath,body)}}
  if(body){
   const lookup=await client.request(body.requestId);
   if(lookup.state==="RECORDED")need(same(lookup.request,body),"Original recorded attendance body differs");
   if(!pending&&lookup.state!=="RECORDED"){await restoreSave(page,workspaceId,body);pending=await originalPending(page,workspaceId)}
   if(pending){need(pending.kind==="save"&&same(pending.body,body),"Pending attendance changed");await page.locator("#resume").click()}
  }else{
   const latest=await client.view(intent.bookId);need(latest.revision===intent.expectedRevision,"Original attendance edition changed before dispatch");
   await page.locator("#actor").fill(config.actor);
   await page.locator("#session-form select[name=existing]").selectOption("drawing-oct21");
   await page.locator("#session-form select[name=state]").selectOption("cancelled");
   await page.locator("#session-form input[name=reason]").fill(reason);
   let accept,reject;const intercepted=new Promise((a,b)=>{accept=a;reject=b});intercepted.catch(()=>{});const tasks=new Set();
   const handler=route=>{const task=(async()=>{try{body=route.request().postDataJSON();validate(body);await immutable(requestPath,body);await route.continue();accept()}catch(error){reject(error);await route.abort("failed").catch(()=>{})}})();tasks.add(task);task.finally(()=>tasks.delete(task)).catch(()=>{});return task};
   await page.route("**/api/attendance/save",handler);let timer;
   try{
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Original attendance save has not reached dispatch; its retained operation can resume")),30000)});deadline.catch(()=>{});
    await page.locator("#session-form button").click();await Promise.race([intercepted,deadline]);
   }finally{clearTimeout(timer);try{await page.unroute("**/api/attendance/save",handler)}finally{await Promise.allSettled([...tasks])}}
  }
  need(body,"Original complete attendance request was not selected");
  await page.waitForSelector("#pending[hidden]");
  const recorded=await client.request(body.requestId);need(recorded.state==="RECORDED"&&same(recorded.request,body),"Original attendance request did not complete");
  const result=await client.view(recorded.result.id,recorded.result.revision);
  need(result.revision===intent.expectedRevision+1&&same(result.definition,intent.definition),"Original visible attendance decision differs");
  await open(page,result.id);files.push(await identity(intentPath),await identity(requestPath));return result;
 }
 async function download(opened,name){const event=opened.page.waitForEvent("download");event.catch(()=>{});await opened.page.locator("#export").click();const received=await event;const path=join(root,name);await received.saveAs(path);const file=await identity(path);files.push(file);return file}
 try{
  const sourceDirectory=resolve(core.workspace),source=await start(sourceDirectory,"source");
  await open(source.page,core.attendance.id);
  const before=await source.client.view(core.attendance.id);
  const reviewed=await decision(source,"Source browser operator closed the original rescheduled October 21 session.");
  need(reviewed.derived.totals.used===before.derived.totals.used&&reviewed.derived.totals.reserved===before.derived.totals.reserved,"Session closure changed visit accounting");
  await source.page.screenshot({path:join(root,"source-desktop.png"),fullPage:true});files.push(await identity(join(root,"source-desktop.png")));
  const sourcePacket=await download(source,"Class_Attendance_Source_Browser.zip");
  await retain(join(root,"source-review.json"),reviewed);files.push(await identity(join(root,"source-review.json")));await stop();
  const receiverDirectory=join(root,"received-workspace"),recipient=await start(receiverDirectory,"received");
  const current=await recipient.client.state(),receiveIntent={workspaceId:recipient.workspaceId,packet:sourcePacket};
  await immutable(join(root,"original-receive-intent.json"),receiveIntent);
  const incoming=await originalPending(recipient.page,recipient.workspaceId);
  if(incoming?.kind==="save"){
   const imported=await recipient.client.view(core.attendance.id,reviewed.revision);
   need(same(imported,reviewed),"Pending recipient decision lacks the complete original received edition");
   const intent=JSON.parse(await readFile(join(root,"received-session-intent.json"),"utf8")),body=incoming.body;
   need(intent.workspaceId===recipient.workspaceId&&intent.bookId===core.attendance.id&&intent.expectedRevision===reviewed.revision&&intent.actor===config.actor,"Retained recipient intent differs");
   need(body&&body.id===intent.bookId&&body.expectedRevision===intent.expectedRevision&&body.actor===intent.actor&&same(body.definition,intent.definition)&&typeof body.requestId==="string"&&typeof body.at==="string","Pending recipient save differs from its retained complete intent");
   await immutable(join(root,"received-session-request.json"),body);
  }else if(incoming){
   need(incoming.kind==="receive"&&incoming.packet?.bytes===sourcePacket.bytes&&incoming.packet?.sha256===sourcePacket.sha256,"Independent workspace has another pending original operation");
   await recipient.page.locator("#resume").click();
  }else if(!current.reviews.some(x=>x.id===core.attendance.id)){
   await recipient.page.locator("#packet").setInputFiles(sourcePacket.path);
  }
  await until(()=>recipient.client.state(),v=>v.reviews.some(x=>x.id===core.attendance.id));
  if(incoming?.kind!=="save")await recipient.page.waitForFunction(()=>document.getElementById("pending").hidden);
  files.push(await identity(join(root,"original-receive-intent.json")));
  await open(recipient.page,core.attendance.id);
  const received=await recipient.client.view(core.attendance.id,reviewed.revision);
  need(JSON.stringify(received)===JSON.stringify(reviewed),"Whole browser receiving changed the exact saved source edition");
  const local=await decision(recipient,"Independent browser operator reviewed the rescheduled session and retained the complete attendance book.");
  const replay=await recipient.client.receive(await readFile(sourcePacket.path));
  need(replay.current.revision===local.revision,"Older browser packet replaced the later recipient decision");
  await recipient.page.setViewportSize({width:390,height:844});await recipient.page.screenshot({path:join(root,"recipient-phone.png"),fullPage:true});files.push(await identity(join(root,"recipient-phone.png")));
  const finalPacket=await download(recipient,"Class_Attendance_Received_Browser.zip");
  await retain(join(root,"received-review.json"),local);files.push(await identity(join(root,"received-review.json")));const receiverOrigin=recipient.url;await stop();
  const reopened=await start(receiverDirectory,"received");need(reopened.url===receiverOrigin,"Original browser origin changed after server restart");
  await open(reopened.page,core.attendance.id);
  need(JSON.stringify(await reopened.client.view(core.attendance.id))===JSON.stringify(local),"Cold browser reopening changed complete history");
  await reopened.page.screenshot({path:join(root,"recipient-reopened.png"),fullPage:true});files.push(await identity(join(root,"recipient-reopened.png")));
  await stop();
  const result={schema:"class-intake.attendance-browser.v1",operation:selection.operation,state:"COMPLETE",sourceReview:{id:reviewed.id,revision:reviewed.revision},receivedReview:{id:local.id,revision:local.revision},
   checks:{visibleSessionDecision:true,wholeBrowserDownload:true,independentBrowserReceive:true,olderPacketPreservesLocal:true,phoneView:true,coldBrowserReopen:true,stableOrigin:true,serversClosed:true},finalPacket,files};
  await retain(resultPath,result);return result;
 }finally{await stop()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){need(process.argv.length===3,"node attendance_browser.mjs /absolute/input.json");const result=await runAttendanceBrowser(JSON.parse(await readFile(process.argv[2],"utf8")));process.stdout.write(JSON.stringify(result,null,2)+"\n")}
