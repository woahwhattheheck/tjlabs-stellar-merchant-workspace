// MIT. Exact retained files from the original GraphQL workspace.
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { digest, projectName, plain, readWorkspaceRevision } from './store.mjs';
import { readExport, verifyExport, verifyFiles } from './merchant.mjs';
import { readDeployment } from './deployment.mjs';
import { readPreview } from './authoring.mjs';
import { describeResponseComparisonFiles } from './comparison-report.mjs';
import { prepareRequestPacket } from './request-files.mjs';
import { readRequestBytes, writeRequestBytes } from './request-sets.mjs';
import { describeProjectHandover, readProjectHandoverFile, PROJECT_HANDOVER_FILE } from './handover.mjs';

export const GRAPHQL_FILE_SET_SCHEMA = 'stellar-forge.graphql-workspace-files.v1';
export const GRAPHQL_FILE_SET_MANIFEST = 'workspace-files.json';
export const GRAPHQL_FILE_KINDS = ['draft', 'preview', 'merchant', 'evolution', 'deployment', 'host', 'handover', 'comparison', 'requests'];
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const typeOf = name => name.endsWith('.json') ? 'application/json' : name.endsWith('.html') ? 'text/html; charset=utf-8'
  : /\.(?:mjs|js)$/.test(name) ? 'text/javascript; charset=utf-8'
    : /\.(?:md|graphql|txt|mts|ts|css|sh|service)$/.test(name) ? 'text/plain; charset=utf-8' : 'application/octet-stream';
function filename(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\\\u0000-\u001f\u007f]/.test(value)
      || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..'))
    fail('Choose a canonical relative file from the retained manifest.');
  return value;
}
function selectionOf(input) {
  if (!plain(input) || Object.keys(input).some(key => !['project', 'revision', 'kind', 'exportId', 'deploymentId', 'hostId', 'previewId', 'comparisonId', 'requestSetId', 'runId', 'generation'].includes(key)))
    fail('Select original workspace identities, not filesystem paths.');
  const selection = { ...input };
  projectName(selection.project);
  if (!Number.isSafeInteger(selection.revision) || selection.revision < 1) fail('Select a saved project revision.');
  if (!GRAPHQL_FILE_KINDS.includes(selection.kind)) fail('Choose a supported retained file kind.');
  if (selection.kind === 'requests') {
    if (Boolean(selection.requestSetId) === Boolean(selection.runId) || !uuid(selection.requestSetId ?? selection.runId))
      fail('Choose one original request set or run for the file packet.');
    if (selection.generation !== undefined && (!selection.runId || !Number.isSafeInteger(selection.generation) || selection.generation < 1 || selection.generation > 256))
      fail('Only a saved run packet selects an original generation.');
  } else if (selection.requestSetId !== undefined || selection.runId !== undefined || selection.generation !== undefined)
    fail('This file kind does not select request sets or run checkpoints.');
  const fields = { requests: [], draft: [], handover: [], comparison: ['comparisonId'], preview: ['previewId'], merchant: ['exportId'], evolution: ['exportId'],
    deployment: ['deploymentId'], host: ['deploymentId', 'hostId'] }[selection.kind];
  for (const key of ['exportId', 'deploymentId', 'hostId', 'previewId', 'comparisonId']) {
    if (fields.includes(key)) {
      if (key === 'hostId' ? typeof selection[key] !== 'string' || !/^host-[1-9]\d*-[a-f0-9]{8}$/.test(selection[key]) : !uuid(selection[key]))
        fail('Select the original ' + key + ' from this project.');
    } else if (selection[key] !== undefined) fail('This file kind does not use ' + key + '.');
  }
  return selection;
}
async function diskBytes(directory, name, expected) {
  filename(name);
  const root = await realpath(directory), path = join(root, name), actual = await realpath(path);
  const within = relative(root, actual);
  if (!within || isAbsolute(within) || within === '..' || within.startsWith('..' + sep) || actual !== resolve(root, name))
    fail('The retained file left its original directory.');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 8 * 1024 * 1024)
      fail('The retained file must remain a regular generated file within its original limit.');
    const bytes = await handle.readFile();
    if (bytes.length !== info.size || bytes.length > 8 * 1024 * 1024
        || expected && (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256))
      fail('The retained file differs from its original identity.', 409);
    return bytes;
  } finally { await handle.close(); }
}

