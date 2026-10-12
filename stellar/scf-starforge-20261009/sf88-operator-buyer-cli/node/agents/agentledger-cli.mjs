#!/usr/bin/env node
// MIT — Original AgentLedger windows, buyer request joins, and complete offline results.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Buyer } from '../index.mjs';
import { need, absolute, readJson, writeJson } from '../store.mjs';
import { AGENTLEDGER_PUBLIC_LEDGER, captureAgentLedgerSnapshot, importAgentLedgerSnapshot,
  openAgentLedgerSnapshot, compareAgentLedgerSnapshots, previewAgentLedgerTask,
  createAgentLedgerTask, openAgentLedgerTask, openAgentLedgerDelivery, compareAgentLedgerTasks } from './agentledger.mjs';

const HELP = [
  'starforge buyer-agentledger ACTION [options]',
  '',
  'Ledger intake and offline workbench:',
  'capture --directory NEW_CAPTURE_DIR [--source HTTPS_LEDGER_URL]',
  'import --file EXACT_LEDGER.json --directory CAPTURE_DIR [--source HTTPS_LEDGER_URL] [--observed-at ISO_TIME]',
  'snapshot --directory CAPTURE_DIR [--sha256 EXPECTED_BODY_SHA]',
  'compare --previous CAPTURE_DIR --next CAPTURE_DIR',
  '',
  'Original caller task (requires --runtime SF88_DIR --state NODE_STATE --inbox ORIGINAL_INBOX):',
  'preview --spec CALLER_SPEC.json [--output NEW_REVIEW.json]',
  'create --spec CALLER_SPEC.json --directory TASK_DIR --preview-sha256 REVIEW_SHA',
  'task --directory TASK_DIR [--sha256 EXPECTED_TASK_SHA]',
  'receive --directory TASK_DIR --output RECEIVED_WORKBENCH_DIR',
  'read --directory TASK_DIR --intent ORIGINAL_INTENT [--format file|json|text|csv]',
  'compare-tasks --previous TASK_DIR --next TASK_DIR',
  '',
  'Complete received workbench, independently of the original installation:',
  'delivery --directory RECEIVED_WORKBENCH_DIR [--sha256 EXPECTED_TASK_SHA]',
  'delivery-read --directory RECEIVED_WORKBENCH_DIR --intent ORIGINAL_INTENT [--format file|json|text|csv]',
  '',
  'Read options: --read-limit BYTES (default 8388608), --csv-headers.',
  'The source defaults to ' + AGENTLEDGER_PUBLIC_LEDGER + '.',
  'Each capture opens directly at CAPTURE_DIR/index.html. Complete receiving creates OUTPUT/index.html.',
  'Use the original buyer-inbox-task command at TASK_DIR/original for its current native review and operation.',
  'A completed capture path resumes its retained bytes. Choose a new path to capture a later ledger window.',
].join('\n');
const json = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
function integer(value, fallback) {
  if (value === undefined) return fallback;
  need(/^(0|[1-9][0-9]*)$/.test(value), 'AGENTLEDGER_ARGUMENT_INVALID');
  const number = Number(value); need(Number.isSafeInteger(number), 'AGENTLEDGER_ARGUMENT_INVALID'); return number;
}
function output(bytes) {
  return new Promise((done, fail) => process.stdout.write(bytes, error => error ? fail(error) : done()));
}
async function read(response, values, signal) {
  need(response, 'AGENTLEDGER_RESULT_PENDING');
  const format = values.format ?? 'file', options = { signal, limit: integer(values['read-limit'], 8388608) };
  if (format === 'file') return json(await response.verify({ signal }));
  if (format === 'json') return json(await response.json(options));
  if (format === 'text') return output(new TextDecoder('utf-8', { fatal: true }).decode(await response.bytes(options)));
  need(format === 'csv', 'AGENTLEDGER_READ_FORMAT_INVALID');
  for await (const row of response.csvRows({ headers: values['csv-headers'] ?? false, signal }))
    await output(JSON.stringify(row) + '\n');
}
export async function main(args = process.argv.slice(2)) {
  const names = ['directory', 'file', 'source', 'observed-at', 'sha256', 'previous', 'next', 'runtime',
    'state', 'inbox', 'spec', 'output', 'preview-sha256', 'intent', 'format', 'read-limit'];
  const options = Object.fromEntries(names.map(name => [name, { type: 'string' }]));
  options.help = { type: 'boolean' }; options['csv-headers'] = { type: 'boolean' };
  const { values, positionals } = parseArgs({ args, options, strict: true, allowPositionals: true });
  if (values.help) { process.stdout.write(HELP + '\n'); return 0; }
  need(positionals.length === 1, 'AGENTLEDGER_ACTION_REQUIRED');
  const action = positionals[0], controller = new AbortController(), signal = controller.signal;
  const abort = () => controller.abort(); process.once('SIGINT', abort); process.once('SIGTERM', abort);
  try {
    if (action === 'capture' || action === 'import') {
      const input = { directory: absolute(values.directory), source: values.source, signal };
      const snapshot = action === 'capture' ? await captureAgentLedgerSnapshot(input) :
        await importAgentLedgerSnapshot({ ...input, inputFile: absolute(values.file), observedAt: values['observed-at'] });
      json(snapshot); return 0;
    }
    if (action === 'snapshot') {
      json(await openAgentLedgerSnapshot({ directory: absolute(values.directory), expectedSha256: values.sha256 })); return 0;
    }
    if (action === 'compare') {
      const previous = await openAgentLedgerSnapshot({ directory: absolute(values.previous) });
      const next = await openAgentLedgerSnapshot({ directory: absolute(values.next) });
      json(compareAgentLedgerSnapshots(previous, next)); return 0;
    }
    if (action === 'delivery' || action === 'delivery-read') {
      const delivery = await openAgentLedgerDelivery({ directory: absolute(values.directory),
        expectedTaskSha256: values.sha256, signal });
      if (action === 'delivery') json(delivery);
      else await read(delivery.response(values.intent), values, signal);
      return 0;
    }
    need(['preview', 'create', 'task', 'receive', 'read', 'compare-tasks'].includes(action),
      'AGENTLEDGER_ACTION_INVALID');
    const buyer = new Buyer({ runtimeDirectory: absolute(values.runtime), stateDirectory: absolute(values.state) });
    const inbox = buyer.inbox(absolute(values.inbox));
    if (action === 'preview' || action === 'create') {
      const spec = await readJson(absolute(values.spec), 32 * 1024 * 1024);
      const snapshot = await openAgentLedgerSnapshot({ directory: absolute(spec.snapshot),
        expectedSha256: spec.snapshotSha256 });
      const input = { inbox, snapshot, agent: spec.agent, task: spec.task, selections: spec.selections,
        predecessor: spec.predecessor, signal };
      if (action === 'preview') {
        const preview = await previewAgentLedgerTask(input);
        if (values.output) await writeJson(absolute(values.output), preview, { exclusive: true });
        json(preview);
      } else json(await createAgentLedgerTask({ ...input, directory: absolute(values.directory),
        expectedPreviewSha256: values['preview-sha256'] }));
      return 0;
    }
    if (action === 'compare-tasks') {
      const previous = await openAgentLedgerTask({ inbox, directory: absolute(values.previous) });
      const next = await openAgentLedgerTask({ inbox, directory: absolute(values.next) });
      json(compareAgentLedgerTasks(previous, next)); return 0;
    }
    const task = await openAgentLedgerTask({ inbox, directory: absolute(values.directory), expectedSha256: values.sha256 });
    if (action === 'task') json(await task.inspect({ signal }));
    else if (action === 'receive') json(await task.receive({ directory: absolute(values.output), signal }));
    else await read(await task.originalTask.response(values.intent, { signal }), values, signal);
    return signal.aborted ? 130 : 0;
  } catch (error) { if (signal.aborted) return 130; throw error; }
  finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await main(); }
  catch (error) {
    process.stderr.write(JSON.stringify({ error: error.code ?? 'AGENTLEDGER_COMMAND_FAILED',
      ...(error.commandDirectory ? { commandDirectory: error.commandDirectory } : {}) }) + '\n');
    process.exitCode = ['TASK_RESULTS_PENDING', 'AGENTLEDGER_RESULT_PENDING',
      'AGENTLEDGER_ORIGINAL_CAPTURE_BYTES_REQUIRED'].includes(error.code) ? 2 : 1;
  }
}
