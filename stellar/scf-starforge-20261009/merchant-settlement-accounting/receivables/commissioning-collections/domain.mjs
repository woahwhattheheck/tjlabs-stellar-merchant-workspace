// MIT. Commissioning collections project the original customer ledger and source scopes.
import {json,sha,need,plain,dateValue,currencyKey,minor,money,allocationActive,
  invoiceSummary,receiptSummary,refundAccountSummary} from '../core.mjs';
import {collectionsReport} from '../collections.mjs';
import {COMMISSIONING_SOURCE_SCHEMA,COMMISSIONING_REVIEW_SCHEMA,
  readCommissioningWorkshares,normalizeCommissioningSelection} from './source.mjs';
import {renderCommissioningFiles} from './reports.mjs';
export {readCommissioningWorkshares,normalizeCommissioningSelection} from './source.mjs';

const clone = value => structuredClone(value);
const array = value => Array.isArray(value) ? value : [];
const maximum = (a,b) => a>b?a:b;
const sameCurrency = (a,b) => currencyKey(a) === currencyKey(b);
const rowIndex = (rows,name) => {
  need(Array.isArray(rows),'COMMISSIONING_NATIVE_SNAPSHOT','Keep the complete original '+name+' register.',409);
  const indexed=new Map();
  for(const row of rows) {
    need(plain(row)&&typeof row.id==='string'&&!indexed.has(row.id),
      'COMMISSIONING_NATIVE_IDENTITY','The original '+name+' register repeats or omits an identity.',409);
    indexed.set(row.id,row);
  }
  return indexed;
};
function futureDate(date,days) {
  if(!date||days===null)return null;
  return dateValue(new Date(Date.parse(date+'T00:00:00.000Z')+days*86400000).toISOString().slice(0,10),'planned collection date');
}
function findingsStore() {
  const rows=[],keys=new Set();
  return {rows,add(code,message,context={},severity='ERROR'){
    const row={code,severity,message,...context},key=sha(json(row));
    if(!keys.has(key)){rows.push(row);keys.add(key);}return row;
  }};
}
function capacityBook(findings) {
  const resources=new Map();
  return {
    claim(key,currency,capacity,units,part,context) {
      if(units===0n)return;
      const prior=resources.get(key);
      need(!prior||(sameCurrency(prior.currency,currency)&&prior.capacity===capacity),
        'COMMISSIONING_NATIVE_CAPACITY','One original monetary identity has conflicting capacities.',409);
      const record=prior??{key,currency,capacity,uses:[],context};
      record.uses.push({units,part});resources.set(key,record);
      part.resources.push(key);
    },
    close() {
      const invalid=new Set(),result=[];
      for(const row of resources.values()) {
        const used=row.uses.reduce((total,use)=>total+use.units,0n),exceeded=used>row.capacity;
        if(exceeded){
          invalid.add(row.key);
          findings.add('COMMISSIONING_SHARED_CAPACITY','The selected cohort reuses more of an original amount than it contains.',
            {...row.context,resourceKey:row.key,currency:row.currency,capacity:money(row.capacity,row.currency),selected:money(used,row.currency),
              uses:row.uses.map(use=>({projectId:use.part.projectId,milestoneIndex:use.part.milestoneIndex??null,amount:money(use.units,row.currency)}))});
        }
        result.push({key:row.key,currency:row.currency,capacity:money(row.capacity,row.currency),selected:money(used,row.currency),
          remaining:money(maximum(0n,row.capacity-used),row.currency),status:exceeded?'EXCEEDED':'WITHIN_CAPACITY'});
      }
      return {invalid,rows:result};
    },
  };
}
function sourcePart(projectId,milestoneIndex,selection) {
  return {projectId,milestoneIndex,selection:clone(selection),valid:true,resources:[]};
}
function nonemptyField(value) {return typeof value==='string'&&value.length>0;}
function sourceInvoiceSha(invoice) {
  const descriptor=invoice.files?.['invoice.json'];
  return descriptor?.sha256??null;
}
function unsealedDigest(review) {
  const value=clone(review);delete value.previewSha256;delete value.files;
  return sha(json(value));
}
function compactReceipt(row,summary) {
  return {id:row.id,customerId:row.customerId,reference:row.reference,method:row.method,currency:row.currency,amount:row.amount,
    receivedDate:row.receivedDate,accountingDate:row.accountingDate??row.receivedDate,voidDate:row.voidDate??null,status:row.status,
    source:clone(row.source??null),sourceKey:row.sourceKey??null,bankSources:clone(row.bankSources??[]),
    correction:clone(row.correction??null),replacesReceiptId:row.replacesReceiptId??null,history:clone(row.history??[]),
    allocated:summary.allocated,refunded:summary.refunded,reserved:summary.reserved,available:summary.available,
    netAmount:summary.netAmount,unreconciledRefunds:clone(summary.unreconciledRefunds??[])};
}
function changesFromBaseline(baseline,review,findings) {
  if(!baseline)return {baseline:null,changes:[]};
  need(plain(baseline.capture)&&plain(baseline.review)&&baseline.capture.id===review.selection.baselineCaptureId,
    'COMMISSIONING_BASELINE','Use the selected original saved baseline.',409);
  need(baseline.review.schema===COMMISSIONING_REVIEW_SCHEMA&&baseline.review.workspaceId===review.workspaceId&&
    baseline.review.asOf<=review.asOf&&baseline.review.previewSha256===unsealedDigest(baseline.review),
    'COMMISSIONING_BASELINE_CHANGED','The original baseline identity, date or retained review changed.',409);
  const previous=baseline.review,changes=[];
  if(previous.source.sha256!==review.source.sha256)changes.push({kind:'SOURCE_EDITION_CHANGED',key:'source',before:previous.source,after:review.source});
  const old=new Map(previous.projects.map(row=>[row.projectId,row]));
  for(const row of review.projects){
    const prior=old.get(row.projectId);old.delete(row.projectId);
    if(!prior)changes.push({kind:'PROJECT_ADDED',key:row.projectId,before:null,after:row.totals});
    else if(json(prior.totals)!==json(row.totals))changes.push({kind:'PROJECT_AMOUNTS_CHANGED',key:row.projectId,before:prior.totals,after:row.totals});
    const priorMilestones=new Map(array(prior?.milestones).map(item=>[item.index,item]));
    for(const milestone of row.milestones){
      const before=priorMilestones.get(milestone.index);
      if(before&&json({totals:before.totals,dates:before.dates})!==json({totals:milestone.totals,dates:milestone.dates}))
        changes.push({kind:'MILESTONE_CHANGED',key:row.projectId+'/'+milestone.index,
          before:{totals:before.totals,dates:before.dates},after:{totals:milestone.totals,dates:milestone.dates}});
    }
  }
  for(const [id,prior]of old)changes.push({kind:'PROJECT_NOT_SELECTED',key:id,before:prior.totals,after:null});
  return {baseline:{captureId:baseline.capture.id,asOf:previous.asOf,reviewSha256:previous.previewSha256,sourceSha256:previous.source.sha256},changes};
}
export function compileCommissioningCollections({source,snapshot,selection,baseline=null,attachmentDescriptors=[]}) {
  need(source?.schema===COMMISSIONING_SOURCE_SCHEMA&&source.file?.sha256===sha(source.bytes),
    'COMMISSIONING_SOURCE_CHANGED','Use the complete byte-verified original commissioning source.',409);
  const selected=normalizeCommissioningSelection(source,selection),asOf=selected.asOf;
  need(plain(snapshot)&&snapshot.asOf===asOf&&nonemptyField(snapshot.workspaceId)&&
    Number.isSafeInteger(snapshot.revision)&&snapshot.revision>=0&&plain(snapshot.data),
    'COMMISSIONING_NATIVE_SNAPSHOT','Use one dated snapshot of the original accounting owner.',409);
  need(Boolean(selected.baselineCaptureId)===Boolean(baseline),
    'COMMISSIONING_BASELINE_SELECTION','Retain the selected saved baseline with this review.',409);
  const data=snapshot.data,customers=rowIndex(snapshot.customers,'customer'),
    invoices=rowIndex(data.invoices,'invoice'),receipts=rowIndex(data.receipts,'receipt'),
    allocations=rowIndex(data.allocations,'allocation'),credits=rowIndex(data.credits,'credit'),
    refunds=rowIndex(data.refunds??[],'refund'),projectsById=new Map(source.projects.map(row=>[row.id,row])),
    xeroById=new Map(array(snapshot.xeroCycles).map(row=>[row.cycle?.id,row]));
  const findings=findingsStore(),book=capacityBook(findings),work=[];
  const fail=(part,code,message,context={})=>{
    part.valid=false;
    findings.add(code,message,{projectId:part.projectId,...(part.milestoneIndex===undefined?{}:{milestoneIndex:part.milestoneIndex}),...context});
  };
  for(const control of selected.projects){
    const original=projectsById.get(control.projectId),currency=original.currency,customer=customers.get(control.customerId);
    const project={original,control,customer,milestones:[],receipts:[],refunds:[],xeroCycles:[]};
    work.push(project);
    if(!customer)findings.add('COMMISSIONING_CUSTOMER_BINDING','Choose the original customer for this source project.',
      {projectId:original.id,customerId:control.customerId});
    for(const milestoneControl of control.milestones){
      const originalMilestone=original.milestones[milestoneControl.index],
        milestone={original:originalMilestone,control:milestoneControl,lines:[],allocations:[],credits:[]};
      project.milestones.push(milestone);
      for(const selectedLine of milestoneControl.invoiceLines){
        const part=sourcePart(original.id,originalMilestone.index,selectedLine),invoice=invoices.get(selectedLine.invoiceId);
        milestone.lines.push(part);part.invoice=invoice;
        if(!customer||!invoice?.document){fail(part,'COMMISSIONING_INVOICE_BINDING','Select an original issued invoice for the bound customer.',{invoiceId:selectedLine.invoiceId});continue;}
        const document=invoice.document,line=array(document.lines).find(row=>row.id===selectedLine.invoiceLineId);
        if(document.customer?.id!==customer.id||!sameCurrency(document.currency,currency)){
          fail(part,'COMMISSIONING_INVOICE_IDENTITY','The original invoice customer and currency must match this project.',{invoiceId:invoice.id});continue;
        }
        const actualSha=sourceInvoiceSha(invoice);
        if(!actualSha||actualSha!==selectedLine.invoiceSha256||sha(json(document))!==actualSha){
          fail(part,'COMMISSIONING_INVOICE_SOURCE_CHANGED','Keep the exact retained invoice.json and its selected original SHA-256.',
            {invoiceId:invoice.id,selectedSha256:selectedLine.invoiceSha256,actualSha256:actualSha});continue;
        }
        if(!line){fail(part,'COMMISSIONING_INVOICE_LINE','The bound line is absent from the original invoice.',{invoiceId:invoice.id,invoiceLineId:selectedLine.invoiceLineId});continue;}
        part.line=line;part.summary=invoiceSummary(invoice,data,asOf);
        part.effective=!['DRAFT','FUTURE','VOID'].includes(part.summary.paymentStatus);
        part.net=minor(selectedLine.netAmount,currency);part.tax=minor(selectedLine.taxAmount,currency);
        book.claim('INVOICE_NET/'+invoice.id+'/'+line.id,currency,minor(line.netAmount,currency),part.net,part,{invoiceId:invoice.id,invoiceLineId:line.id});
        book.claim('INVOICE_TAX/'+invoice.id+'/'+line.id,currency,minor(line.taxAmount,currency),part.tax,part,{invoiceId:invoice.id,invoiceLineId:line.id});
      }
      for(const selectionPart of milestoneControl.allocations){
        const part=sourcePart(original.id,originalMilestone.index,selectionPart),allocation=allocations.get(selectionPart.allocationId);
        milestone.allocations.push(part);part.allocation=allocation;
        if(!allocation){fail(part,'COMMISSIONING_ALLOCATION_MISSING','The original allocation no longer exists.',{allocationId:selectionPart.allocationId});continue;}
        const invoice=invoices.get(allocation.invoiceId),receipt=receipts.get(allocation.receiptId);
        if(!customer||!invoice?.document||!receipt||invoice.document.customer.id!==customer.id||receipt.customerId!==customer.id||
          !sameCurrency(invoice.document.currency,currency)||!sameCurrency(receipt.currency,currency)){
          fail(part,'COMMISSIONING_ALLOCATION_IDENTITY','Use an original allocation between this customer’s invoice and receipt in the source currency.',
            {allocationId:allocation.id,invoiceId:allocation.invoiceId,receiptId:allocation.receiptId});continue;
        }
        part.units=minor(selectionPart.amount,currency);part.receipt=receipt;part.invoice=invoice;
        part.effective=allocationActive(allocation,asOf);
        book.claim('ALLOCATION/'+allocation.id,currency,minor(allocation.amount,currency),part.units,part,{allocationId:allocation.id,invoiceId:invoice.id});
      }
      for(const selectionPart of milestoneControl.credits){
        const part=sourcePart(original.id,originalMilestone.index,selectionPart),credit=credits.get(selectionPart.creditId);
        milestone.credits.push(part);part.credit=credit;
        const invoice=credit?invoices.get(credit.invoiceId):null,
          line=credit?.document?.lines?.find(row=>row.invoiceLineId===selectionPart.invoiceLineId);
        if(!customer||!credit?.document||!invoice?.document||!line||credit.document.customer.id!==customer.id||
          !sameCurrency(credit.document.currency,currency)){
          fail(part,'COMMISSIONING_CREDIT_IDENTITY','Select the original customer credit and its exact credited invoice line.',
            {creditId:selectionPart.creditId,invoiceLineId:selectionPart.invoiceLineId});continue;
        }
        part.invoice=invoice;part.line=line;part.effective=credit.document.creditDate<=asOf;
        part.net=minor(selectionPart.netAmount,currency);part.tax=minor(selectionPart.taxAmount,currency);
        book.claim('CREDIT_NET/'+credit.id+'/'+line.invoiceLineId,currency,minor(line.netAmount,currency),part.net,part,{creditId:credit.id,invoiceLineId:line.invoiceLineId});
        book.claim('CREDIT_TAX/'+credit.id+'/'+line.invoiceLineId,currency,minor(line.taxAmount,currency),part.tax,part,{creditId:credit.id,invoiceLineId:line.invoiceLineId});
      }
    }
    for(const selectionPart of control.receipts){
      const part=sourcePart(original.id,undefined,selectionPart),receipt=receipts.get(selectionPart.receiptId);
      project.receipts.push(part);part.receipt=receipt;
      if(!customer||!receipt||receipt.customerId!==customer.id||!sameCurrency(receipt.currency,currency)){
        fail(part,'COMMISSIONING_RECEIPT_IDENTITY','Choose an original receipt for this customer and source currency.',{receiptId:selectionPart.receiptId});continue;
      }
      part.summary=receiptSummary(receipt,data,asOf);part.units=minor(selectionPart.amount,currency);
      part.effective=(receipt.accountingDate??receipt.receivedDate)<=asOf&&(!receipt.voidDate||receipt.voidDate>asOf);
      book.claim('RECEIPT/'+receipt.id,currency,minor(receipt.amount,currency),part.units,part,{receiptId:receipt.id});
      if(part.summary.unreconciledRefunds?.length)findings.add('COMMISSIONING_UNPOSTED_REFUND',
        'This original receipt has a verified outgoing return awaiting its existing refund receiving or correction.',
        {projectId:original.id,receiptId:receipt.id,returns:clone(part.summary.unreconciledRefunds)});
    }
    for(const selectionPart of control.refunds){
      const part=sourcePart(original.id,undefined,selectionPart),refund=refunds.get(selectionPart.refundId);
      project.refunds.push(part);part.refund=refund;
      if(!customer||!refund?.proposal||refund.proposal.customerId!==customer.id||
        !sameCurrency(refund.proposal.currency,currency)||refund.proposal.accountingScope!=='COMMERCIAL'){
        fail(part,'COMMISSIONING_REFUND_IDENTITY','Select the original commercial refund for this customer and source currency.',
          {refundId:selectionPart.refundId});continue;
      }
      part.summary=refundAccountSummary(refund,asOf);part.units=minor(selectionPart.amount,currency);
      part.effective=minor(part.summary.refunded,currency)>0n;part.reserved=minor(part.summary.reserved,currency)>0n;
      book.claim('REFUND/'+refund.id,currency,minor(refund.proposal.amount,currency),part.units,part,{refundId:refund.id,receiptId:refund.proposal.receiptId});
    }
  }
  const capacities=book.close(),valid=part=>part.valid&&!part.resources.some(key=>capacities.invalid.has(key));
  // A payment belongs to its invoice. Its division across milestones is an explicit reviewed attribution.
  for(const project of work)for(const milestone of project.milestones){
    const currency=project.original.currency,byInvoice=new Map();
    for(const part of milestone.lines)if(valid(part)){
      const row=byInvoice.get(part.invoice.id)??{gross:0n,lines:new Map()};
      row.gross+=part.net+part.tax;row.lines.set(part.line.id,part);byInvoice.set(part.invoice.id,row);
    }
    const byAllocationInvoice=new Map();
    for(const part of milestone.allocations)if(valid(part)){
      const group=byAllocationInvoice.get(part.allocation.invoiceId)??[];
      group.push(part);byAllocationInvoice.set(part.allocation.invoiceId,group);
    }
    for(const [invoiceId,parts]of byAllocationInvoice){
      const available=byInvoice.get(invoiceId)?.gross??0n,used=parts.reduce((total,part)=>total+part.units,0n);
      if(used>available)for(const part of parts)fail(part,'COMMISSIONING_MILESTONE_CASH_CAPACITY',
        'The selected allocation portions exceed this milestone’s original bound invoice lines.',
        {invoiceId,available:money(available,currency),selected:money(used,currency)});
    }
    const groupedCredits=new Map();
    for(const part of milestone.credits)if(valid(part)){
      const key=part.credit.invoiceId+'/'+part.line.invoiceLineId,group=groupedCredits.get(key)??[];
      group.push(part);groupedCredits.set(key,group);
    }
    for(const parts of groupedCredits.values()){
      const first=parts[0],bound=byInvoice.get(first.credit.invoiceId)?.lines.get(first.line.invoiceLineId),
        net=parts.reduce((total,part)=>total+part.net,0n),tax=parts.reduce((total,part)=>total+part.tax,0n);
      if(!bound||net>bound.net||tax>bound.tax)for(const part of parts)fail(part,'COMMISSIONING_MILESTONE_CREDIT_CAPACITY',
        'The selected credit portions exceed this milestone’s original bound net or tax.',
        {invoiceId:first.credit.invoiceId,invoiceLineId:first.line.invoiceLineId,
          boundNet:money(bound?.net??0n,currency),boundTax:money(bound?.tax??0n,currency),selectedNet:money(net,currency),selectedTax:money(tax,currency)});
    }
  }
  const attributedRefunds=new Map(),refundByReceipt=new Map();
  for(const project of work)for(const part of project.refunds)if(valid(part)&&part.effective)
    attributedRefunds.set(part.refund.id,(attributedRefunds.get(part.refund.id)??0n)+part.units);
  for(const refund of data.refunds??[]){
    if(refund.proposal?.accountingScope!=='COMMERCIAL')continue;
    const summary=refundAccountSummary(refund,asOf);
    if(minor(summary.refunded,summary.currency)===0n)continue;
    const group=refundByReceipt.get(summary.receiptId)??[];group.push(summary);refundByReceipt.set(summary.receiptId,group);
  }
  for(const project of work)for(const part of project.receipts)if(valid(part)&&part.effective){
    for(const refund of refundByReceipt.get(part.receipt.id)??[]){
      const remainder=minor(refund.refunded,refund.currency)-(attributedRefunds.get(refund.id)??0n);
      if(remainder>0n){
        project.cashReconciliationIncomplete=true;
        findings.add('COMMISSIONING_REFUND_UNATTRIBUTED',
          'An actual original refund from this attributed receipt still needs its explicit project portion.',
          {projectId:project.original.id,receiptId:part.receipt.id,refundId:refund.id,currency:refund.currency,
            unassigned:money(remainder,refund.currency)});
      }
    }
  }
  const originalCollections=collectionsReport(data,{asOf}),cashRows=[],invoiceUses=new Map();
  const projects=work.map(project=>{
    const original=project.original,control=project.control,currency=original.currency,invoiceIds=new Set(),creditIds=new Set();
    const totals={sourceFeeNet:minor(original.fee,currency),invoicedNet:0n,invoicedTax:0n,allocatedGross:0n,
      creditedNet:0n,creditedTax:0n,amountDueGross:0n,creditBalanceGross:0n,receivedGross:0n,refundedGross:0n,reservedRefundGross:0n};
    const milestones=project.milestones.map(milestone=>{
      const rowTotals={sourceFeeNet:minor(milestone.original.amount,currency),invoicedNet:0n,invoicedTax:0n,allocatedGross:0n,
        creditedNet:0n,creditedTax:0n};
      const bindings=milestone.lines.map(part=>{
        const accepted=valid(part),effective=accepted&&part.effective,selectedLine=part.selection;
        if(accepted){invoiceIds.add(part.invoice.id);const uses=invoiceUses.get(part.invoice.id)??[];uses.push(part);invoiceUses.set(part.invoice.id,uses);}
        if(effective){rowTotals.invoicedNet+=part.net;rowTotals.invoicedTax+=part.tax;}
        return {...selectedLine,status:!accepted?'REVIEW':part.effective?'EFFECTIVE':part.summary.paymentStatus,
          invoiceNumber:part.invoice?.number??null,issueDate:part.invoice?.document?.issueDate??null,dueDate:part.invoice?.document?.dueDate??null,
          originalLine:part.line?clone(part.line):null,originalInvoice:part.summary?clone(part.summary):null};
      });
      const allocationRows=milestone.allocations.map(part=>{
        const accepted=valid(part),effective=accepted&&part.effective;
        if(effective)rowTotals.allocatedGross+=part.units;
        return {...part.selection,status:!accepted?'REVIEW':part.effective?'ACTIVE':'INACTIVE',
          invoiceId:part.allocation?.invoiceId??null,receiptId:part.allocation?.receiptId??null,
          allocatedDate:part.allocation?.allocatedDate??null,releasedDate:part.allocation?.releasedDate??null,
          actualReceiptDate:part.receipt?.receivedDate??null,receiptAccountingDate:part.receipt?.accountingDate??part.receipt?.receivedDate??null,
          replacesAllocationId:part.allocation?.replacesAllocationId??null,dispositionId:part.allocation?.dispositionId??null,
          original:part.allocation?clone(part.allocation):null};
      });
      const creditRows=milestone.credits.map(part=>{
        const accepted=valid(part),effective=accepted&&part.effective;
        if(accepted)creditIds.add(part.credit.id);
        if(effective){rowTotals.creditedNet+=part.net;rowTotals.creditedTax+=part.tax;}
        return {...part.selection,status:!accepted?'REVIEW':part.effective?'EFFECTIVE':'FUTURE',
          invoiceId:part.credit?.invoiceId??null,creditNumber:part.credit?.number??null,creditDate:part.credit?.document?.creditDate??null,
          originalLine:part.line?clone(part.line):null};
      });
      const gross=rowTotals.invoicedNet+rowTotals.invoicedTax,
        balance=gross-rowTotals.allocatedGross-rowTotals.creditedNet-rowTotals.creditedTax;
      rowTotals.amountDueGross=maximum(0n,balance);rowTotals.creditBalanceGross=maximum(0n,-balance);
      rowTotals.unbilledSourceNet=maximum(0n,rowTotals.sourceFeeNet-rowTotals.invoicedNet);
      rowTotals.billedAboveSourceNet=maximum(0n,rowTotals.invoicedNet-rowTotals.sourceFeeNet);
      for(const key of Object.keys(totals))if(Object.hasOwn(rowTotals,key)&&key!=='sourceFeeNet')totals[key]+=rowTotals[key];
      if(rowTotals.billedAboveSourceNet>0n)findings.add('COMMISSIONING_BILLED_ABOVE_SOURCE',
        'The original bound invoice net exceeds this original milestone fee; retain the scope amendment or correct the binding.',
        {projectId:original.id,milestoneIndex:milestone.original.index,amount:money(rowTotals.billedAboveSourceNet,currency)},'WARNING');
      const actual=milestone.control.acceptedDate,planned=milestone.control.plannedAcceptedDate,
        basis=actual??planned,due=futureDate(basis,milestone.control.invoiceDays),
        expected=futureDate(due,milestone.control.delayDays);
      return {index:milestone.original.index,key:milestone.original.key,condition:milestone.original.condition,
        sourcePercentage:milestone.original.percentage,sourceRounding:clone(milestone.original),
        dates:{acceptedDate:actual,acceptanceEffective:Boolean(actual&&actual<=asOf),plannedAcceptedDate:planned,
          invoiceDays:milestone.control.invoiceDays,invoiceTermSource:milestone.control.invoiceTermSource,collectionDelayDays:milestone.control.delayDays,
          plannedInvoiceDueDate:due,expectedCollectionDate:expected,planBasis:actual?'RECORDED_ACCEPTANCE':planned?'PLANNED_ACCEPTANCE':'UNSCHEDULED',
          originalInvoiceDueDates:[...new Set(bindings.map(row=>row.dueDate).filter(Boolean))].sort(),
          allocationDates:[...new Set(allocationRows.filter(row=>row.status==='ACTIVE').map(row=>row.allocatedDate))].sort(),
          originalReceiptDates:[...new Set(allocationRows.filter(row=>row.status==='ACTIVE').map(row=>row.actualReceiptDate).filter(Boolean))].sort()},
        totals:Object.fromEntries(Object.entries(rowTotals).map(([key,value])=>[key,money(value,currency)])),bindings,allocations:allocationRows,credits:creditRows};
    });
    let unresolvedOutflow=Boolean(project.cashReconciliationIncomplete)||project.receipts.some(part=>!valid(part))||project.refunds.some(part=>!valid(part));
    const receiptRows=project.receipts.map(part=>{
      const accepted=valid(part),effective=accepted&&part.effective;
      if(effective)totals.receivedGross+=part.units;
      if(accepted&&part.summary.unreconciledRefunds?.length)unresolvedOutflow=true;
      const row={kind:'RECEIPT',projectId:original.id,customerId:control.customerId,currency,...part.selection,
        status:!accepted?'REVIEW':part.effective?'EFFECTIVE':'INACTIVE',effectiveAmount:money(effective?part.units:0n,currency),
        actualDate:part.receipt?.receivedDate??null,accountingDate:part.receipt?.accountingDate??part.receipt?.receivedDate??null,
        voidDate:part.receipt?.voidDate??null,
        original:part.summary?compactReceipt(part.receipt,part.summary):null};
      cashRows.push(row);return row;
    });
    const refundRows=project.refunds.map(part=>{
      const accepted=valid(part),effective=accepted&&part.effective,reserved=accepted&&part.reserved;
      if(effective)totals.refundedGross+=part.units;if(reserved)totals.reservedRefundGross+=part.units;
      const row={kind:'REFUND',projectId:original.id,customerId:control.customerId,currency,...part.selection,
        receiptId:part.refund?.proposal?.receiptId??null,status:!accepted?'REVIEW':part.summary.effectiveStatus,
        effectiveAmount:money(effective?part.units:0n,currency),reservedAmount:money(reserved?part.units:0n,currency),
        actualDate:part.summary?.refundDate??null,accountingDate:part.summary?.accountingDate??null,
        reversedDate:part.summary?.reversedDate??null,original:part.summary?clone(part.summary):null};
      cashRows.push(row);return row;
    });
    for(const id of control.xeroCycleIds){
      const retained=xeroById.get(id),cycle=retained?.cycle,review=retained?.review;
      if(!cycle||!review||!cycle.customerIds?.includes(control.customerId)||!sameCurrency(cycle.currency,currency)||
        review.previewSha256!==unsealedDigest(review)){
        findings.add('COMMISSIONING_XERO_CYCLE','Select a complete original saved Xero cash cycle for this customer and currency.',
          {projectId:original.id,cycleId:id});continue;
      }
      const documents=array(review.documents).filter(row=>invoiceIds.has(row.documentId)||creditIds.has(row.documentId));
      project.xeroCycles.push({cycleId:id,packageId:cycle.packageId,packageIds:clone(cycle.packageIds),
        asOf:cycle.asOf,status:cycle.status,organisation:cycle.organisation,reviewSha256:review.previewSha256,
        sourceFingerprint:review.sourceFingerprint,observationScope:cycle.asOf===asOf?'SAME_ACCOUNT_DATE':'SAVED_ACCOUNT_DATE',
        documents:clone(documents),sources:clone(review.sources??[]),findings:clone(review.findings??[])});
    }
    totals.unbilledSourceNet=maximum(0n,totals.sourceFeeNet-totals.invoicedNet);
    totals.billedAboveSourceNet=maximum(0n,totals.invoicedNet-totals.sourceFeeNet);
    totals.netRecordedCash=totals.receivedGross-totals.refundedGross;
    const publicTotals=Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,money(value,currency)]));
    publicTotals.reconciledNetCash=unresolvedOutflow?null:publicTotals.netRecordedCash;
    return {projectId:original.id,name:original.name,customerId:control.customerId,customer:project.customer?clone(project.customer):null,
      currency,owner:original.owner,sourceCaseId:original.caseId,sourceUrl:original.sourceUrl,sourceStage:original.stage,
      sourceFee:original.fee,sourceInvoiceDays:original.sourceInvoiceDays,sourceProject:clone(original.source),
      totals:publicTotals,milestones,receipts:receiptRows,refunds:refundRows,xeroCycles:project.xeroCycles,
      collectionCases:clone(array(originalCollections.cases).filter(row=>invoiceIds.has(row.invoiceId))),
      unassignedCollections:clone(array(originalCollections.unassigned).filter(row=>invoiceIds.has(row.invoiceId))),
      cashAccountingScope:'Original effective receipts and refunds at the account date. Receipt successor/accounting dates and physical bank dates are retained separately.'};
  });
  // Completeness is visible without assigning an invoice-level payment to a milestone by amount inference.
  const selectedAllocationUnits=new Map();
  for(const project of work)for(const milestone of project.milestones)for(const part of milestone.allocations)
    if(valid(part)&&part.effective)selectedAllocationUnits.set(part.allocation.id,
      (selectedAllocationUnits.get(part.allocation.id)??0n)+part.units);
  for(const row of data.allocations)if(invoiceUses.has(row.invoiceId)&&allocationActive(row,asOf)){
    const currency=invoices.get(row.invoiceId).document.currency,selectedUnits=selectedAllocationUnits.get(row.id)??0n,
      remaining=minor(row.amount,currency)-selectedUnits;
    if(remaining>0n)findings.add('COMMISSIONING_ALLOCATION_UNATTRIBUTED','An original active invoice allocation has cash outside the reviewed milestone portions.',
      {invoiceId:row.invoiceId,allocationId:row.id,receiptId:row.receiptId,amount:money(remaining,currency),
        originalAmount:row.amount,selectedAmount:money(selectedUnits,currency),unassignedAmount:money(remaining,currency),currency},'WARNING');
  }
  const currencyTotals=new Map();
  for(const project of projects){
    const key=currencyKey(project.currency),group=currencyTotals.get(key)??{currency:project.currency,projects:0,values:{},reconciled:true};
    group.projects++;
    for(const [name,value]of Object.entries(project.totals))if(name!=='reconciledNetCash')
      group.values[name]=(group.values[name]??0n)+minor(value,project.currency,name,{signed:true});
    if(project.totals.reconciledNetCash===null)group.reconciled=false;
    currencyTotals.set(key,group);
  }
  const review={schema:COMMISSIONING_REVIEW_SCHEMA,label:selected.label,asOf,workspaceId:snapshot.workspaceId,revision:snapshot.revision,
    source:{...clone(source.file),sourceDate:source.sourceDate,roundingRule:source.roundingRule},
    sourceFingerprint:sha(json({source:source.file.sha256,selection:selected,snapshot,
      attachments:clone(attachmentDescriptors),baseline:baseline?{id:baseline.capture.id,sha256:baseline.review.previewSha256}:null})),
    selection:selected,projects,cash:cashRows,capacities:capacities.rows,
    currencies:[...currencyTotals.values()].map(group=>({currency:group.currency,projects:group.projects,
      totals:{...Object.fromEntries(Object.entries(group.values).map(([key,units])=>[key,money(units,group.currency)])),
        reconciledNetCash:group.reconciled?money(group.values.netRecordedCash??0n,group.currency):null}})),
    findings:findings.rows,
    accountingRules:{
      monetaryBasis:'Original source fees and invoice-line net/tax, allocation settlement and physical receipt/refund amounts remain distinct.',
      allocationAttribution:'Every selected allocation portion shares its original capacity across the complete cohort. Invoice-level cash is never copied to each milestone.',
      corrections:'Original void, successor, release, refund and reversal dates remain authoritative. Receipt activation on a correction date is not a new bank inflow.',
      sourceStages:'Contact stage and planned acceptance dates do not imply an issued invoice or received customer cash.',
      xero:'Saved Xero cycles retain their own account date, observed provider sources and original findings.',
      currencies:'Actual amounts are grouped in original accounting currency and precision. The original planning desk retains its own FX and staffing model.',
    }};
  Object.assign(review,changesFromBaseline(baseline,review,findings));
  review.counts={projects:projects.length,milestones:projects.reduce((sum,row)=>sum+row.milestones.length,0),
    invoiceLineBindings:projects.reduce((sum,row)=>sum+row.milestones.reduce((count,milestone)=>count+milestone.bindings.length,0),0),
    receiptPortions:cashRows.filter(row=>row.kind==='RECEIPT').length,refundPortions:cashRows.filter(row=>row.kind==='REFUND').length,
    errors:findings.rows.filter(row=>row.severity==='ERROR').length,warnings:findings.rows.filter(row=>row.severity==='WARNING').length};
  review.status=review.counts.errors?'REVIEW':'READY';
  review.summary=review.status==='READY'?'The original source cohort and reviewed native cash portions are retained for commissioning.':
    'The complete original source and native account are retained with the customer bindings and cash portions that need review.';
  review.previewSha256=sha(json(review));
  return {review,files:renderCommissioningFiles(review)};
}
