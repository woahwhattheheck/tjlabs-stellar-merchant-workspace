// MIT — Validate and render customer-selected source chronology.
// No provider call, dossier mutation, automatic temporal inference or new store.
// The caller first validates against its measured original document selection,
// then supplies the actual native bindings returned by the original receiver.

export const CUSTOMER_CHRONOLOGY_SCHEMA='commons.citation-chronology-selection.v1';
const FACT_KINDS=Object.freeze({
  notice_publication:'Notice publication',
  notice_effective:'Notice effective date',
  registered_update:'Registered update',
  source_retrieved:'Source retrieval',
  literature_search_completed:'Literature search completion',
  manuscript_submitted:'Manuscript submission',
  manuscript_accepted:'Manuscript acceptance',
  report_issued:'Report issue',
  reviewer_decision:'Reviewer decision'
});
const SUBJECT_KINDS=['source-document','notice','citing-review','cited-occurrence','finding','report'];
const SOURCE_KINDS=['native-http-capture','retained-provider-document','customer-supplied-document'];
const OBSERVATION_KINDS=['publisher-declared','provider-observed','customer-declared','reviewer-extracted','unknown'];
const RELATIONS=Object.freeze({
  'before-notice':'Before notice',
  'after-notice':'After notice',
  'overlaps-notice':'Overlaps notice',
  uncertain:'Uncertain',
  'not-assessed':'Not assessed'
});
const PRECISIONS=['instant','day','month','year','range','unknown'];
const KEY=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SHA=/^[a-f0-9]{64}$/;
const NATIVE_IDS={
  dossierId:/^d_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  questionId:/^q_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  editionId:/^e_[a-f0-9]{64}$/,
  occurrenceId:/^o_[a-f0-9]{64}$/,
  findingId:/^f_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  noticeId:/^cu_[a-f0-9]{64}$/
};
const MAX={documents:256,subjects:2000,facts:10000,interpretations:5000,refs:100,metadataDepth:12,metadataNodes:20000};
const plain=v=>v!==null&&typeof v==='object'&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
function fail(code,at,message){throw Object.assign(new Error(message+' ['+at+']'),{code,location:at});}
function need(ok,code,at,message){if(!ok)fail(code,at,message);}
function text(v,at,max=10000,{nullable=false,empty=false}={}){
  if(nullable&&v===null)return;
  need(typeof v==='string'&&v.length<=max&&(empty||v.trim().length>0)&&!/\u0000/.test(v),
    'CHRONOLOGY_TEXT_INVALID',at,'Use the complete declared text within its supported limit.');
  for(let i=0;i<v.length;i++){
    const c=v.charCodeAt(i);
    if(c>=0xd800&&c<=0xdbff){const next=v.charCodeAt(++i);need(next>=0xdc00&&next<=0xdfff,'CHRONOLOGY_TEXT_INVALID',at,'Text must contain valid Unicode.');}
    else need(c<0xdc00||c>0xdfff,'CHRONOLOGY_TEXT_INVALID',at,'Text must contain valid Unicode.');
  }
}
function keys(v,required,optional,at){
  need(plain(v),'CHRONOLOGY_OBJECT_INVALID',at,'Use a plain original JSON object.');
  need(required.every(k=>own(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k)),
    'CHRONOLOGY_FIELDS_INVALID',at,'Keep the declared field names and explicit required values.');
}
function key(v,at){need(typeof v==='string'&&KEY.test(v),'CHRONOLOGY_KEY_INVALID',at,'Use a nonempty stable source or subject key.');}
function list(v,at,max){
  need(Array.isArray(v)&&v.length<=max&&Object.keys(v).length===v.length&&Object.keys(v).every((k,i)=>k===String(i)),'CHRONOLOGY_LIST_INVALID',at,'Use the complete array within its supported limit.');
}
function distinct(v,at){
  need(new Set(v).size===v.length,'CHRONOLOGY_DUPLICATE',at,'Keep unique declared keys and references.');
}
function sourceUrl(v,at){
  if(v===null)return;
  text(v,at,8192);
  need(!/[\s<>]/.test(v),'CHRONOLOGY_SOURCE_URL_INVALID',at,'Keep the original source URL without whitespace or markup.');
  let parsed;try{parsed=new URL(v);}catch{fail('CHRONOLOGY_SOURCE_URL_INVALID',at,'Use an absolute original HTTP or HTTPS source URL, or explicit null.');}
  need(['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password,
    'CHRONOLOGY_SOURCE_URL_INVALID',at,'Use an original HTTP or HTTPS source URL without credentials.');
}
function jsonValue(value,at,depth=0,active=new Set(),counter={n:0}){
  counter.n++;need(depth<=MAX.metadataDepth&&counter.n<=MAX.metadataNodes,'CHRONOLOGY_METADATA_LIMIT',at,'Keep the supported complete provenance metadata.');
  if(value===null||typeof value==='boolean')return;
  if(typeof value==='string'){text(value,at,65536,{empty:true});return;}
  if(typeof value==='number'){need(Number.isFinite(value),'CHRONOLOGY_METADATA_INVALID',at,'Metadata numbers must be finite JSON values.');return;}
  need(Array.isArray(value)||plain(value),'CHRONOLOGY_METADATA_INVALID',at,'Provenance and licence data must remain ordinary JSON values.');
  if(Array.isArray(value))need(Object.keys(value).length===value.length&&Object.keys(value).every((k,i)=>k===String(i)),
    'CHRONOLOGY_METADATA_INVALID',at,'Metadata arrays must retain every original JSON item.');
  need(!active.has(value),'CHRONOLOGY_METADATA_INVALID',at,'Metadata must not contain cycles.');active.add(value);
  for(const [k,v] of Object.entries(value)){
    if(!Array.isArray(value))text(k,at+'.key',300);
    jsonValue(v,at+'.'+k,depth+1,active,counter);
  }
  active.delete(value);
}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const leap=y=>y%4===0&&(y%100!==0||y%400===0);
const monthDays=(y,m)=>[31,leap(y)?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
function dateParts(value,precision,at){
  const patterns={year:/^(\d{4})$/,month:/^(\d{4})-(\d{2})$/,day:/^(\d{4})-(\d{2})-(\d{2})$/};
  const m=patterns[precision]?.exec(value);
  need(m,'CHRONOLOGY_DATE_INVALID',at,'Use a normalized value with exactly its declared date precision.');
  const y=Number(m[1]),mo=precision==='year'?null:Number(m[2]),d=precision==='day'?Number(m[3]):null;
  need(y>=1&&y<=9999&&(mo===null||mo>=1&&mo<=12)&&(d===null||d>=1&&d<=monthDays(y,mo)),
    'CHRONOLOGY_DATE_INVALID',at,'The declared calendar date must exist.');
  return {year:y,month:mo,day:d};
}
function instant(value,at){
  text(value,at,100);
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  need(m,'CHRONOLOGY_INSTANT_INVALID',at,'An instant needs its full calendar date, seconds and explicit UTC offset.');
  const p=dateParts(m[1]+'-'+m[2]+'-'+m[3],'day',at);
  const h=Number(m[4]),mi=Number(m[5]),s=Number(m[6]),zone=m[8];
  need(h<24&&mi<60&&s<60,'CHRONOLOGY_INSTANT_INVALID',at,'Keep a valid clock time; no time or leap-second normalization is performed.');
  let offset=0;
  if(zone!=='Z'){
    const zh=Number(zone.slice(1,3)),zm=Number(zone.slice(4,6));
    need(zh<=14&&zm<60&&(zh!==14||zm===0)&&zone!=='-00:00',
      'CHRONOLOGY_TIMEZONE_INVALID',at,'Use a known UTC offset through fourteen hours; unknown offsets must remain unknown.');
    offset=(zone[0]==='-'?-1:1)*(zh*60+zm);
  }
  const date=new Date(0);date.setUTCFullYear(p.year,p.month-1,p.day);date.setUTCHours(h,mi,s,0);
  const nanos=BigInt(date.getTime()-offset*60000)*1000000n+BigInt((m[7]??'').padEnd(9,'0')||'0');
  return {...p,hour:h,minute:mi,second:s,zone,nanos};
}
function moment(value,precision,timezone,at){
  if(precision==='instant'){
    const parsed=instant(value,at);
    need(timezone===parsed.zone||(parsed.zone==='Z'&&timezone==='UTC'),
      'CHRONOLOGY_TIMEZONE_INVALID',at+'.timezone','Keep the normalized instant offset explicitly; preserve other original zone wording in raw_text.');
    return {kind:'instant',...parsed};
  }
  need(['year','month','day'].includes(precision),'CHRONOLOGY_PRECISION_INVALID',at,'Use a supported known endpoint precision.');
  need(timezone===null,'CHRONOLOGY_TIMEZONE_INVALID',at+'.timezone','Date-only facts do not acquire a timezone.');
  text(value,at,20);
  return {kind:precision,...dateParts(value,precision,at)};
}
function calendarNanos(y,m,d,last){
  const date=new Date(0);date.setUTCFullYear(y,m-1,d);date.setUTCHours(0,0,0,0);
  return BigInt(date.getTime())*1000000n+(last?86399999999999n:0n);
}
// These bounds reject impossible ranges only. They are never rendered as
// supplied dates and never generate a reviewer relation or causal conclusion.
// Calendar-only endpoints and offset-bearing instants are not ordered against
// one another: an unreported calendar timezone must not become implicit UTC.
function possibleBounds(parsed){
  if(parsed.kind==='instant')return [parsed.nanos,parsed.nanos];
  const minMonth=parsed.month??1,maxMonth=parsed.month??12;
  const minDay=parsed.day??1,maxDay=parsed.day??monthDays(parsed.year,maxMonth);
  return [calendarNanos(parsed.year,minMonth,minDay,false),calendarNanos(parsed.year,maxMonth,maxDay,true)];
}
function endpoint(value,at){
  if(value===null)return null;
  keys(value,['value','precision','timezone','inclusive'],[],at);
  need(typeof value.inclusive==='boolean'||value.inclusive===null,'CHRONOLOGY_RANGE_INVALID',at+'.inclusive','Declare whether the source includes the boundary, or keep that fact unknown.');
  const parsed=moment(value.value,value.precision,value.timezone,at+'.value');
  return {parsed,inclusive:value.inclusive};
}
function document(value,at){
  keys(value,['document_key','filename','bytes','sha256','media_type','source_url','source_kind','provenance','license'],
    ['relative_path','retrieved_at','entitlement','native_capture_ref'],at);
  key(value.document_key,at+'.document_key');text(value.filename,at+'.filename',512);
  need(!/[\\/\r\n]/.test(value.filename)&&!['.','..'].includes(value.filename),'CHRONOLOGY_FILENAME_INVALID',at+'.filename','Use the retained original plain filename.');
  need(Number.isSafeInteger(value.bytes)&&value.bytes>0,'CHRONOLOGY_DOCUMENT_BYTES_INVALID',at+'.bytes','Keep the positive exact original byte length.');
  need(typeof value.sha256==='string'&&SHA.test(value.sha256),'CHRONOLOGY_DOCUMENT_HASH_INVALID',at+'.sha256','Keep the exact original SHA-256.');
  text(value.media_type,at+'.media_type',200);need(/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:;[^\r\n<>]*)?$/.test(value.media_type),
    'CHRONOLOGY_MEDIA_TYPE_INVALID',at+'.media_type','Use the selected original media type.');
  sourceUrl(value.source_url,at+'.source_url');
  need(SOURCE_KINDS.includes(value.source_kind),'CHRONOLOGY_SOURCE_KIND_INVALID',at+'.source_kind','Keep the selected original source representation.');
  need(value.provenance===null||plain(value.provenance),'CHRONOLOGY_PROVENANCE_INVALID',at+'.provenance','Keep the original provenance object or explicit null.');
  need(value.license===null||typeof value.license==='string'||plain(value.license),'CHRONOLOGY_LICENSE_INVALID',at+'.license','Keep the selected original licence declaration or explicit null.');
  jsonValue(value.provenance,at+'.provenance');jsonValue(value.license,at+'.license');
  if(own(value,'entitlement'))jsonValue(value.entitlement,at+'.entitlement');
  if(own(value,'native_capture_ref'))jsonValue(value.native_capture_ref,at+'.native_capture_ref');
  if(own(value,'retrieved_at')&&value.retrieved_at!==null)instant(value.retrieved_at,at+'.retrieved_at');
  if(own(value,'relative_path')){
    text(value.relative_path,at+'.relative_path',2048);
    need(!value.relative_path.startsWith('/')&&!value.relative_path.includes('\\')&&
      value.relative_path.split('/').every(p=>p&&p!=='.'&&p!=='..'),
      'CHRONOLOGY_DOCUMENT_PATH_INVALID',at+'.relative_path','Keep a canonical relative original source path.');
  }
  return value;
}
function sourceReference(value,at,documents,subject){
  keys(value,['document_key','sha256','bytes','source_url','locator'],[],at);
  key(value.document_key,at+'.document_key');const selected=documents.get(value.document_key);
  need(selected,'CHRONOLOGY_DOCUMENT_NOT_SELECTED',at,'The source reference must resolve to a selected original document.');
  need(value.sha256===selected.sha256&&value.bytes===selected.bytes&&value.source_url===selected.source_url,
    'CHRONOLOGY_SOURCE_REFERENCE_CHANGED',at,'Source references must retain the selected document hash, bytes and original URL exactly.');
  text(value.locator,at+'.locator',3000);
  need(subject.document_keys.includes(value.document_key),'CHRONOLOGY_SUBJECT_SOURCE_MISMATCH',at,'Declare this source among the subject documents before referencing it.');
}
function validated(value,documents){
  keys(value,['schema','documents','subjects','facts','interpretations'],['selection_id','title','note'], 'chronology');
  need(value.schema===CUSTOMER_CHRONOLOGY_SCHEMA,'CHRONOLOGY_SCHEMA_INVALID','chronology.schema','Use the original customer chronology schema.');
  if(own(value,'selection_id'))key(value.selection_id,'chronology.selection_id');
  if(own(value,'title'))text(value.title,'chronology.title',500);
  if(own(value,'note'))text(value.note,'chronology.note',10000,{empty:true});
  list(documents,'selected documents',MAX.documents);list(value.documents,'chronology.documents',MAX.documents);
  const selected=new Map();
  documents.forEach((d,i)=>{document(d,'selected documents['+i+']');need(!selected.has(d.document_key),'CHRONOLOGY_DUPLICATE','selected documents','Document keys must be unique.');selected.set(d.document_key,d);});
  const declared=new Map();
  value.documents.forEach((d,i)=>{
    const at='chronology.documents['+i+']';document(d,at);
    need(!declared.has(d.document_key),'CHRONOLOGY_DUPLICATE',at,'Document keys must be unique.');
    need(selected.has(d.document_key)&&same(d,selected.get(d.document_key)),'CHRONOLOGY_DOCUMENT_SELECTION_CHANGED',at,'Every declared document must equal its chosen original metadata, including provenance, licence and unknowns.');
    declared.set(d.document_key,d);
  });
  list(value.subjects,'chronology.subjects',MAX.subjects);const subjects=new Map();
  value.subjects.forEach((s,i)=>{
    const at='chronology.subjects['+i+']';keys(s,['subject_key','kind','label','document_keys','binding_key'],['note'],at);
    key(s.subject_key,at+'.subject_key');need(!subjects.has(s.subject_key),'CHRONOLOGY_DUPLICATE',at,'Subject keys must be unique.');
    need(SUBJECT_KINDS.includes(s.kind),'CHRONOLOGY_SUBJECT_KIND_INVALID',at+'.kind','Use a declared original subject kind.');text(s.label,at+'.label',1000);
    list(s.document_keys,at+'.document_keys',MAX.documents);distinct(s.document_keys,at+'.document_keys');
    s.document_keys.forEach(k=>{key(k,at+'.document_keys');need(declared.has(k),'CHRONOLOGY_DOCUMENT_NOT_SELECTED',at+'.document_keys','A subject source must be in the retained chronology catalogue.');});
    if(s.binding_key!==null)key(s.binding_key,at+'.binding_key');
    if(['cited-occurrence','finding'].includes(s.kind))need(s.binding_key!==null,'CHRONOLOGY_BINDING_REQUIRED',at+'.binding_key','A native occurrence or finding subject requires a declared receiving binding key.');
    if(own(s,'note'))text(s.note,at+'.note',10000,{empty:true});
    subjects.set(s.subject_key,s);
  });
  list(value.facts,'chronology.facts',MAX.facts);const facts=new Map();
  value.facts.forEach((f,i)=>{
    const at='chronology.facts['+i+']';
    keys(f,['fact_id','subject_key','event_kind','raw_text','normalized_value','precision','timezone',
      'range_start','range_end','observation_kind','source_refs','unknown_reason','recorded_by','recorded_at'],['note'],at);
    key(f.fact_id,at+'.fact_id');key(f.subject_key,at+'.subject_key');
    need(!facts.has(f.fact_id),'CHRONOLOGY_DUPLICATE',at,'Fact identifiers must be unique.');
    const subject=subjects.get(f.subject_key);need(subject,'CHRONOLOGY_SUBJECT_NOT_FOUND',at+'.subject_key','The fact must reference a declared subject.');
    need(own(FACT_KINDS,f.event_kind),'CHRONOLOGY_EVENT_KIND_INVALID',at+'.event_kind','Use a declared chronology event kind.');
    need(PRECISIONS.includes(f.precision),'CHRONOLOGY_PRECISION_INVALID',at+'.precision','Keep the declared original date precision.');
    need(OBSERVATION_KINDS.includes(f.observation_kind),'CHRONOLOGY_OBSERVATION_KIND_INVALID',at+'.observation_kind','Keep the source observation kind.');
    text(f.raw_text,at+'.raw_text',10000,{nullable:true});text(f.recorded_by,at+'.recorded_by',300);instant(f.recorded_at,at+'.recorded_at');
    if(own(f,'note'))text(f.note,at+'.note',10000,{empty:true});
    list(f.source_refs,at+'.source_refs',MAX.refs);
    const refKeys=f.source_refs.map(r=>JSON.stringify([r?.document_key,r?.locator]));distinct(refKeys,at+'.source_refs');
    f.source_refs.forEach((r,n)=>sourceReference(r,at+'.source_refs['+n+']',declared,subject));
    if(f.precision==='unknown'){
      need(f.normalized_value===null&&f.timezone===null&&f.range_start===null&&f.range_end===null,
        'CHRONOLOGY_UNKNOWN_DATE_CHANGED',at,'An unknown date keeps all normalized temporal fields null.');
      text(f.unknown_reason,at+'.unknown_reason',5000);
    }else{
      need(f.raw_text!==null&&f.source_refs.length>0&&f.unknown_reason===null&&f.observation_kind!=='unknown',
        'CHRONOLOGY_KNOWN_DATE_SOURCE_REQUIRED',at,'A known date needs original text, selected source references and a declared observation kind.');
      if(f.precision==='range'){
        need(f.normalized_value===null&&f.timezone===null,'CHRONOLOGY_RANGE_INVALID',at,'A range retains explicit endpoints rather than a synthesized single date.');
        const a=endpoint(f.range_start,at+'.range_start'),b=endpoint(f.range_end,at+'.range_end');
        need(a||b,'CHRONOLOGY_RANGE_INVALID',at,'Retain at least one declared range boundary.');
        if(a&&b&&(a.parsed.kind==='instant')===(b.parsed.kind==='instant')){
          const lower=possibleBounds(a.parsed)[0],upper=possibleBounds(b.parsed)[1];
          need(lower<=upper,'CHRONOLOGY_RANGE_REVERSED',at,'The declared range has no possible chronological extent.');
          if(a.parsed.kind==='instant'&&b.parsed.kind==='instant'&&lower===upper)
            need(a.inclusive!==false&&b.inclusive!==false,'CHRONOLOGY_RANGE_EMPTY',at,'Exclusive identical instants cannot define a nonempty range.');
        }
      }else{
        need(f.range_start===null&&f.range_end===null,'CHRONOLOGY_RANGE_INVALID',at,'A single date does not carry undeclared range endpoints.');
        moment(f.normalized_value,f.precision,f.timezone,at+'.normalized_value');
      }
    }
    facts.set(f.fact_id,f);
  });
  list(value.interpretations,'chronology.interpretations',MAX.interpretations);const interpretations=new Set();
  value.interpretations.forEach((r,i)=>{
    const at='chronology.interpretations['+i+']';keys(r,['interpretation_id','subject_key','fact_ids','reviewer','relation','reason','recorded_at'],[],at);
    key(r.interpretation_id,at+'.interpretation_id');key(r.subject_key,at+'.subject_key');
    need(!interpretations.has(r.interpretation_id),'CHRONOLOGY_DUPLICATE',at,'Interpretation identifiers must be unique.');interpretations.add(r.interpretation_id);
    need(subjects.has(r.subject_key),'CHRONOLOGY_SUBJECT_NOT_FOUND',at+'.subject_key','The interpretation needs its declared subject.');
    need(own(RELATIONS,r.relation),'CHRONOLOGY_RELATION_INVALID',at+'.relation','Only the supplied reviewer interpretation is recorded.');
    list(r.fact_ids,at+'.fact_ids',1000);distinct(r.fact_ids,at+'.fact_ids');
    r.fact_ids.forEach(k=>{key(k,at+'.fact_ids');need(facts.has(k),'CHRONOLOGY_FACT_NOT_FOUND',at+'.fact_ids','Interpretations must cite retained facts.');});
    need(r.relation==='not-assessed'||r.fact_ids.length>0,'CHRONOLOGY_INTERPRETATION_FACT_REQUIRED',at,'An assessed interpretation must identify its supporting facts.');
    text(r.reviewer,at+'.reviewer',300);text(r.reason,at+'.reason',10000);instant(r.recorded_at,at+'.recorded_at');
  });
  return {documents:declared,subjects,facts};
}

/** Return the original envelope unchanged after matching the selected metadata.
 * documents may include additional measured programme sources; every document
 * declared by this chronology must match its complete selected descriptor.
 * No date, source, reviewer, ID or interpretation is generated or normalized.
 */
export function validateCustomerChronology(value,{documents}={}){
  validated(value,documents);
  return value;
}

function bindingMap(value,{dossierId,revision,bindings}){
  need(dossierId===null||typeof dossierId==='string'&&NATIVE_IDS.dossierId.test(dossierId),
    'CHRONOLOGY_DOSSIER_INVALID','render.dossierId','Use the actual native dossier identifier or explicit null.');
  need(revision===null||Number.isSafeInteger(revision)&&revision>=1,'CHRONOLOGY_REVISION_INVALID','render.revision','Use the actual native revision or explicit null.');
  need((dossierId===null)===(revision===null),'CHRONOLOGY_REVISION_INVALID','render','Dossier and revision must be supplied together.');
  need(plain(bindings),'CHRONOLOGY_BINDINGS_INVALID','render.bindings','Supply the original resolved receiving bindings keyed by declared binding_key.');
  for(const [k,b] of Object.entries(bindings)){
    key(k,'render.bindings.key');keys(b,['dossierId'],Object.keys(NATIVE_IDS).filter(k=>k!=='dossierId'),'render.bindings.'+k);
    need(dossierId!==null&&b.dossierId===dossierId,'CHRONOLOGY_BINDING_DOSSIER_CHANGED','render.bindings.'+k,'Every resolved binding must belong to this actual native dossier.');
    for(const [name,id] of Object.entries(b))need(typeof id==='string'&&NATIVE_IDS[name].test(id),
      'CHRONOLOGY_NATIVE_ID_INVALID','render.bindings.'+k+'.'+name,'Keep the native identifier returned by the original receiver.');
  }
  for(const s of value.subjects){
    if(s.binding_key===null)continue;
    const b=own(bindings,s.binding_key)?bindings[s.binding_key]:null;
    need(b,'CHRONOLOGY_BINDING_NOT_FOUND','subject.'+s.subject_key,'Resolve this declared subject binding through the original receiver.');
    const required=s.kind==='cited-occurrence'?['questionId','editionId','occurrenceId']:
      s.kind==='finding'?['questionId','findingId']:s.kind==='notice'?['noticeId']:[];
    need(required.every(k=>own(b,k)),'CHRONOLOGY_BINDING_INCOMPLETE','subject.'+s.subject_key,'Keep the complete native identity for this subject kind.');
  }
  return bindings;
}
const h=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function m(v){return String(v).replace(/\\/g,'\\\\').replace(/[{}\[\]()*_#+.!|<>~-]/g,c=>'\\'+c).replace(new RegExp(String.fromCharCode(96),'g'),'\\'+String.fromCharCode(96));}
const mdLine=v=>m(v).replace(/\r\n?|\n/g,' / ');
const href=v=>v.replace(/[<>()\[\]\\"]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const htmlLink=(url,label)=>url===null?h(label)+' <span class="muted">(source URL unknown)</span>':'<a href="'+h(url)+'" rel="noreferrer noopener">'+h(label)+'</a>';
const mdLink=(url,label)=>url===null?m(label)+' (source URL unknown)':'['+m(label)+']('+href(url)+')';
function metadataText(v){return v===null?'Unknown / not supplied':typeof v==='string'?v:JSON.stringify(v,null,2);}
function fence(value){
  const tick=String.fromCharCode(96),body=metadataText(value),runs=body.match(new RegExp(tick+'+','g'))??[];
  const marker=tick.repeat(Math.max(3,...runs.map(s=>s.length+1)));
  return marker+'text\n'+body+'\n'+marker;
}
function endpointText(value){
  if(value===null)return 'Boundary not specified';
  const included=value.inclusive===null?'inclusion not stated':value.inclusive?'inclusive':'exclusive';
  return value.value+' ['+value.precision+(value.timezone!==null?', '+value.timezone:'')+'; '+included+']';
}
function dateText(f){
  if(f.precision==='unknown')return 'Unknown';
  if(f.precision==='range')return 'From '+endpointText(f.range_start)+' to '+endpointText(f.range_end);
  return f.normalized_value+' ['+f.precision+(f.timezone!==null?', '+f.timezone:'')+']';
}
const css=[
  ':root{color-scheme:light;--ink:#202020;--muted:#5b5b5b;--line:#d0d0d0;--paper:#fff;--panel:#f4f4f4;--accent:#333333;--unknown:#555555}',
  '*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;background:var(--panel);color:var(--ink);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
  'a{color:var(--accent);overflow-wrap:anywhere}a:focus-visible{outline:3px solid #666666;outline-offset:3px}main{max-width:1180px;margin:0 auto;background:var(--paper);padding:44px 48px 64px}',
  'header{border-top:7px solid var(--accent);padding-top:22px;border-bottom:1px solid var(--line);margin-bottom:30px;padding-bottom:26px}.eyebrow{font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;font-weight:750;color:var(--muted)}',
  'h1{font-size:2rem;line-height:1.18;margin:10px 0 14px}h2{font-size:1.4rem;line-height:1.3;margin:0 0 12px}h3{font-size:1.05rem;line-height:1.35;margin:0 0 12px}p{margin:0 0 14px}.lead{max-width:80ch}.muted{color:var(--muted)}',
  '.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin:22px 0}.metric{background:var(--panel);padding:12px 14px}.metric strong{display:block;font-size:1.3rem}.metric span{font-size:.82rem;color:var(--muted)}',
  '.identity{display:grid;grid-template-columns:120px minmax(0,1fr);gap:6px 14px;font-size:.92rem}.identity dt{font-weight:650}.identity dd{margin:0;overflow-wrap:anywhere}',
  '.subject{margin:32px 0;padding-top:26px;border-top:2px solid var(--line)}.subject-note,.note{white-space:pre-wrap;overflow-wrap:anywhere}.native{margin:12px 0 20px;padding:14px;background:var(--panel);border-left:3px solid var(--accent)}',
  '.fact{border:1px solid var(--line);margin:16px 0;padding:20px;break-inside:avoid}.fact-head{display:flex;align-items:baseline;justify-content:space-between;gap:18px}.tag{display:inline-block;white-space:nowrap;border:1px solid var(--line);padding:2px 9px;font-size:.78rem;color:var(--muted)}',
  '.fields{display:grid;grid-template-columns:150px minmax(0,1fr);gap:9px 16px;margin:10px 0}.fields dt{font-weight:650;font-size:.9rem}.fields dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}',
  '.unknown{border-left:4px solid var(--unknown);background:#faf7f2;padding:12px 14px;margin:12px 0}.sources{margin:16px 0 0;padding:14px 0 0;border-top:1px solid var(--line)}.sources ul{padding-left:20px;margin:8px 0}.source-ref{margin:10px 0;overflow-wrap:anywhere}',
  '.source-ref small{display:block;color:var(--muted);font-size:.78rem}.interpretation{background:var(--panel);border-left:4px solid var(--accent);padding:18px 20px;margin:16px 0;break-inside:avoid}',
  '.catalogue{margin-top:44px;padding-top:28px;border-top:3px solid var(--accent)}.document{border:1px solid var(--line);padding:20px;margin:16px 0}.document pre{font-size:.8rem;white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;margin:8px 0 18px}',
  '.caption{font-size:.85rem;color:var(--muted)}code{font-size:.82em;overflow-wrap:anywhere}nav ul{margin:8px 0 0;padding-left:20px}footer{margin-top:32px;padding-top:18px;border-top:1px solid var(--line);font-size:.82rem;color:var(--muted)}',
  '@media(max-width:640px){main{padding:24px 18px 40px}h1{font-size:1.6rem}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.identity,.fields{grid-template-columns:1fr;gap:3px}.identity dd,.fields dd{margin-bottom:9px}.fact,.document{padding:15px}.fact-head{display:block}.tag{margin-bottom:8px}.subject{margin-top:26px}}',
  '@media print{body{background:#fff}main{max-width:none;margin:0;padding:0;font-size:10pt}.metrics{grid-template-columns:repeat(4,minmax(0,1fr))}a{color:inherit;text-decoration:underline}nav{display:none}.document,.fact,.interpretation{break-inside:avoid}.subject{break-before:auto}header{border-top-width:4px}}'
].join('\n');

/** Render all supplied facts, interpretations and selected source metadata.
 * Call validateCustomerChronology(value,{documents: measuredSelection}) first.
 * bindings is a map of authored binding_key to original native camelCase IDs:
 * dossierId, questionId, editionId, occurrenceId, findingId, noticeId.
 * A document-only planning report may use dossierId:null, revision:null,
 * bindings:{}; native occurrence/finding subjects require resolved bindings.
 */
export function renderCustomerChronology(value,{customerLabel,dossierId=null,revision=null,bindings={}}={}){
  const maps=validated(value,value?.documents);
  text(customerLabel,'render.customerLabel',500);
  const native=bindingMap(value,{dossierId,revision,bindings});
  const title=value.title??'Source chronology';
  const unknown=value.facts.filter(f=>f.precision==='unknown');
  const factAnchors=new Map(value.facts.map((f,i)=>[f.fact_id,'fact-'+(i+1)]));
  const hs=[],ms=[];
  hs.push('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">');
  hs.push('<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">');
  hs.push('<title>'+h(customerLabel)+' — '+h(title)+'</title><style>'+css+'</style></head><body><main><header>');
  hs.push('<div class="eyebrow">Selected evidence · source chronology</div><h1>'+h(customerLabel)+'</h1><p class="lead">'+h(title)+'</p>');
  hs.push('<p class="lead">Dates retain their original precision and source references. Interpretations are attributed to the named reviewer; unreported dates remain visible.</p>');
  hs.push('<dl class="identity"><dt>Dossier</dt><dd>'+h(dossierId??'Not yet bound')+'</dd><dt>Revision</dt><dd>'+h(revision??'Not yet bound')+'</dd>');
  if(own(value,'selection_id'))hs.push('<dt>Selection</dt><dd>'+h(value.selection_id)+'</dd>');
  hs.push('</dl><div class="metrics">'+[['Documents',value.documents.length],['Subjects',value.subjects.length],['Date facts',value.facts.length],['Reviewer interpretations',value.interpretations.length]].map(([label,n])=>'<div class="metric"><strong>'+n+'</strong><span>'+label+'</span></div>').join('')+'</div>');
  if(own(value,'note'))hs.push('<p class="note">'+h(value.note)+'</p>');
  if(unknown.length)hs.push('<div class="unknown"><strong>'+unknown.length+' date '+(unknown.length===1?'fact is':'facts are')+' explicitly unknown.</strong><p class="caption">Each remains in the source record with its stated reason.</p></div>');
  hs.push('</header><nav aria-label="Chronology subjects"><h2>Subjects</h2><ul>'+value.subjects.map((s,i)=>'<li><a href="#subject-'+(i+1)+'">'+h(s.label)+'</a></li>').join('')+'</ul></nav>');
  ms.push('# '+m(customerLabel)+'\n\n## '+m(title)+'\n\nDates retain their original precision and source references. Interpretations are attributed to the named reviewer; unreported dates remain visible.');
  ms.push('Dossier: '+m(dossierId??'Not yet bound')+'  \nRevision: '+m(revision??'Not yet bound')+(own(value,'selection_id')?'  \nSelection: '+m(value.selection_id):''));
  ms.push('| Documents | Subjects | Date facts | Reviewer interpretations |\n| ---: | ---: | ---: | ---: |\n| '+[value.documents.length,value.subjects.length,value.facts.length,value.interpretations.length].join(' | ')+' |');
  if(own(value,'note'))ms.push(m(value.note));
  if(unknown.length)ms.push('**'+unknown.length+' date '+(unknown.length===1?'fact is':'facts are')+' explicitly unknown.** Each is retained below with its stated reason.');
  value.subjects.forEach((s,i)=>{
    hs.push('<section class="subject" id="subject-'+(i+1)+'"><div class="eyebrow">'+h(s.kind)+'</div><h2>'+h(s.label)+'</h2><p class="caption">Subject '+h(s.subject_key)+'</p>');
    ms.push('## '+m(s.label)+'\n\nSubject: '+m(s.subject_key)+' · '+m(s.kind));
    if(own(s,'note')){hs.push('<p class="subject-note">'+h(s.note)+'</p>');ms.push(m(s.note));}
    hs.push('<p class="caption">Declared source keys: '+(s.document_keys.length?s.document_keys.map(h).join(', '):'None supplied')+'</p>');
    ms.push('Declared source keys: '+(s.document_keys.length?s.document_keys.map(m).join(', '):'None supplied'));
    if(s.binding_key!==null){
      const b=native[s.binding_key];
      hs.push('<div class="native"><h3>Original receiving binding</h3><p class="caption">'+h(s.binding_key)+'</p><dl class="identity">'+Object.entries(b).map(([k,v])=>'<dt>'+h(k)+'</dt><dd><code>'+h(v)+'</code></dd>').join('')+'</dl></div>');
      ms.push('### Original receiving binding\n\nBinding key: '+m(s.binding_key)+'\n\n'+Object.entries(b).map(([k,v])=>'- '+m(k)+': '+m(v)).join('\n'));
    }else{hs.push('<p class="caption">This subject is identified by its selected source documents. No native record binding is declared.</p>');ms.push('This subject is identified by its selected source documents. No native record binding is declared.');}
    const facts=value.facts.filter(f=>f.subject_key===s.subject_key);
    if(!facts.length){hs.push('<p class="muted">No date facts were supplied for this subject.</p>');ms.push('No date facts were supplied for this subject.');}
    facts.forEach(f=>{
      hs.push('<article class="fact" id="'+factAnchors.get(f.fact_id)+'"><div class="fact-head"><h3>'+h(FACT_KINDS[f.event_kind])+'</h3><span class="tag">'+h(f.precision)+'</span></div><p class="caption">Fact '+h(f.fact_id)+'</p>');
      const fields=[['Original text',f.raw_text??'Not supplied'],['Normalized value',dateText(f)],['Observation',f.observation_kind],['Recorded by',f.recorded_by],['Recorded at',f.recorded_at]];
      hs.push('<dl class="fields">'+fields.map(([k,v])=>'<dt>'+k+'</dt><dd>'+h(v)+'</dd>').join('')+'</dl>');
      if(f.precision==='unknown')hs.push('<div class="unknown"><strong>Unknown date</strong><p class="note">'+h(f.unknown_reason)+'</p></div>');
      if(own(f,'note'))hs.push('<p class="note">'+h(f.note)+'</p>');
      hs.push('<div class="sources"><strong>Source references</strong>');
      if(f.source_refs.length)hs.push('<ul>'+f.source_refs.map(r=>{const d=maps.documents.get(r.document_key);return '<li class="source-ref">'+htmlLink(r.source_url,d.filename)+' — '+h(r.locator)+'<small>Document '+h(r.document_key)+' · '+r.bytes+' bytes<br>SHA-256 '+h(r.sha256)+'</small></li>';}).join('')+'</ul>');
      else hs.push('<p class="muted">No source reference was supplied; the unknown reason remains part of this fact.</p>');
      hs.push('</div></article>');
      ms.push('### '+m(FACT_KINDS[f.event_kind])+'\n\nFact: '+m(f.fact_id)+' · precision: '+m(f.precision));
      ms.push(fields.map(([k,v])=>'**'+k+':** '+m(v)).join('\n\n'));
      if(f.precision==='unknown')ms.push('**Unknown date — reason:** '+m(f.unknown_reason));
      if(own(f,'note'))ms.push(m(f.note));
      ms.push('**Source references**\n\n'+(f.source_refs.length?f.source_refs.map(r=>{
        const d=maps.documents.get(r.document_key);
        return '- '+mdLink(r.source_url,d.filename)+' — '+mdLine(r.locator)+'; document '+m(r.document_key)+'; '+r.bytes+' bytes; SHA\\-256 '+m(r.sha256);
      }).join('\n'):'No source reference was supplied; the unknown reason remains part of this fact.'));
    });
    const interpretations=value.interpretations.filter(r=>r.subject_key===s.subject_key);
    hs.push('<h3>Reviewer interpretations</h3>');ms.push('### Reviewer interpretations');
    if(!interpretations.length){hs.push('<p class="muted">No reviewer interpretation was supplied.</p>');ms.push('No reviewer interpretation was supplied.');}
    interpretations.forEach(r=>{
      hs.push('<article class="interpretation"><h3>'+h(RELATIONS[r.relation])+' — reviewer interpretation</h3><p class="caption">'+h(r.interpretation_id)+' · '+h(r.reviewer)+' · '+h(r.recorded_at)+'</p><p class="note">'+h(r.reason)+'</p><p>Retained facts: '+(r.fact_ids.length?r.fact_ids.map(k=>'<a href="#'+factAnchors.get(k)+'">'+h(k)+'</a>').join(', '):'None selected; not assessed')+'</p></article>');
      ms.push('**'+m(RELATIONS[r.relation])+' — reviewer interpretation**\n\n'+m(r.interpretation_id)+' · '+m(r.reviewer)+' · '+m(r.recorded_at)+'\n\n'+m(r.reason)+'\n\nRetained facts: '+(r.fact_ids.length?r.fact_ids.map(m).join(', '):'None selected; not assessed'));
    });
    hs.push('</section>');
  });
  hs.push('<section class="catalogue"><h2>Selected source catalogue</h2><p>These descriptors preserve the original document identity, source representation, provenance and licence declaration supplied to this chronology.</p>');
  ms.push('## Selected source catalogue\n\nThese descriptors preserve the original document identity, source representation, provenance and licence declaration supplied to this chronology.');
  if(!value.documents.length){hs.push('<p class="muted">No source document metadata was supplied.</p>');ms.push('No source document metadata was supplied.');}
  value.documents.forEach(d=>{
    hs.push('<article class="document"><h3>'+h(d.filename)+'</h3><dl class="fields>');
    const fields=[['Document key',d.document_key],['Original bytes',d.bytes],['SHA-256',d.sha256],['Media type',d.media_type],['Source kind',d.source_kind]];
    if(own(d,'relative_path'))fields.push(['Original source path',d.relative_path]);
    if(own(d,'retrieved_at'))fields.push(['Original retrieval time',d.retrieved_at??'Unknown']);
    hs.push(fields.map(([k,v])=>'<dt>'+k+'</dt><dd>'+h(v)+'</dd>').join('')+'<dt>Source URL</dt><dd>'+htmlLink(d.source_url,d.source_url??'Unknown')+'</dd></dl>');
    ms.push('### '+m(d.filename)+'\n\n'+fields.map(([k,v])=>'- '+m(k)+': '+m(v)).join('\n')+'\n- Source URL: '+mdLink(d.source_url,d.source_url??'Unknown'));
    for(const [key,label] of [['provenance','Original provenance'],['license','Original licence'],['entitlement','Selected entitlement'],['native_capture_ref','Original native capture reference']]){
      if(!own(d,key))continue;
      hs.push('<h3>'+label+'</h3><pre>'+h(metadataText(d[key]))+'</pre>');
      ms.push('**'+label+'**\n\n'+fence(d[key]));
    }
    hs.push('</article>');
  });
  hs.push('</section><footer><p>'+h(CUSTOMER_CHRONOLOGY_SCHEMA)+' · Original selected input order is preserved. This report records supplied facts and reviewer interpretations.</p></footer></main></body></html>\n');
  ms.push('---\n\n'+m(CUSTOMER_CHRONOLOGY_SCHEMA)+' · Original selected input order is preserved. This report records supplied facts and reviewer interpretations.');
  return {html:hs.join('\n'),markdown:ms.join('\n\n')+'\n'};
}
