// MIT. Complete browser authoring over the original prepaid request.
import * as Core from './commissioning-core.mjs';
import {sha256} from './commissioning-hash.mjs';
let state=Core.openCommission(document.getElementById('commission-data').textContent);
const originalSources=JSON.parse(document.getElementById('commission-sources').textContent);
const $=id=>document.getElementById(id),clone=x=>JSON.parse(JSON.stringify(x));
let dirty=false,documentDirty=false,generation=0,incoming=null,comparison=null,branch=crypto.randomUUID(),notice='';
let durableDocument=Core.canonical(state);
const markDocumentSaved=()=>{durableDocument=Core.canonical(state);documentDirty=false;};
const allowForm=()=>!dirty||confirm('The current form contains unsaved edits. Continue and discard those edits?');
const kinds=['setup-plan','setup-result','publication','customer-handoff','customer-files','customer-setup'];
const now=()=>new Date().toISOString();
const actor=()=>$('operator').value.trim()||'merchant-operator';
const say=s=>{$('notice').textContent=s;};
const safeFile=n=>n.replace(/[^a-zA-Z0-9._-]/g,'_');
const q=s=>"'"+String(s).replace(/'/g,"'\\''")+"'";
const download=(name,text,type='application/json')=>{const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const allow=()=>!(dirty||documentDirty)||confirm('This desk has unsaved form edits or document changes. Save complete JSON/HTML or a browser copy to retain them. Continue and replace this working document?');
const formFields=['title','serviceName','publicOrigin','gatewayBaseUrl','checkoutPath','checkoutRouteId','functionPath','allowanceUnits','requestUnits','workerPort','apiPort','timeoutSeconds','actor','python','backupPassEnv','payment.scheme','payment.network','payment.asset','payment.payTo','payment.amount','payment.maxTimeoutSeconds'];
const numeric=new Set(['allowanceUnits','requestUnits','workerPort','apiPort','timeoutSeconds','payment.maxTimeoutSeconds']);
function readForm(){const ed=Core.currentEdition(state),request=clone(ed.request);for(const key of formFields){const el=document.querySelector('[name="'+key+'"]');const raw=el.value;let value=raw;if(numeric.has(key)){if(!raw.trim())value=null;else{if(!/^(?:0|[1-9][0-9]*)$/.test(raw))throw Error('Enter a whole number for '+key);value=Number(raw);if(!Number.isSafeInteger(value))throw Error('Number is too large: '+key);}}if(key.startsWith('payment.'))request.payment[key.slice(8)]=value;else request[key]=value;}return {request,directory:$('directory').value};}
function showForm(){const ed=Core.currentEdition(state);$('directory').value=ed.directory;for(const key of formFields){const value=key.startsWith('payment.')?ed.request.payment[key.slice(8)]:ed.request[key];document.querySelector('[name="'+key+'"]').value=value??'';}$('operator').value=ed.actor;dirty=false;$('dirty').textContent='All form edits saved in this document.';}
function dom(tag,text,parent){const e=document.createElement(tag);e.textContent=text;if(parent)parent.append(e);return e;}
function button(text,fn,parent){const b=dom('button',text,parent);b.type='button';b.addEventListener('click',()=>run(fn));return b;}
function run(fn){try{const r=fn();if(r?.catch)r.catch(e=>say(e.message));}catch(e){say(e.message);}}
function publish(next,message,{saved=false}={}){state=Core.validateCommission(next);if(saved)markDocumentSaved();else documentDirty=Core.canonical(state)!==durableDocument;generation++;incoming=comparison=null;showForm();render();say(message+(documentDirty?' Save complete JSON/HTML or a browser copy to retain this document.':''));}
function documentHTML(){const copy=document.documentElement.cloneNode(true);copy.querySelector('#commission-data').textContent=JSON.stringify(state).replace(/</g,'\\u003c');copy.querySelector('#commission-sources').textContent=JSON.stringify(originalSources).replace(/</g,'\\u003c');copy.querySelector('#desk').innerHTML=document.getElementById('desk-shell').innerHTML;return '<!doctype html>\n'+copy.outerHTML+'\n';}
function render(){
 const summary=Core.commissioningSummary(state),ed=Core.currentEdition(state);
 $('headline').textContent=summary.title||'Prepaid API commissioning';
 $('summary').replaceChildren();for(const [label,value]of [['Selected directory',ed.directory],['Allowance units',ed.request.allowanceUnits],['Units per successful call',ed.request.requestUnits],['Maximum full calls',summary.maximumSuccessfulCalls],['Unspendable remainder',summary.remainingUnits],['Network',ed.request.payment.network],['Atomic asset price',ed.request.payment.amount],['Retained editions',summary.editions],['Current original results',summary.captures.length],['Prior-edition results',summary.historicalCaptures]]){const row=dom('div','',$('summary'));dom('b',label,row);dom('span',String(value??'Not selected'),row);}
 $('issues').replaceChildren();summary.issues.forEach(x=>dom('li',x,$('issues')));if(!summary.issues.length)dom('li','Form is ready for the original native compiler. Native preparation checks the actual asset, source, paths and checkout settings.',$('issues'));
 $('history').replaceChildren();for(const e of [...state.editions].reverse()){const item=dom('div','',$('history'));dom('b',e.id===state.head?'Selected edition':'Retained edition',item);dom('p',e.at+' — '+e.actor+' — '+e.note,item);dom('code',e.id,item);button('Download exact request',()=>download('prepaid-request-'+e.id.slice(0,12)+'.json',JSON.stringify(e.request,null,2)+'\n'),item);}
 $('results').replaceChildren();for(const c of state.captures){const item=dom('div','',$('results'));dom('b',c.kind+(c.editionId===state.head?'':' · earlier edition'),item);dom('p',c.at+' · SHA-256 '+c.sourceSha256,item);button('Download original JSON',()=>download(c.kind+'-'+c.sourceSha256.slice(0,12)+'.json',c.raw),item);if(c.kind==='setup-plan'){const group=dom('div','',item);for(const f of Core.generatedSourceFiles(state,c.id))button('Download '+f.name,()=>download(safeFile(f.name),f.content,f.name.endsWith('.mjs')?'text/javascript':'application/json'),group);}}
 const parent=$('parent-capture'),selected=parent.value;parent.replaceChildren(new Option('No parent (original setup plan)',''));
 for(const c of state.captures.filter(c=>c.editionId===state.head))parent.append(new Option(c.kind+' · '+c.sourceSha256.slice(0,12),c.id));if([...parent.options].some(o=>o.value===selected))parent.value=selected;
 $('commands').textContent=commands(ed);
 $('request-preview').textContent=JSON.stringify(ed.request,null,2);
 $('source-list').replaceChildren();for(const [name,content]of Object.entries(originalSources)){const line=dom('div','',$('source-list'));dom('span',name+' · '+new TextEncoder().encode(content).length+' bytes · '+sha256(content),line);button('Download source',()=>download(safeFile(name),content,name.endsWith('.md')?'text/markdown':'text/javascript'),line);}
 $('compare').replaceChildren();
}
function commands(ed){
 const latest=kind=>{const c=state.captures.filter(c=>c.editionId===ed.id&&c.kind===kind).at(-1);return c?JSON.parse(c.raw):null;};
 const setup=latest('setup-result'),customer=latest('customer-setup'),pub=latest('publication'),handoff=latest('customer-handoff');
 const d=q(ed.directory),out=q(ed.directory+'-commissioning'),doc=q('/absolute/private/commissioning.json'),launch=q(setup?.launchFile||'ORIGINAL_RETURNED_LAUNCH_FILE');
 const order=handoff?.orderReference||'ORIGINAL_ORDER_REFERENCE';
 const configurationFile=customer?.configurationFile||'ORIGINAL_RETURNED_CONFIGURATION_FILE';
 return [
 'umask 077',
 '# Save the complete document as the selected private commissioning.json first.',
 'starforge prepaid-api commissioning-prepare --document '+doc+' --out '+out,
 '# Open the original console and keep that owner running:',
 'starforge prepaid-api serve --directory '+d+' --port 0',
 '# In another terminal, use the original launch file:',
 'starforge prepaid-api publish --directory '+d+' --launch '+launch,
 '# Start the published service in its original merchant browser.',
 'starforge prepaid-api customer --directory '+d+' --launch '+launch+' --order '+q(order)+' --label '+q('Customer access'),
 'starforge prepaid-api receive --directory '+d+' --launch '+launch+' --order '+q(order)+' --out '+q(ed.directory+'-customer-files'),
 '# Purchase-mode configuration uses the original Buyer workspace and intent:',
 'starforge prepaid-api customer-configure --handoff-directory '+q(ed.directory+'-customer-files')+' --directory '+q(ed.directory+'-customer')+' --mode purchase --buyer-workspace '+q('/absolute/original/buyer-workspace')+' --intent '+q('ORIGINAL_STABLE_INTENT'),
 'starforge prepaid-api customer-serve --config '+q(configurationFile),
 '# Receive the original setup/customer-setup JSON to select its exact returned launchFile/configurationFile.',
 '# Managed Applications: configurationFile = '+ed.directory+'/merchant-workspace.json',
 '# Applications → API merchant console → choose actual ready runtime → Review → Save → Start.',
 ...(pub?['# Retained original offer: '+pub.offerId]:[]),
 '# --resume continues the original publication/customer request after an interrupted or rejected admission.'
 ].join('\n');
}
async function readFile(input){
 const f=input.files[0];if(!f)throw Error('Choose a complete UTF-8 JSON file.');
 if(f.size>Core.MAX_COMMISSION_BYTES)throw Error('File exceeds 32 MiB.');
 const observed=state,head=state.head,turn=generation,wasDirty=dirty;
 const bytes=await f.arrayBuffer();const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
 if(input.files[0]!==f||state!==observed||state.head!==head||generation!==turn||dirty!==wasDirty)throw Error('The selection or form changed while reading. Select the file again.');
 return raw;
}
function compareView(){
 const root=$('compare');root.replaceChildren();if(!comparison)return;
 dom('p','Compare the two complete branches. Original captures and both histories remain in the merged document. The selected setup directory stays explicit.',root);
 if(comparison.ambiguousBase)dom('p','These branches contain independently reconciled histories with multiple shared starting editions. Choose current or incoming for every differing field; no single baseline can decide them automatically.',root);
 const choices={};for(const f of comparison.fields){const row=dom('div','',root);dom('b',f.key,row);dom('p','Current: '+JSON.stringify(f.current)+' · Incoming: '+JSON.stringify(f.incoming),row);if(f.selected)dom('span','Retain '+f.selected,row);else{const pick=document.createElement('select');pick.append(new Option('Choose a value',''),new Option('Keep current','current'),new Option('Receive incoming','incoming'));pick.onchange=()=>choices[f.key]=pick.value;row.append(pick);}}
 button('Save merged edition',()=>{if(!allowForm())return;const next=Core.mergeCommission(state,incoming,choices,{actor:actor(),note:'Received and reconciled complete branch',at:now()});publish(next,'Merged complete histories and original results.');},root);
}
function bind(){
 $('request-form').addEventListener('input',()=>{dirty=true;generation++;$('dirty').textContent='Unsaved form edits — save an edition to export or prepare them.';});
 $('request-form').addEventListener('submit',e=>{e.preventDefault();run(()=>{const {request,directory}=readForm();publish(Core.reviseCommission(state,{request,directory,actor:actor(),note:$('edition-note').value.trim()||'Reviewed configuration update',at:now()}),'Saved complete configuration edition.');});});
 $('discard-form').addEventListener('click',()=>{if(allowForm()){generation++;showForm();say('Restored the selected saved edition.');}});
 for(const id of ['import-file','result-file'])$(id).addEventListener('change',()=>generation++);
 $('open-file').addEventListener('click',()=>run(async()=>{if(!allow())return;const raw=await readFile($('import-file'));const next=Core.openCommission(raw);branch=crypto.randomUUID();publish(next,'Opened complete document in a new local branch.',{saved:true});}));
 $('compare-file').addEventListener('click',()=>run(async()=>{if(dirty)throw Error('Save this form before comparing branches.');incoming=Core.openCommission(await readFile($('import-file')));comparison=Core.compareCommission(state,incoming);compareView();say('Choose every conflicting field, then save the merged edition.');}));
 $('receive-result').addEventListener('click',()=>run(async()=>{if(dirty)throw Error('Save this form before receiving original results.');const kind=$('result-kind').value,parentId=$('parent-capture').value||null;const raw=await readFile($('result-file'));if($('result-kind').value!==kind||($('parent-capture').value||null)!==parentId)throw Error('Result selection changed while reading.');publish(Core.receiveOriginal(state,{kind,raw,parentId,at:now()}),'Received the exact original '+kind+' with its full source bytes.');}));
 $('save-browser').addEventListener('click',()=>run(()=>{if(dirty)throw Error('Save the current form first.');const key='starforge-prepaid-commission/'+state.id+'/'+branch;localStorage.setItem(key,Core.exportCommission(state));markDocumentSaved();say('Saved this complete branch in this browser. Download JSON for host/browser transfer.');listLocal();}));
 $('load-browser').addEventListener('click',()=>run(()=>{if(!allow())return;const key=$('local-files').value;const raw=localStorage.getItem(key);if(!raw)throw Error('Saved branch is absent.');branch=crypto.randomUUID();publish(Core.openCommission(raw),'Opened the selected saved branch.',{saved:true});}));
 $('json-export').addEventListener('click',()=>run(()=>{if(dirty)throw Error('Save the current form first.');download('commissioning.json',Core.exportCommission(state));markDocumentSaved();}));
 $('html-export').addEventListener('click',()=>run(()=>{if(dirty)throw Error('Save the current form first.');download('Prepaid_API_Commissioning.html',documentHTML(),'text/html');markDocumentSaved();}));
 $('request-export').addEventListener('click',()=>run(()=>{if(dirty)throw Error('Save the current form first.');download('prepaid-request.json',JSON.stringify(Core.currentEdition(state).request,null,2)+'\n');}));
 $('source-export').addEventListener('click',()=>run(()=>{const packet={schema:'stellar-forge.prepaid-commissioning-source.v1',files:Object.entries(originalSources).map(([path,content])=>({path,content,bytes:new TextEncoder().encode(content).length,sha256:sha256(content)}))};download('prepaid-commissioning-source.json',JSON.stringify(packet,null,2)+'\n');}));
 $('refresh-local').addEventListener('click',()=>run(listLocal));
 window.addEventListener('beforeunload',e=>{if(dirty||documentDirty){e.preventDefault();e.returnValue='';}});
 window.addEventListener('storage',()=>listLocal());
}
function listLocal(){const picker=$('local-files');picker.replaceChildren(new Option('Select a complete saved branch',''));try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('starforge-prepaid-commission/')){try{const s=Core.openCommission(localStorage.getItem(key));picker.append(new Option(Core.currentEdition(s).request.title+' · '+s.head.slice(0,12),key));}catch{picker.append(new Option('Unreadable retained branch · '+key,key));}}}}catch(e){say('Browser storage unavailable; complete JSON/HTML downloads remain available.');}}
bind();showForm();render();listLocal();
