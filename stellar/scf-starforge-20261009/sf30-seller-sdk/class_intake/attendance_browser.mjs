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
 async function stop(){if(context){await context.close();context=null}if(server){const child=server;server=null;if(child.exitCode===null&&child.signalCode===null)child.kill("SIGINT");await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)resolve();else child.once("close",resolve)})}}
 async function start(directory,label){
  const child=spawn(config.pythonExecutable,["-B",join(HERE,"server.py"),"--workspace",directory],{cwd:HERE,env:{...process.env,PYTHONDONTWRITEBYTECODE:"1"},stdio:["ignore","pipe","pipe"]});server=child;
  let stdout="",stderr="";child.stdout.on("data",b=>stdout+=b);child.stderr.on("data",b=>stderr+=b);
  const launch=await new Promise((accept,reject)=>{const timer=setTimeout(()=>reject(new Error("Original attendance server startup timed out")),60000);
   child.once("error",error=>{clearTimeout(timer);reject(error)});child.once("exit",code=>{clearTimeout(timer);reject(new Error("Original server exited "+code+": "+stderr))});
   child.stdout.on("data",()=>{const line=stdout.split("\n")[0];try{const v=JSON.parse(line);if(v.state==="READY"){clearTimeout(timer);accept(v)}}catch{}})});
  await retain(join(root,label+"-startup.json"),{workspace:launch.workspace,url:launch.url});
  context=await pw.chromium.launchPersistentContext(join(root,"private-profile-"+label),{executablePath:config.chromiumExecutable,headless:true,acceptDownloads:true,viewport:{width:1365,height:960},args:config.chromiumArgs??["--no-sandbox","--disable-dev-shm-usage"]});
  const page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(90000);await page.goto(launch.url+"/attendance");
  await page.waitForFunction(()=>document.getElementById("status").textContent.startsWith("Local workspace ready."));
  const intake=new ClassIntakeClient(launch.url);await intake.state();return{page,url:launch.url,client:new AttendanceClient(intake)};
 }
 async function open(page,id){await page.locator("#reviews").selectOption(id);await page.waitForFunction(id=>document.getElementById("revision").textContent.includes(id),id)}
 async function decision(opened,reason){
  const latest=await opened.client.view(core.attendance.id);
  if(latest.definition.sessions.find(x=>x.id==="drawing-oct21")?.reason===reason)return latest;
  await opened.page.locator("#actor").fill(config.actor);
  await opened.page.locator("#session-form select[name=existing]").selectOption("drawing-oct21");
  await opened.page.locator("#session-form select[name=state]").selectOption("cancelled");
  await opened.page.locator("#session-form input[name=reason]").fill(reason);
  await opened.page.locator("#session-form button").click();
  const value=await until(()=>opened.client.view(core.attendance.id),v=>v.definition.sessions.find(x=>x.id==="drawing-oct21")?.reason===reason);
  await opened.page.waitForFunction(()=>document.getElementById("pending").hidden);
  need(value.revision===latest.revision+1,"The same visible session decision created another number of editions");
  return value;
 }
 async function download(opened,name){const event=opened.page.waitForEvent("download");await opened.page.locator("#export").click();const received=await event;const path=join(root,name);await received.saveAs(path);const file=await identity(path);files.push(file);return file}
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
  const current=await recipient.client.state();
  if(!current.reviews.some(x=>x.id===core.attendance.id)){
   await recipient.page.locator("#packet").setInputFiles(sourcePacket.path);
   await until(()=>recipient.client.state(),v=>v.reviews.some(x=>x.id===core.attendance.id));
   await recipient.page.waitForFunction(()=>document.getElementById("pending").hidden);
  }
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
