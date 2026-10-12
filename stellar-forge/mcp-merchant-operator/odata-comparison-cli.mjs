#!/usr/bin/env node
// MIT. Complete customer operation over original live comparison editions.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readRequestFile } from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/request-body.mjs';
import { writeNew } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/state.mjs';
import { listMerchantODataCollections } from './odata-collection-client.mjs';
import {
  ODATA_COMPARISON_REVIEW_REQUEST_SCHEMA,
  listMerchantODataComparisons, inspectMerchantODataComparison, listMerchantODataComparisonEditions, createMerchantODataComparison,
  readMerchantODataComparisonRows, reviewMerchantODataComparison, publishMerchantODataComparison,
  restoreMerchantODataComparison, inspectMerchantODataComparisonSource, downloadMerchantODataComparison,
  inspectODataComparisonDownload, receiveODataComparisonDownload, fetchODataComparison,
  inspectReceivedODataComparison, readReceivedODataComparisonRows, receivedODataComparisonAnalysisMapping
} from './odata-comparison-client.mjs';

const HELP = [
  'OData comparison customer',
  '',
  'Remote commands use --url URL --workspace ALIAS --service ID and --token-env MCP_ACCESS_TOKEN.',
  'Select --comparison ID except for collections and list.',
  '',
  'collections [--offset 0 --limit 50]',
  'list [--offset 0 --limit 50]',
  'inspect --comparison ID [--offset 0 --limit 50]',
  'editions --comparison ID [--offset 0 --limit 50]  (continuation covers the original retained-file inventory)',
  'create --comparison ID --request PRIVATE_JSON [--request-sha256 SHA256]',
  'rows --comparison ID [--kind cells|entities --status changed|unchanged|before_only|after_only --offset 0 --limit 50]',
  'review --comparison ID --request PRIVATE_JSON [--request-sha256 SHA256]',
  'review --comparison ID --review-alias HOST_DECLARED_ALIAS',
  'publish --comparison ID --revision NUMBER',
  'source --comparison ID --edition SHA256 --sha256 SOURCE_SHA256 [--source REGISTERED_NAME --revision NUMBER]',
  'download --comparison ID --edition SHA256 --sha256 SOURCE_SHA256 --out DOWNLOAD_DIRECTORY',
  'fetch --comparison ID --edition SHA256 --sha256 SOURCE_SHA256 --download DOWNLOAD_DIRECTORY --out COMPARISON_DIRECTORY',
  'restore-remote --comparison TARGET_ID --source-document HOST_DECLARED_ALIAS --sha256 SOURCE_SHA256',
  'restore-remote --comparison TARGET_ID --source-comparison SOURCE_ID --source-edition SHA256 --sha256 SOURCE_SHA256',
  '  [--source-workspace ALIAS --source-service ID]',
  '',
  'Offline commands:',
  'verify-download --directory DOWNLOAD_DIRECTORY [--sha256 SOURCE_SHA256 --edition SHA256]',
  'receive --download DOWNLOAD_DIRECTORY --out COMPARISON_DIRECTORY --sha256 SOURCE_SHA256 [--edition SHA256]',
  'inspect-received --directory COMPARISON_DIRECTORY [--replay true|false]',
  'received-rows --directory COMPARISON_DIRECTORY [--kind cells|entities --status STATUS --offset 0 --limit 100]',
  'analysis-mapping --directory COMPARISON_DIRECTORY --source REGISTERED_NAME --revision NUMBER [--out PRIVATE_JSON]',
  '',
  'create request: schema stellar-forge.odata-comparison-create-request.v1, liveServiceId, comparisonId,',
  '  beforeCollectionId, afterCollectionId, expectedBeforeSha256, expectedAfterSha256, title, optional fields/limits.',
  'review request: schema stellar-forge.odata-comparison-review-request.v1, liveServiceId, comparisonId,',
  '  requestId, expectedRevision, scope, optional entityKey/field, status, actor, note.',
  'Keep each original review JSON and requestId unchanged after an uncertain reply. The native history resolves its retry.',
  'publish requires the actual inspected review revision; retain its editionId and sha256 for source/download/fetch.',
  'download/fetch also accept --chunk-size 196608 and --progress true|false. Repeat the same command to resume.',
  'Private download and receiving directories must be separate. source.json appears after every declared file is synced.',
  'analysis-mapping --out writes the original import input; it reopens identical existing bytes and preserves a different file.',
  'Bearer credentials remain in the selected environment variable. All commands return JSON.',
  ''
].join('\n');
const HASH = /^[a-f0-9]{64}$/;
const CREATE_SCHEMA = 'stellar-forge.odata-comparison-create-request.v1';
const CREATE = ['beforeCollectionId', 'afterCollectionId', 'expectedBeforeSha256', 'expectedAfterSha256', 'title', 'fields', 'limits'];
const REVIEW = ['requestId', 'expectedRevision', 'scope', 'entityKey', 'field', 'status', 'actor', 'note'];
const REMOTE = ['url', 'workspace', 'service', 'comparison', 'token-env'];
const BASE = REMOTE.filter(name => name !== 'comparison');
const sha = raw => createHash('sha256').update(raw).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function parse(args) {
  const [command, ...values] = args, options = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index], value = values[index + 1];
    if (typeof name !== 'string' || !/^--[a-z][a-z-]*$/.test(name) ||
      Object.hasOwn(options, name.slice(2)) || typeof value !== 'string' || !value || value.startsWith('--'))
      throw new TypeError('Each named option requires one value and may appear once. Use --help.');
    options[name.slice(2)] = value;
  }
  return { command, options };
}
function only(input, names) {
  if (Object.keys(input).some(key => !names.includes(key))) throw new TypeError('Unknown option for this command. Use --help.');
}
function required(input, name) {
  if (!input[name]) throw new TypeError('--' + name + ' is required.');
  return input[name];
}
function integer(value, fallback) {
  if (value === undefined) return fallback;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new TypeError('Use an explicit nonnegative integer.');
  return Number(value);
}
function boolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (!['true', 'false'].includes(value)) throw new TypeError('Use true or false.');
  return value === 'true';
}
function remote(input, comparison = true) {
  return { url: required(input, 'url'), workspace: required(input, 'workspace'),
    liveServiceId: required(input, 'service'), ...(comparison ? { comparisonId: required(input, 'comparison') } : {}),
    tokenEnv: input['token-env'] ?? 'MCP_ACCESS_TOKEN' };
}
async function request(input, kind) {
  const path = resolve(required(input, 'request')), raw = await readRequestFile(path, 16 * 1024 * 1024), identity = {
    path, bytes: raw.length, sha256: sha(raw)
  };
  if (input['request-sha256'] !== undefined &&
    (!HASH.test(input['request-sha256']) || input['request-sha256'] !== identity.sha256))
    throw new TypeError('The selected original request file differs from --request-sha256.');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { throw new TypeError('Use the original complete UTF-8 JSON request file.'); }
  const fields = kind === 'create' ? CREATE : REVIEW, expected = kind === 'create' ? CREATE_SCHEMA : ODATA_COMPARISON_REVIEW_REQUEST_SCHEMA;
  if (!plain(value) || value.schema !== expected || value.liveServiceId !== required(input, 'service') ||
    value.comparisonId !== required(input, 'comparison') ||
    Object.keys(value).some(key => !['schema', 'liveServiceId', 'comparisonId', ...fields].includes(key)))
    throw new TypeError('The original request schema, live service or comparison differs from this command.');
  return { identity, input: Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]])) };
}
async function mappingFile(path, input) {
  path = resolve(path);
  const raw = Buffer.from(JSON.stringify(input, null, 2) + '\n');
  try { await writeNew(path, raw); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!(await readRequestFile(path, 1024 * 1024)).equals(raw))
      throw new TypeError('The selected mapping output already contains different original bytes.');
  }
  return { path, bytes: raw.length, sha256: sha(raw) };
}
const write = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');

