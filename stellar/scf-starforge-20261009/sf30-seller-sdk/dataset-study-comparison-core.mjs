// MIT. Complete typed comparisons of retained SF30 query-result rows.
export const COMPARISON_SCHEMA='stellar-forge.dataset-study-comparison.v1';
export const COMPARISON_PLAN_SCHEMA='stellar-forge.dataset-study-comparison-plan.v1';
export const COMPARISON_KINDS=Object.freeze(['all','added','removed','changed','unchanged','ambiguous','moved']);
export const COMPARISON_INPUT_BYTES=128*1024*1024;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const copy=value=>JSON.parse(JSON.stringify(value));
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)+'\n').length;
const fail=(message,code='DATASET_STUDY_COMPARISON_INVALID',status=400)=>{
  throw Object.assign(new TypeError(message),{code,status});
};
const need=(value,message,code,status)=>{if(!value)fail(message,code,status);};
function columns(value,label){
  need(Array.isArray(value)&&value.length>0&&value.length<=64,'Keep the complete '+label+' selected column schema.');
  const names=new Set();
  return value.map(column=>{
    need(object(column)&&typeof column.name==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(column.name)&&
      !['constructor','prototype','__proto__'].includes(column.name)&&!names.has(column.name)&&
      ['string','integer','number','boolean'].includes(column.type)&&typeof column.nullable==='boolean',
      'Use unique original typed '+label+' columns.');
    names.add(column.name);
    return {name:column.name,type:column.type,nullable:column.nullable};
  });
}
export function suggestComparisonFields({baselineColumns,targetColumns}){
  const before=columns(baselineColumns,'baseline'),after=columns(targetColumns,'target'),target=new Set(after.map(x=>x.name));
  return [...before.map(x=>({baseline:x.name,target:target.has(x.name)?x.name:null,key:false})),
    ...after.filter(x=>!before.some(y=>y.name===x.name)).map(x=>({baseline:null,target:x.name,key:false}))];
}
export function validateComparisonPlan({baselineColumns,targetColumns,fields}){
  const before=columns(baselineColumns,'baseline'),after=columns(targetColumns,'target');
  const left=new Map(before.map(x=>[x.name,x])),right=new Map(after.map(x=>[x.name,x]));
  need(Array.isArray(fields)&&fields.length>=1&&fields.length<=128,'Retain every selected column in the field mapping.');
  const usedLeft=new Set(),usedRight=new Set();let keyCount=0;
  const selected=fields.map((field,index)=>{
    need(object(field)&&Object.keys(field).every(k=>['baseline','target','key'].includes(k))&&
      typeof field.key==='boolean'&&(field.baseline===null||typeof field.baseline==='string')&&
      (field.target===null||typeof field.target==='string')&&(field.baseline!==null||field.target!==null),
      'Each mapping needs an earlier field, later field, or both, and an explicit key choice.');
    const first=field.baseline===null?null:left.get(field.baseline),second=field.target===null?null:right.get(field.target);
    need(field.baseline===null||first&&!usedLeft.has(field.baseline),'Use each original baseline column exactly once.');
    need(field.target===null||second&&!usedRight.has(field.target),'Use each original target column exactly once.');
    if(first)usedLeft.add(first.name);if(second)usedRight.add(second.name);
    if(field.key){
      need(first&&second&&first.type===second.type,'Each row key must pair original columns with the same type.');
      keyCount++;
    }
    return {index,baseline:first,target:second,key:field.key};
  });
  need(usedLeft.size===before.length&&usedRight.size===after.length,'Map every original selected field, including added and removed fields.');
  need(keyCount>=1&&keyCount<=16,'Choose 1–16 paired fields that identify rows in both complete results.');
  return {schema:COMPARISON_PLAN_SCHEMA,baselineColumns:before,targetColumns:after,fields:selected};
}
function checkedRow(value,schema,side,ordinal){
  need(object(value)&&Object.keys(value).length===schema.length&&schema.every(column=>own(value,column.name)),
    'The complete '+side+' result has a changed field set at row '+(ordinal+1)+'.','DATASET_STUDY_COMPARISON_SOURCE_CHANGED',409);
  for(const column of schema){
    const cell=value[column.name];let valid=false;
    if(cell===null)valid=column.nullable;
    else if(column.type==='string')valid=typeof cell==='string';
    else if(column.type==='boolean')valid=typeof cell==='boolean';
    else if(column.type==='integer')valid=Number.isSafeInteger(cell);
    else valid=typeof cell==='number'&&Number.isFinite(cell);
    need(valid,'The original '+side+' value in '+column.name+' at row '+(ordinal+1)+' no longer matches its declared type.',
      'DATASET_STUDY_COMPARISON_SOURCE_CHANGED',409);
  }
  return {ordinal,values:copy(value)};
}
function cell(record,spec){
  return !record||!spec?{present:false,type:null,value:null}:
    {present:true,type:spec.type,value:record.values[spec.name]};
}
const equal=(a,b)=>a.present===b.present&&a.type===b.type&&a.value===b.value;
export function compareStudyGroup({plan,key,baseline,target,ordinal}){
  need(plan?.schema===COMPARISON_PLAN_SCHEMA&&Array.isArray(key)&&Array.isArray(baseline)&&Array.isArray(target)&&
    (baseline.length>0||target.length>0)&&Number.isSafeInteger(ordinal)&&ordinal>=0,'Use a complete retained key group.');
  const reasons=[];
  if(key.some(x=>x.value===null))reasons.push('null-key');
  if(baseline.length>1)reasons.push('duplicate-baseline-key');
  if(target.length>1)reasons.push('duplicate-target-key');
  const ambiguous=reasons.length>0,changes=[];
  const first=baseline.length===1?baseline[0]:null,second=target.length===1?target[0]:null;
  if(!ambiguous)for(const field of plan.fields){
    const before=cell(first,field.baseline),after=cell(second,field.target);
    if(!equal(before,after))changes.push({field:field.index,baselineName:field.baseline?.name??null,
      targetName:field.target?.name??null,before,after});
  }
  const moved=!ambiguous&&!!first&&!!second&&first.ordinal!==second.ordinal;
  const kind=ambiguous?'ambiguous':!first?'added':!second?'removed':changes.length?'changed':'unchanged';
  return {ordinal,kind,key:copy(key),reasons,baseline:copy(baseline),target:copy(target),changes,moved};
}
/** Reads both complete inputs before emitting a group. A caller must retain rows
 * privately and publish a comparison only after receiving the final summary.
 * Original rows are grouped by typed compound keys; ambiguous rows are never
 * paired by position or arbitrarily dropped. */
