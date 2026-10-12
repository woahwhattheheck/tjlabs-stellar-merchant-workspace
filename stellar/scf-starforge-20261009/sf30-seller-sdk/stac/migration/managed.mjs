// SPDX-License-Identifier: MIT
// Installed entry for the original migration engine, operator and merchant connection.
import { spawn, execFile } from 'node:child_process';
import { access, stat, realpath, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrationFailure, migrationIdentifier, migrationPrivateDirectory,
  retainMigrationBytes, validateMigrationWorkspaceConfiguration,
  parseExactJSON, stringifyExactJSON } from './merchant/client.mjs';

export { parseExactJSON };

const ENGINE = fileURLToPath(new URL('./engine.py', import.meta.url));
const SERVER = fileURLToPath(new URL('./server.py', import.meta.url));
const RESULT = 'MIGRATION_RESULT_JSON ';
const CONNECTION = 'starforge.migration-merchant-connection.v1';
const ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireValue = (condition, code, message) => {
  if (!condition) throw migrationFailure(code, message);
};

export async function migrationOperatorPython(value) {
  requireValue(typeof value === 'string' && value && !/[\0\r\n]/.test(value),
    'PYTHON_REQUIRED', 'Select the installed Python executable.');
  const executable = resolve(value);
  await access(executable, constants.X_OK);
  requireValue((await stat(executable)).isFile(), 'PYTHON_REQUIRED',
    'The selected native Python must be an executable file.');
  // Keep the selected venv path for execution; resolving it would discard pyvenv.cfg.
  return { executable, resolved: await realpath(executable) };
}

async function originalEngine(python, workspace, command, payload, environment) {
  const selected = await migrationOperatorPython(python);
  const input = Buffer.from(stringifyExactJSON({ command, payload }) + '\n');
  return new Promise((yes, no) => {
    const child = execFile(selected.executable, ['-B', ENGINE, '--workspace', resolve(workspace)],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30000,
        windowsHide: true, env: { ...environment, PYTHONDONTWRITEBYTECODE: '1' } },
      (error, stdout, stderr) => {
        try {
          const rows = String(stdout ?? '').split(/\r?\n/).filter(line => line.startsWith(RESULT));
          requireValue(rows.length === 1, 'ORIGINAL_RESULT_REQUIRED',
            'The original engine returned no unique complete result. Reopen this same workspace to read its state.');
          const result = parseExactJSON(rows[0].slice(RESULT.length));
          if (!plain(result) || result.ok !== true || error) {
            const detail = result?.error;
            throw migrationFailure(detail?.code ?? 'ORIGINAL_COMMAND_FAILED',
              detail?.message ?? String(error?.message ?? stderr).trim().slice(0,2000),
              { original: result, exitCode: error?.code ?? null });
          }
          yes(result.result);
        } catch (failure) { no(failure); }
      });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') no(error); });
    child.stdin.end(input);
  });
}

export async function readMigrationOperatorBinding({
  workspaceDirectory, pythonExecutable, environment = process.env,
} = {}) {
  const directory = await migrationPrivateDirectory(workspaceDirectory);
  const python = await migrationOperatorPython(pythonExecutable);
  const state = await originalEngine(python.executable, directory, 'state', {}, environment);
  requireValue(plain(state), 'WORKSPACE_REQUIRED', 'Open the original migration workspace.');
  const workspaceId = migrationIdentifier(state.id, 'workspace ID');
  return { schema: 'starforge.migration-operator-binding.v1', workspaceId,
    directory, revision: state.revision, title: state.title,
    python: python.executable, pythonResolved: python.resolved };
}

export async function createMigrationOperatorWorkspace({
  workspaceDirectory, pythonExecutable, title = 'GIS migration', environment = process.env,
} = {}) {
  requireValue(typeof title === 'string' && title.trim() && title.length <= 200,
    'TITLE_REQUIRED', 'Give the original workspace a short title.');
  // The unchanged native create operation owns its SQLite identity and replay.
  return originalEngine(pythonExecutable, workspaceDirectory, 'create', { title }, environment);
}

async function connectionEnvironment(path) {
  if (!path) return { QT_QPA_PLATFORM: 'offscreen' };
  const raw = await readFile(resolve(path));
  requireValue(raw.length <= 1024 * 1024, 'ENVIRONMENT_INVALID', 'Select a private environment JSON file within one MiB.');
  const value = JSON.parse(raw.toString('utf8'));
  requireValue(plain(value) && Object.entries(value).every(([key,item]) =>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof item === 'string' && !item.includes('\0')),
    'ENVIRONMENT_INVALID', 'Private environment names and values must be strings.');
  return value;
}

