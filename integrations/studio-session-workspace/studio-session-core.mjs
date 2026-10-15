function createStudioSessionCore(options){
"use strict";
const {codec}=options,SCHEMA="tjlabs.studio-session-study.v1";
const columns={
rooms:["room_id","name"],
sessions:["session_id","room_id","artist_id","booked_start","booked_end","actual_start","actual_end","status","billing_mode","hourly_rate_minor","package_minor","overtime_rate_minor","increment_minutes","currency","quote_reference"],
crew_rules:["room_id","role","required_count"],
crew:["assignment_id","session_id","role","person_id","status","replacement_id"],
reports:["report_id","session_id","status","signed_by","signed_at","reference"],
allocations:["session_id","payer_id","rule","limit_minor","reference"],
invoice_lines:["line_id","invoice_id","session_id","payer_id","category","amount_minor","currency","reference"],
payments:["payment_id","invoice_id","kind","amount_minor","currency","reference"]
};
const clone=x=>JSON.parse(JSON.stringify(x)),plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
function need(ok,message){if(!ok)throw new Error(message);}
function text(v,label,max=10000,empty=false){need(typeof v==="string"&&v.length<=max&&(empty||v.trim()),"Invalid "+label);codec.utf8Encode(v);return v;}
function canonical(x){if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";if(plain(x))return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";return JSON.stringify(x);}
const hash=x=>codec.sha256(codec.utf8Encode(typeof x==="string"?x:canonical(x)));
function natural(v,label,max=1000000){need(/^(?:0|[1-9][0-9]*)$/.test(v),"Use an integer for "+label);const n=Number(v);need(Number.isSafeInteger(n)&&n<=max,label+" exceeds range");return n;}
function money(v,label,signed=false){need(typeof v==="string"&&(signed?/^-?(?:0|[1-9][0-9]*)$/:/^(?:0|[1-9][0-9]*)$/).test(v)&&v.length<=25,"Use integer minor units for "+label);return BigInt(v);}
function stamp(v,label){need(typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:Z|[+-]\d{2}:\d{2})$/.test(v),"Use offset whole-minute ISO timestamp for "+label);const n=Date.parse(v);need(Number.isFinite(n),"Invalid "+label);const [date,time]=v.split("T"),[y,m,d]=date.split("-").map(Number);need(m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(y,m,0)).getUTCDate(),"Invalid calendar date for "+label);need(+time.slice(0,2)<24&&+time.slice(3,5)<60,"Invalid clock for "+label);return n;}
function parse(textValue,required,label){
 text(textValue,label,4*1024*1024,true);need(codec.utf8Encode(textValue).length<=4*1024*1024,"CSV exceeds4MiB");
 let s=textValue.charCodeAt(0)===65279?textValue.slice(1):textValue,records=[],row=[],cell="",quoted=false,closed=false,line=1,start=1;
 const put=()=>{row.push(cell);cell="";closed=false;};
 const finish=()=>{put();if(row.some(x=>x!==""))records.push({cells:row,line:start,endLine:line});row=[];start=line+1;};
 for(let i=0;i<s.length;i++){const ch=s[i];
  if(quoted){if(ch==='"'){if(s[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=ch;if(ch==="\n")line++;else if(ch==="\r"&&s[i+1]!=="\n")line++;}continue;}
  if(ch==='"'){need(!cell&&!closed,"Unexpected quote in "+label+" at line"+line);quoted=true;}
  else if(ch===",")put();
  else if(ch==="\n"||ch==="\r"){finish();if(ch==="\r"&&s[i+1]==="\n")i++;line++;start=line;}
  else {need(!closed,"Text after quote in "+label+" at line"+line);cell+=ch;}
 }
 need(!quoted,"Unclosed CSV quote in "+label);if(cell||row.length||closed)finish();
 need(records.length>0,"Missing explicit header in "+label);
 const head=records.shift().cells;need(new Set(head).size===head.length,"Duplicate header in "+label);
 for(const h of required)need(head.includes(h),"Missing "+h+" in "+label);
 need(records.length<=20000,"Too many rows in "+label);
 return records.map((r,i)=>{need(r.cells.length===head.length,"Unequal columns in "+label+" line"+r.line);const x=Object.create(null);head.forEach((h,j)=>{need(h&&h!=="__proto__","Invalid header");x[h]=r.cells[j];});return {...x,_line:r.line,_endLine:r.endLine,_record:i+1};});
}
function csvTable(head,rows){const q=x=>{const s=x===null||x===undefined?"":typeof x==="object"?JSON.stringify(x):String(x);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};return head.map(q).join(",")+"\r\n"+rows.map(r=>head.map(h=>q(r[h])).join(",")).join("\r\n")+(rows.length?"\r\n":"");}
function sources(value){need(plain(value),"Provide all eight original sources");const out={};for(const key of Object.keys(columns)){const s=value[key];need(plain(s),"Missing original "+key);text(s.name,key+" filename",240);text(s.text,key+" original",4*1024*1024,true);parse(s.text,columns[key],key);out[key]={name:s.name,text:s.text,bytes:codec.utf8Encode(s.text).length,sha256:hash(s.text)};}return out;}
function create({id,label}){text(id,"operation ID",160);text(label,"workspace label",240);return {schema:SCHEMA,operation_id:id,label,editions:[],reviews:[]};}
function validEdition(e){need(plain(e),"Invalid edition");text(e.id,"edition ID",160);text(e.label,"edition label",240);text(e.receivedAt,"receipt time",80);need(Number.isFinite(Date.parse(e.receivedAt))&&/(Z|[+-]\d\d:\d\d)$/.test(e.receivedAt),"Receipt time requires offset");text(e.notes,"edition notes",100000,true);const ss=sources(e.sources);need(canonical(ss)===canonical(e.sources),"Original source identity differs");need(e.sourceHash===hash({id:e.id,label:e.label,receivedAt:e.receivedAt,notes:e.notes,sources:ss}),"Edition identity differs");return e;}
function compute(w,e){
 const tables={};for(const key of Object.keys(columns))tables[key]=parse(e.sources[key].text,columns[key],key);
 const attentionIds=new Set(),att=[],result={editionId:e.id,sourceHash:e.sourceHash,sessions:[],allocations:[],invoices:[],attention:att,summary:{}};
 const warn=(code,sessionId,reference,detail)=>{const a={code,sessionId:sessionId||"",reference:String(reference||""),detail};a.id=hash({sourceHash:e.sourceHash,...a});if(attentionIds.has(a.id))return a.id;attentionIds.add(a.id);a.review=[...w.reviews].reverse().find(r=>r.editionId===e.id&&r.attentionId===a.id)||null;att.push(a);return a.id;};
 function unique(rows,keys,label){const seen=new Map();for(const r of rows){const k=canonical(keys.map(x=>r[x]));keys.forEach(x=>text(r[x],label+" "+x,240));need(!seen.has(k),"Duplicate "+label+" identity at lines "+seen.get(k)?. _line+" and "+r._line);seen.set(k,r);}return seen;}
 unique(tables.rooms,["room_id"],"room");unique(tables.sessions,["session_id"],"session");unique(tables.crew_rules,["room_id","role"],"crew rule");unique(tables.crew,["assignment_id"],"assignment");unique(tables.reports,["report_id"],"report");unique(tables.allocations,["session_id"],"allocation");unique(tables.invoice_lines,["line_id"],"invoice line");unique(tables.payments,["payment_id"],"payment");
 const rooms=new Map(tables.rooms.map(r=>[r.room_id,r])),sessions=new Map(tables.sessions.map(r=>[r.session_id,r])),crew=new Map(tables.crew.map(r=>[r.assignment_id,r]));
 for(const r of tables.rooms)text(r.name,"room name",240);
 for(const r of tables.crew_rules){need(rooms.has(r.room_id),"Unknown room in crew rules");natural(r.required_count,"required crew",100);text(r.role,"role",120);}
 for(const key of ["crew","reports","allocations","invoice_lines"])for(const r of tables[key])need(sessions.has(r.session_id),"Unknown session in "+key+" line"+r._line);
 for(const a of tables.crew){text(a.role,"crew role",120);need(["assigned","seen","cant_make_it","covered","declined","outside"].includes(a.status),"Invalid crew status");if(a.status!=="outside")text(a.person_id,"crew person",240);if(a.status==="outside")need(a.role==="engineer","Outside marker supports engineer role only");if(a.status==="covered"){const replacement=crew.get(a.replacement_id);need(replacement&&replacement.assignment_id!==a.assignment_id&&replacement.session_id===a.session_id&&replacement.role===a.role&&["assigned","seen"].includes(replacement.status),"Covered assignment requires accepted same-session/role replacement");}else need(!a.replacement_id,"Only covered assignment has replacement");}
 const ranges=[],actualRanges=[],effectiveCrew=[];
 const round=(n,d)=>(n+d/2n)/d,charge=(minutes,rate)=>round(BigInt(minutes)*rate,60n),quant=(n,inc)=>Math.ceil(n/inc)*inc;
 for(const s of tables.sessions){
  need(rooms.has(s.room_id),"Unknown session room");need(["scheduled","in_progress","completed","cancelled","no_show"].includes(s.status),"Invalid session status");
  need(["booked","actual","package"].includes(s.billing_mode),"Invalid declared billing mode");need(/^[A-Z]{3}$/.test(s.currency),"Declare ISO currency");
  const begin=stamp(s.booked_start,"booked start"),end=stamp(s.booked_end,"booked end");need(end>begin&&end-begin<=31*86400000,"Session booked interval must be positive and at most31days");
  const booked=(end-begin)/60000,inc=natural(s.increment_minutes,"billing increment",1440);need(inc>0,"Billing increment must be positive");
  const rate=money(s.hourly_rate_minor,"hourly rate"),pack=money(s.package_minor,"package amount"),otRate=money(s.overtime_rate_minor,"overtime rate");
  text(s.quote_reference,"quote/reference",10000);
  let actual=null,actualBegin=null,actualEnd=null;
  if(s.actual_start)actualBegin=stamp(s.actual_start,"actual start");if(s.actual_end)actualEnd=stamp(s.actual_end,"actual end");
  need(actualEnd===null||actualBegin!==null,"Actual end requires start");if(actualBegin!==null&&actualEnd!==null){need(actualEnd>=actualBegin&&actualEnd-actualBegin<=31*86400000,"Invalid actual interval");actual=(actualEnd-actualBegin)/60000;}
  if(!s.artist_id)warn("client_missing",s.session_id,"sessions:"+s._line,"No client is supplied; payer allocation cannot be completed.");
  let base=null,ot=null;
  if(s.status==="completed"&&actual!==null){
   const baseMinutes=s.billing_mode==="actual"?Math.min(booked,actual):booked;
   base=s.billing_mode==="package"?pack:charge(quant(baseMinutes,inc),rate);
   ot=charge(quant(Math.max(0,actual-booked),inc),otRate);
  }else if(["cancelled","no_show"].includes(s.status))warn("cancellation_policy_review",s.session_id,"sessions:"+s._line,"Retain the studio's actual cancellation/deposit/refund decision; no automatic charge is calculated.");
  else warn("session_unfinished",s.session_id,"sessions:"+s._line,"A completed session with both actual times is required for the charge comparison.");
  if(["scheduled","in_progress","completed"].includes(s.status))ranges.push({id:s.session_id,room:s.room_id,start:begin,end});
  if(actualBegin!==null&&actualEnd!==null&&actualEnd>actualBegin)actualRanges.push({id:s.session_id,room:s.room_id,start:actualBegin,end:actualEnd});
  const assignments=tables.crew.filter(a=>a.session_id===s.session_id),effective=assignments.filter(a=>["assigned","seen","outside"].includes(a.status));
  for(const a of assignments.filter(a=>a.status==="cant_make_it"))warn("crew_cover_pending",s.session_id,"crew:"+a._line,a.role+" "+a.person_id+" cannot make it; original obligation stays visible until accepted cover.");
  const personRoles=new Set();for(const a of effective){if(a.person_id){const key=a.person_id+"\u0000"+a.role;need(!personRoles.has(key),"Duplicate effective person/role in session "+s.session_id);personRoles.add(key);}}
  const reservedPeople=new Set();for(const a of assignments.filter(a=>["assigned","seen","cant_make_it","outside"].includes(a.status)))if(a.person_id&&!reservedPeople.has(a.person_id)){reservedPeople.add(a.person_id);if(["scheduled","in_progress","completed"].includes(s.status))effectiveCrew.push({session:s.session_id,person:a.person_id,start:begin,end});}
  const crewSummary=[];for(const rule of tables.crew_rules.filter(x=>x.room_id===s.room_id)){const count=effective.filter(x=>x.role===rule.role).length,required=natural(rule.required_count,"required count",100);crewSummary.push({role:rule.role,required,effective:count});if(count<required&&["scheduled","in_progress","completed"].includes(s.status))warn("crew_role_missing",s.session_id,"crew_rules:"+rule._line,rule.role+": "+count+" of "+required+" declared roles filled.");}
  const reports=tables.reports.filter(r=>r.session_id===s.session_id);need(reports.length<=1,"Provide one current session report per source edition");let reportStatus="missing";
  if(reports.length){const r=reports[0];need(["draft","signed","void"].includes(r.status),"Invalid report status");reportStatus=r.status;if(r.status==="signed"){text(r.signed_by,"report signer",240);stamp(r.signed_at,"report signed time");text(r.reference,"report reference");}}
  if(s.status==="completed"&&reportStatus!=="signed")warn("session_report_missing",s.session_id,reports.length?"reports:"+reports[0]._line:"reports","Completed session has no current signed report.");
  const row={sessionId:s.session_id,roomId:s.room_id,artistId:s.artist_id,status:s.status,bookedMinutes:booked,actualMinutes:actual,billingMode:s.billing_mode,currency:s.currency,baseMinor:base===null?null:String(base),overtimeMinor:ot===null?null:String(ot),totalMinor:base===null?null:String(base+ot),crew:crewSummary,reportStatus,quoteReference:s.quote_reference,poReference:s.po_reference||"",attentionIds:[]};result.sessions.push(row);
  if(base!==null&&s.artist_id){
   const split=tables.allocations.find(a=>a.session_id===s.session_id);let labelBase=0n,labelOT=0n,label="";
   if(split){text(split.payer_id,"label payer",240);text(split.reference,"allocation reference");need(split.payer_id!==s.artist_id,"Label allocation payer must differ from artist");need(["all","booked","fixed"].includes(split.rule),"Invalid payer allocation rule");label=split.payer_id;const limit=money(split.limit_minor,"allocation limit");
    if(split.rule==="all"){labelBase=base;labelOT=ot;}else if(split.rule==="booked")labelBase=base;else {labelBase=limit<base?limit:base;const remaining=limit-labelBase;labelOT=remaining<ot?remaining:ot;}
   }
   const put=(payerId,category,amount)=>{if(amount!==0n)result.allocations.push({sessionId:s.session_id,payerId,category,expectedMinor:String(amount),observedMinor:"0",deltaMinor:"0",currency:s.currency});};
   if(label){put(label,"base",labelBase);put(label,"overtime",labelOT);}put(s.artist_id,"base",base-labelBase);put(s.artist_id,"overtime",ot-labelOT);
  }
 }
 function overlaps(rows,key,code){const groups=new Map();for(const r of rows){const g=groups.get(r[key])||[];g.push(r);groups.set(r[key],g);}for(const [resource,g]of groups){g.sort((a,b)=>a.start-b.start||a.end-b.end);let active=[];for(const r of g){active=active.filter(a=>a.end>r.start);for(const a of active){if((a.id||a.session)!==(r.id||r.session))warn(code,r.id||r.session,resource,"Overlaps "+(a.id||a.session)+" on declared "+key+" "+resource+".");}active.push(r);}}}
 overlaps(ranges,"room","room_overlap");overlaps(actualRanges,"room","actual_room_overlap");overlaps(effectiveCrew,"person","crew_overlap");
 const invoices=new Map(),observed=new Map();
 for(const line of tables.invoice_lines){
  text(line.invoice_id,"invoice ID",240);text(line.payer_id,"invoice payer",240);text(line.reference,"invoice line reference");const s=sessions.get(line.session_id);need(line.currency===s.currency,"Invoice/session currency differs");need(["base","overtime","discount","fee","tax","other"].includes(line.category),"Invalid invoice category");
  const amount=money(line.amount_minor,"invoice amount",true);if(["base","overtime","fee","tax"].includes(line.category))need(amount>=0n,"Base/overtime/fee/tax amount must be nonnegative");if(line.category==="discount")need(amount<=0n,"Discount must be nonpositive");
  let inv=invoices.get(line.invoice_id);if(!inv){inv={invoiceId:line.invoice_id,payerId:line.payer_id,currency:line.currency,total:0n,received:0n,refund:0n,lines:[],poReferences:new Set()};invoices.set(line.invoice_id,inv);}need(inv.payerId===line.payer_id&&inv.currency===line.currency,"One invoice must retain one payer and currency");inv.total+=amount;inv.lines.push(line.line_id);inv.poReferences.add(line.po_reference||"");
  const label=tables.allocations.find(a=>a.session_id===line.session_id);
  if(label&&line.payer_id===label.payer_id){const expectedPO=s.po_reference||label.deal_po_reference||"";if(expectedPO&&(line.po_reference||"")!==expectedPO)warn("invoice_po_difference",line.session_id,"invoice_lines:"+line._line,"Expected label PO "+expectedPO+" from the session/deal source; observed "+(line.po_reference||"(blank)")+".");}
  if(["base","overtime"].includes(line.category)){const key=canonical([line.session_id,line.payer_id,line.category]);observed.set(key,(observed.get(key)||0n)+amount);}
  else warn("invoice_adjustment_review",line.session_id,"invoice_lines:"+line._line,line.category+" "+amount+" "+line.currency+" minor units retained separately; verify against "+line.reference+".");
 }
 const seenAlloc=new Set();for(const a of result.allocations){const key=canonical([a.sessionId,a.payerId,a.category]),observedValue=observed.get(key)||0n;a.observedMinor=String(observedValue);a.deltaMinor=String(observedValue-BigInt(a.expectedMinor));seenAlloc.add(key);if(a.deltaMinor!=="0")warn("invoice_component_difference",a.sessionId,key,a.category+" for "+a.payerId+": expected "+a.expectedMinor+", observed "+a.observedMinor+", delta "+a.deltaMinor+" "+a.currency+" minor units.");}
 for(const [key,amount]of observed)if(!seenAlloc.has(key)){const [sessionId,payerId,category]=JSON.parse(key);result.allocations.push({sessionId,payerId,category,expectedMinor:null,observedMinor:String(amount),deltaMinor:null,currency:sessions.get(sessionId).currency});warn("unexpected_invoice_component",sessionId,key,"Observed "+category+" for "+payerId+" has no computed declared allocation.");}
 for(const p of tables.payments){need(invoices.has(p.invoice_id),"Payment references unknown invoice");const inv=invoices.get(p.invoice_id);need(p.currency===inv.currency,"Payment currency differs");need(["receipt","refund"].includes(p.kind),"Invalid payment kind");text(p.reference,"payment reference");const n=money(p.amount_minor,"payment amount");if(p.kind==="receipt")inv.received+=n;else inv.refund+=n;}
 for(const inv of invoices.values()){const net=inv.received-inv.refund,balance=inv.total-net;result.invoices.push({invoiceId:inv.invoiceId,payerId:inv.payerId,currency:inv.currency,totalMinor:String(inv.total),receivedMinor:String(inv.received),refundMinor:String(inv.refund),netPaidMinor:String(net),balanceMinor:String(balance),lineIds:inv.lines,poReferences:[...inv.poReferences]});if(inv.poReferences.size>1)warn("invoice_mixed_po","",inv.invoiceId,"One observed invoice contains distinct PO values: "+JSON.stringify([...inv.poReferences])+". Review separation against original session/deal POs.");if(net<0n)warn("refund_exceeds_receipts","",inv.invoiceId,"Retained refunds exceed receipts for this invoice.");if(balance<0n)warn("invoice_credit_balance","",inv.invoiceId,"Net payment exceeds recorded invoice total; retain and review the credit.");}
 for(const row of result.sessions)row.attentionIds=att.filter(a=>a.sessionId===row.sessionId).map(a=>a.id);
 const currencies={};for(const r of result.invoices){const x=currencies[r.currency]||(currencies[r.currency]={invoicedMinor:0n,netPaidMinor:0n,balanceMinor:0n});x.invoicedMinor+=BigInt(r.totalMinor);x.netPaidMinor+=BigInt(r.netPaidMinor);x.balanceMinor+=BigInt(r.balanceMinor);}
 result.summary={sessions:result.sessions.length,completed:result.sessions.filter(x=>x.status==="completed").length,attention:att.length,unreviewed:att.filter(x=>!x.review).length,invoices:result.invoices.length,totalsByCurrency:Object.fromEntries(Object.entries(currencies).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).map(([a,b])=>[a,String(b)]))]))};
 return result;
}
function reopen(input){
 need(plain(input)&&input.schema===SCHEMA,"Unsupported studio study workspace");const w=clone(input);text(w.operation_id,"operation ID",160);text(w.label,"workspace label",240);need(Array.isArray(w.editions)&&Array.isArray(w.reviews),"Retain complete edition and review arrays");need(w.editions.length<=200&&w.reviews.length<=50000,"Workspace exceeds supported history");
 const ids=new Set();for(const e of w.editions){validEdition(e);need(!ids.has(e.id),"Duplicate edition ID");ids.add(e.id);}
 const baseResults=new Map(w.editions.map(e=>[e.id,compute({...w,reviews:[]},e)]));
 const attentionIndex=new Map([...baseResults].map(([id,result])=>[id,new Map(result.attention.map(a=>[a.id,a]))]));
 const checked=[];for(const r of w.reviews){need(plain(r),"Invalid review");text(r.id,"review ID",160);need(!checked.some(x=>x.id===r.id),"Duplicate review ID");const e=w.editions.find(x=>x.id===r.editionId);need(e,"Review edition missing");const attention=attentionIndex.get(e.id).get(r.attentionId);need(attention,"Review source/finding binding differs");need(["investigate","accept_expected","correct_source"].includes(r.disposition),"Invalid review disposition");text(r.reviewer,"reviewer",240);text(r.reason,"review reason",20000);text(r.evidence,"receiving evidence",20000);const previous=[...checked].reverse().find(x=>x.editionId===r.editionId&&x.attentionId===r.attentionId);need((r.previousReviewId||null)===(previous?.id||null),"Review correction predecessor differs");const unsigned={...r};delete unsigned.identity;need(r.identity===hash(unsigned),"Review identity differs");checked.push(r);}
 return w;
}
function receive(workspace,input){const w=reopen(workspace);need(plain(input),"Provide a source edition");need(!w.editions.some(e=>e.id===input.id),"Edition ID already retained");const e={id:input.id,label:input.label,receivedAt:input.receivedAt,notes:input.notes||"",sources:sources(input.sources)};e.sourceHash=hash(e);validEdition(e);compute(w,e);w.editions.push(e);return w;}
function analyse(workspace,editionId){const w=reopen(workspace),e=w.editions.find(x=>x.id===editionId);need(e,"Choose a retained edition");return compute(w,e);}
function review(workspace,input){const w=reopen(workspace),r=clone(input);need(!Object.hasOwn(r,"identity"),"Review identity is calculated");r.previousReviewId=r.previousReviewId||null;r.identity=hash(r);w.reviews.push(r);return reopen(w);}
function csv(workspace,editionId,kind){const a=analyse(workspace,editionId);need(["sessions","attention","invoices","allocations"].includes(kind),"Choose an export kind");const defaults={sessions:["sessionId","roomId","artistId","status","bookedMinutes","actualMinutes","billingMode","currency","baseMinor","overtimeMinor","totalMinor","crew","reportStatus","quoteReference","poReference","attentionIds"],attention:["id","code","sessionId","reference","detail","review"],allocations:["sessionId","payerId","category","expectedMinor","observedMinor","deltaMinor","currency"],invoices:["invoiceId","payerId","currency","totalMinor","receivedMinor","refundMinor","netPaidMinor","balanceMinor","lineIds","poReferences"]};return csvTable(defaults[kind],a[kind]);}
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function report(workspace,editionId){const w=reopen(workspace),a=analyse(w,editionId),e=w.editions.find(x=>x.id===editionId);const table=(rows,keys)=>"<div class='scroll'><table><thead><tr>"+keys.map(k=>"<th>"+esc(k)+"</th>").join("")+"</tr></thead><tbody>"+rows.map(r=>"<tr>"+keys.map(k=>"<td>"+esc(typeof r[k]==="object"?JSON.stringify(r[k]):r[k])+"</td>").join("")+"</tr>").join("")+"</tbody></table></div>";
 const download=(name,type,data)=>"<a download='"+esc(name)+"' href='data:"+type+";base64,"+codec.base64Encode(codec.utf8Encode(data))+"'>"+esc(name)+"</a>";
 return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Session study — "+esc(e.label)+"</title><style>body{font:15px system-ui;margin:24px;color:#202020;background:#fff;line-height:1.5}h1,h2{line-height:1.2}.scroll{overflow:auto}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #bbb;text-align:left;vertical-align:top}th{background:#eee}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:inherit;margin-right:12px}@media print{a[download]{display:none}.scroll{overflow:visible}table{font-size:10px}tr{break-inside:avoid}}</style></head><body><h1>"+esc(w.label)+"</h1><h2>"+esc(e.label)+"</h2><p>Source edition "+esc(e.id)+" · "+esc(e.receivedAt)+" · "+esc(e.sourceHash)+"</p><p>"+esc(e.notes)+"</p><p>All amounts are declared integer currency minor units. This study retains observations and review decisions; it performs no payment, invoice, crew or media action.</p><pre>"+esc(JSON.stringify(a.summary,null,2))+"</pre><h2>Sessions and declared charge basis</h2>"+table(a.sessions,["sessionId","roomId","status","bookedMinutes","actualMinutes","billingMode","currency","baseMinor","overtimeMinor","totalMinor","crew","reportStatus","poReference"])+"<h2>Expected and observed payer components</h2>"+table(a.allocations,["sessionId","payerId","category","currency","expectedMinor","observedMinor","deltaMinor"])+"<h2>Observed invoices and net payments</h2>"+table(a.invoices,["invoiceId","payerId","currency","totalMinor","receivedMinor","refundMinor","balanceMinor","poReferences"])+"<h2>Attention and source-bound reviews</h2>"+table(a.attention,["code","sessionId","reference","detail","review"])+"<h2>Complete current originals</h2>"+Object.entries(e.sources).map(([k,s])=>"<p>"+esc(k)+" · "+s.bytes+" bytes · "+esc(s.sha256)+"<br>"+download(s.name,"text/csv",s.text)+"</p>").join("")+"<h2>Complete history and ordinary exports</h2><p>"+download("studio-session-workspace.json","application/json",JSON.stringify(w,null,2))+"</p><p>"+["sessions","allocations","invoices","attention"].map(k=>download(k+".csv","text/csv",csv(w,editionId,k))).join(" ")+"</p><details><summary>All retained review history</summary><pre>"+esc(JSON.stringify(w.reviews,null,2))+"</pre></details></body></html>";
}
const sampleSources={};
for(const [k,head]of Object.entries(columns))sampleSources[k]={name:k+".csv",text:head.join(",")+"\r\n"};
sampleSources.rooms.text+="ROOM-A,Authored tracking room\r\n";
sampleSources.sessions.text+="SESSION-1,ROOM-A,ARTIST-1,2026-10-15T18:00:00-04:00,2026-10-16T00:00:00-04:00,2026-10-15T18:00:00-04:00,2026-10-16T02:00:00-04:00,completed,booked,12000,0,12000,15,USD,Authored accepted six-hour quote\r\n";
sampleSources.crew_rules.text+="ROOM-A,engineer,1\r\nROOM-A,assistant,1\r\n";
sampleSources.crew.text+="CREW-1,SESSION-1,engineer,ENGINEER-1,seen,\r\nCREW-2,SESSION-1,assistant,ASSISTANT-1,cant_make_it,\r\n";
sampleSources.reports.text+="REPORT-1,SESSION-1,draft,,,Authored draft session report\r\n";
sampleSources.allocations.text+="SESSION-1,LABEL-1,booked,0,Authored label covers six booked hours\r\n";
sampleSources.invoice_lines.text+="LINE-1,INVOICE-LABEL,SESSION-1,LABEL-1,base,72000,USD,Authored invoice base\r\nLINE-2,INVOICE-ARTIST,SESSION-1,ARTIST-1,overtime,12000,USD,Authored invoice omits one overtime hour\r\n";
sampleSources.payments.text+="PAY-1,INVOICE-LABEL,receipt,36000,USD,Authored deposit already applied once\r\n";
return {SCHEMA,columns:clone(columns),sampleSources:clone(sampleSources),create,reopen,receive,analyse,review,report,csv,parseCSV:parse,hash,canonical};
}

export {createStudioSessionCore};
