export function receiveDeliverySlotSource({core,codec}){
const checks=[],clone=x=>JSON.parse(JSON.stringify(x)),check=(name,ok)=>{if(!ok)throw Error(name);checks.push({name,passed:true});};
const read=(w,id)=>core.analyse(w,id),key=core.canonical(["S24","ORDER-A","L1"]);
let w=core.receive(core.create({id:"authored-delivery-course",label:"Authored bakery source course"}),{id:"E1",label:"Before-cutoff baseline",receivedAt:"2026-10-24T09:00:00Z",notes:"Authored source course, not production account data.",sources:core.sampleSources});
let r=read(w,"E1");
check("Replacement and cancellation preserve twelve loaf cutoff demand",r.products.find(p=>p.productId==="WHITE").baselineDemand==="12"&&r.lines.find(l=>l.buyerId==="C").baselineState==="cancelled");
check("Two dozen creates twenty-four pieces with four capacity excess and two observed shortage",r.products.find(p=>p.productId==="CROISSANT").capacityExcess==="4"&&r.products.find(p=>p.productId==="CROISSANT").productionDifference==="-2"&&r.lines.find(l=>l.buyerId==="B").pickDifference==="-2");
check("Cancelled zero-demand line requires no invented pick snapshot",r.products[0].pickCoverage==="complete"&&r.products[0].pickDifference==="0"&&r.products[0].requiredPickLines===1);
check("Late amendment remains retained without replacing cutoff",r.revisions.length===6&&r.lines[0].lateRevisionIds[0]==="A3"&&r.lines[0].selectedRevisionId==="A2");
const choose=(id,disposition,selectedRevisionId,previousReviewId)=>{w=core.review(w,{id,editionId:"E1",subjectType:"line",subjectId:key,disposition,selectedRevisionId,reviewer:"Authored operator",reason:"Explicit course decision",evidence:"Source revision and independent production counts examined.",previousReviewId});};
choose("R1","accept_late","A3",null);r=read(w,"E1");
check("Explicit late selection leaves baseline twelve and reviewed twenty",r.lines[0].baselineQuantity==="12"&&r.lines[0].selectedQuantity==="20"&&r.products[0].capacityExcess==="5");
choose("R2","investigate",null,"R1");r=read(w,"E1");
check("A later note preserves the explicit late selection",r.lines[0].review.id==="R2"&&r.lines[0].selectionDecision.id==="R1"&&r.lines[0].selectedQuantity==="20");
choose("R3","retain_cutoff",null,"R2");
check("Explicit correction returns to cutoff and preserves all review records",read(w,"E1").lines[0].selectedQuantity==="12"&&w.reviews.length===3);
const newer=clone(core.sampleSources);newer.order_revisions.text="\ufeff"+newer.order_revisions.text.replace("20,loaf,2026-10-22T08:05","18,loaf,2026-10-22T08:05");
w=core.receive(w,{id:"E2",label:"Corrected later source edition",receivedAt:"2026-10-24T10:00:00Z",notes:"Corrected late quantity; prior decisions stay on E1.",sources:newer});
check("New original source does not inherit earlier decisions",read(w,"E2").lines[0].selectionDecision===null&&read(w,"E1").lines[0].selectionDecision.id==="R3");
check("Full JSON reopen retains exact BOM CRLF and both source histories",JSON.stringify(core.reopen(JSON.parse(JSON.stringify(w))))===JSON.stringify(w)&&w.editions[1].sources.order_revisions.text===newer.order_revisions.text);
let rejected=false;try{core.review(w,{id:"R1",editionId:"E2",subjectType:"line",subjectId:key,disposition:"accept_late",selectedRevisionId:"A3",reviewer:"Operator",reason:"Wrong reused ID",evidence:"",previousReviewId:null});}catch{rejected=true;}
check("Review identity cannot silently move to corrected source",rejected);
const variant=(id,change)=>{const sources=clone(core.sampleSources);change(sources);return core.receive(core.create({id:"variant-"+id,label:id}),{id,label:id,receivedAt:"2026-10-24T09:00:00Z",notes:"Authored focused source variation",sources});};
let v=variant("BOUNDARY",s=>{s.order_revisions.text=s.order_revisions.text.replace("08:05:00","08:00:00");});check("Exact boundary is late under before",read(v,"BOUNDARY").lines[0].baselineQuantity==="12");
v=variant("INCLUSIVE",s=>{s.order_revisions.text=s.order_revisions.text.replace("08:05:00","08:00:00");s.slots.text=s.slots.text.replace(",before,",",at_or_before,");});check("Exact boundary is eligible under explicit inclusive rule",read(v,"INCLUSIVE").lines[0].baselineQuantity==="20");
v=variant("CAPACITY",s=>{s.slot_products.text=s.slot_products.text.replace(",15,loaf,",",,,").replace(",20,piece,",",0,piece,");});r=read(v,"CAPACITY");check("Unknown capacity stays null and declared zero remains zero",r.products[0].capacityQuantity===null&&r.products[1].capacityQuantity==="0"&&r.products[1].capacityExcess==="24");
v=variant("DECIMAL",s=>{s.products.text=s.products.text.replace("White loaf,loaf,whole","White dough,kg,decimal");s.unit_packs.text=s.unit_packs.text.replace("WHITE,loaf,1,1","WHITE,kg,1,0.001\r\nWHITE,loaf,0.75,1");s.order_revisions.text=s.order_revisions.text.replace("A2,S24,ORDER-A,L1,2,A,WHITE,confirmed,12","A2,S24,ORDER-A,L1,2,A,WHITE,confirmed,3");});check("Three declared 0.75kg packs compare exactly as2.25kg",read(v,"DECIMAL").lines[0].baselineQuantity==="2.25");
rejected=false;try{variant("DUPLICATE",s=>{s.production.text+=s.production.text.split("\r\n")[1]+"\r\n";});}catch{rejected=true;}check("Competing production snapshots are not silently summed",rejected);
rejected=false;try{variant("INVERTED",s=>{s.order_revisions.text=s.order_revisions.text.replace("A2,S24,ORDER-A,L1,2,A,WHITE,confirmed,12,loaf,2026-10-22T07:30","A2,S24,ORDER-A,L1,2,A,WHITE,confirmed,12,loaf,2026-10-22T06:30");});}catch{rejected=true;}check("Inverted revision history requires source correction",rejected);
v=variant("FORMULA",s=>{s.buyers.text=s.buyers.text.replace("A,Buyer A","A,=SUM(1+1)");});const derived=core.csv(v,"FORMULA","lines");check("Derived CSV neutralizes formula-like buyer labels and preserves signed numeric difference",derived.includes("'=SUM(1+1)")&&derived.includes(",-2,")&&v.editions[0].sources.buyers.text.includes("A,=SUM(1+1)"));
const report=core.report(w,"E2");check("Report retains all source downloads and both numeric bases",report.includes("Download order_revisions.csv")&&report.includes("baselineDemand")&&report.includes("reviewedDemand"));
return {schema:"tjlabs.delivery-slot-source-receiving.v1",provenance:"Production core executed against complete explicitly authored originals.",checks,workspace:w,current:read(w,"E2"),report};
}
