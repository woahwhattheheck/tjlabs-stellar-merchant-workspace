/* MIT. Saved publisher geography in the original IATI workspace. */
'use strict';
window.IatiGeographyUi=function(api){
 const $=id=>document.getElementById(id),BASE='/api/iati/geography',NS='http://www.w3.org/2000/svg';
 const {get,post,request,action,status,metrics,properties,details}=api;
 const txt=value=>value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);
 const short=value=>txt(value).slice(0,12),clone=value=>structuredClone(value);
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 const lexical=(a,b)=>{const left=Array.from(a,c=>c.codePointAt(0)),right=Array.from(b,c=>c.codePointAt(0));for(let i=0;i<Math.min(left.length,right.length);i++)if(left[i]!==right[i])return left[i]-right[i];return left.length-right.length;};
 const lines=id=>[...new Set($(id).value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean))].sort(lexical);
 const label=value=>txt(value).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replaceAll('_',' ').replaceAll('-',' ');
 let catalogue={reviews:[]},view=null,historyRows=[],pending=null,workspaceKey=null,db=null,epoch=0;
 let findings=[],acquisition=[],dirty=false,record=null,page=null,rowPageStarts=[],activeFilters={};
 let points=[],pointPage=null,mapBox=[0,0,1000,500],tabName='selection';
 const sourceList=()=>api.workspaceState().sources||[],ports=()=>api.portfolioList?.()||[];
 const latest=()=>!!view&&catalogue.reviews.some(item=>item.id===view.id&&item.revision===view.revision);
 const snapshot=()=>{if(!view)throw new Error('Open a saved geographic review.');return{id:view.id,revision:view.revision};};
 const selectedSources=()=>[...$('geo-sources').querySelectorAll('input:checked')].map(input=>input.value).sort();
 function clear(holder,message=''){holder.replaceChildren();holder.classList.toggle('empty',!!message);if(message)holder.textContent=message;}
 function optionList(id,rows,value,empty='Choose a saved record'){
  const el=$(id),selected=value??el.value;el.replaceChildren(new Option(empty,''));
  for(const row of rows)el.add(new Option(row.label,row.id));
  el.value=rows.some(row=>String(row.id)===String(selected))?String(selected):'';
 }
 function showTab(name){
  tabName=name;document.querySelectorAll('[data-geo-panel]').forEach(el=>el.hidden=el.dataset.geoPanel!==name);
  document.querySelectorAll('[data-geo-tab]').forEach(el=>el.setAttribute('aria-current',el.dataset.geoTab===name?'step':'false'));
 }
 async function storePending(mode,value){
  if(!workspaceKey)throw new Error('Open the original geographic workspace before saving an action.');
  if(!db)db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sf30-iati-geography-requests',1);r.onupgradeneeded=()=>r.result.createObjectStore('requests',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const key=workspaceKey+':pending';
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction('requests',mode==='read'?'readonly':'readwrite'),s=tx.objectStore('requests');let result;
   if(mode==='read'){const r=s.get(key);r.onsuccess=()=>{result=r.result;};}
   else if(mode==='finish'){s.put({...value,key:workspaceKey+':history:'+value.localId});s.delete(key);}
   else s.put({...value,key});
   tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('The complete request could not be retained in this browser.'));
  });
 }
 function drawPending(){
  $('geo-pending').hidden=!pending;
  $('geo-pending-title').textContent=pending?.kind==='receive'?'The complete receiving file is retained':'The complete save request is retained';
  $('geo-pending-message').textContent=pending?(pending.kind==='save'?'Request '+pending.input.requestId+'. ':'Packet '+pending.fileName+' · '+pending.bytes+' bytes. ')+(pending.failure?.message||'Continue this exact original input after an interrupted response.'):'';
  $('geo-revise-rejected').hidden=!pending?.rejected;
 }
 function buttons(){
  const busy=api.isBusy?.()??false,editable=!view||latest();
  for(const el of document.querySelectorAll('[data-geo-save]'))el.disabled=busy||!!pending||!editable;
  $('geo-prepare-finding').disabled=busy||!!pending||!view||!latest()||!record;
  $('geo-open').disabled=busy||!!pending||!$('geo-review-select').value;
  $('geo-new').disabled=busy||!!pending;$('geo-refresh').disabled=busy;
  $('geo-receive').disabled=busy||!!pending;
  $('geo-retry').disabled=busy||!pending;$('geo-revise-rejected').disabled=busy||!pending?.rejected;
  $('geo-rows-prev').disabled=busy||!page||rowPageStarts.length===0;
  $('geo-rows-next').disabled=busy||!page||page.nextOffset===null;
  $('geo-more-points').disabled=busy||!pointPage||pointPage.nextOffset===null;
  $('geo-compare').disabled=busy||!view||historyRows.length<2;
  for(const el of document.querySelectorAll('[data-geo-export]'))el.disabled=busy||!view;
  for(const id of ['geo-zoom-in','geo-zoom-out','geo-map-fit','geo-map-reset','geo-pan-left','geo-pan-right','geo-pan-up','geo-pan-down'])$(id).disabled=busy||!view;
  $('geo-draft-note').textContent=dirty?'Changes are prepared locally. Save the complete revision to retain them.':view?'The displayed location register remains revision '+view.revision+'.':'';
  drawPending();
 }
 function sourceChoices(ids=[]){
  const selected=new Set(ids),items=sourceList(),all=[...items];
  for(const id of ids)if(!all.some(item=>item.id===id))all.push({id,label:'Retained source '+short(id)});
  clear($('geo-sources'),all.length?'':'Retain a complete publisher activity XML file first.');
  for(const item of all){
   const labelEl=document.createElement('label');labelEl.className='source-choice';
   const input=document.createElement('input');input.type='checkbox';input.value=item.id;input.checked=selected.has(item.id);
   const span=document.createElement('span'),small=document.createElement('small');span.textContent=item.label||item.name||short(item.id);
   small.textContent=item.id+(item.bytes===undefined?'':' · '+item.bytes+' original bytes');span.append(small);labelEl.append(input,span);$('geo-sources').append(labelEl);
   input.onchange=()=>{acquisition=readAcquisition();renderAcquisition();dirty=true;buttons();};
  }
 }
 function readAcquisition(){
  const rows=[];
  for(const card of $('geo-acquisition').querySelectorAll('[data-geo-source]')){
   const row={source:card.dataset.geoSource};
   for(const el of card.querySelectorAll('[data-field]'))row[el.dataset.field]=el.value;
   if(acquisition.some(item=>item.source===row.source)||Object.entries(row).some(([key,value])=>key!=='source'&&value!==''))rows.push(row);
  }
  return rows;
 }
 function renderAcquisition(){
  clear($('geo-acquisition'));
  for(const source of selectedSources()){
   const original=acquisition.find(row=>row.source===source)||{},meta=sourceList().find(item=>item.id===source);
   const card=document.createElement('div');card.className='geo-source-provenance';card.dataset.geoSource=source;
   const title=document.createElement('h3');title.textContent=meta?.label||meta?.name||short(source);card.append(title);
   const identity=document.createElement('p');identity.className='identity';identity.textContent=source;card.append(identity);
   for(const [field,name]of [['publisher','Publisher'],['url','Original source URL'],['retrievedAt','Acquired at, as recorded (ISO time)'],['license','Licence / rights notice'],['citation','Citation']]){
    const labelEl=document.createElement('label');labelEl.textContent=name;
    const input=document.createElement(field==='citation'?'textarea':'input');if(field==='citation')input.rows=3;input.dataset.field=field;input.value=original[field]||'';
    input.addEventListener('input',()=>{dirty=true;buttons();});labelEl.append(input);card.append(labelEl);
   }
   $('geo-acquisition').append(card);
  }
 }
 function historyOptions(){
  const rows=historyRows.map(item=>({id:String(item.revision),label:'Revision '+item.revision+' · '+item.name+' · '+(item.review?.status||'draft')}));
  optionList('geo-baseline',rows,view?.baselineRevision===null?'':view?.baselineRevision,'No geographic baseline');
  optionList('geo-compare-before',rows,historyRows.length>1?String(historyRows[historyRows.length-2].revision):'');
  optionList('geo-compare-after',rows,historyRows.length?String(historyRows[historyRows.length-1].revision):'');
 }
 function form(value=null){
  epoch++;view=value;record=null;page=null;rowPageStarts=[];points=[];pointPage=null;mapBox=[0,0,1000,500];
  findings=clone(value?.findings||[]);acquisition=clone(value?.acquisition||[]);dirty=false;
  $('geo-name').value=value?.name||'';$('geo-notes').value=value?.notes||'';
  $('geo-activity-ids').value=(value?.selection?.activityIds||[]).join('\n');$('geo-language').value=value?.selection?.language||'';
  $('geo-review-status').value=value?.review?.status||'draft';$('geo-reviewer').value=value?.review?.reviewer||'';$('geo-review-note').value=value?.review?.note||'';
  $('geo-portfolio-revision').value=value?.portfolio?.revision||'';
  optionList('geo-portfolio',ports().map(item=>({id:item.id,label:item.name+' · latest r'+item.revision})),value?.portfolio?.id,'No portfolio context');
  sourceChoices(value?.sources||[]);renderAcquisition();
  $('geo-form-title').textContent=value?'Prepare the next geographic revision':'Create a geographic review';
  $('geo-mode').textContent=value?'Saved revision '+value.revision:'New selection';
  $('geo-open-revision').value=value?.revision||'';
  $('geo-identity').textContent=value?value.id+'\nRevision '+value.revision+'\nDefinition '+value.definitionSha256:'A new review gets its own immutable identity when saved.';
  const selected=value?'Review '+short(value.id)+' · revision '+value.revision:'Open a saved geographic review.';
  $('geo-locations-revision').textContent=$('geo-export-selection').textContent=selected;
  $('geo-historical').hidden=!value||latest();$('geo-historical').textContent=value?'Historical revision '+value.revision+'. Its exact map, register and exports are read only. Open the latest revision to prepare another change.':'';
  optionList('geo-filter-source',(value?.sources||[]).map(id=>({id,label:(sourceList().find(item=>item.id===id)?.label||short(id))+' · '+short(id)})),'','All selected sources');
  clearFilters();clear($('geo-rows'),'Choose a saved review.');clear($('geo-detail'),'Open a register row or a map point.');
  $('geo-finding-selection').textContent='No source record selected.';clear($('geo-comparison'),'Choose two saved revisions.');
  renderFindings();renderCoverage();renderMap();historyOptions();buttons();
 }
 function renderCoverage(){
  clear($('geo-counts'));clear($('geo-coverage'),view?'':'Save or open a review to read its native coverage.');
  $('geo-coverage-revision').textContent=view?'Revision '+view.revision:'';
  if(!view)return;
  const counts=view.report?.counts||{};
  metrics($('geo-counts'),Object.entries(counts).filter(([,value])=>typeof value==='number'||typeof value==='string').map(([key,value])=>[label(key),value]));
  properties($('geo-coverage'),{review:view.review?.status||'draft',sources:view.sources.length,revision:view.revision});
  for(const [key,name]of [['bySource','Complete source coverage'],['coordinateStatuses','Reported coordinate statuses'],['decisions','Analyst decisions']])if(view.report?.[key]!==undefined)details($('geo-coverage'),name,view.report[key]);
 }
 function renderHistory(){
  clear($('geo-history'),historyRows.length?'':'No saved revision history.');
  for(const item of historyRows){
   const row=document.createElement('div');row.className='geo-history-row';
   const title=document.createElement('strong');title.textContent='Revision '+item.revision+' · '+item.name;
   const text=document.createElement('p');text.textContent=(item.review?.status||'draft')+' · '+(item.review?.reviewer||'No named reviewer')+' · '+txt(item.updated);
   const id=document.createElement('p');id.className='identity';id.textContent=(item.sources||[]).map(short).join(' / ')+' · '+short(item.definitionSha256);
   const box=document.createElement('div');box.append(title,text,id);
   const button=document.createElement('button');button.type='button';button.textContent='Open this revision';button.disabled=!!pending;
   button.onclick=()=>action('Opening the exact geographic revision…',()=>openReview(item.id,item.revision));row.append(box,button);$('geo-history').append(row);
  }
 }
 async function refresh(){
  const result=await get(BASE+'/state');
  if(!result||!Array.isArray(result.reviews)||!hash(result.workspaceSha256))throw new Error('The original geographic workspace identity and review catalogue are required.');
  const changed=workspaceKey!==result.workspaceSha256;catalogue=result;
  if(changed){workspaceKey=result.workspaceSha256;pending=await storePending('read')||null;if(view)form(null);}
  optionList('geo-review-select',catalogue.reviews.map(item=>({id:item.id,label:item.name+' · r'+item.revision})),view?.id);
  if(!view){const sources=selectedSources();acquisition=readAcquisition();sourceChoices(sources);renderAcquisition();optionList('geo-portfolio',ports().map(item=>({id:item.id,label:item.name+' · latest r'+item.revision})),$('geo-portfolio').value,'No portfolio context');}
  if(view){$('geo-historical').hidden=latest();$('geo-historical').textContent='Historical revision '+view.revision+'. Its exact map, register and exports are read only. Open the latest revision to prepare another change.';}
  drawPending();buttons();
 }
 function checkedPage(result,selected){
  if(!result||result.id!==selected.id||result.revision!==selected.revision||!Array.isArray(result.rows)||!Number.isSafeInteger(result.total)||result.total<0||!Number.isSafeInteger(result.offset)||result.offset<0)throw new Error('The native geography page does not match the exact saved revision.');
  if(selected.offset!==undefined&&result.offset!==selected.offset||selected.limit!==undefined&&result.limit!==selected.limit)throw new Error('The original geographic page offset or limit differs from this request.');
  if(result.nextOffset!==null&&(!Number.isSafeInteger(result.nextOffset)||result.nextOffset<=result.offset))throw new Error('The original geographic page cursor is incomplete.');
  if(result.rows.some(row=>!view.sources.includes(row.source)||typeof row.row_id!=='string'))throw new Error('A returned location belongs to another original source.');
  return result;
 }
 async function openReview(id,revision){
  if(pending)throw new Error('Continue the retained request before changing the active review.');
  if(!id)throw new Error('Choose a saved geographic review.');
  const suffix=revision===undefined?'':'?revision='+encodeURIComponent(revision);
  const [saved,past]=await Promise.all([get(BASE+'/reviews/'+encodeURIComponent(id)+suffix),get(BASE+'/reviews/'+encodeURIComponent(id)+'/history')]);
  if(!saved||saved.id!==id||!Number.isSafeInteger(saved.revision)||revision!==undefined&&saved.revision!==revision)throw new Error('The returned review is not the selected saved revision.');
  historyRows=past;
  if(!Array.isArray(historyRows)||historyRows.some(item=>item.id!==id))throw new Error('The complete original geographic history is required.');
  form(saved);$('geo-review-select').value=id;renderHistory();
  await readRows(0);await readPoints(true);status('Opened geographic revision '+saved.revision+' with its original source and review context.');
 }
 function clearFilters(){
  for(const id of ['geo-filter-source','geo-filter-search','geo-filter-activity','geo-filter-coordinate','geo-filter-decision','geo-filter-exactness','geo-filter-class','geo-filter-reach'])$(id).value='';
  activeFilters={};
 }
 function filterInput(){
  const out={};for(const [id,key]of [['geo-filter-source','source'],['geo-filter-search','search'],['geo-filter-activity','activityId'],['geo-filter-coordinate','coordinateStatus'],['geo-filter-decision','decision'],['geo-filter-exactness','exactness'],['geo-filter-class','locationClass'],['geo-filter-reach','locationReach']]){const value=$(id).value.trim();if(value)out[key]=value;}return out;
 }
 function sourceName(id){const value=sourceList().find(item=>item.id===id);return value?.label||value?.name||short(id);}
 function renderRows(){
  clear($('geo-rows'));if(!page){$('geo-rows').textContent='Open a saved review.';return;}
  const wrapper=document.createElement('div');wrapper.className='table-scroll geo-records';const table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody'),tr=document.createElement('tr');
  for(const name of ['Inspect','Activity / publisher','Reported location','Coordinates / status','Exactness / class / reach','Finding']){const th=document.createElement('th');th.scope='col';th.textContent=name;tr.append(th);}head.append(tr);table.append(head,body);
  for(const row of page.rows){
   const tr=document.createElement('tr'),open=document.createElement('td'),button=document.createElement('button');button.type='button';button.textContent='Open record';button.onclick=()=>action('Reading complete original location fields…',()=>openRecord(row.source,row.row_id));open.append(button);tr.append(open);
   const values=[(row.title||row.activity_id)+'\n'+row.activity_id+'\n'+sourceName(row.source),(row.location_name||row.location_ref||'No location name')+'\n'+txt(row.location_present),(row.coordinate_status==='valid'?row.latitude+', '+row.longitude:txt(row.position_text))+'\n'+row.coordinate_status,[row.exactness,row.location_class,row.location_reach].map(txt).join(' / '),row.finding?row.finding.decision+' · '+row.finding.reviewer:'No analyst finding'];
   values.forEach((value,index)=>{const td=document.createElement('td');td.textContent=value;if(index===2)td.className='geo-coordinate';tr.append(td);});body.append(tr);
  }
  if(!page.rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='No records match this exact saved selection.';tr.append(td);body.append(tr);}
  wrapper.append(table);$('geo-rows').append(wrapper);
  $('geo-rows-count').textContent=page.total+' matching records';
  $('geo-rows-page').textContent=(page.rows.length?page.offset+1:0)+'–'+(page.offset+page.rows.length)+' of '+page.total+' · revision '+page.revision;buttons();
 }
 async function readRows(offset,direction='reset'){
  const selected=snapshot(),ticket=epoch,current=page?.offset,result=await post(BASE+'/rows',{...selected,...activeFilters,offset,limit:50});
  if(ticket!==epoch)return;
  const received=checkedPage(result,{...selected,offset,limit:50});
  if(direction==='next'&&Number.isSafeInteger(current)&&current!==received.offset)rowPageStarts.push(current);
  else if(direction==='previous')rowPageStarts.pop();
  else rowPageStarts=[];
  page=received;renderRows();
 }
 async function openRecord(source,rowId){
  const selected=snapshot(),ticket=epoch,result=await post(BASE+'/rows',{...selected,source,rowId,offset:0,limit:2});
  if(ticket!==epoch)return;checkedPage(result,{...selected,offset:0,limit:2});
  if(result.total!==1||result.rows.length!==1||result.rows[0].source!==source||result.rows[0].row_id!==rowId)throw new Error('The exact source location could not be selected unambiguously.');
  record=result.rows[0];clear($('geo-detail'));const holder=document.createElement('div');holder.className='geo-detail-fields';properties(holder,record);$('geo-detail').append(holder);
  $('geo-finding-selection').textContent=source+'\n'+rowId+'\nReview '+selected.id+' · revision '+selected.revision;
  const finding=findings.find(row=>row.source===source&&row.rowId===rowId)||record.finding;
  $('geo-finding-decision').value=finding?.decision||'note';$('geo-finding-reviewer').value=finding?.reviewer||$('geo-reviewer').value;$('geo-finding-note').value=finding?.note||'';
  renderMap();buttons();$('geo-detail').scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 async function readPoints(reset){
  const selected=snapshot(),ticket=epoch;
  if(reset){points=[];pointPage=null;}
  if(activeFilters.coordinateStatus&&activeFilters.coordinateStatus!=='valid'){points=[];pointPage={...selected,rows:[],offset:0,limit:1000,total:0,nextOffset:null};renderMap();return;}
  const offset=reset?0:pointPage?.nextOffset;if(offset===null||offset===undefined)return;
  const result=await post(BASE+'/points',{...selected,...activeFilters,coordinateStatus:'valid',offset,limit:1000});
  if(ticket!==epoch)return;checkedPage(result,{...selected,offset,limit:1000});
  for(const row of result.rows)if(row.coordinate_status!=='valid'||row.latitude.trim()===''||row.longitude.trim()===''||!Number.isFinite(Number(row.latitude))||!Number.isFinite(Number(row.longitude))||Math.abs(Number(row.latitude))>90||Math.abs(Number(row.longitude))>180)throw new Error('The native valid-coordinate page contains an invalid position; its original data remains retained.');
  const old=new Set(points.map(row=>row.source+':'+row.row_id));if(result.rows.some(row=>old.has(row.source+':'+row.row_id)))throw new Error('The original coordinate page repeated a source record.');
  points.push(...result.rows);pointPage=result;renderMap();buttons();
 }
 function svg(name,attributes){const node=document.createElementNS(NS,name);for(const[key,value]of Object.entries(attributes||{}))node.setAttribute(key,String(value));return node;}
 function mapPosition(row){return[(Number(row.longitude)+180)/360*1000,(90-Number(row.latitude))/180*500];}
 function renderMap(){
  $('geo-map').setAttribute('viewBox',mapBox.join(' '));const grid=$('geo-grid');grid.replaceChildren();
  const background=svg('rect',{x:0,y:0,width:1000,height:500,fill:'var(--canvas)'});grid.append(background);
  for(let longitude=-180;longitude<=180;longitude+=30){const x=(longitude+180)/360*1000;grid.append(svg('line',{x1:x,y1:0,x2:x,y2:500,class:longitude===0?'geo-equator':''}));if(longitude<180){const t=svg('text',{x:x+3,y:496});t.textContent=longitude+'°';grid.append(t);}}
  for(let latitude=-90;latitude<=90;latitude+=30){const y=(90-latitude)/180*500;grid.append(svg('line',{x1:0,y1:y,x2:1000,y2:y,class:latitude===0?'geo-equator':''}));if(latitude<90){const t=svg('text',{x:4,y:y-4});t.textContent=latitude+'°';grid.append(t);}}
  const holder=$('geo-map-points');holder.replaceChildren();
  for(const row of points){
   const [x,y]=mapPosition(row),circle=svg('circle',{cx:x,cy:y,r:Math.max(.25,3.5*mapBox[2]/1000),tabindex:0,role:'button','aria-label':(row.location_name||row.title||row.activity_id)+', latitude '+row.latitude+', longitude '+row.longitude,'data-decision':row.finding?.decision||'','data-selected':!!record&&record.source===row.source&&record.row_id===row.row_id});
   const title=svg('title');title.textContent=(row.location_name||row.location_ref||row.activity_id)+' · '+sourceName(row.source)+' · '+row.latitude+', '+row.longitude;circle.append(title);
   const open=()=>{if(api.isBusy?.())return;action('Opening the map point’s original source record…',()=>openRecord(row.source,row.row_id));};
   circle.addEventListener('click',open);circle.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});holder.append(circle);
  }
  $('geo-map-count').textContent=pointPage?points.length+' / '+pointPage.total+' valid points':'No coordinate page loaded';
  $('geo-map-status').textContent=pointPage?(points.length?'Loaded '+points.length+' exact source points from revision '+pointPage.revision+'. '+(pointPage.nextOffset===null?'The full matching coordinate coverage is loaded.':'Load the next page to extend this view.'):'No valid coordinates in this matching coverage. Missing, invalid and unreported positions remain in the register.'):'Open a saved review to load its coordinate page.';
 }
 function setMapBox(x,y,width){
  const w=Math.min(1000,Math.max(2,width)),h=w/2;mapBox=[Math.max(0,Math.min(1000-w,x)),Math.max(0,Math.min(500-h,y)),w,h];renderMap();
 }
 function zoom(factor){const [x,y,w,h]=mapBox,nw=w*factor;setMapBox(x+(w-nw)/2,y+(h-nw/2)/2,nw);}
 function fitMap(){
  if(!points.length){mapBox=[0,0,1000,500];renderMap();return;}
  let left=1000,right=0,top=500,bottom=0;for(const row of points){const[x,y]=mapPosition(row);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const w=Math.max(20,(right-left)*1.15,(bottom-top)*2.3);
  setMapBox((left+right-w)/2,(top+bottom-w/2)/2,w);
 }
 function renderFindings(){
  clear($('geo-findings'),findings.length?'':'No analyst findings in the selected definition.');
  for(const row of findings){
   const card=document.createElement('article');card.className='geo-finding';const title=document.createElement('strong');title.textContent=label(row.decision)+' · '+row.reviewer;
   const identity=document.createElement('p');identity.className='identity';identity.textContent=row.source+'\n'+row.rowId;const note=document.createElement('p');note.textContent=row.note;
   card.append(title,identity,note);
   if(view&&latest()&&!pending){const remove=document.createElement('button');remove.type='button';remove.textContent='Remove from prepared revision';remove.onclick=()=>{findings=findings.filter(item=>item!==row);dirty=true;renderFindings();buttons();};card.append(remove);}
   $('geo-findings').append(card);
  }
 }
 async function saveInput(){
  if(view&&!latest())throw new Error('Open the latest saved review before preparing another revision.');
  const sources=selectedSources();if(!sources.length)throw new Error('Select at least one complete publisher activity source.');
  const name=$('geo-name').value.trim();if(!name)throw new Error('Name the geographic review.');
  if(findings.some(row=>!sources.includes(row.source)))throw new Error('A prepared finding still belongs to an unselected source. Keep that source or explicitly remove its finding before saving.');
  const portfolioId=$('geo-portfolio').value;
  const portfolio=portfolioId?{id:portfolioId,revision:Number($('geo-portfolio-revision').value)}:null;
  if(portfolio&&(!Number.isSafeInteger(portfolio.revision)||portfolio.revision<1))throw new Error('Select the explicit saved portfolio revision.');
  let activities=lines('geo-activity-ids');
  if(portfolio){
   const linked=await get('/api/iati/portfolio?'+new URLSearchParams({id:portfolio.id,revision:String(portfolio.revision)}));
   if(linked?.id!==portfolio.id||linked.revision!==portfolio.revision||!Array.isArray(linked.sources)||!Array.isArray(linked.selection?.activityIds??[]))throw new Error('The exact linked portfolio revision was not returned.');
   if(!same(sources,[...linked.sources].sort()))throw new Error('Select the linked portfolio’s exact source editions, or remove the portfolio link.');
   const wanted=[...(linked.selection?.activityIds||[])].sort(lexical);
   if(activities.length&&!same(activities,wanted))throw new Error('Use the linked portfolio’s exact activity selection, or remove the portfolio link.');
   activities=wanted;
  }
  const review={status:$('geo-review-status').value,reviewer:$('geo-reviewer').value.trim(),note:$('geo-review-note').value};
  if(review.status!=='draft'&&!review.reviewer)throw new Error('Name the reviewer for this decision.');
  return{requestId:crypto.randomUUID(),...(view?{id:view.id,expectedRevision:view.revision}:{}),name,notes:$('geo-notes').value,sources,selection:{activityIds:activities,language:$('geo-language').value.trim()},portfolio,acquisition:readAcquisition().sort((a,b)=>a.source.localeCompare(b.source)),review,baselineRevision:$('geo-baseline').value?Number($('geo-baseline').value):null,findings:clone(findings).sort((a,b)=>a.source===b.source?a.rowId.localeCompare(b.rowId):a.source.localeCompare(b.source))};
 }
 function checkedSave(result,input){
  if(!result||!hash(result.id)||!Number.isSafeInteger(result.revision)||result.revision!==(input.expectedRevision===undefined?1:input.expectedRevision+1)||input.id&&result.id!==input.id)throw new Error('The save response does not identify the original requested revision.');
  for(const key of ['name','notes','sources','selection','portfolio','acquisition','review','baselineRevision','findings'])if(!same(result[key],input[key]))throw new Error('The saved '+key+' differs from the original complete request. That request remains retained.');
  return result;
 }
 async function shaBlob(blob){const bytes=await blob.arrayBuffer();return[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
 async function performPending(){
  if(!pending)throw new Error('There is no retained geographic request.');
  const original=pending;let result=original.result;
  try{
   const context=await get(BASE+'/state');
   if(!hash(original.workspaceSha256)||context?.workspaceSha256!==original.workspaceSha256||workspaceKey!==original.workspaceSha256)throw new Error('This request belongs to another retained geographic workspace. Reopen that original workspace before continuing it.');
   catalogue=context;
   if(result===undefined){
    if(original.kind==='save'){
     const lookup=await get(BASE+'/requests/'+encodeURIComponent(original.input.requestId));
     const retained=pending?.localId===original.localId?pending:original;
     pending={...retained,requestLookups:[...(retained.requestLookups||[]),{returnedAt:new Date().toISOString(),result:lookup}]};
     await storePending('write',pending);
     if(lookup?.schema!=='stellar-forge.iati-geography-request.v1'||lookup.requestId!==original.input.requestId||lookup.workspaceSha256!==original.workspaceSha256||!['NOT_RECORDED','RECORDED'].includes(lookup.status))throw new Error('The original request lookup did not identify this exact geographic workspace and request. Its complete response remains retained.');
     if(lookup.status==='RECORDED'){
      if(!hash(lookup.requestSha256)||!same(lookup.request,original.input))throw new Error('That saved request ID names a different complete input. The original request and returned record remain retained without another save.');
      result=lookup.review;
     }else result=await post(BASE+'/reviews',original.input);
    }
    else{
     if(!(original.body instanceof Blob)||original.body.size!==original.bytes||await shaBlob(original.body)!==original.sha256)throw new Error('The original complete receiving file is not available unchanged.');
     result=await(await request(BASE+'/receive',{method:'POST',headers:{'content-type':'application/zip'},body:original.body})).json();
    }
    pending={...(pending?.localId===original.localId?pending:original),result,returnedAt:new Date().toISOString()};await storePending('write',pending);
   }
   if(original.kind==='save')checkedSave(result,original.input);
   else if(!result||!hash(result.review?.id)||!Number.isSafeInteger(result.review.revision)||!Array.isArray(result.history)||!Array.isArray(result.comparisons)||!Number.isSafeInteger(result.requests)||!Number.isSafeInteger(result.sourceCount)||result.packet?.sha256!==original.sha256||result.packet?.bytes!==original.bytes)throw new Error('The receiving result must identify the complete original packet, selected review and history.');
  }catch(error){
   pending={...(pending?.localId===original.localId?pending:original),failure:{message:error.message,status:error.status||null,details:error.details||null},rejected:result===undefined&&[400,413,415,422].includes(error.status)};
   await storePending('write',pending);drawPending();buttons();throw error;
  }
  await storePending('finish',pending);pending=null;
  await api.refreshWorkspace();
  if(original.kind==='save'){dirty=false;await openReview(result.id,result.revision);status('The complete geographic review is saved at revision '+result.revision+'.');}
  else{
   clear($('geo-receive-result'));details($('geo-receive-result'),'Complete native receiving result',result);
   await openReview(result.review.id,result.review.revision);showTab('handover');status('The complete geographic packet was received and its exact saved revision reopened.');
  }
  buttons();
 }
 async function save(){
  if(pending)throw new Error('Continue the original retained request first.');
  const input=await saveInput(),value={kind:'save',localId:input.requestId,input,workspaceSha256:workspaceKey,selectedAt:new Date().toISOString()};
  await storePending('write',value);pending=value;drawPending();await performPending();
 }
 async function exportFile(format){
  const selected=snapshot(),descriptor=await post(BASE+'/export',{...selected,format});
  if(!descriptor||!hash(descriptor.id)||!hash(descriptor.sha256)||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||typeof descriptor.filename!=='string'||descriptor.review!==selected.id||descriptor.revision!==selected.revision||descriptor.format!==format||!hash(descriptor.selectionSha256)||typeof descriptor.url!=='string')throw new Error('The complete native export descriptor must identify this exact review and revision.');
  const path=BASE+'/download/'+descriptor.id;
  const target=new URL(descriptor.url,location.origin);if(target.origin!==location.origin||target.pathname!==path||target.search||target.hash)throw new Error('The native export points outside the original artifact download route.');
  const response=await request(path),blob=await response.blob();
  if(blob.size!==descriptor.bytes||await shaBlob(blob)!==descriptor.sha256)throw new Error('The complete exported bytes do not match the selected native file.');
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=descriptor.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  clear($('geo-export-result'));properties($('geo-export-result'),{revision:selected.revision,filename:descriptor.filename,bytes:descriptor.bytes,sha256:descriptor.sha256});
  status('Complete '+format+' export verified and prepared for download from revision '+selected.revision+'.');
 }
 function renderComparison(value){
  if(!value||!hash(value.id)||value.review!==view?.id||!Array.isArray(value.comparisons))throw new Error('The native comparison must identify this complete saved review.');
  clear($('geo-comparison'));
  if(value.counts&&typeof value.counts==='object'){const holder=document.createElement('div');holder.className='metrics';$('geo-comparison').append(holder);metrics(holder,Object.entries(value.counts).map(([key,v])=>[label(key),v]));}
  properties($('geo-comparison'),{id:value.id,beforeRevision:value.beforeRevision,afterRevision:value.afterRevision});
  for(const pair of value.comparisons){
   if(!hash(pair.native?.id))throw new Error('The saved source pair has no original native comparison identity.');
   const card=document.createElement('article');card.className='geo-source-provenance';
   const title=document.createElement('h3');title.textContent=sourceName(pair.before)+' → '+sourceName(pair.after);
   const identity=document.createElement('p');identity.className='identity';identity.textContent=pair.before+'\n'+pair.after+'\nNative comparison '+pair.native.id;
   const data=document.createElement('div');data.textContent='Read the complete saved native change pages for this source pair.';
   const controls=document.createElement('div');controls.className='row';
   const before=document.createElement('button'),after=document.createElement('button'),pageText=document.createElement('span');before.type=after.type='button';before.textContent='Previous changes';after.textContent='Read changes';before.disabled=true;
   controls.append(before,after,pageText);card.append(title,identity,data,controls);$('geo-comparison').append(card);
   const previous=[];let current=0,nextOffset=0;const ticket=epoch;
   async function read(offset,direction){
    const selected=await get(BASE+'/comparisons/'+value.id+'/changes?'+new URLSearchParams({native:pair.native.id,offset:String(offset),limit:'50'}));
    if(ticket!==epoch||!card.isConnected)return;
    if(!selected||!Array.isArray(selected.rows)||selected.offset!==offset||selected.nextOffset!==null&&(!Number.isSafeInteger(selected.nextOffset)||selected.nextOffset<=offset))throw new Error('The saved native comparison page is incomplete.');
    if(direction==='next')previous.push(current);else if(direction==='previous')previous.pop();
    current=offset;nextOffset=selected.nextOffset;
    api.table(data,['kind','key','fields','before','after'],selected.rows);
    pageText.textContent='Changes '+(selected.rows.length?offset+1:0)+'–'+(offset+selected.rows.length)+(nextOffset===null?' · complete':'');
    before.disabled=!previous.length;after.disabled=nextOffset===null;after.textContent='Next changes';
   }
   before.onclick=()=>action('Reading the preceding native location changes…',()=>read(previous[previous.length-1],'previous'));
   after.onclick=()=>action('Reading the saved native location changes…',()=>read(nextOffset,after.textContent==='Read changes'?'first':'next'));
  }
  details($('geo-comparison'),'Complete saved geographic comparison and analyst changes',value);
 }
 const submit=(id,message,fn)=>$(id).addEventListener('submit',event=>{event.preventDefault();action(message,fn);});
 document.querySelectorAll('[data-geo-tab]').forEach(button=>button.onclick=()=>showTab(button.dataset.geoTab));
 $('geo-open-view').addEventListener('click',()=>action('Opening saved publisher geography…',refresh));
 $('geo-refresh').onclick=()=>action('Refreshing the original geographic workspace…',refresh);
 $('geo-open').onclick=()=>action('Opening the exact geographic review…',()=>openReview($('geo-review-select').value,$('geo-open-revision').value?Number($('geo-open-revision').value):undefined));
 $('geo-review-select').onchange=()=>{$('geo-open-revision').value='';buttons();};
 $('geo-new').onclick=()=>{if(pending)return;historyRows=[];form();renderHistory();showTab('selection');status('Select the complete source editions for a new geographic review.');};
 $('geo-to-sources').onclick=()=>api.show('sources');
 $('geo-form').addEventListener('input',()=>{dirty=true;buttons();});
 $('geo-portfolio').onchange=()=>{$('geo-portfolio-revision').value='';dirty=true;buttons();};
 submit('geo-form','Saving the complete geographic review…',save);
 $('geo-save-findings').onclick=()=>action('Saving the complete source selection and analyst findings…',save);
 submit('geo-filter-form','Reading the selected native location records and points…',async()=>{activeFilters=filterInput();epoch++;record=null;clear($('geo-detail'),'Open a register row or a map point.');await readRows(0);await readPoints(true);});
 $('geo-clear-filters').onclick=()=>action('Reading the complete saved location coverage…',async()=>{clearFilters();epoch++;await readRows(0);await readPoints(true);});
 $('geo-rows-prev').onclick=()=>action('Reading the preceding location page…',()=>readRows(rowPageStarts[rowPageStarts.length-1],'previous'));
 $('geo-rows-next').onclick=()=>action('Reading the next location page…',()=>readRows(page.nextOffset,'next'));
 $('geo-more-points').onclick=()=>action('Reading the next exact coordinate page…',()=>readPoints(false));
 $('geo-zoom-in').onclick=()=>zoom(.5);$('geo-zoom-out').onclick=()=>zoom(2);$('geo-map-reset').onclick=()=>{mapBox=[0,0,1000,500];renderMap();};$('geo-map-fit').onclick=fitMap;
 for(const [id,dx,dy]of [['geo-pan-left',-.25,0],['geo-pan-right',.25,0],['geo-pan-up',0,-.25],['geo-pan-down',0,.25]])$(id).onclick=()=>setMapBox(mapBox[0]+dx*mapBox[2],mapBox[1]+dy*mapBox[3],mapBox[2]);
 submit('geo-finding-form','Preparing an exact source-location finding…',async()=>{
  if(!view||!latest()||!record)throw new Error('Open an original record in the latest saved review.');
  if(pending)throw new Error('Continue the retained request before preparing another finding.');
  const reviewer=$('geo-finding-reviewer').value.trim(),note=$('geo-finding-note').value;if(!reviewer||!note.trim())throw new Error('Name the reviewer and record the finding note.');
  const item={source:record.source,rowId:record.row_id,decision:$('geo-finding-decision').value,reviewer,note};
  const at=findings.findIndex(row=>row.source===item.source&&row.rowId===item.rowId);if(at<0)findings.push(item);else findings[at]=item;
  dirty=true;renderFindings();buttons();status('The finding is prepared locally. Save the complete review revision to retain it.');
 });
 submit('geo-compare-form','Comparing complete saved geographic editions…',async()=>{
  const selected=snapshot(),beforeRevision=Number($('geo-compare-before').value),afterRevision=Number($('geo-compare-after').value);
  if(!Number.isSafeInteger(beforeRevision)||beforeRevision<1||!Number.isSafeInteger(afterRevision)||afterRevision<1)throw new Error('Choose two saved revisions.');
  const input={id:selected.id,beforeRevision,afterRevision};if($('geo-compare-pairs').value.trim())input.pairs=JSON.parse($('geo-compare-pairs').value);
  renderComparison(await post(BASE+'/compare',input));status('The complete native comparison retains both source selections and original location differences.');
 });
 document.querySelectorAll('[data-geo-export]').forEach(button=>button.onclick=()=>action('Preparing and verifying the complete geographic '+button.dataset.geoExport+'…',()=>exportFile(button.dataset.geoExport)));
 submit('geo-receive-form','Receiving the complete geographic review packet…',async()=>{
  if(pending)throw new Error('Continue the retained request first.');
  const file=$('geo-receive-file').files[0];if(!file||file.size<1)throw new Error('Choose the complete original geographic packet.');
  const value={kind:'receive',localId:crypto.randomUUID(),workspaceSha256:workspaceKey,body:file,fileName:file.name,bytes:file.size,sha256:await shaBlob(file),selectedAt:new Date().toISOString()};
  await storePending('write',value);pending=value;drawPending();await performPending();
 });
 $('geo-retry').onclick=()=>action('Continuing the same complete geographic request…',performPending);
 $('geo-revise-rejected').onclick=()=>action('Retaining the original rejected request…',async()=>{
  if(!pending?.rejected)throw new Error('The original uncertain request must be continued unchanged.');
  const original=pending;await storePending('finish',{...original,disposition:'definitive-validation-rejection-retained'});pending=null;
  await refresh();buttons();status('The complete rejected request remains retained. Correct the selection or file and submit a new request.');
 });
 showTab(tabName);buttons();
 return{refresh,buttons,openReview,async newFromSource(id){if(pending)throw new Error('Continue the retained request first.');await refresh();if(pending)throw new Error('Continue the retained request in this workspace first.');historyRows=[];form();sourceChoices([id]);renderAcquisition();showTab('selection');}};
};
