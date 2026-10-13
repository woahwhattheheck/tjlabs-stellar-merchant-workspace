/* MIT. Source-bound colleague returns for the complete Event mapping working document. */
export const EVENT_MAPPING_REVIEW = 'stellar-forge.event-mapping-colleague-working.v1';
export const EVENT_MAPPING_ASSIGNMENT = 'stellar-forge.event-mapping-colleague-assignment.v1';
export const EVENT_MAPPING_RETURN = 'stellar-forge.event-mapping-colleague-return.v1';
export function createEventMappingReviewAPI({workingAPI, eventMappingHash, eventMappingBytes} = {}) {
 const need=(ok,message)=>{if(!ok)throw Error(message);};
 const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
 const clone=x=>JSON.parse(JSON.stringify(x));
 const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':plain(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
 const same=(a,b)=>a===b||canonical(a)===canonical(b);
 const shape=(x,keys,label)=>need(plain(x)&&Object.keys(x).length===keys.length&&keys.every(k=>own(x,k)),label+' must retain all its original fields.');
 const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
 need(workingAPI&&['reopen','updateDraft','compare','status','serialize'].every(k=>typeof workingAPI[k]==='function')&&typeof eventMappingHash==='function'&&typeof eventMappingBytes==='function','Use the complete original mapping working API and source hash functions.');
 const MAX=192*1024*1024, allowed=['mapping','reviewer','note'], kinds=['copies','assignments','incoming_returns','receipts'];
 const accepted=new WeakSet(), acceptedEnvelopes=new WeakSet(), originalDigests=new WeakMap(), digestCache=new WeakMap(), byteCache=new WeakMap();
 const digest=x=>{if(x&&typeof x==='object'&&digestCache.has(x))return digestCache.get(x);const result=eventMappingHash(canonical(x));if(x&&typeof x==='object'&&Object.isFrozen(x))digestCache.set(x,result);return result;};
 const text=(x,max,label)=>{need(typeof x==='string'&&x.trim()&&eventMappingBytes(x)<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x),'Record '+label+' within '+max+' UTF-8 bytes.');return x;};
 const at=x=>{need(typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(x)&&Number.isFinite(Date.parse(x)),'Record the original UTC time.');return x;};
 const sourceDigest=original=>{let d=originalDigests.get(original);if(!d){d=digest(original);originalDigests.set(original,d);}return d;};
 const id=(prefix,body)=>prefix+'-'+digest(body);
 // Bind every original source byte through its cached complete digest; form edits need not serialize the raw windows again.
 const currentDigest=value=>{const {original,...working}=value.working;return digest({schema:value.schema,working:{...working,original_sha256:sourceDigest(original)},review_receiving:value.review_receiving});};
 function identified(row,prefix,label){need(plain(row)&&typeof row.id==='string',label+' needs its immutable identity.');const {id:actual,...body}=row;need(actual===id(prefix,body),label+' differs from its complete original identity.');}
 const empty=()=>({copies:[],assignments:[],incoming_returns:[],receipts:[],local_assignment_ids:[],local_receipt_ids:[],active_assignment_id:null,selected_return_id:null,resolution_drafts:{},pending:{}});
 function jsonBytes(value){
  if(value&&typeof value==='object'){
   if(byteCache.has(value))return byteCache.get(value);
   const array=Array.isArray(value),keys=array?value.map((_,i)=>i):Object.keys(value);
   let count=2;
   for(let i=0;i<keys.length;i++){if(i)count++;const key=keys[i];if(!array)count+=eventMappingBytes(JSON.stringify(key))+1;count+=jsonBytes(value[key]);}
   if(Object.isFrozen(value))byteCache.set(value,count);
   return count;
  }
  const encoded=JSON.stringify(value);need(typeof encoded==='string','Keep complete JSON source values.');return eventMappingBytes(encoded);
 }
 function bounded(value){need(jsonBytes(value)+1<=MAX,'Keep the complete colleague working file within 192 MiB. Preserve the unchanged original; no source or earlier work was omitted.');return value;}
 function admit(value){bounded(value);freeze(value);accepted.add(value);return value;}
 const graph=e=>Object.fromEntries(kinds.map(k=>[k,e[k]]));
 const ids=e=>Object.fromEntries(kinds.map(k=>[k,e[k].map(row=>row.id)]));
 function indexes(e){return Object.fromEntries(kinds.map(k=>[k,new Map(e[k].map(row=>[row.id,row]))]));}
 function identityLists(value,maps,label){shape(value,kinds,label);for(const kind of kinds){need(Array.isArray(value[kind])&&new Set(value[kind]).size===value[kind].length,label+' keeps unique complete '+kind+'.');for(const key of value[kind])need(typeof key==='string'&&maps[kind].has(key),label+' is missing an original '+kind+' member.');}}
 function validateGraph(e,original){
  shape(e,kinds,'Complete flat colleague source graph');
  const source=sourceDigest(original);
  for(const kind of kinds){need(Array.isArray(e[kind]),'Keep the complete '+kind+' source as original records.');need(new Set(e[kind].map(x=>x?.id)).size===e[kind].length,'Keep one complete identity for each '+kind+' entry.');}
  const maps=indexes(e);
  for(const row of e.copies){
   shape(row,['id','comparison','draft','history'],'Complete retained mapping copy');identified(row,'c','Retained mapping copy');
   workingAPI.reopen({schema:'stellar-forge.event-mapping-working-copy.v1',original,comparison:row.comparison,draft:row.draft,history:row.history});
  }
  for(const row of e.assignments){
   shape(row,['id','source_sha256','baseline_copy_id','issuer','recipient','note','at','graph_ids'],'Original mapping assignment');identified(row,'a','Original mapping assignment');
   need(row.source_sha256===source&&maps.copies.has(row.baseline_copy_id),'The assignment must retain this exact original source pair and baseline copy.');
   text(row.issuer,240,'issuing engineer');text(row.recipient,240,'reviewing colleague');text(row.note,8000,'assignment scope');at(row.at);identityLists(row.graph_ids,maps,'Issued source history');
   need(row.graph_ids.copies.includes(row.baseline_copy_id)&&!row.graph_ids.assignments.includes(row.id),'Keep the baseline in the original issued source history.');
  }
  for(const row of e.incoming_returns){
   shape(row,['id','source_sha256','assignment_id','copy_id','reviewer','note','at','graph_ids'],'Complete colleague return');identified(row,'r','Complete colleague return');
   need(row.source_sha256===source&&maps.assignments.has(row.assignment_id)&&maps.copies.has(row.copy_id),'The return must retain this exact issued source and whole returned copy.');
   text(row.reviewer,240,'return author');text(row.note,8000,'return note');at(row.at);identityLists(row.graph_ids,maps,'Returned source history');
   need(row.graph_ids.assignments.includes(row.assignment_id)&&row.graph_ids.copies.includes(row.copy_id)&&!row.graph_ids.incoming_returns.includes(row.id),'Retain the complete issued assignment and returned copy in its original history.');
  }
  for(const row of e.receipts){
   shape(row,['id','return_id','before_copy_id','after_copy_id','resolutions','actor','note','at'],'Original receiving decision');identified(row,'p','Original receiving decision');
   need(maps.incoming_returns.has(row.return_id)&&maps.copies.has(row.before_copy_id)&&maps.copies.has(row.after_copy_id),'The receiving decision must retain its complete original return and both working copies.');
   choices(row.resolutions);text(row.actor,240,'receiving engineer');text(row.note,8000,'receiving reason');at(row.at);
   const incoming=maps.incoming_returns.get(row.return_id),issued=maps.assignments.get(incoming.assignment_id),baseline=maps.copies.get(issued.baseline_copy_id),current=maps.copies.get(row.before_copy_id),returned=maps.copies.get(incoming.copy_id);
   const b=units(baseline),c=units(current),r=units(returned);
   for(const key of allowed)if(same(r[key],b[key]))need(row.resolutions[key]==='keep-current','A recorded receiving choice changed a unit with no incoming change.');
   const actual=copyRow(receiptResult(original,current,returned,row.resolutions));
   need(same(actual,maps.copies.get(row.after_copy_id)),'The recorded receiving result differs from its complete current/returned choices and original history.');
  }
  return maps;
 }
 function receiptResult(original,before,returned,resolutions){
  shape(resolutions,allowed,'Complete recorded receiving choices');choices(resolutions);
  const current={schema:'stellar-forge.event-mapping-working-copy.v1',original,comparison:before.comparison,draft:before.draft,history:before.history};
  const b=units(before),r=units(returned),chosen=Object.fromEntries(allowed.map(key=>[key,resolutions[key]==='use-returned'?r[key]:b[key]]));
  let history=current.history;
  if(!same(chosen.mapping.comparison,current.comparison)){
   need(history.length<128,'Keep the complete current file; its original comparison history is full. No source or colleague decision was omitted.');
   history=[...history,{comparison:current.comparison,draft:current.draft}];
  }
  return workingAPI.reopen({schema:current.schema,original,comparison:clone(chosen.mapping.comparison),draft:{fields:clone(chosen.mapping.fields),reviewer:chosen.reviewer,note:chosen.note,decisions:clone(chosen.mapping.decisions)},history});
 }
 function choices(value){need(plain(value)&&Object.keys(value).every(k=>allowed.includes(k)&&['keep-current','use-returned'].includes(value[k])),'Keep explicit current or returned choices for mapping, reviewer and note.');}
 function pending(value){need(plain(value)&&Object.keys(value).length<=16,'Keep the complete pending colleague form.');for(const [key,valueText]of Object.entries(value))need(/^[a-z][a-z0-9_]{0,63}$/.test(key)&&typeof valueText==='string'&&eventMappingBytes(valueText)<=16000,'Keep pending form text within its complete 16000-byte field allowance.');}
 function reopen(value){
  if(accepted.has(value))return value;
  shape(value,['schema','working','review_receiving'],'Complete colleague working file');need(value.schema===EVENT_MAPPING_REVIEW,'Open a complete Event mapping colleague working file.');
  const working=workingAPI.reopen(value.working),e=value.review_receiving;
  shape(e,['copies','assignments','incoming_returns','receipts','local_assignment_ids','local_receipt_ids','active_assignment_id','selected_return_id','resolution_drafts','pending'],'Complete colleague receiving history');
  const maps=validateGraph(graph(e),working.original);
  for(const [key,kind]of [['local_assignment_ids','assignments'],['local_receipt_ids','receipts']])need(Array.isArray(e[key])&&new Set(e[key]).size===e[key].length&&e[key].every(key=>maps[kind].has(key)),'Retain this working copy\'s actual local '+kind+' authority.');
  need(e.active_assignment_id===null||maps.assignments.has(e.active_assignment_id),'Retain the selected complete assignment.');
  need(e.selected_return_id===null||maps.incoming_returns.has(e.selected_return_id),'Retain the selected complete return.');
  need(plain(e.resolution_drafts)&&Object.keys(e.resolution_drafts).every(key=>maps.incoming_returns.has(key)),'Retain unfinished choices with their original complete return.');
  Object.values(e.resolution_drafts).forEach(choices);pending(e.pending);
  return admit(value);
 }
 function wrap(value){return value?.schema===EVENT_MAPPING_REVIEW?reopen(value):admit({schema:EVENT_MAPPING_REVIEW,working:workingAPI.reopen(value),review_receiving:empty()});}
 function copyRow(working){const body={comparison:working.comparison,draft:working.draft,history:working.history};return {id:id('c',body),...body};}
 function add(e,kind,row){const old=e[kind].find(x=>x.id===row.id);need(!old||same(old,row),'An existing complete '+kind+' identity changed.');return old?e:{...e,[kind]:[...e[kind],row]};}
 function withCopy(e,working){const row=copyRow(working);return {e:add(e,'copies',row),row};}
 function replaceWorking(value,next){
  const v=wrap(value),working=workingAPI.reopen(next);
  need(same(v.working.original,working.original),'Continue the same original source pair, programme, parser and accepted comparison.');
  return admit({...v,working});
 }
 function updatePending(value,patch){
  const v=wrap(value);need(plain(patch),'Keep pending form changes as named complete text.');
  const next={...v.review_receiving.pending};for(const [key,textValue]of Object.entries(patch)){if(textValue===null)delete next[key];else next[key]=textValue;}pending(next);
  return admit({...v,review_receiving:{...v.review_receiving,pending:next}});
 }
 function createAssignment(value,{issuer,recipient,note,at:when}={}){
  const v=wrap(value);text(issuer,240,'issuing engineer');text(recipient,240,'reviewing colleague');text(note,8000,'assignment scope');at(when);
  let {e,row:baseline}=withCopy(v.review_receiving,v.working);
  const existing=e.assignments.find(x=>x.baseline_copy_id===baseline.id&&x.issuer===issuer&&x.recipient===recipient&&x.note===note&&x.at===when&&e.local_assignment_ids.includes(x.id));
  if(existing)return admit({...v,review_receiving:{...e,active_assignment_id:existing.id}});
  const body={source_sha256:sourceDigest(v.working.original),baseline_copy_id:baseline.id,issuer,recipient,note,at:when,graph_ids:ids(e)},assignment={id:id('a',body),...body};
  e=add(e,'assignments',assignment);
  const local=e.local_assignment_ids.includes(assignment.id)?e.local_assignment_ids:[...e.local_assignment_ids,assignment.id];
  return admit({...v,review_receiving:{...e,local_assignment_ids:local,active_assignment_id:assignment.id}});
 }
 function selectedGraph(e,selected,extraKind,extraRow){
  const maps=indexes(e),result={};for(const kind of kinds)result[kind]=selected[kind].map(key=>{const row=maps[kind].get(key);need(row,'Recover every original retained source member.');return row;});
  return add(result,extraKind,extraRow);
 }
 function assignmentEnvelope(value,assignmentId){
  const v=wrap(value),e=v.review_receiving,row=e.assignments.find(x=>x.id===assignmentId);need(row,'Select the retained original assignment.');
  return validateEnvelope({schema:EVENT_MAPPING_ASSIGNMENT,original:v.working.original,graph:selectedGraph(e,row.graph_ids,'assignments',row),assignment_id:row.id});
 }
 function validateEnvelope(value){
  if(acceptedEnvelopes.has(value))return value;
  const returning=value?.schema===EVENT_MAPPING_RETURN;
  shape(value,returning?['schema','original','graph','assignment_id','return_id']:['schema','original','graph','assignment_id'],'Whole colleague source envelope');
  need(returning||value.schema===EVENT_MAPPING_ASSIGNMENT,'Open the complete original assignment or return.');
  const maps=validateGraph(value.graph,value.original),assignment=maps.assignments.get(value.assignment_id);need(assignment,'The complete envelope is missing its original assignment.');
  const root=returning?maps.incoming_returns.get(value.return_id):assignment;
  need(root&&(!returning||root.assignment_id===assignment.id),'The whole return must name its exact original assignment.');
  const selected=selectedGraph(value.graph,root.graph_ids,returning?'incoming_returns':'assignments',root);
  need(same(selected,value.graph),'Retain exactly the original complete envelope graph, including all source history.');
  bounded(value);freeze(value);acceptedEnvelopes.add(value);return value;
 }
 function openAssignment(envelope){
  const env=validateEnvelope(envelope);need(env.schema===EVENT_MAPPING_ASSIGNMENT,'Open an issued complete assignment.');
  const assignment=env.graph.assignments.find(x=>x.id===env.assignment_id),row=env.graph.copies.find(x=>x.id===assignment.baseline_copy_id);
  const working=workingAPI.reopen({schema:'stellar-forge.event-mapping-working-copy.v1',original:env.original,comparison:row.comparison,draft:row.draft,history:row.history});
  return reopen({schema:EVENT_MAPPING_REVIEW,working,review_receiving:{...empty(),...env.graph,active_assignment_id:assignment.id}});
 }
 function prepareReturn(value,assignmentId,{reviewer,note,at:when}={}){
  const v=wrap(value);text(reviewer,240,'return author');text(note,8000,'return note');at(when);
  need(v.review_receiving.assignments.some(x=>x.id===assignmentId),'Select the complete retained assignment being returned.');
  let {e,row:returned}=withCopy(v.review_receiving,v.working);
  const existing=e.incoming_returns.find(x=>x.assignment_id===assignmentId&&x.copy_id===returned.id&&x.reviewer===reviewer&&x.note===note&&x.at===when);
  if(existing)return admit({...v,review_receiving:{...e,selected_return_id:existing.id,active_assignment_id:assignmentId}});
  const body={source_sha256:sourceDigest(v.working.original),assignment_id:assignmentId,copy_id:returned.id,reviewer,note,at:when,graph_ids:ids(e)},row={id:id('r',body),...body};
  e=add(e,'incoming_returns',row);
  return admit({...v,review_receiving:{...e,selected_return_id:row.id,active_assignment_id:assignmentId}});
 }
 function returnEnvelope(value,returnId){
  const v=wrap(value),e=v.review_receiving,row=e.incoming_returns.find(x=>x.id===returnId);need(row,'Select the retained complete return.');
  return validateEnvelope({schema:EVENT_MAPPING_RETURN,original:v.working.original,graph:selectedGraph(e,row.graph_ids,'incoming_returns',row),assignment_id:row.assignment_id,return_id:row.id});
 }
 function incoming(value,envelope){
  const v=wrap(value),env=validateEnvelope(envelope);need(env.schema===EVENT_MAPPING_RETURN,'Receive the whole original colleague return.');
  need(same(v.working.original,env.original),'This return belongs to a different original source pair, programme, parser or accepted comparison.');
  need(v.review_receiving.local_assignment_ids.includes(env.assignment_id),'This working copy did not issue that assignment. Keep its complete returned source separately.');
  const local=v.review_receiving.assignments.find(x=>x.id===env.assignment_id),remote=env.graph.assignments.find(x=>x.id===env.assignment_id);
  need(same(local,remote),'The returned assignment differs from this working copy\'s original issued source.');
  let e=v.review_receiving;for(const kind of kinds)for(const row of env.graph[kind])e=add(e,kind,row);
  return {v,env,e,row:env.graph.incoming_returns.find(x=>x.id===env.return_id),assignment:local};
 }
 function stageReturn(value,envelope){const {v,env,e}=incoming(value,envelope);return reopen({...v,review_receiving:{...e,selected_return_id:env.return_id}});}
 const units=copy=>({mapping:{fields:copy.draft.fields,comparison:copy.comparison,decisions:copy.draft.decisions},reviewer:copy.draft.reviewer,note:copy.draft.note});
 function previewReturn(value,envelope){
  const {v,env,e,row,assignment}=incoming(value,envelope),maps=indexes(e);
  const before=maps.copies.get(assignment.baseline_copy_id),returned=maps.copies.get(row.copy_id),current=copyRow(v.working);
  const b=units(before),c=units(current),r=units(returned);
  const rows=allowed.map(key=>{
   const changedCurrent=!same(c[key],b[key]),changedReturned=!same(r[key],b[key]);
   const classification=!changedCurrent&&!changedReturned?'unchanged':!changedReturned?'local':!changedCurrent?'incoming':same(c[key],r[key])?'same':'conflict';
   return {key,classification,baseline:clone(b[key]),current:clone(c[key]),returned:clone(r[key])};
  });
  const receipts=e.receipts.filter(x=>x.return_id===env.return_id&&e.local_receipt_ids.includes(x.id));
  return freeze({schema:'stellar-forge.event-mapping-colleague-preview.v1',assignment_id:assignment.id,return_id:row.id,source_sha256:row.source_sha256,current_digest:currentDigest(v),baseline_copy_id:before.id,current_copy_id:current.id,returned_copy_id:returned.id,rows,required_resolutions:rows.filter(x=>x.classification==='conflict').map(x=>x.key),already_applied:receipts.length>0,local_receipt_ids:receipts.map(x=>x.id),carried_receipt_ids:e.receipts.filter(x=>x.return_id===row.id&&!e.local_receipt_ids.includes(x.id)).map(x=>x.id),retained_history:{baseline:before.history.length,current:current.history.length,returned:returned.history.length}});
 }
 function setResolutionDraft(value,returnId,key,choice){
  const v=wrap(value);need(v.review_receiving.incoming_returns.some(x=>x.id===returnId),'Keep the complete original return before saving choices.');need(allowed.includes(key),'Choose mapping, reviewer or note.');
  const drafts={...v.review_receiving.resolution_drafts},selected={...(drafts[returnId]||{})};
  if(choice===null){delete selected[key];drafts[returnId]=selected;return admit({...v,review_receiving:{...v.review_receiving,resolution_drafts:drafts}});}
  need(['keep-current','use-returned'].includes(choice),'Choose current or returned work explicitly.');
  const preview=previewReturn(v,returnEnvelope(v,returnId)),row=preview.rows.find(x=>x.key===key);
  need(['incoming','same','conflict'].includes(row.classification),'This unit has no incoming change to resolve. Clear an earlier choice or reopen the current comparison.');
  selected[key]=choice;drafts[returnId]=selected;return admit({...v,review_receiving:{...v.review_receiving,resolution_drafts:drafts}});
 }
 function applyReturn(value,envelope,{resolutions,actor,note,at:when,expected_current_digest}={}){
  const info=incoming(value,envelope),v=info.v,env=info.env;let e=info.e;
  const preview=previewReturn(v,env);
  if(preview.already_applied)return v;
  need(typeof expected_current_digest==='string'&&expected_current_digest===preview.current_digest,'The complete current working copy changed. Review its original comparison again before receiving.');
  text(actor,240,'receiving engineer');text(note,8000,'receiving reason');at(when);
  const selected=resolutions===undefined?(e.resolution_drafts[env.return_id]||{}):resolutions;choices(selected);
  for(const key of Object.keys(selected)){const row=preview.rows.find(x=>x.key===key);need(['incoming','same','conflict'].includes(row.classification),'A saved '+key+' choice is stale. Clear it explicitly and review the current work.');}
  for(const key of preview.required_resolutions)need(own(selected,key),'Resolve the overlapping '+key+' work explicitly.');
  const chosen={},effective={};
  for(const row of preview.rows){const choice=selected[row.key]||(row.classification==='incoming'?'use-returned':'keep-current');chosen[row.key]=choice==='use-returned'?row.returned:row.current;effective[row.key]=choice;}
  const current=v.working,returned=e.copies.find(x=>x.id===info.row.copy_id);
  const working=receiptResult(current.original,copyRow(current),returned,effective);
  const before=withCopy(e,current);e=before.e;const after=withCopy(e,working);e=after.e;
  const body={return_id:env.return_id,before_copy_id:before.row.id,after_copy_id:after.row.id,resolutions:effective,actor,note,at:when},receipt={id:id('p',body),...body};e=add(e,'receipts',receipt);
  const drafts={...e.resolution_drafts};delete drafts[env.return_id];
  return reopen({...v,working,review_receiving:{...e,local_receipt_ids:[...e.local_receipt_ids,receipt.id],selected_return_id:env.return_id,resolution_drafts:drafts}});
 }
 function serialize(value){return JSON.stringify(reopen(value))+'\n';}
 function inspect(value){const v=wrap(value),e=v.review_receiving;return freeze({source_sha256:sourceDigest(v.working.original),working_digest:currentDigest(v),active_assignment_id:e.active_assignment_id,selected_return_id:e.selected_return_id,counts:Object.fromEntries(kinds.map(k=>[k,e[k].length])),local_assignment_ids:[...e.local_assignment_ids],local_receipt_ids:[...e.local_receipt_ids],status:workingAPI.status(v.working)});}
 return Object.freeze({wrap,reopen,replaceWorking,updatePending,createAssignment,assignmentEnvelope,openAssignment,prepareReturn,returnEnvelope,stageReturn,previewReturn,setResolutionDraft,applyReturn,serialize,inspect});
}
