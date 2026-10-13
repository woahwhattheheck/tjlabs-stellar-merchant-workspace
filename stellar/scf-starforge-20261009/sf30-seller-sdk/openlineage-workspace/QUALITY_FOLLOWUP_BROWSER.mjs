#!/usr/bin/env node
// MIT. Continue the same native Quality fixture with the actual browser application.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { startServer } from "./server.mjs";
import { LineageWorkspace, verifyBundle, receiveBundle } from "./store.mjs";
import { QualityFollowupClient } from "./quality-followup-client.mjs";
import { sha256, canonical } from "./model.mjs";

const SOURCE = dirname(fileURLToPath(import.meta.url));
const read = async path => JSON.parse(await fs.readFile(path, "utf8"));
const exists = async path => fs.access(path).then(() => true, () => false);
async function save(path, value) {
  const text = JSON.stringify(value, null, 2) + "\n", temporary = path + ".writing";
  await fs.writeFile(temporary, text, {mode: 0o600}); await fs.rename(temporary, path);
}
async function fixed(path, value) {
  const text = JSON.stringify(value, null, 2) + "\n";
  if (await exists(path)) assert.equal(await fs.readFile(path, "utf8"), text);
  else await fs.writeFile(path, text, {flag: "wx", mode: 0o600});
}
export async function receiveQualityBrowser(directory, configuration) {
  const root = resolve(directory), output = join(root, "browser");
  await fs.mkdir(output, {recursive: true, mode: 0o700});
  const lockPath = join(root, "receiving.lock"), lock = await fs.open(lockPath, "wx", 0o600);
  await lock.writeFile(JSON.stringify({pid: process.pid, phase: "browser", at: new Date().toISOString()}));
  let host, context;
  const reportPath = join(output, "BROWSER_RESULT.json");
  let report;
  try {
    const native = await read(join(root, "NATIVE_RESULT.json"));
    assert.equal(native.nativeStatus, "COMPLETE");
    const workspace = new LineageWorkspace(join(root, "workspace"));
    assert.equal((await workspace.read()).workspaceId, native.workspaceId);
    const source = await read(join(root, "selected-application.json"));
    for (const item of source.files) {
      const bytes = await fs.readFile(join(SOURCE, item.path));
      assert.equal(bytes.length, item.bytes); assert.equal(sha256(bytes), item.sha256, "Selected application differs");
    }
    const config = typeof configuration === "string" ? await read(configuration) : configuration;
    assert.ok(config?.playwrightModule && config?.executablePath, "Select actual installed Playwright and browser");
    const {chromium} = await import(pathToFileURL(resolve(config.playwrightModule)).href);
    const bindingPath = join(output, "browser-origin.json"), prior = await exists(bindingPath) ? await read(bindingPath) : null;
    if (prior) assert.equal(prior.workspaceId, native.workspaceId);
    host = await startServer({directory: workspace.directory, host: "127.0.0.1", port: prior ? new URL(prior.url).port * 1 : 0,
      expectedWorkspaceId: native.workspaceId});
    await fixed(bindingPath, {workspaceId: native.workspaceId, url: host.url});
    const client = new QualityFollowupClient(host.url, {expectedWorkspaceId: native.workspaceId, instanceId: host.identity.instanceId});
    report = await exists(reportPath) ? await read(reportPath) : {schema: "commons.openlineage.quality-followup.browser.v1",
      workspaceId: native.workspaceId, sourceSha256: native.sourceSha256, steps: {}, captures: [], downloads: [], pageErrors: [], status: "RUNNING"};
    assert.equal(report.workspaceId, native.workspaceId); assert.equal(report.sourceSha256, native.sourceSha256);
    if (report.status === "COMPLETE") {
      for (const item of [...report.captures, ...report.downloads]) assert.equal(sha256(await fs.readFile(join(output, item.path))), item.sha256);
      assert.ok((await workspace.read()).revision >= report.revision);
      return report;
    }
    context = await chromium.launchPersistentContext(join(output, "profile"), {headless: true,
      executablePath: resolve(config.executablePath), args: config.args ?? ["--no-sandbox", "--disable-dev-shm-usage"],
      viewport: {width: 1440, height: 1000}, acceptDownloads: true});
    report.runtime = {playwrightModule: resolve(config.playwrightModule), browser: resolve(config.executablePath),
      browserVersion: context.browser()?.version() ?? "persistent context", node: process.version};
    let active = null, capturing = Promise.resolve();
    await context.route("**/api/action", async route => {
      const request = route.request();
      const bytes = request.postDataBuffer(), body = bytes ? JSON.parse(bytes.toString("utf8")) : null;
      if (body?.args?.operationId) {
        if (!active) throw new Error("Unexpected browser mutation outside the original receiving step");
        assert.equal(body.action, active.action);
        const intent = {workspaceId: native.workspaceId, action: body.action, args: body.args,
          bodyUtf8: bytes.toString("utf8"), bytes: bytes.length, sha256: sha256(bytes)};
        await fixed(join(output, "intent-" + active.label + ".json"), intent);
      }
      await route.continue();
    });
    const page = context.pages()[0] ?? await context.newPage();
    page.on("pageerror", error => {report.pageErrors.push(error.message);});
    async function ready() {
      await page.locator(".qf-desk").waitFor({state: "visible"});
      await page.waitForFunction(() => document.querySelector(".qf-desk")?.getAttribute("aria-busy") === "false" &&
        !document.querySelector(".qf-desk")?.textContent.includes("Loading the current saved evaluations"));
    }
    async function open() {
      await page.goto(host.url, {waitUntil: "domcontentloaded"});
      await page.getByRole("button", {name: "Quality follow-up", exact: true}).click();
      await ready();
    }
    async function recoverPending() {
      const button = page.getByRole("button", {name: "Recover saved request", exact: true});
      if (await button.count() && await button.isVisible()) {
        const retained = active;
        const requestDetails = await page.locator("#pending-panel").textContent();
        assert.ok(active, "Retain the original receiving intent before recovering its UI request");
        assert.ok(requestDetails.includes((await read(join(output, "intent-" + active.label + ".json"))).args.operationId));
        await button.click(); active = retained; await ready();
      }
    }
    async function mutation(label, action, click) {
      const intentPath = join(output, "intent-" + label + ".json");
      const resultPath = join(output, "result-" + label + ".json");
      active = {label, action};
      try {
        if (await exists(intentPath)) {
          const intent = await read(intentPath);
          assert.equal(intent.workspaceId, native.workspaceId); assert.equal(intent.action, action);
          assert.equal(sha256(Buffer.from(intent.bodyUtf8)), intent.sha256);
          assert.deepEqual(JSON.parse(intent.bodyUtf8), {action: intent.action, args: intent.args});
          const result = await client.action(intent.action, intent.args);
          if (await exists(resultPath)) {
            const prior = await read(resultPath), normalize = value => {const copy = structuredClone(value); delete copy.replayed; return copy;};
            assert.deepEqual(normalize(result), normalize(prior));
          } else await fixed(resultPath, result);
          await recoverPending(); report.steps[label] = {status: "COMPLETE", operationId: intent.args.operationId, revision: result.revision};
          await save(reportPath, report); return result;
        }
        await click();
        await page.waitForFunction(() => document.querySelector("#pending-panel")?.hidden, {timeout: 30000});
        await ready();
        assert.ok(await exists(intentPath), "Original browser intent must be retained before dispatch");
        const intent = await read(intentPath);
        const committed = (await workspace.read()).operations.find(row => row.id === intent.args.operationId);
        assert.ok(committed, "Original browser request must commit through the original workspace journal");
        await fixed(resultPath, committed.result);
        report.steps[label] = {status: "COMPLETE", operationId: intent.args.operationId, revision: committed.result.revision};
        await save(reportPath, report); return committed.result;
      } finally {active = null;}
    }
    async function capture(name) {
      if (report.captures.some(item => item.name === name)) return;
      await ready(); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const file = name + ".png"; await page.screenshot({path: join(output, file), fullPage: true});
      const bytes = await fs.readFile(join(output, file));
      report.captures.push({name, path: file, bytes: bytes.length, sha256: sha256(bytes), width: page.viewportSize().width,
        revision: (await workspace.read()).revision});
      await save(reportPath, report);
    }
    async function download(label, trigger) {
      const saved = report.downloads.find(item => item.name === label);
      if (saved) {assert.equal(sha256(await fs.readFile(join(output, saved.path))), saved.sha256); return join(output, saved.path);}
      const pending = page.waitForEvent("download"); await trigger();
      const downloaded = await pending; const file = label + "-" + downloaded.suggestedFilename();
      await downloaded.saveAs(join(output, file)); const bytes = await fs.readFile(join(output, file));
      report.downloads.push({name: label, path: file, bytes: bytes.length, sha256: sha256(bytes)});
      await save(reportPath, report); return join(output, file);
    }
    await open();
    const selections = await read(join(root, "selection.json"));
    if (!await exists(join(output, "intent-browser-comparison.json"))) {
      await page.getByLabel("Earlier saved evaluation", {exact: true}).selectOption(native.beforeEvaluationId);
      await page.getByLabel("Later saved evaluation", {exact: true}).selectOption(native.afterEvaluationId);
      await page.getByText("Explicit correspondence between different runs", {exact: true}).click();
      await page.getByLabel("Earlier run", {exact: true}).selectOption(selections.runPairs[0].beforeRunKey);
      await page.getByLabel("Later run", {exact: true}).selectOption(selections.runPairs[0].afterRunKey);
      await page.getByRole("button", {name: "Add run correspondence", exact: true}).click(); await ready();
      await page.getByRole("button", {name: "Compare saved evaluations", exact: true}).click(); await ready();
      await capture("desktop-ambiguous-comparison");
      while (await page.getByLabel("Explicit finding correspondence", {exact: true}).count()) {
        await page.getByLabel("Explicit finding correspondence", {exact: true}).first().selectOption("0");
        await page.getByRole("button", {name: "Use this one-to-one finding correspondence", exact: true}).first().click(); await ready();
      }
      await page.getByLabel("Saved comparison title", {exact: true}).fill("Browser-reviewed fixture comparison");
      await capture("desktop-reviewed-comparison");
    }
    const comparisonResult = await mutation("browser-comparison", "quality.followup.comparison.save",
      () => page.getByRole("button", {name: "Save reviewed comparison", exact: true}).click());
    await page.getByRole("button", {name: "Saved comparisons and follow-up", exact: true}).click();
    await page.getByLabel("Saved quality comparison", {exact: true}).selectOption(comparisonResult.comparison.id);
    const findingRow = page.locator(".qf-row").filter({has: page.locator("strong").filter({hasText: /^Fixture output rows$/})}).first();
    await findingRow.getByRole("button", {name: "Open finding follow-up", exact: true}).click();
    if (!await exists(join(output, "intent-browser-followup.json"))) {
      await page.getByLabel("Follow-up owner", {exact: true}).fill("Browser receiving operator");
      await page.getByLabel("Follow-up reason", {exact: true}).fill("Reviewed original fixture output, source scope and retained rule changes.");
      await page.getByLabel("Follow-up due date", {exact: true}).fill("2026-11-02");
      await page.getByLabel("Earlier decision reference", {exact: true}).selectOption("1");
      await page.getByText("Working copies and complete authoring files", {exact: true}).click();
      const draftFile = await download("working-copy", () => page.getByRole("button", {name: "Download complete working copy", exact: true}).click());
      await page.getByLabel("Open quality working copy", {exact: true}).setInputFiles(draftFile);
      await ready(); assert.equal(await page.getByLabel("Follow-up owner", {exact: true}).inputValue(), "Browser receiving operator");
      await page.reload({waitUntil: "domcontentloaded"});
      await page.getByRole("button", {name: "Quality follow-up", exact: true}).click(); await ready();
      await page.getByRole("button", {name: "Saved comparisons and follow-up", exact: true}).click();
      assert.equal(await page.getByLabel("Follow-up reason", {exact: true}).inputValue(), "Reviewed original fixture output, source scope and retained rule changes.");
      await capture("desktop-retained-authoring");
    }
    const followup = await mutation("browser-followup", "quality.followup.save",
      () => page.getByRole("button", {name: "Save follow-up", exact: true}).click());
    assert.equal(followup.followup.sourceDisposition.version, 1);
    await page.getByRole("button", {name: "Refresh follow-up", exact: true}).click(); await ready();
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 1000});
      await capture((width === 1440 ? "desktop" : "phone") + "-saved-followup");
      for (const format of ["html", "json", "csv"]) {
        await page.getByLabel("Comparison report format", {exact: true}).selectOption(format);
        const reportFile = await download("comparison-" + format, () => page.getByRole("button", {name: "Download complete comparison report", exact: true}).click());
        const text = await fs.readFile(reportFile, "utf8");
        if (format === "json") assert.equal(JSON.parse(text).comparison.id, comparisonResult.comparison.id);
        if (format === "csv") assert.ok(text.includes("Comparison ID"));
        if (format === "html") {
          const rendered = await context.newPage(); await rendered.setViewportSize({width, height: 1000}); await rendered.setContent(text);
          const file = (width === 1440 ? "desktop" : "phone") + "-downloaded-report.png";
          if (!report.captures.some(item => item.path === file)) {
            await rendered.screenshot({path: join(output, file), fullPage: true});
            const bytes = await fs.readFile(join(output, file)); report.captures.push({name: file, path: file, bytes: bytes.length, sha256: sha256(bytes), width});
            await save(reportPath, report);
          }
          await rendered.close();
        }
      }
    }
    await page.getByRole("button", {name: "Export", exact: true}).click();
    const whole = await download("complete-workspace", () => page.getByRole("button", {name: "Download complete workspace", exact: true}).click());
    const verified = verifyBundle(await fs.readFile(whole)), final = await workspace.read();
    assert.equal(verified.state.workspaceId, native.workspaceId); assert.equal(verified.state.revision, final.revision);
    assert.equal(verified.state.qualityFollowup.comparisons.length, 2);
    assert.equal(verified.state.qualityFollowup.followups.length, 2);
    const receiving = join(output, "received-browser-workspace");
    if (!await exists(receiving)) await receiveBundle(await fs.readFile(whole), receiving);
    assert.equal((await read(join(receiving, "workspace.json"))).revision, final.revision);
    assert.deepEqual(report.pageErrors, []);
    report.status = "COMPLETE"; report.revision = final.revision;
    report.completeWorkspace = {path: whole, packageSha256: verified.packageSha256, receivedDirectory: receiving};
    await save(reportPath, report); return report;
  } catch (error) {
    if (report) {report.status = "INTERRUPTED"; report.interruption = {message: error.message, stack: error.stack, at: new Date().toISOString()}; await save(reportPath, report);}
    throw error;
  } finally {if (context) await context.close(); if (host) await host.close(); await lock.close(); await fs.unlink(lockPath);}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  receiveQualityBrowser(process.argv[2], process.argv[3]).then(value => console.log(JSON.stringify(value, null, 2))).catch(error => {
    console.error(error.stack); process.exitCode = 1;
  });
