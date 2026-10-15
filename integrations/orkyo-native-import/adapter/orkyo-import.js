function createOrkyoImportAdapter(){
"use strict";
const VERSION="orkyo-import-adapter.v1";
const SOURCE_COMMIT="9b773566ecbfb0947f51f6e20ea925c03ddb2a22";
const REQUEST_HEADERS=["id","name","description","status","start_ts","end_ts","resource_id","resource_name","earliest_start_ts","latest_end_ts","min_duration_value","min_duration_unit","actual_duration_value","actual_duration_unit","requirements_count"];
const RESOURCE_COLUMNS=["id","resource_type_key","name","description","external_reference","allocation_mode","base_availability_percent","is_active","home_site_id","cross_site_allowed","email","notes","code","is_physical","capacity","geometry_type","coordinates","properties","group_id","linked_user_id"];
const STATUS=["new","in_progress","done","cancelled","deferred"];
const UNITS=["years","months","weeks","days","hours","minutes"];
const clone=x=>JSON.parse(JSON.stringify(x));
const scalar=v=>typeof v==="string"?v:typeof v==="number"||typeof v==="boolean"?String(v):"";
const issue=(code,message,blocking=true)=>({code,message,blocking});
function parseCSV(text){
 if(typeof text!=="string")throw Error("CSV text required");
 const records=[];let row=[],field="",quoted=false,closed=false;let line=1,startLine=1;
 const fieldEnd=()=>{row.push(field);field="";closed=false};
 const rowEnd=()=>{fieldEnd();if(row.some(x=>x.trim()))records.push({cells:row,line:startLine});row=[];startLine=line+1};
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){
   if(ch==='"'&&text[i+1]==='"'){field+='"';i++}
   else if(ch==='"'){quoted=false;closed=true}
   else {field+=ch;if(ch==="\n")line++}
  }else if(ch==='"'){
   if(field||closed)throw Error("Unexpected quote on CSV line "+line);
   quoted=true;
  }else if(ch===","){fieldEnd()}
  else if(ch==="\n"||ch==="\r"){
   if(ch==="\r"&&text[i+1]==="\n")i++;
   rowEnd();line++;
  }else{
   if(closed)throw Error("Text after quoted field on CSV line "+line);
   field+=ch;
  }
 }
 if(quoted)throw Error("Unclosed quoted CSV field");
 fieldEnd();if(row.some(x=>x.trim()))records.push({cells:row,line:startLine});
 if(!records.length)return {headers:[],rows:[]};
 const headers=records[0].cells;
 if(headers.some(x=>!x)||new Set(headers).size!==headers.length)throw Error("Nonempty unique CSV headers required");
 const rows=records.slice(1).map((r,index)=>{
  if(r.cells.length!==headers.length)throw Error("CSV line "+r.line+" has "+r.cells.length+" cells; expected "+headers.length);
  const raw=Object.fromEntries(headers.map((h,i)=>[h,r.cells[i]]));
  const values=Object.fromEntries(headers.map((h,i)=>[h,/^'[=+\-@\t\r]/.test(r.cells[i])?r.cells[i].slice(1):r.cells[i]]));
  return {index:index+1,line:r.line,raw,values};
 });
 return {headers:headers.slice(),rows};
}
function csvCell(value){
 if(value===null||value===undefined)return "";
 let s=typeof value==="object"?JSON.stringify(value):String(value);
 if(typeof value==="string"&&/^'[=+\-@\t\r]/.test(s))throw Error("The native CSV importer would strip this literal leading apostrophe; preserve it through a reviewed correction or a resource JSON import");
 if(typeof value==="string"&&/^[=+\-@\t\r]/.test(s))s="'"+s;
 return /[,"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function encodeCSV(rows,headers){
 if(!Array.isArray(rows))throw Error("Rows required");
 const keys=headers||[...new Set(rows.flatMap(x=>Object.keys(x)))];
 if(keys.some(x=>typeof x!=="string"||!x)||new Set(keys).size!==keys.length)throw Error("Unique headers required");
 return [keys.map(csvCell).join(","),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(","))].join("\n")+"\n";
}
function timestampIssues(row,keys,issues){
 for(const k of keys){if(!row[k])continue;const s=scalar(row[k]);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,7})?)?(?:Z|[+-]\d\d:\d\d)$/.test(s)||!Number.isFinite(Date.parse(s)))issues.push(issue("timestamp:"+k,k+" needs an explicit ISO timestamp with timezone"))}
 for(const [a,b] of [["start_ts","end_ts"],["earliest_start_ts","latest_end_ts"]])if(row[a]&&row[b]&&Date.parse(row[b])<=Date.parse(row[a]))issues.push(issue("window:"+a,"End must follow start for "+a));
}
function requestPreview(row){
 const issues=[];
 if(!row.name)return {nativePayload:null,issues:[issue("skipped-name","Native importer skips this record because name is empty")],nativeDisposition:"skipped"};
 const durationValue=parseInt(scalar(row.min_duration_value));
 const durationUnit=UNITS.find(u=>u===row.min_duration_unit);
 const actualValue=parseInt(scalar(row.actual_duration_value));
 const actualUnit=UNITS.find(u=>u===row.actual_duration_unit);
 const nativePayload={
 name:row.name,description:row.description||undefined,status:STATUS.find(s=>s===row.status),
 startTs:row.start_ts||undefined,endTs:row.end_ts||undefined,
 earliestStartTs:row.earliest_start_ts||undefined,latestEndTs:row.latest_end_ts||undefined,
 minimalDurationValue:Number.isFinite(durationValue)&&durationValue>0?durationValue:1,
 minimalDurationUnit:durationUnit||"hours",
 actualDurationValue:Number.isFinite(actualValue)&&actualValue>0&&actualUnit?actualValue:undefined,
 actualDurationUnit:Number.isFinite(actualValue)&&actualValue>0&&actualUnit?actualUnit:undefined,
 resourceIds:row.resource_id?[row.resource_id]:undefined};
 if(scalar(row.name).length>200)issues.push(issue("name-length","Request name exceeds the current 200-character limit"));
 if(!scalar(row.name).trim())issues.push(issue("blank-name","A whitespace-only name reaches native creation; supply a real name"));
 if(row.id)issues.push(issue("id-ignored","Import ignores id and creates a new request",false));
 if(!/^[1-9]\d*$/.test(scalar(row.min_duration_value))||!Number.isSafeInteger(durationValue))issues.push(issue("duration-coercion","Native import truncates or defaults minimal duration; use a positive whole number in the declared unit"));
 if(!durationUnit)issues.push(issue("duration-unit","Native import defaults the missing or unknown duration unit to hours"));
 if(row.status&&!STATUS.includes(row.status))issues.push(issue("status-ignored","Native import omits an unknown status"));
 if(row.actual_duration_value||row.actual_duration_unit){
  if(!/^[1-9]\d*$/.test(scalar(row.actual_duration_value))||!Number.isSafeInteger(actualValue)||!actualUnit)issues.push(issue("actual-duration-coercion","Actual duration would be truncated or discarded; resolve the number and unit"));
 }
 if(Number(row.requirements_count)>0)issues.push(issue("requirements-not-imported","The exported requirements count carries no requirement definitions; restore through the actual authorized workflow"));
 if(row.resource_name&&!row.resource_id)issues.push(issue("resource-name-unresolved","Native import uses resource_id, not resource_name"));
 timestampIssues(row,["start_ts","end_ts","earliest_start_ts","latest_end_ts"],issues);
 const unmapped=Object.keys(row).filter(k=>!REQUEST_HEADERS.includes(k)&&scalar(row[k])!=="");
 if(unmapped.length)issues.push(issue("unmapped-columns","Columns are retained here but not imported: "+unmapped.join(", ")));
 issues.push(issue("structural-scope","Per-page request CSV does not restore site, hierarchy, dependencies or requirement definitions",false));
 return {nativePayload:clone(nativePayload),issues,nativeDisposition:"create"};
}
function resourcePreview(row,typeKey,customFieldTypes){
 const issues=[];const cell=scalar;
 if(!cell(row.name).trim())return {nativePayload:null,issues:[issue("skipped-name","Native importer skips this record because name is empty")],nativeDisposition:"skipped"};
 if(!typeKey)issues.push(issue("type-required","Choose the actual resource type from the receiving workspace"));
 const request={resourceTypeKey:typeKey,name:cell(row.name).trim(),allocationMode:cell(row.allocation_mode)||"exclusive"};
 if(!["Exclusive","Fractional"].includes(request.allocationMode))issues.push(issue("allocation-mode","Current backend accepts exact Exclusive or Fractional; the importer default lowercase exclusive does not satisfy that contract"));
 if(request.name.length>200)issues.push(issue("name-length","Resource name exceeds the current 200-character limit"));
 const customFields={};
 for(const [key,value] of Object.entries(row)){
  if(!key.startsWith("meta.")||value===""||value==null)continue;
  const f=key.slice(5),t=customFieldTypes[f];
  if(typeof value==="number"||typeof value==="boolean")customFields[f]=value;
  else if(typeof value==="string"){
   const n=Number(value);
   customFields[f]=t==="number"&&value.trim()!==""&&Number.isFinite(n)?n:t==="boolean"&&value==="true"?true:t==="boolean"&&value==="false"?false:value;
  }else issues.push(issue("meta-nonscalar:"+f,"Native import ignores non-scalar custom field "+f));
  if(!t)issues.push(issue("meta-definition:"+f,"Receiving field definition is required for "+f));
  else if(Object.hasOwn(customFields,f)&&((t==="number"&&typeof customFields[f]!=="number")||(t==="boolean"&&typeof customFields[f]!=="boolean")))issues.push(issue("meta-type:"+f,"Native payload does not match "+t+" field "+f));
  if(t==="list_lookup")issues.push(issue("lookup:"+f,"Confirm the receiving list row ID for "+f+"; a name is not an ID"));
 }
 const pairs=[["description","description"],["external_reference","externalReference"],["home_site_id","homeSiteId"],["email","email"],["notes","notes"],["code","code"]];
 for(const [key,to] of pairs)if(cell(row[key]))request[to]=cell(row[key]);
 for(const [key,to] of [["base_availability_percent","baseAvailabilityPercent"],["capacity","capacity"]])if(cell(row[key])){
  request[to]=Number(cell(row[key]));
  if(!Number.isFinite(request[to]))issues.push(issue("number:"+key,key+" would become a non-finite native number"));
  else if(!Number.isInteger(request[to])||request[to]<0||(key==="capacity"&&request[to]<1)||(key==="base_availability_percent"&&request[to]>100))issues.push(issue("range:"+key,"Resolve the native integer range for "+key));
 }
 for(const [key,to] of [["cross_site_allowed","crossSiteAllowed"],["is_physical","isPhysical"]])if(cell(row[key])){
  request[to]=cell(row[key])==="true";
  if(!["true","false"].includes(cell(row[key])))issues.push(issue("boolean:"+key,"Only exact true/false preserves the intended native value for "+key));
 }
 for(const k of ["coordinates","properties"])if(cell(row[k])){
  try{const p=JSON.parse(cell(row[k]));if(k==="coordinates")request.geometry={type:cell(row.geometry_type),coordinates:p};else request.properties=p}
  catch{issues.push(issue("json:"+k,"Native import omits malformed "+k+"; correct the source cell"))}
 }
 if(request.isPhysical&&!request.geometry)issues.push(issue("physical-geometry","Physical resource has no parsed geometry; review its actual receiving type and geometry requirement"));
 if(Object.keys(customFields).length)request.customFields=customFields;
 if(row.id)issues.push(issue("id-ignored","Import ignores id and creates a new resource",false));
 for(const k of ["is_active","group_id","linked_user_id"])if(row[k]!==undefined&&row[k]!=="")issues.push(issue("unmapped:"+k,k+" is retained but not restored by the generic create import",false));
 if(row.resource_type_key&&row.resource_type_key!==typeKey)issues.push(issue("type-mismatch","File resource_type_key differs from the selected receiving type"));
 const unknown=Object.keys(row).filter(k=>!RESOURCE_COLUMNS.includes(k)&&!k.startsWith("meta.")&&scalar(row[k])!=="");
 if(unknown.length)issues.push(issue("unmapped-columns","Retained columns need an explicit receiving workflow: "+unknown.join(", ")));
 // Preserve NaN in review output as explicit text; never serialize it into a proposed payload.
 const nativePayload=Object.values(request).some(x=>typeof x==="number"&&!Number.isFinite(x))?null:clone(request);
 return {nativePayload,issues,nativeDisposition:"create"};
}
function inspect({kind,format="csv",sourceId,text,typeKey="",customFieldTypes={}}){
 if(!["requests","resources"].includes(kind))throw Error("Choose requests or resources");
 if(typeof sourceId!=="string"||!sourceId)throw Error("Original source ID required");
 if(typeof text!=="string")throw Error("Full original text required");
 if(kind==="requests"&&format!=="csv")throw Error("Native per-page requests accept CSV only");
 if(!["csv","json"].includes(format))throw Error("Choose CSV or JSON");
 let input;
 if(format==="csv")input=parseCSV(text);
 else{
  const p=JSON.parse(text);const data=Array.isArray(p)?p:p.data;
  if(!Array.isArray(data)||data.some(x=>!x||typeof x!=="object"||Array.isArray(x)))throw Error("Native resource JSON requires rows or an object with a data array");
  input={headers:[...new Set(data.flatMap(x=>Object.keys(x)))],rows:data.map((x,i)=>({index:i+1,line:null,raw:clone(x),values:clone(x)}))};
 }
 const rows=input.rows.map(r=>{
  const out=kind==="requests"?requestPreview(r.values):resourcePreview(r.values,typeKey,customFieldTypes);
  return {occurrenceId:sourceId+":row:"+r.index,index:r.index,line:r.line,original:clone(r.raw),values:clone(r.values),...out};
 });
 return {schema:VERSION,sourceCommit:SOURCE_COMMIT,source:{id:sourceId,kind,format,text},typeKey,customFieldTypes:clone(customFieldTypes),headers:input.headers,rows,summary:{records:rows.length,creates:rows.filter(x=>x.nativeDisposition==="create").length,skipped:rows.filter(x=>x.nativeDisposition==="skipped").length,needsReview:rows.filter(x=>x.issues.some(i=>i.blocking)).length},notes:["This is a local import preview. The target service validates and creates records when its authorized operator imports.","Complete originals, row occurrences and unmapped fields remain in this result."]};
}
function exportResourceJSON(rows,typeKey,exportTimestamp){
 if(!typeKey||!exportTimestamp||!Number.isFinite(Date.parse(exportTimestamp)))throw Error("Actual type and explicit export timestamp required");
 return JSON.stringify({exportTimestamp,schemaVersion:"1.0.0",context:"resources:"+typeKey,data:clone(rows)},null,2)+"\n";
}
return {VERSION,SOURCE_COMMIT,REQUEST_HEADERS:REQUEST_HEADERS.slice(),RESOURCE_COLUMNS:RESOURCE_COLUMNS.slice(),parseCSV,encodeCSV,inspect,requestPreview,resourcePreview,exportResourceJSON};
}
