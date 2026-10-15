function createRoasteryCore(){
"use strict";
const U=1000000n,P=100000000n;
const columns={lots:["lot_id","coffee","green_g"],profiles:["profile_id","roast_loss_pct","min_green_g","max_green_g"],products:["sku","name","bag_g","pack_loss_pct"],recipes:["sku","lot_id","profile_id","share_pct"],orders:["line_id","order_id","sku","units","due_date"],roasted:["stock_id","lot_id","profile_id","roasted_g"],packaged:["sku","units"]};
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function dec(s,label="value"){s=String(s??"").trim();if(!/^\d+(?:\.\d{1,6})?$/.test(s))throw Error(label+" must be a non-negative decimal with at most six places");const [a,b=""]=s.split(".");const n=BigInt(a)*U+BigInt(b.padEnd(6,"0"));if(n>1000000000000000000n)throw Error(label+" is too large");return n}
function fmt(n){n=BigInt(n);const sign=n<0n?"-":"";n=n<0n?-n:n;return sign+(n/U).toString()+((n%U)?"."+(n%U).toString().padStart(6,"0").replace(/0+$/,""):"")}
const ceil=(n,d)=>(n+d-1n)/d;
function integer(s,label){if(!/^\d+$/.test(String(s))||!Number.isSafeInteger(Number(s))||Number(s)>100000000)throw Error(label+" must be an integer from 0 to 100000000");return Number(s)}
function parseCSV(text){
 text=String(text).replace(/^\uFEFF/,"");const rows=[];let row=[],v="",quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){v+='"';i++}else{quoted=false;closed=true}}else v+=c;continue}
 if(c==='"'){if(v||closed)throw Error("Unexpected quote at character "+i);quoted=true;continue}
 if(c===","||c==="\n"||c==="\r"){row.push(v);v="";closed=false;if(c!==","){if(c==="\r"&&text[i+1]==="\n")i++;if(row.some(x=>x!==""))rows.push(row);row=[]}continue}
 if(closed&&!/\s/.test(c))throw Error("Unexpected text after closing quote");if(!closed)v+=c;
 }
 if(quoted)throw Error("Unclosed CSV quote");if(v!==""||row.length||closed){row.push(v);if(row.some(x=>x!==""))rows.push(row)}
 if(!rows.length)throw Error("CSV is empty");const head=rows.shift().map(s=>s.trim());if(new Set(head).size!==head.length)throw Error("Duplicate CSV column");
 return {headers:head,rows:rows.map((r,i)=>{if(r.length!==head.length)throw Error("CSV row "+(i+2)+" has "+r.length+" fields; expected "+head.length);return Object.fromEntries(head.map((h,j)=>[h,r[j].trim()]))})}
}
function csv(rows,headers){return [headers,...rows.map(r=>headers.map(k=>r[k]??""))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n")+"\r\n"}
function empty(){return {schema:"tjlabs.roastery-workspace.v1",caseName:"New roastery",tables:Object.fromEntries(Object.keys(columns).map(k=>[k,[]])),captures:[],bindings:{},frozenPlans:[],outcomes:[],notes:"",session:{selectedPlan:"",outcomeDraft:{},table:"orders"}}}
function reopen(value){
 const w=clone(value),own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const object=(v,label)=>{if(!v||typeof v!=="object"||Array.isArray(v))throw Error(label+" must be an object");return v};
 const text=(v,label,nonempty=false)=>{if(typeof v!=="string"||(nonempty&&!v.trim()))throw Error(label+" must be "+(nonempty?"a nonempty ":"a ")+"string");return v};
 const strings=(v,label)=>{if(!Array.isArray(v)||v.some(x=>typeof x!=="string"))throw Error(label+" must be a string array");return v};
 const rows=(v,label)=>{if(!Array.isArray(v))throw Error(label+" must be an array");for(const r of v)object(r,label+" row");return v};
 const optionalText=(o,keys,label)=>{for(const k of keys)if(own(o,k)&&o[k]!==undefined)text(o[k],label+"."+k)};
 const dictionary=(v,label)=>Object.assign(Object.create(null),object(v===undefined?{}:v,label));
 const tables=(v,label)=>{object(v,label);for(const k of Object.keys(columns)){rows(v[k],label+"."+k);for(const r of v[k])for(const key of columns[k])if(own(r,key)&&!["string","number"].includes(typeof r[key]))throw Error(label+"."+k+"."+key+" must be a scalar");}return v};
 const unique=(values,key,label)=>{const m=new Map;for(const v of values){const id=text(v[key],label+"."+key,true);if(m.has(id))throw Error("Duplicate "+label+" "+id);m.set(id,v)}return m};
 object(w,"Workspace");if(w.schema!=="tjlabs.roastery-workspace.v1")throw Error("Unknown workspace schema");
 w.caseName=String(w.caseName??"New roastery");w.notes=String(w.notes??"");tables(w.tables,"tables");
 rows(w.captures,"captures");rows(w.frozenPlans,"frozenPlans");rows(w.outcomes,"outcomes");
 const captures=unique(w.captures,"id","capture"),plans=unique(w.frozenPlans,"id","frozen plan");
 for(const [i,c]of w.captures.entries()){
  if(c.id!=="capture-"+(i+1))throw Error("Unexpected capture sequence");
  if(!own(columns,c.table))throw Error("Unknown capture table");optionalText(c,["filename","text","capturedAt"],"capture");
  for(const k of ["filename","text","capturedAt"])text(c[k],"capture."+k);
 }
 const bindings=(v,label)=>{v=dictionary(v,label);for(const [table,id]of Object.entries(v)){if(!own(columns,table)||typeof id!=="string"||!captures.has(id)||captures.get(id).table!==table)throw Error("Invalid "+label+" source binding");}return v};
 w.bindings=bindings(w.bindings,"bindings");
 for(const [i,p]of w.frozenPlans.entries()){
  if(p.id!=="plan-"+(i+1))throw Error("Unexpected frozen plan sequence");
  text(p.reviewer,"plan.reviewer",true);for(const k of ["note","createdAt","inputIdentity"])text(p[k],"plan."+k);
  tables(p.tables,"plan.tables");p.bindings=bindings(p.bindings,"plan.bindings");
  if(p.inputIdentity!==JSON.stringify({tables:p.tables,bindings:p.bindings}))throw Error("Frozen input identity differs");
  object(p.result,"plan.result");
  for(const k of ["issues","orders","components","batches","lots","roastedStock","packagedStock"])rows(p.result[k],"plan.result."+k);
  strings(p.result.warnings,"plan.result.warnings");object(p.result.totals,"plan.result.totals");
  const batches=unique(p.result.batches,"batch_id","batch"),lots=unique(p.tables.lots,"lot_id","frozen lot"),profiles=unique(p.tables.profiles,"profile_id","frozen profile");
  for(const l of p.tables.lots)dec(l.green_g,"Frozen green grams");
  for(const b of batches.values()){
   if(!lots.has(b.lot_id)||!profiles.has(b.profile_id))throw Error("Frozen batch refers to an unknown lot/profile");
   for(const k of ["green_g","planned_roasted_g","planned_loss_g","unallocated_roasted_g"])dec(b[k],"Frozen batch "+k);
   if(dec(b.green_g)===0n||dec(b.planned_roasted_g)>dec(b.green_g))throw Error("Invalid frozen batch weight");
   rows(b.allocations,"batch.allocations");for(const a of b.allocations){for(const k of ["line_id","order_id","sku","due_date"])text(a[k],"allocation."+k);dec(a.roasted_g,"Allocated roasted grams");}
  }
 }
 const outcomesById=unique(w.outcomes,"id","outcome"),latest=new Map;
 for(const [i,o]of w.outcomes.entries()){
  if(o.id!=="outcome-"+(i+1))throw Error("Unexpected outcome sequence");
  const p=plans.get(o.planId);if(!p||!p.result.batches.some(b=>b.batch_id===o.batchId))throw Error("Outcome refers to an unknown plan/batch");
  const g=dec(o.green_g,"Actual green grams"),r=dec(o.roasted_g,"Actual roasted grams");if(g===0n||r>g)throw Error("Invalid outcome weight");
  text(o.reference,"outcome.reference",true);text(o.note,"outcome.note");text(o.recordedAt,"outcome.recordedAt");
  const key=JSON.stringify([o.planId,o.batchId]),prior=latest.get(key)||null;
  if(o.supersedes!==prior)throw Error("Outcome correction does not retain the preceding record");latest.set(key,o.id);
 }
 w.session=dictionary(w.session,"session");
 if(typeof w.session.table!=="string"||!own(columns,w.session.table))w.session.table="orders";
 for(const k of ["reviewer","reviewNote","selectedPlan","selectedBatch"])if(w.session[k]===undefined)w.session[k]="";else text(w.session[k],"session."+k);
 for(const k of ["tableDrafts","sourceNames"]){w.session[k]=dictionary(w.session[k],"session."+k);for(const [table,v]of Object.entries(w.session[k])){if(!own(columns,table))throw Error("Unknown table in "+k);text(v,k+"."+table);}}
 w.session.outcomeDraft=dictionary(w.session.outcomeDraft,"session.outcomeDraft");for(const v of Object.values(w.session.outcomeDraft))text(v,"Legacy outcome draft");
 w.session.outcomeDrafts=dictionary(w.session.outcomeDrafts,"session.outcomeDrafts");
 for(const [key,draft]of Object.entries(w.session.outcomeDrafts)){
  let pair;try{pair=JSON.parse(key)}catch{throw Error("Invalid outcome draft identity")}
  if(!Array.isArray(pair)||pair.length!==2||pair.some(v=>typeof v!=="string")||JSON.stringify(pair)!==key)throw Error("Invalid outcome draft identity");
  const [planId,batchId]=pair,p=plans.get(planId);
  if((planId&&!p)||(batchId&&(!p||!p.result.batches.some(b=>b.batch_id===batchId))))throw Error("Outcome draft refers to an unknown plan/batch");
  object(draft,"Outcome draft");for(const v of Object.values(draft))text(v,"Outcome draft field");
 }
 const selected=plans.get(w.session.selectedPlan);
 if(!selected){w.session.selectedPlan="";w.session.selectedBatch=""}else if(!selected.result.batches.some(b=>b.batch_id===w.session.selectedBatch))w.session.selectedBatch="";
 if(w.prospectProgramme!==undefined){
  const pg=object(w.prospectProgramme,"prospectProgramme");rows(pg.profiles,"prospectProgramme.profiles");unique(pg.profiles,"id","prospect");
  optionalText(pg,["schema","operation","operation_id","preparedOn"],"programme");
  if(pg.commercial!==undefined)object(pg.commercial,"programme.commercial");
  for(const p of pg.profiles){
   for(const k of ["company","location","cohort"])text(p[k],"prospect."+k);
   optionalText(p,["website"],"prospect");
   if(p.contact!==undefined){object(p.contact,"contact");for(const k of ["name","role","email","phone","route","url"])if(p.contact[k]!==undefined&&p.contact[k]!==null)text(p.contact[k],"contact."+k);}
   for(const k of ["fit","currentTools","proposedPilot","opening"])if(p[k]!==undefined)object(p[k],"prospect."+k);
   if(p.fit)optionalText(p.fit,["priority","reason","buyingSignal"],"fit");
   if(p.currentTools)optionalText(p.currentTools,["observed","retain"],"currentTools");
   if(p.proposedPilot){optionalText(p.proposedPilot,["scope","acceptance","commercialAngle"],"pilot");if(p.proposedPilot.steps!==undefined)strings(p.proposedPilot.steps,"pilot.steps");}
   if(p.opening)optionalText(p.opening,["subject","body"],"opening");
   for(const k of ["qualification","sourceNotes"])if(p[k]!==undefined)strings(p[k],"prospect."+k);
   if(p.observations!==undefined){if(!Array.isArray(p.observations))throw Error("observations must be an array");for(const o of p.observations)if(typeof o!=="string"){object(o,"observation");text(o.text,"observation.text");if(o.source!==undefined)text(o.source,"observation.source");}}
   if(p.sources!==undefined){rows(p.sources,"prospect.sources");for(const s of p.sources){text(s.url,"source.url",true);optionalText(s,["id","observedOn","supports","webRef","retrievalContext"],"source");}}
  }
 }
 w.prospectWorking=dictionary(w.prospectWorking,"prospectWorking");
 for(const state of Object.values(w.prospectWorking)){object(state,"Prospect working record");optionalText(state,["status","scope","reviewDate","notes"],"prospectWorking");}
 return w;
}
function receive(w,table,text,filename,at){w=reopen(w);if(!columns[table])throw Error("Unknown table");const p=parseCSV(text);const missing=columns[table].filter(k=>!p.headers.includes(k));if(missing.length)throw Error("Missing columns: "+missing.join(", "));const id="capture-"+(w.captures.length+1);w.captures.push({id,table,filename:String(filename||table+".csv"),text:String(text),capturedAt:String(at||"")});w.tables[table]=p.rows;w.bindings[table]=id;return w}
function inputs(w){return JSON.stringify({tables:w.tables,bindings:w.bindings})}
function analyse(w){
 w=reopen(w);const issues=[],warnings=[],t=w.tables,maps={},N={};
 const issue=(table,id,message)=>issues.push({table,id:String(id||""),message});
 const req=(v,label)=>{if(!String(v??"").trim())throw Error(label+" is required");return String(v)};
 const unique=(table,key)=>{const m=new Map;for(const r of t[table]){const id=String(r[key]??"");if(!id)issue(table,id,key+" is required");else if(m.has(id))issue(table,id,"Duplicate "+key);else m.set(id,r)}return m};
 for(const [table,key] of [["lots","lot_id"],["profiles","profile_id"],["products","sku"],["orders","line_id"],["roasted","stock_id"],["packaged","sku"]])maps[table]=unique(table,key);
 if(!t.orders.length)warnings.push("No order lines loaded.");
 for(const table of Object.keys(columns)){N[table]=[];for(const r of t[table]){const id=r[columns[table][0]];try{
  for(const k of columns[table])if(!(k in r))throw Error("Missing column "+k);
  let n={...r};
  if(table==="lots"){req(r.coffee,"Coffee");n.green=dec(r.green_g,"Green grams")}
  if(table==="profiles"){n.loss=dec(r.roast_loss_pct,"Roast loss");n.min=dec(r.min_green_g,"Minimum charge");n.max=dec(r.max_green_g,"Maximum charge");if(n.loss>=P)throw Error("Roast loss must be below 100%");if(n.max===0n||n.min>n.max)throw Error("Charge range must have 0 ≤ minimum ≤ positive maximum");if(n.max*(P-n.loss)/P===0n)throw Error("Maximum charge produces no planned output")}
  if(table==="products"){req(r.name,"Product name");n.bag=dec(r.bag_g,"Bag grams");n.packLoss=dec(r.pack_loss_pct,"Packing loss");if(n.bag===0n||n.packLoss>=P)throw Error("Bag mass must be positive and packing loss below 100%")}
  if(table==="recipes"){if(!maps.products.has(r.sku)||!maps.lots.has(r.lot_id)||!maps.profiles.has(r.profile_id))throw Error("Unknown product, lot or profile");n.share=dec(r.share_pct,"Roasted share");if(n.share===0n||n.share>P)throw Error("Share must be above 0 and at most 100%")}
  if(table==="orders"){req(r.order_id,"Order ID");if(!maps.products.has(r.sku))throw Error("Unknown product");n.count=integer(r.units,"Order units");if(n.count===0)throw Error("Order units must be positive");if(!/^\d{4}-\d{2}-\d{2}$/.test(r.due_date)||Number.isNaN(Date.parse(r.due_date+"T00:00:00Z"))||new Date(r.due_date+"T00:00:00Z").toISOString().slice(0,10)!==r.due_date)throw Error("Due date must be a valid YYYY-MM-DD date")}
  if(table==="roasted"){if(!maps.lots.has(r.lot_id)||!maps.profiles.has(r.profile_id))throw Error("Unknown lot or profile");n.mass=dec(r.roasted_g,"Roasted grams")}
  if(table==="packaged"){if(!maps.products.has(r.sku))throw Error("Unknown product");n.count=integer(r.units,"Packaged units")}
  N[table].push(n);
 }catch(e){issue(table,id,e.message)}}}
 const recipeKeys=new Set;for(const r of N.recipes){const k=JSON.stringify([r.sku,r.lot_id,r.profile_id]);if(recipeKeys.has(k))issue("recipes",r.sku,"Duplicate lot/profile component");recipeKeys.add(k)}
 for(const product of N.products){const components=N.recipes.filter(r=>r.sku===product.sku);if(!components.length||components.reduce((s,c)=>s+c.share,0n)!==P)issue("recipes",product.sku,"Roasted component shares must total exactly 100%")}
 if(issues.length)return {issues,warnings,orders:[],components:[],batches:[],lots:[],roastedStock:[],packagedStock:[],totals:{orders:t.orders.length,batches:0}};
 const by=(arr,key)=>new Map(arr.map(r=>[r[key],r]));const lots=by(N.lots,"lot_id"),profiles=by(N.profiles,"profile_id"),products=by(N.products,"sku");
 const packaged=new Map(N.packaged.map(r=>[r.sku,r.count])),packagedUsed=new Map,stockGroups=new Map,groupKey=(lot,profile)=>JSON.stringify([lot,profile]);
 for(const r of N.roasted){const k=groupKey(r.lot_id,r.profile_id);stockGroups.set(k,(stockGroups.get(k)||0n)+r.mass)}
 const stockAvailable=new Map(stockGroups),stockUsed=new Map,components=[],orders=[],groups=new Map;
 const ordered=N.orders.slice().sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.order_id.localeCompare(b.order_id)||a.line_id.localeCompare(b.line_id));
 for(const order of ordered){const product=products.get(order.sku),ready=Math.min(packaged.get(order.sku)||0,order.count),make=order.count-ready;packaged.set(order.sku,(packaged.get(order.sku)||0)-ready);packagedUsed.set(order.sku,(packagedUsed.get(order.sku)||0)+ready);
  const packed=BigInt(make)*product.bag,required=ceil(packed*P,P-product.packLoss),recipe=N.recipes.filter(r=>r.sku===order.sku);
  const parts=recipe.map((r,i)=>({r,i,m:required*r.share/P,remainder:required*r.share%P}));let left=required-parts.reduce((s,x)=>s+x.m,0n);for(const a of parts.slice().sort((a,b)=>a.remainder===b.remainder?a.i-b.i:(a.remainder>b.remainder?-1:1))){if(left===0n)break;a.m++;left--}
  orders.push({line_id:order.line_id,order_id:order.order_id,sku:order.sku,due_date:order.due_date,ordered_units:order.count,from_packaged_units:ready,make_units:make,packed_g:fmt(packed),roasted_input_g:fmt(required),packing_allowance_g:fmt(required-packed)});
  for(const part of parts){const r=part.r,k=groupKey(r.lot_id,r.profile_id),available=stockAvailable.get(k)||0n,used=available<part.m?available:part.m,need=part.m-used;stockAvailable.set(k,available-used);stockUsed.set(k,(stockUsed.get(k)||0n)+used);
   const row={line_id:order.line_id,order_id:order.order_id,sku:order.sku,due_date:order.due_date,lot_id:r.lot_id,profile_id:r.profile_id,share_pct:r.share_pct,required_roasted_g:fmt(part.m),from_roasted_stock_g:fmt(used),new_roast_needed_g:fmt(need)};components.push(row);
   if(!groups.has(k))groups.set(k,{lot:r.lot_id,profile:r.profile_id,need:0n,allocations:[]});const g=groups.get(k);g.need+=need;if(need)g.allocations.push({line_id:order.line_id,order_id:order.order_id,sku:order.sku,due_date:order.due_date,left:need});
  }
 }
 const batches=[],lotUse=new Map,groupSurplus=new Map;
 for(const [k,g] of groups){if(g.need===0n)continue;const p=profiles.get(g.profile),yieldN=P-p.loss,maxOut=p.max*yieldN/P,nBig=ceil(g.need,maxOut);if(nBig>10000n){issue("profiles",g.profile,"Plan exceeds 10000 batches for one lot/profile; inspect capacity and units");continue}const n=Number(nBig),targetBase=g.need/nBig,rem=g.need%nBig;let planned=0n;
  for(let i=0;i<n;i++){const target=targetBase+(BigInt(i)<rem?1n:0n);let green=ceil(target*P,yieldN);if(green<p.min)green=p.min;const out=green*yieldN/P;planned+=out;lotUse.set(g.lot,(lotUse.get(g.lot)||0n)+green);let available=out;const allocations=[];
   for(const a of g.allocations){const use=a.left<available?a.left:available;if(use){allocations.push({line_id:a.line_id,order_id:a.order_id,sku:a.sku,due_date:a.due_date,roasted_g:fmt(use)});a.left-=use;available-=use}if(!available)break}
   batches.push({batch_id:"batch-"+String(batches.length+1).padStart(4,"0"),lot_id:g.lot,coffee:lots.get(g.lot).coffee,profile_id:g.profile,green_g:fmt(green),planned_roasted_g:fmt(out),planned_loss_g:fmt(green-out),unallocated_roasted_g:fmt(available),earliest_due:allocations[0]?.due_date||"",allocations});
  }groupSurplus.set(k,planned-g.need);
 }
 const lotRows=N.lots.map(l=>{const used=lotUse.get(l.lot_id)||0n,short=used>l.green?used-l.green:0n;if(short)issue("lots",l.lot_id,"Green stock shortage of "+fmt(short)+" g");return {lot_id:l.lot_id,coffee:l.coffee,on_hand_green_g:fmt(l.green),planned_green_g:fmt(used),remaining_green_g:fmt(l.green-used),shortage_g:fmt(short)}});
 const roastedStock=[...new Set([...stockGroups.keys(),...groups.keys()])].map(k=>{const [lot_id,profile_id]=JSON.parse(k);return {lot_id,profile_id,on_hand_g:fmt(stockGroups.get(k)||0n),used_g:fmt(stockUsed.get(k)||0n),remaining_original_g:fmt(stockAvailable.get(k)||0n),planned_surplus_g:fmt(groupSurplus.get(k)||0n)}});
 const packagedStock=N.products.map(p=>({sku:p.sku,on_hand_units:N.packaged.find(r=>r.sku===p.sku)?.count||0,used_units:packagedUsed.get(p.sku)||0,remaining_units:packaged.get(p.sku)||0}));
 return {issues,warnings,orders,components,batches,lots:lotRows,roastedStock,packagedStock,totals:{orders:orders.length,batches:batches.length,orderedUnits:orders.reduce((s,r)=>s+r.ordered_units,0),makeUnits:orders.reduce((s,r)=>s+r.make_units,0),plannedGreenG:fmt([...lotUse.values()].reduce((s,n)=>s+n,0n)),plannedRoastedG:fmt(batches.reduce((s,b)=>s+dec(b.planned_roasted_g),0n))}};
}
function freeze(w,reviewer,note,at){w=reopen(w);if(Object.keys(w.session.tableDrafts||{}).length)throw Error("Apply all pending source drafts before freezing");if(!String(reviewer).trim())throw Error("Reviewer name is required");const result=analyse(w);if(result.issues.length)throw Error("Resolve the plan issues before freezing");if(!result.orders.length)throw Error("Load orders before freezing");const id="plan-"+(w.frozenPlans.length+1);w.frozenPlans.push({id,reviewer:String(reviewer).trim(),note:String(note||""),createdAt:String(at||""),inputIdentity:inputs(w),tables:clone(w.tables),bindings:clone(w.bindings),result});w.session.selectedPlan=id;w.session.outcomeDraft={};return w}
function recordOutcome(w,planId,batchId,green,roasted,reference,note,at){w=reopen(w);const plan=w.frozenPlans.find(p=>p.id===planId),batch=plan?.result.batches.find(b=>b.batch_id===batchId);if(!batch)throw Error("Choose a batch from its frozen plan");const g=dec(green,"Actual green grams"),r=dec(roasted,"Actual roasted grams");if(!g||r>g)throw Error("Actual green must be positive; roasted output must not exceed green input");if(!String(reference).trim())throw Error("Actual batch reference is required");const id="outcome-"+(w.outcomes.length+1),previous=w.outcomes.filter(o=>o.planId===planId&&o.batchId===batchId).at(-1);w.outcomes.push({id,planId,batchId,green_g:fmt(g),roasted_g:fmt(r),reference:String(reference).trim(),note:String(note||""),recordedAt:String(at||""),supersedes:previous?.id||null});w.session.outcomeDraft={};return w}
function outcomes(w,planId){w=reopen(w);const plan=w.frozenPlans.find(p=>p.id===planId);if(!plan)throw Error("Frozen plan not found");const latest=new Map;for(const o of w.outcomes)if(o.planId===planId)latest.set(o.batchId,o);const rows=plan.result.batches.map(b=>{const a=latest.get(b.batch_id);return {...b,status:a?"Recorded":"Awaiting outcome",actual_green_g:a?.green_g??"",actual_roasted_g:a?.roasted_g??"",green_variance_g:a?fmt(dec(a.green_g)-dec(b.green_g)):"",roasted_variance_g:a?fmt(dec(a.roasted_g)-dec(b.planned_roasted_g)):"",actual_reference:a?.reference||"",outcome_id:a?.id||"",note:a?.note||""}});
 const lotRows=plan.tables.lots.map(l=>{const actual=rows.filter(r=>r.lot_id===l.lot_id&&r.status==="Recorded").reduce((s,r)=>s+dec(r.actual_green_g),0n);return {lot_id:l.lot_id,original_green_g:l.green_g,recorded_green_g:fmt(actual),original_less_recorded_g:fmt(dec(l.green_g)-actual)}});
 const byGroup=new Map;for(const b of rows){const k=JSON.stringify([b.lot_id,b.profile_id]);if(!byGroup.has(k))byGroup.set(k,{lot_id:b.lot_id,profile_id:b.profile_id,required:0n,actual:0n,pending:0});const g=byGroup.get(k);g.required+=b.allocations.reduce((s,a)=>s+dec(a.roasted_g),0n);if(b.status==="Recorded")g.actual+=dec(b.actual_roasted_g);else g.pending++}
 const coverage=[...byGroup.values()].map(g=>({lot_id:g.lot_id,profile_id:g.profile_id,allocated_new_roast_g:fmt(g.required),recorded_output_g:fmt(g.actual),recorded_less_allocated_g:fmt(g.actual-g.required),pending_batches:g.pending}));
 return {planId,rows,lots:lotRows,coverage,recorded:rows.filter(r=>r.status==="Recorded").length,total:rows.length,currentInputsMatch:plan.inputIdentity===inputs(w)}
}
function table(rows,keys){return "<table><thead><tr>"+keys.map(k=>"<th>"+esc(k.replace(/_/g," "))+"</th>").join("")+"</tr></thead><tbody>"+rows.map(r=>"<tr>"+keys.map(k=>"<td>"+esc(typeof r[k]==="object"?JSON.stringify(r[k]):r[k])+"</td>").join("")+"</tr>").join("")+"</tbody></table>"}
function report(w){w=reopen(w);const p=analyse(w);let h="<h1>"+esc(w.caseName)+" — order-to-roast plan</h1><p>Weights are grams. Recipe shares refer to roasted component mass. Capacity and losses come from the supplied tables.</p><h2>Plan issues</h2>"+(p.issues.length?table(p.issues,["table","id","message"]):"<p>No input or green-stock issues in this plan.</p>");
 for(const [title,rows,keys] of [["Order coverage",p.orders,["line_id","order_id","sku","due_date","ordered_units","from_packaged_units","make_units","packed_g","roasted_input_g"]],["Lot balance",p.lots,["lot_id","coffee","on_hand_green_g","planned_green_g","remaining_green_g","shortage_g"]],["Roast batches",p.batches,["batch_id","lot_id","profile_id","green_g","planned_roasted_g","unallocated_roasted_g","earliest_due"]],["Component allocation",p.components,["line_id","sku","lot_id","profile_id","share_pct","required_roasted_g","from_roasted_stock_g","new_roast_needed_g"]],["Roasted inventory",p.roastedStock,["lot_id","profile_id","on_hand_g","used_g","remaining_original_g","planned_surplus_g"]],["Packed inventory",p.packagedStock,["sku","on_hand_units","used_units","remaining_units"]]])h+="<h2>"+title+"</h2>"+table(rows,keys);
 for(const plan of w.frozenPlans){const a=outcomes(w,plan.id);h+="<h2>"+esc(plan.id)+" · "+esc(plan.reviewer)+" · "+a.recorded+"/"+a.total+" outcomes</h2><p>"+esc(plan.note)+"</p><p>Current input tables "+(a.currentInputsMatch?"match":"differ from")+" this frozen plan.</p>"+table(a.rows,["batch_id","lot_id","profile_id","green_g","planned_roasted_g","status","actual_green_g","actual_roasted_g","actual_reference","roasted_variance_g","note"])+table(a.coverage,["lot_id","profile_id","allocated_new_roast_g","recorded_output_g","recorded_less_allocated_g","pending_batches"])}
 return h+"<h2>Operating notes</h2><p>"+esc(w.notes).replace(/\n/g,"<br>")+"</p><h2>Retained source captures</h2>"+table(w.captures,["id","table","filename","capturedAt"])+"<p>Full workspace JSON retains every original CSV body, frozen input set and outcome correction. Original stock is a planning snapshot; record new stock counts in a new source edition before planning another period.</p>"
}
return {columns,empty,reopen,receive,analyse,freeze,recordOutcome,outcomes,inputs,parseCSV,csv,esc,table,report,decimal:dec,format:fmt};
}
export { createRoasteryCore };
