// MIT. Read the original SF47 managed launch without opening its SQLite workspace.
import { constants } from 'node:fs';
import { open, lstat, realpath, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { get } from 'node:http';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GRANT_LAUNCH_SCHEMA = 'stellar-forge.sf47.workspace-launch.v1';
export const GRANT_SELECTION_SCHEMA = 'stellar-forge.sf47.workspace-selection.v1';
// Includes both original and executed complete source-hash maps.
export const GRANT_MAX_LAUNCH_BYTES = 256 * 1024;
const SOURCE = dirname(fileURLToPath(import.meta.url));
// The reviewed release includes every original operating module and its mounted UI.
const BOOT_FILES = [
  'staff_access.py',
  'staff_http.py',
  'staff_installation.py',
  'staff-session.mjs',
  'staff.html',
  'staff.mjs',
  'staff.css',
  'STAFF_ACCESS.md',
  'STAFF_INSTALLATION.md',
  'STAFF_INSTALLATION_RECEIVING.py',
  '../budget.py',
  'cli.py',
  'server.py',
  'model.py',
  'plan_comparison.py',
  'plan_comparison.mjs',
  'plan_comparison.css',
  'source_tables.py',
  'source_workbooks.py',
  'source-workbooks.mjs',
  'source-workbook-export.mjs',
  'WORKBOOK_HANDOVER.md',
  '../../../scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/workbook/reader.py',
  'source-tables-core.mjs',
  'source-tables-agent.mjs',
  'SOURCE_TABLES_AGENT.md',
  'source-tables.mjs',
  'source-tables.css',
  'source-tables-cli.mjs',
  'SOURCE_TABLES.md',
  '../../../../stellar-forge/developer-site/dist/source-table-workspace.mjs',
  '../../../../stellar-forge/developer-site/dist/onboarding.mjs',
  '../../../../stellar-forge/developer-site/dist/offer.mjs',
  '../../../../stellar-forge/developer-site/dist/grant-plan-core.mjs',
  '../../../../stellar-forge/developer-site/dist/grant-plan-source.mjs',
  'launcher.mjs',
  'launch.mjs',
  'managed_launch.py',
  'workshare_intake.py',
  'operations.py',
  'operations_funding.py',
  'operations_funding_cli.py',
  'operations_funding_requests.mjs',
  'operations_funding.mjs',
  'operations_funding.css',
  'COST_FUNDING.md',
  'issuer_correspondence.py',
  'operate_correspondence_intake.py',
  'ISSUER_CORRESPONDENCE.md',
  'issuer_receiving.py',
  'award_terms.py',
  'award_terms_http.py',
  'award_terms_cli.py',
  'award-terms.mjs',
  'award-terms.css',
  'AWARD_TERMS.md',
  'operations_task_outcomes.py',
  'operations_task_outcomes.mjs',
  'operations_task_outcomes.css',
  'operations_work_intake.py',
  'operations_work_intake.mjs',
  'operations_work_intake.css',
  'operations_domain.py',
  'operations_engagements.py',
  'engagement_handover.py',
  'operations_amendments.py',
    'operations_amendment_calendar.py',
    'operations_amendment_calendar.mjs',
  'operations_amendments.mjs',
  'operations_amendments.css',
  'operations_statements.py',
  'operations_statement_formats.py',
  'statement_parsers/__init__.py',
  'statement_parsers/ofx_intake.py',
  'statement_parsers/mt940_engine.py',
  'operations_statements.mjs',
  'operations_statements.css',
  'operations_http.py',
  'operations_cli.py',
  'operations_intake.py',
  'operations_support.py',
  'operations_buyer.py',
  'operations_commercial_receivables.py',
  'operations_commercial_adapter.py',
  'operations_commercial_http.py',
  'operations_commercial_cli.py',
  'node_commercial_receivables.mjs',
  'operations_commercial.mjs',
  'operations_commercial.css',
  '../../../scf-starforge-20261009/merchant-settlement-accounting/receivables/client.mjs',
  'operations_completion.py',
  'operations_calendar.py',
  'operations_use_calendar.py',
  'operations_use_calendar.mjs',
  'operations_use_calendar.css',
  'operations_cohort.py','operations_implementation.py',
  'operations_installations.py',
  'operations_installation_returns.py',
  'operations_installation_returns_cli.py',
  'operations_installation_returns.mjs',
  'operations_installation_returns.css',
  'operations_dispatch.py',
  'operations_performance.py',
  'operations_ledger_intake.py',
  'operations_payables.py',
  'operations_cash_accounts.py',
  'operations_account_reconciliation.py',
  'ACCOUNT_RECONCILIATION.md',
  'operations_commercial_installations.py',
  'operations_commercial_installations.mjs',
  'operations_commercial_installations.css',
  'commercial_installation_source.mjs',
  '../../../scf-starforge-20261009/merchant-settlement-accounting/adjustments.mjs',
  '../../../scf-starforge-20261009/merchant-settlement-accounting/customer-statements/core.mjs',
  '../../../scf-starforge-20261009/merchant-settlement-accounting/customer-statements/native-usage.mjs',
  '../../../scf-starforge-20261009/merchant-settlement-accounting/customer-statements/period-usage.mjs',
  '../../../scf-starforge-20261009/merchant-settlement-accounting/reconcile.mjs',
  '../../../scf-starforge-20261009/merchant-settlement-accounting/recovery.mjs',
  '../../../scf-starforge-20261009/sf30-seller-sdk/http-methods.mjs',
  '../../../scf-starforge-20261009/sf30-seller-sdk/operations/history.mjs',
  '../../../scf-starforge-20261009/sf30-seller-sdk/route-path.mjs',
  '../../../scf-starforge-20261009/sf30-seller-sdk/seller.mjs',
  '../../../scf-starforge-20261009/sf31-buyer-client/public-transport.mjs',
  '../../../scf-starforge-20261009/sf31-buyer-client/request-body.mjs',
  '../../../scf-starforge-20261009/sf43-agent-commerce/verify.mjs',
  '../../../scf-starforge-20261009/sf74-merchant-support-console/case-commercial-implementation.mjs',
  '../../../scf-starforge-20261009/sf74-merchant-support-console/commercial-pricing.mjs',
  '../../../scf-starforge-20261009/sf74-merchant-support-console/commercial-quote.mjs',
  '../../../scf-starforge-20261009/sf74-merchant-support-console/commercial/tariff-performance.mjs',
  '../../../scf-starforge-20261009/sf74-merchant-support-console/commercial/tariff-source.mjs',
  '../../../scf-starforge-20261009/sf74-merchant-support-console/commissioning.mjs',
  '../../../scf-starforge-20261009/sf74-merchant-support-console/object-runtime.mjs',
  '../../../scf-starforge-20261009/sf74-merchant-support-console/runtime-support.mjs',
  '../../../scf-starforge-20261009/sf74-merchant-support-console/service-commitments.mjs',
  '../../../scf-starforge-20261009/sf74-merchant-support-console/service-renewals.mjs',
  '../../../scf-starforge-20261009/sf74-merchant-support-console/source-bundle-reference.mjs',
  '../../../scf-starforge-20261009/sf74-merchant-support-console/workspace-file.mjs',
  '../../../scf-starforge-20261009/sf85-live-402-capture/proxy-connect.mjs',
  '../../../scf-starforge-20261009/sf86-rpc-transfer-reconcile/networks.json',
  '../../../scf-starforge-20261009/sf86-rpc-transfer-reconcile/rpc-transport.mjs',
  '../../../scf-starforge-20261009/sf86-rpc-transfer-reconcile/terms.mjs',
  '../../../scf-starforge-20261009/sf86-rpc-transfer-reconcile/verify.mjs',
  '../../../scf-starforge-20261009/sf88-operator-buyer-cli/package.json',
  '../../../scf-starforge-20261009/sf93-seller-support-bundle/object-observation.mjs',
  '../../../scf-starforge-20261009/sf97-merchant-revenue-ops/analyze.mjs',
  '../../../scf-starforge-20261009/sf97-merchant-revenue-ops/economics/common.mjs',
  '../../../scf-starforge-20261009/sf97-merchant-revenue-ops/economics/engine.mjs',
  '../../../scf-starforge-20261009/sf97-merchant-revenue-ops/economics/inputs.mjs',
  '../../../scf-starforge-20261009/sf97-merchant-revenue-ops/economics/limits-contracts.mjs',
  '../../../scf-starforge-20261009/sf97-merchant-revenue-ops/native-reconcile.mjs',
  '../../../scf-starforge-20261009/sf97-merchant-revenue-ops/performance/model.mjs',
  '../../../scf-starforge-20261009/sf97-merchant-revenue-ops/performance/source.mjs',
  '../../../scf-starforge-20261009/sf97-merchant-revenue-ops/planning/scenarios.mjs',
  '../../../scf-starforge-20261009/sf97-merchant-revenue-ops/planning/workspace.mjs',
  '../../../scf-starforge-20261009/sf97-merchant-revenue-ops/tariffs/model.mjs',
  '../../../scf-starforge-20261009/sf97-merchant-revenue-ops/tariffs/workspace.mjs',
  '../../../scf-starforge-20261009/sf98-merchant-delivery/outbox.mjs',
  'COMMERCIAL_INSTALLATIONS.md',
  'operations_workshare_installations.py',
  'operations_workflow_source.py',
  'operations_installation_workflows.py',
  'operations_installation_workflows.mjs',
  'forecast.py',
  'forecast_currency.py',
  'portfolio.py',
  'portfolio_installations.py',
  'portfolio_schedule.py',
  'index.html',
  'app.mjs',
  'style.css',
  'operations.mjs',
  'operations.css',
  'operations_engagements.mjs',
  'operations_engagements.css',
  'operations_support.mjs',
  'operations_buyer.mjs',
  'operations_buyer.css',
  'operations_completion.mjs',
  'operations_completion.css',
  'operations_calendar.mjs',
  'operations_calendar.css',
  'operations_cohort.mjs',
  'cohort_planning.mjs',
  'cohort_planning_calendar.mjs',
  'cohort_planning_scheduling.mjs',
  'cohort_planning_cli.mjs',
  'operations_cohort_planning.mjs',
  'operations_cohort_planning.css',
  'operations_cohort.css','operations_implementation.mjs','operations_implementation.css',
  'operations_installations.mjs',
  'operations_installations.css',
  'operations_dispatch.mjs',
  'operations_dispatch.css',
  'operations_performance.mjs',
  'operations_ledger_intake.mjs',
  'operations_ledger_intake.css',
  'operations_payables.mjs',
  'operations_payables.css',
  'operations_cash_accounts.mjs',
  'operations_cash_accounts.css',
  'operations_account_reconciliation.mjs',
  'operations_account_reconciliation.css',
  'operations_performance.css',
  'forecast.mjs',
  'forecast_currency.mjs',
  'forecast.css',
  'portfolio.mjs',
  'portfolio_installation_plans.mjs',
  'portfolio.css',
  'support_handoff.mjs','implementation_handoff.mjs',
  'buyer_handoff.mjs',
  'node_buyer_handoff.mjs',
  'agent-client.mjs',
  'agent-contracts.mjs'
];
const HASH = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message = code) => Object.assign(new Error(message), {code, status:409});
const need = (test, code, message) => { if (!test) throw fail(code, message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function ordered(value) {
  return plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]))
    : Array.isArray(value) ? value.map(ordered) : value;
}
const canonical = value => JSON.stringify(ordered(value));
function absolute(value) {
  need(typeof value === 'string' && isAbsolute(value) && !value.includes('\0'),
    'GRANT_ABSOLUTE_PATH_REQUIRED');
  return resolve(value);
}
async function regular(path, maximum, privateOnly = false) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const first = await handle.stat();
    need(first.isFile() && first.size <= maximum, 'GRANT_REGULAR_FILE_REQUIRED');
    if (privateOnly) need(first.nlink === 1 && !(first.mode & 0o077) &&
      (process.getuid === undefined || first.uid === process.getuid()), 'GRANT_PRIVATE_LAUNCH_REQUIRED');
    const bytes = await handle.readFile();
    const after = await handle.stat();
    need(first.dev === after.dev && first.ino === after.ino && first.size === after.size &&
      first.mtimeMs === after.mtimeMs && first.ctimeMs === after.ctimeMs && bytes.length === first.size,
    'GRANT_FILE_CHANGED_DURING_READ');
    return bytes;
  } finally { await handle.close(); }
}
async function privateDirectory(path) {
  const info = await lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && !(info.mode & 0o077) &&
    (process.getuid === undefined || info.uid === process.getuid()) && await realpath(path) === path,
  'GRANT_PRIVATE_WORKSPACE_REQUIRED', 'Choose the original private workspace or a private receiving parent.');
}
export async function inspectGrantWorkspaceSelection({workspaceDirectory, scenarioFile, pythonExecutable} = {}) {
  const sourceDirectory = await realpath(SOURCE);
  const workspace = absolute(workspaceDirectory);
  need(await realpath(dirname(workspace)) === dirname(workspace), 'GRANT_REAL_WORKSPACE_PARENT_REQUIRED');
  try { await privateDirectory(workspace); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await privateDirectory(dirname(workspace));
  }
  const scenario = absolute(scenarioFile ?? join(sourceDirectory, '..', 'sf10_current_candidate.json'));
  need(await realpath(scenario) === scenario, 'GRANT_REAL_SCENARIO_REQUIRED');
  const executable = absolute(pythonExecutable);
  const pythonRealPath = await realpath(executable);
  await access(executable, constants.X_OK);
  const sourceSha256 = {};
  for (const name of BOOT_FILES)
    sourceSha256[name] = sha(await regular(resolve(sourceDirectory, name), 1024 * 1024));
  const selection = {
    schema:GRANT_SELECTION_SCHEMA, workspaceDirectory:workspace, sourceDirectory,
    scenarioFile:scenario, scenarioSha256:sha(await regular(scenario, 32 * 1024 * 1024)),
    pythonExecutable:executable, pythonRealPath, sourceSha256,
  };
  return {selection, selectionSha256:sha(Buffer.from(canonical(selection))),
    sourceFiles:BOOT_FILES.map(name => resolve(sourceDirectory, name))};
}
function originUrl(value, port) {
  need(typeof value === 'string' && value.length <= 1024, 'GRANT_STARTUP_URL_INVALID');
  const url = new URL(value);
  need(url.protocol === 'http:' && url.hostname === '127.0.0.1' && !url.username &&
    !url.password && !url.hash && !url.search && url.pathname === '/' &&
    Number(url.port || 80) >= 1 && Number(url.port || 80) <= 65535 &&
    (port === 0 || Number(url.port || 80) === port), 'GRANT_STARTUP_URL_INVALID');
  return url;
}
function probe(url, token) {
  return new Promise((resolveResult, reject) => {
    const request = get(new URL('/api/access', url), {
      headers:{Authorization:'Bearer ' + token, Accept:'application/json'},
      maxHeaderSize:16384, agent:false,
    }, response => {
      const chunks = []; let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > GRANT_MAX_LAUNCH_BYTES) { request.destroy(fail('GRANT_STARTUP_RESPONSE_TOO_LARGE')); return; }
        chunks.push(chunk);
      });
      response.once('error', reject);
      response.once('aborted', () => reject(fail('GRANT_STARTUP_UNAVAILABLE')));
      response.once('end', () => {
        try {
          need(response.statusCode === 200 && /^application\/json\b/i.test(response.headers['content-type'] ?? ''),
            'GRANT_STARTUP_UNAVAILABLE');
          resolveResult(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) { reject(error); }
      });
    });
    request.once('error', reject);
    request.setTimeout(4000, () => request.destroy(fail('GRANT_STARTUP_TIMEOUT')));
  });
}
export async function readGrantWorkspaceLaunch({workspaceDirectory, scenarioFile, pythonExecutable,
  selectionSha256, executionSourceDirectory = SOURCE, pid, instanceId, port = 0, announcement} = {}) {
  need(Number.isSafeInteger(port) && port >= 0 && port <= 65535 && HASH.test(selectionSha256 ?? '') &&
    Number.isSafeInteger(pid) && pid > 0 && UUID.test(instanceId ?? ''), 'GRANT_STARTUP_BINDING_INVALID');
  const current = await inspectGrantWorkspaceSelection({workspaceDirectory, scenarioFile, pythonExecutable});
  need(current.selectionSha256 === selectionSha256, 'GRANT_LAUNCH_SELECTION_CHANGED');
  const executionDirectory = absolute(executionSourceDirectory);
  need(await realpath(executionDirectory) === executionDirectory, 'GRANT_EXECUTED_SOURCE_CHANGED');
  const execution = {sourceDirectory:executionDirectory, sourceSha256:{}};
  for (const name of BOOT_FILES)
    execution.sourceSha256[name] = sha(await regular(resolve(executionDirectory, name), 1024 * 1024));
  need(canonical(execution.sourceSha256) === canonical(current.selection.sourceSha256),
    'GRANT_EXECUTED_SOURCE_CHANGED');
  const privateLaunch = join(current.selection.workspaceDirectory, 'managed-launch.json');
  await privateDirectory(current.selection.workspaceDirectory);
  let record;
  try { record = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(await regular(privateLaunch, GRANT_MAX_LAUNCH_BYTES, true))); }
  catch (error) { if (error.code) throw error; throw fail('GRANT_PRIVATE_LAUNCH_INVALID'); }
  need(plain(record) && record.schema === GRANT_LAUNCH_SCHEMA && record.state === 'LISTENING' &&
    record.privateLaunch === privateLaunch && record.pid === pid && record.instanceId === instanceId &&
    record.selectionSha256 === selectionSha256 && canonical(record.selection) === canonical(current.selection) &&
    canonical(record.execution) === canonical(execution) &&
    record.accessFile === join(current.selection.workspaceDirectory, 'open-workspace.html') &&
    TOKEN.test(record.accessToken ?? ''), 'GRANT_PRIVATE_LAUNCH_CHANGED');
  const {accessToken, ...original} = record;
  need(plain(announcement) && canonical(announcement) === canonical(original), 'GRANT_STARTUP_ANNOUNCEMENT_CHANGED');
  const url = originUrl(record.url, port);
  // Authenticate the actual original listener. PID equality binds its record;
  // no /proc lookup is needed across managed worker PID namespaces.
  const response = await probe(url, accessToken);
  need(response?.available === true && canonical(response.launch) === canonical(original),
    'GRANT_STARTUP_LISTENER_CHANGED');
  url.hash = 'access=' + accessToken;
  return {url:url.href, original};
}
