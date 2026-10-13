// MIT. Cash commissioning retains original customer files under the accounting lease.
import {randomUUID} from 'node:crypto';
import {accountingWorkspaceBinding} from '../../workspace/binding.mjs';
import {json,sha,need,plain,field,identifier,dateValue,currencyKey,customerExport,customerSnapshot} from '../core.mjs';
import {bankAccountRows,bankAccountSummary} from '../bank-receipts.mjs';
import {decodeXeroFile,xeroFileDescriptor,XERO_PACKAGE_BYTES,XERO_MAX_DOCUMENTS,xeroInstant} from './domain.mjs';
import {compileXeroCashCycle} from './cash-commissioning.mjs';

export const XERO_CASH_CYCLE_SCHEMA='stellar-forge.merchant-receivables-xero-cash-cycle.v1';
const SNAPSHOT_SCHEMA='stellar-forge.merchant-receivables-xero-cash-snapshot.v1';
const HEX=/^[0-9a-f]{64}$/;
const MIME='application/json; charset=utf-8';
const clone=value=>structuredClone(value);
const stamp=()=>new Date().toISOString();
const file=(name,bytes,role,type=MIME)=>({name,bytes:Buffer.from(bytes),role,type});
function parsed(bytes,name) {
  try{return JSON.parse(bytes.toString('utf8'));}
  catch{need(false,'XERO_CASH_RETAINED_JSON','The retained '+name+' is not valid JSON.',409);}
}
function ids(value,name,maximum,{empty=false}={}) {
  need(Array.isArray(value)&&value.length<=maximum&&(empty||value.length>0),
    'XERO_CASH_SELECTION','Choose '+name+' within the displayed selection.');
  const result=value.map(id=>identifier(id,name));
  need(new Set(result).size===result.length,'XERO_CASH_DUPLICATE_SELECTION','Select each '+name+' once.');
  return result;
}
function list(value,name,maximum) {
  need(Array.isArray(value??[])&&(value??[]).length<=maximum&&(value??[]).every(plain),
    'XERO_CASH_INPUT','Send complete '+name+' rows within the supported request size.');
  return clone(value??[]);
}
function equalOrganisation(a,b) {
  return a.organisationKey===b.organisationKey&&currencyKey(a.profile?.currency??a.currency)===currencyKey(b.profile?.currency??b.currency);
}
function extension(name) {return /\.(json|html|csv|txt|pdf|bin)$/i.exec(name)?.[1].toLowerCase()??'dat';}

