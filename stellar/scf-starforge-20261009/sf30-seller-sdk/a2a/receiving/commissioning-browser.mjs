// SPDX-License-Identifier: MIT
// Browser continuation over the original completed native A2A workspace.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import {
  canonical, clone, sha, atomicFile, readVerifiedFile, privateDirectory, fail
} from '../foundation.mjs';

const require = createRequire(import.meta.url);
const SCHEMA = 'stellar-forge.a2a-commissioning-browser.v1';
const json = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const need = (value, code) => { if (!value) fail(code, code, 409); };
function optional(path) {
  try { return json(readVerifiedFile(path)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function checkedFile(file) {
  const bytes = readVerifiedFile(file.path);
  need(bytes.length === file.bytes && sha(bytes) === file.sha256, 'REGISTER_BROWSER_INPUT_CHANGED');
  return bytes;
}
function retainedResponse(value) {
  return { requestId: value.requestId, state: value.state, revision: value.revision,
    bodySha256: value.bodySha256, result: clone(value.result) };
}
export async function receiveCommissioningBrowser({
  directory, url, workspaceId, projectId, phase, inputs, expected, playwright, chromium
}) {
  need(['initial', 'forward', 'received'].includes(phase), 'REGISTER_BROWSER_PHASE');
  const endpoint = new URL(url);
  need(endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' &&
    endpoint.pathname === '/' && !endpoint.search && !endpoint.hash, 'REGISTER_BROWSER_ORIGIN');
  const root = privateDirectory(directory);
  for (const value of Object.values(inputs.files)) checkedFile(value);
  const selection = {
    sourceSha256: sha(readVerifiedFile(fileURLToPath(import.meta.url))),
    url: endpoint.origin, workspaceId, projectId, phase, inputs: clone(inputs), expected: clone(expected),
    playwright: resolve(playwright), chromium: resolve(chromium)
  };
  const journal = join(root, 'browser.json');
  let data = optional(journal), context, page;
  const save = () => atomicFile(journal, Buffer.from(canonical(data)), { replace: true });
  if (data) need(data.schema === SCHEMA && canonical(data.selection) === canonical(selection), 'REGISTER_BROWSER_SELECTION');
  else { data = { schema: SCHEMA, selection, createdAt: new Date().toISOString(), steps: {}, files: {}, complete: false }; save(); }
  const finish = () => {
    need(data.finalCandidate?.closed === true, 'REGISTER_BROWSER_CANDIDATE');
    atomicFile(join(root, 'result.json'), Buffer.from(canonical(data.finalCandidate)));
    const value = json(readVerifiedFile(join(root, 'result.json')));
    need(canonical(value) === canonical(data.finalCandidate), 'REGISTER_BROWSER_RESULT_CHANGED');
    for (const f of value.files) {
      const bytes = readVerifiedFile(join(root, f.path));
      need(bytes.length === f.bytes && sha(bytes) === f.sha256, 'REGISTER_BROWSER_OUTPUT_CHANGED');
    }
    data.complete = true; save(); return value;
  };
  if (data.complete || data.finalCandidate) return finish();
  const library = require(selection.playwright);
  need(library.chromium, 'REGISTER_BROWSER_LIBRARY');
  context = await library.chromium.launchPersistentContext(join(root, 'profile'), {
    executablePath: selection.chromium, headless: true, viewport: { width: 1440, height: 1000 },
    acceptDownloads: true, args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  page = context.pages()[0] ?? await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error.message)));
  const auth = async () => {
    const token = await page.locator('meta[name=operator-token]').getAttribute('content');
    need(token, 'REGISTER_BROWSER_TOKEN'); return { Authorization: 'Bearer ' + token };
  };
  async function readProject(revision = null) {
    const response = await page.request.get(endpoint.origin + '/api/project?id=' + encodeURIComponent(projectId) +
      (revision === null ? '' : '&revision=' + revision), { headers: await auth() });
    const value = await response.json();
    need(response.ok() && value.id === projectId, 'REGISTER_BROWSER_PROJECT');
    return value;
  }
  async function ready(pane = 'commissioning', revision = null) {
    await page.waitForFunction(({ projectId, pane, revision }) => {
      const current = window.a2aOperator?.inspect();
      if (!current?.storageReady || current.projectId !== projectId || current.pane !== pane) return false;
      const label = document.querySelector('#project-subtitle')?.textContent ?? '';
      return revision === null ? label.includes('Current view') :
        current.revision === revision && label.includes('Historical view');
    }, { projectId, pane, revision }, { timeout: 30000 });
  }
  async function open(pane = 'commissioning', revision = null) {
    const hash = new URLSearchParams({ id: projectId, pane, ...(revision === null ? {} : { revision: String(revision) }) });
    await page.goto(endpoint.origin + '/#' + hash, { waitUntil: 'domcontentloaded' });
    // A full reload also resolves same-hash and same-pane historical navigation.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(pane, revision);
    if (revision === null) {
      const p = await readProject();
      await page.waitForFunction(revision => window.a2aOperator?.inspect().revision === revision,
        p.revision, { timeout: 30000 });
    }
  }
  async function sync(pane = 'commissioning') {
    const p = await readProject();
    await ready(pane);
    await page.waitForFunction(revision => {
      const value = window.a2aOperator?.inspect();
      return value?.storageReady && value.pending === null && value.revision === revision;
    }, p.revision, { timeout: 30000 });
    return p;
  }
  async function restore(wire) {
    await page.evaluate(async saved => {
      const bytes = Uint8Array.from(atob(saved.bodyBase64), c => c.charCodeAt(0));
      await window.a2aOperator.restorePending({
        ...saved, body: new Blob([bytes], { type: saved.contentType })
      });
    }, wire);
  }
  async function requestReceipt(step) {
    const response = await page.request.get(endpoint.origin + '/api/request?id=' + encodeURIComponent(step.wire.id),
      { headers: await auth() });
    const value = await response.json();
    need(response.ok() && value.requestId === step.wire.id && value.state === 'complete',
      'REGISTER_BROWSER_REQUEST_RECEIPT');
    if (step.response) need(value.revision === step.response.revision &&
      canonical(value.result) === canonical(step.response.result), 'REGISTER_BROWSER_ORIGINAL_RESULT_CHANGED');
    return value;
  }
  async function mutate(name, action, trigger, { lostAcknowledgement = false } = {}) {
    let step = data.steps[name];
    if (step) need(step.action === action, 'REGISTER_BROWSER_ACTION_CHANGED');
    if (step?.complete) { await requestReceipt(step); return step.response.result; }
    if (step?.wire) {
      await restore(step.wire); await page.locator('#retry-request').click();
      await page.waitForFunction(() => window.a2aOperator?.inspect().pending === null, null, { timeout: 30000 });
      const receipt = await requestReceipt(step);
      step.response ??= { ...retainedResponse({ ...receipt, bodySha256: step.wire.bodySha256 }) };
      step.complete = true; save(); return step.response.result;
    }
    step = { action }; data.steps[name] = step; save();
    const path = action === 'commission_retain_source' ? '/api/commissioning/source' : '/api/dispatch';
    const pattern = endpoint.origin + path;
    let settle, reject;
    const observed = new Promise((resolve, no) => { settle = resolve; reject = no; });
    // Attach a rejection consumer before a browser click can fail.
    observed.catch(() => {});
    const inFlight = new Set();
    const deadline = setTimeout(() => reject(Object.assign(
      new Error('The original form did not complete its observed request.'),
      { code: 'REGISTER_BROWSER_REQUEST_TIMEOUT' })), 45000);
    const handleRoute = async route => {
      try {
        const request = route.request(), bytes = request.postDataBuffer();
        need(bytes, 'REGISTER_BROWSER_BODY');
        const body = json(bytes), current = await page.evaluate(() => window.a2aOperator.inspect());
        need(body.action === action && body.payload.id === projectId && current.pending?.id === body.payload.requestId &&
          current.pending.bodySha256 === sha(bytes), 'REGISTER_BROWSER_PENDING_IDENTITY');
        step.wire = {
          schema: 'stellar-forge.a2a-browser-request.v1', workspaceId, id: body.payload.requestId,
          path, method: 'POST', contentType: request.headers()['content-type'], bodySha256: sha(bytes),
          bodyBytes: bytes.length, bodyBase64: bytes.toString('base64'), label: 'Original commissioning ' + action,
          projectId, createdAt: current.pending.createdAt
        };
        save();
        const response = await route.fetch({ timeout: 30000 }), responseBytes = await response.body(), value = json(responseBytes);
        need(value.requestId === step.wire.id && value.bodySha256 === step.wire.bodySha256 &&
          value.state === 'complete', 'REGISTER_BROWSER_MUTATION_FAILED');
        step.response = retainedResponse(value); save();
        if (lostAcknowledgement) await route.abort('connectionfailed');
        else await route.fulfill({ response, body: responseBytes });
        settle();
      } catch (error) { reject(error); await route.abort().catch(() => {}); }
    };
    const route = intercepted => {
      const running = handleRoute(intercepted);
      inFlight.add(running);
      running.then(() => inFlight.delete(running), () => inFlight.delete(running));
      return running;
    };
    await page.route(pattern, route);
    try { await trigger(); await observed; }
    finally {
      clearTimeout(deadline);
      await page.unroute(pattern, route);
      await Promise.allSettled([...inFlight]);
    }
    if (lostAcknowledgement) {
      await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
      const pending = await page.evaluate(() => window.a2aOperator.inspect().pending);
      need(pending?.id === step.wire.id && pending.bodySha256 === step.wire.bodySha256,
        'REGISTER_BROWSER_SAVED_PENDING_LOST');
      await restore(step.wire); await page.locator('#retry-request').click();
    }
    await page.waitForFunction(() => window.a2aOperator?.inspect().pending === null, null, { timeout: 30000 });
    await requestReceipt(step); step.complete = true; save(); return step.response.result;
  }
  async function form(action, values, files = {}) {
    const f = page.locator('form[data-action="' + action + '"]');
    await f.waitFor({ state: 'visible' });
    for (const [name, value] of Object.entries(values)) {
      const input = f.locator('[name="' + name + '"]');
      if (Array.isArray(value)) await input.selectOption(value);
      else if (await input.evaluate(el => el.tagName === 'SELECT')) await input.selectOption(String(value));
      else await input.fill(String(value));
    }
    for (const [name, selected] of Object.entries(files)) {
      const bytes = checkedFile(selected);
      await f.locator('[name="' + name + '"]').setInputFiles({
        name: selected.filename, mimeType: selected.mediaType, buffer: bytes
      });
    }
    return f;
  }
  async function submit(f) {
    await f.locator('button[type=submit]').click();
  }
  async function section(name) {
    await page.locator('[data-commission-section="' + name + '"]').first().click();
  }
  async function binding(kind, key) {
    await section('approvals');
    await page.locator('[data-commission-kind="' + kind + '"]').click();
    await page.locator('[data-commission-binding="' + key + '"]').click();
  }
  async function upload(name, role, file, note) {
    await section('sources');
    const value = await mutate(name, 'commission_retain_source', async () => {
      await submit(await form('commission_retain_source', { role, note }, { file }));
    });
    await sync(); return value.sourceId;
  }
  async function reviewBinding(name, kind, key, details, evidenceIds, reason) {
    await binding(kind, key);
    const result = await mutate(name, 'commission_approve_binding', async () => {
      await submit(await form('commission_approve_binding', { ...details, evidenceSourceIds: evidenceIds, reason }));
    });
    await sync(); return result;
  }
  async function prepare(name, messageId, approvalSource) {
    await section('jobs');
    await page.locator('[data-commission-job="A-Q01"]').click();
    const result = await mutate(name, 'commission_prepare_job', async () => {
      const f = await form('commission_prepare_job', {
        catalogueEditionId: expected.catalogueEditionId, procedureId: expected.procedureId,
        scheduledDate: inputs.scheduledDate, parametersText: expected.parametersText, messageId: messageId ?? '',
        evidenceSourceIds: [approvalSource],
        reason: messageId ?
          'Explicit retrospective reference binding to the completed original Hamburg task; no new query or purchase.' :
          'Reference preparation of the complete original query; retain it unsent so the corrected source approval can be reviewed.'
      });
      const boxes = f.locator('input[data-commission-view]');
      need(await boxes.count() === expected.viewCount, 'REGISTER_BROWSER_VIEW_SELECTION');
      for (const box of await boxes.all()) await box.check();
      await submit(f);
    });
    await sync(); return result;
  }
  async function review(name, decision, evidenceId, note) {
    await section('jobs'); await page.locator('[data-commission-job="A-Q01"]').click();
    const result = await mutate(name, 'commission_review_delivery', async () => {
      await submit(await form('commission_review_delivery', {
        editionId: expected.editionId, publicationId: expected.publicationId,
        decision, evidenceSourceIds: [evidenceId], note
      }));
    });
    await sync(); return result;
  }
  function artifactCandidate(key, bytes, metadata) {
    const selected = { ...metadata, bytes: bytes.length, sha256: sha(bytes),
      contentBase64: bytes.toString('base64') };
    data.artifactCandidates ??= {};
    if (data.artifactCandidates[key])
      need(canonical(data.artifactCandidates[key]) === canonical(selected), 'REGISTER_BROWSER_CANDIDATE_CHANGED');
    else { data.artifactCandidates[key] = selected; save(); }
    return selected;
  }
  function candidateBytes(candidate) {
    need(candidate && typeof candidate.contentBase64 === 'string', 'REGISTER_BROWSER_ARTIFACT_CANDIDATE');
    const bytes = Buffer.from(candidate.contentBase64, 'base64');
    need(bytes.toString('base64') === candidate.contentBase64 &&
      bytes.length === candidate.bytes && sha(bytes) === candidate.sha256,
      'REGISTER_BROWSER_ARTIFACT_CANDIDATE_CHANGED');
    return bytes;
  }
  async function screenshot(name, width) {
    await page.setViewportSize({ width, height: 1000 });
    if (data.files[name]) { checkedFile({ ...data.files[name], path: join(root, name) }); return; }
    const key = 'screenshot:' + name;
    let candidate = data.artifactCandidates?.[key];
    if (!candidate) {
      const bytes = await page.screenshot({ fullPage: false });
      candidate = artifactCandidate(key, bytes, { path: name, kind: 'screenshot', width, height: 1000,
        mediaType: 'image/png' });
    }
    need(candidate.kind === 'screenshot' && candidate.path === name &&
      candidate.width === width && candidate.height === 1000, 'REGISTER_BROWSER_SCREENSHOT_SELECTION');
    const bytes = candidateBytes(candidate);
    atomicFile(join(root, name), bytes);
    data.files[name] = { path: name, bytes: bytes.length, sha256: sha(bytes), mediaType: candidate.mediaType };
    save();
  }
  async function download(name, trigger, check) {
    const prior = data.steps[name];
    if (prior?.complete) {
      const bytes = checkedFile({ ...data.files[prior.file], path: join(root, prior.file) });
      check(bytes); return bytes;
    }
    const key = 'download:' + name, relative = 'downloads/' + name + '.bin';
    let candidate = data.artifactCandidates?.[key];
    if (!candidate) {
      const received = page.waitForEvent('download', { timeout: 30000 });
      received.catch(() => {});
      await trigger(); const item = await received, path = await item.path();
      need(path, 'REGISTER_BROWSER_DOWNLOAD');
      const bytes = readVerifiedFile(path); check(bytes);
      candidate = artifactCandidate(key, bytes, { path: relative, kind: 'download',
        originalFilename: item.suggestedFilename(), mediaType: 'application/octet-stream' });
    }
    need(candidate.kind === 'download' && candidate.path === relative, 'REGISTER_BROWSER_DOWNLOAD_SELECTION');
    const bytes = candidateBytes(candidate); check(bytes);
    atomicFile(join(root, relative), bytes);
    data.files[relative] = { path: relative, bytes: bytes.length, sha256: sha(bytes), mediaType: candidate.mediaType };
    data.steps[name] = { complete: true, file: relative, originalFilename: candidate.originalFilename };
    save(); return bytes;
  }
  try {
    await open();
    if (phase === 'initial') {
      await section('plan');
      await download('original-template', () => page.locator('[data-commission-template]').click(),
        bytes => need(sha(bytes) === inputs.files.plan.sha256, 'REGISTER_BROWSER_TEMPLATE'));
      const retained = await mutate('retain-plan', 'commission_import_plan', async () => {
        await submit(await form('commission_import_plan', {
          title: 'Original Hamburg A2A commissioning — explicit reference',
          context: 'reference', attribution: inputs.attribution
        }, { file: inputs.files.plan }));
      }, { lostAcknowledgement: true });
      data.planId = retained.planId; save(); await sync();
      const approvalSource = await upload('approval-source', 'customer-approval', inputs.files.approval,
        'Authored receiving realization only. It identifies the genuine original input and native result without claiming a customer purchase.');
      const periodSource = await upload('period-source', 'source-period', inputs.files.recording,
        'The unchanged original 28-response Hamburg recording; complete original SHA, public attribution and fixed query window are retained.');
      const receivingSource = await upload('receiving-source', 'receiving-evidence', inputs.files.receiving,
        'Complete original programme receipt and explicit reference receiving decision; no settlement is asserted.');
      data.approvalSource = approvalSource; data.periodSource = periodSource; data.receivingSource = receivingSource; save();
      await reviewBinding('buyer', 'buyer', 'buyer-a', inputs.buyer, [approvalSource], inputs.buyerReason);
      await reviewBinding('merchant', 'merchant', 'merchant-1', inputs.merchant, [approvalSource], inputs.merchantReason);
      await reviewBinding('period-original', 'period', 'P01', { ...inputs.period, sourceIds: [periodSource] },
        [approvalSource], 'Initial reference source binding to the exact original edition and full source recording.');
      const prepared = await prepare('prepare-unsent', null, approvalSource);
      data.unsentMessageId = prepared.messageId; save();
      await reviewBinding('period-correction', 'period', 'P01', {
        ...inputs.period, population: inputs.correctedPopulation, sourceIds: [periodSource]
      }, [approvalSource], 'Clarify that the retained population is the complete original numeric Datastream 18571, including its original null/status semantics; source bytes and period boundaries are unchanged.');
      const corrected = await readProject(data.steps['period-correction'].response.revision), job = corrected.commissioningView.plans.find(p => p.id === data.planId).jobs.find(j => j.id === 'A-Q01');
      need(job.state === 'review_changed' && job.preparation.messageId === data.unsentMessageId &&
        !job.messageState.attempted, 'REGISTER_BROWSER_CORRECTION');
      const adopted = await prepare('adopt-original', expected.messageId, approvalSource);
      data.preparationId = adopted.preparationId; save();
      await review('accept-original', 'accepted', receivingSource,
        'The explicit reference receiver accepted every original file and the retained source/procedure/task bindings. The task predates this register; no new execution or purchase is claimed.');
      const final = await readProject(), selected = final.commissioningView.plans.find(p => p.id === data.planId);
      need(selected.context === 'reference' && selected.counts.jobs === 30 && selected.counts.accepted === 1 &&
        selected.counts.acceptedAdopted === 1 && selected.counts.acceptedPrepared === 0 &&
        selected.counts.verifiedSettlements === null, 'REGISTER_BROWSER_COUNTS');
      data.revision = final.revision; save();
    } else if (phase === 'forward') {
      data.planId = expected.planId; data.receivingSource = expected.receivingSource; save();
      await review('request-clarification', 'changes_requested', expected.receivingSource,
        'Reference reviewer requests that the retained source-window and original no-settlement limitation remain explicit in the portable handoff.');
      await review('accept-clarified', 'accepted', expected.receivingSource,
        'Reference receiver reopens the complete unchanged original files and accepts the clarified handoff; both prior decisions remain retained.');
    } else {
      const p = await readProject(), plan = p.commissioningView.plans.find(row => row.id === expected.planId);
      need(plan?.counts.accepted === 1 && plan.counts.acceptedAdopted === 1 && !p.networkEnabled,
        'REGISTER_BROWSER_FRESH_RECEIVING');
      data.planId = expected.planId; save();
    }

    for (const width of [1440, 390]) {
      await section('jobs');
      await page.locator('[data-commission-job="A-Q01"]').click();
      await screenshot('commissioning-jobs-' + width + '.png', width);
      await section('approvals'); await screenshot('commissioning-approvals-' + width + '.png', width);
      await section('sources'); await screenshot('commissioning-sources-' + width + '.png', width);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      need(!overflow, 'REGISTER_BROWSER_MOBILE_OVERFLOW');
    }
    await page.setViewportSize({ width: 1440, height: 1000 }); await section('jobs');
    const current = await readProject();
    await download('current-register', () => page.locator('[data-commission-report]').click(), bytes => {
      const value = json(bytes);
      need(value.projectId === projectId && value.revision === current.revision &&
        canonical(value.commissioning) === canonical(current.commissioningView), 'REGISTER_BROWSER_REPORT');
    });
    if (expected.historicalRevision !== undefined) {
      await open('commissioning', expected.historicalRevision);
      const historical = await readProject(expected.historicalRevision);
      for (const button of await page.locator('form[data-action] button[type=submit]').all())
        need(await button.isDisabled(), 'REGISTER_BROWSER_HISTORICAL_MUTATION');
      await download('historical-register', () => page.locator('[data-commission-report]').click(), bytes => {
        const value = json(bytes);
        need(value.revision === expected.historicalRevision && value.historical &&
          canonical(value.commissioning) === canonical(historical.commissioningView), 'REGISTER_BROWSER_HISTORICAL_REPORT');
      });
    }
    need(pageErrors.length === 0, 'REGISTER_BROWSER_PAGE_ERROR');
    await context.close(); context = null;
    data.finalCandidate = {
      schema: SCHEMA, complete: true, closed: true, completedAt: new Date().toISOString(), phase,
      selection, planId: data.planId, revision: current.revision,
      preparationId: data.preparationId ?? expected.preparationId ?? null,
      unsentMessageId: data.unsentMessageId ?? null, approvalSource: data.approvalSource ?? null,
      periodSource: data.periodSource ?? null, receivingSource: data.receivingSource ?? expected.receivingSource ?? null,
      steps: Object.fromEntries(Object.entries(data.steps).map(([key, step]) => [key, {
        complete: step.complete === true, action: step.action ?? null,
        requestId: step.wire?.id ?? null, response: step.response ?? null
      }])),
      pageErrors, files: Object.values(data.files).sort((a, b) => a.path.localeCompare(b.path))
    };
    save(); return finish();
  } catch (error) {
    data.lastError = { code: error.code ?? 'REGISTER_BROWSER_FAILED', message: String(error.message),
      at: new Date().toISOString() }; try { save(); } catch {}
    throw error;
  } finally { if (context) await context.close(); }
}
