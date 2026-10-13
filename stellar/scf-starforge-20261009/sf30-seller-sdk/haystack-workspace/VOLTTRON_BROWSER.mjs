import {promises as fs} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {HaystackClient} from "./client.mjs";
import {plainRead,createOnlyFile} from "./files.mjs";
import {stringifyJson} from "./json-codec.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex"),json=v=>Buffer.from(stringifyJson(v,2)+"\n");
const need=(c,m)=>{if(!c)throw Error(m);};
async function save(path,bytes){await fs.mkdir(dirname(path),{recursive:true,mode:0o700});await createOnlyFile(path,bytes);return{path,bytes:bytes.length,sha256:sha(bytes)};}
async function present(path){try{return await plainRead(path,192*1024*1024);}catch(e){if(e.code==="ENOENT")return null;throw e;}}
export async function receiveVolttronBrowser({url,workspaceId,editionIds,outputDirectory,playwrightModule,chromium,token="",launchOptions={}}){
 need(Array.isArray(editionIds)&&editionIds.length,"Select all original frozen editions for browser receiving.");
 const root=resolve(outputDirectory),selection={workspaceId,editionIds,playwrightModule:resolve(playwrightModule),chromium:chromium?resolve(chromium):null},completedPath=join(root,"complete-browser.json");
 const existing=await present(completedPath);if(existing){const result=JSON.parse(existing.toString("utf8"));need(JSON.stringify(result.selection)===JSON.stringify(selection),"The completed browser belongs to another selected source.");
  for(const f of result.files){const bytes=await plainRead(f.path,192*1024*1024);need(bytes.length===f.bytes&&sha(bytes)===f.sha256,"A complete browser output changed.");}return result;}
 const client=new HaystackClient({url,workspaceId,token});
 const module=await import(pathToFileURL(resolve(playwrightModule)).href),browser=await module.chromium.launch({...launchOptions,headless:true,...(chromium?{executablePath:resolve(chromium)}:{})});
 const files=[],views=[],errors=[];
 let result,primaryError;
 try{
  await client.connect();
  for(const viewport of [{name:"desktop",width:1440,height:1000},{name:"mobile",width:390,height:844}]){
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},acceptDownloads:true});
   let contextError;
   try{
    const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    await page.goto(url+"/volttron.html",{waitUntil:"domcontentloaded"});await page.locator("#connect").click();await page.locator("#connect-workspace").fill(workspaceId);if(token)await page.locator("#connect-token").fill(token);await page.locator("#connect-form button[type=submit]").click();
    await page.waitForFunction(id=>document.getElementById("workspace")?.textContent.includes(id)&&document.body.getAttribute("aria-busy")==="false",workspaceId);
    for(const panel of ["sources","profile","review","receiving","handover","history"]){await page.locator('[data-view="'+panel+'"]').click();need(await page.locator('[data-panel="'+panel+'"]').isVisible(),"The whole operator panel did not open: "+panel);}
    for(const editionId of editionIds){
     const status=await client.request("workspace.status",{}),original=await client.request("volttron.edition.read",{expectedRevision:status.revision,editionId});
     await page.locator('[data-view="review"]').click();await page.locator("#edition-select").selectOption(editionId);await page.locator("#edition-open").click();
     await page.waitForFunction(id=>document.body.getAttribute("aria-busy")==="false"&&document.querySelector("#review-status")?.textContent.includes(id),editionId);
     const pageText=await page.locator("#review-status").innerText();need(pageText.includes(original.review.manifestSha256),"The browser opened a different frozen manifest.");
     const rows=original.review.rows,visible=await page.locator("#rows tr").count();need(visible===Math.min(50,rows.length),"The browser omitted the selected physical row page.");
     if(rows.length){await page.locator("#rows tr").first().getByRole("button",{name:"All fields",exact:true}).click();await page.waitForFunction(()=>document.body.getAttribute("aria-busy")==="false");need((await page.locator("#row-detail").innerText()).includes(rows[0].deviceKey),"The complete selected original row did not open.");}
     const seen=[];for(;;){seen.push(...await page.locator("#rows tr td:first-child .hash").allTextContents());if(await page.locator("#rows-next").isDisabled())break;await page.locator("#rows-next").click();}
     need(seen.length===rows.length&&new Set(seen).size===rows.length&&rows.every(r=>seen.includes(r.rowId)),"All original physical rows must remain accessible through the complete browser pages.");
     await page.locator('[data-view="handover"]').click();for(const format of ["json","csv","html"]){
      const download=page.waitForEvent("download");const [d]=await Promise.all([download,page.locator('[data-report="'+format+'"]').click()]);const temporary=await d.path();need(temporary,"The complete report was not downloaded.");const bytes=await plainRead(temporary,192*1024*1024);
      const retained=await page.evaluate(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open("commons.haystack.operator.v1",1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});try{return await new Promise((ok,no)=>{const tx=db.transaction("operations","readonly"),r=tx.objectStore("operations").getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});}finally{db.close();}});
      const operation=retained.filter(r=>r.workspaceId===workspaceId&&r.source==="volttron"&&r.action==="delivery.prepare"&&r.args.kind==="volttron-report"&&r.args.registryEditionId===editionId&&r.args.format===format&&r.state==="completed").at(-1);
      need(operation&&operation.receipt.sha256===sha(bytes)&&operation.receipt.bytes===bytes.length,"The downloaded file is not the complete original committed request.");
      const serverBytes=Buffer.from(await client.deliveryBytes(operation.operationId));need(serverBytes.equals(bytes),"The browser download differs from original ranged delivery.");
      files.push(await save(join(root,viewport.name,editionId+"."+format),bytes));
      await page.waitForFunction(()=>document.body.getAttribute("aria-busy")==="false");
     }
     await page.locator('[data-view="review"]').click();const screenshotPath=join(root,viewport.name,editionId+".png");let screenshot=await present(screenshotPath);if(!screenshot){screenshot=await page.screenshot({fullPage:true});}files.push(await save(screenshotPath,screenshot));
     views.push({viewport:viewport.name,editionId,physicalRows:seen.length,manifestSha256:original.review.manifestSha256});
    }
    // Refresh the same tab: original editor and its operation receipts must reopen.
    const selected=editionIds.at(-1);await page.reload({waitUntil:"domcontentloaded"});await page.locator("#connect").click();await page.locator("#connect-workspace").fill(workspaceId);if(token)await page.locator("#connect-token").fill(token);await page.locator("#connect-form button[type=submit]").click();
    await page.waitForFunction(id=>document.body.getAttribute("aria-busy")==="false"&&document.querySelector("#review-status")?.textContent.includes(id),selected);
   }catch(error){contextError=error;throw error;}finally{try{await context.close();}catch(cleanupError){if(contextError)throw new AggregateError([contextError,cleanupError],"Original browser journey and context cleanup both failed.");throw cleanupError;}}
  }
  need(errors.length===0,"The original complete browser reported errors: "+errors.join("; "));
  result={schema:"commons.haystack.volttron-browser-receiving.v1",selection,views,files,errors,actualBrowser:true};
 }catch(error){primaryError=error;throw error;}finally{try{await browser.close();}catch(cleanupError){if(primaryError)throw new AggregateError([primaryError,cleanupError],"Original browser journey and browser cleanup both failed.");throw cleanupError;}}
 await save(completedPath,json(result));return result;
}
