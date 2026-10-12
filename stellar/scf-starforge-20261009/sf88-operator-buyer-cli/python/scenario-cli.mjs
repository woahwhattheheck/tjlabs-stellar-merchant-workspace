#!/usr/bin/env node
// MIT. Run the original Python scenario application without a second engine.
import { spawn } from 'node:child_process';
import { delimiter } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function runScenario(args = process.argv.slice(2), options = {}) {
  const executable = options.python ?? process.env.STARFORGE_PYTHON ?? 'python3';
  const root = fileURLToPath(new URL('./', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-m', 'stellar_forge_buyer.scenario_cli', ...args], {
      stdio: 'inherit', shell: false,
      env: { ...process.env, PYTHONPATH: root + (process.env.PYTHONPATH ? delimiter + process.env.PYTHONPATH : '') },
    });
    const forward = signal => { if (child.exitCode === null) child.kill(signal); };
    const int = () => forward('SIGINT'), term = () => forward('SIGTERM');
    process.on('SIGINT', int); process.on('SIGTERM', term);
    const clean = () => { process.off('SIGINT', int); process.off('SIGTERM', term); };
    child.once('error', error => { clean(); reject(error); });
    child.once('exit', (code, signal) => { clean(); resolve(code ?? (signal === 'SIGINT' ? 130 : 143)); });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await runScenario(); }
  catch (error) { console.error('Scenario application could not start: ' + error.message); process.exitCode = 1; }
}
