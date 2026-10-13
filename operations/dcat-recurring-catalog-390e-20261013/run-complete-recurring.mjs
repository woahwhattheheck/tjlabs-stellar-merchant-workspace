// MIT. One original following-edition domain/browser/customer receiving lifetime.
import { mkdir, lstat, realpath, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { runDcatRecurringCatalog } from './run-recurring-catalog.mjs';
import { runDcatRecurringBrowser } from './browser-recurring-catalog.mjs';

const PREFIX = 'stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/';
const hash = raw => createHash('sha256').update(raw).digest('hex');
const stamp = () => new Date().toISOString();
function need(value, code) { if (!value) throw Object.assign(new Error(code), { code }); }
async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const value = await lstat(path);
  need(value.isDirectory() && !value.isSymbolicLink() && await realpath(path) === path &&
    !(value.mode & 0o077) && (process.getuid === undefined || value.uid === process.getuid()),
    'DCAT_RECEIVING_PRIVATE_DIRECTORY_REQUIRED');
}

/**
 * Continue one existing saved project through original domain, full browser,
 * post-browser archive receiving and an independent reopened browser.
 * The surrounding owned native operation preserves the whole output directory.
 */
export async function runCompleteDcatRecurring(options = {}) {
  for (const key of ['sourceRoot', 'projectDirectory', 'outputDirectory', 'python', 'playwrightModule', 'chromiumPath'])
    need(typeof options[key] === 'string' && isAbsolute(options[key]), 'DCAT_RECEIVING_ABSOLUTE_' + key.toUpperCase());
  const sourceRoot = resolve(options.sourceRoot), projectDirectory = resolve(options.projectDirectory);
  const out = resolve(options.outputDirectory);
  need(out !== projectDirectory && !out.startsWith(projectDirectory + '/'), 'DCAT_RECEIVING_OUTPUT_OUTSIDE_PROJECT');
  const browserSelection = { normalizeV3: options.normalizeV3 ?? false };
  if (options.browserReview !== undefined) {
    need(options.browserReview !== null && typeof options.browserReview === 'object' && !Array.isArray(options.browserReview),
      'DCAT_RECEIVING_BROWSER_SELECTION_INVALID');
    for (const key of Object.keys(options.browserReview)) {
      need(['candidateId', 'reuseMappingIndexes', 'baselineReleaseId', 'normalizeV3'].includes(key),
        'DCAT_RECEIVING_BROWSER_SELECTION_UNKNOWN_FIELD');
      browserSelection[key] = options.browserReview[key];
    }
  }
  await privateDirectory(out);
  const resultPath = join(out, 'complete-result.json');
  const result = { schema: 'commons.dcat-complete-recurring-receiving.v1',
    operation: 'DCAT-RECURRING-CATALOG-20261013-390E', sourceRoot, projectDirectory,
    startedAt: stamp(), complete: false, phases: [], sourceFiles: [] };
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const secrets = new Set();
  const redact = value => { let text = String(value ?? ''); for (const secret of secrets) text = text.split(secret).join('[private startup capability]'); return text; };
  let model, server, domain, browser, reopened;
  const sdk = join(sourceRoot, PREFIX);
  const environment = { ...process.env, ...(options.environment ?? {}),
    SCF_DCAT_PYTHON: options.python, SCF_DCAT_RUNTIME_PROFILE: options.runtimeProfile ?? 'portable-python312' };
  let openCkanWorkbench, startCkanServer, inspectCkanWorkspaceArchive, receiveCkanWorkspaceArchive;
  let stringify = JSON.stringify;
  async function checkpoint() {
    await writeFile(resultPath + '.pending', stringify(result, null, 2) + '\n', { mode: 0o600 });
    await rename(resultPath + '.pending', resultPath);
  }
  async function keep(name, value) {
    const raw = Buffer.from(stringify(value, null, 2) + '\n'), file = join(out, name);
    await writeFile(file, raw, { flag: 'wx', mode: 0o600 });
    return { file, bytes: raw.length, sha256: hash(raw) };
  }
  async function phase(name, action) {
    const record = { name, state: 'RUNNING', startedAt: stamp() };
    result.phases.push(record); await checkpoint();
    try { const value = await action(); record.state = 'COMPLETE'; record.completedAt = stamp(); await checkpoint(); return value; }
    catch (error) {
      record.state = 'FAILED'; record.completedAt = stamp();
      record.error = { code: error.code ?? 'DCAT_COMPLETE_RECURRING_FAILED', message: redact(error.message) };
      await checkpoint(); throw error;
    }
  }
  async function closeOwner() {
    // Drain the original listener before releasing its saved-project lease.
    if (server) { const current = server; await current.close(); server = null; }
    if (model) { const current = model; await current.close(); model = null; }
  }
  async function openOwner(directory) {
    need(!model && !server, 'DCAT_RECEIVING_OWNER_ALREADY_OPEN');
    model = await openCkanWorkbench({ directory, environment });
    try {
      server = await startCkanServer({ workbench: model, port: 0 });
      secrets.add(server.url); secrets.add(server.token);
      const state = model.status();
      return { url: server.url, directory: model.directory, projectCreatedAt: state.createdAt };
    } catch (error) { await closeOwner(); throw error; }
  }
  try {
    await phase('load-installed-original-source', async () => {
      ({ openCkanWorkbench } = await import(pathToFileURL(join(sdk, 'model.mjs')).href));
      ({ startCkanServer } = await import(pathToFileURL(join(sdk, 'server.mjs')).href));
      ({ inspectCkanWorkspaceArchive, receiveCkanWorkspaceArchive } =
        await import(pathToFileURL(join(sdk, 'archive.mjs')).href));
      const codec = await import(pathToFileURL(join(sdk, 'public/dcat-json.mjs')).href);
      stringify = codec.stringifyDcatJson;
      need(typeof stringify === 'function', 'DCAT_RECEIVING_EXACT_CODEC_REQUIRED');
      for (const leaf of ['model.mjs', 'server.mjs', 'archive.mjs', 'dcat-workspace.mjs',
        'dcat-acquisition.mjs', 'dcat_migration.py', 'public/app.mjs', 'public/migration.mjs',
        'public/dcat-sources.mjs', 'public/dcat-json.mjs']) {
        const bytes = await readFile(join(sdk, leaf));
        result.sourceFiles.push({ path: PREFIX + leaf, bytes: bytes.length, sha256: hash(bytes) });
      }
    });
    domain = await phase('original-live-source-domain', () => runDcatRecurringCatalog({
      sourceRoot, projectDirectory, outputDirectory: join(out, 'domain'), python: options.python,
      runtimeProfile: options.runtimeProfile ?? 'portable-python312', environment,
      ...(options.publicSourceUrl === undefined ? {} : { publicSourceUrl: options.publicSourceUrl }),
      ...(options.label === undefined ? {} : { label: options.label }),
      ...(options.sourceId === undefined ? {} : { sourceId: options.sourceId }),
      ...(options.baselineReleaseId === undefined ? {} : { baselineReleaseId: options.baselineReleaseId }),
      ...(options.reuseMappingIndexes === undefined ? {} : { reuseMappingIndexes: options.reuseMappingIndexes }),
      ...(options.normalizeV3 === undefined ? {} : { normalizeV3: options.normalizeV3 }),
      ...(options.rehearseRelease === undefined ? {} : { rehearseRelease: options.rehearseRelease }),
    }));
    result.domain = { file: join(out, 'domain/result.json'), complete: domain.complete, sourceId: domain.sourceId,
      review: domain.review ?? null, error: domain.error ?? null, receivingError: domain.receivingError ?? null };
    need(domain.sourceId, 'DCAT_RECEIVING_DOMAIN_HAS_NO_SAVED_SOURCE');
    browser = await phase('original-full-browser', async () => {
      const startup = await openOwner(projectDirectory);
      return runDcatRecurringBrowser({ ...startup, sourceRoot, outputDirectory: join(out, 'browser'),
        receivingResult: domain, mode: 'full', playwrightModule: options.playwrightModule,
        chromiumPath: options.chromiumPath, ...browserSelection,
        ...(options.operationTimeout === undefined ? {} : { operationTimeout: options.operationTimeout }) });
    });
    result.browser = { file: join(out, 'browser/recurring-browser-result.json'), complete: browser.complete,
      preparedReview: browser.preparedReview ?? null };
    const savedDcat = stringify(model.status().dcat);
    const archive = browser.workspaceArchive;
    need(archive && /^[a-f0-9]{64}$/.test(archive.sha256 ?? '') && isAbsolute(archive.file),
      'DCAT_RECEIVING_POST_BROWSER_ARCHIVE_REQUIRED');
    await phase('close-original-owner', closeOwner);
    const destination = join(out, 'received-browser-workspace');
    await phase('receive-exact-post-browser-workspace', async () => {
      const inspected = await inspectCkanWorkspaceArchive({ file: archive.file, expectedSha256: archive.sha256 });
      result.archiveInspection = await keep('post-browser-archive-inspection.json', inspected);
      const receipt = await receiveCkanWorkspaceArchive({ file: archive.file, directory: destination,
        expectedSha256: archive.sha256 });
      result.archiveReceiving = await keep('post-browser-archive-receiving.json', receipt);
      result.workspaceArchive = { id: archive.id, file: archive.file, bytes: archive.bytes, sha256: archive.sha256,
        receivedDirectory: destination };
    });
    reopened = await phase('original-reopened-browser', async () => {
      const startup = await openOwner(destination);
      need(stringify(model.status().dcat) === savedDcat, 'DCAT_RECEIVING_POST_BROWSER_HISTORY_CHANGED');
      return runDcatRecurringBrowser({ ...startup, sourceRoot, outputDirectory: join(out, 'reopen'),
        receivingResult: domain, expectedBrowserResult: browser, mode: 'reopen',
        playwrightModule: options.playwrightModule, chromiumPath: options.chromiumPath,
        ...(options.operationTimeout === undefined ? {} : { operationTimeout: options.operationTimeout }) });
    });
    result.reopened = { file: join(out, 'reopen/recurring-browser-result.json'), complete: reopened.complete };
    await phase('close-received-owner', closeOwner);
    result.complete = domain.complete === true && browser.complete === true && reopened.complete === true;
    if (!result.complete) result.error = { code: 'DCAT_ORIGINAL_DOMAIN_NEEDS_CONTINUATION',
      message: 'The complete retained domain result identifies its remaining original acquisition or receiving outcome.' };
  } catch (error) {
    result.error = { code: error.code ?? 'DCAT_COMPLETE_RECURRING_FAILED', message: redact(error.message) };
  } finally {
    try { await closeOwner(); }
    catch (error) { result.complete = false;
      result.closeError = { code: error.code ?? 'DCAT_RECEIVING_CLOSE_FAILED', message: redact(error.message) }; }
    result.completedAt = stamp(); await checkpoint();
  }
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    need(process.argv.length === 4 && process.argv[2] === '--input', 'DCAT_RECEIVING_USAGE_--input_PRIVATE_CONFIG_JSON');
    const inputPath = resolve(process.argv[3]), info = await lstat(inputPath);
    need(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && !(info.mode & 0o077) &&
      (process.getuid === undefined || info.uid === process.getuid()), 'DCAT_RECEIVING_PRIVATE_INPUT_REQUIRED');
    const input = JSON.parse(await readFile(inputPath, 'utf8'));
    const result = await runCompleteDcatRecurring(input);
    process.stdout.write(JSON.stringify({ operation: result.operation, complete: result.complete,
      result: join(resolve(input.outputDirectory), 'complete-result.json'), error: result.error ?? null }) + '\n');
    process.exitCode = result.complete ? 0 : 2;
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: error.code ?? 'DCAT_COMPLETE_RECURRING_FAILED', message: error.message }) + '\n');
    process.exitCode = 1;
  }
}
