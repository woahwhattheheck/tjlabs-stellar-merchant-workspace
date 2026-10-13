#!/usr/bin/env node
// MIT. Original commissioning operations with retained requests and complete native file delivery.
import {constants} from 'node:fs';
import {open, mkdir, realpath, lstat, rename, unlink, link} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {writePrivate, privateSupportDirectory} from './config.mjs';
import {ACCOUNTING_COMMISSIONING_METHODS, ACCOUNTING_COMMISSIONING_MUTATIONS,
  accountingCommissioningArguments, accountingCommissioningInspection, accountingCommissioningImportArguments,
  accountingCommissioningPreview, accountingCommissioningCaptureArguments, connectAccountingCommissioningClient}
  from './accounting-commissioning-client.mjs';

const REQUEST = 'stellar-forge.accounting-commissioning-client-request.v1';
const STATE = 'stellar-forge.accounting-commissioning-client-state.v1';
const OPERATIONS = new Set(Object.values(ACCOUNTING_COMMISSIONING_METHODS));
const MUTATIONS = new Set(ACCOUNTING_COMMISSIONING_MUTATIONS);
const PAGED = new Set(['source_list', 'source_detail', 'candidates', 'capture_list']);
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = () => new Date().toISOString();
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message) => Object.assign(new Error(message), {code: 'ACCOUNTING_COMMISSIONING_CLIENT_' + code});
function need(ok, message, code = 'ARGUMENTS') { if (!ok) throw fail(code, message); }
/** Preserve the original public recovery decision with its request identity. */
function problem(error) {
  const result = {code: error?.code ?? 'ERROR', message: String(error?.message ?? error).slice(0, 2000)};
  if (error?.applied === false) result.applied = false;
  if (error?.outcomeUnknown === true) result.outcomeUnknown = true;
  if (error?.reopenRequired === true) result.reopenRequired = true;
  if (Number.isInteger(error?.status)) result.status = error.status;
  if (error?.details !== undefined) result.details = error.details;
  if (plain(error?.commitUncertainty)) result.commitUncertainty = Object.fromEntries(
    ['at', 'action', 'revision', 'causeCode'].filter(key => error.commitUncertainty[key] !== undefined)
      .map(key => [key, error.commitUncertainty[key]]));
  for (const key of ['operationDirectory', 'requestId', 'lookupError', 'releaseError', 'checkpointError'])
    if (error?.[key] !== undefined) result[key] = error[key];
  return result;
}
function exact(value, fields) {
  need(plain(value) && Object.keys(value).every(key => fields.includes(key)),
    'The saved operation contains undeclared fields.', 'REQUEST');
}
function endpoint(url) {
  let value; try { value = new URL(url); }
  catch { throw fail('CONFIGURATION', 'Supply the existing HTTPS or loopback HTTP merchant endpoint.'); }
  need(!value.username && !value.password && !value.search && !value.hash &&
    (value.protocol === 'https:' || value.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(value.hostname)),
    'Use the original HTTPS or loopback HTTP endpoint without credentials, query or fragment.', 'CONFIGURATION');
  return value.href;
}
async function privateDirectory(path) {
  path = resolve(path); await privateSupportDirectory(path);
  const info = await lstat(path);
  need(await realpath(path) === path && (!process.getuid || info.uid === process.getuid()),
    'Use an owner-controlled private directory without symlink ancestors.', 'PRIVATE_DIRECTORY');
  return path;
}
async function readJson(path, maximum = 32 * 1024 * 1024) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const info = await file.stat();
    need(info.isFile() && info.nlink === 1 && info.size <= maximum && !(info.mode & 0o077) &&
      (!process.getuid || info.uid === process.getuid()), 'Use the original private regular JSON file.', 'PRIVATE_FILE');
    const bytes = await file.readFile();
    need(bytes.length <= maximum, 'The original operation file grew beyond its size limit.', 'PRIVATE_FILE');
    return JSON.parse(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes));
  } finally { await file.close(); }
}
async function syncDirectory(directory) {
  const file = await open(directory, constants.O_RDONLY);
  try { await file.sync(); } finally { await file.close(); }
}
function fromPreview(kind, preview, identity) {
  const operator = {actor: identity.actor, requestId: identity.requestId};
  if (kind === 'source_import') return accountingCommissioningImportArguments(preview, operator);
  if (kind === 'capture') return accountingCommissioningCaptureArguments(preview, operator);
  throw fail('ARGUMENTS', 'Use the complete inspection for source-import or native preview for capture.');
}
function validateRequest(request) {
  exact(request, ['schema', 'preparedAt', 'url', 'workspace', 'tokenEnv', 'kind', 'arguments', 'preview', 'sha256']);
  const {sha256, ...content} = request;
  need(request.schema === REQUEST && Number.isFinite(Date.parse(request.preparedAt)) &&
    sha(content) === sha256 && endpoint(request.url) === request.url &&
    /^[a-z0-9][a-z0-9_-]{0,63}$/.test(request.workspace ?? '') &&
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(request.tokenEnv ?? ''), 'The retained operation identity changed.', 'REQUEST');
  const args = request.preview === undefined ? accountingCommissioningArguments(request.kind, request.arguments) :
    fromPreview(request.kind, request.preview, request.arguments);
  need(JSON.stringify(args) === JSON.stringify(request.arguments), 'The reviewed original arguments changed.', 'REQUEST');
  return request;
}

