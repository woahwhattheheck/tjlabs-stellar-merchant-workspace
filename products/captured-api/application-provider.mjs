// MIT. Captured API product in the original Applications provider registry.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import { APPLICATION_PROVIDER_SCHEMA, applicationPrivateUrl, observeApplicationStartup } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import { absolute, need, plain } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

const PRODUCT = 'products/captured-api/';
const LAUNCH = 'stellar-forge.captured-api-launch.v1';
const STARTUP = 'stellar-forge.captured-api-managed-session.v1';
const HASH = /^[a-f0-9]{64}$/;
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const sourceFiles = [
  'managed.mjs', 'workspace.mjs', 'cli.mjs', 'application-provider.mjs',
  'handover.mjs', 'handover-files.mjs', 'handover-desk.mjs', 'handover-web.mjs',
  'handover-archive.mjs', 'handover-upload.mjs',
  'handover-client.mjs', 'handover-agent.mjs', 'handover-catalog.mjs',
  'handover-provider.mjs', 'handover-views.mjs', 'draft-reconciliation.mjs',
  'web/index.html', 'web/browser.mjs', 'web/style.css', 'web/collaboration.mjs',
].map(name => PRODUCT + name).concat([
  'stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/server.mjs',
  'stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/browser.mjs',
  'stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/index.html',
  'stellar-forge/mcp-merchant-operator/serve.mjs',
  'stellar-forge/mcp-merchant-operator/console/service.mjs',
  'stellar-forge/mcp-merchant-operator/console/store.mjs',
  'stellar-forge/mcp-merchant-operator/console/customers.mjs',
  'stellar-forge/mcp-merchant-operator/console/openapi-customers.mjs',
  'stellar-forge/mcp-merchant-operator/console/openapi-customer-records.mjs',
  'stellar-forge/mcp-merchant-operator/console/workflows.mjs',
  'stellar-forge/mcp-merchant-operator/console/workflow-records.mjs',
  'stellar-forge/mcp-merchant-operator/console/workflow-recipes.mjs',
  'stellar-forge/mcp-merchant-operator/console/public/app.mjs',
  'stellar-forge/mcp-merchant-operator/console/public/workflows.mjs',
  'stellar-forge/mcp-merchant-operator/console/public/workflow-recipes.mjs',
  'stellar-forge/mcp-merchant-operator/console/public/index.html',
]);

function options(settings) {
  return { directory: absolute(settings.workspaceDirectory), port: settings.port ?? 0,
    mcpPort: settings.mcpPort ?? 0, browserOnly: settings.browserOnly === true,
    tokenEnv: settings.tokenEnv ?? 'MCP_ACCESS_TOKEN' };
}
function launchReview(selected) {
  const value = selected.review;
  const port = number => number === 0 ? 'Choose an available local port' : String(number);
  const rows = [
    { label: 'Product', value: value.name },
    { label: 'Product directory', value: selected.directory },
    { label: 'API projects', value: selected.projectsDirectory },
    { label: 'Merchant configuration', value: selected.configuration },
    { label: 'Browser lifetime', value: selected.consoleOwnership === 'PRODUCT'
      ? 'This application starts and stops the original browser and its owned seller.'
      : 'Attach the existing browser; its original application controls its lifetime.' },
    { label: 'Browser port', value: selected.consoleOwnership === 'EXTERNAL'
      ? 'Retained by the existing browser' : port(value.port) },
    { label: 'Source workflows', value: 'Captured network traffic (HAR) and OpenAPI' },
    { label: 'Merchant agent', value: value.browserOnly ? 'Browser only' : 'Original merchant MCP with workspace alias merchant' },
  ];
  if (!value.browserOnly) rows.push(
    { label: 'Agent port', value: port(value.mcpPort) },
    { label: 'Agent authorization', value: value.authorizationMode === 'oauth' ? 'Original OAuth resource configuration' : 'Existing fixed bearer token' },
    { label: 'Token environment name', value: value.tokenEnv },
    { label: 'Operator workspace', value: 'Requests, reusable workflows, profiles and complete customer receiving on the same merchant host.' },
    { label: 'Operator workspace directory', value: value.operatorConsoleDirectory });
  return {
    schema: 'stellar-forge.application-review-content.v1',
    title: 'Captured API merchant',
    summary: 'Continue API sources, route prices and policies, reusable workflows, seller releases and complete customer receiving in the retained product.',
    sections: [
      { title: 'Selected product and sessions', rows },
      { title: 'Configuration files', collapsed: true, rows: selected.files.map(item => ({
        label: item.role, value: [item.path, String(item.bytes) + ' bytes', 'SHA-256 ' + item.sha256],
      })) },
    ],
  };
}

