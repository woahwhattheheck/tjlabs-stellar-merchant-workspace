#!/usr/bin/env node
/** Receive complete customer Workshares through the original SF47 Operations CLI. */
import {readFileSync, writeFileSync, openSync, closeSync, fsyncSync, linkSync, unlinkSync,
  existsSync, mkdirSync, lstatSync, fstatSync, realpathSync, constants} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {createHash, randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {bindingTemplate, prepareInstallation, renderWorkorder} from "./prepare-core.mjs";
import {profileCatalog, readProfile} from "./profiles.mjs";
import {PROGRAMME_FIELDS, PROGRAMME_SCHEMA, composeCustomerProgramme,
  programmeFiles, validateProgrammeSave} from "./customer-programme-core.mjs";

const schema = "stellar-forge.installation-workshare-receiving.v1";
const usage = "node receive.mjs --operations-cli /absolute/workspace/cli.py --workspace /absolute/original-workspace --case operation-ID --plan plan-ID --inputs PAIR_RECEIVING.json --source-root /absolute/original-files --out /absolute/private-output --receiving-workspace /absolute/receiving-workspace --actor ACTUAL_OPERATOR [--receiving-actor ACTUAL_RECEIVER] [--python python3]";
const fail = message => { throw new Error(message); };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const json = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const canonical = value => JSON.stringify(Array.isArray(value) ? value.map(ordered) : ordered(value));
function ordered(value) {
  return Array.isArray(value) ? value.map(ordered) : record(value) ?
    Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
}
const same = (a, b) => canonical(a) === canonical(b);
function parse(argv) {
  const result = {};
  const names = ["operations-cli", "workspace", "case", "plan", "inputs", "source-root", "out",
    "receiving-workspace", "actor", "receiving-actor", "python"];
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (!names.includes(key) || !argv[i + 1] || result[key] !== undefined) fail(usage);
    result[key] = argv[i + 1];
  }
  if (names.slice(0, 9).some(key => !result[key])) fail(usage);
  for (const key of ["operations-cli", "workspace", "source-root", "out", "receiving-workspace"])
    if (!result[key].startsWith("/")) fail("Use an absolute " + key + " path.");
  if (resolve(result.workspace) === resolve(result["receiving-workspace"]))
    fail("Select the receiving engineer's distinct workspace for native complete-case import.");
  result.python ??= "python3";
  result["receiving-actor"] ??= result.actor;
  return result;
}
function regular(path, maximum = 8 * 1024 * 1024) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum)
    fail("Use the complete regular source file: " + path);
  return readFileSync(path);
}
function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function syncRetained(path, bytes) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > 128 * 1024 * 1024 ||
        !readFileSync(fd).equals(bytes))
      fail("The retained operation file differs: " + path);
    const after = fstatSync(fd), named = lstatSync(path);
    if (["dev", "ino", "size", "mtimeMs", "ctimeMs"].some(key => before[key] !== after[key]) ||
        named.dev !== after.dev || named.ino !== after.ino)
      fail("The retained operation file changed while being read: " + path);
    fsyncSync(fd);
  } finally { closeSync(fd); }
}
function retain(path, bytes) {
  if (existsSync(path)) {
    syncRetained(path, bytes);
    syncDirectory(dirname(path));
  } else {
    const temporary = path + "." + randomUUID() + ".tmp";
    const fd = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(fd, bytes); fsyncSync(fd);
      try { linkSync(temporary, path); }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        syncRetained(path, bytes);
      }
      syncDirectory(dirname(path));
    } finally {
      closeSync(fd);
      unlinkSync(temporary);
      syncDirectory(dirname(path));
    }
  }
  return {path, bytes: bytes.length, sha256: hash(bytes)};
}
function privateDirectory(path) {
  mkdirSync(path, {recursive: true, mode: 0o700});
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || realpathSync(path) !== path)
    fail("Use a private 0700 output directory without symbolic-link ancestors: " + path);
  // Complete the same parent flushes when an earlier mkdir attempt was interrupted.
  for (let current = path; ; current = dirname(current)) {
    syncDirectory(current);
    if (dirname(current) === current) break;
  }
}
function native(args, workspace = options.workspace) {
  const command = [options["operations-cli"], "operations", "--workspace", workspace, ...args];
  const result = spawnSync(options.python, command, {
    encoding: "utf8", maxBuffer: 128 * 1024 * 1024, env: process.env,
    cwd: dirname(options["operations-cli"])
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error("Original Operations " + args[0] + " failed: " +
      (result.stdout || result.stderr || "process ended without a result").trim().slice(0, 16000));
    error.nativeConflict = /OPERATIONS_CONFLICT|INSTALLATION_PREVIEW_CONFLICT|INSTALLATION_CONFLICT/.test(result.stdout + result.stderr);
    throw error;
  }
  let value;
  try { value = JSON.parse(result.stdout); }
  catch { fail("Original Operations did not return complete JSON for " + args[0] + "."); }
  if (!record(value)) fail("Original Operations returned an unexpected result for " + args[0] + ".");
  return value;
}
function current(workspace = options.workspace, caseId = options.case) {
  const value = native(["show", "--case", caseId], workspace);
  if (value.program?.id !== caseId || !Number.isInteger(value.program.version) ||
      !Array.isArray(value.sources) || !Array.isArray(value.installations))
    fail("The original Operations case shape changed; retain its full native source.");
  if (workspace === options.workspace && value.program.planId !== options.plan)
    fail("The selected case is pinned to a different original plan.");
  return value;
}
function retryCurrent(action) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return action(current()); }
    catch (error) { if (!error.nativeConflict || attempt === 3) throw error; }
  }
}
function operationId(kind, value) {
  return input.requestPrefix + "-" + kind + "-" + hash(Buffer.from(canonical(value))).slice(0, 24);
}
function readInputs() {
  const bytes = regular(resolve(options.inputs));
  const value = JSON.parse(bytes.toString("utf8"));
  if (value.schema !== schema || !/^[A-Za-z0-9_-]{1,70}$/.test(value.requestPrefix || "") ||
      !Array.isArray(value.customers) || !value.customers.length || value.customers.length > 20)
    fail("Use a complete receiving input with a stable requestPrefix and customer list.");
  const cases = new Set();
  const profileIds = new Set(profileCatalog().map(profile => profile.id));
  for (const customer of value.customers) {
    if (!record(customer) || !profileIds.has(customer.profile) ||
        typeof customer.workshareCaseId !== "string" || !customer.workshareCaseId ||
        cases.has(customer.workshareCaseId) || !/^[a-f0-9]{64}$/.test(customer.planSha256 || "") ||
        !Array.isArray(customer.files) || !customer.files.length)
      fail("Each selected original Workshare needs one unique case, profile, plan and complete files.");
    cases.add(customer.workshareCaseId);
    let commissioning = 0, packets = 0;
    for (const file of customer.files) {
      if (!record(file) || !["commissioning", "packet", "source"].includes(file.role) ||
          !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(file.filename || "") ||
          !/^[a-f0-9]{64}$/.test(file.sha256 || "") ||
          typeof file.sourceUrl !== "string" || !file.sourceUrl ||
          typeof file.observedAt !== "string" || !Number.isFinite(Date.parse(file.observedAt)))
        fail("Use original file names, complete-file hashes and source observations.");
      file.mediaType ??= "application/json";
      if (typeof file.mediaType !== "string" || file.mediaType.length > 200 ||
          !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(file.mediaType) ||
          (file.role !== "source" && file.mediaType !== "application/json"))
        fail("Keep the original source media type; commissioning and packet files use application/json.");
      commissioning += file.role === "commissioning" ? 1 : 0;
      packets += file.role === "packet" ? 1 : 0;
      const path = join(options["source-root"], file.filename);
      const raw = regular(path);
      if (hash(raw) !== file.sha256 || (file.bytes !== undefined &&
          (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes !== raw.length)))
        fail("Original customer source differs: " + file.filename);
      const retainedDirectory = join(options.out, "original-inputs", file.sha256);
      privateDirectory(retainedDirectory);
      file.path = retain(join(retainedDirectory, file.filename), raw).path;
    }
    if (commissioning !== 1 || packets > 1) fail("Select one commissioning source and at most one complete matching packet.");
    if (customer.bindings !== undefined && !record(customer.bindings)) fail("Customer bindings must be a complete JSON object.");
  }
  return {value, bytes};
}
function receiveFile(file) {
  return retryCurrent(state => {
    const existing = state.sources.filter(row => row.sha256 === file.sha256 &&
      row.mediaType === file.mediaType);
    if (existing.length) return existing.sort((a, b) => a.id.localeCompare(b.id))[0];
    const version = state.program.version;
    const requestId = operationId("source", {caseId: options.case, version, sha256: file.sha256, filename: file.filename,
      ...(file.mediaType === "application/json" ? {} : {mediaType: file.mediaType})});
    const result = native(["attach", "--case", options.case, "--expected-version", String(version),
      "--actor", options.actor, "--request-id", requestId, "--file", file.path,
      "--kind", "work", "--media-type", file.mediaType, "--source-url", file.sourceUrl,
      "--observed-at", file.observedAt, "--note", "Receive the complete original customer Workshare source: " + file.filename]);
    nativeMutations.push(result);
    const source = current().sources.find(row => row.id === result.recordId && row.sha256 === file.sha256);
    if (!source) fail("The original attached source was not returned by the current case.");
    return source;
  });
}
function existingInstallation(state, caseId) {
  const matches = state.installations.map(row => native(["installation-show", "--case", options.case,
    "--installation", row.id, "--revision", String(row.revision)]))
    .filter(row => row.preview?.document?.workshare?.caseId === caseId);
  if (matches.length > 1) fail("Select the original customer Installation in the existing desk; multiple saved identities have this Workshare.");
  return matches[0] || null;
}
const editable = ["task", "source", "payment", "receiving"];
function appliedBindings(base, supplied, sourceIds) {
  if (!record(supplied)) fail("Use an object for customer bindings.");
  const allowed = ["merchantDeploymentId", "buyerDeploymentIds", ...editable];
  if (Object.keys(supplied).some(key => !allowed.includes(key))) fail("Bindings edit only customer task, source, payment, receiving and selected deployments.");
  const result = structuredClone(base);
  for (const key of allowed) {
    if (supplied[key] === undefined) continue;
    if (editable.includes(key)) {
      if (!record(supplied[key])) fail("Use an object for " + key + " bindings.");
      result[key] = {...result[key], ...supplied[key]};
    } else result[key] = structuredClone(supplied[key]);
  }
  result.source.sourceIds = [...new Set([...(result.source.sourceIds || []), ...sourceIds])];
  result.receiving.sourceIds = [...new Set([...(result.receiving.sourceIds || []), ...sourceIds])];
  return result;
}

