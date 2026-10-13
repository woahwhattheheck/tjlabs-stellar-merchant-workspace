#!/usr/bin/env node
/** Open and use the original received Analysis workspace and its actual exports. */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const spec = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
const directory = path.resolve(spec.directory);
await fs.mkdir(directory, {recursive:true, mode:0o700});
const modulePath = spec.playwright_module;
if (typeof modulePath !== "string" || !path.isAbsolute(modulePath))
  throw Error("Select the actual existing Playwright module path.");
const playwright = require(modulePath);
if (!playwright.chromium || typeof playwright.chromium.launch !== "function")
  throw Error("The selected existing module has no Chromium launcher.");
const identity = async value => {
  const body=await fs.readFile(value);
  return {path:path.resolve(value),bytes:body.length,sha256:crypto.createHash("sha256").update(body).digest("hex")};
};
const sameFile = async (value, expected) => {
  const actual=await identity(value);
  if(actual.bytes!==expected.bytes || actual.sha256!==expected.sha256)throw Error("Actual export differs: "+value);
  return actual;
};
const result={schema:"commons.camino-rendered-receiving.v1",operation:spec.operation,
  edition:spec.edition,started_at:new Date().toISOString(),state:"RUNNING",screenshots:[],downloads:[],
  controls:[],reports:[],warnings:[],runtime:{node:process.execPath,node_version:process.version,
  playwright_module:modulePath,browser_executable:spec.browser_executable}};
