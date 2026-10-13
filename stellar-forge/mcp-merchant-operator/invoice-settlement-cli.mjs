#!/usr/bin/env node
// MIT. Installed Invoice customer: original MCP operations and complete local receiving.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writePrivate } from './host-files.mjs';
import { openInvoiceMerchantClient, invoiceTools, invoiceToolName,
  invoiceClientError, INVOICE_TOOL_PREFIX } from './invoice-settlement-client.mjs';
import { inspectInvoicePublication, downloadInvoicePublication, verifyInvoiceDownload,
  receiveInvoicePackage } from './invoice-settlement-download.mjs';
import { invoiceCustomerConnectionTemplate, normalizeInvoiceCustomerConnection,
  readInvoiceCustomerJson, bindInvoiceCustomerConnection, prepareInvoiceOperation,
  showInvoiceOperation, executeInvoiceOperation,
  INVOICE_CUSTOMER_OPERATION_SCHEMA } from './invoice-settlement-operations.mjs';

export const HELP = "Invoice & Settlement customer\n\n  invoice-settlement-customer tools [--out tools.json]\n  invoice-settlement-customer connection-template --out connection.json\n  invoice-settlement-customer bind --connection connection.json --out bound.json\n  invoice-settlement-customer read --connection bound.json --tool status [--args request.json] [--out response.json]\n  invoice-settlement-customer history --connection bound.json [--out history.json]\n  invoice-settlement-customer plan --connection bound.json --directory original-operation --operation-id original-id --tool change --args request.json\n  invoice-settlement-customer show --directory original-operation\n  invoice-settlement-customer run --directory original-operation [--timeout-ms 120000] [--continue-original] [--out response.json]\n  invoice-settlement-customer inspect-publication --connection bound.json --publication-id original-uuid\n  invoice-settlement-customer download --connection bound.json --publication-id original-uuid --directory original-download [--manifest-sha256 sha256] [--chunk-size 196608]\n  invoice-settlement-customer verify --directory original-download --publication-id original-uuid [--manifest-sha256 sha256]\n  invoice-settlement-customer receive --directory original-download --publication-id original-uuid --destination independent-received --request-id original-uuid [--manifest-sha256 sha256]\n\nKeep original JSON files private (0600). The connection selects the existing MCP\nendpoint, token environment variable, declared workspace alias and observed UUID.\nplan retains exact original arguments before dispatch. run reuses its retained\nrequest and complete response. Atomic native changes and export/import preserve\ntheir original request UUID. An interrupted capture, listener delivery or close\nrequires reading its original native state first, then explicit --continue-original\nto continue that same saved request. This flag never creates a new request UUID.\n\nUse read --tool methods for native declarations and read --tool read with\n{\"method\":\"request.status\",\"args\":{\"requestId\":\"original-uuid\"}} for a native result.\nHost configuration selects source files and source connections. Customer arguments\nnever choose arbitrary host paths. Export a complete workspace through --tool export;\ndownload includes every original application, source, workspace and native runtime.\nverify and receive work offline, with the original complete native receiver.\nDisconnecting the customer drains retained reads, without stopping the application.\nUse Node22.16 or newer and the installed Linux flock lease owner.\n";
const need = (value, message) => { if (!value) throw invoiceClientError('CLI', message); };
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
    if (name === 'continue-original') value[name] = true;
    else { need(i + 1 < args.length && !args[i + 1].startsWith('--'), 'Supply the value for --' + name + '.'); value[name] = args[++i]; }
  }
  for (const key of required) need(typeof value[key] === 'string' && value[key], 'Supply --' + key + '.');
  return value;
}
async function json(path, fallback = {}) { return path === undefined ? fallback : (await readInvoiceCustomerJson(resolve(path))).value; }
async function output(value, path, stdout) {
  if (path) await writePrivate(resolve(path), value);
  stdout.write(JSON.stringify(value, null, 2) + '\n');
  return value;
}
async function connected(configPath, environment, signal, operation) {
  const connection = normalizeInvoiceCustomerConnection(await json(configPath));
  const client = await openInvoiceMerchantClient({ ...connection, environment, signal });
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
    return output({ schema: 'stellar-forge.invoice-settlement-customer-tools.v1', tools: invoiceTools() }, a.out, stdout);
  }
  if (command === 'connection-template') {
    const a = flags(remaining, ['out'], ['out']);
    return output(invoiceCustomerConnectionTemplate(), a.out, stdout);
  }
  if (command === 'bind') {
    const a = flags(remaining, ['connection', 'out'], ['connection', 'out']);
    const result = await bindInvoiceCustomerConnection({ connection: await json(a.connection), environment, signal });
    await writePrivate(resolve(a.out), result.connection);
    return output({ ...result, connectionFile: resolve(a.out) }, undefined, stdout);
  }
  if (command === 'read') {
    const a = flags(remaining, ['connection', 'tool', 'args', 'out'], ['connection', 'tool']);
    const name = invoiceToolName(a.tool), args = await json(a.args);
    need(invoiceTools().find(value => value.name === name).annotations.readOnlyHint,
      'Use plan/run for the original effectful operation.');
    return connected(a.connection, environment, signal, async client => output(await client.call(name, args, { signal }), a.out, stdout));
  }
  if(command==='history'){
    const a=flags(remaining,['connection','out'],['connection']);
    return connected(a.connection,environment,signal,async client=>output(await client.history({},{signal}),a.out,stdout));
  }
  if (command === 'plan') {
    const a = flags(remaining, ['connection', 'directory', 'operation-id', 'tool', 'args', 'out'],
      ['connection', 'directory', 'operation-id', 'tool']);
    const result = await prepareInvoiceOperation({ directory: resolve(a.directory),
      operationId: a['operation-id'], connection: await json(a.connection), tool: a.tool, arguments: await json(a.args) });
    return output(result, a.out, stdout);
  }
  if (command === 'show') {
    const a = flags(remaining, ['directory', 'out'], ['directory']);
    return output(await showInvoiceOperation(resolve(a.directory)), a.out, stdout);
  }
  if (command === 'run') {
    const a = flags(remaining, ['directory', 'timeout-ms', 'continue-original', 'out'], ['directory']);
    return output(await executeInvoiceOperation({ directory: resolve(a.directory), environment, signal, continueOriginal:a['continue-original']===true,
      timeoutMs: integer(a['timeout-ms'], 'timeout-ms', 120000) }), a.out, stdout);
  }
  if (command === 'inspect-publication') {
    const a = flags(remaining, ['connection', 'publication-id', 'out'], ['connection', 'publication-id']);
    return connected(a.connection, environment, signal, async client => output(
      await inspectInvoicePublication({ client, publicationId: a['publication-id'], signal }), a.out, stdout));
  }
  if (command === 'download') {
    const a = flags(remaining, ['connection', 'publication-id', 'directory', 'manifest-sha256', 'chunk-size', 'out'],
      ['connection', 'publication-id', 'directory']);
    return connected(a.connection, environment, signal, async client => output(await downloadInvoicePublication({
      client, publicationId: a['publication-id'], directory: resolve(a.directory),
      expectedManifestSha256: a['manifest-sha256'], chunkSize: integer(a['chunk-size'], 'chunk-size', 196608), signal,
      onProgress: item => stderr.write(JSON.stringify({ event: 'INVOICE_ORIGINAL_FILE_PROGRESS', ...item }) + '\n'),
    }), a.out, stdout));
  }
  if (command === 'verify') {
    const a = flags(remaining, ['directory', 'publication-id', 'manifest-sha256', 'out'], ['directory', 'publication-id']);
    return output(await verifyInvoiceDownload({ directory: resolve(a.directory), publicationId: a['publication-id'],
      expectedManifestSha256: a['manifest-sha256'], signal }), a.out, stdout);
  }
  if(command==='receive'){
    const a=flags(remaining,['directory','publication-id','destination','request-id','manifest-sha256','out'],['directory','publication-id','destination','request-id']);
    return output(await receiveInvoicePackage({directory:resolve(a.directory),publicationId:a['publication-id'],
      destination:resolve(a.destination),requestId:a['request-id'],expectedManifestSha256:a['manifest-sha256'],signal}),a.out,stdout);
  }
  throw invoiceClientError('CLI', 'Choose a documented customer command. Use --help.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const controller = new AbortController();
  const stop = () => controller.abort(invoiceClientError('INTERRUPTED', 'The original customer invocation was interrupted.'));
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  main(undefined, { signal: controller.signal }).catch(error => {
    process.stderr.write(JSON.stringify({ state: 'INCOMPLETE', code: error.code ?? 'CLIENT_ERROR',
      message: error.message, ...(error.details ? { details: error.details } : {}) }) + '\n');
    process.exitCode = 2;
  }).finally(() => { process.off('SIGINT', stop); process.off('SIGTERM', stop); });
}
