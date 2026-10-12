// MIT. DCAT catalogue migration in the original managed Applications console.
import { join, relative, isAbsolute, resolve, dirname, basename, delimiter } from 'node:path';
import { realpath, lstat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { inspectMerchantRuntime } from '../../sf46-release/runtime-package.mjs';
import { applicationEnvironment as readApplicationEnvironment } from './application-environment.mjs';
import { absolute, need, plain, digest, json, canonical, regular, readJSON } from './storage.mjs';

const ROOT = 'stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/';
const ADAPTER = 'stellar/scf-starforge-20261009/distribution/runtime-workspace/application-dcat.mjs';
const SOURCE_HELPERS = [
  ADAPTER,
  'stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs',
  'stellar/scf-starforge-20261009/distribution/runtime-workspace/application-environment.mjs',
  'stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs',
  'stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs',
];
const REQUIRED = [
  ROOT + 'dcat-cli.mjs', ROOT + 'dcat-workspace.mjs', ROOT + 'dcat_migration.py',
  ROOT + 'application-provider.mjs', ROOT + 'public/migration.mjs',
  ROOT + 'vendor/gsa-dcat-us/source-manifest.json', ADAPTER,
  'stellar/scf-starforge-20261009/distribution/runtime-workspace/application-environment.mjs',
];
const STARTUP = 'stellar-forge.dcat-workbench-startup.v1';
const SELECTION = 'stellar-forge.dcat-managed-selection.v1';
const SHA = /^[a-f0-9]{64}$/;
const hash = value => digest(json(canonical(value)));
const equal = (left, right) => hash(left) === hash(right);
const field = (name, label, type = 'path', required = false, description = '') =>
  ({ name, label, type, required, description });

export function dcatApplication(common) {
  return {
    id: 'dcat-migration', command: 'dcat', title: 'DCAT catalog migration', terminal: false,
    requiredSource: ROOT + 'dcat-cli.mjs',
    description: 'Open an existing catalogue migration workspace to receive original DCAT-US documents, review conversion and publisher changes, select catalogue releases and hand over the complete project.',
    fields: [
      field('workspaceDirectory', 'Catalogue workspace', 'path', true,
        'Select the original private DCAT-US project directory. Source editions, reviews, release selection and rollback history remain in that project.'),
      ...common.map(item => item.name === 'environmentFile' ? { ...item,
        description: 'Use the existing private environment JSON for SCF_DCAT_PYTHON when the prepared Python executable has a specific path. Values stay on this host.' } : item),
    ],
  };
}
function runtimeIdentity(runtime) {
  const names = ['directory', 'installationId', 'profileId', 'profileSha256', 'lockSha256',
    'sourceCommit', 'sourceManifestSha256', 'dependencyCount'];
  return Object.fromEntries(names.map(name => [name, runtime[name]]));
}
function sourcePath(root, path) {
  need(typeof path === 'string' && path && !path.includes('\0') && !path.includes('\\') &&
    !isAbsolute(path) && !path.split('/').some(part => !part || part === '.' || part === '..'),
  'APPLICATION_DCAT_SOURCE_PATH_INVALID');
  const filename = join(root, path), inside = relative(root, filename);
  need(inside && !isAbsolute(inside) && inside !== '..' && !inside.startsWith('../'),
    'APPLICATION_DCAT_SOURCE_PATH_INVALID');
  return filename;
}
async function projectIdentity(directory) {
  const path = absolute(directory);
  need(await realpath(path) === path, 'APPLICATION_DCAT_PROJECT_LOCATION_CHANGED');
  const project = await readJSON(join(path, 'workbench.json'));
  need(plain(project) && project.schema === 'stellar-forge.ckan-workbench.v1' &&
    project.sourceKind === 'dcat-us' && plain(project.dcat) &&
    project.dcat.schema === 'stellar-forge.dcat-workspace.v1' &&
    typeof project.createdAt === 'string' && project.createdAt &&
    typeof project.catalogOrigin === 'string' && project.catalogOrigin,
  'APPLICATION_DCAT_PROJECT_REQUIRED', 'Select the original initialized DCAT-US workspace.');
  return { directory: path, createdAt: project.createdAt,
    catalogOrigin: project.catalogOrigin, sourceKind: project.sourceKind };
}
function validateFiles(value) {
  need(Array.isArray(value) && value.length > 0 && value.length <= 4096,
    'APPLICATION_DCAT_SOURCE_SELECTION_INVALID');
  const seen = new Set();
  const files = value.map(file => {
    need(plain(file) && typeof file.path === 'string' && !seen.has(file.path) &&
      Number.isSafeInteger(file.bytes) && file.bytes >= 0 && SHA.test(file.sha256 ?? ''),
    'APPLICATION_DCAT_SOURCE_SELECTION_INVALID');
    need(file.path.startsWith(ROOT) || SOURCE_HELPERS.includes(file.path),
      'APPLICATION_DCAT_SOURCE_SELECTION_INVALID');
    seen.add(file.path);
    return { path: file.path, bytes: file.bytes, sha256: file.sha256 };
  });
  for (const path of REQUIRED) need(seen.has(path), 'APPLICATION_DCAT_SOURCE_INCOMPLETE',
    'The selected product must include the complete migration application and original converter source.');
  return files;
}
async function verifySource(root, files) {
  need(await realpath(absolute(root)) === root, 'APPLICATION_DCAT_SOURCE_ROOT_CHANGED');
  for (const file of files) {
    const path = sourcePath(root, file.path);
    need(await realpath(path) === path, 'APPLICATION_DCAT_SOURCE_LOCATION_CHANGED');
    const bytes = await regular(path, Math.max(file.bytes, 4 * 1024 * 1024));
    need(bytes.length === file.bytes && digest(bytes) === file.sha256,
      'APPLICATION_DCAT_SOURCE_CHANGED', 'The selected migration source changed: ' + file.path);
  }
}
async function selectedPythonCommand(environment) {
  const command = environment.SCF_DCAT_PYTHON || 'python3.13';
  need(typeof command === 'string' && command && !command.includes('\0'),
    'APPLICATION_DCAT_PYTHON_INVALID');
  const candidates = isAbsolute(command) || command.includes('/') || command.includes('\\')
    ? [resolve(command)]
    : String(environment.PATH ?? '/usr/bin:/bin').split(delimiter).map(directory => resolve(directory || '.', command));
  for (const candidate of candidates) {
    try {
      const executable = join(await realpath(dirname(candidate)), basename(candidate));
      await access(executable, constants.X_OK);
      const target = await realpath(executable), info = await lstat(target);
      if (info.isFile()) return { command, executable };
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error;
    }
  }
  need(false, 'APPLICATION_DCAT_PYTHON_UNAVAILABLE',
    'Set SCF_DCAT_PYTHON to the prepared Python executable in the original application environment.');
}
async function verifyPython(selection, environment) {
  need(plain(selection) && typeof selection.command === 'string' && typeof selection.executable === 'string' &&
    Array.isArray(selection.inputs) && selection.inputs.length > 0, 'APPLICATION_DCAT_PYTHON_SELECTION_INVALID');
  const current = await selectedPythonCommand(environment);
  need(current.command === selection.command && current.executable === selection.executable,
    'APPLICATION_DCAT_PYTHON_CHANGED', 'The launched environment selects a different Python executable.');
  for (const expected of selection.inputs) {
    need(plain(expected) && expected.exists === true &&
      ['file', 'executable-link'].includes(expected.kind), 'APPLICATION_DCAT_PYTHON_SELECTION_INVALID');
    const path = absolute(expected.path), info = await lstat(path);
    need(info.dev === expected.dev && info.ino === expected.ino &&
      info.mtimeMs === expected.mtimeMs && info.ctimeMs === expected.ctimeMs,
    'APPLICATION_DCAT_PYTHON_CHANGED');
    if (expected.kind === 'executable-link') {
      need(info.isSymbolicLink() && await realpath(path) === expected.target,
        'APPLICATION_DCAT_PYTHON_CHANGED');
    } else {
      need(info.isFile() && !info.isSymbolicLink() && info.size === expected.bytes,
        'APPLICATION_DCAT_PYTHON_CHANGED');
      if (expected.sha256) need(digest(await regular(path, Math.max(expected.bytes, 4 * 1024 * 1024))) === expected.sha256,
        'APPLICATION_DCAT_PYTHON_CHANGED');
    }
  }
  await access(selection.executable, constants.X_OK);
  return { command: selection.command, executable: selection.executable };
}

export async function prepareDcatApplication(settings, { inputPath, selectedExecutable, applicationEnvironment, runtimeDirectory } = {}) {
  need(typeof inputPath === 'function' && typeof selectedExecutable === 'function' && typeof applicationEnvironment === 'function',
    'APPLICATION_DCAT_INPUT_READER_REQUIRED');
  const directory = absolute(settings.workspaceDirectory);
  const projectInput = await inputPath(directory, 'directory', false, true);
  const project = await projectIdentity(directory);
  const runtime = await inspectMerchantRuntime(absolute(runtimeDirectory), { load: false });
  const { environment } = await applicationEnvironment(settings.environmentFile);
  const pythonCommand = await selectedPythonCommand(environment);
  const pythonSelected = await selectedExecutable(pythonCommand.executable);
  const python = { command: pythonCommand.command, executable: pythonSelected.executable, inputs: pythonSelected.inputs };
  const manifestFile = join(runtime.directory, 'package', 'manifest.json');
  const manifest = await readJSON(manifestFile);
  need(Array.isArray(manifest.files), 'APPLICATION_DCAT_SOURCE_MANIFEST_REQUIRED');
  const files = validateFiles(manifest.files.filter(file =>
    typeof file.path === 'string' && (file.path.startsWith(ROOT) || SOURCE_HELPERS.includes(file.path)))
    .map(file => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 }))
    .sort((left, right) => left.path.localeCompare(right.path)));
  const inputs = [projectInput, ...pythonSelected.inputs];
  for (const filename of [manifestFile, join(runtime.directory, 'runtime-profile.json')])
    inputs.push(await inputPath(filename, 'file'));
  for (const file of files) {
    const selected = await inputPath(sourcePath(runtime.sourceRoot, file.path), 'file');
    need(selected.sha256 === file.sha256 && selected.bytes === file.bytes, 'APPLICATION_DCAT_SOURCE_CHANGED');
    inputs.push(selected);
  }
  need(await realpath(runtime.sourceRoot) === runtime.sourceRoot, 'APPLICATION_DCAT_SOURCE_ROOT_CHANGED');
  const body = { schema: SELECTION, project, runtime: runtimeIdentity(runtime), python,
    source: { root: runtime.sourceRoot, files, sha256: hash(files) } };
  const selection = { ...body, sha256: hash(body) };
  return {
    args: ['serve', '--workspace', directory, '--managed-selection', JSON.stringify(selection)],
    inputs, createDirectories: [],
    resourceKey: hash({ family: 'ckan-workbench', directory }),
  };
}
/** Validate the selected original project and source before the original server starts.
 * Common Applications environment selection remains owned by the shared provider.
 */
