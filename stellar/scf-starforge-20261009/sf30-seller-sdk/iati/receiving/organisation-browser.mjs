// MIT. Original organisation browser continuation for a complete customer handover.
// Usage: node organisation-browser.mjs /private/browser-config.json
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const output = resolve(config.outputDirectory, '..', 'browser');
await mkdir(output, { recursive: true, mode: 0o700 });
if (!config.chromium || !config.playwright) throw new Error('Select the installed Chromium and Playwright for this browser continuation.');
const { chromium } = await import(pathToFileURL(config.playwright));
const browser = await chromium.launch({ executablePath: config.chromium, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [], observations = [];
const need = (condition, message) => { if (!condition) throw new Error(message); };
const identity = bytes => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(String(error.message)));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin.startsWith('http://127.0.0.1:') && response.status() >= 400 &&
        (url.pathname.startsWith('/api/') || /\.(?:js|css)$/.test(url.pathname)))
      errors.push(response.status() + ' ' + url.pathname);
  });
  const url = (await readFile(config.senderConnectionFile, 'utf8')).trim();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const idle = async () => {
    await page.waitForFunction(() => document.getElementById('main').getAttribute('aria-busy') === 'false');
    const issue = await page.locator('#status.error').count();
    need(!issue, 'The original operator reported: ' + await page.locator('#status').innerText());
  };
  await idle();
  await page.locator('#org-open-view').click();
  await page.locator('#org-plan-select').selectOption(config.planId);
  await page.locator('#org-open').click();
  await idle();
  need((await page.locator('#org-edition').innerText()).includes(config.planId), 'The browser did not reopen the original organisation plan.');
  await page.locator('#org-actor').fill('Commons organisation browser operator');
  need(await page.locator('#org-asof').inputValue() === '2026-10-12' &&
       await page.locator('#org-fiscal-start').inputValue() === '2026-04-01',
       'The browser lost the original assessment calendar.');
  await page.screenshot({ path: join(output, 'organisation-planning-desktop.png'), fullPage: false });
  observations.push({ view: 'selection', originalPlan: config.planId,
    displayedEdition: await page.locator('#org-edition').innerText() });

  await page.locator('[data-org-view="records"]').click();
  await page.locator('#org-record-section').selectOption('documents');
  await page.locator('#org-rows-form button[type="submit"]').click();
  await idle();
  need((await page.locator('#org-rows-page').innerText()).includes(String(config.expectedDocumentRows)),
       'The document register lost its complete native total.');
  const first = await page.locator('#org-rows tbody tr').count();
  await page.locator('#org-rows-next').click();
  await idle();
  const second = await page.locator('#org-rows tbody tr').count();
  need(first + second === config.expectedDocumentRows && await page.locator('#org-rows-next').isDisabled(),
       'The browser document pages do not cover the complete original register.');
  await page.locator('#org-rows-prev').click();
  await idle();
  await page.locator('#org-rows .organisation-open-row').first().click();
  await idle();
  const recordXml = await page.locator('#org-record-xml').innerText();
  const selectedXml = await page.locator('#org-edit-xml').inputValue();
  need(recordXml.startsWith('<document-link') && selectedXml === recordXml,
       'The selected original document element XML was not supplied to the editor.');
  const selected = await page.locator('#org-edit-target option').evaluateAll(options =>
    options.map(option => ({ value: option.value, label: option.textContent })));
  const title = selected.find(option => option.label === 'title');
  need(title, 'The complete document title element target is missing.');
  await page.locator('#org-edit-target').selectOption(title.value);
  await idle();
  const titleXml = await page.locator('#org-edit-xml').inputValue();
  need(titleXml.startsWith('<title>') && titleXml.endsWith('</title>') && !titleXml.includes('<document-link'),
       'The editor returned a different element for the exact title target.');
  const urlTarget = selected.find(option => option.label === 'document-link @url');
  need(urlTarget, 'The original document URL attribute target is missing.');
  await page.locator('#org-edit-target').selectOption(urlTarget.value);
  await idle();
  const choices = await page.locator('#org-edit-operation option').evaluateAll(options => options.map(option => option.value));
  need(choices.includes('attribute') && choices.includes('attribute-remove'),
       'The original attribute editor does not expose its supported operations.');
  await page.screenshot({ path: join(output, 'organisation-document-editor.png'), fullPage: false });
  observations.push({ view: 'records', originalDocumentRows: config.expectedDocumentRows,
    pages: [first, second], selectedTitleXml: identity(Buffer.from(titleXml)) });

  await page.locator('[data-org-view="review"]').click();
  need((await page.locator('#org-validation dd').first().innerText()).trim() === 'VALID', 'The browser did not display the actual schema validation.');
  observations.push({ view: 'review', validationVisible: true,
    historyEntries: await page.locator('#org-history button').count() });
  await page.locator('[data-org-view="delivery"]').click();
  await page.locator('#org-delivery-revision').selectOption(String(config.releasedRevision));
  const originalDownload = page.waitForEvent('download');
  await page.locator('#org-file-source').click();
  const download = await originalDownload;
  const path = join(output, 'browser-original-organisations.xml');
  await download.saveAs(path);
  await idle();
  const source = await readFile(path);
  const sourceIdentity = identity(source);
  need(sourceIdentity.sha256 === config.sourceId, 'The browser download differs from the complete original publisher XML.');
  observations.push({ view: 'delivery', originalSource: sourceIdentity });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-org-view="records"]').click();
  await page.locator('#main').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, 'organisation-planning-mobile.png'), fullPage: false });
  const layout = await page.evaluate(() => ({ width: innerWidth,
    documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }));
  need(layout.documentWidth <= layout.width + 2 && layout.bodyWidth <= layout.width + 2,
       'The complete organisation operator causes horizontal page overflow at phone width.');
  observations.push({ view: 'responsive', ...layout });
  need(!errors.length, 'Original application errors: ' + errors.join('; '));
  await writeFile(join(output, 'browser-observations.json'), JSON.stringify({
    schema: 'stellar-forge.iati-organisation-browser-receiving.v1', state: 'COMPLETE',
    observations, applicationErrors: errors
  }, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify({ state: 'COMPLETE', views: observations.map(value => value.view),
    originalSource: sourceIdentity, output }) + '\n');
  await context.close();
} finally {
  await browser.close();
}
