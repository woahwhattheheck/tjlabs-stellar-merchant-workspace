// MIT. Bounded inspection of complete retained NOAA rows; no interpolation or datum conversion.
import {iterateEditionRows,rowSelection,editionRows} from './domain.mjs';
import {PRODUCTS} from './schema.mjs';
import {fault,hashBytes} from './provider.mjs';
import {stable} from '../stellar-expert/store.mjs';

export const INSPECTION_SCHEMA='stellar-forge.coops-observation-inspection.v1';
export const INSPECTION_LIMITS={buckets:480,identityKeys:200000,selectedPoints:32};
const HASH=/^[a-f0-9]{64}$/,DAY=86400000,plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const sha=v=>hashBytes(Buffer.from(stable(v)));
const need=(value,code,message,status=400)=>{if(!value)throw fault(code,message,status);};
function exactObject(value,keys,label){
 need(plain(value)&&Object.keys(value).every(k=>keys.includes(k)),'COOPS_INSPECTION_SELECTION','Use the exact '+label+' fields.');return value;
}
function clock(timestamp){
 if(typeof timestamp!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(timestamp))return null;
 const normalized=timestamp.replace(' ','T')+(timestamp.length===16?':00':'')+'Z',value=Date.parse(normalized);
 return Number.isFinite(value)&&new Date(value).toISOString().slice(0,19)===normalized.slice(0,19)?value:null;
}
// Compare decimal text without rounding its mantissa or constructing exponent-sized integers.
function decimal(value){
 if(typeof value!=='string'||value.length>1024)return null;
 const m=/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[Ee]([+-]?\d+))?$/.exec(value);
 if(!m)return null;const exponent=m[5]??'0';
 if(exponent.replace(/^[+-]/,'').length>8)return null;
 let digits=((m[2]??'')+(m[3]??m[4]??'')).replace(/^0+/,'');
 if(!digits)return{sign:0,digits:'0',order:0};
 const fractional=(m[3]??m[4]??'').length,order=digits.length-fractional+Number(exponent);
 digits=digits.replace(/0+$/,'');return{sign:m[1]==='-'?-1:1,digits,order};
}
function compare(a,b){
 if(a.sign!==b.sign)return a.sign<b.sign?-1:1;if(!a.sign)return 0;
 if(a.order!==b.order)return(a.order<b.order?-1:1)*a.sign;
 const n=Math.max(a.digits.length,b.digits.length),left=a.digits.padEnd(n,'0'),right=b.digits.padEnd(n,'0');
 return(left===right?0:left<right?-1:1)*a.sign;
}
function ref(row){
 return{recordId:row.recordId,sourcePageSha256:row.sourcePageSha256,sourceRecord:row.sourceRecord,rowSha256:sha(row)};
}
function sample(row,parsed){
 const n=Number(row.value),displayable=Boolean(parsed)&&Number.isFinite(n)&&(n!==0||parsed.sign===0);
 return{...ref(row),timestamp:row.timestamp,timestampUtc:row.timestampUtc,value:row.value,valueType:row.valueType,
  unit:row.unit,quality:row.quality,flags:row.flags,sigma:row.sigma,eventType:row.eventType,plotValue:displayable?n:null};
}
function descriptor(edition){
 return{editionId:edition.id,sourceSha256:edition.sourceSha256,editionSha256:sha(edition),stationId:edition.query.stationId,
  stationName:edition.stationMetadata?.name??null,datum:edition.query.datum,units:edition.query.units,
  unit:edition.query.units==='metric'?'m':'ft',timeZone:edition.query.timeZone,query:structuredClone(edition.query)};
}
export function inspectionSelection(edition,input={}){
 exactObject(input,['product','beginDate','endDate','buckets','table','products'],'observation inspection');
 const product=input.product??edition.query.products.find(p=>p!=='predictions')??edition.query.products[0];
 need(Object.hasOwn(PRODUCTS,product)&&edition.query.products.includes(product),'COOPS_INSPECTION_PRODUCT','Choose one product actually retained in this edition.');
 const table=product==='predictions'?'predictions':'observations',selected=rowSelection(edition,{table,beginDate:input.beginDate,endDate:input.endDate,products:[product]}),
  buckets=input.buckets??240;
 need(Number.isSafeInteger(buckets)&&buckets>=1&&buckets<=INSPECTION_LIMITS.buckets,'COOPS_INSPECTION_BUCKETS','Choose one to 480 time bins.');
 if(input.table!==undefined)need(input.table===table,'COOPS_INSPECTION_PRODUCT','The original product and source table must agree.');
 if(input.products!==undefined)need(Array.isArray(input.products)&&input.products.length===1&&input.products[0]===product,'COOPS_INSPECTION_PRODUCT','The inspection contains exactly its selected original product.');
 return{...selected,product,buckets};
}
export function inspectionPointReference(value){
 exactObject(value,['recordId','sourcePageSha256','sourceRecord','rowSha256'],'original point');
 need(typeof value.recordId==='string'&&value.recordId.length>0&&value.recordId.length<=1024&&
  typeof value.sourceRecord==='string'&&value.sourceRecord.length>0&&value.sourceRecord.length<=1024&&
  HASH.test(value.sourcePageSha256??'')&&HASH.test(value.rowSha256??''),'COOPS_INSPECTION_POINT','Keep the exact original record, response and row hashes.');
 return structuredClone(value);
}
function selectedPage(page,selection){
 return page.kind==='data'&&page.product===selection.product&&
  (!page.endDate||page.endDate>=selection.beginDate)&&(!page.beginDate||page.beginDate<=selection.endDate);
}
export async function inspectEdition(store,edition,input={}){
 const selection=inspectionSelection(edition,input),begin=Date.parse(selection.beginDate+'T00:00:00Z'),
  end=Date.parse(selection.endDate+'T00:00:00Z')+DAY,span=end-begin,
  step=selection.product==='predictions'?(edition.query.predictionInterval==='6'?6:edition.query.predictionInterval==='h'?60:null):PRODUCTS[selection.product].stepMinutes,
  expected=step&&edition.query.timeZone!=='lst_ldt'?span/(step*60000):null,
  grid=expected===null?null:new Uint8Array(expected),keys=new Map(),
  bins=Array.from({length:selection.buckets},(_,index)=>({index,beginClock:new Date(begin+Math.floor(index*span/selection.buckets)).toISOString().slice(0,19).replace('T',' '),
   endExclusiveClock:new Date(begin+Math.floor((index+1)*span/selection.buckets)).toISOString().slice(0,19).replace('T',' '),
   records:0,numericRecords:0,unavailableRecords:0,unplottableRecords:0,expectedSlots:expected===null?null:0,
   presentSlots:expected===null?null:0,numericSlots:expected===null?null:0,first:null,last:null,minimum:null,maximum:null,quality:{}})),
  extrema=bins.map(()=>({min:null,max:null})),counts={records:0,numericRecords:0,unavailableRecords:0,unplottableRecords:0,invalidClockRecords:0,offGridRecords:0,
   uniqueTimestampKeys:0,duplicateTimestampKeys:0,duplicateRecords:0,conflictingTimestampKeys:0,expectedSlots:expected,presentSlots:expected===null?null:0,numericSlots:expected===null?null:0},
  quality={},valueTypes={};let minimum=null,maximum=null,minDecimal=null,maxDecimal=null;
 const binFor=t=>Math.min(bins.length-1,Math.max(0,Math.floor((t-begin)*bins.length/span)));
 if(grid)for(let i=0;i<grid.length;i++)bins[binFor(begin+i*step*60000)].expectedSlots++;
 for await(const row of iterateEditionRows(store,edition,selection)){
  counts.records++;const type=row.valueType;valueTypes[type]=(valueTypes[type]??0)+1;
  const q=row.quality||'not_reported';quality[q]=(quality[q]??0)+1;
  const number=!['null','missing','boolean','object','array'].includes(type)?decimal(row.value):null,
   s=sample(row,number),t=clock(row.timestamp),signature=sha(Object.fromEntries(['value','valueType','quality','flags','sigma','eventType','detailsJson'].map(k=>[k,row[k]])));
  let prior=keys.get(row.recordId);
  if(prior){counts.duplicateRecords++;if(prior.count++===1)counts.duplicateTimestampKeys++;if(prior.signature!==signature&&!prior.conflict){prior.conflict=true;counts.conflictingTimestampKeys++;}}
  else{need(keys.size<INSPECTION_LIMITS.identityKeys,'COOPS_INSPECTION_CAPACITY','This window exceeds 200000 distinct timestamp identities. Select a narrower original window; no records have been omitted.',413);keys.set(row.recordId,{count:1,signature,conflict:false});}
  if(number){counts.numericRecords++;if(s.plotValue===null)counts.unplottableRecords++;
   if(!minimum||compare(number,minDecimal)<0){minimum=s;minDecimal=number;}if(!maximum||compare(number,maxDecimal)>0){maximum=s;maxDecimal=number;}
  }else counts.unavailableRecords++;
  if(t===null||t<begin||t>=end){counts.invalidClockRecords++;continue;}
  const bucket=bins[binFor(t)],decimals=extrema[bucket.index];bucket.records++;bucket.quality[q]=(bucket.quality[q]??0)+1;
  if(number){bucket.numericRecords++;if(s.plotValue===null)bucket.unplottableRecords++;}else bucket.unavailableRecords++;
  if(!bucket.first||row.timestamp<bucket.first.timestamp)bucket.first=s;if(!bucket.last||row.timestamp>bucket.last.timestamp)bucket.last=s;
  if(number&&(!bucket.minimum||compare(number,decimals.min)<0)){bucket.minimum=s;decimals.min=number;}
  if(number&&(!bucket.maximum||compare(number,decimals.max)>0)){bucket.maximum=s;decimals.max=number;}
  if(step){const slot=(t-begin)/(step*60000);
   if(!Number.isSafeInteger(slot)||slot<0||slot>=(expected??Infinity))counts.offGridRecords++;
   else if(grid){if(!(grid[slot]&1)){grid[slot]|=1;counts.presentSlots++;bucket.presentSlots++;}
    if(number&&!(grid[slot]&2)){grid[slot]|=2;counts.numericSlots++;bucket.numericSlots++;}}
  }
 }
 counts.uniqueTimestampKeys=keys.size;counts.missingSlots=expected===null?null:expected-counts.presentSlots;
 counts.slotsWithoutNumericValue=expected===null?null:expected-counts.numericSlots;
 for(const b of bins){b.missingSlots=b.expectedSlots===null?null:b.expectedSlots-b.presentSlots;b.slotsWithoutNumericValue=b.expectedSlots===null?null:b.expectedSlots-b.numericSlots;}
 const pages=edition.pages.map((page,index)=>({page,index})).filter(({page})=>selectedPage(page,selection)).map(({page,index})=>({index,...structuredClone(page)})),
  sourceTasks=(edition.coverage??[]).filter(p=>p.product===selection.product&&(!p.endDate||p.endDate>=selection.beginDate)&&(!p.beginDate||p.beginDate<=selection.endDate)),
  result={schema:INSPECTION_SCHEMA,source:descriptor(edition),selection,clockBasis:edition.query.timeZone==='gmt'?'GMT original source clock':'Original '+edition.query.timeZone+' source clock; displayed without timezone conversion',
   grid:{stepMinutes:step,expectedBasis:expected===null?'No expected fixed grid for high/low events or local daylight/standard time.':String(step)+'-minute original fixed-basis clock grid over the inclusive selected dates.'},
   counts,quality,valueTypes,minimum,maximum,bins,sources:pages,sourceTasks:structuredClone(sourceTasks),
   sourceRequestsComplete:sourceTasks.length>0&&sourceTasks.every(t=>['COMPLETE','UNAVAILABLE'].includes(t.state)),
   warnings:[...(edition.query.timeZone==='lst_ldt'?['Local daylight/standard clock repeats and gaps are retained; elapsed UTC coverage is unavailable.']:[]),
    ...(counts.conflictingTimestampKeys?['Conflicting original timestamp identities remain unresolved. Every original row is available in the source table and export.']:[]),
    ...(counts.unplottableRecords?['Some exact numeric values cannot be represented on a finite browser plotting axis. Their original values and extrema remain retained.']:[]),
    ...(counts.invalidClockRecords?['Some original timestamps cannot be positioned on the selected clock. They remain counted and retained.']:[])],
   notes:['Each bin represents all selected rows; first/last/extrema are original points, not interpolated values.',
    'Bin extrema and numeric classification use original decimal text. Pixel positions use finite browser numbers only.',
    'Missing, blank, null and nonnumeric source values remain distinct; no replacement zero is created.',
    'A completed source request may contain missing observations. Prediction values remain their separate product.',
    'The source edition, all response identities and the complete selected window are bound into this inspection hash.']};
 return{...result,inspectionSha256:sha(result)};
}
export async function inspectPoint(store,edition,reference){
 const selected=inspectionPointReference(reference),candidates=edition.pages.map((receipt,pageIndex)=>({receipt,pageIndex})).filter(x=>x.receipt.sha256===selected.sourcePageSha256&&x.receipt.kind==='data'&&!x.receipt.unavailable);
 need(candidates.length>0,'COOPS_INSPECTION_POINT','The selected original data response is absent from this edition.',404);
 let found=null,selectedPage=null;
 for(const page of candidates){
  for await(const row of iterateEditionRows(store,{...edition,pages:[page.receipt]},{table:page.receipt.product==='predictions'?'predictions':'observations',products:[page.receipt.product]}))
   if(row.recordId===selected.recordId&&row.sourceRecord===selected.sourceRecord&&sha(row)===selected.rowSha256){found=row;selectedPage=page;break;}
  if(found)break;
 }
 need(found,'COOPS_INSPECTION_POINT_CHANGED','The exact selected original row cannot be recovered from this response.',409);
 return{schema:'stellar-forge.coops-observation-point.v1',source:descriptor(edition),reference:selected,pageIndex:selectedPage.pageIndex,receipt:structuredClone(selectedPage.receipt),row:found,
  original:JSON.parse(found.detailsJson)};
}

