// SPDX-License-Identifier: MIT
import {sourceInputForItem} from './source-collection-model.mjs';
import {installSourceCollections} from './source-collections.mjs';
import { BankStatementsClient } from './sdk/client.mjs';
import { ReceivablesClient } from './client.mjs';
import {camtStatementHtml,camtEntryHtml,camtEntrySummary,originalStatementRows} from './camt.mjs';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const option = (value,label,selected='') => '<option value="'+esc(value)+'"'+(String(value)===String(selected)?' selected':'')+'>'+esc(label)+'</option>';
const choices = (values,selected,empty='Choose…') => (empty===null?'':option('',empty,selected))+values.map(x=>option(x.value??x.id,x.label??x.name,selected)).join('');
const field = (label,name,value='',type='text',attrs='') => '<label>'+esc(label)+'<input name="'+esc(name)+'" type="'+type+'" value="'+esc(value)+'" '+attrs+'></label>';
const area = (label,name,value='',attrs='') => '<label>'+esc(label)+'<textarea name="'+esc(name)+'" '+attrs+'>'+esc(value)+'</textarea></label>';
const selectField = (label,name,values,value='',empty='Choose…',attrs='') => '<label>'+esc(label)+'<select name="'+esc(name)+'" '+attrs+'>'+choices(values,value,empty)+'</select></label>';
const json = value => JSON.stringify(value,null,2);
const today = () => new Date().toISOString().slice(0,10);
const badge = value => '<span class="badge'+(/REVIEW|CONFLICT|INVALID|CURRENCY/.test(value||'')?' strong':'')+'">'+esc(String(value||'').replaceAll('_',' '))+'</span>';
const formatDate = value => value ? String(value).replace('T',' ').replace(/\.\d+Z$/,' UTC').replace(/Z$/,' UTC') : '—';
const ctx = {
 config:null,client:null,receivables:null,state:null,accountId:'',tab:'overview',busy:false,pending:null,loaded:false,
 sourceFile:null,sourcePreview:null,sourceStatementId:'',sourceMapping:null,sourceEdit:0,sourceFileLoad:0,sourceFileLoading:false,sourceLoadingName:'',
 tx:{items:[],total:0,offset:0,limit:50,revision:null},filters:{status:'',search:''},txLoad:0,
 overviewPage:0,closeListPage:0,detail:null,detailLoad:0,parts:[],detailDrafts:new Map(),
 closeDraft:{from:'',until:'',openingBalance:'',closingBalance:'',balanceNote:'',sourceClosing:'',periodCloseId:'',name:'',note:'',pageImportIds:'[]',groupingNote:'',summaryScope:'STATEMENT'},
 assemblyPreview:null,assemblySignature:null,assemblyPage:0,assemblyLoad:0,
 closePreview:null,closePage:0,record:null,recordLoad:0,db:null,storageProblem:null,invoiceDetail:null,invoiceLoad:0
};
let sourceCollections=null;
const MAP_FIELDS = [
 ['postedDate','Posted date'],['amount','Signed amount'],['debit','Debit'],['credit','Credit'],['providerId','Provider transaction ID'],
 ['payee','Payee / description'],['memo','Memo'],['reference','Reference'],['checkNumber','Check number'],['type','Transaction type'],
 ['balance','Running balance'],['currency','Currency'],['status','Status'],['correctsProviderId','Correction target ID'],
 ['correctionAction','Correction action'],['valueDate','Value date'],['accountId','Account ID'],['bankId','Bank ID'],['branchId','Branch ID'],['accountType','Account type']
];
function notice(message,level='info') {
 const node=$('#notice');node.hidden=!message;node.dataset.level=level;
 node.innerHTML=message?'<p>'+esc(message)+'</p><div class="actions"><button type="button" class="small" data-action="dismiss-notice">Dismiss</button></div>':'';
}
function errorMessage(error){return (error?.code?error.code+': ':'')+(error?.message||String(error));}
function storageKey(suffix){return 'merchant-bank:'+ctx.state?.workspaceId+':'+suffix;}
function readSmall(suffix,fallback=null){try{const raw=localStorage.getItem(storageKey(suffix));return raw?JSON.parse(raw):fallback;}catch{return fallback;}}
function writeSmall(suffix,value){try{localStorage.setItem(storageKey(suffix),JSON.stringify(value));}catch{}}
function openDb(){
 if(ctx.db)return ctx.db;
 ctx.db=new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(new Error('This browser cannot retain an original retry request.'));return;}
  const request=indexedDB.open('stellar-forge-bank-reconciliation-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('records');
  request.onerror=()=>reject(request.error||new Error('Local recovery storage could not open.'));
  request.onsuccess=()=>resolve(request.result);
 });
 return ctx.db;
}
async function dbRead(key){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction('records','readonly').objectStore('records').get(key);request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error);});}
async function dbWrite(key,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Recovery storage write was interrupted.'));});}
async function dbDelete(key){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
function uuid(){if(globalThis.crypto?.randomUUID)return crypto.randomUUID();const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');}
function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
function originalBytes(file){const binary=atob(file.dataBase64);return Uint8Array.from(binary,x=>x.charCodeAt(0));}
function localDownload(name,body,type='application/json'){const blob=body instanceof Blob?body:new Blob([body],{type});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function downloadResponse(response,fallbackName){
 const bytes=await response.arrayBuffer();
 const disposition=response.headers.get('content-disposition')||'';
 const quoted=disposition.match(/filename="([^"]+)"/);
 localDownload(quoted?.[1]||fallbackName,new Blob([bytes],{type:response.headers.get('content-type')||'application/octet-stream'}));
}
function minor(value,scale=2) {
 const raw=String(value??'').trim(),m=raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
 if(!m||raw.length>150||(m[3]?.length||0)>scale)throw new Error('Enter an exact amount with at most '+scale+' decimal places.');
 const out=BigInt(m[2]+(m[3]||'').padEnd(scale,'0'));return m[1]?-out:out;
}
function money(value,scale=2){const neg=value<0n,digits=(neg?-value:value).toString().padStart(scale+1,'0');return(neg?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits);}
function chosenAccount(){return ctx.state?.accounts.find(x=>x.id===ctx.accountId)||null;}
function transactionAccount(){return ctx.detail?.account||chosenAccount();}
function selectedSource(){return ctx.sourcePreview?.statements?.find(x=>x.id===ctx.sourceStatementId)||null;}
function previewValue(response){return response?.preview??response?.report??response;}
function formObject(form){return Object.fromEntries(new FormData(form));}
function resetSourcePreview(){ctx.sourcePreview=null;ctx.previewSourceInput=null;ctx.sourceStatementId='';ctx.sourceSupersedesId='';ctx.sourceReceiveAccountId='';ctx.sourceEdit++;const node=$('#source-preview');if(node)node.innerHTML='';}
function busy(){return ctx.busy||Boolean(ctx.pending);}
function lockForms(){
 for(const node of $$('[data-mutation]'))node.disabled=busy()||node.dataset.unavailable==='true';
 for(const fieldset of $$('fieldset[data-mutation-fields]'))fieldset.disabled=busy()||fieldset.dataset.unavailable==='true';
 $('#actor').disabled=busy();
}
function renderPending(){
 const node=$('#pending');node.hidden=!ctx.pending;
 if(!ctx.pending){node.innerHTML='';lockForms();return;}
 const item=ctx.pending;
 node.innerHTML='<h2>Retained operation: '+esc(item.label)+'</h2><p class="small">The original request is saved in this browser. Check its saved result or retry the same request after reconnecting.</p><p class="mono">'+esc(item.id)+' · '+esc(formatDate(item.createdAt))+'</p><div class="actions"><button type="button" data-action="recover-operation">Check saved result</button><button type="button" data-action="retry-operation">Retry original request</button><button type="button" data-action="download-operation">Download recovery file</button></div>';
 lockForms();
}
function definiteRejection(error){
 return error?.status>=400&&error.status<500&&!['TRANSPORT_FAILED','INVALID_RESPONSE','WORKSPACE_COMMIT_UNKNOWN','COMMIT_UNKNOWN','COMMIT_UNCERTAIN'].includes(error.code)
  &&!/unknown|uncertain|indeterminate/i.test(String(error.code||'')+' '+String(error.details?.outcome||''));
}
async function refreshState({render=true}={}){
 const state=await ctx.client.state();
 if(!state||!Array.isArray(state.accounts)||!Number.isInteger(state.revision)||!state.workspaceId)throw new Error('The bank workspace returned an incomplete state.');
 if(ctx.state&&ctx.state.workspaceId!==state.workspaceId)throw new Error('The server opened a different workspace. Reload this page to open its own recovery records.');
 ctx.state=state;ctx.loaded=true;
 if(ctx.assemblySignature&&ctx.assemblySignature!==assemblySignature())invalidateAssembly();
 if(ctx.accountId&&!state.accounts.some(x=>x.id===ctx.accountId))ctx.accountId='';
 const picker=$('#account-picker');picker.innerHTML=option('','All accounts',ctx.accountId)+state.accounts.map(x=>option(x.id,x.name+' · '+x.currency.code,ctx.accountId)).join('');
 $('#workspace-identity').textContent='Workspace '+state.workspaceId+' · revision '+state.revision;
 $('#connection').textContent='Connected · revision '+state.revision+' · '+new Date().toLocaleTimeString();
 if(render){renderOverview();if(ctx.tab==='collection')sourceCollections?.render();if(ctx.tab==='close')renderClose();if(ctx.sourcePreview)renderSourcePreview();lockForms();}
 return state;
}
async function completePending(result){
 const operation=ctx.pending;if(!operation)return;
 if(!result||typeof result!=='object')throw Object.assign(new Error('The response did not contain a saved operation result.'),{code:'INVALID_RESPONSE'});
 await dbDelete(storageKey('pending'));ctx.pending=null;ctx.busy=false;
 const transactionPath=operation.path.match(/^\/transactions\/([^/]+)\//);
 if(transactionPath){const id=decodeURIComponent(transactionPath[1]);ctx.detailDrafts.delete(id);writeSmall('transaction-draft:'+id,null);}
 invalidateClosePreview();renderPending();
 writeSmall('last-operation',{id:operation.id,label:operation.label,completedAt:new Date().toISOString(),result});
 try{await refreshState();if(ctx.tab==='transactions')await loadTransactions();if(ctx.detail&&$('#detail-dialog').open)await openTransaction(ctx.detail.transaction.id,{preserveDraft:false});}
 catch(error){notice(operation.label+' completed. Refresh to update the displayed account state. '+errorMessage(error));return result;}
 notice(operation.label+' recorded.');
 return result;
}
function operationResult(value){
 if(value?.found===false||value===null)return null;
 if(value?.revision!==undefined&&value?.workspaceId)return value;
 return value?.result??value?.response??value?.operation?.result??value;
}
async function recoverOperation({quiet=false}={}){
 if(!ctx.pending)return null;
 try{
  const returned=await ctx.client.getOperation(ctx.pending.id),result=operationResult(returned);
  if(!result){if(!quiet)notice('No saved result is available yet. The original request remains ready for manual retry.');return null;}
  return await completePending(result);
 }catch(error){
  if(error.status===404){if(!quiet)notice('This request has no saved result in the current workspace. Its original body and request ID are retained for retry.');return null;}
  if(!quiet)notice(errorMessage(error),'error');return null;
 }
}
async function sendPending(){
 const operation=ctx.pending;if(!operation)return;
 if(ctx.busy)throw new Error('The current operation is still running.');
 ctx.busy=true;lockForms();
 try{
  const result=await ctx.client.request(operation.path,{method:'POST',body:operation.body});
  return await completePending(result);
 }catch(error){
  ctx.busy=false;
  const recovered=await recoverOperation({quiet:true});
  if(recovered)return recovered;
  if(definiteRejection(error)){await dbDelete(storageKey('pending'));ctx.pending=null;renderPending();await refreshState().catch(()=>{});}
  notice(errorMessage(error),'error');throw error;
 }finally{ctx.busy=false;lockForms();}
}
async function mutate(path,data,label){
 if(!ctx.state)throw new Error('Open the workspace first.');
 if(ctx.pending)throw new Error('Resolve the retained original operation before recording another change.');
 if(ctx.busy)throw new Error('The current operation is still running.');
 const actor=$('#actor').value.trim();if(!actor)throw new Error('Enter the person or operator recording this change.');
 const viewedTransaction=path.match(/^\/transactions\/([^/]+)\//),viewedClose=path.match(/^\/closes\/([^/]+)\/reopen$/),reviewedRevision=viewedTransaction&&decodeURIComponent(viewedTransaction[1])===ctx.detail?.transaction.id?ctx.detail.revision:viewedClose&&ctx.record?.kind==='close'&&decodeURIComponent(viewedClose[1])===ctx.record.id?ctx.record.data.revision:path==='/closes'&&Number.isInteger(ctx.closePreviewRevision)?ctx.closePreviewRevision:ctx.state.revision;
 const id=uuid(),body={...data,revision:reviewedRevision??ctx.state.revision,actor,requestId:id,workspaceId:ctx.state.workspaceId};
 const operation={schema:'stellar-forge.bank-ui-operation.v1',workspaceId:ctx.state.workspaceId,id,path,label,createdAt:new Date().toISOString(),body};
 const size=new TextEncoder().encode(JSON.stringify(body)).length;
 if(size>(ctx.config.requestBytes||24000000))throw new Error('The complete request exceeds this workspace’s configured upload size. Select a smaller original bank export.');
 ctx.busy=true;lockForms();
 try{await dbWrite(storageKey('pending'),operation);ctx.pending=operation;}
 finally{ctx.busy=false;renderPending();}
 return sendPending();
}
async function loadRecoveryFile(file){
 if(ctx.pending)throw new Error('An original operation is already retained in this workspace.');
 const value=JSON.parse(await file.text());
 if(value?.schema!=='stellar-forge.bank-ui-operation.v1'||value.workspaceId!==ctx.state.workspaceId||value.body?.workspaceId!==ctx.state.workspaceId||value.id!==value.body?.requestId||typeof value.path!=='string'||!value.path.startsWith('/')||value.path.startsWith('//')||!value.body||typeof value.label!=='string')throw new Error('Choose a complete recovery file for this exact workspace.');
 const allowed=/^\/(?:accounts|imports|closes|transactions\/[^/]+\/(?:match|receipt|undo|resolve)|closes\/[^/]+\/reopen)$/;
 if(!allowed.test(value.path))throw new Error('The recovery file does not contain a bank workspace operation.');
 await dbWrite(storageKey('pending'),value);ctx.pending=value;renderPending();await recoverOperation();
}
function issuesHtml(issues=[]){
 return issues.length?'<div class="issue-list">'+issues.map(x=>'<div class="issue" data-severity="'+esc(x.severity||'ERROR')+'"><strong>'+esc(x.code||'Review')+'</strong>'+esc(x.message||'')+(x.source?.recordNumber?'<div class="small">Record '+esc(x.source.recordNumber)+'</div>':'')+'</div>').join('')+'</div>':'';
}
function pagerHtml(action,page,total,size=50){
 const start=total?page*size+1:0,end=Math.min(total,(page+1)*size);
 return '<div class="pager"><span>'+start+'–'+end+' of '+total+'</span><div class="actions"><button type="button" class="small" data-action="'+action+'" data-page="'+(page-1)+'" '+(page===0?'disabled':'')+'>Previous</button><button type="button" class="small" data-action="'+action+'" data-page="'+(page+1)+'" '+(end>=total?'disabled':'')+'>Next</button></div></div>';
}
function accountRow(account){return '<tr><td><strong>'+esc(account.name)+'</strong><small>'+esc(account.currency.code)+' · '+esc(account.currency.scale)+' decimal places</small></td><td class="amount">'+account.importCount+'</td><td class="amount">'+account.postedCount+'</td><td class="amount">'+account.matchedCount+'</td><td class="amount">'+account.reviewCount+'</td><td class="amount">'+account.activeCloseCount+'</td><td><button type="button" class="small" data-action="open-account" data-id="'+esc(account.id)+'">Open</button></td></tr>';}
function renderOverview(){
 if(!ctx.state)return;
 const accounts=ctx.accountId?ctx.state.accounts.filter(x=>x.id===ctx.accountId):ctx.state.accounts;
 const imports=ctx.state.imports.filter(x=>!ctx.accountId||x.accountId===ctx.accountId).slice().reverse();
 const closes=ctx.state.closes.filter(x=>!ctx.accountId||x.accountId===ctx.accountId).slice().reverse();
 const count=fieldName=>accounts.reduce((n,x)=>n+Number(x[fieldName]||0),0);
 const imported=imports.slice(ctx.overviewPage*20,(ctx.overviewPage+1)*20);
 const closed=closes.slice(ctx.closeListPage*20,(ctx.closeListPage+1)*20);
 $('#view-overview').innerHTML=
  '<div class="metrics">'+[['Posted transactions',count('postedCount')],['Matched',count('matchedCount')],['Source review',count('reviewCount')],['Closed statements',count('activeCloseCount')]].map(([label,value])=>'<div class="metric"><p class="small muted">'+label+'</p><p class="value">'+value+'</p></div>').join('')+'</div>'+
  '<section class="panel"><div class="section-heading"><div><h2>Bank accounts</h2><p class="muted small">Import an original statement to identify its account, then connect it to the merchant receipt and refund register.</p></div><button type="button" class="primary" data-action="show-import">Import statement</button></div><div class="table-wrap"><table><thead><tr><th>Account</th><th class="amount">Imports</th><th class="amount">Posted</th><th class="amount">Matched</th><th class="amount">Review</th><th class="amount">Closes</th><th></th></tr></thead><tbody>'+accounts.map(accountRow).join('')+(accounts.length?'':'<tr><td colspan="7" class="empty">Import your first bank statement to add an account.</td></tr>')+'</tbody></table></div></section>'+
  '<section class="panel"><div class="section-heading"><div><h2>Retained statements</h2><p class="small muted">Original files, source mapping and pending records remain available with each import.</p></div></div><div class="table-wrap"><table><thead><tr><th>Source file</th><th>Account</th><th>Recorded</th><th class="amount">Rows</th><th class="amount">Pending</th><th>Source</th></tr></thead><tbody>'+imported.map(x=>'<tr><td><strong>'+esc(x.file?.name||x.name||x.id)+'</strong><small>'+esc(x.format||'')+' · '+esc(x.file?.bytes??'')+' bytes</small></td><td>'+esc(ctx.state.accounts.find(a=>a.id===x.accountId)?.name||x.accountId)+'</td><td>'+esc(formatDate(x.createdAt||x.importedAt))+'</td><td class="amount">'+esc(x.rowCount)+'</td><td class="amount">'+esc(x.pendingCount)+'</td><td><div class="actions"><button type="button" class="small" data-action="open-import" data-id="'+esc(x.id)+'">Review</button><button type="button" class="small" data-action="import-file" data-id="'+esc(x.id)+'" data-file="original">Original</button><button type="button" class="small" data-action="import-file" data-id="'+esc(x.id)+'" data-file="parsed.json">Parsed file</button></div></td></tr>').join('')+(imported.length?'':'<tr><td colspan="6" class="empty">No statement imports in this selection.</td></tr>')+'</tbody></table></div>'+pagerHtml('imports-page',ctx.overviewPage,imports.length,20)+'</section>'+
  '<section class="panel"><div class="section-heading"><div><h2>Statement closes</h2><p class="small muted">Open the exact recorded reconciliation, download its account archive or reopen it with a reason.</p></div><button type="button" data-action="show-close">Close a statement</button></div><div class="table-wrap"><table><thead><tr><th>Statement</th><th>Account</th><th>Period</th><th class="amount">Closing balance</th><th>Status</th><th></th></tr></thead><tbody>'+closed.map(x=>'<tr><td>'+esc(x.name||x.id)+'</td><td>'+esc(ctx.state.accounts.find(a=>a.id===x.accountId)?.name||x.accountId)+'</td><td>'+esc(x.from)+' – '+esc(x.until)+'</td><td class="amount">'+esc(x.closingBalance)+'</td><td>'+badge(ctx.state.reopenings.some(r=>r.closeId===x.id)?'REOPENED':'CLOSED')+'</td><td><button type="button" class="small" data-action="open-close" data-id="'+esc(x.id)+'">Open</button></td></tr>').join('')+(closed.length?'':'<tr><td colspan="6" class="empty">No statement close has been recorded.</td></tr>')+'</tbody></table></div>'+pagerHtml('closes-page',ctx.closeListPage,closes.length,20)+'</section>'+
  '<details class="panel"><summary>Recover an original operation</summary><p class="small muted">Open a recovery file downloaded from this exact workspace. Its saved result is checked before a manual retry is offered.</p><label class="small">Recovery file<input type="file" id="recovery-file" accept=".json,application/json"></label></details>';
 lockForms();
}
function defaultMapping(){
 return {format:'OFX',textEncoding:'',accountNamespace:'',camtMessageVersion:'',camtDetailPolicy:'PRESERVE_ONLY',delimiter:',',headerRow:'1',dateFormat:'YMD',decimalSeparator:'.',groupSeparator:'',amountMode:'SIGNED',accountName:'',bankId:'',branchId:'',accountId:'',accountType:'CHECKING',currency:'USD',scale:'2',postedStatuses:'Booked',pendingStatuses:'Pending',balanceRecords:'[]',skipRecords:'[]',columns:{}};
}
function renderImport(){
 const d=ctx.sourceMapping||defaultMapping();
 const collectionLabel=sourceCollections?.workingLabel();
 const headerFields=MAP_FIELDS.map(([key,label])=>field(label,'col-'+key,d.columns[key]||'','text','data-source-field placeholder="Header or #column"')).join('');
 $('#view-import').innerHTML=
 (collectionLabel?'<section class="panel"><p>Working collection: <strong>'+esc(collectionLabel)+'</strong></p><button type="button" data-tab="collection">Return to all original files</button></section>':'')+
 '<section class="panel"><div class="section-heading"><div><h2>Original statement file</h2><p class="small muted">Choose the complete bank export. OFX, QFX and CAMT.053 XML provide original account and transaction records; CSV uses your explicit source mapping.</p></div></div><form id="source-form"><div class="grid three">'+
 '<label>Original file<input id="statement-file" type="file" accept=".ofx,.qfx,.xml,.csv,.tsv,.txt,application/x-ofx,application/vnd.intu.qfx,application/xml,text/xml,text/csv"></label>'+
 selectField('File format','format',[{value:'OFX',label:'OFX bank statement'},{value:'QFX',label:'QFX bank statement'},{value:'CAMT053',label:'CAMT.053 XML statement'},{value:'CSV',label:'Mapped CSV'}],d.format,null,'data-source-field')+
 selectField('Original text encoding','textEncoding',[{value:'',label:'Use original declaration / UTF-8'},{value:'utf-8',label:'UTF-8'},{value:'windows-1252',label:'Windows-1252'},{value:'iso-8859-1',label:'ISO-8859-1'},{value:'utf-16le',label:'UTF-16 LE'},{value:'utf-16be',label:'UTF-16 BE'},{value:'us-ascii',label:'ASCII'}],d.textEncoding,null,'data-source-field')+'</div>'+
 '<div id="source-file-summary" class="file-summary mt14"></div>'+
 '<div id="native-options" class="mt14">'+field('Institution namespace when the original file has no bank/FI identity','accountNamespace',d.accountNamespace,'text','data-source-field maxlength="255" placeholder="Stable institution reference"')+'</div>'+
 '<fieldset id="camt-options" class="mt16" '+(d.format==='CAMT053'?'':'hidden')+'><legend>CAMT.053 source interpretation</legend><div class="grid two">'+
 selectField('Expected message version','camtMessageVersion',[{value:'',label:'Read the original supported namespace'},{value:'camt.053.001.02',label:'camt.053.001.02'},{value:'camt.053.001.08',label:'camt.053.001.08'}],d.camtMessageVersion,null,'data-source-field')+
 selectField('Transaction detail amounts','camtDetailPolicy',[{value:'PRESERVE_ONLY',label:'Preserve the original entry amount'},{value:'ENTRY_CURRENCY_TX_AMT',label:'Also check details stated in the entry currency'}],d.camtDetailPolicy,null,'data-source-field')+
 '</div><p class="small muted mt10">Each booked entry remains one cash row. Original detail amounts, charges, reversals and remittance fields remain attached to that entry.</p></fieldset>'+
 '<fieldset id="csv-options" class="mt16" '+(d.format==='CSV'?'':'hidden')+'><legend>CSV source mapping</legend><div class="grid four">'+
 selectField('Delimiter','delimiter',[{value:',',label:'Comma'},{value:';',label:'Semicolon'},{value:'\t',label:'Tab'},{value:'|',label:'Pipe'}],d.delimiter,null,'data-source-field')+
 field('Header logical record','headerRow',d.headerRow,'number','data-source-field min="1" max="100000"')+
 selectField('Date layout','dateFormat',[{value:'YMD',label:'Year / month / day'},{value:'DMY',label:'Day / month / year'},{value:'MDY',label:'Month / day / year'}],d.dateFormat,null,'data-source-field')+
 selectField('Amounts','amountMode',[{value:'SIGNED',label:'One signed amount'},{value:'DEBIT_CREDIT',label:'Separate debit and credit'}],d.amountMode,null,'data-source-field')+
 selectField('Decimal separator','decimalSeparator',[{value:'.',label:'Point (.)'},{value:',',label:'Comma (,)'}],d.decimalSeparator,null,'data-source-field')+
 selectField('Group separator','groupSeparator',[{value:'',label:'None'},{value:',',label:'Comma'},{value:'.',label:'Point'},{value:' ',label:'Space'},{value:"'",label:'Apostrophe'},{value:'\u00a0',label:'Nonbreaking space'}],d.groupSeparator,null,'data-source-field')+
 field('Bank / institution ID','bankId',d.bankId,'text','data-source-field maxlength="255"')+
 field('Source account ID','accountId',d.accountId,'text','data-source-field maxlength="255"')+
 field('Branch ID','branchId',d.branchId,'text','data-source-field maxlength="255"')+
 field('Account type','accountType',d.accountType,'text','data-source-field maxlength="100"')+
 field('Account currency','currency',d.currency,'text','data-source-field maxlength="3" pattern="[A-Za-z]{3}"')+
 field('Account decimal places','scale',d.scale,'number','min="0" max="6" data-source-field')+'</div>'+
 '<h3 class="heading-gap">Original columns</h3><p class="small muted mb12">Use an exact header name or a one-based column such as #2. Leave fields absent from the source blank.</p><div class="mapping-grid">'+headerFields+'</div>'+
 '<div class="grid two mt15">'+field('Posted status values — comma separated','postedStatuses',d.postedStatuses,'text','data-source-field')+field('Pending status values — comma separated','pendingStatuses',d.pendingStatuses,'text','data-source-field')+'</div>'+
 '<details><summary>Original opening / closing records and source exclusions</summary><p class="small muted">Select balance records from the file. Keep record numbers and a reason for each excluded footer. These original selections are included in the reviewed import.</p><div class="grid two">'+area('Balance record selections (JSON)','balanceRecords',d.balanceRecords,'data-source-field spellcheck="false"')+area('Excluded record selections (JSON)','skipRecords',d.skipRecords,'data-source-field spellcheck="false"')+'</div><p class="small mono">[{"recordNumber":3,"kind":"OPENING","amountColumn":"Balance","dateColumn":"Date"},{"recordNumber":40,"kind":"CLOSING","amountColumn":"Balance","dateColumn":"Date"}]</p></details>'+
 '<details><summary>Original source text</summary><p class="small muted">The first 100,000 decoded characters are available here for choosing the header and mapping. Download opens the complete original file.</p><pre id="source-text-preview"></pre></details></fieldset>'+
 '<div class="form-footer"><div class="actions"><button type="button" data-action="download-source">Download original</button><button type="button" data-action="download-source-draft">Download file + mapping</button><label class="button-label small">Restore file + mapping<input type="file" id="restore-source-draft" accept=".json" class="file-picker"></label></div><button type="submit" class="primary" id="preview-source-button">Review original source</button></div></form></section><div id="source-preview"></div>';
 $('#native-options').hidden=false;$('#csv-options').disabled=d.format!=='CSV';$('#camt-options').disabled=d.format!=='CAMT053';renderSourceFile();if(ctx.sourcePreview)renderSourcePreview();lockForms();
}
function renderSourceFile(){
 const node=$('#source-file-summary');if(!node)return;
 const button=$('#preview-source-button');
 if(button){button.disabled=ctx.sourceFileLoading;button.textContent=ctx.sourceFileLoading?'Reading selected file…':'Review original source';}
 for(const input of $$('[data-source-field]',$('#source-form')||document))input.disabled=ctx.sourceFileLoading;
 for(const action of ['download-source','download-source-draft']){const link=$('[data-action="'+action+'"]');if(link)link.disabled=ctx.sourceFileLoading;}
 if(ctx.sourceFileLoading){node.innerHTML='<p class="small">Reading '+esc(ctx.sourceLoadingName)+'…</p><p class="small muted">The new file must finish loading before its source can be reviewed.</p>';return;}
 if(!ctx.sourceFile){node.innerHTML='<p class="muted small">Choose an original bank statement file.</p>';return;}
 node.innerHTML='<h3>'+esc(ctx.sourceFile.name)+'</h3><p class="small">'+esc(ctx.sourceFile.bytes)+' original bytes · retained in this browser</p>'+(ctx.sourceFile.sha256?'<p class="mono">'+esc(ctx.sourceFile.sha256)+'</p>':'');
 const pre=$('#source-text-preview');
 if(pre){try{const enc=ctx.sourceMapping?.textEncoding||'utf-8';pre.textContent=new TextDecoder(enc,{fatal:false}).decode(originalBytes(ctx.sourceFile)).slice(0,100000);}catch(error){pre.textContent=error.message;}}
}

function captureMapping(){
 const form=$('#source-form');if(!form)return ctx.sourceMapping;
 const values=formObject(form),prior=ctx.sourceMapping||defaultMapping(),columns={};
 for(const[key]of MAP_FIELDS)columns[key]=values['col-'+key]??prior.columns?.[key]??'';
 ctx.sourceMapping={...prior,...Object.fromEntries(Object.keys(prior).filter(x=>x!=='columns').map(key=>[key,values[key]??prior[key]])),columns};
 writeSmall('source-mapping',ctx.sourceMapping);sourceCollections?.mappingChanged(ctx.sourceFile,ctx.sourceMapping);return ctx.sourceMapping;
}
function sourceInput(){
 if(ctx.sourceFileLoading)throw new Error('Wait for the selected original file to finish loading.');
 if(!ctx.sourceFile)throw new Error('Choose the original bank statement file first.');
 return sourceInputForItem({file:ctx.sourceFile,mapping:captureMapping()});
}
async function chooseFile(file){
 if(!file)return;
 captureMapping();await sourceCollections?.flush();sourceCollections?.detach();
 const generation=++ctx.sourceFileLoad;captureMapping();resetSourcePreview();
 ctx.sourceFileLoading=true;ctx.sourceLoadingName=file.name;renderSourceFile();
 try{
  const limit=ctx.config.sourceBytes||16000000;if(file.size>limit)throw new Error('The file is larger than this installed workspace’s '+limit+'-byte source limit.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const sha256=crypto.subtle?[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join(''):null;
  if(generation!==ctx.sourceFileLoad)return;
  const saved={name:file.name,bytes:bytes.length,dataBase64:base64(bytes),sha256},ext=file.name.toLowerCase().split('.').at(-1),d=structuredClone(captureMapping());
  d.format=ext==='qfx'?'QFX':['csv','tsv'].includes(ext)?'CSV':ext==='ofx'?'OFX':ext==='xml'?'CAMT053':d.format;
  if(ext==='tsv')d.delimiter='\t';
  await dbWrite(storageKey('source-file'),saved);
  if(generation!==ctx.sourceFileLoad)return;
  // Completed storage transactions remain the fallback until a later complete file commits.
  ctx.sourceFile=saved;ctx.sourceMapping=d;writeSmall('source-mapping',d);
 }catch(error){if(generation===ctx.sourceFileLoad)throw error;}
 finally{if(generation===ctx.sourceFileLoad){ctx.sourceFileLoading=false;ctx.sourceLoadingName='';renderImport();}}
}

async function previewSource(){
 const source=sourceInput(),edition=ctx.sourceEdit;
 const button=$('#preview-source-button');button.disabled=true;button.textContent='Reading original source…';
 try{
  const result=await ctx.client.previewSource({source}),preview=previewValue(result);
  if(edition!==ctx.sourceEdit)return;
  if(!Array.isArray(preview.statements))throw new Error('The source preview did not return account statement sections.');
  ctx.sourcePreview={...preview,reviewSha256:result.reviewSha256||preview.reviewSha256};
  ctx.sourceStatementId=preview.statements.find(x=>x.kind!=='CLOSING_INFORMATION')?.id||preview.statements[0]?.id||'';
  ctx.previewSourceInput=structuredClone(source);renderSourcePreview();
  await sourceCollections?.previewed(ctx.sourceFile,captureMapping(),ctx.sourcePreview);
 }finally{if(button.isConnected){button.disabled=ctx.sourceFileLoading;button.textContent=ctx.sourceFileLoading?'Reading selected file…':'Review original source';}}
}
function receiptIntakeBinding(source,accountId){
 const original=ctx.state.accounts.find(value=>value.id===accountId),basis=source?.account?.identityBasis;
 const identity=source?.account?.identitySha256;
 const sameCurrency=value=>value.currency?.code===source?.account.currency&&
   (!original||Number(value.currency.scale)===Number(original.currency.scale));
 const all=(ctx.state.receiptIntakeAccounts||[]).filter(sameCurrency);
 const bound=original?.receiptIntakeAccountId||'';
 const choices=bound?all.filter(value=>value.id===bound):all.filter(value=>
   value.status!=='ARCHIVED'&&(value.statementSourceIdentitySha256===identity||
     Boolean(basis&&value.bankId===(source.account.bankId||basis.institution)&&value.accountReference===basis.accountId)));
 const automatic=choices.filter(value=>value.statementSourceIdentitySha256===identity||
   Boolean(basis&&!basis.branchId&&value.bankId===(source.account.bankId||basis.institution)&&value.accountReference===basis.accountId));
 const key=accountId+':'+(identity||'');
 const retained=readSmall('receipt-intake-bindings',{})[key]||'';
 const selected=bound||(choices.some(value=>value.id===retained)?retained:automatic.length===1?automatic[0].id:'');
 return {key,choices,selected,bound,required:!bound&&choices.length>0&&!selected};
}
function receiptIntakeBindingForm(source,accountId){
 if(!accountId)return '';
 const binding=receiptIntakeBinding(source,accountId);
 const name=value=>value.reference+' · '+value.name+' · '+value.currency.code+
   ' · bank '+(value.bankId||'unspecified')+' · account '+(value.accountReference||'unspecified');
 if(binding.bound)return '<div class="source-note"><p class="small"><strong>Original receipt-intake account</strong></p><p class="small">'+
   esc(binding.choices[0]?name(binding.choices[0]):binding.bound)+'</p><input type="hidden" name="receiptIntakeAccountId" value="'+esc(binding.bound)+'">'+
   '<p class="small muted">The saved bank-account binding and receipt coverage are reused for this statement.</p></div>';
 return selectField('Original receipt-intake account','receiptIntakeAccountId',
   binding.choices.map(value=>({value:value.id,label:name(value)})),binding.selected,
   binding.choices.length?'Choose exact original account…':'Automatic original account binding',
   binding.required?'required':'')+
   '<p class="small muted">'+(binding.required?
     'Select the original receipt-intake account explicitly. The retained account references do not identify one automatic match.':
     binding.selected?'This source reuses the selected original receipt-intake account.':
     'The original statement identity will bind its receipt-intake account when this source is retained.')+
   ' The complete original file and reviewed source mapping remain unchanged.</p>';
}

function renderSourcePreview(){
 const preview=ctx.sourcePreview,node=$('#source-preview');if(!node||!preview)return;
 const source=selectedSource();
 const existing=ctx.state.accounts.filter(x=>x.sourceIdentitySha256===source?.account.identitySha256&&x.currency.code===source?.account.currency);
 const selectedExisting=existing.some(x=>x.id===ctx.sourceReceiveAccountId)?ctx.sourceReceiveAccountId:existing.some(x=>x.id===ctx.accountId)?ctx.accountId:existing[0]?.id||'';
 ctx.sourceReceiveAccountId=selectedExisting;
 const sameImports=ctx.state.imports.filter(x=>x.accountId===selectedExisting&&x.statementId===source?.id&&x.file?.sha256===preview.file?.sha256);
 const previousImports=sameImports.some(x=>x.reviewSha256===preview.reviewSha256)?[]:sameImports;
 if(!previousImports.some(x=>x.id===ctx.sourceSupersedesId))ctx.sourceSupersedesId='';
 const sample=source?.sample||source?.rows?.slice(0,20)||[];
 node.innerHTML='<section class="panel"><div class="section-heading"><div><h2>Review and retain source</h2><p class="small muted">'+esc(preview.file?.name)+' · '+esc(preview.file?.bytes)+' bytes · '+esc(preview.format)+'</p></div><button type="button" data-action="download-source-preview">Download preview</button></div>'+
 issuesHtml(preview.issues)+selectField('Original account statement','source-statement',preview.statements.map(x=>({value:x.id,label:x.account.accountId+' · '+x.account.currency+' · '+x.kind+' · '+(x.summary?.postedCount||0)+' rows'})),ctx.sourceStatementId,null)+
 (source?'<div class="grid two mt15"><div class="source-note"><p><strong>'+esc(source.account.accountType||source.account.kind)+' · '+esc(source.account.accountId)+'</strong></p><p class="small">'+esc(source.account.financialInstitution?.name||source.account.bankId||'Selected institution')+' · '+esc(source.account.currency)+'</p><p class="small">Source coverage: '+esc(source.period.from||'unspecified')+' to '+esc(source.period.until||'unspecified')+' ('+esc(source.period.kind.replaceAll('_',' ').toLowerCase())+')</p><p class="small">Posted rows '+esc(source.summary?.postedCount||0)+' · pending '+esc(source.pendingCount??source.pendingRows?.length??0)+' · source review '+esc(source.summary?.invalidPostedCount||0)+'</p></div><div class="source-note"><p class="small">Ledger snapshot: '+esc(source.balances.ledger?.amount??'not supplied')+' '+esc(source.account.currency)+'</p><p class="small">Available snapshot: '+esc(source.balances.available?.amount??'not supplied')+' '+esc(source.account.currency)+'</p><p class="small">Original closing pairs: '+source.balances.closing.length+'</p><p class="small muted">Download coverage and the row date range are distinct from a complete statement close.</p></div></div>'+issuesHtml(source.issues)+camtStatementHtml(preview,source)+
 '<details><summary>Original source identity and interpretation</summary><dl class="key-values"><dt>Institution/account identity</dt><dd class="mono">'+esc(source.account.identitySha256||'Supply an explicit institution namespace, then review again')+'</dd><dt>Original file SHA256</dt><dd class="mono">'+esc(preview.file?.sha256)+'</dd><dt>Source review</dt><dd class="mono">'+esc(preview.reviewSha256)+'</dd><dt>Original account basis</dt><dd><pre>'+esc(json(source.account.identityBasis))+'</pre></dd></dl></details>'+
 '<h3 class="heading-gap">Source row preview</h3><div class="table-wrap"><table><thead><tr><th>Record</th><th>Date</th><th>Payee / reference</th><th class="amount">Amount</th><th>ID / review</th></tr></thead><tbody>'+sample.map(row=>'<tr><td>'+esc(row.source?.recordNumber??'—')+'</td><td>'+esc(row.postedDate)+'</td><td>'+esc(row.payee||row.memo)+'<small>'+esc(row.reference)+'</small>'+camtEntrySummary(row)+'</td><td class="amount">'+esc(row.amount)+' '+esc(row.currency)+'</td><td><span class="mono">'+esc(row.providerId||'No native ID')+'</span>'+issuesHtml(row.issues)+'</td></tr>').join('')+(sample.length?'':'<tr><td colspan="5" class="empty">This source section contains balance information without posted transactions.</td></tr>')+'</tbody></table></div><p class="small muted mt8">'+sample.length+' preview rows shown. All retained transaction rows are available in the paged Transactions view and complete parsed-file download.</p>'+
 '<div class="grid two mt20"><form id="receive-source-form" class="stack"><h3>Retain in an existing bank account</h3>'+selectField('Merchant bank account','accountId',existing.map(x=>({value:x.id,label:x.name+' · '+x.currency.code})),selectedExisting,existing.length?'Choose exact account…':'Add this original account first')+receiptIntakeBindingForm(source,selectedExisting)+(previousImports.length?selectField('Revise an earlier interpretation of these exact bytes','supersedesImportId',previousImports.map(x=>({value:x.id,label:(x.file.name||x.id)+' · '+formatDate(x.createdAt||x.importedAt)+' · prior review '+x.reviewSha256})),ctx.sourceSupersedesId||'','Choose the prior interpretation…','required')+'<p class="small muted">A revised interpretation retains this same file, identifies the prior import, and opens explicit replacement/deletion reviews. Existing cash decisions remain until you review and apply those corrections.</p>':'')+'<label class="check-line"><input type="checkbox" name="reviewed" required><span>I reviewed this original account, source mapping and transaction coverage.</span></label><button type="submit" class="primary" data-mutation data-unavailable="'+(!existing.length)+'" '+(!existing.length?'disabled':'')+'>Retain original statement</button></form>'+
 '<form id="bank-account-form" class="stack"><h3>Add this bank account</h3>'+field('Account name','name',ctx.sourceMapping?.accountName||((source.account.accountType||'Bank')+' '+source.account.accountId),'text','required maxlength="160"')+field('Decimal places','scale',ctx.sourceMapping?.scale||'2','number','required min="0" max="6"')+area('Account note','note','','maxlength="3000"')+'<button type="submit" data-mutation data-unavailable="'+(!source.account.identitySha256)+'" '+(!source.account.identitySha256?'disabled':'')+'>Add selected source account</button></form></div>':'<p class="empty">No supported account section returned.</p>')+'</section>';
 lockForms();
}

function transactionRow(row){
 const match=row.match,amount=row.valuation?.amount??row.amount,currency=row.valuation?.currency?.code||ctx.state.accounts.find(x=>x.id===row.accountId)?.currency.code||row.currency;
 return '<tr><td>'+esc(row.postedDate||'Review date')+'</td><td><strong>'+esc(row.payee||row.extendedName||row.memo||'Bank transaction')+'</strong><small>'+esc(row.reference||row.checkNumber)+'</small></td><td class="amount">'+esc(amount)+' '+esc(currency)+'</td><td>'+badge(row.status)+(match?' '+badge('MATCHED'):'')+(row.closed?' '+badge('CLOSED'):'')+'</td><td class="mono">'+esc(row.providerId||'Original source row')+'</td><td><button type="button" class="small" data-action="open-transaction" data-id="'+esc(row.id)+'">Review</button></td></tr>';
}
function renderTransactions(){
 const statuses=['POSTED','OVERLAP_REVIEW','CONFLICT','CORRECTION_REVIEW','INVALID','FOREIGN_CURRENCY','DUPLICATE','SUPERSEDED','DELETED','EXCLUDED'];
 $('#view-transactions').innerHTML='<section class="panel"><div class="section-heading"><div><h2>Statement transactions</h2><p class="small muted">Review every retained row, connect payments and refunds, and keep source corrections with the original transaction.</p></div></div><form id="transaction-filter" class="filters">'+
 selectField('Source status','status',statuses.map(x=>({value:x,label:x.replaceAll('_',' ')})),ctx.filters.status,'All statuses')+
 '<label class="search-field">Search source / payee / reference<input name="search" type="search" value="'+esc(ctx.filters.search)+'" autocomplete="off"></label><button type="submit">Apply filter</button></form>'+
 '<div id="transactions-table" class="table-wrap"></div><div id="transactions-pager"></div></section>';
 renderTransactionRows();
}
function renderTransactionRows(){
 const table=$('#transactions-table');if(!table)return;
 table.innerHTML='<table><thead><tr><th>Date</th><th>Payee / reference</th><th class="amount">Account amount</th><th>Review</th><th>Original ID</th><th></th></tr></thead><tbody>'+ctx.tx.items.map(transactionRow).join('')+(ctx.tx.items.length?'':'<tr><td colspan="6" class="empty">No retained transactions match this selection.</td></tr>')+'</tbody></table>';
 $('#transactions-pager').innerHTML=pagerHtml('transactions-page',Math.floor(ctx.tx.offset/ctx.tx.limit),ctx.tx.total,ctx.tx.limit);
}
async function loadTransactions(offset=ctx.tx.offset){
 const generation=++ctx.txLoad;
 const selected=ctx.accountId,status=ctx.filters.status,search=ctx.filters.search;
 const response=await ctx.client.transactions({accountId:selected,status,search,offset,limit:ctx.tx.limit});
 if(generation!==ctx.txLoad||selected!==ctx.accountId||status!==ctx.filters.status||search!==ctx.filters.search)return;
 if(!response||!Array.isArray(response.items)||!Number.isInteger(response.total))throw new Error('Transaction list returned an incomplete page.');
 ctx.tx={...response,offset:response.offset??offset,limit:response.limit??ctx.tx.limit};
 renderTransactionRows();
}
function customerName(id){return ctx.state.customers?.find(x=>x.id===id)?.name||id||'';}
function invoiceInfo(item){
 const invoice=item.invoice||item,summary=item.summary||item;
 return {item,invoice,summary,id:invoice.id||item.id,number:invoice.number||item.number||invoice.id,customerId:invoice.customerId||item.customerId,currency:invoice.currency||item.currency,
  status:invoice.status||item.status,issueDate:invoice.issueDate||item.issueDate,amountDue:summary.amountDue??summary.balanceDue??summary.balance??null,total:summary.total??invoice.totals?.total??null};
}
function currentInvoiceOptions(customerId){
 const currency=transactionAccount()?.currency;
 return (ctx.detail?.invoices||[]).map(invoiceInfo).filter(x=>(!customerId||x.customerId===customerId)&&x.status==='ISSUED'&&(!currency||(typeof x.currency==='string'?x.currency:x.currency?.code)===currency.code&&(x.currency?.scale===undefined||x.currency.scale===currency.scale)));
}
function saveDetailDraft(){
 if(!ctx.detail)return;
 const tx=ctx.detail.transaction;
 const form=$('#match-form');
 if(form)ctx.parts=readParts();
 const get=id=>{const f=$(id);return f?Object.fromEntries($$('input[name],select[name],textarea[name]',f).map(x=>[x.name,x.type==='checkbox'?x.checked:x.value])):null;};
 const draft={parts:structuredClone(ctx.parts),match:get('#match-form'),receipt:get('#receipt-form'),resolve:get('#resolve-form'),undo:get('#undo-form')};
 ctx.detailDrafts.set(tx.id,draft);writeSmall('transaction-draft:'+tx.id,draft);
}
function sourceLinks(transaction){
 const copies=transaction.copies||[];
 return copies.length?'<div class="actions">'+copies.map((copy,index)=>'<button type="button" class="small" data-action="open-source-row" data-id="'+esc(copy.importId)+'" data-row="'+esc(copy.sourceRowId)+'">Original record '+(index+1)+'</button>').join('')+'</div>':'<p class="small muted">Original source is available in the retained statement.</p>';
}
function closeTransactionDialog(){
 saveDetailDraft();ctx.detailLoad++;ctx.invoiceLoad++;ctx.detail=null;ctx.invoiceDetail=null;
 if($('#detail-dialog').open)$('#detail-dialog').close();
}
function closeRecordDialog(){
 ctx.recordLoad++;ctx.record=null;if($('#record-dialog').open)$('#record-dialog').close();
}
function beginRecordRead(title){
 const generation=++ctx.recordLoad;ctx.record=null;
 $('#record-title').textContent=title;$('#record-body').innerHTML='<p class="loading">Opening retained original record…</p>';
 if(!$('#record-dialog').open)$('#record-dialog').showModal();
 return generation;
}
function currentRecordRead(generation){return generation===ctx.recordLoad&&$('#record-dialog').open;}
async function openTransaction(id,{preserveDraft=true}={}){
 if(preserveDraft)saveDetailDraft();
 closeRecordDialog();
 const generation=++ctx.detailLoad;ctx.detail=null;ctx.invoiceDetail=null;ctx.invoiceLoad++;
 $('#detail-title').textContent='Transaction';
 $('#detail-body').innerHTML='<p class="loading">Opening original transaction…</p>';
 if(!$('#detail-dialog').open)$('#detail-dialog').showModal();
 const detail=await ctx.client.detail(id);
 if(generation!==ctx.detailLoad||!$('#detail-dialog').open)return;
 if(!detail?.transaction||!detail.account)throw new Error('Transaction detail returned an incomplete record.');
 ctx.detail=detail;
 const draft=preserveDraft?(ctx.detailDrafts.get(id)||readSmall('transaction-draft:'+id)):null;
 ctx.parts=structuredClone(draft?.parts||[]);
 if(!ctx.parts.length&&!detail.transaction.match&&detail.transaction.status==='POSTED'){
  const value=detail.transaction.valuation?.amount??detail.transaction.amount;
  let zero=false;try{zero=minor(value,detail.account.currency.scale)===0n;}catch{}
  ctx.parts=zero?[]:[{kind:'',targetId:'',coverageKey:'',amount:value||'',note:'',reference:'',ledgerCode:''}];
 }
 renderTransactionDetail(draft);
}
function transactionLineage(tx){
 const selected=new Set(),links=[['Current replacement',tx.correctedBy],['Replaced original',tx.supersedesId],['Prior interpretation',tx.interpretationReplacesId],['Duplicate original',tx.duplicateOf]]
  .filter(([,id])=>id&&id!==tx.id&&!selected.has(id)&&selected.add(id));
 if(!links.length)return '';
 return '<section class="source-note mt12"><h3>Original transaction and current successors</h3><p class="small">Open each retained transaction to review its current receipt match, source files and correction history.</p><div class="actions">'+links.map(([label,id])=>'<button type="button" class="small" data-action="open-transaction" data-id="'+esc(id)+'">'+esc(label)+'</button>').join('')+'</div></section>';
}
function sourceDecisionActions(tx,account){
 const values=[];
 if(tx.status==='OVERLAP_REVIEW'&&!tx.providerKey)values.push({value:'ACCEPT_DISTINCT',label:'Keep as a distinct original transaction'});
 if(['OVERLAP_REVIEW','CONFLICT','INVALID','POSTED'].includes(tx.status))values.push({value:'LINK_DUPLICATE',label:'Link to an existing duplicate transaction'});
 if(['CORRECTION_REVIEW','CONFLICT'].includes(tx.status))values.push({value:'APPLY_CORRECTION',label:'Apply the bank source correction'});
 if(tx.currency&&tx.currency!==account.currency.code&&['FOREIGN_CURRENCY','CORRECTION_REVIEW'].includes(tx.status))values.push({value:'VALUE',label:'Record the actual account-currency value'});
 if(tx.status==='INVALID'&&(!tx.postedDate||tx.amount===null||tx.sourceStatus!=='POSTED'))values.push({value:'EXCLUDE',label:'Exclude this source row with a reason'});
 return values;
}

function renderTransactionDetail(draft=null){
 const {transaction:tx,account,suggestions}=ctx.detail;
 const effectiveAmount=tx.valuation?.amount??tx.amount;
 const closed=tx.closed,postable=tx.status==='POSTED'&&!closed&&!tx.match;
 const sourceIssue=tx.issues||[];
 $('#detail-title').textContent=(tx.payee||tx.memo||'Bank transaction')+' · '+(tx.postedDate||'Review date');
 const customers=(ctx.state.customers||[]).map(x=>({value:x.id,label:x.name+(x.reference?' · '+x.reference:'')}));
 const candidates=tx.candidates||[];
 const resolve=draft?.resolve||{},receipt=draft?.receipt||{},decisionActions=sourceDecisionActions(tx,account),decisionUnavailable=Boolean(closed||tx.match||!decisionActions.length);
 const selectedDecision=decisionActions.some(item=>item.value===resolve.action)?resolve.action:defaultResolve(tx,account);
 const invoiceChoices=currentInvoiceOptions(receipt.customerId).map(x=>({value:x.id,label:x.number+' · '+customerName(x.customerId)+(x.amountDue!==null?' · due '+x.amountDue:'')}));
 const targetChoices=resolutionTargets(selectedDecision,tx);
 let positive=false,zero=false;try{const amount=minor(effectiveAmount,account.currency.scale);positive=amount>0n;zero=amount===0n;}catch{}
 $('#detail-body').innerHTML=
 '<section class="panel"><div class="section-heading"><div><h3>'+esc(account.name)+'</h3><p class="small muted">'+esc(tx.reference||tx.checkNumber||'')+'</p></div><div class="actions">'+badge(tx.status)+(tx.match?badge('MATCHED'):'')+(closed?badge('CLOSED'):'')+'</div></div><dl class="key-values"><dt>Account amount</dt><dd><strong class="amount">'+esc(effectiveAmount)+' '+esc(account.currency.code)+'</strong></dd><dt>Original source amount</dt><dd>'+esc(tx.amount)+' '+esc(tx.currency)+'</dd><dt>Posted date</dt><dd>'+esc(tx.postedDate)+' <span class="small muted">'+esc(tx.postedAtRaw||'')+'</span></dd><dt>Bank transaction ID</dt><dd class="mono">'+esc(tx.providerId||'Original source row without provider ID')+'</dd><dt>Original reference</dt><dd>'+esc(tx.reference||'—')+'</dd><dt>Memo</dt><dd>'+esc(tx.memo||'—')+'</dd><dt>Source</dt><dd>'+sourceLinks(tx)+'</dd><dt>Workspace transaction</dt><dd class="mono">'+esc(tx.id)+'</dd></dl>'+
 (tx.valuation?'<p class="source-note small">Reviewed account-currency value: '+esc(tx.valuation.amount)+' '+esc(account.currency.code)+' · '+esc(tx.valuation.reason||tx.valuation.note||'')+'</p>':'')+issuesHtml(sourceIssue)+camtEntryHtml(tx)+
 transactionLineage(tx)+(closed?'<p class="source-note small">This transaction belongs to a saved close. Open that close from Overview to record its reopening before changing this transaction.</p>':'')+'</section>'+
 (tx.match?'<section class="panel"><div class="section-heading"><h3>Recorded posting parts</h3><span class="small muted">'+esc(formatDate(tx.match.createdAt||tx.match.at))+'</span></div><div class="table-wrap"><table><thead><tr><th>Kind</th><th>Original record</th><th class="amount">Amount</th><th>Note</th></tr></thead><tbody>'+tx.match.parts.map(part=>'<tr><td>'+esc(part.kind)+'</td><td>'+esc(part.target?.reference||part.reference||part.targetId||'Accountant posting')+'<small>'+esc(part.ledgerCode||'')+'</small></td><td class="amount">'+esc(part.amount)+'</td><td>'+esc(part.note)+'</td></tr>').join('')+'</tbody></table></div><p class="small muted mt10">'+esc(tx.match.reason)+'</p><form id="undo-form" class="mt14"><fieldset data-mutation-fields data-unavailable="'+Boolean(closed)+'"><legend>Undo this match</legend>'+area('Reason','reason',draft?.undo?.reason||'','required maxlength="4000"')+'<div class="form-footer"><span class="small muted">The original posting history remains with the transaction.</span><button type="submit" data-mutation data-unavailable="'+Boolean(closed)+'">Undo original match</button></div></fieldset></form></section>':'')+
 (!tx.match?'<section class="panel"><h3>'+(zero?'Confirm the original zero-amount transaction':'Match existing payments or classify the bank amount')+'</h3>'+(zero?'<p class="source-note small mt12">The bank reports an exact zero amount. Leave posting parts empty and record the source explanation to retain this as a reviewed zero-cash transaction.</p>':'')+'<p class="small muted mt5">Posting parts must total the signed account amount. A receipt plus a negative bank fee can explain a net deposit.</p><form id="match-form"><fieldset data-mutation-fields data-unavailable="'+(!postable)+'" class="mt14"><legend>Exact posting parts</legend><div id="posting-parts"></div><div class="actions mt12"><button type="button" data-action="add-part">Add posting part</button><button type="button" data-action="add-fee">Add balancing fee</button></div><div id="posting-total"></div>'+area('Match explanation','reason',draft?.match?.reason||'','required maxlength="4000" class="mt15"')+'<div class="form-footer"><span class="small muted">Select the original receipt or refund for every customer-money part.</span><button type="submit" class="primary" data-mutation data-unavailable="'+(!postable)+'">' +(zero?'Confirm zero amount':'Record exact match')+ '</button></div></fieldset></form></section>':'')+
 (!tx.match&&positive?'<section class="panel"><h3>Record a customer payment from this bank credit</h3><p class="small muted mt5">The original receipt and optional invoice allocation are recorded together. Gross payment less the positive fee must equal the bank credit.</p><form id="receipt-form"><fieldset data-mutation-fields data-unavailable="'+(!postable)+'" class="mt14"><legend>Original customer receipt</legend><div class="grid two">'+
 selectField('Existing customer','customerId',customers,receipt.customerId||'','Choose customer…','required')+
 field('Payment reference','reference',receipt.reference||tx.reference||tx.providerId||'','text','required maxlength="300"')+
 field('Gross customer payment','grossAmount',receipt.grossAmount||effectiveAmount,'text','required inputmode="decimal"')+
 field('Bank / processor fee (positive)','feeAmount',receipt.feeAmount||'','text','inputmode="decimal" placeholder="0.00"')+
 area('Receipt note','note',receipt.note||'','maxlength="4000"')+
 area('Bank match explanation','reason',receipt.reason||'','required maxlength="4000"')+'</div>'+
 '<details '+(receipt.invoiceId?'open':'')+'><summary>Allocate to an existing issued invoice</summary><div class="grid three">'+selectField('Original invoice','invoiceId',invoiceChoices,receipt.invoiceId||'','Keep as unapplied customer funds')+
 field('Allocation amount','allocationAmount',receipt.allocationAmount||'','text','inputmode="decimal"')+
 field('Allocation date','allocatedDate',receipt.allocatedDate||tx.postedDate||today(),'date')+'</div><div id="selected-invoice" class="small muted"></div></details><div id="receipt-total" class="totals"></div><div class="form-footer"><span class="small muted">Original customer and invoice checks run in the merchant accounting writer.</span><button type="submit" class="primary" data-mutation data-unavailable="'+(!postable)+'">Record receipt and match</button></div></fieldset></form></section>':'')+
 '<section class="panel"><h3>Review overlaps, source corrections and currency</h3>'+
 (candidates.length?'<div class="table-wrap mt12"><table><thead><tr><th>Existing source candidate</th><th class="amount">Amount</th><th>Status</th><th></th></tr></thead><tbody>'+candidates.map(x=>'<tr><td>'+esc(x.postedDate)+' · '+esc(x.payee||x.reference||x.providerId)+'</td><td class="amount">'+esc(x.amount)+' '+esc(x.currency)+'</td><td>'+badge(x.status)+'</td><td><button type="button" class="small" data-action="open-transaction" data-id="'+esc(x.id)+'">Open</button></td></tr>').join('')+'</tbody></table></div>':'')+
 (tx.correction?'<p class="source-note small mt12">Original bank correction: '+esc(tx.correction.action)+' · target '+esc(tx.correction.providerId)+'</p>':'')+
 (tx.interpretationAction?'<p class="source-note small mt12">Reviewed interpretation correction: '+esc(tx.interpretationAction)+' · prior workspace transaction '+esc(tx.interpretationReplacesId)+'</p>':'')+
 (tx.match?'<p class="source-note small mt12">Undo the recorded match before making a source decision. A receipt created from this bank row keeps its original receipt identity; release its allocations and void that receipt through Receivables before replacing the source.</p>':'')+
 (!decisionActions.length?'<p class="source-note small mt12">This retained transaction has completed its source decision. Its originals and any current successor remain available above.</p>':'')+
 '<form id="resolve-form"><fieldset data-mutation-fields data-unavailable="'+decisionUnavailable+'" class="mt14"><legend>Reviewed source decision</legend><div class="grid two">'+selectField('Decision','action',decisionActions,selectedDecision,'Choose decision…','required')+
 selectField('Existing transaction target','targetId',targetChoices,resolve.targetId||'','Choose original target…')+
 field('Other exact target transaction ID','targetManual',resolve.targetManual||'','text','maxlength="100"')+
 field('Account-currency amount','accountAmount',resolve.accountAmount||'','text','inputmode="decimal"')+
 '<div class="span-all">'+area('Source decision and basis','reason',resolve.reason||'','required maxlength="4000"')+'</div></div><p id="resolve-help" class="small muted mt10"></p><div class="form-footer"><span class="small muted">The original bank row and previous decisions remain retained.</span><button type="submit" data-mutation data-unavailable="'+decisionUnavailable+'">Record source decision</button></div></fieldset></form></section>'+
 '<details class="panel"><summary>Original history and source identities</summary><pre>'+esc(json({source:tx.source,copies:tx.copies,history:tx.history,providerKey:tx.providerKey,candidateFingerprint:tx.candidateFingerprint,correction:tx.correction,interpretationAction:tx.interpretationAction,interpretationReplacesId:tx.interpretationReplacesId,supersedesId:tx.supersedesId,correctedBy:tx.correctedBy,duplicateOf:tx.duplicateOf}))+'</pre></details>';
 renderParts();updateReceiptTotal();updateResolveFields();lockForms();
}
function defaultResolve(tx,account){return tx.currency&&tx.currency!==account.currency.code&&!tx.valuation&&['FOREIGN_CURRENCY','CORRECTION_REVIEW'].includes(tx.status)?'VALUE':tx.status==='CORRECTION_REVIEW'?'APPLY_CORRECTION':tx.status==='OVERLAP_REVIEW'&&!tx.providerKey?'ACCEPT_DISTINCT':'';}
function receiptCoverageChoices(part){
 return part.kind==='RECEIPT'?(ctx.detail.suggestions?.receipts.find(row=>row.id===part.targetId)?.coverageGroups||[]):[];
}
function coverageSourceLabel(source){
 return [source.sourceName||source.bankImportId||source.statementImportId,source.bookedDate,source.reference||source.bankReference||source.transactionId||source.rowId].filter(Boolean).join(' · ');
}
function renderReceiptCoverage(part){
 const groups=receiptCoverageChoices(part);if(!groups.length)return '';
 const selected=groups.find(group=>group.key===part.coverageKey),stale=Boolean(part.coverageKey&&!selected);
 const values=groups.map(group=>({value:group.key,label:group.amount+' '+transactionAccount().currency.code+' · '+[...new Set(group.sources.map(coverageSourceLabel))].join(' | ')}));
 const shown=selected||(groups.length===1&&!stale?groups[0]:null);
 return '<div class="part-coverage">'+selectField('Original payment coverage','coverageKey',values,selected?.key||'',groups.length===1&&!stale?'Use the one original source portion':'Choose the exact original payment…',groups.length>1||stale?'required':'')+
  '<p class="small muted">'+(stale?'The saved coverage choice has changed. Select its current original payment portion.':groups.length>1?'This receipt covers several matching source portions. Select the one represented by this bank transaction.':'This source portion is already part of the original receipt. The match preserves that same cash.')+'</p>'+
  (shown?'<details><summary>Selected original payment sources · '+esc(shown.amount)+' '+esc(transactionAccount().currency.code)+'</summary><div class="table-wrap"><table><thead><tr><th>Original source</th><th>Bank date</th><th>Reference</th><th class="amount">Source amount</th><th class="amount">Receipt portion</th></tr></thead><tbody>'+shown.sources.map(source=>'<tr><td>'+esc(source.sourceName||source.bankImportId||source.statementImportId)+'<small>'+esc(source.rowId||source.statementTransactionId||'')+'</small></td><td>'+esc(source.bookedDate)+'</td><td>'+esc(source.reference||source.bankReference||source.transactionId||'')+'</td><td class="amount">'+esc(source.sourceAmount??'—')+'</td><td class="amount">'+esc(source.splitAmount??shown.amount)+'</td></tr>').join('')+'</tbody></table></div><p class="small mono">'+esc(shown.key)+'</p></details>':'')+'</div>';
}
function renderParts(){
 const node=$('#posting-parts');if(!node)return;
 const suggestions=ctx.detail.suggestions||{receipts:[],refunds:[]};
 const kinds=['RECEIPT','REFUND','FEE','EXPENSE','INCOME','INTEREST','TRANSFER','CAPITAL'].map(x=>({value:x,label:x.replaceAll('_',' ')}));
 node.innerHTML=ctx.parts.map((part,index)=>{
  const targets=part.kind==='RECEIPT'?suggestions.receipts.map(x=>({value:x.id,label:x.reference+' · '+x.customerName+(x.sourceMatch?' · this original source '+x.sourceCoveredAmount:'')+' · remaining '+x.remaining})):
   part.kind==='REFUND'?suggestions.refunds.map(x=>({value:x.id,label:(x.reference||x.id)+' · '+(x.customerName||x.customer?.name||'')+' · remaining '+x.remaining})):[];
  const needsTarget=['RECEIPT','REFUND'].includes(part.kind);
  return '<div class="posting-grid" data-part="'+index+'">'+selectField('Kind','kind',kinds,part.kind||'','Choose…','required')+
   '<div class="part-target">'+(needsTarget?selectField('Original '+part.kind.toLowerCase(),'targetId',targets,part.targetId||'','Choose original record…','required'):'<label>Accounting classification<input value="'+esc(part.kind||'Choose a kind')+'" disabled></label>')+'</div>'+
   field('Signed amount','amount',part.amount||'','text','required inputmode="decimal"')+
   '<div class="part-note">'+field('Posting note','note',part.note||'','text',needsTarget?'maxlength="3000"':'required maxlength="3000"')+'</div>'+
   '<button type="button" class="small" data-action="remove-part" data-index="'+index+'">Remove</button>'+
   '<div class="part-reference">'+field('Reference / transfer counterpart','reference',part.reference||'','text',(part.kind==='TRANSFER'?'required ':'')+'maxlength="300"')+'</div>'+
   '<div class="part-code">'+field('Accounting code','ledgerCode',part.ledgerCode||'','text','maxlength="100"')+'</div>'+renderReceiptCoverage(part)+'</div>';
 }).join('');
 updatePostingTotal();lockForms();
}

function readParts(){
 return $$('.posting-grid',$('#posting-parts')||document).map(row=>Object.fromEntries($$('input[name],select[name]',row).map(x=>[x.name,x.value])));
}
function postingDifference(){
 const account=transactionAccount(),scale=account.currency.scale;
 const expected=minor(ctx.detail.transaction.valuation?.amount??ctx.detail.transaction.amount,scale);
 const total=readParts().reduce((sum,part)=>sum+minor(part.amount,scale),0n);
 return {expected,total,difference:expected-total,scale};
}
function updatePostingTotal(){
 const target=$('#posting-total');if(!target)return;
 try{
  const value=postingDifference();
  target.innerHTML='<div class="totals"><span>Bank amount</span><span class="amount">'+money(value.expected,value.scale)+'</span><span>Posting total</span><span class="amount">'+money(value.total,value.scale)+'</span><strong>Difference</strong><strong class="amount">'+money(value.difference,value.scale)+'</strong></div>';
 }catch(error){target.innerHTML='<p class="small muted mt10">'+esc(error.message)+'</p>';}
}
function updateReceiptTotal(){
 const form=$('#receipt-form'),target=$('#receipt-total');if(!form||!target)return;
 try{
  const values=formObject(form),scale=transactionAccount().currency.scale,gross=minor(values.grossAmount,scale),fee=minor(values.feeAmount||'0',scale),bank=minor(ctx.detail.transaction.valuation?.amount??ctx.detail.transaction.amount,scale);
  if(gross<=0n||fee<0n)throw new Error('Gross payment must be positive and fee must be zero or positive.');
  target.innerHTML='<span>Gross less fee</span><span class="amount">'+money(gross-fee,scale)+'</span><strong>Bank difference</strong><strong class="amount">'+money(bank-(gross-fee),scale)+'</strong>';
 }catch(error){target.innerHTML='<span>'+esc(error.message)+'</span>';}
}
function resolutionTargets(action,tx=ctx.detail.transaction){
 const statuses=action==='LINK_DUPLICATE'?['POSTED']:action==='APPLY_CORRECTION'?['POSTED','INVALID','CONFLICT','DUPLICATE','FOREIGN_CURRENCY']:[];
 return [...new Map([...(tx.candidates||[]),...ctx.tx.items.filter(row=>row.id!==tx.id&&row.accountId===tx.accountId)].map(row=>[row.id,row])).values()]
  .filter(row=>row.id!==tx.id&&statuses.includes(row.status)&&(action!=='LINK_DUPLICATE'||row.postedDate===tx.postedDate))
  .map(row=>({value:row.id,label:(row.postedDate||'Review date')+' · '+(row.payee||row.reference||row.providerId||row.id)+' · '+(row.valuation?.amount??row.amount)+' '+(row.valuation?.currency?.code||row.currency)}));
}
function updateResolveFields(){
 const form=$('#resolve-form');if(!form)return;
 const action=form.elements.action.value,needsTarget=['LINK_DUPLICATE','APPLY_CORRECTION'].includes(action),needsValue=action==='VALUE';
 const targets=resolutionTargets(action),prior=form.elements.targetId.value,original=action==='APPLY_CORRECTION'?ctx.detail.transaction.interpretationReplacesId:'';
 const selected=targets.some(row=>row.value===prior)?prior:targets.some(row=>row.value===original)?original:'';
 form.elements.targetId.innerHTML=choices(targets,selected,'Choose original target…');
 for(const name of ['targetId','targetManual']){form.elements[name].closest('label').hidden=!needsTarget;form.elements[name].disabled=busy()||!needsTarget;}
 form.elements.accountAmount.closest('label').hidden=!needsValue;form.elements.accountAmount.required=needsValue;form.elements.accountAmount.disabled=busy()||!needsValue;
 const descriptions={
  ACCEPT_DISTINCT:'Keep this source row as its own transaction after reviewing any similar retained rows.',
  LINK_DUPLICATE:'Select the already-retained transaction represented by this source copy. Both original source records remain available.',
  APPLY_CORRECTION:'Select the original transaction targeted by this bank replacement or deletion. Undo an active match and reopen any affected close through their original controls first.',
  VALUE:'Enter the actual amount posted in the selected bank account currency and explain the original conversion evidence.',
  EXCLUDE:'Retain this source row with its reason for exclusion from posted accounting.'
 };
 $('#resolve-help').textContent=descriptions[action]||'Choose a source decision.';
}
async function chooseInvoice(id){
 const generation=++ctx.invoiceLoad,detailGeneration=ctx.detailLoad,transactionId=ctx.detail?.transaction.id,form=$('#receipt-form'),customerId=form?.elements.customerId.value;
 ctx.invoiceDetail=null;
 const target=$('#selected-invoice');if(!target)return;
 if(!id){target.textContent='';return;}
 target.textContent='Reading original issued invoice…';
 const result=await ctx.receivables.detail(id);
 if(generation!==ctx.invoiceLoad||detailGeneration!==ctx.detailLoad||transactionId!==ctx.detail?.transaction.id||!target.isConnected||form!==$('#receipt-form')||form.elements.invoiceId.value!==id||form.elements.customerId.value!==customerId)return;
 ctx.invoiceDetail=result;
 const data=invoiceInfo(result);
 target.innerHTML='<p class="mt10"><strong>'+esc(data.number)+'</strong> · '+esc(data.status)+' · issued '+esc(data.issueDate)+' · current balance '+esc(data.amountDue??'see invoice')+'</p><a href="'+esc(ctx.receivables.baseUrl+'/documents/'+encodeURIComponent(id)+'/files/invoice.html')+'" target="_blank" rel="noopener">Download original invoice</a>';
 if(!form.elements.allocationAmount.value&&data.amountDue!==null){
  try{const scale=transactionAccount().currency.scale,due=minor(data.amountDue,scale),gross=minor(form.elements.grossAmount.value,scale);form.elements.allocationAmount.value=money(due<gross?due:gross,scale);}catch{}
 }
 if(data.issueDate&&form.elements.allocatedDate.value<data.issueDate)form.elements.allocatedDate.value=data.issueDate;
 saveDetailDraft();
}

async function submitMatch(form){
 const parts=readParts().map(part=>{
  const groups=receiptCoverageChoices(part),selected=groups.find(group=>group.key===part.coverageKey);
  if(part.kind==='RECEIPT'&&((groups.length>1&&!selected)||(part.coverageKey&&!selected)))throw new Error('Choose the exact original payment coverage for each shared receipt.');
  return {kind:part.kind,amount:part.amount,note:part.note||'',reference:part.reference||'',ledgerCode:part.ledgerCode||'',
   ...(part.kind==='RECEIPT'?{receiptId:part.targetId,...(selected?{coverageKey:selected.key}:{})}:part.kind==='REFUND'?{refundId:part.targetId}:{})};
 });
 const totals=postingDifference();if(totals.difference!==0n)throw new Error('Posting parts differ from the signed bank amount by '+money(totals.difference,totals.scale)+'.');
 await mutate('/transactions/'+encodeURIComponent(ctx.detail.transaction.id)+'/match',{parts,reason:form.elements.reason.value},'Bank transaction match');
}

async function submitReceipt(form){
 const values=formObject(form),scale=transactionAccount().currency.scale,gross=minor(values.grossAmount,scale),fee=minor(values.feeAmount||'0',scale),expected=minor(ctx.detail.transaction.valuation?.amount??ctx.detail.transaction.amount,scale);
 if(gross<=0n||fee<0n||gross-fee!==expected)throw new Error('Gross payment less the positive fee must equal the bank credit exactly.');
 const body={customerId:values.customerId,grossAmount:values.grossAmount,feeAmount:values.feeAmount||'0',reference:values.reference,note:values.note,reason:values.reason};
 if(values.invoiceId){
  if(!values.allocationAmount||!values.allocatedDate)throw new Error('Enter the original invoice allocation amount and date.');
  body.invoiceId=values.invoiceId;body.allocationAmount=values.allocationAmount;body.allocatedDate=values.allocatedDate;
 }
 await mutate('/transactions/'+encodeURIComponent(ctx.detail.transaction.id)+'/receipt',body,'Customer payment and bank match');
}
async function submitResolution(form){
 const values=formObject(form),body={action:values.action,reason:values.reason};
 if(!sourceDecisionActions(ctx.detail.transaction,ctx.detail.account).some(item=>item.value===body.action)||ctx.detail.transaction.closed||ctx.detail.transaction.match)throw new Error('Open the current transaction and complete its existing match or close correction before recording this source decision.');
 if(['LINK_DUPLICATE','APPLY_CORRECTION'].includes(body.action)){
  body.targetId=values.targetManual?.trim()||values.targetId;
  if(!body.targetId)throw new Error('Select the original transaction target.');
 }
 if(body.action==='VALUE')body.accountAmount=values.accountAmount;
 await mutate('/transactions/'+encodeURIComponent(ctx.detail.transaction.id)+'/resolve',body,'Bank source decision');
}
async function openSourceRow(importId,rowId){
 const generation=beginRecordRead('Original bank source row'),requested=await ctx.client.importDetail(importId);
 if(!currentRecordRead(generation))return;
 let returned=requested,row=null;const visited=new Set();
 while(returned&&!visited.has(returned.import.id)){
  visited.add(returned.import.id);
  if(returned.import.file.sha256!==requested.import.file.sha256)throw new Error('An interpretation predecessor does not retain these same original file bytes.');
  for(const statement of returned.report.statements||[]){row=originalStatementRows(statement).find(value=>value.id===rowId);if(row)break;}
  if(row||!returned.import.supersedesImportId)break;
  returned=await ctx.client.importDetail(returned.import.supersedesImportId);
  if(!currentRecordRead(generation))return;
 }
 if(!row)throw new Error('The retained original interpretation reports do not contain this exact source row.');
 const originalImportId=returned.import.id,prior=originalImportId!==importId;
 ctx.record={kind:'source-row',id:importId,sourceImportId:originalImportId,data:returned,row};
 $('#record-title').textContent='Original bank source row';
 $('#record-body').innerHTML='<section class="panel"><h3>'+esc(returned.import.file.name)+'</h3><p class="small mono">'+esc(returned.import.file.sha256)+'</p>'+
  (prior?'<p class="source-note small">This row was removed or reclassified by a later interpretation. These are its retained fields from the earlier interpretation of the same original bytes.</p><div class="actions mt12"><button type="button" data-action="open-import" data-id="'+esc(importId)+'">Current interpretation</button><button type="button" data-action="open-import" data-id="'+esc(originalImportId)+'">Original row interpretation</button></div>':'')+
  '<div class="actions mt12"><button type="button" data-action="import-file" data-id="'+esc(originalImportId)+'" data-file="original">Download original file</button><button type="button" data-action="import-file" data-id="'+esc(originalImportId)+'" data-file="parsed.json">Download complete parsed file</button></div><dl class="key-values"><dt>Source pointer</dt><dd class="mono">'+esc(row.source.pointer)+'</dd><dt>Record / lines</dt><dd>'+esc(row.source.recordNumber)+' · '+esc(row.source.lineStart)+'–'+esc(row.source.lineEnd)+'</dd><dt>Original bytes</dt><dd>'+esc(row.source.byteStart)+'–'+esc(row.source.byteEnd)+'</dd><dt>Original amount</dt><dd>'+esc(row.amountRaw)+' · '+esc(row.currency)+'</dd></dl>'+camtEntryHtml(row)+'<h3>Exact decoded source record</h3><pre>'+esc(row.source.raw)+'</pre>'+issuesHtml(row.issues)+'<details><summary>Complete original fields</summary><pre>'+esc(json(row.original))+'</pre></details></section>';
}
async function openImport(id){
 const generation=beginRecordRead('Retained bank statement'),returned=await ctx.client.importDetail(id);
 if(!currentRecordRead(generation))return;
 ctx.record={kind:'import',id,data:returned,page:0,statementId:returned.import.statementId||returned.report.statements?.[0]?.id};
 renderImportRecord();
}

function renderImportRecord(){
 const {id,data,page,statementId}=ctx.record,report=data.report,selected=report.statements.find(x=>x.id===statementId)||report.statements[0],all=originalStatementRows(selected),items=all.slice(page*50,(page+1)*50);
 $('#record-title').textContent='Retained statement · '+data.import.file.name;
 $('#record-body').innerHTML='<section class="panel"><div class="section-heading"><div><h3>'+esc(data.import.file.name)+'</h3><p class="mono">'+esc(data.import.file.sha256)+'</p></div><div class="actions"><button type="button" data-action="import-file" data-id="'+esc(id)+'" data-file="original">Original file</button><button type="button" data-action="import-file" data-id="'+esc(id)+'" data-file="parsed.json">Complete parsed file</button></div></div>'+
 selectField('Original statement section','record-statement',report.statements.map(x=>({value:x.id,label:x.account.accountId+' · '+x.account.currency+' · '+x.kind})),selected?.id||'',null)+
 issuesHtml(report.issues)+issuesHtml(selected?.issues)+camtStatementHtml(report,selected)+
 '<div class="table-wrap mt14"><table><thead><tr><th>Record</th><th>Date</th><th>Payee</th><th class="amount">Original amount</th><th>Status / source</th></tr></thead><tbody>'+items.map(row=>'<tr><td>'+esc(row.source.recordNumber)+'</td><td>'+esc(row.postedDate)+'</td><td>'+esc(row.payee||row.memo)+'</td><td class="amount">'+esc(row.amount)+' '+esc(row.currency)+'</td><td>'+badge(row.status)+camtEntrySummary(row)+' <button type="button" class="small" data-action="open-source-row" data-id="'+esc(id)+'" data-row="'+esc(row.id)+'">Original row</button>'+issuesHtml(row.issues)+'</td></tr>').join('')+(items.length?'':'<tr><td colspan="5" class="empty">This original section contains no transaction records.</td></tr>')+'</tbody></table></div>'+pagerHtml('import-record-page',page,all.length,50)+
 '<details><summary>Original balances and source interpretation</summary><pre>'+esc(json({period:selected?.period,balances:selected?.balances,interpretation:report.interpretation,csv:report.csv?{...report.csv,preamble:report.csv.preamble?.map(x=>({source:x.source,cells:x.cells}))}:undefined,native:report.native,camt:report.camt?{...report.camt,sourceTree:undefined}:undefined,camtStatement:selected?.camt}))+'</pre></details></section>';
}

function closingSources(accountId=ctx.accountId){
 const sources=(ctx.state?.imports||[]).filter(item=>item.accountId===accountId).flatMap(item=>(item.balances?.closing||[]).filter(row=>row.eligible&&row.opening&&row.closing).map(row=>({
  value:JSON.stringify({importId:item.id,id:row.id}),
  label:(row.from||'?')+' to '+(row.until||'?')+' · '+row.opening.amount+' → '+row.closing.amount+' '+row.currency+' · '+item.file.name,
  source:row,import:item
 })));
 const assembly=ctx.assemblyPreview;
 if(assembly?.eligible&&assembly.accountId===accountId&&ctx.assemblySignature===assemblySignature())sources.push({
  value:JSON.stringify(assembly.sourceClosing),label:assembly.period.from+' to '+assembly.period.until+' · '+assembly.pages.length+
   ' original pages · '+assembly.closing.opening.amount+' → '+assembly.closing.closing.amount+' '+assembly.currency.code,
  source:assembly.closing,assembly});
 return sources;
}
function selectedPageImports(){
 try{const ids=JSON.parse(ctx.closeDraft.pageImportIds||'[]');return Array.isArray(ids)?[...new Set(ids.filter(id=>typeof id==='string'))]:[];}catch{return [];}
}
function assemblyInput(){return {accountId:ctx.accountId,importIds:selectedPageImports(),groupingNote:ctx.closeDraft.groupingNote||'',summaryScope:ctx.closeDraft.summaryScope||'STATEMENT'};}
function assemblySignature(){
 const input=assemblyInput(),selected=new Set(input.importIds),imports=ctx.state?.imports||[];
 return JSON.stringify({input,sources:input.importIds.map(id=>{
  const row=imports.find(item=>item.id===id);
  return {id,reviewSha256:row?.reviewSha256??null,statementId:row?.statementId??null,fileSha256:row?.file?.sha256??null,
   successors:imports.filter(item=>item.supersedesImportId===id).map(item=>({id:item.id,reviewSha256:item.reviewSha256})).sort((a,b)=>a.id.localeCompare(b.id))};
 })});
}
function captureAssemblyDraft(){
 const form=$('#assembly-form');
 if(form){ctx.closeDraft.groupingNote=form.elements.groupingNote.value;ctx.closeDraft.summaryScope=form.elements.summaryScope.value;}
 writeSmall('close-draft:'+ctx.accountId,ctx.closeDraft);
}
function invalidateAssembly(){
 ctx.assemblyPreview=null;ctx.assemblySignature=null;ctx.assemblyLoad++;
 invalidateClosePreview();
 const output=$('#assembly-review');if(output)output.innerHTML='';
}
function assemblyReviewHtml(report){
 if(!report)return '';
 const pages=report.pages||[],shown=pages.slice((ctx.assemblyReviewPage||0)*25,((ctx.assemblyReviewPage||0)+1)*25);
 return '<section class="source-note mt16"><h3>Complete statement page review</h3><p>'+badge(report.eligible?'READY':'REVIEW REQUIRED')+
  ' · '+esc(report.entryCount)+' original entries · '+esc(report.bookedCount)+' booked · '+esc(report.bookedNet)+' '+esc(report.currency.code)+
  '</p>'+issuesHtml(report.issues)+
  '<div class="table-wrap"><table><thead><tr><th>Page</th><th>Original file / statement</th><th>Opening boundary</th><th>Booked movement</th><th>Closing boundary</th></tr></thead><tbody>'+
  shown.map(page=>'<tr><td>'+esc(page.pagination?.page)+(page.pagination?.last?' · final':'')+'</td><td><button type="button" class="small" data-action="open-import" data-id="'+esc(page.importId)+'">'+
   esc(page.file.name)+'</button><br>'+esc(page.originalStatementId)+'</td><td class="amount">'+esc(page.opening?.amount??'Review')+'</td><td class="amount">'+
   esc(page.bookedNet)+'</td><td class="amount">'+esc(page.closing?.amount??'Review')+'</td></tr>').join('')+'</tbody></table></div>'+
  pagerHtml('assembly-review-page',ctx.assemblyReviewPage||0,pages.length,25)+
  '<p class="small">Original grouping: '+esc(report.grouping.basis.replaceAll('_',' '))+'. Summary scope: '+esc(report.selection.summaryScope)+
  '. Every boundary and summary remains available in the complete review.</p><div class="actions">'+
  (report.eligible?'<button type="button" data-action="use-assembly">Use these original statement balances</button>':'')+
  '<button type="button" data-action="download-assembly">Download complete page review</button></div></section>';
}
function renderAssembly(){
 const all=ctx.state?.imports||[],successors=new Map();
 for(const item of all)if(item.supersedesImportId)successors.set(item.supersedesImportId,item.id);
 const imports=all.filter(item=>item.accountId===ctx.accountId&&item.format==='CAMT053');
 if(!imports.length)return '';
 const selected=new Set(selectedPageImports()),page=ctx.assemblyPage||0,items=imports.slice(page*25,(page+1)*25);
 return '<section class="panel"><h2>Combine original statement pages</h2><p class="small muted">Receive each original page through Import, then select its saved statement section here. Review the complete page sequence, original balance boundaries and transaction summary before using the final statement balances.</p>'+
  '<form id="assembly-form" class="stack"><div class="table-wrap"><table><thead><tr><th>Select</th><th>Original file / statement</th><th>Page</th><th>Original period</th><th>Sequence</th></tr></thead><tbody>'+
  items.map(item=>'<tr><td><label><input type="checkbox" data-page-import="'+esc(item.id)+'"'+(selected.has(item.id)?' checked':'')+
   (successors.has(item.id)&&!selected.has(item.id)?' disabled':'')+' aria-label="Select original '+esc(item.file.name)+'"></label></td><td>'+esc(item.file.name)+'<br>'+esc(item.camt?.statementId||item.statementId)+
   '<p class="small">'+(successors.has(item.id)?'Superseded by '+esc(successors.get(item.id)):'Current interpretation')+'</p><p class="small mono">'+esc(item.reviewSha256)+'</p>'+
   '</td><td>'+esc(item.camt?.pagination?.page??'Unspecified')+(item.camt?.pagination?.last?' · final':'')+'</td><td>'+esc(item.period?.from||'Unspecified')+
   ' to '+esc(item.period?.until||'Unspecified')+'</td><td>'+esc(item.camt?.sequences?.electronic||item.camt?.sequences?.legal||'Unspecified')+'</td></tr>').join('')+
  '</tbody></table></div>'+pagerHtml('assembly-import-page',page,imports.length,25)+'<p class="small">'+selected.size+' original page imports selected across all pages.</p>'+
  '<div class="grid two">'+selectField('Original transaction-summary scope','summaryScope',[{value:'STATEMENT',label:'Complete statement (first-page summary)'},{value:'PAGE',label:'Separate original summary for each page'}],ctx.closeDraft.summaryScope||'STATEMENT',null)+
  area('Original bank grouping and summary convention','groupingNote',ctx.closeDraft.groupingNote||'','maxlength="4000"')+'</div>'+
  '<p class="small muted">Explain the original bank convention when statement identifiers change without a common sequence, or when its summaries cover separate pages.</p>'+
  '<div class="actions"><button type="button" data-action="preview-assembly" id="preview-assembly-button">Review selected original pages</button>'+
  '<button type="button" data-action="clear-assembly">Clear page selection</button></div></form><div id="assembly-review">'+
  assemblyReviewHtml(ctx.assemblyPreview)+'</div></section>';
}
async function previewAssembly(){
 captureCloseDraft();captureAssemblyDraft();
 const input=assemblyInput(),signature=assemblySignature(),generation=++ctx.assemblyLoad,button=$('#preview-assembly-button');
 ctx.assemblySignature=signature;
 if(!input.importIds.length)throw new Error('Select the retained original pages for this account statement.');
 if(button){button.disabled=true;button.textContent='Reading original statement pages…';}
 try {
  const report=await ctx.client.previewAssembly(input);
  if(generation!==ctx.assemblyLoad||signature!==assemblySignature())return;
  if(!report?.id||!Array.isArray(report.pages)||!Array.isArray(report.issues))throw new Error('The original page review is incomplete.');
  ctx.assemblyPreview=report;ctx.assemblySignature=signature;ctx.assemblyReviewPage=0;invalidateClosePreview();renderClose();
 } finally{if(button?.isConnected){button.disabled=false;button.textContent='Review selected original pages';}}
}
function captureCloseDraft(){
 const form=$('#close-form');if(!form)return ctx.closeDraft;
 for(const key of Object.keys(ctx.closeDraft)){const control=form.elements.namedItem(key);if(control)ctx.closeDraft[key]=control.value;}
 writeSmall('close-draft:'+ctx.accountId,ctx.closeDraft);return ctx.closeDraft;
}
function invalidateClosePreview(){
 ctx.closePreview=null;ctx.closePreviewRevision=null;ctx.closePreviewInput=null;ctx.closePage=0;ctx.closeProblemPage=0;ctx.closePendingPage=0;
 const node=$('#close-preview');if(node)node.innerHTML='';
}
function closeInput(){
 const account=chosenAccount();if(!account)throw new Error('Select the bank account to close.');
 const draft=captureCloseDraft(),input={accountId:account.id,from:draft.from,until:draft.until,openingBalance:draft.openingBalance,closingBalance:draft.closingBalance,balanceNote:draft.balanceNote};
 if(draft.sourceClosing)input.sourceClosing=JSON.parse(draft.sourceClosing);
 if(input.sourceClosing?.kind==='CAMT_PAGE_ASSEMBLY'&&
  (ctx.assemblyPreview?.id!==input.sourceClosing.id||ctx.assemblySignature!==assemblySignature()))
   throw new Error('Review these retained original pages again before reviewing the complete reconciliation.');
 if(draft.periodCloseId)input.periodCloseId=draft.periodCloseId;
 if(!input.from||!input.until||input.from>input.until)throw new Error('Enter an ordered statement period.');
 minor(input.openingBalance,account.currency.scale);minor(input.closingBalance,account.currency.scale);
 if(!input.sourceClosing&&!input.balanceNote.trim())throw new Error('Describe the original statement supplying the period and opening/closing balances.');
 return input;
}
function chooseClosingSource(value){
 captureCloseDraft();ctx.closeDraft.sourceClosing=value;
 const source=closingSources().find(x=>x.value===value)?.source;
 if(source){ctx.closeDraft.from=source.from;ctx.closeDraft.until=source.until;ctx.closeDraft.openingBalance=source.opening.amount;ctx.closeDraft.closingBalance=source.closing.amount;}
 writeSmall('close-draft:'+ctx.accountId,ctx.closeDraft);invalidateClosePreview();renderClose();
}
function renderClose(){
 const account=chosenAccount();
 if(!account){$('#view-close').innerHTML='<section class="panel"><h2>Close a bank statement</h2><p class="empty">Select a bank account above to review a complete statement period and its original balances.</p></section>';return;}
 const d=ctx.closeDraft,sources=closingSources(),pinned=sources.find(x=>x.value===d.sourceClosing);
 if(d.sourceClosing&&!pinned){
  let saved;try{saved=JSON.parse(d.sourceClosing);}catch{}
  if(saved?.kind==='CAMT_PAGE_ASSEMBLY')sources.push({value:d.sourceClosing,label:'Saved original page selection — review selected pages again'});
  else d.sourceClosing='';
 }
 const periods=(ctx.state.periodCloses||[]).map(row=>({value:row.id,label:(row.name||row.period?.label||row.id)+' · '+(row.from||row.period?.from||'')+' to '+(row.until||row.period?.until||'')}));
 const readonly=pinned?' readonly':'';
 $('#view-close').innerHTML=renderAssembly()+'<section class="panel"><div class="section-heading"><div><h2>Close statement · '+esc(account.name)+'</h2><p class="small muted">Compare the bank’s opening and closing balances with every posted transaction and its receipt, refund or accounting classification.</p></div><button type="button" data-tab="transactions">Review transactions</button></div>'+
 '<form id="close-form" class="stack">'+selectField('Balance source','sourceClosing',sources,d.sourceClosing,'Enter balances from an original statement')+
 '<p class="small muted">'+(pinned?'Dates and balances are bound to the selected original closing record.':'Enter the bank’s complete statement dates and balances. Download coverage or the earliest/latest transaction date alone does not establish a complete statement period.')+'</p>'+
 '<div class="grid four">'+field('First statement date','from',d.from,'date','required'+readonly)+field('Last statement date','until',d.until,'date','required'+readonly)+field('Opening balance · '+account.currency.code,'openingBalance',d.openingBalance,'text','required inputmode="decimal"'+readonly)+field('Closing balance · '+account.currency.code,'closingBalance',d.closingBalance,'text','required inputmode="decimal"'+readonly)+'</div>'+
 area('Original balance source and period note','balanceNote',d.balanceNote,'maxlength="4000" '+(pinned?'':'required'))+
 '<div class="grid two">'+selectField('Associated accounting period close','periodCloseId',periods,d.periodCloseId,'No accounting-period association')+field('Reconciliation name','name',d.name,'text','maxlength="160" placeholder="October bank reconciliation"')+'</div>'+
 area('Reconciliation note','note',d.note,'maxlength="4000"')+
 '<div class="actions"><button type="submit" class="primary" id="preview-close-button">Review complete reconciliation</button><button type="button" data-action="download-close-draft">Download working inputs</button><label class="file-label">Restore inputs<input type="file" id="restore-close-draft" accept=".json,application/json"></label></div></form></section><div id="close-preview"></div>';
 if(ctx.closePreview)renderClosePreview();lockForms();
}
async function previewClose(){
 const input=closeInput(),accountId=ctx.accountId,signature=JSON.stringify(input),button=$('#preview-close-button');
 button.disabled=true;button.textContent='Reviewing original transactions…';
 try{
  const response=await ctx.client.previewClose(input),report=previewValue(response);
  if(accountId!==ctx.accountId||signature!==JSON.stringify(closeInput()))return;
  if(!report?.reviewSha256||!Array.isArray(report.transactions)||!Array.isArray(report.problems))throw new Error('The reconciliation preview returned an incomplete report.');
  ctx.closePreview=report;ctx.closePreviewRevision=response.revision??ctx.state.revision;ctx.closePreviewInput=structuredClone(input);
  ctx.closePage=0;ctx.closeProblemPage=0;ctx.closePendingPage=0;renderClosePreview();
 }finally{if(button.isConnected){button.disabled=false;button.textContent='Review complete reconciliation';}}
}
function reportMetrics(report){
 return '<div class="metrics reconciliation-metrics">'+[['Opening balance',report.openingBalance],['Posted credits',report.incoming],['Posted debits',report.outgoing],['Calculated closing',report.calculatedClosing],['Bank closing',report.closingBalance],['Difference',report.difference]].map(([label,value])=>'<div class="metric"><p class="small muted">'+esc(label)+'</p><p class="value amount">'+esc(value)+'</p></div>').join('')+'</div>';
}
function reportTransactionTable(report,page,action){
 const all=report.transactions||[],items=all.slice(page*50,(page+1)*50);
 return '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Payee / reference</th><th class="amount">Account amount</th><th>Source / matching</th><th>Original ID</th><th></th></tr></thead><tbody>'+items.map(row=>transactionRow({...row,match:(report.matches||[]).find(x=>x.transactionId===row.id)||null})).join('')+(items.length?'':'<tr><td colspan="6" class="empty">No retained transactions in this period.</td></tr>')+'</tbody></table></div>'+pagerHtml(action,page,all.length,50);
}
function reportPendingTable(report,page,action){
 const all=report.pending||[],items=all.slice(page*50,(page+1)*50);
 return '<div class="table-wrap"><table><thead><tr><th>Reported date</th><th>Payee / memo</th><th class="amount">Original amount</th><th>Source</th></tr></thead><tbody>'+items.map(row=>'<tr><td>'+esc(row.postedDate||'Date unavailable')+'</td><td>'+esc(row.payee||row.memo)+'</td><td class="amount">'+esc(row.amount)+' '+esc(row.currency)+'</td><td><button type="button" class="small" data-action="open-source-row" data-id="'+esc(row.importId)+'" data-row="'+esc(row.id)+'">Original pending row</button></td></tr>').join('')+(items.length?'':'<tr><td colspan="4" class="empty">No retained pending records in this period.</td></tr>')+'</tbody></table></div>'+pagerHtml(action,page,all.length,50);
}
function reportSources(report){
 return '<details><summary>Original statement files and balance basis</summary><dl class="key-values"><dt>Balance basis</dt><dd>'+esc(report.balanceBasis?.replaceAll('_',' '))+'</dd><dt>Balance source note</dt><dd>'+esc(report.balanceNote)+'</dd><dt>Prior close</dt><dd>'+esc(report.priorCloseId||'None')+'</dd><dt>Accounting period</dt><dd>'+esc(report.periodClose?.name||report.periodClose?.id||'None')+'</dd><dt>Review SHA256</dt><dd class="mono">'+esc(report.reviewSha256)+'</dd></dl>'+
 '<div class="table-wrap"><table><thead><tr><th>Source file</th><th>SHA256</th><th>Original records</th><th></th></tr></thead><tbody>'+(report.imports||[]).map(item=>'<tr><td>'+esc(item.file?.name||item.id)+'</td><td class="mono">'+esc(item.file?.sha256)+'</td><td>'+esc(item.rowCount)+' posted / '+esc(item.pendingCount)+' pending</td><td><button type="button" class="small" data-action="open-import" data-id="'+esc(item.id)+'">Open original</button></td></tr>').join('')+'</tbody></table></div>'+(report.sourceClosing?'<pre>'+esc(json(report.sourceClosing))+'</pre>':'')+'</details>';
}
function renderClosePreview(){
 const report=ctx.closePreview,node=$('#close-preview');if(!node||!report)return;
 const problems=report.problems||[],page=ctx.closeProblemPage||0,shown=problems.slice(page*50,(page+1)*50);
 node.innerHTML='<section class="panel"><div class="section-heading"><div><h2>Reconciliation review</h2><p class="small">'+esc(report.from)+' through '+esc(report.until)+' · '+esc(report.currency.code)+' · '+badge(report.ready?'READY':'REVIEW REQUIRED')+'</p></div><button type="button" data-action="download-close-preview">Download complete review</button></div>'+reportMetrics(report)+
 (problems.length?'<h3>Items to resolve</h3><div class="issue-list">'+shown.map(item=>'<div class="issue"><strong>'+esc(item.code)+'</strong>'+esc(item.message)+(item.amount?'<p class="amount">'+esc(item.amount)+'</p>':'')+(item.transactionId?'<div class="actions"><button type="button" class="small" data-action="open-transaction" data-id="'+esc(item.transactionId)+'">Review transaction</button></div>':'')+(item.closeId?'<div class="actions"><button type="button" class="small" data-action="open-close" data-id="'+esc(item.closeId)+'">Review prior close</button></div>':'')+(item.closeIds||[]).map(id=>'<button type="button" class="small" data-action="open-close" data-id="'+esc(id)+'">Review overlapping close</button>').join('')+'</div>').join('')+'</div>'+pagerHtml('close-problem-page',page,problems.length,50):'<p class="source-note">The current original transactions are matched and the stated balances reconcile exactly.</p>')+
 '<h3 class="mt18">All statement transactions</h3>'+reportTransactionTable(report,ctx.closePage,'close-transaction-page')+
 '<details><summary>Pending bank records ('+(report.pending||[]).length+')</summary><p class="small muted">These original pending entries are retained separately from posted cash.</p>'+reportPendingTable(report,ctx.closePendingPage||0,'close-pending-page')+'</details>'+
 reportSources(report)+
 '<form id="retain-close-form" class="stack mt18"><fieldset data-mutation-fields data-unavailable="'+(!report.ready)+'" '+(!report.ready?'disabled':'')+'><label class="check-line"><input type="checkbox" name="reviewed" required><span>I reviewed the original period, balance source, all transaction decisions and reconciliation totals.</span></label><button type="submit" class="primary mt12" data-mutation data-unavailable="'+(!report.ready)+'" '+(!report.ready?'disabled':'')+'>Record statement close</button></fieldset><p class="small muted">The close keeps its exact reconciliation and source files. Reopening records a reason and leaves the saved close available.</p></form></section>';
 lockForms();
}
async function retainClose(form){
 if(!form.elements.reviewed.checked)throw new Error('Review the reconciliation before recording its close.');
 if(!ctx.closePreview?.ready||!ctx.closePreviewInput)throw new Error('Complete a ready reconciliation review first.');
 const current=closeInput();if(JSON.stringify(current)!==JSON.stringify(ctx.closePreviewInput))throw new Error('Statement inputs changed. Review this complete reconciliation again.');
 const result=await mutate('/closes',{...ctx.closePreviewInput,reviewSha256:ctx.closePreview.reviewSha256,name:ctx.closeDraft.name,note:ctx.closeDraft.note},'Bank statement close');
 invalidateClosePreview();
 if(result?.close?.id)await openClose(result.close.id);
 renderClose();
}
const CLOSE_FILES=['reconciliation.html','transactions.csv','posting-parts.csv','editable-reconciliation.json','reconciliation.json','manifest.json','account.tar'];
async function openClose(id){
 const generation=beginRecordRead('Saved bank reconciliation'),data=await ctx.client.closeDetail(id);
 if(!currentRecordRead(generation))return;
 if(!data?.close||!data.report)throw new Error('The saved reconciliation returned an incomplete original report.');
 ctx.record={kind:'close',id,data,page:0,pendingPage:0,changesPage:0,problemsPage:0};
 renderClosedRecord();
}

function renderClosedRecord(){
 const {id,data,page,pendingPage=0,changesPage=0,problemsPage=0}=ctx.record,report=data.report,closed=data.close,reopening=data.reopening;
 const currentProblems=data.currentProblems||[],problemRows=currentProblems.slice(problemsPage*50,(problemsPage+1)*50);
 const changed=[...(data.changedTransactionIds||[]).map(id=>({id,kind:'Changed original transaction'})),...(data.newTransactionIds||[]).map(id=>({id,kind:'Later source row inside this saved period'}))],shown=changed.slice(changesPage*50,(changesPage+1)*50);
 $('#record-title').textContent=closed.name||'Saved bank reconciliation';
 $('#record-body').innerHTML='<section class="panel"><div class="section-heading"><div><h3>'+esc(report.account.name)+'</h3><p>'+esc(report.from)+' through '+esc(report.until)+' · '+esc(report.currency.code)+' · '+badge(reopening?'REOPENED':'CLOSED')+'</p><p class="small muted">'+esc(formatDate(closed.createdAt||closed.closedAt))+' · '+esc(closed.actor||'')+'</p></div></div>'+
 reportMetrics(report)+'<p>'+esc(closed.note)+'</p><h3>Complete saved exports</h3><div class="actions mt12">'+CLOSE_FILES.map(name=>'<button type="button" class="small" data-action="close-file" data-id="'+esc(id)+'" data-file="'+name+'">'+esc(name)+'</button>').join('')+'</div>'+
 (currentProblems.length?'<section class="source-note mt16"><h3>Current accounting review</h3><p class="small">The current receipt, refund and transaction state differs from this saved close. The original close remains available below.</p>'+(data.currentDifference!==undefined?'<p class="amount">Current balance difference: '+esc(data.currentDifference)+' '+esc(report.currency.code)+'</p>':'')+'<div class="issue-list">'+problemRows.map(problem=>'<div class="issue"><strong>'+esc(problem.code)+'</strong>'+esc(problem.message)+(problem.transactionId?'<div class="actions"><button type="button" class="small" data-action="open-transaction" data-id="'+esc(problem.transactionId)+'">Review current transaction</button></div>':'')+(problem.receiptId?'<p class="mono">Original receipt '+esc(problem.receiptId)+'</p>':'')+(problem.refundId?'<p class="mono">Original refund '+esc(problem.refundId)+'</p>':'')+'</div>').join('')+'</div>'+pagerHtml('closed-problems-page',problemsPage,currentProblems.length,50)+'</section>':'')+
 (changed.length?'<section class="source-note mt16"><h3>Changes since this original close</h3><p class="small">The saved report below remains the original edition. Open the current source rows to review later changes.</p><div class="table-wrap"><table><thead><tr><th>Change</th><th>Transaction</th><th></th></tr></thead><tbody>'+shown.map(x=>'<tr><td>'+esc(x.kind)+'</td><td class="mono">'+esc(x.id)+'</td><td><button type="button" class="small" data-action="open-transaction" data-id="'+esc(x.id)+'">Open current</button></td></tr>').join('')+'</tbody></table></div>'+pagerHtml('closed-changes-page',changesPage,changed.length,50)+'</section>':'')+
 '<h3 class="mt18">Original closed transactions</h3>'+reportTransactionTable(report,page,'closed-transaction-page')+
 '<details><summary>Original pending bank records ('+(report.pending||[]).length+')</summary>'+reportPendingTable(report,pendingPage,'closed-pending-page')+'</details>'+reportSources(report)+
 (reopening?'<section class="source-note mt16"><h3>Reopening</h3><p>'+esc(reopening.reason)+'</p><p class="small">'+esc(reopening.actor)+' · '+esc(formatDate(reopening.createdAt||reopening.at))+'</p></section>':
 '<form id="reopen-close-form" data-id="'+esc(id)+'" class="stack mt18"><h3>Reopen this statement</h3>'+area('Reason for reopening','reason','','required maxlength="4000"')+'<button type="submit" data-mutation>Record reopening</button></form>')+
 '<details><summary>Saved close identity</summary><pre>'+esc(json({close:closed,reopening,revision:data.revision}))+'</pre></details></section>';
 lockForms();
}
async function restoreCloseFile(file){
 const data=JSON.parse(await file.text());
 if(data?.schema!=='stellar-forge.bank-close-working-inputs.v1'||data.workspaceId!==ctx.state.workspaceId||data.accountId!==ctx.accountId||!data.inputs)throw new Error('Choose a working-input file for this original bank account and workspace.');
 for(const key of Object.keys(ctx.closeDraft))ctx.closeDraft[key]=String(data.inputs[key]??'');
 writeSmall('close-draft:'+ctx.accountId,ctx.closeDraft);invalidateAssembly();renderClose();notice('Original working reconciliation inputs restored. Review the retained pages again when using a page assembly.');
}
async function restoreSourceFile(file){
 captureMapping();await sourceCollections?.flush();sourceCollections?.detach();
 const generation=++ctx.sourceFileLoad;captureMapping();resetSourcePreview();
 ctx.sourceFileLoading=true;ctx.sourceLoadingName=file.name;renderSourceFile();
 try{
  const data=JSON.parse(await file.text());
  if(data?.schema!=='stellar-forge.bank-source-working-inputs.v1'||!data.file?.name||typeof data.file.dataBase64!=='string'||!data.mapping)throw new Error('Choose a complete bank source working-input file.');
  const bytes=originalBytes(data.file);if(bytes.length>(ctx.config.sourceBytes||16000000))throw new Error('The complete original statement exceeds this workspace’s source limit.');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(data.file.sha256&&data.file.sha256!==digest)throw new Error('The original file bytes do not match the retained working-input identity.');
  if(generation!==ctx.sourceFileLoad)return;
  const saved={...data.file,bytes:bytes.length,sha256:digest},mapping={...defaultMapping(),...data.mapping,columns:{...defaultMapping().columns,...data.mapping.columns}};
  await dbWrite(storageKey('source-file'),saved);
  if(generation!==ctx.sourceFileLoad)return;
  ctx.sourceFile=saved;ctx.sourceMapping=mapping;writeSmall('source-mapping',mapping);
  if(generation===ctx.sourceFileLoad)notice('Complete original bank source and its mapping restored. Review the source before retaining an import.');
 }catch(error){if(generation===ctx.sourceFileLoad)throw error;}
 finally{if(generation===ctx.sourceFileLoad){ctx.sourceFileLoading=false;ctx.sourceLoadingName='';renderImport();}}
}

async function selectAccount(id){
 if(ctx.accountId===id)return;
 captureCloseDraft();saveDetailDraft();ctx.accountId=id;writeSmall('account-id',id);
 $('#account-picker').value=id;
 ctx.closeDraft={from:'',until:'',openingBalance:'',closingBalance:'',balanceNote:'',sourceClosing:'',periodCloseId:'',name:'',note:'',pageImportIds:'[]',groupingNote:'',summaryScope:'STATEMENT',...readSmall('close-draft:'+id,{})};
 invalidateAssembly();ctx.assemblyPage=0;
 invalidateClosePreview();ctx.overviewPage=0;ctx.closeListPage=0;ctx.tx.offset=0;
 closeTransactionDialog();closeRecordDialog();
 renderOverview();if(ctx.tab==='transactions')await loadTransactions(0);if(ctx.tab==='close')renderClose();
}
async function setTab(tab){
 if(!['overview','collection','import','transactions','close'].includes(tab))return;
 if(ctx.tab==='import'){captureMapping();await sourceCollections?.flush();}
 if(ctx.tab==='close')captureCloseDraft();
 ctx.tab=tab;writeSmall('tab',tab);
 for(const button of $$('[data-tab]')){if(button.closest('nav')){if(button.dataset.tab===tab)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}}
 for(const node of $$('.view'))node.hidden=node.id!=='view-'+tab;
 if(tab==='overview')renderOverview();else if(tab==='collection')await sourceCollections?.open();else if(tab==='import')renderImport();else if(tab==='transactions'){renderTransactions();await loadTransactions();}else renderClose();
 lockForms();
}
function clickHandler(event){
 const button=event.target.closest('button[data-action],button[data-tab]');if(!button||button.disabled)return;
 if(button.dataset.tab){event.preventDefault();run(()=>setTab(button.dataset.tab));return;}
 event.preventDefault();run(async()=>{
  const action=button.dataset.action,id=button.dataset.id,page=Number(button.dataset.page);
  if(action==='reload')location.reload();
  else if(action==='dismiss-notice')notice('');
  else if(action==='refresh'){captureCloseDraft();saveDetailDraft();await refreshState();if(ctx.tab==='transactions')await loadTransactions();if(ctx.detail&&$('#detail-dialog').open)await openTransaction(ctx.detail.transaction.id);}
  else if(action==='close-dialog')closeTransactionDialog();
  else if(action==='close-record')closeRecordDialog();
  else if(action==='recover-operation')await recoverOperation();
  else if(action==='retry-operation'){const result=await recoverOperation({quiet:true});if(!result&&ctx.pending)await sendPending();}
  else if(action==='download-operation'){if(ctx.pending)localDownload('bank-operation-'+ctx.pending.id+'.json',json(ctx.pending));}
  else if(action==='open-account'){await selectAccount(id);await setTab('transactions');}
  else if(action==='show-import')await setTab('import');
  else if(action==='show-close')await setTab('close');
  else if(action==='imports-page'){ctx.overviewPage=Math.max(0,page);renderOverview();}
  else if(action==='closes-page'){ctx.closeListPage=Math.max(0,page);renderOverview();}
  else if(action==='open-import')await openImport(id);
  else if(action==='open-close')await openClose(id);
  else if(action==='import-file')await downloadResponse(await ctx.client.importFile(id,button.dataset.file),button.dataset.file==='original'?'original-bank-statement':button.dataset.file);
  else if(action==='close-file')await downloadResponse(await ctx.client.closeFile(id,button.dataset.file),button.dataset.file);
  else if(action==='download-source'){if(ctx.sourceFile)localDownload(ctx.sourceFile.name,originalBytes(ctx.sourceFile),'application/octet-stream');}
  else if(action==='download-source-draft'){
   captureMapping();if(!ctx.sourceFile)throw new Error('Select the original bank file first.');
   localDownload('bank-source-working-inputs.json',json({schema:'stellar-forge.bank-source-working-inputs.v1',workspaceId:ctx.state.workspaceId,file:ctx.sourceFile,mapping:ctx.sourceMapping}));
  }
  else if(action==='download-source-preview'){if(ctx.sourcePreview)localDownload('bank-source-preview.json',json(ctx.sourcePreview));}
  else if(action==='transactions-page')await loadTransactions(Math.max(0,page)*ctx.tx.limit);
  else if(action==='open-transaction')await openTransaction(id);
  else if(action==='open-source-row')await openSourceRow(id,button.dataset.row);
  else if(action==='camt-entry-page'){
   const container=button.closest('[data-camt-entry]'),row=button.closest('#record-body')?ctx.record?.row:ctx.detail?.transaction;
   if(!container||!row||row.id!==container.dataset.camtRow)throw new Error('Open the current original entry before paging its details.');
   container.outerHTML=camtEntryHtml(row,{offset:Number(button.dataset.offset)});
  }
  else if(action==='import-record-page'){ctx.record.page=Math.max(0,page);renderImportRecord();}
  else if(action==='add-part'){ctx.parts=readParts();ctx.parts.push({kind:'INCOME',amount:'',note:'',reference:'',ledgerCode:'',targetId:''});renderParts();saveDetailDraft();}
  else if(action==='remove-part'){ctx.parts=readParts();ctx.parts.splice(Number(button.dataset.index),1);renderParts();saveDetailDraft();}
  else if(action==='add-fee'){ctx.parts=readParts();let amount='';try{const remainder=postingDifference();if(remainder.difference<0n)amount=money(remainder.difference,remainder.scale);}catch{}ctx.parts.push({kind:'FEE',amount,note:'Bank processing fee',reference:'',ledgerCode:'',targetId:''});renderParts();saveDetailDraft();}
  else if(action==='preview-assembly')await previewAssembly();
  else if(action==='assembly-import-page'){captureCloseDraft();captureAssemblyDraft();ctx.assemblyPage=Math.max(0,page);renderClose();}
  else if(action==='assembly-review-page'){ctx.assemblyReviewPage=Math.max(0,page);$('#assembly-review').innerHTML=assemblyReviewHtml(ctx.assemblyPreview);}
  else if(action==='use-assembly'){
   if(!ctx.assemblyPreview?.eligible||ctx.assemblySignature!==assemblySignature())throw new Error('Review the complete current original page selection first.');
   chooseClosingSource(JSON.stringify(ctx.assemblyPreview.sourceClosing));
  }
  else if(action==='download-assembly'){if(ctx.assemblyPreview)localDownload('bank-original-page-review.json',json(ctx.assemblyPreview));}
  else if(action==='clear-assembly'){captureCloseDraft();ctx.closeDraft.pageImportIds='[]';invalidateAssembly();writeSmall('close-draft:'+ctx.accountId,ctx.closeDraft);renderClose();}
  else if(action==='download-close-draft'){captureCloseDraft();captureAssemblyDraft();localDownload('bank-reconciliation-working-inputs.json',json({schema:'stellar-forge.bank-close-working-inputs.v1',workspaceId:ctx.state.workspaceId,accountId:ctx.accountId,inputs:ctx.closeDraft}));}
  else if(action==='download-close-preview'){if(ctx.closePreview)localDownload('bank-reconciliation-review.json',json(ctx.closePreview));}
  else if(action==='close-transaction-page'){ctx.closePage=Math.max(0,page);renderClosePreview();}
  else if(action==='close-problem-page'){ctx.closeProblemPage=Math.max(0,page);renderClosePreview();}
  else if(action==='close-pending-page'){ctx.closePendingPage=Math.max(0,page);renderClosePreview();}
  else if(action==='closed-transaction-page'){ctx.record.page=Math.max(0,page);renderClosedRecord();}
  else if(action==='closed-pending-page'){ctx.record.pendingPage=Math.max(0,page);renderClosedRecord();}
  else if(action==='closed-changes-page'){ctx.record.changesPage=Math.max(0,page);renderClosedRecord();}
  else if(action==='closed-problems-page'){ctx.record.problemsPage=Math.max(0,page);renderClosedRecord();}
 });
}
function submitHandler(event){
 const form=event.target;if(!(form instanceof HTMLFormElement))return;
 event.preventDefault();run(async()=>{
  if(form.id==='source-form')await previewSource();
  else if(form.id==='bank-account-form'){
   const source=selectedSource();if(!source?.account.identitySha256)throw new Error('Review a source with a complete institution/account identity first.');
   const values=formObject(form),scale=Number(values.scale);if(!Number.isInteger(scale)||scale<0||scale>6)throw new Error('Enter an integer currency scale from 0 to 6.');
   ctx.sourceMapping.accountName=values.name;ctx.sourceMapping.scale=String(scale);writeSmall('source-mapping',ctx.sourceMapping);sourceCollections?.mappingChanged(ctx.sourceFile,ctx.sourceMapping);
   const result=await mutate('/accounts',{account:{name:values.name,currency:{code:source.account.currency,scale},sourceIdentitySha256:source.account.identitySha256,note:values.note}},'Bank account');
   if(result?.account?.id){await selectAccount(result.account.id);renderSourcePreview();}
  }
  else if(form.id==='receive-source-form'){
   if(!ctx.sourcePreview?.reviewSha256||!ctx.previewSourceInput||!form.elements.reviewed.checked)throw new Error('Review the complete original source before retaining it.');
   const accountId=form.elements.accountId.value;if(!accountId)throw new Error('Select its exact merchant bank account.');
   if(form.elements.supersedesImportId?.required&&!form.elements.supersedesImportId.value)throw new Error('Choose the prior interpretation of this same original file and account section.');
   const result=await mutate('/imports',{accountId,statementId:ctx.sourceStatementId,source:ctx.previewSourceInput,reviewSha256:ctx.sourcePreview.reviewSha256,...(form.elements.receiptIntakeAccountId?.value?{receiptIntakeAccountId:form.elements.receiptIntakeAccountId.value}:{}),...(form.elements.supersedesImportId?.value?{supersedesImportId:form.elements.supersedesImportId.value}:{})},'Original bank statement');
   await selectAccount(accountId);await setTab('transactions');await loadTransactions(0);
   if(result?.import?.id)notice('Original statement retained. Review its transactions and keep the complete source available from Overview.');
  }
  else if(form.id==='transaction-filter'){ctx.filters={status:form.elements.status.value,search:form.elements.search.value.trim()};writeSmall('transaction-filter',ctx.filters);await loadTransactions(0);}
  else if(form.id==='match-form')await submitMatch(form);
  else if(form.id==='receipt-form')await submitReceipt(form);
  else if(form.id==='resolve-form')await submitResolution(form);
  else if(form.id==='undo-form')await mutate('/transactions/'+encodeURIComponent(ctx.detail.transaction.id)+'/undo',{reason:form.elements.reason.value},'Bank match undo');
  else if(form.id==='close-form')await previewClose();
  else if(form.id==='retain-close-form')await retainClose(form);
  else if(form.id==='reopen-close-form'){
   const id=form.dataset.id;await mutate('/closes/'+encodeURIComponent(id)+'/reopen',{reason:form.elements.reason.value},'Bank statement reopening');invalidateClosePreview();await openClose(id);
  }
 });
}
function changeHandler(event){
 const input=event.target;
 run(async()=>{
  if(input.id==='account-picker')await selectAccount(input.value);
  else if(input.id==='actor')writeSmall('actor',input.value);
  else if(input.id==='statement-file'){if(input.files?.[0])await chooseFile(input.files[0]);}
  else if(input.id==='restore-source-draft'){if(input.files?.[0])await restoreSourceFile(input.files[0]);input.value='';}
  else if(input.id==='restore-close-draft'){if(input.files?.[0])await restoreCloseFile(input.files[0]);input.value='';}
  else if(input.id==='recovery-file'){if(input.files?.[0])await loadRecoveryFile(input.files[0]);input.value='';}
  else if(input.name==='source-statement'){ctx.sourceStatementId=input.value;ctx.sourceSupersedesId='';renderSourcePreview();}
  else if(input.closest('#receive-source-form')&&input.name==='accountId'){ctx.sourceReceiveAccountId=input.value;ctx.sourceSupersedesId='';renderSourcePreview();}
  else if(input.closest('#receive-source-form')&&input.name==='receiptIntakeAccountId'){
   const binding=receiptIntakeBinding(selectedSource(),ctx.sourceReceiveAccountId),saved=readSmall('receipt-intake-bindings',{});
   saved[binding.key]=input.value;writeSmall('receipt-intake-bindings',saved);
  }
  else if(input.closest('#receive-source-form')&&input.name==='supersedesImportId')ctx.sourceSupersedesId=input.value;
  else if(input.name==='record-statement'){ctx.record.statementId=input.value;ctx.record.page=0;renderImportRecord();}
  else if(input.matches('[data-source-field]')){
   captureMapping();resetSourcePreview();
   if(input.name==='format'){const csv=input.value==='CSV';$('#csv-options').hidden=!csv;$('#csv-options').disabled=!csv;$('#native-options').hidden=false;const camt=input.value==='CAMT053';$('#camt-options').hidden=!camt;$('#camt-options').disabled=!camt;}
   if(input.name==='textEncoding')renderSourceFile();
  }
  else if(input.closest('#posting-parts')){
   const row=input.closest('[data-part]'),index=Number(row?.dataset.part);
   ctx.parts=readParts();
   if(input.name==='kind'||input.dataset.partField==='kind'){if(ctx.parts[index]){ctx.parts[index].targetId='';ctx.parts[index].coverageKey='';}renderParts();}
   else if(input.name==='targetId'||input.dataset.partField==='targetId'){
    const part=ctx.parts[index],list=part?.kind==='RECEIPT'?ctx.detail.suggestions?.receipts:ctx.detail.suggestions?.refunds,target=list?.find(x=>x.id===part?.targetId);
    if(part){
     part.coverageKey='';
     const groups=receiptCoverageChoices(part);
     if(groups.length>1)part.amount='';
     else if(target&&(groups.length===1||!part.amount)){
      const scale=transactionAccount().currency.scale,amount=minor(groups[0]?.amount??target.remaining,scale);
      part.amount=money(part.kind==='REFUND'?-amount:amount,scale);
      if(groups.length===1)part.coverageKey=groups[0].key;
     }
     renderParts();
    }
   }
   else if(input.name==='coverageKey'){
    const part=ctx.parts[index],selected=part&&receiptCoverageChoices(part).find(group=>group.key===part.coverageKey);
    if(selected)part.amount=selected.amount;
    renderParts();
   }
   updatePostingTotal();saveDetailDraft();
  }
  else if(input.closest('#receipt-form')){
   const form=$('#receipt-form');
   if(input.name==='customerId'){const invoices=currentInvoiceOptions(input.value);form.elements.invoiceId.innerHTML=choices(invoices.map(x=>({value:x.id,label:x.number+' · '+(x.amountDue??'review balance')+' '+transactionAccount().currency.code})),'','Keep payment unallocated');ctx.invoiceLoad++;ctx.invoiceDetail=null;$('#selected-invoice').innerHTML='';}
   else if(input.name==='invoiceId')await chooseInvoice(input.value);
   updateReceiptTotal();saveDetailDraft();
  }
  else if(input.closest('#resolve-form')){updateResolveFields();saveDetailDraft();}
  else if(input.closest('#assembly-form')){
   captureCloseDraft();captureAssemblyDraft();
   if(input.dataset.pageImport){const selected=new Set(selectedPageImports());if(input.checked)selected.add(input.dataset.pageImport);else selected.delete(input.dataset.pageImport);ctx.closeDraft.pageImportIds=JSON.stringify([...selected]);}
   invalidateAssembly();writeSmall('close-draft:'+ctx.accountId,ctx.closeDraft);renderClose();
  }
  else if(input.closest('#close-form')){
   if(input.name==='sourceClosing')chooseClosingSource(input.value);
   else{captureCloseDraft();invalidateClosePreview();}
  }
 });
}
function inputHandler(event){
 const input=event.target;
 if(input.matches('[data-source-field]')){captureMapping();resetSourcePreview();}
 if(input.closest('#posting-parts')){ctx.parts=readParts();updatePostingTotal();saveDetailDraft();}
 else if(input.closest('#receipt-form')){updateReceiptTotal();saveDetailDraft();}
 else if(input.closest('#detail-dialog')&&input.name)saveDetailDraft();
 if(input.closest('#assembly-form')&&input.name==='groupingNote'){captureAssemblyDraft();invalidateAssembly();}
 if(input.closest('#close-form')&&input.name!=='sourceClosing'){captureCloseDraft();invalidateClosePreview();}
}
function run(work){return Promise.resolve().then(work).catch(error=>{notice(errorMessage(error),'error');return null;});}
function sameOriginBase(value,label){
 const url=new URL(value,location.href);if(url.origin!==location.origin||url.username||url.password)throw new Error(label+' must use this workspace origin.');
 return url.pathname.replace(/\/$/,'');
}
async function boot(){
 document.addEventListener('click',clickHandler);document.addEventListener('submit',submitHandler);document.addEventListener('change',changeHandler);document.addEventListener('input',inputHandler);
 $('#detail-dialog').addEventListener('cancel',()=>{saveDetailDraft();ctx.detailLoad++;ctx.invoiceLoad++;ctx.detail=null;ctx.invoiceDetail=null;});
 $('#record-dialog').addEventListener('cancel',()=>{ctx.recordLoad++;ctx.record=null;});
 window.addEventListener('pagehide',()=>{saveDetailDraft();captureCloseDraft();captureMapping();if(ctx.state)writeSmall('actor',$('#actor').value);});
 try{
  const response=await fetch(new URL('./config.json',location.href),{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('Workspace configuration could not be opened.');
  ctx.config=await response.json();
  ctx.client=new BankStatementsClient({baseUrl:sameOriginBase(ctx.config.apiBase||'/api/receivables/bank-statements','Bank API')});
  ctx.receivables=new ReceivablesClient({baseUrl:sameOriginBase(ctx.config.receivablesApiBase||'/api/receivables','Receivables API')});
  $('#receivables-link').href=sameOriginBase(ctx.config.receivablesUi||'/receivables/','Receivables workspace')+'/';
  ctx.tx.limit=Math.max(10,Math.min(200,Number(ctx.config.pageSize)||50));
  await refreshState({render:false});
  ctx.accountId=readSmall('account-id','');if(!ctx.state.accounts.some(x=>x.id===ctx.accountId))ctx.accountId='';
  $('#account-picker').value=ctx.accountId;$('#actor').value=readSmall('actor','operator')||'operator';
  ctx.sourceMapping={...defaultMapping(),...readSmall('source-mapping',{})};
  ctx.filters={status:'',search:'',...readSmall('transaction-filter',{})};
  ctx.closeDraft={...ctx.closeDraft,...readSmall('close-draft:'+ctx.accountId,{})};
  try{ctx.sourceFile=await dbRead(storageKey('source-file'));ctx.pending=await dbRead(storageKey('pending'));}
  catch(error){ctx.storageProblem=error;notice('Original retry storage could not open. '+errorMessage(error),'error');}
  
  sourceCollections=installSourceCollections({
   root:$('#view-collection'),workspaceId:ctx.state.workspaceId,getImports:()=>ctx.state?.imports||[],
   readIndex:()=>dbRead(storageKey('source-collections-index')),
   readCollection:id=>dbRead(storageKey('source-collection:'+id)),
   saveCollection:async(collection,index)=>{
    const db=await openDb();
    await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),records=tx.objectStore('records');
     records.put(collection,storageKey('source-collection:'+collection.id));records.put(index,storageKey('source-collections-index'));
     tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Collection save was interrupted.'));});
   },
   uuid,defaultMapping,download:localDownload,notice,run,
   openItem:async(item)=>{
    if(ctx.sourceFileLoading)throw new Error('Wait for the current source file to finish loading.');
    const generation=++ctx.sourceFileLoad;resetSourcePreview();ctx.sourceFileLoading=true;ctx.sourceLoadingName=item.file.name;renderSourceFile();
    try{
     await dbWrite(storageKey('source-file'),item.file);
     if(generation!==ctx.sourceFileLoad)return;
     ctx.sourceFile=structuredClone(item.file);ctx.sourceMapping={...defaultMapping(),...structuredClone(item.mapping),columns:{...defaultMapping().columns,...structuredClone(item.mapping.columns)}};
     writeSmall('source-mapping',ctx.sourceMapping);ctx.sourceFileLoading=false;ctx.sourceLoadingName='';
     await setTab('import');notice('Opened '+item.file.name+'. Its complete original and working interpretation remain in the collection.');
    }finally{if(generation===ctx.sourceFileLoad){ctx.sourceFileLoading=false;ctx.sourceLoadingName='';renderImport();}}
   }
  });
  try{await sourceCollections.init();}catch(error){notice('Original statement collections need attention. '+errorMessage(error),'error');}

  renderPending();renderOverview();renderImport();renderTransactions();renderClose();
  const query=new URLSearchParams(location.search),requested=query.get('view'),transactionId=query.get('transaction');
  await setTab(transactionId?'transactions':requested||readSmall('tab','overview'));
  if(ctx.pending)await recoverOperation({quiet:true});
  if(transactionId)await openTransaction(transactionId);
 }catch(error){$('#connection').textContent='Connection needs attention';notice(errorMessage(error),'error');$('#view-overview').innerHTML='<section class="panel"><h2>Open the bank workspace</h2><p>'+esc(errorMessage(error))+'</p><button type="button" data-action="reload">Reload workspace</button></section>';}
}
void boot();