/** Review reads the selected installed product; it never initializes or opens a session. */
export async function prepareCapturedApiApplication(settings, context) {
  const { inputPath, applicationEnvironment, runtimeDirectory } = context;
  need(typeof inputPath === 'function' && typeof applicationEnvironment === 'function',
    'APPLICATION_CAPTURED_API_INTEGRATION');
  const selectedOptions = options(settings);
  need(ENVIRONMENT_NAME.test(selectedOptions.tokenEnv), 'APPLICATION_CAPTURED_API_TOKEN_ENV',
    'Enter the original MCP token environment-variable name.');
  const runtime = await inspectMerchantRuntime(runtimeDirectory, { load: false });
  const inputs = await Promise.all(sourceFiles.map(name => inputPath(join(runtime.sourceRoot, name), 'file')));
  const managed = inputs[0], url = pathToFileURL(managed.path);
  need(HASH.test(managed.sha256 ?? ''), 'APPLICATION_CAPTURED_API_SOURCE_CHANGED');
  url.searchParams.set('capturedApiSource', managed.sha256);
  const original = await import(url.href);
  need(typeof original.inspectCapturedApiLaunch === 'function', 'APPLICATION_CAPTURED_API_NOT_IN_RUNTIME',
    'Choose a runtime containing the captured API managed product.');
  const { environment } = await applicationEnvironment(settings.environmentFile);
  const selected = await original.inspectCapturedApiLaunch(selectedOptions, { environment });
  need(plain(selected) && selected.schema === LAUNCH && HASH.test(selected.bindingSha256 ?? '') &&
    HASH.test(selected.resourceId ?? '') && selected.directory === selectedOptions.directory &&
    typeof selected.projectsDirectory === 'string' && absolute(selected.projectsDirectory) === selected.projectsDirectory &&
    selected.configuration === join(selected.directory, 'operator', 'merchant-mcp.json') &&
    ['PRODUCT', 'EXTERNAL'].includes(selected.consoleOwnership) &&
    Array.isArray(selected.files) && Array.isArray(selected.directories) && plain(selected.review) &&
    selected.review.browserOnly === selectedOptions.browserOnly && selected.review.port === selectedOptions.port &&
    selected.review.mcpPort === selectedOptions.mcpPort && selected.review.tokenEnv === selectedOptions.tokenEnv &&
    selected.review.operatorConsoleDirectory === (selectedOptions.browserOnly ? null : join(selected.directory, 'operator-console')),
  'APPLICATION_CAPTURED_API_BINDING_CHANGED', 'Review the retained captured API product with its original configuration.');
  for (const item of selected.directories) {
    need(plain(item) && typeof item.path === 'string', 'APPLICATION_CAPTURED_API_INPUT_CHANGED');
    const input = await inputPath(item.path, 'directory', false, ['product', 'projects'].includes(item.role));
    need(String(input.dev) === String(item.dev) && String(input.ino) === String(item.ino),
      'APPLICATION_CAPTURED_API_INPUT_CHANGED');
    inputs.push({ ...input, role: item.role });
  }
  for (const item of selected.files) {
    need(plain(item) && HASH.test(item.sha256 ?? '') && Number.isSafeInteger(item.bytes) && item.bytes >= 0,
      'APPLICATION_CAPTURED_API_INPUT_CHANGED');
    const input = await inputPath(item.path, 'file');
    need(input.bytes === item.bytes && (!input.sha256 || input.sha256 === item.sha256),
      'APPLICATION_CAPTURED_API_INPUT_CHANGED', 'The original configuration changed during review.');
    // Large original host files are hashed by the product's own full reader.
    inputs.push({ ...input, sha256: item.sha256, role: item.role });
  }
  const args = ['open', '--dir', selected.directory, '--managed-binding-sha256', selected.bindingSha256,
    '--mcp-port', String(selectedOptions.mcpPort), '--token-env', selectedOptions.tokenEnv];
  if (selectedOptions.browserOnly) args.push('--browser-only');
  return { args, inputs, createDirectories: [], resourceKey: selected.resourceId,
    applicationReview: launchReview(selected),
    ...(selected.browserOAuth ? { openapi: selected.browserOAuth.review } : {}) };
}

