// MIT. Agent chart-change adapter; every compile and save stays in the original native owner.
import { SourceChangeWorkspace } from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/source-changes.mjs';
import { changeHash } from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/accountant/source-change.mjs';

const fail = (code, message) => Object.assign(new Error(message), { code });
const need = (ok, message) => { if (!ok) throw fail('ACCOUNTING_SOURCE_CHANGE_BINDING', message); };
const command = (platform, action, args) => ({
  tool: 'merchant_accounting_' + platform + '_source_change_' + action,
  arguments: args,
});
const nativeBinding = args => ({ workspaceId: args.workspaceId, sourcesSha256: args.sourcesSha256 });
const pageOf = (items, args, view) => {
  const offset = args.offset ?? 0, limit = args.limit ?? 25;
  return { view, total: items.length, offset, limit, items: items.slice(offset, offset + limit) };
};
const application = args => ({
  binding: nativeBinding(args), id: args.id, previewSha256: args.previewSha256,
  revision: args.revision, actor: args.actor, note: args.note,
  unusedConfirmed: args.unusedConfirmed, noExternalImport: args.noExternalImport, mappingConfirmed: args.mappingConfirmed,
});
function comparisonView(value) {
  const { accounts, ...comparison } = value;
  return { ...comparison, accountCount: accounts.length };
}
function planView(plan, kind) {
  return { id: plan.id, name: plan.name, actor: plan.actor, createdAt: plan.createdAt,
    sourceKind: plan.sourceKind, source: plan.source, handoffId: plan.handoffId,
    summary: plan.summary, integrity: plan.integrity,
    ...(kind === 'qbo' ? { realmId: plan.realmId, environment: plan.environment,
      baseCurrency: plan.baseCurrency, companyName: plan.companyName, txnDate: plan.txnDate, docNumber: plan.docNumber }
      : { context: plan.context, valuationBasis: plan.valuationBasis }) };
}
function reviewView(value, args, kind) {
  const comparison = value.comparison, plan = value.plan ?? {}, defaults = value.defaults ?? {};
  const journals = plan.journals ?? [];
  const pages = {
    comparison: comparison.accounts, 'company-changes': comparison.companyChanges,
    accounts: value.accounts ?? [], rows: plan.rows ?? defaults.rows ?? [],
    entries: plan.entries ?? defaults.entries ?? [], excluded: plan.excluded ?? [],
    journals: journals.map(({ payload, ...journal }) => ({ ...journal, lineCount: payload?.JournalLines?.length ?? 0 })),
    lines: kind === 'qbo' ? plan.journalEntry?.Line ?? []
      : journals.flatMap(journal => (journal.payload?.JournalLines ?? []).map((line, lineIndex) =>
        ({ journalIndex: journal.index, lineIndex, line }))),
    baseline: plan.baseline ?? [],
  };
  const view = args.view ?? 'summary';
  return { comparison: comparisonView(comparison), source: value.source,
    ...(value.plan ? { successor: planView(plan, kind) } : {}),
    ...(value.defaults ? { defaults: Object.fromEntries(Object.entries(defaults).filter(([key]) => !['rows', 'entries'].includes(key))) } : {}),
    counts: Object.fromEntries(Object.entries(pages).map(([key, items]) => [key, items.length])),
    ...(view !== 'summary' ? { page: pageOf(pages[view], args, view) } : {}) };
}
function operationBinding(record) {
  return { ...record.binding, changeId: record.id, planId: record.planId,
    successorId: record.successorId, previewSha256: record.previewSha256,
    applicationId: record.intent.id, requestSha256: record.intent.requestSha256 };
}
export class MerchantSourceChanges {
  constructor(workspace, { qbo, xero, readInput }) {
    this.workspace = workspace; this.readInput = readInput;
    this.native = new SourceChangeWorkspace(workspace, { qbo, xero });
  }
  close() { return this.native.close(); }
  row(platform, changeId) {
    const record = this.native.row(changeId);
    need(record.kind === platform, 'Keep the original source-change platform and review UUID.');
    return record;
  }
  detail(value, args, platform) {
    const record = { ...value.record, inputSha256: this.row(platform, value.record.id).inputSha256 };
    const result = { schema: value.schema, nativeBinding: value.binding, revision: value.revision,
      reopenRequired: Boolean(value.reopenRequired || this.workspace.commitUncertainty),
      record, current: value.current, ...reviewView(value.review, args, platform),
      handoff: { selection: { kind: platform + '-source-change', changeId: record.id },
        fileName: 'source-change-' + record.id + '.json' } };
    if (record.intent) result.resume = {
      binding: operationBinding(record),
      command: command(platform, 'resume', { workspace: args.workspace, ...record.binding,
        changeId: record.id, id: record.intent.id, requestSha256: record.intent.requestSha256,
        previewSha256: record.previewSha256 }),
    };
    return result;
  }
  async input(platform, args) {
    const input = await this.readInput(args);
    need(input.value.kind === platform, 'Keep the platform from the original declared source-change input.');
    return input;
  }
  async file(args) {
    const platform = args.kind === 'qbo-source-change' ? 'qbo' : args.kind === 'xero-source-change' ? 'xero' : null;
    need(platform && args.changeId, 'Choose a retained source-change handoff and its original platform.');
    this.row(platform, args.changeId);
    need(args.file === undefined || args.file === 'source-change-' + args.changeId + '.json',
      'Use the complete original source-change handoff filename.');
    return this.native.download(args.changeId);
  }
  async call(operation, args) {
    const match = operation.match(/^merchant_accounting_(qbo|xero)_source_change_(status|inspect|preview|prepare|detail|apply_preview|apply|resume)$/);
    need(match, 'Choose a declared original source-change operation.');
    const [, platform, action] = match;
    if (action === 'status') {
      const value = await this.native.catalog(), view = args.view ?? 'summary';
      const pages = { plans: value.plans.filter(row => row.kind === platform),
        contexts: platform === 'xero' ? value.contexts : [], changes: value.changes.filter(row => row.kind === platform) };
      return { schema: value.schema, nativeBinding: value.binding, revision: value.revision, platform,
        reopenRequired: Boolean(value.reopenRequired || this.workspace.commitUncertainty),
        connectionsAvailable: value.connectionsAvailable,
        counts: Object.fromEntries(Object.entries(pages).map(([key, items]) => [key, items.length])),
        ...(view !== 'summary' ? { page: pageOf(pages[view], args, view) } : {}) };
    }
    if (['inspect', 'preview', 'prepare'].includes(action)) {
      const input = await this.input(platform, args);
      if (action === 'inspect') {
        const value = await this.native.inspect(input.value);
        return { schema: value.schema, nativeBinding: value.binding, revision: value.revision,
          kind: value.kind, planId: value.planId, predecessor: value.predecessor, target: value.target,
          ...input.pin, ...reviewView(value, args, platform) };
      }
      if (action === 'preview') {
        const value = await this.native.preview(input.value);
        const binding = { ...value.binding, changeId: value.id, planId: value.planId,
          successorId: value.successorId, inputSha256: value.inputSha256, previewSha256: value.previewSha256 };
        return { schema: value.schema, nativeBinding: value.binding, revision: value.revision,
          predecessorSha256: value.predecessorSha256, comparisonSha256: value.comparisonSha256,
          ...input.pin, ...reviewView(value, args, platform), binding,
          command: command(platform, 'prepare', { workspace: args.workspace, ...input.pin, ...binding }) };
      }
      need(input.value.id === args.changeId && input.value.planId === args.planId &&
        input.value.successor?.id === args.successorId && changeHash(input.value) === args.inputSha256,
      'Keep the exact original source-change request, successor and input digest.');
      this.native.assertBinding(nativeBinding(args)); this.native.assertBinding(input.value.binding);
      const value = await this.native.prepare(input.value, { previewSha256: args.previewSha256 });
      return this.detail(value, args, platform);
    }
    this.row(platform, args.changeId);
    if (action === 'detail') return this.detail(await this.native.detail(args.changeId), args, platform);
    this.native.assertBinding(nativeBinding(args));
    if (action === 'apply_preview' || action === 'apply') {
      const value = application(args), requestSha256 = changeHash(value);
      if (action === 'apply') {
        need(args.requestSha256 === requestSha256, 'Keep the exact reviewed native application request digest.');
        return this.detail(await this.native.apply(args.changeId, value), args, platform);
      }
      const detail = await this.native.detail(args.changeId), record = detail.record;
      need(record.previewSha256 === args.previewSha256, 'Review the exact retained native successor preview.');
      if (record.intent) need(record.intent.id === args.id && record.intent.requestSha256 === requestSha256,
        'Continue the existing retained application UUID and exact request.');
      else need(detail.revision === args.revision && detail.current.predecessorEligible,
        'Review the current original revision and unused predecessor before approving its successor.');
      const binding = { ...record.binding, changeId: record.id, planId: record.planId,
        successorId: record.successorId, previewSha256: record.previewSha256, applicationId: args.id, requestSha256 };
      return { ...this.detail(detail, args, platform), binding,
        command: command(platform, 'apply', { ...args, requestSha256 }) };
    }
    const record = this.row(platform, args.changeId);
    need(record.intent?.id === args.id && record.intent.requestSha256 === args.requestSha256 &&
      record.previewSha256 === args.previewSha256, 'Resume the same retained original application and successor preview.');
    return this.detail(await this.native.resume(args.changeId, { binding: nativeBinding(args), id: args.id }), args, platform);
  }
}
