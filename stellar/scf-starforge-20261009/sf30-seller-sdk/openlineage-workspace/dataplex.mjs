import { promises as fs } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { spawn } from "node:child_process";
import { canonical, digest, sha256, inspectEvent } from "./model.mjs";
import * as workspaceRuntime from "./store.mjs";
const { APPLICATION_FILES, verifyBundle, receiveBundle } = workspaceRuntime;

const ROOT = dirname(fileURLToPath(import.meta.url));
export const GOOGLE_FILES = Object.freeze(["dataplex.mjs", "dataplex-cli.mjs", "dataplex.d.mts", "DATAPLEX.md"]);
const PLAN = "commons.openlineage.google-plan.v1";
const JOURNAL = "commons.openlineage.google-delivery.v1";
const PACKAGE = "commons.openlineage.google-package.v1";
const API = "https://datalineage.googleapis.com/v1/";
const MAX_MESSAGE_BYTES = 5000000;
const HASH = /^[0-9a-f]{64}$/;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const now = () => new Date().toISOString();
const copy = value => structuredClone(value);

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f]/.test(value)) throw new Error(label + " must be nonempty text without control characters");
  return value;
}
function checkedParent(project, location) {
  if (typeof project !== "string" || !/^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]{1,30})$/.test(project)) throw new Error("Use the customer's Google project ID or project number");
  if (typeof location !== "string" || !/^[a-z][a-z0-9-]{0,62}$/.test(location)) throw new Error("Use the selected Google Cloud location");
  return "projects/" + project + "/locations/" + location;
}
function requestUuid(parent, eventHash) {
  const hex = digest({ parent, eventHash, purpose: PLAN }).slice(0, 32).split("");
  hex[12] = "8"; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const h = hex.join("");
  return h.slice(0,8) + "-" + h.slice(8,12) + "-" + h.slice(12,16) + "-" + h.slice(16,20) + "-" + h.slice(20);
}
async function exists(path) {
  try { await fs.lstat(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
async function readPlain(path) {
  const stat = await fs.lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Expected a regular file: " + path);
  return fs.readFile(path);
}
async function syncDirectory(directory) {
  if (process.platform === "win32") return;
  const handle = await fs.open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}
async function save(path, value) {
  const temporary = path + ".pending-" + randomUUID();
  let handle;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2) + "\n");
    await handle.sync(); await handle.close(); handle = null;
    await fs.rename(temporary, path);
    await syncDirectory(dirname(path));
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
  }
}
async function writeNew(path, bytes) {
  const handle = await fs.open(path, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
async function jsonFile(path) { return JSON.parse((await readPlain(path)).toString("utf8")); }
async function identity() {
  let pidNamespace = null, procPid = null;
  try { pidNamespace = await fs.readlink("/proc/self/ns/pid"); } catch {}
  try { procPid = Number(await fs.readlink("/proc/self")); } catch {}
  return { pid: process.pid, procPid, pidNamespace, hostname: hostname() };
}
async function locked(directory, action) {
  const path = join(directory, "google-writer.lock"), owner = { id: randomUUID(), at: now(), ...await identity() };
  let handle;
  try { handle = await fs.open(path, "wx", 0o600); }
  catch (error) {
    if (error.code === "EEXIST") throw Object.assign(new Error("This Google delivery has an existing writer; use its original operation or inspect the saved lock"), { code: "DELIVERY_WRITER_ACTIVE" });
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify(owner)); await handle.sync();
    return await action();
  } finally {
    await handle.close();
    const current = await jsonFile(path);
    if (current.id !== owner.id) throw new Error("Google delivery writer identity changed");
    await fs.unlink(path); await syncDirectory(directory);
  }
}
export async function recoverGoogleWriter(directory, lockId) {
  directory = resolve(directory);
  const path = join(directory, "google-writer.lock"), previous = await jsonFile(path), current = await identity();
  if (previous.id !== lockId) throw new Error("Original writer identity differs");
  if (previous.hostname !== current.hostname || previous.pidNamespace !== current.pidNamespace) throw new Error("Original writer belongs to another host or PID namespace; continue there or receive its complete exported delivery on this host");
  if (!Number.isInteger(previous.pid) || previous.pid < 1) throw new Error("Invalid saved writer PID");
  try { process.kill(previous.pid, 0); throw new Error("Original writer process is still present"); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
  if ((await jsonFile(path)).id !== lockId) throw new Error("Original writer changed");
  await fs.unlink(path);
  return { recovered: lockId };
}

/** Documented naming forms only; an explicit expected FQN adds a reviewed assertion,
 * never a rewrite of an original producer event. Remote receiving checks it. */
export function googleFqn(namespace, name) {
  if (typeof namespace !== "string" || typeof name !== "string") return null;
  if (namespace === "bigquery") return "bigquery:" + name;
  if (namespace === "custom") return "custom:" + name;
  if (namespace === "file") return "filesystem:localhost." + name;
  if (namespace === "pubsub" && /^(topic|subscription):[^:]+:[^:]+$/.test(name)) {
    const [kind, project, resource] = name.split(":");
    return "pubsub:" + kind + ":" + project + "." + resource;
  }
  let match;
  if ((match = /^(?:s3|s3a|s3n):\/\/([^/]+)$/.exec(namespace))) return "s3:" + match[1] + (name ? "." + name : "");
  if ((match = /^gs:\/\/([^/]+)$/.exec(namespace))) return "gcs:" + match[1] + (name ? "." + name : "");
  if ((match = /^kafka:\/\/([^/]+)$/.exec(namespace))) return "kafka:" + match[1] + "." + name;
  if ((match = /^mysql:\/\/([^/]+)$/.exec(namespace))) return "mysql:" + match[1] + "." + name;
  if ((match = /^postgres:\/\/([^/]+)$/.exec(namespace))) return "postgresql:" + match[1] + "." + name;
  if ((match = /^file:\/\/([^/]+)$/.exec(namespace))) return "filesystem:" + match[1] + "." + name;
  return null;
}
function mappingIndex(expectedFqns) {
  if (!Array.isArray(expectedFqns)) throw new Error("expectedFqns must be an array");
  const result = new Map();
  for (const row of expectedFqns) {
    if (!row || typeof row.namespace !== "string" || typeof row.name !== "string") throw new Error("Expected FQN requires exact original namespace and name");
    const key = canonical([row.namespace, row.name]);
    if (result.has(key)) throw new Error("Duplicate expected FQN");
    requireText(row.fullyQualifiedName, "fullyQualifiedName");
    if ([...row.fullyQualifiedName].length > 4000) throw new Error("Expected FQN exceeds 4000 characters");
    const inferred = googleFqn(row.namespace, row.name);
    if (inferred !== null && inferred !== row.fullyQualifiedName) throw new Error("Explicit FQN differs from the documented mapping for " + key);
    result.set(key, row.fullyQualifiedName);
  }
  return result;
}
function inspectForGoogle(row, expected) {
  const original = row.event, event = original && typeof original === "object" && !Array.isArray(original) ? original : {};
  const inspected = inspectEvent(original), diagnostics = [...inspected.diagnostics], notes = [...(inspected.notes ?? [])];
  if (inspected.kind !== "run" || !["1-0-1","1-0-5"].includes(inspected.schemaVersion)) diagnostics.push("Google import requires a genuine supported OpenLineage 1.x RunEvent; configure the original producer for that contract");
  if (!event.eventType) diagnostics.push("Google run import requires an explicit eventType");
  const body = Buffer.from(canonical(original));
  if (body.length > MAX_MESSAGE_BYTES) diagnostics.push("Event exceeds the 5000000-byte delivery limit");
  const assets = [], namesByDirection = { inputs: [], outputs: [] };
  for (const direction of ["inputs", "outputs"]) {
    for (const item of Array.isArray(event[direction]) ? event[direction] : []) {
      if (!item || typeof item.namespace !== "string" || typeof item.name !== "string") continue;
      const key = canonical([item.namespace, item.name]), known = googleFqn(item.namespace, item.name);
      const fqn = known ?? expected.get(key) ?? null;
      if (fqn === null) diagnostics.push("Record the exact expected Google FQN for " + key + " or correct the original producer's namespace/name");
      if (fqn !== null && [...fqn].length > 4000) diagnostics.push("Google FQN exceeds 4000 characters for " + key);
      assets.push({ direction, namespace: item.namespace, name: item.name, fullyQualifiedName: fqn, mapping: known === null ? "operator-declared" : "documented" });
      if (fqn !== null) namesByDirection[direction].push(fqn);
      if (item.facets?.columnLineage || item.columnLineage) notes.push("Custom column lineage remains in the full original event; Google's custom-event console graph is table-level");
    }
  }
  const inputs = [...new Set(namesByDirection.inputs)].sort(), outputs = [...new Set(namesByDirection.outputs)].sort();
  if (inputs.length * outputs.length > 1000) diagnostics.push("Selected event exceeds Google's aggregate table-link limit");
  const expectedLinks = [];
  if (inputs.length * outputs.length <= 1000) for (const source of inputs) for (const target of outputs) expectedLinks.push({ source, target });
  return { eventId: row.id, kind: inspected.kind, job: event.job && typeof event.job === "object" ? copy(event.job) : null, runId: event.run?.runId ?? null,
    eventType: event.eventType ?? null, eventTime: event.eventTime ?? null, schemaURL: event.schemaURL ?? null,
    sourcePositions: copy(row.sources ?? []), payloadSha256: sha256(body), payloadBytes: body.length,
    assets, expectedLinks, diagnostics: [...new Set(diagnostics)], notes: [...new Set(notes)] };
}
function planHash(plan) { const { planSha256, ...payload } = plan; return digest(payload); }
function validatePlan(plan) {
  if (plan.schema !== PLAN || !HASH.test(plan.planSha256) || planHash(plan) !== plan.planSha256) throw new Error("Google plan identity differs");
  if (plan.parent !== checkedParent(plan.project, plan.location)) throw new Error("Google parent differs from plan");
  checkedParent(plan.quotaProject, plan.location);
  if (!Array.isArray(plan.events) || !plan.events.length) throw new Error("Google plan has no selected original events");
  if (new Set(plan.events.map(item => item.eventId)).size !== plan.events.length) throw new Error("Repeated planned event");
  for (const item of plan.events) {
    if (!HASH.test(item.eventId) || !HASH.test(item.payloadSha256) || item.requestId !== requestUuid(plan.parent, item.payloadSha256)) throw new Error("Original event/request identity differs");
  }
  return plan;
}
function validateJournal(journal, plan) {
  if (journal.schema !== JOURNAL || journal.planSha256 !== plan.planSha256 || journal.operationId !== plan.operationId) throw new Error("Google journal is for a different plan");
  if (!journal.events || Array.isArray(journal.events)) throw new Error("Google event journal is absent");
  const ids = new Set(plan.events.map(item => item.eventId));
  if (Object.keys(journal.events).some(id => !ids.has(id))) throw new Error("Google journal contains an unknown event");
  if (journal.approval) {
    const selected = journal.approval.eventIds;
    if (journal.approval.planSha256 !== plan.planSha256 || !Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length || selected.some(id => !ids.has(id) || plan.events.find(item => item.eventId === id).diagnostics.length)) throw new Error("Approval differs from original Google plan");
  }
  for (const [eventId, entry] of Object.entries(journal.events)) {
    const item = plan.events.find(row => row.eventId === eventId);
    if (entry.requestId !== item.requestId || !Array.isArray(entry.attempts)) throw new Error("Google event journal identity differs");
  }
  return journal;
}

export class GoogleLineageDelivery {
  constructor(directory) { this.directory = resolve(directory); }
  async read() {
    const plan = validatePlan(await jsonFile(join(this.directory, "google-plan.json")));
    const journal = validateJournal(await jsonFile(join(this.directory, "google-delivery.json")), plan);
    const bytes = await readPlain(join(this.directory, "source-workspace.json"));
    if (sha256(bytes) !== plan.sourcePackageSha256) throw new Error("Original source package differs");
    const verified = verifyBundle(bytes);
    if (!verified.application.size) throw new Error("Export the complete original workspace with its application source");
    if (verified.state.workspaceId !== plan.workspaceId || verified.state.revision !== plan.revision) throw new Error("Original workspace identity differs");
    const rows = new Map(verified.state.events.map(row => [row.id, row]));
    for (const item of plan.events) {
      const row = rows.get(item.eventId);
      if (!row || sha256(Buffer.from(canonical(row.event))) !== item.payloadSha256) throw new Error("Planned Google body differs from original source event");
    }
    return { plan, journal, verified, sourceBytes: bytes };
  }
  async status() {
    const { plan, journal } = await this.read();
    return { directory: this.directory, plan, journal,
      totals: { selected: plan.events.length, eligible: plan.events.filter(item => !item.diagnostics.length).length,
        approved: journal.approval?.eventIds.length ?? 0,
        confirmed: Object.values(journal.events).filter(item => item.state === "CONFIRMED").length,
        received: Object.values(journal.events).filter(item => item.receiving?.state === "RECEIVED").length } };
  }
  async approve({ planSha256, operator, eventIds = null }) {
    requireText(operator, "operator");
    return locked(this.directory, async () => {
      const { plan, journal } = await this.read();
      if (planSha256 !== plan.planSha256) throw new Error("Review the exact current Google plan before approval");
      const selected = eventIds === null ? plan.events.map(item => item.eventId) : eventIds;
      if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length) throw new Error("Select distinct original event IDs");
      for (const id of selected) {
        const row = plan.events.find(item => item.eventId === id);
        if (!row || row.diagnostics.length) throw new Error("Selected event requires source or mapping correction: " + id);
      }
      if (Object.keys(journal.events).length) {
        if (canonical(selected) === canonical(journal.approval?.eventIds) && journal.approval?.operator === operator) return journal.approval;
        throw new Error("A dispatched plan retains its original approval; prepare a new reviewed source edition for changed work");
      }
      journal.approval = { planSha256, operator, eventIds: [...selected], approvedAt: now() };
      await save(join(this.directory, "google-delivery.json"), journal);
      return journal.approval;
    });
  }
  async publish({ accessToken = googleAccessToken, fetchImpl = globalThis.fetch, timeoutMs = 60000 } = {}) {
    return locked(this.directory, async () => {
      const { plan, journal, verified } = await this.read();
      if (!journal.approval) throw new Error("Approve the original Google plan before publishing");
      const events = new Map(verified.state.events.map(row => [row.id, row.event]));
      for (const eventId of journal.approval.eventIds) {
        const planned = plan.events.find(item => item.eventId === eventId);
        const entry = journal.events[eventId] ?? { requestId: planned.requestId, state: "PREPARED", attempts: [] };
        journal.events[eventId] = entry;
        if (entry.state === "CONFIRMED") continue;
        if (entry.retryAt && Date.parse(entry.retryAt) > Date.now()) break;
        const token = await accessToken();
        if (typeof token !== "string" || !token.trim() || /[\s\u0000]/.test(token)) throw new Error("Google access token provider returned an invalid token");
        const attempt = { id: randomUUID(), startedAt: now(), state: "DISPATCHED", requestId: entry.requestId };
        entry.state = "DISPATCHED"; entry.attempts.push(attempt);
        await save(join(this.directory, "google-delivery.json"), journal);
        const url = API + plan.parent + ":processOpenLineageRunEvent?requestId=" + encodeURIComponent(entry.requestId);
        try {
          const response = await fetchImpl(url, { method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json; charset=utf-8", "X-Goog-User-Project": plan.quotaProject },
            body: canonical(events.get(eventId)), redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
          const text = await response.text();
          let result;
          try { result = text ? JSON.parse(text) : null; } catch { result = { unparsedBody: text }; }
          attempt.finishedAt = now(); attempt.httpStatus = response.status; attempt.response = result;
          if (response.ok) {
            checkRemoteNames(result, plan.location);
            entry.response = result; entry.state = "CONFIRMED"; attempt.state = "CONFIRMED"; delete entry.retryAt;
          } else {
            const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
            entry.state = retryable ? "RETRYABLE" : "REJECTED"; attempt.state = entry.state;
            const after = retryTime(response.headers.get("retry-after"));
            if (after) entry.retryAt = after;
          }
          await save(join(this.directory, "google-delivery.json"), journal);
          if (!response.ok) break;
        } catch (error) {
          attempt.finishedAt = now(); attempt.state = "UNRESOLVED";
          // Transport error messages may contain proxy/credential details; retain a
          // useful category while the complete approved request remains in source.
          attempt.error = { name: error?.name ?? "Error", code: error?.code ?? null };
          entry.state = "UNRESOLVED";
          await save(join(this.directory, "google-delivery.json"), journal);
          break;
        }
      }
      return { operationId: plan.operationId, planSha256: plan.planSha256, journal: copy(journal) };
    });
  }
  async reconcile({ accessToken = googleAccessToken, fetchImpl = globalThis.fetch, timeoutMs = 60000 } = {}) {
    return locked(this.directory, async () => {
      const { plan, journal } = await this.read();
      if (!journal.approval) throw new Error("Approve the original Google plan before reconciling");
      for (const eventId of journal.approval.eventIds) {
        const entry = journal.events[eventId], planned = plan.events.find(item => item.eventId === eventId);
        if (entry?.state !== "CONFIRMED" || entry.receiving?.state === "RECEIVED") continue;
        if (entry.receiving?.retryAt && Date.parse(entry.receiving.retryAt) > Date.now()) break;
        const remote = checkRemoteNames(entry.response, plan.location), observed = [], links = [], columnLinks = [];
        const token = await accessToken();
        if (typeof token !== "string" || !token.trim() || /[\s\u0000]/.test(token)) throw new Error("Google access token provider returned an invalid token");
        if (entry.receiving) (entry.receivingHistory ??= []).push(copy(entry.receiving));
        const receiving = { id: randomUUID(), state: "READING", startedAt: now(), events: observed };
        entry.receiving = receiving;
        await save(join(this.directory, "google-delivery.json"), journal);
        let incomplete = false;
        for (const name of remote.lineageEvents) {
          try {
            const response = await fetchImpl(API + name, { headers: { Authorization: "Bearer " + token, "X-Goog-User-Project": plan.quotaProject },
              redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
            const text = await response.text();
            let result; try { result = text ? JSON.parse(text) : null; } catch { result = { unparsedBody: text }; }
            observed.push({ name, at: now(), httpStatus: response.status, response: result });
            if (!response.ok) {
              incomplete = true; receiving.retryAt = retryTime(response.headers.get("retry-after"));
              break;
            }
            const returnedLinks = result?.links ?? [];
            if (result?.name !== name || !Array.isArray(returnedLinks)) throw new Error("Google returned a different lineage event");
            for (const link of returnedLinks) {
              if (typeof link?.source?.fullyQualifiedName !== "string" || typeof link?.target?.fullyQualifiedName !== "string") throw new Error("Google lineage link has no original endpoint name");
              const sourceFields = link.source.field ?? [], targetFields = link.target.field ?? [];
              if (!Array.isArray(sourceFields) || !Array.isArray(targetFields) || [...sourceFields, ...targetFields].some(field => typeof field !== "string")) throw new Error("Google lineage field path is invalid");
              const edge = { source: link.source.fullyQualifiedName, target: link.target.fullyQualifiedName };
              if (sourceFields.length || targetFields.length) columnLinks.push({ ...edge, sourceFields: copy(sourceFields), targetFields: copy(targetFields) });
              else links.push(edge);
            }
          } catch (error) {
            incomplete = true; receiving.error = { name: error?.name ?? "Error", code: error?.code ?? null }; break;
          } finally { await save(join(this.directory, "google-delivery.json"), journal); }
        }
        receiving.finishedAt = now();
        receiving.actualLinks = uniqueLinks(links); receiving.columnLinks = uniqueLinks(columnLinks); receiving.expectedLinks = uniqueLinks(planned.expectedLinks);
        const actual = new Set(receiving.actualLinks.map(canonical)), expected = new Set(receiving.expectedLinks.map(canonical));
        receiving.missing = receiving.expectedLinks.filter(link => !actual.has(canonical(link)));
        receiving.unexpected = receiving.actualLinks.filter(link => !expected.has(canonical(link)));
        receiving.state = incomplete ? "UNRESOLVED" : receiving.missing.length || receiving.unexpected.length ? "MAPPING_REVIEW" : "RECEIVED";
        await save(join(this.directory, "google-delivery.json"), journal);
        if (incomplete) break;
      }
      return { operationId: plan.operationId, journal: copy(journal) };
    });
  }
  async exportPackage(destination) {
    return locked(this.directory, async () => {
      const { plan, journal, sourceBytes } = await this.read(), application = [];
      for (const path of [...new Set([...APPLICATION_FILES, ...GOOGLE_FILES])].sort()) {
        const bytes = await readPlain(join(ROOT, path));
        application.push({ path, sha256: sha256(bytes), bytes: bytes.length, base64: bytes.toString("base64") });
      }
      const payload = { schema: PACKAGE, exportedAt: now(), plan, journal,
        source: { sha256: sha256(sourceBytes), bytes: sourceBytes.length, base64: sourceBytes.toString("base64") }, application };
      const bytes = Buffer.from(JSON.stringify({ ...payload, payloadSha256: digest(payload) }));
      await writeNew(resolve(destination), bytes);
      return { path: resolve(destination), bytes: bytes.length, sha256: sha256(bytes), operationId: plan.operationId,
        workspaceId: plan.workspaceId, applicationFiles: application.length };
    });
  }
  async writeReport(destination) {
    const status = await this.status();
    await writeNew(resolve(destination), Buffer.from(googleReport(status)));
    return { path: resolve(destination), planSha256: status.plan.planSha256 };
  }
}
function knownApplicationManifests() {
  const originals = [APPLICATION_FILES, ...Object.entries(workspaceRuntime)
    .filter(([name, value]) => /^VERSION_[0-9]+.*_APPLICATION_FILES$/.test(name) && Array.isArray(value))
    .map(([, value]) => value)];
  return originals.map(files => new Set([...files, ...GOOGLE_FILES]));
}
function uniqueLinks(links) { return [...new Map(links.map(link => [canonical(link), link])).values()].sort((a,b) => canonical(a).localeCompare(canonical(b))); }
function retryTime(value) {
  if (!value) return null;
  const timestamp = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Date.now() + Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(timestamp) && Math.abs(timestamp) <= 8640000000000000 ? new Date(Math.max(Date.now(), timestamp)).toISOString() : null;
}
function checkRemoteNames(value, location) {
  const lineageEvents = value?.lineageEvents ?? [];
  if (!value || typeof value.process !== "string" || typeof value.run !== "string" || !Array.isArray(lineageEvents)) throw new Error("Google response lacks process/run/lineage event identities");
  const segment = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
  const match = /^projects\/([^/]+)\/locations\/([^/]+)\/processes\/([^/]+)$/.exec(value.process);
  if (!match || !segment.test(match[1]) || match[2] !== location || !segment.test(match[3])) throw new Error("Google returned an unexpected process");
  const runPrefix = value.process + "/runs/";
  if (!value.run.startsWith(runPrefix) || !segment.test(value.run.slice(runPrefix.length))) throw new Error("Google returned an unexpected run");
  const prefix = value.run + "/lineageEvents/";
  for (const name of lineageEvents) if (typeof name !== "string" || !name.startsWith(prefix) || !segment.test(name.slice(prefix.length))) throw new Error("Google returned an unexpected lineage event");
  if (new Set(lineageEvents).size !== lineageEvents.length) throw new Error("Google returned duplicate lineage event names");
  return { ...value, lineageEvents };
}
export async function googleAccessToken({ gcloud = "gcloud" } = {}) {
  const provided = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (provided) return provided.trim();
  return new Promise((accept, reject) => {
    const child = spawn(gcloud, ["auth", "application-default", "print-access-token"], { stdio: ["ignore", "pipe", "ignore"], shell: false });
    let stdout = "", overflow = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error("Google ADC token command timed out")); }, 30000);
    child.stdout.on("data", bytes => { stdout += bytes.toString("utf8"); if (stdout.length > 65536) { overflow = true; child.kill(); } });
    child.on("error", () => { clearTimeout(timer); reject(new Error("Could not start the Google ADC token command")); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0 || overflow || !stdout.trim()) reject(new Error("Google ADC token command did not return an access token"));
      else accept(stdout.trim());
    });
  });
}
export async function prepareGoogleDelivery({ directory, sourceBytes, project, location, quotaProject = project, editionId, expectedFqns = [], title = "Google lineage delivery" }) {
  directory = resolve(directory);
  const bytes = Buffer.from(sourceBytes), verified = verifyBundle(bytes), expected = mappingIndex(expectedFqns);
  if (!verified.application.size) throw new Error("Export the complete original workspace with its application source");
  requireText(editionId, "editionId"); requireText(title, "title");
  const edition = verified.state.editions.find(item => item.id === editionId);
  if (!edition) throw new Error("Select an original saved source edition");
  const parent = checkedParent(project, location), ids = new Set(edition.eventIds);
  checkedParent(quotaProject, location);
  const events = verified.state.events.filter(row => ids.has(row.id)).map(row => inspectForGoogle(row, expected));
  if (!events.length) throw new Error("Selected edition has no original events");
  for (const item of events) item.requestId = requestUuid(parent, item.payloadSha256);
  const sourcePackageSha256 = sha256(bytes);
  const inputIdentity = digest({ sourcePackageSha256, project, location, quotaProject, editionId, expectedFqns, title });
  if (await exists(directory)) {
    const prior = await new GoogleLineageDelivery(directory).read();
    if (prior.plan.inputIdentity !== inputIdentity) throw new Error("Existing delivery has different input; continue it or select a new directory");
    return new GoogleLineageDelivery(directory).status();
  }
  await fs.mkdir(dirname(directory), { recursive: true, mode: 0o700 });
  const stage = directory + ".preparing-" + randomUUID();
  await fs.mkdir(stage, { mode: 0o700 });
  try {
    const payload = { schema: PLAN, operationId: randomUUID(), createdAt: now(), title, inputIdentity,
      sourcePackageSha256, workspaceId: verified.state.workspaceId, revision: verified.state.revision,
      editionId, project, location, quotaProject, parent, expectedFqns: copy(expectedFqns), events };
    const plan = { ...payload, planSha256: digest(payload) };
    const journal = { schema: JOURNAL, operationId: plan.operationId, planSha256: plan.planSha256, approval: null, events: {} };
    await writeNew(join(stage, "source-workspace.json"), bytes);
    await save(join(stage, "google-plan.json"), plan); await save(join(stage, "google-delivery.json"), journal);
    await fs.rename(stage, directory); await syncDirectory(dirname(directory));
  } catch (error) { await fs.rm(stage, { recursive: true, force: true }); throw error; }
  return new GoogleLineageDelivery(directory).status();
}
export function verifyGooglePackage(bytes) {
  bytes = Buffer.from(bytes);
  const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), { payloadSha256, ...payload } = data;
  if (payload.schema !== PACKAGE || digest(payload) !== payloadSha256) throw new Error("Complete Google delivery package identity differs");
  const plan = validatePlan(payload.plan), journal = validateJournal(payload.journal, plan);
  const original = Buffer.from(payload.source.base64, "base64");
  if (original.length !== payload.source.bytes || sha256(original) !== payload.source.sha256 || payload.source.sha256 !== plan.sourcePackageSha256) throw new Error("Complete original workspace bytes differ");
  const verified = verifyBundle(original), files = new Map(), manifests = knownApplicationManifests();
  const allowed = new Set(manifests.flatMap(manifest => [...manifest]));
  if (!verified.application.size) throw new Error("Complete original source application is required");
  if (verified.state.workspaceId !== plan.workspaceId || verified.state.revision !== plan.revision) throw new Error("Google package workspace identity differs");
  for (const item of payload.application ?? []) {
    if (!allowed.has(item.path) || files.has(item.path)) throw new Error("Unknown or repeated Google application path");
    const content = Buffer.from(item.base64, "base64");
    if (content.length !== item.bytes || sha256(content) !== item.sha256) throw new Error("Google application file is incomplete");
    files.set(item.path, content);
  }
  if (!manifests.some(manifest => manifest.size === files.size && [...manifest].every(path => files.has(path)))) throw new Error("Complete Google application source is required");
  const originalRows = new Map(verified.state.events.map(row => [row.id, row.event]));
  for (const item of plan.events) if (!originalRows.has(item.eventId) || sha256(Buffer.from(canonical(originalRows.get(item.eventId)))) !== item.payloadSha256) throw new Error("Google plan event differs from original source");
  return { plan, journal, original, files, packageSha256: sha256(bytes), payloadSha256 };
}
export async function receiveGooglePackage(bytes, directory) {
  directory = resolve(directory);
  const verified = verifyGooglePackage(bytes);
  if (await exists(directory)) throw new Error("Receive into a new directory");
  await fs.mkdir(dirname(directory), { recursive: true, mode: 0o700 });
  const stage = directory + ".receiving-" + randomUUID();
  await fs.mkdir(stage, { mode: 0o700 });
  try {
    await writeNew(join(stage, "source-workspace.json"), verified.original);
    await save(join(stage, "google-plan.json"), verified.plan);
    await save(join(stage, "google-delivery.json"), verified.journal);
    await fs.mkdir(join(stage, "application"), { mode: 0o700 });
    for (const [path, content] of verified.files) await writeNew(join(stage, "application", path), content);
    const received = await receiveBundle(verified.original, join(stage, "workspace"));
    await save(join(stage, "received.json"), { schema: PACKAGE, packageSha256: verified.packageSha256,
      receivedAt: now(), operationId: verified.plan.operationId, originalWorkspace: received.workspaceId });
    await fs.rename(stage, directory); await syncDirectory(dirname(directory));
  } catch (error) { await fs.rm(stage, { recursive: true, force: true }); throw error; }
  return { directory, operationId: verified.plan.operationId, workspaceId: verified.plan.workspaceId,
    packageSha256: verified.packageSha256, applicationFiles: verified.files.size,
    continueCommand: [process.execPath, join(directory, "application", "dataplex-cli.mjs"), "status", "--directory", directory] };
}
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
export function googleReport({ plan, journal, totals }) {
  const rows = plan.events.map(item => {
    const sent = journal.events[item.eventId];
    return "<tr><td>" + escapeHtml(item.job ? String(item.job.namespace ?? "Unnamed namespace") + " / " + String(item.job.name ?? "Unnamed job") : "Original " + item.kind + " event") + "<br><small>" + escapeHtml(item.runId) + "</small></td><td>" + escapeHtml(item.eventType) + "<br>" + escapeHtml(item.eventTime) + "</td><td>" + item.assets.map(a => escapeHtml(a.direction + ": " + a.fullyQualifiedName)).join("<br>") + "</td><td>" + escapeHtml(item.diagnostics.length ? item.diagnostics.join("; ") : "Ready for review") + "</td><td>" + escapeHtml(sent?.state ?? "Prepared") + "<br>" + escapeHtml(sent?.receiving?.state ?? "") + "</td></tr>";
  }).join("\n");
  return "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + escapeHtml(plan.title) + "</title><style>body{font:15px system-ui,sans-serif;color:#202020;background:#fafafa;margin:32px;max-width:1400px}h1{font-size:25px}p{line-height:1.5}table{width:100%;border-collapse:collapse;background:white}th,td{padding:12px;text-align:left;vertical-align:top;border:1px solid #bbb;overflow-wrap:anywhere}th{background:#eee}small{color:#555}code{overflow-wrap:anywhere}@media(max-width:700px){body{margin:12px}table{font-size:12px}th,td{padding:6px}}</style><h1>" + escapeHtml(plan.title) + "</h1><p>Google destination: <code>" + escapeHtml(plan.parent) + "</code><br>Quota project: <code>" + escapeHtml(plan.quotaProject) + "</code><br>Source edition: <code>" + escapeHtml(plan.editionId) + "</code><br>Plan: <code>" + escapeHtml(plan.planSha256) + "</code></p><p>" + escapeHtml(totals.selected) + " original events; " + escapeHtml(totals.approved) + " approved; " + escapeHtml(totals.confirmed) + " API confirmations; " + escapeHtml(totals.received) + " complete table-link receipts.</p><table><thead><tr><th>Original job / run</th><th>Event</th><th>Expected catalog assets</th><th>Source review</th><th>Delivery</th></tr></thead><tbody>" + rows + "</tbody></table><p>The complete source workspace, original facets, approved event identities and remote responses travel together in the exported Google delivery package.</p></html>\n";
}
