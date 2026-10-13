/* MIT. Explicit saved service choice to later source edition. */
export function mountDirectorySelectionRefresh({root,ui}){
 const {el,button,panel,heading,table,jsonView,formEditor,readDraft,filtered,browseRecords,browseRows,showDialog,showRow,collectionPanel,api,download,readCompleteFile,getCatalogue,actor,notify,openSelection,okToLeave}=ui;
 let dead=false,request=0,editor=null,selected=null;
 const formHost=el("div"),draftHost=el("div"),savedHost=el("div"),historyHost=el("div");
 const key=r=>r.sourceId+"\n"+r.recordId;
 const ref=r=>({sourceId:r.sourceId,recordId:r.recordId,...(r.rowSha256?{rowSha256:r.rowSha256}:{})});
 const clone=v=>JSON.parse(JSON.stringify(v));
 const current=()=>{if(dead)throw new Error("Open the current Directory refresh screen");return readDraft(editor);};
 const commit=v=>{if(dead)return;editor.set(v);renderDraft();};
 const guard=n=>{if(dead||n!==request){const e=new Error("The selected service choice changed while its original source was opening");e.name="AbortError";throw e;}};
 function starter(){
  return {label:"",actor:actor(),note:"",selectionId:"",target:{label:"",actor:actor(),note:"",editionId:"",predecessorId:null,conversionId:null,serviceRefs:[],chosenRefs:[],criteria:{},dispositions:[]},bindings:[],scopeNote:"",criteriaReason:""};
 }
 function requireTarget(v){if(!v.selectionId||!v.target?.editionId)throw new Error("Choose the saved service choice and its later directory edition first");return v.target.editionId;}
 function addTarget(v,r){
  if(!["service","HealthcareService"].includes(r.table))throw new Error("Choose an original service or HealthcareService row");
  const target=v.target,original=ref(r);target.serviceRefs??=[];target.dispositions??=[];target.chosenRefs??=[];
  if(!target.serviceRefs.some(x=>key(x)===key(original)))target.serviceRefs.push(original);
  if(!target.dispositions.some(x=>key(x.ref)===key(original)))target.dispositions.push({ref:original,decision:"needs-contact",reason:"",owner:actor()});
  return original;
 }
 function removeTarget(v,original){
  if(!original)return;const k=key(original);
  v.target.serviceRefs=(v.target.serviceRefs||[]).filter(x=>key(x)!==k);
  v.target.chosenRefs=(v.target.chosenRefs||[]).filter(x=>key(x)!==k);
  v.target.dispositions=(v.target.dispositions||[]).filter(x=>key(x.ref)!==k);
 }
 async function chooseOriginal(record){
  if(!okToLeave())return;
  const n=++request;
  const original=await api("/api/directory/selections/"+encodeURIComponent(record.id));guard(n);
  const v=starter();v.selectionId=original.id;v.label=original.label+" — later source review";
  v.target.label=original.label+" — reviewed successor";v.target.predecessorId=original.id;
  v.target.criteria=clone(original.criteria||{});
  // Source-bound refs must be selected from the later edition, not silently copied.
  delete v.target.criteria.locationRefs;delete v.target.criteria.scheduleDecisions;
  v.bindings=(original.serviceRefs||[]).map(beforeRef=>({beforeRef:clone(beforeRef),afterRef:null,reason:""}));
  selected=null;savedHost.replaceChildren();commit(v);
  notify("Original choice retained. Select the later edition and review every match or omission.");
 }
 async function chooseEdition(){
  const v=current();if(!v.selectionId)throw new Error("Choose the original saved service choice first");
  const n=request;
  await browseRecords({kind:"editions",native:false},record=>{
   guard(n);const v=current();
   if(v.target.editionId&&v.target.editionId!==record.id&&!confirm("Changing the later edition clears its candidate references, chosen services, dispositions, source-bound locations and schedule decisions. Keep the original choice and continue?"))return;
   if(v.target.editionId===record.id)return;
   v.target.editionId=record.id;v.target.conversionId=null;v.target.serviceRefs=[];v.target.chosenRefs=[];v.target.dispositions=[];
   delete v.target.criteria.locationRefs;delete v.target.criteria.scheduleDecisions;
   for(const row of v.bindings||[]){row.afterRef=null;row.reason="";}
   ++request;selected=null;savedHost.replaceChildren();commit(v);
  },"Choose the later retained directory edition");
 }
 async function match(beforeRef){
  const v=current(),edition=requireTarget(v),n=request;
  await browseRows("editions",edition,{title:"Explicitly match this original service to the later edition",onPick:r=>{
   guard(n);const next=current();if(next.target.editionId!==edition)throw new Error("The selected later edition changed; reopen its candidate rows");
   const original=ref(r),existing=(next.bindings||[]).find(x=>key(x.beforeRef)!==key(beforeRef)&&x.afterRef&&key(x.afterRef)===key(original));
   if(existing)throw new Error("This later service is already matched to a different original candidate");
   const row=next.bindings.find(x=>key(x.beforeRef)===key(beforeRef));if(!row)throw new Error("This original candidate is no longer in the working review");
   if(row.afterRef&&key(row.afterRef)!==key(original))removeTarget(next,row.afterRef);
   row.afterRef=addTarget(next,r);row.reason="";commit(next);
  }});
 }
 async function addCandidate(){
  const v=current(),edition=requireTarget(v),n=request;
  await browseRows("editions",edition,{title:"Add another candidate from the later edition",onPick:r=>{
   guard(n);const next=current();if(next.target.editionId!==edition)throw new Error("The selected later edition changed");
   addTarget(next,r);commit(next);
  }});
 }
 function renderDraft(){
  if(dead||!editor)return;const v=readDraft(editor),rows=v.bindings||[];
  draftHost.replaceChildren(panel("Original candidates and explicit source matches",[
   el("p",{text:"A blank match remains an unfinished omission until you supply its reason. A missing row in the selected later source does not establish that a service closed. The complete form below retains the target criteria, selected services and every candidate disposition."}),
   rows.length?table([{label:"Original service",get:r=>el("div",{},[el("code",{class:"cell-sub",text:r.beforeRef.recordId}),button("Read original row",()=>showRow(r.beforeRef),{kind:"small"})])},
    {label:"Later source decision",get:r=>el("div",{},[el("code",{class:"cell-sub",text:r.afterRef?.recordId||"Not carried forward — review reason required"}),el("p",{text:r.reason||"Reason not yet recorded"})])},
    {label:"Review",get:r=>el("div",{class:"actions"},[
     button("Match later service",()=>match(r.beforeRef),{kind:"small"}),
     button("Do not carry forward",()=>{const next=current(),row=next.bindings.find(x=>key(x.beforeRef)===key(r.beforeRef));removeTarget(next,row.afterRef);row.afterRef=null;row.reason="";commit(next);},{kind:"small"})
    ])}],rows):el("p",{text:"Choose a saved service choice to show every original candidate."}),
   el("div",{class:"actions"},[button("Choose later edition",chooseEdition),button("Add later candidate",addCandidate),button("Refresh working summary",renderDraft,{kind:"small"})])
  ]));
 }
 async function openSaved(id){
  const n=++request;
  const record=await api("/api/directory/selectionRefreshes/"+encodeURIComponent(id));guard(n);
  if(record.id!==id||!record.files?.["Refresh.json"])throw new Error("The retained review differs from the selected original");
  selected=record;const box=panel(record.label),rowsHost=el("div");let offset=0;
  const load=async next=>{
   offset=next;const page=await api("/api/directory/selectionRefreshes/"+id+"/rows?offset="+offset+"&limit=20");guard(n);
   rowsHost.replaceChildren(table([{label:"Source decision",get:r=>r.state},{label:"Original → later service",get:r=>(r.before?.name||"New candidate")+" → "+(r.after?.name||"Not carried forward")},
    {label:"Reason / later decision",get:r=>el("div",{},[el("p",{text:r.reason}),el("span",{text:r.after?.disposition?.decision||"No later selection"})])},
    {label:"Complete retained evidence",get:r=>button("Compare source and checks",()=>showDialog("Original and later service evidence",jsonView(r,true)),{kind:"small"})}],page.rows),
    ui.pager(page,load));
  };
  const checks=el("input",{type:"checkbox","data-testid":"selection-refresh-confirm"});
  const applyingActor=el("input",{value:actor(),maxlength:160,"aria-label":"Accepting operator"});
  const note=el("textarea",{rows:2,"aria-label":"Successor choice note"});
  const pendingKey="directory.selection-refresh.apply."+record.workspaceId+"."+id;
  let pending=null,applying=false;
  const retained=sessionStorage.getItem(pendingKey);
  if(retained){pending=JSON.parse(retained);if(pending.refreshId!==id||pending.expectedReportSha256!==record.files["Refresh.json"].sha256)throw new Error("The retained apply request belongs to a different saved report");applyingActor.value=pending.actor;note.value=pending.note||"";}

  const accept=button("Save the reviewed successor choice",async()=>{
   guard(n);if(applying)return;if(!checks.checked)throw new Error("Review the complete saved source changes and explicitly confirm this successor");
   if(!applyingActor.value.trim())throw new Error("Record the operator accepting this saved review");
   const next={refreshId:id,expectedReportSha256:record.files["Refresh.json"].sha256,confirm:true,actor:applyingActor.value.trim(),note:note.value};
   if(pending&&JSON.stringify(pending)!==JSON.stringify(next))throw new Error("The previous apply request has an unresolved response. Retry its unchanged actor and note first.");
   pending=next;sessionStorage.setItem(pendingKey,JSON.stringify(pending));applying=true;ui.setBusy(true,"Saving the reviewed successor choice");
   try{const result=await api("/api/directory/selection-refreshes/apply",{method:"POST",body:pending});guard(n);
    if(result.refreshId!==id||result.predecessorId!==record.selectionId)throw new Error("The returned successor differs from the saved review");
    sessionStorage.removeItem(pendingKey);pending=null;await ui.refreshState();guard(n);
    box.append(panel("Saved successor",[
     el("p",{text:"The original choice remains unchanged. This successor is bound to the reviewed later edition and source decisions."}),
     el("code",{class:"cell-sub",text:result.id}),
     button("Open successor service choice",()=>openSelection(result.id),{kind:"primary"})
    ]));checks.checked=false;notify("Reviewed successor saved with its original predecessor and refresh evidence.");
   }finally{applying=false;ui.setBusy(false);}
  },{kind:"primary",write:true,test:"selection-refresh-apply"});
  box.append(el("p",{text:"Read the complete service and criterion changes before saving a successor. Preparing this review does not change a referral, reserve capacity or contact a provider."}),jsonView(record.summary),rowsHost,
   el("div",{class:"actions"},Object.keys(record.files).map(name=>button("Download "+name,()=>download("/api/directory/selectionRefreshes/"+id+"/files/"+encodeURIComponent(name),name),{kind:"small"}))),
   el("details",{},[el("summary",{text:"Accept this exact saved review"}),el("label",{},[checks," I reviewed the source scope, all matches and omissions, current criteria and candidate dispositions."]),el("label",{},["Accepting operator",applyingActor]),el("label",{},["Successor note",note]),accept]),
   button("Load complete review as a working draft",async()=>{
    if(!okToLeave())return;
    const full=await readCompleteFile("/api/directory/selectionRefreshes/"+id+"/files/Input.json",record.files["Input.json"]);guard(n);
    const value=JSON.parse(await full.blob.text());guard(n);commit(value);formHost.scrollIntoView({block:"start"});
   },{kind:"small"})
  );
  savedHost.replaceChildren(box);await load(0);
 }
 async function history(){
  const n=request;const box=await collectionPanel("selectionRefreshes",{title:"Saved later-source reviews",actions:r=>[
   button("Read complete review",()=>openSaved(r.id),{kind:"small"}),
   button("Download complete report",()=>download("/api/directory/selectionRefreshes/"+r.id+"/files/Service_Choice_Refresh.zip","Service_Choice_Refresh.zip"),{kind:"small"})
  ]});if(!dead&&n===request)historyHost.replaceChildren(box);
 }
 async function open(selectionId=null){
  root.replaceChildren(heading("Refresh a saved service choice","Match every original candidate to the later provider edition, retain omissions explicitly, and review all criteria before saving a successor."),
   panel("Start from retained sources",[button("Choose saved service choice",()=>browseRecords({kind:"selections",native:false},chooseOriginal)),el("p",{text:"Source editions stay immutable. Current locations and legacy schedule interpretations must be selected again from the later edition. Unknown capacity remains unknown."})]),
   draftHost,formHost,savedHost,historyHost);
  editor=formEditor({key:"selection-refresh-prepare",title:"Complete later-source review",spec:getCatalogue().inputSchemas.selection_refresh_prepare,value:starter(),
   path:"/api/directory/selection-refreshes/prepare",submitText:"Evaluate and retain complete source review",
   after:async result=>{if(dead)return;await openSaved(result.id);await history();}});
  formHost.append(editor.root);renderDraft();await history();
  if(selectionId&&!dead)await chooseOriginal({id:selectionId});
 }
 return {open,openSaved,dispose(){dead=true;request++;selected=null;}};
}
