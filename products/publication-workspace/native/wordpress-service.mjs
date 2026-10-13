// Apache-2.0. Keep the selected original WordPress engine alive for its managed service.
import {readFile, open, stat} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {createHash} from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const need = (value, message) => { if (!value) throw new Error(message); };
const json = value => Buffer.from(JSON.stringify(value) + '\n');

export async function run(context) {
  const selected = process.env.TJL_PUBLICATION_PROCESS_INPUT;
  need(typeof selected === 'string' && selected.startsWith('/'), 'Select the original private publication process metadata.');
  const raw = await readFile(selected), identity = JSON.parse(raw);
  need(identity.schema === 'stellar-forge.publication-process.v1' && identity.role === 'wordpress' &&
    Number.isSafeInteger(identity.pid) && String(identity.pid) === process.env.TJL_PUBLICATION_PARENT_PID &&
    identity.native_runtime === resolve(context.runtime) && identity.native_runtime === resolve(context.sitePath, '..'),
    'The original WordPress engine and selected installation disagree.');
  const source = new URL(import.meta.url);
  const script = await readFile(source);
  need(script.length > 0, 'The selected managed WordPress exercise is absent.');
  const inputInfo = await stat(selected), parent = await stat(dirname(selected));
  need(inputInfo.isFile() && (inputInfo.mode & 0o077) === 0 && (parent.mode & 0o077) === 0,
    'Keep original process metadata in the selected private operation directory.');
  const url = new URL(context.origin);
  need(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) &&
    !url.username && !url.password && !url.search && !url.hash && url.port,
    'The original engine announced an invalid local WordPress origin.');
  const ready = {...identity, origin: url.origin, url: url.origin + '/wp-admin/',
    wordpress_service_sha256: hash(script)};
  need(dirname(identity.ready_file) === dirname(selected), 'Keep the original selected process output directory.');
  const file = await open(identity.ready_file, 'wx', 0o600);
  try { await file.writeFile(json(ready)); await file.sync(); } finally { await file.close(); }
  const parentHandle = await open(dirname(identity.ready_file), 'r');
  try { await parentHandle.sync(); } finally { await parentHandle.close(); }
  const {url: privateURL, ...announcement} = ready;
  context.print(announcement);
  // The selected native setup called this original exercise after plugin/theme
  // activation. Resolving only on the inherited shutdown signal lets its own
  // finally block dispose WordPress and its original database.
  await new Promise(resolveDone => {
    const stop = () => {
      process.removeListener('SIGTERM', stop);
      process.removeListener('SIGINT', stop);
      resolveDone();
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  });
}
