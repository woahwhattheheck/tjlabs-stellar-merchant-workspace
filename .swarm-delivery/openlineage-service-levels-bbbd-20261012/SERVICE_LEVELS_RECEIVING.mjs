// Connected operating programme for the complete service-level application.
import { promises as fs } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const [sourceArgument, directoryArgument] = process.argv.slice(2);
if (!sourceArgument || !directoryArgument) throw new Error("Use SOURCE_DIRECTORY ORIGINAL_OPERATION_DIRECTORY");
const source = resolve(sourceArgument), directory = resolve(directoryArgument);
await fs.mkdir(directory, { recursive: true, mode: 0o700 });
const moduleAt = name => import(pathToFileURL(join(source, name)).href);
const { LineageWorkspace, receiveBundle, verifyBundle, APPLICATION_FILES, APPLICATION_VERSION } = await moduleAt("store.mjs");
const { startServer } = await moduleAt("server.mjs");
const { ServiceLevelClient } = await moduleAt("service-levels-client.mjs");
const { MerchantOpenLineageWorkspaces } = await moduleAt("mcp.mjs");
const { readLineageWorkspaceConfiguration } = await moduleAt("mcp-client.mjs");
const { jobKey, canonical } = await moduleAt("model.mjs");
const { tools } = await moduleAt("catalog.mjs");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const operation = "SCF-OPENLINEAGE-SERVICE-LEVELS-BBBD-20261012";
async function retained(path, bytes) {
  const data = Buffer.from(bytes);
  try { await fs.writeFile(path, data, { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; assert.deepEqual(await fs.readFile(path), data, "Retained operation file changed: " + path); }
  return { path, bytes: data.length, sha256: digest(data) };
}
async function output(name, value) {
  return retained(join(directory, name), JSON.stringify(value, null, 2) + "\n");
}
const pin = { schema: "commons.openlineage.service-level-operation.v1", operation,
  applicationVersion: APPLICATION_VERSION, files: [] };
for (const path of APPLICATION_FILES) {
  const bytes = await fs.readFile(join(source, path));
  pin.files.push({ path, bytes: bytes.length, sha256: digest(bytes) });
}
assert.equal(APPLICATION_VERSION, 4); assert.equal(APPLICATION_FILES.length, 66);
await output("source-pin.json", pin);
try {
  const prior = await fs.readFile(join(directory, "SERVICE_LEVELS_RESULT.json"), "utf8");
  assert.equal(JSON.parse(prior).operation, operation); console.log(prior); process.exit(0);
} catch (error) { if (error.code !== "ENOENT") throw error; }
const workspacePath = join(directory, "workspace");
const workspace = new LineageWorkspace(workspacePath);
await workspace.initialize("Original OpenLineage service-level operating programme");
const initial = await workspace.metadata();
const childBytes = await fs.readFile(join(source, "fixture-event-full.json"));
const parentBytes = await fs.readFile(join(source, "fixture-event-simple.json"));
const parent = JSON.parse(parentBytes), child = JSON.parse(childBytes);
const asOf = "2020-12-28T20:00:00.000Z";
let server = await startServer({ directory: workspacePath, port: 0, expectedWorkspaceId: initial.workspaceId });
let client = new ServiceLevelClient(server.url, { expectedWorkspaceId: initial.workspaceId, instanceId: server.identity.instanceId });
let merchant;
async function mutation(action, name, args) {
  return client.action(action, { ...args, operationId: operation + ":" + name,
    expectedRevision: (await client.metadata()).revision });
}
async function command(args) {
  return await new Promise((done, reject) => {
    const child = spawn(process.execPath, [join(source, "cli.mjs"), ...args], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [], errors = [];
    child.stdout.on("data", bytes => chunks.push(bytes)); child.stderr.on("data", bytes => errors.push(bytes));
    child.once("error", reject); child.once("close", code => {
      const text = Buffer.concat(chunks).toString("utf8"), stderr = Buffer.concat(errors).toString("utf8");
      if (code !== 0) reject(new Error("CLI failed: " + stderr)); else done(JSON.parse(text));
    });
  });
}
try {
  const parentImported = await mutation("source.import", "parent-original", {
    name: "fixture-event-simple.json", base64: parentBytes.toString("base64"),
    sourceUrl: "https://github.com/OpenLineage/OpenLineage", contentEncoding: "identity" });
  await mutation("source.import", "diagnostic-original", { name: "null-diagnostic.json", text: "null", sourceUrl: "", contentEncoding: "identity" });
  const beforeEdition = await mutation("edition.save", "before-edition", { title: "Original parent before child capture", description: "Original retained selection" });
  const policyInput = { title: "Child completion within one hour", jobKey: jobKey(child.job),
    owner: "Data operations", runbook: "", enabled: true,
    effectiveFrom: "2020-12-28T09:00:00.000Z", maxCompletionAgeSeconds: 3600,
    maxDurationSeconds: null, failureWindowSeconds: 86400, monitorFailures: false };
  const policyResult = await mutation("service-levels.policy.save", "child-policy", { policy: policyInput, reason: "Review the child job against its original timestamped capture" });
  const assessmentResult = await mutation("service-levels.assessment.save", "before-assessment", { asOf, applyToIncidents: true, editionId: null });
  const before = assessmentResult.assessment.assessment;
  assert.equal(before.findings.length, 1); assert.equal(before.findings[0].kind, "completion-unobserved");
  assert.equal(before.coverage.invalidTimeEvents, 1);
  const incidentId = before.findings[0].id;
  const assigned = await mutation("service-levels.incident.review", "assign-child", {
    id: incidentId, decision: "assign", owner: "Pipeline operations", reason: "Obtain and retain the original child event" });
  assert.equal(assigned.incident.owner, "Pipeline operations");
  const acknowledged = await mutation("service-levels.incident.review", "ack-child", {
    id: incidentId, decision: "acknowledge", reason: "The parent capture does not establish this child completion" });
  assert.equal(acknowledged.incident.status, "acknowledged");

  // Correct the retained selection with the unchanged upstream child event.
  const childImported = await mutation("source.import", "child-original", {
    name: "fixture-event-full.json", base64: childBytes.toString("base64"),
    sourceUrl: "https://github.com/OpenLineage/OpenLineage", contentEncoding: "identity" });
  const correctionResult = await mutation("service-levels.assessment.save", "corrected-assessment", { asOf, applyToIncidents: true, editionId: null });
  assert.equal(correctionResult.assessment.assessment.findings.length, 0);
  assert.equal(correctionResult.assessment.assessment.coverage.invalidTimeEvents, 1);
  const resolved = await mutation("service-levels.incident.review", "resolve-child", {
    id: incidentId, decision: "resolve", reason: "Original child COMPLETE at 19:51:01.641Z clears the saved deadline" });
  assert.equal(resolved.incident.active, false); assert.equal(resolved.incident.status, "resolved");

  // The installed CLI retains the earlier edition without changing the incident desk.
  const historical = await command(["service-levels", "record", "--url", server.url,
    "--expected-workspace-id", initial.workspaceId, "--instance-id", server.identity.instanceId,
    "--edition", beforeEdition.edition.id, "--historical", "--at", asOf,
    "--operation-id", operation + ":historical-assessment"]);
  assert.equal(historical.assessment.appliedToIncidents, false);
  assert.equal(historical.assessment.assessment.findings[0].kind, "completion-unobserved");

  // Run the new mutation through the actual borrowed Merchant host and original journal.
  const configPath = join(directory, "merchant-connection.json");
  await output("merchant-connection.json", { schema: "stellar-forge.openlineage-workspace-host.v1",
    workspaces: { service: { workspaceId: initial.workspaceId, connectionFile: join(workspacePath, "connection.json"), inputs: {} } } });
  const config = await readLineageWorkspaceConfiguration(configPath);
  merchant = new MerchantOpenLineageWorkspaces({ openlineageWorkspaces: config });
  const changedPolicy = { ...policyInput, id: policyResult.policy.id, maxCompletionAgeSeconds: 7200 };
  const amended = await merchant.call("merchant_lineage_service_levels_policy_save", {
    workspace: "service", policy: changedPolicy, reason: "Retain the revised two-hour operating interval",
    operationId: operation + ":policy-v2", expectedRevision: (await client.metadata()).revision });
  assert.equal(amended.policy.version, 2); assert.equal(amended.policy.history.length, 1);
  const latest = await mutation("service-levels.assessment.save", "policy-v2-assessment", { asOf, applyToIncidents: true, editionId: null });
  assert.equal(latest.assessment.assessment.policySnapshots[0].version, 2);
  assert.equal(latest.assessment.assessment.findings.length, 0);
  const complete = await client.serviceLevels();
  assert.equal(complete.incidents[0].status, "resolved");
  assert(complete.incidents[0].history.some(entry => entry.action === "condition-clear"));

  const rpcRevision = (await client.metadata()).revision;
  const rpcCalls = [
    ["lineage_service_levels_read", {}],
    ["lineage_service_levels_policy_save", { policy: policyInput, reason: "Review the child job against its original timestamped capture",
      operationId: operation + ":child-policy", expectedRevision: rpcRevision }],
    ["lineage_service_levels_evaluate", { asOf }],
    ["lineage_service_levels_assessment_save", { asOf, applyToIncidents: true, editionId: null,
      operationId: operation + ":corrected-assessment", expectedRevision: rpcRevision }],
    ["lineage_service_levels_incident_review", { id: incidentId, decision: "resolve",
      reason: "Original child COMPLETE at 19:51:01.641Z clears the saved deadline",
      operationId: operation + ":resolve-child", expectedRevision: rpcRevision }],
    ["lineage_service_levels_report", { format: "json", assessmentId: latest.assessment.id }]
  ];
  const rpcResults = [];
  for (const [name, args] of rpcCalls) {
    const response = await fetch(server.url + "/mcp", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcResults.length + 1, method: "tools/call",
        params: { name, arguments: args } }) });
    const result = (await response.json()).result;
    assert.equal(result.isError, false, name + ": " + result.content?.[0]?.text);
    if (args.operationId) assert.equal(result.structuredContent.replayed, true);
    rpcResults.push({ name, replayed: Boolean(result.structuredContent?.replayed) });
  }
  assert.equal(tools.filter(tool => tool.action.startsWith("service-levels.")).length, 6);

  const reportFiles = [];
  for (const format of ["json", "csv", "html"]) {
    const report = await client.serviceLevelReport({ format, assessmentId: latest.assessment.id });
    assert(report.text.includes(policyResult.policy.id));
    reportFiles.push(await retained(join(directory, "service-levels-report." + format), report.text));
  }
  const browserAssets = [];
  for (const [route, expected] of [
    ["/service-levels", "text/html"], ["/service-levels-browser.js", "javascript"],
    ["/service-levels.css", "text/css"], ["/schema-ui.js", "javascript"]]) {
    const response = await fetch(server.url + route), bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200); assert(response.headers.get("content-type")?.includes(expected));
    browserAssets.push({ route, bytes: bytes.length, sha256: digest(bytes) });
  }
  const exported = await client.exportWorkspace();
  const packagePath = join(directory, "service-levels-workspace.json");
  await client.downloadExport(exported.id, packagePath);
  const packageBytes = await fs.readFile(packagePath), packageValue = JSON.parse(packageBytes);
  const checked = verifyBundle(packageBytes);
  assert.equal(packageValue.applicationVersion, 4); assert.equal(checked.application.size, 66);
  assert.deepEqual(checked.objects.get(parentImported.source.id), parentBytes);
  assert.deepEqual(checked.objects.get(childImported.source.id), childBytes);
  assert.equal(canonical(checked.state.serviceLevels), canonical((await workspace.read()).serviceLevels));
  await merchant.close(); merchant = null; await server.close(); server = null;

  const receivingPath = join(directory, "received");
  let receipt;
  try { receipt = await receiveBundle(packageBytes, receivingPath); }
  catch (error) {
    if (error.status !== 409) throw error;
    const retainedReceipt = JSON.parse(await fs.readFile(join(receivingPath, "received.json"), "utf8"));
    assert.equal(retainedReceipt.packageSha256, digest(packageBytes));
    receipt = { directory: receivingPath, workspaceId: initial.workspaceId, applicationFiles: 66, alreadyPresent: true };
  }
  const deliveredServer = await import(pathToFileURL(join(receivingPath, "application/server.mjs")).href);
  const deliveredClient = await import(pathToFileURL(join(receivingPath, "application/service-levels-client.mjs")).href);
  const deliveredStore = await import(pathToFileURL(join(receivingPath, "application/store.mjs")).href);
  server = await deliveredServer.startServer({ directory: receivingPath, port: 0, expectedWorkspaceId: initial.workspaceId });
  client = new deliveredClient.ServiceLevelClient(server.url, { expectedWorkspaceId: initial.workspaceId, instanceId: server.identity.instanceId });
  const reopened = await client.serviceLevels();
  assert.equal(canonical(reopened), canonical(complete));
  const replay = await client.saveServicePolicy({ policy: changedPolicy, reason: "Retain the revised two-hour operating interval",
    operationId: operation + ":policy-v2", expectedRevision: (await client.metadata()).revision });
  assert.equal(replay.replayed, true); assert.equal(replay.policy.version, 2);
  const reexport = await client.exportWorkspace();
  assert.equal(reexport.id, exported.id);
  assert.equal(deliveredStore.verifyBundle(packageBytes).application.size, 66);
  const result = { schema: "commons.openlineage.service-level-receiving.v1", operation,
    sourcePin: pin, workspaceId: initial.workspaceId, revision: reopened.revision,
    originalSources: [{ name: "fixture-event-simple.json", sha256: digest(parentBytes) }, { name: "fixture-event-full.json", sha256: digest(childBytes) }],
    sourceCount: checked.state.sources.length, eventCount: checked.state.events.length,
    policies: reopened.policies.length, assessments: reopened.assessments.length, incidents: reopened.incidents.length,
    policyVersions: reopened.policies.map(value => ({ id: value.id, version: value.version })),
    incidentDecisions: reopened.incidents.map(value => ({ id: value.id, active: value.active, status: value.status, actions: value.history.map(entry => entry.action) })),
    reportFiles, browserAssets, rpcResults, export: { id: exported.id, bytes: exported.bytes, path: packagePath,
      applicationVersion: packageValue.applicationVersion, applicationFiles: checked.application.size },
    received: receipt, exactOriginalOperationReplay: replay.replayed, reexportId: reexport.id };
  await output("SERVICE_LEVELS_RESULT.json", result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (merchant) await merchant.close();
  if (server) await server.close();
}
