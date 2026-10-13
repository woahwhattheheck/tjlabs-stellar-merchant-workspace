// MIT. Portable query studies over the unchanged SF30 dataset engine.
export const STUDY_SCHEMA = 'stellar-forge.dataset-study.v1';
export const STUDY_MAX_BYTES = 8 * 1024 * 1024;
export const STUDY_MAX_EDITIONS = 200;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
const fail = message => { throw Object.assign(new TypeError(message), { code: 'DATASET_STUDY_INVALID', status: 400 }); };
const string = (v, n, label) => {
  if (typeof v !== 'string' || v.length > n) fail(label + ' must be text up to ' + n + ' characters.');
};
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = v => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,79}$/.test(v);
const at = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && !Number.isNaN(Date.parse(v));
const keys = (v, allowed, label) => {
  if (!object(v) || Object.keys(v).some(k => !allowed.includes(k))) fail('Invalid ' + label + ' properties.');
};
export function studyBytes(value) {
  const text = JSON.stringify(value);
  if (typeof text !== 'string') fail('A study object is required.');
  return new TextEncoder().encode(text+'\n').length;
}
function assertSize(value) {
  if (studyBytes(value) > STUDY_MAX_BYTES) fail('The complete study exceeds 8 MiB. Keep this working file and start a separate study.');
}
function dataset(value) {
  if (!object(value) || typeof value.name !== 'string' || !value.name.length || value.name.length > 128 ||
      !digest(value.snapshot) || !Array.isArray(value.columns) || !value.columns.length || value.columns.length > 64 ||
      !Number.isSafeInteger(value.rowCount) || value.rowCount < 0 ||
      !Number.isInteger(value.defaultLimit) || !Number.isInteger(value.maxLimit) ||
      value.defaultLimit < 1 || value.defaultLimit > value.maxLimit || value.maxLimit > 1000)
    fail('The study needs the original dataset description, snapshot and column schema.');
  const seen = new Set();
  for (const c of value.columns) {
    if (!object(c) || typeof c.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(c.name) ||
        ['constructor','prototype','__proto__'].includes(c.name) || seen.has(c.name) ||
        !['string','integer','number','boolean'].includes(c.type) || typeof c.nullable !== 'boolean' ||
        typeof c.filterable !== 'boolean' || (c.rangeFilterable !== undefined && typeof c.rangeFilterable !== 'boolean') ||
        (c.sortable !== undefined && typeof c.sortable !== 'boolean')) fail('Invalid exposed dataset column.');
    seen.add(c.name);
  }
}
function source(value) {
  keys(value, ['mode','resource','dataset'], 'source binding');
  if (!['file','service'].includes(value.mode) || !(value.resource === null || typeof value.resource === 'string')) fail('Invalid source binding.');
  if (value.resource !== null) {
    let url;
    try { url = new URL(value.resource); } catch { fail('Invalid public resource in source binding.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.href !== value.resource)
      fail('The source resource must be a canonical HTTPS URL.');
  }
  dataset(value.dataset);
}
function draft(value, description) {
  keys(value, ['mode','raw','selectedSnapshot','columns','sort','descending','limit'], 'query draft');
  if (!['guided','raw'].includes(value.mode)) fail('Invalid query editing mode.');
  string(value.raw, 8192, 'Raw query');
  if (value.selectedSnapshot !== '' && !digest(value.selectedSnapshot)) fail('Invalid selected snapshot.');
  string(value.sort, 64, 'Sort column'); string(value.limit, 128, 'Unfinished page size');
  if (typeof value.descending !== 'boolean' || !Array.isArray(value.columns) ||
      value.columns.length !== description.columns.length) fail('The draft must retain every exposed column.');
  const byName = new Map(description.columns.map(c => [c.name,c]));
  const seen = new Set();
  for (const c of value.columns) {
    keys(c, ['name','include','eqEnabled','eqValue','lowerOp','lowerValue','upperOp','upperValue'], 'column draft');
    if (!byName.has(c.name) || seen.has(c.name) || typeof c.include !== 'boolean' || typeof c.eqEnabled !== 'boolean' ||
        !['','gt','gte'].includes(c.lowerOp) || !['','lt','lte'].includes(c.upperOp)) fail('Invalid column draft.');
    for (const k of ['eqValue','lowerValue','upperValue']) string(c[k], 8192, 'Unfinished filter value');
    seen.add(c.name);
  }
  if (value.sort !== '' && !byName.has(value.sort)) fail('The sort column is absent from the bound source.');
}
function success(value, full) {
  if (value === null) return;
  if (!object(value) || !digest(value.snapshot) || typeof value.query !== 'string' || value.query.length > 8192 ||
      !at(value.executedAt)) fail('Invalid successful query record.');
  if (full) {
    if (value.schema !== 'stellar-forge.dataset-query.v1' || value.mode !== 'LOCAL_OPERATOR_PREVIEW' ||
        !object(value.result) || value.result.schema !== 'stellar-forge.dataset-page.v1') fail('Keep the original local preview result.');
    dataset(value.result.dataset);
    if (value.result.dataset.snapshot !== value.snapshot || !Array.isArray(value.result.fields) ||
        !value.result.fields.length || !Array.isArray(value.result.rows) || value.result.rows.length > 1000 ||
        !object(value.result.page) || value.result.page.returned !== value.result.rows.length ||
        !Number.isSafeInteger(value.result.page.total) || value.result.page.total < value.result.rows.length)
      fail('Invalid saved preview page.');
    const available = new Set(value.result.dataset.columns.map(c => c.name));
    if (new Set(value.result.fields).size !== value.result.fields.length || value.result.fields.some(f => !available.has(f)))
      fail('Invalid saved preview fields.');
    for (const row of value.result.rows) {
      if (!object(row) || Object.keys(row).length !== value.result.fields.length ||
          value.result.fields.some(f => !own(row,f) || !(row[f] === null || ['string','number','boolean'].includes(typeof row[f]))))
        fail('Invalid saved preview row.');
    }
    if (!(value.result.page.nextCursor === null || (typeof value.result.page.nextCursor === 'string' && value.result.page.nextCursor.length <= 512)))
      fail('Invalid saved continuation cursor.');
  } else if (!Array.isArray(value.fields) || !Number.isSafeInteger(value.total) || value.total < 0) fail('Invalid edition query summary.');
  for (const k of ['requestUrl','requestUnavailable','curl']) {
    if (value[k] !== undefined && value[k] !== null) string(value[k], 65536, 'Saved request example');
  }
}
export function validateStudy(value) {
  assertSize(value);
  keys(value, ['schema','mode','id','title','createdAt','updatedAt','parent','editions','working'], 'study');
  if (value.schema !== STUDY_SCHEMA || value.mode !== 'LOCAL_OPERATOR_PREVIEW' || !id(value.id) ||
      !at(value.createdAt) || !at(value.updatedAt)) fail('Invalid dataset study identity or dates.');
  string(value.title, 160, 'Study name');
  if (value.parent !== null) {
    keys(value.parent, ['id','edition'], 'study ancestry');
    if (!id(value.parent.id) || !Number.isSafeInteger(value.parent.edition) || value.parent.edition < 0) fail('Invalid study ancestry.');
  }
  keys(value.working, ['source','draft','lastSuccess'], 'working study');
  source(value.working.source); draft(value.working.draft,value.working.source.dataset); success(value.working.lastSuccess,true);
  if (!Array.isArray(value.editions) || value.editions.length > STUDY_MAX_EDITIONS) fail('A study may retain at most 200 editions.');
  for (let i=0; i<value.editions.length; i++) {
    const e=value.editions[i];
    keys(e,['number','at','reason','title','source','draft','success'],'study edition');
    if (e.number !== i+1 || !at(e.at)) fail('Study editions must retain their original consecutive order.');
    string(e.reason, 240, 'Edition reason'); string(e.title,160,'Edition study name');
    source(e.source); draft(e.draft,e.source.dataset); success(e.success,false);
  }
  return value;
}
export function sourceBinding(schema) {
  const result = { mode:schema.source, resource:schema.resource ?? null, dataset:clone(schema.dataset) };
  source(result); return result;
}
export function emptyDraft(description) {
  dataset(description);
  return { mode:'guided',raw:'',selectedSnapshot:'',columns:description.columns.map(c => ({
    name:c.name,include:true,eqEnabled:false,eqValue:'',lowerOp:'',lowerValue:'',upperOp:'',upperValue:''
  })),sort:'',descending:false,limit:String(description.defaultLimit) };
}
export function createStudy({schema,id:studyId,title='Untitled dataset study',at:time}) {
  const bound=sourceBinding(schema), d=emptyDraft(bound.dataset);
  if (bound.mode === 'service') d.selectedSnapshot=bound.dataset.snapshot;
  return validateStudy({ schema:STUDY_SCHEMA,mode:'LOCAL_OPERATOR_PREVIEW',id:studyId,title,createdAt:time,
    updatedAt:time,parent:null,editions:[],working:{source:bound,draft:d,lastSuccess:null} });
}
export function updateStudy(study,changes) {
  validateStudy(study);
  keys(changes,['title','draft','lastSuccess'],'study update');
  const next=clone(study);
  if (own(changes,'title')) next.title=changes.title;
  for (const k of ['draft','lastSuccess']) if (own(changes,k)) next.working[k]=clone(changes[k]);
  return validateStudy(next);
}
function summarize(last) {
  if (!last) return null;
  const {snapshot,query,executedAt,requestUrl,requestUnavailable}=last;
  return {snapshot,query,executedAt,requestUrl:requestUrl??null,requestUnavailable:requestUnavailable??null,
    fields:clone(last.result.fields),total:last.result.page.total};
}
export function checkpointStudy(study,{at:time,reason='Saved working study'}={}) {
  validateStudy(study);
  if (!at(time)) fail('An explicit save time is required.');
  string(reason,240,'Edition reason');
  const next=clone(study), w=next.working;
  const body={title:next.title,source:w.source,draft:w.draft,success:summarize(w.lastSuccess)};
  const prior=next.editions.at(-1);
  const priorBody=prior ? {title:prior.title,source:prior.source,draft:prior.draft,success:prior.success} : null;
  if (JSON.stringify(body) !== JSON.stringify(priorBody)) {
    if (next.editions.length >= STUDY_MAX_EDITIONS) fail('All 200 editions are retained. Save this file and start a separate study for further checkpoints.');
    next.editions.push({number:next.editions.length+1,at:time,reason,...clone(body)});
  }
  next.updatedAt=time; return validateStudy(next);
}
export function forkStudy(study,{id:studyId,title,at:time}) {
  validateStudy(study); const next=clone(study);
  next.parent={id:next.id,edition:next.editions.length}; next.id=studyId;
  next.createdAt=time; next.updatedAt=time;
  if (title !== undefined) next.title=title;
  return validateStudy(next);
}
export function rebindStudy(study,{schema,at:time}) {
  const next=checkpointStudy(study,{at:time,reason:'Preserved before adopting the displayed source'});
  const bound=sourceBinding(schema), fresh=emptyDraft(bound.dataset), old=new Map(next.working.draft.columns.map(c=>[c.name,c]));
  const definitions=new Map(next.working.source.dataset.columns.map(c=>[c.name,c]));
  fresh.columns=fresh.columns.map(c=>{
    const earlier=definitions.get(c.name), now=bound.dataset.columns.find(v=>v.name===c.name);
    return earlier && earlier.type===now.type && earlier.nullable===now.nullable ? clone(old.get(c.name)) : c;
  });
  const before=next.working.draft;
  fresh.mode=before.mode; fresh.raw=before.raw; fresh.limit=before.limit; fresh.descending=before.descending;
  fresh.sort=bound.dataset.columns.some(c=>c.name===before.sort && c.sortable) ? before.sort : '';
  fresh.selectedSnapshot=bound.mode==='service' ? bound.dataset.snapshot : '';
  next.working={source:bound,draft:fresh,lastSuccess:null};
  return validateStudy(next);
}
export function restoreEdition(study,{number,at:time}) {
  validateStudy(study);
  const e=study.editions.find(v=>v.number===number);
  if (!e) fail('Choose an existing edition.');
  const next=checkpointStudy(study,{at:time,reason:'Preserved before restoring edition '+number});
  next.title=e.title; next.working={source:clone(e.source),draft:clone(e.draft),lastSuccess:null};
  return validateStudy(next);
}
export function sameSource(study,schema) {
  validateStudy(study); const a=study.working.source,b=sourceBinding(schema);
  return a.mode===b.mode && a.resource===b.resource &&
    (a.mode==='service' || a.dataset.snapshot===b.dataset.snapshot);
}
export function queryFromDraft(draftValue,description,{service=false}={}) {
  draft(draftValue,description);
  const q=new URLSearchParams();
  const fields=draftValue.columns.filter(c=>c.include).map(c=>c.name);
  if (!fields.length) fail('Select at least one output field.');
  q.set('fields',fields.join(',')); q.set('limit',draftValue.limit);
  if (service && draftValue.selectedSnapshot) q.set('snapshot',draftValue.selectedSnapshot);
  for (const c of draftValue.columns) {
    if (c.eqEnabled) q.set('where_'+c.name,c.eqValue);
    if (c.lowerOp) q.set(c.lowerOp+'_'+c.name,c.lowerValue);
    if (c.upperOp) q.set(c.upperOp+'_'+c.name,c.upperValue);
  }
  if (draftValue.sort) q.set('sort',(draftValue.descending?'-':'')+draftValue.sort);
  return q.toString();
}
