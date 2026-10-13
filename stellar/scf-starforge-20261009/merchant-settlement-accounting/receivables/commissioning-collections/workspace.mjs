// MIT. Original workshare commissioning retained under the existing accounting owner.
import {randomUUID} from 'node:crypto';
import {accountingWorkspaceBinding} from '../../workspace/binding.mjs';
import {json,sha,need,plain,field,identifier,dateValue,currencyOf,currencyKey,customerSnapshot,
  customerExport,invoiceSummary,receiptSummary,refundAccountSummary,allocationActive} from '../core.mjs';
import {XeroReceivablesWorkspace} from '../xero/store.mjs';
import {decodeXeroFile,xeroFileDescriptor,xeroInstant,XERO_PACKAGE_BYTES} from '../xero/domain.mjs';
import {readCommissioningWorkshares,normalizeCommissioningSelection,compileCommissioningCollections} from './domain.mjs';

export const COMMISSIONING_COLLECTIONS_SCHEMA='stellar-forge.merchant-receivables-commissioning-collections.v1';
export const COMMISSIONING_SOURCE_SCHEMA='stellar-forge.commissioning-workshare-source.v1';
export const COMMISSIONING_CAPTURE_SCHEMA='stellar-forge.commissioning-collections-capture.v1';
export const COMMISSIONING_SOURCE_BYTES=8*1024*1024;
export const COMMISSIONING_COLLECTIONS_REQUEST_BYTES=32*1024*1024;
const HEX=/^[a-f0-9]{64}$/;
const KEY=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const MIME='application/json; charset=utf-8';
const clone=value=>structuredClone(value);
const stamp=()=>new Date().toISOString();
const today=()=>stamp().slice(0,10);
const file=(name,bytes,role,type=MIME)=>({name,bytes:Buffer.from(bytes),role,type});
const jsonFile=(name,value,role)=>file(name,json(value),role);
const extension=name=>/\.(json|csv|html|txt|pdf|bin)$/i.exec(name)?.[1].toLowerCase()??'dat';
const textSearch=(row,value)=>!value||json(row).toLowerCase().includes(value);
function parse(bytes,name) {
  try{return JSON.parse(bytes.toString('utf8'));}
  catch{need(false,'COMMISSIONING_RETAINED_JSON','The retained '+name+' is not valid JSON.',409);}
}
function key(value,name) {
  need(typeof value==='string'&&KEY.test(value),'COMMISSIONING_IDENTIFIER','Use an original '+name+'.');
  return value;
}
function page(query={}) {
  const offset=query.offset??0,limit=query.limit??100;
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=200,
    'COMMISSIONING_PAGE','Choose a nonnegative offset and a page of 1 to 200 original rows.');
  const search=query.search==null?'':field(query.search,'search',300,true).toLowerCase();
  return {offset,limit,search};
}
function pageResult(rows,query={}) {
  const {offset,limit}=page(query);
  return {items:rows.slice(offset,offset+limit),total:rows.length,offset,limit};
}
function scales(value) {
  if(value===undefined)return {EUR:2,GBP:2,USD:2};
  need(plain(value),'COMMISSIONING_CURRENCY_SCALES','Use explicit original currency precision values.');
  const result={};
  for(const [code,scale] of Object.entries(value)) {
    const unit=currencyOf({code,scale});
    need(unit.code===code,'COMMISSIONING_CURRENCY_SCALES','Use the original uppercase currency code.');
    result[code]=unit.scale;
  }
  return result;
}
function sourceView(source) {
  const {bytes,...view}=source;return clone(view);
}
function projectBrief(row) {
  return {id:row.id,name:row.name,currency:clone(row.currency),fee:row.fee,stage:row.stage??null,
    owner:row.owner??null,caseId:row.caseId??null,milestoneCount:row.milestones.length,
    sourceIndex:row.sourceIndex,sourcePointer:row.sourcePointer};
}