/** Retain the complete reviewed request once, including its existing optimistic revision. */
export async function prepareAccountingCommissioningOperation({
  directory, url, workspace, tokenEnv = 'MCP_ACCESS_TOKEN', kind, arguments: value, preview, actor, requestId
} = {}) {
  need(MUTATIONS.has(kind), 'Choose an original commissioning mutation.');
  need(preview === undefined ? value !== undefined && actor === undefined && requestId === undefined : value === undefined,
    'Use original arguments, or a complete source inspection or capture preview and operator identity.');
  const args = preview === undefined ? accountingCommissioningArguments(kind, value) :
    fromPreview(kind, preview, {actor, requestId: requestId ?? randomUUID()});
  const content = {schema: REQUEST, preparedAt: now(), url: endpoint(url), workspace, tokenEnv,
    kind, arguments: args, ...(preview === undefined ? {} : {preview: structuredClone(preview)})};
  const request = validateRequest({...content, sha256: sha(content)}), text = JSON.stringify(request) + '\n';
  need(Buffer.byteLength(text) <= 128 * 1024 * 1024, 'The complete prepared operation exceeds the private 128 MiB envelope.', 'SIZE');
  directory = resolve(directory);
  await privateDirectory(dirname(directory)); await mkdir(directory, {mode: 0o700}); await privateDirectory(directory);
  await writePrivate(join(directory, 'request.json'), text);
  await writePrivate(join(directory, 'state.json'), {schema: STATE, requestSha256: request.sha256,
    phase: 'PREPARED', preparedAt: request.preparedAt, updatedAt: now(), submissionAttempted: false, observation: null});
  await syncDirectory(directory); await syncDirectory(dirname(directory));
  return {directory, kind, requestSha256: request.sha256, arguments: args, phase: 'PREPARED'};
}
async function operation(directory, work) {
  directory = await privateDirectory(directory);
  const lease = await acquireStateLease(directory); let failure;
  try {
    const request = validateRequest(await readJson(join(directory, 'request.json'), 128 * 1024 * 1024));
    const state = await readJson(join(directory, 'state.json'), 128 * 1024 * 1024);
    need(state.schema === STATE && state.requestSha256 === request.sha256 &&
      typeof state.submissionAttempted === 'boolean', 'The operation state belongs to a different request.', 'STATE');
    async function checkpoint(changes) {
      lease.assertHeld(); Object.assign(state, changes, {updatedAt: now()});
      const temporary = join(directory, 'state-' + randomUUID() + '.next');
      try {
        await writePrivate(temporary, state); lease.assertHeld();
        await rename(temporary, join(directory, 'state.json')); await syncDirectory(directory);
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    }
    return await work({directory, request, state, checkpoint});
  } catch (error) { failure = error; throw error; }
  finally {
    try { await lease.close(); }
    catch (error) { if (failure) failure.releaseError = problem(error); else throw error; }
  }
}
/** Read the original request journal first; an explicit execute submits at most one mutation call. */
export async function runAccountingCommissioningOperation({
  directory, execute = false, client: providedClient, environment = process.env, signal
} = {}) {
  need(typeof execute === 'boolean', 'Choose whether to execute the prepared original operation.');
  signal?.throwIfAborted();
  return operation(directory, async context => {
    const {request, state, checkpoint} = context;
    const client = providedClient ?? await connectAccountingCommissioningClient({url: request.url, workspace: request.workspace,
      tokenEnv: request.tokenEnv, environment, signal});
    let failure;
    try {
      need(client.workspace === request.workspace && (!client.endpoint || client.endpoint === request.url),
        'Use the recorded original endpoint and workspace.', 'CONNECTION_BINDING');
      await client.open({requestSignal: signal});
      let observed = await client.reconcileOperation(request.kind, request.arguments, {requestSignal: signal});
      let submitted = false, acknowledged = false;
      if (!observed.found) {
        if (!execute) {
          await checkpoint({phase: 'NOT_OBSERVED', observation: observed});
          return {directory: context.directory, kind: request.kind, found: false,
            previouslyAttempted: state.submissionAttempted, observation: observed};
        }
        await checkpoint({phase: 'SENDING', submissionAttempted: true, sendingAt: now(), sendError: null, lookupError: null});
        try {
          submitted = true;
          observed = {found: true, ...await client.callOperation(request.kind, request.arguments, {requestSignal: signal})};
          acknowledged = true;
        } catch (error) {
          try { await checkpoint({phase: 'UNOBSERVED_REPLY', sendError: problem(error)}); }
          catch (checkpointError) { error.checkpointError = problem(checkpointError); throw error; }
          try { observed = await client.reconcileOperation(request.kind, request.arguments, {timeoutMs: 10000}); }
          catch (lookupError) {
            error.lookupError = problem(lookupError);
            try { await checkpoint({lookupError: problem(lookupError)}); }
            catch (checkpointError) { error.checkpointError = problem(checkpointError); }
            throw error;
          }
          if (!observed.found) throw error;
        }
      }
      await checkpoint({phase: 'OBSERVED', observation: observed, lookupError: null});
      return {directory: context.directory, kind: request.kind, submitted, acknowledged, ...observed};
    } catch (error) {
      failure = error; error.operationDirectory = context.directory; error.requestId = request.arguments.requestId;
      throw error;
    } finally {
      if (!providedClient) try { await client.disconnect(); }
      catch (error) { if (failure) failure.releaseError = problem(error); else throw error; }
    }
  });
}

/** Save complete bytes through the original retained reader and create the destination once. */
export async function downloadAccountingCommissioningFile({
  client, selection, expectedSha256, output, chunkBytes = 65536, maximumBytes = 12128 * 1024 * 1024, signal
} = {}) {
  need(client && typeof client.fileChunks === 'function', 'Use the original commissioning file consumer.');
  need(Number.isSafeInteger(maximumBytes) && maximumBytes > 0 && maximumBytes <= 12128 * 1024 * 1024,
    'Use a complete-file byte limit within the original export size.');
  output = resolve(output);
  const directory = await privateDirectory(dirname(output)), temporary = join(directory, 'commissioning-' + randomUUID() + '.partial');
  const handle = await open(temporary, 'wx', 0o600); let metadata, bytes = 0;
  try {
    for await (const chunk of client.fileChunks(selection, {expectedSha256, chunkBytes, signal})) {
      metadata ??= chunk.file;
      need(Number.isSafeInteger(metadata.bytes) && metadata.bytes <= maximumBytes &&
        bytes + chunk.bytes.length <= maximumBytes, 'The original file exceeds the selected byte limit.', 'FILE_SIZE');
      await handle.writeFile(chunk.bytes); bytes += chunk.bytes.length;
    }
    need(metadata && bytes === metadata.bytes, 'The original file snapshot did not finish.', 'FILE_REPLY');
    await handle.sync(); await handle.close(); await link(temporary, output); await unlink(temporary); await syncDirectory(directory);
    return {output, workspace: client.workspace, selection: structuredClone(selection), file: metadata, complete: true};
  } catch (error) { await handle.close().catch(() => {}); await unlink(temporary).catch(() => {}); throw error; }
}
async function savePreview(output, preview) {
  output = resolve(output); const directory = await privateDirectory(dirname(output));
  await writePrivate(output, preview); await syncDirectory(directory); return output;
}
function options(args, allowed) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    need(allowed.includes(args[index]) && !values.has(args[index]) && args[index + 1] !== undefined,
      'Use documented option/value pairs without duplicates.');
    values.set(args[index], args[index + 1]);
  }
  return values;
}
function required(values, name) {
  need(values.has(name) && values.get(name), 'Supply ' + name + '.'); return values.get(name);
}
const HELP = "Merchant commissioning collections through the existing MCP accounting owner\n\n  starforge merchant-accounting-commissioning open|close|configured-sources\n      --url MCP_URL --workspace ALIAS [--token-env NAME]\n  starforge merchant-accounting-commissioning COMMAND ...\n      --request PRIVATE_ARGUMENTS_JSON\n  starforge merchant-accounting-commissioning source-inspect|preview ...\n      --request PRIVATE_INPUT_JSON [--out NEW_PRIVATE_REVIEW_JSON]\n  starforge merchant-accounting-commissioning prepare --dir NEW_PRIVATE_OPERATION\n      --url MCP_URL --workspace ALIAS --action source-import|capture\n      --preview PRIVATE_INSPECTION_OR_PREVIEW_JSON --actor NAME [--request-id ID]\n  starforge merchant-accounting-commissioning prepare ... --action source-import|capture\n      --request PRIVATE_ORIGINAL_ARGUMENTS_JSON\n  starforge merchant-accounting-commissioning execute|reconcile --dir PRIVATE_OPERATION\n  starforge merchant-accounting-commissioning capture-export ...\n      --request PRIVATE_CAPTURE_SELECTION_JSON [--out NEW_PRIVATE_HANDOVER_TAR]\n  starforge merchant-accounting-commissioning download ...\n      --selection PRIVATE_FILE_SELECTION_JSON --out NEW_PRIVATE_FILE [--sha256 SHA]\n\nCommands: source-inspect, source-import, source-list, source-detail, candidates,\npreview, capture, capture-list, capture-detail, capture-export, request-lookup.\n\nsource-inspect accepts exact inline file bytes or a declared receivablesInputs\nsourceAlias with file.name. Its complete inspection includes sourceInput with\nthe actual resolved bytes. Save that result using --out before preparing an\nimport. Imports retain the inspected bytes and never reread a changed alias.\nSource bytes are limited by the original native 8 MiB contract; the existing\nMCP transport permits 32 MiB requests. This client explicitly allows replies\nup to the original transport 128 MiB maximum for complete source and review data.\n\npreview receives sourceId plus the full cohort selection and returns the exact\nnormalized selection, native review and SHA. prepare validates that complete\nreview and preserves it in the private operation directory. It also accepts\na complete inspection for source-import. Metadata can be retained in the\ninspection sourceInput or supplied in exact --request arguments.\n\nexecute first checks the original journal and submits at most one mutation\nwhen absent. reconcile checks the original action, source selection and intent\nhash. Both retain the same request ID and optimistic revision. A lost reply\ngets one journal lookup; later execute is explicit. Original outcomeUnknown,\nreopenRequired and commitUncertainty fields are retained with the saved request.\n\nPaged reads accept --all true at one original revision and accounting date.\nsource-detail requires view projects or history for paging. Other detail and\nexport commands retain their complete original source representation.\n\ncapture-export --out saves handover.tar through the original SHA-pinned file\nreader. This private archive includes the COMPLETE original accounting ledger\nand customer identities. Selected project HTML/CSV reports are separate files.\ndownload supports commissioning-source/sourceId and commissioning-capture/\ncaptureId with the exact original file name. Partial reads are released.\n\nOrdinary commands release this caller's reads. close explicitly closes the\noriginal accounting owner. Tokens stay in the selected environment variable.\nExit 0: completed, prepared or read. Exit 3: prepared request absent. Exit 2: error.\n";

