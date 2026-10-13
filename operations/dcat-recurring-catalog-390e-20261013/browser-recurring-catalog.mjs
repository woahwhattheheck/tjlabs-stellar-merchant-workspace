// MIT. Following-edition browser continuation for the original installed DCAT application.
// The caller owns the saved project, authenticated server, archive receiving and native lifecycle.
import { mkdir, readFile, writeFile, rename, lstat, realpath } from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const PREFIX = 'stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/';
const hash = raw => createHash('sha256').update(raw).digest('hex');
const stamp = () => new Date().toISOString();
const delay = ms => new Promise(done => setTimeout(done, ms));
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
function need(value, message, code = 'DCAT_RECURRING_BROWSER_FAILED') {
  if (!value) throw Object.assign(new Error(message), { code });
}
const safeName = value => String(value).replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 160);

export async function runDcatRecurringBrowser({
  url, sourceRoot, projectDirectory, projectCreatedAt, outputDirectory, receivingResult,
  mode = 'full', candidateId, reuseMappingIndexes, baselineReleaseId, normalizeV3 = false,
  expectedBrowserResult, playwrightModule, chromiumPath, playwright, browserContext,
  operationTimeout = 900000,
} = {}) {
  need(['full', 'reopen'].includes(mode), 'Choose full or reopen receiving.');
  for (const [key, value] of Object.entries({ sourceRoot, projectDirectory, outputDirectory }))
    need(typeof value === 'string' && isAbsolute(value), 'Select an absolute ' + key + '.');
  need(typeof projectCreatedAt === 'string' && projectCreatedAt, 'Select the original project creation identity.');
  need(receivingResult?.schema === 'commons.dcat-recurring-catalog-receiving.v1' &&
    UUID.test(receivingResult.sourceId ?? ''), 'Supply the actual retained recurring-catalogue result.');
  const sourceId = receivingResult.sourceId;
  const selectedBaselineId = baselineReleaseId === undefined ? receivingResult.baseline?.releaseId ?? null : baselineReleaseId;
  const selectedIndexes = reuseMappingIndexes === undefined ?
    receivingResult.baseline?.selectedMappingIndexes ?? [] : reuseMappingIndexes;
  need(selectedBaselineId === null || UUID.test(selectedBaselineId), 'Select a saved accepted release.');
  need(Array.isArray(selectedIndexes) && selectedIndexes.every(value => Number.isSafeInteger(value) && value >= 0) &&
    new Set(selectedIndexes).size === selectedIndexes.length, 'Select each accepted mapping index once.');
  need(selectedBaselineId !== null || selectedIndexes.length === 0, 'Mapping reuse needs its accepted release.');
  need(candidateId === undefined || UUID.test(candidateId), 'Select an actual uploaded corrected candidate.');
  need(typeof normalizeV3 === 'boolean', 'The normalization choice must be explicit.');
  const target = new URL(url);
  need(target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) &&
    target.pathname === '/' && !target.search && !target.username && !target.password &&
    /^[A-Za-z0-9_-]{32,128}$/.test(target.hash.slice(1)), 'Use the original private loopback startup URL.');
  const token = target.hash.slice(1), origin = target.origin, root = resolve(sourceRoot), out = resolve(outputDirectory);
  const redact = value => String(value ?? '').split(url).join('[private startup URL]')
    .split(token).join('[private startup token]');
  await mkdir(out, { recursive: true, mode: 0o700 });
  const info = await lstat(out);
  need(info.isDirectory() && !info.isSymbolicLink() && await realpath(out) === out && !(info.mode & 0o077) &&
    (typeof process.getuid !== 'function' || info.uid === process.getuid()), 'Use an owned private real output directory.');
  const codec = await import(pathToFileURL(join(root, PREFIX, 'public/dcat-json.mjs')).href);
  const parse = codec.parseDcatJson, parseText = codec.parseDcatJsonText, stringify = codec.stringifyDcatJson;
  need([parse, parseText, stringify].every(value => typeof value === 'function'), 'The installed original exact JSON codec is required.');
  const equal = (left, right) => stringify(left) === stringify(right);
  const result = {
    schema: 'commons.dcat-recurring-browser-receiving.v1', mode,
    operation: 'DCAT-RECURRING-CATALOG-20261013-390E', sourceRoot: root,
    projectDirectory: resolve(projectDirectory), projectCreatedAt, sourceId,
    startedAt: stamp(), complete: false, phases: [], artifacts: [], sourceFiles: [],
    browserErrors: [], httpFailures: [], layouts: [], mutations: [],
    acquisitionComplete: receivingResult.complete === true,
    acquisitionError: receivingResult.error ?? null,
    selection: { baselineReleaseId: selectedBaselineId, reuseMappingIndexes: [...selectedIndexes],
      candidateId: candidateId ?? null, normalizeV3 },
  };
  const reportPath = join(out, 'recurring-browser-result.json');
  let context = browserContext, ownedBrowser, ownedContext = false, page, initialState, initialDcat;
  await writeFile(reportPath, stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  async function checkpoint() {
    await writeFile(reportPath + '.pending', stringify(result, null, 2) + '\n', { mode: 0o600 });
    await rename(reportPath + '.pending', reportPath);
  }
  async function retain(name, value, mediaType = 'application/json') {
    const file = join(out, name);
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const raw = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : stringify(value, null, 2) + '\n');
    await writeFile(file, raw, { flag: 'wx', mode: 0o600 });
    const item = { file, name, bytes: raw.length, sha256: hash(raw), mediaType };
    result.artifacts.push(item); return item;
  }
  async function retainedFile(file, mediaType) {
    const raw = await readFile(file), item = {
      file, name: file.slice(out.length + 1), bytes: raw.length, sha256: hash(raw), mediaType,
    };
    result.artifacts.push(item); return item;
  }
  async function phase(name, action) {
    const item = { name, startedAt: stamp(), state: 'RUNNING' };
    result.phases.push(item); await checkpoint();
    try { const value = await action(); item.state = 'COMPLETE'; item.completedAt = stamp(); await checkpoint(); return value; }
    catch (error) {
      item.state = 'FAILED'; item.completedAt = stamp();
      item.error = { code: error.code ?? 'DCAT_RECURRING_BROWSER_FAILED', message: redact(error.message) };
      await checkpoint(); throw error;
    }
  }
  async function api(path) {
    const response = await fetch(origin + '/api/' + path, {
      headers: { authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    const raw = Buffer.from(await response.arrayBuffer());
    need(response.ok, 'Original GET ' + path + ' returned ' + response.status + '.');
    return parse(raw);
  }
  const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
  const sourceRootView = () => page.locator('[data-dcat-sources]');
  const card = heading => sourceRootView().locator('.card').filter({
    has: page.getByRole('heading', { name: heading, exact: true }),
  }).last();
  const detail = (scope, name) => scope.locator('details').filter({
    has: page.locator('summary').filter({ hasText: new RegExp('^' + name.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$') }),
  }).last();
  async function exactDetail(scope, name) {
    const selected = detail(scope, name);
    need(await selected.count() === 1, 'The original details view is missing: ' + name);
    return parseText(await selected.locator('pre').first().textContent());
  }
  async function healthy() {
    const notice = await page.locator('#notice').innerText();
    need(!notice.trim(), 'The original application reports: ' + redact(notice));
    need(!result.browserErrors.length && !result.httpFailures.length, 'The browser retained an original application failure.');
  }
  async function waitUntil(check, message, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (await check()) return; await delay(100); }
    throw new Error(message);
  }
  async function migration() {
    await page.locator('nav button[data-tab="migration"]').click();
    await sourceRootView().waitFor({ state: 'visible' });
    await healthy();
  }
  async function selectSource() {
    await migration();
    const select = page.locator('select[name="retained-catalogue-source"]');
    await select.waitFor({ state: 'visible' });
    if (await select.inputValue() !== sourceId) await select.selectOption(sourceId);
    await waitUntil(async () => {
      try { return (await exactDetail(sourceRootView(), 'Saved source versions and current binding')).id === sourceId; }
      catch { return false; }
    }, 'The selected saved source did not finish rendering.');
    await healthy();
  }
  async function download(name, locator, expectedHash, expectedBytes) {
    const [item] = await Promise.all([page.waitForEvent('download'), locator.click()]);
    const failed = await item.failure();
    need(failed === null, 'Original browser download failed: ' + redact(failed));
    const file = join(out, 'downloads', safeName(name));
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    try { await lstat(file); throw new Error('The selected download output already exists.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await item.saveAs(file);
    const artifact = await retainedFile(file, name.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    artifact.suggestedFilename = safeName(item.suggestedFilename());
    if (expectedHash !== undefined) need(artifact.sha256 === expectedHash, 'The downloaded ' + name + ' changed its exact bytes.');
    if (expectedBytes !== undefined) need(artifact.bytes === expectedBytes, 'The downloaded ' + name + ' changed its byte count.');
    await healthy(); return artifact;
  }
  async function capture(name, width) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.evaluate(async () => { await document.fonts.ready; });
    const layout = await page.evaluate(() => ({
      viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
      sourceId: document.querySelector('select[name="retained-catalogue-source"]')?.value ?? null,
      reviewId: document.querySelector('select[name="saved-review"]')?.value ?? null,
    }));
    const file = join(out, 'screenshots', safeName(name) + '-' + width + '.png');
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await page.screenshot({ path: file, fullPage: true }); await retainedFile(file, 'image/png');
    result.layouts.push({ name, ...layout });
    need(Math.max(layout.documentWidth, layout.bodyWidth) <= width + 2,
      'The recurring view overflows its ' + width + 'px viewport.');
    await healthy();
  }
  async function mutation(path, trigger, name) {
    need(mode === 'full', 'Reopen mode retains the received decisions unchanged.');
    const [response] = await Promise.all([
      page.waitForResponse(value => {
        try { return new URL(value.url()).pathname === '/api/' + path && value.request().method() === 'POST'; }
        catch { return false; }
      }), trigger.click(),
    ]);
    const raw = Buffer.from(await response.body()), started = parse(raw);
    need(response.status() === 202 && UUID.test(started.operationId ?? ''), 'The original mutation did not return its operation.');
    const request = parseText(response.request().postData() ?? '');
    await retain('operations/' + name + '-request.json', response.request().postData());
    await retain('operations/' + name + '-started.json', raw);
    const deadline = Date.now() + operationTimeout;
    let state;
    do {
      state = await api('status');
      need(state.operation?.id === started.operationId, 'The original operation was replaced during receiving.');
      if (state.operation.state !== 'RUNNING') break;
      await delay(250);
    } while (Date.now() < deadline);
    await retain('operations/' + name + '-completed.json', state?.operation ?? {});
    need(state?.operation?.state === 'COMPLETE',
      'Original operation did not complete: ' + redact(stringify(state?.operation?.error ?? state?.operation?.state)));
    result.mutations.push({ path, operationId: started.operationId, resultId: state.operation.result?.id });
    return { started, state, request, value: state.operation.result };
  }
  async function inspectSource() {
    await selectSource();
    const state = await api('status'), original = await api('dcat/sources/' + sourceId);
    need(original.source.id === sourceId, 'The source endpoint selected another source.');
    if (receivingResult.source?.sourceSha256)
      need(original.source.sourceSha256 === receivingResult.source.sourceSha256, 'The supplied source configuration changed.');
    if (receivingResult.catalog?.id)
      need(original.source.latestCatalogId === receivingResult.catalog.id, 'The source latest edition changed after receiving.');
    const shown = await exactDetail(sourceRootView(), 'Saved source versions and current binding');
    need(equal(shown, original.source), 'The browser source versions or current bindings changed.');
    await retain('views/source-binding.json', shown);
    const exported = await download(mode + '-source-history.json', button('Download source configuration and history'));
    const downloaded = parse(await readFile(exported.file));
    need(equal(downloaded, original), 'The source history download omitted an original record.');
    result.source = { id: sourceId, sourceSha256: original.source.sourceSha256,
      latestCatalogId: original.source.latestCatalogId, versions: original.source.versions.length,
      selections: original.source.selections?.length ?? 0 };
    if (original.source.latestCatalogId) {
      const latest = state.dcat.catalogs.find(item => item.id === original.source.latestCatalogId);
      need(latest, 'The acquired catalog is missing from the saved inventory.');
      await download(mode + '-latest-catalogue.bin', button('Download latest acquired source'), latest.sha256, latest.bytes);
    }
    const history = card('Original acquisition history');
    const expected = new Map(original.acquisitions.map(item => [item.id, item]));
    await page.locator('input[name="source-acquisition-search"]').fill('');
    await page.locator('select[name="source-acquisition-status"]').selectOption('');
    while (!(await button('Previous checks', history).isDisabled())) await button('Previous checks', history).click();
    const rows = [], seen = new Set();
    for (;;) {
      for (const row of await history.locator('table').first().locator('tbody > tr').all()) {
        const value = await exactDetail(row, 'Complete retained attempt');
        need(expected.has(value.id) && !seen.has(value.id) && equal(value, expected.get(value.id)),
          'The paged original acquisition view omitted or changed an attempt.');
        seen.add(value.id); rows.push(value);
      }
      if (await button('Following checks', history).isDisabled()) break;
      need(seen.size < expected.size, 'The source history has unexpected continuation.');
      await button('Following checks', history).click();
    }
    need(seen.size === expected.size, 'The source history did not expose all retained attempts.');
    await retain('views/acquisitions-all-pages.json', rows);
    for (const attempt of original.acquisitions) {
      await page.locator('input[name="source-acquisition-search"]').fill(attempt.id);
      const row = history.locator('table').first().locator('tbody > tr');
      need(await row.count() === 1, 'The original attempt search did not resolve its unique saved UUID.');
      if (attempt.receiptSha256) await download(mode + '-' + attempt.id + '-receipt.json',
        button('HTTP receipt', row), attempt.receiptSha256, attempt.receiptBytes);
      if (attempt.responseSha256) await download(mode + '-' + attempt.id + '-response.bin',
        button(attempt.responseComplete ? 'Original response' : 'Retained incomplete response', row),
        attempt.responseSha256, attempt.responseBytes);
      if (attempt.error) need(equal(await exactDetail(row, 'Original error'), attempt.error),
        'The browser omitted the original acquisition error.');
    }
    await page.locator('input[name="source-acquisition-search"]').fill('');
    await capture('source-history', 1280); await capture('source-history', 390);
    await page.setViewportSize({ width: 1280, height: 900 });
    return { state, original };
  }
  const keyOf = row => JSON.stringify([row.source_path ?? null, row.target_path ?? null]);
  const cardFor = heading => page.locator('#view .card').filter({
    has: page.getByRole('heading', { name: heading, exact: true }),
  }).last();
  async function readAllPages(card, nextName, previousName, rowSelector, expectedCount, artifactName) {
    const first = card.getByRole('button', { name: previousName, exact: true });
    let rewinds = 0;
    while (!(await first.isDisabled())) {
      need(++rewinds <= 10000, 'The original previous-page control did not reach the beginning.');
      await first.click();
    }
    const rows = [], pageSizes = [];
    for (let index = 0; index < 10000; index++) {
      const values = await card.locator(rowSelector).allTextContents();
      rows.push(...values); pageSizes.push(values.length);
      const next = card.getByRole('button', { name: nextName, exact: true });
      if (await next.isDisabled()) break;
      need(values.length > 0, 'An empty original result page still exposes continuation.');
      await next.click();
      if (index === 9999) throw new Error('The original page continuation did not terminate.');
    }
    need(rows.length === expectedCount, 'Full browser page count differs for ' + artifactName + ': ' + rows.length + ' versus ' + expectedCount);
    need(new Set(rows).size === rows.length, 'The original browser repeated a page or record in ' + artifactName);
    await retain('views/' + safeName(artifactName) + '.json', { expectedCount, pageSizes, rows });
    await healthy();
    return { rows: rows.length, pages: pageSizes.length };
  }
  function expectedRecords(conservation, changes) {
    const records = new Map();
    for (const mapping of conservation?.mappings ?? [])
      records.set(keyOf(mapping), { mapping, changes: [] });
    for (const change of changes ?? []) {
      const key = keyOf(change);
      if (!records.has(key)) records.set(key, { mapping: null, changes: [] });
      records.get(key).changes.push(change);
    }
    return records;
  }
  async function inspectRecords(label, conservation, changes, name) {
    const expected = expectedRecords(conservation, changes), card = cardFor(label);
    await card.waitFor({ state: 'visible' });
    const result = await readAllPages(card, 'Next records', 'Previous records',
      '.migration-record > details:last-child > pre', expected.size, name);
    const raw = parseText(await readFile(join(out, 'views', safeName(name) + '.json'), 'utf8'));
    const observed = new Set();
    for (const text of raw.rows) {
      const rendered = parseText(text);
      const key = JSON.stringify([rendered.before?.path ?? null, rendered.after?.path ?? null]);
      need(expected.has(key) && !observed.has(key), 'The original browser record identity differs from the complete engine result.');
      observed.add(key);
      const selected = expected.get(key);
      need(equal(rendered.changes, selected.changes), 'Rendered field values differ from their exact engine originals.');
      if (selected.mapping) {
        need(equal(rendered.before?.identifier, selected.mapping.source_identifier) &&
          equal(rendered.after?.identifier, selected.mapping.target_identifier),
          'The browser changed a typed record identifier.');
      }
    }
    const firstPath = [...expected.values()].flatMap(item => item.changes).find(item => typeof item.path === 'string' && item.path)?.path;
    if (firstPath) {
      const search = card.locator('input[name="record-search"]');
      await search.fill(firstPath);
      need(await card.locator('.migration-record').count() > 0, 'The original field-path search did not find a retained change.');
      await search.fill('');
    }
    const first = card.locator('.migration-record > summary').first();
    if (await first.count()) await first.click();
    return result;
  }
  async function inspectValidation(report, label) {
    const result = {};
    for (const [kind, heading] of [
      ['source', 'Original source validation'], ['candidate', 'Candidate validation'],
      ['comparison', 'Preceding edition validation']
    ]) {
      const validation = report.validation?.[kind];
      if (!validation) continue;
      const card = cardFor(heading); await card.waitFor({ state: 'visible' });
      const errors = new Map();
      for (const occurrence of [validation, ...(validation.records ?? []), ...(validation.catalogs ?? [])])
        for (const error of occurrence.errors ?? [])
          errors.set(stringify([error.path ?? '', error.validator ?? null, error.message ?? '']), error);
      const entry = { state: validation.state, records: validation.records?.length ?? 0,
        nestedCatalogues: validation.catalogs?.length ?? 0, distinctErrors: errors.size };
      if (errors.size) {
        const pages = await readAllPages(card, 'Next issues', 'Previous issues',
          ':scope > div:last-child > details', errors.size, label + '-validation-' + kind);
        entry.pages = pages.pages;
        const query = [...errors.values()].find(error => typeof error.path === 'string' && error.path)?.path;
        if (query) {
          await card.locator('input[name="validation-search"]').fill(query);
          need(await card.locator(':scope > div:last-child > details').count() > 0,
            'The original validation search omitted a retained document path.');
          await card.locator('input[name="validation-search"]').fill('');
        }
      }
      for (const [name, expected] of [
        ['Complete record validation', validation.records], ['Complete nested catalogue validation', validation.catalogs]
      ]) {
        if (!expected?.length) continue;
        const detail = card.locator(':scope > details').filter({
          has: page.locator('summary').filter({ hasText: new RegExp('^' + name + '$') })
        });
        await detail.locator(':scope > summary').click();
        const actual = parseText(await detail.locator(':scope > pre').textContent());
        need(equal(actual, expected), 'The browser omitted or changed an original validation collection.');
        await detail.locator(':scope > summary').click();
      }
      result[kind] = entry;
    }
    await healthy(); return result;
  }
  async function inspectSavedReview(id, name) {
    const state = await api('status'), saved = state.dcat.reviews.find(item => item.id === id);
    need(saved, 'The selected following-edition review is absent.');
    await migration();
    await page.locator('select[name="saved-review"]').selectOption(id);
    if (!['READY', 'NEEDS_CORRECTION'].includes(saved.status)) {
      await retain('views/' + name + '-nonfinal-review.json', saved);
      result.review = { id, status: saved.status }; return { saved, report: null };
    }
    await page.getByRole('group', { name: 'Migration review sections' }).waitFor({ state: 'visible' });
    await button('Overview', page.getByRole('group', { name: 'Migration review sections' })).click();
    await waitUntil(async () => await page.locator('select[name="saved-review"]').inputValue() === id &&
      await page.locator('input[name="review-sha256"]').count() > 0, 'The selected report did not render.');
    const file = await download(name + '-report.json', button('Download complete review'), saved.reportSha256);
    const report = parse(await readFile(file.file));
    need(report.review_sha256 === saved.reviewSha256, 'The report intrinsic review identity changed.');
    if (saved.candidateSha256) await download(name + '-candidate.json',
      button('Download candidate'), saved.candidateSha256);
    else need(await button('Download candidate').isDisabled(), 'An absent candidate offered a download.');
    const originalCatalog = state.dcat.catalogs.find(item => item.id === saved.sourceId);
    need(originalCatalog, 'The report lost its original catalog.');
    await download(name + '-source.bin', button('Download original source'), originalCatalog.sha256, originalCatalog.bytes);
    if (saved.comparisonId) {
      const preceding = state.dcat.catalogs.find(item => item.id === saved.comparisonId);
      need(preceding, 'The report lost its exact preceding edition.');
      await download(name + '-preceding.bin', button('Download preceding edition'), preceding.sha256, preceding.bytes);
    }
    if (saved.candidateId) {
      const corrected = state.dcat.catalogs.find(item => item.id === saved.candidateId);
      need(corrected, 'The report lost its selected uploaded candidate.');
      await download(name + '-operator-original.bin', button('Download operator candidate original'), corrected.sha256, corrected.bytes);
    }
    const group = page.getByRole('group', { name: 'Migration review sections' });
    const sections = await group.getByRole('button').allTextContents();
    for (const section of sections) {
      await button(section, group).click(); await healthy();
      if (section === 'Validation') await inspectValidation(report, name);
      if (section === 'Record conservation' && report.conservation)
        await inspectRecords('Review converted fields', report.conservation, report.field_changes, name + '-conservation');
      if (section === 'Successive editions' && report.comparison_changes) {
        const comparison = report.comparison_changes;
        await inspectRecords('Original source and preceding edition · fields',
          comparison.conservation, comparison.field_changes, name + '-source-edition');
        if (comparison.candidate_to_comparison) {
          const candidate = comparison.candidate_to_comparison;
          await inspectRecords('Reviewed candidate and preceding edition · fields',
            candidate.conservation, candidate.field_changes, name + '-candidate-edition');
        }
      }
      await retain('views/' + name + '-' + safeName(section) + '.txt',
        await page.locator('#view').innerText(), 'text/plain');
    }
    await button('Overview', group).click();
    await capture(name + '-review', 1280); await capture(name + '-review', 390);
    await page.setViewportSize({ width: 1280, height: 900 });
    result.review = { id, status: saved.status, sourceId: saved.sourceId,
      reviewSha256: saved.reviewSha256, reportSha256: saved.reportSha256,
      candidateSha256: saved.candidateSha256 ?? null, canReceive: report.can_receive };
    return { saved, report };
  }
  async function prepareFollowingReview() {
    await selectSource();
    const { dcat } = await api('status');
    const source = dcat.sources.find(item => item.id === sourceId);
    need(source?.latestCatalogId, 'Acquire a complete current edition before browser review.');
    const baseline = selectedBaselineId === null ? null : dcat.releases.find(item => item.id === selectedBaselineId);
    need(selectedBaselineId === null || baseline, 'The selected accepted baseline is absent.');
    const panel = card('Review the latest acquired edition');
    await page.locator('select[name="source-baseline-release"]').selectOption(selectedBaselineId ?? '');
    let baselineReport = null;
    if (baseline) {
      await waitUntil(async () => {
        try { return (await exactDetail(panel, 'Accepted predecessor release')).id === baseline.id; }
        catch { return false; }
      }, 'The selected accepted release did not render.');
      baselineReport = await api('dcat/reviews/' + baseline.reviewId);
      need(baselineReport.review_sha256 === baseline.reviewSha256 &&
        baselineReport.candidate?.sha256 === baseline.sha256, 'The accepted baseline and report differ.');
      const mappings = baselineReport.identity_mappings ?? [];
      need(selectedIndexes.every(index => index < mappings.length), 'A selected accepted mapping does not exist.');
      await download('accepted-predecessor-candidate.json',
        button('Download accepted predecessor candidate'), baseline.sha256);
      if (mappings.length) {
        await page.locator('input[name="source-mapping-search"]').fill('');
        while (!(await button('Previous decisions', panel).isDisabled())) await button('Previous decisions', panel).click();
        const observed = new Set();
        for (;;) {
          const checks = await panel.locator('input[name^="source-reuse-mapping-"]').all();
          for (const check of checks) {
            const index = Number((await check.getAttribute('name')).slice('source-reuse-mapping-'.length));
            const row = check.locator('xpath=ancestor::tr');
            need(!observed.has(index) && equal(await exactDetail(row, 'Complete typed decision · index ' + index), mappings[index]),
              'The browser changed an accepted typed mapping.');
            observed.add(index); await check.setChecked(selectedIndexes.includes(index));
          }
          if (await button('Following decisions', panel).isDisabled()) break;
          need(observed.size < mappings.length, 'The accepted mapping list has unexpected continuation.');
          await button('Following decisions', panel).click();
        }
        need(observed.size === mappings.length, 'The browser omitted accepted identity decisions.');
      }
      await retain('views/selected-accepted-decisions.json', selectedIndexes.map(index => ({ index, value: mappings[index] })));
    }
    await page.locator('select[name="source-corrected-candidate"]').selectOption(candidateId ?? '');
    await page.locator('input[name="source-normalize-v3"]').setChecked(normalizeV3);
    await page.locator('input[name="source-review-label"]').fill('Browser receiving — current acquired edition and accepted decisions');
    const mappingInput = page.locator('textarea[name="source-identity-mappings"]');
    // This programme carries only the explicitly selected accepted decisions; no new identity facts are invented.
    const mappingDetails = detail(panel, 'Additional explicit identity mappings');
    if (!(await mappingDetails.evaluate(element => element.open))) await mappingDetails.locator(':scope > summary').click();
    await mappingInput.fill('[]');
    const selection = await download('following-review-selection.json', button('Download this review selection'));
    const selectionBody = parse(await readFile(selection.file));
    need(selectionBody.sourceId === sourceId && selectionBody.sourceSha256 === source.sourceSha256 &&
      selectionBody.latestCatalogId === source.latestCatalogId &&
      equal(selectionBody.reuseMappingIndexes, [...selectedIndexes].sort((a, b) => a - b)),
      'The saved browser selection changed current source or accepted decisions.');
    const created = await mutation('dcat/sources/review', button('Prepare source edition review'), 'following-review');
    const request = created.request;
    need(request.sourceId === sourceId && request.expectedSourceSha256 === source.sourceSha256 &&
      request.expectedLatestCatalogId === source.latestCatalogId &&
      request.baselineReleaseId === selectedBaselineId &&
      equal(request.reuseMappingIndexes ?? [], [...selectedIndexes].sort((a, b) => a - b)) &&
      (request.candidateId ?? null) === (candidateId ?? null) && request.normalizeV3 === normalizeV3 &&
      (!baseline || request.expectedBaselineSha256 === baseline.sha256 &&
        request.expectedBaselineReviewSha256 === baseline.reviewSha256), 'The browser submitted a different review selection.');
    need(UUID.test(created.started.reviewId ?? '') && created.value?.id === created.started.reviewId,
      'The original review operation changed its allocated review identity.');
    await page.waitForFunction(id => document.querySelector('select[name="saved-review"]')?.value === id &&
      Boolean(document.querySelector('.migration-tabs')), created.started.reviewId, { timeout: 30000 });
    const selected = await inspectSavedReview(created.started.reviewId, 'browser-following');
    need(selected.saved.sourceId === source.latestCatalogId && selected.saved.acquisitionSourceId === sourceId &&
      selected.report?.source?.sha256 === dcat.catalogs.find(item => item.id === source.latestCatalogId)?.sha256,
      'The retained browser review lost its original acquired edition.');
    if (baseline) need(selected.report.comparison?.sha256 === baseline.sha256,
      'The following browser review lost the accepted candidate comparison.');
    if (candidateId) need(selected.report.candidate?.sha256 === dcat.catalogs.find(item => item.id === candidateId)?.sha256,
      'Reviewing selected decisions changed the explicitly uploaded candidate bytes.');
    result.preparedReview = result.review;
  }
  async function handover() {
    await button('Open complete workspace handover').click();
    await page.getByRole('heading', { name: 'Workspace transfer', exact: true }).waitFor({ state: 'visible' });
    const state = await api('status');
    const expected = {
      dcat_catalogues: state.dcat.catalogs.length, dcat_reviews: state.dcat.reviews.length,
      dcat_releases: state.dcat.releases.length, dcat_sources: state.dcat.sources.length,
      dcat_acquisitions: state.dcat.acquisitions.length,
    };
    const shown = await page.locator('#view .card').filter({
      has: page.getByRole('heading', { name: 'Export this workspace', exact: true }),
    }).locator('table').evaluate(table => {
      const keys = [...table.querySelectorAll('thead th')].map(item => item.textContent);
      const values = [...table.querySelectorAll('tbody tr:first-child td')].map(item => item.textContent);
      return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
    });
    for (const [key, value] of Object.entries(expected))
      need(shown[key] === String(value), 'The full handover omits retained inventory: ' + key);
    let selected;
    if (mode === 'full') {
      const created = await mutation('workspace/archives', button('Create complete workspace archive'), 'following-workspace');
      selected = (await api('workspace/archives')).find(item => item.id === created.value.id);
      need(selected && HASH.test(selected.sha256), 'The exported complete workspace identity is missing.');
      await page.waitForFunction(sha => [...document.querySelectorAll('input[name="archive-sha256"]')]
        .some(input => input.value === sha), selected.sha256, { timeout: 30000 });
    } else {
      const archives = await api('workspace/archives');
      selected = expectedBrowserResult?.workspaceArchive ?
        archives.find(item => item.id === expectedBrowserResult.workspaceArchive.id &&
          item.sha256 === expectedBrowserResult.workspaceArchive.sha256) : archives[0];
      // The original archive omits its own newly created archive entry; a received project may have no retained exports.
      if (expectedBrowserResult?.workspaceArchive && !selected)
        result.receivedArchive = { ...expectedBrowserResult.workspaceArchive, presentInSourceArchiveInventory: false };
    }
    if (selected) {
      const inputs = await page.locator('input[name="archive-sha256"]').evaluateAll(items => items.map(item => item.value));
      const index = inputs.indexOf(selected.sha256); need(index >= 0, 'The archive view did not select the actual export.');
      const archiveCard = page.locator('#view .card').filter({
        has: page.getByRole('button', { name: 'Download workspace archive', exact: true }),
      }).nth(index);
      const artifact = await download(mode + '-complete-workspace.ckanw',
        button('Download workspace archive', archiveCard), selected.sha256, selected.bytes);
      result.workspaceArchive = { id: selected.id, ...artifact };
    }
    await capture('complete-workspace', 1280); await capture('complete-workspace', 390);
    const final = await api('status');
    for (const key of ['catalogs', 'reviews', 'releases', 'sources', 'acquisitions'])
      for (const item of initialState.dcat[key] ?? [])
        need(final.dcat[key]?.some(actual => actual.id === item.id), 'The browser lost original ' + key + ' history.');
    need(final.dcat.activeReleaseId === initialState.dcat.activeReleaseId,
      'The source-review and handover continuation changed the accepted release.');
    if (mode === 'reopen') need(stringify(final.dcat) === initialDcat, 'Reopening changed received source or review decisions.');
    await retain('final-status.json', final);
    result.finalInventory = { ...expected, activeReleaseId: final.dcat.activeReleaseId };
  }
  try {
    await phase('authenticate-original-project', async () => {
      if (!context) {
        let library = playwright;
        if (!library) {
          need(typeof playwrightModule === 'string' && isAbsolute(playwrightModule), 'Select the installed Playwright module.');
          library = await import(pathToFileURL(playwrightModule).href);
        }
        const chromium = library.chromium ?? library.default?.chromium;
        need(chromium && typeof chromiumPath === 'string' && isAbsolute(chromiumPath),
          'Select the existing native Chromium executable.');
        ownedBrowser = await chromium.launch({ executablePath: chromiumPath, headless: true });
        context = await ownedBrowser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
        ownedContext = true;
      }
      result.runtime = { node: process.version, browser: context.browser()?.version() ?? null,
        executable: chromiumPath ?? null, playwrightModule: playwrightModule ?? null };
      if (playwrightModule) {
        const manifest = JSON.parse(await readFile(join(dirname(playwrightModule), 'package.json'), 'utf8'));
        result.runtime.playwrightVersion = manifest.version;
      }
      page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(45000);
      page.on('pageerror', error => result.browserErrors.push({ message: redact(error.message), stack: redact(error.stack) }));
      page.on('response', response => {
        try {
          const parsed = new URL(response.url());
          if (parsed.origin === origin && parsed.pathname.startsWith('/api/') && response.status() >= 400)
            result.httpFailures.push({ path: parsed.pathname, method: response.request().method(), status: response.status() });
        } catch {}
      });
      page.on('requestfailed', request => {
        try {
          const parsed = new URL(request.url());
          if (parsed.origin === origin && parsed.pathname.startsWith('/api/'))
            result.httpFailures.push({ path: parsed.pathname, method: request.method(), error: redact(request.failure()?.errorText) });
        } catch {}
      });
      page.on('request', request => {
        try {
          const parsed = new URL(request.url());
          if (mode === 'reopen' && parsed.origin === origin && parsed.pathname.startsWith('/api/') &&
            !['GET', 'HEAD'].includes(request.method()))
            result.httpFailures.push({ path: parsed.pathname, method: request.method(), error: 'Unexpected reopen mutation.' });
        } catch {}
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.locator('nav button[data-tab="migration"]').waitFor({ state: 'visible' });
      const launch = await api('launch'), state = await api('status');
      need(launch.directory === resolve(projectDirectory) && launch.project?.createdAt === projectCreatedAt &&
        launch.project?.sourceKind === state.sourceKind && launch.project?.catalogOrigin === state.catalogOrigin &&
        state.directory === resolve(projectDirectory) && state.createdAt === projectCreatedAt &&
        Number.isInteger(launch.pid) && launch.pid > 0 && UUID.test(launch.instanceId ?? '') && !state.active,
        'The original authenticated process is bound to another or busy saved project.');
      need(Array.isArray(state.dcat?.sources) && state.dcat.sources.some(item => item.id === sourceId),
        'The received project is missing its original source.');
      if (receivingResult.catalog?.id) need(state.dcat.catalogs.some(item => item.id === receivingResult.catalog.id &&
        item.sha256 === receivingResult.catalog.sha256), 'The acquired original catalogue identity changed.');
      if (receivingResult.review?.id) need(state.dcat.reviews.some(item => item.id === receivingResult.review.id &&
        item.reviewSha256 === receivingResult.review.reviewSha256), 'The retained domain review identity changed.');
      if (expectedBrowserResult?.preparedReview) {
        const old = expectedBrowserResult.preparedReview;
        need(state.dcat.reviews.some(item => item.id === old.id && item.reportSha256 === old.reportSha256 &&
          item.reviewSha256 === old.reviewSha256), 'The received project lost its actual browser review.');
      }
      initialState = state; initialDcat = stringify(state.dcat);
      result.listener = { pid: launch.pid, instanceId: launch.instanceId, directory: launch.directory, project: launch.project };
      for (const name of ['public/app.mjs', 'public/migration.mjs', 'public/dcat-sources.mjs', 'public/dcat-json.mjs']) {
        const bytes = await readFile(join(root, PREFIX, name));
        result.sourceFiles.push({ path: PREFIX + name, bytes: bytes.length, sha256: hash(bytes) });
      }
      await retain('initial-status.json', state);
      await page.waitForFunction(() => !location.hash);
      need(!new URL(page.url()).hash, 'The original browser did not remove its startup token.');
      await healthy();
    });
    await phase('retained-source-and-http-history', inspectSource);
    const priorReview = expectedBrowserResult?.preparedReview?.id ?? receivingResult.review?.id;
    if (priorReview) await phase('complete-retained-review', () => inspectSavedReview(priorReview, mode + '-retained'));
    if (mode === 'full' && receivingResult.catalog?.id)
      await phase('accepted-decisions-and-current-source-review', prepareFollowingReview);
    else if (mode === 'full') result.followingReview = {
      state: 'DEFERRED', reason: 'No successfully checked complete catalogue was retained by the original acquisition programme.',
    };
    await phase('complete-workspace-continuation', handover);
    result.complete = true; result.completedAt = stamp(); await checkpoint(); return result;
  } catch (error) {
    result.error = { code: error.code ?? 'DCAT_RECURRING_BROWSER_FAILED', message: redact(error.message) };
    result.completedAt = stamp();
    if (page && !page.isClosed()) {
      try {
        const path = join(out, 'failure.png'); await page.screenshot({ path, fullPage: true });
        await retainedFile(path, 'image/png');
      } catch {}
      try { await retain('failure.html', redact(await page.content()), 'text/html'); } catch {}
    }
    await checkpoint();
    throw Object.assign(new Error(result.error.message), { code: result.error.code, outputDirectory: out, reportPath });
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (ownedContext) await context.close().catch(() => {});
    if (ownedBrowser) await ownedBrowser.close().catch(() => {});
  }
}
