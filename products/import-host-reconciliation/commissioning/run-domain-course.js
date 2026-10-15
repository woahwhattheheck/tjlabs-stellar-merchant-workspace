/* Authored evidence, never actual Filio or customer activity. Execute with actual factories. */
function runImportHostCourse({core,codec}){
 const ok=(x,m)=>{if(!x)throw Error(m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const original=core.create({id:"authored-import-host-workspace",label:"Authored inventory import and host acceptance",createdAt:"2026-10-14T12:00:00Z"});
 let w=original,n=0;const requests=[];
 function apply(type,input){const q={id:"authored-operation-"+(++n),type,actor:"Authored course reviewer",at:"2026-10-14T12:00:00Z",input,expectedRevision:w.revision};const r=core.apply(w,q);w=r.workspace;requests.push(q);return r;}
 function source(sourceId,name,text,role){return apply("source.add",{sourceId,name,text,role});}
 const scope={application:"authored-inventory",tenant:"example-tenant",environment:"authored-offline",templateId:"template-inventory-v1"};
 const originalCSV='sku,name,quantity,active,notes\r\n001,"Café crate",1.00,true,"First line\r\nSecond line"\r\n002,"Small crate",2,false,"Keep leading zero SKU"\r\n003,"Rejected crate",3,true,"Authored validation rejection"\r\n004,"Uncertain crate",4,true,"Authored interrupted host write"\r\n005,"Skipped crate",5,false,"Reviewer excluded this row"\r\n';
 const rows='[{"sku":"001","name":"Café crate","quantity":1.00,"active":true,"external_number":9007199254740993,"notes":"First line\\r\\nSecond line"},{"sku":"002","name":"Small crate","quantity":2,"active":false,"external_number":9007199254740994,"notes":"Keep leading zero SKU"},{"sku":"003","name":"Rejected crate","quantity":3,"active":true,"external_number":9007199254740995,"notes":"Authored validation rejection"},{"sku":"004","name":"Uncertain crate","quantity":4,"active":true,"external_number":9007199254740996,"notes":"Authored interrupted host write"},{"sku":"005","name":"Skipped crate","quantity":5,"active":false,"external_number":9007199254740997,"notes":"Reviewer excluded this row"}]';
 const webhook='{"import_id":"authored-import-1","template_id":"template-inventory-v1","row_count":5,"imported_at":"2026-10-14T12:01:00Z","rows":'+rows+',"retained_extension":{"label":"Unknown provider metadata retained"}}';
 source("source-original","inventory-original.csv",originalCSV,"original");
 source("source-webhook-1","authored-successful-import.json",webhook,"import");
 source("source-callback-1","authored-callback-array.json",rows,"import");
 apply("import.capture",{importId:"import-webhook-1",label:"Authored successful-import envelope",sourceId:"source-webhook-1",kind:"webhook",scope,externalImportId:"authored-import-1",note:"Published-shape authored fixture; no verified signature or live delivery."});
 apply("import.capture",{importId:"import-callback-1",label:"Same authored rows, callback serialization",sourceId:"source-callback-1",kind:"callback",scope,externalImportId:"authored-import-1",note:"Explicit authored correlation; no real cross-channel guarantee inferred."});
 const fields=[["sku","SKU","text"],["name","Name","text"],["quantity","Quantity","decimal"],["active","Active","typed"],["external_number","Original external number","typed"]].map(([id,label,mode])=>({id,label,sourcePointer:"/"+id,targetPointer:"/"+id,mode}));
 const mapping={mappingId:"mapping-1",label:"Inventory host fields",importId:"import-webhook-1",keyPointers:["/sku"],fields,note:"Explicit SKU key and exact typed/text/decimal rules."};
 apply("mapping.save",mapping);
 const actions=[{row:1,action:"create",targetId:null,reason:"New SKU"},{row:2,action:"update",targetId:"host-2",reason:"Explicit preselected host record"},{row:3,action:"create",targetId:null,reason:"New SKU"},{row:4,action:"create",targetId:null,reason:"New SKU"},{row:5,action:"skip",targetId:null,reason:"Reviewer deliberately excludes this original row"}];
 const b1={batchId:"batch-1",label:"Authored first host plan",mappingId:"mapping-1",parentId:null,actions,reviewer:"Example engineer",note:"Prepared only; no network execution."};
 const bp=core.previewBatch(w,b1);ok(bp.ready,"First batch should be ready");apply("batch.prepare",{...b1,previewSha256:bp.sha256});
 const receipt1={schema:"tjlabs.import-host-result.v1",batchId:"batch-1",batchSha256:w.batches.at(-1).sha256,scope,attemptId:"authored-attempt-1",observedAt:"2026-10-14T12:10:00Z",providerReference:"AUTHORED-NOT-PROVIDER-EVIDENCE-1",rows:[{row:1,status:"accepted",targetId:"host-1",error:null},{row:2,status:"accepted",targetId:"host-2",error:null},{row:3,status:"rejected",targetId:null,error:"Authored host rule rejected this record"},{row:4,status:"uncertain",targetId:null,error:"Authored process ended before authoritative receipt"},{row:5,status:"not_attempted",targetId:null,error:null}]};
 source("receipt-1","authored-host-receipt-1.json",JSON.stringify(receipt1,null,2),"host_receipt");
 const rb1='{"schema":"tjlabs.import-host-readback.v1","scope":'+JSON.stringify(scope)+',"observedAt":"2026-10-14T12:11:00Z","coverage":{"kind":"selected_records","requestedIds":["host-1","host-2"]},"records":[{"id":"host-1","values":{"sku":"001","name":"Café crate","quantity":"1.0","active":true,"external_number":9007199254740993}},{"id":"host-2","values":{"sku":"002","name":"Small crate","quantity":2,"active":"false","external_number":9007199254740994}}]}';
 source("readback-1","authored-readback-1.json",rb1,"readback");
 const rc1={reconciliationId:"reconciliation-1",label:"Authored partial first result",batchId:"batch-1",receiptSourceId:"receipt-1",readbackSourceId:"readback-1",reviewer:"Example engineer",note:"Every source row retained, including partial and uncertain outcomes."};
 const rp1=core.previewReconciliation(w,rc1);ok(same(rp1.body.counts,{matched:1,divergent:1,rejected:1,uncertain:1,unobserved:0,skipped:1}),"First reconciliation outcomes differ");ok(rp1.body.rows[0].fields.find(f=>f.id==="external_number").actual.value==="9007199254740993","Large original numeric token rounded");ok(rp1.body.rows[2].fields.length===5,"Rejected row lost its expected fields");apply("reconciliation.save",{...rc1,previewSha256:rp1.sha256});
 const rows2=rows.replace('"Small crate"','"Small crate corrected"');
 const webhook2='{"import_id":"authored-import-2","template_id":"template-inventory-v1","row_count":5,"imported_at":"2026-10-14T12:20:00Z","rows":'+rows2+'}';
 source("source-webhook-2","authored-corrected-import.json",webhook2,"import");
 apply("import.capture",{importId:"import-webhook-2",label:"Authored corrected source edition",sourceId:"source-webhook-2",kind:"webhook",scope,externalImportId:"authored-import-2",note:"New source identity; original remains retained."});
 apply("mapping.save",{...mapping,mappingId:"mapping-2",label:"Same host contract, corrected source",importId:"import-webhook-2"});
 const b2={...b1,batchId:"batch-2",label:"Authored successor host plan",mappingId:"mapping-2",parentId:"batch-1",actions:actions.map(a=>a.row===1?{...a,action:"update",targetId:"host-1",reason:"Existing record from original accepted receipt"}:a)};
 const bp2=core.previewBatch(w,b2);ok(bp2.ready,"Successor not ready");apply("batch.prepare",{...b2,previewSha256:bp2.sha256});
 const receipt2={...receipt1,batchId:"batch-2",batchSha256:w.batches.at(-1).sha256,attemptId:"authored-attempt-2",observedAt:"2026-10-14T12:21:00Z",providerReference:"AUTHORED-NOT-PROVIDER-EVIDENCE-2",rows:actions.map(a=>({row:a.row,status:a.row===5?"not_attempted":"accepted",targetId:a.row===5?null:"host-"+a.row,error:null}))};
 source("receipt-2","authored-host-receipt-2.json",JSON.stringify(receipt2,null,2),"host_receipt");
 const parsed=core.inspectImport(w,"import-webhook-2");
 const records=parsed.rows.slice(0,4).map(r=>'{"id":"host-'+r.row+'","values":'+core.exactJSON(r.values)+'}').join(",");
 const rb2='{"schema":"tjlabs.import-host-readback.v1","scope":'+JSON.stringify(scope)+',"observedAt":"2026-10-14T12:22:00Z","coverage":{"kind":"selected_records","requestedIds":["host-1","host-2","host-3","host-4"]},"records":['+records+']}';
 source("readback-2","authored-readback-2.json",rb2,"readback");
 const rc2={...rc1,reconciliationId:"reconciliation-2",label:"Authored corrected source and host observation",batchId:"batch-2",receiptSourceId:"receipt-2",readbackSourceId:"readback-2"};
 const rp2=core.previewReconciliation(w,rc2);ok(rp2.body.counts.matched===4&&rp2.body.counts.skipped===1,"Successor observations differ");apply("reconciliation.save",{...rc2,previewSha256:rp2.sha256});
 const suggested=core.suggestPairs(w,"reconciliation-1","reconciliation-2");ok(suggested.pairs.length===5,"Explicit key correspondence mismatch");
 const cmp={comparisonId:"comparison-1",label:"Authored first versus corrected edition",leftId:"reconciliation-1",rightId:"reconciliation-2",pairs:suggested.pairs,reviewer:"Example engineer",note:"Confirm exact unique SKU pairs; changed source expectation is not evidence of repairing the original name."};
 const cp=core.previewComparison(w,cmp);ok(cp.body.rows.filter(r=>r.sourceChanged).length===1&&cp.body.rows[1].sourceChanged,"Source change detection differs");apply("comparison.save",{...cmp,previewSha256:cp.sha256});
 apply("review.save",{reviewId:"review-1",subjectType:"comparison",subjectId:"comparison-1",rowId:"pair:2",status:"investigate",owner:"Example engineer",reviewer:"Example reviewer",note:"Original active field was a string; original name expectation also changed.",parentId:null});
 apply("review.save",{reviewId:"review-2",subjectType:"comparison",subjectId:"comparison-1",rowId:"pair:2",status:"accept",owner:"Example engineer",reviewer:"Example reviewer",note:"Accept the selected corrected edition; retain original divergence and source change.",parentId:"review-1"});
 const exported=core.exportWorkspace(w),reopened=core.importWorkspace(JSON.stringify(exported));ok(same(w,reopened),"Full reopen differs");
 for(const q of requests)ok(core.apply(w,q).replayed,"Original operation did not replay");
 const report=core.report(w,{comparisonId:"comparison-1"}),csv=core.csv(report),handover=core.handover(w,{comparisonId:"comparison-1"});
 ok(report.rows[1].reviewHistory.length===2,"Named review revisions lost");ok(csv.includes("comparison_left")&&csv.includes("9007199254740993"),"Complete comparison CSV lost original value");ok(handover.originalFiles.every(f=>codec.sha256Bytes(codec.utf8Encode(f.content))===f.sha256),"Handover originals changed");
 const rejects=[];function reject(name,f){let failed=false;try{f();}catch(e){failed=true;rejects.push({name,message:e.message});}ok(failed,"Expected rejection: "+name);}
 reject("changed original request",()=>core.apply(w,{...requests[0],input:{...requests[0].input,text:"changed"}}));
 reject("altered full source",()=>{const z=JSON.parse(JSON.stringify(exported));z.workspace.sources[0].body.text+="changed";core.importWorkspace(z);});
 reject("stale reviewed batch",()=>core.apply(w,{id:"bad-preview",type:"batch.prepare",actor:"Authored reviewer",at:"2026-10-14T12:30:00Z",input:{...b1,batchId:"batch-stale",previewSha256:bp.sha256}}));
 const table=core.inspectSource(w,"source-original",{format:"csv"});ok(table.rows.length===5&&table.rows[0].values.sku==="001"&&table.rows[0].values.notes==="First line\r\nSecond line","Original CSV inspection changed");
 return {schema:"tjlabs.import-host-authored-course.v1",evidence:"Actual production factories executed against authored offline observations. No Filio SDK, real webhook, host network, native filesystem or browser execution is claimed.",working:exported,report,csv,requests,rejections:rejects,checks:{originalRows:5,imports:3,batches:2,reconciliations:2,comparisons:1,reviewRevisions:2,originalNumericToken:"9007199254740993",sameRequestReplays:requests.length,sourceChangedPairs:1,firstCounts:rp1.body.counts,laterCounts:rp2.body.counts,fullReopen:true,originalWorkspaceUnchanged:original.revision===0},handoverOriginalCount:handover.originalFiles.length};
}
if(typeof module!=="undefined"&&module.exports)module.exports={runImportHostCourse};
