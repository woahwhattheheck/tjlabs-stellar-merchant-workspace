// MIT. One streamed portable archive over the original source capture and native graph receiver.
import { join, dirname, basename } from 'node:path';
import { readdir } from 'node:fs/promises';
import { withPrivateLock } from '../../routescan/quota.mjs';
import { canonicalJSONDigest, canonicalJSONInfo } from '../canonical-stream.mjs';
import { inspectFredOperatingPlanSource } from '../../../distribution/discovery/fred-operating-plan.mjs';
import { captureFredOperatingSource, inspectFredOperatingSourcePackage, receiveFredOperatingSource } from './source.mjs';
import { FRED_OPERATING_SOURCE_FILE, FRED_OPERATING_MANIFEST_FILE, MAX_FRED_OPERATING_DESCRIPTOR_BYTES,
  MAX_FRED_OPERATING_PACKAGE_BYTES, need, same, stop, ref, absolute, directory, describe,
  readJson, optional, writeJson, utf8 } from './files.mjs';
import { MAX_FRED_OPERATING_ARCHIVE_BYTES, writeFredOperatingTar, extractFredOperatingTar } from './archive-io.mjs';

export { MAX_FRED_OPERATING_ARCHIVE_BYTES };
export const FRED_OPERATING_ARCHIVE_SCHEMA = 'stellar-forge.fred-operating-archive.v1';
export const FRED_OPERATING_ARCHIVE_RESULT = 'stellar-forge.fred-operating-archive-result.v1';
export const MAX_FRED_OPERATING_PLAN_BYTES = MAX_FRED_OPERATING_DESCRIPTOR_BYTES;
export const MAX_FRED_OPERATING_EXPORT_REQUEST_BYTES = MAX_FRED_OPERATING_PLAN_BYTES + 65536;
export const FRED_OPERATING_ARCHIVE_NAME = 'fred-operating-handover.tar.gz';
export const FRED_OPERATING_HANDOVER_FILE = 'HANDOVER.json';
const PLAN = 'OPERATING-PLAN.json', PACKAGE = 'source-package';
const prefixed = entry => ({ ...entry, path:PACKAGE + '/' + entry.path });
async function owner(root, work, signal) {
  stop(signal); absolute(root, 'Archive working directory'); await directory(root, true);
  return withPrivateLock(root, 'operating-archive.lock', work);
}
function archiveRef(entry) {
  ref(entry, MAX_FRED_OPERATING_ARCHIVE_BYTES);
  need(entry.path === FRED_OPERATING_ARCHIVE_NAME, 'Use the complete original portable archive descriptor.');
  return entry;
}
function manifest(value) {
  need(value?.schema === FRED_OPERATING_ARCHIVE_SCHEMA && typeof value.sourceId === 'string' &&
    typeof value.projectId === 'string' && Array.isArray(value.files) && value.files.length >= 3,
    'Read the complete original handover manifest.');
  ref(value.sourceFile); ref(value.manifestFile);
  need(value.sourceFile.path === FRED_OPERATING_SOURCE_FILE && value.manifestFile.path === FRED_OPERATING_MANIFEST_FILE &&
    value.sourceFile.bytes <= MAX_FRED_OPERATING_DESCRIPTOR_BYTES && value.manifestFile.bytes <= MAX_FRED_OPERATING_DESCRIPTOR_BYTES,
    'Keep the original source and package manifest paths.');
  if (value.plan !== null) { ref(value.plan); need(value.plan.path === PLAN && value.plan.bytes <= MAX_FRED_OPERATING_DESCRIPTOR_BYTES, 'Keep the complete editable plan.'); }
  const seen = new Set(); let total = 0;
  for (const entry of value.files) {
    ref(entry); need(!seen.has(entry.path) && (entry.path.startsWith(PACKAGE + '/') || entry.path === PLAN),
      'The handover member path differs from its original source package.');
    seen.add(entry.path); total += entry.bytes;
  }
  need(total === value.bytes && total <= MAX_FRED_OPERATING_PACKAGE_BYTES + 2 * MAX_FRED_OPERATING_DESCRIPTOR_BYTES,
    'The complete portable handover total differs.');
  return value;
}
function result(checked, archive, archivePath, root, plan, reused) {
  return { schema:FRED_OPERATING_ARCHIVE_RESULT, archive, archivePath, directory:root,
    sourceDirectory:join(root, PACKAGE), source:checked.source, sourceFile:checked.sourceFile,
    manifestFile:checked.manifestFile, plan, projectDirectory:null, reused };
}
async function verifyExpanded(root, selected, signal) {
  manifest(selected);
  const checked = await inspectFredOperatingSourcePackage({ directory:join(root, PACKAGE), expectedSource:selected.sourceFile, signal });
  same(checked.manifestFile, selected.manifestFile, 'Original package manifest');
  need(checked.source.id === selected.sourceId && checked.source.project.id === selected.projectId,
    'The portable handover belongs to another source or project.');
  const original = await readJson(join(root, PACKAGE), FRED_OPERATING_MANIFEST_FILE,
    MAX_FRED_OPERATING_DESCRIPTOR_BYTES, selected.manifestFile, signal);
  const expected = [...original.files.map(prefixed), prefixed(selected.manifestFile), ...(selected.plan ? [selected.plan] : [])]
    .sort((a,b) => a.path.localeCompare(b.path));
  same([...selected.files].sort((a,b) => a.path.localeCompare(b.path)), expected, 'Complete portable member inventory');
  const plan = selected.plan ? await readJson(root, PLAN, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, selected.plan, signal) : null;
  if (plan !== null) inspectFredOperatingPlanSource(plan, checked.source);
  return { checked, plan };
}

