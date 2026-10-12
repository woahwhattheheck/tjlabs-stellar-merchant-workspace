#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Exercise the installed catalog and native request workflow against its real host.
import { readFile, writeFile, rename, mkdir, open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpus, loadavg, totalmem } from 'node:os';
import { openNativeRequestClient } from './native-request-client.mjs';
import { normalizeDiscoveryArguments } from './discovery.mjs';

const SCHEMA = 'stellar-forge.catalog-native-journey.v1';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const need = (condition, code, message) => {
  if (!condition) throw Object.assign(new Error(message), {code});
};
const atomic = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
const identity = resource => JSON.stringify([resource.resource?.url, resource.resourceType,
  resource.method, resource.toolName]);
function failure(error) {
  return {code:error?.code ?? 'CATALOG_JOURNEY_FAILED', message:String(error?.message ?? error),
    ...(error?.data === undefined ? {} : {data:error.data}),
    ...(error?.nativeRequest === undefined ? {} : {nativeRequest:error.nativeRequest})};
}
function selectionMatches(resource, workspace) {
  if (resource.resourceType !== 'http' || resource.method !== workspace.route.method) return false;
  try {
    const url = new URL(resource.resource.url);
    return url.origin === workspace.route.origin && url.pathname === workspace.route.pathname;
  } catch { return false; }
}
function acceptedIndex(description, workspace, maximum) {
  return description.accepts.findIndex(option => atomic(option.amount) &&
    ['network','scheme','asset','payTo'].every(key => option[key] === workspace.payment[key]) &&
    BigInt(option.amount) <= BigInt(maximum));
}
function normalize(raw) {
  need(plain(raw) && Object.keys(raw).every(key => [
    'url','tokenEnv','workspaceId','intentId','maxAtomic','input','discovery','sourceRevision',
  ].includes(key)), 'CATALOG_JOURNEY_INPUT_INVALID', 'Use the documented native journey configuration.');
  need(typeof raw.url === 'string' && raw.url.length > 0 &&
    atomic(raw.maxAtomic) && BigInt(raw.maxAtomic) > 0n && plain(raw.input), 'CATALOG_JOURNEY_INPUT_INVALID',
  'Supply the running MCP endpoint, a positive explicit atomic cap, and the actual request input.');
  need(raw.tokenEnv === undefined || typeof raw.tokenEnv === 'string' &&
    /^[A-Z][A-Z0-9_]{0,127}$/.test(raw.tokenEnv), 'CATALOG_JOURNEY_INPUT_INVALID',
  'Select an environment-variable name for the existing MCP token.');
  need(raw.workspaceId === undefined || typeof raw.workspaceId === 'string' &&
    /^[a-z0-9][a-z0-9-]{0,63}$/.test(raw.workspaceId), 'CATALOG_JOURNEY_INPUT_INVALID',
  'Choose an exact configured workspace ID from the existing native host.');
  const intentId = raw.intentId ?? 'catalog-journey-' + randomUUID();
  need(typeof intentId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(intentId),
    'CATALOG_JOURNEY_INPUT_INVALID', 'Use a stable original native intent ID.');
  need(raw.sourceRevision === undefined || typeof raw.sourceRevision === 'string' &&
    /^[0-9a-f]{40}$/.test(raw.sourceRevision), 'CATALOG_JOURNEY_INPUT_INVALID',
  'A source revision, when supplied, is the complete source commit SHA.');
  const discovery = raw.discovery ?? {mode:'resources', arguments:{limit:5}};
  need(plain(discovery) && ['resources','search'].includes(discovery.mode) &&
    Object.keys(discovery).every(key => ['mode','arguments'].includes(key)),
  'CATALOG_JOURNEY_INPUT_INVALID', 'Choose the original resources or search mode.');
  const args = normalizeDiscoveryArguments(discovery.mode, discovery.arguments ?? {});
  need(discovery.mode === 'resources' ? args.offset === 0 : args.cursor === undefined,
    'CATALOG_JOURNEY_INPUT_INVALID', 'Start at the original first page to measure complete continuation.');
  return {...raw, intentId, input:structuredClone(raw.input),
    discovery:{mode:discovery.mode, arguments:args}};
}

/**
 * Capture the complete discovery walk, prepare the first matching later-page
 * service immediately while its handle is live, then complete its original
 * native request. The host continues to own operator approval and signing.
 */
