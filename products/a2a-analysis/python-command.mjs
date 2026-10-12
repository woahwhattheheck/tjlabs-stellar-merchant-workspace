// SPDX-License-Identifier: MIT
import { access, realpath } from 'node:fs/promises';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const sourceDirectory = fileURLToPath(new URL('../../', import.meta.url));
const modules = Object.freeze({
  workspace: 'stellar_forge_buyer.analysis_workspace',
  archive: 'stellar_forge_buyer.workspace_archive_receive'
});
const sourcePackage = 'stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python';
const signalNumbers = Object.freeze({ SIGHUP: 1, SIGINT: 2, SIGTERM: 15 });

function need(condition, message) {
  if (!condition) throw new TypeError(message);
}

/** Select the original Python module from this same checkout or installed archive. */
export async function originalPythonCommand(kind, args, {
  python = process.env.A2A_ANALYSIS_PYTHON || 'python3'
} = {}) {
  need(Object.hasOwn(modules, kind), 'Select the original workspace or archive command.');
  need(Array.isArray(args) && args.every(value => typeof value === 'string' && !value.includes('\0')),
    'Original command arguments must be strings without NUL bytes.');
  need(typeof python === 'string' && python.length > 0 && !python.includes('\0'),
    'A2A_ANALYSIS_PYTHON must name one Python executable.');
  need(Number(process.versions.node.split('.')[0]) >= 24, 'The A2A product requires Node 24 or newer.');
  const sourceRoot = await realpath(sourceDirectory);
  const pythonRoot = join(sourceRoot, sourcePackage);
  await access(join(pythonRoot, ...modules[kind].split('.')) + '.py');
  let original = [...args];
  if (kind === 'workspace') {
    // The original argparse accepts abbreviated options too. The wrapper binds
    // the selected source and Node executable before forwarding customer inputs.
    for (const value of args) {
      const flag = value.split('=', 1)[0];
      need(!(flag.startsWith('--') && flag.length > 2 &&
        ['--checkout', '--node'].some(reserved => reserved.startsWith(flag))),
      'This installed command selects its own --checkout and --node. Use the original source CLI to select another runtime.');
    }
    original = ['--checkout', sourceRoot, '--node', process.execPath, ...original];
  }
  return {
    executable: python,
    args: ['-P', '-m', modules[kind], ...original],
    cwd: sourceRoot,
    env: { ...process.env, PYTHONSAFEPATH: '1',
      PYTHONPATH: pythonRoot + (process.env.PYTHONPATH ? delimiter + process.env.PYTHONPATH : '') }
  };
}

/** Keep one child alive through its original cleanup; propagate its real outcome. */
export async function runOriginalPython(kind, args = process.argv.slice(2), options) {
  const command = await originalPythonCommand(kind, args, options);
  const child = spawn(command.executable, command.args, {
    cwd: command.cwd, env: command.env, stdio: 'inherit', shell: false
  });
  let stopping = false;
  const stop = () => {
    if (stopping || child.exitCode !== null || child.signalCode !== null) return;
    stopping = true;
    // The original AnalysisWorkspace CLI handles KeyboardInterrupt in its
    // server/finally path. Use it for service-manager shutdown as well.
    child.kill('SIGINT');
  };
  for (const signal of Object.keys(signalNumbers)) process.on(signal, stop);
  try {
    return await new Promise((resolveResult, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => {
        resolveResult(code ?? 128 + (signalNumbers[signal] ?? 1));
      });
    });
  } finally {
    for (const signal of Object.keys(signalNumbers)) process.removeListener(signal, stop);
  }
}

export async function isCommandEntry(metaUrl) {
  if (!process.argv[1]) return false;
  try { return await realpath(resolve(process.argv[1])) === await realpath(fileURLToPath(metaUrl)); }
  catch { return false; }
}
