/* MIT. Award administration on the original saved portfolio workspace. */
"use strict";
function GrantAwardsConsole(H) {
  const {state,node,button,field,panel,heading,metric,table,api,action,render,failure,showDialog,currentEdit,rawDetails,sourceName}=H;
  const U={register:"queue",roundId:"",applicationId:"",search:"",archived:false,offset:0,actor:"",schema:null,selection:null};
  const names={rounds:"Funding rounds",applications:"Applications",checks:"Eligibility and due diligence",
    assignments:"Assessor assignments",assessments:"Assessments",decisions:"Panel decisions",
    agreements:"Award agreements",claims:"Claims and reconciliation",monitoring:"Monitoring returns"};
  const labels={programmeNodeId:"Programme or project",partnerId:"Applicant partner",projectId:"Delivery project",
    applicationId:"Application",roundId:"Funding round",assignmentId:"Assessor assignment",decisionId:"Panel decision",
    agreementId:"Award agreement",grantId:"Programme grant",agreementDocumentId:"Agreement document",
    recipientPartnerId:"Award recipient",claimId:"Original submitted claim",supersedesId:"Earlier recorded edition",
    sourceRefs:"Original source records",financialRefs:"Original financial rows",evidenceIds:"Evidence documents",
    checkIds:"Recorded eligibility and due diligence",assessmentIds:"Submitted assessments",observationIds:"Reported results",
    milestoneIds:"Programme milestones",requestedAmount:"Requested amount",conflictDisclosure:"Conflict disclosure",
    conflictResolution:"Conflict decision",applicantProfile:"Applicant profile",submittedDate:"Submission date",
    recordedDate:"Date recorded",opensDate:"Opening date",closesDate:"Closing date",minimum:"Minimum score",maximum:"Maximum score"};
  const human=k=>labels[k]||String(k).replace(/([a-z])([A-Z])/g,"$1 $2").replace(/[-_]/g," ").replace(/^./,x=>x.toUpperCase());
  const p=()=>state().portfolio, model=()=>p()?.definition.awards, programme=()=>p()?.definition.programme;
  const rows=name=>model()?.records[name]||[];
  const prows=name=>programme()?.records[name]||[];
  const find=(name,id)=>rows(name).find(r=>r.id===id);
  const title=r=>{
    if(!r)return "No selection";
    if(r.title||r.legalName||r.name)return [r.code||r.reference,r.title||r.legalName||r.name].filter(Boolean).join(" · ");
    return [r.kind?human(r.kind):null,r.assessor||r.owner||r.reviewer||r.reportedBy,r.id?.slice(0,8)].filter(Boolean).join(" · ");
  };
  const selection=()=>({portfolioId:p().id,revision:p().revision});
  const query=extra=>new URLSearchParams({...selection(),...extra}).toString();
  const editable=()=>!!p()&&currentEdit()&&!state().pending;
  const isFrozen=r=>!!r&&r.status!=="draft";
  function assertCurrent(s) {
    if(!p()||p().id!==s.portfolioId||p().revision!==s.revision||!editable())
      throw new Error("Open the latest selected portfolio revision and finish the pending operation before saving.");
  }
  function identity() {
    const key=p()?.id+":"+p()?.snapshot;if(U.selection===key)return;
    U.selection=key;U.offset=0;
    if(!find("rounds",U.roundId))U.roundId="";
    if(!find("applications",U.applicationId))U.applicationId="";
    if(!U.actor)U.actor=p()?.review.reviewer||"";
  }
  function relation(name,row) {
    if(name==="rounds")return {roundId:row.id,applicationId:null};
    if(name==="applications")return {roundId:row.roundId,applicationId:row.id};
    if(["checks","assignments","decisions"].includes(name)){
      const a=find("applications",row.applicationId);return {roundId:a?.roundId,applicationId:a?.id};
    }
    if(name==="assessments")return relation("assignments",find("assignments",row.assignmentId)||{});
    if(name==="agreements")return relation("decisions",find("decisions",row.decisionId)||{});
    return relation("agreements",find("agreements",row.agreementId)||{});
  }
  function recordRows(name) {
    const q=U.search.toLocaleLowerCase();
    return rows(name).filter(r=>{
      const rel=relation(name,r);
      return (U.archived||!r.archived)&&(!U.roundId||rel.roundId===U.roundId)&&
        (!U.applicationId||name==="rounds"||rel.applicationId===U.applicationId)&&
        (!q||[title(r),r.owner,r.assessor,r.status,r.outcome,r.notes,r.reasons,r.narrative].join(" ").toLocaleLowerCase().includes(q));
    }).sort((a,b)=>title(a).localeCompare(title(b))||a.id.localeCompare(b.id));
  }
  function referenceTarget(name,key) {
    if(key==="supersedesId")return {name,programme:false};
    const local={roundId:"rounds",applicationId:"applications",assignmentId:"assignments",decisionId:"decisions",
      agreementId:"agreements",claimId:"claims",checkIds:"checks",checkId:"checks",assessmentIds:"assessments",assessmentId:"assessments"};
    if(local[key])return {name:local[key],programme:false};
    return {name:({programmeNodeId:"nodes",projectId:"nodes",partnerId:"partners",recipientPartnerId:"partners",
      grantId:"grants",agreementDocumentId:"documents",evidenceIds:"documents",evidenceId:"documents",observationIds:"observations",
      observationId:"observations",milestoneIds:"milestones",milestoneId:"milestones"})[key]||"documents",programme:true};
  }
  function referenceControl(name,key,value,{multiple=false,required=false,exclude=null}={}) {
    const target=referenceTarget(name,key), pool=target.programme?prows(target.name):rows(target.name);
    const chosen=new Set(multiple?value||[]:value?[value]:[]);
    const wrapper=node("div",null,"awards-reference"), search=field("Find "+human(key),"search");
    const choices=node("select"), selectedList=node("div",null,"awards-selected");choices.setAttribute("aria-label",human(key));
    let term="";
    function renderSelected() {
      selectedList.replaceChildren();
      for(const id of chosen){const r=pool.find(r=>r.id===id), line=node("div",null,"programme-chip");
        line.append(node("span",r?title(r)+(r.archived?" · archived":""):id),
          button("Remove",()=>{chosen.delete(id);renderSelected();}));selectedList.append(line);}
      if(!chosen.size)selectedList.append(node("p","No selection","small"));
    }
    function searchChoices() {
      choices.replaceChildren();const hint=node("option","Choose a record");hint.value="";choices.append(hint);
      let count=0;
      for(const r of pool){
        if(r.id===exclude||r.archived||key==="projectId"&&r.kind!=="project"||
          key==="claimId"&&r.kind!=="submission"||key==="agreementDocumentId"&&r.category!=="agreement")continue;
        if(term&&!title(r).toLocaleLowerCase().includes(term))continue;
        count++;
        if(count<=80){const o=node("option",title(r)+(r.status?" · "+human(r.status):""));o.value=r.id;choices.append(o);}
      }
      note.textContent=count>80?count+" matches; refine the search to select any matching record.":count+" matching records";
    }
    const note=node("p","","small");
    search.input.addEventListener("input",()=>{term=search.input.value.toLocaleLowerCase();searchChoices();});
    choices.addEventListener("change",()=>{if(!choices.value)return;if(!multiple)chosen.clear();chosen.add(choices.value);renderSelected();choices.value="";});
    wrapper.append(selectedList,search.wrapper,choices,note);renderSelected();searchChoices();
    return {wrapper,read(){if(required&&!chosen.size)throw new Error("Select "+human(key)+".");
      return multiple?[...chosen]:[...chosen][0]||null;}};
  }
  function sourcePicker(value,s,financial=false) {
    const wrapper=node("div"), chosen=new Map((value||[]).map(r=>[r.sourceId+":"+(r.rowKey||r.entityKey),r]));
    const selectedList=node("div"), search=field(financial?"Find original financial rows":"Find original source records","search"), results=node("div");
    const originalSnapshot=p().snapshot;let epoch=0,term="",offset=0;
    function paint(){selectedList.replaceChildren();for(const [key,r]of chosen){const line=node("div",null,"programme-chip");
      line.append(node("span",sourceName(r.sourceId)+" · "+(r.rowKey||r.entityKey).slice(0,16)),
        button("Remove",()=>{chosen.delete(key);paint();}));selectedList.append(line);}
      if(!chosen.size)selectedList.append(node("p","No original rows selected.","small"));}
    async function page(next=0){
      const call=++epoch,qs=new URLSearchParams({...s,offset:next,limit:50,search:term,...(financial?{}:{table:"entities"})});
      const data=await api((financial?"/api/awards/financial?":"/api/rows?")+qs);
      if(call!==epoch)return;if(data.snapshot!==originalSnapshot)throw new Error("The original source selection changed.");
      offset=next;
      results.replaceChildren(table(financial?["Original meaning","Amount","Source edition","Select"]:["Original record","Source edition","Select"],
        data.rows.map(item=>{
          const row=financial?item.record:item,ref=financial?item.reference:{sourceId:row.sourceId,entityKey:row.entityKey,sha256:row.sha256};
          const add=button("Select original row",()=>{chosen.set(ref.sourceId+":"+(ref.rowKey||ref.entityKey),ref);paint();});
          return financial?[human(row.kind)+" · "+Object.entries(row.dimensions||{}).map(([k,v])=>human(k)+": "+v).join(" · "),
            (row.value??"Missing")+" "+(row.currency||""),sourceName(row.sourceId),add]:
            [row.title||row.originalId||row.entityKey,sourceName(row.sourceId),add];
        })));
      const prev=button("Previous",()=>page(Math.max(0,offset-50))),nextButton=button("Next",()=>page(data.nextOffset));
      prev.disabled=offset===0;nextButton.disabled=data.nextOffset===null;
      const nav=node("div",null,"actions");nav.append(prev,nextButton,node("span",data.total+" matching rows","small"));results.append(nav);
    }
    const apply=()=>{term=search.input.value;return page();};
    search.input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();apply().catch(failure);}});
    wrapper.append(selectedList,search.wrapper,button("Search original rows",apply),results);paint();
    return {wrapper,read:()=>[...chosen.values()]};
  }
  const nested={
    criteria:{id:"short",title:"short",kind:["score","eligibility"],required:"bool",minimum:"decimal?",maximum:"decimal?",weight:"decimal?",guidance:"text"},
    applicantProfile:{legalName:"short",organisationIdentifier:"short?",contactName:"short?",contactEmail:"email?",country:"short?",summary:"text"},
    answers:{criterionId:"short",response:"text"},
    items:{criterionId:"short?",title:"short",outcome:["undetermined","pass","fail","query"],reason:"text",evidenceIds:"ids"},
    conflictDisclosure:{state:["undisclosed","none","declared"],details:"text",evidenceIds:"ids"},
    conflictResolution:{outcome:["pending","clear","recused"],decidedBy:"short?",reason:"text",date:"date?"},
    scores:{criterionId:"short",value:"decimal?",reason:"text",evidenceIds:"ids"},
    panel:{member:"short",role:"short",conflictState:["none","declared","recused"],reason:"text"}
  };
  const repeated=new Set(["criteria","answers","items","scores","panel"]);
  function objectControl(name,key,value,s,record) {
    const wrapper=node("div",null,"awards-object"), controls={};
    for(const [k,spec]of Object.entries(nested[key])){
      controls[k]=control(name,k,spec,value?.[k],s,record,{nested:true,required:false});
      wrapper.append(controls[k].wrapper);
    }
    return {wrapper,read:()=>Object.fromEntries(Object.entries(controls).map(([k,c])=>[k,c.read()]))};
  }
  function repeater(name,key,value,s,record) {
    const wrapper=node("div",null,"awards-repeat"), items=node("div");let entries=[];
    const add=(v={})=>{const box=node("section",null,"awards-repeat-row"), c=objectControl(name,key,v,s,record);
      const item={box,control:c};entries.push(item);box.append(c.wrapper,button("Remove row",()=>{
        entries=entries.filter(x=>x!==item);box.remove();}));items.append(box);};
    wrapper.append(items,button("Add "+human(key).toLocaleLowerCase()+" row",()=>add()));
    (value||[]).forEach(add);
    return {wrapper,read:()=>entries.map(e=>e.control.read()),replace(values){entries=[];items.replaceChildren();values.forEach(add);}};
  }
  function control(name,key,spec,value,s,record,options={}) {
    const required=options.required??U.schema.required[name]?.includes(key), bare=typeof spec==="string"?spec.replace(/\?$/,""):"";
    const wrapper=node("fieldset",null,"awards-field");wrapper.append(node("legend",human(key)));
    let result;
    if(nested[key]){
      result=repeated.has(key)?repeater(name,key,value,s,record):objectControl(name,key,value,s,record);
      wrapper.classList.add("full");
    }else if(key==="financialRefs")result=sourcePicker(value,s,true);
    else if(bare==="sources"||key==="sourceRefs")result=sourcePicker(value,s);
    else if(bare==="id"||bare==="ids")result=referenceControl(name,key,value,{multiple:bare==="ids",required,exclude:key==="supersedesId"?record?.id:null});
    else if(bare==="money"){
      const grid=node("div",null,"awards-money"), amount=field("Amount","text",value?.value||""),currency=field("Currency","text",value?.currency||"");
      amount.input.inputMode="decimal";currency.input.maxLength=3;currency.input.pattern="[A-Z]{3}";
      grid.append(amount.wrapper,currency.wrapper);
      result={wrapper:grid,read(){const a=amount.input.value.trim(),c=currency.input.value.trim();
        if(!a&&!c&&!required)return null;
        if(!a||!/^[A-Z]{3}$/.test(c))throw new Error("Complete "+human(key)+" using its original decimal amount and three-letter currency.");
        return {value:a,currency:c};}};
    }else if(Array.isArray(spec)){
      const f=field(human(key),"select",value??spec[0],spec.map(x=>[x,human(x)]));
      return {wrapper:f.wrapper,input:f.input,read:()=>f.input.value};
    }else if(bare==="bool"){
      const f=field(human(key),"select",String(value??false),[["false","No"],["true","Yes"]]);
      return {wrapper:f.wrapper,read:()=>f.input.value==="true"};
    }else{
      const f=field(human(key),bare==="date"?"date":bare==="email"?"email":bare==="text"?"textarea":"text",value??"");
      f.input.required=!!required;
      if(bare==="decimal")f.input.inputMode="decimal";
      if(bare==="short")f.input.maxLength=240;if(bare==="text")f.input.maxLength=16000;
      return {wrapper:f.wrapper,read(){const v=f.input.value;return typeof spec==="string"&&spec.endsWith("?")&&!v.trim()?null:v;}};
    }
    if(["sources","ids"].includes(bare)||["financialRefs","sourceRefs"].includes(key))wrapper.classList.add("full");
    wrapper.append(result.wrapper);return {...result,wrapper};
  }
  function changeSet(actor,changes=[],extra={}) {
    return {schema:U.schema.schema,expectedAwardsRevision:model()?.revision||0,actor,changes,...extra};
  }
  async function save(s,awards){
    assertCurrent(s);const {name,notes,sources,review}=p().definition;
    return action("portfolio.save",{id:s.portfolioId,expectedPortfolioRevision:s.revision,name,notes,sources,review,awards});
  }
  function roundFor(name,record,controls){
    const get=k=>controls[k]?.read()??record?.[k];
    if(name==="rounds")return record;
    if(name==="applications")return find("rounds",get("roundId"));
    let applicationId=get("applicationId");
    if(name==="assessments")applicationId=find("assignments",get("assignmentId"))?.applicationId;
    return find("rounds",find("applications",applicationId)?.roundId);
  }
  function editor(name,record=null,{seed={},correction=false,advance=null}={}) {
    const s=selection();assertCurrent(s);
    if(isFrozen(record)&&!correction&&!advance)throw new Error("This recorded edition is preserved. Create a following edition to correct it.");
    const id=correction||!record?crypto.randomUUID():record.id, revision=correction?0:record?.revision||0;
    const form=node("form"), grid=node("div",null,"form-grid awards-form"), controls={};
    const actor=field("Editor","text",U.actor||p().review.reviewer);actor.input.required=true;form.append(actor.wrapper);
    if(correction)form.append(node("p","The new edition retains a link to the selected earlier edition and begins as a draft.","coverage"));
    if(advance)form.append(node("p","Record the next state on this same edition. Its submitted content remains preserved.","coverage"));
    const fields=advance?{status:[advance]}:U.schema.fields[name];
    for(const [key,spec]of Object.entries(fields)){
      let value=record?.[key]??seed[key];
      if(correction&&key==="status")value="draft";
      if(correction&&key==="supersedesId")value=record.id;
      if(!record&&value===undefined){
        if(["owner","reviewer","assignedBy","reportedBy"].includes(key))value=U.actor||p().review.reviewer;
        if(key==="roundId")value=U.roundId||null;
        if(key==="applicationId")value=U.applicationId||null;
      }
      if(advance)value=advance;
      controls[key]=control(name,key,spec,value,s,record);grid.append(controls[key].wrapper);
    }
    if(name==="claims"&&!advance){
      const kinds={submission:["pending"],review:["approved","rejected","query"],reconciliation:["matched","disputed"]};
      const claimRead=controls.claimId.read,financialRead=controls.financialRefs.read;
      controls.claimId.read=()=>controls.kind.read()==="submission"?null:claimRead();
      controls.financialRefs.read=()=>controls.kind.read()==="reconciliation"?financialRead():[];
      const selectStage=()=>{
        const kind=controls.kind.read(),choices=kinds[kind],input=controls.outcome.input,previous=input.value;
        input.replaceChildren(...choices.map(value=>{const item=node("option",human(value));item.value=value;return item;}));
        input.value=choices.includes(previous)?previous:choices[0];
        controls.claimId.wrapper.hidden=kind==="submission";
        controls.financialRefs.wrapper.hidden=kind!=="reconciliation";
      };
      controls.kind.input.addEventListener("change",selectStage);selectStage();
    }
    for(const key of ["answers","items","scores"]){
      if(!controls[key]?.replace)continue;
      const b=button("Add missing round criteria",()=>{
        const round=roundFor(name,record,controls);
        if(!round)throw new Error("Choose the original funding round or application first.");
        const existing=controls[key].read(),seen=new Set(existing.map(x=>x.criterionId));
        const expected=(round.criteria||[]).filter(c=>key==="scores"?c.kind==="score":key==="items"?c.kind==="eligibility":true);
        const additions=expected.filter(c=>!seen.has(c.id)).map(c=>key==="answers"?{criterionId:c.id,response:""}:
          key==="scores"?{criterionId:c.id,value:null,reason:"",evidenceIds:[]}:
            {criterionId:c.id,title:c.title,outcome:"undetermined",reason:"",evidenceIds:[]});
        controls[key].replace([...existing,...additions]);
      });
      controls[key].wrapper.prepend(b);
    }
    const submit=node("button",advance?"Record "+human(advance).toLowerCase():correction?"Save following edition":"Save record","primary");
    submit.type="submit";form.append(grid,submit);
    form.addEventListener("submit",async e=>{
      e.preventDefault();submit.disabled=true;
      try{
        assertCurrent(s);const values=Object.fromEntries(Object.entries(controls).map(([k,c])=>[k,c.read()]));
        U.actor=actor.input.value;
        await save(s,changeSet(U.actor,[{collection:name,id,expectedRevision:revision,fields:values}]));
      }catch(error){failure(error);}finally{submit.disabled=false;}
    });
    showDialog((correction?"Following edition · ":record?"Edit · ":"Add · ")+names[name],[form]);
  }
  function archive(name,record) {
    const s=selection();assertCurrent(s);
    const form=node("form"),actor=field("Editor","text",U.actor),reason=field("Reason","textarea");
    actor.input.required=reason.input.required=true;
    form.append(node("p",title(record)),actor.wrapper,reason.wrapper);
    const submit=node("button","Archive draft","primary");submit.type="submit";form.append(submit);
    form.addEventListener("submit",async e=>{e.preventDefault();submit.disabled=true;
      try{U.actor=actor.input.value;await save(s,changeSet(U.actor,[],{archive:[{collection:name,id:record.id,expectedRevision:record.revision,reason:reason.input.value}]}));}
      catch(error){failure(error);}finally{submit.disabled=false;}});
    showDialog("Archive draft",[form]);
  }
  function valueView(value,key,context,name) {
    if(value===null||value===undefined||value==="")return node("span","—","muted");
    if(typeof value==="boolean")return node("span",value?"Yes":"No");
    if(typeof value!=="object"){
      if(/Id$/.test(key)){
        const target=referenceTarget(name,key);
        if(context.awardPublication){
          const captured=context.awardPublication[target.programme?"programmeRecords":"awardRecords"]||[];
          const originals=captured.filter(e=>e.collection===target.name&&e.record.id===value).map(e=>e.record);
          if(originals.length)return node("span",originals.map(r=>title(r)+" · record revision "+r.revision).join("; "));
          return node("span",String(value));
        }
        const pool=(target.programme?context.definition.programme:context.definition.awards)?.records[target.name]||[];
        const record=pool.find(r=>r.id===value);return node("span",record?title(record):value);
      }
      return node("span",String(value),typeof value==="string"&&value.includes("\n")?"awards-prose":"");
    }
    if(Array.isArray(value)){
      if(!value.length)return node("span","None","muted");
      if(value.every(v=>typeof v!=="object")){const list=node("ul");
        value.forEach(v=>{const li=node("li");li.append(valueView(v,key.endsWith("Ids")?key.slice(0,-1):key,context,name));list.append(li);});return list;}
      const fields=[...new Set(value.flatMap(v=>Object.keys(v||{})))];
      return table(fields.map(human),value.map(row=>fields.map(k=>valueView(row?.[k],k,context,name))));
    }
    if(Object.hasOwn(value,"value")&&Object.hasOwn(value,"currency"))return node("span",value.value+" "+value.currency);
    const list=node("dl",null,"awards-definition");
    for(const [k,v]of Object.entries(value)){list.append(node("dt",human(k)));const item=node("dd");item.append(valueView(v,k,context,name));list.append(item);}
    return list;
  }
  function nextActions(name,r) {
    if(!editable()||r.archived)return [];
    const a=[];
    const add=(label,target,seed)=>a.push(button(label,()=>editor(target,null,{seed})));
    if(name==="rounds"&&r.status==="published")add("Add application","applications",{roundId:r.id});
    if(name==="applications"&&r.status==="submitted"){
      add("Record eligibility check","checks",{applicationId:r.id,kind:"eligibility"});
      add("Record due diligence","checks",{applicationId:r.id,kind:"due-diligence"});
      add("Assign assessor","assignments",{applicationId:r.id});
      add("Record panel decision","decisions",{applicationId:r.id});
    }
    if(name==="assignments"&&r.status==="confirmed"&&r.conflictResolution?.outcome==="clear")
      add("Write assessment","assessments",{assignmentId:r.id,assessor:r.assessor});
    if(name==="decisions"&&r.status==="recorded"&&r.outcome==="award"){
      const app=find("applications",r.applicationId);
      add("Prepare award agreement","agreements",{decisionId:r.id,amount:r.amount,recipientPartnerId:app?.partnerId});
    }
    if(name==="agreements"&&r.status==="recorded"){
      add("Submit claim","claims",{agreementId:r.id,kind:"submission"});
      add("Record monitoring return","monitoring",{agreementId:r.id});
    }
    if(name==="claims"&&r.kind==="submission"&&r.status==="recorded"){
      add("Review submitted claim","claims",{agreementId:r.agreementId,claimId:r.id,amount:r.amount,kind:"review"});
      add("Reconcile original financial rows","claims",{agreementId:r.agreementId,claimId:r.id,amount:r.amount,kind:"reconciliation"});
    }
    return a;
  }
  async function detail(name,r,s=selection(),historical=false){
    const opening=p()?.snapshot,context=p()?.id===s.portfolioId&&p()?.revision===s.revision?p():
      await api("/api/portfolio?"+new URLSearchParams({id:s.portfolioId,revision:s.revision}));
    if(opening!==p()?.snapshot)throw new Error("The selected portfolio changed.");
    const publicationRevision=r.publication?.portfolioRevision;
    const recordedContext=publicationRevision&&publicationRevision!==context.revision?
      await api("/api/portfolio?"+new URLSearchParams({id:s.portfolioId,revision:publicationRevision})):context;
    if(opening!==p()?.snapshot)throw new Error("The selected portfolio changed.");
    const frozenContext=r.publication?{...recordedContext,awardPublication:r.publication}:recordedContext;
    const content=[node("p","Record revision "+r.revision+" · "+r.updatedAt+" · "+r.updatedBy,"small")];
    if(publicationRevision)content.push(node("p","Recorded contributor basis: portfolio revision "+publicationRevision,"small"));
    if(r.archived)content.push(node("p","Archived: "+r.archiveReason,"coverage"));
    const actions=node("div",null,"actions");
    if(!historical&&editable()&&!r.archived){
      if(isFrozen(r)){
        actions.append(button("Create following edition",()=>editor(name,r,{correction:true})));
        if(name==="rounds"&&r.status==="published")actions.append(button("Close funding round",()=>editor(name,r,{advance:"closed"})));
        if(name==="applications"&&r.status==="submitted")actions.append(button("Withdraw application",()=>editor(name,r,{advance:"withdrawn"})));
      }else actions.append(button("Edit draft",()=>editor(name,r)),button("Archive draft",()=>archive(name,r)));
      actions.append(...nextActions(name,r));
    }
    if(!historical)actions.append(button("Record history",async()=>{
      const response=await api("/api/awards/history?"+new URLSearchParams({...s,collection:name,id:r.id}));
      if(response.snapshot!==p()?.snapshot)throw new Error("The selected portfolio changed.");
      showDialog(title(r)+" · History",[table(["Revision","Recorded","Editor","State","Open"],response.history.map(h=>[
        h.record.revision,h.record.updatedAt,h.record.updatedBy,human(h.record.status),
        button("Open saved edition",()=>detail(name,h.record,{portfolioId:s.portfolioId,revision:h.portfolioRevision},true))]))]);
    }));
    content.push(actions);
    const body=node("div",null,"programme-detail");
    for(const key of Object.keys(U.schema.fields[name])){const section=node("section");section.append(node("h3",human(key)),valueView(r[key],key,recordedContext,name));body.append(section);}
    content.push(body);
    for(const key of ["publication","recording","frozen","positionAtRecording","calculation"]){
      if(!r[key])continue;const section=panel(human(key),"Saved with this exact record edition.");
      section.append(valueView(r[key],key,frozenContext,name));content.push(section);
    }
    content.push(rawDetails("Complete original record",r));
    showDialog(title(r),content);
  }
  function summary(name,r){
    if(name==="rounds")return r.opensDate&&r.closesDate?r.opensDate+" to "+r.closesDate:(r.criteria||[]).length+" criteria";
    if(name==="applications")return r.requestedAmount?r.requestedAmount.value+" "+r.requestedAmount.currency:title(find("rounds",r.roundId));
    if(name==="checks")return human(r.kind)+" · "+human(r.outcome);
    if(name==="assignments")return human(r.conflictDisclosure?.state||"undisclosed")+" · "+human(r.conflictResolution?.outcome||"pending");
    if(name==="assessments")return (r.scores||[]).length+" scores · "+r.assessor;
    if(name==="decisions")return human(r.outcome)+(r.amount?" · "+r.amount.value+" "+r.amount.currency:"");
    if(name==="agreements")return r.amount?r.amount.value+" "+r.amount.currency:r.acceptedDate||"Draft agreement";
    if(name==="claims")return human(r.kind)+" · "+human(r.outcome)+(r.amount?" · "+r.amount.value+" "+r.amount.currency:"");
    return r.periodStart+" to "+r.periodEnd+" · "+human(r.outcome);
  }
  function scope(container){
    const bar=node("div",null,"toolbar awards-scope");
    const round=field("Funding round","select",U.roundId,[["","All funding rounds"],...rows("rounds").map(r=>[r.id,title(r)])]);
    const app=field("Application","select",U.applicationId,[["","All applications"],...rows("applications").filter(r=>!U.roundId||r.roundId===U.roundId).map(r=>[r.id,title(r)])]);
    round.input.addEventListener("change",()=>{U.roundId=round.input.value;U.applicationId="";U.offset=0;render().catch(failure);});
    app.input.addEventListener("change",()=>{U.applicationId=app.input.value;U.offset=0;render().catch(failure);});
    bar.append(round.wrapper,app.wrapper);container.append(bar);
  }
  function effective(name,{finalOnly=false}={}){
    const active=rows(name).filter(r=>!r.archived);
    const superseded=new Set(active.filter(r=>isFrozen(r)&&r.supersedesId).map(r=>r.supersedesId));
    return active.filter(r=>!superseded.has(r.id)&&(!finalOnly||isFrozen(r)));
  }
  function queue(container){
    const counts=node("div",null,"metrics");for(const name of ["applications","assessments","decisions","claims"])
      counts.append(metric(recordRows(name).filter(r=>!r.archived).length,names[name].toLowerCase()));container.append(counts);
    const tasks=[];
    const scopedEffective=(name,options)=>{
      const ids=new Set(recordRows(name).map(r=>r.id));
      return effective(name,options).filter(r=>ids.has(r.id));
    };
    for(const r of scopedEffective("applications")){
      if(r.status==="draft")tasks.push(["Application draft",title(r),"Complete the application and record its submission.","applications",r]);
      if(r.status==="submitted"){
        const checks=effective("checks",{finalOnly:true}).filter(c=>c.applicationId===r.id);
        for(const kind of ["eligibility","due-diligence"]){
          const selected=checks.filter(c=>c.kind===kind);
          if(!selected.length)tasks.push([human(kind),title(r),"Record the check against the published round criteria.","applications",r]);
          for(const check of selected.filter(c=>["undetermined","query"].includes(c.outcome)))
            tasks.push([human(kind)+" · "+human(check.outcome),title(check),"Resolve the recorded query in a following check edition.","checks",check]);
        }
        const decisions=effective("decisions",{finalOnly:true}).filter(d=>d.applicationId===r.id);
        if(!decisions.length)tasks.push(["Panel decision",title(r),"Review the submitted assessments and record the panel decision.","applications",r]);
        for(const decision of decisions.filter(d=>["reserve","defer"].includes(d.outcome)))
          tasks.push(["Panel follow-up · "+human(decision.outcome),title(decision),"Revisit the retained panel reasons and record the next decision when due.","decisions",decision]);
      }
    }
    for(const r of scopedEffective("assignments")){
      if(r.conflictResolution?.outcome==="pending"||r.conflictDisclosure?.state==="undisclosed")
        tasks.push(["Conflict decision",title(r),"Complete disclosure and the attributed clearance or recusal.","assignments",r]);
      else if(r.status==="confirmed"&&r.conflictResolution?.outcome==="clear"&&!effective("assessments",{finalOnly:true}).some(a=>a.assignmentId===r.id))
        tasks.push(["Assessor return",title(r),"Complete and submit the assigned assessment.","assignments",r]);
    }
    for(const r of scopedEffective("claims",{finalOnly:true}).filter(r=>r.kind==="submission")){
      const following=effective("claims",{finalOnly:true}).filter(c=>c.claimId===r.id);
      const reviews=following.filter(c=>c.kind==="review"),reconciliations=following.filter(c=>c.kind==="reconciliation");
      if(!reviews.length)tasks.push(["Claim review",title(r),"Record an attributed approval, query or rejection.","claims",r]);
      for(const review of reviews.filter(c=>["pending","query"].includes(c.outcome)))
        tasks.push(["Claim review · "+human(review.outcome),title(review),"Resolve the recorded review in a following edition.","claims",review]);
      if(reviews.some(c=>c.outcome==="approved")&&!reconciliations.length)
        tasks.push(["Financial reconciliation",title(r),"Select the original financial rows and record their meaning.","claims",r]);
      for(const reconciliation of reconciliations.filter(c=>["pending","query","disputed"].includes(c.outcome)))
        tasks.push(["Reconciliation · "+human(reconciliation.outcome),title(reconciliation),"Resolve the selected financial evidence and record the following reconciliation.","claims",reconciliation]);
    }
    container.append(heading("Work queue","Outstanding records in the selected round and application."));
    container.append(table(["Work","Record","Next record","Open"],tasks.map(([kind,label,next,name,r])=>[
      kind,label,next,button("Open record",()=>detail(name,r))])));
    if(!tasks.length)container.append(node("p","No outstanding records in this selection.","empty"));
  }
  async function positionView(container,epoch){
    if(!U.roundId&&!U.applicationId){container.append(node("p","Choose a funding round or application to open its delivery position.","empty"));return;}
    const route=U.applicationId?"position":"round",extra=U.applicationId?{applicationId:U.applicationId}:{roundId:U.roundId};
    const result=await api("/api/awards/"+route+"?"+query(extra));
    if(epoch!==state().epoch)return;
    if(result.snapshot!==p()?.snapshot)throw new Error("The selected award position changed.");
    const data=result[route],collections=route==="round"?data.queues:data;
    const metrics=node("div",null,"metrics");
    for(const name of ["applications","assessments","decisions","agreements","claims"])
      if(Object.hasOwn(data.counts||{},name))metrics.append(metric(data.counts[name],names[name].toLowerCase()));
    container.append(metrics);
    const original=route==="round"?data.record:data.application;
    if(original)container.append(button("Open "+(route==="round"?"funding round":"application"),()=>detail(route==="round"?"rounds":"applications",original)));
    if(data.calculations?.length){
      const section=panel("Submitted assessment calculations","Original criterion values and the recorded round scoring method.");
      section.append(table(["Assessment","Revision","Saved calculation"],data.calculations.map(c=>[
        title(find("assessments",c.assessmentId)),c.assessmentRevision,valueView(c.calculation,"calculation",p(),"assessments")])));
      container.append(section);
    }
    for(const name of ["applications","checks","assignments","assessments","decisions","agreements","claims","monitoring"]){
      if(!Array.isArray(collections[name])||!collections[name].length)continue;
      const section=panel(names[name]);
      section.append(table(["Record","Position","State","Open"],collections[name].map(r=>[
        title(r),summary(name,r),r.archived?"Archived":human(r.status),button("Open record",()=>detail(name,r))])));
      container.append(section);
    }
  }
  async function renderAwards(container,epoch){
    if(!U.schema)U.schema=await api("/api/awards/schema");
    if(epoch!==state().epoch)return;identity();
    container.append(heading("Grant applications and awards","Funding rounds, assessment, decisions, agreements, claims and monitoring."));
    if(!p()){container.append(node("p","Choose a saved portfolio, then open its programme to begin award administration.","empty"));return;}
    if(!programme()){container.append(node("p","Create the programme and its partners in Programme delivery first.","empty"));return;}
    container.append(node("p","Portfolio revision "+p().revision+" · Awards revision "+(model()?.revision||0),"small"));
    const bar=node("div",null,"toolbar"), register=field("Workspace","select",U.register,[["queue","Work queue"],["position","Round and application position"],...Object.entries(names)]);
    register.input.addEventListener("change",()=>{U.register=register.input.value;U.offset=0;U.search="";render().catch(failure);});
    bar.append(register.wrapper);
    if(editable()){
      const target=["queue","position"].includes(U.register)?U.roundId?"applications":"rounds":U.register;
      bar.append(button(target==="rounds"?"Add funding round":target==="applications"?"Add application":"Add record",()=>editor(target),"primary"));
    }
    container.append(bar);scope(container);
    if(!model()){container.append(node("p","Add a funding round with the actual programme rules and assessment criteria.","empty"));return;}
    if(U.register==="queue"){queue(container);return;}
    if(U.register==="position"){await positionView(container,epoch);return;}
    const search=field("Search this register","search",U.search),archived=field("Saved records","select",String(U.archived),
      [["false","Active records"],["true","Include archived drafts"]]),filters=node("div",null,"toolbar");
    const apply=()=>{U.search=search.input.value;U.archived=archived.input.value==="true";U.offset=0;return render();};
    search.input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();apply().catch(failure);}});
    filters.append(search.wrapper,archived.wrapper,button("Apply",apply));container.append(filters);
    const name=U.register,all=recordRows(name),visible=all.slice(U.offset,U.offset+50);
    container.append(table(["Record","Responsible person","Position","State","Open"],visible.map(r=>[
      title(r),r.owner||r.reviewer||r.assessor||r.reportedBy||r.acceptedBy||"—",summary(name,r),
      r.archived?"Archived":human(r.status),button("Open record",()=>detail(name,r))])));
    const pager=node("div",null,"pager"),previous=button("Previous",()=>{U.offset=Math.max(0,U.offset-50);return render();}),
      next=button("Next",()=>{U.offset+=50;return render();});
    previous.disabled=U.offset===0;next.disabled=U.offset+50>=all.length;
    pager.append(node("span",all.length?(U.offset+1)+"–"+(U.offset+visible.length)+" of "+all.length+" records":"No matching records","small"),previous,next);
    container.append(pager);
  }
  return {render:renderAwards};
}
