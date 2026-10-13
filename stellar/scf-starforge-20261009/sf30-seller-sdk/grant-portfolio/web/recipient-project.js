/* MIT. Selected applicant plans become reviewed recipient project planning. */
"use strict";
function GrantRecipientProjects(H){
  const {state,node,button,field,panel,table,api,runOriginal,showDialog,currentEdit,rawDetails}=H;
  let corePromise;
  const core=()=>corePromise??=import("/recipient-project-core.mjs");
  const utf8=t=>new TextEncoder().encode(t);
  const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",b)),n=>n.toString(16).padStart(2,"0")).join("");
  const clone=v=>JSON.parse(JSON.stringify(v));
  const need=(ok,message)=>{if(!ok)throw new Error(message);};
  const label=r=>[r.code,r.title||r.name].filter(Boolean).join(" · ");
  function download(bytes,name,type="application/json"){
    const url=URL.createObjectURL(new Blob([bytes],{type})),link=node("a");
    link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function selected(basis){
    need(state().portfolio?.id===basis.id&&state().portfolio?.revision===basis.revision&&
      state().portfolio?.snapshot===basis.snapshot&&currentEdit(),
      "The portfolio changed. Open this import again on its latest revision.");
    need(!state().pending,"Continue the saved pending operation before starting this handover.");
  }
  async function checkSaved(module,plan,bytes){
    need(plan?.source&&plan.source.bytes===bytes.length&&plan.source.sha256===await sha(bytes),
      "The original application-plan file differs from the saved recipient import.");
    need(plan.actionSha256===await sha(utf8(JSON.stringify(plan.action))),"The original saved action changed.");
    need(plan.portfolio?.id===state().portfolio?.id,"Open the portfolio named in this saved recipient import.");
    const basis=await api("/api/portfolio?"+new URLSearchParams({id:plan.portfolio.id,revision:plan.portfolio.revision}));
    need(basis.snapshot===plan.portfolio.snapshot,"The saved handover selected a different original portfolio snapshot.");
    module.verifyRecipientProjectStructure(basis,plan,bytes,plan.source.sha256);
    return basis;
  }
  async function open(){
    const basis=clone(state().portfolio);selected(basis);
    need(basis.definition.programme,"Create the programme and its recipient partner before importing an application plan.");
    const module=await core(),root=node("div",null,"recipient-intake"),body=node("div"),error=node("p","","recipient-error");
    error.setAttribute("role","alert");root.append(error,body);
    const I={basis,module,bytes:null,source:null,filename:"",plan:null,resume:false,busy:false,downloaded:false,
      operationId:"recipient-"+crypto.randomUUID(),documentId:crypto.randomUUID(),projectId:crypto.randomUUID(),
      mappings:new Map(),fields:null};
    const attempt=fn=>async()=>{
      if(I.busy)return;I.busy=true;error.textContent="";
      const controls=[...root.querySelectorAll("input,select,textarea,button")].map(e=>[e,e.disabled]);
      controls.forEach(([e])=>{e.disabled=true;});
      try{await fn();}catch(e){error.textContent=e.message||String(e);}
      finally{I.busy=false;controls.forEach(([e,disabled])=>{if(e.isConnected)e.disabled=disabled;});}
    };
    const picker=(title,rows,value="")=>{
      const wrap=node("div"),search=field("Find "+title.toLowerCase(),"search"),choice=field(title,"select",value),info=node("p","","small");
      function paint(){
        const old=choice.input.value||value,q=search.input.value.toLowerCase();
        const matches=rows.filter(r=>r.id===old||label(r).toLowerCase().includes(q)).slice(0,200);
        choice.input.replaceChildren(new Option("Choose an existing record",""),...matches.map(r=>new Option(label(r),r.id)));
        choice.input.value=old;info.textContent=matches.length+" shown of "+rows.length+" existing records; search to narrow the list.";
      }
      search.input.addEventListener("input",paint);paint();wrap.append(search.wrapper,choice.wrapper,info);
      return {wrapper:wrap,input:choice.input};
    };
    function filePage(){
      body.replaceChildren(node("h3","1. Open the recorded application plan"),
        node("p","Choose the complete JSON exported from Application plans in the research desk. It must contain an explicitly recorded Pursue decision and a saved plan edition."));
      const file=field("Recorded application plan JSON","file"),name=field("Retained source filename","text");
      file.input.accept=".json,application/json";name.input.maxLength=200;
      file.input.addEventListener("change",()=>{const f=file.input.files[0];if(f)name.input.value=f.name.replace(/[^A-Za-z0-9._-]/g,"_").replace(/^[^A-Za-z0-9]+/,"")||"Application_Plan.json";});
      body.append(file.wrapper,name.wrapper);
      const read=async()=>{
        const f=file.input.files[0];need(f&&f.size>0&&f.size<=module.ENGRANT_SOURCE_LIMIT,"Select the complete original plan JSON, up to 8 MiB.");
        I.bytes=module.originalEngrantPlanBytes(new Uint8Array(await f.arrayBuffer()));
        I.source=module.parseEngrantApplicationPlan(I.bytes);I.filename=name.input.value;
        I.fields=null;I.mappings=new Map();
      };
      body.append(button("Review source and recipient",attempt(async()=>{
        selected(basis);await read();I.plan=null;I.resume=false;mappingPage();
      }),"primary"));
      const resume=panel("Continue a saved recipient import","Select the original application-plan JSON above and the complete recipient import plan downloaded before saving."),
        saved=field("Saved recipient import plan","file");saved.input.accept=".json,application/json";
      resume.append(saved.wrapper,button("Review original recipient import",attempt(async()=>{
        await read();const f=saved.input.files[0];need(f&&f.size>0&&f.size<=32*1024*1024,"Choose the complete saved recipient import plan, up to 32 MiB.");
        const plan=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await f.arrayBuffer()));
        I.basis=await checkSaved(module,plan,I.bytes);I.plan=plan;I.resume=true;I.downloaded=true;reviewPage();
      })));body.append(resume);
    }
    function mappingPage(){
      const original=I.source,work=original.plan.plan,records=basis.definition.programme.records,old=I.fields;
      body.replaceChildren(node("h3","2. Review the organisation and project"));
      const source=panel(original.organisation.organisation,
        "Recorded decision "+original.decision.edition+" · "+original.decision.reviewer+" · "+original.decision.reviewed_on);
      source.append(node("p",original.candidate.title+" · "+original.candidate.funder),
        node("p",original.decision.rationale),node("p","Plan edition "+original.plan.edition+" · "+original.plan.prepared_by+" · "+original.plan.prepared_on),
        node("p","Criteria remain staff-authored evidence. Historical funding records are context; this import creates project planning."),
        rawDetails("Original decision, criteria and full organisation profile",original));
      body.append(source);
      const programme=picker("Parent programme",records.nodes.filter(r=>!r.archived&&r.kind==="programme"),old?.programmeId),
        partner=picker("Recipient organisation",records.partners.filter(r=>!r.archived),old?.partnerId),
        confirm=field("I confirm this partner represents the original organisation","checkbox");
      confirm.input.checked=old?.recipientConfirmed===true;
      const actor=field("Recording actor","text",old?.actor||basis.review.reviewer||""),
        code=field("New project code","text",old?.project?.code||""),
        title=field("Project title","text",old?.project?.title||work.title),
        owner=field("Project owner","text",old?.project?.owner||work.owner),
        description=field("Project description","textarea",old?.project?.description||work.objective),
        start=field("Project start","date",old?.project?.startDate||work.start||""),
        end=field("Project end","date",old?.project?.endDate||work.end||"");
      title.input.maxLength=220;code.input.maxLength=200;owner.input.maxLength=240;actor.input.maxLength=240;description.input.maxLength=14000;
      const grid=node("div",null,"form-grid");grid.append(programme.wrapper,partner.wrapper,confirm.wrapper,actor.wrapper,code.wrapper,title.wrapper,owner.wrapper,description.wrapper,start.wrapper,end.wrapper);
      body.append(grid,node("p","The recipient's exact saved ID and edition are recorded in the handover document and project description. No grant, award amount or financial row is created.","small"));
      const tasks=panel("3. Select dated application work",
        "Every original task remains in the complete source document. Select tasks with an explicit due date to create programme milestones. Waiting requires an explicit programme status.");
      const controls=[];
      original.plan.plan.tasks.forEach((task,index)=>{
        const prior=I.mappings.get(task.id),group=node("fieldset",null,"recipient-task"),include=field("Create milestone for "+task.title,"checkbox");
        group.append(node("legend",task.title||task.id),node("p","Original: "+task.status+(task.due?" · Due "+task.due:" · No due date")));
        if(!task.due){group.append(node("p","Retained as unscheduled work in the complete plan document."),rawDetails("Original task",task));tasks.append(group);return;}
        include.input.checked=prior?prior.include:true;
        const defaultStatus={"Planned":"planned","In progress":"in-progress","Completed":"complete","Cancelled":"cancelled"}[task.status]||"";
        const taskCode=field("Milestone code "+(index+1),"text",prior?.code||((old?.project?.code||"PROJECT")+".T"+String(index+1).padStart(3,"0"))),
          taskTitle=field("Milestone title "+(index+1),"text",prior?.title||task.title),
          taskOwner=field("Milestone owner "+(index+1),"text",prior?.owner||task.owner||work.owner),
          status=field("Programme status "+(index+1),"select",prior?.status??defaultStatus,
            [["","Choose the programme status"],["planned","Planned"],["in-progress","In progress"],["submitted","Submitted"],
              ...(task.status==="Completed"?[["complete","Complete"]]:[]),["cancelled","Cancelled"]]),
          progress=field("Progress percent "+(index+1),"text",prior?.progress||(task.status==="Completed"?"100":"0")),
          note=field("Milestone description "+(index+1),"textarea",prior?.description??task.description);
        for(const f of [taskCode,taskTitle,taskOwner])f.input.maxLength=240;note.input.maxLength=14000;
        let automaticCode=taskCode.input.value;
        code.input.addEventListener("input",()=>{if(taskCode.input.value===automaticCode){automaticCode=(code.input.value||"PROJECT")+".T"+String(index+1).padStart(3,"0");taskCode.input.value=automaticCode;}});
        const holder={task,index,id:prior?.id||crypto.randomUUID(),include,taskCode,taskTitle,taskOwner,status,progress,note};
        controls.push(holder);
        group.append(include.wrapper,taskCode.wrapper,taskTitle.wrapper,taskOwner.wrapper,status.wrapper,progress.wrapper,note.wrapper,rawDetails("Complete original task",task));
        tasks.append(group);
      });
      if(!original.plan.plan.tasks.length)tasks.append(node("p","This plan contains no tasks. Its complete recorded edition is still retained with the project."));
      body.append(tasks);
      const capture=()=>{
        I.fields={actor:actor.input.value,programmeId:programme.input.value,partnerId:partner.input.value,recipientConfirmed:confirm.input.checked,
          project:{id:I.projectId,code:code.input.value,title:title.input.value,owner:owner.input.value,description:description.input.value,
            startDate:start.input.value||null,endDate:end.input.value||null}};
        for(const c of controls)I.mappings.set(c.task.id,{include:c.include.input.checked,id:c.id,taskId:c.task.id,
          code:c.taskCode.input.value,title:c.taskTitle.input.value,owner:c.taskOwner.input.value,dueDate:c.task.due,
          status:c.status.input.value,completedDate:c.status.input.value==="complete"?c.task.completed_on:null,
          progress:c.progress.input.value,description:c.note.input.value});
      };
      body.append(button("Back to source file",()=>{capture();filePage();}),
        button("Review complete recipient import",attempt(async()=>{
          selected(basis);capture();
          const milestones=[...I.mappings.values()].filter(x=>x.include).map(x=>{const v={...x};delete v.include;return v;});
          const prepared=module.prepareRecipientProjectStructure(basis,{...I.fields,operationId:I.operationId,bytes:I.bytes,filename:I.filename,
            documentId:I.documentId,milestones},await sha(I.bytes));
          I.plan={...prepared,actionSha256:await sha(utf8(JSON.stringify(prepared.action)))};I.resume=false;I.downloaded=false;reviewPage();
        }),"primary"));
    }
    function reviewPage(){
      const plan=I.plan,changes=plan.action.payload.programme.changes,project=changes.find(c=>c.collection==="nodes"),
        milestones=changes.filter(c=>c.collection==="milestones");
      body.replaceChildren(node("h3","4. Save the reviewed recipient project"));
      body.append(node("p",project.fields.title+" · "+project.fields.code),
        node("p","Recipient: "+plan.binding.recipient.name+" · Portfolio revision "+plan.portfolio.revision),
        node("p",milestones.length+" programme milestones · "+plan.retainedOnlyTasks.length+" tasks retained only in the full plan."),
        node("p","The complete original plan is stored as a programme document. Requested amounts and funder descriptions retain their original meaning; they do not become awards or financial transactions."));
      body.append(table(["Milestone","Owner","Due","State"],milestones.map(c=>[c.fields.title,c.fields.owner,c.fields.dueDate,c.fields.status+" · "+c.fields.progress+"%"])));
      if(plan.retainedOnlyTasks.length)body.append(rawDetails("Original work retained in the complete document",plan.retainedOnlyTasks));
      body.append(rawDetails("Complete original recipient import plan",plan));
      const save=button(I.resume?"Continue original recipient import":"Save reviewed project",attempt(async()=>{
        await checkSaved(module,plan,I.bytes);
        let original=null;
        try{original=await api("/api/request?id="+encodeURIComponent(plan.action.operationId));}
        catch(e){if(e.code!=="NOT_FOUND")throw e;}
        if(original){
          need(module.sameRecipientValue(original.input,plan.action),"This operation ID already has a different saved input.");
          need(!state().pending||state().pending.operationId===plan.action.operationId,"Continue the other pending operation first.");
        }else{
          selected(I.basis);
          const uploaded=await api("/api/programme/upload",{method:"POST",headers:{"Content-Type":"application/octet-stream","X-Content-SHA256":plan.source.sha256},body:I.bytes});
          need(uploaded.sha256===plan.source.sha256&&uploaded.bytes===plan.source.bytes,"The complete original plan upload changed.");
          selected(I.basis);
        }
        await runOriginal(plan.action);
      }),"primary");
      save.disabled=!I.downloaded;
      body.append(button("Download original recipient plan",()=>{
        download(utf8(JSON.stringify(plan,null,2)+"\n"),"Recipient_Import_"+plan.action.operationId+".json");
        I.downloaded=true;save.disabled=false;
      }),save);
      if(!I.resume)body.append(button("Back to recipient review",()=>mappingPage()));
      body.append(node("p","Keep this downloaded import plan with the original research-plan JSON. Reopen both to continue the same operation, including after a successful save whose browser response was interrupted.","small"));
    }
    filePage();showDialog("Recipient project handover",[root]);
  }
  return {open};
}
