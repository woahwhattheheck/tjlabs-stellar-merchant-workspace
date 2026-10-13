// MIT. One complete financial-source course through the maintained original engines.
import {normalizeDraft,normalizeIssuer,invoiceDocument,normalizeCredit,invoiceSummary,json,sha,today} from '../core.mjs';
import {normalizePlanDraft,compilePlanReview,scheduleDocument,planProjection,PLAN_SCHEMA} from './core.mjs';
import {collectionAvailability,compilePlanCollection,planCollectionStatus} from './collection.mjs';
import {compilePaymentProposal,paymentDocument,paymentRequestSummary} from '../payment-requests.mjs';

export function runInstallmentCollectionCourse({asOf=today()}={}) {
  const ids=Array.from({length:12},(_,i)=>'45930000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
  const earlier=new Date(Date.parse(asOf+'T00:00:00Z')-86400000).toISOString().slice(0,10),now=asOf+'T12:00:00.000Z';
  const currency={code:'USD',scale:2}, customer={id:ids[0],version:1,reference:'INSTALLMENT-COURSE',name:'Worked collection customer'};
  const invoice={id:ids[1],number:'INV-COLLECTION-001',version:1,status:'ISSUED',history:[],draft:normalizeDraft({
    customerId:customer.id,currency,issueDate:earlier,dueDate:earlier,
    lines:[{id:'service',description:'Original worked service invoice',quantity:'1',unitAmount:'300.00'}]})};
  invoice.document=invoiceDocument(invoice,customer,normalizeIssuer({name:'Worked merchant'}),invoice.number,earlier+'T12:00:00.000Z','Receiving operator');
  invoice.files={'invoice.json':{bytes:Buffer.byteLength(json(invoice.document)),sha256:sha(json(invoice.document))}};
  const data={invoices:[invoice],allocations:[],receipts:[],credits:[],paymentRequests:[],paymentPlans:{schema:PLAN_SCHEMA,plans:[]}};
  const plan={id:ids[2],invoiceId:invoice.id,status:'ACTIVE',version:1,createdAt:earlier+'T12:00:00.000Z',
    updatedAt:now,history:[],editions:[]};
  plan.draft=normalizePlanDraft({invoiceId:invoice.id,balanceDate:earlier,title:'Three original installments',reference:'AGREED-001',
    installments:[{id:'first',dueDate:earlier,amount:'100.00',label:'First installment'},
      {id:'second',dueDate:asOf,amount:'100.00',label:'Second installment'},
      {id:'third',dueDate:asOf,amount:'100.00',label:'Third installment'}]},invoice,data);
  function edition(id) {
    const document=scheduleDocument(compilePlanReview(plan,invoice,data),{editionId:id,editionNumber:plan.editions.length+1,
      actor:'Receiving operator',createdAt:now});
    const row={id,document,draftSha256:sha(json(plan.draft)),files:{'schedule.json':{bytes:Buffer.byteLength(json(document)),sha256:sha(json(document))}}};
    plan.editions.push(row);return row;
  }
  const original=edition(ids[3]);data.paymentPlans.plans.push(plan);
  const input={planId:plan.id,editionId:original.id,installments:[{id:'first',amount:'100.00'},{id:'second',amount:'50.00'}]};
  const network='stellar:testnet',initial=collectionAvailability(invoice,data,{...input,network,now});
  const source=compilePlanCollection(invoice,data,input,{network,now});
  const proposal=compilePaymentProposal(invoice,data,{id:ids[4],paymentPlan:input,network,
    destination:'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    asset:{kind:'native'},stellarAmount:'5.0000000',valuationNote:'Worked-source course: explicit USD150 commercial value for the selected 5 XLM instructions.'},{now});
  const row={id:proposal.id,invoiceId:invoice.id,customerId:customer.id,issuedAt:now,actor:'Receiving operator',proposal,
    reviewSha256:sha(json(proposal)),returns:[],cancelledAt:null,history:[]};
  row.documentSha256=sha(json(paymentDocument(row)));data.paymentRequests.push(row);
  const reserved=collectionAvailability(invoice,data,{...input,network,now});
  const laterPaid=structuredClone(data);
  laterPaid.allocations.push({id:ids[11],invoiceId:invoice.id,receiptId:ids[7],currency,amount:'100.00',allocatedDate:asOf});
  const staleInstruction=paymentRequestSummary(laterPaid.paymentRequests[0],laterPaid,asOf,now);
  if(staleInstruction.payable||staleInstruction.paymentPlan.current||!staleInstruction.paymentPlan.instructionsNeedReview)
    throw Error('A later payment left a satisfied installment wallet action current');
  if(staleInstruction.currentAmountDue!=='200.00'||staleInstruction.status!=='OPEN')
    throw Error('Original invoice balance or instruction history was rewritten');
  const errors=[];
  const rejects=(label,work,code)=>{try{work();throw Error(label+' unexpectedly accepted');}catch(error){
    if(error.code!==code)throw error;errors.push({label,code:error.code});}};
  rejects('overlapping selected amount',()=>compilePlanCollection(invoice,data,input,{network,now}),'PAYMENT_PLAN_COLLECTION_ORDER_CHANGED');
  rejects('skipped outstanding installment',()=>compilePlanCollection(invoice,data,{...input,installments:[{id:'third',amount:'10.00'}]},{network,now}),'PAYMENT_PLAN_COLLECTION_ORDER_CHANGED');
  const following=compilePlanCollection(invoice,data,{...input,installments:[{id:'second',amount:'50.00'},{id:'third',amount:'20.00'}]},{network,now});
  const second=compilePaymentProposal(invoice,data,{...proposal,id:ids[5],paymentPlan:{...input,installments:[{id:'second',amount:'50.00'}]},
    invoiceAmount:'50.00',stellarAmount:'2',memo:undefined},{now});
  data.paymentRequests.push({...row,id:second.id,proposal:second,reviewSha256:sha(json(second)),returns:[],history:[]});
  const sourceBefore=json(proposal.paymentPlan);
  // These are original ledger inputs for the source projection, not a network verification receipt.
  data.allocations.push({id:ids[6],invoiceId:invoice.id,receiptId:ids[7],currency,amount:'60.00',allocatedDate:asOf});
  row.returns.push({id:ids[8],receiptId:ids[7]});
  data.credits.push({id:ids[9],invoiceId:invoice.id,number:'CN-COLLECTION-001',
    document:{...normalizeCredit({creditDate:asOf,reason:'Worked partial service reduction',lines:[{invoiceLineId:'service',netAmount:'30.00'}]},invoice),
      currency},files:{}});
  const changed=planProjection(plan,data,asOf),availabilityAfterLedger=collectionAvailability(invoice,data,{...input,network,now});
  if(changed.installments[0].remaining!=='40.00'||changed.installments[2].remaining!=='70.00')throw Error('Original payment/credit projection changed');
  if(sourceBefore!==json(proposal.paymentPlan))throw Error('Original collection provenance changed');
  plan.draft=normalizePlanDraft({...plan.draft,balanceDate:asOf,installments:[{id:'revised',dueDate:asOf,amount:'210.00',label:'Revised balance'}]},invoice,data);
  plan.version++;const successor=edition(ids[10]);
  rejects('superseded edition',()=>compilePlanCollection(invoice,data,input,{network,now}),'PAYMENT_PLAN_COLLECTION_EDITION_CHANGED');
  const historical=planCollectionStatus(proposal,invoice,data,asOf);
  if(historical.current||historical.currentEditionId!==successor.id)throw Error('Historical selection was treated as current');
  const archive=json({data,initial,source,proposal,reserved,following,changed,availabilityAfterLedger,historical,staleInstruction,errors});
  const reopened=JSON.parse(archive);
  if(json(reopened.data)!==json(data)||sha(json(reopened.proposal))!==row.reviewSha256)throw Error('Whole-source reopening changed retained bytes');
  return {schema:'stellar-forge.installment-collection-source-course.v1',asOf,status:'COMPLETE',scope:'Original financial source engines; no provider transaction is represented',
    invoice:invoiceSummary(invoice,data,asOf),originalEdition:original.id,successorEdition:successor.id,
    archiveSha256:sha(archive),...reopened};
}
