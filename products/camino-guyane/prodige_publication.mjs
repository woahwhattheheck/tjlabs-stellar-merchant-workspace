/**
 * Prodige publication preparation for an existing Analysis export.
 * Original dataset, query, review and workbook engines remain the source owners.
 * This module does not send HTTP requests or store credentials.
 */
export class ProdigeContractError extends Error {
  constructor(code, message, detail = {}) {
    super(message); this.name = 'ProdigeContractError'; this.code = code; this.detail = detail;
  }
}
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function fail(code, message, detail) { throw new ProdigeContractError(code, message, detail); }
function object(v, label) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('OBJECT_REQUIRED', label);
  return v;
}
function text(v, label) {
  if (typeof v !== 'string' || !v.length) fail('TEXT_REQUIRED', label);
  return v;
}
function jsonValue(v, label = 'value') {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
  if (typeof v === 'number' && Number.isFinite(v) &&
      (!Number.isInteger(v) || Number.isSafeInteger(v))) return;
  if (Array.isArray(v)) { v.forEach((x, i) => jsonValue(x, label + '[' + i + ']')); return; }
  if (v && Object.getPrototypeOf(v) === Object.prototype) {
    for (const [k, x] of Object.entries(v)) jsonValue(x, label + '.' + k);
    return;
  }
  fail('NONPORTABLE_VALUE', 'Use original finite JSON values; retain precise decimal values as text.', {label});
}
function clone(v) { jsonValue(v); return JSON.parse(JSON.stringify(v)); }
function stable(v) {
  jsonValue(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v !== null && typeof v === 'object')
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function pin(v, label) {
  object(v, label);
  if (!Number.isSafeInteger(v.bytes) || v.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(v.sha256 || '')) fail('SOURCE_IDENTITY_REQUIRED', label);
  return clone(v);
}
function operation(spec, path, method) {
  const p = object(spec.paths, 'OpenAPI paths')[path];
  const op = p && p[method];
  if (!op) fail('OPERATION_ABSENT', 'The selected instance does not declare this operation.', {path, method});
  return op;
}
function declared(op, names) {
  const qs = new Set((op.parameters || []).filter(p => p.in === 'query').map(p => p.name));
  for (const name of names) if (!qs.has(name))
    fail('QUERY_PARAMETER_ABSENT', 'Use the actual selected specification.', {name});
}
export function inspectSpecification(document) {
  const spec = object(document.spec || document, 'OpenAPI document');
  if (!/^3\./.test(spec.openapi || '')) fail('OPENAPI_VERSION', 'A complete OpenAPI 3 document is required.');
  const read = operation(spec, '/api/data/{uuid}', 'get');
  operation(spec, '/api/structure/{uuid}', 'get');
  declared(read, ['limit', 'offset', 'sort_by', 'nature']);
  const methods = [];
  for (const [path, entry] of Object.entries(spec.paths)) {
    for (const [method, value] of Object.entries(entry)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
      methods.push({path, method: method.toUpperCase(), operationId: value.operationId || null,
        parameters: (value.parameters || []).map(x => ({
          name: x.name, in: x.in, required: Boolean(x.required), schema: clone(x.schema || {})
        }))});
    }
  }
  return {schema: 'commons.prodige-instance-contract.v1', openapi: spec.openapi,
    title: spec.info?.title || null, version: spec.info?.version || null,
    read: {method: 'GET', path: '/api/data/{uuid}', pagination: 'Link response header'},
    structure: {method: 'GET', path: '/api/structure/{uuid}'},
    authentication: clone(spec.components?.securitySchemes || {}),
    security: clone(spec.security || []), operations: methods};
}
function verifiedText(raw, expected, identify, label) {
  text(raw, label); pin(expected, label + ' identity');
  if (typeof identify !== 'function') fail('HASH_FUNCTION_REQUIRED', 'Use the original runtime SHA-256 function.');
  const actual=identify(raw); pin(actual,'calculated '+label);
  if(actual.bytes!==expected.bytes||actual.sha256!==expected.sha256)
    fail('WHOLE_FILE_CHANGED','The complete selected file differs from its retained identity.',{label,expected,actual});
  return actual;
}
function pointer(root, path, label) {
  if(path==='') return root;
  if(typeof path!=='string'||!path.startsWith('/')) fail('JSON_POINTER','Use an explicit JSON Pointer.',{label});
  let current=root;
  for(const encoded of path.slice(1).split('/')) {
    if(/~(?:[^01]|$)/.test(encoded)) fail('JSON_POINTER','Invalid JSON Pointer escape.',{label});
    const name=encoded.replace(/~1/g,'/').replace(/~0/g,'~');
    if(!current||typeof current!=='object'||!own(current,name))
      fail('SOURCE_POINTER_ABSENT','The original file does not contain the selected value.',{label,path});
    current=current[name];
  }
  return current;
}
function fieldName(v, label) {
  text(v, label);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) fail('FIELD_NAME', 'Select an explicit portable target field name.', {label, value:v});
  return v;
}
function cell(v, rule, label) {
  if (v === null) {
    if (!rule.nullable) fail('NULL_NOT_ALLOWED', 'A selected target field is not nullable.', {label});
    return null;
  }
  if (rule.type === 'text') {
    if (typeof v !== 'string') fail('TEXT_CELL', 'Do not coerce an original cell implicitly.', {label});
    return v;
  }
  if (rule.type === 'integer') {
    if (!Number.isSafeInteger(v)) fail('INTEGER_CELL', 'A safe integer is required.', {label});
    return v;
  }
  if (rule.type === 'decimal-text') {
    if (typeof v !== 'string' || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(v))
      fail('DECIMAL_CELL', 'Retain an explicit decimal token as text.', {label});
    if (rule.scale !== undefined) {
      if (!Number.isSafeInteger(rule.scale) || rule.scale < 0) fail('DECIMAL_SCALE', label);
      const scale = v.includes('.') ? v.split('.')[1].length : 0;
      if (scale !== rule.scale) fail('DECIMAL_SCALE', 'The source token does not match its selected fixed scale.', {label});
    }
    return v;
  }
  if (rule.type === 'boolean') {
    if (typeof v !== 'boolean') fail('BOOLEAN_CELL', label);
    return v;
  }
  fail('FIELD_TYPE', 'Use text, integer, decimal-text or boolean for a publication attribute.', {label});
}
function origin(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash ||
      !['', '/'].includes(u.pathname)) fail('TARGET_ORIGIN', 'Select one HTTPS catalogue origin.');
  return u.origin;
}
function uuid(value) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value || ''))
    fail('RESOURCE_UUID', 'Use the existing selected catalogue resource UUID.');
  return value;
}
function geometry(value, selection, label) {
  if (selection.kind === 'tabular') {
    if (value !== undefined && value !== null) fail('TABULAR_GEOMETRY', label);
    return null;
  }
  object(value, label);
  if (value.type !== selection.geometryType) fail('GEOMETRY_TYPE', 'Preserve the selected resource geometry type.', {label});
  jsonValue(value, label);
  if (selection.geometryType === 'GeometryCollection' ? !Array.isArray(value.geometries) : !Array.isArray(value.coordinates))
    fail('GEOMETRY_STRUCTURE', label);
  return clone(value);
}
function csvCell(v) {
  const s = v === null ? '' : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}
