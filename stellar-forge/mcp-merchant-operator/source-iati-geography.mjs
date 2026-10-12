// MIT. Geography agent access through the original retained HTTP/file carrier.
import { IATI_GEOGRAPHY_TOOL_PREFIX } from './catalog/source-iati-geography.mjs';

export const IATI_GEOGRAPHY_ROUTE = '/api/iati/geography/';
const SHA = /^[0-9a-f]{64}$/;
const REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const MEDIA = {
  packet: 'application/zip', geojson: 'application/geo+json',
  csv: 'text/csv; charset=utf-8', json: 'application/json', html: 'text/html; charset=utf-8',
};
const fail = message => Object.assign(new Error(message), { code: 'INVALID_PARAMS' });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function digest(value) {
  if (typeof value !== 'string' || !SHA.test(value)) throw fail('Select the complete original geography ID.');
  return value;
}
function number(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw fail('Select an exact geography revision or page number.');
  return value;
}
function object(value) {
  if (!plain(value)) throw fail('Supply the complete original geography object.');
  return value;
}
function revision(input) {
  return input.revision === undefined ? '' : '?revision=' + number(input.revision, 1);
}
function descriptor(value, input, format) {
  if (!plain(value) || !SHA.test(value.id ?? '') || !SHA.test(value.sha256 ?? '') ||
      !SHA.test(value.selectionSha256 ?? '') || value.review !== input.id ||
      !Number.isSafeInteger(value.revision) || value.revision < 1 ||
      input.revision !== undefined && value.revision !== input.revision ||
      value.format !== format || value.contentType !== MEDIA[format] ||
      !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > 4 * 1024 * 1024 * 1024 ||
      typeof value.filename !== 'string' || !value.filename || /[/\\\x00-\x1f\x7f"]/.test(value.filename) ||
      value.url !== IATI_GEOGRAPHY_ROUTE + 'download/' + value.id)
    throw fail('The original geography export descriptor is incomplete or selects another revision.');
  return value;
}

export async function executeIatiGeography(name, input, context) {
  const action = name.slice(IATI_GEOGRAPHY_TOOL_PREFIX.length);
  const result = native => ({ workspace: context.workspace, native });
  switch (action) {
    case 'state': {
      const state = object(await context.json(IATI_GEOGRAPHY_ROUTE + 'state'));
      if (!Array.isArray(state.reviews)) throw fail('The original geography inventory is incomplete.');
      return result({ schema: state.schema, workspaceSha256: state.workspaceSha256,
        contract: state.contract, reviews: state.reviews.length });
    }
    case 'reviews': {
      const state = object(await context.json(IATI_GEOGRAPHY_ROUTE + 'state'));
      if (!Array.isArray(state.reviews)) throw fail('The original geography inventory is incomplete.');
      return result(context.page(state.reviews, input));
    }
    case 'review':
      return result(await context.json(IATI_GEOGRAPHY_ROUTE + 'reviews/' + digest(input.id) + revision(input)));
    case 'report':
      return result(await context.json(IATI_GEOGRAPHY_ROUTE + 'reviews/' + digest(input.id) + '/report' + revision(input)));
    case 'history': {
      const history = await context.json(IATI_GEOGRAPHY_ROUTE + 'reviews/' + digest(input.id) + '/history' + revision(input));
      if (!Array.isArray(history)) throw fail('The original complete geography history is unavailable.');
      return result(context.page(history, input));
    }
    case 'request':
      if (typeof input.requestId !== 'string' || !REQUEST.test(input.requestId))
        throw fail('Select the complete original geography requestId.');
      return result(await context.json(IATI_GEOGRAPHY_ROUTE + 'requests/' + encodeURIComponent(input.requestId)));
    case 'save':
      return result(await context.json(IATI_GEOGRAPHY_ROUTE + 'reviews', object(input.definition)));
    case 'rows':
    case 'points':
      return result(await context.json(IATI_GEOGRAPHY_ROUTE + action, object(input.query)));
    case 'compare':
      return result(await context.json(IATI_GEOGRAPHY_ROUTE + 'compare', object(input.definition)));
    case 'comparison':
      return result(await context.json(IATI_GEOGRAPHY_ROUTE + 'comparisons/' + digest(input.id)));
    case 'changes':
      return result(await context.json(IATI_GEOGRAPHY_ROUTE + 'comparisons/' + digest(input.id) +
        '/changes?native=' + digest(input.native) + '&offset=' + number(input.offset ?? 0, 0) +
        '&limit=' + number(input.limit ?? 50, 1, 250)));
    case 'export': {
      const format = input.format ?? 'packet';
      if (!Object.hasOwn(MEDIA, format)) throw fail('Choose packet, geojson, csv, json or html.');
      const selected = { id: digest(input.id), format };
      if (input.revision !== undefined) selected.revision = number(input.revision, 1);
      const original = descriptor(await context.json(IATI_GEOGRAPHY_ROUTE + 'export', selected), selected, format);
      return context.retain(original.url, format === 'packet' ? 'geography' : 'geography-file', {
        geography: original.review, revision: original.revision, geographyFormat: format,
        geographyArtifact: original.id, selectionSha256: original.selectionSha256,
      }, {
        name: original.filename, contentType: original.contentType, verifyNativeDescriptor: true,
        expectedSha256: original.sha256, expectedBytes: original.bytes,
      });
    }
    case 'receive':
      return result(await context.receive(input, IATI_GEOGRAPHY_ROUTE + 'receive', ['geography']));
    default:
      throw fail('Unknown original geography operation.');
  }
}
