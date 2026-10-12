// MIT. Multi-award workshares over the original AwardTransactions capture format.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const SCHEMA = 'usaspending-workshare-portfolio.v1';
const CAPTURE_SCHEMA = 'usaspending-award-transactions-v1.capture';
const fail = (ok, code, message = code) => { if (!ok) throw Object.assign(new Error(message), {code, status: 400}); };
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (plain(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  fail(value !== undefined && (typeof value !== 'number' || Number.isFinite(value)), 'PORTFOLIO_VALUE_INVALID');
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
const clone = value => JSON.parse(canonical(value));
const seal = value => ({...value, sha256: digest(value)});
function verify(value, schema) {
  fail(plain(value) && value.schema === schema, 'PORTFOLIO_SCHEMA_INVALID');
  const {sha256, ...body} = value;
  fail(typeof sha256 === 'string' && digest(body) === sha256, 'PORTFOLIO_DIGEST_MISMATCH');
  return body;
}
// The source projection supplies plain decimal strings. No monetary Number conversion.
export function addMoney(values) {
  if (values.some(v => v === null)) return null;
  const parts = values.map(value => {
    fail(typeof value === 'string' && value.length <= 4096 && /^-?\d+(?:\.\d+)?$/.test(value), 'PORTFOLIO_DECIMAL_INVALID');
    const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
    return {negative: value[0] === '-', whole, fraction};
  });
  const scale = parts.reduce((n, p) => Math.max(n, p.fraction.length), 0);
  const total = parts.reduce((n, p) => n + (p.negative ? -1n : 1n) * BigInt(p.whole + p.fraction.padEnd(scale, '0')), 0n);
  let s = (total < 0n ? -total : total).toString().padStart(scale + 1, '0');
  if (scale) s = (s.slice(0, -scale) + '.' + s.slice(-scale)).replace(/0+$/, '').replace(/\.$/, '');
  return (total < 0n ? '-' : '') + s;
}
function uniqueStrings(values, name) {
  fail(Array.isArray(values) && values.length > 0 && values.every(v => typeof v === 'string' && v.length > 0), 'PORTFOLIO_' + name + '_INVALID');
  fail(new Set(values).size === values.length, 'PORTFOLIO_DUPLICATE_' + name);
  return values;
}
function totals(items) {
  const allComplete = items.every(x => x.complete && x.netObligationUsd !== null);
  return {awards: items.length, completeAwards: items.filter(x => x.complete).length,
    transactions: items.reduce((n, x) => n + x.transactions, 0),
    capturedNetObligationUsd: addMoney(items.map(x => x.netObligationUsd)),
    completeNetObligationUsd: allComplete ? addMoney(items.map(x => x.netObligationUsd)) : null,
    knownNetObligationUsd: addMoney(items.map(x => x.knownNetObligationUsd)),
    incompleteAwardKeys: items.filter(x => !x.complete).map(x => x.awardKey),
    unresolvedAwardKeys: items.filter(x => x.netObligationUsd === null).map(x => x.awardKey)};
}
function group(items, field) {
  const groups = new Map();
  for (const item of items) { const key = item[field] || '(unspecified)'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, rows]) => ({name, ...totals(rows)}));
}
function projectedAnalysis(capture) {
  const byId = new Map(), conflicts = new Set();
  for (const row of capture.rows) {
    fail(plain(row) && typeof row.transaction_id === 'string' && row.award_key === capture.awardKey && typeof row.row_sha256 === 'string', 'PORTFOLIO_TRANSACTION_INVALID');
    const prior = byId.get(row.transaction_id);
    if (!prior) byId.set(row.transaction_id, row);
    else if (prior.row_sha256 !== row.row_sha256) conflicts.add(row.transaction_id);
  }
  const rows = [...byId.values()].sort((a,b) => a.action_date.localeCompare(b.action_date) || a.transaction_id.localeCompare(b.transaction_id));
  const amounts = rows.filter(row => !conflicts.has(row.transaction_id)).map(row => row.federal_action_obligation);
  return {unique_transactions: rows.length, net_obligation_usd: conflicts.size ? null : addMoney(amounts),
    known_net_obligation_usd: addMoney(amounts.filter(value => value !== null)),
    first_action_date: rows[0]?.action_date ?? null, last_action_date: rows.at(-1)?.action_date ?? null};
}
function memberRow(member) {
  const {capture: p, award, analysis: a} = member;
  return {captureId: p.captureId, awardKey: p.awardKey, editionId: p.awardEditionId,
    recipient: award.recipient_name ?? '', agency: award.awarding_agency ?? '', naics: award.naics ?? '',
    description: award.description ?? '', sourceUrl: award.source_url ?? '',
    complete: p.coverage.complete, pages: p.coverage.pages, transactions: a.unique_transactions,
    netObligationUsd: a.net_obligation_usd, knownNetObligationUsd: a.known_net_obligation_usd,
    firstActionDate: a.first_action_date, lastActionDate: a.last_action_date,
    reviewStatus: p.review?.data?.status ?? 'unreviewed', reviewRevision: p.review?.revision ?? 0,
    owner: p.review?.data?.owner ?? '', workshare: p.review?.data?.proposedWorkshare ?? '',
    captureSha256: p.sha256, sourceFingerprint: p.coverage.fingerprint};
}
export function viewPortfolio(packet, {search = '', agency = '', recipient = '', status = ''} = {}) {
  validatePortfolio(packet);
  for (const v of [search, agency, recipient, status]) fail(typeof v === 'string', 'PORTFOLIO_FILTER_INVALID');
  const needle = search.toLocaleLowerCase();
  const rows = packet.members.map(memberRow).filter(r => (!agency || r.agency === agency) && (!recipient || r.recipient === recipient) && (!status || r.reviewStatus === status) && (!needle || [r.awardKey, r.recipient, r.agency, r.description, r.workshare, r.owner, r.naics].join('\n').toLocaleLowerCase().includes(needle)));
  return {schema: SCHEMA + '.view', title: packet.title, createdAt: packet.createdAt, sha256: packet.sha256,
    selection: packet.selection, rows, totals: totals(rows), byAgency: group(rows, 'agency'), byRecipient: group(rows, 'recipient')};
}
export function validatePortfolio(packet) {
  verify(packet, SCHEMA);
  fail(typeof packet.title === 'string' && packet.title.length <= 500 && typeof packet.createdAt === 'string' && Number.isFinite(Date.parse(packet.createdAt)), 'PORTFOLIO_METADATA_INVALID');
  fail(typeof packet.includeReviews === 'boolean' && Array.isArray(packet.members) && packet.members.length > 0, 'PORTFOLIO_MEMBERS_REQUIRED');
  uniqueStrings(packet.members.map(m => m.capture?.captureId), 'CAPTURE_IDS');
  uniqueStrings(packet.members.map(m => m.capture?.awardKey), 'AWARD_KEYS');
  for (const m of packet.members) {
    verify(m.capture, CAPTURE_SCHEMA);
    const p = m.capture;
    fail(plain(m.award) && m.award.row_sha256 === p.awardRowSha256 && m.award.award_key === p.awardKey, 'PORTFOLIO_AWARD_BINDING_MISMATCH');
    fail(plain(p.coverage) && typeof p.coverage.complete === 'boolean' && Array.isArray(p.rows) && Array.isArray(p.pages) && p.coverage.pages === p.pages.length && p.coverage.occurrences === p.rows.length, 'PORTFOLIO_CAPTURE_INVALID');
    fail(plain(m.analysis) && Number.isSafeInteger(m.analysis.unique_transactions) && m.analysis.unique_transactions >= 0 && m.analysis.unique_transactions <= p.rows.length, 'PORTFOLIO_ANALYSIS_INVALID');
    const projected = projectedAnalysis(p);
    fail(canonical(projected) === canonical(Object.fromEntries(Object.keys(projected).map(key => [key,m.analysis[key]]))), 'PORTFOLIO_ANALYSIS_BINDING_MISMATCH');
    fail(packet.includeReviews || !p.review, 'PORTFOLIO_UNEXPECTED_PRIVATE_REVIEW');
    if (p.review) fail(p.review.capture_id === p.captureId && p.review.data?.sourceFingerprint === p.coverage.fingerprint && p.review.data?.awardKey === p.awardKey, 'PORTFOLIO_REVIEW_BINDING_MISMATCH');
  }
  return packet;
}
/** Select one explicit capture per award, or the latest complete capture per award.
 * Every alternative remains in selection.alternatives. No source capture is changed.
 */
