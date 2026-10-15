import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
async function downloadBytes(page,click){const waiting=page.waitForEvent("download");await click();const d=await waiting,stream=await d.createReadStream();if(!stream)throw Error("Downloaded stream unavailable");const chunks=[];for await(const c of stream)chunks.push(c);return {name:d.suggestedFilename(),bytes:Buffer.concat(chunks)}}
export async function receiveOrkyoBrowser({page,origin,html,outputDirectory}){
 if(!page||!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin))throw Error("Provide the existing caller-owned page and actual loopback origin");
 await fs.mkdir(outputDirectory);const target=origin+"/orkyo-receiving-"+crypto.randomUUID()+".html",checks=[],assert=(v,n)=>{if(!v)throw Error(n);checks.push(n)};
 await page.route(target,route=>route.fulfill({status:200,contentType:"text/html; charset=utf-8",body:html}));
 try{
 await page.goto(target);await page.setViewportSize({width:1440,height:1000});
 await page.locator('[data-tab="workspace-tab"]').click();await page.locator("#example").click();
 await page.locator('[data-tab="review"]').click();assert((await page.locator("#rows").innerText()).includes("authored-request-701"),"Actual desk opens the authored full history and target ID");
 await page.locator('[data-tab="workspace-tab"]').click();const workspace=await downloadBytes(page,()=>page.locator("#export-json").click()),parsed=JSON.parse(workspace.bytes.toString("utf8"));
 assert(parsed.events.length===18,"Actual workspace download contains the complete authored command course");
 const report=await downloadBytes(page,()=>page.locator("#report").click());assert(report.bytes.toString("utf8").includes("authored-request-701"),"Actual report download retains outcome IDs");
 await fs.writeFile(path.join(outputDirectory,"Actual_Workspace.json"),workspace.bytes);await fs.writeFile(path.join(outputDirectory,"Actual_Report.html"),report.bytes);
 await page.locator("#title").fill("Actual browser receiving — authored CSV");await page.locator("#new").click();await page.locator('[data-tab="intake"]').click();
 const original=Buffer.from('name,min_duration_value,min_duration_unit\nBrowser authored job,150,minutes\n',"utf8");
 await page.locator("#source-file").setInputFiles({name:"browser-authored.csv",mimeType:"text/csv",buffer:original});await page.waitForFunction(()=>!document.querySelector("#source-file").disabled);
 await page.locator("#tenant").fill("Authored browser receiving tenant");await page.locator("#source-id").fill("browser-source");await page.locator("#retain-source").click();
 await page.locator('[data-tab="review"]').click();await page.locator('[data-row="row:1"]').click();await page.locator("#reviewer").fill("Authored browser operator");await page.locator("#review-reason").fill("Actual browser course; authored request-only scope and exact 150-minute value.");
 await page.locator("#acknowledged").fill("structural-scope");await page.locator("#save-review").click();await page.locator('[data-select="row:1"]').check();await page.locator("#batch-id").fill("browser-batch");await page.locator("#prepare").click();
 await page.locator('[data-tab="batches-tab"]').click();const native=await downloadBytes(page,()=>page.locator("#native-download").click());assert(native.bytes.toString("utf8").includes("150"),"Actual native batch download preserves reviewed duration");
 await fs.writeFile(path.join(outputDirectory,"Actual_Native.csv"),native.bytes);
 await page.locator("#confirm-tenant").fill("Authored browser receiving tenant");await page.locator("#operator").fill("Authored browser operator");await page.locator("#route").fill("Authored receiving course; no provider request");await page.locator("#mark-attempt").click();
 await page.locator("#outcome-target").fill("authored-browser-target");await page.locator("#outcome-reviewer").fill("Authored browser operator");await page.locator("#outcome-reason").fill("Authored complete response used by this browser receiving course.");await page.locator("#outcome-evidence").fill('{"id":"authored-browser-target","basis":"authored"}');await page.locator("#resolve").click();
 assert((await page.locator("#batch-detail").innerText()).includes("authored-browser-target"),"Actual outcome form preserves the target ID and full response");
 await page.locator('[data-tab="intake"]').click();const originalRead=await downloadBytes(page,()=>page.locator("#download-original").click());assert(hash(originalRead.bytes)===hash(original),"Actual original-file download matches uploaded bytes");
 await page.locator('[data-tab="workspace-tab"]').click();await page.locator("#note-title").fill("Uncommitted receiving note");await page.locator("#note-text").fill("Preserve this exact pending form through save and reopen.");await page.locator("#save").click();
 page.once("dialog",dialog=>dialog.accept());const copy=await downloadBytes(page,()=>page.locator("#emergency").click());const copyBody=JSON.parse(copy.bytes.toString("utf8"));assert(copyBody.forms["note-text"]==="Preserve this exact pending form through save and reopen.","Complete draft export includes uncommitted operator forms");
 await page.locator("#note-text").fill("Later text remains independently retained.");await page.locator("#import-copy").setInputFiles({name:"Exact_Copy.json",mimeType:"application/json",buffer:copy.bytes});await page.waitForFunction(()=>!document.querySelector("#import-copy").disabled);
 assert(await page.locator("#note-text").inputValue()==="Preserve this exact pending form through save and reopen.","Exact exported complete copy restores the retained pending draft");
 await page.screenshot({path:path.join(outputDirectory,"desk-desktop.png"),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(outputDirectory,"desk-narrow.png"),fullPage:true});
 const reportURL=origin+"/orkyo-report-"+crypto.randomUUID()+".html";await page.route(reportURL,route=>route.fulfill({status:200,contentType:"text/html; charset=utf-8",body:report.bytes}));
 try{await page.goto(reportURL);assert((await page.locator("body").innerText()).includes("authored-request-701"),"Exact downloaded report reopens on caller origin");await page.screenshot({path:path.join(outputDirectory,"report-narrow.png"),fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(outputDirectory,"report-desktop.png"),fullPage:true});}finally{await page.unroute(reportURL)}
 const result={schema:"tjlabs.orkyo-browser-receiving.v1",basis:"Actual caller-owned page over original self-contained desk. All shop identities, IDs and outcomes in this chapter are authored.",checks,downloads:[workspace,report,native,originalRead,copy].map(x=>({name:x.name,bytes:x.bytes.length,sha256:hash(x.bytes)}))};await fs.writeFile(path.join(outputDirectory,"Browser_Result.json"),JSON.stringify(result,null,2));return result;
 }finally{await page.unroute(target)}
}