function programmeInputs(customer, attached) {
  if (customer.programme === undefined) return null;
  const selected = customer.programme;
  const names = ["schema", "calendarFile", "selectionFile", "taskBudgetFile", "nativeChangeFile"];
  if (!record(selected) || selected.schema !== PROGRAMME_SCHEMA ||
      Object.keys(selected).some(key => !names.includes(key)) || typeof selected.calendarFile !== "string")
    fail("Use the complete original customer programme file selection.");
  const result = {};
  for (const [key, name] of [["calendarFile", "calendarInput"], ["selectionFile", "selection"],
      ["taskBudgetFile", "taskBudget"], ["nativeChangeFile", "nativeChange"]]) {
    if (selected[key] === undefined) continue;
    const matches = attached.filter(file => file.filename === selected[key] && file.mediaType === "application/json");
    if (matches.length !== 1) fail("Select the complete " + key + " among this customer's retained original files.");
    const raw = regular(matches[0].path);
    if (hash(raw) !== matches[0].sha256) fail("The selected original programme file changed.");
    result[name] = JSON.parse(raw.toString("utf8"));
    if (!record(result[name])) fail("Retain the complete original " + key + " JSON object.");
  }
  return result;
}
function nativeCustomerSeed(customer, attached, state, before) {
  const commissioning = attached.find(file => file.role === "commissioning");
  const packet = attached.find(file => file.role === "packet");
  const argv = ["installation-workshare-seed", "--case", options.case, "--expected-version", String(state.program.version),
    "--source", commissioning.source.id, "--expected-source-sha256", commissioning.sha256,
    "--workshare-case", customer.workshareCaseId, "--expected-revision", String(before?.revision || 0)];
  if (packet) argv.push("--packet-source", packet.source.id, "--expected-packet-sha256", packet.sha256);
  if (before) argv.push("--installation", before.id);
  const seed = native(argv);
  if (seed.workshare?.planSha256 !== customer.planSha256 ||
      seed.document?.workshare?.caseId !== customer.workshareCaseId)
    fail("The native seed selected a different original commercial plan.");
  return seed;
}
function programmeDirectory(customer) {
  const root = join(options.out, "customer-programmes");
  const earlier = join(root, customer.profile);
  const retainedSeed = join(earlier, "original-native-seed.json");
  if (existsSync(retainedSeed)) {
    const seed = JSON.parse(regular(retainedSeed).toString("utf8"));
    if (seed.source?.caseId === options.case && seed.source?.planId === options.plan &&
        seed.workshare?.caseId === customer.workshareCaseId &&
        seed.workshare?.planSha256 === customer.planSha256)
      return earlier;
  }
  // Two customers can select the same installed profile in this original operation.
  // The complete case identity selects a private programme directory; an earlier
  // accepted per-profile seed continues in its own retained location.
  const identity = hash(Buffer.from(canonical({workshareCaseId: customer.workshareCaseId,
    planSha256: customer.planSha256}), "utf8"));
  return join(root, customer.profile + "-" + identity);
}
function prepareProgramme(customer, attached) {
  const selected = programmeInputs(customer, attached);
  if (!selected) return null;
  const profile = readProfile(customer.profile).value;
  const directory = programmeDirectory(customer);
  privateDirectory(directory);
  const retainedSeed = join(directory, "original-native-seed.json");
  let seed;
  if (existsSync(retainedSeed)) seed = JSON.parse(regular(retainedSeed).toString("utf8"));
  else {
    seed = retryCurrent(state => nativeCustomerSeed(customer, attached, state,
      existingInstallation(state, customer.workshareCaseId)));
    retain(retainedSeed, json(seed));
  }
  if (seed.source?.caseId !== options.case || seed.source?.planId !== options.plan ||
      seed.workshare?.caseId !== customer.workshareCaseId || seed.workshare?.planSha256 !== customer.planSha256)
    fail("The retained customer programme seed belongs to another original operation.");
  const linkedSources = attached.map(file => file.source.id);
  const document = seed.installationId ?
    appliedBindings(seed.document, customer.bindings || {}, linkedSources) :
    prepareInstallation(seed, profile,
      appliedBindings(bindingTemplate(seed, profile), customer.bindings || {}, linkedSources)).document;
  const original = attached.find(file => file.role === "commissioning");
  const commissioning = JSON.parse(regular(original.path).toString("utf8"));
  const value = composeCustomerProgramme({seed, document, profile, commissioning, ...selected});
  const outputs = [];
  for (const [name, content] of programmeFiles(value)) {
    const bytes = Buffer.from(content, "utf8");
    if (bytes.length > 8 * 1024 * 1024) fail("Retain the complete programme source within the native 8 MiB attachment size.");
    const filename = customer.profile + "-" + name;
    const mediaType = name.endsWith(".json") ? "application/json" :
      name.endsWith(".html") ? "text/html" : name.endsWith(".csv") ? "text/csv" : "text/markdown";
    outputs.push({...retain(join(directory, filename), bytes), filename, mediaType,
      role: "source", sourceUrl: original.sourceUrl, observedAt: original.observedAt});
  }
  return {selected, value, outputs, commissioning, directory};
}
function programmeResult(programme, attached, original, acceptedSave) {
  if (!programme) return null;
  return {
    schema: PROGRAMME_SCHEMA + ".receiving",
    ...(acceptedSave === undefined ? {} : {acceptedSave}),
    commercial: {currency: programme.value.commercial.commercial.currency,
      amount: programme.value.commercial.commercial.amount,
      priceStatus: programme.value.commercial.commercial.price_status,
      milestones: programme.value.commercial.commercial.milestones,
      businessDays: programme.value.commercial.schedule.business_days,
      effortHours: programme.value.commercial.totalEffortHours,
      phaseCount: programme.value.commercial.phaseCount},
    calendar: {startDate: programme.value.calendar.startDate,
      endDateInclusive: programme.value.calendar.endDateInclusive,
      customerTasks: programme.value.customerRows.length,
      completeCalendar: programme.value.calendar.summary},
    taskBudget: programme.value.taskBudget,
    sourceFiles: attached.filter(file => programme.outputs.some(output => output.sha256 === file.sha256 &&
      output.filename === file.filename)).map(file => ({id: file.source.id, filename: file.filename,
        bytes: file.bytes, sha256: file.sha256, mediaType: file.mediaType, path: file.path})),
    nativeProgramme: Object.fromEntries(PROGRAMME_FIELDS.filter(key => Object.hasOwn(original.preview.document, key))
      .map(key => [key, original.preview.document[key]])),
    nativeCalendarReport: original.preview.report?.useCalendar || null,
    nativeCommissioningReport: original.preview.report?.commissioning || null
  };
}

