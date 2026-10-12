#!/usr/bin/env node
// MIT. Complete original-publication to authoring receiving, without provider or payment replay.
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFile, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { privateDirectory, readJson, readPrivate, bytes, digest, identity, acquireWorkspace,
  atomicJson, fault } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/files.mjs';
import { createOrVerify, validatePacket, MAX_PACKET_BYTES } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/sheetbest/workspace/packet.mjs';
import { readCompletedInput } from './completed.mjs';
import { prepareProduct, productState, absolute, options, AUTHORING_PATH } from './product.mjs';

const SCHEMA = 'stellar-forge.sheetbest-authoring-receiving.v1';
const exists = async path => { try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const nativeImport = (state, path) => import(pathToFileURL(join(state.installation.sourceRoot, path)).href);
const detail = error => ({ code: error?.code ?? 'SHEETBEST_RECEIVING_ERROR', message: String(error?.message ?? error) });

export async function receiveAuthoring({ runtimeDirectory, directory, inputFile, browserConfigFile = null }) {
  const input = await readCompletedInput(absolute(inputFile));
  const product = await prepareProduct({ runtimeDirectory: absolute(runtimeDirectory), directory: absolute(directory), title: input.title });
  const root = join(directory, 'receiving'); await privateDirectory(root, true);
  const release = await acquireWorkspace(root);
  const stateFile = join(root, 'state.json'), resultFile = join(root, 'result.json');
  let state, workspace, service, browser, context, page, mcp, publishers;
  let browserConfig, basis, authoring, sourceModule, planModule;
  const save = () => atomicJson(root, 'state.json', state);
  try {
    browserConfig = browserConfigFile ? await readJson(absolute(browserConfigFile), 16384) : null;
    basis = { inputSha256: input.inputSha256, productDirectory: directory,
      sourceManifestSha256: product.installation.manifestSha256,
      browser: browserConfig ? { module: absolute(browserConfig.module), executable: absolute(browserConfig.executable) } : null };
    authoring = await nativeImport(product, AUTHORING_PATH + '/model.mjs');
    sourceModule = await nativeImport(product, 'stellar/scf-starforge-20261009/sf30-seller-sdk/sheetbest/source.mjs');
    planModule = await nativeImport(product, 'stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/plan.mjs');
    if (await exists(stateFile)) {
      state = await readJson(stateFile, 8 * 1024 * 1024);
      assert.equal(state.schema, SCHEMA); assert.equal(identity(state.basis), identity(basis), 'Original receiving selection changed.');
    } else {
      state = { schema: SCHEMA, id: randomUUID(), basis, steps: {}, versions: [],
        status: 'RUNNING', createdAt: new Date().toISOString() }; await save();
    }
    workspace = await authoring.openSheetBestAuthoring({ directory: product.workspaceDirectory });
    if (state.status === 'COMPLETE' || await exists(resultFile)) {
      const result = await readJson(resultFile, 8 * 1024 * 1024);
      assert.equal(result.state, 'COMPLETE'); assert.equal(result.operationId, state.id);
      assert.equal(identity(result.basis), identity(basis));
      for (const original of result.editions) {
        const saved = workspace.version(original.sourceVersion);
        assert.equal(saved.sourceSha256, original.sourceSha256);
        assert.equal(saved.observationSha256, original.captureSha256);
      }
      state.status = 'COMPLETE'; state.resultSha256 = digest(bytes(result)); await save();
      return result; // A later operator selection is never reset to the receiving baseline.
    }
    state.status = 'RUNNING'; await save();

    async function nativeStep(key, kind, payload, invoke) {
      const fingerprint = identity(payload);
      let step = state.steps[key];
      if (!step) { step = state.steps[key] = { requestId: randomUUID(), kind, fingerprint, input: kind === 'IMPORT' ? { title: payload.title, expectedDraftRevision: payload.expectedDraftRevision, packetSha256: digest(bytes(payload.packet)) } : payload }; await save(); }
      assert.equal(step.kind, kind); assert.equal(step.fingerprint, fingerprint, 'Retained native input changed.');
      const existing = workspace.operation(step.requestId);
      const result = existing ? await workspace.resume(step.requestId) : await invoke({ ...payload, requestId: step.requestId });
      step.complete = true; step.result = result; await save(); return result;
    }
    async function beginBrowser() {
      if (!browserConfig || browser) return;
      const pw = await import(pathToFileURL(browserConfig.module).href);
      const original = await nativeImport(product, AUTHORING_PATH + '/server.mjs');
      service = await original.serveSheetBestAuthoring({ workspace, port: 0 });
      browser = await pw.chromium.launch({ executablePath: browserConfig.executable, headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      context = await browser.newContext({ viewport: { width: 1380, height: 960 } });
      page = await context.newPage();
      // The product uses only its own local source browser during receiving.
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.origin === service.origin ? route.continue() : route.abort('blockedbyclient');
      });
      await page.goto(service.url);
    }
    async function browserStep(key, kind, endpoint, expected, selector) {
      const previous = state.steps[key];
      if (previous) {
        assert.equal(previous.kind, kind);
        for (const [key, value] of Object.entries(expected))
          assert.equal(identity(previous.input[key]), identity(value), 'Original reviewed UI input changed.');
        const retained = workspace.operation(previous.requestId);
        const result = retained ? await workspace.resume(previous.requestId) : await workspace[kind === 'PREVIEW' ? 'preview' : 'saveVersion']({ ...previous.input, requestId: previous.requestId });
        previous.result = result; previous.complete = true; await save(); return result;
      }
      let intercepted, routeIssue;
      const handler = async route => {
        const payload = route.request().postDataJSON();
        try {
          for (const [key, value] of Object.entries(expected))
            assert.equal(identity(payload[key]), identity(value), 'Browser submitted a different original review.');
          assert.match(payload.requestId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
          const { requestId, ...native } = payload;
          intercepted = state.steps[key] = { requestId, kind, fingerprint: identity(native), input: native };
          // Freeze the browser's actual UUID/body before the original HTTP mutation.
          await save(); await route.continue();
        } catch (error) { routeIssue = error; await route.abort('failed'); }
      };
      await page.route('**' + endpoint, handler);
      try {
        const response = page.waitForResponse(r => new URL(r.url()).pathname === endpoint &&
          r.request().method() === 'POST', { timeout: 30000 }).then(reply => ({ reply }), error => ({ error }));
        await page.locator(selector).click();
        const outcome = await response;
        if (routeIssue) throw routeIssue;
        if (outcome.error) throw outcome.error;
        const reply = outcome.reply;
        assert(reply.ok(), 'Original authoring HTTP ' + reply.status());
        const result = await reply.json();
        assert(intercepted);
        const saved = workspace.operation(intercepted.requestId);
        assert.equal(saved?.status, 'complete');
        assert.equal(identity(saved.result), identity(result));
        intercepted.result = result; intercepted.complete = true; await save(); return result;
      } finally { await page.unroute('**' + endpoint, handler); }
    }
    await beginBrowser();
    for (const [index, edition] of input.editions.entries()) {
      const prefix = 'edition-' + edition.runId;
      const originalPacket = edition.retained.packet;
      const importStep = state.steps[prefix + ':import'];
      const current = await workspace.status();
      const predecessor = index === 0 ? null : state.steps['edition-' + input.editions[index - 1].runId + ':version']?.result?.version;
      const expectedDraftRevision = predecessor?.draftRevision ?? 0;
      const expectedSelectedVersion = predecessor?.id ?? null;
      if (!importStep) {
        assert.equal(current.draftRevision, expectedDraftRevision, 'A newer operator draft must be preserved.');
        assert.equal(current.selectedVersion, expectedSelectedVersion, 'A newer operator source selection must be preserved.');
      }
      const importInput = { packet: originalPacket, title: input.title,
        expectedDraftRevision: importStep?.input.expectedDraftRevision ?? expectedDraftRevision };
      if (importStep) assert.equal(importStep.input.packetSha256, digest(bytes(originalPacket)));
      const imported = await nativeStep(prefix + ':import', 'IMPORT', importInput, value => workspace.importPacket(value));
      assert.equal(imported.draftSaved, true, 'Another operator draft must be reviewed before continuing this import.');
      assert.equal(imported.capture.manifestSha256, edition.captureSha256);
      const columns = await workspace.inspectCapture(imported.capture.id);
      assert.equal(columns.manifest.rowCount, edition.rowCount);
      const draftRevision = imported.draftRevision;
      if (page && !state.steps[prefix + ':version']) {
        await page.reload(); await page.locator('#preview-draft').waitFor();
      }
      const preview = page
        ? await browserStep(prefix + ':preview', 'PREVIEW', '/api/preview', { draftRevision }, '#preview-draft')
        : await nativeStep(prefix + ':preview', 'PREVIEW', { draftRevision }, value => workspace.preview(value));
      const reviewed = preview.reports[edition.query];
      assert.equal(preview.allRowsChecked, true);
      assert.equal(reviewed.publicationReview.sourceRows, edition.rowCount);
      assert.equal(reviewed.publicationReview.emittedRows, edition.rowCount);
      assert.equal(reviewed.publicationReview.rowScope, 'ALL_CAPTURED_ROWS');
      assert.deepEqual(reviewed.publicationReview.order, edition.order);
      assert.deepEqual(reviewed.publicationReview.columns.map(row => row.alias), edition.aliases);
      const note = 'Receive original completed publication ' + edition.originalSnapshot +
        ', original run ' + edition.runId + ', plan ' + edition.planId + '. Original source, order, field projection and publication remain retained; no provider read or publication is repeated.';
      const versionInput = state.steps[prefix + ':version']?.input ?? {
        draftRevision, previewId: preview.id, reviewer: input.reviewer, note,
        expectedSelectedVersion };
      if (page && !state.steps[prefix + ':version']) {
        await page.locator('#reviewer').fill(input.reviewer);
        await page.locator('#change-note').fill(note);
      }
      const saved = page
        ? await browserStep(prefix + ':version', 'VERSION', '/api/version', versionInput, '#save-version')
        : await nativeStep(prefix + ':version', 'VERSION', versionInput, value => workspace.saveVersion(value));
      const version = saved.version;
      assert.equal(version.observationSha256, edition.captureSha256);
      assert.equal(version.rowCount, edition.rowCount);
      assert.deepEqual(version.draft.orders[edition.query], edition.order);
      assert.deepEqual(Object.keys(version.draft.queries[edition.query].columns), edition.aliases);
      // Compare the complete original four-field (or source-selected) CSV using
      // the unchanged source projector, scalar encoder and original CSV writer.
      const selected = await sourceModule.openSheetBestSourceFile(version.sourceFile);
      const csv = [Buffer.from(planModule.csvLine(Object.keys(edition.retained.plan.dataset.columns)), 'utf8')];
      let report;
      try {
        report = await selected.source.exportDataset(edition.query, {}, {
          ...edition.retained.plan.extraction,
          onRow(row) { csv.push(Buffer.from(sourceModule.encodeSheetBestRow(row, edition.retained.plan.dataset), 'utf8')); },
        });
      } finally { await selected.source.close(); }
      const completeCSV = Buffer.concat(csv);
      assert.equal(report.rowCount, edition.rowCount);
      assert.equal(digest(completeCSV), edition.csv.sha256);
      assert.deepEqual(completeCSV, edition.retained.csv);
      const packet = await workspace.exportVersion(version.id);
      const packetName = 'source-v' + version.id + '.json';
      await createOrVerify(join(root, packetName), packet.bytes, MAX_PACKET_BYTES);
      const decoded = validatePacket(JSON.parse(packet.bytes));
      assert.equal(decoded.manifestSha256, edition.captureSha256);
      assert.equal(decoded.manifest.sourceSha256, edition.responseSha256);
      const result = { runId: edition.runId, originalPlanId: edition.planId, originalPlanFolder: edition.planFolder,
        originalSnapshot: edition.originalSnapshot, sourceVersion: version.id, sourceSha256: version.sourceSha256,
        captureSha256: edition.captureSha256, rowCount: report.rowCount, aliases: edition.aliases, order: edition.order,
        csvSha256: digest(completeCSV), packet: { file: packetName, bytes: packet.bytes.length, sha256: digest(packet.bytes) } };
      state.versions[index] = result; await save();
    }
    const last = state.versions.at(-1);
    const comparisons = [];
    for (let index = 1; index < state.versions.length; index++) {
      const value = await workspace.compareVersions(state.versions[index - 1].sourceVersion, state.versions[index].sourceVersion);
      assert.equal(value.sameObservation, input.editions[index - 1].captureSha256 === input.editions[index].captureSha256);
      comparisons.push(value);
    }
    await createOrVerify(join(root, 'source-comparisons.json'), bytes(comparisons), 4 * 1024 * 1024);
    const plan = await workspace.publisherPlan({ versionId: last.sourceVersion, query: input.editions.at(-1).query });
    assert.deepEqual(plan.plan.extraction.order, input.editions.at(-1).order);
    assert.deepEqual(Object.keys(plan.plan.dataset.columns), input.editions.at(-1).aliases);
    await createOrVerify(join(root, 'publisher-plan-input.json'), bytes(plan), 1024 * 1024);
    let browserResult = { state: 'NOT_REQUESTED' };
    if (page) {
      await page.reload(); await page.locator('#versions').waitFor();
      await page.screenshot({ path: join(root, 'authoring-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: join(root, 'authoring-mobile.png'), fullPage: true });
      browserResult = { state: 'COMPLETE', desktop: 'authoring-desktop.png', mobile: 'authoring-mobile.png',
        nativePreviewAndVersionForms: true,
        horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) };
      assert.equal(browserResult.horizontalOverflow, false);
      await browser.close(); browser = null; page = null; context = null;
      await service.close(); service = null; workspace = null;
    } else { await workspace.close(); workspace = null; }

    // Reopen the same source model through its original MCP host. This creates
    // no independent publisher or source store and does not repeat a saved form.
    const bridge = await nativeImport(product, AUTHORING_PATH + '/mcp.mjs');
    const nativePublisher = await nativeImport(product, 'stellar-forge/mcp-merchant-operator/publisher.mjs');
    const binding = await bridge.readSheetBestWorkspaceConfiguration(product.connectionsFile);
    publishers = new nativePublisher.MerchantPublisher({});
    mcp = new bridge.MerchantSheetBestWorkspaces({ sheetbestWorkspaces: binding }, publishers);
    const opened = await mcp.call('merchant_sheetbest_open', { workspace: 'merchant' });
    const reopened = await mcp.call('merchant_sheetbest_status', { workspace: 'merchant' });
    assert.equal(reopened.native.selectedVersion, last.sourceVersion);
    const observed = await mcp.call('merchant_sheetbest_version', { workspace: 'merchant', versionId: last.sourceVersion });
    assert.equal(observed.native.sourceSha256, last.sourceSha256);
    const mcpResult = { sameWorkspace: true, instanceId: opened.instanceId,
      selectedVersion: last.sourceVersion, sourceSha256: last.sourceSha256 };
    await mcp.close(); mcp = null; await publishers.close(); publishers = null;

    // The original Application helper binds these exact files, settings and
    // SQLite identity. Application Start remains the operator's existing UI.
    const application = await nativeImport(product, AUTHORING_PATH + '/application.mjs');
    const preparedApplication = await application.prepareSheetBestApplication({ workspaceDirectory: product.workspaceDirectory }, {
      runtimeDirectory,
      inputPath: async (path, kind) => {
        const stat = await lstat(path);
        if (kind === 'directory') { assert(stat.isDirectory()); return { path, kind }; }
        assert(stat.isFile()); const content = await readFile(path);
        return { path, kind: 'file', bytes: content.length, sha256: digest(content) };
      },
    });
    assert(preparedApplication.args.includes(product.workspaceDirectory));
    await createOrVerify(join(root, 'application-preparation.json'), bytes(preparedApplication), 1024 * 1024);

    // Independently import both private packets through the same native importer.
    const receivingDirectory = join(directory, 'received-source');
    let receiving;
    try {
      // Same original INIT receipt also resumes a database created before settings publication.
      receiving = await authoring.openSheetBestAuthoring({ directory: receivingDirectory, create: true });
      const received = [];
      let precedingReceipt = null;
      for (const original of state.versions) {
        const key = 'receive-' + original.sourceVersion;
        const packet = JSON.parse(await readPrivate(join(root, original.packet.file), MAX_PACKET_BYTES));
        let step = state.steps[key];
        if (!step) {
          const current = await receiving.status();
          assert.equal(current.draftRevision, precedingReceipt?.draftRevision ?? 0, 'A newer receiving draft must be preserved.');
          assert.equal(current.selectedVersion, null, 'A later receiving source version must be preserved.');
          step = state.steps[key] = { requestId: randomUUID(), expectedDraftRevision: current.draftRevision,
            packetSha256: original.packet.sha256 }; await save();
        }
        assert.equal(step.packetSha256, digest(bytes(packet)));
        const existing = receiving.operation(step.requestId);
        const result = existing ? await receiving.resume(step.requestId) : await receiving.importPacket({
          packet, title: input.title, expectedDraftRevision: step.expectedDraftRevision, requestId: step.requestId });
        assert.equal(result.draftSaved, true);
        assert.equal(result.capture.manifestSha256, original.captureSha256);
        assert.equal(result.capture.rowCount, original.rowCount);
        precedingReceipt = result;
        received.push({ sourceVersion: original.sourceVersion, requestId: step.requestId,
          captureId: result.capture.id, captureSha256: result.capture.manifestSha256 });
        step.complete = true; step.result = result; await save();
      }
      await receiving.close(); receiving = null;
      receiving = await authoring.openSheetBestAuthoring({ directory: receivingDirectory });
      for (const saved of received) {
        const observed = await receiving.inspectCapture(saved.captureId);
        assert.equal(observed.capture.manifestSha256, saved.captureSha256);
      }
      state.received = received; await save();
    } finally { await receiving?.close(); }

    workspace = await authoring.openSheetBestAuthoring({ directory: product.workspaceDirectory });
    for (const original of state.versions) assert.equal(workspace.version(original.sourceVersion).sourceSha256, original.sourceSha256);
    await workspace.close(); workspace = null;
    const result = { schema: SCHEMA, state: 'COMPLETE', operationId: state.id, completedAt: new Date().toISOString(),
      basis, productDirectory: directory, workspaceDirectory: product.workspaceDirectory, editions: state.versions,
      browser: browserResult, mcp: mcpResult, applicationPreparation: 'application-preparation.json',
      publisherPlan: 'publisher-plan-input.json', sourceComparisons: 'source-comparisons.json',
      receivedSource: { directory: receivingDirectory, captures: state.received },
      originalPublicationsPreserved: true, providerReads: 0, newPublications: 0, signatures: 0, payments: 0,
      deployment: 'Original published inputs remain retained. This receiving does not activate a seller, transfer money, or claim customer acceptance.',
    };
    await createOrVerify(resultFile, bytes(result), 8 * 1024 * 1024);
    state.status = 'COMPLETE'; state.resultSha256 = digest(bytes(result)); await save(); return result;
  } catch (error) {
    if (state) { state.status = 'ATTENTION'; state.error = detail(error); await save().catch(() => {}); }
    throw error;
  } finally {
    try { await browser?.close(); }
    finally { try { await mcp?.close(); await publishers?.close(); }
      finally { try { if (service) await service.close(); else await workspace?.close(); }
        finally { await release(); } } }
  }
}
export async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv[0] === '--help') {
    console.log('sheetbest-receive --runtime READY_RUNTIME --directory SAME_PRODUCT --input COMPLETED_INPUT.json [--browser-config PRIVATE_BROWSER.json]');
    return 0;
  }
  const selected = options(argv, ['--runtime', '--directory', '--input', '--browser-config']);
  const result = await receiveAuthoring({ runtimeDirectory: absolute(selected['--runtime']),
    directory: absolute(selected['--directory']), inputFile: absolute(selected['--input']), browserConfigFile: selected['--browser-config'] });
  console.log(JSON.stringify(result, null, 2)); return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(JSON.stringify(detail(error))); process.exitCode = 1;
  });
