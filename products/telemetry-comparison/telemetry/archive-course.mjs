import {createTelemetryAPI} from "./core.mjs";
import {createArchiveAPI} from "./archive.mjs";
import {demonstration} from "./example.mjs";
export function archiveCourse(runtime){
 const api=createTelemetryAPI(runtime),archive=createArchiveAPI(api,runtime),d=demonstration(runtime,api),checks=[];
 const ok=(name,passed,detail={})=>{if(!passed)throw Error("Archive receiving failed: "+name);checks.push({name,passed,detail});};
 const rejects=fn=>{try{fn();return false;}catch{return true;}};
 const original=api.exportWorkspace(d.workspace),packed=archive.serialize(d.workspace),freshAPI=createTelemetryAPI(runtime),freshArchive=createArchiveAPI(freshAPI,runtime),fresh=freshArchive.open(packed.content).workspace;
 ok("complete working bytes independently reconstructed",freshAPI.exportWorkspace(fresh).content===original.content,{originalBytes:runtime.encode(original.content).length,sharedBytes:packed.bytes,sharedSha256:packed.sha256,nodeCount:packed.nodeCount});
 ok("both original and shared intake preserve the same operation root",archive.receive(original.content).rootSha256===archive.receive(packed.content).rootSha256);
 ok("all original source bytes remain exact",fresh.sources.every((s,i)=>s.content_base64===d.workspace.sources[i].content_base64&&s.bodySha256===d.workspace.sources[i].bodySha256));
 const input=api.parseJSON(JSON.stringify(d.workspace.editions[1].input));api.analyse(input,d.workspace);
 input.streams[1].model.version="reviewed-metadata-version";input.streams[1].model.note="A new declaration on unchanged supplied values";
 const cached=api.analyse(input,d.workspace),cold=createTelemetryAPI(runtime).analyse(input,d.workspace);
 ok("metadata-only calculation equals a cold complete calculation",api.canonical(cached)===api.canonical(cold));
 cached.pairs[0].residual.value="changed returned preview";
 ok("editable returned preview cannot poison retained reuse",api.canonical(api.analyse(input,d.workspace))===api.canonical(cold));
 const calibrated=api.parseJSON(JSON.stringify(input));calibrated.streams[1].model.calibrationEnd="2026-10-01T00:01:00Z";
 const hot=api.analyse(calibrated,d.workspace),independent=createTelemetryAPI(runtime).analyse(calibrated,d.workspace);
 ok("calibration changes retain actual overlap findings",api.canonical(hot)===api.canonical(independent)&&hot.findings.some(f=>f.code==="CALIBRATION_OVERLAP"));
 const mixed=api.parseJSON(JSON.stringify(input));mixed.streams.push({...mixed.streams[1],id:"other-stream",model:{...mixed.streams[1].model,version:"inconsistent"}});
 const mixedReport=api.analyse(mixed,d.workspace);
 ok("inconsistent same-run model declarations retain errors",mixedReport.summary.errorCount>0&&api.canonical(mixedReport)===api.canonical(createTelemetryAPI(runtime).analyse(mixed,d.workspace)));
 const bad=api.parseJSON(packed.content);bad.workspace.sha256="0".repeat(64);
 ok("changed full-workspace commitment rejects",rejects(()=>archive.open(JSON.stringify(bad))));
 const cyclic=api.parseJSON(packed.content);cyclic.nodes[cyclic.root]=["a",[cyclic.root]];
 ok("cyclic shared references reject before expansion",rejects(()=>archive.open(JSON.stringify(cyclic))));
 return {schema:"tjlabs.telemetry-archive-course.v1",execution:"Actual maintained source; authored data and exact independent reopening",checks,sharedArchive:{bytes:packed.bytes,sha256:packed.sha256},originalWorkspace:{bytes:runtime.encode(original.content).length,sha256:original.sha256},rootSha256:d.workspace.rootSha256};
}
