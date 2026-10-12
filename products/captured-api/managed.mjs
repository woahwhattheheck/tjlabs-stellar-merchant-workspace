// MIT. Managed launch binding for the original captured API product.
import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readSf61HostFile } from '../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs';
import { readCapturedApi, openCapturedApi } from './workspace.mjs';

export const CAPTURED_API_LAUNCH_SCHEMA = 'stellar-forge.captured-api-launch.v1';
export const CAPTURED_API_MANAGED_SESSION_SCHEMA = 'stellar-forge.captured-api-managed-session.v1';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(value, (_, item) => plain(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, message) => Object.assign(new Error(message), { code });
const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const SAME_SOURCE = 'The retained captured API configuration changed. Review this original product again before starting it.';
function portNumber(value, name) {
  if (!/^\d{1,5}$/.test(String(value)) || Number(value) > 65535)
    throw fail('CAPTURED_API_INPUT', name + ' must be 0–65535.');
  return Number(value);
}
function launchOptions({ directory, port = 0, mcpPort = 0, browserOnly = false,
  tokenEnv = 'MCP_ACCESS_TOKEN' } = {}) {
  if (typeof directory !== 'string' || !directory || directory.includes('\0'))
    throw fail('CAPTURED_API_INPUT', 'Select the retained captured API product directory.');
  if (typeof browserOnly !== 'boolean' || typeof tokenEnv !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenEnv))
    throw fail('CAPTURED_API_INPUT', 'Use a boolean browserOnly and the original MCP token environment name.');
  return { directory: resolve(directory), port: portNumber(port, 'Browser port'),
    mcpPort: portNumber(mcpPort, 'MCP port'), browserOnly, tokenEnv };
}
async function sourceFile(role, path, { optional = false, privateFile = true,
  maximum = 1024 * 1024, follow = false } = {}) {
  try {
    // The original MCP OAuth host accepts an absolute configuration reference;
    // keep that reference while observing the actual file it selects.
    const filename = follow ? await realpath(path) : path;
    const bytes = await readSf61HostFile(filename, maximum, { privateFile });
    return { metadata: { role, path: filename, bytes: bytes.length, sha256: digest(bytes),
      ...(filename === path ? {} : { referencePath: path }) }, bytes };
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw error;
  }
}
async function directoryIdentity(role, path) {
  const filename = await realpath(path), info = await lstat(filename);
  if (!info.isDirectory())
    throw fail('CAPTURED_API_CONFIGURATION_CHANGED', 'The retained ' + role + ' path must be its original directory.');
  // A directory's contents and timestamps change during normal authoring.
  return { role, path: filename, dev: String(info.dev), ino: String(info.ino) };
}
async function observe(profile, options, environment) {
  const entries = [
    await sourceFile('profile', join(profile.directory, 'product.json')),
    await sourceFile('setup', join(profile.directory, 'product.setup.json'), { optional: true }),
    await sourceFile('operator', profile.configuration),
    await sourceFile('harConnection', profile.harConnection),
    await sourceFile('openapiConnection', profile.openapiConnection),
  ].filter(Boolean);
  if (canonical(decode(entries.find(entry => entry.metadata.role === 'profile').bytes)) !== canonical(profile))
    throw fail('CAPTURED_API_CONFIGURATION_CHANGED', SAME_SOURCE);
  const raw = decode(entries.find(entry => entry.metadata.role === 'operator').bytes);
  // Native readCapturedApi/readMerchantConfig already validates these declarations.
  // Preserve operator-added providers and bind their selected configuration files too.
  const originalPaths = new Set(entries.map(entry => entry.metadata.path));
  for (const [role, value] of Object.entries(raw).sort(([left], [right]) => left.localeCompare(right))) {
    if (!role.endsWith('Connection') || typeof value !== 'string') continue;
    const filename = resolve(dirname(profile.configuration), value);
    if (originalPaths.has(filename)) continue;
    entries.push(await sourceFile(role, filename, { privateFile: false, maximum: 64 * 1024 * 1024, follow: true }));
    originalPaths.add(filename);
  }
  if (profile.oauthConnectionsFile)
    entries.push(await sourceFile('browserOAuth', profile.oauthConnectionsFile));
  const mcpOAuth = options.browserOnly ? null : environment.MCP_OAUTH_CONFIG || null;
  if (mcpOAuth !== null) {
    if (typeof mcpOAuth !== 'string' || !isAbsolute(mcpOAuth))
      throw fail('CAPTURED_API_INPUT', 'MCP_OAUTH_CONFIG must be the original absolute OAuth configuration path.');
    entries.push(await sourceFile('mcpOAuth', mcpOAuth,
      { privateFile: false, maximum: 262144, follow: true }));
  }
  let browserOAuth = null;
  if (profile.console.ownership === 'PRODUCT' && profile.oauthConnectionsFile) {
    const { inspectOpenApiLaunch } =
      await import('../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/managed-launch.mjs');
    const selected = await inspectOpenApiLaunch({
      outputParent: profile.projectsDirectory, port: options.port,
      oauthConnectionsFile: profile.oauthConnectionsFile, allowLoopbackOAuth: false,
    }, { env: environment, allowMissingOutput: false });
    browserOAuth = { binding: selected.binding, bindingSha256: selected.bindingSha256, review: selected.review };
  }
  const directories = [];
  for (const [role, path] of Object.entries({
    product: profile.directory, projects: profile.projectsDirectory, operator: profile.operatorDirectory,
    inputs: profile.inputsDirectory, receiving: profile.receivingDirectory,
    releases: resolve(dirname(profile.configuration), raw.releaseStore),
    exports: resolve(dirname(profile.configuration), raw.exportsDirectory),
  })) directories.push(await directoryIdentity(role, path));
  for (const selected of browserOAuth?.binding.profiles ?? [])
    directories.push({ role: 'browserOAuth:' + selected.alias, path: selected.directory.directory,
      dev: String(selected.directory.device), ino: String(selected.directory.inode) });
  const files = entries.map(entry => entry.metadata);
  const authorization = { mode: options.browserOnly ? 'browser-only' : mcpOAuth ? 'oauth' : 'fixed-bearer',
    tokenEnv: options.tokenEnv, mcpOAuthConfig: mcpOAuth,
    clientOrigins: options.browserOnly ? [] : String(environment.MCP_CLIENT_ORIGINS ?? '')
      .split(',').map(value => value.trim()).filter(Boolean) };
  return { files, directories, authorization, browserOAuth };
}
/**
 * Read the original private profile and native configuration without opening a
 * listener. The binding excludes live console URLs, source/review content, package
 * state, release operations, input payloads and session metadata.
 */
