// MIT. Complete original financial-engine course. Worked source, not customer cash.
import {normalizeDraft,normalizeIssuer,invoiceDocument,normalizeCredit,invoiceSummary,json,sha} from './core.mjs';
import {projectCashPlan} from './cash-planning.mjs';
import {projectCashRealization,cashRealizationFiles} from './cash-realization.mjs';
export function runCashRealizationCourse(){
  const id=n=>'4593ca00-0000-4000-8000-'+String(n).padStart(12,'0'),currency={code:'USD',scale:2};
  const customer={id:id(1),version:1,reference:'CASH-REALIZATION-WORKED',name:'Worked merchant customer'};
  function invoice(n,amount,dueDate){
    const row={id:id(n),number:'INV-REALIZATION-'+n,version:1,status:'ISSUED',history:[],draft:normalizeDraft({
      customerId:customer.id,currency,issueDate:'2026-09-25',dueDate,
      lines:[{id:'service',description:'Worked original service',quantity:'1',unitAmount:amount}]})};
    row.document=invoiceDocument(row,customer,normalizeIssuer({name:'Worked merchant'}),row.number,'2026-09-25T12:00:00.000Z','Worked operator');
    return row;
  }
  const a=invoice(2,'300.00','2026-10-02'),b=invoice(3,'100.00','2026-10-20');
  const data={invoices:[a,b],receipts:[],allocations:[],credits:[],refunds:[]};
  const assumptions={title:'October original receipts',owner:'Worked accounts team',note:'Complete source operating course',
    asOf:'2026-10-01',through:'2026-10-31',bucket:'WEEK',usePromises:true,disputes:'SEPARATE',overrides:[]};
  const projection=projectCashPlan(data,assumptions);
  const edition={id:id(5),planId:id(4),number:1,createdAt:'2026-10-01T17:00:00.000Z',actor:'Worked operator',sourceRevision:1,
    workspaceId:'worked-original-account',plan:projection.plan,projection,reviewSha256:sha(json(projection))};
  const frozen=json(edition);
  const earlier={id:id(6),customerId:customer.id,currency,amount:'30.00',reference:'Original earlier funds',receivedDate:'2026-09-30'};
  const receipt={id:id(7),customerId:customer.id,currency,amount:'100.00',reference:'Original incoming cash',receivedDate:'2026-10-03'};
  data.receipts.push(earlier,receipt);
  data.allocations.push({id:id(8),invoiceId:a.id,receiptId:receipt.id,currency,amount:'70.00',allocatedDate:'2026-10-04',releasedDate:'2026-10-08',releaseReason:'Correct original allocation'},
    {id:id(9),invoiceId:a.id,receiptId:receipt.id,currency,amount:'50.00',allocatedDate:'2026-10-08'},
    {id:id(10),invoiceId:a.id,receiptId:earlier.id,currency,amount:'15.00',allocatedDate:'2026-10-04'});
  function credit(n,date,amount){
    const document=normalizeCredit({creditDate:date,reason:'Worked source correction',lines:[{invoiceLineId:'service',netAmount:amount}]},a);
    const row={id:id(n),invoiceId:a.id,number:'CN-REALIZATION-'+n,document:{...document,currency}};
    data.credits.push(row);return row;
  }
  credit(11,'2026-10-05','20.00');b.voidDate='2026-10-06';b.voidReason='Unperformed worked service cancelled';
  const request={planId:edition.planId,editionId:edition.id,through:'2026-10-12',note:'Review all original dated cash and source changes'};
  const first=projectCashRealization(data,edition,request),firstSource=json(first);
  const total=first.currencies[0];
  if(total.incomingAllocatedCash!=='50.00'||total.olderCashAllocationChange!=='15.00'||total.creditChange!=='20.00'||
    total.lifecycleChange!=='-100.00'||total.currentBalance!=='215.00'||total.expectedToDate!=='300.00'||total.cashVariance!=='-250.00')
    throw Error('Original cash, old funds, credits, void or balance bridge differs');
  credit(12,'2026-09-30','10.00');
  const corrected=projectCashRealization(data,edition,request);
  if(corrected.currencies[0].openingCorrection!=='-10.00'||corrected.currencies[0].currentBalance!=='205.00'||
    !corrected.issues.some(x=>x.code==='OPENING_BASIS_CHANGED'))throw Error('Backdated original correction was not isolated');
  receipt.voidDate='2026-10-10';receipt.voidReason='Correct original receipt entry';
  data.allocations.find(x=>x.id===id(9)).releasedDate='2026-10-10';
  const replacement={...receipt,id:id(13),reference:'Corrected original cash',accountingDate:'2026-10-10',voidDate:null,voidReason:null,replacesReceiptId:receipt.id};
  data.receipts.push(replacement);data.allocations.push({id:id(14),invoiceId:a.id,receiptId:replacement.id,currency,amount:'60.00',allocatedDate:'2026-10-11'});
  data.refunds.push({id:id(15),status:'RECORDED',refundDate:'2026-10-12',accountingDate:'2026-10-12',returns:[],
    proposal:{receiptId:replacement.id,receipt:{receivedDate:replacement.receivedDate},currency,amount:'10.00',effectiveDate:'2026-10-12',
      accountingScope:'COMMERCIAL',payout:{kind:'OPERATOR_RECORDED'}}});
  const final=projectCashRealization(data,edition,request);
  const f=final.currencies[0];
  if(f.incomingReceiptValue!=='100.00'||f.incomingAllocatedCash!=='60.00'||f.currentBalance!=='195.00'||f.receiptRefunds!=='10.00'||
    f.incomingUnallocatedValue!=='30.00')throw Error('Original replacement date/refund source counted cash twice or changed funds');
  const earlierView=projectCashRealization(data,edition,{...request,through:'2026-10-07'});
  if(earlierView.currencies[0].incomingReceiptValue!=='100.00'||earlierView.currencies[0].incomingAllocatedCash!=='70.00')
    throw Error('Later receipt correction changed the original dated view');
  const row={schema:'stellar-forge.merchant-cash-realization-record.v1',id:id(16),createdAt:'2026-10-13T17:00:00.000Z',
    actor:'Worked operator',workspaceId:'worked-original-account',sourceRevision:15,request,report:final,reviewSha256:sha(json(final))};
  const reopened=JSON.parse(json(row)),files=cashRealizationFiles(row),reopenedFiles=cashRealizationFiles(reopened);
  for(let i=0;i<files.length;i++)if(sha(files[i].bytes)!==sha(reopenedFiles[i].bytes))throw Error('Complete saved report changed on reopen');
  const replay=projectCashRealization(final.source,final.plan,final.request);
  if(json(replay)!==json(final))throw Error('Complete retained original source does not reproduce its realization');
  if(json(edition)!==frozen||json(first)!==firstSource)throw Error('Following source changed a frozen original plan or review');
  return {schema:'stellar-forge.merchant-cash-realization-source-course.v1',status:'COMPLETE',scope:'Actual original financial modules on explicit worked source',
    edition,first,corrected,earlierView,final,reopened,files:files.map(x=>({name:x.name,bytes:x.bytes.length,sha256:sha(x.bytes)})),
    assertions:['complete dated balance bridge','cash and old-funds allocation remain distinct','credits and invoice void remain distinct',
      'opening backdated correction','same actual receipt correction counted once','refund source distinct from planned invoice cash',
      'historical accounting-date view','all seven exports reopen exactly','complete source replay','original plan and previous review immutable']};
}