export async function* compareStudyRows({baselineColumns,targetColumns,fields,baselineRows,targetRows,
  expectedBaselineRows,expectedTargetRows,maxInputBytes=COMPARISON_INPUT_BYTES}){
  const plan=validateComparisonPlan({baselineColumns,targetColumns,fields});
  need(Number.isSafeInteger(expectedBaselineRows)&&expectedBaselineRows>=0&&
    Number.isSafeInteger(expectedTargetRows)&&expectedTargetRows>=0,'Keep both complete original result totals.');
  need(Number.isSafeInteger(maxInputBytes)&&maxInputBytes>0&&maxInputBytes<=COMPARISON_INPUT_BYTES,
    'Use a complete comparison input allowance up to 128 MiB.');
  const groups=new Map(),keyFields=plan.fields.filter(x=>x.key);
  let inputBytes=0;
  async function consume(iterable,side,schema,expected){
    need(iterable!=null&&(typeof iterable[Symbol.asyncIterator]==='function'||typeof iterable[Symbol.iterator]==='function'),
      'Provide all original '+side+' result rows.');
    let count=0;
    for await(const value of iterable){
      need(count<expected,'The '+side+' result has more rows than its completed original manifest.',
        'DATASET_STUDY_COMPARISON_SOURCE_CHANGED',409);
      inputBytes+=bytes(value);
      need(inputBytes<=maxInputBytes,'The two complete result inputs exceed the 128 MiB comparison allowance. Keep these original exports and select smaller complete query results.',
        'DATASET_STUDY_COMPARISON_CAPACITY',413);
      const row=checkedRow(value,schema,side,count++);
      const key=keyFields.map(field=>({type:field[side].type,value:row.values[field[side].name]}));
      const token=JSON.stringify(key);let group=groups.get(token);
      if(!group){group={key,baseline:[],target:[]};groups.set(token,group);}
      group[side].push(row);
    }
    need(count===expected,'The '+side+' result ended before its completed original row total.',
      'DATASET_STUDY_COMPARISON_SOURCE_CHANGED',409);
    return count;
  }
  const baselineCount=await consume(baselineRows,'baseline',plan.baselineColumns,expectedBaselineRows);
  const targetCount=await consume(targetRows,'target',plan.targetColumns,expectedTargetRows);
  const counts={added:0,removed:0,changed:0,unchanged:0,ambiguous:0};
  const rowCounts={baseline:baselineCount,target:targetCount,ambiguousBaseline:0,ambiguousTarget:0};
  const fieldCounts=plan.fields.map(field=>({field:field.index,baselineName:field.baseline?.name??null,
    targetName:field.target?.name??null,changed:0}));
  let ordinal=0,moved=0;
  for(const group of groups.values()){
    const row=compareStudyGroup({plan,...group,ordinal:ordinal++});
    counts[row.kind]++;
    if(row.moved)moved++;
    if(row.kind==='ambiguous'){rowCounts.ambiguousBaseline+=row.baseline.length;rowCounts.ambiguousTarget+=row.target.length;}
    else for(const change of row.changes)fieldCounts[change.field].changed++;
    yield {type:'row',row};
  }
  yield {type:'summary',summary:{schema:COMPARISON_SCHEMA,complete:true,plan,groups:ordinal,counts,
    rowCounts,moved,fieldCounts,inputBytes,order:'first baseline occurrence, then first target-only occurrence'}};
}
export function comparisonViewMatches(row,kind='all'){
  need(COMPARISON_KINDS.includes(kind),'Choose an original comparison view.');
  return kind==='all'||(kind==='moved'?row.moved===true:row.kind===kind);
}