/** This controller borrows the original workspace; it never opens or closes a lease. */
export class CommissioningCollectionsWorkspace {
  constructor(receivables,{xero}={}) {
    need(receivables?.workspace&&typeof receivables._mutate==='function'&&typeof receivables.data==='function',
      'COMMISSIONING_OWNER_REQUIRED','Use the original initialized receivables workspace.');
    this.receivables=receivables;this.workspace=receivables.workspace;
    this.xero=xero??new XeroReceivablesWorkspace(receivables);
    need(this.xero.workspace===this.workspace&&typeof this.xero._retain==='function'&&typeof this.xero._retainedFile==='function',
      'COMMISSIONING_OWNER_REQUIRED','Keep source and capture files under the same original accounting owner.');
  }
  data() {
    const data=this.receivables.data().commissioningCollections;
    if(data===undefined)return {schema:COMMISSIONING_COLLECTIONS_SCHEMA,sources:[],captures:[]};
    need(data?.schema===COMMISSIONING_COLLECTIONS_SCHEMA&&Array.isArray(data.sources)&&Array.isArray(data.captures),
      'COMMISSIONING_STATE','The retained commissioning register is invalid.',409);
    return data;
  }
  _register(original) {
    if(original.commissioningCollections===undefined)
      original.commissioningCollections={schema:COMMISSIONING_COLLECTIONS_SCHEMA,sources:[],captures:[]};
    return this.data();
  }
  async init() {return this.workspace.serial(async()=>{this.data();return this;});}
  _source(id) {
    identifier(id,'retained commissioning source');
    const row=this.data().sources.find(item=>item.id===id);
    need(row,'COMMISSIONING_SOURCE_NOT_FOUND','Choose a retained original workshare source.',404);
    return row;
  }
  _capture(id) {
    identifier(id,'saved commissioning capture');
    const row=this.data().captures.find(item=>item.id===id);
    need(row,'COMMISSIONING_CAPTURE_NOT_FOUND','Choose a saved original commissioning capture.',404);
    return row;
  }
  _sourceSummary(row,counts) {
    const captureCount=counts?.get(row.id)??this.data().captures.filter(item=>item.sourceId===row.id).length;
    return clone({schema:row.schema,id:row.id,label:row.label,name:row.name,sha256:row.sha256,bytes:row.bytes,
      sourceDate:row.sourceDate,receivedAt:row.receivedAt,createdAt:row.createdAt,actor:row.actor,
      replacesSourceId:row.replacesSourceId,currencyScales:row.currencyScales,projectCount:row.projectCount,
      projects:row.projects,captureCount,normalizationSha256:row.normalizationSha256});
  }
  _captureSummary(row) {
    return clone({schema:row.schema,id:row.id,sourceId:row.sourceId,sourceSha256:row.sourceSha256,label:row.label,
      asOf:row.asOf,createdAt:row.createdAt,actor:row.actor,workspaceId:row.workspaceId,
      projectIds:row.projectIds,customerIds:row.customerIds,xeroCycleIds:row.xeroCycleIds,
      baselineCaptureId:row.baselineCaptureId,previewSha256:row.previewSha256,sourceFingerprint:row.sourceFingerprint,
      status:row.status,counts:row.counts,fileCount:row.files.length});
  }
  _decode(value) {
    need(plain(value)&&plain(value.file),'COMMISSIONING_SOURCE_FILE','Attach the complete original workshare JSON.');
    const original=decodeXeroFile(value.file,COMMISSIONING_SOURCE_BYTES),currencyScales=scales(value.currencyScales);
    if(value.expectedSha256!==undefined)need(HEX.test(value.expectedSha256)&&value.expectedSha256===original.sha256,
      'COMMISSIONING_SOURCE_CHANGED','The original source bytes changed after inspection.',409);
    const source=readCommissioningWorkshares({name:original.name,bytes:original.bytes,
      expectedSha256:value.expectedSha256},{currencyScales});
    return {source,currencyScales};
  }
  async _readSource(row) {
    const original=await this.xero._retainedFile(row,'original-workshares.json'),
      retained=await this.xero._retainedFile(row,'commissioning-source.json'),
      normalized=parse(retained.bytes,'workshare source normalization');
    need(sha(original.bytes)===row.sha256&&original.bytes.length===row.bytes&&
      sha(retained.bytes)===row.normalizationSha256&&normalized.file?.sha256===row.sha256&&normalized.file?.bytes===row.bytes,
      'COMMISSIONING_SOURCE_CHANGED','The original retained source identities do not agree.',409);
    return {...normalized,bytes:original.bytes};
  }
  async inspectSource(value) {
    return this.workspace.serial(async()=>{
      const {source,currencyScales}=this._decode(value);
      return {revision:this.workspace.state.revision,schema:source.schema,file:clone(source.file),
        sourceDate:source.sourceDate,projectCount:source.projects.length,numericTokenCount:source.numericTokens.length,
        roundingRule:source.roundingRule,currencyScales,projects:clone(source.projects)};
    });
  }
  async importSource(value) {
    const result=await this.receivables._mutate('commissioning_source_imported',value,async(original,actor)=>{
      const {source,currencyScales}=this._decode(value),data=this._register(original),
        replacesSourceId=value.replacesSourceId==null?null:this._source(value.replacesSourceId).id,
        receivedAt=xeroInstant(value.receivedAt??stamp(),'source receiving time'),createdAt=stamp(),
        label=field(value.label??source.file.name,'commissioning source label',300),
        normalized=json(sourceView(source)),id=randomUUID();
      const retained=await this.xero._retain([
        file('original-workshares.json',source.bytes,'original-private-workshares'),
        file('commissioning-source.json',normalized,'original-workshare-normalization'),
        jsonFile('commissioning-source-receipt.json',{schema:COMMISSIONING_SOURCE_SCHEMA,id,label,
          source:source.file,sourceDate:source.sourceDate,replacesSourceId,receivedAt,createdAt,actor,currencyScales,
          normalizationSha256:sha(normalized)},'original-workshare-source-receipt')
      ]);
      data.sources.push({schema:COMMISSIONING_SOURCE_SCHEMA,id,label,name:source.file.name,
        sha256:source.file.sha256,bytes:source.file.bytes,sourceDate:source.sourceDate??null,
        receivedAt,createdAt,actor,replacesSourceId,currencyScales,normalizationSha256:sha(normalized),
        projectCount:source.projects.length,projects:source.projects.map(projectBrief),
        history:[{at:createdAt,actor,action:'source_imported',replacesSourceId}],...retained});
      return {commissioningSourceId:id};
    });
    return this.workspace.serial(async()=>({...result,revision:this.workspace.state.revision,
      source:this._sourceSummary(this._source(result.operation.result.commissioningSourceId))}));
  }
  async sources(query={}) {
    return this.workspace.serial(async()=>{
      const {search}=page(query),counts=new Map();
      for(const row of this.data().captures)counts.set(row.sourceId,(counts.get(row.sourceId)??0)+1);
      let rows=this.data().sources.map(row=>this._sourceSummary(row,counts)).reverse();
      if(query.projectId!==undefined){key(query.projectId,'workshare project');rows=rows.filter(row=>row.projects.some(project=>project.id===query.projectId));}
      rows=rows.filter(row=>textSearch(row,search));
      return {revision:this.workspace.state.revision,...pageResult(rows,query)};
    });
  }
  async source(id,query={}) {
    return this.workspace.serial(async()=>{
      const row=this._source(id),view=query.view??'summary',{search}=page(query);
      need(['summary','projects','history'].includes(view),'COMMISSIONING_SOURCE_VIEW','Choose source summary, projects or history.');
      const result={revision:this.workspace.state.revision,source:this._sourceSummary(row),view,files:clone(row.files)};
      if(view==='summary')return result;
      const items=view==='projects'?(await this._readSource(row)).projects:row.history;
      return {...result,...pageResult(items.filter(item=>textSearch(item,search)),query)};
    });
  }
  async sourceFile(id,name) {
    return this.workspace.serial(async()=>this.xero._retainedFile(this._source(id),name));
  }


