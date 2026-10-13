// Apache-2.0. The original publishing services in the shared Applications lifecycle.
import {createHash, randomUUID} from 'node:crypto';
import {access, readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename, join} from 'node:path';
import {PublicationInstallation, canonicalDirectory, plain, readPrivateJSON, publicationError} from './client.mjs';
export const PUBLICATION_PROCESS_SCHEMA = 'stellar-forge.publication-process.v1';
const roles = new Set(['operator', 'resident', 'wordpress']);
const bridgeFiles = ['files.py', 'source.py', 'manage.py', 'operations.py', 'launch.py', 'wordpress-service.mjs'];
const launches = new WeakMap();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const need = (value, code, message = 'The selected original publication service changed.') => {
  if (!value) throw publicationError(code, message);
};
function port(value, role) {
  const selected = value === undefined || value === '' ? 0 : Number(value);
  need(Number.isInteger(selected) && selected >= 0 && selected <= 65535, 'PUBLICATION_PORT_INVALID');
  const native = role === 'wordpress' ? selected || 8807 : selected;
  need(role !== 'wordpress' || native >= 1024, 'PUBLICATION_PORT_INVALID');
  return native;
}
export function publicationApplications(field, common) {
  const environment = common.filter(item => item.name === 'environmentFile');
  const selected = [
    field('directory', 'Prepared publication installation', 'path', true,
      'Select the complete original prepared or independently received private installation.'),
    field('python', 'Adapter Python', 'path', false,
      'Python used to inspect the selected installation. Its original interpreter and lxml run the application.'),
  ];
  return [
    {id: 'publication-operator', command: 'publication-workspace', title: 'Publication staff workspace', terminal: false,
      requiredSource: 'products/publication-workspace/native/operations.py',
      description: 'Edit and review original source records, procurement, media, releases and native returns.',
      fields: [...selected, field('port', 'Local staff port', 'port', false, 'Use 0 for an available loopback port.'), ...environment]},
    {id: 'publication-resident', command: 'publication-workspace', title: 'Publication resident release', terminal: false,
      requiredSource: 'products/publication-workspace/native/operations.py',
      description: 'Open one complete frozen resident release produced by the original workspace.',
      fields: [...selected, field('releaseId', 'Frozen release identity', 'text', true,
        'The complete original 64-character release identity selected in the staff workspace.'),
        field('port', 'Local resident port', 'port', false, 'Use 0 for an available loopback port.'), ...environment]},
    {id: 'publication-wordpress', command: 'publication-workspace', title: 'Publication WordPress editor', terminal: false,
      requiredSource: 'products/publication-workspace/native/operations.py',
      description: 'Operate the original native WordPress site, plugins, media and editable return in the selected installed runtime.',
      fields: [...selected, field('port', 'Local WordPress port', 'port', false,
        'Blank selects 8807. Select another port from 1024 to 65535 for another native site.'), ...environment]},
  ];
}
export function validatePublicationSettings(type, settings) {
  const role = type.id.replace(/^publication-/, '');
  need(roles.has(role), 'PUBLICATION_ROLE_INVALID');
  port(settings.port, role);
  if (role === 'resident')
    need(typeof settings.releaseId === 'string' && /^[a-f0-9]{64}$/.test(settings.releaseId), 'PUBLICATION_RELEASE_REQUIRED');
}
export async function preparePublicationApplication(type, settings, {sourceDirectory, inputPath, selectedExecutable}) {
  validatePublicationSettings(type, settings);
  const role = type.id.replace(/^publication-/, '');
  sourceDirectory = await canonicalDirectory(sourceDirectory);
  const directory = await inputPath(settings.directory, 'directory', false, true);
  const adapter = await selectedExecutable(settings.python || '/usr/bin/python3');
  const inputs = [directory, ...adapter.inputs];
  for (const name of bridgeFiles) inputs.push(await inputPath(join(sourceDirectory, 'native', name), 'file'));
  const client = new PublicationInstallation({directory: directory.path, sourceDirectory, python: adapter.executable});
  let inspected;
  try { inspected = await client.inspect(); } finally { await client.close(); }
  const installed = inspected.installation;
  need(plain(installed) && installed.paths.directory === directory.path, 'PUBLICATION_INSTALLATION_CHANGED');
  const nativePython = await selectedExecutable(installed.python.path);
  inputs.push(...nativePython.inputs, await inputPath(join(directory.path, 'installation.json'), 'file'));
  const edition = join(directory.path, 'editions', installed.source_identity);
  inputs.push(await inputPath(join(edition, 'SOURCE.json'), 'file'));
  inputs.push(await inputPath(join(edition, 'BRIDGE.json'), 'file'));
  const manifest = (await readPrivateJSON(join(edition, 'SOURCE.json'), 8 * 1024 * 1024)).value;
  need(manifest.schema === 'stellar-forge.publication-product-source.v1' && Array.isArray(manifest.files),
    'PUBLICATION_SOURCE_CHANGED');
  for (const row of manifest.files) inputs.push(await inputPath(join(installed.paths.source, row.path), 'file'));
  for (const name of bridgeFiles) inputs.push(await inputPath(join(installed.paths.bridge, name), 'file'));
  if (role === 'resident')
    inputs.push(await inputPath(join(installed.paths.workspace, 'oha-releases', settings.releaseId, 'release.json'), 'file'));
  if (role === 'wordpress') {
    const native = inspected.result.installation.native;
    need(native && installed.native_configured, 'PUBLICATION_NATIVE_REQUIRED',
      'Attach the selected original Node, Playground and WordPress core through Installation before native start.');
    const node = await selectedExecutable(native.node);
    inputs.push(...node.inputs, await inputPath(native.playground_module.path, 'file'),
      await inputPath(native.core_zip, 'file'));
  }
  const args = ['service', '--role', role, '--directory', directory.path, '--native-source', sourceDirectory,
    '--python', adapter.executable, '--service-python', nativePython.executable,
    '--installation-id', installed.installation_id, '--source-identity', installed.source_identity,
    '--installation-device', installed.binding.device, '--installation-inode', installed.binding.inode,
    '--port', String(port(settings.port, role))];
  if (role === 'resident') args.push('--release-id', settings.releaseId);
  return {args, inputs, createDirectories: []};
}
export function publicationServiceSelection(args) {
  need(Array.isArray(args) && args[0] === 'service', 'PUBLICATION_SERVICE_REQUEST');
  const fields = new Set(['role', 'directory', 'native-source', 'python', 'service-python', 'installation-id',
    'source-identity', 'installation-device', 'installation-inode', 'port', 'release-id', 'managed-operation']);
  const selected = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.startsWith('--') ? args[i].slice(2) : '';
    need(fields.has(key) && !Object.hasOwn(selected, key) && typeof args[i + 1] === 'string' && args[i + 1],
      'PUBLICATION_SERVICE_REQUEST');
    selected[key] = args[i + 1];
  }
  for (const key of ['role', 'directory', 'native-source', 'python', 'service-python', 'installation-id',
    'source-identity', 'installation-device', 'installation-inode', 'port'])
    need(Object.hasOwn(selected, key), 'PUBLICATION_SERVICE_REQUEST');
  need(roles.has(selected.role) && /^[a-f0-9-]{36}$/.test(selected['installation-id']) &&
    /^[a-f0-9]{64}$/.test(selected['source-identity']), 'PUBLICATION_SERVICE_REQUEST');
  for (const key of ['installation-device', 'installation-inode'])
    need(/^[0-9]+$/.test(selected[key]), 'PUBLICATION_SERVICE_REQUEST');
  port(selected.port, selected.role);
  if (selected.role === 'resident') need(/^[a-f0-9]{64}$/.test(selected['release-id']), 'PUBLICATION_RELEASE_REQUIRED');
  return selected;
}
async function currentSelection(request, environment = process.env) {
  need(request.command === 'publication-workspace' && !request.pythonCommand, 'PUBLICATION_SERVICE_REQUEST');
  const selected = publicationServiceSelection(request.args);
  const client = new PublicationInstallation({directory: selected.directory,
    sourceDirectory: selected['native-source'], python: selected.python,
    binding: {installation_id: selected['installation-id'], source_identity: selected['source-identity']}, environment});
  try {
    const inspected = await client.inspect(), installed = inspected.installation;
    need(installed.binding.device === selected['installation-device'] &&
      installed.binding.inode === selected['installation-inode'] &&
      installed.python.path === selected['service-python'], 'PUBLICATION_REVIEW_CHANGED',
      'Review the actual selected installation and interpreter before this original service launch.');
    return {selected, client, installed};
  } catch (error) { await client.close(); throw error; }
}
export async function verifyPublicationLaunch(request, operationDirectory) {
  const current = await currentSelection(request);
  try {
    need(current.selected['managed-operation'] === basename(operationDirectory), 'PUBLICATION_MANAGED_OPERATION');
    await canonicalDirectory(operationDirectory, {privateOnly: true});
  } finally { await current.client.close(); }
}
export async function preparePublicationChild(request, operationDirectory, originalArgs, environment) {
  const {selected, client, installed} = await currentSelection(request, environment);
  try {
    need(selected['managed-operation'] === basename(operationDirectory), 'PUBLICATION_MANAGED_OPERATION');
    await canonicalDirectory(operationDirectory, {privateOnly: true});
    const ready = join(operationDirectory, 'publication-' + randomUUID() + '.json');
    const reply = await client.call('commands.describe', {roles: [selected.role], ready_file: ready,
      port: port(selected.port, selected.role), ...(selected['release-id'] ? {release_id: selected['release-id']} : {})});
    const command = reply.result.commands?.[0];
    need(reply.result.commands?.length === 1 && command.role === selected.role &&
      command.executable === installed.python.path && command.argv[0] === command.executable &&
      command.cwd === installed.paths.application, 'PUBLICATION_ORIGINAL_COMMAND');
    need(sha(await readFile(command.script)) === command.script_sha256, 'PUBLICATION_ORIGINAL_SOURCE');
    await access(command.executable, constants.X_OK);
    launches.set(request, {command, installed, selected});
    return {executable: command.executable, args: command.argv.slice(1),
      options: {cwd: command.cwd, env: environment, shell: false, stdio: ['ignore', 'pipe', 'pipe', 3]}};
  } finally { await client.close(); }
}
export async function publicationStartup(request, text, context = {}) {
  if (typeof text !== 'string' || text.length > 16384) return null;
  let announced; try { announced = JSON.parse(text); } catch { return null; }
  if (!plain(announced) || announced.schema !== PUBLICATION_PROCESS_SCHEMA) return null;
  const launch = launches.get(request);
  need(launch, 'PUBLICATION_ORIGINAL_LAUNCH');
  const {command, installed, selected} = launch;
  const retained = (await readPrivateJSON(command.ready_file, 16384)).value;
  const {url, ...identity} = retained;
  need(Object.keys(identity).sort().join('\0') === Object.keys(announced).sort().join('\0') &&
    Object.keys(identity).every(key => identity[key] === announced[key]) &&
    Number.isSafeInteger(context.pid) && context.pid > 0 && identity.pid === context.pid &&
    identity.role === selected.role && identity.installation_id === installed.installation_id &&
    identity.source_identity === installed.source_identity && identity.directory === installed.paths.directory &&
    identity.application === installed.paths.application && identity.workspace === installed.paths.workspace &&
    identity.ready_file === command.ready_file && identity.device === installed.binding.device &&
    identity.inode === installed.binding.inode &&
    identity.launcher_sha256 === command.script_sha256, 'PUBLICATION_ORIGINAL_LAUNCH_CHANGED');
  const manifest = (await readPrivateJSON(join(installed.paths.directory, 'editions', installed.source_identity, 'SOURCE.json'))).value;
  need(sha(await readFile(join(installed.paths.source, manifest.interface.entry))) === identity.entry_sha256,
    'PUBLICATION_ENTRY_CHANGED');
  if (selected.role === 'wordpress') {
    need(identity.native_runtime === installed.paths.native &&
      sha(await readFile(join(installed.paths.source, manifest.interface.native_runner))) === identity.native_runner_sha256 &&
      sha(await readFile(join(installed.paths.bridge, 'wordpress-service.mjs'))) === identity.wordpress_service_sha256,
      'PUBLICATION_NATIVE_SOURCE_CHANGED');
  }
  let parsed;
  try { parsed = new URL(url); } catch { throw publicationError('PUBLICATION_ORIGINAL_URL', 'The original ready file has an invalid local URL.'); }
  need(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname) &&
    parsed.origin === identity.origin && !parsed.username && !parsed.password && !parsed.search && !parsed.hash &&
    parsed.pathname === (selected.role === 'wordpress' ? '/wp-admin/' : '/') &&
    (!port(selected.port, selected.role) || Number(parsed.port) === port(selected.port, selected.role)),
    'PUBLICATION_ORIGINAL_URL');
  if (selected.role === 'resident')
    need(identity.release === join(installed.paths.workspace, 'oha-releases', selected['release-id']), 'PUBLICATION_ORIGINAL_RELEASE');
  return {url: parsed.href, original: {...identity, script_sha256: command.script_sha256}};
}
