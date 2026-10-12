#!/usr/bin/env node
// MIT. Installed gRPC product entrypoint over its original source, workspace and receiving engines.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeGrpcProduct, inspectGrpcProduct, openGrpcProduct, readGrpcProduct } from './workspace.mjs';
import { inspectGrpcProductLaunch } from './managed.mjs';
import { GrpcProductClient, grpcProductTools, inspectReceivedGrpcProduct } from './client.mjs';
import { privateBytes, decode, need, HASH } from './common.mjs';

const HELP = [
  'gRPC merchant product',
  '',
  '  grpc-product init --dir PRIVATE_PRODUCT [--workspace ORIGINAL_WORKSPACE] [--alias grpc] [--name NAME] [--handles PRIVATE_JSON]',
  '  grpc-product inspect --dir PRIVATE_PRODUCT',
  '  grpc-product review|open --dir PRIVATE_PRODUCT [--port 0] [--workspace-port 0] [--seller-port 0] [--operations-port 0]',
  '       [--token-env MCP_ACCESS_TOKEN] [--browser-only] [--facilitator HTTPS_URL] [--allow-local-facilitator]',
  '       [--expected-binding SHA256]',
  '  grpc-product tools [--name merchant_grpc_TOOL]',
  '  grpc-product call --dir PRIVATE_PRODUCT --tool merchant_grpc_TOOL [--input ORIGINAL_ARGUMENTS_JSON]',
  '  grpc-product status --dir PRIVATE_PRODUCT',
  '  grpc-product inventory --dir PRIVATE_PRODUCT --kind revisions|prepared|intents|attempts|reflections|exports [--offset 0 --limit 50 --snapshot SHA]',
  '  grpc-product revision --dir PRIVATE_PRODUCT --revision SHA [--section summary|source|plan|methods|routes --offset 0 --limit 50 --snapshot SHA]',
  '  grpc-product attempt|cancel-call --dir PRIVATE_PRODUCT --id ORIGINAL_OPERATION_UUID',
  '  grpc-product receive --dir PRIVATE_PRODUCT --export-id ORIGINAL_EXPORT_SHA --out PRIVATE_RECEIVING',
  '       [--manifest-sha256 SHA --chunk-bytes 65536]',
  '  grpc-product inspect-received --out PRIVATE_RECEIVING [--export-id SHA --manifest-sha256 SHA]',
  '  grpc-product health COMMAND --dir PRIVATE_PRODUCT [ORIGINAL_HEALTH_OPTIONS]',
  '  grpc-product upgrade COMMAND --dir PRIVATE_PRODUCT [ORIGINAL_UPGRADE_OPTIONS]',
  '  grpc-product health inspect [ORIGINAL_OFFLINE_OPTIONS]',
  '  grpc-product upgrade inspect [ORIGINAL_OFFLINE_OPTIONS]',
  '',
  'The same native browser contains source capture/reflection, typed message editing, merchant preparation,',
  'release control, contract upgrade review and Check/List/Watch history.',
  'Save operation UUIDs before invoking a native method or health observation; recover the original ID.',
  'Receive an already-created export ID to preserve its frozen original files across interruptions.',
  'See products/grpc-merchant/OPERATING.md and RECEIVING.md.',
  '',
].join('\n');
const print = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
function parse(args, allowed, switches = []) {
  const options = new Map();
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    need(allowed.includes(name) && !options.has(name), 'Unknown or repeated option: ' + name, 'ARGUMENTS');
    if (switches.includes(name)) { options.set(name, true); continue; }
    const value = args[++index];
    need(typeof value === 'string' && value && !value.startsWith('--'), 'Supply ' + name + '.', 'ARGUMENTS');
    options.set(name, value);
  }
  return options;
}
const required = (options, name) => { need(options.has(name), 'Supply ' + name + '.', 'ARGUMENTS'); return options.get(name); };
function number(options, key, fallback) {
  const text = options.get(key);
  if (text === undefined) return fallback;
  need(/^(0|[1-9][0-9]*)$/.test(text) && Number.isSafeInteger(Number(text)), 'Use an integer for ' + key + '.', 'ARGUMENTS');
  return Number(text);
}
function launch(options) {
  return { directory: resolve(required(options, '--dir')), port: number(options, '--port', 0),
    workspacePort: number(options, '--workspace-port', 0), sellerPort: number(options, '--seller-port', 0),
    operationsPort: number(options, '--operations-port', 0), browserOnly: options.has('--browser-only'),
    tokenEnv: options.get('--token-env') ?? 'MCP_ACCESS_TOKEN', facilitator: options.get('--facilitator'),
    allowLocalFacilitator: options.has('--allow-local-facilitator'),
    ...(options.has('--expected-binding') ? { expectedBindingSha256: options.get('--expected-binding') } : {}) };
}
const paging = options => ({ offset: number(options, '--offset', 0), limit: number(options, '--limit', 50),
  ...(options.has('--snapshot') ? { expectedSnapshot: options.get('--snapshot') } : {}) });
