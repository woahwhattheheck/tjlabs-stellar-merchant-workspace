// MIT. Source-owned Applications entry for the original SF82 delivery console.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import { APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup }
  from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import { absolute, need, digest, json, canonical }
  from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

const ENTRY = 'products/merchant-delivery/managed.mjs';
const STARTUP = 'tjlabs.merchant-delivery-startup.v1';
export function deliveryApplication(common = []) {
  return { id: 'merchant-delivery', command: 'merchant-delivery-workspace',
    title: 'Merchant delivery and releases', terminal: false, requiredSource: ENTRY,
    description: 'Open one original seller release store, operate signed settlement destinations, retain complete customer transfers and reopen the same release and delivery history.',
    fields: [{ name: 'releaseStore', label: 'Original seller release store', type: 'path', required: true,
      description: 'Choose the initialized private SF82 store. Its releases, settlement journal, destinations and customer transfers remain in this directory.' }, ...common] };
}
export async function prepareDeliveryApplication(settings, { inputPath, runtimeDirectory } = {}) {
  need(typeof inputPath === 'function', 'APPLICATION_DELIVERY_INPUT_READER_REQUIRED');
  const runtime = await inspectMerchantRuntime(absolute(runtimeDirectory), { load: false });
  const native = await import(pathToFileURL(join(runtime.sourceRoot, ENTRY)).href);
  const workspace = await native.inspectDeliveryWorkspace({ releaseStore: absolute(settings.releaseStore) });
  const source = await native.inspectDeliveryLaunchSource(runtime.sourceRoot);
  const root = await inputPath(workspace.releaseStore, 'directory', false, true);
  const releases = await inputPath(join(workspace.releaseStore, 'releases'), 'directory', false, true);
  need(String(root.dev) === workspace.root.dev && String(root.ino) === workspace.root.ino &&
    String(releases.dev) === workspace.releases.dev && String(releases.ino) === workspace.releases.ino,
  'APPLICATION_DELIVERY_STORE_CHANGED');
  const inputs = [root, releases];
  for (const file of source.files) {
    const retained = await inputPath(join(source.sourceRoot, file.name), 'file');
    need(retained.bytes === file.bytes && retained.sha256 === file.sha256,
      'APPLICATION_DELIVERY_SOURCE_CHANGED');
    inputs.push(retained);
  }
  return { args: ['--store', workspace.releaseStore, '--source-root', runtime.sourceRoot,
    '--expected-store', workspace.sha256, '--expected-source', source.sha256,
    '--port', String(settings.port ?? 0)], inputs, createDirectories: [],
    resourceKey: digest(json(canonical({ family: 'sf82-release-console', directory: workspace.releaseStore }))) };
}
export async function deliveryStartup(request, text, context = {}) {
  if (request.command !== 'merchant-delivery-workspace' || typeof text !== 'string' ||
      text.length > 32768 || !text.startsWith('{"schema":"' + STARTUP + '",')) return null;
  const sourceRoot = join(absolute(request.releaseDirectory), 'source');
  const native = await import(pathToFileURL(join(sourceRoot, ENTRY)).href);
  let startup;
  try { startup = JSON.parse(text); } catch { need(false, 'APPLICATION_DELIVERY_STARTUP_INVALID'); }
  const selected = native.parseDeliveryArguments(request.args);
  need(selected.sourceRoot === sourceRoot, 'APPLICATION_DELIVERY_SELECTED_RUNTIME_CHANGED');
  return native.verifyDeliveryStartup(startup, selected, context.pid ? { pid: context.pid } : {});
}
export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'merchant-delivery', order: 1070,
  appendPort: false,
  catalog({ common }) { return [deliveryApplication(common)]; },
  prepare(type, settings, context) { return prepareDeliveryApplication(settings, context); },
  resourceKey(type, settings, { hash }) { return hash({ family: 'sf82-release-console', directory: settings.releaseStore }); },
  runArguments({ command, args, requestId }) {
    need(command === 'merchant-delivery-workspace' && !args.includes('--operation-id'),
      'APPLICATION_DELIVERY_RUN_ARGUMENTS_CHANGED');
    return [...args, '--operation-id', requestId];
  },
  matchRequest(request) { return !request.pythonCommand && request.command === 'merchant-delivery-workspace'; },
  createObserver(request, directory, context) {
    return observeApplicationStartup(request, directory, text => {
      if (!text.startsWith('{"schema":"' + STARTUP + '",')) return null;
      return () => deliveryStartup(request, text, context);
    }, { lineLimit: 32768 });
  },
};
