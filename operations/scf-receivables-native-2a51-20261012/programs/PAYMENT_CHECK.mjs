#!/usr/bin/env node
// One complete private invoice collection exercise. Official SDK XDR fixtures; no signing or submission.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {randomUUID, createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {openAccountingWorkspace} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/store.mjs';
import {ReceivablesWorkspace} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/store.mjs';
import {prepareReceivablesServer} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/server.mjs';
import {ReceivablesClient} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/client.mjs';
import {decodeInvoiceStellarTransfer, verifyInvoiceStellarTransfer} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/payment-requests-verifier.mjs';

const sourceRoot=dirname(fileURLToPath(import.meta.url));
const requireSdk=createRequire(process.env.SCF_INVOICE_SDK_PACKAGE ||
  new URL('./stellar/scf-starforge-20261009/sf88-operator-buyer-cli/package.json',import.meta.url));
const sdk=requireSdk('@stellar/stellar-sdk/base');
const sdkVersion=JSON.parse(await readFile(join(dirname(requireSdk.resolve('@stellar/stellar-sdk')),'../../package.json'),'utf8')).version;
const xdr=sdk.xdr, i64=value=>xdr.Int64.fromString(String(value));
const hash=value=>createHash('sha256').update(value).digest('hex');
const syntaxFiles=['payment-requests.mjs','payment-requests-workspace.mjs','payment-requests-verifier.mjs',
  'store.mjs','server.mjs','client.mjs','cli.mjs','public/payment-requests.mjs','public/app.mjs'];
for(const name of syntaxFiles){
  const path=join(sourceRoot,'stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables',name);
  const checked=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr||checked.error?.message||path);
}
const payer=sdk.Keypair.random().publicKey(), destination=sdk.Keypair.random().publicKey();
const issuer=sdk.Keypair.random().publicKey(), feePayer=sdk.Keypair.random().publicKey();
let sequence=1;
function fixture(proposal,{kind='payment',bump=false,lookupInner=false,actualAtomic=proposal.amountAtomic,wrongMemo=false}={}){
  const asset=proposal.asset.kind==='native'?sdk.Asset.native():new sdk.Asset(proposal.asset.code,proposal.asset.issuer);
  let operation;
  if(kind==='pathPaymentStrictSend'){
    operation=sdk.Operation.pathPaymentStrictSend({sendAsset:sdk.Asset.native(),sendAmount:'1',
      destination:proposal.destination,destAsset:asset,destMin:'8',path:[]});
  }else if(kind==='pathPaymentStrictReceive'){
    operation=sdk.Operation.pathPaymentStrictReceive({sendAsset:sdk.Asset.native(),sendMax:'1',
      destination:proposal.destination,destAsset:asset,destAmount:proposal.stellarAmount,path:[]});
  }else{
    operation=sdk.Operation.payment({destination:proposal.destination,asset,amount:proposal.stellarAmount});
  }
  const memo=wrongMemo?sdk.Memo.hash(Buffer.alloc(32,7)):
    proposal.memo.type==='MEMO_TEXT'?sdk.Memo.text(proposal.memo.value):
    proposal.memo.type==='MEMO_ID'?sdk.Memo.id(proposal.memo.value):
    proposal.memo.type==='MEMO_RETURN'?sdk.Memo.returnHash(Buffer.from(proposal.memo.value,'base64')):
    sdk.Memo.hash(Buffer.from(proposal.memo.value,'base64'));
  const inner=new sdk.TransactionBuilder(new sdk.Account(payer,String(sequence++)),
    {fee:'100',networkPassphrase:proposal.networkPassphrase}).addOperation(operation).addMemo(memo).setTimeout(0).build();
  const outer=bump?sdk.TransactionBuilder.buildFeeBumpTransaction(feePayer,'100',inner,proposal.networkPassphrase):inner;
  let resultValue;
  if(kind==='payment')resultValue=xdr.PaymentResult.paymentSuccess();
  else{
    const last=new xdr.SimplePaymentResult({
      destination:xdr.AccountId.publicKeyTypeEd25519(sdk.StrKey.decodeEd25519PublicKey(proposal.destination)),
      asset:asset.toXDRObject(),amount:i64(actualAtomic)});
    resultValue=kind==='pathPaymentStrictSend'
      ?xdr.PathPaymentStrictSendResult.pathPaymentStrictSendSuccess(new xdr.PathPaymentStrictSendResultSuccess({offers:[],last}))
      :xdr.PathPaymentStrictReceiveResult.pathPaymentStrictReceiveSuccess(new xdr.PathPaymentStrictReceiveResultSuccess({offers:[],last}));
  }
  const opResult=xdr.OperationResult.opInner(xdr.OperationResultTr[kind](resultValue));
  const result=bump?xdr.TransactionResultResult.txFeeBumpInnerSuccess(new xdr.InnerTransactionResultPair({
    transactionHash:inner.hash(),result:new xdr.InnerTransactionResult({feeCharged:i64(0),
      result:xdr.InnerTransactionResultResult.txSuccess([opResult]),ext:new xdr.InnerTransactionResultExt(0)})}))
    :xdr.TransactionResultResult.txSuccess([opResult]);
  const transaction=(lookupInner?inner:outer).hash().toString('hex');
  return {transaction,outerHash:outer.hash().toString('hex'),innerHash:inner.hash().toString('hex'),
    response:{status:'SUCCESS',txHash:transaction,ledger:123456,createdAt:String(Math.floor(Date.now()/1000)),
      envelopeXdr:outer.toEnvelope().toXDR('base64'),
      resultXdr:new xdr.TransactionResult({feeCharged:i64(bump?200:100),result,ext:new xdr.TransactionResultExt(0)}).toXDR('base64')}};
}
const responses=new Map();
let rpcCalls=0;
const verifier=({request,returned})=>verifyInvoiceStellarTransfer({request,returned,sdk,
  fetchImpl:async(_url,options)=>{
    rpcCalls++;
    const body=JSON.parse(options.body);
    const result=body.method==='getNetwork'?{passphrase:request.networkPassphrase,protocolVersion:23}:
      responses.get(body.params.hash)||{status:'NOT_FOUND',latestLedger:123456,oldestLedger:123400};
    return Response.json({jsonrpc:'2.0',id:body.id,result});
  }});