export async function writeMigrationOperatorConnection({
  workspaceDirectory, pythonExecutable, vectorPython, qgisPython,
  runtimeDirectory, connectionFile, alias = 'delivery', name = 'GIS migration',
  pythonPath = [], environmentFile, environment = process.env,
} = {}) {
  requireValue(ALIAS.test(alias) && typeof connectionFile === 'string' && connectionFile &&
    typeof runtimeDirectory === 'string' && runtimeDirectory,
    'CONNECTION_REQUIRED', 'Select the original workspace alias, connection file and separate native request directory.');
  const privateEnvironment = await connectionEnvironment(environmentFile);
  const binding = await readMigrationOperatorBinding({ workspaceDirectory, pythonExecutable,
    environment: { ...environment, ...privateEnvironment } });
  const vector = await migrationOperatorPython(vectorPython ?? binding.python);
  const qgis = await migrationOperatorPython(qgisPython ?? binding.python);
  requireValue(Array.isArray(pythonPath) && pythonPath.every(path => typeof path === 'string' && path),
    'PYTHON_PATH_REQUIRED', 'Use complete native package directories.');
  const selectedPaths = [];
  for (const path of pythonPath) selectedPaths.push(await migrationPrivateDirectory(path));
  const file = resolve(connectionFile);
  const value = { schema: CONNECTION, name, workspaces: { [alias]: {
    workspaceId: binding.workspaceId, directory: binding.directory,
    runtimeDirectory: resolve(runtimeDirectory), python: binding.python,
    vectorPython: vector.executable, qgisPython: qgis.executable, pythonPath: selectedPaths,
    environment: privateEnvironment, inputs: {}, destinations: {},
  } } };
  validateMigrationWorkspaceConfiguration(value, { baseDirectory: dirname(file) });
  await retainMigrationBytes(file, Buffer.from(stringifyExactJSON(value,2) + '\n'));
  return { schema: CONNECTION, state: 'CONNECTION_RETAINED', connectionFile: file,
    workspace: alias, workspaceId: binding.workspaceId, directory: binding.directory,
    runtimeDirectory: resolve(runtimeDirectory) };
}

export async function serveMigrationOperator({
  workspaceDirectory, pythonExecutable, vectorPython, qgisPython, exportsDirectory,
  expectedWorkspaceId, port = 0, environment = process.env,
} = {}) {
  requireValue(Number.isSafeInteger(port) && port >= 0 && port <= 65535,
    'PORT_INVALID', 'Choose a local port from 0 to 65535.');
  const binding = await readMigrationOperatorBinding({ workspaceDirectory, pythonExecutable, environment });
  requireValue(expectedWorkspaceId === undefined || expectedWorkspaceId === binding.workspaceId,
    'WORKSPACE_CHANGED', 'Re-review the original selected workspace identity.');
  const vector = await migrationOperatorPython(vectorPython ?? binding.python);
  const qgis = await migrationOperatorPython(qgisPython ?? binding.python);
  const args = ['-B', SERVER, '--workspace', binding.directory,
    '--expected-workspace-id', binding.workspaceId, '--python', binding.python,
    '--vector-python', vector.executable, '--qgis-python', qgis.executable,
    '--exports', resolve(exportsDirectory ?? binding.directory + '-exports'), '--port', String(port)];
  return new Promise((yes, no) => {
    let child = null, stopping = null, finished = false, stopError = null;
    const forward = signal => {
      stopping ??= signal;
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        try { child.kill(stopping); } catch (error) { if (error.code !== 'ESRCH') stopError = error; }
      }
    };
    const interrupt = () => forward('SIGINT'), terminate = () => forward('SIGTERM');
    const detach = () => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', terminate);
    };
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
    try {
      // The original server drains its own native process groups on Stop.
      // Its separate group receives each signal through this one awaiting owner.
      child = spawn(binding.python, args, { stdio: 'inherit', detached: true,
        windowsHide: true, env: { ...environment, PYTHONDONTWRITEBYTECODE: '1',
          QT_QPA_PLATFORM: environment.QT_QPA_PLATFORM ?? 'offscreen' } });
      child.once('spawn', () => { if (stopping) forward(stopping); });
      child.once('error', error => { if (!finished) { finished = true; detach(); no(error); } });
      child.once('close', (code, signal) => {
        if (finished) return;
        finished = true; detach();
        if (stopError) no(stopError);
        else yes(code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1));
      });
    } catch (error) { finished = true; detach(); no(error); }
  });
}

