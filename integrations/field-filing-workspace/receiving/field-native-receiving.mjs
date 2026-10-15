export async function receiveFieldFilingNative({fs,path,codec,core,workspaceAPI,runCLI,directory,desk}){
 const checks=[],ok=(name,value)=>{if(!value)throw Error(name);checks.push({name,passed:true})},clone=x=>JSON.parse(JSON.stringify(x));
 const base=path.resolve(directory);await fs.mkdir(base);
 const put=async(name,body)=>fs.writeFile(path.join(base,name),typeof body==="string"?codec.utf8Encode(body):body,{flag:"wx"});
 const read=async filename=>codec.utf8Decode(new Uint8Array(await fs.readFile(filename)));
 const json=async filename=>JSON.parse((await read(filename)).replace(/^\uFEFF/,""));
 const input=workspaceAPI.check(clone(desk)),originalEdition=input.workspace.editions[0];
 if(!originalEdition)throw Error("Supply the complete authored worked desk");
 const subject=core.analyse(input.workspace,originalEdition.id).attention[0];
 if(!subject)throw Error("Worked example must retain a reviewable source subject");
 input.session.notes="Unfinished field-office handoff — literal café note\r\nSecond line.";
 input.session.labelDraft="";
 input.session.sourceDraft.notes="Uncommitted source edits remain separate from accepted editions.";
 input.session.sourceDraft.settings.asOf="unfinished offset";
 input.session.sourceDraft.sources.payments.text+="Unfinished literal receipt draft";
 input.session.reviewDrafts[workspaceAPI.reviewKey(originalEdition.id,subject.subjectType,subject.subjectId)]={editionId:originalEdition.id,subjectType:subject.subjectType,subjectId:subject.subjectId,disposition:"investigate",reviewer:"",reason:"Unfinished original field record and filing review",evidence:"",previousReviewId:null};
 const malformedReceipt=new Uint8Array([255,13,10]),receiptSHA=codec.sha256(malformedReceipt);
 input.session.receipts.push({sha256:receiptSHA,bytes:malformedReceipt.length,dataBase64:codec.base64Encode(malformedReceipt),names:["earlier-unreadable-source.bin"],receivedAt:"2026-11-02T19:00:00Z",error:"Retained original malformed UTF-8"});
 const originalInput="\uFEFF"+JSON.stringify(workspaceAPI.check(input),null,2).replace(/\n/g,"\r\n")+"\r\n";
 await put("input.json",originalInput);
 const command={action:"receive",input:{id:"native-source-edition",label:"Authored original-file intake",receivedAt:"2026-11-02T19:00:00Z",settings:clone(core.sampleSettings),notes:"Authored exact file intake; browser drafts remain independent."},sourceFiles:{}};
 for(const [table,source]of Object.entries(core.sampleSources)){
  const filename=table+".csv";command.sourceFiles[table]={path:filename,name:filename};
  await put(filename,(table==="booking_revisions"?"\uFEFF":"")+source.text);
 }
 const commandText=JSON.stringify(command,null,2)+"\n";await put("receive.json",commandText);
 const env={fs,path,codec,core},run=async(inputFile,commandFile,out)=>runCLI(["--workspace",path.join(base,inputFile),...(commandFile?["--command",path.join(base,commandFile)]:[]),"--out",path.join(base,out)],env);
 const completed=await run("input.json","receive.json","completed"),current=workspaceAPI.check(await json(path.join(base,"completed/workspace.json")));
 ok("Actual browser model adopts appended native current workspace",completed.exitCode===0&&current.workspace.editions.length===input.workspace.editions.length+1);
 ok("All unfinished settings, source text, review fields, blank label and selected edition survive",JSON.stringify(current.session)===JSON.stringify(input.session));
 ok("Exact original input and command bytes survive native publication",await read(path.join(base,"completed/original-input-workspace.json"))===originalInput&&await read(path.join(base,"completed/original-command.json"))===commandText);
 ok("All sixteen source receipts and BOM/CRLF remain complete",current.nativeContinuation.receipts.length===16&&current.nativeContinuation.receipts.every(r=>codec.sha256(codec.base64Decode(r.dataBase64))===r.sha256)&&current.workspace.editions.at(-1).sources.booking_revisions.text==="\uFEFF"+core.sampleSources.booking_revisions.text);
 ok("Current full wrapper serializes and reopens through actual browser model",JSON.stringify(workspaceAPI.check(JSON.parse(workspaceAPI.serialize(current))))===JSON.stringify(current));
 const edition=current.workspace.editions.at(-1),currentSubject=core.analyse(current.workspace,edition.id).attention[0];
 const review={action:"review",input:{id:"native-review",editionId:edition.id,subjectType:currentSubject.subjectType,subjectId:currentSubject.subjectId,disposition:"investigate",reviewer:"Authored receiving operator",reason:"Read the original invoice line and written allocation before disposition.",evidence:"Authored course source; no actual customer payment.",previousReviewId:null}};
 await put("review.json",JSON.stringify(review,null,2)+"\n");
 const reviewResult=await run("completed/workspace.json","review.json","reviewed"),reviewed=workspaceAPI.check(await json(path.join(base,"reviewed/workspace.json")));
 ok("Native review binds the actual source edition and preserves every browser draft",reviewResult.exitCode===0&&reviewed.workspace.reviews.at(-1).sourceHash===edition.sourceHash&&JSON.stringify(reviewed.session)===JSON.stringify(input.session));
 ok("Native source and review attempts retain complete ordered continuation",reviewed.nativeContinuation.command.input.id==="native-review"&&reviewed.nativeContinuation.previous.command.input.id==="native-source-edition");
 const chainAnalysis=core.analyse(reviewed.workspace,edition.id);
 let last=reviewed,lastDirectory="reviewed";const chainResults=[];
 const subjects=[["fieldRecord","fieldRecords"],["formInstance","formInstances"],["filingEvent","filingEvents"]];
 for(const [kind,table]of subjects){
  const row=chainAnalysis[table]?.[0];if(!row||typeof row.key!=="string")throw Error("Worked source must contain "+table+" with a stable key");
  const subjectId=row.key;
  const cmd={action:"review",input:{id:"native-"+kind+"-review",editionId:edition.id,subjectType:kind,subjectId,disposition:"investigate",reviewer:"Authored receiving operator",reason:"Read the exact "+kind+" source and its retained version. This note changes no field record, signature or filing outcome.",evidence:"Authored retained source",previousReviewId:null}};
  await put(kind+"-review.json",JSON.stringify(cmd,null,2)+"\n");
  const outcome=await run(lastDirectory+"/workspace.json",kind+"-review.json","reviewed-"+kind);
  const adopted=workspaceAPI.check(await json(path.join(base,"reviewed-"+kind+"/workspace.json")));
  ok("Native "+kind+" review preserves exact source binding and unfinished fields",outcome.exitCode===0&&adopted.workspace.reviews.at(-1).sourceHash===edition.sourceHash&&JSON.stringify(adopted.session)===JSON.stringify(input.session));
  ok("Review retains complete original "+kind+" source editions unchanged",JSON.stringify(adopted.workspace.editions)===JSON.stringify(reviewed.workspace.editions));
  chainResults.push(outcome);last=adopted;lastDirectory="reviewed-"+kind;
 }
 const historicalCommand=clone(command);historicalCommand.input.id="native-late-transport-edition";historicalCommand.input.label="Authored delayed transport and older agency observations";
 historicalCommand.sourceFiles.filing_events={path:"late-filing-events.csv",name:"late-filing-events.csv"};
 const lateFilingText=core.sampleSources.filing_events.text+"EVENT-A1-LATE-DELIVERY,FILE-A1,delivered,2026-10-20T12:51:00-04:00,2026-10-20T13:50:00-04:00,LATE-DELIVERY-RECEIPT,Delayed transport observation after agency rejection\r\n"+"EVENT-A1-LATE-OLD-ACCEPT,FILE-A1,accepted,2026-10-20T13:20:00-04:00,2026-10-20T13:55:00-04:00,LATE-OLD-ACCEPT-RECEIPT,Delayed older agency acceptance after newer rejection\r\n";
 await put("late-filing-events.csv",lateFilingText);await put("late-filing.json",JSON.stringify(historicalCommand,null,2)+"\n");
 const historicalResult=await run(lastDirectory+"/workspace.json","late-filing.json","late-filing"),historical=workspaceAPI.check(await json(path.join(base,"late-filing/workspace.json")));
 const historicalAnalysis=core.analyse(historical.workspace,"native-late-transport-edition"),historicalAttempt=historicalAnalysis.filingAttempts.find(r=>r.key==="FILE-A1");
 ok("Late transport and older agency observations do not erase the actual later rejection",historicalResult.exitCode===0&&historicalAttempt.status==="rejected"&&historicalAnalysis.fieldSummary.rejectedFilings===1);
 ok("Historical continuation retains every delayed original and unchanged browser draft",historical.workspace.editions.at(-1).sources.filing_events.text===lateFilingText&&JSON.stringify(historical.session)===JSON.stringify(input.session));
 last=historical;lastDirectory="late-filing";
 const broken=clone(command);broken.input.id="malformed-source-edition";broken.sourceFiles.booking_revisions.path="malformed.bin";
 await put("malformed.bin",malformedReceipt);await put("broken.json",JSON.stringify(broken,null,2)+"\n");
 const rejectedResult=await run(lastDirectory+"/workspace.json","broken.json","rejected"),rejected=workspaceAPI.check(await json(path.join(base,"rejected/workspace.json")));
 ok("Malformed source rejects with accepted core and all pending fields unchanged",rejectedResult.exitCode===1&&JSON.stringify(rejected.workspace)===JSON.stringify(last.workspace)&&JSON.stringify(rejected.session)===JSON.stringify(reviewed.session));
 const badReceipt=rejected.nativeContinuation.receipts.find(r=>r.table==="booking_revisions");
 ok("Malformed original bytes and exact source command remain recoverable",badReceipt?.dataBase64===codec.base64Encode(malformedReceipt)&&Boolean(badReceipt.error)&&JSON.stringify(rejected.nativeContinuation.command)===JSON.stringify(broken));
 ok("Rejected current output reopens through actual browser model",JSON.stringify(workspaceAPI.check(JSON.parse(workspaceAPI.serialize(rejected))))===JSON.stringify(rejected));
 await put("malformed-command.json",malformedReceipt);
 const commandRejectedResult=await run("rejected/workspace.json","malformed-command.json","command-rejected"),commandRejected=workspaceAPI.check(await json(path.join(base,"command-rejected/workspace.json")));
 ok("Unreadable command retains its exact bytes and prior complete continuation",commandRejectedResult.exitCode===1&&commandRejected.nativeContinuation.command===null&&commandRejected.nativeContinuation.commandBytes.dataBase64===codec.base64Encode(malformedReceipt)&&commandRejected.nativeContinuation.previous.command.input.id==="malformed-source-edition"&&JSON.stringify(commandRejected.session)===JSON.stringify(input.session));
 const reportOnlyResult=await run("command-rejected/workspace.json",null,"report-only"),reportOnly=workspaceAPI.check(await json(path.join(base,"report-only/workspace.json")));
 ok("Read-only native report keeps full current wrapper and continuation",reportOnlyResult.exitCode===0&&JSON.stringify(reportOnly)===JSON.stringify(commandRejected));
 let refused=false;const originalOutput=await read(path.join(base,"completed/workspace.json"));
 try{await run("input.json",null,"completed")}catch(e){refused=true}
 ok("An existing output directory cannot overwrite saved work",refused&&await read(path.join(base,"completed/workspace.json"))===originalOutput);
 const coreInput=await json(path.join(base,"completed/core-workspace.json"));
 ok("Separate current core output is exactly the wrapper's authoritative core",JSON.stringify(core.reopen(coreInput))===JSON.stringify(current.workspace));
 let manifestMembers=0;for(const name of ["completed","reviewed","reviewed-fieldRecord","reviewed-formInstance","reviewed-filingEvent","late-filing","rejected","command-rejected","report-only"]){
  const manifest=await json(path.join(base,name,"MANIFEST.json"));for(const member of manifest.files){
   const bytes=new Uint8Array(await fs.readFile(path.join(base,name,member.path)));
   if(bytes.length!==member.bytes||codec.sha256(bytes)!==member.sha256)throw Error(name+" manifest "+member.path);
   manifestMembers++;
  }
 }
 ok("Every original, received byte file, report and export matches its package manifest",manifestMembers>0);
 return {schema:"tjlabs.field-filing-native-receiving.v1",checks,summary:{checks:checks.length,manifestMembers,acceptedEditions:current.workspace.editions.length,finalAcceptedEditions:last.workspace.editions.length,reviewRecords:last.workspace.reviews.length,unfinishedReviewDrafts:Object.keys(current.session.reviewDrafts).length},chainResults,historicalResult,chainReviewed:last,completed,reviewed:reviewResult,rejected:rejectedResult,commandRejected:commandRejectedResult,reportOnly:reportOnlyResult,input,current,reviewedCurrent:reviewed,rejectedCurrent:rejected,commandRejectedCurrent:commandRejected};
}
