// SPDX-License-Identifier: MIT
// Independent source projection and business selections for the retained Loaded Bikes catalogue.
import {parseExactJSON} from '../../workbench/vendor/dlt/vendor/sling/vendor/stellar-expert/exact-json.mjs';
import {createSHA256} from '../../workbench/web/sha256.mjs';

const check=(ok,message,details={})=>{if(!ok){const error=new Error(message);error.code='LOADED_BIKES_SOURCE';error.details=details;throw error;}};
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const digest=value=>createSHA256().update(typeof value==='string'?value:canonical(value)).hex();
const copy=value=>JSON.parse(JSON.stringify(value));
const text=(value,label)=>{check(typeof value==='string','The original '+label+' must remain text.');return value;};
const integer=(value,label,nullable=false)=>{if(nullable&&(value===null||value===''))return null;check(typeof value==='string'&&/^-?(0|[1-9][0-9]*)$/.test(value),'The original '+label+' must be an exact integer token.');const n=BigInt(value);check(n>=-9223372036854775808n&&n<=9223372036854775807n,'The original '+label+' is outside signed BIGINT.');return n.toString();};
const identifier=(value,label)=>{const result=integer(value,label);check(BigInt(result)>0n,'The original '+label+' must be positive.');return result;};
const boolean=(value,label)=>{check(typeof value==='boolean','The original '+label+' must remain a boolean.');return value;};
function decodeBase64(value){
  check(typeof value==='string'&&value.length%4===0&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),'Retain complete canonical base64 source bytes.');
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',out=[];
  for(let i=0;i<value.length;i+=4){const a=alphabet.indexOf(value[i]),b=alphabet.indexOf(value[i+1]),c=alphabet.indexOf(value[i+2]),d=alphabet.indexOf(value[i+3]);out.push(a<<2|b>>4);if(c>=0)out.push((b&15)<<4|c>>2);if(d>=0)out.push((c&3)<<6|d);}
  return Uint8Array.from(out);
}
function sourceText(bytes){return decodeURIComponent(Array.from(bytes,b=>'%'+b.toString(16).padStart(2,'0')).join(''));}
function readCapture(capture){
  check(capture?.schema==='tjlabs.loaded-bikes.catalogue-capture.v1'&&Array.isArray(capture.responses)&&capture.responses.length>0,'Select the complete original catalogue capture.');
  const records=new Map(),origins=new Map(),documents=new Map(),sources=[];
  for(const response of capture.responses){
    check(typeof response.path==='string'&&!documents.has(response.path),'Each retained response needs a distinct original path.');
    const bytes=decodeBase64(response.content_base64),sha256=createSHA256().update(bytes).hex();
    check(String(bytes.length)===String(response.bytes)&&sha256===response.sha256,'The original response bytes differ.',{path:response.path});
    const body=parseExactJSON(sourceText(bytes));check(Array.isArray(body),'The original Store API response must be a complete array.',{path:response.path});
    documents.set(response.path,{response,body});sources.push({path:response.path,url:response.url,bytes:bytes.length,sha256});
    for(let index=0;index<body.length;index++){
      const product=body[index],id=identifier(product.id,'product ID'),parent=integer(product.parent,'parent ID');
      check(BigInt(parent)>=0n,'A parent ID cannot be negative.');
      if(records.has(id))check(canonical(records.get(id))===canonical(product),'Two source snapshots disagree for the same original product.',{id});
      else{records.set(id,product);origins.set(id,[]);}
      origins.get(id).push({response_path:response.path,response_sha256:sha256,json_pointer:'/'+index,url:response.url});
    }
  }
  const parents=[...records.values()].filter(p=>p.parent==='0'),children=[...records.values()].filter(p=>p.parent!=='0'),declared=new Map();
  for(const parent of parents){
    check(['simple','variable'].includes(parent.type)&&Array.isArray(parent.variations),'Select original simple or variable parent records.');
    for(const variant of parent.variations){
      const id=identifier(variant.id,'declared variation ID');
      check(!declared.has(id),'A variation must be declared once across the captured parents.',{id});
      const child=records.get(id);check(child&&child.type==='variation'&&child.parent===parent.id,'Every declared variation must have its complete original child record and exact parent.',{id,parent:parent.id});
      check(Array.isArray(variant.attributes)&&variant.attributes.length>0,'Preserve each original variation attribute binding.',{id});
      declared.set(id,{parent,variant});
    }
  }
  check(children.length===declared.size&&children.every(p=>declared.has(p.id)),'The capture contains an undeclared or missing original variation.');
  if(capture.scope?.parent_product_count!==undefined)check(String(parents.length)===String(capture.scope.parent_product_count),'The original parent population is incomplete.');
  if(capture.scope?.declared_variation_count!==undefined)check(String(children.length)===String(capture.scope.declared_variation_count),'The original declared variation population is incomplete.');
  return{records,origins,documents,sources,parents,children,declared};
}
const commonText={sku:'sku',name:'name',slug:'slug',product_type:'type',permalink:'permalink',description_html:'description',short_description_html:'short_description',weight:'weight',formatted_weight:'formatted_weight',formatted_dimensions:'formatted_dimensions'};
function common(product){
  const row={};
  for(const [column,key]of Object.entries(commonText))row[column]=text(product[key],key);
  for(const [column,key]of [['price_minor','price'],['regular_price_minor','regular_price'],['sale_price_minor','sale_price']])row[column]=integer(product.prices?.[key],key,true);
  row.currency_code=text(product.prices?.currency_code,'currency code');row.currency_minor_unit=integer(product.prices?.currency_minor_unit,'currency minor unit');
  check(BigInt(row.currency_minor_unit)>=0n&&BigInt(row.currency_minor_unit)<=38n,'Select an explicit nonnegative currency scale at most 38.');
  check(own(product.prices,'price_range'),'Retain the original explicit price range or null.');row.price_range_json=product.prices.price_range===null?null:canonical(product.prices.price_range);
  for(const key of ['on_sale','is_purchasable','is_in_stock','is_on_backorder'])row[key]=boolean(product[key],key);
  row.low_stock_remaining=integer(product.low_stock_remaining,'low stock remaining',true);
  row.stock_text=text(product.stock_availability?.text,'stock availability text');row.stock_class=text(product.stock_availability?.class,'stock availability class');
  for(const key of ['length','width','height'])row[key]=text(product.dimensions?.[key],'dimension '+key);
  return row;
}
/** Independently reparse original bytes; never read the staging adapter's rows. */
export function projectExpectedCatalogue(capture){
  const original=readCapture(capture),tables={products:[],variants:[],variant_options:[],product_categories:[]};
  for(const parent of original.parents){
    tables.products.push({product_id:parent.id,...common(parent)});
    check(Array.isArray(parent.categories),'Retain original parent categories.');
    const categories=new Set();
    for(const category of parent.categories){const id=identifier(category.id,'category ID');check(!categories.has(id),'A product category is duplicated.',{product_id:parent.id,category_id:id});categories.add(id);tables.product_categories.push({product_id:parent.id,category_id:id,category_name:text(category.name,'category name'),category_slug:text(category.slug,'category slug'),category_url:text(category.link,'category URL')});}
    for(const variant of parent.variations)variant.attributes.forEach((attribute,index)=>tables.variant_options.push({parent_product_id:parent.id,variant_id:variant.id,attribute_index:String(index),attribute_name:text(attribute.name,'attribute name'),attribute_value:text(attribute.value,'attribute value')}));
  }
  for(const child of original.children)tables.variants.push({variant_id:child.id,parent_product_id:child.parent,variation_description:text(child.variation,'variation description'),...common(child)});
  return tables;
}
export const CATALOGUE_KEYS=Object.freeze({products:['product_id'],variants:['variant_id'],variant_options:['variant_id','attribute_index'],product_categories:['product_id','category_id']});
const integers=new Set(['price_minor','regular_price_minor','sale_price_minor','currency_minor_unit','low_stock_remaining','attribute_index']);
const booleans=new Set(['on_sale','is_purchasable','is_in_stock','is_on_backorder']);
const typeFor=name=>integers.has(name)?'integer':booleans.has(name)?'boolean':'text';
function typed(value,name){return value===null?{type:'null'}:{type:typeFor(name),value:typeof value==='boolean'?String(value):value};}
/** Check every original business field and row, accepting only harmless row/column reordering. */
export function verifyLoadedBikesExpected({catalogue,expectedTables}){
  const expected=projectExpectedCatalogue(catalogue),results=[];
  check(expectedTables&&typeof expectedTables==='object'&&!Array.isArray(expectedTables),'Supply all four complete typed expected tables.');
  check(canonical(Object.keys(expectedTables).sort())===canonical(Object.keys(expected).sort()),'Retain exactly the four complete catalogue tables.');
  for(const [name,rows]of Object.entries(expected)){
    const table=expectedTables[name],keys=CATALOGUE_KEYS[name],columns=Object.keys(rows[0]??{}),dbType=column=>integers.has(column)?'BIGINT':booleans.has(column)?'BOOLEAN':'VARCHAR';
    check(table?.schema==='dlthub.expected-table.v1'&&table.table===name&&table.complete===true&&table.rowCount===rows.length&&table.rows?.length===rows.length,'The complete expected table population differs.',{table:name});
    check(Array.isArray(table.columns)&&new Set(table.columns.map(c=>c.name)).size===columns.length&&table.columns.length===columns.length&&table.columns.every(c=>columns.includes(c.name)&&c.type===dbType(c.name)),'The original expected column types differ.',{table:name});
    const byKey=new Map(rows.map(row=>[canonical(keys.map(k=>row[k])),row])),seen=new Set();
    for(const received of table.rows){
      check(Array.isArray(received)&&received.length===columns.length,'A typed expected row is incomplete.',{table:name});
      const cells=Object.fromEntries(table.columns.map((column,index)=>[column.name,received[index]]));
      const key=canonical(keys.map(k=>cells[k]?.value));check(byKey.has(key)&&!seen.has(key),'An original business row is absent, duplicated or substituted.',{table:name,key});seen.add(key);
      const row=byKey.get(key);
      for(const column of columns)check(canonical(cells[column])===canonical(typed(row[column],column)),'An independent expected field differs from the original source.',{table:name,key,column});
    }
    results.push({table:name,rows:rows.length,columns:columns.length,complete:true});
  }
  return{schema:'tjlabs.loaded-bikes-expected-verification.v1',tables:results,source_responses:readCapture(catalogue).sources,meaning:'All typed expected values match an independent projection of the complete retained public source; native loading and target parity are separate operations.'};
}

