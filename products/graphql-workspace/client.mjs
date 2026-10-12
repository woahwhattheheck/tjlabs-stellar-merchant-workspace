// MIT. GraphQL product clients share the original MCP and retained-file transport.
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { graphqlWorkspaceTools } from '../../stellar-forge/mcp-merchant-operator/catalog/graphql-workspace.mjs';
import { graphqlFileTools } from '../../stellar-forge/mcp-merchant-operator/catalog/graphql-workspace-files.mjs';
import { openMerchantFileClient } from '../../stellar-forge/mcp-merchant-operator/retained-download.mjs';
import { downloadGraphqlWorkspaceFiles, inspectGraphqlWorkspaceFiles } from '../../stellar-forge/mcp-merchant-operator/graphql-workspace-download.mjs';
import { GRAPHQL_EXPORT_MANIFEST, readGraphqlFileManifest } from '../../stellar-forge/mcp-merchant-operator/graphql-export-manifest.mjs';
import { GRAPHQL_PRODUCT_SESSION_SCHEMA, privateBytes, privateDirectory, decode, plain, canonical, sha256, failure, absolute } from './workspace.mjs';

const tool = (name, description, properties) => ({ name, properties });
const definitions = new Map([...graphqlWorkspaceTools(tool), ...graphqlFileTools(tool)].map(value => [value.name, value]));
function reject(message) { throw failure('GRAPHQL_PRODUCT_CLIENT', message); }
function session(bytes) {
  const value = decode(bytes);
  if (!plain(value) || value.schema !== GRAPHQL_PRODUCT_SESSION_SCHEMA ||
      !/^[a-f0-9-]{36}$/.test(value.productId ?? '') || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.workspace ?? ''))
    reject('Select this product’s original private connection.json.');
  if (value.state !== 'OPEN' || typeof value.mcpUrl !== 'string')
    reject('Start the original GraphQL product with its merchant agent before connecting.');
  return value;
}
/** Reread the same connection before every call; restart never substitutes a workspace or replays a mutation. */
export class GraphqlProductClient {
  #file; #environment; #signal; #identity; #transport;
  constructor({ connectionFile, productId, workspace, environment = process.env, signal } = {}) {
    this.#file = absolute(connectionFile); this.#environment = environment; this.#signal = signal;
    if ((productId === undefined) !== (workspace === undefined)) reject('Bind both productId and workspace, or read both from the original connection.');
    this.#identity = productId === undefined ? null : { productId, workspace };
  }
  get endpoint() {
    if (!this.#identity) reject('Call ready() before passing this product client to the native downloader.');
    return 'graphql-product:' + this.#identity.productId + '/' + this.#identity.workspace;
  }
  async #connected() {
    const bytes = await privateBytes(this.#file), value = session(bytes);
    const identity = { productId: value.productId, workspace: value.workspace };
    if (this.#identity && canonical(identity) !== canonical(this.#identity))
      reject('The connection now belongs to a different product or workspace. Select it explicitly in a new client.');
    this.#identity ??= identity;
    const credential = this.#environment[value.tokenEnv];
    const key = sha256(Buffer.concat([bytes, Buffer.from('\0' + (credential ?? ''))]));
    if (this.#transport?.key !== key) {
      const record = { key, value, promise: null };
      record.promise = openMerchantFileClient({ url: value.mcpUrl, tokenEnv: value.tokenEnv,
        environment: this.#environment, signal: this.#signal, errorPrefix: 'GRAPHQL',
        clientName: 'starforge-graphql-product', maximumResponseBytes: 24 * 1024 * 1024 });
      this.#transport = record;
      record.promise.catch(() => { if (this.#transport === record) this.#transport = null; });
    }
    return { client: await this.#transport.promise, value };
  }
  async ready() {
    const { value } = await this.#connected();
    return { productId: value.productId, workspace: value.workspace, endpoint: this.endpoint,
      browserUrl: value.browserUrl, nativeInstanceId: value.nativeInstanceId, mcpUrl: value.mcpUrl };
  }
  async call(name, args = {}, options = {}) {
    const definition = definitions.get(name);
    if (!definition || !plain(args)) reject('Select an original GraphQL tool and its JSON arguments.');
    const { client } = await this.#connected();
    const selected = { ...args };
    if (Object.hasOwn(definition.properties, 'workspace')) {
      if (selected.workspace !== undefined && selected.workspace !== this.#identity.workspace)
        reject('This client remains bound to its original GraphQL workspace.');
      selected.workspace = this.#identity.workspace;
    }
    return client.call(name, selected, options);
  }
  async inspectFiles(exportId) {
    await this.ready();
    const inspected = await inspectGraphqlWorkspaceFiles({ client: this, exportId });
    if (inspected.manifest.workspace !== this.#identity.workspace)
      throw failure('GRAPHQL_PRODUCT_EXPORT_CHANGED', 'The selected transfer belongs to another original GraphQL workspace.');
    return inspected;
  }
  async receiveFiles({ exportId, selection, directory, expectedManifestSha256, chunkSize, onProgress, signal } = {}) {
    await this.ready();
    if (selection !== undefined) {
      if (!plain(selection) || Object.hasOwn(selection, 'exportId')) reject('Pass the stable transfer exportId separately from its original file selection.');
      await this.call('merchant_graphql_export_prepare', { ...selection, exportId });
    }
    const inspected = await this.inspectFiles(exportId);
    if (expectedManifestSha256 !== undefined && expectedManifestSha256 !== inspected.manifestSha256)
      throw failure('GRAPHQL_PRODUCT_EXPORT_CHANGED', 'The native transfer differs from the selected manifest.');
    return downloadGraphqlWorkspaceFiles({ client: this, exportId, directory,
      expectedManifestSha256: inspected.manifestSha256, chunkSize, onProgress, signal: signal ?? this.#signal });
  }
}
/** Offline opening verifies the original manifest and every byte, without a listener or writer. */
export async function inspectReceivedGraphqlFiles(directory) {
  const root = await privateDirectory(directory);
  const bytes = await privateBytes(join(root, GRAPHQL_EXPORT_MANIFEST), false, 65000);
  const initial = decode(bytes), manifest = readGraphqlFileManifest(bytes, initial.exportId);
  const files = [];
  for (const selected of manifest.files) {
    const path = resolve(root, selected.name);
    if (await realpath(path) !== path) reject('A received native path was replaced by a symbolic link.');
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await handle.stat(), digest = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024);
      if (!before.isFile() || before.size !== selected.bytes) reject('A received native file changed its type or length: ' + selected.name);
      let offset = 0;
      while (offset < selected.bytes) {
        const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, selected.bytes - offset), offset);
        if (!bytesRead) reject('A received native file ended before its retained length: ' + selected.name);
        digest.update(buffer.subarray(0, bytesRead)); offset += bytesRead;
      }
      const after = await handle.stat();
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
          before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || digest.digest('hex') !== selected.sha256)
        reject('A received native file differs from its original identity: ' + selected.name);
      files.push({ ...selected, path });
    } finally { await handle.close(); }
  }
  return { schema: 'stellar-forge.graphql-product-received.v1', state: 'COMPLETE', directory: root,
    exportId: manifest.exportId, workspace: manifest.workspace, selection: manifest.selection,
    source: manifest.source, manifestSha256: sha256(bytes), files, bytes: files.reduce((sum, item) => sum + item.bytes, 0) };
}
