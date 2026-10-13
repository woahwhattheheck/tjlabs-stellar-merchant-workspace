#!/usr/bin/env node
// MIT. Complete original-case recipient review, using the same native case engine.
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,mkdir,open,link,unlink} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {openCaseStore} from './case-store.mjs';
import {createCaseSourceDelivery} from './case-source-delivery.mjs';
import {createImplementationReview} from './case-implementation-review.mjs';
import {MAX_REVIEW_BYTES,validateReturn,serialize,canonical} from './implementation-review-model.mjs';
import {parseWorkspace} from './workspace-file.mjs';
import {commissioningSummary} from './commissioning.mjs';
import {renderImplementationReviewHtml} from './implementation-review-render.mjs';
import {readPrivateFile} from '../sf93-seller-support-bundle/incident-store.mjs';

const names=['cases-dir','source-dir','input','return','out','html','python'];
const json=value=>JSON.stringify(value,null,2)+'\n';
const fail=message=>Object.assign(new Error(message),{code:'IMPLEMENTATION_REVIEW_CLI_INPUT'});
function absolute(value,label){
  if(typeof value!=='string'||!isAbsolute(value))throw fail(label+' must be an absolute path.');
  return resolve(value);
}
const sha=value=>createHash('sha256').update(value).digest('hex');
async function parsedFile(path,maximum){
  const bytes=await readPrivateFile(path,maximum);
  return {bytes,text:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)};
}
/** Create-only publication. An uncertain result reopens only exact existing
 * bytes; another output or a recipient's edited file is never overwritten. */
