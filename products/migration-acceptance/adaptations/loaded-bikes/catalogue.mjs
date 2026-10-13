// Public catalogue adaptation; the maintained workbench owns native execution.
import {parseExactJSON} from '../../workbench/vendor/dlt/vendor/sling/vendor/stellar-expert/exact-json.mjs';
import {projectExpectedCatalogue} from './acceptance.mjs';

export const REVIEW_SCHEMA='tjlabs.loaded-bikes-review.v1';
export const CAPTURE_SCHEMA='tjlabs.loaded-bikes.catalogue-capture.v1';
export const TYPES=['text','bigint','decimal','bool'];
const NAME=/^[a-z][a-z0-9_]{0,62}$/,SHA=/^[a-f0-9]{64}$/;
export const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const clone=v=>JSON.parse(JSON.stringify(v));
const check=(yes,message)=>{if(!yes)throw new Error(message);};
const bytes=s=>new TextEncoder().encode(s);
export async function sha256(value){const data=typeof value==='string'?bytes(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function decode(base64){check(typeof base64==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64),'Original response Base64 is invalid.');return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)));}
const col=(name,data_type='text',nullable=false)=>({name,data_type,nullable});
const common=[
col('sku'),col('name'),col('slug'),col('product_type'),col('permalink'),col('description_html'),col('short_description_html'),
col('price_minor','bigint',true),col('regular_price_minor','bigint',true),col('sale_price_minor','bigint',true),
col('currency_code'),col('currency_minor_unit','bigint'),col('price_range_json','text',true),
col('on_sale','bool'),col('is_purchasable','bool'),col('is_in_stock','bool'),col('is_on_backorder','bool'),col('low_stock_remaining','bigint',true),
col('stock_text'),col('stock_class'),col('weight'),col('formatted_weight'),col('length'),col('width'),col('height'),col('formatted_dimensions')];
export const TABLES=[
{name:'products',primaryKey:['product_id'],columns:[col('product_id'),...common]},
{name:'variants',primaryKey:['variant_id'],columns:[col('variant_id'),col('parent_product_id'),col('variation_description'),...common]},
{name:'variant_options',primaryKey:['variant_id','attribute_index'],columns:[col('parent_product_id'),col('variant_id'),col('attribute_index','bigint'),col('attribute_name'),col('attribute_value')]},
{name:'product_categories',primaryKey:['product_id','category_id'],columns:[col('product_id'),col('category_id'),col('category_name'),col('category_slug'),col('category_url')]}];
const scalarPaths={sku:'/sku',name:'/name',slug:'/slug',product_type:'/type',permalink:'/permalink',description_html:'/description',short_description_html:'/short_description',
price_minor:'/prices/price',regular_price_minor:'/prices/regular_price',sale_price_minor:'/prices/sale_price',
currency_code:'/prices/currency_code',currency_minor_unit:'/prices/currency_minor_unit',price_range_json:'/prices/price_range',
on_sale:'/on_sale',is_purchasable:'/is_purchasable',is_in_stock:'/is_in_stock',is_on_backorder:'/is_on_backorder',low_stock_remaining:'/low_stock_remaining',
stock_text:'/stock_availability/text',stock_class:'/stock_availability/class',weight:'/weight',formatted_weight:'/formatted_weight',
length:'/dimensions/length',width:'/dimensions/width',height:'/dimensions/height',formatted_dimensions:'/formatted_dimensions'};
export function pointer(value,path){let p=value;for(const k of path.split('/').slice(1).map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'))){check(p!==null&&typeof p==='object'&&Object.hasOwn(p,k),'Original JSON pointer is absent: '+path);p=p[k];}return p;}
function pathName(value){check(typeof value==='string'&&!value.startsWith('/')&&!value.includes('\\')&&value.split('/').every(x=>x&&x!=='.'&&x!=='..'),'Original source path is unsafe.');return value;}
function sourceKey(row,columns){return Object.fromEntries(columns.map(n=>[n,row[n]]));}
function key(row,columns){return canonical(sourceKey(row,columns));}
function originalType(v,c){if(v===null){check(c.nullable,'Original required value is null: '+c.name);return;}if(c.data_type==='bool')check(typeof v==='boolean','Original boolean differs: '+c.name);else if(c.data_type==='bigint')check(typeof v==='string'&&/^-?(0|[1-9]\d*)$/.test(v),'Original integer token differs: '+c.name);else check(typeof v==='string','Original text differs: '+c.name);}
/** All complete original responses, first exact duplicate placement, literal ids. */
export function sourceCatalogue(capture){
check(capture?.schema===CAPTURE_SCHEMA&&Array.isArray(capture.responses)&&capture.responses.length>0,'Select the complete original catalogue capture.');
const docs=[],records=new Map(),duplicates=[],paths=new Set();
for(const r of capture.responses){pathName(r.path);check(!paths.has(r.path)&&SHA.test(r.sha256),'Duplicate or invalid original response.');paths.add(r.path);
const content=decode(r.content_base64);check(bytes(content).length===r.bytes,'Original response length differs: '+r.path);
const data=parseExactJSON(content);check(Array.isArray(data),'Original catalogue response must be a complete array.');
const doc={path:r.path,url:r.url,bytes:r.bytes,sha256:r.sha256,content,data};docs.push(doc);
data.forEach((item,i)=>{check(item&&/^[1-9]\d*$/.test(item.id)&&/^(0|[1-9]\d*)$/.test(item.parent),'Original product identity is invalid.');
const original={item,path:r.path,pointer:'/'+i,sha256:r.sha256,url:r.url};
if(records.has(item.id)){check(canonical(records.get(item.id).item)===canonical(item),'Conflicting complete product editions for '+item.id);duplicates.push({id:item.id,first:{path:records.get(item.id).path,pointer:records.get(item.id).pointer},duplicate:{path:r.path,pointer:'/'+i}});}
else records.set(item.id,original);});}
const tables=TABLES.map(t=>({...clone(t),rows:[]})),table=n=>tables.find(t=>t.name===n);
const add=(name,values,origins)=>{const t=table(name);check(Object.keys(values).length===t.columns.length,'Original selected field set differs.');for(const c of t.columns)originalType(values[c.name],c);t.rows.push({sourceKey:sourceKey(values,t.primaryKey),values,origins});};
const origin=(record,p)=>({path:record.path,pointer:record.pointer+p,sha256:record.sha256});
const parentRecords=[...records.values()].filter(r=>r.item.parent==='0');
const childRecords=[...records.values()].filter(r=>r.item.parent!=='0');
for(const r of records.values()){const p=r.item,isParent=p.parent==='0';check(isParent?p.type!=='variation':p.type==='variation','Original parent/type disagree.');
const values={},origins={};for(const c of common){let v=pointer(p,scalarPaths[c.name]);if(c.name==='price_range_json'&&v!==null)v=canonical(v);
if(['price_minor','regular_price_minor','sale_price_minor'].includes(c.name)&&v==='')v=null;
values[c.name]=v;origins[c.name]=origin(r,scalarPaths[c.name]);}
if(isParent){values.product_id=p.id;origins.product_id=origin(r,'/id');add('products',values,origins);}
else{check(records.has(p.parent)&&records.get(p.parent).item.parent==='0','Original variation parent is missing.');values.variant_id=p.id;values.parent_product_id=p.parent;values.variation_description=p.variation;
origins.variant_id=origin(r,'/id');origins.parent_product_id=origin(r,'/parent');origins.variation_description=origin(r,'/variation');add('variants',values,origins);}}
const declared=new Set();
for(const r of parentRecords){check(Array.isArray(r.item.variations)&&Array.isArray(r.item.categories),'Original parent selections are absent.');
for(const [vi,v]of r.item.variations.entries()){check(!declared.has(v.id)&&records.get(v.id)?.item.parent===r.item.id,'Original variation declaration differs or repeats: '+v.id);declared.add(v.id);check(Array.isArray(v.attributes),'Original variant attributes missing.');
for(const [ai,a]of v.attributes.entries()){add('variant_options',{parent_product_id:r.item.id,variant_id:v.id,attribute_index:String(ai),attribute_name:a.name,attribute_value:a.value},
{parent_product_id:origin(r,'/id'),variant_id:origin(r,'/variations/'+vi+'/id'),attribute_index:{...origin(r,'/variations/'+vi+'/attributes/'+ai),operation:'zero-based-array-index',index:ai},attribute_name:origin(r,'/variations/'+vi+'/attributes/'+ai+'/name'),attribute_value:origin(r,'/variations/'+vi+'/attributes/'+ai+'/value')});}}
for(const [ci,c]of r.item.categories.entries())add('product_categories',{product_id:r.item.id,category_id:c.id,category_name:c.name,category_slug:c.slug,category_url:c.link},
{product_id:origin(r,'/id'),category_id:origin(r,'/categories/'+ci+'/id'),category_name:origin(r,'/categories/'+ci+'/name'),category_slug:origin(r,'/categories/'+ci+'/slug'),category_url:origin(r,'/categories/'+ci+'/link')});}
check(declared.size===childRecords.length&&childRecords.every(r=>declared.has(r.item.id)),'Complete declared variation population is missing.');
check(parentRecords.length===capture.scope.parent_product_count&&childRecords.length===capture.scope.declared_variation_count&&docs.length===capture.scope.original_response_count&&capture.scope.all_declared_variations_received===true,'Original full capture population differs.');
for(const t of tables)check(new Set(t.rows.map(r=>canonical(r.sourceKey))).size===t.rows.length,'Duplicate original table identity: '+t.name);
return {schema:'tjlabs.loaded-bikes-source-tables.v1',tables,documents:docs,duplicates,scope:clone(capture.scope)};
}
export function sourceTables(capture){return sourceCatalogue(capture).tables.map(t=>({...t,rows:t.rows.map(r=>r.values)}));}
export function defaultReview(capture){
const source=sourceCatalogue(capture);
return {schema:REVIEW_SCHEMA,tables:source.tables.map(t=>({sourceTable:t.name,tableName:t.name,columns:t.columns.map(c=>({source:c.name,...c})),primaryKey:[...t.primaryKey]})),corrections:[]};
}
function typed(v,c){if(v===null){check(c.nullable!==false,'Null cannot enter required target '+c.name);return {type:'null'};}
if(c.data_type==='text'){check(typeof v==='string','Choose an explicit source text value for '+c.name);return {type:'text',value:v};}
if(c.data_type==='bool'){check(typeof v==='boolean','Choose an explicit boolean for '+c.name);return {type:'boolean',value:String(v)};}
check(typeof v==='string','Keep exact numeric tokens as text for '+c.name);
if(c.data_type==='bigint'){check(/^-?(0|[1-9]\d*)$/.test(v)&&BigInt(v)>=-9223372036854775808n&&BigInt(v)<=9223372036854775807n,'Target BIGINT cannot preserve '+c.name);return {type:'integer',value:v};}
const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(v);check(m,'An exact decimal token is required for '+c.name);
const scale=c.scale??0,precision=c.precision??38;check((m[3]??'').length<=scale,'Decimal scale would round '+c.name);
const integer=m[2].replace(/^0+(?=\d)/,'');check((integer==='0'?0:integer.length)+(scale)<=precision,'Decimal precision would change '+c.name);
return {type:'decimal',value:m[1]+integer+(scale?'.'+(m[3]??'').padEnd(scale,'0'):'')};
}
function sqlType(c){return c.data_type==='text'?'VARCHAR':c.data_type==='bool'?'BOOLEAN':c.data_type==='bigint'?'BIGINT':'DECIMAL('+(c.precision??38)+','+(c.scale??0)+')';}
function selectedReview(source,review){
check(review?.schema===REVIEW_SCHEMA&&Array.isArray(review.tables)&&review.tables.length===source.tables.length&&Array.isArray(review.corrections),'Select a complete mapping and correction edition.');
const seen=new Set(),targets=new Set(),corrections=new Map();
for(const c of review.corrections){check(c&&typeof c.reviewer==='string'&&c.reviewer.trim()&&typeof c.reason==='string'&&c.reason.trim(),'Every source correction needs reviewer and reason.');
const t=source.tables.find(t=>t.name===c.table),r=t?.rows.find(r=>canonical(r.sourceKey)===canonical(c.sourceKey));check(r&&Object.hasOwn(r.values,c.column)&&!t.primaryKey.includes(c.column)&&!/_id$/.test(c.column),'Corrections must select an existing non-identity source field.');
check(canonical(r.values[c.column])===canonical(c.previousValue),'Correction previous value differs from original source.');const k=canonical([c.table,c.sourceKey,c.column]);check(!corrections.has(k),'Retain one current correction per original cell.');corrections.set(k,c);}
const tables=review.tables.map(t=>{const original=source.tables.find(x=>x.name===t.sourceTable);check(original&&!seen.has(t.sourceTable)&&NAME.test(t.tableName)&&!targets.has(t.tableName),'Select every original table once with unique native name.');seen.add(t.sourceTable);targets.add(t.tableName);
check(Array.isArray(t.columns)&&t.columns.length===original.columns.length,'Map every original selected business column.');
const from=new Set(),to=new Set();for(const c of t.columns){check(original.columns.some(x=>x.name===c.source)&&!from.has(c.source)&&NAME.test(c.name)&&!to.has(c.name)&&TYPES.includes(c.data_type),'Column mapping must retain every original field once.');from.add(c.source);to.add(c.name);
check(typeof c.nullable==='boolean','Declare target nullability.');if(c.data_type==='decimal')check(Number.isInteger(c.precision??38)&&(c.precision??38)>=1&&(c.precision??38)<=38&&Number.isInteger(c.scale??0)&&(c.scale??0)>=0&&(c.scale??0)<=(c.precision??38),'Declare exact target decimal precision/scale.');}
check(Array.isArray(t.primaryKey)&&t.primaryKey.length&&new Set(t.primaryKey).size===t.primaryKey.length&&t.primaryKey.every(k=>to.has(k)),'Select exact target keys.');
for(const k of original.primaryKey){const c=t.columns.find(c=>c.source===k);check(t.primaryKey.includes(c.name)&&c.data_type===original.columns.find(x=>x.name===k).data_type&&!c.nullable,'Preserve original source identity types and required keys.');}
return {...clone(t),original};});
return {tables,corrections};
}
/** No dlt effect: original source assertions and staging are retained separately. */
export async function prepareCatalogue({capture,review}){
const source=sourceCatalogue(capture);for(const d of source.documents)check(await sha256(d.content)===d.sha256,'Original full response SHA differs: '+d.path);
const selected=selectedReview(source,review),independent=projectExpectedCatalogue(capture),files=[],tables=[],assertions=[];
const add=async(path,content,role)=>{const file={path,content,role,mediaType:path.endsWith('.ndjson')?'application/x-ndjson':'application/json',bytes:bytes(content).length,sha256:await sha256(content)};files.push(file);return {path,bytes:file.bytes,sha256:file.sha256};};
await add('source/catalogue-capture.json',JSON.stringify(capture,null,2)+'\n','loaded-bikes-original-capture');
for(const d of source.documents)await add(d.path,d.content,'loaded-bikes-original-response');
const reviewDescriptor=await add('review/mapping.json',JSON.stringify(review,null,2)+'\n','loaded-bikes-reviewed-mapping');
for(const t of selected.tables){const staging=[],expectedRows=[],baseline=independent[t.sourceTable];check(Array.isArray(baseline)&&baseline.length===t.original.rows.length,'Independent source population differs: '+t.sourceTable);
const independentByKey=new Map(baseline.map(row=>[key(row,t.original.primaryKey),row]));check(independentByKey.size===baseline.length,'Independent source identities differ.');
for(const r of t.original.rows){const target={},expected=[];const independentRow=independentByKey.get(canonical(r.sourceKey));check(independentRow,'Independent original row missing.');
for(const c of t.columns){const correction=selected.corrections.get(canonical([t.sourceTable,r.sourceKey,c.source]));const value=correction?correction.value:r.values[c.source];
const assertionValue=correction?correction.value:independentRow[c.source];
check(canonical(independentRow[c.source])===canonical(r.values[c.source]),'Independent source assertion differs: '+t.sourceTable+'/'+r.sourceKey+'/'+c.source);
const cell=typed(value,c),expectedCell=typed(assertionValue,c);target[c.name]=cell.type==='null'?null:cell.type==='boolean'?value:cell.value;expected.push(expectedCell);
assertions.push({table:t.tableName,sourceTable:t.sourceTable,sourceKey:r.sourceKey,column:c.name,sourceColumn:c.source,source:r.origins[c.source],originalValue:independentRow[c.source],correction:correction?clone(correction):null,expected:expectedCell});}
staging.push(target);expectedRows.push(expected);}
const sourceFile=await add('staging/'+t.tableName+'.ndjson',staging.map(x=>JSON.stringify(x)).join('\n')+(staging.length?'\n':''),'loaded-bikes-staging-data');
const expected={schema:'dlthub.expected-table.v1',table:t.tableName,complete:true,rowCount:expectedRows.length,columns:t.columns.map(c=>({name:c.name,type:sqlType(c)})),rows:expectedRows,
sourceBoundary:{captureSchema:capture.schema,review:reviewDescriptor,derivation:'Independent original response projection; never destination-derived; per-cell assertions retained.'}};
const expectedFile=await add('expected/'+t.tableName+'.json',JSON.stringify(expected,null,2)+'\n','loaded-bikes-independent-expected');
tables.push({sourceTable:t.sourceTable,tableName:t.tableName,columns:t.columns,primaryKey:t.primaryKey,rowCount:staging.length,source:sourceFile,expected:expectedFile,rows:staging,expectedTable:expected});}
const assertionDescriptor=await add('review/source-assertions.json',JSON.stringify({schema:'tjlabs.loaded-bikes-source-assertions.v1',rows:assertions},null,2)+'\n','loaded-bikes-source-assertions');
const binding={schema:'tjlabs.loaded-bikes-native-input.v1',capture:(({content,...d})=>d)(files[0]),scope:source.scope,duplicatePlacements:source.duplicates,review:reviewDescriptor,assertions:assertionDescriptor,
tables:tables.map(({rows,expectedTable,...t})=>t),sourceFiles:files.map(({content,...d})=>d),meaning:'Public retail catalogue; no private stock quantity, manufacturing BOM, supplier or selected target ERP is asserted.'};
binding.bindingSha256=await sha256(canonical(binding));
return {schema:'tjlabs.loaded-bikes-prepared.v1',binding,tables,files,ready:true,issues:[]};
}
export function buildPipelineInput(prepared,{sourceIds,expectedSourceIds,pipelineName='loaded_bikes_catalogue',datasetName='loaded_bikes',title='Loaded Bikes public catalogue staging',phase='baseline'}){
check(prepared?.schema==='tjlabs.loaded-bikes-prepared.v1'&&prepared.ready,'Select a complete prepared catalogue.');
const resources=[],acceptance=[];
for(const t of prepared.binding.tables){const sourceId=sourceIds[t.sourceTable],expectedSourceId=expectedSourceIds[t.sourceTable];
check(/^[A-Za-z0-9_-]{1,160}$/.test(sourceId??'')&&/^[A-Za-z0-9_-]{1,160}$/.test(expectedSourceId??'')&&sourceId!==expectedSourceId,'Bind actual independently retained source IDs for '+t.sourceTable);
resources.push({name:t.tableName,tableName:t.tableName,sourceId,format:'ndjson',columns:t.columns.map(({source,...c})=>c),primaryKey:t.primaryKey,writeDisposition:'replace',schemaContract:{tables:'evolve',columns:'freeze',data_type:'freeze'},maxTableNesting:0});
acceptance.push({table:t.tableName,expectedSourceId,columns:t.columns.map(c=>({name:c.name,cellType:c.data_type==='bigint'?'integer':c.data_type==='bool'?'boolean':c.data_type})),primaryKey:t.primaryKey,ignoredRightColumns:['_dlt_load_id','_dlt_id']});}
return {schema:'dlthub.pipeline-input.v1',title,pipelineName,datasetName,phase,resources,acceptance,limits:{maxRows:Math.max(1,...prepared.binding.tables.map(t=>t.rowCount)),maxBytes:536870912,workers:1},
sourceBoundary:prepared.binding.meaning,sourceEvidence:[{kind:'loaded-bikes-public-catalogue',bindingSha256:prepared.binding.bindingSha256,sourceFiles:prepared.binding.sourceFiles,review:prepared.binding.review,assertions:prepared.binding.assertions}]};
}
