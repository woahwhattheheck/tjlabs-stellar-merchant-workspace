// MIT. Reporting Programmes in the maintained Applications lifecycle.
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import { readBrowserAssets } from '../../../stellar/scf-starforge-20261009/distribution/browser-assets.mjs';
import {
  APPLICATION_PROVIDER_SCHEMA, applicationPrivateUrl, observeApplicationStartup,
} from '../../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import { REPORTING_ENTRY, REPORTING_STARTUP } from './workbench-server.mjs';

const PRODUCT = 'products/source-tables/reporting/';
const SITE = 'stellar-forge/developer-site/';
const REQUIRED = [
  REPORTING_ENTRY, '/products/source-tables/reporting/workbench.mjs',
  '/products/source-tables/reporting/workbench.css',
  '/products/source-tables/reporting/workbench-model.mjs',
  '/products/source-tables/reporting/WORKBENCH.md',
  '/products/source-tables/reporting/programme.mjs',
  '/products/source-tables/reporting/desk-receive.mjs',
  '/source-tables.html', '/source-tables.mjs', '/source-tables.css',
  '/source-table-workspace.mjs', '/onboarding.mjs',
];
const need = (value, message) => { if (!value) throw new Error(message); };

export async function prepareReportingApplication(settings, { inputPath, runtimeDirectory }) {
  const runtime = await inspectMerchantRuntime(resolve(runtimeDirectory), { load: false, source: false });
  const manifestPath = join(runtime.sourceRoot, SITE, 'browser-assets.json');
  const assets = await readBrowserAssets(pathToFileURL(manifestPath));
  for (const route of REQUIRED)
    need(assets.has(route), 'The installed Reporting Programmes application is missing its declared asset: ' + route);
  const paths = new Set([
    manifestPath, join(runtime.sourceRoot, SITE, 'serve.mjs'),
    join(runtime.sourceRoot, PRODUCT, 'programme-cli.mjs'),
    join(runtime.sourceRoot, PRODUCT, 'workbench-server.mjs'),
    join(runtime.sourceRoot, PRODUCT, 'workbench-application.mjs'),
    join(runtime.sourceRoot, PRODUCT, 'REPORTING_PROGRAMMES.md'),
  ]);
  // The complete selected reporting source and every unchanged browser dependency
  // are pinned in the original saved application request.
  for (const [route, asset] of assets) {
    if (REQUIRED.includes(route) || route.startsWith('/products/source-tables/reporting/') ||
        route.startsWith('/stellar-forge/developer-site/dist/') ||
        /^\/source-(?:table|tables|document|delimited)/.test(route))
      paths.add(fileURLToPath(asset.url));
  }
  const inputs = [];
  for (const path of paths) inputs.push(await inputPath(path, 'file'));
  return { args: ['serve'], inputs, createDirectories: [] };
}

export async function reportingStartup(request, text) {
  if (request.command !== 'reporting-programme' || !Array.isArray(request.args) ||
      request.args[0] !== 'serve' || typeof text !== 'string' || text.length > 16384 ||
      !text.startsWith('{"schema":"' + REPORTING_STARTUP + '",')) return null;
  let ready;
  try { ready = JSON.parse(text); } catch { return null; }
  if (ready.schema !== REPORTING_STARTUP) return null;
  const args = request.args.slice(1);
  need(args.length === 0 || args.length === 2 && args[0] === '--port' &&
    /^(0|[1-9][0-9]{0,4})$/.test(args[1]) && Number(args[1]) <= 65535,
    'The saved Reporting Programmes listener arguments changed.');
  const expectedPort = args.length ? Number(args[1]) : 8787;
  const address = applicationPrivateUrl(ready.url);
  need(address, 'The original reporting listener did not return a private local URL.');
  const url = new URL(address);
  need(url.hostname === '127.0.0.1' && url.pathname === REPORTING_ENTRY &&
    !url.search && !url.hash && Number.isInteger(ready.port) && ready.port > 0 &&
    Number(url.port || 80) === ready.port && (!expectedPort || ready.port === expectedPort) &&
    Number.isInteger(ready.assets) && ready.assets >= REQUIRED.length,
    'The reporting listener differs from the saved original application.');
  const expected = await readFile(new URL('./workbench.html', import.meta.url));
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  need(response.ok && /^text\/html(?:;|$)/i.test(response.headers.get('content-type') || ''),
    'The original Reporting Programmes page did not open.');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    need(bytes <= expected.length, 'The reporting listener returned different application bytes.');
    chunks.push(chunk);
  }
  need(Buffer.concat(chunks).equals(expected),
    'The live reporting page differs from its installed complete application source.');
  return { url: url.href, original: ready };
}

export default {
  schema: APPLICATION_PROVIDER_SCHEMA, id: 'reporting-programmes', order: 396,
  catalog({ common }) {
    return [{
      id: 'reporting-programmes', command: 'reporting-programme', title: 'Reporting Programmes',
      terminal: false, requiredSource: PRODUCT + 'programme-cli.mjs',
      description: 'Prepare complete reporting projects, retain original SQL, runs and delivery receipts, receive desk handovers, review tables and reopen full native archives. Keep the same local port to resume saved browser work.',
      fields: common,
    }];
  },
  prepare(type, settings, context) { return prepareReportingApplication(settings, context); },
  matchRequest(request) {
    return !request.pythonCommand && request.command === 'reporting-programme' && request.args?.[0] === 'serve';
  },
  createObserver(request, directory) {
    return observeApplicationStartup(request, directory, text =>
      text.startsWith('{"schema":"' + REPORTING_STARTUP + '",')
        ? () => reportingStartup(request, text) : null);
  },
};
