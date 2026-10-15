// Source-preserving telemetry review. Read-only analysis; no controls or savings authority.
export const INPUT_SCHEMA="tjlabs.telemetry-input.v1";
export function blankInput(){return {schema:INPUT_SCHEMA,scope:{siteId:"",podId:"",clockId:"",timeFormat:"iso-offset",start:"",end:"",cadenceMs:60000},alignment:{method:"exact",toleranceMs:0},duplicatePolicy:"reject",points:[],streams:[]};}
export const FIELD_SPEC={
 scope:["siteId","podId","clockId","timeFormat","start","end","cadenceMs"],
 point:["id","label","quantity","unit","lower","upper"],
 stream:["id","sourceId","role","runId","format","arrayPointer","layout","timeField","timeFormat","clockId","pointField","valueField","unitField","pointAliases","columns","qualityField","acceptedQuality","model"],
 column:["pointId","field","unit","qualityField","acceptedQuality"],
 model:["id","version","calibrationStart","calibrationEnd","calibrationClockId","note"]
};
export function createTelemetryAPI(runtime){
 const {sha256,encode,decode,toBase64,fromBase64}=runtime;
 if([sha256,encode,decode,toBase64,fromBase64].some(f=>typeof f!=="function"))throw Error("Complete hashing/UTF8/Base64 runtime required");
 const SCHEMA="tjlabs.telemetry-workspace.v1",ENGINE="telemetry-review-1.0.0",clone=x=>JSON.parse(JSON.stringify(x)),need=(v,m)=>{if(!v)throw Error(m);};
 function canonical(x){if(x===null||typeof x!=="object"){need(x===null||["string","boolean","number"].includes(typeof x),"JSON values only");if(typeof x==="number")need(Number.isFinite(x),"Finite JSON numbers only");return JSON.stringify(x);}if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";}
 const hash=x=>sha256(typeof x==="string"?x:canonical(x)),unique=a=>[...new Set(a)];
 const trusted=new WeakSet(),inspectionCache=new WeakMap(),retainedSize=new WeakMap();
 function deepFreeze(x){if(x&&typeof x==="object"&&!Object.isFrozen(x)){for(const v of Object.values(x))deepFreeze(v);Object.freeze(x);}return x;}
 function trust(w){deepFreeze(w);trusted.add(w);return w;}
 function text(v,label){need(typeof v==="string"&&v.length>0&&v.length<=4096,label+" must be nonempty text");return v;}
 function int(v,label,min=0,max=Number.MAX_SAFE_INTEGER){need(Number.isSafeInteger(v)&&v>=min&&v<=max,label+" must be an integer in range");return v;}
 function gcd(a,b){a=a<0n?-a:a;b=b<0n?-b:b;while(b){const c=a%b;a=b;b=c;}return a||1n;}
 function Q(n,d=1n){need(d!==0n,"Zero denominator");if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};}
 const Z=Q(0n),ONE=Q(1n),add=(a,b)=>Q(a.n*b.d+b.n*a.d,a.d*b.d),sub=(a,b)=>Q(a.n*b.d-b.n*a.d,a.d*b.d),mul=(a,b)=>Q(a.n*b.n,a.d*b.d),div=(a,b)=>Q(a.n*b.d,a.d*b.n),abs=a=>Q(a.n<0n?-a.n:a.n,a.d),cmp=(a,b)=>a.n*b.d<b.n*a.d?-1:a.n*b.d>b.n*a.d?1:0;
 function decimal(v,label){need(typeof v==="string"&&v.length<=128&&/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v),label+" must be an exact decimal string");let [m,e="0"]=v.toLowerCase().split("e");const exponent=Number(e);need(Number.isSafeInteger(exponent)&&Math.abs(exponent)<=48,"Decimal exponent out of bounds");let sign=1n;if(m[0]==="-"){sign=-1n;m=m.slice(1);}else if(m[0]==="+")m=m.slice(1);let [a,b=""]=m.split(".");need((a+b).length<=60&&b.length<=48,"Decimal precision limit");const power=exponent-b.length;return power>=0?Q(sign*BigInt(a+b)*10n**BigInt(power)):Q(sign*BigInt(a+b),10n**BigInt(-power));}
 function fmt(q,places=9){const n=q.n<0n?-q.n:q.n,scale=10n**BigInt(places);let v=n*scale/q.d;if(n*scale%q.d*2n>=q.d)v++;let s=v.toString().padStart(places+1,"0");if(places)s=s.slice(0,-places)+"."+s.slice(-places);s=s.replace(/(\.\d*?)0+$/,"$1").replace(/\.$/,"");return(q.n<0n&&v!==0n?"-":"")+s;}
 const output=q=>q?{value:fmt(q),exact:{numerator:q.n.toString(),denominator:q.d.toString()}}:null;
 const restore=q=>Q(BigInt(q.exact.numerator),BigInt(q.exact.denominator));
 const UNITS={
 temperature:{C:[ONE,Z],K:[ONE,Q(-27315n,100n)],F:[Q(5n,9n),Q(-160n,9n)]},
 temperature_difference:{K:[ONE,Z],C:[ONE,Z],F:[Q(5n,9n),Z]},
 power:{W:[ONE,Z],kW:[Q(1000n),Z],MW:[Q(1000000n),Z]},
 energy:{Wh:[ONE,Z],kWh:[Q(1000n),Z],MWh:[Q(1000000n),Z]},
 pressure:{Pa:[ONE,Z],kPa:[Q(1000n),Z],bar:[Q(100000n),Z]},
 humidity:{percent:[ONE,Z],fraction:[Q(100n),Z]},
 fraction:{percent:[Q(1n,100n),Z],fraction:[ONE,Z]},
 flow:{m3_s:[ONE,Z],L_s:[Q(1n,1000n),Z]},
 count:{count:[ONE,Z]}
 };
 function convert(value,quantity,from,to){const a=UNITS[quantity]?.[from],b=UNITS[quantity]?.[to];need(a&&b,"Unsupported unit/quantity conversion "+quantity+":"+from+" → "+to);return div(sub(add(mul(value,a[0]),a[1]),b[1]),b[0]);}
 function timestamp(v,format){text(v,"Timestamp");if(format==="iso-offset"){const m=v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);need(m,"ISO time needs explicit Z/offset and at most millisecond precision");const [Y,M,D,h,min,s]=m.slice(1,7).map(Number);need(Y>=1900&&Y<=9999&&M>=1&&M<=12&&D>=1&&D<=31&&h<=23&&min<=59&&s<=59,"Invalid timestamp fields");const wall=Date.UTC(Y,M-1,D,h,min,s,Number((m[7]||"").padEnd(3,"0")));const d=new Date(wall);need(d.getUTCFullYear()===Y&&d.getUTCMonth()===M-1&&d.getUTCDate()===D,"Invalid calendar date");let offset=0;if(m[8]!=="Z"){const oh=Number(m[8].slice(1,3)),om=Number(m[8].slice(4));need(oh<=14&&om<=59&&(oh<14||om===0),"Invalid timezone offset");offset=(oh*60+om)*60000*(m[8][0]==="-"?-1:1);}return int(wall-offset,"Timestamp",-8640000000000000,8640000000000000);}
 need(["epoch-seconds","epoch-ms","relative-seconds"].includes(format),"Unsupported time format");let q=decimal(v,"Timestamp");if(format!=="epoch-ms")q=mul(q,Q(1000n));need(q.d===1n,"Timestamp has sub-millisecond precision");const n=Number(q.n);return int(n,"Timestamp",-8640000000000000,8640000000000000);
 }