function requestOptions(request) {
  need(request.command === 'captured-api' && !request.pythonCommand && !request.terminal &&
    Array.isArray(request.args) && request.args[0] === 'open', 'APPLICATION_CAPTURED_API_STARTUP_CHANGED');
  const values = new Map();
  for (let index = 1; index < request.args.length; index++) {
    const name = request.args[index];
    need(['--dir', '--port', '--mcp-port', '--token-env', '--managed-binding-sha256', '--browser-only'].includes(name) &&
      !values.has(name), 'APPLICATION_CAPTURED_API_STARTUP_CHANGED');
    if (name === '--browser-only') { values.set(name, true); continue; }
    const value = request.args[++index];
    need(typeof value === 'string' && value && !value.startsWith('--'), 'APPLICATION_CAPTURED_API_STARTUP_CHANGED');
    values.set(name, value);
  }
  const number = name => {
    const text = values.get(name) ?? '0';
    need(/^(0|[1-9]\d*)$/.test(text) && Number(text) <= 65535, 'APPLICATION_CAPTURED_API_STARTUP_CHANGED');
    return Number(text);
  };
  const directory = absolute(values.get('--dir')), bindingSha256 = values.get('--managed-binding-sha256');
  const tokenEnv = values.get('--token-env') ?? 'MCP_ACCESS_TOKEN';
  need(HASH.test(bindingSha256 ?? '') && ENVIRONMENT_NAME.test(tokenEnv), 'APPLICATION_CAPTURED_API_STARTUP_CHANGED');
  return { directory, bindingSha256, port: number('--port'), mcpPort: number('--mcp-port'),
    browserOnly: values.has('--browser-only'), tokenEnv };
}