async function publish(path,bytes,maximum=128*1024*1024,reconcileExisting=null){
  if(bytes.length>maximum)throw fail('Output exceeds its complete file limit.');
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const temporary=join(dirname(path),'.implementation-review-'+randomUUID()+'.part');
  let handle,retained=null;
  try{
    handle=await open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
    try{await link(temporary,path);}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      const original=await readPrivateFile(path,maximum);
      if(original.length!==bytes.length||sha(original)!==sha(bytes)){
        if(reconcileExisting&&await reconcileExisting(original))retained=original;
        else throw Object.assign(fail('The output path contains different original bytes. Keep it and select another output path.'),{code:'REVIEW_OUTPUT_CONFLICT'});
      }
    }
    const folder=await open(dirname(path),'r');try{await folder.sync();}finally{await folder.close();}
    const selected=retained??bytes;
    return {path,bytes:selected.length,sha256:sha(selected),...(retained?{retained:true}:{})};
  }finally{await handle?.close();await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
/** A lost stdout/response can follow successful publication of the first
 * receipt. Its historical revision remains true even when native replay now
 * reports a later current case. Validate that complete old receipt in the
 * original store; never replace it with regenerated current-state bytes. */
async function originalReceipt(bytes,result,store){
  if(!result.replayed||!store)return false;
  let prior;
  try{prior=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{return false;}
  if(!prior||prior.state!=='COMPLETE'||prior.case?.id!==result.case.id||prior.requestId!==result.requestId||
    prior.returnSha256!==result.returnSha256||typeof prior.replayed!=='boolean'||
    canonical(prior.result)!==canonical(result.result)||!/^[a-f0-9]{64}$/.test(prior.case.revision??''))return false;
  const historic=await store.read(prior.case.id,prior.case.revision),current=await store.read(prior.case.id);
  const oldState=(await parseWorkspace(historic.workspaceText)).commissioning,
    currentState=(await parseWorkspace(current.workspaceText)).commissioning,
    original=oldState?.events.find(row=>row.id===result.requestId),
    latest=currentState?.events.find(row=>row.id===result.requestId);
  if(!original||!latest||original.type!=='record_receiving_batch'||canonical(original)!==canonical(latest))return false;
  const expected={state:'COMPLETE',case:{id:historic.id,revision:historic.revision,
    workspaceSha256:sha(historic.workspaceText),supportSha256:historic.supportText===null?null:sha(historic.supportText)},
    revision:oldState.revision,result:original.result,replayed:prior.replayed,
    summary:commissioningSummary(oldState),requestId:result.requestId,returnSha256:result.returnSha256};
  return canonical(prior)===canonical(expected);
}
export async function implementationReviewCli(argv=process.argv.slice(2)){
  const {values,positionals}=parseArgs({args:argv,allowPositionals:true,strict:true,
    options:{...Object.fromEntries(names.map(name=>[name,{type:'string'}])),help:{type:'boolean'}}});
  if(values.help){
    if(positionals.length||Object.keys(values).length!==1)throw fail('Use --help on its own.');
    return {command:'merchant-implementation-review',
      usage:'node implementation-review-cli.mjs prepare|preview|apply|status|inspect-return [options]',
      prepare:'--cases-dir ABS --input ABS [--source-dir ABS] [--python EXE] [--out PACKET.json] [--html REVIEW.html]',
      preview:'--cases-dir ABS --input ABS --return RETURN.json [--out PREVIEW.json]',
      apply:'--cases-dir ABS --input ABS --return RETURN.json [--out RECEIPT.json]',
      status:'--cases-dir ABS --input ABS --return RETURN.json [--out STATUS.json]',
      'inspect-return':'--return RETURN.json [--out INSPECTION.json]',
      input:'Exact JSON arguments from createImplementationReview. Pass the original returned file separately with --return; never rebuild its bytes.',
      receiving:'Apply one exact reviewed return to its original case; fresh full-case Handoffs retain the original native material and receiving history.',
      guide:'IMPLEMENTATION_REVIEW.md',limits:{reviewBytes:MAX_REVIEW_BYTES,requestBytes:64*1024*1024}};
  }
  if(positionals.length!==1||!['prepare','preview','apply','status','inspect-return'].includes(positionals[0]))
    throw fail('Choose prepare, preview, apply, status or inspect-return.');
  const action=positionals[0],allowed={
    prepare:['cases-dir','source-dir','python','input','out','html'],
    preview:['cases-dir','input','return','out'],
    apply:['cases-dir','input','return','out'],
    status:['cases-dir','input','return','out'],
    'inspect-return':['return','out'],
  }[action];
  for(const key of Object.keys(values))if(!allowed.includes(key))throw fail('Unexpected --'+key+' for '+action+'.');
  let returned;
  if(values.return)returned=(await parsedFile(absolute(values.return,'Original return file'),MAX_REVIEW_BYTES)).text;
  if(action!=='prepare'&&typeof returned!=='string')throw fail('Supply the exact --return file.');
  let result,prepared,service,sourceDelivery,primary,caseStore;
  const abort=new AbortController(),cancel=()=>abort.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  try{
    if(action==='inspect-return'){
      const value=await validateReturn(returned);
      result={schema:value.schema,returnId:value.returnId,reviewId:value.packet.reviewId,reviewer:value.reviewer,
        sourceCase:value.packet.source.case,packetSha256:value.packetSha256,returnSha256:sha(Buffer.from(returned)),
        observations:value.observations,embeddedFiles:value.packet.files.map(({sha256,bytes})=>({sha256,bytes}))};
    }else{
      const input=await parsedFile(absolute(values.input,'Original request input'),64*1024*1024);
      let args;try{args=JSON.parse(input.text);}catch{throw fail('Original request input is not JSON.');}
      if(!args||typeof args!=='object'||Array.isArray(args)||Object.hasOwn(args,'signal')||Object.hasOwn(args,'returned'))
        throw fail('Use one original request object; --return supplies its unchanged original file.');
      const store=caseStore=await openCaseStore(absolute(values['cases-dir'],'Original case directory'));
      if(values['source-dir'])sourceDelivery=await createCaseSourceDelivery({store,
        directory:absolute(values['source-dir'],'Original source bundle directory'),python:values.python??process.env.SCF_PYTHON??'python3'});
      service=createImplementationReview({store,sourceDelivery});
      result=await service[action]({...args,...(returned!==undefined?{returned}:{}),signal:abort.signal});
      if(action==='prepare')prepared=result;
    }
    const outputs=[];
    if(values.out)outputs.push(await publish(absolute(values.out,'Original output path'),Buffer.from(action==='prepare'?serialize(prepared.packet):json(result)),
      128*1024*1024,action==='apply'&&result.replayed?bytes=>originalReceipt(bytes,result,caseStore):null));
    if(values.html){
      const root=dirname(fileURLToPath(import.meta.url));
      const [model,recipient,style]=await Promise.all(['implementation-review-model.mjs','implementation-review-recipient.js','implementation-review.css']
        .map(name=>readFile(join(root,name),'utf8')));
      const html=await renderImplementationReviewHtml(prepared,{model,recipient,style});
      outputs.push(await publish(absolute(values.html,'Complete recipient HTML'),Buffer.from(html)));
    }
    return outputs.length?{...(action==='prepare'?{packetSha256:prepared.packetSha256,
      reviewId:prepared.packet.reviewId,sourceCase:prepared.packet.source.case}:result),outputs}:result;
  }catch(error){primary=error;throw error;}
  finally{
    process.off('SIGINT',cancel);process.off('SIGTERM',cancel);
    try{await service?.close();}catch(error){if(primary)primary.reviewCloseError=error;else primary=error;}
    try{await sourceDelivery?.close();}catch(error){if(primary)primary.sourceCloseError=error;else primary=error;}
    if(primary)throw primary;
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.stdout.write(json(await implementationReviewCli()));}
  catch(error){process.stderr.write(json({error:error.code??'IMPLEMENTATION_REVIEW_FAILED',detail:error.message,
    ...(error.currentRevision?{currentRevision:error.currentRevision}:{})}));process.exitCode=1;}
}
