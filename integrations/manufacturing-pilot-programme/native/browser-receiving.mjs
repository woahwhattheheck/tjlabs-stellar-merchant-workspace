import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
export async function receiveManufacturing({page,url,outputDirectory,expectedOperation}){
 if(!page||!url||!outputDirectory||!expectedOperation)throw Error("Use the caller's existing page, exact desk URL, new output directory and original operation ID.");
 const out=path.resolve(outputDirectory);await fs.mkdir(out,{mode:0o700});
 const received=[],screenshots=[];const onDialog=dialog=>dialog.type()==="confirm"?dialog.accept():dialog.dismiss();
 page.on("dialog",onDialog);
 async function download(selector,name){
  const promised=page.waitForEvent("download");await page.locator(selector).click();const d=await promised;const target=path.join(out,name);await d.saveAs(target);const bytes=await fs.readFile(target);received.push({path:name,bytes:bytes.length,sha256:sha(bytes)});return {target,bytes,text:new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes)};
 }
 const check=(condition,message)=>{if(!condition)throw Error(message)};
 try{
  await page.goto(url);await page.locator("#cards article").first().waitFor();
  const initial=await download("#json","initial-complete-workspace.json");const original=JSON.parse(initial.text);
  check(original.schema==="tjlabs.prospect-workspace.v3"&&original.programme.operation_id===expectedOperation,"Original workspace/operation differs");
  check(original.programme.profiles.length===10,"All ten profiles must be present");
  const id=original.programme.profiles[0].id;const article=page.locator("article[data-profile]").filter({has:page.locator('[data-notes="'+id+'"]')});
  await page.locator("#search").fill("");await page.locator("#group").selectOption("all");
  const details=article.locator("details.pilot");if(!await details.evaluate(el=>el.open))await details.locator("summary").click();
  const draft="Receiving-only unfinished station study; no manufacturer result.";
  await article.locator('[data-pilot="'+id+'"][data-field="timebase"]').fill(draft);
  await article.locator('[data-pilot="'+id+'"][data-field="quality_outcome"]').fill("Receiving-only source reference remains to be supplied.");
  await page.locator("#edition-id").fill("RECEIVING-UNFINISHED-EDITION");
  await page.locator("#edition-recorder").fill("Existing equipped receiver");
  const working=await download("#json","complete-unfinished-working-copy.json");const expected=JSON.parse(working.text);
  check(expected.working[id].pilot.timebase===draft&&expected.deskDraft.edition_id==="RECEIVING-UNFINISHED-EDITION","Actual controls were not retained");
  await page.reload();await page.locator("#import").setInputFiles(working.target);
  await page.waitForFunction(()=>document.getElementById("notice").textContent.includes("Complete ten-profile workspace opened")&&!document.getElementById("import").disabled);
  check(await page.locator("#edition-id").inputValue()==="RECEIVING-UNFINISHED-EDITION","Unfinished delivery control did not reopen");
  const reopened=JSON.parse((await download("#json","reopened-complete-working-copy.json")).text);
  check(reopened.working[id].pilot.timebase===draft&&JSON.stringify(reopened.briefHistory)===JSON.stringify(expected.briefHistory)&&JSON.stringify(reopened.editions)===JSON.stringify(expected.editions),"Complete original histories or unfinished study changed on reopen");
  for(let i=0;i<original.editions.length;i++){
   const edition=original.editions[i];await page.locator("#edition-choice").selectOption(edition.id);
   for(const kind of ["json","csv","html"]){const result=await download(kind==="html"?"#deliver-report":"#deliver-"+kind,"edition-"+(i+1)+"."+kind);check(result.text===edition.outputs[kind].content,"Retained customer "+kind+" changed");}
  }
  await download("#csv","working-profiles.csv");const report=await download("#report","working-report.html");
  for(const[width,height,label]of [[1440,1000,"desktop"],[390,844,"narrow"]]){
   await page.setViewportSize({width,height});const filename="desk-"+label+".png";await page.screenshot({path:path.join(out,filename),fullPage:true});screenshots.push(filename);
  }
  const reportPage=await page.context().newPage();
  try{
   await reportPage.setContent(report.text,{waitUntil:"domcontentloaded"});
   check(await reportPage.locator("article").count()===10,"Working report lost a profile");
   for(const[width,height,label]of [[1440,1000,"desktop"],[390,844,"narrow"]]){await reportPage.setViewportSize({width,height});const filename="report-"+label+".png";await reportPage.screenshot({path:path.join(out,filename),fullPage:true});screenshots.push(filename);}
  }finally{await reportPage.close();}
  const result={schema:"tjlabs.manufacturing-browser-receiving.v1",operation_id:expectedOperation,source_url:url,checks:["original complete ten-profile working file","visible31-field study edit","unfinished study and delivery-control export/reopen","original brief and customer-edition history retained","every retained customer JSON/CSV/HTML byte-exact","complete working CSV/report","desktop and narrow desk/report captured"],files:received,screenshots,visual_review:"The existing producing/receiving operator must inspect the actual captured images and opened downloads, record findings and repair any issue. Capturing files does not establish LOOK completion."};
  await fs.writeFile(path.join(out,"receiving-result.json"),JSON.stringify(result,null,2)+"\n",{flag:"wx",mode:0o600});return result;
 }finally{page.off("dialog",onDialog);}
}
