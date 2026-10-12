// MIT. Exact source comparison of two complete original OData live collections.
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { collectionKeyIdentity, iterateCollectionRows } from './collection.mjs';
import { canonical } from '../source.mjs';
import { operationFor } from './contract.mjs';

export const COMPARISON_ENGINE = 'stellar-forge.odata-live-comparison-engine.v1';
export const COMPARISON_COLUMNS = Object.freeze(['entity_key','entity_status','field','change',
  'before_state','after_state','before_type','after_type','before_value','after_value',
  'typed_equal','before_row','after_row']);
export const COMPARISON_LIMITS = Object.freeze({maxInputBytes:512*1024*1024,maxOutputBytes:128*1024*1024,maxCells:1000000});
const HASH=/^[a-f0-9]{64}$/;
const need=(condition,code,message)=>{if(!condition)throw Object.assign(new Error(message),{code:'ODATA_COMPARISON_'+code,status:409});};
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const same=(a,b)=>canonical(a)===canonical(b);
const json=value=>Buffer.from(JSON.stringify(value)+'\n');
const original=value=>typeof value==='string'?value:JSON.stringify(value);
const csv=value=>{const text=String(value);return /[",\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;};
const binaryOrder=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
const OWN_FIELDS=new Set(['path','name','odataType','type','underlyingType','nullable','key','precision','scale','sourceDefinition']);

export function comparisonLimits(value={}) {
  need(plain(value)&&Object.keys(value).every(key=>Object.hasOwn(COMPARISON_LIMITS,key)),
    'LIMIT','Choose supported comparison limits.');
  const selected={...COMPARISON_LIMITS,...value};
  for(const [key,max]of Object.entries(COMPARISON_LIMITS))
    need(Number.isSafeInteger(selected[key])&&selected[key]>=1&&selected[key]<=max,'LIMIT','Choose a valid '+key+'.');
  return selected;
}
function sourceIdentity(collection) {
  need(HASH.test(collection.manifestSha256)&&HASH.test(collection.analysis?.sha256),
    'COLLECTION','Select a completely received original collection.');
  return {collectionSha256:collection.manifestSha256,analysisSha256:collection.analysis.sha256,
    selectionSha256:collection.selectionSha256,sourceBinding:collection.sourceBinding,
    serviceRoot:collection.serviceRoot,metadataSha256:collection.metadataSha256,
    entitySet:collection.entitySet,merchantOrigin:collection.merchantOrigin,operation:collection.operation,
    rows:collection.rows,pageCount:collection.pageCount,query:collection.query,
    queryFingerprint:collection.queryFingerprint,acquisition:collection.acquisition,
    reportedCounts:collection.reportedCounts,countConsistent:collection.countConsistent};
}
export function selectComparison(before,after,{title,fields,limits}={}) {
  need(typeof title==='string'&&title.trim()===title&&title.length>0&&title.length<=160&&
    title.isWellFormed()&&!/[\x00-\x1f]/.test(title),'TITLE','Choose a complete comparison title of at most 160 characters.');
  need(before.serviceRoot===after.serviceRoot&&before.entitySet===after.entitySet,
    'ENTITY','Select the same original service root and entity set on both sides.');
  need(Array.isArray(before.keyFields)&&before.keyFields.length&&same(before.keyFields,after.keyFields),
    'KEYS','Both collections must retain the same ordered declared entity keys.');
  const b=new Map(before.mapping.map(field=>[field.path,field])),a=new Map(after.mapping.map(field=>[field.path,field]));
  for(const path of before.keyFields)
    need(b.get(path)?.key===true&&a.get(path)?.key===true&&b.get(path).underlyingType===a.get(path).underlyingType,
      'KEY_TYPES','The declared key type changed; choose a reviewed compatible source pair.');
  const available=[...new Set([...b.keys(),...a.keys()])];
  need(fields===undefined||Array.isArray(fields)&&fields.length>0&&new Set(fields).size===fields.length&&
    fields.every(field=>typeof field==='string'&&available.includes(field)),
    'FIELDS','Select distinct delivered fields from the two original collections.');
  const paths=[...new Set([...before.keyFields,...(fields??available)])];
  need(paths.length<=64,'FIELDS','A comparison can select at most 64 original fields including every key.');
  const selected=paths.map(path=>{
    const left=b.get(path)??null,right=a.get(path)??null;
    for(const field of [left,right].filter(Boolean))
      need(Object.keys(field).every(key=>OWN_FIELDS.has(key)),'DECLARATION','The source field has an unsupported declaration.');
    return {path,before:left,after:right,declarationChanged:!!left&&!!right&&!same(left.sourceDefinition,right.sourceDefinition)};
  });
  return {schema:'stellar-forge.odata-live-comparison-selection.v1',engine:COMPARISON_ENGINE,title,
    before:sourceIdentity(before),after:sourceIdentity(after),keyFields:[...before.keyFields],
    fields:selected,limits:comparisonLimits(limits),
    presenceMeaning:'Only present in the selected complete collection; source deletion is not inferred.',
    acquisitionMeaning:'Each side retains its original live acquisition window and query; neither side is an atomic supplier snapshot.',
    sameQuery:before.queryFingerprint===after.queryFingerprint,
    sameProjection:same(before.mapping,after.mapping)};
}
function state(row,field) {
  if(row===null)return {state:'row_absent',type:field?.odataType??null};
  if(!field)return {state:'field_not_selected',type:null};
  need(Object.hasOwn(row,field.path),'FIELD','An original row omits a declared delivered field.');
  const value=row[field.path];
  return value===null?{state:'null',type:field.odataType}:{state:'value',type:field.odataType,value};
}
function typedEqual(left,right,beforeField,afterField) {
  if(left.state!=='value'||right.state!=='value')return left.state===right.state;
  if(beforeField.underlyingType!==afterField.underlyingType)return null;
  if(same(left.value,right.value))return true;
  const type=beforeField.underlyingType;
  if(['Edm.Byte','Edm.SByte','Edm.Int16','Edm.Int32','Edm.Single','Edm.Double','Edm.Boolean','Edm.String'].includes(type))
    return false;
  if(!['Edm.Int64','Edm.Decimal','Edm.Guid','Edm.Date','Edm.TimeOfDay','Edm.DateTimeOffset'].includes(type))return null;
  // This is the same exact scalar canonicalizer used to identify original keys.
  // Its supported spelling bounds remain explicit; no decimal or date is rounded.
  if(typeof left.value==='string'&&left.value.length>1000||typeof right.value==='string'&&right.value.length>1000)return null;
  const entity={keyFields:['value'],fields:[{path:'value',type}]};
  const catalog={typeDefinitions:{}};
  try{return collectionKeyIdentity({value:left.value},entity,catalog)===collectionKeyIdentity({value:right.value},entity,catalog);}
  catch(error){
    if(typeof error.code==='string'&&error.code.startsWith('ODATA_COLLECTION_KEY'))return null;
    throw error;
  }
}
function change(left,right,field) {
  if(left.state==='row_absent'||right.state==='row_absent')return {kind:'presence_changed',typedEqual:null};
  if(left.state==='field_not_selected'||right.state==='field_not_selected')return {kind:'selection_changed',typedEqual:null};
  if(left.type!==right.type||field.before.underlyingType!==field.after.underlyingType)return {kind:'type_changed',typedEqual:null};
  if(left.state!==right.state)return {kind:'null_changed',typedEqual:false};
  const equal=typedEqual(left,right,field.before,field.after);
  if(field.declarationChanged)return {kind:'declaration_changed',typedEqual:equal};
  if(same(left,right))return null;
  return {kind:equal===true?'spelling_changed':equal===false?'value_changed':'source_changed',typedEqual:equal};
}
export function comparisonCsvRow(cell) {
  return {entity_key:cell.entityKey,entity_status:cell.entityStatus,field:cell.field,change:cell.change,
    before_state:cell.before.state,after_state:cell.after.state,
    before_type:cell.before.type??'',after_type:cell.after.type??'',
    before_value:cell.before.state==='value'?original(cell.before.value):'',
    after_value:cell.after.state==='value'?original(cell.after.value):'',
    typed_equal:cell.typedEqual===null?'':String(cell.typedEqual),
    before_row:cell.beforeRow===null?'':String(cell.beforeRow),
    after_row:cell.afterRow===null?'':String(cell.afterRow)};
}
/** Verified originals enter one private disk index; the full pair is read once. */
export async function deriveComparison({before,after,beforeMerchant,afterMerchant,selection,working,sink={}}) {
  need(selection.engine===COMPARISON_ENGINE,'ENGINE','Use the retained supported comparison engine.');
  const selected=selectComparison(before,after,{title:selection.title,
    fields:selection.fields.map(field=>field.path),limits:selection.limits});
  need(same(selected,selection),'SELECTION_CHANGED','The selected source pair, fields or limits changed.');
  const beforeEntity=operationFor(beforeMerchant.plan,beforeMerchant.catalog,before.operation).entity;
  const afterEntity=operationFor(afterMerchant.plan,afterMerchant.catalog,after.operation).entity;
  const db=new DatabaseSync(join(working,'comparison-index.sqlite'));
  const output=new Map(['cells.jsonl','changes.csv','entities.jsonl'].map(name=>[name,{bytes:0,hash:createHash('sha256')}]));
  const counts={beforeRows:before.rows,afterRows:after.rows,entities:0,matched:0,beforeOnly:0,afterOnly:0,
    changedEntities:0,unchangedEntities:0,changedCells:0,changes:{presence_changed:0,selection_changed:0,type_changed:0,
      null_changed:0,declaration_changed:0,spelling_changed:0,value_changed:0,source_changed:0}};
  let totalOutput=0,projectedBytes=0,maxProjectedRowBytes=0,left,right;
  async function write(name,raw) {
    const record=output.get(name);record.bytes+=raw.length;record.hash.update(raw);totalOutput+=raw.length;
    need(totalOutput<=selection.limits.maxOutputBytes,'OUTPUT_LIMIT',
      'The complete change output exceeds the reviewed limit. Select a smaller complete customer scope.');
    await sink.write?.(name,raw);
  }
  async function index(name,collection,merchant,entity) {
    db.exec('CREATE TABLE '+name+' (key TEXT PRIMARY KEY, ordinal INTEGER NOT NULL, row TEXT NOT NULL) WITHOUT ROWID');
    const insert=db.prepare('INSERT INTO '+name+' (key,ordinal,row) VALUES (?,?,?)');let count=0;
    db.exec('BEGIN');
    try{
      for await(const row of iterateCollectionRows(collection)){
        const key=collectionKeyIdentity(row,entity,merchant.catalog);count++;
        need(Buffer.byteLength(key)<=2097152,'KEY_SIZE','One original entity key exceeds the comparison row limit.');
        insert.run(key,count,JSON.stringify(row));
      }
      need(count===collection.rows,'ROW_COUNT','The complete original row count changed.');db.exec('COMMIT');
    }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
  }
  try{
    db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-16384');
    await index('before_rows',before,beforeMerchant,beforeEntity);
    await index('after_rows',after,afterMerchant,afterEntity);
    await write('changes.csv',Buffer.from(COMPARISON_COLUMNS.join(',')+'\r\n'));
    left=db.prepare('SELECT key,ordinal,row FROM before_rows ORDER BY key COLLATE BINARY').iterate();
    right=db.prepare('SELECT key,ordinal,row FROM after_rows ORDER BY key COLLATE BINARY').iterate();
    let b=left.next(),a=right.next();
    while(!b.done||!a.done){
      const order=b.done?1:a.done?-1:binaryOrder(b.value.key,a.value.key);
      const br=order<=0&&!b.done?b.value:null,ar=order>=0&&!a.done?a.value:null;
      const entityKey=(br??ar).key,beforeRow=br?JSON.parse(br.row):null,afterRow=ar?JSON.parse(ar.row):null;
      const presence=br&&ar?'matched':br?'before_only':'after_only';
      const cells=[];
      for(const field of selection.fields){
        const prior=state(beforeRow,field.before),next=state(afterRow,field.after),observed=change(prior,next,field);
        if(observed)cells.push({entityKey,field:field.path,change:observed.kind,before:prior,after:next,
          typedEqual:observed.typedEqual,beforeRow:br?.ordinal??null,afterRow:ar?.ordinal??null});
      }
      const status=presence==='matched'?(cells.length?'changed':'unchanged'):presence;
      counts.entities++;
      if(presence==='matched'){counts.matched++;if(cells.length)counts.changedEntities++;else counts.unchangedEntities++;}
      else counts[presence==='before_only'?'beforeOnly':'afterOnly']++;
      await write('entities.jsonl',json({entityKey,status,beforeRow:br?.ordinal??null,afterRow:ar?.ordinal??null,
        changedFields:cells.map(cell=>cell.field)}));
      for(const cell of cells){
        counts.changedCells++;need(counts.changedCells<=selection.limits.maxCells,'CELL_LIMIT',
          'The full change set exceeds the selected cell limit. Select a smaller complete customer scope.');
        cell.entityStatus=status;counts.changes[cell.change]++;
        await write('cells.jsonl',json(cell));
        const projected=comparisonCsvRow(cell),projectedSize=json(projected).length;
        projectedBytes+=projectedSize;maxProjectedRowBytes=Math.max(maxProjectedRowBytes,projectedSize);
        need(projectedSize<=2097152&&projectedBytes<=128*1024*1024,'ANALYSIS_LIMIT',
          'The complete comparison exceeds the original Analysis 2 MiB row or 128 MiB projection limit.');
        await write('changes.csv',Buffer.from(COMPARISON_COLUMNS.map(name=>csv(projected[name])).join(',')+'\r\n'));
      }
      if(br)b=left.next();if(ar)a=right.next();
    }
    return {counts,analysisProjection:{format:'csv',columns:COMPARISON_COLUMNS.length,bytes:projectedBytes,
      maxRowBytes:maxProjectedRowBytes,maxBytes:128*1024*1024,maxRowLimit:2097152},
      outputs:Object.fromEntries([...output].map(([name,record])=>[name,{bytes:record.bytes,sha256:record.hash.digest('hex')}]))};
  }finally{try{left?.return?.();}finally{try{right?.return?.();}finally{db.close();}}}
}
