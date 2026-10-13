// MIT. Complete agent workflow on the original FRED economic-edition host.
import { basename } from 'node:path';
import { readFredAlfredMetadata } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/alfred/model.mjs';
import { RetainedFileReads } from './retained-file-reads.mjs';
import { FredWorkspaceClient, FredWorkspaceError, readFredWorkspaceConfiguration, readFredHostFile,
  canonicalFredJSON, fredDigest, inspectFredReleaseCapture, inspectFredDdpCrosswalk, inspectFredDdpPackage,
  FRED_WORKSPACE_CONNECTION_SCHEMA, FRED_CLIENT_MAX_BYTES, FRED_DDP_MAX_SOURCE_BYTES, FRED_DDP_MAX_PROJECT_BYTES } from './fred-workspace-client.mjs';
import { fredWorkspaceTools, fredFileSelection } from './catalog/fred-workspace.mjs';
export { readFredWorkspaceConfiguration, FRED_WORKSPACE_CONNECTION_SCHEMA };
export { fredWorkspaceTools } from './catalog/fred-workspace.mjs';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message, details) => { throw new FredWorkspaceError(code, message, details); };
const definitions = new Map(fredWorkspaceTools((name, description, properties, required) =>
  ({ name, description, properties, required })).map(value => [value.name, value]));
function check(value, schema, key) {
  if (schema.type === 'string' && (typeof value !== 'string' || schema.minLength !== undefined && value.length < schema.minLength ||
      schema.maxLength !== undefined && value.length > schema.maxLength || schema.pattern && !new RegExp(schema.pattern).test(value)))
    fail('FRED_MCP_INPUT_INVALID', 'Supply the declared ' + key + '.');
  if (schema.type === 'integer' && (!Number.isSafeInteger(value) || value < (schema.minimum ?? 0) || value > (schema.maximum ?? Number.MAX_SAFE_INTEGER)))
    fail('FRED_MCP_INPUT_INVALID', 'Supply a supported integer ' + key + '.');
  if (schema.type === 'boolean' && typeof value !== 'boolean')
    fail('FRED_MCP_INPUT_INVALID', 'Supply a boolean ' + key + '.');
  if (schema.type === 'object') {
    if (!plain(value)) fail('FRED_MCP_INPUT_INVALID', 'Supply a complete JSON object for ' + key + '.');
    if (schema.properties) {
      if ((schema.required ?? []).some(name => !Object.hasOwn(value, name)) ||
          schema.additionalProperties === false && Object.keys(value).some(name => !Object.hasOwn(schema.properties, name)))
        fail('FRED_MCP_INPUT_INVALID', 'Supply the complete declared ' + key + ' fields.');
      for (const [name, item] of Object.entries(value)) if (schema.properties[name]) check(item, schema.properties[name], key + '.' + name);
    }
  }
  if (schema.enum && !schema.enum.includes(value)) fail('FRED_MCP_INPUT_INVALID', 'Choose a declared ' + key + '.');
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? 100000) ||
        schema.uniqueItems && new Set(value.map(canonicalFredJSON)).size !== value.length)
      fail('FRED_MCP_INPUT_INVALID', 'Supply the complete declared ' + key + ' list.');
    value.forEach(item => check(item, schema.items, key));
  }
}
function page(values, { offset = 0, limit = 50 } = {}) {
  if (!Array.isArray(values) || offset > values.length) fail('FRED_MCP_PAGE_INVALID', 'Choose an offset in the original collection.');
  const items = values.slice(offset, offset + limit);
  return { total: values.length, offset, returned: items.length, nextOffset: offset + items.length < values.length ? offset + items.length : null, items };
}
function small(value) {
  if (Buffer.byteLength(JSON.stringify(value)) > 1024 * 1024)
    fail('FRED_MCP_VIEW_TOO_LARGE', 'Use a smaller original record page or the complete corresponding source/customer/project file.');
  return value;
}
function purchaseView(result) {
  const { page: originalPage, ...rest } = result;
  if (!originalPage) return rest;
  return { ...rest, delivery: { format: 'ORIGINAL_DATASET_PAGE', completeBytes: result.bytes, sha256: result.sha256,
    snapshot: result.metadata?.snapshot ?? originalPage.snapshot ?? null,
    nextCursor: result.metadata?.nextCursor ?? originalPage.nextCursor ?? null,
    originalPageKeys: Object.keys(originalPage),
    download: 'merchant_fred_file_read with kind customer and the same publicationId/intentId' } };
}
function projectSummary(project) {
  const { captures, reviews, publications, operations, briefingTemplates = [], briefingSuccessors = [],
    releaseCaptures = [], releaseWatches = [], releasePlans = [], releaseCatchUps = [],
    ddpCrosswalks = [], ddpPackages = [], ddpMigrations = [], ddpReceivings = [], ...state } = project;
  return { ...state, counts: { captures: captures.length, reviews: reviews.length, publications: publications.length,
    operations: operations.length, briefingTemplates: briefingTemplates.length, briefingSuccessors: briefingSuccessors.length,
    releaseCaptures: releaseCaptures.length, releaseWatches: releaseWatches.length, releasePlans: releasePlans.length,
    releaseCatchUps: releaseCatchUps.length, ddpCrosswalks: ddpCrosswalks.length, ddpPackages: ddpPackages.length,
    ddpMigrations: ddpMigrations.length, ddpReceivings: ddpReceivings.length } };
}
const actionMethods = new Map([
  ['merchant_fred_configure', 'configure'], ['merchant_fred_capture', 'capture'], ['merchant_fred_combine', 'combine'],
  ['merchant_fred_select', 'select'], ['merchant_fred_review', 'review'], ['merchant_fred_abandon', 'abandon'],
  ['merchant_fred_merchant_start', 'startMerchant'], ['merchant_fred_merchant_stop', 'stopMerchant'],
  ['merchant_fred_preview', 'preview'], ['merchant_fred_prepare', 'prepare'],
  ['merchant_fred_briefing_template_save', 'saveBriefingTemplate'], ['merchant_fred_briefing_successor_save', 'saveBriefingSuccessor'],
  ['merchant_fred_release_acquire', 'acquireReleaseCapture'], ['merchant_fred_release_watch_save', 'saveReleaseWatch'],
  ['merchant_fred_release_plan_save', 'saveReleasePlan'], ['merchant_fred_release_vintage_capture', 'acquirePlannedVintage'],
  ['merchant_fred_ddp_crosswalk_acquire', 'acquireDdpCrosswalk'], ['merchant_fred_ddp_migration_save', 'saveDdpMigration'],
  ['merchant_fred_ddp_migration_acquire', 'acquireDdpMigration']
]);

