// MIT. Customer stdio adapter for the installed original SF30 dataset handler.
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const schema = 'stellar-forge.customer-native.v1';
const write = value => new Promise((yes, no) =>
  process.stdout.write(JSON.stringify(value) + '\n', error => error ? no(error) : yes()));
let dataset;
try {
  const [handler, config, ...extra] = process.argv.slice(2);
  if (!handler || !config || extra.length)
    throw new TypeError('Use native_dataset.mjs ORIGINAL_DATASET_HANDLER SAVED_DATASET_CONFIG.');
  const installed = await import(pathToFileURL(resolve(handler)).href);
  if (typeof installed.loadDatasetConfig !== 'function')
    throw new TypeError('The installed source does not expose its original loadDatasetConfig.');
  dataset = await installed.loadDatasetConfig(resolve(config));
  await write({ schema, id: 0, status: 200, body: dataset.describe() });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of input) {
    let id = null;
    try {
      if (Buffer.byteLength(line) > 65536) throw new RangeError('Query command exceeds 64 KiB.');
      const command = JSON.parse(line);
      id = command.id;
      if (!Number.isSafeInteger(id) || id < 1 || typeof command.query !== 'string' ||
          Object.keys(command).some(key => !['id', 'query'].includes(key)))
        throw new TypeError('Use an original scalar URL query and request ID.');
      const response = await dataset.handle({ query: new URLSearchParams(command.query) });
      await write({ schema, id, status: response.status, body: response.body });
    } catch (error) {
      await write({ schema, id, status: error.status ?? 400,
        body: { error: error.code ?? 'CUSTOMER_NATIVE_QUERY', message: error.message } });
    }
  }
} catch (error) {
  await write({ schema, id: 0, status: error.status ?? 400,
    body: { error: error.code ?? 'CUSTOMER_NATIVE_OPEN', message: error.message } });
  process.exitCode = 1;
}
