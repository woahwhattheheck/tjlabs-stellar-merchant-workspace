export function receiveStudioSessionCore(core){
 const checks=[],ok=(name,v)=>{if(!v)throw new Error(name);checks.push({name,passed:true});},copy=x=>JSON.parse(JSON.stringify(x));
 let w=core.receive(core.create({id:"studio-session-authored-course",label:"Authored full session course"}),{id:"first",label:"Original overnight session",receivedAt:"2026-10-15T05:10:00Z",notes:"Fictional sources.6h×12000=72000;2h×12000=24000,labelbase72000,artistot24000. Recordedartistot12000 is-12000. Deposit36000 appliedonce.",sources:core.sampleSources});
 let a=core.analyse(w,"first");ok("Booked and actual overnight durations distinct",a.sessions[0].bookedMinutes===360&&a.sessions[0].actualMinutes===480);
 ok("Exact label and artist allocations expose missing overtime",a.allocations.find(x=>x.payerId==="ARTIST-1").deltaMinor==="-12000");
 ok("Deposit applied once",a.invoices.find(x=>x.invoiceId==="INVOICE-LABEL").balanceMinor==="36000");
 const att=a.attention.find(x=>x.code==="invoice_component_difference");
 w=core.review(w,{id:"review-1",editionId:"first",attentionId:att.id,disposition:"investigate",reviewer:"Authored operator",reason:"Check source extension.",evidence:"Authored source note",previousReviewId:null});
 w=core.review(w,{id:"review-2",editionId:"first",attentionId:att.id,disposition:"correct_source",reviewer:"Authored operator",reason:"One overtime hour missing from actual invoice extract.",evidence:"Authored corrected export",previousReviewId:"review-1"});
 ok("Review correction retains prior and numeric difference",w.reviews.length===2&&core.analyse(w,"first").allocations[1].deltaMinor==="-12000");
 const next=copy(core.sampleSources);
 next.crew.text=next.crew.text.replace("ASSISTANT-1,cant_make_it,","ASSISTANT-1,covered,CREW-3")+"CREW-3,SESSION-1,assistant,ASSISTANT-2,seen,\r\n";
 next.reports.text=next.reports.text.replace("draft,,,Authored draft","signed,Authored assistant,2026-10-16T02:05:00-04:00,Authored signed");
 next.invoice_lines.text=next.invoice_lines.text.replace("overtime,12000","overtime,24000");next.sessions.text="\uFEFF"+next.sessions.text;
 w=core.receive(w,{id:"corrected",label:"Corrected originals",receivedAt:"2026-10-16T10:00:00Z",notes:"Fictional correction: accepted cover, signed report, full overtime.",sources:next});a=core.analyse(w,"corrected");
 ok("Accepted cover and signed report close source gaps",a.attention.length===0);
 ok("Both original editions and BOM/CRLF preserved",w.editions.length===2&&core.reopen(w).editions[1].sources.sessions.text===next.sessions.text&&w.reviews.every(x=>x.editionId==="first"));
 let caught=false,bad=copy(w);bad.reviews[0].reason="changed";try{core.reopen(bad);}catch{caught=true;}ok("Retained review mutation rejected",caught);
 const po=copy(next);po.sessions.text=po.sessions.text.replace("quote_reference","quote_reference,po_reference").replace("Authored accepted six-hour quote","Authored accepted six-hour quote,PO-SESSION");po.allocations.text=po.allocations.text.replace("reference\r\n","reference,deal_po_reference\r\n").replace("covers six booked hours\r\n","covers six booked hours,PO-DEAL\r\n");po.invoice_lines.text=po.invoice_lines.text.replace("reference\r\n","reference,po_reference\r\n").replace("Authored invoice base\r\n","Authored invoice base,PO-DEAL\r\n").replace("Authored invoice omits one overtime hour\r\n","Authored invoice omits one overtime hour,\r\n");
 let p=core.receive(w,{id:"po",label:"Session PO",receivedAt:"2026-10-16T11:00:00Z",notes:"Authored mismatch",sources:po});ok("Session PO wins over declared deal PO",core.analyse(p,"po").attention.some(x=>x.code==="invoice_po_difference"));
 const cancelled=copy(next);cancelled.sessions.text=cancelled.sessions.text.replace(",completed,booked,",",cancelled,booked,");p=core.receive(w,{id:"cancel",label:"Cancelled session",receivedAt:"2026-10-16T11:00:00Z",notes:"Authored policy review",sources:cancelled});a=core.analyse(p,"cancel");ok("Cancellation never invents charge or refund",a.sessions[0].totalMinor===null&&a.invoices[0].receivedMinor==="36000");
 const fixed=copy(next);fixed.allocations.text=fixed.allocations.text.replace(",booked,0,",",fixed,80000,");p=core.receive(w,{id:"fixed",label:"Fixed label cap",receivedAt:"2026-10-16T11:00:00Z",notes:"Authored cap80000:72000base+8000overtime,label;16000artist.",sources:fixed});a=core.analyse(p,"fixed");ok("Exact base-first fixed cap",a.allocations.find(x=>x.payerId==="LABEL-1"&&x.category==="overtime").expectedMinor==="8000"&&a.allocations.find(x=>x.payerId==="ARTIST-1").expectedMinor==="16000");
 const malformed=copy(next);malformed.sessions.text+='"';caught=false;try{core.receive(w,{id:"bad",label:"Malformed",receivedAt:"2026-10-16T11:00:00Z",notes:"",sources:malformed});}catch{caught=true;}ok("Malformed intake preserves current complete workspace",caught&&core.reopen(w).editions.length===2);

 const occupied=copy(core.sampleSources);occupied.sessions.text+="SESSION-2,ROOM-A,ARTIST-2,2026-10-15T19:00:00-04:00,2026-10-15T21:00:00-04:00,,,scheduled,booked,12000,0,12000,15,USD,Authored second booking\r\n";occupied.crew.text+="CREW-4,SESSION-2,assistant,ASSISTANT-1,seen,\r\n";
 p=core.receive(w,{id:"pending-cover",label:"Original duty retained",receivedAt:"2026-10-16T11:00:00Z",notes:"A cant_make_it remains occupied until acceptedcover",sources:occupied});a=core.analyse(p,"pending-cover");ok("Unresolved cover retains original person's reserved occupancy",a.attention.some(x=>x.code==="crew_overlap"&&x.reference==="ASSISTANT-1")&&a.sessions.find(x=>x.sessionId==="SESSION-1").crew.find(x=>x.role==="assistant").effective===0);

 return {schema:"tjlabs.studio-session-source-course.v1",checks,workspace:w,summary:core.analyse(w,"corrected").summary};
}
