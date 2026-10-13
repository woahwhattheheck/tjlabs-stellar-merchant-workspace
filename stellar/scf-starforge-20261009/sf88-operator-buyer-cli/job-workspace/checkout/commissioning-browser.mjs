// MIT. Full browser receiving for the original 0B8D paid customer course.
// The caller owns the real browser, merchant fixture, customer and listener lifetime.
import fs from "node:fs/promises";
import path from "node:path";
import {createHash, randomUUID} from "node:crypto";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const need = (ok, message) => { if (!ok) throw new Error(message); };
const stable = value => JSON.stringify((function sort(x) {
  return Array.isArray(x) ? x.map(sort) : x && typeof x === "object"
    ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sort(x[k])])) : x;
})(value));
const basename = value => {
  need(typeof value === "string" && value.length > 0 && value === path.basename(value) &&
       ![".", ".."].includes(value) && !/[\x00-\x1f]/.test(value), "Unsafe original download filename");
  return value;
};

export async function reviewCommissioningBrowser({
  page, directory, pipelineId, revision, reportName, packagePath, expectedPath,
  jobPath, requestUrl, immutable, operationTimeoutMs = 600000
}) {
  need(page && typeof page.evaluate === "function" && typeof immutable === "function",
       "Supply the owned Playwright Page and original immutable writer");
  need(path.isAbsolute(directory) && [packagePath, expectedPath, jobPath].every(path.isAbsolute),
       "Use complete absolute original input and review paths");
  need(typeof pipelineId === "string" && Number.isSafeInteger(revision) && revision > 0 &&
       typeof reportName === "string" && reportName.trim().length > 0 && reportName.length <= 120,
       "Select the exact saved pipeline, edition and report");
  need(Number.isSafeInteger(operationTimeoutMs) && operationTimeoutMs >= 1000,
       "Provide the controller's operation deadline");
  const runId = randomUUID(), runDirectory = path.join(directory, "browser-" + runId);
  const screenshotDirectory = path.join(runDirectory, "screenshots");
  const downloadDirectory = path.join(runDirectory, "downloads");
  await fs.mkdir(screenshotDirectory, {recursive:true, mode:0o700});
  await fs.mkdir(downloadDirectory, {recursive:true, mode:0o700});
  const startedAt = new Date().toISOString(), previousViewport = page.viewportSize();
  const originals = {};
  for (const [name, filename] of Object.entries({packagePath, expectedPath, jobPath})) {
    const raw = await fs.readFile(filename);
    originals[name] = {path:filename, bytes:raw.length, sha256:sha(raw)};
  }
  const expected = JSON.parse(await fs.readFile(expectedPath, "utf8"));
  const job = JSON.parse(await fs.readFile(jobPath, "utf8"));
  need(expected && !Array.isArray(expected) && job && !Array.isArray(job), "Original identity files must be objects");
  const receipts = {schema:"stellar-forge.preparation-commissioning-browser-review.v1",
    runId, startedAt, sourceCommit:"964cc8307e6bd70b7d15775c73ec2ba966fee74b",
    directory:runDirectory, originalRequestUrl:requestUrl, pipelineId, revision, reportName,
    originals, screenshots:[], downloads:[], writeRequests:[], operations:[], pageErrors:[]};
  let failure = null, parentUrl, parentOrigin, orderId, receivingId;
  const pageError = error => receipts.pageErrors.push(String(error.message || error));
  page.on("pageerror", pageError);
  // An actual UI action may prepare an order or receive the already purchased result.
  // There is no catalog selection, Request creation, merchant dispatch or payment here.
  const guard = async route => {
    const req = route.request(), method = req.method(), url = new URL(req.url());
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const permitted = url.pathname === "/api/managed/ticket" ||
        /^\/api\/(?:pipelines\/)?commissioning\/(?:prepare|continue|receive-intent|upload|receive|reopen|open)$/.test(url.pathname);
      receipts.writeRequests.push({method, origin:url.origin, path:url.pathname, permitted});
      if (!permitted) {
        failure = new Error("Unexpected browser write: " + method + " " + url.pathname);
        await route.abort("blockedbyclient");
        return;
      }
    }
    await route.continue();
  };
  await page.route("**/*", guard);
  const read = async endpoint => {
    if (failure) throw failure;
    return await page.evaluate(async endpoint => {
      const response = await fetch(endpoint);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Original read failed (" + response.status + ")");
      return body;
    }, endpoint);
  };
  const record = (kind,id) => read("/api/commissioning/record?" + new URLSearchParams({kind,id}));
  const list = async kind => {
    let offset = 0;
    const items = [], seen = new Set();
    while (offset !== null) {
      need(!seen.has(offset), "Repeated original commissioning cursor");
      seen.add(offset);
      const result = await read("/api/commissioning/" + kind + "?" + new URLSearchParams({offset,limit:50}));
      items.push(...result.items);
      offset = result.nextOffset;
    }
    return items;
  };
  const until = async (label, fn) => {
    const deadline = Date.now() + operationTimeoutMs;
    let last;
    while (Date.now() <= deadline) {
      if (failure) throw failure;
      const value = await fn();
      if (value) return value;
      last = await page.locator("#notice").textContent().catch(() => "");
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    throw new Error(label + " exceeded the controller deadline" + (last ? ": " + last : ""));
  };
  const completed = (kind,id,action) => until("Original " + action, async () => {
    const r = await record(kind,id);
    if (["FAILED","CANCELLED"].includes(r.status)) throw new Error(r.message || action + " " + r.status);
    return !r.active && r.status === "COMPLETE" && (!action || r.action === action) ? r : null;
  });
  const screenshot = async name => {
    const layout = await page.evaluate(() => ({
      width:innerWidth, body:document.body.scrollWidth, document:document.documentElement.scrollWidth
    }));
    need(Math.max(layout.body,layout.document) <= layout.width + 2,
         name + " has horizontal page overflow at " + layout.width + "px");
    const bytes = await page.screenshot({fullPage:true, animations:"disabled"});
    const filename = path.join(screenshotDirectory, name + ".png");
    await immutable(filename, bytes);
    receipts.screenshots.push({name, path:filename, bytes:bytes.length, sha256:sha(bytes), layout});
  };
  const download = async (locator, folder, name, identity) => {
    name = basename(name);
    await fs.mkdir(path.join(downloadDirectory,folder), {recursive:true, mode:0o700});
    const promised = page.waitForEvent("download", {timeout:operationTimeoutMs});
    await locator.click();
    const value = await promised;
    const error = await value.failure();
    need(!error, "Complete browser download failed: " + error);
    const stream = await value.createReadStream();
    need(stream, "Browser omitted the complete download stream");
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks), actual = {bytes:raw.length, sha256:sha(raw)};
    if (identity) need(actual.bytes === identity.bytes && actual.sha256 === identity.sha256,
                       name + " differs from its complete original descriptor");
    const filename = path.join(downloadDirectory,folder,name);
    await immutable(filename,raw);
    receipts.downloads.push({name,path:filename,...actual,suggestedFilename:value.suggestedFilename()});
    return raw;
  };
  const completeLink = async (panel, filename) => {
    const matches=[];
    for(const link of await page.locator(panel+" a[download]").all())
      if(await link.getAttribute("download")===filename)matches.push(link);
    need(matches.length===1,"Expected one complete file link: "+filename);
    return matches[0];
  };
  const showCommissioning = async () => {
    await page.locator('nav button[data-view="commissioning"]').click();
    await page.locator("#commission-load").waitFor({state:"visible",timeout:operationTimeoutMs});
  };
  const showRecord = async (kind,id) => {
    const root = kind === "orders" ? "#commission-orders" : "#commission-receivings";
    const more = page.locator(kind === "orders" ? "#commission-orders-more" : "#commission-receivings-more");
    await page.locator("#commission-refresh").click();
    await until("Saved " + kind + " receiving", async () => {
      const target = page.locator(root + ' [data-commission-record="' + id + '"]');
      if (await target.count()) { await target.click(); return true; }
      if (await more.isVisible()) await more.click();
      return false;
    });
    const panel = page.locator(kind === "orders" ? "#commission-order-detail" : "#commission-receiving-detail");
    await until("Selected record rendering", async () => (await panel.textContent()).includes(id));
    return panel;
  };
  try {
    await page.locator('nav button[data-view="commissioning"]').waitFor({state:"visible",timeout:operationTimeoutMs});
    parentUrl = page.url(); parentOrigin = new URL(parentUrl).origin;
    receipts.parentUrl = parentUrl;
    const originalState = await read("/api/state");
    const originalDefinition = await read("/api/definition?" + new URLSearchParams({id:pipelineId,revision}));
    need(originalDefinition.id === pipelineId && originalDefinition.revision === revision, "Saved edition changed");
    receipts.originalDefinition = originalDefinition;
    receipts.originalState = originalState;
    const beforeRequests = await list("requests");
    receipts.existingMerchantRequests = beforeRequests;
    await page.setViewportSize({width:1280,height:900});
    await showCommissioning();
    // The ordinary list may be paged; load the original saved edition through its real UI.
    await until("Saved pipeline picker", async () => {
      const values = await page.locator("#commission-pipeline option").evaluateAll(nodes => nodes.map(n=>n.value));
      if (values.includes(pipelineId)) return true;
      const more = page.locator('[data-more="pipelines"]');
      need(await more.isVisible(), "Original saved pipeline is absent from the complete browser list");
      await more.click();
      return false;
    });
    await page.locator("#commission-pipeline").selectOption(pipelineId);
    await page.locator("#commission-revision").fill(String(revision));
    await page.locator("#commission-load").click();
    await page.locator("#commission-prepare").waitFor({state:"visible",timeout:operationTimeoutMs});
    await page.locator("#commission-report").fill(reportName);
    await page.locator("#commission-reuse").selectOption("");
    for (const [alias,id] of Object.entries(originalDefinition.inputs)) {
      const selector = await page.locator("[data-commission-input]").all();
      const chosen = [];
      for (const item of selector) if (await item.getAttribute("data-commission-input") === alias) chosen.push(item);
      need(chosen.length === 1, "Original input picker is missing or duplicated: " + alias);
      await chosen[0].selectOption(id);
    }
    await page.locator("#commission-definition details").evaluate(node => {node.open=true;});
    const desired = {pipelineId,revision,reportName:reportName.trim(),inputs:originalDefinition.inputs};
    const candidates = (await list("orders")).filter(r => stable(Object.fromEntries(
      Object.entries(r.intent).filter(([key])=>key!=="id"))) === stable(desired));
    need(candidates.length <= 1, "Multiple prepared orders match this exact browser report; select the original before continuing");
    if (candidates.length) {
      orderId = candidates[0].id;
      await showRecord("orders",orderId);
      if (!candidates[0].active && candidates[0].status !== "COMPLETE") {
        await page.locator('#commission-order-detail [data-commission-command="continue"]').click();
      }
    } else {
      const responsePromise = page.waitForResponse(response =>
        /\/api\/(?:pipelines\/)?commissioning\/prepare$/.test(new URL(response.url()).pathname) &&
        response.request().method() === "POST", {timeout:operationTimeoutMs});
      await page.locator("#commission-prepare").click();
      const response = await responsePromise, value = await response.json();
      need(response.ok(),value.error || "Original preparation was rejected");
      orderId=value.id;
    }
    receipts.orderId=orderId;
    const order = await completed("orders",orderId,"prepare");
    need(stable(Object.fromEntries(Object.entries(order.intent).filter(([key])=>key!=="id"))) === stable(desired),
         "Prepared order differs from the selected complete browser edition");
    receipts.operations.push({kind:"orders",record:order});
    await showRecord("orders",orderId);
    await page.locator("#commission-order-detail [data-commission-review]").click();
    await page.locator("#commission-order-detail [data-commission-review-body] pre").waitFor({state:"visible"});
    const reviewedSelection=JSON.parse(await page.locator("#commission-order-detail [data-commission-review-body] pre").textContent());
    for (const [name,identity] of Object.entries(order.result.files)) {
      const raw=await download(await completeLink("#commission-order-detail",name),
        "prepared",name,identity);
      if(name==="selection.json")need(stable(JSON.parse(raw.toString("utf8")))===stable(reviewedSelection),
        "Full reviewed SQL selection differs from the downloaded original");
    }
    await screenshot("desktop-prepared-complete-order");
    await page.setViewportSize({width:390,height:844});
    await screenshot("phone-prepared-complete-order");
    // Use the same retained paid package independently; no second merchant Request is seeded.
    await page.locator("#commission-result").setInputFiles(packagePath);
    await page.locator("#commission-expected").setInputFiles(expectedPath);
    await page.locator("#commission-job").setInputFiles(jobPath);
    await page.locator("#commission-order-binding").selectOption("");
    const receivePromise=page.waitForResponse(response =>
      /\/api\/(?:pipelines\/)?commissioning\/receive-intent$/.test(new URL(response.url()).pathname) &&
      response.request().method()==="POST",{timeout:operationTimeoutMs});
    await page.locator("#commission-receive").click();
    const receiveResponse=await receivePromise, receivedIntent=await receiveResponse.json();
    need(receiveResponse.ok(),receivedIntent.error||"Original receiving was rejected");
    receivingId=receivedIntent.id;receipts.receivingId=receivingId;
    const receiving=await completed("receivings",receivingId,"receive");
    need(!receiving.intent.orderId && stable(receiving.intent.expected)===stable(expected) &&
      stable(receiving.intent.job)===stable(job) &&
      receiving.intent.package.bytes===originals.packagePath.bytes &&
      receiving.intent.package.sha256===originals.packagePath.sha256,
      "Independent receiving differs from the original paid package and identities");
    need(receiving.result.received.pipeline.id===pipelineId && receiving.result.received.pipeline.revision===revision,
      "Paid package belongs to a different pipeline edition");
    receipts.operations.push({kind:"receivings",record:receiving});
    await showRecord("receivings",receivingId);
    for(const file of receiving.result.received.files)
      await download(await completeLink("#commission-receiving-detail",file.filename),
        "received",file.filename,file);
    await screenshot("phone-complete-paid-result");
    await page.locator('#commission-receiving-detail [data-commission-command="reopen"]').click();
    const reopened=await completed("receivings",receivingId,"reopen");
    receipts.operations.push({kind:"receivings",record:reopened});
    need(stable(reopened.result.received.job)===stable(receiving.result.received.job) &&
      reopened.result.received.executionId===receiving.result.received.executionId,
      "Reopening changed the original paid job or execution");
    await showRecord("receivings",receivingId);
    const openPromise=page.waitForResponse(response =>
      /\/api\/(?:pipelines\/)?commissioning\/open$/.test(new URL(response.url()).pathname) &&
      response.request().method()==="POST",{timeout:operationTimeoutMs});
    await page.locator('#commission-receiving-detail [data-commission-command="open"]').click();
    const openResponse=await openPromise, opened=await openResponse.json();
    need(openResponse.ok(),opened.error||"Original editable listener did not open");
    receipts.editable=opened;
    await page.waitForURL(url=>url.origin===new URL(opened.url||opened.origin).origin,{timeout:operationTimeoutMs});
    await page.locator("#pipeline-select").waitFor({state:"visible",timeout:operationTimeoutMs});
    const independentDefinition=await read("/api/definition?"+new URLSearchParams({id:pipelineId,revision}));
    need(stable(independentDefinition)===stable(originalDefinition),"Independent editor changed the saved original definition");
    const executionId=reopened.result.received.executionId;
    const independentRun=await read("/api/execution?"+new URLSearchParams({id:executionId}));
    need(independentRun.id===executionId&&independentRun.status==="COMPLETE","Original paid execution is incomplete");
    receipts.independentState=await read("/api/state");receipts.independentExecution=independentRun;
    await page.locator("#pipeline-select").selectOption(pipelineId);
    await page.locator("#open-pipeline").click();
    await page.locator("#save-pipeline").waitFor({state:"visible"});
    const values=await page.locator('[data-field="sql"]').evaluateAll(nodes=>nodes.map(n=>n.value));
    need(stable(values)===stable(originalDefinition.stages.map(s=>s.sql)),"Independent editor omitted original SQL");
    await screenshot("phone-independent-editable-project");
    await page.setViewportSize({width:1280,height:900});
    await screenshot("desktop-independent-editable-project");
    await page.locator('nav button[data-view="runs"]').click();
    await page.locator("#execution-select").selectOption(executionId);
    await page.locator("#open-execution").click();
    await until("Original paid execution rendered",async()=>{
      const t=await page.locator("#run-detail").textContent();
      return t.includes(originalDefinition.label)&&t.includes("Complete");
    });
    for(const stageId of originalDefinition.outputs){
      const buttons=await page.locator("[data-inspect]").all();let button;
      for(const candidate of buttons)if(await candidate.getAttribute("data-inspect")===stageId)button=candidate;
      need(button,"Original named stage is missing: "+stageId);await button.click();
      await until("Named result preview",async()=>{
        const href=await page.locator('#result-preview a').first().getAttribute("href");
        return href&&new URL(href,page.url()).searchParams.get("stage")===stageId;
      });
      for(const name of ["result.csv","result.jsonl","schema.json"]){
        const links=await page.locator("#result-preview a").all();let chosen;
        for(const link of links){const href=await link.getAttribute("href");
          if(href&&new URL(href,page.url()).searchParams.get("file")===name)chosen=link;}
        need(chosen,"Full result download missing: "+stageId+"/"+name);
        await download(chosen,"named-"+basename(stageId),name);
      }
    }
    await screenshot("desktop-original-paid-execution");
    await page.goto(parentUrl,{waitUntil:"domcontentloaded",timeout:operationTimeoutMs});
    await page.locator('nav button[data-view="commissioning"]').waitFor({state:"visible"});
    const finalState=await read("/api/state");
    need(stable(finalState)===stable(originalState),"Preparing and receiving changed the parent original project");
    const finalRequests=await list("requests");
    need(stable(finalRequests)===stable(beforeRequests),"Browser receiving changed an original merchant Request");
    await showCommissioning();
    await showRecord("receivings",receivingId);
    await page.setViewportSize({width:390,height:844});
    await screenshot("phone-reopened-receiving");
    for(const [name,original]of Object.entries(originals)){
      const raw=await fs.readFile(original.path);
      need(raw.length===original.bytes&&sha(raw)===original.sha256,"Original input changed during browser review: "+name);
    }
    need(receipts.pageErrors.length===0,"The actual browser emitted script errors: "+receipts.pageErrors.join("; "));
    receipts.status="COMPLETE";receipts.completedAt=new Date().toISOString();
    await immutable(path.join(runDirectory,"browser-receiving.json"),Buffer.from(JSON.stringify(receipts,null,2)+"\n"));
    return receipts;
  }catch(error){
    receipts.status="FAILED";receipts.error=String(error.stack||error);receipts.stoppedAt=new Date().toISOString();
    await immutable(path.join(runDirectory,"browser-receiving.failed.json"),Buffer.from(JSON.stringify(receipts,null,2)+"\n")).catch(()=>{});
    throw error;
  }finally{
    await page.unroute("**/*",guard).catch(()=>{});
    page.off("pageerror",pageError);
    if(previousViewport)await page.setViewportSize(previousViewport).catch(()=>{});
  }
}