  _cycleSummary(row) {
    return clone({schema:row.schema,id:row.id,label:row.label,packageId:row.packageId,packageIds:row.packageIds,
      organisation:row.organisation,currency:row.currency,customerIds:row.customerIds,asOf:row.asOf,
      baselineCycleId:row.baselineCycleId,createdAt:row.createdAt,actor:row.actor,
      reviewSha256:row.reviewSha256,sourceFingerprint:row.sourceFingerprint,status:row.status,
      counts:row.counts,importIds:row.importIds,sourceCount:row.sourceCount});
  }
  async candidates(query={}) {
    return this.workspace.serial(async()=>{
      const view=query.view??'customers',asOf=dateValue(query.asOf??today(),'commissioning account date'),
        {search,offset,limit}=page(query),data=this.receivables.data(),
        customers=this.workspace.state.customerStatements?.customers??[],
        source=query.sourceId===undefined?null:this._source(query.sourceId);
      need(['customers','invoices','allocations','credits','receipts','refunds','xeroCycles'].includes(view),
        'COMMISSIONING_CANDIDATE_VIEW','Choose original customers, invoices, allocations, credits, receipts, refunds or Xero cycles.');
      if(query.customerId!==undefined)identifier(query.customerId,'original customer');
      let project=null;
      if(query.projectId!==undefined) {
        key(query.projectId,'workshare project');
        need(source,'COMMISSIONING_PROJECT_SOURCE','Select the retained source containing this project.');
        project=source.projects.find(row=>row.id===query.projectId);
        need(project,'COMMISSIONING_PROJECT_NOT_FOUND','Choose a project in the original source.',404);
      }
      const customerById=new Map(customers.map(row=>[row.id,row])),
        invoices=new Map(data.invoices.map(row=>[row.id,row])),
        receipts=new Map(data.receipts.map(row=>[row.id,row])),
        invoiceCustomer=row=>row?.document?.customer?.id??row?.document?.customerId??row?.draft?.customerId??null,
        sameCustomer=id=>query.customerId===undefined||id===query.customerId,
        sameCurrency=unit=>!project||unit&&currencyKey(unit)===currencyKey(project.currency),
        invoiceHash=row=>row?.files?.['invoice.json']?.sha256??null;
      let rows=[];
      if(view==='customers')rows=customers.filter(row=>sameCustomer(row.id)&&textSearch(
        {id:row.id,reference:row.reference,name:row.name,email:row.email},search));
      if(view==='invoices')rows=data.invoices.filter(row=>row.document&&sameCustomer(invoiceCustomer(row))&&
        sameCurrency(row.document.currency)&&textSearch({id:row.id,number:row.number,
          customer:row.document.customer,sourceReference:row.document.sourceReference,lines:row.document.lines},search)).slice().reverse();
      if(view==='allocations')rows=data.allocations.filter(row=>{
        const invoice=invoices.get(row.invoiceId),receipt=receipts.get(row.receiptId);
        return sameCustomer(receipt?.customerId??invoiceCustomer(invoice))&&sameCurrency(row.currency)&&
          textSearch({id:row.id,invoiceId:row.invoiceId,invoiceNumber:invoice?.number,receiptId:row.receiptId,
            receiptReference:receipt?.reference,allocatedDate:row.allocatedDate,releasedDate:row.releasedDate},search);
      }).slice().reverse();
      if(view==='credits')rows=data.credits.filter(row=>sameCustomer(row.document.customer?.id??
        invoiceCustomer(invoices.get(row.invoiceId)))&&sameCurrency(row.document.currency)&&
        textSearch({id:row.id,number:row.number,invoiceId:row.invoiceId,invoiceNumber:invoices.get(row.invoiceId)?.number,
          reason:row.document.reason,lines:row.document.lines},search)).slice().reverse();
      if(view==='receipts')rows=data.receipts.filter(row=>sameCustomer(row.customerId)&&sameCurrency(row.currency)&&
        textSearch({id:row.id,reference:row.reference,customerId:row.customerId,customer:customerById.get(row.customerId)?.name,
          method:row.method,receivedDate:row.receivedDate,accountingDate:row.accountingDate,bankSources:row.bankSources},search)).slice().reverse();
      if(view==='refunds')rows=(data.refunds??[]).filter(row=>sameCustomer(row.proposal.customerId)&&
        sameCurrency(row.proposal.currency)&&textSearch({id:row.id,receiptId:row.proposal.receiptId,
          receiptReference:row.proposal.receipt?.reference,customer:row.proposal.customer,status:row.status,
          reference:row.payoutRecord?.reference,reason:row.proposal.reason},search)).slice().reverse();
      if(view==='xeroCycles')rows=(data.xero?.cashCycles??[]).filter(row=>
        (query.customerId===undefined||row.customerIds.includes(query.customerId))&&sameCurrency(row.currency)&&
        textSearch({id:row.id,label:row.label,organisation:row.organisation,asOf:row.asOf,status:row.status,
          packageIds:row.packageIds,customerIds:row.customerIds},search)).slice().reverse();
      const items=rows.slice(offset,offset+limit).map(row=>{
        if(view==='customers')return customerSnapshot(row);
        if(view==='invoices')return {...invoiceSummary(row,data,asOf),customerId:invoiceCustomer(row),
          invoiceSha256:invoiceHash(row),sourceReference:row.document.sourceReference??'',
          lines:clone(row.document.lines),sourceQuote:clone(row.sourceQuote??null)};
        if(view==='allocations') {
          const invoice=invoices.get(row.invoiceId),receipt=receipts.get(row.receiptId);
          return {...clone(row),customerId:receipt?.customerId??invoiceCustomer(invoice),invoiceNumber:invoice?.number??null,
            invoiceSha256:invoiceHash(invoice),sourceReference:invoice?.document?.sourceReference??'',
            receiptReference:receipt?.reference??null,active:allocationActive(row,asOf),asOf,
            receiptLineage:receipt?clone({id:receipt.id,receivedDate:receipt.receivedDate,
              accountingDate:receipt.accountingDate??receipt.receivedDate,voidDate:receipt.voidDate??null,
              replacesReceiptId:receipt.replacesReceiptId??null,replacedByReceiptId:receipt.replacedByReceiptId??null,
              replacementReceiptIds:receipt.replacementReceiptIds??[],bankSources:receipt.bankSources??[]}):null};
        }
        if(view==='credits')return {id:row.id,number:row.number,invoiceId:row.invoiceId,
          invoiceNumber:invoices.get(row.invoiceId)?.number??null,customerId:row.document.customer?.id??
            invoiceCustomer(invoices.get(row.invoiceId)),currency:clone(row.document.currency),
          creditDate:row.document.creditDate,reason:row.document.reason,lines:clone(row.document.lines),
          totals:clone(row.document.totals),creditSha256:row.files?.['credit.json']?.sha256??null,
          effective:row.document.creditDate<=asOf,asOf};
        if(view==='receipts')return receiptSummary(row,data,asOf);
        if(view==='refunds')return {...refundAccountSummary(row,asOf),
          reason:row.proposal.reason,customerNote:row.proposal.customerNote??'',
          funding:clone(row.proposal.funding??[]),releasedAllocationIds:clone(row.releasedAllocationIds??[])};
        return this._cycleSummary(row);
      });
      return {revision:this.workspace.state.revision,view,asOf,sourceId:source?.id??null,
        projectId:project?.id??null,customerId:query.customerId??null,items,total:rows.length,offset,limit};
    });
  }
  async _build(sourceId,value) {
    need(plain(value),'COMMISSIONING_SELECTION','Send the complete reviewed project and milestone selection.');
    const owner=this._source(sourceId),source=await this._readSource(owner),
      selection=normalizeCommissioningSelection(source,value),
      binding=accountingWorkspaceBinding(this.workspace.directory,this.workspace.state),
      original=this.receivables.data(),customers=this.workspace.state.customerStatements?.customers??[];
    let baseline=null,baselineRow=null;
    if(selection.baselineCaptureId) {
      baselineRow=this._capture(selection.baselineCaptureId);
      need(baselineRow.workspaceId===binding.workspaceId&&baselineRow.asOf<=selection.asOf,
        'COMMISSIONING_BASELINE','Choose an earlier saved capture from this original accounting workspace.',409);
      baseline={capture:this._captureSummary(baselineRow),
        review:parse((await this.xero._retainedFile(baselineRow,'commissioning-review.json')).bytes,'commissioning baseline review')};
      need(baseline.review.previewSha256===baselineRow.previewSha256,
        'COMMISSIONING_BASELINE_CHANGED','The retained baseline review no longer matches its original capture.',409);
    }
    const selectedCustomers=new Set(selection.projects.map(row=>row.customerId).filter(Boolean)),
      requestedCycleIds=[...new Set(selection.projects.flatMap(row=>row.xeroCycleIds??[]))],
      cycleById=new Map((original.xero?.cashCycles??[]).map(row=>[row.id,row])),
      xeroCycles=[],files=new Map(),origins=[];let total=0;
    const add=item=>{
      need(item&&typeof item.name==='string'&&Buffer.isBuffer(item.bytes),'COMMISSIONING_FILE',
        'Retain every complete original source file.',409);
      const previous=files.get(item.name);
      if(previous) {
        need(previous.bytes.length===item.bytes.length&&sha(previous.bytes)===sha(item.bytes),
          'COMMISSIONING_FILE_COLLISION','Two original commissioning files have the same name.',409);
        return previous;
      }
      total+=item.bytes.length;
      need(total<=XERO_PACKAGE_BYTES,'COMMISSIONING_PACKAGE_LIMIT',
        'The complete source and customer handover exceeds 128 MiB. Select a smaller original cohort.');
      files.set(item.name,item);return item;
    };
    const attach=(item,origin,role)=>{
      const digest=sha(item.bytes),name='original-'+sha(json({sha256:digest,type:item.type??null}))+'.'+extension(item.name);
      // Several saved cycles can contain the same invoice or cash advice. Retain
      // one physical file while the index preserves every original source role.
      add({...item,name,role:'original-retained-source'});
      origins.push({...origin,name,originalName:item.name,type:item.type,role,bytes:item.bytes.length,sha256:digest});
    };
    add(file('original-workshares.json',source.bytes,'original-private-workshares'));
    add(await this.xero._retainedFile(owner,'commissioning-source.json'));
    add(await this.xero._retainedFile(owner,'commissioning-source-receipt.json'));
    // A missing saved-cycle selector is a compiler finding. Every cycle that does
    // exist is read from its original immutable files under this same lease.
    for(const id of requestedCycleIds) {
      const record=cycleById.get(id);
      if(!record)continue;
      const review=parse((await this.xero._retainedFile(record,'cash-review.json')).bytes,'saved Xero cash review');
      need(review.previewSha256===record.reviewSha256,'COMMISSIONING_XERO_REVIEW_CHANGED',
        'A selected saved Xero cash review differs from its original capture.',409);
      xeroCycles.push({cycle:this._cycleSummary(record),review});
      for(const descriptor of record.files)attach(await this.xero._retainedFile(record,descriptor.name),
        {kind:'XERO_CASH_CYCLE',cycleId:record.id,packageIds:record.packageIds},'original-xero-cash-cycle');
    }
    const snapshot={schema:'stellar-forge.commissioning-account-snapshot.v1',
      workspaceId:binding.workspaceId,revision:this.workspace.state.revision,asOf:selection.asOf,
      sourcesSha256:binding.sourcesSha256,customers:customers.map(customerSnapshot),
      data:clone(original),xeroCycles};
    add(jsonFile('commissioning-account-snapshot.json',snapshot,'original-complete-accounting-snapshot'));
    if(baseline) {
      add(jsonFile('commissioning-baseline.json',{capture:baseline.capture,review:baseline.review},
        'original-commissioning-baseline'));
      for(const id of baselineRow.customerIds)selectedCustomers.add(id);
    }
    // Retain the same customer account and cash advice readers used by the
    // original receivables and Xero handover. Unknown bindings stay in the review.
    const selectedKnownCustomers=customers.filter(row=>selectedCustomers.has(row.id)),
      documentIds=new Set();
    for(const customer of selectedKnownCustomers) {
      const account=customerExport(original,customer,selection.asOf);
      for(const item of account.files)attach(item,{kind:'CUSTOMER_ACCOUNT',customerId:customer.id},'original-customer-account');
      for(const invoice of account.value.invoices)documentIds.add(invoice.id);
      for(const credit of account.value.credits)documentIds.add(credit.id);
      const advice=[...await this.receivables.refundsWorkspace.customerFiles(customer.id,selection.asOf),
        ...await this.receivables.bankReceiptsWorkspace.customerFiles(customer.id,selection.asOf)];
      for(const item of advice)attach(item,{kind:'CUSTOMER_CASH_ADVICE',customerId:customer.id},'original-customer-cash-advice');
    }
    // Include explicitly selected future or disputed originals as well as the
    // dated customer account. Their eligibility remains a visible domain result.
    for(const project of selection.projects)for(const milestone of project.milestones) {
      for(const row of milestone.invoiceLines)documentIds.add(row.invoiceId);
      for(const row of milestone.credits)documentIds.add(row.creditId);
    }
    const invoices=new Map(original.invoices.map(row=>[row.id,row])),
      credits=new Map(original.credits.map(row=>[row.id,row]));
    for(const id of documentIds) {
      const record=invoices.get(id)??credits.get(id);
      if(!record?.document||!record.files)continue;
      const kind=record.document.kind==='CREDIT_NOTE'?'CREDIT_NOTE':'INVOICE',
        originalName=kind==='CREDIT_NOTE'?'credit.json':'invoice.json',
        retained=await this.receivables._file(id,originalName);
      need(sha(retained.bytes)===sha(json(record.document)),'COMMISSIONING_DOCUMENT_CHANGED',
        'An issued document differs from its original retained JSON.',409);
      for(const name of Object.keys(record.files))attach(await this.receivables._file(id,name),
        {kind,documentId:id,customerId:record.document.customer?.id??record.document.customerId},
        'original-issued-document');
    }
    add(jsonFile('commissioning-original-files.json',{
      schema:'stellar-forge.commissioning-original-files.v1',sourceId:owner.id,sourceSha256:owner.sha256,
      asOf:selection.asOf,files:origins},'original-commissioning-file-index'));
    const compiled=compileCommissioningCollections({source,snapshot,selection,baseline,
      attachmentDescriptors:[...files.values()].map(xeroFileDescriptor)});
    need(plain(compiled?.review)&&Array.isArray(compiled.files)&&HEX.test(compiled.review.previewSha256??''),
      'COMMISSIONING_REVIEW_INVALID','The original commissioning compiler did not return a complete reviewed capture.',409);
    for(const item of compiled.files)add(item);
    if(!files.has('commissioning-review.json'))
      add(jsonFile('commissioning-review.json',compiled.review,'commissioning-review'));
    const retainedReview=files.get('commissioning-review.json');
    need(sha(retainedReview.bytes)===sha(json(compiled.review)),'COMMISSIONING_REVIEW_FILE',
      'The retained review bytes differ from the complete original review.',409);
    return {owner,source,selection,snapshot,baseline,review:compiled.review,files:[...files.values()]};
  }


