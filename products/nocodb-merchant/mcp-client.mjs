// MIT. Original merchant transport and retained NocoDB packets for one project.
import { constants } from 'node:fs';
import { open, lstat, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readProject, PROJECT_SCHEMA, PROJECT_ALIAS, AUTHORING_PATH, MCP_PATH } from './project.mjs';
import { absolute, privateDirectory, readPrivate, readJson, bytes, digest, identity, acquireWorkspace,
  atomicJson, syncDirectory, fault, object } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/files.mjs';
import { createOrVerify, MAX_PACKET_BYTES } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/nocodb/workspace/packet.mjs';

const HASH = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_DOWNLOAD = Math.min(MAX_PACKET_BYTES, 256000000), CHUNK_BYTES = 131072;
const exists = async path => { try { await lstat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
const decode = content => { try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)); }
  catch { throw fault('NOCODB_PROJECT_PACKET_JSON_INVALID'); } };
const nativeModule = (state, path) => import(pathToFileURL(join(state.installation.sourceRoot, path)).href);

/** The private session file is a locator; current authenticated native identity is checked before use. */
export async function connectProject(directory, { signal } = {}) {
  const state = await readProject(directory), session = await readJson(join(directory, 'session.json'));
  if (session.schema !== PROJECT_SCHEMA || session.phase !== 'OPEN' ||
      session.workspaceIdentity !== state.workspaceIdentity || session.manifestSha256 !== state.installation.manifestSha256 ||
      !UUID.test(session.instanceId ?? '')) throw fault('NOCODB_PROJECT_NOT_RUNNING', 'Open this same project before connecting.');
  const endpoint = new URL(session.mcpUrl);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username ||
      endpoint.password || endpoint.search || endpoint.hash) throw fault('NOCODB_PROJECT_ENDPOINT_INVALID');
  const token = (await readPrivate(state.tokenFile, 256)).toString('utf8').trim();
  if (digest(Buffer.from(token)) !== state.tokenSha256) throw fault('NOCODB_PROJECT_TOKEN_CHANGED');
  const { openMerchantFileClient } = await nativeModule(state, MCP_PATH + '/retained-download.mjs');
  const client = await openMerchantFileClient({ url: endpoint.href, tokenEnv: 'NOCODB_PROJECT_MCP_TOKEN',
    environment: { NOCODB_PROJECT_MCP_TOKEN: token }, signal, errorPrefix: 'NOCODB_PROJECT',
    clientName: 'starforge-nocodb-project', maximumResponseBytes: 32 * 1024 * 1024 });
  const catalog = await client.call('merchant_nocodb_workspaces', {});
  const workspace = catalog.workspaces?.find(row => row.workspace === PROJECT_ALIAS);
  if (workspace?.workspaceIdentity !== state.workspaceIdentity)
    throw fault('NOCODB_PROJECT_REMOTE_WORKSPACE_CHANGED');
  return { state, session, workspace, client };
}

/** Exactly one original tools/call; an uncertain mutation is never automatically dispatched again. */
export async function callProject(directory, { tool, args = {}, timeoutMs = 120000, signal } = {}) {
  if (typeof tool !== 'string' || !(tool.startsWith('merchant_nocodb_') || tool === 'merchant_status') ||
      !object(args) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 3600000)
    throw fault('NOCODB_PROJECT_CALL_INVALID');
  if (Object.hasOwn(args, 'workspace') && args.workspace !== PROJECT_ALIAS)
    throw fault('NOCODB_PROJECT_WORKSPACE_ALIAS_CHANGED');
  const { client } = await connectProject(directory, { signal });
  const selected = tool === 'merchant_nocodb_workspaces' || tool === 'merchant_status' ? args : { workspace: PROJECT_ALIAS, ...args };
  return client.call(tool, selected, { requestSignal: signal, timeoutMs });
}

