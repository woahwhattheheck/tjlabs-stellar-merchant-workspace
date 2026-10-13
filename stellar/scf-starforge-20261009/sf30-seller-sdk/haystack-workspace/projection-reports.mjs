import { projectionRead } from "./projection-model.mjs";
import { encodeGrid } from "./haystack-types.mjs";
import { stringifyJson } from "./json-codec.mjs";
import { csvCell, escapeHtml, need, sha256, canonical } from "./util.mjs";

const LINEAGE_COLUMNS = ["entityId", "rowIndex", "tag", "present", "typedValue", "sourceRefs", "origin", "issue", "modelVersionId", "gridSha256"];
function* lineageCsvChunks(rows, modelVersionId, gridSha256) {
  // Keep the exact spreadsheet-safe cells, BOM, order and CRLF terminators of
  // util.csv without retaining another row object and escaped line per cell.
  // A single original field may exceed a batch; it remains complete.
  let pending = "\uFEFF" + LINEAGE_COLUMNS.map(csvCell).join(",") + "\r\n";
  for (const row of rows) for (const cell of row.cells) {
    const values = [row.entityId, row.rowIndex, cell.tag, cell.present,
      cell.present ? canonical(cell.value) : "", row.sourceRefs, cell.origin,
      cell.issue || null, modelVersionId, gridSha256];
    pending += values.map(csvCell).join(",") + "\r\n";
    if (pending.length >= 65536) { yield Buffer.from(pending); pending = ""; }
  }
  if (pending) yield Buffer.from(pending);
}

export function makeProjectionDelivery(state, args, { stream = false } = {}) {
  const read = projectionRead(state, args), short = read.projection.id + "-" + read.version.id.slice(0, 12);
  if (args.kind === "projection-grid") {
    need(args.format === undefined || args.format === "json", "Typed grid delivery uses complete JSON v4.");
    need(read.canPublish && read.reviews.filter(r => r.versionId === read.version.id).at(-1)?.decision === "ready",
      "Review this complete typed grid before exporting a consumer delivery.", "HAYSTACK_PROJECTION_REVIEW", 409);
    const bytes = encodeGrid(read.grid, { format: "json-v4", indent: 2 });
    need(sha256(bytes) === read.gridSha256, "The saved derived grid changed.", "HAYSTACK_PROJECTION_GRID", 409);
    return { name: "haystack-projection-" + short + ".json", mediaType: "application/json", bytes };
  }
  const format = args.format || "json";
  if (args.kind === "projection-lineage") {
    need(["json", "csv"].includes(format), "Choose complete JSON or spreadsheet-safe CSV lineage.");
    if (format === "csv") {
      const chunks = lineageCsvChunks(read.rows, read.modelVersionId, read.gridSha256);
      const metadata = { name: "haystack-lineage-" + short + ".csv", mediaType: "text/csv; charset=utf-8" };
      // The store consumes chunks directly inside its original pending delivery.
      // Standalone callers keep the established complete-Buffer return shape.
      return stream ? { ...metadata, chunks } : { ...metadata, bytes: Buffer.concat([...chunks]) };
    }
  } else need(args.kind === "projection-report" && ["json", "html"].includes(format), "Choose JSON or HTML for the full projection report.");
  const report = { format: "commons.haystack.projection-handover.v1", workspaceId: state.workspaceId, workspaceRevision: state.revision,
    projectionId: read.projection.id, version: read.version, modelId: read.modelId, modelVersionId: read.modelVersionId,
    modelContentSha256: read.modelContentSha256, contextId: read.contextId, gridSha256: read.gridSha256,
    profile: read.profile, rows: read.rows, counts: read.counts, diagnostics: read.diagnostics,
    reviews: read.reviews.filter(r => r.versionId === read.version.id),
    publications: read.publications.filter(r => r.versionId === read.version.id),
    returns: read.returns.map(({ base64, ...row }) => row),
    meaning: "A reviewed typed-grid projection and its original source lineage. Consumer acceptance belongs to the referenced original consumer record." };
  if (format === "html") {
    const e = escapeHtml;
    const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
      e(read.profile.title) + '</title><style>body{font:15px system-ui,sans-serif;margin:36px;color:#161616;background:#fff;max-width:1400px}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{border:1px solid #ccc;padding:8px;text-align:left;vertical-align:top}th{background:#eee}code,pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}h1{font-size:26px}.meta{color:#444} @media print{body{margin:12mm}thead{display:table-header-group}tr{break-inside:avoid}}</style><h1>' +
      e(read.profile.title) + '</h1><p>' + e(read.profile.description) + '</p><p class="meta">' + e(report.meaning) + '</p><p>' +
      read.counts.rows + ' rows · ' + read.counts.columns + ' columns · ' + read.counts.errors + ' errors · ' + read.counts.warnings +
      ' warnings</p><h2>Original model and reviewed grid</h2><pre>' + e(stringifyJson({ workspaceId: report.workspaceId,
        projectionId: report.projectionId, version: read.version.id, modelId: read.modelId, modelVersionId: read.modelVersionId,
        contextId: read.contextId, gridSha256: read.gridSha256, reviews: report.reviews }, 2)) +
      '</pre><h2>Findings</h2><table><thead><tr><th>Severity</th><th>Entity / tag</th><th>Finding</th></tr></thead><tbody>' +
      read.diagnostics.map(d => '<tr><td>' + e(d.severity) + '</td><td>' + e((d.entityId || '') + ' / ' + (d.tag || '')) + '</td><td>' + e(d.message) + '</td></tr>').join('') +
      '</tbody></table><h2>Complete typed values and source lineage</h2><table><thead><tr><th>Entity</th><th>Tag</th><th>Typed value</th><th>Original source / conversion</th></tr></thead><tbody>' +
      read.rows.flatMap(row => row.cells.map(cell => '<tr><td>' + e(row.entityId) + '</td><td>' + e(cell.tag) + '</td><td><code>' +
        e(cell.present ? canonical(cell.value) : '(absent)') + '</code></td><td><code>' + e(canonical(cell.origin)) +
        '</code>' + (cell.issue ? '<p>' + e(cell.issue.message) + '</p>' : '') + '</td></tr>')).join('') +
      '</tbody></table><h2>Native publications and returned corrections</h2><pre>' +
      e(stringifyJson({ publications: report.publications, returns: report.returns }, 2)) + '</pre></html>';
    return { name: "haystack-projection-report-" + short + ".html", mediaType: "text/html; charset=utf-8", bytes: Buffer.from(html) };
  }
  return { name: "haystack-" + (args.kind === "projection-lineage" ? "lineage-" : "projection-report-") + short + ".json",
    mediaType: "application/json", bytes: Buffer.from(stringifyJson(report, 2) + "\n") };
}
