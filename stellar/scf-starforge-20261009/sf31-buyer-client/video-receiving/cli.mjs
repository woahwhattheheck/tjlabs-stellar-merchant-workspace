#!/usr/bin/env node
// MIT. Installed CLI for one original accepted x402engine video job.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { retainX402VideoJob, openX402VideoJob, openX402VideoExport } from './x402engine.mjs';
import { startX402VideoOperator } from './operator.mjs';

export async function runVideoReceivingCommand(argv) {
  const [command, ...rest] = argv;
  const commandFlags = {
    retain: ['--directory', '--acceptance-file', '--max-video-bytes', '--transport-file'],
    inspect: ['--directory'],
    poll: ['--directory', '--transport-file'],
    receive: ['--directory', '--output', '--deadline-ms', '--transport-file'],
    export: ['--directory', '--output'],
    'open-export': ['--directory'],
    serve: ['--directory', '--port', '--exports-directory', '--transport-file'],
  };
  if (['help', '--help', '-h'].includes(command)) return {
    command: 'x402-video', workflow: 'retain -> receive -> export -> open-export',
    commands: commandFlags,
    guide: 'sf31-buyer-client/video-receiving/README.md',
  };
  if (!Object.hasOwn(commandFlags, command))
    throw Object.assign(new Error(), { code: 'VIDEO_COMMAND_REQUIRED' });
  const allowed = new Set(commandFlags[command]), args = Object.create(null);
  for (let i = 0; i < rest.length; i += 2) {
    if (!allowed.has(rest[i]) || !rest[i + 1] || rest[i + 1].startsWith('--') || Object.hasOwn(args, rest[i]))
      throw Object.assign(new Error(), { code: 'VIDEO_COMMAND_ARGUMENT_INVALID' });
    args[rest[i]] = rest[i + 1];
  }
  if (!args['--directory']) throw Object.assign(new Error(), { code: 'VIDEO_COMMAND_REQUIRED' });
  const directory = resolve(args['--directory']);
  const transport = args['--transport-file'] ? JSON.parse(await readFile(resolve(args['--transport-file']), 'utf8')) : undefined;
  const integer = (flag, fallback) => {
    if (args[flag] === undefined) return fallback;
    if (!/^[0-9]+$/.test(args[flag]) || !Number.isSafeInteger(Number(args[flag])))
      throw Object.assign(new Error(), { code: 'VIDEO_COMMAND_INTEGER_INVALID' });
    return Number(args[flag]);
  };
  if (command === 'retain') {
    if (!args['--acceptance-file']) throw Object.assign(new Error(), { code: 'VIDEO_ACCEPTANCE_FILE_REQUIRED' });
    return (await retainX402VideoJob({ directory, acceptanceFile: resolve(args['--acceptance-file']),
      maxVideoBytes: integer('--max-video-bytes', 268435456), transport })).inspect();
  }
  if (command === 'open-export') {
    const job = await openX402VideoExport({ directory, transport });
    return job.inspect();
  }
  if (command === 'serve') {
    const server = await startX402VideoOperator({ directory, transport, port: integer('--port', 0),
      ...(args['--exports-directory'] ? { exportsDirectory: resolve(args['--exports-directory']) } : {}) });
    process.stdout.write(JSON.stringify({ url: server.url, directory }) + '\n');
    await new Promise(done => {
      const stop = () => server.close().then(done, error => { process.stderr.write(JSON.stringify({ error: error.code ?? 'VIDEO_CLOSE_FAILED' }) + '\n'); done(); });
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
    });
    return { state: 'CLOSED', directory };
  }
  const job = await openX402VideoJob({ directory, transport });
  if (command === 'inspect') return job.inspect();
  if (command === 'poll') return job.poll();
  if (command === 'export') {
    if (!args['--output']) throw Object.assign(new Error(), { code: 'VIDEO_OUTPUT_DIRECTORY_REQUIRED' });
    return job.exportWorkspace(resolve(args['--output']));
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const file = await job.receive({ signal: controller.signal, deadlineMs: integer('--deadline-ms', 1800000) });
    if (args['--output']) await file.saveAs(resolve(args['--output']));
    return job.inspect();
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(await runVideoReceivingCommand(process.argv.slice(2))) + '\n'); }
  catch (error) { process.stderr.write(JSON.stringify({ error: /^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code ?? '') ?
    error.code : 'VIDEO_RECEIVING_FAILED' }) + '\n'); process.exitCode = 1; }
}
