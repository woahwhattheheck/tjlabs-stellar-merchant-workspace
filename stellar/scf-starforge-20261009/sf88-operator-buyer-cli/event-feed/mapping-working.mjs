/* MIT. Complete offline working copy over the original Event mapping comparison. */
export const EVENT_MAPPING_WORKING = 'stellar-forge.event-mapping-working-copy.v1';
export const EVENT_MAPPING_SOURCE_PAIR = 'stellar-forge.event-mapping-source-pair.v1';
export const MAX_EVENT_MAPPING_WORKING_BYTES = 192 * 1024 * 1024;
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const need=(v,m)=>{if(!v)throw Error(m);};
const hashPattern=/^[a-f0-9]{64}$/, idPattern=/^[a-f0-9]{32}$/;
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':plain(v)?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const copy=v=>JSON.parse(JSON.stringify(v));
const same=(a,b)=>canonical(a)===canonical(b);
function shape(v,keys,label){need(plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>own(v,k)),label+' must retain its complete original fields.');}
function frozen(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}
function walkUTF8(text,emit){
 need(typeof text==='string','Retain complete UTF-8 text.');
 for(let i=0;i<text.length;i++){
  let n=text.charCodeAt(i);
  if(n>=0xd800&&n<=0xdbff){const low=text.charCodeAt(i+1);if(low>=0xdc00&&low<=0xdfff){n=0x10000+((n-0xd800)<<10)+low-0xdc00;i++;}else n=0xfffd;}
  else if(n>=0xdc00&&n<=0xdfff)n=0xfffd;
  if(n<128)emit(n);else if(n<2048){emit(0xc0|(n>>6));emit(0x80|(n&63));}
  else if(n<65536){emit(0xe0|(n>>12));emit(0x80|((n>>6)&63));emit(0x80|(n&63));}
  else {emit(0xf0|(n>>18));emit(0x80|((n>>12)&63));emit(0x80|((n>>6)&63));emit(0x80|(n&63));}
 }
}
export function eventMappingBytes(text){let count=0;walkUTF8(text,()=>count++);return count;}
export function eventMappingHash(text){
 const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],block=new Uint8Array(64),w=new Int32Array(64),ror=(x,n)=>(x>>>n)|(x<<(32-n));let count=0,used=0;
 function compress(){
  for(let i=0;i<16;i++)w[i]=(block[4*i]<<24)|(block[4*i+1]<<16)|(block[4*i+2]<<8)|block[4*i+3];
  for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(ror(x,7)^ror(x,18)^(x>>>3))+w[i-7]+(ror(y,17)^ror(y,19)^(y>>>10)))|0;}
  let[a,b,c,d,e,f,g,j]=h;
  for(let i=0;i<64;i++){const t1=(j+(ror(e,6)^ror(e,11)^ror(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,t2=((ror(a,2)^ror(a,13)^ror(a,22))+((a&b)^(a&c)^(b&c)))|0;j=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
  [a,b,c,d,e,f,g,j].forEach((v,i)=>h[i]=(h[i]+v)|0);used=0;
 }
 function put(b){block[used++]=b;if(used===64)compress();}
 walkUTF8(text,b=>{put(b);count++;});put(128);while(used!==56)put(0);
 const high=Math.floor(count/0x20000000),low=(count*8)>>>0;
 for(let i=3;i>=0;i--)put((high>>>(8*i))&255);
 for(let i=3;i>=0;i--)put((low>>>(8*i))&255);
 return h.map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');
}
export function createEventMappingWorkingAPI(parser){
 const required=['inspectEventExport','normalizeEventMapping','compareEventMappings','inspectEventFields','inspectEventFieldValues'];
 need(plain(parser)&&required.every(k=>typeof parser[k]==='function'),'Use the complete original installed Event source parser.');
 const originals=new WeakMap(),accepted=new WeakSet();
 const contextKeys=['workspace_id','programme','programme_revision','input_id','baseline_operation_id','receiver'];
 function context(c){
  need(plain(c)&&typeof c.workspace_id==='string'&&c.workspace_id.length>0&&c.workspace_id.length<=200&&/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(c.programme)&&Number.isSafeInteger(c.programme_revision)&&c.programme_revision>=0&&idPattern.test(c.input_id)&&idPattern.test(c.baseline_operation_id),'Retain the exact original workspace, accepted programme and received input.');
  shape(c.receiver,['cli_sha256','core_sha256'],'Installed source receiver');
  need(hashPattern.test(c.receiver.cli_sha256)&&hashPattern.test(c.receiver.core_sha256),'Retain both complete installed receiver identities.');
  return Object.fromEntries(contextKeys.map(k=>[k,copy(c[k])]));
 }
 function sourceFiles(files){
  shape(files,['previous','current'],'Original source pair');
  const result={};
  for(const side of ['previous','current']){
   shape(files[side],['ndjson','manifest'],'Complete '+side+' source');
   for(const kind of ['ndjson','manifest']){
    const file=files[side][kind];shape(file,['name','bytes','sha256','text'],'Original '+side+' '+kind);
    need(typeof file.name==='string'&&file.name.length>0&&file.name.length<=240&&!/[\u0000-\u001f]/.test(file.name)&&typeof file.text==='string'&&Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=(kind==='ndjson'?32:4)*1024*1024&&hashPattern.test(file.sha256),'Keep the original file label, full body and exact source identity.');
    need(eventMappingBytes(file.text)===file.bytes&&eventMappingHash(file.text)===file.sha256,'An original '+side+' '+kind+' file differs from its retained bytes.');
   }
   result[side]=parser.inspectEventExport(files[side].ndjson.text,files[side].manifest.text);
  }
  return result;
 }
 function compared(original,sources,mapping){return {...parser.compareEventMappings(sources.previous,sources.current,original.comparison.previous_mapping,mapping),...context(original.comparison)};}
 function checkedOriginal(original){
  if(originals.has(original))return originals.get(original);
  shape(original,['comparison','files'],'Whole original working source');
  const ctx=context(original.comparison),sources=sourceFiles(original.files);
  const actual={...parser.compareEventMappings(sources.previous,sources.current,original.comparison.previous_mapping,original.comparison.mapping),...ctx};
  need(same(actual,original.comparison),'The original complete comparison does not match its exact source windows and mappings.');
  frozen(original);originals.set(original,sources);return sources;
 }
 function draft(value){
  shape(value,['fields','reviewer','note','decisions'],'Complete unfinished mapping draft');
  need(Array.isArray(value.fields)&&value.fields.length<=100,'Keep at most 100 complete unfinished fields.');
  for(const f of value.fields){shape(f,['name','pointer'],'Unfinished field');need(typeof f.name==='string'&&f.name.length<=48&&typeof f.pointer==='string'&&f.pointer.length<=2000,'Keep each complete field within the original name and pointer allowance.');}
  need(typeof value.reviewer==='string'&&value.reviewer.length<=240&&typeof value.note==='string'&&value.note.length<=8000&&plain(value.decisions)&&Object.keys(value.decisions).length<=200,'Retain the reviewer, complete note and all unfinished decisions.');
  for(const [name,reason]of Object.entries(value.decisions))need(name.length<=48&&typeof reason==='string'&&reason.length<=4000,'Keep every full output decision within the original allowance.');
  return value;
 }
 function checkComparison(value,original,sources){
  need(plain(value)&&same(value,compared(original,sources,value.mapping)),'A saved comparison changed its original mapping, source, counts or native context.');
 }
 function admit(value){
  need(eventMappingBytes(JSON.stringify(value))<=MAX_EVENT_MAPPING_WORKING_BYTES,'This complete working copy exceeds 192 MiB. Keep the unchanged earlier file and original sources; no part was omitted.');
  frozen(value);accepted.add(value);return value;
 }
 function reopen(value){
  if(accepted.has(value))return value;
  shape(value,['schema','original','comparison','draft','history'],'Complete working copy');need(value.schema===EVENT_MAPPING_WORKING,'Open an original Event mapping working copy.');
  const sources=checkedOriginal(value.original);checkComparison(value.comparison,value.original,sources);draft(value.draft);
  need(Array.isArray(value.history)&&value.history.length<=128,'Retain the complete mapping comparison history within 128 recorded editions.');
  for(const item of value.history){shape(item,['comparison','draft'],'Earlier comparison and unfinished work');checkComparison(item.comparison,value.original,sources);draft(item.draft);}
  return admit(value);
 }
 function create(bundle,{draft:chosen}={}){
  shape(bundle,['schema','comparison','files'],'Complete original source package');need(bundle.schema===EVENT_MAPPING_SOURCE_PAIR,'Receive the original native source-pair package.');
  const original={comparison:copy(bundle.comparison),files:copy(bundle.files)};
  return reopen({schema:EVENT_MAPPING_WORKING,original,comparison:copy(bundle.comparison),draft:chosen?copy(chosen):{fields:copy(bundle.comparison.mapping.fields),reviewer:'',note:'',decisions:{}},history:[]});
 }
 function updateDraft(value,next){const v=reopen(value);draft(next);return admit({...v,draft:copy(next)});}
 function compare(value){
  const v=reopen(value),next=compared(v.original,checkedOriginal(v.original),{fields:v.draft.fields});
  if(same(next,v.comparison))return v;
  need(v.history.length<128,'Keep this complete file; its 128 saved comparisons have reached the working-history allowance.');
  return admit({...v,comparison:next,history:[...v.history,{comparison:v.comparison,draft:v.draft}],draft:{...v.draft,decisions:{}}});
 }
 function status(value){
  const v=reopen(value),errors=[];let current=false;
  try{current=same(parser.normalizeEventMapping({fields:v.draft.fields}),v.comparison.mapping);}catch(error){errors.push(error.message);}
  if(!current)errors.push('Compare these current field choices against the original two windows.');
  for(const [key,max]of [['reviewer',240],['note',8000]])if(!v.draft[key].trim()||eventMappingBytes(v.draft[key])>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v.draft[key]))errors.push('Record '+key+' within '+max+' UTF-8 bytes without unsupported control characters.');
  for(const name of v.comparison.required_decisions){const reason=own(v.draft.decisions,name)?v.draft.decisions[name]:'';if(!reason.trim()||eventMappingBytes(reason)>4000)errors.push('Record the complete reason for '+name+' within 4000 UTF-8 bytes.');}
  return {current,ready:errors.length===0,errors,required_decisions:copy(v.comparison.required_decisions)};
 }
 function nativeReview(value){
  const v=reopen(value),result={schema:'stellar-forge.event-mapping-working-review.v1',comparison:copy(v.comparison),draft:copy(v.draft)};
  need(eventMappingBytes(JSON.stringify(result))<=32*1024*1024,'The complete native mapping review exceeds its original 32 MiB receiving allowance. Keep the working copy and both original sources.');
  return result;
 }
 function select(value,side){
  const v=reopen(value),sources=checkedOriginal(v.original);need(['previous','current','added'].includes(side),'Choose the previous, current or new-event population.');
  return side==='added'?{...sources.current,events:sources.current.events.filter(e=>e.sequence>sources.previous.manifest.throughSequence)}:sources[side];
 }
 function catalogue(value,side='current'){return parser.inspectEventFields(select(value,side));}
 function values(value,side,pointer,options={}){return parser.inspectEventFieldValues(select(value,side),pointer,options);}
 function files(value){const v=reopen(value);return ['previous','current'].flatMap(side=>['ndjson','manifest'].map(kind=>({side,kind,...v.original.files[side][kind]})));}
 function serialize(value){const v=reopen(value),text=JSON.stringify(v)+'\n';need(eventMappingBytes(text)<=MAX_EVENT_MAPPING_WORKING_BYTES,'Keep the whole working copy within 192 MiB.');return text;}
 return Object.freeze({create,reopen,updateDraft,compare,status,nativeReview,catalogue,values,files,serialize});
}
