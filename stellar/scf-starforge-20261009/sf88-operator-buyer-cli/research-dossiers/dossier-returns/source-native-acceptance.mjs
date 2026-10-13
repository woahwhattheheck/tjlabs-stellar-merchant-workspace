// MIT. One recoverable acceptance programme for the original Research dossier return.
import fs from 'node:fs/promises';
import {createReadStream, createWriteStream, constants} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {resolve, join, dirname, relative, isAbsolute, sep} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {parseArgs} from 'node:util';
import {registerHooks} from 'node:module';

const SCHEMA = 'sf88-research-dossier-return-native-acceptance-v1';
const MAX = 256 * 1024 * 1024;
const clone = value => structuredClone(value);
const sha = body => createHash('sha256').update(body).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function need(value, code, details = {}) {
  if (!value) throw Object.assign(new Error(code), {code, details});
}
async function ordinary(file, limit = MAX) {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    need(stat.isFile() && stat.size <= limit, 'ACCEPTANCE_FILE_INVALID', {file, limit});
    return await handle.readFile();
  } finally { await handle.close(); }
}
async function optional(file, limit = MAX) {
  try { return await ordinary(file, limit); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function privateDirectory(file) {
  need(isAbsolute(file) && resolve(file) === file, 'ACCEPTANCE_ABSOLUTE_PATH_REQUIRED', {file});
  const parts = file.split(sep).filter(Boolean);
  let current = sep;
  for (const part of parts) {
    current = join(current, part);
    try { await fs.mkdir(current, {mode: 0o700}); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    need((await fs.lstat(current)).isDirectory(), 'ACCEPTANCE_DIRECTORY_INVALID', {file: current});
  }
  return file;
}
async function retain(file, body, executable = false) {
  body = Buffer.from(body);
  await privateDirectory(dirname(file));
  const old = await optional(file);
  if (old) {
    need(old.equals(body), 'ACCEPTANCE_RETAINED_FILE_CHANGED', {file});
    return {file, bytes: body.length, sha256: sha(body)};
  }
  const temporary = join(dirname(file), '.acceptance-' + randomUUID());
  const handle = await fs.open(temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    executable ? 0o700 : 0o600);
  try {
    await handle.writeFile(body); await handle.sync(); await handle.close();
    try { await fs.link(temporary, file); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      need((await ordinary(file)).equals(body), 'ACCEPTANCE_RETAINED_FILE_CHANGED', {file});
    }
    const directory = await fs.open(dirname(file), constants.O_RDONLY | constants.O_DIRECTORY);
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await handle.close().catch(() => {}); await fs.rm(temporary, {force: true}); }
  return {file, bytes: body.length, sha256: sha(body)};
}
async function streamIdentity(file) {
  const stat = await fs.lstat(file);
  need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX, 'ACCEPTANCE_FILE_INVALID', {file});
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  need(bytes === stat.size, 'ACCEPTANCE_FILE_CHANGED', {file});
  return {file, bytes, sha256: hash.digest('hex')};
}
async function retainStream(file, stream, expected) {
  const old = await optional(file, MAX);
  if (old) {
    stream.destroy?.();
    need(old.length === expected.bytes && sha(old) === expected.sha256,
      'ACCEPTANCE_RETAINED_FILE_CHANGED', {file});
    return {file, bytes: old.length, sha256: expected.sha256};
  }
  await privateDirectory(dirname(file));
  const temporary = join(dirname(file), '.acceptance-stream-' + randomUUID());
  try {
    await pipeline(stream, createWriteStream(temporary, {flags: 'wx', mode: 0o600}));
    const measured = await streamIdentity(temporary);
    need(measured.bytes === expected.bytes && measured.sha256 === expected.sha256,
      'ACCEPTANCE_STREAM_CHANGED', {file, expected, measured});
    const handle = await fs.open(temporary, 'r'); try { await handle.sync(); } finally { await handle.close(); }
    try { await fs.link(temporary, file); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const raced = await streamIdentity(file);
      need(raced.bytes === expected.bytes && raced.sha256 === expected.sha256, 'ACCEPTANCE_RETAINED_FILE_CHANGED', {file});
    }
    return {file, bytes: expected.bytes, sha256: expected.sha256};
  } finally { await fs.rm(temporary, {force: true}); }
}
async function sourceClosure(featureRoot, directory, {browser = false, sourceManifest} = {}) {
  const repositoryRoot = resolve(featureRoot, '../../../..');
  need(typeof sourceManifest === 'string' && isAbsolute(sourceManifest) &&
    resolve(sourceManifest) === sourceManifest, 'ACCEPTANCE_SOURCE_MANIFEST_REQUIRED');
  const manifestBytes = await ordinary(sourceManifest, 16 * 1024 * 1024);
  const selected = JSON.parse(manifestBytes.toString('utf8'));
  need(selected && selected.schema === 'research-dossier-return-native-final-cohort-v1' &&
    Array.isArray(selected.files) && selected.files.length > 0, 'ACCEPTANCE_SOURCE_MANIFEST_INVALID');
  const found = new Map(), files = [];
  for (const entry of selected.files) {
    need(entry && typeof entry.path === 'string' && entry.path &&
      !entry.path.includes('\\') && !/[\u0000-\u001f\u007f]/.test(entry.path) &&
      entry.path.split('/').every(part => part && part !== '.' && part !== '..') &&
      !isAbsolute(entry.path) && Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 &&
      entry.bytes <= MAX && /^[a-f0-9]{64}$/.test(entry.sha256 ?? '') &&
      ['100644', '100755'].includes(entry.mode), 'ACCEPTANCE_SOURCE_MEMBER_INVALID', {entry});
    const file = resolve(repositoryRoot, ...entry.path.split('/'));
    need(file !== directory && !file.startsWith(directory + sep) &&
      file.startsWith(repositoryRoot + sep) && !found.has(file),
      'ACCEPTANCE_SOURCE_MEMBER_SCOPE_CHANGED', {path: entry.path});
    need(await fs.realpath(file) === file, 'ACCEPTANCE_SOURCE_SYMLINK', {file});
    const body = await ordinary(file), stat = await fs.lstat(file);
    const mode = stat.mode & 0o111 ? '100755' : '100644';
    need(body.length === entry.bytes && sha(body) === entry.sha256 && mode === entry.mode,
      'ACCEPTANCE_SELECTED_SOURCE_CHANGED', {path: entry.path});
    const gitBlobSha = createHash('sha1').update('blob ' + body.length + '\0').update(body).digest('hex');
    if (entry.gitBlobSha !== undefined)
      need(gitBlobSha === entry.gitBlobSha, 'ACCEPTANCE_SELECTED_GIT_BLOB_CHANGED', {path: entry.path});
    const row = {path: entry.path, bytes: body.length, sha256: entry.sha256, mode, gitBlobSha};
    found.set(file, row); files.push(row);
    await retain(join(directory, 'source', ...row.path.split('/')), body, mode === '100755');
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const totalBytes = files.reduce((sum, row) => sum + row.bytes, 0);
  if (selected.sourceFiles !== undefined)
    need(selected.sourceFiles === files.length, 'ACCEPTANCE_SOURCE_COUNT_CHANGED');
  if (selected.sourceBytes !== undefined)
    need(selected.sourceBytes === totalBytes, 'ACCEPTANCE_SOURCE_TOTAL_CHANGED');
  need(found.has(join(repositoryRoot, 'LICENSE')), 'ACCEPTANCE_ORIGINAL_LICENSE_REQUIRED');
  const required = [
    'dossier.mjs', 'source-bundles.mjs', 'crossref-documents.mjs', 'crossref.mjs',
    'citation-updates.mjs', '../node/store.mjs', 'dossier-returns/engine.mjs',
    'dossier-returns/contracts.mjs', 'template-exchange/workbook.py'
  ];
  if (browser) required.push('dossier-returns/browser-acceptance.mjs',
    'server.mjs', 'workspace-client.mjs', 'public/index.html', 'public/app.js',
    'public/dossier-returns.js', 'public/dossier-return-drafts.js',
    'public/dossier-returns.css', 'public/source-inspection.js');
  for (const member of required)
    need(found.has(resolve(featureRoot, member)), 'ACCEPTANCE_REQUIRED_SOURCE_NOT_SELECTED', {member});
  const programmeFile = fileURLToPath(import.meta.url);
  const programme = await ordinary(programmeFile, 1024 * 1024);
  const programmeRow = found.get(join(featureRoot, 'dossier-returns/source-native-acceptance.mjs'));
  need(programmeRow && programmeRow.bytes === programme.length &&
    programmeRow.sha256 === sha(programme), 'ACCEPTANCE_PROGRAMME_SOURCE_NOT_SELECTED');
  await retain(join(directory, 'source', 'source-native-acceptance.mjs'), programme);
  await retain(join(directory, 'SOURCE_SELECTION.json'), manifestBytes);
  const assets = browser ? files.filter(row => {
    const local = relative(featureRoot, join(repositoryRoot, ...row.path.split('/')));
    return local && !local.startsWith('..' + sep) && !isAbsolute(local) &&
      local.split(sep).includes('public');
  }).map(row => row.path) : [];
  const manifest = {schema: 'sf88-research-dossier-return-native-source-v1',
    repositoryRoot, featureRoot, selectionMethod: 'explicit-complete-source-cohort',
    selectedManifest: {originalFile: sourceManifest, path: 'SOURCE_SELECTION.json',
      schema: selected.schema, bytes: manifestBytes.length, sha256: sha(manifestBytes)},
    files, sourceFiles: files.length, sourceBytes: totalBytes,
    programme: {path: 'source-native-acceptance.mjs', selectedPath: programmeRow.path,
      bytes: programme.length, sha256: sha(programme)},
    ...(browser ? {browser: {publicAssetFiles: assets.length, publicAssets: assets,
      helper: relative(repositoryRoot, join(featureRoot, 'dossier-returns/browser-acceptance.mjs')).split(sep).join('/'),
      assetAuthority: 'Complete selected source cohort and the original HTTP asset routes; browser URLs are not native module specifiers.'}} : {})};
  await retain(join(directory, 'SOURCE.json'), json(manifest));
  return {repositoryRoot, directory, found, manifest, programmeFile, programmeRow,
    summary: {manifestSha256: sha(json(manifest)), files: files.length, bytes: totalBytes,
      selectedManifestSha256: sha(manifestBytes), programmeSha256: sha(programme)}};
}
function observeNativeModules(selection) {
  // Node's synchronous hooks delegate to its original resolver and loader unchanged.
  // https://nodejs.org/download/release/v24.0.1/docs/api/module.html
  need(typeof registerHooks === 'function', 'ACCEPTANCE_NODE_MODULE_HOOKS_REQUIRED');
  const modules = new Map(), edges = new Map();
  function identity(url) {
    if (typeof url !== 'string') return null;
    let value;
    if (url.startsWith('node:')) value = {kind: 'node-builtin', name: url};
    else if (url.startsWith('file:')) {
      const file = fileURLToPath(url);
      if (file === selection.programmeFile || file === selection.repositoryRoot || file.startsWith(selection.repositoryRoot + sep)) {
        const selected = file === selection.programmeFile ? selection.programmeRow : selection.found.get(file);
        need(selected, 'ACCEPTANCE_NATIVE_SOURCE_NOT_SELECTED', {file});
        value = {kind: 'selected-source', path: selected.path,
          bytes: selected.bytes, sha256: selected.sha256};
      } else value = {kind: 'installed-runtime', file};
    } else value = {kind: 'runtime-url', protocol: url.slice(0, url.indexOf(':') + 1),
      identitySha256: sha(Buffer.from(url)), identityBytes: Buffer.byteLength(url)};
    const id = 'module_' + sha(json(value));
    if (!modules.has(id)) modules.set(id, {id, ...value, resolved: false, loaded: false});
    return modules.get(id);
  }
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      const target = identity(result.url), parent = identity(context.parentURL);
      if (target) {
        target.resolved = true;
        const edge = {from: parent?.id ?? null, to: target.id};
        edges.set(JSON.stringify(edge), edge);
      }
      return result;
    },
    load(url, context, nextLoad) {
      const result = nextLoad(url, context), item = identity(url);
      if (item) {
        item.loaded = true; item.format = result.format ?? context.format ?? null;
        if (result.source !== undefined && result.source !== null) {
          const body = typeof result.source === 'string' ? Buffer.from(result.source) :
            result.source instanceof ArrayBuffer ? Buffer.from(result.source) :
            ArrayBuffer.isView(result.source) ?
              Buffer.from(result.source.buffer, result.source.byteOffset, result.source.byteLength) : null;
          if (body) {
            item.loaderSource = {bytes: body.length, sha256: sha(body)};
            if (item.kind === 'selected-source')
              need(item.loaderSource.bytes === item.bytes && item.loaderSource.sha256 === item.sha256,
                'ACCEPTANCE_NATIVE_LOADER_SOURCE_CHANGED', {path: item.path});
          }
        }
      }
      return result;
    }
  });
  async function verifySelection() {
    for (const [file, entry] of selection.found) {
      const actual = await streamIdentity(file), mode = (await fs.lstat(file)).mode & 0o111 ? '100755' : '100644';
      need(actual.bytes === entry.bytes && actual.sha256 === entry.sha256 && mode === entry.mode,
        'ACCEPTANCE_EXECUTED_SOURCE_CHANGED', {path: entry.path});
      const retained = await streamIdentity(join(selection.directory, 'source', ...entry.path.split('/')));
      need(retained.bytes === entry.bytes && retained.sha256 === entry.sha256,
        'ACCEPTANCE_RETAINED_SOURCE_CHANGED', {path: entry.path});
    }
  }
  return {
    async retainObservation(state, {verify = false} = {}) {
      if (verify) await verifySelection();
      const folder = join(selection.directory, 'native-module-observations');
      await privateDirectory(folder);
      const names = await fs.readdir(folder);
      let index = names.reduce((largest, name) => {
        const match = /^([0-9]+)\.json$/.exec(name);
        return match ? Math.max(largest, Number(match[1])) : largest;
      }, 0) + 1;
      const result = {schema: 'sf88-research-dossier-return-native-modules-v1',
        state, selectedManifestSha256: selection.summary.selectedManifestSha256,
        sourceManifestSha256: selection.summary.manifestSha256,
        runtime: {node: process.version, executable: process.execPath},
        observation: 'Original Node resolution and loading after registration in this thread. Preloaded cache contents and child processes are not inferred.',
        sourceCustody: 'Every explicitly selected original engine and asset file is retained independently of which modules this attempt executes.',
        modules: [...modules.values()].sort((a, b) => a.id.localeCompare(b.id)),
        edges: [...edges.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        observedAt: new Date().toISOString()};
      const body = json(result), file = join(folder, String(index).padStart(4, '0') + '.json');
      const saved = await retain(file, body);
      return {path: relative(selection.directory, file).split(sep).join('/'),
        bytes: saved.bytes, sha256: saved.sha256,
        observedModules: modules.size, selectedSourceFiles: selection.found.size};
    },
    close() { hooks.deregister(); }
  };
}
async function acquire(directory, operation) {
  const file = join(directory, 'RUNNING.json');
  const old = await optional(file, 10000);
  if (old) {
    const lock = JSON.parse(old);
    need(lock.operation === operation && Number.isSafeInteger(lock.pid), 'ACCEPTANCE_LOCK_CHANGED');
    let live = true;
    try { process.kill(lock.pid, 0); }
    catch (error) { if (error.code === 'ESRCH') live = false; else throw error; }
    need(!live, 'ACCEPTANCE_ALREADY_RUNNING', {pid: lock.pid, operation});
    await retain(join(directory, 'retained-locks', sha(old) + '.json'), old);
    await fs.unlink(file);
  }
  const body = json({schema: SCHEMA, operation, pid: process.pid, startedAt: new Date().toISOString()});
  await retain(file, body);
  return async () => {
    const actual = await optional(file, 10000);
    if (actual?.equals(body)) await fs.unlink(file);
  };
}

export async function runDossierReturnNativeAcceptance({
  featureRoot, directory, sourceManifest, crossrefEdition, crossrefSha256, targetDoi,
  python = 'python3', operation = 'research-dossier-return-native-acceptance-v1',
  playwrightModule, chromiumExecutable
} = {}) {
  for (const file of [featureRoot, directory, sourceManifest, crossrefEdition])
    need(typeof file === 'string' && isAbsolute(file) && resolve(file) === file, 'ACCEPTANCE_ABSOLUTE_PATH_REQUIRED', {file});
  need(/^[a-f0-9]{64}$/.test(crossrefSha256 ?? ''), 'ACCEPTANCE_ORIGINAL_CROSSREF_HASH_REQUIRED');
  need(typeof operation === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,120}$/.test(operation), 'ACCEPTANCE_OPERATION_INVALID');
  need(typeof python === 'string' && python.length > 0, 'ACCEPTANCE_PYTHON_REQUIRED');
  const browserSelected = playwrightModule !== undefined || chromiumExecutable !== undefined;
  if (browserSelected) for (const file of [playwrightModule, chromiumExecutable])
    need(typeof file === 'string' && isAbsolute(file) && resolve(file) === file,
      'ACCEPTANCE_BROWSER_RUNTIME_PATH_REQUIRED', {file});
  await privateDirectory(directory);
  const release = await acquire(directory, operation);
  let activePhase = 'source', nativeModules;
  try {
    const selectedSource = await sourceClosure(featureRoot, directory, {browser: browserSelected, sourceManifest});
    const source = selectedSource.summary;
    nativeModules = observeNativeModules(selectedSource);
    const imports = await Promise.all([
      import(pathToFileURL(join(featureRoot, 'dossier.mjs')).href),
      import(pathToFileURL(join(featureRoot, 'source-bundles.mjs')).href),
      import(pathToFileURL(join(featureRoot, 'crossref-documents.mjs')).href),
      import(pathToFileURL(join(featureRoot, 'crossref.mjs')).href),
      import(pathToFileURL(join(featureRoot, 'citation-updates.mjs')).href),
      import(pathToFileURL(join(featureRoot, '../node/store.mjs')).href),
      import(pathToFileURL(join(featureRoot, 'dossier-returns/engine.mjs')).href)
    ]);
    const [{openDossierStore}, {createSourceBundle, SOURCE_MANIFEST_SCHEMA},
      {validateCrossrefDocumentEdition}, {validateCrossrefEdition}, {citationDigest},
      {digest, jsonBytes}, {RETURN_TYPED_FAMILIES}] = imports;
    const same = (a, b) => citationDigest(a) === citationDigest(b);
    if (browserSelected) await import(pathToFileURL(
      join(featureRoot, 'dossier-returns/browser-acceptance.mjs')).href);
    const crossrefBytes = await ordinary(crossrefEdition, 64 * 1024 * 1024);
    need(sha(crossrefBytes) === crossrefSha256, 'ACCEPTANCE_ORIGINAL_CROSSREF_CHANGED');
    const crossref = JSON.parse(crossrefBytes.toString('utf8'));
    if (crossref.provider === 'crossref-document') validateCrossrefDocumentEdition(crossref);
    else validateCrossrefEdition(crossref);
    await retain(join(directory, 'inputs', 'original-crossref-edition.json'), crossrefBytes);
    const selection = {schema: SCHEMA, operation, featureRoot, directory, python, sourceManifest, source,
      ...(browserSelected ? {browser: {playwrightModule, chromiumExecutable}} : {}),
      crossref: {originalFile: crossrefEdition, bytes: crossrefBytes.length, sha256: crossrefSha256,
        provider: crossref.provider, targetDoi: targetDoi ?? null}};
    await retain(join(directory, 'SELECTION.json'), json(selection));
    const finished = await optional(join(directory, 'COMPLETE.json'));
    if (finished) {
      const result = JSON.parse(finished);
      need(same(result.selection, selection), 'ACCEPTANCE_SELECTION_CHANGED');
      for (const item of result.files) {
        const actual = await streamIdentity(join(directory, item.path));
        need(actual.bytes === item.bytes && actual.sha256 === item.sha256, 'ACCEPTANCE_COMPLETED_FILE_CHANGED', {path: item.path});
      }
      return {...result, recovered: true};
    }
    const open = name => openDossierStore(join(directory, 'workspaces', name), {extractionOptions: {python}});
    const local = await open('original');
    const customer = await open('customer-return');
    const pin = envelope => ({revision: envelope.state.revision, sha256: envelope.sha256});
    async function head(store, id, revision) {
      const history = await store.listRevisions(id, revision === undefined ? {} : {revision});
      const row = history.at(-1);
      need(row, 'ACCEPTANCE_ORIGINAL_HISTORY_REQUIRED', {id});
      // Read the exact original revision through its native, source-defined layout.
      // This is an observation only; every write below uses the original Store API.
      const file = join(store.directory, 'dossiers', id, 'revisions', String(row.revision).padStart(8, '0') + '.json');
      const envelope = JSON.parse((await ordinary(file, 8 * 1024 * 1024)).toString('utf8'));
      need(envelope.state.id === id && envelope.state.revision === row.revision &&
        envelope.sha256 === row.sha256 && digest(jsonBytes(envelope.state)) === row.sha256,
        'ACCEPTANCE_ORIGINAL_REVISION_CHANGED', {id, revision: row.revision});
      return envelope;
    }
    async function saved(name, build) {
      const file = join(directory, 'retained', name + '.json'), old = await optional(file);
      if (old) return JSON.parse(old);
      const value = await build(); await retain(file, jsonBytes(value)); return value;
    }
    async function phase(name, run) {
      activePhase = name;
      const file = join(directory, 'phases', name + '.json'), old = await optional(file);
      if (old) return JSON.parse(old).result;
      process.stdout.write(JSON.stringify({schema: SCHEMA, operation, phase: name, state: 'RUNNING'}) + '\n');
      const result = await run();
      await retain(file, jsonBytes({schema: SCHEMA, operation, phase: name, result,
        completedAt: new Date().toISOString()}));
      process.stdout.write(JSON.stringify({schema: SCHEMA, operation, phase: name, state: 'COMPLETE'}) + '\n');
      return result;
    }
    async function action(name, store, id, build, invoke, verify) {
      const recorded = await phase(name, async () => {
        const intent = await saved(name + '-request', async () => {
          const before = await head(store, id);
          return {schema: SCHEMA, operation, workspace: store.directory, dossierId: id, before,
            request: await build(before.state)};
        });
        need(intent.workspace === store.directory && intent.dossierId === id, 'ACCEPTANCE_REQUEST_CHANGED', {name});
        let current = await head(store, id), acknowledgement = null, recovered = false;
        if (current.state.revision === intent.before.state.revision) {
          need(current.sha256 === intent.before.sha256, 'ACCEPTANCE_BASE_CHANGED', {name});
          acknowledgement = await invoke(intent.request);
          current = await head(store, id);
        } else recovered = true;
        need(current.state.revision === intent.before.state.revision + 1 &&
          current.state.previous === intent.before.sha256, 'ACCEPTANCE_OPERATION_REQUIRES_RECONCILIATION', {name, current: pin(current)});
        await verify(intent.before.state, current.state, intent.request);
        return {workspace: store.directory, dossierId: id, before: pin(intent.before), after: current,
          request: intent.request, acknowledgement, acknowledgementRecoveredFromOriginalRevision: recovered};
      });
      const retainedHead = await head(store, id, recorded.after.state.revision);
      need(retainedHead.sha256 === recorded.after.sha256, 'ACCEPTANCE_RETAINED_OPERATION_CHANGED', {name});
      return recorded;
    }
    const update = (name, store, id, fields) => action(name, store, id,
      state => ({...fields, expectedRevision: state.revision, projection: 'metadata'}),
      request => store.update(id, request),
      (before, after) => { for (const [key, value] of Object.entries(fields))
        need(same(after[key], value), 'ACCEPTANCE_AUTHORED_VALUE_CHANGED', {name, key}); });
    const question = (name, store, id, questionId, fields) => action(name, store, id,
      state => ({...fields, expectedRevision: state.revision, projection: 'metadata'}),
      request => store.updateQuestion(id, questionId, request),
      (before, after) => { const row = after.questions.find(item => item.id === questionId);
        need(row, 'ACCEPTANCE_QUESTION_MISSING');
        for (const [key, value] of Object.entries(fields))
          need(same(row[key], value), 'ACCEPTANCE_QUESTION_CHANGED', {name, key}); });
    const evidence = (name, store, id, occurrenceId, fields) => action(name, store, id,
      state => ({occurrenceId, ...fields, expectedRevision: state.revision, projection: 'metadata'}),
      request => store.updateSelection(id, request),
      (before, after) => { const row = after.selections.find(item => item.occurrenceId === occurrenceId);
        need(row, 'ACCEPTANCE_OCCURRENCE_MISSING');
        for (const [key, value] of Object.entries(fields))
          need(same(row[key], value), 'ACCEPTANCE_OCCURRENCE_VALUE_CHANGED', {name, key}); });
    const finding = (name, store, id, findingId, fields) => action(name, store, id,
      state => ({...fields, expectedRevision: state.revision, projection: 'metadata'}),
      request => store.updateFinding(id, findingId, request),
      (before, after) => { const row = after.findings.find(item => item.id === findingId);
        need(row, 'ACCEPTANCE_FINDING_MISSING');
        for (const [key, value] of Object.entries(fields)) {
          if (key === 'sourceIds') need(value.length === 0 && row.occurrenceIds.length === 0, 'ACCEPTANCE_FINDING_BINDING_CHANGED');
          else need(same(row[key], value), 'ACCEPTANCE_FINDING_CHANGED', {name, key});
        } });
    async function rejection(name, store, id, run, acceptedCodes) {
      return phase(name, async () => {
        const before = await head(store, id); let rejected = null;
        try { await run(); }
        catch (error) { rejected = {code: error.code ?? error.name, details: error.details ?? null}; }
        need(rejected && acceptedCodes.includes(rejected.code), 'ACCEPTANCE_EXPECTED_REJECTION_MISSING',
          {name, acceptedCodes, actual: rejected});
        const after = await head(store, id);
        need(after.sha256 === before.sha256, 'ACCEPTANCE_REJECTION_CHANGED_HEAD', {name});
        return {rejected: true, ...rejected, before: pin(before), after: pin(after)};
      });
    }
    async function makeBundle(name, key, text, findingText) {
      const manifest = {schema: SOURCE_MANIFEST_SCHEMA, label: name,
        sourceTerms: 'Authored native acceptance programme notes; retain their complete original text.',
        sourceReference: operation + '/' + key,
        sources: [{key, title: name, files: [key + '.txt'], selected: true, classification: 'background',
          note: 'This source is an explicitly authored programme note, independent of the original Crossref evidence.'}],
        findings: [{key: key + '-finding', title: name + ' finding', text: findingText, sourceKeys: [key]}]};
      const manifestBytes = jsonBytes(manifest), fileBytes = Buffer.from(text, 'utf8');
      const result = createSourceBundle({manifestBytes, files: new Map([[key + '.txt', fileBytes]])});
      await retain(join(directory, 'inputs', key + '.manifest.json'), manifestBytes);
      await retain(join(directory, 'inputs', key + '.txt'), fileBytes);
      await retain(join(directory, 'inputs', key + '.source-bundle.json'), result.bytes);
      return result;
    }
    async function bundleReceive(name, store, id, questionId, bundle) {
      return action(name, store, id, state => ({questionId, expectedRevision: state.revision,
        expectedBundleSha256: sha(bundle.bytes), projection: 'metadata'}),
      request => store.receiveSourceBundle(id, {...request, rawBytes: bundle.bytes}),
      (before, after) => {
        const added = after.editions.filter(row => !before.editions.some(old => old.id === row.id));
        need(added.length === 1 && added[0].questionId === questionId &&
          added[0].raw.sha256 === sha(bundle.bytes) && added[0].origin.mode === 'LOCAL_SOURCE_BUNDLE',
          'ACCEPTANCE_SOURCE_BUNDLE_BINDING_CHANGED');
      });
    }
    async function portable(name, store, id, revision) {
      const selection = await saved(name + '-portable-selection', async () => {
        const current = await head(store, id, revision); return {dossierId: id, ...pin(current)};
      });
      const file = join(directory, 'portable', name + '.research.json');
      let body = await optional(file);
      if (!body) {
        const output = await store.exportDossier(id, {format: 'json', revision: selection.revision});
        body = output.body; await retain(file, body);
      }
      const value = JSON.parse(body.toString('utf8'));
      const current = value.versions.at(-1);
      need(value.id === id && current.state.revision === selection.revision && current.sha256 === selection.sha256,
        'ACCEPTANCE_PORTABLE_SELECTION_CHANGED', {name});
      for (const envelope of value.versions)
        need(digest(jsonBytes(envelope.state)) === envelope.sha256, 'ACCEPTANCE_PORTABLE_REVISION_CHANGED');
      for (const blob of value.blobs) {
        const original = Buffer.from(blob.bodyBase64, 'base64');
        need(original.length === blob.bytes && sha(original) === blob.sha256, 'ACCEPTANCE_PORTABLE_BLOB_CHANGED');
      }
      return {file, bytes: body.length, sha256: sha(body), head: selection};
    }
    async function citationReview(name, store, id, noticeId, decision) {
      return action(name, store, id, async state => {
        const detail = (await store.citationUpdates(id, {revision: state.revision, noticeId})).detail;
        return {requestId: operation.replace(/[^A-Za-z0-9_-]/g, '_').slice(0,55) + '_' + name.replace(/-/g, '_'),
          noticeId, expectedRevision: state.revision, expectedFingerprint: detail.fingerprint,
          actor: 'Source-native acceptance operator', decision,
          reason: 'Native acceptance ' + name + ': record an explicit disposition of the actual retained notice and preserve the original evidence.',
          evidenceChanges: [], findingChanges: [],
          findingDispositions: detail.findings.map(row => ({findingId: row.id, disposition: 'unchanged',
            reason: 'The authored acceptance finding retains its original source and wording in this native citation review.'}))};
      }, request => store.reviewCitationUpdate(id, request),
      (before, after, request) => {
        const row = after.citationReviews.find(item => item.requestId === request.requestId);
        need(row && row.originalRevision === before.revision && row.revision === after.revision &&
          row.requestSha256 === citationDigest(row.request), 'ACCEPTANCE_NATIVE_CITATION_REVIEW_CHANGED');
      });
    }
    async function templateReview(name, store, id, csv, previousEditionId) {
      const raw = Buffer.from(csv, 'utf8');
      await retain(join(directory, 'inputs', name + '.csv'), raw);
      const staged = await saved(name + '-workbook-stage',
        () => store.templateExchange.stageWorkbook({filename: name + '.csv', body: raw, format: 'csv', delimiter: ','}));
      return action(name, store, id, state => ({
        requestId: operation + ':' + name, expectedRevision: state.revision,
        actor: {id: 'native-acceptance-operator', name: 'Source-native acceptance operator'},
        action: previousEditionId ? 'revise-template' : 'retain-template',
        data: {...(previousEditionId ? {templateId: previousEditionId.templateId,
          expectedEditionId: previousEditionId.id} : {name: 'Native acceptance operator worksheet'}),
          edition: staged, reason: 'Retain the exact authored CSV through the original workbook and template review engine.'}
      }), request => store.templateExchange.review(id, request),
      (before, after, request) => {
        const event = after.templateExchangeEvents.find(item => item.requestId === request.requestId);
        need(event && event.originalRevision === before.revision && event.revision === after.revision &&
          event.result.edition.workbook.sha256 === sha(raw), 'ACCEPTANCE_NATIVE_TEMPLATE_REVIEW_CHANGED');
      });
    }

    const baseNotes = await makeBundle('Original programme note', 'programme-note',
      'This retained file is the native acceptance programme source. It has one source identity and separate occurrence bindings in two questions.\n',
      'The programme checks exact source occurrence bindings across independently reviewed questions.');
    const newNotes = await makeBundle('Customer returned programme note', 'customer-note',
      'The customer branch adds this complete authored file, its original source edition, an explicit occurrence selection, and a finding.\n',
      'This returned programme note is received through the original source-bundle API.');
    const created = await phase('01-create-original', async () => {
      const title = 'Native dossier return / ' + operation;
      const values = await local.list();
      const matches = values.filter(row => row.title === title);
      need(matches.length <= 1 && values.length === matches.length, 'ACCEPTANCE_WORKSPACE_NOT_OWNED');
      const result = matches[0] ?? await local.create({title,
        description: 'Owned source-native acceptance programme over the original Research engine.', projection: 'metadata'});
      const original = await head(local, result.id, 1);
      return {id: result.id, original};
    });
    const id = created.id;
    const questions = [];
    const questionTexts = [
      'How is the original programme note reviewed in the first question?',
      'How is the same retained source reviewed in a separate question?',
      'Which actual retained Crossref notice has an explicit citation disposition?'
    ];
    for (let index = 0; index < questionTexts.length; index++) {
      const text = questionTexts[index];
      const result = await action('02-question-' + index, local, id,
        state => ({text, expectedRevision: state.revision, projection: 'metadata'}),
        request => local.addQuestion(id, request),
        (before, after) => {
          const added = after.questions.filter(row => !before.questions.some(old => old.id === row.id));
          need(added.length === 1 && added[0].text === text, 'ACCEPTANCE_QUESTION_CREATE_CHANGED');
        });
      questions.push(result.after.state.questions.find(row =>
        row.text === text).id);
    }
    const [qa, qb, qc] = questions;
    await bundleReceive('03-base-source-a', local, id, qa, baseNotes);
    await bundleReceive('04-base-source-b', local, id, qb, baseNotes);
    await action('05-original-crossref-edition', local, id,
      state => ({questionId: qc, label: 'Original retained Crossref notice source', provider: crossref.provider,
        sourceReference: 'Retained original Crossref edition / SHA256 ' + crossrefSha256,
        expectedRevision: state.revision, projection: 'metadata',
        origin: {mode: 'SOURCE_NATIVE_RETURN_ACCEPTANCE', operation, inputSha256: crossrefSha256}}),
      request => local.receive(id, {...request, rawBytes: crossrefBytes}),
      (before, after) => need(after.editions.some(row => row.questionId === qc && row.raw?.sha256 === crossrefSha256),
        'ACCEPTANCE_CROSSREF_EDITION_CHANGED'));
    const selectedNotice = await saved('selected-original-notice', async () => {
      const current = await head(local, id), notices = [];
      for (let offset = 0;;) {
        const page = await local.citationUpdates(id, {revision: current.state.revision, offset, limit: 100});
        notices.push(...page.items);
        if (page.nextOffset === null) break;
        need(page.nextOffset > offset, 'ACCEPTANCE_CITATION_PAGE_STALLED'); offset = page.nextOffset;
      }
      const view = await local.get(id, {revision: current.state.revision, references: false, includeHistory: false});
      for (const notice of notices) {
        if (targetDoi && notice.targetDoi.toLowerCase() !== targetDoi.toLowerCase()) continue;
        const detail = (await local.citationUpdates(id, {revision: current.state.revision, noticeId: notice.noticeId})).detail;
        const source = view.sources.find(row => row.doi?.toLowerCase() === notice.targetDoi.toLowerCase() &&
          row.citations.some(citation => citation.questionId === qc));
        if (detail.evidence.length && source) return {noticeId: notice.noticeId, noticeDoi: notice.noticeDoi,
          targetDoi: notice.targetDoi, sourceId: source.id, originalDetail: detail, source};
      }
      throw Object.assign(new Error('ACCEPTANCE_CITED_NATIVE_NOTICE_REQUIRED'), {code: 'ACCEPTANCE_CITED_NATIVE_NOTICE_REQUIRED'});
    });
    await action('06-select-original-notice-evidence', local, id,
      state => ({sourceId: selectedNotice.sourceId, selected: true, classification: 'background',
        note: 'Actual retained Crossref notice source selected for the private native acceptance programme.',
        expectedRevision: state.revision, projection: 'metadata'}),
      request => local.selectEvidence(id, request),
      (before, after) => need(after.selections.some(row => row.questionId === qc && row.selected),
        'ACCEPTANCE_CITATION_EVIDENCE_NOT_SELECTED'));
    await action('07-add-original-citation-finding', local, id,
      state => ({questionId: qc, title: 'Retained notice review in the native programme',
        text: 'This programme records an explicit review of the retained Crossref notice. Source and review identity remain attached to the original question.',
        sourceIds: [selectedNotice.sourceId], expectedRevision: state.revision, projection: 'metadata'}),
      request => local.addFinding(id, request),
      (before, after) => need(after.findings.some(row => row.questionId === qc && row.occurrenceIds.length > 0),
        'ACCEPTANCE_CITATION_FINDING_NOT_BOUND'));
    const templateBase = await templateReview('08-base-template', local, id,
      'record_id,operator_note\nprogramme-1,Original retained programme worksheet\n');
    const originalTemplate = templateBase.after.state.templateExchangeEvents.at(-1).result.edition;
    await citationReview('09_base_citation', local, id, selectedNotice.noticeId, 'retain');
    const seed = await saved('seed', async () => {
      const original = await head(local, id);
      const ea = original.state.editions.find(row => row.questionId === qa && row.raw?.sha256 === sha(baseNotes.bytes));
      const eb = original.state.editions.find(row => row.questionId === qb && row.raw?.sha256 === sha(baseNotes.bytes));
      const sa = original.state.selections.find(row => row.editionId === ea?.id);
      const sb = original.state.selections.find(row => row.editionId === eb?.id);
      const fa = original.state.findings.find(row => row.questionId === qa);
      const fb = original.state.findings.find(row => row.questionId === qb);
      need(ea && eb && sa && sb && fa && fb && ea.id !== eb.id && sa.occurrenceId !== sb.occurrenceId &&
        fa.occurrenceIds.includes(sa.occurrenceId) && fb.occurrenceIds.includes(sb.occurrenceId),
        'ACCEPTANCE_ORIGINAL_OCCURRENCE_BINDING_REQUIRED');
      const view = await local.get(id, {revision: original.state.revision, references: false, includeHistory: false});
      const common = view.sources.find(row => row.citations.some(c => c.occurrenceId === sa.occurrenceId) &&
        row.citations.some(c => c.occurrenceId === sb.occurrenceId));
      need(common, 'ACCEPTANCE_SHARED_SOURCE_IDENTITY_REQUIRED');
      return {dossierId: id, questions, base: pin(original), sourceId: common.id,
        firstOccurrence: sa.occurrenceId, secondOccurrence: sb.occurrenceId,
        firstFinding: fa.id, secondFinding: fb.id, originalTemplate, selectedNotice};
    });
    const base = await portable('base', local, id, seed.base.revision);
    await phase('10-original-customer-reopen', async () => {
      await customer.reopenStream(createReadStream(base.file), {projection: 'metadata'});
      const incoming = await head(customer, id);
      need(incoming.sha256 === seed.base.sha256, 'ACCEPTANCE_BASE_REOPEN_CHANGED');
      return {workspace: customer.directory, head: pin(incoming)};
    });

    const localDescription = 'Current operator description retained independently from the returned title.';
    const localQuestionNote = 'Current operator note on the first question.';
    const mergedQuestionNote = 'Reviewed reconciliation: retain the current operator context and the customer question note.';
    const localEvidenceNote = 'Current operator note for the first occurrence only.';
    const localFindingText = 'Current authored finding text retains the exact first-question occurrence.';
    const returnedTitle = 'Customer reviewed dossier <original source retained>';
    const returnedFindingTitle = 'Customer revised title with current finding text retained';
    const returnedEvidenceNote = 'Customer decision for the second occurrence only.';
    const longNote = ('Complete returned operator note: exact bytes survive paging, download, review and portable reopening.\n').repeat(410);
    await update('11-local-description', local, id, {description: localDescription});
    await question('12-local-question-note', local, id, qa, {notes: localQuestionNote});
    await evidence('13-local-occurrence-note', local, id, seed.firstOccurrence, {note: localEvidenceNote});
    await finding('14-local-finding-text', local, id, seed.firstFinding, {text: localFindingText});
    await citationReview('15_local_citation', local, id, selectedNotice.noticeId, 'retain');
    const localTemplate = await templateReview('16-local-template', local, id,
      'record_id,operator_note\nprogramme-1,Current operator worksheet authority\n', originalTemplate);

    await update('17-customer-title', customer, id, {title: returnedTitle});
    await question('18-customer-question-note', customer, id, qa, {notes: 'Customer note on the same first question.'});
    await question('19-customer-second-question', customer, id, qb, {text: 'How does the customer review the second bound occurrence?'});
    await question('20-customer-complete-note', customer, id, qb, {notes: longNote});
    await evidence('21-customer-second-occurrence', customer, id, seed.secondOccurrence,
      {selected: false, note: returnedEvidenceNote, classification: 'unreviewed'});
    await finding('22-customer-finding-title', customer, id, seed.firstFinding, {title: returnedFindingTitle});
    await finding('23-customer-finding-citations', customer, id, seed.secondFinding, {sourceIds: []});
    await bundleReceive('24-customer-added-source', customer, id, qb, newNotes);
    await citationReview('25_customer_citation', customer, id, selectedNotice.noticeId, 'follow-up');
    const customerTemplate = await templateReview('26-customer-template', customer, id,
      'record_id,operator_note\nprogramme-1,Customer proposed worksheet edition\n', originalTemplate);
    await citationReview('27_customer_citation', customer, id, selectedNotice.noticeId, 'retain');
    const returnedTemplate = await templateReview('28-customer-template-successor', customer, id,
      'record_id,operator_note\nprogramme-1,Later customer proposed worksheet edition\n',
      customerTemplate.after.state.templateExchangeEvents.at(-1).result.edition);
    const branch = await portable('returned-branch', customer, id);
    const originalBeforeReturn = await saved('original-before-return', () => head(local, id));
    const returnedBeforeReturn = await saved('returned-before-return', () => head(customer, id));
    need(branch.head.revision > originalBeforeReturn.state.revision + 1, 'ACCEPTANCE_LONG_RETURN_BRANCH_REQUIRED');
    need(returnedBeforeReturn.state.templateExchangeEvents.at(-1).revision > originalBeforeReturn.state.revision + 1,
      'ACCEPTANCE_NATIVE_TYPED_REVISION_GAP_REQUIRED');

    const tampered = await phase('29-retain-altered-native-citation-source', async () => {
      const value = JSON.parse((await ordinary(branch.file)).toString('utf8'));
      const requestId = returnedBeforeReturn.state.citationReviews.at(-1).requestId;
      let previous = null, changed = 0;
      for (const envelope of value.versions) {
        const review = envelope.state.citationReviews?.find(row => row.requestId === requestId);
        if (review) {
          review.notice.latestSource.key = '999999';
          review.notice.latestSource.occurrenceId = 'o_' + digest(Buffer.from(review.notice.latestSource.editionId + '\n999999'));
          const {sha256, ...payload} = review; review.sha256 = citationDigest(payload); changed++;
        }
        envelope.state.previous = previous;
        envelope.sha256 = digest(jsonBytes(envelope.state)); previous = envelope.sha256;
      }
      need(changed > 0, 'ACCEPTANCE_REAL_CITATION_TAMPER_REQUIRED');
      const body = jsonBytes(value), file = join(directory, 'inputs', 'altered-native-citation.research.json');
      await retain(file, body);
      return {file, bytes: body.length, sha256: sha(body), affectedSavedRevisions: changed, requestId};
    });
    await rejection('30-reject-altered-native-citation', local, id,
      () => local.receiveDossierReturnSource(id, {input: createReadStream(tampered.file),
        filename: 'altered-native-citation.research.json', contentType: 'application/json', expectedSha256: tampered.sha256}),
      ['PORTABLE_CITATION_REPLAY_CHANGED']);
    await rejection('31-reject-changed-source-wire', local, id,
      () => local.receiveDossierReturnSource(id, {input: createReadStream(branch.file),
        filename: 'returned-branch.research.json', contentType: 'application/json', expectedSha256: '0'.repeat(64)}),
      ['RETURN_SOURCE_INVALID']);
    const received = await phase('32-receive-original-return-source', async () => {
      const result = await local.receiveDossierReturnSource(id, {input: createReadStream(branch.file),
        filename: 'returned-branch.research.json', contentType: 'application/json', expectedSha256: branch.sha256});
      need(result.source.sha256 === branch.sha256 && result.source.bytes === branch.bytes &&
        same(result.source.incomingHead, {revision: branch.head.revision, sha256: branch.head.sha256}),
        'ACCEPTANCE_SOURCE_DESCRIPTOR_CHANGED');
      need((await head(local, id)).sha256 === originalBeforeReturn.sha256, 'ACCEPTANCE_INTAKE_CHANGED_HEAD');
      return result;
    });
    const preview = await phase('33-compare-original-branches',
      () => local.previewDossierReturn(id, {sourceId: received.source.id, expectedRevision: originalBeforeReturn.state.revision}));
    const reportBefore = await local.exportDossierReturn(id, {reviewId: preview.reviewId, format: 'json'});
    await retain(join(directory, 'reviews', 'first-comparison.json'), reportBefore.body);
    const comparison = JSON.parse(reportBefore.body.toString('utf8')).comparison;
    need(same(comparison.base, seed.base) && comparison.current.sha256 === originalBeforeReturn.sha256 &&
      comparison.returned.sha256 === returnedBeforeReturn.sha256, 'ACCEPTANCE_COMPARISON_HEAD_BINDING_CHANGED');
    const pages = await phase('34-complete-comparison-and-values', async () => {
      const items = [];
      for (let offset = 0;;) {
        const page = await local.dossierReturns(id, {reviewId: preview.reviewId, offset, limit: 25});
        need(page.reviewId === preview.reviewId && page.comparisonSha256 === comparison.comparisonSha256 &&
          page.offset === offset, 'ACCEPTANCE_COMPARISON_PAGE_CHANGED');
        await retain(join(directory, 'reviews', 'page-' + offset + '.json'), jsonBytes(page));
        items.push(...page.items);
        if (items.length === page.total) break;
        need(page.items.length > 0, 'ACCEPTANCE_COMPARISON_PAGE_STALLED'); offset += page.items.length;
      }
      need(equal(items.map(row => row.id), comparison.items.map(row => row.id)), 'ACCEPTANCE_COMPARISON_ITEMS_INCOMPLETE');
      need(items.some(row => row.returned.valueOmitted === true), 'ACCEPTANCE_FULL_VALUE_BOUNDARY_NOT_EXERCISED');
      for (const item of comparison.items) for (const side of ['base', 'current', 'returned']) {
        const value = await local.dossierReturnValue(id, {reviewId: preview.reviewId, itemId: item.id, side});
        need(value.bytes === value.body.length && value.sha256 === sha(value.body), 'ACCEPTANCE_VALUE_DESCRIPTOR_CHANGED');
        const decoded = JSON.parse(value.body.toString('utf8'));
        need(decoded.present === item[side].present && decoded.sha256 === item[side].sha256 &&
          (!decoded.present || same(decoded.value, item[side].value)), 'ACCEPTANCE_FULL_VALUE_CHANGED');
        await retain(join(directory, 'values', item.id + '-' + side + '.json'), value.body);
      }
      return {items: items.length, fullValues: items.length * 3, largeValueDownloaded: true};
    });
    function decisionsFor(value, merged = false) {
      return value.items.map(item => {
        if (item.treatment !== 'AUTHORED_VALUE')
          return {itemId: item.id, choice: 'RETURNED'};
        if (merged && equal(item.path, ['questions', qa, 'notes'])) {
          need(item.conflict && item.allowedChoices.includes('EDIT'), 'ACCEPTANCE_AUTHORED_CONFLICT_REQUIRED');
          return {itemId: item.id, choice: 'EDIT', value: mergedQuestionNote};
        }
        need(!item.conflict, 'ACCEPTANCE_UNEXPECTED_AUTHORED_CONFLICT', {itemId: item.id, path: item.path});
        return {itemId: item.id, choice: item.status === 'CURRENT_CHANGED' ? 'CURRENT' : 'RETURNED'};
      });
    }
    const decisions = decisionsFor(comparison, true).reverse();
    need(comparison.items.some(row => row.family === 'citationReviews' && row.choiceLabels.RETURNED === 'Retain returned proposal') &&
      comparison.items.some(row => row.family === 'templateExchangeEvents'), 'ACCEPTANCE_TYPED_PROPOSAL_TREATMENT_REQUIRED');
    const request = await saved('first-return-review', () => ({
      requestId: operation + ':first-return', reviewId: preview.reviewId,
      expectedRevision: originalBeforeReturn.state.revision, comparisonSha256: comparison.comparisonSha256,
      reviewedBy: 'Source-native acceptance operator',
      reviewNote: 'Apply explicitly reviewed authored values; retain both genuine native typed branches as complete source-bound proposals.',
      decisions
    }));
    await rejection('35-reject-incomplete-explicit-choices', local, id,
      () => local.previewDossierReturnChoices(id, {...request, decisions: decisions.slice(1)}), ['RETURN_DECISION_INVALID']);
    const incomingEditionItem = comparison.items.find(item => item.family === 'editions' &&
      !item.current.present && item.returned.value?.raw?.sha256 === sha(newNotes.bytes));
    need(incomingEditionItem, 'ACCEPTANCE_INCOMING_EDITION_REQUIRED');
    await rejection('36-reject-unresolved-occurrence-dependency', local, id,
      () => local.previewDossierReturnChoices(id, {...request,
        decisions: decisions.map(row => row.itemId === incomingEditionItem.id ? {...row, choice: 'CURRENT'} : row)}),
      ['RETURN_DECISION_INVALID']);
    await phase('37-original-draft-cas', async () => {
      const draft = {reviewId: preview.reviewId, dossierId: id, sourceId: received.source.id,
        comparisonSha256: comparison.comparisonSha256, notes: 'Complete retained draft before submission.', pendingRequest: request};
      let current = await local.dossierReturnDraft(id, {reviewId: preview.reviewId});
      if (current.draftVersion === 0)
        current = await local.saveDossierReturnDraft(id, {reviewId: preview.reviewId, expectedDraftVersion: 0, draft});
      need(current.draftVersion === 1 && same(current.draft, draft), 'ACCEPTANCE_DRAFT_RECOVERY_CHANGED');
      await retain(join(directory, 'drafts', 'version-1.json'), jsonBytes(current));
      const before = await head(local, id); let stale = null;
      try { await local.saveDossierReturnDraft(id, {reviewId: preview.reviewId, expectedDraftVersion: 0, draft}); }
      catch (error) { stale = error.code; }
      need(stale === 'RETURN_DRAFT_CONFLICT' && (await head(local, id)).sha256 === before.sha256,
        'ACCEPTANCE_DRAFT_CAS_FAILED');
      const readback = await local.dossierReturnDraft(id, {reviewId: preview.reviewId});
      need(same(readback, current), 'ACCEPTANCE_DRAFT_CAS_CHANGED_SAVED_VALUE');
      return {version: current.draftVersion, conflict: stale, pendingRequestSha256: sha(jsonBytes(request))};
    });
    await phase('38-preview-complete-decisions', async () => {
      const result = await local.previewDossierReturnChoices(id, request);
      need(result.valid && result.result.proposalCount >= 2, 'ACCEPTANCE_REVIEW_PROPOSALS_REQUIRED');
      return result;
    });
    let browserAcceptance = null;
    if (browserSelected) {
      browserAcceptance = await phase('38-browser-original-request', async () => {
        const {runDossierReturnBrowserAcceptance} = await import(pathToFileURL(
          join(featureRoot, 'dossier-returns/browser-acceptance.mjs')).href);
        need(typeof runDossierReturnBrowserAcceptance === 'function', 'ACCEPTANCE_BROWSER_ENTRY_REQUIRED');
        const result = await runDossierReturnBrowserAcceptance({
          workspaceDirectory: local.directory, dossierId: id, reviewId: preview.reviewId,
          source: clone(received.source), originalSourceFile: branch.file, request: clone(request),
          directory: join(directory, 'browser'), playwrightModule, chromiumExecutable
        });
        need(result && result.dossierId === id && result.reviewId === preview.reviewId &&
          result.requestId === request.requestId && result.receipt?.requestId === request.requestId &&
          result.receipt.reviewId === request.reviewId &&
          result.receipt.comparisonSha256 === request.comparisonSha256 &&
          result.receipt.revision === request.expectedRevision + 1 &&
          same(result.receipt.decisions, request.decisions) &&
          Array.isArray(result.files) && Array.isArray(result.nativeOutputs),
          'ACCEPTANCE_BROWSER_ORIGINAL_REQUEST_CHANGED');
        const observed = await local.dossierReturns(id, {requestId: request.requestId});
        need(observed.return && same(observed.return, result.receipt),
          'ACCEPTANCE_BROWSER_RECEIPT_NOT_SAVED');
        return result;
      });
    }
    const accepted = await phase('39-accept-first-return', async () => {
      const result = await local.reviewDossierReturn(id, request);
      const receipt = result.return;
      need(receipt.requestId === request.requestId && receipt.reviewId === request.reviewId &&
        same(receipt.decisions, request.decisions) && receipt.revision === request.expectedRevision + 1,
        'ACCEPTANCE_REVIEW_RECEIPT_CHANGED');
      const current = await head(local, id, receipt.revision);
      const a = current.state.selections.find(row => row.occurrenceId === seed.firstOccurrence);
      const b = current.state.selections.find(row => row.occurrenceId === seed.secondOccurrence);
      const f = current.state.findings.find(row => row.id === seed.firstFinding);
      need(current.state.title === returnedTitle && current.state.description === localDescription &&
        current.state.questions.find(row => row.id === qa).notes === mergedQuestionNote &&
        current.state.questions.find(row => row.id === qb).notes === longNote &&
        a.note === localEvidenceNote && b.note === returnedEvidenceNote && b.selected === false &&
        a.questionId === qa && b.questionId === qb &&
        f.title === returnedFindingTitle && f.text === localFindingText &&
        same(f.occurrenceIds, originalBeforeReturn.state.findings.find(row => row.id === f.id).occurrenceIds),
        'ACCEPTANCE_AUTHORED_RECONCILIATION_CHANGED');
      need(current.state.findings.find(row => row.id === seed.secondFinding).occurrenceIds.length === 0,
        'ACCEPTANCE_EXPLICIT_CITATION_REMOVAL_CHANGED');
      for (const family of RETURN_TYPED_FAMILIES) {
        if (family === 'dossierReturnEvents') continue;
        need(same(current.state[family] ?? null, originalBeforeReturn.state[family] ?? null),
          'ACCEPTANCE_CURRENT_TYPED_AUTHORITY_CHANGED', {family});
      }
      need(current.state.dossierReturnEvents.length === 1 && receipt.proposalCount >= 2,
        'ACCEPTANCE_RETURN_EVENT_REQUIRED');
      const edition = current.state.editions.find(row => row.raw?.sha256 === sha(newNotes.bytes));
      need(edition, 'ACCEPTANCE_INCOMING_SOURCE_NOT_INSTALLED');
      const raw = await local.readRetainedEdition(id, edition.id, {revision: receipt.revision});
      need(raw.bytes.equals(newNotes.bytes), 'ACCEPTANCE_INCOMING_SOURCE_BYTES_CHANGED');
      return {return: receipt, firstAcknowledgementReplayed: result.replayed, head: pin(current),
        retainedTypedProposals: receipt.proposalCount, currentTypedAuthorityPreserved: true,
        exactOccurrenceBindingsPreserved: true, addedSourceBytesExact: true};
    });

    async function returnExports(name, review, acceptedReceipt, expectedSource) {
      const outputs = [];
      for (const format of ['json', 'md', 'html', 'source']) {
        const output = await local.exportDossierReturn(id, {reviewId: review.reviewId,
          returnId: acceptedReceipt.id, format});
        const file = join(directory, 'delivery', name + (format === 'source' ? '-original.research.json' : '.' + format));
        const measured = output.stream ? await retainStream(file, output.stream, output) :
          await retain(file, output.body);
        need(measured.bytes === output.bytes && measured.sha256 === output.sha256 &&
          output.identity.returnId === acceptedReceipt.id && output.identity.reviewId === review.reviewId,
          'ACCEPTANCE_RETURN_EXPORT_CHANGED', {format});
        if (format === 'source') need(measured.sha256 === expectedSource.sha256 &&
          measured.bytes === expectedSource.bytes, 'ACCEPTANCE_ORIGINAL_WIRE_EXPORT_CHANGED');
        outputs.push({...measured, format, identity: output.identity});
      }
      return outputs;
    }
    const firstExports = await phase('40-complete-first-return-exports',
      () => returnExports('first-return', preview, accepted.return, branch));
    await phase('41-reopen-full-original-returned-branch', async () => {
      const sourceFile = firstExports.find(row => row.format === 'source').file;
      const receiver = await open('returned-source-cold');
      await receiver.reopenStream(createReadStream(sourceFile), {projection: 'metadata'});
      const reopened = await head(receiver, id);
      need(reopened.sha256 === returnedBeforeReturn.sha256, 'ACCEPTANCE_RETURNED_BRANCH_CHANGED');
      const beforeCitation = await customer.citationUpdates(id, {revision: branch.head.revision, noticeId: selectedNotice.noticeId});
      const afterCitation = await receiver.citationUpdates(id, {revision: branch.head.revision, noticeId: selectedNotice.noticeId});
      need(same(beforeCitation, afterCitation), 'ACCEPTANCE_RETURNED_CITATION_HISTORY_CHANGED');
      const a = await customer.templateExchange.page(id, {revision: branch.head.revision, section: 'operations', limit: 200});
      const b = await receiver.templateExchange.page(id, {revision: branch.head.revision, section: 'operations', limit: 200});
      need(same(a, b) && b.total >= 3, 'ACCEPTANCE_RETURNED_TEMPLATE_HISTORY_CHANGED');
      for (const event of a.items) for (const descriptor of event.blobs) {
        const left = await customer.templateExchange.readBlob(id, {revision: branch.head.revision, sha256: descriptor.sha256});
        const right = await receiver.templateExchange.readBlob(id, {revision: branch.head.revision, sha256: descriptor.sha256});
        need(left.body.equals(right.body), 'ACCEPTANCE_RETURNED_TEMPLATE_SOURCE_CHANGED');
      }
      const nativeRequest = returnedTemplate.request;
      const duplicate = await receiver.templateExchange.review(id, nativeRequest);
      need(duplicate.duplicate && duplicate.operation.id === returnedTemplate.after.state.templateExchangeEvents.at(-1).id &&
        (await head(receiver, id)).sha256 === reopened.sha256, 'ACCEPTANCE_RETURNED_TEMPLATE_REPLAY_CHANGED');
      return {workspace: receiver.directory, head: pin(reopened), nativeCitationReviews: afterCitation.detail.reviews.length,
        nativeTemplateOperations: b.total, allOriginalTemplateBlobsExact: true, originalTemplateReplay: true};
    });
    const firstPortable = await portable('after-first-review', local, id, accepted.return.revision);
    const coldFirst = await open('first-review-cold');
    await phase('42-cold-reopen-first-reviewed-dossier', async () => {
      await coldFirst.reopenStream(createReadStream(firstPortable.file), {projection: 'metadata'});
      const reopened = await head(coldFirst, id);
      need(reopened.sha256 === accepted.head.sha256, 'ACCEPTANCE_REVIEWED_PORTABLE_CHANGED');
      const recovered = await coldFirst.reviewDossierReturn(id, request);
      need(recovered.replayed && same(recovered.return, accepted.return), 'ACCEPTANCE_COLD_REQUEST_REPLAY_CHANGED');
      const source = await coldFirst.exportDossierReturn(id, {reviewId: preview.reviewId,
        returnId: accepted.return.id, format: 'source'});
      await retainStream(join(directory, 'delivery', 'first-cold-original-source.research.json'), source.stream, source);
      need(source.sha256 === branch.sha256 && source.bytes === branch.bytes, 'ACCEPTANCE_COLD_SOURCE_EXPORT_CHANGED');
      return {workspace: coldFirst.directory, head: pin(reopened), acceptedRequestReplayed: true, originalSourceExact: true};
    });
    await update('43-later-original-edit', local, id,
      {description: 'Later current edit after the accepted return; exact saved request recovery must preserve this revision.'});
    await phase('44-recover-exact-request-after-later-edit', async () => {
      const before = await head(local, id), replay = await local.reviewDossierReturn(id, request);
      need(replay.replayed && same(replay.return, accepted.return) &&
        (await head(local, id)).sha256 === before.sha256, 'ACCEPTANCE_LATE_REQUEST_REPLAY_CHANGED');
      const draft = await local.dossierReturnDraft(id, {reviewId: preview.reviewId});
      need(draft.draftVersion === 1 && same(draft.draft.pendingRequest, request),
        'ACCEPTANCE_PENDING_DRAFT_CHANGED_AFTER_REVIEW');
      return {head: pin(before), return: replay.return, replayed: true, savedDraftStillExact: true};
    });
    await rejection('45-reject-changed-request-after-later-edit', local, id,
      () => local.reviewDossierReturn(id, {...request, reviewNote: request.reviewNote + ' Changed request bytes.'}),
      ['RETURN_REQUEST_CONFLICT']);
    await rejection('46-original-divergent-reopen-still-rejects', local, id,
      () => local.reopenStream(createReadStream(branch.file), {projection: 'metadata'}),
      ['PORTABLE_HISTORY_CONFLICT']);

    const secondBase = await portable('second-base', local, id);
    const secondCustomer = await open('second-customer-return');
    await phase('47-second-customer-prefix-reopen', async () => {
      await secondCustomer.reopenStream(createReadStream(secondBase.file), {projection: 'metadata'});
      const original = await head(secondCustomer, id);
      need(original.sha256 === secondBase.head.sha256, 'ACCEPTANCE_SECOND_BASE_CHANGED');
      return {workspace: secondCustomer.directory, head: pin(original)};
    });
    await question('48-current-subsequent-question-edit', local, id, qa, {status: 'parked'});
    await question('49-returned-subsequent-question-edit', secondCustomer, id, qb, {status: 'answered'});
    const currentTemplateEdition = localTemplate.after.state.templateExchangeEvents.at(-1).result.edition;
    await templateReview('50-second-return-template', secondCustomer, id,
      'record_id,operator_note\nprogramme-1,Customer worksheet after the first accepted dossier return\n', currentTemplateEdition);
    await citationReview('51_second_citation', secondCustomer, id, selectedNotice.noticeId, 'follow-up');
    const secondBranch = await portable('second-returned-branch', secondCustomer, id);
    const secondBefore = await saved('second-current-before-return', () => head(local, id));
    const secondReceived = await phase('52-receive-second-original-source',
      () => local.receiveDossierReturnSource(id, {input: createReadStream(secondBranch.file),
        filename: 'second-returned-branch.research.json', contentType: 'application/json', expectedSha256: secondBranch.sha256}));
    const secondPreview = await phase('53-compare-second-return',
      () => local.previewDossierReturn(id, {sourceId: secondReceived.source.id, expectedRevision: secondBefore.state.revision}));
    const secondReport = await local.exportDossierReturn(id, {reviewId: secondPreview.reviewId, format: 'json'});
    await retain(join(directory, 'reviews', 'second-comparison.json'), secondReport.body);
    const secondComparison = JSON.parse(secondReport.body.toString('utf8')).comparison;
    need(secondComparison.base.sha256 === secondBase.head.sha256 &&
      secondComparison.base.revision === secondBase.head.revision, 'ACCEPTANCE_SECOND_COMMON_ANCESTOR_CHANGED');
    const secondRequest = await saved('second-return-review', () => ({
      requestId: operation + ':second-return', reviewId: secondPreview.reviewId,
      expectedRevision: secondBefore.state.revision, comparisonSha256: secondComparison.comparisonSha256,
      reviewedBy: request.reviewedBy, reviewNote: 'Review a subsequent customer branch while retaining the first accepted return and all original source.',
      decisions: decisionsFor(secondComparison)
    }));
    const secondAccepted = await phase('54-accept-second-native-return', async () => {
      await local.previewDossierReturnChoices(id, secondRequest);
      const result = await local.reviewDossierReturn(id, secondRequest), current = await head(local, id, result.return.revision);
      need(current.state.questions.find(row => row.id === qa).status === 'parked' &&
        current.state.questions.find(row => row.id === qb).status === 'answered',
        'ACCEPTANCE_SECOND_AUTHORED_RECONCILIATION_CHANGED');
      need(current.state.dossierReturnEvents.length === 2 &&
        same(current.state.dossierReturnEvents[0], secondBefore.state.dossierReturnEvents[0]),
        'ACCEPTANCE_PRIOR_RETURN_HISTORY_CHANGED');
      for (const family of RETURN_TYPED_FAMILIES) if (family !== 'dossierReturnEvents')
        need(same(current.state[family] ?? null, secondBefore.state[family] ?? null),
          'ACCEPTANCE_SECOND_TYPED_AUTHORITY_CHANGED', {family});
      return {return: result.return, head: pin(current), firstAcknowledgementReplayed: result.replayed,
        priorReturnEventExact: true, typedAuthorityPreserved: true};
    });
    await phase('55-complete-second-return-exports',
      () => returnExports('second-return', secondPreview, secondAccepted.return, secondBranch));
    const finalPortable = await portable('complete-two-returns', local, id, secondAccepted.return.revision);
    const cold = await open('complete-cold');
    await phase('56-cold-reopen-complete-nested-history', async () => {
      await cold.reopenStream(createReadStream(finalPortable.file), {projection: 'metadata'});
      const original = await head(cold, id);
      need(original.sha256 === secondAccepted.head.sha256 && original.state.dossierReturnEvents.length === 2,
        'ACCEPTANCE_NESTED_HISTORY_CHANGED');
      for (const [reviewRequest, receipt, rawSource] of [
        [request, accepted.return, branch], [secondRequest, secondAccepted.return, secondBranch]
      ]) {
        const replay = await cold.reviewDossierReturn(id, reviewRequest);
        need(replay.replayed && same(replay.return, receipt), 'ACCEPTANCE_NESTED_REQUEST_REPLAY_CHANGED');
        const output = await cold.exportDossierReturn(id, {reviewId: receipt.reviewId, returnId: receipt.id, format: 'source'});
        need(output.sha256 === rawSource.sha256 && output.bytes === rawSource.bytes, 'ACCEPTANCE_NESTED_SOURCE_EXPORT_CHANGED');
        await retainStream(join(directory, 'delivery', receipt.id + '-cold-source.research.json'), output.stream, output);
      }
      const actual = await local.templateExchange.page(id, {revision: secondAccepted.return.revision, section: 'operations', limit: 200});
      const reopened = await cold.templateExchange.page(id, {revision: secondAccepted.return.revision, section: 'operations', limit: 200});
      need(same(actual, reopened), 'ACCEPTANCE_LOCAL_TYPED_COLD_REOPEN_CHANGED');
      return {workspace: cold.directory, head: pin(original), returns: 2, exactOriginalRequestsRecovered: 2,
        exactOriginalSourcesExported: 2, currentNativeTemplateHistoryExact: true};
    });
    await update('57-edit-cold-reopened-original', cold, id,
      {title: 'Editable cold receiving after two reviewed dossier returns'});
    const prefixStore = await open('prefix-receiving');
    await phase('58-original-prefix-extension-and-shorter-reopen', async () => {
      await prefixStore.reopenStream(createReadStream(base.file), {projection: 'metadata'});
      await prefixStore.reopenStream(createReadStream(finalPortable.file), {projection: 'metadata'});
      need((await head(prefixStore, id)).sha256 === finalPortable.head.sha256, 'ACCEPTANCE_PREFIX_EXTENSION_CHANGED');
      const newer = await head(cold, id);
      await cold.reopenStream(createReadStream(finalPortable.file), {projection: 'metadata'});
      need((await head(cold, id)).sha256 === newer.sha256, 'ACCEPTANCE_SHORTER_PREFIX_OVERWROTE_NEWER_HEAD');
      await prefixStore.reopen(JSON.parse((await ordinary(base.file)).toString('utf8')));
      need((await head(prefixStore, id)).sha256 === finalPortable.head.sha256, 'ACCEPTANCE_BUFFERED_SHORTER_PREFIX_CHANGED');
      return {extendedWorkspace: prefixStore.directory, extendedHead: finalPortable.head,
        editableColdWorkspace: cold.directory, newerHead: pin(newer), prefixExtension: true, shorterPrefixPreserved: true};
    });
    const editable = await portable('editable-cold-result', cold, id);
    await phase('59-original-complete-reports', async () => {
      const outputs = [];
      for (const format of ['md', 'html']) {
        const output = await local.exportDossier(id, {format, revision: secondAccepted.return.revision});
        outputs.push(await retain(join(directory, 'delivery', 'complete-original-dossier.' + format), output.body));
      }
      const changes = await local.dossierReturns(id, {offset: 0, limit: 100});
      need(changes.total === 2 && changes.items.some(row => row.id === accepted.return.id) &&
        changes.items.some(row => row.id === secondAccepted.return.id), 'ACCEPTANCE_RETURN_HISTORY_INCOMPLETE');
      await retain(join(directory, 'delivery', 'complete-return-history.json'), jsonBytes(changes));
      return {outputs, returnHistory: changes};
    });
    const checks = {
      divergentAuthoredFields: true, exactOccurrenceBindings: true, genuineCrossrefCitationReview: true,
      genuineTemplateReviewHistory: true, returnedTypedRevisionBeyondLocalHead: true, currentTypedAuthorityPreserved: true,
      explicitConflictEdit: true, completeValueDownloads: true, missingDecisionRejectedBeforeCommit: true,
      unresolvedOccurrenceDependencyRejectedBeforeCommit: true, exactDraftCompareAndSwap: true,
      exactSavedRequestReplayAfterLaterEdit: true, changedSavedRequestRejected: true,
      exactOriginalWireExport: true, originalReturnedBranchColdReopen: true,
      originalTypedRequestReplayOnReturnedBranch: true, reviewedDossierColdReopen: true,
      subsequentEditAndSecondReturn: true, nestedOriginalSourceAndRequestReopen: true,
      tamperedNativeCitationSourceRejectedBeforeCommit: true, originalDivergentReopenStillRejects: true,
      originalPrefixExtensionAndShorterReopen: true, editableColdReceiving: true,
      ...(browserAcceptance ? {originalBrowserPendingRequestRecovery: true} : {})
    };
    const sourceExecution = await nativeModules.retainObservation('COMPLETE', {verify: true});
    const report = [
      '# Research dossier return native acceptance', '',
      'Operation: ' + operation, '', 'Dossier: ' + id, '',
      'The original Research store completed two explicit reviews of divergent customer branches. Authored fields and exact occurrence selections were reconciled; existing typed histories remained authoritative. Complete returned citation and template histories reopen through the original store from their retained source exports.', '',
      '## Actual saved revisions', '',
      '- Shared original revision: ' + seed.base.revision + ' / ' + seed.base.sha256,
      '- First returned head: ' + branch.head.revision + ' / ' + branch.head.sha256,
      '- First accepted review: ' + accepted.return.revision + ' / ' + accepted.return.revisionSha256,
      '- Second accepted review: ' + secondAccepted.return.revision + ' / ' + secondAccepted.return.revisionSha256,
      '- Editable cold result: ' + editable.head.revision + ' / ' + editable.head.sha256, '',
      '## Retained evidence', '',
      'SOURCE_SELECTION.json preserves the complete selected engine manifest. SOURCE.json binds every selected original engine and asset file, and source/ contains every complete body. native-module-observations/ records Node’s actual module resolution and loading for each retained attempt; installed runtime modules remain explicitly identified with their actual paths. inputs/ holds the complete Crossref edition, authored source documents, workbook CSVs, and altered native input used for precommit rejection. retained/, phases/, reviews/, values/, drafts/, portable/, and delivery/ retain the actual requests, decisions, accepted results, exact source exports, reports, and editable original portable histories.', '',
      'Run the same command and directory to recover retained phases. Each unacknowledged ordinary mutation is reconciled against its exact original next revision before the programme advances. Native request-bearing operations retain their original IDs and payloads.',
      ...(browserAcceptance ? ['', 'The browser journey used the same saved native draft and exact first-return request. Its public screenshots, full downloads and receipts are in browser/. Native phase39 then recovered that same accepted request. The invocation-private browser profile and listener state remain in browser/private/.'] : []), '',
      '## Completed native checks', '', ...Object.keys(checks).map(name => '- ' + name), ''
    ].join('\n');
    await retain(join(directory, 'ACCEPTANCE.md'), Buffer.from(report));
    const files = [];
    async function inventory(folder, prefix = '') {
      for (const entry of (await fs.readdir(folder, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!prefix && ['workspaces', 'RUNNING.json', 'COMPLETE.json', 'failures', 'retained-locks'].includes(entry.name)) continue;
        if (!prefix && entry.name === 'browser') continue; // Explicit public browser outputs are added below.
        need(!entry.isSymbolicLink(), 'ACCEPTANCE_OUTPUT_SYMLINK', {path: entry.name});
        const path = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.isDirectory()) await inventory(join(folder, entry.name), path);
        else if (entry.isFile()) {
          const measured = await streamIdentity(join(folder, entry.name));
          files.push({path, bytes: measured.bytes, sha256: measured.sha256});
        }
      }
    }
    await inventory(directory);
    if (browserAcceptance) {
      const selected = new Map(files.map(row => [row.path, row]));
      const browserRoot = join(directory, 'browser');
      for (const item of [...browserAcceptance.files, ...browserAcceptance.nativeOutputs]) {
        need(item && typeof item.path === 'string' && typeof item.filename === 'string' &&
          Number.isSafeInteger(item.bytes) && item.bytes >= 0 && /^[a-f0-9]{64}$/.test(item.sha256),
          'ACCEPTANCE_BROWSER_OUTPUT_INVALID');
        const file = resolve(browserRoot, item.path), localPath = relative(browserRoot, file).split(sep).join('/');
        need(localPath && !localPath.startsWith('../') && !isAbsolute(localPath) &&
          localPath !== 'private' && !localPath.startsWith('private/'),
          'ACCEPTANCE_BROWSER_OUTPUT_SCOPE_CHANGED', {path: item.path});
        const measured = await streamIdentity(file);
        need(measured.bytes === item.bytes && measured.sha256 === item.sha256,
          'ACCEPTANCE_BROWSER_OUTPUT_CHANGED', {path: item.path});
        const path = relative(directory, file).split(sep).join('/');
        const row = {path, bytes: measured.bytes, sha256: measured.sha256};
        if (selected.has(path)) need(same(selected.get(path), row), 'ACCEPTANCE_OUTPUT_IDENTITY_CONFLICT', {path});
        else { files.push(row); selected.set(path, row); }
      }
      files.sort((a, b) => a.path.localeCompare(b.path));
    }
    const result = {schema: SCHEMA, state: 'COMPLETE', operation, selection,
      runtime: {node: process.version, nodeExecutable: process.execPath, python, platform: process.platform, architecture: process.arch},
      dossierId: id, seed, firstReturn: accepted, secondReturn: secondAccepted, sourceExecution,
      finalPortable, editablePortable: editable, browserAcceptance, checks, files,
      bytes: files.reduce((sum, row) => sum + row.bytes, 0), completedAt: new Date().toISOString()};
    await retain(join(directory, 'COMPLETE.json'), jsonBytes(result));
    return result;
  } catch (error) {
    const failure = {schema: SCHEMA, state: 'FAILED', operation, phase: activePhase,
      code: error.code ?? error.name ?? 'ACCEPTANCE_FAILED', details: error.details ?? null,
      message: String(error.message ?? error), observedAt: new Date().toISOString()};
    if (nativeModules) {
      try { failure.nativeModules = await nativeModules.retainObservation('FAILED'); }
      catch (retention) { failure.nativeModuleRetentionFailure = retention.code ?? retention.name; }
    }
    try {
      await privateDirectory(join(directory, 'failures'));
      let index = 1;
      while (await optional(join(directory, 'failures', String(index).padStart(4, '0') + '.json'))) index++;
      await retain(join(directory, 'failures', String(index).padStart(4, '0') + '.json'), json(failure));
    } catch (retention) {
      failure.retentionFailure = retention.code ?? retention.name;
      process.stderr.write(JSON.stringify(failure) + '\n');
    }
    error.acceptance = failure; throw error;
  } finally { nativeModules?.close(); await release(); }
}

