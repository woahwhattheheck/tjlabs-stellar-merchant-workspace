// MIT. Continue the original NocoDB operation through the installed project.
// No provider extraction, publisher extraction, seller activation or payment is dispatched here.
import assert from 'node:assert/strict';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lstat, readFile } from 'node:fs/promises';
import { prepareProject, readProject, nativeStatus, openProject, REQUEST_SCHEMA, PROJECT_ALIAS } from './project.mjs';
import { connectProject, downloadPrivateVersion, inspectPrivateDownload } from './mcp-client.mjs';
import { absolute, privateDirectory, readPrivate, readJson, bytes, digest, identity, acquireWorkspace,
  atomicJson, fault, object } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/files.mjs';
import { createOrVerify } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/nocodb/workspace/packet.mjs';

const SCHEMA = 'stellar-forge.nocodb-project-receiving.v1';
const HASH = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const FILES = ['dataset.csv','dataset.json','seller.json','source.json','binding.json'];
const exists = async file => { try { await lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const selected = state => ({ draftRevision: state.draftRevision, selectedVersion: state.selectedVersion,
  selectionRevision: state.selectionRevision, draft: state.draft });
const same = (actual, expected, message) => assert.deepEqual(actual, expected, message);
const sha = value => { if (!HASH.test(value ?? '')) throw fault('NOCODB_RECEIVING_SHA256_REQUIRED'); return value; };
const integer = (value, minimum = 0) => { if (!Number.isSafeInteger(value) || value < minimum) throw fault('NOCODB_RECEIVING_INTEGER_REQUIRED'); return value; };
const exact = (value, keys, required = []) => {
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key)) || required.some(key => !Object.hasOwn(value, key)))
    throw fault('NOCODB_RECEIVING_FIELDS_INVALID');
};
function outside(left, right) {
  const a = relative(left, right), b = relative(right, left);
  return a !== '' && (a === '..' || a.startsWith('..' + sep)) && (b === '..' || b.startsWith('..' + sep));
}
function inputValue(input) {
  exact(input, ['schema','operationId','outputDirectory','project','originalResult','expected','browser','maximumFileBytes'],
    ['schema','operationId','outputDirectory','project','originalResult','expected','browser']);
  if (input.schema !== SCHEMA || typeof input.operationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(input.operationId))
    throw fault('NOCODB_RECEIVING_OPERATION_REQUIRED');
  absolute(input.outputDirectory, 'receiving output');
  if (input.project.schema !== REQUEST_SCHEMA || !input.project.workspaceDirectory)
    throw fault('NOCODB_RECEIVING_EXISTING_WORKSPACE_REQUIRED', 'Adopt the closed original authoring workspace from the completed operation.');
  for (const path of [input.project.directory, input.project.workspaceDirectory, input.project.runtimeDirectory]) {
    absolute(path, 'project input');
    if (!outside(input.outputDirectory, path)) throw fault('NOCODB_RECEIVING_OUTPUT_OVERLAP');
  }
  exact(input.originalResult, ['file','sha256'], ['file','sha256']);
  absolute(input.originalResult.file, 'original result'); sha(input.originalResult.sha256);
  exact(input.expected, ['selectedVersion','draftRevision','versions','publications','packages'],
    ['selectedVersion','draftRevision','versions','publications']);
  integer(input.expected.selectedVersion, 1); integer(input.expected.draftRevision);
  if (!Array.isArray(input.expected.versions) || !input.expected.versions.length ||
      input.expected.versions.length > 100 || !Array.isArray(input.expected.publications) || !input.expected.publications.length ||
      input.expected.publications.length > 100) throw fault('NOCODB_RECEIVING_COMPLETED_BASIS_REQUIRED');
  const versions = new Set(), publications = new Set(), packages = new Set();
  for (const row of input.expected.versions) {
    exact(row, ['id','sourceSha256','observationSha256','rowCount'], ['id','sourceSha256','observationSha256','rowCount']);
    integer(row.id, 1); sha(row.sourceSha256); sha(row.observationSha256); integer(row.rowCount);
    if (versions.has(row.id)) throw fault('NOCODB_RECEIVING_DUPLICATE_VERSION'); versions.add(row.id);
  }
  if (!versions.has(input.expected.selectedVersion)) throw fault('NOCODB_RECEIVING_SELECTED_VERSION_MISSING');
  for (const row of input.expected.publications) {
    exact(row, ['id','planId','sourceSha256','snapshot','revision'], ['id','planId','sourceSha256','snapshot']);
    if (!UUID.test(row.id ?? '')) throw fault('NOCODB_RECEIVING_RUN_ID_REQUIRED');
    integer(row.planId, 1); sha(row.sourceSha256); sha(row.snapshot);
    if (row.revision !== undefined) integer(row.revision);
    if (publications.has(row.id)) throw fault('NOCODB_RECEIVING_DUPLICATE_RUN'); publications.add(row.id);
  }
  const maximum = input.maximumFileBytes ?? 32 * 1024 * 1024;
  integer(maximum, 1);
  if (maximum > 256000000) throw fault('NOCODB_RECEIVING_FILE_LIMIT');
  if (input.expected.packages !== undefined && (!Array.isArray(input.expected.packages) || input.expected.packages.length > 100))
    throw fault('NOCODB_RECEIVING_PACKAGES_INVALID');
  for (const row of input.expected.packages ?? []) {
    exact(row, ['requestId','sourceSha256','files'], ['requestId','sourceSha256','files']);
    if (!UUID.test(row.requestId ?? '') || packages.has(row.requestId)) throw fault('NOCODB_RECEIVING_PACKAGE_ID_INVALID');
    packages.add(row.requestId); sha(row.sourceSha256);
    if (!Array.isArray(row.files) || row.files.length !== FILES.length ||
        new Set(row.files.map(file => file.name)).size !== FILES.length) throw fault('NOCODB_RECEIVING_PACKAGE_FILES_REQUIRED');
    for (const file of row.files) {
      exact(file, ['name','bytes','sha256'], ['name','bytes','sha256']);
      if (!FILES.includes(file.name)) throw fault('NOCODB_RECEIVING_PACKAGE_FILE_INVALID');
      integer(file.bytes);
      if (file.bytes > maximum) throw fault('NOCODB_RECEIVING_FILE_LIMIT', 'Declare the complete source file demand before receiving.');
      sha(file.sha256);
    }
  }
  exact(input.browser, ['module','executable'], ['module','executable']);
  absolute(input.browser.module, 'existing Playwright module'); absolute(input.browser.executable, 'existing browser');
  return { ...input, maximumFileBytes: maximum };
}
async function fileIdentity(file, maximum) {
  const content = await readPrivate(file, maximum);
  return { file, bytes: content.length, sha256: digest(content) };
}
async function sourceIdentity(file, maximum) {
  const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size > maximum) throw fault('NOCODB_RECEIVING_ORIGINAL_RESULT_INVALID');
  const content = await readFile(file), after = await lstat(file);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== content.length ||
      before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw fault('NOCODB_RECEIVING_ORIGINAL_RESULT_CHANGED');
  return { content, file, bytes: content.length, sha256: digest(content) };
}
async function packages(client, input, outputDirectory) {
  const retained = [];
  for (const basis of input.expected.packages ?? []) {
    const inspected = await client.call('merchant_nocodb_deployment_package',
      { workspace: PROJECT_ALIAS, packageRequestId: basis.requestId });
    assert.equal(inspected.native?.sourceSha256, basis.sourceSha256, 'Original package source identity changed.');
    const directory = join(outputDirectory, 'merchant-staging', basis.requestId);
    await privateDirectory(directory, true);
    const result = { requestId: basis.requestId, sourceSha256: basis.sourceSha256, scope: 'PRIVATE_MERCHANT_STAGING', files: [] };
    for (const file of basis.files) {
      const target = join(directory, file.name);
      if (await exists(target)) {
        const old = await fileIdentity(target, input.maximumFileBytes);
        assert.equal(old.bytes, file.bytes); assert.equal(old.sha256, file.sha256);
        result.files.push(old); continue;
      }
      const chunks = [];
      let offset = 0, readId = null, final = false;
      try {
        while (!final) {
          const reply = await client.call('merchant_nocodb_deployment_file_read', {
            workspace: PROJECT_ALIAS, packageRequestId: basis.requestId, file: file.name,
            expectedSha256: file.sha256, offset, limit: 131072, ...(readId ? { readId } : {}),
          });
          assert.equal(reply.offset, offset); assert.equal(reply.file?.name, file.name);
          assert.equal(reply.file?.sha256, file.sha256); assert.equal(reply.file?.bytes, file.bytes);
          assert(UUID.test(reply.readId ?? '')); assert.equal(reply.encoding, 'base64');
          const content = Buffer.from(reply.data, 'base64');
          assert.equal(content.toString('base64'), reply.data); assert.equal(content.length, reply.bytesRead);
          assert(content.length <= 131072 && offset + content.length <= file.bytes);
          readId = reply.readId; chunks.push(content); offset += content.length;
          final = reply.nextOffset === null;
          assert.equal(final, offset === file.bytes);
          if (!final) { assert.equal(reply.nextOffset, offset); assert(content.length > 0); }
        }
        const content = Buffer.concat(chunks);
        assert.equal(content.length, file.bytes); assert.equal(digest(content), file.sha256);
        await createOrVerify(target, content, input.maximumFileBytes);
        result.files.push(await fileIdentity(target, input.maximumFileBytes));
      } finally {
        if (readId && !final) await client.call('merchant_nocodb_deployment_file_release',
          { workspace: PROJECT_ALIAS, readId }, { timeoutMs: 5000 }).catch(() => {});
      }
    }
    retained.push(result);
  }
  return retained;
}
async function deployment(client, expected) {
  const all = [], wanted = new Set(expected.map(row => row.id));
  let offset = 0, last;
  for (let page = 0; page < 10000; page++) {
    const reply = await client.call('merchant_nocodb_deployment_status', { workspace: PROJECT_ALIAS, runsOffset: offset, limit: 100 });
    last = reply.native;
    const rows = last.publisher?.runs ?? [];
    for (const row of rows) {
      if (wanted.has(row.id)) {
        const basis = expected.find(item => item.id === row.id);
        assert.equal(row.planId, basis.planId); assert.equal(row.sourceSha256, basis.sourceSha256);
        assert.equal(row.state, 'PUBLISHED'); assert.equal(row.publication?.snapshot, basis.snapshot);
        if (basis.revision !== undefined) assert.equal(row.publication?.revision, basis.revision);
        all.push(row); wanted.delete(row.id);
      }
    }
    if (!wanted.size || rows.length < 100) break;
    offset += rows.length;
  }
  assert.equal(wanted.size, 0, 'The original completed publication runs were not found in this same publisher.');
  return { publications: all, originalRelease: last.native,
    console: { running: last.console.running, instanceId: last.console.instanceId },
    extractionRepeated: false, sellerActivated: false, paymentDispatched: false };
}
async function versions(client, input) {
  const rows = [];
  for (const basis of input.expected.versions) {
    const reply = await client.call('merchant_nocodb_version', { workspace: PROJECT_ALIAS, versionId: basis.id });
    const value = reply.native;
    assert.equal(value.id, basis.id); assert.equal(value.sourceSha256, basis.sourceSha256);
    assert.equal(value.observationSha256, basis.observationSha256); assert.equal(value.rowCount, basis.rowCount);
    rows.push(value);
  }
  return rows;
}
async function visual(browser, url, input, outputDirectory) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 980 } });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const wanted = 'Draft ' + input.expected.draftRevision + ' · Selected source ' + input.expected.selectedVersion;
    await page.waitForFunction(text => document.querySelector('#summary')?.textContent.includes(text), wanted);
    await page.locator('[data-view="versions"]').click();
    const row = page.locator('#versions tbody tr').filter({ hasText: 'v' + input.expected.selectedVersion + ' · SELECTED' });
    await row.waitFor();
    const selectedVersion = input.expected.versions.find(item => item.id === input.expected.selectedVersion);
    assert((await row.innerText()).includes(selectedVersion.sourceSha256.slice(0, 16)));
    const result = [];
    for (const [name, width] of [['project-desktop.png',1360],['project-mobile.png',390]]) {
      await page.setViewportSize({ width, height: 980 });
      const file = join(outputDirectory, name);
      // Screenshots are new private receiving artifacts; source/provider bytes remain unchanged.
      if (!await exists(file)) await createOrVerify(file, await page.screenshot({ fullPage: true }), 16 * 1024 * 1024);
      result.push(await fileIdentity(file, 16 * 1024 * 1024));
    }
    return { selectedVersion: selectedVersion.id, originalBrowser: true, screenshots: result };
  } finally { await context.close(); }
}

