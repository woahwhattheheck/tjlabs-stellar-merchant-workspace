// MIT. Source-owned Applications entry for the customer's original SF98 receiver.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import { APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup }
  from '../../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import { absolute, need, digest, json, canonical }
  from '../../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

const ENTRY = 'products/merchant-delivery/receiving/managed.mjs';
const STARTUP = 'tjlabs.delivery-receiving-startup.v1';
export function receivingApplication(common = []) {
  return { id: 'delivery-receiving', command: 'delivery-receiving-workspace',
    title: 'Received merchant delivery', terminal: false, requiredSource: ENTRY,
    description: 'Open the original customer receipt and destination history. Review signing references, synchronize retained events, operate signed workers and reopen the same received workspace.',
    fields: [{ name: 'receivedDirectory', label: 'Received delivery directory', type: 'path', required: true,
      description: 'Choose the private SF98 receiving root containing received.json, source/ and workspace/. Current customer destination edits remain in workspace/.' }, ...common] };
}
export async function prepareReceivingApplication(settings, context = {}) {
  const { inputPath, runtimeDirectory, applicationEnvironment } = context;
  need(typeof inputPath === 'function', 'APPLICATION_RECEIVING_INPUT_READER_REQUIRED');
  const runtime = await inspectMerchantRuntime(absolute(runtimeDirectory), { load: false });
  const native = await import(pathToFileURL(join(runtime.sourceRoot, ENTRY)).href);
  const environment = typeof applicationEnvironment === 'function'
    ? (await applicationEnvironment(settings.environmentFile)).environment : process.env;
  const launch = await native.inspectReceivingLaunch({
    receivedDirectory: absolute(settings.receivedDirectory), port: settings.port ?? 0,
  }, { environment });
  const source = await native.inspectReceivingLaunchSource(runtime.sourceRoot);
  const inputs = [];
  for (const directory of launch.directories) {
    const retained = await inputPath(directory.path, 'directory', false, true);
    need(String(retained.dev) === directory.dev && String(retained.ino) === directory.ino,
      'APPLICATION_RECEIVING_DIRECTORY_CHANGED');
    inputs.push(retained);
  }
  for (const file of launch.files) {
    const retained = await inputPath(file.path, 'file');
    need(String(retained.dev) === file.dev && String(retained.ino) === file.ino &&
      retained.bytes === file.bytes && retained.sha256 === file.sha256,
    'APPLICATION_RECEIVING_RECEIPT_CHANGED');
    inputs.push(retained);
  }
  for (const file of source.files) {
    const retained = await inputPath(join(source.sourceRoot, file.name), 'file');
    need(retained.bytes === file.bytes && retained.sha256 === file.sha256,
      'APPLICATION_RECEIVING_SOURCE_CHANGED');
    inputs.push(retained);
  }
  return { args: ['managed', '--received', launch.receivedDirectory,
    '--source-root', runtime.sourceRoot, '--binding', launch.bindingSha256,
    '--expected-source', source.sha256, '--port', String(settings.port ?? 0)],
    inputs, createDirectories: [],
    resourceKey: digest(json(canonical(native.receivingResource(launch.receivedDirectory)))) };
}
export async function receivingStartup(request, text, context = {}) {
  if (request.command !== 'delivery-receiving-workspace' || typeof text !== 'string' ||
      text.length > 32768 || !text.startsWith('{"schema":"' + STARTUP + '",')) return null;
  need(Number.isSafeInteger(context.pid) && context.pid > 0, 'APPLICATION_RECEIVING_CHILD_ID_REQUIRED');
  const sourceRoot = join(absolute(request.releaseDirectory), 'source');
  const native = await import(pathToFileURL(join(sourceRoot, ENTRY)).href);
  let startup;
  try { startup = JSON.parse(text); } catch { need(false, 'APPLICATION_RECEIVING_STARTUP_INVALID'); }
  const selected = native.parseReceivingArguments(request.args);
  need(selected.sourceRoot === sourceRoot, 'APPLICATION_RECEIVING_SELECTED_RUNTIME_CHANGED');
  return native.verifyReceivingStartup(startup, selected, { pid: context.pid });
}
export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'delivery-receiving', order: 1080, appendPort: false,
  catalog({ common }) { return [receivingApplication(common)]; },
  prepare(type, settings, context) { return prepareReceivingApplication(settings, context); },
  resourceKey(type, settings, { hash }) {
    return hash({ family: 'sf98-destinations-workspace', directory: join(settings.receivedDirectory, 'workspace') });
  },
  runArguments({ command, args, requestId }) {
    need(command === 'delivery-receiving-workspace' && args[0] === 'managed' &&
      !args.includes('--operation-id'), 'APPLICATION_RECEIVING_RUN_ARGUMENTS_CHANGED');
    return [...args, '--operation-id', requestId];
  },
  matchRequest(request) { return !request.pythonCommand && request.command === 'delivery-receiving-workspace'; },
  createObserver(request, directory, context) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.startsWith('{"schema":"' + STARTUP + '",')) return null;
      return () => receivingStartup(request, text, context);
    }, { lineLimit: 32768 });
  },
};
