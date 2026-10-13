// MIT. Reporting Programmes in the original declared-asset listener.
import { startSetupServer } from '../../../stellar-forge/developer-site/serve.mjs';

export const REPORTING_ENTRY = '/products/source-tables/reporting/workbench.html';
export const REPORTING_STARTUP = 'stellar-forge.reporting-programme-listener.v1';

export async function startReportingWorkbench({ port = 8787 } = {}) {
  return startSetupServer({ port, entry: REPORTING_ENTRY });
}

export async function serveReportingWorkbench({ port = 8787 } = {}) {
  const listener = await startReportingWorkbench({ port });
  const close = () => listener.stop().catch(error => {
    process.stderr.write(JSON.stringify({ error: error.code || error.name, message: error.message }) + '\n');
    process.exitCode = 1;
  });
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  listener.server.once('close', () => {
    process.off('SIGINT', close);
    process.off('SIGTERM', close);
  });
  process.stdout.write(JSON.stringify({
    schema: REPORTING_STARTUP, url: listener.url, host: '127.0.0.1',
    port: listener.port, source: 'products/source-tables/reporting/workbench.html',
    assetManifest: 'stellar-forge/developer-site/browser-assets.json', assets: listener.assets,
  }) + '\n');
  return listener;
}