export async function receiveProject(raw) {
  const input = inputValue(raw), outputDirectory = input.outputDirectory;
  await privateDirectory(outputDirectory, true);
  const release = await acquireWorkspace(outputDirectory);
  let host = null, browser = null, result, pendingError = null, unfinishedStartupClose = null;
  try {
    const intentFile = join(outputDirectory, 'input.json'), resultFile = join(outputDirectory, 'result.json');
    const inputBytes = bytes(input);
    if (!await exists(intentFile)) {
      const entries = await import('node:fs/promises').then(fs => fs.readdir(outputDirectory));
      if (entries.some(name => name !== 'publisher.lock')) throw fault('NOCODB_RECEIVING_OUTPUT_NOT_EMPTY');
    }
    await createOrVerify(intentFile, inputBytes, 4 * 1024 * 1024);
    result = await exists(resultFile) ? await readJson(resultFile, 32 * 1024 * 1024) :
      { schema: SCHEMA, operationId: input.operationId, inputSha256: digest(inputBytes), state: 'PREPARING',
        startedAt: new Date().toISOString(), stages: {} };
    assert.equal(result.schema, SCHEMA); assert.equal(result.operationId, input.operationId);
    assert.equal(result.inputSha256, digest(inputBytes));
    if (result.state === 'COMPLETE') {
      // Read the retained delivery; do not reset a later legitimate source selection or reopen a running merchant.
      for (const row of result.stages.private_packets) {
        const verified = await inspectPrivateDownload(input.project.directory, row.outputDirectory);
        assert.equal(verified.sha256, row.sha256);
      }
      for (const row of result.stages.browser.screenshots) {
        const current = await fileIdentity(row.file, 16 * 1024 * 1024);
        assert.equal(current.sha256, row.sha256);
      }
      for (const pack of result.stages.merchant_staging) for (const row of pack.files) {
        const current = await fileIdentity(row.file, input.maximumFileBytes);
        assert.equal(current.sha256, row.sha256); assert.equal(current.bytes, row.bytes);
      }
      return { ...result, reopened: true, laterWorkspaceSelectionPreserved: true };
    }
    const save = async () => atomicJson(outputDirectory, 'result.json', result);
    const stage = async (name, action) => {
      if (Object.hasOwn(result.stages, name)) return result.stages[name];
      const value = await action();
      result = { ...result, state: 'RECEIVING', stages: { ...result.stages, [name]: value } };
      delete result.error; await save();
      console.log(JSON.stringify({ schema: SCHEMA, stage: name, state: 'COMPLETE' }));
      return value;
    };
    const basis = await sourceIdentity(input.originalResult.file, 32 * 1024 * 1024);
    assert.equal(basis.sha256, input.originalResult.sha256);
    await stage('original_result', async () => {
      let original; try { original = JSON.parse(basis.content); } catch { throw fault('NOCODB_RECEIVING_ORIGINAL_RESULT_JSON'); }
      await createOrVerify(join(outputDirectory, 'original-result.json'), basis.content, 32 * 1024 * 1024);
      return { file: input.originalResult.file, bytes: basis.bytes, sha256: basis.sha256,
        reportedState: original.state ?? original.status ?? null,
        scope: 'Original result retained verbatim. This continuation makes no additional payment or settlement claim.' };
    });
    await prepareProject(input.project);
    const project = await readProject(input.project.directory);
    await stage('project', async () => ({ directory: project.directory, workspaceDirectory: project.workspaceDirectory,
      workspaceIdentity: project.workspaceIdentity, sourceCommit: project.installation.sourceCommit,
      manifestSha256: project.installation.manifestSha256 }));
    const before = await nativeStatus(input.project.directory), beforeState = before.native ?? before;
    assert.equal(beforeState.selectedVersion, input.expected.selectedVersion);
    assert.equal(beforeState.draftRevision, input.expected.draftRevision);
    const unchanged = await stage('selection', async () => selected(beforeState));
    same(selected(beforeState), unchanged, 'The original draft/selection changed during incomplete receiving; refresh the declared basis.');
    host = await openProject(input.project.directory, { port: 0 });
    let connected = await connectProject(input.project.directory);
    await stage('source_versions', () => versions(connected.client, input));
    await stage('publications', () => deployment(connected.client, input.expected.publications));
    await stage('private_packets', async () => {
      const retained = [];
      for (const version of input.expected.versions) {
        const row = await downloadPrivateVersion(input.project.directory, {
          versionId: version.id, expectedSourceSha256: version.sourceSha256,
          outputDirectory: join(outputDirectory, 'source-v' + version.id),
        });
        assert.equal(row.captureSha256, version.observationSha256); assert.equal(row.rowCount, version.rowCount);
        retained.push(row);
      }
      return retained;
    });
    await stage('merchant_staging', () => packages(connected.client, input, outputDirectory));
    if (!result.stages.browser) {
      const playwright = await import(pathToFileURL(input.browser.module).href);
      const chromium = playwright.chromium ?? playwright.default?.chromium;
      if (!chromium) throw fault('NOCODB_RECEIVING_BROWSER_MODULE_INVALID');
      browser = await chromium.launch({ executablePath: input.browser.executable, headless: true,
        args: ['--no-sandbox','--disable-dev-shm-usage'] });
      await stage('browser', () => visual(browser, host.session.browserUrl, input, outputDirectory));
      await browser.close(); browser = null;
    }
    await host.close(); host = null;
    const closed = await nativeStatus(input.project.directory);
    same(selected(closed.native ?? closed), unchanged, 'Read-only receiving changed the original draft/selection.');
    // A real second original host lifetime must reopen the same DB and retained versions.
    host = await openProject(input.project.directory, { port: 0 });
    connected = await connectProject(input.project.directory);
    const originalVersions = await versions(connected.client, input);
    const publicationState = await deployment(connected.client, input.expected.publications);
    const reopened = await connected.client.call('merchant_nocodb_status', { workspace: PROJECT_ALIAS });
    same(selected(reopened.native), unchanged);
    await host.close(); host = null;
    const after = await nativeStatus(input.project.directory);
    same(selected(after.native ?? after), unchanged);
    await stage('reopen', async () => ({
      sameWorkspaceIdentity: project.workspaceIdentity, sameVersions: originalVersions.map(row => row.id),
      samePublications: publicationState.publications.map(row => row.id), nativeBrowserAndMcpDrained: true,
      sourceSelectionUnchanged: true, originalPublisherReused: true,
    }));
    result = { ...result, state: 'COMPLETE', completedAt: new Date().toISOString(),
      execution: { providerReads: 0, publisherExtractions: 0, sellerStarts: 0, payments: 0,
        browser: true, authenticatedMcp: true, originalModelReopened: true },
      operatorPacketScope: 'PRIVATE_FULL_CAPTURE_PACKET', merchantPackageScope: 'PRIVATE_MERCHANT_STAGING' };
    await save();
    return result;
  } catch (error) {
    pendingError = error;
    if (typeof error.close === 'function') unfinishedStartupClose = error.close;
    if (result) {
      result = { ...result, state: 'INTERRUPTED', error: { name: error.name, code: error.code ?? null, message: error.message } };
      try { await atomicJson(outputDirectory, 'result.json', result); }
      catch (journalError) { error.journalError = journalError.code ?? journalError.message; }
    }
    throw error;
  } finally {
    let closeError;
    try { await unfinishedStartupClose?.(); } catch (error) { closeError = error; }
    try { await browser?.close(); } catch (error) { closeError = error; }
    try { await host?.close(); } catch (error) { closeError ??= error; }
    if (closeError) {
      // Do not release the receiving lease while the original provider owner has an uncertain drain.
      if (pendingError) { pendingError.cleanupError = closeError; pendingError.close = async () => { await unfinishedStartupClose?.(); await browser?.close(); await host?.close(); await release(); }; }
      else { closeError.close = async () => { await unfinishedStartupClose?.(); await browser?.close(); await host?.close(); await release(); }; throw closeError; }
    } else await release();
  }
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === '--help') {
    console.log('starforge nocodb-receive --input PRIVATE_RECEIVING.json\nContinue the SAME completed NocoDB operation and original closed workspace. See products/nocodb-merchant/README.md.');
    return 0;
  }
  if (argv.length !== 2 || argv[0] !== '--input') throw fault('NOCODB_RECEIVING_INPUT_REQUIRED');
  const input = await readJson(absolute(resolve(argv[1]), 'receiving input'), 4 * 1024 * 1024);
  const result = await receiveProject(input);
  console.log(JSON.stringify(result, null, 2));
  return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(code => { process.exitCode = code; }).catch(async error => {
    console.error(JSON.stringify({ error: error.code ?? error.name, message: error.message, cleanupError: error.cleanupError?.message ?? null }));
    if (error.close) {
      // Preserve the exact original lease/owner after a failed drain. A later signal retries only cleanup.
      const timer = setInterval(() => {}, 60000);
      await new Promise(resolve => {
        let busy = false;
        const retry = async () => {
          if (busy) return; busy = true;
          try { await error.close(); clearInterval(timer); process.removeListener('SIGINT', retry); process.removeListener('SIGTERM', retry); resolve(); }
          catch (issue) { console.error(JSON.stringify({ error: 'NOCODB_RECEIVING_DRAIN_INCOMPLETE', code: issue.code ?? issue.name })); }
          finally { busy = false; }
        };
        process.on('SIGINT', retry); process.on('SIGTERM', retry);
      });
    }
    process.exitCode = 1;
  });
