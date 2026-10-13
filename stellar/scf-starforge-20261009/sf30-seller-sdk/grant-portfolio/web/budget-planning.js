/* MIT. Multiannual budgets and forecasts in the original saved portfolio. */
"use strict";
function GrantBudgetPlanningConsole(H) {
  const {state,node,button,field,panel,heading,table,api,response,action,runOriginal,render,notice,failure,showDialog,currentEdit,rawDetails,sourceName}=H;
  const SCHEMA="stellar-forge.grant-budget-planning.v1", DRAFT="stellar-forge.grant-budget-planning-draft.v1";
  const U={selection:null,scenarioId:"",compareId:"",tab:"position",granularity:"month",search:"",period:"",direction:"",archived:false,offset:0,actor:"",draft:null,storageError:"",importEpoch:0};
  const META=new Set(["id","revision","createdAt","updatedAt","updatedBy","sha256","archived","archiveReason"]);
  const FIELDS={
    scenarios:["code","title","nodeId","owner","startMonth","endMonth","description","openingBalances","basedOn","reviewStatus","reviewer","reviewNote","documentIds","sourceRefs","notes"],
    lines:["scenarioId","nodeId","grantId","code","title","direction","category","period","amount","currency","classification","commitmentReference","cashDate","milestoneId","documentIds","sourceRefs","notes"]
  };
  const p=()=>state().portfolio, model=()=>p()?.definition.planning;
  const rows=c=>model()?.records[c]||[], prows=c=>p()?.definition.programme?.records[c]||[];
  const title=r=>r?((r.code?r.code+" · ":"")+(r.title||r.name||r.id)):"No selection";
  const clone=x=>JSON.parse(JSON.stringify(x));
  const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==="object"?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
  const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
  const selected=()=>({portfolioId:p().id,revision:p().revision,snapshot:p().snapshot,planningRevision:model()?.revision||0});
  const key=()=>p()?"grant-budget-draft:"+state().state.workspaceId+":"+p().id:null;
  const same=(a,b)=>a&&b&&a.portfolioId===b.portfolioId&&a.revision===b.revision&&a.snapshot===b.snapshot&&a.planningRevision===b.planningRevision;
  const editable=()=>currentEdit()&&!state().pending;
  const query=x=>new URLSearchParams({portfolioId:p().id,revision:p().revision,...x});
  function exact(o,allowed,label){if(!plain(o)||Object.keys(o).some(k=>!allowed.includes(k)))throw Error("Use the complete "+label+" with its original field names.");}
  function decimal(value,optional=false){
    if(value===""&&optional)return null;
    if(typeof value!=="string"||value.length>64||!(/^[+-]?\d+(?:\.\d{1,18})?$/).test(value))throw Error("Enter a plain decimal with up to 18 fractional digits. Keep an unknown amount blank.");
    return value;
  }
  function fields(c,r){return Object.fromEntries(FIELDS[c].filter(k=>Object.hasOwn(r,k)).map(k=>[k,clone(r[k])]));}
  function activeRows(c) {
    const map=new Map(rows(c).map(r=>[r.id,clone(r)]));
    for(const change of U.draft?.changes||[])if(change.collection===c)
      map.set(change.id,{...(map.get(change.id)||{id:change.id,revision:0,archived:false}),...change.fields,_staged:true});
    for(const record of U.draft?.archive||[])if(record.collection===c&&map.has(record.id))
      Object.assign(map.get(record.id),{archived:true,archiveReason:record.reason,_staged:true});
    return [...map.values()];
  }
  const find=(c,id)=>activeRows(c).find(r=>r.id===id);
  function persist(){
    if(!key())return;
    try {if(U.draft)localStorage.setItem(key(),JSON.stringify(U.draft));else localStorage.removeItem(key());U.storageError="";}
    catch {U.storageError="This browser could not retain the draft. Download the complete draft JSON before leaving.";}
  }
  function identity(){
    const identity=p()?p().id+":"+p().snapshot:"none";
    if(U.selection===identity)return;
    ++U.importEpoch;U.selection=identity;U.offset=0;
    let saved=null;
    try{const raw=key()&&localStorage.getItem(key());if(raw)saved=validateDraft(JSON.parse(raw));}
    catch(e){U.storageError="The retained browser draft could not be opened: "+e.message;}
    U.draft=saved;
    if(!find("scenarios",U.scenarioId))U.scenarioId=activeRows("scenarios").find(r=>!r.archived)?.id||"";
    if(!find("scenarios",U.compareId))U.compareId="";
    if(!U.actor)U.actor=U.draft?.actor||p()?.review.reviewer||"";
  }
  function ensureDraft(){
    if(!p()||!editable())throw Error("Open the latest portfolio revision and complete its pending operation before editing.");
    if(U.draft?.operation)throw Error("Receive the original saved operation before changing this draft.");
    if(U.draft&&!same(U.draft.basis,selected()))throw Error("Review this draft against the selected saved revision before editing.");
    if(!U.draft)U.draft={schema:DRAFT,basis:selected(),actor:U.actor,changes:[],archive:[],recordBases:{},createdAt:new Date().toISOString()};
    return U.draft;
  }
  function stage(c,id,data){
    const draft=ensureDraft(),original=rows(c).find(r=>r.id===id);
    if(original?.archived)throw Error("This original record is archived. Copy its retained content into a new record.");
    const token=c+":"+id,index=draft.changes.findIndex(r=>r.collection===c&&r.id===id);
    const change={collection:c,id,expectedRevision:original?.revision||0,fields:{...(index<0?{}:draft.changes[index].fields),...data}};
    if(index<0)draft.changes.push(change);else draft.changes[index]=change;
    draft.archive=draft.archive.filter(r=>r.collection!==c||r.id!==id);
    if(!Object.hasOwn(draft.recordBases,token))draft.recordBases[token]=original?{revision:original.revision,sha256:original.sha256}:null;
    draft.actor=U.actor;persist();
  }
  function stageArchive(c,r,reason){
    const draft=ensureDraft(),original=rows(c).find(x=>x.id===r.id);
    if(!original){if(c==="scenarios"&&draft.changes.some(x=>x.collection==="lines"&&x.fields.scenarioId===r.id))throw Error("Remove this new scenario’s staged lines before removing the scenario.");draft.changes=draft.changes.filter(x=>x.collection!==c||x.id!==r.id);delete draft.recordBases[c+":"+r.id];persist();return;}
    draft.changes=draft.changes.filter(x=>x.collection!==c||x.id!==r.id);
    draft.archive=draft.archive.filter(x=>x.collection!==c||x.id!==r.id);
    draft.archive.push({collection:c,id:r.id,expectedRevision:original.revision,reason});
    draft.recordBases[c+":"+r.id]={revision:original.revision,sha256:original.sha256};persist();
  }
  function validateDraft(v){
    exact(v,["schema","basis","actor","changes","archive","recordBases","createdAt","operation"],"planning draft");
    if(v.schema!==DRAFT||!plain(v.basis)||!Array.isArray(v.changes)||!Array.isArray(v.archive)||!plain(v.recordBases)||
       typeof v.actor!=="string"||v.changes.length+v.archive.length>2000)throw Error("Select one complete planning draft with at most 2,000 changes.");
    exact(v.basis,["portfolioId","revision","snapshot","planningRevision"],"draft basis");
    if(!/^[0-9a-f-]{36}$/.test(v.basis.portfolioId||"")||!Number.isSafeInteger(v.basis.revision)||v.basis.revision<1||
       !Number.isSafeInteger(v.basis.planningRevision)||v.basis.planningRevision<0||!/^[0-9a-f]{64}$/.test(v.basis.snapshot||""))throw Error("The draft has no complete saved portfolio basis.");
    const ids=new Set();
    for(const [list,archive] of [[v.changes,false],[v.archive,true]])for(const item of list){
      exact(item,archive?["collection","id","expectedRevision","reason"]:["collection","id","expectedRevision","fields"],"draft record");
      if(!FIELDS[item.collection]||!/^[0-9a-f-]{36}$/.test(item.id||"")||!Number.isSafeInteger(item.expectedRevision)||item.expectedRevision<0)throw Error("Preserve each original record ID and revision.");
      const token=item.collection+":"+item.id;if(ids.has(token))throw Error("The same record appears more than once in this draft.");ids.add(token);
      if(archive){if(!item.expectedRevision||typeof item.reason!=="string"||!item.reason.trim())throw Error("An archive needs its original revision and reason.");}
      else exact(item.fields,FIELDS[item.collection],"record fields");
      const basis=v.recordBases[token];
      if(item.expectedRevision===0){if(basis!==null)throw Error("A new record must retain its empty prior basis.");}
      else if(!plain(basis)||basis.revision!==item.expectedRevision||!/^[0-9a-f]{64}$/.test(basis.sha256||""))throw Error("The original record hash is missing from this draft.");
    }
    if(v.operation){
      exact(v.operation,["operationId","action","payload"],"saved operation");
      if(v.operation.action!=="portfolio.save"||!plain(v.operation.payload)||v.operation.payload.id!==v.basis.portfolioId||
         !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(v.operation.operationId||""))throw Error("The retained operation belongs to another portfolio.");
      const payload=v.operation.payload;
      exact(payload,["id","expectedPortfolioRevision","name","notes","sources","review","planning"],"retained planning save");
      if(payload.expectedPortfolioRevision!==v.basis.revision||!equal(payload.planning,{schema:SCHEMA,actor:v.actor,expectedPlanningRevision:v.basis.planningRevision,changes:v.changes,archive:v.archive}))
        throw Error("The retained operation differs from the complete planning draft.");
    }
    return clone(v);
  }
  function downloadLocal(value,filename,type="application/json"){
    const blob=new Blob([typeof value==="string"?value:JSON.stringify(value,null,2)+"\n"],{type:type+"; charset=utf-8"});
    const url=URL.createObjectURL(blob),a=node("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function descendants(id){
    const all=new Set(),todo=[id];while(todo.length){const id=todo.pop();if(all.has(id))continue;all.add(id);for(const r of prows("nodes"))if(r.parentId===id)todo.push(r.id);}
    return all;
  }
  function selectField(label,collection,value,{optional=false,filter=()=>true}={}){
    const options=prows(collection).filter(r=>(!r.archived||r.id===value)&&filter(r)).map(r=>[r.id,title(r)]);
    if(optional)options.unshift(["","None"]);
    else if(!options.some(([id])=>id===value))options.unshift(["","Select a record"]);
    return field(label,"select",value||"",options);
  }
  function documentsControl(value=[]){
    const box=node("div",null,"budget-evidence"),search=field("Find supporting documents","search"),select=node("select"),chosen=new Set(value),list=node("div");
    select.size=5;select.setAttribute("aria-label","Available supporting documents");
    const paint=()=>{list.replaceChildren();for(const id of chosen){const row=node("div",null,"budget-chip");row.append(node("span",title(prows("documents").find(x=>x.id===id))),button("Remove",()=>{chosen.delete(id);paint();}));list.append(row);}
      const needle=search.input.value.toLowerCase();select.replaceChildren();const matches=prows("documents").filter(r=>(!r.archived||chosen.has(r.id))&&title(r).toLowerCase().includes(needle));
      for(const r of matches){const o=node("option",title(r));o.value=r.id;select.append(o);}select.disabled=!matches.length;};
    search.input.addEventListener("input",paint);
    box.append(list,search.wrapper,select,button("Add selected document",()=>{if(select.value){chosen.add(select.value);paint();}}));paint();
    return {wrapper:box,read:()=>[...chosen]};
  }
  function sourcesControl(value=[],basis=selected()){
    const box=node("div"),chosen=new Map(value.map(r=>[r.sourceId+":"+r.entityKey,clone(r)])),list=node("div"),results=node("div"),search=field("Find original source records","search");
    let generation=0;
    const paint=()=>{list.replaceChildren();for(const [key,r] of chosen){const line=node("div",null,"budget-chip");line.append(node("span",sourceName(r.sourceId)+" · "+r.entityKey.slice(0,16)),button("Remove",()=>{chosen.delete(key);paint();}));list.append(line);}};
    async function loadPage(offset=0){
      const request=++generation,term=search.input.value;
      const result=await api("/api/rows?"+new URLSearchParams({portfolioId:basis.portfolioId,revision:basis.revision,table:"entities",offset,limit:50,search:term}));
      if(request!==generation||!p()||p().id!==basis.portfolioId||p().snapshot!==basis.snapshot)return;
      if(result.snapshot!==basis.snapshot)throw Error("The source search returned a different portfolio revision.");
      results.replaceChildren(table(["Original record","Source","Use"],result.rows.map(r=>[r.title||r.originalId,sourceName(r.sourceId),button("Add original",()=>{chosen.set(r.sourceId+":"+r.entityKey,{sourceId:r.sourceId,entityKey:r.entityKey,sha256:r.sha256});paint();})])));
      const prev=button("Previous",()=>loadPage(Math.max(0,offset-50))),next=button("Next",()=>loadPage(result.nextOffset));prev.disabled=!offset;next.disabled=result.nextOffset===null;results.append(prev,next,node("p",result.total+" matching original records","small"));
    }
    search.input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();loadPage().catch(failure);}});
    box.append(list,search.wrapper,button("Search sources",()=>loadPage()),results);paint();return {wrapper:box,read:()=>[...chosen.values()]};
  }
  function openingControl(values=[]){
    const box=node("div"),entries=[];const addButton=button("Add opening balance",()=>add());
    function add(value={currency:"",value:""}){
      const row=node("div",null,"budget-opening-row"),currency=field("Currency","text",value.currency),amount=field("Opening balance","text",value.value),entry={currency,amount,active:true};
      amount.input.inputMode="decimal";row.append(currency.wrapper,amount.wrapper,button("Remove",()=>{entry.active=false;row.remove();}));entries.push(entry);box.insertBefore(row,addButton);
    }
    box.append(addButton);values.forEach(add);
    return {wrapper:box,read(){const seen=new Set();return entries.filter(r=>r.active).map(r=>{const currency=r.currency.input.value;if(!/^[A-Z]{3}$/.test(currency)||seen.has(currency))throw Error("Use one opening balance per three-letter uppercase currency.");seen.add(currency);return {currency,value:decimal(r.amount.input.value)};});}};
  }
  function editor(c,record=null){
    ensureDraft();const basis=selected(),id=record?.id||crypto.randomUUID(),form=node("form",null,"budget-editor"),grid=node("div",null,"form-grid"),controls={};
    const row=record||{},scenario=c==="lines"?find("scenarios",row.scenarioId||U.scenarioId):null;
    const add=(key,label,type,value,options)=>{const f=field(label,type,value??"",options);controls[key]={...f,read:()=>f.input.value};grid.append(f.wrapper);return f;};
    add("code","Code","text",row.code).input.required=true;add("title","Title","text",row.title).input.required=true;
    const nodeField=selectField("Program or project","nodes",row.nodeId||scenario?.nodeId,{filter:r=>!scenario||descendants(scenario.nodeId).has(r.id)});
    controls.nodeId={...nodeField,read:()=>nodeField.input.value};grid.append(nodeField.wrapper);nodeField.input.required=true;
    if(c==="scenarios"){
      add("owner","Owner","text",row.owner||U.actor).input.required=true;
      add("startMonth","First month","month",row.startMonth).input.required=true;add("endMonth","Last month (inclusive)","month",row.endMonth).input.required=true;
      add("description","Scope and assumptions","textarea",row.description).wrapper.classList.add("full");
      const openings=openingControl(row.openingBalances);controls.openingBalances=openings;const g=node("fieldset",null,"full");g.append(node("legend","Cash opening balances"),openings.wrapper);grid.append(g);
      if(row.basedOn)form.append(node("p","Copied from scenario "+row.basedOn.id+" at record revision "+row.basedOn.revision,"small"));
      form.append(node("p","A new or edited scenario remains working. Record the Finance / team-lead review separately after saving its lines.","small"));
    }else{
      if(!scenario)throw Error("Choose a planning scenario first.");
      controls.scenarioId={read:()=>scenario.id};
      const grants=selectField("Grant or subgrant","grants",row.grantId,{optional:true,filter:r=>descendants(scenario.nodeId).has(r.projectId)});
      controls.grantId={...grants,read:()=>grants.input.value||null};grid.append(grants.wrapper);
      add("direction","Direction","select",row.direction||"outflow",[["outflow","Outflow"],["inflow","Inflow"]]);
      add("category","Category","text",row.category).input.required=true;
      const budgetPeriod=add("period","Budget period — YYYY or YYYY-MM","text",row.period||scenario.startMonth);budgetPeriod.input.required=true;budgetPeriod.input.placeholder="2027 or 2027-04";budgetPeriod.input.pattern="[0-9]{4}(-[0-9]{2})?";
      const amount=add("amount","Amount — blank means unknown","text",row.amount??"");amount.input.inputMode="decimal";controls.amount.read=()=>decimal(amount.input.value,true);
      add("currency","Currency","text",row.currency||scenario.openingBalances?.[0]?.currency||"").input.required=true;
      add("classification","Basis","select",row.classification||"forecast",[["forecast","Forecast"],["committed","Written commitment"]]);
      add("commitmentReference","Written commitment reference","textarea",row.commitmentReference);
      const cash=add("cashDate","Expected cash date (optional)","date",row.cashDate);controls.cashDate.read=()=>cash.input.value||null;
      const milestone=selectField("Related workplan milestone","milestones",row.milestoneId,{optional:true,filter:r=>descendants(scenario.nodeId).has(r.nodeId)});
      controls.milestoneId={...milestone,read:()=>milestone.input.value||null};grid.append(milestone.wrapper);
      form.append(node("p","Budget year or month and cash date serve different views. A year-only budget remains unallocated in the monthly view until explicitly revised. Unknown cash dates stay visible. Amounts are retained exactly as entered.","small"));
    }
    const docs=documentsControl(row.documentIds),sources=sourcesControl(row.sourceRefs,basis);
    controls.documentIds=docs;controls.sourceRefs=sources;
    for(const [label,control]of[["Supporting documents",docs],["Original source records",sources]]){const details=node("details",null,"full");details.append(node("summary",label),control.wrapper);grid.append(details);}
    add("notes","Notes","textarea",row.notes).wrapper.classList.add("full");
    form.append(grid);const submit=node("button","Stage "+(c==="scenarios"?"scenario":"budget line"),"primary");submit.type="submit";form.append(submit);
    form.addEventListener("submit",e=>{e.preventDefault();try{
      if(!same(basis,selected()))throw Error("The saved selection changed. Reopen this editor against the current revision.");
      const value={};for(const[k,v]of Object.entries(controls))value[k]=v.read();
      if(c==="scenarios"){value.reviewStatus="working";value.reviewer="";value.reviewNote="";if(row.basedOn)value.basedOn=clone(row.basedOn);}
      stage(c,id,value);if(c==="scenarios")U.scenarioId=id;
      document.querySelector("#detail-dialog").close();render().catch(failure);
    }catch(e){failure(e);}});
    showDialog((record?"Edit ":"Add ")+(c==="scenarios"?"scenario":"budget line"),[form]);
  }
  function reviewScenario(record){
    if(record._staged||(U.draft?.changes.length||0)+(U.draft?.archive.length||0))throw Error("Save the complete working draft before recording a separate review.");
    const basis=selected(),form=node("form"),reviewer=field("Reviewer","text",U.actor),note=field("Review note","textarea",record.reviewNote||"");
    reviewer.input.required=note.input.required=true;form.append(node("p",title(record)),node("p","Record the review carried out under this program's actual Finance and team-lead clearance. This planning record does not add a new approval gate.","small"),reviewer.wrapper,note.wrapper);
    const submit=node("button","Stage reviewed status","primary");submit.type="submit";form.append(submit);
    form.addEventListener("submit",e=>{e.preventDefault();try{if(!same(basis,selected()))throw Error("The selected revision changed.");stage("scenarios",record.id,{reviewStatus:"reviewed",reviewer:reviewer.input.value,reviewNote:note.input.value});document.querySelector("#detail-dialog").close();render().catch(failure);}catch(e){failure(e);}});
    showDialog("Record scenario review",[form]);
  }
  function archive(c,r){
    const basis=selected();
    const form=node("form"),reason=field("Reason","textarea");reason.input.required=true;
    form.append(node("p",title(r)),node("p","Archive this record from active planning. Its original revisions and source references remain available.","small"),reason.wrapper);
    const submit=node("button","Stage archive","primary");submit.type="submit";form.append(submit);
    form.addEventListener("submit",e=>{e.preventDefault();try{if(!same(basis,selected()))throw Error("The selected saved revision changed. Reopen this original record before archiving.");stageArchive(c,r,reason.input.value);document.querySelector("#detail-dialog").close();render().catch(failure);}catch(e){failure(e);}});showDialog("Archive planning record",[form]);
  }
  function copyScenario(record){
    const basis=selected();
    if(U.draft?.changes.length||U.draft?.archive.length)throw Error("Save or download and clear the current draft before copying a saved scenario.");
    if(!record.revision||record._staged)throw Error("Save this scenario before making a linked copy.");
    const lines=rows("lines").filter(r=>r.scenarioId===record.id&&!r.archived);
    if(lines.length+1>2000)throw Error("This complete scenario exceeds the 2,000-record save limit. Use the client to copy its stable IDs in explicit complete batches.");
    const form=node("form"),code=field("New scenario code","text",record.code+"-copy"),name=field("New scenario title","text",record.title+" — copy");
    code.input.required=name.input.required=true;form.append(code.wrapper,name.wrapper,node("p",lines.length+" complete active lines will retain their amounts, currencies, dates, scope, documents and source references.","small"));
    const submit=node("button","Stage complete scenario copy","primary");submit.type="submit";form.append(submit);
    form.addEventListener("submit",e=>{e.preventDefault();try{
      if(!same(basis,selected()))throw Error("The selected saved revision changed. Reopen the original scenario before copying.");
      const id=crypto.randomUUID();stage("scenarios",id,{...fields("scenarios",record),code:code.input.value,title:name.input.value,basedOn:{id:record.id,revision:record.revision,sha256:record.sha256},reviewStatus:"working",reviewer:"",reviewNote:""});
      for(const line of lines)stage("lines",crypto.randomUUID(),{...fields("lines",line),scenarioId:id});
      U.scenarioId=id;U.tab="lines";document.querySelector("#detail-dialog").close();render().catch(failure);
    }catch(e){failure(e);}});showDialog("Copy complete scenario",[form]);
  }

  async function detail(c,record){
    const overlay=find(c,record.id);if(overlay?._staged)record=overlay;
    const basis=selected(),generation=state().epoch;
    const result=record._staged?null:await api("/api/planning/record?"+query({collection:c,id:record.id}));
    if(generation!==state().epoch||!same(basis,selected()))return;
    if(result&&(result.snapshot!==basis.snapshot||result.record.id!==record.id))throw Error("The planning record returned a different saved selection.");
    const row=result?.record||record,items=[node("p",(row._staged?"Staged, unsaved record":"Record revision "+row.revision+" · "+row.updatedAt+" · "+row.updatedBy),"small")];
    if(row.archived)items.push(node("p","Archived: "+row.archiveReason,"coverage"));
    const values=node("dl",null,"budget-detail");
    for(const key of FIELDS[c])if(Object.hasOwn(row,key)&&!["documentIds","sourceRefs"].includes(key)){
      values.append(node("dt",key.replace(/([a-z])([A-Z])/g,"$1 $2")),node("dd",row[key]===null?"Unknown":typeof row[key]==="object"?JSON.stringify(row[key],null,2):String(row[key])));
    }
    items.push(values);
    if(row.documentIds?.length)items.push(table(["Supporting document","Open"],row.documentIds.map(id=>{const d=prows("documents").find(x=>x.id===id);return[title(d),button("View document record",async()=>{const found=await api("/api/programme/record?"+new URLSearchParams({portfolioId:basis.portfolioId,revision:basis.revision,collection:"documents",id}));showDialog(title(found.record),[rawDetails("Complete saved document",found.record)]);})];})));
    if(row.sourceRefs?.length)items.push(table(["Source edition","Original record","Open"],row.sourceRefs.map(ref=>[sourceName(ref.sourceId),ref.entityKey,button("View original",async()=>{
      const found=await api("/api/detail?"+new URLSearchParams({portfolioId:basis.portfolioId,revision:basis.revision,sourceId:ref.sourceId,entityKey:ref.entityKey}));
      if(found.entity.sha256!==ref.sha256)throw Error("The original source reference changed. Review its saved edition.");
      showDialog(found.entity.title||found.entity.originalId,[node("p",found.source.coverage.statement),rawDetails("Original published record",found.entity.original),rawDetails("Original financial rows",found.financial)]);
    })])));
    const actions=node("div",null,"actions");
    if(!row.archived&&editable()){actions.append(button("Edit",()=>editor(c,record)),button("Archive",()=>archive(c,record)));if(c==="scenarios")actions.append(button("Copy scenario",()=>copyScenario(record)),button("Record review",()=>reviewScenario(record)));}
    if(row.revision)actions.append(button("Saved record history",()=>history(c,row,basis)));
    items.push(actions,rawDetails("Complete retained record",row));showDialog(title(row),items);
  }
  async function history(c,row,basis=selected()){
    const result=await api("/api/planning/history?"+new URLSearchParams({portfolioId:basis.portfolioId,revision:basis.revision,collection:c,id:row.id}));
    if(!p()||p().id!==basis.portfolioId||p().snapshot!==basis.snapshot)return;
    if(result.snapshot!==basis.snapshot||result.id!==row.id)throw Error("The planning history selected a different saved revision.");
    const entries=result.history||[];
    showDialog("Saved history · "+title(row),[table(["Portfolio revision","Record revision","Editor","State","Open"],entries.map(r=>[
      r.portfolioRevision,r.record.revision,r.record.updatedBy,r.record.archived?"Archived":r.record.reviewStatus||r.record.classification||"Working",
      button("Open complete saved edition",()=>showDialog("Record revision "+r.record.revision,[rawDetails("Original saved edition",r),button("Download original edition",()=>downloadLocal(r,"budget-record-"+r.record.id+"-r"+r.record.revision+".json"))]))
    ])),button("Download complete history",()=>downloadLocal(result,"budget-history-"+row.id+".json"))]);
  }
  function draftPayload(draft=U.draft){
    const def=p().definition;
    return {id:p().id,expectedPortfolioRevision:draft.basis.revision,name:def.name,notes:def.notes,sources:def.sources,review:def.review,
      planning:{schema:SCHEMA,actor:draft.actor,expectedPlanningRevision:draft.basis.planningRevision,changes:draft.changes,archive:draft.archive}};
  }
  async function saveDraft(){
    const draft=ensureDraft();draft.actor=U.actor;
    if(!draft.actor.trim())throw Error("Enter the person recording this planning revision.");
    if(!draft.changes.length&&!draft.archive.length)throw Error("Stage at least one record change.");
    if(draft.changes.length+draft.archive.length>2000)throw Error("A save accepts up to 2,000 changes. Keep the full draft and save explicit batches.");
    const payload=draftPayload(draft),bytes=new TextEncoder().encode(JSON.stringify({operationId:"grant-"+crypto.randomUUID(),action:"portfolio.save",payload})).length;
    if(bytes>1024*1024)throw Error("This full operation is "+bytes+" bytes, beyond the original 1 MiB save limit. Download the complete draft and use smaller explicit batches.");
    const originalKey=key();persist();
    try{
      const pending=action("portfolio.save",payload);
      if(state().pending){draft.operation=clone(state().pending);U.draft=draft;persist();}
      await pending;
      if(originalKey)try{localStorage.removeItem(originalKey);}catch{}U.draft=null;
      notice("The complete planning revision is saved. Review its native budget and cash summaries.");await render();
    }catch(error){U.draft=draft;persist();throw error;}
  }
  async function receiveDraft(){
    const draft=U.draft,op=draft?.operation;if(!op)throw Error("There is no retained planning operation.");
    if(state().pending&&state().pending.operationId!==op.operationId)throw Error("Complete the other pending portfolio operation first.");
    validateDraft(draft);
    const original=same(draft.basis,selected())?p():await api("/api/portfolio?"+new URLSearchParams({id:draft.basis.portfolioId,revision:draft.basis.revision}));
    if(original.snapshot!==draft.basis.snapshot||["name","notes","sources","review"].some(k=>!equal(op.payload[k],original.definition[k])))
      throw Error("The retained planning save differs from its original portfolio definition.");
    let status;
    try{status=await api("/api/request?id="+encodeURIComponent(op.operationId));}
    catch(error){
      if(error.code!=="NOT_FOUND")throw error;
      const originalKey=key();await runOriginal(op);
      if(originalKey)try{localStorage.removeItem(originalKey);}catch{}
      U.draft=null;await render();return;
    }
    if(status.id!==op.operationId)throw Error("The workspace returned another operation.");
    if(status.state==="FAILED"){
      const form=node("div");form.append(node("p",status.error?.message||"The original save failed."),rawDetails("Complete original operation result",status));
      form.append(button("Keep changes for current-revision review",()=>{
        if(state().pending?.operationId===op.operationId)state().pending=null;
        delete U.draft.operation;persist();document.querySelector("#detail-dialog").close();render().catch(failure);
      }));showDialog("Review the failed save",[form]);return;
    }
    const originalKey=key();await runOriginal(op);if(originalKey)try{localStorage.removeItem(originalKey);}catch{}U.draft=null;await render();
  }
  function rebaseDraft(){
    if(!U.draft||U.draft.operation)throw Error("Receive the original save before reviewing the draft basis.");
    if(!editable())throw Error("Open the latest saved portfolio revision.");
    if(U.draft.basis.portfolioId!==p().id)throw Error("This draft belongs to another portfolio.");
    const conflicts=[];
    for(const item of [...U.draft.changes,...U.draft.archive]){
      const r=rows(item.collection).find(r=>r.id===item.id),base=U.draft.recordBases[item.collection+":"+item.id];
      if(base?(!r||r.revision!==base.revision||r.sha256!==base.sha256||r.archived):!!r)conflicts.push({collection:item.collection,id:item.id,prior:base,current:r||null});
    }
    if(conflicts.length){showDialog("Review changed original records",[node("p","These records changed after this draft was prepared. Download the full draft, reopen the current records, and compose the changes explicitly."),table(["Register","Record","Current revision"],conflicts.map(c=>[c.collection,title(c.current),c.current?.revision||"Missing"])),rawDetails("Complete conflicts",conflicts),button("Download complete draft",()=>downloadLocal(U.draft,"budget-planning-draft.json"))]);return;}
    U.draft.basis=selected();persist();notice("The original affected records are unchanged. The draft now selects this current portfolio revision; native scope and references are checked again on save.");render().catch(failure);
  }
  function draftPanel(container){
    const section=panel("Working draft","Stage related changes, review the complete change set, then save one original portfolio operation.");
    const actor=field("Recorded by","text",U.actor);actor.input.disabled=!!U.draft?.operation;actor.input.addEventListener("input",()=>{U.actor=actor.input.value;if(U.draft){U.draft.actor=U.actor;persist();}});section.append(actor.wrapper);
    const d=U.draft,count=(d?.changes.length||0)+(d?.archive.length||0),actions=node("div",null,"actions");
    if(d){section.append(node("p",count+" staged changes · based on portfolio revision "+d.basis.revision+" and planning revision "+d.basis.planningRevision,"small"));
      if(!same(d.basis,selected()))section.append(node("p","This draft was prepared against a different saved revision. Review the original affected records before continuing.","coverage"));
      actions.append(button("Review all staged changes",()=>showDialog("Complete planning draft",[
        table(["Register","Record","Change","Original revision"],[...d.changes.map(r=>[r.collection,title(find(r.collection,r.id)),Object.keys(r.fields).join(", "),r.expectedRevision]),...d.archive.map(r=>[r.collection,r.id,"Archive: "+r.reason,r.expectedRevision])]),
        rawDetails("Complete editable draft",d)])),button("Download draft JSON",()=>downloadLocal(d,"budget-planning-draft.json")));
      if(d.operation)actions.append(button("Receive original save",receiveDraft));
      else{
        if(same(d.basis,selected())){const save=button("Save complete draft",saveDraft,"primary");save.disabled=!editable()||!count;actions.append(save);}
        else actions.append(button("Review against current revision",rebaseDraft));
        actions.append(button("Clear this browser draft",()=>showDialog("Clear unsaved draft",[
          node("p","Download the complete draft first if you want to keep these unsaved changes."),
          button("Download draft",()=>downloadLocal(U.draft,"budget-planning-draft.json")),
          button("Clear unsaved changes",()=>{U.draft=null;persist();document.querySelector("#detail-dialog").close();render().catch(failure);})
        ])));
      }
    }else section.append(node("p","No unsaved planning changes.","small"));
    const incoming=field("Receive a complete draft JSON","file");incoming.input.accept=".json,application/json";
    incoming.input.addEventListener("change",async()=>{
      const file=incoming.input.files[0],generation=++U.importEpoch,basis=selected();incoming.input.value="";
      if(!file)return;
      try{
        if(U.draft)throw Error("Download and clear the current draft before receiving another complete draft.");
        if(file.size>16*1024*1024)throw Error("The complete draft exceeds 16 MiB.");
        const text=await file.text();if(generation!==U.importEpoch||!same(basis,selected()))return;
        if(U.draft)throw Error("A working draft was created while this file was opening. Its changes are preserved; download and clear it before receiving another draft.");
        const received=validateDraft(JSON.parse(text));if(received.basis.portfolioId!==p().id)throw Error("Open this draft's original portfolio first.");
        U.draft=received;U.actor=received.actor;persist();await render();
      }catch(e){failure(e);}
    });
    section.append(actions,incoming.wrapper);if(U.storageError)section.append(node("p",U.storageError,"coverage"));container.append(section);
  }
  function pagination(container,total,shown,change){
    const line=node("div",null,"pager"),prev=button("Previous",()=>change(Math.max(0,U.offset-50))),next=button("Next",()=>change(U.offset+50));
    prev.disabled=!U.offset;next.disabled=U.offset+shown>=total;
    line.append(node("span",total?(U.offset+1)+"–"+(U.offset+shown)+" of "+total:"No matching records","small"),prev,next);container.append(line);
  }
  function scenariosView(container){
    const list=activeRows("scenarios").filter(r=>U.archived||!r.archived);
    container.append(table(["Scenario","Scope","Horizon","Owner","Review","Open"],list.map(r=>[title(r),title(prows("nodes").find(x=>x.id===r.nodeId)),r.startMonth+" to "+r.endMonth,r.owner,
      r._staged?"Staged":r.archived?"Archived":r.reviewStatus,button("Open",()=>{U.scenarioId=r.id;return detail("scenarios",r);})])));
  }
  function linesView(container,scenario){
    const bar=node("div",null,"toolbar"),search=field("Find budget lines","search",U.search),period=field("Budget year or month","text",U.period),direction=field("Direction","select",U.direction,[["","Both"],["inflow","Inflow"],["outflow","Outflow"]]);
    const apply=()=>{U.search=search.input.value;U.period=period.input.value;U.direction=direction.input.value;U.offset=0;return render();};
    search.input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();apply().catch(failure);}});
    bar.append(search.wrapper,period.wrapper,direction.wrapper,button("Apply",apply));container.append(bar);
    const needle=U.search.toLowerCase(),all=activeRows("lines").filter(r=>r.scenarioId===scenario.id&&(U.archived||!r.archived)&&(!U.period||r.period===U.period)&&(!U.direction||r.direction===U.direction)&&
      (!needle||[r.code,r.title,r.category,r.notes,r.commitmentReference,r.amount,r.currency].join(" ").toLowerCase().includes(needle))).sort((a,b)=>a.period.localeCompare(b.period)||a.code.localeCompare(b.code)||a.id.localeCompare(b.id));
    if(U.offset>=all.length)U.offset=Math.max(0,Math.floor((all.length-1)/50)*50);
    const visible=all.slice(U.offset,U.offset+50),chosen=new Set(),checks=[];
    const display=visible.map(r=>{const c=node("input");c.type="checkbox";c.setAttribute("aria-label","Select "+title(r));c.addEventListener("change",()=>c.checked?chosen.add(r.id):chosen.delete(r.id));checks.push({c,id:r.id});
      return[c,title(r),r.period,r.direction,r.amount===null?"Unknown":r.amount,r.currency,r.classification,r.cashDate||"Undated",r._staged?"Staged":r.archived?"Archived":"Saved",button("Open",()=>detail("lines",r))];});
    container.append(table(["Select","Line","Budget period","Direction","Amount","Currency","Basis","Cash date","State","Open"],display));
    const bulk=node("div",null,"actions");bulk.append(button("Select this page",()=>{for(const {c,id}of checks){c.checked=true;chosen.add(id);}}),
      button("Edit selected lines",()=>bulkEditor(all.filter(r=>chosen.has(r.id)),scenario)),
      button("Add budget line",()=>editor("lines"),"primary"));
    if(editable())container.append(bulk);pagination(container,all.length,visible.length,offset=>{U.offset=offset;return render();});
  }
  function bulkEditor(records,scenario){
    if(!records.length)throw Error("Select one or more lines on the current page.");
    ensureDraft();const basis=selected(),form=node("form"),section=node("div"),items=[];
    form.append(node("p","Edit the complete selected rows. Empty amount means unknown; zero remains an explicit zero. All unedited scope, documents and source references are preserved.","small"));
    for(const r of records){
      if(r.archived)throw Error("Archived lines retain their history. Select active lines to edit.");
      const row=node("fieldset",null,"budget-bulk-row"),amount=field("Amount","text",r.amount??""),period=field("Budget year or month","text",r.period),cash=field("Cash date","date",r.cashDate||""),classification=field("Basis","select",r.classification,[["forecast","Forecast"],["committed","Written commitment"]]),reference=field("Written commitment reference","text",r.commitmentReference||"");
      amount.input.inputMode="decimal";row.append(node("legend",title(r)),amount.wrapper,period.wrapper,cash.wrapper,classification.wrapper,reference.wrapper);section.append(row);items.push({r,amount,period,cash,classification,reference});
    }
    const submit=node("button","Stage selected line edits","primary");submit.type="submit";form.append(section,submit);
    form.addEventListener("submit",e=>{e.preventDefault();try{
      if(!same(basis,selected()))throw Error("The selected saved revision changed.");
      const changes=items.map(i=>({r:i.r,data:{amount:decimal(i.amount.input.value,true),period:i.period.input.value,cashDate:i.cash.input.value||null,classification:i.classification.input.value,commitmentReference:i.reference.input.value}}));
      for(const c of changes)stage("lines",c.r.id,c.data);
      document.querySelector("#detail-dialog").close();render().catch(failure);
    }catch(e){failure(e);}});showDialog("Edit "+records.length+" budget lines",[form]);
  }
  const bucket=b=>b?b.known+(b.missing?" · "+b.missing+" unknown":""):"—";
  function pagedTable(headers,records,cells){
    const box=node("div"),body=node("div"),nav=node("div",null,"pager");let offset=0;
    const paint=()=>{const visible=records.slice(offset,offset+50);body.replaceChildren(table(headers,visible.map(cells)));nav.replaceChildren();
      const previous=button("Previous",()=>{offset=Math.max(0,offset-50);paint();}),next=button("Next",()=>{offset+=50;paint();});
      previous.disabled=offset===0;next.disabled=offset+visible.length>=records.length;
      nav.append(node("span",records.length?(offset+1)+"–"+(offset+visible.length)+" of "+records.length+" complete rows":"No records","small"),previous,next);
    };box.append(body,nav);paint();return box;
  }
  function totalsTable(data,cash=false){
    return pagedTable(cash?["Period","Currency","Opening","Known inflow","Known outflow","Known net","Known closing","Completeness"]:["Period","Currency","Forecast inflow","Committed inflow","Forecast outflow","Committed outflow","Known net","Completeness"],data,r=>cash?
      [r.period,r.currency,r.opening??"Unknown",bucket(r.inflow),bucket(r.outflow),r.netKnown,r.closingKnown??"Unknown",r.complete?"Complete":r.missingOpening?"Opening balance missing":"Amounts or cash dates missing"]:
      [r.period,r.currency,bucket(r.inflow.forecast),bucket(r.inflow.committed),bucket(r.outflow.forecast),bucket(r.outflow.committed),r.netKnown,r.complete?"Complete":r.unallocatedAnnualCount?r.unallocatedAnnualCount+" annual lines remain unallocated":"Contains unknown amounts"]);
  }
  async function nativeReport(format,scenarioId=U.scenarioId){
    const selection=selected(),args={scenarioId,granularity:U.granularity,format,...(U.compareId?{compareScenarioId:U.compareId}:{})};
    const res=await response("/api/planning/report?"+new URLSearchParams({portfolioId:selection.portfolioId,revision:selection.revision,...args}));
    const bytes=await res.arrayBuffer(),declared=res.headers.get("content-length"),sha=res.headers.get("x-content-sha256");
    if(declared!==null&&Number(declared)!==bytes.byteLength)throw Error("The complete planning report was interrupted.");
    if(sha&&globalThis.crypto?.subtle){const received=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(b=>b.toString(16).padStart(2,"0")).join("");if(received!==sha)throw Error("The planning report differs from its native file identity.");}
    const media={"json":"application/json","csv":"text/csv","html":"text/html"}[format],name="budget-"+scenarioId+"-r"+selection.revision+"."+format;
    const blob=new Blob([bytes],{type:media}),url=URL.createObjectURL(blob),a=node("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    notice("Downloaded the complete saved planning report for portfolio revision "+selection.revision+".");
  }
  async function positionView(container,scenario,epoch){
    if(!scenario.revision||scenario._staged){container.append(node("p","Save the complete working draft to calculate its original budget and cash position.","empty"));return;}
    const selection=selected(),result=await api("/api/planning/summary?"+query({scenarioId:scenario.id,granularity:U.granularity,...(U.compareId?{compareScenarioId:U.compareId}:{})}));
    if(epoch!==state().epoch||!same(selection,selected()))return;
    if(result.snapshot!==selection.snapshot||result.revision!==selection.revision||result.scenario.id!==scenario.id)throw Error("The planning summary selected another saved revision.");
    const data=result.summary;
    if(U.draft?.changes.length||U.draft?.archive.length)container.append(node("p","These totals describe the saved revision. Staged changes are shown in the working draft and lines register.","coverage"));
    const toolbar=node("div",null,"toolbar"),granularity=field("Period view","select",U.granularity,[["month","Monthly"],["year","Annual"]]),compare=field("Compare saved scenario","select",U.compareId,[["","No comparison"],...rows("scenarios").filter(r=>r.id!==scenario.id&&!r.archived&&r.nodeId===scenario.nodeId).map(r=>[r.id,title(r)])]);
    granularity.input.addEventListener("change",()=>{U.granularity=granularity.input.value;render().catch(failure);});compare.input.addEventListener("change",()=>{U.compareId=compare.input.value;render().catch(failure);});
    toolbar.append(granularity.wrapper,compare.wrapper,...["json","csv","html"].map(format=>button("Download "+format.toUpperCase(),()=>nativeReport(format))));container.append(toolbar);
    const budget=panel("Budget and forecast","Each currency is shown separately. Values come from the saved planning engine.");budget.append(totalsTable(data.rows));container.append(budget);
    const cash=panel("Cash forecast","Cash uses the recorded cash dates and opening balances. Undated and unknown amounts remain visible.");cash.append(totalsTable(data.cashRows,true));container.append(cash);
    if(data.comparison){
      const section=panel("Scenario comparison","Difference is the selected scenario minus "+title(data.comparison.scenario)+".");
      const comparisonRows=items=>pagedTable(["Period","Currency","Selected known net","Compared known net","Difference","Completeness"],items,r=>[r.period,r.currency,r.base?.netKnown??"No row",r.compared?.netKnown??"No row",r.netKnownDifference??"Unknown",r.complete?"Complete":"Incomplete"]);
      section.append(node("h3","Budget"),comparisonRows(data.comparison.rows),node("h3","Cash"),comparisonRows(data.comparison.cashRows));container.append(section);
    }
    for(const [title,items]of[["Annual amounts not allocated to months",data.unallocatedBudgetRows],["Amounts to complete",data.missingAmounts],["Cash dates to complete",data.undatedCashRows]]){
      if(!items?.length)continue;const box=panel(title,items.length+" complete original lines");
      box.append(pagedTable(["Line","Budget period","Amount","Currency","Cash date","Open"],items,r=>[r.code+" · "+r.title,r.period,r.amount??"Unknown",r.currency,r.cashDate||"Undated",button("Open line",()=>detail("lines",r))]));container.append(box);
    }
    if(data.workplan?.length){
      const box=panel("Workplan in this horizon","Original active milestones retain their program scope, owner, status and dates.");
      box.append(pagedTable(["Milestone","Due","Owner","Status","Open"],data.workplan,r=>[title(r),r.dueDate,r.owner,r.status,button("Open original milestone",async()=>{
        const record=await api("/api/programme/record?"+new URLSearchParams({portfolioId:selection.portfolioId,revision:selection.revision,collection:"milestones",id:r.id}));
        if(!same(selection,selected()))return;
        showDialog(title(record.record),[rawDetails("Original workplan milestone",record.record)]);
      })]));container.append(box);
    }
    if(data.warnings?.length)container.append(rawDetails("Planning review notes",data.warnings));
  }
  async function renderPlanning(container,epoch){
    identity();container.classList.add("budget-planning");
    container.append(heading("Budget and forecast","Multiannual budgets, annual workplans and expected cash, with original scope, documents and saved revisions."));
    if(!p()){container.append(node("p","Choose a saved portfolio to open its planning workspace.","empty"));return;}
    if(!p().definition.programme){container.append(node("p","Create the program and projects in Programme delivery before recording their budgets.","empty"));return;}
    container.append(node("p","Portfolio revision "+p().revision+" · Planning revision "+(model()?.revision||0),"small"));
    if(!currentEdit())container.append(node("p","You are viewing a saved earlier revision. Select the latest revision to edit.","coverage"));
    const bar=node("div",null,"toolbar"),scenario=field("Planning scenario","select",U.scenarioId,[["","Select a scenario"],...activeRows("scenarios").filter(r=>!r.archived||U.archived||r.id===U.scenarioId).map(r=>[r.id,title(r)+(r._staged?" · staged":"")])]),
      tab=field("View","select",U.tab,[["position","Budget and cash position"],["lines","Budget lines"],["scenarios","Scenario register"]]),
      archived=field("Records","select",String(U.archived),[["false","Active"],["true","Include archived"]]);
    scenario.input.addEventListener("change",()=>{U.scenarioId=scenario.input.value;U.compareId="";U.offset=0;render().catch(failure);});
    tab.input.addEventListener("change",()=>{U.tab=tab.input.value;U.offset=0;render().catch(failure);});archived.input.addEventListener("change",()=>{U.archived=archived.input.value==="true";U.offset=0;render().catch(failure);});
    bar.append(scenario.wrapper,tab.wrapper,archived.wrapper);
    if(editable())bar.append(button("Add scenario",()=>editor("scenarios"),"primary"));
    container.append(bar);draftPanel(container);
    const current=find("scenarios",U.scenarioId);
    if(U.tab==="scenarios"){scenariosView(container);return;}
    if(!current){container.append(node("p","Add or select a scenario, then enter its full horizon and budget lines.","empty"));return;}
    const summary=panel(title(current),current.startMonth+" to "+current.endMonth+" · "+current.owner);
    summary.append(node("p",current.description||""),node("p","Review: "+current.reviewStatus+(current.reviewer?" · "+current.reviewer:""),"small"),button("Open scenario",()=>detail("scenarios",current)));
    if(editable()&&!current.archived)summary.append(button("Add budget line",()=>editor("lines")),button("Copy scenario",()=>copyScenario(current)));
    container.append(summary);
    if(U.tab==="lines")linesView(container,current);else await positionView(container,current,epoch);
  }
  return {render:renderPlanning};
}
