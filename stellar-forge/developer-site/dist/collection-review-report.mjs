/** Portable collection review report. Pure HTML/print; no network or embedded media. */
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = value => escapeHtml(value).replace(/\r\n?|\n/g, '<br>');
const list = value => value == null || value === '' ? [] : Array.isArray(value) ? value : [value];
const humanTime = value => {
  if (!value || !Number.isFinite(Date.parse(value))) return value ? String(value) : 'Not recorded';
  return new Intl.DateTimeFormat('en-US', {year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true, timeZone:'UTC'}).format(new Date(value)) + ' UTC';
};
function safeUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\<>"']/.test(value)) return null;
  const matched = /^(https?):\/\/([^/?#]+)(?:[/?#]|$)/i.exec(value);
  return matched && matched[2] && !matched[2].includes('@') ? value : null;
}
function sourceLink(value, label = value) {
  const url = safeUrl(value);
  return url ? '<a href="' + escapeHtml(url) + '" rel="noreferrer">' + escapeHtml(label) + '</a>' :
    '<span>' + escapeHtml(label || 'No source link recorded') + '</span>';
}
const REVIEW = {unreviewed:'Not reviewed',include:'Include',exclude:'Exclude','needs-info':'Needs information'};
const RIGHTS = {unknown:'Rights not recorded','metadata-only':'Metadata only','permission-recorded':'Permission basis recorded by operator',restricted:'Restricted'};
const field = (label, value) => '<div class="field"><dt>' + escapeHtml(label) + '</dt><dd>' + value + '</dd></div>';
const paragraph = (label, value) => value == null || value === '' ? '' : '<div class="note"><h4>' + escapeHtml(label) + '</h4><p>' + text(value) + '</p></div>';
const tags = value => list(value).length ? '<ul class="inline-list">' + list(value).map(v => '<li>' + escapeHtml(v) + '</li>').join('') + '</ul>' : '<span class="muted">Not recorded</span>';
function rightsSection(rights) {
  const r = rights || {};
  return '<dl class="metadata">' + field('Rights and access', escapeHtml(RIGHTS[r.status || 'unknown'] || String(r.status))) +
    (r.basis ? field('Recorded basis', text(r.basis)) : '') +
    (r.citation ? field('Rights citation', sourceLink(r.citation)) : '') + '</dl>';
}
function check(report) {
  if (!report || report.schema !== 'stellar-forge.collection-review-report.v1' || !Array.isArray(report.collections))
    throw new TypeError('Choose a complete collection review report.');
  const all = new Map(), collections = new Set();
  report.collections.forEach((collection, ci) => {
    if (!collection || typeof collection.id !== 'string' || !collection.id || collections.has(collection.id) || !Array.isArray(collection.entries))
      throw new TypeError('Keep each original collection identity and its ordered entries.');
    collections.add(collection.id);
    collection.entries.forEach((entry, ei) => {
      if (!entry || typeof entry.id !== 'string' || !entry.id || all.has(entry.id) || typeof entry.title !== 'string')
        throw new TypeError('Keep each original occurrence identity and source title.');
      if (!Number.isSafeInteger(entry.ordinal) || entry.ordinal < 1)
        throw new TypeError('Keep the original positive occurrence ordinal.');
      const status = entry.review?.status || 'unreviewed', rights = entry.review?.rights?.status || 'unknown';
      if (!Object.hasOwn(REVIEW, status) || !Object.hasOwn(RIGHTS, rights))
        throw new TypeError('Keep the original supported review and rights state.');
      all.set(entry.id, {entry, collection, anchor:'record-' + (ci + 1) + '-' + (ei + 1)});
    });
  });
  const order = report.story?.order || [];
  if (!Array.isArray(order) || new Set(order).size !== order.length || order.some(id => !all.has(id)))
    throw new TypeError('Keep a unique story selection of retained original occurrences.');
  const relationships = report.relationships || [];
  if (!Array.isArray(relationships) || relationships.some(r => !r || !all.has(r.from) || !all.has(r.to)))
    throw new TypeError('Every editorial relationship must identify two retained occurrences.');
  return {all, order, relationships};
}
function originalRecord(held) {
  const {entry:e, collection:c, anchor} = held, review=e.review || {}, locator=e.sourceLocator || {};
  const location = Number.isSafeInteger(locator.start) && Number.isSafeInteger(locator.end)
    ? String(locator.start) + '–' + String(locator.end) : 'Not recorded';
  const proposedTitle = review.suggestedTitle
    ? paragraph('Editorial title proposal', review.suggestedTitle) : '';
  return '<article class="entry" id="' + anchor + '"><div class="entry-top"><span class="ordinal">Entry ' +
    escapeHtml(e.ordinal) + '</span><span class="status">' + escapeHtml(REVIEW[review.status || 'unreviewed']) +
    '</span></div><h3>' + escapeHtml(e.title) + '</h3><p class="source-link">' +
    sourceLink(e.url, e.url || 'No item link recorded') + '</p>' + proposedTitle +
    paragraph('Editorial summary proposal', review.summary) + paragraph('Review note', review.note) +
    rightsSection(review.rights) + '<p class="record-reference"><span>Occurrence ' + escapeHtml(e.id) +
    '</span><span>UTF-8 byte range (end exclusive): ' + escapeHtml(location) + '</span><span>' +
    sourceLink(c.source?.url, 'Institution source') + '</span></p></article>';
}
function institutionSection(collection, index, all) {
  const i=collection.institution || {}, s=collection.source || {};
  const rows=collection.entries.map(e => originalRecord(all.get(e.id))).join('');
  return '<section class="institution" id="institution-' + (index + 1) + '"><div class="section-title"><p class="eyebrow">Institution review</p><h2>' +
    escapeHtml(i.title || collection.id) + '</h2><p>' + collection.entries.length.toLocaleString('en-US') +
    ' retained entries in original source order</p></div>' + paragraph('Institution description from source', i.description) +
    '<dl class="metadata">' + field('Address from source', i.address ? text(i.address) : '<span class="muted">Not recorded</span>') +
    field('Topics from source', tags(i.topics)) + field('Characteristics from source', tags(i.characteristics)) +
    field('Original page', sourceLink(s.url)) + field('Source observed', escapeHtml(humanTime(s.observedAt))) +
    field('Retained source file', escapeHtml(s.filename || 'Not recorded')) + '</dl>' +
    (rows || '<p class="empty">This retained institution source has no entries in this workspace.</p>') + '</section>';
}
function storySection(report, checked) {
  const story=report.story || {}, {all,order}=checked;
  const entries=order.map((id,index) => {
    const {entry:e,collection:c,anchor}=all.get(id), review=e.review || {};
    return '<li class="story-entry"><p class="eyebrow">Selection ' + (index + 1) + ' · ' + escapeHtml(c.institution?.title || c.id) +
      ' · Original entry ' + escapeHtml(e.ordinal) + '</p><h3>' + escapeHtml(review.suggestedTitle || e.title) +
      '</h3>' + (review.suggestedTitle ? '<p class="muted">Editorial title proposal. Original title: ' + escapeHtml(e.title) + '</p>' : '') +
      '<p class="status-line">' + escapeHtml(REVIEW[review.status || 'unreviewed']) + ' · ' +
      escapeHtml(RIGHTS[review.rights?.status || 'unknown']) + '</p>' +
      paragraph('Editorial summary proposal', review.summary) +
      '<p>' + sourceLink(e.url, 'Open original item or finding aid') + ' · <a href="#' + anchor +
      '">Review this retained record</a></p></li>';
  }).join('');
  return '<section class="story" id="story"><div class="section-title"><p class="eyebrow">Selected story · editorial review</p><h2>' +
    escapeHtml(story.title || 'Story selection') + '</h2><p>The sequence below follows the saved editorial selection. Inclusion in this review does not establish publication or reproduction permission.</p></div>' +
    paragraph('Editorial introduction proposal', story.introduction) +
    (entries ? '<ol class="story-list">' + entries + '</ol>' : '<p class="empty">No records have been selected for a story in this edition.</p>') +
    paragraph('Story review note', story.note) + '</section>';
}
function relationshipSection(relationships, all) {
  if (!relationships.length) return '<section id="relationships"><h2>Editorial relationships</h2><p class="empty">No relationships are recorded in this edition.</p></section>';
  const label = id => {const h=all.get(id);return '<a href="#' + h.anchor + '">' + escapeHtml(h.entry.title) +
    '</a><span class="table-context">' + escapeHtml(h.collection.institution?.title || h.collection.id) +
    ' · Entry ' + escapeHtml(h.entry.ordinal) + '</span>';};
  return '<section id="relationships"><h2>Editorial relationships</h2><p>These are editor-recorded proposals between retained occurrences. They are separate from the original catalogue descriptions.</p>' +
    '<div class="table-wrap"><table><thead><tr><th scope="col">From</th><th scope="col">Proposed relationship</th><th scope="col">To</th></tr></thead><tbody>' +
    relationships.map(r => '<tr><td>' + label(r.from) + '</td><td><strong>' + escapeHtml(r.kind || 'Relationship') +
      '</strong>' + (r.note ? '<p>' + text(r.note) + '</p>' : '') + '</td><td>' + label(r.to) +
      '</td></tr>').join('') + '</tbody></table></div></section>';
}
function sourceAppendix(report) {
  return '<section class="source-appendix" id="sources"><h2>Source and edition references</h2><p>The complete working package carries the original source files and editable project. This report is a readable projection of that edition; the source locations and identifiers below retain the connection to those originals.</p>' +
    '<dl class="metadata">' + field('Workspace', escapeHtml(report.workspace?.id || 'Not recorded')) +
    field('Edition', escapeHtml(report.revision?.id || 'Not recorded')) +
    field('Parent edition', escapeHtml(report.revision?.parentId || 'First retained edition')) +
    field('Prepared by', escapeHtml(report.revision?.actor || 'Not recorded')) +
    field('Edition created', escapeHtml(humanTime(report.revision?.createdAt))) + '</dl>' +
    paragraph('Edition note', report.revision?.note) +
    '<ol class="source-list">' + report.collections.map(c => '<li><h3>' + escapeHtml(c.institution?.title || c.id) +
      '</h3><p>' + sourceLink(c.source?.url) + '</p><p>File: <code>' + escapeHtml(c.source?.filename || 'Not recorded') +
      '</code></p><p>SHA-256: <code>' + escapeHtml(c.source?.sha256 || 'Not recorded') +
      '</code></p><p>Collection reference: <code>' + escapeHtml(c.id) + '</code></p></li>').join('') + '</ol></section>';
}
const CSS = `
:root{color-scheme:light;font-family:Arial,Helvetica,sans-serif;color:#181818;background:#eee;font-size:16px}
*{box-sizing:border-box}body{margin:0;line-height:1.5}main{max-width:1120px;margin:24px auto;background:#fff;padding:44px 52px;border:1px solid #bbb}
h1,h2,h3,h4,p,dl,ol,ul{margin-top:0}h1{font-size:2rem;line-height:1.2;margin-bottom:12px}h2{font-size:1.45rem;line-height:1.3;margin-bottom:12px}
h3{font-size:1.08rem;line-height:1.4;margin-bottom:8px}h4{font-size:.85rem;line-height:1.4;margin-bottom:4px}
p,li,dd,td,th,a,code{overflow-wrap:anywhere}a{color:inherit;text-decoration:underline;text-underline-offset:.15em}a:focus-visible{outline:2px solid #111;outline-offset:3px}
header{border-bottom:2px solid #222;padding-bottom:24px;margin-bottom:28px}.eyebrow{font-size:.76rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:#555;margin-bottom:8px}
.lede{max-width:82ch}.muted,.record-reference,.table-context{color:#555}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:22px 0 16px;padding:16px 0;border-top:1px solid #ccc;border-bottom:1px solid #ccc}
.summary div{min-width:0}.summary dt{font-size:.8rem;color:#555}.summary dd{margin:2px 0 0;font-size:1.4rem;font-weight:700}
nav{padding:0 0 28px}nav h2{font-size:1rem}nav ul{display:flex;flex-wrap:wrap;gap:6px 24px;padding-left:20px;margin-bottom:0}
section{margin-top:36px}.section-title{padding-bottom:10px;border-bottom:1px solid #999;margin-bottom:20px}.section-title p:last-child{margin-bottom:0}
.metadata{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 24px;margin-bottom:20px}
.field{min-width:0}.field dt{font-size:.8rem;font-weight:700;color:#555;margin-bottom:3px}.field dd{margin:0}
.inline-list{display:flex;flex-wrap:wrap;gap:3px 15px;padding-left:18px;margin:0}
.entry{padding:20px 0;border-top:1px solid #ddd}.entry-top{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;font-size:.8rem}
.ordinal{font-weight:700}.status{border:1px solid #aaa;padding:1px 8px}.source-link{font-size:.85rem;margin-bottom:14px}
.note{margin-bottom:16px}.note p:last-child{margin-bottom:0}.record-reference{display:flex;flex-wrap:wrap;gap:5px 18px;font-size:.72rem;margin-bottom:0}
.story-list{list-style:none;padding:0;counter-reset:story}.story-entry{padding:18px 0;border-top:1px solid #ddd}
.status-line{font-size:.83rem}.empty{padding:14px;border:1px solid #ddd}.table-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{text-align:left;vertical-align:top;padding:12px;border:1px solid #bbb}th{font-size:.85rem;background:#f2f2f2}
.table-context{display:block;margin-top:5px;font-size:.75rem}td p{margin:8px 0 0}.source-list{padding-left:22px}.source-list>li{padding:12px 0}code{font-size:.8rem}
footer{border-top:1px solid #aaa;margin-top:32px;padding-top:14px;font-size:.78rem;color:#555}
@media(max-width:700px){main{margin:0;padding:24px 18px;border:0}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.metadata{grid-template-columns:1fr}h1{font-size:1.65rem}th,td{padding:8px;font-size:.85rem}}
@media print{@page{size:A4;margin:16mm}html,body{background:#fff;font-size:10pt}main{border:0;margin:0;padding:0;max-width:none}nav{display:none}h1{font-size:21pt}h2{font-size:15pt}h3{font-size:11pt}h1,h2,h3,h4{break-after:avoid}.section-title{break-inside:avoid}.institution,.story,.source-appendix{break-before:page}.entry,.story-entry{break-inside:avoid}.metadata{grid-template-columns:repeat(2,minmax(0,1fr))}.table-wrap{overflow:visible}thead{display:table-header-group}tr{break-inside:avoid}.summary{grid-template-columns:repeat(4,minmax(0,1fr))}a{text-decoration:underline}footer{font-size:8pt}}
`;
/** Render a complete report projection supplied by the collection workspace. */
export function renderCollectionReview(report) {
  const checked=check(report), entries=[...checked.all.values()].map(x=>x.entry);
  const reviewed=entries.filter(e=>(e.review?.status || 'unreviewed')!=='unreviewed').length;
  const title=report.workspace?.name || 'Collection review';
  const summary=(label,value)=>'<div><dt>'+escapeHtml(label)+'</dt><dd>'+value.toLocaleString('en-US')+'</dd></div>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="referrer" content="no-referrer"><title>' + escapeHtml(title) + ' — Collection review</title><style>' + CSS +
    '</style></head><body><main><header><p class="eyebrow">Collection review · working edition</p><h1>' + escapeHtml(title) +
    '</h1><p class="lede">Original institution records, editorial review and selected story order in one portable report. Titles and dates in the institution review preserve the original source wording. Editorial proposals are identified separately.</p>' +
    '<dl class="summary">' + summary('Institution sources',report.collections.length) + summary('Retained entries',entries.length) +
    summary('Entries reviewed',reviewed) + summary('Story selections',checked.order.length) +
    '</dl><p class="muted">Entry counts describe this retained edition and may include repeated links. They are not a count of unique digitized objects.</p></header>' +
    '<nav aria-label="Report sections"><h2>In this report</h2><ul>' +
    report.collections.map((c,i)=>'<li><a href="#institution-'+(i+1)+'">'+escapeHtml(c.institution?.title || c.id)+'</a></li>').join('') +
    '<li><a href="#story">Selected story</a></li><li><a href="#relationships">Editorial relationships</a></li><li><a href="#sources">Source references</a></li></ul></nav>' +
    report.collections.map((c,i)=>institutionSection(c,i,checked.all)).join('') + storySection(report,checked) +
    relationshipSection(checked.relationships,checked.all) + sourceAppendix(report) +
    '<footer>Metadata and links only. Operator-recorded rights statements are shown with their recorded basis; this report does not independently establish permission to reproduce media. The workflow is a proposed integration capability and does not identify an institution\'s selected procurement system.</footer>' +
    '</main></body></html>';
}