const temporary=await mkdtemp(join(process.env.SCF_INVOICE_CHECK_TMP||tmpdir(),'scf-invoice-check-'));
let workspace,service;
const workflows=[];
try{
  const directory=join(temporary,'accounting'),outboxDir=join(temporary,'outbox'),
    proofDir=join(temporary,'proofs'),termsFile=join(temporary,'terms.json');
  await mkdir(outboxDir,{mode:0o700});await mkdir(proofDir,{mode:0o700});
  await writeFile(termsFile,JSON.stringify({schema:'stellar-forge.merchant-accounting-terms.v1',routes:[{
    routeId:'invoice-check',method:'GET',network:'stellar:testnet',asset:sdk.StrKey.encodeContract(Buffer.alloc(32,1)),
    payTo:destination,amountAtomic:'1000000',unitPriceUsd:'1',unitCostUsd:null,priceBasis:'Private product check'
  }]}),{mode:0o600});
  workspace=await openAccountingWorkspace({directory,outboxDir,proofDir,termsFile});
  service=await prepareReceivablesServer({workspace,port:0,includeCustomerStatements:false});
  let r=service.receivables;
  r.paymentRequestWorkspace.verifyTransfer=verifier;
  const url=await service.listen();
  const client=new ReceivablesClient({baseUrl:new URL('/api/receivables',url).href});
  const actor='2A51 focused product check';
  const op=value=>({revision:workspace.state.revision,actor,requestId:randomUUID(),...value});
  const customer=(await r.saveCustomer({revision:workspace.state.revision,actor,
    reference:'INVOICE-CHECK',name:'Invoice collection customer'})).customer;
  await client.settings(op({name:'Invoice collection merchant',invoicePrefix:'CHECK',creditPrefix:'CR'}));
  const date=new Date().toISOString().slice(0,10),currency={code:'USD',scale:2};
  const saved=await client.saveDraft(op({customerId:customer.id,currency,issueDate:date,dueDate:date,
    lines:[{id:'service',description:'Implementation service',quantity:'1',unitAmount:'100.00'}]}));
  const invoiceId=saved.invoice.id,preview=await client.preview(invoiceId);
  await client.issue(invoiceId,op({expectedVersion:preview.expectedVersion,previewSha256:preview.previewSha256}));
  const originalInvoiceHash=hash((await r.file(invoiceId,'invoice.json')).bytes);
  workflows.push('Original customer, reviewed USD 100.00 invoice and retained invoice document through HTTP');
  async function issuePayment(overrides={}){
    const reviewed=await client.previewPaymentRequest(invoiceId,{network:'stellar:pubnet',destination,
      asset:{kind:'native'},stellarAmount:'10',invoiceAmount:'30.00',
      valuationNote:'Explicit customer collection terms for this private check.',...overrides});
    const created=await client.createPaymentRequest(invoiceId,op({proposal:reviewed.proposal,reviewSha256:reviewed.reviewSha256}));
    return {id:created.paymentRequest.id,proposal:reviewed.proposal};
  }
  const a=await issuePayment();
  assert.match(a.proposal.uri,/^web\+stellar:pay\?/);
  assert.ok(!a.proposal.uri.includes('network_passphrase='));
  const originalRequestHash=hash((await r.paymentRequestFile(a.id,'payment-request.json')).bytes);
  const txA=fixture(a.proposal);
  const returnA=(await client.reportPaymentReturn(a.id,op({transaction:txA.transaction}))).paymentReturn.id;
  const notFound=await client.receivePaymentRequest(a.id,op({returnId:returnA}));
  assert.equal(notFound.paymentRequest.status,'NOT_FOUND');assert.equal(r.data().receipts.length,0);
  responses.set(txA.transaction,txA.response);
  const receiveA=op({returnId:returnA}),receivedA=await client.receivePaymentRequest(a.id,receiveA);
  assert.equal(receivedA.paymentRequest.status,'SATISFIED');assert.equal(receivedA.receipt.amount,'30.00');
  assert.equal(receivedA.invoice.amountDue,'70.00');
  const callsBeforeReplay=rpcCalls,replayed=await client.receivePaymentRequest(a.id,receiveA);
  assert.equal(replayed.operation.replayed,true);assert.equal(rpcCalls,callsBeforeReplay);
  workflows.push('Public-network XLM request; optional payer; NOT_FOUND followed by receipt/allocation; original request replay');

  const b=await issuePayment({invoiceAmount:'20.00',stellarAmount:'9.9999999',asset:{kind:'credit',code:'USDC',issuer}});
  const txB=fixture(b.proposal,{kind:'pathPaymentStrictSend',bump:true,lookupInner:true});
  responses.set(txB.transaction,txB.response);
  const returnB=(await client.reportPaymentReturn(b.id,op({transaction:txB.transaction}))).paymentReturn.id;
  const receivedB=await client.receivePaymentRequest(b.id,op({returnId:returnB}));
  assert.equal(receivedB.receipt.amount,'20.00');assert.equal(receivedB.invoice.amountDue,'50.00');
  assert.ok(receivedB.receipt.source.transactionFingerprints.includes(hash(txB.outerHash)));
  assert.ok(receivedB.receipt.source.transactionFingerprints.includes(hash(txB.innerHash)));
  const strictReceive=fixture(b.proposal,{kind:'pathPaymentStrictReceive'});
  const decoded=await decodeInvoiceStellarTransfer({request:b.proposal,returned:{transaction:strictReceive.transaction},
    transactionResponse:strictReceive.response,sdk});
  assert.equal(decoded.amountAtomic,'99999999');
  const insufficient=fixture(b.proposal,{kind:'pathPaymentStrictSend',actualAtomic:'80000000'});
  await assert.rejects(()=>decodeInvoiceStellarTransfer({request:b.proposal,returned:{transaction:insufficient.transaction},
    transactionResponse:insufficient.response,sdk}),{code:'CLASSIC_PAYMENT_TERMS_MISMATCH'});
  const wrongMemo=fixture(b.proposal,{wrongMemo:true});
  await assert.rejects(()=>decodeInvoiceStellarTransfer({request:b.proposal,returned:{transaction:wrongMemo.transaction},
    transactionResponse:wrongMemo.response,sdk}),{code:'CLASSIC_PAYMENT_MEMO_MISMATCH'});
  workflows.push('Issued asset; fee-bump inner-hash RPC lookup; both hash aliases; exact strict-send and strict-receive result amounts');

  const c=await issuePayment({invoiceAmount:'10.00',stellarAmount:'2'});
  await assert.rejects(()=>client.reportPaymentReturn(c.id,op({transaction:txB.outerHash})),
    {code:'STELLAR_PAYMENT_ALREADY_RECORDED'});
  await client.cancelPaymentRequest(c.id,op({reason:'Replaced collection instructions'}));
  const cancelled=await client.paymentRequests({invoiceId,status:'CANCELLED',limit:1});
  assert.equal(cancelled.total,1);assert.equal(cancelled.items.length,1);assert.equal(cancelled.items[0].id,c.id);
  assert.equal((await client.paymentRequests({invoiceId,status:'CANCELLED',offset:1,limit:1})).items.length,0);
  workflows.push('Fee-bump outer-alias duplicate rejection, cancellation and status-filtered paging');

  const t=await issuePayment({network:'stellar:testnet',invoiceAmount:'10.00',stellarAmount:'1'});
  assert.ok(t.proposal.uri.includes('network_passphrase='));
  const txT=fixture(t.proposal);responses.set(txT.transaction,txT.response);
  const returnT=(await client.reportPaymentReturn(t.id,op({transaction:txT.transaction}))).paymentReturn.id;
  const observedT=await client.receivePaymentRequest(t.id,op({returnId:returnT}));
  assert.equal(observedT.paymentRequest.status,'TESTNET_VERIFIED');
  assert.equal(r.data().receipts.length,2);assert.equal((await client.detail(invoiceId)).invoice.amountDue,'50.00');
  workflows.push('Test-network proof observed while commercial customer balance stays USD 50.00');

  const proofA=JSON.parse(await (await client.paymentRequestFile(a.id,'proof-'+returnA+'.json')).text());
  assert.equal(proofA.returned.observations[1].verification.proof.transactionResponse.envelopeXdr,txA.response.envelopeXdr);
  const receivingB=JSON.parse(await (await client.paymentRequestFile(b.id,'receiving.json')).text());
  assert.equal(receivingB.returns[0].observations[0].verification.proof.transactionResponse.envelopeXdr,txB.response.envelopeXdr);
  assert.ok(!JSON.stringify(workspace.state.receivables).includes('"envelopeXdr":'));
  assert.equal(hash((await r.paymentRequestFile(a.id,'payment-request.json')).bytes),originalRequestHash);
  assert.equal(hash((await r.file(invoiceId,'invoice.json')).bytes),originalInvoiceHash);
  const assetResponse=await fetch(new URL('payment-requests.mjs',url));
  assert.equal(assetResponse.status,200);assert.match(await assetResponse.text(),/createPaymentRequestUi/);
  const stateBytes=Buffer.byteLength(JSON.stringify(workspace.state));
  workflows.push('Retained native proof hydrated through HTTP; compact journal; unchanged issued documents; browser module served');

  await service.close();service=null;await workspace.close();workspace=null;
  workspace=await openAccountingWorkspace({directory});
  r=await new ReceivablesWorkspace(workspace,{verifyInvoiceTransfer:verifier}).init();
  assert.equal((await r.detail(invoiceId)).invoice.amountDue,'50.00');
  assert.equal((await r.paymentRequest(t.id)).paymentRequest.status,'TESTNET_VERIFIED');
  assert.equal(hash((await r.paymentRequestFile(a.id,'payment-request.json')).bytes),originalRequestHash);
  const reopenedB=JSON.parse((await r.paymentRequestFile(b.id,'receiving.json')).bytes.toString());
  assert.equal(reopenedB.returns[0].receiptId,receivedB.receipt.id);
  workflows.push('Original accounting workspace closed and reopened with balances, payment state, receipts and proof downloads intact');
  const result={result:'PASS',runtime:process.version,stellarSdk:sdkVersion,
    fixtureSource:'Official Stellar SDK-generated transaction and result XDR delivered through the original RPC transport',
    syntaxFiles:syntaxFiles.length,workflows,currency:'USD',invoiceTotal:'100.00',receiptsTotal:'50.00',
    amountDue:'50.00',receipts:2,testnetCommercialCredits:0,workspaceStateBytes:stateBytes,rpcFixtureCalls:rpcCalls};
  await writeFile(join(sourceRoot,'PAYMENT_CHECK_RESULT.json'),JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}finally{
  if(service)await service.close().catch(()=>{});
  if(workspace)await workspace.close().catch(()=>{});
  await rm(temporary,{recursive:true,force:true});
}
