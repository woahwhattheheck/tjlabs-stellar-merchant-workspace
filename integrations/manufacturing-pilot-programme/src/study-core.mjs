function createManufacturingStudyCore(sha256) {
"use strict";
const clone=v=>JSON.parse(JSON.stringify(v));
const check=(ok,message)=>{if(!ok)throw Error(message);};
const required={
 recordings:["clip_id","source_reference","source_sha256","timebase_unit","duration_seconds","permission_owner","recorded_on"],
 cycles:["cycle_id","clip_id","study_id","product_revision","station","start_seconds","end_seconds","included","exclusion_reason","quality_record","reviewer"],
 elements:["element_id","cycle_id","track_id","kind","start_seconds","end_seconds","description","reviewer"],
 effort:["effort_id","comparison_id","method","tool_version","clip_id","cycle_ids","reviewer","started_at","ended_at","phase","notes"]
};
function csvRows(text){
 check(typeof text==="string","CSV content must be text");
 const s=text.charCodeAt(0)===0xfeff?text.slice(1):text,rows=[];let row=[],field="",quoted=false,closed=false;
 for(let i=0;i<s.length;i++){const c=s[i];
  if(quoted){if(c==='"'){if(s[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c==='"'){check(field===""&&!closed,"Unexpected quote in CSV");quoted=true;continue;}
  if(c===","||c==="\n"||c==="\r"){row.push(field);field="";closed=false;if(c!==","){if(c==="\r"&&s[i+1]==="\n")i++;if(row.some(v=>v!==""))rows.push(row);row=[];}continue;}
  check(!closed,"Text after closing CSV quote");field+=c;
 }
 check(!quoted,"Unclosed CSV quote");
 if(field!==""||row.length||closed){row.push(field);if(row.some(v=>v!==""))rows.push(row);}
 return rows;
}
function parse(content,kind){
 const rows=csvRows(content);check(rows.length>0,"Missing "+kind+" CSV header");const headers=rows.shift();
 check(new Set(headers).size===headers.length,"Duplicate "+kind+" CSV header");
 for(const field of required[kind])check(headers.includes(field),"Missing "+kind+" field "+field);
 return rows.map((row,i)=>{check(row.length===headers.length,kind+" row "+(i+2)+" has wrong field count");return Object.fromEntries(headers.map((h,j)=>[h,row[j]]));});
}
function number(value,label){check(typeof value==="string"&&/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value),label+" needs non-negative seconds");const n=Number(value);check(Number.isFinite(n)&&n<=Number.MAX_SAFE_INTEGER,label+" is outside supported seconds");return n;}
function unique(rows,key,kind){const map=new Map();for(const r of rows){check(r[key].trim(),kind+" needs "+key);check(!map.has(r[key]),"Duplicate "+kind+" ID "+r[key]);map.set(r[key],r);}return map;}
function union(intervals){
 const sorted=intervals.map(x=>[x[0],x[1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),out=[];
 for(const item of sorted){const last=out.at(-1);if(last&&item[0]<=last[1])last[1]=Math.max(last[1],item[1]);else out.push(item);}return out;
}
function duration(intervals){return union(intervals).reduce((n,[a,b])=>n+b-a,0);}
function intersect(a,b){let i=0,j=0,total=0;const x=union(a),y=union(b);while(i<x.length&&j<y.length){total+=Math.max(0,Math.min(x[i][1],y[j][1])-Math.max(x[i][0],y[j][0]));if(x[i][1]<y[j][1])i++;else j++;}return total;}
const round=n=>Math.round(n*1000000)/1000000;
function stamp(v,label){check(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v),label+" needs a timestamp with UTC offset");const n=Date.parse(v);check(Number.isFinite(n),label+" is invalid");const date=v.slice(0,10);check(new Date(date+"T00:00:00Z").toISOString().slice(0,10)===date,label+" has an invalid calendar date");return n/1000;}
function median(values){const a=[...values].sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;}
function compile(input){
 check(input?.schema==="tjlabs.manufacturing-study-input.v1"&&typeof input.study_label==="string"&&input.originals,"Complete manufacturing study input required");
 check(typeof sha256==="function","A SHA-256 implementation is required");
 const originals={},tables={};
 for(const kind of Object.keys(required)){const file=input.originals[kind];check(file&&typeof file.filename==="string"&&typeof file.content==="string","Original "+kind+" file required");originals[kind]={...clone(file),sha256:sha256(file.content)};tables[kind]=parse(file.content,kind);}
 const clips=unique(tables.recordings,"clip_id","recording"),cycles=unique(tables.cycles,"cycle_id","cycle"),elements=unique(tables.elements,"element_id","element");unique(tables.effort,"effort_id","effort");
 for(const r of clips.values()){check(r.source_reference.trim()&&r.permission_owner.trim(),"Recording requires its original reference and permission owner");check(r.timebase_unit==="seconds","Recording timebase must explicitly be seconds");r.duration=number(r.duration_seconds,"Recording duration");check(r.duration>0,"Recording duration must be positive");check(!r.source_sha256||/^[a-fA-F0-9]{64}$/.test(r.source_sha256),"Recording source hash must be SHA-256 when supplied");}
 for(const c of cycles.values()){
  check(clips.has(c.clip_id),"Cycle references an unknown recording");check(c.study_id.trim()&&c.product_revision.trim()&&c.station.trim()&&c.reviewer.trim(),"Cycle needs study, revision, station and reviewer");
  c.start=number(c.start_seconds,"Cycle start");c.end=number(c.end_seconds,"Cycle end");check(c.start<c.end&&c.end<=clips.get(c.clip_id).duration,"Cycle is outside its complete recording");
  check(["yes","no"].includes(c.included),"Cycle included must be yes or no");check(c.included!=="no"||c.exclusion_reason.trim(),"Excluded cycle needs its reason");
 }
 const byCycle=new Map([...cycles.keys()].map(k=>[k,[]]));
 for(const e of elements.values()){
  check(cycles.has(e.cycle_id),"Element references an unknown cycle");check(e.track_id.trim()&&e.reviewer.trim()&&e.description.trim(),"Element needs track, description and reviewer");check(["manual","machine","wait"].includes(e.kind),"Element kind must be manual, machine or wait");
  e.start=number(e.start_seconds,"Element start");e.end=number(e.end_seconds,"Element end");const c=cycles.get(e.cycle_id);
  check(e.start<e.end&&e.start>=c.start&&e.end<=c.end,"Element is outside its selected cycle");byCycle.get(e.cycle_id).push(e);
 }
 const cycleReports=[];
 for(const c of cycles.values()){
  const rows=byCycle.get(c.cycle_id),ranges=kind=>rows.filter(e=>e.kind===kind).map(e=>[e.start,e.end]),manual=ranges("manual"),machine=ranges("machine"),wait=ranges("wait"),all=rows.map(e=>[e.start,e.end]),tracks=[];
  for(const id of new Set(rows.map(e=>e.track_id))){const r=rows.filter(e=>e.track_id===id);check(new Set(r.map(e=>e.kind)).size===1,"One track cannot mix manual/machine/wait kinds within a cycle");tracks.push({track_id:id,kind:r[0].kind,seconds:round(duration(r.map(e=>[e.start,e.end]))),element_ids:r.map(e=>e.element_id)});}
  cycleReports.push({cycle_id:c.cycle_id,clip_id:c.clip_id,study_id:c.study_id,product_revision:c.product_revision,station:c.station,included:c.included==="yes",exclusion_reason:c.exclusion_reason,quality_record:c.quality_record,reviewer:c.reviewer,start_seconds:c.start,end_seconds:c.end,elapsed_seconds:round(c.end-c.start),manual_span_seconds:round(duration(manual)),machine_span_seconds:round(duration(machine)),wait_span_seconds:round(duration(wait)),manual_machine_overlap_seconds:round(intersect(manual,machine)),observed_span_seconds:round(duration(all)),unlabelled_span_seconds:round((c.end-c.start)-duration(all)),manual_track_seconds:round(tracks.filter(t=>t.kind==="manual").reduce((n,t)=>n+t.seconds,0)),tracks,element_ids:rows.map(e=>e.element_id)});
 }
 const groups=[];
 for(const key of new Set(cycleReports.map(c=>JSON.stringify([c.study_id,c.product_revision,c.station])))){
  const selected=cycleReports.filter(c=>JSON.stringify([c.study_id,c.product_revision,c.station])===key),included=selected.filter(c=>c.included),elapsed=included.map(c=>c.elapsed_seconds),identity=JSON.parse(key);
  groups.push({study_id:identity[0],product_revision:identity[1],station:identity[2],included_cycle_ids:included.map(c=>c.cycle_id),excluded_cycle_ids:selected.filter(c=>!c.included).map(c=>c.cycle_id),count:included.length,elapsed_seconds:elapsed.length?{minimum:Math.min(...elapsed),median:round(median(elapsed)),maximum:Math.max(...elapsed)}:null});
 }
 const efforts=[];
 for(const e of tables.effort){
  check(e.comparison_id.trim()&&["current","studio"].includes(e.method)&&e.tool_version.trim()&&e.reviewer.trim(),"Effort needs comparison, current/studio method and recorder");check(["prepare","label","review","export"].includes(e.phase),"Unknown effort phase");check(clips.has(e.clip_id),"Effort references unknown recording");
  const ids=e.cycle_ids.split("|").filter(Boolean);check(ids.length&&new Set(ids).size===ids.length,"Effort needs unique selected cycle IDs");for(const id of ids)check(cycles.has(id)&&cycles.get(id).clip_id===e.clip_id,"Effort cycle/recording selection differs");
  const selected=ids.map(id=>cycles.get(id));check(new Set(selected.map(c=>JSON.stringify([c.study_id,c.product_revision,c.station]))).size===1,"Effort selection mixes study, product revision or station");
  const start=stamp(e.started_at,"Effort start"),end=stamp(e.ended_at,"Effort end");check(start<end,"Effort end must follow start");efforts.push({...e,cycle_ids:ids.sort(),start,end,seconds:round(end-start)});
 }
 // A recorder cannot spend the same clock interval on two counted efforts.
 const people=new Map();for(const e of efforts){if(!people.has(e.reviewer))people.set(e.reviewer,[]);people.get(e.reviewer).push(e);}
 for(const rows of people.values()){const ordered=[...rows].sort((a,b)=>a.start-b.start);for(let i=1;i<ordered.length;i++)check(ordered[i].start>=ordered[i-1].end,"Overlapping analyst effort intervals for "+ordered[i].reviewer);}
 const comparisons=[];
 for(const id of new Set(efforts.map(e=>e.comparison_id))){
  const rows=efforts.filter(e=>e.comparison_id===id),scope=new Set(rows.map(e=>JSON.stringify([e.clip_id,e.cycle_ids])));check(scope.size===1,"Paired effort comparison must use exactly the same recording and cycles");
  const methods={};for(const method of ["current","studio"]){const r=rows.filter(e=>e.method===method);check(new Set(r.map(e=>e.tool_version)).size<=1,"A comparison method cannot mix tool versions");methods[method]={tool_versions:[...new Set(r.map(e=>e.tool_version))],phases:[...new Set(r.map(e=>e.phase))].sort(),effort_ids:r.map(e=>e.effort_id),recorders:[...new Set(r.map(e=>e.reviewer))].sort(),active_person_seconds:round(r.reduce((n,e)=>n+e.seconds,0)),phase_seconds:Object.fromEntries(["prepare","label","review","export"].map(p=>[p,round(r.filter(e=>e.phase===p).reduce((n,e)=>n+e.seconds,0))]))};}
  const phaseMatch=JSON.stringify(methods.current.phases)===JSON.stringify(methods.studio.phases),complete=methods.current.effort_ids.length>0&&methods.studio.effort_ids.length>0&&phaseMatch;
  comparisons.push({comparison_id:id,clip_id:rows[0].clip_id,cycle_ids:rows[0].cycle_ids,status:complete?"paired observations":"matching method and phase observations needed",phase_sets_match:phaseMatch,methods,studio_minus_current_person_seconds:complete?round(methods.studio.active_person_seconds-methods.current.active_person_seconds):null,recorder_sets_match:JSON.stringify(methods.current.recorders)===JSON.stringify(methods.studio.recorders),interpretation:"Actual recorded active analyst effort for the selected scope; the plant reviewer assesses method, reviewer, learning and quality differences."});
 }
 return {schema:"tjlabs.manufacturing-study-result.v1",study_label:input.study_label,originals,tables,cycle_reports:cycleReports,groups,effort_comparisons:comparisons,definitions:{elapsed:"Explicit cycle end minus start on the original recording timebase.",spans:"Union of intervals of each kind; concurrent manual and machine spans overlap.",manual_track:"Sum of within-track manual interval unions, distinct from elapsed time.",coverage:"Union of all labelled intervals; unlabelled span remains visible.",effort:"Sum of non-overlapping actual active intervals per recorder. Different people's concurrent work contributes separately.",aggregation:"Only included cycles within the same study, product revision and station form one group. Original excluded cycles remain."}};
}
const escape=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function csv(records,fields){const cell=v=>{let s=String(v??"");if(/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};return [fields,...records.map(r=>fields.map(k=>r[k]))].map(r=>r.map(cell).join(",")).join("\r\n")+"\r\n";}
function report(result){
 const fields=["cycle_id","product_revision","station","included","elapsed_seconds","manual_span_seconds","machine_span_seconds","manual_machine_overlap_seconds","unlabelled_span_seconds"];
 const table="<div class='table-wrap'><table><thead><tr>"+fields.map(x=>"<th>"+escape(x.replaceAll("_"," "))+"</th>").join("")+"</tr></thead><tbody>"+result.cycle_reports.map(r=>"<tr>"+fields.map(k=>"<td>"+escape(r[k])+"</td>").join("")+"</tr>").join("")+"</tbody></table></div>";
 const detailed=result.cycle_reports.map(c=>"<section><h2>Cycle "+escape(c.cycle_id)+"</h2><p>Recording "+escape(c.clip_id)+" · "+c.start_seconds+"–"+c.end_seconds+" seconds · reviewer "+escape(c.reviewer)+". "+(c.included?"Included in its declared process group.":"Excluded: "+escape(c.exclusion_reason))+"</p><p>Quality record: "+escape(c.quality_record||"not entered")+"</p><ul>"+result.tables.elements.filter(e=>e.cycle_id===c.cycle_id).map(e=>"<li>"+escape(e.element_id)+" · "+escape(e.track_id)+" / "+escape(e.kind)+" · "+escape(e.start_seconds)+"–"+escape(e.end_seconds)+" seconds · "+escape(e.description)+" · "+escape(e.reviewer)+"</li>").join("")+"</ul></section>").join("");
 const comparisons=result.effort_comparisons.map(c=>"<section><h2>"+escape(c.comparison_id)+"</h2><p>"+escape(c.status)+" · recording "+escape(c.clip_id)+" · cycles "+escape(c.cycle_ids.join(", "))+"</p><p>Current method: "+(c.methods.current.effort_ids.length?c.methods.current.active_person_seconds:"not recorded")+" active person-seconds. Studio: "+(c.methods.studio.effort_ids.length?c.methods.studio.active_person_seconds:"not recorded")+". Studio minus current: "+(c.studio_minus_current_person_seconds===null?"awaiting comparable observations":escape(c.studio_minus_current_person_seconds)+" seconds")+".</p><p>"+escape(c.interpretation)+(c.recorder_sets_match?"":" Recorder sets differ; review that difference before interpreting the comparison.")+"</p></section>").join("");
 return "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+escape(result.study_label)+"</title><style>body{font:16px/1.5 system-ui,sans-serif;color:#202020;background:#fff;max-width:1200px;margin:32px auto;padding:0 20px}h1{font-size:28px}h2{font-size:20px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:9px;text-align:left}th{background:#eee}section{border-top:1px solid #bbb;margin-top:22px;padding-top:10px}li{margin:7px 0}a{color:inherit;overflow-wrap:anywhere}@media print{body{font-size:10pt;margin:0}.table-wrap{overflow:visible}}</style></head><body><h1>"+escape(result.study_label)+"</h1><p>"+result.cycle_reports.length+" recorded cycles · "+result.groups.length+" separate process groups · "+result.effort_comparisons.length+" analyst comparisons</p>"+(result.cycle_reports.length?table:"<p>No production observations have been entered. Fill the original tables with an agreed study's recorded intervals.</p>")+comparisons+detailed+"<h2>How to read the measurements</h2><ul>"+Object.entries(result.definitions).map(([k,v])=>"<li><strong>"+escape(k)+":</strong> "+escape(v)+"</li>").join("")+"</ul><h2>Original input files</h2><ul>"+Object.entries(result.originals).map(([k,v])=>"<li>"+escape(v.filename)+" · SHA-256 "+escape(v.sha256)+"</li>").join("")+"</ul></body></html>";
}
function template(label="Manufacturer station study"){return{schema:"tjlabs.manufacturing-study-input.v1",study_label:label,originals:Object.fromEntries(Object.entries(required).map(([kind,headers])=>[kind,{filename:kind+".csv",content:csv([],headers)}]))};}
return {compile,report,template,csv,headers:clone(required)};
}

export { createManufacturingStudyCore };
