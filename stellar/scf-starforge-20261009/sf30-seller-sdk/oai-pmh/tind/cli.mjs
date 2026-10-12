// MIT. Use the operator-selected Python for the original TIND/OAI workspace.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function main(args = process.argv.slice(2)) {
  let python = process.env.SF30_OAI_PYTHON || process.env.SF30_XML_PYTHON || 'python3';
  if (args[0] === '--python') {
    if (typeof args[1] !== 'string' || !args[1]) throw new Error('Choose the existing Python executable.');
    python = args[1]; args = args.slice(2);
  }
  const child = spawn(python, [fileURLToPath(new URL('./cli.py', import.meta.url)), ...args], {
    stdio: 'inherit', shell: false, env: { ...process.env, SF30_XML_NODE: process.execPath },
  });
  const forward = signal => () => { if (!child.killed) child.kill(signal); };
  const interrupt = forward('SIGINT'), terminate = forward('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  return await new Promise((resolve, reject) => {
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', (code, signal) => {
      cleanup(); process.exitCode = Number.isInteger(code) ? code : signal === 'SIGINT' ? 130 : 143;
      resolve(process.exitCode);
    });
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(JSON.stringify({ error: error.message }) + '\n'); process.exitCode = 2; });
}
