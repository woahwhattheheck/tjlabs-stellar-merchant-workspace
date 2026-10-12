#!/usr/bin/env node
// MIT. The installed NocoDB merchant product; all business actions use original APIs.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { REQUEST_SCHEMA, prepareProject, openProject, inspectProject, nativeStatus,
  importDeclaredInput, inspectOperation, resumeOperation, exportPrivateVersion } from './project.mjs';
import { callProject, downloadPrivateVersion, inspectPrivateDownload } from './mcp-client.mjs';
import { absolute, readJson, fault } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/files.mjs';

export const HELP = `NocoDB merchant project

  prepare --settings PRIVATE_SETUP.json
  prepare --runtime READY_RUNTIME --directory NEW_PRIVATE_PROJECT [--title TITLE]
          [--workspace EXISTING_CLOSED_AUTHORING] [--connections PRIVATE_CONNECTIONS.json]
          [--source FROZEN_SOURCE.json | --packet PRIVATE_PACKET.json] [--sha256 SHA256] [--input ALIAS]
          [--seller SELLER_URL --resource RESOURCE_URL]
  open --directory PROJECT [--port 0]
  status --directory PROJECT
  native-status --directory CLOSED_PROJECT
  uuid
  import --directory CLOSED_PROJECT --input ALIAS --title TITLE --expected-revision N --request-id UUID
  operation|resume --directory CLOSED_PROJECT --request-id UUID
  call --directory OPEN_PROJECT --request PRIVATE_TOOL_CALL.json [--timeout-ms 120000]
  export-private --directory CLOSED_PROJECT --version N --source-sha256 SHA256 --out PRIVATE_PACKET.json
  download-private --directory OPEN_PROJECT --version N --source-sha256 SHA256 --out PRIVATE_NEW_DOWNLOAD_DIR
  inspect-download --directory PROJECT --out COMPLETE_PRIVATE_DOWNLOAD_DIR

open serves the original NocoDB browser and MCP under one native workspace owner.
Use Ctrl-C / SIGTERM to drain that owner. The next open reuses the same state.
prepare creates or adopts the original source workspace; it does not import, capture, publish or start a seller.
call dispatches one original MCP request. After a lost reply, inspect its original request UUID.
export-private/download-private contain full private capture pages; use the original SF82/client exporter for customer delivery.
`;

function options(argv, names) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (!names.includes(name) || Object.hasOwn(result, name) || i + 1 >= argv.length || argv[i + 1].startsWith('--'))
      throw fault('NOCODB_PROJECT_OPTION_INVALID', 'Invalid or repeated option: ' + name);
    result[name] = argv[++i];
  }
  return result;
}
function required(value, label) {
  if (typeof value !== 'string' || !value) throw fault('NOCODB_PROJECT_OPTION_REQUIRED', label + ' is required.');
  return value;
}
function numeric(value, label, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!/^(?:0|[1-9][0-9]*)$/.test(required(value, label))) throw fault('NOCODB_PROJECT_INTEGER_REQUIRED', label + ' must be an integer.');
  const result = Number(value); if (!Number.isSafeInteger(result)) throw fault('NOCODB_PROJECT_INTEGER_REQUIRED');
  return result;
}
const path = (value, name) => absolute(required(value, name), name);
const emit = value => console.log(JSON.stringify(value, null, 2));
const report = error => ({ error: error.code ?? 'NOCODB_PROJECT_ERROR', message: error.message });

async function foreground(directory, port) {
  const controller = new AbortController();
  let owner, waiting, stopped = false;
  const wake = () => { stopped = true; controller.abort(); waiting?.(); };
  process.on('SIGINT', wake); process.on('SIGTERM', wake);
  // A failed native drain keeps this owner alive. A following signal retries the SAME close.
  let keepalive;
  const drain = async close => {
    for (;;) {
      try { await close(); return; }
      catch (error) {
        console.error(JSON.stringify({ phase: 'SHUTDOWN_INCOMPLETE', ...report(error),
          action: 'Original state and ownership retained. Inspect the original failure, then signal this same process to retry close.' }));
        keepalive ??= setInterval(() => {}, 60000);
        await new Promise(resolve => { waiting = resolve; });
        waiting = null;
      }
    }
  };
  try {
    try { owner = await openProject(directory, { port, signal: controller.signal }); }
    catch (error) {
      if (error.close) await drain(error.close);
      if (error.code === 'NOCODB_PROJECT_START_CANCELLED' && stopped) return 0;
      throw error;
    }
    if (!stopped) {
      // One compact startup record, including the native local browser/MCP URLs; token bytes are never printed.
      console.log(JSON.stringify(owner.session));
      await new Promise(resolve => { waiting = resolve; if (stopped) resolve(); });
      waiting = null;
    }
    await drain(owner.close);
    return 0;
  } finally {
    if (keepalive) clearInterval(keepalive);
    process.removeListener('SIGINT', wake); process.removeListener('SIGTERM', wake);
  }
}

