// MIT. TokenJunkieLabs. Continue the original retained 2A51 customer receiving case.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,link,unlink,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {privateSupportDirectory,writePrivate} from '../../stellar-forge/mcp-merchant-operator/config.mjs';
import {prepareAccountingReceivablesOperation,runAccountingReceivablesOperation,
  downloadAccountingReceivablesFile} from '../../stellar-forge/mcp-merchant-operator/accounting-receivables-cli.mjs';
import {readDurableCaseInput,createDurableCustomerCase,captureDurableCustomerCase} from './durable-customer-case.mjs';

const SCHEMA='stellar-forge.receivables-retained-followup.v1';
const OPERATION='SCF-RECEIVABLES-NATIVE-2A51-20261012';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/, SHA=/^[a-f0-9]{64}$/;
const json=value=>JSON.stringify(value,null,2)+'\n';
const sha=value=>createHash('sha256').update(value).digest('hex');
function need(ok,message){if(!ok)throw Object.assign(new Error(message),{code:'RETAINED_CUSTOMER_FOLLOWUP'});}
async function exists(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function privateDir(path){path=resolve(path);await privateSupportDirectory(path);const st=await lstat(path);
  need(st.isDirectory()&&!st.isSymbolicLink()&&!(st.mode&0o077)&&(!process.getuid||st.uid===process.getuid())&&await realpath(path)===path,
    'Use the original owner-controlled private customer case directory.');return path;}
async function sync(path){const fd=await open(path,constants.O_RDONLY|(constants.O_DIRECTORY??0));try{await fd.sync();}finally{await fd.close();}}
async function save(path,value){const body=typeof value==='string'?value:json(value);await privateDir(dirname(path));
  if(await exists(path)){const fd=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
    try{const st=await fd.stat();need(st.isFile()&&st.nlink===1&&!(st.mode&0o077)&&(!process.getuid||st.uid===process.getuid())&&st.size===Buffer.byteLength(body),
      'A retained follow-up source file changed.');need((await fd.readFile()).equals(Buffer.from(body)),'A retained follow-up source file changed.');return;}finally{await fd.close();}}
  const temporary=path+'.'+randomUUID()+'.partial';const fd=await open(temporary,'wx',0o600);
  try{await fd.writeFile(body);await fd.sync();await fd.close();await link(temporary,path);await unlink(temporary);await sync(dirname(path));}
  catch(error){await fd.close().catch(()=>{});await unlink(temporary).catch(()=>{});throw error;}}
async function replace(path,value){const temporary=path+'.'+randomUUID()+'.next';await writePrivate(temporary,value);
  try{await rename(temporary,path);await sync(dirname(path));}finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}}
function after(date,days){const at=new Date(date+'T00:00:00Z');at.setUTCDate(at.getUTCDate()+days);return at.toISOString().slice(0,10);}
function selection(value){
  need(value.originalOperation===OPERATION&&UUID.test(value.customerId??'')&&UUID.test(value.originalInvoiceId??'')&&SHA.test(value.workspaceId??''),
    'Continue the original retained customer and invoice from the 2A51 receiving operation.');
  need(typeof value.actor==='string'&&value.actor.trim()&&value.actor.length<=1000,'Keep the responsible receiving operator.');
  need(typeof value.accountDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.accountDate)&&
    new Date(value.accountDate+'T00:00:00Z').toISOString().slice(0,10)===value.accountDate,'Keep the original account date.');
  const url=new URL(value.url);need(!url.username&&!url.password&&!url.search&&!url.hash&&
    (url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','[::1]'].includes(url.hostname)),'Use the original merchant endpoint.');
  need(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.workspace??'')&&/^[A-Z][A-Z0-9_]{3,63}$/.test(value.tokenEnv??''),'Keep the original merchant alias and token reference.');
  return{schema:SCHEMA,originalOperation:OPERATION,customerId:value.customerId,originalInvoiceId:value.originalInvoiceId,
    workspaceId:value.workspaceId,actor:value.actor,accountDate:value.accountDate,url:url.href,workspace:value.workspace,tokenEnv:value.tokenEnv};
}

