#!/usr/bin/env node
// MIT. Complete native installation and service operations; original Python owns state.
import {spawn} from 'node:child_process';
import {TaskerInstallation, TASKER_SOURCE, plain, readPrivateJSON, requestId, selectedPath, taskerError} from './client.mjs';

const usage = [
  'taskerarmy prepare --directory PRIVATE --configuration CONFIG --request-id UUID [--application SOURCE] [--python PYTHON]',
  'taskerarmy inspect --directory PRIVATE [--python PYTHON]',
  'taskerarmy snapshot --directory PRIVATE --output COMPLETE.tar.gz --request-id UUID',
  'taskerarmy receive --directory NEW_PRIVATE --archive COMPLETE.tar.gz --request-id UUID',
  'taskerarmy call --directory PRIVATE --operation OPERATION [--arguments PRIVATE_JSON] [--request-id UUID]',
  'taskerarmy service --directory PRIVATE --role operator|ingress|worker [--ready-file NEW_PRIVATE_JSON] [--port PORT] [--interval SECONDS]',
  'Add --native-source ORIGINAL_PRODUCT to select the complete operation adapter source.',
].join('\n');
const keys = {
  prepare: ['directory', 'configuration', 'request-id', 'application', 'manifest', 'python', 'native-source'],
  inspect: ['directory', 'python', 'native-source'],
  snapshot: ['directory', 'output', 'request-id', 'python', 'native-source'],
  receive: ['directory', 'archive', 'request-id', 'python', 'native-source'],
  call: ['directory', 'operation', 'arguments', 'request-id', 'python', 'native-source'],
  service: ['directory', 'role', 'ready-file', 'port', 'interval', 'python', 'native-source'],
};
function parse(argv) {
  const [command, ...args] = argv;
  if (!keys[command]) throw taskerError('USAGE', usage);
  const selected = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.startsWith('--') ? args[i].slice(2) : '';
    if (!keys[command].includes(key) || selected[key] !== undefined || !args[i + 1])
      throw taskerError('USAGE', usage);
    selected[key] = args[i + 1];
  }
  if (!selected.directory) throw taskerError('USAGE', usage);
  return {command, selected};
}
const required = (selected, key) => {
  if (!selected[key]) throw taskerError('USAGE', 'Select --' + key + '.\n' + usage);
  return selected[key];
};
async function service(client, selected) {
  const role = required(selected, 'role');
  if (!['operator', 'ingress', 'worker'].includes(role)) throw taskerError('USAGE', usage);
  const args = {roles: [role]};
  if (role === 'operator') {
    args.ready_file = selectedPath(required(selected, 'ready-file'));
    args.operator_port = Number(selected.port ?? 0);
  } else if (role === 'ingress') args.ingress_port = Number(selected.port ?? 8094);
  else args.worker_interval = Number(selected.interval ?? 2);
  const described = await client.call('commands.describe', args), command = described.result.commands[0];
  // Terminal signals continue to this actual original child, whose complete
  // argv and source identity were resolved by the original native operation.
  const child = spawn(command.executable, command.argv.slice(1),
    {cwd: command.cwd, env: process.env, shell: false, stdio: 'inherit'});
  const term = () => child.kill('SIGTERM'), interrupt = () => child.kill('SIGINT');
  process.on('SIGTERM', term); process.on('SIGINT', interrupt);
  try {
    const result = await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => accept({code, signal}));
    });
    process.exitCode = result.code ?? (result.signal === 'SIGINT' ? 130 : 143);
  } finally { process.off('SIGTERM', term); process.off('SIGINT', interrupt); }
}
try {
  const {command, selected} = parse(process.argv.slice(2));
  const client = new TaskerInstallation({directory: selectedPath(selected.directory),
    sourceDirectory: selectedPath(selected['native-source'] ?? TASKER_SOURCE),
    python: selectedPath(selected.python ?? '/usr/bin/python3')});
  try {
    let result;
    const id = selected['request-id'] === undefined ? undefined : requestId(selected['request-id']);
    if (command === 'prepare') result = await client.prepare({
      application: selectedPath(selected.application ?? TASKER_SOURCE),
      configuration: selectedPath(required(selected, 'configuration')),
      ...(selected.manifest ? {manifest_path: selectedPath(selected.manifest)} : {}),
      ...(selected.python ? {python: selectedPath(selected.python)} : {})}, id);
    else if (command === 'inspect') result = await client.inspect();
    else if (command === 'snapshot') result = await client.snapshot(selectedPath(required(selected, 'output')), id);
    else if (command === 'receive') result = await client.receive({archive_path: selectedPath(required(selected, 'archive')),
      ...(selected.python ? {python: selectedPath(selected.python)} : {})}, id);
    else if (command === 'call') {
      const args = selected.arguments ? (await readPrivateJSON(selectedPath(selected.arguments))).value : {};
      if (!plain(args)) throw taskerError('INVALID_PARAMS', 'The complete native argument file must contain an object.');
      result = await client.call(required(selected, 'operation'), args, id);
    } else await service(client, selected);
    if (result !== undefined) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } finally { await client.close(); }
} catch (error) {
  process.stderr.write((error.code ?? 'TASKER_ERROR') + ': ' + error.message + '\n');
  process.exitCode = 2;
}
