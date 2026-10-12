// MIT. Review binds native GraphQL configuration, not changing project contents.
import { lstat, realpath } from 'node:fs/promises';
import { dirname, join, isAbsolute, resolve } from 'node:path';
import { readGraphqlProduct, privateBytes, canonical, sha256, decode, failure, absolute, plain } from './workspace.mjs';

export const GRAPHQL_PRODUCT_LAUNCH_SCHEMA = 'stellar-forge.graphql-product-launch.v1';
const ENV = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
function settings(input) {
  const port = input.port ?? 0, tokenEnv = input.tokenEnv ?? 'MCP_ACCESS_TOKEN', browserOnly = input.browserOnly ?? false;
  if (!Number.isInteger(port) || port < 0 || port > 65535 || !ENV.test(tokenEnv) || typeof browserOnly !== 'boolean')
    throw failure('GRAPHQL_PRODUCT_INPUT', 'Use a local agent port from 0 to 65535, a token environment name and a boolean browserOnly.');
  if (browserOnly && port !== 0)
    throw failure('GRAPHQL_PRODUCT_INPUT', 'Browser-only mode does not select an MCP listener port.');
  return { directory: absolute(input.directory), port, tokenEnv, browserOnly };
}
async function file(role, path, maximum = 1024 * 1024) {
  const actual = await realpath(path), bytes = await privateBytes(actual, false, maximum);
  return { role, path: actual, ...(actual === path ? {} : { referencePath: path }),
    bytes: bytes.length, sha256: sha256(bytes) };
}
async function directory(role, path) {
  const actual = await realpath(path), value = await lstat(actual);
  if (!value.isDirectory()) throw failure('GRAPHQL_PRODUCT_BINDING_CHANGED', 'The original ' + role + ' is no longer its directory.');
  return { role, path: actual, dev: String(value.dev), ino: String(value.ino) };
}
async function observe(value, options, environment) {
  const { profile, selected, native } = value;
  const files = [
    await file('product', join(profile.directory, 'product.json')),
    await file('setup', join(profile.directory, 'product.setup.json')),
    await file('configuration', profile.configuration),
    await file('graphqlConnection', profile.connection),
  ];
  const raw = decode(await privateBytes(profile.configuration));
  const retained = new Set(files.map(item => item.path));
  for (const [name, path] of Object.entries(raw)) {
    if (!name.endsWith('Connection') || typeof path !== 'string') continue;
    const actual = await realpath(resolve(dirname(profile.configuration), path));
    if (retained.has(actual)) continue;
    files.push(await file(name, actual, 64 * 1024 * 1024)); retained.add(actual);
  }
  const oauth = options.browserOnly ? null : environment.MCP_OAUTH_CONFIG || null;
  if (oauth) {
    if (typeof oauth !== 'string' || !isAbsolute(oauth))
      throw failure('GRAPHQL_PRODUCT_INPUT', 'MCP_OAUTH_CONFIG selects the original absolute host configuration file.');
    if (!retained.has(await realpath(oauth))) files.push(await file('mcpOAuth', oauth, 262144));
  }
  const directories = [];
  for (const [role, path] of Object.entries({ product: profile.directory,
    graphql: profile.workspaceDirectory, operator: dirname(profile.configuration),
    releases: native.releaseStore, exports: native.exportsDirectory, receiving: profile.receivingDirectory }))
    directories.push(await directory(role, path));
  return { files, directories, selection: { workspace: profile.workspace, sources: selected.sources,
    runtime: selected.runtime, hosts: selected.hosts },
    authorization: { mode: options.browserOnly ? 'browser-only' : oauth ? 'oauth' : 'fixed-bearer',
      tokenEnv: options.tokenEnv, oauthConfig: oauth, clientOrigins: options.browserOnly ? []
        : String(environment.MCP_CLIENT_ORIGINS ?? '').split(',').map(item => item.trim()).filter(Boolean) } };
}
export async function inspectGraphqlLaunch(input = {}, { environment = process.env } = {}) {
  const options = settings(input), value = await readGraphqlProduct(options.directory);
  const observed = await observe(value, options, environment);
  const next = await readGraphqlProduct(options.directory), confirmed = await observe(next, options, environment);
  if (canonical(value.profile) !== canonical(next.profile) || canonical(observed) !== canonical(confirmed))
    throw failure('GRAPHQL_PRODUCT_BINDING_CHANGED', 'The original GraphQL setup changed during review. Review its current source again.');
  const resourceId = sha256(canonical({ schema: 'stellar-forge.graphql-product-resource.v1',
    directory: value.profile.workspaceDirectory }));
  const binding = { schema: GRAPHQL_PRODUCT_LAUNCH_SCHEMA, resourceId, profile: value.profile, options, ...observed };
  return { schema: GRAPHQL_PRODUCT_LAUNCH_SCHEMA, profile: value.profile, directory: options.directory,
    options, resourceId, binding, bindingSha256: sha256(canonical(binding)), ...observed,
    review: { name: value.profile.name, workspace: value.profile.workspace,
      workspaceDirectory: value.profile.workspaceDirectory, sourceCount: Object.keys(value.selected.sources).length,
      hostAliases: Object.keys(value.selected.hosts), ownership: 'ORIGINAL_MERCHANT_GRAPHQL_WORKSPACES',
      browser: 'The original SF105 local browser chooses its available listener.',
      agent: options.browserOnly ? 'Browser only' : 'Original authenticated merchant MCP',
      receiving: 'Original draft, preview, merchant, evolution, deployment and host file sets' } };
}
export async function openGraphqlManaged(input = {}, options = {}) {
  if (!/^[a-f0-9]{64}$/.test(input.expectedBindingSha256 ?? ''))
    throw failure('GRAPHQL_PRODUCT_BINDING_REQUIRED', 'Supply the exact reviewed GraphQL launch binding.');
  const { openGraphqlProduct } = await import('./workspace.mjs');
  return openGraphqlProduct(input, options);
}
