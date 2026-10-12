// MIT. Original OData authoring, live merchant and receiving in managed Applications.
import { join } from 'node:path';
import { inspectMerchantRuntime } from '../../../sf46-release/runtime-package.mjs';
import { absolute, plain, need, canonical, digest, json, processIdentity } from '../../../distribution/runtime-workspace/storage.mjs';
import { namespaceProcessIdentity } from '../../../distribution/runtime-workspace/process-identity.mjs';
const originalIdentity = async pid => await processIdentity(pid) ?? await namespaceProcessIdentity(pid);
import { ODATA_STARTUP, ODATA_PROBE, ODATA_LAUNCH_FILE, odataWorkspaceIdentity,
  odataLiveIdentity, odataPrivateJson, odataLoopback } from './startup.mjs';

const SOURCE = 'stellar/scf-starforge-20261009/sf30-seller-sdk/odata/';
const same = (left, right) => digest(json(canonical(left))) === digest(json(canonical(right)));
const field = (name, label, type = 'path', required = false, description = '') =>
  ({ name, label, type, required, description });

export function odataApplication(common) {
  return {
    id: 'odata', command: 'dataset', title: 'OData source and live merchant', terminal: false,
    requiredSource: SOURCE + 'live/startup.mjs',
    description: 'Reopen source metadata, saved queries, retained editions, live paid pages, buyer handoffs, received records and configured collection subscriptions in the original OData workspace.',
    fields: [
      field('workspaceDirectory', 'Private OData workspace', 'path', true,
        'Use the original or received workspace, or create one directory in an existing private parent.'),
      field('liveServiceId', 'Saved live service to reopen', 'text', false,
        'Optional service ID already prepared in this workspace. It starts with the workspace and stops with the managed application.'),
      field('subscriptionConnection', 'Private subscription connection', 'path', false,
        'Optional original connection file. Review its named publishers, customers, complete collections, receiving inputs and export directory; reopen them with this application.'),
      ...common,
    ],
  };
}

export async function prepareODataApplication(settings, { inputPath, runtimeDirectory } = {}) {
  const directory = absolute(settings.workspaceDirectory);
  const folder = await inputPath(directory, 'directory', true, true), inputs = [folder];
  const identity = await odataWorkspaceIdentity(directory, { optional: true });
  const runtime = await inspectMerchantRuntime(runtimeDirectory, { load: false });
  for (const name of ['cli.mjs', 'server.mjs', 'live/startup.mjs', 'live/applications.mjs'])
    inputs.push(await inputPath(join(runtime.sourceRoot, SOURCE, name), 'file'));
  const args = ['odata', '--workspace', directory, 'serve', '--expected-workspace-identity', identity?.sha256 ?? 'new'];
  let live = null;
  if (settings.liveServiceId) {
    need(identity, 'APPLICATION_ODATA_LIVE_WORKSPACE_REQUIRED', 'Prepare a live service in the original workspace first.');
    live = await odataLiveIdentity(directory, settings.liveServiceId);
    for (const [path, kind] of [[live.packageDirectory, 'directory'],
      [join(live.packageDirectory, '..', 'profile.json'), 'file'], [join(live.packageDirectory, 'package.json'), 'file']])
      inputs.push(await inputPath(path, kind, false, true));
    args.push('--live-service', live.id, '--expected-live-identity', live.sha256);
  }
  let subscriptions = null;
  if (settings.subscriptionConnection) {
    const { odataSubscriptionSelection } = await import('./subscriptions/managed.mjs');
    const selected = await odataSubscriptionSelection(absolute(settings.subscriptionConnection));
    subscriptions = selected.identity;
    const connectionInput = await inputPath(subscriptions.path, 'file', false, true);
    need(connectionInput.sha256 === subscriptions.sha256 && connectionInput.bytes === subscriptions.bytes,
      'APPLICATION_ODATA_SUBSCRIPTIONS_CHANGED');
    inputs.push(connectionInput);
    const paths = new Set(inputs.map(value => value.path));
    for (const group of ['publishers', 'customers', 'collections', 'inputs']) {
      for (const value of Object.values(selected.configuration[group])) {
        if (paths.has(value.directory)) continue;
        inputs.push(await inputPath(value.directory, 'directory',
          group === 'publishers' || group === 'customers', true));
        paths.add(value.directory);
      }
    }
    if (!paths.has(selected.configuration.exportsDirectory))
      inputs.push(await inputPath(selected.configuration.exportsDirectory, 'directory', true, true));
    for (const name of ['live/subscriptions/managed.mjs', 'live/subscriptions/operator.mjs',
      'live/subscriptions/server.mjs', 'live/subscriptions/browser-assets.json']) {
      const path = join(runtime.sourceRoot, SOURCE, name);
      if (!paths.has(path)) inputs.push(await inputPath(path, 'file'));
    }
    args.push('--subscriptions', subscriptions.path, '--expected-subscriptions-sha256', subscriptions.sha256);
  }
  return { args, inputs, createDirectories: folder.exists ? [] : [directory],
    identity: { workspace: identity, live, subscriptions } };
}

