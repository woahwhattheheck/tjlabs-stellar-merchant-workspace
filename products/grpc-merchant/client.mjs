// MIT. Product clients bind one original gRPC workspace and reuse its complete merchant file transport.
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { grpcWorkspaceTools } from '../../stellar-forge/mcp-merchant-operator/catalog/grpc-workspace.mjs';
import { openMerchantFileClient } from '../../stellar-forge/mcp-merchant-operator/retained-download.mjs';
import { downloadGrpcExport, inspectGrpcExport } from '../../stellar-forge/mcp-merchant-operator/grpc-workspace-download.mjs';
import { downloadGrpcHealthExport } from '../../stellar-forge/mcp-merchant-operator/grpc-health-download.mjs';
import { downloadGrpcUpgrade } from '../../stellar-forge/mcp-merchant-operator/grpc-upgrade-download.mjs';
import { GRPC_EXPORT_MANIFEST, parseGrpcExportManifest } from '../../stellar-forge/mcp-merchant-operator/grpc-workspace-export.mjs';
import { readGrpcHealthSnapshotFile } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/health-receiving.mjs';
import { readGrpcUpgradeDirectory } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/upgrade-receiving.mjs';
import { SESSION_SCHEMA, UUID, ALIAS, HASH, ENV, plain, need, absolute, privateBytes, privateDirectory,
  decode, canonical, sha256 } from './common.mjs';

