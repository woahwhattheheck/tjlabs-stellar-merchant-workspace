// MIT. Review the exact original product, native source, selected revision and private directories.
import { lstat } from 'node:fs/promises';
import { join, dirname, isAbsolute } from 'node:path';
import { readGrpcProduct } from './workspace.mjs';
import { LAUNCH_SCHEMA, need, canonical, sha256, privateBytes, privateDirectory, launchOptions } from './common.mjs';
import { merchantConsoleSource, inspectMerchantConsoleDirectory } from '../../stellar-forge/mcp-merchant-operator/console/managed.mjs';
import { inspectGrpcWorkspaceBinding } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/workspace/binding.mjs';
import { readGrpcLaunchSource, validateGrpcManagedSelection, GRPC_MANAGED_SELECTION } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/workspace/managed-launch.mjs';

async function file(role, path, maximum = 1024 * 1024) {
  const bytes = await privateBytes(path, false, maximum);
  return { role, path, bytes: bytes.length, sha256: sha256(bytes), maximum };
}
async function directory(role, path) {
  await privateDirectory(path);
  const info = await lstat(path, { bigint: true });
  return { role, path, dev: info.dev.toString(), ino: info.ino.toString() };
}
async function observation(value, options, environment) {
  const { profile, native, selected } = value;
  const files = [
    await file('product', join(profile.directory, 'product.json')),
    await file('setup', join(profile.directory, 'product.setup.json')),
    await file('merchant', profile.configuration),
    await file('native connection', profile.connection),
  ];
  const oauth = options.browserOnly ? null : environment.MCP_OAUTH_CONFIG || null;
  if (oauth) {
    need(typeof oauth === 'string' && isAbsolute(oauth), 'Select the original absolute MCP OAuth resource configuration.');
    files.push(await file('MCP OAuth resource', oauth, 262144));
  }
  const directories = [];
  for (const [role, path] of Object.entries({ product: profile.directory, workspace: profile.workspaceDirectory,
    operator: dirname(profile.configuration), releases: native.releaseStore,
    exports: native.exportsDirectory, receiving: profile.receivingDirectory }))
    directories.push(await directory(role, path));
  const workspace = await inspectGrpcWorkspaceBinding(profile.workspaceDirectory), source = await readGrpcLaunchSource();
  const nativeSelection = validateGrpcManagedSelection({ schema: GRPC_MANAGED_SELECTION,
    workspace, sourceFiles: source.files, sourceSha256: source.sha256 });
  const operatorConsole = options.browserOnly ? null : {
    ...await inspectMerchantConsoleDirectory(join(profile.directory, 'operator-console')),
    source: await merchantConsoleSource(),
  };
  return { files, directories, nativeSelection, operatorConsole,
    handles: { captures: Object.keys(selected.captures), reflections: Object.keys(selected.reflections), files: Object.keys(selected.files) },
    authorization: { mode: options.browserOnly ? 'browser-only' : oauth ? 'oauth' : 'fixed-bearer',
      tokenEnv: options.tokenEnv, oauthConfig: oauth,
      clientOrigins: options.browserOnly ? [] : String(environment.MCP_CLIENT_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean) } };
}
export async function inspectGrpcProductLaunch(input = {}, { environment = process.env } = {}) {
  const options = launchOptions(input), first = await readGrpcProduct(options.directory);
  const observed = await observation(first, options, environment);
  const confirmed = await readGrpcProduct(options.directory), again = await observation(confirmed, options, environment);
  need(canonical(first.profile) === canonical(confirmed.profile) && canonical(observed) === canonical(again),
    'The original workspace or configuration changed during review.', 'BINDING_CHANGED');
  const resourceId = sha256(canonical({ schema: 'stellar-forge.grpc-product-resource.v1',
    workspaceDirectory: first.profile.workspaceDirectory }));
  const binding = { schema: LAUNCH_SCHEMA, resourceId, profile: first.profile, options, ...observed };
  return { ...binding, directory: options.directory, bindingSha256: sha256(canonical(binding)),
    review: { name: first.profile.name, workspace: first.profile.workspace,
      selectedRevision: observed.nativeSelection.workspace.current?.revision ?? null,
      selectedGeneration: observed.nativeSelection.workspace.current?.generation ?? 0,
      ownership: 'ORIGINAL_GRPC_WORKSPACE',
      operatorConsole: observed.operatorConsole ? { directory: observed.operatorConsole.directory,
        workspaceId: observed.operatorConsole.workspaceId, sourceSha256: observed.operatorConsole.source.sha256 } : null,
      receiving: 'Complete native customer, revision, attempt, stream, upgrade and health files' } };
}