/** The existing store remains the only project reader and writer. */
export function createWorkspaceFiles(store) {
  async function describe(input) {
    const selection = selectionOf(input), saved = await store.read(selection.project, selection.revision);
    const loaders = new Map();
    let source = { project: saved.id, revision: saved.revision, inputDigest: saved.inputDigest, kind: selection.kind };
    const addBytes = (name, bytes, type = typeOf(name)) => {
      filename(name);
      loaders.set(name, { file: { name, bytes: bytes.length, sha256: digest(bytes), contentType: type },
        load: async () => bytes });
    };
    const addDisk = (directory, files) => {
      for (const item of files) {
        filename(item.name);
        if (loaders.has(item.name) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > 8 * 1024 * 1024
            || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) fail('The native file manifest is inconsistent.');
        loaders.set(item.name, { file: { name: item.name, bytes: item.bytes, sha256: item.sha256, contentType: typeOf(item.name) },
          load: () => diskBytes(directory, item.name, item) });
      }
    };
    if (selection.kind === 'handover') {
      const handover = await describeProjectHandover(store, selection);
      addBytes(PROJECT_HANDOVER_FILE, handover.bytes);
      for (const [name, item] of handover.loaders) loaders.set(name,
        { file: { ...item.file, contentType: typeOf(name) }, load: item.load });
      source = { ...source, handoverSha256: handover.sha256, counts: handover.index.counts,
        deploymentBinding: handover.index.deploymentBinding };
    } else if (selection.kind === 'comparison') {
      const comparison = await describeResponseComparisonFiles(store, selection);
      for (const [name, item] of comparison.loaders) loaders.set(name,
        { file: { ...item.file, contentType: typeOf(name) }, load: item.load });
      source = { ...source, ...comparison.source };
    } else if (selection.kind === 'requests') {
      const requests = await prepareRequestPacket(store, selection);
      addDisk(requests.directory, requests.files);
      source = { ...source, ...requests.source, packetSha256: requests.packetSha256 };
    } else if (selection.kind === 'draft') {
      addBytes(saved.input.schemaText.trimStart().startsWith('{') ? 'schema-source.json' : 'schema-source.graphql', Buffer.from(saved.input.schemaText));
      addBytes('queries.json', Buffer.from(saved.input.queriesText));
      addBytes('plan.json', Buffer.from(saved.input.planText));
      addBytes('project.json', await diskBytes(join(store.root, 'projects', saved.id), saved.revision + '.json'));
    } else if (selection.kind === 'preview') {
      const reference = (saved.previews ?? []).find(item => item.id === selection.previewId)
        ?? { id: selection.previewId, project: saved.id };
      const record = await readPreview(store, reference);
      addBytes('response.json', Buffer.from(record.responseBase64, 'base64'), record.responseType);
      addBytes('request.json', Buffer.from(JSON.stringify(record.request)));
      addBytes('preview.json', await diskBytes(store.previews, record.id + '.json'));
      source = { ...source, previewId: record.id, originalDraftRevision: record.draftRevision,
        originalInputDigest: record.inputDigest, operation: record.operation, responseSha256: record.responseSha256 };
    } else if (selection.kind === 'merchant' || selection.kind === 'evolution') {
      const reference = saved.exports.find(item => item.id === selection.exportId);
      if (!reference) fail('Choose a merchant export retained in this saved project revision.', 404);
      const record = await readExport(reference); await verifyExport(record);
      const group = selection.kind === 'evolution' ? record.evolution : record;
      if (!group) fail('This merchant export has no retained schema-evolution package.', 404);
      addDisk(group.directory, group.files);
      source = { ...source, exportId: record.id, originalDraftRevision: record.draftRevision,
        originalInputDigest: record.inputDigest, recordSha256: reference.recordSha256,
        ...(record.evolution ? { baselineExportId: record.evolution.baselineExportId } : {}) };
    } else {
      const reference = (saved.deployments ?? []).find(item => item.id === selection.deploymentId);
      if (!reference) fail('Choose a deployment retained in this saved project revision.', 404);
      const record = await readDeployment(reference);
      await verifyFiles(record.directory, record.files);
      const group = selection.kind === 'host' ? record.hosts.find(item => item.id === selection.hostId) : record;
      if (!group) fail('Choose a host packet retained in this deployment generation.', 404);
      if (group !== record) await verifyFiles(group.directory, group.files);
      addDisk(group.directory, group.files);
      source = { ...source, deploymentId: record.id, deploymentGeneration: record.generation,
        exportId: record.exportId, recordSha256: reference.recordSha256,
        ...(selection.kind === 'host' ? { hostId: group.id, hostIdentity: group.identity } : {}) };
    }
    const files = [...loaders.values()].map(value => value.file).sort((a, b) => a.name.localeCompare(b.name));
    if (!files.length || files.length > 512 || files.reduce((sum, file) => sum + file.bytes, 0) > 256_000_000)
      fail('The retained file set exceeds the original transfer bounds.');
    if (loaders.has(GRAPHQL_FILE_SET_MANIFEST)) fail('The original file set uses the reserved transfer manifest name.');
    const manifest = { schema: GRAPHQL_FILE_SET_SCHEMA, selection, source, files };
    const bytes = json(manifest);
    if (bytes.length > 65000) fail('The retained file manifest exceeds its transfer limit.');
    return { manifest, bytes, sha256: digest(bytes), loaders };
  }
  const pinned = selection => ['handover', 'requests'].includes(selection.kind);
  const indexName = sha256 => 'workspace-file-indexes/' + sha256 + '.json';
  const sameSelection = (a, b) => JSON.stringify(Object.keys(a).sort().map(key => [key, a[key]]))
    === JSON.stringify(Object.keys(b).sort().map(key => [key, b[key]]));
  async function retain(value) {
    if (pinned(value.manifest.selection))
      await writeRequestBytes(store, indexName(value.sha256), value.bytes, 65000);
    return value;
  }
  async function selected(input, expectedSha256) {
    const selection = selectionOf(input);
    if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256))
      fail('Choose the exact inspected native file manifest.', 409);
    if (!pinned(selection)) {
      const value = await describe(selection);
      if (value.sha256 !== expectedSha256) fail('The retained file set differs from the inspected manifest.', 409);
      return value;
    }
    let bytes;
    try { bytes = (await readRequestBytes(store, indexName(expectedSha256), expectedSha256, 65000)).raw; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const value = await describe(selection);
      if (value.sha256 !== expectedSha256)
        fail('The retained file set differs from the inspected manifest.', 409);
      return retain(value);
    }
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!plain(manifest) || manifest.schema !== GRAPHQL_FILE_SET_SCHEMA || !plain(manifest.selection)
        || !sameSelection(selectionOf(manifest.selection), selection) || !plain(manifest.source)
        || manifest.source.project !== selection.project || manifest.source.revision !== selection.revision
        || manifest.source.kind !== selection.kind || !Array.isArray(manifest.files)
        || !manifest.files.length || manifest.files.length > 512)
      fail('The pinned native file manifest changed its original selection.', 409);
    const loaders = new Map(); let total = 0;
    for (const item of manifest.files) {
      if (!plain(item) || loaders.has(filename(item.name)) || item.name === GRAPHQL_FILE_SET_MANIFEST
          || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > 8 * 1024 * 1024
          || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)
          || typeof item.contentType !== 'string' || !item.contentType || /[\r\n]/.test(item.contentType))
        fail('The pinned native file manifest contains an invalid file.', 409);
      total += item.bytes;
      const load = selection.kind === 'handover'
        ? () => readProjectHandoverFile(store, selection, manifest.source.handoverSha256, item.name, item)
        : () => {
          if (!/^[a-f0-9]{64}$/.test(manifest.source.packetSha256 ?? ''))
            fail('The retained request packet has no original file-set identity.', 409);
          return diskBytes(join(store.root, 'request-packets', manifest.source.packetSha256), item.name, item);
        };
      loaders.set(item.name, { file: item, load });
    }
    if (total > 256_000_000) fail('The pinned native file set exceeds its original transfer limit.', 409);
    return { manifest, bytes, sha256: expectedSha256, loaders };
  }
  return {
    async manifest(selection) {
      const value = await retain(await describe(selection));
      return { manifest: value.manifest, manifestFile: { name: GRAPHQL_FILE_SET_MANIFEST,
        bytes: value.bytes.length, sha256: value.sha256, contentType: 'application/json' } };
    },
    async read(selection, name, expectedManifestSha256) {
      const value = await selected(selection, expectedManifestSha256);
      if (name === GRAPHQL_FILE_SET_MANIFEST) return { name, bytes: value.bytes, type: 'application/json' };
      const item = value.loaders.get(filename(name));
      if (!item) fail('Choose a file from the exact retained manifest.', 404);
      return { name, bytes: await item.load(), type: item.file.contentType };
    },
  };
}

/** Reopen original immutable files after the owning browser/MCP writer has closed. */
export async function openWorkspaceFiles(directory) {
  const root = await realpath(directory);
  return createWorkspaceFiles({ root, previews: join(root, 'previews'),
    read: (id, revision) => readWorkspaceRevision(root, id, revision) });
}