const tool = (name, description, properties, required, annotations) => ({ name, description, properties, required, annotations });
const definitions = new Map(grpcWorkspaceTools(tool).map(value => [value.name, value]));
export const grpcProductTools = () => [...definitions.values()].map(value => structuredClone(value));
function connection(bytes) {
  const value = decode(bytes);
  need(plain(value) && value.schema === SESSION_SCHEMA && UUID.test(value.productId ?? '') &&
    UUID.test(value.instanceId ?? '') && ALIAS.test(value.workspace ?? '') && ENV.test(value.tokenEnv ?? ''),
  'Use this product’s original private connection.json.', 'CONNECTION');
  need(value.state === 'OPEN' && value.browserOnly === false, 'Open this original product with its merchant agent.', 'CONNECTION');
  let endpoint;
  try { endpoint = new URL(value.mcpUrl); } catch {}
  need(endpoint && endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' &&
    endpoint.pathname === '/mcp' && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash,
  'Use the original loopback merchant endpoint.', 'CONNECTION');
  return value;
}
/** Every call rereads the current session. Mutations are never automatically replayed. */
export class GrpcProductClient {
  #file; #identity; #environment; #signal; #transport;
  constructor({ directory, connectionFile, productId, workspace, environment = process.env, signal } = {}) {
    need((directory === undefined) !== (connectionFile === undefined), 'Select a product directory or its exact connection file.');
    this.#file = connectionFile === undefined ? join(absolute(directory), 'connection.json') : absolute(connectionFile);
    need((productId === undefined) === (workspace === undefined), 'Bind productId and workspace together.');
    this.#identity = productId === undefined ? null : { productId, workspace };
    this.#environment = environment; this.#signal = signal;
  }
  get endpoint() {
    need(this.#identity, 'Call ready before using the original receiver.', 'CONNECTION');
    return 'grpc-product:' + this.#identity.productId + '/' + this.#identity.workspace;
  }
  async #connect() {
    const bytes = await privateBytes(this.#file, false, 65536), value = connection(bytes);
    const identity = { productId: value.productId, workspace: value.workspace };
    need(!this.#identity || canonical(this.#identity) === canonical(identity),
      'This connection changed its original product or workspace identity.', 'CONNECTION_CHANGED');
    this.#identity ??= identity;
    const key = sha256(Buffer.concat([bytes, Buffer.from('\0' + (this.#environment[value.tokenEnv] ?? ''))]));
    if (this.#transport?.key !== key) {
      const record = { key, promise: openMerchantFileClient({ url: value.mcpUrl, tokenEnv: value.tokenEnv,
        environment: this.#environment, signal: this.#signal, errorPrefix: 'GRPC_PRODUCT',
        clientName: 'starforge-grpc-product', maximumResponseBytes: 64 * 1024 * 1024 }) };
      this.#transport = record;
      record.promise.catch(() => { if (this.#transport === record) this.#transport = null; });
    }
    return { client: await this.#transport.promise, value };
  }
  async ready() {
    const { value } = await this.#connect();
    return { productId: value.productId, workspace: value.workspace, instanceId: value.instanceId,
      nativeInstanceId: value.nativeInstanceId, endpoint: this.endpoint, browserUrl: value.browserUrl, mcpUrl: value.mcpUrl };
  }
  async call(name, input = {}, options = {}) {
    const definition = definitions.get(name);
    need(definition && plain(input), 'Select an original gRPC tool and its exact native arguments.');
    const { client } = await this.#connect(), args = { ...input };
    if (Object.hasOwn(definition.properties, 'workspace')) {
      need(args.workspace === undefined || args.workspace === this.#identity.workspace,
        'This product client is bound to its original workspace.', 'WORKSPACE_CHANGED');
      args.workspace = this.#identity.workspace;
    }
    return client.call(name, args, options);
  }
  async inspectExport(exportId) {
    await this.ready();
    const result = await inspectGrpcExport({ client: this, exportId });
    need(result.manifest.workspace === this.#identity.workspace,
      'The retained export belongs to another original workspace.', 'EXPORT_CHANGED');
    return result;
  }
  /** Pin the already-created immutable export; reuse it after live Watch history grows. */
  async receive({ exportId, directory, expectedManifestSha256, chunkSize, onProgress, signal } = {}) {
    const inspected = await this.inspectExport(exportId);
    need(expectedManifestSha256 === undefined || expectedManifestSha256 === inspected.manifestSha256,
      'Receive the exact selected original manifest.', 'EXPORT_CHANGED');
    const options = { client: this, exportId, directory, expectedManifestSha256: inspected.manifestSha256,
      chunkSize, onProgress, signal: signal ?? this.#signal };
    if (inspected.manifest.kind === 'health') return downloadGrpcHealthExport(options);
    if (inspected.manifest.kind === 'upgrade') return downloadGrpcUpgrade(options);
    return downloadGrpcExport(options);
  }
  status() { return this.call('merchant_grpc_status'); }
  revision(revision, section = 'summary', page = {}) { return this.call('merchant_grpc_revision', { revision, section, ...page }); }
  inventory(kind, page = {}) { return this.call('merchant_grpc_inventory', { kind, ...page }); }
  attempt(operationId) { return this.call('merchant_grpc_attempt', { operationId }); }
  stopCall(operationId) { return this.call('merchant_grpc_cancel_call', { operationId }); }
  healthStop(operationId) { return this.call('merchant_grpc_health_stop', { operationId }); }
  callMethod({ revision, operationId, method, input, file } = {}) {
    return this.call('merchant_grpc_call', { revision, operationId, method,
      ...(input === undefined ? {} : { input }), ...(file === undefined ? {} : { file }) });
  }
  prepare({ revision, operationId } = {}) { return this.call('merchant_grpc_prepare', { revision, operationId }); }
  startHealth({ revision, operationId, request } = {}) { return this.call('merchant_grpc_health_start', { revision, operationId, request }); }
  readHealth({ operationId, ...selection } = {}) { return this.call('merchant_grpc_health_read', { operationId, ...selection }); }
  resumeHealth({ operationId, expectedVersion } = {}) { return this.call('merchant_grpc_health_resume', { operationId, expectedVersion }); }
  exportHealth({ operationId, ...selection } = {}) { return this.call('merchant_grpc_health_export', { operationId, ...selection }); }
}

/** Read every native file after the original server has closed. Stream bytes are hashed incrementally. */
export async function inspectReceivedGrpcProduct(directory, { expectedExportId, expectedManifestSha256 } = {}) {
  const root = await privateDirectory(directory), bytes = await privateBytes(join(root, GRPC_EXPORT_MANIFEST), false, 65000);
  const manifest = parseGrpcExportManifest(bytes, expectedExportId);
  need(expectedManifestSha256 === undefined || sha256(bytes) === expectedManifestSha256,
    'The received manifest differs from the selected original.', 'EXPORT_CHANGED');
  const files = [];
  for (const item of manifest.files) {
    const path = resolve(root, item.path);
    need(await realpath(path) === path, 'An original received file path was replaced.', 'FILE_CHANGED');
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await handle.stat({ bigint: true });
      need(before.isFile() && before.size === BigInt(item.bytes) && !(Number(before.mode) & 0o077),
        'A received file changed its original type, length or private mode.', 'FILE_CHANGED');
      const digest = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024); let offset = 0;
      while (offset < item.bytes) {
        const result = await handle.read(buffer, 0, Math.min(buffer.length, item.bytes - offset), offset);
        need(result.bytesRead > 0, 'A received file ended before its original byte length.', 'FILE_CHANGED');
        digest.update(buffer.subarray(0, result.bytesRead)); offset += result.bytesRead;
      }
      const after = await handle.stat({ bigint: true });
      need(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => before[key] === after[key]) &&
        digest.digest('hex') === item.sha256, 'A received file differs from its retained original hash.', 'FILE_CHANGED');
    } finally { await handle.close(); }
    files.push({ ...item, path });
  }
  let native;
  if (manifest.kind === 'health') {
    const saved = await readGrpcHealthSnapshotFile(join(root, 'grpc-health.json'), manifest.original.snapshotSha256);
    need(saved.value.operation.id === manifest.original.operationId && saved.value.operation.revision === manifest.original.revision,
      'The health observation belongs to another original operation.', 'EXPORT_CHANGED');
    native = { snapshotSha256: saved.value.snapshotSha256, operation: saved.value.summary };
  }
  if (manifest.kind === 'upgrade') {
    const saved = await readGrpcUpgradeDirectory(root, { expectedReviewSha256: manifest.original.reviewSha256 });
    need(saved.summary.id === manifest.original.operationId && saved.summary.baseRevision === manifest.original.revision,
      'The contract review belongs to another original operation.', 'EXPORT_CHANGED');
    native = { upgrade: saved.summary };
  }
  return { schema: 'stellar-forge.grpc-product-received.v1', state: 'COMPLETE', directory: root,
    exportId: manifest.exportId, manifestSha256: sha256(bytes), workspace: manifest.workspace,
    kind: manifest.kind, original: manifest.original, files, bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    ...(manifest.kind === 'customer' ? { customerDirectory: join(root, 'client') } : {}), ...(native ? { native } : {}) };
}
