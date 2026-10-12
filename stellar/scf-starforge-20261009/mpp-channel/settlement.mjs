import { dependencyRootFor } from './runtime.mjs';
import { assertOperating } from './receiving.mjs';
// MIT. Close the retained native channel commitment with one persisted signed Stellar transaction.
import { requireValue as need, hash, stable, now, id } from '../mpp-charge/storage.mjs';
import { merchantConfig, profileKey, streamKey, amount, publicURL } from './config.mjs';
import { groups, serialChannel } from './state.mjs';
import { loadChannelNative, observeChannel, nativeStore, merchantCumulativeKey, settlingKey, closedKey,
  networkPassphrase } from './runtime.mjs';
import { terminalConsent } from './authority.mjs';
async function highest(workspace,config,store) {
  const cumulative=await store.get(merchantCumulativeKey(config.channel));
  need(cumulative?.merchantDeliveryId && BigInt(cumulative.amount)>0n, 'MPP_CHANNEL_ACCEPTED_COMMITMENT_REQUIRED',409);
  const delivery=await workspace.read(groups.deliveries,cumulative.merchantDeliveryId);
  need(delivery && delivery.amountAtomic===cumulative.amount &&
    hash(delivery.credentialHeader)===cumulative.credentialSha256 &&
    streamKey(delivery.channel)===streamKey(config.channel),
    'MPP_CHANNEL_ORIGINAL_COMMITMENT_REQUIRED');
  return delivery;
}
export async function prepareClose({workspace,profile,settlementId}) {
  id(settlementId); const config=merchantConfig(profile);
  need(config.settlement, 'MPP_CHANNEL_SETTLEMENT_ACCOUNT_REQUIRED');
  return serialChannel(workspace,config.channel,async()=>{
    await assertOperating(workspace,config.channel);
    const previous=await workspace.read(groups.settlements,settlementId);
    if(previous?.signedXdr) return closeView(previous);
    need(!previous || ['DRAFT','CANCELLED'].includes(previous.phase), 'MPP_CHANNEL_RESUME_ORIGINAL_CLOSE',409);
    const native=await loadChannelNative(await dependencyRootFor(workspace,config)), store=nativeStore(workspace,config.channel);
    const closed=await store.get(closedKey(config.channel));
    need(!closed, 'MPP_CHANNEL_ALREADY_CLOSED',409);
    const other=await store.get(settlingKey(config.channel));
    need(!other || other.settlementId===settlementId, 'MPP_CHANNEL_RESUME_ORIGINAL_CLOSE',409);
    const delivery=await highest(workspace,config,store), observation=await observeChannel(native,config.channel);
    const row={schema:'stellar-forge.mpp-channel-close.v1',id:settlementId,phase:'DRAFT',
      streamKey:streamKey(config.channel),config,profileId:profileKey(config),deliveryId:delivery.id,
      cumulativeAtomic:delivery.amountAtomic,signature:delivery.signature,credentialSha256:hash(delivery.credentialHeader),
      observation,createdAt:previous?.createdAt ?? now(),updatedAt:now(),
      unsignedHistory:[...(previous?.unsignedHistory ?? []),...(previous?[{phase:previous.phase,
        cumulativeAtomic:previous.cumulativeAtomic,profileId:previous.profileId,updatedAt:previous.updatedAt}]:[])]};
    await workspace.put('profiles',row.profileId,config);
    await workspace.put(groups.settlements,settlementId,row); return closeView(row);
  });
}
function assertClose(native,transaction,row,{signed=false}={}) {
  const sdk=native.sdk, config=row.config, terms=config.channel, account=config.settlement.account;
  need(transaction instanceof sdk.Transaction && transaction.source===account &&
    transaction.operations.length===1 && transaction.operations[0].type==='invokeHostFunction' &&
    (!transaction.operations[0].source || transaction.operations[0].source===account) &&
    BigInt(transaction.fee)<=BigInt(config.settlement.maximumFeeStroops) &&
    transaction.memo.type==='none', 'MPP_CHANNEL_CLOSE_TRANSACTION_CHANGED');
  const operation=transaction.toEnvelope().v1().tx().operations()[0].body().invokeHostFunctionOp();
  const host=operation.hostFunction();
  need(host.switch().value===sdk.xdr.HostFunctionType.hostFunctionTypeInvokeContract().value,
    'MPP_CHANNEL_CLOSE_INVOKE_REQUIRED');
  const call=host.invokeContract(), args=call.args();
  need(sdk.Address.fromScAddress(call.contractAddress()).toString()===terms.address &&
    call.functionName().toString()==='close' && args.length===2 &&
    BigInt(sdk.scValToNative(args[0])).toString()===row.cumulativeAtomic &&
    Buffer.from(args[1].bytes()).toString('hex')===row.signature,
    'MPP_CHANNEL_CLOSE_COMMITMENT_CHANGED');
  for(const authorization of operation.auth()) {
    need(authorization.credentials().switch().value===
      sdk.xdr.SorobanCredentialsType.sorobanCredentialsSourceAccount().value &&
      authorization.rootInvocation().subInvocations().length===0,
      'MPP_CHANNEL_CLOSE_UNEXPECTED_AUTHORIZATION');
    const fn=authorization.rootInvocation().function().contractFn();
    need(Buffer.from(fn.toXDR()).equals(Buffer.from(call.toXDR())), 'MPP_CHANNEL_CLOSE_AUTHORIZATION_CHANGED');
  }
  need(transaction.timeBounds && BigInt(transaction.timeBounds.minTime)===0n &&
    BigInt(transaction.timeBounds.maxTime)>0n, 'MPP_CHANNEL_CLOSE_TIMEBOUND_REQUIRED');
  if(signed) {
    need(transaction.signatures.length===1 && sdk.Keypair.fromPublicKey(account).verify(
      transaction.hash(),transaction.signatures[0].signature()), 'MPP_CHANNEL_ORIGINAL_CLOSE_SIGNATURE_REQUIRED');
  } else need(transaction.signatures.length===0, 'MPP_CHANNEL_UNSIGNED_CLOSE_REQUIRED');
}
async function updateClose(workspace,row,change) {
  const next={...row,...change,updatedAt:now()};
  await workspace.put(groups.settlements,row.id,next); return next;
}
async function clearMarker(store,terms,settlementId) {
  await store.update(settlingKey(terms),current=>{
    need(!current || current.settlementId===settlementId, 'MPP_CHANNEL_CLOSE_OWNER_CHANGED');
    return current?{op:'delete',result:undefined}:{op:'noop',result:undefined};
  });
}
async function finishTerminal(workspace,row,store) {
  if(row.phase==='SETTLED') {
    await store.update(closedKey(row.config.channel),current=>{
      if(current) {
        need(current.settlementId===row.id || BigInt(current.amount)>=BigInt(row.cumulativeAtomic),
          'MPP_CHANNEL_CLOSE_OWNER_CHANGED');
        return {op:'noop',result:undefined};
      }
      return {op:'set',value:{closedAt:row.settledAt,txHash:row.transaction,
        amount:row.cumulativeAtomic,settlementId:row.id},result:undefined};
    });
  }
  if(['SETTLED','FAILED','EXPIRED'].includes(row.phase)) {
    await store.update(settlingKey(row.config.channel),current=>
      current?.settlementId===row.id?{op:'delete',result:undefined}:{op:'noop',result:undefined});
    if(!row.finalizedAt) row=await updateClose(workspace,row,{finalizedAt:now()});
  }
  return row;
}
function rpcInteger(value) {
  if(typeof value==='number' && Number.isSafeInteger(value) && value>=0) return BigInt(value);
  if(typeof value==='string' && /^(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  return null;
}
const encodedXdr=value=>typeof value==='string'?value:value?.toXDR('base64') ?? null;
async function reconcile(workspace,row,native,store,rpcUrl=row.config.channel.rpcUrl) {
  need(row.signedXdr && /^[a-f0-9]{64}$/.test(row.transaction), 'MPP_CHANNEL_SIGNED_CLOSE_REQUIRED');
  if(['SETTLED','FAILED','EXPIRED'].includes(row.phase)) return finishTerminal(workspace,row,store);
  const selectedRpc=publicURL(rpcUrl).href;
  const rpc=new native.sdk.rpc.Server(selectedRpc);
  const result=await rpc.getTransaction(row.transaction);
  const returned={
    status:result.status,observedAt:now(),ledger:result.ledger ?? null,createdAt:result.createdAt ?? null,
    latestLedger:result.latestLedger ?? null,oldestLedger:result.oldestLedger ?? null,
    latestLedgerCloseTime:result.latestLedgerCloseTime ?? null,
    oldestLedgerCloseTime:result.oldestLedgerCloseTime ?? null,rpcUrl:selectedRpc,
    envelopeXdr:encodedXdr(result.envelopeXdr),resultXdr:encodedXdr(result.resultXdr),
    resultMetaXdr:encodedXdr(result.resultMetaXdr)
  };
  need(!result.txHash || result.txHash===row.transaction, 'MPP_CHANNEL_FINALITY_IDENTITY_CHANGED');
  if(['SUCCESS','FAILED'].includes(result.status)) {
    const transaction=native.sdk.TransactionBuilder.fromXDR(returned.envelopeXdr,
      networkPassphrase(native,row.config.channel.network));
    assertClose(native,transaction,row,{signed:true});
    need(transaction.hash().toString('hex')===row.transaction, 'MPP_CHANNEL_CLOSE_FINALITY_TRANSACTION_CHANGED');
  }
  if(result.status==='SUCCESS') {
    const observation=await observeChannel(native,row.config.channel);
    need(observation.closeEffectiveAtLedger!==null &&
      BigInt(observation.withdrawnAtomic)>=BigInt(row.cumulativeAtomic), 'MPP_CHANNEL_CLOSE_STATE_NOT_RECEIVED',409);
    row=await updateClose(workspace,row,{phase:'SETTLED',finality:returned,settlementObservation:observation,
      settledAt:now(),receipt:{model:'channel-close',network:row.config.channel.network,
        transaction:row.transaction,cumulativeAtomic:row.cumulativeAtomic,
        recipient:row.config.channel.recipient,token:row.config.channel.token}});
  } else if(result.status==='FAILED') {
    row=await updateClose(workspace,row,{phase:'FAILED',finality:returned});
  } else {
    need(result.status==='NOT_FOUND', 'MPP_CHANNEL_RPC_STATUS_UNSUPPORTED');
    const latest=rpcInteger(result.latestLedger),oldest=rpcInteger(result.oldestLedger);
    const closedAt=rpcInteger(result.latestLedgerCloseTime);
    const beforeSigning=rpcInteger(row.observation?.instanceLedger);
    const envelope=native.sdk.TransactionBuilder.fromXDR(row.signedXdr,
      networkPassphrase(native,row.config.channel.network));
    const expires=BigInt(envelope.timeBounds.maxTime);
    const ledgerExpired=closedAt!==null && closedAt>expires;
    const completeWindow=oldest!==null && latest!==null && beforeSigning!==null &&
      oldest<=beforeSigning && latest>beforeSigning;
    row=await updateClose(workspace,row,{phase:ledgerExpired?(completeWindow?'EXPIRED':'HISTORY_REQUIRED'):'PENDING',
      finality:returned,...(ledgerExpired?{expiry:{maximumTime:expires.toString(),
        signedAfterLedger:row.observation?.instanceLedger ?? null,completeWindow,observedAt:now()}}:{})});
  }
  return finishTerminal(workspace,row,store);
}
export async function executeClose({workspace,settlementId,environment=process.env}) {
  const original=await workspace.read(groups.settlements,id(settlementId));
  need(original, 'MPP_CHANNEL_CLOSE_NOT_FOUND',404);
  return serialChannel(workspace,original.config.channel,async()=>{
    let row=await workspace.read(groups.settlements,settlementId);
    await assertOperating(workspace,row.config.channel);
    const config=merchantConfig(row.config);
    need(profileKey(config)===row.profileId, 'MPP_CHANNEL_ORIGINAL_CLOSE_PROFILE_CHANGED');
    const native=await loadChannelNative(await dependencyRootFor(workspace,config)), store=nativeStore(workspace,config.channel);
    if(['SETTLED','FAILED','EXPIRED'].includes(row.phase)) return closeView(await finishTerminal(workspace,row,store));
    need(row.phase!=='CANCELLED', 'MPP_CHANNEL_CLOSE_CANCELLED',409);
    if(!row.signedXdr) {
      const delivery=await highest(workspace,config,store);
      need(delivery.id===row.deliveryId && delivery.amountAtomic===row.cumulativeAtomic &&
        hash(delivery.credentialHeader)===row.credentialSha256,
        'MPP_CHANNEL_PREPARE_CURRENT_COMMITMENT',409);
      if(row.phase==='DRAFT') {
        const pending=(await workspace.list(groups.deliveries)).filter(item=>
          item.streamKey===row.streamKey && item.state!=='COMPLETE').map(item=>({id:item.id,state:item.state}));
        const review={schema:'stellar-forge.mpp-channel-close-authority.v1',settlementId,
          profileId:row.profileId,operator:config.settlement.operator,channel:config.channel,
          deliveryId:row.deliveryId,cumulativeAtomic:row.cumulativeAtomic,credentialSha256:row.credentialSha256,
          feeAccount:config.settlement.account,maximumFeeStroops:config.settlement.maximumFeeStroops,
          pendingDeliveries:pending};
        const authority=await terminalConsent('Close the selected channel commitment',review,
          'CLOSE '+settlementId+' '+row.cumulativeAtomic);
        row=await updateClose(workspace,row,{phase:'AUTHORIZED',authority:{...authority,review}});
      }
      need(row.authority?.reviewSha256===hash(stable(row.authority.review)) &&
        row.authority.review.profileId===row.profileId && row.authority.review.cumulativeAtomic===row.cumulativeAtomic,
        'MPP_CHANNEL_ORIGINAL_CLOSE_AUTHORITY_REQUIRED');
      await store.update(settlingKey(config.channel),current=>{
        need(!current || current.settlementId===row.id, 'MPP_CHANNEL_RESUME_ORIGINAL_CLOSE',409);
        return {op:'set',value:{settlementId:row.id,settlingAmount:row.cumulativeAtomic,
          authoritySha256:row.authority.reviewSha256,settledAt:now()},result:undefined};
      });
      const observation=await observeChannel(native,config.channel);
      const remaining=BigInt(row.cumulativeAtomic)-BigInt(observation.withdrawnAtomic);
      need(remaining<=BigInt(observation.balanceAtomic), 'MPP_CHANNEL_CLOSE_BALANCE_CHANGED',409);
      const key=native.sdk.Keypair.fromSecret(environment[config.settlement.keyEnv] ?? '');
      need(key.publicKey()===config.settlement.account, 'MPP_CHANNEL_RECIPIENT_SIGNER_MISMATCH');
      const rpc=new native.sdk.rpc.Server(config.channel.rpcUrl), account=await rpc.getAccount(key.publicKey());
      const operation=new native.sdk.Contract(config.channel.address).call('close',
        native.sdk.nativeToScVal(BigInt(row.cumulativeAtomic),{type:'i128'}),
        native.sdk.nativeToScVal(Buffer.from(row.signature,'hex'),{type:'bytes'}));
      const unsigned=new native.sdk.TransactionBuilder(account,{fee:'100',
        networkPassphrase:networkPassphrase(native,config.channel.network)})
        .addOperation(operation).setTimeout(180).build();
      const prepared=await rpc.prepareTransaction(unsigned);
      assertClose(native,prepared,row);
      need(prepared.sequence===unsigned.sequence && stable(prepared.timeBounds)===stable(unsigned.timeBounds),
        'MPP_CHANNEL_CLOSE_ENVELOPE_CHANGED');
      prepared.sign(key); assertClose(native,prepared,row,{signed:true});
      row=await updateClose(workspace,row,{phase:'SIGNED',signedXdr:prepared.toXDR(),
        transaction:prepared.hash().toString('hex'),feeStroops:prepared.fee,
        expiresAt:new Date(Number(prepared.timeBounds.maxTime)*1000).toISOString(),observation});
    }
    const transaction=native.sdk.TransactionBuilder.fromXDR(row.signedXdr,networkPassphrase(native,config.channel.network));
    assertClose(native,transaction,row,{signed:true});
    need(transaction.hash().toString('hex')===row.transaction, 'MPP_CHANNEL_RETAINED_CLOSE_CHANGED');
    const rpc=new native.sdk.rpc.Server(config.channel.rpcUrl), before=await rpc.getTransaction(row.transaction);
    if(['SUCCESS','FAILED'].includes(before.status)) return closeView(await reconcile(workspace,row,native,store));
    if(Date.parse(row.expiresAt)<=Date.now()) return closeView(await reconcile(workspace,row,native,store));
    row=await updateClose(workspace,row,{phase:'SUBMITTING',submissionAttempts:(row.submissionAttempts ?? 0)+1});
    const submitted=await rpc.sendTransaction(transaction);
    need(!submitted.hash || submitted.hash===row.transaction, 'MPP_CHANNEL_SUBMISSION_IDENTITY_CHANGED');
    row=await updateClose(workspace,row,{phase:'PENDING',submission:{status:submitted.status,
      hash:submitted.hash ?? row.transaction,errorResultXdr:submitted.errorResult?.toXDR('base64') ?? null,observedAt:now()}});
    return closeView(await reconcile(workspace,row,native,store));
  });
}
export async function reconcileClose({workspace,settlementId,rpcUrl}) {
  const original=await workspace.read(groups.settlements,id(settlementId));
  need(original, 'MPP_CHANNEL_CLOSE_NOT_FOUND',404);
  return serialChannel(workspace,original.config.channel,async()=>{
    const row=await workspace.read(groups.settlements,settlementId);
    await assertOperating(workspace,row.config.channel);
    const native=await loadChannelNative(await dependencyRootFor(workspace,row.config)), store=nativeStore(workspace,row.config.channel);
    return closeView(await reconcile(workspace,row,native,store,rpcUrl));
  });
}
export async function cancelUnsignedClose({workspace,settlementId}) {
  const row=await workspace.read(groups.settlements,id(settlementId));
  need(row, 'MPP_CHANNEL_CLOSE_NOT_FOUND',404);
  return serialChannel(workspace,row.config.channel,async()=>{
    const current=await workspace.read(groups.settlements,settlementId);
    await assertOperating(workspace,current.config.channel);
    need(!current.signedXdr && ['DRAFT','AUTHORIZED','CANCELLED'].includes(current.phase),
      'MPP_CHANNEL_SIGNED_CLOSE_REQUIRES_RECONCILIATION',409);
    await clearMarker(nativeStore(workspace,row.config.channel),row.config.channel,row.id);
    return closeView(await updateClose(workspace,current,{phase:'CANCELLED'}));
  });
}
export function closeView(row) {
  const {signedXdr,signature,...rest}=row; return rest;
}