async function checkedPacket(state, file, expected) {
  const content = await readPrivate(file, MAX_DOWNLOAD);
  if (content.length !== expected.file.bytes || digest(content) !== expected.file.sha256)
    throw fault('NOCODB_PROJECT_PACKET_BYTES_CHANGED');
  const packet = decode(content), { validatePacket } = await nativeModule(state, AUTHORING_PATH + '/packet.mjs');
  const checked = validatePacket(packet);
  if (packet.version?.id !== expected.versionId || packet.version?.sourceSha256 !== expected.expectedSourceSha256)
    throw fault('NOCODB_PROJECT_PACKET_VERSION_CHANGED');
  return { versionId: packet.version.id, sourceSha256: packet.version.sourceSha256,
    captureSha256: checked.manifestSha256, rowCount: checked.manifest.rowCount,
    pageCount: checked.manifest.pageCount, sourceSelection: checked.manifest.selection,
    bytes: content.length, sha256: digest(content), scope: 'PRIVATE_FULL_CAPTURE_PACKET' };
}
async function privateHandle(file) {
  const handle = await open(file, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  const s = await handle.stat();
  if (!s.isFile() || s.nlink !== 1 || s.mode & 0o077) { await handle.close(); throw fault('NOCODB_PROJECT_PRIVATE_PARTIAL_REQUIRED'); }
  return handle;
}
async function prefixHash(handle, length) {
  const hash = createHash('sha256'), buffer = Buffer.alloc(CHUNK_BYTES);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, length - offset), offset);
    if (!bytesRead) throw fault('NOCODB_PROJECT_DOWNLOAD_TRUNCATED');
    hash.update(buffer.subarray(0, bytesRead)); offset += bytesRead;
  }
  return hash;
}
function chunkBytes(reply, expected, offset) {
  if (!reply || reply.workspace !== PROJECT_ALIAS || reply.versionId !== expected.versionId ||
      !UUID.test(reply.readId ?? '') || !object(reply.file) || !HASH.test(reply.file.sha256 ?? '') ||
      !Number.isSafeInteger(reply.file.bytes) || reply.file.bytes < 1 || reply.file.bytes > MAX_DOWNLOAD ||
      reply.file.name !== 'nocodb-source-v' + expected.versionId + '.json' ||
      reply.offset !== offset || !Number.isSafeInteger(reply.bytesRead) || reply.bytesRead < 0 ||
      reply.bytesRead > CHUNK_BYTES || reply.encoding !== 'base64' || typeof reply.data !== 'string' ||
      expected.file && identity(reply.file) !== identity(expected.file))
    throw fault('NOCODB_PROJECT_DOWNLOAD_RESPONSE_INVALID');
  if (reply.data.length !== 4 * Math.ceil(reply.bytesRead / 3) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(reply.data))
    throw fault('NOCODB_PROJECT_DOWNLOAD_RESPONSE_INVALID');
  const content = Buffer.from(reply.data, 'base64'), next = offset + content.length;
  if (content.length !== reply.bytesRead || next > reply.file.bytes ||
      reply.nextOffset !== (next === reply.file.bytes ? null : next) ||
      content.length === 0 && next !== reply.file.bytes)
    throw fault('NOCODB_PROJECT_DOWNLOAD_RESPONSE_INVALID');
  return content;
}

/**
 * Receive the original immutable packet with its native readId/SHA256/offset contract.
 * The local checkpoint binds workspace/version/source, not a transient host URL or process readId.
 */
