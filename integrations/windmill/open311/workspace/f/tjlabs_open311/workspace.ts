import { createHash } from "node:crypto";

type Target = "source" | "receiver";
type Json = Record<string, any>;
const ORIGINS: Record<Target, string> = { source: "http://127.0.0.1:7311", receiver: "http://127.0.0.1:7312" };
const ROUTES: Record<string, string> = { capture: "/api/capture", review: "/api/reviews", receive: "/api/receive" };
const PLAN = "tjlabs.windmill.open311.prepared.v1";
const REVIEW = "tjlabs.windmill.open311.review.v1";
const stamp = () => new Date().toISOString();
function check(ok: any, message: string): asserts ok { if (!ok) throw new Error(message); }
function canonical(v: any): string {
  if (v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  throw new Error("Use finite JSON values.");
}
const sha = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
const same = (a: any, b: any) => canonical(a) === canonical(b);
function targetName(v: any): Target {
  check(v === "source" || v === "receiver", "Choose the source or receiving workspace.");
  return v;
}
function operationId(runKey: string, workspaceId: string, kind: string, body: Json): string {
  check(typeof runKey === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,199}$/.test(runKey), "Supply a stable runKey of at most 200 characters.");
  return "wm-" + kind + "-" + sha(canonical({ runKey, workspaceId, body })).slice(0, 48);
}
function query(values: Json): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  return params.toString();
}
async function http(target: Target, path: string, options: RequestInit = {}, raw = false): Promise<any> {
  const response = await fetch(ORIGINS[target] + path, { ...options, signal: AbortSignal.timeout(115000) });
  if (!response.ok) {
    const body = await response.text();
    let detail: any;
    try { detail = JSON.parse(body).error; } catch {}
    const error: any = new Error(detail?.message || "Open311 HTTP " + response.status);
    error.code = detail?.code || "HTTP_ERROR"; error.status = response.status; error.details = detail?.details;
    throw error;
  }
  return raw ? response : await response.json();
}
const state = (target: Target) => http(target, "/api/state");
async function operation(target: Target, requestId: string): Promise<Json | null> {
  try { return await http(target, "/api/operation?" + query({ requestId })); }
  catch (error: any) { if (error.status === 404 && error.code === "OPERATION_NOT_FOUND") return null; throw error; }
}
function expectedHash(kind: string, input: Json): string {
  const value = kind === "receive" ? { ...input, bundle: {
    schema: input.bundle.schema,
    payloadSha256: input.bundle.manifest.payloadSha256,
    payloadBytes: input.bundle.manifest.payloadBytes
  } } : input;
  return sha(canonical({ kind, input: value }));
}
async function prepared(target: Target, kind: string, body: Json, runKey: string, observed?: Json): Promise<Json> {
  check(ROUTES[kind], "Unknown workspace mutation.");
  const current = observed || await state(target);
  const identity = kind === "receive" ? body.bundle.payload.workspace.workspaceId : current.workspaceId;
  const requestId = operationId(runKey, identity, kind, body);
  const prior = await operation(target, requestId);
  if (prior) {
    check(prior.kind === kind, "The saved operation has another kind.");
    if (prior.state === "SUCCEEDED") return { schema: PLAN, target, kind, workspaceId: current.workspaceId, requestId, replay: true, preparedAt: stamp() };
    throw new Error("Continue the retained Windmill apply step for " + requestId + " with its saved input. Current source state: " + prior.state + ".");
  }
  const input = { requestId, expectedRevision: current.revision, ...body };
  return { schema: PLAN, target, kind, workspaceId: current.workspaceId, requestId, input, payloadHash: expectedHash(kind, input), preparedAt: stamp() };
}
async function apply(plan: Json): Promise<Json> {
  check(plan?.schema === PLAN && ROUTES[plan.kind], "Use a prepared workspace action.");
  const target = targetName(plan.target), prior = await operation(target, plan.requestId);
  if (plan.replay) {
    check(prior?.state === "SUCCEEDED" && prior.kind === plan.kind, "The saved operation is unavailable.");
    return prior.result;
  }
  check(plan.input?.requestId === plan.requestId && expectedHash(plan.kind, plan.input) === plan.payloadHash, "The prepared input changed.");
  if (prior) {
    check(prior.payloadHash === plan.payloadHash && prior.kind === plan.kind, "The request ID belongs to another payload.");
    if (prior.state === "SUCCEEDED") return prior.result;
  }
  const current = await state(target);
  check(current.workspaceId === plan.workspaceId, "The selected workspace identity changed. Reopen its saved operation before continuing.");
  try {
    return await http(target, ROUTES[plan.kind], {
      method: "POST", headers: { "content-type": "application/json", "x-open311-workspace": current.workspaceId },
      body: JSON.stringify(plan.input)
    });
  } catch (error: any) {
    const retained = await operation(target, plan.requestId).catch(() => null);
    if (retained?.state === "SUCCEEDED" && retained.payloadHash === plan.payloadHash) return retained.result;
    error.message += " Saved input is in this Windmill job; requestId=" + plan.requestId + "; retained state=" + (retained?.state || "not found") + ".";
    throw error;
  }
}
async function prepareCapture(target: Target, args: Json): Promise<Json> {
  check(target === "source", "Capture source data in the source workspace.");
  check(["services", "requests"].includes(args.kind), "Choose services or requests.");
  const current = await state(target);
  check(current.connections.some((c: Json) => c.id === args.connectionId), "Select an existing connection.");
  check(args.query && typeof args.query === "object" && !Array.isArray(args.query), "Supply the exact source query.");
  if (args.kind === "requests") {
    const start = Date.parse(args.query.start_date), end = Date.parse(args.query.end_date);
    check(Number.isFinite(start) && Number.isFinite(end) && start < end, "Supply a fixed start_date and end_date.");
  }
  return prepared(target, "capture", { connectionId: args.connectionId, kind: args.kind, query: args.query }, args.runKey, current);
}
function cleanReview(value: Json): Json {
  const review = { status: value.status, assignee: value.assignee ?? "", dueDate: value.dueDate ?? "", note: value.note ?? "" };
  check(["new", "assigned", "in_progress", "done"].includes(review.status), "Select an internal review status.");
  check(typeof review.assignee === "string" && review.assignee.length <= 200, "Assignee exceeds 200 characters.");
  check(typeof review.note === "string" && review.note.length <= 8000, "Review note exceeds 8000 characters.");
  check(typeof review.dueDate === "string" && (!review.dueDate || (/^\d{4}-\d{2}-\d{2}$/.test(review.dueDate) && Number.isFinite(Date.parse(review.dueDate + "T00:00:00Z")) && new Date(review.dueDate + "T00:00:00Z").toISOString().slice(0,10) === review.dueDate)), "Use a valid YYYY-MM-DD due date.");
  return review;
}
async function prepareReview(target: Target, args: Json): Promise<Json> {
  check(target === "source", "Review source requests in the source workspace.");
  const current = await state(target), capture = await http(target, "/api/capture?" + query({ id: args.captureId }));
  check(["requests", "request"].includes(capture.capture.kind), "Select a request capture.");
  const review = cleanReview(args.review || {});
  check(Array.isArray(args.selection) && args.selection.length > 0, "Select at least one saved request.");
  const ids = new Set<string>();
  const rows: Json[] = [];
  for (const selected of args.selection) {
    check(typeof selected.serviceRequestId === "string" && !ids.has(selected.serviceRequestId), "Select each request once.");
    ids.add(selected.serviceRequestId);
    const saved = capture.items.find((r: Json) => r.serviceRequestId === selected.serviceRequestId);
    check(saved && selected.sourceSha256 === saved.sourceSha256, "A selected row differs from the displayed source.");
    const latest = await http(target, "/api/request?" + query({ connection: capture.capture.connectionId, id: selected.serviceRequestId }));
    const body = { connectionId: capture.capture.connectionId, serviceRequestId: saved.serviceRequestId, review };
    const requestId = operationId(args.runKey, current.workspaceId, "review", body);
    const prior = await operation(target, requestId);
    check(latest.item.sourceSha256 === saved.sourceSha256, "New source arrived for request " + saved.serviceRequestId + ". Reload its latest capture.");
    if (!prior) check((latest.review?.requestId || null) === (selected.priorReviewId || null), "Another operator updated request " + saved.serviceRequestId + ". Reload its review.");
    rows.push({ serviceRequestId: saved.serviceRequestId, sourceSha256: saved.sourceSha256, priorReviewId: latest.review?.requestId || null,
      requestId, body, description: saved.description, serviceName: saved.serviceName, sourceStatus: saved.status });
  }
  const plan = { schema: REVIEW, target, workspaceId: current.workspaceId, captureId: args.captureId,
    connectionId: capture.capture.connectionId, sourceSha256: capture.raw.sha256, runKey: args.runKey, review, rows, preparedAt: stamp() };
  return { ...plan, planSha256: sha(canonical(plan)) };
}
async function applyReviews(plan: Json, approval: Json): Promise<Json> {
  check(plan?.schema === REVIEW, "Use the saved review plan.");
  const { planSha256, ...content } = plan;
  check(planSha256 === sha(canonical(content)), "The approved plan changed.");
  check(approval?.approved === true, "Approve the prepared review in Windmill before applying it.");
  const target = targetName(plan.target), initial = await state(target);
  check(initial.workspaceId === plan.workspaceId, "The review plan belongs to another workspace.");
  const results: Json[] = [];
  // Each original request has its own retained operation, allowing a partially completed batch to resume.
  for (const row of plan.rows) {
    const prior = await operation(target, row.requestId);
    if (prior) {
      check(prior.kind === "review" && prior.state === "SUCCEEDED", "Inspect the retained review operation " + row.requestId + ".");
      check(prior.result.review.sourceSha256 === row.sourceSha256, "The retained review belongs to another source edition.");
      results.push(prior.result); continue;
    }
    const before = await state(target);
    check(before.workspaceId === plan.workspaceId, "The workspace identity changed while applying reviews.");
    const latest = await http(target, "/api/request?" + query({ connection: plan.connectionId, id: row.serviceRequestId }));
    check(latest.item.sourceSha256 === row.sourceSha256, "New source arrived for request " + row.serviceRequestId + ". Review its current source.");
    check((latest.review?.requestId || null) === row.priorReviewId, "Another operator updated request " + row.serviceRequestId + ". Reload its review.");
    const input = { requestId: row.requestId, expectedRevision: before.revision, ...row.body };
    results.push(await apply({ schema: PLAN, target, kind: "review", workspaceId: before.workspaceId, requestId: row.requestId,
      input, payloadHash: expectedHash("review", input), preparedAt: stamp() }));
  }
  return { workspaceId: plan.workspaceId, captureId: plan.captureId, planSha256, approval, results, completedAt: stamp() };
}
async function exported(target: Target, args: Json): Promise<Json> {
  check(["workspace", "source", "json", "csv", "report"].includes(args.kind), "Select an export format.");
  const response = await http(target, "/api/export?" + query({ kind: args.kind, capture: args.captureId }), {}, true);
  const body = new Uint8Array(await response.arrayBuffer());
  const filename = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") || "")?.[1] || "open311-export";
  return { filename, contentType: response.headers.get("content-type"), bytes: body.byteLength, sha256: sha(body),
    encoding: "base64", body: Buffer.from(body).toString("base64") };
}
async function exportPack(target: Target, captureId: string): Promise<Json> {
  const before = await state(target), files: Json[] = [];
  const capture = await http(target, "/api/capture?" + query({ id: captureId }));
  const service = before.captures.find((c: Json) => c.connectionId === capture.capture.connectionId && c.kind === "services");
  for (const id of [captureId, ...(service ? [service.id] : [])]) {
    for (const kind of ["source", "json", "csv", "report"]) files.push(await exported(target, { kind, captureId: id }));
  }
  files.push(await exported(target, { kind: "workspace" }));
  const after = await state(target);
  check(before.workspaceId === after.workspaceId && before.revision === after.revision, "The workspace changed during export. Rebuild the delivery pack at the current revision.");
  return { schema: "tjlabs.windmill.open311.delivery.v1", workspaceId: after.workspaceId, revision: after.revision,
    captureId, createdAt: stamp(), source: { connection: capture.capture.connection, receipt: capture.receipt, sha256: capture.raw.sha256 }, files };
}
async function prepareReceive(args: Json): Promise<Json> {
  let bundle: any;
  if (args.source === true) {
    const file = await exported("source", { kind: "workspace" });
    bundle = JSON.parse(Buffer.from(file.body, "base64").toString("utf8"));
  } else bundle = args.bundle;
  check(bundle?.schema === "commons.open311.workspace-export.v1" && bundle.payload && bundle.manifest, "Select the complete original workspace export.");
  const payload = Buffer.from(canonical(bundle.payload));
  check(sha(payload) === bundle.manifest.payloadSha256 && payload.length === bundle.manifest.payloadBytes, "The workspace export differs from its manifest.");
  return prepared("receiver", "receive", { bundle }, args.runKey);
}
async function overview(target: Target): Promise<Json> {
  const value = await state(target);
  const latest = value.captures.find((c: Json) => c.kind === "requests");
  const requests = latest ? await http(target, "/api/requests?" + query({ capture: latest.id, limit: 100, sort: "updated" })) : { items: [], total: 0, offset: 0, limit: 100 };
  return { ...value, target, latestRequestCapture: latest || null, requests, observedAt: stamp() };
}
export async function main(action: string = "overview", target: Target = "source", args: Json = {}): Promise<any> {
  targetName(target);
  check(args && typeof args === "object" && !Array.isArray(args), "Supply an args object.");
  if (action === "overview") return overview(target);
  if (action === "services") return http(target, "/api/services?" + query({ connection: args.connectionId }));
  if (action === "requests") return http(target, "/api/requests?" + query({ capture: args.captureId, q: args.q, status: args.status, sort: args.sort, order: args.order, offset: args.offset ?? 0, limit: args.limit ?? 100 }));
  if (action === "request") return http(target, "/api/request?" + query({ capture: args.captureId, connection: args.connectionId, id: args.serviceRequestId }));
  if (action === "capture") return http(target, "/api/capture?" + query({ id: args.captureId }));
  if (action === "diff") return http(target, "/api/diff?" + query({ before: args.before, after: args.after }));
  if (action === "operation") return http(target, "/api/operation?" + query({ requestId: args.requestId }));
  if (action === "export") return exported(target, args);
  if (action === "prepare_capture") return prepareCapture(target, args);
  if (action === "apply_plan") return apply(args.plan);
  if (action === "prepare_review") return prepareReview(target, args);
  if (action === "apply_reviews") return applyReviews(args.plan, args.approval);
  if (action === "export_pack") return exportPack(target, args.captureId);
  if (action === "prepare_receive") return prepareReceive(args);
  throw new Error("Unknown Open311 action: " + action);
}
