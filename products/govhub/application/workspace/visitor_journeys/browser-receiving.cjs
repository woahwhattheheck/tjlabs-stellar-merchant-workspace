#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const connectionFile = process.env.VISITOR_RECEIVING_CONNECTION;
  if (!connectionFile) throw new Error('VISITOR_RECEIVING_CONNECTION is required.');
  const connection = JSON.parse(await fs.readFile(connectionFile, 'utf8'));
  const { chromium } = require(process.env.VISITOR_PLAYWRIGHT_PATH || 'playwright');
  const browser = await chromium.launch({
    executablePath: process.env.VISITOR_BROWSER_EXECUTABLE || undefined,
    headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const views = [];
  try {
    await page.goto(connection.origin, { waitUntil: 'networkidle' });
    await page.locator('form[data-form="login"] [name="name"]').fill(connection.username);
    await page.locator('form[data-form="login"] [name="password"]').fill(connection.password);
    await page.locator('form[data-form="login"] button').click();
    await page.waitForFunction(() => !document.querySelector('form[data-form="login"]'));
    async function view(hash, title) {
      await page.goto(connection.origin + '/#' + hash);
      await page.waitForFunction(expected => document.querySelector('main h1')?.textContent.includes(expected), title);
      await page.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') !== 'true');
      views.push(title);
    }
    await view('visitor', 'Visitor journeys');
    await view('visitor-project?id=three-rivers', 'Edit project');
    if (await page.locator('form[data-form="visitor-project"] [name="base_url"]').inputValue() !== 'https://www.threeriversparks.org/')
      throw new Error('The original saved profile is missing.');
    await view('visitor-set?id=three-rivers-priority-visitors', 'Edit saved visitor goals');
    if (await page.locator('[data-visitor-journey]').count() !== 7 || await page.locator('[data-visitor-step]').count() !== 16)
      throw new Error('The full saved visitor-goal editor is incomplete.');
    await view('visitor-edition?id=' + encodeURIComponent(connection.baseline_id), 'Original public visitor pages');
    await view('visitor-compare', 'Compare visitor editions');
    await page.locator('form[data-form="visitor-compare"] [name="before_id"]').selectOption(connection.baseline_id);
    await page.locator('form[data-form="visitor-compare"] [name="after_id"]').selectOption(connection.candidate_id);
    await page.locator('form[data-form="visitor-compare"] button').click();
    await page.getByText('Changed query or page URL bindings.', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(path.dirname(connectionFile), 'visitor-comparison-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(path.dirname(connectionFile), 'visitor-comparison-mobile.png'), fullPage: true });
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      mainWidth: document.querySelector('main').getBoundingClientRect().width,
    }));
    if (dimensions.documentWidth > dimensions.viewport + 1) throw new Error('The visitor comparison exceeds the mobile page width.');
    await view('visitor-handover?edition_id=' + encodeURIComponent(connection.baseline_id), 'Customer handover');
    if (await page.locator('input[name="edition_ids"]').count() !== 2) throw new Error('The complete captured editions are absent from the handover.');
    if (errors.length) throw new Error(errors.join('\n'));
    process.stdout.write(JSON.stringify({ status: 'COMPLETE', views, dimensions, browserErrors: errors }) + '\n');
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