export async function inspectionEvidence(store,edition,input){
 exactObject(input,['selection','expectedInspectionSha256','points'],'reviewed inspection');
 need(HASH.test(input.expectedInspectionSha256??'')&&Array.isArray(input.points??[])&&(input.points??[]).length<=INSPECTION_LIMITS.selectedPoints,
  'COOPS_INSPECTION_REVIEW','Retain the inspected selection/hash and at most 32 exact original points.');
 const inspection=await inspectEdition(store,edition,input.selection);
 need(inspection.inspectionSha256===input.expectedInspectionSha256,'COOPS_INSPECTION_CHANGED','Reopen and review the exact retained inspection before saving this decision.',409);
 const points=[],seen=new Set();
 for(const reference of input.points??[]){
  const point=await inspectPoint(store,edition,reference),row=point.row;
  need(row.product===inspection.selection.product&&row.timestamp>=inspection.selection.beginDate+' 00:00'&&row.timestamp<inspection.selection.endDate+' 24:00',
   'COOPS_INSPECTION_POINT_SCOPE','Select original points inside the inspected product/window.');
  const key=stable(point.reference);need(!seen.has(key),'COOPS_INSPECTION_POINT_SCOPE','Retain each selected original point once.');seen.add(key);
  points.push({reference:point.reference,row:point.row,receipt:point.receipt,pageIndex:point.pageIndex});
 }
 return{schema:'stellar-forge.coops-observation-review-evidence.v1',inspectionSha256:inspection.inspectionSha256,source:inspection.source,
  selection:inspection.selection,clockBasis:inspection.clockBasis,grid:inspection.grid,counts:inspection.counts,
  quality:inspection.quality,valueTypes:inspection.valueTypes,minimum:inspection.minimum,maximum:inspection.maximum,
  sources:inspection.sources,sourceTasks:inspection.sourceTasks,warnings:inspection.warnings,notes:inspection.notes,points};
}

export async function inspectRows(store,edition,input={},options={}){
 const selection=inspectionSelection(edition,input),offset=options.offset??0,limit=options.limit??50;
 need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=500,'COOPS_INSPECTION_ROWS','Select a nonnegative row offset and one to 500 original records.');
 const page=await editionRows(store,edition,{...selection,offset,limit});
 return{schema:'stellar-forge.coops-observation-page.v1',source:descriptor(edition),selection,offset:page.offset,total:page.total,rows:page.rows.map(row=>({row,reference:ref(row)}))};
}
