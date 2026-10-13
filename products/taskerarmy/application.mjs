// MIT. Tasker's original three native services inside the existing Applications lifecycle.
import {createHash, randomUUID} from 'node:crypto';
import {access, lstat, readFile, realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename, join} from 'node:path';
import {TaskerInstallation, canonicalDirectory, exact, plain, readPrivateJSON, selectedPath, taskerError} from './client.mjs';

export const TASKER_PROCESS_SCHEMA = 'taskerarmy.operator-process.v1';
const roles = new Set(['operator', 'ingress', 'worker']);
const nativeFiles = ['native/operations.py', 'native/manage.py', 'native/archive.py',
  'native/launch_operator.py', 'notification_outbox.py', 'operator_server.py', 'operator.html'];
const launches = new WeakMap();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const need = (condition, code, message = 'The selected original Tasker service changed.') => {
  if (!condition) throw taskerError(code, message);
};
const inventoryDigest = files => sha(JSON.stringify(files));
function port(value, role) {
  const selected = value === undefined || value === '' ? 0 : Number(value);
  need(Number.isInteger(selected) && selected >= 0 && selected <= 65535, 'TASKER_PORT_INVALID');
  return role === 'ingress' && selected === 0 ? 8094 : selected;
}
function interval(value) {
  const selected = value === undefined || value === '' ? 2 : Number(value);
  need(Number.isFinite(selected) && selected >= 0.1 && selected <= 60, 'TASKER_INTERVAL_INVALID',
    'Choose the original worker interval from 0.1 to 60 seconds.');
  return selected;
}
export function taskerApplications(field, common) {
  const environment = common.filter(item => item.name === 'environmentFile');
  const selected = [
    field('directory', 'Prepared Tasker installation', 'path', true,
      'Select the original prepared or independently received private installation.'),
    field('python', 'Adapter Python', 'path', false,
      'Python 3.11 or later used to inspect this installation; defaults to /usr/bin/python3.'),
  ];
  return [
    {id: 'tasker-operator', command: 'taskerarmy', title: 'Tasker notification operator', terminal: false,
      requiredSource: 'products/taskerarmy/native/operations.py',
      description: 'Review original routes, event history and uncertain deliveries in the existing Tasker operator.',
      fields: [...selected, field('port', 'Local operator port', 'port', false, 'Use 0 for an available loopback port.'), ...environment]},
    {id: 'tasker-ingress', command: 'taskerarmy', title: 'Tasker event receiver', terminal: false,
      requiredSource: 'products/taskerarmy/native/operations.py',
      description: 'Receive authenticated source events into the same original notification database.',
      fields: [...selected, field('port', 'Local ingress port', 'port', false,
        'Blank or 0 selects the original port 8094. Choose another fixed port for another installation.'), ...environment]},
    {id: 'tasker-worker', command: 'taskerarmy', title: 'Tasker delivery worker', terminal: false,
      requiredSource: 'products/taskerarmy/native/operations.py',
      description: 'Deliver the original eligible queue and retain its retries, circuits and uncertain-send decisions.',
      fields: [...selected, field('interval', 'Worker interval in seconds', 'text', false,
        'Defaults to 2 seconds; choose from 0.1 to 60.'), ...environment]},
  ];
}
export function validateTaskerSettings(type, settings) {
  const role = type.id.replace(/^tasker-/, '');
  need(roles.has(role), 'TASKER_ROLE_INVALID');
  if (role !== 'worker') port(settings.port, role);
  else interval(settings.interval);
}
export async function prepareTaskerApplication(type, settings, {sourceDirectory, inputPath, selectedExecutable}) {
  const role = type.id.replace(/^tasker-/, '');
  validateTaskerSettings(type, settings);
  sourceDirectory = await canonicalDirectory(sourceDirectory);
  const directory = await inputPath(settings.directory, 'directory', false, true);
  const adapterPython = await selectedExecutable(settings.python ?? '/usr/bin/python3');
  const inputs = [directory, ...adapterPython.inputs];
  for (const file of nativeFiles) inputs.push(await inputPath(join(sourceDirectory, file), 'file'));
  const client = new TaskerInstallation({directory: directory.path, sourceDirectory, python: adapterPython.executable});
  let inspected;
  try { inspected = await client.inspect(); } finally { await client.close(); }
  const installed = inspected.installation;
  need(plain(installed) && installed.paths.directory === directory.path &&
    Array.isArray(inspected.result?.application_files), 'TASKER_INSTALLATION_CHANGED');
  const nativePython = await selectedExecutable(installed.python.path);
  inputs.push(...nativePython.inputs);
  inputs.push(await inputPath(join(directory.path, 'installation.json'), 'file'));
  inputs.push(await inputPath(installed.paths.configuration, 'file'));
  for (const file of nativeFiles) inputs.push(await inputPath(join(installed.paths.application, file), 'file'));
  const args = ['service', '--role', role, '--directory', directory.path, '--native-source', sourceDirectory,
    '--python', adapterPython.executable, '--service-python', nativePython.executable,
    '--installation-id', installed.installation_id, '--source-identity', installed.source_identity,
    '--installation-device', installed.binding.device, '--installation-inode', installed.binding.inode,
    '--application-sha256', inventoryDigest(inspected.result.application_files),
    '--configuration-sha256', inspected.result.configuration_sha256];
  if (role === 'worker') args.push('--interval', String(interval(settings.interval)));
  else args.push('--port', String(port(settings.port, role)));
  return {args, inputs, createDirectories: []};
}
export function taskerServiceSelection(args) {
  need(Array.isArray(args) && args[0] === 'service', 'TASKER_SERVICE_REQUEST_INVALID');
  const selected = {};
  const fields = new Set(['role', 'directory', 'native-source', 'python', 'service-python', 'installation-id',
    'source-identity', 'installation-device', 'installation-inode', 'application-sha256',
    'configuration-sha256', 'interval', 'port', 'managed-operation']);
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.startsWith('--') ? args[i].slice(2) : '';
    need(fields.has(key) && !Object.hasOwn(selected, key) && typeof args[i + 1] === 'string' &&
      args[i + 1].length > 0, 'TASKER_SERVICE_REQUEST_INVALID');
    selected[key] = args[i + 1];
  }
  for (const field of ['role', 'directory', 'native-source', 'python', 'service-python', 'installation-id',
    'source-identity', 'installation-device', 'installation-inode', 'application-sha256', 'configuration-sha256'])
    need(Object.hasOwn(selected, field), 'TASKER_SERVICE_REQUEST_INVALID');
  need(roles.has(selected.role), 'TASKER_ROLE_INVALID');
  for (const field of ['source-identity', 'application-sha256', 'configuration-sha256'])
    need(/^[a-f0-9]{64}$/.test(selected[field]), 'TASKER_SERVICE_REQUEST_INVALID');
  for (const field of ['installation-device', 'installation-inode'])
    need(/^[0-9]+$/.test(selected[field]), 'TASKER_SERVICE_REQUEST_INVALID');
  return selected;
}
async function currentSelection(request, environment = process.env) {
  need(request.command === 'taskerarmy' && !request.pythonCommand, 'TASKER_SERVICE_REQUEST_INVALID');
  const selected = taskerServiceSelection(request.args);
  const client = new TaskerInstallation({directory: selected.directory, sourceDirectory: selected['native-source'],
    python: selected.python, binding: {installation_id: selected['installation-id'],
      source_identity: selected['source-identity']}, environment});
  try {
    const inspected = await client.inspect(), installed = inspected.installation;
    need(installed.binding.device === selected['installation-device'] &&
      installed.binding.inode === selected['installation-inode'] &&
      installed.python.path === selected['service-python'] &&
      inspected.result.configuration_sha256 === selected['configuration-sha256'] &&
      inventoryDigest(inspected.result.application_files) === selected['application-sha256'],
      'TASKER_REVIEW_CHANGED', 'Review the current original Tasker source, configuration and installation before this service launch.');
    return {selected, installed, client};
  } catch (error) { await client.close(); throw error; }
}
export async function verifyTaskerLaunch(request, operationDirectory) {
  const current = await currentSelection(request);
  try {
    need(current.selected['managed-operation'] === basename(operationDirectory), 'TASKER_MANAGED_OPERATION_CHANGED');
    await canonicalDirectory(operationDirectory, {privateOnly: true});
  } finally { await current.client.close(); }
}
export async function prepareTaskerChild(request, operationDirectory, originalArgs, environment) {
  const current = await currentSelection(request, environment);
  const {selected, installed, client} = current;
  try {
    need(selected['managed-operation'] === basename(operationDirectory), 'TASKER_MANAGED_OPERATION_CHANGED');
    await canonicalDirectory(operationDirectory, {privateOnly: true});
    // The actual launch selects a fresh private original ready file. The shared
    // command-process record retains its exact argv; no old ready file is removed.
    const ready = selected.role === 'operator' ? join(operationDirectory, 'tasker-operator-' + randomUUID() + '.json') : undefined;
    const reply = await client.call('commands.describe', {
      roles: [selected.role],
      ...(ready ? {ready_file: ready} : {}),
      ...(selected.role === 'operator' ? {operator_port: port(selected.port, 'operator')} : {}),
      ...(selected.role === 'ingress' ? {ingress_port: port(selected.port, 'ingress')} : {}),
      ...(selected.role === 'worker' ? {worker_interval: interval(selected.interval)} : {}),
    });
    const command = reply.result.commands?.[0];
    need(reply.result.commands?.length === 1 && command.role === selected.role &&
      command.executable === installed.python.path && command.argv[0] === command.executable &&
      command.cwd === installed.paths.application, 'TASKER_NATIVE_COMMAND_CHANGED');
    need(sha(await readFile(command.script)) === command.script_sha256, 'TASKER_NATIVE_SOURCE_CHANGED');
    await access(command.executable, constants.X_OK);
    launches.set(request, {command, installed, selected});
    return {executable: command.executable, args: command.argv.slice(1),
      options: {cwd: command.cwd, env: environment, shell: false, stdio: ['ignore', 'pipe', 'pipe', 3]}};
  } finally { await client.close(); }
}
export async function taskerStartup(request, text, context = {}) {
  if (typeof text !== 'string' || text.length > 16384) return null;
  let announced; try { announced = JSON.parse(text); } catch { return null; }
  if (!plain(announced) || announced.schema !== TASKER_PROCESS_SCHEMA) return null;
  const launch = launches.get(request);
  need(launch?.command.role === 'operator', 'TASKER_ORIGINAL_LAUNCH_REQUIRED');
  const {command, installed, selected} = launch;
  const retained = (await readPrivateJSON(command.ready_file, 16384)).value;
  const {url, ...identity} = retained;
  need(JSON.stringify(Object.keys(identity).sort()) === JSON.stringify(Object.keys(announced).sort()) &&
    Object.keys(identity).every(key => identity[key] === announced[key]) &&
    Number.isSafeInteger(context.pid) && context.pid > 0 && retained.pid === context.pid &&
    retained.installation_id === installed.installation_id && retained.operation_id === installed.operation_id &&
    retained.application === installed.paths.application && retained.database === installed.paths.database &&
    retained.configuration === installed.paths.configuration, 'TASKER_ORIGINAL_LAUNCH_CHANGED');
  need(sha(await readFile(join(installed.paths.application, 'operator_server.py'))) === retained.operator_source_sha256 &&
    sha(await readFile(join(installed.paths.application, 'operator.html'))) === retained.html_sha256,
    'TASKER_OPERATOR_SOURCE_CHANGED');
  let privateURL;
  try { privateURL = new URL(url); } catch { throw taskerError('TASKER_OPERATOR_URL_INVALID', 'The original operator ready file has an invalid private URL.'); }
  need(privateURL.protocol === 'http:' && privateURL.hostname === '127.0.0.1' &&
    privateURL.origin === retained.origin && privateURL.pathname === '/' && !privateURL.search &&
    !privateURL.username && !privateURL.password && /^#token=[A-Za-z0-9_-]{32,}$/.test(privateURL.hash) &&
    (port(selected.port, 'operator') === 0 || Number(privateURL.port) === port(selected.port, 'operator')),
    'TASKER_OPERATOR_URL_INVALID');
  return {url: privateURL.href, original: {...identity, ready_file: command.ready_file,
    source_identity: installed.source_identity, script_sha256: command.script_sha256}};
}
