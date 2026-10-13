// MIT. Complete following-review course through unchanged original financial engines.
import {json,sha} from './core.mjs';
import {runCashRealizationCourse} from './cash-realization-exercise.mjs';
import {projectCashRealization} from './cash-realization.mjs';
import {compareCashRealizations,receiveCashRealizationComparison,cashRealizationComparisonFiles} from './cash-realization-comparison.mjs';
export function runCashRealizationComparisonCourse(){
 const original=runCashRealizationCourse(),id=n=>'4593cc00-0000-4000-8000-'+String(n).padStart(12,'0');
 function record(report,n,revision,createdAt){
  const basis={workspaceId:report.plan.workspaceId,revision,request:report.request,report};
  return {schema:'stellar-forge.merchant-cash-realization-record.v1',id:id(n),createdAt,actor:'Worked account reviewer',
   workspaceId:basis.workspaceId,sourceRevision:revision,request:report.request,report,reviewSha256:sha(json(basis))};
 }
 const earlierReport=projectCashRealization(original.first.source,original.edition,{...original.first.request,through:'2026-10-07'});
 const left=record(earlierReport,1,10,'2026-10-07T17:00:00.000Z'),right=record(original.final,2,15,'2026-10-13T17:00:00.000Z');
 const originals=json({left,right}),comparison=compareCashRealizations(left,right),m=comparison.currencies[0].metrics;
 if(m.currentBalance.sourceChange!=='-10.00'||m.currentBalance.periodChange!=='10.00'||m.currentBalance.totalChange!=='0.00')
  throw Error('Backdated source correction and later period movement did not reconcile separately');
 if(m.incomingAllocatedCash.sourceChange!=='0.00'||m.incomingAllocatedCash.periodChange!=='-10.00'||
  m.receiptRefunds.periodChange!=='10.00'||m.incomingReceiptValue.totalChange!=='0.00')
  throw Error('Later allocation/receipt replacement/refund differs from original native amounts');
 const sameDate=compareCashRealizations(record(original.first,3,11,'2026-10-12T17:00:00.000Z'),right);
 if(sameDate.currencies[0].metrics.currentBalance.sourceChange!=='-20.00'||
  sameDate.currencies[0].metrics.currentBalance.periodChange!=='0.00')throw Error('Same-date original source correction was treated as later activity');
 const before=json(comparison),reopened=receiveCashRealizationComparison(JSON.parse(before)),files=cashRealizationComparisonFiles(comparison);
 const reopenedFiles=cashRealizationComparisonFiles(reopened);
 for(let i=0;i<files.length;i++)if(sha(files[i].bytes)!==sha(reopenedFiles[i].bytes))throw Error('Complete comparison export changed on independent reopen');
 for(const group of comparison.sourceChanges)for(const change of group.changes)for(const side of ['left','right']){
  const pointer=change[side+'Pointer'];if(!pointer)continue;
  const row=pointer.slice(1).split('/').reduce((value,key)=>value[key],comparison);
  if(sha(json(row))!==change[side+'Sha256'])throw Error('Original source change pointer does not retain the exact record');
 }
 const edited=JSON.parse(before);edited.currencies[0].metrics.currentBalance.totalChange='1.00';
 let changed=false;try{receiveCashRealizationComparison(edited);}catch(error){changed=error.code==='CASH_COMPARISON_SOURCE_CHANGED';}
 if(!changed||json({left,right})!==originals)throw Error('Receiving must reject changed comparison and preserve both originals');
 return {schema:'stellar-forge.merchant-cash-realization-comparison-course.v1',status:'COMPLETE',
  scope:'Actual complete original financial modules and source records from the maintained worked account',
  left,right,comparison,sameDate,reopened,files:files.map(x=>({name:x.name,bytes:x.bytes.length,sha256:sha(x.bytes)})),
  assertions:['source correction and period movement separated','each original and delta balance bridge exact',
   'receipt correction retains one incoming cash value','refund movement remains distinct','same-date source change has zero period movement',
   'every source change points to its complete original','all eight export files cold-reopen exactly','changed comparison rejected','both original reviews unchanged']};
}