export function buildPortfolio(transactions, {captureIds, title = 'Federal award workshares', includeReviews = false} = {}) {
  fail(transactions && ['state', 'capture', 'summary', 'export'].every(k => typeof transactions[k] === 'function'), 'PORTFOLIO_STORE_REQUIRED');
  const available = transactions.state().captures, availableById = new Map(available.map(c => [c.id, c]));
  let selected;
  if (captureIds !== undefined) selected = uniqueStrings(captureIds, 'CAPTURE_IDS').map(id => { fail(availableById.has(id), 'PORTFOLIO_CAPTURE_NOT_FOUND', id); return id; });
  else {
    const ordered = [...available].sort((a, b) => Number(b.status === 'complete') - Number(a.status === 'complete') || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
    const byAward = new Map(); for (const c of ordered) if (!byAward.has(c.award_key)) byAward.set(c.award_key, c.id);
    selected = [...byAward.values()];
    fail(selected.length > 0, 'PORTFOLIO_NO_CAPTURES', 'Import or capture award transactions in the original workspace first.');
  }
  const members = selected.map(captureId => {
    // export owns its original SQLite transaction; do not nest another BEGIN.
    const p = transactions.export(captureId, {includeReview: includeReviews});
    const {capture: c, analysis} = transactions.summary(captureId);
    fail(c.award_key === p.awardKey && c.fingerprint === p.coverage.fingerprint && c.page_count === p.coverage.pages && c.row_count === p.rows.length, 'PORTFOLIO_CAPTURE_CHANGED', 'Refresh the portfolio after the active source capture advances.');
    const {timeline, ...retainedAnalysis} = analysis;
    return {capture: p, award: c.award_row, analysis: retainedAnalysis};
  });
  uniqueStrings(members.map(m => m.capture.awardKey), 'AWARD_KEYS');
  const selectedSet = new Set(selected);
  const packet = seal({schema: SCHEMA, title, createdAt: new Date().toISOString(), includeReviews,
    selection: {mode: captureIds === undefined ? 'latest_complete_else_latest' : 'explicit', captureIds: selected,
      alternatives: available.filter(c => !selectedSet.has(c.id)).map(c => ({captureId: c.id, awardKey: c.award_key, status: c.status, updatedAt: c.updated_at}))}, members});
  validatePortfolio(packet); return clone(packet);
}
const CSV_COLUMNS = ['captureId','awardKey','editionId','recipient','agency','naics','complete','pages','transactions','netObligationUsd','knownNetObligationUsd','reviewStatus','reviewRevision','owner','workshare','sourceUrl','captureSha256'];
export function portfolioCsv(packet, options = {}) {
  const cell = value => { let s = value === null ? '' : String(value); if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [CSV_COLUMNS.join(','), ...viewPortfolio(packet, options).rows.map(row => CSV_COLUMNS.map(k => cell(row[k])).join(','))].join('\r\n') + '\r\n';
}
export function portfolioBrief(packet, options = {}) {
  const membersById = new Map(packet.members.map(m => [m.capture.captureId, m]));
  const view = viewPortfolio(packet, options), show = value => value === null ? 'Unknown' : value;
  const text = value => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/[\\`*_[\]<>#|]/g, '\\$&');
  const out = ['# ' + text(packet.title), '', 'Created: ' + packet.createdAt, '', 'Awards: ' + view.totals.awards + ' · complete histories: ' + view.totals.completeAwards,
    'Complete-history net obligations (USD): ' + show(view.totals.completeNetObligationUsd), 'Known captured obligations (USD): ' + show(view.totals.knownNetObligationUsd), '',
    'Amounts describe retained federal funding observations, not revenue available to the operator.', ''];
  for (const row of view.rows) {
    const member = membersById.get(row.captureId), review = member.capture.review?.data;
    out.push('## ' + text(row.recipient || row.awardKey), '', '**Award:** ' + text(row.awardKey), '**Agency:** ' + text(row.agency),
      '**Capture:** ' + text(row.captureId) + ' · ' + (row.complete ? 'complete' : 'partial') + ' · ' + row.transactions + ' transactions',
      '**Captured net obligation (USD):** ' + show(row.netObligationUsd), '**Source fingerprint:** ' + (row.sourceFingerprint ?? 'Capture in progress'), '');
    if (review) for (const [label, key] of [['Fit','fit'],['Proposed workshare','proposedWorkshare'],['Deliverables','deliverables'],['Acceptance','acceptance'],['Owner','owner'],['Next action','nextAction'],['Notes','notes']]) if (review[key]) out.push('### ' + label, '', review[key], '');
    out.push('### Retained sources', '');
    for (const page of member.capture.pages) out.push('- ' + text(page.receipt?.request?.url ?? '') + ' · page ' + page.request.page + ' · ' + text(page.receipt?.finishedAt ?? '') + ' · SHA-256 ' + text(page.receipt?.sha256 ?? ''));
    out.push('');
  }
  return out.join('\n') + '\n';
}
async function atomicJson(path, value) {
  const tmp = path + '.' + process.pid + '.' + Date.now() + '.tmp';
  try { await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', {flag: 'wx', mode: 0o600}); await rename(tmp, path); }
  finally { await unlink(tmp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}
export async function exportPortfolioDirectory(packet, directory) {
  validatePortfolio(packet); const target = resolve(directory);
  try { await lstat(target); throw Object.assign(new Error('Export destination already exists'), {code:'EEXIST'}); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const root = target + '.partial-' + process.pid + '-' + Date.now();
  await mkdir(root, {mode: 0o700}); // create-only: never mix a previous delivery with this one
  await mkdir(join(root, 'captures'), {mode: 0o700});
  const files = [];
  async function put(path, content) { const bytes = Buffer.from(content); await writeFile(join(root, path), bytes, {flag: 'wx', mode: 0o600}); files.push({path, bytes: bytes.length, sha256: digest(bytes)}); }
  await put('portfolio.json', JSON.stringify(packet, null, 2) + '\n');
  await put('awards.csv', portfolioCsv(packet)); await put('workshares.md', portfolioBrief(packet));
  for (let i = 0; i < packet.members.length; i++) await put('captures/' + String(i + 1).padStart(6, '0') + '.json', JSON.stringify(packet.members[i].capture, null, 2) + '\n');
  await put('view.json', JSON.stringify(viewPortfolio(packet), null, 2) + '\n');
  await writeFile(join(root, 'manifest.json'), JSON.stringify(seal({schema: SCHEMA + '.directory', portfolioSha256: packet.sha256, files}), null, 2) + '\n', {flag: 'wx', mode: 0o600});
  await rename(root, target);
  return {directory: target, portfolioSha256: packet.sha256, captures: packet.members.length, files: files.length + 1};
}
/** Resume is portable source replay, not a new provider request. The original
 * receive() owns award matching, source-page validation and assessment conflicts.
 */
export async function receivePortfolio(transactions, packet, {journalPath, workspaceId, editionMap = {}, includeReviews = false} = {}) {
  validatePortfolio(packet);
  fail(typeof journalPath === 'string' && typeof workspaceId === 'string' && workspaceId.length > 0, 'PORTFOLIO_RECEIVING_LOCATION_REQUIRED');
  fail(typeof transactions.receive === 'function', 'PORTFOLIO_RECEIVER_REQUIRED');
  fail(plain(editionMap) && Object.values(editionMap).every(x => typeof x === 'string'), 'PORTFOLIO_EDITION_MAP_INVALID');
  const path = resolve(journalPath), plan = {portfolioSha256: packet.sha256, workspaceId, editionMap, includeReviews};
  let journal;
  try { journal = JSON.parse(await readFile(path, 'utf8')); fail(journal.schema === SCHEMA + '.receiving' && canonical(journal.plan) === canonical(plan), 'PORTFOLIO_RECEIVING_PLAN_CHANGED'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; journal = {schema: SCHEMA + '.receiving', plan, results: {}, complete: false}; await atomicJson(path, journal); }
  for (const member of packet.members) {
    const p = member.capture;
    // Replay even completed entries: the original receiver detects changed reviews
    // or a restored target DB and returns its deterministic target capture identity.
    try {
      const result = transactions.receive(p, {includeReview: includeReviews, ...(editionMap[p.awardEditionId] ? {editionId: editionMap[p.awardEditionId]} : {})});
      journal.results[p.captureId] = {sourceSha256: p.sha256, result, completedAt: new Date().toISOString()};
      delete journal.error; await atomicJson(path, journal);
    } catch (error) { journal.complete = false; journal.error = {captureId: p.captureId, code: error.code ?? 'RECEIVE_FAILED', message: error.message}; await atomicJson(path, journal); throw Object.assign(error, {journalPath: path, completedCaptures: Object.keys(journal.results).length}); }
  }
  journal.complete = true; journal.finishedAt = new Date().toISOString(); await atomicJson(path, journal); return journal;
}
