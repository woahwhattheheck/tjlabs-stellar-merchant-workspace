#!/usr/bin/env node
// MIT. Complete browser operator journey against an actual saved Haystack projection.
import {promises as fs} from "node:fs";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {startServer} from "./server.mjs";
import {HaystackWorkspace} from "./store.mjs";
import {HaystackClient} from "./client.mjs";
import {stringifyJson,canonicalJson} from "./json-codec.mjs";
import {plainRead,createOnlyFile,exists} from "./files.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const json=v=>Buffer.from(stringifyJson(v,2)+"\n"),equal=(a,b)=>canonicalJson(a)===canonicalJson(b);
function need(v,message){if(!v)throw Error(message);}
async function read(path){return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await plainRead(path)));}
async function retained(path,value){await createOnlyFile(path,json(value));return value;}
async function optional(path){return await exists(path)?read(path):null;}
async function checkedFile(path,bytes){await createOnlyFile(path,bytes);const saved=await plainRead(path);need(saved.length===bytes.length&&sha(saved)===sha(bytes),"The retained complete browser file differs.");return{path,bytes:saved.length,sha256:sha(saved)};}
const cleanResult=v=>{const x=structuredClone(v);delete x.replayed;return x;};
export const PROJECTION_BROWSER_SCHEMA="commons.haystack.projection-browser.v1";