function selected(request, name, optional = false) {
  need(Array.isArray(request.args) && request.args[0] === 'odata' && request.args.includes('serve'),
    'APPLICATION_ODATA_STARTUP_CHANGED');
  const positions = request.args.flatMap((value, index) => value === name ? [index] : []);
  if (optional && positions.length === 0) return null;
  need(positions.length === 1 && typeof request.args[positions[0] + 1] === 'string', 'APPLICATION_ODATA_STARTUP_CHANGED');
  return request.args[positions[0] + 1];
}

async function listener(url) {
  const response = await fetch(new URL('/api/application', url), {
    signal: AbortSignal.timeout(5000), redirect: 'error', headers: { Accept: 'application/json' },
  });
  need(response.ok && response.headers.get('content-type')?.startsWith('application/json'),
    'APPLICATION_ODATA_LISTENER_CHANGED');
  const chunks = []; let bytes = 0;
  try { for await (const chunk of response.body) {
    bytes += chunk.length; need(bytes <= 16384, 'APPLICATION_ODATA_LISTENER_CHANGED'); chunks.push(chunk);
  } } finally { if (bytes > 16384) await response.body?.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Read the original child announcement, private launch record and actual listener together. */
export async function odataStartup(request, operationDirectory, text, context = {}) {
  if (request.command !== 'dataset' || request.args?.[0] !== 'odata' || !request.applicationId ||
    typeof text !== 'string' || text.length > 16384 || !text.startsWith('{')) return null;
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (!plain(value) || value.schema !== ODATA_STARTUP || value.status !== 'ODATA_WORKSPACE_READY') return null;
  absolute(operationDirectory);
  const directory = absolute(selected(request, '--workspace'));
  const expected = selected(request, '--expected-workspace-identity');
  const identity = await odataWorkspaceIdentity(directory);
  need((expected === 'new' || expected === identity.sha256) && same(value.workspace, identity),
    'APPLICATION_ODATA_WORKSPACE_CHANGED');
  const saved = await odataPrivateJson(join(directory, ODATA_LAUNCH_FILE));
  need(same(saved.value, value), 'APPLICATION_ODATA_STARTUP_CHANGED');
  const liveId = selected(request, '--live-service', true), expectedLive = selected(request, '--expected-live-identity', true);
  need(Boolean(liveId) === Boolean(expectedLive), 'APPLICATION_ODATA_LIVE_CHANGED');
  const live = liveId ? await odataLiveIdentity(directory, liveId) : null;
  need(live ? live.sha256 === expectedLive && plain(value.live) &&
    Object.entries(live).every(([key, item]) => same(value.live[key], item)) : value.live === null,
  'APPLICATION_ODATA_LIVE_CHANGED');
  const connection = selected(request, '--subscriptions', true);
  const expectedSubscriptions = selected(request, '--expected-subscriptions-sha256', true);
  need(Boolean(connection) === Boolean(expectedSubscriptions), 'APPLICATION_ODATA_SUBSCRIPTIONS_CHANGED');
  let subscriptions = null;
  if (connection) {
    const { odataSubscriptionSelection } = await import('./subscriptions/managed.mjs');
    subscriptions = (await odataSubscriptionSelection(absolute(connection),
      { expectedSha256: expectedSubscriptions })).identity;
  }
  need(same(value.subscriptions ?? null, subscriptions), 'APPLICATION_ODATA_SUBSCRIPTIONS_CHANGED');
  need(Number.isSafeInteger(context.pid) && context.pid > 0 && plain(value.process),
    'APPLICATION_ODATA_CHILD_REQUIRED');
  const original = value.process;
  need(Number.isSafeInteger(original.pid) && Number.isSafeInteger(original.ppid) &&
    (original.pid === context.pid || original.ppid === context.pid) &&
    typeof original.start === 'string' && original.start === await originalIdentity(original.pid) &&
    await originalIdentity(context.pid), 'APPLICATION_ODATA_CHILD_CHANGED');
  const selectedPort = Number(selected(request, '--port', true) ?? 0);
  need(Number.isInteger(selectedPort) && selectedPort >= 0 && selectedPort <= 65535, 'APPLICATION_PORT_INVALID');
  const url = odataLoopback(value.url, selectedPort), observed = await listener(url);
  need(observed.schema === ODATA_PROBE && same(observed.workspace, identity) && same(observed.process, original),
    'APPLICATION_ODATA_LISTENER_CHANGED');
  need(same(observed.subscriptions ?? null, subscriptions), 'APPLICATION_ODATA_SUBSCRIPTIONS_CHANGED');
  const links = [];
  if (live) {
    const merchant = odataLoopback(value.live.url), operations = odataLoopback(value.live.operationsUrl);
    links.push({ id: 'odata-merchant', label: 'Open live merchant', url: new URL('/_seller/docs', merchant).href },
      { id: 'odata-operations', label: 'Open merchant operations', url: operations });
  }
  if (subscriptions) links.push({ id: 'odata-subscriptions', label: 'Open subscriptions',
    url: new URL('/subscriptions/', url).href });
  return { url, links, original: { schema: ODATA_STARTUP, launchId: value.launchId,
    workspace: identity, process: original, live: value.live, subscriptions } };
}