/** The original managed CLI emits one exact session record after both owners are open. */
export function capturedApiStartup(request, text) {
  if (typeof text !== 'string' || text.length > 16384 || !text.startsWith('{')) return null;
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (!plain(value) || value.schema !== STARTUP || value.state !== 'OPEN') return null;
  const selected = requestOptions(request);
  need(value.bindingSha256 === selected.bindingSha256 && HASH.test(value.resourceId ?? '') &&
    value.directory === selected.directory && typeof value.projectsDirectory === 'string' &&
    absolute(value.projectsDirectory) === value.projectsDirectory &&
    value.configuration === join(selected.directory, 'operator', 'merchant-mcp.json') &&
    ['PRODUCT', 'EXTERNAL'].includes(value.consoleOwnership) && value.workspace === 'merchant' &&
    typeof value.name === 'string' && value.name.trim() && value.name.length <= 160 &&
    value.browserOnly === selected.browserOnly && value.port === selected.port &&
    value.mcpPort === selected.mcpPort && value.tokenEnv === selected.tokenEnv &&
    (value.consoleOwnership !== 'EXTERNAL' || selected.port === 0),
  'APPLICATION_CAPTURED_API_STARTUP_CHANGED', 'The original product startup must match the reviewed configuration and launch options.');
  const browser = applicationPrivateUrl(value.browserUrl);
  need(browser, 'APPLICATION_CAPTURED_API_STARTUP_CHANGED');
  const browserUrl = new URL(browser);
  need(browserUrl.pathname === '/' && !browserUrl.search && HASH.test(browserUrl.hash.slice(1)) &&
    (selected.port === 0 || Number(browserUrl.port || 80) === selected.port),
  'APPLICATION_CAPTURED_API_STARTUP_CHANGED');
  const links = [];
  if (value.consoleOwnership === 'PRODUCT') {
    const handover = new URL(browserUrl.href);
    handover.pathname = '/captured-handover/';
    links.push({ label: 'Merchant handover', url: handover.href });
  }
  if (selected.browserOnly) {
    need(value.mcpUrl === null && value.operatorUrl == null && value.operatorConsoleDirectory == null,
      'APPLICATION_CAPTURED_API_STARTUP_CHANGED');
  } else {
    const mcp = applicationPrivateUrl(value.mcpUrl);
    need(mcp, 'APPLICATION_CAPTURED_API_STARTUP_CHANGED');
    const mcpUrl = new URL(mcp);
    need(mcpUrl.hostname === '127.0.0.1' && mcpUrl.pathname === '/' && !mcpUrl.search && !mcpUrl.hash &&
      mcpUrl.origin !== browserUrl.origin && (selected.mcpPort === 0 || Number(mcpUrl.port || 80) === selected.mcpPort),
    'APPLICATION_CAPTURED_API_STARTUP_CHANGED');
    if (value.operatorUrl !== undefined && value.operatorUrl !== null) {
      const operator = applicationPrivateUrl(value.operatorUrl);
      need(operator, 'APPLICATION_CAPTURED_API_STARTUP_CHANGED');
      const operatorUrl = new URL(operator);
      need(operatorUrl.origin === mcpUrl.origin && operatorUrl.pathname === '/operator/' &&
        !operatorUrl.search && !operatorUrl.hash &&
        value.operatorConsoleDirectory === join(selected.directory, 'operator-console'),
      'APPLICATION_CAPTURED_API_STARTUP_CHANGED');
      links.push({ label: 'Operator workspace', url: operatorUrl.href });
    }
    links.push({ label: 'Merchant agent endpoint', url: mcpUrl.href });
  }
  return { url: browserUrl.href, links, original: {
    schema: STARTUP, state: value.state, bindingSha256: value.bindingSha256, resourceId: value.resourceId,
    name: value.name, directory: value.directory, projectsDirectory: value.projectsDirectory,
    configuration: value.configuration, consoleOwnership: value.consoleOwnership, workspace: value.workspace,
    browserOnly: value.browserOnly, port: value.port, mcpPort: value.mcpPort, tokenEnv: value.tokenEnv,
    ...(value.operatorUrl ? { operatorConsoleDirectory: value.operatorConsoleDirectory } : {}),
  } };
}

export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'captured-api', order: 405,
  catalog({ common, field }) {
    return [{
      id: 'captured-api', command: 'captured-api', title: 'Captured API merchant', terminal: false,
      requiredSource: PRODUCT + 'managed.mjs',
      description: 'Open the captured API source editor, merchant agent and persistent operator workspace for pricing, policies, reusable workflows, releases and customer receiving.',
      fields: [
        field('workspaceDirectory', 'Private product directory', 'path', true,
          'Select the existing directory created by starforge captured-api init. It retains the product configuration and original API projects.'),
        field('browserOnly', 'Browser only', 'boolean', false,
          'Open the original browser without starting the merchant MCP agent.'),
        field('mcpPort', 'Merchant agent port', 'port', false,
          'Use 0 to select an available local port, or the original fixed MCP listener.'),
        field('tokenEnv', 'Merchant agent token environment name', 'text', false,
          'Defaults to MCP_ACCESS_TOKEN. Supply its value through the inherited environment or the private environment JSON. Existing MCP_OAUTH_CONFIG remains available.'),
        ...common.map(item => item.name === 'port' ? { ...item, label: 'Browser port',
          description: 'Use 0 for an available port, or the fixed original OAuth callback port. An attached external browser retains its own port.' } : item),
      ],
    }];
  },
  validateSettings(type, settings) {
    need(settings.tokenEnv === undefined || ENVIRONMENT_NAME.test(settings.tokenEnv),
      'APPLICATION_CAPTURED_API_TOKEN_ENV', 'Enter an environment-variable name, such as MCP_ACCESS_TOKEN.');
  },
  prepare(type, settings, context) { return prepareCapturedApiApplication(settings, context); },
  matchRequest(request) {
    return !request.pythonCommand && request.command === 'captured-api' &&
      Array.isArray(request.args) && request.args[0] === 'open' && request.args.includes('--managed-binding-sha256');
  },
  createObserver(request, directory) {
    return observeApplicationStartup(request, directory, text =>
      text.startsWith('{"schema":"' + STARTUP + '",') ? capturedApiStartup(request, text) : null);
  },
};
