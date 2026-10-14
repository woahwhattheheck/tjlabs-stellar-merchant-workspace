/* MIT. Immutable PrivacyBench source, edition, comparison and named-return lifecycle.
 * All provider metric projection and Research preparation uses the maintained factories.
 */
function createPrivacyBenchWorkspace(options) {
"use strict";
const {codec,nativePrivacyBench:pb,nativeResearch:nr}=options;
const SELECTION_TEMPLATE={"schema":"sf88-privacybench-preparation/v1","dataset":{"id":"TJLABS-SOFTWARE-FIXTURE-NOT-TONIC-DATA","revision":"fixture-v1"},"cohortRef":"software-fixture-001","results":{"file":"native-results.fixture.json","bytes":1932,"sha256":"c79c69b2d277f6af2e75c63a7845dcdf0de4feee117eab75491be97993eb9ec6"},"originals":[],"protocol":{"questionId":"training-question-privacybench-intake","title":"Software receiving fixture — original native result intake","purpose":"Exercise exact original result preservation. No benchmark or customer model was run.","scope":"One authored native-shaped JSON input for software receiving.","criteria":[{"id":"privacybench.gold","label":"gold","kind":"MEASURED","unit":"span_count","direction":"DESCRIPTIVE","description":"Original count of in-scope gold spans in this group."},{"id":"privacybench.detected","label":"detected","kind":"MEASURED","unit":"span_count","direction":"DESCRIPTIVE","description":"Original count of gold spans detected with the matching entity label and native-coordinate overlap."},{"id":"privacybench.coherent","label":"coherent","kind":"MEASURED","unit":"span_count","direction":"DESCRIPTIVE","description":"Original count of detected gold spans with a changed replacement judged coherent."},{"id":"privacybench.incoherent","label":"incoherent","kind":"MEASURED","unit":"span_count","direction":"DESCRIPTIVE","description":"Original count of detected gold spans left identical or judged incoherent."},{"id":"privacybench.skipped","label":"skipped","kind":"MEASURED","unit":"span_count","direction":"DESCRIPTIVE","description":"Original count of detected changed spans lacking a usable judge verdict; these remain in the detected denominator."},{"id":"privacybench.ner_recall","label":"ner recall","kind":"MEASURED","unit":"fraction","direction":"HIGHER","description":"Original detected/gold rate. Detection requires the producer label and native-coordinate overlap contract."},{"id":"privacybench.synthesis_accuracy","label":"synthesis accuracy","kind":"MEASURED","unit":"fraction","direction":"HIGHER","description":"Original coherent/detected rate. Identity mappings and unjudged detected spans do not become successful synthesis."},{"id":"privacybench.combined_accuracy","label":"combined accuracy","kind":"MEASURED","unit":"fraction","direction":"HIGHER","description":"Original coherent/gold rate. This includes detection misses in its original gold-span denominator."}],"sourceRefs":[]},"candidate":{"name":"Authored intake fixture","kind":"PLATFORM","version":"fixture-v1","description":"No provider model was executed.","configuration":{"fixture":true},"sourceRefs":[]},"run":{"externalRunId":"training-privacybench-original-001","kind":"TRAINING_FIXTURE","status":"SUCCEEDED","startedAt":"2026-10-13T18:30:00.000Z","finishedAt":"2026-10-13T18:30:00.000Z","elapsedMs":0,"engine":{"name":"TJLabs authored software fixture","version":"1","command":[],"runtime":{},"configuration":{"fixture":true}},"input":{"cohortId":"software-fixture-001","protocolId":"fixture-v1","definition":{"fixture":true},"sourceRefs":[]},"limitations":["Authored software receiving input; timestamps are fixture metadata, not an observed evaluation."]},"reviewer":"TJLabs software receiving fixture","reviewedAt":"2026-10-13T18:30:00.000Z"};
const SCHEMA="tjlabs.privacybench-workspace.v1",ENVELOPE="tjlabs.privacybench-working.v1";
const MAX=64*1024*1024,MAX_SOURCE=32*1024*1024,collections=["sources","selections","editions","comparisons","reviews","adoptions"];
const clone=x=>JSON.parse(JSON.stringify(x));
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const need=(ok,code,details={})=>{if(!ok)throw Object.assign(new Error(code),{code,details});};
const canonical=x=>Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const json=x=>JSON.stringify(x,(_k,v)=>{need(v!==undefined&&typeof v!=="bigint"&&typeof v!=="function"&&typeof v!=="symbol"&&(typeof v!=="number"||Number.isFinite(v)),"JSON_VALUE");return v;});
const hash=x=>codec.sha256Bytes(codec.utf8Encode(json(canonical(x))));
const same=(a,b)=>hash(a)===hash(b);
const text=(v,name,max=20000,empty=false)=>{need(typeof v==="string"&&v.length<=max&&(empty||v.trim().length>0),name);return v;};
const id=v=>{need(typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(v),"ID_INVALID");return v;};
const time=v=>{need(typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v,"TIME_INVALID");return v;};
const fields=(v,names,code="FIELDS_INVALID")=>{need(object(v)&&Object.keys(v).every(k=>names.includes(k)),code);return v;};
const record=(w,k,key)=>{const r=w[k].find(r=>r.id===key);need(r,"RECORD_MISSING",{collection:k,id:key});return r;};
const bytesText=b=>{const t=nr.Buffer.from(b).toString("utf8");need(sameBytes(codec.utf8Encode(t),b),"SOURCE_UTF8");return t;};
const sameBytes=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const sourceBytes=r=>codec.fromBase64(r.body.contentBase64);
const sourceText=r=>bytesText(sourceBytes(r));
const size=w=>{const n=codec.utf8Encode(json(w)).length;need(n<=MAX,"WORKSPACE_LIMIT",{bytes:n,limit:MAX});return n;};
const parent=(w,k,p)=>{need(p===null||typeof p==="string","PARENT_REQUIRED");if(p!==null)record(w,k,p);};
const safeSource=b=>{
 fields(b,["name","role","mediaType","contentBase64","text"]);
 text(b.name,"SOURCE_NAME",4096);text(b.mediaType,"SOURCE_MEDIA",200);
 need(["results","summary","viewer","configuration","notes","support","prior_review"].includes(b.role),"SOURCE_ROLE");
 need((typeof b.contentBase64==="string")!==(typeof b.text==="string"),"SOURCE_CONTENT_EXCLUSIVE");
 let bytes;
 if(typeof b.text==="string"){bytes=codec.utf8Encode(b.text);need(bytesText(bytes)===b.text,"SOURCE_UTF8");}
 else {
  const s=b.contentBase64,pad=s.endsWith("==")?2:s.endsWith("=")?1:0;
  need(s.length<=Math.ceil(MAX_SOURCE/3)*4&&s.length%4===0&&!/[^A-Za-z0-9+/]/.test(s.slice(0,s.length-pad)),"SOURCE_BASE64");
  bytes=codec.fromBase64(s);need(codec.toBase64(bytes)===s,"SOURCE_BASE64_CANONICAL");
 }
 need(bytes.length<=MAX_SOURCE,"SOURCE_LIMIT");
 if(b.role==="results")pb.parseNativeJson(bytesText(bytes));
 return {name:b.name,role:b.role,mediaType:b.mediaType,contentBase64:codec.toBase64(bytes),bytes:bytes.length,sha256:codec.sha256Bytes(bytes)};
};
function create(v){
 fields(v,["id","label","createdAt"]);return {schema:SCHEMA,id:id(v.id),label:text(v.label,"WORKSPACE_LABEL",1000),createdAt:time(v.createdAt),revision:0,sources:[],selections:[],editions:[],comparisons:[],reviews:[],adoptions:[],operations:[]};
}
function selectionTemplate(){return clone(SELECTION_TEMPLATE);}
function selectionInput(w,v){
 fields(v,["label","resultId","originalBindings","dataset","cohortRef","protocol","candidate","run","reviewer","reviewedAt","parentId","previewSha256"]);
 const b=clone(v);delete b.previewSha256;text(b.label,"SELECTION_LABEL",1000);parent(w,"selections",b.parentId);
 const result=record(w,"sources",id(b.resultId));need(result.body.role==="results","RESULT_SOURCE_ROLE");
 need(Array.isArray(b.originalBindings)&&b.originalBindings.length<=190,"ORIGINAL_BINDINGS");
 const sourceIds=new Set(),names=new Set(),paths=new Set();
 const originals=b.originalBindings.map((x,i)=>{
  fields(x,["sourceId","id","path","role","mediaType"]);const s=record(w,"sources",id(x.sourceId));
  id(x.id);text(x.path,"ORIGINAL_PATH",4096);text(x.role,"ORIGINAL_ROLE",2000);text(x.mediaType,"ORIGINAL_MEDIA",200);
  need(!sourceIds.has(x.sourceId)&&!names.has(x.id)&&!paths.has(x.path),"ORIGINAL_DUPLICATE");
  sourceIds.add(x.sourceId);names.add(x.id);paths.add(x.path);
  return {id:x.id,file:"support/"+i,path:x.path,role:x.role,mediaType:x.mediaType,bytes:s.body.bytes,sha256:s.body.sha256};
 });
 const selection={schema:"sf88-privacybench-preparation/v1",dataset:b.dataset,cohortRef:b.cohortRef,
 results:{file:"results.json",bytes:result.body.bytes,sha256:result.body.sha256},originals,
 protocol:b.protocol,candidate:b.candidate,run:b.run,reviewer:b.reviewer,reviewedAt:b.reviewedAt};
 return {body:b,result,selection,originals};
}
const preparationCache=new Map();let preparationCacheBytes=0;
function cachedPreparation(key){const v=preparationCache.get(key);if(!v)return null;preparationCache.delete(key);preparationCache.set(key,v);return clone(v.value);}
function retainPreparation(key,value){const bytes=codec.utf8Encode(json(value)).length;if(bytes>8*1024*1024)return;while(preparationCache.size>=32||preparationCacheBytes+bytes>64*1024*1024){const first=preparationCache.keys().next().value;if(first===undefined)break;preparationCacheBytes-=preparationCache.get(first).bytes;preparationCache.delete(first);}preparationCache.set(key,{bytes,value:clone(value)});preparationCacheBytes+=bytes;}
async function prepareSelection(w,v){
 const {body,result,selection}=selectionInput(w,v);
 const cacheKey=hash({workspaceId:w.id,body,result:result.body,originals:body.originalBindings.map(x=>record(w,"sources",x.sourceId).body)}),cached=cachedPreparation(cacheKey);
 if(cached)return cached;
 const by=new Map([["results.json",nr.Buffer.from(sourceBytes(result))],
 ...body.originalBindings.map((x,i)=>["support/"+i,nr.Buffer.from(sourceBytes(record(w,"sources",x.sourceId)))])]);
 const out=await pb.materializePrivacyBench(selection,{readOriginal:async path=>{need(by.has(path),"ORIGINAL_FILE_MISSING");return by.get(path);}});
 const nativeFiles=new Map(out.files.map(f=>[nr.resolve("/privacybench-selected-inputs",f.path),f.body]));
 const p=await nr.prepareOutput(out.plan,{baseDirectory:"/privacybench-selected-inputs",readOriginal:async path=>{need(nativeFiles.has(path),"PREPARED_FILE_MISSING");return nativeFiles.get(path);}});
 const table=pb.privacyBenchTable(sourceText(result),{datasetId:body.dataset.id,datasetRevision:body.dataset.revision,cohortRef:body.cohortRef});
 const binding={workspaceId:w.id,body,source:{id:result.id,bytes:result.body.bytes,sha256:result.body.sha256},
 originals:body.originalBindings.map(x=>({sourceId:x.sourceId,sha256:record(w,"sources",x.sourceId).body.sha256})),tableSha256:codec.sha256Bytes(codec.utf8Encode(table.csv)),runSha256:hash(p.envelope)};
 const prepared={sha256:hash(binding),body,table,review:p.review,run:p.envelope,plan:out.plan,nativeSelection:selection,
 files:out.files.map(f=>({path:f.path,name:f.name,bytes:f.bytes,sha256:f.sha256,contentBase64:codec.toBase64(f.body)}))};
 retainPreparation(cacheKey,prepared);return prepared;
}
async function previewSelection(w,v){return prepareSelection(w,v);}
async function previewEdition(w,v){
 fields(v,["label","selectionId","parentId","previewSha256"]);const body={label:text(v.label,"EDITION_LABEL",1000),selectionId:id(v.selectionId),parentId:v.parentId};
 parent(w,"editions",body.parentId);const selection=record(w,"selections",body.selectionId);
 const out=await prepareSelection(w,selection.body.input);need(out.sha256===selection.body.previewSha256,"SELECTION_DERIVATION_CHANGED");
 return {...out,body,selection,sha256:hash({workspaceId:w.id,body,selectionSha256:out.sha256})};
}
async function inspectEdition(w,key){
 const edition=record(w,"editions",key),out=await previewEdition(w,edition.body.input);
 need(out.sha256===edition.body.previewSha256,"EDITION_DERIVATION_CHANGED");
 return {...out,edition};
}
function metricKey(r){return json([r.dimension,r.group,r.label,r.measure]);}
function decimal(v){
 const m=String(v).match(/^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/);need(m,"DECIMAL_TOKEN");
 let digits=(m[2]+(m[3]||"")).replace(/^0+/,"");if(!digits)return {sign:0,digits:"0",exponent:0n};
 let exponent=BigInt(m[4]||"0")-BigInt((m[3]||"").length);
 while(digits.endsWith("0")){digits=digits.slice(0,-1);exponent++;}
 return {sign:m[1]?-1:1,digits,exponent};
}
function decimalChange(a,b){
 const x=decimal(a),y=decimal(b);let cmp;
 if(x.sign!==y.sign)cmp=y.sign>x.sign?1:-1;
 else if(x.sign===0)cmp=0;
 else {const xx=BigInt(x.digits.length)+x.exponent,yy=BigInt(y.digits.length)+y.exponent;
  if(xx!==yy)cmp=yy>xx?1:-1;
  else {const len=Math.max(x.digits.length,y.digits.length),xd=x.digits.padEnd(len,"0"),yd=y.digits.padEnd(len,"0");cmp=yd===xd?0:yd>xd?1:-1;}
  cmp*=x.sign;
 }
 const change=cmp>0?"increased":cmp<0?"decreased":"equal";
 const base=x.exponent<y.exponent?x.exponent:y.exponent,xe=x.exponent-base,ye=y.exponent-base;
 if(xe>4096n||ye>4096n||base>4096n||base< -4096n||x.digits.length>4096||y.digits.length>4096)
  return {change,delta:null,deltaReason:"Exact original tokens retained; expanded decimal difference exceeds the display limit."};
 const n=BigInt(y.digits)*BigInt(y.sign)*10n**ye-BigInt(x.digits)*BigInt(x.sign)*10n**xe;
 let d=(n<0n?-n:n).toString(),out;if(base>=0n)out=d+"0".repeat(Number(base));else {const places=Number(-base);d=d.padStart(places+1,"0");out=d.slice(0,-places)+"."+d.slice(-places);out=out.replace(/0+$/,"").replace(/\.$/,"");}
 return {change,delta:(n<0n?"-":"")+out,deltaReason:"Exact subtraction of the two original metric tokens; no rate is recomputed."};
}
function nativeContext(w,selection){
 const src=record(w,"sources",selection.body.input.resultId),p=pb.parseNativeJson(sourceText(src));
 function typed(v,path){if(p.lexemes.has(path))return {number:p.lexemes.get(path)};if(Array.isArray(v))return v.map((x,i)=>typed(x,path+"/"+i));if(object(v))return Object.fromEntries(Object.keys(v).sort().filter(k=>!(path==="/config"&&["run_name","predictions","ground_truth","characters"].includes(k))).map(k=>[k,typed(v[k],path+"/"+k.replace(/~/g,"~0").replace(/\//g,"~1"))]));return v;}
 return {config:typed(p.value.config,"/config"),judgeSkipped:p.value.metrics.judge_skipped};
}
async function previewComparison(w,v){
 fields(v,["label","leftId","rightId","basis","reviewer","note","previewSha256"]);
 const body=clone(v);delete body.previewSha256;text(body.label,"COMPARISON_LABEL",1000);text(body.reviewer,"REVIEWER",240);text(body.note,"COMPARISON_NOTE",20000);
 fields(body.basis,["dataset","cohort","protocol","judge","rationale"]);
 for(const k of ["dataset","cohort","protocol","judge"])need(["same","changed","unknown"].includes(body.basis[k]),"COMPARISON_BASIS",{key:k});
 text(body.basis.rationale,"COMPARISON_RATIONALE",20000);need(body.leftId!==body.rightId,"COMPARISON_DISTINCT_EDITIONS");
 const left=await inspectEdition(w,body.leftId),right=await inspectEdition(w,body.rightId),l=left.selection.body.input,r=right.selection.body.input;
 const observed={dataset:same(l.dataset,r.dataset),cohort:l.cohortRef===r.cohortRef,protocol:same(l.protocol,r.protocol),judge:same(nativeContext(w,left.selection),nativeContext(w,right.selection))};
 const caveats=[];
 for(const k of ["dataset","cohort","protocol","judge"]){if(body.basis[k]!=="same")caveats.push(k+" comparability is declared "+body.basis[k]+".");else if(!observed[k])caveats.push(k+" was declared same, but the retained metadata differs.");}
 const comparable=caveats.length===0;
 caveats.push("Values are original provider metrics. Observed differences do not prove improved privacy, production safety or customer acceptance.");
 caveats.push("Overlapping character, organisation and file-kind groups are never summed.");
 const rm=new Map(right.table.rows.map(x=>[metricKey(x),x])),rows=[],unmatchedLeft=[];
 for(const a of left.table.rows){const key=metricKey(a),b=rm.get(key);if(!b){unmatchedLeft.push(a);continue;}rm.delete(key);
 const delta=a.value===""||b.value===""?{change:"unavailable",delta:null,deltaReason:"At least one original metric is unavailable; original null reasons are retained."}:decimalChange(a.value,b.value);
 const sameGold=a.original_gold===b.original_gold,rowComparable=comparable&&sameGold;
 rows.push({id:"pair-"+hash(key),key,dimension:a.dimension,group:a.group,label:a.label,measure:a.measure,left:a,right:b,...delta,comparable:rowComparable,reason:!sameGold?"The original gold population differs for this group. Preserve both original denominators; review dataset/cohort correspondence.":rowComparable?"Explicit declarations and retained contexts agree.":"Review the comparability caveats; this is an observed change only."});
 }
 const goldDifferences=rows.filter(r=>r.left.original_gold!==r.right.original_gold).length;if(goldDifferences)caveats.push(goldDifferences+" paired metric rows have different original gold populations. Their observed changes are retained without comparability.");
 const result={body,rows,unmatchedLeft,unmatchedRight:[...rm.values()],caveats,observed,left:{id:left.edition.id,label:left.body.label,sha256:left.sha256},right:{id:right.edition.id,label:right.body.label,sha256:right.sha256}};
 return {...result,sha256:hash({workspaceId:w.id,...result})};
}
function latestReview(w,{subject,subjectId,target}){
 const all=w.reviews.filter(x=>x.body.subject===subject&&x.body.subjectId===subjectId&&x.body.target===target);
 return all.length?clone(all[all.length-1]):null;
}
async function subjectInfo(w,subject,key){
 need(subject==="edition"||subject==="comparison","REVIEW_SUBJECT");const r=record(w,subject==="edition"?"editions":"comparisons",key);
 const data=subject==="edition"?await inspectEdition(w,key):await previewComparison(w,r.body.input);
 if(subject==="comparison")need(data.sha256===r.body.previewSha256,"COMPARISON_DERIVATION_CHANGED");
 return {record:r,data,sha256:hash({record:r,derivedSha256:data.sha256})};
}
async function checkReview(w,b,{parentCheck=true}={}){
 fields(b,["subject","subjectId","target","status","owner","note","reviewer","parentId"]);
 const out=await subjectInfo(w,b.subject,b.subjectId);text(b.target,"REVIEW_TARGET",4096);
 const targets=b.subject==="edition"?out.data.table.rows.map(r=>r.source_pointer):out.data.rows.map(r=>r.id);
 need(b.target==="all"||targets.includes(b.target),"REVIEW_TARGET_UNKNOWN");
 need(["open","accept","investigate","defer"].includes(b.status),"REVIEW_STATUS");
 text(b.owner,"REVIEW_OWNER",240);text(b.note,"REVIEW_NOTE",20000);text(b.reviewer,"REVIEWER",240);
 need(b.parentId===null||typeof b.parentId==="string","PARENT_REQUIRED");
 if(parentCheck){const current=latestReview(w,b);need((current?.id??null)===b.parentId,"REVIEW_PARENT_CHANGED");}
 return out;
}
async function exportReviewReturn(w,{subject,subjectId}){
 await validateWorkspace(w);const s=await subjectInfo(w,subject,subjectId);
 const b={schema:"tjlabs.privacybench-review-return.v1",workspaceId:w.id,subject,subjectId,subjectSha256:s.sha256,
 reviews:clone(w.reviews.filter(r=>r.body.subject===subject&&r.body.subjectId===subjectId))};
 return {...b,sha256:hash(b)};
}
async function previewAdoption(w,v){
 fields(v,["returnSourceId","reviewer","note","previewSha256"]);const body={returnSourceId:id(v.returnSourceId),reviewer:text(v.reviewer,"REVIEWER",240),note:text(v.note,"ADOPTION_NOTE",20000)};
 const src=record(w,"sources",body.returnSourceId);need(src.body.role==="prior_review","RETURN_SOURCE_ROLE");
 const packet=JSON.parse(sourceText(src));fields(packet,["schema","workspaceId","subject","subjectId","subjectSha256","reviews","sha256"]);
 const unhashed=clone(packet);delete unhashed.sha256;
 need(packet.schema==="tjlabs.privacybench-review-return.v1"&&packet.workspaceId===w.id&&packet.sha256===hash(unhashed),"RETURN_BINDING");
 const info=await subjectInfo(w,packet.subject,packet.subjectId);need(info.sha256===packet.subjectSha256,"RETURN_SUBJECT_CHANGED");
 need(Array.isArray(packet.reviews)&&packet.reviews.length<=10000,"RETURN_REVIEWS");const copy=clone(w),additions=[],alreadyPresent=[],seen=new Set();
 for(const r of packet.reviews){fields(r,["id","body"]);id(r.id);need(!seen.has(r.id),"RETURN_DUPLICATE_ID");seen.add(r.id);
  need(r.body.subject===packet.subject&&r.body.subjectId===packet.subjectId,"RETURN_REVIEW_SCOPE");
  const prior=copy.reviews.find(x=>x.id===r.id);
  if(prior){need(same(prior,r),"RETURN_ID_CONFLICT");alreadyPresent.push(r.id);continue;}
  await checkReview(copy,r.body);copy.reviews.push(clone(r));additions.push(clone(r));
 }
 return {sha256:hash({workspaceId:w.id,body,sourceSha256:src.body.sha256,subjectSha256:info.sha256,currentReviews:w.reviews,additions,alreadyPresent}),body,additions,alreadyPresent,subject:packet.subject,subjectId:packet.subjectId};
}
async function perform(w,q){
 fields(q,["id","type","actor","at","input"]);id(q.id);time(q.at);
 if(typeof q.actor==="string")text(q.actor,"ACTOR",240);else {fields(q.actor,["id","name"]);id(q.actor.id);text(q.actor.name,"ACTOR",240);}
 need(object(q.input),"OPERATION_INPUT");json(q);
 const prior=w.operations.find(x=>x.request.id===q.id);if(prior){need(same(prior.request,q),"OPERATION_ID_CONFLICT");return {workspace:clone(w),result:clone(prior.result),replayed:true};}
 need(w.operations.length<10000,"OPERATION_LIMIT");
 let collection,body;const v=q.input;
 if(q.type==="source.add"){collection="sources";body=safeSource(v);}
 else if(q.type==="selection.save"){const p=await previewSelection(w,v);need(v.previewSha256===p.sha256,"SELECTION_PREVIEW_CHANGED");collection="selections";body={input:p.body,previewSha256:p.sha256};}
 else if(q.type==="edition.save"){const p=await previewEdition(w,v);need(v.previewSha256===p.sha256,"EDITION_PREVIEW_CHANGED");collection="editions";body={input:p.body,previewSha256:p.sha256};}
 else if(q.type==="comparison.save"){const p=await previewComparison(w,v);need(v.previewSha256===p.sha256,"COMPARISON_PREVIEW_CHANGED");collection="comparisons";body={input:p.body,previewSha256:p.sha256};}
 else if(q.type==="review.save"){await checkReview(w,v);collection="reviews";body=clone(v);}
 else if(q.type==="review.adopt"){const p=await previewAdoption(w,v);need(v.previewSha256===p.sha256,"RETURN_PREVIEW_CHANGED");collection="adoptions";body={input:p.body,previewSha256:p.sha256,subject:p.subject,subjectId:p.subjectId,addedReviewIds:p.additions.map(x=>x.id),alreadyPresent:p.alreadyPresent};}
 else need(false,"OPERATION_TYPE",{type:q.type});
 const next=clone(w),rid=collection.slice(0,-1)+"-"+hash({workspaceId:w.id,id:q.id,type:q.type}),result={collection,id:rid};
 if(q.type==="review.adopt"){const p=await previewAdoption(w,v);for(const r of p.additions)next.reviews.push(clone(r));}
 need(!next[collection].some(r=>r.id===rid),"RECORD_ID_CONFLICT");next[collection].push({id:rid,body});
 next.revision++;next.operations.push({request:clone(q),result,revision:next.revision});size(next);
 return {workspace:next,result,replayed:false};
}
const validated=new WeakMap();
async function validateWorkspace(w){
 need(object(w)&&w.schema===SCHEMA&&Array.isArray(w.operations)&&collections.every(k=>Array.isArray(w[k])),"WORKSPACE_SCHEMA");size(w);
 const fingerprint=hash(w);if(validated.get(w)===fingerprint)return w;
 let fresh=create({id:w.id,label:w.label,createdAt:w.createdAt});
 for(const op of w.operations){need(object(op)&&object(op.request),"OPERATION_HISTORY");const x=await perform(fresh,op.request);need(!x.replayed&&same(x.workspace.operations.at(-1),op),"OPERATION_HISTORY_CHANGED");fresh=x.workspace;}
 need(same(fresh,w),"WORKSPACE_REPLAY_CHANGED");validated.set(w,fingerprint);return w;
}
async function apply(w,q){await validateWorkspace(w);const x=await perform(w,q);validated.set(x.workspace,hash(x.workspace));return x;}
async function exportWorkspace(w){await validateWorkspace(w);return {schema:ENVELOPE,sha256:hash(w),workspace:clone(w)};}
async function importWorkspace(input){
 const x=typeof input==="string"?JSON.parse(input):clone(input);fields(x,["schema","sha256","workspace"]);
 need(x.schema===ENVELOPE&&x.sha256===hash(x.workspace),"WORKING_CHECKSUM");await validateWorkspace(x.workspace);return x.workspace;
}
async function report(w,{subject,id:key}){
 const s=await subjectInfo(w,subject,key);const history=clone(w.reviews.filter(r=>r.body.subject===subject&&r.body.subjectId===key));
 const latest=new Map();for(const r of history)latest.set(r.body.target,r);
 return {schema:"tjlabs.privacybench-report.v1",workspaceId:w.id,workspaceSha256:hash(w),subject,record:clone(s.record),data:s.data,reviews:[...latest.values()],history};
}
function csv(r){
 const cell=x=>'"'+String(x??"").replace(/"/g,'""')+'"';let headers,rows;
 if(r.subject==="edition"){headers=[...Object.keys(r.data.table.rows[0]||{}),"review_status","review_owner","review_note"];rows=r.data.table.rows.map(x=>{const rev=r.reviews.find(a=>a.body.target===x.source_pointer)||r.reviews.find(a=>a.body.target==="all");return {...x,review_status:rev?.body.status??"",review_owner:rev?.body.owner??"",review_note:rev?.body.note??""};});}
 else {headers=["row_kind","dimension","group","label","measure","left_value","right_value","left_denominator","right_denominator","left_null_reason","right_null_reason","change","delta","comparable","review_status","review_owner","review_note"];
 const row=(a,b,p,kind)=>{const rev=p?r.reviews.find(a=>a.body.target===p.id)||r.reviews.find(a=>a.body.target==="all"):null,x=a||b;return {row_kind:kind,dimension:x.dimension,group:x.group,label:x.label,measure:x.measure,left_value:a?.value??"",right_value:b?.value??"",left_denominator:a?.denominator_value??"",right_denominator:b?.denominator_value??"",left_null_reason:a?.undefined_reason??"",right_null_reason:b?.undefined_reason??"",change:p?.change??"",delta:p?.delta??"",comparable:p?String(p.comparable):"false",review_status:rev?.body.status??"",review_owner:rev?.body.owner??"",review_note:rev?.body.note??""};};
 rows=[...r.data.rows.map(p=>row(p.left,p.right,p,"paired")),...r.data.unmatchedLeft.map(x=>row(x,null,null,"unmatched_left")),...r.data.unmatchedRight.map(x=>row(null,x,null,"unmatched_right"))];}
 return headers.map(cell).join(",")+"\n"+rows.map(r=>headers.map(k=>cell(r[k])).join(",")).join("\n")+"\n";
}
async function prepareResearch(w,{editionId}){
 await validateWorkspace(w);const p=await inspectEdition(w,editionId),named=await report(w,{subject:"edition",id:editionId});
 const files=[];const add=(path,content)=>{const b=codec.utf8Encode(content);files.push({path,content,bytes:b.length,sha256:codec.sha256Bytes(b)});};
 add("selection.json",JSON.stringify(p.nativeSelection,null,2)+"\n");add("plan.json",JSON.stringify(p.plan,null,2)+"\n");
 add("research/run.json",JSON.stringify(p.run,null,2)+"\n");add("research/review.json",JSON.stringify(p.review,null,2)+"\n");add("research/review.html",nr.reviewHtml(p.review).toString("utf8"));
 add("workspace/complete-working-history.json",JSON.stringify(await exportWorkspace(w),null,2)+"\n");add("workspace/named-review.json",JSON.stringify(named,null,2)+"\n");
 const originals=p.files.map(f=>({path:"original/"+f.path,name:f.name,bytes:f.bytes,sha256:f.sha256,contentBase64:f.contentBase64}));
 // Text manifest carries binary originals losslessly without guessing an encoding.
 add("original/complete-original-files.json",JSON.stringify({schema:"tjlabs.exact-original-files.v1",files:originals},null,2)+"\n");
 add("README.md","# PrivacyBench Research handover\n\nThe Research run and review were produced by the maintained original preparation implementation. All selected original bytes are retained in original/complete-original-files.json, including binary supporting files. Named workspace reviews are retained separately and do not silently become Research judgments or acceptance. Import the exact research/run.json through the existing Research original-output workflow. Synthetic benchmark outputs do not establish production privacy or regulatory compliance.\n");
 add("manifest.json",JSON.stringify({schema:"tjlabs.privacybench-research-handover.v1",workspaceSha256:hash(w),editionId,files:files.map(({path,bytes,sha256})=>({path,bytes,sha256}))},null,2)+"\n");
 need(files.reduce((n,f)=>n+f.bytes,0)<=128*1024*1024,"RESEARCH_HANDOVER_LIMIT");
 return {workspaceSha256:hash(w),editionId,files,run:p.run,review:p.review,plan:p.plan};
}
async function handover(w){
 await validateWorkspace(w);return {workspace:await exportWorkspace(w),originals:w.sources.map(r=>({id:r.id,...clone(r.body)})),
 editions:await Promise.all(w.editions.map(r=>report(w,{subject:"edition",id:r.id}))),comparisons:await Promise.all(w.comparisons.map(r=>report(w,{subject:"comparison",id:r.id}))),reviews:clone(w.reviews),adoptions:clone(w.adoptions)};
}
return {create,apply,validateWorkspace,exportWorkspace,importWorkspace,selectionTemplate,previewSelection,previewEdition,inspectEdition,previewComparison,latestReview,exportReviewReturn,previewAdoption,report,csv,prepareResearch,handover,limits:{workspaceBytes:MAX,originalBytes:MAX_SOURCE},digest:hash};
}