/**
 * Adds one complete, explicitly authored demonstration order to the original private receiving customer.
 * All financial records are written through the existing merchant MCP provider and durable CLI.
 * No external message or bank/network request is performed by this continuation.
 * Call again with the same directory and original selection to recover the saved requests.
 */
export async function continueRetainedCustomerFollowup({directory,client,signal,...input}={}){
  const selected=selection(input);directory=await privateDir(directory);
  need(client?.workspace===selected.workspace&&(!client.endpoint||client.endpoint===selected.url),'Borrow the original customer MCP connection.');
  const lease=await acquireStateLease(directory);let error;
  try{
    await save(join(directory,'selection.json'),selected);
    await client.open({requestSignal:signal});
    const current=await client.status({customerId:selected.customerId,asOf:selected.accountDate},{requestSignal:signal});
    need(current.workspaceId===selected.workspaceId,'The selected accounting workspace changed.');
    const original=await client.invoice({invoiceId:selected.originalInvoiceId},{requestSignal:signal});
    need(original.invoice.customerId===selected.customerId&&original.invoice.status==='ISSUED',
      'The original issued invoice must still belong to this receiving customer.');
    need(original.invoice.paymentStatus==='PAID'&&/^0(?:\.0+)?$/.test(original.invoice.amountDue),
      'Continue from the original paid implementation invoice before recording its follow-up approval.');
    const statePath=join(directory,'flow.json');let flow;
    if(await exists(statePath))flow=await readDurableCaseInput(statePath,8_000_000);
    else{flow={schema:SCHEMA,selectionSha256:sha(json(selected)),startedAt:new Date().toISOString(),steps:{},
      ids:{publication:randomUUID(),response:randomUUID(),promiseEntry:randomUUID(),paymentEntry:randomUUID(),updatedPublication:randomUUID()}};
      await save(statePath,flow);}
    need(flow.schema===SCHEMA&&flow.selectionSha256===sha(json(selected)),'Keep this original follow-up selection and request journal.');
    const completedPath=join(directory,'followup.json');
    if(await exists(completedPath)){const result=await readDurableCaseInput(completedPath,32_000_000);
      need(result.selectionSha256===flow.selectionSha256&&result.customerId===selected.customerId,'The retained follow-up completion changed.');
      return{directory,result,replayed:true};}
    for(const name of ['operations','preparations','documents'])await privateDir(join(directory,name));
    const common={url:selected.url,workspace:selected.workspace,tokenEnv:selected.tokenEnv};
    const opts={requestSignal:signal},currency={code:'USD',scale:2},date=selected.accountDate,actor=selected.actor;
    const requestIds=[];
    async function step(name,kind,build){
      signal?.throwIfAborted();lease.assertHeld();const target=join(directory,'operations',name),requestPath=join(target,'request.json');
      if(!await exists(requestPath)){
        need(!await exists(target),'A published original operation lost its request. Preserve that directory and recover its original source.');
        const preparationRoot=join(directory,'preparations'),intentPath=join(preparationRoot,name+'.json'),stage=join(preparationRoot,name);
        let intent;
        if(await exists(intentPath))intent=await readDurableCaseInput(intentPath,128_000_000);
        else{
          // Freeze complete original preview/arguments before the original preparer creates any files.
          const built=await build(),requestId=flow.steps[name]?.requestId??randomUUID();
          intent={schema:SCHEMA+'.preparation',name,kind,requestId,selectionSha256:flow.selectionSha256,
            preparation:{...common,kind,...(built.preview?{preview:built.preview,actor,requestId,
              ...(built.reviewOptions?{reviewOptions:built.reviewOptions}:{})}:{arguments:{...built.arguments,actor,requestId}})}};
          await save(intentPath,intent);
        }
        need(intent.schema===SCHEMA+'.preparation'&&intent.name===name&&intent.kind===kind&&
          intent.selectionSha256===flow.selectionSha256&&
          (!flow.steps[name]||flow.steps[name].requestId===intent.requestId)&&
          intent.preparation.url===selected.url&&intent.preparation.workspace===selected.workspace&&
          intent.preparation.tokenEnv===selected.tokenEnv&&intent.preparation.kind===kind,
          'The retained original preparation belongs to another step or customer.');
        flow.steps[name]={kind,requestId:intent.requestId,status:'PREPARING'};await replace(statePath,flow);
        async function prepared(){
          if(!await exists(join(stage,'request.json'))||!await exists(join(stage,'state.json')))return false;
          let request,state;
          try{request=await readDurableCaseInput(join(stage,'request.json'),128_000_000);
            state=await readDurableCaseInput(join(stage,'state.json'),32_000_000);}
          catch(problem){if(problem instanceof SyntaxError)return false;throw problem;}
          const {sha256,...content}=request;
          need(request.schema==='stellar-forge.accounting-receivables-client-request.v1'&&sha(JSON.stringify(content))===sha256&&
            request.kind===kind&&request.url===selected.url&&request.workspace===selected.workspace&&request.tokenEnv===selected.tokenEnv&&
            request.arguments.requestId===intent.requestId&&request.arguments.actor===actor&&
            (intent.preparation.preview?json(request.preview)===json(intent.preparation.preview):
              json(request.arguments)===json(intent.preparation.arguments))&&
            Object.entries(intent.preparation.reviewOptions??{}).every(([key,value])=>request.arguments[key]===value)&&
            state.schema==='stellar-forge.accounting-receivables-client-state.v1'&&state.requestSha256===sha256&&
            state.phase==='PREPARED'&&state.submissionAttempted===false,
            'The original staged operation changed. Preserve its request and state for recovery.');
          return true;
        }
        if(await exists(stage)&&!await prepared()){
          // This caller never submits a staged directory. Keep its interrupted bytes and reuse the frozen intent.
          await privateDir(stage);await rename(stage,join(preparationRoot,name+'.interrupted-'+randomUUID()));await sync(preparationRoot);
        }
        if(!await exists(stage))await prepareAccountingReceivablesOperation({directory:stage,...intent.preparation});
        need(await prepared(),'The original staged preparation is incomplete.');
        lease.assertHeld();need(!await exists(target),'The original operation was published concurrently.');
        await rename(stage,target);await sync(join(directory,'operations'));await sync(preparationRoot);
        flow.steps[name].status='PREPARED';await replace(statePath,flow);
      }
      const saved=await readDurableCaseInput(requestPath,128_000_000);
      need(saved.kind===kind&&saved.url===selected.url&&saved.workspace===selected.workspace&&
        (!flow.steps[name]||saved.arguments.requestId===flow.steps[name].requestId),'The original step request identity changed.');
      const result=await runAccountingReceivablesOperation({directory:target,execute:true,client,signal});
      need(result.found,'The original provider has not retained this customer step.');
      flow.steps[name]={kind,requestId:saved.arguments.requestId,status:'COMMITTED',result};
      await replace(statePath,flow);requestIds.push(saved.arguments.requestId);return result;
    }
    async function argumentsFor(values){return{arguments:{revision:(await client.status({},opts)).revision,...values}};}
    async function activity(name,caseId,values){return step(name,'collection_activity',async()=>{
      const row=await client.collectionCase({collectionCaseId:caseId,asOf:date},opts);
      return{arguments:{workspaceId:selected.workspaceId,revision:row.revision,collectionCaseId:caseId,
        expectedVersion:row.collectionCase.version,...values,effectiveDate:date,occurredDate:date}};
    });}
    const draft=await step('01-order','draft_save',()=>argumentsFor({customerId:selected.customerId,currency,
      issueDate:date,dueDate:after(date,7),purchaseOrder:'RETAINED-CUSTOMER-FOLLOWUP',
      sourceReference:'Original private 2A51 retained customer receiving programme',
      note:'Implementation follow-up order within the retained merchant demonstration.',
      lines:[{description:'Implementation and reporting handover',quantity:'1',unitAmount:'4800.00',discountAmount:'0.00',taxAmount:'0.00'}]}));
    const invoiceId=draft.invoice.id;
    const policy=await step('02-policy','credit_policy_save',()=>argumentsFor({workspaceId:selected.workspaceId,customerId:selected.customerId,currency,owner:actor,
      terms:{enabled:true,creditLimit:'6000.00',overdueDays:14,reviewDisputes:true,reviewEveryOrder:true},
      reason:'Explicit policy for this private receiving customer: review every order, USD 6000 limit, 14 overdue days and unresolved disputes.'}));
    const approval=await step('03-credit-decision','credit_decision_save',async()=>({
      preview:await client.previewCreditAssessment({workspaceId:selected.workspaceId,invoiceId},opts),
      reviewOptions:{outcome:'APPROVE',reason:'The prior implementation invoice is paid. Approve this USD 4800 order after reviewing the current customer account and selected policy.'}}));
    const issued=await step('04-issue','invoice_issue',async()=>({preview:await client.previewInvoice({invoiceId},opts),
      reviewOptions:{creditDecisionId:approval.creditDecision.id}}));
    const assigned=await step('05-followup','collection_save',()=>argumentsFor({workspaceId:selected.workspaceId,invoiceId,title:'Implementation order payment follow-up',owner:actor,
      priority:'HIGH',effectiveDate:date,nextActionDate:after(date,7),note:'Retain the customer account, agreed payment dates and delivery query together.'}));
    const collectionCaseId=assigned.collectionCase.id;
    await activity('06-contact',collectionCaseId,{kind:'CONTACT',channel:'EMAIL',direction:'OUTBOUND',
      contact:'Retained demonstration customer',note:'Private receiving scenario: invoice and implementation handover explained to the demonstration customer.',
      reference:'Original controlled receiving scenario; prepared correspondence'});
    await activity('07-promise',collectionCaseId,{kind:'PROMISE',amount:'3000.00',dueDate:after(date,14),
      note:'Initial demonstration payment commitment for the implementation order.',reference:'Original receiving conversation'});
    await activity('08-query',collectionCaseId,{kind:'DISPUTE',category:'DELIVERY',amount:'800.00',
      note:'Customer asks for clarification of the reporting handover deliverables.',reference:'Original receiving delivery query'});
    const assumptions={title:'Implementation order collection plan',owner:actor,asOf:date,through:after(date,60),bucket:'WEEK',
      customerId:selected.customerId,pastDueDelayDays:2,futureDelayDays:0,usePromises:true,disputes:'SEPARATE',overrides:[],
      note:'Use original invoice dates and recorded promises; retain the delivery query separately.'};
    const before=await step('09-initial-plan','cash_plan_save',async()=>({
      preview:await client.previewCashPlan({workspaceId:selected.workspaceId,plan:assumptions},opts)}));
    const publication=await step('10-customer-account','customer_account_publish',async()=>({
      preview:await client.previewCustomerAccount({customerId:selected.customerId,asOf:date,publicationId:flow.ids.publication},opts)}));
    const published=publication.customerAccount;
    const response={schema:'stellar-forge.merchant-customer-account-response.v1',id:flow.ids.response,
      account:{publicationId:published.id,workspaceId:selected.workspaceId,customerId:selected.customerId,
        sourceSha256:published.sourceSha256,accountSha256:published.accountSha256,asOf:published.asOf},
      responseDate:date,author:{name:'Retained demonstration customer',reference:'Original private receiving programme'},
      items:[{id:flow.ids.promiseEntry,invoiceId,kind:'PROMISE',amount:'2800.00',dueDate:after(date,21),
        note:'Please update the commitment to USD 2800 on the revised date. The remaining balance follows the original invoice terms.'},
      {id:flow.ids.paymentEntry,invoiceId,kind:'PAYMENT_NOTICE',amount:'1000.00',paymentDate:date,
        paymentReference:'RETAINED-FOLLOWUP-BANK-1000',note:'USD 1000 has been entered in the demonstration bank statement. Please match this reference before updating the account.'}]};
    const responseText=json(response);await save(join(directory,'documents','customer-response.json'),responseText);
    const received=await step('11-receive-response','customer_response_receive',async()=>({
      preview:await client.previewCustomerResponse({publicationId:published.id,responseText},opts)}));
    const receipt=await step('12-record-bank-entry','receipt_record',()=>argumentsFor({customerId:selected.customerId,currency,amount:'1000.00',
      receivedDate:date,method:'Bank transfer',reference:'RETAINED-FOLLOWUP-BANK-1000',
      note:'Controlled statement entry for the original private receiving programme; retained separately from the customer payment notice.'}));
    await step('13-match-bank-entry','allocate',()=>argumentsFor({invoiceId,receiptId:receipt.receipt.id,amount:'1000.00',allocatedDate:date}));
    async function review(name,entryId,extra,reason){return step(name,'customer_response_review',async()=>{
      const detail=await client.customerResponse({customerResponseId:received.customerResponse.id},opts);
      return{preview:await client.previewCustomerResponseReview({customerResponseId:detail.response.id,expectedVersion:detail.response.version,
        entryId,disposition:'RECORD',effectiveDate:date,acknowledgeChanges:true,reason,...extra},opts)};
    });}
    await review('14-review-promise',flow.ids.promiseEntry,{replaceOpenPromise:true},
      'Reviewed the USD 1000 original receipt allocation since publication; explicitly withdraw the earlier USD 3000 promise and record the customer’s revised USD 2800 commitment.');
    await review('15-review-payment-notice',flow.ids.paymentEntry,{},
      'Matched the customer reference to the separately recorded original receipt and allocation. Retain the incoming correspondence on the case.');
    const latestCase=await client.collectionCase({collectionCaseId,asOf:date},opts);
    await activity('16-resolve-query',collectionCaseId,{kind:'DISPUTE_RESOLUTION',disputeId:latestCase.collectionCase.dispute.id,
      note:'The demonstration reporting handover clarification is accepted; retain the original invoice amount and resolution history.',
      reference:'Original controlled receiving deliverables clarification'});
    const afterPlan=await step('17-updated-plan','cash_plan_save',async()=>{
      const currentPlan=await client.cashPlan({cashPlanId:before.cashPlan.id},opts);
      return{preview:await client.previewCashPlan({workspaceId:selected.workspaceId,plan:{...assumptions,
        note:'Original USD 1000 receipt is allocated, the delivery query is resolved, and the revised USD 2800 promise is retained.'}},opts),
        reviewOptions:{id:before.cashPlan.id,expectedVersion:currentPlan.cashPlan.version}};
    });
    const updated=await step('18-updated-customer-account','customer_account_publish',async()=>({
      preview:await client.previewCustomerAccount({customerId:selected.customerId,asOf:date,publicationId:flow.ids.updatedPublication},opts)}));
    const compare={leftId:before.cashPlan.id,leftEditionId:before.cashPlanEdition.id,
      rightId:afterPlan.cashPlan.id,rightEditionId:afterPlan.cashPlanEdition.id};
    const comparisonPath=join(directory,'documents','cash-plan-comparison.json');
    const comparison=await exists(comparisonPath)?await readDurableCaseInput(comparisonPath,32_000_000):await client.compareCashPlans(compare,opts);
    await save(comparisonPath,comparison);
    for(const file of ['comparison.csv']){
      const output=join(directory,'documents',file);
      if(!await exists(output))await downloadAccountingReceivablesFile({client,
        selection:{kind:'receivables-cash-plan-comparison',...compare,file},output,signal});
    }
    const finalInvoice=await client.invoice({invoiceId},opts),finalCase=await client.collectionCase({collectionCaseId,asOf:date},opts);
    const decision=await client.creditDecision({creditDecisionId:approval.creditDecision.id},opts);
    const returned=await client.customerResponse({customerResponseId:received.customerResponse.id},opts);
    const result={schema:SCHEMA,originalOperation:OPERATION,selectionSha256:flow.selectionSha256,customerId:selected.customerId,workspaceId:selected.workspaceId,
      accountDate:date,invoiceId,collectionCaseId,creditPolicyId:policy.creditPolicy.id,creditDecisionId:approval.creditDecision.id,
      publicationIds:[published.id,updated.customerAccount.id],responseId:received.customerResponse.id,receiptId:receipt.receipt.id,
      cashPlans:[{cashPlanId:before.cashPlan.id,editionId:before.cashPlanEdition.id},{cashPlanId:afterPlan.cashPlan.id,editionId:afterPlan.cashPlanEdition.id}],
      requestIds,invoice:finalInvoice.invoice,collectionCase:finalCase.collectionCase,creditDecision:decision.decision,
      customerResponse:returned.response,comparison,documents:join(directory,'documents'),
      issuedInvoice:issued.invoice,finishedAt:flow.finishedAt??new Date().toISOString()};
    // The final result retains the first complete operation observation. Future account work remains in native records.
    const final=join(directory,'followup.json');
    if(await exists(final)){const saved=await readDurableCaseInput(final,32_000_000);
      need(saved.selectionSha256===flow.selectionSha256&&saved.invoiceId===invoiceId&&saved.responseId===result.responseId,
        'The retained completion belongs to another follow-up operation.');return{directory,result:saved,replayed:true};}
    flow.finishedAt=result.finishedAt;flow.status='COMPLETE';await replace(statePath,flow);await save(final,result);
    return{directory,result,replayed:false};
  }catch(problem){error=problem;throw problem;}
  finally{try{await lease.close();}catch(problem){if(error)error.releaseError={code:problem.code,message:problem.message};else throw problem;}}
}


