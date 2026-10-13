// MIT. Portable original FRED sources for ordinary editable Operating Plans.
import { constants } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { extractFredOperatingTar } from './archive-io.mjs';
import { withPrivateLock } from '../../routescan/quota.mjs';
import { exportFredProject, readFredProject, receiveFredProject } from '../project.mjs';
import { validateResearchExtension } from '../research/bundle.mjs';
import { canonicalJSONDigest } from '../canonical-stream.mjs';
import { listFredDdpPublicationOperations, readFredDdpPublicationOperation,
  openFredDdpPublicationFile, attachFredDdpPublishedProgramme } from '../ddp/published-workspace.mjs';
import { inspectFredOperatingSource, inspectFredOperatingPlanSource } from '../../../distribution/discovery/fred-operating-plan.mjs';
import { inspectOperatingPlan, receiveOperatingPlan } from '../../../distribution/discovery/operating-plan.mjs';

import { FRED_OPERATING_PACKAGE_SCHEMA, FRED_OPERATING_SOURCE_FILE, FRED_OPERATING_MANIFEST_FILE, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, MAX_FRED_OPERATING_PACKAGE_BYTES, MAX_FRED_OPERATING_BUNDLE_BYTES, HASH, ID, utf8, stamp, stop, need, same, pathName, ref, absolute, directory, opened, unchanged, describe, readJson, optional, writeStream, writeJson, copy } from './files.mjs';
export { FRED_OPERATING_PACKAGE_SCHEMA, FRED_OPERATING_SOURCE_FILE, FRED_OPERATING_MANIFEST_FILE, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, MAX_FRED_OPERATING_PACKAGE_BYTES, MAX_FRED_OPERATING_BUNDLE_BYTES } from './files.mjs';
const INVENTORY = ['captures','reviews','publications','briefingTemplates','briefingSuccessors',
  'releaseCaptures','releaseWatches','releasePlans','releaseCatchUps','ddpCrosswalks','ddpPackages','ddpMigrations','ddpReceivings'];
