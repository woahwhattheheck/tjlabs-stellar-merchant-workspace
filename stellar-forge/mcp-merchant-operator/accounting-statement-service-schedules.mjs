// MIT. Saved service calendars over the original capture planner and closing cycles.
import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir,open,readFile,readdir,lstat,realpath,rename,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {compileAccountingStatementServicePlan,validateAccountingStatementServicePlan} from './accounting-statement-service-planner.mjs';

const PREFIX='stellar-forge.accounting-statement-service-schedules';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,SHA=/^[a-f0-9]{64}$/,DAY=86400000;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const copy=v=>structuredClone(v);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(code,message)=>Object.assign(new Error(message),{code:'SERVICE_SCHEDULE_'+code,status:409});
function need(ok,message,code='INPUT'){if(!ok)throw fail(code,message);}
function fields(value,allowed){need(plain(value)&&Object.keys(value).every(k=>allowed.includes(k)),'Use the documented calendar fields.');}
function integer(v,min,max){need(Number.isSafeInteger(v)&&v>=min&&v<=max,'Use an integer from '+min+' through '+max+'.');return v;}
function text(v,max,name){need(typeof v==='string'&&v.trim()&&v.length<=max,'Enter '+name+' up to '+max+' characters.');return v.trim();}
function dateValue(value){
  need(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),'Use a complete calendar date, YYYY-MM-DD.');
  const ms=Date.parse(value+'T00:00:00.000Z');
  need(Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value&&value>='1900-01-01'&&value<='9998-12-31',
    'Choose a valid calendar date from 1900 through 9998.');
  return ms;
}
function dateAt(ms){return new Date(ms).toISOString().slice(0,10);}
const atMidnight=value=>new Date(dateValue(value)).toISOString();
const periodKey=(id,from,until)=>id+':'+from+':'+until;
const sameInstant=(left,right)=>Number.isFinite(Date.parse(left))&&Date.parse(left)===Date.parse(right);

