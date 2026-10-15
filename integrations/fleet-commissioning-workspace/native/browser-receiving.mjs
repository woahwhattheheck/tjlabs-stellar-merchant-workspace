import {readFile,mkdir,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {createArchiveCodec} from "../src/archive-codec.mjs";
import {createFleetCore} from "../src/fleet-core.mjs";
const codec=createArchiveCodec(),engine=createFleetCore(codec);
export async function receiveFleet({page,portablePage,url,outputDirectory,example}){
 if(!page||!portablePage||page===portablePage||page.context()===portablePage.context())throw Error("Supply two caller-owned pages in independent contexts.");
 await mkdir(outputDirectory,{recursive:true});const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label)};
 const idle=()=>page.waitForFunction(()=>globalThis.fleetDesk&&!fleetDesk.getState().busy&&!fleetDesk.getState().changed);
 const take=async(selector,name)=>{const event=page.waitForEvent("download");await page.locator(selector).click();const d=await event,path=join(outputDirectory,name);await d.saveAs(path);return new Uint8Array(await readFile(path))};
 await page.goto(url);await idle();
 const original=example.inputs.find(x=>x.family==="telemetry");
 await page.locator("#family").selectOption("telemetry");await page.locator("#source-file").setInputFiles({name:"native-original.csv",mimeType:"text/csv",buffer:Buffer.from(codec.utf8Encode(original.raw))});
 await page.waitForFunction(()=>document.getElementById("source-name").value==="native-original.csv"&&!fleetDesk.getState().busy);await idle();
 await page.locator("#source-id").fill("native-retained-original");await page.locator("#map").click();await page.waitForFunction(()=>!fleetDesk.getState().busy);await page.locator("#admit").click();await idle();
 const capture=await page.evaluate(()=>fleetDesk.capture());check(capture.workspace.sources.find(x=>x.id==="native-retained-original").raw===original.raw,"Actual chooser/admission retains exact BOM and CRLF");
 await page.locator("#sources").evaluate(el=>{el.closest("details").open=true});
 const raw=await take('[data-original="native-retained-original"]',"native-original.csv");check(codec.sha256(raw)===codec.sha256(codec.utf8Encode(original.raw)),"Original download is byte exact");
 await page.locator("#mapping").fill('{"unfinished":');await idle();
 const json=await take("#download","fleet-working.json"),working=JSON.parse(codec.utf8Decode(json));engine.validate(working.workspace);check(working.forms.mapping==='{"unfinished":',"Working download retains unfinished mapping");
 const portable=await take("#portable","fleet-portable.html"),route=new URL("/fleet-received-"+Date.now()+".html",url).href;
 await portablePage.route(route,r=>r.fulfill({status:200,contentType:"text/html; charset=utf-8",body:Buffer.from(portable)}));
 try{await portablePage.goto(route);await portablePage.waitForFunction(()=>globalThis.fleetDesk);const reopened=await portablePage.evaluate(()=>fleetDesk.capture());check(engine.hash(reopened)===engine.hash(working),"Independent portable reopen preserves exact embedded work")}finally{await portablePage.unroute(route)}
 const conflict=await page.evaluate(async()=>{const p=fleetDesk.capture(),id="native-cas-"+crypto.randomUUID();const results=await Promise.all([fleetStore.save(id,null,p),fleetStore.save(id,null,{...p,forms:{...p.forms,"review-note":"second complete proposal"}})]);const journal=(await fleetStore.list("journal")).filter(x=>x.copyId===id);return{saved:results.filter(x=>x.saved).length,conflicts:results.filter(x=>x.conflict).length,journal:journal.length}});
 check(conflict.saved===1&&conflict.conflicts===1&&conflict.journal===2,"Real IndexedDB conflict retains both full proposals");
 const report=await take("#report","fleet-report.html"),reportRoute=new URL("/fleet-report-"+Date.now()+".html",url).href;
 await portablePage.route(reportRoute,r=>r.fulfill({status:200,contentType:"text/html; charset=utf-8",body:Buffer.from(report)}));
 try{await portablePage.goto(reportRoute);check((await portablePage.locator("body").innerText()).includes("metadata checks"),"Actual report reopens");for(const [label,width,height]of [["desktop",1440,1000],["narrow",390,844]]){await portablePage.setViewportSize({width,height});await portablePage.screenshot({path:join(outputDirectory,"report-"+label+".png"),fullPage:true})}}finally{await portablePage.unroute(reportRoute)}
 await take("#csv","fleet-findings.csv");await take("#device-csv","fleet-devices.csv");
 for(const[label,width,height]of [["desktop",1440,1000],["narrow",390,844]]){await page.setViewportSize({width,height});await page.screenshot({path:join(outputDirectory,"desk-"+label+".png"),fullPage:true})}
 const result={schema:"tjlabs.fleet-browser-receiving.v1",allPassed:true,checks,originalSha256:codec.sha256(raw),workingSha256:codec.sha256(json),portableSha256:codec.sha256(portable),reportSha256:codec.sha256(report),visualLook:"Owner must inspect all four screenshots and every output."};await writeFile(join(outputDirectory,"receiving-result.json"),JSON.stringify(result,null,2));return result;
}
