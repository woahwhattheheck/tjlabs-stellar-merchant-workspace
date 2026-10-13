import assert from "node:assert/strict";
import { readFile, writeFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const input=JSON.parse(await readFile(process.argv[2],"utf8"));
const output=input.output,report={complete:false,stages:[],errors:[]};
const hash=body=>createHash("sha256").update(body).digest("hex");
let browser;
try {
  let playwright;
  for (const base of [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,process.env.NODE_PATH,
    "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules","/usr/local/lib/node_modules"
  ].filter(Boolean).flatMap(value=>value.split(":"))) {
    try {
      const req=createRequire(join(resolve(base),"__revecs_native__.cjs"));
      let actual;
      try { actual=req("playwright"); }
      catch (_) { actual=await import(pathToFileURL(join(resolve(base),"playwright","index.mjs")).href); }
      playwright=actual.chromium?actual:actual.default;
      if(playwright?.chromium){report.playwright=req.resolve("playwright");break;}
    } catch(_) {}
  }
  if(!playwright?.chromium)throw new Error("Installed Playwright Chromium is required");
  const candidates=[process.env.REVECS_CHROMIUM_EXECUTABLE,playwright.chromium.executablePath(),
    "/workspace/scratch/dba55fe4658b/kzfr-source-review/chromium/chrome-headless-shell-linux64/chrome-headless-shell"].filter(Boolean);
  const executablePath=candidates.find(path=>existsSync(path));
  const runtimeArgs=process.env.REVECS_CHROMIUM_ARGS_JSON?JSON.parse(process.env.REVECS_CHROMIUM_ARGS_JSON):[];
  assert(Array.isArray(runtimeArgs)&&runtimeArgs.every(value=>typeof value==="string"));
  browser=await playwright.chromium.launch({headless:true,...(executablePath?{executablePath}:{}),
    args:[...new Set([...runtimeArgs,"--no-sandbox","--disable-dev-shm-usage"])]});
  report.executable=executablePath||"Playwright installed default";
  report.browser_version=await browser.version();
  const context=await browser.newContext({viewport:{width:1365,height:900},acceptDownloads:true});
  const page=await context.newPage();
  page.on("pageerror",error=>report.errors.push(error.message));
  page.on("console",message=>{if(message.type()==="error")report.errors.push(message.text());});
  const fetchResponse=await fetch(input.preview_url.split("#")[0]+"api/snapshot");
  assert.equal(fetchResponse.status,401);
  await page.goto(input.preview_url);
  await page.locator("#event-count").filter({hasText:"6"}).waitFor();
  assert.equal(await page.locator("#extension-count").innerText(),"1");
  assert.equal(await page.locator("#repair-count").innerText(),"1");
  await page.locator('[data-catalyst="990001"]').click();
  await page.locator("#detail .timeline li").first().waitFor();
  assert((await page.locator("#detail").innerText()).includes("Awaiting resubmission"));
  assert((await page.locator("#detail").innerText()).includes("XPRTN"));
  assert.equal(await page.locator("#detail .timeline li").count(),4);
  await page.screenshot({path:join(output,"revecs-desktop.png"),fullPage:true});
  await page.locator('[data-tab="settings"]').click();
  await page.locator("#watchlist").fill("XPRTN, XEXTD");
  await page.locator("#watchlist-form button").click();
  await page.locator("#notice").filter({hasText:"Watchlist saved."}).waitFor();
  await page.screenshot({path:join(output,"revecs-handover-desktop.png"),fullPage:true});
  await page.locator('[data-tab="catalysts"]').click();
  await page.locator("#watch-only").check();
  assert.equal(await page.locator("#catalyst-count").innerText(),"2");
  await page.locator("#search").fill("XEXTD");
  assert.equal(await page.locator("#catalyst-count").innerText(),"1");
  await page.locator('[data-catalyst="990002"]').click();
  await page.locator("#detail .timeline li").first().waitFor();
  assert((await page.locator("#detail").innerText()).includes("Vendor data repair"));
  await page.locator("#search").fill("");
  await page.locator("#watch-only").uncheck();
  await page.locator("#withdrawn").check();
  await page.locator('[data-catalyst="990003"]').click();
  await page.locator("#detail .timeline li").first().waitFor();
  assert((await page.locator("#detail").innerText()).includes("merged into"));
  await page.locator("#detail .summary button").click();
  await page.locator("#detail .timeline li").nth(3).waitFor();
  await page.locator('[data-tab="receiving"]').click();
  await page.screenshot({path:join(output,"revecs-receiving-desktop.png"),fullPage:true});
  const responseRow=page.locator("#response-rows tr").filter({hasText:"Public preview"}).first();
  const downloadEvent=page.waitForEvent("download");
  await responseRow.getByRole("button",{name:"Open original"}).click();
  const original=await downloadEvent;
  const originalPath=join(output,"browser-original-sample.json");
  await original.saveAs(originalPath);
  assert.equal(hash(await readFile(originalPath)),input.original_sample_sha256);
  await page.locator('[data-tab="settings"]').click();
  const archiveEvent=page.waitForEvent("download");
  await page.locator("#export").click();
  const archive=await archiveEvent;
  await archive.saveAs(join(output,"browser-workspace.zip"));
  await page.locator('[data-tab="catalysts"]').click();
  await page.locator("#withdrawn").uncheck();
  await page.locator('[data-catalyst="990001"]').click();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(output,"revecs-phone.png"),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const tab of ["receiving","settings"]){
    await page.locator('[data-tab="'+tab+'"]').click();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  report.stages.push({stage:"desktop_phone_source_history_watchlist_and_complete_download",desktop:[1365,900],phone:[390,844],events:6});
  const moved=await context.newPage();
  moved.on("pageerror",error=>report.errors.push(error.message));
  await moved.goto(input.moved_url);
  await moved.locator("#event-count").filter({hasText:"6"}).waitFor();
  await moved.locator('[data-tab="settings"]').click();
  await moved.locator("#replay").click();
  await moved.locator("#replay-status").filter({hasText:"rebuilt"}).waitFor();
  const offline=await context.newPage(), network=[];
  offline.on("pageerror",error=>report.errors.push(error.message));
  offline.on("request",request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
  await offline.goto(pathToFileURL(input.offline_path).href);
  await offline.locator("#mode").filter({hasText:"Saved workspace"}).waitFor();
  await offline.locator("#event-count").filter({hasText:"6"}).waitFor();
  await offline.locator('[data-catalyst="990001"]').click();
  await offline.locator("#detail .timeline li").nth(3).waitFor();
  await offline.locator("#watch-only").check();
  assert.equal(await offline.locator("#catalyst-count").innerText(),"2");
  await offline.locator('[data-tab="receiving"]').click();
  assert((await offline.locator("#response-rows").innerText()).includes("Public preview"));
  await offline.locator('[data-tab="settings"]').click();
  assert(await offline.locator("#offline-note").isVisible());
  assert.equal(network.length,0);
  assert.equal(report.errors.length,0);
  report.stages.push({stage:"moved_operator_replay_and_offline_reader",external_requests:network.length,original_body_sha256:input.original_sample_sha256});
  if(input.paid_url) {
    const paid=await context.newPage();
    paid.on("pageerror",error=>report.errors.push(error.message));
    await paid.goto(input.paid_url);
    await paid.locator("#event-count").filter({hasText:"13"}).waitFor();
    await paid.locator('[data-catalyst="990003"]').click();
    await paid.locator("#detail .timeline li").first().waitFor();
    assert((await paid.locator("#detail").innerText()).includes("RESTORED CANDIDATE"));
    assert((await paid.locator("#detail").innerText()).includes("Upcoming"));
    await paid.screenshot({path:join(output,"revecs-complete-received-history.png"),fullPage:true});
    await paid.locator('[data-tab="receiving"]').click();
    const partialEvent=paid.waitForEvent("download");
    await paid.getByRole("button",{name:"Open retained part",exact:true}).first().click();
    const partial=await partialEvent,partPath=join(output,"browser-retained-paid-response.bin");
    await partial.saveAs(partPath);
    assert.equal(hash(await readFile(partPath)),input.partial_response_sha256);
    await paid.locator('[data-tab="catalysts"]').click();
    await paid.locator("#edition").selectOption(input.previous_edition);
    await paid.locator("#event-count").filter({hasText:"11"}).waitFor();
    await paid.setViewportSize({width:390,height:844});
    assert(await paid.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await paid.screenshot({path:join(output,"revecs-prior-edition-phone.png"),fullPage:true});
    report.stages.push({stage:"original_sdk_case_browser_partial_download_and_prior_edition",
      current_events:13,previous_events:11,retained_response_sha256:input.partial_response_sha256});
  }
  assert.equal(report.errors.length,0);
  report.complete=true;
} catch(error) {
  report.error={name:error.name,message:error.message,stack:error.stack};
  process.exitCode=1;
} finally {
  if(browser)await browser.close().catch(error=>{report.close_error=error.message;report.complete=false;process.exitCode=1;});
  await writeFile(join(output,"browser-result.json"),JSON.stringify(report,null,2)+"\n");
  process.stdout.write(JSON.stringify({complete:report.complete,error:report.error?.message,stages:report.stages.length})+"\n");
}
