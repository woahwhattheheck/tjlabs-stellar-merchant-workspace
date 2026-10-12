#!/usr/bin/env node
// MIT. Original distribution command; the native Python app owns all operations.
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function runPreparation(args = process.argv.slice(2), { python = process.env.STARFORGE_PYTHON || 'python3' } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(python, [fileURLToPath(new URL('./cli.py', import.meta.url)), ...args], { stdio: 'inherit', shell: false });
    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', (code, signal) => { cleanup(); accept(code ?? (signal === 'SIGINT' ? 130 : 143)); });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPreparation().then(code => { process.exitCode = code; }, error => { console.error('Data preparation: ' + error.message); process.exitCode = 1; });
}
