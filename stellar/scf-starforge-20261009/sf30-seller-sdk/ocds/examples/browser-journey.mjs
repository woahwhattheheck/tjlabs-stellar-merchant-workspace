// MIT. One browser journey through the original OCDS operator interface.
import assert from 'node:assert/strict';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function installedChromium() {
  const roots = [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, ...String(process.env.NODE_PATH || '').split(':')].filter(Boolean);
  for (const name of ['playwright', '@playwright/test', ...roots.flatMap(root => [join(root, 'playwright'), join(root, '@playwright/test')])]) {
    try { const found = require(name); if (found.chromium) return found.chromium; }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  throw new Error('An installed Playwright Chromium runtime is required for the browser phase.');
}
const reviewFields = review => Object.fromEntries(['disposition', 'owner', 'nextAction', 'note', 'shortlisted']
  .map(key => [key, key === 'shortlisted' ? Boolean(review?.[key]) : review?.[key] || '']));

export async function runBrowserJourney(options) {
  const temporaryDirectory = join(resolve(options.outDirectory), 'playwright-tmp');
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });
  const previousTemporaryDirectory = process.env.TMPDIR;
  process.env.TMPDIR = temporaryDirectory;
  try {
    return await browserJourney(options);
  } finally {
    if (previousTemporaryDirectory === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previousTemporaryDirectory;
  }
}

