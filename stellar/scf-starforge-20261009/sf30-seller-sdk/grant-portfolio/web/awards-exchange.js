/* MIT. Complete operator CSV intake and exchange over the original portfolio writer. */
"use strict";
function GrantAwardsExchange(H){
  const {state,node,button,field,panel,table,api,response,runOriginal,failure,showDialog,currentEdit,rawDetails}=H;
  let corePromise;
  const core=()=>corePromise??=import("/awards-exchange-core.mjs");
  const current=()=>state().portfolio;
  const need=(value,message)=>{if(!value)throw new Error(message);};
  const utf8=text=>new TextEncoder().encode(text);
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),n=>n.toString(16).padStart(2,"0")).join("");
  const label=row=>[row.code||row.reference,row.title||row.name||row.id].filter(Boolean).join(" · ");
  const clone=value=>JSON.parse(JSON.stringify(value));
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?
    Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const exact=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  function download(bytes,filename,type){
    const url=URL.createObjectURL(new Blob([bytes],{type})),link=node("a");
    link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function currentSelection(portfolio){
    need(current()?.id===portfolio.id&&current()?.revision===portfolio.revision&&current()?.snapshot===portfolio.snapshot&&currentEdit(),
      "The selected portfolio changed. Reopen CSV intake on its latest revision.");
    need(!state().pending,"Continue the saved pending operation before starting this import.");
  }
  function entityPicker(pool,selected,onSelect,name){
    const box=node("div",null,"awards-identity-picker"),search=field("Find "+name,"search"),
      choice=field(name,"select"),note=node("p","","small");
    let term="";
    const paint=()=>{
      const matches=pool.filter(r=>!term||label(r).toLocaleLowerCase().includes(term));
      const shown=matches.slice(0,80),saved=pool.find(r=>r.id===selected);
      if(saved&&!shown.some(r=>r.id===selected))shown.unshift(saved);
      choice.input.replaceChildren();
      for(const [id,title]of [["","Choose an existing record"],...shown.map(r=>[r.id,label(r)])]){
        const option=node("option",title);option.value=id;choice.input.append(option);
      }
      choice.input.value=selected||"";
      note.textContent=matches.length>80?matches.length+" matches; refine the search.":matches.length+" matching records";
    };
    search.input.addEventListener("input",()=>{term=search.input.value.toLocaleLowerCase();paint();});
    choice.input.addEventListener("change",()=>{selected=choice.input.value;onSelect(selected);});
    box.append(search.wrapper,choice.wrapper,note);paint();return box;
  }
  function pagedRows(host,headers,values,renderRow,{searchText=row=>String(row),pageSize=25}={}){
    const search=field("Find imported rows","search"),body=node("div"),pager=node("div",null,"pager");
    let term="",offset=0;
    const paint=()=>{
      const rows=values.filter(row=>!term||searchText(row).toLocaleLowerCase().includes(term));
      if(offset>=rows.length)offset=0;
      body.replaceChildren(table(headers,rows.slice(offset,offset+pageSize).map(renderRow)));
      const previous=button("Previous rows",()=>{offset=Math.max(0,offset-pageSize);paint();}),
        next=button("Next rows",()=>{offset+=pageSize;paint();});
      previous.disabled=offset===0;next.disabled=offset+pageSize>=rows.length;
      pager.replaceChildren(node("span",rows.length?(offset+1)+"–"+Math.min(offset+pageSize,rows.length)+" of "+rows.length+" rows":"No matching rows","small"),previous,next);
    };
    search.input.addEventListener("input",()=>{term=search.input.value.toLocaleLowerCase();offset=0;paint();});
    host.append(search.wrapper,body,pager);paint();
  }
  async function verifiedPlan(module,plan,csv){
    need(plan&&plan.schema==="stellar-forge.awards-csv-import-plan.v1"&&plan.action?.action==="portfolio.save",
      "Choose a complete saved application import plan.");
    need(plan.source?.bytes===csv.length&&plan.source.sha256===await hash(csv),"The selected CSV differs from the saved original plan.");
    need(plan.actionSha256===await hash(utf8(JSON.stringify(plan.action))),"The saved original action has changed.");
    need(plan.portfolio?.id===current()?.id,"Open the portfolio named by the saved import plan.");
    const basis=await api("/api/portfolio?"+new URLSearchParams({id:plan.portfolio.id,revision:plan.portfolio.revision}));
    need(basis.snapshot===plan.portfolio.snapshot,"The saved plan selects a different original portfolio revision.");
    const changes=plan.action.payload?.awards?.changes;
    need(Array.isArray(changes)&&changes.length>0&&changes.every(c=>c.collection==="applications"),"The saved action must contain its complete application intake.");
    const parsed=module.parseAwardCsvText(new TextDecoder("utf-8",{fatal:true}).decode(csv));
    const identities={applications:Object.create(null),partners:Object.create(null),projects:Object.create(null)},statuses=new Set();
    for(const original of parsed.rows){
      const reference=original[plan.mapping.reference],matches=changes.filter(c=>c.fields?.reference===reference);
      need(matches.length===1,"Every CSV reference must retain its one original application action.");
      const c=matches[0];identities.applications[reference]=c.id;statuses.add(c.fields.status);
      const key=original[plan.mapping.partnerKey];
      need(!Object.hasOwn(identities.partners,key)||identities.partners[key]===c.fields.partnerId,"One original partner key must select the same record.");
      identities.partners[key]=c.fields.partnerId;
      if(plan.mapping.projectKey&&original[plan.mapping.projectKey]){
        const key=original[plan.mapping.projectKey];
        need(!Object.hasOwn(identities.projects,key)||identities.projects[key]===c.fields.projectId,"One original project key must select the same record.");
        identities.projects[key]=c.fields.projectId;
      }
    }
    need(statuses.size===1,"One original intake retains its selected application status.");
    const rebuilt=module.prepareAwardCsvImportStructure(basis,{
      operationId:plan.action.operationId,csv,filename:plan.source.filename,documentId:plan.documentId,
      roundId:plan.round.id,actor:plan.action.payload.awards.actor,mapping:plan.mapping,identities,status:[...statuses][0]
    },plan.source.sha256);
    const complete={...rebuilt,actionSha256:await hash(utf8(JSON.stringify(rebuilt.action)))};
    need(exact(plan,complete),"The saved import must match the complete original CSV, mappings, identities and action.");
    return {plan:complete,basis};
  }
  async function open({roundId=""}={}){
    const portfolio=clone(current());currentSelection(portfolio);
    const module=await core();
    const I={portfolio,module,step:"file",bytes:null,parsed:null,filename:"",roundId,actor:portfolio.review.reviewer||"",
      status:"draft",mapping:{profile:{},answers:Object.create(null)},identities:{applications:Object.create(null),partners:Object.create(null),projects:Object.create(null)},
      operationId:"award-csv-"+crypto.randomUUID(),documentId:crypto.randomUUID(),plan:null,resuming:false,busy:false,error:""};
    const root=node("div",null,"awards-intake"),error=node("p","","awards-intake-error"),body=node("div");
    error.setAttribute("role","alert");root.append(error,body);
    const attempt=fn=>async()=>{
      if(I.busy)return;I.busy=true;I.error="";error.textContent="";
      const controls=[...root.querySelectorAll("input,select,textarea,button")].map(n=>[n,n.disabled]);
      controls.forEach(([n])=>{n.disabled=true;});
      try{await fn();}catch(e){I.error=e.message||String(e);error.textContent=I.error;}
      finally{I.busy=false;controls.forEach(([n,value])=>{if(n.isConnected)n.disabled=value;});}
    };
    const chooseColumn=(name,key,group=null,required=false)=>{
      const map=group?I.mapping[group]:I.mapping;
      const f=field(name+(required?" *":""),"select",map[key]||"",[["","Choose a column"],...I.parsed.headers.map(h=>[h,h])]);
      f.input.required=required;
      f.input.addEventListener("change",()=>{if(f.input.value)map[key]=f.input.value;else delete map[key];});
      return f.wrapper;
    };
    const clearPlan=()=>{I.plan=null;I.resuming=false;};
    function filePage(){
      body.replaceChildren(node("h3","1. Select the original CSV"));
      body.append(node("p","Import applications into a published funding round. The complete original CSV and its reviewed column mapping are saved with the applications."));
      const file=field("Original application CSV","file"),filename=field("Retained filename","text",I.filename),
        round=field("Funding round","select",I.roundId,[["","Choose a published round"],
          ...portfolio.definition.awards.records.rounds.filter(r=>!r.archived&&r.publication&&["published","closed"].includes(r.status)).map(r=>[r.id,label(r)])]),
        actor=field("Recording actor","text",I.actor),status=field("Imported status","select",I.status,[["draft","Draft applications"],["submitted","Submitted applications"]]);
      file.input.accept=".csv,text/csv";filename.input.maxLength=200;
      file.input.addEventListener("change",()=>{
        const selected=file.input.files[0];if(selected)filename.input.value=selected.name.replace(/[^A-Za-z0-9._-]/g,"_").replace(/^[^A-Za-z0-9]+/,"")||"Applications.csv";
      });
      body.append(file.wrapper,filename.wrapper,round.wrapper,actor.wrapper,status.wrapper);
      body.append(node("p","Use UTF-8 CSV up to 8 MiB and 2,000 rows. Quoted commas, line breaks and decimal strings are retained. Submitted applications require a mapped submission date.","small"));
      const load=async()=>{
        currentSelection(portfolio);
        const selected=file.input.files[0];need(selected&&selected.size>0&&selected.size<=8*1024*1024,"Select the complete original application CSV, up to 8 MiB.");
        I.bytes=module.originalAwardCsvBytes(new Uint8Array(await selected.arrayBuffer()));
        I.parsed=module.parseAwardCsvText(new TextDecoder("utf-8",{fatal:true}).decode(I.bytes));
        I.filename=filename.input.value;I.roundId=round.input.value;I.actor=actor.input.value;I.status=status.input.value;
        need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(I.filename),"Use a retained filename made of letters, numbers, dots, dashes and underscores.");
      };
      body.append(button("Map CSV columns",attempt(async()=>{
        await load();need(I.roundId&&I.actor.trim(),"Choose the funding round and recording actor.");
        clearPlan();I.step="mapping";mappingPage();
      }),"primary"));
      const resume=panel("Resume a saved import","Select the original CSV above and the complete import plan downloaded before saving."),
        planFile=field("Saved import plan","file");
      planFile.input.accept=".json,application/json";
      resume.append(planFile.wrapper,button("Review original saved import",attempt(async()=>{
        const selected=planFile.input.files[0];need(selected&&selected.size<=2*1024*1024,"Choose the complete saved import plan, up to 2 MiB.");
        const csv=file.input.files[0];need(csv&&csv.size>0&&csv.size<=8*1024*1024,"Select the complete original application CSV above.");
        const bytes=module.originalAwardCsvBytes(new Uint8Array(await csv.arrayBuffer()));
        const saved=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await selected.arrayBuffer()));
        const checked=await verifiedPlan(module,saved,bytes);
        I.bytes=bytes;I.plan=checked.plan;I.portfolio=checked.basis;I.resuming=true;I.step="review";reviewPage();
      })));
      body.append(resume);
    }
    function mappingPage(){
      body.replaceChildren(node("h3","2. Map the application fields"));
      body.append(node("p",I.parsed.rows.length+" original rows · "+I.filename+" · "+label(portfolio.definition.awards.records.rounds.find(r=>r.id===I.roundId))));
      const grid=node("div",null,"form-grid");
      for(const [key,title,required]of [["reference","Application reference",true],["title","Application title",true],
        ["legalName","Applicant legal name",true],["partnerKey","Partner matching key",true],["projectKey","Project matching key",false],
        ["amount","Requested amount",false],["currency","Requested currency",false],["submittedDate","Actual submission date",I.status==="submitted"],
        ["notes","Application notes",false]])grid.append(chooseColumn(title,key,null,required));
      body.append(grid);
      const profile=panel("Applicant profile");
      for(const [key,title]of [["organisationIdentifier","Organisation identifier"],["contactName","Contact name"],
        ["contactEmail","Contact email"],["country","Country"],["summary","Applicant summary"]])
        profile.append(chooseColumn(title,key,"profile"));
      body.append(profile);
      const answers=panel("Published round questions","Map the original answer column for each applicable criterion.");
      for(const c of portfolio.definition.awards.records.rounds.find(r=>r.id===I.roundId).criteria)
        answers.append(chooseColumn(c.title+" · "+c.id,c.id,"answers",I.status==="submitted"&&c.required));
      body.append(answers);
      const preview=panel("Original CSV rows");
      pagedRows(preview,I.parsed.headers,I.parsed.rows,row=>I.parsed.headers.map(h=>row[h]),{searchText:row=>Object.values(row).join(" "),pageSize:10});
      body.append(preview,button("Back to file",()=>filePage()),button("Match existing records",attempt(async()=>{
        currentSelection(portfolio);
        for(const key of ["reference","title","legalName","partnerKey"])need(I.mapping[key],"Map "+key+" to its original CSV column.");
        need((I.mapping.amount===undefined)===(I.mapping.currency===undefined),"Map requested amount and currency together.");
        need(I.status!=="submitted"||I.mapping.submittedDate,"Map the actual submission date.");
        const round=portfolio.definition.awards.records.rounds.find(r=>r.id===I.roundId);
        for(const c of round.criteria)need(I.status!=="submitted"||!c.required||I.mapping.answers[c.id],"Map the required answer: "+c.title);
        const refs=I.parsed.rows.map(row=>row[I.mapping.reference]);
        need(refs.every(r=>r.trim())&&new Set(refs).size===refs.length,"Application references must be nonempty and distinct.");
        const previous=I.identities.applications;I.identities.applications=Object.create(null);
        for(const ref of refs){
          const drafts=portfolio.definition.awards.records.applications.filter(r=>!r.archived&&r.roundId===I.roundId&&r.reference===ref&&r.status==="draft");
          I.identities.applications[ref]=previous[ref]|| (drafts.length===1?drafts[0].id:crypto.randomUUID());
        }
        clearPlan();I.step="identities";identitiesPage();
      }),"primary"));
    }
    function identitiesPage(){
      body.replaceChildren(node("h3","3. Match existing programme records"));
      body.append(node("p","Each CSV key selects an existing programme record. Review the application list to distinguish new records from updates to saved drafts."));
      const partners=portfolio.definition.programme.records.partners.filter(r=>!r.archived),
        projects=portfolio.definition.programme.records.nodes.filter(r=>!r.archived&&r.kind==="project");
      for(const [group,column,pool,title]of [["partners",I.mapping.partnerKey,partners,"Partner"],["projects",I.mapping.projectKey,projects,"Project"]]){
        if(!column)continue;
        const values=[...new Set(I.parsed.rows.map(row=>row[column]))].filter(v=>group==="partners"||v);
        const section=panel(title+" identities",values.length+" distinct CSV keys");
        pagedRows(section,["Original CSV key","Existing programme record"],values,key=>[key,
          entityPicker(pool,I.identities[group][key],id=>{I.identities[group][key]=id;},title+" for "+key)]);
        body.append(section);
      }
      const apps=panel("Application identities","Each new application keeps the generated ID shown here throughout this import. Existing final editions remain in their recorded history.");
      pagedRows(apps,["Reference","Application action","Record ID"],I.parsed.rows,row=>{
        const reference=row[I.mapping.reference],selected=I.identities.applications[reference],
          drafts=portfolio.definition.awards.records.applications.filter(r=>!r.archived&&r.roundId===I.roundId&&r.reference===reference&&r.status==="draft"),
          all=portfolio.definition.awards.records.applications,
          existing=all.find(r=>r.id===selected);
        const fresh=existing?crypto.randomUUID():selected,idText=node("span",selected,"small");
        const f=field("Application "+reference,"select",existing?existing.id:"new",
          [["new","Create new application"],...drafts.map(r=>[r.id,"Update draft revision "+r.revision+" · "+r.id.slice(0,8)])]);
        f.input.addEventListener("change",()=>{I.identities.applications[reference]=f.input.value==="new"?fresh:f.input.value;idText.textContent=I.identities.applications[reference];});
        return [reference,f.wrapper,idText];
      },{searchText:row=>row[I.mapping.reference]+" "+row[I.mapping.title]});
      body.append(apps,button("Back to columns",()=>mappingPage()),button("Review complete import",attempt(async()=>{
        currentSelection(portfolio);
        const sourceSha=await hash(I.bytes);
        const plan=module.prepareAwardCsvImportStructure(portfolio,{
          operationId:I.operationId,csv:I.bytes,filename:I.filename,documentId:I.documentId,roundId:I.roundId,actor:I.actor,
          mapping:I.mapping,identities:I.identities,status:I.status
        },sourceSha);
        I.plan={...plan,actionSha256:await hash(utf8(JSON.stringify(plan.action)))};
        currentSelection(portfolio);I.resuming=false;I.step="review";reviewPage();
      }),"primary"));
    }
    function reviewPage(){
      const plan=I.plan,changes=plan.action.payload.awards.changes,
        updated=changes.filter(c=>c.expectedRevision>0).length,
        records=I.portfolio.definition.programme.records;
      body.replaceChildren(node("h3","4. Review and save the original import"));
      body.append(node("p",(changes.length-updated)+" new applications · "+updated+" draft updates · Portfolio revision "+plan.portfolio.revision));
      body.append(node("p",plan.source.filename+" · "+plan.source.bytes+" bytes · "+plan.action.payload.awards.actor,"small"));
      body.append(node("p","The original CSV and all applications are saved together. Download this complete plan to continue the same import after closing the browser."));
      const applications=panel("Mapped applications");
      pagedRows(applications,["Application","Programme identities","Requested amount","State and original answers"],changes,c=>{
        const f=c.fields,identities=node("div");
        identities.append(node("p",label(records.partners.find(r=>r.id===f.partnerId))));
        if(f.projectId)identities.append(node("p",label(records.nodes.find(r=>r.id===f.projectId))));
        const full=node("div");full.append(node("p",f.status+(f.submittedDate?" · "+f.submittedDate:"")),rawDetails("Original profile and answers",{
          applicantProfile:f.applicantProfile,answers:f.answers,notes:f.notes,evidenceIds:f.evidenceIds}));
        return [[f.reference,f.title].join(" · "),identities,f.requestedAmount?f.requestedAmount.value+" "+f.requestedAmount.currency:"—",full];
      },{searchText:c=>c.fields.reference+" "+c.fields.title});
      body.append(applications,rawDetails("Complete saved import plan",plan));
      const controls=node("div",null,"actions");
      controls.append(button("Download original import plan",()=>download(utf8(JSON.stringify(plan,null,2)+"\n"),
        "Award_Import_"+plan.action.operationId+".json","application/json")));
      if(!I.resuming)controls.append(button("Back to record matching",()=>{clearPlan();identitiesPage();}));
      controls.append(button(I.resuming?"Continue original import":"Save reviewed import",attempt(async()=>{
        const checked=await verifiedPlan(module,plan,I.bytes);
        need(exact(checked.plan,plan),"The complete reviewed plan changed.");
        let original=null;
        try{original=await api("/api/request?id="+encodeURIComponent(plan.action.operationId));}
        catch(e){if(e.code!=="NOT_FOUND")throw e;}
        if(original){
          need(exact(original.input,plan.action),"A different input already uses this original operation ID.");
          need(!state().pending||state().pending.operationId===plan.action.operationId,"Continue the other pending operation first.");
        }else{
          currentSelection(I.portfolio);
          const uploaded=await api("/api/programme/upload",{method:"POST",headers:{
            "Content-Type":"application/octet-stream","X-Content-SHA256":plan.source.sha256},body:I.bytes});
          need(uploaded.sha256===plan.source.sha256&&uploaded.bytes===plan.source.bytes,"The complete original CSV upload changed.");
          currentSelection(I.portfolio);
        }
        const result=await runOriginal(plan.action);
        body.replaceChildren(node("h3","Applications saved"),node("p",plan.rows+" applications were saved in portfolio revision "+result.revision+"."),
          button("Download original import plan",()=>download(utf8(JSON.stringify(plan,null,2)+"\n"),"Award_Import_"+plan.action.operationId+".json","application/json")));
      }),"primary"));
      body.append(controls);
    }
    filePage();showDialog("Application CSV intake",[root]);
  }
  async function openExports({roundId=""}={}){
    const portfolio=clone(current());need(portfolio?.definition.awards,"Open a saved awards portfolio revision.");
    const module=await core(),root=node("div"),error=node("p","","awards-intake-error");
    error.setAttribute("role","alert");
    root.append(node("p","Download applications from portfolio revision "+portfolio.revision+". JSON retains the complete original records. CSV retains their original string values and answer columns."),
      error);
    const round=field("Export funding round","select",roundId,[["","All funding rounds"],...portfolio.definition.awards.records.rounds.map(r=>[r.id,label(r)])]),
      safe=field("Spreadsheet handling","select","true",[["true","Protect formula-like cells"],["false","Literal original CSV strings"]]);
    root.append(round.wrapper,safe.wrapper);
    const run=format=>async()=>{
      try{
        error.textContent="";
        const file=module.encodeAwardApplications(portfolio,{...(round.input.value?{roundId:round.input.value}:{}),format,spreadsheetSafe:safe.input.value==="true"});
        const digest=await hash(file.bytes);
        download(file.bytes,"Award_Applications_"+portfolio.id+"_r"+portfolio.revision+"."+format,file.contentType);
        const receipt={...file,bytes:file.bytes.length,sha256:digest};root.append(rawDetails("Downloaded "+format.toUpperCase()+" selection",receipt));
      }catch(e){error.textContent=e.message||String(e);}
    };
    root.append(button("Download application JSON",run("json")),button("Download application CSV",run("csv")));
    showDialog("Application exchange",[root]);
  }
  return {open,openExports};
}
