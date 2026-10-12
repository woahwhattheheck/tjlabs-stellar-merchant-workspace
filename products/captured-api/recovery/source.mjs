// MIT. Complete captured-product operating selection over the original profile and native owners.
import { lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCapturedApi } from '../workspace.mjs';
import { acquireDatasetLease } from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/writer-lease.mjs';
import { acquireReleaseLease } from '../../../stellar/scf-starforge-20261009/sf82-seller-pilot/release-process.mjs';
import { readReleaseState } from '../../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs';
import { readMerchantConfig } from '../../../stellar-forge/mcp-merchant-operator/config.mjs';
import { readHarWorkspaceConfiguration } from '../../../stellar-forge/mcp-merchant-operator/har-workspace.mjs';
import { readOpenApiWorkspaceConfiguration } from '../../../stellar-forge/mcp-merchant-operator/openapi-workspace.mjs';
import { readOAuthHostConnections, inspectOAuthHostDirectory } from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/oauth-connections/host.mjs';
import { oauthConnectionStatus, withOAuthConnectionLock } from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/oauth-connections/store.mjs';
import { publishBytes } from '../handover-files.mjs';
import { PROFILE_SCHEMA, PLAN_SCHEMA, PLAN_ROOT, PRODUCT_ROOT, MAX_PLAN, MAX_ENTRIES, MAX_TOTAL,
  absolute, selection, coalesceRoots, identity, digest, bytes, copy, parse, need, failure, stamp,
  inside, overlap, typedPlan, HASH } from './model.mjs';
import { present, readFile, hashFile, scanRoot, directory, syncDirectory, currentOwner, requireOwner, withPublishedFile } from './files.mjs';

const SOURCE_PATH_KEYS = ['spec', 'config', 'bindings', 'upstreams', 'workspace', 'pythonRoot',
  'duckdbPackage', 'datasetPackage', 's3Package', 'postgresPackage', 'mysqlPackage',
  'sqlitePackage', 'jsonrpcPackage', 'clickhousePackage'];