export class MerchantFredWorkspaces {
  #config; #exports; #clients = new Map(); #closed = false;
  #reads = new RetainedFileReads({ errorPrefix: 'FRED', maxSnapshotBytes: FRED_DDP_MAX_PROJECT_BYTES });
  constructor(config, { environment = process.env, fetchImpl = globalThis.fetch } = {}) {
    this.#config = config.fredWorkspaces; this.#exports = config.exportsDirectory;
    this.environment = environment; this.fetchImpl = fetchImpl;
  }
  get summary() {
    return { configured: Boolean(this.#config), workspaces: Object.keys(this.#config?.workspaces ?? {}),
      attachedClients: this.#clients.size, ...this.#reads.summary };
  }
  #entry(alias) {
    if (this.#closed) fail('FRED_MCP_CLOSED', 'The original FRED adapter is closing.');
    const entry = this.#config?.workspaces?.[alias];
    if (!entry) fail('FRED_MCP_WORKSPACE_NOT_FOUND', 'Choose an original host-configured economic workspace alias.');
    return entry;
  }
  #client(alias) {
    const entry = this.#entry(alias);
    if (!this.#clients.has(alias)) this.#clients.set(alias, new FredWorkspaceClient(entry, { environment: this.environment, fetchImpl: this.fetchImpl }));
    return this.#clients.get(alias);
  }
  #inputs(alias) {
    const entry = this.#entry(alias);
    return { workspace: alias,
      inputs: Object.entries(entry.inputs ?? {}).map(([input, value]) => ({ input, label: value.label, kind: value.kind,
        ...(value.sha256 ? { configuredSha256: value.sha256 } : {}) })),
      merchantProfiles: Object.entries(entry.merchantProfiles ?? {}).map(([profile, value]) => ({ profile, ...value })) };
  }
  async #input(alias, name, expectedSha256, inspect = false) {
    const input = this.#entry(alias).inputs?.[name];
    if (!input) fail('FRED_MCP_INPUT_NOT_FOUND', 'Choose an original host input alias.');
    const capacity = ['ddp-crosswalk', 'ddp-package'].includes(input.kind) ? FRED_DDP_MAX_SOURCE_BYTES : 64 * 1024 * 1024;
    let bytes = await readFredHostFile(input.path, capacity, { expectedSha256: expectedSha256 ?? input.sha256 });
    const sourceBytes = bytes.length, sha256 = fredDigest(bytes);
    if (input.sha256 && input.sha256 !== sha256) fail('FRED_MCP_INPUT_CHANGED', 'The original source differs from its configured SHA256.');
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('FRED_MCP_INPUT_INVALID', 'The original source input must contain complete JSON.'); }
    bytes = null;
    if (input.kind === 'public-table' && !['commons.retained-public-table.v1', 'commons.retained-public-table-set.v1'].includes(value?.version) ||
        input.kind === 'capture' && !['stellar-forge.fred-capture.v1', 'stellar-forge.fred-public-table-capture.v1',
          'stellar-forge.fred-public-table-set-capture.v1', 'stellar-forge.alfred-vintage-capture.v1'].includes(value?.schema))
      fail('FRED_MCP_INPUT_INVALID', 'The complete input does not have its declared original source format.');
    if (input.kind === 'alfred-metadata') {
      if (!Array.isArray(value) || value.some(item => item?.schema !== 'stellar-forge.alfred-metadata-edition.v1') ||
          new Set(value.map(item => item?.series?.value)).size !== value.length)
        fail('FRED_MCP_INPUT_INVALID', 'Historical metadata input requires a complete JSON array of original series editions.');
      for (const item of value) readFredAlfredMetadata(item, { series: item.series?.value, vintage: item.selectedVintage?.value });
    }
    let release = null, ddp = null;
    if (inspect && input.kind === 'release-capture') {
      const model = inspectFredReleaseCapture(value);
      release = { captureSha256: model.captureSha256, source: model.source,
        counts: { series: model.series.length, releases: model.releases.length,
          calendar: model.calendar.length, vintages: model.vintages.length, records: value.records.length } };
    }
    if (inspect && ['ddp-crosswalk', 'ddp-package'].includes(input.kind)) {
      const model = input.kind === 'ddp-crosswalk' ? inspectFredDdpCrosswalk(value) : inspectFredDdpPackage(value);
      ddp = { id: model.id, captureSha256: model.captureSha256, source: model.source, summary: model.summary,
        ...(model.release !== undefined ? { release: model.release } : {}),
        ...(model.format !== undefined ? { format: model.format } : {}) };
    }
    return { input, sourceBytes, sha256, value, release, ddp };
  }
  async #state(alias, expectedRevision) {
    const value = await this.#client(alias).state();
    if (expectedRevision !== undefined && value.project.revision !== expectedRevision)
      fail('FRED_MCP_REVISION_CHANGED', 'The original project changed. Continue from its current revision.', { revision: value.project.revision });
    return value;
  }
  async #call(name, args) {
    if (name === 'merchant_fred_workspaces') return { ...this.summary,
      workspaces: Object.entries(this.#config?.workspaces ?? {}).map(([workspace, value]) => ({
        workspace, label: value.label, projectId: value.projectId ?? null, ...this.#inputs(workspace) })) };
    const alias = args.workspace;
    this.#entry(alias);
    if (name === 'merchant_fred_inputs') return this.#inputs(alias);
    if (name === 'merchant_fred_input_inspect') {
      const source = await this.#input(alias, args.input, undefined, true), original = source.value;
      return { workspace: alias, input: args.input, kind: source.input.kind, name: basename(source.input.path),
        bytes: source.sourceBytes, sha256: source.sha256, schema: original.schema ?? original.version,
        sourceUrl: original.source_url ?? null, retrievedAt: original.retrieved_at ?? null,
        seriesId: original.series_id ?? null, observationCount: original.observation_count ?? null,
        originalTableBytes: original.bytes ?? null, originalTableSha256: original.sha256 ?? null,
        captureSha256: original.captureSha256 ?? null, selection: original.selection ?? null,
        ...(source.release ? { release: source.release } : {}),
        ...(source.ddp ? { ddp: source.ddp } : {}),
        ...(source.input.kind === 'alfred-metadata' ? { metadataEditionCount: original.length } : {}),
        tables: Array.isArray(original.tables) ? original.tables.map(table => ({ seriesId: table.series_id,
          sourceUrl: table.source_url, retrievedAt: table.retrieved_at, bytes: table.bytes, sha256: table.sha256 })) : undefined };
    }
    if (name === 'merchant_fred_file_release') {
      await this.#reads.release(alias, args.readId); return { workspace: alias, readId: args.readId, state: 'RELEASED' };
    }
    if (name === 'merchant_fred_disconnect') {
      this.#clients.get(alias)?.close(); this.#clients.delete(alias); await this.#reads.closeScope(alias);
      return { workspace: alias, client: 'DISCONNECTED' };
    }
    const client = this.#client(alias);
    if (name === 'merchant_fred_status') {
      const result = await this.#state(alias);
      return { workspace: alias, project: projectSummary(result.project), merchant: result.merchant,
        busy: result.busy, buyerConfigured: result.buyerConfigured, client: client.metadata,
        fileReads: this.#reads.status(alias), ...this.#inputs(alias) };
    }
    if (name === 'merchant_fred_records' || name === 'merchant_fred_record') {
      const { project } = await this.#state(alias, args.expectedRevision);
      const values = project[args.kind] ?? [];
      if (name === 'merchant_fred_records') return { projectId: project.id, revision: project.revision, kind: args.kind, ...page(values, args) };
      const record = values.find(item => item.id === args.id);
      if (!record) fail('FRED_MCP_RECORD_NOT_FOUND', 'The selected record does not belong to this original project.');
      return { projectId: project.id, revision: project.revision, kind: args.kind, record };
    }
    if (name === 'merchant_fred_operation') return client.operation(args.id);
    if (name === 'merchant_fred_observations') return client.observations(args);
    if (name === 'merchant_fred_compare') return client.compare(args);
    if (name === 'merchant_fred_briefing_preview') return client.previewBriefing(args);
    if (name === 'merchant_fred_briefing') return client.briefing(args);
    if (name === 'merchant_fred_briefing_templates') {
      const result = await client.briefingTemplates();
      if (args.expectedRevision !== undefined && result.revision !== args.expectedRevision)
        fail('FRED_MCP_REVISION_CHANGED', 'The briefing inventory changed. Continue from its current project revision.', { revision: result.revision });
      const kind = args.kind ?? 'templates';
      return { projectId: result.projectId, revision: result.revision, kind,
        counts: { templates: result.templates.length, successors: result.successors.length },
        ...page(result[kind], args) };
    }
    if (name === 'merchant_fred_briefing_successor_preview') {
      const { workspace: _, ...input } = args;
      return client.previewBriefingSuccessor(input);
    }
    if (name === 'merchant_fred_briefing_successor') return client.briefingSuccessor(args);
    if (name === 'merchant_fred_release_captures' || name === 'merchant_fred_release_watches') {
      const sources = name === 'merchant_fred_release_captures';
      const result = sources ? await client.releaseCaptures() : await client.releaseWatches();
      if (args.expectedRevision !== undefined && result.revision !== args.expectedRevision)
        fail('FRED_MCP_REVISION_CHANGED', 'The release inventory changed. Continue from its current project revision.', { revision: result.revision });
      const kind = sources ? 'captures' : args.kind ?? 'watches';
      return { projectId: result.projectId, revision: result.revision, kind,
        counts: sources ? { captures: result.captures.length } :
          { watches: result.watches.length, plans: result.plans.length, catchUps: result.catchUps.length },
        ...page(result[kind], args) };
    }
    if (name === 'merchant_fred_release_capture') return client.releaseCapture(args);
    if (name === 'merchant_fred_release_plan') return client.releasePlan(args);
    if (name === 'merchant_fred_release_plan_preview') {
      const { workspace: _, ...input } = args;
      return client.previewReleasePlan(input);
    }
    if (name === 'merchant_fred_release_import') {
      if (args.input === undefined) {
        if (args.releaseCaptureId === undefined || args.expectedSha256 !== undefined)
          fail('FRED_MCP_INPUT_INVALID', 'Continue the same staged release import with its original releaseCaptureId, or select a complete configured release input.');
        return client.importReleaseCapture({ id: args.id, expectedRevision: args.expectedRevision, releaseCaptureId: args.releaseCaptureId });
      }
      const source = await this.#input(alias, args.input, args.expectedSha256);
      if (source.input.kind !== 'release-capture')
        fail('FRED_MCP_INPUT_INVALID', 'Release import selects a complete host input declared as release-capture.');
      return client.importReleaseCapture({ id: args.id, expectedRevision: args.expectedRevision, capture: source.value,
        ...(args.releaseCaptureId === undefined ? {} : { releaseCaptureId: args.releaseCaptureId }) });
    }
    if (name === 'merchant_fred_ddp_sources') {
      const result = await client.ddpSources(), kind = args.kind ?? 'packages';
      if (args.expectedRevision !== undefined && result.revision !== args.expectedRevision)
        fail('FRED_MCP_REVISION_CHANGED', 'The DDP inventory changed. Continue with the current original project revision.', { revision: result.revision });
      return { projectId: result.projectId, revision: result.revision, kind,
        counts: Object.fromEntries(['crosswalks', 'packages', 'migrations', 'receivings'].map(key => [key, result[key].length])),
        ...page(result[kind], args) };
    }
    if (name === 'merchant_fred_ddp_crosswalk') return client.ddpCrosswalk(args);
    if (name === 'merchant_fred_ddp_package') return client.ddpPackage(args);
    if (name === 'merchant_fred_ddp_migration') return client.ddpMigration(args);
    if (name === 'merchant_fred_ddp_receiving') return client.ddpReceiving(args);
    if (name === 'merchant_fred_ddp_migration_preview') {
      const { workspace: _, ...input } = args;
      return client.previewDdpMigration(input);
    }
    if (name === 'merchant_fred_ddp_crosswalk_import' || name === 'merchant_fred_ddp_package_import') {
      const crosswalk = name === 'merchant_fred_ddp_crosswalk_import';
      const key = crosswalk ? 'crosswalkId' : 'packageId', kind = crosswalk ? 'ddp-crosswalk' : 'ddp-package';
      const method = crosswalk ? 'importDdpCrosswalk' : 'importDdpPackage';
      const input = { id: args.id, expectedRevision: args.expectedRevision };
      if (args[key] !== undefined) input[key] = args[key];
      if (args.input === undefined) {
        if (args[key] === undefined || args.expectedSha256 !== undefined)
          fail('FRED_MCP_INPUT_INVALID', 'Select the complete configured ' + kind + ' input, or continue its original staged operation with the same retained source ID.');
      } else {
        const source = await this.#input(alias, args.input, args.expectedSha256);
        if (source.input.kind !== kind)
          fail('FRED_MCP_INPUT_INVALID', 'This original source import requires a host input declared as ' + kind + '.');
        input.capture = source.value;
      }
      return client[method](input);
    }
    if (name === 'merchant_fred_ddp_migration_acquire') {
      const { workspace: _, metadataInput, metadataFileSha256, ...input } = args;
      if (metadataInput !== undefined) {
        const source = await this.#input(alias, metadataInput, metadataFileSha256);
        if (source.input.kind !== 'alfred-metadata')
          fail('FRED_MCP_INPUT_INVALID', 'Choose a configured alfred-metadata input containing every original edition.');
        input.metadata = source.value;
      } else if (metadataFileSha256 !== undefined)
        fail('FRED_MCP_INPUT_INVALID', 'A metadata file SHA256 requires its configured input alias.');
      return client.acquireDdpMigration(input);
    }
    if (name === 'merchant_fred_import') {
      const source = await this.#input(alias, args.input, args.expectedSha256);
      if (['release-capture', 'ddp-crosswalk', 'ddp-package', 'alfred-metadata'].includes(source.input.kind))
        fail('FRED_MCP_INPUT_INVALID', 'Use the corresponding original release or DDP source import; observation import selects an observation capture or public table.');
      return client.importCapture({ id: args.id, expectedRevision: args.expectedRevision, capture: source.value });
    }
    if (name === 'merchant_fred_publish') {
      const profile = this.#entry(alias).merchantProfiles?.[args.profile];
      if (!profile) fail('FRED_MCP_PROFILE_NOT_FOUND', 'Choose a configured original merchant/payment profile.');
      return client.publish({ id: args.id, expectedRevision: args.expectedRevision, reviewId: args.reviewId,
        origin: profile.origin, path: profile.path, payment: profile.payment });
    }
    if (name === 'merchant_fred_publication' || name === 'merchant_fred_requests') {
      const result = await client.publication(args.publicationId);
      if (name === 'merchant_fred_publication') {
        const { requests, ...publication } = result; return { ...publication, preparedRequests: requests.length };
      }
      const viewSha256 = fredDigest(Buffer.from(canonicalFredJSON(result.requests)));
      if (args.expectedViewSha256 && args.expectedViewSha256 !== viewSha256)
        fail('FRED_MCP_VIEW_CHANGED', 'The original request inventory changed. Read it again from offset zero.', { viewSha256 });
      return { publicationId: args.publicationId, viewSha256, ...page(result.requests, args) };
    }
    if (name === 'merchant_fred_buy') return purchaseView(await client.buy(args));
    if (name === 'merchant_fred_recover') return purchaseView(await client.recover(args));
    if (name === 'merchant_fred_file_read') {
      const selection = Object.fromEntries(Object.keys(fredFileSelection).filter(key => args[key] !== undefined).map(key => [key, args[key]]));
      return this.#reads.read({ scope: alias, key: canonicalFredJSON(selection), kind: 'fred-' + args.kind, directory: this.#exports,
        load: () => client.file(selection, { expectedSha256: args.expectedSha256 }), expectedSha256: args.expectedSha256,
        readId: args.readId, offset: args.offset, limit: args.limit });
    }
    const publicationMethods = {
      merchant_fred_published_operations: 'publishedOperations', merchant_fred_published_operation: 'publishedOperation',
      merchant_fred_published_start: 'startPublishedOperation', merchant_fred_published_report: 'publishedReport',
      merchant_fred_published_rows: 'publishedRows', merchant_fred_published_file_read: 'publishedFileChunk'
    };
    if (Object.hasOwn(publicationMethods, name)) {
      const { workspace: _, ...input } = args; return client[publicationMethods[name]](input);
    }
    if (actionMethods.has(name)) {
      const { workspace: _, ...input } = args;
      return client[actionMethods.get(name)](input);
    }
    fail('FRED_MCP_METHOD_UNKNOWN', 'Unknown original economic-workspace method.');
  }
  async call(name, args = {}) {
    const definition = definitions.get(name);
    if (!definition || !plain(args) || Object.keys(args).some(key => !Object.hasOwn(definition.properties, key)) ||
        definition.required.some(key => !Object.hasOwn(args, key)))
      fail('FRED_MCP_INPUT_INVALID', 'Supply the declared fields and all required values.');
    for (const [key, value] of Object.entries(args)) check(value, definition.properties[key], key);
    return small(await this.#call(name, args));
  }
  async close() {
    this.#closed = true;
    for (const client of this.#clients.values()) client.close();
    this.#clients.clear(); await this.#reads.close();
  }
}