function pointerValue(document,pointer){
  check(typeof pointer==='string'&&(pointer===''||pointer.startsWith('/')),'Use an original JSON pointer.');
  let value=document;
  for(const token of pointer.split('/').slice(1)){const key=token.replaceAll('~1','/').replaceAll('~0','~');check(value!==null&&typeof value==='object'&&own(value,key),'An evidence pointer is not in the original response.',{pointer});value=value[key];}
  return value;
}
function reference(original,id,field=''){
  const origin=original.origins.get(String(id))?.[0];check(origin,'Select an original source product.',{id});
  const document=original.documents.get(origin.response_path);
  return{responseId:document.response.id??origin.response_path,responsePath:origin.response_path,sha256:origin.response_sha256,pointer:origin.json_pointer+field,url:origin.url};
}
function claimsCapture(catalogue,claims){
  check(claims?.schema==='tjlabs.loaded-bikes.source-claims.v1','Select the original source claim companion.');
  const additions=claims.original_response_additions??[];check(Array.isArray(additions),'Keep complete original supplemental responses.');
  return readCapture({...catalogue,responses:[...catalogue.responses,...additions]});
}
function verifyEvidence(original,evidence){
  const doc=original.documents.get(evidence.response_path);check(doc&&doc.response.sha256===evidence.response_sha256,'Evidence selects another original source edition.');
  const value=pointerValue(doc.body,evidence.json_pointer),rendered=typeof value==='string'?value:canonical(value);
  check(typeof evidence.exact_substring==='string'&&(evidence.exact_substring===''?rendered==='':rendered.includes(evidence.exact_substring)),'Evidence is not present at its exact original pointer.');
}
function verifyInventory(original,claims){
  check(Array.isArray(claims.inventory)&&claims.inventory.length===original.records.size,'The complete source inventory population differs.');
  const seen=new Set();
  for(const item of claims.inventory){
    const normalized=parseExactJSON(JSON.stringify(item)),id=identifier(normalized.id,'inventory product ID');
    check(!seen.has(id)&&original.records.has(id),'An inventory item is duplicated or absent from the original source.',{id});seen.add(id);
    const product=original.records.get(id),references=original.origins.get(id).map(o=>({response_path:o.response_path,response_sha256:o.response_sha256,json_pointer:o.json_pointer}));
    const expected={id:product.id,parent_id:product.parent,entity_kind:product.parent==='0'?'product':'variation',type:product.type,name:product.name,slug:product.slug,sku:product.sku,permalink:product.permalink,variation:product.variation,attributes:product.attributes,declared_variation_ids:product.variations.map(v=>v.id),prices:product.prices,on_sale:product.on_sale,
      availability:{is_purchasable:product.is_purchasable,is_in_stock:product.is_in_stock,is_on_backorder:product.is_on_backorder,low_stock_remaining:product.low_stock_remaining,stock_availability:product.stock_availability,sold_individually:product.sold_individually},
      measurements:{weight:product.weight,formatted_weight:product.formatted_weight,dimensions:product.dimensions,formatted_dimensions:product.formatted_dimensions},categories:product.categories,tags:product.tags,brands:product.brands,source:normalized.source,source_occurrences:normalized.source_occurrences};
    check(references.some(r=>canonical(r)===canonical(normalized.source))&&Array.isArray(normalized.source_occurrences)&&canonical(normalized.source_occurrences.map(canonical).sort())===canonical(references.map(canonical).sort()),'The inventory source occurrences differ from the actual complete capture.',{id});
    check(canonical(normalized)===canonical(expected),'The complete source inventory item differs from its retained original record.',{id});
  }
}
/** Validate extracted claims against original descriptions; no inferred component identities. */
export function verifySourceClaims({catalogue,claims}){
  const original=claimsCapture(catalogue,claims);
  check(claims?.schema==='tjlabs.loaded-bikes.source-claims.v1'&&Array.isArray(claims.claims),'Select the complete source-linked claim rows.');
  verifyInventory(original,claims);
  const seen=new Set();
  for(const claim of claims.claims){
    check(typeof claim.claim_id==='string'&&!seen.has(claim.claim_id),'Retain unique original claim IDs.');seen.add(claim.claim_id);
    check(original.records.has(String(claim.subject_id)),'A claim subject is absent from the original catalogue.');
    if(claim.parent_id!==undefined&&claim.parent_id!==null)check(original.records.get(String(claim.subject_id)).parent===String(claim.parent_id),'A claim has a different original parent.');
    check(['direct','conditional','unresolved'].includes(claim.certainty),'Retain the declared certainty of every published claim.');
    check(Array.isArray(claim.evidence)&&claim.evidence.length>0,'Every claim needs original source evidence.');
    for(const evidence of claim.evidence){
      verifyEvidence(original,evidence);
    }
    check(claim.evidence.some(e=>original.origins.get(String(claim.subject_id)).some(o=>o.response_path===e.response_path&&(e.json_pointer===o.json_pointer||e.json_pointer.startsWith(o.json_pointer+'/')))),'A claim must cite its own original subject record.');
    if(claim.quantity!==undefined){
      const quantity=String(claim.quantity);
      check(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(quantity)&&/[1-9]/.test(quantity),'Retain a positive exact published quantity.');
      if(claim.relation_kind==='published_kit_component'){
        check(/^[1-9][0-9]*$/.test(quantity),'Retail kit piece counts must be whole numbers.');
        const pattern=new RegExp('(?:^|[^0-9])'+quantity+'\\s*(?:x|×|&times;)','i');
        check(claim.evidence.some(e=>pattern.test(e.exact_substring)),'The retail kit quantity must occur explicitly with its multiplier in the quoted source.');
      }
    }
    if(claim.target?.product_id!==undefined)check(original.records.has(String(claim.target.product_id)),'A linked product must exist in the retained original catalogue.');
    if(claim.relation_kind==='declares_variant')check(original.declared.get(String(claim.target?.product_id))?.parent.id===String(claim.subject_id),'A declared-variation claim must match the exact original parent edge.');
    if(claim.target?.sku&&claim.target?.product_id!==undefined)check(original.records.get(String(claim.target.product_id)).sku===claim.target.sku,'A linked component must retain its exact original SKU; names do not substitute for SKUs.');
  }
  return copy(claims.claims);
}
/** Catalogue interpretation only; these issues never replace native parity findings. */
export function sourceIssues(capture,claims=null){
  const original=readCapture(capture),issues=[];
  const add=(code,title,detail,productIds,refs,severity='review',extra={})=>{
    const body={code,title,detail,severity,sourceRefs:refs,productIds:productIds.map(String),...extra};
    issues.push({id:'catalogue-'+digest(body).slice(0,24),...body});
  };
  const blank=original.parents.filter(p=>p.sku==='');
  if(blank.length)add('PARENT_SKU_EMPTY','Some product families have no parent SKU',
    'The publisher leaves these parent SKU strings empty while supplying original product IDs and separately identified variants. Preserve the empty source values. If the selected destination requires a parent SKU, obtain an explicit customer mapping instead of inventing one.',
    blank.map(p=>p.id),blank.map(p=>reference(original,p.id,'/sku')),'review',{requiredFor:'A destination that requires nonblank parent SKUs'});
  const skuMap=new Map();for(const product of original.records.values())if(product.sku){const rows=skuMap.get(product.sku)??[];rows.push(product.id);skuMap.set(product.sku,rows);}
  for(const [sku,ids]of skuMap)if(ids.length>1)add('DUPLICATE_SOURCE_SKU','One published SKU identifies several records',
    'SKU '+sku+' appears on several complete source records. Original product and variation IDs remain the migration keys; review any destination that requires global SKU uniqueness.',
    ids,ids.map(id=>reference(original,id,'/sku')),'review');
  const missingReferences=new Map();
  for(const product of original.records.values()){
    for(const sku of new Set((product.description.match(/\bLB[0-9]+\b/g)??[])))if(!skuMap.has(sku)){const rows=missingReferences.get(sku)??[];rows.push(product.id);missingReferences.set(sku,rows);}
  }
  for(const [sku,ids]of missingReferences)add('UNRESOLVED_PUBLISHED_COMPONENT','Published component '+sku+' has no matching captured item',
    'The original description references '+sku+', but no exact SKU match exists among the retained items. This is an unresolved reference in this source scope, not proof that the item does not exist. Do not substitute a similarly named item or turn the retail kit claim into an approved manufacturing BOM.',
    ids,ids.map(id=>reference(original,id,'/description')),'review',{unresolvedSku:sku,requiredFor:'Using this kit as a resolved component list'});
  const mount=original.records.get('192');
  if(mount&&mount.dimensions.length==='110'&&mount.formatted_dimensions==='110 cm')add('MOUNT_DIMENSION_UNIT','Confirm the fork mount dimension and unit',
    'The original fork mount records length 110 and displays 110 cm. Both values are retained. The capture provides no authorization to convert this to 110 mm; a corrected dimension needs attributable customer evidence.',
    ['192'],[reference(original,'192','/dimensions/length'),reference(original,'192','/formatted_dimensions')],'review');
  if(mount){
    const differing=original.children.filter(p=>p.parent===mount.id&&p.weight!==mount.weight);
    if(differing.length)add('PARENT_VARIANT_WEIGHT','Parent and variant weights differ',
      'The fork mount parent weight is '+mount.weight+' while the listed variants retain their own weight values. Parent and child weights may describe different levels of the catalogue; no value is inherited or corrected automatically.',
      [mount.id,...differing.map(p=>p.id)],[reference(original,mount.id,'/weight'),...differing.map(p=>reference(original,p.id,'/weight'))],'review');
    if(/Can be made to be compatible/.test(mount.description))add('CONDITIONAL_RAIL_COMPATIBILITY','Keep conditional rail compatibility conditional',
      'The publisher says the mount can be made compatible with Reimo rails. This differs from its direct compatibility statements for other rails. Retain the qualification and require the customer’s installation details before treating it as a direct fit.',
      [mount.id],[reference(original,mount.id,'/description')],'review',{requiredFor:'An unconditional installation or fitment assertion'});
  }
  const screw=original.records.get('412'),long=original.records.get('3675');
  if(screw&&long&&long.parent===screw.id&&/45mm/.test(long.variation)&&!/45mm/.test(screw.description))add('SCREW_DESCRIPTION_VARIATION','The screw family description omits a declared size',
    'The complete source declares the 45 mm variation '+long.id+' / '+long.sku+', while the parent description lists other lengths. Preserve the declared variation and ask the publisher which description should be updated.',
    [screw.id,long.id],[reference(original,screw.id,'/description'),reference(original,long.id,'/variation'),reference(original,long.id,'/sku')],'review');
  const wood=original.children.filter(p=>p.parent==='14117');
  if(wood.length&&!wood.some(p=>/\b[0-9]+\s*(?:x|×|&times;)/i.test(p.description)))add('KIT_QUANTITIES_UNPUBLISHED','Wood insert kit quantities are not published in these records',
    'The retained wood insert kit variants describe their rail lengths without explicit component quantities. Do not inherit quantities from the rivnut or nut-and-bolt kits. Customer-approved production components and quantities remain an additional input.',
    wood.map(p=>p.id),wood.map(p=>reference(original,p.id,'/description')),'review',{requiredFor:'A complete component or production BOM migration'});
  const unknownStock=[...original.records.values()].filter(p=>p.low_stock_remaining===null);
  if(unknownStock.length)add('NO_STOCK_QUANTITIES','Public availability does not establish stock on hand',
    'The public in-stock and backorder flags are retained, but null low-stock counts are unknown. No stock ledger, warehouse balance, reserved quantity or opening inventory valuation is supplied by this catalogue.',
    unknownStock.map(p=>p.id),unknownStock.map(p=>reference(original,p.id,'/low_stock_remaining')),'scope',{requiredFor:'Inventory quantity or valuation acceptance'});
  add('DESTINATION_AND_OPERATIONS_UNSUPPLIED','Production acceptance needs the customer’s destination and operating data',
    'This capture supplies public products, variants, options, categories and published retail claims. It does not supply the selected ERP’s item identities, supplier master, approved manufacturing BOM, stock balances, tax settings or cutover criteria. A successful native catalogue comparison proves only the selected catalogue migration.',
    [],original.sources.map(s=>({responseId:original.documents.get(s.path).response.id??s.path,responsePath:s.path,sha256:s.sha256,pointer:'',url:s.url})),'scope',{requiredFor:'Production ERP migration or cutover acceptance'});
  if(claims){
    verifySourceClaims({catalogue:capture,claims});
    const bound=claimsCapture(capture,claims),claimedIssues=[];
    check(Array.isArray(claims.issues),'Retain the complete original source issue list.');
    const seen=new Set();
    for(const issue of claims.issues){
      check(typeof issue.issue_id==='string'&&!seen.has(issue.issue_id),'Retain unique source issue IDs.');seen.add(issue.issue_id);
      check(Array.isArray(issue.subject_ids)&&issue.subject_ids.every(id=>bound.records.has(String(id))),'A source issue names an absent original item.');
      check(Array.isArray(issue.evidence)&&issue.evidence.length>0,'Every source issue needs original evidence.');
      issue.evidence.forEach(e=>verifyEvidence(bound,e));
      const body={code:issue.code,title:issue.title,detail:issue.handling,severity:'review',productIds:issue.subject_ids.map(String),originalIssueId:issue.issue_id,
        sourceRefs:issue.evidence.map(e=>({responseId:bound.documents.get(e.response_path).response.id??e.response_path,responsePath:e.response_path,sha256:e.response_sha256,pointer:e.json_pointer,url:bound.documents.get(e.response_path).response.url,exactSubstring:e.exact_substring}))};
      claimedIssues.push({id:'catalogue-'+digest(body).slice(0,24),...body});
    }
    return[...claimedIssues,...issues.filter(issue=>['CONDITIONAL_RAIL_COMPATIBILITY','DESTINATION_AND_OPERATIONS_UNSUPPLIED'].includes(issue.code))];
  }
  return issues;
}
/** Original-ID crosswalk; destination labels are explicit mapping choices, never invented ERP IDs. */
export function catalogueCrosswalk({catalogue,claims=null}){
  const original=readCapture(catalogue),rows=[];
  for(const product of original.records.values()){
    const binding=original.declared.get(product.id);
    rows.push({sourceId:product.id,parentId:product.parent==='0'?null:product.parent,kind:product.type,sku:product.sku,name:product.name,
      options:binding?binding.variant.attributes.map((a,index)=>({index:String(index),name:a.name,value:a.value})):[],
      sourceRefs:original.origins.get(product.id).map(o=>({responseId:original.documents.get(o.response_path).response.id??o.response_path,responsePath:o.response_path,sha256:o.response_sha256,pointer:o.json_pointer,url:o.url})),
      destinationId:null});
  }
  return{schema:'tjlabs.loaded-bikes-business-crosswalk.v1',rows,claims:claims?verifySourceClaims({catalogue,claims}):[],
    scope:'Original published identity and claims. Null destinationId means no customer ERP identity has been supplied; it does not mean a generated destination ID.'};
}
/** Produce inputs for the unchanged compile/evaluate/decide acceptance engine. */
export function buildLoadedBikesAcceptance({pipelinePlan,catalogue,mapping}){
  projectExpectedCatalogue(catalogue);
  check(pipelinePlan?.schema==='dlthub.pipeline-plan.v1'&&mapping?.schema==='tjlabs.loaded-bikes-review.v1'&&Array.isArray(mapping.tables),'Select the compiled original pipeline and complete customer table mapping.');
  const tableNames=Object.keys(CATALOGUE_KEYS);
  check(mapping.tables.length===4&&new Set(mapping.tables.map(t=>t.sourceTable)).size===4&&mapping.tables.every(t=>tableNames.includes(t.sourceTable)),'Map all four original source tables once.');
  const tables=new Map(mapping.tables.map(t=>[t.sourceTable,t]));
  const column=(table,source)=>{const selected=tables.get(table)?.columns.filter(c=>c.source===source);check(selected?.length===1,'Select exactly one target for each original business field.',{table,source});return selected[0].name;};
  const stream=table=>{const selected=pipelinePlan.acceptance?.filter(s=>s.table===tables.get(table).tableName);check(selected?.length===1,'Select the original mapped native stream.',{table});return selected[0];};
  const objects=tableNames.map(id=>{
    const target=tables.get(id),selected=stream(id),key=CATALOGUE_KEYS[id].map(k=>column(id,k));
    check(key.every(k=>target.primaryKey.includes(k)),'The customer key must preserve all original product, variation or relationship identity columns.',{table:id});
    const required=[...new Set([...key,...target.columns.filter(c=>c.nullable===false).map(c=>c.name)])];
    return{id,streamId:selected.id,key:[...new Set([...key,...target.primaryKey])],required};
  });
  check(pipelinePlan.acceptance.length===objects.length,'Do not omit another selected native table from business acceptance.');
  const relationship=(id,parentObjectId,childObjectId,parentColumns,childColumns)=>({id,parentObjectId,childObjectId,parentColumns:parentColumns.map(c=>column(parentObjectId,c)),childColumns:childColumns.map(c=>column(childObjectId,c)),nulls:'forbid',acceptance:'required'});
  const relationships=[
    relationship('variant-parent','products','variants',['product_id'],['parent_product_id']),
    relationship('option-variant-parent','variants','variant_options',['variant_id','parent_product_id'],['variant_id','parent_product_id']),
    relationship('category-product','products','product_categories',['product_id'],['product_id']),
  ];
  const controls=tableNames.map(id=>({id:id+'-full-count',objectId:id,groupBy:[],measure:{kind:'count'},nulls:'reject',acceptance:'required'}));
  controls.push({id:'variants-by-parent',objectId:'variants',groupBy:[column('variants','parent_product_id')],measure:{kind:'count'},nulls:'reject',acceptance:'required'});
  for(const table of ['products','variants'])for(const source of ['price_minor','regular_price_minor','sale_price_minor']){
    const field=column(table,source),selected=stream(table).columns.find(c=>c.name===field);
    check(selected&&['integer','decimal'].includes(selected.cellType),'Price controls need an exact numeric comparison type.',{table,field});
    controls.push({id:table+'-'+source+'-by-currency',objectId:table,groupBy:[column(table,'currency_code'),column(table,'currency_minor_unit')],measure:{kind:'sum',column:field},nulls:'ignore',acceptance:'required'});
  }
  return{schema:'definian.acceptance-input.v1',title:'Loaded Bikes — complete catalogue identities, relationships and controls',pipelinePlan:copy(pipelinePlan),objects,relationships,controls};
}
