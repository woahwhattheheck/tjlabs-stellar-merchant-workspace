// MIT. Report tools compose into the original MerchantUSASpendingWorkspaces owner.
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {failure} from './host-files.mjs';
export function isUSASpendingReportTool(name){return name.startsWith('merchant_usaspending_report_');}
export async function executeUSASpendingReportTool(entry,name,input,{http,paged,definition}) {
  const original=entry.model.fundingReports;
  if(!original)throw failure('USASPENDING_FUNDING_REPORTS_UNAVAILABLE','Open the complete funding-report workspace.');
  switch(name){
    case 'merchant_usaspending_report_inventory':
      if(!['reports','merchants'].includes(input.kind))throw failure('INVALID_PARAMS','Choose reports or merchants.');
      return {kind:input.kind,...paged(original.state()[input.kind],input)};
    case 'merchant_usaspending_report_draft':return original.draft(input.reportId);
    case 'merchant_usaspending_report_prepare':return original.prepare(input);
    case 'merchant_usaspending_report_publish':return original.publish(input);
    case 'merchant_usaspending_report_merchant_prepare':
      if(!definition.merchant.payment||!definition.merchant.origin)throw failure('USASPENDING_PAYMENT_NOT_CONFIGURED','Select the original merchant payment terms and public origin in the host connection.');
      return http('/api/funding-reports/merchant',{reportId:input.reportId,path:input.path,payment:definition.merchant.payment,origin:definition.merchant.origin});
    case 'merchant_usaspending_report_buyer_adopt':{
      const selected=definition.fundingReports?.inboxes?.[input.inbox];
      if(!selected)throw failure('USASPENDING_BUYER_INBOX_NOT_CONFIGURED','Choose one host-declared original buyer inbox.');
      const {adoptFundingBuyer}=await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/reports/receiving.mjs');
      return adoptFundingBuyer(entry.model,{inbox:selected.directory,receivingRoot:selected.receivingRoot,intentId:input.intentId});
    }
    case 'merchant_usaspending_report_extract':{
      if(typeof input.name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.name))throw failure('INVALID_PARAMS','Choose a report receiving subdirectory name.');
      const root=join(entry.model.directory,'funding-receiving');await mkdir(root,{recursive:true,mode:0o700});
      const {extractFundingReport}=await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/reports/receiving.mjs');
      return extractFundingReport(entry.model,{reportId:input.reportId,directory:join(root,input.name),deliveryId:input.deliveryId},{receivingRoot:root});
    }
    default:throw failure('TOOL_NOT_FOUND','Unknown original funding-report operation.');
  }
}
export async function importUSASpendingReportSource(entry,selected,input) {
  if(['name','maxRows','editionId','awardKey','includeReview'].some(k=>input[k]!==undefined))throw failure('INVALID_PARAMS','Receive the complete original funding report with its retained source and identity.');
  const {receiveFundingFile}=await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/reports/receiving.mjs');
  return receiveFundingFile(entry.model,selected.file,{expectedSha256:selected.sha256});
}
export async function exportUSASpendingReport(entry,input) {
  if(input.kind==='funding-merchant-catalog'){
    const {fundingMerchantCatalog}=await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/reports/merchant.mjs');
    return (await fundingMerchantCatalog(entry.model,input.merchantId)).catalog;
  }
  return entry.model.fundingReports.export(input.reportId,{kind:input.kind.slice('funding-report-'.length),deliveryId:input.deliveryId});
}
