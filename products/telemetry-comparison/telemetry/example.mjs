// Explicitly authored demonstration, not facility telemetry or a physics simulation.
export function demonstration(runtime,api){
 const at="2026-10-14T23:55:00Z",stamp=i=>"2026-10-01T00:"+String(i).padStart(2,"0")+":00Z";
 const header="timestamp,rack_inlet_f,pdu_kw,humidity_fraction\n";
 const good=Array.from({length:8},(_,i)=>[stamp(i),["68","69.8","71.6","72.5","73.4","74.3","75.2","76.1"][i],(10+i/5).toFixed(1),(0.40+i/100).toFixed(2)].join(","));
 const received=header+[good[0],good[1],good[2],good[2].replace("71.6","73.4"),good[4],good[3],good[5].replace("74.3","offline"),good[7]].join("\n")+"\n";
 const corrected=header+good.join("\n")+"\n";
 const prediction=(candidate)=>JSON.stringify({provenance:"Authored demonstration prediction; no physical model was run.",rows:Array.from({length:8},(_,i)=>({time:stamp(i),inlet_c:candidate?["20","21","22","22.5","23","23.5","24","24.5"][i]:["20","20.5","21","21.5","22","22.5","23","23.5"][i],power_w:String(10000+i*200+(candidate?0:200)),humidity_percent:String(40+i+(candidate?0:1))}))},null,2)+"\n";
 const files=[{name:"authored-received-observations.csv",content:received,mediaType:"text/csv"},{name:"authored-owner-corrected-observations.csv",content:corrected,mediaType:"text/csv"},{name:"authored-baseline-predictions.json",content:prediction(false),mediaType:"application/json"},{name:"authored-candidate-predictions.json",content:prediction(true),mediaType:"application/json"}];
 let workspace=api.createWorkspace({title:"AUTHORED EXAMPLE — one pod telemetry comparison",createdAt:at,id:"authored-telemetry-pod-20261014"}),n=0;
 const meta=()=>({operationId:"authored-op-"+(++n),expectedRoot:workspace.rootSha256,at});
 const sourceIds=[];
 for(const f of files){const r=api.addSource(workspace,{name:f.name,mediaType:f.mediaType,content_base64:runtime.toBase64(runtime.encode(f.content))},meta());workspace=r.workspace;sourceIds.push(r.sourceId);}
 const input=api.blankInput();input.scope={siteId:"AUTHORED-SITE",podId:"POD-A",clockId:"UTC",timeFormat:"iso-offset",start:stamp(0),end:stamp(8),cadenceMs:60000};
 input.points=[{id:"rack-inlet",label:"Rack inlet temperature",quantity:"temperature",unit:"C",lower:"18",upper:"27"},{id:"pdu-power",label:"PDU real power",quantity:"power",unit:"kW",lower:"0",upper:"15"},{id:"humidity",label:"Relative humidity",quantity:"humidity",unit:"percent",lower:"30",upper:"60"}];
 const observations=id=>({id:"measurements",sourceId:id,role:"observation",runId:"",format:"csv",layout:"wide",timeField:"timestamp",timeFormat:"iso-offset",clockId:"UTC",columns:[{pointId:"rack-inlet",field:"rack_inlet_f",unit:"F"},{pointId:"pdu-power",field:"pdu_kw",unit:"kW"},{pointId:"humidity",field:"humidity_fraction",unit:"fraction"}]});
 const predictions=(id,version)=>({id:"prediction",sourceId:id,role:"prediction",runId:"pod-model",format:"json",arrayPointer:"/rows",layout:"wide",timeField:"/time",timeFormat:"iso-offset",clockId:"UTC",columns:[{pointId:"rack-inlet",field:"/inlet_c",unit:"C"},{pointId:"pdu-power",field:"/power_w",unit:"W"},{pointId:"humidity",field:"/humidity_percent",unit:"percent"}],model:{id:"AUTHORED-NO-PHYSICS",version,calibrationStart:"2026-09-30T00:00:00Z",calibrationEnd:"2026-10-01T00:00:00Z",calibrationClockId:"UTC",note:"These predictions are authored values, not a fitted model."}});
 input.streams=[observations(sourceIds[0]),predictions(sourceIds[2],"authored-baseline")];
 let r=api.saveEdition(workspace,{name:"Received files — unresolved original readings",input,preparedBy:"Authored example",note:"Preserve duplicate, out-of-order and invalid readings visibly."},meta());workspace=r.workspace;const originalEditionId=r.editionId;
 const clean=JSON.parse(JSON.stringify(input));clean.streams[0]=observations(sourceIds[1]);
 r=api.saveEdition(workspace,{name:"Owner-corrected measurements with baseline predictions",input:clean,parentEditionId:originalEditionId,preparedBy:"Authored example",note:"A separate complete corrected source is supplied explicitly; original bytes remain retained."},meta());workspace=r.workspace;const baselineEditionId=r.editionId;
 const candidate=JSON.parse(JSON.stringify(clean));candidate.streams[1]=predictions(sourceIds[3],"authored-candidate");
 r=api.saveEdition(workspace,{name:"Candidate predictions on identical corrected measurements",input:candidate,parentEditionId:baselineEditionId,preparedBy:"Authored example",note:"Same measured cohort; predictions and model version are changed explicitly."},meta());workspace=r.workspace;const candidateEditionId=r.editionId;
 workspace=api.review(workspace,{editionId:candidateEditionId,decision:"approved",reviewer:"Authored reviewer",note:"Demonstration data only. Approved as a reproducible software handoff, not for an operating change."},meta());
 return {workspace,files,sourceIds,originalEditionId,baselineEditionId,candidateEditionId,input:candidate,comparison:api.compare(workspace,baselineEditionId,candidateEditionId)};
}
