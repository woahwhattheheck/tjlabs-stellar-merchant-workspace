// MIT. Original FRED release calendars and series vintage history.
import { createHash } from 'node:crypto';
import { FRED_NOTICE, FRED_TERMS, FRED_ORIGIN, MAX_CAPTURE_BYTES, MAX_PAGE_BYTES,
  canonical, clone, date, need, plain, utf8Length, normalizeSelection, fredRequest, readSeriesMetadata } from '../model.mjs';

export const FRED_RELEASE_SELECTION = 'stellar-forge.fred-release-selection.v1';
export const FRED_RELEASE_CAPTURE = 'stellar-forge.fred-release-capture.v1';
export const FRED_RELEASE_MODEL = 'stellar-forge.fred-release-model.v1';
export const FRED_RELEASE_CALENDAR_NOTICE = 'Release dates are dates published by the source and do not necessarily equal when data is available on FRED or ALFRED.';
export const releaseHash = value => createHash('sha256').update(value).digest('hex');
export const releaseDigest = value => releaseHash(canonical(value));
const same = (a, b) => canonical(a) === canonical(b);
const keys = (value, allowed, label) => need(plain(value) && Object.keys(value).every(key => allowed.includes(key)), 'Unknown ' + label + ' setting.');
const intervalDate = (value, label) => {
  const result = date(value, label);
  need(result >= '1776-07-04', label + ' must be within the FRED date range.');
  return result;
};
export function normalizeFredReleaseSelection(input) {
  keys(input, ['schema', 'series', 'asOf', 'calendarStart', 'calendarEnd', 'vintageStart', 'vintageEnd', 'pageSize', 'maxRows'], 'release selection');
  need(input.schema === undefined || input.schema === FRED_RELEASE_SELECTION, 'Unknown release selection schema.');
  const series = normalizeSelection({ series: input.series, asOf: input.asOf, start: input.asOf, end: input.asOf }).series;
  const value = { schema: FRED_RELEASE_SELECTION, series, asOf: intervalDate(input.asOf, 'Metadata date'),
    calendarStart: intervalDate(input.calendarStart, 'Calendar start'), calendarEnd: intervalDate(input.calendarEnd, 'Calendar end'),
    vintageStart: intervalDate(input.vintageStart, 'Vintage start'), vintageEnd: intervalDate(input.vintageEnd, 'Vintage end'),
    pageSize: input.pageSize ?? 1000, maxRows: input.maxRows ?? 100000 };
  need(value.calendarStart <= value.calendarEnd && value.vintageStart <= value.vintageEnd && value.vintageEnd <= value.asOf,
    'Order both source intervals and keep the vintage end at or before the metadata date.');
  need(Number.isSafeInteger(value.pageSize) && value.pageSize >= 1 && value.pageSize <= 10000,
    'Release and vintage page size must be from 1 to 10000.');
  need(Number.isSafeInteger(value.maxRows) && value.maxRows >= 1 && value.maxRows <= 1000000,
    'Combined release and vintage row capacity must be from 1 to 1000000.');
  return value;
}
function metadataSelection(selection) {
  return normalizeSelection({ series: selection.series, asOf: selection.asOf, start: selection.asOf, end: selection.asOf });
}
export function fredReleaseRequest(input, endpoint, target, offset = 0) {
  const selection = normalizeFredReleaseSelection(input);
  need(Number.isSafeInteger(offset) && offset >= 0, 'Source offset must be nonnegative.');
  need(['series', 'series/release', 'release/dates', 'series/vintagedates'].includes(endpoint), 'Unsupported release source endpoint.');
  if (endpoint !== 'release/dates') need(selection.series.includes(target), 'Source series is outside the selected series.');
  if (endpoint === 'series') {
    need(offset === 0, 'Series metadata does not use page offsets.');
    return fredRequest(metadataSelection(selection), target, 'series');
  }
  let parameters;
  if (endpoint === 'series/release') {
    need(offset === 0, 'Series release mapping does not use page offsets.');
    parameters = { series_id: target, file_type: 'json', realtime_start: selection.asOf, realtime_end: selection.asOf };
  } else if (endpoint === 'release/dates') {
    need(Number.isSafeInteger(target) && target >= 1, 'Use the positive original FRED release ID.');
    parameters = { release_id: String(target), file_type: 'json', realtime_start: selection.calendarStart,
      realtime_end: selection.calendarEnd, limit: String(selection.pageSize), offset: String(offset),
      sort_order: 'asc', include_release_dates_with_no_data: 'true' };
  } else {
    parameters = { series_id: target, file_type: 'json', realtime_start: selection.vintageStart,
      realtime_end: selection.vintageEnd, limit: String(selection.pageSize), offset: String(offset), sort_order: 'asc' };
  }
  const url = new URL('/fred/' + endpoint, FRED_ORIGIN);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return { endpoint, parameters, url: url.href };
}
function originalBody(receipt, request) {
  need(plain(receipt) && receipt.status === 200 && same(receipt.request, request),
    'Retained source response differs from its exact release request.');
  need(typeof receipt.body === 'string' && utf8Length(receipt.body) <= MAX_PAGE_BYTES,
    'Retained release source page exceeds its byte capacity.');
  need(typeof receipt.sha256 === 'string' && /^[a-f0-9]{64}$/.test(receipt.sha256) &&
    releaseHash(Buffer.from(receipt.body, 'utf8')) === receipt.sha256, 'Retained release page bytes changed.');
  need(typeof receipt.receivedAt === 'string' && Number.isFinite(Date.parse(receipt.receivedAt)),
    'Retain the original release source receipt time.');
  need(plain(receipt.headers) && Object.keys(receipt.headers).every(key =>
    ['content-type', 'date', 'etag', 'last-modified'].includes(key)) &&
    Object.values(receipt.headers).every(value => typeof value === 'string' && value.length <= 2048),
    'Release receipts retain only the original public response headers.');
  let body;
  try { body = JSON.parse(receipt.body); } catch { need(false, 'FRED release source response is not JSON.'); }
  need(plain(body) && !Object.hasOwn(body, 'error_code'), 'FRED returned a release source error.');
  return body;
}
function originalText(value, label, maximum = 65536) {
  need(typeof value === 'string' && value.length <= maximum, label + ' must retain original source text.');
  return value;
}
function sourceInterval(body, start, end) {
  need(body.realtime_start === start && body.realtime_end === end,
    'The returned FRED real-time interval differs from the original selected interval.');
}
export function readFredSeriesRelease(receipt, input, series) {
  const selection = normalizeFredReleaseSelection(input);
  const body = originalBody(receipt, fredReleaseRequest(selection, 'series/release', series));
  sourceInterval(body, selection.asOf, selection.asOf);
  need(Array.isArray(body.releases) && body.releases.length <= 1000, 'Retain the complete original series release mapping.');
  const seen = new Set();
  const releases = body.releases.map(original => {
    need(plain(original) && Number.isSafeInteger(original.id) && original.id >= 1 && !seen.has(original.id),
      'Series release mappings must retain distinct positive original release IDs.');
    seen.add(original.id);
    sourceInterval(original, selection.asOf, selection.asOf);
    originalText(original.name, 'Release name');
    need(typeof original.press_release === 'boolean', 'Retain the source press-release flag.');
    if (original.link !== undefined) originalText(original.link, 'Release link');
    if (original.notes !== undefined) originalText(original.notes, 'Release notes');
    return clone(original);
  });
  return { series, releases };
}
function pageOf(receipt, request, { start, end, orderBy, field, offset, expectedCount, selection, read }) {
  const body = originalBody(receipt, request);
  sourceInterval(body, start, end);
  need(body.order_by === orderBy && body.sort_order === 'asc', 'Source dates must use original ascending source order.');
  need(Number.isSafeInteger(body.count) && body.count >= 0 && body.count <= selection.maxRows &&
    body.offset === offset && Number.isSafeInteger(body.limit) && body.limit >= 1 && body.limit <= selection.pageSize,
    'Invalid or oversized original release source pagination.');
  need(expectedCount === null || body.count === expectedCount, 'Source date count changed between retained pages.');
  need(Array.isArray(body[field]) && body[field].length <= body.limit && offset + body[field].length <= body.count,
    'Source page length differs from its original count.');
  need(offset === 0 || offset < body.count, 'Unexpected source page beyond the retained count.');
  need(body[field].length > 0 || body.count === 0, 'A partial source page made no progress.');
  let previous = null;
  const rows = body[field].map(item => {
    const row = read(item), when = date(row.date, 'Original source date');
    need(when >= start && when <= end && (previous === null || when > previous),
      'Original source dates must be unique, ascending and within their selected source interval.');
    previous = when;
    return row;
  });
  return { count: body.count, offset, returned: rows.length, nextOffset: offset + rows.length,
    complete: offset + rows.length === body.count, rows };
}
export function readFredReleaseDates(receipt, input, releaseId, offset = 0, expectedCount = null) {
  const selection = normalizeFredReleaseSelection(input);
  return pageOf(receipt, fredReleaseRequest(selection, 'release/dates', releaseId, offset), {
    start: selection.calendarStart, end: selection.calendarEnd, orderBy: 'release_date', field: 'release_dates',
    offset, expectedCount, selection, read: item => {
      need(plain(item) && item.release_id === releaseId, 'Calendar dates must retain the selected original release ID.');
      if (item.release_name !== undefined) originalText(item.release_name, 'Original release name');
      if (item.release_last_updated !== undefined) originalText(item.release_last_updated, 'Original release update time');
      return { releaseId, date: date(item.date), original: clone(item) };
    } });
}
export function readFredSeriesVintageDates(receipt, input, series, offset = 0, expectedCount = null) {
  const selection = normalizeFredReleaseSelection(input);
  return pageOf(receipt, fredReleaseRequest(selection, 'series/vintagedates', series, offset), {
    start: selection.vintageStart, end: selection.vintageEnd, orderBy: 'vintage_date', field: 'vintage_dates',
    offset, expectedCount, selection, read: item => ({ series, date: date(item, 'Original vintage date'), original: item }) });
}

