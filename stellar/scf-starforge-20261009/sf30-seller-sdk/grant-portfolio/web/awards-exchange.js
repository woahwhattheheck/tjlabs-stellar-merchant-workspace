/* MIT. Complete operator CSV intake and exchange over the original portfolio writer. */
"use strict";
function GrantAwardsExchange(H){
  const {state,node,button,field,panel,table,api,response,runOriginal,failure,showDialog,currentEdit,rawDetails}=H;
  let corePromise;
  const core=()=>corePromise??=import("/awards-exchange-core.mjs");
  let sessionsPromise;
  const sessions=()=>sessionsPromise??=import("/awards-import-session-core.mjs");
  let rowReviewPromise;
  const rowReviews=()=>rowReviewPromise??=import("/awards-import-row-review.mjs");
  const current=()=>state().portfolio;
  const need=(value,message)=>{if(!value)throw new Error(message);};
  const utf8=text=>new TextEncoder().encode(text);
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),n=>n.toString(16).padStart(2,"0")).join("");
  const label=row=>[row.code||row.reference,row.title||row.name||row.id].filter(Boolean).join(" · ");
  const clone=value=>JSON.parse(JSON.stringify(value));
  const pythonStrip=value=>value.replace(/^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g,"");
  const setKey=(object,key,value)=>Object.defineProperty(object,key,{value,writable:true,enumerable:true,configurable:true});
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
  async function open({roundId="",libraryOnly=false,continuationSeed=null}={}){
    const portfolio=clone(current());need(portfolio,"Open a saved portfolio first.");if(!libraryOnly)currentSelection(portfolio);
    const module=await core();
    const I={portfolio,module,step:"file",bytes:null,parsed:null,filename:"",roundId,actor:portfolio.review.reviewer||"",
      status:"draft",mapping:{profile:{},answers:Object.create(null)},identities:{applications:Object.create(null),partners:Object.create(null),projects:Object.create(null)},
      operationId:"award-csv-"+crypto.randomUUID(),documentId:crypto.randomUUID(),plan:null,resuming:false,busy:false,error:"",
      session:null,batch:null,observation:null,batchRows:1000,sessionId:crypto.randomUUID(),batchDocumentIds:Array.from({length:25000},()=>crypto.randomUUID()),
      rowDecisions:null,rowReview:null,reviewId:crypto.randomUUID(),reviewDocumentId:crypto.randomUUID(),rowFilter:"all",rowSearch:"",rowOffset:0,
      continuation:null,continuationDocumentId:null,continuationWorking:null};
    const root=node("div",null,"awards-intake"),error=node("p","","awards-intake-error"),body=node("div");
    error.setAttribute("role","alert");root.append(error,body);
    const attempt=(fn,{persist=true}={})=>async()=>{
      if(I.busy)return;I.busy=true;I.error="";error.textContent="";
      const controls=[...root.querySelectorAll("input,select,textarea,button")].map(n=>[n,n.disabled]);
      controls.forEach(([n])=>{n.disabled=true;});
      try{await fn();}catch(e){const row=Number.isInteger(e.details?.rowIndex)?"Original row "+(e.details.rowIndex+1)+": ":"";I.error=row+(e.message||String(e));error.textContent=I.error;}
      finally{I.busy=false;controls.forEach(([n,value])=>{if(n.isConnected)n.disabled=value;});if(persist&&I.bytes)changed();}
    };

    const workingEngine=await import("/awards-intake-working.mjs"),library=workingEngine.createIntakeLibrary();
    const binding={id:portfolio.id,revision:portfolio.revision,snapshot:portfolio.snapshot},workspaceId=state().state.workspaceId;
    let localRecord=null,localSource=null,saveTimer=null,savePromise=null,changeNumber=0,savedNumber=0,saveError=null,
      candidate=null,libraryRows=[],libraryOffset=0,libraryTerm="",restoring=false,originalRead=null,downloadProof=null;
    const libraryPanel=panel("Saved intake work","This browser retains complete original CSVs and unfinished intake work. A portable working file carries both into a fresh browser. Opening or restoring data does not submit an application."),
      saveStatus=node("p","Select an original CSV to begin local retention.","small"),libraryBody=node("div"),
      libraryDetail=node("div"),libraryPager=node("div",null,"pager"),libraryChoice=field("Retained intake working copy","select"),
      librarySearch=field("Find saved intake work","search"),checkpointChoice=field("Retained checkpoint","select","current",[["current","Current working state"]]),
      localLabel=field("Working-copy label","text",""),workingInput=field("Open complete intake working file","file");
    libraryPanel.id="intake-library";saveStatus.id="intake-working-status";saveStatus.setAttribute("role","status");
    libraryChoice.input.id="intake-library-list";workingInput.input.id="intake-working-open";workingInput.input.accept=".json,application/json";
    localLabel.input.maxLength=4000;localLabel.input.id="intake-working-label";
    root.insertBefore(libraryPanel,body);
    const controlled=(label,id,fn)=>{const b=button(label,attempt(fn,{persist:false}));b.id=id;return b;};
    function snapshotWork(){
      const keys=["filename","roundId","actor","status","mapping","identities","operationId","documentId","plan","resuming","session","batch",
        "batchRows","sessionId","batchDocumentIds","rowDecisions","rowReview","reviewId","reviewDocumentId","rowFilter","rowSearch","rowOffset","continuation","continuationDocumentId","continuationWorking"];
      const w={stage:I.step,editorRow:I.editorRow??null,editorColumnOffset:I.editorColumnOffset??0,batchRowsLiteral:I.batchRowsLiteral??String(I.batchRows)};
      for(const k of keys)w[k]=I[k]===undefined?null:clone(I[k]);return w;
    }
    function reportSave(error){
      saveError=error;saveStatus.textContent="Local save needs attention: "+(error.message||String(error))+" Current work remains open. Download its complete working file; Close can then retain that exact downloaded state."
    }
    function changed(){
      if(restoring||!I.bytes)return;
      changeNumber++;saveStatus.textContent="Saving complete working state…";
      clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=null;flushWorking().catch(reportSave);},200);
    }
    async function originalSource(){
      need(I.bytes,"Select the complete original CSV first.");
      if(!localSource||localSource.bytesObject!==I.bytes)localSource={bytesObject:I.bytes,descriptor:{bytes:I.bytes.length,sha256:await hash(I.bytes),filename:I.filename}};
      return localSource.descriptor;
    }
    async function flushWorking({checkpointLabel=null,separate=false}={}){
      clearTimeout(saveTimer);saveTimer=null;
      if(savePromise){await savePromise;if(savedNumber===changeNumber&&!checkpointLabel&&!separate)return localRecord;}
      if(!I.bytes)return null;
      if(!checkpointLabel&&!separate&&localRecord&&savedNumber===changeNumber&&!saveError)return localRecord;
      const perform=async()=>{
        do{
          const version=changeNumber,work=snapshotWork(),source=await originalSource();
          let next;
          if(!localRecord||separate){
            next=workingEngine.createIntakeRecord({id:crypto.randomUUID(),label:localLabel.input.value||I.filename,
              workspaceId,portfolio:binding,source,work});
            if(localRecord){next.origin={id:localRecord.id,label:localRecord.label,revision:localRecord.revision,workspaceId:localRecord.workspaceId};
              next.checkpoints=clone(localRecord.checkpoints);if(localRecord.importedRecord)next.importedRecord=clone(localRecord.importedRecord);}
          }else next=workingEngine.updateIntakeRecord(localRecord,work,{label:localLabel.input.value||I.filename,
            ...(checkpointLabel?{checkpointId:crypto.randomUUID(),checkpointLabel}:{})});
          const fresh=!localRecord||separate;
          const written=await library.put(next,{expectedRevision:fresh?null:localRecord.revision,...(fresh?{csv:I.bytes}:{})});
          localRecord=written;savedNumber=version;saveError=null;checkpointLabel=null;separate=false;
        }while(savedNumber!==changeNumber);
        saveStatus.textContent="Saved locally · "+localRecord.label+" · revision "+localRecord.revision;
        return localRecord;
      };
      savePromise=perform();try{return await savePromise;}catch(error){reportSave(error);throw error;}finally{savePromise=null;}
    }
    async function preserveCurrent(){
      if(I.bytes)await flushWorking({checkpointLabel:"Before replacing this intake work"});
    }
    async function currentWorkingFile(){
      need(I.bytes,"Select an original CSV or inspect a retained working copy.");
      const source=await originalSource(),work=snapshotWork();
      // A complete download remains available even if IndexedDB is unavailable.
      let record=localRecord&&exact(localRecord.work,work)&&localRecord.label===(localLabel.input.value||I.filename)?clone(localRecord):localRecord?workingEngine.updateIntakeRecord(localRecord,work,{label:localLabel.input.value||I.filename}):
        workingEngine.createIntakeRecord({id:crypto.randomUUID(),label:localLabel.input.value||I.filename,workspaceId,portfolio:binding,source,work});
      return {record,csv:I.bytes};
    }
    async function downloadComplete(){
      const selected=I.bytes?await currentWorkingFile():candidate;
      need(selected,"Choose current work or inspect a retained copy.");
      const bytes=workingEngine.encodeIntakeWorkingFile(selected.record,selected.csv);
      download(bytes,"Grant_Intake_"+selected.record.id+".working.json","application/json");
      if(I.bytes)downloadProof={work:await hash(utf8(JSON.stringify(canonical(snapshotWork())))),source:(await originalSource()).sha256,label:localLabel.input.value||I.filename};
    }
    async function currentDownloadRetained(){
      return Boolean(I.bytes&&downloadProof&&downloadProof.source===(await originalSource()).sha256&&
        downloadProof.label===(localLabel.input.value||I.filename)&&downloadProof.work===await hash(utf8(JSON.stringify(canonical(snapshotWork())))));
    }
    function paintLibrary(){
      const filtered=libraryRows.filter(r=>!libraryTerm||(r.label+" "+r.source.filename+" "+r.id).toLocaleLowerCase().includes(libraryTerm));
      if(libraryOffset>=filtered.length)libraryOffset=0;
      const selected=libraryChoice.input.value,rows=filtered.slice(libraryOffset,libraryOffset+25);
      libraryChoice.input.replaceChildren(node("option","Choose retained work"));libraryChoice.input.firstChild.value="";
      for(const r of rows){const o=node("option",r.label+" · "+r.stage+" · "+r.updatedAt);o.value=r.id;libraryChoice.input.append(o);}
      if(rows.some(r=>r.id===selected))libraryChoice.input.value=selected;
      const previous=button("Previous saved work",()=>{libraryOffset=Math.max(0,libraryOffset-25);paintLibrary();}),
        next=button("Next saved work",()=>{libraryOffset+=25;paintLibrary();});
      previous.disabled=libraryOffset===0;next.disabled=libraryOffset+25>=filtered.length;
      libraryPager.replaceChildren(node("span",filtered.length?(libraryOffset+1)+"–"+Math.min(libraryOffset+25,filtered.length)+" of "+filtered.length:"No saved intake work for this workspace and portfolio","small"),previous,next);
    }
    async function refreshLibrary(){
      await flushWorking();libraryRows=await library.list(workspaceId,portfolio.id);paintLibrary();
    }
    function inspectCandidate(){
      need(candidate,"Inspect a retained copy or open a complete working file first.");
      const r=candidate.record,comparison=workingEngine.compareIntakeContext(r,{workspaceId,portfolio:binding});
      checkpointChoice.input.replaceChildren();for(const [id,title] of [["current","Current working state"],...r.checkpoints.map(c=>[c.id,c.label+" · "+c.createdAt])]){
        const o=node("option",title);o.value=id;checkpointChoice.input.append(o);
      }
      libraryDetail.replaceChildren(node("h4",r.label),node("p",r.source.bytes+" original CSV bytes · "+r.source.sha256,"small"),
        node("p","Workspace "+r.workspaceId+" · portfolio "+r.portfolio.id+" · original revision "+r.portfolio.revision,"small"),
        node("p",comparison.message),rawDetails("Complete retained working state and checkpoints",r),
        controlled("Download inspected complete working file","intake-inspected-download",async()=>download(workingEngine.encodeIntakeWorkingFile(r,candidate.csv),"Grant_Intake_"+r.id+".working.json","application/json")));
    }
    async function inspectSelected(){
      const id=libraryChoice.input.value;need(id,"Choose a retained intake working copy.");
      const record=await library.get(id);need(record,"The selected working copy is no longer available.");
      const csv=await library.source(record.source.sha256);candidate={record,csv,origin:"library"};inspectCandidate();
    }
    async function restoreCandidate(){
      need(candidate,"Inspect the complete copy before restoring it.");
      const selected=candidate,record=selected.record,cp=checkpointChoice.input.value;
      const work=cp==="current"?record.work:record.checkpoints.find(c=>c.id===cp)?.work;
      need(work,"Choose an original retained checkpoint.");
      const context=workingEngine.compareIntakeContext({...record,work},{workspaceId,portfolio:binding});
      need(context.canRestore,context.message);
      const parsed=module.parseAwardCsvText(new TextDecoder("utf-8",{fatal:true}).decode(selected.csv));
      if(work.rowDecisions){
        need(work.rowDecisions.length===parsed.rows.length,"Keep a decision for every original CSV row.");
        for(const row of work.rowDecisions)for(const key of [...Object.keys(row.corrections),...Object.keys(row.correctionDrafts??{})])
          need(parsed.headers.includes(key),"A retained correction selects an unknown original column.");
      }
      let observation=null,basis=portfolio;
      if(work.session){
        need(work.session.workspaceId===workspaceId&&work.session.portfolio.id===portfolio.id,"The saved session belongs to another native workspace or portfolio.");
        const engine=await sessions();observation=await engine.inspectAwardCsvImportSession(sessionClient,work.session,selected.csv);
        if(work.batch){
          const checked=await engine.reviewAwardCsvSessionBatch(sessionClient,work.session,selected.csv,work.batch.index);
          need(exact(checked.batch,work.batch),"Inspect the original operation and explicitly review this saved batch again before continuing.");
        }
      }else if(work.plan){const checked=await verifiedPlan(module,work.plan,selected.csv);basis=checked.basis;}
      else {
        if(work.continuation){
          const actual=await (await sessions()).readAwardCsvImportContinuation(sessionClient,work.continuation.previous,selected.csv);
          need(exact(actual.continuation,work.continuation),"The retained working continuation differs from its original completed native operations.");
        }
        currentSelection(portfolio);
      }
      // Validate and reconcile first. Retain the entire displaced state before
      // changing any current field or adopting a different source.
      const portable=selected.origin==="file";
      const before=portable?null:await library.get(record.id);
      if(!portable)need(before&&exact(before,record),"This selected local copy changed. Inspect its current revision before restoration.");
      const restoringCurrent=!portable&&localRecord?.id===record.id;
      await preserveCurrent();
      const latest=portable?null:await library.get(record.id),expected=restoringCurrent?localRecord:record;
      if(!portable)need(latest&&exact(latest,expected),"This selected local copy changed. Inspect its current revision before restoration.");
      let adopted;
      if(latest){
        adopted=workingEngine.updateIntakeRecord(latest,work,{checkpointId:crypto.randomUUID(),checkpointLabel:"Before explicit restore"});
        await library.put(adopted,{expectedRevision:latest.revision,csv:selected.csv});
      }else{
        adopted=workingEngine.createIntakeRecord({id:crypto.randomUUID(),label:record.label,workspaceId,portfolio:record.portfolio,source:record.source,work});
        adopted.importedRecord=clone(record);
        adopted.checkpoints=clone(record.checkpoints);
        await library.put(adopted,{csv:selected.csv});
      }
      restoring=true;
      try{
        const keys=["filename","roundId","actor","status","mapping","identities","operationId","documentId","plan","resuming","session","batch",
          "batchRows","sessionId","batchDocumentIds","rowDecisions","rowReview","reviewId","reviewDocumentId","rowFilter","rowSearch","rowOffset","continuation","continuationDocumentId","continuationWorking"];
        for(const key of keys)I[key]=work[key]===undefined?null:clone(work[key]);
        I.bytes=selected.csv;I.parsed=parsed;I.portfolio=basis;I.observation=observation;
        I.step=work.stage;I.editorRow=work.editorRow;I.editorColumnOffset=work.editorColumnOffset??0;I.batchRowsLiteral=work.batchRowsLiteral??String(I.batchRows);
        localRecord=adopted;localSource={bytesObject:I.bytes,descriptor:record.source};localLabel.input.value=adopted.label;
        changeNumber++;savedNumber=changeNumber;saveError=null;
        if(I.session)sessionPage();else if(I.plan)reviewPage();else if(I.step==="rows"&&I.rowDecisions)rowReviewPage();
        else if(I.step==="identities"&&I.rowDecisions)identitiesPage();else if(I.step==="mapping")mappingPage();else filePage();
        saveStatus.textContent="Restored original working data · "+adopted.label+" · no application was submitted";
      }finally{restoring=false;}
      libraryRows=await library.list(workspaceId,portfolio.id);paintLibrary();
    }
    librarySearch.input.addEventListener("input",()=>{libraryTerm=librarySearch.input.value.toLocaleLowerCase();libraryOffset=0;paintLibrary();});
    localLabel.input.addEventListener("input",changed);
    workingInput.input.addEventListener("change",attempt(async()=>{
      const file=workingInput.input.files[0];need(file&&file.size>0&&file.size<=512*1024*1024,"Choose a complete intake working file up to 512 MiB.");
      const opened=workingEngine.parseIntakeWorkingFile(new Uint8Array(await file.arrayBuffer()));
      candidate={...opened,origin:"file"};inspectCandidate();
    },{persist:false}));
    libraryPanel.append(localLabel.wrapper,saveStatus,
      controlled("Save working checkpoint","intake-working-save",async()=>{await flushWorking({checkpointLabel:"Named working checkpoint"});await refreshLibrary();}),
      controlled("Keep as separate working copy","intake-working-separate",async()=>{await flushWorking({separate:true});await refreshLibrary();}),
      controlled("Download complete working file","intake-working-download",downloadComplete),
      workingInput.wrapper,librarySearch.wrapper,libraryChoice.wrapper,libraryPager,
      controlled("Refresh saved intake work","intake-library-refresh",refreshLibrary),
      controlled("Inspect retained intake work","intake-library-inspect",inspectSelected),checkpointChoice.wrapper,
      controlled("Restore inspected working state","intake-library-restore",restoreCandidate),libraryDetail);
    const workingHelp=node("a","Read saved-intake guide");workingHelp.href="/awards-intake-working-guide";workingHelp.target="_blank";workingHelp.rel="noopener";libraryPanel.append(workingHelp);
    // Target handlers first update literal application state; delegated events
    // then coalesce a complete local save without re-reading the CSV.
    root.addEventListener("input",event=>{if(body.contains(event.target))changed();});
    root.addEventListener("change",event=>{if(body.contains(event.target))changed();});
    root.addEventListener("click",event=>{if(body.contains(event.target))queueMicrotask(changed);});
    const onUnload=event=>{if(I.bytes&&(changeNumber!==savedNumber||savePromise||saveError)){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",onUnload);
    const registerRetention=()=>{
      if(H.retainDetail)H.retainDetail(root,async()=>{try{if(originalRead)await originalRead;await flushWorking();}catch(error){reportSave(error);if(!await currentDownloadRetained())throw error;}
        window.removeEventListener("beforeunload",onUnload);});
    };
    const showIntake=()=>{registerRetention();return showDialog("Application CSV intake",[root]);};

    const chooseColumn=(name,key,group=null,required=false)=>{
      const map=group?I.mapping[group]:I.mapping;
      const f=field(name+(required?" *":""),"select",map[key]||"",[["","Choose a column"],...I.parsed.headers.map(h=>[h,h])]);
      f.input.required=required;
      f.input.addEventListener("change",()=>{if(f.input.value)map[key]=f.input.value;else delete map[key];});
      return f.wrapper;
    };
    const clearPlan=()=>{I.plan=null;I.resuming=false;I.session=null;I.batch=null;I.observation=null;};
    function filePage(){
      I.step="file";
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
      for(const [input,key]of [[filename.input,"filename"],[round.input,"roundId"],[actor.input,"actor"],[status.input,"status"]])input.addEventListener(input.tagName==="SELECT"?"change":"input",()=>{I[key]=input.value;});
      if(I.bytes)body.append(node("p","Retained complete CSV: "+I.filename+" · "+I.bytes.length+" bytes. Keep it or choose an explicit replacement.","small"));
      body.append(file.wrapper,filename.wrapper,round.wrapper,actor.wrapper,status.wrapper);
      if(I.rowDecisions)body.append(button("Download current unfinished source review",attempt(downloadWorkingReview)),
        button("Download current original CSV",()=>download(I.bytes,I.filename,"text/csv")));
      body.append(node("p","Use complete UTF-8 CSV up to 64 MiB and 25,000 rows. Sources over 2,000 rows support up to 50 columns and use reviewed batches. Quoted commas, line breaks and decimal strings stay in the original. Submitted applications require a mapped submission date.","small"));
      const selectedSourceContext=()=>need(current()?.id===portfolio.id&&current()?.revision===portfolio.revision&&current()?.snapshot===portfolio.snapshot,
        "The selected portfolio changed. Reopen saved intake work for the intended portfolio.");
      const load=()=>originalRead??=(async()=>{
        selectedSourceContext();
        const selected=file.input.files[0];need(selected?selected.size>0&&selected.size<=64*1024*1024:Boolean(I.bytes),"Select the complete original application CSV, up to 64 MiB.");
        const bytes=selected?module.originalAwardCsvBytes(new Uint8Array(await selected.arrayBuffer())):I.bytes,
          parsed=module.parseAwardCsvText(new TextDecoder("utf-8",{fatal:true}).decode(bytes)),name=filename.input.value;
        need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(name),"Use a retained filename made of letters, numbers, dots, dashes and underscores.");
        selectedSourceContext();
        if(!I.bytes||await hash(I.bytes)!==await hash(bytes)){
          await retainBeforeReplacing();localRecord=null;localSource=null;localLabel.input.value=name;
          I.continuation=null;I.continuationDocumentId=null;I.continuationWorking=null;
          I.rowDecisions=null;I.rowReview=null;I.mapping={profile:{},answers:Object.create(null)};
          I.identities={applications:Object.create(null),partners:Object.create(null),projects:Object.create(null)};
          I.reviewId=crypto.randomUUID();I.reviewDocumentId=crypto.randomUUID();I.sessionId=crypto.randomUUID();
          I.operationId="award-csv-"+crypto.randomUUID();I.documentId=crypto.randomUUID();
          I.batchDocumentIds=Array.from({length:25000},()=>crypto.randomUUID());
        }
        I.bytes=bytes;I.parsed=parsed;I.filename=name;I.roundId=round.input.value;I.actor=actor.input.value;I.status=status.input.value;
        changed();await flushWorking();
      })().finally(()=>{originalRead=null;});
      file.input.addEventListener("change",attempt(async()=>{if(file.input.files[0])await load();}));
      body.append(button("Map CSV columns",attempt(async()=>{
        await load();currentSelection(portfolio);need(I.roundId&&I.actor.trim(),"Choose the funding round and recording actor.");
        clearPlan();I.step="mapping";mappingPage();
      }),"primary"));
      const resume=panel("Resume a saved import","Select the original CSV above and your complete session with reviewed batch, or the original single-import plan. Standalone batch plans are for inspection and the CLI."),
        planFile=field("Saved import plan","file");
      planFile.input.accept=".json,application/json";
      resume.append(planFile.wrapper,button("Review original saved import",attempt(async()=>{
        const selected=planFile.input.files[0];need(selected&&selected.size<=512*1024*1024,"Choose the complete saved review, import plan or session, up to 512 MiB.");
        const csv=file.input.files[0];need(csv?csv.size>0&&csv.size<=64*1024*1024:Boolean(I.bytes),"Select the complete original application CSV above.");
        const bytes=csv?module.originalAwardCsvBytes(new Uint8Array(await csv.arrayBuffer())):I.bytes;
        const saved=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await selected.arrayBuffer()));
        if(saved.schema==="stellar-forge.awards-row-review-working.v1"){
          await restoreWorkingReview(saved,bytes);return;
        }
        if(saved.schema==="stellar-forge.awards-csv-import-session.v1"||saved.schema==="stellar-forge.awards-csv-import-session.v2"||saved.schema==="stellar-forge.awards-csv-import-session.v3"||
          saved.schema==="stellar-forge.awards-browser-session.v1"){
          const selectedSession=saved.schema==="stellar-forge.awards-browser-session.v1"?saved.session:saved;
          need(selectedSession.portfolio?.id===current()?.id,"Open the portfolio named by this saved session.");
          const selectedBatch=saved.reviewedBatch??null,engine=await sessions();
          const observation=await engine.inspectAwardCsvImportSession(sessionClient,selectedSession,bytes);
          if(selectedBatch){
            const actual=await engine.reviewAwardCsvSessionBatch(sessionClient,selectedSession,bytes,selectedBatch.index);
            need(exact(actual.batch,selectedBatch),"The saved batch needs an explicit new review against its original request and history.");
          }
          await retainBeforeReplacing();localRecord=null;localSource=null;
          I.bytes=bytes;I.session=selectedSession;I.batch=selectedBatch;I.filename=selectedSession.source.filename;I.observation=observation;
          I.rowDecisions=null;I.rowReview=null;I.continuation=selectedSession.input.continuation??null;
          I.continuationDocumentId=selectedSession.input.continuationDocumentId??null;I.continuationWorking=null;
          sessionPage();return;
        }
        const checked=await verifiedPlan(module,saved,bytes);
        await retainBeforeReplacing();localRecord=null;localSource=null;
        I.bytes=bytes;I.plan=checked.plan;I.portfolio=checked.basis;I.resuming=true;I.rowDecisions=null;I.rowReview=null;I.step="review";reviewPage();
      })));
      body.append(resume);
    }
    function mappingPage(){
      I.step="mapping";
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
      body.append(preview,button("Back to file",()=>filePage()),button("Review original source rows",attempt(async()=>{
        currentSelection(portfolio);
        for(const key of ["reference","title","legalName","partnerKey"])need(I.mapping[key],"Map "+key+" to its original CSV column.");
        need((I.mapping.amount===undefined)===(I.mapping.currency===undefined),"Map requested amount and currency together.");
        need(I.status!=="submitted"||I.mapping.submittedDate,"Map the actual submission date.");
        const round=portfolio.definition.awards.records.rounds.find(r=>r.id===I.roundId);
        for(const c of round.criteria)need(I.status!=="submitted"||!c.required||I.mapping.answers[c.id],"Map the required answer: "+c.title);
        if(!I.rowDecisions)I.rowDecisions=I.parsed.rows.map((row,rowIndex)=>({rowIndex,disposition:"pending",reason:"",applicationId:crypto.randomUUID(),corrections:{},correctionDrafts:{}}));
        clearPlan();I.step="rows";rowReviewPage();
      }),"primary"));
    }

    function carriedIndex(index){
      return Boolean(I.continuation&&I.continuation.previous.input.rowReview.rows[index]?.disposition==="accepted");
    }
    function effectiveRow(index){
      return {...I.parsed.rows[index],...(I.rowDecisions?.[index]?.corrections??{})};
    }
    function reviewInput(){
      return {reviewId:I.reviewId,csv:I.bytes,filename:I.filename,roundId:I.roundId,actor:I.actor,status:I.status,
        mapping:clone(I.mapping),identities:clone(I.identities),
        decisions:I.rowDecisions.map(row=>({rowIndex:row.rowIndex,disposition:row.disposition,reason:row.reason,
          ...(row.disposition==="accepted"?{applicationId:row.applicationId}:{}),corrections:clone(row.corrections)})),
        ...(I.continuation?{previousReviewSha256:I.continuation.previous.input.rowReview.sha256}:{})};
    }
    async function workingReviewValue(){
      need(I.bytes&&I.parsed,"Choose the complete original CSV first.");
      return {schema:"stellar-forge.awards-row-review-working.v1",portfolio:{id:portfolio.id,revision:portfolio.revision,snapshot:portfolio.snapshot},
        source:{sha256:await hash(I.bytes),bytes:I.bytes.length,filename:I.filename},
        selection:{roundId:I.roundId,actor:I.actor,status:I.status,mapping:clone(I.mapping),identities:clone(I.identities)},
        decisions:clone(I.rowDecisions),reviewId:I.reviewId,reviewDocumentId:I.reviewDocumentId,
        sessionId:I.sessionId,operationId:I.operationId,documentId:I.documentId,batchDocumentIds:[...I.batchDocumentIds],batchRows:I.batchRows,
        position:{filter:I.rowFilter,search:I.rowSearch,offset:I.rowOffset},
        ...(I.continuation?{continuation:clone(I.continuation),continuationDocumentId:I.continuationDocumentId,continuationWorking:clone(I.continuationWorking)}:{})};
    }
    async function downloadWorkingReview(){
      const value=await workingReviewValue(),digest=await hash(utf8(JSON.stringify(canonical(value))));
      const saved={...value,sha256:digest},bytes=utf8(JSON.stringify(saved,null,2)+"\n");
      need(bytes.length<=512*1024*1024,"The complete unfinished review exceeds the 512 MiB saved-file limit. Keep the original source and reduce working text explicitly.");
      download(bytes,"Award_Unfinished_Review_"+I.reviewId+".json","application/json");
      I.lastWorkingSave=digest;
    }
    async function retainBeforeReplacing(){await preserveCurrent();}
    async function restoreWorkingReview(saved,bytes){
      const {sha256,...value}=saved;
      need(typeof sha256==="string"&&sha256===await hash(utf8(JSON.stringify(canonical(value)))),"The saved unfinished review changed.");
      need(exact(value.portfolio,{id:portfolio.id,revision:portfolio.revision,snapshot:portfolio.snapshot}),
        "Open the original portfolio revision for this unfinished review; keep this file and original CSV intact.");
      need(value.source?.bytes===bytes.length&&value.source.sha256===await hash(bytes),"Choose the exact complete original CSV for this unfinished review.");
      const parsed=module.parseAwardCsvText(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      need([value.reviewId,value.reviewDocumentId,value.sessionId,value.documentId].every(id=>uuid.test(id))&&
        Array.isArray(value.batchDocumentIds)&&value.batchDocumentIds.length>0&&value.batchDocumentIds.length<=25000&&
        value.batchDocumentIds.every(id=>uuid.test(id))&&new Set(value.batchDocumentIds).size===value.batchDocumentIds.length,
        "Keep the complete allocated review and operation identities.");
      need(typeof value.operationId==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,149}$/.test(value.operationId),
        "Keep the original batch operation prefix.");
      const selection=value.selection;
      need(selection&&typeof selection.actor==="string"&&["draft","submitted"].includes(selection.status)&&
        portfolio.definition.awards.records.rounds.some(r=>r.id===selection.roundId)&&
        selection.mapping&&selection.identities&&typeof selection.identities.partners==="object"&&
        typeof selection.identities.applications==="object","The unfinished selection is incomplete.");
      const decisions=value.decisions;
      need(Array.isArray(decisions)&&decisions.length===parsed.rows.length&&decisions.every((row,index)=>
        row&&row.rowIndex===index&&["pending","accepted","exception","non_application"].includes(row.disposition)&&
        typeof row.reason==="string"&&row.reason.length<=4000&&uuid.test(row.applicationId)&&
        row.corrections&&typeof row.corrections==="object"&&!Array.isArray(row.corrections)&&
        Object.entries(row.corrections).every(([key,text])=>parsed.headers.includes(key)&&typeof text==="string"&&!text.includes("\0"))&&
        (row.correctionDrafts===undefined||row.correctionDrafts&&typeof row.correctionDrafts==="object"&&!Array.isArray(row.correctionDrafts)&&
          Object.entries(row.correctionDrafts).every(([key,text])=>parsed.headers.includes(key)&&typeof text==="string"&&!text.includes("\0")))),
        "Keep one complete literal decision for every original source row.");
      need(Number.isSafeInteger(value.batchRows)&&value.batchRows>=1&&value.batchRows<=2000,"Keep the selected reviewed batch size.");
      if(value.continuation){
        const actual=await (await sessions()).readAwardCsvImportContinuation(sessionClient,value.continuation.previous,bytes);
        need(exact(actual.continuation,value.continuation),"The unfinished continuation differs from its original completed native outcomes.");
        need(uuid.test(value.continuationDocumentId),"Keep the original continuation evidence document UUID.");
      }
      currentSelection(portfolio);
      await retainBeforeReplacing();localRecord=null;localSource=null;
      I.bytes=bytes;I.parsed=parsed;I.filename=value.source.filename;
      Object.assign(I,clone(selection),{rowDecisions:clone(decisions).map(row=>({...row,correctionDrafts:row.correctionDrafts??clone(row.corrections)})),reviewId:value.reviewId,reviewDocumentId:value.reviewDocumentId,
        sessionId:value.sessionId,operationId:value.operationId,documentId:value.documentId,
        batchDocumentIds:[...value.batchDocumentIds],batchRows:value.batchRows,
        rowFilter:["all","pending","accepted","exception","non_application"].includes(value.position?.filter)?value.position.filter:"all",
        rowSearch:typeof value.position?.search==="string"?value.position.search:"",rowOffset:Number.isSafeInteger(value.position?.offset)?value.position.offset:0});
      I.continuation=value.continuation??null;I.continuationDocumentId=value.continuationDocumentId??null;I.continuationWorking=value.continuationWorking??null;
      clearPlan();I.rowReview=null;I.step="rows";rowReviewPage();
    }
    function rowReviewPage(){
      I.step="rows";
      need(I.rowDecisions,"Select the original source rows first.");
      body.replaceChildren(node("h3","3. Account for every original source row"));
      body.append(node("p","Accept an application, retain a reviewed exception, or record an agreed non-application. Literal corrections are separate from the unchanged original CSV. Pending rows must be decided before native saving."));
      if(I.continuation)body.append(node("p","Previously completed accepted rows are retained as recorded outcomes. Review remaining exceptions or non-applications below; only newly accepted rows will be submitted."),
        rawDetails("Complete prior session and native outcomes",I.continuation));
      const summary=node("p"),search=field("Find original or corrected row values","search",I.rowSearch),
        filter=field("Row disposition","select",I.rowFilter,[["all","All original rows"],["pending","Still to review"],["accepted","Accepted applications"],["exception","Reviewed exceptions"],["non_application","Agreed non-applications"]]),
        rowsHost=node("div"),pager=node("div",null,"pager"),editor=node("section",null,"panel");
      const invalidate=()=>{I.rowReview=null;clearPlan();};
      const count=()=>{
        const counts={pending:0,accepted:0,exception:0,non_application:0};
        I.rowDecisions.forEach(row=>counts[row.disposition]++);
        summary.textContent=I.rowDecisions.length+" original rows · "+counts.accepted+" accepted · "+counts.exception+
          " exceptions · "+counts.non_application+" non-applications · "+counts.pending+" still to review";
      };
      const openRow=index=>{
        if(I.editorRow!==index)I.editorColumnOffset=0;I.editorRow=index;
        const decision=I.rowDecisions[index],original=I.parsed.rows[index];
        editor.replaceChildren(node("h4","Original source row "+(index+1)));
        const carried=carriedIndex(index);
        if(carried)editor.append(node("p","Recorded in a completed original operation. Its accepted decision, corrections and application identity remain unchanged."));
        editor.append(node("p","Only checked working corrections change the mapped application. Every original value remains in the source file and its row identity."));
        const disposition=field("Disposition for row "+(index+1),"select",decision.disposition,
          [["pending","Still to review"],["accepted","Accepted application"],["exception","Reviewed exception"],["non_application","Agreed non-application"]]),
          reason=field("Reason / agreement for row "+(index+1),"text",decision.reason);
        disposition.input.disabled=carried;reason.input.disabled=carried;
        disposition.input.addEventListener("change",()=>{decision.disposition=disposition.input.value;invalidate();count();});
        reason.input.maxLength=4000;reason.input.addEventListener("input",()=>{decision.reason=reason.input.value;invalidate();});
        editor.append(disposition.wrapper,reason.wrapper,node("p","Stable application ID: "+decision.applicationId,"small"));
        let offset=Number.isSafeInteger(I.editorColumnOffset)?I.editorColumnOffset:0;if(offset>=I.parsed.headers.length)offset=0;
        const fields=node("div"),controls=node("div",null,"pager");
        const paintColumns=()=>{
          I.editorColumnOffset=offset;fields.replaceChildren();
          for(const header of I.parsed.headers.slice(offset,offset+20)){
            const section=node("div",null,"panel"),originalText=node("pre",original[header]),labelText=node("label","Use a literal working correction"),
              enabled=node("input"),text=node("textarea");
            enabled.type="checkbox";enabled.checked=Object.hasOwn(decision.corrections,header);enabled.disabled=carried;
            enabled.setAttribute("aria-label","Correct "+header+" in row "+(index+1));
            let literal=Object.hasOwn(decision.correctionDrafts??{},header)?decision.correctionDrafts[header]:enabled.checked?decision.corrections[header]:original[header];
            text.value=literal;text.disabled=carried||!enabled.checked;
            text.setAttribute("aria-label","Working "+header+" in row "+(index+1));
            enabled.addEventListener("change",()=>{text.disabled=!enabled.checked;setKey(decision.correctionDrafts??=(Object.create(null)),header,literal);
              if(enabled.checked)setKey(decision.corrections,header,literal);else delete decision.corrections[header];invalidate();});
            text.addEventListener("input",()=>{literal=text.value;setKey(decision.correctionDrafts??=(Object.create(null)),header,literal);
              if(enabled.checked)setKey(decision.corrections,header,literal);invalidate();});
            labelText.prepend(enabled);section.append(node("h5",header),node("span","Original literal value","small"),originalText,labelText,text);fields.append(section);
          }
          const prev=button("Previous columns",()=>{offset-=20;paintColumns();}),next=button("Next columns",()=>{offset+=20;paintColumns();});
          prev.disabled=offset===0;next.disabled=offset+20>=I.parsed.headers.length;
          controls.replaceChildren(node("span",(offset+1)+"–"+Math.min(offset+20,I.parsed.headers.length)+" of "+I.parsed.headers.length+" columns","small"),prev,next);
        };
        editor.append(fields,controls,button("Return to source row list",()=>{I.editorRow=null;I.editorColumnOffset=0;editor.replaceChildren();paint();}));
        paintColumns();editor.scrollIntoView({block:"start",behavior:"smooth"});
      };
      const paint=()=>{
        count();const term=I.rowSearch.toLocaleLowerCase();
        const matching=I.rowDecisions.filter(row=>(I.rowFilter==="all"||row.disposition===I.rowFilter)&&
          (!term||[(row.rowIndex+1),row.reason,...Object.values(I.parsed.rows[row.rowIndex]),...Object.values(row.corrections)].join(" ").toLocaleLowerCase().includes(term)));
        if(I.rowOffset>=matching.length)I.rowOffset=0;
        rowsHost.replaceChildren(table(["Original data row","Effective reference","Disposition","Reason / agreement","Working corrections","Inspect"],
          matching.slice(I.rowOffset,I.rowOffset+25).map(row=>{
            const choice=field("Disposition row "+(row.rowIndex+1),"select",row.disposition,
              [["pending","Still to review"],["accepted","Accepted application"],["exception","Reviewed exception"],["non_application","Agreed non-application"]]),
              reason=field("Reason row "+(row.rowIndex+1),"text",row.reason);
            choice.input.disabled=carriedIndex(row.rowIndex);reason.input.disabled=carriedIndex(row.rowIndex);
            choice.input.addEventListener("change",()=>{row.disposition=choice.input.value;invalidate();count();});
            reason.input.maxLength=4000;reason.input.addEventListener("input",()=>{row.reason=reason.input.value;invalidate();});
            return [String(row.rowIndex+1),effectiveRow(row.rowIndex)[I.mapping.reference],choice.wrapper,reason.wrapper,
              String(Object.keys(row.corrections).length),button("Inspect original row "+(row.rowIndex+1),()=>openRow(row.rowIndex))];
          })));
        const previous=button("Previous source rows",()=>{I.rowOffset=Math.max(0,I.rowOffset-25);paint();}),
          next=button("Next source rows",()=>{I.rowOffset+=25;paint();});
        previous.disabled=I.rowOffset===0;next.disabled=I.rowOffset+25>=matching.length;
        pager.replaceChildren(node("span",matching.length?(I.rowOffset+1)+"–"+Math.min(I.rowOffset+25,matching.length)+" of "+matching.length+" matching rows":"No matching source rows","small"),previous,next);
      };
      search.input.addEventListener("input",()=>{I.rowSearch=search.input.value;I.rowOffset=0;paint();});
      filter.input.addEventListener("change",()=>{I.rowFilter=filter.input.value;I.rowOffset=0;paint();});
      const markUnique=button("Accept pending rows with unique references",()=>{
        const counts=new Map();for(const row of I.rowDecisions){if(!["pending","accepted"].includes(row.disposition))continue;const ref=effectiveRow(row.rowIndex)[I.mapping.reference];counts.set(ref,(counts.get(ref)||0)+1);}
        for(const row of I.rowDecisions){const ref=effectiveRow(row.rowIndex)[I.mapping.reference];
          if(row.disposition==="pending"&&ref&&pythonStrip(ref)===ref&&counts.get(ref)===1)row.disposition="accepted";}
        invalidate();paint();
      });
      body.append(summary,search.wrapper,filter.wrapper,markUnique,rowsHost,pager,editor,
        button("Download unfinished source review",attempt(downloadWorkingReview)),
        button("Download original CSV",()=>download(I.bytes,I.filename,"text/csv")),
        ...(I.continuation?[]:[button("Back to column mapping",()=>mappingPage())]),
        button("Match accepted programme records",attempt(async()=>{
          currentSelection(portfolio);
          need(I.rowDecisions.every(r=>r.disposition!=="pending"),"Decide every original row before preparing its accepted applications.");
          need(I.rowDecisions.every(r=>(r.disposition==="accepted"&&!Object.keys(r.corrections).length)||r.reason.trim()),"Record a reason for each correction, reviewed exception and agreed non-application.");
          const accepted=I.rowDecisions.filter(r=>r.disposition==="accepted"),refs=new Set(),ids=new Set(),applications=Object.create(null),draftsByReference=new Map();
          for(const record of portfolio.definition.awards.records.applications){
            if(record.archived||record.roundId!==I.roundId||record.status!=="draft")continue;
            const list=draftsByReference.get(record.reference)??[];list.push(record);draftsByReference.set(record.reference,list);
          }
          for(const row of accepted){
            const ref=effectiveRow(row.rowIndex)[I.mapping.reference];
            need(ref&&pythonStrip(ref)===ref&&!refs.has(ref),"Accepted row "+(row.rowIndex+1)+" needs a nonempty unique reference without surrounding whitespace; retain a correction or change its disposition.");
            refs.add(ref);if(carriedIndex(row.rowIndex)){need(!ids.has(row.applicationId),"Carried application identities remain distinct.");ids.add(row.applicationId);applications[ref]=row.applicationId;continue;}
            const prior=I.identities.applications[ref];
            if(prior)row.applicationId=prior;
            const drafts=draftsByReference.get(ref)??[];
            if(!prior&&drafts.length===1)row.applicationId=drafts[0].id;
            need(!ids.has(row.applicationId),"Accepted rows must keep distinct application identities.");ids.add(row.applicationId);applications[ref]=row.applicationId;
          }
          I.identities.applications=applications;clearPlan();I.rowReview=null;I.step="identities";identitiesPage();
        }),"primary"));
      paint();if(Number.isSafeInteger(I.editorRow)&&I.editorRow>=0&&I.editorRow<I.rowDecisions.length)openRow(I.editorRow);
    }

    function identitiesPage(){
      I.step="identities";
      body.replaceChildren(node("h3","3. Match existing programme records"));
      body.append(node("p","Each CSV key selects an existing programme record. Review the application list to distinguish new records from updates to saved drafts."));
      const accepted=I.rowDecisions?I.rowDecisions.filter(r=>r.disposition==="accepted"&&!carriedIndex(r.rowIndex)).map(r=>({rowIndex:r.rowIndex,row:effectiveRow(r.rowIndex)})):I.parsed.rows.map((row,rowIndex)=>({rowIndex,row}));
      const partners=portfolio.definition.programme.records.partners.filter(r=>!r.archived),
        projects=portfolio.definition.programme.records.nodes.filter(r=>!r.archived&&r.kind==="project");
      for(const [group,column,pool,title]of [["partners",I.mapping.partnerKey,partners,"Partner"],["projects",I.mapping.projectKey,projects,"Project"]]){
        if(!column)continue;
        const values=[...new Set(accepted.map(({row})=>row[column]))].filter(v=>group==="partners"||v);
        const section=panel(title+" identities",values.length+" distinct CSV keys");
        pagedRows(section,["Original CSV key","Existing programme record"],values,key=>[key,
          I.continuation&&I.continuation.previous.input.rowReview.rows.some(r=>r.disposition==="accepted"&&effectiveRow(r.rowIndex)[column]===key)?
            node("span",label(pool.find(r=>r.id===I.identities[group][key])??{id:I.identities[group][key]})+" · original carried binding"):
            entityPicker(pool,I.identities[group][key],id=>{setKey(I.identities[group],key,id);I.rowReview=null;},title+" for "+key)]);
        body.append(section);
      }
      const apps=panel("Application identities","Each new application keeps the generated ID shown here throughout this import. Existing final editions remain in their recorded history.");
      pagedRows(apps,["Original row / reference","Application action","Record ID"],accepted,({row,rowIndex})=>{
        const reference=row[I.mapping.reference],selected=I.identities.applications[reference],
          drafts=portfolio.definition.awards.records.applications.filter(r=>!r.archived&&r.roundId===I.roundId&&r.reference===reference&&r.status==="draft"),
          all=portfolio.definition.awards.records.applications,
          existing=all.find(r=>r.id===selected);
        const fresh=existing?crypto.randomUUID():selected,idText=node("span",selected,"small");
        const f=field("Application "+reference,"select",existing?existing.id:"new",
          [["new","Create new application"],...drafts.map(r=>[r.id,"Update draft revision "+r.revision+" · "+r.id.slice(0,8)])]);
        f.input.addEventListener("change",()=>{I.identities.applications[reference]=f.input.value==="new"?fresh:f.input.value;
          if(I.rowDecisions)I.rowDecisions[rowIndex].applicationId=I.identities.applications[reference];
          I.rowReview=null;idText.textContent=I.identities.applications[reference];});
        return [(rowIndex+1)+" · "+reference,f.wrapper,idText];
      },{searchText:({row,rowIndex})=>(rowIndex+1)+" "+row[I.mapping.reference]+" "+row[I.mapping.title]});
      const batchRows=field("Maximum rows per reviewed batch","number",I.batchRowsLiteral??String(I.batchRows));
      batchRows.input.min="1";batchRows.input.max="2000";
      batchRows.input.addEventListener("input",()=>{I.batchRowsLiteral=batchRows.input.value;I.batchRows=Number(batchRows.input.value);});
      body.append(apps,batchRows.wrapper,
        button("Prepare reviewed batches",attempt(prepareBatches)),
        button("Download unfinished source review",attempt(downloadWorkingReview)),
        button("Back to original row review",()=>rowReviewPage()),button("Review complete import",attempt(async()=>{
        currentSelection(portfolio);
        if(I.rowDecisions||I.parsed.rows.length>2000){await prepareBatches();return;}
        const sourceSha=await hash(I.bytes);
        const plan=module.prepareAwardCsvImportStructure(portfolio,{
          operationId:I.operationId,csv:I.bytes,filename:I.filename,documentId:I.documentId,roundId:I.roundId,actor:I.actor,
          mapping:I.mapping,identities:I.identities,status:I.status
        },sourceSha);
        I.plan={...plan,actionSha256:await hash(utf8(JSON.stringify(plan.action)))};
        currentSelection(portfolio);I.resuming=false;I.step="review";reviewPage();
      }),"primary"));
    }

    // The same portable session engine drives CLI and browser. Writes remain in
    // the original runOriginal route, retaining the workspace's pending action.
    const sessionClient={
      state:()=>api("/api/state"),
      portfolio:(id,{revision}={})=>api("/api/portfolio?"+new URLSearchParams({id,...(revision===undefined?{}:{revision})})),
      request:async id=>{
        try{return await api("/api/request?id="+encodeURIComponent(id));}
        catch(error){if(error.code==="NOT_FOUND"){error.status=404;error.nativeCode="NOT_FOUND";}throw error;}
      },
      uploadProgrammeDocument:({body,sha256})=>api("/api/programme/upload",{method:"POST",
        headers:{"Content-Type":"application/octet-stream","X-Content-SHA256":sha256},body}),
      action:async action=>{
        need(!state().pending||state().pending.operationId===action.operationId,"Continue the other original pending operation first.");
        await runOriginal(action);
        return api("/api/request?id="+encodeURIComponent(action.operationId));
      },
      resume:async id=>{
        const original=await api("/api/request?id="+encodeURIComponent(id));
        need(original.state==="FAILED"&&original.error?.retryable===true,"Only the original retryable failed request may resume.");
        need(!state().pending||state().pending.operationId===id,"Continue the other original pending operation first.");
        await api("/api/resume",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operationId:id})});
        await runOriginal(original.input);
        return api("/api/request?id="+encodeURIComponent(id));
      }
    };
    function savedSession(){
      return {schema:"stellar-forge.awards-browser-session.v1",session:I.session,reviewedBatch:I.batch};
    }
    function downloadSession(){
      download(utf8(JSON.stringify(savedSession(),null,2)+"\n"),"Award_Session_"+I.session.sessionId+".json","application/json");
    }
    async function prepareBatches(){
      currentSelection(portfolio);
      need(Number.isSafeInteger(I.batchRows)&&I.batchRows>=1&&I.batchRows<=2000,"Choose a maximum batch size from 1 to 2,000 rows.");
      const engine=await sessions(),workspace=await sessionClient.state();
      if(I.rowDecisions)I.rowReview=(await rowReviews()).prepareAwardCsvRowReview(portfolio,reviewInput());
      const common={csv:I.bytes,filename:I.filename,roundId:I.roundId,actor:I.actor,
        mapping:I.mapping,identities:I.identities,status:I.status,
        ...(I.rowReview?{rowReview:I.rowReview,reviewDocumentId:I.reviewDocumentId}:{}),
        ...(I.continuation?{continuation:I.continuation,continuationDocumentId:I.continuationDocumentId}:{})};
      const batches=engine.proposeAwardCsvImportBatches(portfolio,common,{
        operationPrefix:I.operationId,documentIds:I.batchDocumentIds,maxRows:I.batchRows});
      I.session=engine.prepareAwardCsvImportSession(portfolio,{...common,sessionId:I.sessionId,
        workspaceId:workspace.workspaceId,batches});
      I.batch=null;I.observation=await engine.inspectAwardCsvImportSession(sessionClient,I.session,I.bytes);
      currentSelection(portfolio);sessionPage();
    }
    function sessionPage(){
      I.step="session";
      const session=I.session,observation=I.observation,enginePromise=sessions();
      body.replaceChildren(node("h3","4. Review the complete import session"));
      body.append(node("p",session.sourceRows+" original rows in "+session.batches.length+" separately reviewed batches · "+
        (observation?.recordedRows??observation?.completedRows??0)+" rows recorded"),
        node("p",session.source.filename+" · "+session.source.bytes+" original bytes · SHA-256 "+session.source.sha256,"small"),
        node("p","Keep the original CSV and download this complete session before saving a batch. Each batch retains the same full source. Completed batches stay recorded when you close or reopen the session."));
      if(session.input.rowReview){
        const review=session.input.rowReview,counts=review.counts;
        body.append(node("p",counts.accepted+" accepted · "+counts.exception+" reviewed exceptions · "+counts.non_application+" agreed non-applications. "+
          "Every original row remains in the complete CSV and retained decision document."),
          button("Download complete row review",attempt(async()=>download((await rowReviews()).encodeAwardCsvRowReview(review),
            "Award_Row_Review_"+review.reviewId+".json","application/json"))),
          button("Download original CSV",()=>download(I.bytes,session.source.filename,"text/csv")),
          rawDetails("Complete source-row decisions and working corrections",review));
      }
      body.append(button("Download complete session and reviewed batch",downloadSession),
        button("Inspect original operations",attempt(async()=>{
          I.observation=await (await enginePromise).inspectAwardCsvImportSession(sessionClient,session,I.bytes);
          sessionPage();
        })));
      if(session.input.continuation)body.append(node("p",(observation?.carriedRows??session.input.continuation.previous.input.rowReview.counts.accepted)+
        " accepted rows retained from earlier completed operations · "+session.batches.reduce((n,b)=>n+b.rows,0)+" newly accepted rows in this successor"),
        rawDetails("Carried original application outcomes",observation?.carriedOutcomes??session.input.continuation));
      if(session.input.rowReview)body.append(button("Resolve remaining original rows",attempt(async()=>{
        const prepared=await (await enginePromise).readAwardCsvImportContinuation(sessionClient,session,I.bytes);
        currentSelection(prepared.portfolio);
        await preserveCurrent();
        await open({roundId:session.round.id,continuationSeed:{...prepared,csv:I.bytes.slice(),working:snapshotWork()}});
      })));
      const batchList=panel("Original batches");
      pagedRows(batchList,["Batch","Original CSV rows","Original operation","State","Review"],session.batches,selected=>{
        const actual=observation?.batches.find(row=>row.index===selected.index),ranges=module.awardCsvRowRanges(selected.rowIndexes);
        const rangeLabel=ranges.length?ranges.map(([a,b])=>(a+1)+"–"+b).join(", "):"Complete source review only";
        return [String(selected.index+1),rangeLabel,selected.operationId,actual?.state||"NOT_ADMITTED",
          button("Review batch "+(selected.index+1),attempt(async()=>{
            const reviewed=await (await enginePromise).reviewAwardCsvSessionBatch(sessionClient,session,I.bytes,selected.index);
            I.batch=reviewed.batch;sessionPage();
          }))];
      },{searchText:row=>row.operationId+" "+(row.index+1),pageSize:10});
      body.append(batchList);
      if(!I.batch)return;
      const batch=I.batch,plan=batch.plan,changes=plan.action.payload.awards?.changes??[];
      const selected=panel("Reviewed batch "+(batch.index+1),changes.length+" applications · portfolio revision "+plan.portfolio.revision);
      pagedRows(selected,["Reference","Title / identity","Requested amount","Original answers"],changes,c=>[
        c.fields.reference,c.fields.title+" · "+c.id,c.fields.requestedAmount?
          c.fields.requestedAmount.value+" "+c.fields.requestedAmount.currency:"—",
        rawDetails("Profile, answers and source",c.fields)],{searchText:c=>c.fields.reference+" "+c.fields.title,pageSize:20});
      selected.append(button("Download this original batch plan",()=>download(utf8(JSON.stringify(batch,null,2)+"\n"),
        "Award_Batch_"+plan.action.operationId+".json","application/json")));
      const actual=observation?.batches.find(row=>row.index===batch.index);
      if(actual?.state!=="COMPLETED"){
        selected.append(button(actual?.state==="FAILED"?"Resume original failed batch":
          actual?.state==="RUNNING"?"Read running batch":"Save reviewed batch",attempt(async()=>{
          const engine=await enginePromise;
          const request=await engine.submitAwardCsvSessionBatch(sessionClient,session,batch,I.bytes,{
            resumeFailed:actual?.state==="FAILED"});
          I.observation=await engine.inspectAwardCsvImportSession(sessionClient,session,I.bytes);
          sessionPage();await showIntake();
        }),"primary"));
      }else selected.append(node("p","This original batch is recorded. Its complete plan and source remain available."));
      body.append(selected);
    }

    function reviewPage(){
      I.step="review";
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
    if(continuationSeed){
      currentSelection(continuationSeed.portfolio);
      need(exact(binding,{id:continuationSeed.portfolio.id,revision:continuationSeed.portfolio.revision,snapshot:continuationSeed.portfolio.snapshot}),
        "Select the current original portfolio before resolving remaining rows.");
      const previous=continuationSeed.continuation.previous,review=previous.input.rowReview;
      I.bytes=continuationSeed.csv.slice();I.parsed=module.parseAwardCsvText(new TextDecoder("utf-8",{fatal:true}).decode(I.bytes));
      I.filename=previous.source.filename;I.roundId=previous.round.id;I.actor=review.actor;I.status=review.status;
      I.mapping=clone(review.mapping);I.identities=clone(review.identities);
      I.continuation=clone(continuationSeed.continuation);I.continuationDocumentId=crypto.randomUUID();I.continuationWorking=clone(continuationSeed.working);
      I.rowDecisions=review.rows.map(({originalRowSha256,...row})=>({...clone(row),applicationId:row.applicationId??crypto.randomUUID(),
        correctionDrafts:clone(continuationSeed.working.rowDecisions?.[row.rowIndex]?.correctionDrafts??row.corrections)}));
      I.rowFilter="exception";localLabel.input.value=I.filename+" · resolve remaining rows";
      I.step="rows";rowReviewPage();changed();
    }else filePage();
    await showIntake();try{await refreshLibrary();}catch(error){reportSave(error);}
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
