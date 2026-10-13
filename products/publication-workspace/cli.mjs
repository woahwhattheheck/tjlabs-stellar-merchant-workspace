#!/usr/bin/env node
// Apache-2.0. Complete original publishing installation and service operations.
import {spawn} from 'node:child_process';
import {PublicationInstallation, PUBLICATION_SOURCE, plain, readPrivateJSON, requestId, selectedPath,
  publicationError} from './client.mjs';
const usage = [
  'publication-workspace prepare --directory PRIVATE --source-root ORIGINAL --source-manifest SOURCE.json --request-id UUID [--workspace-archive ORIGINAL.zip] [--native-config PRIVATE.json] [--actor NAME]',
  'publication-workspace inspect --directory PRIVATE',
  'publication-workspace source --directory PRIVATE --source-root ORIGINAL --source-manifest SOURCE.json',
  'publication-workspace adopt-source --directory PRIVATE --source-root ORIGINAL --source-manifest SOURCE.json --request-id UUID',
  'publication-workspace snapshot --directory PRIVATE --output COMPLETE.zip --request-id UUID',
  'publication-workspace receive --directory NEW_PRIVATE --archive COMPLETE.zip --request-id UUID [--actor NAME]',
  'publication-workspace export --directory PRIVATE --kind workspace|operator|native-tools|procurement --output ORIGINAL.zip --request-id UUID --actor NAME',
  'publication-workspace call --directory PRIVATE --operation OPERATION [--arguments PRIVATE_JSON] [--request-id UUID]',
  'publication-workspace service --directory PRIVATE --role operator|resident|wordpress --ready-file NEW_PRIVATE_JSON [--port PORT] [--release-id RELEASE]',
  'Every command accepts --python ORIGINAL_PYTHON and --native-source COMPLETE_ADAPTER.',
].join('\n');
const common = ['directory', 'python', 'native-source'];
const keys = {
  prepare: [...common, 'source-root', 'source-manifest', 'request-id', 'workspace-archive', 'native-config', 'actor'],
  inspect: common, source: [...common, 'source-root', 'source-manifest'],
  'adopt-source': [...common, 'source-root', 'source-manifest', 'request-id'],
  snapshot: [...common, 'output', 'request-id'], receive: [...common, 'archive', 'request-id', 'actor'],
  export: [...common, 'kind', 'output', 'request-id', 'actor'],
  call: [...common, 'operation', 'arguments', 'request-id'],
  service: [...common, 'role', 'ready-file', 'port', 'release-id'],
};
function parse(argv) {
  const [command, ...args] = argv;
  if (!Object.hasOwn(keys, command)) throw publicationError('USAGE', usage);
  const selected = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.startsWith('--') ? args[i].slice(2) : '';
    if (!keys[command].includes(key) || Object.hasOwn(selected, key) || !args[i + 1])
      throw publicationError('USAGE', usage);
    selected[key] = args[i + 1];
  }
  if (!selected.directory) throw publicationError('USAGE', usage);
  return {command, selected};
}
function required(selected, key) {
  if (!selected[key]) throw publicationError('USAGE', 'Select --' + key + '.\n' + usage);
  return selected[key];
}
const source = selected => ({source_root: selectedPath(required(selected, 'source-root')),
  source_manifest: selectedPath(required(selected, 'source-manifest'))});
async function service(client, selected) {
  const role = required(selected, 'role');
  const reply = await client.call('commands.describe', {roles: [role],
    ready_file: selectedPath(required(selected, 'ready-file')), port: Number(selected.port ?? 0),
    ...(selected['release-id'] ? {release_id: selected['release-id']} : {})});
  const command = reply.result.commands[0];
  const child = spawn(command.executable, command.argv.slice(1),
    {cwd: command.cwd, env: process.env, shell: false, stdio: 'inherit'});
  const stop = () => child.kill('SIGTERM'), interrupt = () => child.kill('SIGINT');
  process.on('SIGTERM', stop); process.on('SIGINT', interrupt);
  try {
    const result = await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => accept({code, signal}));
    });
    process.exitCode = result.code ?? (result.signal === 'SIGINT' ? 130 : 143);
  } finally { process.off('SIGTERM', stop); process.off('SIGINT', interrupt); }
}
try {
  const {command, selected} = parse(process.argv.slice(2));
  const client = new PublicationInstallation({directory: selectedPath(selected.directory),
    sourceDirectory: selectedPath(selected['native-source'] ?? PUBLICATION_SOURCE),
    python: selectedPath(selected.python ?? '/usr/bin/python3')});
  try {
    const id = selected['request-id'] === undefined ? undefined : requestId(selected['request-id']);
    let result;
    if (command === 'prepare') result = await client.prepare({...source(selected),
      ...(selected['workspace-archive'] ? {workspace_archive: selectedPath(selected['workspace-archive'])} : {}),
      ...(selected['native-config'] ? {native: (await readPrivateJSON(selectedPath(selected['native-config']))).value} : {}),
      python: selectedPath(selected.python ?? '/usr/bin/python3'), actor: selected.actor ?? 'Publishing operator'}, id);
    else if (command === 'source') result = await client.source(source(selected));
    else if (command === 'inspect') result = await client.inspect();
    else if (command === 'adopt-source') result = await client.adoptSource(source(selected), id);
    else if (command === 'snapshot') result = await client.snapshot(selectedPath(required(selected, 'output')), id);
    else if (command === 'receive') result = await client.receive({archive_path: selectedPath(required(selected, 'archive')),
      python: selectedPath(selected.python ?? '/usr/bin/python3'), actor: selected.actor ?? 'Publishing operator'}, id);
    else if (command === 'export') result = await client.export(required(selected, 'kind'),
      selectedPath(required(selected, 'output')), required(selected, 'actor'), id);
    else if (command === 'call') {
      const argumentsValue = selected.arguments ? (await readPrivateJSON(selectedPath(selected.arguments))).value : {};
      if (!plain(argumentsValue)) throw publicationError('INVALID_PARAMS', 'Use the complete original JSON argument object.');
      result = await client.call(required(selected, 'operation'), argumentsValue, id);
    } else await service(client, selected);
    if (result !== undefined) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } finally { await client.close(); }
} catch (error) {
  process.stderr.write((error.code ?? 'PUBLICATION_ERROR') + ': ' + error.message + '\n');
  process.exitCode = 2;
}
