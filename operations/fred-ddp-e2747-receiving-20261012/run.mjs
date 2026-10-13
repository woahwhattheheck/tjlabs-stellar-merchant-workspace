// MIT. One resumable native Board-to-FRED project receiving operation.
import { readFile, writeFile, mkdir, open, link, unlink } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const FRED = 'stellar/scf-starforge-20261009/sf30-seller-sdk/fred';
const SHA = /^[a-f0-9]{64}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
function need(ok, message) { if (!ok) throw new Error(message); }
function argumentsOf(args) {
  const values = {}, allowed = new Set(['source-root', 'original-directory', 'work-directory', 'input',
    'bundle', 'phase', 'api-key-env', 'migration', 'interrupt-after-responses', 'source-mode', 'metadata', 'acquisition']);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/, '');
    need(args[index]?.startsWith('--') && allowed.has(key) && args[index + 1] !== undefined &&
      !args[index + 1].startsWith('--') && values[key] === undefined, 'Supply each declared native option once with its value.');
    values[key] = args[index + 1];
  }
  need(values['source-root'] && values['work-directory'], 'Supply the complete source root and the original operation work directory.');
  values.phase ??= 'prepare';
  need(['prepare', 'complete'].includes(values.phase), 'Choose prepare or complete for this same native operation.');
  values['api-key-env'] ??= 'FRED_API_KEY';
  need(/^[A-Z_][A-Z0-9_]{0,127}$/.test(values['api-key-env']), 'Name the existing FRED key environment variable.');
  values['source-mode'] ??= 'API_VINTAGE';
  need(['API_VINTAGE', 'ALFRED_VINTAGE'].includes(values['source-mode']), 'Choose API_VINTAGE or ALFRED_VINTAGE for this original acquisition.');
  need(values['source-mode'] === 'ALFRED_VINTAGE' || values.metadata === undefined,
    'Historical ALFRED metadata belongs to an explicitly selected ALFRED acquisition.');
  if (values.acquisition !== undefined) need(/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(values.acquisition),
    'Choose the original native acquisition operation ID.');
  const interruption = Number(values['interrupt-after-responses'] ?? '2');
  need(Number.isSafeInteger(interruption) && interruption >= 0 && interruption <= 10, 'Choose 0–10 actual responses for the single interruption check.');
  values.interruption = interruption;
  return values;
}
async function optionalJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function exactFile(path, body) {
  body = Buffer.isBuffer(body) ? body : Buffer.from(body);
  await mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 });
  try { await writeFile(path, body, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const current = await fileIdentity(path);
    need(current.bytes === body.length && current.sha256 === hash(body),
      'The original operation output already has different bytes: ' + basename(path));
  }
  return { path, bytes: body.length, sha256: hash(body) };
}
const options = argumentsOf(process.argv.slice(2));
const sourceRoot = resolve(options['source-root']), work = resolve(options['work-directory']);
const projectDirectory = join(work, 'project'), receiverDirectory = join(work, 'received');
const modules = await Promise.all(['project.mjs', 'model.mjs', 'ddp/files.mjs', 'ddp/crosswalk.mjs',
  'ddp/package.mjs', 'ddp/migration.mjs', 'canonical-stream.mjs'].map(path => import(pathToFileURL(join(sourceRoot, FRED, path)).href)));
