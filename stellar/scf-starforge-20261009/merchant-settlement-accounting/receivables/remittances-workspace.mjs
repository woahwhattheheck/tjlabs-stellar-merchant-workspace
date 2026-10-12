// MIT. Remittance batches use the original accounting lease, revision and durable writer.
import {accountingWorkspaceBinding} from '../workspace/binding.mjs';
import {need, field, identifier, json, sha, plain} from './core.mjs';
import {REMITTANCE_SCHEMA, remittanceBatches, remittanceSummary, planRemittanceBatch,
  remittanceReviewCsv} from './remittances.mjs';

export class RemittancesWorkspace {
  constructor(receivables) { this.receivables = receivables; this.workspace = receivables.workspace; }
  workspaceId() { return accountingWorkspaceBinding(this.workspace.directory,this.workspace.state).workspaceId; }
  guard(value) {
    need(value?.workspaceId === this.workspaceId(),'REMITTANCE_WORKSPACE_CHANGED',
      'Open the original accounting workspace for this remittance.',409);
  }
  row(id) {
    identifier(id,'remittance batch');
    const row = remittanceBatches(this.receivables.data()).find(value => value.id === id);
    need(row,'REMITTANCE_NOT_FOUND','Choose a retained remittance batch.',404); return row;
  }
  calculate(source, {actor = '', at = ''} = {}) {
    return planRemittanceBatch(this.receivables.data(),this.workspace.state.customerStatements.customers,
      source,{workspaceId:this.workspaceId(),revision:this.workspace.state.revision,actor,at});
  }
  result(record) {
    const row = this.row(record.remittanceBatchId);
    return {workspaceId:this.workspaceId(),remittanceBatch:remittanceSummary(row),remittanceReview:structuredClone(row.review)};
  }
  async list() {
    return this.workspace.serial(async () => ({workspaceId:this.workspaceId(),revision:this.workspace.state.revision,
      batches:remittanceBatches(this.receivables.data()).map(remittanceSummary).reverse()}));
  }
  async detail(id) {
    return this.workspace.serial(async () => {
      const row = this.row(id);
      return {workspaceId:this.workspaceId(),revision:this.workspace.state.revision,
        batch:remittanceSummary(row),review:structuredClone(row.review),
        receiptIds:structuredClone(row.receiptIds),invoiceIds:structuredClone(row.invoiceIds),
        allocationIds:structuredClone(row.allocationIds),newReceiptIds:structuredClone(row.newReceiptIds),
        files:['source.csv','review.json','review.csv','batch.json','manifest.json']};
    });
  }
  async preview(value) {
    return this.workspace.serial(async () => {
      this.guard(value);const plan = this.calculate(value.source);
      return {workspaceId:this.workspaceId(),revision:this.workspace.state.revision,
        source:{sourceId:plan.review.sourceId,filename:plan.review.filename,csv:value.source.csv},
        review:plan.review,reviewSha256:plan.reviewSha256};
    });
  }
  async apply(value) {
    this.guard(value);
    need(plain(value.source),'INVALID_REMITTANCE_SOURCE','Keep the original CSV source with its review.');
    return this.receivables._mutate('remittance_applied',value,async (data,actor) => {
      this.guard(value);
      const appliedAt = new Date().toISOString(),plan = this.calculate(value.source,{actor,at:appliedAt});
      need(plan.reviewSha256 === value.reviewSha256,'REMITTANCE_REVIEW_CHANGED',
        'The source or original account state changed. Review this CSV against the current workspace.',409);
      need(plan.review.canApply,'REMITTANCE_HAS_CONFLICTS','Resolve every remittance conflict before saving the batch.',409);
      const prior = remittanceBatches(data).find(row => row.sourceId === plan.review.sourceId &&
        row.sourceSha256 === plan.review.sourceSha256);
      if (prior) return {remittanceBatchId:prior.id};
      // The original _mutate writer commits these ledgers and this batch in one save.
      // Any callback failure restores its complete original state.
      data.receipts = plan.next.receipts;data.invoices = plan.next.invoices;data.allocations = plan.next.allocations;
      const hex = sha(json({kind:REMITTANCE_SCHEMA,workspaceId:this.workspaceId(),
        sourceId:plan.review.sourceId,sourceSha256:plan.review.sourceSha256}));
      const id = hex.slice(0,8)+'-'+hex.slice(8,12)+'-8'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
      need(!remittanceBatches(data).some(row => row.id === id),'REMITTANCE_ID_EXISTS','Recover the retained original remittance batch.',409);
      const row = {schema:REMITTANCE_SCHEMA,id,workspaceId:this.workspaceId(),appliedAt,actor,
        sourceRevision:value.revision,sourceId:plan.review.sourceId,filename:plan.review.filename,
        sourceSha256:plan.review.sourceSha256,sourceCsv:value.source.csv,reviewSha256:plan.reviewSha256,
        review:plan.review,newReceiptIds:plan.newReceiptIds,receiptIds:plan.receiptIds,
        invoiceIds:plan.invoiceIds,allocationIds:plan.allocationIds};
      (data.remittanceBatches ??= []).push(row);
      return {remittanceBatchId:id};
    });
  }
  async operation(requestId) {
    return this.workspace.serial(async () => {
      const id = field(requestId,'request identifier',160);
      const record = this.receivables.data().requests.find(row => row.id === id && row.action === 'remittance_applied');
      need(record,'REMITTANCE_OPERATION_NOT_FOUND','No saved remittance operation has this request identifier.',404);
      return {...this.result(record.result),revision:this.workspace.state.revision,operation:structuredClone(record)};
    });
  }
  async file(id,name) {
    return this.workspace.serial(async () => {
      const row = this.row(id),source = Buffer.from(row.sourceCsv,'utf8');
      need(sha(source) === row.sourceSha256 && sha(json(row.review)) === row.reviewSha256,
        'REMITTANCE_SOURCE_CHANGED','The retained source or review differs from its recorded digest.',409);
      const files = {
        'source.csv':{bytes:source,type:'text/csv; charset=utf-8'},
        'review.json':{bytes:Buffer.from(json(row.review)),type:'application/json; charset=utf-8'},
        'review.csv':{bytes:Buffer.from(remittanceReviewCsv(row.review)),type:'text/csv; charset=utf-8'},
        'batch.json':{bytes:Buffer.from(json(row)),type:'application/json; charset=utf-8'},
      };
      files['manifest.json'] = {bytes:Buffer.from(json({schema:'stellar-forge.merchant-remittance-files.v1',
        batchId:id,files:Object.fromEntries(Object.entries(files).map(([fileName,file]) =>
          [fileName,{bytes:file.bytes.length,sha256:sha(file.bytes)}]))})),type:'application/json; charset=utf-8'};
      need(Object.hasOwn(files,name),'REMITTANCE_FILE_NOT_FOUND','Choose a retained remittance file.',404);
      return {...files[name],name:id+'-'+name};
    });
  }
}
