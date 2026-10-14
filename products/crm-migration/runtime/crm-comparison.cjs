'use strict';
function createCrmComparison(deps){
"use strict";
const hash=deps.sha256Utf8,clone=x=>JSON.parse(JSON.stringify(x)),own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const fail=m=>{throw Error(m)},str=(v,label)=>typeof v==="string"&&v.trim()?v:fail(label+" must be non-empty text");
const canon=x=>Array.isArray(x)?x.map(canon):x&&typeof x==="object"?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
const digest=x=>hash(JSON.stringify(canon(x))).sha256,key=(...x)=>JSON.stringify(x);
function parseCSV(text){
 if(typeof text!=="string")fail("CSV text required");
 if(deps.parseCSV){const t=deps.parseCSV(text);if(t.headers.some(h=>!h.trim())||new Set(t.headers).size!==t.headers.length)fail("CSV headers must be distinct and non-empty");return {headers:t.headers,records:t.rows.map(r=>{if(r.cells.length!==t.headers.length)fail("CSV row "+r.row+" has incorrect width");return {row:r.row,line:r.line,values:Object.fromEntries(t.headers.map((h,i)=>[h,r.cells[i]]))};})};}
 const rows=[],row=[];let cell="",quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
  if(ch==='"'){if(cell||closed)fail("Unexpected CSV quote");quoted=true;continue;}
  if(ch===","||ch==="\n"||ch==="\r"){row.push(cell);cell="";closed=false;if(ch!==","){if(ch==="\r"&&text[i+1]==="\n")i++;rows.push(row.splice(0));}continue;}
  if(closed)fail("Unexpected data after CSV quote");cell+=ch;
 }
 if(quoted)fail("Unclosed CSV quote");
 if(cell||row.length||closed)rows.push([...row,cell]);
 if(!rows.length)fail("CSV has no header");
 const headers=rows.shift();headers[0]=headers[0].replace(/^\uFEFF/,"");
 if(headers.some(x=>!x.trim())||new Set(headers).size!==headers.length)fail("CSV headers must be distinct and non-empty");
 const records=rows.filter(r=>r.some(v=>v!=="")).map((r,i)=>{if(r.length!==headers.length)fail("CSV row "+(i+2)+" has "+r.length+" fields; expected "+headers.length);return {row:i+2,values:Object.fromEntries(headers.map((h,j)=>[h,r[j]]))};});
 return {headers,records};
}
function csv(headers,rows){return[headers,...rows.map(r=>headers.map(h=>r[h]??""))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n")+"\r\n";}
function decimal(v,scale){
 if(!Number.isSafeInteger(scale)||scale<0||scale>20)fail("Decimal scale must be 0–20");
 if(!/^-?\d+(?:\.\d+)?$/.test(v))fail("Use an exact decimal without separators or exponent");
 let [whole,fraction=""]=v.split(".");if(fraction.length>scale)fail("Decimal exceeds the declared scale");
 const negative=whole.startsWith("-");whole=whole.replace(/^-/,"");const n=BigInt(whole+fraction.padEnd(scale,"0"))*(negative?-1n:1n);return n.toString();
}
function normalized(v,field,side){
 if(typeof v!=="string")fail("Source cell is not text");
 if(v===""){if(field.required)fail("Required value is blank");return "";}
 switch(field.type||"text"){
  case"text":return v;
  case"trim":return v.trim();
  case"lower":return v.trim().toLowerCase();
  case"decimal":return decimal(v,field.scale??2);
  case"date":{if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+"T00:00:00Z").toISOString().slice(0,10)!==v)fail("Use a real YYYY-MM-DD date");return v;}
  case"enum":{const map=side==="source"?field.sourceMap:field.targetMap;if(map){if(!own(map,v))fail("Value absent from explicit "+side+" map");return map[v];}return v;}
  default:fail("Unknown field type "+field.type);
 }
}
function validateContract(contract){
 if(!contract||contract.schema!=="crm-migration.contract.v1"||!Array.isArray(contract.objects)||!contract.objects.length||!Array.isArray(contract.associations))fail("Complete CRM contract required");
 const ids=new Set();
 for(const obj of contract.objects){
  for(const k of["id","title","sourceTable","targetTable","sourceId","targetId"])str(obj[k],k);
  if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(obj.id))fail("Invalid object identifier");if(obj.sourceTable===obj.targetTable)fail("Select separate source and observed-target editions");if(ids.has(obj.id))fail("Duplicate object "+obj.id);ids.add(obj.id);
  if(!Array.isArray(obj.fields)||!obj.fields.length)fail("Declare compared fields for "+obj.id);
  if(!["crosswalk","key"].includes(obj.match?.mode))fail("Choose crosswalk or explicit key matching");
  if(obj.match.mode==="crosswalk"){for(const k of["table","source","target"])str(obj.match[k],"Crosswalk "+k);}
  else{for(const k of["source","target"])str(obj.match[k],"Match "+k);if(!["text","trim","lower"].includes(obj.match.normalization||"text"))fail("Invalid key normalization");}
  const fs=new Set();for(const f of obj.fields){for(const k of["id","source","target"])str(f[k],"Field "+k);if(fs.has(f.id))fail("Duplicate field identifier");fs.add(f.id);if(!["text","trim","lower","decimal","date","enum"].includes(f.type||"text"))fail("Invalid comparison type");if(f.type==="decimal")decimal("0",f.scale??2);for(const map of[f.sourceMap,f.targetMap])if(map&&Object.values(map).some(v=>typeof v!=="string"))fail("Mapped values must be text");}
  if(obj.amount){if(!fs.has(obj.amount.field))fail("Amount must refer to a compared field");const field=obj.fields.find(f=>f.id===obj.amount.field);if(field.type!=="decimal")fail("Amount field must be decimal");str(obj.amount.sourceCurrency,"sourceCurrency");str(obj.amount.targetCurrency,"targetCurrency");}
 }
 const associations=new Set(),directions=new Set();
 for(const a of contract.associations){
  for(const k of["id","title","sourceTable","targetTable","fromObject","toObject"])str(a[k],k);
  if(a.sourceTable===a.targetTable)fail("Select separate source and observed-target relationship editions");if(associations.has(a.id))fail("Duplicate association family");associations.add(a.id);const direction=key(a.fromObject,a.toObject);if(directions.has(direction))fail("Use one association family per directed object pair");directions.add(direction);
  if(!ids.has(a.fromObject)||!ids.has(a.toObject))fail("Association objects absent");
  for(const side of["source","target"]){if(!a[side])fail("Association columns absent");for(const k of["from","to"])str(a[side][k],side+" "+k);}
  str(a.source.type,"Source relation type");str(a.target.typeId,"Target typeId");str(a.target.category,"Target category");
  if(!Array.isArray(a.types)||!a.types.length)fail("Declare relationship types");
  const src=new Set(),tar=new Set();for(const t of a.types){str(t.source,"Source type");str(t.typeId,"Target typeId");if(!/^\d+$/.test(t.typeId)||!["HUBSPOT_DEFINED","USER_DEFINED"].includes(t.category))fail("Use category and decimal-string typeId");const tk=key(t.category,t.typeId);if(src.has(t.source)||tar.has(tk))fail("Relationship type maps must be one-to-one");src.add(t.source);tar.add(tk);}
  for(const t of a.ignoredTargetTypes||[]){if(!["HUBSPOT_DEFINED","USER_DEFINED"].includes(t.category)||!/^\d+$/.test(t.typeId))fail("Invalid ignored relationship type");str(t.reason,"Reason for excluded target type");if(tar.has(key(t.category,t.typeId)))fail("A type cannot be both compared and excluded");}
 }
 return clone(contract);
}
function compare(contract,tables){
 contract=validateContract(contract);
 if(!tables||typeof tables!=="object")fail("Complete selected source tables required");
 const findings=[],objects={},associations=[],totals=[],findIds=new Set();
 const add=(code,object,record,field,expected,actual,detail,refs=[])=>{
  const basis={code,object,record:String(record),field:field||"",expected:expected??"",actual:actual??"",detail,refs};
  const id="issue-"+digest(basis);if(findIds.has(id))return;findIds.add(id);findings.push({id,...basis});
 };
 function table(id,columns){
  const t=tables[id];if(!t||!Array.isArray(t.headers)||!Array.isArray(t.records))fail("Required table absent: "+id);
  for(const col of columns)if(!t.headers.includes(col))fail("Missing column "+col+" in "+id);
  for(const r of t.records)if(!r||!Number.isSafeInteger(r.row)||!r.values||t.headers.some(h=>typeof r.values[h]!=="string"))fail("Invalid parsed row in "+id);
  return t;
 }
 function refs(tableId,rows){return rows.map(r=>({table:tableId,row:r.row,physical_line:r.line??r.row,values:clone(r.values)}));}
 function index(t,column,tableId,obj,side,norm){
  const map=new Map();for(const row of t.records){const raw=row.values[column],v=norm?normalized(raw,{type:norm},side):raw;if(!v){add("blank_identifier",obj,"row "+row.row,column,"non-empty",v,side+" record has no usable identifier",refs(tableId,[row]));continue;}const a=map.get(v)||[];a.push(row);map.set(v,a);}
  for(const[v,rs]of map)if(rs.length>1)add("duplicate_identifier",obj,v,column,"one record",String(rs.length),side+" identifier is ambiguous",refs(tableId,rs));return map;
 }
 for(const obj of contract.objects){
  const srcCols=[obj.sourceId,...obj.fields.map(f=>f.source),...(obj.amount?[obj.amount.sourceCurrency]:[])],dstCols=[obj.targetId,...obj.fields.map(f=>f.target),...(obj.amount?[obj.amount.targetCurrency]:[])];
  if(obj.match.mode==="key"){srcCols.push(obj.match.source);dstCols.push(obj.match.target);}
  const s=table(obj.sourceTable,srcCols),t=table(obj.targetTable,dstCols),si=index(s,obj.sourceId,obj.sourceTable,obj.id,"source"),ti=index(t,obj.targetId,obj.targetTable,obj.id,"target"),pairs=new Map(),used=new Map(),unresolved=new Set();
  const link=(sid,tid,ref)=>{
   if(si.get(sid)?.length!==1){add("invalid_crosswalk_source",obj.id,sid,obj.sourceId,"one source record",String(si.get(sid)?.length||0),"Crosswalk source must resolve exactly once",ref);unresolved.add(sid);return;}
   if(ti.get(tid)?.length!==1){add("invalid_crosswalk_target",obj.id,sid,obj.targetId,"one target record",String(ti.get(tid)?.length||0),"Crosswalk target must resolve exactly once",ref);unresolved.add(sid);return;}
   if(pairs.has(sid)){add("duplicate_crosswalk",obj.id,sid,"target_id",pairs.get(sid),tid,"Source ID has multiple crosswalk rows",ref);unresolved.add(sid);return;}
   pairs.set(sid,tid);const owners=used.get(tid)||[];owners.push(sid);used.set(tid,owners);
  };
  if(obj.match.mode==="crosswalk"){
   const cw=table(obj.match.table,[obj.match.source,obj.match.target]);
   for(const row of cw.records){const sid=row.values[obj.match.source],tid=row.values[obj.match.target];if(!sid||!tid){add("blank_crosswalk",obj.id,"row "+row.row,"crosswalk","source and target identifiers",sid+" → "+tid,"Crosswalk row is incomplete",refs(obj.match.table,[row]));continue;}link(sid,tid,refs(obj.match.table,[row]));}
  }else{
   const sk=index(s,obj.match.source,obj.sourceTable,obj.id,"source",obj.match.normalization||"text"),tk=index(t,obj.match.target,obj.targetTable,obj.id,"target",obj.match.normalization||"text");
   for(const[k,rs]of sk){const rr=tk.get(k)||[];if(rs.length!==1||rr.length!==1){for(const row of rs){const sid=row.values[obj.sourceId];unresolved.add(sid);add(rr.length>1||rs.length>1?"ambiguous_match":"missing_target",obj.id,sid,obj.match.source,"one target for "+k,String(rr.length),"Explicit business key did not resolve exactly once",[...refs(obj.sourceTable,rs),...refs(obj.targetTable,rr)]);}continue;}link(rs[0].values[obj.sourceId],rr[0].values[obj.targetId],[...refs(obj.sourceTable,rs),...refs(obj.targetTable,rr)]);}
  }
  for(const[tid,owners]of used)if(owners.length>1){add("many_to_one_crosswalk",obj.id,tid,"target_id","one source",owners.join(", "),"Multiple distinct source records map to one target; retain an explicit reviewed consolidation upstream",refs(obj.targetTable,ti.get(tid)||[]));for(const sid of owners)unresolved.add(sid);}
  for(const sid of unresolved)pairs.delete(sid);
  for(const[sid,rs]of si)if(rs.length===1&&!pairs.has(sid)&&!unresolved.has(sid))add("unmapped_source",obj.id,sid,obj.sourceId,"mapped target","","Source record has no accepted target mapping",refs(obj.sourceTable,rs));
  const acceptedTargets=new Set(pairs.values());for(const[tid,rs]of ti)if(rs.length===1&&!acceptedTargets.has(tid))add("unmapped_target",obj.id,tid,obj.targetId,"mapped source","","Target record has no accepted source mapping in the selected population",refs(obj.targetTable,rs));
  for(const field of obj.fields.filter(f=>f.unique)){for(const side of["source","target"]){const seen=new Map(),ts=side==="source"?s:t,tableId=side==="source"?obj.sourceTable:obj.targetTable;for(const row of ts.records){const raw=row.values[field[side]];if(raw==="")continue;let v;try{v=normalized(raw,field,side);}catch{continue;}const rows=seen.get(v)||[];rows.push(row);seen.set(v,rows);}for(const[v,rs]of seen)if(rs.length>1)add("duplicate_unique_value",obj.id,v,field.id,"one value",String(rs.length),side+" declared unique property is duplicated",refs(tableId,rs));}}
  for(const[sid,tid]of pairs){const sr=si.get(sid)[0],tr=ti.get(tid)[0];
   if(obj.amount&&sr.values[obj.amount.sourceCurrency]!==tr.values[obj.amount.targetCurrency])add("currency_difference",obj.id,sid,"currency",sr.values[obj.amount.sourceCurrency],tr.values[obj.amount.targetCurrency],"Matched deal currencies differ",[...refs(obj.sourceTable,[sr]),...refs(obj.targetTable,[tr])]);
   for(const field of obj.fields){let sv,tv,ok=true;for(const side of["source","target"]){const value=(side==="source"?sr:tr).values[field[side]];try{const n=normalized(value,field,side);if(side==="source")sv=n;else tv=n;}catch(e){ok=false;add("invalid_field",obj.id,sid,field.id,"value matching declared "+(field.type||"text"),value,side+": "+e.message,refs(side==="source"?obj.sourceTable:obj.targetTable,[side==="source"?sr:tr]));}}
    if(ok&&sv!==tv)add("field_difference",obj.id,sid,field.id,sv,tv,"Compared values differ after the declared transformation",[...refs(obj.sourceTable,[sr]),...refs(obj.targetTable,[tr])]);
   }
  }
  if(obj.amount){const field=obj.fields.find(f=>f.id===obj.amount.field),sums={source:new Map(),target:new Map()},invalid={source:0,target:0};for(const side of["source","target"]){const rows=(side==="source"?s:t).records,currencyColumn=obj.amount[side+"Currency"];
   for(const row of rows){const currency=row.values[currencyColumn];if(!/^[A-Z]{3}$/.test(currency)){invalid[side]++;add("invalid_currency",obj.id,"row "+row.row,currencyColumn,"three-letter uppercase currency",currency,side+" amount cannot be grouped by currency",refs(side==="source"?obj.sourceTable:obj.targetTable,[row]));continue;}
    try{const raw=row.values[field[side]];if(raw==="")fail("Amount is blank");const value=BigInt(normalized(raw,field,side));sums[side].set(currency,(sums[side].get(currency)||0n)+value);}catch(e){invalid[side]++;add("invalid_amount",obj.id,"row "+row.row,field.id,"exact amount",row.values[field[side]],side+": "+e.message,refs(side==="source"?obj.sourceTable:obj.targetTable,[row]));}}
   }for(const currency of new Set([...sums.source.keys(),...sums.target.keys()]))totals.push({object:obj.id,currency,scale:field.scale??2,source_minor:String(sums.source.get(currency)||0n),target_minor:String(sums.target.get(currency)||0n),difference_minor:String((sums.target.get(currency)||0n)-(sums.source.get(currency)||0n)),source_invalid:invalid.source,target_invalid:invalid.target});
  }
  objects[obj.id]={definition:obj,source:s,target:t,sourceIndex:si,targetIndex:ti,pairs,source_records:s.records.length,target_records:t.records.length,matched:pairs.size};
 }
 for(const a of contract.associations){
  const from=objects[a.fromObject],to=objects[a.toObject],s=table(a.sourceTable,[a.source.from,a.source.to,a.source.type]),t=table(a.targetTable,[a.target.from,a.target.to,a.target.category,a.target.typeId]),typeMap=new Map(a.types.map(x=>[x.source,x])),targetTypes=new Map(a.types.map(x=>[key(x.category,x.typeId),x])),ignored=new Map((a.ignoredTargetTypes||[]).map(x=>[key(x.category,x.typeId),x])),expected=new Map(),actual=new Map(),primary=new Map();let excluded=0,blocked=0;
  for(const row of s.records){const sid=row.values[a.source.from],did=row.values[a.source.to],type=row.values[a.source.type],tm=typeMap.get(type),ref=refs(a.sourceTable,[row]),rid=sid+" → "+did;
   if(!tm){add("unmapped_relation_type",a.id,rid,"type","declared source relation type",type,"Source relationship has no explicit target category/typeId map",ref);blocked++;continue;}
   if(from.sourceIndex.get(sid)?.length!==1||to.sourceIndex.get(did)?.length!==1){add("source_orphan_relation",a.id,rid,"endpoints","two unique source records","","Source relationship endpoint is missing or ambiguous",ref);blocked++;continue;}
   if(!from.pairs.has(sid)||!to.pairs.has(did)){add("blocked_relation",a.id,rid,"endpoints","accepted source-to-target IDs","","Resolve endpoint mapping before comparing this relationship",ref);blocked++;continue;}
   const k=key(from.pairs.get(sid),to.pairs.get(did),tm.category,tm.typeId),rows=expected.get(k)||[];rows.push(row);expected.set(k,rows);
  }
  for(const[k,rs]of expected)if(rs.length>1)add("duplicate_source_relation",a.id,k,"relationship","one source row",String(rs.length),"Source relationship repeated",refs(a.sourceTable,rs));
  for(const row of t.records){const sid=row.values[a.target.from],did=row.values[a.target.to],cat=row.values[a.target.category],type=row.values[a.target.typeId],tk=key(cat,type),rid=sid+" → "+did,ref=refs(a.targetTable,[row]);
   if(from.targetIndex.get(sid)?.length!==1||to.targetIndex.get(did)?.length!==1){add("target_orphan_relation",a.id,rid,"endpoints","two unique target records","","Target relationship endpoint is missing or ambiguous",ref);continue;}
   if(ignored.has(tk)){excluded++;continue;}
   if(!targetTypes.has(tk)){add("unmapped_target_relation_type",a.id,rid,"category/typeId","compared or explicitly excluded type",cat+"/"+type,"Target relationship type is outside the declared map",ref);continue;}
   const k=key(sid,did,cat,type),rs=actual.get(k)||[];rs.push(row);actual.set(k,rs);
   if(targetTypes.get(tk).primaryCompany){const pk=key(a.fromObject,sid),ps=primary.get(pk)||new Map();const rows=ps.get(did)||[];rows.push(row);ps.set(did,rows);primary.set(pk,ps);}
  }
  for(const[k,rs]of actual)if(rs.length>1)add("duplicate_target_relation",a.id,k,"relationship","one target row",String(rs.length),"Target relationship repeated",refs(a.targetTable,rs));
  for(const[pk,ps]of primary)if(ps.size>1)add("multiple_primary_companies",a.id,pk,"primaryCompany","one primary company",String(ps.size),"Several companies carry the configured primary relationship",refs(a.targetTable,[...ps.values()].flat()));
  for(const[k,rs]of expected)if(!actual.has(k))add("missing_relation",a.id,k,"relationship",k,"","Expected directed relationship is absent from target",refs(a.sourceTable,rs));
  for(const[k,rs]of actual)if(!expected.has(k))add("unexpected_relation",a.id,k,"relationship","",k,"Target relationship is outside the expected source relationship set",refs(a.targetTable,rs));
  associations.push({id:a.id,title:a.title,source_rows:s.records.length,target_rows:t.records.length,expected_unique:expected.size,target_unique:actual.size,blocked,excluded_target_rows:excluded,matched:[...expected.keys()].filter(k=>actual.has(k)).length});
 }
 const result={schema:"crm-migration.comparison.v1",contract_sha256:digest(contract),tables_sha256:digest(tables),objects:Object.values(objects).map(o=>({id:o.definition.id,title:o.definition.title,source_records:o.source_records,target_records:o.target_records,matched:o.matched})),associations,totals,findings};
 return {...result,sha256:digest(result)};
}
return {parseCSV,csv,decimal,normalized,validateContract,compare,digest,canonical:canon};
}
module.exports={createCrmComparison};
