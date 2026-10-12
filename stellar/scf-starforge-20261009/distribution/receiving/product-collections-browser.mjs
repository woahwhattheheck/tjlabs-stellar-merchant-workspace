// MIT. Operate the original product browsers with an existing native browser.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const need = (value, code) => { if (!value) throw Object.assign(new Error(code), { code }); };
const digest = value => createHash('sha256').update(value).digest('hex');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const cssValue = value => JSON.stringify(String(value));
const safeName = value => String(value).replace(/[^A-Za-z0-9._-]/g, '-');

async function returned(response) {
  const value = await response.json();
  need(response.ok(), typeof value.error === 'string' ? value.error : 'RECEIVING_BROWSER_REQUEST_FAILED');
  return value;
}
async function responseFor(page, path, method, action) {
  const response = page.waitForResponse(value => new URL(value.url()).pathname === path
    && value.request().method() === method);
  try { await action(); return returned(await response); }
  catch (error) { response.catch(() => {}); throw error; }
}
async function idle(root) {
  await root.page().waitForFunction(node => node.getAttribute('aria-busy') === 'false',
    await root.elementHandle());
}
function byName(root, name) { return root.getByRole('button', { name, exact: true }); }

/** Uses the operator's installed Playwright and executable, without downloading either. */
export async function openProductCollectionsBrowser({ playwrightModule, executablePath, outputDirectory }) {
  const module = await import(pathToFileURL(playwrightModule).href);
  const chromium = module.chromium ?? module.default?.chromium;
  need(chromium?.launch, 'RECEIVING_EXISTING_PLAYWRIGHT_REQUIRED');
  const browser = await chromium.launch({ executablePath, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ acceptDownloads: true,
    viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(120000);
  let previous;
  try { previous = JSON.parse(await readFile(join(outputDirectory, 'browser-observations.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const failures = [], artifacts = previous?.artifacts ?? [], pages = new Set();
  const previousFailures = [...(previous?.previousFailures ?? []), ...(previous?.failures ?? [])];
  await mkdir(join(outputDirectory, 'views'), { recursive: true, mode: 0o700 });
  await mkdir(join(outputDirectory, 'browser-exports'), { recursive: true, mode: 0o700 });

  async function page() {
    const current = await context.newPage(); pages.add(current);
    current.on('pageerror', error => failures.push({
      kind: 'pageerror', page: new URL(current.url()).pathname, message: String(error.message).slice(0, 4000),
    }));
    current.on('close', () => pages.delete(current));
    return current;
  }
  async function capture(current, name, target) {
    for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }],
      ['phone', { width: 390, height: 844 }]]) {
      await current.setViewportSize(viewport);
      await current.evaluate(async () => {
        if (document.fonts) await document.fonts.ready;
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      });
      if (target) await target.scrollIntoViewIfNeeded();
      else await current.evaluate(() => window.scrollTo(0, 0));
      const path = join(outputDirectory, 'views', safeName(name) + '-' + label + '.png');
      const bytes = await current.screenshot({ path, fullPage: false, animations: 'disabled' });
      artifacts.push({ path, bytes: bytes.length, sha256: digest(bytes), viewport,
        page: new URL(current.url()).pathname, capturedAt: new Date().toISOString() });
    }
    await current.setViewportSize({ width: 1440, height: 1000 });
  }
  async function download(current, root, name, filename) {
    const pending = current.waitForEvent('download');
    await byName(root, name).click();
    const original = await pending, failure = await original.failure();
    need(!failure, 'RECEIVING_BROWSER_DOWNLOAD_FAILED');
    const path = join(outputDirectory, 'browser-exports', safeName(filename));
    await original.saveAs(path);
    const bytes = await readFile(path);
    const value = { path, name: original.suggestedFilename(), bytes: bytes.length, sha256: digest(bytes) };
    artifacts.push(value); return { ...value, raw: bytes };
  }
  async function runtimePage(url) {
    const current = await page();
    const state = await responseFor(current, '/api/state', 'GET', () => current.goto(url));
    await current.waitForFunction(directory => document.getElementById('workspace-location')?.textContent === directory,
      state.directory);
    await current.locator('button[data-view="source-builds"]').first().click();
    await current.locator('#source-build-workspace').waitFor({ state: 'visible' });
    return current;
  }
  async function sourceDiscovery(current, source) {
    const root = current.locator('#source-build-workspace');
    await root.locator('[data-repository]').fill(source.repository);
    await root.locator('[data-ref]').fill(source.commit);
    await root.locator('[data-python]').fill(source.python);
    await root.locator('[data-offline]').setChecked(source.offline);
    const catalog = await responseFor(current, '/api/source-builds/catalog', 'POST',
      () => byName(root, 'Load committed products').click());
    await idle(root);
    need(catalog.sourceCommit === source.commit, 'RECEIVING_SOURCE_COMMIT_CHANGED');
    const selections = source.compareSelections.map(id => {
      const product = catalog.products.find(item => item.id === id);
      need(product?.available === true, 'RECEIVING_COMPARISON_PRODUCT_UNAVAILABLE');
      return product;
    });
    const all = selections.find(item => item.id === 'all');
    need(all, 'RECEIVING_FULL_TOOLKIT_REQUIRED');
    const search = root.locator('[data-product-search]');
    await search.fill(source.searchQuery || all.title);
    const found = await root.locator('article.source-catalog-row').allTextContents();
    need(found.length > 0, 'RECEIVING_PRODUCT_SEARCH_EMPTY');
    await capture(current, 'source-product-search', root.locator('[data-products]'));
    const details = [];
    for (const selected of selections) {
      await search.fill(selected.id);
      const checkbox = root.locator('input[data-compare-id=' + cssValue(selected.id) + ']');
      await checkbox.waitFor({ state: 'visible' });
      await checkbox.setChecked(true);
      const row = checkbox.locator('xpath=ancestor::article[1]');
      await row.locator('button.runtime-entry').click(); await idle(root);
      await root.locator('[data-product-preview]').getByRole('heading',
        { name: selected.title, exact: true }).waitFor();
      const saved = await download(current, root, 'Save product details', 'product-' + selected.id + '.json');
      const value = JSON.parse(saved.raw.toString('utf8'));
      need(value.id === selected.id && value.sourceCommit === source.commit, 'RECEIVING_PRODUCT_DETAIL_CHANGED');
      await download(current, root, 'Save readable product guide', 'product-' + selected.id + '.md');
      details.push(value);
      if (selected.id === 'all') {
        const requirements = root.locator('[data-product-preview]').getByText('Installation requirements', { exact: true });
        await requirements.click();
        await capture(current, 'source-full-toolkit-adapters', requirements);
      }
    }
    await search.fill('');
    await byName(root, 'Compare selected products').click(); await idle(root);
    const comparisonRoot = root.locator('[data-comparison]');
    await comparisonRoot.getByRole('heading', { name: 'Compare product contents', exact: true }).waitFor();
    const saved = await download(current, root, 'Save comparison', 'product-comparison.json');
    const comparison = JSON.parse(saved.raw.toString('utf8'));
    need(comparison.sourceCommit === source.commit
      && same(comparison.selections, source.compareSelections), 'RECEIVING_PRODUCT_COMPARISON_CHANGED');
    await download(current, root, 'Save readable comparison', 'product-comparison.md');
    await capture(current, 'source-product-comparison', comparisonRoot);
    await search.fill('all');
    const selected = root.locator('input[data-compare-id="all"]').locator('xpath=ancestor::article[1]');
    await selected.locator('button.runtime-entry').click(); await idle(root);
    const review = await responseFor(current, '/api/source-builds/review', 'POST',
      () => byName(root, 'Review selected product').click());
    await idle(root);
    need(review.sourceCommit === source.commit && review.selection === 'all', 'RECEIVING_SOURCE_REVIEW_CHANGED');
    await capture(current, 'source-saved-build-review', root.locator('[data-review-panel]'));
    return { catalog, search: { query: source.searchQuery || all.title, visibleRows: found },
      details, comparison, review };
  }
  async function reopenSource(current, review) {
    const root = current.locator('#source-build-workspace');
    const card = root.locator('[data-review-id=' + cssValue(review.reviewId) + ']');
    await card.waitFor({ state: 'visible' });
    await card.getByRole('button', { name: /^(Open product|Reopen saved review)$/ }).click();
    await idle(root);
    await root.locator('[data-review-panel]').waitFor({ state: 'visible' });
    need((await root.locator('[data-review-panel]').innerText()).includes(review.sourceCommit),
      'RECEIVING_SAVED_REVIEW_SOURCE_CHANGED');
    await byName(root.locator('[data-review-panel]'), 'Download package').waitFor({ state: 'visible' });
    await capture(current, 'source-reopened-complete-build', root.locator('[data-review-panel]'));
  }
  async function runtimeReady(current, runtimeId, archiveId, profile) {
    await current.locator('#refresh').click();
    const choosing = current.waitForResponse(value => new URL(value.url()).pathname === '/api/state'
      && new URL(value.url()).searchParams.get('runtimeId') === runtimeId);
    await current.locator('#runtime-list button[data-runtime-id=' + cssValue(runtimeId) + ']').click();
    const chosen = await returned(await choosing);
    need(chosen.selected?.id === runtimeId, 'RECEIVING_VISIBLE_RUNTIME_CHANGED');
    await current.waitForFunction(label => document.getElementById('selected-name')?.textContent === label,
      chosen.selected.label);
    await capture(current, 'installed-runtime', current.locator('#selected-name'));
    await current.locator('button[data-view="profile"]').first().click();
    const selecting = current.waitForResponse(value => new URL(value.url()).pathname === '/api/catalog'
      && new URL(value.url()).searchParams.get('archiveId') === archiveId);
    await current.locator('#archive-select').selectOption(archiveId);
    const source = await returned(await selecting);
    const expectedFeatures = Object.keys(source.catalog.groups).filter(name => name !== 'native').sort();
    await current.waitForFunction(names => JSON.stringify([...document.querySelectorAll('#features input')]
      .map(input => input.value).sort()) === JSON.stringify(names), expectedFeatures);
    await current.locator('#native').setChecked(profile.native);
    await current.locator('#operator').setChecked(profile.operator);
    // Selecting the archive asynchronously loads its actual feature list.
    const reviewed = await responseFor(current, '/api/review', 'POST', async () => {
      for (const input of await current.locator('#features input[type="checkbox"]').all()) {
        const name = await input.getAttribute('value');
        await input.setChecked(profile.features.includes(name));
      }
      await current.locator('#pins').fill(JSON.stringify(profile.pins));
      await current.locator('#review-profile').click();
    });
    await capture(current, 'installed-source-profile', current.locator('#profile-review'));
    return reviewed;
  }
  async function collectionsPage(url) {
    const current = await page();
    await responseFor(current, '/api/status', 'GET', () => current.goto(url));
    await current.locator('#workspace').waitFor({ state: 'visible' });
    return current;
  }
  async function library(current) {
    await current.locator('#open-composer').click();
    const root = current.locator('#composer-panel'); await root.waitFor({ state: 'visible' }); await idle(root);
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (const name of ['All plans', 'All saved periods', 'All request plans']) {
        const control = byName(root, name);
        if (await control.isVisible()) {
          await control.click(); await idle(root); changed = true; break;
        }
      }
      if (!changed) break;
    }
    const plansResponse = current.waitForResponse(value =>
      new URL(value.url()).pathname === '/api/composer/plans' && value.request().method() === 'GET');
    const editionsResponse = current.waitForResponse(value =>
      new URL(value.url()).pathname === '/api/composer/editions' && value.request().method() === 'GET');
    try { await byName(root, 'Refresh plans').click(); }
    catch (error) { plansResponse.catch(() => {}); editionsResponse.catch(() => {}); throw error; }
    const [plans, editions] = await Promise.all([plansResponse.then(returned), editionsResponse.then(returned)]);
    await idle(root);
    return { root, plans: plans.plans, editions: editions.editions };
  }
  async function savePlan(current, file) {
    const { root } = await library(current);
    await root.locator('input[type="file"]').setInputFiles(file);
    await root.getByText('Plan imported. Review its source paths and save a revision in this workspace.',
      { exact: true }).waitFor();
    await idle(root);
    const saved = await responseFor(current, '/api/composer/plans', 'POST',
      () => byName(root, 'Save plan revision').click());
    await idle(root);
    await download(current, root, 'Download saved plan', 'plan-' + saved.planSha256 + '.json');
    await capture(current, 'plan-' + saved.planSha256.slice(0, 12), root.locator('[data-plan-form]'));
    return saved;
  }
  async function openPlan(current, saved) {
    const { root, plans } = await library(current);
    const index = plans.findIndex(value => value.id === saved.id && value.planSha256 === saved.planSha256);
    need(index >= 0, 'RECEIVING_SAVED_PLAN_REVISION_MISSING');
    const value = await responseFor(current, '/api/composer/plans/' + saved.id + '/' + saved.planSha256, 'GET',
      () => byName(root, 'Open plan').nth(index).click());
    await idle(root);
    need(value.planSha256 === saved.planSha256, 'RECEIVING_SAVED_PLAN_REVISION_CHANGED');
    return value;
  }
  async function inspectSavedCatalog(current, path) {
    const root = current.locator('#composer-panel');
    const field = root.getByLabel('Saved catalog file', { exact: true });
    const originalPath = await field.inputValue();
    if (originalPath !== path) await field.fill(path);
    const value = await responseFor(current, '/api/composer/catalog', 'POST',
      () => byName(root, 'Read saved catalog').click());
    await idle(root);
    await capture(current, 'original-merchant-catalog', root.locator('.composer-catalog'));
    // This source inspection uses an unsaved editor. Reloading opens the saved
    // revision again, including its original period template.
    if (originalPath !== path) await current.reload();
    return value;
  }
  async function preparePeriod(current, saved, period) {
    await openPlan(current, saved);
    const root = current.locator('#composer-panel');
    await byName(root, 'New period').click();
    await byName(root, 'Set up period').click();
    await root.getByLabel('Period name', { exact: true }).fill(period.name);
    await root.getByLabel('Collection reference', { exact: true }).fill(period.collectionId);
    for (const parameter of saved.plan.parameters) {
      const value = period.values[parameter.name];
      need(typeof value === 'string', 'RECEIVING_EXPLICIT_PERIOD_VALUES_REQUIRED');
      await root.getByLabel(parameter.label || parameter.name, { exact: true }).fill(value);
    }
    const edition = await responseFor(current, '/api/composer/editions/prepare', 'POST',
      () => byName(root, 'Prepare and review period').click());
    await idle(root);
    await capture(current, 'period-' + period.collectionId + '-prepared', root.locator('.composer-period-review'));
    return edition;
  }
  async function openEdition(current, collectionId) {
    const { root, editions } = await library(current);
    await byName(root, 'Saved periods').click();
    const index = editions.findIndex(value => value.collectionId === collectionId);
    need(index >= 0, 'RECEIVING_SAVED_PERIOD_MISSING');
    const edition = await responseFor(current, '/api/composer/editions/' + collectionId, 'GET',
      () => byName(root, 'Open').nth(index).click());
    await idle(root); return edition;
  }
  async function createPeriod(current, edition) {
    const root = current.locator('#composer-panel');
    if (edition.phase === 'CREATED') return edition;
    need(edition.phase === 'PREPARED' && edition.editionSha256 && edition.preview?.previewSha256,
      'RECEIVING_PERIOD_REVIEW_REQUIRED');
    const value = await responseFor(current, '/api/composer/editions/' + edition.collectionId + '/create', 'POST',
      () => root.getByRole('button', { name: /^(Create reviewed collection|Complete reviewed collection)$/ }).click());
    // The original onCreated callback opens the collection and mappings after the POST.
    await current.locator('#detail-panel').waitFor({ state: 'visible' });
    need(value.phase === 'CREATED', 'RECEIVING_ORIGINAL_COLLECTION_INCOMPLETE');
    return value;
  }
  async function showCollection(current, edition, name) {
    const value = await openEdition(current, edition.collectionId);
    need(value.phase === 'CREATED' && value.collection, 'RECEIVING_CREATED_COLLECTION_REQUIRED');
    await byName(current.locator('#composer-panel'), 'Open collection').click();
    await current.locator('#detail-panel').waitFor({ state: 'visible' });
    const mappings = await current.locator('#intent-workspaces').inputValue();
    const actual = Object.fromEntries(mappings.split('\n').filter(Boolean).map(line => {
      const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
    }));
    need(Object.keys(actual).length === Object.keys(value.workspaceByIntent).length
      && Object.entries(value.workspaceByIntent).every(([key, path]) => actual[key] === path)
      && await current.locator('#shared-workspace').inputValue() === '',
    'RECEIVING_ORIGINAL_OPERATOR_MAPPING_CHANGED');
    await capture(current, name, current.locator('#detail-panel'));
    return { edition: value, workspaceByIntent: actual };
  }
  async function showPrepared(current, collectionId, name) {
    const value = await openEdition(current, collectionId), root = current.locator('#composer-panel');
    await download(current, root, 'Download period JSON', name + '.json');
    await capture(current, name, root.locator('.composer-period-review'));
    return value;
  }
  async function showRecovery(current, requestId, name) {
    const root = current.locator('#recovery-panel');
    let history = await responseFor(current, '/api/recovery/history', 'POST',
      () => current.locator('#open-recovery').click());
    await root.waitFor({ state: 'visible' });
    while (!history.rows.some(row => row.requestId === requestId) && history.hasMore) {
      history = await responseFor(current, '/api/recovery/history', 'POST',
        () => byName(root, 'More').click());
    }
    need(history.rows.some(row => row.requestId === requestId), 'RECEIVING_ORIGINAL_RECOVERY_HISTORY_MISSING');
    const chosen = byName(root, requestId); await chosen.waitFor({ state: 'visible' });
    const value = await responseFor(current, '/api/recovery/' + requestId, 'GET', () => chosen.click());
    need(value.requestId === requestId, 'RECEIVING_ORIGINAL_RECOVERY_SELECTION_CHANGED');
    await capture(current, name, root.getByRole('heading', { name: 'Retained operation', exact: true }));
    return value;
  }
  return { page, capture, runtimePage, sourceDiscovery, reopenSource, runtimeReady,
    collectionsPage, library, savePlan, openPlan, inspectSavedCatalog, preparePeriod, openEdition,
    createPeriod, showCollection, showPrepared, showRecovery,
    async finish() {
      await writeFile(join(outputDirectory, 'browser-observations.json'),
        JSON.stringify({ artifacts: [...new Map(artifacts.map(item => [item.path, item])).values()],
          failures, previousFailures }, null, 2) + '\n', { mode: 0o600 });
      return { artifacts: [...new Map(artifacts.map(item => [item.path, item])).values()], failures, previousFailures };
    },
    async close() { await context.close(); await browser.close(); },
  };
}
