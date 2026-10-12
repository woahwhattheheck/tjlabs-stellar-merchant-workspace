// SPDX-License-Identifier: MIT
// Official GLEIF JSON:API source meanings and the shared browser/Node research model.
export const SCHEMA = 'stellar-forge.gleif-research.v1';
export const API = 'https://api.gleif.org/api/v1/lei-records';
export const SOURCE = Object.freeze({
  publisher: 'Global Legal Entity Identifier Foundation',
  name: 'GLEIF LEI reference data',
  api: 'https://www.gleif.org/en/lei-data/gleif-api/',
  documentation: 'https://documenter.getpostman.com/view/7679680/SVYrrxuU',
  dictionary: 'https://www.gleif.org/en/lei-data/access-and-use-lei-data/gleif-data-dictionary',
  terms: 'https://www.gleif.org/en/meta/lei-data-terms-of-use'
});
export const COLUMNS = Object.freeze(['lei','legalName','legalNameLanguage','otherNames','transliteratedOtherNames',
  'entityStatus','category','subCategory','legalJurisdiction','legalFormId','legalFormOther',
  'registrationAuthorityId','registrationAuthorityEntityId','legalAddress','headquartersAddress',
  'creationDate','registrationStatus','initialRegistrationDate','lastUpdateDate','nextRenewalDate',
  'managingLou','validationSources','bic','successorEntities','entityEvents','relationshipReferences',
  'captureId','sourcePage','sourceObservedAt']);
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const clone = value => JSON.parse(JSON.stringify(value));
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const stable = value => JSON.stringify(canonical(value));
export function fail(code, message, status = 400) { throw Object.assign(new Error(message || code), {code, status}); }
export function need(condition, code, message, status) { if (!condition) fail(code, message, status); }
export function label(value, name = 'value', max = 1000, optional = false) {
  need(typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) &&
    (optional || value.trim().length > 0), 'GLEIF_INPUT', 'Enter a valid ' + name + '.');
  return value;
}
export function key(value, name = 'record ID') {
  need(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(value), 'GLEIF_ID', 'Choose a simple ' + name + '.');
  return value;
}
export function lei(value) {
  need(typeof value === 'string' && /^[A-Z0-9]{18}[0-9]{2}$/.test(value), 'GLEIF_LEI', 'Use the complete 20-character uppercase LEI.');
  let remainder = 0;
  for (const c of value) for (const digit of (/[0-9]/.test(c) ? c : String(c.charCodeAt(0)-55))) remainder = (remainder*10+Number(digit))%97;
  need(remainder === 1, 'GLEIF_LEI_CHECK_DIGITS', 'The LEI check digits do not match.');
  return value;
}
export function plan(value) {
  need(object(value) && ['name','lei'].includes(value.kind), 'GLEIF_QUERY', 'Select a name search or exact LEI.');
  const result = {kind:value.kind, query:value.kind === 'lei' ? lei(value.query) : label(value.query,'legal name',500)};
  if (value.kind === 'name') {
    const pageSize = value.pageSize ?? 100;
    need(Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100, 'GLEIF_PAGE_SIZE','Choose 1 to 100 records per source page.');
    result.pageSize = pageSize;
    if (value.country) { need(/^[A-Z]{2}$/.test(value.country),'GLEIF_COUNTRY','Use the two-letter source country code.'); result.country=value.country; }
    for (const name of ['entityStatus','registrationStatus']) if (value[name]) {
      need(/^[A-Z][A-Z_]{0,63}$/.test(value[name]),'GLEIF_STATUS','Use the exact source status.'); result[name]=value[name];
    }
  } else need(!value.country && !value.entityStatus && !value.registrationStatus,'GLEIF_QUERY','Exact LEI lookup does not use search filters.');
  return result;
}
export function queryUrl(value) {
  const selected=plan(value); if(selected.kind==='lei') return API+'/'+selected.query;
  const url=new URL(API); url.searchParams.set('filter[entity.legalName]',selected.query);
  if(selected.country) url.searchParams.set('filter[entity.legalAddress.country]',selected.country);
  if(selected.entityStatus) url.searchParams.set('filter[entity.status]',selected.entityStatus);
  if(selected.registrationStatus) url.searchParams.set('filter[registration.status]',selected.registrationStatus);
  url.searchParams.set('page[size]',String(selected.pageSize));url.searchParams.set('page[number]','1');return url.href;
}
export function linkUrl(link) {
  if(link === null || link === undefined) return null;
  const value=object(link)?link.href:link;
  need(typeof value==='string' && value.length<=16000,'GLEIF_SOURCE_LINK','The source returned an invalid page link.');
  return value;
}
export function sameRequest(a,b) {
  const x=new URL(a),y=new URL(b);
  const entries=u=>[...u.searchParams.entries()].sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv));
  return x.origin===y.origin&&x.pathname===y.pathname&&stable(entries(x))===stable(entries(y));
}
function pageSelection(url) {
  return [...url.searchParams.entries()].filter(([k])=>k!=='page[number]').sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv));
}
export function nextPage(link,first,current) {
  const value=linkUrl(link);if(value===null) return null;
  let url;try{url=new URL(value,current);}catch{fail('GLEIF_SOURCE_LINK','The source page link is not a URL.');}
  const initial=new URL(first),before=new URL(current);
  need(url.origin===new URL(API).origin && url.pathname===initial.pathname && !url.username && !url.password && !url.hash &&
    stable(pageSelection(url))===stable(pageSelection(initial)),
    'GLEIF_SOURCE_SCOPE_CHANGED','The next page changes the original source query.');
  const n=url.searchParams.getAll('page[number]'),old=Number(before.searchParams.get('page[number]')??1);
  need(n.length===1 && /^[1-9][0-9]*$/.test(n[0]) && Number.isSafeInteger(Number(n[0])) && Number(n[0])===old+1,
    'GLEIF_SOURCE_PAGE_SEQUENCE','The source did not return the following page in this query.');
  return url.href;
}
export function decodePage(raw, url) {
  label(raw,'source JSON',64*1024*1024);
  let data;try{data=JSON.parse(raw);}catch{fail('GLEIF_SOURCE_JSON','The original response is not valid JSON.');}
  need(object(data) && !data.errors && (Array.isArray(data.data)||object(data.data)||data.data===null),
    'GLEIF_SOURCE_RESPONSE','The response must contain the original JSON:API data.');
  const resources=data.data===null?[]:Array.isArray(data.data)?data.data:[data.data];
  for(const resource of resources) {
    need(object(resource)&&resource.type==='lei-records'&&typeof resource.id==='string'&&object(resource.attributes),
      'GLEIF_SOURCE_RESOURCE','The selected response must contain original LEI resources.');
    lei(resource.id);need(resource.attributes.lei===resource.id,'GLEIF_SOURCE_IDENTITY','The resource ID and LEI field differ.');
    need(object(resource.attributes.entity)&&object(resource.attributes.entity.legalName)&&
      typeof resource.attributes.entity.legalName.name==='string','GLEIF_SOURCE_NAME','The source legal name is missing.');
  }
  if(data.included!==undefined)need(Array.isArray(data.included),'GLEIF_SOURCE_INCLUDED','The source included records are malformed.');
  if(data.links!==undefined)need(object(data.links),'GLEIF_SOURCE_LINKS','The source links are malformed.');
  return {document:data,resources,next:linkUrl(data.links?.next),sourceUrl:url};
}
const cell=value=>value===null||value===undefined?'':typeof value==='string'?value:JSON.stringify(value);
export function projectEntity(resource,context) {
  const a=resource.attributes,e=a.entity,r=a.registration??{},form=e.legalForm??{};
  return {
    lei:resource.id,legalName:e.legalName.name,legalNameLanguage:cell(e.legalName.language??e.legalName.lang),
    otherNames:cell(e.otherNames??[]),transliteratedOtherNames:cell(e.transliteratedOtherNames??[]),
    entityStatus:cell(e.status),category:cell(e.category),subCategory:cell(e.subCategory),legalJurisdiction:cell(e.jurisdiction),
    legalFormId:cell(form.id),legalFormOther:cell(form.other),registrationAuthorityId:cell(e.registeredAt?.id),
    registrationAuthorityEntityId:cell(e.registeredAs),
    legalAddress:cell(e.legalAddress),headquartersAddress:cell(e.headquartersAddress),creationDate:cell(e.creationDate),
    registrationStatus:cell(r.status),initialRegistrationDate:cell(r.initialRegistrationDate),lastUpdateDate:cell(r.lastUpdateDate),
    nextRenewalDate:cell(r.nextRenewalDate),managingLou:cell(r.managingLou),validationSources:cell(r.corroborationLevel??r.validationSources),
    bic:cell(a.bic??[]),successorEntities:cell(e.successorEntities??(e.successorEntity?[e.successorEntity]:[])),
    entityEvents:cell(e.eventGroups??[]),relationshipReferences:cell(resource.relationships??{}),
    captureId:context.captureId,sourcePage:String(context.page),sourceObservedAt:context.observedAt
  };
}
export function assembleCapture(capture,pages) {
  need(capture.schema===SCHEMA+'.capture'&&Array.isArray(capture.pages)&&capture.pages.length===pages.length,
    'GLEIF_CAPTURE','Choose a complete retained capture.');
  const records=[],seen=new Map();let first=queryUrl(capture.plan),expected=first;
  for(let i=0;i<pages.length;i++) {
    const page=capture.pages[i],decoded=decodePage(pages[i],page.url);
    need(sameRequest(page.url,expected),'GLEIF_CAPTURE_SEQUENCE','The retained page sequence differs from its query.');
    for(const record of decoded.resources) {
      need(!seen.has(record.id),'GLEIF_CAPTURE_DUPLICATE','The source repeated LEI '+record.id+' across this capture; retain the pages and refresh the query.');
      seen.set(record.id,true);
      records.push({row:projectEntity(record,{captureId:capture.id,page:i+1,observedAt:page.observedAt}),resource:clone(record),page:i+1});
    }
    expected=nextPage(decoded.next,first,page.url);
    need(i===pages.length-1||expected!==null,'GLEIF_CAPTURE_SEQUENCE','Pages occur after the source ended.');
  }
  need((capture.next===null&&expected===null)||(typeof capture.next==='string'&&typeof expected==='string'&&sameRequest(capture.next,expected)),'GLEIF_CAPTURE_CURSOR','The saved continuation differs from the retained response.');
  need(capture.state!=='COMPLETE'||(pages.length>0&&expected===null),'GLEIF_CAPTURE_INCOMPLETE','The original source still has pages.');
  return {records,complete:capture.state==='COMPLETE',next:expected};
}
export function compareRecords(before,after) {
  const a=new Map(before.map(x=>[x.resource.id,x])),b=new Map(after.map(x=>[x.resource.id,x])),added=[],missing=[],changed=[],unchanged=[];
  for(const [id,item]of b){if(!a.has(id))added.push(item);else{
    const old=a.get(id),fields=[];diff(old.resource.attributes,item.resource.attributes,'/attributes',fields);
    diff(old.resource.relationships??{},item.resource.relationships??{},'/relationships',fields);
    if(fields.length)changed.push({lei:id,legalName:item.row.legalName,before:old,after:item,fields});else unchanged.push(id);
  }}
  for(const [id,item]of a)if(!b.has(id))missing.push(item);
  return {added,missing,changed,unchanged,counts:{before:a.size,after:b.size,added:added.length,missing:missing.length,changed:changed.length,unchanged:unchanged.length}};
}
function diff(a,b,path,out) {
  if(stable(a)===stable(b))return;
  if(object(a)&&object(b)){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],path+'/'+k.replaceAll('~','~0').replaceAll('/','~1'),out);}
  else out.push({path,before:a===undefined?null:clone(a),after:b===undefined?null:clone(b),beforePresent:a!==undefined,afterPresent:b!==undefined});
}
export function reviewInput(value,captures) {
  need(object(value),'GLEIF_REVIEW','Choose an entity and review decision.');
  const capture=captures.find(c=>c.id===value.captureId);need(capture,'GLEIF_REVIEW_CAPTURE','The source capture is not retained.');
  const result={id:key(value.id),title:label(value.title,'company research title',200),captureId:capture.id,
    lei:lei(value.lei),decision:value.decision,reviewer:label(value.reviewer,'reviewer',200),
    rationale:label(value.rationale,'research rationale',8000,true),
    useCase:label(value.useCase??'','customer use case',4000,true),nextWork:label(value.nextWork??'','next research work',4000,true)};
  need(['include','exclude','research'].includes(result.decision),'GLEIF_REVIEW_DECISION','Choose Include, Exclude or Research.');
  return result;
}
export function csv(rows,{spreadsheet=false}={}) {
  const quote=value=>{let text=cell(value);if(spreadsheet&&/^[\u0009\u000d\u0020]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  return [COLUMNS,...rows.map(row=>COLUMNS.map(k=>row[k]))].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
}
export function escapeHtml(value) {return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
export function reportHtml({title,createdAt,records,reviews,captures,comparison=null}) {
  const e=escapeHtml;
  const bySource=new Map(reviews.map(r=>[r.captureId+'/'+r.lei,r]));
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+e(title)+'</title>'+
    '<style>body{font:15px/1.5 system-ui,sans-serif;color:#202020;max-width:1200px;margin:2rem auto;padding:0 1rem}h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;border:1px solid #ccc;padding:8px;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}pre{white-space:pre-wrap;overflow-wrap:anywhere}section{break-inside:avoid;margin:2rem 0}.muted{color:#555}@media print{body{font-size:11pt}a{color:inherit}}</style>'+
    '<h1>'+e(title)+'</h1><p>Prepared '+e(createdAt)+'. Source: <a href="'+SOURCE.api+'">GLEIF LEI reference data</a>.</p>'+
    '<h2>Selected source editions</h2><table><thead><tr><th>Edition</th><th>Search</th><th>State</th><th>Pages</th><th>Captured</th></tr></thead><tbody>'+
    captures.map(c=>'<tr><td>'+e(c.id)+'</td><td>'+e(c.plan.query)+'</td><td>'+e(c.state)+'</td><td>'+c.pages.length+'</td><td>'+e(c.createdAt)+'</td></tr>').join('')+'</tbody></table>'+
    '<p>Legal-entity status and LEI registration status are retained as separate source fields. Research decisions refer to the selected original record. A record absent from a later search is an absence within that search result.</p>'+
    (comparison?'<h2>Source revision comparison</h2><pre>'+e(JSON.stringify(comparison,null,2))+'</pre>':'')+
    '<h2>Company research</h2>'+records.map(item=>{const r=item.row,review=bySource.get(r.captureId+'/'+r.lei);return '<section><h3>'+e(r.legalName)+'</h3><table><tbody>'+
    Object.entries(r).map(([k,v])=>'<tr><th>'+e(k)+'</th><td>'+e(v)+'</td></tr>').join('')+'</tbody></table>'+
    (review?'<h4>Saved research decision</h4><p>'+e(review.decision)+' · '+e(review.reviewer)+'</p><p>'+e(review.rationale)+'</p><p>'+e(review.useCase)+'</p><p>'+e(review.nextWork)+'</p>':'<p class="muted">Awaiting a saved research decision for this source edition.</p>')+
    '<details><summary>Complete original JSON:API resource</summary><pre>'+e(JSON.stringify(item.resource,null,2))+'</pre></details></section>';}).join('')+
    '<p>Reference data: <a href="'+SOURCE.terms+'">GLEIF LEI Data Terms of Use</a>. Original responses and full source observations accompany this report.</p></html>';
}
