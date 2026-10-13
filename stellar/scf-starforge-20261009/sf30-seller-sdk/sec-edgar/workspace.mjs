// MIT. Retained SEC product drafts over the original immutable capture store.
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { privateDirectory, readJson, writeJson } from '../../sf88-operator-buyer-cli/node/store.mjs';
import { SCHEMA, compileEdgarMerchant, merchantReview, merchantOpenApi, buyerHandoff as buildBuyerHandoff } from './config.mjs';
import { openEdgarStore } from './source.mjs';

export const WORKSPACE_SCHEMA = 'stellar-forge.sec-edgar-workspace.v1';
export const HANDOFF_SCHEMA = 'stellar-forge.sec-edgar-buyer-handoff.v1';
const copy = value => structuredClone(value);
const revisionName = revision => String(revision).padStart(12, '0') + '.json';
const error = (code, message, status = 400, extra = {}) => Object.assign(new Error(message), { code, status, ...extra });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireRevision = value => {
  if (!Number.isSafeInteger(value) || value < 0) throw error('EDGAR_EXPECTED_REVISION_REQUIRED', 'Send the revision currently open in this workspace.');
};
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Reopen the same private version history and immutable capture directory. */
export async function openEdgarWorkspace(directory, { storeDirectory, title = 'SEC EDGAR merchant', python, signal } = {}) {
  directory = await privateDirectory(resolve(directory));
  const versions = await privateDirectory(join(directory, 'versions'));
  const source = await openEdgarStore(resolve(storeDirectory ?? join(directory, 'captures')));
  let closed = false;
  const checkOpen = () => { if (closed) throw error('EDGAR_WORKSPACE_CLOSED', 'This workspace has closed.', 503); };
  const names = async () => (await readdir(versions)).filter(name => /^\d{12}\.json$/.test(name)).sort();
  const load = async revision => {
    checkOpen();
    const files = await names();
    const name = revision === undefined ? files.at(-1) : revisionName(revision);
    if (!name || !files.includes(name)) throw error('EDGAR_REVISION_NOT_FOUND', 'The requested saved draft does not exist.', 404);
    const state = await readJson(join(versions, name), 8 * 1024 * 1024);
    if (state.schema !== WORKSPACE_SCHEMA || !Number.isSafeInteger(state.revision) || revisionName(state.revision) !== name)
      throw error('EDGAR_WORKSPACE_INVALID', 'The retained workspace revision is invalid.', 500);
    return state;
  };
  try {
    if (!(await names()).length) {
      const now = new Date().toISOString();
      try {
        await writeJson(join(versions, revisionName(0)), {
          schema: WORKSPACE_SCHEMA, workspaceId: 'edgar-' + randomUUID(), revision: 0,
          title, createdAt: now, updatedAt: now, action: 'created', config: null, configSha256: null,
        }, { exclusive: true });
      } catch (cause) { if (cause.code !== 'EEXIST') throw cause; }
    }
    await load();
  } catch (cause) { await source.close?.(); throw cause; }

  async function validateBindings(config) {
    const compiled = compileEdgarMerchant(config);
    const editions = new Map();
    for (const product of compiled.products) {
      let edition = editions.get(product.editionId);
      if (!edition) {
        const selected = await source.getEdition(product.editionId);
        edition = selected.record;
        editions.set(product.editionId, edition);
      }
      if (edition.kind !== product.kind || edition.cik !== product.cik || edition.sourceSha256 !== product.sourceSha256)
        throw error('EDGAR_PRODUCT_SOURCE_CHANGED', 'Product ' + product.id + ' does not match its selected capture. Choose the capture again.');
      await source.query(product.editionId, product, product.example);
    }
    return { compiled, editions: [...editions.values()] };
  }

  async function saveDraft({ expectedRevision, config, restoredFrom = null, returnedWorkspace = null } = {}) {
    requireRevision(expectedRevision);
    if (returnedWorkspace !== null) {
      const allowed = new Set(['schema', 'requestId', 'requestSha256', 'returnId', 'reviewSha256',
        'issuedRevision', 'currentRevision', 'returnedRevision', 'actor', 'notes']);
      if (!object(returnedWorkspace) || Object.keys(returnedWorkspace).some(key => !allowed.has(key)) ||
          returnedWorkspace.schema !== 'stellar-forge.sec-edgar-return-application.v1' ||
          !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(returnedWorkspace.requestId ?? '') ||
          !['requestSha256', 'returnId', 'reviewSha256'].every(key => /^[a-f0-9]{64}$/.test(returnedWorkspace[key] ?? '')) ||
          !['issuedRevision', 'currentRevision', 'returnedRevision'].every(key =>
            Number.isSafeInteger(returnedWorkspace[key]) && returnedWorkspace[key] >= 0) ||
          returnedWorkspace.currentRevision !== expectedRevision ||
          typeof returnedWorkspace.actor !== 'string' || !returnedWorkspace.actor.trim() || returnedWorkspace.actor.length > 256 ||
          (returnedWorkspace.notes !== undefined && (typeof returnedWorkspace.notes !== 'string' || returnedWorkspace.notes.length > 8192)))
        throw error('EDGAR_RETURN_APPLICATION_INVALID', 'The original returned-workspace decision is invalid.');
    }
    if (!object(config)) throw error('EDGAR_CONFIG_REQUIRED', 'A merchant configuration is required.');
    // The compiler owns product/payment semantics; the workspace owns retained source binding.
    const { compiled } = await validateBindings(config);
    const retained = copy(compiled.config);
    const current = await load();
    if (current.revision !== expectedRevision)
      throw error('EDGAR_REVISION_CHANGED', 'Another operator saved this draft. Reload the saved version before applying your changes.', 409,
        { currentRevision: current.revision });
    const configSha256 = hash(retained);
    if (returnedWorkspace === null && current.configSha256 === configSha256) return { ...copy(current), review: merchantReview(compiled), unchanged: true };
    const { returnedWorkspace: previousReturn, ...prior } = current;
    const next = { ...prior, revision: current.revision + 1, updatedAt: new Date().toISOString(),
      title: retained.title, action: restoredFrom === null ? 'draft-saved' : 'revision-restored',
      config: retained, configSha256, restoredFrom,
      ...(returnedWorkspace === null ? {} : { action: 'returned-workspace-applied', returnedWorkspace: copy(returnedWorkspace) }) };
    try { await writeJson(join(versions, revisionName(next.revision)), next, { exclusive: true }); }
    catch (cause) {
      if (cause.code !== 'EEXIST') throw cause;
      throw error('EDGAR_REVISION_CHANGED', 'Another operator saved this draft. Your local edits remain available.', 409,
        { currentRevision: (await load()).revision });
    }
    return { ...copy(next), review: merchantReview(compiled), unchanged: false };
  }

  async function snapshot() {
    const state = await load();
    const editions = await source.listEditions();
    let review = null, sourceStatus = [];
    if (state.config) {
      review = merchantReview(compileEdgarMerchant(state.config));
      sourceStatus = await Promise.all(state.config.products.map(async product => {
        try {
          const { record } = await source.getEdition(product.editionId);
          return { productId: product.id, editionId: product.editionId,
            available: record.sourceSha256 === product.sourceSha256 && record.cik === product.cik && record.kind === product.kind };
        } catch (cause) { return { productId: product.id, editionId: product.editionId, available: false, error: cause.code ?? 'EDGAR_SOURCE_UNAVAILABLE' }; }
      }));
    }
    return { ...copy(state), editions, review, sourceStatus };
  }

  async function preview({ productId, query = {}, config } = {}) {
    const state = await load();
    config ??= state.config;
    if (!config) throw error('EDGAR_DRAFT_REQUIRED', 'Create a product before previewing its records.');
    const { compiled } = await validateBindings(config);
    const product = compiled.products.find(item => item.id === productId);
    if (!product) throw error('EDGAR_PRODUCT_NOT_FOUND', 'Choose an existing data product.', 404);
    if (!object(query)) throw error('EDGAR_QUERY_INVALID', 'Query parameters must be an object.');
    return source.query(product.editionId, product, query);
  }

  async function buyerHandoff() {
    const state = await load();
    if (!state.config) throw error('EDGAR_DRAFT_REQUIRED', 'Save a merchant configuration before exporting a handoff.');
    const { compiled, editions } = await validateBindings(state.config);
    return { ...buildBuyerHandoff(compiled), generatedAt: new Date().toISOString(), workspaceId: state.workspaceId,
      revision: state.revision, configSha256: state.configSha256, sourceEditions: editions, review: merchantReview(compiled),
      openapi: merchantOpenApi(compiled, 'NATIVE_X402'), merchantConfig: copy(state.config) };
  }

  let returnsPromise = null;
  async function returnsDesk() {
    checkOpen();
    return returnsPromise ??= import('./returned-workspace.mjs').then(({ openEdgarReturns }) =>
      openEdgarReturns({ directory, storeDirectory: source.root, workspace: { snapshot, saveDraft }, python, signal }));
  }
  return {
    directory, source, storeDirectory: source.root,
    snapshot, preview, buyerHandoff,
    saveDraft(input = {}) {
      if (Object.hasOwn(input, 'returnedWorkspace'))
        throw error('EDGAR_RETURN_REVIEW_REQUIRED', 'Apply returned-workspace choices through their original comparison.');
      return saveDraft(input);
    },
    async receiveReturn(input) { return (await returnsDesk()).receive(input); },
    async listReturns() { return (await returnsDesk()).list(); },
    async inspectReturn(input) { return (await returnsDesk()).inspect(input); },
    async previewReturn(input) { return (await returnsDesk()).preview(input); },
    async applyReturn(input) { return (await returnsDesk()).apply(input); },
    async returnOperation(input) { return (await returnsDesk()).operation(input); },
    async listRevisions({ limit = 50 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw error('EDGAR_REVISION_LIMIT', 'Revision limit must be 1–200.');
      const files = await names();
      const rows = await Promise.all(files.slice(-limit).reverse().map(async name => {
        const state = await readJson(join(versions, name), 8 * 1024 * 1024);
        return { revision: state.revision, updatedAt: state.updatedAt, title: state.title,
          action: state.action, configSha256: state.configSha256, products: state.config?.products?.length ?? 0 };
      }));
      return { revisions: rows, total: files.length, hasMore: files.length > rows.length };
    },
    async restoreRevision({ revision, expectedRevision } = {}) {
      requireRevision(revision); requireRevision(expectedRevision);
      const original = await load(revision);
      if (!original.config) throw error('EDGAR_EMPTY_REVISION', 'This revision predates the first saved merchant.');
      return saveDraft({ expectedRevision, config: original.config, restoredFrom: revision });
    },
    async importCapture(input) { checkOpen(); return source.importCapture(input); },
    async getEdition(id) { checkOpen(); return source.getEdition(id); },
    async readRaw(id) { checkOpen(); return source.readRaw(id); },
    async exportConfig() {
      const state = await load();
      if (!state.config) throw error('EDGAR_DRAFT_REQUIRED', 'Save a merchant configuration first.');
      await validateBindings(state.config); return copy(state.config);
    },
    async exportOpenApi() { return merchantOpenApi(compileEdgarMerchant(await this.exportConfig()), 'NATIVE_X402'); },
    async reviewPortable() {
      checkOpen();
      const { reviewEdgarOperator } = await import('./receiving/operator.mjs');
      return (await reviewEdgarOperator({ directory, storeDirectory: source.root })).summary;
    },
    async exportPortable({ exportId: id, expectedReviewSha256 } = {}) {
      checkOpen();
      const { exportId } = await import('./receiving/manifest.mjs');
      const { exportEdgarOperator } = await import('./receiving/operator.mjs');
      return exportEdgarOperator({ directory, storeDirectory: source.root,
        outputDirectory: join(directory, 'portable-exports', exportId(id)), expectedReviewSha256 });
    },
    async portableExport(id) {
      checkOpen();
      const { exportId } = await import('./receiving/manifest.mjs');
      const { completedEdgarOperatorExport } = await import('./receiving/operator.mjs');
      return completedEdgarOperatorExport({ outputDirectory: join(directory, 'portable-exports', exportId(id)) });
    },
    async portableManifest(id) {
      checkOpen();
      const { exportId } = await import('./receiving/manifest.mjs');
      const { readEdgarOperatorManifest } = await import('./receiving/operator.mjs');
      return readEdgarOperatorManifest({ outputDirectory: join(directory, 'portable-exports', exportId(id)) });
    },
    async close() { if (closed) return; closed = true; await source.close?.(); },
  };
}

export function emptyEdgarDraft({ title = 'SEC EDGAR merchant', publicOrigin = 'https://merchant.example' } = {}) {
  return { schema: SCHEMA, title, publicOrigin, products: [] };
}
