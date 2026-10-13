// MIT — Complete original catalogue comparison in the existing Rialto customer editor.
import {SCHEMA,need,canonical,compare,resourceKey,object} from './core.mjs';

export function inspectReviewCatalogue(value){
 need(value&&value.schema===SCHEMA&&value.plan&&Array.isArray(value.rows),'Select a complete original Rialto catalogue JSON');
 need(typeof value.enumerationComplete==='boolean'&&Number.isSafeInteger(value.pageCount)&&value.pageCount>=0,'Original enumeration and page count required');
 need(Array.isArray(value.findings)&&Array.isArray(value.sourceTotals),'Original coverage findings and totals required');
 for(let i=0;i<value.rows.length;i++){
  const r=value.rows[i];need(r&&r.index===i&&Number.isSafeInteger(r.page)&&r.page>=0&&r.page<value.pageCount&&Number.isSafeInteger(r.pageRow)&&r.pageRow>=0,'Retain every original ordered catalogue row and page position');
  need(r.key===resourceKey(r.original),'Original catalogue resource identity changed');
 }
 return value;
}
export async function readReviewSource(filename,utf8,digest){
 need(typeof filename==='string'&&filename.length<=1024&&typeof utf8==='string','Complete original source filename and UTF-8 text required');
 const bytes=new TextEncoder().encode(utf8);need(bytes.length<=64*1024*1024,'A complete catalogue may contain up to 64 MiB');
 const catalogue=inspectReviewCatalogue(JSON.parse(utf8));
 return{filename,utf8,bytes:bytes.length,sha256:await digest(bytes),catalogue};
}
export function compareReviewSources(before,after){
 const result=compare(inspectReviewCatalogue(before.catalogue),inspectReviewCatalogue(after.catalogue));
 return{...result,beforeSha256:before.sha256,afterSha256:after.sha256};
}

export const comparisonMarkup='<section id="catalogue-comparison"><h2>Catalogue changes and customer handover</h2><p>Receive an earlier complete catalogue and compare it with this edition. Every original row and payment option remains available. Presence in an edition describes the captured source; review its scope, coverage and duplicate identities before interpreting a service change.</p><div class="bar"><label>Earlier complete catalogue<input id="comparison-source" type="file" accept=".json,application/json"></label><label>Complete saved comparison<input id="comparison-receive" type="file" accept=".json,application/json"></label><button id="comparison-reset">Start a new comparison with this catalogue</button></div><p id="comparison-message" role="status"></p><div class="bar"><label>Earlier saved comparisons<select id="comparison-history" aria-label="Earlier saved complete comparison"></select></label><button id="comparison-history-open">Reopen selected comparison</button><button id="comparison-history-save">Download selected complete comparison</button></div><div id="comparison-body" hidden><div class="grid"><div><h3>Before source</h3><pre id="comparison-before"></pre><button id="comparison-download-before">Download complete before source</button></div><div><h3>After source</h3><pre id="comparison-after"></pre><button id="comparison-download-after">Download complete after source</button></div></div><p id="comparison-coverage"></p><details><summary>Complete source plans and coverage findings</summary><pre id="comparison-source-details"></pre></details><div class="bar"><label>Observed change<select id="comparison-status"><option value="">All original identities</option><option value="changed">Changed original content</option><option value="added">Only in after edition</option><option value="removed">Only in before edition</option><option value="unchanged">Unchanged original content</option></select></label><label>Resource type<select id="comparison-type"><option value="">All types</option><option value="http">HTTP</option><option value="mcp">MCP</option></select></label><input type="search" id="comparison-search" placeholder="Search original resource, terms or content" aria-label="Search complete catalogue comparison"><label><input type="checkbox" id="comparison-duplicates"> Repeated identities only</label></div><p id="comparison-counts"></p><div class="scroll"><table><thead><tr><th>Observed change</th><th>Original identity</th><th>Before / after rows</th><th>Changed top-level fields</th><th>Review</th></tr></thead><tbody id="comparison-rows"></tbody></table></div><div class="bar"><button id="comparison-previous">Previous</button><span id="comparison-page"></span><button id="comparison-next">Next</button></div><section id="comparison-detail" hidden><h3 id="comparison-detail-title"></h3><p id="comparison-detail-context"></p><div class="grid"><div><h4>Complete before rows and payment options</h4><pre id="comparison-detail-before"></pre></div><div><h4>Complete after rows and payment options</h4><pre id="comparison-detail-after"></pre></div></div><div class="bar"><select id="comparison-native-row" aria-label="Exact current original row"></select><button id="comparison-open-request">Review this current row in the request editor</button></div><label>Review note for this original identity<textarea id="comparison-row-note"></textarea></label></section><label>Complete comparison and handover note<textarea id="comparison-note"></textarea></label><div class="bar"><button id="comparison-save">Download complete comparison</button><button id="comparison-html">Download complete receiving report</button><button id="comparison-print">Print current comparison view</button></div><p id="comparison-storage" class="subtle"></p><div id="comparison-print-full" class="comparison-print-only"></div><details><summary>Carried original request drafts</summary><p>Carried drafts remain separate from the current editor. Restore one explicitly when it belongs to this exact catalogue and original row. The current draft remains retained in the comparison.</p><select id="comparison-drafts" aria-label="Carried complete request draft"></select><button id="comparison-restore-draft">Restore selected carried request draft</button><pre id="comparison-draft-detail"></pre></details></div></section>';

