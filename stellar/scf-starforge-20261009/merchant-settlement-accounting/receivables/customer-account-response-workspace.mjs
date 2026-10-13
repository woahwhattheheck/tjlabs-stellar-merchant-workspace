// MIT. Customer delivery and response review share the original accounting lease and commit.
import {randomUUID,createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,mkdir,lstat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {accountingWorkspaceBinding} from '../workspace/binding.mjs';
import {need,plain,field,identifier,dateValue,json,sha,today,renderCustomerTar} from './core.mjs';
import {collectionRows} from './collections.mjs';
import {CUSTOMER_ACCOUNT_SCHEMA,CUSTOMER_RESPONSE_SCHEMA,customerAccountData,accountPublicationSummary,
  accountResponseSummary,normalizeCustomerResponse,customerResponseReview,customerResponseDecisionHtml,escape} from './customer-account-response.mjs';

const HEX=/^[a-f0-9]{64}$/;
const FILE=/^(?:documents\/)?[A-Za-z0-9._-]+$/;
const now=()=>new Date().toISOString();
const clone=value=>structuredClone(value);
const asFile=(name,value,type='application/json; charset=utf-8')=>({name,type,bytes:Buffer.from(typeof value==='string'?value:json(value))});
async function sync(path){const fd=await open(path,constants.O_RDONLY|(constants.O_DIRECTORY??0)|(constants.O_NOFOLLOW??0));try{await fd.sync();}finally{await fd.close();}}
async function retainedFiles(workspace,files){
  const root=join(workspace.directory,'exports'),stat=await lstat(root);
  need(stat.isDirectory()&&!stat.isSymbolicLink(),'CUSTOMER_ACCOUNT_EXPORT_CHANGED','The original accounting export directory changed.',409);
  const directoryId=randomUUID(),directory=join(root,directoryId),metadata={},names=new Set();let total=0;
  await mkdir(directory,{mode:0o700});
  for(const file of files){
    need(FILE.test(file.name)&&file.name.split('/').every(part=>part!=='.'&&part!=='..')&&!names.has(file.name),'CUSTOMER_ACCOUNT_FILE_NAME','Retain unique original customer file names.');
    names.add(file.name);total+=file.bytes.length;
    need(total<=160_000_000,'CUSTOMER_ACCOUNT_FILE_LIMIT','This complete customer delivery exceeds160 MB.');
    if(file.name.startsWith('documents/'))await mkdir(join(directory,'documents'),{recursive:true,mode:0o700});
    const fd=await open(join(directory,file.name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
    try{await fd.writeFile(file.bytes);await fd.sync();}finally{await fd.close();}
    metadata[file.name]={bytes:file.bytes.length,sha256:sha(file.bytes),type:file.type};
  }
  if([...names].some(name=>name.startsWith('documents/')))await sync(join(directory,'documents'));
  await sync(directory);await sync(root);return{directoryId,files:metadata};
}
async function readRetained(workspace,record,name){
  need(FILE.test(name)&&name.split('/').every(part=>part!=='.'&&part!=='..')&&Object.hasOwn(record.files,name),'CUSTOMER_ACCOUNT_FILE_NOT_FOUND','Choose an original retained customer file.',404);
  const root=join(workspace.directory,'exports',identifier(record.directoryId,'retained customer directory'));
  for(const path of [join(workspace.directory,'exports'),root,...(name.startsWith('documents/')?[join(root,'documents')]:[])]){
    const stat=await lstat(path);need(stat.isDirectory()&&!stat.isSymbolicLink(),'CUSTOMER_ACCOUNT_EXPORT_CHANGED','A retained customer directory changed.',409);
  }
  const fd=await open(join(root,name),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{const stat=await fd.stat(),meta=record.files[name];
    need(stat.isFile()&&stat.size===meta.bytes,'CUSTOMER_ACCOUNT_FILE_CHANGED','A retained customer file changed.',409);
    const bytes=await fd.readFile();need(sha(bytes)===meta.sha256,'CUSTOMER_ACCOUNT_FILE_CHANGED','The retained customer file differs from its original source.',409);
    return{name,type:meta.type,bytes};
  }finally{await fd.close();}
}
export class CustomerAccountResponseWorkspace{
  constructor(receivables){this.receivables=receivables;this.workspace=receivables.workspace;}
  workspaceId(){return accountingWorkspaceBinding(this.workspace.directory,this.workspace.state).workspaceId;}
  guard(value){need(value?.workspaceId===this.workspaceId(),'CUSTOMER_ACCOUNT_WORKSPACE_CHANGED','Reopen the original merchant account for this saved operation.',409);}
  publication(id){identifier(id,'customer account');const row=customerAccountData(this.receivables.data()).publications.find(item=>item.id===id);
    need(row,'CUSTOMER_ACCOUNT_NOT_FOUND','Choose an existing published customer account.',404);return row;}
  response(id){identifier(id,'customer response');const row=customerAccountData(this.receivables.data()).responses.find(item=>item.id===id);
    need(row,'CUSTOMER_RESPONSE_NOT_FOUND','Choose a received customer response.',404);return row;}
  result(result){return{workspaceId:this.workspaceId(),
    ...(result.customerAccountId?{customerAccount:accountPublicationSummary(this.publication(result.customerAccountId))}:{}),
    ...(result.customerResponseId?{customerResponse:accountResponseSummary(this.response(result.customerResponseId))}:{}),
    ...(result.customerResponseDecisionId?{customerResponseDecision:clone(this.response(result.customerResponseId).decisions.find(row=>row.id===result.customerResponseDecisionId))}:{})};}
  async list(query={}){
    return this.workspace.serial(async()=>{
      const {publications,responses}=customerAccountData(this.receivables.data()),search=String(query.search??'').trim().toLowerCase();
      const match=row=>(!query.customerId||row.customerId===query.customerId)&&(!search||[row.customerName,row.id].some(x=>String(x).toLowerCase().includes(search)));
      return{workspaceId:this.workspaceId(),revision:this.workspace.state.revision,
        publications:publications.map(accountPublicationSummary).filter(match),
        responses:responses.map(accountResponseSummary).filter(match)};
    });
  }
  async _publicationPreview(value){
    const customerId=identifier(value.customerId,'customer'),asOf=dateValue(value.asOf??today(),'account date');
    need(asOf<=today(),'CUSTOMER_ACCOUNT_FUTURE','Choose an account date on or before today.');
    const publicationId=identifier(value.publicationId,'new customer account');
    need(!customerAccountData(this.receivables.data()).publications.some(row=>row.id===publicationId),'CUSTOMER_ACCOUNT_EXISTS','Use the original saved operation or a new account identifier.',409);
    const exported=await this.receivables._exportCustomer(customerId,{asOf});
    const files=Object.fromEntries(exported.files.map(file=>[file.name,{bytes:file.bytes.length,sha256:sha(file.bytes)}]));
    const invoiceSources=exported.value.invoices.map(row=>({invoiceId:row.id,documentSha256:this.receivables._invoice(row.id).files['invoice.json'].sha256}));
    const selection={schema:CUSTOMER_ACCOUNT_SCHEMA,workspaceId:this.workspaceId(),revision:this.workspace.state.revision,
      publicationId,customerId,asOf,account:exported.value,accountSha256:files['account.json'].sha256,files,invoiceSources};
    return{preview:{...selection,sourceSha256:sha(json({accountSha256:selection.accountSha256,files,invoiceSources})),
      reviewSha256:sha(json(selection))},files:exported.files};
  }
  async previewPublication(value){return this.workspace.serial(async()=> (await this._publicationPreview(value)).preview);}
  async publish(value){
    this.guard(value);
    return this.receivables._mutate('customer_account_published',value,async(data,actor)=>{
      const {preview,files}=await this._publicationPreview(value);
      need(HEX.test(value.reviewSha256??'')&&value.reviewSha256===preview.reviewSha256,'CUSTOMER_ACCOUNT_PREVIEW_CHANGED',
        'Review the current complete customer account before publishing.',409);
      const binding={publicationId:preview.publicationId,workspaceId:preview.workspaceId,customerId:preview.customerId,
        sourceSha256:preview.sourceSha256,accountSha256:preview.accountSha256,asOf:preview.asOf};
      const context={schema:CUSTOMER_ACCOUNT_SCHEMA,binding,account:preview.account,
        files:files.map(file=>({name:file.name,type:file.type,bytes:file.bytes.length,sha256:sha(file.bytes)}))};
      const script=await readFile(new URL('./public/customer-account-customer.mjs',import.meta.url),'utf8');
      const style=await readFile(new URL('./public/customer-account.css',import.meta.url),'utf8');
      const boot='const ACCOUNT = '+JSON.stringify(context).replace(/</g,'\\u003c')+';\n'+script;
      const scriptHash=createHash('sha256').update(boot).digest('base64');
      const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'sha256-'+scriptHash+
        '\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'">'+
        '<title>Customer account — '+escape(preview.account.customer.name)+'</title><style>'+style+'</style></head>'+
        '<body><a href="#main" class="skip">Skip to account</a><header><h1>Customer account</h1><p id="account-title"></p></header>'+
        '<main id="main"><div id="notice" role="status"></div><nav id="tabs" aria-label="Customer account"></nav><section id="content"></section></main>'+
        '<script>'+boot+'</script></body></html>\n';
      const delivery=[...files,asFile('account-binding.json',binding),asFile('customer-account.html',html,'text/html; charset=utf-8')];
      const manifest={schema:'stellar-forge.merchant-customer-account-delivery.v1',binding,
        files:Object.fromEntries(delivery.map(file=>[file.name,{bytes:file.bytes.length,sha256:sha(file.bytes)}]))};
      delivery.push(asFile('delivery-manifest.json',manifest));
      need(1024+delivery.reduce((total,file)=>total+512+Math.ceil(file.bytes.length/512)*512,0)<=128_000_000,
        'CUSTOMER_PACKET_LIMIT','This complete customer delivery exceeds128 MB. Select an earlier account date before publishing.');
      const retained=await retainedFiles(this.workspace,delivery);
      const row={schema:CUSTOMER_ACCOUNT_SCHEMA,id:preview.publicationId,workspaceId:preview.workspaceId,
        customerId:preview.customerId,asOf:preview.asOf,createdAt:now(),createdBy:actor,account:clone(preview.account),
        accountSha256:preview.accountSha256,sourceSha256:preview.sourceSha256,invoiceSources:preview.invoiceSources,...retained};
      (data.customerAccountPublications??=[]).push(row);return{customerAccountId:row.id};
    });
  }
  _receivedPreview(value){
    const publication=this.publication(value.publicationId);
    need(typeof value.responseText==='string'&&Buffer.byteLength(value.responseText)<=1_500_000,
      'CUSTOMER_RESPONSE_SIZE','Choose the complete customer response JSON, up to1.5 MB.');
    let raw;try{raw=JSON.parse(value.responseText);}catch{need(false,'INVALID_CUSTOMER_RESPONSE_JSON','The customer response must be complete JSON.');}
    const response=normalizeCustomerResponse(raw,publication),sourceSha256=sha(value.responseText);
    const existing=customerAccountData(this.receivables.data()).responses.find(row=>row.id===response.id);
    need(!existing||existing.sourceSha256===sourceSha256,'CUSTOMER_RESPONSE_ID_REUSED','This response identifier already has different original bytes. Keep both editions with separate response identifiers.',409);
    const result={schema:CUSTOMER_RESPONSE_SCHEMA,workspaceId:this.workspaceId(),revision:this.workspace.state.revision,
      publication:accountPublicationSummary(publication),response,sourceSha256,existingResponseId:existing?.id??null};
    return{...result,reviewSha256:sha(json(result))};
  }
  async previewReceive(value){return this.workspace.serial(async()=>this._receivedPreview(value));}
  async receive(value){
    this.guard(value);
    return this.receivables._mutate('customer_account_response_received',value,async(data,actor)=>{
      const preview=this._receivedPreview(value);
      need(value.reviewSha256===preview.reviewSha256,'CUSTOMER_RESPONSE_PREVIEW_CHANGED','Review the complete received response before retaining it.',409);
      if(preview.existingResponseId)return{customerResponseId:preview.existingResponseId,customerAccountId:preview.publication.id};
      const retained=await retainedFiles(this.workspace,[asFile('received-response.json',value.responseText)]);
      const row={id:preview.response.id,publicationId:preview.publication.id,customerId:preview.publication.customerId,
        customerName:preview.publication.customerName,response:preview.response,sourceSha256:preview.sourceSha256,
        version:1,receivedAt:now(),receivedBy:actor,decisions:[],...retained};
      (data.customerAccountResponses??=[]).push(row);return{customerResponseId:row.id,customerAccountId:row.publicationId};
    });
  }
  async detail(id){
    return this.workspace.serial(async()=>{
      const response=this.response(id),publication=this.publication(response.publicationId);
      return{workspaceId:this.workspaceId(),revision:this.workspace.state.revision,response:clone(response),
        publication:accountPublicationSummary(publication),account:clone(publication.account),
        currentInvoices:response.response.items.map(item=>item.invoiceId).filter((id,i,a)=>a.indexOf(id)===i)
          .map(invoiceId=>({invoiceId,collectionCaseId:collectionRows(this.receivables.data()).find(row=>row.invoiceId===invoiceId)?.id??null}))};
    });
  }
  _decisionPreview(id,value){
    const response=this.response(id),publication=this.publication(response.publicationId);
    return customerResponseReview({data:this.receivables.data(),publication,response,workspaceId:this.workspaceId(),
      revision:this.workspace.state.revision,value});
  }
  async previewDecision(id,value){return this.workspace.serial(async()=>this._decisionPreview(id,value));}
  async decide(id,value){
    this.guard(value);identifier(id,'customer response');
    return this.receivables._mutate('customer_account_response_reviewed',{...value,customerResponseId:id},async(data,actor)=>{
      const review=this._decisionPreview(id,value);
      need(value.reviewSha256===review.reviewSha256,'CUSTOMER_RESPONSE_REVIEW_CHANGED','Review the current invoice, collection case and complete customer entry before saving.',409);
      const response=this.response(id),collections=this.receivables.collectionsWorkspace;
      let caseId=review.collectionCase?.id??null;const events=[];
      for(const operation of review.operations){
        let result;
        if(operation.kind==='OPEN')result=collections.saveInTransaction(data,actor,operation);
        else if(operation.kind==='REOPEN')result=collections.transitionInTransaction(data,actor,caseId,
          {...operation,expectedVersion:collections.row(caseId).version},'REOPEN');
        else result=collections.activityInTransaction(data,actor,caseId,
          {...operation.value,expectedVersion:collections.row(caseId).version});
        caseId=result.collectionCaseId;if(result.collectionEventId)events.push(result.collectionEventId);
      }
      const decision={id:randomUUID(),entryId:review.entry.id,...review.choice,recordedAt:now(),actor,
        reviewSha256:review.reviewSha256,review:clone(review),collectionCaseId:caseId,collectionEventIds:events};
      response.decisions.push(decision);response.version++;
      return{customerResponseId:id,customerAccountId:response.publicationId,customerResponseDecisionId:decision.id,
        ...(caseId?{collectionCaseId:caseId,collectionAsOf:review.choice.effectiveDate}:{})};
    });
  }
  async _publicationFiles(row){return Promise.all(Object.keys(row.files).map(name=>readRetained(this.workspace,row,name)));}
  async publicationFile(id,name){
    return this.workspace.serial(async()=>{
      const row=this.publication(id);
      if(name==='account.tar')return{name:'customer-account-'+row.id+'.tar',type:'application/x-tar',bytes:renderCustomerTar(await this._publicationFiles(row))};
      return readRetained(this.workspace,row,name);
    });
  }
  async responseFile(id,name){
    return this.workspace.serial(async()=>{
      const response=this.response(id),publication=this.publication(response.publicationId);
      const originals=await this._publicationFiles(publication),received=await readRetained(this.workspace,response,'received-response.json');
      const files=[...originals,received,asFile('merchant-review.json',{response:clone(response),publication:accountPublicationSummary(publication)}),
        asFile('merchant-review.html',customerResponseDecisionHtml(publication,response),'text/html; charset=utf-8')];
      files.push(asFile('response-manifest.json',{schema:'stellar-forge.merchant-customer-response-delivery.v1',
        responseId:id,publicationId:publication.id,files:Object.fromEntries(files.map(file=>[file.name,{bytes:file.bytes.length,sha256:sha(file.bytes)}]))}));
      if(name==='response.tar')return{name:'customer-response-'+id+'.tar',type:'application/x-tar',bytes:renderCustomerTar(files)};
      const selected=files.find(file=>file.name===name);
      need(selected,'CUSTOMER_RESPONSE_FILE_NOT_FOUND','Choose an original customer response or complete review file.',404);return selected;
    });
  }
  async operation(requestId){
    return this.workspace.serial(async()=>{
      const id=field(requestId,'request ID',160),row=this.receivables.data().requests.find(item=>item.id===id&&item.action.startsWith('customer_account_'));
      return{workspaceId:this.workspaceId(),revision:this.workspace.state.revision,operation:row?clone(row):null,
        ...(row?this.receivables._result(row.result):{})};
    });
  }
}