  async preview(sourceId,value) {
    return this.workspace.serial(async()=>{
      const built=await this._build(sourceId,value);
      return {revision:this.workspace.state.revision,source:this._sourceSummary(built.owner),
        selection:clone(built.selection),review:built.review,previewSha256:built.review.previewSha256,
        files:built.files.map(xeroFileDescriptor)};
    });
  }
  async capture(sourceId,value) {
    identifier(sourceId,'retained commissioning source');
    need(plain(value),'COMMISSIONING_SELECTION','Send the complete reviewed project and milestone selection.');
    const result=await this.receivables._mutate('commissioning_collections_captured',
      {...value,commissioningSourceId:sourceId},async(original,actor)=>{
        need(HEX.test(value.previewSha256??''),'COMMISSIONING_REVIEW_REQUIRED',
          'Review the complete source, milestone bindings and customer cash before saving this capture.');
        const built=await this._build(sourceId,value);
        need(built.review.previewSha256===value.previewSha256,'COMMISSIONING_REVIEW_CHANGED',
          'The original source, accounting ledger or selected bindings changed. Review the current capture.',409);
        const id=randomUUID(),createdAt=stamp(),summary={
          schema:COMMISSIONING_CAPTURE_SCHEMA,id,sourceId:built.owner.id,sourceSha256:built.owner.sha256,
          label:built.selection.label,asOf:built.selection.asOf,createdAt,actor,workspaceId:built.snapshot.workspaceId,
          projectIds:clone(built.selection.projectIds),
          customerIds:[...new Set(built.selection.projects.map(row=>row.customerId).filter(Boolean))],
          xeroCycleIds:[...new Set(built.selection.projects.flatMap(row=>row.xeroCycleIds??[]))],
          baselineCaptureId:built.selection.baselineCaptureId??null,
          previewSha256:built.review.previewSha256,sourceFingerprint:built.review.sourceFingerprint,
          status:built.review.status,counts:clone(built.review.counts??{})};
        const captureFile=jsonFile('commissioning-capture.json',{...summary,selection:built.selection},
          'saved-commissioning-capture'),
          manifest=jsonFile('commissioning-manifest.json',{
            schema:'stellar-forge.commissioning-collections-manifest.v1',capture:summary,
            files:[...built.files,captureFile].map(xeroFileDescriptor)},'commissioning-capture-manifest'),
          retained=await this.xero._retain([...built.files,captureFile,manifest]);
        this._register(original).captures.push({...summary,selection:clone(built.selection),...retained});
        built.owner.history.push({at:createdAt,actor,action:'commissioning_captured',captureId:id,
          asOf:summary.asOf,label:summary.label,status:summary.status,baselineCaptureId:summary.baselineCaptureId});
        return {commissioningSourceId:sourceId,commissioningCaptureId:id};
      });
    return this.workspace.serial(async()=>({...result,revision:this.workspace.state.revision,
      source:this._sourceSummary(this._source(result.operation.result.commissioningSourceId)),
      capture:await this._detail(this._capture(result.operation.result.commissioningCaptureId))}));
  }
  async captures(query={}) {
    return this.workspace.serial(async()=>{
      const {search}=page(query);
      if(query.sourceId!==undefined)identifier(query.sourceId,'retained commissioning source');
      if(query.projectId!==undefined)key(query.projectId,'original workshare project');
      if(query.customerId!==undefined)identifier(query.customerId,'original customer');
      if(query.status!==undefined)field(query.status,'capture status',100);
      const rows=this.data().captures.filter(row=>
        (query.sourceId===undefined||row.sourceId===query.sourceId)&&
        (query.projectId===undefined||row.projectIds.includes(query.projectId))&&
        (query.customerId===undefined||row.customerIds.includes(query.customerId))&&
        (query.status===undefined||row.status===query.status))
        .map(row=>this._captureSummary(row)).filter(row=>textSearch(row,search)).reverse();
      return {revision:this.workspace.state.revision,...pageResult(rows,query)};
    });
  }
  async _detail(row) {
    const review=parse((await this.xero._retainedFile(row,'commissioning-review.json')).bytes,'saved commissioning review');
    need(review.previewSha256===row.previewSha256,'COMMISSIONING_REVIEW_CHANGED',
      'The saved review no longer matches its original capture.',409);
    return {...this._captureSummary(row),selection:clone(row.selection),review,files:clone(row.files)};
  }
  async detail(id) {
    return this.workspace.serial(async()=>({revision:this.workspace.state.revision,
      capture:await this._detail(this._capture(id))}));
  }
  async file(id,name) {
    return this.workspace.serial(async()=>this.xero._retainedFile(this._capture(id),name));
  }
  async export(id) {
    return this.workspace.serial(async()=>{
      const row=this._capture(id),files=[];
      for(const descriptor of row.files)files.push(await this.xero._retainedFile(row,descriptor.name));
      return {value:await this._detail(row),files,revision:this.workspace.state.revision};
    });
  }
  async request(requestId) {
    key(requestId,'original operator request');
    return this.workspace.serial(async()=>{
      const operation=this.receivables.data().requests.find(row=>row.id===requestId),
        result={revision:this.workspace.state.revision,requestId,found:Boolean(operation)};
      if(!operation)return result;
      need(['commissioning_source_imported','commissioning_collections_captured'].includes(operation.action),
        'COMMISSIONING_REQUEST_KIND','This request belongs to another original receivables operation. Use its original request reader.',409);
      return {...result,operation:clone(operation),
        ...(operation.result.commissioningSourceId?
          {source:this._sourceSummary(this._source(operation.result.commissioningSourceId))}:{}),
        ...(operation.result.commissioningCaptureId?
          {capture:await this._detail(this._capture(operation.result.commissioningCaptureId))}:{})};
    });
  }
}
