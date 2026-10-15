function createDeliverySlotCore(options){
"use strict";
const {codec}=options,SCHEMA="tjlabs.delivery-slot-study.v1";
const columns={"slots":["slot_id","name","cutoff_at","cutoff_boundary","fulfilment_at","reference"],"products":["product_id","name","base_unit","quantity_kind"],"unit_packs":["product_id","unit","base_quantity","quantity_step"],"buyers":["buyer_id","name"],"slot_products":["slot_id","product_id","cutoff_at","cutoff_boundary","capacity_quantity","capacity_unit","reference"],"order_revisions":["revision_id","slot_id","order_id","line_id","revision","buyer_id","product_id","status","quantity","unit","submitted_at","reference"],"production":["observation_id","slot_id","product_id","quantity","unit","observed_at","coverage","reference"],"picking":["observation_id","slot_id","order_id","line_id","quantity","unit","observed_at","state","reference"]};
const clone=x=>JSON.parse(JSON.stringify(x)),plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
function need(ok,message){if(!ok)throw new Error(message);}
function text(v,label,max=10000,empty=false){need(typeof v==="string"&&v.length<=max&&(empty||v.trim()),"Invalid "+label);codec.utf8Encode(v);return v;}
function canonical(x){if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";if(plain(x))return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";return JSON.stringify(x);}
const hash=x=>codec.sha256(codec.utf8Encode(typeof x==="string"?x:canonical(x)));
const S9=1000000000n,S18=S9*S9;
function decimal(s,label){text(s,label,40);need(/^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,9})?$/.test(s),"Use a nonnegative decimal with at most18 integer and9 fractional digits: "+label);const [a,b=""]=s.split(".");return BigInt(a)*S9+BigInt(b.padEnd(9,"0"));}
function show(n){const neg=n<0n;if(neg)n=-n;const a=n/S18,b=(n%S18).toString().padStart(18,"0").replace(/0+$/,"");return (neg?"-":"")+a+(b?"."+b:"");}
function stamp(s,label){
 text(s,label,50);const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(s);
 need(m,"Explicit date, seconds and UTC offset required: "+label);
 const [y,mo,d,h,mi,se]=m.slice(1,7).map(Number),leap=y%4===0&&(y%100!==0||y%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 need(y>=1&&mo>=1&&mo<=12&&d>=1&&d<=days[mo-1]&&h<=23&&mi<=59&&se<=59,"Invalid calendar timestamp: "+label);
 if(m[8]!=="Z"){const oh=Number(m[8].slice(1,3)),om=Number(m[8].slice(4));need(oh<=14&&om<=59&&(oh!==14||om===0),"Invalid UTC offset: "+label);}
 const n=Date.parse(s);need(Number.isFinite(n),"Invalid timestamp: "+label);return n;
}
function identity(v,label){return text(v,label,250);}
function unique(rows,key,label){const map=new Map();for(const r of rows){const k=key(r);need(!map.has(k),"Duplicate "+label+" at source line"+r._line);map.set(k,r);}return map;}
function pair(a,b){return canonical([a,b]);}
function lineKey(s,o,l){return canonical([s,o,l]);}
function clean(o){return Object.fromEntries(Object.entries(o).filter(([k])=>!k.startsWith("_")));}
function parse(textValue,required,label){
 text(textValue,label,4*1024*1024,true);need(codec.utf8Encode(textValue).length<=4*1024*1024,"CSV exceeds4MiB");
 let s=textValue.charCodeAt(0)===65279?textValue.slice(1):textValue,records=[],row=[],cell="",quoted=false,closed=false,line=1,start=1;
 const put=()=>{row.push(cell);cell="";closed=false;};
 const finish=()=>{put();if(row.some(x=>x!==""))records.push({cells:row,line:start,endLine:line});row=[];start=line+1;};
 for(let i=0;i<s.length;i++){const ch=s[i];
  if(quoted){if(ch==='"'){if(s[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=ch;if(ch==="\n")line++;else if(ch==="\r"&&s[i+1]!=="\n")line++;}continue;}
  if(ch==='"'){need(!cell&&!closed,"Unexpected quote in "+label+" at line"+line);quoted=true;}
  else if(ch===",")put();
  else if(ch==="\n"||ch==="\r"){finish();if(ch==="\r"&&s[i+1]==="\n")i++;line++;start=line;}
  else {need(!closed,"Text after quote in "+label+" at line"+line);cell+=ch;}
 }
 need(!quoted,"Unclosed CSV quote in "+label);if(cell||row.length||closed)finish();
 need(records.length>0,"Missing explicit header in "+label);
 const head=records.shift().cells;need(new Set(head).size===head.length,"Duplicate header in "+label);
 for(const h of required)need(head.includes(h),"Missing "+h+" in "+label);
 need(records.length<=20000,"Too many rows in "+label);
 return records.map((r,i)=>{need(r.cells.length===head.length,"Unequal columns in "+label+" line"+r.line);const x=Object.create(null);head.forEach((h,j)=>{need(h&&h!=="__proto__","Invalid header");x[h]=r.cells[j];});return {...x,_line:r.line,_endLine:r.endLine,_record:i+1};});
}
function csvTable(head,rows){
 const numeric=new Set(["revision","sourceLine","sourceEndLine","baselineQuantity","selectedQuantity","pickQuantity","pickDifference","quantity","baseQuantity","baselineDemand","reviewedDemand","capacityQuantity","capacityExcess","producedQuantity","productionDifference","pickedQuantity","dispatchedQuantity","observedPickLines","totalLines","requiredPickLines","observedRequiredPickLines"]);
 const q=(x,key)=>{let s=x===null||x===undefined?"":typeof x==="object"?JSON.stringify(x):String(x);
 const number=numeric.has(key)&&/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(s);
 if(!number&&(/^[ \t\r\n]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s)))s="'"+s;
 return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
 return head.map(h=>q(h,"")).join(",")+"\r\n"+rows.map(r=>head.map(h=>q(r[h],h)).join(",")).join("\r\n")+(rows.length?"\r\n":"");
}

function retainedSources(input){
 need(plain(input),"All source tables required");const out={};
 for(const table of Object.keys(columns)){const s=input[table];need(plain(s),"Missing source "+table);text(s.name,"source name",500);text(s.text,"source "+table,4*1024*1024,true);const b=codec.utf8Encode(s.text);out[table]={name:s.name,text:s.text,bytes:b.length,sha256:codec.sha256(b)};}
 return out;
}
function editionBody(e){return {id:e.id,label:e.label,receivedAt:e.receivedAt,notes:e.notes,sources:e.sources};}
function base(e){
 const tables={};for(const table of Object.keys(columns))tables[table]=parse(e.sources[table].text,columns[table],table);
 const slots=unique(tables.slots,r=>identity(r.slot_id,"slot_id"),"slot"),products=unique(tables.products,r=>identity(r.product_id,"product_id"),"product"),buyers=unique(tables.buyers,r=>identity(r.buyer_id,"buyer_id"),"buyer");
 for(const r of slots.values()){text(r.name,"slot name");r._cutoff=stamp(r.cutoff_at,"slot cutoff");r._fulfilment=stamp(r.fulfilment_at,"fulfilment");need(["before","at_or_before"].includes(r.cutoff_boundary),"Declare cutoff boundary");need(r._cutoff<r._fulfilment,"Slot cutoff must precede fulfilment");}
 for(const r of products.values()){text(r.name,"product name");identity(r.base_unit,"base unit");need(["whole","decimal"].includes(r.quantity_kind),"quantity_kind must be whole or decimal");}
 for(const r of buyers.values())text(r.name,"buyer name");
 const units=unique(tables.unit_packs,r=>pair(r.product_id,r.unit),"product unit");
 for(const r of units.values()){need(products.has(r.product_id),"Unit refers to unknown product");identity(r.unit,"unit");r._factor=decimal(r.base_quantity,"unit factor");r._step=decimal(r.quantity_step,"quantity step");need(r._factor>0n&&r._step>0n,"Unit factor and quantity step must be positive");}
 for(const p of products.values())need(units.has(pair(p.product_id,p.base_unit))&&units.get(pair(p.product_id,p.base_unit))._factor===S9,"Each product requires explicit factor1 base unit");
 function qty(product,value,unit,label){
  const p=products.get(product),u=units.get(pair(product,unit));need(p&&u,"Unknown product or product-specific unit: "+label);
  const n=decimal(value,label);need(n%u._step===0n,"Quantity is not a multiple of declared step: "+label);const b=n*u._factor;
  need(p.quantity_kind!=="whole"||b%S18===0n,"Whole product requires integral base quantity: "+label);return b;
 }
 const sp=unique(tables.slot_products,r=>pair(r.slot_id,r.product_id),"slot/product");
 for(const r of sp.values()){
  const s=slots.get(r.slot_id);need(s&&products.has(r.product_id),"Unknown slot/product");
  r._cutoffAt=r.cutoff_at||s.cutoff_at;r._boundary=r.cutoff_boundary||s.cutoff_boundary;r._cutoff=stamp(r._cutoffAt,"effective product cutoff");
  need(["before","at_or_before"].includes(r._boundary),"Invalid product cutoff boundary");need(r._cutoff<s._fulfilment,"Product cutoff must precede fulfilment");
  need((r.capacity_quantity==="")===(r.capacity_unit===""),"Capacity quantity and unit must both be supplied or both blank");
  r._capacity=r.capacity_quantity===""?null:qty(r.product_id,r.capacity_quantity,r.capacity_unit,"capacity");
 }
 const revs=unique(tables.order_revisions,r=>identity(r.revision_id,"revision ID"),"revision ID"),groups=new Map();
 for(const r of revs.values()){
  identity(r.order_id,"order ID");identity(r.line_id,"line ID");need(buyers.has(r.buyer_id),"Unknown buyer");const p=sp.get(pair(r.slot_id,r.product_id));need(p,"Revision has unknown slot/product");
  need(/^[1-9][0-9]{0,8}$/.test(r.revision),"Revision must be positive integer");r._revision=Number(r.revision);r._time=stamp(r.submitted_at,"revision submitted_at");
  need(["confirmed","cancelled"].includes(r.status),"Revision status must be confirmed or cancelled");r._quantity=qty(r.product_id,r.quantity,r.unit,"revision "+r.revision_id);
  need(r.status==="cancelled"?r._quantity===0n:r._quantity>0n,"Cancelled quantity must be0; confirmed quantity must be positive");
  r._key=lineKey(r.slot_id,r.order_id,r.line_id);r._eligible=p._boundary==="before"?r._time<p._cutoff:r._time<=p._cutoff;
  if(!groups.has(r._key))groups.set(r._key,[]);groups.get(r._key).push(r);
 }
 for(const rows of groups.values()){
  rows.sort((a,b)=>a._revision-b._revision);const first=rows[0];
  for(let i=0;i<rows.length;i++){const r=rows[i];need(r.buyer_id===first.buyer_id&&r.product_id===first.product_id,"Line buyer/product changed; cancel and use a distinct line");if(i){need(r._revision!==rows[i-1]._revision,"Repeated numeric revision");need(r._time>=rows[i-1]._time,"Revision timestamps invert their declared order");}}
 }
 const production=unique(tables.production,r=>pair(r.slot_id,r.product_id),"production snapshot"),productionIds=new Set();
 for(const r of production.values()){
  identity(r.observation_id,"production observation");need(!productionIds.has(r.observation_id),"Duplicate production observation ID");productionIds.add(r.observation_id);need(sp.has(pair(r.slot_id,r.product_id)),"Unknown production slot/product");
  r._quantity=qty(r.product_id,r.quantity,r.unit,"production");stamp(r.observed_at,"production observed_at");need(["partial","complete"].includes(r.coverage),"Production coverage must be partial or complete");
 }
 const picks=unique(tables.picking,r=>lineKey(r.slot_id,r.order_id,r.line_id),"pick snapshot"),pickIds=new Set();
 for(const [k,r] of picks){
  identity(r.observation_id,"pick observation");need(!pickIds.has(r.observation_id),"Duplicate pick observation ID");pickIds.add(r.observation_id);need(groups.has(k),"Pick refers to unknown line");r._quantity=qty(groups.get(k)[0].product_id,r.quantity,r.unit,"picking");stamp(r.observed_at,"pick observed_at");need(["picked","dispatched"].includes(r.state),"Pick state must be picked or dispatched");
 }
 return {e,tables,slots,products,buyers,units,sp,revs,groups,production,picks};
}
const reviewKey=r=>canonical([r.editionId,r.subjectType,r.subjectId]);
function validateReview(r,b,latest,ids){
 need(plain(r),"Invalid review");identity(r.id,"review ID");need(!ids.has(r.id),"Review ID is already used");need(r.editionId===b.e.id&&r.sourceHash===b.e.sourceHash,"Review source binding differs");
 need(["line","product","pick"].includes(r.subjectType),"Invalid review subject type");text(r.subjectId,"review subject",2000);
 const exists=r.subjectType==="product"?b.sp.has(r.subjectId):r.subjectType==="pick"?b.picks.has(r.subjectId):b.groups.has(r.subjectId);need(exists,"Review subject is absent");
 need(["investigate","accept_expected","retain_cutoff","accept_late"].includes(r.disposition),"Invalid review disposition");
 if(["retain_cutoff","accept_late"].includes(r.disposition))need(r.subjectType==="line","Selection decisions require a line subject");
 if(r.disposition==="accept_late"){const source=b.revs.get(r.selectedRevisionId);need(source&&source._key===r.subjectId&&!source._eligible,"Select a retained late revision on this exact line");}else need(r.selectedRevisionId===null,"Only accept_late has selectedRevisionId");
 text(r.reviewer,"reviewer",500);text(r.reason,"review reason",20000);text(r.evidence,"review evidence",100000,true);
 const prior=latest.get(reviewKey(r));need(r.previousReviewId===(prior?prior.id:null),"Review must reference the latest review on this exact source/subject");
 const body={...r};delete body.recordHash;need(r.recordHash===hash(body),"Review identity differs");
 ids.add(r.id);latest.set(reviewKey(r),r);
}
function validate(w){
 need(plain(w)&&w.schema===SCHEMA,"Wrong delivery-slot workspace schema");identity(w.id,"workspace ID");text(w.label,"workspace label",500);
 need(Array.isArray(w.editions)&&Array.isArray(w.reviews),"Workspace history arrays required");need(w.editions.length<=1000&&w.reviews.length<=100000,"Workspace history limit exceeded");
 const bases=new Map();for(const e of w.editions){need(plain(e),"Invalid edition");identity(e.id,"edition ID");need(!bases.has(e.id),"Duplicate edition ID");text(e.label,"edition label",500);stamp(e.receivedAt,"receivedAt");text(e.notes,"edition notes",100000,true);
 const sources=retainedSources(e.sources);need(canonical(sources)===canonical(e.sources),"Original source identity differs");need(e.sourceHash===hash(editionBody(e)),"Edition source hash differs");bases.set(e.id,base(e));}
 const latest=new Map(),ids=new Set();for(const r of w.reviews){need(plain(r)&&bases.has(r.editionId),"Review refers to missing edition");validateReview(r,bases.get(r.editionId),latest,ids);}
 return bases;
}
function create(input){identity(input.id,"workspace ID");text(input.label,"workspace label",500);return {schema:SCHEMA,id:input.id,label:input.label,editions:[],reviews:[]};}
function reopen(workspace){validate(workspace);return clone(workspace);}
function receive(workspace,input){
 const w=reopen(workspace);need(plain(input),"Edition input required");identity(input.id,"edition ID");need(!w.editions.some(e=>e.id===input.id),"Edition ID already exists");text(input.label,"edition label",500);stamp(input.receivedAt,"receivedAt");text(input.notes||"","edition notes",100000,true);
 const e={id:input.id,label:input.label,receivedAt:input.receivedAt,notes:input.notes||"",sources:retainedSources(input.sources)};e.sourceHash=hash(editionBody(e));base(e);w.editions.push(e);return w;
}
function review(workspace,input){
 const bases=validate(workspace),w=clone(workspace);need(plain(input)&&bases.has(input.editionId),"Review edition missing");
 const r={id:input.id,editionId:input.editionId,sourceHash:bases.get(input.editionId).e.sourceHash,subjectType:input.subjectType,subjectId:input.subjectId,disposition:input.disposition,selectedRevisionId:input.selectedRevisionId??null,reviewer:input.reviewer,reason:input.reason,evidence:input.evidence||"",previousReviewId:input.previousReviewId??null};r.recordHash=hash(r);
 const latest=new Map();for(const old of w.reviews)latest.set(reviewKey(old),old);validateReview(r,bases.get(input.editionId),latest,new Set(w.reviews.map(x=>x.id)));w.reviews.push(r);return w;
}
function result(w,b){
 const latest=new Map(),selections=new Map();for(const r of w.reviews)if(r.editionId===b.e.id){latest.set(reviewKey(r),r);if(["retain_cutoff","accept_late"].includes(r.disposition))selections.set(r.subjectId,r);}
 const getReview=(type,id)=>latest.get(canonical([b.e.id,type,id]))||null;
 const lines=[],revisions=[],products=[],attention=[];
 const add=(code,type,id,reference,detail)=>attention.push({id:hash([b.e.sourceHash,code,type,id]),code,subjectType:type,subjectId:id,reference,detail,review:getReview(type,id)});
 const totals=new Map([...b.sp.keys()].map(k=>[k,{baseline:0n,selected:0n,picked:0n,dispatched:0n,observed:0,count:0,required:0,observedRequired:0}]));
 for(const [key,rows] of b.groups){
  const first=rows[0],p=b.sp.get(pair(first.slot_id,first.product_id)),item=b.products.get(first.product_id),eligible=rows.filter(r=>r._eligible),baseline=eligible.at(-1)||null,decision=selections.get(key)||null;
  const selected=decision&&decision.disposition==="accept_late"?b.revs.get(decision.selectedRevisionId):baseline;
  const B=baseline?baseline._quantity:0n,Q=selected?selected._quantity:0n,pick=b.picks.get(key),t=totals.get(pair(first.slot_id,first.product_id));t.baseline+=B;t.selected+=Q;t.count++;if(Q>0n)t.required++;if(pick){if(Q>0n)t.observedRequired++;t.picked+=pick._quantity;t.observed++;if(pick.state==="dispatched")t.dispatched+=pick._quantity;}
  const late=rows.filter(r=>!r._eligible).map(r=>r.revision_id);
  const out={key,slotId:first.slot_id,orderId:first.order_id,lineId:first.line_id,buyerId:first.buyer_id,buyerName:b.buyers.get(first.buyer_id).name,productId:first.product_id,productName:item.name,baseUnit:item.base_unit,cutoffAt:p._cutoffAt,cutoffBoundary:p._boundary,baselineRevisionId:baseline?.revision_id||null,baselineState:baseline?.status||"absent",baselineQuantity:show(B),selectedRevisionId:selected?.revision_id||null,selectedState:selected?.status||"absent",selectedQuantity:show(Q),selectionBasis:decision?.disposition==="accept_late"?"operator_late":"cutoff",lateRevisionIds:late,pickObservationId:pick?.observation_id||null,pickQuantity:pick?show(pick._quantity):null,pickState:pick?.state||null,pickDifference:pick?show(pick._quantity-Q):null,pickObservedAt:pick?.observed_at||null,reference:selected?.reference||baseline?.reference||first.reference,review:getReview("line",key),selectionDecision:decision,pickReview:getReview("pick",key)};
  lines.push(out);
  if(late.length)add("late_revisions","line",key,out.reference,late.length+" retained post-cutoff revision(s); cutoff baseline remains "+show(B)+" "+item.base_unit+".");
  if(Q>0n&&!pick)add("pick_missing","line",key,out.reference,"No current pick snapshot; expected "+show(Q)+" "+item.base_unit+".");
  if(pick&&pick._quantity!==Q)add("pick_difference","pick",key,pick.reference,"Observed "+show(pick._quantity)+" versus reviewed requirement "+show(Q)+" "+item.base_unit+"; difference "+show(pick._quantity-Q)+".");
  for(const r of rows)revisions.push({revisionId:r.revision_id,lineKey:key,revision:r._revision,submittedAt:r.submitted_at,status:r.status,quantity:r.quantity,unit:r.unit,baseQuantity:show(r._quantity),eligibility:r._eligible?"eligible":"late",selectedAtCutoff:r===baseline,selectedForReview:r===selected,reference:r.reference,sourceLine:r._line,sourceEndLine:r._endLine});
 }
 for(const [key,p] of b.sp){
  const t=totals.get(key),item=b.products.get(p.product_id),prod=b.production.get(key),cap=p._capacity,allPicked=t.observedRequired===t.required;
  const out={key,slotId:p.slot_id,productId:p.product_id,name:item.name,baseUnit:item.base_unit,cutoffAt:p._cutoffAt,cutoffBoundary:p._boundary,fulfilmentAt:b.slots.get(p.slot_id).fulfilment_at,baselineDemand:show(t.baseline),reviewedDemand:show(t.selected),capacityQuantity:cap===null?null:show(cap),capacityExcess:cap===null?null:show(t.selected>cap?t.selected-cap:0n),productionObservationId:prod?.observation_id||null,producedQuantity:prod?show(prod._quantity):null,productionCoverage:prod?.coverage||null,productionDifference:prod?show(prod._quantity-t.selected):null,productionObservedAt:prod?.observed_at||null,pickedQuantity:t.observed||t.required===0?show(t.picked):null,dispatchedQuantity:t.observed||t.required===0?show(t.dispatched):null,pickDifference:allPicked?show(t.picked-t.selected):null,pickCoverage:allPicked?"complete":t.observed?"partial":"missing",observedPickLines:t.observed,totalLines:t.count,requiredPickLines:t.required,observedRequiredPickLines:t.observedRequired,reference:p.reference,review:getReview("product",key)};
  products.push(out);
  if(cap===null)add("capacity_unknown","product",key,p.reference,"Capacity is undeclared; no zero capacity was inferred.");
  else if(t.selected>cap)add("capacity_exceeded","product",key,p.reference,"Reviewed requirement exceeds capacity by "+show(t.selected-cap)+" "+item.base_unit+".");
  if(!prod&&t.selected>0n)add("production_missing","product",key,p.reference,"No current production snapshot.");
  if(prod&&prod.coverage==="partial")add("production_partial","product",key,prod.reference,"Production count is explicitly partial; its difference is a current count comparison, not final completion.");
  if(prod&&prod._quantity!==t.selected)add("production_difference","product",key,prod.reference,"Production "+show(prod._quantity)+" versus requirement "+show(t.selected)+" "+item.base_unit+"; difference "+show(prod._quantity-t.selected)+".");
 }
 return {editionId:b.e.id,sourceHash:b.e.sourceHash,lines,revisions,products,attention,summary:{slots:b.slots.size,buyers:b.buyers.size,products:products.length,lines:lines.length,revisions:revisions.length,lateRevisions:revisions.filter(r=>r.eligibility==="late").length,explicitLateSelections:lines.filter(r=>r.selectionBasis==="operator_late").length,attention:attention.length,reviewRecords:w.reviews.filter(r=>r.editionId===b.e.id).length}};
}
function analyse(workspace,editionId){const bases=validate(workspace);need(bases.has(editionId),"Edition not found");return result(workspace,bases.get(editionId));}
function csvFromAnalysis(r,kind){need(["lines","revisions","products","attention"].includes(kind),"CSV kind must be lines, revisions, products or attention");const rows=r[kind];return csvTable(rows.length?Object.keys(rows[0]):({lines:["key","slotId","orderId","lineId"],revisions:["revisionId","lineKey"],products:["key","slotId","productId"],attention:["id","code","subjectType","subjectId"]}[kind]),rows);}

function csv(workspace,editionId,kind){return csvFromAnalysis(analyse(workspace,editionId),kind);}

function report(workspace,editionId){
 const r=analyse(workspace,editionId),e=workspace.editions.find(x=>x.id===editionId),esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const table=(rows,keys)=>"<table><thead><tr>"+keys.map(k=>"<th>"+esc(k)+"</th>").join("")+"</tr></thead><tbody>"+rows.map(row=>"<tr>"+keys.map(k=>"<td>"+esc(row[k]===null?"Unknown":typeof row[k]==="object"?JSON.stringify(row[k]):row[k])+"</td>").join("")+"</tr>").join("")+"</tbody></table>";
 const histories=workspace.reviews.filter(x=>x.editionId===editionId);
 const data={workspace,analysis:r,downloads:[{name:"complete-workspace.json",text:JSON.stringify(workspace,null,2)},...Object.entries(e.sources).map(([k,s])=>({name:k+".csv",text:s.text})),...["lines","revisions","products","attention"].map(k=>({name:k+"-comparison.csv",text:csvFromAnalysis(r,k)}))]};
 const script="const DATA="+JSON.stringify(data).replace(/</g,"\\u003c")+";document.querySelectorAll('[data-download]').forEach(b=>b.onclick=()=>{const f=DATA.downloads[Number(b.dataset.download)],a=document.createElement('a');a.href=URL.createObjectURL(new Blob([f.text],{type:'text/plain;charset=utf-8'}));a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});";
 return "<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+esc(workspace.label)+" — delivery slot study</title><style>body{font:15px system-ui;color:#222;background:#fff;margin:24px;line-height:1.5}main{max-width:1500px;margin:auto}h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}section{overflow-x:auto;margin:28px 0}button{padding:8px;margin:4px;border:1px solid #777;background:#f7f7f7;color:#222}code{overflow-wrap:anywhere}@media print{button{display:none}body{margin:8mm}table{font-size:9px}thead{display:table-header-group}}</style><main><h1>"+esc(workspace.label)+"</h1><p>Edition "+esc(e.label)+" · received "+esc(e.receivedAt)+"</p><p>"+esc(e.notes)+"</p><p>Original cutoff demand and explicitly reviewed demand remain separate. A review documents a choice; production and dispatch require their own supplied observations. Unknown values are displayed as Unknown. Quantities stay within each product and base unit.</p><p>Source identity <code>"+esc(e.sourceHash)+"</code></p><section><h2>Product requirement and counts</h2>"+table(r.products,["slotId","productId","name","baseUnit","cutoffAt","cutoffBoundary","fulfilmentAt","baselineDemand","reviewedDemand","capacityQuantity","capacityExcess","producedQuantity","productionCoverage","productionDifference","pickedQuantity","pickCoverage","pickDifference","dispatchedQuantity","reference"])+"</section><section><h2>Buyer lines and selected source revisions</h2>"+table(r.lines,["slotId","orderId","lineId","buyerId","productId","baselineRevisionId","baselineState","baselineQuantity","selectedRevisionId","selectedState","selectedQuantity","selectionBasis","baseUnit","pickObservationId","pickQuantity","pickState","pickDifference","reference"])+"</section><section><h2>Attention</h2>"+table(r.attention,["code","subjectType","subjectId","reference","detail","review"])+"</section><section><h2>Complete revision history</h2>"+table(r.revisions,["revisionId","lineKey","revision","submittedAt","status","quantity","unit","baseQuantity","eligibility","selectedAtCutoff","selectedForReview","sourceLine","sourceEndLine","reference"])+"</section><section><h2>Source-bound review history</h2>"+table(histories,["id","subjectType","subjectId","disposition","selectedRevisionId","reviewer","reason","evidence","previousReviewId","sourceHash"])+"</section><section><h2>Complete original sources and continuation</h2>"+Object.entries(e.sources).map(([k,s])=>"<p>"+esc(k)+" · "+esc(s.name)+" · "+s.bytes+" bytes · <code>"+s.sha256+"</code></p>").join("")+data.downloads.map((f,i)=>"<button data-download='"+i+"'>Download "+esc(f.name)+"</button>").join("")+"</section></main><script>"+script+"</script></html>";
}
const sampleSources={"slots":{"name":"slots.csv","text":"slot_id,name,cutoff_at,cutoff_boundary,fulfilment_at,reference\r\nS24,Saturday trade,2026-10-22T08:00:00+01:00,before,2026-10-24T08:00:00+01:00,Authored cutoff example\r\n"},"products":{"name":"products.csv","text":"product_id,name,base_unit,quantity_kind\r\nWHITE,White loaf,loaf,whole\r\nCROISSANT,Croissant,piece,whole\r\n"},"unit_packs":{"name":"unit_packs.csv","text":"product_id,unit,base_quantity,quantity_step\r\nWHITE,loaf,1,1\r\nCROISSANT,piece,1,1\r\nCROISSANT,dozen,12,1\r\n"},"buyers":{"name":"buyers.csv","text":"buyer_id,name\r\nA,Buyer A\r\nB,Buyer B\r\nC,Buyer C\r\n"},"slot_products":{"name":"slot_products.csv","text":"slot_id,product_id,cutoff_at,cutoff_boundary,capacity_quantity,capacity_unit,reference\r\nS24,WHITE,,,15,loaf,Authored declared capacity\r\nS24,CROISSANT,,,20,piece,Authored declared capacity\r\n"},"order_revisions":{"name":"order_revisions.csv","text":"revision_id,slot_id,order_id,line_id,revision,buyer_id,product_id,status,quantity,unit,submitted_at,reference\r\nA1,S24,ORDER-A,L1,1,A,WHITE,confirmed,10,loaf,2026-10-22T07:00:00+01:00,Authored first request\r\nA2,S24,ORDER-A,L1,2,A,WHITE,confirmed,12,loaf,2026-10-22T07:30:00+01:00,Authored replacement\r\nA3,S24,ORDER-A,L1,3,A,WHITE,confirmed,20,loaf,2026-10-22T08:05:00+01:00,Authored late replacement\r\nB1,S24,ORDER-B,L1,1,B,CROISSANT,confirmed,2,dozen,2026-10-22T07:15:00+01:00,Authored pack quantity\r\nC1,S24,ORDER-C,L1,1,C,WHITE,confirmed,6,loaf,2026-10-22T07:00:00+01:00,Authored request\r\nC2,S24,ORDER-C,L1,2,C,WHITE,cancelled,0,loaf,2026-10-22T07:45:00+01:00,Authored cancellation\r\n"},"production":{"name":"production.csv","text":"observation_id,slot_id,product_id,quantity,unit,observed_at,coverage,reference\r\nPROD-W,S24,WHITE,12,loaf,2026-10-24T05:30:00+01:00,complete,Authored independent count\r\nPROD-C,S24,CROISSANT,22,piece,2026-10-24T05:30:00+01:00,complete,Authored independent count\r\n"},"picking":{"name":"picking.csv","text":"observation_id,slot_id,order_id,line_id,quantity,unit,observed_at,state,reference\r\nPICK-A,S24,ORDER-A,L1,12,loaf,2026-10-24T06:00:00+01:00,picked,Authored independent pick\r\nPICK-B,S24,ORDER-B,L1,22,piece,2026-10-24T06:00:00+01:00,picked,Authored independent pick\r\n"}};
return {SCHEMA,columns:clone(columns),sampleSources:clone(sampleSources),create,reopen,receive,analyse,review,report,csv,hash,canonical,parseCSV:parse};
}

export {createDeliverySlotCore};
