// MIT. One customer-browser continuation using the original SF82 export APIs.
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {assert,readFile,mkdir,join,hash,jsonBytes,save,saveBytes as persistBytes,waitFor,captureOnce} from './common.mjs';
const saveBytes=(file,bytes)=>persistBytes(file,bytes,{createOnly:true});
function unpackTar(gzip, exportId, expected) {
  const data = gunzipSync(gzip, { maxOutputLength: 136 * 1024 * 1024 });
  const files = new Map(); let offset = 0;
  while (offset + 512 <= data.length && data.subarray(offset, offset + 512).some(value => value !== 0)) {
    const header = data.subarray(offset, offset + 512);
    const text = (start, size) => header.subarray(start, start + size).toString('utf8').replace(/\0.*$/s, '');
    const name = text(0, 100), bytes = Number.parseInt(text(124, 12).trim(), 8);
    assert.equal(text(156, 1), '0', 'Original customer archive contains regular files only.');
    assert(Number.isSafeInteger(bytes) && bytes >= 0 && offset + 512 + bytes <= data.length);
    assert(name.startsWith(exportId + '/') && !name.slice(exportId.length + 1).includes('/'));
    const file = name.slice(exportId.length + 1), identity = expected.find(row => row.name === file);
    assert(identity && !files.has(file), 'Only the six original reviewed customer files are received.');
    const content = data.subarray(offset + 512, offset + 512 + bytes);
    assert.equal(content.length, identity.bytes); assert.equal(hash(content), identity.sha256);
    files.set(file, Buffer.from(content)); offset += 512 + Math.ceil(bytes / 512) * 512;
  }
  assert.equal(files.size, 6); assert(data.subarray(offset).every(value => value === 0));
  return files;
}

export async function receiveClient({ context, consoleHost, consoleApi, output, clientId,
  report, checkpoint, expectedRelease, expectedAmount, snapshot, resourcePath, operationId, intent, intentFile }) {
  const page = await context.newPage();
  page.on('pageerror', error => report.browserErrors.push({ source: 'customer-console', message: error.message }));
  try {
    await page.goto(consoleHost.operatorUrl);
    await page.locator('#runtime').waitFor();
    await waitFor(async () => (await page.locator('#runtime').textContent())?.includes('RUNNING'),
      'the original running merchant in its customer console');
    await page.fill('#client-export-id', clientId);
    let retained = await consoleApi('/api/clients/inspect?exportId=' + encodeURIComponent(clientId));
    if (retained.state === 'NOT_FOUND') {
      await page.route('**/api/clients/generate', async route => {
        const response = await route.fetch({ timeout: 120000 });
        if (!response.ok()) { await route.fulfill({ response }); return; }
        const bytes = await response.body();
        await saveBytes(join(output, 'withheld-original-client-reply.json'), bytes);
        intent.clientReplyWithheld = true; await save(intentFile, intent);
        await route.abort('failed'); // one real native export; only its browser reply is lost
      }, { times: 1 });
      intent.clientGenerateCommands = (intent.clientGenerateCommands ?? 0) + 1; await save(intentFile, intent);
      await waitFor(() => page.locator('#client-generate').isEnabled(), 'customer generation control');
      await page.click('#client-generate');
      await waitFor(async () => (await page.locator('#client-notice').textContent())?.includes('Inspect retained client'),
        'original UI handoff recovery after the lost reply');
      assert.equal(intent.clientReplyWithheld, true);
    } else assert.equal(retained.state, 'COMPLETE', 'Preserve and inspect any interrupted original export before another generation.');
    const inspectedResponse = page.waitForResponse(value =>
      new URL(value.url()).pathname === '/api/clients/inspect' && value.request().method() === 'GET');
    await waitFor(() => page.locator('#client-inspect').isEnabled(), 'original retained-client inspection');
    await page.click('#client-inspect');
    const response = await inspectedResponse; assert(response.ok(), await response.text());
    retained = await response.json();
    assert.equal(retained.state, 'COMPLETE');
    assert.equal(retained.manifest.provenance.releaseId, expectedRelease.id);
    assert.equal(retained.manifest.provenance.releaseDigest, expectedRelease.digest);
    assert.equal(retained.files.length, 5);
    await waitFor(async () => await page.locator('#client-files tr').count() === 6,
      'the six original customer files after the response renders');
    await captureOnce({directory:output,intent,intentFile},page,'customer-handover-desktop.png');
    await page.setViewportSize({ width: 412, height: 915 });
    await captureOnce({directory:output,intent,intentFile},page,'customer-handover-mobile.png');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Original customer handover fits the mobile viewport.');
    const downloaded = page.waitForEvent('download');
    await page.click('#client-package'); const download = await downloaded;
    const archive = Buffer.from(await readFile(await download.path()));
    const expected = [...retained.manifest.files, retained.manifestFile];
    const received = unpackTar(archive, clientId, expected);
    const receivedDirectory = join(output, 'received-client');
    await mkdir(receivedDirectory, { recursive: true, mode: 0o700 });
    for (const [name, content] of received) await saveBytes(join(receivedDirectory, name), content);
    await saveBytes(join(output, clientId + '.tar.gz'), archive);
    await save(join(output, 'customer-handover.json'), retained);
    const originalModule = retained.files.find(file => file.name === 'seller-client.mjs');
    const fileQuery = new URLSearchParams({ exportId: clientId, file: originalModule.name,
      expectedManifestSha256: retained.manifestFile.sha256, expectedSha256: originalModule.sha256 });
    const range = await consoleApi('/api/clients/download?' + fileQuery, undefined, true, { range: 'bytes=512-1023' });
    assert.equal(range.status, 206);
    const rangeBytes = Buffer.from(await range.arrayBuffer());
    assert.deepEqual(rangeBytes, received.get(originalModule.name).subarray(512, 1024));
    const customer = await import(pathToFileURL(join(receivedDirectory, 'seller-client.mjs')).href);
    const operation = customer.operations.find(value => value.method === 'GET' && value.path === resourcePath);
    assert(operation, 'Original generated client exposes the reviewed resource.');
    const request = customer.buildRequest(operation.id, { query: { limit: '2', snapshot } }, {
      intentId: operationId + '-customer-offline', acceptIndex: 0, maxAtomic: expectedAmount });
    assert.equal(new URL(request.url).searchParams.get('snapshot'), snapshot);
    assert(JSON.stringify(request).includes(expectedAmount));
    await save(join(output, 'original-customer-request.json'), request);
    const result = { exportId: clientId, manifestSha256: retained.manifestFile.sha256,
      sourceSha256: retained.sourceSha256, filesSha256: retained.filesSha256,
      files: expected.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
      archiveSha256: hash(archive), archiveBytes: archive.length,
      releaseId: expectedRelease.id, releaseDigest: expectedRelease.digest,
      offlineRequestSha256: hash(jsonBytes(request)), snapshot,
      generateCommands: intent.clientGenerateCommands ?? 0,
      controlledReplyLoss: intent.clientReplyWithheld === true,
      rangeBytes: rangeBytes.length };
    await checkpoint('Customer browser recovers one original export and receives all six reviewed files', {
      exportId: clientId, manifestSha256: result.manifestSha256, archiveSha256: result.archiveSha256,
      archiveBytes: archive.length, files: expected.length, generationCommands: result.generateCommands,
      offlineRequestSha256: result.offlineRequestSha256 });
    return result;
  } finally { await page.close(); }
}

