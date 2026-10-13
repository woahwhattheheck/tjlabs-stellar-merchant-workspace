import { clone, digest, sha256, base64, need, plain, own, hash, id, text, integer, now, canonical } from "./util.mjs";

export const VOLTTRON_FORMAT = "commons.haystack.volttron-registry.v1";
export const VOLTTRON_REQUIRED = ["Volttron Point Name", "Units", "BACnet Object Type", "Property", "Writable", "Index"];
export const VOLTTRON_OPTIONAL = ["Write Priority", "COV Flag", "Array Index"];
const CONTROL_FIELDS = new Set(["Volttron Point Name", "BACnet Object Type", "Property", "Writable", "Index", "Write Priority", "COV Flag", "Array Index"]);
const ROW_LIMIT = 1000, CONFIG_LIMIT = 20;
const BACNET_OBJECT_TYPES = new Set(["multiStateValue","multiStateInput","multiStateOutput","analogValue","analogInput","analogOutput","binaryValue","binaryInput","binaryOutput"]);
const fail = (condition, message) => need(condition, message, "HAYSTACK_VOLTTRON", 409);
const list = (value, label, max = 10000) => { fail(Array.isArray(value) && value.length <= max, "Retain the complete " + label + " within " + max + " entries."); return value; };
const nonempty = (value, label, max = 4000) => text(value, label, max, true);
const record = body => ({...clone(body), id: digest(body)});
const bodyOf = row => { const body = clone(row); delete body.id; return body; };
const find = (rows, identity, label) => { const found = rows.find(row => row.id === identity); fail(found, "The complete " + label + " is not retained."); return found; };
const unique = (rows, key, label) => fail(new Set(rows.map(row => row[key])).size === rows.length, "Duplicate " + label + " identities are not interchangeable.");
const stamp = args => ({author: nonempty(args.author, "named reviewer", 240), note: text(args.note || "", "review note", 16000), createdAt: now()});
const safeName = value => { nonempty(value, "file basename", 240); fail(!/[\/\\\x00-\x1f]/.test(value) && value !== "." && value !== "..", "Use a file basename without a path."); return value; };
function stateOf(state, create = false) {
  if (!state.volttron && create) state.volttron = {format: VOLTTRON_FORMAT, configurations: [], profiles: [], versions: [], editions: [], receivings: [], returns: []};
  return state.volttron;
}
export function volttronSummary(state) {
  const s = stateOf(state);
  return {profiles: clone(s?.profiles || []), configurations: (s?.configurations || []).map(({base64: omitted, ...metadata}) => clone(metadata)),
    editions: (s?.editions || []).map(({decisions: omitted, ...metadata}) => clone(metadata)),
    receivings: (s?.receivings || []).map(row => ({id:row.id,editionId:row.editionId,mode:row.evidence.mode,outcome:row.evidence.outcome,receivingMatches:row.result.receivingMatches,createdAt:row.createdAt})),
    returns: clone(s?.returns || []), configurationCount: s?.configurations.length || 0,
    versionCount: s?.versions.length || 0, editionCount: s?.editions.length || 0,
    receivingCount: s?.receivings.length || 0, returnCount: s?.returns.length || 0};
}
function intakeOf(state, intakeId) {
  const intake = find(state.semantics?.intakes || [], id(intakeId), "original native-parsed registry intake");
  fail(intake.rows.length <= ROW_LIMIT, "This selected registry exceeds the complete 1,000-row workshare.");
  fail(digest({columns:intake.columns, rows:intake.rows, rowEndLines:intake.rowEndLines}) === intake.contentSha256, "The original native registry inspection changed.");
  const asset = find(state.semantics?.assets || [], intake.assetId, "original registry bytes");
  const raw = base64(asset.base64, 32 * 1024 * 1024);
  fail(raw.length === asset.bytes && raw.length === intake.bytes && sha256(raw) === intake.assetId, "Retain the exact original registry bytes.");
  return intake;
}
// Inspect JSON's lexical keys and integers before any source value can be used as an identity.
function exactIntegerToken(token) {
  const match=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);if(!match)return null;
  let digits=(match[2]+(match[3]||"")).replace(/^0+/,"");if(!digits)return "0";
  const exponent=Number(match[4]||0)-(match[3]||"").length;
  if(!Number.isSafeInteger(exponent)||Math.abs(exponent)>4096)return null;
  if(exponent<0){const cut=digits.length+exponent;if(cut<=0||/[1-9]/.test(digits.slice(cut)))return null;digits=digits.slice(0,cut);}
  else digits+="0".repeat(exponent);
  return (match[1]?"-":"")+digits;
}
function inspectJson(raw) {
  const value = JSON.parse(raw), issues = []; let at = 0;
  const ws = () => { while (/\s/.test(raw[at] || "") && at < raw.length) at++; };
  function string() { const start = at++; while (at < raw.length) { const c = raw[at++]; if(c === "\\") at++; else if(c === '"') return JSON.parse(raw.slice(start,at)); } throw Error("Incomplete configuration string"); }
  function visit(path) {
    ws(); const c=raw[at];
    if(c === "{") { at++; ws(); const seen=new Set(); if(raw[at] === "}") {at++; return;} for(;;) {
      ws(); const key=string(); if(seen.has(key)) issues.push({code:"DUPLICATE_CONFIGURATION_KEY", path:[...path,key]}); seen.add(key);
      ws(); at++; visit([...path,key]); ws(); if(raw[at++] === "}") break;
    } return; }
    if(c === "[") { at++; ws(); if(raw[at] === "]"){at++;return;} let index=0;for(;;){visit([...path,index++]);ws();if(raw[at++] === "]")break;}return; }
    if(c === '"'){string();return;}
    const token=raw.slice(at).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0];
    fail(token, "Invalid complete device configuration JSON.");
    if(/^-?\d/.test(token)) {
      const number=Number(token);
      if(!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) issues.push({code:"UNSAFE_CONFIGURATION_NUMBER",path,raw:token});
      if(path.length===2&&path[0]==="driver_config"&&["device_id","min_priority"].includes(path[1])&&exactIntegerToken(token)!==String(number))issues.push({code:"INEXACT_INTEGER_CONFIGURATION_FIELD",path,raw:token});
    }
    at+=token.length;
  }
  visit([]); return {value,issues};
}
function configurationOf(s, configurationId) {
  const row=find(s.configurations,hash(configurationId),"device configuration"),raw=base64(row.base64,1024*1024);
  fail(raw.length===row.bytes&&sha256(raw)===row.sha256&&row.id===digest(bodyOf(row)),"The complete device configuration changed.");
  return {...clone(row),inspection:inspectJson(new TextDecoder("utf-8",{fatal:true}).decode(raw))};
}
function profileVersion(state, profileId, versionId) {
  const s=stateOf(state); fail(s,"This workspace has no VOLTTRON profile.");
  const profile=find(s.profiles,id(profileId),"registry profile");
  const version=find(s.versions,hash(versionId||profile.headId),"profile version");
  fail(version.profileId===profile.id,"The selected profile version belongs to another history.");
  return {s,profile,version};
}
function validateProfile(state, content) {
  fail(plain(content),"Supply the whole selected registry profile.");
  nonempty(content.title,"profile title",240); nonempty(content.buildingReference,"one building reference",1000);
  fail(["engineering","commissioning"].includes(content.mode),"Identify engineering or commissioning source.");
  fail(plain(content.target),"Select the complete target contract.");
  for(const key of ["product","version","build","driverRelease","interfaceName","documentationUrl","environment","receivingMethod","selectionReference"]) nonempty(content.target[key],"target "+key);
  fail(content.target.product==="VOLTTRON"&&content.target.interfaceName==="BACnet CSV registry","Select the documented BACnet CSV registry interface.");
  list(content.bindings,"device bindings",CONFIG_LIMIT); fail(content.bindings.length>0,"Select at least one original device binding.");
  unique(content.bindings,"deviceKey","device binding"); let count=0;const s=stateOf(state);fail(s,"Import each original device configuration first.");
  for(const binding of content.bindings) {
    nonempty(binding.deviceKey,"exact device scope",1000);safeName(binding.registryName);fail(/\.csv$/i.test(binding.registryName),"Name the selected registry CSV.");
    nonempty(binding.approvalReference,"profile selection reference");
    const intake=intakeOf(state,binding.intakeId);configurationOf(s,binding.configurationId);count+=intake.rows.length;
    list(binding.columns,"ordered target columns",256);fail(binding.columns.length>0,"Retain the ordered target columns.");unique(binding.columns,"header","target column");
    const covered=new Set();
    for(const column of binding.columns) {
      nonempty(column.header,"exact output heading",65536);
      if(column.sourceIndex===null) {text(column.constant,"explicit constant",1048576);nonempty(column.reason,"constant mapping reason");}
      else {integer(column.sourceIndex,"original column index",0,intake.columns.length-1);fail(!own(column,"constant"),"A column selects an original cell or a constant.");covered.add(column.sourceIndex);}
    }
    const omitted=new Set();for(const omission of list(binding.omissions,"explicit omitted source columns",256)) {
      integer(omission.sourceIndex,"omitted original column index",0,intake.columns.length-1);nonempty(omission.reason,"target omission reason");
      fail(!covered.has(omission.sourceIndex)&&!omitted.has(omission.sourceIndex),"An original column cannot be both projected and omitted.");omitted.add(omission.sourceIndex);
    }
    fail(covered.size+omitted.size===intake.columns.length,"Every original heading occurrence must be projected or explicitly omitted.");
  }
  fail(count<=ROW_LIMIT,"Count all selected physical rows, including duplicates and exclusions, within the 1,000-row workshare.");
  return content;
}
function originalCell(cells,index){return index<cells.length?{present:true,value:cells[index]}:{present:false};}
function validCell(cell) {fail(plain(cell)&&typeof cell.present==="boolean"&&own(cell,"value")===cell.present,"Preserve explicit cell presence.");if(cell.present)text(cell.value,"exact cell text",1048576);return cell;}
const keyOf=(deviceKey,rowIndex)=>canonical([deviceKey,rowIndex]);
function csvCell(value){return '"'+String(value??"").replace(/"/g,'""')+'"';}
function targetCsv(columns,rows){return [columns,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";}
function file(name,content,mediaType,extra={}) {
  const raw=Buffer.isBuffer(content)?content:Buffer.from(content,"utf8");
  return {name,mediaType,bytes:raw.length,sha256:sha256(raw),base64:raw.toString("base64"),...extra};
}
function assess(state, version, decisions=[]) {
  validateProfile(state,version.content);const content=version.content,s=stateOf(state),findings=[],advisories=[],rows=[],files=[],expected=[],provided=new Map();
  list(decisions,"complete physical-row decisions",ROW_LIMIT);
  for(const d of decisions) {
    fail(plain(d),"Supply a complete row decision.");nonempty(d.deviceKey,"row device scope",1000);integer(d.rowIndex,"original row index",0,ROW_LIMIT-1);
    const key=keyOf(d.deviceKey,d.rowIndex);fail(!provided.has(key),"Each original physical row has one current decision.");provided.set(key,d);
  }
  const add=(code,detail,row=null,extra={})=>findings.push({code,detail,rowId:row?.rowId||null,...extra});
  for(let bindingIndex=0;bindingIndex<content.bindings.length;bindingIndex++) {
    const binding=content.bindings[bindingIndex],intake=intakeOf(state,binding.intakeId),config=configurationOf(s,binding.configurationId);
    const configValue=config.inspection.value,driver=plain(configValue)?configValue.driver_config:null;
    for(const issue of config.inspection.issues)add(issue.code,"Resolve the exact original configuration ambiguity.",null,{deviceKey:binding.deviceKey,...issue});
    if(!plain(configValue)||configValue.driver_type!=="bacnet"||!plain(driver))add("CONFIGURATION_DRIVER","Select a BACnet device configuration with its original driver_config.",null,{deviceKey:binding.deviceKey});
    if(!plain(driver)||typeof driver.device_address!=="string"||!driver.device_address.trim()||!Number.isSafeInteger(driver.device_id)||driver.device_id<0)add("CONFIGURATION_IDENTITY","Retain the exact device address and integer device ID.",null,{deviceKey:binding.deviceKey});
    const registryRef=plain(configValue)?configValue.registry_config:null;
    if(typeof registryRef!=="string"||registryRef.split(/[\/\\]/).at(-1)!==binding.registryName)add("CONFIGURATION_REGISTRY","The unchanged device configuration must select the named registry file.",null,{deviceKey:binding.deviceKey,reference:registryRef??null});
    const headings=binding.columns.map(c=>c.header),missing=VOLTTRON_REQUIRED.filter(h=>!headings.includes(h));
    for(const header of missing)add("REQUIRED_HEADING","The selected target lacks "+header+".",null,{deviceKey:binding.deviceKey,header});
    const outputRows=[];
    for(let rowIndex=0;rowIndex<intake.rows.length;rowIndex++) {
      const rawCells=intake.rows[rowIndex],rowId=digest({deviceKey:binding.deviceKey,intakeId:intake.id,rowIndex});
      const row={rowId,deviceKey:binding.deviceKey,configurationId:binding.configurationId,intakeId:intake.id,sourceSha256:intake.assetId,rowIndex,physicalEndLine:intake.rowEndLines[rowIndex],sourceColumns:clone(intake.columns),rawCells:clone(rawCells),outcome:"unresolved",reason:"",changes:[],cells:[],values:{}};
      const key=keyOf(binding.deviceKey,rowIndex),decision=provided.get(key);provided.delete(key);
      const cells=binding.columns.map(column=>column.sourceIndex===null?{present:true,value:column.constant}:originalCell(rawCells,column.sourceIndex));
      if(decision) {
        fail(["include","exclude","unresolved"].includes(decision.outcome),"Choose include, exclude or unresolved for each original row.");
        nonempty(decision.reason,"physical-row decision reason",16000);list(decision.changes,"field changes",256);
        row.outcome=decision.outcome;row.reason=decision.reason;const changed=new Set();
        for(const change of decision.changes) {
          integer(change.columnIndex,"target column index",0,cells.length-1);fail(!changed.has(change.columnIndex),"Each target column has one exact before/after change.");changed.add(change.columnIndex);
          validCell(change.before);validCell(change.after);fail(digest(change.before)===digest(cells[change.columnIndex]),"A field change must match its exact original mapped cell, including absence.");
          nonempty(change.rule,"explicit transformation rule");nonempty(change.evidence,"transformation source");
          const protectedField=CONTROL_FIELDS.has(headings[change.columnIndex]);
          if(protectedField){nonempty(change.approvedBy,"named control-setting reviewer",240);nonempty(change.approvalReference,"control-setting approval reference");}
          cells[change.columnIndex]=clone(change.after);row.changes.push({...clone(change),header:headings[change.columnIndex],protectedField});
        }
      }
      row.cells=cells.map(clone);row.values=Object.fromEntries(headings.flatMap((h,i)=>cells[i].present?[[h,cells[i].value]]:[]));
      row.lineage=binding.columns.map((c,i)=>({targetColumnIndex:i,targetHeader:c.header,sourceColumnIndex:c.sourceIndex,sourceHeader:c.sourceIndex===null?null:intake.columns[c.sourceIndex],sourceCell:c.sourceIndex===null?null:originalCell(rawCells,c.sourceIndex),targetCell:clone(cells[i])}));
      rows.push(row);
      if(row.outcome==="unresolved"){add("ROW_UNRESOLVED","Retain and decide this complete original physical row.",row);continue;}
      if(row.outcome==="exclude")continue;
      if(rawCells.length>intake.columns.length)add("UNHEADED_SOURCE_CELLS","The original row contains cells beyond the retained headings; preserve and resolve them.",row);
      const values=row.values;
      for(const field of ["Volttron Point Name","BACnet Object Type","Property","Writable","Index"]) if(typeof values[field]!=="string"||!values[field].trim())add("REQUIRED_CELL","Supply the exact "+field+" target value.",row,{field});
      if(own(values,"Writable")&&!["true","false"].includes(values.Writable.toLowerCase()))add("WRITABLE_VALUE","Use a reviewed true/false literal without surrounding whitespace.",row);
      if(own(values,"BACnet Object Type")&&!BACNET_OBJECT_TYPES.has(values["BACnet Object Type"]))add("UNSUPPORTED_OBJECT_TYPE","The selected9.0.4 driver supports the nine retained standard numeric/boolean object types.",row);
      if(own(values,"Index")&&!/^\d+$/.test(values.Index))add("OBJECT_INDEX","Preserve an explicit nonnegative integer BACnet object identifier.",row);
      if(own(values,"Index")&&(!Number.isSafeInteger(Number(values.Index))||Number(values.Index)>4194303))add("OBJECT_INDEX_RANGE","The BACnet object instance must be within 0–4194303.",row);
      if(own(values,"Write Priority")&&values["Write Priority"].trim()!==""&&(!/^[+]?\d+$/.test(values["Write Priority"].trim())||Number(values["Write Priority"])<1||Number(values["Write Priority"])>16))add("WRITE_PRIORITY","The selected write priority must be 1–16, or explicitly blank.",row);
      const effectivePriority=values["Write Priority"]===undefined||values["Write Priority"].trim()===""?16:Number(values["Write Priority"]);
      const minimum=plain(driver)&&own(driver,"min_priority")?driver.min_priority:8;
      if(!Number.isSafeInteger(minimum)||minimum<1||minimum>16)add("DEVICE_MIN_PRIORITY","Review the complete device minimum write priority.",row);
      else if(Number.isFinite(effectivePriority)&&effectivePriority<minimum)add("WRITE_PRIORITY_BELOW_DEVICE_MINIMUM","The requested point priority conflicts with the unchanged device minimum.",row);
      if(own(values,"COV Flag")&&!["","true","false"].includes(values["COV Flag"].toLowerCase()))add("COV_FLAG","Choose an explicit documented boolean COV flag or retain a blank.",row);
      if(own(values,"Array Index")&&values["Array Index"].trim()!==""&&(!/^[+]?\d+$/.test(values["Array Index"].trim())||!Number.isSafeInteger(Number(values["Array Index"]))))add("ARRAY_INDEX","Retain a valid explicit nonnegative array index or blank.",row);
      row.effectiveDefaults={writePriority:effectivePriority,minimumWritePriority:minimum,covSubscription:typeof values["COV Flag"]==="string"&&values["COV Flag"].toLowerCase()==="true",writePriorityEvidence:"Documented BACnet default16 when omitted; native proxy omits request.priority",maxPerRequest:plain(driver)&&own(driver,"max_per_request")?driver.max_per_request:24};
      outputRows.push(cells.map(c=>c.present?c.value:""));
      expected.push({rowId,deviceKey:binding.deviceKey,pointName:values["Volttron Point Name"]??null,values:Object.fromEntries(headings.flatMap((h,i)=>[...VOLTTRON_REQUIRED,...VOLTTRON_OPTIONAL].includes(h)?[[h,cells[i].present?cells[i].value:""]]:[])),comparisonBasis:"Exact serialized target CSV fields; source cell absence remains in complete row lineage"});
    }
    if(outputRows.length===0)advisories.push({code:"EMPTY_DEVICE_REGISTRY",deviceKey:binding.deviceKey,detail:"Every physical row is excluded or unresolved; a header-only registry does not establish a commissioned device."});
    const contentText=targetCsv(headings,outputRows);
    files.push(file("registry-"+String(bindingIndex+1).padStart(2,"0")+"-"+binding.registryName,contentText,"text/csv",{deviceKey:binding.deviceKey,targetReference:registryRef??null,kind:"registry",sourceSha256:intake.assetId}));
    files.push(file("configuration-"+String(bindingIndex+1).padStart(2,"0")+"-"+config.name,base64(config.base64,1024*1024),"application/json",{deviceKey:binding.deviceKey,kind:"configuration",sourceSha256:config.sha256}));
  }
  fail(provided.size===0,"A decision refers to a row outside this exact source/profile selection.");
  const identities=new Map();for(const item of expected){const key=canonical([item.deviceKey,item.pointName]),prior=identities.get(key);if(prior){add("DUPLICATE_POINT_IDENTITY","Retain and resolve duplicate point names within the same exact device scope.",null,{deviceKey:item.deviceKey,pointName:item.pointName,rowIds:[prior.rowId,item.rowId]});}else identities.set(key,item);}
  const objects=new Map(),covScopes=new Map();
  for(const row of rows.filter(r=>r.outcome==="include")){
    const v=row.values,objectTuple=[v["BACnet Object Type"],v.Index===undefined?null:String(Number(v.Index)),v.Property,v["Array Index"]===undefined||v["Array Index"].trim()===""?null:String(Number(v["Array Index"]))];
    const k=canonical([row.deviceKey,...objectTuple]),prior=objects.get(k);
    if(prior)add("DUPLICATE_OBJECT_BINDING","Multiple names for one physical tuple can overwrite the BACnet read-multiple reverse map.",row,{otherRowId:prior.rowId,objectTuple});else objects.set(k,row);
    if(row.effectiveDefaults.covSubscription){
      const config=configurationOf(s,row.configurationId).inspection.value,proxy=config?.driver_config?.proxy_address||"platform.bacnet_proxy";
      const covKey=canonical([proxy,v["Volttron Point Name"],objectTuple[0],objectTuple[1]]),other=covScopes.get(covKey);
      if(other&&other.deviceKey!==row.deviceKey)advisories.push({code:"COV_CROSS_DEVICE_CONTEXT",rowId:row.rowId,otherRowId:other.rowId,detail:"VOLTTRON9.0.4 proxy matches existing COV contexts without device address; independently verify subscriptions on the selected target."});else covScopes.set(covKey,row);
    }
  }
  const manifest=files.map(({base64:omitted,...metadata})=>metadata);
  return {format:"commons.haystack.volttron-review.v1",profileId:version.profileId,profileVersionId:version.id,mode:content.mode,target:clone(content.target),
    rows,findings,advisories,expected,files,manifest,manifestSha256:digest(manifest),
    counts:{physicalRows:rows.length,included:rows.filter(r=>r.outcome==="include").length,excluded:rows.filter(r=>r.outcome==="exclude").length,unresolved:rows.filter(r=>r.outcome==="unresolved").length,findings:findings.length,configurations:content.bindings.length},
    targetReady:findings.length===0,configurationChanges:0};
}
function editionOf(state, editionId) {
  const s=stateOf(state);fail(s,"This workspace has no registry editions.");return find(s.editions,hash(editionId),"frozen registry edition");
}
function editionReview(state, edition) {
  const {version}=profileVersion(state,edition.profileId,edition.profileVersionId),review=assess(state,version,edition.decisions);
  fail(digest(review)===edition.reviewSha256,"The frozen complete registry projection changed.");return review;
}
function compareEditions(state, before, after) {
  const left=editionReview(state,before),right=editionReview(state,after),changes=[],map=new Map(left.rows.map(r=>[r.rowId,r]));
  for(const row of right.rows){const prior=map.get(row.rowId);map.delete(row.rowId);if(!prior||digest(prior)!==digest(row))changes.push({rowId:row.rowId,kind:prior?"changed":"added",before:prior||null,after:row});}
  for(const row of map.values())changes.push({rowId:row.rowId,kind:"removed",before:row,after:null});
  return {beforeEditionId:before.id,afterEditionId:after.id,profileChanged:before.profileVersionId!==after.profileVersionId,rows:changes,counts:{before:left.counts,after:right.counts},files:{before:left.manifest,after:right.manifest}};
}
function receivingResult(state, edition, evidence) {
  const review=editionReview(state,edition);
  fail(plain(evidence)&&["engineering","actual"].includes(evidence.mode),"Identify the original receiving evidence mode.");
  fail(evidence.mode!=="actual"||review.mode==="commissioning","Actual receiving must select an explicitly commissioned profile.");
  fail(["passed","failed","interrupted"].includes(evidence.outcome),"Retain the observed process outcome.");
  fail(evidence.inputManifestSha256===review.manifestSha256,"The observed input manifest differs from the selected exact edition.");
  for(const k of ["product","version","build","environment","operationId"])nonempty(evidence[k],"observed "+k);
  for(const k of ["startedAt","endedAt"]){nonempty(evidence[k],"observed "+k);fail(/T.*(?:Z|[+-]\d\d:\d\d)$/.test(evidence[k])&&Number.isFinite(Date.parse(evidence[k])),"Record complete timestamps with an explicit offset.");}
  fail(Date.parse(evidence.endedAt)>=Date.parse(evidence.startedAt),"Receiving end time precedes its start.");
  for(const k of ["product","version","build","environment"])fail(evidence[k]===review.target[k],"The receiving "+k+" differs from the selected target contract.");
  list(evidence.outputs,"complete returned output files",100);fail(evidence.outputs.length>0,"Retain the complete returned output files.");
  unique(evidence.outputs,"name","receiving output");
  const outputs=evidence.outputs.map(output=>file(safeName(output.name),base64(output.base64,32*1024*1024),"application/octet-stream"));
  fail(outputs.reduce((n,o)=>n+o.bytes,0)<=64*1024*1024,"The complete retained receiving outputs exceed 64 MiB.");
  list(evidence.observations,"all observed physical points",10000);
  const observed=new Map(),expected=new Map(review.expected.map(r=>[canonical([r.deviceKey,r.pointName]),r])),missing=[],extra=[],duplicates=[],mismatches=[];
  evidence.observations.forEach((observation,index)=>{
    fail(plain(observation)&&plain(observation.values),"Preserve every observed point and its exact returned values.");
    nonempty(observation.deviceKey,"observed device scope",1000);nonempty(observation.pointName,"observed point identity",65536);
    nonempty(observation.locator,"original output row/reference");fail(outputs.some(o=>o.name===observation.outputName),"Bind each observation to its retained original output.");
    for(const [k,v] of Object.entries(observation.values)){nonempty(k,"observed field",65536);text(v,"observed literal field text",1048576);}
    const key=canonical([observation.deviceKey,observation.pointName]);if(observed.has(key))duplicates.push({deviceKey:observation.deviceKey,pointName:observation.pointName,observationIndexes:[observed.get(key).index,index]});else observed.set(key,{index,observation});
    const desired=expected.get(key);if(!desired){extra.push({index,deviceKey:observation.deviceKey,pointName:observation.pointName});return;}
    for(const field of [...VOLTTRON_REQUIRED,...VOLTTRON_OPTIONAL]){const expectedCell=own(desired.values,field)?{present:true,value:desired.values[field]}:{present:false},observedCell=own(observation.values,field)?{present:true,value:observation.values[field]}:{present:false};if(digest(expectedCell)!==digest(observedCell))mismatches.push({rowId:desired.rowId,index,field,expected:expectedCell,observed:observedCell});}
  });
  for(const [key,row] of expected)if(!observed.has(key))missing.push({rowId:row.rowId,deviceKey:row.deviceKey,pointName:row.pointName});
  return {editionId:edition.id,inputManifestSha256:review.manifestSha256,mode:evidence.mode,processOutcome:evidence.outcome,
    missing,extra,duplicates,mismatches,outputs,observedRows:evidence.observations.length,expectedRows:review.expected.length,
    deviceCoverage:profileVersion(state,edition.profileId,edition.profileVersionId).version.content.bindings.map(b=>({deviceKey:b.deviceKey,expectedRows:review.expected.filter(r=>r.deviceKey===b.deviceKey).length,observedRows:evidence.observations.filter(r=>r.deviceKey===b.deviceKey).length})),
    comparisonOutcome:review.expected.length===0?"no_points":evidence.outcome!=="passed"?"process_incomplete":missing.length||extra.length||duplicates.length||mismatches.length||!review.targetReady?"differences":"matched",
    receivingMatches:review.expected.length>0&&evidence.outcome==="passed"&&review.targetReady&&missing.length===0&&extra.length===0&&duplicates.length===0&&mismatches.length===0};
}
export function applyVolttronAction(state, action, args) {
  const s=stateOf(state,true);
  if(action==="volttron.configuration.import") {
    const raw=base64(args.base64,1024*1024);fail(raw.length>0,"Retain the complete original configuration.");safeName(args.name);
    const decoded=new TextDecoder("utf-8",{fatal:true}).decode(raw);inspectJson(decoded);
    const entry=record({format:"commons.haystack.volttron-configuration.v1",name:args.name,bytes:raw.length,sha256:sha256(raw),base64:raw.toString("base64"),...stamp(args)});
    s.configurations.push(entry);return {configurationId:entry.id,configuration:configurationOf(s,entry.id)};
  }
  if(action==="volttron.profile.save") {
    validateProfile(state,args.content);const profileId=id(args.profileId||args.operationId),prior=s.profiles.find(p=>p.id===profileId);
    if(prior)fail(args.expectedHeadId===prior.headId,"Save against the exact opened profile head.");else fail(args.expectedHeadId===undefined||args.expectedHeadId===null,"A new profile has no prior head.");
    const version=record({format:"commons.haystack.volttron-profile-version.v1",profileId,parents:prior?[prior.headId]:[],content:clone(args.content),...stamp(args)});
    s.versions.push(version);if(prior)prior.headId=version.id;else s.profiles.push({id:profileId,headId:version.id});
    return {profileId,versionId:version.id,profile:clone(version)};
  }
  if(action==="volttron.edition.save") {
    const {profile,version}=profileVersion(state,args.profileId,args.profileVersionId);fail(profile.headId===version.id,"Freeze the reviewed current profile head.");
    if(args.parentEditionId){const parent=editionOf(state,args.parentEditionId);fail(parent.profileId===profile.id,"The preceding edition belongs to another profile.");}
    const review=assess(state,version,args.decisions);
    fail(args.decisions.length===review.rows.length,"Record an explicit decision for every original physical row.");
    const edition=record({format:"commons.haystack.volttron-edition.v1",profileId:profile.id,profileVersionId:version.id,parentEditionId:args.parentEditionId||null,decisions:clone(args.decisions),reviewSha256:digest(review),manifestSha256:review.manifestSha256,...stamp(args)});
    s.editions.push(edition);return {editionId:edition.id,edition:clone(edition),review};
  }
  if(action==="volttron.receiving.record") {
    const edition=editionOf(state,args.editionId),evidence=clone(args.evidence);
    if(evidence.supersedesReceivingId){const prior=find(s.receivings,hash(evidence.supersedesReceivingId),"prior receiving");fail(editionOf(state,prior.editionId).profileId===edition.profileId,"A receiving successor belongs to the same profile.");}
    const result=receivingResult(state,edition,evidence),entry=record({format:"commons.haystack.volttron-receiving.v1",editionId:edition.id,evidence,result,...stamp(args)});
    s.receivings.push(entry);return {receivingId:entry.id,receiving:clone(entry)};
  }
  fail(false,"Use a declared VOLTTRON mutation.");
}
export function readVolttronAction(state, action, args) {
  if(action==="volttron.status")return volttronSummary(state);
  const s=stateOf(state);fail(s,"This workspace has no retained VOLTTRON work.");
  if(action==="volttron.configuration.read")return {configuration:configurationOf(s,args.configurationId)};
  if(action==="volttron.profile.template") {
    const intake=intakeOf(state,args.intakeId);configurationOf(s,args.configurationId);nonempty(args.deviceKey,"selected device scope",1000);
    return {content:{title:"Registry review",buildingReference:"",mode:"commissioning",target:{product:"VOLTTRON",version:"",build:"",driverRelease:"",interfaceName:"BACnet CSV registry",documentationUrl:"https://volttron.readthedocs.io/en/latest/agent-framework/driver-framework/bacnet/bacnet-driver.html",environment:"",receivingMethod:"",selectionReference:""},
      bindings:[{deviceKey:args.deviceKey,intakeId:intake.id,configurationId:args.configurationId,registryName:intake.name,columns:intake.columns.map((header,sourceIndex)=>({header,sourceIndex})),omissions:[],approvalReference:""}]},
      source:{intakeId:intake.id,sha256:intake.assetId,columns:clone(intake.columns),physicalRows:intake.rows.length},unselected:true};
  }
  if(action==="volttron.profile.read"){const {profile,version}=profileVersion(state,args.profileId,args.versionId);return {profile:clone(profile),version:clone(version),history:clone(s.versions.filter(v=>v.profileId===profile.id))};}
  if(action==="volttron.edition.preview"){const {version}=profileVersion(state,args.profileId,args.profileVersionId);return {review:assess(state,version,args.decisions||[])};}
  if(action==="volttron.edition.read"){const edition=editionOf(state,args.editionId);return {edition:clone(edition),review:editionReview(state,edition),receivings:clone(s.receivings.filter(r=>r.editionId===edition.id))};}
  if(action==="volttron.edition.compare")return compareEditions(state,editionOf(state,args.beforeEditionId),editionOf(state,args.afterEditionId));
  if(action==="volttron.receiving.read")return {receiving:clone(find(s.receivings,hash(args.receivingId),"complete receiving result"))};
  fail(false,"Use a declared VOLTTRON read action.");
}
export function validateVolttronState(state) {
  const s=stateOf(state);if(s===undefined)return state;
  fail(plain(s)&&s.format===VOLTTRON_FORMAT,"Retain the supported complete VOLTTRON workspace history.");
  for(const key of ["configurations","profiles","versions","editions","receivings","returns"]){list(s[key],"registry "+key,10000);unique(s[key],"id",key);}
  for(const row of s.configurations)configurationOf(s,row.id);
  for(const version of s.versions){
    fail(version.id===digest(bodyOf(version)),"The complete profile version changed.");id(version.profileId);list(version.parents,"profile ancestry",2);fail(new Set(version.parents).size===version.parents.length,"Profile ancestry repeats a parent.");validateProfile(state,version.content);
    for(const parentId of version.parents){const parent=find(s.versions,parentId,"profile parent");fail(parent.profileId===version.profileId&&parent.id!==version.id,"A profile version loses its original ancestry.");}
  }
  const colors=new Map();function visit(v){fail(colors.get(v.id)!==1,"Profile history contains a cycle.");if(colors.get(v.id)===2)return;colors.set(v.id,1);for(const p of v.parents)visit(find(s.versions,p,"profile parent"));colors.set(v.id,2);}for(const v of s.versions)visit(v);
  for(const profile of s.profiles){id(profile.id);fail(find(s.versions,profile.headId,"profile head").profileId===profile.id,"A current profile points to another history.");}
  for(const edition of s.editions){
    fail(edition.id===digest(bodyOf(edition)),"The complete frozen registry edition changed.");const review=editionReview(state,edition);fail(edition.manifestSha256===review.manifestSha256&&edition.decisions.length===review.rows.length,"The edition lost a complete row decision or file manifest.");
    if(edition.parentEditionId){const parent=find(s.editions,edition.parentEditionId,"previous registry edition");fail(parent.profileId===edition.profileId&&parent.id!==edition.id,"An edition loses its original profile ancestry.");}
  }
  const editions=new Map(s.editions.map(e=>[e.id,e]));for(const root of s.editions){const seen=new Set();let current=root;while(current){fail(!seen.has(current.id),"Registry edition history contains a cycle.");seen.add(current.id);current=current.parentEditionId?editions.get(current.parentEditionId):null;}}
  for(const receiving of s.receivings){fail(receiving.id===digest(bodyOf(receiving)),"The complete receiving record changed.");const edition=editionOf(state,receiving.editionId);fail(digest(receiving.result)===digest(receivingResult(state,edition,receiving.evidence)),"The retained original receiving comparison differs.");if(receiving.evidence.supersedesReceivingId)find(s.receivings,receiving.evidence.supersedesReceivingId,"superseded receiving");}
  for(const returned of s.returns){fail(returned.id===digest(bodyOf(returned)),"The complete returned-profile decision changed.");for(const outcome of returned.outcomes)find(s.versions,outcome.headId,"kept or adopted profile version");}
  return state;
}
export function previewVolttronReturn(state,verified) {
  fail(verified?.state?.workspaceId===state.workspaceId,"Receive a complete package from this original workspace.");
  validateVolttronState(verified.state);const incoming=stateOf(verified.state),local=stateOf(state);
  fail(incoming&&incoming.profiles.length,"The complete returned package contains no registry profile.");
  return {workspaceId:state.workspaceId,profiles:incoming.profiles.map(p=>{
    const left=local?.profiles.find(v=>v.id===p.id),right=find(incoming.versions,p.headId,"returned profile");
    return {profileId:p.id,localHeadId:left?.headId||null,incomingHeadId:right.id,same:left?.headId===right.id,local:left?clone(find(local.versions,left.headId,"local profile").content):null,incoming:clone(right.content)};
  }),incomingCounts:volttronSummary(verified.state)};
}
export function applyVolttronReturn(state,args,verified) {
  const preview=previewVolttronReturn(state,verified),incoming=verified.state.volttron,s=stateOf(state,true);
  list(args.decisions,"every returned profile decision",10000);unique(args.decisions,"profileId","returned-profile decision");
  fail(args.decisions.length===preview.profiles.length,"Choose KEEP or adopt for every returned profile.");
  for(const decision of args.decisions){const comparison=preview.profiles.find(p=>p.profileId===decision.profileId);fail(comparison&&["keep","adopt"].includes(decision.decision)&&decision.expectedLocalHeadId===comparison.localHeadId&&decision.expectedIncomingHeadId===comparison.incomingHeadId,"The complete returned decision must match both reviewed heads.");fail(decision.decision!=="keep"||comparison.localHeadId,"A new incoming profile must be explicitly adopted.");}
  // Share the maintained original semantic source storage; do not reconstruct CSV rows or source bytes.
  if(!state.semantics)state.semantics={format:"commons.haystack.semantic-work.v1",assets:[],intakes:[],contexts:[],models:[],versions:[],validations:[],reviews:[],returns:[]};
  const merge=(target,source,label)=>{for(const row of source){const prior=target.find(p=>p.id===row.id);if(prior)fail(digest(prior)===digest(row),"A returned "+label+" reuses an identity with changed content.");else target.push(clone(row));}};
  const intakeIds=new Set(incoming.versions.flatMap(v=>v.content.bindings.map(b=>b.intakeId)));
  const intakes=verified.state.semantics.intakes.filter(i=>intakeIds.has(i.id)),assetIds=new Set(intakes.map(i=>i.assetId));
  merge(state.semantics.assets,verified.state.semantics.assets.filter(a=>assetIds.has(a.id)),"original registry bytes");
  merge(state.semantics.intakes,intakes,"native-parsed source intake");
  for(const key of ["configurations","versions","editions","receivings","returns"])merge(s[key],incoming[key],key);
  const outcomes=[];
  for(const decision of args.decisions){
    const incomingProfile=find(incoming.profiles,decision.profileId,"returned profile"),local=s.profiles.find(p=>p.id===decision.profileId);
    if(!local)s.profiles.push(clone(incomingProfile));
    else if(decision.decision==="adopt"&&local.headId!==incomingProfile.headId){
      const selected=find(s.versions,incomingProfile.headId,"adopted profile version");
      const merged=record({format:selected.format,profileId:selected.profileId,parents:[local.headId,incomingProfile.headId],content:clone(selected.content),...stamp(args)});
      s.versions.push(merged);local.headId=merged.id;
    }
    outcomes.push({...clone(decision),headId:find(s.profiles,decision.profileId,"resulting profile").headId});
  }
  const returned=record({format:"commons.haystack.volttron-return.v1",sourcePackageSha256:hash(verified.packageSha256,"original returned package SHA-256"),outcomes,...stamp(args)});
  s.returns.push(returned);validateVolttronState(state);return {return:clone(returned),summary:volttronSummary(state)};
}

export function volttronDelivery(state,args) {
  if(args.kind==="volttron-receiving-output") {
    const s=stateOf(state);fail(s,"This workspace has no registry receiving.");
    const receipt=find(s.receivings,hash(args.receivingId),"selected complete receiving");
    const output=receipt.result.outputs.find(f=>f.name===args.name);fail(output,"Select an exact retained receiving output.");
    return {bytes:base64(output.base64,32*1024*1024),name:output.name,mediaType:output.mediaType};
  }
  const edition=editionOf(state,args.registryEditionId),review=editionReview(state,edition);
  if(args.kind==="volttron-output") {
    fail(review.targetReady,"Resolve the retained registry findings before selecting a target import file; the complete review and workspace remain downloadable.");
    const output=review.files.find(f=>f.name===args.name);fail(output,"Select an exact frozen registry/configuration output.");
    return {bytes:base64(output.base64,32*1024*1024),name:output.name,mediaType:output.mediaType};
  }
  fail(args.kind==="volttron-report","Choose a complete registry report or exact retained output.");
  const format=args.format||"json";fail(["json","csv","html"].includes(format),"Choose JSON, CSV or HTML for the complete registry review.");
  const result={workspaceId:state.workspaceId,workspaceRevision:state.revision,edition:clone(edition),review,
    receivingRecords:clone(state.volttron.receivings.filter(r=>r.editionId===edition.id))};
  const name="volttron-"+edition.id.slice(0,16);
  if(format==="json")return {bytes:Buffer.from(JSON.stringify(result,null,2)+"\n"),name:name+".json",mediaType:"application/json"};
  if(format==="csv"){
    const headers=["row_id","device_scope","intake_id","source_sha256","physical_row_index","physical_end_line","decision","reason","original_headings","original_cells","projected_cells","field_lineage","changes"];
    const clean=value=>{const s=typeof value==="string"?value:JSON.stringify(value);return /^[\s]*[=+\-@\t\r]/.test(s)?"'"+s:s;};
    const rows=review.rows.map(r=>[r.rowId,r.deviceKey,r.intakeId,r.sourceSha256,r.rowIndex,r.physicalEndLine,r.outcome,r.reason,r.sourceColumns,r.rawCells,r.cells,r.lineage,r.changes].map(clean));
    return {bytes:Buffer.from(targetCsv(headers,rows)),name:name+".csv",mediaType:"text/csv"};
  }
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const table=(headers,rows)=>"<div class=\"scroll\"><table><thead><tr>"+headers.map(h=>"<th>"+esc(h)+"</th>").join("")+"</tr></thead><tbody>"+rows.map(row=>"<tr>"+row.map(c=>"<td>"+c+"</td>").join("")+"</tr>").join("")+"</tbody></table></div>";
  const content="<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Registry review</title><style>body{font:15px/1.5 system-ui;color:#202124;background:#fff;margin:32px;max-width:1400px}h1{font-size:28px}.meta,pre{font:12px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}pre{white-space:pre-wrap}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{padding:10px;border:1px solid #ddd;text-align:left;vertical-align:top}th{background:#f2f2f2}summary{cursor:pointer}small{color:#555}</style><h1>Registry review</h1><p>"+esc(review.mode)+" · "+esc(review.counts.physicalRows)+" physical rows · "+esc(review.targetReady?"Ready for selected target receiving":"Review findings")+" </p><p class=\"meta\">Workspace "+esc(state.workspaceId)+"<br>Edition "+esc(edition.id)+"<br>Source profile "+esc(edition.profileVersionId)+"<br>Target manifest "+esc(review.manifestSha256)+"</p><h2>Target and source selection</h2><pre>"+esc(JSON.stringify(review.target,null,2))+"</pre><h2>Findings</h2>"+
    table(["Code","Original row","Detail"],review.findings.concat(review.advisories).map(f=>[esc(f.code),esc(f.rowId||"Device/profile"),esc(f.detail)]))+
    "<h2>All original physical rows</h2>"+table(["Device / row","Decision","Original and projected source"],review.rows.map(r=>[esc(r.deviceKey)+"<br>"+esc(r.rowIndex)+"<small> · physical line "+esc(r.physicalEndLine)+"</small>",esc(r.outcome)+"<br>"+esc(r.reason),"<details><summary>Complete original, field lineage and changes</summary><pre>"+esc(JSON.stringify(r,null,2))+"</pre></details>"]))+
    "<h2>Complete output inventory</h2>"+table(["File","Bytes","SHA-256","Original reference"],review.manifest.map(f=>[esc(f.name),esc(f.bytes),"<span class=\"meta\">"+esc(f.sha256)+"</span>",esc(f.targetReference||f.sourceSha256)]))+
    "<h2>Retained receiving results</h2><pre>"+esc(JSON.stringify(result.receivingRecords,null,2))+"</pre></html>";
  return {bytes:Buffer.from(content),name:name+".html",mediaType:"text/html"};
}