function sourceBody(s){let b;try{b=fromBase64(s.content_base64);}catch{throw Error("Invalid original Base64");}need(toBase64(b)===s.content_base64,"Noncanonical original Base64");need(b.length===s.bytes,"Original byte count mismatch");need(sha256(b)===s.bodySha256,"Original digest mismatch");need(hash({name:s.name,mediaType:s.mediaType,bytes:s.bytes,bodySha256:s.bodySha256})===s.id,"Original identity mismatch");return b;}
  function sourceText(s){const b=sourceBody(s),t=decode(b);need(toBase64(encode(t))===s.content_base64,"Source is not exact UTF-8 text; original opaque bytes remain retained");return t;}
  function refKey(r){return canonical(r);}
  function pointer(x,p){need(typeof p==="string"&&(p===""||p[0]==="/")&&!/~(?![01])/.test(p),"JSON pointer must be valid RFC6901 syntax");for(const s of p===""?[]:p.slice(1).split("/").map(v=>v.replace(/~1/g,"/").replace(/~0/g,"~"))){need(x!==null&&typeof x==="object"&&Object.prototype.hasOwnProperty.call(x,s),"Missing pointer "+p);x=x[s];}return x;}
  // JSON numeric tokens are retained as strings; duplicate members are rejected instead of overwritten.
  function losslessJSON(s,preserveNumbers=true){let i=0;const ws=()=>{while(/[ \t\r\n]/.test(s[i]||"")&&i<s.length)i++;};function str(){const a=i++;let esc=false;while(i<s.length){const c=s[i++];if(c==='"'&&!esc)return JSON.parse(s.slice(a,i));if(c==="\\"&&!esc)esc=true;else esc=false;}throw Error("Unclosed JSON string");}function read(){ws();const c=s[i];if(c==='"')return str();if(c==="{"){i++;const o={};ws();if(s[i]==="}"){i++;return o;}while(true){ws();need(s[i]==='"',"Expected object key");const k=str();need(!Object.prototype.hasOwnProperty.call(o,k),"Duplicate JSON member "+k);ws();need(s[i++]===":","Expected colon");Object.defineProperty(o,k,{value:read(),enumerable:true,writable:true,configurable:true});ws();if(s[i]==="}"){i++;return o;}need(s[i++]===",","Expected comma");}}if(c==="["){i++;const a=[];ws();if(s[i]==="]"){i++;return a;}while(true){a.push(read());ws();if(s[i]==="]"){i++;return a;}need(s[i++]===",","Expected comma");}}for(const [lit,v]of[["true",true],["false",false],["null",null]])if(s.slice(i,i+lit.length)===lit){i+=lit.length;return v;}const m=s.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);need(m,"Invalid JSON token");i+=m[0].length;return preserveNumbers?m[0]:JSON.parse(m[0]);}const v=read();ws();need(i===s.length,"Trailing JSON content");return v;}
  function csv(s,delimiter){const rows=[],row=[];let field="",i=0,quoted=false,closed=false;function end(){row.push(field);field="";closed=false;}function line(){end();rows.push(row.splice(0));}while(i<s.length){const c=s[i++];if(quoted){if(c==='"'){if(s[i]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}if(closed&&c!==delimiter&&c!=="\r"&&c!=="\n")throw Error("Text after closing CSV quote");if(c==='"'){need(field===""&&!closed,"Quote inside unquoted CSV field");quoted=true;}else if(c===delimiter)end();else if(c==="\r"||c==="\n"){if(c==="\r"&&s[i]==="\n")i++;line();}else field+=c;}need(!quoted,"Unclosed CSV quote");if(field!==""||row.length||closed)line();return rows;}
  function inspectSource(w,sourceId,options={}){const s=w.sources.find(x=>x.id===sourceId);need(s,"Source not found");const cacheKey=canonical({format:options.format||"csv",arrayPointer:options.arrayPointer||""}),cached=inspectionCache.get(s)?.get(cacheKey);if(cached)return cached;let t=sourceText(s);if(t[0]==="\uFEFF")t=t.slice(1);const format=options.format||"csv",findings=[];let rows,columns;if(format==="json"){const body=losslessJSON(t),a=pointer(body,options.arrayPointer||"");need(Array.isArray(a),"Selected JSON pointer is not an array");rows=a.map((v,i)=>{need(v&&typeof v==="object"&&!Array.isArray(v),"JSON table row must be an object");return {rowId:hash({sourceId,record:i+1}),index:i+1,values:v,sourceRef:{sourceId,format,record:i+1,pointer:(options.arrayPointer||"")+"/"+i}};});columns=unique(rows.flatMap(x=>Object.keys(x.values)));}else{need(format==="csv"||format==="tsv","Unsupported table format");const a=csv(t,format==="tsv"?"\t":",");need(a.length,"Empty delimited source");columns=a.shift();need(columns.every(x=>x.length)&&new Set(columns).size===columns.length,"Headers must be nonempty and unique");rows=a.map((v,i)=>{need(v.length===columns.length,"Row "+(i+2)+" has "+v.length+" columns; expected "+columns.length);return {rowId:hash({sourceId,record:i+2}),index:i+2,values:Object.fromEntries(columns.map((k,j)=>[k,v[j]])),sourceRef:{sourceId,format,record:i+2}};});}need(rows.length<=50000,"Maximum 50,000 rows per source table");const result=deepFreeze({sourceId,format,columns,rows,findings,numericPolicy:"JSON numbers retain their original lexical value as text."});if(Object.isFrozen(s)){if(!inspectionCache.has(s))inspectionCache.set(s,new Map());inspectionCache.get(s).set(cacheKey,result);}return result;}
  function mapRows(w,sourceId,options){const t=inspectSource(w,sourceId,options),mapping=options.mapping||{};need(Object.keys(mapping).length,"Provide explicit output-field to source-column/pointer mappings");const rows=t.rows.map(r=>{const o={};for(const [key,sel]of Object.entries(mapping)){text(key,"Mapped field");let v;if(t.format==="json")v=pointer(r.values,sel);else{need(Object.prototype.hasOwnProperty.call(r.values,sel),"Unknown source column "+sel);v=r.values[sel];}need(v===null||["string","boolean"].includes(typeof v),"Mapped values must be scalar text/boolean/null");Object.defineProperty(o,key,{value:v,enumerable:true,writable:true,configurable:true});}o.sourceRefs=[r.sourceRef];return o;});return {rows,findings:t.findings,sourceId};}
  
 function analyse(input,w){
  const findings=[],occurrences=[],pairs=[],metrics=[],coverage=[],series=[],runs=new Map(),pointMap=new Map(),buckets=new Map(),inputSha256=hash(input);
  const finding=(code,path,message,severity="error",refs=[])=>findings.push({code,path,message,severity,sourceRefs:refs});
  const report=()=>({schema:"tjlabs.telemetry-report.v1",engine:ENGINE,inputSha256,scope:clone(input?.scope||{}),alignment:clone(input?.alignment||{}),duplicatePolicy:input?.duplicatePolicy||null,summary:{sourceCount:unique(occurrences.map(o=>o.sourceRef.sourceId)).length,occurrenceCount:occurrences.length,pointCount:pointMap.size,runCount:runs.size,pairedCount:pairs.length,errorCount:findings.filter(f=>f.severity==="error").length,warningCount:findings.filter(f=>f.severity==="warning").length,usable:pairs.length>0&&!findings.some(f=>f.severity==="error")},points:[...pointMap.values()].map(p=>clone(p)),runs:[...runs.values()].map(r=>clone(r)),occurrences,pairs,metrics,coverage,findings,interpretation:["Prediction residual is supplied prediction minus measured observation after the declared unit conversion.","The evaluation window is start-inclusive and end-exclusive; all timestamps retain their original lexemes.","No interpolation, hold-forward, averaging, extrapolation or energy-savings attribution is performed.","Nearest alignment is bounded, rejects equal-distance ambiguity and never reuses an observation within a run/point.","Coverage and all skipped/invalid/duplicate occurrences stay visible. Missing readings are not zero.","Metric values use exact rational arithmetic; RMSE is separately labelled a floating square-root approximation.","Thresholds are user-supplied review limits, not engineering operating limits or authority to act."]});
  let scope,start,end,cadence,expected,method,tolerance;
  try{
   need(input&&input.schema===INPUT_SCHEMA,"Unsupported input schema");scope=input.scope;need(scope&&typeof scope==="object","Scope is required");
   for(const k of ["siteId","podId","clockId"])text(scope[k],k);
   start=timestamp(scope.start,scope.timeFormat);end=timestamp(scope.end,scope.timeFormat);need(end>start,"Window end must follow start");
   cadence=int(scope.cadenceMs,"Cadence milliseconds",1);need((end-start)%cadence===0,"Window duration must be a whole number of cadence intervals");
   expected=(end-start)/cadence;need(expected<=100000,"Maximum 100,000 expected timestamps per point");
   method=input.alignment?.method;need(["exact","nearest"].includes(method),"Choose exact or nearest alignment");
   tolerance=int(input.alignment.toleranceMs,"Alignment tolerance",0,86400000);need(method!=="exact"||tolerance===0,"Exact alignment requires zero tolerance");need(method!=="nearest"||tolerance<cadence/2,"Nearest tolerance must be less than half the declared cadence");
   need(["reject","first","last"].includes(input.duplicatePolicy),"Declare duplicatePolicy reject, first or last");
   need(Array.isArray(input.points)&&input.points.length>0&&input.points.length<=256,"Provide 1–256 point definitions");
   need(Array.isArray(input.streams)&&input.streams.length<=32,"Maximum 32 mapped streams");
  }catch(e){finding("INPUT_SCOPE","/",e.message);return report();}
  for(let i=0;i<input.points.length;i++){const p=input.points[i],path="/points/"+i;try{text(p.id,"Point id");text(p.label,"Point label");need(!pointMap.has(p.id),"Duplicate point id");need(UNITS[p.quantity]?.[p.unit],"Unsupported point quantity/unit");let low=null,high=null;if(p.lower!==""&&p.lower!=null)low=decimal(p.lower,"Lower limit");if(p.upper!==""&&p.upper!=null)high=decimal(p.upper,"Upper limit");need(!low||!high||cmp(low,high)<=0,"Lower limit exceeds upper");pointMap.set(p.id,{id:p.id,label:p.label,quantity:p.quantity,unit:p.unit,lower:p.lower??"",upper:p.upper??""});}catch(e){finding("POINT_DEFINITION",path,e.message);}}
  const streamIds=new Set();
  for(let si=0;si<input.streams.length;si++){
   const s=input.streams[si],path="/streams/"+si;let table;
   try{
    text(s.id,"Stream id");need(!streamIds.has(s.id),"Duplicate stream id");streamIds.add(s.id);
    need(["observation","prediction"].includes(s.role),"Role must be observation or prediction");need(s.clockId===scope.clockId,"Stream clockId differs from selected scope");
    need((s.timeFormat==="relative-seconds")===(scope.timeFormat==="relative-seconds"),"Relative and absolute clock domains cannot be mixed");
    text(s.timeField,"Time field");need(["wide","long"].includes(s.layout),"Layout must be wide or long");
    if(s.role==="prediction"){
     text(s.runId,"Prediction run id");need(s.model&&typeof s.model==="object","Prediction model context required");
     for(const k of ["id","version","calibrationStart","calibrationEnd","calibrationClockId"])text(s.model[k],"Model "+k);
     need(s.model.calibrationClockId===scope.clockId,"Calibration clock differs from evaluation clock");
     const cs=timestamp(s.model.calibrationStart,scope.timeFormat),ce=timestamp(s.model.calibrationEnd,scope.timeFormat);need(ce>cs,"Calibration end must follow start");
     const r={id:s.runId,model:clone(s.model),calibrationOverlapsEvaluation:cs<end&&ce>start};
     if(runs.has(s.runId))need(canonical(runs.get(s.runId))===canonical(r),"Run model context differs between streams");else runs.set(s.runId,r);
     if(r.calibrationOverlapsEvaluation)finding("CALIBRATION_OVERLAP",path+"/model","Calibration overlaps the evaluation window; this is not held-out evaluation.","warning");
    }else need(!s.runId,"Observation streams must not have a prediction run id");
    table=inspectSource(w,s.sourceId,{format:s.format,arrayPointer:s.arrayPointer||""});
    if(s.layout==="wide"){need(Array.isArray(s.columns)&&s.columns.length>0&&s.columns.length<=256,"Wide layout requires 1–256 columns");const seen=new Set();for(const c of s.columns){need(pointMap.has(c.pointId),"Unknown mapped point "+c.pointId);need(!seen.has(c.pointId),"Duplicate wide mapped point");seen.add(c.pointId);text(c.field,"Value field");}}
    else{for(const k of ["pointField","valueField"])text(s[k],k);need(s.pointAliases==null||typeof s.pointAliases==="object"&&!Array.isArray(s.pointAliases),"Point aliases must be an object");}
   }catch(e){finding("STREAM_CONFIG",path,e.message);continue;}
   let previousTime=null;
   const get=(row,field)=>{text(field,"Mapped field");if(s.format==="json")return pointer(row.values,field);need(Object.prototype.hasOwnProperty.call(row.values,field),"Unknown source column "+field);return row.values[field];};
   for(const row of table.rows){
    let rawTime=null,t=null,timeError=null;
    try{rawTime=get(row,s.timeField);t=timestamp(rawTime,s.timeFormat);if(previousTime!==null&&t<previousTime)finding("OUT_OF_ORDER",path,"Source timestamps are out of order; original order is retained and evaluation uses explicit time ordering.","warning",[row.sourceRef]);previousTime=t;}catch(e){timeError=e.message;}
    let cols=[];
    try{if(s.layout==="wide")cols=s.columns;else{const rawPoint=get(row,s.pointField);text(rawPoint,"Source point id");const pointId=Object.prototype.hasOwnProperty.call(s.pointAliases||{},rawPoint)?s.pointAliases[rawPoint]:rawPoint;cols=[{pointId,field:s.valueField,unit:s.unitField?get(row,s.unitField):s.unit,qualityField:s.qualityField,acceptedQuality:s.acceptedQuality}];}}
    catch(e){finding("ROW_MAPPING",path,e.message,"error",[row.sourceRef]);continue;}
    for(const col of cols){
     need(occurrences.length<250000,"Maximum 250,000 expanded point occurrences");
     const sourceRef={...row.sourceRef,timeField:s.timeField,valueField:col.field,pointField:s.layout==="long"?s.pointField:null};
     const o={id:hash({streamId:s.id,sourceRef}),streamId:s.id,role:s.role,runId:s.role==="prediction"?s.runId:null,pointId:col.pointId,sourceRef,rawTime:rawTime??null,timeMs:t,rawValue:null,rawUnit:col.unit??null,rawQuality:null,normalized:null,status:"invalid",reason:"",selected:false};
     try{
      need(!timeError,timeError);const p=pointMap.get(col.pointId);need(p,"Unknown mapped point "+col.pointId);
      const raw=get(row,col.field);o.rawValue=raw;need(raw!==null&&raw!=="","Missing value");
      if(col.qualityField){o.rawQuality=get(row,col.qualityField);need(Array.isArray(col.acceptedQuality)&&col.acceptedQuality.length>0,"Quality field requires explicit acceptedQuality list");need(col.acceptedQuality.some(v=>v===o.rawQuality),"Unaccepted quality value");}
      const q=convert(decimal(raw,"Observed/predicted value"),p.quantity,col.unit,p.unit);o.normalized=output(q);o.targetUnit=p.unit;o.quantity=p.quantity;
      if(t<start||t>=end){o.status="outside-window";o.reason="Outside selected half-open evaluation window";}
      else{
       o.status="valid";if((t-start)%cadence!==0)finding("OFF_GRID",path,"Timestamp is off the declared expected grid; no resampling is performed.","warning",[sourceRef]);
       const key=canonical([s.role,o.runId,col.pointId,t]);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(o);
      }
     }catch(e){o.reason=e.message;finding("INVALID_OCCURRENCE",path,e.message,"error",[sourceRef]);}
     occurrences.push(o);
    }
   }
  }
  for(const os of buckets.values()){
   if(os.length===1){os[0].selected=true;continue;}
   const chosen=input.duplicatePolicy==="first"?os[0]:input.duplicatePolicy==="last"?os.at(-1):null;
   for(const o of os){o.status=chosen===o?"duplicate-selected":"duplicate-excluded";o.selected=chosen===o;o.reason="Duplicate policy: "+input.duplicatePolicy;}
   finding("DUPLICATE_TIME_POINT","/streams","Multiple "+os[0].role+" values for one run/point/time; policy "+input.duplicatePolicy,input.duplicatePolicy==="reject"?"error":"warning",os.map(o=>o.sourceRef));
  }
  const selected=occurrences.filter(o=>o.selected),obs=selected.filter(o=>o.role==="observation");
  const expectedTime=t=>t>=start&&t<end&&(t-start)%cadence===0;
  for(const p of pointMap.values()){
   const a=obs.filter(o=>o.pointId===p.id).sort((a,b)=>a.timeMs-b.timeMs||a.id.localeCompare(b.id)),times=new Set(a.map(o=>o.timeMs)),missing=[];let missingCount=0;
   for(let t=start;t<end;t+=cadence)if(!times.has(t)){missingCount++;if(missing.length<1000)missing.push(t);}
   coverage.push({pointId:p.id,unit:p.unit,expectedCount:expected,selectedObservationCount:a.length,onGridCount:a.filter(o=>expectedTime(o.timeMs)).length,missingCount,missingTimes:missing,missingTimesTruncated:missingCount>missing.length,coveragePercent:output(div(Q(BigInt(expected-missingCount)*100n),Q(BigInt(expected))))});
   if(missingCount)finding("OBSERVATION_COVERAGE","/points/"+p.id,missingCount+" of "+expected+" expected observation timestamps are absent or excluded.","warning");
   for(const run of runs.values()){
    const b=selected.filter(o=>o.role==="prediction"&&o.runId===run.id&&o.pointId===p.id).sort((a,b)=>a.timeMs-b.timeMs||a.id.localeCompare(b.id)),used=new Set(),local=[];
    let unmatched=0,ambiguous=0,alreadyUsed=0,index=0;
    for(const pred of b){
     while(index<a.length&&a[index].timeMs<pred.timeMs-tolerance)index++;
     const choices=[];for(let j=index;j<a.length&&a[j].timeMs<=pred.timeMs+tolerance;j++)choices.push(a[j]);
     if(!choices.length){unmatched++;continue;}
     const min=choices.reduce((n,x)=>Math.min(n,Math.abs(x.timeMs-pred.timeMs)),Infinity),best=choices.filter(x=>Math.abs(x.timeMs-pred.timeMs)===min);
     if(best.length!==1){ambiguous++;finding("ALIGNMENT_AMBIGUOUS","/alignment","Equal-distance observation candidates were excluded.","warning",[pred.sourceRef,...best.map(o=>o.sourceRef)]);continue;}
     const actual=best[0];if(used.has(actual.id)){alreadyUsed++;finding("ALIGNMENT_REUSE","/alignment","A prediction would reuse an already paired observation; excluded.","warning",[pred.sourceRef,actual.sourceRef]);continue;}
     used.add(actual.id);const av=restore(actual.normalized),pv=restore(pred.normalized),err=sub(pv,av);
     const within=v=>(p.lower===""||cmp(v,decimal(p.lower,"Lower"))>=0)&&(p.upper===""||cmp(v,decimal(p.upper,"Upper"))<=0);
     const pair={id:hash({observationId:actual.id,predictionId:pred.id}),pointId:p.id,runId:run.id,unit:p.unit,quantity:p.quantity,observationId:actual.id,predictionId:pred.id,observationTimeMs:actual.timeMs,predictionTimeMs:pred.timeMs,offsetMs:pred.timeMs-actual.timeMs,observation:actual.normalized,prediction:pred.normalized,residual:output(err),observationWithinLimits:within(av),predictionWithinLimits:within(pv),sourceRefs:[actual.sourceRef,pred.sourceRef]};
     local.push(pair);pairs.push(pair);
    }
    metrics.push({pointId:p.id,runId:run.id,unit:p.unit,expectedCount:expected,observationCount:a.length,predictionCount:b.length,pairedCount:local.length,unpairedObservationCount:a.length-used.size,unmatchedPredictionCount:unmatched,ambiguousPredictionCount:ambiguous,reusedObservationPredictionCount:alreadyUsed,...statistics(local),observationLimitBreaches:local.filter(x=>!x.observationWithinLimits).length,predictionLimitBreaches:local.filter(x=>!x.predictionWithinLimits).length,calibrationOverlapsEvaluation:run.calibrationOverlapsEvaluation});
   }
  }
  if(!runs.size)finding("NO_PREDICTIONS","/streams","No valid prediction run is configured.","warning");
  if(!obs.length)finding("NO_OBSERVATIONS","/streams","No valid selected observations are available.","warning");
  return report();
 }
 function statistics(ps){
  if(!ps.length)return {bias:null,mae:null,mse:null,rmse:null,maxAbsoluteError:null};
  const es=ps.map(p=>restore(p.residual)),sum=vs=>vs.reduce(add,Z),n=Q(BigInt(ps.length)),mse=div(sum(es.map(e=>mul(e,e))),n),root=Math.sqrt(Number(mse.n)/Number(mse.d));
  return {bias:output(div(sum(es),n)),mae:output(div(sum(es.map(abs)),n)),mse:output(mse),rmse:{value:Number.isFinite(root)?root.toPrecision(12):null,approximate:true,method:"JavaScript square root of exact MSE"},maxAbsoluteError:output(es.map(abs).reduce((a,b)=>cmp(a,b)>=0?a:b,Z))};
 }
function commitment(w){return {schema:w.schema,engine:w.engine,initial:w.initial,sources:w.sources.map(s=>({id:s.id,name:s.name,mediaType:s.mediaType,bytes:s.bytes,bodySha256:s.bodySha256})),editions:w.editions.map(e=>({id:e.id,name:e.name,parentEditionId:e.parentEditionId,preparedBy:e.preparedBy,note:e.note,createdAt:e.createdAt,inputSha256:e.inputSha256,reportSha256:e.reportSha256})),reviews:w.reviews,operations:w.operations.map(o=>({id:o.id,kind:o.kind,at:o.at,previousRoot:o.previousRoot,payloadSha256:o.payloadSha256}))};}
 function memberSize(x){if(retainedSize.has(x))return retainedSize.get(x);const n=encode(JSON.stringify(x)).length;retainedSize.set(x,n);return n;}
 function createWorkspace({title="Telemetry comparison workspace",createdAt,id}={}){text(title,"title");text(createdAt,"createdAt");const w={schema:SCHEMA,engine:ENGINE,initial:{title,createdAt,id:id||hash({title,createdAt}).slice(0,24)},sources:[],editions:[],reviews:[],operations:[]};w.rootSha256=hash(commitment(w));return trust(w);}
  function prepare(w,kind,payload,meta){need(w?.schema===SCHEMA&&w.engine===ENGINE,"Unsupported workspace");need(meta&&typeof meta==="object","Operation metadata required");text(meta.operationId,"operationId");text(meta.at,"at");need(canonical(clone(payload))===canonical(payload),"Operation payload must contain only JSON values");if(!trusted.has(w))w=validateWorkspace(w);const old=w.operations.find(x=>x.id===meta.operationId);if(old){need(old.kind===kind&&canonical(old.payload)===canonical(payload)&&old.at===meta.at&&old.previousRoot===meta.expectedRoot,"Operation ID replay differs");return {replay:true,w};}need(meta.expectedRoot===w.rootSha256,"Workspace changed; preview and save again");return {replay:false,w:{...w,sources:[...w.sources],editions:[...w.editions],reviews:[...w.reviews],operations:[...w.operations]}};}
  function finish(w,kind,payload,meta){w.operations.push({id:meta.operationId,kind,at:meta.at,previousRoot:meta.expectedRoot,payload:clone(payload),payloadSha256:hash(payload)});w.rootSha256=hash(commitment(w));const retained=[...w.sources,...w.editions,...w.reviews,...w.operations].reduce((n,x)=>n+memberSize(x),0);need(retained+16384<=128*1024*1024,"Complete workspace exceeds 128 MiB; retain a separate workspace");return trust(w);}
  function addSource(w,payload,meta){const p=prepare(w,"add-source",payload,meta);text(payload.name,"Source name");need(typeof payload.mediaType==="string","Source mediaType required");const bytes=fromBase64(payload.content_base64);need(toBase64(bytes)===payload.content_base64,"Original Base64 must be canonical");need(bytes.length<=20*1024*1024,"Source exceeds 20 MiB");const bodySha256=sha256(bytes),id=hash({name:payload.name,mediaType:payload.mediaType,bytes:bytes.length,bodySha256});if(p.replay)return {workspace:p.w,sourceId:id};if(!p.w.sources.some(s=>s.id===id)){need(p.w.sources.reduce((n,s)=>n+s.bytes,0)+bytes.length<=64*1024*1024,"Workspace originals exceed 64 MiB");p.w.sources.push({id,name:payload.name,mediaType:payload.mediaType,bytes:bytes.length,bodySha256,content_base64:payload.content_base64});}return {workspace:finish(p.w,"add-source",payload,meta),sourceId:id};}
  function readSource(w,id){const s=w.sources.find(x=>x.id===id);need(s,"Original source not found");const b=sourceBody(s);need(sha256(b)===s.bodySha256,"Original digest mismatch");return clone(s);}
  function saveEdition(w,payload,meta){const p=prepare(w,"save-edition",payload,meta);text(payload.name,"Edition name");const id=hash({operationId:meta.operationId,payload});if(p.replay){const e=p.w.editions.find(x=>x.id===id);return {workspace:p.w,editionId:id,report:clone(e.report)};}if(payload.parentEditionId)need(p.w.editions.some(e=>e.id===payload.parentEditionId),"Parent edition missing");if(payload.preparedBy)text(payload.preparedBy,"Prepared by");if(payload.note)text(payload.note,"Edition note");const report=analyse(payload.input,p.w);p.w.editions.push({id,name:payload.name,parentEditionId:payload.parentEditionId||null,preparedBy:payload.preparedBy||"",note:payload.note||"",createdAt:meta.at,input:clone(payload.input),inputSha256:hash(payload.input),report,reportSha256:hash(report)});return {workspace:finish(p.w,"save-edition",payload,meta),editionId:id,report:clone(report)};}
  function review(w,payload,meta){const p=prepare(w,"review",payload,meta);need(p.w.editions.some(e=>e.id===payload.editionId),"Review edition missing");need(["approved","needs-work"].includes(payload.decision),"Invalid reviewer decision");text(payload.reviewer,"Reviewer");text(payload.note,"Reviewer note");if(!p.replay){p.w.reviews.push({id:hash({operationId:meta.operationId,payload}),...clone(payload),at:meta.at});return finish(p.w,"review",payload,meta);}return p.w;}
  
 function compare(w,leftId,rightId){
  const l=w.editions.find(e=>e.id===leftId),r=w.editions.find(e=>e.id===rightId);need(l&&r,"Both frozen editions required");
  const contexts=[];if(canonical(l.report.scope)!==canonical(r.report.scope))contexts.push("Different site/pod/clock/evaluation scope");
  if(canonical(l.report.alignment)!==canonical(r.report.alignment))contexts.push("Different alignment policy");
  if(l.report.duplicatePolicy!==r.report.duplicatePolicy)contexts.push("Different duplicate policy");
  const keys=unique([...l.report.metrics,...r.report.metrics].map(x=>canonical([x.pointId,x.runId]))),rows=[];
  for(const k of keys){const [pointId,runId]=JSON.parse(k),a=l.report.pairs.filter(p=>p.pointId===pointId&&p.runId===runId),b=r.report.pairs.filter(p=>p.pointId===pointId&&p.runId===runId),bm=new Map(b.map(p=>[p.observationId,p])),left=[],right=[],reasons=[...contexts];let changedObservationCount=0;
   const lp=l.report.points.find(p=>p.id===pointId),rp=r.report.points.find(p=>p.id===pointId);
   if(!lp||!rp||canonical(lp)!==canonical(rp))reasons.push("Different point unit/quantity/limits");
   for(const p of a){const q=bm.get(p.observationId);if(!q)continue;if(p.observationTimeMs!==q.observationTimeMs||canonical(p.observation)!==canonical(q.observation)){changedObservationCount++;continue;}left.push(p);right.push(q);}
   if(changedObservationCount)reasons.push("Changed measured values for matching source occurrences");
   if(!left.length)reasons.push("No common measured occurrences");
   if(l.report.summary.errorCount||r.report.summary.errorCount)reasons.push("Unresolved input errors");
   const ls=statistics(left),rs=statistics(right);
   rows.push({pointId,runId,leftTotalPairs:a.length,rightTotalPairs:b.length,commonPairs:left.length,leftOnlyPairs:a.length-left.length,rightOnlyPairs:b.length-right.length,changedObservationCount,comparable:!reasons.length,reasons,leftCommonMetrics:ls,rightCommonMetrics:rs,maeDelta:!reasons.length?output(sub(restore(rs.mae),restore(ls.mae))):null,commonObservationIds:left.map(p=>p.observationId)});
  }
  return {schema:"tjlabs.telemetry-comparison.v1",leftEditionId:leftId,rightEditionId:rightId,leftName:l.name,rightName:r.name,contexts,rows,leftScope:clone(l.report.scope),rightScope:clone(r.report.scope),leftModels:clone(l.report.runs),rightModels:clone(r.report.runs),interpretation:"Candidate minus baseline residual metrics on the common unchanged measured occurrences only. Other coverage, model/calibration contexts and full reports remain separate. This is not an operational improvement or savings claim."};
 }
function exportWorkspace(w){validateWorkspace(w);const content=JSON.stringify(w)+"\n";need(encode(content).length<=128*1024*1024,"Complete workspace exceeds 128 MiB");return {filename:"Telemetry_Workspace.json",content,sha256:hash(content)};}
  function validateWorkspace(w){if(trusted.has(w))return w;need(w&&w.schema===SCHEMA&&w.engine===ENGINE,"Unsupported workspace");let replay=createWorkspace(w.initial);for(const op of w.operations){const meta={operationId:op.id,at:op.at,expectedRoot:op.previousRoot};if(op.kind==="add-source")replay=addSource(replay,op.payload,meta).workspace;else if(op.kind==="save-edition")replay=saveEdition(replay,op.payload,meta).workspace;else if(op.kind==="review")replay=review(replay,op.payload,meta);else throw Error("Unknown saved operation");}need(canonical(replay)===canonical(w),"Saved workspace does not reproduce exact source/edition/review history");return replay;}
  function importWorkspace(content){need(typeof content==="string"&&encode(content).length<=128*1024*1024,"Workspace archive exceeds 128 MiB");return validateWorkspace(losslessJSON(content,false));}

 function mapStream(w,sourceId,options){need(options&&typeof options==="object","Mapping options required");const inspection=inspectSource(w,sourceId,{format:options.format,arrayPointer:options.arrayPointer||""});return {stream:{...clone(options),sourceId},inspection};}
 return {engine:ENGINE,fields:FIELD_SPEC,units:Object.fromEntries(Object.entries(UNITS).map(([k,v])=>[k,Object.keys(v)])),blankInput,parseJSON:content=>losslessJSON(content,false),createWorkspace,addSource,readSource,inspectSource,mapStream,analyse,saveEdition,review,compare,exportWorkspace,importWorkspace,canonical,timestamp};
}