function acceptedProgrammeSave(customer, before, seed, programme) {
  const change = programme?.selected.nativeChange;
  if (!before || !change || change.installationId !== null || change.expectedRevision !== 0)
    return undefined;
  // The original native writer retains its first edition and matching case event
  // even when this receiver never received the successful save response.
  const opened = native(["installation-show", "--case", options.case, "--installation", before.id,
    "--revision", "1"]);
  const {current: observation, ...edition} = opened;
  const sourceVersion = edition.preview?.source?.version;
  if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 1 ||
      !Number.isSafeInteger(edition.version) || edition.version !== sourceVersion + 1)
    fail("The original first Installation edition has no retained source version.");
  const history = native(["history", "--case", options.case, "--after", String(sourceVersion), "--limit", "1"]);
  if (!Array.isArray(history.events) || history.events.length !== 1 ||
      history.events[0].version !== edition.version)
    fail("Reopen the complete original first-save event before continuing the customer programme.");
  const requestId = operationId("installation", {caseId: options.case, version: sourceVersion,
    installationId: null, expectedRevision: 0, previewSha256: edition.preview.previewSha256});
  const event = history.events[0];
  // Another operator's first save does not authorize this request's identity.
  // The unchanged exact-current-document path can still review such a draft.
  if (event.requestId !== requestId) return undefined;
  const accepted = {schema: "stellar-forge.installation-programme-save.v1",
    requestId, actor: options.actor, edition, event};
  validateProgrammeSave({seed, change, acceptedSave: accepted});
  retain(join(programme.directory, "accepted-first-save.json"), json(accepted));
  return accepted;
}

