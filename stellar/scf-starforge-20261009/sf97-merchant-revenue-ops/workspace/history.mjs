// MIT. Read-only selection of the original committed commercial chains.
import { createHash } from 'node:crypto';

const REVISION = /^[a-f0-9]{64}$/;
const VERSION = /^[a-f0-9-]{36}$/;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(code,message) { throw Object.assign(new Error(message),{code,status:422}); }
function object(value,keys,label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key=>!keys.includes(key)))
    fail('INVALID_HISTORY_SELECTION','Use the documented '+label+' fields.');
}
function day(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
export function historyQuery(input={}) {
  object(input,['text','from','to','observationKind','sourceVersion'],'history query');
  const query={text:input.text??'',from:input.from??null,to:input.to??null,
    observationKind:input.observationKind??null,sourceVersion:input.sourceVersion??null};
  if(typeof query.text!=='string'||query.text.length>300) fail('INVALID_HISTORY_QUERY','Search text must be at most 300 characters.');
  query.text=query.text.trim();
  for(const value of [query.from,query.to]) if(value!==null&&!day(value))
    fail('INVALID_HISTORY_QUERY','Use real UTC saved dates in YYYY-MM-DD form.');
  if(query.from&&query.to&&query.from>query.to) fail('INVALID_HISTORY_QUERY','The saved-date range must be ordered.');
  if(query.observationKind!==null&&!['SESSION','DURABLE_HISTORY'].includes(query.observationKind))
    fail('INVALID_HISTORY_QUERY','Choose session or retained-history observations.');
  if(query.sourceVersion!==null&&!VERSION.test(query.sourceVersion))
    fail('INVALID_HISTORY_QUERY','Use the original saved pricing review ID.');
  return query;
}
export function selectCommercialHistory(entries,input={},scope) {
  object(input,['kind','selection','query','cursor','limit'],'history request');
  const kind=input.kind??'reviews';
  if(!['reviews','decisions'].includes(kind)||!REVISION.test(scope))
    fail('INVALID_HISTORY_SELECTION','Choose this workspace’s saved reviews or price decisions.');
  const latestRevision=entries.at(-1)?.revision??null;
  const selection=input.selection===undefined?{scope,kind,revision:latestRevision}:input.selection;
  object(selection,['scope','kind','revision'],'fixed history selection');
  if(selection.scope!==scope||selection.kind!==kind||
      (selection.revision!==null&&!REVISION.test(selection.revision)))
    fail('HISTORY_SOURCE_CHANGED','The selection belongs to another workspace or history. Open its current history.');
  const at=selection.revision===null?-1:entries.findIndex(entry=>entry.revision===selection.revision);
  if(selection.revision!==null&&at<0) fail('HISTORY_SOURCE_CHANGED','The selected original revision is unavailable. Reopen current history.');
  const retained=entries.slice(0,at+1),query=historyQuery(input.query);
  if(kind==='reviews'&&query.sourceVersion!==null) fail('INVALID_HISTORY_QUERY','Source review filtering applies to prepared price decisions.');
  if(kind==='decisions'&&query.observationKind!==null) fail('INVALID_HISTORY_QUERY','Observation filtering applies to saved pricing reviews.');
  const limit=input.limit??25;
  if(!Number.isInteger(limit)||limit<1||limit>100) fail('INVALID_HISTORY_QUERY','Choose a page size from 1 to 100.');
  const filtered=retained.slice().reverse().filter(entry=>{
    const row=entry.row, saved=typeof row.savedAt==='string'?row.savedAt.slice(0,10):'';
    if(query.from&&(!day(saved)||saved<query.from)||query.to&&(!day(saved)||saved>query.to))return false;
    if(query.observationKind&&row.observationKind!==query.observationKind)return false;
    if(query.sourceVersion&&row.sourceVersion!==query.sourceVersion)return false;
    const haystack=JSON.stringify([row.label,row.version,row.decision,row.revision,row.savedAt,
      row.sourceVersion,row.sourceRevision,row.sourceLabel,row.sellerSha256,row.snapshotSha256,row.sessionId,
      row.observationKind,row.observation,row.sourceSelection,row.sourcePackage]).toLocaleLowerCase('en-US');
    return !query.text||haystack.includes(query.text.toLocaleLowerCase('en-US'));
  });
  const signature=hash({selection,query,limit});let offset=0;
  if(input.cursor!==undefined&&input.cursor!==null) {
    if(typeof input.cursor!=='string'||input.cursor.length>1024||!/^[A-Za-z0-9_-]+$/.test(input.cursor))
      fail('INVALID_HISTORY_CURSOR','Use the returned next cursor with its original selection and filters.');
    let cursor;try{cursor=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));}catch{fail('INVALID_HISTORY_CURSOR','The history cursor is unreadable.');}
    object(cursor,['signature','after'],'history cursor');
    const index=filtered.findIndex(entry=>entry.revision===cursor.after);
    if(cursor.signature!==signature||index<0)fail('HISTORY_CURSOR_CHANGED','Keep the original selection, filters and page size when paging.');
    offset=index+1;
  }
  const page=filtered.slice(offset,offset+limit);
  const nextCursor=offset+page.length<filtered.length?Buffer.from(JSON.stringify({signature,after:page.at(-1).revision})).toString('base64url'):null;
  return {schema:'stellar-forge.merchant-commercial-history.v1',selection:{...selection},latestRevision,
    newRecords:entries.length-retained.length,totalRecords:retained.length,matchedRecords:filtered.length,
    query,limit,range:{from:page.length?offset+1:0,to:offset+page.length},nextCursor,rows:page.map(entry=>entry.row)};
}
