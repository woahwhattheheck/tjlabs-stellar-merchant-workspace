// MIT. Complete original GSA semantic receiving through the existing Merchant workspace.
import { readFile, writeFile, mkdir, stat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, dirname, basename, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const PREFIX = 'stellar/scf-starforge-20261009/sf30-seller-sdk/ckan';
const OPERATION = 'DCAT-SEMANTIC-VALIDATION-390E-20261013';
const RECIPIENT_NOTE = "The independent receiving workspace reopened the complete source, profile, run, findings and original artifacts. This local receiving note extends review history without changing the sender or native SHACL result.";
const PROFILE_SOURCES = {
  "build/dcat-us-3.0.context.jsonld": {
    "sha256": "b08b049c2bbb96598bbc0e0c2fe621b8705865dab278a7310ee7ba67a9ec46f6",
    "bytes": 14228
  },
  "build/dcat-us-3.0.observed.context.jsonld": {
    "sha256": "de133c46e7a4068e134eda175d87c7ea6aefdf95528a99ed6fff9f688a8c4a9b",
    "bytes": 13264
  },
  "build/dcat-us-3.0-shapes.ttl": {
    "sha256": "19da736a8018e5d29fcd5c300872eeb2b89bfa1a51cf60923dc6e53eeeb57910",
    "bytes": 77273
  },
  "build/audit.json": {
    "sha256": "c42b95cb4066c1df5f76e4f5ee5c6a3926819b121b228fbe23573b8566a1a44c",
    "bytes": 13667
  },
  "README.md": {
    "sha256": "079cba1b47ce7879a61aa654ad1c290809c491017afbaa9a60bda9d8d666e755",
    "bytes": 8102
  },
  "LICENSE": {
    "sha256": "8aecab11d51f3cf7b43440859eb51e7a256f294a648a11b4ed224e9e91ce18bd",
    "bytes": 1068
  }
};
const ORIGINAL_CASE = {
  "schema": "lda-dcat-local-case-v1",
  "case_id": "DCAT-GSA-MIGRATION-20261012-390E",
  "title": "GSA DCAT migration — original 344-record case",
  "origin": {
    "operation": "DCAT-GSA-MIGRATION-20261012-390E",
    "source_commit": "4996591483b52f4ccc0cb72c42e4ec3fe59a4b06",
    "engine_sha256": "2b6979da9f9554427d772607790b6b29843b1a1190c263b3ebf2b4851e751a3d",
    "original_engine_sha256": "5f6f94e6d270338fedced59deadd97cd3bc2725ab70993dc65588822cadc4fc7",
    "run_manifest_sha256": "ca6b957dbeb73433df5a0a258bd3c9ee5465fc892e8f5fd4a7ea477fda0d1fef",
    "original_operation_packet_sha256": "c39685031da3c6fd04bd3d6010b5ba0ddf17248823808a9a72cceb6ef6b586d4"
  },
  "files": [
    {
      "path": "originals/legacy-data.json",
      "role": "catalog",
      "mime_type": "application/json",
      "bytes": 551258,
      "sha256": "2eb635ae55e1a42904d084fa97a5bfdff870cf1421695752619de462fa351f46"
    },
    {
      "path": "originals/current-data.json",
      "role": "catalog",
      "mime_type": "application/json",
      "bytes": 756457,
      "sha256": "b933be0d3bdf9f076a7ac5e493f71c97c073c6e73dfe1737e332736f24bfc34c"
    },
    {
      "path": "operation-driver.py",
      "role": "other",
      "mime_type": "text/x-python",
      "bytes": 12071,
      "sha256": "21c5f61bec4cc8a540a075177b1eb4f2cd174b081ea9de260be9cb7a0fec55ff"
    },
    {
      "path": "01-legacy-migration/request.json",
      "role": "other",
      "mime_type": "application/json",
      "bytes": 1743735,
      "sha256": "218caec0a5927448a8872ad4c1cc0f582dfd9b6799d6980d330d5f1d02bdeeca"
    },
    {
      "path": "01-legacy-migration/stdout.json",
      "role": "review",
      "mime_type": "application/json",
      "bytes": 5871428,
      "sha256": "e5762e86c76ba6a57f6335c4463df611ed254ec7305049e415cf237a1a7c421d"
    },
    {
      "path": "01-legacy-migration/stderr.txt",
      "role": "other",
      "mime_type": "text/plain",
      "bytes": 0,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    {
      "path": "01-legacy-migration/candidate.json",
      "role": "candidate",
      "mime_type": "application/json",
      "bytes": 789204,
      "sha256": "dfd5360448b12c813daafdff087285b30be0577ccd9af7e06742d76e29225df9"
    },
    {
      "path": "02-current-preservation/request.json",
      "role": "other",
      "mime_type": "application/json",
      "bytes": 1008665,
      "sha256": "33aca484e296e3f9f0d56805b16155b37777e14e2e5460c20ced386d4a737e8c"
    },
    {
      "path": "02-current-preservation/stdout.json",
      "role": "review",
      "mime_type": "application/json",
      "bytes": 2462139,
      "sha256": "f1b83fd941274032904c2f14f318cd18651fe455124a4796655afd3abb682ca4"
    },
    {
      "path": "02-current-preservation/stderr.txt",
      "role": "other",
      "mime_type": "text/plain",
      "bytes": 0,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    {
      "path": "02-current-preservation/candidate.json",
      "role": "candidate",
      "mime_type": "application/json",
      "bytes": 756457,
      "sha256": "b933be0d3bdf9f076a7ac5e493f71c97c073c6e73dfe1737e332736f24bfc34c"
    },
    {
      "path": "01-legacy-migration/direct-original-output.json",
      "role": "candidate",
      "mime_type": "application/json",
      "bytes": 789204,
      "sha256": "dfd5360448b12c813daafdff087285b30be0577ccd9af7e06742d76e29225df9"
    },
    {
      "path": "01-legacy-migration/direct-original-messages.txt",
      "role": "other",
      "mime_type": "text/plain",
      "bytes": 27,
      "sha256": "6e364e87e161a9f1ce44b5a47e661d71aa50fa611946bb8f9e3026389fa70fc5"
    },
    {
      "path": "03-reviewed-candidate/proposed-identifier-changes.json",
      "role": "other",
      "mime_type": "application/json",
      "bytes": 4179,
      "sha256": "43955263a5f916867d3d053ef09400bc83f228c740ea8f64d364fde74aea214d"
    },
    {
      "path": "03-reviewed-candidate/edited-input.json",
      "role": "candidate",
      "mime_type": "application/json",
      "bytes": 789521,
      "sha256": "cc4792b65d3da562b597a6868de16b2333473c1c280ea1c33f885a52562431e9"
    },
    {
      "path": "03-reviewed-candidate/identity-mappings.json",
      "role": "identity_mappings",
      "mime_type": "application/json",
      "bytes": 2215,
      "sha256": "244c7143e63d9cafb7b62e6510eea523d764d692bf7de53e91dff97521722a8a"
    },
    {
      "path": "03-reviewed-candidate/request.json",
      "role": "other",
      "mime_type": "application/json",
      "bytes": 2798830,
      "sha256": "d91cd15b70b6eb034f27798220914bfa0dc00dd269e081ccf68e982f3df92cde"
    },
    {
      "path": "03-reviewed-candidate/stdout.json",
      "role": "review",
      "mime_type": "application/json",
      "bytes": 7678979,
      "sha256": "c9a26709ba891954af68850a87a30e376f0e19e5c558bfd4c239ce6c987e2229"
    },
    {
      "path": "03-reviewed-candidate/stderr.txt",
      "role": "other",
      "mime_type": "text/plain",
      "bytes": 0,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    {
      "path": "03-reviewed-candidate/candidate.json",
      "role": "candidate",
      "mime_type": "application/json",
      "bytes": 789521,
      "sha256": "cc4792b65d3da562b597a6868de16b2333473c1c280ea1c33f885a52562431e9"
    },
    {
      "path": "03-reviewed-candidate/original-converter-output.json",
      "role": "candidate",
      "mime_type": "application/json",
      "bytes": 789204,
      "sha256": "dfd5360448b12c813daafdff087285b30be0577ccd9af7e06742d76e29225df9"
    }
  ]
};
const sha = raw => createHash('sha256').update(raw).digest('hex');
const encoded = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const need = (ok, code, message = code) => { if (!ok) throw Object.assign(new Error(message), { code }); };
const safeError = error => ({ code: error?.code ?? error?.name ?? 'CUSTOMER_OPERATION_FAILED',
  message: String(error?.message ?? error).slice(0, 4000) });
async function exists(path) { try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
function relative(path) {
  need(typeof path === 'string' && !path.startsWith('/') && !path.includes('\\') &&
    path.split('/').every(part => part && part !== '.' && part !== '..'), 'CUSTOMER_MEMBER_INVALID');
  return path;
}
async function original(path, descriptor) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    need(before.isFile() && before.nlink === 1 && before.size === descriptor.bytes, 'CUSTOMER_SOURCE_SIZE_CHANGED');
    const raw = await handle.readFile(), after = await handle.stat();
    need(raw.length === before.size && before.size === after.size && before.mtimeMs === after.mtimeMs &&
      before.ctimeMs === after.ctimeMs && sha(raw) === descriptor.sha256, 'CUSTOMER_SOURCE_CHANGED', path);
    return raw;
  } finally { await handle.close(); }
}
async function once(path, raw) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try { await writeFile(path, raw, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; need((await readFile(path)).equals(raw), 'CUSTOMER_OUTPUT_CHANGED', path); }
}
function publicSource(file) {
  return { path: file.path, bytes: file.bytes, sha256: file.sha256, role: file.role };
}
/**
 * domainRoot is the extracted original native-results/ directory. No migration
 * is repeated: all 21 original artifacts become nonexecuted profile attachments.
 * Native RDF snapshot/query/SHACL run on the two complete original catalogues.
 */
export async function runDcatSemanticCustomer({ sourceRoot, domainRoot, outputDirectory,
  binding, baseIRI, python, limits = { timeout_seconds: 600, memory_mib: 2048 },
  sourceCommit = null } = {}) {
  for (const path of [sourceRoot, domainRoot, outputDirectory, python])
    need(typeof path === 'string' && isAbsolute(path), 'CUSTOMER_ABSOLUTE_PATH_REQUIRED');
  need(['faithful', 'observed'].includes(binding), 'CUSTOMER_EXPLICIT_BINDING_REQUIRED');
  need(typeof baseIRI === 'string' && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(baseIRI),
    'CUSTOMER_EXPLICIT_BASE_IRI_REQUIRED');
  sourceRoot = resolve(sourceRoot); domainRoot = resolve(domainRoot); outputDirectory = resolve(outputDirectory);
  const ckan = join(sourceRoot, PREFIX), vendor = join(ckan, 'vendor', 'dcat-us-binding');
  const files = await import(pathToFileURL(join(ckan, '../postgres/publisher/files.mjs')).href);
  const { openCkanWorkbench } = await import(pathToFileURL(join(ckan, 'model.mjs')).href);
  const { receiveCkanWorkspaceArchive } = await import(pathToFileURL(join(ckan, 'archive.mjs')).href);
  const { validateDcatSemanticFiles } = await import(pathToFileURL(join(ckan, 'dcat-semantic.mjs')).href);
  const { parseCkanJson } = await import(pathToFileURL(join(ckan, 'capture.mjs')).href);
  await files.privateDirectory(outputDirectory, true);
  const out = outputDirectory, producerDirectory = join(out, 'producer'), recipientDirectory = join(out, 'recipient');
  const environment = { ...process.env, SCF_DCAT_SEMANTIC_PYTHON: python };
  const selected = { schema: 'commons.dcat-semantic-customer-selection.v1', operation: OPERATION,
    sourceRoot, declaredSourceCommit: sourceCommit, domainRoot, producerDirectory, recipientDirectory,
    binding, baseIRI, python, limits, originalCase: ORIGINAL_CASE,
    profileSources: PROFILE_SOURCES };
  await once(join(out, 'selection.json'), encoded(selected));
  let ledger = { schema: 'commons.dcat-semantic-customer-progress.v1', operation: OPERATION, phases: {} };
  if (await exists(join(out, 'progress.json'))) ledger = await files.readJson(join(out, 'progress.json'), 33554432);
  need(ledger.schema === 'commons.dcat-semantic-customer-progress.v1' && ledger.operation === OPERATION,
    'CUSTOMER_PROGRESS_CHANGED');
  const persist = () => files.atomicJson(out, 'progress.json', ledger);
  const save = (name, value) => files.atomicJson(out, name, value);
  const result = { schema: 'commons.dcat-semantic-customer-result.v1', operation: OPERATION,
    startedAt: new Date().toISOString(), complete: false, inputs: [], source: [], cases: [], downloads: [],
    archive: null, receiving: null, coldReopen: null, recipientReview: null, errors: [], cleanup: [] };
  let producer = null, recipient = null;
  async function phase(name, start, recover) {
    const prior = ledger.phases[name];
    if (prior?.complete) return prior.result;
    if (prior?.selection && recover) {
      const recovered = await recover(prior.selection);
      ledger.phases[name] = { ...prior, complete: true, result: recovered, recoveredAt: new Date().toISOString() };
      await persist(); return recovered;
    }
    const launched = await start();
    need(launched && typeof launched.id === 'string' && launched.completion, 'CUSTOMER_NATIVE_LAUNCH_REQUIRED');
    const selection = Object.fromEntries(Object.entries(launched).filter(([key]) => key !== 'completion'));
    ledger.phases[name] = { selection, startedAt: new Date().toISOString() }; await persist();
    const operation = await launched.completion;
    await save('operation-' + operation.id + '.json', operation);
    need(operation.state === 'COMPLETE', 'CUSTOMER_ORIGINAL_OPERATION_FAILED',
      operation.error?.message ?? operation.error?.code ?? operation.state);
    ledger.phases[name] = { ...ledger.phases[name], complete: true, result: operation.result,
      operationId: operation.id, completedAt: new Date().toISOString() };
    await persist(); return operation.result;
  }
  async function closeOwner(name) {
    const owner = name === 'producer' ? producer : recipient;
    if (!owner) return;
    try {
      await owner.close(); result.cleanup.push({ owner: name, closed: true, at: new Date().toISOString() });
      if (name === 'producer') producer = null; else recipient = null;
    } catch (error) {
      result.cleanup.push({ owner: name, closed: false, error: safeError(error) }); throw error;
    }
  }
  async function retainDownload(model, selection, scope, destination) {
    const descriptor = await model.dcatSemanticDownload(selection);
    const originalIdentity = await files.hashPrivate(descriptor.file, 2147483648);
    need(originalIdentity.hash === descriptor.sha256 && originalIdentity.bytes === descriptor.bytes,
      'CUSTOMER_DOWNLOAD_CHANGED');
    const target = join(out, 'downloads', scope, destination);
    // Streaming copy retains complete potentially large failed native artifacts.
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const source = await open(descriptor.file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const handle = await open(target, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try {
      const existing = await handle.stat();
      need(existing.isFile() && existing.nlink === 1 && !(existing.mode & 0o077) &&
        existing.size <= descriptor.bytes, 'CUSTOMER_DOWNLOAD_DESTINATION_CHANGED');
      const buffer = Buffer.alloc(1048576), prior = Buffer.alloc(1048576);
      let offset = 0;
      // Resume only this exact already-retained source prefix, without discarding partial bytes.
      while (offset < existing.size) {
        const length = Math.min(buffer.length, existing.size - offset);
        const left = await source.read(buffer, 0, length, offset);
        const right = await handle.read(prior, 0, length, offset);
        need(left.bytesRead === length && right.bytesRead === length &&
          buffer.subarray(0, length).equals(prior.subarray(0, length)), 'CUSTOMER_DOWNLOAD_PREFIX_CHANGED');
        offset += length;
      }
      for (;;) {
        const read = await source.read(buffer, 0, buffer.length, offset); if (!read.bytesRead) break;
        let written = 0;
        while (written < read.bytesRead) {
          const part = await handle.write(buffer, written, read.bytesRead - written, offset + written);
          need(part.bytesWritten > 0, 'CUSTOMER_DOWNLOAD_WRITE_FAILED'); written += part.bytesWritten;
        }
        offset += read.bytesRead;
      }
      await handle.sync();
    } finally { await source.close(); await handle.close(); }
    const copied = await files.hashPrivate(target, 2147483648);
    need(copied.hash === descriptor.sha256 && copied.bytes === descriptor.bytes, 'CUSTOMER_DOWNLOAD_COPY_CHANGED');
    const receipt = { scope, selection, name: descriptor.downloadName, bytes: copied.bytes,
      sha256: copied.hash, file: target };
    result.downloads.push(receipt); return receipt;
  }
  async function profileDownloads(model, profile, scope) {
    await retainDownload(model, { kind: 'profile', id: profile.id }, scope, 'profile.json');
    for (const file of [profile.context, ...profile.shapes, ...profile.ontologies, ...profile.attachments])
      await retainDownload(model, { kind: 'profile-file', id: profile.id, key: file.key }, scope,
        'profile-files/' + file.key + '-' + file.name);
  }
  async function runDownloads(model, run, scope) {
    await retainDownload(model, { kind: 'run', id: run.id }, scope, 'run.json');
    for (const file of run.artifacts)
      await retainDownload(model, { kind: 'artifact', id: run.id, key: file.key }, scope,
        'artifacts/' + file.key + '-' + (file.downloadName ?? basename(file.path)));
    for (const review of run.reviews ?? [])
      await retainDownload(model, { kind: 'review', id: review.id }, scope, 'review-' + review.id + '.json');
  }
  async function findings(model, run, scope) {
    let offset = 0, total = null, collected = 0, availability = null;
    const pages = [];
    for (;;) {
      const page = await model.dcatSemanticFindings({ runId: run.id, offset, limit: 100 });
      need(page.runSha256 === run.runSha256 && page.page.offset === offset, 'CUSTOMER_FINDINGS_BINDING_CHANGED');
      if (total === null) total = page.page.total;
      need(page.page.total === total, 'CUSTOMER_FINDINGS_TOTAL_CHANGED');
      availability = page.availability; collected += page.findings.length;
      const file = join(out, 'findings', scope, String(offset).padStart(8, '0') + '.json');
      await once(file, encoded(page)); pages.push({ file, offset, count: page.findings.length });
      if (page.page.nextOffset === null) break;
      need(page.page.nextOffset > offset, 'CUSTOMER_FINDINGS_CURSOR_INVALID'); offset = page.page.nextOffset;
    }
    need(collected === total, 'CUSTOMER_FINDINGS_INCOMPLETE');
    return { availability, total, collected, pages };
  }
  try {
    // Verify the complete original case before any project mutation.
    const originals = [];
    for (const descriptor of ORIGINAL_CASE.files) {
      const path = join(domainRoot, relative(descriptor.path)), raw = await original(path, descriptor);
      originals.push({ ...descriptor, absolutePath: path, raw });
      result.inputs.push(publicSource(descriptor));
    }
    for (const name of ['model.mjs', 'dcat-workspace.mjs', 'dcat-semantic.mjs', 'dcat-semantic-native.mjs',
      'dcat_semantic_prepare.py', 'archive.mjs', 'vendor/semantic-operator/source-manifest.json',
      'vendor/semantic-operator/selected-runtime.json']) {
      const raw = await readFile(join(ckan, name));
      result.source.push({ path: PREFIX + '/' + name, bytes: raw.length, sha256: sha(raw) });
    }
    await save('actual-source.json', result.source);
    const contextName = binding === 'faithful' ? 'build/dcat-us-3.0.context.jsonld' :
      'build/dcat-us-3.0.observed.context.jsonld';
    const nativeFile = async (name, format) => {
      const identity = PROFILE_SOURCES[name], raw = await original(join(vendor, name), identity);
      return { name: basename(name), bytes: raw.length, sha256: sha(raw), contentBase64: raw.toString('base64'),
        ...(format ? { format } : {}) };
    };
    const context = await nativeFile(contextName), shapes = [await nativeFile('build/dcat-us-3.0-shapes.ttl', 'turtle')];
    const attachments = [];
    for (const name of ['build/audit.json', 'README.md', 'LICENSE']) attachments.push({
      ...await nativeFile(name), mediaType: name.endsWith('.json') ? 'application/json' : 'text/plain' });
    for (const [index, source] of originals.entries()) attachments.push({
      name: String(index + 1).padStart(2, '0') + '-' + source.path.replaceAll('/', '--'),
      bytes: source.bytes, sha256: source.sha256, contentBase64: source.raw.toString('base64'),
      mediaType: source.mime_type });
    await save('original-inputs.json', { schema: ORIGINAL_CASE.schema, origin: ORIGINAL_CASE.origin,
      files: result.inputs, exactOriginalCount: originals.length });
    producer = await openCkanWorkbench({ directory: producerDirectory, create: true,
      sourceKind: 'dcat-us', origin: 'https://open.gsa.gov', environment });
    const before = producer.status();
    need(before.dcat.activeReleaseId === null && before.dcat.releases.length === 0, 'CUSTOMER_RELEASE_SCOPE_CHANGED');
    const selectedCatalogs = originals.filter(file => file.role === 'catalog');
    need(selectedCatalogs.length === 2, 'CUSTOMER_ORIGINAL_CATALOGUES_CHANGED');
    let precedingProfileId = null;
    for (const [index, source] of selectedCatalogs.entries()) {
      const caseName = index === 0 ? 'legacy' : 'current';
      const data = parseCkanJson(source.raw);
      need(Array.isArray(data.dataset) && data.dataset.length === 344, 'CUSTOMER_ORIGINAL_344_CHANGED');
      const contextMode = caseName === 'legacy' ? 'replace-root' : 'require-absent';
      need((Object.hasOwn(data, '@context')) === (caseName === 'legacy'), 'CUSTOMER_SOURCE_CONTEXT_CHANGED');
      const catalog = await phase('catalog-' + caseName,
        () => producer.importDcatCatalog({ file: source.absolutePath, expectedSha256: source.sha256,
          label: 'Original GSA ' + caseName + ' 344-record edition', profile: caseName === 'legacy' ? '1.1' : '3.0',
          origin: 'https://gsa.gov/data.json' }),
        selected => {
          const retained = producer.status().dcat.catalogs.find(value => value.id === selected.catalogId);
          need(retained && retained.sha256 === source.sha256, 'CUSTOMER_CATALOG_RECOVERY_REQUIRED'); return retained;
        });
      const profile = await phase('profile-' + caseName,
        () => producer.importDcatSemanticProfile({ label: 'GSA ' + caseName + ': explicit ' + binding + ' binding',
          baseIRI, contextMode, context, shapes, ontologies: [], attachments,
          parameters: { inference: 'none', allow_infos: false, allow_warnings: false },
          coverageClasses: ['http://www.w3.org/ns/dcat#Catalog', 'http://www.w3.org/ns/dcat#Dataset',
            'http://www.w3.org/ns/dcat#DatasetSeries'],
          ...(precedingProfileId ? { supersedesProfileId: precedingProfileId } : {}) }),
        selected => producer.dcatSemanticProfile(selected.profileId));
      precedingProfileId = profile.id;
      const retainedProfile = await producer.dcatSemanticProfile(profile.id);
      need(retainedProfile.profileSha256 === profile.profileSha256, 'CUSTOMER_PROFILE_CHANGED');
      await profileDownloads(producer, retainedProfile, 'producer-' + caseName);
      const completed = await phase('run-' + caseName,
        () => producer.startDcatSemanticRun({ profileId: profile.id, expectedProfileSha256: profile.profileSha256,
          catalogId: catalog.id, expectedSourceSha256: source.sha256, limits }),
        selected => producer.dcatSemanticRun(selected.runId));
      let run = await producer.dcatSemanticRun(completed.id);
      need(run.selection.sha256 === source.sha256 && run.profileSha256 === profile.profileSha256,
        'CUSTOMER_RUN_SELECTION_CHANGED');
      const viewed = await findings(producer, run, 'producer-' + caseName);
      const acknowledgement = await phase('review-' + caseName,
        () => producer.reviewDcatSemanticRun({ runId: run.id, expectedRunSha256: run.runSha256,
          expectedReviewSha256: run.reviews.at(-1)?.reviewSha256 ?? null, decision: 'ACKNOWLEDGE',
          note: 'Received the complete original ' + caseName + ' catalogue semantic result and all artifacts. ' +
            'This records inspection of the explicitly selected ' + binding + ' binding and its source audit. ' +
            'Native class presence, full SHACL target coverage, JSON-schema/conservation acceptance and release selection remain separate.' }),
        selected => {
          const retained = producer.status().dcat.semantic.reviews.find(value => value.id === selected.semanticReviewId);
          need(retained && retained.runId === run.id, 'CUSTOMER_REVIEW_RECOVERY_REQUIRED'); return retained;
        });
      run = await producer.dcatSemanticRun(run.id);
      await runDownloads(producer, run, 'producer-' + caseName);
      result.cases.push({ name: caseName, original: publicSource(source), originalRecords: data.dataset.length,
        catalogId: catalog.id, profileId: profile.id, profileSha256: profile.profileSha256,
        contextMode, baseIRI, runId: run.id, runSha256: run.runSha256, status: run.status,
        native: run.summary, findings: viewed, review: acknowledgement,
        artifacts: run.artifacts.map(({ key, path, bytes, sha256, mediaType, role }) =>
          ({ key, path, bytes, sha256, mediaType, role })) });
      await save('customer-progress-result.json', result);
    }
    const producerState = producer.status();
    need(producerState.dcat.activeReleaseId === null && producerState.dcat.releases.length === 0,
      'CUSTOMER_SEMANTIC_CHANGED_RELEASE');
    await validateDcatSemanticFiles(producerDirectory, producerState.dcat);
    await save('producer-before-transfer.json', producerState);
    const archive = await phase('archive',
      () => producer.archiveWorkspace({ out: join(out, 'complete-gsa-semantic.ckanw') }),
      async selected => {
        const retained = await producer.workspaceArchives();
        const matching = retained.find(value => value.file === join(out, 'complete-gsa-semantic.ckanw'));
        need(matching, 'CUSTOMER_ARCHIVE_RECOVERY_REQUIRED'); return matching;
      });
    const archiveFile = archive.file ?? archive.out;
    need(typeof archiveFile === 'string' && typeof archive.sha256 === 'string', 'CUSTOMER_ARCHIVE_DESCRIPTOR_INVALID');
    const archiveHash = await files.hashPrivate(archiveFile, 8589934592);
    need(archiveHash.hash === archive.sha256 && archiveHash.bytes === archive.bytes, 'CUSTOMER_ARCHIVE_CHANGED');
    result.archive = { ...archive, sourceSemantic: producerState.dcat.semantic,
      originalInputs: result.inputs };
    await save('archive-selection.json', result.archive);
    await closeOwner('producer');
    const receiving = await receiveCkanWorkspaceArchive({ file: archiveFile, directory: recipientDirectory,
      expectedSha256: archive.sha256 });
    result.receiving = receiving;
    recipient = await openCkanWorkbench({ directory: recipientDirectory, sourceKind: 'dcat-us', environment });
    const receivedState = recipient.status();
    const recipientPrior = ledger.phases['recipient-review'];
    const recipientPriorId = recipientPrior?.result?.id ?? recipientPrior?.selection?.semanticReviewId;
    const comparable = structuredClone(receivedState.dcat.semantic);
    if (recipientPriorId) {
      const originalRun = result.cases.at(-1);
      const verifiedRun = await recipient.dcatSemanticRun(originalRun.runId);
      const owned = verifiedRun.reviews.find(row => row.id === recipientPriorId);
      if (owned) {
        const previous = producerState.dcat.semantic.reviews.filter(row => row.runId === originalRun.runId).at(-1);
        need(owned.runId === originalRun.runId && owned.runSha256 === originalRun.runSha256 &&
          owned.decision === 'ACKNOWLEDGE' && owned.note === RECIPIENT_NOTE &&
          owned.previousReviewId === (previous?.id ?? null) &&
          owned.previousReviewSha256 === (previous?.reviewSha256 ?? null), 'CUSTOMER_RECIPIENT_REVIEW_CHANGED');
        comparable.reviews = comparable.reviews.filter(row => row.id !== owned.id);
      }
    }
    need(sha(encoded(comparable)) === sha(encoded(producerState.dcat.semantic)),
      'CUSTOMER_RECEIVED_SEMANTIC_HISTORY_CHANGED');
    need(sha(encoded(receivedState.dcat.catalogs)) === sha(encoded(producerState.dcat.catalogs)) &&
      receivedState.dcat.activeReleaseId === null && receivedState.dcat.releases.length === 0,
      'CUSTOMER_RECEIVED_CATALOGUE_HISTORY_CHANGED');
    await validateDcatSemanticFiles(recipientDirectory, receivedState.dcat);
    for (const selection of result.cases) {
      const profile = await recipient.dcatSemanticProfile(selection.profileId);
      const run = await recipient.dcatSemanticRun(selection.runId);
      need(run.runSha256 === selection.runSha256 && profile.profileSha256 === selection.profileSha256,
        'CUSTOMER_RECEIVED_RUN_CHANGED');
      await profileDownloads(recipient, profile, 'recipient-' + selection.name);
      await runDownloads(recipient, run, 'recipient-' + selection.name);
      const viewed = await findings(recipient, run, 'recipient-' + selection.name);
      need(viewed.total === selection.findings.total && viewed.availability === selection.findings.availability,
        'CUSTOMER_RECEIVED_FINDINGS_CHANGED');
    }
    await save('recipient-before-cold-reopen.json', recipient.status());
    await closeOwner('recipient');
    recipient = await openCkanWorkbench({ directory: recipientDirectory, sourceKind: 'dcat-us', environment });
    const cold = recipient.status();
    const previousCold = await files.readJson(join(out, 'recipient-before-cold-reopen.json'), 33554432);
    need(sha(encoded(cold.dcat)) === sha(encoded(previousCold.dcat)), 'CUSTOMER_COLD_REOPEN_CHANGED');
    result.coldReopen = { directory: recipientDirectory, projectCreatedAt: cold.createdAt,
      catalogs: cold.dcat.catalogs.length, profiles: cold.dcat.semantic.profiles.length,
      runs: cold.dcat.semantic.runs.length, reviews: cold.dcat.semantic.reviews.length,
      stateSha256: sha(encoded(cold.dcat)) };
    const last = result.cases.at(-1), selectedRun = await recipient.dcatSemanticRun(last.runId);
    result.recipientReview = await phase('recipient-review',
      () => recipient.reviewDcatSemanticRun({ runId: selectedRun.id, expectedRunSha256: selectedRun.runSha256,
        expectedReviewSha256: selectedRun.reviews.at(-1)?.reviewSha256 ?? null, decision: 'ACKNOWLEDGE',
        note: RECIPIENT_NOTE }),
      selected => {
        const found = recipient.status().dcat.semantic.reviews.find(value => value.id === selected.semanticReviewId);
        need(found, 'CUSTOMER_RECIPIENT_REVIEW_RECOVERY_REQUIRED'); return found;
      });
    await retainDownload(recipient, { kind: 'review', id: result.recipientReview.id }, 'recipient-current',
      'receiving-review.json');
    const followingArchive = await phase('recipient-archive',
      () => recipient.archiveWorkspace({ out: join(out, 'received-gsa-semantic-following.ckanw') }),
      async () => {
        const found = (await recipient.workspaceArchives()).find(value => value.file === join(out, 'received-gsa-semantic-following.ckanw'));
        need(found, 'CUSTOMER_ARCHIVE_RECOVERY_REQUIRED'); return found;
      });
    result.receiving.followingArchive = followingArchive;
    await validateDcatSemanticFiles(recipientDirectory, recipient.status().dcat);
    await closeOwner('recipient');
    producer = await openCkanWorkbench({ directory: producerDirectory, sourceKind: 'dcat-us', environment });
    need(sha(encoded(producer.status().dcat)) === sha(encoded(producerState.dcat)), 'CUSTOMER_SENDER_CHANGED');
    await closeOwner('producer');
    result.complete = result.cases.length === 2 && result.cases.every(value => value.status === 'COMPLETE') &&
      result.cleanup.every(value => value.closed);
    if (!result.complete) result.errors.push({ code: 'CUSTOMER_NATIVE_ATTEMPT_INCOMPLETE',
      message: 'Complete retained failure/interruption evidence has been received; inspect the exact native artifacts before retrying.' });
  } catch (error) {
    result.errors.push(safeError(error)); result.complete = false;
  } finally {
    for (const name of ['recipient', 'producer']) {
      try { await closeOwner(name); } catch (error) { result.errors.push(safeError(error)); result.complete = false; }
    }
    result.completedAt = new Date().toISOString();
    await save('result.json', result);
  }
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  need(args.length === 2 && args[0] === '--input', 'CUSTOMER_INPUT_REQUIRED',
    'Use node run-gsa-semantic-customer.mjs --input /absolute/private/config.json');
  const file = resolve(args[1]), info = await stat(file);
  need(info.isFile() && !(info.mode & 0o077), 'CUSTOMER_PRIVATE_INPUT_REQUIRED');
  const input = JSON.parse(await readFile(file, 'utf8'));
  const result = await runDcatSemanticCustomer(input);
  console.log(JSON.stringify({ schema: result.schema, operation: result.operation,
    complete: result.complete, cases: result.cases.map(value => ({ name: value.name, status: value.status,
      runId: value.runId, findings: value.findings.total })), resultFile: join(resolve(input.outputDirectory), 'result.json'),
    errors: result.errors }));
  process.exitCode = result.complete ? 0 : 2;
}