export function prepareEdition(input, {identify} = {}) {
  object(input, 'publication input');
  text(input.operationId, 'operationId');
  const source = object(input.source, 'original export');
  text(source.editionId, 'original editionId');
  text(source.producer, 'original producer');
  verifiedText(source.raw,source.file,identify,'whole original export');
  const sourceDocument=JSON.parse(source.raw);
  const rows=pointer(sourceDocument,source.rowsPointer,'original export rows');
  const selection = object(input.selection, 'publication selection');
  if (!['tabular', 'geographic'].includes(selection.kind)) fail('RESOURCE_KIND', 'Select tabular or geographic.');
  const columns = selection.columns;
  if (!Array.isArray(columns) || !columns.length) fail('COLUMNS_REQUIRED', 'Select every published column explicitly.');
  const sourceNames = new Set(), targets = new Set();
  for (const c of columns) {
    object(c, 'column'); text(c.source, 'source column JSON Pointer'); fieldName(c.target, 'target column');
    if (sourceNames.has(c.source) || targets.has(c.target)) fail('DUPLICATE_COLUMN', 'Column mapping must be one-to-one.');
    if (c.target === 'gid') fail('SERVER_IDENTIFIER', 'Keep server gid separate from original business identifiers.');
    sourceNames.add(c.source); targets.add(c.target);
  }
  const key = fieldName(selection.key, 'business key');
  if (!targets.has(key)) fail('KEY_MAPPING', 'The business key must be in the selected attribute mapping.');
  if (selection.kind === 'geographic') {
    text(selection.sourceCrs, 'source CRS'); text(selection.targetCrs, 'target resource CRS');
    if (selection.sourceCrs !== selection.targetCrs) fail('CRS_TRANSFORM_REQUIRED', 'Use the selected original GIS transform before this handoff.');
    text(selection.geometryColumn, 'original geometry column');
    if (!['Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon','GeometryCollection'].includes(selection.geometryType))
      fail('GEOMETRY_TYPE', 'Select the original resource geometry type.');
  }
  if (!Array.isArray(rows)) fail('ROWS_REQUIRED', 'The selected original JSON Pointer must contain every exported row.');
  const seen = new Set();
  const features = rows.map((row, index) => {
    object(row, 'original row');
    const properties = {};
    for (const c of columns) {
      const value=cell(pointer(row,c.source,c.source+'@'+index),c,c.source+'@'+index);
      Object.defineProperty(properties,c.target,{value,enumerable:true,writable:true,configurable:true});
    }
    const k = properties[key];
    if (typeof k !== 'string' || !k.length) fail('KEY_VALUE', 'Business identifiers must be nonempty original text.', {index});
    if (seen.has(k)) fail('DUPLICATE_KEY', 'Original business keys must be unique.', {key:k});
    seen.add(k);
    return {type:'Feature', properties, geometry:geometry(selection.kind==='tabular'?null:pointer(row,selection.geometryColumn,'original geometry'), selection, 'geometry@' + index)};
  });
  const geojson = {type:'FeatureCollection',features};
  const names = columns.map(c => c.target);
  const csv = [names.map(csvCell).join(','), ...features.map(f => names.map(n => csvCell(f.properties[n])).join(','))].join('\r\n') + '\r\n';
  return {schema:'commons.prodige-publication-edition.v1', operationId:input.operationId,
    source:clone(Object.fromEntries(Object.entries(source).filter(([key])=>key!=='raw'))), selection:clone(selection), rowCount:features.length,
    geojson, csv, csvInterpretation:{
      encoding:'UTF-8', delimiter:',', quote:'"', lineEnding:'CRLF',
      nullRepresentation:'empty CSV field; exact null versus empty-string meaning remains in the GeoJSON and column mapping',
      spreadsheetOpening:'Import as data with explicit column types; formula-looking original text remains unchanged.',
      geometry:'Retained in the complete GeoJSON; CSV contains selected attributes.'
    }};
}
export function prepareRequests(specificationText, edition, target, {identify} = {}) {
  object(target, 'target selection');
  const allowedTargetFields = new Set(['origin','resourceUuid','specification','mode','batchSize','gidByBusinessKey']);
  for (const key of Object.keys(target)) if (!allowedTargetFields.has(key))
    fail('TARGET_SELECTION_FIELD', 'Keep credentials and transport settings in the existing authorized target session.', {key});
  verifiedText(specificationText,target.specification,identify,'selected instance specification');
  const document=JSON.parse(specificationText);
  const spec = document.spec || document;
  inspectSpecification(spec);
  if (edition.schema !== 'commons.prodige-publication-edition.v1') fail('EDITION_SCHEMA', 'Use prepareEdition output.');
  object(target, 'target selection');
  const base = origin(target.origin), resource = uuid(target.resourceUuid);
  pin(target.specification, 'whole selected instance OpenAPI file');
  const kind = edition.selection.kind;
  const mode = target.mode;
  if (!['append','update'].includes(mode)) fail('PUBLICATION_MODE', 'Select append or update for the reviewed edition.');
  const path = mode === 'append'
    ? (kind === 'tabular' ? '/api/data_tabulaire/{uuid}' : '/api/data/{uuid}')
    : (kind === 'tabular' ? '/api/data_tabulaire/{uuid}' : '/api/data/{uuid}/{column_id}');
  const method = mode === 'append' ? 'post' : 'patch';
  const op = operation(spec, path, method);
  if (!op.requestBody?.content?.['application/json']) fail('BODY_CONTRACT', 'Selected operation must accept application/json.');
  const readPath = '/api/data/' + encodeURIComponent(resource);
  const url = base + path.replace('{uuid}',encodeURIComponent(resource)).replace('{column_id}','gid');
  const map = object(target.gidByBusinessKey || {}, 'selected original gid map');
  const selectedKeys = new Set(edition.geojson.features.map(f=>f.properties[edition.selection.key]));
  for (const key of Object.keys(map)) if (!selectedKeys.has(key))
    fail('EXTRA_GID_BINDING', 'The gid mapping includes a row outside the selected original edition.', {key});
  const gids = new Set();
  const features = edition.geojson.features.map(f=>{
    const out=clone(f), key=f.properties[edition.selection.key];
    if (mode === 'update') {
      if (!own(map,key) || (!Number.isSafeInteger(map[key]) && !/^[0-9]+$/.test(map[key] || '')))
        fail('GID_MAPPING', 'Updates require each actual target gid received from the target.', {key});
      const gid=String(map[key]);
      if (gids.has(gid)) fail('DUPLICATE_GID', 'Two business keys resolve to the same target record.', {gid});
      gids.add(gid); out.properties.gid=map[key];
    } else if (own(map,key)) fail('APPEND_GID', 'Append must leave server-generated gid absent.', {key});
    return out;
  });
  const batchSize = target.batchSize;
  if (!Number.isSafeInteger(batchSize) || batchSize<1) fail('BATCH_SELECTION', 'Supply the accepted instance batch size explicitly.');
  const requests=[];
  for(let start=0;start<features.length;start+=batchSize)
    requests.push({index:requests.length,method:method.toUpperCase(),url,
      headers:{'Content-Type':'application/json'},body:{type:'FeatureCollection',features:features.slice(start,start+batchSize)}});
  return {schema:'commons.prodige-publication-request-plan.v1', operationId:edition.operationId,
    source:clone(edition.source), selection:clone(edition.selection), target:clone(target),
    rowCount:features.length, structure:{method:'GET',url:base+'/api/structure/'+resource},
    readback:{method:'GET',url:base+readPath+'?nature=edit&sort_by=gid%3Aasc&limit='+batchSize+'&offset=0',
      next:'Follow each original Link rel=next on this same origin and resource; retain all pages/headers.'},
    requests, execution:{state:'PREPARED',credentialCustody:'existing authorized target session',
      writeReplay:'Retain the exact request and calling state before invoking the original transport. Reconcile an unknown outcome through complete original target readback before any further write.',
      serverIdempotency:'No idempotency key or compare-and-swap is declared by this selected specification.',
      sourceOfApproval:'Existing operator publication selection; preparation does not alter the remote catalogue.'}};
}
function header(headers,name) {
  const hits=Object.entries(headers).filter(([k])=>k.toLowerCase()===name.toLowerCase());
  if(hits.length>1) fail('DUPLICATE_HEADER','Use the complete original single-valued header record.',{name});
  return hits.length ? String(hits[0][1]) : '';
}
function publicHeaders(headers) {
  const allowed=new Set(['link','content-type','content-length','date','etag','last-modified','x-request-id','request-id']);
  return Object.fromEntries(Object.entries(headers).filter(([name])=>allowed.has(name.toLowerCase())));
}
function nextLink(value, currentUrl) {
  const found=[];
  for(const item of value.split(/,(?=\s*<)/)) {
    const match=item.trim().match(/^<([^>]+)>(.*)$/);
    if(!match) { if(item.trim()) fail('LINK_SYNTAX','The original Link header is not understood.'); continue; }
    const rel=match[2].match(/;\s*rel\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
    if(rel && (rel[1]||rel[2]).split(/\s+/).includes('next')) found.push(new URL(match[1],currentUrl).href);
  }
  if(found.length>1) fail('NEXT_LINK_AMBIGUOUS','A page must declare at most one next URL.');
  return found[0]||null;
}
export function reconcilePublished(plan, pages, {identify} = {}) {
  if(plan.schema!=='commons.prodige-publication-request-plan.v1') fail('PLAN_SCHEMA','Use the complete prepared plan.');
  if(!Array.isArray(pages)||!pages.length) fail('READBACK_REQUIRED','Receive the complete actual target pages and original headers.');
  const targetOrigin=origin(plan.target.origin), path='/api/data/'+uuid(plan.target.resourceUuid);
  let expected=new URL(plan.readback.url).href;
  const visited=new Set(), byKey=new Map(), byGid=new Map(), receipts=[];
  for(let i=0;i<pages.length;i++) {
    const page=object(pages[i],'readback page');
    verifiedText(page.rawBody,page.file,identify,'whole original response body');
    const body=JSON.parse(page.rawBody);object(page.headers,'original response headers');
    const u=new URL(page.url);
    if(u.origin!==targetOrigin||u.pathname!==path||u.username||u.password||u.hash)
      fail('READBACK_TARGET','A returned page is outside the selected catalogue/resource.');
    if(u.href!==expected||visited.has(u.href)) fail('PAGE_CHAIN','Preserve the original complete pagination chain.',{index:i,expected,actual:u.href});
    visited.add(u.href);
    if(page.status!==200) fail('READBACK_STATUS','Readback did not complete successfully.',{index:i,status:page.status});
    if(body?.type!=='FeatureCollection'||!Array.isArray(body.features))
      fail('READBACK_BODY','Expected the original GeoJSON FeatureCollection.');
    for(const f of body.features) {
      object(f,'feature');object(f.properties,'properties');
      if(f.type!=='Feature') fail('READBACK_FEATURE','Expected an original GeoJSON Feature.');
      const key=f.properties[plan.selection.key];
      if(typeof key!=='string'||!key.length) fail('TARGET_KEY','Complete readback contains a missing or nontext publication key.');
      if(byKey.has(key)) fail('TARGET_DUPLICATE_KEY','The target contains more than one record for a business key.',{key});
      if(!own(f.properties,'gid')||(!Number.isSafeInteger(f.properties.gid)&&!/^[0-9]+$/.test(f.properties.gid||''))) fail('TARGET_GID','Readback must retain a valid server gid.');
      const gid=String(f.properties.gid);
      if(byGid.has(gid)) fail('TARGET_DUPLICATE_GID','The target repeats a server gid.',{gid});
      byKey.set(key,f);byGid.set(gid,key);
    }
    receipts.push({url:u.href,status:page.status,file:clone(page.file),headers:publicHeaders(page.headers),rows:body.features.length});
    expected=nextLink(header(page.headers,'link'),u.href);
    if(expected) {
      const next=new URL(expected);
      if(next.origin!==targetOrigin||next.pathname!==path||next.username||next.password||next.hash)
        fail('NEXT_TARGET','The original next link changes selected origin/resource.');
      const fixed=new URL(plan.readback.url).searchParams;
      for(const [key,value] of fixed) if(key!=='offset'&&next.searchParams.getAll(key).length===1&&next.searchParams.get(key)!==value)
        fail('NEXT_SELECTION','The next page changes the selected readback parameters.',{key});
      for(const key of fixed.keys()) if(next.searchParams.getAll(key).length!==1)
        fail('NEXT_SELECTION','The next page omits or repeats a selected parameter.',{key});
      for(const key of next.searchParams.keys()) if(!fixed.has(key))
        fail('NEXT_SELECTION','The next page adds an unselected filter.',{key});
      const from=u.searchParams.get('offset'),to=next.searchParams.get('offset');
      if(!/^(0|[1-9][0-9]*)$/.test(to||'')||!Number.isSafeInteger(Number(to))||Number(to)<=Number(from))
        fail('NEXT_OFFSET','The original pagination offset must advance.');
      if(i===pages.length-1) fail('INCOMPLETE_READBACK','The original target supplied another page.',{next:expected});
    } else if(i!==pages.length-1) fail('EXTRA_READBACK_PAGE','Pages were added after the target ended pagination.');
  }
  const differences=[], matched=[], selectedKeys=new Set();
  for(const request of plan.requests) for(const f of request.body.features) {
    const key=f.properties[plan.selection.key];selectedKeys.add(key);
    const actual=byKey.get(key);
    if(!actual){differences.push({key,type:'missing'});continue;}
    for(const c of plan.selection.columns) {
      if(!own(actual.properties,c.target)||stable(actual.properties[c.target])!==stable(f.properties[c.target]))
        differences.push({key,type:'attribute',field:c.target,expected:f.properties[c.target],
          present:own(actual.properties,c.target),actual:own(actual.properties,c.target)?actual.properties[c.target]:null});
    }
    if(stable(actual.geometry??null)!==stable(f.geometry??null))
      differences.push({key,type:'geometry',expected:f.geometry,actual:actual.geometry??null});
    if(plan.target.mode==='update'&&String(actual.properties.gid)!==String(f.properties.gid))
      differences.push({key,type:'gid',expected:f.properties.gid,actual:actual.properties.gid});
    matched.push({key,gid:actual.properties.gid});
  }
  return {schema:'commons.prodige-publication-readback.v1',operationId:plan.operationId,
    state:differences.length?'DIFFERENT':'CONFIRMED',completePagination:true,
    selectedRows:plan.rowCount,targetRows:byKey.size,matched,differences,
    unrelatedTargetKeys:[...byKey.keys()].filter(k=>!selectedKeys.has(k)),pages:receipts,
    meaning:'Confirms the received target values. Preserve the original transport result separately; value equality alone does not identify which writer produced them.'};
}