/** Capture retained originals once and write the complete deterministic USTAR/gzip handover. */
export async function exportFredOperatingArchive({ directory:projectDirectory, outputDirectory, capturedAt,
  publicationIds = null, plan = null, expectedProject = null, qcewSourceContexts = null, signal } = {}) {
  absolute(projectDirectory, 'Original project directory'); absolute(outputDirectory, 'Archive output directory');
  need(projectDirectory !== outputDirectory && !outputDirectory.startsWith(projectDirectory + '/') &&
    !projectDirectory.startsWith(outputDirectory + '/'), 'Choose a separate archive output directory.');
  return owner(outputDirectory, async () => {
    const request = { schema:'stellar-forge.fred-operating-archive-export.v1', directory:projectDirectory,
      capturedAt, publicationIds, plan, expectedProject };
    need(plan === null || canonicalJSONInfo(plan).bytes <= MAX_FRED_OPERATING_PLAN_BYTES, 'The complete operating plan exceeds 32 MiB.');
    const previous = await optional(outputDirectory, 'EXPORT.json', MAX_FRED_OPERATING_EXPORT_REQUEST_BYTES, signal);
    if (previous) same(previous, request, 'Original archive export selection');
    else {
      need((await readdir(outputDirectory)).every(name => name === 'operating-archive.lock'),
        'Choose a fresh export directory or its original continuation.');
      await writeJson(outputDirectory, 'EXPORT.json', request, MAX_FRED_OPERATING_EXPORT_REQUEST_BYTES, signal);
    }
    const captured = await captureFredOperatingSource({ directory:projectDirectory,
      outputDirectory:join(outputDirectory, PACKAGE), capturedAt, publicationIds, qcewSourceContexts, signal });
    if (expectedProject !== null) need(captured.source.project.id === expectedProject.id &&
      captured.source.project.revision === expectedProject.revision, 'The source project advanced before this handover was captured.');
    if (plan !== null) inspectFredOperatingPlanSource(plan, captured.source);
    const original = await readJson(captured.directory, FRED_OPERATING_MANIFEST_FILE,
      MAX_FRED_OPERATING_DESCRIPTOR_BYTES, captured.manifestFile, signal);
    const planFile = plan === null ? null : await writeJson(outputDirectory, PLAN, plan, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    const files = [...original.files.map(prefixed), prefixed(captured.manifestFile), ...(planFile ? [planFile] : [])]
      .sort((a,b) => a.path.localeCompare(b.path));
    const selected = manifest({ schema:FRED_OPERATING_ARCHIVE_SCHEMA, sourceId:captured.source.id,
      projectId:captured.source.project.id, sourceFile:captured.sourceFile, manifestFile:captured.manifestFile,
      plan:planFile, files, bytes:files.reduce((sum,entry) => sum + entry.bytes, 0) });
    const header = await writeJson(outputDirectory, FRED_OPERATING_HANDOVER_FILE, selected, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    const saved = await optional(outputDirectory, 'EXPORTED.json', MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    let archive;
    if (saved) {
      archive = await describe(outputDirectory, FRED_OPERATING_ARCHIVE_NAME, signal, MAX_FRED_OPERATING_ARCHIVE_BYTES);
    } else archive = await writeFredOperatingTar({ root:outputDirectory, files:[header,...files],
      output:outputDirectory, name:FRED_OPERATING_ARCHIVE_NAME, signal });
    const receipt = { schema:'stellar-forge.fred-operating-archive-exported.v1', archive,
      handover:header, sourceFile:captured.sourceFile, planSha256:plan === null ? null : canonicalJSONDigest(plan) };
    if (saved) same(saved, receipt, 'Completed portable archive');
    await writeJson(outputDirectory, 'EXPORTED.json', receipt, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    return result(captured, archive, join(outputDirectory,FRED_OPERATING_ARCHIVE_NAME), outputDirectory, plan, Boolean(saved));
  }, signal);
}

/** Fully receive every archive member and validate the original source graph and carried plan. */
export async function inspectFredOperatingArchive({ archivePath, directory:outputDirectory, expectedArchive = null, signal } = {}) {
  absolute(archivePath, 'Original archive path'); absolute(outputDirectory, 'Inspection directory');
  if (expectedArchive !== null) archiveRef(expectedArchive);
  return owner(outputDirectory, async () => {
    const input = await describe(dirname(archivePath), basename(archivePath), signal, MAX_FRED_OPERATING_ARCHIVE_BYTES);
    const archive = { ...input, path:FRED_OPERATING_ARCHIVE_NAME };
    if (expectedArchive !== null) same(archive, expectedArchive, 'Original portable archive');
    const request = { schema:'stellar-forge.fred-operating-archive-inspection.v1', archive };
    const previous = await optional(outputDirectory, 'INSPECTION.json', MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    if (previous) same(previous, request, 'Original inspected archive');
    else {
      need((await readdir(outputDirectory)).every(name => name === 'operating-archive.lock'),
        'Choose a fresh inspection directory or its original continuation.');
      await writeJson(outputDirectory, 'INSPECTION.json', request, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    }
    const selected = await extractFredOperatingTar({ root:dirname(archivePath), archive:input, output:outputDirectory,
      maximumPayload:MAX_FRED_OPERATING_ARCHIVE_BYTES, signal,
      firstManifest:{ name:FRED_OPERATING_HANDOVER_FILE, read:async (body) => {
        const value = manifest(JSON.parse(utf8.decode(body))); return value;
      } } });
    const { checked, plan } = await verifyExpanded(outputDirectory, selected, signal);
    await writeJson(outputDirectory, 'INSPECTED.json', { ...request, sourceId:checked.source.id,
      planSha256:plan === null ? null : canonicalJSONDigest(plan) }, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    return result(checked, archive, archivePath, outputDirectory, plan, Boolean(previous));
  }, signal);
}

/** Restore the original project, original publication browsers and editable customer plan. */
export async function receiveFredOperatingArchive({ archivePath, destination, expectedArchive = null,
  qcewSourceContexts = null, signal } = {}) {
  absolute(destination, 'Receiving directory');
  return owner(destination, async () => {
    const inspected = await inspectFredOperatingArchive({ archivePath, directory:join(destination,'incoming'), expectedArchive, signal });
    const received = await receiveFredOperatingSource({ sourceDirectory:inspected.sourceDirectory,
      destination:join(destination,'received'), expectedSource:inspected.sourceFile, plan:inspected.plan,
      qcewSourceContexts, signal });
    return { ...inspected, ...received, schema:FRED_OPERATING_ARCHIVE_RESULT,
      sourceDirectory:inspected.sourceDirectory, directory:destination, archive:inspected.archive, archivePath,
      projectDirectory:received.projectDirectory };
  }, signal);
}