const HELP = [
  'Original GIS migration operator',
  '',
  'starforge migration-operator create --workspace DIR --python PYTHON [--title TITLE]',
  'starforge migration-operator describe --workspace DIR --python PYTHON',
  'starforge migration-operator serve --workspace DIR --python PYTHON [--vector-python PYTHON] [--qgis-python PYTHON] [--exports DIR] [--port 0]',
  'starforge migration-operator connect --workspace DIR --python PYTHON --runtime DIR --connection FILE [--alias delivery] [--vector-python PYTHON] [--qgis-python PYTHON]',
  '',
  'Connection options: repeat --python-path DIR; --environment FILE; --name NAME.',
  'Serve may also bind --expected-workspace-id ID selected by Applications.',
  'Create and describe use the original engine. Serve opens its original operator.',
  'Connect retains a private original merchant connection. Continue its setup with:',
  'starforge migration-workspace init --directory MERCHANT_DIR --connection FILE',
  '',
  'Retain the selected workspace, native request directory and complete exported handovers.',
  'Stop waits for the original server and its admitted native children to close.',
].join('\n');

function parseArguments(argv) {
  const options = {}, position = [], allowed = new Set(['workspace','python','vector-python',
    'qgis-python','exports','port','expected-workspace-id','title','runtime','connection',
    'alias','name','python-path','environment']);
  for (let i=0;i<argv.length;i++) {
    const item = argv[i];
    if (item === '--help' || item === '-h') { options.help = true; continue; }
    if (!item.startsWith('--')) { position.push(item); continue; }
    const key = item.slice(2);
    requireValue(allowed.has(key) && i+1<argv.length && !argv[i+1].startsWith('--'),
      'CLI_ARGUMENTS', 'Use an original option and its complete value: '+item+'.');
    const value = argv[++i];
    requireValue(key === 'python-path' || options[key] === undefined,
      'CLI_ARGUMENTS', 'Give each selected option once: '+item+'.');
    if (key === 'python-path') (options[key] ??= []).push(value); else options[key] = value;
  }
  requireValue(position.length<=1, 'CLI_ARGUMENTS', 'Choose one original operating command.');
  return { command: position[0] ?? 'help', options };
}
export async function runMigrationOperatorCli(argv=process.argv.slice(2), { stdout=process.stdout, environment=process.env }={}) {
  const {command,options:o}=parseArguments(argv);
  if (command === 'help' || o.help) { stdout.write(HELP+'\n'); return 0; }
  const get = key => {
    requireValue(typeof o[key] === 'string' && o[key], 'CLI_ARGUMENTS', 'Supply --'+key+'.');
    return o[key];
  };
  requireValue(['create','describe','serve','connect'].includes(command),
    'CLI_ARGUMENTS', 'Choose create, describe, serve or connect.');
  const common={workspaceDirectory:get('workspace'),pythonExecutable:get('python'),environment};
  let result;
  if(command==='create')result=await createMigrationOperatorWorkspace({...common,title:o.title});
  if(command==='describe')result=await readMigrationOperatorBinding(common);
  if(command==='serve') {
    requireValue(o.port===undefined||/^(0|[1-9]\d*)$/.test(o.port),
      'PORT_INVALID','Choose a decimal local port.');
    return serveMigrationOperator({...common,vectorPython:o['vector-python'],qgisPython:o['qgis-python'],
      exportsDirectory:o.exports,expectedWorkspaceId:o['expected-workspace-id'],port:o.port===undefined?0:Number(o.port)});
  }
  if(command==='connect')result=await writeMigrationOperatorConnection({...common,
    vectorPython:o['vector-python'],qgisPython:o['qgis-python'],runtimeDirectory:get('runtime'),
    connectionFile:get('connection'),alias:o.alias,name:o.name,pythonPath:o['python-path']??[],
    environmentFile:o.environment});
  stdout.write(stringifyExactJSON(result,2)+'\n');return 0;
}
export const main=runMigrationOperatorCli;
export default runMigrationOperatorCli;
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runMigrationOperatorCli().then(code=>{process.exitCode=code;},error=>{
    process.stderr.write(JSON.stringify({state:'FAILED',code:error.code??'MIGRATION_OPERATOR_FAILED',message:error.message})+'\n');
    process.exitCode=1;
  });
}
