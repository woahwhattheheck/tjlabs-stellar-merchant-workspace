// MIT. One resumable Study Flow operation over retained original RIS and the native dossier.
import {readFile,writeFile,mkdir,rename,open,stat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const OP='STUDY-FLOW-ORIGINAL-RIS-63DD-20261012';
const PREFIX='stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers';
const PACKET_SHA='a468739354d5b543712b583226f934dc63bbba29769d2c327df4c54876174413';
const sha=body=>createHash('sha256').update(body).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const need=(ok,message)=>{if(!ok)throw Error(message);};
async function optionalJson(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function durable(path,body,{exclusive=false}={}){
  body=Buffer.isBuffer(body)?body:Buffer.from(body);
  await mkdir(dirname(path),{recursive:true});
  try{const prior=await readFile(path);if(prior.equals(body))return;if(exclusive)throw Error('Retained output changed: '+path);}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const temporary=path+'.writing';const fd=await open(temporary,'w',0o600);
  try{await fd.writeFile(body);await fd.sync();}finally{await fd.close();}
  await rename(temporary,path);
  const actual=await readFile(path);need(actual.equals(body),'Output readback changed: '+path);
}
async function outputFile(directory,name,body){
  const path=join(directory,name);await durable(path,body,{exclusive:true});
  const actual=await readFile(path);return{path,filename:name,bytes:actual.length,sha256:sha(actual)};
}
function parseArgs(argv){
  const o={};for(let i=0;i<argv.length;i++){const key=argv[i];need(key.startsWith('--')&&i+1<argv.length,'Expected --name value');
  o[key.slice(2)]=argv[++i];}
  for(const key of ['source-root','out','original-source-packet'])need(o[key],key+' is required');
  return o;
}
export async function runStudyFlowOperation(options){
  const root=resolve(options['source-root']),out=resolve(options.out),packetPath=resolve(options['original-source-packet']);
  const module=relative=>import(pathToFileURL(join(root,PREFIX,relative)).href);
  const [{openDossierStore},{createRisSource},{prepareRisReview}]=await Promise.all([
    module('dossier.mjs'),module('ris-source/schema.mjs'),module('ris-source/review.mjs')]);
  await mkdir(out,{recursive:true});
  const journalPath=join(out,'operation.json');
  let journal=await optionalJson(journalPath);
  if(!journal){journal={schema:'commons.study-flow-native-operation/v1',operationId:OP,startedAt:new Date().toISOString(),
    sourceRoot:root,sourcePin:options['source-pin']??null,input:{path:packetPath,sha256:PACKET_SHA},steps:{},outputs:[]};await durable(journalPath,encode(journal));}
  need(journal.operationId===OP&&journal.sourceRoot===root&&journal.input.sha256===PACKET_SHA,'Original operation binding changed');
  const checkpoint=async()=>{journal.updatedAt=new Date().toISOString();await durable(journalPath,encode(journal));};
  const phase=async(name,callback)=>{if(journal.steps[name]?.complete)return journal.steps[name].value;
    journal.phase=name;await checkpoint();console.log(JSON.stringify({phase:name,state:'running'}));
    const value=await callback();journal.steps[name]={complete:true,value,completedAt:new Date().toISOString()};await checkpoint();
    console.log(JSON.stringify({phase:name,state:'complete'}));return value;};
  const packetBody=await readFile(packetPath);need(sha(packetBody)===PACKET_SHA,'Original retained HTTP packet changed');
  const packet=JSON.parse(packetBody);need(packet.schema==='commons.original-ris-source-packet/v1'&&packet.documents.length===2,'Original two-document source required');
  for(const document of packet.documents){const bytes=Buffer.from(document.body_base64,'base64');
    need(bytes.length===document.bytes&&sha(bytes)===document.sha256&&document.status===200,'Original RIS response identity changed');}
  await phase('original-input',()=>outputFile(join(out,'inputs'),'original-ris-http-responses.json',packetBody));
  const actor={id:'chatgpt-63dd',name:'ChatGPT — automated metadata review'};
  const title='Study Flow: retained Europe PMC metadata selection ['+OP+']';
  const question='Which of these two retained 2023 bibliographic records specifically describes Europe PMC? This is title-and-identifier screening of a selected metadata set, not a complete literature search or full-text study review.';
  const store=await openDossierStore(join(out,'dossiers'));
  const created=await phase('dossier',async()=>{
    const found=(await store.list()).filter(x=>x.title===title);need(found.length<=1,'Ambiguous retained dossier');
    return found[0]??store.create({title,description:'Uses the two exact Crossref RIS responses acquired by the original source owner on 2026-10-12. No provider request, clinical inference, full-text retrieval or independent human review is performed.',projection:'metadata'});
  });
  const id=created.id;journal.dossierId=id;await checkpoint();
  const questionRow=await phase('question',async()=>{
    let current=await store.getMetadata(id);const found=current.questions.filter(x=>x.text===question);
    need(found.length<=1,'Ambiguous original question');if(found.length)return found[0];
    current=await store.addQuestion(id,{text:question,expectedRevision:current.revision,projection:'metadata'});
    return current.questions.find(x=>x.text===question);
  });
  const qid=questionRow.id;
  const sourceInput={label:'Two original Crossref RIS responses — 2023 information infrastructure',
    preparedAt:journal.startedAt,sourceReference:'Original source carrier 1c568b92a722fa40533145290a73e667e4a9f7e5; SHA-256 '+PACKET_SHA,
    sourceTerms:'Retained public Crossref bibliographic metadata responses. The original HTTP response documents supply no separate licence header; this operation retains that absence and performs no new acquisition.',
    documents:packet.documents.map(d=>({filename:d.id+'.ris',encoding:'utf-8',bodyBase64:d.body_base64,bytes:d.bytes,sha256:d.sha256,
      declaration:{database:'Crossref REST API',query:d.source_url,exportedAt:null,retrievedAt:d.retrieved_at,url:d.final_url,
        sourceReference:d.source_url,sourceTerms:'Original public bibliographic metadata response; no separate licence header was observed.',
        notes:'Original GET response bytes. The title, DOI and year are metadata, not full-text evidence.',
        provenance:{...d.provenance,status:d.status,headers:d.headers,startedAt:d.started_at,retrievedAt:d.retrieved_at,originalPacketSha256:PACKET_SHA}}}))};
  const prepared=createRisSource(sourceInput);
  const risReviewInput={requestId:'sf63dd-original-ris-v1',questionId:qid,actor:actor.name,reviewedAt:journal.startedAt,
    records:prepared.analysis.records.map(r=>({recordId:r.id,selected:true,classification:'background',
      note:'Retained original bibliographic record for explicit title-level screening.',
      interpretationReviewed:true,interpretationReason:'The single original TI, DO and PY values are retained unchanged. This choice does not infer full-text content or study identity.'})),
    duplicates:[],acknowledgedDiagnostics:[],previous:null};
  const reviewed=prepareRisReview(prepared,risReviewInput,{complete:true});
  await phase('prepare-ris',()=>store.prepareRis(id,{source:sourceInput,review:reviewed.review}));
  const receipt=await phase('receive-ris',async()=>{
    const current=await store.getMetadata(id);
    const input={source:prepared.descriptor,review:reviewed.review,expectedPlanSha256:reviewed.planSha256,expectedRevision:current.revision};
    const file=join(out,'requests','receive-ris.json');
    const retained=await optionalJson(file);const request=retained??input;if(!retained)await durable(file,encode(request),{exclusive:true});
    return store.receiveRis(id,request);
  });
  const originals=await store.studyFlowSources(id,{questionId:qid,limit:100});
  need(originals.items.length===2&&originals.editions.some(x=>x.id===receipt.receipt.editionId),'Native source occurrence closure changed');
  const mutate=async(name,method,build)=>phase(name,async()=>{
    const file=join(out,'requests',name+'.json');let request=await optionalJson(file);
    if(!request){const current=await store.getMetadata(id);request={requestId:'sf63dd-'+name,expectedRevision:current.revision,actor,...build()};
      await durable(file,encode(request),{exclusive:true});}
    return store[method](id,request);
  });
  const review=await mutate('create-review','reviewEligibility',()=>({action:'create-review',data:{questionId:qid,
    name:'Selected 2023 Europe PMC bibliographic metadata',description:'Single automated reviewer, explicit title-level rule; no full-text or systematic-search claim.',
    protocol:{name:'Europe PMC title-level screening',criteria:[{id:'europe-pmc-title',name:'Specific Europe PMC title',
      include:'The original RIS title is Europe PMC in 2023.',exclude:'The original title describes the broader EMBL-EBI institution rather than specifically Europe PMC.'}],
      stages:[{id:'metadata-screening',name:'Retained title and identifier screening',criterionIds:['europe-pmc-title'],
        reviewerIds:[actor.id],minimumDecisions:1,requireFullText:false}],reviewers:[actor],resolverIds:[actor.id],
      exclusionReasons:[{id:'broader-infrastructure',label:'Title describes broader EMBL-EBI infrastructure'}],
      disagreementProcedure:'One explicitly identified automated reviewer applies the literal title criterion and records its resolution. No independent human or second-reviewer agreement is claimed.'}}}));
  const reviewId=review.operation.result.review.id,protocolId=review.operation.result.protocol.id;
  const work=await mutate('create-workset','reviewEligibility',()=>({action:'create-workset',reviewId,data:{
    protocolId,name:'Both unchanged original RIS records',occurrenceIds:originals.items.map(x=>x.occurrenceId),
    reason:'Retain and screen every record in the original two-document packet.'}}));
  const workSetId=work.operation.result.workSet.id;
  for(let index=0;index<originals.items.length;index++){
    const row=originals.items[index],include=/^Europe PMC in 2023$/i.test(row.title.trim());
    need(include||/EMBL.*European Bioinformatics Institute.*2023/i.test(row.title),'Unexpected source title; inspect it before screening');
    const reason=include?'The original TI value names Europe PMC in 2023 exactly.':'The original TI value names the broader EMBL-EBI institute in 2023; it does not satisfy the selected specific-title criterion.';
    const decision=await mutate('decide-'+index,'reviewEligibility',()=>({action:'decide',reviewId,data:{
      workSetId,occurrenceId:row.occurrenceId,stageId:'metadata-screening',disposition:include?'include':'exclude',
      criterionAnswers:[{criterionId:'europe-pmc-title',assessment:include?'meets':'does_not_meet',note:reason}],
      exclusionReasonId:include?null:'broader-infrastructure',basis:{availability:'not_required',occurrenceIds:[row.occurrenceId],
        locator:'Original RIS TI, DO and PY fields; source SHA-256 '+row.sourceSha256,note:'Metadata-only screening; full text was not retrieved.'},
      reason,supersedes:null}}));
    await mutate('resolve-'+index,'reviewEligibility',()=>({action:'resolve',reviewId,data:{workSetId,
      occurrenceId:row.occurrenceId,stageId:'metadata-screening',mode:'consensus',disposition:include?'include':'exclude',
      decisionIds:[decision.operation.result.decision.id],exclusionReasonId:include?null:'broader-infrastructure',
      reason:'Resolve the one declared automated metadata decision under the saved single-reviewer protocol. '+reason}}));
  }
  const source=await store.studyFlowSources(id,{questionId:qid,reviewId,limit:100});
  const definition={schema:'sf88-research-study-flow-definition/v1',name:'Selected Crossref metadata — native flow',
    description:'Two source-bound retained records, one explicit title-level inclusion and one exclusion. Retrieval and underlying study identities remain unestablished.',
    template:'new-databases',questionId:qid,reviewId,workSetIds:[workSetId],editionIds:[receipt.receipt.editionId],
    routes:[{editionId:receipt.receipt.editionId,kind:'database',label:'Crossref — two selected original DOI metadata responses'}],
    stages:[{workSetId,screening:['metadata-screening'],fullText:[]}],
    records:source.items.map(row=>({occurrenceId:row.occurrenceId,workSetId,disposition:'candidate',duplicateOf:null,
      reportKey:null,reason:'This distinct original record belongs to the explicitly selected metadata work set.',basis:{}})),
    retrievals:[],reportAnchors:[],reportedCounts:[],exclusionReasons:[],previous:{},
    coverage:{statement:'Complete handling of the two selected original responses only. No exhaustive search or full-text retrieval has been performed.',
      completeSearch:false,screeningBy:'automation',screeningByHuman:0,screeningByAutomation:1},
    notes:'A DOI identifies a report; it does not establish an underlying study. Missing retrieval observations and study identities retain null counts.'};
  const initialPreview=await phase('flow-preview',async()=>{
    const current=await store.getMetadata(id);const value=await store.previewStudyFlow(id,{expectedRevision:current.revision,definition});
    need(value.report.summary.mathematicallyConsistent,'Native flow requires an accounting correction');
    const count=key=>value.report.counts.find(x=>x.id===key)?.value;
    need(count('database_results')===2&&count('records_screened')===2&&count('records_excluded')===1,'Original metadata screening count mismatch');
    need(value.report.summary.reportingComplete===false&&count('total_studies')===null,'Unestablished studies must remain unknown');
    await durable(join(out,'preview.json'),encode(value),{exclusive:true});return value;
  });
  const saved=await mutate('save-flow-v1','reviewStudyFlow',()=>({action:'save',data:{definition,sourceMode:'current',basisEditionId:null,
    supersedes:null,reason:'Save the complete original-source metadata selection with unresolved retrieval and study counts explicitly retained.'}}));
  const flowId=saved.operation.flowId,firstEditionId=saved.operation.result.edition.id;
  await phase('same-request-recovery',async()=>{
    const before=await store.getMetadata(id),request=await optionalJson(join(out,'requests','save-flow-v1.json'));
    const result=await store.reviewStudyFlow(id,request),after=await store.getMetadata(id);
    need(result.duplicate===true&&before.revision===after.revision&&result.operation.id===saved.operation.id,'Original request replay created a second edition');
    return{requestId:request.requestId,duplicate:result.duplicate,revision:after.revision,operationId:result.operation.id};
  });
  await mutate('review-flow-v1','reviewStudyFlow',()=>({action:'review',flowId,data:{editionId:firstEditionId,
    reason:'Reviewed the source membership, two screened records and one exclusion. Full-text retrieval, study identity and complete-search coverage remain explicitly unknown or incomplete.'}}));
  const csv='\uFEFF"data","n"\r\n"database_results","2"\r\n"records_screened","2"\r\n"records_excluded","1"\r\n';
  const imported=await phase('import-counts',async()=>{
    const current=await store.getMetadata(id),value=await store.importStudyFlowCounts(id,{expectedRevision:current.revision,body:csv,
      filename:'selected-original-record-counts.csv',reference:'Original native metadata work set '+workSetId+'; original packet SHA-256 '+PACKET_SHA,
      reason:'Explicit operator CSV reproduces the three known counts from the native work set; all other counts retain their source-derived unknown values.'});
    need(value.bytes===Buffer.byteLength(csv)&&value.sha256===sha(Buffer.from(csv)),'Original BOM CSV bytes changed');
    await durable(join(out,'inputs','selected-original-record-counts.csv'),Buffer.from(csv),{exclusive:true});return value;
  });
  const revisedDefinition={...definition,name:'Selected Crossref metadata — attributed count edition',reportedCounts:imported.counts,
    notes:definition.notes+' The original BOM-prefixed quoted-header CSV is retained in this saved operation.'};
  const revised=await mutate('save-flow-v2','reviewStudyFlow',()=>({action:'save',flowId,data:{definition:revisedDefinition,
    sourceMode:'retained',basisEditionId:firstEditionId,supersedes:firstEditionId,
    reason:'Retain the exact original source snapshot and add the attributed operator count file.',importFile:imported.importFile}}));
  const secondEditionId=revised.operation.result.edition.id;
  await mutate('review-flow-v2','reviewStudyFlow',()=>({action:'review',flowId,data:{editionId:secondEditionId,
    reason:'Reviewed the retained source snapshot and unchanged known counts, including exact original CSV bytes. Incomplete reporting status remains explicit.'}}));
  const updateDefinition={...revisedDefinition,name:'Updated reporting edition — retained prior unknowns',template:'update-databases',
    previous:{editionId:secondEditionId,reason:'Carry forward the preceding reviewed metadata report; no new source acquisition or underlying study identification is claimed.',basis:{
      reference:'Saved native flow '+flowId+' edition '+secondEditionId,locator:'Previous reviewed report; complete source snapshot and counts'}}};
  const update=await mutate('save-update-flow','reviewStudyFlow',()=>({action:'save',data:{definition:updateDefinition,sourceMode:'current',
    basisEditionId:null,supersedes:null,reason:'Create the update variant from the actual preceding reviewed report while preserving unknown prior study and report totals.'}}));
  const updateFlowId=update.operation.flowId,updateEditionId=update.operation.result.edition.id;
  await mutate('review-update-flow','reviewStudyFlow',()=>({action:'review',flowId:updateFlowId,data:{editionId:updateEditionId,
    reason:'Reviewed the actual previous-edition linkage and complete retained input membership. Unknown previous/current study counts are not converted into zeros.'}}));
  const deliver=await phase('complete-flow-exports',async()=>{
    const meta=await store.getMetadata(id),current=await store.studyFlowReport(id,{flowId:updateFlowId}),historical=await store.studyFlowReport(id,{flowId,editionId:firstEditionId});
    need(current.report.summary.mathematicallyConsistent&&!current.report.summary.reportingComplete,'Updated accounting changed');
    need(current.report.source.previous.editionId===secondEditionId,'Previous reporting edition changed');
    need(current.report.counts.find(x=>x.id==='previous_studies').value===null,'Unknown previous study count became zero');
    need(historical.report.definition.reportedCounts.length===0,'Historical edition was mutated');
    const files=[];
    for(const [label,selected] of [['reviewed-metadata',{flowId}],['reviewed-update',{flowId:updateFlowId}]]){
      for(const format of ['json','svg','html','csv']){
        const value=await store.exportStudyFlow(id,{...selected,format,section:'counts',revision:meta.revision});
        files.push(await outputFile(join(out,'exports',label),value.filename,value.body));
      }
      for(const section of ['records','reports']){
        const value=await store.exportStudyFlow(id,{...selected,format:'csv',section,revision:meta.revision});
        files.push(await outputFile(join(out,'exports',label),value.filename,value.body));
      }
    }
    const portable=await store.exportDossier(id,{format:'json',revision:meta.revision});
    const original=await outputFile(join(out,'exports'),'workspace.research.json',portable.body);files.push(original);
    await durable(join(out,'reports','reviewed-update.json'),encode(current.report),{exclusive:true});
    await durable(join(out,'reports','historical-metadata.json'),encode(historical.report),{exclusive:true});
    return{revision:meta.revision,reportSha256:current.report.reportSha256,summary:current.report.summary,
      flowId,firstEditionId,secondEditionId,updateFlowId,updateEditionId,files,portable:original,
      exactNativeCounts:current.report.counts.map(({id,value,mode})=>({id,value,mode}))};
  });
  const receiving=await phase('portable-receiving',async()=>{
    const bytes=await readFile(deliver.portable.path);need(bytes.length===deliver.portable.bytes&&sha(bytes)===deliver.portable.sha256,'Original portable changed');
    const reopened=await openDossierStore(join(out,'receiving','dossiers'));
    const result=await reopened.reopen(JSON.parse(bytes));
    const metadata=await reopened.getMetadata(id),report=await reopened.studyFlowReport(id,{flowId:updateFlowId});
    need(metadata.revision===deliver.revision&&report.report.reportSha256===deliver.reportSha256,'Native received flow changed');
    const history=await reopened.listRevisions(id),originalHistory=await store.listRevisions(id);
    need(same(history,originalHistory),'Original revision history changed in receiving');
    const recovered=await reopened.reviewStudyFlow(id,await optionalJson(join(out,'requests','save-flow-v1.json')));
    need(recovered.duplicate===true&&(await reopened.getMetadata(id)).revision===metadata.revision,'Receiving request recovery changed history');
    const exact=await reopened.exportStudyFlow(id,{flowId:updateFlowId,format:'svg'});
    const sourceSvg=deliver.files.find(f=>f.path.includes('reviewed-update')&&f.filename.endsWith('.svg'));
    need(sha(exact.body)===sourceSvg.sha256,'Received original SVG changed');
    await durable(join(out,'receiving','result.json'),encode({metadata,history,reportSha256:report.report.reportSha256,
      duplicateRecovered:recovered.operation.requestId,svgSha256:sha(exact.body)}),{exclusive:true});
    return{directory:join(out,'receiving','dossiers'),revision:metadata.revision,revisions:history.length,
      reportSha256:report.report.reportSha256,duplicateRecovered:true,originalSvgMatched:true};
  });
  const result={schema:'commons.study-flow-native-result/v1',operationId:OP,completedAt:new Date().toISOString(),
    sourcePin:journal.sourcePin,dossierId:id,questionId:qid,reviewId,workSetId,sourceDocuments:2,sourceOccurrences:2,
    sourcePacketSha256:PACKET_SHA,sourceTerms:sourceInput.sourceTerms,
    actualScope:'One automated title-and-identifier review of the two original retained Crossref RIS responses. No new search, full-text retrieval, independent human reviewer, clinical study grouping or native NCT commissioning occurred.',
    native:deliver,receiving,browser:{state:'not-operated',reason:'Separate continuation must attach to this exact saved dossier; the core operation does not launch a browser.'}};
  await durable(join(out,'result.json'),encode(result));journal.result={path:join(out,'result.json'),sha256:sha(encode(result))};
  journal.phase='complete';await checkpoint();console.log(JSON.stringify(result));return result;
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]??'')).href){
  runStudyFlowOperation(parseArgs(process.argv.slice(2))).catch(error=>{console.error(JSON.stringify({error:error.code??error.name,message:error.message,stack:error.stack}));process.exitCode=1;});
}