/** One deterministic graph serves live acquisition, interrupted replay and complete source receiving. */
export function* fredReleaseSourceFlow(input) {
  const selection = normalizeFredReleaseSelection(input), series = [], releaseMap = new Map();
  const calendar = [], vintages = [];
  let rowCount = 0;
  for (const id of selection.series) {
    const metadataReceipt = yield fredReleaseRequest(selection, 'series', id);
    originalBody(metadataReceipt, fredReleaseRequest(selection, 'series', id));
    const metadata = readSeriesMetadata(metadataReceipt, metadataSelection(selection), id);
    const mapping = readFredSeriesRelease(yield fredReleaseRequest(selection, 'series/release', id), selection, id);
    const value = { ...metadata.metadata, originalMetadata: metadata.original, releases: mapping.releases,
      releaseIds: mapping.releases.map(item => item.id).sort((a, b) => a - b), vintageDates: [] };
    series.push(value);
    for (const release of mapping.releases) {
      let existing = releaseMap.get(release.id);
      if (!existing) { existing = { id: release.id, metadata: clone(release), series: [], dates: [] }; releaseMap.set(release.id, existing); }
      else need(same(existing.metadata, release), 'A shared release mapping changed during the source capture.');
      existing.series.push(id);
    }
  }
  for (const release of [...releaseMap.values()].sort((a, b) => a.id - b.id)) {
    let offset = 0, count = null, previous = null, complete = false;
    while (!complete) {
      const page = readFredReleaseDates(yield fredReleaseRequest(selection, 'release/dates', release.id, offset),
        selection, release.id, offset, count);
      if (page.rows.length) need(previous === null || page.rows[0].date > previous, 'Release calendar dates overlap across pages.');
      for (const row of page.rows) {
        release.dates.push(row.date); calendar.push({ ...row, series: [...release.series] });
      }
      previous = page.rows.at(-1)?.date ?? previous; offset = page.nextOffset; count = page.count; complete = page.complete;
      rowCount += page.returned;
      need(rowCount <= selection.maxRows, 'Combined calendar and vintage source exceeds row capacity.', 'FRED_CAPTURE_TOO_LARGE', 413);
    }
  }
  for (const item of series) {
    let offset = 0, count = null, previous = null, complete = false;
    while (!complete) {
      const page = readFredSeriesVintageDates(yield fredReleaseRequest(selection, 'series/vintagedates', item.id, offset),
        selection, item.id, offset, count);
      if (page.rows.length) need(previous === null || page.rows[0].date > previous, 'Series vintage dates overlap across pages.');
      for (const row of page.rows) { item.vintageDates.push(row.date); vintages.push(row); }
      previous = page.rows.at(-1)?.date ?? previous; offset = page.nextOffset; count = page.count; complete = page.complete;
      rowCount += page.returned;
      need(rowCount <= selection.maxRows, 'Combined calendar and vintage source exceeds row capacity.', 'FRED_CAPTURE_TOO_LARGE', 413);
    }
  }
  calendar.sort((a, b) => a.date.localeCompare(b.date) || a.releaseId - b.releaseId);
  vintages.sort((a, b) => a.date.localeCompare(b.date) || a.series.localeCompare(b.series));
  return { schema: FRED_RELEASE_MODEL, selection, series,
    releases: [...releaseMap.values()].sort((a, b) => a.id - b.id), calendar, vintages, rowCount };
}
export function fredReleaseCaptureIdentity(capture) {
  return { schema: capture.schema, selection: capture.selection, records: capture.records };
}
export function inspectFredReleaseCapture(capture) {
  need(plain(capture) && capture.schema === FRED_RELEASE_CAPTURE &&
    Object.keys(capture).every(key => ['schema', 'selection', 'records', 'captureSha256'].includes(key)),
    'Select a complete original release source capture.');
  need(utf8Length(JSON.stringify(capture)) <= MAX_CAPTURE_BYTES, 'Release source capture exceeds 64 MiB.', 'FRED_CAPTURE_TOO_LARGE', 413);
  const selection = normalizeFredReleaseSelection(capture.selection);
  need(same(selection, capture.selection), 'Release source selection is not normalized.');
  need(Array.isArray(capture.records), 'Retain the complete original release source responses.');
  const flow = fredReleaseSourceFlow(selection);
  let cursor = 0, step = flow.next();
  while (!step.done) {
    need(cursor < capture.records.length, 'Release capture is missing a complete source page.');
    step = flow.next(capture.records[cursor++]);
  }
  need(cursor === capture.records.length, 'Release source capture contains extra responses outside its selected graph.');
  need(capture.captureSha256 === releaseDigest(fredReleaseCaptureIdentity(capture)), 'Release capture identity differs from its original bytes.');
  const times = capture.records.map(record => record.receivedAt).sort((a, b) => Date.parse(a) - Date.parse(b));
  return { ...step.value, captureSha256: capture.captureSha256, source: { notice: FRED_NOTICE, terms: FRED_TERMS,
    calendarNotice: FRED_RELEASE_CALENDAR_NOTICE, metadataAsOf: selection.asOf,
    calendarInterval: { start: selection.calendarStart, end: selection.calendarEnd, includesDatesWithNoData: true },
    vintageInterval: { start: selection.vintageStart, end: selection.vintageEnd },
    retrievalWindow: { start: times[0], end: times.at(-1) }, responseCount: capture.records.length } };
}
export const validateFredReleaseCapture = inspectFredReleaseCapture;
export function sealFredReleaseCapture(input, records) {
  const capture = { schema: FRED_RELEASE_CAPTURE, selection: normalizeFredReleaseSelection(input), records: clone(records) };
  capture.captureSha256 = releaseDigest(fredReleaseCaptureIdentity(capture));
  inspectFredReleaseCapture(capture);
  return capture;
}
