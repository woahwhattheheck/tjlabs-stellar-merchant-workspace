#!/usr/bin/env node
import {open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {openCaseStore} from './case-store.mjs';
import {commercialWorkspaceId} from './case-commercial.mjs';
import {openCaseServiceRenewals} from './case-service-renewals.mjs';

const INPUT_LIMIT = 131072;
const HELP = `Service renewals

Usage:
  node service-renewals-cli.mjs <command> --cases-dir <directory> [options]

Commands:
  queue     --as-of <UTC> [--through <UTC>] [--notice-days <integer>]
            [--q <text>] [--offset <integer>] [--limit <integer>] [--include-closed]
  read      --case <UUID> [--revision <case SHA-256>]
  preview   --case <UUID> --expected-revision <case SHA-256> --input <JSON file|->
  propose   --case <UUID> --expected-revision <case SHA-256> --request-id <UUID>
            --input <JSON file|->
  decide    --case <UUID> --expected-revision <case SHA-256> --request-id <UUID>
            --input <JSON file|->
  handover  --case <UUID> --renewal <UUID> [--revision <case SHA-256>]
  ids       Print new renewal and request UUIDs.
  help      Print this help.

UTC timestamps must include milliseconds, for example 2026-10-12T12:00:00.000Z.
The input file contains the core renewal inputs. The CLI supplies requestId and
expectedCaseRevision from the original outer request. Keep request IDs and the
complete original request unchanged when retrying after a lost response.
All successful commands emit JSON to standard output.
`;

const OPTIONS = {
  queue: ['cases-dir','as-of','through','notice-days','q','offset','limit','include-closed'],
  read: ['cases-dir','case','revision'],
  preview: ['cases-dir','case','expected-revision','input'],
  propose: ['cases-dir','case','expected-revision','request-id','input'],
  decide: ['cases-dir','case','expected-revision','request-id','input'],
  handover: ['cases-dir','case','renewal','revision'],
  ids: [], help: []
};
function fail(message) {
  throw Object.assign(new Error(message), {code: 'SERVICE_RENEWAL_CLI_ARGUMENT', status: 422});
}
function parse(argv) {
  const command = argv[0] ?? 'help';
  if (!Object.hasOwn(OPTIONS, command)) fail('Choose a command from help.');
  const options = {};
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) fail('Expected an option, received ' + token + '.');
    const key = token.slice(2);
    if (!OPTIONS[command].includes(key)) fail('Unknown ' + command + ' option: --' + key + '.');
    if (Object.hasOwn(options, key)) fail('Use --' + key + ' once.');
    if (key === 'include-closed') options[key] = true;
    else {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) fail('Provide a value for --' + key + '.');
      options[key] = value;
    }
  }
  return {command, options};
}
function required(options, key) {
  const value = options[key];
  if (typeof value !== 'string' || !value.trim()) fail('Provide --' + key + '.');
  return value;
}
function number(options, key) {
  if (options[key] === undefined) return undefined;
  if (!/^(0|[1-9][0-9]*)$/.test(options[key])) fail('Use a nonnegative integer for --' + key + '.');
  const value = Number(options[key]);
  if (!Number.isSafeInteger(value)) fail('--' + key + ' is too large.');
  return value;
}
async function inputFile(options, stdin) {
  const filename = required(options, 'input');
  let source;
  if (filename === '-') source = await stdin();
  else {
    const file = await open(resolve(filename), 'r');
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > INPUT_LIMIT) fail('Use a renewal JSON file of at most 128 KiB.');
      const buffer = Buffer.alloc(INPUT_LIMIT + 1);
      let length = 0;
      while (length < buffer.length) {
        const part = await file.read(buffer, length, buffer.length - length, length);
        if (!part.bytesRead) break;
        length += part.bytesRead;
      }
      if (length > INPUT_LIMIT) fail('Keep renewal input at most 128 KiB.');
      source = buffer.subarray(0, length).toString('utf8');
    } finally { await file.close(); }
  }
  if (Buffer.byteLength(source, 'utf8') > INPUT_LIMIT) fail('Keep renewal input at most 128 KiB.');
  let input;
  try { input = JSON.parse(source); } catch { fail('The renewal input must be complete JSON.'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('The renewal input must be a JSON object.');
  return input;
}
async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > INPUT_LIMIT) fail('Keep renewal input at most 128 KiB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export async function runServiceRenewalsCli(argv, {stdout = text => process.stdout.write(text),
  stderr = text => process.stderr.write(text), stdin = readStdin} = {}) {
  try {
    const {command, options} = parse(argv);
    if (command === 'help') { stdout(HELP); return 0; }
    if (command === 'ids') {
      stdout(JSON.stringify({renewalId: randomUUID(), requestId: randomUUID()}, null, 2) + '\n');
      return 0;
    }
    const casesDirectory = resolve(required(options, 'cases-dir'));
    const caseStore = await openCaseStore(casesDirectory);
    const desk = openCaseServiceRenewals({caseStore, workspaceId: commercialWorkspaceId(casesDirectory)});
    let result;
    if (command === 'queue') {
      result = await desk.queue({
        asOf: required(options, 'as-of'), through: options.through,
        noticeDays: number(options, 'notice-days'), q: options.q,
        offset: number(options, 'offset'), limit: number(options, 'limit'),
        includeClosed: options['include-closed'] ?? false
      });
    } else if (command === 'read') {
      result = await desk.read({id: required(options, 'case'), revision: options.revision});
    } else if (command === 'handover') {
      result = await desk.handover({
        id: required(options, 'case'), revision: options.revision, renewalId: required(options, 'renewal')
      });
    } else {
      const args = {
        id: required(options, 'case'), expectedRevision: required(options, 'expected-revision'),
        input: await inputFile(options, stdin)
      };
      if (command !== 'preview') args.requestId = required(options, 'request-id');
      result = await desk[command](args);
    }
    stdout(JSON.stringify(result, null, 2) + '\n');
    return 0;
  } catch (error) {
    stderr(JSON.stringify({error: {code: error.code ?? 'SERVICE_RENEWAL_CLI_ERROR',
      message: error.message, status: error.status ?? 500}}) + '\n');
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runServiceRenewalsCli(process.argv.slice(2));
}