async function forwardNative(command, args) {
  const module = command === 'health'
    ? await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/health-cli.mjs')
    : await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/upgrade-cli.mjs');
  if (!args.length || args.length === 1 && ['--help', 'help'].includes(args[0]) || args[0] === 'inspect')
    return module.main(args);
  const positions = args.flatMap((value, index) => value === '--dir' ? [index] : []);
  need(positions.length === 1 && args[positions[0] + 1] && !args[positions[0] + 1].startsWith('--'),
    'Supply this product’s --dir to use its original running console.', 'ARGUMENTS');
  need(!args.includes('--state') && !args.includes('--console-url-file'),
    'This product command selects its original console; use the standalone native CLI for a different connection.', 'ARGUMENTS');
  const selected = await readGrpcProduct(resolve(args[positions[0] + 1]));
  const original = args.filter((_, index) => index !== positions[0] && index !== positions[0] + 1);
  return module.main([...original, '--console-url-file', selected.profile.consoleUrlFile]);
}
export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.length === 1 && ['help', '--help'].includes(args[0])) { process.stdout.write(HELP); return; }
  const [command, ...rest] = args;
  if (['health', 'upgrade'].includes(command)) return forwardNative(command, rest);
  if (command === 'init') {
    const options = parse(rest, ['--dir', '--workspace', '--alias', '--name', '--handles']);
    const result = await initializeGrpcProduct({ directory: required(options, '--dir'),
      workspaceDirectory: options.get('--workspace'), workspace: options.get('--alias'),
      name: options.get('--name'), handlesFile: options.get('--handles') });
    print(result); return result;
  }
  if (command === 'inspect') {
    const options = parse(rest, ['--dir']), result = await inspectGrpcProduct(required(options, '--dir'));
    print(result); return result;
  }
  if (['review', 'open'].includes(command)) {
    const options = parse(rest, ['--dir', '--port', '--workspace-port', '--seller-port', '--operations-port',
      '--token-env', '--browser-only', '--facilitator', '--allow-local-facilitator', '--expected-binding'],
    ['--browser-only', '--allow-local-facilitator']);
    if (options.has('--expected-binding')) need(HASH.test(options.get('--expected-binding')), 'Supply the reviewed SHA-256.', 'ARGUMENTS');
    const selected = launch(options);
    if (command === 'review') { const result = await inspectGrpcProductLaunch(selected); print(result); return result; }
    const active = await openGrpcProduct(selected);
    const { native, operator, close, ...record } = active;
    process.stdout.write(JSON.stringify(record) + '\n');
    let stopping;
    const stop = () => stopping ??= close().then(() => {
      process.off('SIGINT', stop); process.off('SIGTERM', stop);
    }).catch(error => { stopping = null; process.stderr.write((error.code ?? 'GRPC_PRODUCT_CLOSE_INCOMPLETE') + '\n'); process.exitCode = 1; });
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    return active;
  }
  if (command === 'tools') {
    const options = parse(rest, ['--name']), selected = grpcProductTools().filter(item => !options.has('--name') || item.name === options.get('--name'));
    need(selected.length > 0, 'Select an original gRPC tool.', 'ARGUMENTS'); print(selected); return selected;
  }
  if (command === 'inspect-received') {
    const options = parse(rest, ['--out', '--export-id', '--manifest-sha256']);
    const result = await inspectReceivedGrpcProduct(required(options, '--out'), {
      expectedExportId: options.get('--export-id'), expectedManifestSha256: options.get('--manifest-sha256') });
    print(result); return result;
  }
  const allowed = {
    call: ['--dir', '--tool', '--input'], status: ['--dir'],
    inventory: ['--dir', '--kind', '--offset', '--limit', '--snapshot'],
    revision: ['--dir', '--revision', '--section', '--offset', '--limit', '--snapshot'],
    attempt: ['--dir', '--id'], 'cancel-call': ['--dir', '--id'],
    receive: ['--dir', '--export-id', '--out', '--manifest-sha256', '--chunk-bytes'],
  }[command];
  need(allowed, HELP, 'ARGUMENTS');
  const options = parse(rest, allowed), controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const client = new GrpcProductClient({ directory: required(options, '--dir'), signal: controller.signal });
    let result;
    if (command === 'call') result = await client.call(required(options, '--tool'),
      options.has('--input') ? decode(await privateBytes(resolve(options.get('--input')), false, 2 * 1024 * 1024)) : {});
    if (command === 'status') result = await client.status();
    if (command === 'inventory') result = await client.inventory(required(options, '--kind'), paging(options));
    if (command === 'revision') result = await client.revision(required(options, '--revision'), options.get('--section') ?? 'summary', paging(options));
    if (command === 'attempt') result = await client.attempt(required(options, '--id'));
    if (command === 'cancel-call') result = await client.stopCall(required(options, '--id'));
    if (command === 'receive') result = await client.receive({ exportId: required(options, '--export-id'),
      directory: resolve(required(options, '--out')), expectedManifestSha256: options.get('--manifest-sha256'),
      chunkSize: number(options, '--chunk-bytes', 65536), onProgress: value => process.stderr.write(JSON.stringify(value) + '\n') });
    print(result); return result;
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { process.stderr.write((error.code ?? 'GRPC_PRODUCT_ERROR') + ': ' + error.message + '\n'); process.exitCode = 1; });
