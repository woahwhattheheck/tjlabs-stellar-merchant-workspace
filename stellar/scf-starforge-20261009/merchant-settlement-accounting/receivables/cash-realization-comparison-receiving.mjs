// MIT. Complete read-only comparison receiving in the existing private native case.
import {need,identifier,json,sha} from './core.mjs';
import {compareCashRealizations,receiveCashRealizationComparison,cashRealizationComparisonFile,CASH_COMPARISON_FILES} from './cash-realization-comparison.mjs';
/**
 * Original owner provides its already-open ReceivablesClient/controller and durable
 * load/save. reopen drains/closes/reopens that SAME account and returns its client.
 * No account mutations, host launch or separate financial journal are performed.
 */
export async function receiveCashRealizationComparisonNative({receivables,leftId,rightId,operationId,load,save,reopen=null}){
 identifier(leftId,'earlier realization');identifier(rightId,'later realization');
 need(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(operationId)&&typeof load==='function'&&typeof save==='function',
  'CASH_COMPARISON_RECEIVING_INPUT','Use the original receiving identity and complete case readers/writers.');
 const selection={leftId,rightId},prefix='comparisons/'+leftId+'_'+rightId+'/',source={schema:'stellar-forge.cash-comparison-receiving-input.v1',operationId,selection};
 const prior=await load(prefix+'input.json');if(prior)need(json(prior)===json(source),'CASH_COMPARISON_RECEIVING_CHANGED','Continue the original exact comparison.',409);else await save(prefix+'input.json',source);
 const left=await receivables.cashRealization(leftId),right=await receivables.cashRealization(rightId);
 need(left.workspaceId===right.workspaceId,'CASH_COMPARISON_RECEIVING_WORKSPACE','Both saved reviews must come from one original workspace.',409);
 const expected=compareCashRealizations(left.realization,right.realization),observed=await receivables.compareCashRealizations(selection);
 need(json(expected)===json(observed),'CASH_COMPARISON_RECEIVING_SOURCE','Native comparison differs from its exact original reviews.',409);
 const previous=await load(prefix+'comparison.json');
 if(previous)need(json(previous)===json(observed),'CASH_COMPARISON_RECEIVING_CHANGED','Previously retained immutable reviews or comparison changed.',409);
 else await save(prefix+'comparison.json',observed);
 async function bytes(client,name){
  const value=await client.cashRealizationComparisonFile(name,selection);
  if(typeof value?.arrayBuffer==='function')return Buffer.from(await value.arrayBuffer());
  need(value?.bytes instanceof Uint8Array,'CASH_COMPARISON_RECEIVING_FILE','Use the complete original byte file or HTTP Response.');
  return Buffer.from(value.bytes);
 }
 const files=[];
 for(const name of CASH_COMPARISON_FILES){
  const actual=await bytes(receivables,name),file=cashRealizationComparisonFile(expected,name);
  need(actual.equals(file.bytes),'CASH_COMPARISON_RECEIVING_FILE','Original '+name+' differs from the complete source.',409);
  if(name==='comparison.json')receiveCashRealizationComparison(JSON.parse(actual.toString('utf8')));
  const identity={name,type:file.type,bytes:actual.length,sha256:sha(actual)};
  await save(prefix+'files/'+name+'.source.json',{...identity,contentBase64:actual.toString('base64')});files.push(identity);
 }
 let reopened=null;
 if(reopen){
  const next=await reopen({workspaceId:left.workspaceId,operationId,selection});
  need(next&&typeof next.compareCashRealizations==='function','CASH_COMPARISON_RECEIVING_REOPEN','Return the same reopened original account client.');
  const original=await next.cashRealization(leftId),following=await next.cashRealization(rightId),again=await next.compareCashRealizations(selection);
  need(original.workspaceId===left.workspaceId&&following.workspaceId===left.workspaceId&&json(original.realization)===json(left.realization)&&
   json(following.realization)===json(right.realization)&&json(again)===json(observed),'CASH_COMPARISON_RECEIVING_REOPEN','Original account reopen must retain both complete saved reviews and their comparison.',409);
  for(const file of files)need(sha(await bytes(next,file.name))===file.sha256,'CASH_COMPARISON_RECEIVING_FILE','Reopened '+file.name+' differs.',409);
  reopened={workspaceId:left.workspaceId,leftId,rightId,comparisonSha256:again.comparisonSha256,allFilesExact:true};
  await save(prefix+'reopened.json',reopened);
 }
 const result={schema:'stellar-forge.cash-comparison-native-receiving.v1',operationId,workspaceId:left.workspaceId,selection,
  state:reopened?'NATIVE_COMPLETE':'NATIVE_COMPLETE_REOPEN_PENDING',browserState:'AVAILABLE_TO_CONTINUE',
  comparisonSha256:observed.comparisonSha256,files,reopened};
 await save(prefix+'native-result.json',result);return result;
}
