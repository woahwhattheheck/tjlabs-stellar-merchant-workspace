// MIT — Installed command for the original Python received-resource reading desk.
import { spawn } from 'node:child_process';
import { dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const executable = process.env.STARFORGE_READING_PYTHON || 'python3';
const child = spawn(executable, ['-m', 'stellar_forge_buyer.reading_cli', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, PYTHONPATH: [directory, process.env.PYTHONPATH].filter(Boolean).join(delimiter) },
});
const forward = signal => { if (child.exitCode === null) child.kill(signal); };
const interrupt = () => forward('SIGINT');
const terminate = () => forward('SIGTERM');
process.on('SIGINT', interrupt);
process.on('SIGTERM', terminate);
child.once('error', () => {
  console.error('The selected Python executable could not start. Set STARFORGE_READING_PYTHON to Python 3.11 or later.');
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', terminate);
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
