// MIT. Commissioning collection through the original merchant accounting session.
import {CommissioningCollectionsWorkspace, COMMISSIONING_SOURCE_BYTES}
  from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/commissioning-collections/workspace.mjs';
import {need, plain, field, renderCustomerTar}
  from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/core.mjs';

export {commissioningDefinitions, commissioningFileNames, commissioningFileSelectors}
  from './catalog/accounting-commissioning.mjs';

const PREFIX = 'merchant_accounting_commissioning_';
const clone = value => structuredClone(value);
function input(args, ...selectors) {
  const excluded = new Set(['workspace', ...selectors]);
  return Object.fromEntries(Object.entries(args).filter(([key]) => !excluded.has(key)));
}
function sourceFiles(sourceId, files) {
  return files.map(file => ({...file, selection: {kind: 'commissioning-source', sourceId, file: file.name}}));
}
function captureFiles(captureId, files) {
  return files.map(file => ({...file, selection: {kind: 'commissioning-capture', captureId, file: file.name}}));
}

/** Borrows the already initialized receivables controller and its original lease. */
export class MerchantCommissioning {
  constructor(receivables, {readSource} = {}) {
    this.controller = new CommissioningCollectionsWorkspace(receivables);
    this.workspace = receivables.workspace;
    this.readSource = readSource;
  }
  async init() { await this.controller.init(); return this; }

  async inspect(args) {
    const value = input(args, 'sourceAlias');
    if (args.sourceAlias !== undefined) {
      need(plain(value.file) && value.file.dataBase64 === undefined,
        'ACCOUNTING_COMMISSIONING_SOURCE_SELECTION',
        'Choose a configured source alias with its original filename, or send the complete inline file.');
      need(typeof this.readSource === 'function', 'ACCOUNTING_COMMISSIONING_SOURCE_UNAVAILABLE',
        'Choose a receivablesInputs source declared on the original accounting workspace.');
      const name = field(value.file.name, 'original workshares filename', 240);
      const bytes = await this.readSource(args.sourceAlias, COMMISSIONING_SOURCE_BYTES);
      need((Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) && bytes.byteLength > 0 &&
        bytes.byteLength <= COMMISSIONING_SOURCE_BYTES, 'COMMISSIONING_SOURCE_LIMIT',
        'Use a complete original workshare source within the native 8 MiB limit.');
      value.file = {name, dataBase64: Buffer.from(bytes).toString('base64')};
    }
    const inspected = await this.controller.inspectSource(value);
    // Return the exact resolved native input. Prepared imports retain these bytes
    // and can replay without consulting a changed host-side alias.
    return {workspace: args.workspace, ...inspected, sourceInput: clone(value)};
  }

  async source(args) {
    const result = await this.controller.source(args.sourceId, input(args, 'sourceId'));
    return {workspace: args.workspace, ...result, files: sourceFiles(args.sourceId, result.files)};
  }

  async detail(args) {
    const result = await this.controller.detail(args.captureId);
    return {workspace: args.workspace, ...result, capture: {...result.capture,
      files: captureFiles(args.captureId, result.capture.files)}};
  }

  async export(args) {
    const result = await this.controller.detail(args.captureId);
    return {workspace: args.workspace, revision: result.revision, value: result.capture,
      files: captureFiles(args.captureId, result.capture.files),
      archive: {kind: 'commissioning-capture', captureId: args.captureId, file: 'handover.tar'},
      scope: 'PRIVATE_COMPLETE_ACCOUNT',
      scopeDescription: 'The complete private archive includes the original receivables ledger and customer identities. The project HTML and CSV reports present the selected cohort.'};
  }

  async file(args) {
    need(typeof args.file === 'string', 'ACCOUNTING_COMMISSIONING_FILE',
      'Choose an original retained source or capture filename.');
    if (args.kind === 'commissioning-source') {
      return this.controller.sourceFile(args.sourceId, args.file);
    }
    need(args.kind === 'commissioning-capture', 'ACCOUNTING_COMMISSIONING_FILE',
      'Choose an original commissioning source or capture file.');
    if (args.file === 'handover.tar') {
      const bundle = await this.controller.export(args.captureId);
      return {name: 'handover.tar', type: 'application/x-tar', bytes: renderCustomerTar(bundle.files)};
    }
    return this.controller.file(args.captureId, args.file);
  }

  async call(operation, args) {
    const suffix = operation.startsWith(PREFIX) ? operation.slice(PREFIX.length) : '';
    let value;
    switch (suffix) {
      case 'source_inspect': return this.inspect(args);
      case 'source_import': value = await this.controller.importSource(input(args)); break;
      case 'source_list': value = await this.controller.sources(input(args)); break;
      case 'source_detail': return this.source(args);
      case 'candidates': value = await this.controller.candidates(input(args)); break;
      case 'preview': value = await this.controller.preview(args.sourceId, input(args, 'sourceId')); break;
      case 'capture': value = await this.controller.capture(args.sourceId, input(args, 'sourceId')); break;
      case 'capture_list': value = await this.controller.captures(input(args)); break;
      case 'capture_detail': return this.detail(args);
      case 'capture_export': return this.export(args);
      case 'request_lookup': value = await this.controller.request(args.requestId); break;
      default: need(false, 'ACCOUNTING_COMMISSIONING_OPERATION', 'Choose an original commissioning collection operation.');
    }
    return {workspace: args.workspace, ...value};
  }
}