function receiveCustomer(customer, attached, programme) {
  const profile = readProfile(customer.profile).value;
  return retryCurrent(state => {
    const before = existingInstallation(state, customer.workshareCaseId);
    const version = state.program.version;
    const seed = nativeCustomerSeed(customer, attached, state, before);
    const linkedSources = attached.map(file => file.source.id);
    let prepared, bindings;
    if (before) {
      const document = appliedBindings(seed.document, customer.bindings || {}, linkedSources);
      prepared = {schema: "stellar-forge.installation-workorder-preparation.v1", profile: profile.id,
        source: seed.source, workshareCaseId: customer.workshareCaseId, document,
        selections: [], implementation: profile.steps, inputs: profile.inputs, sourceFiles: profile.sourceFiles};
      bindings = customer.bindings || {};
    } else {
      bindings = appliedBindings(bindingTemplate(seed, profile), customer.bindings || {}, linkedSources);
      prepared = prepareInstallation(seed, profile, bindings);
    }
    const acceptedSave = acceptedProgrammeSave(customer, before, seed, programme);
    if (programme) prepared.document = composeCustomerProgramme({seed, document: prepared.document, profile,
      commissioning: programme.commissioning, ...programme.selected, acceptedSave}).document;
    const tag = customer.profile + "-v" + version + "-" + hash(json(prepared.document)).slice(0, 16);
    retain(join(options.out, tag + "-seed.json"), json(seed));
    retain(join(options.out, tag + "-bindings.json"), json(bindings));
    const document = retain(join(options.out, tag + "-installation.json"), json(prepared.document));
    const previewArgs = ["installation-preview", "--case", options.case, "--expected-version", String(version),
      "--document", document.path, "--expected-revision", String(before?.revision || 0)];
    if (before) previewArgs.push("--installation", before.id);
    const preview = native(previewArgs);
    prepared.document = preview.document;
    const pending = new Map(prepared.selections.map(item => [item.field, item]));
    for (const finding of preview.report?.findings || [])
      if (finding.kind !== "ACCEPTANCE") pending.set(finding.field, {field: finding.field, purpose: finding.message});
    prepared.selections = [...pending.values()];
    const workorder = retain(join(options.out, tag + "-WORKORDER.md"), Buffer.from(renderWorkorder(prepared)));
    if (before && same(before.preview.document, preview.document)) {
      return {profile: customer.profile, workshareCaseId: customer.workshareCaseId,
        installation: {id: before.id, revision: before.revision, sha256: before.sha256},
        document, workorder, original: before, pendingSelections: prepared.selections,
        programme: programmeResult(programme, attached, before, acceptedSave)};
    }
    if (typeof preview.previewSha256 !== "string") fail("Retain the complete native Installation preview.");
    const requestId = operationId("installation", {caseId: options.case, version,
      installationId: before?.id || null, expectedRevision: before?.revision || 0, previewSha256: preview.previewSha256});
    const saveArgs = ["installation-save", "--case", options.case, "--expected-version", String(version),
      "--document", document.path, "--expected-revision", String(before?.revision || 0),
      "--expected-preview-sha256", preview.previewSha256, "--actor", options.actor,
      "--request-id", requestId, "--note", "Receive the complete original customer Workshare and operating preparation: " + customer.workshareCaseId];
    if (before) saveArgs.push("--installation", before.id);
    const saved = native(saveArgs);
    nativeMutations.push(saved);
    const opened = native(["installation-show", "--case", options.case, "--installation", saved.recordId,
      "--revision", String(saved.revision)]);
    if (opened.preview.document.workshare.caseId !== customer.workshareCaseId || !same(opened.preview.document, preview.document))
      fail("The saved native Installation differs from its complete reviewed document.");
    return {profile: customer.profile, workshareCaseId: customer.workshareCaseId,
      installation: {id: opened.id, revision: opened.revision, sha256: opened.sha256},
      document, workorder, original: opened, pendingSelections: prepared.selections,
      programme: programmeResult(programme, attached, opened, acceptedSave)};
  });
}
let options, input;
const nativeMutations = [];
function finishReceiving(intent) {
  if (intent.schema !== schema || intent.original.caseId !== options.case ||
      intent.original.planId !== options.plan || !Array.isArray(intent.installations) ||
      !/^Complete_Customer_Installations-[a-f0-9]{24}\.zip$/.test(intent.exportName))
    fail("Retain the original complete receiving checkpoint.");
  const exportPath = join(options.out, intent.exportName);
  const selected = intent.installations[intent.installations.length - 1].installation;
  let archive;
  if (existsSync(exportPath)) {
    const raw = regular(exportPath, 128 * 1024 * 1024);
    archive = {path: exportPath, bytes: raw.length, sha256: hash(raw)};
  } else {
    archive = native(["installation-export", "--case", options.case, "--installation", selected.id,
      "--revision", String(selected.revision), "--output", exportPath]).output;
  }
  if (!archive?.sha256) fail("Retain the complete native case export.");
  const receiveId = operationId("import", {sha256: archive.sha256, workspace: options["receiving-workspace"]});
  const imported = native(["import", "--file", exportPath, "--name", input.receivingName || "Received customer installations",
    "--actor", options["receiving-actor"], "--request-id", receiveId], options["receiving-workspace"]);
  nativeMutations.push(imported);
  if (typeof imported.id !== "string") fail("The original import did not return its receiving case identity.");
  const received = current(options["receiving-workspace"], imported.id);
  for (const row of intent.installations) {
    const saved = native(["installation-show", "--case", imported.id, "--installation", row.installation.id,
      "--revision", String(row.installation.revision)], options["receiving-workspace"]);
    if (saved.sha256 !== row.installation.sha256 || saved.preview.document.workshare.caseId !== row.workshareCaseId)
      fail("The imported original customer Installation differs from its saved edition.");
    if (row.programme) {
      const selectedProgramme = Object.fromEntries(PROGRAMME_FIELDS.filter(key => Object.hasOwn(saved.preview.document, key))
        .map(key => [key, saved.preview.document[key]]));
      if (!same(row.programme.nativeProgramme, selectedProgramme) ||
          !same(row.programme.nativeCalendarReport, saved.preview.report?.useCalendar || null) ||
          !same(row.programme.nativeCommissioningReport, saved.preview.report?.commissioning || null))
        fail("The received original customer programme differs from its saved native report.");
      for (const file of row.programme.sourceFiles) {
        const actual = received.sources.find(source => source.id === file.id);
        if (!actual || actual.sha256 !== file.sha256 || actual.bytes !== file.bytes || actual.mediaType !== file.mediaType)
          fail("The complete received customer programme source differs: " + file.filename);
      }
    }
  }
  const path = join(options.out, "RECEIVED.json");
  let completion;
  if (existsSync(path)) {
    completion = JSON.parse(regular(path).toString("utf8"));
    if (completion.archive?.sha256 !== archive.sha256 || completion.receiving?.caseId !== imported.id ||
        !same(completion.installations, intent.installations))
      fail("The completed receiving checkpoint describes a different original operation.");
  } else {
    completion = {schema, original: {...intent.original, completedVersion: imported.version},
      receiving: {workspace: options["receiving-workspace"], caseId: received.program.id,
        planId: received.program.planId, importedVersion: imported.version, actor: options["receiving-actor"]},
      archive, installations: intent.installations, nativeMutations};
    retain(path, json(completion));
  }
  const raw = regular(path);
  console.log(JSON.stringify({...completion, currentReceivingVersion: received.program.version,
    output: {path, bytes: raw.length, sha256: hash(raw)}}, null, 2));
}
try {
  options = parse(process.argv.slice(2));
  options.out = resolve(options.out);
  privateDirectory(options.out);
  const loaded = readInputs(); input = loaded.value;
  const request = {schema, options, inputsSha256: hash(loaded.bytes)};
  retain(join(options.out, "receiving-input.json"), json(request));
  const checkpoint = join(options.out, "receiving-export.json");
  if (existsSync(checkpoint)) {
    finishReceiving(JSON.parse(regular(checkpoint).toString("utf8")));
  } else {
    const original = current();
    const results = [];
    for (const customer of input.customers) {
      const attached = customer.files.map(file => ({...file, source: receiveFile(file)}));
      const programme = prepareProgramme(customer, attached);
      if (programme) attached.push(...programme.outputs.map(file => ({...file, source: receiveFile(file)})));
      results.push(receiveCustomer(customer, attached, programme));
    }
    const final = current();
    const installations = results.map(row => ({
      profile: row.profile, workshareCaseId: row.workshareCaseId, installation: row.installation,
      document: row.document, workorder: row.workorder, pendingSelections: row.pendingSelections,
      ...(row.programme ? {programme: row.programme} : {})
    }));
    const exportName = "Complete_Customer_Installations-" +
      hash(json({installations, version: final.program.version})).slice(0, 24) + ".zip";
    const intent = {schema, original: {workspace: options.workspace, caseId: options.case,
        planId: options.plan, startedVersion: original.program.version, selectedVersion: final.program.version},
      exportName, installations};
    retain(checkpoint, json(intent));
    finishReceiving(intent);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
