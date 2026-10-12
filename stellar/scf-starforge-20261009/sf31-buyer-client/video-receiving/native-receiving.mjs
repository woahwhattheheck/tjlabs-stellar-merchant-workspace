// MIT. One complete receiving and browser journey against the documented video contract.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, rename, symlink, stat, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const [sourceRoot, delivery, fixturePath] = process.argv.slice(2);
const prefix = join(sourceRoot, 'stellar/scf-starforge-20261009');
const report = { schema: 'tjlabs.x402engine-video-native-receiving.v1',
  startedAt: new Date().toISOString(), sourceRoot, node: process.version,
  providerContract: 'https://x402engine.app/docs/',
  inputKind: 'LOCAL_DOCUMENTED_PROTOCOL_FIXTURE', complete: false, stages: [], sourceFiles: [] };
const opened = []; let browser;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const put = async (path, value) => { await writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); };
const record = (stage, detail = {}) => { report.stages.push({ stage, at: new Date().toISOString(), ...detail });
  process.stdout.write(JSON.stringify({ event: 'video_receiving_stage', stage, ...detail }) + '\n'); };
try {
  await mkdir(delivery, { recursive: true, mode: 0o700 });
  const { retainX402VideoJob, openX402VideoJob, openX402VideoExport } =
    await import(pathToFileURL(join(prefix, 'sf31-buyer-client/video-receiving/x402engine.mjs')));
  const { startX402VideoOperator } =
    await import(pathToFileURL(join(prefix, 'sf31-buyer-client/video-receiving/operator.mjs')));
  const { runVideoReceivingCommand } =
    await import(pathToFileURL(join(prefix, 'sf31-buyer-client/video-receiving/cli.mjs')));
  const { writeJson } = await import(pathToFileURL(join(prefix, 'sf88-operator-buyer-cli/node/store.mjs')));
  const video = await readFile(fixturePath);
  assert(video.length > 65536);
  report.fixture = { path: fixturePath, bytes: video.length, sha256: hash(video), durationSeconds: 5, dimensions: [1280,720] };
  const statusUrl = 'https://x402engine.app/api/video/status/local-contract-fixture';
  const mediaUrl = 'https://media.example.com/issued/local-contract-fixture.mp4';
  const acceptance = Buffer.from(JSON.stringify({ status_url: statusUrl, accepted: true }) + '\n');
  const acceptancePath = join(delivery, 'accepted-response.json');
  await writeFile(acceptancePath, acceptance, { mode: 0o600 });
  const directory = join(delivery, 'original-job');
  const calls = []; let statuses = 0, medias = 0, fault = true;
  const fixtureFetch = async (url, options) => {
    calls.push({ url, at: Date.now(), method: options.method, headers: options.headers });
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'manual');
    assert(!Object.keys(options.headers).some(key => /payment|authorization|cookie/i.test(key)));
    if (url === statusUrl) {
      statuses++;
      const body = statuses === 1 ? { status: 'processing' } :
        { status: 'completed', video: { url: mediaUrl, file_size: video.length, content_type: 'video/mp4' } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    assert.equal(url, mediaUrl); medias++;
    if (fault) {
      fault = false;
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(video.subarray(0, 65536));
        setTimeout(() => controller.error(new Error('FIXTURE_CONNECTION_INTERRUPTED')), 15);
      }}), { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(video.length) } });
    }
    return new Response(video, { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(video.length) } });
  };
  let job = await retainX402VideoJob({ directory, acceptanceFile: acceptancePath, fetchImpl: fixtureFetch });
  assert.equal((await job.inspect()).sourceKind, 'SAVED_DOCUMENT');
  assert((await readFile(join(directory, 'acceptance.json'))).equals(acceptance));
  await job.poll(); await job.poll(); assert.equal(statuses, 1);
  record('original_acceptance_and_persistent_poll_cadence');
  await assert.rejects(job.receive({ deadlineMs: 20000 }));
  assert.equal(statuses, 2); assert.equal(medias, 1);
  assert(calls.filter(call => call.url === statusUrl)[1].at - calls[0].at >= 4950);
  const attempts = await readdir(join(directory, 'attempts'));
  let partialBytes = 0;
  for (const attempt of attempts) for (const name of await readdir(join(directory, 'attempts', attempt))) {
    if (/\.partial$/.test(name)) partialBytes += (await stat(join(directory, 'attempts', attempt, name))).size;
  }
  assert(partialBytes > 0);
  job = await openX402VideoJob({ directory, fetchImpl: fixtureFetch });
  let result = await job.receive({ deadlineMs: 20000 });
  assert.equal(medias, 2);
  assert.equal((await result.verify()).sha256, hash(video));
  assert((await result.bytes({ limit: video.length })).equals(video));
  record('interrupted_media_reopened_and_complete', { bytes: video.length, partialBytes, mediaGets: medias });
  const state = JSON.parse(await readFile(join(directory, 'state.json')));
  const completeAttempt = state.delivery.file.split('/').slice(0,2).join('/');
  const pending = JSON.parse(await readFile(join(directory, completeAttempt, 'request.json')));
  state.delivery = null; state.pending = pending;
  await writeJson(join(directory, 'state.json'), state);
  job = await openX402VideoJob({ directory, fetchImpl: fixtureFetch });
  result = await job.receive({ deadlineMs: 20000 });
  assert.equal(medias, 2);
  assert.equal((await result.verify()).sha256, hash(video));
  record('published_body_adopted_without_another_get');
  const copyPath = join(delivery, 'received-video.mp4');
  await result.saveAs(copyPath);
  await assert.rejects(result.saveAs(copyPath));
  const exportedPath = join(delivery, 'handover');
  const exported = await job.exportWorkspace(exportedPath);
  const sameExport = await job.exportWorkspace(exportedPath);
  assert.equal(sameExport.files, exported.files);
  const receivedPath = join(delivery, 'received-handover');
  await rename(exportedPath, receivedPath);
  const offline = await openX402VideoExport({ directory: receivedPath,
    fetchImpl: async () => { throw new Error('OFFLINE_RECEIVER_ATTEMPTED_NETWORK'); } });
  assert.equal((await (await offline.result()).verify()).sha256, hash(video));
  assert.equal((await runVideoReceivingCommand(['inspect', '--directory', directory])).state, 'RECEIVED');
  assert.equal((await runVideoReceivingCommand(['open-export', '--directory', receivedPath])).state, 'RECEIVED');
  await assert.rejects(runVideoReceivingCommand(['inspect', '--directory', directory, '--port', '0']));
  const alias = join(delivery, 'alias'); await symlink(directory, alias);
  await assert.rejects(job.exportWorkspace(join(alias, 'nested-export')),
    error => error.code === 'VIDEO_CANONICAL_DIRECTORY_REQUIRED');
  record('complete_offline_handover_and_original_cli', { files: exported.files, bytes: exported.bytes });
  const allPaths = async (root, prefix = '') => {
    const files = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const name = join(prefix, entry.name), path = join(root, entry.name);
      if (entry.isDirectory()) files.push(...await allPaths(path, name));
      else if (entry.isFile()) files.push(name);
    }
    return files;
  };
  const authored = await allPaths(join(prefix, 'sf31-buyer-client/video-receiving'));
  for (const file of authored) {
    const bytes = await readFile(join(prefix, 'sf31-buyer-client/video-receiving', file));
    report.sourceFiles.push({ file, bytes: bytes.length, sha256: hash(bytes) });
  }
  const operator = await startX402VideoOperator({ directory, fetchImpl: fixtureFetch,
    exportsDirectory: join(delivery, 'browser-exports') });
  opened.push(operator);
  const browserJobPath = join(delivery, 'browser-job');
  const browserFetch = async (url, options) => {
    assert.equal(options.method, 'GET');
    assert(!Object.keys(options.headers).some(key => /payment|authorization|cookie/i.test(key)));
    return url === statusUrl ?
      new Response(JSON.stringify({ status: 'completed', video: { url: mediaUrl } }),
        { headers: { 'content-type': 'application/json' } }) :
      new Response(video, { headers: { 'content-type': 'video/mp4', 'content-length': String(video.length) } });
  };
  await retainX402VideoJob({ directory: browserJobPath, acceptanceFile: acceptancePath, fetchImpl: browserFetch });
  const second = await startX402VideoOperator({ directory: browserJobPath, fetchImpl: browserFetch,
    exportsDirectory: join(delivery, 'browser-exports') });
  opened.push(second);
  assert.equal((await fetch(operator.origin + '/api/status')).status, 401);
  let playwright;
  const candidates = [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, process.env.NODE_PATH,
    '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules',
    '/usr/local/lib/node_modules'].filter(Boolean).flatMap(value => value.split(':'));
  const failures = [];
  for (const base of candidates) {
    try {
      const req = createRequire(join(resolve(base), '__receiving__.cjs'));
      const resolved = req.resolve('playwright');
      playwright = req('playwright'); report.playwright = resolved; break;
    } catch (error) { failures.push({ base, code: error.code }); }
  }
  if (!playwright) throw Object.assign(new Error('INSTALLED_PLAYWRIGHT_REQUIRED'), { details: failures });
  const executablePath = process.env.VIDEO_CHROMIUM_EXECUTABLE;
  browser = await playwright.chromium.launch({ headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width:1280, height:900 }, acceptDownloads:true });
  const page = await context.newPage(); const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(operator.url);
  await page.locator('#state').filter({ hasText:'RECEIVED' }).waitFor();
  await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
  const duration = await page.locator('video').evaluate(video => video.duration);
  assert(Math.abs(duration - 5) < 0.2);
  await page.screenshot({ path: join(delivery, 'video-desktop.png'), fullPage: true });
  const secondPage = await context.newPage();
  await secondPage.goto(second.url);
  await secondPage.locator('#state').filter({ hasText:'WAITING' }).waitFor();
  await secondPage.locator('#receive').click();
  await secondPage.locator('#state').filter({ hasText:'RECEIVED' }).waitFor();
  assert.equal(await page.evaluate(async () => (await fetch('/api/status')).status), 200);
  const cookies = await context.cookies();
  assert.equal(cookies.filter(cookie => cookie.name.startsWith('video_receiving_')).length, 2);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadEvent;
  const downloadedPath = join(delivery, 'browser-received-video.mp4');
  await download.saveAs(downloadedPath);
  assert.equal(hash(await readFile(downloadedPath)), hash(video));
  await page.locator('#export').click();
  await page.locator('#archive').waitFor({ state:'visible' });
  const archiveEvent = page.waitForEvent('download');
  await page.locator('#archive').click();
  const archive = await archiveEvent;
  const archivePath = join(delivery, 'browser-workspace.tar.gz');
  await archive.saveAs(archivePath);
  const browserReopened = join(delivery, 'browser-reopened');
  await mkdir(browserReopened, { mode:0o700 });
  const unpack = spawnSync('tar', ['-xzf', archivePath, '-C', browserReopened], { encoding:'utf8' });
  assert.equal(unpack.status, 0);
  const reopened = await openX402VideoExport({ directory:browserReopened,
    fetchImpl:async () => { throw new Error('OFFLINE_BROWSER_HANDOVER_ATTEMPTED_NETWORK'); } });
  assert.equal((await (await reopened.result()).verify()).sha256, hash(video));
  const authCookie = cookies.find(cookie => cookie.value === operator.url.split('#')[1]);
  const ranged = await fetch(operator.origin + '/api/video', { headers: {
    cookie: authCookie.name + '=' + authCookie.value, range:'bytes=100-199' } });
  assert.equal(ranged.status,206);
  assert(Buffer.from(await ranged.arrayBuffer()).equals(video.subarray(100,200)));
  const interrupted = await fetch(operator.origin + '/api/video/download', { headers: {
    cookie:authCookie.name + '=' + authCookie.value } });
  const reader = interrupted.body.getReader(); await reader.read(); await reader.cancel();
  assert.equal(await page.evaluate(async () => (await fetch('/api/status')).status),200);
  await page.setViewportSize({ width:390, height:844 });
  await page.screenshot({ path:join(delivery,'video-phone.png'),fullPage:true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(browserErrors.length,0);
  record('desktop_phone_playback_complete_downloads_and_independent_sessions',
    { desktop:[1280,900], phone:[390,844], durationSeconds:duration, downloads:2, sessionCookies:2 });
  report.requests = { statusGets:statuses, mediaGets:medias, methods:[...new Set(calls.map(x=>x.method))],
    paymentHeaders:0, smallestStatusIntervalMs:calls.filter(x=>x.url===statusUrl)[1].at-calls[0].at };
  report.complete = true;
} catch (error) {
  report.error = { code:error.code ?? error.message, stack:error.stack, details:error.details ?? null };
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(error => { report.browserCloseError=error.message; report.complete=false; process.exitCode=1; });
  for (const server of opened) await server.close().catch(error => { report.operatorCloseError=error.message; report.complete=false; process.exitCode=1; });
  report.finishedAt=new Date().toISOString();
  await put(join(delivery,'native-result.json'),report);
  process.stdout.write(JSON.stringify({ event:'video_receiving_complete', complete:report.complete,
    result:join(delivery,'native-result.json'), stages:report.stages.length,
    error:report.error?.code ?? null })+'\n');
}
