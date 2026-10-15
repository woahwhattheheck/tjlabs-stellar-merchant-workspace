export async function receiveStudioNative({fs,path,codec,core,workspaceAPI,runCLI,directory,desk}){
 const checks=[],ok=(name,v)=>{if(!v)throw Error(name);checks.push({name,passed:true})},clone=x=>JSON.parse(JSON.stringify(x));
 const base=path.resolve(directory);await fs.mkdir(base);
 const put=async(n,b)=>{await fs.writeFile(path.join(base,n),typeof b==="string"?codec.utf8Encode(b):b,{flag:"wx"})};
 const input=workspaceAPI.check(clone(desk));input.session.notes="Unfinished handoff — retain literal notes\r\nSecond line.";
 input.session.sourceDraft.notes="Uncommitted source changes remain separate from accepted editions.";
 const originalEdition=input.workspace.editions[0],attention=core.analyse(input.workspace,originalEdition.id).attention[0];
 input.session.reviewDrafts[workspaceAPI.reviewKey(originalEdition.id,attention.id)]={editionId:originalEdition.id,attentionId:attention.id,disposition:"investigate",reviewer:"",reason:"Unfinished receiving note",evidence:"",previousReviewId:attention.review?.id||null};
 const originalInput="\uFEFF"+JSON.stringify(workspaceAPI.check(input),null,2).replace(/\n/g,"\r\n")+"\r\n";
 await put("input.json",originalInput);
 const command={action:"receive",input:{id:"native-complete",label:"Authored original-file intake",receivedAt:"2026-10-15T05:30:00Z",notes:"Authored source files. Existing draft fields must survive this independent intake."},sourceFiles:{}};
 for(const [k,s]of Object.entries(core.sampleSources)){const filename=k+".csv";command.sourceFiles[k]={path:filename,name:filename};await put(filename,(k==="sessions"?"\uFEFF":"")+s.text);}
 const rawCommand=JSON.stringify(command,null,2)+"\n";await put("receive.json",rawCommand);
 const env={fs,path,codec,core},good=await runCLI(["--workspace",path.join(base,"input.json"),"--command",path.join(base,"receive.json"),"--out",path.join(base,"completed")],env);
 const read=async p=>codec.utf8Decode(new Uint8Array(await fs.readFile(p))),readJSON=async p=>JSON.parse((await read(p)).replace(/^\uFEFF/,""));
 const current=await readJSON(path.join(base,"completed/workspace.json")),checked=workspaceAPI.check(current);
 ok("Actual browser model adopts native current wrapper",good.exitCode===0&&checked.workspace.editions.length===input.workspace.editions.length+1);
 ok("Every unfinished browser field survives native receive",JSON.stringify(checked.session)===JSON.stringify(input.session));
 ok("Original input BOM and CRLF remain byte-exact",await read(path.join(base,"completed/original-input-workspace.json"))===originalInput);
 ok("All eight complete received originals remain with current wrapper",checked.nativeContinuation.receipts.length===8&&checked.nativeContinuation.receipts.every(r=>codec.sha256(codec.base64Decode(r.dataBase64))===r.sha256));
 ok("Accepted original session source keeps BOM and CRLF",checked.workspace.editions.at(-1).sources.sessions.text==="\uFEFF"+core.sampleSources.sessions.text);
 ok("Current full wrapper survives browser serialize and reopen",JSON.stringify(workspaceAPI.check(JSON.parse(workspaceAPI.serialize(checked))))===JSON.stringify(checked));
 const broken=clone(command);broken.input.id="malformed-intake";broken.sourceFiles.sessions.path="malformed.bin";
 await put("malformed.bin",new Uint8Array([255,10]));await put("broken.json",JSON.stringify(broken,null,2)+"\n");
 const bad=await runCLI(["--workspace",path.join(base,"completed/workspace.json"),"--command",path.join(base,"broken.json"),"--out",path.join(base,"rejected")],env);
 const rejected=workspaceAPI.check(await readJSON(path.join(base,"rejected/workspace.json")));
 ok("Malformed bytes reject without changing accepted core or session",bad.exitCode===1&&JSON.stringify(rejected.workspace)===JSON.stringify(checked.workspace)&&JSON.stringify(rejected.session)===JSON.stringify(checked.session));
 const receipt=rejected.nativeContinuation.receipts.find(r=>r.table==="sessions");
 ok("Rejected original bytes remain in browser-portable native continuation",receipt.dataBase64===codec.base64Encode(new Uint8Array([255,10]))&&Boolean(receipt.error));
 ok("Prior successful continuation and exact rejected command remain",rejected.nativeContinuation.previous.attempt.state==="completed"&&JSON.stringify(rejected.nativeContinuation.command)===JSON.stringify(broken));
 ok("Rejected current wrapper reopens through actual browser model",JSON.stringify(workspaceAPI.check(JSON.parse(workspaceAPI.serialize(rejected))))===JSON.stringify(rejected));
 let refused=false;try{await runCLI(["--workspace",path.join(base,"input.json"),"--out",path.join(base,"completed")],env)}catch(e){refused=true}ok("Existing native output cannot be overwritten",refused);
 let manifestMembers=0;for(const dir of ["completed","rejected"]){const manifest=await readJSON(path.join(base,dir,"MANIFEST.json"));for(const file of manifest.files){const b=new Uint8Array(await fs.readFile(path.join(base,dir,file.path)));if(b.length!==file.bytes||codec.sha256(b)!==file.sha256)throw Error(dir+" manifest "+file.path);manifestMembers++;}}
 ok("Every original and output matches its full package manifest",manifestMembers>0);
 return{schema:"tjlabs.studio-session-browser-native-receiving.v1",checks,summary:{semanticChecks:11,manifestMembers,completedEditions:checked.workspace.editions.length,rejectedEditions:rejected.workspace.editions.length},completed:good,rejected:bad,input,current:checked,rejectedCurrent:rejected};
}
