// MIT. Immutable realization reviews in the original accounting lease and request journal.
import {randomUUID} from 'node:crypto';
import {need,field,identifier,json,sha} from './core.mjs';
import {normalizeCashRealization,cashRealizationRows,projectCashRealization,cashRealizationSummary,cashRealizationFiles} from './cash-realization.mjs';
export class CashRealizationWorkspace {
  constructor(receivables){this.receivables=receivables;this.workspace=receivables.workspace;this.plans=receivables.cashPlanningWorkspace;}
  workspaceId(){return this.plans.workspaceId();}
  guard(value){need(value?.workspaceId===this.workspaceId(),'CASH_REALIZATION_WORKSPACE_CHANGED','Open the original accounting workspace for this review.',409);}
  row(id){identifier(id,'cash realization');const row=cashRealizationRows(this.receivables.data()).find(item=>item.id===id);
    need(row,'CASH_REALIZATION_NOT_FOUND','Choose a retained realization review.',404);return row;}
  calculate(value){
    const request=normalizeCashRealization(value),edition=this.plans.edition(this.plans.row(request.planId),request.editionId),
      report=projectCashRealization(this.receivables.data(),edition,request);
    const basis={workspaceId:this.workspaceId(),revision:this.workspace.state.revision,request,report};
    need(Buffer.byteLength(json(basis),'utf8')<=32*1024*1024,'CASH_REALIZATION_TOO_LARGE',
      'This complete review exceeds the supported 32 MiB account review size.',413);
    return {...basis,reviewSha256:sha(json(basis))};
  }
  result(record){
    const row=this.row(record.cashRealizationId);return {workspaceId:this.workspaceId(),
      cashRealization:cashRealizationSummary(row),realization:structuredClone(row)};
  }
  async list(query={}){
    return this.workspace.serial(async()=>{
      if(query.planId)identifier(query.planId,'cash plan');
      const rows=cashRealizationRows(this.receivables.data()).filter(row=>!query.planId||row.request.planId===query.planId)
        .map(cashRealizationSummary).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
      return {workspaceId:this.workspaceId(),revision:this.workspace.state.revision,realizations:rows};
    });
  }
  async preview(value){return this.workspace.serial(async()=>{this.guard(value);return this.calculate(value);});}
  async save(value){
    this.guard(value);
    return this.receivables._mutate('cash_realization_saved',value,async(data,actor)=>{
      const preview=this.calculate(value);
      need(value.reviewSha256===preview.reviewSha256,'CASH_REALIZATION_REVIEW_CHANGED',
        'The account or selected review changed. Recalculate the complete realization before saving.',409);
      const row={schema:'stellar-forge.merchant-cash-realization-record.v1',id:randomUUID(),createdAt:new Date().toISOString(),actor,
        workspaceId:preview.workspaceId,sourceRevision:preview.revision,request:preview.request,report:preview.report,reviewSha256:preview.reviewSha256};
      (data.cashRealizations??=[]).push(row);
      return {cashRealizationId:row.id};
    });
  }
  async detail(id){return this.workspace.serial(async()=>({workspaceId:this.workspaceId(),revision:this.workspace.state.revision,
    realization:structuredClone(this.row(id))}));}
  async file(id,name){return this.workspace.serial(async()=>{
    const file=cashRealizationFiles(this.row(id)).find(row=>row.name===name);
    need(file,'CASH_REALIZATION_FILE_NOT_FOUND','Choose the full realization, report, invoice/date/event/receipt CSV or manifest.',404);return file;
  });}
  async operation(requestId){return this.workspace.serial(async()=>{
    const id=field(requestId,'request ID',160),saved=this.receivables.data().requests.find(row=>row.id===id&&row.action==='cash_realization_saved');
    return {workspaceId:this.workspaceId(),revision:this.workspace.state.revision,operation:saved?structuredClone(saved):null,
      ...(saved?this.result(saved.result):{})};
  });}
}