const write=async()=>fs.writeFile(path.join(directory,"rendered-receiving.json"),JSON.stringify(result,null,2)+"\n",{mode:0o600});
await write();
let browser;
let stopping=false;
async function stopOriginal(code){
  if(stopping)return;stopping=true;
  result.state="INTERRUPTED";result.error={name:"OriginalReceivingStopped",message:"Original owner resumed this unfinished rendered operation."};
  result.ended_at=new Date().toISOString();
  try{await write();if(browser)await browser.close();}finally{process.exit(code);}
}
process.once("SIGTERM",()=>stopOriginal(143));
process.once("SIGINT",()=>stopOriginal(130));
try {
  const executable=spec.browser_executable || playwright.chromium.executablePath();
  result.runtime.browser_executable=executable;
  browser=await playwright.chromium.launch({headless:true,executablePath:executable,
    args:["--no-sandbox","--disable-dev-shm-usage"]});
  result.runtime.browser_version=browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  // This is the browser's ordinary fallback download path, used when no native picker is exposed.
  await context.addInitScript(()=>{Object.defineProperty(window,"showSaveFilePicker",{value:undefined,configurable:true});});
  const page=await context.newPage();
  page.on("pageerror",e=>result.warnings.push({kind:"page-error",message:e.message}));
  page.on("dialog",d=>d.accept());
  async function shot(label, target=page) {
    const filename=path.join(directory,label+".png");
    await target.screenshot({path:filename,fullPage:false,animations:"disabled"});
    result.screenshots.push({label,...await identity(filename)});await write();
  }
  async function download(label, click, expected=null) {
    const waiting=page.waitForEvent("download",{timeout:60000});
    await click();
    const item=await waiting;
    const failure=await item.failure();if(failure)throw Error("Actual download failed: "+failure);
    const filename=path.join(directory,label+"-"+path.basename(item.suggestedFilename()));
    await item.saveAs(filename);
    const current=expected?await sameFile(filename,expected):await identity(filename);
    result.downloads.push({label,...current});await write();return filename;
  }
  const launch=JSON.parse(await fs.readFile(spec.private_launch,"utf8"));
  const original=new URL(launch.url);
  if(original.hostname!=="127.0.0.1"||original.protocol!=="http:"||!original.hash)
    throw Error("Use the original loopback private launch.");
  await page.goto(launch.url,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#connection")?.textContent==="Connected",null,{timeout:30000});
  result.workspace_id=launch.workspace_id;
  result.controls.push({action:"open-original-workspace",workspace_id:launch.workspace_id});
  await shot("01-workspace-wide");
  await page.locator("#refresh").click();
  await page.waitForFunction(()=>document.querySelector("#connection")?.textContent==="Connected");
  await page.locator('button[data-tab="analysis"]').click();
  const queryNames=await page.locator("#saved-query option").evaluateAll(options=>options.map(o=>o.value).filter(Boolean));
  const queryName=spec.query_name||queryNames.find(name=>/date|difference|period/i.test(name))||queryNames[0];
  if(!queryNames.includes(queryName))throw Error("The retained original query is missing.");
  await page.locator("#saved-query").selectOption(queryName);
  await page.waitForFunction(name=>document.querySelector("#query-name")?.value===name,queryName);
  await page.locator("#run-query").click();
  await page.locator("#query-result").waitFor({state:"visible",timeout:60000});
  await page.waitForFunction(()=>document.querySelector("#message")?.textContent==="Analysis completed and retained.",null,{timeout:60000});
  result.controls.push({action:"run-retained-query",name:queryName,
    summary:await page.locator("#result-info").innerText(),binding:await page.locator("#result-binding").innerText()});
  await shot("02-selected-analysis-wide");
  await download("selected-analysis",()=>page.locator("#export-csv").click());
  await page.setViewportSize({width:390,height:844});
  await shot("03-selected-analysis-narrow");
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('button[data-tab="reports"]').click();
  const reportRow=page.locator("#report-history tr").filter({hasText:spec.report_name}).first();
  await reportRow.getByRole("button",{name:"Open report",exact:true}).click();
  await page.locator("#report-result").waitFor({state:"visible"});
  const reportBinding=await page.locator("#report-result-binding").innerText();
  if(!reportBinding.includes(spec.report_job_id))throw Error("The original report selection changed.");
  const sections=await page.locator("#report-result-section option").evaluateAll(options=>options.map(o=>({value:o.value,label:o.textContent})));
  for(const section of sections){
    await page.locator("#report-result-section").selectOption(section.value);
    await page.waitForFunction(value=>{
      try{return String(JSON.parse(document.querySelector("#report-result-binding").textContent).section.ordinal)===value;}
      catch{return false;}
    },section.value);
    await page.locator("#report-result").scrollIntoViewIfNeeded();
    await shot("04-report-section-"+String(section.value).padStart(2,"0"));
    result.reports.push({section:section.value,label:section.label,
      page:await page.locator("#report-result-page").innerText(),title:await page.locator("#report-section-title").innerText()});
  }
  if(spec.report_publication_id)
    await page.locator("#report-export-publication").selectOption(spec.report_publication_id);
  await page.locator("#report-export-html").click();
  await page.locator("#report-download-area").waitFor({state:"visible",timeout:60000});
  if(spec.report_files?.length!==1)throw Error("Select the actual original complete HTML export.");
  const downloadedReport=await download("report",()=>page.locator("#report-download").click(),spec.report_files[0]);
  const reportPage=await context.newPage();
  await reportPage.goto(pathToFileURL(downloadedReport).href,{waitUntil:"load"});
  await shot("05-reopened-report-wide",reportPage);
  const exportedSections=reportPage.locator('section[id^="section-"]');
  const exportedCount=await exportedSections.count();
  for(let i=0;i<exportedCount;i++){
    const section=exportedSections.nth(i),heading=section.locator("h2"),rows=section.locator("tbody tr");
    await heading.scrollIntoViewIfNeeded();
    await shot("05-report-section-"+i+"-heading-wide",reportPage);
    const rowCount=await rows.count();
    const selectedRows=[...new Set([0,Math.floor(rowCount/2),rowCount-1])].filter(n=>n>=0);
    for(const row of selectedRows){
      await rows.nth(row).scrollIntoViewIfNeeded();
      await shot("05-report-section-"+i+"-row-"+row+"-wide",reportPage);
    }
    const scroller=section.locator(".table-scroll");
    await scroller.evaluate(element=>{element.scrollLeft=element.scrollWidth-element.clientWidth;});
    await heading.scrollIntoViewIfNeeded();
    await shot("05-report-section-"+i+"-last-columns-wide",reportPage);
    result.controls.push({action:"open-and-scroll-exported-section",section:i,rows:rowCount,selectedRows,
      heading:await heading.innerText()});
    await scroller.evaluate(element=>{element.scrollLeft=0;});
    await reportPage.setViewportSize({width:390,height:844});
    await heading.scrollIntoViewIfNeeded();
    await shot("06-report-section-"+i+"-narrow",reportPage);
    await reportPage.setViewportSize({width:1440,height:1000});
  }
  result.controls.push({action:"download-and-reopen-report",file:await identity(downloadedReport)});
  await reportPage.close();
  await page.locator('button[data-tab="workbooks"]').click();
  const workbookRows=page.locator("#workbook-history tr");
  const count=await workbookRows.count();let selected=false;
  for(let i=0;i<count;i++){
    const button=workbookRows.nth(i).getByRole("button",{name:"Open",exact:true});
    if(!await button.count())continue;
    const opened=page.waitForResponse(response=>/\/api\/jobs\/[a-f0-9]{32}$/.test(new URL(response.url()).pathname)&&response.status()===200);
    await button.click();
    const selectedJob=await (await opened).json();
    await page.locator("#workbook-detail").waitFor({state:"visible"});
    await page.waitForFunction(id=>document.querySelector("#workbook-detail-info")?.textContent.includes(id),selectedJob.id);
    if(selectedJob.id===spec.workbook_job_id){selected=true;break;}
  }
  if(!selected)throw Error("The original complete workbook is missing from retained history.");
  await page.locator("#workbook-detail-definition").click();
  await page.locator("#workbook-preview").click();
  await page.locator("#workbook-preview-panel").waitFor({state:"visible",timeout:30000});
  const sheets=await page.locator("#workbook-preview-sheet option").evaluateAll(options=>options.map(o=>({value:o.value,label:o.textContent})));
  result.workbook_sheets=sheets;
  for(const sheet of sheets){
    const response=page.waitForResponse(value=>value.url().includes("/preview?")&&new URL(value.url()).searchParams.get("sheet")===sheet.value&&value.status()===200);
    await page.locator("#workbook-preview-sheet").selectOption(sheet.value);
    const cells=await (await response).json();
    await page.waitForFunction(expected=>{
      const headers=[...document.querySelectorAll("#workbook-preview-head th")].map(item=>item.textContent);
      const rows=[...document.querySelectorAll("#workbook-preview-body tr")];
      const first=rows[0]?[...rows[0].querySelectorAll("td")].map(item=>[...item.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent).join("")):[];
      return JSON.stringify(headers)===JSON.stringify(expected.headers)&&JSON.stringify(first)===JSON.stringify(expected.first);
    },{headers:cells.sheet.columns.map(item=>item.header),first:(cells.rows[0]||[]).map(item=>item.value===null?"[empty cell]":String(item.value))});
    await page.locator("#workbook-preview-panel").scrollIntoViewIfNeeded();
    await shot("07-workbook-sheet-"+String(result.screenshots.length).padStart(2,"0"));
  }
  const fileRows=page.locator("#workbook-files tr");
  const files=await fileRows.count();
  for(let i=0;i<files;i++){
    const row=fileRows.nth(i), name=(await row.locator("td").first().innerText()).trim();
    if(!name.endsWith(".xlsx"))continue;
    const originalFile=spec.workbook_files?.find(item=>item.name===name) ||
      (spec.workbook_files?.length===1?spec.workbook_files[0]:null);
    const retained=await download("workbook",()=>row.getByRole("button",{name:"Download",exact:true}).click(),originalFile);
    const actual=await identity(retained);
    if(!spec.workbook_files?.some(item=>item.bytes===actual.bytes&&item.sha256===actual.sha256))
      throw Error("The downloaded workbook differs from the selected original complete export.");
  }
  if(!result.downloads.some(item=>item.path.endsWith(".xlsx")))throw Error("No actual workbook download was received.");
  await page.setViewportSize({width:390,height:844});
  await shot("08-workbook-narrow");
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('button[data-tab="activity"]').click();
  await shot("09-retained-workspace-activity");
  result.controls.push({action:"open-saved-workbook-and-preview-every-sheet",job_id:spec.workbook_job_id});
  result.state="RENDERED";
  result.completed_at=new Date().toISOString();
  await write();
} catch(error){
  result.state="INTERRUPTED";result.error={name:error.name,message:error.message,stack:error.stack};
  result.ended_at=new Date().toISOString();await write();throw error;
} finally {if(browser)await browser.close();}
console.log(JSON.stringify({state:result.state,result:path.join(directory,"rendered-receiving.json"),
  screenshots:result.screenshots,downloads:result.downloads}));
