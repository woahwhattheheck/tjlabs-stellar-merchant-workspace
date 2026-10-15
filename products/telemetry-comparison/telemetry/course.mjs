import {createTelemetryAPI} from "./core.mjs";
import {demonstration} from "./example.mjs";
export function receivingCourse(runtime){
 const api=createTelemetryAPI(runtime),started=Date.now(),d=demonstration(runtime,api),cases=[];
 const ok=(name,pass,detail)=>{if(!pass)throw Error("Receiving case failed: "+name);cases.push({name,passed:true,detail});};
 const rejects=fn=>{try{fn();return false;}catch{return true;}};
 const original=d.workspace.editions[0].report,baseline=d.workspace.editions[1].report,candidate=d.workspace.editions[2].report;
 ok("whole authored originals and invalid occurrence preservation",original.summary.occurrenceCount===48&&original.summary.errorCount===4&&!original.summary.usable,{paired:original.summary.pairedCount,findings:original.findings});
 ok("exact temperature/power/humidity conversion",baseline.metrics[0].mae.value==="0.8125"&&baseline.metrics[1].mae.value==="0.2"&&baseline.metrics[2].mae.value==="1",baseline.metrics);
 ok("same actual cohort model comparison",d.comparison.rows.every(r=>r.comparable&&r.commonPairs===8&&r.rightCommonMetrics.mae.value==="0"),d.comparison.rows);
 const out=api.exportWorkspace(d.workspace),reopened=api.importWorkspace(out.content);
 ok("complete export independently replays",api.canonical(reopened)===api.canonical(d.workspace),{bytes:runtime.encode(out.content).length,sha256:out.sha256});
 for(let i=0;i<d.files.length;i++){const s=api.readSource(reopened,d.sourceIds[i]);ok("exact original "+d.files[i].name,runtime.decode(runtime.fromBase64(s.content_base64))===d.files[i].content,{bytes:s.bytes,sha256:s.bodySha256});}
 const op=d.workspace.operations.at(-1),meta={operationId:op.id,expectedRoot:op.previousRoot,at:op.at};
 ok("same operation replay",api.review(d.workspace,op.payload,meta).rootSha256===d.workspace.rootSha256,{root:d.workspace.rootSha256});
 ok("stale operation rejects",rejects(()=>api.review(d.workspace,op.payload,{...meta,operationId:"new-stale",expectedRoot:op.previousRoot})),{});
 const altered=JSON.parse(out.content);altered.sources[0].content_base64=runtime.toBase64(runtime.encode(d.files[0].content.replace("68,","69,")));
 ok("changed retained bytes reject",rejects(()=>api.importWorkspace(JSON.stringify(altered))),{});
 ok("deep immutable workspace",Object.isFrozen(d.workspace)&&Object.isFrozen(d.workspace.editions[0].report.occurrences[0]),{});
 const malformed=api.saveEdition(d.workspace,{name:"Incomplete authored draft",input:api.blankInput()},{operationId:"incomplete",expectedRoot:d.workspace.rootSha256,at:"2026-10-15T00:00:00Z"});
 ok("incomplete edition preserves JSON replay",!malformed.report.summary.usable&&api.importWorkspace(api.exportWorkspace(malformed.workspace).content).rootSha256===malformed.workspace.rootSha256,{findings:malformed.report.findings});
 ok("offset and naive clock distinction",api.timestamp("2026-10-01T01:00:00+01:00","iso-offset")===api.timestamp("2026-10-01T00:00:00Z","iso-offset")&&rejects(()=>api.timestamp("2026-11-01T01:30:00","iso-offset"))&&rejects(()=>api.timestamp("2026-02-30T00:00:00Z","iso-offset")),{});
 const changed=api.compare(d.workspace,d.originalEditionId,d.baselineEditionId);
 ok("changed actual sources cannot create comparable cohort",changed.rows.every(r=>!r.comparable),changed.rows);
 let w=api.createWorkspace({title:"Authored boundary receiving",createdAt:"2026-10-15T00:00:00Z"}),n=0;
 function source(name,content){const r=api.addSource(w,{name,mediaType:"text/csv",content_base64:runtime.toBase64(runtime.encode(content))},{operationId:"boundary-"+(++n),expectedRoot:w.rootSha256,at:"2026-10-15T00:00:00Z"});w=r.workspace;return r.sourceId;}
 const a=source("actual.csv","time,value\n10,9\n30,18\n"),b=source("pred.csv","time,value\n11,5\n12,5\n20,5\n");
 const x=api.blankInput();x.scope={siteId:"AUTHORED",podId:"BOUNDARY",clockId:"relative",timeFormat:"relative-seconds",start:"0",end:"120",cadenceMs:60000};x.alignment={method:"nearest",toleranceMs:20000};x.points=[{id:"delta",label:"Authored temperature difference",quantity:"temperature_difference",unit:"C",lower:"",upper:""}];
 const map={format:"csv",layout:"wide",timeField:"time",timeFormat:"relative-seconds",clockId:"relative"};
 x.streams=[{...map,id:"a",sourceId:a,role:"observation",columns:[{pointId:"delta",field:"value",unit:"F"}]},{...map,id:"p",sourceId:b,role:"prediction",runId:"authored",columns:[{pointId:"delta",field:"value",unit:"C"}],model:{id:"authored",version:"1",calibrationStart:"-120",calibrationEnd:"0",calibrationClockId:"relative"}}];
 let rr=api.analyse(x,w);ok("temperature difference and bounded one-to-one alignment",rr.pairs.length===1&&rr.pairs[0].observation.value==="5"&&rr.metrics[0].ambiguousPredictionCount===1&&rr.metrics[0].reusedObservationPredictionCount===1,rr.metrics);
 const y=api.parseJSON(JSON.stringify(x));y.points[0].quantity="power";y.points[0].unit="kW";y.streams[0].columns[0].unit="kWh";rr=api.analyse(y,w);ok("energy cannot become power",rr.occurrences.filter(o=>o.role==="observation").every(o=>o.status==="invalid"),{findings:rr.findings});
 const j=source("large.json",'{"rows":[{"t":"0","point":"counter","value":9007199254740992.1},{"t":"60","point":"counter","value":9007199254740992.2}]}');
 const p=source("large-pred.json",'{"rows":[{"t":"0","point":"counter","value":9007199254740992.2},{"t":"60","point":"counter","value":9007199254740992.3}]}');
 const z=api.blankInput();z.scope=x.scope;z.points=[{id:"counter",label:"Exact authored counter",quantity:"count",unit:"count",lower:"",upper:""}];
 const long={format:"json",arrayPointer:"/rows",layout:"long",timeField:"/t",timeFormat:"relative-seconds",clockId:"relative",pointField:"/point",valueField:"/value",unit:"count"};
 z.streams=[{...long,id:"long-actual",sourceId:j,role:"observation"},{...long,id:"long-pred",sourceId:p,role:"prediction",runId:"exact",model:x.streams[1].model}];
 rr=api.analyse(z,w);ok("long-layout numeric lexemes beyond IEEE integer precision",rr.metrics[0].mae.value==="0.1"&&rr.pairs[0].observation.value==="9007199254740992.1",rr.metrics);
 const partial=api.parseJSON(JSON.stringify(d.input));partial.streams[1].arrayPointer="/rows";const omitted=d.files[3].content.replace(/"time": "2026-10-01T00:07:00Z"/,'"time": "2026-10-01T00:08:00Z"');const added=api.addSource(d.workspace,{name:"authored-partial-predictions.json",mediaType:"application/json",content_base64:runtime.toBase64(runtime.encode(omitted))},{operationId:"partial-source",expectedRoot:d.workspace.rootSha256,at:"2026-10-15T00:00:00Z"});partial.streams[1].sourceId=added.sourceId;
 const pe=api.saveEdition(added.workspace,{name:"Partial candidate",input:partial},{operationId:"partial-edition",expectedRoot:added.workspace.rootSha256,at:"2026-10-15T00:00:00Z"}),pc=api.compare(pe.workspace,d.candidateEditionId,pe.editionId);
 ok("dropped prediction coverage stays explicit",pc.rows.every(r=>r.commonPairs===7&&r.leftOnlyPairs===1&&r.rightOnlyPairs===0),pc.rows);
 return {schema:"tjlabs.telemetry-receiving-course.v1",engine:api.engine,execution:"Actual production source with supplied hashing/encoding runtime; authored data, no physics or live control",elapsedMs:Date.now()-started,cases,workspace:d.workspace,comparison:d.comparison};
}