const RUNTIME_FILES = [
  '../workspace.mjs', '../managed.mjs', '../handover.mjs', '../handover-archive.mjs',
  '../handover-upload.mjs', '../handover-recovery-files.mjs', './model.mjs', './source.mjs',
  './workspace.mjs', './files.mjs',
  '../../../stellar/scf-starforge-20261009/sf101-merchant-recovery/recover.mjs',
  '../../../stellar/scf-starforge-20261009/sf101-merchant-recovery/workspace/local.mjs',
];
export async function selectedInput({ directory: productDirectory, selectionFile } = {}) {
  let selected, file = null;
  if (selectionFile !== undefined) {
    absolute(selectionFile);
    const raw = await readFile(selectionFile, MAX_PLAN);
    selected = selection(parse(raw, 'complete recovery selection'));
    if (productDirectory !== undefined) need(absolute(productDirectory) === selected.directory,
      'CAPTURED_RECOVERY_SELECTION_CHANGED', 'The selected product differs from the original declaration.');
    file = { path: selectionFile, bytes: raw.length, sha256: digest(raw) };
  } else selected = selection({ schema: 'stellar-forge.captured-api-recovery-selection.v1',
    directory: absolute(productDirectory) });
  return { selected, selectionFile: file };
}
async function discover(input, environment) {
  const { selected, selectionFile } = input, product = await readCapturedApi(selected.directory);
  const owner = currentOwner(), config = await readMerchantConfig(product.configuration);
  const rawConfig = parse(await readFile(product.configuration, 1024 * 1024), 'original merchant configuration');
  const har = await readHarWorkspaceConfiguration(product.harConnection);
  const openapi = await readOpenApiWorkspaceConfiguration(product.openapiConnection);
  const candidates = [{ name: PRODUCT_ROOT, path: product.directory }], references = [];
  let sequence = 0;
  async function include(role, path, required = true, preferredName) {
    absolute(path);
    const exists = await present(path);
    need(exists || !required, 'CAPTURED_RECOVERY_SOURCE_MISSING', 'Restore the original selected input before capture: ' + path);
    let kind = null;
    if (exists) {
      const value = await lstat(path);
      need(!value.isSymbolicLink() && (value.isDirectory() || value.isFile()),
        'CAPTURED_RECOVERY_ENTRY', 'Use the original regular file or directory for ' + role + '.');
      kind = value.isDirectory() ? 'directory' : 'file';
      candidates.push({ name: preferredName ?? 'capturedInput' + (++sequence), path });
    }
    references.push({ role, path, present: exists, kind });
  }
  await include('product', product.directory, true, PRODUCT_ROOT);
  await include('projects', product.projectsDirectory, true, 'capturedProjects');
  await include('merchant releases', config.releaseStore, true, 'merchantReleases');
  await include('merchant exports', config.exportsDirectory, true, 'merchantExports');
  await include('operator configuration', product.configuration);
  await include('HAR connections', product.harConnection);
  await include('OpenAPI connections', product.openapiConnection);
  if (product.console.ownership === 'EXTERNAL')
    await include('external console URL reference', product.console.urlFile, true, 'externalConsoleReference');
  for (const [key, value] of Object.entries(rawConfig)) {
    if (key.endsWith('Connection') && typeof value === 'string')
      await include('configured ' + key, resolve(dirname(product.configuration), value));
  }
  for (const [alias, workspace] of Object.entries(har.workspaces)) {
    await include('HAR ' + alias + ' projects', workspace.projectsDirectory);
    for (const [name, row] of Object.entries(workspace.files ?? {}))
      await include('HAR ' + alias + ' file ' + name, row.path, false);
    for (const key of ['imports', 'destinations'])
      for (const [name, row] of Object.entries(workspace[key] ?? {}))
        await include('HAR ' + alias + ' ' + key + ' ' + name, row.directory, false);
    if (workspace.consoleUrlFile)
      await include('HAR ' + alias + ' console reference', workspace.consoleUrlFile, false);
  }
  for (const [alias, workspace] of Object.entries(openapi.workspaces)) {
    for (const [name, row] of Object.entries(workspace.files ?? {}))
      await include('OpenAPI ' + alias + ' file ' + name, row.path, false);
    for (const [name, row] of Object.entries(workspace.deliveries ?? {}))
      await include('OpenAPI ' + alias + ' receiving ' + name, row.directory, false);
    if (workspace.consoleUrlFile)
      await include('OpenAPI ' + alias + ' console reference', workspace.consoleUrlFile, false);
  }
  for (const [alias, source] of Object.entries(config.sources ?? {}))
    for (const key of SOURCE_PATH_KEYS) if (typeof source[key] === 'string')
      await include('merchant source ' + alias + ' ' + key, source[key]);
  const oauth = [];
  if (product.oauthConnectionsFile) {
    await include('browser OAuth registry', product.oauthConnectionsFile, true, 'browserOAuthRegistry');
    const connections = await readOAuthHostConnections(product.oauthConnectionsFile);
    for (const row of connections) {
      const path = absolute(environment[row.directoryEnv]);
      await inspectOAuthHostDirectory(path, { directoryEnv: row.directoryEnv, ownerUid: owner.uid });
      const status = await oauthConnectionStatus(path);
      await include('browser OAuth ' + row.alias, path, true, 'browserOAuth' + (oauth.length + 1));
      oauth.push({ alias: row.alias, directoryEnv: row.directoryEnv, directory: path,
        grantId: status.grant?.id ?? null, grantGeneration: status.grant?.generation ?? 0, profileSha256: status.profileSha256, revision: status.revision,
        grantState: status.grant?.state ?? status.state ?? null,
        clientSecretEnv: status.profile?.clientSecretEnv ?? null });
    }
  }
  const environmentFiles = [];
  if (environment.MCP_OAUTH_CONFIG) {
    const path = absolute(environment.MCP_OAUTH_CONFIG);
    await include('original MCP authorization configuration', path, true, 'merchantOAuthConfig');
    environmentFiles.push({ name: 'MCP_OAUTH_CONFIG', path });
  }
  for (const root of selected.additionalRoots) await include('declared ' + root.name, root.path, true, root.name);
  if (selected.sourceArchive) {
    await include('complete original installed source archive', selected.sourceArchive, true, 'capturedSourceArchive');
    need((await lstat(selected.sourceArchive)).isFile(), 'CAPTURED_RECOVERY_SOURCE_ARCHIVE',
      'Select the complete retained product package archive as a regular file.');
  }
  const roots = coalesceRoots(candidates);
  const sourceDirectory = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
  for (const root of roots) need(!overlap(root.path, sourceDirectory), 'CAPTURED_RECOVERY_INSTALLED_SOURCE',
    'Select the retained product package archive; keep installed source separate from private operating roots.');
  for (const row of references) row.root = row.present
    ? roots.find(root => inside(root.path, row.path)).name : null;
  const state = await readReleaseState(config.releaseStore);
  const release = { directory: config.releaseStore, generation: state.generation,
    active: state.active, previous: state.previous, retainedChanges: state.history.length,
    stateSha256: (await hashFile(join(config.releaseStore, 'state.json'), 4 * 1024 * 1024)).sha256 };
  const runtimeFiles = [];
  for (const name of RUNTIME_FILES) {
    const path = fileURLToPath(new URL(name, import.meta.url));
    const file = await hashFile(path, 4 * 1024 * 1024);
    runtimeFiles.push({ name, bytes: file.size, sha256: file.sha256 });
  }
  const runtime = { node: process.execPath, nodeVersion: process.version, platform: process.platform,
    architecture: process.arch, sourceDirectory, files: runtimeFiles,
    sourceArchive: selected.sourceArchive ?? null };
  return { product, selected, selectionFile, owner, roots, references, oauth, environmentFiles, release, runtime,
    configurationSha256: (await hashFile(product.configuration, 1024 * 1024)).sha256 };
}
/** Hold the original product, release and OAuth owners; accepted native records remain untouched. */
export async function withCapturedRecoveryOwners(discovered, work) {
  requireOwner(discovered.owner);
  const leases = []; let result, failed;
  try {
    leases.push(acquireDatasetLease(discovered.product.directory));
    for (const name of ['run.lock', 'state.lock']) {
      const lease = await acquireReleaseLease(discovered.release.directory, name);
      need(lease, 'CAPTURED_RECOVERY_LINUX'); leases.push(lease);
    }
    const oauthDirectories = [...new Set(discovered.oauth.map(row => row.directory))].sort();
    const locked = index => index === oauthDirectories.length ? work() :
      withOAuthConnectionLock(oauthDirectories[index], () => locked(index + 1));
    for (const lease of leases) await (lease.assertHeld?.() ?? lease.assert?.());
    result = await locked(0);
    for (const lease of leases) await (lease.assertHeld?.() ?? lease.assert?.());
  } catch (error) { failed = error; }
  const errors = [];
  for (const lease of leases.reverse()) try { await lease.close(); } catch (error) { errors.push(error); }
  if (failed) { if (errors.length) failed.cleanup = errors.map(error => ({ code: error.code, message: error.message })); throw failed; }
  if (errors.length) throw Object.assign(failure('CAPTURED_RECOVERY_CLOSE_PENDING',
    'Repeat the same operation after its original native owners finish closing.'), { cause: new AggregateError(errors) });
  return result;
}
async function inspectSelected(input, environment) {
  const discovered = await discover(input, environment), trees = {}, roots = [], budget = { entries: 0, bytes: 0 };
  for (const row of discovered.roots) {
    const scanned = await scanRoot(row.path, undefined, budget);
    roots.push({ ...row, kind: scanned.source.kind }); trees[row.name] = scanned.source;
  }
  const after = await discover(input, environment);
  need(identity(after) === identity(discovered), 'CAPTURED_RECOVERY_SOURCE_CHANGED',
    'The original product or declared native configuration changed during its complete source review.');
  return { schema: PROFILE_SCHEMA, product: discovered.product, selection: discovered.selected,
    selectionFile: discovered.selectionFile, owner: discovered.owner, roots,
    summary: { product: { name: discovered.product.name, directory: discovered.product.directory,
      projectsDirectory: discovered.product.projectsDirectory, consoleOwnership: discovered.product.console.ownership },
      release: discovered.release, oauth: discovered.oauth, environmentFiles: discovered.environmentFiles,
      references: discovered.references, configurationSha256: discovered.configurationSha256 },
    runtime: discovered.runtime,
    source: { trees, files: Object.values(trees).reduce((n, tree) => n + tree.files, 0),
      directories: Object.values(trees).reduce((n, tree) => n + tree.directories, 0), bytes: budget.bytes } };
}
export async function inspectCapturedRecovery(input = {}, { environment = process.env } = {}) {
  return inspectSelected(await selectedInput(input), { ...environment });
}
export async function prepareCapturedRecoveryPlan({ directory: productDirectory, selectionFile,
  planFile, quiesced = false } = {}, { environment = process.env } = {}) {
  absolute(planFile); await directory(dirname(planFile));
  const input = await selectedInput({ directory: productDirectory, selectionFile }), env = { ...environment };
  need(quiesced === true, 'CAPTURED_RECOVERY_QUIESCENCE',
    'Stop the product, its selected sellers and external writers; keep them stopped through capture.', 400);
  const discovered = await discover(input, env);
  need(!discovered.roots.some(root => overlap(root.path, planFile)), 'CAPTURED_RECOVERY_PLAN_OVERLAP',
    'Save the typed plan outside every captured root.');
  return withCapturedRecoveryOwners(discovered, async () => {
    const inspected = await inspectSelected(input, env);
    return withPublishedFile(planFile, async () => {
    let raw, profile, reused = false;
    if (await present(planFile)) {
      raw = await readFile(planFile, MAX_PLAN); ({ profile } = typedPlan(raw));
      const { createdAt, planFile: retainedPath, ...original } = profile;
      need(retainedPath === planFile && identity(original) === identity(inspected), 'CAPTURED_RECOVERY_PLAN_CHANGED',
        'The source differs from this saved plan. Keep it and select a new plan filename for the current edition.');
      reused = true;
    } else {
      profile = { ...inspected, createdAt: stamp(), planFile };
      raw = bytes({ schema: PLAN_SCHEMA,
        roots: [...profile.roots.map(({ name, path }) => ({ name, path })), { name: PLAN_ROOT, path: planFile }],
        capturedApi: profile });
      need(raw.length <= MAX_PLAN && inspected.source.bytes + raw.length <= MAX_TOTAL &&
        inspected.source.files + inspected.source.directories + 1 <= MAX_ENTRIES, 'CAPTURED_RECOVERY_SIZE',
      'The complete source and typed plan must fit the original SF101 snapshot limits.');
      // Original whole-file publication, with exact existing-byte reuse on a retry.
      await publishBytes(dirname(planFile), planFile.slice(dirname(planFile).length + 1), raw);
      await syncDirectory(dirname(planFile));
    }
    return { status: 'CAPTURED_RECOVERY_PLAN_READY', planFile, planSha256: digest(raw),
      profileSha256: identity(profile), reused, profile: copy(profile) };
    });
  });
}
export async function inspectCapturedRecoveryPlan(planFile, { environment = process.env } = {}) {
  absolute(planFile);
  const raw = await readFile(planFile, MAX_PLAN), { profile } = typedPlan(raw);
  need(profile.planFile === planFile, 'CAPTURED_RECOVERY_PLAN_CHANGED');
  const inspected = await inspectSelected({ selected: profile.selection, selectionFile: profile.selectionFile }, { ...environment });
  const { createdAt, planFile: originalPath, ...expected } = profile;
  need(identity(inspected) === identity(expected), 'CAPTURED_RECOVERY_SOURCE_CHANGED',
    'The current complete operating source differs from the original reviewed plan.');
  return { status: 'CAPTURED_RECOVERY_SOURCE_MATCHED', planSha256: digest(raw), profileSha256: identity(profile),
    planFile, profile: copy(profile) };
}
export async function withCapturedRecoveryCapture({ planFile, expectedPlanSha256 }, capture,
  { environment = process.env } = {}) {
  need(HASH.test(expectedPlanSha256) && typeof capture === 'function', 'CAPTURED_RECOVERY_PLAN_REVIEW');
  const raw = await readFile(planFile, MAX_PLAN), { profile } = typedPlan(raw);
  need(profile.planFile === planFile && digest(raw) === expectedPlanSha256, 'CAPTURED_RECOVERY_PLAN_CHANGED');
  const env = { ...environment };
  const discovered = await discover({ selected: profile.selection, selectionFile: profile.selectionFile }, env);
  return withCapturedRecoveryOwners(discovered, async () => {
    const current = await inspectCapturedRecoveryPlan(planFile, { environment: env });
    need(current.planSha256 === expectedPlanSha256, 'CAPTURED_RECOVERY_PLAN_CHANGED');
    return capture();
  });
}
export async function validateRecoveredCapturedProduct(profile) {
  requireOwner(profile.owner);
  const current = await readCapturedApi(profile.product.directory);
  need(identity(current) === identity(profile.product), 'CAPTURED_RECOVERY_PRODUCT_CHANGED',
    'The original private product profile differs from the authenticated snapshot.');
  const release = await readReleaseState(profile.summary.release.directory);
  need(release.generation === profile.summary.release.generation &&
    identity(release.active) === identity(profile.summary.release.active) &&
    identity(release.previous) === identity(profile.summary.release.previous), 'CAPTURED_RECOVERY_RELEASE_CHANGED');
  for (const row of profile.summary.oauth) {
    const current = await oauthConnectionStatus(row.directory);
    need((current.grant?.id ?? null) === row.grantId && (current.grant?.generation ?? 0) === row.grantGeneration && current.profileSha256 === row.profileSha256 &&
      current.revision === row.revision, 'CAPTURED_RECOVERY_OAUTH_CHANGED');
  }
  return { product: current, release: copy(profile.summary.release), oauth: copy(profile.summary.oauth) };
}
