const clone = value => JSON.parse(JSON.stringify(value));
export const PROJECT_SCHEMA = "tjlabs.loaded-bikes-project.v1";
const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
export function newProject(capture,review,{id,title="Loaded Bikes catalogue migration",at=new Date().toISOString(),claims=null}={}) {
  if(!id) throw Error("A project ID is required");
  return {schema:PROJECT_SCHEMA,id,title,createdAt:at,updatedAt:at,revision:0,capture:clone(capture),review:clone(review),claims:claims?clone(claims):null,issueDecisions:[],history:[]};
}
export function validateProject(value) {
  if(value?.schema!==PROJECT_SCHEMA||typeof value.id!=="string"||!value.id||typeof value.title!=="string") throw Error("Choose a complete Loaded Bikes review project");
  if(value.capture?.schema!=="tjlabs.loaded-bikes.catalogue-capture.v1"||!Array.isArray(value.capture.responses)) throw Error("The project is missing its original catalogue");
  if(value.claims&&value.claims.schema!=="tjlabs.loaded-bikes.source-claims.v1")throw Error("The source relationship inventory is invalid");
  if(value.review?.schema!=="tjlabs.loaded-bikes-review.v1"||!Array.isArray(value.review.tables)||!Array.isArray(value.review.corrections)) throw Error("The project is missing its reviewed mapping");
  if(!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.history)||!Array.isArray(value.issueDecisions)) throw Error("The project revision history is invalid");
  if(value.history.length!==value.revision) throw Error("Project history does not match its saved revision");
  for(let i=0;i<value.history.length;i++) if(value.history[i].revision!==i+1) throw Error("Project history has a missing or reordered revision");
  const tables=new Set(), targets=new Set();
  for(const table of value.review.tables){
    if(tables.has(table.sourceTable)||targets.has(table.tableName)) throw Error("Source and destination tables must be unique");
    tables.add(table.sourceTable);targets.add(table.tableName);
    if(!Array.isArray(table.columns)||!Array.isArray(table.primaryKey)||!table.primaryKey.length) throw Error("Every table requires mapped columns and a primary key");
    const cols=new Set();
    for(const column of table.columns){if(cols.has(column.name))throw Error("Destination column names must be unique");cols.add(column.name);}
    if(table.primaryKey.some(key=>!cols.has(key)))throw Error("A destination key is missing from its table");
  }
  const active=new Set();
  for(const correction of value.review.corrections){
    const identity=correctionIdentity(correction);
    if(active.has(identity))throw Error("The project contains competing active corrections");active.add(identity);
    if(!correction.reviewer?.trim()||!correction.reason?.trim()||!own(correction,"previousValue")||!own(correction,"value"))throw Error("Every correction requires its original value, reviewer and reason");
  }
  return clone(value);
}
export function revise(project,{kind,reviewer,reason,details,at=new Date().toISOString()},mutate){
  if(!reviewer?.trim()||!reason?.trim())throw Error("Enter your name and the reason for this change");
  const next=clone(project);mutate(next);next.revision++;next.updatedAt=at;
  next.history.push({revision:next.revision,at,kind,reviewer:reviewer.trim(),reason:reason.trim(),details:clone(details)});
  return validateProject(next);
}
export function correctionIdentity(correction){
  const keys=Object.keys(correction.sourceKey||{}).sort();
  return JSON.stringify([correction.table,keys.map(key=>[key,correction.sourceKey[key]]),correction.column]);
}
export function setCorrection(project,correction){
  if(!correction.sourceKey||!Object.keys(correction.sourceKey).length)throw Error("Select the original source row");
  return revise(project,{kind:"cell-correction",reviewer:correction.reviewer,reason:correction.reason,details:correction},next=>{
    const identity=correctionIdentity(correction),index=next.review.corrections.findIndex(item=>correctionIdentity(item)===identity);
    if(index<0)next.review.corrections.push(clone(correction));else next.review.corrections[index]=clone(correction);
  });
}
export function removeCorrection(project,correction,{reviewer,reason}){
  return revise(project,{kind:"restore-source-value",reviewer,reason,details:correction},next=>{
    const identity=correctionIdentity(correction);
    next.review.corrections=next.review.corrections.filter(item=>correctionIdentity(item)!==identity);
  });
}
export function setIssueDecision(project,{issueId,disposition,reviewer,reason,at=new Date().toISOString()}){
  if(!["open","keep-source","resolved-by-correction","needs-customer-input"].includes(disposition))throw Error("Unknown review decision");
  return revise(project,{kind:"issue-decision",reviewer,reason,at,details:{issueId,disposition}},next=>{
    const decision={issueId,disposition,reviewer:reviewer.trim(),reason:reason.trim(),at};
    const index=next.issueDecisions.findIndex(item=>item.issueId===issueId);
    if(index<0)next.issueDecisions.push(decision);else next.issueDecisions[index]=decision;
  });
}
export function mappingChange(project,sourceTable,mapping,{reviewer,reason}){
  return revise(project,{kind:"destination-mapping",reviewer,reason,details:{sourceTable,before:project.review.tables.find(t=>t.sourceTable===sourceTable),after:mapping}},next=>{
    const index=next.review.tables.findIndex(table=>table.sourceTable===sourceTable);if(index<0)throw Error("Unknown source table");next.review.tables[index]=clone(mapping);
  });
}
export function csvText(table){
  const columns=table.columns.map(column=>typeof column==="string"?column:column.name);
  const cell=value=>{if(value===null||value===undefined)return "";const text=typeof value==="object"?JSON.stringify(value):String(value);return /[",\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;};
  return columns.map(cell).join(",")+"\r\n"+table.rows.map(row=>columns.map(name=>cell(row[name])).join(",")).join("\r\n")+"\r\n";
}
export function downloadBytes(name,bytes,type="application/octet-stream"){
  const url=URL.createObjectURL(new Blob([bytes],{type}));const anchor=document.createElement("a");
  anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
const CRC_TABLE=(()=>{const result=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;result[n]=c>>>0;}return result;})();
function crc32(bytes){let c=0xffffffff;for(const byte of bytes)c=CRC_TABLE[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
export function zipStore(files){
  const enc=new TextEncoder(),parts=[],central=[];let offset=0,total=0;
  const u16=(view,at,n)=>view.setUint16(at,n,true),u32=(view,at,n)=>view.setUint32(at,n,true);
  for(const file of files){
    if(!file.path||file.path.startsWith("/")||file.path.includes("\\")||file.path.split("/").some(p=>p===".."||!p))throw Error("Invalid package path");
    const name=enc.encode(file.path),bytes=typeof file.content==="string"?enc.encode(file.content):file.content;
    if(!(bytes instanceof Uint8Array)||bytes.length>0xffffffff)throw Error("Unsupported package member");
    const crc=crc32(bytes),header=new Uint8Array(30+name.length),view=new DataView(header.buffer);
    u32(view,0,0x04034b50);u16(view,4,20);u16(view,6,0x0800);u16(view,12,33);u32(view,14,crc);u32(view,18,bytes.length);u32(view,22,bytes.length);u16(view,26,name.length);header.set(name,30);
    parts.push(header,bytes);
    const index=new Uint8Array(46+name.length),iv=new DataView(index.buffer);
    u32(iv,0,0x02014b50);u16(iv,4,20);u16(iv,6,20);u16(iv,8,0x0800);u16(iv,14,33);u32(iv,16,crc);u32(iv,20,bytes.length);u32(iv,24,bytes.length);u16(iv,28,name.length);u32(iv,42,offset);index.set(name,46);central.push(index);
    offset+=header.length+bytes.length;total+=index.length;
  }
  if(files.length>65535||offset+total>0xffffffff)throw Error("Package exceeds ZIP32 limits");
  const tail=new Uint8Array(22),tv=new DataView(tail.buffer);u32(tv,0,0x06054b50);u16(tv,8,files.length);u16(tv,10,files.length);u32(tv,12,total);u32(tv,16,offset);
  const output=new Uint8Array(offset+total+tail.length);let pos=0;for(const part of [...parts,...central,tail]){output.set(part,pos);pos+=part.length;}return output;
}
