export function throughputCourse(api,runtime,rows=1000,points=12){
 const start=Date.now(),at="2026-10-14T23:55:00Z";let w=api.createWorkspace({title:"Authored capacity course",createdAt:at}),n=0;
 const headers=["t",...Array.from({length:points},(_,i)=>"p"+i)];
 const content=headers.join(",")+"\n"+Array.from({length:rows},(_,i)=>[String(i*60),...Array.from({length:points},(_,j)=>String(20+j+(i%7)/10))].join(",")).join("\n")+"\n";
 function add(name,body){const r=api.addSource(w,{name,mediaType:"text/csv",content_base64:runtime.toBase64(runtime.encode(body))},{operationId:"capacity-"+(++n),expectedRoot:w.rootSha256,at});w=r.workspace;return r.sourceId;}
 const measured=add("AUTHORED-capacity-observations.csv",content),pred=add("AUTHORED-capacity-predictions.csv",content);
 const input=api.blankInput();input.scope={siteId:"AUTHORED",podId:"capacity",clockId:"AUTHORED-relative",timeFormat:"relative-seconds",start:"0",end:String(rows*60),cadenceMs:60000};
 input.points=Array.from({length:points},(_,i)=>({id:"p"+i,label:"Authored point "+i,quantity:"temperature",unit:"C",lower:"",upper:""}));
 const common={format:"csv",layout:"wide",timeField:"t",timeFormat:"relative-seconds",clockId:input.scope.clockId,columns:input.points.map(p=>({pointId:p.id,field:p.id,unit:"C"}))};
 input.streams=[{...common,id:"actual",sourceId:measured,role:"observation",runId:""},{...common,id:"prediction",sourceId:pred,role:"prediction",runId:"capacity-model",model:{id:"AUTHORED",version:"1",calibrationStart:"-60000",calibrationEnd:"0",calibrationClockId:input.scope.clockId,note:"Identical authored values for throughput only."}}];
 runtime.progress?.({phase:"sources-ready",elapsedMs:Date.now()-start});const beforeSave=Date.now();let r=api.saveEdition(w,{name:"Authored baseline",input},{operationId:"capacity-"+(++n),expectedRoot:w.rootSha256,at});w=r.workspace;const baselineId=r.editionId,saveMs=Date.now()-beforeSave;
 runtime.progress?.({phase:"baseline-saved",saveMs});const candidate=api.parseJSON(JSON.stringify(input));candidate.streams[1].model.version="2";
 const next=Date.now();r=api.saveEdition(w,{name:"Authored candidate",input:candidate,parentEditionId:baselineId},{operationId:"capacity-"+(++n),expectedRoot:w.rootSha256,at});w=r.workspace;const nextSaveMs=Date.now()-next;
 runtime.progress?.({phase:"candidate-saved",nextSaveMs});const compared=api.compare(w,baselineId,r.editionId),exAt=Date.now(),out=api.exportWorkspace(w),exportMs=Date.now()-exAt;
 runtime.progress?.({phase:"exported",exportMs,bytes:runtime.encode(out.content).length});const fresh=api.importWorkspace(out.content),elapsedMs=Date.now()-start;
 if(fresh.rootSha256!==w.rootSha256||compared.rows.some(r=>!r.comparable||r.commonPairs!==rows)||r.report.summary.pairedCount!==rows*points)throw Error("Full capacity handoff failed");
 return {schema:"tjlabs.telemetry-capacity-course.v1",execution:"Actual production source under supplied runtime; no physical simulation",rowsPerSource:rows,points,sourceCount:2,frozenEditions:2,pairsPerEdition:rows*points,saveMs,nextSaveMs,exportMs,elapsedMs,workspaceBytes:runtime.encode(out.content).length,workspaceSha256:out.sha256,rootSha256:w.rootSha256};
}