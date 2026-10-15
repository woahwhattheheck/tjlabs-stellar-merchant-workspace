/* MIT */
function createOrkyoWorkbookPlanner(native){
 const sourceCommit="9b773566ecbfb0947f51f6e20ea925c03ddb2a22",clone=x=>JSON.parse(JSON.stringify(x)),txt=x=>x==null?"":String(x).trim();
 const need=(v,m)=>{if(!v)throw Error(m);};
 const headers={Workstations:["Code","Workstation","What stands there","Capacity (h/day)","Notes"],Jobs:["Job","Description","Workstation code","Start","End","Hours/day"]};
 function normalize(sheets){need(Array.isArray(sheets),"Complete sheet array required");return sheets.map(s=>{need(typeof s.name==="string"&&Array.isArray(s.rows),"Sheet name and complete rows required");return {name:s.name,rows:Array.from(s.rows,r=>Array.from(r||[],v=>{if(v instanceof Date){need(Number.isFinite(v.getTime()),"Invalid date cell");return v.toISOString();}need(v==null||["string","boolean"].includes(typeof v)||(typeof v==="number"&&Number.isFinite(v)),"Cell must be finite scalar");return v??null;}))};});}
 function makeSheets({workstations=[],jobs=[]}={}){
 return [{name:"Workstations",rows:[["Orkyo production import"],["Codes match exactly, including letter case."],["Capacity hours/day is retained; native import does not map it."],[],headers.Workstations,...workstations.map(w=>[w.code??"",w.name??"",w.standsThere??"",w.capacityHoursPerDay??"",w.notes??""])]},
 {name:"Jobs",rows:[["Orkyo production import"],["End is inclusive; native request ends next midnight UTC."],["Duration counts Monday–Friday, with one-hour fallback."],[],headers.Jobs,...jobs.map(j=>[j.job??"",j.description??"",j.workstationCode??"",j.start??"",j.end??"",j.hoursPerDay??""])]}];}
 function jobKey(siteId,j){return JSON.stringify([siteId,j.job,j.description,j.workstationCode,j.start,j.end,j.hoursPerDay]);}
 function inspectSheets(input,context={}){
  const sheets=normalize(input),issues=[],issue=(code,message,sheet,row=0,blocking=false,detail={})=>issues.push({code,message,sheet,row,blocking,...detail}),seenSheets=new Set();
  for(const s of sheets){if(seenSheets.has(s.name))issue("duplicate-sheet","Native import reads only the first named sheet.",s.name,0,true);seenSheets.add(s.name);}
  const parsed=native.parseTemplateWorkbook(sheets);for(const e of parsed.errors)issue("native-parse-error",e.message,e.sheet,e.row,true);
  const siteId=txt(context.siteId),typeKey=txt(context.typeKey),existingResources=clone(context.existingResources||[]),priorJobCreates=clone(context.priorJobCreates||[]),existing=new Map();
  need(Array.isArray(existingResources)&&Array.isArray(priorJobCreates),"Existing resources and prior creates must be arrays.");
  if(!siteId)issue("missing-site","Select exact target site.","Workbook",0,true);if(!typeKey)issue("missing-type","Select an actual tenant type that supports placement.","Workbook",0,true);
  if(context.existingComplete!==true)issue("incomplete-existing-resources","Retrieve all active placeable resources for the selected site before matching codes.","Workbook",0,true);
  for(const r of existingResources){if(!r.code)continue;need(typeof r.code==="string"&&typeof r.id==="string"&&r.id,"Existing resource requires exact code and actual ID.");if(existing.has(r.code)&&existing.get(r.code)!==r.id)issue("ambiguous-existing-code","Multiple IDs share this exact code.","Workstations",0,true,{codeValue:r.code});existing.set(r.code,r.id);}
  const workstations=parsed.workstations.map(r=>{
   const original=sheets.find(s=>s.name==="Workstations").rows[r.row-1],id=existing.get(r.code);
   if(txt(original[3]))issue("capacity-not-mapped","Hours/day capacity is retained but is not imported as occupancy or calendar.","Workstations",r.row,false,{originalValue:original[3]});
   if(!id)issue("new-station-geometry-required","Pinned native workbook creation sends isPhysical true without geometry; the server requires geometry. Create this station first with its actual geometry, refresh the complete lookup, then reuse it in this workbook.","Workstations",r.row,true,{workstationCode:r.code});
   return {row:r.row,code:r.code,action:id?"reuse":"create",existingResourceId:id||null,original:clone(original),parsed:clone(r),payload:id?null:native.workstationToCreateSpace(r,siteId,typeKey)};
  }),seenJobs=new Map();
  const jobs=parsed.jobs.map(j=>{
   const original=sheets.find(s=>s.name==="Jobs").rows[j.row-1],key=jobKey(siteId,j),priorCreates=priorJobCreates.filter(x=>x.jobKey===key);
   if(seenJobs.has(key))issue("repeated-job","Native import creates every repeated job row.","Jobs",j.row,true,{earlierRow:seenJobs.get(key)});else seenJobs.set(key,j.row);
   if(priorCreates.length)issue("prior-created-job","This exact job has a recorded prior create. Reconcile that run and prepare a remaining-only workbook before re-importing.","Jobs",j.row,true,{priorCreates});
   for(const [field,raw,result]of [["start",original[3],j.start],["end",original[4],j.end]]){
    if(!result)issue("missing-"+field,"Native import leaves this request window empty.","Jobs",j.row,false,{field,originalValue:raw??null});
    if(typeof raw==="number"&&raw!==Math.round(raw))issue("rounded-excel-date","Native import rounds fractional Excel serial days.","Jobs",j.row,false,{field,originalValue:raw,normalizedDate:result});
    if(typeof raw==="string"&&raw&&result&&raw.trim()!==result)issue("converted-date","Native date parsing converts this cell to a UTC date.","Jobs",j.row,false,{field,originalValue:raw,normalizedDate:result});
   }
   if(typeof original[5]==="string"&&txt(original[5])&&j.hoursPerDay!==null&&Number(txt(original[5]))!==j.hoursPerDay)issue("partial-hour-number","Native parseFloat uses the numeric prefix and drops trailing text.","Jobs",j.row,false,{originalValue:original[5],nativeHoursPerDay:j.hoursPerDay});
   const workingDays=j.start&&j.end?native.weekdayCount(j.start,j.end):0,totalHours=j.hoursPerDay&&workingDays>0?j.hoursPerDay*workingDays:0,payload=native.jobToCreateRequest(j,existing,siteId),station=workstations.find(s=>s.code===j.workstationCode);
   if(!(totalHours>0))issue("one-hour-fallback","Hours and weekday count produce the native one-hour minimum.","Jobs",j.row,false,{workingDays,hoursPerDay:j.hoursPerDay});
   return {row:j.row,jobKey:key,original:clone(original),parsed:clone(j),workingDays,minimumHours:payload.minimalDurationValue,payload,resourceBinding:{code:j.workstationCode,action:station?.action||"unresolved",existingResourceId:existing.get(j.workstationCode)||null,resolveAfterWorkstationCreate:station?.action==="create"},priorCreates};
  });
  if(jobs.length)issue("site-calendar-not-applied","Native workbook duration counts Monday–Friday; review actual site shifts, holidays, shutdowns and overtime in the target calendar.","Jobs");
  if(workstations.some(w=>w.action==="reuse"))issue("reused-stations-not-updated","Existing stations are reused unchanged. Workbook names, notes and capacity do not update them.","Workstations");
  const rows=sheets.flatMap(s=>s.rows.map((cells,i)=>({sheet:s.name,row:i+1,cells:clone(cells),role:i<4?"instruction":i===4?"header":"data"})));
  return {schema:"tjlabs.orkyo-workbook-plan.v1",sourceCommit,sheets,rows,context:{siteId,typeKey,existingComplete:context.existingComplete===true,existingResources,priorJobCreates},nativeParsed:clone(parsed),workstations,jobs,issues,summary:{sourceRows:rows.length,workstations:workstations.length,createWorkstations:workstations.filter(w=>w.action==="create").length,reuseWorkstations:workstations.filter(w=>w.action==="reuse").length,createJobs:jobs.length,blocking:issues.filter(x=>x.blocking).length,review:issues.filter(x=>!x.blocking).length},execution:"Stations first, then every job, sequentially. Completed writes remain after a later failure. Record actual IDs and prepare only remaining jobs after reconciling that run."};
 }
 function remainingSheets(plan,{createdWorkstationCodes=[],createdJobKeys=[]}={}){
  need(plan?.schema==="tjlabs.orkyo-workbook-plan.v1","Complete workbook plan required");const completed=new Set(createdJobKeys),skip=new Set();
  for(const key of completed){const match=plan.jobs.filter(j=>j.jobKey===key);need(match.length===1,"Completed job key is missing or duplicated; reconcile rows individually.");skip.add(match[0].row);}
  const sheets=clone(plan.sheets),jobs=sheets.find(s=>s.name==="Jobs");jobs.rows=jobs.rows.filter((_,i)=>!skip.has(i+1));
  return {sheets,completed:{createdWorkstationCodes:clone(createdWorkstationCodes),createdJobKeys:[...completed]},removedJobRows:[...skip],instruction:"Retain workstation rows so native parsing can resolve job codes. Refresh the complete existing-station lookup before import."};
 }
 function xml(v){const s=String(v);need(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s),"Cell contains a non-XML control character; original remains unchanged.");return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");}
 function column(n){let s="";for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
 function xlsxEntries(input){
  const sheets=normalize(input),seen=new Set(),decl='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main",rel="http://schemas.openxmlformats.org/package/2006/relationships",office="http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  need(sheets.length>0,"Workbook needs a sheet.");for(const s of sheets){need(s.name.length>0&&s.name.length<=31&&!/[\\/?*[\]:]/.test(s.name)&&!seen.has(s.name.toLowerCase()),"Excel sheet names must be unique and valid.");seen.add(s.name.toLowerCase());need(s.rows.length<=1048576&&s.rows.every(r=>r.length<=16384),"Excel row/column limits exceeded.");}
  const entries=[
   {name:"[Content_Types].xml",content:decl+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+'</Types>'},
   {name:"_rels/.rels",content:decl+'<Relationships xmlns="'+rel+'"><Relationship Id="rId1" Type="'+office+'/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
   {name:"xl/workbook.xml",content:decl+'<workbook xmlns="'+ns+'" xmlns:r="'+office+'"><sheets>'+sheets.map((s,i)=>'<sheet name="'+xml(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets></workbook>'},
   {name:"xl/_rels/workbook.xml.rels",content:decl+'<Relationships xmlns="'+rel+'">'+sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+office+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join("")+'</Relationships>'}
  ];
  sheets.forEach((s,i)=>entries.push({name:"xl/worksheets/sheet"+(i+1)+".xml",content:decl+'<worksheet xmlns="'+ns+'"><sheetData>'+s.rows.map((row,r)=>'<row r="'+(r+1)+'">'+row.map((v,c)=>{if(v==null)return "";const ref=column(c)+(r+1);if(typeof v==="number")return '<c r="'+ref+'"><v>'+v+'</v></c>';if(typeof v==="boolean")return '<c r="'+ref+'" t="b"><v>'+(v?1:0)+'</v></c>';need(v.length<=32767,"Excel cell text exceeds 32767 characters.");return '<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>';}).join("")+'</row>').join("")+'</sheetData></worksheet>'}));
  return entries;
 }
 function buildXlsx(sheets,encodeZip,encode){need(typeof encodeZip==="function"&&typeof encode==="function","Complete ZIP writer and UTF-8 encoder required.");return new Uint8Array(encodeZip(Object.fromEntries(xlsxEntries(sheets).map(e=>[e.name,encode(e.content)]))));}
 return {sourceCommit,headers,makeSheets,inspectSheets,remainingSheets,jobKey,xlsxEntries,buildXlsx};
}