/** Recover the same saved follow-up and finish its complete customer/staff delivery after a programme interruption. */
export async function finishRetainedCustomerFollowup({directory,client,signal,...input}={}){
  const followed=await continueRetainedCustomerFollowup({directory,client,signal,...input});
  directory=followed.directory;const selected=selection(input),lease=await acquireStateLease(directory);let error;
  try{
    const resultPath=join(directory,'delivery.json');
    if(await exists(resultPath))return{...await readDurableCaseInput(resultPath,32_000_000),replayed:true};
    const deliveryPath=join(directory,'delivery-selection.json');let delivery;
    if(await exists(deliveryPath))delivery=await readDurableCaseInput(deliveryPath,1_000_000);
    else{delivery={schema:SCHEMA+'.delivery',selectionSha256:sha(json(selected)),caseId:randomUUID(),editionId:randomUUID(),
      directory:join(directory,'customer-case')};await save(deliveryPath,delivery);}
    need(delivery.schema===SCHEMA+'.delivery'&&delivery.selectionSha256===sha(json(selected))&&
      delivery.directory===join(directory,'customer-case')&&UUID.test(delivery.caseId)&&UUID.test(delivery.editionId),
      'Keep the original retained delivery selection.');
    const caseSelection={id:delivery.caseId,title:'Merchant implementation and payment follow-up',
      originalOperation:selected.originalOperation,url:selected.url,workspace:selected.workspace,tokenEnv:selected.tokenEnv,
      workspaceId:selected.workspaceId,customerId:selected.customerId,asOf:selected.accountDate,
      cashPlans:followed.result.cashPlans,requestIds:followed.result.requestIds};
    if(!await exists(join(delivery.directory,'case.json')))await createDurableCustomerCase({directory:delivery.directory,selection:caseSelection,client,signal});
    else{const existing=await readDurableCaseInput(join(delivery.directory,'case.json'),1_000_000);
      need(existing.id===delivery.caseId&&existing.workspaceId===selected.workspaceId&&existing.customerId===selected.customerId&&
        existing.url===selected.url&&existing.asOf===selected.accountDate&&
        json(existing.cashPlans)===json(caseSelection.cashPlans)&&json(existing.requestIds)===json(caseSelection.requestIds),
        'The original retained delivery case changed.');}
    const capture=await captureDurableCustomerCase({directory:delivery.directory,editionId:delivery.editionId,client,signal});
    const result={schema:SCHEMA+'.delivery-result',originalOperation:selected.originalOperation,
      followupDirectory:directory,caseDirectory:delivery.directory,caseId:delivery.caseId,editionId:delivery.editionId,
      index:join(capture.directory,'index.html'),customerDocuments:join(capture.directory,'customer'),
      staffRecords:join(capture.directory,'staff'),revision:capture.edition.revision,files:capture.edition.files.map(({path,bytes,sha256})=>({path,bytes,sha256}))};
    await save(resultPath,result);return{...result,replayed:false};
  }catch(problem){error=problem;throw problem;}
  finally{try{await lease.close();}catch(problem){if(error)error.releaseError={code:problem.code,message:problem.message};else throw problem;}}
}
