"use strict";
/* Read-only review of the actual supplied-input receiving workspace.
 * This programme never creates customer data, decisions or application requests. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const input=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const root=path.resolve(input.directory);fs.mkdirSync(root,{recursive:true,mode:0o700});
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const need=(v,m)=>{if(!v)throw Error(m);};
function retain(name,value,immutable=true){
 const target=path.join(root,name),raw=Buffer.isBuffer(value)?value:Buffer.from(stable(value));
 if(immutable&&fs.existsSync(target)){need(fs.readFileSync(target).equals(raw),"Original browser record differs: "+name);return;}
 fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
 const tmp=target+".partial",fd=fs.openSync(tmp,"w",0o600);
 try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(tmp,target);const dir=fs.openSync(path.dirname(target),"r");try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
}
function saved(name){const p=path.join(root,name);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):null;}
const identity=Object.fromEntries(["operationId","sourceSha256","workspaceId","workspaceDirectory","basis","playwrightModule","executablePath","actor"].map(k=>[k,input[k]]));
need(input.schema==="bluewave.commissioning-browser.v1","Use the original browser input schema");
retain("input.json",identity);
const inputSha256=sha(Buffer.from(stable(identity)));
const launch=new URL(input.url),token=launch.searchParams.get("token");
need(token&&launch.origin===input.origin,"Use the original private application launch URL");
const errors=[],httpErrors=[],violations=[],screenshots=[],geometry=[],downloads=[];
let owner=null,page=null,launchReceipt=null,launchName=null,closing=null;
const profile=path.join(root,"profile");
function environmentIdentity(){
 need(process.platform==="linux","Original browser custody requires Linux process identity");
 return {bootId:fs.readFileSync("/proc/sys/kernel/random/boot_id","utf8").trim(),
   pidNamespace:fs.readlinkSync("/proc/self/ns/pid")};
}
function processIdentity(pid){
 try {
  const st=fs.readFileSync("/proc/"+pid+"/stat","utf8"),tail=st.slice(st.lastIndexOf(")")+2).split(/\s+/);
  const cmd=fs.readFileSync("/proc/"+pid+"/cmdline"),exe=fs.realpathSync("/proc/"+pid+"/exe");
  return {pid:Number(pid),startTicks:tail[19],exe,commandSha256:sha(cmd),arguments:cmd.toString("utf8").split("\0").filter(Boolean)};
 }catch(e){if(["ENOENT","ESRCH"].includes(e.code))return null;throw e;}
}
function sameProcess(a,b){return !!a&&!!b&&a.pid===b.pid&&a.startTicks===b.startTicks&&a.exe===b.exe&&a.commandSha256===b.commandSha256;}
function profileProcesses(){
 const result=[];
 for(const pid of fs.readdirSync("/proc").filter(x=>/^[0-9]+$/.test(x))){
  let cmd;
  try{cmd=fs.readFileSync("/proc/"+pid+"/cmdline").toString("utf8").split("\0").filter(Boolean);}
  catch(e){if(["ENOENT","ESRCH"].includes(e.code))continue;throw Error("Cannot establish original browser absence: "+e.code);}
  const selected=cmd.some((x,i)=>x==="--user-data-dir="+profile||x==="--user-data-dir"&&cmd[i+1]===profile);
  if(selected){const actual=processIdentity(pid);if(actual)result.push(actual);}
 }
 return result;
}
function prepareLaunch(){
 const env=environmentIdentity(),prior=saved("browser-owner.json");
 if(prior&&prior.state!=="CLOSED"){
  need(stable(prior.environment)===stable(env),"Prior browser launch belongs to another PID namespace or boot; original ownership remains unresolved");
  const parent=processIdentity(prior.owner.pid);
  need(!sameProcess(prior.owner,parent),"Original browser owner still exists; keep its existing operation");
  const remaining=profileProcesses();
  need(remaining.length===0,"Original profile still has a browser process; reconcile that exact owner before another launch");
  const settled={...prior,state:"CLOSED",closedAt:new Date().toISOString(),closure:"Original Node owner absent and complete same-namespace profile scan empty"};
  retain(prior.recordPath,settled,false);retain("browser-owner.json",settled,false);
 }
 need(profileProcesses().length===0,"Selected original browser profile is already owned");
 const attempt=prior?prior.attempt+1:0;launchName="launches/"+String(attempt).padStart(5,"0")+".json";
 launchReceipt={schema:"bluewave.browser-owner.v1",state:"STARTING",attempt,recordPath:launchName,
   operationId:input.operationId,environment:env,owner:processIdentity(process.pid),profile,
   executable:fs.realpathSync(input.executablePath),at:new Date().toISOString(),processes:[]};
 retain(launchName,launchReceipt);retain("browser-owner.json",launchReceipt,false);
}
function acceptedLaunch(){
 const processes=profileProcesses();
 need(processes.length>0&&processes.some(x=>x.exe===launchReceipt.executable),"Actual launched original browser process is not identifiable");
 launchReceipt={...launchReceipt,state:"RUNNING",processes,acceptedAt:new Date().toISOString()};
 retain(launchName,launchReceipt,false);retain("browser-owner.json",launchReceipt,false);
}
async function closeOwnerOnce(){
 if(owner){await owner.close();owner=null;}
 if(launchReceipt){
  need(stable(environmentIdentity())===stable(launchReceipt.environment),"Browser closure namespace changed");
  need(profileProcesses().length===0,"Original browser process remains after context close");
  launchReceipt={...launchReceipt,state:"CLOSED",closedAt:new Date().toISOString(),closure:"Owned Playwright context closed and exact profile processes absent"};
  retain(launchName,launchReceipt,false);retain("browser-owner.json",launchReceipt,false);
 }
}

async function closeOwner(){if(!closing)closing=closeOwnerOnce();return closing;}
function measure(file){const b=fs.readFileSync(file);return{path:file,bytes:b.length,sha256:sha(b)};}
async function state(){
 const r=await fetch(input.origin+"/api/state",{headers:{"X-Workspace-Token":token}});
 const v=await r.json();need(r.ok&&!v.error,"Cannot read the original application state");
 need(v.state.id===identity.workspaceId&&v.directory===identity.workspaceDirectory&&v.sourceSha256===identity.sourceSha256,"Another original or received workspace was selected");
 need(v.revision===identity.basis.revision&&v.sha256===identity.basis.sha256,"Read-only review changed the selected saved edition");
 return v;
}
async function settled(){
 await page.waitForFunction(()=>document.querySelector("#status")?.textContent.startsWith("Revision "));
 await page.waitForLoadState("networkidle");
 const bad=await page.locator("#notice").evaluate(x=>!x.hidden&&x.classList.contains("error")?x.textContent:null);
 need(!bad,"Actual staff application reported: "+bad);
}
async function go(screen){
 await page.locator('nav button[data-screen="'+screen+'"]').click();
 await page.locator('nav button[aria-current="page"][data-screen="'+screen+'"]').waitFor();
 await settled();
}
async function photograph(name,scope="#main"){
 await page.evaluate(()=>window.scrollTo(0,0));
 const found=await page.evaluate(scope=>{
  const width=document.documentElement.clientWidth,content=document.querySelector(scope);
  const outside=[...document.querySelectorAll(scope+" button,"+scope+" input,"+scope+" select,"+scope+" textarea")].filter(x=>{
   const s=getComputedStyle(x),r=x.getBoundingClientRect();
   return s.display!=="none"&&s.visibility!=="hidden"&&r.width>0&&(r.left<-2||r.right>width+2);
  }).map(x=>({tag:x.tagName,label:(x.textContent||x.getAttribute("aria-label")||"").slice(0,120)}));
  return{viewport:width,scrollWidth:document.documentElement.scrollWidth,title:content?.querySelector("h1,h2")?.textContent,
   textLength:content?.innerText.length||0,outside};
 },scope);
 need(found.textLength>40,"Actual customer view is empty: "+name);
 need(found.scrollWidth<=found.viewport+2,"Page exceeds the viewport: "+name);
 need(found.outside.length===0,"Visible operator controls leave the viewport: "+name+" "+JSON.stringify(found.outside));
 const file=path.join(root,"screenshots",name+".png");fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 await page.screenshot({path:file,fullPage:true});screenshots.push({name,...measure(file)});geometry.push({name,...found});
}
async function openApp(){
 await page.goto(input.url,{waitUntil:"domcontentloaded"});
 await page.locator('nav button[data-screen="overview"]').waitFor();await settled();
}
async function main(){
 const prior=saved("result.json");
 if(prior){
  need(prior.state==="COMPLETE"&&prior.inputSha256===inputSha256&&prior.allOwnedResourcesClosed===true,"Original complete browser input differs");
  need(saved("browser-owner.json")?.state==="CLOSED","Original browser closure is not retained");
  for(const f of [...prior.screenshots,...prior.downloads]){const actual=measure(f.path);need(actual.bytes===f.bytes&&actual.sha256===f.sha256,"Original reviewed output differs");}
  return prior;
 }
 const playwright=require(input.playwrightModule);
 try{
  prepareLaunch();
  owner=await playwright.chromium.launchPersistentContext(profile,{executablePath:input.executablePath,headless:true,
   args:["--no-sandbox","--disable-gpu"],viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true});
  acceptedLaunch();
  await owner.route("**/*",async route=>{
   const request=route.request(),url=new URL(request.url());
   if(!["http:","https:"].includes(url.protocol))return route.continue();
   if(url.origin!==input.origin){violations.push({path:url.pathname,reason:"External request"});return route.abort();}
   if(url.pathname.startsWith("/api/")&&!["GET","HEAD"].includes(request.method())){
    violations.push({path:url.pathname,method:request.method(),reason:"Read-only programme rejected mutation"});return route.abort();
   }
   // Add the capability only at the exact original loopback origin.
   await route.continue({headers:{...request.headers(),"x-workspace-token":token}});
  });
  page=owner.pages()[0]||await owner.newPage();
  page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(90000);
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  page.on("response",r=>{if(r.url().startsWith(input.origin+"/api/")&&r.status()>=400)httpErrors.push({path:new URL(r.url()).pathname,status:r.status()});});
  await openApp();const before=await state();
  await go("sources");
  await page.getByLabel("Operator name",{exact:true}).fill(input.actor.name);
  await page.getByLabel("Operator reference",{exact:true}).fill(input.actor.id);
  await page.getByRole("button",{name:"Use this operator",exact:true}).click();await settled();
  const selected=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("bw-operator")||"null"));
  need(stable(selected)===stable(input.actor),"Actual operator selector changed the original supplied identity");
  const sections=["overview","sources","mappings","reconciliations","rehearsals","cutovers","handovers","history","requests","transfers"];
  for(const viewport of [{name:"desktop",width:1440,height:1000},{name:"phone",width:390,height:844}]){
   await page.setViewportSize({width:viewport.width,height:viewport.height});
   for(const section of sections){
    await go(section);await photograph(viewport.name+"-"+section);
    if(section==="sources"&&before.state.sourceEditions.length){
     await page.getByRole("button",{name:"Open original rows",exact:true}).first().click();await settled();
     await photograph(viewport.name+"-original-source-rows");
    }
    if(section==="reconciliations"&&before.state.reconciliations.length){
     await page.getByRole("button",{name:"Open report",exact:true}).first().click();await settled();
     await photograph(viewport.name+"-complete-report");
     if(viewport.name==="desktop"){
      const link=page.getByRole("link",{name:"Download complete JSON",exact:true}),url=new URL(await link.getAttribute("href"),input.origin);
      need(url.searchParams.get("workspaceId")===identity.workspaceId&&url.searchParams.get("workspaceDirectory")===identity.workspaceDirectory,"Actual report download dropped its original branch binding");
      const response=await owner.request.get(url.href,{headers:{"X-Workspace-Token":token,"X-Workspace-Id":identity.workspaceId,"X-Workspace-Directory":identity.workspaceDirectory}});
      need(response.ok(),"Actual full report download failed");
      const raw=await response.body(),report=JSON.parse(raw.toString("utf8")),original=before.state.reconciliations[0];
      need(sha(raw)===original.result.reportSha256,"Actual complete report differs from saved native report");
      const target=path.join(root,"downloads","Complete_Reconciliation_Report.json");retain("downloads/Complete_Reconciliation_Report.json",raw);downloads.push(measure(target));
     }
    }
   }
   await page.goto(input.origin+"/guide",{waitUntil:"networkidle"});await photograph(viewport.name+"-staff-guide","main");
   if(viewport.name==="desktop")await openApp();
  }
  const after=await state();
  need(errors.length===0&&httpErrors.length===0&&violations.length===0,"Actual browser errors: "+JSON.stringify({errors,httpErrors,violations}));
  await closeOwner();
  const result={schema:"bluewave.commissioning-browser-result.v1",state:"COMPLETE",operationId:input.operationId,inputSha256,
   sourceSha256:identity.sourceSha256,workspaceId:identity.workspaceId,workspaceDirectory:identity.workspaceDirectory,
   before:{revision:before.revision,sha256:before.sha256},after:{revision:after.revision,sha256:after.sha256},
   screenshots,geometry,downloads,errors,httpErrors,violations,browserOwner:launchReceipt,allOwnedResourcesClosed:true,completedAt:new Date().toISOString()};
  retain("result.json",result);return result;
 }catch(error){
  retain("interrupted.json",{state:"INTERRUPTED",operationId:input.operationId,inputSha256,error:String(error.stack||error),errors,httpErrors,violations,screenshots,at:new Date().toISOString()},false);throw error;
 }finally{if(owner)await closeOwner();}
}
let stopping=false;
for(const signal of ["SIGTERM","SIGINT"])process.on(signal,()=>{if(stopping)return;stopping=true;closeOwner().then(()=>{process.exitCode=2;}).catch(e=>{process.stderr.write(String(e)+"\n");process.exitCode=2;});});
main().then(r=>process.stdout.write(JSON.stringify({state:r.state,operationId:r.operationId,screenshots:r.screenshots.length})+"\n")).catch(e=>{process.stderr.write(String(e.stack||e)+"\n");process.exitCode=2;});
