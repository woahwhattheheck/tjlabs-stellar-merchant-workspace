// MIT. Read the original saved ObjectSession; never run or finalize a buyer.
import {isDeepStrictEqual} from 'node:util';
import {isAbsolute,resolve} from 'node:path';
import {inspectObjectSession,accountObjectSession} from '../sf88-operator-buyer-cli/object-session.mjs';
import {normalizeObjectSource,createObjectObservation,OBJECT_FILE_LIMIT} from './object-observation.mjs';

const iso=()=>new Date().toISOString();
const fail=code=>{throw Object.assign(new Error(code),{code});};
const codeOf=error=>/^[A-Z0-9_]{1,120}$/.test(error?.code??'')?error.code:
  /^[A-Z0-9_]{1,120}$/.test(error?.message??'')?error.message:'OBJECT_SOURCE_READ_FAILED';
const check=signal=>{if(signal.aborted)fail('OBJECT_INSPECTION_ABORTED');};
function bounded(options) {
  const {maxBytes=1_073_741_824,maxChunks=1000,timeoutMs=30000}=options;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0||!Number.isSafeInteger(maxChunks)||maxChunks<1||maxChunks>100000||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>300000)fail('OBJECT_INSPECTION_LIMITS_INVALID');
  return {maxBytes,maxChunks,timeoutMs};
}
async function within(timeoutMs,outer,callback) {
  if(outer!==undefined&&!(outer instanceof AbortSignal))fail('INVALID_ABORT_SIGNAL');
  const controller=new AbortController(),stop=()=>controller.abort();
  if(outer?.aborted)stop();else outer?.addEventListener('abort',stop,{once:true});
  const timer=setTimeout(stop,timeoutMs);
  try {check(controller.signal);return await callback(controller.signal);}
  finally {clearTimeout(timer);outer?.removeEventListener('abort',stop);}
}
async function accountingRead(directory,options,signal) {
  let offset=0,total=null,identity=null;
  const pages=[];
  do {
    check(signal);
    const page=await accountObjectSession(directory,{offset,limit:250,finalize:false,signal});
    check(signal);
    if(page.interrupted||!Number.isSafeInteger(page.range?.total)||page.range.total<1||
      page.range.total>options.maxChunks||page.range.offset!==offset||
      !Array.isArray(page.entries)||!page.entries.length)fail('OBJECT_INSPECTION_WORKLOAD_LIMIT');
    const current={directory:page.directory,sessionId:page.sessionId,configurationSha256:page.configurationSha256,
      terms:page.terms,deliveryMode:page.deliveryMode,workspace:page.workspace};
    if(total!==null&&(total!==page.range.total||!isDeepStrictEqual(identity,current)))
      fail('OBJECT_ACCOUNTING_CHANGED_DURING_READ');
    total=page.range.total;identity=current;
    const next=offset+page.entries.length;
    if(next>total||page.range.nextOffset!==(next<total?next:null))fail('OBJECT_ACCOUNTING_RANGE_INVALID');
    pages.push(page);
    // Both complete reads share one original capture file. Stop at the declared
    // format boundary instead of silently dropping the remaining native pages.
    if(Buffer.byteLength(JSON.stringify(pages))>OBJECT_FILE_LIMIT/2-4096)fail('OBJECT_OBSERVATION_SIZE_LIMIT');
    offset=page.range.nextOffset;
  } while(offset!==null);
  return {pages};
}
export async function collectObjectObservation(merchant,outerSignal) {
  const selection=normalizeObjectSource(merchant.object),startedAt=iso();
  let before=null,after=null,report=null,errorCode=null;
  try {
    await within(selection.timeoutMs,outerSignal,async signal=>{
      before=await accountingRead(selection.directory,selection,signal);
      report=await inspectObjectSession(selection.directory,{signal,maxBytes:selection.maxBytes,maxChunks:selection.maxChunks});
      check(signal);
      if(Buffer.byteLength(JSON.stringify(report))>OBJECT_FILE_LIMIT-4096)fail('OBJECT_OBSERVATION_SIZE_LIMIT');
      after=await accountingRead(selection.directory,selection,signal);
    });
  } catch(error) {
    if(outerSignal?.aborted)return {error:'STOPPING'};
    errorCode=codeOf(error);
  }
  const input={registration:{id:merchant.id,label:merchant.label},selection,startedAt,generatedAt:iso(),
    report,before,after,errorCode};
  try {return {packet:createObjectObservation(input)};}
  catch(error) {
    // Preserve one explicit incomplete observation when a corrupt or oversized
    // native response cannot be represented. Never turn partial data into a
    // successful source capture or a zero financial/output result.
    const code=codeOf(error);
    return {packet:createObjectObservation({...input,report:null,before:null,after:null,
      errorCode:code==='OBJECT_OBSERVATION_SIZE_LIMIT'?code:'OBJECT_OBSERVATION_FORMAT_INVALID'})};
  }
}
/** Explicit local receiving review. The caller adds this exact selection to the
 * existing watcher configuration only after the operator reviews it. */
export async function reviewObjectSource(input,{signal}={}) {
  if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).some(key=>!['directory','maxBytes','maxChunks','timeoutMs','financialAfterSeconds','outputAfterSeconds'].includes(key)))
    fail('OBJECT_SOURCE_REVIEW_INVALID');
  if(typeof input.directory!=='string'||input.directory!==resolve(input.directory)||!isAbsolute(input.directory))
    fail('OBJECT_SOURCE_CANONICAL_DIRECTORY_REQUIRED');
  const options=bounded(input);
  const report=await within(options.timeoutMs,signal,current=>inspectObjectSession(input.directory,{...options,signal:current}));
  const object=normalizeObjectSource({directory:report.directory,sessionId:report.sessionId,
    sessionSha256:report.sessionSha256,configurationSha256:report.configurationSha256,sourceIntentId:report.sourceIntentId,
    ...options,financialAfterSeconds:input.financialAfterSeconds,outputAfterSeconds:input.outputAfterSeconds});
  return {schema:'stellar-forge.sf93.object-source-review.v1',object,observedAt:report.inspectedAt,
    output:{status:report.status,progressStatus:report.progressStatus??report.status,
      bytes:report.bytes,verifiedBytes:report.downloadedBytes,chunks:report.chunkCount,
      verifiedChunks:report.completeChunks,sha256:report.objectSha256},
    sourceUrl:report.sourceUrl,terms:report.terms,process:report.lock??null,
    authority:'ORIGINAL_READ_ONLY_SF88_SESSION; NO_PURCHASE_OR_FINALIZATION'};
}