export async function downloadPrivateVersion(directory, { versionId, expectedSourceSha256, outputDirectory, signal } = {}) {
  if (!Number.isSafeInteger(versionId) || versionId < 1 || !HASH.test(expectedSourceSha256 ?? ''))
    throw fault('NOCODB_PROJECT_DOWNLOAD_VERSION_REQUIRED');
  absolute(outputDirectory, 'private download directory');
  const selectedProject = await readProject(directory);
  for (const original of [selectedProject.workspaceDirectory, selectedProject.installation.runtimeDirectory])
    if (outputDirectory === original || outputDirectory.startsWith(original + '/') || original.startsWith(outputDirectory + '/'))
      throw fault('NOCODB_PROJECT_DOWNLOAD_OVERLAP', 'Keep received packets outside the original workspace and installed runtime.');
  await privateDirectory(outputDirectory, true);
  const release = await acquireWorkspace(outputDirectory);
  let handle, connected, currentReadId = null, finalRead = false;
  try {
    const state = selectedProject, intent = {
      schema: 'stellar-forge.nocodb-project-packet-download.v1', projectDirectory: directory,
      workspaceIdentity: state.workspaceIdentity, versionId, expectedSourceSha256,
    };
    const intentFile = join(outputDirectory, 'download.json'), progressFile = join(outputDirectory, 'progress.json');
    if (!await exists(intentFile)) {
      if ((await readdir(outputDirectory)).some(name => name !== 'publisher.lock')) throw fault('NOCODB_PROJECT_DOWNLOAD_DIRECTORY_NOT_EMPTY');
      await createOrVerify(intentFile, bytes(intent));
    } else if (identity(await readJson(intentFile)) !== identity(intent)) throw fault('NOCODB_PROJECT_DOWNLOAD_INPUT_CHANGED');
    let progress = await exists(progressFile) ? await readJson(progressFile) : {
      ...intent, phase: 'RECEIVING', offset: 0, prefixSha256: digest(Buffer.alloc(0)), file: null,
    };
    if (progress.schema !== intent.schema || progress.projectDirectory !== directory || progress.workspaceIdentity !== intent.workspaceIdentity ||
        progress.versionId !== versionId || progress.expectedSourceSha256 !== expectedSourceSha256 ||
        !Number.isSafeInteger(progress.offset) || progress.offset < 0 || !HASH.test(progress.prefixSha256 ?? ''))
      throw fault('NOCODB_PROJECT_DOWNLOAD_CHECKPOINT_CHANGED');
    const target = join(outputDirectory, 'packet.json'), partial = join(outputDirectory, 'packet.partial');
    if (await exists(target)) {
      if (!progress.file) throw fault('NOCODB_PROJECT_DOWNLOAD_UNOWNED_FINAL');
      const verified = await checkedPacket(state, target, progress);
      const result = { ...intent, ...verified, file: target, outputDirectory, state: 'COMPLETE' };
      await atomicJson(outputDirectory, 'progress.json', { ...progress, phase: 'COMPLETE', result });
      return { ...result, reopened: true };
    }
    if (progress.phase === 'COMPLETE') throw fault('NOCODB_PROJECT_DOWNLOAD_FINAL_MISSING');
    handle = await privateHandle(partial);
    const initial = await handle.stat();
    if (initial.size < progress.offset || progress.file && progress.offset > progress.file.bytes)
      throw fault('NOCODB_PROJECT_DOWNLOAD_TRUNCATED');
    let runningHash = await prefixHash(handle, progress.offset);
    if (runningHash.copy().digest('hex') !== progress.prefixSha256) throw fault('NOCODB_PROJECT_DOWNLOAD_PREFIX_CHANGED');
    // Only this lease-owned unpublished file can contain a durable chunk beyond the last journal.
    if (initial.size > progress.offset) { await handle.truncate(progress.offset); await handle.sync(); }
    if (!progress.file || progress.offset < progress.file.bytes) {
      connected = await connectProject(directory, { signal });
      const version = await connected.client.call('merchant_nocodb_version', { workspace: PROJECT_ALIAS, versionId });
      if (version.native?.sourceSha256 !== expectedSourceSha256) throw fault('NOCODB_PROJECT_VERSION_CHANGED');
    }
    while (!progress.file || progress.offset < progress.file.bytes) {
      const request = { workspace: PROJECT_ALIAS, versionId, offset: progress.offset, limit: CHUNK_BYTES,
        ...(progress.file ? { expectedSha256: progress.file.sha256 } : {}),
        ...(currentReadId ? { readId: currentReadId } : {}) };
      let reply;
      try { reply = await connected.client.call('merchant_nocodb_packet_read', request, { requestSignal: signal }); }
      catch (error) {
        if (!currentReadId || !String(error.code ?? '').endsWith('_READ_NOT_FOUND')) throw error;
        // Expiration is a positively closed read. Open the same native file at the same pinned offset once.
        currentReadId = null; delete request.readId;
        reply = await connected.client.call('merchant_nocodb_packet_read', request, { requestSignal: signal });
      }
      const content = chunkBytes(reply, progress, progress.offset);
      currentReadId = reply.readId; finalRead = reply.nextOffset === null;
      if (!progress.file) {
        progress = { ...progress, file: reply.file };
        await atomicJson(outputDirectory, 'progress.json', progress);
      }
      let written = 0;
      while (written < content.length) {
        const r = await handle.write(content, written, content.length - written, progress.offset + written);
        if (!r.bytesWritten) throw fault('NOCODB_PROJECT_DOWNLOAD_WRITE_FAILED');
        written += r.bytesWritten;
      }
      await handle.sync(); runningHash.update(content);
      progress = { ...progress, offset: progress.offset + content.length, prefixSha256: runningHash.copy().digest('hex') };
      await atomicJson(outputDirectory, 'progress.json', progress);
    }
    if (progress.prefixSha256 !== progress.file.sha256) throw fault('NOCODB_PROJECT_PACKET_BYTES_CHANGED');
    await handle.close(); handle = null;
    const verified = await checkedPacket(state, partial, progress);
    if (await exists(target)) throw fault('NOCODB_PROJECT_DOWNLOAD_TARGET_APPEARED');
    await rename(partial, target); await syncDirectory(outputDirectory);
    const result = { ...intent, ...verified, file: target, outputDirectory, state: 'COMPLETE' };
    await atomicJson(outputDirectory, 'progress.json', { ...progress, phase: 'COMPLETE', result });
    return result;
  } finally {
    try {
      await handle?.close();
      if (connected && currentReadId && !finalRead)
        await connected.client.call('merchant_nocodb_packet_release', { workspace: PROJECT_ALIAS, readId: currentReadId },
          { timeoutMs: 5000 }).catch(() => {});
    } finally { await release(); }
  }
}

export async function inspectPrivateDownload(directory, outputDirectory) {
  absolute(outputDirectory, 'private download directory'); await privateDirectory(outputDirectory);
  const release = await acquireWorkspace(outputDirectory);
  try {
    const state = await readProject(directory), intent = await readJson(join(outputDirectory, 'download.json'));
    const progress = await readJson(join(outputDirectory, 'progress.json'));
    if (intent.projectDirectory !== directory || intent.workspaceIdentity !== state.workspaceIdentity ||
        progress.versionId !== intent.versionId || progress.expectedSourceSha256 !== intent.expectedSourceSha256 || !progress.file)
      throw fault('NOCODB_PROJECT_DOWNLOAD_INPUT_CHANGED');
    const file = join(outputDirectory, 'packet.json'), verified = await checkedPacket(state, file, progress);
    return { ...verified, file, outputDirectory, state: 'COMPLETE', offline: true };
  } finally { await release(); }
}
