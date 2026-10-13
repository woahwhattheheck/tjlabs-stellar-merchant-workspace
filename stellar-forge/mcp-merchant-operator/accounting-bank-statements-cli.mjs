#!/usr/bin/env node
// MIT. Original bank-statements operations with retained requests and complete native file delivery.
import {constants} from 'node:fs';
import {open, mkdir, realpath, lstat, rename, unlink, link} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {writePrivate, privateSupportDirectory} from './host-files.mjs';
import {ACCOUNTING_BANK_STATEMENTS_METHODS, ACCOUNTING_BANK_STATEMENTS_MUTATIONS,
  accountingBankStatementsArguments, connectAccountingBankStatementsClient}
  from './accounting-bank-statements-client.mjs';

const REQUEST = 'stellar-forge.accounting-bank-statements-client-request.v1';
const STATE = 'stellar-forge.accounting-bank-statements-client-state.v1';
const OPERATIONS = new Set(Object.values(ACCOUNTING_BANK_STATEMENTS_METHODS));
const MUTATIONS = new Set(ACCOUNTING_BANK_STATEMENTS_MUTATIONS);
const PAGED = new Set(['status','transactions']);
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = () => new Date().toISOString();
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message) => Object.assign(new Error(message), {code: 'ACCOUNTING_BANK_STATEMENTS_CLIENT_' + code});
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
function validateRequest(request) {
  exact(request, ['schema', 'preparedAt', 'url', 'workspace', 'tokenEnv', 'kind', 'arguments', 'preview', 'sha256']);
  const {sha256, ...content} = request;
  need(request.schema === REQUEST && Number.isFinite(Date.parse(request.preparedAt)) &&
    sha(content) === sha256 && endpoint(request.url) === request.url &&
    /^[a-z0-9][a-z0-9_-]{0,63}$/.test(request.workspace ?? '') &&
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(request.tokenEnv ?? ''), 'The retained operation identity changed.', 'REQUEST');
  need(request.preview === undefined,'Retain the complete original native request arguments.');
  const args = accountingBankStatementsArguments(request.kind, request.arguments);
  need(JSON.stringify(args) === JSON.stringify(request.arguments), 'The reviewed original arguments changed.', 'REQUEST');
  return request;
}

