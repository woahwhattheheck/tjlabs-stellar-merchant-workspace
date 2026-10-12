#!/usr/bin/env node
// MIT. One real saved-session receiving journey through the maintained applications.
(async function monitoringCustomer() {
  const fs=await import("node:fs/promises"),path=await import("node:path"),urlModule=await import("node:url");
  const crypto=await import("node:crypto"),cp=await import("node:child_process"),readline=await import("node:readline");
  const assert=(await import("node:assert/strict")).default;
  const {createWriteStream}=await import("node:fs");
  const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
  const [mode,sourceInput,configurationFile]=process.argv.slice(2);
  assert(["run","host","receive"].includes(mode),"Choose run, host or receive");
  const source=await fs.realpath(sourceInput);
  const cfg=JSON.parse(await fs.readFile(configurationFile,"utf8"));
  const modulePath=short=>urlModule.pathToFileURL(path.join(source,"stellar/scf-starforge-20261009",short)).href;
  const write=async(file,value)=>{
    const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==="string"?value:JSON.stringify(value,null,2)+"\n");
    await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
    let existing=null;try{existing=await fs.readFile(file);}catch(e){if(e.code!=="ENOENT")throw e;}
    if(existing!==null){assert(existing.equals(bytes),"Existing retained bytes changed: "+file);return;}
    const temporary=file+"."+crypto.randomUUID()+".receiving-tmp";
    const handle=await fs.open(temporary,"wx",0o600);
    try{
      await handle.writeFile(bytes);await handle.sync();await handle.close();
      try{await fs.link(temporary,file);}catch(error){if(error.code!=="EEXIST")throw error;assert((await fs.readFile(file)).equals(bytes),"Concurrent retained bytes changed: "+file);}
      const directory=await fs.open(path.dirname(file),"r");try{await directory.sync();}finally{await directory.close();}
    }finally{await handle.close().catch(()=>{});await fs.unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}
  };
  if(mode==="host"){
    const {start}=await import(modulePath("sf74-merchant-support-console/server.mjs"));
    const app=await start({port:0,casesDir:cfg.casesDir,incidentSources:cfg.incidentSources,startupFormat:"json"});
    process.stdout.write(JSON.stringify({phase:"ORIGINAL_SUPPORT_READY",launch:app.launch,url:app.url})+"\n");
    let closing=null;
    const close=()=>closing??=(async()=>{await app.close();process.stdout.write(JSON.stringify({phase:"ORIGINAL_SUPPORT_CLOSED"})+"\n");process.exitCode=0;})();
    const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
    input.on("line",line=>{let item;try{item=JSON.parse(line);}catch{return;}
      if(item.action==="close"){input.close();void close().catch(error=>{console.error(error);process.exitCode=1;});}});
    input.on("close",()=>{void close().catch(error=>{console.error(error);process.exitCode=1;});});
    process.once("SIGTERM",()=>{input.close();void close().catch(error=>{console.error(error);process.exitCode=1;});});
    process.once("SIGINT",()=>{input.close();void close().catch(error=>{console.error(error);process.exitCode=1;});});
    return;
  }
  assert.equal(cfg.schema,"stellar-forge.object-incident-support-customer.v1");
  assert.equal(cfg.sourceCommit,"f7200d52fdc5722619d0cf708041ee46db447e7f");
  const root=path.resolve(cfg.directory);
  assert.equal(root,cfg.directory);
  await fs.mkdir(root,{recursive:true,mode:0o700});
  assert.equal(await fs.realpath(root),root);
  const rootStat=await fs.lstat(root);assert(rootStat.isDirectory()&&!rootStat.isSymbolicLink()&&(rootStat.mode&0o077)===0);
  const eventFile=path.join(root,"actions.private.ndjson");
  const event=async value=>{const h=await fs.open(eventFile,"a",0o600);try{await h.writeFile(JSON.stringify({...value,at:new Date().toISOString()})+"\n");await h.sync();}finally{await h.close();}};
  const readJson=async file=>JSON.parse(await fs.readFile(file,"utf8"));
  const step=async(name,run)=>{
    const file=path.join(root,"steps",name+".json");
    try{return await readJson(file);}catch(error){if(error.code!=="ENOENT")throw error;}
    await event({phase:"STEP_STARTED",name});
    const result=await run();
    await write(file,result);
    await event({phase:"STEP_COMPLETED",name});
    return result;
  };
  const {readSupportLaunch}=await import(modulePath("sf74-merchant-support-console/managed-launch.mjs"));
  let sequence=0,activeHost=null;
  async function startHost(label,casesDir,incidentSources){
    const selected={casesDir,incidentSources};
    const file=path.join(root,"hosts",label+".json");await write(file,selected);
    const child=cp.spawn(process.execPath,[urlModule.fileURLToPath(import.meta.url),"host",source,file],
      {stdio:["pipe","pipe","pipe"],env:{...process.env,SCF_PYTHON:cfg.python}});
    const stdout=createWriteStream(path.join(root,"hosts",label+".stdout"),{flags:"a",mode:0o600});
    const stderr=createWriteStream(path.join(root,"hosts",label+".stderr"),{flags:"a",mode:0o600});
    let exitValue=null,resolveExit;
    const exited=new Promise(resolve=>{resolveExit=resolve;});
    child.once("exit",(code,signal)=>{exitValue={code,signal};resolveExit(exitValue);});
    child.once("error",error=>{exitValue={code:null,signal:null,error:String(error)};resolveExit(exitValue);});
    child.stdout.pipe(stdout);child.stderr.pipe(stderr);
    const lines=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
    const host={label,child,exited,lines,stdout,stderr,ready:null,binding:null,origin:null,
      get exit(){return exitValue;}};
    activeHost=host;
    host.logErrors=[];
    let rejectStartup=null;
    const logFailure=(stream,output,error)=>{
      host.logErrors.push(String(error));stream.unpipe(output);stream.resume();
      if(rejectStartup)rejectStartup(error);
    };
    stdout.on("error",error=>logFailure(child.stdout,stdout,error));
    stderr.on("error",error=>logFailure(child.stderr,stderr,error));
    child.stdin.on("error",error=>{host.inputError=String(error);});
    let timer;
    try{
      const ready=await new Promise((resolve,reject)=>{
        rejectStartup=reject;
        timer=setTimeout(()=>reject(new Error("Original Support startup deadline")),60000);
        lines.on("line",line=>{try{const v=JSON.parse(line);if(v.phase==="ORIGINAL_SUPPORT_READY")resolve(v);}catch{}});
        void exited.then(value=>reject(new Error("Original Support exited before ready: "+JSON.stringify(value))));
      }).finally(()=>{clearTimeout(timer);rejectStartup=null;});
      assert.equal(host.logErrors.length,0,"Original Support log receiving failed");
      const binding=await readSupportLaunch(ready.launch,{...selected,selectionSha256:ready.launch.selectionSha256,port:0});
      assert.equal(ready.launch.pid,child.pid);
      Object.assign(host,{ready,binding,origin:new URL(binding.url).origin});
      await event({phase:"HOST_READY",label,pid:child.pid,launch:ready.launch});
      return host;
    }catch(error){
      try{await closeHost(host,{allowFailure:true});}
      catch(cleanup){throw new AggregateError([error,cleanup],"Original Support startup and cleanup failed");}
      throw error;
    }
  }
  async function closeHost(host,{allowFailure=false}={}){
    if(!host)return;
    if(!host.exit&&host.child.stdin.writable)host.child.stdin.end(JSON.stringify({action:"close"})+"\n");
    let timer;
    let result=await Promise.race([host.exited,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),30000);})]).finally(()=>clearTimeout(timer));
    if(result===null){
      if(!host.exit)host.child.kill("SIGTERM");
      result=await Promise.race([host.exited,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),10000);})]).finally(()=>clearTimeout(timer));
      if(result===null){if(!host.exit)host.child.kill("SIGKILL");result=await host.exited;}
    }
    host.lines.close();
    await Promise.all([new Promise(resolve=>host.stdout.end(resolve)),new Promise(resolve=>host.stderr.end(resolve))]);
    await event({phase:"HOST_CLOSED",label:host.label,result});
    if(activeHost===host)activeHost=null;
    if(!allowFailure){
      assert.equal(result.code,0,"Original Support host did not close cleanly");
      assert.equal(host.logErrors.length,0,"Original Support log receiving failed");
    }
  }
  async function call(host,route,input,expected=[200]){
    assert.equal(host.logErrors.length,0,"Original Support log receiving failed");
    const method=input===undefined?"GET":"POST",id=++sequence;
    if(method==="POST")await event({phase:"HTTP_DISPATCHING",id,host:host.label,route,input});
    let response,body;
    try{
      response=await fetch(host.origin+route,{method,headers:{Origin:host.origin,...(input===undefined?{}:{"Content-Type":"application/json"})},
        ...(input===undefined?{}:{body:JSON.stringify(input)}),signal:AbortSignal.timeout(60000)});
      const chunks=[];let bytes=0;
      for await(const chunk of response.body){bytes+=chunk.length;assert(bytes<=16*1024*1024,"Support response size limit");chunks.push(chunk);}
      const raw=Buffer.concat(chunks);body=JSON.parse(raw.toString("utf8"));
      if(method==="POST")await event({phase:"HTTP_RESPONSE",id,host:host.label,route,status:response.status,response:body});
    }catch(error){if(method==="POST")await event({phase:"HTTP_UNCERTAIN",id,host:host.label,route,error:String(error)});throw error;}
    assert(expected.includes(response.status),method+" "+route+" returned "+response.status+": "+JSON.stringify(body));
    return body;
  }
  async function until(host,predicate,label,timeout=60000){
    const deadline=Date.now()+timeout;let last=null;
    while(Date.now()<deadline){last=await call(host,"/api/incidents/operations");if(predicate(last))return last;
      await new Promise(resolve=>setTimeout(resolve,250));}
    await write(path.join(root,"unresolved-"+label+".json"),last);throw new Error(label+" did not reach the selected original state");
  }
  const inventory=async directory=>{
    const result=[];
    async function walk(folder){
      for(const name of (await fs.readdir(folder)).sort()){
        const file=path.join(folder,name),s=await fs.lstat(file),relative=path.relative(directory,file);
        assert(!s.isSymbolicLink(),"Original session symlink refused");
        if(s.isDirectory()){await walk(file);continue;}
        assert(s.isFile(),"Unexpected original session member");
        const handle=await fs.open(file,"r");
        try{
          const before=await handle.stat(),hash=crypto.createHash("sha256");let bytes=0;
          for await(const part of handle.createReadStream({autoClose:false})){bytes+=part.length;hash.update(part);}
          const after=await handle.stat();
          assert(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&bytes===before.size);
          result.push({path:relative,bytes,sha256:hash.digest("hex"),mode:s.mode&0o777,mtimeMs:s.mtimeMs});
        }finally{await handle.close();}
      }
    }
    await walk(directory);return result;
  };
  const attachments=capture=>(capture?.files??[]).map(({name,bytes,sha256})=>({name,bytes,sha256})).sort((a,b)=>a.name.localeCompare(b.name));
  const exportNative=async(host,label,input)=>{
    const retainedFile=path.join(root,"deliverables",label+".support-handoff.json");
    let retained=null;try{retained=await fs.readFile(retainedFile,"utf8");}catch(error){if(error.code!=="ENOENT")throw error;}
    let result;
    if(retained!==null){
      const portable=await import(modulePath("sf74-merchant-support-console/runtime-support.mjs"));
      const checked=await portable.importRuntimeHandoff(retained);
      assert.equal(checked.workspaceText,input.workspaceText);assert.equal(checked.supportText,input.supportText);assert.deepEqual(checked.metadata,input.metadata);
      result=await portable.exportRuntimeHandoff({...input,generatedAt:JSON.parse(retained).generatedAt});
      assert.equal(result.handoff,retained);
      await event({phase:"ORIGINAL_EXPORT_REOPENED",label,sha256:sha(retained)});
    }else result=await call(host,"/api/runtime/export",input);
    await write(retainedFile,result.handoff);
    await write(path.join(root,"deliverables",label+".html"),result.html);
    await write(path.join(root,"deliverables",label+".report.json"),result.report);
    return result;
  };
  async function receiveIndependent(receipt){
    const profilesFile=path.join(root,"received-empty-incident-sources.private.json");
    await write(profilesFile,{schema:"stellar-forge.support-incident-sources.v1",sources:[]});
    try{
      const host=await startHost("independent-receiver",path.join(root,"received-cases"),profilesFile);
      if(receipt.operatorInstanceId)assert.notEqual(host.ready.launch.instanceId,receipt.operatorInstanceId);
      const profiles=await call(host,"/api/incidents/profiles");assert.equal(profiles.sources.length,0);
      const handoffText=await fs.readFile(receipt.handoffFile,"utf8");assert.equal(sha(handoffText),receipt.handoffSha256);
      const imported=await call(host,"/api/runtime/import",{handoffText});
      assert.equal(sha(imported.workspaceText),receipt.workspaceSha256);
      assert.equal(sha(imported.supportText),receipt.supportSha256);
      const saved=await call(host,"/api/cases",{id:receipt.caseId,expectedRevision:null,workspaceText:imported.workspaceText,
        supportText:imported.supportText,metadata:imported.metadata});
      const reopened=await call(host,"/api/cases/"+receipt.caseId);
      assert.equal(reopened.revision,saved.case.revision);
      assert.equal(reopened.workspaceText,imported.workspaceText);assert.equal(reopened.supportText,imported.supportText);
      const reviewed=await call(host,"/api/runtime/review",{supportText:reopened.supportText,inputs:JSON.parse(reopened.workspaceText).inputs});
      assert.equal(reviewed.report.before.kind,"OBJECT_SESSION");assert.equal(reviewed.report.after.kind,"OBJECT_SESSION");
      assert.deepEqual(attachments(reviewed.report.before),receipt.beforeFiles);
      assert.deepEqual(attachments(reviewed.report.after),receipt.afterFiles);
      const final=await exportNative(host,"independently-reopened",{workspaceText:reopened.workspaceText,supportText:reopened.supportText,metadata:reopened.metadata});
      await closeHost(host);
      const result={schema:"stellar-forge.object-support-receiving.v1",
        state:"COMPLETE",caseId:receipt.caseId,sourceRevision:receipt.caseRevision,receivedRevision:reopened.revision,
        workspaceSha256:sha(reopened.workspaceText),supportSha256:sha(reopened.supportText),
        beforeFiles:attachments(final.report.before),afterFiles:attachments(final.report.after),
        emptyIncidentProfile:true,buyerOpened:false,sourceCommit:cfg.sourceCommit,completedAt:new Date().toISOString(),
        receivedInstanceId:host.ready.launch.instanceId};
      await write(path.join(root,"independent-receiving-result.json"),result);
      return result;
    }finally{if(activeHost)await closeHost(activeHost);}
  }

  if(mode==="receive")return receiveIndependent(await readJson(cfg.receivingInput));
  const expectedId="f269be5c-ca82-4a78-b603-3f526abf90a9";
  const expectedObject="80bc251619f969166dd39f60290b0450663fbf54ab2dc037a2635dbfb921c19a";
  const session=path.resolve(cfg.objectSession);assert.equal(await fs.realpath(session),session);
  assert.equal((await readJson(path.join(session,"session.json"))).sessionId,expectedId);
  await step("original-session-before",()=>inventory(session));
  const {reviewObjectSource,collectObjectObservation}=await import(modulePath("sf93-seller-support-bundle/object-source.mjs"));
  const {initializeIncidentStore,openIncidentStore}=await import(modulePath("sf93-seller-support-bundle/incident-store.mjs"));
  const {CONFIG_SCHEMA,compileConfig}=await import(modulePath("sf93-seller-support-bundle/incident-config.mjs"));
  const {serializeWorkspace}=await import(modulePath("sf74-merchant-support-console/workspace-file.mjs"));
  const {objectObservationSignals}=await import(modulePath("sf93-seller-support-bundle/object-observation.mjs"));
  const {RUNTIME_SCHEMA}=await import(modulePath("sf74-merchant-support-console/runtime-support.mjs"));
  const review=await step("review-saved-object",async()=>{
    const value=await reviewObjectSource({directory:session,maxBytes:1024,maxChunks:1000,timeoutMs:30000});
    assert.equal(value.object.sessionId,expectedId);assert.equal(value.output.bytes,267);
    assert.equal(value.output.status,"COMPLETE");assert.equal(value.output.sha256,expectedObject);return value;
  });
  const merchant={id:"original-events",label:"Original saved events Object",object:review.object};
  const fullConfig=compileConfig({schema:CONFIG_SCHEMA,pollMs:250,failurePolls:1,recoveryPolls:2,
    captureEveryMs:1000,retention:{captureBytes:16777216},merchants:[merchant],notification:null});
  const incidentDirectory=path.join(root,"incident-store"),casesDir=path.join(root,"cases");
  await step("initialize-original-watcher",async()=>{
    try{
      const existing=await openIncidentStore(incidentDirectory),state=await existing.read();
      assert.equal(state.config.merchants[0].object.sessionId,expectedId);
      return {directory:incidentDirectory,existing:true};
    }catch(error){
      if(error.code!=="ENOENT")throw error;
      return initializeIncidentStore({directory:incidentDirectory,config:fullConfig});
    }
  });
  const profiles=path.join(root,"incident-sources.private.json");
  await write(profiles,{schema:"stellar-forge.support-incident-sources.v1",sources:[{id:"operations",label:"Original Object operations",
    directory:incidentDirectory,objectSessions:[{id:"saved-events",label:"Original acquired 267-byte events",directory:session}]}]});
  const inputs={resource:review.sourceUrl??"",catalog:"",origin:review.sourceUrl?new URL(review.sourceUrl).origin:"",
    network:review.terms?.network??"",payTo:review.terms?.payTo??"",method:"GET",credentialed:false};
  const workspaceText=await step("workspace",async()=>({text:await serializeWorkspace({name:"Original Object monitoring case",inputs,
    termsText:JSON.stringify(review.terms??null,null,2),baselineOnly:false,workorderSource:"runtime"})}));
  let host;
  try{
    host=await startHost("original-operator",casesDir,profiles);
    const served=await step("original-app-assets",async()=>{
      const files=["/","/incident-desk.mjs","/runtime-desk.mjs"],rows=[];
      for(const route of files){const response=await fetch(host.origin+route,{signal:AbortSignal.timeout(30000)});
        assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());rows.push({route,bytes:bytes.length,sha256:sha(bytes)});}
      return rows;
    });
    await step("healthy-watcher",async()=>{
      let state=await call(host,"/api/incidents/operations");
      const inspected=await call(host,"/api/incidents/operations/inspect-object",{objectSourceId:"saved-events",
        expectedConfigRevision:state.configRevision,maxBytes:1024,maxChunks:1000,timeoutMs:30000});
      assert.deepEqual(inspected.object,review.object);
      if(!state.worker.canStop)await call(host,"/api/incidents/operations/start",
        {expectedConfigRevision:state.configRevision,expectedConfigHash:state.configHash},[202]);
      state=await until(host,x=>x.merchants[0]?.observation?.coverage==="COMPLETE"&&x.merchants[0]?.observation?.poll?.successful===true,"healthy");
      await call(host,"/api/incidents/operations/stop",{});
      const saved=await (await openIncidentStore(incidentDirectory)).read();
      assert(saved.merchants[merchant.id].lastSuccessAt);
      assert.equal(state.merchants[0].observation.output.state,"VERIFIED_COMPLETE");
      return {observed:state.merchants[0].observation,configRevision:state.configRevision,lastSuccessAt:saved.merchants[merchant.id].lastSuccessAt,assets:served};
    });
    const incident=await step("bounded-source-incident",async()=>{
      let state=await call(host,"/api/incidents/operations");
      if(state.worker.canStop)await call(host,"/api/incidents/operations/stop",{});
      const limited=structuredClone(fullConfig);limited.merchants[0].object.maxBytes=266;
      await call(host,"/api/incidents/operations/configure",{config:limited,expectedConfigRevision:state.configRevision});
      state=await call(host,"/api/incidents/operations");
      if(!state.worker.canStop)await call(host,"/api/incidents/operations/start",
        {expectedConfigRevision:state.configRevision,expectedConfigHash:state.configHash},[202]);
      state=await until(host,x=>x.incidents.some(i=>i.kind==="OBJECT_SOURCE_UNAVAILABLE"&&i.status==="OPEN"),"workload-limit");
      await call(host,"/api/incidents/operations/stop",{});
      const id=state.incidents.find(i=>i.kind==="OBJECT_SOURCE_UNAVAILABLE"&&i.status==="OPEN").id;
      const detail=await call(host,"/api/incidents/operations/"+id);
      const saved=await (await openIncidentStore(incidentDirectory)).read();
      assert.equal(saved.merchants[merchant.id].lastSuccessAt,null);
      assert.equal(saved.merchants[merchant.id].previous,null);
      assert.equal(state.merchants[0].observation.coverage,"WORKLOAD_LIMIT");
      assert.equal(state.merchants[0].observation.poll.successful,false);
      assert(detail.incident.beforeCapture||detail.incident.afterCapture);
      return {id,detail,observation:state.merchants[0].observation,lastSuccessAt:null};
    });
    const acknowledged=await step("acknowledge-original-incident",async()=>{
      const detail=await call(host,"/api/incidents/operations/"+incident.id);
      if(detail.incident.status==="ACKNOWLEDGED"){assert.equal(detail.incident.acknowledgment.by,"Original operator");return detail.incident;}
      return call(host,"/api/incidents/operations/"+incident.id+"/ack",{expectedRevision:detail.incident.revision,
        by:"Original operator",notes:"The reviewed source has 267 bytes; this registration explicitly allowed 266. Review the native workload limit and retain the original evidence."});
    });
    assert.equal(acknowledged.status,"ACKNOWLEDGED");
    const prepared=await step("prepare-support-case",async()=>{
      const detail=await call(host,"/api/incidents/operations/"+incident.id);
      const request={sourceId:"operations",incidentId:incident.id,expectedRevision:detail.incident.revision,
        workspaceText:workspaceText.text,routeId:merchant.id};
      const retainedFile=path.join(root,"prepared-case-response.private.json");
      let retained=null;
      try{retained=await readJson(retainedFile);}catch(error){if(error.code!=="ENOENT")throw error;}
      let result;
      if(retained){
        assert.deepEqual(retained.request,request,"Original incident preparation changed");
        result=retained.response;
        const portable=await import(modulePath("sf74-merchant-support-console/runtime-support.mjs"));
        const imported=await portable.importRuntimeHandoff(result.handoff);
        assert.equal(imported.workspaceText,workspaceText.text);
        assert.equal(result.incidentId,incident.id);assert.equal(result.revision,detail.incident.revision);
        const regenerated=await portable.exportRuntimeHandoff({...imported,generatedAt:JSON.parse(result.handoff).generatedAt});
        assert.equal(regenerated.handoff,result.handoff);assert.equal(regenerated.html,result.html);
        assert.deepEqual(regenerated.report,result.report);
        await event({phase:"ORIGINAL_INCIDENT_HANDOFF_REOPENED",incidentId:incident.id,sha256:sha(result.handoff)});
      }else{
        result=await call(host,"/api/incidents/operations/"+incident.id+"/case",
          {expectedRevision:request.expectedRevision,workspaceText:request.workspaceText,routeId:request.routeId});
        await write(retainedFile,{request,response:result});
      }
      await write(path.join(root,"deliverables","incident-original.support-handoff.json"),result.handoff);
      await write(path.join(root,"deliverables","incident-original.html"),result.html);
      return result;
    });
    const caseIdentity=await step("case-identity",async()=>({id:crypto.randomUUID()}));
    const first=await step("save-original-case",async()=>{
      const imported=await call(host,"/api/runtime/import",{handoffText:prepared.handoff});
      const payload={id:caseIdentity.id,expectedRevision:null,workspaceText:imported.workspaceText,supportText:imported.supportText,metadata:imported.metadata};
      const saved=await call(host,"/api/cases",payload);
      const recovered=await call(host,"/api/cases",payload);
      assert.equal(recovered.case.revision,saved.case.revision);assert.equal(recovered.unchanged,true);
      return {saved,imported};
    });
    const after=await step("restore-reviewed-workload",async()=>{
      let state=await call(host,"/api/incidents/operations");
      if(state.worker.canStop)await call(host,"/api/incidents/operations/stop",{});
      await call(host,"/api/incidents/operations/configure",{config:fullConfig,expectedConfigRevision:state.configRevision});
      const detail=await call(host,"/api/incidents/operations/"+incident.id);
      assert.equal(detail.incident.status,"RETIRED");assert.equal(detail.incident.retiredReason,"CONFIGURATION_CHANGED");
      state=await call(host,"/api/incidents/operations");
      await call(host,"/api/incidents/operations/start",{expectedConfigRevision:state.configRevision,expectedConfigHash:state.configHash},[202]);
      await until(host,x=>x.merchants[0]?.observation?.poll?.successful===true&&x.merchants[0]?.observation?.coverage==="COMPLETE","restored-workload");
      await call(host,"/api/incidents/operations/stop",{});
      const observation=await collectObjectObservation(merchant);
      assert.equal(observation.packet.object.summary.coverage,"COMPLETE");
      const captured=Date.parse(observation.packet.object.generatedAt);
      const fresh=objectObservationSignals(merchant,observation,captured);
      assert.equal(fresh.successful,true);
      const stale=objectObservationSignals(merchant,observation,captured+30001);
      const future=objectObservationSignals(merchant,observation,captured-5001);
      const repeated=objectObservationSignals(merchant,observation,captured,fresh.previous);
      for(const value of [stale,future,repeated]){assert.equal(value.successful,false);assert.equal(value.error,"OBJECT_SOURCE_CLOCK_OR_AGE_INVALID");}
      const files=Object.fromEntries(Object.entries(observation.packet.files).map(([name,bytes])=>[name,bytes.toString("base64")]));
      for(const[name,bytes]of Object.entries(observation.packet.files))await write(path.join(root,"deliverables","current-original-observation",name),bytes);
      const inspected=await call(host,"/api/runtime/inspect",{files,inputs,routeId:merchant.id});
      assert.equal(inspected.view.kind,"OBJECT_SESSION");
      return {capture:inspected.capture,retiredIncident:detail.incident,
        recoveryClockDecisions:{fresh:fresh.successful,stale:stale.error,future:future.error,repeated:repeated.error}};
    });
    const completedCase=await step("save-and-export-complete-case",async()=>{
      const support=JSON.parse(first.imported.supportText);
      const original=support.before??support.after;assert(original);
      const supportText=JSON.stringify({schema:RUNTIME_SCHEMA,before:original,after:after.capture},null,2)+"\n";
      const metadata={...first.imported.metadata,status:"ready",
        nextAction:"Review the retired 266-byte registration and the current complete 267-byte native observation.",
        notes:first.imported.metadata.notes+"\nThe original incident was RETIRED by CONFIGURATION_CHANGED. A fresh capture under the reviewed workload verifies the retained object. This is not a recovery of the earlier registration."};
      const saved=await call(host,"/api/cases",{id:caseIdentity.id,expectedRevision:first.saved.case.revision,
        workspaceText:first.imported.workspaceText,supportText,metadata});
      const reopened=await call(host,"/api/cases/"+caseIdentity.id);
      assert.equal(reopened.revision,saved.case.revision);assert.equal(reopened.supportText,supportText);
      const history=await call(host,"/api/cases/"+caseIdentity.id+"/history");
      assert(history.revisions.some(row=>row.revision===first.saved.case.revision));
      const exported=await exportNative(host,"complete-original-case",{workspaceText:reopened.workspaceText,supportText:reopened.supportText,metadata:reopened.metadata});
      assert.equal(exported.report.comparison.state,"OBJECT_SELECTION_CHANGED");
      return {caseId:caseIdentity.id,caseRevision:reopened.revision,previousRevision:first.saved.case.revision,operatorInstanceId:host.ready.launch.instanceId,
        workspaceSha256:sha(reopened.workspaceText),supportSha256:sha(reopened.supportText),
        handoffFile:path.join(root,"deliverables","complete-original-case.support-handoff.json"),handoffSha256:sha(exported.handoff),
        beforeFiles:attachments(exported.report.before),afterFiles:attachments(exported.report.after),history};
    });
    await closeHost(host);host=null;
    await write(path.join(root,"receiving-input.json"),completedCase);
    await step("independent-process-receiving",()=>receiveIndependent(completedCase));
    const before=await readJson(path.join(root,"steps","original-session-before.json")),afterInventory=await inventory(session);
    assert.deepEqual(afterInventory,before,"Original buyer/session bytes changed during observation");
    await write(path.join(root,"original-session-after.json"),afterInventory);
    const final={schema:"stellar-forge.object-incident-support-customer-result.v1",state:"COMPLETE",sourceCommit:cfg.sourceCommit,
      originalSessionId:expectedId,objectBytes:267,objectSha256:expectedObject,buyerPurchased:false,buyerFinalized:false,
      monitored:review.object,incidentId:incident.id,incidentFinalStatus:"RETIRED",incidentReason:"CONFIGURATION_CHANGED",
      case:completedCase,independentReceiving:await readJson(path.join(root,"independent-receiving-result.json")),
      originalSessionUnchanged:true,notificationConfigured:false,completedAt:new Date().toISOString()};
    await write(path.join(root,"result.json"),final);
    process.stdout.write(JSON.stringify({phase:"OBJECT_INCIDENT_SUPPORT_COMPLETE",result:path.join(root,"result.json"),
      caseId:completedCase.caseId,sessionId:expectedId})+"\n");
  }finally{if(activeHost)await closeHost(activeHost);}
})().catch(error=>{console.error(error?.stack??String(error));process.exitCode=1;});
