// MIT. Donor report helpers on the original retained programme writer.
import {randomUUID} from 'node:crypto';
import {newProgrammeRecord, reviseProgrammeRecord, programmeBatch, saveGrantProgramme} from './programme-client.mjs';
export const DONOR_SELECTION_SCHEMA='stellar-forge.grant-donor-selection.v1';
export const DONOR_STATEMENT_SCHEMA='stellar-forge.grant-donor-statement.v1';
const need=(value,message)=>{if(!value)throw Object.assign(new Error(message),{code:'DONOR_REPORT_INPUT'});};
export function donorSelection({agreementId=null,supersedesReportId=null,correctionReason='',lines=[],
  indicatorIds=[],resultMode='period-contained',controlTotals=[],exclusions=[],reviewNote=''}={}) {
  need(Array.isArray(lines)&&Array.isArray(indicatorIds)&&Array.isArray(controlTotals)&&Array.isArray(exclusions),
    'Keep complete report lines, result selections, control totals and explained exclusions.');
  return {schema:DONOR_SELECTION_SCHEMA,agreementId,supersedesReportId,correctionReason,
    lines,indicatorIds,resultMode,controlTotals,exclusions,reviewNote};
}
export function donorFinancialLine({id=randomUUID(),title,sourceIds,kind,currency,dimensions={},
  dateMode='point',datePointer='/dimensions/valueDate',endPointer=null,basis}) {
  return {id,title,sourceIds,kind,currency,dimensions,dateMode,datePointer,endPointer,basis};
}
export async function saveDonorReport(client,operationId,selection,{actor,fields,record=null,id},options={}) {
  const portfolio=await client.portfolio(selection.portfolioId,{revision:selection.revision,signal:options.signal});
  need(portfolio.definition.programme,'Select an original programme.');
  if(record) {
    const original=portfolio.definition.programme.records.reports.find(row=>row.id===record.id);
    need(original&&original.revision===record.revision&&original.sha256===record.sha256,
      'Select the exact current report edition.');
  }
  const change=record?reviseProgrammeRecord('reports',record,fields):newProgrammeRecord('reports',fields,id);
  const batch=programmeBatch(actor,portfolio.definition.programme.revision,[change]);
  return saveGrantProgramme(client,operationId,selection,batch,options);
}
export function correctionReport(original,{title,owner,dueDate,reason,id=randomUUID()}={}) {
  need(original?.publication&&original.donorSelection,'Select a submitted donor statement for its correction.');
  need(typeof reason==='string'&&reason.trim(),'Explain the correction to the original report.');
  const fields={};
  for(const key of ['nodeId','grantId','periodStart','periodEnd','recipient','documentIds','narrative','notes','sourceRefs'])
    if(Object.hasOwn(original,key))fields[key]=structuredClone(original[key]);
  return {id,fields:{...fields,title:title??original.title+' — correction',owner:owner??original.owner,
    dueDate:dueDate??original.dueDate,status:'draft',submittedDate:null,
    donorSelection:{...structuredClone(original.donorSelection),supersedesReportId:original.id,correctionReason:reason}}};
}
export async function readDonorReport(client,selection,options) {
  const value=await client.programmeDonorReport(selection,options);
  need(value?.statement?.schema===DONOR_STATEMENT_SCHEMA&&value.portfolioId===selection.portfolioId&&
    value.revision===selection.revision&&value.report?.id===selection.id,'The selected complete donor statement changed.');
  return value;
}
