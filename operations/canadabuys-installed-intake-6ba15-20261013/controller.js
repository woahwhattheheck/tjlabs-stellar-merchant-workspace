const transport=load("canadabuys-intake-native-transport"),wire=load("canadabuys-intake-native-wire"),command=load("canadabuys-intake-native-command");
const old=load("canadabuys-intake-native-controller");
const journal={schema:"commons.canadabuys-intake-native-controller.v1",operationId:"CANADABUYS-INSTALLED-INTAKE-6BA15-20261013",sourceCommit:"5b509c7b9ba416036b7cd3de0c2dbd6d2de106b0",inputSha256:transport.inputSha256,wireSha256:transport.wireSha256,startedAt:new Date().toISOString(),prior:old?{session:old.session,error:old.error,endedAt:old.endedAt}:null,calls:[],events:[]};
const need=(v,m)=>{if(!v)throw Error(m);};
let session=null,ended=false,ready=false,buffer="";const saves=[];
function retain(){store("canadabuys-intake-native-controller",journal);if(session!==null)store("canadabuys-intake-native-session",session);}
function accept(result,kind){
 journal.calls.push({kind,at:new Date().toISOString(),...result});if(result.session_id!==undefined){session=result.session_id;journal.session=session;}
 buffer+=result.output??"";
 let at;while((at=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,at).replace(/\r/g,"");buffer=buffer.slice(at+1);if(!line.trim())continue;
  let value;try{value=JSON.parse(line);}catch{text(line.slice(-12000));continue;}
  journal.events.push(value);text(value);
  if(value.event==="LIBRARY_SAVE_REQUEST")saves.push(value);
  if(value.event==="READY_FOR_NEXT_ORIGINAL_JOB")ready=true;
 }
 if(result.exit_code!==undefined){ended=true;journal.exitCode=result.exit_code;}retain();
}
try{
 accept(await tools.exec_command({cmd:command,workdir:"/",shell:"/bin/bash",login:false,tty:true,yield_time_ms:1000,max_output_tokens:5000}),"admission");
 need(session!==null&&!ended,"No whole customer native process admitted");text({event:"CUSTOMER_NATIVE_SESSION",session});
 while(!journal.events.some(e=>e.event==="CUSTOMER_INPUT_READY")){accept(await tools.write_stdin({session_id:session,chars:"",yield_time_ms:1000,max_output_tokens:5000}),"input-gate");need(!ended,"Original complete bootstrap exited before input");await yield_control();}
 accept(await tools.write_stdin({session_id:session,chars:wire,yield_time_ms:1000,max_output_tokens:8000}),"single-complete-input");
 while(!ended&&!ready){
  if(saves.length){
   const request=saves.shift(),prefix="/workspace/scratch/6ba15c52ace4/canadabuys-intake-delivery-20261013/official-save-source/";
   need(request.operationId===journal.operationId&&request.arguments?.file===request.staged.path&&request.staged.path===prefix+request.name&&request.source.bytes===request.staged.bytes&&request.source.sha256===request.staged.sha256,"Original customer save descriptor differs");
   const key="canadabuys-intake-save-"+request.requestSha256;
   let result=load(key+"-result");
   if(result===undefined){
    need(load(key+"-intent")===undefined,"Original save has an unresolved entered call; reconcile it before another dispatch");
    store(key+"-intent",{request,at:new Date().toISOString()});
    result=await tools.mcp__codex_apps__library_create_library_file(request.arguments);store(key+"-result",result);
   }
   journal.saveResults??=[];journal.saveResults.push({name:request.name,requestSha256:request.requestSha256,result});retain();
   text({event:"CUSTOMER_OFFICIAL_SAVE_RESULT",name:request.name,isError:result.isError,result:result.structuredContent});
   accept(await tools.write_stdin({session_id:session,chars:JSON.stringify({action:"official-library-save-result",requestSha256:request.requestSha256,result})+"\n",yield_time_ms:1000,max_output_tokens:8000}),"original-save-response");
  }else{await yield_control();accept(await tools.write_stdin({session_id:session,chars:"",yield_time_ms:1000,max_output_tokens:8000}),"whole-native-poll");}
 }
 journal.endedAt=new Date().toISOString();journal.nativeRetained=ready&&!ended;retain();
 text({event:"CUSTOMER_CONTROLLER_BOUNDARY",session,nativeRetained:journal.nativeRetained,exitCode:journal.exitCode??null,complete:journal.events.findLast(e=>e.event==="CUSTOMER_DELIVERY_COMPLETE")??null});
}catch(error){journal.error=String(error);journal.endedAt=new Date().toISOString();retain();text({event:"CUSTOMER_CONTROLLER_ERROR",session,error:String(error)});}