const clone = value => JSON.parse(JSON.stringify(value));
/** Complete original operation bodies define every prefix; no result or abandoned action is omitted. */
export function fredOperatingHistory(state) {
  need(state && typeof state.id === 'string' && typeof state.createdAt === 'string' &&
    Array.isArray(state.operations) && state.revision === state.operations.length + 1, 'The complete project operation chronology differs.');
  const history = [{ revision:1, sha256:canonicalJSONDigest({ projectId:state.id, createdAt:state.createdAt }) }], ids = new Set();
  for (const operation of state.operations) {
    need(operation && typeof operation.id === 'string' && !ids.has(operation.id) && operation.result?.revision === history.length + 1,
      'The original operation revisions must remain complete and consecutive.');
    ids.add(operation.id);
    history.push({ revision:operation.result.revision, sha256:canonicalJSONDigest({ previous:history.at(-1).sha256, operation }) });
  }
  return history;
}
function bundleIdentity(bundle) {
  need(bundle && /^stellar-forge\.fred-project-bundle\.v[1-7]$/.test(bundle.schema ?? '') && HASH.test(bundle.bundleSha256 ?? ''),
    'Select the original complete versioned project bundle.');
  const { bundleSha256, ...core } = bundle;
  need(canonicalJSONDigest(core) === bundleSha256, 'The complete project bundle identity changed.');
  need(!bundle.state?.pending, 'Complete the original project action before freezing its handover.');
  fredOperatingHistory(bundle.state);
  if (bundle.schema === 'stellar-forge.fred-project-bundle.v7') {
    need(bundle.state.research !== undefined, 'The complete research project catalogue is required.');
    validateResearchExtension(bundle.research, bundle.state);
  } else need(bundle.state.research === undefined && bundle.research === undefined,
    'Research sources require the complete original version 7 project bundle.');
  return bundle;
}
function inventoryFor(state) {
  return { ...Object.fromEntries(INVENTORY.map(key => [key, clone(state[key] ?? [])])), qcew:clone(state.qcew ?? null),
    ...(state.research === undefined ? {} : { research:clone(state.research) }) };
}
function descriptorFor(bundle, artifact, capturedAt, published) {
  bundleIdentity(bundle); const state = bundle.state, history = fredOperatingHistory(state);
  const inventory = inventoryFor(state);
  const evidence = [
    { id:'project/' + state.id, kind:'project', reference:'/state', artifact },
    ...INVENTORY.flatMap(key => inventory[key].map((item, index) => ({
      id:key + '/' + index + '/' + (item.id ?? item.captureId ?? ''), kind:key, reference:'/state/' + key + '/' + index, artifact
    }))),
    ...state.operations.map((operation, index) => ({ id:'operation/' + operation.id, kind:operation.kind,
      reference:'/state/operations/' + index, artifact })),
    ...(state.qcew ? [{ id:'qcew/' + state.id, kind:'qcew', reference:'/state/qcew', artifact }] : []),
    ...(state.research === undefined ? [] : [
      { id:'research/' + state.id, kind:'research', reference:'/state/research', artifact },
      ...['entries','sources','reviews','products'].flatMap(family => state.research[family].map((item,index) => ({
        id:'research-' + family + '/' + index + '/' + item.id, kind:'research-' + family,
        reference:'/state/research/' + family + '/' + index, artifact
      })))
    ]),
    ...published.filter(item => item.artifact).map(item => ({
      id:'published/' + item.id, kind:'published', reference:item.id, artifact:item.artifact
    }))
  ];
  const core = { schema:'stellar-forge.fred-operating-source.v1', capturedAt,
    project:{ id:state.id, title:state.title, revision:state.revision, createdAt:state.createdAt,
      selection:clone(state.selection), bundleSha256:bundle.bundleSha256 },
    artifact, history, inventory, published:clone(published), evidence };
  return inspectFredOperatingSource({ ...core, id:'fred-operating-source-' + canonicalJSONDigest(core) });
}
async function publicationSelection(directoryPath, publicationIds, projectId) {
  const entries = [], seen = new Set(); let offset = 0;
  do {
    const page = await listFredDdpPublicationOperations({ directory:directoryPath, offset, limit:500 });
    need(page.projectId === projectId, 'The publication index belongs to another project.');
    for (const row of page.items) { need(!seen.has(row.id), 'The publication listing changed while it was captured.'); seen.add(row.id); entries.push(row); }
    need(page.nextOffset === null || page.nextOffset > offset, 'The publication listing cannot advance.');
    offset = page.nextOffset;
  } while (offset !== null);
  if (publicationIds !== null) need(publicationIds.every(id => seen.has(id)), 'Choose publication IDs from this project.');
  const selected = publicationIds === null ? entries : publicationIds.map(id => entries.find(row => row.id === id));
  const views = [];
  for (const row of selected) {
    const view = await readFredDdpPublicationOperation({ directory:directoryPath, id:row.id });
    need(view.projectId === projectId, 'The publication view belongs to another project.');
    if (view.state === 'COMPLETE') {
      const archive = view.files.find(file => file.name === 'edition-package.tar.gz');
      need(archive && HASH.test(archive.sha256) && Number.isSafeInteger(archive.bytes), 'The completed edition must retain its complete original archive.');
    }
    views.push(view);
  }
  return views;
}
function result(source, sourceFile, manifestFile, root, reused) {
  return { source, sourceFile, manifestFile, directory:root, projectDirectory:null, reused };
}
async function owner(root, work, signal) {
  stop(signal); absolute(root, 'Output directory'); await directory(root, true);
  return withPrivateLock(root, 'operating-source.lock', () => work());
}
/** Capture already retained originals, complete chronology and selected complete edition archives. */
export async function captureFredOperatingSource({ directory:originalDirectory, outputDirectory, capturedAt,
  publicationIds = null, qcewSourceContexts = null, signal } = {}) {
  absolute(originalDirectory, 'Original project directory'); absolute(outputDirectory, 'Output directory');
  need(originalDirectory !== outputDirectory && !outputDirectory.startsWith(originalDirectory + '/') &&
    !originalDirectory.startsWith(outputDirectory + '/'), 'Choose a separate source package directory.');
  need(typeof capturedAt === 'string' && new Date(capturedAt).toISOString() === capturedAt, 'Supply the exact UTC ISO capture time.');
  need(publicationIds === null || Array.isArray(publicationIds) && publicationIds.every(id => ID.test(id)) &&
    new Set(publicationIds).size === publicationIds.length, 'Choose distinct original publication operation IDs, or all operations.');
  const request = { directory:originalDirectory, capturedAt, publicationIds };
  return owner(outputDirectory, async () => {
    let selection = await optional(outputDirectory, 'SELECTION.json', MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    if (selection) same(selection.request, request, 'Original source selection');
    const completed = await optional(outputDirectory, FRED_OPERATING_MANIFEST_FILE, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    if (completed) {
      need(selection, 'The completed package lost its original capture selection.');
      return { ...(await inspectFredOperatingSourcePackage({ directory:outputDirectory, expectedSource:completed.source, signal })), reused:true };
    }
    let bundle;
    if (!selection) {
      const names = await readdir(outputDirectory);
      need(names.every(name => name === 'operating-source.lock'), 'Choose a fresh directory or resume its original captured source.');
      bundle = bundleIdentity(await exportFredProject({ directory:originalDirectory, qcewSourceContexts }));
      const views = await publicationSelection(originalDirectory, publicationIds, bundle.state.id);
      const current = await readFredProject(originalDirectory);
      need(current.id === bundle.state.id && current.revision === bundle.state.revision && !current.pending,
        'The original project changed while selecting the source; capture its current complete revision.');
      selection = { schema:'stellar-forge.fred-operating-selection.v1', request, bundleSha256:bundle.bundleSha256, projectId:bundle.state.id, views };
      await writeJson(outputDirectory, 'SELECTION.json', selection, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    }
    if (!bundle) {
      bundle = await optional(outputDirectory, 'project/project-bundle.json', MAX_FRED_OPERATING_BUNDLE_BYTES, signal);
      if (!bundle) bundle = await exportFredProject({ directory:originalDirectory, qcewSourceContexts });
      bundleIdentity(bundle);
      need(bundle.bundleSha256 === selection.bundleSha256 && bundle.state.id === selection.projectId,
        'Resume with the exact selected project bundle; the original project has advanced.');
    }
    const artifact = await writeJson(outputDirectory, 'project/project-bundle.json', bundle, MAX_FRED_OPERATING_BUNDLE_BYTES, signal);
    const files = [artifact], published = []; let total = artifact.bytes;
    for (const view of selection.views) {
      stop(signal); let archive = null;
      if (view.state === 'COMPLETE') {
        const descriptor = view.files.find(file => file.name === 'edition-package.tar.gz');
        archive = { path:'published/' + view.id + '/edition-package.tar.gz', bytes:descriptor.bytes, sha256:descriptor.sha256 };
        total += archive.bytes; need(total <= MAX_FRED_OPERATING_PACKAGE_BYTES, 'The complete handover exceeds 4 GiB; explicitly select the original editions to hand over.');
        let retained = null;
        try { retained = await describe(outputDirectory, archive.path, signal); } catch(error) { if (error.code !== 'ENOENT') throw error; }
        if (retained) same(retained, archive, 'Retained original edition archive');
        else {
          const openedFile = await openFredDdpPublicationFile({ directory:originalDirectory, id:view.id,
            name:descriptor.name, expectedSha256:descriptor.sha256 });
          try {
            need(openedFile.projectId === selection.projectId && openedFile.operationId === view.id, 'The original archive belongs to another publication.');
            const before = await openedFile.file.stat();
            await writeStream(outputDirectory, archive.path, openedFile.file.createReadStream({ autoClose:false }), archive, signal);
            need(stamp(await openedFile.file.stat()) === stamp(before), 'The publication archive changed while being copied.');
          } finally { await openedFile.file.close(); }
        }
        files.push(archive);
      }
      published.push({ id:view.id, view, artifact:archive });
    }
    const source = descriptorFor(bundle, artifact, capturedAt, published);
    const sourceFile = await writeJson(outputDirectory, FRED_OPERATING_SOURCE_FILE, source, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    files.push(sourceFile); total += sourceFile.bytes;
    need(total <= MAX_FRED_OPERATING_PACKAGE_BYTES, 'The complete package exceeds 4 GiB.');
    const manifest = { schema:FRED_OPERATING_PACKAGE_SCHEMA, source:sourceFile, projectId:source.project.id,
      bundleSha256:source.project.bundleSha256, files:files.sort((a,b) => a.path.localeCompare(b.path)), bytes:total };
    await writeJson(outputDirectory, FRED_OPERATING_MANIFEST_FILE, manifest, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    return { ...(await inspectFredOperatingSourcePackage({ directory:outputDirectory, expectedSource:sourceFile, signal })), reused:false };
  }, signal);
}
async function inspectPackage(root, expectedSource, signal) {
  absolute(root, 'Package directory'); await directory(root);
  ref(expectedSource); need(expectedSource.path === FRED_OPERATING_SOURCE_FILE && expectedSource.bytes <= MAX_FRED_OPERATING_DESCRIPTOR_BYTES,
    'Select the complete original source.json descriptor.');
  const source = inspectFredOperatingSource(await readJson(root, expectedSource.path, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, expectedSource, signal));
  const manifest = await readJson(root, FRED_OPERATING_MANIFEST_FILE, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, null, signal);
  need(manifest.schema === FRED_OPERATING_PACKAGE_SCHEMA && Array.isArray(manifest.files), 'Read the complete original package manifest.');
  same(manifest.source, expectedSource, 'Manifest source'); need(manifest.projectId === source.project.id &&
    manifest.bundleSha256 === source.project.bundleSha256, 'The package manifest changed its original project.');
  const expected = new Map();
  for (const value of [expectedSource, source.artifact, ...source.published.filter(item => item.artifact).map(item => item.artifact)]) {
    ref(value); need(!expected.has(value.path), 'The package repeats an original file path.'); expected.set(value.path, value);
  }
  need(manifest.files.length === expected.size, 'Keep the complete selected source file inventory.');
  let total = 0;
  for (const value of manifest.files) {
    ref(value); same(expected.get(value.path), value, 'Manifest member');
    same(await describe(root, value.path, signal), value, 'Complete original artifact');
    total += value.bytes; expected.delete(value.path);
  }
  need(expected.size === 0 && total === manifest.bytes && total <= MAX_FRED_OPERATING_PACKAGE_BYTES, 'The complete package total differs.');
  const bundle = bundleIdentity(await readJson(root, source.artifact.path, MAX_FRED_OPERATING_BUNDLE_BYTES, source.artifact, signal));
  const recomputed = descriptorFor(bundle, source.artifact, source.capturedAt, source.published);
  same(recomputed, source, 'Original source inventories, evidence and complete history');
  for (const item of source.published) {
    need(item.id === item.view.id && item.view.projectId === source.project.id, 'A retained publication belongs to another original project.');
    if (item.artifact) {
      need(item.view.state === 'COMPLETE', 'Only a complete original publication has a completed archive.');
      const entry = item.view.files.find(file => file.name === 'edition-package.tar.gz');
      need(entry && entry.bytes === item.artifact.bytes && entry.sha256 === item.artifact.sha256, 'The publication archive differs from its original view.');
    } else need(item.view.state !== 'COMPLETE', 'The complete original publication lost its archive.');
  }
  const manifestFile = await describe(root, FRED_OPERATING_MANIFEST_FILE, signal);
  return { source, manifest, bundle, sourceFile:expectedSource, manifestFile };
}
/** Read every selected original byte and recompute the source descriptor from the full project. */
export async function inspectFredOperatingSourcePackage({ directory:root, expectedSource, signal } = {}) {
  const value = await inspectPackage(root, expectedSource, signal);
  return result(value.source, value.sourceFile, value.manifestFile, root, true);
}

// The original publication writer emits USTAR regular files only. Receive that exact format,
// rejecting links, devices, duplicate paths, redirects and extra members.
async function extractEdition(root, artifact, output, view, signal) {
  const files = view.files.filter(file => file.name !== 'edition-package.tar.gz')
    .map(file => ({ path:file.name, bytes:file.bytes, sha256:file.sha256 }));
  need(files.length === view.files.length - 1, 'The original edition must carry one complete archive.');
  await extractFredOperatingTar({ root, archive:artifact, output, files, signal });
  const edition = await readJson(output, 'edition.json', MAX_FRED_OPERATING_DESCRIPTOR_BYTES, null, signal);
  need(edition.schema === 'stellar-forge.fred-ddp-publication-edition.v1' && edition.operationId === view.id &&
    edition.projectId === view.projectId && edition.migrationId === view.migrationId, 'The extracted edition lost its original project and operation.');
  same(edition.result, view.result, 'Original edition result');
  return edition;
}
async function receivePlan(root, incoming, source, signal) {
  const old = await optional(root, 'OPERATING-PLAN.json', MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
  if (old) inspectFredOperatingPlanSource(old, source);
  if (incoming === null) return old;
  inspectFredOperatingPlanSource(incoming, source);
  const value = old ? receiveOperatingPlan(incoming, old) : receiveOperatingPlan(incoming);
  // The generic receiver returns the retained plan (same prefix conflict rules as the browser).
  const plan = value?.plan ?? value;
  inspectOperatingPlan(plan);
  if (old) {
    if (canonicalJSONDigest(old) !== canonicalJSONDigest(plan)) {
      const temporary = 'OPERATING-PLAN-' + canonicalJSONDigest(plan) + '.json';
      await writeJson(root, temporary, plan, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
      const { rename } = await import('node:fs/promises');
      await rename(join(root, temporary), join(root, 'OPERATING-PLAN.json'));
    }
  } else await writeJson(root, 'OPERATING-PLAN.json', plan, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
  // Also sync an identical retry after a rename whose directory sync failed.
  const directory = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await directory.sync(); } finally { await directory.close(); }
  return plan;
}
/** Restore the complete original project and reopen retained publication editions without acquisition. */
export async function receiveFredOperatingSource({ sourceDirectory, destination, expectedSource,
  qcewSourceContexts = null, plan = null, signal } = {}) {
  absolute(sourceDirectory, 'Source directory'); absolute(destination, 'Receiving directory'); ref(expectedSource);
  need(sourceDirectory !== destination && !destination.startsWith(sourceDirectory + '/') && !sourceDirectory.startsWith(destination + '/'),
    'Use a separate receiving directory.');
  return owner(destination, async () => {
    const request = { schema:'stellar-forge.fred-operating-receive-request.v1', source:expectedSource };
    const prior = await optional(destination, 'RECEIVE.json', MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    if (prior) same(prior, request, 'Original receiving selection');
    else {
      need((await readdir(destination)).every(name => name === 'operating-source.lock'), 'Choose an empty receiving directory or its original continuation.');
      await writeJson(destination, 'RECEIVE.json', request, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    }
    let checked;
    const retained = await optional(destination, FRED_OPERATING_MANIFEST_FILE, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    if (retained) checked = await inspectPackage(destination, expectedSource, signal);
    else {
      checked = await inspectPackage(sourceDirectory, expectedSource, signal);
      for (const file of checked.manifest.files) { stop(signal); await copy(sourceDirectory, file, destination, signal); }
      await copy(sourceDirectory, checked.manifestFile, destination, signal);
    }
    const projectDirectory = join(destination, 'project-workspace');
    const received = await receiveFredProject({ directory:projectDirectory, bundle:checked.bundle, qcewSourceContexts });
    const state = await readFredProject(projectDirectory), currentHistory = fredOperatingHistory(state);
    need(state.id === checked.source.project.id && currentHistory.some(item => item.revision === checked.source.project.revision &&
      item.sha256 === checked.source.history.at(-1).sha256), 'The receiving project diverged from its original operation history.');
    const publications = [];
    for (const item of checked.source.published) {
      stop(signal); if (!item.artifact) continue;
      const workspace = join(destination, 'published-workspaces', item.id);
      const edition = await extractEdition(destination, item.artifact, workspace, item.view, signal);
      let existing = null;
      try { existing = await readFredDdpPublicationOperation({ directory:projectDirectory, id:item.id }); }
      catch(error) { if (error.code !== 'ENOENT') throw error; }
      if (existing?.state === 'COMPLETE') {
        same(existing.result, item.view.result, 'Received publication result');
        need(existing.migrationId === item.view.migrationId, 'The local publication belongs to another migration.');
      } else {
        const expectedRevision = existing?.expectedRevision ?? (await readFredProject(projectDirectory)).revision;
        existing = await attachFredDdpPublishedProgramme({ directory:projectDirectory, id:item.id, expectedRevision,
          migrationId:item.view.migrationId, workspace, output:edition.programme.output,
          manifest:edition.programme.manifestPath, signal });
      }
      need(existing.state === 'COMPLETE', 'The original retained publication did not complete receiving.');
      const archive = existing.files.find(file => file.name === 'edition-package.tar.gz');
      need(archive?.sha256 === item.artifact.sha256 && archive.bytes === item.artifact.bytes,
        'The reopened publication archive differs from the original exact edition.');
      publications.push({ id:item.id, projectId:existing.projectId, comparisonId:existing.comparisonId,
        requestSha256:existing.requestSha256, archive:{ name:archive.name, bytes:archive.bytes, sha256:archive.sha256 } });
    }
    const receipt = { schema:'stellar-forge.fred-operating-received.v1', sourceFile:checked.sourceFile,
      manifestFile:checked.manifestFile, projectId:checked.source.project.id, bundleSha256:checked.source.project.bundleSha256,
      sourceRevision:checked.source.project.revision, publications };
    const previous = await optional(destination, 'RECEIVED.json', MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    if (previous) same(previous, receipt, 'Original complete receiving receipt');
    const receiptFile = await writeJson(destination, 'RECEIVED.json', receipt, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    const receivedPlan = await receivePlan(destination, plan, checked.source, signal);
    return { ...result(checked.source, checked.sourceFile, checked.manifestFile, destination, Boolean(previous)),
      projectDirectory, publications, plan:receivedPlan, receiptFile, projectReceipt:received };
  }, signal);
}
