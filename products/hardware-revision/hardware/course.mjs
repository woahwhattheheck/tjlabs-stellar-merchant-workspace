import {createHardwareReviewAPI} from "./core.mjs";
import {authoredCourse,authoredOriginals} from "./example.mjs";
export function receivingCourse(runtime){
 const api=createHardwareReviewAPI(runtime),started=Date.now(),d=authoredCourse(api,runtime),cases=[];
 const ok=(name,pass,detail={})=>{if(!pass)throw Error("Receiving case failed: "+name);cases.push({name,passed:true,detail});};
 const rejects=fn=>{try{fn();return false;}catch{return true;}};
 const [a,b,c]=d.workspace.editions.map(e=>e.report);
 ok("complete authored three-artifact revisions",a.summary.componentCount===8&&a.summary.unitUuidCount===9&&a.summary.connectionCount===17&&a.summary.errorCount===0,a.summary);
 ok("received stale originals remain visible",b.summary.errorCount===10&&b.findings.filter(x=>x.code==="FIRMWARE_NET_MISMATCH").length===2,b.summary);
 ok("row and aggregate reconciliation validity agree",b.bom.some(x=>!x.valid)&&b.bomReconciliation.filter(x=>!x.complete).length>0&&c.bom.every(x=>x.valid)&&c.bomReconciliation.every(x=>x.complete));
 ok("corrected source edition preserves prior errors",c.summary.errorCount===0&&c.summary.firmwareMatchedCount===2&&d.workspace.editions[1].report.summary.errorCount===10,c.summary);
 ok("stable component identity detects reannotation",d.comparison.changes.some(x=>x.kind==="component"&&x.change==="changed"&&x.left[0]?.reference==="R1"&&x.right[0]?.reference==="R101")&&!d.comparison.changes.some(x=>x.kind==="component"&&x.change!=="changed"),d.comparison.summary);
 ok("named exact comparison review complete",d.handoff.status.status==="REVIEW_COMPLETE"&&d.handoff.nativeApplication==="NOT_APPLIED",{comparisonSha256:d.handoff.proposal.comparisonSha256});
 const out=api.exportWorkspace(d.workspace),fresh=createHardwareReviewAPI(runtime),reopened=fresh.importWorkspace(out.content);
 ok("independent full export and replay",fresh.canonical(reopened)===api.canonical(d.workspace),{bytes:runtime.encode(out.content).length,sha256:out.sha256});
 for(const [name,content]of Object.entries(d.originals)){const s=fresh.readSource(reopened,d.ids[name]);ok("exact original "+name,s.content_base64===runtime.toBase64(runtime.encode(content))&&s.bodySha256===runtime.sha256(content),{bytes:s.bytes,sha256:s.bodySha256});}
 const op=d.workspace.operations[0],replay=api.addSource(d.workspace,op.payload,{operationId:op.id,expectedRoot:op.previousRoot,at:op.at}).workspace;
 ok("same exact operation replay",replay===d.workspace);
 ok("stale operation rejected",rejects(()=>api.addSource(d.workspace,op.payload,{operationId:"new-stale",expectedRoot:op.previousRoot,at:op.at})));
 const tampered=JSON.parse(out.content);tampered.sources[0].content_base64=runtime.toBase64(runtime.encode("changed original"));
 ok("changed source rejects whole import",rejects(()=>fresh.importWorkspace(JSON.stringify(tampered))));
 let w=d.workspace,n=0;const meta=()=>({operationId:"receiving-"+(++n),expectedRoot:w.rootSha256,at:"2026-10-15T00:01:00Z"});
 function original(name,content){const r=api.addSource(w,{name,mediaType:"application/octet-stream",content_base64:runtime.toBase64(runtime.encode(content))},meta());w=r.workspace;return r.sourceId;}
 function freeze(name,input){const r=api.saveEdition(w,{name,input,preparedBy:"AUTHORED receiver",note:"Retained receiving case"},meta());w=r.workspace;return r;}
 const baseline=JSON.parse(JSON.stringify(w.editions[0].input));
 const malformed=freeze("Retained incomplete mapping",api.blankInput());
 ok("malformed edition survives export and import",api.importWorkspace(api.exportWorkspace(w).content).editions.at(-1).report.summary.errorCount>0,{findings:malformed.report.findings.map(x=>x.code)});
 const codes=original("renumbered.net.xml",d.originals["baseline.net.xml"].replace(/<net code="([0-9]+)"/g,(_,x)=>'<net code="'+(Number(x)+100)+'"'));
 const i=JSON.parse(JSON.stringify(baseline));i.netlist.sourceId=codes;i.scope.revision="A-renumbered";const renumber=freeze("Only local net codes changed",i);
 ok("local net renumber does not change connectivity",api.compare(w,d.baselineId,renumber.editionId).summary.changeCount===0);
 const dxml=original("version-D.net.xml",d.originals["baseline.net.xml"].replace('version="E"','version="D"'));
 ok("explicit historical XML D is admitted",api.parseNetlist(w,dxml).exportVersion==="D");
 const entity=original("xml-entities.net.xml",d.originals["baseline.net.xml"].replace("DEMO-MCU","DEMO &amp; MCU &#x3a9;"));
 ok("standard XML entities decode with original offsets",api.parseNetlist(w,entity).components[0].value==="DEMO & MCU Ω");
 for(const [name,body]of [
 ["external.net.xml",'<!DOCTYPE export [<!ENTITY x SYSTEM "file:///private">]>'+d.originals["baseline.net.xml"]],
 ["duplicate-attribute.net.xml",d.originals["baseline.net.xml"].replace('<comp ref="U1">','<comp ref="U1" ref="U9">')]
 ]){const sid=original(name,body);ok("reject "+name,rejects(()=>api.parseNetlist(w,sid)));}
 const fractional=original("fractional-bom.csv",d.originals["baseline-bom.csv"].replace("AUTH-R-10K,2","AUTH-R-10K,1.5"));const fi=JSON.parse(JSON.stringify(baseline));fi.bom.sourceId=fractional;
 ok("exact fractional quantity mismatch remains visible",api.analyse(fi,w).findings.some(x=>x.code==="BOM_TOTAL_QUANTITY"));
 const absentLib=original("no-library.net.xml",d.originals["baseline.net.xml"].replace(/  <libparts>[\s\S]*?<\/libparts>\n/,""));const absentPin=original("unconnected-pin.json",JSON.stringify({pins:[{id:"absent",componentRef:"U1",pin:"999",symbol:"UNKNOWN",connection:"unconnected",expectedNet:"",notes:"Authored check"}]}));const ni=JSON.parse(JSON.stringify(baseline));ni.netlist.sourceId=absentLib;ni.firmware.sourceId=absentPin;
 ok("unknown disconnected pin cannot pass",api.analyse(ni,w).findings.some(x=>x.code==="FIRMWARE_PIN_INVENTORY_UNKNOWN"&&x.severity==="error"));
 const proposal=w.proposals.find(p=>p.id===d.proposalId);
 ok("review binds exact full comparison",rejects(()=>api.review(w,{proposalId:d.proposalId,comparisonSha256:"0".repeat(64),discipline:"EE",decision:"approved",reviewer:"Authored",note:"Wrong digest"},meta())));
 w=api.review(w,{proposalId:d.proposalId,comparisonSha256:proposal.comparisonSha256,discipline:"EE",decision:"needs-work",reviewer:"AUTHORED EE",note:"Request additional source clarification"},meta());
 ok("latest needs-work preserves prior approval and blocks",api.proposalStatus(w,d.proposalId).status==="NEEDS_REVIEW"&&w.reviews.filter(r=>r.discipline==="EE").length===2);
 const all=api.exportWorkspace(w),again=createHardwareReviewAPI(runtime).importWorkspace(all.content);
 ok("complete extended source course reopens",api.canonical(again)===api.canonical(w),{bytes:runtime.encode(all.content).length,sha256:all.sha256});
 return {schema:"tjlabs.hardware-receiving-result.v1",engine:api.engine,elapsedMs:Date.now()-started,cases,workspace:w,authoredWorkspace:d.workspace,authoredComparison:d.comparison};
}
export function capacityOriginals(count=500){
 if(!Number.isSafeInteger(count)||count<2||count>500)throw Error("Selected course uses 2..500 components");
 const xml=rev=>{
 const candidate=rev==="B",components=Array.from({length:count},(_,i)=>{const ref="U"+(i+1),part=candidate&&i===0?"AUTH-FOUR-B":"AUTH-FOUR-A";return '<comp ref="'+ref+'"><value>'+part+'</value><footprint>AUTHORED:FOUR_PIN</footprint><fields><field name="MPN">'+part+'</field></fields><libsource lib="AUTHORED" part="FOUR"/><sheetpath names="/" tstamps="/authored-capacity-root/"/><tstamps>00000000-0000-4000-8000-'+String(i+1).padStart(12,"0")+'</tstamps></comp>';}).join("\n");
 const nets=Array.from({length:4},(_,p)=>'<net code="'+(p+1+(candidate?100:0))+'" name="BUS'+(p+1)+'" class="Default">'+Array.from({length:count},(_,i)=>'<node ref="U'+(i+1)+'" pin="'+(candidate&&i===0&&p<2?2-p:p+1)+'" pinfunction="P" pintype="passive"/>').join("")+'</net>').join("\n");
 return '<?xml version="1.0" encoding="UTF-8"?>\n<export version="E"><design><source>AUTHORED-capacity.kicad_sch</source><date>2026-10-15</date><tool>AUTHORED KiCad-compatible E; no native generation</tool></design><components>'+components+'</components><libparts><libpart lib="AUTHORED" part="FOUR"><pins>'+[1,2,3,4].map(n=>'<pin num="'+n+'" name="P" type="passive"/>').join("")+'</pins></libpart></libparts><libraries><library logical="AUTHORED"><uri>authored-only</uri></library></libraries><nets>'+nets+'</nets></export>\n';
 };
 const bom=rev=>'child_part_number,qty,uom,refdes,notes\n'+(rev==="B"?'AUTH-FOUR-B,1,each,U1,Authored revision\n':"")+'AUTH-FOUR-A,'+(rev==="B"?count-1:count)+',each,"'+Array.from({length:rev==="B"?count-1:count},(_,i)=>"U"+(i+(rev==="B"?2:1))).join(",")+'",Authored capacity\n';
 const firmware=rev=>JSON.stringify({pins:Array.from({length:count*4},(_,k)=>{const i=Math.floor(k/4),p=k%4+1;return {id:"u"+(i+1)+"-p"+p,componentRef:"U"+(i+1),pin:String(rev==="B"&&i===0&&p<=2?3-p:p),expectedNet:"BUS"+p,connection:"net",symbol:"AUTH_U"+(i+1)+"_P"+p,notes:"Authored capacity contract"};})})+"\n";
 return Object.fromEntries(["A","B"].flatMap(rev=>[[rev+".net.xml",xml(rev)],[rev+"-bom.csv",bom(rev)],[rev+"-pins.json",firmware(rev)]]));
}
export function capacityCourse(runtime,count=500,onProgress=()=>{}){
 const started=Date.now(),api=createHardwareReviewAPI(runtime),originals=capacityOriginals(count),ids={},at="2026-10-15T00:02:00Z";let w=api.createWorkspace({title:"AUTHORED hardware capacity "+count,createdAt:at}),n=0;const phases=[],progress=x=>{phases.push(x);onProgress(x);},meta=()=>({operationId:"capacity-"+(++n),expectedRoot:w.rootSha256,at});let t=Date.now();
 for(const[name,content]of Object.entries(originals)){const r=api.addSource(w,{name,mediaType:"application/octet-stream",content_base64:runtime.toBase64(runtime.encode(content))},meta());w=r.workspace;ids[name]=r.sourceId;}progress({phase:"retain originals",elapsedMs:Date.now()-t});
 const editions=[];for(const rev of ["A","B"]){t=Date.now();const i=api.blankInput();i.scope={productId:"AUTHORED-CAPACITY",revision:rev,owner:"Authored owner"};i.netlist.sourceId=ids[rev+".net.xml"];i.bom.sourceId=ids[rev+"-bom.csv"];i.firmware.sourceId=ids[rev+"-pins.json"];const r=api.saveEdition(w,{name:"Authored "+rev,input:i},meta());w=r.workspace;editions.push(r.editionId);if(r.report.summary.componentCount!==count||r.report.summary.connectionCount!==count*4||r.report.summary.errorCount!==0||r.report.summary.firmwareMatchedCount!==count*4)throw Error("Capacity report mismatch");progress({phase:"freeze "+rev,elapsedMs:Date.now()-t,summary:r.report.summary});}
 t=Date.now();const proposal=api.propose(w,{name:"Authored capacity change",baseEditionId:editions[0],candidateEditionId:editions[1],preparedBy:"Authored owner",reason:"Selected full two-revision capacity"},meta());w=proposal.workspace;for(const discipline of ["EE","FW","MFG"])w=api.review(w,{proposalId:proposal.proposalId,comparisonSha256:proposal.proposal.comparisonSha256,discipline,decision:"approved",reviewer:"Authored "+discipline,note:"Capacity course only"},meta());progress({phase:"compare and named reviews",elapsedMs:Date.now()-t});
 t=Date.now();const exported=api.exportWorkspace(w),fresh=createHardwareReviewAPI(runtime).importWorkspace(exported.content);if(api.canonical(fresh)!==api.canonical(w))throw Error("Capacity full reopen mismatch");progress({phase:"full export and independent replay",elapsedMs:Date.now()-t});
 return {schema:"tjlabs.hardware-capacity-result.v1",engine:api.engine,elapsedMs:Date.now()-started,componentCount:count,connectionsPerEdition:count*4,contractRowsPerEdition:count*4,phases,workspaceBytes:runtime.encode(exported.content).length,workspaceSha256:exported.sha256,rootSha256:w.rootSha256,originals:Object.entries(originals).map(([name,content])=>({name,bytes:runtime.encode(content).length,sha256:runtime.sha256(content)})),workspace:w,proposalId:proposal.proposalId};
}
