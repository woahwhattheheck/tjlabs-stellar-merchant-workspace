// MIT. Aggregate product launch in the existing source-owned Applications model.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { inspectMerchantRuntime } from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import { APPLICATION_PROVIDER_SCHEMA, applicationPrivateUrl, observeApplicationStartup } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import { absolute, need, plain } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import { readSf61HostFile } from '../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs';

const PRODUCT = 'products/grpc-merchant/', LAUNCH = 'stellar-forge.grpc-product-launch.v1', SESSION = 'stellar-forge.grpc-product-session.v1';
const HASH = /^[a-f0-9]{64}$/, ENV = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const sourceFiles = ['common.mjs', 'workspace.mjs', 'managed.mjs', 'client.mjs', 'cli.mjs', 'application-provider.mjs'];
function options(settings) {
  return { directory: absolute(settings.workspaceDirectory), port: settings.port ?? 0,
    workspacePort: settings.workspacePort ?? 0, sellerPort: settings.sellerPort ?? 0, operationsPort: settings.operationsPort ?? 0,
    tokenEnv: settings.tokenEnv ?? 'MCP_ACCESS_TOKEN', browserOnly: settings.browserOnly === true,
    facilitator: settings.facilitator ?? null, allowLocalFacilitator: settings.allowLocalFacilitator === true };
}
export async function prepareGrpcProductApplication(settings, context) {
  const selectedOptions = options(settings), { runtimeDirectory, inputPath, applicationEnvironment } = context;
  const runtime = await inspectMerchantRuntime(runtimeDirectory, { load: false });
  const inputs = await Promise.all(sourceFiles.map(name => inputPath(join(runtime.sourceRoot, PRODUCT + name), 'file')));
  const managed = inputs.find(item => item.path.endsWith('/managed.mjs'));
  need(HASH.test(managed?.sha256 ?? ''), 'APPLICATION_GRPC_PRODUCT_SOURCE_CHANGED');
  const url = pathToFileURL(managed.path); url.searchParams.set('grpcProductSource', managed.sha256);
  const module = await import(url.href), { environment } = await applicationEnvironment(settings.environmentFile);
  need(typeof module.inspectGrpcProductLaunch === 'function', 'APPLICATION_GRPC_PRODUCT_NOT_INSTALLED');
  const selected = await module.inspectGrpcProductLaunch(selectedOptions, { environment });
  need(selected.schema === LAUNCH && HASH.test(selected.bindingSha256 ?? '') && HASH.test(selected.resourceId ?? '') &&
    selected.directory === selectedOptions.directory && isDeepStrictEqual(selected.options, selectedOptions),
  'APPLICATION_GRPC_PRODUCT_BINDING_CHANGED');
  for (const item of selected.files) {
    const observed = await inputPath(item.path, 'file');
    need(observed.bytes === item.bytes && (!observed.sha256 || observed.sha256 === item.sha256), 'APPLICATION_GRPC_PRODUCT_INPUT_CHANGED');
    inputs.push({ ...observed, sha256: item.sha256, role: item.role });
  }
  for (const item of selected.directories) {
    const observed = await inputPath(item.path, 'directory', false, true);
    need(String(observed.dev) === item.dev && String(observed.ino) === item.ino, 'APPLICATION_GRPC_PRODUCT_INPUT_CHANGED');
    inputs.push({ ...observed, role: item.role });
  }
  const args = ['open', '--dir', selected.directory, '--expected-binding', selected.bindingSha256,
    '--workspace-port', String(selectedOptions.workspacePort), '--seller-port', String(selectedOptions.sellerPort),
    '--operations-port', String(selectedOptions.operationsPort), '--token-env', selectedOptions.tokenEnv];
  if (selectedOptions.browserOnly) args.push('--browser-only');
  if (selectedOptions.facilitator) args.push('--facilitator', selectedOptions.facilitator);
  if (selectedOptions.allowLocalFacilitator) args.push('--allow-local-facilitator');
  return { args, inputs, createDirectories: [], resourceKey: selected.resourceId,
    applicationReview: { schema: 'stellar-forge.application-review-content.v1', title: 'gRPC merchant product',
      summary: 'One original native workspace, browser and merchant agent for source capture, message sequences, release operations, upgrades and health.',
      sections: [
        { title: 'Original workspace', rows: [
          { label: 'Product', value: selected.profile.name }, { label: 'Native state', value: selected.profile.workspaceDirectory },
          { label: 'Workspace alias', value: selected.profile.workspace },
          { label: 'Selected contract', value: selected.review.selectedRevision ?? 'No contract selected yet' },
          { label: 'Capture handles', value: selected.handles.captures }, { label: 'Reflection profiles', value: selected.handles.reflections },
          { label: 'Receiving handles', value: selected.handles.files },
          { label: 'Agent', value: selectedOptions.browserOnly ? 'Browser only' : 'Original authenticated merchant MCP' },
          { label: 'Health and calls', value: 'Retain the same native operation UUID and first result through stop and reopen' },
        ] },
        { title: 'Original source and configuration', collapsed: true,
          rows: selected.files.map(file => ({ label: file.role, value: [file.path, String(file.bytes) + ' bytes', file.sha256] })) },
      ] } };
}
function requested(request) {
  need(!request.pythonCommand && !request.terminal && request.command === 'grpc-product' &&
    Array.isArray(request.args) && request.args[0] === 'open', 'APPLICATION_GRPC_PRODUCT_STARTUP_CHANGED');
  const values = new Map(), booleans = ['--browser-only', '--allow-local-facilitator'];
  for (let index = 1; index < request.args.length; index++) {
    const key = request.args[index];
    need(['--dir', '--port', '--workspace-port', '--seller-port', '--operations-port',
      '--token-env', '--expected-binding', '--facilitator', ...booleans].includes(key) && !values.has(key),
    'APPLICATION_GRPC_PRODUCT_STARTUP_CHANGED');
    if (booleans.includes(key)) values.set(key, true);
    else {
      const value = request.args[++index];
      need(typeof value === 'string' && value && !value.startsWith('--'), 'APPLICATION_GRPC_PRODUCT_STARTUP_CHANGED');
      values.set(key, value);
    }
  }
  const port = values.get('--port') ?? '0', workspacePort = values.get('--workspace-port') ?? '0';
  need([port, workspacePort].every(value => /^(0|[1-9][0-9]*)$/.test(value) && Number(value) <= 65535) &&
    HASH.test(values.get('--expected-binding') ?? '') && ENV.test(values.get('--token-env') ?? 'MCP_ACCESS_TOKEN'),
  'APPLICATION_GRPC_PRODUCT_STARTUP_CHANGED');
  return { directory: absolute(values.get('--dir')), port: Number(port), workspacePort: Number(workspacePort),
    tokenEnv: values.get('--token-env') ?? 'MCP_ACCESS_TOKEN', browserOnly: values.has('--browser-only'),
    bindingSha256: values.get('--expected-binding') };
}
async function liveLaunch(url) {
  const response = await fetch(new URL('/api/launch', url.origin), { redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { 'x-workspace-token': url.hash.slice(1), accept: 'application/json' } });
  need(response.status === 200 && response.body, 'APPLICATION_GRPC_PRODUCT_NOT_READY');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length; need(size <= 16384, 'APPLICATION_GRPC_PRODUCT_STARTUP_CHANGED'); chunks.push(chunk);
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)));
}
export async function grpcProductStartup(request, text) {
  if (typeof text !== 'string' || text.length > 32768 || !text.startsWith('{')) return null;
  let value; try { value = JSON.parse(text); } catch { return null; }
  if (!plain(value) || value.schema !== SESSION || value.state !== 'OPEN') return null;
  const selected = requested(request), rawBrowser = applicationPrivateUrl(value.browserUrl);
  need(rawBrowser && value.directory === selected.directory && value.bindingSha256 === selected.bindingSha256 &&
    value.port === selected.port && value.workspacePort === selected.workspacePort &&
    value.browserOnly === selected.browserOnly && value.tokenEnv === selected.tokenEnv &&
    value.connectionFile === join(selected.directory, 'connection.json') &&
    value.consoleUrlFile === join(selected.directory, 'console-url.txt') && HASH.test(value.resourceId ?? ''),
  'APPLICATION_GRPC_PRODUCT_STARTUP_CHANGED');
  const browser = new URL(rawBrowser);
  need(browser.hostname === '127.0.0.1' && browser.pathname === '/' && !browser.search && HASH.test(browser.hash.slice(1)) &&
    (selected.workspacePort === 0 || Number(browser.port || 80) === selected.workspacePort),
  'APPLICATION_GRPC_PRODUCT_STARTUP_CHANGED');
  const retained = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
    await readSf61HostFile(value.connectionFile, 65536, { privateFile: true })));
  need(isDeepStrictEqual(retained, value), 'APPLICATION_GRPC_PRODUCT_INSTANCE_CHANGED');
  const original = await liveLaunch(browser);
  need(isDeepStrictEqual(original, value.nativeLaunch) && original.instanceId === value.nativeInstanceId &&
    original.state === 'LISTENING' && original.directory === value.workspaceDirectory,
  'APPLICATION_GRPC_PRODUCT_INSTANCE_CHANGED');
  const stillOpen = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
    await readSf61HostFile(value.connectionFile, 65536, { privateFile: true })));
  need(isDeepStrictEqual(stillOpen, value), 'APPLICATION_GRPC_PRODUCT_INSTANCE_CHANGED');
  const links = [];
  if (selected.browserOnly) need(value.mcpUrl === null, 'APPLICATION_GRPC_PRODUCT_STARTUP_CHANGED');
  else {
    const rawMcp = applicationPrivateUrl(value.mcpUrl); need(rawMcp, 'APPLICATION_GRPC_PRODUCT_STARTUP_CHANGED');
    const mcp = new URL(rawMcp);
    need(mcp.hostname === '127.0.0.1' && mcp.pathname === '/mcp' && !mcp.search && !mcp.hash &&
      mcp.origin !== browser.origin && (selected.port === 0 || Number(mcp.port || 80) === selected.port),
    'APPLICATION_GRPC_PRODUCT_STARTUP_CHANGED');
    links.push({ label: 'gRPC merchant agent', url: mcp.href });
  }
  return { url: browser.href, links, connectionFile: value.connectionFile,
    original: { schema: SESSION, productId: value.productId, workspace: value.workspace,
      directory: value.directory, workspaceDirectory: value.workspaceDirectory, instanceId: value.instanceId,
      nativeInstanceId: value.nativeInstanceId, bindingSha256: value.bindingSha256, resourceId: value.resourceId } };
}
export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'grpc-product', order: 430,
  catalog({ common, field }) { return [{
    id: 'grpc-product', command: 'grpc-product', title: 'gRPC merchant product', terminal: false,
    requiredSource: PRODUCT + 'managed.mjs',
    description: 'Open the saved gRPC browser and merchant agent together; operate original contracts, message streams, releases, upgrades and service health.',
    fields: [
      field('workspaceDirectory', 'Private product directory', 'path', true, 'Use the directory initialized by grpc-product init.'),
      field('workspacePort', 'Native browser port', 'port', false, 'Use 0 for an available local browser port.'),
      field('sellerPort', 'Seller preview port', 'port', false, 'Use 0; preview starts only when explicitly requested.'),
      field('operationsPort', 'Seller operations port', 'port', false, 'Use 0 for an available operations port.'),
      field('facilitator', 'Payment facilitator URL', 'text', false, 'Optional original HTTPS facilitator for paid operation.'),
      field('allowLocalFacilitator', 'Permit selected local facilitator', 'boolean', false, 'For an explicitly selected http://127.0.0.1 development facilitator.'),
      field('browserOnly', 'Browser only', 'boolean', false, 'Open the native browser without an MCP listener.'),
      field('tokenEnv', 'Agent token environment name', 'text', false, 'Defaults to MCP_ACCESS_TOKEN; values stay in the private process environment.'),
      ...common.map(item => item.name === 'port' ? { ...item, label: 'Agent port', description: 'Use 0 for an available local MCP port.' } : item),
    ],
  }]; },
  validateSettings(type, settings) {
    need(settings.tokenEnv === undefined || ENV.test(settings.tokenEnv), 'APPLICATION_GRPC_PRODUCT_TOKEN_ENV');
    need(!settings.browserOnly || settings.port === undefined || settings.port === 0, 'APPLICATION_GRPC_PRODUCT_PORT');
  },
  prepare(type, settings, context) { return prepareGrpcProductApplication(settings, context); },
  matchRequest(request) { return !request.pythonCommand && request.command === 'grpc-product' && request.args?.[0] === 'open'; },
  createObserver(request, directory) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.startsWith('{')) return null;
      return () => grpcProductStartup(request, text);
    });
  },
};
