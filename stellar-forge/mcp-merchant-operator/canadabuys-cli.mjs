#!/usr/bin/env node
// MIT. Installed CanadaBuys customer: original MCP operations and complete local receiving.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writePrivate } from './host-files.mjs';
import { openCanadaBuysMerchantClient, canadaBuysTools, canadaBuysToolName,
  canadaBuysClientError, CANADABUYS_TOOL_PREFIX } from './canadabuys-client.mjs';
import { inspectCanadaBuysPublication, downloadCanadaBuysPublication, verifyCanadaBuysDownload,
  receiveCanadaBuysPackage } from './canadabuys-download.mjs';
import { canadaBuysCustomerConnectionTemplate, normalizeCanadaBuysCustomerConnection,
  readCanadaBuysCustomerJson, bindCanadaBuysCustomerConnection, prepareCanadaBuysOperation,
  showCanadaBuysOperation, executeCanadaBuysOperation, adoptCanadaBuysPublication,
  prepareCanadaBuysEvidenceIntake, refreshCanadaBuysEvidenceIntake, prepareCanadaBuysIntakeOperation,
  CANADABUYS_CUSTOMER_OPERATION_SCHEMA } from './canadabuys-operations.mjs';

export const HELP = "CanadaBuys customer\n\n  canadabuys-customer tools [--out tools.json]\n  canadabuys-customer connection-template --out connection.json\n  canadabuys-customer bind --connection connection.json --out bound-connection.json\n  canadabuys-customer read --connection bound-connection.json --tool status\n    [--args request.json] [--all] [--out result.json]\n  canadabuys-customer plan --connection bound-connection.json --directory operation\n    --operation-id original-id --tool bidder_create --args request.json [--out plan.json]\n  canadabuys-customer show --directory operation [--out observation.json]\n  canadabuys-customer run --directory operation [--timeout-ms 120000] [--out response.json]\n  canadabuys-customer publication-selection --directory operation --out selection.json\n  canadabuys-customer adopt-publication --directory operation --evidence selection.json [--out response.json]\n  canadabuys-customer inspect-publication --connection bound-connection.json\n    --publication-id original-uuid [--out manifest-inspection.json]\n  canadabuys-customer download --connection bound-connection.json --publication-id original-uuid\n    --directory original-download [--manifest-sha256 reviewed-sha] [--chunk-size 196608] [--out receipt.json]\n  canadabuys-customer verify --directory original-download --publication-id original-uuid\n    [--manifest-sha256 reviewed-sha] [--out receipt.json]\n  canadabuys-customer receive --directory original-download --publication-id original-uuid\n    --workspace-directory original-customer-workspace --expected-revision 0\n    [--manifest-sha256 reviewed-sha] [--operator customer] [--title \"Procurement desk\"] [--out receipt.json]\n  canadabuys-customer intake-template --out documents.json\n  canadabuys-customer prepare-intake --connection bound-connection.json\n    --manifest documents.json --request-out native-intake.json [--out preparation.json]\n  canadabuys-customer refresh-intake --connection bound-connection.json\n    --request native-intake.json --request-out native-intake-refreshed.json [--out refresh.json]\n  canadabuys-customer intake-plan --connection bound-connection.json --input declared-intake\n    --directory original-intake-operation --operation-id original-id\n    [--expected-sha256 inspected-file-sha] [--out plan.json]\n\nThe connection contains only the existing endpoint, environment variable name,\nconfigured alias and observed native workspace UUID. Keep JSON inputs private\n(mode 0600). bind opens that existing alias; it does not create host configuration.\n\nread permits only original read-only tools. --all completes one stable revision\nof a paged collection. Changes use plan/run: review the exact retained request,\nthen run it. The original commandId gives bidder creates/updates their native\ndeduplication. An unknown non-idempotent export remains unresolved until you\nselect its already-published UUID; publication adoption never exports again.\n\ndownload saves every original listed file and a complete client manifest.\nverify and receive work offline. receive uses the original native SQLite model\n(Node 24 or later) and retains conflicts and later local decisions. Linux flock\n(util-linux) owns the local operation/download lease. An output file is created\nexclusively; choose a new output path for a later observation. Disconnecting this\nclient closes its read leases, not the saved application or merchant.\n";
const need = (value, message) => { if (!value) throw canadaBuysClientError('CLI', message); };
const integer = (value, label, fallback) => {
  if (value === undefined) return fallback;
  need(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && Number.isSafeInteger(Number(value)),
    label + ' must be an exact nonnegative integer.');
  return Number(value);
};
function flags(args, allowed, required = []) {
  const value = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i]; need(key.startsWith('--') && allowed.includes(key.slice(2)), 'Unknown or positional argument: ' + key);
    const name = key.slice(2); need(!Object.hasOwn(value, name), 'Do not repeat --' + name + '.');
    if (name === 'all') value[name] = true;
    else { need(i + 1 < args.length && !args[i + 1].startsWith('--'), 'Supply the value for --' + name + '.'); value[name] = args[++i]; }
  }
  for (const key of required) need(typeof value[key] === 'string' && value[key], 'Supply --' + key + '.');
  return value;
}
async function json(path, fallback = {}) { return path === undefined ? fallback : (await readCanadaBuysCustomerJson(resolve(path))).value; }
async function output(value, path, stdout) {
  if (path) await writePrivate(resolve(path), value);
  stdout.write(JSON.stringify(value, null, 2) + '\n');
  return value;
}
async function connected(configPath, environment, signal, operation) {
  const connection = normalizeCanadaBuysCustomerConnection(await json(configPath));
  const client = await openCanadaBuysMerchantClient({ ...connection, environment, signal });
  let failure;
  try {
    await client.open({ signal });
    return await operation(client, connection);
  } catch (error) { failure = error; throw error; }
  finally {
    try { await client.disconnect(); }
    catch (error) { if (failure) failure.closeError = error; else throw error; }
  }
}
export async function main(argv = process.argv.slice(2), { environment = process.env,
  stdout = process.stdout, stderr = process.stderr, signal } = {}) {
  if (!argv.length || ['help', '--help', '-h'].includes(argv[0])) { stdout.write(HELP); return; }
  const [command, ...remaining] = argv;
  if (command === 'tools') {
    const a = flags(remaining, ['out']);
    return output({ schema: 'stellar-forge.canadabuys-customer-tools.v1', tools: canadaBuysTools() }, a.out, stdout);
  }
  if (command === 'connection-template') {
    const a = flags(remaining, ['out'], ['out']);
    return output(canadaBuysCustomerConnectionTemplate(), a.out, stdout);
  }
  if (command === 'bind') {
    const a = flags(remaining, ['connection', 'out'], ['connection', 'out']);
    const result = await bindCanadaBuysCustomerConnection({ connection: await json(a.connection), environment, signal });
    await writePrivate(resolve(a.out), result.connection);
    return output({ ...result, connectionFile: resolve(a.out) }, undefined, stdout);
  }
  if (command === 'read') {
    const a = flags(remaining, ['connection', 'tool', 'args', 'all', 'out'], ['connection', 'tool']);
    const name = canadaBuysToolName(a.tool), args = await json(a.args);
    need(canadaBuysTools().find(value => value.name === name).annotations.readOnlyHint,
      'Use plan/run for the original effectful operation.');
    return connected(a.connection, environment, signal, async client => output(a.all
      ? await client.collect(name, args, { signal }) : await client.call(name, args, { signal }), a.out, stdout));
  }
  if (command === 'intake-template') {
    const a = flags(remaining, ['out'], ['out']);
    return output({ noticeId: 'REPLACE_WITH_ORIGINAL_NOTICE_ID', commandId: 'customer-documents-original-001',
      capturedAt: 'REPLACE_WITH_ACTUAL_CAPTURE_TIMESTAMP', sourceUrl: '',
      documents: [{ path: './rfp.pdf', title: 'Original request for proposals', kind: 'OTHER', language: 'en',
        pageOrSection: '', notes: '' }] }, a.out, stdout);
  }
  if (command === 'prepare-intake') {
    const a = flags(remaining, ['connection', 'manifest', 'request-out', 'out'],
      ['connection', 'manifest', 'request-out']);
    return connected(a.connection, environment, signal, async client => output(
      await prepareCanadaBuysEvidenceIntake({ client, manifestPath: resolve(a.manifest),
        outputPath: resolve(a['request-out']), signal }), a.out, stdout));
  }
  if (command === 'refresh-intake') {
    const a = flags(remaining, ['connection', 'request', 'request-out', 'out'],
      ['connection', 'request', 'request-out']);
    return connected(a.connection, environment, signal, async client => output(
      await refreshCanadaBuysEvidenceIntake({ client, requestPath: resolve(a.request),
        outputPath: resolve(a['request-out']), signal }), a.out, stdout));
  }
  if (command === 'intake-plan') {
    const a = flags(remaining, ['connection', 'input', 'directory', 'operation-id', 'expected-sha256', 'out'],
      ['connection', 'input', 'directory', 'operation-id']);
    return connected(a.connection, environment, signal, async (client, connection) => output(
      await prepareCanadaBuysIntakeOperation({ client, connection, input: a.input,
        directory: resolve(a.directory), operationId: a['operation-id'],
        expectedSha256: a['expected-sha256'], signal }), a.out, stdout));
  }
  if (command === 'plan') {
    const a = flags(remaining, ['connection', 'directory', 'operation-id', 'tool', 'args', 'out'],
      ['connection', 'directory', 'operation-id', 'tool']);
    const result = await prepareCanadaBuysOperation({ directory: resolve(a.directory),
      operationId: a['operation-id'], connection: await json(a.connection), tool: a.tool, arguments: await json(a.args) });
    return output(result, a.out, stdout);
  }
  if (command === 'show') {
    const a = flags(remaining, ['directory', 'out'], ['directory']);
    return output(await showCanadaBuysOperation(resolve(a.directory)), a.out, stdout);
  }
  if (command === 'run') {
    const a = flags(remaining, ['directory', 'timeout-ms', 'out'], ['directory']);
    return output(await executeCanadaBuysOperation({ directory: resolve(a.directory), environment, signal,
      timeoutMs: integer(a['timeout-ms'], 'timeout-ms', 120000) }), a.out, stdout);
  }
  if (command === 'publication-selection') {
    const a = flags(remaining, ['directory', 'out'], ['directory', 'out']);
    const original = await showCanadaBuysOperation(resolve(a.directory));
    need(original.request.request.name === CANADABUYS_TOOL_PREFIX + 'export',
      'Select an original retained export operation.');
    return output({ schema: CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.publication-selection',
      operationId: original.request.operationId, requestSha256: original.requestSha256, publicationId: '',
      note: 'Replace with the observed original publication UUID and explain its original export evidence.' }, a.out, stdout);
  }
  if (command === 'adopt-publication') {
    const a = flags(remaining, ['directory', 'evidence', 'out'], ['directory', 'evidence']);
    const selected = await json(a.evidence), original = await showCanadaBuysOperation(resolve(a.directory));
    need(selected?.schema === CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.publication-selection'
      && selected.operationId === original.request.operationId && selected.requestSha256 === original.requestSha256
      && Object.keys(selected).every(key => ['schema', 'operationId', 'requestSha256', 'publicationId', 'note'].includes(key)),
      'Use the explicitly selected publication evidence for this exact original request.');
    return output(await adoptCanadaBuysPublication({ directory: resolve(a.directory),
      publicationId: selected.publicationId, note: selected.note, environment, signal }), a.out, stdout);
  }
  if (command === 'inspect-publication') {
    const a = flags(remaining, ['connection', 'publication-id', 'out'], ['connection', 'publication-id']);
    return connected(a.connection, environment, signal, async client => output(
      await inspectCanadaBuysPublication({ client, publicationId: a['publication-id'], signal }), a.out, stdout));
  }
  if (command === 'download') {
    const a = flags(remaining, ['connection', 'publication-id', 'directory', 'manifest-sha256', 'chunk-size', 'out'],
      ['connection', 'publication-id', 'directory']);
    return connected(a.connection, environment, signal, async client => output(await downloadCanadaBuysPublication({
      client, publicationId: a['publication-id'], directory: resolve(a.directory),
      expectedManifestSha256: a['manifest-sha256'], chunkSize: integer(a['chunk-size'], 'chunk-size', 196608), signal,
      onProgress: item => stderr.write(JSON.stringify({ event: 'CANADABUYS_ORIGINAL_FILE_PROGRESS', ...item }) + '\n'),
    }), a.out, stdout));
  }
  if (command === 'verify') {
    const a = flags(remaining, ['directory', 'publication-id', 'manifest-sha256', 'out'], ['directory', 'publication-id']);
    return output(await verifyCanadaBuysDownload({ directory: resolve(a.directory), publicationId: a['publication-id'],
      expectedManifestSha256: a['manifest-sha256'], signal }), a.out, stdout);
  }
  if (command === 'receive') {
    const a = flags(remaining, ['directory', 'publication-id', 'workspace-directory', 'expected-revision',
      'manifest-sha256', 'operator', 'title', 'out'], ['directory', 'publication-id', 'workspace-directory', 'expected-revision']);
    return output(await receiveCanadaBuysPackage({ directory: resolve(a.directory), publicationId: a['publication-id'],
      workspaceDirectory: resolve(a['workspace-directory']), expectedRevision: integer(a['expected-revision'], 'expected-revision'),
      expectedManifestSha256: a['manifest-sha256'], operator: a.operator, title: a.title, signal }), a.out, stdout);
  }
  throw canadaBuysClientError('CLI', 'Choose a documented customer command. Use --help.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const controller = new AbortController();
  const stop = () => controller.abort(canadaBuysClientError('INTERRUPTED', 'The original customer invocation was interrupted.'));
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  main(undefined, { signal: controller.signal }).catch(error => {
    process.stderr.write(JSON.stringify({ state: 'INCOMPLETE', code: error.code ?? 'CLIENT_ERROR',
      message: error.message, ...(error.details ? { details: error.details } : {}) }) + '\n');
    process.exitCode = 2;
  }).finally(() => { process.off('SIGINT', stop); process.off('SIGTERM', stop); });
}
