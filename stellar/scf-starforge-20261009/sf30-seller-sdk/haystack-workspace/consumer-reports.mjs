import { stringifyJson } from "./json-codec.mjs";
import { consumerProjectRead, consumerRunRead, consumerReturnPayload } from "./consumer-acceptance.mjs";
import { clone, csv, escapeHtml, need, canonical } from "./util.mjs";

export function consumerProjectionLinks(state, projectionId, versionId) {
  const s = state.consumerAcceptance;
  if (!s) return [];
  return s.projects.flatMap(project => {
    const versions = s.versions.filter(v => v.projectId === project.id && v.binding.projectionId === projectionId && v.binding.projectionVersionId === versionId);
    if (!versions.length) return [];
    const ids = new Set(versions.map(v => v.id)), runs = s.runs.filter(r => r.projectId === project.id && ids.has(r.planVersionId));
    const runIds = new Set(runs.map(r => r.id));
    return [{ projectId: project.id, currentPlanVersionId: project.headId, selectedPlanVersions: versions.map(v => ({ id: v.id, title: v.content.title,
      target: clone(v.content.target), acceptanceOwner: v.content.acceptanceOwner, binding: clone(v.binding) })),
      runs: runs.map(r => { const v = s.runVersions.find(v => v.id === r.headId); return { runId: r.id, planVersionId: r.planVersionId,
        runVersionId: r.headId, mode: r.mode, status: v.status, originalExternalOperationId: v.content?.externalOperationId || null,
        processOutcome: v.result?.processOutcome || null, technicalMatch: v.result?.technicalMatch ?? null }; }),
      reviews: clone(s.reviews.filter(r => runIds.has(r.runId))), receivedReviews: s.returns.filter(r => runIds.has(r.runId)).map(r => ({
        returnId: r.id, originalFileId: r.originalFileId, packageSha256: r.packageSha256, customerReviews: clone(r.customerReviews) })) }];
  });
}
function projectReport(state, projectId) {
  const view = consumerProjectRead(state, { projectId }), s = state.consumerAcceptance;
  const versions = s.versions.filter(v => v.projectId === projectId), runIds = new Set(view.runs.map(r => r.id));
  const runs = [...runIds].map(runId => consumerRunRead(state, { runId }));
  const fileIds = new Set();
  for (const v of versions) {
    for (const fileId of [...v.content.interface.inputFileIds, ...v.content.interface.mappingFileIds, ...v.content.questions.flatMap(q => q.expectedEvidenceFileIds)]) fileIds.add(fileId);
  }
  for (const run of runs) for (const v of run.history) if (v.content)
    for (const fileId of [...v.content.inputFileIds, ...v.content.outputFileIds, ...v.content.questions.flatMap(q => q.outputFileIds), v.content.commandFileId, v.content.stdoutFileId, v.content.stderrFileId].filter(Boolean)) fileIds.add(fileId);
  for (const row of view.returns) fileIds.add(row.originalFileId);
  return { format: "commons.haystack.consumer-report.v1", workspaceId: state.workspaceId, workspaceRevision: state.revision,
    project: view.project, currentPlan: view.version, currentAcceptance: view.currentAcceptance,
    versions: clone(versions), planReviews: view.planReviews, runs: runs.map(({ files, ...run }) => run),
    reviews: view.reviews, returns: view.returns, files: s.files.filter(f => fileIds.has(f.id)).map(clone),
    meaning: "Exact selected consumer plans and operator-supplied receiving evidence. Technical comparison and the named person's acceptance are separate records. Original file bytes remain in the full workspace and exact consumer returns." };
}
function csvRows(report) {
  const rows = [], add = row => rows.push({ projectId: report.project.id, ...row });
  add({ type: "project", note: { project: report.project, currentAcceptance: report.currentAcceptance } });
  for (const v of report.versions) {
    add({ type: "plan", planVersionId: v.id, note: { parents: v.parents, binding: v.binding, target: v.content.target,
      interface: v.content.interface, acceptanceOwner: v.content.acceptanceOwner, author: v.author, createdAt: v.createdAt, note: v.note, boundaryNote: v.content.boundaryNote } });
    for (const q of v.content.questions) {
      add({ type: "question", planVersionId: v.id, questionId: q.id, note: { label: q.label, query: q.query, expectedEvidenceFileIds: q.expectedEvidenceFileIds, note: q.note } });
      for (const row of q.expected) add({ type: "expected", planVersionId: v.id, questionId: q.id, identity: row.id, expectedPresent: true, expected: row.values });
    }
  }
  for (const r of report.planReviews) add({ type: "plan-review", planVersionId: r.planVersionId, result: r.decision, note: r });
  for (const read of report.runs) {
    add({ type: "run", planVersionId: read.run.planVersionId, runId: read.run.id, runVersionId: read.run.headId, result: read.version.status, note: read.run });
    for (const v of read.history) {
      const base = { planVersionId: read.run.planVersionId, runId: read.run.id, runVersionId: v.id };
      add({ ...base, type: "run-edition", result: v.status, note: { parents: v.parents, author: v.author, note: v.note, createdAt: v.createdAt,
        ...(v.content ? { externalOperationId: v.content.externalOperationId, operator: v.content.operator, startedAt: v.content.startedAt, endedAt: v.content.endedAt,
          target: v.content.target, outcome: v.content.outcome, inputFileIds: v.content.inputFileIds, outputFileIds: v.content.outputFileIds,
          commandFileId: v.content.commandFileId, stdoutFileId: v.content.stdoutFileId, stderrFileId: v.content.stderrFileId,
          projectionReturnId: v.content.projectionReturnId, observationNote: v.content.note } : {}) } });
      for (const q of v.content?.questions || []) {
        add({ ...base, type: "observed-question", questionId: q.questionId, result: q.status, note: { outputFileIds: q.outputFileIds, note: q.note } });
        for (const row of q.observed) add({ ...base, type: "observed", questionId: q.questionId, identity: row.id, actualPresent: true, actual: row.values });
      }
      for (const q of v.result?.questions || []) {
        add({ ...base, type: "comparison", questionId: q.questionId, result: q.matched ? "matched" : "differences", note: {
          expectedCount: q.expectedCount, observedCount: q.observedCount, missingIds: q.missingIds, unexpectedIds: q.unexpectedIds, duplicateIds: q.duplicateIds } });
        for (const d of q.valueDifferences) add({ ...base, type: "value-difference", questionId: q.questionId, identity: d.id, field: d.key,
          expectedPresent: true, expected: d.expected, actualPresent: d.actualPresent, actual: d.actualPresent ? d.actual : "", result: "differs" });
      }
      for (const finding of v.result?.findings || []) add({ ...base, type: "binding-finding", result: finding.code, note: finding.message });
    }
  }
  for (const r of report.reviews) add({ type: "acceptance-review", planVersionId: r.planVersionId, runId: r.runId, runVersionId: r.runVersionId, result: r.decision, note: r });
  for (const r of report.returns) add({ type: "consumer-return", planVersionId: r.planVersionId, runId: r.runId, runVersionId: r.incomingRunHeadId, note: r });
  for (const f of report.files) add({ type: "original-file", identity: f.id, note: f });
  return rows;
}
function htmlReport(report) {
  const e = escapeHtml, pre = value => "<pre>" + e(stringifyJson(value, 2)) + "</pre>";
  const table = (heads, rows) => "<table><thead><tr>" + heads.map(h => "<th>" + e(h) + "</th>").join("") + "</tr></thead><tbody>" +
    rows.map(row => "<tr>" + row.map(value => "<td>" + (typeof value === "string" ? e(value) : pre(value)) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  const current = report.currentPlan;
  let html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    e(current.content.title) + '</title><style>body{margin:24px;max-width:1440px;font:15px/1.5 system-ui,sans-serif;color:#202020;background:white}h1{font-size:24px}h2{font-size:20px;border-bottom:1px solid #aaa;padding-bottom:5px}h3{font-size:17px}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top}th{background:#eee}pre{font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}details{border:1px solid #ccc;padding:10px;margin:12px 0}summary{font-weight:600;cursor:pointer}p{max-width:100ch}@media print{body{margin:12mm}thead{display:table-header-group}tr{break-inside:avoid}details>summary{display:none}details>*{display:block}}</style><h1>' +
    e(current.content.title) + '</h1><p>' + e(report.meaning) + '</p><h2>Current selected consumer and decision</h2>' +
    table(["Consumer", "Interface", "Acceptance owner", "Current decision"], [[current.content.target, current.content.interface, current.content.acceptanceOwner, report.currentAcceptance || "No receiving run"]]) +
    '<p>' + e(current.content.boundaryNote) + '</p><h2>Exact original source edition</h2>' + pre(current.binding);
  for (const v of report.versions) {
    html += "<h2>Plan edition " + e(v.id) + "</h2>" + pre({ title: v.content.title, target: v.content.target, interface: v.content.interface,
      binding: v.binding, parents: v.parents, author: v.author, note: v.note, createdAt: v.createdAt });
    for (const q of v.content.questions) html += "<h3>" + e(q.id + " · " + q.label) + "</h3><p>" + e(q.note) + "</p>" +
      pre({ query: q.query, independentEvidence: q.expectedEvidenceFileIds }) +
      table(["Expected original ID", "Expected values"], q.expected.map(r => [r.id, r.values]));
  }
  html += "<h2>Frozen plan review history</h2>" + pre(report.planReviews);
  for (const read of report.runs) {
    html += "<h2>Receiving run " + e(read.run.id) + "</h2>" + pre(read.run);
    for (const v of read.history) {
      html += "<h3>" + e(v.status) + "</h3>" + pre({ version: v.id, parents: v.parents, author: v.author, createdAt: v.createdAt, note: v.note });
      if (!v.content) continue;
      const { questions, ...execution } = v.content; html += pre(execution);
      html += table(["Binding finding", "Observation"], v.result.findings.map(f => [f.code, f.message]));
      for (const q of questions) {
        const result = v.result.questions.find(r => r.questionId === q.questionId);
        html += "<h3>Question " + e(q.questionId) + "</h3><p>" + e(q.note) + "</p>" +
          pre({ status: q.status, matched: result.matched, expectedCount: result.expectedCount, observedCount: result.observedCount,
            missingIds: result.missingIds, unexpectedIds: result.unexpectedIds, duplicateIds: result.duplicateIds, outputFileIds: q.outputFileIds }) +
          table(["Observed original ID", "Observed values"], q.observed.map(r => [r.id, r.values])) +
          table(["Original ID", "Field", "Expected", "Actual presence", "Actual"], result.valueDifferences.map(d => [d.id, d.key, d.expected, d.actualPresent ? "present" : "absent", d.actualPresent ? d.actual : ""]));
      }
    }
  }
  html += "<h2>Named acceptance and exception history</h2>" + pre(report.reviews) +
    "<h2>Original received customer packages and reviews</h2>" + pre(report.returns) +
    "<h2>Complete retained file inventory</h2>" + table(["Original file", "Type", "Bytes", "SHA-256", "File identity"], report.files.map(f => [f.name, f.mediaType, f.bytes, f.sha256, f.id])) +
    "</html>";
  return html;
}
export function makeConsumerDelivery(state, args) {
  if (args.kind === "consumer-return") {
    need(args.consumerRunId && args.consumerProjectId === undefined && args.format === undefined, "Choose the exact original received run for its complete return.");
    const payload = consumerReturnPayload(state, args.consumerRunId);
    return { name: "consumer-return-" + args.consumerRunId + "-" + payload.run.headId.slice(0, 12) + ".json",
      mediaType: "application/json", bytes: Buffer.from(stringifyJson(payload) + "\n") };
  }
  need(args.kind === "consumer-report" && args.consumerProjectId && args.consumerRunId === undefined, "Choose one complete consumer project report.");
  const report = projectReport(state, args.consumerProjectId), format = args.format || "json";
  need(["json", "csv", "html"].includes(format), "Choose a full JSON, spreadsheet-safe CSV or HTML consumer report.");
  const content = format === "json" ? stringifyJson(report, 2) + "\n" : format === "html" ? htmlReport(report) :
    csv(["type", "projectId", "planVersionId", "runId", "runVersionId", "questionId", "identity", "field", "expectedPresent", "expected", "actualPresent", "actual", "result", "note"], csvRows(report));
  return { name: "consumer-" + report.project.id + "-r" + state.revision + "." + format,
    mediaType: format === "html" ? "text/html; charset=utf-8" : format === "csv" ? "text/csv; charset=utf-8" : "application/json", bytes: Buffer.from(content) };
}
