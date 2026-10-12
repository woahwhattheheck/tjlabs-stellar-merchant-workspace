#!/usr/bin/env node
// MIT. Continue the original complete native report project through its paid desks.
import { readFile, lstat, chmod } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { privateDirectory, readPrivateJson, atomicJson, withPrivateLock } from '../../routescan/quota.mjs';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { Buyer } from '../../../sf88-operator-buyer-cli/node/index.mjs';
import { need, canonical } from './model.mjs';
import { getQcewEdition, selectQcewPublication } from './project.mjs';
import { qcewMemberBytes } from './files.mjs';
import { normalizeQcewMerchantTerms, qcewPublicationId, QCEW_REPORT_PACKAGE,
  QCEW_PUBLICATION_MAX_BYTES } from './publication-model.mjs';
import { readQcewMerchant } from './merchant.mjs';
import { listQcewPurchases, readQcewPurchaseReceiving } from './purchase.mjs';
import { receiveQcewReportDelivery, readQcewReportReceiving } from './delivery.mjs';
import { readFredProject, exportFredProject } from '../project.mjs';
import { readFredWorkspaceLaunch } from '../launch.mjs';
import { startFredWorkspace } from '../workspace.mjs';
import { FRED_DDP_PROJECT_BUNDLE_MAX_BYTES } from '../ddp/project-validation.mjs';

