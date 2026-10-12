#!/usr/bin/env node
// MIT. Two complete customer periods in the original merchant and recipe receiving operation.
import assert from 'node:assert/strict';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMerchantMcp } from '../serve.mjs';
import { readMerchantConfig } from '../config.mjs';
import { canonical } from '../console/records.mjs';
import { MerchantWorkflowSeriesClient, writeWorkflowSeriesFile } from '../console/workflow-series-client.mjs';
import { reopenWorkflowSeriesHandover } from '../console/workflow-series-handover.mjs';
import { cycleId } from '../console/workflow-series-records.mjs';
import { receiveMerchantWorkflowRecipes } from './workflow-recipes-journey.mjs';
import { readCompletedWorkflowCalls, verifyRetainedNativeCall } from './workflow-native-recovery.mjs';
import { verifyNativeArtifacts, prepareNativeArtifactReport, retainNativeInspection, nativeReceivingAccessToken, writeNativeArtifactSelection } from './workflow-native-artifacts.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(done => setTimeout(done, ms));
async function optional(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}
function planningWindow() {
  const now = new Date(), year = now.getUTCFullYear(), month = now.getUTCMonth();
  return { from: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(year, month + 2, 0)).toISOString().slice(0, 10) };
}
async function reopenCompletedSeries({ directory, report, recipe, sourceCommit, openSession }) {
  const token = await nativeReceivingAccessToken(directory), hosts = [], clients = [];
  const baseline = await optional(join(directory, 'workflow-native-run.json'));
  assert.equal(baseline?.result, 'PASS'); assert.equal(baseline.profileId, report.baseline.profileId);
  const baselinePacket = JSON.parse(await readFile(join(directory, 'workflow-complete-profile.json'), 'utf8'));
  const { contentSha256, ...originalBaseline } = baselinePacket;
  assert.equal(sha(canonical(originalBaseline)), contentSha256);
  assert.equal(baselinePacket.profile.id, baseline.profileId);
  assert.equal(baselinePacket.calls.length, baseline.nativeCalls?.length ?? 7);
  const observed = { operationId: report.operationId, sourceCommit, directory,
    seriesId: report.seriesId, reopenedAt: new Date().toISOString(), workspaces: [], customers: [] };
  try {
    for (const role of ['source', 'receiver']) {
      const host = await openSession({ configPath: join(directory, 'merchant', 'merchant-mcp.json'), port: 0,
        environment: { ...process.env, MCP_ACCESS_TOKEN: token }, consoleDirectory: join(directory, role + '-console') });
      hosts.push(host);
      const selected = new MerchantWorkflowSeriesClient({ url: host.consoleUrl, environment: { MCP_ACCESS_TOKEN: token } });
      clients.push(selected);
      const current = await selected.host();
      assert.equal(current.console.workspaceId, report.workspaces[role]);
      assert.equal(current.operator.managesRunningSeller, false);
      const series = await selected.series(report.seriesId);
      assert.equal(series.total, 2);
      assert.equal(series.cycles.filter(value => value.state === 'COMPLETE').length, 2);
      const customerProfile = await selected.profile(report.profileId);
      const baselineProfile = await selected.profile(report.baseline.profileId);
      assert.equal(customerProfile.calls.length, 24);
      assert.equal(baselineProfile.calls.length, baselinePacket.calls.length);
      const calls = [...baselinePacket.calls, ...report.originalRecipe.nativeCalls,
        ...report.periods.flatMap(period => period.nativeCalls)];
      assert.equal(calls.length, 24 + baselinePacket.calls.length);
      for (const call of calls) {
        const retained = await selected.console.json('call/' + call.id);
        verifyRetainedNativeCall(call, retained);
      }
      const baselineRun = (await selected.console.run(baseline.run.id)).run;
      assert.equal(baselineRun.state, 'COMPLETE'); assert.equal(baselineRun.stepsComplete, 7);
      assert.equal(baselineRun.id, baseline.run.id); assert.equal(baselineRun.revision, baseline.run.revision);
      const completedBaseline = await readCompletedWorkflowCalls(baselineRun, path => selected.console.json(path));
      assert.equal(completedBaseline.original.length, 7); assert.equal(completedBaseline.effective.length, 7);
      for (const period of report.periods) {
        const reopened = await selected.cycle(period.id);
        assert.equal(reopened.run.id, period.run.id); assert.equal(reopened.run.state, 'COMPLETE');
        assert.equal(reopened.cycle.contentSha256, period.cycle.contentSha256);
      }
      const installed = await selected.console.installation(report.workflowId);
      assert.equal(installed.installation.contentSha256, recipe.installation.contentSha256);
      assert.equal(installed.definition.revision, 1); assert.equal(installed.currentDefinitionRevision, 2);
      observed.workspaces.push({ role, id: current.console.workspaceId,
        recurringProfileCalls: customerProfile.calls.length, baselineCalls: baselineProfile.calls.length });
    }
    const receiver = clients[1];
    const customers = [{ id: baseline.customerId, files: baseline.customerFiles, archive: baseline.customerArchive },
      { id: recipe.customerId, files: recipe.customerFiles, archive: recipe.customerArchive },
      ...report.periods.map(period => ({ id: period.customer.id, files: period.customer.files, archive: period.archive }))];
    for (const customer of customers) {
      assert.equal(customer.files.length, 6);
      const archive = await receiver.console.response('customer-archive/' + customer.id, {},
        async value => Buffer.from(await value.arrayBuffer()));
      assert.equal(sha(archive), customer.archive.sha256);
      for (const file of customer.files) {
        const bytes = await receiver.console.response('customer-file/' + customer.id + '?file=' + encodeURIComponent(file.name), {},
          async value => Buffer.from(await value.arrayBuffer()));
        assert.equal(bytes.length, file.bytes); assert.equal(sha(bytes), file.sha256);
      }
      observed.customers.push({ id: customer.id, files: customer.files.length, archiveSha256: customer.archive.sha256 });
    }
    const handover = await reopenWorkflowSeriesHandover({ directory: join(directory, 'series-customer-handover') });
    assert.equal(handover.contentSha256, report.handover.contentSha256);
    observed.handoverSha256 = handover.contentSha256;
  } finally {
    for (const selected of clients) selected.close();
    await Promise.all(hosts.map(host => host.close()));
  }
  observed.result = 'PASS';
  const path = join(directory, 'workflow-series-reopened.json'), temporary = path + '.tmp';
  await writeFile(temporary, JSON.stringify(observed, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, path);
  process.stdout.write(JSON.stringify({ stage: 'completed-workspaces-reopened', ...observed }) + '\n');
  return observed;
}

export async function receiveMerchantWorkflowSeries({
  directory, chromiumPath, playwrightModule, sourceCommit, openSession = startMerchantMcp
} = {}) {
  assert.ok(directory && chromiumPath && playwrightModule, 'Use the original receiving directory, Chromium and Playwright module.');
  assert.match(sourceCommit ?? '', /^[a-f0-9]{40}$/);
  directory = resolve(directory);
  const recipe = await receiveMerchantWorkflowRecipes({ directory, chromiumPath, playwrightModule, sourceCommit, openSession });
  assert.equal(recipe.result, 'PASS');
  const checkpoint = join(directory, 'workflow-series-receiving-checkpoint.json');
  const completed = join(directory, 'workflow-series-native-run.json');
  const prior = await optional(completed);
  if (prior?.result === 'PASS') {
    assert.equal(prior.operationId, recipe.operationId);
    await verifyNativeArtifacts(directory, prior);
    const reopened = await reopenCompletedSeries({ directory, report: prior, recipe, sourceCommit, openSession });
    await writeNativeArtifactSelection(directory);
    return { ...prior, reused: true, reopened };
  }
  const suffix = sha(directory).slice(0, 18), seriesId = 'customer-series-' + suffix;
  const report = await optional(checkpoint) ?? {
    schema: 'stellar-forge.merchant-workflow-series-native-receiving.v1',
    operationId: recipe.operationId, continuation: 'recurring-customer-periods', directory,
    startedAt: new Date().toISOString(), sourceSelections: [], node: process.version,
    profileId: recipe.targetProfile, workflowId: recipe.requests.install.id, workflowRevision: 1, seriesId,
    originalRecipe: { installation: recipe.installation, run: recipe.run, customerId: recipe.customerId,
      customerArchiveSha256: recipe.customerArchive.sha256, nativeCalls: recipe.nativeCalls },
    baseline: recipe.baseline, ports: { ...recipe.ports }, workspaces: { ...recipe.workspaces },
    planning: planningWindow(), requests: {}, periods: [], artifacts: [], stages: [], browserErrors: [], result: 'RUNNING'
  };
  prepareNativeArtifactReport(report);
  assert.equal(report.operationId, recipe.operationId); assert.equal(report.directory, directory);
  assert.equal(report.profileId, recipe.targetProfile); assert.equal(report.workflowId, recipe.requests.install.id);
  assert.equal(report.seriesId, seriesId);
  assert.deepEqual(report.originalRecipe.nativeCalls, recipe.nativeCalls);
  if (report.sourceSelections.at(-1)?.commit !== sourceCommit)
    report.sourceSelections.push({ commit: sourceCommit, selectedAt: new Date().toISOString() });
  report.result = 'RUNNING'; delete report.error;
  let writes = Promise.resolve(), source, receiver, sourceClient, receiverClient, context, page;
  const save = () => {
    const bytes = JSON.stringify(report, null, 2) + '\n';
    writes = writes.then(async () => {
      await writeFile(checkpoint + '.tmp', bytes, { mode: 0o600 }); await rename(checkpoint + '.tmp', checkpoint);
    });
    return writes;
  };
  const freeze = async (key, value) => {
    if (report.requests[key]) assert.deepEqual(report.requests[key], value, 'Continue the complete original ' + key + '.');
    else { report.requests[key] = value; await save(); }
    return report.requests[key];
  };
  const retain = async (name, value) => {
    const path = join(directory, name);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const output = await writeWorkflowSeriesFile(path, value), entry = { name, bytes: output.bytes, sha256: output.sha256 };
    const index = report.artifacts.findIndex(file => file.name === name);
    if (index < 0) report.artifacts.push(entry); else assert.deepEqual(report.artifacts[index], entry);
    await save(); return entry;
  };
  const emit = async (stage, detail = {}) => {
    report.stages.push({ stage, completedAt: new Date().toISOString(), ...detail }); await save();
    process.stdout.write(JSON.stringify({ stage, ...detail }) + '\n');
  };
  const until = async (read, label, timeoutMs = 180000) => {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const result = await read(); if (result) return result;
      if (Date.now() >= end) throw new Error('Continue the retained original ' + label + ' in ' + directory);
      await delay(100);
    }
  };
  const token = await nativeReceivingAccessToken(directory);
  const configuration = join(directory, 'merchant', 'merchant-mcp.json');
  const open = async role => {
    const host = await openSession({ configPath: configuration, port: report.ports[role] ?? 0,
      environment: { ...process.env, MCP_ACCESS_TOKEN: token }, consoleDirectory: join(directory, role + '-console') });
    report.ports[role] = Number(new URL(host.url).port); await save(); return host;
  };
  const client = host => new MerchantWorkflowSeriesClient({ url: host.consoleUrl, environment: { MCP_ACCESS_TOKEN: token } });
  const maybe = async (selected, id) => {
    try { return await selected.cycle(id); } catch (error) { if (error.status !== 404) throw error; return null; }
  };
  const response = async (path, act, { method = 'POST', status = 200 } = {}) => {
    const waiting = page.waitForResponse(value => new URL(value.url()).pathname === '/operator/api/' + path &&
      value.request().method() === method);
    await act(); const returned = await waiting, value = await returned.json();
    assert.equal(returned.status(), status, JSON.stringify(value)); return value;
  };
  const connect = async (host, profileId) => {
    await page.goto(host.consoleUrl, { waitUntil: 'networkidle' });
    await page.locator('#access-token').fill(token);
    await response('profiles', () => page.locator('#connect-form button[type=submit]').click(), { method: 'GET' });
    await page.locator('#connected').waitFor({ state: 'visible' });
    await page.locator('#profiles').selectOption(profileId);
    await page.locator('[data-page=workflows]').click();
    await page.locator('#series-list button').filter({ hasText: 'Recurring merchant customer' }).waitFor();
    await response('workflow-series/' + seriesId, () => page.locator('#series-list button')
      .filter({ hasText: 'Recurring merchant customer' }).click(), { method: 'GET' });
    await page.locator('#series-work').waitFor({ state: 'visible' });
  };
  const screenshot = async (name, viewport) => {
    if (viewport) await page.setViewportSize(viewport);
    const inspection = await retainNativeInspection(directory, report, name,
      await page.screenshot({ fullPage: true, animations: 'disabled' }));
    await save(); return inspection;
  };
  const bind = async selected => {
    const host = await selected.host(), value = await selected.profile(report.profileId);
    if (value.profile.hostFingerprint !== host.configurationFingerprint)
      await selected.bindProfile({ id: report.profileId, expectedRevision: value.profile.revision,
        expectedHostFingerprint: host.configurationFingerprint, expectedCompositionFingerprint: host.composition.fingerprint });
    return selected.host();
  };
  async function receiveCustomer(period) {
    const selected = period.customerSelection, current = await receiverClient.profile(report.profileId);
    let delivery = current.deliveries.find(value => value.identity.exportId === selected.exportId &&
      value.identity.expectedManifestSha256 === selected.expectedManifestSha256);
    if (!delivery || delivery.state !== 'COMPLETE') {
      const host = await receiverClient.host();
      const request = await freeze('customer-' + period.index, { ...selected, profileId: report.profileId,
        expectedHostFingerprint: host.configurationFingerprint });
      delivery = (await receiverClient.console.json('customers', request)).delivery;
    }
    const received = await until(async () => {
      const value = (await receiverClient.profile(report.profileId)).deliveries.find(row => row.id === delivery.id);
      if (value?.state === 'FAILED') throw new Error(JSON.stringify(value.error));
      return value?.state === 'COMPLETE' && !value.active ? value : null;
    }, 'customer receiving ' + selected.exportId);
    assert.equal(received.files.length, 6);
    period.customer = received; await save();
    const archive = await receiverClient.console.response('customer-archive/' + received.id, {},
      async returned => Buffer.from(await returned.arrayBuffer()));
    period.archive = await retain('series-period-' + period.index + '-customer.tar.gz', archive);
    await save();
    return received;
  }
  async function completePeriod(index) {
    const period = report.periods[index], selected = await receiverClient.cycle(period.id);
    if (selected.run?.state === 'READY' && !selected.run.active)
      await receiverClient.resume({ id: selected.run.id, expectedRevision: selected.run.revision });
    const final = await receiverClient.waitCycle(period.id, { timeoutMs: 180000, pollMs: 150 });
    assert.equal(final.run?.state, 'COMPLETE', 'Reopen this original native run and its retained recovery request.');
    assert.equal(final.run.active, false); assert.equal(final.run.stepsComplete, 8);
    assert.equal(final.run.workflowRevision, 1); assert.equal(final.run.id, final.cycle.runId);
    assert.equal(final.run.ownerWorkspaceId, report.workspaces.receiver);
    const calls = await Promise.all(final.run.steps.map(step => receiverClient.console.json('call/' + (step.resolvedCallId ?? step.callId))));
    assert.equal(calls.length, 8); assert.ok(calls.every(call => call.state === 'COMPLETE'));
    const results = calls.map(call => { assert.equal(sha(call.resultJson), call.resultSha256); return JSON.parse(call.resultJson); });
    const inputs = JSON.parse(final.cycle.inputsJson);
    assert.equal(results[1].release.id, inputs.releaseId);
    assert.equal(results[3].runtime.state, 'RUNNING');
    assert.equal(results[3].state.generation, results[2].status.state.generation);
    assert.equal(results[4].mode, 'CHALLENGE_ONLY'); assert.equal(results[4].files.length, 5);
    assert.equal(results[7].operator.managesRunningSeller, false);
    period.cycle = final.cycle; period.run = final.run; period.release = results[1].release;
    period.nativeCalls = calls; period.customerSelection = { family: 'core', exportId: inputs.customerId,
      expectedManifestSha256: results[5].manifestFile.sha256 };
    await save(); await retain('series-period-' + index + '-native-calls.json', calls);
    await receiveCustomer(period);
    await emit('recurring-period-complete', { index, key: final.cycle.request.key, cycleId: period.id,
      runId: final.run.id, releaseDigest: period.release.digest, customerId: period.customer.id, files: 6 });
  }
  try {
    // The original programme closes both hosts before handing over its operation.
    // Add one real full source edition while preserving the original source alias.
    const rawBytes = await readFile(configuration), raw = JSON.parse(rawBytes);
    assert.ok(raw.sources.initial?.spec && raw.sources.initial?.selections && raw.sources.initial?.bindings);
    const initial = raw.sources.initial, originalBytes = await readFile(resolve(dirname(configuration), initial.spec));
    const revised = JSON.parse(originalBytes);
    assert.equal(revised.openapi, '3.1.1'); assert.ok(revised.paths['/forecast']?.post);
    revised.info = { ...revised.info, version: revised.info.version + '+recurring-period-2' };
    revised.paths['/forecast'].post.summary += ' for the next recurring customer period';
    const revisedPath = join(directory, 'series-source-editions', 'period-two-openapi.json');
    await retain('series-source-editions/period-one-openapi.json', originalBytes);
    await retain('series-source-editions/period-two-openapi.json', revised);
    const alias = 'series-period-two', candidate = { ...initial, label: 'Second recurring customer source edition', spec: revisedPath };
    if (raw.sources[alias]) assert.deepEqual(raw.sources[alias], candidate);
    else {
      assert.deepEqual(await readFile(configuration), rawBytes, 'Keep concurrent original configuration changes.');
      raw.sources[alias] = candidate;
      await writeFile(configuration + '.series.tmp', JSON.stringify(raw, null, 2) + '\n', { mode: 0o600 });
      await rename(configuration + '.series.tmp', configuration);
    }
    await readMerchantConfig(configuration);
    const changedBytes = await readFile(revisedPath);
    assert.notEqual(sha(changedBytes), sha(originalBytes));
    report.sourceEditions = [{ sourceAlias: 'initial', specSha256: sha(originalBytes) },
      { sourceAlias: alias, specSha256: sha(changedBytes) }];
    await save();
    source = await open('source'); receiver = await open('receiver');
    sourceClient = client(source); receiverClient = client(receiver);
    for (const [role, selected] of [['source', sourceClient], ['receiver', receiverClient]]) {
      const host = await selected.host(); assert.equal(host.console.workspaceId, report.workspaces[role]);
      assert.equal(host.operator.managesRunningSeller, false);
    }
    await bind(receiverClient);
    const original = await receiverClient.console.installation(report.workflowId);
    assert.equal(original.installation.contentSha256, recipe.installation.contentSha256);
    assert.equal(original.definition.revision, 1);
    const seriesRequest = await freeze('series', { requestId: 'customer-series-save-' + suffix, id: seriesId,
      profileId: report.profileId, name: 'Recurring merchant customer', customer: 'Original merchant receiving customer',
      task: 'Commission the selected full source for each period, generate the native customer, receive every file and stop the owned merchant.',
      workflowId: report.workflowId, workflowRevision: 1, expectedRevision: 0,
      baseInputs: { sourceAlias: 'initial', releaseId: 'pending', customerId: 'pending', period: { start: '', end: '' } },
      cycleBindings: [{ target: '/releaseId', pointer: '/runId' }, { target: '/customerId', pointer: '/id' },
        { target: '/period/start', pointer: '/period/start' }, { target: '/period/end', pointer: '/period/end' }],
      cadence: { unit: 'month', interval: 1, anchorDate: report.planning.from }, enabled: true });
    const series = (await receiverClient.saveSeries(seriesRequest)).series;
    assert.equal(series.revision, 1);
    const calendar = await receiverClient.calendar({ id: seriesId, revision: 1, ...report.planning, limit: 2 });
    assert.equal(calendar.periods.length, 2);
    if (report.calendar) assert.deepEqual(calendar.periods.map(({ existing, ...value }) => value), report.calendar);
    else { report.calendar = calendar.periods.map(({ existing, ...value }) => value); await save(); }
    const { chromium } = createRequire(import.meta.url)(playwrightModule);
    context = await chromium.launchPersistentContext(join(directory, 'browser'), {
      headless: true, executablePath: chromiumPath, args: ['--no-sandbox', '--disable-dev-shm-usage'],
      viewport: { width: 1440, height: 1080 }, acceptDownloads: true
    });
    page = context.pages()[0] ?? await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.browserErrors.push(error.message));
    await connect(receiver, report.profileId);
    const first = report.calendar[0], firstId = cycleId(seriesId, first.key);
    let firstSaved = await maybe(receiverClient, firstId);
    if (!firstSaved) {
      if (report.requests.firstCycle) firstSaved = await receiverClient.console.json('workflow-cycle-save', report.requests.firstCycle);
      else {
        await page.locator('#series-calendar-from').fill(report.planning.from);
        await page.locator('#series-calendar-to').fill(report.planning.to);
        await response('workflow-series-calendar', () => page.locator('#series-calendar').click());
        await page.locator('#series-calendar-list button').filter({ hasText: first.label }).click();
        await page.locator('#series-source-edition').fill('sha256:' + report.sourceEditions[0].specSha256);
        await page.locator('#series-cycle-reason').fill('First complete recurring customer period from the original retained source.');
        await response('workflow-cycle-review', () => page.locator('#series-cycle-review').click());
        const capture = async route => { await freeze('firstCycle', route.request().postDataJSON()); await route.continue(); };
        await page.route('**/operator/api/workflow-cycle-save', capture);
        try { firstSaved = await response('workflow-cycle-save', () => page.locator('#series-cycle-save').click()); }
        finally { await page.unroute('**/operator/api/workflow-cycle-save', capture); }
      }
    }
    assert.equal(firstSaved.cycle.id, firstId);
    report.periods[0] ??= { index: 0, id: firstId, request: firstSaved.cycle.request };
    await save(); await connect(receiver, report.profileId);
    await response('workflow-cycle/' + firstId, () => page.locator('#series-cycles button').filter({ hasText: first.label }).click(), { method: 'GET' });
    if (!firstSaved.run) {
      await response('workflow-cycle-start-review', () => page.locator('#series-cycle-start-review').click());
      const loseAccepted = async route => {
        await freeze('firstStart', route.request().postDataJSON());
        const accepted = await route.fetch(); assert.equal(accepted.status(), 202);
        const body = await accepted.json(); assert.equal(body.run.id, firstSaved.cycle.runId);
        report.firstStartAccepted = { cycleId: body.cycle.id, runId: body.run.id, at: new Date().toISOString() };
        await save(); await route.abort('failed');
      };
      await page.route('**/operator/api/workflow-cycle-start', loseAccepted);
      try {
        await page.locator('#series-cycle-start').click();
        await until(() => report.firstStartAccepted, 'accepted first native start');
        await page.waitForFunction(() => {
          const button = document.querySelector('#series-pending-list [data-series-retry]');
          return button && !button.disabled;
        });
      } finally { await page.unroute('**/operator/api/workflow-cycle-start', loseAccepted); }
      const retryBody = async route => { assert.deepEqual(route.request().postDataJSON(), report.requests.firstStart); await route.continue(); };
      await page.route('**/operator/api/workflow-cycle-start', retryBody);
      try {
        const reused = await response('workflow-cycle-start', () => page.locator('#series-pending-list [data-series-retry]').click(), { status: 202 });
        assert.equal(reused.run.id, firstSaved.cycle.runId); assert.equal(reused.reused, true);
      } finally { await page.unroute('**/operator/api/workflow-cycle-start', retryBody); }
      report.recoveredAcceptedStart = true; await save();
    }
    if (!report.recoveredAcceptedStart && report.requests.firstStart) {
      const original = await receiverClient.console.json('workflow-cycle-start', report.requests.firstStart);
      assert.equal(original.run.id, firstSaved.cycle.runId); assert.equal(original.reused, true);
      report.recoveredAcceptedStart = true; report.recoveryTransport = 'original saved terminal action'; await save();
    }
    await completePeriod(0);
    const second = report.calendar[1], secondId = cycleId(seriesId, second.key);
    const secondRequest = await freeze('secondCycleInput', { seriesId, seriesRevision: 1, ...second,
      sourceEdition: 'sha256:' + report.sourceEditions[1].specSha256,
      reason: 'Next customer period with the complete changed source edition; retain the first customer and native run.',
      previousCycleId: firstId, inputs: { ...series.baseInputs, sourceAlias: alias } });
    let secondSaved = await maybe(receiverClient, secondId);
    if (!secondSaved) {
      const prepared = report.requests.secondPreparation ?? await receiverClient.prepareCycle(secondRequest);
      await freeze('secondPreparation', prepared);
      assert.equal(prepared.review.canStart, true);
      secondSaved = await receiverClient.saveCycle(prepared);
    }
    report.periods[1] ??= { index: 1, id: secondId, request: secondSaved.cycle.request }; await save();
    if (!secondSaved.run) {
      const prepared = report.requests.secondStart ?? await receiverClient.prepareStart(secondId);
      await freeze('secondStart', prepared);
      assert.equal(prepared.review.canStart, true);
      await receiverClient.startCycle(prepared);
    }
    await completePeriod(1);
    assert.notEqual(report.periods[0].run.id, report.periods[1].run.id);
    assert.notEqual(report.periods[0].release.digest, report.periods[1].release.digest);
    assert.equal(report.periods[1].cycle.request.previousCycleId, firstId);
    assert.equal((await receiverClient.profile(report.profileId)).calls.length, 24);
    const originalRun = (await receiverClient.run(recipe.run.id)).run;
    assert.equal(originalRun.requestSha256, recipe.run.requestSha256); assert.equal(originalRun.state, 'COMPLETE');
    const handoverDirectory = join(directory, 'series-customer-handover');
    const capture = await receiverClient.capture({ profileId: report.profileId, directory: handoverDirectory,
      deliveryIds: report.periods.map(period => period.customer.id) });
    assert.equal(capture.manifest.customers.length, 2); assert.equal(capture.files.length, 13);
    assert.equal(capture.profile.workflowSeriesData.cycles.length, 2);
    const received = await sourceClient.receive({ directory: handoverDirectory });
    assert.equal(received.contentSha256, capture.contentSha256);
    assert.equal((await sourceClient.receive({ directory: handoverDirectory })).imported.reused, true);
    report.handover = { directory: handoverDirectory, contentSha256: capture.contentSha256,
      manifest: capture.manifest, files: capture.files };
    for (const file of capture.files) {
      const name = 'series-customer-handover/' + file.path;
      const entry = { name, bytes: file.bytes, sha256: file.sha256 };
      if (!report.artifacts.some(value => value.name === name)) report.artifacts.push(entry);
    }
    for (const name of ['selection.json', 'handover.json']) {
      const bytes = await readFile(join(handoverDirectory, name));
      const entry = { name: 'series-customer-handover/' + name, bytes: bytes.length, sha256: sha(bytes) };
      const existing = report.artifacts.find(file => file.name === entry.name);
      if (existing) assert.deepEqual(existing, entry); else report.artifacts.push(entry);
    }
    let returned;
    if (report.artifacts.some(file => file.name === 'series-returned-profile.json'))
      returned = JSON.parse(await readFile(join(directory, 'series-returned-profile.json'), 'utf8'));
    else {
      const exported = await sourceClient.exportProfile(report.profileId);
      await retain('series-returned-profile.json', exported.bytes); returned = exported.archive;
    }
    await receiverClient.importProfile(returned);
    await connect(receiver, report.profileId);
    await screenshot('series-completed-desktop.png');
    await screenshot('series-completed-mobile.png', { width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.setViewportSize({ width: 1440, height: 1080 });
    sourceClient.close(); receiverClient.close();
    await source.close(); source = null; await receiver.close(); receiver = null;
    source = await open('source'); receiver = await open('receiver');
    sourceClient = client(source); receiverClient = client(receiver);
    for (const [role, selected] of [['source', sourceClient], ['receiver', receiverClient]]) {
      const host = await selected.host(); assert.equal(host.console.workspaceId, report.workspaces[role]);
      assert.equal(host.operator.managesRunningSeller, false);
      const pageOfPeriods = await selected.series(seriesId);
      assert.equal(pageOfPeriods.total, 2); assert.equal(pageOfPeriods.cycles.filter(value => value.state === 'COMPLETE').length, 2);
      assert.equal((await selected.profile(report.profileId)).calls.length, 24);
      assert.equal((await selected.profile(report.baseline.profileId)).calls.length, 7);
      for (const period of report.periods) {
        const reopened = await selected.cycle(period.id);
        assert.equal(reopened.run.id, period.run.id); assert.equal(reopened.run.state, 'COMPLETE');
        assert.equal(reopened.cycle.contentSha256, period.cycle.contentSha256);
      }
      const installed = await selected.console.installation(report.workflowId);
      assert.equal(installed.installation.contentSha256, recipe.installation.contentSha256);
      assert.equal(installed.definition.revision, 1); assert.equal(installed.currentDefinitionRevision, 2);
    }
    assert.equal((await reopenWorkflowSeriesHandover({ directory: handoverDirectory })).contentSha256, capture.contentSha256);
    for (const period of report.periods) {
      const bytes = await receiverClient.console.response('customer-archive/' + period.customer.id, {},
        async value => Buffer.from(await value.arrayBuffer()));
      assert.equal(sha(bytes), period.archive.sha256);
    }
    await connect(source, report.profileId);
    await screenshot('series-received-reopened.png');
    await emit('two-customer-periods-received-and-reopened', { profileId: report.profileId, seriesId,
      nativeCalls: 16, retainedProfileCalls: 24, completeCustomerFiles: 12, handoverSha256: capture.contentSha256 });
    sourceClient.close(); receiverClient.close();
    await source.close(); source = null; await receiver.close(); receiver = null;
    await context.close(); context = null;
    assert.deepEqual(report.browserErrors, []);
    report.result = 'PASS'; report.completedAt = new Date().toISOString(); await save();
    await writeFile(completed, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    await writeNativeArtifactSelection(directory);
    process.stdout.write(JSON.stringify({ result: report.result, operationId: report.operationId,
      continuation: report.continuation, directory, seriesId, periods: report.periods.map(value => ({
        cycleId: value.id, runId: value.run.id, customerId: value.customer.id, archiveSha256: value.archive.sha256
      })), artifacts: report.artifacts }) + '\n');
    return report;
  } catch (error) {
    report.result = 'FAILED'; report.error = { code: error.code ?? 'WORKFLOW_SERIES_RECEIVING_FAILED',
      message: error.message, stack: error.stack }; await save(); throw error;
  } finally {
    sourceClient?.close(); receiverClient?.close();
    await Promise.allSettled([source?.close(), receiver?.close(), context?.close()]);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = new Map();
  for (let index = 2; index < process.argv.length; index += 2) flags.set(process.argv[index], process.argv[index + 1]);
  receiveMerchantWorkflowSeries({ directory: flags.get('--directory'),
    chromiumPath: flags.get('--chromium') ?? process.env.STARFORGE_CHROMIUM,
    playwrightModule: flags.get('--playwright-module') ?? process.env.STARFORGE_PLAYWRIGHT_MODULE,
    sourceCommit: flags.get('--source-commit') })
    .catch(async error => {
      try { await writeNativeArtifactSelection(flags.get('--directory')); }
      catch (selectionError) { process.stderr.write('Native delivery selection: ' + selectionError.message + '\n'); }
      process.stderr.write(error.stack + '\n'); process.exitCode = 1;
    });
}
