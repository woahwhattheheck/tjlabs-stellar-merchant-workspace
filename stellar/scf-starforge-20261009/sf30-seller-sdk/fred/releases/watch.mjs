// MIT. Immutable watched series and original recurring briefing bindings.
import { canonical, clone, date, need, plain, normalizeSelection } from '../model.mjs';
import { validateFredBriefingTemplate } from '../briefing/templates.mjs';
import { releaseDigest } from './model.mjs';

export const FRED_RELEASE_WATCH = 'stellar-forge.fred-release-watch.v1';
const fields = ['name', 'series', 'template', 'observationStart', 'observationEnd', 'baselineAsOf', 'catchUp', 'pageSize', 'maxRows'];
export function createFredReleaseWatch(input) {
  need(plain(input) && Object.keys(input).every(key => fields.includes(key)), 'Unknown release watch setting.');
  need(typeof input.name === 'string' && input.name.trim().length >= 1 && input.name.length <= 200,
    'Name this watched source or recurring briefing.');
  const template = input.template == null ? null : validateFredBriefingTemplate(input.template);
  const ids = input.series ?? template?.briefing.series.map(row => row.id);
  const selection = normalizeSelection({ series: ids, asOf: input.baselineAsOf, start: input.observationStart,
    end: input.observationEnd === 'as_of' || input.observationEnd === undefined ? input.baselineAsOf : input.observationEnd,
    pageSize: input.pageSize ?? 1000, maxRows: input.maxRows ?? 1000000 });
  if (template) need(canonical(selection.series) === canonical(template.briefing.series.map(row => row.id).sort()),
    'Watch every original template series together without adding or omitting a series.');
  const observationEnd = input.observationEnd ?? 'as_of';
  if (observationEnd !== 'as_of') {
    date(observationEnd, 'Observation end');
    need(selection.start <= observationEnd, 'Observation coverage must be ordered.');
  }
  const catchUp = input.catchUp ?? 'all_vintages';
  need(['all_vintages', 'latest_vintage'].includes(catchUp), 'Choose all available missed vintages or the latest available vintage.');
  const watch = { schema: FRED_RELEASE_WATCH, name: input.name.trim(), series: selection.series, template: clone(template),
    observationStart: selection.start, observationEnd, baselineAsOf: selection.asOf,
    catchUp, pageSize: selection.pageSize, maxRows: selection.maxRows };
  return { ...watch, id: 'fred-release-watch-' + releaseDigest(watch) };
}
export function validateFredReleaseWatch(input) {
  need(plain(input) && input.schema === FRED_RELEASE_WATCH &&
    Object.keys(input).every(key => ['schema', 'id', ...fields].includes(key)), 'Select an original release watch descriptor.');
  const value = createFredReleaseWatch(Object.fromEntries(fields.map(key => [key, input[key]]).filter(([, value]) => value !== undefined)));
  need(canonical(value) === canonical(input), 'The release watch descriptor or identity changed.');
  return value;
}
