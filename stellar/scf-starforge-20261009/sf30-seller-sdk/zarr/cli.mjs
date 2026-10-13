#!/usr/bin/env node
// MIT. Invoke the original Python workspace command with unchanged JSON I/O.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
let python = process.env.ZARR_PYTHON || 'python3';
if (args[0] === '--python') {
  if (!args[1] || args[1].includes('\0')) throw new TypeError('Select the installed Python executable.');
  python = args.splice(0, 2)[1];
}
if (!args.length || ['help', '--help', '-h'].includes(args[0])) {
  console.log('zarr-source [--python EXECUTABLE] COMMAND [original Python arguments]\n' +
    'Commands: runtime, init, status, operation, result, frozen, apply, export, receive, verify-packet.\n' +
    'apply reads the exact reviewed original request from standard input.\n' +
    'No command installs dependencies, starts a service, or repeats a completed operation.');
} else {
  const child = spawn(python, ['-B', fileURLToPath(new URL('./python/cli.py', import.meta.url)), ...args],
    { stdio: 'inherit', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  const stop = signal => { if (child.exitCode === null && child.signalCode === null) child.kill(signal); };
  const term = () => stop('SIGTERM'), interrupt = () => stop('SIGINT');
  process.on('SIGTERM', term); process.on('SIGINT', interrupt);
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    process.exitCode = result.code ?? (result.signal === 'SIGINT' ? 130 : 143);
  } catch (issue) {
    console.error(JSON.stringify({ code: 'ZARR_PYTHON_START', message: issue.message }));
    process.exitCode = 1;
  } finally {
    process.off('SIGTERM', term); process.off('SIGINT', interrupt);
  }
}