const SCHEMA = 'stellar-forge.qcew-merchant-journey.v1';
const OPERATION = 'NEED-REGIONAL-REPORTS-9B2C-20261012';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const stamp = () => new Date().toISOString();
async function optionalJson(path, limit = 4 * 1048576) {
  try { return await readPrivateJson(path, limit); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function originalBytes(path, limit) {
  const info = await lstat(path);
  need(info.isFile() && !info.isSymbolicLink() && info.size <= limit,
    'Select the complete original regular file.');
  const bytes = await readFile(path);
  need(bytes.length === info.size, 'The original input changed while being read.');
  return bytes;
}
async function retainBytes(path, bytes) {
  try { await writeBytes(path, bytes, { exclusive: true }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    need((await readBytes(path, Math.max(1, bytes.length))).equals(bytes),
      'This programme retains different original bytes: ' + path);
  }
}
async function originalChain(directory, state, selected) {
  const chain = [], seen = new Set();
  let entry = selected;
  while (entry) {
    need(!seen.has(entry.id), 'The original report predecessor chain repeats an edition.');
    seen.add(entry.id);
    const edition = await getQcewEdition(directory, entry.id);
    need(edition.manifest.manifestSha256 === entry.manifestSha256,
      'Open the complete manifest saved by the original native report.');
    chain.unshift(edition);
    if (entry.previousEditionId === null) break;
    entry = state.qcew.editions.find(item => item.id === entry.previousEditionId);
    need(entry, 'The selected report lost an original predecessor.');
  }
  need(chain.length >= 2, 'Select the original native successor and its complete predecessor chain.');
  return chain;
}
function compareReceiving(received, originals, packageBytes) {
  need(received.bytes.equals(packageBytes) && received.editions.length === originals.length,
    'The receiving changed the original purchased package or complete ancestry.');
  return originals.map((original, index) => {
    const actual = received.editions[index];
    need(canonical(actual.manifest) === canonical(original.manifest) &&
      actual.files.length === original.files.length, 'The received report manifest changed.');
    for (const member of original.files) {
      const selected = actual.files.find(item => item.name === member.name);
      need(selected && qcewMemberBytes(selected).equals(qcewMemberBytes(member)),
        'A received predecessor or current report member changed: ' + member.name);
    }
    return { editionId: original.manifest.editionId, manifestSha256: original.manifest.manifestSha256,
      files: original.files.length, bytes: original.files.reduce((total, member) => total + member.bytes, 0) };
  });
}
export async function runQcewMerchantJourney({ directory, chromium, playwrightModule,
  buyerConfig, paymentFile, origin, path = '/county-reports', facilitator,
  allowLocalFacilitator = false, merchantPort, acceptIndex = 0 } = {}) {
  need([directory, chromium, playwrightModule, buyerConfig, paymentFile].every(value => isAbsolute(value ?? '')),
    'Use the retained native directory and actual installed browser, Buyer and public payment files.');
  need(Number.isInteger(merchantPort) && merchantPort > 0 && merchantPort <= 65535,
    'Select the existing public merchant proxy’s fixed local port.');
  need(Number.isSafeInteger(acceptIndex) && acceptIndex >= 0 && facilitator,
    'Select the original payment alternative and configured native facilitator.');
  directory = await privateDirectory(resolve(directory));
  const nativeBytes = await originalBytes(join(directory, 'native-result.json'), 64 * 1048576);
  const native = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(nativeBytes));
  need(native.schema === 'stellar-forge.qcew-native-result.v1' && native.operation === OPERATION &&
    native.reports?.length >= 2, 'Complete the original source/report programme before its paid continuation.');
  const projectDirectory = join(directory, 'project'), state = await readFredProject(projectDirectory);
  need(state.id === native.project.projectId, 'Continue the same original native production project.');
  const selected = native.reports.at(-1).edition;
  need(state.qcew?.editions.some(item => item.id === selected.id &&
    item.manifestSha256 === selected.manifestSha256), 'Select the last actual native report.');
  const originals = await originalChain(projectDirectory, state, selected);
  need(native.reports.every(item => originals.some(original => original.entry.id === item.edition.id &&
    original.entry.manifestSha256 === item.edition.manifestSha256)),
    'The paid report must retain every original native report in its ancestry.');
  const paymentBytes = await originalBytes(resolve(paymentFile), 65536);
  const payment = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(paymentBytes));
  need(payment.network === 'stellar:testnet', 'Use the installation’s public Stellar testnet payment selection.');
  const terms = normalizeQcewMerchantTerms({ origin, path, payment });
  const launchOptions = { directory: projectDirectory, buyerConfig: resolve(buyerConfig), facilitator,
    allowLocalFacilitator, merchantPort };
  const launch = await readFredWorkspaceLaunch(launchOptions);
  need(launch.buyerSettings && launch.binding.buyerConfig, 'Select the existing configured SF88 Buyer.');
  const buyer = new Buyer(launch.buyerSettings);
  const publicationId = qcewPublicationId({ editionId: selected.id, ...terms });
  const root = await privateDirectory(join(directory, 'merchant-workspace'));
  const receiver = join(root, 'customer-report'), independent = join(root, 'independent-report');
  const projectReceiver = join(root, 'received-project');
  const identity = { operation: OPERATION, projectId: state.id, projectDirectory,
    editions: originals.map(item => ({ id: item.entry.id, manifestSha256: item.entry.manifestSha256 })),
    publicationId, bindingSha256: launch.binding.sha256,
    buyerSettingsSha256: launch.binding.buyerConfig.settingsSha256, paymentSha256: sha256(paymentBytes),
    payment: { network: payment.network, asset: payment.asset, amount: payment.amount },
    origin: terms.origin, path: terms.path, facilitator: launch.binding.facilitator, merchantPort, acceptIndex,
    customerReceivingDirectory: receiver, independentReceivingDirectory: independent,
    projectReceivingDirectory: projectReceiver };
  return withPrivateLock(root, 'journey.lock', async () => {
    const retained = await optionalJson(join(root, 'journey.json'), 16 * 1048576);
    need(!retained || retained.schema === SCHEMA && canonical(retained.identity) === canonical(identity),
      'Continue the paid programme with its original project, terms, Buyer binding and destinations.');
    const journal = retained ?? { schema: SCHEMA, identity, startedAt: stamp(),
      originalNativeResultSha256: sha256(nativeBytes), steps: [], actions: {}, purchases: null };
    journal.status = 'running'; delete journal.error;
    const save = () => atomicJson(root, 'journey.json', journal);
    const step = async (name, work) => {
      const startedAt = stamp(), result = await work();
      const entry = { name, startedAt, completedAt: stamp(), result };
      journal.steps = journal.steps.filter(item => item.name !== name).concat(entry);
      await save(); console.log(JSON.stringify({ event: 'qcew_merchant_step', ...entry }));
      return result;
    };
    const originalNativePath = join(root, 'original-native-result.json');
    let originalNative;
    try { originalNative = await originalBytes(originalNativePath, 64 * 1048576); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      need(sha256(nativeBytes) === journal.originalNativeResultSha256,
        'Recover the programme’s original native result before continuing its paid selections.');
      await retainBytes(originalNativePath, nativeBytes); originalNative = nativeBytes;
    }
    need(sha256(originalNative) === journal.originalNativeResultSha256,
      'The programme’s retained original native result changed.');
    await retainBytes(join(root, 'public-payment.json'), paymentBytes);
    await save();
    let browser, context, workspace, spareWorkspace, page, dispatch = null, publicationDirectory, merchant;
    const browserErrors = [];
    const environment = { ...process.env, FRED_QCEW_CHROMIUM: resolve(chromium) };
    const launchArgs = { ...launchOptions, expectedBindingSha256: launch.binding.sha256, environment };
    const ordinarySummary = request => {
      if (!request.bundle) return copy(request);
      const { bundle, ...rest } = request;
      return { ...rest, bundle: { schema: bundle.schema, bundleSha256: bundle.bundleSha256 } };
    };
    const openPage = async selectedWorkspace => {
      context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, acceptDownloads: true });
      page = await context.newPage(); page.setDefaultTimeout(120000);
      page.on('pageerror', error => browserErrors.push(error.message));
      await page.route(/\/api\/(?:qcew\/)?action(?:\?.*)?$/, async route => {
        const request = route.request();
        if (request.method() !== 'POST') return route.continue();
        const active = dispatch;
        if (!active) return route.abort('failed');
        try {
          active.seen = true;
          const body = request.postDataJSON();
          need(active.allowedActions.includes(body.action), 'The browser dispatched another selected action.');
          for (const [key, value] of Object.entries(active.expected))
            need(canonical(body[key]) === canonical(value), 'The browser changed its saved action field: ' + key);
          const summary = ordinarySummary(body), digest = sha256(request.postData() ?? '');
          const previous = active.record.requests.find(item => item.id === body.id && item.action === body.action);
          if (previous) need(previous.sha256 === digest, 'The original browser action payload changed.');
          else active.record.requests.push({ id: body.id, action: body.action, sha256: digest,
            request: summary, dispatchedAt: stamp() });
          await save(); // The exact intent, original action ID and destination precede network dispatch.
          const response = await route.fetch({ timeout: 0 });
          const value = await response.json();
          active.record.lastResponse = { status: response.status(), at: stamp(), value };
          await save();
          if (active.loseReturn) {
            active.record.returnWithheld = true; await save();
            await route.abort('failed').catch(() => {});
          } else await route.fulfill({ response }).catch(error => {
            active.record.browserReturnError = error.message;
          });
          active.resolve({ ok: response.ok(), status: response.status(), value });
        } catch (error) {
          active.record.transportError = { code: error.code ?? null, message: error.message, at: stamp() };
          await save().catch(() => {});
          await route.abort('failed').catch(() => {}); active.reject(error);
        }
      });
      await page.goto(selectedWorkspace.url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(id => document.getElementById('project-title')?.textContent.includes('revision') &&
        document.getElementById('qcew-merchant-edition')?.options.length > 0 &&
        !document.getElementById('buyer-status')?.textContent.startsWith('Loading'), state.id);
      await page.locator('[data-tab="county"]').click();
      await page.waitForFunction(() => document.getElementById('qcew-open-edition') &&
        !document.getElementById('qcew-open-edition').disabled);
      return page;
    };
    const invoke = async (name, expected, work, { loseReturn = false, allowError = false,
      allowedActions = [expected.action] } = {}) => {
      need(!dispatch, 'Complete the original browser action before choosing another.');
      const selection = copy(expected), record = journal.actions[name] ??
        { selection, requests: [], selectedAt: stamp() };
      need(canonical(record.selection) === canonical(selection), 'The saved browser action selection changed.');
      journal.actions[name] = record; await save();
      let resolveReturn, rejectReturn;
      const result = new Promise((resolve, reject) => { resolveReturn = resolve; rejectReturn = reject; });
      result.catch(() => {});
      const active = { expected: selection, allowedActions, record, loseReturn, seen: false,
        resolve: resolveReturn, reject: rejectReturn };
      dispatch = active;
      const timer = setTimeout(() => {
        if (!active.seen) rejectReturn(new Error('The selected browser action did not reach its saved HTTP dispatch.'));
      }, 120000);
      try {
        await work();
        const received = await result;
        need(allowError || received.ok, received.value?.message ?? 'The original native action failed.',
          received.value?.code ?? 'QCEW_MERCHANT_ACTION_FAILED');
        const control = { 'qcew.publish': 'publish-button', 'merchant-start': 'merchant-start',
          prepare: 'prepare', buy: 'buy', recover: 'recover',
          'receive-county-purchase': 'county-receive-purchase', 'qcew.receive': 'qcew-receive',
          'qcew.continue': 'qcew-open-edition' }[expected.action];
        if (!loseReturn && control) await page.waitForFunction(id =>
          document.getElementById(id) && !document.getElementById(id).disabled, control);
        return received;
      } finally { clearTimeout(timer); dispatch = null; }
    };
    const screenshot = async name => {
      const path = join(root, name);
      await page.screenshot({ path, fullPage: true }); await chmod(path, 0o600);
      const bytes = await originalBytes(path, 32 * 1048576);
      return { path, bytes: bytes.length, sha256: sha256(bytes) };
    };
    const download = async (button, destination, expected, limit = QCEW_PUBLICATION_MAX_BYTES) => {
      try {
        const bytes = await originalBytes(destination, limit);
        need(!expected || bytes.length === expected.bytes && sha256(bytes) === expected.sha256,
          'The retained browser download changed.');
        return { path: destination, bytes: bytes.length, sha256: sha256(bytes), reused: true };
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const waiting = page.waitForEvent('download', { timeout: 120000 });
      await button.click();
      const item = await waiting; await item.saveAs(destination); await chmod(destination, 0o600);
      const bytes = await originalBytes(destination, limit);
      need(!expected || bytes.length === expected.bytes && sha256(bytes) === expected.sha256,
        'The actual browser download differs from the original offered bytes.');
      return { path: destination, filename: item.suggestedFilename(), bytes: bytes.length, sha256: sha256(bytes) };
    };
    const openMerchant = async () => {
      await page.locator('[data-tab="publication"]').click();
      await page.locator('#publication-select').selectOption(publicationId);
      await page.locator('#open-publication').click();
      await page.waitForFunction(id => document.getElementById('publication-detail')?.textContent.includes(id), selected.id);
    };
    const startMerchant = async name => {
      await openMerchant();
      const response = await invoke(name, { action: 'merchant-start', publicationId },
        () => page.locator('#merchant-start').click());
      need(response.value.publicationId === publicationId && response.value.kind === 'QCEW' &&
        response.value.mode === 'NATIVE_SELLER' &&
        Number(new URL(response.value.url).port) === merchantPort,
        'Start the selected original native county merchant on its public proxy port.');
      return response.value;
    };
    const restart = async name => {
      const previousOrigin = workspace.origin;
      await context?.close(); context = null;
      spareWorkspace = await startFredWorkspace(launchArgs);
      need(spareWorkspace.origin !== previousOrigin, 'Reopen on a new private browser origin.');
      await workspace.close(); workspace = spareWorkspace; spareWorkspace = null;
      await openPage(workspace);
      await startMerchant(name);
      return { previousOrigin, currentOrigin: workspace.origin, bindingSha256: workspace.startup.binding.sha256 };
    };
    const openCustomer = async purchase => {
      await page.locator('[data-tab="customer"]').click();
      await page.locator('#customer-publication').selectOption(publicationId);
      await page.waitForFunction(files => {
        const control = document.getElementById('customer-file');
        return control && files.every(path => [...control.options].some(option => option.value === path));
      }, merchant.plan.downloads.map(item => item.path));
      await page.locator('#customer-file').selectOption(purchase.file);
      await page.locator('#intent').fill(purchase.intentId);
      await page.locator('#accept-index').fill(String(acceptIndex));
      const requests = await listQcewPurchases(publicationDirectory);
      if (requests.some(item => item.intentId === purchase.intentId)) {
        await page.waitForFunction(intentId => [...document.getElementById('request-select').options]
          .some(option => option.value === intentId), purchase.intentId);
        await page.locator('#request-select').selectOption(purchase.intentId);
        await page.locator('#open-request').click();
        await page.waitForFunction(expected => document.getElementById('intent').value === expected.intentId &&
          document.getElementById('customer-file').value === expected.file, purchase);
      }
    };
    const checkedPrepared = async purchase => {
      const prepared = await optionalJson(join(publicationDirectory, 'customer-requests',
        purchase.intentId, 'prepared.json'), 131072);
      if (prepared) need(prepared.intentId === purchase.intentId && prepared.publicationId === publicationId &&
        prepared.file === purchase.file && canonical(prepared.expected) === canonical(purchase.expected) &&
        prepared.config.preparedFrom.acceptIndex === acceptIndex,
        'The retained payment intent belongs to another original report resource.');
      return prepared;
    };
    const recoveredNative = async purchase => {
      const operation = buyer.operation(purchase.intentId);
      const metadata = await optionalJson(join(operation.directory, 'operation.json'), 65536);
      if (!metadata) return null;
      need(metadata.intentId === purchase.intentId && metadata.state === 'PREPARED',
        'Continue the original native Buyer preparation for ' + purchase.intentId + '.');
      return operation.recover();
    };
    const retainNative = async purchase => {
      const result = await recoveredNative(purchase);
      need(result, 'Read the completed original native Buyer result for ' + purchase.intentId + '.');
      result.raiseForStatus();
      const bytes = await result.bytes({ limit: Math.max(1, purchase.expected.bytes) });
      need(bytes.length === purchase.expected.bytes && sha256(bytes) === purchase.expected.sha256,
        'The native paid response changed its original report bytes.');
      const resultBytes = jsonBytes(result.record);
      await retainBytes(join(purchase.directory, 'buyer-result.json'), resultBytes);
      return { intentId: purchase.intentId, file: purchase.file, bytes: bytes.length, sha256: sha256(bytes),
        nativeConfigSha256: result.record.configSha256, nativeStatus: result.status,
        httpStatus: result.native.httpStatus, resultSha256: sha256(resultBytes),
        buyerOperationDirectory: buyer.operation(purchase.intentId).directory };
    };
    const restoreBrowserAction = async (name, inputFile = null) => {
      const retainedRequest = journal.actions[name]?.requests.find(item =>
        ['qcew.publish', 'qcew.receive'].includes(item.action));
      need(retainedRequest, 'Read the original browser request selected before its interrupted dispatch.');
      if (inputFile) await page.locator('#qcew-receive-file').setInputFiles(inputFile);
      await page.evaluate(async ({ projectId, original, input }) => {
        const request = { ...original.request };
        let file = null;
        if (input) {
          const blob = document.getElementById('qcew-receive-file').files[0];
          if (!blob) throw new Error('Restore the original complete project file.');
          delete request.bundle;
          file = { blob, name: blob.name, bytes: blob.size, field: 'bundle' };
        }
        const record = { schema: 'fred-qcew-browser-request.v1', projectId,
          request, file, phase: 'prepared', preparedAt: original.dispatchedAt };
        const db = await new Promise((resolve, reject) => {
          const open = indexedDB.open('fred-county-report-workspace', 1);
          open.onupgradeneeded = () => open.result.createObjectStore('saved');
          open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
        });
        try {
          await new Promise((resolve, reject) => {
            const transaction = db.transaction('saved', 'readwrite');
            transaction.objectStore('saved').put(record, 'request:' + projectId);
            transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
          });
        } finally { db.close(); }
      }, { projectId: state.id, original: retainedRequest, input: Boolean(inputFile) });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-tab="county"]').click();
      await page.waitForFunction(() => document.getElementById('qcew-resume') &&
        !document.getElementById('qcew-resume').disabled);
      return retainedRequest;
    };
    try {
      const runtime = await import(pathToFileURL(resolve(playwrightModule)).href);
      const installed = runtime.chromium ?? runtime.default?.chromium;
      need(installed?.launch, 'Use the installed Playwright module and Chromium.');
      browser = await installed.launch({ executablePath: resolve(chromium), headless: true, args: ['--no-sandbox'] });
      workspace = await startFredWorkspace(launchArgs);
      need(workspace.startup.binding.sha256 === identity.bindingSha256 && workspace.startup.buyerConfigured,
        'The running workspace changed its original Buyer binding.');
      await openPage(workspace);
      await step('publish_original_native_report', async () => {
        let current = await readFredProject(projectDirectory);
        if (!current.qcew.publications?.some(item => item.id === publicationId)) {
          const host = await optionalJson(join(projectDirectory, 'qcew-workspace', 'operation.json'), 65536);
          if (host?.action === 'qcew.publish' && host.selection.editionId === selected.id &&
              host.selection.origin === terms.origin && host.selection.path === terms.path &&
              !['completed', 'cleared'].includes(host.phase)) {
            const savedInput = await readPrivateJson(join(projectDirectory, 'qcew-workspace', 'input.json'), 131072);
            need(canonical(savedInput.payment) === canonical(payment),
              'The retained original publication has different public payment terms.');
            await page.locator('[data-tab="publication"]').click();
            await invoke('continue-publication', { action: 'qcew.continue', id: host.id,
              requestSha256: host.requestSha256 }, () => page.locator('#county-publish-continue').click());
          } else if (journal.actions.publication?.requests.length) {
            await restoreBrowserAction('publication');
            await page.locator('[data-tab="publication"]').click();
            await invoke('publication', { action: 'qcew.publish', editionId: selected.id, ...terms },
              () => page.locator('#county-publish-continue').click());
          } else {
            await page.locator('#qcew-edition').selectOption(selected.id);
            await page.locator('#qcew-publish-selected').click();
            await page.locator('#public-origin').fill(terms.origin);
            await page.locator('#public-path').fill(terms.path);
            await page.locator('#payment').fill(JSON.stringify(payment, null, 2));
            await invoke('publication', { action: 'qcew.publish', editionId: selected.id, ...terms },
              () => page.locator('#publish-button').click());
          }
          current = await readFredProject(projectDirectory);
        }
        const record = current.qcew.publications?.find(item => item.id === publicationId);
        need(record, 'The original publication did not reach its saved project history.');
        const originalId = journal.actions.publication?.requests[0]?.id ??
          journal.actions['continue-publication']?.requests[0]?.request.id;
        const history = current.operations.filter(item => item.kind === 'qcew.publish' &&
          item.result.publicationId === publicationId && (!originalId || item.id === originalId));
        need(history.length > 0, 'Recover the original publication from its project transaction.');
        publicationDirectory = await selectQcewPublication(projectDirectory, publicationId);
        merchant = await readQcewMerchant(publicationDirectory);
        need(merchant.plan.publicationId === publicationId &&
          merchant.edition.predecessorEditions === originals.length - 1,
          'The native publication lost its original report ancestry.');
        journal.publication = { id: publicationId, originalRequestId: history.at(-1).id,
          planSha256: merchant.plan.planSha256, deliverySha256: merchant.plan.deliverySha256 };
        const prefix = 'qcew-' + sha256(Buffer.from(canonical({ root, publicationId }))).slice(0, 20);
        const purchases = merchant.plan.downloads.map(expected => ({
          intentId: prefix + '-' + expected.path.replace(/[^a-z0-9]/g, '-'), file: expected.path,
          expected: copy(expected), directory: join(root, 'purchases', expected.path),
          download: join(root, 'purchases', expected.path, expected.path),
          ...(expected.path === QCEW_REPORT_PACKAGE ? { receivingDirectory: receiver } : {})
        }));
        need(!journal.purchases || canonical(journal.purchases) === canonical(purchases),
          'Continue the same original advertised files and native payment intents.');
        journal.purchases = purchases;
        for (const purchase of purchases) await privateDirectory(purchase.directory);
        await save(); // Save every payment intent and complete-package destination before preparing any purchase.
        await openMerchant();
        return { ...journal.publication, editionId: selected.id, resources: merchant.plan.downloads.length,
          packageBytes: merchant.deliveryBytes.length, packageSha256: sha256(merchant.deliveryBytes),
          screenshot: await screenshot('merchant-publication.png') };
      });
      await step('start_original_native_seller', () => startMerchant('merchant-start'));
      await step('reopen_catalogue_after_interrupted_preparation', async () => {
        const complete = journal.purchases.find(item => item.file === QCEW_REPORT_PACKAGE);
        const invalid = { ...complete, intentId: complete.intentId + '-invalid' };
        const previous = journal.actions['invalid-accept'];
        if (!previous?.lastResponse) {
          await openCustomer(invalid);
          const offer = merchant.offers.find(item =>
            (typeof item.resource === 'string' ? item.resource : item.resource?.url) === complete.expected.resource);
          const invalidIndex = Array.isArray(offer?.accepts) ? offer.accepts.length : 1000000;
          await page.locator('#accept-index').fill(String(invalidIndex));
          const response = await invoke('invalid-accept', { action: 'prepare', publicationId,
            intentId: invalid.intentId, file: invalid.file, acceptIndex: invalidIndex },
            () => page.locator('#prepare').click(), { allowError: true });
          need(!response.ok && response.value.code === 'DISCOVERY_ACCEPT_NOT_FOUND',
            'The unavailable original payment alternative must return its actual native preparation error.');
        }
        need(journal.actions['invalid-accept'].lastResponse.value.code === 'DISCOVERY_ACCEPT_NOT_FOUND',
          'Reopen the original rejected payment-alternative preparation.');
        const prepared = await optionalJson(join(publicationDirectory, 'customer-requests',
          invalid.intentId, 'prepared.json'), 131072);
        const orphan = await lstat(join(publicationDirectory, 'customer-requests', invalid.intentId));
        need(!prepared && orphan.isDirectory(), 'Read the actual interrupted preparation directory.');
        const requests = await listQcewPurchases(publicationDirectory);
        need(!requests.some(item => item.intentId === invalid.intentId),
          'The incomplete preparation must not replace the saved customer request catalogue.');
        await openMerchant();
        await openCustomer(complete);
        return { intentId: invalid.intentId, status: 'PREPARATION_REJECTED', savedRequests: requests.length,
          errorCode: journal.actions['invalid-accept'].lastResponse.value.code };
      });
      for (const purchase of journal.purchases) {
        await step('buy_and_download_' + purchase.file, async () => {
          await openCustomer(purchase);
          let prepared = await checkedPrepared(purchase);
          if (!prepared) {
            try {
              await invoke('prepare-' + purchase.file, { action: 'prepare', publicationId,
                intentId: purchase.intentId, file: purchase.file, acceptIndex },
                () => page.locator('#prepare').click());
            } catch (error) {
              if (!await checkedPrepared(purchase)) throw error;
            }
            prepared = await checkedPrepared(purchase);
          }
          need(prepared, 'Retain the complete original prepared report purchase.');
          let nativeResult = await recoveredNative(purchase);
          const operation = buyer.operation(purchase.intentId);
          const attempt = await optionalJson(join(operation.directory, 'attempt.json'), 131072);
          let delivery;
          if (nativeResult || attempt) {
            const response = await invoke('recover-' + purchase.file, { action: 'recover', publicationId,
              intentId: purchase.intentId }, () => page.locator('#recover').click());
            delivery = response.value;
          } else {
            const loseReturn = purchase.file === QCEW_REPORT_PACKAGE &&
              !journal.actions['buy-' + purchase.file]?.returnWithheld;
            try {
              const response = await invoke('buy-' + purchase.file, { action: 'buy', publicationId,
                intentId: purchase.intentId }, () => page.locator('#buy').click(), { loseReturn });
              delivery = response.value;
            } catch (error) {
              nativeResult = await recoveredNative(purchase);
              if (!nativeResult) throw error;
              nativeResult.raiseForStatus();
              delivery = { state: 'DELIVERED', intentId: purchase.intentId };
            }
            if (loseReturn) {
              const changed = await restart('merchant-restart-after-purchase');
              await openCustomer(purchase);
              const recovered = await invoke('recover-' + purchase.file, { action: 'recover', publicationId,
                intentId: purchase.intentId }, () => page.locator('#recover').click());
              delivery = recovered.value;
              journal.purchaseRestart = { ...changed, intentId: purchase.intentId, returnWithheld: true };
              await save();
            }
          }
          need(delivery?.state === 'DELIVERED' && delivery.intentId === purchase.intentId,
            'Continue the retained native Buyer operation ' + purchase.intentId + ' from its saved ' +
              String(delivery?.state ?? 'result') + '.', 'QCEW_ORIGINAL_BUYER_CONTINUATION');
          const native = await retainNative(purchase);
          const downloaded = await download(page.locator('#download-customer'), purchase.download, purchase.expected);
          const source = await readBytes(join(publicationDirectory, purchase.file), Math.max(1, purchase.expected.bytes));
          const actual = await originalBytes(purchase.download, QCEW_PUBLICATION_MAX_BYTES);
          need(source.equals(actual), 'The paid browser download differs from the retained merchant bytes.');
          return { ...native, downloaded };
        });
      }
      const packagePurchase = journal.purchases.find(item => item.file === QCEW_REPORT_PACKAGE);
      const packageBytes = await originalBytes(packagePurchase.download, QCEW_PUBLICATION_MAX_BYTES);
      await step('receive_original_purchased_ancestry', async () => {
        await openCustomer(packagePurchase);
        const retainedReceiving = await optionalJson(join(publicationDirectory, 'customer-requests',
          packagePurchase.intentId, 'receiving-request.json'), 131072);
        if (retainedReceiving) need(retainedReceiving.directory === receiver &&
          retainedReceiving.packageSha256 === packagePurchase.expected.sha256,
          'Continue this original purchase’s saved receiving destination.');
        let receiving = null;
        try { receiving = await readQcewPurchaseReceiving({ directory: publicationDirectory, intentId: packagePurchase.intentId }); }
        catch (error) { if (!['ENOENT', 'QCEW_RECEIVING_NOT_SELECTED'].includes(error.code)) throw error; }
        if (!receiving) {
          await page.locator('#county-purchase-directory').fill(receiver);
          const loseReturn = !journal.actions['receive-purchase']?.returnWithheld;
          await invoke('receive-purchase', { action: 'receive-county-purchase', publicationId,
            intentId: packagePurchase.intentId, receivingDirectory: receiver },
            () => page.locator('#county-receive-purchase').click(), { loseReturn });
          if (loseReturn) {
            const changed = await restart('merchant-restart-after-receiving');
            await openCustomer(packagePurchase);
            journal.receivingRestart = { ...changed, intentId: packagePurchase.intentId,
              directory: receiver, returnWithheld: true };
            await save();
          }
        }
        await page.locator('#county-open-receiving').click();
        await page.waitForFunction(expected => document.getElementById('county-customer-status')?.textContent.includes(expected),
          receiver);
        receiving = await readQcewPurchaseReceiving({ directory: publicationDirectory, intentId: packagePurchase.intentId });
        const editions = compareReceiving(receiving, originals, packageBytes);
        const receivedDownloads = await privateDirectory(join(root, 'received-downloads'));
        const downloads = [];
        for (const edition of originals) {
          await page.locator('#county-received-edition').selectOption(edition.manifest.editionId);
          const target = await privateDirectory(join(receivedDownloads, edition.manifest.editionId));
          for (const file of edition.manifest.files) downloads.push({
            editionId: edition.manifest.editionId, file: file.name,
            ...await download(page.locator('#county-customer-downloads').getByRole('button', { name: file.name, exact: true }),
              join(target, file.name), file)
          });
        }
        const complete = await download(page.locator('#county-customer-downloads').getByRole('button',
          { name: 'Complete received report package', exact: true }),
          join(receivedDownloads, QCEW_REPORT_PACKAGE), packagePurchase.expected);
        const result = { intentId: packagePurchase.intentId, directory: receiver,
          receipt: receiving.receipt, editions, complete, downloads,
          screenshot: await screenshot('customer-complete-receiving.png') };
        await page.setViewportSize({ width: 390, height: 844 });
        result.phoneScreenshot = await screenshot('customer-receiving-phone.png');
        await page.setViewportSize({ width: 1440, height: 1040 });
        return result;
      });
      await step('independently_receive_and_reopen_complete_paid_package', async () => {
        await receiveQcewReportDelivery({ directory: independent, bytes: packageBytes });
        const reopened = await readQcewReportReceiving(independent);
        return { directory: independent, receipt: reopened.receipt,
          editions: compareReceiving(reopened, originals, packageBytes) };
      });
      const bundleFile = join(root, 'complete-paid-project.json');
      await step('download_complete_outer_v6_project', async () => {
        await page.locator('[data-tab="county"]').click();
        const prior = journal.projectTransfer;
        const downloaded = await download(page.locator('#qcew-export-project'), bundleFile, prior?.file ?? null,
          FRED_DDP_PROJECT_BUNDLE_MAX_BYTES);
        const bundle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
          await originalBytes(bundleFile, FRED_DDP_PROJECT_BUNDLE_MAX_BYTES)));
        need(bundle.schema === 'stellar-forge.fred-project-bundle.v6' && bundle.state.id === state.id &&
          bundle.state.qcew.publications.some(item => item.id === publicationId),
          'Export the complete original outer-v6 economic project with its retained paid publication.');
        const published = bundle.qcew.publications.find(item => item.plan.publicationId === publicationId);
        need(published && canonical(published.plan) === canonical(merchant.plan) &&
          Buffer.from(published.delivery.body, 'base64').equals(packageBytes),
          'The complete project export changed its retained publication plan or original gzip.');
        const transfer = { bundleSha256: bundle.bundleSha256, directory: projectReceiver,
          projectId: state.id, publicationId, file: { bytes: downloaded.bytes, sha256: downloaded.sha256 } };
        need(!prior || canonical(prior) === canonical(transfer), 'Continue the original complete project transfer.');
        journal.projectTransfer = transfer; await save();
        return { schema: bundle.schema, bundleSha256: bundle.bundleSha256,
          publications: bundle.state.qcew.publications.length, downloaded };
      });
      await step('receive_and_reopen_complete_paid_project', async () => {
        let current = await readFredProject(projectDirectory);
        let complete = current.operations.find(item => item.kind === 'qcew.receive' &&
          item.result.directory === projectReceiver && item.result.projectId === state.id);
        if (!complete) {
          await page.locator('[data-tab="county"]').click();
          const host = await optionalJson(join(projectDirectory, 'qcew-workspace', 'operation.json'), 65536);
          if (host?.action === 'qcew.receive' && host.selection.targetDirectory === projectReceiver &&
              !['completed', 'cleared'].includes(host.phase)) {
            need(host.selection.bundleSha256 === journal.projectTransfer.bundleSha256,
              'Continue the original complete project handover.');
            await invoke('continue-project-receiving', { action: 'qcew.continue', id: host.id,
              requestSha256: host.requestSha256 }, () => page.locator('#qcew-resume').click());
          } else if (journal.actions['project-receiving']?.requests.length) {
            await restoreBrowserAction('project-receiving', bundleFile);
            await invoke('project-receiving', { action: 'qcew.receive', targetDirectory: projectReceiver },
              () => page.locator('#qcew-resume').click());
          } else {
            await page.locator('#qcew-receive-file').setInputFiles(bundleFile);
            await page.locator('#qcew-receive-directory').fill(projectReceiver);
            await invoke('project-receiving', { action: 'qcew.receive', targetDirectory: projectReceiver },
              () => page.locator('#qcew-receive').click());
          }
          current = await readFredProject(projectDirectory);
          complete = current.operations.find(item => item.kind === 'qcew.receive' &&
            item.result.directory === projectReceiver && item.result.projectId === state.id);
        }
        need(complete, 'Receive the original complete project through its saved browser operation.');
        const receivedMerchant = await readQcewMerchant(await selectQcewPublication(projectReceiver, publicationId));
        need(canonical(receivedMerchant.plan) === canonical(merchant.plan) &&
          receivedMerchant.deliveryBytes.equals(packageBytes),
          'The independently received project changed its publication or original paid gzip.');
        for (const original of originals) {
          const received = await getQcewEdition(projectReceiver, original.entry.id);
          need(canonical(received.manifest) === canonical(original.manifest) &&
            canonical(received.files) === canonical(original.files),
            'The complete project handover changed an original report or predecessor.');
        }
        const exported = await exportFredProject({ directory: projectReceiver });
        need(exported.schema === 'stellar-forge.fred-project-bundle.v6' &&
          exported.bundleSha256 === journal.projectTransfer.bundleSha256,
          'The independently received project must export the same complete outer-v6 handover.');
        await context.close(); context = null;
        await workspace.close(); workspace = null;
        workspace = await startFredWorkspace({ directory: projectReceiver, environment });
        await openPage(workspace); await openMerchant();
        return { originalRequestId: complete.id, projectId: state.id, directory: projectReceiver,
          bundleSha256: exported.bundleSha256, publicationId, planSha256: receivedMerchant.plan.planSha256,
          originalPackageSha256: sha256(receivedMerchant.deliveryBytes),
          screenshot: await screenshot('independent-received-project.png') };
      });
      need(browserErrors.length === 0, 'The native paid browser encountered JavaScript errors: ' + browserErrors.join('; '));
      journal.status = 'completed'; journal.completedAt = stamp();
      journal.result = { schema: 'stellar-forge.qcew-merchant-result.v1', operation: OPERATION,
        projectId: state.id, publication: journal.publication, payment: identity.payment,
        bindingSha256: identity.bindingSha256, buyerSettingsSha256: identity.buyerSettingsSha256,
        originalNativeResultSha256: journal.originalNativeResultSha256,
        purchases: journal.purchases.map(item => ({ intentId: item.intentId, file: item.file,
          bytes: item.expected.bytes, sha256: item.expected.sha256 })),
        customerReceivingDirectory: receiver, independentReceivingDirectory: independent,
        projectTransfer: journal.projectTransfer, purchaseRestart: journal.purchaseRestart ?? null,
        receivingRestart: journal.receivingRestart ?? null,
        startedAt: journal.startedAt, completedAt: journal.completedAt,
        runtime: { node: process.version, platform: process.platform, chromium: resolve(chromium),
          playwrightModule: resolve(playwrightModule) }, steps: journal.steps };
      await save(); await atomicJson(root, 'merchant-result.json', journal.result);
      console.log(JSON.stringify({ event: 'qcew_merchant_complete', result: journal.result }));
      return journal.result;
    } catch (error) {
      journal.status = 'interrupted'; journal.interruptedAt = stamp();
      journal.error = { code: error.code ?? 'QCEW_MERCHANT_JOURNEY_FAILED', message: error.message };
      await save(); throw error;
    } finally {
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
      await spareWorkspace?.close().catch(() => {});
      await workspace?.close().catch(() => {});
    }
  });
}
async function main(args = process.argv.slice(2)) {
  const flags = {}, values = new Set(['directory', 'chromium', 'playwright-module', 'buyer-config',
    'payment', 'origin', 'path', 'facilitator', 'merchant-port', 'accept-index']);
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    need(/^--[a-z-]+$/.test(argument), 'Select the original native paid programme options.');
    const name = argument.slice(2);
    need(flags[name] === undefined, 'Use each native paid programme option once.');
    if (name === 'allow-local-facilitator') { flags[name] = true; continue; }
    need(values.has(name) && args[index + 1] && !args[index + 1].startsWith('--'),
      'Supply the selected native paid programme option value.');
    flags[name] = args[++index];
  }
  return runQcewMerchantJourney({ directory: flags.directory, chromium: flags.chromium,
    playwrightModule: flags['playwright-module'], buyerConfig: flags['buyer-config'], paymentFile: flags.payment,
    origin: flags.origin, path: flags.path ?? '/county-reports', facilitator: flags.facilitator,
    allowLocalFacilitator: Boolean(flags['allow-local-facilitator']),
    merchantPort: Number(flags['merchant-port']), acceptIndex: Number(flags['accept-index'] ?? 0) });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(JSON.stringify({ code: error.code ?? 'QCEW_MERCHANT_JOURNEY_FAILED',
    message: error.message })); process.exitCode = 1; });
