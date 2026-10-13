// MIT. Receive the complete companion through the caller's existing Chromium Page.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const COMPANION_RECEIVING_ROUTES = [
  '/grant.html',
  '/grant-companion.html',
  '/grant-companion.css',
  '/grant-companion-core.mjs',
  '/grant-companion-workspace.mjs',
  '/grant-data/product-and-finance.md',
  '/grant-data/source-index.json',
];

const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const gitBlob = value => createHash('sha1').update('blob ' + value.length + '\0').update(value).digest('hex');
const within = async (promise, milliseconds, label) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out.')), milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
};

/**
 * Continue an existing, saved reader session. The caller owns the Page, context,
 * server, source selection and final artifact preservation.
 *
 * sourceRoot: absolute repository root containing stellar-forge/developer-site.
 * expectedOrigin: the actual already-running application origin.
 * outputDirectory: absolute directory reserved for this complete receiving.
 * sourceCommit: exact selected source commit.
 * markdownText / indexText: the complete current served source-file strings.
 *
 * Returns status=complete with actual artifact identities. Failure retains a
 * result file and throws; the caller must preserve the directory in either case.
 */
export async function receiveGrantCompanion(page, options) {
  const { sourceRoot, expectedOrigin, outputDirectory, sourceCommit, markdownText, indexText } = options || {};
  requireValue(typeof sourceRoot === 'string' && isAbsolute(sourceRoot), 'Supply the absolute selected repository root.');
  requireValue(typeof outputDirectory === 'string' && isAbsolute(outputDirectory), 'Supply the absolute companion receiving directory.');
  requireValue(/^[a-f0-9]{40}$/.test(sourceCommit || ''), 'Supply the selected source commit.');
  requireValue(typeof markdownText === 'string' && markdownText.trim() && typeof indexText === 'string' && indexText.trim(), 'Supply both complete current source files.');

  const originUrl = new URL(expectedOrigin);
  requireValue(/^https?:$/.test(originUrl.protocol) && !originUrl.username && !originUrl.password, 'Use the actual HTTP(S) application origin.');
  const origin = originUrl.origin, returnUrl = page.url(), originalViewport = page.viewportSize();
  requireValue(new URL(returnUrl).origin === origin && new URL(returnUrl).pathname === '/grant.html', 'Start on the original saved grant reader at the selected origin.');
  requireValue(originalViewport && originalViewport.width > 0 && originalViewport.height > 0, 'The owned Page needs an explicit restorable viewport.');

  const directory = resolve(outputDirectory), resultPath = join(directory, 'companion-receiving.json');
  const result = {
    status: 'running', sourceCommit, startedAt: new Date().toISOString(),
    route: '/grant-companion.html', source: {}, stages: [], artifacts: [],
  };
  const offlinePattern = /^https?:\/\//;
  const offlineRequests = [];
  const denyOfflineNetwork = async route => {
    offlineRequests.push({ method: route.request().method(), url: route.request().url() });
    await route.abort('internetdisconnected');
  };
  let routeInstalled = false, failure = null;
  const stage = (name, details = {}) => result.stages.push({ name, at: new Date().toISOString(), ...details });
  const artifact = async (name, kind) => {
    const path = join(directory, name), bytes = await readFile(path);
    const item = { name, kind, path, bytes: bytes.length, sha256: sha256(bytes) };
    result.artifacts.push(item);
    return { ...item, data: bytes };
  };
  const capture = async (name, fullPage = true) => {
    await page.screenshot({ path: join(directory, name), fullPage, timeout: 30000 });
    const item = await artifact(name, 'image/png');
    return { ...item, data: undefined };
  };
  const download = async (selector, name, expected, kind) => {
    const [received] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.locator(selector).click({ timeout: 15000 }),
    ]);
    await received.saveAs(join(directory, name));
    const item = await artifact(name, kind);
    if (expected !== null) requireValue(item.data.equals(Buffer.from(expected, 'utf8')), 'The complete download differs from its selected source: ' + name);
    return item;
  };
  const visibleChapterIds = () => page.locator('[data-chapter]:not([hidden])').evaluateAll(nodes => nodes.map(node => node.dataset.chapter));
  const openChapter = async id => {
    await page.evaluate(value => { location.hash = value; }, '#' + id);
    await page.waitForFunction(value => {
      const target = document.getElementById(value);
      return target && !target.closest('[data-chapter]').hidden;
    }, id, { timeout: 15000 });
  };
  const searchFor = async term => {
    await page.locator('#companion-search').fill(term);
    await page.waitForFunction(value => {
      const input = document.getElementById('companion-search'), status = document.getElementById('companion-status');
      return input && input.value === value && status && /chapters match/.test(status.textContent);
    }, term, { timeout: 15000 });
    const matched = await page.locator('[data-chapter-index]:not([hidden])').evaluateAll(nodes => nodes.map(node => ({
      id: node.dataset.chapterIndex, title: node.querySelector('a').textContent,
    })));
    requireValue(matched.length > 0, 'The selected source term did not open a matching chapter.');
    return matched;
  };

  try {
    await mkdir(directory, { recursive: true });
    const index = JSON.parse(indexText.replace(/^\uFEFF/, '')), sourceBytes = Buffer.from(markdownText, 'utf8');
    requireValue(index.schema === 'stellar-forge.grant-reviewer-source-index.v1', 'Use the original complete source index.');
    requireValue(index.product_and_finance?.bytes === sourceBytes.length && index.product_and_finance?.sha256 === sha256(sourceBytes), 'The selected companion and source index must describe the same complete edition.');

    const corePath = join(resolve(sourceRoot), 'stellar-forge/developer-site/dist/grant-companion-core.mjs');
    const coreBytes = await readFile(corePath);
    const { parseCompanionMarkdown } = await import(pathToFileURL(corePath).href);
    const model = parseCompanionMarkdown(markdownText);
    const chapterIds = model.chapters.map(chapter => chapter.id);
    result.source = {
      markdownBytes: sourceBytes.length, markdownSha256: sha256(sourceBytes), markdownGitBlob: gitBlob(sourceBytes),
      indexBytes: Buffer.byteLength(indexText), indexSha256: sha256(Buffer.from(indexText)),
      readerCoreGitBlob: gitBlob(coreBytes), chapters: model.chapters.length, tables: model.tables, codeBlocks: model.codeBlocks,
    };

    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto(new URL('/grant-companion.html', origin).href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('#companion-reader[aria-busy="false"] .companion-chapter').first().waitFor({ state: 'visible', timeout: 30000 });
    requireValue((await page.locator('.source-edition code').textContent()).trim() === result.source.markdownSha256, 'The opened reader shows a different companion edition.');
    const liveIds = await page.locator('[data-chapter]').evaluateAll(nodes => nodes.map(node => node.dataset.chapter));
    requireValue(JSON.stringify(liveIds) === JSON.stringify(chapterIds), 'The hosted reader must retain every current chapter in source order.');

    const funding = model.chapters.find(chapter => /tranche|funded|budget/i.test(chapter.title)) || model.chapters[0];
    await openChapter(funding.id);
    await capture('companion-desktop.png');
    stage('opened-current-companion', { selectedChapter: funding.id, chapterIds });

    const term = /\bSoroban\b/i.test(markdownText) ? 'Soroban' : /\brecovery\b/i.test(markdownText) ? 'recovery' : 'customer';
    const matched = await searchFor(term);
    await page.locator('[data-chapter-index]:not([hidden]) a').first().click();
    const outside = model.chapters.find(chapter => !matched.some(item => item.id === chapter.id)) || funding;
    const subsection = outside.headings.find(heading => heading.level > 2) || outside.headings[0];
    await openChapter(subsection.id);
    if (!matched.some(item => item.id === outside.id)) requireValue(await page.locator('#companion-search').inputValue() === '', 'A chapter link outside the filter must open that source and clear the search.');
    requireValue((await visibleChapterIds()).includes(outside.id), 'The original subsection link must open its containing chapter.');
    stage('searched-and-followed-source-link', { term, matched, targetChapter: outside.id, targetHeading: subsection.id });

    await page.setViewportSize({ width: 390, height: 844 });
    await openChapter(funding.id);
    requireValue(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'The phone reader must keep its overall layout within the viewport.');
    await capture('companion-phone.png');
    stage('received-phone-reader', { width: 390, height: 844, selectedChapter: funding.id });

    await download('[data-action="download-markdown"]', 'hosted-product-and-finance.md', markdownText, 'text/markdown');
    await download('[data-action="download-index"]', 'hosted-source-index.json', indexText, 'application/json');
    const offline = await download('[data-action="offline"]', 'stellar-forge-product-and-financing.html', null, 'text/html');
    const embedded = offline.data.toString('utf8').match(/<script id="companion-source" type="application\/json">([\s\S]*?)<\/script>/);
    requireValue(embedded, 'The offline reader must retain its original source files.');
    const retained = JSON.parse(embedded[1]);
    requireValue(retained.markdown === markdownText && retained.indexText === indexText, 'The offline reader must embed both complete selected source files.');
    stage('downloaded-complete-hosted-source', { offlineSha256: offline.sha256 });

    await page.setViewportSize({ width: 1365, height: 900 });
    await page.locator('[data-action="clear-search"]').click();
    if (await page.locator('[data-action="read-all"]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-action="read-all"]').click();
    requireValue((await visibleChapterIds()).length === chapterIds.length, 'Open every source chapter for the complete printable copy.');
    const printed = await within(page.pdf({ format: 'A4', printBackground: true }), 45000, 'Render the complete A4 companion');
    await writeFile(join(directory, 'complete-product-and-financing.pdf'), printed);
    const pdf = await artifact('complete-product-and-financing.pdf', 'application/pdf');
    requireValue(pdf.data.subarray(0, 5).toString('ascii') === '%PDF-', 'Chromium must return the actual printable PDF.');
    stage('printed-complete-companion', { renderedChapters: chapterIds.length, bytes: pdf.bytes });

    await page.route(offlinePattern, denyOfflineNetwork);
    routeInstalled = true;
    await page.goto(pathToFileURL(offline.path).href, { waitUntil: 'load', timeout: 30000 });
    await page.locator('.companion-chapter').first().waitFor({ state: 'visible', timeout: 15000 });
    requireValue((await page.locator('[data-chapter]').count()) === chapterIds.length, 'The offline file must reopen every chapter.');
    const offlineMatched = await searchFor(term);
    requireValue(JSON.stringify(offlineMatched) === JSON.stringify(matched), 'The offline reader must find the same complete current chapters.');
    await page.locator('[data-chapter-index]:not([hidden]) a').first().click();
    await page.setViewportSize({ width: 390, height: 844 });
    requireValue(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'The offline phone reader must remain within the viewport.');
    await capture('companion-offline-phone.png');
    await download('[data-action="download-markdown"]', 'offline-product-and-finance.md', markdownText, 'text/markdown');
    await download('[data-action="download-index"]', 'offline-source-index.json', indexText, 'application/json');
    requireValue(offlineRequests.length === 0, 'The offline reader attempted a network request.');
    stage('reopened-offline-and-received-original-files', { term, matched: offlineMatched, networkRequests: offlineRequests.length });
    result.status = 'complete';
  } catch (error) {
    failure = error;
    result.status = 'failed';
    result.error = { name: error.name || 'Error', message: error.message || String(error), stack: error.stack || null };
    try { await capture('companion-failure.png', false); } catch {}
  } finally {
    const cleanup = [];
    if (routeInstalled) {
      try { await within(page.unroute(offlinePattern, denyOfflineNetwork), 5000, 'Restore the owned Page network routing'); }
      catch (error) { cleanup.push(error.message || String(error)); }
    }
    try { await within(page.setViewportSize(originalViewport), 5000, 'Restore the owned Page viewport'); }
    catch (error) { cleanup.push(error.message || String(error)); }
    try { await page.goto(returnUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
    catch (error) { cleanup.push(error.message || String(error)); }
    result.cleanup = { restoredGrantUrl: page.url() === returnUrl, restoredViewport: JSON.stringify(page.viewportSize()) === JSON.stringify(originalViewport), errors: cleanup };
    if (cleanup.length || !result.cleanup.restoredGrantUrl || !result.cleanup.restoredViewport) {
      result.status = 'failed';
      failure ||= new Error('The companion continuation could not restore the caller-owned Page.');
    }
    result.finishedAt = new Date().toISOString();
    try { await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n', 'utf8'); }
    catch (error) { result.status = 'failed'; failure ||= error; }
  }
  if (failure) { failure.result = result; throw failure; }
  return result;
}