export class XeroCashCommissioningWorkspace {
  constructor(xero) {
    need(xero?.receivables&&typeof xero._retain==='function'&&xero.workspace,
      'XERO_CASH_OWNER_REQUIRED','Use the original initialized Xero workspace.');
    this.xero=xero;this.receivables=xero.receivables;this.workspace=xero.workspace;
  }
  data() {
    const data=this.xero.data();
    need(data.cashCycles===undefined||Array.isArray(data.cashCycles),'XERO_CASH_STATE','The retained cash-cycle register is invalid.',409);
    return data.cashCycles??[];
  }
  _row(packageId,id) {
    const owner=this.xero._package(packageId);
    identifier(id,'saved commissioning cycle');
    const row=this.data().find(item=>item.id===id);
    need(row&&row.packageIds.includes(packageId)&&equalOrganisation(owner,row),
      'XERO_CASH_CYCLE_NOT_FOUND','Choose a saved commissioning cycle for this Xero package.',404);
    return row;
  }
  _summary(row) {
    return clone({schema:row.schema,id:row.id,label:row.label,packageId:row.packageId,packageIds:row.packageIds,
      organisation:row.organisation,currency:row.currency,customerIds:row.customerIds,asOf:row.asOf,
      baselineCycleId:row.baselineCycleId,createdAt:row.createdAt,actor:row.actor,reviewSha256:row.reviewSha256,
      sourceFingerprint:row.sourceFingerprint,status:row.status,counts:row.counts,importIds:row.importIds,
      sourceCount:row.sourceCount});
  }
  summaries(packageId) {
    this.xero._package(packageId);
    return this.data().filter(row=>row.packageIds.includes(packageId)).map(row=>this._summary(row)).reverse();
  }
  _selection(packageId,value) {
    need(plain(value),'XERO_CASH_INPUT','Send one complete commissioning selection.');
    const owner=this.xero._package(packageId),packageIds=ids(value.packageIds??[packageId],'original Xero packages',50);
    need(packageIds.includes(packageId),'XERO_CASH_ANCHOR','Keep this original package in the commissioning cohort.');
    const packages=packageIds.map(id=>this.xero._package(id));
    need(packages.every(row=>equalOrganisation(owner,row)),'XERO_CASH_ORGANISATION',
      'Select packages for the same Xero organisation and accounting currency.',409);
    const originalIds=new Set(packages.flatMap(row=>row.documents.map(doc=>doc.id+':'+doc.sourceSha256)));
    need(originalIds.size<=XERO_MAX_DOCUMENTS,'XERO_CASH_DOCUMENT_LIMIT',
      'Select no more than '+XERO_MAX_DOCUMENTS+' original issued documents in one cash cycle.');
    const asOf=dateValue(value.asOf,'commissioning account date'),label=field(value.label??('Cash cycle '+asOf),'cycle label',200);
    const baselineCycleId=value.baselineCycleId==null?null:identifier(value.baselineCycleId,'baseline cash cycle');
    const baseline=baselineCycleId?this.data().find(row=>row.id===baselineCycleId):null;
    if(baselineCycleId) {
      need(baseline&&equalOrganisation(owner,baseline),'XERO_CASH_BASELINE',
        'Choose an original saved baseline in the same Xero organisation and currency.',409);
      need(baseline.asOf<=asOf,'XERO_CASH_BASELINE_DATE','Keep the later cycle account date on or after its baseline.');
    }
    const selection={packageIds,asOf,label,baselineCycleId,importIds:ids(value.importIds??[],'original native Xero imports',100,{empty:true}),
      sourceBindings:list(value.sourceBindings,'original customer/source bindings',5000),
      matches:list(value.matches,'original cash matches',10000)};
    const additionalSources=list(value.additionalSources,'original provider files',20);
    need(selection.importIds.length+additionalSources.length>0,'XERO_CASH_SOURCE_REQUIRED',
      'Select retained native Xero responses or add the complete original provider JSON.');
    return {owner,packages,selection,baseline,additionalSources};
  }
  async _snapshot(packages,asOf,baseline) {
    const data=this.receivables.data(),customerIds=new Set(packages.flatMap(row=>row.documents.map(doc=>doc.customerId)));
    for(const id of baseline?.customerIds??[])customerIds.add(id);
    const customers=[...customerIds].map(id=>this.receivables._customer(id));
    const invoices=data.invoices.filter(row=>row.document&&customerIds.has(row.document.customer.id)&&row.document.issueDate<=asOf);
    const invoiceIds=new Set(invoices.map(row=>row.id));
    const receipts=data.receipts.filter(row=>customerIds.has(row.customerId)&&(row.accountingDate??row.receivedDate)<=asOf);
    const receiptIds=new Set(receipts.map(row=>row.id));
    const accountIds=new Set(receipts.flatMap(row=>(row.bankSources??[]).map(source=>source.bankAccountId)).filter(Boolean));
    const binding=accountingWorkspaceBinding(this.workspace.directory,this.workspace.state);
    const snapshot={schema:SNAPSHOT_SCHEMA,asOf,revision:this.workspace.state.revision,
      workspaceId:binding.workspaceId,sourcesSha256:binding.sourcesSha256,
      customers:customers.map(customerSnapshot),accounts:customers.map(customer=>customerExport(data,customer,asOf).value),
      invoices:clone(invoices),credits:clone(data.credits.filter(row=>invoiceIds.has(row.invoiceId)&&row.document.creditDate<=asOf)),
      receipts:clone(receipts),allocations:clone(data.allocations.filter(row=>receiptIds.has(row.receiptId)&&row.allocatedDate<=asOf)),
      refunds:clone((data.refunds??[]).filter(row=>receiptIds.has(row.proposal.receiptId)&&
        row.proposal.accountingScope==='COMMERCIAL'&&row.proposal.effectiveDate<=asOf)),
      creditDispositions:clone((data.creditDispositions??[]).filter(row=>receiptIds.has(row.proposal.receiptId)&&row.proposal.effectiveDate<=asOf)),
      bankAccounts:bankAccountRows(data).filter(row=>accountIds.has(row.id)).map(bankAccountSummary)};
    const files=[],originals=[];
    for(const customer of customers) {
      const account=customerExport(data,customer,asOf);
      for(const item of account.files) {
        const name='cash-account-'+customer.id+'-'+item.name;
        files.push({...item,name,role:'original-customer-account'});
        originals.push({customerId:customer.id,name,originalName:item.name,type:item.type,bytes:item.bytes.length,sha256:sha(item.bytes)});
      }
      const advice=[...await this.receivables.refundsWorkspace.customerFiles(customer.id,asOf),
        ...await this.receivables.bankReceiptsWorkspace.customerFiles(customer.id,asOf)];
      for(const item of advice) {
        const sourceSha256=sha(item.bytes),name='cash-advice-'+sha(json({customerId:customer.id,name:item.name,sha256:sourceSha256}))+'.'+extension(item.name);
        files.push({...item,name,role:'original-customer-cash-advice'});
        originals.push({customerId:customer.id,name,originalName:item.name,type:item.type,bytes:item.bytes.length,sha256:sourceSha256});
      }
    }
    files.push(file('cash-account-snapshot.json',json(snapshot),'original-customer-cash-snapshot'));
    files.push(file('cash-customer-files.json',json({schema:'stellar-forge.xero-cash-customer-files.v1',asOf,files:originals}),'original-customer-cash-index'));
    return {snapshot,files};
  }
  async _sources(packages,selection,additionalSources) {
    const related=new Map();
    for(const record of packages)for(const item of this.xero._relatedImports(record))related.set(item.id,item);
    const sources=[],files=[],origins=[];
    for(const id of selection.importIds) {
      const item=related.get(id);
      need(item?.format==='NATIVE_JSON','XERO_CASH_NATIVE_SOURCE',
        'Select original native Xero JSON returned for this package cohort.',409);
      const original=await this.xero._retainedFile(item,item.fileName),digest=sha(original.bytes);
      need(digest===item.file.sha256,'XERO_CASH_SOURCE_CHANGED','The original received response changed.',409);
      const name='cash-source-'+digest+'.json';
      sources.push({id:'import:'+id,name:item.file.name,sha256:digest,bytes:original.bytes,
        observedAt:item.receivedAt,recordedAt:item.recordedAt,importId:id,packageId:item.packageId});
      files.push(file(name,original.bytes,'original-xero-cash-response'));
      origins.push({id:'import:'+id,name,originalName:item.file.name,sha256:digest,bytes:original.bytes.length,
        observedAt:item.receivedAt,recordedAt:item.recordedAt,importId:id,packageId:item.packageId});
    }
    const additions=[];
    for(const [index,input] of additionalSources.entries()) {
      need(plain(input.file),'XERO_CASH_ORIGINAL_FILE','Attach the unchanged original provider response.');
      const original=decodeXeroFile(input.file),observedAt=xeroInstant(input.observedAt,'provider response observation time'),
        name='cash-source-'+original.sha256+'.json',id='source:'+original.sha256+':'+observedAt;
      need(!sources.some(row=>row.id===id),'XERO_CASH_DUPLICATE_SOURCE','Select each original provider observation once.');
      sources.push({id,name:original.name,sha256:original.sha256,bytes:original.bytes,observedAt,recordedAt:null,importId:null});
      files.push(file(name,original.bytes,'original-xero-cash-response'));
      origins.push({id,name,originalName:original.name,sha256:original.sha256,bytes:original.bytes.length,observedAt,recordedAt:null,importId:null});
      additions.push({name:original.name,sha256:original.sha256,bytes:original.bytes.length,observedAt});
    }
    return {sources,files,origins,additions};
  }
  async _build(packageId,value) {
    const {owner,packages,selection,baseline,additionalSources}=this._selection(packageId,value);
    const {snapshot,files}=await this._snapshot(packages,selection.asOf,baseline);
    const provider=await this._sources(packages,selection,additionalSources);
    selection.additionalSources=provider.additions;
    const packageSources=[];
    for(const record of packages)for(const descriptor of record.files) {
      const original=await this.xero._retainedFile(record,descriptor.name),
        name='cash-package-'+sha(json({packageId:record.id,name:descriptor.name,sha256:sha(original.bytes)}))+'.'+extension(descriptor.name);
      files.push({...original,name,role:'original-xero-document-handover'});
      packageSources.push({packageId:record.id,name,originalName:descriptor.name,role:descriptor.role,type:original.type,
        bytes:original.bytes.length,sha256:sha(original.bytes)});
    }
    files.push(...provider.files);
    files.push(file('cash-source-index.json',json({schema:'stellar-forge.xero-cash-sources.v1',
      packageIds:selection.packageIds,provider:provider.origins,packages:packageSources}),'original-cash-source-index'));
    const unique=new Map();let total=0;
    const add=item=>{
      const previous=unique.get(item.name);
      if(previous) {
        need(sha(previous.bytes)===sha(item.bytes),'XERO_CASH_FILE_COLLISION','Two original cash files have the same name.',409);
        return;
      }
      total+=item.bytes.length;
      need(total<=XERO_PACKAGE_BYTES,'XERO_PACKAGE_LIMIT','This complete commissioning cycle exceeds 128 MiB. Select fewer source packages.');
      unique.set(item.name,item);
    };
    for(const item of files)add(item);
    const baselineSource=baseline?{
      cycle:this._summary(baseline),
      review:parsed((await this.xero._retainedFile(baseline,'cash-review.json')).bytes,'baseline cash review'),
      snapshot:parsed((await this.xero._retainedFile(baseline,'cash-account-snapshot.json')).bytes,'baseline customer cash snapshot')
    }:null;
    const index=this.xero._receivingIndex(),packageDetails=packages.map(record=>this.xero._detail(record,index));
    const compiled=compileXeroCashCycle({package:this.xero._detail(owner,index),packages:packageDetails,
      resolutions:packages.flatMap(record=>record.documents.map(document=>({...this.xero._resolution(record,document,index),packageId:record.id}))),
      snapshot,sources:provider.sources,selection,baseline:baselineSource,
      attachmentDescriptors:[...unique.values()].map(xeroFileDescriptor)});
    need(plain(compiled?.review)&&Array.isArray(compiled.files)&&HEX.test(compiled.review.previewSha256??''),
      'XERO_CASH_REVIEW_INVALID','The original commissioning compiler did not return a complete review.',409);
    for(const item of compiled.files)add(item);
    if(!unique.has('cash-review.json'))add(file('cash-review.json',json(compiled.review),'commissioning-review'));
    return {owner,packages,selection,snapshot,sources:provider.sources,review:compiled.review,files:[...unique.values()]};
  }
  async preview(packageId,value) {
    return this.workspace.serial(async()=>{
      const built=await this._build(packageId,value);
      return {...built.review,revision:this.workspace.state.revision,files:built.files.map(xeroFileDescriptor)};
    });
  }
  async capture(packageId,value) {
    identifier(packageId,'original Xero package');
    const result=await this.receivables._mutate('xero_cash_cycle_captured',{...value,xeroPackageId:packageId},async(_data,actor)=>{
      need(HEX.test(value.previewSha256??''),'XERO_CASH_REVIEW_REQUIRED','Review this complete cash cycle before saving it.');
      const built=await this._build(packageId,value);
      need(built.review.previewSha256===value.previewSha256,'XERO_CASH_REVIEW_CHANGED',
        'The original customer ledger, source selection or cash matches changed. Review the current cycle.',409);
      const id=randomUUID(),createdAt=stamp(),summary={
        schema:XERO_CASH_CYCLE_SCHEMA,id,label:built.selection.label,packageId,packageIds:built.selection.packageIds,
        organisation:built.owner.organisation,organisationKey:built.owner.organisationKey,currency:clone(built.owner.profile.currency),
        customerIds:built.snapshot.customers.map(row=>row.id),asOf:built.selection.asOf,baselineCycleId:built.selection.baselineCycleId,
        createdAt,actor,reviewSha256:built.review.previewSha256,sourceFingerprint:built.review.sourceFingerprint,
        status:built.review.status??'REVIEW',counts:clone(built.review.counts??{}),
        importIds:built.selection.importIds,sourceCount:built.sources.length};
      const cycleFile=file('cash-cycle.json',json(summary),'saved-commissioning-cycle');
      const manifest=file('cash-handover-manifest.json',json({schema:'stellar-forge.xero-cash-handover.v1',cycle:summary,
        files:[...built.files,cycleFile].map(xeroFileDescriptor)}),'commissioning-handover-manifest');
      const retained=await this.xero._retain([...built.files,cycleFile,manifest]);
      const data=this.xero.data();data.cashCycles??=[];
      data.cashCycles.push({...summary,selection:built.selection,...retained});
      for(const record of built.packages)record.history.push({at:createdAt,actor,action:'cash_cycle_captured',cycleId:id,
        label:summary.label,asOf:summary.asOf,baselineCycleId:summary.baselineCycleId,status:summary.status});
      return {xeroPackageId:packageId,xeroCashCycleId:id};
    });
    return this.workspace.serial(async()=>({...result,revision:this.workspace.state.revision,
      cashCycle:await this._detail(this._row(packageId,result.operation.result.xeroCashCycleId))}));
  }
  async _detail(row) {
    const review=parsed((await this.xero._retainedFile(row,'cash-review.json')).bytes,'saved cash review');
    return {...this._summary(row),selection:clone(row.selection),review,files:clone(row.files)};
  }
  async cycles(packageId) {
    return this.workspace.serial(async()=>({packageId,items:this.summaries(packageId),revision:this.workspace.state.revision}));
  }
  async detail(packageId,id) {
    return this.workspace.serial(async()=>({cashCycle:await this._detail(this._row(packageId,id)),revision:this.workspace.state.revision}));
  }
  async file(packageId,id,name) {
    return this.workspace.serial(async()=>this.xero._retainedFile(this._row(packageId,id),name));
  }
  async export(packageId,id) {
    return this.workspace.serial(async()=>{
      const row=this._row(packageId,id),files=[];
      for(const descriptor of row.files)files.push(await this.xero._retainedFile(row,descriptor.name));
      return {value:await this._detail(row),files,revision:this.workspace.state.revision};
    });
  }
}
