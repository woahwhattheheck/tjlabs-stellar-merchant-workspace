// MIT. A deterministic keyed feed over accepted complete original OData collections.
import {DatabaseSync} from 'node:sqlite';
import {open} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openCollection,iterateCollectionRows,collectionKeyIdentity} from '../collection.mjs';
import {operationFor} from '../contract.mjs';
import {need,same,plain,shape,text,integer,sha,read,parse,lines,LIMITS} from './files.mjs';

export const ENGINE='stellar-forge.odata-collection-subscription-engine.v1';
export const DEFINITION_SCHEMA='stellar-forge.odata-collection-subscription.v1';
export const EDITION_SCHEMA='stellar-forge.odata-subscription-edition.v1';
export const TRANSFER_SCHEMA='stellar-forge.odata-subscription-transfer.v1';
export const CLIENT_SCHEMA='stellar-forge.odata-subscription-customer.v1';
export const rowBytes=row=>Buffer.from(JSON.stringify(row)+'\n');
export const rowHash=row=>sha(rowBytes(row));
const ordered=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
export function scope(collection){const {select,pageSize,count,...query}=collection.query;return query;}
export function define(collection,input){
  shape(input,['title','fields'],'subscription definition');text(input.title,'subscription title');
  const fields=input.fields??collection.mapping.map(x=>x.path);
  need(Array.isArray(fields)&&fields.length&&new Set(fields).size===fields.length&&fields.every(p=>typeof p==='string'&&collection.mapping.some(f=>f.path===p)),
    'FIELDS','Choose distinct fields retained by the original collection.',400);
  const selected=[...new Set([...collection.keyFields,...fields])];
  need(selected.length<=LIMITS.fields,'FIELDS','Choose at most32 fields including all declared entity keys.',400);
  return {schema:DEFINITION_SCHEMA,engine:ENGINE,title:input.title,
    serviceRoot:collection.serviceRoot,entitySet:collection.entitySet,keyFields:collection.keyFields,
    mapping:selected.map(p=>collection.mapping.find(f=>f.path===p)),
    initialScope:scope(collection),presenceMeaning:'Membership in a complete selected collection; removal does not assert deletion at the supplier.',
    publicationMeaning:'A publisher-selected sequence of complete retained collections, preserving each original query and acquisition window.'};
}
export function validateDefinition(definition){
  need(plain(definition)&&definition.schema===DEFINITION_SCHEMA&&definition.engine===ENGINE&&
    typeof definition.serviceRoot==='string'&&typeof definition.entitySet==='string'&&
    Array.isArray(definition.keyFields)&&definition.keyFields.length&&Array.isArray(definition.mapping)&&definition.mapping.length<=LIMITS.fields,
    'DEFINITION','Select a supported original subscription definition.');
  text(definition.title,'subscription title');need(new Set(definition.mapping.map(x=>x.path)).size===definition.mapping.length&&
    definition.keyFields.every(p=>definition.mapping.some(f=>f.path===p&&f.key===true)),
    'DEFINITION','Every distinct original key must remain selected.');
  return definition;
}
export function compatible(definition,collection){
  validateDefinition(definition);
  need(collection.serviceRoot===definition.serviceRoot&&collection.entitySet===definition.entitySet&&same(collection.keyFields,definition.keyFields),
    'SOURCE','The collection belongs to another original service, entity set or key selection.');
  for(const field of definition.mapping)need(same(collection.mapping.find(f=>f.path===field.path),field),
    'PROJECTION','A subscribed field or its original type declaration changed. Start a separately reviewed subscription.');
}
export async function sourceCollection(directory,definition){
  const collection=await openCollection(directory);if(definition)compatible(definition,collection);
  const merchant=parse(await read(join(collection.directory,'merchant.json'),16777216,collection.files['merchant.json']));
  const entity=operationFor(merchant.plan,merchant.catalog,collection.operation).entity;
  return {collection,merchant,entity};
}
export function sourceRecord(collection){
  return {collectionSha256:collection.manifestSha256,analysis:collection.analysis,sourceBinding:collection.sourceBinding,
    serviceRoot:collection.serviceRoot,entitySet:collection.entitySet,metadataSha256:collection.metadataSha256,
    merchantOrigin:collection.merchantOrigin,operation:collection.operation,rows:collection.rows,
    query:collection.query,queryFingerprint:collection.queryFingerprint,acquisition:collection.acquisition,
    pageCount:collection.pageCount,completion:collection.completion,reportedCounts:collection.reportedCounts,countConsistent:collection.countConsistent};
}
export function checkRow(row,definition){
  need(plain(row)&&Object.keys(row).length===2&&typeof row.key==='string'&&Buffer.byteLength(row.key)<=2097152&&plain(row.values),
    'ROW','Use a complete original keyed feed row.');
  need(same(Object.keys(row.values),definition.mapping.map(f=>f.path)),'ROW_FIELDS','The selected row fields or their order changed.');
  for(const field of definition.mapping){
    const value=row.values[field.path];need(value===null?field.nullable===true:typeof value==='string'||typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean',
      'ROW_VALUE','A feed row contains an unsupported scalar or required null.');
    if(value!==null&&['Edm.Int64','Edm.Decimal'].includes(field.underlyingType))need(typeof value==='string','EXACT_NUMBER','Retain the exact original numeric string.');
  }
  const entity={keyFields:definition.keyFields,fields:definition.mapping.map(f=>({path:f.path,type:f.underlyingType}))};
  need(collectionKeyIdentity(row.values,entity,{typeDefinitions:{}})===row.key,'KEY','A feed row does not match its declared original entity key.');
  need(rowBytes(row).length<=LIMITS.rowBytes,'ROW_LIMIT','One keyed feed row exceeds the supported size.');return row;
}
export function openIndex(path){
  const db=new DatabaseSync(path);db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA cache_size=-16384');
  return db;
}
export async function loadRows(db,table,path,expected,definition){
  need(['before_rows','after_rows','customer_rows'].includes(table),'INDEX','Use a native subscription index.');
  db.exec('CREATE TABLE '+table+' (key TEXT PRIMARY KEY, row TEXT NOT NULL) WITHOUT ROWID');
  const insert=db.prepare('INSERT INTO '+table+' (key,row) VALUES (?,?)');let count=0,prior=null;
  db.exec('BEGIN');try{for await(const row of lines(path,expected)){
    checkRow(row,definition);need(prior===null||ordered(prior,row.key)<0,'ORDER','The complete keyed row order or uniqueness changed.');
    prior=row.key;insert.run(row.key,JSON.stringify(row));count++;integer(count,1,LIMITS.rows,'row count');}
    db.exec('COMMIT');return count;
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
export async function outputWriter(path){
  const f=await open(path,'wx',0o600),hash=createHash('sha256');let count=0,closed=false;
  return {async write(raw){need(!closed,'WRITER','The output writer is closed.');count+=raw.length;need(count<=LIMITS.fileBytes,'OUTPUT_LIMIT','The complete feed output exceeds its byte limit.');hash.update(raw);await f.writeFile(raw);},
    async finish(){need(!closed,'WRITER','The output writer is closed.');closed=true;await f.sync();await f.close();return {bytes:count,sha256:hash.digest('hex')};},
    async close(){if(!closed){closed=true;await f.close();}}};
}
export async function derive({definition,source,previous,working}){
  compatible(definition,source.collection);const db=openIndex(join(working,'index.sqlite'));
  const rows=await outputWriter(join(working,'rows.jsonl')),changes=await outputWriter(join(working,'changes.jsonl'));
  const counts={before:previous?.rows??0,after:0,matched:0,added:0,removed:0,changed:0,unchanged:0,events:0};
  let left,right;
  try{
    if(previous){const n=await loadRows(db,'before_rows',previous.path,previous.identity,definition);need(n===previous.rows,'ROW_COUNT','The previous complete row count changed.');}
    else db.exec('CREATE TABLE before_rows (key TEXT PRIMARY KEY,row TEXT NOT NULL) WITHOUT ROWID');
    db.exec('CREATE TABLE after_rows (key TEXT PRIMARY KEY,row TEXT NOT NULL) WITHOUT ROWID');
    const insert=db.prepare('INSERT INTO after_rows (key,row) VALUES (?,?)');
    db.exec('BEGIN');try{for await(const raw of iterateCollectionRows(source.collection)){
      const values=Object.fromEntries(definition.mapping.map(f=>[f.path,raw[f.path]]));
      const row=checkRow({key:collectionKeyIdentity(raw,source.entity,source.merchant.catalog),values},definition);
      insert.run(row.key,JSON.stringify(row));counts.after++;integer(counts.after,1,LIMITS.rows,'source row count');
    }db.exec('COMMIT');}catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
    need(counts.after===source.collection.rows,'ROW_COUNT','The original source row count changed.');
    left=db.prepare('SELECT key,row FROM before_rows ORDER BY key COLLATE BINARY').iterate();
    right=db.prepare('SELECT key,row FROM after_rows ORDER BY key COLLATE BINARY').iterate();
    let b=left.next(),a=right.next();
    while(!b.done||!a.done){
      const order=b.done?1:a.done?-1:ordered(b.value.key,a.value.key);
      const before=order<=0&&!b.done?JSON.parse(b.value.row):null,after=order>=0&&!a.done?JSON.parse(a.value.row):null;
      if(after)await rows.write(rowBytes(after));
      let event;
      if(!before){counts.added++;event={key:after.key,operation:'upsert',before:null,after:rowHash(after),values:after.values};}
      else if(!after){counts.removed++;event={key:before.key,operation:'remove',before:rowHash(before),after:null};}
      else{counts.matched++;if(same(before,after))counts.unchanged++;else{counts.changed++;event={key:after.key,operation:'upsert',before:rowHash(before),after:rowHash(after),values:after.values};}}
      if(event){counts.events++;await changes.write(rowBytes(event));}
      if(order<=0&&!b.done)b=left.next();if(order>=0&&!a.done)a=right.next();
    }
    return {counts,files:{'rows.jsonl':await rows.finish(),'changes.jsonl':await changes.finish()}};
  }finally{left?.return?.();right?.return?.();db.close();await rows.close();await changes.close();}
}
export async function applyChanges(db,path,expected,definition,counts){
  const get=db.prepare('SELECT row FROM customer_rows WHERE key=?'),put=db.prepare('INSERT INTO customer_rows(key,row) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET row=excluded.row'),remove=db.prepare('DELETE FROM customer_rows WHERE key=?');
  let prior=null;const observed={added:0,removed:0,changed:0,events:0};
  db.exec('BEGIN');try{for await(const event of lines(path,expected)){
    shape(event,['key','operation','before','after','values'],'change event');
    need(typeof event.key==='string'&&(prior===null||ordered(prior,event.key)<0),'CHANGE_ORDER','The change order or uniqueness changed.');prior=event.key;
    const entry=get.get(event.key),before=entry?JSON.parse(entry.row):null;
    need(event.before===(before?rowHash(before):null),'CHANGE_BASE','A change does not match the saved customer row.');
    if(event.operation==='remove'){need(before&&event.after===null&&!Object.hasOwn(event,'values'),'CHANGE','Invalid selected-membership removal.');remove.run(event.key);observed.removed++;}
    else{need(event.operation==='upsert','CHANGE','Choose an original keyed upsert or removal.');
      const after=checkRow({key:event.key,values:event.values},definition);need(event.after===rowHash(after),'CHANGE_HASH','The changed row differs from its retained digest.');
      need(!before||!same(before,after),'CHANGE','An upsert repeats an unchanged row.');
      put.run(event.key,JSON.stringify(after));if(before)observed.changed++;else observed.added++;}
    observed.events++;integer(observed.events,1,2*LIMITS.rows,'change count');
  }for(const key of Object.keys(observed))need(observed[key]===counts[key],'CHANGE_COUNT','The complete '+key+' count differs.');db.exec('COMMIT');return observed;}
  catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
}
export async function exportIndex(db,path,definition){
  const output=await outputWriter(path);let count=0,iterator;
  try{iterator=db.prepare('SELECT row FROM customer_rows ORDER BY key COLLATE BINARY').iterate();
    for(const value of iterator){const row=checkRow(JSON.parse(value.row),definition);count++;await output.write(rowBytes(row));}
    return {rows:count,...await output.finish()};
  }finally{iterator?.return?.();await output.close();}
}

export function validateEdition(edition,definition){
  validateDefinition(definition);
  need(plain(edition)&&edition.schema===EDITION_SCHEMA&&edition.engine===ENGINE&&
    Number.isSafeInteger(edition.revision)&&edition.revision>0&&edition.revision<=LIMITS.editions&&
    typeof edition.definitionSha256==='string'&&/^[a-f0-9]{64}$/.test(edition.definitionSha256)&&
    (edition.revision===1?edition.previousSha256===null:/^[a-f0-9]{64}$/.test(edition.previousSha256))&&
    plain(edition.source)&&edition.source.serviceRoot===definition.serviceRoot&&edition.source.entitySet===definition.entitySet&&
    /^[a-f0-9]{64}$/.test(edition.source.collectionSha256)&&typeof edition.scopeChanged==='boolean',
    'EDITION','Choose a complete edition of the selected original subscription.');
  need(plain(edition.files)&&same(Object.keys(edition.files).sort(),['changes.jsonl','rows.jsonl']),'EDITION_FILES','The original edition file selection changed.');
  for(const file of Object.values(edition.files))need(plain(file)&&Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=LIMITS.fileBytes&&/^[a-f0-9]{64}$/.test(file.sha256),'EDITION_FILES','Invalid complete edition file identity.');
  const c=edition.counts;need(plain(c)&&same(Object.keys(c).sort(),['added','after','before','changed','events','matched','removed','unchanged']),'COUNTS','The complete edition counters changed.');
  for(const [key,value]of Object.entries(c))integer(value,0,key==='events'?2*LIMITS.rows:LIMITS.rows,key);
  need(c.after===edition.rows&&c.after===edition.source.rows&&c.after===c.matched+c.added&&c.before===c.matched+c.removed&&
    c.matched===c.changed+c.unchanged&&c.events===c.added+c.removed+c.changed,'COUNTS','The edition counters do not reconcile.');
  return edition;
}