export async function inspectCapturedApiLaunch(input = {}, { environment = process.env } = {}) {
  const options = launchOptions(input), profile = await readCapturedApi(options.directory);
  if (profile.console.ownership === 'EXTERNAL' && options.port !== 0)
    throw fail('CAPTURED_API_INPUT', 'The existing console owns its listener port.');
  if (!options.browserOnly && profile.console.ownership === 'PRODUCT' &&
      options.port !== 0 && options.port === options.mcpPort)
    throw fail('CAPTURED_API_INPUT', 'Choose distinct original browser and MCP listener ports, or use 0.');
  const observed = await observe(profile, options, environment);
  // Join native validation to the exact observed files, including a configuration
  // edit concurrent with the first read. No transient source library is scanned.
  const confirmed = await readCapturedApi(options.directory);
  const after = await observe(confirmed, options, environment);
  if (canonical(profile) !== canonical(confirmed) || canonical(observed) !== canonical(after))
    throw fail('CAPTURED_API_CONFIGURATION_CHANGED', SAME_SOURCE);
  const resourceId = digest(canonical({ schema: 'stellar-forge.captured-api-resource.v1',
    directory: profile.directory, projectsDirectory: profile.projectsDirectory,
    consoleOwnership: profile.console.ownership }));
  // The original MCP owns this persistent Console. Its working files are created
  // on first open, so bind the selected location without treating authoring state
  // or creation of that child directory as a configuration change.
  const operatorConsole = options.browserOnly ? null : {
    directory: join(profile.directory, 'operator-console'), pathname: '/operator/',
  };
  const binding = { schema: CAPTURED_API_LAUNCH_SCHEMA, resourceId, profile,
    options, ...observed, operatorConsole };
  const bindingSha256 = digest(canonical(binding));
  const review = { name: profile.name, directory: profile.directory, projectsDirectory: profile.projectsDirectory,
    configuration: profile.configuration, consoleOwnership: profile.console.ownership, workspace: 'merchant',
    browserOnly: options.browserOnly, port: options.port, mcpPort: options.mcpPort,
    tokenEnv: options.tokenEnv, authorizationMode: observed.authorization.mode,
    sourceProviders: ['har','openapi'], configurationFileCount: observed.files.length,
    oauthConnectionsFile: profile.oauthConnectionsFile,
    operatorConsoleDirectory: operatorConsole?.directory ?? null };
  return { schema: CAPTURED_API_LAUNCH_SCHEMA, binding, bindingSha256, resourceId, profile, operatorConsole,
    directory: profile.directory, projectsDirectory: profile.projectsDirectory, configuration: profile.configuration,
    consoleOwnership: profile.console.ownership, files: observed.files, directories: observed.directories, review,
    browserOAuth: observed.browserOAuth,
    listeners: { browser: { enabled: true, ownership: profile.console.ownership,
      requestedPort: options.port, urlFile: profile.console.urlFile },
    mcp: { enabled: !options.browserOnly, ownership: 'PRODUCT', requestedPort: options.mcpPort,
      tokenEnv: options.tokenEnv, authorizationMode: observed.authorization.mode } } };
}
/** The original product owns the lease, accepted mutations and both native drains. */
export async function openCapturedApiManaged(input = {}, { environment = process.env } = {}) {
  const options = launchOptions(input), expected = input.expectedBindingSha256;
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
    throw fail('CAPTURED_API_BINDING_REQUIRED', 'Start with the SHA-256 returned by this product’s inspected launch.');
  const active = await openCapturedApi({ ...options, environment, managedBindingSha256: expected });
  const startup = { schema: CAPTURED_API_MANAGED_SESSION_SCHEMA, state: active.state,
    bindingSha256: active.launchBinding.bindingSha256, resourceId: active.launchBinding.resourceId,
    name: active.name, directory: active.directory, projectsDirectory: active.projectsDirectory,
    configuration: active.configuration, consoleOwnership: active.console.ownership,
    browserUrl: active.browserUrl, mcpUrl: active.mcpUrl,
    operatorUrl: active.operatorUrl, operatorConsoleDirectory: active.operatorConsoleDirectory,
    workspace: active.workspace,
    browserOnly: options.browserOnly, port: options.port, mcpPort: options.mcpPort, tokenEnv: options.tokenEnv };
  return { ...active, bindingSha256: startup.bindingSha256, resourceId: startup.resourceId, startup };
}
