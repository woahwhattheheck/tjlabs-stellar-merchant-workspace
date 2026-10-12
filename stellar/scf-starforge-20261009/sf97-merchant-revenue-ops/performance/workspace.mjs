// MIT. Recorded merchant usage, complete immutable sources and original tariff proposals.
import {open,link,unlink,readdir} from 'node:fs/promises';
import {join,resolve,isAbsolute,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {privateDir,readPrivate,syncDir,page} from '../economics/common.mjs';
import {normalizePerformanceInputs,renderPerformanceReview,performanceCsv} from './model.mjs';
import {PERFORMANCE_MAX_BYTES,PERFORMANCE_SOURCE_SCHEMA,canonical,fingerprint,encode,sha256,sourceFileBytes,
  performanceError,performanceLabel,createServicePeriodSource,inspectServicePeriodSource,
  capturePricingVersion,inspectPricingVersion,capturePerformanceOriginals,preparePerformanceReview,
  createPerformanceSource,inspectPerformanceSource} from './source.mjs';

export const PERFORMANCE_WORKSPACE_SCHEMA='stellar-forge.merchant-tariff-performance-workspace.v1';
export const PERFORMANCE_FILES=Object.freeze(['source.json','review.json','review.html','usage.csv']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const MAX_RECORD=64*1024*1024;
const copy=value=>structuredClone(value);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const fault=performanceError;
function exact(value,keys,label){
  if(!plain(value)||Object.keys(value).some(key=>!keys.includes(key)))
    throw fault('PERFORMANCE_INPUT_INVALID','Use the complete '+label+' input.');
}
function id(value,label='Performance'){
  if(!UUID.test(value??''))throw fault('PERFORMANCE_ID_INVALID',label+' requires an original UUID.');
  return value;
}
function hash(value,label){
  if(!HASH.test(value??''))throw fault('PERFORMANCE_HASH_INVALID','Keep the exact '+label+' SHA-256.');
  return value;
}
function monthly(value){
  if(typeof value!=='string'||!/^[1-9]\d*$/.test(value)||BigInt(value)>BigInt(Number.MAX_SAFE_INTEGER))
    throw fault('PERFORMANCE_MONTHLY_REQUIRED','Enter an explicit positive monthly request quantity within the original Pricing range.');
  return value;
}
function summary(source){
  const record=source.record,review=record.review;
  return {performanceId:record.performanceId,sourceId:source.id,label:record.label,savedAt:record.savedAt,
    performanceSha256:review.performanceSha256,selectionRequestId:review.source.selectionRequestId,
    pricingVersion:review.source.pricingVersion,usageVersion:review.source.usageVersion,
    routeId:review.route.routeId,method:review.route.method,path:review.route.path,
    basis:review.basis.kind,quantity:review.basis.quantity,period:review.period,
    savedValueUsd:review.quoted.valueAtObservedQuantityUsd,tariffValueUsd:review.tariff.quote.totalUsd,
    deltaUsd:review.tariff.deltaFromSavedQuoteUsd};
}
function serviceSummary(source){
  return {sourceId:source.id,label:source.label,from:source.period.from,until:source.period.until,
    orderRef:source.entitlement.orderRef,planId:source.entitlement.planId,
    routeId:source.entitlement.routeId,totals:copy(source.period.totals),routes:copy(source.period.routes),
    timeBasis:source.period.timeBasis};
}
function selectedCore(selection){
  if(!plain(selection))throw fault('PERFORMANCE_SELECTION_REQUIRED','Review the full original native pricing selection.');
  return {schema:selection.schema,planId:selection.planId,comparisonId:selection.comparisonId,
    tariffReviewSha256:selection.tariffReviewSha256,sourceSelection:selection.sourceSelection,
    scenarioPlanInput:selection.scenarioPlanInput,pricingInput:selection.pricingInput,
    selectionSha256:selection.selectionSha256};
}

export async function openPerformanceWorkspace({model,tariffs,directory}={}){
  if(!model?.download||!model?.economics?.list||!tariffs?.commitSelection||
      !isAbsolute(directory??'')||resolve(directory)!==directory||directory==='/')
    throw fault('PERFORMANCE_WORKSPACE_REQUIRED','Use the existing private original Pricing and tariff workspaces.');
  await privateDir(directory);
  const root=join(directory,'performance'),folders={};
  await privateDir(root,true);
  for(const name of ['pending','reviews','review-index','services','service-index','service-requests',
    'proposals','proposal-results','selections','selection-results']){
    folders[name]=join(root,name);await privateDir(folders[name],true);
  }
  const recordPath=(kind,key)=>join(folders[kind],key+'.json');
  async function read(path){
    const bytes=await readPrivate(path,MAX_RECORD);let envelope;
    try{envelope=JSON.parse(bytes.toString('utf8'));}catch{throw fault('PERFORMANCE_RECORD_CHANGED','A saved performance record is incomplete.');}
    if(!HASH.test(envelope?.sha256??'')||fingerprint(envelope.record)!==envelope.sha256)
      throw fault('PERFORMANCE_RECORD_CHANGED','The retained record differs from its original identity.',409);
    return envelope.record;
  }
  async function maybe(path){
    try{return await read(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  }
  async function writeOnce(path,record){
    const bytes=encode({sha256:fingerprint(record),record});
    if(bytes.length>MAX_RECORD)throw fault('PERFORMANCE_SOURCE_LIMIT','The private record exceeds its complete source limit.',413);
    const staging=join(folders.pending,randomUUID()+'.json'),handle=await open(staging,'wx',0o600);
    try{await handle.writeFile(bytes);await handle.sync();}
    catch(error){await unlink(staging).catch(()=>{});throw error;}
    finally{await handle.close();}
    try{
      try{await link(staging,path);}
      catch(error){
        if(error.code!=='EEXIST')throw error;
        const before=await read(path);
        if(fingerprint(before)!==fingerprint(record))
          throw fault('PERFORMANCE_REQUEST_CHANGED','This original request or source already identifies different bytes.',409);
        return {record:before,recovered:true};
      }
      await syncDir(dirname(path));return {record,recovered:false};
    }finally{await unlink(staging).catch(()=>{});}
  }
  async function identities(kind,pattern){
    return (await readdir(folders[kind])).filter(name=>name.endsWith('.json')&&pattern.test(name.slice(0,-5)))
      .map(name=>name.slice(0,-5)).sort();
  }
  async function retained(performanceId){
    id(performanceId);
    const value=await maybe(recordPath('reviews',performanceId));
    if(!value)throw fault('PERFORMANCE_NOT_FOUND','The saved performance review was not found.',404);
    const checked=await inspectPerformanceSource(value);
    if(checked.record.performanceId!==performanceId)
      throw fault('PERFORMANCE_RECORD_CHANGED','The source no longer belongs to its saved performance identity.',409);
    return value;
  }
  async function service(sourceId){
    hash(sourceId,'service source');const value=await maybe(recordPath('services',sourceId));
    if(!value)throw fault('PERFORMANCE_SERVICE_NOT_FOUND','The retained opening and closing service source was not found.',404);
    const checked=await inspectServicePeriodSource(value);
    if(checked.id!==sourceId)throw fault('PERFORMANCE_RECORD_CHANGED','The retained service source identity changed.',409);
    return value;
  }
  async function indexReview(value){await writeOnce(recordPath('review-index',value.record.performanceId),summary(value));}
  async function indexService(value){await writeOnce(recordPath('service-index',value.id),serviceSummary(value));}
  async function list(input={}){
    const rows=[];
    for(const key of await identities('reviews',UUID)){
      const indexed=await maybe(recordPath('review-index',key));
      rows.push(indexed??summary(await retained(key)));
    }
    rows.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)||a.performanceId.localeCompare(b.performanceId));
    return page(rows,input);
  }
  async function servicePeriods(input={}){
    const rows=[];
    for(const key of await identities('services',HASH)){
      const indexed=await maybe(recordPath('service-index',key));
      rows.push(indexed??serviceSummary(await service(key)));
    }
    rows.sort((a,b)=>b.until.localeCompare(a.until)||a.sourceId.localeCompare(b.sourceId));
    return page(rows,input);
  }
  async function sources(input={}){return model.economics.list({...input,kind:'PRICING'});}
  async function source(version){
    const original=inspectPricingVersion(await capturePricingVersion(model,id(version,'Recorded Pricing source')));
    const native=original.native?.value??null;
    const costs=await model.economics.list({limit:100});
    return {version:original.version,revision:original.revision,label:original.label,savedAt:original.savedAt,
      reportSha256:original.reportFile.sha256,observationKind:original.report.observationKind??original.manifest.observationKind,
      period:copy(original.report.periodReview??original.report.period??null),
      observation:copy(original.report.session??null),
      routes:original.report.routes.map(row=>({routeId:row.routeId,method:row.method,path:row.path,
        actual2xx:row.actual2xx,actual402:row.actual402,unitPriceUsd:row.quoteUsd,
        paymentOptions:copy(row.paymentOptions),nativeOptions:copy(native?.options?.filter(option=>option.routeId===row.routeId)??[])})),
      native:native?{generatedAt:native.generatedAt,totals:copy(native.totals),issues:copy(native.issues??[])}:null,
      costEditions:{items:costs.items.filter(row=>row.pricingVersion===version),nextAfter:costs.nextAfter,
        description:'Matching editions in this original page; a saved edition UUID can also be selected directly.'}};
  }
  async function state(){
    const [pricing,plans,reviews,services]=await Promise.all([sources({limit:50}),tariffs.list(),list({limit:50}),servicePeriods({limit:50})]);
    return {schema:PERFORMANCE_WORKSPACE_SCHEMA,pricing,tariffs:plans,reviews,servicePeriods:services,
      limits:{sourceBytes:PERFORMANCE_MAX_BYTES},files:[...PERFORMANCE_FILES]};
  }
  async function captureServicePeriod(raw){
    exact(raw,['requestId','label','opening','closing'],'complete native service snapshot capture');
    const request={requestId:id(raw.requestId,'Service capture request'),label:performanceLabel(raw.label),
      opening:copy(raw.opening),closing:copy(raw.closing)},requestSha256=fingerprint(request);
    const path=recordPath('service-requests',request.requestId),previous=await maybe(path);
    if(previous){
      if(previous.requestSha256!==requestSha256)throw fault('PERFORMANCE_REQUEST_CHANGED','This capture UUID belongs to different service source bytes.',409);
      const value=await service(previous.sourceId);await indexService(value);
      return {status:'PERFORMANCE_SERVICE_CAPTURED',recovered:true,requestId:request.requestId,...serviceSummary(value)};
    }
    const value=await createServicePeriodSource(request);
    await writeOnce(recordPath('services',value.id),value);
    const saved=await writeOnce(path,{schema:'stellar-forge.merchant-performance-service-request.v1',
      requestId:request.requestId,requestSha256,sourceId:value.id});
    await indexService(value);
    return {status:'PERFORMANCE_SERVICE_CAPTURED',recovered:saved.recovered,requestId:request.requestId,...serviceSummary(value)};
  }
  // Keep at most 64 MiB of exactly previewed source in this process. A restart can
  // recapture the same immutable saved versions; save always verifies their hash.
  const previews=new Map();let previewBytes=0;
  function remember(key,value){
    const size=encode(value).length;
    if(previews.has(key)){previewBytes-=previews.get(key).size;previews.delete(key);}
    while(previews.size&&previewBytes+size>MAX_RECORD){
      const first=previews.keys().next().value;previewBytes-=previews.get(first).size;previews.delete(first);
    }
    if(size<=MAX_RECORD){previews.set(key,{value:copy(value),size});previewBytes+=size;}
  }
  async function prepare(raw){
    const inputs=normalizePerformanceInputs(raw);
    const originals=await capturePerformanceOriginals({model,tariffs,directory,inputs,
      serviceSource:inputs.servicePeriodSourceId===null?null:await service(inputs.servicePeriodSourceId)});
    return {...await preparePerformanceReview({inputs,originals}),originals};
  }
  async function preview(raw){
    const prepared=await prepare(raw);remember(prepared.review.performanceSha256,{inputs:prepared.inputs,originals:prepared.originals});
    return {inputs:prepared.inputs,review:prepared.review};
  }
  function saveReply(value,recovered){
    return {status:'PERFORMANCE_SAVED',recovered,...summary(value),record:copy(value.record)};
  }
  async function save(raw){
    exact(raw,['requestId','label','performanceSha256','inputs'],'performance save');
    const request={requestId:id(raw.requestId,'Performance request'),label:performanceLabel(raw.label),
      performanceSha256:hash(raw.performanceSha256,'reviewed performance'),inputs:normalizePerformanceInputs(raw.inputs)};
    const path=recordPath('reviews',request.requestId),requestSha256=fingerprint(request),previous=await maybe(path);
    if(previous){
      if(previous.record?.requestSha256!==requestSha256)
        throw fault('PERFORMANCE_REQUEST_CHANGED','This performance UUID already identifies another saved request.',409);
      await inspectPerformanceSource(previous);await indexReview(previous);return saveReply(previous,true);
    }
    let originals=previews.get(request.performanceSha256)?.value;
    if(originals&&canonical(originals.inputs)!==canonical(request.inputs))
      throw fault('PERFORMANCE_REVIEW_CHANGED','The selected usage basis differs from the reviewed input.',409);
    if(!originals)originals=await prepare(request.inputs);
    const value=await createPerformanceSource({...request,originals:originals.originals,savedAt:new Date().toISOString()});
    try{
      const saved=await writeOnce(path,value);await indexReview(saved.record);return saveReply(saved.record,saved.recovered);
    }catch(error){
      if(error.code!=='PERFORMANCE_REQUEST_CHANGED')throw error;
      const winner=await retained(request.requestId);
      if(winner.record.requestSha256!==requestSha256)throw error;
      await indexReview(winner);return saveReply(winner,true);
    }
  }
  async function proposalHistory(performanceId){
    const rows=[];
    for(const key of await identities('proposals',UUID)){
      const intent=await read(recordPath('proposals',key));
      if(intent.request.performanceId!==performanceId)continue;
      const result=await maybe(recordPath('proposal-results',key));
      rows.push({proposalRequestId:key,request:copy(intent.request),createdAt:intent.createdAt,
        status:result?'SAVED':'RESUME',result:result?copy(result):null});
    }
    const selections=[];
    for(const key of await identities('selections',UUID)){
      const intent=await read(recordPath('selections',key));
      if(intent.request.performanceId!==performanceId)continue;
      const result=await maybe(recordPath('selection-results',key));
      selections.push({pricingRequestId:key,request:copy(intent.request),createdAt:intent.createdAt,
        status:result?'SAVED':'RESUME',result:result?copy(result):null});
    }
    const newest=(a,b)=>b.createdAt.localeCompare(a.createdAt);
    return {proposals:rows.sort(newest),selections:selections.sort(newest)};
  }
  async function load(performanceId){
    const value=await retained(performanceId);
    return {sourceId:value.id,record:copy(value.record),operations:await proposalHistory(performanceId)};
  }
  async function capture(performanceId){return copy(await retained(performanceId));}
  async function download(performanceId,name){
    if(!PERFORMANCE_FILES.includes(name))throw fault('PERFORMANCE_FILE_NOT_FOUND','Choose an original performance export.',404);
    const value=await retained(performanceId),record=value.record;
    if(name==='source.json')return encode(value);
    if(name==='review.json')return encode(record.review);
    if(name==='review.html')return Buffer.from(renderPerformanceReview(record.review,{label:record.label}));
    return performanceCsv(record.review);
  }
  async function inspect(raw){return inspectPerformanceSource(copy(raw));}
  async function receive(raw){
    const value=copy(raw),checked=await inspectPerformanceSource(value),path=recordPath('reviews',checked.record.performanceId);
    const previous=await maybe(path);
    if(previous&&previous.id!==checked.id)
      throw fault('PERFORMANCE_REQUEST_CHANGED','The destination already retains different bytes under this original performance UUID.',409);
    const serviceSource=value.originals.servicePeriod;
    if(serviceSource){
      const existing=await maybe(recordPath('services',serviceSource.id));
      if(existing&&fingerprint(existing)!==fingerprint(serviceSource))
        throw fault('PERFORMANCE_SOURCE_CHANGED','The destination retains different bytes for the original service source.',409);
    }
    if(serviceSource){await writeOnce(recordPath('services',serviceSource.id),serviceSource);await indexService(serviceSource);}
    const saved=await writeOnce(path,value);await indexReview(value);
    return {status:'PERFORMANCE_RECEIVED',recovered:saved.recovered,...summary(value),record:copy(value.record)};
  }
  async function proposal(raw){
    exact(raw,['performanceId','proposedMonthlyRequests'],'explicit monthly proposal');
    const performanceId=id(raw.performanceId),proposedMonthlyRequests=monthly(raw.proposedMonthlyRequests);
    const value=await retained(performanceId),review=value.record.review,portfolio=value.originals.tariffPortfolio;
    const plan=portfolio.plans.find(row=>row.planId===review.source.tariffPlanId);
    const tariff=plan?.review.tariffs.find(row=>row.id===review.source.tariffId);
    if(!tariff)throw fault('PERFORMANCE_SOURCE_CHANGED','The complete original selected tariff is missing.',409);
    const input={version:review.source.sourceVersion,tariffs:[copy(tariff)],volumes:[proposedMonthlyRequests]};
    const preview=await tariffs.preview(input),comparison=preview.review.comparisons.find(row=>
      row.tariffId===tariff.id&&row.routeId===review.route.routeId&&row.quantity===proposedMonthlyRequests);
    if(!comparison?.scenario)throw fault('PERFORMANCE_PROPOSAL_UNAVAILABLE','This explicit quantity cannot become an original native Pricing scenario.');
    const body={schema:'stellar-forge.merchant-performance-proposal.v1',performanceId,
      performanceSourceId:value.id,performanceSha256:review.performanceSha256,proposedMonthlyRequests,
      observedQuantity:review.basis.quantity,observedBasis:review.basis.kind,observedPeriod:copy(review.period),
      sourceVersion:input.version,tariffId:tariff.id,inputs:input,
      tariffReviewSha256:preview.review.tariffReviewSha256,comparisonId:comparison.id,comparison:copy(comparison)};
    return {...body,proposalSha256:fingerprint(body),preview};
  }
  async function proposalReply(intent,result,recovered){
    let selection=null,selectionError=null;
    try{selection=await tariffs.selection({planId:result.plan.planId,comparisonId:intent.proposal.comparisonId});}
    catch(error){selectionError={code:error.code??'NATIVE_SELECTION_UNAVAILABLE',message:error.message,status:error.status??422};}
    return {status:'PERFORMANCE_PROPOSAL_SAVED',performanceId:intent.request.performanceId,
      proposalRequestId:intent.request.requestId,proposalSha256:intent.request.proposalSha256,recovered,
      proposal:copy(intent.proposal),plan:copy(result.plan),selection,selectionError};
  }
  async function saveProposal(raw){
    exact(raw,['performanceId','proposedMonthlyRequests','proposalSha256','requestId','label'],'reviewed monthly proposal save');
    const request={performanceId:id(raw.performanceId),proposedMonthlyRequests:monthly(raw.proposedMonthlyRequests),
      proposalSha256:hash(raw.proposalSha256,'reviewed proposal'),requestId:id(raw.requestId,'Tariff proposal request'),
      label:performanceLabel(raw.label)},requestSha256=fingerprint(request);
    const path=recordPath('proposals',request.requestId),previous=await maybe(path);
    if(previous&&previous.requestSha256!==requestSha256)
      throw fault('PERFORMANCE_REQUEST_CHANGED','This proposal UUID identifies different reviewed inputs.',409);
    let intent=previous;
    if(!intent){
      const reviewed=await proposal({performanceId:request.performanceId,proposedMonthlyRequests:request.proposedMonthlyRequests});
      if(reviewed.proposalSha256!==request.proposalSha256)
        throw fault('PERFORMANCE_PROPOSAL_CHANGED','Review this exact explicit monthly proposal before saving.',409);
      const {preview,...savedProposal}=reviewed;
      intent={schema:'stellar-forge.merchant-performance-proposal-intent.v1',createdAt:new Date().toISOString(),
        requestSha256,request,proposal:savedProposal,
        nativeRequest:{...reviewed.inputs,requestId:request.requestId,label:request.label,
          tariffReviewSha256:reviewed.tariffReviewSha256}};
      try{await writeOnce(path,intent);}
      catch(error){
        const winner=await maybe(path);if(!winner||winner.requestSha256!==requestSha256)throw error;intent=winner;
      }
    }
    const completed=await maybe(recordPath('proposal-results',request.requestId));
    if(completed)return proposalReply(intent,completed,true);
    // Always replay the exact original tariff save before capturing a new native selection.
    const plan=await tariffs.save(copy(intent.nativeRequest));
    const result={schema:'stellar-forge.merchant-performance-proposal-result.v1',
      performanceId:request.performanceId,proposalRequestId:request.requestId,plan};
    try{await writeOnce(recordPath('proposal-results',request.requestId),result);}
    catch(error){
      const winner=await maybe(recordPath('proposal-results',request.requestId));
      if(!winner||winner.plan.planId!==plan.planId||winner.plan.tariffReviewSha256!==plan.tariffReviewSha256)throw error;
      return proposalReply(intent,winner,true);
    }
    return proposalReply(intent,result,previous!==null||plan.recovered===true);
  }
  async function commitProposal(raw){
    exact(raw,['performanceId','proposalRequestId','selection','planRequestId','pricingRequestId'],'native proposal commit');
    const request={performanceId:id(raw.performanceId),proposalRequestId:id(raw.proposalRequestId,'Proposal request'),
      selection:selectedCore(raw.selection),planRequestId:id(raw.planRequestId,'Native scenario request'),
      pricingRequestId:id(raw.pricingRequestId,'Native Pricing request')};
    const requestSha256=fingerprint(request),path=recordPath('selections',request.pricingRequestId);
    const previous=await maybe(path);
    if(previous&&previous.requestSha256!==requestSha256)
      throw fault('PERFORMANCE_REQUEST_CHANGED','This native Pricing UUID identifies another performance proposal.',409);
    const completed=await maybe(recordPath('selection-results',request.pricingRequestId));
    if(completed)return {...copy(completed),recovered:true};
    let intent=previous;
    if(!intent){
      await retained(request.performanceId);
      const proposalIntent=await maybe(recordPath('proposals',request.proposalRequestId));
      const proposalResult=await maybe(recordPath('proposal-results',request.proposalRequestId));
      if(proposalIntent?.request.performanceId!==request.performanceId||!proposalResult||
          request.selection.planId!==proposalResult.plan.planId||
          request.selection.comparisonId!==proposalIntent.proposal.comparisonId||
          request.selection.tariffReviewSha256!==proposalIntent.proposal.tariffReviewSha256)
        throw fault('PERFORMANCE_SELECTION_CHANGED','Choose this performance review’s original saved monthly proposal and comparison.',409);
      const nativeRequest={selection:copy(request.selection),planRequestId:request.planRequestId,pricingRequestId:request.pricingRequestId};
      intent={schema:'stellar-forge.merchant-performance-selection-intent.v1',createdAt:new Date().toISOString(),
        requestSha256,request,nativeRequest};
      try{await writeOnce(path,intent);}
      catch(error){
        const winner=await maybe(path);if(!winner||winner.requestSha256!==requestSha256)throw error;intent=winner;
      }
    }
    // Original tariff writer owns scenario/Pricing recovery and current revision checks.
    const result=await tariffs.commitSelection(copy(intent.nativeRequest));
    const saved={status:'PERFORMANCE_PRICING_SAVED',performanceId:request.performanceId,
      proposalRequestId:request.proposalRequestId,pricingRequestId:request.pricingRequestId,
      result,recovered:result.recovered===true};
    try{await writeOnce(recordPath('selection-results',request.pricingRequestId),saved);}
    catch(error){
      const winner=await maybe(recordPath('selection-results',request.pricingRequestId));
      if(!winner||winner.result.pricing?.version!==result.pricing?.version)throw error;
      return {...winner,recovered:true};
    }
    return saved;
  }
  return {root,state,sources,source,servicePeriods,captureServicePeriod,preview,save,list,load,capture,
    download,inspect,receive,proposal,saveProposal,commitProposal};
}


/**
 * Capture committed performance records before the original Pricing backup prefix.
 * Complete reviews and caller intents remain immutable; transient pending files and
 * generated transport exports are regenerated by their original owners.
 */
export async function capturePerformanceBackup({directory}={}){
  if(!isAbsolute(directory??'')||resolve(directory)!==directory||directory==='/')
    throw fault('PERFORMANCE_WORKSPACE_REQUIRED','Use the existing original Pricing directory.');
  const root=join(directory,'performance'),records=new Map(),files=[],pricingVersions=new Set(),
    costEditions=new Set(),tariffPlanIds=new Set(),selectionRequestIds=new Set();
  try{await privateDir(root);}catch(error){if(error.code==='ENOENT')return {
    files,pricingVersions:[],requiredCostEditions:[],summary:{reviews:0,servicePeriods:0,proposals:0,selections:0,
      tariffPlanIds:[],selectionRequestIds:[]}};throw error;}
  const kinds={
    reviews:UUID,'review-index':UUID,services:HASH,'service-index':HASH,'service-requests':UUID,
    proposals:UUID,'proposal-results':UUID,selections:UUID,'selection-results':UUID
  };
  async function read(kind,key,{optional=false}={}){
    if(!Object.hasOwn(kinds,kind)||!kinds[kind].test(key??''))
      throw fault('PERFORMANCE_BACKUP_CHANGED','A committed performance record has an invalid original identity.',409);
    const name=kind+'/'+key+'.json';
    if(records.has(name))return records.get(name);
    const path=join(root,name);let bytes;
    try{bytes=await readPrivate(path,MAX_RECORD);}
    catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
    let envelope;
    try{envelope=JSON.parse(bytes.toString('utf8'));}
    catch{throw fault('PERFORMANCE_BACKUP_CHANGED','A committed performance record is incomplete.',409);}
    if(!HASH.test(envelope?.sha256??'')||fingerprint(envelope.record)!==envelope.sha256)
      throw fault('PERFORMANCE_BACKUP_CHANGED','A committed performance record changed its original identity.',409);
    const record=envelope.record,contentSha256=sha256(bytes);
    records.set(name,record);
    files.push({name:'performance/'+name,read:async()=>{
      const actual=await readPrivate(path,MAX_RECORD);
      if(sha256(actual)!==contentSha256)
        throw fault('PERFORMANCE_BACKUP_CHANGED','Committed performance bytes changed during the original backup.',409);
      return actual;
    }});
    return record;
  }
  // Every durable caller intent is retained, including recoverable work whose
  // original native result is still absent. Only an unpublished pending file is excluded.
  for(const [kind,pattern] of Object.entries(kinds)){
    const folder=join(root,kind);let names;
    try{await privateDir(folder);names=await readdir(folder);}
    catch(error){if(error.code==='ENOENT')continue;throw error;}
    for(const name of names.sort()){
      if(!name.endsWith('.json')||!pattern.test(name.slice(0,-5)))
        throw fault('PERFORMANCE_BACKUP_CHANGED','Unexpected committed performance record name.',409);
      await read(kind,name.slice(0,-5));
    }
  }
  // Map iteration also includes original dependencies discovered after a
  // concurrent, already-committed record appears in a later directory listing.
  for(const [name,value] of records){
    const [kind,filename]=name.split('/'),key=filename.slice(0,-5);
    if(kind==='reviews'){
      const checked=await inspectPerformanceSource(value);
      if(checked.record.performanceId!==key)
        throw fault('PERFORMANCE_BACKUP_CHANGED','The complete performance source differs from its original record UUID.',409);
      for(const version of value.originals.pricing)pricingVersions.add(version.version);
      if(checked.review.source.costEdition)costEditions.add(checked.review.source.costEdition);
      tariffPlanIds.add(checked.review.source.tariffPlanId);
      selectionRequestIds.add(checked.review.source.selectionRequestId);
      if(value.originals.servicePeriod){
        const source=await read('services',value.originals.servicePeriod.id);
        if(fingerprint(source)!==fingerprint(value.originals.servicePeriod))
          throw fault('PERFORMANCE_BACKUP_CHANGED','The retained service source differs from the measured review.',409);
      }
    }else if(kind==='services'){
      if((await inspectServicePeriodSource(value)).id!==key)
        throw fault('PERFORMANCE_BACKUP_CHANGED','The complete service source differs from its original ID.',409);
    }else if(kind==='review-index'){
      const review=await read('reviews',key);
      if(fingerprint(value)!==fingerprint(summary(review)))
        throw fault('PERFORMANCE_BACKUP_CHANGED','The performance index differs from its complete original source.',409);
    }else if(kind==='service-index'){
      const source=await read('services',key);
      if(fingerprint(value)!==fingerprint(serviceSummary(source)))
        throw fault('PERFORMANCE_BACKUP_CHANGED','The service index differs from its complete original source.',409);
    }else if(kind==='service-requests'){
      if(value.schema!=='stellar-forge.merchant-performance-service-request.v1'||value.requestId!==key||
          !HASH.test(value.requestSha256??''))
        throw fault('PERFORMANCE_BACKUP_CHANGED','A retained service-capture request changed.',409);
      const source=await read('services',value.sourceId);
      const request={requestId:key,label:source.label,
        opening:{name:source.originalNames.opening,text:sourceFileBytes(source.files.find(row=>row.name==='opening.json')).toString('utf8')},
        closing:{name:source.originalNames.closing,text:sourceFileBytes(source.files.find(row=>row.name==='closing.json')).toString('utf8')}};
      // The request digest was created from the caller's exact complete texts.
      if(fingerprint(request)!==value.requestSha256)
        throw fault('PERFORMANCE_BACKUP_CHANGED','A service-capture request differs from its original paired texts.',409);
    }else if(kind==='proposals'){
      if(value.schema!=='stellar-forge.merchant-performance-proposal-intent.v1'||
          value.request?.requestId!==key||fingerprint(value.request)!==value.requestSha256)
        throw fault('PERFORMANCE_BACKUP_CHANGED','The saved monthly proposal request changed.',409);
      const original=await read('reviews',value.request.performanceId);
      if(value.proposal.performanceId!==value.request.performanceId||
          value.proposal.performanceSourceId!==original.id||
          value.proposal.performanceSha256!==original.record.review.performanceSha256||
          value.proposal.proposalSha256!==value.request.proposalSha256||
          value.proposal.proposedMonthlyRequests!==value.request.proposedMonthlyRequests||
          value.nativeRequest.requestId!==key||value.nativeRequest.version!==value.proposal.sourceVersion||
          fingerprint(value.nativeRequest)!==fingerprint({...value.proposal.inputs,requestId:key,
            label:value.request.label,tariffReviewSha256:value.proposal.tariffReviewSha256}))
        throw fault('PERFORMANCE_BACKUP_CHANGED','The monthly proposal lost its original measured-source binding.',409);
      pricingVersions.add(value.proposal.sourceVersion);
    }else if(kind==='proposal-results'){
      const intent=await read('proposals',key);
      if(value.schema!=='stellar-forge.merchant-performance-proposal-result.v1'||
          value.proposalRequestId!==key||value.performanceId!==intent.request.performanceId||
          value.plan?.planId!==key||value.plan.tariffReviewSha256!==intent.proposal.tariffReviewSha256)
        throw fault('PERFORMANCE_BACKUP_CHANGED','The monthly proposal result differs from its retained native request.',409);
      tariffPlanIds.add(value.plan.planId);
    }else if(kind==='selections'){
      if(value.schema!=='stellar-forge.merchant-performance-selection-intent.v1'||
          value.request?.pricingRequestId!==key||fingerprint(value.request)!==value.requestSha256)
        throw fault('PERFORMANCE_BACKUP_CHANGED','The native proposal selection request changed.',409);
      const proposal=await read('proposals',value.request.proposalRequestId),
        result=await read('proposal-results',value.request.proposalRequestId);
      if(value.request.performanceId!==proposal.request.performanceId||
          value.request.selection.planId!==result.plan.planId||
          value.request.selection.comparisonId!==proposal.proposal.comparisonId||
          value.request.selection.tariffReviewSha256!==proposal.proposal.tariffReviewSha256||
          fingerprint(value.nativeRequest)!==fingerprint({selection:value.request.selection,
            planRequestId:value.request.planRequestId,pricingRequestId:value.request.pricingRequestId}))
        throw fault('PERFORMANCE_BACKUP_CHANGED','The native selection differs from its saved monthly proposal.',409);
      tariffPlanIds.add(value.request.selection.planId);selectionRequestIds.add(key);
    }else if(kind==='selection-results'){
      const intent=await read('selections',key);
      if(value.status!=='PERFORMANCE_PRICING_SAVED'||value.pricingRequestId!==key||
          value.performanceId!==intent.request.performanceId||
          value.proposalRequestId!==intent.request.proposalRequestId||
          !UUID.test(value.result?.pricing?.version??''))
        throw fault('PERFORMANCE_BACKUP_CHANGED','The saved native result differs from its original proposal selection.',409);
      pricingVersions.add(value.result.pricing.version);
    }
  }
  const count=kind=>[...records.keys()].filter(name=>name.startsWith(kind+'/')).length;
  return {files,pricingVersions:[...pricingVersions].sort(),requiredCostEditions:[...costEditions].sort(),
    summary:{reviews:count('reviews'),servicePeriods:count('services'),proposals:count('proposals'),
      selections:count('selections'),tariffPlanIds:[...tariffPlanIds].sort(),selectionRequestIds:[...selectionRequestIds].sort(),
      continuation:'Restore this original workspace backup, then receive its complete original tariff portfolio before continuing native monthly proposals.'}};
}
