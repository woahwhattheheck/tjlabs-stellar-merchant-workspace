/* MIT. Original governance files, explicit mappings and retained same-operation plans. */
"use strict";
function GrantGovernanceExchange(H){
 const {state,node,button,field,table,api,runOriginal,currentEdit,render}=H;
 const SCHEMA="stellar-forge.governance-source-browser.v1",DB="grant-governance-source-working-v1";
 const copy=value=>structuredClone(value),json=value=>JSON.stringify(value,null,2);
 const names={committees:"Committees",meetings:"Meetings",decisions:"Decisions",evaluations:"Evaluations",findings:"Findings",responses:"Management responses",followups:"Follow-through"};
 let active=null,opening=null,database=null,disposed=false,closing=null;
 const owned=new Set(),urls=new Set();
 const model=()=>state().portfolio;
 function need(ok,message){if(!ok)throw Error(message);}
 function own(task){need(!disposed,"The original source desk is closing.");const p=Promise.resolve().then(task);owned.add(p);p.finally(()=>owned.delete(p)).catch(()=>{});return p;}
 function openDB(){
  if(opening)return opening;
  opening=new Promise((resolve,reject)=>{
   let failed=false;const request=indexedDB.open(DB,1);
   const fail=error=>{failed=true;reject(error);};
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("working"))request.result.createObjectStore("working");};
   request.onerror=()=>fail(request.error||Error("The source working file could not be opened."));
   request.onblocked=()=>fail(Error("Close the earlier source desk tab before upgrading its browser journal."));
   request.onsuccess=()=>{if(failed||disposed){request.result.close();if(!failed)reject(Error("The source desk closed during journal opening."));return;}
    database=request.result;database.onversionchange=()=>database.close();resolve(database);};
  });return opening;
 }
 async function journal(key,value){
  const db=await openDB();return new Promise((resolve,reject)=>{
   const tx=db.transaction("working",value===undefined?"readonly":"readwrite"),store=tx.objectStore("working");
   const req=store.get(key);let result,failure=null;
   req.onsuccess=()=>{try{
    if(value===undefined){result=req.result;return;}
    const actual=req.result?.journalRevision??0,expected=value.journalRevision??0;
    need(Number.isSafeInteger(actual)&&actual>=0&&actual===expected,"The retained source working file changed in another tab. Reopen that complete original before replacing it.");
    result={...value,journalRevision:actual+1};store.put(result,key);
   }catch(error){failure=error;tx.abort();}};
   tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(failure||tx.error||req.error||Error("The complete source journal write failed."));
   tx.onabort=()=>reject(failure||tx.error||Error("The complete source journal write was interrupted."));
  });
 }
 function download(name,body,type="application/json"){
  const url=URL.createObjectURL(new Blob([body],{type}));urls.add(url);const a=node("a");a.href=url;a.download=name;document.body.append(a);
  try{a.click();}finally{a.remove();setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},30000);}
 }
 function selection(){const p=model();need(p?.definition?.programme,"Open the original programme portfolio first.");
  return {workspaceId:state().state.workspaceId,portfolioId:p.id,revision:p.revision,snapshot:p.snapshot};}
 function current(s){return !state().pending&&currentEdit()&&model()?.id===s.portfolioId&&model()?.revision===s.revision&&model()?.snapshot===s.snapshot;}
 function message(d,value,error=false){d.status.textContent=value;d.status.className=error?"governance-error":"small";d.status.hidden=false;}
 function closeDialog(){if(!active)return true;const d=active;if(d.busy){message(d,"Wait for the original source operation to settle before closing.",true);return false;}
  if(d.dirty&&!confirm("Close these fields? The last complete saved working file remains available."))return false;
  d.controller.abort();d.dialog.close();d.dialog.remove();active=null;return true;}
 function makeDialog(title){
  need(closeDialog(),"Keep the current source operation open.");const dialog=node("dialog",null,"governance-dialog"),head=node("header"),body=node("fieldset",null,"governance-dialog-body"),status=node("p","","small");
  body.style.border="0";body.style.padding="0";body.style.minWidth="0";status.setAttribute("role","alert");status.hidden=true;head.append(node("h2",title),button("Close",closeDialog));dialog.append(head,status,body);document.body.append(dialog);
  const d={dialog,body,status,controller:new AbortController(),busy:false,dirty:false,generation:0,saveTail:Promise.resolve(),value:null};active=d;
  dialog.addEventListener("cancel",e=>{e.preventDefault();closeDialog();});dialog.showModal();return d;
 }
 function lock(d,value){d.busy=value;d.body.disabled=value;
  if(!value&&d.value&&d.prepare){const immutable=!!(d.value.pending||d.value.result);
   if(immutable)for(const part of [d.form,d.mapping])for(const control of part?.querySelectorAll("input,select,textarea,button")||[])control.disabled=true;
   d.prepare.disabled=immutable;d.send.disabled=!d.value.plan;}}
 async function work(d,fn){if(d.busy)return;lock(d,true);try{return await fn();}catch(error){message(d,error.message||String(error),true);throw error;}finally{if(active===d)lock(d,false);}}
 function buttonTask(d,label,fn){return button(label,()=>own(()=>work(d,fn)).catch(()=>{}));}
 function pinText(p){return p?p.id+" · expected revision "+p.expectedRevision:"New record";}
 function selectedRecord(d){return d.portfolio.definition.governance?.records[d.value.input.collection]||[];}
 function remember(d){
  const frozen=copy(d.value);d.saveTail=d.saveTail.catch(()=>{}).then(()=>journal(d.key,frozen));
  return d.saveTail.then(saved=>{d.value.journalRevision=saved.journalRevision;if(active===d)d.dirty=false;});
 }
 function readPointer(row,path){
  if(path==="")return row;need(path.startsWith("/"),"Use an exact JSON pointer beginning with /.");
  let value=row;for(const part of path.slice(1).split("/")){need(!/~(?:[^01]|$)/.test(part),"Use valid JSON pointer escapes.");const key=part.replace(/~1/g,"/").replace(/~0/g,"~");
   need(value!==null&&typeof value==="object"&&Object.hasOwn(value,key),"The record-key pointer is absent: "+path);value=value[key];}return value;
 }
 function getKey(row,rule){const value=Object.hasOwn(rule,"column")?row[rule.column]:readPointer(row,rule.pointer);
  need(typeof value==="string"&&value.trim(),"Choose a nonempty original text value as each stable record key.");return value;}
 function collect(d){
  const input=d.value.input,c=d.controls;input.actor=c.actor.input.value;input.filename=c.filename.input.value;input.nodeId=c.node.input.value;input.grantId=c.grant.input.value||null;
  input.collection=c.collection.input.value;input.selection=c.format.input.value==="csv"?{format:"csv"}:{format:"json",recordsPointer:c.pointer.input.value};
 }
 function invalidate(d){need(!d.value.pending&&!d.value.result,"Reopen the original request or start a separately reviewed import before changing these fields.");
  if(d.value.plan){d.value.input.operationId="governance-source-"+crypto.randomUUID();d.value.input.documentId=crypto.randomUUID();}
  d.value.plan=null;d.dirty=true;d.preview.replaceChildren();d.send.disabled=true;}
 function raw(title,value){const details=node("details");details.append(node("summary",title),node("pre",json(value)));return details;}
 function identityControls(d,rows){
  const section=node("section"),body=node("div"),keyInput=field("Original record key",d.parsed.headers?"select":"text",d.value.input.recordKey?.column??d.value.input.recordKey?.pointer??"",
   d.parsed.headers?[["","Choose original header"],...d.parsed.headers.map(h=>[h,h])]:undefined);
  section.append(node("h3","Original record keys and stable identities"),keyInput.wrapper,
   node("p","Choose the original key, then create new draft identities or select actual saved drafts and recorded predecessors. Every source row remains in this operation.","small"));
  let page=0;
  function paint(){
   body.replaceChildren();const identities=d.value.input.identities||{},originals=selectedRecord(d),start=page*20;
   for(let i=start;i<Math.min(rows.length,start+20);i++){
    const row=rows[i],key=getKey(row,d.value.input.recordKey),entry=identities[key];need(entry,"Build the complete stable identity map first.");
    const box=node("fieldset"),title=node("legend",(i+1)+". "+key),mode=field("Target","select",entry.expectedRevision?"draft":entry.supersedesId?"following":"new",[["new","New draft"],["draft","Existing draft"],["following","Following recorded edition"]]);
    const targets=field("Actual original record","select",entry.expectedRevision?entry.id:entry.supersedesId||"",[["","Choose original record"]]);
    function options(){const eligible=originals.filter(r=>!r.archived&&r.nodeId===d.value.input.nodeId&&(r.grantId??null)===(d.value.input.grantId??null)&&r.status===(mode.input.value==="draft"?"draft":"recorded"));
     targets.input.replaceChildren();for(const [id,label]of [["","Choose original record"],...eligible.map(r=>[r.id,r.title+" · r"+r.revision+" · "+r.id])]){const o=node("option",label);o.value=id;targets.input.append(o);}
     targets.input.value=entry.expectedRevision?entry.id:entry.supersedesId||"";targets.wrapper.hidden=mode.input.value==="new";}
    const identity=node("p",pinText(entry),"small");
    function update(){if(mode.input.value==="new"){entry.id=crypto.randomUUID();entry.expectedRevision=0;delete entry.supersedesId;}
     else{const original=originals.find(r=>r.id===targets.input.value);if(!original){entry.id="";entry.expectedRevision=0;delete entry.supersedesId;invalidate(d);identity.textContent="Choose the actual original target before preparing.";return;}
      entry.id=mode.input.value==="draft"?original.id:crypto.randomUUID();entry.expectedRevision=mode.input.value==="draft"?original.revision:0;
      if(mode.input.value==="following")entry.supersedesId=original.id;else if(original.supersedesId)entry.supersedesId=original.supersedesId;else delete entry.supersedesId;}
     identity.textContent=pinText(entry);invalidate(d);}
    mode.input.addEventListener("change",()=>{options();if(mode.input.value==="new")update();else{entry.id="";entry.expectedRevision=0;delete entry.supersedesId;identity.textContent="Choose the actual original target before preparing.";invalidate(d);}});
    targets.input.addEventListener("change",update);options();box.append(title,mode.wrapper,targets.wrapper,identity,raw("Complete original row",row));body.append(box);
   }
   const nav=node("div",null,"actions"),prev=button("Previous rows",()=>{page=Math.max(0,page-1);paint();}),next=button("Next rows",()=>{page=Math.min(Math.max(0,Math.ceil(rows.length/20)-1),page+1);paint();});prev.disabled=page===0;next.disabled=start+20>=rows.length;
   nav.append(prev,node("span",(start+1)+"–"+Math.min(rows.length,start+20)+" of "+rows.length),next);body.append(nav);
  }
  function build(){collect(d);const rule=d.parsed.headers?{column:keyInput.input.value}:{pointer:keyInput.input.value};const keys=rows.map(row=>getKey(row,rule));
   need(new Set(keys).size===keys.length,"The selected original key repeats; choose a distinct original key.");
   const previous=d.value.input.identities||{};d.value.input.recordKey=rule;d.value.input.identities=Object.fromEntries(keys.map(key=>[key,Object.hasOwn(previous,key)?previous[key]:{id:crypto.randomUUID(),expectedRevision:0}]));
   invalidate(d);page=0;paint();}
  section.append(buttonTask(d,"Build / reopen complete identity map",build),body);
  if(d.value.input.recordKey&&Object.keys(d.value.input.identities||{}).length===rows.length){try{paint();}catch(error){message(d,error.message,true);}}
  return section;
 }
 function mappingControls(d){
  const section=node("section");section.append(node("h3","Map complete original fields"),node("p","Unused fields retain the current draft or predecessor. New records start with the original model defaults. JSON cells retain complete arrays and objects.","small"));
  d.mappingControls={};
  for(const [key,spec]of Object.entries(d.schema.fields[d.value.input.collection])){
   if(["nodeId","grantId","supersedesId"].includes(key))continue;
   const rule=d.value.input.mapping[key],kind=rule?(Object.hasOwn(rule,"value")?"constant":d.parsed.headers?"column":"pointer"):"unused";
   const box=node("fieldset"),mode=field(key+" mapping","select",kind,[["unused","Keep original / default"],[d.parsed.headers?"column":"pointer",d.parsed.headers?"Original CSV header":"Original JSON pointer"],["constant","Supplied constant JSON"]]);
   const value=field(key+" value",d.parsed.headers&&kind!=="constant"?"text":"text",rule?Object.hasOwn(rule,"value")?JSON.stringify(rule.value):rule.column??rule.pointer:"");
   const encoding=field(key+" representation","select",rule?.encoding??"text",[["text","Literal text"],["json","Complete JSON value"]]);
   const empty=field(key+" blank value","select",rule?.empty??"literal",[["literal","Keep empty string"],["null","Explicit null"],["array","Empty array"]]);
   if(d.parsed.headers){const list=node("datalist");list.id="governance-columns-"+crypto.randomUUID();for(const header of d.parsed.headers){const option=node("option");option.value=header;list.append(option);}value.input.setAttribute("list",list.id);box.append(list);}
   const hint=node("p",Array.isArray(spec)?"Allowed values: "+spec.join(", "):"Original field type: "+spec,"small");
   box.append(node("legend",key),hint,mode.wrapper,value.wrapper,encoding.wrapper,empty.wrapper);section.append(box);
   function show(){value.wrapper.hidden=mode.input.value==="unused";encoding.wrapper.hidden=empty.wrapper.hidden=mode.input.value==="unused"||mode.input.value==="constant";}
   mode.input.addEventListener("change",()=>{show();invalidate(d);});for(const f of [value,encoding,empty])f.input.addEventListener("input",()=>invalidate(d));show();
   d.mappingControls[key]={read(){if(mode.input.value==="unused")return null;
    if(mode.input.value==="constant")return {value:JSON.parse(value.input.value)};
    return {[mode.input.value]:value.input.value,encoding:encoding.input.value,...(empty.input.value==="literal"?{}:{empty:empty.input.value})};}};
  }
  return section;
 }
 function collectMapping(d){d.value.input.mapping=Object.fromEntries(Object.entries(d.mappingControls||{}).map(([key,c])=>[key,c.read()]).filter(([,rule])=>rule!==null));}
 function showPreview(d){
  d.preview.replaceChildren();const plan=d.value.plan;if(!plan)return;
  d.preview.append(node("h3","Complete original import plan"),node("p",plan.rows.length+" source records · "+plan.source.bytes+" bytes · "+plan.source.sha256,"small"),
   node("p","Portfolio revision "+plan.portfolio.revision+" · action "+plan.actionSha256,"small"));
  let page=0;const records=node("div");function paint(){records.replaceChildren();const start=page*20;
   for(const row of plan.rows.slice(start,start+20))records.append(raw((row.index+1)+". "+row.key+" → "+row.change.fields.title,{original:row.original,before:row.before,supersedes:row.supersedes,proposed:row.change}));
   const prev=button("Previous preview",()=>{page--;paint();}),next=button("Next preview",()=>{page++;paint();});prev.disabled=page===0;next.disabled=start+20>=plan.rows.length;
   records.append(prev,node("span"," "+(start+1)+"–"+Math.min(start+20,plan.rows.length)+" of "+plan.rows.length+" "),next);}
  paint();d.preview.append(records,raw("Complete retained mapping and original action",plan));d.send.disabled=false;
 }
 async function inspect(d,{collectFields=true}={}){
  if(collectFields&&!d.value.plan){collect(d);collectMapping(d);}need(d.value.source instanceof Uint8Array,"Select the complete original file first.");
  d.parsed=d.exchange.inspect(d.value.source,d.value.input.selection);d.mapping.replaceChildren(mappingControls(d),identityControls(d,d.parsed.rows));showPreview(d);
  message(d,d.parsed.rows.length+" complete original rows loaded. Map fields and choose stable identities before preparing.");
 }
 async function adapter(){const M=await import("/governance-exchange-core.mjs");return M.createGovernanceExchange({sha256:async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),v=>v.toString(16).padStart(2,"0")).join("")});}
 const client={
  portfolio:(id,options)=>api("/api/portfolio?"+new URLSearchParams({id,revision:options.revision}),{signal:options.signal}),
  uploadProgrammeDocument:({body,bytes,sha256},options)=>api("/api/programme/upload",{method:"POST",body,headers:{"content-type":"application/octet-stream","x-content-sha256":sha256},signal:options?.signal}),
  action:request=>runOriginal(request),
 };
 async function open(collection="committees",scope={}){
  return own(async()=>{
   const s=selection(),d=makeDialog("Original governance source import");d.selection=s;d.portfolio=copy(model());d.key=s.workspaceId+":"+s.portfolioId;
   await work(d,async()=>{
    d.exchange=await adapter();d.schema=await api("/api/governance/schema",{signal:d.controller.signal});if(active!==d||d.controller.signal.aborted)return;
    d.value={schema:SCHEMA,workspaceId:s.workspaceId,portfolioId:s.portfolioId,selection:s,source:null,plan:null,pending:false,result:null,
     input:{operationId:"governance-source-"+crypto.randomUUID(),actor:"",filename:"",documentId:crypto.randomUUID(),nodeId:scope.nodeId||"",grantId:scope.grantId||null,collection:names[collection]?collection:"committees",selection:{format:"csv"},recordKey:null,mapping:{},identities:{}}};
    const top=node("div",null,"actions");top.append(buttonTask(d,"Reopen saved source working file",async()=>{const value=await journal(d.key);need(value,"No retained source working file exists for this portfolio.");await adopt(d,value);}),
     buttonTask(d,"Keep complete working file",async()=>{if(!d.value.plan){collect(d);collectMapping(d);}await remember(d);message(d,"Complete original bytes, fields, identities and plan retained for this workspace.");}),
     buttonTask(d,"Download complete working file",()=>{if(!d.value.plan){collect(d);collectMapping(d);}const value=copy(d.value);value.source_base64=value.source?toBase64(value.source):null;delete value.source;download("Governance_Source_Working.json",json(value)+"\n");}));
    top.append(buttonTask(d,"Start a separately reviewed import",async()=>{
     if(d.value.pending){const request=await api("/api/request?id="+encodeURIComponent(d.value.plan.action.operationId),{signal:d.controller.signal});
      need(request.state!=="RUNNING","Keep the original running operation until it returns its outcome.");}
     if((d.value.pending||d.value.result||d.dirty)&&!confirm("Download and retain the complete original working file, then open a new review on the current portfolio?"))return;
     if(d.value.source){if(!d.value.plan){collect(d);collectMapping(d);}const retained=copy(d.value);retained.source_base64=toBase64(retained.source);delete retained.source;download("Governance_Source_Previous_Working.json",json(retained)+"\n");}
     need(!state().pending,"Continue the host's original pending operation first.");
     const now=selection();need(current(now),"Select the current editable portfolio revision.");
     const journalRevision=d.value.journalRevision??0;d.portfolio=copy(model());d.selection=now;d.value={journalRevision,schema:SCHEMA,workspaceId:now.workspaceId,portfolioId:now.portfolioId,selection:now,source:null,plan:null,pending:false,result:null,
      input:{operationId:"governance-source-"+crypto.randomUUID(),actor:"",filename:"",documentId:crypto.randomUUID(),nodeId:scope.nodeId||"",grantId:scope.grantId||null,collection:names[collection]?collection:"committees",selection:{format:"csv"},recordKey:null,mapping:{},identities:{}}};
     d.mappingControls={};d.mapping.replaceChildren();d.preview.replaceChildren();paintForm(d);await remember(d);message(d,"New original source review opened. The previous full working file was offered for download.");
    }));d.body.append(top);
    const reopen=field("Open a complete downloaded working file","file");reopen.input.accept=".json,application/json";
    reopen.input.addEventListener("change",()=>{const original=reopen.input.files?.[0];if(!original)return;own(()=>work(d,async()=>{need(original.size<=48*1024*1024,"Select a complete source working file up to 48 MiB.");
     const value=JSON.parse(await original.text());if(active!==d)return;value.source=value.source_base64?fromBase64(value.source_base64):null;delete value.source_base64;await adopt(d,value);})).catch(()=>{});});d.body.append(reopen.wrapper);
    d.form=node("div");d.mapping=node("div");d.preview=node("div");d.body.append(d.form,d.mapping,d.preview);
    d.send=buttonTask(d,"Submit / reopen this original plan",async()=>{
     need(d.value.plan,"Prepare and retain the complete original plan first.");need(!state().pending||state().pending.operationId===d.value.plan.action.operationId,"Continue the other original operation before this plan.");
     const frozen=copy(d.value);await d.exchange.reopen(client,frozen.plan,frozen.source,{signal:d.controller.signal});
     d.value.pending=true;await remember(d);
     const result=await d.exchange.submit(client,frozen.plan,frozen.source,{signal:d.controller.signal});
     d.value.result=copy(result);d.value.pending=false;await remember(d);message(d,"The original complete source and governance changes are saved. Portfolio revision "+result.revision+".");
    });d.send.disabled=true;
    d.prepare=buttonTask(d,"Prepare complete original plan",async()=>{need(!d.value.pending,"Reopen the original pending plan before preparing another.");
     need(current(d.selection),"Select the original current revision, or reopen the saved plan for its original request.");
     if(!d.value.plan){collect(d);collectMapping(d);}d.value.plan=await d.exchange.prepare(d.portfolio,d.value.input,d.value.source);await remember(d);showPreview(d);message(d,"Every original row and proposed change is retained. Review the complete plan before submitting.");});d.body.append(d.prepare,d.send);
    paintForm(d);const retained=await journal(d.key);if(retained)await adopt(d,retained);else message(d,"Choose an original file and its representation. All source rows are retained.");
   });
  });
 }
 function paintForm(d){
  d.form.replaceChildren();const value=d.value.input,programme=d.portfolio.definition.programme.records,c={};
  c.collection=field("Governance register","select",value.collection,Object.entries(names));
  c.actor=field("Actual recording actor","text",value.actor);c.filename=field("Document download filename","text",value.filename);c.node=field("Programme / project","select",value.nodeId,[["","Choose original node"],...programme.nodes.filter(r=>!r.archived).map(r=>[r.id,r.title||r.name||r.id])]);
  c.grant=field("Grant (optional)","select",value.grantId||"",[["","Programme scope"],...programme.grants.filter(r=>!r.archived).map(r=>[r.id,r.title||r.name||r.id])]);
  c.format=field("Original representation","select",value.selection.format,[["csv","CSV"],["json","JSON"]]);c.pointer=field("JSON array pointer","text",value.selection.recordsPointer||"");
  const file=field("Complete original source file","file");file.input.accept=".csv,.json,text/csv,application/json";d.controls=c;
  const receipt=node("p",d.value.source?value.filename+" · "+d.value.source.byteLength+" original bytes":"No original source selected","small");
  for(const control of Object.values(c)){control.input.addEventListener("input",()=>{invalidate(d);});d.form.append(control.wrapper);}
  for(const control of [c.collection,c.node,c.grant,c.format,c.pointer])control.input.addEventListener("change",()=>{collect(d);d.value.input.identities={};d.value.input.mapping={};d.value.input.recordKey=null;d.mappingControls={};d.mapping.replaceChildren();invalidate(d);});
  file.input.addEventListener("change",()=>{const original=file.input.files?.[0],generation=++d.generation;if(!original)return;
   own(()=>work(d,async()=>{need(!d.value.pending,"Continue the retained pending source plan first.");need(original.size>0&&original.size<=8*1024*1024,"Select a complete original source up to 8 MiB.");
    const bytes=new Uint8Array(await original.arrayBuffer());if(active!==d||generation!==d.generation)return;
    d.value.source=bytes;d.value.originalFilename=original.name;d.value.input.filename=original.name;c.filename.input.value=original.name;d.value.input.documentId=crypto.randomUUID();d.value.input.operationId="governance-source-"+crypto.randomUUID();
    d.value.input.identities={};d.value.input.mapping={};d.value.input.recordKey=null;d.mappingControls={};invalidate(d);receipt.textContent=original.name+" · "+bytes.length+" original bytes";await inspect(d);
   })).catch(()=>{});});
  d.form.append(file.wrapper,receipt,buttonTask(d,"Inspect complete source / reopen mapping",()=>inspect(d)));
 }
 async function adopt(d,value){
  need(value?.schema===SCHEMA&&value.workspaceId===d.selection.workspaceId&&value.portfolioId===d.selection.portfolioId,"Select the original source working file for this workspace and portfolio.");
  need(!d.value.pending||d.value.plan?.action.operationId===value.plan?.action.operationId,"Continue the original pending plan before opening a different source working file.");
  const retained=await journal(d.key);
  need(!retained?.pending||retained.plan?.action.operationId===value.plan?.action.operationId,"A retained original source plan is pending. Reopen it before replacing this browser working file.");
  const pendingOriginal=d.value.pending?d.value:retained?.pending?retained:null;
  if(pendingOriginal){need(JSON.stringify(pendingOriginal.plan)===JSON.stringify(value.plan),"Keep the complete original pending plan; a same-ID file cannot replace its input.");
   value={...copy(value),pending:true};}
  need(value.source===null||value.source instanceof Uint8Array&&value.source.length>0&&value.source.length<=8*1024*1024,"Retain the complete original source bytes or a field-only working draft.");
  need(!value.plan&&!value.pending&&!value.result||value.source instanceof Uint8Array,"A prepared or pending plan requires its complete original source bytes.");
  need(value.selection?.portfolioId===d.selection.portfolioId,"Keep the original portfolio selection.");
  const historical=await client.portfolio(value.selection.portfolioId,{revision:value.selection.revision,signal:d.controller.signal});
  need(historical.snapshot===value.selection.snapshot,"The complete original source selection changed.");
  need(!value.pending||value.plan,"Retain the original complete pending import plan.");
  if(value.plan){need(JSON.stringify(value.input)===JSON.stringify(value.plan.input),"The working fields differ from their complete original plan.");
   need(value.plan.portfolio.id===value.selection.portfolioId&&value.plan.portfolio.revision===value.selection.revision&&value.plan.portfolio.snapshot===value.selection.snapshot,"The working file selects another original plan revision.");
   await d.exchange.verify(historical,value.plan,value.source);}
  if(active!==d||d.controller.signal.aborted)return;
  if(d.dirty&&!confirm("Replace these unsaved fields with the selected complete working file?"))return;
  d.value={...copy(value),journalRevision:retained?.journalRevision??0};d.portfolio=historical;d.selection=copy(value.selection);paintForm(d);d.mappingControls={};d.mapping.replaceChildren();d.preview.replaceChildren();if(d.value.source)await inspect(d,{collectFields:false});await remember(d);
  message(d,value.pending?"Original pending plan recovered. Continue that exact request.":"Complete source working file reopened against its original revision.");
 }
 function toBase64(bytes){let value="";for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value);}
 function fromBase64(value){need(typeof value==="string"&&value.length<=12*1024*1024,"Select a bounded complete source encoding.");const raw=atob(value),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));need(toBase64(bytes)===value,"Keep the exact complete base64 encoding.");return bytes;}
 async function exportFile(collection,format="json",scope={}){
  return own(async()=>{const portfolio=copy(model()),exchange=await adapter();const file=await exchange.exportRecords(portfolio,{...(names[collection]?{collection}:{}),...scope,format});
   download(file.filename,file.content,file.contentType);return {...file,content:undefined};});
 }
 async function close(){
  if(closing)return closing;if(active?.busy)throw Error("Complete the original source operation before closing its host.");
  if(active&&!closeDialog())throw Error("Keep the source editor open or explicitly close its unsaved fields.");
  disposed=true;window.removeEventListener("beforeunload",beforeUnload);closing=(async()=>{while(owned.size)await Promise.allSettled([...owned]);if(opening){try{await opening;}catch{}}
   if(database){database.close();database=null;}for(const url of urls)URL.revokeObjectURL(url);urls.clear();})().catch(error=>{closing=null;throw error;});return closing;
 }
 function beforeUnload(event){if(active?.busy||active?.dirty){event.preventDefault();event.returnValue="";}}
 window.addEventListener("beforeunload",beforeUnload);
 return Object.freeze({open,export:exportFile,close});
}