export async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv[0] === '--help' || argv[0] === 'help') { console.log(HELP); return 0; }
  const [command, ...rest] = argv;
  if (command === 'uuid') { if (rest.length) throw fault('NOCODB_PROJECT_OPTION_INVALID'); console.log(randomUUID()); return 0; }
  const allowed = {
    prepare: ['--settings','--runtime','--directory','--title','--workspace','--connections','--source','--packet','--sha256','--input','--seller','--resource'],
    open: ['--directory','--port'], status: ['--directory'], 'native-status': ['--directory'],
    import: ['--directory','--input','--title','--expected-revision','--request-id'],
    operation: ['--directory','--request-id'], resume: ['--directory','--request-id'],
    call: ['--directory','--request','--timeout-ms'],
    'export-private': ['--directory','--version','--source-sha256','--out'],
    'download-private': ['--directory','--version','--source-sha256','--out'],
    'inspect-download': ['--directory','--out'],
  }[command];
  if (!allowed) throw fault('NOCODB_PROJECT_COMMAND_INVALID', HELP);
  const args = options(rest, allowed);
  if (command === 'prepare') {
    let setup;
    if (args['--settings']) {
      if (Object.keys(args).length !== 1) throw fault('NOCODB_PROJECT_SETTINGS_EXCLUSIVE');
      setup = await readJson(path(args['--settings'], 'private setup file'), 1024 * 1024);
    } else {
      if (args['--source'] && args['--packet']) throw fault('NOCODB_PROJECT_SINGLE_INPUT_REQUIRED');
      const source = args['--source'] ?? args['--packet'];
      if (!source && (args['--sha256'] || args['--input'])) throw fault('NOCODB_PROJECT_INPUT_REQUIRED');
      setup = { schema: REQUEST_SCHEMA, runtimeDirectory: path(args['--runtime'], 'runtime'),
        directory: path(args['--directory'], 'project directory'),
        ...(args['--title'] ? { title: args['--title'] } : {}),
        ...(args['--workspace'] ? { workspaceDirectory: path(args['--workspace'], 'existing workspace') } : {}),
        ...(args['--connections'] ? { connectionsFile: path(args['--connections'], 'private connections') } : {}),
        ...(source ? { inputs: { [args['--input'] ?? 'captured']: { kind: args['--source'] ? 'source' : 'packet',
          file: path(source, 'private source input'), sha256: required(args['--sha256'], '--sha256') } } } : {}),
        ...(args['--seller'] ? { seller: args['--seller'] } : {}),
        ...(args['--resource'] ? { resource: args['--resource'] } : {}) };
    }
    emit(await prepareProject(setup)); return 0;
  }
  const directory = path(args['--directory'], 'project directory');
  if (command === 'open') return foreground(directory, numeric(args['--port'], '--port', 0));
  if (command === 'status') emit(await inspectProject(directory));
  else if (command === 'native-status') emit(await nativeStatus(directory));
  else if (command === 'import') emit(await importDeclaredInput(directory, {
    input: required(args['--input'], '--input'), title: required(args['--title'], '--title'),
    expectedDraftRevision: numeric(args['--expected-revision'], '--expected-revision'),
    requestId: required(args['--request-id'], '--request-id'),
  }));
  else if (command === 'operation') emit(await inspectOperation(directory, required(args['--request-id'], '--request-id')));
  else if (command === 'resume') emit(await resumeOperation(directory, required(args['--request-id'], '--request-id')));
  else if (command === 'call') {
    const request = await readJson(path(args['--request'], 'private tool request'), 32 * 1024 * 1024);
    if (!request || typeof request !== 'object' || Array.isArray(request) ||
        Object.keys(request).some(key => !['tool','args'].includes(key)) || !Object.hasOwn(request, 'tool'))
      throw fault('NOCODB_PROJECT_TOOL_REQUEST_INVALID');
    emit(await callProject(directory, { ...request, timeoutMs: numeric(args['--timeout-ms'], '--timeout-ms', 120000) }));
  } else if (command === 'export-private') emit(await exportPrivateVersion(directory, {
    versionId: numeric(args['--version'], '--version'), expectedSourceSha256: required(args['--source-sha256'], '--source-sha256'),
    file: path(args['--out'], 'private packet destination'),
  }));
  else if (command === 'download-private') emit(await downloadPrivateVersion(directory, {
    versionId: numeric(args['--version'], '--version'), expectedSourceSha256: required(args['--source-sha256'], '--source-sha256'),
    outputDirectory: path(args['--out'], 'private download directory'),
  }));
  else if (command === 'inspect-download') emit(await inspectPrivateDownload(directory, path(args['--out'], 'private download directory')));
  return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(JSON.stringify(report(error))); process.exitCode = 1; });
