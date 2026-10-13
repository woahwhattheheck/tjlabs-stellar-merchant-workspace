// MIT. Continue one original accounting operation; caller owns workspace, clients and durable case files.
import {json,sha,need,identifier} from '../core.mjs';

/**
 * load(name) returns the exact earlier JSON value or null.
 * save(name,value) durably retains that complete JSON value before resolving.
 * Supply original ReceivablesClient/PaymentPlansClient, or their already-open
 * controllers. The original accounting owner retains its lease and lifecycle.
 * This function never starts a second server, substitutes a verifier or signs.
 */
export async function receiveInstallmentCollection({receivables,paymentPlans,selection,terms,actor,
  operationId,load,save,returned=null,receiveAttempt='first'}) {
  need(typeof load==='function'&&typeof save==='function','COLLECTION_RECEIVING_FILES','Supply original durable case readers and writers.');
  need(typeof actor==='string'&&actor.trim()&&typeof operationId==='string'&&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(operationId),'COLLECTION_RECEIVING_ID','Retain one original actor and operation ID.');
  need(typeof receiveAttempt==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/.test(receiveAttempt),
    'COLLECTION_RECEIVING_ATTEMPT','Retain an explicit original observation attempt of at most 24 letters, digits, underscores or hyphens.');
  identifier(selection?.invoiceId,'invoice');identifier(selection?.planId,'plan');identifier(selection?.editionId,'edition');
  identifier(terms?.id,'payment request');
  const original={schema:'stellar-forge.installment-collection-receiving.v1',operationId,actor,
    selection:structuredClone(selection),terms:structuredClone(terms)};
  const identity=sha(json(original)),prior=await load('original-input.json');
  if(prior)need(prior.sha256===identity&&json(prior.input)===json(original),'COLLECTION_RECEIVING_CHANGED',
    'Continue the same retained selection, wallet terms, actor and operation.',409);
  else await save('original-input.json',{sha256:identity,input:original});
  async function record(name,work) {
    const retained=await load(name+'.json');
    if(retained?.state==='COMPLETE')return retained.result;
    try {const result=await work();await save(name+'.json',{state:'COMPLETE',result});return result;}
    catch(error){await save(name+'.json',{state:'INCOMPLETE',error:{code:error.code??null,message:String(error.message),
      status:error.status??null,applied:error.applied??null,outcomeUnknown:error.outcomeUnknown??null}});throw error;}
  }
  async function mutation(name,method,args,value) {
    const filename=name+'-request.json';let request=await load(filename);
    if(!request){
      const state=await receivables.state();
      request={method,args:structuredClone(args),value:{...structuredClone(value),actor,requestId:operationId+'.'+name,revision:state.revision}};
      await save(filename,request);
    }
    need(request.method===method&&json(request.args)===json(args),'COLLECTION_RECEIVING_METHOD','Recover this original native operation.',409);
    // An incomplete attempt reconciles through its original native mutation journal, including a lost response.
    return record(name,()=>receivables[method](...request.args,request.value));
  }
  const source=await record('original-plan',()=>paymentPlans.detail(selection.planId));
  need(source.plan.invoiceId===selection.invoiceId,'COLLECTION_RECEIVING_INVOICE','The selected plan belongs to another original invoice.',409);
  const preview=await record('original-preview',()=>receivables.previewPaymentRequest(selection.invoiceId,
    {...terms,paymentPlan:{planId:selection.planId,editionId:selection.editionId,installments:selection.installments}}));
  const issued=await mutation('issue','createPaymentRequest',[selection.invoiceId],
    {proposal:preview.proposal,reviewSha256:preview.reviewSha256});
  const id=issued.paymentRequest.id;
  need(id===terms.id,'COLLECTION_RECEIVING_REQUEST','The retained native request identity changed.',409);
  // Reconciliation remains native even after this controller's completion record exists.
  const issueRequest=await load('issue-request.json');
  const replay=await receivables.createPaymentRequest(...issueRequest.args,issueRequest.value);
  need(replay.paymentRequest.id===id,'COLLECTION_RECEIVING_REPLAY','The original issue replay returned another request.',409);
  await save('issue-replay.json',{result:replay});

  let targetReturnId=null;
  if(returned){
    need(typeof returned.transaction==='string','COLLECTION_RECEIVING_RETURN','Supply the actual original wallet transaction.');
    const input={schema:'stellar-forge.installment-collection-wallet-return.v1',returned:structuredClone(returned)};
    const saved=await load('wallet-return-input.json');
    if(saved)need(json(saved)===json(input),'COLLECTION_RECEIVING_RETURN_CHANGED','Continue the same original returned transaction.',409);
    else await save('wallet-return-input.json',input);
    const reported=await mutation('return','reportPaymentReturn',[id],{transaction:returned.transaction,
      ...(returned.payer?{payer:returned.payer}:{}),note:returned.note??''});
    targetReturnId=reported.paymentReturn.id;
    await mutation('receive-'+receiveAttempt,'receivePaymentRequest',[id],{returnId:reported.paymentReturn.id,
      allocate:returned.allocate!==false,...(returned.allocationAmount?{allocationAmount:returned.allocationAmount}:{}),
      ...(returned.allocatedDate?{allocatedDate:returned.allocatedDate}:{}),note:returned.note??''});
  }
  const detail=await receivables.paymentRequest(id),plan=await paymentPlans.detail(selection.planId);
  need(json(detail.proposal)===json(preview.proposal),'COLLECTION_RECEIVING_SOURCE','The exact issued proposal changed.',409);
  const inventory=[];
  for(const name of ['payment-request.json','payment-request.html','payment-request.uri','status.json','receiving.json',
    ...detail.returns.map(row=>'proof-'+row.id+'.json')]){
    let value;
    if(typeof receivables.paymentRequestBytes==='function') value=await receivables.paymentRequestBytes(id,name);
    else value=await receivables.paymentRequestFile(id,name);
    need(typeof value?.arrayBuffer==='function'||value?.bytes instanceof Uint8Array,
      'COLLECTION_RECEIVING_FILE','Use the original complete byte file or HTTP Response.');
    const bytes=typeof value.arrayBuffer==='function'?Buffer.from(await value.arrayBuffer()):Buffer.from(value.bytes);
    const row={name,bytes:bytes.length,sha256:sha(bytes),type:value.type??value.headers?.get('content-type')??null,contentBase64:bytes.toString('base64')};
    await save('files/'+name+'.source.json',row);inventory.push({name,bytes:row.bytes,sha256:row.sha256,type:row.type});
  }
  const returnedRecord=returned?detail.returns.find(row=>row.id===targetReturnId):null;
  const observation=returnedRecord?.observations?.at(-1)??null;
  const result={schema:'stellar-forge.installment-collection-native-receiving.v1',operationId,inputSha256:identity,
    state:!returned?'REQUEST_ISSUED_AWAITING_WALLET':returnedRecord?.receiptId?'PAYMENT_RECEIVED':observation?.status??'AWAITING_VERIFICATION',
    receiveAttempt:returned?receiveAttempt:null,latestObservation:observation,
    paymentRequestId:id,invoiceId:selection.invoiceId,originalPlan:source,preview,issued,
    currentRequest:detail,currentPlan:plan,files:inventory};
  await save('complete-receiving.json',result);
  return result;
}