/** One original session for complete source, capture, recovery and file delivery. */
export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.length === 1 && ['--help', 'help'].includes(args[0])) {
    process.stdout.write(HELP); return;
  }
  const [command, ...rest] = args, connectionFields = ['--url', '--workspace', '--token-env']; let result;
  if (command === 'prepare') {
    const values = options(rest, ['--dir', ...connectionFields, '--action', '--request', '--preview', '--actor', '--request-id']);
    const kind = required(values, '--action').replaceAll('-', '_'), previewMode = values.has('--preview');
    need(previewMode ? !values.has('--request') : values.has('--request') && !values.has('--actor') && !values.has('--request-id'),
      'Use --request, or use the complete --preview with --actor and an optional --request-id.');
    result = await prepareAccountingCommissioningOperation({
      directory: required(values, '--dir'), url: required(values, '--url'), workspace: required(values, '--workspace'),
      tokenEnv: values.get('--token-env') ?? 'MCP_ACCESS_TOKEN', kind,
      ...(previewMode ? {preview: await readJson(resolve(required(values, '--preview')), 128 * 1024 * 1024),
        actor: required(values, '--actor'), requestId: values.get('--request-id')} :
        {arguments: await readJson(resolve(required(values, '--request')), 32 * 1024 * 1024)})
    });
  } else if (command === 'execute' || command === 'reconcile') {
    const values = options(rest, ['--dir']);
    result = await runAccountingCommissioningOperation({directory: required(values, '--dir'), execute: command === 'execute'});
  } else {
    const kind = command.replaceAll('-', '_'), native = OPERATIONS.has(kind);
    need(native || ['open', 'close', 'configured-sources', 'download'].includes(command),
      'Choose a documented commissioning command.');
    const extra = command === 'download' ? ['--selection', '--sha256', '--out'] : native ?
      ['--request', ...(PAGED.has(kind) ? ['--all'] : []),
        ...(['source_inspect', 'preview', 'capture_export'].includes(kind) ? ['--out'] : [])] : [];
    const values = options(rest, [...connectionFields, ...extra]);
    const all = values.has('--all');
    if (all) need(values.get('--all') === 'true' && !values.has('--out'),
      'Use --all true for a complete original paged view.');
    const client = await connectAccountingCommissioningClient({url: required(values, '--url'),
      workspace: required(values, '--workspace'), tokenEnv: values.get('--token-env') ?? 'MCP_ACCESS_TOKEN'});
    let failure;
    try {
      if (command === 'close') result = await client.closeWorkspace();
      else if (command === 'configured-sources') result = await client.configuredSources();
      else {
        result = await client.open();
        if (native) {
          if (!['source_list', 'capture_list', 'candidates'].includes(kind)) required(values, '--request');
          const input = values.has('--request') ? await readJson(resolve(values.get('--request')), 32 * 1024 * 1024) : {};
          if (all) result = await client.listAll(kind, input);
          else if (kind === 'source_inspect' || kind === 'preview') {
            const preview = kind === 'source_inspect' ? await client.inspectSource(input) : await client.preview(input);
            result = values.has('--out') ? {output: await savePreview(values.get('--out'), preview),
              revision: preview.revision, ...(kind === 'source_inspect' ?
                {file: preview.file, projectCount: preview.projectCount} :
                {sourceId: preview.source.id, previewSha256: preview.previewSha256, status: preview.review.status})} : preview;
          } else if (kind === 'capture_export' && values.has('--out')) {
            const packet = await client.export(input);
            result = {captureId: packet.value.id, scope: packet.scope,
              ...await downloadAccountingCommissioningFile({client, selection: packet.archive, output: values.get('--out')})};
          } else {
            try { result = await client.callOperation(kind, input); }
            catch (error) {
              if (MUTATIONS.has(kind)) {
                error.requestId = input.requestId;
                try {
                  const observed = await client.reconcileOperation(kind, input, {timeoutMs: 10000});
                  if (observed.found) result = observed; else throw error;
                } catch (lookupError) {
                  if (lookupError !== error) error.lookupError = problem(lookupError);
                  throw error;
                }
              } else throw error;
            }
          }
        } else if (command === 'download') result = await downloadAccountingCommissioningFile({
          client, selection: await readJson(resolve(required(values, '--selection')), 65536),
          expectedSha256: values.get('--sha256'), output: required(values, '--out')
        });
      }
    } catch (error) { failure = error; throw error; }
    finally {
      try { await client.disconnect(); }
      catch (error) { if (failure) failure.releaseError = problem(error); else throw error; }
    }
  }
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result?.found === false) process.exitCode = 3;
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { process.stderr.write(JSON.stringify({error: problem(error)}) + '\n'); process.exitCode = 2; });
