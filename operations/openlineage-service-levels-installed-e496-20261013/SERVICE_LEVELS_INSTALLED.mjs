#!/usr/bin/env node
// MIT. Continue the original Service Levels workspace through the maintained product installation.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const OPERATION = "OPENLINEAGE-SERVICE-LEVELS-INSTALLED-E496-20261013";
const ORIGINAL = "SCF-OPENLINEAGE-SERVICE-LEVELS-BBBD-20261012";
const WORKSPACE = "74c371a0-9689-41d4-bcf2-3f0f57f5bebe";
const SCHEMA = "commons.openlineage.installed-service-levels-input.v1";
const D = "stellar/scf-starforge-20261009/distribution/";
const F = "stellar/scf-starforge-20261009/sf46-release/";
const P = "stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/";
const HERE = dirname(fileURLToPath(import.meta.url));
const json = value => JSON.stringify(value, null, 2) + "\n";
const sha = value => createHash("sha256").update(value).digest("hex");
const git = value => createHash("sha1").update("blob " + value.length + "\0").update(value).digest("hex");
const load = (root, path) => import(pathToFileURL(join(root, path)).href);
const clone = value => JSON.parse(JSON.stringify(value));
function need(value, message) { if (!value) throw new Error(message); }
async function exists(path) { try { await fs.lstat(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
async function readJson(path) { return JSON.parse(await fs.readFile(path, "utf8")); }
async function atomic(path, value) {
  const temporary = path + ".pending-" + randomUUID();
  const file = await fs.open(temporary, "wx", 0o600);
  try { await file.writeFile(json(value)); await file.sync(); } finally { await file.close(); }
  try { await fs.rename(temporary, path); } finally { await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}
async function exact(path, bytes) {
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try { await fs.writeFile(path, bytes, { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; assert.ok((await fs.readFile(path)).equals(Buffer.from(bytes)), "Keep original complete bytes at " + path); }
}
async function child(executable, args, options = {}) {
  return new Promise((accept, reject) => {
    const process = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "", stderr = "", count = 0, finished = false;
    const append = (kind, bytes) => {
      if (finished) return;
      count += bytes.length;
      if (count > 16 * 1024 * 1024) { finished = true; process.kill("SIGTERM"); reject(new Error("The original installed child exceeded its output capacity")); return; }
      if (kind === "stdout") stdout += bytes.toString("utf8"); else stderr += bytes.toString("utf8");
    };
    process.stdout.on("data", value => append("stdout", value));
    process.stderr.on("data", value => append("stderr", value));
    process.on("error", error => { finished = true; reject(error); });
    process.on("close", (code, signal) => {
      if (finished) return; finished = true;
      if (code !== 0) reject(Object.assign(new Error("Original installed child failed: " + executable), { child: { args, code, signal, stdout, stderr } }));
      else accept({ stdout, stderr, code });
    });
  });
}
async function until(read, check, label, milliseconds = 60000) {
  const end = Date.now() + milliseconds; let value;
  while (Date.now() < end) {
    value = await read(); if (check(value)) return value;
    if (["FAILED", "UNAVAILABLE"].includes(value?.phase)) throw Object.assign(new Error(label + " failed"), { observed: value });
    await new Promise(done => setTimeout(done, 150));
  }
  throw Object.assign(new Error(label + " timed out"), { observed: value });
}
async function archiveDelivery(python, delivery, operation) {
  const archive = join(delivery, "openlineage-installed-service-levels.zip");
  const code = [
    "import hashlib,json,os,pathlib,sys,zipfile",
    "root=pathlib.Path(sys.argv[1]);target=root/'openlineage-installed-service-levels.zip';temporary=root/'openlineage-installed-service-levels.zip.pending'",
    "members=[]",
    "with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as output:",
    " for current,dirs,files in os.walk(root,followlinks=False):",
    "  current=pathlib.Path(current);dirs[:]=sorted(d for d in dirs if not (current/d).is_symlink())",
    "  for name in sorted(files):",
    "   path=current/name",
    "   if path in (target,temporary) or path.is_symlink():continue",
    "   body=path.read_bytes();relative=path.relative_to(root).as_posix();output.writestr(relative,body)",
    "   members.append({'path':relative,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()})",
    " output.writestr('delivery-manifest.json',json.dumps({'operationId':sys.argv[2],'files':members},indent=2)+'\\n')",
    "os.replace(temporary,target)",
    "print(json.dumps({'path':str(target),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'files':len(members)}))"
  ].join("\n");
  const result = JSON.parse((await child(python, ["-c", code, delivery, operation])).stdout);
  assert.equal(result.path, archive); assert.equal(sha(await fs.readFile(archive)), result.sha256);
  return result;
}


export async function receiveInstalledServiceLevels(inputPath) {
  const configPath = resolve(inputPath), config = await readJson(configPath);
  assert.equal(config.schema, SCHEMA); assert.equal(config.operationId, OPERATION);
  need(Boolean(config.sourceBuild) !== Boolean(config.selectedPackage), "Choose one published complete package or one original selected-package build.");
  need(config.originalService?.workspaceFile && config.originalService?.sourcePacketFile &&
    /^[a-f0-9]{64}$/.test(config.originalService.sha256 ?? "") &&
    /^[a-f0-9]{64}$/.test(config.originalService.sourcePacketSha256 ?? ""),
    "Select the original complete version 4 workspace and full PR339 source packet with their exact byte hashes.");
  need(config.directory && config.browser?.modulePath, "Choose an owned installation directory and actual browser module.");
  const directory = resolve(config.directory), delivery = join(directory, "delivery"), journalPath = join(directory, "installed-receiving.json");
  const originalBytes = await fs.readFile(resolve(config.originalService.workspaceFile));
  const packetBytes = await fs.readFile(resolve(config.originalService.sourcePacketFile));
  assert.equal(sha(originalBytes), config.originalService.sha256);
  assert.equal(sha(packetBytes), config.originalService.sourcePacketSha256);
  const sourcePacket = JSON.parse(packetBytes);
  assert.equal(sourcePacket.schema, "commons.openlineage.service-level-native-delivery.v1");
  assert.equal(sourcePacket.operation, ORIGINAL);
  assert.equal(sourcePacket.applicationVersion, 4); assert.equal(sourcePacket.applicationFiles, 66);
  assert.equal(sourcePacket.sourceFiles, 67); assert.equal(sourcePacket.files.length, 67);
  const pin = config.sourceBuild?.commit ?? config.selectedPackage.sourceCommit;
  need(/^[a-f0-9]{40}$/.test(pin ?? ""), "Keep the selected published source commit.");
  const binding = { operationId: OPERATION, sourceCommit: pin, originalOperation: ORIGINAL,
    originalWorkspaceSha256: sha(originalBytes), originalSourcePacketSha256: sha(packetBytes),
    originalApplicationVersion: 4, directory,
    selectedPackage: config.selectedPackage ? { directory: resolve(config.selectedPackage.directory), archive: resolve(config.selectedPackage.archive), sha256: config.selectedPackage.sha256 } : null,
    sourceBuild: config.sourceBuild ? { directory: resolve(config.sourceBuild.directory), repository: resolve(config.sourceBuild.repository) } : null };
  const lockRoot = config.sourceBuild ? resolve(config.sourceBuild.directory) : join(resolve(config.selectedPackage.directory), "source");
  const { withPrivateLock } = await load(lockRoot, "stellar/scf-starforge-20261009/sf30-seller-sdk/routescan/quota.mjs");
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  return withPrivateLock(directory, "installed-service-levels.lock", async () => {
    let state;
    if (await exists(journalPath)) { state = await readJson(journalPath); assert.deepEqual(state.binding, binding); }
    else {
      need((await fs.readdir(directory)).every(name => name === "installed-service-levels.lock"), "Select a new owned case directory or its unchanged receiving journal.");
      state = { schema: "commons.openlineage.installed-service-levels-result.v1", operationId: OPERATION,
        binding, status: "STARTED", startedAt: new Date().toISOString(), phases: {}, intents: {}, runs: [], artifacts: [], browserViews: [] };
      await atomic(journalPath, state);
    }
    const save = () => atomic(journalPath, state);
    const note = async (phase, details = {}) => { state.phase = phase; state.updatedAt = new Date().toISOString(); await save();
      process.stdout.write("OPENLINEAGE_SERVICE_INSTALLED_PROGRESS=" + JSON.stringify({ phase, ...details }) + "\n"); };
    if (state.status === "COMPLETE") { assert.equal(sha(await fs.readFile(state.archive.path)), state.archive.sha256); return state; }
    await fs.mkdir(delivery, { recursive: true, mode: 0o700 });
    const step = async (name, execute) => { if (Object.hasOwn(state.phases, name)) return state.phases[name];
      await note(name); const result = await execute(); state.phases[name] = result; await save(); return result; };
    const intent = async (name, prepare, execute) => { if (!Object.hasOwn(state.intents, name)) { state.intents[name] = await prepare(); await save(); }
      return execute(state.intents[name]); };
  let selected;
  if (config.sourceBuild) {
    const sourceRoot = resolve(config.sourceBuild.directory);
    selected = await step("selected-source-package", async () => {
      const { buildDistribution } = await load(sourceRoot, D + "build.mjs");
      const output = join(directory, "source-build"), packageDirectory = join(directory, "selected-package");
      const result = await buildDistribution({ repository: resolve(config.sourceBuild.repository), ref: pin,
        selection: "openlineage-operations", output, offline: true, resume: await exists(join(output, "build.json")),
        python: config.pythonExecutable ?? "python3",
        onProgress: event => process.stdout.write("OPENLINEAGE_SELECTED_BUILD=" + JSON.stringify(event) + "\n") });
      assert.equal(result.sourceCommit, pin); assert.equal(result.sourceSelection.id, "openlineage-operations");
      if (!await exists(packageDirectory)) await child(config.pythonExecutable ?? "python3", [
        join(sourceRoot, D + "runtime-unpack.py"), "--archive", result.archive, "--sha256", result.sha256, "--out", packageDirectory
      ]);
      return { directory: packageDirectory, archive: result.archive, sha256: result.sha256, sourceCommit: pin, build: result };
    });
  } else selected = { ...config.selectedPackage, directory: resolve(config.selectedPackage.directory), archive: resolve(config.selectedPackage.archive) };
  assert.equal(sha(await fs.readFile(selected.archive)), selected.sha256);
  const packageRoot = selected.directory, sourceRoot = join(packageRoot, "source");
  const { inspectMerchantPackage, prepareMerchantPackage } = await load(sourceRoot, F + "merchant-package.mjs");
  const packageInfo = await inspectMerchantPackage(packageRoot);
  assert.equal(packageInfo.sourceCommit, pin); assert.equal(packageInfo.sourceSelection.id, "openlineage-operations");
  assert.equal(packageInfo.sourceRepository, "https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace");

  const store = await load(sourceRoot, P + "store.mjs"), { canonical } = await load(sourceRoot, P + "model.mjs");
  const original = store.verifyBundle(originalBytes);
  assert.equal(JSON.parse(originalBytes).applicationVersion, 4);
  assert.equal(original.application.size, 66); assert.equal(original.state.workspaceId, WORKSPACE);
  assert.equal(original.state.revision, 13); assert.equal(original.state.operations.length, 13);
  assert.equal(original.state.serviceLevels.assessments.length, 4);
  assert.equal(original.state.serviceLevels.policies.length, 1);
  assert.equal(original.state.serviceLevels.policies[0].version, 2);
  assert.equal(original.state.serviceLevels.incidents.length, 1);
  assert.equal(original.state.serviceLevels.incidents[0].status, "resolved");
  assert.equal(original.state.serviceLevels.incidents[0].active, false);
  const operationNames = ["parent-original","diagnostic-original","before-edition","child-policy","before-assessment",
    "assign-child","ack-child","child-original","corrected-assessment","resolve-child","historical-assessment","policy-v2","policy-v2-assessment"];
  assert.deepEqual(original.state.operations.map(x => x.id).sort(), operationNames.map(x => ORIGINAL + ":" + x).sort());
  const packetFiles = new Map();
  for (const member of sourcePacket.files) {
    need(typeof member.path === "string" && !member.path.includes("/") && !member.path.includes("\\") &&
      member.path !== "." && member.path !== ".." && !packetFiles.has(member.path), "Retain unique original source filenames.");
    const bytes = Buffer.from(member.contentBase64, "base64");
    assert.equal(bytes.length, member.bytes); assert.equal(git(bytes), member.gitBlobSha);
    packetFiles.set(member.path, bytes);
  }
  for (const [name, body] of original.application) need(packetFiles.get(name)?.equals(body), "Original complete PR339 source differs: " + name);
  const sourceRows = new Map((await readJson(join(packageRoot, "manifest.json"))).files.map(row => [row.path, row]));
  const selectedApplication = new Map();
  for (const name of store.APPLICATION_FILES) {
    const bytes = await fs.readFile(join(sourceRoot, P, name));
    assert.equal(sourceRows.get(P + name)?.gitBlob, git(bytes), "Selected source manifest: " + name);
    selectedApplication.set(name, bytes);
  }
  const unchanged = checked => {
    assert.equal(canonical(checked.state), canonical(original.state), "Retain every original operation, event, policy version, assessment and incident decision.");
    assert.deepEqual([...checked.objects.keys()].sort(), [...original.objects.keys()].sort());
    for (const [id, bytes] of original.objects) need(bytes.equals(checked.objects.get(id)), "Original object differs: " + id);
  };
  const selectedSource = checked => {
    assert.equal(checked.application.size, selectedApplication.size);
    for (const [name, bytes] of selectedApplication) need(bytes.equals(checked.application.get(name)), "Selected application differs: " + name);
  };
  state.source = { commit: pin, sourceSelection: packageInfo.sourceSelection, sourceManifestSha256: packageInfo.sourceManifestSha256,
    originalVersion: 4, originalFiles: 66, applicationVersion: store.APPLICATION_VERSION, applicationFiles: store.APPLICATION_FILES.length,
    originalWorkspaceSha256: sha(originalBytes), originalSourcePacketSha256: sha(packetBytes),
    workspaceId: WORKSPACE, revision: 13, stateSha256: sha(canonical(original.state)), serviceLevelsSha256: sha(canonical(original.state.serviceLevels)) };
  await save();
  let runtimeModel, merchantSession, browserContext, applicationId, active = false, currentPage;
  let runtimeDirectory = state.runtimeDirectory ?? join(directory, "runtime");
  const applicationsDirectory = join(directory, "applications"), receivedDirectory = join(directory, "customer-workspace");
  const originalReceivedDirectory = join(directory, "original-customer-workspace");
  const operatorTokenFile = join(directory, "operator-token"), reportDirectory = join(delivery, "reports"), screens = join(delivery, "screens");
  await fs.mkdir(reportDirectory, { recursive: true, mode: 0o700 }); await fs.mkdir(screens, { recursive: true, mode: 0o700 });
  if (!await exists(operatorTokenFile)) await exact(operatorTokenFile, randomBytes(32).toString("hex") + "\n");
  const operatorToken = (await fs.readFile(operatorTokenFile, "utf8")).trim();
  const applicationState = async () => (await runtimeModel.applicationsState({ historyLimit: 20 })).applications.find(x => x.id === applicationId);
  const stop = async () => {
    const current = await applicationState(); if (!current?.current?.active) { active = false; return current; }
    await runtimeModel.applicationsStop({ applicationId, operationId: current.current.id });
    const stopped = await until(applicationState, x => x && !x.current?.active && ["STOPPED","CANCELLED","SUCCEEDED"].includes(x.phase), "Installed service stop");
    active = false; return stopped;
  };
  const start = async label => {
    let current = await applicationState();
    if (current?.current?.active && current.phase !== "RUNNING") current = await until(applicationState, x => x?.phase === "RUNNING" || !x?.current?.active, "Retained service startup");
    if (current?.phase === "RUNNING" && current.current?.url) { active = true; return current; }
    const review = await runtimeModel.applicationsStartReview({ applicationId });
    const request = { applicationId, requestId: randomUUID(), reviewId: review.id };
    state.runs.push({ label, request, requestedAt: new Date().toISOString() }); await save();
    await runtimeModel.applicationsStart(request); active = true;
    current = await until(applicationState, x => x?.phase === "RUNNING" && x.current?.url, "Installed Service Levels startup");
    assert.equal(current.current.url.operationId, request.requestId); assert.equal(current.current.url.command, "openlineage");
    state.runs.at(-1).startup = current.current.url; await save(); return current;
  };
  const remember = async path => {
    const bytes = await fs.readFile(path), item = { path: path.slice(delivery.length + 1), bytes: bytes.length, sha256: sha(bytes) };
    const i = state.artifacts.findIndex(x => x.path === item.path); if (i < 0) state.artifacts.push(item); else state.artifacts[i] = item;
    await save(); return item;
  };
  const levels = original.state.serviceLevels;
  const latestAssessment = levels.assessments.at(-1), incident = levels.incidents[0], policy = levels.policies[0];
  const assessmentId = latestAssessment.id;
  try {
    await step("receive-original-version-4", async () => {
      if (!await exists(originalReceivedDirectory)) await store.receiveBundle(originalBytes, originalReceivedDirectory);
      assert.equal((await readJson(join(originalReceivedDirectory, "received.json"))).packageSha256, sha(originalBytes));
      assert.equal(canonical(await new store.LineageWorkspace(originalReceivedDirectory).read()), canonical(original.state));
      for (const [name, body] of original.application) need(body.equals(await fs.readFile(join(originalReceivedDirectory, "application", name))), "Original received source differs: " + name);
      return { directory: originalReceivedDirectory, workspaceId: WORKSPACE, revision: 13, applicationVersion: 4, applicationFiles: 66 };
    });
    const upgrade = await step("receive-selected-application", async () => {
      const record = await new store.LineageWorkspace(originalReceivedDirectory).exportBundle({ includeApplication: true });
      const bytes = await fs.readFile(join(originalReceivedDirectory, "exports", record.id + ".json"));
      assert.equal(sha(bytes), record.id); const checked = store.verifyBundle(bytes); unchanged(checked); selectedSource(checked);
      const path = join(delivery, "upgraded-service-levels-workspace.json"); await exact(path, bytes); await remember(path);
      if (!await exists(receivedDirectory)) await store.receiveBundle(bytes, receivedDirectory);
      assert.equal((await readJson(join(receivedDirectory, "received.json"))).packageSha256, record.id);
      assert.equal(canonical(await new store.LineageWorkspace(receivedDirectory).read()), canonical(original.state));
      return { directory: receivedDirectory, path, id: record.id, fromVersion: 4, applicationVersion: store.APPLICATION_VERSION,
        workspaceId: WORKSPACE, revision: 13, stateSha256: sha(canonical(original.state)) };
    });
      const release = await step("install-original-sf46-release", async () => {
        const preparedDirectory = join(directory, "prepared-release");
        let prepared;
        if (await exists(preparedDirectory)) {
          const { verifyRelease } = await load(sourceRoot, F + "release-core.mjs");
          const retained = await verifyRelease(preparedDirectory);
          assert.equal(retained.manifest.source.commit, pin);
          assert.equal(retained.manifest.origin.sourceManifest.sha256, packageInfo.sourceManifestSha256);
          prepared = { release: retained.root, digest: retained.manifest.digest };
        } else prepared = await prepareMerchantPackage({ packageDirectory: packageRoot, output: preparedDirectory,
          expectedManifest: packageInfo.sourceManifestSha256 });
        const product = await load(sourceRoot, F + "product.mjs");
        const installed = await product.install(prepared.release, join(directory, "home"), { expected: prepared.digest, activate: true });
        const status = await product.status(installed.home); assert.equal(status.sourceCommit, pin);
        const help = await child(process.execPath, [join(installed.home, "forge.mjs"), "run", "openlineage", "--home", installed.home, "--", "--help"]);
        assert.match(help.stdout, /service-levels/);
        return { home: installed.home, releaseDirectory: status.releaseDirectory, sourceCommit: status.sourceCommit,
          activeReleaseId: status.activeReleaseId, digest: status.digest };
      });

    await step("installed-command-and-complete-reports", async () => {
      const command = args => child(process.execPath, [join(release.home, "forge.mjs"), "run", "openlineage", "--home", release.home, "--", ...args]);
      const overview = JSON.parse((await command(["service-levels", "status", "--workspace", receivedDirectory])).stdout);
      assert.equal(overview.workspaceId, WORKSPACE); assert.equal(overview.revision, 13);
      assert.deepEqual(overview.policies, levels.policies); assert.deepEqual(overview.assessments, levels.assessments); assert.deepEqual(overview.incidents, levels.incidents);
      for (const assessment of levels.assessments) for (const format of ["json","csv","html"]) {
        const path = join(reportDirectory, assessment.id + "." + format);
        if (!await exists(path)) await command(["service-levels", "report", "--workspace", receivedDirectory, "--assessment", assessment.id, "--format", format, "--out", path]);
        const report = await new store.LineageWorkspace(receivedDirectory).dispatch("service-levels.report", { assessmentId: assessment.id, format });
        assert.equal(await fs.readFile(path, "utf8"), report.text); await remember(path);
      }
      return { workspaceId: WORKSPACE, revision: 13, assessments: levels.assessments.map(x => x.id), reportFiles: 12 };
    });
      const runtime = await load(sourceRoot, D + "runtime-install.mjs");
      const runtimeState = await step("prepare-offline-operator-runtime", async () => {
        let prepared;
        if (await exists(join(runtimeDirectory, "runtime-install.json"))) {
          const plan = await readJson(join(runtimeDirectory, "runtime-install.json"));
          const profile = await readJson(join(runtimeDirectory, "runtime-profile.json"));
          assert.equal(plan.archiveSha256, selected.sha256); assert.equal(plan.source.sourceCommit, pin);
          assert.equal(profile.dependencies.length, 0);
          const inspected = await runtime.inspectRuntimeInstall({ directory: runtimeDirectory, source: true });
          assert.equal(inspected.installationId, plan.installationId);
          prepared = { installationId: plan.installationId, profileId: plan.profileId,
            sourceRoot: plan.sourceRoot, dependencies: profile.dependencies };
        } else if (await exists(runtimeDirectory)) {
          const previous = runtimeDirectory;
          runtimeDirectory = join(directory, "runtime-recovered-" + randomUUID());
          state.runtimeDirectory = runtimeDirectory;
          state.runtimeRecoveries = [...(state.runtimeRecoveries ?? []), { from: previous, directory: runtimeDirectory, startedAt: new Date().toISOString() }];
          await save();
          if (await exists(join(previous, "preparation.json"))) prepared = await runtime.recoverRuntime({
            from: previous, directory: runtimeDirectory, install: false, python: config.pythonExecutable ?? "python3" });
          else prepared = await runtime.prepareRuntimeInstall({ directory: runtimeDirectory, archive: selected.archive,
            sha256: selected.sha256, native: false, features: [], operator: true, python: config.pythonExecutable ?? "python3" });
        } else {
          state.runtimeDirectory = runtimeDirectory; await save();
          prepared = await runtime.prepareRuntimeInstall({ directory: runtimeDirectory, archive: selected.archive,
            sha256: selected.sha256, native: false, features: [], operator: true, python: config.pythonExecutable ?? "python3" });
        }
        assert.equal(prepared.dependencies.length, 0);
        const installed = await runtime.installRuntime({ directory: runtimeDirectory, offline: true, cache: join(directory, "npm-cache") });
        assert.equal(installed.status, "READY"); assert.equal(installed.ready, true);
        const inspected = await runtime.inspectRuntimeInstall({ directory: runtimeDirectory, load: true, source: true });
        assert.equal(inspected.ready, true); assert.equal(inspected.sourceVerified, true);
        return { installationId: prepared.installationId, profileId: prepared.profileId, sourceRoot: prepared.sourceRoot,
          ready: true, dependencies: 0, offline: true };
      });
      const runtimeSource = runtimeState.sourceRoot;
      const { readApplicationProviders } = await load(runtimeSource, D + "runtime-workspace/application-providers.mjs");
      const providers = await readApplicationProviders({ sourceRoot: runtimeSource });
      need(providers.catalog.some(row => row.id === "openlineage-workspace"), "The installed selection must expose its original Application.");
      const { adoptMerchantRuntime } = await load(runtimeSource, F + "runtime-package.mjs");
      const managed = await step("adopt-original-managed-runtime", () => adoptMerchantRuntime({ directory: runtimeDirectory, home: join(directory, "managed-home"), activate: true }));
      const { createRuntimeWorkspace, openRuntimeWorkspace } = await load(runtimeSource, D + "runtime-workspace/model.mjs");
      if (!await exists(applicationsDirectory)) await createRuntimeWorkspace({ directory: applicationsDirectory });
      runtimeModel = await openRuntimeWorkspace({ directory: applicationsDirectory });
      const attached = await step("attach-runtime", () => runtimeModel.attach({ directory: runtimeDirectory, label: "OpenLineage installed Service Levels" }));
      const home = await step("attach-managed-home", () => runtimeModel.openManagedHome({ directory: managed.home, label: "OpenLineage source-selected product" }));
      const saved = await step("save-original-application", () => intent("save-application", async () => {
        const review = await runtimeModel.applicationsReview({ runtimeId: attached.runtimeId, homeId: home.homeId,
          kind: "openlineage-workspace", label: "Original Service Levels customer", settings: {
            workspaceDirectory: receivedDirectory, tokenFile: operatorTokenFile, port: 0 } });
        return { requestId: randomUUID(), reviewId: review.id, applicationId: null };
      }, request => runtimeModel.applicationsSave(request)));
      assert.equal(saved.connectionError, null); applicationId = saved.applicationId;
      let running = await start("installed-customer-review"), url = running.current.url.url;
      const startup = running.current.url.original;
      assert.equal(startup.workspaceId, original.state.workspaceId);

    const { ServiceLevelClient } = await load(runtimeSource, P + "service-levels-client.mjs");
    let client = new ServiceLevelClient(url, { token: operatorToken, expectedWorkspaceId: WORKSPACE, instanceId: startup.instanceId });
    const originalLevels = await client.serviceLevels();
    assert.equal(originalLevels.revision, 13); assert.deepEqual(originalLevels.policies, levels.policies);
    assert.deepEqual(originalLevels.assessments, levels.assessments); assert.deepEqual(originalLevels.incidents, levels.incidents);
    const browserModule = await import(pathToFileURL(resolve(config.browser.modulePath)).href);
    const chromium = browserModule.chromium ?? browserModule.default?.chromium;
    need(chromium?.launchPersistentContext, "Use the host's actual installed Chromium module.");
    const errors = [];
    const openBrowser = async (address, profile) => {
      const context = await chromium.launchPersistentContext(profile, {
        headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
        ...(config.browser.executablePath ? { executablePath: resolve(config.browser.executablePath) } : {}),
        args: config.browser.args ?? []
      });
      await context.addInitScript(({ token }) => { try {
        sessionStorage.setItem("openlineage-access:" + location.origin + location.pathname, token);
        sessionStorage.setItem("openlineage-access:" + location.origin + "/", token);
      } catch {} }, { token: operatorToken });
      const page = await context.newPage(); currentPage = page;
      page.on("pageerror", error => errors.push({ url: page.url(), message: error.message }));
      page.on("response", response => { if (response.status() >= 400 && response.url().startsWith(address))
        errors.push({ url: response.url(), status: response.status() }); });
      await page.goto(address.replace(/\/$/, "") + "/service-levels", { waitUntil: "domcontentloaded" });
      await page.locator("#connection-state").filter({ hasText: "Connected" }).waitFor({ timeout: 45000 });
      assert.equal((await page.locator("#revision-label").innerText()).trim(), "Revision 13");
      return { context, page };
    };
    const capture = async (page, name) => {
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => ({
        width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
        overflow: [...document.querySelectorAll("body *")].filter(el => {
          const r = el.getBoundingClientRect(), style = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && (r.right > innerWidth + 1 || r.left < -1) &&
            style.position !== "fixed" && !el.closest(".table-wrap");
        }).slice(0, 20).map(el => ({ tag: el.tagName, id: el.id, className: String(el.className), text: el.textContent.slice(0, 120) }))
      }));
      const path = join(screens, name + ".png"); await page.screenshot({ path, fullPage: true }); await remember(path);
      state.browserViews = state.browserViews.filter(x => x.name !== name);
      state.browserViews.push({ name, ...layout, screenshot: path.slice(delivery.length + 1) }); await save();
      need(layout.documentWidth <= layout.width + 1, "The complete Service Levels desk must fit its selected viewport: " + name);
      return layout;
    };
    const downloaded = async (page, button, destination) => {
      // Attach the rejection handler before the click so an interrupted response is retained.
      const pending = page.waitForEvent("download", { timeout: 45000 }).then(value => ({ value }), error => ({ error }));
      await button.click(); const outcome = await pending; if (outcome.error) throw outcome.error;
      const failed = await outcome.value.failure(); need(!failed, "Browser download failed: " + failed);
      const temporary = join(directory, "download-" + randomUUID()); await outcome.value.saveAs(temporary);
      try { await exact(destination, await fs.readFile(temporary)); } finally { await fs.unlink(temporary); }
      await remember(destination); return fs.readFile(destination);
    };
    const browse = async (address, profile, prefix, full) => {
      const opened = await openBrowser(address, profile); browserContext = opened.context;
      const page = opened.page, folder = join(delivery, "browser-downloads", prefix);
      await fs.mkdir(folder, { recursive: true, mode: 0o700 });
      for (const [size, width, height] of [["desktop",1440,1000],["phone",390,844]]) {
        await page.setViewportSize({ width, height });
        await page.locator('[data-section="overview"]').click();
        await capture(page, prefix + "-" + size + "-overview");
        await page.locator('[data-section="policies"]').click();
        need((await page.locator("#policy-table").innerText()).includes("Version 2"), "Open the retained policy version.");
        await capture(page, prefix + "-" + size + "-policies");
        await page.locator("#policy-table").getByRole("button", { name: "History", exact: true }).click();
        await page.locator("#history-dialog[open]").waitFor();
        const policyText = await page.locator("#history-body").innerText();
        need(policyText.includes("Version 1") && policyText.includes("Version 2"), "Keep both original policy versions.");
        await capture(page, prefix + "-" + size + "-policy-history");
        await page.locator('#history-dialog [data-close="history-dialog"]').first().click();
        await page.locator('[data-section="assessments"]').click();
        assert.equal(await page.locator("#assessment-table tbody tr").count(), 4);
        await capture(page, prefix + "-" + size + "-assessments");
        const ordered = [...levels.assessments].reverse();
        const wanted = full ? ordered : [ordered[0], ordered.find(x => !x.appliedToIncidents)];
        for (const assessment of wanted) {
          const index = ordered.findIndex(x => x.id === assessment.id);
          await page.locator("#assessment-table tbody tr").nth(index).getByRole("button", { name: "Open", exact: true }).click();
          await page.locator("#assessment-detail").waitFor();
          const label = assessment.id === assessmentId ? "latest" : assessment.appliedToIncidents ? "source-r" + assessment.assessment.sourceRevision : "historical";
          const exactRecord = await downloaded(page, page.locator("#assessment-detail").getByRole("button", { name: "Download assessment", exact: true }),
            join(folder, size + "-assessment-" + assessment.id + ".json"));
          assert.deepEqual(JSON.parse(exactRecord), assessment);
          await page.locator("#assessment-detail").getByText("Complete saved assessment", { exact: true }).click();
          await capture(page, prefix + "-" + size + "-assessment-" + label);
          if (assessment.id === assessmentId || !assessment.appliedToIncidents) {
            for (const format of ["json","csv","html"]) {
              const bytes = await downloaded(page, page.locator("#assessment-detail").getByRole("button", { name: format.toUpperCase() + " report", exact: true }),
                join(folder, size + "-" + assessment.id + "." + format));
              assert.equal(bytes.toString("utf8"), await fs.readFile(join(reportDirectory, assessment.id + "." + format), "utf8"));
            }
          }
        }
        await page.locator('[data-section="incidents"]').click();
        await page.locator("#incident-filter").selectOption("resolved");
        assert.equal(await page.locator("#incident-table tbody tr").count(), 1);
        await page.locator("#incident-table").getByRole("button", { name: "Open", exact: true }).click();
        await page.locator("#incident-detail").waitFor();
        const incidentText = await page.locator("#incident-detail").innerText();
        need(incidentText.includes("resolved") && incidentText.includes("Clear"), "Retain resolved status and cleared condition separately.");
        need(incidentText.includes("condition clear"), "Retain the original condition-clear history.");
        await capture(page, prefix + "-" + size + "-resolved-incident-history");
        const incidentBytes = await downloaded(page, page.locator("#incident-detail").getByRole("button", { name: "Download incident", exact: true }),
          join(folder, size + "-incident.json"));
        assert.deepEqual(JSON.parse(incidentBytes), incident);
        const sourceButtons = page.locator("#incident-detail .finding-card").getByRole("button", { name: /^Download source / });
        const sourceIds = (incident.latestFinding ?? incident.originalFinding).sourceIds ?? [];
        assert.equal(await sourceButtons.count(), sourceIds.length);
        for (let i = 0; i < sourceIds.length; i++) {
          const bytes = await downloaded(page, sourceButtons.nth(i), join(folder, size + "-source-" + sourceIds[i]));
          need(bytes.equals(original.objects.get(sourceIds[i])), "The browser returns the original finding source bytes.");
        }
      }
      await browserContext.close(); browserContext = null; currentPage = null;
      assert.deepEqual(errors, []); return { desktop: [1440,1000], phone: [390,844], assessmentIds: levels.assessments.map(x => x.id),
        incidentId: incident.id, downloads: folder, views: state.browserViews.filter(x => x.name.startsWith(prefix + "-")) };
    };
    await step("installed-desktop-and-phone", () => browse(url, join(directory, "browser-profile"), "installed", true));
    await note("installed-merchant-service-levels");
      const connectionFile = join(directory, "merchant-host.json");
      await exact(connectionFile, Buffer.from(json({ schema: "stellar-forge.openlineage-workspace-host.v1", workspaces: { customer: {
        label: "Original Service Levels customer", connectionFile: join(receivedDirectory, "connection.json"),
        workspaceId: original.state.workspaceId, tokenFile: operatorTokenFile, timeoutMs: 30000, inputs: {}
      } } })));
      const { initializeLineageMerchantWorkspace } = await load(runtimeSource, P + "mcp-setup.mjs");
      const merchant = await initializeLineageMerchantWorkspace({ directory: join(directory, "merchant"), connection: connectionFile,
        name: "OpenLineage installed Service Levels receiving" });
      const { startMerchantMcp } = await load(runtimeSource, "stellar-forge/mcp-merchant-operator/serve.mjs");
      const merchantToken = randomBytes(32).toString("hex");
      merchantSession = await startMerchantMcp({ configPath: merchant.configuration, port: 0,
        environment: { ...process.env, MCP_ACCESS_TOKEN: merchantToken }, consoleDirectory: join(directory, "merchant-console") });
      const rpc = async (method, params) => {
        const response = await fetch(merchantSession.url, { method: "POST", headers: { authorization: "Bearer " + merchantToken,
          "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" },
          body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, ...(params === undefined ? {} : { params }) }) });
        assert.equal(response.status, 200); const value = await response.json();
        need(!value.error && !value.result?.isError, "The installed merchant request must complete: " + method);
        return value.result;
      };
      const call = async (name, args = {}) => {
        const value = await rpc("tools/call", { name, arguments: { workspace: "customer", ...args } });
        return value.structuredContent?.result ?? value.structuredContent;
      };
      const initialized = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {},
        clientInfo: { name: "OpenLineage installed customer receiving", version: "1" } });
      assert.equal(initialized.protocolVersion, "2025-11-25");

    const { tools: catalog } = await load(runtimeSource, P + "catalog.mjs");
    const serviceTools = catalog.filter(tool => tool.action.startsWith("service-levels."));
    assert.equal(serviceTools.length, 6);
    const listed = await rpc("tools/list"), names = new Set(listed.tools.map(row => row.name));
    for (const tool of serviceTools) need(names.has("merchant_" + tool.name), "Retain the complete installed service catalogue: " + tool.name);
    const overview = await call("merchant_lineage_service_levels_read");
    assert.equal(canonical(overview), canonical(originalLevels));
    for (const assessment of levels.assessments) for (const format of ["json","csv","html"]) {
      const report = await call("merchant_lineage_service_levels_report", { assessmentId: assessment.id, format });
      assert.equal(report.text, await fs.readFile(join(reportDirectory, assessment.id + "." + format), "utf8"));
    }
    const exactPolicy = { title: "Child completion within one hour", jobKey: policy.jobKey, owner: "Data operations",
      runbook: "", enabled: true, effectiveFrom: "2020-12-28T09:00:00.000Z", maxCompletionAgeSeconds: 7200,
      maxDurationSeconds: null, failureWindowSeconds: 86400, monitorFailures: false, id: policy.id };
    const originalPolicyRequest = { policy: exactPolicy, reason: "Retain the revised two-hour operating interval",
      operationId: ORIGINAL + ":policy-v2", expectedRevision: 13 };
    const replay = await call("merchant_lineage_service_levels_policy_save", originalPolicyRequest);
    assert.equal(replay.replayed, true); assert.equal(replay.policy.version, 2);
    assert.equal((await client.metadata()).revision, 13);
    state.phases["installed-merchant-service-levels"] = { protocolVersion: initialized.protocolVersion,
      tools: serviceTools.map(x => "merchant_" + x.name), originalPolicyReplay: replay.replayed, workspaceId: WORKSPACE, revision: 13 };
    await save();
    const firstInstance = startup.instanceId;
    await stop(); running = await start("installed-service-cold-reopen");
    const restarted = running.current.url.original;
    assert.notEqual(restarted.instanceId, firstInstance); assert.equal(restarted.workspaceId, WORKSPACE);
    const selectedConnection = await call("merchant_lineage_connection");
    need(selectedConnection.reconnectRequired, "Retain the original merchant connection across the observed restart.");
    await call("merchant_lineage_reconnect", { expectedInstanceId: selectedConnection.selected.instanceId });
    assert.equal(canonical(await call("merchant_lineage_service_levels_read")), canonical(originalLevels));
    client = new ServiceLevelClient(running.current.url.url, { token: operatorToken, expectedWorkspaceId: WORKSPACE, instanceId: restarted.instanceId });
    assert.equal(canonical(await client.serviceLevels()), canonical(originalLevels));
    const exported = await step("complete-installed-workspace-export", async () => {
      const record = await client.exportWorkspace({ includeApplication: true });
      const path = join(delivery, "installed-service-levels-workspace.json");
      if (!await exists(path)) await client.downloadExport(record.id, path);
      const bytes = await fs.readFile(path); assert.equal(sha(bytes), record.id);
      const checked = store.verifyBundle(bytes); unchanged(checked); selectedSource(checked);
      assert.equal(record.id, upgrade.id, "Read-only installed receiving and exact replay preserve the same complete export.");
      await remember(path); return { ...record, path };
    });
    const editable = join(delivery, "editable-workspace");
    if (!await exists(editable)) await store.receiveBundle(await fs.readFile(exported.path), editable);
    assert.equal((await readJson(join(editable, "received.json"))).packageSha256, exported.id);
    assert.equal(canonical(await new store.LineageWorkspace(editable).read()), canonical(original.state));
    const deliveredStore = await load(join(editable, "application"), "store.mjs");
    const { startServer } = await load(join(editable, "application"), "server.mjs");
    const finalHost = await startServer({ directory: editable, token: operatorToken, port: 0, expectedWorkspaceId: WORKSPACE });
    try {
      await step("independently-received-desktop-and-phone", () => browse(finalHost.url, join(directory, "received-browser-profile"), "received", false));
      const { ServiceLevelClient: ReceivedClient } = await load(join(editable, "application"), "service-levels-client.mjs");
      const receivedClient = new ReceivedClient(finalHost.url, { token: operatorToken, expectedWorkspaceId: WORKSPACE, instanceId: finalHost.identity.instanceId });
      assert.equal(canonical(await receivedClient.serviceLevels()), canonical(originalLevels));
      assert.equal((await receivedClient.saveServicePolicy(originalPolicyRequest)).replayed, true);
      const reexport = await receivedClient.exportWorkspace({ includeApplication: true });
      assert.equal(reexport.id, exported.id); state.reexportId = reexport.id;
      unchanged(deliveredStore.verifyBundle(await fs.readFile(exported.path)));
    } finally { await finalHost.close(); }
    await merchantSession.close(); merchantSession = null; await stop();
    assert.deepEqual(errors, []);
    const finalApplication = await applicationState();
    state.application = { applicationId, sourceCommit: finalApplication.release.sourceCommit,
      workspaceId: WORKSPACE, totalRuns: finalApplication.totalRuns, phase: finalApplication.phase, explicitReconnect: true };
    assert.equal(state.application.sourceCommit, pin);
    state.workspaceId = WORKSPACE; state.revision = 13; state.originalOperationIds = original.state.operations.map(x => x.id);
    if (state.error) { state.recoveredErrors = [...(state.recoveredErrors ?? []), state.error]; delete state.error; }
    await exact(join(delivery, "original-service-levels-workspace.json"), originalBytes);
    await exact(join(delivery, "original-service-source-packet.json"), packetBytes);
    for (const [name, body] of original.application) await exact(join(delivery, "original-source", name), body);
    await exact(join(delivery, "source-package.tgz"), await fs.readFile(selected.archive));
    await exact(join(delivery, "runtime-unpack.py"), await fs.readFile(join(sourceRoot, D + "runtime-unpack.py")));
    await exact(join(delivery, "SERVICE_LEVELS_INSTALLED.mjs"), await fs.readFile(fileURLToPath(import.meta.url)));
    await exact(join(delivery, "SERVICE_LEVELS_INSTALLED.md"), await fs.readFile(join(HERE, "SERVICE_LEVELS_INSTALLED.md")));
    await exact(join(delivery, "START_HERE.md"), Buffer.from(
      "# OpenLineage Service Levels — installed customer delivery\n\n" +
      "Workspace " + WORKSPACE + " · revision 13 · original operation " + ORIGINAL + "\n\n" +
      "The editable workspace retains all thirteen original operations, both policy versions, four saved assessments, the resolved child incident and complete source objects. " +
      "Its selected application comes from " + pin + ". The original version 4 source and export remain in original-source/ and original-service-levels-workspace.json.\n\n" +
      "Start the independently received application with Node 22 or newer:\n\n~~~sh\nnode editable-workspace/application/cli.mjs serve --workspace editable-workspace --port 0\n~~~\n\n" +
      "Open the returned local address and choose Service levels. Review Policies → History, all four Assessments, and Incidents → Resolved. " +
      "The original observation time is 2020-12-28T20:00:00Z. Historical assessment reports retain their original source selection. " +
      "reports/ contains all twelve complete reports. browser-downloads/ retains the actual assessment, incident, report and finding-source downloads. screens/ contains the operated desktop and phone views.\n\n" +
      "The complete selected installation archive is source-package.tgz, SHA-256 " + selected.sha256 + ". Unpack it with:\n\n" +
      "~~~sh\npython3 runtime-unpack.py --archive source-package.tgz --sha256 " + selected.sha256 + " --out selected-package\n~~~\n\n" +
      "Follow SERVICE_LEVELS_INSTALLED.md for the maintained product installer, Applications, merchant reconnect and complete receiving commands.\n"));
    state.status = "OPERATED"; state.completedAt = new Date().toISOString(); await save();
    await atomic(join(delivery, "installed-service-levels-result.json"), { ...state, archive: undefined });
    state.archive = await archiveDelivery(config.pythonExecutable ?? "python3", delivery, OPERATION);
    state.status = "COMPLETE"; state.phase = "COMPLETE_INSTALLED_SERVICE_LEVELS"; await save();
    return state;
  } catch (error) {
    if (currentPage && !currentPage.isClosed()) {
      const failure = join(screens, "interrupted-original-view.png");
      await currentPage.screenshot({ path: failure, fullPage: true }).then(() => remember(failure)).catch(() => {});
    }
    state.status = "INTERRUPTED"; state.error = { at: new Date().toISOString(), message: error.message, stack: error.stack,
      ...(error.child ? { child: error.child } : {}), ...(error.observed ? { observed: error.observed } : {}) };
    await save().catch(() => {}); throw error;
  } finally {
    await browserContext?.close().catch(() => {});
    await merchantSession?.close().catch(() => {});
    if (runtimeModel && applicationId && active) await stop().catch(() => {});
    await runtimeModel?.close();
  }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  receiveInstalledServiceLevels(process.argv[2] ?? (() => { throw new Error("Supply the original installed Service Levels input JSON."); })())
    .then(result => process.stdout.write(json(result)))
    .catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
}