export async function verifyDcatManagedSelection(selection, { directory, sourceRoot, environment = process.env } = {}) {
  need(plain(selection) && selection.schema === SELECTION && plain(selection.project) &&
    plain(selection.runtime) && plain(selection.source) && SHA.test(selection.sha256 ?? ''),
  'APPLICATION_DCAT_SELECTION_INVALID');
  const { sha256, ...body } = selection;
  need(hash(body) === sha256, 'APPLICATION_DCAT_SELECTION_CHANGED');
  const project = await projectIdentity(absolute(directory));
  need(equal(project, selection.project), 'APPLICATION_DCAT_PROJECT_CHANGED',
    'The selected workspace has a different original project identity.');
  const python = await verifyPython(selection.python, environment);
  const files = validateFiles(selection.source.files);
  need(hash(files) === selection.source.sha256, 'APPLICATION_DCAT_SOURCE_SELECTION_CHANGED');
  const runtime = await inspectMerchantRuntime(absolute(selection.runtime.directory), { load: false });
  need(equal(runtimeIdentity(runtime), selection.runtime), 'APPLICATION_DCAT_RUNTIME_CHANGED');
  const root = absolute(sourceRoot ?? selection.source.root);
  await verifySource(root, files);
  return { project, source: { root, files, sha256: selection.source.sha256 },
    runtime: runtimeIdentity(runtime), python, selectionSha256: sha256 };
}
function option(request, name, optional = false) {
  const positions = request.args.flatMap((value, index) => value === name ? [index] : []);
  if (optional && positions.length === 0) return undefined;
  need(positions.length === 1 && typeof request.args[positions[0] + 1] === 'string' &&
    !request.args[positions[0] + 1].startsWith('--'), 'APPLICATION_DCAT_STARTUP_CHANGED');
  return request.args[positions[0] + 1];
}
export async function dcatStartup(request, text, context = {}) {
  if (request.command !== 'dcat' || !Array.isArray(request.args) || request.args[0] !== 'serve' ||
    typeof text !== 'string' || text.length > 16384 ||
    !text.startsWith('{"schema":"' + STARTUP + '",')) return null;
  let startup, selection;
  try { startup = JSON.parse(text); selection = JSON.parse(option(request, '--managed-selection')); }
  catch { need(false, 'APPLICATION_DCAT_STARTUP_CHANGED'); }
  need(plain(startup) && startup.schema === STARTUP && Number.isInteger(startup.pid) &&
    startup.pid > 0 && typeof startup.instanceId === 'string' && startup.instanceId,
  'APPLICATION_DCAT_STARTUP_CHANGED');
  if (context.pid !== undefined) need(startup.pid === context.pid, 'APPLICATION_DCAT_STARTUP_PROCESS_CHANGED');
  const directory = absolute(option(request, '--workspace'));
  const sourceRoot = join(absolute(request.releaseDirectory), 'source');
  const { environment } = await readApplicationEnvironment(request.environmentFile, request.environmentSha256);
  const verified = await verifyDcatManagedSelection(selection, { directory, sourceRoot, environment });
  need(startup.directory === verified.project.directory &&
    startup.projectCreatedAt === verified.project.createdAt &&
    startup.catalogOrigin === verified.project.catalogOrigin &&
    startup.sourceKind === verified.project.sourceKind,
  'APPLICATION_DCAT_STARTUP_PROJECT_CHANGED');
  let url;
  try { url = new URL(startup.url); } catch { need(false, 'APPLICATION_DCAT_STARTUP_URL_INVALID'); }
  need(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
    url.pathname === '/' && !url.search && !url.username && !url.password && url.hash.length > 1 &&
    startup.origin === url.origin,
  'APPLICATION_DCAT_STARTUP_URL_INVALID');
  const portText = option(request, '--port', true) ?? '0';
  need(/^(?:0|[1-9][0-9]*)$/.test(portText), 'APPLICATION_DCAT_STARTUP_PORT_INVALID');
  const port = Number(portText), observedPort = Number(url.port || '80');
  need(port <= 65535 && observedPort >= 1 && observedPort <= 65535 &&
    (port === 0 || port === observedPort), 'APPLICATION_DCAT_STARTUP_PORT_CHANGED');
  const response = await fetch(url.origin + '/api/launch', {
    headers: { authorization: 'Bearer ' + url.hash.slice(1) },
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  need(response.ok, 'APPLICATION_DCAT_STARTUP_UNAVAILABLE', 'The original authenticated workspace did not confirm its startup.');
  const actual = await response.json();
  need(plain(actual) && plain(actual.project) && actual.instanceId === startup.instanceId &&
    actual.pid === startup.pid && actual.directory === directory &&
    actual.project.createdAt === verified.project.createdAt &&
    actual.project.catalogOrigin === verified.project.catalogOrigin &&
    actual.project.sourceKind === verified.project.sourceKind,
  'APPLICATION_DCAT_STARTUP_IDENTITY_CHANGED');
  return {
    url: url.href,
    original: { schema: STARTUP, pid: actual.pid, instanceId: actual.instanceId,
      project: verified.project, sourceSha256: verified.source.sha256,
      selectionSha256: verified.selectionSha256, runtime: verified.runtime, python: verified.python },
  };
}
