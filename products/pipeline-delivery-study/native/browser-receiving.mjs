import * as fs from "node:fs/promises";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
const sha=b=>createHash("sha256").update(b).digest("hex");
export async function receivePipeline({page,appURL,outputDir}) {
  if(!page||!appURL||!outputDir)throw Error("Supply the caller-owned page, actual app URL and new output directory");
  await fs.mkdir(outputDir,{recursive:false});const outputs=[],originalViewport=page.viewportSize();
  const save=async(name,bytes)=>{const p=path.join(outputDir,name);await fs.writeFile(p,bytes,{flag:"wx"});outputs.push({name,bytes:bytes.length,sha256:sha(bytes)});return p};
  async function download(selector,name) {const waiting=page.waitForEvent("download");await page.locator(selector).click();const got=await waiting,raw=await fs.readFile(await got.path());await save(name,raw);return raw}
  await page.goto(appURL);await page.waitForFunction(()=>globalThis.pipelineDesk&&document.getElementById("save").disabled===false);await page.evaluate(()=>pipelineDesk.ready);
  const original=await page.evaluate(()=>pipelineDesk.snapshot()),collections=original.workspace.collections;
  if(!collections.length)throw Error("This course requires an actual or authored populated working file");
  const selected=collections.find(x=>x.id===original.session.collection_id)||collections.at(-1);
  await page.locator("#collection").selectOption(selected.id);
  const buttons=page.locator("#targets [data-target]");if(await buttons.count()<2)throw Error("Need two retained review targets");
  await page.locator("#fork").click();await page.waitForFunction(()=>!document.getElementById("fork").disabled&&document.getElementById("notice").textContent.includes("Independent complete copy"));
  await buttons.nth(1).click();const priorSecondNote=await page.locator("#note").inputValue();
  await buttons.nth(0).click();const first=await page.locator("#review-target").textContent();
  await page.locator("#reviewer").fill("Receiving operator");await page.locator("#note").fill("First target retained\nSecond literal line");
  await buttons.nth(1).click();if(await page.locator("#note").inputValue()!==priorSecondNote)throw Error("Previous note leaked to second target");
  await page.locator("#note").fill("Second target unfinished note");await buttons.nth(0).click();
  if(await page.locator("#note").inputValue()!=="First target retained\nSecond literal line")throw Error("First target draft was lost");
  await page.locator("#retain-review").click();await page.waitForFunction(()=>!document.getElementById("retain-review").disabled&&document.getElementById("notice").textContent.includes("Local review retained"));
  await page.locator("#fork").click();await page.waitForFunction(()=>!document.getElementById("fork").disabled&&document.getElementById("notice").textContent.includes("Independent complete copy"));
  const working=await download("#download-working","working.json"),reopened=JSON.parse(working.toString("utf8"));
  if(reopened.session.fields.note!=="First target retained\nSecond literal line")throw Error("Working export lost literal note");
  const portable=await download("#download-portable","portable-desk.html"),report=await download("#download-report","report.html");
  await download("#download-csv","episodes-safe.csv");const col=await download("#download-collection","collection.json");
  if(JSON.stringify(JSON.parse(col.toString("utf8")))!==JSON.stringify(selected))throw Error("Collection download changed original data");
  const originals=[...selected.responses.map(x=>({body:x.body})),...selected.artifacts.map(x=>({body:x.body,external:x.storage==="external",capture_id:x.capture_id})),{body:reopened.workspace.spec}];
  for(let i=0;i<originals.length;i++){const raw=await download('#originals [data-original="'+i+'"]',"original-"+String(i).padStart(3,"0")+".bin"),x=originals[i];if(x.external){const got=JSON.parse(raw.toString("utf8"));if(got.capture_id!==x.capture_id||got.sha256!==x.body.sha256||got.bytes!==x.body.bytes)throw Error("External locator changed")}else if(raw.length!==x.body.bytes||sha(raw)!==x.body.sha256)throw Error("Original download differs at "+i)}
  for(const [label,size] of [["desktop",{width:1440,height:1000}],["narrow",{width:390,height:844}]]){await page.setViewportSize(size);await page.screenshot({path:path.join(outputDir,"desk-"+label+".png"),fullPage:true})}
  const context=page.context(),preview=await context.newPage(),base=new URL(appURL),token=randomUUID(),reportURL=new URL("pipeline-report-"+token+".html",base).href,portableURL=new URL("pipeline-portable-"+token+".html",base).href;
  const reportHandler=route=>route.fulfill({status:200,contentType:"text/html",body:report}),portableHandler=route=>route.fulfill({status:200,contentType:"text/html",body:portable});
  await context.route(reportURL,reportHandler);await context.route(portableURL,portableHandler);
  try {
    await preview.goto(reportURL);
    for(const [label,size] of [["desktop",{width:1440,height:1000}],["narrow",{width:390,height:844}]]){await preview.setViewportSize(size);await preview.screenshot({path:path.join(outputDir,"report-"+label+".png"),fullPage:true})}
    await preview.goto(portableURL);await preview.waitForFunction(()=>globalThis.pipelineDesk&&document.getElementById("save").disabled===false);
    const again=await preview.evaluate(()=>pipelineDesk.snapshot());
    if(again.workspace.id!==reopened.workspace.id||JSON.stringify(again.session)!==JSON.stringify(reopened.session))throw Error("Portable reopen ignored embedded complete state");
  }finally{await context.unroute(reportURL,reportHandler);await context.unroute(portableURL,portableHandler);await preview.close();if(originalViewport)await page.setViewportSize(originalViewport)}
  const outcome={schema:"tjlabs.pipeline-browser-receiving.v1",at:new Date().toISOString(),appURL,workspace_id:reopened.workspace.id,collection_id:selected.id,first_target:first,checks:["two-target draft attribution","local review retains supplier evidence","independent copy","whole JSON and portable reopen","report/CSV/collection downloads","every original or external-locator download","desktop/narrow desk/report LOOK"],outputs,requiresHumanLook:"Inspect the retained exact screenshots and all returned media/attachments; automated capture alone is not rendered acceptance."};
  await save("receiving.json",Buffer.from(JSON.stringify(outcome,null,2)));return outcome;
}
