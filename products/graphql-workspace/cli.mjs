#!/usr/bin/env node
// MIT. Installed GraphQL product entrypoint over the original native owners.
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeGraphqlProduct, inspectGraphqlProduct, openGraphqlProduct,
  GRAPHQL_PRODUCT_SESSION_SCHEMA, privateBytes, decode, failure } from './workspace.mjs';
import { inspectGraphqlLaunch } from './managed.mjs';
import { GraphqlProductClient, inspectReceivedGraphqlFiles } from './client.mjs';

const HELP = [
  'starforge graphql-product init --dir PRIVATE_DIR --sources SOURCES.json [--workspace indexer] [--name NAME]',
  'starforge graphql-product init --dir PRIVATE_DIR --connection ORIGINAL_GRAPHQL_CONNECTION.json --workspace ALIAS',
  'starforge graphql-product init --dir PRIVATE_DIR --configuration ORIGINAL_MERCHANT.json --workspace ALIAS',
  'starforge graphql-product inspect --dir PRIVATE_DIR',
  'starforge graphql-product review --dir PRIVATE_DIR [--port 0] [--browser-only] [--token-env MCP_ACCESS_TOKEN]',
  'starforge graphql-product open --dir PRIVATE_DIR [--port 0] [--browser-only] [--token-env MCP_ACCESS_TOKEN] [--expected-binding SHA256]',
  'starforge graphql-product projects --dir PRIVATE_DIR',
  'starforge graphql-product call --dir PRIVATE_DIR --tool ORIGINAL_GRAPHQL_TOOL [--request EXACT_ARGUMENTS.json]',
  'starforge graphql-product inspect-files --dir PRIVATE_DIR --export-id RETAINED_TRANSFER_ALIAS',
  'starforge graphql-product receive --dir PRIVATE_DIR --export-id TRANSFER_ALIAS --out PRIVATE_DELIVERY [--selection NATIVE_SELECTION.json] [--manifest-sha256 SHA256]',
  'starforge graphql-product inspect-received --dir PRIVATE_DELIVERY',
  'starforge graphql-product prepare-comparison --dir PRIVATE_PRODUCT --request EXACT_REQUEST.json',
  'starforge graphql-product comparison --dir PRIVATE_PRODUCT --request EXACT_SELECTION.json',
  'starforge graphql-product comparison-changes --dir PRIVATE_PRODUCT --request EXACT_CASE_SELECTION.json',
  'starforge graphql-product review-comparison --dir PRIVATE_PRODUCT --request EXACT_REVIEW_REQUEST.json',
  'starforge graphql-product pending-comparison --dir PRIVATE_PRODUCT --request ORIGINAL_ID_GENERATION.json',
  'starforge graphql-product recover-comparison --dir PRIVATE_PRODUCT --request INSPECTED_RECOVERY.json',
  'starforge graphql-product prepare-handover --dir PRIVATE_PRODUCT --id UUID --project PROJECT --revision N',
  'starforge graphql-product inspect-handover --dir RECEIVING_PRODUCT --from PRIVATE_HANDOVER [--handover-sha256 SHA256]',
  'starforge graphql-product reopen-handover --dir RECEIVING_PRODUCT --id UUID --handover-sha256 SHA256 --expected-revision N [--from PRIVATE_HANDOVER]',
  '',
  'Start with the same original source, saved project and request IDs. Source credentials and MCP tokens remain in the server/client environment.',
].join('\n') + '\n';
function parse(args, allowed) {
  const result = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!allowed.includes(key) || result.has(key)) throw failure('GRAPHQL_PRODUCT_ARGUMENTS', HELP);
    if (key === '--browser-only') { result.set(key, true); continue; }
    const value = args[++i];
    if (typeof value !== 'string' || !value || value.startsWith('--')) throw failure('GRAPHQL_PRODUCT_ARGUMENTS', HELP);
    result.set(key, value);
  }
  return result;
}
function required(values, key) {
  const value = values.get(key);
  if (typeof value !== 'string') throw failure('GRAPHQL_PRODUCT_ARGUMENTS', 'Supply ' + key + '.\n' + HELP);
  return value;
}
function options(values) {
  const port = values.get('--port') ?? '0';
  if (!/^(0|[1-9]\d*)$/.test(port) || Number(port) > 65535) throw failure('GRAPHQL_PRODUCT_ARGUMENTS', 'Use a port from 0 to 65535.');
  return { directory: resolve(required(values, '--dir')), port: Number(port),
    browserOnly: values.has('--browser-only'), tokenEnv: values.get('--token-env') ?? 'MCP_ACCESS_TOKEN',
    ...(values.has('--expected-binding') ? { expectedBindingSha256: values.get('--expected-binding') } : {}) };
}
const output = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.length === 1 && ['help', '--help'].includes(args[0])) { process.stdout.write(HELP); return; }
  const [command, ...rest] = args;
  if (command === 'init') {
    const values = parse(rest, ['--dir', '--sources', '--connection', '--configuration', '--workspace', '--name']);
    const result = await initializeGraphqlProduct({ directory: required(values, '--dir'),
      ...(values.has('--sources') ? { sourcesFile: values.get('--sources') } : {}),
      ...(values.has('--connection') ? { connection: values.get('--connection') } : {}),
      ...(values.has('--configuration') ? { configuration: values.get('--configuration') } : {}),
      ...(values.has('--workspace') ? { workspace: values.get('--workspace') } : {}),
      ...(values.has('--name') ? { name: values.get('--name') } : {}) });
    output(result); return result;
  }
  if (command === 'inspect' || command === 'inspect-received') {
    const values = parse(rest, ['--dir']);
    const result = command === 'inspect' ? await inspectGraphqlProduct(required(values, '--dir'))
      : await inspectReceivedGraphqlFiles(required(values, '--dir'));
    output(result); return result;
  }
  if (command === 'review' || command === 'open') {
    const values = parse(rest, ['--dir', '--port', '--browser-only', '--token-env', '--expected-binding']);
    const selected = options(values);
    if (command === 'review') { const result = await inspectGraphqlLaunch(selected); output(result); return result; }
    const active = await openGraphqlProduct(selected);
    // One machine-readable startup line feeds the original Applications observer.
    const keys = ['productId', 'workspace', 'instanceId', 'startedAt', 'bindingSha256', 'resourceId',
      'directory', 'workspaceDirectory', 'configuration', 'connectionFile', 'tokenEnv', 'browserOnly', 'port',
      'state', 'browserUrl', 'mcpUrl', 'nativeInstanceId', 'name'];
    process.stdout.write(JSON.stringify({ schema: GRAPHQL_PRODUCT_SESSION_SCHEMA,
      ...Object.fromEntries(keys.map(key => [key, active[key]])) }) + '\n');
    let closing;
    const stop = () => closing ??= active.close().then(() => {
      for (const name of ['SIGINT', 'SIGTERM']) process.off(name, stop);
    }).catch(error => { closing = null; process.stderr.write(error.code + ': ' + error.message + '\n'); process.exitCode = 1; });
    for (const name of ['SIGINT', 'SIGTERM']) process.on(name, stop);
    return active;
  }
  const comparisonCommands = { 'prepare-comparison': 'prepareComparison', comparison: 'inspectComparison',
    'comparison-changes': 'comparisonChanges', 'review-comparison': 'reviewComparison',
    'pending-comparison': 'inspectPendingComparison', 'recover-comparison': 'recoverComparison' };
  if (Object.hasOwn(comparisonCommands, command)) {
    const values = parse(rest, ['--dir', '--request']), client = new GraphqlProductClient({
      connectionFile: join(resolve(required(values, '--dir')), 'connection.json') });
    const request = decode(await privateBytes(resolve(required(values, '--request')), false, 1024 * 1024));
    const result = await client[comparisonCommands[command]](request);
    output(result); return result;
  }
  if (['prepare-handover', 'inspect-handover', 'reopen-handover'].includes(command)) {
    const allowed = command === 'prepare-handover' ? ['--dir', '--id', '--project', '--revision']
      : command === 'inspect-handover' ? ['--dir', '--from', '--handover-sha256']
        : ['--dir', '--id', '--from', '--handover-sha256', '--expected-revision'];
    const values = parse(rest, allowed), client = new GraphqlProductClient({
      connectionFile: join(resolve(required(values, '--dir')), 'connection.json') });
    const number = key => {
      const text = required(values, key);
      if (!/^(0|[1-9]\d*)$/.test(text) || !Number.isSafeInteger(Number(text)))
        throw failure('GRAPHQL_PRODUCT_ARGUMENTS', 'Supply the original integer revision.');
      return Number(text);
    };
    let result;
    if (command === 'prepare-handover') result = await client.prepareHandover({ id: required(values, '--id'),
      project: required(values, '--project'), revision: number('--revision') });
    if (command === 'inspect-handover') result = await client.inspectHandover({
      directory: resolve(required(values, '--from')),
      ...(values.has('--handover-sha256') ? { handoverSha256: values.get('--handover-sha256') } : {}) });
    if (command === 'reopen-handover') result = await client.receiveHandover({ id: required(values, '--id'),
      handoverSha256: required(values, '--handover-sha256'), expectedRevision: number('--expected-revision'),
      ...(values.has('--from') ? { directory: resolve(values.get('--from')) } : {}) });
    output(result); return result;
  }
  if (['projects', 'call', 'inspect-files', 'receive'].includes(command)) {
    const allowed = ['--dir'];
    if (command === 'call') allowed.push('--tool', '--request');
    if (['inspect-files', 'receive'].includes(command)) allowed.push('--export-id');
    if (command === 'receive') allowed.push('--out', '--selection', '--manifest-sha256');
    const values = parse(rest, allowed);
    const client = new GraphqlProductClient({ connectionFile: join(resolve(required(values, '--dir')), 'connection.json') });
    let result;
    if (command === 'projects') result = await client.call('merchant_graphql_projects', {});
    if (command === 'call') result = await client.call(required(values, '--tool'),
      values.has('--request') ? decode(await privateBytes(resolve(values.get('--request')), false, 7 * 1024 * 1024)) : {});
    if (command === 'inspect-files') result = await client.inspectFiles(required(values, '--export-id'));
    if (command === 'receive') result = await client.receiveFiles({
      exportId: required(values, '--export-id'), directory: resolve(required(values, '--out')),
      ...(values.has('--selection') ? { selection: decode(await privateBytes(resolve(values.get('--selection')))) } : {}),
      ...(values.has('--manifest-sha256') ? { expectedManifestSha256: values.get('--manifest-sha256') } : {}),
    });
    output(result); return result;
  }
  throw failure('GRAPHQL_PRODUCT_ARGUMENTS', HELP);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { process.stderr.write((error.code ?? 'GRAPHQL_PRODUCT_ERROR') + ': ' + error.message + '\n'); process.exitCode = 1; });
