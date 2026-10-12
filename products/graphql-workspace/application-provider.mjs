// MIT. Original GraphQL customer product in the source-owned Applications catalog.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import { APPLICATION_PROVIDER_SCHEMA, applicationPrivateUrl, observeApplicationStartup } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import { absolute, need, plain } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

const PRODUCT = 'products/graphql-workspace/';
const LAUNCH = 'stellar-forge.graphql-product-launch.v1';
const SESSION = 'stellar-forge.graphql-product-session.v1';
const HASH = /^[a-f0-9]{64}$/, ENV = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const sourceFiles = ['managed.mjs', 'workspace.mjs', 'client.mjs', 'cli.mjs', 'application-provider.mjs'];
function options(settings) {
  return { directory: absolute(settings.workspaceDirectory), port: settings.port ?? 0,
    browserOnly: settings.browserOnly === true, tokenEnv: settings.tokenEnv ?? 'MCP_ACCESS_TOKEN' };
}
export async function prepareGraphqlApplication(settings, context) {
  const selectedOptions = options(settings), { inputPath, applicationEnvironment, runtimeDirectory } = context;
  const runtime = await inspectMerchantRuntime(runtimeDirectory, { load: false });
  const inputs = await Promise.all(sourceFiles.map(name => inputPath(join(runtime.sourceRoot, PRODUCT + name), 'file')));
  const selectedSource = inputs[0], url = pathToFileURL(selectedSource.path);
  need(HASH.test(selectedSource.sha256 ?? ''), 'APPLICATION_GRAPHQL_SOURCE_CHANGED');
  url.searchParams.set('graphqlProductSource', selectedSource.sha256);
  const original = await import(url.href);
  need(typeof original.inspectGraphqlLaunch === 'function', 'APPLICATION_GRAPHQL_NOT_INSTALLED',
    'Select the complete runtime containing the GraphQL customer product.');
  const { environment } = await applicationEnvironment(settings.environmentFile);
  const selected = await original.inspectGraphqlLaunch(selectedOptions, { environment });
  need(plain(selected) && selected.schema === LAUNCH && HASH.test(selected.bindingSha256 ?? '') &&
    HASH.test(selected.resourceId ?? '') && selected.directory === selectedOptions.directory &&
    selected.options.port === selectedOptions.port && selected.options.browserOnly === selectedOptions.browserOnly &&
    selected.options.tokenEnv === selectedOptions.tokenEnv && plain(selected.profile) &&
    Array.isArray(selected.files) && Array.isArray(selected.directories),
  'APPLICATION_GRAPHQL_BINDING_CHANGED', 'Review the original GraphQL product and its selected source.');
  for (const item of selected.directories) {
    const observed = await inputPath(item.path, 'directory', false, true);
    need(String(observed.dev) === item.dev && String(observed.ino) === item.ino, 'APPLICATION_GRAPHQL_INPUT_CHANGED');
    inputs.push({ ...observed, role: item.role });
  }
  for (const item of selected.files) {
    const observed = await inputPath(item.path, 'file');
    need(observed.bytes === item.bytes && (!observed.sha256 || observed.sha256 === item.sha256),
      'APPLICATION_GRAPHQL_INPUT_CHANGED', 'A native configuration file changed during review.');
    inputs.push({ ...observed, sha256: item.sha256, role: item.role });
  }
  const args = ['open', '--dir', selected.directory, '--expected-binding', selected.bindingSha256,
    '--token-env', selectedOptions.tokenEnv];
  if (selectedOptions.browserOnly) args.push('--browser-only');
  return { args, inputs, createDirectories: [], resourceKey: selected.resourceId,
    applicationReview: { schema: 'stellar-forge.application-review-content.v1',
      title: 'GraphQL merchant workspace',
      summary: 'One original SF105 browser and merchant agent retain the same schema, queries, previews, merchant packages, deployments and releases.',
      sections: [
        { title: 'Selected workspace', rows: [
          { label: 'Product', value: selected.profile.name },
          { label: 'Workspace alias', value: selected.profile.workspace },
          { label: 'Saved projects', value: selected.profile.workspaceDirectory },
          { label: 'Native source aliases', value: Object.keys(selected.selection.sources) },
          { label: 'Host plan aliases', value: Object.keys(selected.selection.hosts) },
          { label: 'Merchant agent', value: selectedOptions.browserOnly ? 'Browser only' : 'Original authenticated MCP' },
          { label: 'Agent port', value: selectedOptions.port === 0 ? 'Choose an available local port' : String(selectedOptions.port) },
          { label: 'Receiving', value: 'Exact original draft, preview, merchant, evolution, deployment and host files' },
        ] },
        { title: 'Source configuration', collapsed: true, rows: selected.files.map(file => ({
          label: file.role, value: [file.path, String(file.bytes) + ' bytes', 'SHA-256 ' + file.sha256],
        })) },
      ] } };
}
function requestOptions(request) {
  need(!request.pythonCommand && !request.terminal && request.command === 'graphql-product' &&
    Array.isArray(request.args) && request.args[0] === 'open', 'APPLICATION_GRAPHQL_STARTUP_CHANGED');
  const values = new Map();
  for (let i = 1; i < request.args.length; i++) {
    const key = request.args[i];
    need(['--dir', '--port', '--token-env', '--expected-binding', '--browser-only'].includes(key) && !values.has(key),
      'APPLICATION_GRAPHQL_STARTUP_CHANGED');
    if (key === '--browser-only') { values.set(key, true); continue; }
    const value = request.args[++i];
    need(typeof value === 'string' && value && !value.startsWith('--'), 'APPLICATION_GRAPHQL_STARTUP_CHANGED');
    values.set(key, value);
  }
  const port = values.get('--port') ?? '0', tokenEnv = values.get('--token-env') ?? 'MCP_ACCESS_TOKEN';
  need(/^(0|[1-9]\d*)$/.test(port) && Number(port) <= 65535 && ENV.test(tokenEnv) &&
    HASH.test(values.get('--expected-binding') ?? ''), 'APPLICATION_GRAPHQL_STARTUP_CHANGED');
  return { directory: absolute(values.get('--dir')), port: Number(port), tokenEnv,
    browserOnly: values.has('--browser-only'), bindingSha256: values.get('--expected-binding') };
}
export function graphqlApplicationStartup(request, text) {
  if (typeof text !== 'string' || text.length > 16384 || !text.startsWith('{"schema":"' + SESSION + '",')) return null;
  let value; try { value = JSON.parse(text); } catch { return null; }
  if (!plain(value) || value.state !== 'OPEN') return null;
  const selected = requestOptions(request), browser = applicationPrivateUrl(value.browserUrl);
  need(value.schema === SESSION && value.directory === selected.directory &&
    value.bindingSha256 === selected.bindingSha256 && HASH.test(value.resourceId ?? '') &&
    value.port === selected.port && value.tokenEnv === selected.tokenEnv && value.browserOnly === selected.browserOnly &&
    /^[a-f0-9-]{36}$/.test(value.productId ?? '') && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.workspace ?? '') &&
    value.connectionFile === join(selected.directory, 'connection.json') && browser,
  'APPLICATION_GRAPHQL_STARTUP_CHANGED', 'The original startup must match its reviewed product and native workspace.');
  const browserUrl = new URL(browser), links = [];
  need(browserUrl.pathname === '/' && !browserUrl.search && HASH.test(browserUrl.hash.slice(1)), 'APPLICATION_GRAPHQL_STARTUP_CHANGED');
  if (selected.browserOnly) need(value.mcpUrl === null, 'APPLICATION_GRAPHQL_STARTUP_CHANGED');
  else {
    const mcp = applicationPrivateUrl(value.mcpUrl);
    need(mcp, 'APPLICATION_GRAPHQL_STARTUP_CHANGED');
    const agent = new URL(mcp);
    need(agent.hostname === '127.0.0.1' && agent.pathname === '/mcp' && !agent.search && !agent.hash &&
      agent.origin !== browserUrl.origin && (selected.port === 0 || Number(agent.port || 80) === selected.port),
    'APPLICATION_GRAPHQL_STARTUP_CHANGED');
    links.push({ label: 'GraphQL merchant agent endpoint', url: agent.href });
  }
  return { url: browserUrl.href, links, connectionFile: value.connectionFile,
    original: { schema: SESSION, productId: value.productId, workspace: value.workspace,
      nativeInstanceId: value.nativeInstanceId, directory: value.directory, workspaceDirectory: value.workspaceDirectory,
      connectionFile: value.connectionFile, bindingSha256: value.bindingSha256, resourceId: value.resourceId } };
}
export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'graphql-product', order: 410,
  catalog({ common, field }) { return [{
    id: 'graphql-product', command: 'graphql-product', title: 'GraphQL merchant workspace', terminal: false,
    requiredSource: PRODUCT + 'managed.mjs',
    description: 'Open the original saved GraphQL authoring browser and merchant agent, prepare merchant and deployment packages, and receive their exact native files.',
    fields: [
      field('workspaceDirectory', 'Private product directory', 'path', true,
        'Select the retained directory initialized by starforge graphql-product init.'),
      field('browserOnly', 'Browser only', 'boolean', false, 'Open the original SF105 browser without an MCP listener.'),
      field('tokenEnv', 'Agent token environment name', 'text', false,
        'Defaults to MCP_ACCESS_TOKEN. Supply the token through the original inherited environment or private environment JSON.'),
      ...common.map(item => item.name === 'port' ? { ...item, label: 'Agent port',
        description: 'Use 0 for an available local MCP port. The original browser selects its own available listener.' } : item),
    ],
  }]; },
  validateSettings(type, settings) {
    need(settings.tokenEnv === undefined || ENV.test(settings.tokenEnv), 'APPLICATION_GRAPHQL_TOKEN_ENV');
    need(!settings.browserOnly || settings.port === undefined || settings.port === 0,
      'APPLICATION_GRAPHQL_PORT', 'Browser-only mode does not select an agent port.');
  },
  prepare(type, settings, context) { return prepareGraphqlApplication(settings, context); },
  matchRequest(request) { return !request.pythonCommand && request.command === 'graphql-product' &&
    Array.isArray(request.args) && request.args[0] === 'open' && request.args.includes('--expected-binding'); },
  createObserver(request, directory) {
    return observeApplicationStartup(request, directory, text => graphqlApplicationStartup(request, text));
  },
};
