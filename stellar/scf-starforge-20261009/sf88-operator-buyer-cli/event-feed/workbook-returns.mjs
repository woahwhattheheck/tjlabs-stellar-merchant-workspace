/* Complete source-bound colleague choices over the existing Event workbook. */
export const EVENT_WORKBOOK_REVIEW = 'stellar-forge.event-workbook-review.v1';
export const EVENT_WORKBOOK_ASSIGNMENT = 'stellar-forge.event-workbook-assignment.v1';
export const EVENT_WORKBOOK_RETURN = 'stellar-forge.event-workbook-return.v1';
export function createEventWorkbookReturnAPI({reopen,canonical}){
const RETURN_LIMIT = 128*1024*1024;
const plain = v => v!==null && typeof v==='object' && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
const need = (v,m) => {if(!v)throw Error(m);};
const own = (v,k) => Object.prototype.hasOwnProperty.call(v,k);
const HASH=/^[a-f0-9]{64}$/;
const collections=['snapshots','assignments','incoming_returns','receipts'];
function exact(v,ks,message){need(plain(v)&&Object.keys(v).length===ks.length&&ks.every(k=>own(v,k)),message);}
function label(v,name,max,required=false){need(typeof v==='string'&&v.length<=max&&(!required||v.trim()),'Retain '+name+' within its complete text allowance.');return v;}
function stamped(v){label(v,'the original timestamp',80,true);need(Number.isFinite(Date.parse(v)),'Retain an explicit original timestamp.');}
function noid(v){const x=clone(v);delete x.id;return x;}
function historyState(e){return {active_assignment_id:e.active_assignment_id,selected_return_id:e.selected_return_id,local_receipt_ids:clone(e.local_receipt_ids),local_assignment_ids:clone(e.local_assignment_ids),resolution_drafts:clone(e.resolution_drafts),pending:clone(e.pending)};}
function empty(){return {schema:EVENT_WORKBOOK_REVIEW,snapshots:[],assignments:[],incoming_returns:[],receipts:[],resolution_drafts:{},active_assignment_id:null,selected_return_id:null,local_receipt_ids:[],local_assignment_ids:[],pending:{}};}

function octets(value){const s=unescape(encodeURIComponent(value));return Array.from(s,c=>c.charCodeAt(0));}
function hex(words){return words.map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');}
function padded(input){const b=input.slice(),n=b.length;b.push(128);while(b.length%64!==56)b.push(0);for(let i=7;i>=0;i--)b.push(Math.floor(n*8/2**(i*8))&255);return b;}
function sha256Bytes(input){const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],b=padded(input),ror=(x,n)=>(x>>>n)|(x<<(32-n));for(let p=0;p<b.length;p+=64){const w=[];for(let i=0;i<16;i++)w[i]=(b[p+4*i]<<24)|(b[p+4*i+1]<<16)|(b[p+4*i+2]<<8)|b[p+4*i+3];for(let i=16;i<64;i++){const s0=ror(w[i-15],7)^ror(w[i-15],18)^(w[i-15]>>>3),s1=ror(w[i-2],17)^ror(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0;}let[a,c,d,e,f,g,j,k]=h;for(let i=0;i<64;i++){const s1=ror(f,6)^ror(f,11)^ror(f,25),ch=(f&g)^(~f&j),t1=(k+s1+ch+K[i]+w[i])|0,s0=ror(a,2)^ror(a,13)^ror(a,22),maj=(a&c)^(a&d)^(c&d),t2=(s0+maj)|0;k=j;j=g;g=f;f=(e+t1)|0;e=d;d=c;c=a;a=(t1+t2)|0;}[a,c,d,e,f,g,j,k].forEach((v,i)=>h[i]=(h[i]+v)|0);}return hex(h);}

  need(typeof reopen==='function'&&typeof canonical==='function','Use the original complete column-choice model.');
  const same=(a,b)=>canonical(a)===canonical(b), digest=v=>sha256Bytes(octets(canonical(v)));
  function base(value,selected){
    need(plain(value),'Retain the complete original workbook choices.');
    const v=clone(value);delete v.review_receiving;
    return reopen(v,selected);
  }
  function index(e){return Object.fromEntries(collections.map(k=>[k,new Map(e[k].map(v=>[v.id,v]))]));}
  function subset(e,ids){
    exact(ids,collections,'Retain the complete returned source inventory.');
    const m=index(e),g={};
    for(const k of collections){
      need(Array.isArray(ids[k])&&new Set(ids[k]).size===ids[k].length,'Keep distinct original source references.');
      g[k]=ids[k].map(id=>{need(m[k].has(id),'A complete returned source member is missing.');return clone(m[k].get(id));});
    }
    return g;
  }
  function ids(e){return Object.fromEntries(collections.map(k=>[k,e[k].map(v=>v.id)]));}
  function envelope(e,r){return {schema:EVENT_WORKBOOK_RETURN,return:clone(r),graph:subset(e,r.source_ids)};}
  function returnDigest(e,r){const v=envelope(e,r);delete v.return.id;return digest(v);}
  function core(e,id){const v=e.snapshots.find(s=>s.id===id);need(v,'Keep the complete original choice snapshot.');return v.choices;}
  function assignment(e,id){const a=e.assignments.find(a=>a.id===id);need(a,'Keep the original immutable assignment.');return a;}
  function checkState(s,e){
    exact(s,['active_assignment_id','selected_return_id','local_receipt_ids','local_assignment_ids','resolution_drafts','pending'],'Retain complete unfinished reviewer state.');
    need(s.active_assignment_id===null||e.assignments.some(a=>a.id===s.active_assignment_id),'The active assignment is absent.');
    need(s.selected_return_id===null||e.incoming_returns.some(r=>r.id===s.selected_return_id),'The selected complete return is absent.');
    need(Array.isArray(s.local_receipt_ids)&&new Set(s.local_receipt_ids).size===s.local_receipt_ids.length&&s.local_receipt_ids.every(id=>e.receipts.some(r=>r.id===id)),'Retain the current operator’s actual receiving receipt selection.');
    need(Array.isArray(s.local_assignment_ids)&&new Set(s.local_assignment_ids).size===s.local_assignment_ids.length&&s.local_assignment_ids.every(id=>e.assignments.some(a=>a.id===id)),'Retain only this working copy’s own issued assignment selection.');
    need(plain(s.pending)&&Object.keys(s.pending).length<=40,'Keep the complete unfinished review fields.');
    for(const [k,v]of Object.entries(s.pending)){need(/^[a-z][a-z0-9_-]{0,63}$/.test(k),'Use a named original review field.');label(v,'unfinished review text',100000);}
    need(plain(s.resolution_drafts)&&Object.keys(s.resolution_drafts).length<=400,'Keep complete retained receiving choices.');
    for(const [id,d]of Object.entries(s.resolution_drafts)){
      need(e.incoming_returns.some(r=>r.id===id)&&plain(d),'Keep receiving choices with their complete original return.');
      for(const [k,v]of Object.entries(d))need(/^(0|[1-9][0-9]*)$/.test(k)&&Number(k)<32&&['keep-current','use-returned'].includes(v),'Choose a complete worksheet resolution.');
    }
  }
  function rows(e,current,r){
    const a=assignment(e,r.assignment_id),before=core(e,a.baseline_sha256),after=core(e,r.returned_sha256);
    return [...new Set([...Object.keys(before.columns),...Object.keys(current.columns),...Object.keys(after.columns)])].sort((a,b)=>Number(a)-Number(b)).map(key=>{
      const baseline=before.columns[key]??null,local=current.columns[key]??null,returned=after.columns[key]??null;
      const localChanged=!same(local,baseline),changed=!same(returned,baseline);
      const classification=!changed&&!localChanged?'unchanged':same(local,returned)?'same':!changed?'local':!localChanged?'incoming':'conflict';
      return {key,sheet:Number(key),classification,baseline:clone(baseline),current:clone(local),returned:clone(returned)};
    });
  }
  function resolved(e,current,r,resolutions){
    need(plain(resolutions),'Keep the complete explicit receiving choices.');
    const rr=rows(e,current,r),map=new Map(rr.map(x=>[x.key,x]));
    for(const [key,choice]of Object.entries(resolutions))need(map.has(key)&&['incoming','conflict','same'].includes(map.get(key).classification)&&['keep-current','use-returned'].includes(choice),'A previous receiving choice no longer matches this comparison. Remove it explicitly and review again.');
    const result=clone(current);
    for(const row of rr){
      need(row.classification!=='conflict'||own(resolutions,row.key),'Resolve every concurrently changed worksheet explicitly.');
      const use=['incoming','same','conflict'].includes(row.classification)&&(resolutions[row.key]??'use-returned')==='use-returned';
      if(use){if(row.returned===null)delete result.columns[row.key];else result.columns[row.key]=clone(row.returned);}
    }
    return base(result,current.original);
  }
  function checkGraph(e,original){
    exact(e,['schema',...collections,'resolution_drafts','active_assignment_id','selected_return_id','local_receipt_ids','local_assignment_ids','pending'],'Keep the complete original review receiving history.');
    need(e.schema===EVENT_WORKBOOK_REVIEW,'Use the original workbook review history format.');
    for(const k of collections){
      need(Array.isArray(e[k])&&e[k].length<=800,'Keep the complete original review inventory within 800 members per kind.');
      const seen=new Set();
      for(const v of e[k]){need(plain(v)&&HASH.test(v.id)&&!seen.has(v.id),'Keep distinct complete review source identities.');seen.add(v.id);}
    }
    for(const s of e.snapshots){exact(s,['id','choices'],'Keep complete original choice snapshots.');need(same(base(s.choices,original),s.choices)&&digest(s.choices)===s.id,'An immutable worksheet source snapshot changed.');}
    for(const a of e.assignments){
      exact(a,['id','baseline_sha256','actor','reviewer','note','at'],'Keep the complete immutable assignment.');
      core(e,a.baseline_sha256);label(a.actor,'the assigning author',200,true);label(a.reviewer,'the intended reviewer',200,true);label(a.note,'the assignment instructions',100000,true);stamped(a.at);
      need(digest({schema:EVENT_WORKBOOK_ASSIGNMENT,assignment:noid(a),baseline:core(e,a.baseline_sha256)})===a.id,'The original assignment changed identity.');
    }
    for(const r of e.incoming_returns){
      exact(r,['id','assignment_id','returned_sha256','actor','note','at','source_ids','reviewer_state'],'Keep the complete attributed original return.');
      const g=subset(e,r.source_ids);need(!r.source_ids.incoming_returns.includes(r.id),'A return cannot include itself as an earlier source.');
      assignment(g,r.assignment_id);core(g,r.returned_sha256);
      label(r.actor,'the returning reviewer',200,true);label(r.note,'the return explanation',100000,true);stamped(r.at);
      checkState(r.reviewer_state,g);need(returnDigest(e,r)===r.id,'The complete returned original file changed identity.');
    }
    for(const r of e.receipts){
      exact(r,['id','return_id','before_sha256','result_sha256','resolutions','actor','note','at'],'Retain the complete original receiving receipt.');
      const incoming=e.incoming_returns.find(v=>v.id===r.return_id);need(incoming,'Keep the complete original return with its receipt.');
      label(r.actor,'the receiving author',200,true);label(r.note,'the receiving reason',100000,true);stamped(r.at);
      need(same(resolved(e,core(e,r.before_sha256),incoming,r.resolutions),core(e,r.result_sha256))&&digest(noid(r))===r.id,'The original receiving result differs from its reviewed complete selection.');
    }
    checkState(historyState(e),e);
  }
  function checked(value,selected){
    const v=base(value,selected);
    if(own(value,'review_receiving')){checkGraph(value.review_receiving,v.original);v.review_receiving=clone(value.review_receiving);}
    return v;
  }
  function validateWorkspace(value,selected){
    need(plain(value),'Open a complete original workbook handover.');
    const raw=JSON.stringify(value);need(octets(raw).length<=RETURN_LIMIT,'The complete review workspace exceeds the editable 128 MiB allowance. Keep the original complete files.');
    return checked(value,selected);
  }
  function writable(value){const v=validateWorkspace(value);v.review_receiving??=empty();return v;}
  function add(e,k,v){const old=e[k].find(x=>x.id===v.id);need(!old||same(old,v),'The same original review identity has different complete content.');if(!old)e[k].push(clone(v));}
  function snapshot(e,v){const choices=base(v),id=digest(choices);add(e,'snapshots',{id,choices});return id;}
  function createAssignment(value,{actor,reviewer,note,at}){
    const v=writable(value),e=v.review_receiving;
    const a={baseline_sha256:snapshot(e,v),actor,reviewer,note,at};
    a.id=digest({schema:EVENT_WORKBOOK_ASSIGNMENT,assignment:a,baseline:core(e,a.baseline_sha256)});
    add(e,'assignments',a);if(!e.local_assignment_ids.includes(a.id))e.local_assignment_ids.push(a.id);validateWorkspace(v);
    return {value:v,envelope:assignmentEnvelope(v,a.id)};
  }
  function assignmentEnvelope(value,id){
    const v=validateWorkspace(value),e=v.review_receiving;need(e,'Keep the original issued assignment.');
    const a=assignment(e,id);
    return {schema:EVENT_WORKBOOK_ASSIGNMENT,assignment:clone(a),baseline:clone(core(e,a.baseline_sha256))};
  }
  function openAssignment(value){
    exact(value,['schema','assignment','baseline'],'Open the complete original assignment file.');
    need(value.schema===EVENT_WORKBOOK_ASSIGNMENT,'Use the original workbook assignment format.');
    const v=base(value.baseline),e=empty();e.snapshots=[{id:value.assignment.baseline_sha256,choices:clone(v)}];e.assignments=[clone(value.assignment)];e.active_assignment_id=value.assignment.id;
    v.review_receiving=e;return validateWorkspace(v);
  }
  function prepareReturn(value,id,{actor,note,at}){
    const v=writable(value),e=v.review_receiving;assignment(e,id);
    const r={assignment_id:id,returned_sha256:snapshot(e,v),actor,note,at,source_ids:ids(e),reviewer_state:historyState(e)};
    r.id=returnDigest(e,r);const g=clone(e);add(g,'incoming_returns',r);checkGraph(g,v.original);
    return envelope(g,r);
  }
  function readReturn(value,original){
    exact(value,['schema','return','graph'],'Receive the complete original return file.');
    need(value.schema===EVENT_WORKBOOK_RETURN,'Use the original workbook return format.');
    exact(value.graph,collections,'Keep the complete reviewer source graph.');
    const r=value.return,g={schema:EVENT_WORKBOOK_REVIEW,...clone(value.graph),...clone(r.reviewer_state)};
    const expected=ids(g);need(same(expected,r.source_ids),'The original return inventory changed ordering or membership.');
    need(!g.incoming_returns.some(x=>x.id===r.id),'The complete return must not contain itself.');
    add(g,'incoming_returns',r);checkGraph(g,original);
    return g;
  }
  function join(v,graph){
    const e=v.review_receiving;
    for(const k of collections)for(const row of graph[k])add(e,k,row);
    return v;
  }
  function prepared(current,value){
    const v=writable(current),g=readReturn(value,v.original);
    need(v.review_receiving.local_assignment_ids.includes(value.return.assignment_id),'This working copy did not issue the selected assignment. Retain carried assignments as original sources.');
    const issued=assignment(v.review_receiving,value.return.assignment_id);
    need(same(issued,assignment(g,value.return.assignment_id)),'This return does not match the original issued assignment.');
    join(v,g);return {value:v,extension:v.review_receiving,returned:value.return};
  }
  function previewReturn(current,value){
    const {value:v,extension:e,returned:r}=prepared(current,value),rr=rows(e,base(current),r),counts={unchanged:0,incoming:0,same:0,local:0,conflict:0};
    rr.forEach(x=>counts[x.classification]++);
    return {return_id:r.id,assignment_id:r.assignment_id,current_digest:digest(validateWorkspace(current)),rows:rr,counts,
      required_resolutions:rr.filter(x=>x.classification==='conflict').map(x=>x.key),
      already_received:!!current.review_receiving?.incoming_returns.some(x=>x.id===r.id),
      already_applied:!!current.review_receiving?.receipts.some(x=>x.return_id===r.id&&current.review_receiving.local_receipt_ids.includes(x.id))};
  }
  function stageReturn(current,value){
    const {value:v,extension:e,returned:r}=prepared(current,value);
    e.selected_return_id=r.id;return validateWorkspace(v);
  }
  function returnEnvelope(current,id){
    const v=validateWorkspace(current),e=v.review_receiving,r=e?.incoming_returns.find(x=>x.id===id);
    need(r,'Keep the complete original returned review.');return envelope(e,r);
  }
  function setResolutionDraft(current,id,key,choice){
    const v=writable(current),e=v.review_receiving;returnEnvelope(v,id);
    need(typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<32,'Choose an original worksheet index.');
    if(choice===null){
      if(e.resolution_drafts[id]){delete e.resolution_drafts[id][key];if(!Object.keys(e.resolution_drafts[id]).length)delete e.resolution_drafts[id];}
    }else{
      const row=previewReturn(v,returnEnvelope(v,id)).rows.find(r=>r.key===key);
      need(row&&['incoming','conflict','same'].includes(row.classification)&&['keep-current','use-returned'].includes(choice),'Choose a current complete worksheet conflict or incoming selection.');
      e.resolution_drafts[id]??={};e.resolution_drafts[id][key]=choice;
    }
    return validateWorkspace(v);
  }
  function setPending(current,key,value){need(typeof key==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(key),'Use a named original review field.');const v=writable(current);v.review_receiving.pending[key]=value;return validateWorkspace(v);}
  function applyReturn(current,value,{resolutions,actor,note,at,expected_current_digest}){
    const original=validateWorkspace(current);
    need(digest(original)===expected_current_digest,'The complete current choices or unfinished review changed. Reopen and review the current comparison.');
    const {value:v,extension:e,returned:r}=prepared(original,value);
    if(original.review_receiving?.receipts.some(x=>x.return_id===r.id&&original.review_receiving.local_receipt_ids.includes(x.id)))return original;
    const before=base(v),result=resolved(e,before,r,resolutions);
    const receipt={return_id:r.id,before_sha256:snapshot(e,before),result_sha256:snapshot(e,result),resolutions:clone(resolutions),actor,note,at};
    receipt.id=digest(receipt);add(e,'receipts',receipt);e.local_receipt_ids.push(receipt.id);e.selected_return_id=r.id;
    delete e.resolution_drafts[r.id];
    return validateWorkspace({...result,review_receiving:e});
  }
  return {validateWorkspace,createAssignment,assignmentEnvelope,openAssignment,prepareReturn,previewReturn,stageReturn,returnEnvelope,setResolutionDraft,setPending,applyReturn};
}
