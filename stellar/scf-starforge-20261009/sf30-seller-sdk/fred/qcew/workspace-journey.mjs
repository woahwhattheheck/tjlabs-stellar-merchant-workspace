#!/usr/bin/env node
// MIT. Operate the completed original-data county project through its installed browser.
import { readFile, lstat, chmod } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { privateDirectory, readPrivateJson, atomicJson, withPrivateLock } from '../../routescan/quota.mjs';
import { need, canonical } from './model.mjs';
import { readQcewOriginalMember } from './source.mjs';
import { getQcewEdition } from './project.mjs';
import { readFredProject, exportFredProject } from '../project.mjs';
import { startFredWorkspace } from '../workspace.mjs';
import { FRED_DDP_PROJECT_BUNDLE_MAX_BYTES } from '../ddp/project-validation.mjs';

const SCHEMA = 'stellar-forge.qcew-workspace-journey.v1';
const names = { 'report.html': 'Offline report', 'report.pdf': 'PDF report',
  'report.json': 'Complete report JSON', 'data.csv': 'Calculated data CSV',
  'source-rows.csv': 'Original source rows CSV', 'methodology.md': 'Methodology',
  'changes.json': 'Full changes JSON', 'changes.csv': 'Changes CSV' };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function optionalJson(path, limit = 4 * 1048576) {
  try { return await readPrivateJson(path, limit); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function originalFile(path, limit) {
  const stat = await lstat(path);
  need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= limit, 'Use the complete retained regular file.');
  const bytes = await readFile(path);
  need(bytes.length === stat.size, 'The retained file changed while being read.');
  return bytes;
}
function resultSummary(value) {
  return { editionId: value.edition.id, section: value.section, filters: value.filters,
    total: value.total, offset: value.offset, displayedRows: value.items.length,
    manifestSha256: value.edition.manifestSha256 };
}
export async function runQcewWorkspaceJourney({ directory, chromium, playwrightModule } = {}) {
  need(isAbsolute(directory ?? '') && isAbsolute(chromium ?? '') && isAbsolute(playwrightModule ?? ''),
    'Use the existing complete native journey and installed Chromium and Playwright module paths.');
  directory = await privateDirectory(resolve(directory));
  const native = await readPrivateJson(join(directory, 'native-result.json'), 64 * 1048576);
  need(native.schema === 'stellar-forge.qcew-native-result.v1' && native.reports?.length >= 2,
    'Complete the original-data native production journey before opening its browser programme.');
  const projectDirectory = join(directory, 'project');
  const sourceState = await readFredProject(projectDirectory);
  need(sourceState.id === native.project.projectId, 'Open the original native production project.');
  const reports = native.reports.map(item => item.edition);
  need(reports.every(item => sourceState.qcew.editions.some(saved =>
    saved.id === item.id && saved.manifestSha256 === item.manifestSha256)),
    'Use the original native report editions and complete manifests.');
  const root = await privateDirectory(join(directory, 'browser-workspace'));
  const receiver = join(root, 'received-project');
  return withPrivateLock(root, 'journey.lock', async () => {
    const identity = { projectId: sourceState.id, projectDirectory,
      reports: reports.map(item => ({ id: item.id, manifestSha256: item.manifestSha256 })),
      receivingDirectory: receiver };
    const retained = await optionalJson(join(root, 'journey.json'));
    need(!retained || retained.schema === SCHEMA && canonical(retained.identity) === canonical(identity),
      'Continue this browser programme with its original complete project.');
    if (retained?.status === 'completed') return retained.result;
    const journal = retained ?? { schema: SCHEMA, identity, startedAt: new Date().toISOString(), steps: [] };
    journal.status = 'running'; delete journal.error;
    await atomicJson(root, 'journey.json', journal);
    let browser, context, workspace, restartedWorkspace;
    const browserErrors = [];
    const save = () => atomicJson(root, 'journey.json', journal);
    const step = async (name, work) => {
      const startedAt = new Date().toISOString(), value = await work();
      const entry = { name, startedAt, completedAt: new Date().toISOString(), result: value };
      journal.steps = journal.steps.filter(item => item.name !== name).concat(entry);
      await save(); console.log(JSON.stringify({ event: 'qcew_workspace_step', ...entry }));
      return value;
    };
    const openPage = async selected => {
      context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, acceptDownloads: true });
      const page = await context.newPage();
      page.setDefaultTimeout(120000);
      page.on('pageerror', error => browserErrors.push(error.message));
      await page.goto(selected.url, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-tab="county"]').click();
      await page.waitForFunction(() => {
        const status = document.getElementById('qcew-status');
        const button = document.getElementById('qcew-open-edition');
        return status && !status.textContent.startsWith('Opening') && button && !button.disabled;
      }, null, { timeout: 120000 });
      return page;
    };
    const reportRead = async (page, action) => {
      const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/qcew/edition',
        { timeout: 120000 });
      await action();
      const response = await pending;
      const value = await response.json();
      need(response.ok(), value.message ?? 'The original report read failed.');
      await page.waitForFunction(expected => {
        const field = id => document.getElementById(id);
        return !field('qcew-open-edition').disabled &&
          field('qcew-edition').value === expected.edition.id &&
          field('qcew-section').value === expected.section &&
          field('qcew-filter-region').value === expected.filters.region &&
          field('qcew-filter-industry').value === expected.filters.industry &&
          field('qcew-filter-period').value === expected.filters.period;
      }, { edition: { id: value.edition.id }, section: value.section, filters: value.filters }, { timeout: 120000 });
      const displayed = await page.locator('#qcew-report-table tbody tr').count();
      need(displayed === value.items.length, 'The report table does not display its returned original selection.');
      return value;
    };
    const saveDownload = async (page, button, path, expected) => {
      const downloaded = page.waitForEvent('download', { timeout: 120000 });
      await button.click();
      const file = await downloaded;
      await file.saveAs(path); await chmod(path, 0o600);
      const bytes = await originalFile(path, FRED_DDP_PROJECT_BUNDLE_MAX_BYTES);
      if (expected) need(bytes.length === expected.bytes && sha256(bytes) === expected.sha256,
        'The browser download differs from its complete original report member.');
      return { filename: file.suggestedFilename(), path, bytes: bytes.length, sha256: sha256(bytes) };
    };
    const waitForReceiving = async (page, { id = null, prior = null, transport = null } = {}) => {
      for (;;) {
        const host = await optionalJson(join(projectDirectory, 'qcew-workspace', 'operation.json'), 65536);
        const ownHost = host?.action === 'qcew.receive' && host.selection?.targetDirectory === receiver &&
          (!id || host.id === id) ? host : null;
        const state = await readFredProject(projectDirectory);
        const matches = state.operations.filter(item => item.kind === 'qcew.receive' &&
          (id ? item.id === id : item.result.directory === receiver));
        need(matches.length <= 1, 'Continue the one original browser receiving operation.');
        if (matches.length) {
          const completed = matches[0];
          need(completed.result.directory === receiver && completed.result.projectId === sourceState.id &&
            (!ownHost || ownHost.id === completed.id),
            'The browser receiving completed another original selection.');
          return { id: completed.id, value: completed.result, host: ownHost };
        }
        if (transport?.error) throw transport.error;
        need(browserErrors.length === 0,
          'The receiving browser encountered JavaScript errors: ' + browserErrors.join('; '));
        const visible = await page.locator('#message').evaluate(element => ({
          error: element.classList.contains('error'), text: element.textContent
        }));
        need(!visible.error, visible.text || 'The browser could not retain or continue its original receiving selection.');
        if (ownHost?.phase === 'failed' &&
            (prior?.id !== ownHost.id || canonical(prior.lastError) !== canonical(ownHost.lastError)))
          throw Object.assign(new Error(ownHost.lastError?.message ?? 'The original receiving operation failed.'),
            { code: ownHost.lastError?.code ?? 'QCEW_WORKSPACE_RECEIVING_FAILED' });
        need(ownHost?.phase !== 'cleared', 'The original receiving selection was cleared before completion.');
        // Full original input can take time to retain and validate. Follow the actual operation
        // and browser result, including failures before any HTTP request has been sent.
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    };
    try {
      const runtime = await import(pathToFileURL(resolve(playwrightModule)).href);
      const installed = runtime.chromium ?? runtime.default?.chromium;
      need(installed?.launch, 'Select the installed Playwright module with Chromium support.');
      browser = await installed.launch({ executablePath: resolve(chromium), headless: true, args: ['--no-sandbox'] });
      const environment = { ...process.env, FRED_QCEW_CHROMIUM: resolve(chromium) };
      workspace = await startFredWorkspace({ directory: projectDirectory, environment });
      let page = await openPage(workspace);
      await step('open_original_county_workspace', async () => ({
        projectId: sourceState.id, reportEditions: await page.locator('#qcew-edition option').count(),
        status: await page.locator('#qcew-status').textContent()
      }));
      for (const entry of reports) {
        await step('open_and_download_' + entry.id, async () => {
          await page.locator('#qcew-edition').selectOption(entry.id);
          let value = await reportRead(page, () => page.locator('#qcew-open-edition').click());
          if (value.section !== 'overview')
            value = await reportRead(page, () => page.locator('#qcew-section').selectOption('overview'));
          need(value.edition.manifestSha256 === entry.manifestSha256, 'The browser opened another report manifest.');
          const reportDirectory = await privateDirectory(join(root, entry.id));
          const downloads = [];
          for (const member of value.manifest.files) {
            need(names[member.name], 'The browser programme needs the original member download label.');
            downloads.push(await saveDownload(page,
              page.locator('#qcew-downloads').getByRole('button', { name: names[member.name], exact: true }),
              join(reportDirectory, member.name), member));
          }
          await page.locator('#qcew-report-panel').screenshot({ path: join(reportDirectory, 'report-workspace.png') });
          await chmod(join(reportDirectory, 'report-workspace.png'), 0o600);
          const history = await reportRead(page, () => page.locator('#qcew-section').selectOption('matrix'));
          let next = null;
          if (history.nextOffset !== null) {
            next = await reportRead(page, () => page.locator('#qcew-page-next').click());
            need(next.offset === history.nextOffset, 'The browser did not open the next original history page.');
          }
          const focused = await reportRead(page,
            () => page.locator('#qcew-filter-region').selectOption(value.profile.definition.focus));
          need(focused.items.every(item => item.region === value.profile.definition.focus),
            'The displayed regional history differs from its selected focus.');
          await reportRead(page, () => page.locator('#qcew-filter-region').selectOption(''));
          const originals = await reportRead(page, () => page.locator('#qcew-section').selectOption('files'));
          need(originals.items.length > 0, 'The complete report has no original source members.');
          const original = originals.items[0];
          const originalDownload = await saveDownload(page,
            page.locator('#qcew-report-table').getByRole('button', { name: 'Download original CSV', exact: true }).first(),
            join(reportDirectory, 'complete-original-source.csv'), original);
          const savedSource = await readQcewOriginalMember(projectDirectory, entry.captureSha256, original.file);
          need(originalDownload.sha256 === savedSource.sha256, 'The browser source differs from the original retained CSV.');
          if (entry.previousEditionId) {
            const changes = await reportRead(page, () => page.locator('#qcew-section').selectOption('changes'));
            need(changes.previousReportId && changes.currentReportId === entry.reportId,
              'The browser successor comparison lost its original predecessor.');
          }
          return { report: resultSummary(value), history: resultSummary(history),
            nextPage: next && resultSummary(next), focused: resultSummary(focused),
            originalSource: originalDownload, downloads };
        });
      }
      const bundleFile = join(root, 'complete-project.json');
      let known = await optionalJson(join(root, 'receiving-selection.json'));
      if (!known) {
        const current = await readFredProject(projectDirectory);
        const host = await optionalJson(join(projectDirectory, 'qcew-workspace', 'operation.json'), 65536);
        const retainedHost = host?.action === 'qcew.receive' && host.selection?.targetDirectory === receiver ? host : null;
        const completed = current.operations.filter(item => item.kind === 'qcew.receive' && item.result.directory === receiver);
        need(completed.length <= 1, 'The browser programme retains one original receiving operation.');
        const originalId = retainedHost?.id ?? completed[0]?.id;
        if (originalId) {
          const bytes = await originalFile(bundleFile, FRED_DDP_PROJECT_BUNDLE_MAX_BYTES);
          const originalBundle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
          need(originalBundle.state.id === sourceState.id &&
            (!retainedHost || originalBundle.bundleSha256 === retainedHost.selection.bundleSha256),
            'Recover the browser receiving from its complete original downloaded handover.');
          known = { id: originalId, projectId: sourceState.id, directory: receiver,
            bundleSha256: originalBundle.bundleSha256, exportedFileSha256: sha256(bytes),
            ...(retainedHost ? { requestSha256: retainedHost.requestSha256 } : {}) };
          await atomicJson(root, 'receiving-selection.json', known);
        }
      }
      let receivingResult, originalRequestId;
      if (known) {
        need(known.projectId === sourceState.id && known.directory === receiver,
          'Continue the original browser receiving selection.');
        originalRequestId = known.id;
        const state = await readFredProject(projectDirectory);
        const completed = state.operations.find(item => item.id === known.id && item.kind === 'qcew.receive');
        if (completed) receivingResult = completed.result;
        else {
          const prior = await optionalJson(join(projectDirectory, 'qcew-workspace', 'operation.json'), 65536);
          await page.locator('#qcew-resume').click();
          // The UI may find the completed original operation without sending another request.
          const completed = await waitForReceiving(page, { id: known.id, prior });
          receivingResult = completed.value;
        }
      } else {
        const exportResult = await step('download_complete_project', () =>
          saveDownload(page, page.locator('#qcew-export-project'), bundleFile));
        const bundle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
          await originalFile(bundleFile, FRED_DDP_PROJECT_BUNDLE_MAX_BYTES)));
        need(bundle.state.id === sourceState.id && bundle.state.qcew.editions.length >= reports.length,
          'The browser handover must contain the full original project and reports.');
        await page.locator('#qcew-receive-file').setInputFiles(bundleFile);
        await page.locator('#qcew-receive-directory').fill(receiver);
        const prior = await optionalJson(join(projectDirectory, 'qcew-workspace', 'operation.json'), 65536);
        const transport = { intercepted: false, error: null };
        let releaseReturn;
        const holdReturn = new Promise(resolve => { releaseReturn = resolve; });
        await page.route('**/api/qcew/action', async route => {
          transport.intercepted = true;
          try {
            const actual = await route.fetch({ timeout: 0 });
            const value = await actual.json();
            need(actual.ok() && value.receiving, value.message ?? 'The full original project receiving failed.');
            // Preserve the real host request while preventing its response from reaching this page.
            await holdReturn;
            await route.abort().catch(() => {});
          } catch (error) { transport.error = error; await route.abort().catch(() => {}); }
        });
        try {
          await page.locator('#qcew-receive').click();
          const completed = await waitForReceiving(page, { prior, transport });
          need(transport.intercepted && completed.host,
            'The browser programme must receive through its original retained host request.');
          receivingResult = completed.value; originalRequestId = completed.id;
          await atomicJson(root, 'receiving-selection.json', {
            id: completed.id, projectId: sourceState.id, directory: receiver,
            requestSha256: completed.host.requestSha256, bundleSha256: bundle.bundleSha256,
            exportedFileSha256: exportResult.sha256
          });
          // The original server commits. Its actual response never reaches this browser.
          await context.close(); context = null;
        } finally { releaseReturn(); }
      }
      await step('receive_complete_project_before_lost_return', async () => {
        need(receivingResult.directory === receiver && receivingResult.projectId === sourceState.id,
          'The browser receiving returned another economic project.');
        return { originalRequestId, directory: receiver, projectId: receivingResult.projectId,
          reportEditions: receivingResult.reportEditions, sourceCaptures: receivingResult.sourceCaptures };
      });
      if (context) { await context.close(); context = null; }
      // Keep the old listener bound until the new session has a distinct origin.
      restartedWorkspace = await startFredWorkspace({ directory: projectDirectory, environment });
      need(restartedWorkspace.origin !== workspace.origin, 'The restart must open a new local browser origin.');
      const previousOrigin = workspace.origin;
      await workspace.close(); workspace = null;
      page = await openPage(restartedWorkspace);
      await step('recover_receiving_in_new_origin_and_browser_profile', async () => {
        await page.waitForFunction(expected =>
          document.getElementById('qcew-received-detail').textContent.includes(expected), receiver);
        const state = await readFredProject(projectDirectory);
        const completed = state.operations.filter(item => item.id === originalRequestId && item.kind === 'qcew.receive');
        need(completed.length === 1 && completed[0].result.directory === receiver,
          'Recovery must reuse the one original completed receiving operation.');
        return { previousOrigin, currentOrigin: restartedWorkspace.origin, originalRequestId,
          receivingDetail: await page.locator('#qcew-received-detail').textContent(),
          status: await page.locator('#qcew-received-status').textContent() };
      });
      await context.close(); context = null;
      await restartedWorkspace.close(); restartedWorkspace = null;
      workspace = await startFredWorkspace({ directory: receiver, environment });
      page = await openPage(workspace);
      await step('reopen_complete_received_project', async () => {
        const outcomes = [];
        for (const entry of reports) {
          await page.locator('#qcew-edition').selectOption(entry.id);
          const view = await reportRead(page, () => page.locator('#qcew-open-edition').click());
          const original = await getQcewEdition(projectDirectory, entry.id);
          const received = await getQcewEdition(receiver, entry.id);
          need(canonical(original.manifest) === canonical(received.manifest) &&
            view.edition.manifestSha256 === original.entry.manifestSha256,
            'The independent browser receiving changed an original complete report.');
          outcomes.push(resultSummary(view));
        }
        const selection = await readPrivateJson(join(root, 'receiving-selection.json'), 65536);
        const reopened = await exportFredProject({ directory: receiver });
        need(reopened.bundleSha256 === selection.bundleSha256,
          'The received project must export the complete original handover.');
        return { projectId: (await readFredProject(receiver)).id, reports: outcomes, bundleSha256: reopened.bundleSha256 };
      });
      need(browserErrors.length === 0, 'The original browser programme encountered JavaScript errors: ' + browserErrors.join('; '));
      journal.status = 'completed'; journal.completedAt = new Date().toISOString();
      journal.result = { schema: 'stellar-forge.qcew-workspace-result.v1',
        projectId: sourceState.id, originalRequestId, receivingDirectory: receiver,
        reports: reports.map(item => item.id), startedAt: journal.startedAt, completedAt: journal.completedAt,
        runtime: { node: process.version, platform: process.platform, chromium: resolve(chromium),
          playwrightModule: resolve(playwrightModule) }, steps: journal.steps };
      await save(); await atomicJson(root, 'workspace-result.json', journal.result);
      console.log(JSON.stringify({ event: 'qcew_workspace_complete', result: journal.result }));
      return journal.result;
    } catch (error) {
      journal.status = 'interrupted'; journal.interruptedAt = new Date().toISOString();
      journal.error = { code: error.code ?? 'QCEW_WORKSPACE_JOURNEY_FAILED', message: error.message };
      await save(); throw error;
    } finally {
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
      await restartedWorkspace?.close().catch(() => {});
      await workspace?.close().catch(() => {});
    }
  });
}
async function main(args = process.argv.slice(2)) {
  const flags = {}, allowed = new Set(['directory', 'chromium', 'playwright-module']);
  for (let index = 0; index < args.length; index += 2) {
    need(/^--[a-z-]+$/.test(args[index]) && allowed.has(args[index].slice(2)) &&
      args[index + 1] && !args[index + 1].startsWith('--'), 'Use --directory ABS --chromium ABS --playwright-module ABS.');
    const name = args[index].slice(2);
    need(flags[name] === undefined, 'Use each browser programme option once.');
    flags[name] = args[index + 1];
  }
  return runQcewWorkspaceJourney({ directory: flags.directory, chromium: flags.chromium,
    playwrightModule: flags['playwright-module'] });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(JSON.stringify({ code: error.code ?? 'QCEW_WORKSPACE_JOURNEY_FAILED',
    message: error.message })); process.exitCode = 1; });
