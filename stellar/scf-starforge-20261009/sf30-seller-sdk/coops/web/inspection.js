'use strict';
// MIT. Original retained-observation inspection inside the maintained coastal console.
globalThis.createCoopsInspectionView=function(D){
 const {A,$,esc,clone,recordKey,details,table,button,field,select,draft,api,perform,persist,renderPage,modal,notice,download}=D;
 let generation=0,activePoint=null,reviewChoice=null;
 const key=e=>'inspection:'+e.id;
 const selection=d=>({product:d.product,beginDate:d.beginDate,endDate:d.endDate,buckets:Number(d.buckets)});
 function state(e){return draft(key(e),{product:e.query.products.find(p=>p!=='predictions')??e.query.products[0],beginDate:e.query.beginDate,endDate:e.query.endDate,buckets:240,points:[],snapshot:null,rowPage:null,rowOffset:0,binOffset:0});}
 const compact=s=>({product:s.product,beginDate:s.beginDate,endDate:s.endDate,buckets:Number(s.buckets)});
 function same(d,s){return recordKey(selection(d))===recordKey(compact(s));}
 function current(){const e=A.edition;if(!e)throw new Error('Open an original source edition.');const d=state(e),r=d.snapshot;if(!r||r.source.editionId!==e.id||!same(d,r.selection))throw new Error('Inspect the entered product and dates before reviewing or exporting them. The previous inspected window remains retained.');return{e,d,r};}
 function metric(value){return value===null?'not available':String(value);}
 function pointRef(p){return Object.fromEntries(['recordId','sourcePageSha256','sourceRecord','rowSha256'].map(k=>[k,p[k]]));}
 function plotted(r){
  const finite=r.bins.flatMap(b=>[b.minimum?.plotValue,b.maximum?.plotValue]).filter(v=>typeof v==='number'&&Number.isFinite(v));
  if(!finite.length)return'<p>No finite numeric source values can be positioned on this axis. Full original records and their value types remain available below.</p>';
  const lo=Math.min(...finite),hi=Math.max(...finite),scale=Math.max(Math.abs(lo),Math.abs(hi),1),low=lo/scale,high=hi/scale,
   y=v=>high===low?125:220-(v/scale-low)/(high-low)*190,
   width=860/r.bins.length;
  let marks='';
  for(const b of r.bins){
   const x=90+(b.index+.5)*width,min=b.minimum?.plotValue,max=b.maximum?.plotValue;
   if(typeof min==='number'&&typeof max==='number')marks+='<line x1="'+x+'" x2="'+x+'" y1="'+y(min)+'" y2="'+y(max)+'" class="inspection-range"/><circle cx="'+x+'" cy="'+y(min)+'" r="2" class="inspection-dot"/><circle cx="'+x+'" cy="'+y(max)+'" r="2" class="inspection-dot"/>';
   const ratio=b.expectedSlots===null?(b.records?b.numericRecords/b.records:0):(b.expectedSlots?b.numericSlots/b.expectedSlots:0);
   marks+='<rect x="'+(90+b.index*width)+'" y="260" width="'+Math.max(.5,width)+'" height="16" class="inspection-slot"/>';
   if(ratio)marks+='<rect x="'+(90+b.index*width)+'" y="'+(276-ratio*16)+'" width="'+Math.max(.5,width)+'" height="'+(ratio*16)+'" class="inspection-filled"/>';
  }
  return'<figure class="inspection-figure"><svg viewBox="0 0 980 330" role="img" aria-label="Original bin extrema and numeric coverage for the inspected product and dates"><path d="M90 25V225H950" class="inspection-axis"/>'+
   '<text x="6" y="35">'+esc(hi)+'</text><text x="6" y="222">'+esc(lo)+'</text><text x="90" y="15">'+esc(r.source.unit)+' · '+esc(r.selection.product)+'</text>'+marks+
   '<text x="90" y="246">Numeric coverage by bin</text><text x="90" y="303">'+esc(r.selection.beginDate)+'</text><text x="950" y="303" text-anchor="end">'+esc(r.selection.endDate)+'</text></svg>'+
   '<figcaption>Each vertical mark joins only the original minimum and maximum within one bin. No line connects adjacent bins. Coverage is numeric grid slots / expected slots, or numeric records / returned records when no fixed grid is available. Inspect each bin and every original row below.</figcaption></figure>';
 }
 function resultPanel(e,d,r){
  const c=r.counts,points=d.points??[],page=d.rowPage;
  let body='<div class="inspection-basis"><strong>'+esc(r.source.stationName??r.source.stationId)+' · '+esc(r.source.stationId)+'</strong><p>'+esc(r.selection.product)+' · '+esc(r.source.datum)+' · '+esc(r.source.unit)+' · '+esc(r.clockBasis)+'</p><p>'+esc(r.selection.beginDate)+' through '+esc(r.selection.endDate)+' inclusive · '+r.bins.length+' complete time bins</p><p class="pin">Inspection '+esc(r.inspectionSha256)+'</p></div>';
  if(!same(d,r.selection))body+='<p class="error">The fields have changed. This is the preceding inspected selection; inspect the new fields before attaching a review or preparing its export.</p>';
  body+='<div class="cards inspection-counts">'+[['Original records',c.records],['Numeric records',c.numericRecords],['Expected slots',c.expectedSlots],['Missing slots',c.missingSlots],['Slots without numeric values',c.slotsWithoutNumericValue],['Duplicate records',c.duplicateRecords],['Conflicting timestamp keys',c.conflictingTimestampKeys],['Off-grid records',c.offGridRecords]].map(([label,value])=>'<div class="card"><strong>'+esc(metric(value))+'</strong><p>'+esc(label)+'</p></div>').join('')+'</div>';
  if(r.warnings.length)body+='<ul>'+r.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>';
  body+=plotted(r);
  const start=Math.min(Number(d.binOffset)||0,Math.max(0,r.bins.length-1)),bins=r.bins.slice(start,start+24);
  body+='<h3>Inspect a time bin</h3>'+table(['Original clock interval','Records / numeric','Missing slots','Minimum / maximum','Original points'],bins.map(b=>[esc(b.beginClock)+'<br>to '+esc(b.endExclusiveClock)+' exclusive',b.records+' / '+b.numericRecords,esc(metric(b.missingSlots)),esc(b.minimum?.value??'unavailable')+' / '+esc(b.maximum?.value??'unavailable'),button('inspection-bin','Inspect bin',String(b.index))]))+
   '<div class="actions">'+button('inspection-bins-prev','Earlier bins','',start===0?'disabled':'')+button('inspection-bins-next','Later bins','',start+24>=r.bins.length?'disabled':'')+'</div>';
  body+='<h3>Every original record in this window</h3><div class="actions">'+button('inspection-rows','Open selected rows')+'</div>';
  if(page&&recordKey(compact(page.selection))===recordKey(compact(r.selection))){
   body+='<p>'+page.total+' complete selected records; showing '+page.offset+'–'+(page.offset+page.rows.length)+'.</p>'+
    table(['Clock','Value / original type','Quality / flags','Source row',''],page.rows.map((item,i)=>{const row=item.row;return[esc(row.timestamp),esc(row.value)+' / '+esc(row.valueType),esc(row.quality)+' / '+esc(row.flags),esc(row.sourceRecord),button('inspection-row','Inspect exact original',String(i))];}))+
    '<div class="actions">'+button('inspection-rows-prev','Previous records','',page.offset===0?'disabled':'')+button('inspection-rows-next','Next records','',page.offset+page.rows.length>=page.total?'disabled':'')+'</div>';
  }
  body+='<h3>Points retained for this review</h3><p>'+points.length+' of 32 selected original point references. Open a bin or source row to keep a point.</p>'+
   table(['Original point','Response SHA-256',''],points.map((point,i)=>[esc(point.recordId)+' · '+esc(point.sourceRecord),'<span class="pin">'+esc(point.sourcePageSha256)+'</span>',button('inspection-kept','Open point',String(i))+button('inspection-remove','Remove from selection',String(i))]))+
   '<div class="actions">'+button('inspection-review','Attach this window and points to the source review')+button('inspection-export','Export every selected row')+'</div>'+
   details('Original value types and quality codes',{valueTypes:r.valueTypes,quality:r.quality})+details('Original grid and display basis',{grid:r.grid,notes:r.notes})+
   details('Selected source requests and response identities',{sourceRequestsComplete:r.sourceRequestsComplete,tasks:r.sourceTasks,responses:r.sources});
  return body;
 }
 function render(e){
  const d=state(e),form=key(e);
  return'<section id="observation-inspection" class="card"><h2>Inspect retained observations</h2><p>Choose one original product and date window. Read its complete coverage, exact values and source records, then retain that selection with the normal source review.</p>'+
   '<form id="inspection-form"><div class="form-grid">'+select(form,'product','Original product',e.query.products.map(p=>({value:p,label:A.schema.products.find(x=>x.id===p)?.label??p})),d.product)+
   field(form,'beginDate','First date',d.beginDate,'date','required min="'+e.query.beginDate+'" max="'+e.query.endDate+'"')+field(form,'endDate','Last date, inclusive',d.endDate,'date','required min="'+e.query.beginDate+'" max="'+e.query.endDate+'"')+
   field(form,'buckets','Display bins',d.buckets,'number','required min="1" max="480" step="1"')+'</div><button type="submit">Inspect complete window</button></form>'+
   (d.snapshot?resultPanel(e,d,d.snapshot):'<p>Inspection reads the retained source bytes; it does not request new observations.</p>')+'</section>';
 }
 async function inspect(){
  const e=A.edition,d=state(e),chosen=selection(d),token=A.draftTokens[key(e)],seq=++generation;
  notice('Reading every original row in the selected window…');
  const r=await api('/api/inspection?'+new URLSearchParams({editionId:e.id,...chosen}));
  if(seq!==generation||A.edition?.id!==e.id||A.draftTokens[key(e)]!==token||recordKey(selection(state(e)))!==recordKey(chosen))return;
  if(r.schema!=='stellar-forge.coops-observation-inspection.v1'||r.source.editionId!==e.id||recordKey(compact(r.selection))!==recordKey(chosen))throw new Error('The inspection returned a different original selection.');
  const prior=d.snapshot;d.snapshot=r;d.rowPage=null;d.rowOffset=0;d.binOffset=0;if(prior?.inspectionSha256!==r.inspectionSha256)d.points=[];
  await persist();renderPage();notice('Complete original window inspected. Source review remains an explicit saved decision.');
 }
 async function rows(offset=0){
  const {e,d,r}=current(),pin=r.inspectionSha256,seq=++generation;
  const result=await api('/api/inspection-rows?'+new URLSearchParams({editionId:e.id,...compact(r.selection),offset,limit:50}));
  if(seq!==generation||A.edition?.id!==e.id||state(e).snapshot?.inspectionSha256!==pin||!same(state(e),r.selection))return;
  if(result.source.editionId!==e.id||recordKey(compact(result.selection))!==recordKey(compact(r.selection)))throw new Error('The original row page refers to a different selection.');
  d.rowPage=result;d.rowOffset=result.offset;await persist();renderPage();
 }
 async function openPoint(reference){
  const {e,r}=current(),pin=r.inspectionSha256,seq=++generation;
  const point=await api('/api/inspection-point',{body:{editionId:e.id,reference}});
  if(seq!==generation||A.edition?.id!==e.id||state(e).snapshot?.inspectionSha256!==pin||!same(state(e),r.selection))return;
  if(point.source.editionId!==e.id||recordKey(point.reference)!==recordKey(reference))throw new Error('The point reply differs from the original selected reference.');
  activePoint={editionId:e.id,inspectionSha256:pin,point};
  modal('Exact original observation',details('Original value and source flags',point.original)+details('Full retained projected row',point.row)+details('Original response receipt',point.receipt)+
   '<div class="actions">'+button('inspection-keep','Keep this point for review')+button('inspection-source','Download complete original response')+'</div>');
 }
 function reviewPayload(r,points){return{selection:clone(r.selection),expectedInspectionSha256:r.inspectionSha256,points:clone(points)};}
 function openReview(){
  const {e,d,r}=current(),reviewKey='review:'+e.id,review=draft(reviewKey,{subject:'Source, datum and coverage review',note:'',status:'open'});
  reviewChoice={editionId:e.id,inspectionSha256:r.inspectionSha256,pointsKey:recordKey(d.points??[]),reviewKey,token:A.draftTokens[reviewKey],before:recordKey(review),inspection:reviewPayload(r,d.points??[])};
  modal('Attach the inspected source selection','<p>The existing subject, note and decision stay as entered. This choice attaches the exact inspected window and selected points; saving the source review is still a separate action.</p>'+
   details('Current entered review',review)+details('Selected inspection',{source:r.source,selection:r.selection,inspectionSha256:r.inspectionSha256,counts:r.counts,points:d.points??[]})+
   button('inspection-attach','Use this inspected selection in the entered review'));
 }
 async function attach(){
  const c=reviewChoice,{e,d,r}=current();
  if(!c||c.editionId!==e.id||c.inspectionSha256!==r.inspectionSha256||c.pointsKey!==recordKey(d.points??[])||A.draftTokens[c.reviewKey]!==c.token||recordKey(A.drafts[c.reviewKey])!==c.before)throw new Error('The selected points or review changed. Compare them again before attaching this selection.');
  A.drafts[c.reviewKey].inspection=clone(c.inspection);await persist();reviewChoice=null;$('#dialog').close();renderPage();$('#review-form')?.scrollIntoView({block:'start'});notice('The exact inspected selection is attached to the entered review. Check its note and decision, then Save source review.');
 }
 function exportDialog(){
  const {e,r}=current();modal('Export every selected original row','<p>This export contains all rows in the inspected window, including duplicate, blank and nonnumeric records. The display bins do not reduce the file.</p>'+
   details('Exact source selection',{source:r.source,selection:r.selection,inspectionSha256:r.inspectionSha256})+
   '<form id="inspection-export-form" data-edition="'+esc(e.id)+'" data-pin="'+esc(r.inspectionSha256)+'"><div class="form-grid"><label>File format<select name="format"><option value="csv">CSV</option><option value="jsonl">JSONL</option><option value="json">JSON with original metadata</option></select></label><label>Saved model-input mapping<select name="mappingId"><option value="">Original coastal columns</option>'+
   A.view.mappings.filter(m=>m.table===r.selection.table).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+' · revision '+esc(m.revision)+'</option>').join('')+'</select></label></div><button type="submit">Prepare complete selected export</button></form>');
 }
 async function submit(form){
  if(form.id==='inspection-form')return inspect();
  if(form.id==='inspection-export-form'){
   const {e,r}=current();if(form.dataset.edition!==e.id||form.dataset.pin!==r.inspectionSha256)throw new Error('The inspected window changed. Reopen its selected export.');
   const values=new FormData(form),s=r.selection,payload={editionId:e.id,table:s.table,beginDate:s.beginDate,endDate:s.endDate,products:s.products,format:values.get('format')};
   if(values.get('mappingId'))payload.mappingId=values.get('mappingId');
   const saved=await perform('export.create',payload);$('#dialog').close();renderPage();
   if(saved?.result?.id)modal('Complete selected export retained',details('Original file and selection',saved.result)+button('inspection-download-export','Download selected original rows',saved.result.id));
   return;
  }
 }
 async function click(cmd,id){
  if(cmd==='inspection-download-export')return download({kind:'export',id});
  const {e,d,r}=current();
  if(cmd==='inspection-rows')return rows(0);
  if(cmd==='inspection-rows-prev'||cmd==='inspection-rows-next')return rows(Math.max(0,(d.rowPage?.offset??0)+(cmd.endsWith('next')?50:-50)));
  if(cmd==='inspection-bins-prev'||cmd==='inspection-bins-next'){d.binOffset=Math.max(0,Math.min(r.bins.length-1,(Number(d.binOffset)||0)+(cmd.endsWith('next')?24:-24)));await persist();renderPage();return;}
  if(cmd==='inspection-bin'){
   const bin=r.bins[Number(id)];if(!bin)throw new Error('Select an original inspected bin.');
   modal('Original points in this time bin',details('Complete bin counts and bounds',bin)+'<div class="actions">'+['first','last','minimum','maximum'].filter(k=>bin[k]).map(k=>button('inspection-bin-point','Inspect '+k,id,'data-point="'+k+'"')).join('')+'</div>');return;
  }
  if(cmd==='inspection-row'){const item=d.rowPage?.rows[Number(id)];if(!item)throw new Error('Reopen the original selected row page.');return openPoint(item.reference);}
  if(cmd==='inspection-kept'){const ref=d.points?.[Number(id)];if(!ref)throw new Error('Select a retained original point.');return openPoint(ref);}
  if(cmd==='inspection-remove'){d.points.splice(Number(id),1);await persist();renderPage();return;}
  if(cmd==='inspection-keep'||cmd==='inspection-source'){
   if(activePoint?.editionId!==e.id||activePoint.inspectionSha256!==r.inspectionSha256)throw new Error('Reopen the exact original point for this inspection.');
   if(cmd==='inspection-source')return download({kind:'source',id:e.id,page:activePoint.point.pageIndex});
   const reference=activePoint.point.reference;d.points??=[];
   if(d.points.some(p=>recordKey(p)===recordKey(reference))){notice('That exact original point is already retained.');return;}
   if(d.points.length>=32)throw new Error('Keep at most 32 selected points for one source review. Every source row remains in the complete export.');
   d.points.push(clone(reference));await persist();$('#dialog').close();renderPage();return;
  }
  if(cmd==='inspection-review')return openReview();
  if(cmd==='inspection-attach')return attach();
  if(cmd==='inspection-export')return exportDialog();
 }
 return{render,submit,async click(cmd,id,control){if(cmd==='inspection-bin-point'){const {r}=current(),p=r.bins[Number(id)]?.[control.dataset.point];if(!p)throw new Error('Select an exact point from this inspected bin.');return openPoint(pointRef(p));}return click(cmd,id);}};
};