/** UTC civil dates. Month-end clamping always refers to the original anchor. */
export function serviceScheduleBoundary(definition,index){
  integer(index,0,1000000);
  const start=dateValue(definition.anchor),interval=integer(definition.interval,1,52);
  if(definition.cadence==='weekly')return dateAt(start+index*interval*7*DAY);
  need(definition.cadence==='monthly','Choose weekly or monthly service periods.');
  const anchor=new Date(start),month=anchor.getUTCMonth()+index*interval;
  const first=new Date(Date.UTC(anchor.getUTCFullYear(),month,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return dateAt(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(anchor.getUTCDate(),last)));
}
function normalizeDefinition(input){
  fields(input,['name','active','customerId','bindingId','periodIdentitySha256','orderRef','anchor','cadence','interval','dueDays','endDate','notes']);
  need(UUID.test(input.customerId??'')&&UUID.test(input.bindingId??'')&&SHA.test(input.periodIdentitySha256??''),
    'Select one original assigned customer and immutable purchased pass.');
  need(typeof input.orderRef==='string'&&input.orderRef.length>0&&input.orderRef.length<=4096,'Keep the original purchased order reference.');
  need(typeof input.active==='boolean','Choose whether this calendar is active.');
  dateValue(input.anchor);need(['weekly','monthly'].includes(input.cadence),'Choose weekly or monthly periods.');
  integer(input.interval,1,52);integer(input.dueDays,0,365);
  const endDate=input.endDate??null;
  if(endDate!==null)need(dateValue(endDate)>dateValue(input.anchor),'The final service date must follow the first opening.');
  const notes=input.notes??'';need(typeof notes==='string'&&notes.length<=4000,'Keep calendar notes within 4,000 characters.');
  return {name:text(input.name,200,'a calendar name'),active:input.active,customerId:input.customerId,bindingId:input.bindingId,
    periodIdentitySha256:input.periodIdentitySha256,orderRef:input.orderRef,anchor:input.anchor,cadence:input.cadence,
    interval:input.interval,dueDays:input.dueDays,endDate,notes};
}
function verifyVersion(value){
  need(plain(value)&&UUID.test(value.id??'')&&Number.isSafeInteger(value.version)&&value.version>0,'Use a complete saved calendar edition.','EDITION');
  const definition=normalizeDefinition(Object.fromEntries(['name','active','customerId','bindingId','periodIdentitySha256','orderRef','anchor','cadence','interval','dueDays','endDate','notes'].map(k=>[k,value[k]])));
  need(typeof value.savedAt==='string'&&Number.isFinite(Date.parse(value.savedAt))&&hash({id:value.id,version:value.version,savedAt:value.savedAt,...definition})===value.sha256,
    'The saved calendar edition differs from its content.','EDITION');
  return {...definition,id:value.id,version:value.version,savedAt:value.savedAt,sha256:value.sha256};
}
export function serviceSchedulePeriods(definition,{from,until,asOf=new Date().toISOString()}={}){
  definition=verifyVersion(definition);
  const lo=dateValue(from),hi=dateValue(until),now=Date.parse(asOf);
  need(hi>lo&&hi-lo<=3660*DAY&&Number.isFinite(now),'Choose an increasing calendar window of at most ten years.');
  const start=dateValue(definition.anchor),last=definition.endDate?dateValue(definition.endDate):Infinity,periods=[];
  const fromDate=new Date(lo),anchor=new Date(start);
  let index=definition.cadence==='weekly'?Math.max(0,Math.floor((lo-start)/(definition.interval*7*DAY))-1):
    Math.max(0,Math.floor(((fromDate.getUTCFullYear()-anchor.getUTCFullYear())*12+fromDate.getUTCMonth()-anchor.getUTCMonth())/definition.interval)-1);
  for(;;index++){
    const opening=dateValue(serviceScheduleBoundary(definition,index));
    if(opening>=hi||opening>=last)break;
    const closing=Math.min(dateValue(serviceScheduleBoundary(definition,index+1)),last);
    if(closing<=lo)continue;
    const due=closing+definition.dueDays*DAY,openingDate=dateAt(opening),closingDate=dateAt(closing);
    periods.push({id:periodKey(definition.id,openingDate,closingDate),scheduleId:definition.id,version:definition.version,index,
      name:definition.name,from:openingDate,until:closingDate,openingAt:new Date(opening).toISOString(),closingAt:new Date(closing).toISOString(),
      dueAt:new Date(due).toISOString(),timing:now<closing?'UPCOMING':now<due?'READY':dateAt(now)===dateAt(due)?'DUE':'OVERDUE'});
  }
  return periods;
}
function currentDefinitions(state){return state.definitions.map(row=>row.versions.at(-1));}
function rowFor(inventory,definition){return inventory.rows.find(row=>row.id===definition.bindingId+':'+definition.periodIdentitySha256&&
  row.customer.id===definition.customerId&&row.pass.orderRef===definition.orderRef);}
function periodFromTarget(state,target){
  need(plain(target)&&UUID.test(target.scheduleId??'')&&Number.isSafeInteger(target.version)&&Number.isSafeInteger(target.index),'Keep the original calendar, edition and period index.');
  const definition=state.definitions.find(d=>d.id===target.scheduleId)?.versions.find(v=>v.version===target.version);
  need(definition,'The saved calendar edition is unavailable. Import its complete calendar history.','EDITION');
  const from=serviceScheduleBoundary(definition,target.index),naturalUntil=serviceScheduleBoundary(definition,target.index+1);
  const until=definition.endDate&&definition.endDate<naturalUntil?definition.endDate:naturalUntil;
  need(until>from,'Choose a service period before the calendar ends.');
  return {definition,period:serviceSchedulePeriods(definition,{from,until,asOf:new Date().toISOString()})[0]};
}
function validateCatalogue(value,workspace,endpoint){
  need(plain(value)&&value.schema===PREFIX+'.v1'&&value.workspace===workspace&&value.endpoint===endpoint&&
    Number.isSafeInteger(value.revision)&&value.revision>=0&&Array.isArray(value.definitions),'Open this calendar catalogue in its original merchant workspace.','WORKSPACE');
  const seen=new Set();
  for(const row of value.definitions){
    need(UUID.test(row.id??'')&&!seen.has(row.id)&&Array.isArray(row.versions)&&row.versions.length>0,'Keep every calendar and its complete saved editions.','CATALOGUE');
    seen.add(row.id);
    row.versions.forEach((version,index)=>{verifyVersion(version);need(version.id===row.id&&version.version===index+1,'Keep consecutive saved calendar editions.','EDITION');
      need(['customerId','bindingId','periodIdentitySha256','orderRef'].every(key=>version[key]===row.versions[0][key]),
        'Keep the original customer assignment and purchased pass throughout this calendar history.','EDITION');});
  }
  return value;
}
function checkScheduledPlan(value,state){
  need(plain(value)&&value.schema===PREFIX+'-plan.v1','Use a complete saved scheduled service plan.','PLAN');
  const {sha256,...body}=value;need(SHA.test(sha256??'')&&hash(body)===sha256,'The scheduled plan differs from its complete content.','PLAN');
  validateAccountingStatementServicePlan(value.plan);
  need(value.workspace===state.workspace&&value.endpoint===state.endpoint&&value.plan.workspace===state.workspace&&
    (!value.plan.endpoint||value.plan.endpoint===state.endpoint)&&Array.isArray(value.targets)&&value.targets.length===value.plan.rows.length,
    'Prepare this scheduled plan with its original merchant.','WORKSPACE');
  const seen=new Set();
  value.targets.forEach((target,index)=>{
    const {definition,period}=periodFromTarget(state,target),row=value.plan.rows[index];
    need(target.periodId===period.id&&!seen.has(period.id)&&target.definitionSha256===definition.sha256&&target.name===definition.name&&
      target.from===period.from&&target.until===period.until&&target.dueAt===period.dueAt&&
      row.customer.id===definition.customerId&&row.binding.id===definition.bindingId&&
      row.periodIdentitySha256===definition.periodIdentitySha256&&row.pass.orderRef===definition.orderRef,
      'The chosen original customer/pass differs from its saved calendar period.','PLAN');
    seen.add(period.id);
    need(target.actualOpeningAt===row.opening.sourceCreatedAt&&target.actualClosingAt===row.closing.sourceCreatedAt&&
      target.boundaryDifference===(!sameInstant(target.actualOpeningAt,period.openingAt)||!sameInstant(target.actualClosingAt,period.closingAt)),
      'Keep the scheduled dates and actual capture dates together.','PLAN');
  });
  return value;
}
async function jsonFile(path){
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{return JSON.parse(await handle.readFile('utf8'));}finally{await handle.close();}
}
async function atomicJson(path,value){
  const temp=path+'.'+randomUUID()+'.tmp';let handle;
  try{
    handle=await open(temp,'wx',0o600);await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();await handle.close();handle=null;
    await rename(temp,path);
  }finally{if(handle)await handle.close().catch(()=>{});await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
async function optionalJson(path){try{return await jsonFile(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}

/** The existing workbench supplies native catalogue/cycle operations; this store saves calendar choices. */
export async function createAccountingStatementServiceSchedules({directory,url,workspace,readInventory,prepareCycle,readCycle}={}){
  need(typeof directory==='string'&&resolve(directory)===directory&&typeof workspace==='string','Use the original absolute closing directory and workspace.');
  const endpoint=new URL(url).href,home=join(directory,'.service-schedules'),requests=join(home,'preparations');
  await mkdir(home,{recursive:true,mode:0o700});await mkdir(requests,{recursive:true,mode:0o700});
  for(const path of [home,requests]){
    const info=await lstat(path);need(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&
      (!process.getuid||info.uid===process.getuid())&&await realpath(path)===path,'Use private operator-owned calendar directories.','DIRECTORY');
  }
  const cataloguePath=join(home,'catalogue.json');
  const empty=()=>({schema:PREFIX+'.v1',workspace,endpoint,revision:0,definitions:[]});
  const read=async()=>validateCatalogue(await optionalJson(cataloguePath)??empty(),workspace,endpoint);
  const requestPath=id=>{need(UUID.test(id??''),'Keep the original preparation request identity.');return join(requests,id+'.json');};
  async function mutation(work){const lease=await acquireStateLease(home);try{return await work(lease);}finally{await lease.close();}}
  async function allPreparations(){
    const state=await read(),result=[];for(const entry of await readdir(requests,{withFileTypes:true})){
      if(entry.isFile()&&/^[a-f0-9-]{36}\.json$/.test(entry.name)){
        const value=await jsonFile(join(requests,entry.name));need(value.schema===PREFIX+'-preparation.v1'&&
          value.requestId+'.json'===entry.name&&value.workspace===workspace&&value.endpoint===endpoint&&
          typeof value.createdAt==='string'&&Number.isFinite(Date.parse(value.createdAt))&&typeof value.label==='string'&&typeof value.imported==='boolean','Keep the original calendar preparation record.','PREPARATION');
        checkScheduledPlan(value.scheduledPlan,state);
        need(value.cycleKey==='cycle-'+value.requestId&&value.bodySha256===hash({label:value.label,scheduledPlan:value.scheduledPlan}),
          'The retained preparation differs from its original plan.','PREPARATION');
        result.push(value);
      }
    }
    return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.requestId.localeCompare(b.requestId));
  }
  async function catalogue(){const state=await read();return {...state,current:currentDefinitions(state)};}
  async function save({expectedRevision,id=null,definition}={}){
    integer(expectedRevision,0,Number.MAX_SAFE_INTEGER);definition=normalizeDefinition(definition);
    const inventory=await readInventory();need(!definition.active||rowFor(inventory,definition),'Select the current original customer assignment and purchased pass. Refresh their service records.','PASS');
    return mutation(async lease=>{
      const state=await read();need(state.revision===expectedRevision,'Another operator saved calendars. Refresh them while keeping your draft.','CHANGED');
      let row=id?state.definitions.find(item=>item.id===id):null;need(!id||row,'Select an existing saved calendar.','EDITION');
      if(row){const original=row.versions[0];need(['customerId','bindingId','periodIdentitySha256','orderRef'].every(k=>original[k]===definition[k]),
        'Create a new calendar for another customer assignment or purchased pass. This calendar retains its original service history.','PASS');}
      if(!row){row={id:randomUUID(),versions:[]};state.definitions.push(row);}
      const body={id:row.id,version:row.versions.length+1,savedAt:new Date().toISOString(),...definition},version={...body,sha256:hash(body)};
      row.versions.push(version);state.revision++;lease.assertHeld();await atomicJson(cataloguePath,state);
      return {revision:state.revision,definition:version};
    });
  }
  async function calendar({from,until,asOf=new Date().toISOString(),includePaused=false,offset=0,limit=100,format=null}={}){
    integer(offset,0,Number.MAX_SAFE_INTEGER);integer(limit,1,1000);need(typeof includePaused==='boolean','Choose whether to include paused calendars.');
    const [state,inventory,preparations]=await Promise.all([read(),readInventory(),allPreparations()]);
    const links=new Map();
    for(const preparation of preparations)for(const target of preparation.scheduledPlan.targets){
      if(!links.has(target.periodId))links.set(target.periodId,[]);
      links.get(target.periodId).push({requestId:preparation.requestId,cycleKey:preparation.cycleKey,label:preparation.label,
        createdAt:preparation.createdAt,imported:Boolean(preparation.imported),actualOpeningAt:target.actualOpeningAt,actualClosingAt:target.actualClosingAt});
    }
    let items=[];
    for(const definition of currentDefinitions(state)){
      if(!definition.active&&!includePaused)continue;
      const row=rowFor(inventory,definition);
      for(const period of serviceSchedulePeriods(definition,{from,until,asOf})){
        const opening=row?.captures.filter(c=>sameInstant(c.sourceCreatedAt,period.openingAt))??[],closing=row?.captures.filter(c=>sameInstant(c.sourceCreatedAt,period.closingAt))??[];
        const related=links.get(period.id)??[];
        const current=(row?.history??[]).filter(s=>s.status==='RETAINED'&&
          (related.some(link=>s.servicePeriod.from===link.actualOpeningAt&&s.servicePeriod.until===link.actualClosingAt)||
            sameInstant(s.servicePeriod.from,period.openingAt)&&sameInstant(s.servicePeriod.until,period.closingAt)));
        items.push({...period,active:definition.active,definitionSha256:definition.sha256,customer:row?.customer??{id:definition.customerId,name:'Assignment unavailable'},
          orderRef:definition.orderRef,rowId:row?.id??null,sourceState:!row?'ASSIGNMENT_CHANGED':opening.length===1&&closing.length===1?'EXACT_CAPTURES_AVAILABLE':'CHOOSE_CAPTURES',
          openingCaptureId:opening.length===1?opening[0].id:null,closingCaptureId:closing.length===1?closing[0].id:null,
          openingCandidates:opening.map(c=>c.id),closingCandidates:closing.map(c=>c.id),
          currentStatements:current.map(s=>({id:s.id,number:s.number,status:s.status,from:s.servicePeriod.from,until:s.servicePeriod.until})),
          preparations:related});
      }
    }
    items.sort((a,b)=>a.dueAt.localeCompare(b.dueAt)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
    const counts={total:items.length,due:items.filter(r=>['DUE','OVERDUE'].includes(r.timing)&&!r.currentStatements.length).length,
      prepared:items.filter(r=>r.preparations.length).length,current:items.filter(r=>r.currentStatements.length).length};
    if(format!==null)return renderServiceCalendar(items,{from,until,asOf,format,workspace});
    return {schema:PREFIX+'-calendar.v1',workspace,endpoint,revision:state.revision,from,until,asOf,
      inventory,counts,total:items.length,offset,nextOffset:offset+limit<items.length?offset+limit:null,items:items.slice(offset,offset+limit)};
  }
  async function compile({selections}={}){
    need(Array.isArray(selections)&&selections.length>0&&selections.length<=2000,'Choose one through 2,000 scheduled service periods.');
    const [state,inventory]=await Promise.all([read(),readInventory()]);
    const targets=[],choices=[],seen=new Set();
    for(const selected of selections){
      fields(selected,['scheduleId','version','index','runId','usageOpeningId','usageId','acceptDifferentBoundaries']);
      const {definition,period}=periodFromTarget(state,selected),row=rowFor(inventory,definition);
      need(row,'The original customer assignment changed. Inspect its retained service history.','PASS');
      need(!seen.has(period.id),'Choose each scheduled service period once.','DUPLICATE');seen.add(period.id);
      const opening=row.captures.find(c=>c.id===selected.usageOpeningId),closing=row.captures.find(c=>c.id===selected.usageId);
      need(opening&&closing,'Select the actual opening and closing capture files.');
      const boundaryDifference=!sameInstant(opening.sourceCreatedAt,period.openingAt)||!sameInstant(closing.sourceCreatedAt,period.closingAt);
      need(!boundaryDifference||selected.acceptDifferentBoundaries===true,
        'The actual captures use different dates. Review both periods and explicitly keep those actual boundaries.','BOUNDARIES');
      targets.push({scheduleId:definition.id,version:definition.version,index:period.index,periodId:period.id,name:definition.name,
        definitionSha256:definition.sha256,from:period.from,until:period.until,dueAt:period.dueAt,
        actualOpeningAt:opening.sourceCreatedAt,actualClosingAt:closing.sourceCreatedAt,boundaryDifference});
      choices.push({rowId:row.id,runId:selected.runId,usageOpeningId:opening.id,usageId:closing.id,replacesId:null});
    }
    const plan=compileAccountingStatementServicePlan({inventory,choices});
    const body={schema:PREFIX+'-plan.v1',workspace,endpoint,catalogueRevision:state.revision,targets,plan};
    return {...body,sha256:hash(body)};
  }
  async function prepare({requestId,label,scheduledPlan}={}){
    requestPath(requestId);label=text(label,200,'a cycle name');
    const state=await read();checkScheduledPlan(scheduledPlan,state);
    const bodySha256=hash({label,scheduledPlan});
    const record=await mutation(async lease=>{
      const previous=await optionalJson(requestPath(requestId));
      if(previous){checkScheduledPlan(previous.scheduledPlan,state);need(previous.cycleKey==='cycle-'+requestId&&previous.bodySha256===hash({label:previous.label,scheduledPlan:previous.scheduledPlan}),'The retained preparation differs from its original source.','PREPARATION');need(previous.bodySha256===bodySha256,'This original request belongs to another selected plan. Recover it before changing the request.','REQUEST_CHANGED');return previous;}
      const periods=new Set(scheduledPlan.targets.map(t=>t.periodId)),previousPlans=await allPreparations();
      const duplicate=previousPlans.find(p=>p.scheduledPlan.targets.some(t=>periods.has(t.periodId)));
      need(!duplicate,'A selected scheduled period already belongs to saved cycle '+duplicate?.cycleKey+'. Open that original cycle to continue; corrections remain in the service planner.','ALREADY_PREPARED');
      const record={schema:PREFIX+'-preparation.v1',workspace,endpoint,requestId,bodySha256,label,
        createdAt:new Date().toISOString(),cycleKey:'cycle-'+requestId,scheduledPlan,imported:false};
      lease.assertHeld();await atomicJson(requestPath(requestId),record);return record;
    });
    if(record.imported){
      const cycle=await readCycle(record.cycleKey);
      return {preparation:record,cycle};
    }
    const cycle=await prepareCycle({requestId:record.requestId,label:record.label,plan:record.scheduledPlan.plan});
    return {preparation:record,cycle};
  }
  async function request({requestId}={}){
    const record=await optionalJson(requestPath(requestId));return {requestId,found:Boolean(record),...(record?{preparation:record}: {})};
  }
  async function resume({requestId}={}){
    const record=await optionalJson(requestPath(requestId));need(record,'The original preparation record is unavailable.','PREPARATION');
    return prepare({requestId,label:record.label,scheduledPlan:record.scheduledPlan});
  }
  async function history({scheduleId=null,offset=0,limit=25}={}){
    integer(offset,0,Number.MAX_SAFE_INTEGER);integer(limit,1,1000);
    if(scheduleId)need(UUID.test(scheduleId),'Select an original calendar.');
    const rows=(await allPreparations()).filter(row=>!scheduleId||row.scheduledPlan.targets.some(t=>t.scheduleId===scheduleId));
    return {items:rows.slice(offset,offset+limit),total:rows.length,offset,nextOffset:offset+limit<rows.length?offset+limit:null};
  }
  async function exportBundle(){
    return mutation(async()=>{const body={schema:PREFIX+'-bundle.v1',exportedAt:new Date().toISOString(),
      catalogue:await read(),preparations:await allPreparations()};
      return {...body,sha256:hash(body)};
    });
  }
  async function importBundle({bundle,expectedRevision}={}){
    need(plain(bundle)&&bundle.schema===PREFIX+'-bundle.v1','Choose a complete service calendar export.','IMPORT');
    const {sha256,...body}=bundle;need(hash(body)===sha256,'The calendar export differs from its complete content.','IMPORT');
    validateCatalogue(bundle.catalogue,workspace,endpoint);need(Array.isArray(bundle.preparations),'Keep all original preparation references.','IMPORT');
    const incomingRequests=new Set();
    for(const record of bundle.preparations){
      requestPath(record.requestId);need(!incomingRequests.has(record.requestId),'Each original preparation occurs once in the complete export.','IMPORT');incomingRequests.add(record.requestId);checkScheduledPlan(record.scheduledPlan,bundle.catalogue);
      need(record.schema===PREFIX+'-preparation.v1'&&record.workspace===workspace&&record.endpoint===endpoint&&
        record.cycleKey==='cycle-'+record.requestId&&record.bodySha256===hash({label:record.label,scheduledPlan:record.scheduledPlan})&&
        typeof record.createdAt==='string'&&Number.isFinite(Date.parse(record.createdAt))&&typeof record.label==='string'&&record.label.trim()&&record.label.length<=200&&typeof record.imported==='boolean',
        'A preparation reference differs from its original selected plan.','IMPORT');
    }
    return mutation(async lease=>{
      const current=await read();need(current.revision===expectedRevision,'Refresh the calendar catalogue before importing its saved history.','CHANGED');
      const next=copy(current);
      for(const incoming of bundle.catalogue.definitions){
        const existing=next.definitions.find(d=>d.id===incoming.id);
        if(existing){need(existing.versions.every((v,i)=>!incoming.versions[i]||v.sha256===incoming.versions[i].sha256)&&
          incoming.versions.every((v,i)=>!existing.versions[i]||v.sha256===existing.versions[i].sha256),
          'The same calendar has divergent saved editions. Keep both exports and resolve its original choices.','EDITION_CONFLICT');
          if(incoming.versions.length>existing.versions.length)existing.versions=copy(incoming.versions);
        }else next.definitions.push(copy(incoming));
      }
      const originals=new Map((await allPreparations()).map(record=>[record.requestId,record]));
      for(const incoming of bundle.preparations){
        checkScheduledPlan(incoming.scheduledPlan,next);
        const old=originals.get(incoming.requestId);
        need(!old||old.bodySha256===incoming.bodySha256,'The same preparation identity has a different original plan.','REQUEST_CHANGED');
        if(!old)originals.set(incoming.requestId,incoming);
      }
      const periodOwners=new Map();
      for(const record of originals.values())for(const target of record.scheduledPlan.targets){
        const owner=periodOwners.get(target.periodId);
        need(!owner||owner===record.requestId,'This scheduled period already belongs to another original prepared cycle. Keep both workspaces and resolve that original cycle before importing.','PERIOD_CONFLICT');
        periodOwners.set(target.periodId,record.requestId);
      }
      next.revision++;lease.assertHeld();await atomicJson(cataloguePath,next);
      for(const incoming of bundle.preparations)if(!await optionalJson(requestPath(incoming.requestId))){
        lease.assertHeld();await atomicJson(requestPath(incoming.requestId),{...incoming,imported:true});
      }
      return {revision:next.revision,calendars:next.definitions.length,preparations:bundle.preparations.length};
    });
  }
  return {catalogue,save,calendar,compile,prepare,request,resume,history,exportBundle,importBundle};
}

function renderServiceCalendar(items,{from,until,asOf,format,workspace}){
  need(['html','csv'].includes(format),'Choose the complete readable HTML or CSV calendar.');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const columns=['Calendar','Customer','Order','Scheduled opening UTC','Scheduled close UTC','Due UTC','Timing','Capture availability','Current statements','Original cycles','Actual prepared source periods'];
  const rows=items.map(p=>[p.name,p.customer.name,p.orderRef,p.openingAt,p.closingAt,p.dueAt,p.timing,p.sourceState,
    p.currentStatements.map(s=>s.number).join('; '),p.preparations.map(r=>r.cycleKey).join('; '),
    p.preparations.map(r=>r.actualOpeningAt+' to '+r.actualClosingAt).join('; ')]);
  let content;
  if(format==='csv'){
    const cell=v=>{let s=String(v??'');if(/^\s*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    content=[columns,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
  }else content='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Customer service calendar</title>'+
    '<style>body{max-width:1400px;margin:32px auto;padding:0 20px;color:#202020;background:#fff;font:14px/1.5 Arial,sans-serif}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:9px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}@media print{body{max-width:none;margin:0}tr{break-inside:avoid}}</style></head><body><h1>Customer service calendar</h1><p>'+
    esc(workspace)+' · '+esc(from)+' to '+esc(until)+' · observed '+esc(asOf)+'</p><p>'+items.length+' scheduled periods. Scheduled dates and actual capture boundaries remain separate. Current statements and original cycle links refer to the retained merchant records.</p><table><thead><tr>'+
    columns.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></body></html>';
  return {filename:'customer-service-calendar-'+from+'-'+until+'.'+format,mimeType:format==='csv'?'text/csv;charset=utf-8':'text/html;charset=utf-8',content,total:items.length};
}
