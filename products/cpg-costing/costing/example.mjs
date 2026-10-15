export function buildAuthoredExample(api,runtime,originalInput){
 const clone=x=>JSON.parse(JSON.stringify(x)),at=n=>"2026-10-14T00:00:0"+n+"Z";
 let w=api.createWorkspace({title:"AUTHORED EXAMPLE — CPG costing rehearsal",createdAt:at(0)});
 const payload={name:"Authored_CPG_Tables.json",mediaType:"application/json",content_base64:runtime.toBase64(runtime.encode(JSON.stringify(originalInput,null,2)))};
 let x=api.addSource(w,payload,{operationId:"source-1",expectedRoot:w.rootSha256,at:at(0)});w=x.workspace;
 const input=clone(originalInput);for(const k of Object.keys(api.fields))input[k].forEach((r,i)=>r.sourceRefs=[{sourceId:x.sourceId,record:i+1,pointer:"/"+k+"/"+i}]);
 x=api.saveEdition(w,{name:"Authored baseline",input,preparedBy:"TJLabs example author",note:"All sample business records and amounts are invented for commissioning."},{operationId:"baseline",expectedRoot:w.rootSha256,at:at(1)});w=x.workspace;const baselineId=x.editionId;
 const csv="id,itemId,receivedDate,quantity,unit,invoiceAmount,currency,chargesComplete,evidence\r\noats-r1,oats,2026-10-01,100,lb,220,USD,yes,confirmed\r\nbags-r1,bags,2026-10-01,200,each,20,USD,yes,confirmed\r\n";
 x=api.addSource(w,{name:"Authored_Candidate_Receipts.csv",mediaType:"text/csv",content_base64:runtime.toBase64(runtime.encode(csv))},{operationId:"source-2",expectedRoot:w.rootSha256,at:at(2)});w=x.workspace;
 const candidate=clone(input);candidate.lots=api.mapTable(w,x.sourceId,{format:"csv",mapping:Object.fromEntries(csv.split("\r\n")[0].split(",").map(k=>[k,k]))}).rows;
 x=api.saveEdition(w,{name:"Authored supplier invoice correction",input:candidate,parentEditionId:baselineId,preparedBy:"TJLabs example author",note:"Only selected oat invoice changes from 200 to 220. Authored counterfactual, not a real supplier quote."},{operationId:"candidate",expectedRoot:w.rootSha256,at:at(3)});w=x.workspace;const candidateId=x.editionId;
 w=api.review(w,{editionId:candidateId,decision:"approved",reviewer:"Authored commissioning reviewer",note:"Arithmetic and source retention checked for this invented example only."},{operationId:"review-1",expectedRoot:w.rootSha256,at:at(4)});
 return {workspace:w,baselineId,candidateId,baseline:input,candidate,comparison:api.compare(w,baselineId,candidateId),candidateCSV:csv};
}
