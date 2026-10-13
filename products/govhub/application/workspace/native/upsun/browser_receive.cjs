#!/usr/bin/env node
'use strict';
// Copyright 2026 Token Junkie Labs contributors. Apache-2.0.
// Open the exact installed application and its original retained operations.
// Use the equipped host's existing Playwright and browser; this installs nothing.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function absolute(value) {
  if (!path.isAbsolute(value || '')) throw Error('Select an original absolute private path.');
  return path.resolve(value);
}
async function ordinary(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Select an original regular file.');
}
async function atomic(file, value) {
  const tmp = file + '.writing-' + process.pid;
  const handle = await fs.open(tmp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(tmp, file);
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw Error('Usage: node browser_receive.cjs /PRIVATE/original-browser-course.json');
  const source = absolute(args[0]);
  await ordinary(source);
  const raw = await fs.readFile(source), selected = JSON.parse(raw);
  if (selected.schema !== 'govhub-upsun-browser-receiving/v1') throw Error('Select the original browser course schema.');
  const origin = new URL(selected.origin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    throw Error('Use the exact existing GovHub origin, without credentials or an extra path.');
  const password = process.env[selected.password_env || ''];
  if (!selected.username || !password) throw Error('Supply the existing staff credential through its selected environment reference.');
  if (!Array.isArray(selected.environment_ids) || !selected.environment_ids.length ||
      !Array.isArray(selected.operation_ids) || !selected.operation_ids.length)
    throw Error('Select the original local Upsun environment and course operation IDs.');
  const root = absolute(selected.output_directory);
  await fs.mkdir(root, {recursive: true, mode: 0o700});
  const slot = path.join(root, new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex'));
  await fs.mkdir(slot, {mode: 0o700});
  const resultFile = path.join(slot, 'browser-result.json');
  const result = {schema: selected.schema, state: 'OPENING', request_sha256: sha(raw),
    origin: origin.origin, started_at: new Date().toISOString(), screenshots: [],
    downloads: [], views: [], browser_errors: [], checks: [], visual_inspection: 'REQUIRED'};
  await atomic(resultFile, result);
  const {chromium} = require(selected.playwright_path || 'playwright');
  const browser = await chromium.launch({
    executablePath: selected.browser_executable || undefined,
    headless: selected.headless !== false,
    args: Array.isArray(selected.browser_args) ? selected.browser_args : [],
  });
  let context;
  const absoluteUrl = hash => origin.origin + '/#' + hash;
  const encoded = value => encodeURIComponent(value);
  async function createContext() {
    context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
    const page = await context.newPage();
    page.on('pageerror', error => { result.browser_errors.push({at: new Date().toISOString(), message: error.message}); });
    return page;
  }
  async function screenshot(page, label) {
    const output = path.join(slot, label + '.png');
    await page.screenshot({path: output, fullPage: true});
    const bytes = await fs.readFile(output);
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth, document_width: document.documentElement.scrollWidth,
      main_width: document.querySelector('main')?.getBoundingClientRect().width ?? null,
    }));
    const value = {label, path: output, bytes: bytes.length, sha256: sha(bytes), dimensions};
    result.screenshots.push(value);
    if (dimensions.document_width > dimensions.viewport + 2)
      result.checks.push({label, state: 'REPAIR_REQUIRED', reason: 'The rendered page exceeds the viewport width.'});
    await atomic(resultFile, result);
    return value;
  }
  async function settle(page) {
    await page.waitForFunction(() => document.querySelector('main') &&
      document.querySelector('main')?.getAttribute('aria-busy') !== 'true');
  }
  async function login(page) {
    await page.goto(origin.origin, {waitUntil: 'domcontentloaded'});
    if (await page.locator('main .loading').isVisible().catch(() => false))
      await screenshot(page, 'opening-' + result.screenshots.length);
    const form = page.locator('form[data-form="login"]');
    await form.waitFor({state: 'visible'});
    await form.locator('[name="name"]').fill(selected.username);
    await form.locator('[name="password"]').fill(password);
    await form.locator('button').click();
    await form.waitFor({state: 'detached'});
    await page.waitForFunction(() => Boolean(document.querySelector('#identity')?.textContent.trim()));
    await settle(page);
  }
  async function view(page, hash, locator, label) {
    await page.goto(absoluteUrl(hash), {waitUntil: 'domcontentloaded'});
    await page.locator(locator).first().waitFor({state: 'visible'});
    await settle(page);
    await page.waitForFunction(expected => {
      const [view, query] = expected.split('?');
      const id = new URLSearchParams(query || '').get('id');
      return typeof state !== 'undefined' && state.view === view &&
        (!id || state.params.id === id) &&
        (view !== 'operation' || state.operation?.operation?.id === id) &&
        (view !== 'native' || state.environment?.id === id) &&
        document.querySelector('main')?.getAttribute('aria-busy') !== 'true';
    }, hash);
    result.views.push({label, hash, title: await page.locator('main h1').innerText()});
    await screenshot(page, label + '-desktop');
    await page.setViewportSize({width: 390, height: 844});
    await screenshot(page, label + '-narrow');
    await page.setViewportSize({width: 1440, height: 1000});
  }
  async function local(page, name, input) {
    return page.evaluate(async ({name, input}) => {
      const response = await fetch('/api/govhub/' + name, {
        method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || body.message || 'Original local receiving read failed.');
      return body;
    }, {name, input});
  }
  try {
    let page = await createContext();
    await login(page);
    for (const [index, id] of selected.environment_ids.entries()) {
      const label = 'environment-' + index;
      await view(page, 'native?id=' + encoded(id), '.upsun-native', label);
      const form = page.locator('form[data-form="native-profile"]');
      if (await form.count()) {
        const kind = await form.locator('[name="source_kind"]').inputValue();
        if (kind !== 'upsun') throw Error('The selected original environment is not configured as current Upsun.');
        const raw = await form.evaluate(node => Object.fromEntries(new FormData(node)));
        const backup = page.locator('[data-action="upsun-use-backup"]').first();
        if (await backup.count()) {
          const wanted = await backup.getAttribute('data-id');
          await backup.click();
          if (await form.locator('[name="backup_id"]').inputValue() !== wanted)
            throw Error('The selected actual native backup did not reach the original profile editor.');
          await screenshot(page, label + '-backup-selection');
          // Discard the editor-only selection; the saved profile is unchanged.
          await page.reload({waitUntil: 'domcontentloaded'});
          await page.locator('.upsun-native').first().waitFor();
          await settle(page);
        }
        result.checks.push({label, state: 'OPERATED', profile_kind: kind,
          selected_project_environment: raw.environment_id,
          backup_selection: await backup.count() ? 'DRAFT_SELECTED_AND_DISCARDED' : 'NO_RESTORABLE_BACKUP'});
      }
      const empty = await page.locator('.upsun-native .empty').count();
      result.checks.push({label, actual_empty_collections: empty});
      const preview = page.locator('a[href*="operation-new"][href*="PREVIEW"]').first();
      if (await preview.count()) {
        await preview.click();
        await page.locator('[name="native_action"]').waitFor();
        const actions = await page.locator('[name="native_action"] option').evaluateAll(items =>
          items.map(item => ({value: item.value, label: item.textContent})));
        if (!actions.length || actions.some(item => !item.value.startsWith('upsun-')))
          throw Error('The original native operating choices do not match this provider.');
        await page.locator('[name="native_action"]').selectOption(actions[0].value);
        await settle(page);
        await screenshot(page, label + '-operating-instruction');
        result.checks.push({label, state: 'OPERATED', native_choices: actions});
      }
    }
    for (const [index, id] of selected.operation_ids.entries()) {
      const original = await local(page, 'operations.get', {operation_id: id});
      if (!original.operation?.native_action?.startsWith('upsun-'))
        throw Error('The selected original operation is not an Upsun native course member.');
      await view(page, 'operation?id=' + encoded(id), '#native-operation-status', 'operation-' + index);
      await page.locator('[data-action="refresh-operation"]').click();
      await settle(page);
      const controls = page.locator('form[data-form="operation-control"]');
      if (await controls.count()) {
        const host = controls.locator('details').filter({has: page.locator('[name="upsun_use_runtime_bindings"]')});
        if (await host.count()) {
          await host.locator('summary').click();
          await controls.locator('[name="upsun_use_runtime_bindings"]').check();
          const fields = await controls.locator('[name^="upsun_runtime_"]').evaluateAll(nodes => nodes.map(n => n.name));
          if (!fields.length) throw Error('Original receiving-host fields are missing.');
          await screenshot(page, 'operation-' + index + '-receiving-host');
          await controls.locator('[name="upsun_use_runtime_bindings"]').uncheck();
          result.checks.push({operation_id: id, runtime_fields: fields, state: 'OPERATED'});
        }
      }
      const names = (selected.downloads || []).filter(item => item.operation_id === id).map(item => item.name);
      for (const name of names) {
        const file = (original.files || []).find(item => item.name === name);
        if (!file) throw Error('A selected full native download is absent from the retained operation.');
        const href = '/api/operations/' + encoded(id) + '/' + encoded(name);
        const exact = page.locator('a[href="' + href.replace(/"/g, '\\"') + '"]');
        if (!(await exact.count())) throw Error('The original native artifact has no operating download control.');
        // Individual files can be retained inside a native details element.
        await exact.first().evaluate(node => {
          for (let parent = node.parentElement; parent; parent = parent.parentElement)
            if (parent.tagName === 'DETAILS') parent.open = true;
        });
        const downloadPromise = page.waitForEvent('download');
        await exact.first().click();
        const download = await downloadPromise;
        const target = path.join(slot, 'download-' + index + '-' + sha(Buffer.from(name)).slice(0,12));
        await download.saveAs(target);
        const handle = await fs.open(target, 'r');
        const digest = crypto.createHash('sha256'); let size = 0;
        try { for await (const chunk of handle.createReadStream()) { digest.update(chunk); size += chunk.length; } }
        finally { await handle.close().catch(() => {}); }
        const hash = digest.digest('hex');
        if (hash !== file.sha256 || size !== Number(file.size ?? file.bytes))
          throw Error('The complete original browser download differs from its retained native identity.');
        result.downloads.push({operation_id: id, name, path: target, bytes: size, sha256: hash});
        await atomic(resultFile, result);
      }
    }
    // Exercise the real browser transport error state without issuing a provider write.
    await context.setOffline(true);
    await page.locator('[data-action="refresh-operation"]').click();
    await page.locator('#notice.error').waitFor({state: 'visible'});
    await screenshot(page, 'original-transport-error');
    await context.setOffline(false);
    await page.locator('[data-action="refresh-operation"]').click();
    await settle(page);
    await screenshot(page, 'original-transport-recovered');
    result.checks.push({state: 'OPERATED', browser_offline_error_and_recovery: true});
    const firstId = selected.operation_ids[0];
    const before = await local(page, 'operations.get', {operation_id: firstId});
    await context.close();
    page = await createContext();
    await login(page);
    await view(page, 'operation?id=' + encoded(firstId), '#native-operation-status', 'separate-session-reopen');
    const after = await local(page, 'operations.get', {operation_id: firstId});
    if (before.operation.id !== after.operation.id ||
        before.operation.environment_id !== after.operation.environment_id ||
        before.operation.profile?.revision !== after.operation.profile?.revision)
      throw Error('The separate browser session reopened a different original native instruction.');
    result.reopened = {operation_id: after.operation.id, revision: after.operation.revision,
      state: after.operation.state, environment_id: after.operation.environment_id};
    result.state = result.checks.some(item => item.state === 'REPAIR_REQUIRED') || result.browser_errors.length
      ? 'REPAIR_REQUIRED' : 'RENDERED_AWAITING_VISUAL_INSPECTION';
    result.finished_at = new Date().toISOString();
    await atomic(resultFile, result);
    process.stdout.write(JSON.stringify({state: result.state, result: resultFile,
      screenshots: result.screenshots.map(item => item.path), downloads: result.downloads.length,
      visual_inspection: 'Open and look at every actual screen; record concrete findings and repairs before customer delivery.'}) + '\n');
    return result.state === 'REPAIR_REQUIRED' ? 2 : 0;
  } catch (error) {
    result.state = 'ATTENTION'; result.error = {name: error.name, message: error.message};
    result.finished_at = new Date().toISOString();
    await atomic(resultFile, result);
    throw error;
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close();
  }
}
main().then(code => {process.exitCode = code;}).catch(error => {
  process.stderr.write(JSON.stringify({ok: false, message: error.message}) + '\n');
  process.exitCode = 1;
});
