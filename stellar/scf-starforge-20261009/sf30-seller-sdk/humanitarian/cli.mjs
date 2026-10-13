#!/usr/bin/env node
// MIT. Select the original Python console and keep the native Node identity.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';

const args = process.argv.slice(2);
const at = args.indexOf('--python');
let python = process.env.CODEX_PRIMARY_RUNTIME_PYTHON || process.env.SF30_HUMANITARIAN_PYTHON || 'python3';
if (at >= 0) {
  if (at + 1 >= args.length || !isAbsolute(args[at + 1])) throw new Error('Select an absolute existing Python executable');
  python = args[at + 1]; args.splice(at, 2);
}
if (args.includes('--python')) throw new Error('Select Python once');
const child = spawn(python, ['-B', fileURLToPath(new URL('./humanitarian_cli.py', import.meta.url)), ...args], {
  stdio: 'inherit', windowsHide: true, env: { ...process.env, SF30_XML_NODE: process.execPath },
});
let closed = false;
const forward = signal => { if (!closed) child.kill(signal); };
const sigterm = () => forward('SIGTERM'), sigint = () => forward('SIGINT');
process.on('SIGTERM', sigterm); process.on('SIGINT', sigint);
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('close', (code, signal) => {
  closed = true; process.removeListener('SIGTERM', sigterm); process.removeListener('SIGINT', sigint);
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
});