const [project, model, files, crosswalks, packages, migrations, { canonicalJSONChunks }] = modules;
const contexts = new Map();
await mkdir(work, { recursive: true, mode: 0o700 });
function* jsonChunks(value) { yield* canonicalJSONChunks(value); yield '\n'; }
function jsonIdentity(value) {
  const digest = createHash('sha256'); let bytes = 0;
  for (const chunk of jsonChunks(value)) { digest.update(chunk, 'utf8'); bytes += Buffer.byteLength(chunk); }
  return { bytes, sha256: digest.digest('hex') };
}
async function fileIdentity(path) {
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    need(info.isFile(), 'The retained operation output must be a regular file: ' + basename(path));
    const digest = createHash('sha256'), buffer = Buffer.allocUnsafe(65536);
    let bytes = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      digest.update(buffer.subarray(0, bytesRead)); bytes += bytesRead;
    }
    need(bytes === info.size, 'The retained operation output changed while reading: ' + basename(path));
    return { path, bytes, sha256: digest.digest('hex') };
  } finally { await handle.close(); }
}
const record = (kind, value) => process.stdout.write(JSON.stringify({ at: new Date().toISOString(), kind, ...value }) + '\n');
async function saveJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 });
  const temporary = path + '.part-' + randomUUID();
  const handle = await open(temporary, 'wx', 0o600);
  const digest = createHash('sha256'); let bytes = 0;
  try {
    for (const chunk of jsonChunks(value)) {
      await handle.writeFile(chunk, 'utf8');
      digest.update(chunk, 'utf8'); bytes += Buffer.byteLength(chunk);
    }
    await handle.sync();
  } catch (error) {
    await handle.close(); await unlink(temporary).catch(() => {}); throw error;
  }
  await handle.close();
  const result = { path, bytes, sha256: digest.digest('hex') };
  try {
    try { await link(temporary, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const original = await fileIdentity(path);
      need(original.bytes === result.bytes && original.sha256 === result.sha256,
        'The original operation output already has different bytes: ' + basename(path));
    }
  } finally { await unlink(temporary); }
  return result;
}
async function readBundle(path) {
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  let raw;
  try {
    const info = await handle.stat();
    need(info.isFile() && info.size <= 480 * 1024 * 1024,
      'Receive a complete original project file within the receiving capacity.');
    raw = await handle.readFile();
    need(raw.length === info.size, 'The complete original project changed while reading.');
  } finally { await handle.close(); }
  const input = { inputBytes: raw.length, inputSha256: hash(raw) };
  const bundle = JSON.parse(raw.toString('utf8'));
  raw = null;
  return { bundle, ...input };
}
async function receiveBundleFile(path, directory) {
  const { bundle, inputBytes, inputSha256 } = await readBundle(path);
  const received = await project.receiveFredProject({ directory, bundle, qcewSourceContexts: contexts });
  return { ...received, projectId: received.projectId ?? bundle.state.id, inputBytes, inputSha256 };
}
async function currentRevision() { return (await project.readFredProject(projectDirectory)).revision; }
async function receiveInput() {
  if (!options.bundle) return null;
  const received = await receiveBundleFile(resolve(options.bundle), projectDirectory);
  record('original-project-received', { projectId: received.projectId, revision: received.revision,
    bundleSha256: received.bundleSha256, inputBytes: received.inputBytes, inputSha256: received.inputSha256,
    reused: received.reused ?? false });
  return received;
}
function sourceRecord(manifest, filename, expectedSha256) {
  const value = manifest.sources?.find(item => item.filename === filename);
  need(value && value.sha256 === expectedSha256 && Number.isSafeInteger(value.bytes), 'The original source manifest or selected file identity changed.');
  const receivedAt = value.retained_file_response?.headers?.Date ?? manifest.recorded_at_utc;
  need(Number.isFinite(Date.parse(receivedAt)), 'The source manifest must retain its actual receipt time.');
  return { value, receivedAt: new Date(receivedAt).toISOString() };
}
async function prepare() {
  await receiveInput();
  const existingState = await optionalJson(join(projectDirectory, 'project.json')) ? await project.readFredProject(projectDirectory) : null;
  const original = resolve(options['original-directory'] ??
    '/workspace/scratch/e2747a1b9eee/federal-reserve-originals');
  const manifestPath = join(original, 'Federal_Reserve_Original_Source_Manifest_20261012.json');
  const manifestBytes = await readFile(manifestPath);
  need(manifestBytes.length === 5097 && hash(manifestBytes) ===
    'cdab478e3241326759a05b624f8b7e828de9b73601ff538fdfc6b16e5a6e6cae',
    'The retained original Board source manifest changed.');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const names = { crosswalk: 'Federal_Reserve_DDP_FRED_Data_Series_Crosswalk_20261012.csv',
    package: 'Federal_Reserve_H15_Original_SDMX_20261012.zip' };
  const pins = { crosswalk: '536ba3dc62d10f51d70208a6f35aea022bb4d41d9feb2659de22cf649065852d',
    package: 'bb2e439536b7312483db8dafd4770509e1c34dcef692e14e4797bd16d051f24a' };
  const originals = {};
  for (const kind of ['crosswalk', 'package']) {
    const { value, receivedAt } = sourceRecord(manifest, names[kind], pins[kind]);
    const bytes = await readFile(join(original, names[kind]));
    need(bytes.length === value.bytes && hash(bytes) === pins[kind], 'The original complete ' + kind + ' bytes changed.');
    originals[kind] = files.createFredDdpSourceFile({ name: names[kind],
      mediaType: kind === 'crosswalk' ? 'text/csv' : 'application/zip', content: bytes,
      provenance: { kind: 'file', receivedAt } });
  }
  // Reuse the original adopted Board source identities when continuing the complete customer project.
  const crosswalkChoices = (existingState?.ddpCrosswalks ?? []).filter(item => item.source.sha256 === pins.crosswalk);
  const packageChoices = (existingState?.ddpPackages ?? []).filter(item => item.source.sha256 === pins.package);
  const pairs = new Map();
  for (const plan of existingState?.ddpMigrations ?? []) {
    if (options.migration && plan.id !== options.migration) continue;
    if (crosswalkChoices.some(item => item.id === plan.crosswalkId) && packageChoices.some(item => item.id === plan.packageId))
      pairs.set(plan.crosswalkId + ':' + plan.packageId, { crosswalkId: plan.crosswalkId, packageId: plan.packageId });
  }
  if (pairs.size === 0 && crosswalkChoices.length === 1 && packageChoices.length === 1 && !options.migration)
    pairs.set('original', { crosswalkId: crosswalkChoices[0].id, packageId: packageChoices[0].id });
  need(pairs.size <= 1 && (!options.migration || pairs.size === 1),
    'Choose the retained migration whose original Board source pair this preparation continues.');
  const retainedPair = pairs.values().next().value;
  need(retainedPair || crosswalkChoices.length + packageChoices.length === 0,
    'Continue a complete original Board source pair from this project.');
  const crosswalk = retainedPair ? await project.getFredDdpCrosswalk({ directory: projectDirectory,
    crosswalkId: retainedPair.crosswalkId }) : crosswalks.sealFredDdpCrosswalk({ file: originals.crosswalk });
  const packageCapture = retainedPair ? await project.getFredDdpPackage({ directory: projectDirectory,
    packageId: retainedPair.packageId }) : packages.sealFredDdpPackage({ file: originals.package, release: 'H15', format: 'board-sdmx-zip' });
  need(crosswalk.file.sha256 === pins.crosswalk && packageCapture.file.sha256 === pins.package,
    'The retained original Board source pair changed.');
  const crosswalkRows = crosswalks.inspectFredDdpCrosswalk(crosswalk).summary.rowCount;
  const packageSummary = model.clone(packages.inspectFredDdpPackage(packageCapture).summary);
  const rawSettings = options.input ? JSON.parse(await readFile(resolve(options.input), 'utf8')) : {
    name: 'H.15 complete package - calendar 2025 receiving', asOf: '2026-10-12',
    window: { kind: 'fixed', start: '2025-01-01', end: '2025-12-31' }, decisions: [], bindings: [],
    pageSize: 1000, maxRows: 1000000, bookmark: null,
    note: 'Complete original Federal Reserve H.15 archive and published crosswalk retained on 12 October 2026. Review all original series over calendar 2025 against the explicitly selected FRED vintage.'
  };
  const settings = migrations.normalizeFredDdpMigrationInput(rawSettings);
  const plan = migrations.buildFredDdpMigrationPlan({ packageCapture, crosswalk, ...settings });
  if (!existingState) {
    const selected = plan.acquisitions[0]?.selection;
    need(selected, 'The complete original plan has no target acquisition; review its original mapping and periods.');
    await project.initializeFredProject({ directory: projectDirectory, title: 'Federal Reserve H.15 migration workspace',
      selection: selected, apiKeyEnv: options['api-key-env'] });
  }
  const existingCrosswalkOperation = existingState?.operations.find(item =>
    ['ddp-crosswalk-import', 'ddp-crosswalk-capture'].includes(item.kind) && item.result.crosswalkId === crosswalk.id);
  const existingPackageOperation = existingState?.operations.find(item =>
    item.kind === 'ddp-package-import' && item.result.packageId === packageCapture.id);
  const crosswalkOperation = existingCrosswalkOperation?.id ?? 'ddp-raw-crosswalk-' + crosswalk.captureSha256;
  const packageOperation = existingPackageOperation?.id ?? 'ddp-raw-package-' + packageCapture.captureSha256;
  const crosswalkAction = async compact => {
    const request = { directory: projectDirectory, id: crosswalkOperation, expectedRevision: await currentRevision() };
    return existingCrosswalkOperation?.kind === 'ddp-crosswalk-capture'
      ? project.acquireFredDdpCrosswalk(request)
      : project.importFredDdpCrosswalk({ ...request, ...(compact ? { crosswalkId: crosswalk.id } : { capture: crosswalk }) });
  };
  const importedCrosswalk = await crosswalkAction(false);
  const importedPackage = await project.importFredDdpPackage({ directory: projectDirectory, id: packageOperation,
    expectedRevision: await currentRevision(), capture: packageCapture });
  const replayedCrosswalk = await crosswalkAction(true);
  const replayedPackage = await project.importFredDdpPackage({ directory: projectDirectory, id: packageOperation,
    expectedRevision: await currentRevision(), packageId: packageCapture.id });
  need(replayedCrosswalk.replayed === true && replayedCrosswalk.crosswalkId === importedCrosswalk.crosswalkId &&
    replayedPackage.replayed === true && replayedPackage.packageId === importedPackage.packageId,
    'The compact original source import did not replay its existing committed operation.');
  const selection = { packageId: packageCapture.id, crosswalkId: crosswalk.id, ...settings };
  const preview = await project.previewFredDdpMigration({ directory: projectDirectory, ...selection,
    section: 'series', offset: 0, limit: 100 });
  need(preview.migrationId === plan.id && preview.migration.summary.seriesCount === packageSummary.seriesCount,
    'The preview must include every original package series and the same complete plan.');
  await saveJson(join(work, 'original-source-manifest.json'), manifest);
  await saveJson(join(work, plan.id + '.json'), plan);
  record('original-package-prepared', { projectId: preview.projectId, revision: preview.revision,
    crosswalkId: crosswalk.id, packageId: packageCapture.id, originalFiles: Object.fromEntries(
      Object.entries(originals).map(([key, file]) => [key, { name: file.name, bytes: file.bytes, sha256: file.sha256 }])),
    crosswalkRows, packageSummary,
    migrationId: plan.id, migrationSummary: plan.summary, compactSourceImportReplayed: true,
    retainedSourcePair: Boolean(retainedPair), sourceOperationIds: { crosswalk: crosswalkOperation, package: packageOperation } });
  need(plan.summary.ready, 'The retained complete migration plan contains original mapping or period decisions to resolve: ' + plan.id + '.json');
  const saved = await project.saveFredDdpMigration({ directory: projectDirectory, id: 'ddp-plan-' + plan.id.slice(-64),
    expectedRevision: await currentRevision(), ...selection, previewId: preview.previewId });
  need(saved.migrationId === plan.id, 'The saved migration differs from its reviewed complete original plan.');
  const preparedSummaryPath = join(work, 'prepared-' + plan.id + '-summary.json');
  const previousSummary = await optionalJson(preparedSummaryPath);
  if (previousSummary) {
    const previousIdentity = await fileIdentity(previousSummary.preparedProject.path);
    need(previousSummary.migrationId === plan.id && previousSummary.projectId === preview.projectId &&
      previousIdentity.bytes === previousSummary.preparedProject.bytes && previousIdentity.sha256 === previousSummary.preparedProject.sha256,
      'The original prepared project file or source selection changed.');
    record('native-project-prepared', { ...previousSummary, replayed: true, currentRevision: await currentRevision() });
    return previousSummary;
  }
  const bundle = await project.exportFredProject({ directory: projectDirectory, qcewSourceContexts: contexts });
  const artifact = await saveJson(join(work, 'prepared-' + plan.id + '.json'), bundle);
  const result = { projectId: bundle.state.id, revision: bundle.state.revision, schema: bundle.schema,
    migrationId: plan.id, summary: plan.summary, bundleSha256: bundle.bundleSha256, preparedProject: artifact };
  await saveJson(preparedSummaryPath, result);
  record('native-project-prepared', result);
  return result;
}
async function complete() {
  await receiveInput();
  const state = await project.readFredProject(projectDirectory), choices = state.ddpMigrations ?? [];
  const migrationId = options.migration ?? (choices.length === 1 ? choices[0].id : null);
  need(typeof migrationId === 'string' && choices.some(item => item.id === migrationId), 'Select the exact retained complete migration ID.');
  const planFile = await project.downloadFredDdpMigration({ directory: projectDirectory, migrationId });
  const plan = JSON.parse(planFile.body.toString('utf8'));
  need(plan.summary.ready, 'The retained migration must include its complete reviewed mapping and observation window.');
  const alfred = options['source-mode'] === 'ALFRED_VINTAGE';
  let metadata, metadataSha256, selectedOperation;
  if (alfred) {
    if (options.metadata) {
      const handle = await open(resolve(options.metadata), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      try {
        const info = await handle.stat();
        need(info.isFile() && info.size <= 64 * 1024 * 1024, 'Choose the complete original metadata file within its64MiB capacity.');
        const bytes = await handle.readFile();
        need(bytes.length === info.size, 'The original historical metadata file changed while reading.');
        metadata = JSON.parse(bytes.toString('utf8'));
      } finally { await handle.close(); }
      need(Array.isArray(metadata), 'Historical metadata must be the complete original edition array.');
      const { readFredAlfredMetadata } = await import(pathToFileURL(join(sourceRoot, FRED, 'alfred/model.mjs')).href);
      const selectedSeries = new Set(plan.acquisitions.flatMap(item => item.selection.series));
      const seen = new Set();
      for (const edition of metadata) {
        const series = edition?.series?.value;
        need(typeof series === 'string' && selectedSeries.has(series) && !seen.has(series),
          'Keep one historical metadata edition per actual planned FRED series.');
        seen.add(series);
        readFredAlfredMetadata(edition, { series, vintage: plan.input.asOf });
      }
      metadata = [...metadata].sort((a, b) => a.series.value < b.series.value ? -1 : a.series.value > b.series.value ? 1 : 0);
      metadataSha256 = hash(model.canonical(metadata));
    }
    const candidates = [...state.operations.map(item => ({ ...item, payload: item.result })), ...(state.pending ? [state.pending] : [])];
    if (options.acquisition) {
      selectedOperation = candidates.find(item => item.id === options.acquisition);
      need(selectedOperation?.kind === 'ddp-migration-acquire' && selectedOperation.payload?.migrationId === migrationId &&
        selectedOperation.payload?.sourceMode === 'ALFRED_VINTAGE' && SHA.test(selectedOperation.payload?.metadataSha256 ?? ''),
        'Select the original retained ALFRED acquisition for this migration.');
    } else if (metadata === undefined && state.pending?.kind === 'ddp-migration-acquire' &&
        state.pending.payload?.migrationId === migrationId && state.pending.payload?.sourceMode === 'ALFRED_VINTAGE') {
      selectedOperation = state.pending;
    }
    if (selectedOperation) {
      need(metadataSha256 === undefined || metadataSha256 === selectedOperation.payload.metadataSha256,
        'Continue the original acquisition with the same complete metadata editions.');
      metadataSha256 = selectedOperation.payload.metadataSha256;
    } else metadataSha256 ??= hash(model.canonical([]));
  }
  const operationId = alfred ? selectedOperation?.id ?? 'ddp-alfred-' + hash(model.canonical({
    migrationId, sourceMode: 'ALFRED_VINTAGE', metadataSha256
  })) : 'ddp-observations-' + plan.id.slice(-64);
  need(alfred || options.acquisition === undefined || options.acquisition === operationId,
    'Continue the original API acquisition ID for this saved migration.');
  const completed = state.operations.find(item => item.id === operationId);
  need(alfred || completed || typeof process.env[state.apiKeyEnv] === 'string' && process.env[state.apiKeyEnv].trim().length > 0,
    'Run this same prepared project in the existing native environment carrying ' + state.apiKeyEnv + '.');
  const artifactId = alfred ? operationId : migrationId;
  const targetReceiver = alfred ? join(work, 'received-' + operationId) : receiverDirectory;
  const originDirectory = alfred ? join(work, 'reports-origin', operationId) : join(work, 'reports-origin');
  const receivedDirectory = alfred ? join(work, 'reports-received', operationId) : join(work, 'reports-received');
  const expectedRevision = state.pending?.id === operationId ? state.pending.expectedRevision : state.revision;
  let requests = 0;
  const measuredFetch = async (...args) => { requests++; return fetch(...args); };
  const interruptionPath = join(work, 'interruption-' + artifactId + '.json');
  let interruption = await optionalJson(interruptionPath);
  const request = { directory: projectDirectory, id: operationId, expectedRevision, migrationId,
    ...(alfred ? { sourceMode: 'ALFRED_VINTAGE', metadataSha256, ...(metadata === undefined ? {} : { metadata }) } : {}) };
  record('native-acquisition-selected', { operationId, migrationId, expectedRevision,
    sourceMode: alfred ? 'ALFRED_VINTAGE' : 'API_VINTAGE', ...(alfred ? { metadataSha256 } : {}) });
  let acquired;
  if (!completed && options.interruption > 0 && !interruption) {
    const controller = new AbortController();
    let successfulResponses = 0;
    const interruptingFetch = async (...args) => {
      if (successfulResponses >= options.interruption) {
        const reason = Object.assign(new Error('Native receiving journey interruption after complete original responses.'),
          { code: 'FRED_NATIVE_JOURNEY_INTERRUPTION' });
        controller.abort(reason); throw reason;
      }
      const response = await measuredFetch(...args);
      if (response.ok) successfulResponses++;
      return response;
    };
    try { acquired = await project.acquireFredDdpMigration({ ...request, signal: controller.signal, fetchImpl: interruptingFetch }); }
    catch (error) {
      if (!controller.signal.aborted) throw error;
      const pending = await project.readFredProject(projectDirectory);
      need(pending.pending?.id === operationId && pending.pending.kind === 'ddp-migration-acquire' &&
        pending.revision === expectedRevision, 'The interrupted native acquisition lost its original pending operation.');
      interruption = { operationId, migrationId, successfulResponses, retainedRevision: pending.revision,
        pendingKind: pending.pending.kind, pendingFingerprint: pending.pending.fingerprint,
        lastErrorCode: pending.pending.lastError?.code ?? null };
      await saveJson(interruptionPath, interruption);
      record('original-operation-retained', interruption);
    }
  }
  acquired ??= await project.acquireFredDdpMigration({ ...request, fetchImpl: measuredFetch });
  const finalState = await project.readFredProject(projectDirectory);
  need(!finalState.pending && acquired.migrationId === migrationId && SHA.test(acquired.receivingId.slice(-64)),
    'The native migration did not complete its original operation and receiving result.');
  const replay = await project.acquireFredDdpMigration({ ...request, expectedRevision: finalState.revision, fetchImpl: measuredFetch });
  need(replay.replayed === true && replay.receivingId === acquired.receivingId,
    'The completed native acquisition did not replay its original saved report.');
  if (alfred) need(acquired.sourceMode === 'ALFRED_VINTAGE' && acquired.metadataSha256 === metadataSha256,
    'The completed receiving must retain this exact historical source mode and metadata identity.');
  const completedSummaryPath = join(work, 'completed-' + artifactId + '-summary.json');
  if (alfred) {
    const previous = await optionalJson(completedSummaryPath);
    if (previous) {
      need(previous.projectId === finalState.id && previous.migrationId === migrationId &&
        previous.operationId === operationId && previous.receivingId === acquired.receivingId &&
        previous.sourceMode === 'ALFRED_VINTAGE' && previous.metadataSha256 === metadataSha256,
        'The original historical receiving summary changed its source or result identity.');
      const completeIdentity = await fileIdentity(previous.completeProject.path);
      need(completeIdentity.bytes === previous.completeProject.bytes &&
        completeIdentity.sha256 === previous.completeProject.sha256,
        'The original complete historical project artifact changed.');
      for (const group of ['origin', 'received']) for (const file of previous.reports[group]) {
        const retained = acquired.receiving.files.find(item => item.path === basename(file.path));
        const actual = await fileIdentity(file.path);
        need(retained && retained.bytes === file.bytes && retained.sha256 === file.sha256 &&
          actual.bytes === file.bytes && actual.sha256 === file.sha256,
          'The retained complete historical receiving files changed.');
      }
      record('native-project-receiving-complete', { ...previous, replayed: true,
        currentRevision: finalState.revision, originalHttpRequestsThisInvocation: requests });
      return previous;
    }
  }
  const originReports = [];
  for (const format of ['json', 'csv', 'html']) {
    const value = await project.downloadFredDdpReceiving({ directory: projectDirectory, receivingId: acquired.receivingId, format });
    need(value.bytes === value.body.length && value.sha256 === hash(value.body), 'The original receiving file differs from its saved byte identity.');
    originReports.push(await exactFile(join(originDirectory, value.path), value.body));
  }
  let bundle = await project.exportFredProject({ directory: projectDirectory, qcewSourceContexts: contexts });
  const completeArtifact = await saveJson(join(work, 'complete-' + artifactId + '.json'), bundle);
  const originalBundle = { schema: bundle.schema, bundleSha256: bundle.bundleSha256,
    qcew: bundle.qcew ? { sourceCaptures: bundle.qcew.captures.length, editions: bundle.qcew.editions.length } : null };
  bundle = null;
  const received = await receiveBundleFile(completeArtifact.path, targetReceiver);
  need(received.inputBytes === completeArtifact.bytes && received.inputSha256 === completeArtifact.sha256,
    'The complete on-disk project changed before receiving.');
  const reopened = await project.readFredProject(targetReceiver);
  need(reopened.id === finalState.id && reopened.revision === finalState.revision && !reopened.pending,
    'The receiving directory lost the complete original project identity, revision or completed state.');
  const receivedReports = [];
  for (const [index, format] of ['json', 'csv', 'html'].entries()) {
    const value = await project.downloadFredDdpReceiving({ directory: targetReceiver, receivingId: acquired.receivingId, format });
    const original = originReports[index];
    const originalIdentity = await fileIdentity(original.path);
    need(value.bytes === original.bytes && value.sha256 === original.sha256 && hash(value.body) === original.sha256 &&
      originalIdentity.bytes === original.bytes && originalIdentity.sha256 === original.sha256,
      'The received original ' + format + ' report changed.');
    receivedReports.push(await exactFile(join(receivedDirectory, value.path), value.body));
  }
  const rawCrosswalk = await project.getFredDdpCrosswalk({ directory: targetReceiver, crosswalkId: plan.crosswalkId });
  const rawPackage = await project.getFredDdpPackage({ directory: targetReceiver, packageId: plan.packageId });
  for (const original of [rawCrosswalk, rawPackage])
    need(hash(Buffer.from(original.file.base64, 'base64')) === original.file.sha256,
      'The received complete original Board source bytes changed.');
  const receivedPlan = await project.downloadFredDdpMigration({ directory: targetReceiver, migrationId });
  need(receivedPlan.body.equals(planFile.body), 'The receiving directory changed the full reviewed migration plan.');
  const reexported = await project.exportFredProject({ directory: targetReceiver, qcewSourceContexts: contexts });
  const reexportedIdentity = jsonIdentity(reexported);
  need(reexported.bundleSha256 === originalBundle.bundleSha256 &&
    reexportedIdentity.bytes === completeArtifact.bytes && reexportedIdentity.sha256 === completeArtifact.sha256,
    'The complete original project changed after separate receiving and reopening.');
  const result = { projectId: finalState.id, revision: finalState.revision, schema: originalBundle.schema,
    migrationId, receivingId: acquired.receivingId, receivingSummary: acquired.receiving.summary,
    ...(alfred ? { operationId, sourceMode: 'ALFRED_VINTAGE', metadataSha256 } : {}),
    captureIds: acquired.captureIds, originalHttpRequestsThisInvocation: requests, interruption,
    compactSourceImportAndCompletedAcquisitionReplay: true, bundleSha256: originalBundle.bundleSha256,
    completeProject: completeArtifact, receivedProjectId: received.projectId ?? reopened.id,
    reports: { origin: originReports, received: receivedReports },
    originalSourceBytesPreserved: true, fullPlanBytesPreserved: true, fullProjectBytesPreserved: true,
    qcew: originalBundle.qcew };
  const previous = await optionalJson(completedSummaryPath);
  if (previous) {
    need(previous.projectId === result.projectId && previous.migrationId === result.migrationId &&
      previous.receivingId === result.receivingId && previous.bundleSha256 === result.bundleSha256,
      'The original completed receiving summary changed its source or result identity.');
    record('native-project-receiving-complete', { ...previous, replayed: true });
    return previous;
  }
  await saveJson(completedSummaryPath, result);
  record('native-project-receiving-complete', result);
  return result;
}
try {
  if (options.phase === 'prepare') await prepare(); else await complete();
} catch (error) {
  const key = process.env[options['api-key-env']];
  const message = String(error.message ?? error);
  record('native-operation-error', { phase: options.phase, code: error.code ?? 'FRED_NATIVE_OPERATION',
    message: key ? message.split(key).join('[private]') : message,
    workDirectory: work });
  process.exitCode = 1;
}
