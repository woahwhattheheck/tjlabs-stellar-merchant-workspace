import { validateProjectionState } from "./projection-model.mjs";
import { stringifyJson } from "./json-codec.mjs";
import { clone, digest, sha256, base64, json, fields, hash, id, text, integer, need, plain, own, now, page } from "./util.mjs";

export const CONSUMER_FORMAT = "commons.haystack.consumer-acceptance.v1";
export const CONSUMER_RETURN_FORMAT = "commons.haystack.consumer-return.v1";
export const CONSUMER_FILE_MAX = 32 * 1024 * 1024;
export const CONSUMER_RETURN_MAX = 96 * 1024 * 1024;
const MAX_EVIDENCE_FILES = 500, MAX_FILES = 10500, WORKSPACE_MAX_BYTES = 128 * 1024 * 1024;
const MAX_PROJECTS = 200, MAX_HISTORY = 10000, MAX_QUESTIONS = 100, MAX_ROWS = 25000;
const missing = (message) => need(false, message, "HAYSTACK_CONSUMER_MISSING", 404);
const list = (value, label, maximum = MAX_HISTORY) => { need(Array.isArray(value) && value.length <= maximum, "Retain the complete " + label + " within " + maximum + " entries."); return value; };
const unique = (rows, key, label) => need(new Set(rows.map(key)).size === rows.length, "Retain each " + label + " once.");
const same = (a, b) => digest(a) === digest(b);
const signed = body => ({ ...body, id: digest(body) });
const signedBody = row => { const out = clone(row); delete out.id; return out; };
function checkSigned(row) { need(plain(row) && hash(row.id) === digest(signedBody(row)), "An immutable consumer record differs.", "HAYSTACK_CONSUMER_HISTORY", 409); }
function stamp(args) { return { author: text(args.author, "named operator", 240, true), note: text(args.note || "", "complete operator note", 16000), createdAt: now() }; }
function find(rows, key, label) { const value = rows.find(row => row.id === key); return value || missing("Choose a retained " + label + "."); }
function empty() { return { format: CONSUMER_FORMAT, files: [], blobs: [], projects: [], versions: [], planReviews: [], runs: [], runVersions: [], reviews: [], returns: [], projectionEvidence: [] }; }
function stateOf(state, create = false) { if (!state.consumerAcceptance && create) state.consumerAcceptance = empty(); return state.consumerAcceptance || empty(); }
function date(value, label) { text(value, label, 64, true); need(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)), "Record " + label + " with its complete time and timezone."); return value; }
function jsonValue(value, depth = 0, budget = { count: 0 }) {
  need(depth <= 24 && ++budget.count <= 200000, "Keep the complete selected JSON values within the documented size.");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") { text(value, "original JSON text", 65536); return; }
  if (typeof value === "number") { need(Number.isFinite(value), "Use finite JSON numbers; retain other source tokens as explicit strings."); return; }
  if (Array.isArray(value)) { for (const v of value) jsonValue(v, depth + 1, budget); return; }
  need(plain(value), "Retain complete JSON values without executable or missing fields.");
  for (const [key, v] of Object.entries(value)) { text(key, "original JSON key", 1000, true); jsonValue(v, depth + 1, budget); }
}
function fileIds(s, value, label, required = false) {
  list(value, label, MAX_FILES); unique(value, x => x, label);
  if (required) need(value.length > 0, "Select the complete " + label + ".");
  for (const valueId of value) find(s.files, hash(valueId), "original evidence file");
  return clone(value);
}
function optionalFile(s, value, label) { if (value !== null) find(s.files, hash(value, label), "original " + label); return value; }
function fileMeta(name, mediaType, bytes) {
  const meta = { name: text(name, "original filename", 240, true), mediaType: text(mediaType, "original media type", 240, true), bytes: bytes.length, sha256: sha256(bytes) };
  need(!/[\r\n]/.test(meta.mediaType), "Use a single original media type.");
  return { ...meta, id: digest(meta) };
}
function retainFile(s, args, bytes = base64(args.base64, CONSUMER_FILE_MAX), originalReturn = false) {
  const metadata = fileMeta(args.name, args.mediaType, bytes), prior = s.files.find(f => f.id === metadata.id);
  if (prior) return { file: clone(prior), alreadyRetained: true };
  const receivedIds = new Set(s.returns.map(r => r.originalFileId));
  need(s.files.length < MAX_FILES && (originalReturn || s.files.filter(f => !receivedIds.has(f.id)).length < MAX_EVIDENCE_FILES),
    "Retain at most 500 selected evidence files plus the complete original received-return history.", "HAYSTACK_SIZE", 413);
  const blob = s.blobs.find(b => b.sha256 === metadata.sha256);
  if (blob) need(blob.bytes === bytes.length && blob.base64 === bytes.toString("base64"), "The original evidence digest collides with different bytes.", "HAYSTACK_CONSUMER_FILE", 409);
  else {
    s.blobs.push({ sha256: metadata.sha256, bytes: bytes.length, base64: bytes.toString("base64") });
  }
  s.files.push(metadata); return { file: clone(metadata), alreadyRetained: false };
}
export function consumerFile(state, fileId) {
  const s = stateOf(state), file = find(s.files, hash(fileId), "consumer evidence file"), blob = findBlob(s, file.sha256);
  return { metadata: clone(file), bytes: base64(blob.base64, CONSUMER_RETURN_MAX) };
}
function findBlob(s, sha) { const blob = s.blobs.find(b => b.sha256 === sha); return blob || missing("The complete original evidence bytes are absent."); }
function validateFiles(s) {
  list(s.files, "original evidence files", MAX_FILES); list(s.blobs, "original evidence bodies", MAX_FILES);
  unique(s.files, x => x.id, "file identity"); unique(s.blobs, x => x.sha256, "original byte body");
  for (const blob of s.blobs) {
    fields(blob, ["sha256", "bytes", "base64"], ["sha256", "bytes", "base64"]);
    const bytes = base64(blob.base64, CONSUMER_RETURN_MAX);
    need(hash(blob.sha256) === sha256(bytes) && integer(blob.bytes, "original bytes", 0, CONSUMER_RETURN_MAX) === bytes.length, "Original consumer file bytes changed.", "HAYSTACK_CONSUMER_FILE", 409);
  }
  for (const f of s.files) {
    fields(f, ["id", "name", "mediaType", "bytes", "sha256"], ["id", "name", "mediaType", "bytes", "sha256"]);
    const blob = findBlob(s, hash(f.sha256));
    need(same(f, fileMeta(f.name, f.mediaType, base64(blob.base64, CONSUMER_RETURN_MAX))), "Retain the original file name, type and bytes.", "HAYSTACK_CONSUMER_FILE", 409);
  }
}
function projectionEvidenceFor(state, s, returnId) {
  if (returnId === null) return null;
  const retained = s.projectionEvidence.find(e => e.return.id === returnId);
  const r = (state.projections?.returns || []).find(r => r.id === returnId);
  if (!r) return retained ? clone(retained) : null;
  const afterVersion = (state.projections?.versions || []).find(v => v.id === r.afterVersionId);
  need(afterVersion, "Retain the complete resulting projection version with this returned-grid decision.");
  return { return: clone(r), afterVersion: clone(afterVersion) };
}
function verifyProjectionEvidence(state, evidence) {
  fields(evidence, ["return", "afterVersion"], ["return", "afterVersion"]);
  const r = evidence.return, after = evidence.afterVersion, shadow = clone(state);
  need(shadow.projections && r.afterVersionId === after.id && after.projectionId === r.projectionId,
    "Retain the full original grid-return decision and its exact resulting version.", "HAYSTACK_CONSUMER_PROJECTION_EVIDENCE", 409);
  for (const [key, row] of [["returns", r], ["versions", after]]) {
    const old = shadow.projections[key].find(x => x.id === row.id);
    if (old) need(same(old, row), "Returned projection provenance conflicts with an original retained record.", "HAYSTACK_CONSUMER_PROJECTION_EVIDENCE", 409);
    else shadow.projections[key].push(clone(row));
  }
  // The original validator rematerializes the exact selected model/context,
  // returned bytes, binding and KEEP/adopt decision. Only this temporary view changes.
  validateProjectionState(shadow);
  return evidence;
}
function projectionBinding(state, content) {
  const p = (state.projections?.projects || []).find(p => p.id === id(content.projectionId, "projection identity"));
  need(p, "Choose an existing complete projection.", "HAYSTACK_CONSUMER_PROJECTION", 409);
  const v = (state.projections?.versions || []).find(v => v.id === hash(content.projectionVersionId));
  need(v?.projectionId === p.id, "Select the original projection version in that project.", "HAYSTACK_CONSUMER_PROJECTION", 409);
  return { workspaceId: state.workspaceId, projectionId: p.id, projectionVersionId: v.id, gridSha256: v.result.gridSha256,
    projectionContentSha256: v.result.contentSha256, modelId: v.result.modelId, modelVersionId: v.result.modelVersionId,
    modelContentSha256: v.result.modelContentSha256, contextId: v.result.contextId };
}
function target(value) {
  const keys = ["family", "product", "version", "build", "environment", "operator"];
  fields(value, keys, keys);
  for (const k of keys) text(value[k], "selected consumer " + k, k === "environment" ? 2000 : 400, true);
  return clone(value);
}
function records(value, label, distinctIds) {
  list(value, label, MAX_ROWS);
  for (const row of value) {
    fields(row, ["id", "values"], ["id", "values"]); text(row.id, "unchanged consumer row identity", 2000, true);
    need(plain(row.values), "Supply each row's explicit JSON field expectations or observations."); jsonValue(row.values);
  }
  if (distinctIds) unique(value, x => x.id, "independently expected row ID");
  return clone(value);
}
function planContent(state, s, value) {
  fields(value, ["title", "projectionId", "projectionVersionId", "target", "interface", "acceptanceOwner", "questions", "boundaryNote"],
    ["title", "projectionId", "projectionVersionId", "target", "interface", "acceptanceOwner", "questions", "boundaryNote"]);
  text(value.title, "consumer project title", 240, true); target(value.target);
  text(value.acceptanceOwner, "named acceptance owner", 240, true); text(value.boundaryNote, "selected operational boundary", 16000, true);
  fields(value.interface, ["format", "description", "inputFileIds", "mappingFileIds"], ["format", "description", "inputFileIds", "mappingFileIds"]);
  text(value.interface.format, "actual selected consumer interface", 240, true); text(value.interface.description, "complete interface description", 16000, true);
  fileIds(s, value.interface.inputFileIds, "selected original input files"); fileIds(s, value.interface.mappingFileIds, "interface mapping files");
  list(value.questions, "complete agreed questions", MAX_QUESTIONS); unique(value.questions, q => q.id, "question identity");
  for (const q of value.questions) {
    fields(q, ["id", "label", "query", "expected", "expectedEvidenceFileIds", "note"], ["id", "label", "query", "expected", "expectedEvidenceFileIds", "note"]);
    text(q.id, "original question identity", 120, true); text(q.label, "complete question", 4000, true); text(q.query, "exact query or command", 32000, true);
    records(q.expected, "full independently expected population", true);
    fileIds(s, q.expectedEvidenceFileIds, "independent expected-population evidence");
    text(q.note, "expectation selection and scope note", 16000, true);
  }
  return { content: clone(value), binding: projectionBinding(state, value) };
}
export function previewConsumerPlan(state, args) {
  const s = stateOf(state), out = planContent(state, s, args.content), findings = [];
  if (!out.content.interface.inputFileIds.length) findings.push({ code: "INPUT_FILES_MISSING", message: "Select the complete intended target input files before ready review." });
  if (!out.content.questions.length) findings.push({ code: "QUESTIONS_MISSING", message: "Select at least one independently specified acceptance question." });
  for (const q of out.content.questions) if (!q.expectedEvidenceFileIds.length)
    findings.push({ code: "EXPECTED_EVIDENCE_MISSING", questionId: q.id, message: "Retain independent evidence for this expected population, including an explicitly expected empty population." });
  const projected = state.projections.projects.find(p => p.id === out.binding.projectionId);
  return { ...out, assessment: { canReviewReady: findings.length === 0, findings, questions: out.content.questions.length,
    expectedRows: out.content.questions.reduce((n, q) => n + q.expected.length, 0), currentProjectionHead: projected.headId,
    selectedProjectionIsCurrent: projected.headId === out.binding.projectionVersionId } };
}
function projectOf(s, projectId) { return find(s.projects, id(projectId, "consumer project identity"), "consumer project"); }
function planOf(s, project, versionId) {
  const v = find(s.versions, hash(versionId || project.headId), "complete consumer plan");
  need(v.projectId === project.id, "Choose a plan in the original consumer project."); return v;
}
function currentProject(s, args) { const p = projectOf(s, args.projectId); need(p.headId === hash(args.expectedHeadId), "The consumer plan changed; reopen its original current head before dispatch.", "HAYSTACK_CONSUMER_HEAD", 409); return p; }
function versionMeta(v) { const { content, ...metadata } = v; return clone(metadata); }
function makePlan(state, s, p, args, parents) {
  const preview = previewConsumerPlan(state, args);
  const v = signed({ format: "commons.haystack.consumer-plan.v1", projectId: p.id, parents, content: preview.content, binding: preview.binding, ...stamp(args) });
  need(s.versions.length < MAX_HISTORY, "Retain the complete consumer history within its documented limit.", "HAYSTACK_SIZE", 413);
  s.versions.push(v); p.headId = v.id;
  return { project: clone(p), version: versionMeta(v), assessment: preview.assessment };
}
function runOf(s, runId) { return find(s.runs, id(runId, "original receiving run identity"), "original consumer run"); }
function runVersion(s, run, versionId) {
  const v = find(s.runVersions, hash(versionId || run.headId), "consumer run edition");
  need(v.runId === run.id, "Select an edition in the same original consumer run."); return v;
}
function runSeed(run) { const seed = clone(run); delete seed.headId; delete seed.originalSha256; return seed; }
function originalRunCheck(run) { need(hash(run.originalSha256) === digest(runSeed(run)), "The original opened consumer run changed.", "HAYSTACK_CONSUMER_RUN", 409); }
function runHead(s, args) { const run = runOf(s, args.runId); need(run.headId === hash(args.expectedRunHeadId), "The original receiving head changed; recover its complete result before dispatch.", "HAYSTACK_CONSUMER_RUN_HEAD", 409); return { run, version: runVersion(s, run) }; }
function planFileIds(content) { return [...new Set([...content.interface.inputFileIds, ...content.interface.mappingFileIds, ...content.questions.flatMap(q => q.expectedEvidenceFileIds)])]; }
function receivingFileIds(content) { return [...new Set([...content.inputFileIds, ...content.outputFileIds, ...content.questions.flatMap(q => q.outputFileIds), content.commandFileId, content.stdoutFileId, content.stderrFileId].filter(Boolean))]; }
function observations(state, s, run, content, { allowMissingProjection = false } = {}) {
  const p = projectOf(s, run.projectId), plan = planOf(s, p, run.planVersionId), review = find(s.planReviews, run.planReviewId, "frozen expected-population review");
  fields(content, ["externalOperationId", "operator", "startedAt", "endedAt", "target", "outcome", "inputFileIds", "outputFileIds", "commandFileId", "stdoutFileId", "stderrFileId", "questions", "projectionReturnId", "note"],
    ["externalOperationId", "operator", "startedAt", "endedAt", "target", "outcome", "inputFileIds", "outputFileIds", "commandFileId", "stdoutFileId", "stderrFileId", "questions", "projectionReturnId", "note"]);
  text(content.externalOperationId, "original external operation or run identity", 1000, true); text(content.operator, "actual receiving operator", 240, true);
  date(content.startedAt, "original start"); date(content.endedAt, "original end"); need(Date.parse(content.endedAt) >= Date.parse(content.startedAt), "The observed end precedes the original start.");
  target(content.target); need(["completed", "failed", "interrupted"].includes(content.outcome), "Retain the observed process outcome.");
  fileIds(s, content.inputFileIds, "observed complete input files"); fileIds(s, content.outputFileIds, "observed complete output files");
  for (const key of ["commandFileId", "stdoutFileId", "stderrFileId"]) optionalFile(s, content[key], key);
  text(content.note, "complete observed outcome and limitations", 32000, true);
  const questions = list(content.questions, "all observed questions", MAX_QUESTIONS); unique(questions, q => q.questionId, "observed question");
  need(questions.length === plan.content.questions.length, "Retain an explicit observed, failed or not-run outcome for every agreed question.");
  const expectedById = new Map(plan.content.questions.map(q => [q.id, q])), result = [];
  for (const q of questions) {
    fields(q, ["questionId", "status", "observed", "outputFileIds", "note"], ["questionId", "status", "observed", "outputFileIds", "note"]);
    const expected = expectedById.get(q.questionId); need(expected, "Use an original agreed question identity.");
    need(["observed", "not-run", "failed"].includes(q.status), "Record the question's actual observation state.");
    records(q.observed, "full observed population", false); fileIds(s, q.outputFileIds, "complete question output files"); text(q.note, "complete question observation", 16000);
    need(q.status !== "not-run" || q.observed.length === 0, "A not-run question cannot claim observed rows.");
    const byId = new Map(), duplicateIds = [];
    for (const row of q.observed) { if (byId.has(row.id)) duplicateIds.push(row.id); else byId.set(row.id, row); }
    const expectedIds = new Set(expected.expected.map(r => r.id));
    const missingIds = expected.expected.filter(r => !byId.has(r.id)).map(r => r.id);
    const unexpectedIds = q.observed.filter(r => !expectedIds.has(r.id)).map(r => r.id);
    const valueDifferences = [];
    for (const row of expected.expected) {
      const actual = byId.get(row.id); if (!actual) continue;
      for (const key of Object.keys(row.values)) if (!own(actual.values, key) || !same(row.values[key], actual.values[key]))
        valueDifferences.push({ id: row.id, key, expected: clone(row.values[key]), actualPresent: own(actual.values, key), ...(own(actual.values, key) ? { actual: clone(actual.values[key]) } : {}) });
    }
    const matched = q.status === "observed" && q.outputFileIds.length > 0 && missingIds.length === 0 && unexpectedIds.length === 0 && duplicateIds.length === 0 && valueDifferences.length === 0;
    result.push({ questionId: q.questionId, status: q.status, expectedCount: expected.expected.length, observedCount: q.observed.length,
      expectedIds: expected.expected.map(r => r.id), observedIds: q.observed.map(r => r.id), missingIds, unexpectedIds, duplicateIds, valueDifferences, matched,
      outputFileIds: clone(q.outputFileIds), note: q.note });
  }
  const findings = [];
  if (!same(content.target, plan.content.target)) findings.push({ code: "TARGET_DIFFERS", message: "The observed consumer/version/build/environment/operator differs from the selected target." });
  if (!same([...content.inputFileIds].sort(), [...plan.content.interface.inputFileIds].sort())) findings.push({ code: "INPUT_FILES_DIFFER", message: "Observed input files differ from the exact reviewed selection." });
  if (Date.parse(content.startedAt) < Date.parse(review.createdAt)) findings.push({ code: "EXPECTATION_REVIEW_AFTER_RUN", message: "This actual run began before the expected population was frozen in the retained plan review." });
  if (content.outcome !== "completed") findings.push({ code: "PROCESS_INCOMPLETE", message: "Failed and interrupted outcomes do not establish complete receiving." });
  if (!content.outputFileIds.length) findings.push({ code: "OUTPUTS_MISSING", message: "No complete original run output file was retained." });
  if (!content.commandFileId) findings.push({ code: "COMMAND_MISSING", message: "Retain the original executed query or command file." });
  if (content.projectionReturnId !== null) {
    const returned = projectionEvidenceFor(state, s, hash(content.projectionReturnId))?.return;
    need((allowMissingProjection && !returned) || (returned?.projectionId === plan.binding.projectionId && [returned.beforeVersionId, returned.afterVersionId].includes(plan.binding.projectionVersionId)),
      "Receive original projection-return decision " + content.projectionReturnId + " through the existing projection workflow before this consumer return; it must belong to the selected projection edition.", "HAYSTACK_CONSUMER_RETURN_DEPENDENCY", 409);
  }
  const allQuestionsMatched = result.every(q => q.matched);
  return { projectId: p.id, planVersionId: plan.id, planReviewId: review.id, runId: run.id, binding: clone(plan.binding), mode: run.mode,
    processOutcome: content.outcome, findings, questions: result, allQuestionsMatched, technicalMatch: findings.length === 0 && allQuestionsMatched,
    eligibleForAcceptance: run.mode === "actual" && findings.length === 0 && allQuestionsMatched, failedQuestionIds: result.filter(q => !q.matched).map(q => q.questionId) };
}
export function previewConsumerRun(state, args) {
  const s = stateOf(state), { run, version } = runHead(s, args);
  need(version.status === "awaiting-evidence", "The original result is immutable; open a corrected run linked to it.", "HAYSTACK_CONSUMER_RUN_COMPLETE", 409);
  return { run: clone(run), content: clone(args.content), result: observations(state, s, run, args.content) };
}
function runSummary(s, run) {
  const v = runVersion(s, run), reviews = s.reviews.filter(r => r.runId === run.id && r.runVersionId === v.id);
  return { ...clone(run), status: v.status, result: v.result ? { processOutcome: v.result.processOutcome, technicalMatch: v.result.technicalMatch,
    eligibleForAcceptance: v.result.eligibleForAcceptance, failedQuestionIds: clone(v.result.failedQuestionIds), findings: clone(v.result.findings) } : null,
    latestReview: clone(reviews.at(-1) || null) };
}
function acceptance(s, project) {
  const run = s.runs.filter(r => r.projectId === project.id && r.planVersionId === project.headId).at(-1);
  if (!run) return null;
  const current = s.reviews.filter(r => r.runId === run.id && r.runVersionId === run.headId).at(-1) || null;
  const ready = s.planReviews.filter(r => r.planVersionId === project.headId).at(-1);
  return current ? { ...clone(current), current: ready?.decision === "ready" && ready.id === run.planReviewId,
    ...(ready?.decision !== "ready" || ready.id !== run.planReviewId ? { status: "plan-review-reopened" } : {}) } :
    { decision: "pending", current: true, projectId: project.id, planVersionId: project.headId, runId: run.id, runVersionId: run.headId };
}
export function consumerProjectRead(state, args) {
  const s = stateOf(state), p = projectOf(s, args.projectId), v = planOf(s, p, args.versionId);
  return { project: clone(p), version: clone(v), history: s.versions.filter(x => x.projectId === p.id).map(versionMeta),
    planReviews: clone(s.planReviews.filter(x => x.projectId === p.id)), runs: s.runs.filter(x => x.projectId === p.id).map(r => runSummary(s, r)),
    reviews: clone(s.reviews.filter(x => x.projectId === p.id)), returns: clone(s.returns.filter(x => x.projectId === p.id)),
    files: clone(s.files), currentAcceptance: acceptance(s, p), assessment: previewConsumerPlan(state, { content: v.content }).assessment };
}
export function consumerRunRead(state, args) {
  const s = stateOf(state), run = runOf(s, args.runId), version = runVersion(s, run), p = projectOf(s, run.projectId);
  return { run: clone(run), version: clone(version), history: clone(s.runVersions.filter(v => v.runId === run.id)),
    planVersion: clone(planOf(s, p, run.planVersionId)), planReview: clone(find(s.planReviews, run.planReviewId, "plan review")),
    reviews: clone(s.reviews.filter(r => r.runId === run.id)), result: clone(version.result), files: clone(s.files) };
}
export function consumerRows(state) {
  const s = stateOf(state);
  return s.projects.map(p => { const v = planOf(s, p); return { ...clone(p), title: v.content.title, target: clone(v.content.target), binding: clone(v.binding),
    questionCount: v.content.questions.length, runCount: s.runs.filter(r => r.projectId === p.id).length, currentAcceptance: acceptance(s, p) }; });
}
export function consumerSummary(state) { const s = stateOf(state); return { projects: s.projects.length, plans: s.versions.length, runs: s.runs.length, files: s.files.length, reviews: s.reviews.length, returns: s.returns.length }; }
function validateReview(s, args, p, run, version, historical = false) {
  need(["accept", "accept-exceptions", "changes"].includes(args.decision), "Choose explicit acceptance, accepted exceptions or changes.");
  list(args.exceptions, "complete accepted exceptions", MAX_QUESTIONS); unique(args.exceptions, e => e.questionId, "accepted question exception");
  for (const e of args.exceptions) { fields(e, ["questionId", "reason"], ["questionId", "reason"]); text(e.reason, "complete accepted exception reason", 16000, true); }
  need(version.status === "received", "Receive the complete original evidence before business review.");
  if (args.decision === "changes") { need(args.exceptions.length === 0, "A request for changes does not accept exceptions."); return; }
  need(run.planVersionId === p.headId, "Acceptance belongs to the current exact plan; retain historical evidence and explicitly open its current reviewed successor.", "HAYSTACK_CONSUMER_PLAN_STALE", 409);
  need(historical || s.planReviews.filter(r => r.planVersionId === run.planVersionId).at(-1)?.id === run.planReviewId,
    "This run belongs to an earlier ready review. Open a new receiving run under the latest ready review before renewed acceptance.", "HAYSTACK_CONSUMER_PLAN_REVIEW", 409);
  need(run.mode === "actual" && version.result.findings.length === 0, "Only complete actual receiving with the exact frozen target/input/time binding can be accepted.", "HAYSTACK_CONSUMER_ACCEPTANCE", 409);
  const failed = version.result.failedQuestionIds;
  if (args.decision === "accept") need(failed.length === 0 && args.exceptions.length === 0, "Resolve every full-population or value difference before unqualified acceptance.");
  else need(failed.length > 0 && same([...failed].sort(), args.exceptions.map(e => e.questionId).sort()),
    "Explicitly accept each and only each unmatched question, retaining its complete difference and reason.");
}
export function applyConsumerAction(state, action, args) {
  const s = stateOf(state, true);
  if (action === "consumer.file.retain") { text(args.author, "receiving operator", 240, true); return retainFile(s, args); }
  if (action === "consumer.project.create") {
    need(s.projects.length < MAX_PROJECTS, "Retain at most 200 complete consumer projects.", "HAYSTACK_SIZE", 413);
    const p = { id: id(args.projectId || args.operationId), createdAt: now(), createdBy: text(args.author, "named project author", 240, true), headId: null };
    need(!s.projects.some(x => x.id === p.id), "The project identity already belongs to original work.", "HAYSTACK_CONSUMER_ID", 409);
    const result = makePlan(state, s, p, args, []); s.projects.push(p); return result;
  }
  if (action === "consumer.project.save") { const p = currentProject(s, args); return makePlan(state, s, p, args, [p.headId]); }
  if (action === "consumer.plan.review") {
    const p = currentProject(s, args), v = planOf(s, p); need(["ready", "changes"].includes(args.decision), "Choose ready or changes.");
    const preview = previewConsumerPlan(state, { content: v.content });
    if (args.decision === "ready") need(preview.assessment.canReviewReady, "Resolve the complete expected-population and selected-input findings before ready review.");
    text(args.note, "complete review and independent expectation basis", 16000, true);
    const review = signed({ format: "commons.haystack.consumer-plan-review.v1", projectId: p.id, planVersionId: v.id, binding: clone(v.binding), decision: args.decision, ...stamp(args) });
    s.planReviews.push(review); return { project: clone(p), review };
  }
  if (action === "consumer.run.open") {
    const p = currentProject(s, args), v = planOf(s, p), review = find(s.planReviews, hash(args.planReviewId), "original ready review");
    need(review.projectId === p.id && review.planVersionId === v.id && review.decision === "ready" &&
      s.planReviews.filter(r => r.planVersionId === v.id).at(-1)?.id === review.id, "Use the latest ready review of the exact current plan.");
    need(["actual", "engineering"].includes(args.mode), "Distinguish actual consumer receiving from an engineering example.");
    const prior = args.supersedesRunId === null ? null : runOf(s, args.supersedesRunId);
    need(!prior || prior.projectId === p.id, "A corrected run refers to the same original consumer project.");
    if (prior) need(runVersion(s, prior).status === "received", "Receive the earlier run's explicit completed, failed or interrupted outcome before superseding it.");
    const run = { id: id(args.runId || args.operationId), projectId: p.id, planVersionId: v.id, planReviewId: review.id, mode: args.mode,
      supersedesRunId: prior?.id || null, openedAt: now(), openedBy: text(args.author, "named run operator", 240, true) };
    need(!s.runs.some(r => r.id === run.id), "This run identity already belongs to original work.");
    run.originalSha256 = digest(runSeed(run));
    const version = signed({ format: "commons.haystack.consumer-run-version.v1", runId: run.id, parents: [], originalRunSha256: run.originalSha256,
      status: "awaiting-evidence", content: null, result: null, ...stamp(args) });
    run.headId = version.id; s.runs.push(run); s.runVersions.push(version);
    return { run: clone(run), version: clone(version) };
  }
  if (action === "consumer.run.receive") {
    const preview = previewConsumerRun(state, args), run = runOf(s, args.runId);
    const version = signed({ format: "commons.haystack.consumer-run-version.v1", runId: run.id, parents: [run.headId], originalRunSha256: run.originalSha256,
      status: "received", content: clone(args.content), result: preview.result, ...stamp(args) });
    s.runVersions.push(version); run.headId = version.id;
    return { run: clone(run), version: { id: version.id, status: version.status }, result: runSummary(s, run).result };
  }
  if (action === "consumer.run.review") {
    const p = currentProject(s, args), { run, version } = runHead(s, args);
    need(run.projectId === p.id, "Review a run in the selected project."); validateReview(s, args, p, run, version);
    text(args.note, "complete written acceptance or defect decision", 32000, true);
    const review = signed({ format: "commons.haystack.consumer-review.v1", projectId: p.id, planVersionId: run.planVersionId,
      runId: run.id, runVersionId: version.id, decision: args.decision, exceptions: clone(args.exceptions), ...stamp(args) });
    s.reviews.push(review); return { project: clone(p), review, currentAcceptance: acceptance(s, p) };
  }
  if (action === "consumer.return.apply") return applyConsumerReturn(state, args);
  need(false, "Choose a declared consumer mutation.", "HAYSTACK_ACTION", 404);
}
export function readConsumerAction(state, action, args) {
  const s = stateOf(state);
  if (action === "consumer.projects.list") return page(consumerRows(state), args);
  if (action === "consumer.files.list") return page(clone(s.files), args);
  if (action === "consumer.project.read") return consumerProjectRead(state, args);
  if (action === "consumer.plan.preview") return previewConsumerPlan(state, args);
  if (action === "consumer.run.read") return consumerRunRead(state, args);
  if (action === "consumer.run.preview") return previewConsumerRun(state, args);
  if (action === "consumer.return.preview") return previewConsumerReturn(state, args);
  need(false, "Choose a declared consumer action.", "HAYSTACK_ACTION", 404);
}
function referencedFiles(plan, versions) { return [...new Set([...planFileIds(plan.content), ...versions.filter(v => v.content).flatMap(v => receivingFileIds(v.content))])]; }
export function consumerReturnPayload(state, runId) {
  const s = stateOf(state), run = runOf(s, runId), p = projectOf(s, run.projectId), plan = planOf(s, p, run.planVersionId);
  const versions = s.runVersions.filter(v => v.runId === run.id), completed = runVersion(s, run);
  need(completed.status === "received", "Receive an explicit complete, failed or interrupted outcome before exporting its return.");
  const ids = referencedFiles(plan, versions), files = ids.map(key => clone(find(s.files, key, "complete original file"))), hashes = new Set(files.map(f => f.sha256));
  const projectionEvidence = projectionEvidenceFor(state, s, completed.content.projectionReturnId);
  if (projectionEvidence) verifyProjectionEvidence(state, projectionEvidence);
  const payload = { format: CONSUMER_RETURN_FORMAT, projectionEvidence, workspaceId: state.workspaceId, projectId: p.id, planVersion: clone(plan),
    planReview: clone(find(s.planReviews, run.planReviewId, "original plan review")), run: clone(run), runVersions: clone(versions),
    reviews: clone(s.reviews.filter(r => r.runId === run.id)), files, blobs: clone(s.blobs.filter(b => hashes.has(b.sha256))) };
  const completePayload = { ...payload, payloadSha256: digest(payload) };
  const raw = Buffer.from(stringifyJson(completePayload) + "\n");
  need(raw.length <= CONSUMER_RETURN_MAX, "The complete original consumer return exceeds 96 MiB.", "HAYSTACK_SIZE", 413);
  const parsed = parseConsumerReturn(state, raw), capacity = returnCapacity(state, parsed, raw);
  need(capacity.canApply, capacity.reason, "HAYSTACK_SIZE", 413, capacity);
  return completePayload;
}
function parseConsumerReturn(state, raw, { allowMissingProjection = false } = {}) {
  const payload = json(raw, CONSUMER_RETURN_MAX);
  fields(payload, ["format", "workspaceId", "projectId", "planVersion", "planReview", "run", "runVersions", "reviews", "files", "blobs", "projectionEvidence", "payloadSha256"],
    ["format", "workspaceId", "projectId", "planVersion", "planReview", "run", "runVersions", "reviews", "files", "blobs", "projectionEvidence", "payloadSha256"]);
  const body = clone(payload); delete body.payloadSha256;
  need(payload.format === CONSUMER_RETURN_FORMAT && hash(payload.payloadSha256) === digest(body), "The complete consumer return payload changed.", "HAYSTACK_CONSUMER_RETURN", 409);
  need(payload.workspaceId === state.workspaceId, "Receive this evidence only into its original workspace.", "HAYSTACK_CONSUMER_RETURN_WORKSPACE", 409);
  const s = stateOf(state), run = runOf(s, payload.run.id), p = projectOf(s, payload.projectId), plan = planOf(s, p, run.planVersionId);
  need(run.projectId === p.id && same(plan, payload.planVersion) && same(find(s.planReviews, run.planReviewId, "original plan review"), payload.planReview) &&
    run.originalSha256 === payload.run.originalSha256 && same(runSeed(run), runSeed(payload.run)),
    "The return must bind the original opened run and full frozen plan/target/expected-population review.", "HAYSTACK_CONSUMER_RETURN_BINDING", 409);
  const incoming = clone(s); incoming.files = clone(payload.files); incoming.blobs = clone(payload.blobs); validateFiles(incoming);
  const required = referencedFiles(plan, payload.runVersions);
  need(same([...required].sort(), incoming.files.map(f => f.id).sort()), "The return needs the exact complete input/output/evidence file inventory.");
  const usedHashes = [...new Set(incoming.files.map(f => f.sha256))].sort();
  need(same(usedHashes, incoming.blobs.map(b => b.sha256).sort()), "The return includes missing or unrelated original byte bodies.");
  for (const fileId of planFileIds(plan.content)) need(same(find(s.files, fileId, "original selected file"), find(incoming.files, fileId, "returned selected file")),
    "The selected original input/evidence metadata changed.");
  list(payload.runVersions, "original pending and received run editions", 2); unique(payload.runVersions, x => x.id, "returned run edition");
  need(payload.runVersions.length === 2, "Retain both the original opened run and one complete received outcome.");
  const initial = payload.runVersions.find(v => v.status === "awaiting-evidence"), complete = payload.runVersions.find(v => v.status === "received");
  need(initial && complete && same(initial, find(s.runVersions, initial.id, "original pending run edition")), "The return lost the original prepared run.");
  for (const v of payload.runVersions) checkSigned(v);
  need(initial.runId === run.id && initial.parents.length === 0 && complete.runId === run.id &&
    complete.originalRunSha256 === run.originalSha256 && same(complete.parents, [initial.id]) && payload.run.headId === complete.id,
    "The returned result must descend directly from the original opened run.");
  need((complete.content.projectionReturnId === null) === (payload.projectionEvidence === null), "Carry the complete selected grid-return provenance, or explicitly no grid return.");
  if (payload.projectionEvidence) {
    verifyProjectionEvidence(state, payload.projectionEvidence);
    need(payload.projectionEvidence.return.id === complete.content.projectionReturnId, "The selected grid-return identity differs from its complete evidence.");
    const old = incoming.projectionEvidence.find(e => e.return.id === complete.content.projectionReturnId);
    if (old) need(same(old, payload.projectionEvidence), "The original projection evidence differs.");
    else incoming.projectionEvidence.push(clone(payload.projectionEvidence));
  }
  need(same(complete.result, observations(state, incoming, run, complete.content, { allowMissingProjection })), "Returned comparison differs from its exact original expected population and complete observed evidence.");
  list(payload.reviews, "complete returned customer reviews", MAX_HISTORY); unique(payload.reviews, x => x.id, "returned customer review");
  for (const r of payload.reviews) {
    checkSigned(r); need(r.runId === run.id && r.runVersionId === complete.id && r.planVersionId === plan.id && r.projectId === p.id,
      "Retain only reviews of this exact returned run.");
    validateReview(incoming, r, { ...p, headId: plan.id }, run, complete, true);
  }
  const current = runVersion(s, run);
  need(current.id === initial.id || current.id === complete.id, "This original run already has a different immutable result. Preserve it and receive a separately opened corrected run.", "HAYSTACK_CONSUMER_RETURN_CONFLICT", 409);
  return { payload, run, project: p, complete, initial, alreadyRetained: current.id === complete.id,
    packageSha256: sha256(raw), bytes: raw.length,
    dependencies: [], projectionEvidence: payload.projectionEvidence ? { id: payload.projectionEvidence.return.id,
      localDecisionPresent: (state.projections?.returns || []).some(r => r.id === payload.projectionEvidence.return.id),
      authorGridAdoptionRequired: !(state.projections?.returns || []).some(r => r.id === payload.projectionEvidence.return.id),
      meaning: "Complete customer grid-return evidence is retained. The author projection head is unchanged; any grid adoption remains an explicit original projection action." } : null };
}
function returnCandidate(state, parsed, raw, args = {}) {
  const next = clone(state), s = stateOf(next, true), run = runOf(s, parsed.run.id);
  const prior = s.returns.find(r => r.packageSha256 === parsed.packageSha256);
  if (prior) return { state: next, result: { run: clone(run), return: clone(prior), alreadyRetained: true } };
  need(s.returns.length < MAX_HISTORY, "Retain the complete original return history within its documented limit.", "HAYSTACK_SIZE", 413);
  for (const key of ["blobs", "files", "runVersions"]) for (const row of parsed.payload[key]) {
    const field = key === "blobs" ? "sha256" : "id", old = s[key].find(x => x[field] === row[field]);
    if (old) need(same(old, row), "An original returned record differs."); else s[key].push(clone(row));
  }
  if (parsed.payload.projectionEvidence && !s.projectionEvidence.some(e => e.return.id === parsed.payload.projectionEvidence.return.id))
    s.projectionEvidence.push(clone(parsed.payload.projectionEvidence));
  run.headId = parsed.complete.id;
  const receivedFile = retainFile(s, { name: "consumer-return-" + run.id + ".json", mediaType: "application/json" }, raw, true).file;
  const audit = { author: args.author === undefined ? "\u0001".repeat(240) : text(args.author, "named receiving operator", 240, true),
    note: args.note === undefined ? "\u0001".repeat(16000) : text(args.note, "complete receiving decision note", 16000, true), createdAt: now() };
  const receipt = signed({ format: "commons.haystack.consumer-return-receipt.v1", projectId: run.projectId, runId: run.id,
    planVersionId: run.planVersionId, beforeRunHeadId: args.expectedRunHeadId || parsed.run.headId, incomingRunHeadId: parsed.complete.id,
    packageSha256: parsed.packageSha256, payloadSha256: parsed.payload.payloadSha256, bytes: parsed.bytes, originalFileId: receivedFile.id,
    customerReviews: clone(parsed.payload.reviews), ...audit });
  s.returns.push(receipt);
  return { state: next, result: { run: clone(run), return: clone(receipt), result: runSummary(s, run).result, authorAcceptanceRequired: true } };
}
function returnCapacity(state, parsed, raw, args = {}) {
  const currentStateBytes = Buffer.byteLength(stringifyJson(state) + "\n");
  let candidate;
  try { candidate = returnCandidate(state, parsed, raw, args); }
  catch (error) {
    if (error.code !== "HAYSTACK_SIZE") throw error;
    return { canApply: false, currentStateBytes, projectedStateBytes: null, maximumStateBytes: WORKSPACE_MAX_BYTES,
      reason: error.message, includesOriginalEnvelope: true, evidenceLimit: MAX_EVIDENCE_FILES, totalFileLimit: MAX_FILES };
  }
  // Include the original Store's complete operation result and hash journal.
  // Preview reserves the maximum author/note lengths; dispatch uses exact values.
  const projected = candidate.state;
  {
    projected.revision += 1;
    const operationId = args.operationId || "00000000-0000-0000-0000-000000000000";
    const outcome = { ...clone(candidate.result), workspaceId: projected.workspaceId, revision: projected.revision, operationId };
    const operation = { id: operationId, action: "consumer.return.apply", argumentsSha256: "0".repeat(64), revision: projected.revision,
      at: now(), previousSha256: projected.operations.at(-1)?.sha256 || null, result: outcome, sha256: "0".repeat(64) };
    projected.operations.push(operation);
  }
  projected.sha256 = "0".repeat(64);
  const projectedStateBytes = Buffer.byteLength(stringifyJson(projected) + "\n");
  return { canApply: projectedStateBytes <= WORKSPACE_MAX_BYTES, currentStateBytes, projectedStateBytes, maximumStateBytes: WORKSPACE_MAX_BYTES,
    remainingBytes: WORKSPACE_MAX_BYTES - projectedStateBytes, includesOriginalEnvelope: true, includesOriginalOperation: true,
    evidenceLimit: MAX_EVIDENCE_FILES, totalFileLimit: MAX_FILES, originalEnvelopeBytes: raw.length,
    projectedFiles: stateOf(projected).files.length, reason: projectedStateBytes <= WORKSPACE_MAX_BYTES ? null :
      "The complete evidence, immutable received JSON and original operation history exceed this workspace's 128 MiB capacity. Preserve this package and use the original issued workspace with enough remaining capacity." };
}
export function previewConsumerReturn(state, args) {
  const raw = base64(args.base64, CONSUMER_RETURN_MAX), parsed = parseConsumerReturn(state, raw, { allowMissingProjection: true });
  const capacity = returnCapacity(state, parsed, raw);
  return { projectId: parsed.project.id, runId: parsed.run.id, expectedRunHeadId: parsed.run.headId, incomingRunHeadId: parsed.complete.id,
    planVersionId: parsed.run.planVersionId, packageSha256: parsed.packageSha256, bytes: parsed.bytes, alreadyRetained: parsed.alreadyRetained,
    result: clone(parsed.complete.result), customerReviews: clone(parsed.payload.reviews), files: clone(parsed.payload.files),
    authorAcceptanceRequired: true, capacity, dependencies: parsed.dependencies, projectionEvidence: parsed.projectionEvidence, canApply: capacity.canApply && parsed.dependencies.length === 0 };
}
function applyConsumerReturn(state, args) {
  const s = stateOf(state, true), raw = base64(args.base64, CONSUMER_RETURN_MAX), parsed = parseConsumerReturn(state, raw);
  need(args.runId === parsed.run.id, "Receive the originally reviewed run identity."); runHead(s, args);
  const capacity = returnCapacity(state, parsed, raw, args);
  need(capacity.canApply, capacity.reason, "HAYSTACK_SIZE", 413, capacity);
  const candidate = returnCandidate(state, parsed, raw, args);
  state.consumerAcceptance = candidate.state.consumerAcceptance;
  return candidate.result;
}
export function validateConsumerState(state) {
  const s = state.consumerAcceptance; if (s === undefined) return state;
  const keys = Object.keys(empty()); fields(s, keys, keys); need(s.format === CONSUMER_FORMAT, "Use the complete consumer acceptance history.");
  validateFiles(s);
  list(s.projectionEvidence, "complete retained customer grid-return evidence", MAX_HISTORY);
  unique(s.projectionEvidence, e => e.return.id, "retained customer grid-return identity");
  for (const evidence of s.projectionEvidence) verifyProjectionEvidence(state, evidence);
  const originalReturnIds = new Set(s.returns.map(r => r.originalFileId));
  need(s.files.filter(f => !originalReturnIds.has(f.id)).length <= MAX_EVIDENCE_FILES, "Retain no more than 500 selected evidence files in the complete original workspace.", "HAYSTACK_SIZE", 413);
  for (const key of ["projects", "versions", "planReviews", "runs", "runVersions", "reviews", "returns"]) {
    list(s[key], "consumer " + key, key === "projects" ? MAX_PROJECTS : MAX_HISTORY); unique(s[key], x => x.id, "consumer " + key + " identity");
  }
  const versions = new Map(s.versions.map(v => [v.id, v]));
  for (const v of s.versions) {
    checkSigned(v); need(v.format === "commons.haystack.consumer-plan.v1", "Use the complete plan format."); projectOf(s, v.projectId);
    const checked = planContent(state, s, v.content); need(same(checked.binding, v.binding), "The plan lost its exact original projection/model binding.");
    list(v.parents, "original plan parent", 1); for (const parent of v.parents) need(versions.get(parent)?.projectId === v.projectId && parent !== v.id, "Retain the original plan ancestry.");
    const seen = new Set(); let at = v;
    while (at) { need(!seen.has(at.id), "The original plan history contains a cycle."); seen.add(at.id); at = at.parents.length ? versions.get(at.parents[0]) : null; }
  }
  for (const p of s.projects) { id(p.id); date(p.createdAt, "project creation"); text(p.createdBy, "project author", 240, true); planOf(s, p); }
  for (const r of s.planReviews) {
    checkSigned(r); const p = projectOf(s, r.projectId), v = planOf(s, p, r.planVersionId);
    need(["ready", "changes"].includes(r.decision) && same(r.binding, v.binding), "Retain the complete original ready review.");
    if (r.decision === "ready") need(previewConsumerPlan(state, { content: v.content }).assessment.canReviewReady, "The original plan was not ready.");
    date(r.createdAt, "plan review");
  }
  for (const run of s.runs) {
    originalRunCheck(run); id(run.id); const p = projectOf(s, run.projectId), plan = planOf(s, p, run.planVersionId), review = find(s.planReviews, run.planReviewId, "plan review");
    need(review.projectId === p.id && review.planVersionId === plan.id && review.decision === "ready" && ["actual", "engineering"].includes(run.mode), "The original run lost its exact ready plan.");
    const all = s.runVersions.filter(v => v.runId === run.id), initial = all.find(v => v.status === "awaiting-evidence");
    need(initial && all.length >= 1 && all.length <= 2 && initial.parents.length === 0 && initial.content === null && initial.result === null, "Retain exactly one original pending run and at most one immutable received result.");
    for (const v of all) {
      checkSigned(v); need(v.format === "commons.haystack.consumer-run-version.v1" && v.originalRunSha256 === run.originalSha256, "The original run edition changed.");
      date(v.createdAt, "run edition");
      if (v !== initial) need(v.status === "received" && same(v.parents, [initial.id]) && same(v.result, observations(state, s, run, v.content)),
        "The received result differs from its full original evidence.");
    }
    const head = runVersion(s, run); need(head.id === (all.find(v => v.status === "received") || initial).id, "The run head lost its received outcome.");
    if (run.supersedesRunId !== null) { const prior = runOf(s, run.supersedesRunId); need(prior.id !== run.id && prior.projectId === p.id && runVersion(s, prior).status === "received", "Preserve a complete prior run when correcting it."); }
    const visited = new Set(); let at = run;
    while (at) { need(!visited.has(at.id), "The original corrected-run history contains a cycle."); visited.add(at.id); at = at.supersedesRunId ? runOf(s, at.supersedesRunId) : null; }
  }
  for (const v of s.runVersions) runOf(s, v.runId);
  for (const r of s.reviews) {
    checkSigned(r); const p = projectOf(s, r.projectId), run = runOf(s, r.runId), v = runVersion(s, run, r.runVersionId);
    need(run.projectId === p.id && run.planVersionId === r.planVersionId, "The review belongs to its original run and plan.");
    validateReview(s, r, { ...p, headId: r.planVersionId }, run, v, true);
  }
  for (const r of s.returns) {
    checkSigned(r); const run = runOf(s, r.runId), f = find(s.files, r.originalFileId, "complete original return");
    need(r.projectId === run.projectId && r.planVersionId === run.planVersionId && f.sha256 === r.packageSha256 && f.bytes === r.bytes &&
      s.runVersions.some(v => v.id === r.incomingRunHeadId && v.runId === run.id), "The return receipt lost the complete original received file or outcome.");
    const raw = base64(findBlob(s, f.sha256).base64, CONSUMER_RETURN_MAX), parsed = parseConsumerReturn(state, raw);
    need(parsed.packageSha256 === r.packageSha256 && parsed.payload.payloadSha256 === r.payloadSha256 && parsed.complete.id === r.incomingRunHeadId &&
      same(parsed.payload.reviews, r.customerReviews), "The return receipt differs from the retained original bytes.");
  }
  return state;
}
