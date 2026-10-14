'use strict';
function createCutover(cmp,codec){
const bytesHash=s=>codec.sha256(codec.utf8Encode(s));
const clone=x=>JSON.parse(JSON.stringify(x)),hash=cmp.digest,own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),fail=m=>{throw Error(m)},text=(s,n)=>typeof s==='string'&&s.trim()?s:fail(n+' is required'),key=(...a)=>JSON.stringify(a);
function contract(c){
 if(c?.schema!=='crm-cutover.contract.v1'||!Array.isArray(c.objects)||!c.objects.length||!Array.isArray(c.associations))fail('Complete cutover contract required');
 const ids=new Set();
 for(const o of c.objects){for(const n of ['id','title','sourceId','targetId','baseSource','source','baseTarget','target','crosswalk'])text(o[n],n);
 if(ids.has(o.id))fail('Duplicate object');ids.add(o.id);if(!o.crosswalkColumns)fail('Crosswalk columns required');text(o.crosswalkColumns.source,'Crosswalk source');text(o.crosswalkColumns.target,'Crosswalk target');
 if(new Set([o.baseSource,o.source,o.baseTarget,o.target]).size!==4)fail('Select four distinct retained source editions');
 if(!Array.isArray(o.fields)||!o.fields.length)fail('Compared fields required');const fs=new Set(),ts=new Set();
 for(const a of o.fields){text(a.id,'Field ID');text(a.source,'Source column');text(a.target,'Target property/column');if(fs.has(a.id)||ts.has(a.target))fail('Duplicate field or target property');fs.add(a.id);ts.add(a.target);
 if(!['text','trim','lower','decimal','date','enum'].includes(a.type||'text'))fail('Unknown field type');if(a.type==='decimal')cmp.decimal('0',a.scale??2);
 if(a.type==='enum'){for(const m of ['sourceMap','targetMap']){if(!a[m]||typeof a[m]!=='object'||Array.isArray(a[m])||Object.values(a[m]).some(v=>typeof v!=='string'))fail('Explicit enum maps required');}if(new Set(Object.values(a.targetMap)).size!==Object.values(a.targetMap).length)fail('Target enum map must be reversible');}}
 }
 const families=new Set(),directions=new Set();for(const a of c.associations){for(const n of ['id','title','fromObject','toObject','baseSource','source','baseTarget','target'])text(a[n],n);if(families.has(a.id)||ids.has(a.id))fail('Duplicate relationship family');families.add(a.id);const dir=key(a.fromObject,a.toObject);if(directions.has(dir))fail('One family per directed object pair');directions.add(dir);if(!ids.has(a.fromObject)||!ids.has(a.toObject))fail('Unknown endpoint object');if(new Set([a.baseSource,a.source,a.baseTarget,a.target]).size!==4)fail('Select four distinct relationship editions');
 for(const side of ['sourceColumns','targetColumns'])for(const n of side==='sourceColumns'?['from','to','type']:['from','to','category','typeId'])text(a[side]?.[n],side+' '+n);
 if(!Array.isArray(a.types)||!a.types.length)fail('Relationship types required');const ss=new Set(),tt=new Set();for(const t of a.types){text(t.source,'Source relation');if(!['HUBSPOT_DEFINED','USER_DEFINED'].includes(t.category)||!/^\d+$/.test(t.typeId))fail('Actual category and decimal type ID required');const k=key(t.category,t.typeId);if(ss.has(t.source)||tt.has(k))fail('Relationship map must be one-to-one');ss.add(t.source);tt.add(k);}
 }
 return clone(c);
}
function targetValue(v,f){const n=cmp.normalized(v,f,'source');if(n==='')return '';if(f.type==='enum'){const a=Object.entries(f.targetMap).filter(([,x])=>x===n);if(a.length!==1)fail('Canonical enum lacks exactly one target value');return a[0][0];}if(f.type==='decimal'){let s=n,neg=s[0]==='-';if(neg)s=s.slice(1);const scale=f.scale??2;s=s.padStart(scale+1,'0');return(neg?'-':'')+(scale?s.slice(0,-scale)+'.'+s.slice(-scale):s);}return n;}
function build(c,originals){
 c=contract(c);const tables={},inputs={};function table(id,cols){if(!tables[id]){const s=originals[id];if(!s||typeof s.content!=='string')fail('Missing original '+id);tables[id]=cmp.parseCSV(s.content);inputs[id]={filename:s.filename,sha256:bytesHash(s.content)};}const t=tables[id];for(const col of cols)if(!t.headers.includes(col))fail('Missing '+col+' in '+id);return t;}
 const items=[],issues=[],objects={},relations={};function issue(code,entity,record,message,refs=[]){const v={code,entity,record,message,refs};issues.push({id:'input-'+hash(v),...v});}
 function refs(id,r){return r?{table:id,row:r.row,physical_line:r.line??r.row,values:clone(r.values)}:null;}
 function index(id,col,entity){const map=new Map();for(const r of table(id,[col]).records){const k=r.values[col];if(!k){issue('blank_id',entity,'row '+r.row,'Identifier is blank',[refs(id,r)]);continue;}if(map.has(k)){issue('duplicate_id',entity,k,'Identifier is ambiguous',[refs(id,map.get(k)),refs(id,r)]);}else map.set(k,r);}return map;}
 function item(v){const x={...v,id:'change-'+hash(v)};items.push(x);return x;}
 for(const o of c.objects){
  const beforeIssue=issues.length,bs=index(o.baseSource,o.sourceId,o.id),s=index(o.source,o.sourceId,o.id),bt=index(o.baseTarget,o.targetId,o.id),t=index(o.target,o.targetId,o.id),map=new Map(),rev=new Map();
  for(const id of[o.baseSource,o.source])table(id,o.fields.map(f=>f.source));for(const id of[o.baseTarget,o.target])table(id,o.fields.map(f=>f.target));
  for(const r of table(o.crosswalk,[o.crosswalkColumns.source,o.crosswalkColumns.target]).records){const sid=r.values[o.crosswalkColumns.source],tid=r.values[o.crosswalkColumns.target];if(!sid||!tid||map.has(sid)||rev.has(tid)||(!s.has(sid)&&!bs.has(sid))||(!t.has(tid)&&!bt.has(tid))){issue('ambiguous_crosswalk',o.id,sid,'Crosswalk must map two existing unique identities exactly once',[refs(o.crosswalk,r)]);continue;}map.set(sid,tid);rev.set(tid,sid);}
  for(const sid of bs.keys())if(!map.has(sid))issue('baseline_unmapped',o.id,sid,'Baseline source record lacks a retained target identity');
  objects[o.id]={definition:o,bs,s,bt,t,map,rev};
  if(issues.length!==beforeIssue)continue;
  for(const sid of new Set([...bs.keys(),...s.keys()])){
   const sr=s.get(sid),br=bs.get(sid),tid=map.get(sid)||null,tr=tid?t.get(tid):null,btr=tid?bt.get(tid):null,rr=[refs(o.baseSource,br),refs(o.source,sr),refs(o.baseTarget,btr),refs(o.target,tr)].filter(Boolean);
   if(!br&&sr&&!tr&&!tid){let props={};try{for(const a of o.fields)props[a.target]=targetValue(sr.values[a.source],a);}catch(e){issue('invalid_field',o.id,sid,e.message,rr);continue;}item({entity:o.id,record:sid,targetId:null,field:'',kind:'create',source:props,target:null,proposal:props,needsDecision:false,refs:rr});continue;}
   if(!sr){item({entity:o.id,record:sid,targetId:tid,field:'',kind:'source_removed',source:null,target:tr?.values||null,proposal:null,needsDecision:true,refs:rr});continue;}
   if(!tr){item({entity:o.id,record:sid,targetId:tid,field:'',kind:'target_missing',source:sr.values,target:null,proposal:null,needsDecision:true,refs:rr});continue;}
   for(const a of o.fields){
    try{const sv=cmp.normalized(sr.values[a.source],a,'source'),tv=cmp.normalized(tr.values[a.target],a,'target'),bsv=br?cmp.normalized(br.values[a.source],a,'source'):null,btv=btr?cmp.normalized(btr.values[a.target],a,'target'):null;
     let kind;if(!br||!btr)kind=sv===tv?'converged':'baseline_gap';else if(bsv===btv){kind=sv===tv?(sv===bsv?'unchanged':'converged'):sv===bsv?'target_only':tv===btv?'source_change':'conflict';}else kind=sv===tv?'converged':'baseline_mismatch';
     if(kind==='unchanged')continue;
     item({entity:o.id,record:sid,targetId:tid,field:a.id,property:a.target,kind,baseSource:br?.values[a.source]??null,source:sr.values[a.source],baseTarget:btr?.values[a.target]??null,target:tr.values[a.target],canonical:{baseSource:bsv,source:sv,baseTarget:btv,target:tv},proposal:targetValue(sr.values[a.source],a),needsDecision:['conflict','baseline_gap','baseline_mismatch'].includes(kind),refs:rr});
    }catch(e){issue('invalid_field',o.id,sid,a.id+': '+e.message,rr);}
   }
  }
 }
 for(const a of c.associations){
  const from=objects[a.fromObject],to=objects[a.toObject],typeSource=new Map(a.types.map(t=>[t.source,t])),typeTarget=new Map(a.types.map(t=>[key(t.category,t.typeId),t])),sets={};
  for(const role of['baseSource','source','baseTarget','target']){
   const sourceSide=role==='baseSource'||role==='source',cols=sourceSide?a.sourceColumns:a.targetColumns,selected=table(a[role],Object.values(cols)),m=new Map();
   for(const row of selected.records){const v=row.values,rawFrom=v[cols.from],rawTo=v[cols.to],type=sourceSide?typeSource.get(v[cols.type]):typeTarget.get(key(v[cols.category],v[cols.typeId]));
    if(!type){issue('unknown_relation_type',a.id,rawFrom+' → '+rawTo,'Relationship type lacks explicit direction/category/type map',[refs(a[role],row)]);continue;}
    const fromId=sourceSide?rawFrom:from.rev.get(rawFrom),toId=sourceSide?rawTo:to.rev.get(rawTo);
    const fm=role==='baseSource'?from.bs:role==='source'?from.s:role==='baseTarget'?from.bt:from.t,tm=role==='baseSource'?to.bs:role==='source'?to.s:role==='baseTarget'?to.bt:to.t;
    if(!fm.has(rawFrom)||!tm.has(rawTo)){issue('orphan_relation',a.id,rawFrom+' → '+rawTo,'Relationship endpoints absent from same snapshot',[refs(a[role],row)]);continue;}
    if(!fromId||!toId){issue('unmapped_relation_endpoint',a.id,rawFrom+' → '+rawTo,'Selected relationship endpoint lacks source-to-target identity',[refs(a[role],row)]);continue;}
    const k=key(fromId,toId,type.source);if(m.has(k)){issue('duplicate_relation',a.id,k,'Relationship is duplicated',[refs(a[role],m.get(k).row),refs(a[role],row)]);continue;}m.set(k,{from:fromId,to:toId,type:type.source,row});
   }sets[role]=m;
  }
  relations[a.id]={definition:a,sets};
  for(const k of new Set(Object.values(sets).flatMap(m=>[...m.keys()]))){const bits=Object.fromEntries(Object.entries(sets).map(([r,m])=>[r,m.has(k)])),v=Object.values(sets).map(m=>m.get(k)).find(Boolean);
   const kind=bits.source===bits.target?'relation_converged':bits.baseSource!==bits.baseTarget?'relation_baseline_mismatch':bits.source===bits.baseSource?'relation_target_only':bits.source?'relation_add':'relation_remove';
   if(Object.values(bits).every(x=>x===bits.source))continue;
   item({entity:a.id,record:k,field:'',kind,relation:{from:v.from,to:v.to,type:v.type},baseSource:bits.baseSource,source:bits.source,baseTarget:bits.baseTarget,target:bits.target,proposal:bits.source,needsDecision:kind==='relation_baseline_mismatch'||(kind==='relation_remove'&&(!from.s.has(v.from)||!to.s.has(v.to))),refs:Object.entries(sets).filter(([,m])=>m.has(k)).map(([r,m])=>refs(a[r],m.get(k).row))});
  }
 }
 const data={schema:'crm-cutover.plan.v1',contract:c,inputs,items,issues};return {...data,sha256:hash(data)};
}
function packet(plan,decisions,originals,actor,at){
 text(actor,'Named packet owner');text(at,'Packet timestamp');const fresh=build(plan.contract,originals);if(fresh.sha256!==plan.sha256)fail('Plan differs from selected originals');if(plan.issues.length)fail('Correct original identity, value or relationship issues before issuing a packet');
 const c=plan.contract,byId=new Map(plan.items.map(x=>[x.id,x])),choices=new Map();
 for(const d of decisions){if(!byId.has(d.item_id)||!['accept_source','preserve_target','custom','defer'].includes(d.choice)||!d.actor?.trim()||!d.reason?.trim())fail('Every decision needs its exact item, actor and reason');choices.set(d.item_id,d);}
 const expected={objects:{},associations:{}},steps=[],reversal=[],preserved=[],unresolved=[];
 for(const o of c.objects){const target=cmp.parseCSV(originals[o.target].content),cw=cmp.parseCSV(originals[o.crosswalk].content),map=new Map(cw.records.map(r=>[r.values[o.crosswalkColumns.target],r.values[o.crosswalkColumns.source]]));expected.objects[o.id]=target.records.map(r=>({sourceId:map.get(r.values[o.targetId])||null,targetId:r.values[o.targetId],properties:Object.fromEntries(o.fields.map(f=>[f.target,r.values[f.target]]))}));}
 for(const a of c.associations){const from=c.objects.find(o=>o.id===a.fromObject),to=c.objects.find(o=>o.id===a.toObject),lookup=o=>new Map(cmp.parseCSV(originals[o.crosswalk].content).records.map(r=>[r.values[o.crosswalkColumns.target],r.values[o.crosswalkColumns.source]])),fm=lookup(from),tm=lookup(to);expected.associations[a.id]=cmp.parseCSV(originals[a.target].content).records.map(r=>({from:fm.get(r.values[a.targetColumns.from]),to:tm.get(r.values[a.targetColumns.to]),type:a.types.find(t=>t.category===r.values[a.targetColumns.category]&&t.typeId===r.values[a.targetColumns.typeId]).source}));}
 for(const x of plan.items){
  const d=choices.get(x.id),defaultChoice=x.needsDecision?'defer':['source_change','create','relation_add','relation_remove'].includes(x.kind)?'accept_source':'preserve_target',choice=d?.choice||defaultChoice;
  if(choice==='defer'){unresolved.push(x.id);continue;}
  if(['source_removed','target_missing'].includes(x.kind)&&choice!=='preserve_target')fail('Removed source or missing target requires preservation or a corrected new snapshot');
  if(choice==='preserve_target'){preserved.push({item_id:x.id,kind:x.kind,decision:d||null});continue;}
  if(x.kind==='create'){
   if(choice!=='accept_source')fail('New record supports accept source or preserve target');expected.objects[x.entity].push({sourceId:x.record,targetId:null,properties:clone(x.proposal)});
   steps.push({id:x.id,order:10,kind:'create',object:x.entity,sourceId:x.record,targetId:null,properties:clone(x.proposal),precondition:{source_identity_absent:true},decision:d||null});reversal.push({step_id:x.id,kind:'created_record_manual_review',object:x.entity,sourceId:x.record,reason:'Confirm actual assigned ID and downstream use before any archive decision'});continue;
  }
  if(x.relation){
   if(choice!=='accept_source')fail('Relationship supports accept source or preserve target');const a=c.associations.find(a=>a.id===x.entity),rel=x.relation,arr=expected.associations[x.entity],idx=arr.findIndex(r=>key(r.from,r.to,r.type)===key(rel.from,rel.to,rel.type)),desired=x.proposal;
   if(desired&&idx<0)arr.push(clone(rel));if(!desired&&idx>=0)arr.splice(idx,1);
   if(desired!==x.target){const type=a.types.find(t=>t.source===rel.type);steps.push({id:x.id,order:desired?40:30,kind:desired?'associate':'disassociate',family:a.id,fromObject:a.fromObject,toObject:a.toObject,...clone(rel),category:type.category,typeId:type.typeId,precondition:{present:x.target},decision:d||null});reversal.push({step_id:x.id,kind:desired?'disassociate':'associate',family:a.id,...clone(rel),precondition:{present:desired}});}continue;
  }
  const o=c.objects.find(o=>o.id===x.entity),field=o.fields.find(f=>f.id===x.field);let v=x.proposal;if(choice==='custom'){if(typeof d.value!=='string')fail('Custom target value must be text');cmp.normalized(d.value,field,'target');v=d.value;}
  const r=expected.objects[x.entity].find(r=>r.targetId===x.targetId);if(!r)fail('Expected target record absent');
  r.properties[x.property]=v;if(cmp.normalized(v,field,'target')!==cmp.normalized(x.target,field,'target')){
   steps.push({id:x.id,order:20,kind:'update_property',object:x.entity,sourceId:x.record,targetId:x.targetId,property:x.property,value:v,clear:v==='',precondition:{value:x.target},decision:d||null});
   reversal.push({step_id:x.id,kind:'update_property',object:x.entity,sourceId:x.record,targetId:x.targetId,property:x.property,value:x.target,precondition:{value:v}});
  }
 }
 for(const a of c.associations){const fromRows=expected.objects[a.fromObject],toRows=expected.objects[a.toObject],seen=new Map();
  for(const r of expected.associations[a.id]){if(!fromRows.some(x=>x.sourceId===r.from)||!toRows.some(x=>x.sourceId===r.to))fail('Proposed relationship endpoint was not retained or created');const t=a.types.find(t=>t.source===r.type);if(t.primaryCompany){const k=key(r.from);if(seen.has(k)&&seen.get(k)!==r.to)fail('Proposed graph has multiple primary companies for '+r.from);seen.set(k,r.to);}}
 }
 if(unresolved.length)fail(unresolved.length+' item(s) still need a named decision');
 steps.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));const value={schema:'crm-cutover.packet.v1',plan_sha256:plan.sha256,contract:c,inputs:plan.inputs,actor,at,decisions:clone(decisions),steps,preserved,reversal,expected};return {...value,sha256:hash(value)};
}
function reconcile(p,observed){
 if(p.schema!=='crm-cutover.packet.v1'||hash(Object.fromEntries(Object.entries(p).filter(([k])=>k!=='sha256')))!==p.sha256)fail('Packet identity mismatch');
 const findings=[],targetMaps={},sources={};function issue(code,entity,record,field,expected,actual){findings.push({code,entity,record,field,expected,actual});}
 for(const o of p.contract.objects){
  const t=cmp.parseCSV(text(observed[o.id]?.target,'Observed target CSV')),cw=cmp.parseCSV(text(observed[o.id]?.crosswalk,'Observed crosswalk CSV'));
  for(const col of[o.targetId,...o.fields.map(f=>f.target)])if(!t.headers.includes(col))fail('Observed target lacks '+col);
  for(const col of[o.crosswalkColumns.source,o.crosswalkColumns.target])if(!cw.headers.includes(col))fail('Observed crosswalk lacks '+col);
  const map=new Map(),reverse=new Map(),rows=new Map();for(const r of cw.records){const s=r.values[o.crosswalkColumns.source],d=r.values[o.crosswalkColumns.target];if(!s||!d||map.has(s)||reverse.has(d))fail('Observed crosswalk is not one-to-one');map.set(s,d);reverse.set(d,s);}
  for(const r of t.records){const id=r.values[o.targetId];if(!id||rows.has(id))fail('Observed target identifiers are ambiguous');rows.set(id,r.values);}
  targetMaps[o.id]={map,reverse,rows};sources[o.id]={target_sha256:bytesHash(observed[o.id].target),crosswalk_sha256:bytesHash(observed[o.id].crosswalk)};
  const used=new Set();for(const r of p.expected.objects[o.id]){const tid=r.targetId||map.get(r.sourceId);if(r.sourceId&&map.get(r.sourceId)!==tid)issue('identity_changed',o.id,r.sourceId,'Record ID',tid,map.get(r.sourceId)||'');const actual=rows.get(tid);if(!actual){issue('missing_record',o.id,r.sourceId||r.targetId,'Record ID',tid||'new assigned identity','');continue;}used.add(tid);
   for(const f of o.fields){try{const e=cmp.normalized(r.properties[f.target],f,'target'),a=cmp.normalized(actual[f.target],f,'target');if(e!==a)issue('property_difference',o.id,r.sourceId||tid,f.target,e,a);}catch(e){issue('invalid_observed_value',o.id,r.sourceId||tid,f.target,r.properties[f.target],e.message);}}
  }for(const id of rows.keys())if(!used.has(id))issue('unexpected_record',o.id,id,'Record ID','within selected population',id);
 }
 for(const a of p.contract.associations){const content=text(observed[a.id]?.target,'Observed relationship CSV'),t=cmp.parseCSV(content),set=new Set();sources[a.id]={target_sha256:bytesHash(content)};for(const col of Object.values(a.targetColumns))if(!t.headers.includes(col))fail('Observed relationship lacks '+col);
  for(const r of t.records){const from=targetMaps[a.fromObject].reverse.get(r.values[a.targetColumns.from]),to=targetMaps[a.toObject].reverse.get(r.values[a.targetColumns.to]),type=a.types.find(x=>x.category===r.values[a.targetColumns.category]&&x.typeId===r.values[a.targetColumns.typeId]);if(!from||!to||!type){issue('invalid_relation',a.id,'row '+r.row,'endpoints/type','mapped endpoints and category/type',r.values);continue;}const k=key(from,to,type.source);if(set.has(k))issue('duplicate_relation',a.id,k,'relation','one',2);set.add(k);}
  const expected=new Set(p.expected.associations[a.id].map(r=>key(r.from,r.to,r.type)));for(const k of expected)if(!set.has(k))issue('missing_relation',a.id,k,'relation',true,false);for(const k of set)if(!expected.has(k))issue('unexpected_relation',a.id,k,'relation',false,true);
 }
 const value={schema:'crm-cutover.reconciliation.v1',packet_sha256:p.sha256,sources,findings};return {...value,sha256:hash(value)};
}
function reversalCheck(p,observed){
 const comparison=reconcile(p,observed),ready=[],conflicts=[],manual=[],bindings={};
 for(const o of p.contract.objects){const expected=new Map(p.expected.objects[o.id].filter(x=>x.sourceId).map(x=>[x.sourceId,x.targetId])),current=new Map(cmp.parseCSV(observed[o.id].crosswalk).records.map(x=>[x.values[o.crosswalkColumns.source],x.values[o.crosswalkColumns.target]]));bindings[o.id]={expected,current};}
 function binding(object,sourceId){const b=bindings[object],expected=b.expected.get(sourceId),actual=b.current.get(sourceId);return {object,sourceId,expected:expected??null,actual:actual??null,stable:!!expected&&actual===expected,newRecord:expected===null};}
 for(const r of p.reversal){
  if(r.kind==='created_record_manual_review'){manual.push(clone(r));continue;}
  if(r.kind==='update_property'){
   const identity=binding(r.object,r.sourceId);if(!identity.stable||identity.expected!==r.targetId){conflicts.push({step:r,identity,reason:'Current source-to-target identity differs from the issued packet'});continue;}
   const o=p.contract.objects.find(o=>o.id===r.object),rows=cmp.parseCSV(observed[o.id].target).records.filter(x=>x.values[o.targetId]===r.targetId),f=o.fields.find(f=>f.target===r.property);
   if(rows.length!==1||cmp.normalized(rows[0].values[r.property],f,'target')!==cmp.normalized(r.precondition.value,f,'target'))conflicts.push({step:r,actual:rows[0]?.values[r.property]??null,reason:'Current property no longer equals the packet after-value'});else ready.push(clone(r));
  }else{
   const a=p.contract.associations.find(a=>a.id===r.family),from=binding(a.fromObject,r.from),to=binding(a.toObject,r.to);
   if(from.newRecord||to.newRecord){manual.push({...clone(r),identities:{from,to},reason:'A created endpoint needs a separately retained post-change identity assignment before reversal'});continue;}
   if(!from.stable||!to.stable){conflicts.push({step:r,identities:{from,to},reason:'Current relationship endpoint identity differs from the issued packet'});continue;}
   const type=a.types.find(t=>t.source===r.type),rows=cmp.parseCSV(observed[a.id].target).records,matching=rows.filter(x=>x.values[a.targetColumns.from]===from.expected&&x.values[a.targetColumns.to]===to.expected&&x.values[a.targetColumns.category]===type.category&&x.values[a.targetColumns.typeId]===type.typeId),present=matching.length===1;
   if(matching.length>1||present!==r.precondition.present)conflicts.push({step:r,reason:'Current relationship differs from the packet after-state'});else ready.push({...clone(r),fromTargetId:from.expected,toTargetId:to.expected,category:type.category,typeId:type.typeId});
  }
 }
 ready.sort((a,b)=>({disassociate:10,update_property:20,associate:30}[a.kind]-{disassociate:10,update_property:20,associate:30}[b.kind])||a.step_id.localeCompare(b.step_id));
 return {schema:'crm-cutover.reversal-check.v1',packet_sha256:p.sha256,observation_sha256:comparison.sha256,ready,conflicts,manual};
}
return {contract,build,packet,reconcile,reversalCheck,targetValue};
}
module.exports={createCutover};