async function main() {
  const {values} = parseArgs({strict: true, options: {
    'feature-root': {type: 'string'}, directory: {type: 'string'}, 'source-manifest': {type: 'string'},
    'crossref-edition': {type: 'string'}, 'crossref-sha256': {type: 'string'},
    'target-doi': {type: 'string'}, python: {type: 'string'}, operation: {type: 'string'},
    'playwright-module': {type: 'string'}, 'chromium-executable': {type: 'string'},
    help: {type: 'boolean'}
  }});
  if (values.help) {
    process.stdout.write('Run the complete original Research dossier-return acceptance programme.\n\n' +
      'node source-native-acceptance.mjs --feature-root /ABS/research-dossiers --directory /ABS/owned-run ' +
      '--source-manifest /ABS/FINAL_SOURCE_MATERIALIZATION.json ' +
      '--crossref-edition /ABS/original-crossref-edition.json --crossref-sha256 FULL_SHA256 ' +
      '[--target-doi DOI] [--python /ABS/python3] [--operation SAME_OPERATION] ' +
      '[--playwright-module /ABS/playwright/index.mjs --chromium-executable /ABS/chromium]\n\n' +
      'The selected feature root must contain the complete original engine cohort declared by --source-manifest (schema research-dossier-return-native-final-cohort-v1, with complete relative path/mode/bytes/sha256 rows). Node 24 records actual module resolution and loading through its original loader; the programme retains every selected source and original browser asset without following imports embedded in text. The manifest must select this exact programme body alongside the reviewed return source, store, engine, contracts and dossier integration. The Crossref edition must be an exact retained native capture or crossref-document edition containing a registered notice and its target. Python runs the original CSV workbook inspector. Supply both browser runtime paths to include the original browser journey before the first native return acknowledgement; it reuses the same saved request and retains complete public outputs. Use the same paths, selected runtime options and operation to recover an interrupted run. COMPLETE.json and ACCEPTANCE.md bind the actual native outcomes and complete retained source.\n');
    return;
  }
  const result = await runDossierReturnNativeAcceptance({featureRoot: values['feature-root'],
    directory: values.directory, sourceManifest: values['source-manifest'],
    crossrefEdition: values['crossref-edition'], crossrefSha256: values['crossref-sha256'],
    targetDoi: values['target-doi'], python: values.python ?? 'python3', operation: values.operation,
    playwrightModule: values['playwright-module'], chromiumExecutable: values['chromium-executable']});
  process.stdout.write(JSON.stringify({schema: result.schema, state: result.state, operation: result.operation,
    dossierId: result.dossierId, firstReturn: result.firstReturn.return.id, secondReturn: result.secondReturn.return.id,
    complete: join(values.directory, 'COMPLETE.json'), files: result.files.length, bytes: result.bytes,
    recovered: result.recovered ?? false}) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => {
    process.stderr.write(JSON.stringify(error.acceptance ?? {code: error.code ?? error.name, message: error.message}) + '\n');
    process.exitCode = 1;
  });
