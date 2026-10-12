// MIT. Complete procurement exports from retained OCDS workspace data.
import { projectRows } from './domain.mjs';

const MIME = Object.freeze({
  json: 'application/json; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  html: 'text/html; charset=utf-8',
});
const html = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const json = value => JSON.stringify(value, null, 2);
const own = (value, key) => value != null && Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const memberId = value => object(value) ? value.id : 'Source value: ' + display(value);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function display(value) {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function label(value) {
  return display(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')
    .replace(/^./, first => first.toUpperCase());
}

function url(value) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

function link(value, title = value) {
  const href = url(value);
  return href ? '<a href="' + html(href) + '" rel="noopener noreferrer">' + html(display(title)) + '</a>'
    : html(display(title));
}

function valueLabel(value) {
  if (!value || !own(value, 'amount')) return '—';
  if (typeof value.amount !== 'number' || !Number.isFinite(value.amount))
    return display(value.amount) + (own(value, 'currency') ? ' ' + display(value.currency) : '');
  try {
    if (typeof value.currency === 'string')
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: value.currency,
        maximumFractionDigits: 2 }).format(value.amount);
  } catch {}
  return String(value.amount) + (own(value, 'currency') ? ' ' + display(value.currency) : '');
}

function fields(values) {
  return '<dl class="fields">' + values.map(([name, value, raw = false]) =>
    '<div><dt>' + html(name) + '</dt><dd>' + (raw ? value : html(display(value))) + '</dd></div>').join('') + '</dl>';
}

function rawDetails(title, value, isText = false) {
  return '<details class="original"><summary>' + html(title) + '</summary><pre>' +
    html(isText ? String(value) : json(value)) + '</pre></details>';
}

