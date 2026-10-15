import fsDefault from "node:fs/promises";
import pathDefault from "node:path";
import {fileURLToPath} from "node:url";
import {createArchiveCodec} from "./vendor/archive-codec.mjs";
import {createStudioSessionCore} from "./studio-session-core.mjs";
export async function runStudioSessionCLI(argv,environment={}){
 const fs=environment.fs||fsDefault,path=environment.path||pathDefault,codec=environment.codec||createArchiveCodec(),core=environment.core||createStudioSessionCore({codec});
 const args={};for(let i=0;i<argv.length;i+=2){if(!/^--[a-z-]+$/.test(argv[i])||!argv[i+1]||Object.hasOwn(args,argv[i]))throw new Error("Use named flag/value pairs");args[argv[i]]=argv[i+1];}
 const allowed=new Set(["--workspace","--command","--out","--new-id","--label"]);for(const key of Object.keys(args))if(!allowed.has(key))throw new Error("Unknown option "+key);
 if(!args["--out"]||Boolean(args["--workspace"])===Boolean(args["--new-id"]))throw new Error("Use --workspace FILE or --new-id ID --label LABEL, with --out NEW_DIRECTORY; optional --command FILE");
 const json=text=>JSON.parse(text.charCodeAt(0)===65279?text.slice(1):text),clone=x=>JSON.parse(JSON.stringify(x));
 const out=path.resolve(args["--out"]),inputBytes=args["--workspace"]?new Uint8Array(await fs.readFile(path.resolve(args["--workspace"]))):null;
 let original=inputBytes?json(codec.utf8Decode(inputBytes)):null,wrapper=original?.schema==="tjlabs.studio-session-desk.v1"?clone(original):null;
 let workspace=original?core.reopen(wrapper?wrapper.workspace:original):core.create({id:args["--new-id"],label:args["--label"]||"Studio session study"});
 let command=null,commandBytes=null,receipts=[],attempt={schema:"tjlabs.studio-session-native-attempt.v1",state:"completed",action:"report",error:null},exitCode=0;
 if(args["--command"]){
  const commandPath=path.resolve(args["--command"]);commandBytes=new Uint8Array(await fs.readFile(commandPath));
  try{
   command=json(codec.utf8Decode(commandBytes));if(!command||typeof command!=="object"||Array.isArray(command))throw new Error("Command must be an object");
   attempt.action=String(command.action||"");
   if(command.action==="receive"){
    let input=clone(command.input);if(!input||typeof input!=="object")throw new Error("Receive requires full input");
    if(command.sourceFiles){
     if(typeof command.sourceFiles!=="object"||Array.isArray(command.sourceFiles))throw new Error("sourceFiles must map all eight source names");
     const names=Object.keys(core.columns);if(Object.keys(command.sourceFiles).some(k=>!names.includes(k)))throw new Error("Unknown source table");
     input.sources={};let errors=[];
     for(const key of names){
      const spec=command.sourceFiles[key];if(!spec||typeof spec.path!=="string"){errors.push("Missing sourceFiles."+key);continue;}
      const file=path.resolve(path.dirname(commandPath),spec.path);let bytes;
      try{bytes=new Uint8Array(await fs.readFile(file));}catch(e){errors.push(key+": "+e.message);continue;}
      const receipt={table:key,name:spec.name||path.basename(file),bytes:bytes.length,sha256:codec.sha256(bytes),dataBase64:codec.base64Encode(bytes),error:null};receipts.push(receipt);
      try{input.sources[key]={name:receipt.name,text:codec.utf8Decode(bytes)};}catch(e){receipt.error=e.message;errors.push(key+": "+e.message);}
     }
     if(errors.length)throw new Error(errors.join("; "));
    }
    workspace=core.receive(workspace,input);
   }else if(command.action==="review")workspace=core.review(workspace,command.input);
   else throw new Error("Choose receive or review");
  }catch(e){attempt.state="rejected";attempt.error=e.message;exitCode=1;}
 }
 if(wrapper&&args["--command"]){
  const previous=wrapper.nativeContinuation?clone(wrapper.nativeContinuation):null;
  wrapper.nativeContinuation={schema:"tjlabs.studio-session-native-continuation.v1",command:clone(command),commandBytes:commandBytes?{bytes:commandBytes.length,sha256:codec.sha256(commandBytes),dataBase64:codec.base64Encode(commandBytes)}:null,attempt:clone(attempt),receipts:clone(receipts),previous};
 }
 if(wrapper)wrapper.workspace=workspace;
 const current=wrapper||workspace,files=Object.create(null),put=(name,value)=>{files[name]=typeof value==="string"?codec.utf8Encode(value):value;};
 put("workspace.json",JSON.stringify(current,null,2)+"\n");put("core-workspace.json",JSON.stringify(workspace,null,2)+"\n");
 if(inputBytes)put("original-input-workspace.json",inputBytes);if(commandBytes)put("original-command.json",commandBytes);
 put("attempt.json",JSON.stringify(attempt,null,2)+"\n");
 for(let i=0;i<receipts.length;i++)put("received/"+String(i+1).padStart(4,"0")+"-"+receipts[i].table+".bin",codec.base64Decode(receipts[i].dataBase64));
 for(let i=0;i<workspace.editions.length;i++){const edition=workspace.editions[i];for(const [table,s]of Object.entries(edition.sources))put("originals/edition-"+String(i+1).padStart(4,"0")+"/"+table+".csv",s.text);}
 if(workspace.editions.length){const editionId=workspace.editions[workspace.editions.length-1].id;put("current-analysis.json",JSON.stringify(core.analyse(workspace,editionId),null,2)+"\n");put("complete-report.html",core.report(workspace,editionId));for(const kind of ["sessions","allocations","invoices","attention"])put(kind+".csv",core.csv(workspace,editionId,kind));}
 put("MANIFEST.json",JSON.stringify({schema:"tjlabs.studio-session-native-package.v1",operationId:workspace.operation_id,attempt,files:Object.entries(files).map(([name,b])=>({path:name,bytes:b.length,sha256:codec.sha256(b)}))},null,2)+"\n");
 await fs.mkdir(out);for(const [name,b]of Object.entries(files)){const target=path.join(out,...name.split("/"));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,b,{flag:"wx"});}
 return {exitCode,attempt,operationId:workspace.operation_id,editions:workspace.editions.length,files:Object.keys(files).length,out};
}
if(process.argv[1]&&pathDefault.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await runStudioSessionCLI(process.argv.slice(2));console.log(JSON.stringify(result,null,2));process.exitCode=result.exitCode;}
 catch(error){console.error(error.message);process.exitCode=1;}
}