/** Uses only the supplied original workspace and its real browser/HTTP interface. */
export async function runProjectionBrowser(input){
 need(input?.schema===PROJECTION_BROWSER_SCHEMA&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.operationId)&&/^[0-9a-f]{64}$/.test(input.versionId),"Supply the complete browser programme input.");
 const out=resolve(input.outputDirectory),directory=resolve(input.directory);
 need(out!==directory&&!out.startsWith(directory+"/"),"Retain browser artifacts outside the selected workspace.");
 await fs.mkdir(out,{recursive:true,mode:0o700});
 await retained(join(out,"input.json"),input);
 const done=await optional(join(out,"complete.json"));
 if(done){for(const a of done.artifacts){const b=await plainRead(a.path);need(b.length===a.bytes&&sha(b)===a.sha256,"A completed browser artifact changed.");}return{...done,reused:true};}
 const workspace=new HaystackWorkspace(directory),state=await workspace.read();
 need(state.workspaceId===input.workspaceId,"The selected browser workspace changed.");
 const priorServer=await optional(join(out,"server-selection.json"));
 if(priorServer)need(priorServer.workspaceId===state.workspaceId,"The original browser server selection changed.");
 const server=await startServer({directory,host:"127.0.0.1",port:priorServer?.port??0,expectedWorkspaceId:state.workspaceId});
 const client=new HaystackClient({url:server.url,workspaceId:state.workspaceId});
 const artifacts=[],requests=[],pages=[];
 let context;
 try{
  await retained(join(out,"server-selection.json"),{workspaceId:state.workspaceId,port:Number(new URL(server.url).port),url:server.url});
  await client.connect();
  const {chromium}=await import(pathToFileURL(resolve(input.playwrightModule)).href);
  context=await chromium.launchPersistentContext(join(out,"browser-profile"),{headless:true,executablePath:resolve(input.chromiumExecutable),viewport:{width:1440,height:1000},acceptDownloads:true,args:["--no-sandbox"]});
  const page=context.pages()[0]??await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("dialog",d=>d.accept());
  async function idle(){await page.waitForFunction(()=>!document.getElementById("refresh").disabled);const notice=page.locator("#notice");if(await notice.getAttribute("data-kind")==="error")throw Error(await notice.textContent());}
  async function connect(){
   await page.goto(server.url.replace(/\/$/,"")+"/projection.html",{waitUntil:"networkidle"});
   await page.locator("#origin").fill(server.url);await page.locator("#token").fill("");
   await page.locator("#connect button").click();await page.waitForFunction(id=>document.getElementById("identity").textContent.includes(id),input.workspaceId);await idle();
  }
  async function openProjection(versionId){
   await page.locator("#refresh").click();await idle();
   await page.locator('[data-view="compose"]').click();
   await page.locator("#projection").selectOption(input.projectionId);await idle();
   await page.locator("#projection-version").selectOption(versionId??"");
   await page.locator("#open-projection button").click();await idle();
   await page.waitForFunction(id=>document.getElementById("saved-binding").textContent.includes(id),input.projectionId);
  }
  async function capture(name){
   need(errors.length===0,"The actual projection browser returned an unhandled error: "+errors.join("; "));
   const file=join(out,name+".png");
   if(!(await exists(file)))await checkedFile(file,await page.screenshot({fullPage:true}));
   const bytes=await plainRead(file);artifacts.push({path:file,bytes:bytes.length,sha256:sha(bytes)});pages.push({name,url:new URL(page.url()).pathname,viewport:page.viewportSize()});
  }
  async function originalOutcome(record){
   try{return await client.request("operation.read",{operationId:record.args.operationId});}
   catch(e){if(e.status!==404)throw e;return client.request(record.action,record.args);}
  }
  async function uiMutation(name,action,fields,trigger){
   const intentFile=join(out,name+".request.json"),returnFile=join(out,name+".return.json");
   let record=await optional(intentFile),result=await optional(returnFile);
   if(record){
    const selected={...record.args};delete selected.operationId;delete selected.expectedRevision;
    need(record.workspaceId===input.workspaceId&&record.action===action&&equal(selected,fields),"An existing browser request belongs to another exact selection.");
    const current=await originalOutcome(record);
    if(result)need(equal(cleanResult(result),cleanResult(current)),"The original native browser receipt changed.");
    else result=await retained(returnFile,current);
   }else{
    let captured=null,captureFailure=null;
    const route=async r=>{
     const req=r.request();let body;try{body=req.postDataJSON();}catch{}
     if(req.method()!=="POST"||body?.action!==action){await r.continue();return;}
     try{
      need(!captured,"The browser attempted a duplicate selected mutation.");
      const selected={...body.args};delete selected.operationId;delete selected.expectedRevision;
      need(equal(selected,fields),"The posted browser selection differs from the reviewed programme.");
      captured={schema:"commons.haystack.projection-browser-request.v1",workspaceId:input.workspaceId,action,args:body.args};
      await retained(intentFile,captured);
      await r.continue();
     }catch(e){captureFailure=e;await r.abort("failed");}
    };
    await page.route("**/api/action",route);
    try{
     const response=page.waitForResponse(r=>{try{return r.request().method()==="POST"&&r.request().postDataJSON()?.action===action;}catch{return false;}}).then(value=>({value}),error=>({error}));
     await trigger();
     const pending=await response;if(pending.error)throw pending.error;const returned=pending.value,raw=await returned.body();
     await checkedFile(join(out,name+".http-response.json"),json({status:returned.status(),bodyBase64:raw.toString("base64"),bytes:raw.length,sha256:sha(raw)}));
     if(captureFailure)throw captureFailure;
     need(captured&&returned.ok(),"The selected original browser mutation did not complete.");
     result=JSON.parse(raw.toString("utf8"));
     need(result.operationId===captured.args.operationId&&result.workspaceId===input.workspaceId,"The original browser response identity differs.");
     record=captured;await retained(returnFile,result);
     await idle();
    }finally{await page.unroute("**/api/action",route);}
   }
   requests.push({name,action,operationId:record.args.operationId,revision:result.revision});return result;
  }
  await connect();await openProjection(input.versionId);
  const observed=await client.request("projection.read",{expectedRevision:(await client.request("workspace.status",{})).revision,projectionId:input.projectionId,versionId:input.versionId});
  let original=await optional(join(out,"original-selection.json"));
  if(original)need(original.version.id===observed.version.id&&equal(original.profile,observed.profile)&&original.modelId===observed.modelId&&original.gridSha256===observed.gridSha256,"The immutable original browser selection changed.");
  else original=await retained(join(out,"original-selection.json"),observed);
  need(original.modelId===input.modelId,"The browser selected another saved semantic model.");
  const profile=structuredClone(original.profile);
  profile.description=profile.description+"\nOperator programme "+input.operationId+": browser-reviewed projection; no station or customer acceptance is inferred.";
  // The complete profile import retains every column and explicit conversion.
  const completeProfile=page.locator("details").filter({has:page.locator("#profile-json")});
  if(await completeProfile.getAttribute("open")===null)await completeProfile.locator("summary").click();
  await page.locator("#profile-json").fill(stringifyJson(profile,2));
  await page.locator("#profile-apply").click();await idle();
  await page.locator("#preview").click();await idle();
  need((await page.locator("#preview-state").textContent()).includes(String(profile.entityIds.length)+" rows"),"The browser did not preview all selected entities.");
  await page.locator("#grid tr").first().click();await capture("desktop-preview-lineage");
  await page.locator('[data-view="compose"]').click();
  await page.locator("#author").fill(input.author);await page.locator("#note").fill("Explicit operator programme browser edit.");
  const saved=await uiMutation("browser-save","projection.save",{modelId:original.modelId,versionId:original.modelVersionId,profile,author:input.author,note:"Explicit operator programme browser edit.",projectionId:input.projectionId,expectedHeadId:original.projection.headId},()=>page.locator("#save").click());
  await openProjection(saved.version.id);
  await page.locator('[data-view="review"]').click();await page.locator("#decision").selectOption("ready");
  await page.locator("#review-author").fill(input.author);await page.locator("#review-note").fill("Actual browser review of the complete retained public-source projection.");
  await uiMutation("browser-review","projection.review",{projectionId:input.projectionId,expectedHeadId:saved.version.id,decision:"ready",author:input.author,note:"Actual browser review of the complete retained public-source projection."},()=>page.locator("#review-form button").click());
  await openProjection(saved.version.id);await page.locator('[data-view="review"]').click();
  await page.locator("#publish-author").fill(input.author);await page.locator("#publish-note").fill("Operator programme publishes the reviewed grid only into this original workspace.");
  await page.locator("#select-native").check();
  const publication=await uiMutation("browser-publish","projection.publish",{projectionId:input.projectionId,expectedHeadId:saved.version.id,author:input.author,note:"Operator programme publishes the reviewed grid only into this original workspace.",select:true},()=>page.locator("#publish-form button").click());
  await openProjection(saved.version.id);await page.locator('[data-view="review"]').click();await capture("desktop-saved-review");
  async function delivery(name,kind,format){
   await page.locator('[data-view="delivery"]').click();await page.locator("#delivery-kind").selectOption(kind);await page.locator("#delivery-format").selectOption(format);
   const wasStarted=await exists(join(out,name+".request.json"));
   const downloading=wasStarted?null:page.waitForEvent("download").then(value=>({value}),error=>({error}));
   const receipt=await uiMutation(name,"delivery.prepare",{kind,projectionId:input.projectionId,versionId:saved.version.id,format},()=>page.locator("#delivery-form button").click());
   let actualDownload;
   if(downloading){const event=await downloading;if(event.error)throw event.error;actualDownload=event.value;}
   else{
    await page.locator("#refresh").click();await idle();await page.locator('[data-view="requests"]').click();
    const card=page.locator("#requests article").filter({hasText:receipt.operationId});
    need(await card.count()===1,"The original browser request is not present in its preserved profile.");
    const event=page.waitForEvent("download");await card.getByRole("button",{name:"Read receipt and continue",exact:true}).click();actualDownload=await event;
   }
   const downloaded=await plainRead(await actualDownload.path());
   need(downloaded.length===receipt.bytes&&sha(downloaded)===receipt.sha256,"The actual browser download differs from its complete native delivery.");
   artifacts.push(await checkedFile(join(out,name+"-"+receipt.name.replace(/[^a-zA-Z0-9._-]/g,"_")),downloaded));
   await idle();return receipt;
  }
  const deliveries=[];
  for(const [name,kind,format]of [["grid","projection-grid","json"],["lineage","projection-lineage","csv"],["report","projection-report","html"]])deliveries.push(await delivery(name,kind,format));
  await openProjection(saved.version.id);await page.locator('[data-view="delivery"]').click();
  await page.locator("#compare-before").selectOption(input.versionId);await page.locator("#compare-after").selectOption(saved.version.id);
  await page.locator("#compare-form button").click();await idle();need((await page.locator("#comparison").textContent()).includes("complete compared entities"),"The browser comparison did not complete.");
  await capture("desktop-version-comparison");
  await page.setViewportSize({width:390,height:844});await page.locator('[data-view="review"]').click();await capture("phone-saved-review");
  await page.reload({waitUntil:"networkidle"});await page.locator("#origin").fill(server.url);await page.locator("#connect button").click();
  await page.waitForFunction(id=>document.getElementById("identity").textContent.includes(id),input.workspaceId);await idle();
  need((await page.locator("#saved-binding").textContent()).includes(saved.version.id),"The browser did not restore its original saved projection after reload.");
  await capture("phone-reloaded-projection");
  const native=await client.request("projection.read",{expectedRevision:(await client.request("workspace.status",{})).revision,projectionId:input.projectionId});
  need(native.version.id===saved.version.id&&equal(native.profile,profile),"The final browser projection differs from its retained exact save.");
  const result={schema:PROJECTION_BROWSER_SCHEMA,operationId:input.operationId,inputSha256:sha(json(input)),workspaceId:input.workspaceId,projectionId:input.projectionId,initialVersionId:input.versionId,versionId:saved.version.id,status:"COMPLETED",publication,requests,deliveries,pages,artifacts,pageErrors:errors,meaning:"Actual operator browser journey over retained source; no station or customer acceptance is inferred."};
  await retained(join(out,"complete.json"),result);return result;
 }finally{try{await context?.close();}finally{await server.close();}}
}
export async function main(argv=process.argv.slice(2)){need(argv.length===2&&argv[0]==="--input","Use --input COMPLETE_JSON.");const result=await runProjectionBrowser(await read(resolve(argv[1])));process.stdout.write(stringifyJson(result)+"\n");}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{process.stderr.write(stringifyJson({error:e.message,code:e.code??null})+"\n");process.exitCode=1;});