async function browserJourney({ origin, sourcePaths, outDirectory, executablePath = process.env.OCDS_BROWSER_EXECUTABLE }) {
  const address = new URL(origin);
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname), 'Use the running local OCDS operator origin.');
  const files = Array.isArray(sourcePaths) ? sourcePaths : Object.values(sourcePaths || {});
  assert.equal(files.length, 2, 'Supply the two original CDMX release-package paths.');
  const originals = await Promise.all(files.map(async file => {
    const path = resolve(file), document = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
    assert(Array.isArray(document.releases) && document.releases.length >= 2, 'Each original input retains both editions.');
    return { path, document, ocid: document.releases[0].ocid };
  }));
  const bentley = originals.find(item => /bentley/i.test(basename(item.path))) ||
    originals.find(item => /bentley/i.test(JSON.stringify(item.document)));
  assert(bentley, 'The original Bentley history must be one of the supplied inputs.');
  const output = resolve(outDirectory);
  await mkdir(output, { recursive: true });
  const browser = await installedChromium().launch({ headless: true,
    ...(executablePath ? { executablePath: resolve(executablePath) } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const page = await context.newPage(), pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.setDefaultTimeout(30000);
  const state = () => page.evaluate(async () => {
    const response = await fetch('/api/workspace');
    if (!response.ok) throw new Error('Workspace read failed: ' + response.status);
    return response.json();
  });
  const openProject = ocid => page.locator('[id="open-' + encodeURIComponent(ocid) + '"]').click();
  const changed = async (path, method, action) => {
    const [response] = await Promise.all([
      page.waitForResponse(item => new URL(item.url()).pathname === path && item.request().method() === method),
      action(),
    ]);
    assert(response.ok(), 'Operator request failed: ' + path + ' (' + response.status() + ') ' + await response.text());
    return response.json();
  };
  const download = async (name, action) => {
    const [file] = await Promise.all([page.waitForEvent('download'), action()]);
    const path = join(output, name);
    await file.saveAs(path);
    assert((await stat(path)).size > 0, 'The UI download must contain data: ' + name);
    return path;
  };
  const checkReview = async expected => {
    await openProject(bentley.ocid);
    await page.locator('#tab-review').click();
    for (const key of ['disposition', 'owner', 'nextAction', 'note'])
      assert.equal(await page.locator('#review-' + key).inputValue(), expected[key], 'Retained review field: ' + key);
    assert.equal(await page.getByLabel('Keep this procedure on the shortlist', { exact: true }).isChecked(), expected.shortlisted);
  };
  try {
    await page.goto(address.origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /^\d[\d,]*$/.test(document.getElementById('stat-processes')?.textContent || ''));
    const initial = await state();
    for (const original of originals) {
      await page.locator('#open-import').click();
      await page.locator('#source-file').setInputFiles(original.path);
      await page.waitForFunction(() => Boolean(document.getElementById('import-json')?.value.trim()));
      await changed('/api/import', 'POST', () => page.locator('#submit-import').click());
      await page.locator('#import-dialog').waitFor({ state: 'hidden' });
    }
    let workspace = await state();
    for (const original of originals) {
      assert(workspace.projects.some(project => project.ocid === original.ocid), 'Imported original procedure ' + original.ocid);
      await openProject(original.ocid);
      await page.locator('#edition-select').waitFor();
      assert((await page.locator('#edition-select option').count()) >= 2, 'Both original editions are selectable.');
    }
    if (initial.projects.length === 0) assert.equal(workspace.projects.length, 2);
    const beforeReview = initial.projects.find(project => project.ocid === bentley.ocid)?.review;
    await openProject(bentley.ocid);
    await page.locator('#tab-review').click();
    if (!beforeReview?.revision) {
      await page.locator('#review-disposition').selectOption('reviewing');
      await page.locator('#review-owner').fill('SCF procurement team');
      await page.locator('#review-nextAction').fill('Review the retained tender and contract documents.');
      await page.locator('#review-note').fill('Compare the original Bentley editions and retain their exchange-rate metadata.');
      await page.getByLabel('Keep this procedure on the shortlist', { exact: true }).check();
      await changed('/api/projects/' + encodeURIComponent(bentley.ocid) + '/review', 'PATCH',
        () => page.locator('#review-save').click());
    }
    workspace = await state();
    const expectedReview = reviewFields(workspace.projects.find(project => project.ocid === bentley.ocid).review);
    if (beforeReview?.revision) assert.deepEqual(expectedReview, reviewFields(beforeReview));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await checkReview(expectedReview);
    const project = workspace.projects.find(item => item.ocid === bentley.ocid);
    const editions = [...bentley.document.releases].sort((left, right) => String(left.date).localeCompare(String(right.date)));
    const entryFor = document => project.entries.find(entry => entry.kind === 'release' &&
      entry.releaseId === document.id && entry.date === document.date);
    const before = entryFor(editions[0]), after = entryFor(editions.at(-1));
    assert(before && after && before.id !== after.id, 'Select the exact two original Bentley releases.');
    await page.locator('#tab-compare').click();
    await page.getByLabel('Before edition', { exact: true }).selectOption(before.id);
    await page.getByLabel('After edition', { exact: true }).selectOption(after.id);
    const comparison = await changed('/api/compare', 'GET',
      () => page.getByRole('button', { name: 'Compare editions', exact: true }).click());
    await page.locator('.diff-table').waitFor();
    assert.match(await page.locator('.diff-table').innerText(), /exchangeRate/);
    const downloads = {};
    for (const format of ['json', 'csv', 'html']) {
      await page.locator('#export-scope').selectOption('all');
      await page.locator('#export-format').selectOption(format);
      downloads[format] = await download('operator-export.' + format,
        () => page.getByRole('button', { name: 'Export data', exact: true }).click());
      const body = await readFile(downloads[format], 'utf8');
      for (const original of originals) assert(body.includes(original.ocid), 'Export retains procedure ' + original.ocid);
    }
    const packagePath = await download('operator-workspace.json', () => page.locator('#save-workspace').click());
    const packet = JSON.parse(await readFile(packagePath, 'utf8'));
    await page.locator('#receive-workspace').click();
    await page.locator('#receive-file').setInputFiles(packagePath);
    await page.waitForFunction(() => Boolean(document.getElementById('receive-summary')?.textContent));
    const received = await changed('/api/receive', 'POST', () => page.locator('#submit-receive').click());
    await page.locator('#receive-dialog').waitFor({ state: 'hidden' });
    if (await page.locator('#handoffs-dialog').isVisible()) await page.locator('#close-handoffs').click();
    await page.locator('#view-handoffs').click();
    const row = page.locator('#handoffs-body [data-package-id="' + packet.packageId + '"]');
    await row.getByRole('button', { name: 'Open handoff', exact: true }).click();
    await page.getByText('Complete retained handoff record', { exact: true }).waitFor();
    assert((await page.locator('#handoffs-body').innerText()).includes(packet.packageId));
    await page.locator('#close-handoffs').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await checkReview(expectedReview);
    await page.locator('#tab-overview').click();
    const screenshots = {}, layouts = [];
    for (const [label, width, height] of [['desktop', 1440, 960], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert(layout.document <= layout.viewport + 1, label + ' layout fits its viewport.');
      layouts.push({ label, ...layout });
      screenshots[label] = join(output, 'operator-' + label + '.png');
      await page.screenshot({ path: screenshots[label], fullPage: true });
    }
    assert.deepEqual(pageErrors, [], 'The operator journey has no uncaught browser errors.');
    return { procedures: originals.map(item => item.ocid), imports: originals.map(item => item.path),
      comparison: { before: before.id, after: after.id, counts: comparison.counts },
      review: expectedReview, downloads, packagePath, receiving: received.receiving?.packageId,
      screenshots, layouts };
  } finally {
    try { await context.close(); }
    finally { await browser.close(); }
  }
}
