// MIT. Customer returns preserve issued research and explicit producer decisions.
import { need, plain, clone, canonical, digest, sha, key, text, instant, catalogue,
  normalizeProduct, validateResearchState, productCoverage, MAX_TOTAL_BYTES } from './model.mjs';
import { validateResearchExtension } from './bundle.mjs';
export const RESEARCH_RETURN='stellar-forge.research-return.v1';
export const RESEARCH_EXCHANGE='stellar-forge.research-exchange.v1';
export const RESEARCH_RETURN_WORK='stellar-forge.research-return-work.v1';
export const RESEARCH_RETURN_COMPARISON='stellar-forge.research-return-comparison.v1';
const HASH=/^[a-f0-9]{64}$/, UUID=/^[a-f0-9-]{36}$/;
const PRODUCT_FIELDS=['title','audience','purpose','format','notes','retired'];
const same=(a,b)=>canonical(a)===canonical(b);
export function exact(value,keys,message='Keep every complete original research return field.'){
  need(plain(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)),message);
}
export function researchHash(value){need(HASH.test(value??''),'Use the complete original SHA256 identity.');return value;}
function integer(value,min=0){need(Number.isSafeInteger(value)&&value>=min,'Use the original whole-number revision.');return value;}
function uuid(value){need(UUID.test(value??''),'Retain the original project identity.');return value;}
export function researchProductGraph(state,productId){
  validateResearchState(state);const cat=catalogue(state),p=cat.products.find(p=>p.id===key(productId));
  need(p,'Choose a retained original research product.','RESEARCH_PRODUCT_NOT_FOUND',404);
  const ids=new Set(p.versions.flatMap(v=>v.definition.requirements.flatMap(r=>r.entryIds)));
  return {schema:cat.schema,entries:clone(cat.entries.filter(e=>ids.has(e.id))),
    sources:clone(cat.sources.filter(s=>ids.has(s.entryId))),
    reviews:clone(cat.reviews.filter(r=>ids.has(r.entryId))),products:[clone(p)]};
}
function product(cat,id){const p=cat.products.find(p=>p.id===id);need(p,'The selected research product is absent.');return p;}
function currentProduct(cat,id){const p=product(cat,id),v=p.versions.find(v=>v.id===p.currentId);need(v,'The current product definition is absent.');return v;}
export function retainIssuedGraph(current,original,productId){
  validateResearchState({research:current});validateResearchState({research:original});
  for(const entry of original.entries){
    const found=current.entries.find(e=>e.id===entry.id);
    need(found&&entry.versions.every(v=>found.versions.some(x=>x.id===v.id&&same(x,v))),
      'The return lost an original issued source definition.','RESEARCH_RETURN_ANCESTRY');
  }
  for(const field of ['sources','reviews'])for(const row of original[field])
    need(current[field].some(x=>x.id===row.id&&same(x,row)),
      'The return changed an original issued '+field+' record.','RESEARCH_RETURN_ANCESTRY');
  const base=product(original,productId),now=product(current,productId);
  for(const field of ['versions','editions'])for(const row of base[field])
    need(now[field].some(x=>x.id===row.id&&same(x,row)),
      'The original issued product history changed.','RESEARCH_RETURN_ANCESTRY');
}
export function makeResearchReturn({state,sourceBundle,packageBytes,delivery,author,note='',createdAt}){
  need(packageBytes instanceof Uint8Array&&packageBytes.length>0,'Keep the original received package bytes.');
  const research=researchProductGraph(state,delivery.productId),ids=new Set(research.sources.map(s=>s.id));
  const sources={schema:'stellar-forge.research-source-bundle.v1',sources:sourceBundle.sources.filter(s=>ids.has(s.id))};
  const body={schema:RESEARCH_RETURN,sourceProjectId:delivery.sourceProjectId,productId:delivery.productId,
    editionId:delivery.editionId,deliverySha256:delivery.deliverySha256,
    originalPackage:{bytes:packageBytes.length,sha256:sha(packageBytes),bodyBase64:Buffer.from(packageBytes).toString('base64')},
    customer:{projectId:state.id,revision:state.revision},author:text(author,200,true),note:text(note,12000),
    createdAt:instant(createdAt),selectedDefinitionId:currentProduct(research,delivery.productId).id,
    research,sourceBundle:sources};
  const packet={...body,id:digest(body)};validateResearchReturn(packet,delivery);return packet;
}
export function validateResearchReturn(packet,delivery){
  exact(packet,['schema','sourceProjectId','productId','editionId','deliverySha256','originalPackage',
    'customer','author','note','createdAt','selectedDefinitionId','research','sourceBundle','id']);
  need(packet.schema===RESEARCH_RETURN,'Open a complete Research customer return.');
  uuid(packet.sourceProjectId);key(packet.productId);researchHash(packet.editionId);researchHash(packet.deliverySha256);
  exact(packet.customer,['projectId','revision']);uuid(packet.customer.projectId);integer(packet.customer.revision,1);
  text(packet.author,200,true);text(packet.note,12000);instant(packet.createdAt);
  exact(packet.originalPackage,['bytes','sha256','bodyBase64']);integer(packet.originalPackage.bytes,1);
  researchHash(packet.originalPackage.sha256);
  need(typeof packet.originalPackage.bodyBase64==='string','Retain the whole original package encoding.');
  const original=Buffer.from(packet.originalPackage.bodyBase64,'base64');
  need(original.length===packet.originalPackage.bytes&&original.toString('base64')===packet.originalPackage.bodyBase64&&
    sha(original)===packet.originalPackage.sha256,'The original received package bytes changed.');
  need(packet.sourceProjectId===delivery.sourceProjectId&&packet.productId===delivery.productId&&
    packet.editionId===delivery.editionId&&packet.deliverySha256===delivery.deliverySha256,
    'The customer return belongs to another issued delivery.');
  validateResearchExtension(packet.sourceBundle,{research:packet.research});
  need(packet.research.products.length===1&&same(packet.research,researchProductGraph({research:packet.research},packet.productId)),
    'Return one complete selected product and its whole source graph.');
  retainIssuedGraph(packet.research,delivery.research,packet.productId);
  need(currentProduct(packet.research,packet.productId).id===packet.selectedDefinitionId,'The selected returned definition changed.');
  const {id,...body}=packet;need(researchHash(id)===digest(body),'The complete Research return identity changed.');
  return packet;
}
export function researchReturnRecord(packet,bytes,at,direction,filename){
  need(['sent','received'].includes(direction),'Choose the original return direction.');
  text(filename,180,true);need(!/[\\/\r\n]/.test(filename),'Keep one original returned filename.');
  return {id:sha(bytes),bodyId:packet.id,bytes:bytes.length,filename,direction,recordedAt:instant(at),
    sourceProjectId:packet.sourceProjectId,productId:packet.productId,editionId:packet.editionId,
    packageSha256:packet.originalPackage.sha256,deliverySha256:packet.deliverySha256,
    customerProjectId:packet.customer.projectId,customerRevision:packet.customer.revision,
    definitionId:packet.selectedDefinitionId,title:currentProduct(packet.research,packet.productId).definition.title,
    author:packet.author,note:packet.note,createdAt:packet.createdAt,sources:packet.research.sources.length};
}
export function researchExchange(state){
  return state.researchExchange??{schema:RESEARCH_EXCHANGE,sent:[],received:[],drafts:[],adoptions:[]};
}
export function validateResearchExchangeState(state){
  if(state.researchExchange===undefined)return state;
  const e=state.researchExchange;exact(e,['schema','sent','received','drafts','adoptions']);
  need(e.schema===RESEARCH_EXCHANGE&&state.research,'Keep the research exchange with its original catalogue.');
  for(const field of ['sent','received','drafts','adoptions'])
    need(Array.isArray(e[field])&&e[field].length<=1000&&new Set(e[field].map(x=>x?.id)).size===e[field].length,
      'Keep unique complete original '+field+' records within project capacity.');
  need(new Set([...e.sent,...e.received].map(r=>r.id)).size===e.sent.length+e.received.length,
    'A retained return already belongs to this project; keep its original direction.','RESEARCH_RETURN_DIRECTION');
  for(const direction of ['sent','received'])for(const r of e[direction]){
    exact(r,['id','bodyId','bytes','filename','direction','recordedAt','sourceProjectId','productId','editionId',
      'packageSha256','deliverySha256','customerProjectId','customerRevision','definitionId','title','author','note','createdAt','sources']);
    for(const k of ['id','bodyId','editionId','packageSha256','deliverySha256','definitionId'])researchHash(r[k]);
    integer(r.bytes,1);integer(r.customerRevision,1);integer(r.sources);
    uuid(r.sourceProjectId);uuid(r.customerProjectId);key(r.productId);text(r.title,500,true);
    text(r.filename,180,true);need(!/[\\/\r\n]/.test(r.filename),'Retain one original filename.');
    text(r.author,200,true);text(r.note,12000);instant(r.createdAt);instant(r.recordedAt);
    need(r.direction===direction&&(direction==='sent'?r.customerProjectId:r.sourceProjectId)===state.id,
      'The return belongs to another original project.');
    need(catalogue(state).products.some(p=>p.id===r.productId),'The return lost its original product.');
  }
  for(const d of e.drafts){
    researchHash(d.id);need(e.received.some(r=>r.id===d.id),'The working review lost its original received file.');
    exact(d,['id','currentId','versions']);researchHash(d.currentId);
    need(Array.isArray(d.versions)&&d.versions.length>0&&d.versions.length<=1000&&
      new Set(d.versions.map(v=>v.id)).size===d.versions.length,'Keep every complete immutable review edition.');
    for(const [i,v] of d.versions.entries()){
      exact(v,['id','revision','savedAt','comparisonSha256','label']);
      researchHash(v.id);researchHash(v.comparisonSha256);instant(v.savedAt);text(v.label,200);
      need(v.revision===i+1,'Keep consecutive saved review editions.');
    }
    need(d.currentId===d.versions.at(-1).id,'Keep the current saved review at its latest immutable edition.');
  }
  for(const a of e.adoptions){
    exact(a,['id','returnId','workId','savedAt','fromDefinitionId','definitionId','draftRevision']);
    key(a.id);researchHash(a.returnId);researchHash(a.workId);researchHash(a.fromDefinitionId);researchHash(a.definitionId);
    instant(a.savedAt);integer(a.draftRevision,1);
    const r=e.received.find(r=>r.id===a.returnId),d=e.drafts.find(d=>d.id===a.returnId);
    need(r&&d?.versions.some(v=>v.id===a.workId&&v.revision===a.draftRevision)&&
      catalogue(state).products.find(p=>p.id===r.productId)?.versions.some(v=>v.id===a.definitionId),
      'The applied review lost its returned file, complete working edition or saved product.');
  }
  return state;
}
function sourceChoice(cat,id){
  const entry=cat.entries.find(x=>x.id===id);if(!entry)return null;
  const current=entry.versions.find(v=>v.id===entry.currentId);
  return {entry:clone(entry),definition:clone(current.definition),sources:clone(cat.sources.filter(x=>x.entryId===id)),
    reviews:clone(cat.reviews.filter(x=>x.entryId===id))};
}
export function comparisonContext(state,packet){
  need(state.id===packet.sourceProjectId,'This producer workspace did not issue the original delivery.');
  return {projectId:state.id,revision:state.revision,research:researchProductGraph(state,packet.productId)};
}
export function compareResearchReturn({context,packet,delivery,returnId}){
  researchHash(returnId);uuid(context.projectId);integer(context.revision,1);
  need(context.projectId===packet.sourceProjectId,'Compare in the original producing project.');
  retainIssuedGraph(context.research,delivery.research,packet.productId);
  const graphs={issued:delivery.research,current:context.research,returned:packet.research};
  const documents=Object.fromEntries(Object.entries(graphs).map(([k,g])=>[k,currentProduct(g,packet.productId).definition]));
  const requirementIds=[...new Set(Object.values(documents).flatMap(d=>d.requirements.map(r=>r.id)))].sort();
  const entryIds=[...new Set(Object.values(documents).flatMap(d=>d.requirements.flatMap(r=>r.entryIds)))].sort();
  const items=PRODUCT_FIELDS.map(name=>({field:'product/'+name,label:name[0].toUpperCase()+name.slice(1),kind:'product',
    ...Object.fromEntries(Object.entries(documents).map(([side,d])=>[side,clone(d[name])]))}));
  for(const id of requirementIds)items.push({field:'requirement/'+id,label:'Requirement · '+id,kind:'requirement',
    ...Object.fromEntries(Object.entries(documents).map(([side,d])=>[side,clone(d.requirements.find(r=>r.id===id)??null)]))});
  for(const id of entryIds)items.push({field:'source/'+id,label:'Source · '+(sourceChoice(context.research,id)?.definition.title??
      sourceChoice(packet.research,id)?.definition.title??id),kind:'source',
    ...Object.fromEntries(Object.entries(graphs).map(([side,g])=>[side,sourceChoice(g,id)]))});
  const binding={schema:RESEARCH_RETURN_COMPARISON,returnId,bodyId:packet.id,projectId:context.projectId,
    currentResearchSha256:digest(context.research),editionId:packet.editionId};
  return {...binding,revision:context.revision,comparisonSha256:digest(binding),productId:packet.productId,items,requirements:requirementIds,
    orders:Object.fromEntries(Object.entries(documents).map(([side,d])=>[side,d.requirements.map(r=>r.id)])),
    currentDefinitionId:currentProduct(context.research,packet.productId).id};
}
export function normalizeResearchReturnWork(value,comparison,{complete=false}={}){
  exact(value,['choices','order','note','label']);
  need(plain(value.choices),'Keep the explicit source and product decisions.');
  const fields=new Map(comparison.items.map(i=>[i.field,i]));
  need(Object.entries(value.choices).every(([field,side])=>fields.has(field)&&['issued','current','returned'].includes(side)),
    'Choose an original side of each compared field.');
  if(complete)need(Object.keys(value.choices).length===fields.size,'Choose every product, requirement and source field explicitly.');
  need(Array.isArray(value.order)&&value.order.length<=100&&new Set(value.order).size===value.order.length&&
    value.order.every(id=>comparison.requirements.includes(id)),'Choose a unique explicit requirement order.');
  const normalized={choices:clone(value.choices),order:clone(value.order),note:text(value.note,12000),label:text(value.label,200,complete)};
  return normalized;
}
function appendOriginal(target,rows,label){
  for(const row of rows){const old=target.find(x=>x.id===row.id);
    if(old)need(same(old,row),'A selected returned '+label+' conflicts with retained original bytes.','RESEARCH_RETURN_SOURCE_CONFLICT',409);
    else target.push(clone(row));
  }
}
export function composeResearchReturn({state,packet,delivery,returnId,comparisonSha256,choices,order}){
  const context=comparisonContext(state,packet),comparison=compareResearchReturn({context,packet,delivery,returnId});
  need(comparison.comparisonSha256===comparisonSha256,'Current producer work changed; reopen the same return and compare again.',
    'RESEARCH_RETURN_STALE',409);
  normalizeResearchReturnWork({choices,order,note:'',label:'Composed decision'},comparison,{complete:true});
  const picked=new Map(comparison.items.map(item=>[item.field,item[choices[item.field]]]));
  const requirements=comparison.requirements.map(id=>picked.get('requirement/'+id)).filter(Boolean);
  need(requirements.length>=1&&order.length===requirements.length&&requirements.every(r=>order.includes(r.id)),
    'The explicit order must include every retained requirement exactly once.');
  const document=normalizeProduct({productId:packet.productId,
    ...Object.fromEntries(PRODUCT_FIELDS.map(name=>[name,picked.get('product/'+name)])),
    requirements:order.map(id=>requirements.find(r=>r.id===id))});
  const required=new Set(document.requirements.flatMap(r=>r.entryIds)),cat=clone(catalogue(state)),newCaptures=[];
  for(const entryId of required){
    const selected=picked.get('source/'+entryId);
    need(selected,'A selected product requirement needs a complete chosen source.','RESEARCH_RETURN_SOURCE_REQUIRED');
    let entry=cat.entries.find(e=>e.id===entryId);
    if(!entry){entry={id:entryId,currentId:selected.entry.currentId,versions:[]};cat.entries.push(entry);}
    appendOriginal(entry.versions,selected.entry.versions,'source definition');
    entry.currentId=selected.entry.currentId;
    appendOriginal(cat.sources,selected.sources,'source capture');appendOriginal(cat.reviews,selected.reviews,'source review');
    for(const source of selected.sources){
      if(catalogue(state).sources.some(s=>s.id===source.id))continue;
      const raw=[...packet.sourceBundle.sources,...delivery.sourceBundle.sources].find(s=>s.id===source.id);
      need(raw,'The selected complete source bytes are absent.');newCaptures.push(raw);
    }
  }
  need(cat.sources.reduce((n,s)=>n+s.bytes,0)<=MAX_TOTAL_BYTES,'The resulting original source collection exceeds128MiB.');
  const p=product(cat,packet.productId),definitionId=digest(document);
  if(!p.versions.some(v=>v.id===definitionId))p.versions.push({id:definitionId,definition:document,savedAt:state.pending?.startedAt??new Date().toISOString()});
  p.currentId=definitionId;validateResearchState({research:cat});
  const coverage=productCoverage(cat,document);
  return {comparison,context,document,definitionId,research:cat,newCaptures,
    coverage,sources:[...required].map(id=>({entryId:id,side:choices['source/'+id],
      selected:sourceChoice(cat,id),coverage:coverage.flatMap(r=>r.selected.filter(s=>s.entryId===id))}))};
}
export function makeResearchReturnWork({state,packet,delivery,returnId,revision,choices,order,note,label,savedAt,context=comparisonContext(state,packet)}){
  const comparison=compareResearchReturn({context,packet,delivery,returnId});
  const working=normalizeResearchReturnWork({choices,order,note,label},comparison);
  const body={schema:RESEARCH_RETURN_WORK,returnId,revision:integer(revision,1),savedAt:instant(savedAt),
    comparisonSha256:comparison.comparisonSha256,context,...working};
  return {...body,id:digest(body)};
}
export function validateResearchReturnWork(work,packet,delivery){
  exact(work,['schema','returnId','revision','savedAt','comparisonSha256','context','choices','order','note','label','id']);
  need(work.schema===RESEARCH_RETURN_WORK,'Retain the complete original saved comparison.');
  integer(work.revision,1);instant(work.savedAt);researchHash(work.id);
  exact(work.context,['projectId','revision','research']);
  const comparison=compareResearchReturn({context:work.context,packet,delivery,returnId:work.returnId});
  need(comparison.comparisonSha256===work.comparisonSha256,'The saved comparison context changed.');
  normalizeResearchReturnWork(workSubset(work),comparison);
  const {id,...body}=work;need(digest(body)===id,'The saved working edition changed.');return comparison;
}
export function workSubset(work){return {choices:clone(work.choices),order:clone(work.order),note:work.note,label:work.label};}
