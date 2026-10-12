// MIT. Pure three-way reconciliation of complete native captured handover drafts.
// Browser and Node share this model. Native history and source compilers remain
// authoritative; this module never reads a workspace or publishes an edition.
export const CAPTURED_DRAFT_MERGE_SCHEMA = 'stellar-forge.captured-draft-merge.v1';
export const CAPTURED_WORKING_EDIT_SCHEMA = 'stellar-forge.captured-working-edit.v1';

const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const LIMIT = 1000;
const missing = Object.freeze({present:false});
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
const fail = message => {throw Object.assign(new Error(message),{
  code:'CAPTURED_DRAFT_MERGE_INPUT',status:400,
});};
const need = (condition,message) => {if(!condition)fail(message);};
const plain = value => value!==null && typeof value==='object' &&
  (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null);
function keys(value) {
  need(plain(value),'Use a plain JSON object.');
  const result=Reflect.ownKeys(value);
  need(result.every(key=>typeof key==='string' &&
    Object.getOwnPropertyDescriptor(value,key).enumerable &&
    own(Object.getOwnPropertyDescriptor(value,key),'value')),
    'Use enumerable JSON fields without accessors or symbols.');
  return result;
}
function exact(value,allowed,required=[]) {
  const actual=keys(value);
  need(actual.every(key=>allowed.includes(key)) && required.every(key=>own(value,key)),
    'Use only the declared captured draft fields and retain every required field.');
}
function set(value,key,item) {
  Object.defineProperty(value,key,{value:item,enumerable:true,writable:true,configurable:true});
  return value;
}
function jsonCopy(value,ancestors=new Set(),depth=0) {
  need(depth<=256,'Keep draft JSON within the supported nesting depth.');
  if(value===null || typeof value==='string' || typeof value==='boolean')return value;
  if(typeof value==='number') {
    need(Number.isFinite(value),'Use finite JSON numbers.');return Object.is(value,-0)?0:value;
  }
  need(value!==undefined && typeof value==='object','Retain complete JSON values without undefined fields.');
  need(!ancestors.has(value),'Draft JSON cannot contain a cycle.');
  ancestors.add(value);
  let result;
  if(Array.isArray(value)) {
    const actual=Reflect.ownKeys(value);
    need(actual.length===value.length+1 && actual.every(key=>key==='length' ||
      typeof key==='string' && /^(0|[1-9][0-9]*)$/.test(key) && Number(key)<value.length &&
      Object.getOwnPropertyDescriptor(value,key).enumerable &&
      own(Object.getOwnPropertyDescriptor(value,key),'value')),
      'Use complete dense JSON arrays without additional properties.');
    result=Array.from({length:value.length},(_,index)=>jsonCopy(value[index],ancestors,depth+1));
  } else {
    result={};for(const key of keys(value))set(result,key,jsonCopy(value[key],ancestors,depth+1));
  }
  ancestors.delete(value);return result;
}
function canonical(value) {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(plain(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
const equal = (a,b) => canonical(a)===canonical(b);
const present = value => ({present:true,value});
const slot = (value,key) => own(value,key)?present(value[key]):missing;
const same = (a,b) => a.present===b.present && (!a.present || equal(a.value,b.value));
function kind(value) {
  need(value==='OUTGOING'||value==='RECEIVING','Choose OUTGOING or RECEIVING.');return value;
}
function label(value) {
  value??='Captured merchant handover';
  need(typeof value==='string'&&value.trim().length>0&&value.length<=160&&!/[\x00-\x1f\x7f]/.test(value),
    'Use a printable handover label of 1–160 characters.');
  return value.trim();
}
function form(type,input) {
  const value=jsonCopy(input);
  exact(value,type==='OUTGOING'?['label','packages','sources']:['label','bundle','manifestSha256','names']);
  const title=label(value.label);
  if(type==='OUTGOING') {
    const packages=value.packages??[],sources=value.sources??[];
    need(Array.isArray(packages)&&Array.isArray(sources)&&packages.length<=LIMIT&&sources.length<=LIMIT,
      'Keep each complete collection within the original 1000-member draft limit.');
    for(const row of packages) {
      if(typeof row==='string')need(row.length<=64,'Keep an original merchant name within 64 characters.');
      else exact(row,['name','manifestSha256'],['name']);
    }
    for(const row of sources)exact(row,['kind','id','revision'],['kind','id']);
    return {label:title,packages,sources};
  }
  const bundle=value.bundle??'',manifestSha256=value.manifestSha256??'',names=value.names??{};
  need(typeof bundle==='string'&&bundle.length<=4096,'Retain the original receiving directory text.');
  need(typeof manifestSha256==='string'&&(!manifestSha256||HASH.test(manifestSha256)),
    'Retain the exact source manifest SHA-256, or the original incomplete empty selection.');
  need(plain(names)&&Object.keys(names).length<=LIMIT&&
    Object.entries(names).every(([key,item])=>key.length<=64&&typeof item==='string'&&item.length<=64),
    'Keep the complete original receiving name map within its native limits.');
  // The native form validator owns host-specific absolute-path validation.
  return {label:title,bundle,manifestSha256,names};
}
function change(field,key,base,current,working) {
  const c=!same(base,current),w=!same(base,working);
  if(!c&&!w)return null;
  const selected=c&&w?null:c?current:working;
  const action=!base.present?'ADD':selected?!selected.present?'REMOVE':'CHANGE':
    !current.present&&!working.present?'REMOVE':'CHANGE';
  return {field,...(key===undefined?{}:{key}),side:c&&w?'BOTH':c?'CURRENT':'WORKING',action};
}
function reviewer(resolutions) {
  keys(resolutions);
  need(Object.values(resolutions).every(value=>value==='CURRENT'||value==='WORKING'),
    'Resolve a conflict with CURRENT or WORKING.');
  const conflicts=[],changes=[],used=new Set();
  function merge(field,key,base,current,working,{reason,force=false,category='value'}={}) {
    const edited=change(field,key,base,current,working);if(edited)changes.push(edited);
    if(same(current,working))return current;
    if(!force) {
      if(same(base,current))return working;
      if(same(base,working))return current;
    }
    const id=JSON.stringify([field,key??null,category]);
    const choice=own(resolutions,id)?resolutions[id]:undefined;
    if(choice)used.add(id);
    conflicts.push({id,field,...(key===undefined?{}:{key}),
      reason:reason??'Both editions changed this original value differently.',
      base:jsonCopy(base),current:jsonCopy(current),working:jsonCopy(working),
      ...(choice?{choice}:{}),
    });
    return choice==='WORKING'?working:current;
  }
  return {conflicts,changes,merge,finish() {
    need(Object.keys(resolutions).every(id=>used.has(id)),
      'A resolution no longer belongs to this exact draft comparison. Review its current conflicts.');
    return conflicts.every(item=>item.choice)?'READY':'CONFLICTS';
  }};
}
function packageKey(row) {
  const name=typeof row==='string'?row:row.name;
  return typeof name==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)?name:null;
}
function sourceKey(row) {
  return (row.kind==='capture'||row.kind==='refresh')&&typeof row.id==='string'&&HASH.test(row.id)
    ?row.kind+':'+row.id:null;
}
function index(rows,keyOf) {
  const order=[],values=new Map();
  for(const row of rows) {
    const key=keyOf(row);
    if(key===null||values.has(key))return null;
    order.push(key);values.set(key,row);
  }
  return {order,values};
}
const mappedSlot = (map,key) => map.has(key)?present(map.get(key)):missing;
function union(...sequences) {
  const seen=new Set(),result=[];
  for(const sequence of sequences)for(const key of sequence)if(!seen.has(key)){seen.add(key);result.push(key);}
  return result;
}
function possible(base,current,working) {
  if(same(current,working))return current.present;
  if(same(base,current))return working.present;
  if(same(base,working))return current.present;
  return current.present||working.present;
}
function completeOrder(preferred,secondary,base,retained) {
  const keep=new Set(retained),result=preferred.filter(key=>keep.has(key)),seen=new Set(result);
  for(const sequence of [secondary,base,retained]) {
    for(let index=0;index<sequence.length;index++) {
      const key=sequence[index];if(!keep.has(key)||seen.has(key))continue;
      let before=-1;
      for(let next=index+1;next<sequence.length;next++) {
        if(seen.has(sequence[next])){before=result.indexOf(sequence[next]);break;}
      }
      if(before<0)result.push(key);else result.splice(before,0,key);
      seen.add(key);
    }
  }
  return result;
}
function relative(positions,a,b) {
  if(!positions.has(a)||!positions.has(b))return 0;
  return positions.get(a)<positions.get(b)?1:-1;
}
function mergeOrder(field,base,current,working,retained,review) {
  const keep=new Set(retained);
  const b=base.filter(key=>keep.has(key)),c=current.filter(key=>keep.has(key)),w=working.filter(key=>keep.has(key));
  const edited=change(field+'.order',undefined,present(b),present(c),present(w));
  if(edited)review.changes.push(edited);
  if(equal(b,c)&&equal(c,w))return c;
  const order=union(c,w,b,retained),n=order.length;
  if(n<2)return order;
  const positions=[b,c,w].map(rows=>new Map(rows.map((key,index)=>[key,index])));
  const edges=new Uint8Array(n*n),incoming=new Uint32Array(n),taken=new Uint8Array(n);
  let incompatible=false;
  // Each pair retains its original order unless one edition explicitly changed
  // it. Relations involving an added member come from the edition containing it.
  // Compatible independent moves combine; cycles require an explicit order.
  for(let left=0;left<n;left++)for(let right=left+1;right<n;right++) {
    const a=order[left],z=order[right];
    const before=relative(positions[0],a,z),now=relative(positions[1],a,z),edit=relative(positions[2],a,z);
    let direction;
    if(now&&edit) {
      if(now===edit)direction=now;
      else if(before)direction=now===before?edit:now;
      else {incompatible=true;continue;}
    } else direction=now||edit||before;
    if(direction) {
      const from=direction===1?left:right,to=direction===1?right:left;
      edges[from*n+to]=1;incoming[to]++;
    }
  }
  const merged=[];
  if(!incompatible)for(let step=0;step<n;step++) {
    let selected=-1;
    for(let candidate=0;candidate<n;candidate++)if(!taken[candidate]&&incoming[candidate]===0){selected=candidate;break;}
    if(selected<0){incompatible=true;break;}
    taken[selected]=1;merged.push(order[selected]);
    for(let target=0;target<n;target++)if(edges[selected*n+target])incoming[target]--;
  }
  if(!incompatible)return merged;
  // Order choices never remove any independently merged member or row value.
  // The original/current/working key lists remain available in the conflict.
  if(edited)review.changes.pop();
  const before=present(b),now=present(c),editedOrder=present(w);
  const chosen=review.merge(field+'.order',undefined,before,now,editedOrder,{
    force:true,category:'order',
    reason:'The combined member ordering conflicts. Choose an order; every merged member is retained.',
  });
  return chosen===editedOrder?completeOrder(w,c,b,retained):completeOrder(c,w,b,retained);
}
function arrayMerge(field,base,current,working,keyOf,review) {
  const arrays=[base,current,working],maps=arrays.map(rows=>index(rows,keyOf));
  if(maps.some(value=>value===null))return review.merge(field,undefined,present(base),present(current),present(working),{
    force:true,category:'ambiguous-members',
    reason:'A complete list contains repeated or incomplete original keys. Choose the whole list so no row is silently combined.',
  }).value;
  const all=union(...maps.map(value=>value.order));
  const potential=all.filter(key=>possible(...maps.map(value=>mappedSlot(value.values,key)))).length;
  if(potential>LIMIT)return review.merge(field,undefined,present(base),present(current),present(working),{
    force:true,category:'member-limit',
    reason:'Combining the complete selections could exceed the original 1000-member limit. Choose a complete list.',
  }).value;
  const merged=new Map();
  for(const key of all) {
    const selected=review.merge(field,key,...maps.map(value=>mappedSlot(value.values,key)),{
      reason:'Both editions changed or removed this original member differently.',
    });
    if(selected.present)merged.set(key,selected.value);
  }
  const order=mergeOrder(field,...maps.map(value=>value.order),[...merged.keys()],review);
  return order.map(key=>merged.get(key));
}
function namesMerge(base,current,working,review) {
  const all=union(Object.keys(base),Object.keys(current),Object.keys(working));
  if(all.filter(key=>possible(slot(base,key),slot(current,key),slot(working,key))).length>LIMIT)
    return review.merge('names',undefined,present(base),present(current),present(working),{
      force:true,category:'member-limit',
      reason:'The combined receiving map could exceed the original 1000-name limit. Choose the complete map.',
    }).value;
  const result={};
  for(const key of all) {
    const selected=review.merge('names',key,slot(base,key),slot(current,key),slot(working,key),{
      reason:'Both editions changed or removed this original receiving name differently.',
    });
    if(selected.present)set(result,key,selected.value);
  }
  return result;
}
function receivingSelection(value) {
  return {bundle:value.bundle,manifestSha256:value.manifestSha256,names:value.names};
}

/** Compare complete original editions; unresolved conflicts provisionally use CURRENT. */
export function reviewCapturedDraftMerge(value) {
  exact(value,['kind','base','current','working','resolutions'],['kind','base','current','working']);
  const type=kind(value.kind),base=form(type,value.base),current=form(type,value.current),working=form(type,value.working);
  const resolutions=value.resolutions===undefined?{}:jsonCopy(value.resolutions),review=reviewer(resolutions);
  const result={label:review.merge('label',undefined,present(base.label),present(current.label),present(working.label)).value};
  if(type==='OUTGOING') {
    result.packages=arrayMerge('packages',base.packages,current.packages,working.packages,packageKey,review);
    result.sources=arrayMerge('sources',base.sources,current.sources,working.sources,sourceKey,review);
  } else if(base.manifestSha256===current.manifestSha256&&base.manifestSha256===working.manifestSha256) {
    result.bundle=review.merge('bundle',undefined,present(base.bundle),present(current.bundle),present(working.bundle)).value;
    result.manifestSha256=base.manifestSha256;
    result.names=namesMerge(base.names,current.names,working.names,review);
  } else {
    const selected=review.merge('selection',undefined,present(receivingSelection(base)),
      present(receivingSelection(current)),present(receivingSelection(working)),{
        category:'source-selection',
        reason:'A source manifest changed while the receiving selection was also edited. Choose its complete original directory, manifest and name map together.',
      }).value;
    Object.assign(result,selected);
  }
  return {schema:CAPTURED_DRAFT_MERGE_SCHEMA,status:review.finish(),
    form:jsonCopy(result),conflicts:review.conflicts,changes:review.changes};
}
function workingPacket(value,read) {
  const fields=['productId','draftId','kind','baseRevision','base','working'];
  exact(value,read?['schema',...fields]:fields,read?['schema',...fields]:fields);
  if(read)need(value.schema===CAPTURED_WORKING_EDIT_SCHEMA,'Use the original captured working-edit schema.');
  need(typeof value.productId==='string'&&HASH.test(value.productId),'Retain the original product identifier.');
  need(typeof value.draftId==='string'&&UUID.test(value.draftId),'Retain the original draft identifier.');
  need(typeof value.baseRevision==='string'&&HASH.test(value.baseRevision),'Retain the exact original base edition SHA-256.');
  const type=kind(value.kind);
  return {schema:CAPTURED_WORKING_EDIT_SCHEMA,productId:value.productId,draftId:value.draftId,
    kind:type,baseRevision:value.baseRevision,base:form(type,value.base),working:form(type,value.working)};
}
/** Retain full original base and working forms; no timestamp, random identity or source rewriting. */
export function createCapturedWorkingEdit(value) {return workingPacket(value,false);}
/** Read plain JSON. The native host must verify product, draft and exact base history before adoption. */
export function readCapturedWorkingEdit(value) {return workingPacket(value,true);}
