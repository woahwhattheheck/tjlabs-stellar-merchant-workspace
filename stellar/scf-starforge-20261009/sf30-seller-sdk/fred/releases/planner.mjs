// MIT. Complete source-span comparison and original FRED observation catch-up planning.
import { canonical, clone, date, need, plain, normalizeSelection, MAX_CAPTURE_BYTES, utf8Length } from '../model.mjs';
import { inspectFredReleaseCapture, normalizeFredReleaseSelection, releaseDigest } from './model.mjs';
import { validateFredReleaseWatch } from './watch.mjs';

export const FRED_RELEASE_PLAN = 'stellar-forge.fred-release-plan.v1';
const same = (a, b) => canonical(a) === canonical(b);
const later = (a, b) => a > b ? a : b;
const earlier = (a, b) => a < b ? a : b;
const includes = (range, when) => range !== null && when >= range.start && when <= range.end;
const range = (model, prefix) => model ? { start: model.selection[prefix + 'Start'], end: model.selection[prefix + 'End'] } : null;
const key = row => row.series + '\0' + row.date;
const calendarKey = row => row.releaseId + '\0' + row.date;
function nextDate(value) {
  const parsed = new Date(value + 'T00:00:00Z'); parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}
function checkModel(model, watch, label) {
  need(watch.series.every(id => model.selection.series.includes(id)), label + ' source must contain every watched series.');
  if (label === 'Selected') need(model.selection.asOf >= watch.baselineAsOf, label + ' metadata date precedes the watched baseline.');
}
function sourceRows(model, watch) {
  if (!model) return { series: [], calendar: [], vintages: [], releaseIds: new Set() };
  const series = model.series.filter(row => watch.series.includes(row.id));
  const releaseIds = new Set(series.flatMap(row => row.releaseIds));
  return { series, releaseIds, calendar: model.calendar.filter(row => releaseIds.has(row.releaseId)).map(row =>
    ({ ...row, series: row.series.filter(id => watch.series.includes(id)) })),
  vintages: model.vintages.filter(row => watch.series.includes(row.series)) };
}
function dates(input, maximum) {
  need(Array.isArray(input) && input.length <= 1000000 && new Set(input).size === input.length,
    'Retain distinct completed as-of dates from this watch and source snapshot.');
  const values = input.map(value => date(value, 'Completed as-of date')).sort();
  need(values.every(value => value >= '1776-07-04' && value <= maximum), 'Completed as-of date is outside this captured source.');
  return values;
}
function compareCalendar(beforeRows, afterRows, beforeRange, afterRange, beforeReleases, afterReleases) {
  const previous = new Map(beforeRows.map(row => [calendarKey(row), row])), changes = [];
  for (const row of afterRows) {
    const old = previous.get(calendarKey(row)); previous.delete(calendarKey(row));
    if (old) {
      if (!same(old, row)) changes.push({ kind: 'CALENDAR_DETAILS_CHANGED', releaseId: row.releaseId, date: row.date, before: old, after: row });
    } else {
      const kind = beforeRange === null ? 'INITIAL_CALENDAR_DATE' :
        !beforeReleases.has(row.releaseId) ? 'RELEASE_ENTERED_SELECTION' :
        includes(beforeRange, row.date) ? 'ADDED_CALENDAR_DATE' : 'ENTERED_CALENDAR_COVERAGE';
      changes.push({ kind, releaseId: row.releaseId, date: row.date, before: null, after: row });
    }
  }
  for (const row of previous.values()) changes.push({
    kind: !afterReleases.has(row.releaseId) ? 'RELEASE_LEFT_SELECTION' :
      includes(afterRange, row.date) ? 'REMOVED_CALENDAR_DATE' : 'LEFT_CALENDAR_COVERAGE',
    releaseId: row.releaseId, date: row.date, before: row, after: null });
  return changes.sort((a, b) => a.date.localeCompare(b.date) || a.releaseId - b.releaseId || a.kind.localeCompare(b.kind));
}
function compareVintages(beforeRows, afterRows, beforeRange, afterRange) {
  const previous = new Map(beforeRows.map(row => [key(row), row])), changes = [];
  for (const row of afterRows) {
    if (previous.has(key(row))) { previous.delete(key(row)); continue; }
    changes.push({ kind: beforeRange === null ? 'INITIAL_VINTAGE_DATE' :
      includes(beforeRange, row.date) ? 'LATE_DISCOVERED_VINTAGE' : 'ENTERED_VINTAGE_COVERAGE',
    series: row.series, date: row.date, before: null, after: row });
  }
  for (const row of previous.values()) changes.push({
    kind: includes(afterRange, row.date) ? 'VINTAGE_NO_LONGER_RETURNED' : 'LEFT_VINTAGE_COVERAGE',
    series: row.series, date: row.date, before: row, after: null });
  return changes.sort((a, b) => a.date.localeCompare(b.date) || a.series.localeCompare(b.series) || a.kind.localeCompare(b.kind));
}
function missingCoverage(watch, after) {
  const end = after.selection.asOf, baseline = watch.baselineAsOf;
  if (baseline === end) return { start: null, end, complete: true, missingSpans: [] };
  const start = nextDate(baseline), availableStart = after.selection.vintageStart, availableEnd = after.selection.vintageEnd;
  const missingSpans = [];
  if (start < availableStart) missingSpans.push({ start, end: earlier(end, new Date(Date.parse(availableStart + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)) });
  if (availableEnd < end) missingSpans.push({ start: later(start, nextDate(availableEnd)), end });
  return { start, end, complete: missingSpans.length === 0, missingSpans };
}
function metadataChanges(beforeRows, afterRows, watch) {
  const old = new Map(beforeRows.map(row => [row.id, row])), meaningChanges = [], sourceChanges = [];
  const meaning = ['title', 'units', 'frequency', 'seasonalAdjustment'];
  const templateMeaning = new Map((watch.template?.seriesMeaning ?? []).map(row => [row.id, row]));
  for (const row of afterRows) {
    const previous = old.get(row.id), template = templateMeaning.get(row.id);
    if (previous) {
      for (const field of [...meaning, 'observationStart', 'observationEnd', 'lastUpdated', 'notes', 'releaseIds', 'releases']) {
        if (same(previous[field], row[field])) continue;
        const value = { series: row.id, field, before: clone(previous[field]), after: clone(row[field]) };
        sourceChanges.push(value);
        if (meaning.includes(field)) meaningChanges.push({ ...value, basis: 'previous_capture' });
      }
    }
    if (template) for (const field of meaning) if (!same(template[field], row[field]))
      meaningChanges.push({ series: row.id, field, before: clone(template[field]), after: clone(row[field]), basis: 'watch_template' });
  }
  return { meaningChanges, sourceChanges };
}
/** Planning is pure. Each acquisition selection is passed unchanged into the existing captureFred provider. */
export function planFredReleaseCatchUp({ watch: supplied, before: beforeCapture = null, after: afterCapture, completedAsOf = [] }) {
  const watch = validateFredReleaseWatch(supplied), after = inspectFredReleaseCapture(afterCapture);
  const before = beforeCapture === null ? null : inspectFredReleaseCapture(beforeCapture);
  checkModel(after, watch, 'Selected');
  if (before) {
    checkModel(before, watch, 'Previous');
    need(before.selection.asOf <= after.selection.asOf &&
      Date.parse(before.source.retrievalWindow.end) <= Date.parse(after.source.retrievalWindow.end),
      'Compare the previous source snapshot with the later selected source snapshot.');
  }
  const completed = dates(completedAsOf, after.selection.asOf), completedSet = new Set(completed);
  const old = sourceRows(before, watch), current = sourceRows(after, watch);
  const beforeCalendar = range(before, 'calendar'), afterCalendar = range(after, 'calendar');
  const beforeVintages = range(before, 'vintage'), afterVintages = range(after, 'vintage');
  const calendarChanges = compareCalendar(old.calendar, current.calendar, beforeCalendar, afterCalendar, old.releaseIds, current.releaseIds);
  const vintageChanges = compareVintages(old.vintages, current.vintages, beforeVintages, afterVintages);
  const { meaningChanges, sourceChanges } = metadataChanges(old.series, current.series, watch);
  const changeMap = new Map(vintageChanges.filter(row => row.after).map(row => [key(row), row.kind]));
  const beforeMap = new Map(old.vintages.map(row => [key(row), row]));
  const recheckSeries = new Set(sourceChanges.filter(row =>
    ['lastUpdated', 'units', 'frequency', 'seasonalAdjustment', 'observationStart', 'observationEnd'].includes(row.field)).map(row => row.series));
  const latestBySeries = new Map(current.series.map(row => [row.id, row.vintageDates.at(-1) ?? null]));
  const events = current.vintages.map(row => {
    const reasons = [], change = changeMap.get(key(row)) ?? null;
    if (change === 'LATE_DISCOVERED_VINTAGE') reasons.push('LATE_DISCOVERED_VINTAGE');
    if (row.date > watch.baselineAsOf) reasons.push(beforeMap.has(key(row)) ? 'KNOWN_UNCOMPLETED_VINTAGE' :
      change === 'ENTERED_VINTAGE_COVERAGE' ? 'NEWLY_COVERED_VINTAGE' : 'NEW_VINTAGE');
    if (recheckSeries.has(row.series) && latestBySeries.get(row.series) === row.date) reasons.push('SOURCE_UPDATE_RECHECK');
    return { series: row.series, date: row.date, kind: change ?? 'RETAINED_VINTAGE_DATE',
      reasons, completed: completedSet.has(row.date) };
  });
  const usable = events.filter(row => row.reasons.length > 0 && !row.completed && row.date >= watch.observationStart);
  const grouped = new Map();
  for (const row of usable) {
    let item = grouped.get(row.date);
    if (!item) { item = { asOf: row.date, triggerVintageDates: [], reasons: new Set() }; grouped.set(row.date, item); }
    item.triggerVintageDates.push(row.date);
    row.reasons.forEach(reason => item.reasons.add(reason));
  }
  let selected = [...grouped.values()].sort((a, b) => a.asOf.localeCompare(b.asOf));
  if (watch.catchUp === 'latest_vintage' && selected.length) {
    const eligible = current.vintages.filter(row => row.date >= watch.observationStart);
    const asOf = eligible.at(-1)?.date;
    need(asOf, 'An original source vintage is required for the latest catch-up selection.');
    selected = completedSet.has(asOf) ? [] : [{ asOf, triggerVintageDates: [...grouped.keys()].sort(),
      reasons: new Set([...grouped.values()].flatMap(item => [...item.reasons])) }];
  }
  const vintageSeries = new Map();
  for (const row of current.vintages) {
    if (!vintageSeries.has(row.date)) vintageSeries.set(row.date, new Set());
    vintageSeries.get(row.date).add(row.series);
  }
  const acquisitions = selected.map(item => ({
    asOf: item.asOf,
    changedSeries: [...(vintageSeries.get(item.asOf) ?? [])].sort(),
    triggerVintageDates: [...new Set(item.triggerVintageDates)].sort(), reasons: [...item.reasons].sort(),
    selection: normalizeSelection({ series: watch.series, asOf: item.asOf, start: watch.observationStart,
      end: watch.observationEnd === 'as_of' ? item.asOf : watch.observationEnd, pageSize: watch.pageSize, maxRows: watch.maxRows }),
  }));
  const coverage = { baselineAsOf: watch.baselineAsOf, ...missingCoverage(watch, after),
    calendar: { before: beforeCalendar, after: afterCalendar }, vintages: { before: beforeVintages, after: afterVintages } };
  // One complete continuation selection covers every missing span and preserves set comparison over the retained interval.
  const requiredSourceSelections = coverage.complete ? [] : [normalizeFredReleaseSelection({ ...after.selection,
    series: watch.series, vintageStart: earlier(after.selection.vintageStart, coverage.start), vintageEnd: after.selection.asOf })];
  const schedule = current.calendar.map(row => ({ ...row,
    phase: row.date > after.selection.asOf ? 'UPCOMING_CALENDAR_DATE' : 'PUBLISHED_CALENDAR_DATE' }));
  const value = { schema: FRED_RELEASE_PLAN, watchId: watch.id, watch, beforeCaptureSha256: before?.captureSha256 ?? null,
    afterCaptureSha256: after.captureSha256, metadataAsOf: after.selection.asOf, completedAsOf: completed,
    coverage, requiredSourceSelections, meaningChanges, sourceChanges, calendarChanges, vintageChanges, events,
    acquisitions, schedule, summary: { series: watch.series.length, releases: current.releaseIds.size,
      calendarDates: schedule.length, vintageDates: current.vintages.length, calendarChanges: calendarChanges.length,
      vintageChanges: vintageChanges.length, lateDiscoveredVintages: vintageChanges.filter(row => row.kind === 'LATE_DISCOVERED_VINTAGE').length,
      observationAcquisitions: acquisitions.length, completedAsOf: completed.length, meaningChanges: meaningChanges.length,
      completeCatchUpCoverage: coverage.complete } };
  const plan = { ...value, id: 'fred-release-plan-' + releaseDigest(value) };
  need(utf8Length(JSON.stringify(plan)) <= MAX_CAPTURE_BYTES, 'The complete release plan exceeds 64 MiB.', 'FRED_CAPTURE_TOO_LARGE', 413);
  return plan;
}
export function validateFredReleasePlan(input, context = undefined) {
  need(plain(input) && input.schema === FRED_RELEASE_PLAN && typeof input.id === 'string' &&
    /^fred-release-plan-[a-f0-9]{64}$/.test(input.id), 'Select a complete original release plan.');
  const { id, ...identity } = input;
  need(id === 'fred-release-plan-' + releaseDigest(identity), 'The original release plan descriptor changed.');
  const watch = validateFredReleaseWatch(input.watch);
  need(input.watchId === watch.id && /^[a-f0-9]{64}$/.test(input.afterCaptureSha256) &&
    (input.beforeCaptureSha256 === null || /^[a-f0-9]{64}$/.test(input.beforeCaptureSha256)),
    'Release plan source and watch bindings are invalid.');
  need(same(dates(input.completedAsOf, date(input.metadataAsOf)), input.completedAsOf), 'Completed source dates are not normalized.');
  need(Array.isArray(input.acquisitions) && new Set(input.acquisitions.map(row => row.asOf)).size === input.acquisitions.length,
    'Release plan acquisition dates must be distinct.');
  for (const item of input.acquisitions) need(plain(item) && item.asOf === item.selection?.asOf &&
    same(normalizeSelection(item.selection), item.selection) && same(item.selection.series, watch.series) &&
    item.selection.start === watch.observationStart && item.selection.end === (watch.observationEnd === 'as_of' ? item.asOf : watch.observationEnd) &&
    item.selection.pageSize === watch.pageSize && item.selection.maxRows === watch.maxRows &&
    !input.completedAsOf.includes(item.asOf), 'A planned acquisition differs from its original watched selection.');
  for (const field of ['requiredSourceSelections', 'meaningChanges', 'sourceChanges', 'calendarChanges', 'vintageChanges', 'events', 'schedule'])
    need(Array.isArray(input[field]), 'The complete release plan must retain ' + field + '.');
  for (const selection of input.requiredSourceSelections)
    need(same(normalizeFredReleaseSelection(selection), selection), 'Required release source selection is not normalized.');
  need(plain(input.coverage) && plain(input.summary), 'Retain release plan coverage and summary.');
  if (context !== undefined) {
    need(plain(context) && Object.hasOwn(context, 'after'), 'Provide the original selected source capture when reopening a plan.');
    const computed = planFredReleaseCatchUp({ watch, before: context.before ?? null, after: context.after, completedAsOf: input.completedAsOf });
    need(same(computed, input), 'The release plan differs from its complete retained sources.');
  }
  return clone(input);
}
export function pageFredReleasePlan(plan, { section = 'acquisitions', offset = 0, limit = 100 } = {}) {
  validateFredReleasePlan(plan);
  need(['acquisitions', 'calendarChanges', 'vintageChanges', 'events', 'schedule'].includes(section), 'Choose an original release plan section.');
  need(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(limit) && limit >= 1 && limit <= 1000,
    'Use a nonnegative offset and a page limit from 1 to 1000.');
  const all = plan[section], rows = clone(all.slice(offset, offset + limit));
  return { id: plan.id, watchId: plan.watchId, beforeCaptureSha256: plan.beforeCaptureSha256,
    afterCaptureSha256: plan.afterCaptureSha256, metadataAsOf: plan.metadataAsOf, summary: clone(plan.summary),
    coverage: clone(plan.coverage), section, offset, limit, count: all.length,
    nextOffset: offset + rows.length < all.length ? offset + rows.length : null, rows };
}
