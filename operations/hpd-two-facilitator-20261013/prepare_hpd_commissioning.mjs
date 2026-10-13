#!/usr/bin/env node
// MIT. Prepare the original HPD commissioning through the merged native product.
import {readFile,open,mkdir,lstat,realpath,link,unlink,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';

const ORIGIN='https://merchant.routescan39da.scf.test';
const RELEASE='socrata-hpd-queens-20261011';
const CUSTOMER='a3618289-2faa-4634-9ab6-f063995229ed';
const SESSION='socrata-hpd-queens-paid-customer-1fb3-20261011';
const SNAPSHOT='11e07ef6b87c34cbf38dd975b8fbe44e2de22d50d273315736080162983c72ea';
const ARCHIVE='277f15432c25c8a3f554280ce52d2c101076b0b4dc75268af1f8decda8f14c33';
const TERMS={scheme:'exact',network:'stellar:testnet',
  asset:'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  amount:'10000',payTo:'GBB37T6QFXSFLVG7FHVVOQOK4YHE4T7ISG3ITPDRS3XNNY6JBWRIYOGC'};
const PROVIDERS=[
 {alias:'vellar',releaseId:'hpd-vellar-48db-20261012',label:'Vellar testnet',
  url:'https://vellar-facilitator-testnet-production.up.railway.app',
  operatorId:'github:Vellar-Wallet',operatorName:'Vellar Wallet facilitator project',
  authorityReference:'https://github.com/Vellar-Wallet/vellar-facilitator',
  authorityMember:'vellar-facilitator-README.md'},
 {alias:'periplo',releaseId:'hpd-periplo-48db-20261012',label:'Periplo testnet',
  url:'https://periplo-testnet.fly.dev',
  operatorId:'github:Eras256',operatorName:'Eras256 / Periplo',
  authorityReference:'https://github.com/Eras256/Periplo',
  authorityMember:'periplo-README.md'}
];
const hash=b=>createHash('sha256').update(b).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const normalized=v=>Array.isArray(v)?v.map(normalized):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalized(v[k])])):v;
const stable=v=>JSON.stringify(normalized(v));
const bytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const fail=(code,message)=>Object.assign(new Error(message),{code});
function need(ok,code,message){if(!ok)throw fail(code,message);}
async function json(path){return JSON.parse(await readFile(path,'utf8'));}
async function optional(path){try{return await json(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function privateDir(path,create=false){
 if(create)await mkdir(path,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const st=await lstat(path);
 need(st.isDirectory()&&!st.isSymbolicLink()&&await realpath(path)===path&&
   (process.platform==='win32'||st.uid===process.getuid()&&(st.mode&0o077)===0),
   'PRIVATE_DIRECTORY_REQUIRED','Use an existing canonical private directory owned by this operator.');
}
async function save(path,raw){
 try{const st=await lstat(path);need(st.isFile()&&!st.isSymbolicLink()&&(await readFile(path)).equals(raw),
   'HPD_RETAINED_FILE_CHANGED','An original preparation file differs: '+path);return;}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const temp=path+'.'+randomUUID()+'.partial',h=await open(temp,'wx',0o600);
 try{try{await h.writeFile(raw);await h.sync();}finally{await h.close();}
  try{await link(temp,path);}catch(e){if(e.code!=='EEXIST')throw e;need((await readFile(path)).equals(raw),'HPD_RETAINED_FILE_CHANGED','Concurrent preparation differs.');}
  const d=await open(dirname(path),'r');try{await d.sync();}finally{await d.close();}
 }finally{await unlink(temp);}
}
async function checked(ref){
 need(object(ref)&&typeof ref.path==='string'&&Number.isSafeInteger(ref.bytes)&&/^[a-f0-9]{64}$/.test(ref.sha256),
   'HPD_FILE_REFERENCE','Select an exact original file identity.');
 const st=await lstat(ref.path);need(st.isFile()&&!st.isSymbolicLink(),'HPD_FILE_REFERENCE','Use an ordinary original file.');
 const raw=await readFile(ref.path);need(raw.length===ref.bytes&&hash(raw)===ref.sha256,'HPD_ORIGINAL_FILE_CHANGED','An original customer file changed.');
 return raw;
}
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
function args(){
 const out={};const a=process.argv.slice(2);for(let i=0;i<a.length;i+=2){
  need(['--source','--publisher','--intake','--out','--authority-directory','--buyer-template'].includes(a[i])&&a[i+1]&&!out[a[i]],
   'HPD_ARGUMENT','Use --source, --publisher, --intake, --out, --authority-directory and optional --buyer-template.');
  out[a[i]]=resolve(a[i+1]);
 }
 for(const k of ['--source','--publisher','--intake','--out','--authority-directory'])need(out[k],'HPD_ARGUMENT','Missing '+k);
 return out;
}
async function main(){
 const a=args(),source=await realpath(a['--source']),publisher=await realpath(a['--publisher']),out=a['--out'];
 await privateDir(out,true);
 for(const folder of ['commands','reports','returned','responses'])await privateDir(join(out,folder),true);
 const sourceBase=join(source,'stellar/scf-starforge-20261009');
 const engine=await import(pathToFileURL(join(source,'products/facilitator-commissioning/commissioning.mjs')));
 const {renderCommissioningReport}=await import(pathToFileURL(join(source,'products/facilitator-commissioning/report.mjs')));
 const {inspectRelease,readReleaseState}=await import(pathToFileURL(join(sourceBase,'sf82-seller-pilot/releases.mjs')));
 const {readFacilitatorReview,normalizeFacilitatorProfiles}=await import(pathToFileURL(join(sourceBase,'sf82-seller-pilot/release-facilitator.mjs')));
 const {inspectDatasetPage}=await import(pathToFileURL(join(sourceBase,'sf88-operator-buyer-cli/dataset-page.mjs')));
 const {config:readBuyerConfig,execution}=await import(pathToFileURL(join(sourceBase,'sf88-operator-buyer-cli/config.mjs')));
 const intake=await json(a['--intake']);
 need(intake.schema==='commons.hpd-original-commissioning-intake.v1'&&intake.archive?.sha256===ARCHIVE&&
   intake.original_customer_id===CUSTOMER&&intake.original_session_id===SESSION&&intake.snapshot===SNAPSHOT&&
   intake.pages?.length===2,'HPD_INTAKE_CHANGED','Use the complete original 144-row customer intake.');
 await checked(intake.archive);await checked(intake.manifest);
 const store=join(publisher,'releases'),original=await inspectRelease(store,RELEASE),before=await readReleaseState(store);
 need(original.publicOrigin===ORIGIN,'HPD_RELEASE_CHANGED','Keep the original selected HPD merchant origin.');
 const route=original.routes.find(r=>r.method==='GET'&&r.path==='/hpd-queens');
 need(route&&route.payment.some(p=>Object.entries(TERMS).every(([k,v])=>String(p[k])===v)),
   'HPD_RELEASE_CHANGED','The original HPD route and quoted payment terms must agree.');
 let prior=null;
 const requests=[];
 for(let i=0;i<intake.pages.length;i++){
  const p=intake.pages[i],raw=await checked(p.output);
  const page=inspectDatasetPage(raw,{url:p.url,previous:prior,expectedSnapshot:SNAPSHOT,maxRows:144});
  need(page.returned===(i===0?100:44)&&page.total===144,'HPD_PAGE_SELECTION','Retain both whole original pages.');
  requests.push({id:p.id,routeId:route.id,url:p.url,method:'GET',outputFile:p.output.path,mediaType:'application/json'});
  prior=page;
 }
 need(prior.nextCursor===null&&prior.nextOffset===144,'HPD_INCOMPLETE_TASK','The original page set must complete all 144 rows.');
 const templateFile=a['--buyer-template']??intake.buyer_template;
 const template=await readBuyerConfig(templateFile);execution(template);
 need(template.operation.expect.scheme===TERMS.scheme&&template.operation.expect.network===TERMS.network&&
   template.operation.expect.asset===TERMS.asset&&template.operation.expect.payTo===TERMS.payTo&&
   BigInt(template.operation.expect.maxAtomic)>=10000n,'HPD_BUYER_TERMS','Use the original buyer account and testnet HPD terms.');
 const profilesInput={schema:'stellar-forge.seller-facilitators.v1',providers:{}};
 const providers=[],reviews=new Map(),staged=new Map();
 for(const p of PROVIDERS){
  const current=await inspectRelease(store,p.releaseId);
  need(current.derivedFrom?.releaseDigest===original.digest&&/^[a-f0-9]{64}$/.test(current.derivedFrom?.reviewId??''),
   'HPD_ORIGINAL_PROVIDER_STAGE_REQUIRED','Receive the original '+p.alias+' stage and complete review from its existing owner.');
  const reviewFile=join(publisher,'facilitator-reviews',current.derivedFrom.reviewId+'.json');
  const review=await readFacilitatorReview(reviewFile);
  need(review.source.releaseId===RELEASE&&review.source.releaseDigest===original.digest&&
    review.proposed.id===p.releaseId&&review.proposed.provider.alias===p.alias&&
    review.proposed.provider.url===p.url&&review.proposed.provider.allowLocalFacilitator===false,
    'HPD_REVIEW_CHANGED','Keep the original provider review, source release and host profile together.');
  const {alias:_alias,...nativeProfile}=review.proposed.provider;
  profilesInput.providers[p.alias]=nativeProfile;
  reviews.set(p.alias,{file:reviewFile,value:review});staged.set(p.alias,current);
  const authorityFile=join(a['--authority-directory'],p.authorityMember);
  need((await readFile(authorityFile)).length>0,'HPD_PROVIDER_AUTHORITY','Retain the complete selected primary operator source.');
  providers.push({alias:p.alias,releaseId:p.releaseId,operatorId:p.operatorId,operatorName:p.operatorName,
    authorityReference:p.authorityReference,authorityFile});
 }
 const profiles=normalizeFacilitatorProfiles(profilesInput);
 const profilesPath=join(out,'facilitators.json');await save(profilesPath,bytes(profiles));
 const selection={schema:engine.SCHEMA,id:'hpd-queens-two-facilitators-20261013',
  title:'Queens HPD preservation edition — Vellar and Periplo',store,releaseId:RELEASE,profilesFile:profilesPath,providers,
  service:{purpose:'Deliver the complete 144-row Queens HPD preservation selection, with its original typed pages and customer data room, through each selected facilitator.',
    sourceReference:'https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791766588823019',
    sourceEdition:SNAPSHOT,scopeFile:intake.scope_file,schemaFile:intake.schema_file,acceptanceFile:intake.acceptance_file,
    receiver:{name:'Original HPD preservation data customer '+CUSTOMER,system:'Socrata Publisher and original SF88 dataset delivery',operator:'Original customer operator 1FB3'}},
  requests};
 const selectionFile=join(out,'commissioning-selection.json');await save(selectionFile,bytes(selection));
 const directory=join(out,'commissioning');
 await engine.createCommissioningJob({directory,selection});
 const job=await engine.openCommissioningJob({directory});
 let result, primaryError;
 try{
  const completed=await optional(join(out,'prepared-hpd-commissioning.json'));
  if(completed){
   need(completed.schema==='commons.hpd-two-facilitator-prepared.v1'&&completed.directory===directory&&
    completed.original?.archiveSha256===ARCHIVE&&completed.original?.releaseDigest===original.digest&&
    completed.source===source&&completed.selectionFile===selectionFile,'HPD_PREPARATION_CHANGED','Reopen the same complete source and original preparation.');
   const state=await job.inspect();
   process.stdout.write(JSON.stringify({state:'ORIGINAL_HPD_PREPARATION_REOPENED',directory,manifest:join(out,'prepared-hpd-commissioning.json'),revision:state.revision})+'\n');
   return;
  }
  async function apply(label,action,payload){
   const commandFile=join(out,'commands',label+'.json'),existing=await optional(commandFile);
   if(existing)need(existing.action===action&&stable(existing.payload)===stable(payload),
     'HPD_COMMAND_CHANGED','Continue the original retained command and exact inputs.');
   const command=existing??{operationId:randomUUID(),expectedRevision:(await job.inspect()).revision,action,payload};
   await save(commandFile,bytes(command));
   const received=await job.execute(command);
   await save(join(out,'commands',label+'-result.json'),bytes({...received,replayed:undefined}));
   return received;
  }
  const results=[],plans=[];
  for(const p of PROVIDERS){
   const review=await apply('review-'+p.alias,'review',{provider:p.alias,reviewFile:reviews.get(p.alias).file});
   results.push(review);
   results.push(await apply('stage-'+p.alias,'stage',{reviewOperationId:review.operationId}));
  }
  for(const p of PROVIDERS){
   const choices=staged.get(p.alias).facilitatorReview.nativePayments.find(r=>r.routeId===route.id)?.nativePayment??[];
   const matches=choices.map((terms,index)=>({terms,index})).filter(({terms})=>
     Object.entries(TERMS).every(([k,v])=>String(terms[k])===v)&&
     (terms.extra?.paymentFlow??'authorization')===(template.operation.expect.paymentFlow??'authorization'));
   need(matches.length===1,'HPD_NATIVE_PAYMENT_SELECTION','Choose the one retained exact testnet HPD native alternative.');
   const outputDirectory=join(out,'responses',p.alias);await privateDir(outputDirectory,true);
   const payload={provider:p.alias,templateFile,outputDirectory,
    requests:requests.map(r=>({requestId:r.id,intentId:'hpd-queens-20261013-'+p.alias+'-'+r.id,paymentOption:matches[0].index}))};
   const plan=await apply('buyer-plan-'+p.alias,'buyer-plan',payload);plans.push(plan);
  }
  const after=await readReleaseState(store);
  need(after.active===before.active&&after.generation===before.generation,'HPD_SELECTION_CHANGED','Reconcile an independent current selection change before serving.');
  const status=await job.inspect(),report=await job.report();
  await save(join(out,'reports','revision-'+status.revision+'.json'),bytes(report));
  await save(join(out,'reports','revision-'+status.revision+'.html'),Buffer.from(renderCommissioningReport(report,status)));
  const runIds=await optional(join(out,'run-identities.json'))??Object.fromEntries(PROVIDERS.map(p=>[p.alias,randomUUID()]));
  await save(join(out,'run-identities.json'),bytes(runIds));
  const cli=join(source,'products/facilitator-commissioning/cli.mjs');
  const buyer=join(sourceBase,'sf88-operator-buyer-cli/cli.mjs');
  result={schema:'commons.hpd-two-facilitator-prepared.v1',directory,source,selectionFile,
   sourceIntake:a['--intake'],originalArchive:intake.archive,customerOutputs:intake.customer_outputs,
   original:{customerId:CUSTOMER,sessionId:SESSION,snapshot:SNAPSHOT,archiveSha256:ARCHIVE,releaseDigest:original.digest},
   unchangedSelection:after,providerReviews:PROVIDERS.map(p=>({provider:p.alias,reviewId:reviews.get(p.alias).value.id,
     reviewFile:reviews.get(p.alias).file,releaseId:p.releaseId})),
   runIds,plans:plans.map(x=>x.result),report:join(out,'reports','revision-'+status.revision+'.html'),
   commands:{status:['node',cli,'status','--directory',directory],
     report:['node',cli,'report','--directory',directory],
     providers:PROVIDERS.map(p=>({provider:p.alias,originalRunOperationId:runIds[p.alias],
       selectPayload:{provider:p.alias,expectedGeneration:after.generation,
         reason:'Operate the complete original Queens HPD customer task on '+p.label+'.'},
       selectInstruction:'Read current status and retain one original select command with the actual current generation.',
       run:['node',cli,'run','--directory',directory,'--provider',p.alias,'--operation-id',runIds[p.alias],'--expect','ACTUAL_SELECTED_GENERATION'],
       buyer:plans.find(x=>x.result.provider===p.alias).result.files.map(f=>({requestId:f.requestId,intentId:f.intentId,
         review:['node',buyer,'--review','--config',f.configFile],
         execute:['node',buyer,'--execute','--config',f.configFile],output:f.output,
         expectedOutput:f.expectedOutput}))}))},
   continuation:'Use the original seller ingress and original customer authority. Keep each foreground native seller alive for its own prepared buyer requests, then retain original results and receive through the commissioning CLI.'};
  await save(join(out,'prepared-hpd-commissioning.json'),bytes(result));
 }catch(error){primaryError=error;throw error;}
 finally{
  try{await job.close();}
  catch(closeError){
   if(primaryError){
    const combined=new AggregateError([primaryError,closeError],'The original operation and its job close both failed.');
    combined.code=primaryError.code??'HPD_OPERATION_AND_CLOSE_FAILED';
    throw combined;
   }
   throw closeError;
  }
 }
 process.stdout.write(JSON.stringify({state:'ORIGINAL_HPD_COMMISSIONING_PREPARED',
  directory:result.directory,manifest:join(out,'prepared-hpd-commissioning.json'),
  customerId:CUSTOMER,sessionId:SESSION,snapshot:SNAPSHOT,providers:2,pagesPerProvider:2,rowsPerProvider:144})+'\n');
}
main().catch(error=>{process.stderr.write(JSON.stringify({code:error.code??error.name,message:error.message,...(error instanceof AggregateError?{errors:error.errors.map(e=>({code:e?.code??e?.name??'ERROR',message:e?.message??String(e)}))}:{})})+'\n');process.exitCode=1;});