export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.includes('--help')) { process.stdout.write(HELP); return; }
  const { command, options: input } = parse(args), controller = new AbortController();
  const abort = () => controller.abort(new Error('Customer operation interrupted; retain the same request, edition and directories.'));
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  try {
    let result;
    if (command === 'collections' || command === 'list') {
      only(input, [...BASE, 'offset', 'limit']);
      result = await (command === 'collections' ? listMerchantODataCollections : listMerchantODataComparisons)({
        ...remote(input, false), signal: controller.signal, offset: integer(input.offset, 0), limit: integer(input.limit, 50)
      });
    } else if (command === 'inspect' || command === 'editions') {
      only(input, [...REMOTE, 'offset', 'limit']);
      result = await (command === 'inspect' ? inspectMerchantODataComparison : listMerchantODataComparisonEditions)({ ...remote(input), signal: controller.signal,
        offset: integer(input.offset, 0), limit: integer(input.limit, 50) });
    } else if (command === 'create') {
      only(input, [...REMOTE, 'request', 'request-sha256']);
      const selected = await request(input, 'create');
      result = { ...await createMerchantODataComparison({ ...remote(input), ...selected.input, signal: controller.signal }),
        requestSource: selected.identity };
    } else if (command === 'rows') {
      only(input, [...REMOTE, 'kind', 'status', 'offset', 'limit']);
      result = await readMerchantODataComparisonRows({ ...remote(input), kind: input.kind, status: input.status,
        offset: integer(input.offset, 0), limit: integer(input.limit, 50), signal: controller.signal });
    } else if (command === 'review') {
      only(input, [...REMOTE, 'request', 'request-sha256', 'review-alias']);
      if ((input.request === undefined) === (input['review-alias'] === undefined) ||
        input['review-alias'] !== undefined && input['request-sha256'] !== undefined)
        throw new TypeError('Select one original request file or one host-declared review alias.');
      const selected = input.request === undefined ? null : await request(input, 'review');
      result = await reviewMerchantODataComparison({ ...remote(input), signal: controller.signal,
        ...(selected ? { request: selected.input } : { reviewRequest: input['review-alias'] }) });
      if (selected) result = { ...result, requestSource: selected.identity };
    } else if (command === 'publish') {
      only(input, [...REMOTE, 'revision']);
      result = await publishMerchantODataComparison({ ...remote(input),
        expectedRevision: integer(required(input, 'revision')), signal: controller.signal });
    } else if (command === 'source') {
      only(input, [...REMOTE, 'edition', 'sha256', 'source', 'revision']);
      if ((input.source === undefined) !== (input.revision === undefined))
        throw new TypeError('Select the actual Analysis source name and revision together.');
      result = await inspectMerchantODataComparisonSource({ ...remote(input), editionId: required(input, 'edition'),
        expectedSha256: required(input, 'sha256'), signal: controller.signal,
        ...(input.source === undefined ? {} : { source: input.source, sourceRevision: integer(input.revision) }) });
    } else if (command === 'download' || command === 'fetch') {
      only(input, [...REMOTE, 'edition', 'sha256', 'out', 'chunk-size', 'progress', ...(command === 'fetch' ? ['download'] : [])]);
      const options = { ...remote(input), editionId: required(input, 'edition'), expectedSha256: required(input, 'sha256'),
        directory: resolve(required(input, command === 'fetch' ? 'download' : 'out')), signal: controller.signal,
        ...(command === 'fetch' ? { comparisonDirectory: resolve(required(input, 'out')) } : {}),
        chunkSize: integer(input['chunk-size'], 196608),
        ...(boolean(input.progress) ? { onProgress: event => process.stderr.write(JSON.stringify({
          schema: 'stellar-forge.odata-comparison-progress.v1', ...event
        }) + '\n') } : {}) };
      result = await (command === 'fetch' ? fetchODataComparison(options) : downloadMerchantODataComparison(options));
    } else if (command === 'restore-remote') {
      only(input, [...REMOTE, 'source-document', 'source-workspace', 'source-service', 'source-comparison', 'source-edition', 'sha256']);
      result = await restoreMerchantODataComparison({ ...remote(input), expectedSha256: required(input, 'sha256'),
        sourceDocument: input['source-document'], sourceWorkspace: input['source-workspace'],
        sourceLiveServiceId: input['source-service'], sourceComparisonId: input['source-comparison'],
        sourceEditionId: input['source-edition'], signal: controller.signal });
    } else if (command === 'verify-download') {
      only(input, ['directory', 'sha256', 'edition']);
      result = await inspectODataComparisonDownload({ directory: resolve(required(input, 'directory')),
        expectedSha256: input.sha256, editionId: input.edition, signal: controller.signal });
    } else if (command === 'receive') {
      only(input, ['download', 'out', 'sha256', 'edition']);
      result = await receiveODataComparisonDownload({ directory: resolve(required(input, 'download')),
        comparisonDirectory: resolve(required(input, 'out')), expectedSha256: required(input, 'sha256'),
        editionId: input.edition, signal: controller.signal });
    } else if (command === 'inspect-received') {
      only(input, ['directory', 'replay']);
      result = await inspectReceivedODataComparison({ directory: resolve(required(input, 'directory')), replay: boolean(input.replay) });
    } else if (command === 'received-rows') {
      only(input, ['directory', 'kind', 'status', 'offset', 'limit']);
      result = await readReceivedODataComparisonRows({ directory: resolve(required(input, 'directory')),
        kind: input.kind, status: input.status, offset: integer(input.offset, 0), limit: integer(input.limit, 100) });
    } else if (command === 'analysis-mapping') {
      only(input, ['directory', 'source', 'revision', 'out']);
      result = await receivedODataComparisonAnalysisMapping({ directory: resolve(required(input, 'directory')),
        source: required(input, 'source'), sourceRevision: integer(required(input, 'revision')) });
      if (input.out !== undefined) result = { ...result, output: await mappingFile(input.out, result.input) };
    } else throw new TypeError('Unknown OData comparison customer command. Use --help.');
    write(result); return result;
  } finally {
    process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => {
    process.stderr.write(JSON.stringify({ error: typeof error.code === 'string' ? error.code : 'ODATA_COMPARISON_CUSTOMER_FAILED',
      message: error.message }) + '\n'); process.exitCode = 1;
  });
