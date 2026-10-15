
import {createProductionAPI,blankInput,TABLE_FIELDS} from "./core.mjs";
export function exampleSources(){
 const esc=v=>{const s=String(v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
 const csv=(kind,rows)=>TABLE_FIELDS[kind].map(esc).join(",")+"\r\n"+rows.map(r=>TABLE_FIELDS[kind].map(k=>esc(r[k]??"")).join(",")).join("\r\n")+"\r\n";
 const at=h=>"2026-10-14T"+h+":00Z";
 const runs=[
 {id:"RUN-A",lineId:"LINE-1",sku:"SKU-A",start:at("08:00"),end:at("12:00"),standardId:"A-v1",unit:"each",currency:"USD",revenuePerGood:"1",requiredCostCategories:"material|other",timeComplete:"true",outputComplete:"true",laborComplete:"true",costComplete:"true",goodBasis:"first-pass"},
 {id:"RUN-B",lineId:"LINE-2",sku:"SKU-B",start:at("08:00"),end:at("12:00"),standardId:"B-v1",unit:"each",currency:"USD",revenuePerGood:"1",requiredCostCategories:"material|other",timeComplete:"true",outputComplete:"true",laborComplete:"true",costComplete:"true",goodBasis:"first-pass"}];
 const standards=["A","B"].map(x=>({id:x+"-v1",sku:"SKU-"+x,unit:"each",effectiveFrom:"2026-10-01T00:00:00Z",effectiveTo:"",idealCycleSeconds:"10",standardCycleSeconds:"12",standardCrew:x==="A"?"2":"1.5"}));
 const stops=[
 {id:"A-break",runId:"RUN-A",start:at("10:00"),end:at("10:15"),kind:"excluded",reason:"Owner-declared unpaid production break"},
 {id:"A-stop1",runId:"RUN-A",start:at("09:00"),end:at("09:30"),kind:"stop",reason:"Material wait"},
 {id:"A-stop2",runId:"RUN-A",start:at("09:20"),end:at("09:50"),kind:"stop",reason:"Maintenance record overlapping same wait"},
 {id:"B-break",runId:"RUN-B",start:at("08:30"),end:at("08:45"),kind:"excluded",reason:"Owner-declared no-production break"},
 {id:"B-stop",runId:"RUN-B",start:at("09:00"),end:at("09:20"),kind:"stop",reason:"Changeover; remains stop time"}];
 const labor=[
 {id:"A-W1",runId:"RUN-A",workerId:"W1",start:at("08:00"),end:at("12:00"),allocation:"1",hourlyRate:"25",currency:"USD"},
 {id:"A-W2",runId:"RUN-A",workerId:"W2",start:at("08:00"),end:at("12:00"),allocation:"1",hourlyRate:"25",currency:"USD"},
 {id:"B-W3",runId:"RUN-B",workerId:"W3",start:at("08:00"),end:at("12:00"),allocation:"1",hourlyRate:"25",currency:"USD"},
 {id:"B-W4",runId:"RUN-B",workerId:"W4",start:at("08:00"),end:at("12:00"),allocation:"0.5",hourlyRate:"30",currency:"USD"}];
 const output=[
 {id:"A-count1",runId:"RUN-A",at:at("10:00"),mode:"delta",counterId:"",total:"400",good:"380",reset:"false",resetTotal:"",resetGood:""},
 {id:"A-count2",runId:"RUN-A",at:at("12:00"),mode:"delta",counterId:"",total:"500",good:"475",reset:"false",resetTotal:"",resetGood:""},
 {id:"B-baseline",runId:"RUN-B",at:at("08:00"),mode:"counter",counterId:"B-counter",total:"100",good:"95",reset:"false",resetTotal:"",resetGood:""},
 {id:"B-mid",runId:"RUN-B",at:at("10:00"),mode:"counter",counterId:"B-counter",total:"600",good:"570",reset:"false",resetTotal:"",resetGood:""},
 {id:"B-close-reset",runId:"RUN-B",at:at("12:00"),mode:"counter",counterId:"B-counter",total:"0",good:"0",reset:"true",resetTotal:"1100",resetGood:"1045"}];
 const charges=[
 {id:"A-material",runId:"RUN-A",category:"material",quantity:"900",quantityUnit:"each",unitCost:"0.2",amount:"180",currency:"USD",note:"Explicit consumption cost for all total output"},
 {id:"A-other",runId:"RUN-A",category:"other",quantity:"",quantityUnit:"",unitCost:"",amount:"20",currency:"USD",note:"Owner-declared remaining cost scope"},
 {id:"B-material",runId:"RUN-B",category:"material",quantity:"1000",quantityUnit:"each",unitCost:"0.2",amount:"200",currency:"USD",note:"Explicit consumption cost"},
 {id:"B-other",runId:"RUN-B",category:"other",quantity:"",quantityUnit:"",unitCost:"",amount:"20",currency:"USD",note:"Owner-declared remaining cost scope"}];
 const records={runs,standards,stops,labor,output,charges},sources=Object.fromEntries(Object.entries(records).map(([k,r])=>[k+".csv",csv(k,r)]));
 const staleLabor=JSON.parse(JSON.stringify(labor));staleLabor[3].workerId="W1";sources["received-labor.csv"]=csv("labor",staleLabor);
 const staleOutput=JSON.parse(JSON.stringify(output));staleOutput[4].reset="false";staleOutput[4].resetTotal="";staleOutput[4].resetGood="";sources["received-output.csv"]=csv("output",staleOutput);
 return {label:"Entirely authored demonstration, not customer production data",records,sources};
}
export function buildExample(runtime){
 const api=createProductionAPI(runtime),originals=exampleSources();let workspace=api.createWorkspace({title:"Authored two-line production-run review",createdAt:"2026-10-15T00:00:00Z"}),n=0;
 const meta=()=>({operationId:"authored-"+(++n),expectedRoot:workspace.rootSha256,at:"2026-10-15T00:00:00Z"}),ids={};
 for(const [name,content]of Object.entries(originals.sources)){const x=api.addSource(workspace,{name,mediaType:"text/csv",content_base64:runtime.toBase64(runtime.encode(content))},meta());workspace=x.workspace;ids[name]=x.sourceId;}
 const input=blankInput();input.scope={siteId:"AUTHORED-SITE",label:originals.label,asOf:"2026-10-14T12:00:00Z",clock:{mode:"offset-required",fixedOffsetMinutes:null}};
 for(const kind of Object.keys(TABLE_FIELDS))input.tables[kind].sourceId=ids[kind+".csv"];
 const received=JSON.parse(JSON.stringify(input));received.tables.labor.sourceId=ids["received-labor.csv"];received.tables.output.sourceId=ids["received-output.csv"];
 const old=api.saveEdition(workspace,{name:"Received authored records: unresolved worker overlap and counter reset",input:received,preparedBy:"Authored course",note:originals.label},meta());workspace=old.workspace;
 const corrected=api.saveEdition(workspace,{name:"Corrected authored originals",input,parentEditionId:old.editionId,preparedBy:"Authored course",note:"Separate worker W4 and explicit before-reset counter values; original received files remain."},meta());workspace=corrected.workspace;
 const proposal=api.propose(workspace,{name:"Two-line source correction review",baseEditionId:old.editionId,candidateEditionId:corrected.editionId,preparedBy:"Authored course",reason:"Resolve source mistakes before interpreting production performance."},meta());workspace=proposal.workspace;
 for(const discipline of ["OPERATIONS","FINANCE"])workspace=api.review(workspace,{proposalId:proposal.proposalId,comparisonSha256:proposal.proposal.comparisonSha256,discipline,decision:"approved",reviewer:"Authored "+discipline+" reviewer",note:"Illustrative review of the corrected source; no real production or accounting approval."},meta());
 return {workspace,input,receivedInput:received,receivedEditionId:old.editionId,correctedEditionId:corrected.editionId,proposalId:proposal.proposalId,originals,summary:{received:old.report.summary,corrected:corrected.report.summary,runs:corrected.report.runs,status:api.proposalStatus(workspace,proposal.proposalId)}};
}