export async function runCatalogNativeJourney({configuration, directory, signal,
  environment = process.env, onProgress = () => {}}) {
  const request = normalize(configuration);
  need(typeof directory === 'string' && isAbsolute(directory) &&
    resolve(directory) === directory && !directory.includes('\0'),
  'CATALOG_JOURNEY_OUTPUT_INVALID', 'Use a new absolute output directory.');
  await mkdir(directory, {mode:0o700});
  const started = new Date().toISOString();
  const report = {schema:SCHEMA, startedAt:started, intentId:request.intentId,
    endpoint:request.url, workspaceId:request.workspaceId ?? null, sourceRevision:request.sourceRevision ?? null,
    sourceRevisionKind:'OPERATOR_SELECTED_CHECKOUT', status:'RUNNING',
    runtime:{node:process.version, platform:process.platform, arch:process.arch,
      logicalCPUs:cpus().length, loadAverage:loadavg(), totalMemoryBytes:totalmem()},
    request:{maxAtomic:request.maxAtomic, input:request.input, discovery:request.discovery},
    timingScope:'THIS_CLIENT_PROCESS_AND_OBSERVED_MCP_ROUND_TRIPS',
    phaseRelationship:'COMPLETE_DISCOVERY_INCLUDES_SELECTED_PREPARATION',
    phases:[], coverage:{pages:0, received:0, returned:0, filtered:0, invalid:0,
      http:0, mcp:0, repeatedResources:0, upstreamPartialPages:0, exhausted:false},
    selection:null, native:null, result:null};
  const checkpoint = async () => {
    const temporary = join(directory, '.run.json.tmp');
    await writeFile(temporary, json(report), {mode:0o600});
    await rename(temporary, join(directory, 'run.json'));
  };
  const sourceFiles = ['native-request-client.mjs','discovery-client.mjs','discovery.mjs'];
  report.runtime.sources = await Promise.all(sourceFiles.map(async path => {
    const raw = await readFile(new URL('./' + path, import.meta.url));
    return {path,bytes:raw.length,sha256:hash(raw),
      gitBlob:createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex')};
  }));
  await checkpoint();
  const notify = value => onProgress({intentId:request.intentId, ...value});
  async function phase(name, operation) {
    signal?.throwIfAborted();
    const start = performance.now(), cpu = process.cpuUsage(), before = process.memoryUsage();
    let error;
    try { return await operation(); }
    catch (caught) { error = caught; throw caught; }
    finally {
      const used = process.cpuUsage(cpu);
      report.phases.push({name, elapsedMs:performance.now()-start,
        clientCPU:{userMs:used.user/1000, systemMs:used.system/1000},
        memoryBefore:before, memoryAfter:process.memoryUsage(),
        ...(error ? {error:failure(error)} : {})});
      await checkpoint();
    }
  }
  let client, pages, descriptions;
  const seen = new Set();
  try {
    client = await phase('connect', () => openNativeRequestClient({
      url:request.url, workspaceId:request.workspaceId, tokenEnv:request.tokenEnv, environment, signal}));
    report.workspace = await phase('workspace', () => client.workspace());
    const selected = report.workspace.workspaceId === undefined
      ? client : client.forWorkspace(report.workspace.workspaceId);
    if (report.workspace.workspaceId !== undefined)
      report.workspaceId = report.workspace.workspaceId;
    need(BigInt(request.maxAtomic) <= BigInt(report.workspace.payment.maxAtomic),
      'CATALOG_JOURNEY_CAP_EXCEEDS_WORKSPACE', 'The explicit request cap exceeds this native workspace.');
    pages = await open(join(directory, 'catalog-pages.ndjson'), 'wx', 0o600);
    descriptions = await open(join(directory, 'resource-descriptions.ndjson'), 'wx', 0o600);
    let prepared;
    const iterator = request.discovery.mode === 'resources'
      ? client.discovery.browsePages(request.discovery.arguments, {signal})
      : client.discovery.searchPages(request.discovery.arguments, {signal});
    await phase('complete-discovery', async () => {
      for await (const page of iterator) {
        const pageIndex = report.coverage.pages++;
        await pages.writeFile(JSON.stringify({pageIndex, ...page}) + '\n');
        for (const key of ['received','returned','filtered','invalid'])
          report.coverage[key] += page.page[key];
        if (page.partialResults) report.coverage.upstreamPartialPages++;
        for (const resource of page.resources) {
          report.coverage[resource.resourceType]++;
          const key = identity(resource);
          if (seen.has(key)) report.coverage.repeatedResources++;
          seen.add(key);
          const description = await client.discovery.describe(resource.handle, {signal});
          await descriptions.writeFile(JSON.stringify({pageIndex, ...description}) + '\n');
          if (prepared || pageIndex === 0 || !selectionMatches(resource, report.workspace)) continue;
          const acceptIndex = acceptedIndex(description, report.workspace, request.maxAtomic);
          if (acceptIndex < 0) continue;
          const source = description.source;
          need(typeof source?.pageSha256 === 'string' && /^[0-9a-f]{64}$/.test(source.pageSha256) &&
            Number.isSafeInteger(source.pageBytes) && source.pageBytes > 0 &&
            Number.isSafeInteger(source.rowIndex) && source.rowIndex >= 0 &&
            source.rowIndex < page.page.received && source.pageSha256 === page.source.pageSha256 &&
            source.pageBytes === page.source.pageBytes,
          'CATALOG_JOURNEY_SOURCE_INVALID', 'The description must identify its complete original provider page and original row.');
          need(source.pageBytes <= report.workspace.limits.sourcePageBytes,
            'CATALOG_JOURNEY_NATIVE_PAGE_LIMIT', 'Use smaller real catalog pages for the original native preparer.');
          report.selection = {pageIndex, handle:resource.handle, resource:resource.resource,
            source:description.source, acceptIndex, accepted:description.accepts[acceptIndex]};
          notify({phase:'prepare', pageIndex, resource:resource.resource.url});
          prepared = await phase('prepare-selected-later-page', () => selected.prepare({
            intentId:request.intentId, handle:resource.handle, acceptIndex,
            maxAtomic:request.maxAtomic, input:request.input}, {signal}));
          need(prepared.preparation.pageSha256 === description.source.pageSha256 &&
            prepared.preparation.rowIndex === description.source.rowIndex,
          'CATALOG_JOURNEY_SOURCE_CHANGED', 'The retained native request differs from its original selected page.');
          report.native = prepared;
        }
        notify({phase:'discovery-page', pageIndex, received:page.page.received,
          returned:page.page.returned, continuation:page.continuation});
      }
      report.coverage.exhausted = true;
      await pages.sync(); await descriptions.sync();
    });
    need(prepared, 'CATALOG_JOURNEY_LATER_PAGE_SERVICE_REQUIRED',
      'No service matching the configured native route and payment terms appeared after the first original page.');
    // Reopen the durable identity after the complete walk, including any cache
    // retirement caused by later pages. Execution uses this intent, never a new search.
    report.native = await phase('reopen-native-review', () => selected.review(request.intentId, {signal}));
    need(report.native.availableActions.includes('execute') && !report.native.attempt,
      'CATALOG_JOURNEY_ORIGINAL_INTENT_NOT_QUEUED', 'Continue this existing intent through its original native history.');
    notify({phase:'execute', approval:'ORIGINAL_HOST_OPERATOR', intentId:request.intentId});
    report.execution = await phase('original-native-execute', () => selected.execute(request.intentId, {signal}));
    if (report.execution.execution === 'OPERATOR_BUSY')
      throw Object.assign(new Error('The original operator is busy. Continue this queued intent in the same workspace after the active operation finishes.'), {
        code:'CATALOG_JOURNEY_OPERATOR_BUSY',
        nativeRequest:{workspaceId:report.workspaceId,intentId:request.intentId,action:'execute'},
      });
    report.native = await phase('reopen-native-result', () => selected.review(request.intentId, {signal}));
    need(report.native.availableActions.includes('read'), 'CATALOG_JOURNEY_RESULT_NOT_AVAILABLE',
      'The original native attempt has no saved response ready to read; inspect its retained result and recovery fields.');
    report.result = await phase('complete-saved-result', () => selected.downloadResult({
      intentId:request.intentId, destination:join(directory, 'result.bin')}, {signal}));
    report.history = await phase('original-history', async () => {
      let pageCount = 0;
      for await (const page of selected.historyPages({}, {signal})) {
        pageCount++;
        const record = page.records.find(record => record.intentId === request.intentId);
        if (record) return {pageCount, total:page.total, record};
      }
      throw Object.assign(new Error('The original inbox did not return its completed intent.'), {
        code:'CATALOG_JOURNEY_HISTORY_MISSING'});
    });
    report.status = 'COMPLETED';
    return report;
  } catch (error) {
    report.status = 'FAILED'; report.error = failure(error);
    throw Object.assign(error, {catalogJourney:{directory, intentId:request.intentId,
      report:join(directory, 'run.json')}});
  } finally {
    report.finishedAt = new Date().toISOString();
    report.resourceUsage = process.resourceUsage();
    await Promise.allSettled([pages?.close(), descriptions?.close(), client?.close()]);
    await checkpoint();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const usage = [
    'Usage: starforge mcp-catalog-journey --config /absolute/request.json --out /absolute/new-run',
    '',
    'Walk the configured catalog, prepare a matching later-page service, and complete its native request.',
    'The configuration supplies url, a positive maxAtomic, actual input, and optional workspaceId/discovery.',
    'Keep the existing operator console available for approval. The output directory must be new.',
    'See CATALOG_JOURNEY.md for configuration, phase measurements and saved-result continuation.',
  ].join('\n');
  if (args.length === 1 && ['--help','-h'].includes(args[0])) {
    process.stdout.write(usage + '\n');
    return;
  }
  need(args.length === 4 && args[0] === '--config' && args[2] === '--out',
    'CATALOG_JOURNEY_ARGUMENTS', usage);
  const source = resolve(args[1]), raw = await readFile(source);
  need(raw.length <= 1048576, 'CATALOG_JOURNEY_CONFIG_TOO_LARGE', 'Use a request configuration of at most one MiB.');
  const configuration = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(raw));
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const result = await runCatalogNativeJourney({configuration, directory:resolve(args[3]),
      signal:controller.signal, onProgress:value => process.stderr.write(JSON.stringify(value) + '\n')});
    process.stdout.write(json({schema:result.schema,status:result.status,intentId:result.intentId,
      sourceRevision:result.sourceRevision,coverage:result.coverage,result:result.result}));
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch(error => {
    process.stderr.write(json({...failure(error),catalogJourney:error.catalogJourney ?? null}));
    process.exitCode = 1;
  });