export function comparisonBrowserSource(){
 const engine='(()=>{const SCHEMA='+JSON.stringify(SCHEMA)+';const need=('+need.toString()+');const canonical=('+canonical.toString()+');const object=('+object.toString()+');const resourceKey=('+resourceKey.toString()+');const compare=('+compare.toString()+');const inspectReviewCatalogue=('+inspectReviewCatalogue.toString()+');const readReviewSource=('+readReviewSource.toString()+');const compareReviewSources=('+compareReviewSources.toString()+');return {readReviewSource,compareReviewSources,canonical};})()';
 return '('+mountCatalogueComparison.toString()+')({catalogue,hash,getDraft:()=>state.selected?{catalogueSha256:hash,rowIndex:state.selected.index,resourceKey:state.selected.key,values:current()}:null,openCurrent:entry=>{if(state.selected?.index===entry.index&&state.selected?.key===entry.key){$("selection").hidden=false;$("selection").scrollIntoView({behavior:"smooth"});return;}draft();open(entry);},restoreDraft:item=>{const entry=catalogue.rows[item.rowIndex];open(entry);for(const k of ["url","method","intent","task","output","cap","body","headers","offer"])if(typeof item.values[k]==="string")$(k).value=item.values[k];showPath(entry,item.values.pathValues??{});draft();},download},'+engine+');';
}
function mountCatalogueComparison(host,engine){
 const $=id=>document.getElementById(id),schema='stellar-forge.rialto-catalogue-review.v1',limit=192*1024*1024;
 const s={before:null,after:null,result:null,selectedKey:null,page:0,printing:false,notes:{},note:'',drafts:[],generation:0,saveQueue:Promise.resolve(),history:[],historyPackets:new Map()};
 const labels={added:'Only in after edition',removed:'Only in before edition',changed:'Changed original content',unchanged:'Unchanged original content'};
 const copy=value=>JSON.parse(JSON.stringify(value));
 const sha=async bytes=>{if(!globalThis.crypto?.subtle)throw Error('This browser needs Web Crypto to receive exact original source. Open the report in a current browser.');return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');};
 const message=(text,error=false)=>{$('comparison-message').textContent=text;$('comparison-message').classList.toggle('message',error);};
 const view=()=>({status:$('comparison-status').value,type:$('comparison-type').value,search:$('comparison-search').value,duplicates:$('comparison-duplicates').checked,page:s.page,selectedKey:s.selectedKey,note:$('comparison-note').value,notes:copy(s.notes)});
 function drafts(){
  const found=s.drafts.map(copy),current=host.getDraft();
  if(current&&!found.some(x=>engine.canonical(x)===engine.canonical(current)))found.push(copy(current));
  return found;
 }
 const source=value=>({filename:value.filename,utf8:value.utf8,bytes:value.bytes,sha256:value.sha256});
 function packet(){if(!s.before||!s.after)throw Error('Receive a complete earlier catalogue first');return{schema,before:source(s.before),after:source(s.after),view:view(),requestDrafts:drafts()};}
 async function database(){
  return new Promise((resolve,reject)=>{const r=indexedDB.open('rialto-catalogue-review',1);r.onupgradeneeded=()=>r.result.createObjectStore('views');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 }
 async function dbAction(mode,value){
  const db=await database();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('views',mode),table=tx.objectStore('views'),r=mode==='readonly'?table.get(host.hash):value===null?table.delete(host.hash):table.put(value,host.hash);let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Browser storage transaction interrupted'));});}finally{db.close();}
 }
 function persist(){
  if(!s.result)return;const saved=packet();
  s.saveQueue=s.saveQueue.catch(()=>{}).then(()=>dbAction('readwrite',saved)).then(()=>{$('comparison-storage').textContent='Complete sources, notes and request drafts saved in this browser. Download the complete comparison or receiving report for another browser.';}).catch(()=>{$('comparison-storage').textContent='Browser storage is unavailable or full. Download the complete comparison to retain both sources, notes and request drafts.';});
 }
 async function historyAction(action,value){
  const db=await database(),index='history-index:'+host.hash,key='history:'+host.hash+':';
  try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction('views',action==='save'?'readwrite':'readonly'),table=tx.objectStore('views');
   let result;const r=table.get(action==='read'?key+value:index);
   r.onsuccess=()=>{result=r.result;if(action==='save'){const entries=Array.isArray(result)?result:[];table.put(value.packet,key+value.header.id);result=[value.header,...entries.filter(x=>x.id!==value.header.id)];table.put(result,index);}};
   tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Comparison history storage interrupted'));
  });}finally{db.close();}
 }
 function historyList(){
  const prior=$('comparison-history').value;$('comparison-history').replaceChildren();
  for(const item of s.history){const o=document.createElement('option');o.value=item.id;o.textContent=item.savedAt+' · '+item.before+' → '+item.after+(s.historyPackets.has(item.id)?'':' · saved');$('comparison-history').append(o);}
  if(s.history.some(x=>x.id===prior))$('comparison-history').value=prior;
  $('comparison-history-open').disabled=!s.history.length;$('comparison-history-save').disabled=!s.history.length;
 }
 async function archivePacket(saved){
  const header={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),savedAt:new Date().toISOString(),before:saved.before?.filename??'Before source',after:saved.after?.filename??'After source'};
  s.historyPackets.set(header.id,saved);s.history.unshift(header);historyList();
  try{await historyAction('save',{header,packet:saved});}
  catch{message('Earlier complete comparison retained in this open report. Browser storage is unavailable or full; use Earlier saved comparisons to download it.',true);}
 }
 async function archiveCurrent(){if(s.result)await archivePacket(packet());}
 async function historyPacket(id){
  const value=s.historyPackets.get(id)??await historyAction('read',id);if(!value)throw Error('This saved comparison is unavailable. Receive its downloaded complete comparison JSON.');return value;
 }
 async function verified(item){
  if(!item||typeof item.utf8!=='string'||!Number.isSafeInteger(item.bytes)||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('Receive every complete original catalogue source and identity');
  const parsed=await engine.readReviewSource(item.filename,item.utf8,sha);
  if(parsed.bytes!==item.bytes||parsed.sha256!==item.sha256)throw Error('Original catalogue bytes or SHA-256 changed: '+item.filename);
  return parsed;
 }
 function validateDrafts(items){
  if(!Array.isArray(items))throw Error('The complete saved request drafts are required');
  for(const x of items)if(!x||!/^[a-f0-9]{64}$/.test(x.catalogueSha256)||!Number.isSafeInteger(x.rowIndex)||x.rowIndex<0||typeof x.resourceKey!=='string'||!x.values||Array.isArray(x.values)||typeof x.values!=='object')throw Error('A carried request draft has an invalid original identity');
  return items.map(copy);
 }
 async function receive(value,{save=true,generation=s.generation}={}){
  if(!value||value.schema!==schema)throw Error('Select the full Rialto catalogue review JSON');
  const before=await verified(value.before),after=await verified(value.after),carried=validateDrafts(value.requestDrafts??[]);
  const result=engine.compareReviewSources(before,after);
  const incomingView=value.view??{},incomingNotes=incomingView.notes&&typeof incomingView.notes==='object'&&!Array.isArray(incomingView.notes)?copy(incomingView.notes):{};
  for(const x of Object.values(incomingNotes))if(typeof x!=='string')throw Error('Review notes must retain their complete text');
  if(generation!==s.generation)return;
  if(save)await archiveCurrent();if(generation!==s.generation)return;
  const existing=drafts();s.before=before;s.after=after;s.result=result;s.drafts=carried;
  for(const x of existing)if(!s.drafts.some(y=>engine.canonical(x)===engine.canonical(y)))s.drafts.push(x);
  const v=incomingView;s.notes=incomingNotes;
  s.note=typeof v.note==='string'?v.note:'';s.selectedKey=typeof v.selectedKey==='string'?v.selectedKey:null;s.page=Number.isSafeInteger(v.page)&&v.page>=0?v.page:0;
  $('comparison-status').value=['','added','removed','changed','unchanged'].includes(v.status)?v.status:'';
  $('comparison-type').value=['','http','mcp'].includes(v.type)?v.type:'';
  $('comparison-search').value=typeof v.search==='string'?v.search:'';
  $('comparison-duplicates').checked=v.duplicates===true;$('comparison-note').value=s.note;
  render();if(save)persist();
 }
 async function readFile(file){if(!file)throw Error('Choose a complete original file');if(file.size>limit)throw Error('The complete receiving file exceeds 192 MiB');return new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}
 function subset(){
  const q=$('comparison-search').value.toLowerCase(),status=$('comparison-status').value,type=$('comparison-type').value,duplicates=$('comparison-duplicates').checked;
  return s.result.rows.filter(r=>(!status||r.state===status)&&(!duplicates||r.before.length>1||r.after.length>1)&&(!type||[...r.before,...r.after].some(x=>(x.type??'http')===type))&&(!q||JSON.stringify(r).toLowerCase().includes(q)));
 }
 function td(value){const x=document.createElement('td');x.textContent=String(value??'');return x;}
 function describe(value){
  const c=value.catalogue;
  return value.filename+'\nSHA-256: '+value.sha256+'\n'+value.bytes+' UTF-8 bytes · '+c.rows.length+' original rows · '+c.pageCount+' pages\nObserved '+(c.firstObservedAt??'unknown')+' through '+(c.lastObservedAt??'unknown')+'\nEnumeration complete: '+c.enumerationComplete;
 }
 function render(){
  $('comparison-body').hidden=!s.result;if(!s.result)return;
  $('comparison-before').textContent=describe(s.before);$('comparison-after').textContent=describe(s.after);
  const duplicates=s.result.rows.filter(r=>r.before.length>1||r.after.length>1).length;
  $('comparison-coverage').textContent=(s.result.sameScope?'The complete source plans match. ':'The source plans differ; compare their exact filters and acquisition choices. ')+(s.result.beforeComplete&&s.result.afterComplete?'Both editions reached their reported enumeration end. ':'At least one edition did not reach its reported end. ')+duplicates+' repeated resource identities retain every original occurrence. Offset pages have an observation interval and no provider snapshot token.';
  $('comparison-source-details').textContent=JSON.stringify({before:{plan:s.before.catalogue.plan,sourceTotals:s.before.catalogue.sourceTotals,findings:s.before.catalogue.findings,coverage:s.before.catalogue.coverage},after:{plan:s.after.catalogue.plan,sourceTotals:s.after.catalogue.sourceTotals,findings:s.after.catalogue.findings,coverage:s.after.catalogue.coverage}},null,2);
  const all=subset(),last=Math.max(0,Math.ceil(all.length/50)-1);s.page=Math.min(s.page,last);
  $('comparison-counts').textContent=all.length+' of '+s.result.rows.length+' original identities shown · '+Object.entries(s.result.counts).map(([k,v])=>labels[k]+': '+v).join(' · ');
  $('comparison-page').textContent=(s.page+1)+' / '+(last+1);$('comparison-previous').disabled=s.page===0;$('comparison-next').disabled=s.page===last;
  $('comparison-rows').replaceChildren();
  for(const r of s.printing?all:all.slice(s.page*50,s.page*50+50)){
   const tr=document.createElement('tr'),lastCell=td(''),b=document.createElement('button');b.textContent='Review full original rows';b.onclick=()=>{s.selectedKey=r.key;detail();persist();$('comparison-detail').scrollIntoView({behavior:'smooth'});};
   lastCell.append(b);tr.append(td(labels[r.state]),td(r.key),td(r.before.length+' / '+r.after.length),td(r.changedFields.length?r.changedFields.join(', '):r.before.length>1||r.after.length>1?'Compare the complete repeated rows in their original order':''),lastCell);$('comparison-rows').append(tr);
  }
  detail();renderDrafts();
 }
 function detail(){
  const r=s.result?.rows.find(x=>x.key===s.selectedKey);$('comparison-detail').hidden=!r;if(!r)return;
  $('comparison-detail-title').textContent=r.key;$('comparison-detail-context').textContent=labels[r.state]+'. Every original payment option, source field and duplicate occurrence is retained below.';
  $('comparison-detail-before').textContent=JSON.stringify(r.before,null,2);$('comparison-detail-after').textContent=JSON.stringify(r.after,null,2);$('comparison-row-note').value=s.notes[r.key]??'';
  $('comparison-native-row').replaceChildren();
  const native=s.after.sha256===host.hash?host.catalogue.rows.filter(x=>x.key===r.key):[];
  for(const row of native){const o=document.createElement('option');o.value=row.index;o.textContent='Current original row '+row.index+' · page '+row.page+' / row '+row.pageRow;$('comparison-native-row').append(o);}
  $('comparison-open-request').disabled=!native.length;$('comparison-native-row').disabled=!native.length;
  if(!native.length){const o=document.createElement('option');o.textContent=s.after.sha256!==host.hash?'This received comparison belongs to another report edition':'No after row exists in this edition';$('comparison-native-row').append(o);}
 }
 function renderDrafts(){
  const values=drafts(),prior=$('comparison-drafts').value;$('comparison-drafts').replaceChildren();
  values.forEach((item,i)=>{const o=document.createElement('option');o.value=i;o.textContent=(item.values.intent||'Unfinished request')+' · row '+item.rowIndex+' · '+item.catalogueSha256.slice(0,12);$('comparison-drafts').append(o);});
  if(values[Number(prior)])$('comparison-drafts').value=prior;
  const picked=values[Number($('comparison-drafts').value)],row=picked?host.catalogue.rows[picked.rowIndex]:null;
  $('comparison-restore-draft').disabled=!picked||picked.catalogueSha256!==host.hash||row?.key!==picked.resourceKey;
  $('comparison-draft-detail').textContent=picked?JSON.stringify(picked,null,2):'No carried request draft.';
 }
 $('comparison-source').onchange=async event=>{
  const generation=++s.generation;try{const file=event.target.files[0],text=await readFile(file),before=await engine.readReviewSource(file.name,text,sha),after=await engine.readReviewSource('rialto-catalogue.json',JSON.stringify(host.catalogue,null,2)+'\n',sha);if(after.sha256!==host.hash)throw Error('The embedded current catalogue differs from its original source hash');if(generation!==s.generation)return;
   await receive({schema,before:source(before),after:source(after),view:{},requestDrafts:drafts()},{generation});message('Both complete original editions received. Review scope, coverage, changed rows and exact payment terms.');
  }catch(error){if(generation===s.generation)message(error.message,true);}finally{event.target.value='';}
 };
 $('comparison-receive').onchange=async event=>{const generation=++s.generation;try{const value=JSON.parse(await readFile(event.target.files[0]));await receive(value,{generation});if(generation===s.generation)message('Complete saved comparison received. The current request editor remains on its original draft.');}catch(error){if(generation===s.generation)message(error.message,true);}finally{event.target.value='';}};
 $('comparison-reset').onclick=async()=>{
  const generation=++s.generation;await archiveCurrent();if(generation!==s.generation)return;
  s.before=null;s.after=null;s.result=null;s.selectedKey=null;s.notes={};s.note='';s.drafts=drafts();$('comparison-body').hidden=true;
  s.saveQueue=s.saveQueue.catch(()=>{}).then(()=>dbAction('readwrite',null)).catch(()=>{});message('Choose an earlier complete catalogue. The previous complete comparison is available under Earlier saved comparisons; the current request draft remains in its editor.');
 };
 $('comparison-history-open').onclick=async()=>{
  const id=$('comparison-history').value,generation=++s.generation;try{const saved=await historyPacket(id);await receive(saved,{generation});if(generation===s.generation)message('Earlier complete comparison reopened. The view it replaced remains in Earlier saved comparisons.');}catch(error){if(generation===s.generation)message(error.message,true);}
 };
 $('comparison-history-save').onclick=async()=>{try{const saved=await historyPacket($('comparison-history').value);host.download('rialto-complete-comparison.json',JSON.stringify(saved,null,2)+'\n');message('Selected earlier comparison downloaded with both exact sources, notes and original request drafts.');}catch(error){message(error.message,true);}};
 historyList();
 (async()=>{try{const items=await historyAction('list');for(const item of Array.isArray(items)?items:[])if(!s.history.some(x=>x.id===item.id))s.history.push(item);historyList();}catch{}})();
 for(const id of ['comparison-status','comparison-type','comparison-search','comparison-duplicates'])$(id).addEventListener(id==='comparison-search'?'input':'change',()=>{s.page=0;render();persist();});
 $('comparison-previous').onclick=()=>{s.page--;render();persist();};$('comparison-next').onclick=()=>{s.page++;render();persist();};
 $('comparison-note').oninput=persist;$('comparison-row-note').oninput=()=>{if(s.selectedKey){s.notes[s.selectedKey]=$('comparison-row-note').value;persist();}};
 $('comparison-open-request').onclick=()=>{const row=host.catalogue.rows[Number($('comparison-native-row').value)];if(s.after?.sha256===host.hash&&row?.key===s.selectedKey){s.drafts=drafts();host.openCurrent(row);persist();}};
 $('comparison-drafts').onchange=renderDrafts;
 $('comparison-restore-draft').onclick=()=>{const selected=drafts()[Number($('comparison-drafts').value)],row=selected?host.catalogue.rows[selected.rowIndex]:null;if(!selected||selected.catalogueSha256!==host.hash||row?.key!==selected.resourceKey)return;s.drafts=drafts();host.restoreDraft(copy(selected));renderDrafts();persist();message('Selected original request draft restored. The earlier editor draft remains carried in this comparison.');};
 for(const side of ['before','after'])$('comparison-download-'+side).onclick=()=>{if(s[side])host.download(s[side].filename,s[side].utf8);};
 $('comparison-save').onclick=()=>{try{host.download('rialto-complete-comparison.json',JSON.stringify(packet(),null,2)+'\n');persist();message('Complete sources, notes, view and original request drafts downloaded.');}catch(error){message(error.message,true);}};
 $('comparison-html').onclick=()=>{
  try{
   const value=packet(),clone=document.documentElement.cloneNode(true);clone.querySelector('#comparison-receiving')?.remove();
   const script=document.createElement('script');script.id='comparison-receiving';script.type='application/json';script.textContent=JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
   clone.querySelector('head').append(script);for(const id of ['rows','comparison-rows'])clone.querySelector('#'+id)?.replaceChildren();
   host.download('rialto-complete-comparison.html','<!doctype html>\n'+clone.outerHTML,'text/html;charset=utf-8');persist();message('Complete offline receiving report downloaded with both exact sources and carried request drafts.');
  }catch(error){message(error.message,true);}
 };
 $('comparison-print').onclick=()=>window.print();
 addEventListener('beforeprint',()=>{
  s.printing=true;render();const full=$('comparison-print-full');full.replaceChildren();if(!s.result)return;
  const heading=document.createElement('h2');heading.textContent='Complete filtered source comparison';full.append(heading);
  const note=document.createElement('pre');note.textContent=$('comparison-note').value;full.append(note);
  const coverage=document.createElement('pre');coverage.textContent=$('comparison-source-details').textContent;full.append(coverage);
  for(const r of subset()){
   const section=document.createElement('section'),h=document.createElement('h3'),pre=document.createElement('pre'),review=document.createElement('p');h.textContent=labels[r.state]+' · '+r.key;review.textContent=s.notes[r.key]??'';
   pre.textContent=JSON.stringify({before:r.before,after:r.after},null,2);section.append(h,review,pre);full.append(section);
  }
 });
 addEventListener('afterprint',()=>{s.printing=false;$('comparison-print-full').replaceChildren();render();});
 (async()=>{const generation=s.generation;try{const embedded=$('comparison-receiving');let stored=null;try{stored=await dbAction('readonly');}catch(error){if(!embedded)throw error;}const saved=embedded?JSON.parse(embedded.textContent):stored;if(saved&&generation===s.generation){if(embedded&&stored)await archivePacket(stored);await receive(saved,{save:false,generation});message(embedded?'Complete carried comparison reopened. Restore a carried request draft explicitly when required.':'Complete comparison reopened from this browser.');}}catch(error){message('Saved comparison could not be opened: '+error.message+'. Receive its complete original JSON to continue.',true);}})();
}
