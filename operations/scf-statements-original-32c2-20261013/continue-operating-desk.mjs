#!/usr/bin/env node
// MIT. Continue the original received Statements case through its maintained Operating Desk.
// Account import, allocations, cash correction and independent receiving remain with the original controller.
import { readFile, writeFile, mkdir, rename, open, lstat, realpath, chmod } from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const hash = raw => createHash('sha256').update(raw).digest('hex');
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' :
  value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const now = () => new Date().toISOString();
const delay = ms => new Promise(done => setTimeout(done, ms));
const safe = value => String(value).replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 140);
function need(value, message, code = 'STATEMENTS_NAVIGATION_FAILED') {
  if (!value) throw Object.assign(new Error(message), { code });
}
async function readPrivate(file) {
  const info = await lstat(file);
  need(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && !(info.mode & 0o077) &&
    (typeof process.getuid !== 'function' || info.uid === process.getuid()), 'Select the original private file: ' + file);
  return readFile(file);
}
async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  need(info.isDirectory() && !info.isSymbolicLink() && await realpath(directory) === directory &&
    !(info.mode & 0o077) && (typeof process.getuid !== 'function' || info.uid === process.getuid()),
    'Select a private real output directory.');
}
async function optionalJSON(file) {
  try { return JSON.parse(await readPrivate(file)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function atomic(file, value) {
  const temporary = file + '.writing-' + randomUUID(), handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, file);
}

export async function runStatementsNavigation({ handoffFile, outputDirectory } = {}) {
  need(typeof handoffFile === 'string' && isAbsolute(handoffFile) &&
    typeof outputDirectory === 'string' && isAbsolute(outputDirectory), 'Select the original absolute handoff and output paths.');
  handoffFile = resolve(handoffFile); outputDirectory = resolve(outputDirectory);
  const rawHandoff = await readPrivate(handoffFile), handoff = JSON.parse(rawHandoff);
  need(handoff.schema === 'commons.grant.original-statements-navigation-handoff.v1' && handoff.owner === '390E',
    'Select the original completed Statements navigation handoff.');
  for (const key of ['sourceRoot', 'grantDirectory', 'workspace', 'browserExecutable', 'playwrightModule', 'controller', 'configPath'])
    need(typeof handoff[key] === 'string' && isAbsolute(handoff[key]), 'The original handoff has no absolute ' + key + '.');
  need(outputDirectory !== handoff.workspace && !outputDirectory.startsWith(handoff.workspace + '/'),
    'Keep receiving artifacts outside the retained customer workspace.');
  need(typeof handoff.caseId === 'string' && typeof handoff.invoiceId === 'string' &&
    ['csv', 'ofx', 'mt940'].every(key => typeof handoff.originalStatementSourceIds?.[key] === 'string'),
    'Keep the actual original case, invoice and statement source selections.');
  await privateDirectory(outputDirectory);
  const journalPath = join(outputDirectory, 'navigation-continuation.json');
  let journal = await optionalJSON(journalPath);
  if (journal) need(journal.handoffSha256 === hash(rawHandoff) && journal.workspace === handoff.workspace &&
    journal.caseId === handoff.caseId, 'Continue the same original Statements handoff.');
  else journal = {
    schema: 'commons.grant.statements-navigation-continuation.v1', handoffSha256: hash(rawHandoff),
    operationId: handoff.operationId + ':operating-desk', workspace: handoff.workspace, caseId: handoff.caseId,
    startedAt: now(), nonce: randomUUID(), attempts: 0, profiles: {},
  };
  if (journal.complete && journal.result) {
    const resultRaw = await readPrivate(join(outputDirectory, journal.result.file));
    need(hash(resultRaw) === journal.result.sha256, 'The completed original navigation result changed.');
    return JSON.parse(resultRaw);
  }
  journal.attempts++; await atomic(journalPath, journal);
  const out = join(outputDirectory, 'attempt-' + String(journal.attempts).padStart(3, '0'));
  await privateDirectory(out);
  const reportPath = join(out, 'navigation-result.json'), secretValues = new Set();
  const redact = input => {
    let value = String(input ?? '');
    for (const secret of secretValues) if (typeof secret === 'string' && secret) value = value.split(secret).join('[private access]');
    return value;
  };
  const result = {
    schema: 'commons.grant.statements-navigation-receiving.v1', operationId: journal.operationId,
    handoffSha256: journal.handoffSha256, sourceHead: handoff.sourceHead, sourceRoot: handoff.sourceRoot,
    workspace: handoff.workspace, caseId: handoff.caseId, invoiceId: handoff.invoiceId,
    originalCaseId: handoff.originalCaseId, sourceIds: handoff.originalStatementSourceIds,
    attempt: journal.attempts, startedAt: now(), complete: false, sourceFiles: [], phases: [],
    artifacts: [], captures: [], roles: [], browserErrors: [],
  };
  let child, origin, token, href, browser, ownerContext, page, beforeCase, originalCaseDigest;
  const roleContexts = new Set();
  const persist = () => atomic(reportPath, result);
  const journalSave = () => atomic(journalPath, journal);
  async function retain(name, value, type = 'application/json') {
    const file = join(out, name); await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const raw = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
    await writeFile(file, raw, { mode: 0o600, flag: 'wx' });
    const record = { file, bytes: raw.length, sha256: hash(raw), type };
    result.artifacts.push(record); return record;
  }
  async function phase(name, run) {
    const item = { name, state: 'RUNNING', startedAt: now() }; result.phases.push(item); await persist();
    try { const value = await run(); item.state = 'COMPLETE'; item.completedAt = now(); await persist(); return value; }
    catch (error) {
      item.state = 'FAILED'; item.completedAt = now(); item.error = { code: error.code, message: redact(error.message) };
      await persist(); throw error;
    }
  }
  function facts(value) {
    return { program: value.program, records: value.records, sources: value.sources, reviews: value.reviews };
  }
  async function ownerAPI(path, body) {
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await response.json();
    need(response.ok, 'Original request ' + path + ' failed: ' + redact(JSON.stringify(value)));
    return value;
  }
  async function startOwner() {
    const executable = handoff.pythonExecutable || 'python3';
    const node = handoff.nodeExecutable || process.execPath;
    const selected = spawn(executable, ['-B', join(handoff.grantDirectory, 'cli.py'), 'serve',
      '--workspace', handoff.workspace, '--port', '0'], {
      cwd: handoff.grantDirectory,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', SF47_BUYER_NODE: node,
        PATH: dirname(node) + ':' + (process.env.PATH || '') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child = selected; const stderr = []; let stderrBytes = 0;
    selected.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes <= 131072) stderr.push(chunk); });
    const announcement = await new Promise((done, reject) => {
      let pending = '', settled = false;
      const timer = setTimeout(() => finish(new Error('The original Grant owner did not announce startup.')), 30000);
      const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : done(value); };
      selected.once('error', error => finish(error));
      selected.once('exit', (code, signal) => finish(new Error('Original Grant startup ended: ' +
        code + '/' + signal + ' ' + Buffer.concat(stderr).toString('utf8'))));
      selected.stdout.on('data', raw => {
        pending += raw.toString('utf8');
        if (pending.length > 1048576) return finish(new Error('The original startup record exceeded its complete buffer.'));
        const lines = pending.split('\n'); pending = lines.pop();
        for (const line of lines) {
          try { const value = JSON.parse(line); if (typeof value.url === 'string' && typeof value.access_file === 'string') finish(null, value); }
          catch {}
        }
      });
    });
    const access = (await readPrivate(announcement.access_file)).toString('utf8');
    const match = /href="([^"]+#access=[^"]+)"/.exec(access);
    need(match, 'The original private access link is absent.');
    href = match[1].replaceAll('&amp;', '&');
    const url = new URL(href), announced = new URL(announcement.url);
    need(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      url.origin === announced.origin && url.pathname === '/' && !url.search && !url.username && !url.password &&
      /^#access=[A-Za-z0-9_-]{32,128}$/.test(url.hash), 'The original workspace startup identity changed.');
    origin = url.origin; token = url.hash.slice('#access='.length);
    secretValues.add(href); secretValues.add(token);
    result.listener = { pid: selected.pid, origin, workspace: handoff.workspace };
  }
  async function stopOwner() {
    if (!child) return;
    const selected = child;
    if (selected.exitCode !== null || selected.signalCode !== null) { child = null; return; }
    await new Promise((done, reject) => {
      const timer = setTimeout(() => { selected.kill('SIGKILL'); }, 10000);
      selected.once('error', error => { clearTimeout(timer); reject(error); });
      selected.once('close', (code, signal) => {
        clearTimeout(timer); child = null;
        if (signal === 'SIGKILL') reject(new Error('Original Grant owner required forced shutdown; retained workspace needs its normal reopen.'));
        else done();
      });
      selected.kill('SIGTERM');
    });
  }
  async function pageErrorWatch(selected, label) {
    selected.on('pageerror', error => result.browserErrors.push({ role: label, message: redact(error.message) }));
    await selected.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) return route.abort();
      return route.continue();
    });
  }
  async function healthy(selected = page) {
    need(!result.browserErrors.length, 'The original browser retained a script failure.');
    const error = selected.locator('[data-nav-error]:visible');
    if (await error.count()) need(!(await error.innerText()).trim(), 'The finder reports: ' + redact(await error.innerText()));
  }
  async function snapshot(name, selected = page, width = 1360) {
    await selected.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const dimensions = await selected.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
    const file = join(out, 'captures', safe(name) + '-' + width + '.png');
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await selected.screenshot({ path: file, fullPage: true }); await chmod(file, 0o600);
    const raw = await readFile(file), record = { name, file, bytes: raw.length, sha256: hash(raw), ...dimensions };
    result.captures.push(record);
    need(dimensions.documentWidth <= dimensions.width + 2, 'The current operating desk overflows at ' + width + 'px.');
    await healthy(selected);
  }
  async function operations(selected = page, accessHref = origin + '/') {
    await selected.goto(accessHref, { waitUntil: 'domcontentloaded' });
    await selected.locator('[data-tab="operations"]').waitFor({ state: 'visible' });
    await selected.locator('[data-tab="operations"]').click();
    const choose = selected.locator('[name="caseSelect"]'); await choose.waitFor({ state: 'visible' });
    if (await choose.inputValue() !== handoff.caseId) await choose.selectOption(handoff.caseId);
    await selected.locator('.operating-navigation [data-nav-find]').waitFor({ state: 'visible' });
    need(await choose.inputValue() === handoff.caseId, 'The original case selector chose another case.');
    await healthy(selected);
  }
  async function section(id, selected = page) {
    const navigation = selected.locator('.operating-navigation');
    const toggle = navigation.locator('[data-nav-toggle]');
    if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    const control = navigation.locator('[data-nav-section="' + id + '"]').first();
    await control.waitFor({ state: 'attached' });
    const group = control.locator('xpath=ancestor::details[1]');
    if (await group.count() && await group.getAttribute('open') === null) await group.locator(':scope > summary').click();
    await control.click();
    await selected.locator('[data-ops-current-panel]').waitFor({ state: 'visible' });
    await healthy(selected);
  }
  const finder = selected => selected.locator('dialog.ops-find-dialog');
  async function openFinder(selected = page, shortcut = false) {
    const button = selected.locator('[data-nav-find]');
    if (shortcut) { await button.focus(); await selected.keyboard.press('Control+k'); }
    else await button.click();
    await finder(selected).waitFor({ state: 'visible' });
    const back = finder(selected).locator('[data-nav-back]');
    if (await back.isVisible()) await back.click();
  }
  async function search(query, kind = 'all', sectionId = '', selected = page) {
    const dialog = finder(selected);
    if (!(await dialog.isVisible())) await openFinder(selected);
    if (await dialog.locator('[data-nav-back]').isVisible()) await dialog.locator('[data-nav-back]').click();
    await dialog.locator('[data-nav-kind]').selectOption(kind);
    await dialog.locator('[data-nav-filter-section]').selectOption(sectionId);
    await dialog.locator('[data-nav-query]').fill(query);
    return dialog;
  }
  async function chooseKey(key, selected = page) {
    const dialog = finder(selected);
    // Select the original opaque entry key without deriving or replacing its native record.
    const selector = '[data-nav-result=' + JSON.stringify(key) + ']';
    await dialog.locator(selector).click();
    await dialog.locator('[data-nav-detail]').waitFor({ state: 'visible' });
    await healthy(selected);
  }
  async function retainFinder(name, selected = page) {
    const dialog = finder(selected);
    const visible = await dialog.locator('[data-nav-detail]').isVisible() ?
      dialog.locator('[data-nav-detail]') : dialog.locator('[data-nav-search-results]');
    return retain('views/' + safe(name) + '.txt', await visible.innerText(), 'text/plain');
  }
  async function sourceDownload(metadata, name, selected = page) {
    need(metadata && typeof metadata.id === 'string' && typeof metadata.filename === 'string' &&
      Number.isSafeInteger(metadata.bytes) && /^[a-f0-9]{64}$/.test(metadata.sha256),
      'The retained case source descriptor is incomplete.');
    await search(metadata.id, 'source', 'sources', selected);
    await chooseKey('source:' + metadata.id, selected);
    const [download] = await Promise.all([selected.waitForEvent('download'),
      finder(selected).locator('[data-nav-entry-action="source"]').click()]);
    need(await download.failure() === null, 'The original source download failed.');
    const file = join(out, 'downloads', safe(name) + '-' + safe(metadata.filename));
    await mkdir(dirname(file), { recursive: true, mode: 0o700 }); await download.saveAs(file); await chmod(file, 0o600);
    const raw = await readFile(file);
    need(raw.length === metadata.bytes && hash(raw) === metadata.sha256, 'The original case source bytes changed.');
    const record = { sourceId: metadata.id, file, filename: metadata.filename, bytes: raw.length, sha256: hash(raw) };
    result.artifacts.push(record); await retainFinder(name + '-metadata', selected); return record;
  }
  async function completeSearch(selected = page, label = 'owner') {
    const dialog = await search('', 'all', '', selected), keys = [], counts = [];
    for (;;) {
      const current = await dialog.locator('[data-nav-result]').evaluateAll(items => items.map(item => item.dataset.navResult));
      keys.push(...current); counts.push(await dialog.locator('[data-nav-count]').innerText());
      const next = dialog.locator('[data-nav-page="next"]');
      if (await next.isDisabled()) break;
      need(current.length > 0 && new Set(keys).size === keys.length, 'The original case finder repeated a result page.');
      await next.click();
    }
    need(new Set(keys).size === keys.length, 'The original complete case finder repeated an entry.');
    const record = { role: label, keys, pages: counts, coverage: await dialog.locator('.ops-find-coverage').innerText() };
    await retain('views/' + label + '-complete-finder.json', record);
    return record;
  }
  async function invoiceEditor(selected = page, role = 'owner') {
    const invoice = beforeCase.records.invoices.find(item => item.id === handoff.invoiceId);
    need(invoice, 'The original supplier invoice is absent.');
    await search(invoice.id, 'record', 'invoices', selected);
    await chooseKey('record:invoices:' + invoice.id, selected);
    await retainFinder(role + '-invoice', selected);
    const openEditor = finder(selected).locator('[data-nav-entry-action="edit"]');
    if (role === 'reviewer') {
      need(await openEditor.count() === 0, 'The reviewer finder offered an invoice writer.');
      await snapshot(role + '-invoice', selected); return;
    }
    await openEditor.click();
    const editor = selected.locator('dialog.ops-dialog[open]'); await editor.waitFor({ state: 'visible' });
    need(await editor.locator('[name="number"]').inputValue() === invoice.number &&
      await editor.locator('[name="contributorId"]').inputValue() === invoice.contributorId &&
      await editor.locator('[name="issuedDate"]').inputValue() === invoice.issuedDate,
      'The original editor opened another invoice or supplier.');
    await editor.locator('[name="number"]').focus(); await selected.keyboard.press('Control+k');
    need(!(await finder(selected).isVisible()) && await editor.isVisible(),
      'The finder shortcut displaced the original invoice editor.');
    const values = await editor.locator('input,select,textarea').evaluateAll(items => items.map(item => ({
      name: item.name, value: item.value, type: item.type, checked: item.type === 'checkbox' ? item.checked : undefined,
    })));
    await retain('views/' + role + '-original-invoice-editor.json', { invoiceId: invoice.id, values });
    await snapshot(role + '-original-invoice-editor', selected);
    await editor.locator('[data-ops-action="cancel"]').click();
    need(!(await editor.isVisible()), 'The original editor did not return control to its case.');
  }
  async function profile(role) {
    if (!journal.profiles[role]) {
      journal.profiles[role] = { id: 'nav-' + role + '-' + journal.nonce.replaceAll('-', '').slice(0, 16),
        createRequest: 'nav-create-' + role + '-' + journal.nonce, rotations: [], revocations: [] };
      await journalSave();
    }
    const selected = journal.profiles[role], body = {
      requestId: selected.createRequest, id: selected.id, displayName: 'Statements receiving ' + role,
      role, caseIds: [handoff.caseId], contributorIds: {}, administrator: false,
    };
    let created = await ownerAPI('/api/staff/members/create', body);
    let code = created.accessCode; if (code) secretValues.add(code);
    const current = (await ownerAPI('/api/staff/members')).members.find(item => item.id === selected.id);
    need(current && current.role === role && canonical(current.caseIds) === canonical([handoff.caseId]) &&
      current.administrator === false && canonical(current.contributorIds) === '{}', 'The retained role profile differs from this case-scoped operation.');
    if (!code || current.state !== 'ACTIVE') {
      const request = { requestId: 'nav-rotate-' + randomUUID(), id: selected.id, expectedRevision: current.revision };
      selected.rotations.push(request); await journalSave();
      created = await ownerAPI('/api/staff/members/rotate', request); code = created.accessCode;
      if (code) secretValues.add(code);
    }
    need(typeof code === 'string' && code.length > 30, 'The original access writer did not return its one-time role credential.');
    selected.profile = created.member; await journalSave();
    result.roles.push({ role, id: selected.id, member: created.member });
    // The access code stays only in this process and the original password input.
    return { member: created.member, code };
  }
  async function revokeRoles() {
    if (!origin || !token || !child || child.exitCode !== null || child.signalCode !== null) {
      need(Object.keys(journal.profiles).length === 0, 'Reopen this continuation to close its retained role profiles.');
      return;
    }
    for (const [role, selected] of Object.entries(journal.profiles)) {
      const member = (await ownerAPI('/api/staff/members')).members.find(item => item.id === selected.id);
      if (!member) continue;
      need(member.role === role && canonical(member.caseIds) === canonical([handoff.caseId]) &&
        member.administrator === false && canonical(member.contributorIds) === '{}', 'Do not change another role selection during cleanup.');
      if (member.state !== 'REVOKED') {
        const request = { requestId: 'nav-revoke-' + randomUUID(), id: selected.id, expectedRevision: member.revision };
        selected.revocations.push(request); await journalSave();
        const closed = await ownerAPI('/api/staff/members/revoke', request);
        selected.profile = closed.member; await journalSave();
      }
    }
  }
  async function roleJourney(role) {
    const enrolled = await profile(role);
    const context = await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true });
    roleContexts.add(context);
    const selected = await context.newPage(); await pageErrorWatch(selected, role);
    await selected.goto(origin + '/team', { waitUntil: 'domcontentloaded' });
    await selected.locator('#login-form [name="staffId"]').fill(enrolled.member.id);
    await selected.locator('#login-form [name="accessCode"]').fill(enrolled.code);
    await selected.locator('#login-form button[type="submit"]').click();
    await selected.locator('#signed-in').waitFor({ state: 'visible' });
    const session = await selected.evaluate(async () => {
      const response = await fetch('/api/staff/session', { credentials: 'same-origin' });
      if (!response.ok) throw Error('Original staff session did not open.');
      const value = await response.json(); return { authenticated: value.authenticated, principal: value.principal };
    });
    need(session.authenticated && session.principal.role === role &&
      canonical(session.principal.caseIds) === canonical([handoff.caseId]), 'The actual signed-in role changed.');
    await retain('views/' + role + '-signed-in-profile.json', session);
    await operations(selected);
    const actor = selected.locator('[name="recordingActor"]');
    need(await actor.getAttribute('readonly') !== null && await actor.inputValue() === session.principal.actor,
      'The named role lost its original recording actor.');
    const available = await selected.locator('[data-nav-section]').evaluateAll(items =>
      [...new Set(items.map(item => item.dataset.navSection))]);
    if (role === 'finance') need(available.includes('statements') && available.includes('cash'), 'Finance lost the original account desks.');
    else need(!available.includes('statements') && !available.includes('cash') &&
      available.includes('invoices') && available.includes('reviews'), 'The reviewer received a different original section selection.');
    const inventory = await completeSearch(selected, role);
    need(inventory.keys.includes('record:invoices:' + handoff.invoiceId), 'The original invoice is missing from the role finder.');
    if (role === 'reviewer') need(!inventory.keys.some(key => key.startsWith('record:cash:')),
      'The role finder exposed a Cash section excluded by the original reviewer view.');
    await invoiceEditor(selected, role);
    for (const [key, id] of Object.entries(handoff.originalStatementSourceIds))
      await sourceDownload(beforeCase.sources.find(item => item.id === id), role + '-' + key, selected);
    await snapshot(role + '-original-source', selected, 390);
    await selected.setViewportSize({ width: 1360, height: 1000 });
    await selected.goto(origin + '/team', { waitUntil: 'domcontentloaded' });
    await selected.locator('#sign-out').click();
    await selected.locator('#login-form').waitFor({ state: 'visible' });
    await context.close(); roleContexts.delete(context);
  }
  try {
    await phase('receive-original-account-handoff', async () => {
      const descriptor = handoff.result;
      need(descriptor && typeof descriptor.filename === 'string' && !descriptor.filename.includes('..') &&
        !isAbsolute(descriptor.filename), 'Keep the original account-result descriptor.');
      const raw = await readPrivate(join(dirname(handoffFile), descriptor.filename));
      need(raw.length === descriptor.bytes && hash(raw) === descriptor.sha256, 'The original account result changed.');
      const original = JSON.parse(raw);
      need(original.state === 'COMPLETE' && original.receivedCaseId === handoff.caseId &&
        original.invoiceId === handoff.invoiceId, 'Finish the original complete account receiving before its navigation continuation.');
      result.accountResult = { file: descriptor.filename, bytes: raw.length, sha256: descriptor.sha256,
        receivedCaseId: original.receivedCaseId, receivedVersion: original.receivedVersion };
      for (const [file, expected] of Object.entries(handoff.sourceFiles)) {
        need(file === file.split('/').pop() && file !== '..', 'Use the exact original workspace source leaf.');
        const raw = await readFile(join(handoff.grantDirectory, file));
        need(raw.length === expected.bytes && hash(raw) === expected.sha256, 'The selected installed source changed: ' + file);
      }
      for (const file of ['operations_navigation.mjs', 'operations_navigation_ui.mjs', 'operations.mjs',
        'staff_access.py', 'staff_http.py', 'staff-session.mjs', 'staff.mjs', 'server.py', 'cli.py']) {
        const raw = await readFile(join(handoff.grantDirectory, file));
        result.sourceFiles.push({ file, bytes: raw.length, sha256: hash(raw) });
      }
      await startOwner();
      beforeCase = await ownerAPI('/api/operations/' + handoff.caseId);
      need(beforeCase.program.id === handoff.caseId &&
        beforeCase.records.invoices.some(item => item.id === handoff.invoiceId) &&
        Object.values(handoff.originalStatementSourceIds).every(id => beforeCase.sources.some(item => item.id === id)),
        'The received case is missing its original invoice or bank sources.');
      originalCaseDigest = hash(Buffer.from(canonical(facts(beforeCase))));
      await retain('original-received-case.json', beforeCase);
      const library = await import(pathToFileURL(handoff.playwrightModule).href);
      const chromium = library.chromium ?? library.default?.chromium;
      need(chromium, 'Use the original installed Playwright Chromium API.');
      const browserTemporary = join(out, 'browser-tmp'); await privateDirectory(browserTemporary);
      browser = await chromium.launch({ executablePath: handoff.browserExecutable, headless: true,
        args: ['--disable-dev-shm-usage'], env: { ...process.env, TMPDIR: browserTemporary } });
      result.runtime = { node: process.version, browser: browser.version(), playwrightModule: handoff.playwrightModule,
        browserExecutable: handoff.browserExecutable, pythonExecutable: handoff.pythonExecutable };
      ownerContext = await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true });
      page = await ownerContext.newPage(); await pageErrorWatch(page, 'owner');
      await operations(page, href);
    });
    await phase('complete-case-finder-and-original-sources', async () => {
      const inventory = await completeSearch();
      for (const key of ['record:invoices:' + handoff.invoiceId,
        ...Object.values(handoff.originalStatementSourceIds).map(id => 'source:' + id)])
        need(inventory.keys.includes(key), 'The complete finder omitted the retained case item ' + key);
      await finder(page).locator('[data-nav-close]').click();
      await openFinder(page, true);
      await page.locator('[data-nav-query]').press('ArrowDown');
      need(await page.evaluate(() => document.activeElement?.hasAttribute('data-nav-result')),
        'The original query keyboard continuation did not reach its first result.');
      await page.keyboard.press('Escape');
      need(await page.locator('[data-nav-find]').evaluate(element => element === document.activeElement),
        'The case finder did not restore focus to its original opener.');
      for (const [key, id] of Object.entries(handoff.originalStatementSourceIds)) {
        const metadata = beforeCase.sources.find(item => item.id === id);
        await sourceDownload(metadata, 'owner-' + key);
        const reviewId = metadata.statement?.reviewSourceId;
        if (reviewId) await sourceDownload(beforeCase.sources.find(item => item.id === reviewId), 'owner-' + key + '-native-review');
      }
      await snapshot('owner-original-sources');
      await finder(page).locator('[data-nav-close]').click();
    });
    await phase('supplier-editor-and-linked-cash-provenance', async () => {
      await invoiceEditor();
      const cash = beforeCase.records.cash.filter(item => item.externalRef === 'TRX1002');
      need(cash.length > 0, 'The original supplier payment is missing from its received case.');
      for (const record of cash) {
        await search(record.id, 'record', 'cash');
        await chooseKey('record:cash:' + record.id);
        await retainFinder('supplier-cash-' + record.id);
        need(await finder(page).locator('[data-nav-entry-action="edit"]').count() === 0,
          'Cash must continue through its original correction desk.');
        const related = finder(page).locator('[data-nav-related][title=' + JSON.stringify(handoff.invoiceId) + ']');
        if (await related.count()) {
          await related.first().click(); await retainFinder('cash-to-original-invoice-' + record.id);
          need(await finder(page).locator('[data-nav-detail] > .ops-find-reference').innerText() === handoff.invoiceId,
            'The cash relationship opened another invoice.');
          await finder(page).locator('[data-nav-back]').click();
          await search(record.id, 'record', 'cash'); await chooseKey('record:cash:' + record.id);
        }
        await finder(page).locator('[data-nav-open-entry]').click();
        await page.locator('.cash-account-desk').waitFor({ state: 'visible' });
      }
      await snapshot('received-cash-correction-desk');
    });
    await phase('retained-navigation-and-phone-continuation', async () => {
      await section('statements');
      const before = await page.evaluate(id => JSON.parse(sessionStorage.getItem('sf47.operations.navigation.v1.' + id)), handoff.caseId);
      const pin = page.locator('[data-nav-favorite="statements"]').first();
      if (await pin.getAttribute('aria-pressed') !== 'true') await pin.click();
      await section('sources'); await section('invoices');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-tab="operations"]').click();
      await page.locator('.operating-navigation [data-nav-find]').waitFor({ state: 'visible' });
      need(await page.locator('[name="caseSelect"]').inputValue() === handoff.caseId,
        'Reload lost the original selected case.');
      const after = await page.evaluate(id => JSON.parse(sessionStorage.getItem('sf47.operations.navigation.v1.' + id)), handoff.caseId);
      need(after.favorites.includes('statements') && after.recent.includes('sources') && after.activeSection === 'invoices',
        'The original browser session lost its saved navigation selection.');
      await retain('views/navigation-preferences.json', { before, after });
      await page.setViewportSize({ width: 390, height: 844 }); await section('statements');
      await snapshot('phone-original-statements', page, 390);
      await openFinder(); await search(handoff.invoiceId, 'record', 'invoices');
      await chooseKey('record:invoices:' + handoff.invoiceId);
      await snapshot('phone-original-invoice-finder', page, 390);
      await finder(page).locator('[data-nav-close]').click();
      await page.setViewportSize({ width: 1360, height: 1000 });
    });
    await phase('actual-finance-profile-handover', () => roleJourney('finance'));
    await phase('actual-reviewer-profile-handover', () => roleJourney('reviewer'));
    await phase('preserve-received-case-and-close-owned-roles', async () => {
      const final = await ownerAPI('/api/operations/' + handoff.caseId);
      need(hash(Buffer.from(canonical(facts(final)))) === originalCaseDigest,
        'The navigation continuation changed original account, invoice, source or saved review records.');
      await retain('final-received-case.json', final);
      await revokeRoles();
      result.finalCase = { id: final.program.id, version: final.program.version, originalFactsSha256: originalCaseDigest };
      need(!result.browserErrors.length, 'The original browser retained a script error.');
    });
    result.complete = true;
  } catch (error) {
    result.error = { code: error.code ?? 'STATEMENTS_NAVIGATION_FAILED', message: redact(error.message) };
    if (page && !page.isClosed()) {
      try { await snapshot('interrupted-original-desk'); } catch {}
      try { await retain('interrupted.html', redact(await page.content()), 'text/html'); } catch {}
    }
  } finally {
    for (const context of roleContexts) await context.close().catch(() => {});
    await ownerContext?.close().catch(() => {}); await browser?.close().catch(() => {});
    try { await revokeRoles(); }
    catch (error) { result.complete = false; result.roleCloseError = { message: redact(error.message) }; }
    try { await stopOwner(); }
    catch (error) { result.complete = false; result.ownerCloseError = { message: redact(error.message) }; }
    result.completedAt = now(); await persist();
    const raw = await readPrivate(reportPath);
    journal.complete = result.complete;
    journal.result = { file: reportPath.slice(outputDirectory.length + 1), bytes: raw.length, sha256: hash(raw) };
    await journalSave();
  }
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    need(process.argv.length === 4, 'Use node continue-operating-desk.mjs ORIGINAL_navigation-handoff.json PRIVATE_OUTPUT_DIRECTORY');
    const result = await runStatementsNavigation({ handoffFile: resolve(process.argv[2]), outputDirectory: resolve(process.argv[3]) });
    process.stdout.write(JSON.stringify({ operationId: result.operationId, complete: result.complete,
      caseId: result.caseId, result: join(resolve(process.argv[3]), 'navigation-continuation.json'), error: result.error ?? null }) + '\n');
    process.exitCode = result.complete ? 0 : 2;
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: error.code ?? 'STATEMENTS_NAVIGATION_FAILED', message: error.message }) + '\n');
    process.exitCode = 1;
  }
}