function table(headers, rows) {
  if (!rows.length) return '<p class="muted">No records are present in this edition.</p>';
  return '<div class="table-wrap"><table><thead><tr>' + headers.map(header =>
    '<th scope="col">' + html(header) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(row => '<tr>' + row.map(cell => '<td>' + html(display(cell)) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
}

function reviewOf(project) {
  return { revision: 0, disposition: 'unreviewed', owner: '', nextAction: '', note: '',
    shortlisted: false, ...(project.review || {}) };
}

function csvCell(value) {
  if (value === undefined) return '';
  let result = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Spreadsheet text remains text. Full original values also accompany each data row group.
  if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(result)) result = "'" + result;
  return '"' + result.replace(/"/g, '""') + '"';
}

function csvReport(payload) {
  const projects = new Map(payload.projects.map(project => [project.ocid, project]));
  const sources = new Map(payload.sources.map(source => [source.id, source]));
  const rows = [];
  for (const project of payload.projects) {
    const review = reviewOf(project);
    rows.push({ rowType: 'project-review', ocid: project.ocid,
      reviewRevision: review.revision, disposition: review.disposition,
      owner: review.owner, nextAction: review.nextAction, note: review.note,
      shortlisted: review.shortlisted, reviewUpdatedAt: review.updatedAt,
      projectJson: JSON.stringify(project) });
  }
  for (const entry of payload.entries) {
    const project = projects.get(entry.ocid);
    const review = reviewOf(project || {});
    const source = sources.get(entry.sourceId) || entry.source || {};
    const metadata = {
      workspaceId: payload.workspace.id, workspaceRevision: payload.workspace.revision,
      entryId: entry.id, entryKind: entry.kind, sourceId: entry.sourceId || source.id,
      sourceUrl: source.url, sourceSha256: source.sha256 || source.hash,
      sourceRetrievedAt: source.retrievedAt, entrySourcePointer: entry.sourcePointer,
      reviewRevision: review.revision, disposition: review.disposition, owner: review.owner,
      nextAction: review.nextAction, shortlisted: review.shortlisted,
    };
    for (const row of projectRows(entry.document))
      rows.push({ ...metadata, ...row });
    rows.push({ ...metadata, rowType: 'original-entry', ocid: entry.ocid,
      releaseId: entry.releaseId, releaseDate: entry.date,
      entryDocumentJson: JSON.stringify(entry.document) });
  }
  for (const source of payload.sources)
    rows.push({ rowType: 'original-source', sourceId: source.id, sourceUrl: source.url,
      sourceSha256: source.sha256 || source.hash, sourceRetrievedAt: source.retrievedAt,
      sourceLabel: source.label, sourceBody: source.body,
      sourceJson: JSON.stringify(source) });
  rows.push({ rowType: 'workspace', workspaceId: payload.workspace.id,
    workspaceRevision: payload.workspace.revision, exportedAt: payload.exportedAt,
    workspaceJson: JSON.stringify(payload.workspace) });
  const leading = ['rowType', 'ocid', 'releaseId', 'releaseDate', 'entryId', 'entryKind',
    'sourceId', 'sourcePointer', 'entrySourcePointer', 'sourceUrl', 'sourceSha256',
    'sourceRetrievedAt', 'title', 'name', 'id', 'stage', 'status', 'amount', 'currency',
    'disposition', 'owner', 'nextAction', 'shortlisted', 'reviewRevision'];
  const all = new Set(rows.flatMap(row => Object.keys(row)));
  const headers = [...leading.filter(key => all.has(key)),
    ...[...all].filter(key => !leading.includes(key)).sort()];
  return '\uFEFF' + headers.map(csvCell).join(',') + '\r\n' +
    rows.map(row => headers.map(header => csvCell(row[header])).join(',')).join('\r\n') + '\r\n';
}

function sourceIndex(payload) {
  return new Map(payload.sources.map((source, index) => [source.id, index + 1]));
}

function editionSection(entry, sources) {
  const document = entry.document || {};
  const summary = entry.summary || {};
  const sourceNumber = sources.get(entry.sourceId);
  const sourceReference = sourceNumber
    ? '<a href="#source-' + sourceNumber + '">' + html(display(entry.sourceId)) + '</a>'
    : html(display(entry.sourceId));
  let body = '<section class="edition"><h3>' + html(label(entry.kind || 'release')) + ' · ' +
    html(display(entry.releaseId || document.id)) + '</h3>' + fields([
      ['Release date', entry.date || document.date], ['OCID', entry.ocid || document.ocid],
      ['Entry ID', entry.id], ['Source pointer', entry.sourcePointer],
      ['Source ID', sourceReference, true], ['Tags', entry.tags || document.tag],
    ]);
  if (entry.kind === 'versionedRelease') {
    const revisions = projectRows(document).filter(row => row.rowType === 'field-revision');
    body += '<section class="data-section"><h4>Source version history</h4>' +
      '<p class="muted">The source records field revisions with their release identities and dates. Each row below retains the published field value and its original revision wrapper.</p>' +
      table(['Field path', 'Revision release ID', 'Revision date', 'Revision tags', 'Published value'],
        revisions.map(row => [row.fieldPath, row.revisionReleaseId, row.revisionDate,
          row.revisionTags, row.value])) +
      rawDetails('Complete retained version history and extensions', document) +
      '</section></section>';
    return body;
  }
  if (summary.description || document.tender?.description)
    body += '<p class="description">' + html(summary.description || document.tender.description) + '</p>';
  if (object(document.tender)) {
    const tender = document.tender;
    body += '<section class="data-section"><h4>Tender</h4>' + fields([
      ['Title', tender.title], ['Status', tender.status],
      ['Procurement method', tender.procurementMethod], ['Method details', tender.procurementMethodDetails],
      ['Published value', valueLabel(tender.value)], ['Main category', tender.mainProcurementCategory],
      ['Tender period', tender.tenderPeriod], ['Award period', tender.awardPeriod],
    ]) + rawDetails('Complete tender data', tender) + '</section>';
  }
  if (Array.isArray(document.awards)) {
    body += '<section class="data-section"><h4>Awards (' + document.awards.length + ')</h4>' +
      table(['Award ID', 'Title', 'Status', 'Date', 'Suppliers', 'Value'], document.awards.map(award =>
        [memberId(award), award?.title, award?.status, award?.date,
          Array.isArray(award?.suppliers) ? award.suppliers.map(supplier =>
            display(object(supplier) ? (supplier.name ?? supplier.id ?? supplier) : supplier)).join('; ') : award?.suppliers,
          valueLabel(award?.value)])) + rawDetails('Complete award data', document.awards) + '</section>';
  }
  if (Array.isArray(document.contracts)) {
    body += '<section class="data-section"><h4>Contracts (' + document.contracts.length + ')</h4>' +
      table(['Contract ID', 'Award ID', 'Title', 'Status', 'Signed', 'Value', 'Period'],
        document.contracts.map(contract => [memberId(contract), contract?.awardID, contract?.title,
          contract?.status, contract?.dateSigned, valueLabel(contract?.value), contract?.period])) +
      rawDetails('Complete contract data', document.contracts) + '</section>';
  }
  if (Array.isArray(document.parties)) {
    body += '<section class="data-section"><h4>Parties (' + document.parties.length + ')</h4>' +
      table(['Party ID', 'Name', 'Roles', 'Identifier', 'Contact'], document.parties.map(party =>
        [memberId(party), party?.name, party?.roles, party?.identifier, party?.contactPoint])) +
      rawDetails('Complete party data', document.parties) + '</section>';
  }
  if (own(document, 'amendments'))
    body += '<section class="data-section"><h4>Amendments</h4>' +
      rawDetails('All amendment fields', document.amendments) + '</section>';
  const links = Array.isArray(summary.links) ? summary.links : [];
  if (links.length)
    body += '<section class="data-section"><h4>Publication links</h4><ul>' + links.map(item =>
      '<li>' + link(item?.url, item?.title || item?.url || item) +
      (item?.kind ? ' <span class="muted">· ' + html(label(item.kind)) + '</span>' : '') + '</li>').join('') + '</ul></section>';
  body += rawDetails('Complete original edition JSON, including extensions', document) + '</section>';
  return body;
}

function projectSection(project, index, payload, sources) {
  const summary = project.summary || {};
  const review = reviewOf(project);
  const buyer = typeof summary.buyer === 'string' ? summary.buyer
    : summary.buyer?.name || summary.buyer?.id;
  const entries = payload.entries.filter(entry => entry.ocid === project.ocid);
  let body = '<article id="procedure-' + (index + 1) + '" class="procedure">' +
    '<div class="section-number">Procedure ' + (index + 1) + '</div><h2>' +
    html(display(summary.title || project.ocid)) + '</h2><p class="ocid">' + html(project.ocid) + '</p>' +
    fields([['Buyer', buyer], ['Stage', label(summary.stage)], ['Status', summary.status],
      ['Disposition', label(review.disposition)], ['Shortlisted', review.shortlisted ? 'Yes' : 'No'],
      ['Owner', review.owner || '—'], ['Review revision', review.revision], ['Review updated', review.updatedAt]]);
  body += '<section class="review"><h3>Review and next action</h3><h4>Next action</h4>' +
    '<p class="description">' + html(review.nextAction || '—') + '</p><h4>Review notes</h4>' +
    '<p class="description">' + html(review.note || '—') + '</p></section>';
  if (project.entries?.length)
    body += '<section class="data-section"><h3>Retained edition index</h3>' +
      table(['Edition type', 'Release ID', 'Date', 'Source ID', 'Source pointer'],
        project.entries.map(entry => [label(entry.kind), entry.releaseId, entry.date,
          entry.sourceId, entry.sourcePointer])) + '</section>';
  for (const entry of entries) body += editionSection(entry, sources);
  body += rawDetails('Complete project summary and saved review', project) + '</article>';
  return body;
}

function sourceSection(source, index) {
  const publisher = typeof source.publisher === 'object'
    ? source.publisher?.name || source.publisher : source.publisher;
  let body = '<section class="source" id="source-' + (index + 1) + '"><h3>' +
    html(display(source.label || source.id)) + '</h3>' + fields([
      ['Source ID', source.id], ['Original URL', source.url ? link(source.url) : '—', true],
      ['Captured', source.retrievedAt], ['Publisher', publisher], ['OCDS version', source.version],
      ['SHA-256', source.sha256 || source.hash], ['Retained bytes', source.bytes],
      ['License', source.license ? link(source.license) : '—', true],
    ]);
  if (Array.isArray(source.extensions) && source.extensions.length)
    body += '<h4>Declared extensions</h4><ul>' + source.extensions.map(extension =>
      '<li>' + link(extension) + '</li>').join('') + '</ul>';
  if (typeof source.body === 'string')
    body += rawDetails('Complete retained original source JSON', source.body, true);
  else if (own(source, 'document'))
    body += rawDetails('Complete retained original source JSON', source.document);
  body += rawDetails('Complete source metadata', source) + '</section>';
  return body;
}

function htmlReport(payload) {
  const sources = sourceIndex(payload);
  const title = payload.workspace.title || 'Procurement workspace';
  const shortlisted = payload.projects.filter(project => reviewOf(project).shortlisted).length;
  const contents = payload.projects.map((project, index) =>
    '<li><a href="#procedure-' + (index + 1) + '">' +
    html(display(project.summary?.title || project.ocid)) + '</a><span class="ocid">' +
    html(project.ocid) + '</span></li>').join('');
  const body = payload.projects.map((project, index) =>
    projectSection(project, index, payload, sources)).join('');
  const originals = payload.sources.map(sourceSection).join('');
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><title>' + html(title) + ' · Procurement report</title>' +
    '<style>' +
    ':root{font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#242421;background:#eeeee9}' +
    '*{box-sizing:border-box}body{margin:0}main{max-width:1180px;margin:0 auto;background:#fff;padding:2.5rem 3rem}' +
    'h1,h2,h3,h4,p{margin:0}h1{font-size:2rem;line-height:1.2;letter-spacing:-.035em}h2{font-size:1.55rem;line-height:1.3}' +
    'h3{font-size:1.1rem;margin-bottom:.8rem}h4{font-size:.92rem;margin:.9rem 0 .4rem}' +
    'a{color:inherit;overflow-wrap:anywhere;text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:2px solid #222;outline-offset:3px}' +
    '.eyebrow,.section-number{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#66665c;margin-bottom:.45rem}' +
    '.muted{color:#68685e}.meta{margin-top:1rem;font-size:.82rem;color:#62625a}.ocid{display:block;font:12px/1.5 ui-monospace,Consolas,monospace;overflow-wrap:anywhere;color:#5b5b53;margin:.4rem 0}' +
    '.stats{display:grid;grid-template-columns:repeat(4,1fr);border-block:1px solid #cdcdc3;margin:1.5rem 0}' +
    '.stat{padding:.85rem;border-right:1px solid #cdcdc3}.stat:last-child{border:0}.stat strong{display:block;font-size:1.6rem;font-weight:600}.stat span{font-size:.78rem;color:#66665c}' +
    '.contents{border:1px solid #d1d1c8;padding:1rem 1.2rem;margin-bottom:2rem}.contents ol{padding-left:1.3rem;margin:0}.contents li{padding:.3rem 0}' +
    '.procedure{border-top:2px solid #373730;padding-top:1.3rem;margin-top:2.6rem;scroll-margin-top:1rem}' +
    '.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.9rem 1.5rem;margin:1.1rem 0}' +
    '.fields>div{min-width:0}dt{font-size:.75rem;color:#6a6a60}dd{margin:.15rem 0 0;font-size:.9rem;overflow-wrap:anywhere}' +
    '.review{border:1px solid #ccc;background:#f8f8f4;padding:1rem 1.2rem;margin:1.2rem 0}.description{white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.edition{margin:1.4rem 0;border:1px solid #d5d5cb;padding:1rem 1.2rem}.data-section{margin-top:1.15rem}' +
    '.table-wrap{overflow:auto;margin:.6rem 0}table{width:100%;border-collapse:collapse;font-size:.78rem}th{text-align:left;font-weight:600;background:#f2f2ec}' +
    'th,td{padding:.55rem .6rem;vertical-align:top;border:1px solid #d4d4cb;overflow-wrap:anywhere}' +
    'details{border-top:1px solid #d6d6cc;margin-top:.85rem;padding-top:.65rem}summary{cursor:pointer;font-size:.85rem;font-weight:550}' +
    'pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.55 ui-monospace,Consolas,monospace;background:#f5f5ef;padding:.8rem;max-height:560px;overflow:auto}' +
    '.sources{border-top:2px solid #373730;margin-top:3rem;padding-top:1.3rem}.source{border:1px solid #d6d6cc;margin-top:1rem;padding:1rem 1.2rem;scroll-margin-top:1rem}' +
    'footer{margin-top:2.5rem;padding-top:1rem;border-top:1px solid #ccc;color:#66665c;font-size:.76rem}' +
    '@media(max-width:700px){main{padding:1.3rem 1rem}.fields{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}.stat:nth-child(2){border-right:0}.stat:nth-child(n+3){border-top:1px solid #cdcdc3}.edition,.review,.source{padding:.8rem}h1{font-size:1.6rem}h2{font-size:1.25rem}}' +
    '@media print{body{background:#fff}main{max-width:none;padding:0}.contents{break-after:page}.procedure{break-before:page}.edition,.review,.fields{break-inside:avoid}table{font-size:9px}thead{display:table-header-group}tr{break-inside:avoid}pre{max-height:none;font-size:9px}a{text-decoration:none}.original:not([open]){display:none}}' +
    '</style></head><body><main><header><div class="eyebrow">Procurement desk · Retained workspace report</div><h1>' +
    html(title) + '</h1><p class="meta">Workspace ' + html(display(payload.workspace.id)) +
    ' · revision ' + html(display(payload.workspace.revision)) + ' · exported ' +
    html(display(payload.exportedAt)) + '</p></header><section class="stats" aria-label="Report totals">' +
    [[payload.projects.length,'Procedures'],[payload.entries.length,'Detailed editions'],
      [payload.sources.length,'Original sources'],[shortlisted,'Shortlisted']].map(([count,name]) =>
        '<div class="stat"><strong>' + count + '</strong><span>' + name + '</span></div>').join('') +
    '</section><nav class="contents" aria-label="Report contents"><h3>Procedures</h3><ol>' +
    contents + '</ol><a href="#sources">Original source packages</a></nav>' + body +
    '<section class="sources" id="sources"><h2>Original source packages</h2>' + originals + '</section>' +
    rawDetails('Complete exported workspace data', payload) +
    '<footer>Source IDs, OCIDs, release IDs and source pointers connect the review to its retained publications. Open an original-data section to inspect every field and extension.</footer>' +
    '</main></body></html>\n';
}

/** Render the complete selected export payload; no source or row sampling is applied. */
export function renderReport(payload, { format = 'html' } = {}) {
  if (!payload || typeof payload !== 'object' || !payload.workspace ||
      !Array.isArray(payload.projects) || !Array.isArray(payload.sources) || !Array.isArray(payload.entries))
    fail('OCDS_REPORT_PAYLOAD_INVALID', 'A report needs a workspace, selected projects, sources and retained entries.');
  if (!own(MIME, format))
    fail('OCDS_REPORT_FORMAT_UNSUPPORTED', 'Choose json, csv or html for the procurement export.');
  const workspaceId = String(payload.workspace.id || 'workspace').replace(/[^A-Za-z0-9._-]/g, '_');
  const body = format === 'json' ? json(payload) + '\n'
    : format === 'csv' ? csvReport(payload) : htmlReport(payload);
  return { mime: MIME[format], filename: 'procurement-' + workspaceId + '.' + format, body };
}
