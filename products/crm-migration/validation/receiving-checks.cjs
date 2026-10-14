'use strict';
function runChecks(runtime,example,archive){
 const {comparison:c,workspace:m,exportFiles,codec,zipper}=runtime,clone=x=>JSON.parse(JSON.stringify(x)),checks=[];
 function ok(name,test){if(!test())throw Error(name);checks.push({name,passed:true});}
 function rejects(fn){try{fn();return false;}catch{return true;}}
 const ws=m.restore(archive),first=ws.runs.first,second=ws.runs.corrected;
 ok("Full original-source replay, first 16 and corrected 0",()=>ws.revision===40&&first.output.findings.length===16&&second.output.findings.length===0&&c.digest(m.restore(m.archive(ws)))===c.digest(ws));
 ok("Exact large USD minor-unit total preserved",()=>second.output.totals.find(x=>x.currency==="USD").source_minor==="900719925474449351"&&second.output.totals.every(x=>x.difference_minor==="0"));
 const tampered=clone(archive);tampered.workspace.sourceWorkspace.sources["source-contacts"].content+=" ";tampered.sha256=c.digest(tampered.workspace);
 ok("Changed original rejected even with recomputed outer hash",()=>rejects(()=>m.restore(tampered)));
 const wrongOp=clone(ws.operations[0].request);wrongOp.payload.origin="Changed history";
 ok("Changed operation under existing ID rejected",()=>rejects(()=>m.apply(ws,wrongOp)));
 ok("Exact original operation retry preserves current edition",()=>c.digest(m.apply(ws,ws.operations[0].request))===c.digest(ws));
 const tables=Object.fromEntries(Object.entries(example.sources).map(([id,text])=>[id,c.parseCSV(text)]));
 const missing={...tables};delete missing["target-contacts-v2"];
 ok("Absent observed export rejected",()=>rejects(()=>c.compare(example.contracts.corrected,missing)));
 const collision=clone(tables);collision["map-contacts"].records[1].values.record_id="1001";const out=c.compare(example.contracts.corrected,collision);
 ok("Two source IDs mapped to one target produce ambiguity findings",()=>out.findings.some(f=>/crosswalk|mapping|ambiguous/.test(f.code))&&out.objects.find(o=>o.id==="contacts").matched<4);
 const direction=clone(example.contracts.corrected);direction.associations[0].types[0].typeId="2";
 ok("Wrong association direction's type is visible",()=>c.compare(direction,tables).findings.some(f=>/relation/.test(f.code)));
 const exports=exportFiles(ws),packed=zipper.zip(exports),unpacked=zipper.read(packed);
 ok("Complete portable bundle and ZIP member count",()=>Object.keys(exports).length===29&&unpacked.length===29&&unpacked.every(r=>codec.utf8Decode(r.data)===exports[r.name]));
 return {schema:"crm-migration.receiving-results.v1",runtime:"V8 pure JavaScript",native_filesystem_executed:false,browser_rendered:false,checks,workspace_sha256:c.digest(ws),first_findings:16,corrected_findings:0,export_members:29};
}
module.exports={runChecks};