/** Retain the complete reviewed request once, including its existing optimistic revision. */
export async function prepareAccountingBankStatementsOperation({
  directory, url, workspace, tokenEnv = 'MCP_ACCESS_TOKEN', kind, arguments: value
} = {}) {
  need(MUTATIONS.has(kind), 'Choose an original bank-statements mutation.');
  need(value !== undefined,'Retain the complete reviewed native request arguments.');
  const args = accountingBankStatementsArguments(kind,value);
  const content = {schema: REQUEST, preparedAt: now(), url: endpoint(url), workspace, tokenEnv,
    kind, arguments: args};
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
export async function runAccountingBankStatementsOperation({
  directory, execute = false, client: providedClient, environment = process.env, signal
} = {}) {
  need(typeof execute === 'boolean', 'Choose whether to execute the prepared original operation.');
  signal?.throwIfAborted();
  return operation(directory, async context => {
    const {request, state, checkpoint} = context;
    const client = providedClient ?? await connectAccountingBankStatementsClient({url: request.url, workspace: request.workspace,
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
export async function downloadAccountingBankStatementsFile({
  client, selection, expectedSha256, output, chunkBytes = 65536, maximumBytes = 128 * 1024 * 1024, signal
} = {}) {
  need(client && typeof client.fileChunks === 'function', 'Use the original bank-statements file consumer.');
  need(Number.isSafeInteger(maximumBytes) && maximumBytes > 0 && maximumBytes <= 128 * 1024 * 1024,
    'Use a complete-file byte limit within the original export size.');
  output = resolve(output);
  const directory = await privateDirectory(dirname(output)), temporary = join(directory, 'bank-statements-' + randomUUID() + '.partial');
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
const HELP = "Bank reconciliation through the original Merchant accounting owner\n\nstarforge merchant-accounting-bank-statements open|workspace-close|configured-sources --url URL --workspace ALIAS [--token-env NAME]\nstarforge merchant-accounting-bank-statements COMMAND --url URL --workspace ALIAS --request PRIVATE_JSON [--all true] [--out NEW_PRIVATE_JSON]\nstarforge merchant-accounting-bank-statements prepare --dir NEW_PRIVATE_OPERATION --url URL --workspace ALIAS --action MUTATION --request COMPLETE_NATIVE_ARGUMENTS\nstarforge merchant-accounting-bank-statements execute|reconcile --dir ORIGINAL_OPERATION\nstarforge merchant-accounting-bank-statements download --url URL --workspace ALIAS --selection PRIVATE_SELECTION --out NEW_PRIVATE_FILE [--sha256 SHA]\n\nRead commands: status, source-preview, transactions, transaction, import, assembly-preview, close-preview, close-detail, request-lookup.\nMutations prepared then executed: account-save, source-import, match, receipt, undo, resolve, close, reopen.\nUse the explicit workspace-close command to close the original accounting owner; close is the bank close mutation.\n\nsource-preview accepts complete inline source bytes or a host-declared receivablesInputs sourceAlias. Save the returned sourceInput with --out and carry those exact bytes into source-import; never resolve a changed alias during replay.\nAll mutations retain the original request ID, actual workspace identity SHA256, revision and operator. Use the typed import/close argument helpers or exact native reviewed arguments. prepare writes the full request before execute.\nexecute looks up the original journal first and makes at most one mutation call if absent. Lost responses reconcile that same original action/intent. Native outcomeUnknown/reopenRequired remain attached to the request.\nstatus --all true requires a non-summary view; transactions --all true reads every physical row at one observed revision. Import/close/preview results remain complete.\nclose-detail --out downloads the complete original account.tar; other read --out writes full JSON. The close archive contains original statement and related customer source. Whole-accounting backup remains the original maintenance workflow.\ndownload uses bank-statements-import/bankStatementImportId or bank-statements-close/bankStatementCloseId plus file. Keep original metadata/SHA. Tokens remain in the selected environment variable.\nExit0 completed/read/prepared;3 request not observed;2 error. No new server or ledger is created.\n";

/** One original session for complete source, capture, recovery and file delivery. */
export async function main(args=process.argv.slice(2)){
 if(!args.length||args.length===1&&['help','--help'].includes(args[0])){process.stdout.write(HELP);return;}
 const [command,...rest]=args,connectionFields=['--url','--workspace','--token-env'];let result;
 if(command==='prepare'){
  const values=options(rest,['--dir',...connectionFields,'--action','--request']);
  result=await prepareAccountingBankStatementsOperation({directory:required(values,'--dir'),url:required(values,'--url'),
   workspace:required(values,'--workspace'),tokenEnv:values.get('--token-env')??'MCP_ACCESS_TOKEN',
   kind:required(values,'--action').replaceAll('-','_'),
   arguments:await readJson(resolve(required(values,'--request')),32*1024*1024)});
 }else if(command==='execute'||command==='reconcile'){
  const values=options(rest,['--dir']);
  result=await runAccountingBankStatementsOperation({directory:required(values,'--dir'),execute:command==='execute'});
 }else{
  const kind=command.replaceAll('-','_'),native=OPERATIONS.has(kind);
  need(native||['open','workspace-close','configured-sources','download'].includes(command),'Choose a documented bank command.');
  need(!MUTATIONS.has(kind),'Retain mutations with prepare, then execute that original operation.');
  const extra=command==='download'?['--selection','--sha256','--out']:native?['--request','--out',...(PAGED.has(kind)?['--all']:[])]:[];
  const values=options(rest,[...connectionFields,...extra]),all=values.has('--all');
  if(all)need(values.get('--all')==='true','Use --all true for the complete original view.');
  const client=await connectAccountingBankStatementsClient({url:required(values,'--url'),workspace:required(values,'--workspace'),
   tokenEnv:values.get('--token-env')??'MCP_ACCESS_TOKEN'});let failure;
  try{
   if(command==='workspace-close')result=await client.closeWorkspace();
   else if(command==='configured-sources')result=await client.configuredSources();
   else{
    result=await client.open();
    if(native){
     const input=values.has('--request')?await readJson(resolve(values.get('--request')),32*1024*1024):{};
     if(!['status','transactions'].includes(kind))required(values,'--request');
     const original=all?await client.listAll(kind,input):await client.callOperation(kind,input);
     if(values.has('--out')&&kind==='close_detail')result={close:original.close,
       ...await downloadAccountingBankStatementsFile({client,selection:original.archive,output:values.get('--out')})};
     else result=values.has('--out')?{output:await savePreview(values.get('--out'),original),revision:original.revision,workspaceId:original.workspaceId}:original;
    }else if(command==='download')result=await downloadAccountingBankStatementsFile({client,
     selection:await readJson(resolve(required(values,'--selection')),65536),expectedSha256:values.get('--sha256'),output:required(values,'--out')});
   }
  }catch(error){failure=error;throw error;}finally{
   try{await client.disconnect();}catch(error){if(failure)failure.releaseError=problem(error);else throw error;}
  }
 }
 process.stdout.write(JSON.stringify(result)+'\n');if(result?.found===false)process.exitCode=3;return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{process.stderr.write(JSON.stringify({error:problem(error)})+'\n');process.exitCode=2;});
