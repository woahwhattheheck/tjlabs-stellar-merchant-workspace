// MIT. Customer returns and explicit producer reconciliation in the original Research workspace.
import {createResearchReturnWork,RETURN_WORK_SCHEMA,MAX_RETURN_WORK_BYTES} from './research-return-work.mjs';
const MAX_RETURN=256*1024*1024,MAX_WORK=MAX_RETURN_WORK_BYTES,HASH=/^[a-f0-9]{64}$/;
const clone=x=>structuredClone(x),plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const stable=x=>Array.isArray(x)?'['+x.map(stable).join(',')+']':plain(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x);
const need=(v,m)=>{if(!v)throw new Error(m);};
const element=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const downloadJSON=(value,name)=>{const blob=new Blob([JSON.stringify(value)+'\n'],{type:'application/json'});need(blob.size<=MAX_WORK,'This complete export exceeds 512 MiB. Download each retained draft or original request as its own reopenable companion; all originals remain stored.');const url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
const fileDataURL=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(r.error||new Error('The complete selected file could not be read.'));r.onabort=()=>reject(new Error('The original file read stopped.'));r.onload=()=>resolve(String(r.result));r.readAsDataURL(file);});
function tabIdentity(){try{let id=sessionStorage.getItem('fred-research-return-tab');if(!/^[a-f0-9]{32}$/.test(id??'')){id=crypto.randomUUID().replaceAll('-','');sessionStorage.setItem('fred-research-return-tab',id);}return id;}catch{return crypto.randomUUID().replaceAll('-','');}}
export function mountFredResearchReturns({root,api,download,getState,getBusy,refresh,message,onOpenProduct}){
 const host=element('section');host.id='research-returns';host.innerHTML=
 '<h2>Customer returns and author review</h2><p>Return the following product from its original received package. On the author’s project, compare issued, current and returned fields, preserve later work and explicitly save a following product definition. Issuing and publishing remain separate actions.</p>'+
 '<p id="rr-status" role="status"></p><div class="rr-actions"><button id="rr-refresh">Refresh returns</button><button id="rr-export-work">Download complete browser work</button><label>Open browser work<input id="rr-work-file" type="file" accept=".json"></label><button id="rr-import-work">Receive browser work</button></div>'+
 '<details open><summary>Customer: create a complete return</summary><p>Choose an original received package, then edit and save its research product above before creating the return. The return includes the exact issued baseline, following product and its complete selected source history.</p><form id="rr-create" class="rr-grid"><label>Original received package<select id="rr-package" required></select></label><label>Customer reviewer<input id="rr-author" required maxlength="200"></label><label class="rr-wide">Return note<textarea id="rr-create-note" rows="3" maxlength="12000"></textarea></label><button>Create retained customer return</button></form></details>'+
 '<details open><summary>Author: receive a customer return</summary><form id="rr-import"><label>Complete customer return gzip<input id="rr-return-file" type="file" required accept=".gz,application/gzip,application/octet-stream"></label><p>Capacity: 256 MiB compressed. The original full file and request are retained before the native import starts.</p><button>Import selected complete return</button></form></details>'+
 '<section><h3>Retained return inventory</h3><label>Inventory<select id="rr-section"><option value="received">Received returns</option><option value="sent">Sent returns</option><option value="drafts">Saved review drafts</option><option value="adoptions">Applied product definitions</option></select></label><div id="rr-inventory"></div><div class="rr-actions"><button id="rr-prev">Previous</button><span id="rr-page"></span><button id="rr-next">Next</button></div></section>'+
 '<section><h3>Selected return and complete originals</h3><p id="rr-selection">Open a retained return.</p><div id="rr-files"></div><details><summary>Complete selected product and source graph</summary><pre id="rr-detail"></pre></details></section>'+
 '<section><h3>Issued, current and returned comparison</h3><p id="rr-comparison-status"></p><div class="rr-actions"><button id="rr-compare">Read current comparison</button><button id="rr-rebase">Preserve work and start current comparison</button><button id="rr-all-current">Choose current for every field</button></div><label>Field<select id="rr-field"></select></label><div id="rr-alternatives"></div><button id="rr-undecided">Leave selected field undecided</button>'+
 '<label>Requirement order, one original requirement ID per line<textarea id="rr-order" rows="5" spellcheck="false"></textarea></label><button id="rr-order-selected">Use selected requirements in displayed order</button><p>Apply needs exactly every non-null selected requirement, once, in the intended order. A saved draft may remain incomplete.</p>'+
 '<div class="rr-grid"><label>Review label<input id="rr-label" maxlength="200"></label><label class="rr-wide">Review note<textarea id="rr-note" rows="4"></textarea></label></div><div class="rr-actions"><button id="rr-save">Save unfinished native review draft</button><button id="rr-preview">Preview complete merged product and coverage</button><button id="rr-apply">Save explicit choices as following product</button><button id="rr-open-product">Open following product for original Issue action</button></div>'+
 '<p>Saving the following definition retains all existing source, capture, review and product history. It does not issue an edition or change payment/publication custody.</p><details open><summary>Actual merged preview and source coverage</summary><pre id="rr-preview-result"></pre></details><details><summary>Full frozen comparison behind this working draft</summary><pre id="rr-compared"></pre></details></section>'+
 '<section><h3>Saved native review editions</h3><div id="rr-native-history"></div></section>'+
 '<section><h3>Browser drafts and original requests</h3><p id="rr-storage"></p><button id="rr-reload-work">Read retained browser history</button><div id="rr-drafts"></div><div id="rr-requests"></div></section>';
 root.append(host);
 const stylesheet=element('link');stylesheet.rel='stylesheet';stylesheet.href='/research-returns.css';host.prepend(stylesheet);
 const $=id=>host.querySelector('#'+id);
 let projectId=null,store=null,epoch=0,busy=false,opening=false,readTicket=0,detailTicket=0,fileTicket=0,editVersion=0,fieldIndex=0,offset=0,nextOffset=null,section='received',inventory=null,detail=null,freshComparison=null,preview=null,work=null,lastRevision=null,retaining=Promise.resolve(),timer=null,historyLimit=20;
 const tabId=tabIdentity();
 const active=id=>id===projectId&&getState()?.id===id;
 const status=(text,error=false)=>{$('rr-status').textContent=text;$('rr-status').classList.toggle('rr-error',error);if(error)message(text,true);};
 const fail=e=>status(e.message||String(e),true);
 const guard=fn=>async event=>{event?.preventDefault();try{await fn(event);}catch(e){fail(e);}};
 const bind=(id,type,fn)=>$(id).addEventListener(type,guard(fn));
 const value=()=>clone(work??{returnId:null,comparison:null,choices:{},orderText:'',note:'',label:'',draftRevision:0,packageSha256:'',author:'',createNote:''});
 function editable(){need(active(projectId)&&!opening&&!busy&&!getBusy(),'Finish the original project action before editing this return operation.');}
 function snapForm(){if(!work)work=value();work.packageSha256=$('rr-package').value;work.author=$('rr-author').value;work.createNote=$('rr-create-note').value;work.orderText=$('rr-order').value;work.note=$('rr-note').value;work.label=$('rr-label').value;return value();}
 function order(){return work.orderText.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);}
 function changed(){editVersion++;preview=null;$('rr-preview-result').textContent='Preview needs the current complete choices.';clearTimeout(timer);const id=projectId,s=store,copy=snapForm();timer=setTimeout(()=>{timer=null;retaining=retaining.then(()=>s?.retain(copy,'Return fields edited')).catch(fail);},300);sync();}
 async function retain(reason){clearTimeout(timer);timer=null;await retaining;need(store&&active(projectId),'Open the original project work.');return store.retain(snapForm(),reason);}
 async function preserve(reason){try{await retain(reason);}catch(e){downloadJSON({projectId,working:snapForm(),reason,storageError:e.message},'research-return-current-fields.json');throw e;}}
 function sync(){
  const disabled=!active(projectId)||opening||busy||Boolean(getBusy());
  for(const c of host.querySelectorAll('button,input,select,textarea'))c.disabled=disabled;
  if(!disabled){
   $('rr-prev').disabled=offset===0;$('rr-next').disabled=nextOffset===null;
   for(const id of ['rr-compare','rr-rebase','rr-save','rr-preview','rr-apply'])$(id).disabled=!work?.returnId;
   $('rr-rebase').disabled=!freshComparison||freshComparison.comparisonSha256===work?.comparison?.comparisonSha256;
   for(const id of ['rr-all-current','rr-field','rr-undecided','rr-order-selected'])$(id).disabled=!work?.comparison;
   $('rr-apply').disabled=!preview||preview.comparisonSha256!==work?.comparison?.comparisonSha256||preview.__editVersion!==editVersion||getState()?.revision!==preview.revision;
   $('rr-open-product').disabled=!work?.comparison?.productId||!onOpenProduct;
   for(const b of host.querySelectorAll('[data-native-request-pending]'))b.disabled=false;
  }
  $('rr-storage').textContent=store?.hasVolatile()?'Complete later work is retained in this tab but browser storage needs recovery. Export the full companion before closing.':'Browser forms and original requests remain separate from immutable native review history.';
 }
 function renderWork(){
  if(!work)return;$('rr-author').value=work.author??'';$('rr-create-note').value=work.createNote??'';$('rr-order').value=work.orderText??'';$('rr-note').value=work.note??'';$('rr-label').value=work.label??'';
  if([...$('rr-package').options].some(o=>o.value===work.packageSha256))$('rr-package').value=work.packageSha256;
  paintCompare();sync();
 }
 async function loadInventory(){
  if(!active(projectId))return;const id=projectId,ticket=++readTicket,e=epoch,currentSection=section,currentOffset=offset;
  const result=await api('/api/research/returns?'+new URLSearchParams({section:currentSection,offset:String(currentOffset),limit:'100'}),undefined,id);
  if(!active(id)||epoch!==e||ticket!==readTicket||section!==currentSection||offset!==currentOffset)return;
  need(result.projectId===id&&Array.isArray(result.rows),'The return inventory belongs to another project.');inventory=result;nextOffset=result.nextOffset;const p=$('rr-package'),selected=work?.packageSha256||p.value;p.replaceChildren(new Option('Choose an original received package',''));
  for(const r of result.receivings??[]){const key=r.packageSha256??r.id;p.append(new Option((r.title??r.productId??key)+' · '+key,key));}if([...p.options].some(o=>o.value===selected))p.value=selected;
  const box=$('rr-inventory');box.dataset.section=currentSection;box.dataset.offset=String(currentOffset);box.dataset.revision=String(result.revision);box.replaceChildren();
  for(const row of result.rows){const article=element('article'),returnId=row.returnId??row.id;article.append(element('h4',row.title??row.label??row.productId??returnId),element('pre',JSON.stringify(row,null,2)));if(HASH.test(returnId??'')){const b=element('button','Open complete return');b.type='button';b.dataset.returnId=returnId;b.onclick=guard(()=>openReturn(returnId));article.prepend(b);}box.append(article);}
  if(!result.rows.length)box.append(element('p','No retained records in this inventory.'));
  $('rr-page').textContent=result.total?String(offset+1)+'–'+Math.min(offset+100,result.total)+' of '+result.total:'No records';sync();
 }
 async function readSelected(returnId){
  const id=projectId,e=epoch,selected=returnId,ticket=++detailTicket;
  const results=await Promise.allSettled([api('/api/research/return?id='+encodeURIComponent(selected),undefined,id),api('/api/research/return-compare?id='+encodeURIComponent(selected),undefined,id)]);
  if(!active(id)||epoch!==e||work?.returnId!==selected||ticket!==detailTicket)return null;
  if(results[0].status==='rejected')throw results[0].reason;
  detail=results[0].value;need(detail.returnId===selected,'The detailed return belongs to another original selection.');paintDetail();
  if(results[1].status==='rejected'){freshComparison=null;paintNativeHistory();status('The complete return and original downloads are available. Author comparison: '+results[1].reason.message);return null;}
  const c=results[1].value;need(c.projectId===id&&c.returnId===selected&&HASH.test(c.comparisonSha256)&&Array.isArray(c.items),'The comparison belongs to another original return.');
  freshComparison=c;paintNativeHistory();return c;
 }

 function draftFields(d,c){return {returnId:c.returnId,comparison:clone(c),choices:clone(d?.choices??{}),orderText:(d?.order??[]).join('\n'),note:d?.note??'',label:d?.label??'',draftRevision:d?.revision??0};}
 async function openReturn(returnId){
  editable();busy=true;sync();const id=projectId,e=epoch;
  try{await preserve('Before opening another return');need(active(id)&&epoch===e,'Reopen this return in its original project.');work={...value(),returnId,comparison:null,choices:{},orderText:'',note:'',label:'',draftRevision:0};detail=null;freshComparison=null;preview=null;editVersion++;fieldIndex=0;
   const c=await readSelected(returnId);if(!c){await store.retain(value(),'Opened original return '+returnId);renderWork();return;}
   if(c.draft&&c.draft.comparisonSha256!==c.comparisonSha256){work.draftRevision=c.draft.revision;status('The native draft belongs to an earlier comparison. Open that saved edition explicitly or start a new review against current work.');}
   else Object.assign(work,draftFields(c.draft,c));
   await store.retain(value(),'Opened original return '+returnId);renderWork();
  }finally{busy=false;sync();}
 }
 function paintDetail(){
  $('rr-selection').textContent=work?.returnId?'Original return '+work.returnId:'Open a retained return.';$('rr-detail').textContent=detail?JSON.stringify(detail,null,2):'';
  const files=$('rr-files');files.replaceChildren();for(const f of detail?.files??[]){const b=element('button','Download '+f.filename);b.type='button';const id=projectId,returnId=work.returnId,descriptor=clone(f);b.onclick=guard(()=>{need(active(id)&&work.returnId===returnId,'Reopen the selected original return before downloading.');const query=new URLSearchParams({id:returnId,file:descriptor.file});if(descriptor.sourceId)query.set('sourceId',descriptor.sourceId);return download('/api/research/return-file?'+query,descriptor.filename,descriptor);});files.append(b);}
 }
 function paintCompare(){
  const c=work?.comparison,select=$('rr-field');select.replaceChildren();$('rr-alternatives').replaceChildren();$('rr-compared').textContent=c?JSON.stringify(c,null,2):'Read the original return comparison.';
  if(!c){$('rr-comparison-status').textContent='No comparison selected.';return;}
  fieldIndex=Math.min(fieldIndex,c.items.length-1);for(const [i,item]of c.items.entries())select.append(new Option((item.label??item.field)+(work.choices[item.field]?' · '+work.choices[item.field]:' · undecided'),String(i)));select.value=String(fieldIndex);
  const item=c.items[fieldIndex];if(item)for(const key of ['issued','current','returned']){const card=element('article');card.className='rr-choice'+(work.choices[item.field]===key?' rr-chosen':'');const label=element('label'),radio=element('input');radio.type='radio';radio.name='research-return-choice';radio.value=key;radio.dataset.field=item.field;radio.checked=work.choices[item.field]===key;label.append(radio,document.createTextNode(key==='issued'?'Original issued baseline':key==='current'?'Current author work':'Customer returned edition'));card.append(label,element('pre',JSON.stringify(item[key],null,2)));radio.onchange=guard(()=>{editable();work.choices={...work.choices,[item.field]:key};changed();paintCompare();});$('rr-alternatives').append(card);}
  const stale=freshComparison&&freshComparison.comparisonSha256!==c.comparisonSha256;
  $('rr-comparison-status').textContent=Object.keys(work.choices).length+' / '+c.items.length+' explicit choices · comparison '+c.comparisonSha256+(stale?' · Current native work changed. Preserve this review and explicitly start the current comparison before applying.':'');
 }
 function paintNativeHistory(){
  const box=$('rr-native-history');box.replaceChildren();for(const row of freshComparison?.draft?.history??[]){const b=element('button','Open saved review '+row.revision+' · '+row.label);b.type='button';b.dataset.workRevision=String(row.revision);b.onclick=guard(()=>openNativeWork(row.revision));box.append(b);}
  if(!box.children.length)box.append(element('p','No immutable native review drafts yet.'));
 }
 async function openNativeWork(revision){
  editable();busy=true;sync();const id=projectId,returnId=work.returnId,e=epoch;try{await preserve('Before reopening native review '+revision);const result=await api('/api/research/return-work?'+new URLSearchParams({returnId,revision:String(revision)}),undefined,id);
   need(active(id)&&epoch===e&&work.returnId===returnId,'Reopen the original return before adopting its saved draft.');
   const saved=result.work,comparison=result.comparison;need(result.projectId===id&&result.returnId===returnId&&saved?.returnId===returnId&&plain(saved.choices)&&Array.isArray(saved.order)&&plain(comparison)&&comparison.returnId===returnId&&comparison.comparisonSha256===saved.comparisonSha256,'The complete saved native draft is missing its original comparison context.');
   work={...value(),...draftFields({...saved,revision:freshComparison?.draft?.revision??saved.revision},comparison)};editVersion++;preview=null;await store.retain(value(),'Reopened complete native work '+revision);renderWork();
  }finally{busy=false;sync();}
 }
 async function paintHistory(){
  if(!store)return;const s=store,id=projectId,e=epoch,records=await s.records();if(!active(id)||epoch!==e||s!==store)return;
  const drafts=$('rr-drafts'),requests=$('rr-requests');drafts.replaceChildren();requests.replaceChildren();
  for(const d of records.drafts.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,historyLimit)){const detail=element('details'),summary=element('summary',d.reason+' · '+d.at),open=element('button','Open complete browser form');open.type='button';open.onclick=guard(async()=>{editable();busy=true;sync();try{await preserve('Before restoring browser form');work=clone(d.value);editVersion++;preview=null;await s.reopenHead();await s.retain(value(),'Restored browser form '+d.id);renderWork();if(work.returnId)await readSelected(work.returnId);}finally{busy=false;sync();}});const dl=element('button','Download reopenable complete form');dl.type='button';dl.onclick=guard(async()=>downloadJSON(await s.exportSelection({draftId:d.id}),'research-return-form-'+d.id+'.work.json'));detail.append(summary,open,dl,element('pre',JSON.stringify(d,null,2)));drafts.append(detail);}
  for(const r of records.operations.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,historyLimit)){const detail=element('details'),accepted=r.observations.some(o=>Object.hasOwn(o,'result'));detail.dataset.returnOperation=r.id;detail.append(element('summary',r.action+' · '+r.id+' · '+(accepted?'returned':'retain and continue original')),element('pre',JSON.stringify({...r,bodyText:undefined,bodyBytes:r.bodyText.length,observations:r.observations},null,2)));
   const dl=element('button','Download complete original request');dl.type='button';dl.onclick=guard(async()=>downloadJSON(await s.exportSelection({operationId:r.id}),'research-return-request-'+r.id+'.work.json'));detail.append(dl);
   const go=element('button',accepted?'Reopen returned request':'Continue exact original request');go.type='button';go.dataset.nativeRequestPending=r.id;go.onclick=guard(()=>resumeRecord(r));detail.append(go);requests.append(detail);
  }
  if(records.drafts.length>historyLimit||records.operations.length>historyLimit){const b=element('button','Show more retained browser history');b.onclick=guard(()=>{historyLimit+=20;return paintHistory();});requests.append(b);}sync();
 }
 async function sendRecord(record){
  const s=store,id=record.projectId,e=epoch,body=await s.validateOperation(record);need(active(id),'Open the original project before continuing its retained request.');
  let result,accepted=false;
  try{result=await api('/api/action',body,id);accepted=true;try{record=await s.observe(record,result);}catch(error){status('The complete native result returned; export browser work while local storage is unavailable. '+error.message,true);}
   await refresh();if(active(id)&&epoch===e){await loadInventory();if(body.returnId&&work?.returnId===body.returnId){const c=await readSelected(body.returnId);if(c&&result.draftRevision)work.draftRevision=result.draftRevision;}else if(result.returnId){work={...value(),returnId:result.returnId,comparison:null,choices:{},orderText:'',note:'',label:'',draftRevision:0};await readSelected(result.returnId);}
    preview=null;renderWork();await s.retain(value(),'Native '+body.action+' returned').catch(fail);status(body.action==='research-return-apply'?'Following product definition saved. Review source coverage, then use the original separate Issue action.':'Original native return action completed and retained.');}
   return result;
  }catch(error){if(accepted){status('Original result retained; its view needs refresh. '+error.message,true);return result;}try{await s.observe(record,null,error);}catch{}throw error;}
 }
 async function action(name,payload){
  editable();const id=projectId,e=epoch,form=snapForm(),revision=getState().revision,s=store;busy=true;sync();
  try{need(!getState().pending,'Continue the original native pending project action before creating another request.');const records=await s.records(),unknown=records.operations.filter(r=>!r.observations.some(o=>Object.hasOwn(o,'result'))&&!r.observations.some(o=>o.error&&Number.isInteger(o.error.status)&&o.error.status>=400&&o.error.status<500));
   need(!unknown.length,'Continue the retained uncertain original request before starting another return action.');
   const body={action:name,id:'research-return-'+crypto.randomUUID(),expectedRevision:revision,projectId:id,...clone(payload)},record=await s.prepare(body,form);
   need(active(id)&&epoch===e&&getState().revision===revision,'The original project changed before dispatch. Its complete prepared request remains in browser history.');
   return await sendRecord(record);
  }finally{busy=false;sync();await paintHistory().catch(fail);}
 }
 async function resumeRecord(record){
  editable();busy=true;sync();const id=projectId,e=epoch;try{await preserve('Before continuing original request '+record.id);need(record.projectId===id,'Open this request in its original project.');await store.validateOperation(record);
   const completed=record.observations.findLast(o=>Object.hasOwn(o,'result'));if(completed){status('Original returned result retained. Full request and outcome are available for download.');return;}
   await refresh();need(active(id)&&epoch===e,'Open this request in its original project.');const state=getState();
   need(!state.pending||state.pending.id===record.id,'Continue the other original native pending action first.');
   await sendRecord(record);
  }finally{busy=false;sync();await paintHistory().catch(fail);}
 }
 function actionFields(){need(work?.returnId&&work.comparison,'Open the complete selected return comparison.');return {returnId:work.returnId,expectedDraftRevision:work.draftRevision,comparisonSha256:work.comparison.comparisonSha256,choices:clone(work.choices),order:order(),note:work.note,label:work.label};}
 bind('rr-create','submit',()=>{snapForm();need(HASH.test(work.packageSha256),'Choose an original received Research package.');return action('research-return-create',{packageSha256:work.packageSha256,author:work.author,note:work.createNote});});
 bind('rr-import','submit',async()=>{
  editable();const file=$('rr-return-file').files[0],id=projectId,e=epoch,version=editVersion,ticket=++fileTicket;need(file&&file.size>0&&file.size<=MAX_RETURN,'Choose the complete return gzip within 256 MiB.');busy=true;sync();let bodyBase64;
  try{await preserve('Before reading complete customer return');const data=await fileDataURL(file);need(active(id)&&epoch===e&&version===editVersion&&ticket===fileTicket&&$('rr-return-file').files[0]===file,'The file or project selection changed while reading; select it again.');const marker=';base64,';need(data.includes(marker),'Read the complete selected binary file.');bodyBase64=data.slice(data.indexOf(marker)+marker.length);}
  finally{busy=false;sync();}
  return action('research-return-import',{filename:file.name,bodyBase64});
 });
 bind('rr-refresh','click',async()=>{editable();busy=true;sync();try{await preserve('Before return inventory refresh');await refresh();await loadInventory();if(work?.returnId)await readSelected(work.returnId);}finally{busy=false;sync();}});
 bind('rr-section','change',async()=>{editable();section=$('rr-section').value;offset=0;await loadInventory();});
 bind('rr-prev','click',async()=>{editable();offset=Math.max(0,offset-100);await loadInventory();});bind('rr-next','click',async()=>{editable();if(nextOffset!==null){offset=nextOffset;await loadInventory();}});
 bind('rr-compare','click',async()=>{editable();busy=true;sync();try{await preserve('Before reading current comparison');const c=await readSelected(work.returnId);if(c&&!work.comparison){Object.assign(work,draftFields({revision:c.draft?.revision??0},c));await store.retain(value(),'Selected current comparison');renderWork();}else paintCompare();}finally{busy=false;sync();}});
 bind('rr-rebase','click',async()=>{editable();need(freshComparison,'Read the current original comparison.');busy=true;sync();const id=projectId,e=epoch,selected=clone(freshComparison);try{await preserve('Before explicit current-comparison review');need(active(id)&&epoch===e&&selected.returnId===work.returnId,'Reopen this original comparison after the project changed.');work={...value(),comparison:selected,choices:{},orderText:'',draftRevision:selected.draft?.revision??0};editVersion++;preview=null;await store.retain(value(),'Explicitly selected current comparison; choices await review');renderWork();status('Current comparison selected. Earlier complete work is retained; explicitly choose every field again.');}finally{busy=false;sync();}});
 bind('rr-all-current','click',async()=>{editable();busy=true;sync();const id=projectId,e=epoch;try{await preserve('Before choosing current for every field');need(active(id)&&epoch===e,'Reopen this original comparison after the project changed.');work.choices=Object.fromEntries(work.comparison.items.map(i=>[i.field,'current']));changed();paintCompare();}finally{busy=false;sync();}});
 bind('rr-field','change',()=>{fieldIndex=Number($('rr-field').value);paintCompare();});
 bind('rr-undecided','click',()=>{editable();const field=work.comparison.items[fieldIndex]?.field;need(field,'Choose a compared field.');delete work.choices[field];changed();paintCompare();});
 bind('rr-order-selected','click',()=>{editable();const ids=work.comparison.items.filter(i=>i.kind==='requirement'&&work.choices[i.field]&&i[work.choices[i.field]]!==null).map(i=>i.field.slice('requirement/'.length));$('rr-order').value=ids.join('\n');changed();});
 for(const id of ['rr-order','rr-note','rr-label','rr-author','rr-create-note','rr-package'])bind(id,id==='rr-package'?'change':'input',()=>{editable();changed();});
 bind('rr-save','click',()=>{snapForm();return action('research-return-draft-save',actionFields());});
 bind('rr-preview','click',async()=>{editable();snapForm();const fields=actionFields(),id=projectId,e=epoch,v=editVersion;busy=true;sync();try{await retain('Before full merged-product preview');const result=await api('/api/research/return-preview',{returnId:fields.returnId,comparisonSha256:fields.comparisonSha256,choices:fields.choices,order:fields.order},id);if(!active(id)||epoch!==e||editVersion!==v||work.returnId!==fields.returnId)return;need(result.projectId===id&&result.returnId===fields.returnId&&result.comparisonSha256===fields.comparisonSha256,'The actual preview belongs to another comparison.');preview={...result,__editVersion:v};$('rr-preview-result').textContent=JSON.stringify(result,null,2);status('Complete merged product and source coverage loaded. Read this actual result before saving the following definition.');}finally{busy=false;sync();}});
 bind('rr-apply','click',()=>{snapForm();need(preview&&preview.__editVersion===editVersion&&preview.revision===getState().revision&&preview.comparisonSha256===work.comparison.comparisonSha256,'Preview these exact complete decisions against current native work before applying.');return action('research-return-apply',actionFields());});
 bind('rr-open-product','click',()=>onOpenProduct?.(work.comparison.productId));
 bind('rr-export-work','click',async()=>{need(store,'Open original browser work.');const packet=await store.exportWork(snapForm());downloadJSON(packet,'research-return-work-'+projectId+'.json');sync();});
 bind('rr-reload-work','click',async()=>{editable();await paintHistory();});
 bind('rr-import-work','click',async()=>{editable();const file=$('rr-work-file').files[0],id=projectId,e=epoch,v=editVersion,ticket=++fileTicket;need(file&&file.size>0&&file.size<=MAX_WORK,'Select the complete browser companion within 512 MiB.');busy=true;sync();try{await preserve('Before receiving browser companion');const raw=await file.text();need(active(id)&&epoch===e&&v===editVersion&&ticket===fileTicket&&$('rr-work-file').files[0]===file,'Work or file selection changed while reading.');const packet=JSON.parse(raw);need(packet.schema===RETURN_WORK_SCHEMA,'Choose the complete Research return browser companion.');await store.importWork(packet);status('Complete browser histories received. Explicitly open a retained form or continue its original request.');await paintHistory();}finally{busy=false;sync();}});
 async function onState(){
  const state=getState();if(!state){sync();return;}
  if(state.id!==projectId){
   if(store&&work){const previousStore=store,previousForm=snapForm();clearTimeout(timer);timer=null;retaining=retaining.then(()=>previousStore.retain(previousForm,'Before changing economic project')).catch(fail);}
   projectId=state.id;epoch++;readTicket++;detailTicket++;fileTicket++;editVersion++;store=null;work=null;detail=null;freshComparison=null;preview=null;lastRevision=null;offset=0;historyLimit=20;opening=true;sync();const id=projectId,e=epoch;
   try{const next=await createResearchReturnWork({projectId:id,tabId});if(!active(id)||epoch!==e)return;store=next;const saved=await next.current();work=saved?clone(saved.value):value();await loadInventory();if(!active(id)||epoch!==e)return;renderWork();if(work.returnId)await readSelected(work.returnId);await paintHistory();status('Original project return work and retained requests are open.');}
   catch(error){fail(error);}finally{if(active(id)&&epoch===e){opening=false;sync();}}
  }else if(state.revision!==lastRevision&&!opening){lastRevision=state.revision;preview=null;await loadInventory();if(work?.returnId)await readSelected(work.returnId);paintCompare();sync();}
 }
 const beforeUnload=event=>{if(timer!==null||store?.hasVolatile()){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
 return {onState:()=>onState().catch(fail),isBusy:()=>busy||opening,flush:async()=>{await retain('Browser work flushed');await store.flush();},dispose(){epoch++;fileTicket++;clearTimeout(timer);window.removeEventListener('beforeunload',beforeUnload);host.remove();}};
}
