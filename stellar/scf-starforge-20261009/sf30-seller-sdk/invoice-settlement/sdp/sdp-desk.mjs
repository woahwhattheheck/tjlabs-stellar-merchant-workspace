// MIT. Complete SDP desk mounted inside the original invoice application.
import {CONTACT_TYPES,parseCSV} from "./sdp-contract.mjs";
const pretty=value=>JSON.stringify(value,null,2),copy=value=>JSON.parse(JSON.stringify(value));
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=value=>value?new Date(value).toLocaleString():"";
const btn=(action,label,id="",extra="")=>'<button type="button" data-sdp-action="'+esc(action)+'" data-id="'+esc(id)+'" '+extra+'>'+esc(label)+'</button>';
const table=(head,rows)=>rows.length?'<div class="sdp-scroll"><table><thead><tr>'+head.map(x=>"<th>"+esc(x)+"</th>").join("")+"</tr></thead><tbody>"+rows.map(row=>"<tr>"+row.map(x=>"<td>"+x+"</td>").join("")+"</tr>").join("")+"</tbody></table></div>":'<p class="sdp-empty">No records in this selection.</p>';
const badge=value=>'<span class="sdp-status">'+esc(value??"")+"</span>";
const PAGE=100;
const canonical=value=>Array.isArray(value)?"["+value.map(canonical).join(",")+"]":value!==null&&typeof value==="object"?"{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+canonical(value[key])).join(",")+"}":JSON.stringify(value);
const fileText=async file=>new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer());
export function mountSDPDesk(root,api){
 for(const key of ["read","mutate","download","workspace","openTab"])if(typeof api[key]!=="function")throw new Error("The SDP desk requires the original invoice "+key+" interface.");
 let disposed=false,disposePromise=null,busy=false,loading=null,desks=[],selected=null,sources=[],draft=null,preview=null,prepared=null,
  preparedSourceId="",snapshotSourceId="",observationSourceId="",review=null,reportSourceId="",lastOutcome=null,openedSource=null,
  recipientOffset=0,reviewOffset=0,historyOffset=0,findingsOffset=0,providerOffset=0,filter="",historyFilter="",urls=new Set(),active=new Set(),draftError=null;
 const $=name=>root.querySelector('[data-sdp="'+name+'"]');
 const tracked=work=>{if(disposed)return Promise.reject(new Error("The SDP desk has closed."));const p=Promise.resolve().then(work);active.add(p);p.then(()=>active.delete(p),()=>active.delete(p));return p;};
 function notify(message,isError=false){if(disposed)return;const node=$("notice");node.hidden=false;node.className=isError?"sdp-notice error":"sdp-notice";node.textContent=message;}
 function error(e){notify((e.code?e.code+": ":"")+e.message+(e.detail?"\n"+pretty(e.detail):""),true);}
 function workspace(){const value=api.workspace();if(!value?.workspaceId)throw new Error("Open the original invoice workspace first.");return value;}
 function scopeKey(){return "stellar-forge.sdp-draft.v1:"+workspace().workspaceId+":"+selected.alias;}
 function retainDraft(){if(!selected||!draft)return;try{localStorage.setItem(scopeKey(),pretty({schema:"stellar-forge.sdp-draft.v1",workspaceId:workspace().workspaceId,desk:selected.alias,scope:selected.scope,draft}));draftError=null;}catch(e){draftError=e;throw new Error("The complete draft could not be saved in browser storage. Save its JSON file before leaving this page.");}}
 function restoreDraft(){
  const raw=localStorage.getItem(scopeKey());if(!raw)return null;
  const saved=JSON.parse(raw);if(saved.schema!=="stellar-forge.sdp-draft.v1"||saved.workspaceId!==workspace().workspaceId||saved.desk!==selected.alias||canonical(saved.scope)!==canonical(selected.scope))throw new Error("The retained browser draft belongs to another original programme or scope.");
  return saved.draft;
 }
 function freshDraft(){return {operationId:"sdp-"+crypto.randomUUID(),scope:copy(selected.scope),disbursement:{name:"",registration_contact_type:"EMAIL",wallet_id:"",verification_field:""},items:[]};}
 function field(name){return $("editor").elements.namedItem(name);}
 function editorInput(){
  if(!draft)return;
  const d={name:field("name").value,registration_contact_type:field("registration_contact_type").value};
  if(d.registration_contact_type.endsWith("_AND_WALLET_ADDRESS")){}
  else{d.wallet_id=field("wallet_id").value;d.verification_field=field("verification_field").value;}
  if(field("receiver_registration_message_template").value!=="")d.receiver_registration_message_template=field("receiver_registration_message_template").value;
  draft={operationId:field("operationId").value,scope:copy(selected.scope),disbursement:d,items:draft.items};
  preview=null;retainDraft();renderPreview();renderEditorMode();
 }
 function renderEditorMode(){
  const type=field("registration_contact_type").value,direct=type.endsWith("_AND_WALLET_ADDRESS");
  $("embedded").hidden=direct;$("address-note").hidden=!direct;
  $("recipient-columns").textContent=["id",type.startsWith("EMAIL")?"email":"phone","amount","paymentID",...(direct?["walletAddress","walletAddressMemo"]:field("verification_field").value?["verification"]:[])].join(", ");
 }
 function renderEditor(){
  if(!draft)return;
  for(const name of ["operationId","name","registration_contact_type","wallet_id","verification_field","receiver_registration_message_template"]){
   field(name).value=name==="operationId"?draft.operationId:(draft.disbursement[name]??"");
  }
  renderEditorMode();renderRecipients();renderPreview();
 }
 function renderRecipients(){
  const term=$("recipient-filter").value.toLowerCase(),rows=draft.items.map((row,index)=>({row,index})).filter(({row})=>pretty(row).toLowerCase().includes(term));
  if(recipientOffset>=rows.length)recipientOffset=0;
  const direct=draft.disbursement.registration_contact_type.endsWith("_AND_WALLET_ADDRESS"),contact=draft.disbursement.registration_contact_type.startsWith("EMAIL")?"email":"phone";
  const columns=["id",contact,"amount","paymentID",...(direct?["walletAddress","walletAddressMemo"]:draft.disbursement.verification_field?["verification"]:[])];
  $("recipient-count").textContent=draft.items.length+" complete recipient instructions";
  $("recipients").innerHTML=table([...columns,""],rows.slice(recipientOffset,recipientOffset+PAGE).map(({row,index})=>[
   ...columns.map(key=>'<input aria-label="'+esc(key+" row "+(index+1))+'" data-sdp-row="'+index+'" data-sdp-key="'+key+'" value="'+esc(row[key]??"")+'" '+(key==="amount"?'inputmode="decimal"':"")+'>'),
   btn("remove-recipient","Remove",index)
  ]));
  $("recipient-pages").innerHTML=pages("recipient-page",recipientOffset,rows.length);
 }
 function pages(action,offset,total){return '<span>'+Math.min(total,offset+1)+"–"+Math.min(total,offset+PAGE)+" of "+total+"</span>"+btn(action,"Previous",Math.max(0,offset-PAGE),offset===0?"disabled":"")+btn(action,"Next",offset+PAGE,offset+PAGE>=total?"disabled":"");}
 function metrics(entries){return entries.map(([label,value,detail])=>'<div><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail??"")+"</small></div>").join("");}
 function renderPreview(){
  $("preview").hidden=!preview;if(!preview)return;
  $("preview-metrics").innerHTML=metrics([["Recipients",preview.prepared.items.length],["Exact total",preview.prepared.totalAmount,preview.prepared.scope.asset.code],["Operation",preview.prepared.operationId]]);
  $("preview-warnings").replaceChildren(...preview.prepared.warnings.map(message=>{const p=document.createElement("p");p.textContent=message;return p;}));
  $("preview-instructions").textContent=preview.prepared.instructions;
 }
 function selectOptions(name,rows,placeholder="Select saved source"){
  const element=$(name),old=element.value;
  element.innerHTML='<option value="">'+esc(placeholder)+"</option>"+rows.map(row=>'<option value="'+esc(row.id)+'">'+esc(row.label??row.id)+" · "+esc(date(row.observedAt??row.createdAt))+"</option>").join("");
  if(rows.some(row=>row.id===old))element.value=old;
 }
 function renderSources(){
  selectOptions("batch",sources.filter(x=>x.kind==="sdp.prepared-batch"),"Select a saved prepared batch");
  selectOptions("snapshot",sources.filter(x=>x.kind==="sdp.snapshot"),"Select a complete saved snapshot");
  selectOptions("observation",sources.filter(x=>x.kind==="sdp.provider-observation"),"Select a retained provider observation");
  if(preparedSourceId)$("batch").value=preparedSourceId;
  if(snapshotSourceId)$("snapshot").value=snapshotSourceId;
  if(observationSourceId)$("observation").value=observationSourceId;
  const rows=sources.filter(row=>(!historyFilter||row.kind===historyFilter)&&(!filter||pretty(row).toLowerCase().includes(filter)));
  if(historyOffset>=rows.length)historyOffset=0;
  $("source-history").innerHTML=table(["Retained source","Kind","Captured","Complete bytes","Actions"],rows.slice(historyOffset,historyOffset+PAGE).map(row=>[
   esc(row.label??row.id)+"<small>"+esc(row.id)+"</small>",esc(row.kind.replace(/^sdp\./,"")),esc(date(row.observedAt??row.createdAt)),esc(row.bodyFile?.bytes??""),
   btn("source-open","Inspect",row.id)+btn("source-download","Download",row.id)]));
  $("source-pages").innerHTML=pages("source-page",historyOffset,rows.length);
  const kinds=[...new Set(sources.map(x=>x.kind))].sort(),old=$("history-kind").value;
  $("history-kind").innerHTML='<option value="">All source kinds</option>'+kinds.map(x=>'<option value="'+esc(x)+'">'+esc(x.replace(/^sdp\./,""))+"</option>").join("");
  $("history-kind").value=old;
 }
 function renderPrepared(){
  $("saved").hidden=!prepared;
  if(!prepared)return;
  $("saved-title").textContent=prepared.request.name;
  $("saved-metrics").innerHTML=metrics([["Expected total",prepared.totalAmount,prepared.scope.asset.code],["Recipients",prepared.items.length],["Batch operation",prepared.operationId],["Programme",selected.programmeName,"Version "+selected.programmeVersion]]);
  $("saved-id").textContent=preparedSourceId;
  $("saved-instructions").textContent=prepared.instructions;
  $("provider-controls").hidden=!selected.providerRead;
  $("provider-offline").hidden=selected.providerRead;
  $("write-unavailable").hidden=selected.providerWrite;
  for(const node of root.querySelectorAll("[data-provider-write]"))node.disabled=busy||!selected.providerWrite;
 }
 function renderReview(){
  $("receiving").hidden=!review;if(!review)return;
  $("review-title").textContent="Receiving "+review.disbursementId;
  $("review-summary").textContent=review.providerStatus+" · captured "+date(review.capturedAt)+(review.complete?" · complete capture":" · incomplete capture");
  $("review-metrics").innerHTML=metrics([["Expected obligation",review.amounts.expected,selected.scope.asset.code],["Observed successful",review.amounts.providerSuccessful,"Provider amounts"],["Observed pending",review.amounts.providerPending,"Provider amounts"],["Findings",review.findings.length,review.requiresReview?"Review the retained differences":"Captured checks match"]]);
  $("amounts").innerHTML=table(["Expected obligations by observed status","Exact amount"],Object.entries(review.obligationAmounts??{}).map(([k,v])=>[esc(k),esc(v)]))+
   table(["Observed provider totals","Exact amount"],Object.entries(review.amounts).map(([k,v])=>[esc(k),esc(v)]));
  const needle=$("review-filter").value.toLowerCase(),only=$("review-problems").checked;
  const rows=review.items.filter(row=>(!only||row.problems.length||row.externalRecipientIdMatches===false)&&(!needle||pretty(row).toLowerCase().includes(needle)));
  if(reviewOffset>=rows.length)reviewOffset=0;
  $("review-rows").innerHTML=table(["Payment / contact","Recipient mapping","Amount expected / provider","Status / chain","Findings"],rows.slice(reviewOffset,reviewOffset+PAGE).map(row=>[
   "<strong>"+esc(row.paymentID)+"</strong><small>"+esc(row.expectedContact??"")+"</small><small>"+esc(row.paymentId??"")+"</small>",
   "Expected "+esc(row.recipientExternalId)+"<small>Provider reference "+esc(row.providerRecipientExternalId??"—")+"</small><small>Recipient "+esc(row.receiverId??"—")+"</small><small>Wallet "+esc(row.receiverWalletId??"—")+"</small>"+(row.externalRecipientIdMatches===false?'<span class="sdp-attention">Existing external reference differs</span>':""),
   esc(row.expectedAmount)+" / "+esc(row.providerAmount??"—"),badge(row.status)+"<small>"+esc(row.stellarTransactionId??"")+"</small>",
   esc(row.problems.join(", "))+" "+btn("payment-detail","Full row",row.paymentID)]));
  $("review-pages").innerHTML=pages("review-page",reviewOffset,rows.length);
  if(findingsOffset>=review.findings.length)findingsOffset=0;
  $("findings").innerHTML=table(["Finding","Payment","Retained detail"],review.findings.slice(findingsOffset,findingsOffset+PAGE).map(row=>[esc(row.kind),esc(row.paymentID??row.paymentId??""),'<pre>'+esc(pretty(row))+"</pre>"]));
  $("findings-pages").innerHTML=pages("findings-page",findingsOffset,review.findings.length);
  if(providerOffset>=(review.providerAmountRows??[]).length)providerOffset=0;
  $("provider-amounts").innerHTML=table(["Provider payment","Amount","Status","Included in totals","Reason"],(review.providerAmountRows??[]).slice(providerOffset,providerOffset+PAGE).map(row=>[esc(row.paymentId??""),esc(row.providerAmount??""),badge(row.status),row.included?"Yes":"No",esc(row.excluded.join(", "))]));
  $("provider-pages").innerHTML=pages("provider-page",providerOffset,(review.providerAmountRows??[]).length);
  $("chain-note").textContent=review.interpretation;
  $("report-download").disabled=!reportSourceId||busy;
 }
 function showObject(value,title="Complete retained object"){
  openedSource=value;$("detail-title").textContent=title;$("detail").hidden=false;$("detail-json").textContent=pretty(value);
 }
 function controls(){
  for(const element of root.querySelectorAll("button,input,select,textarea"))element.disabled=busy;
  if(selected){for(const element of root.querySelectorAll("[data-provider-write]"))element.disabled=busy||!selected.providerWrite;}
  $("save-prepared").disabled=busy||!preview;
  $("report-download").disabled=busy||!reportSourceId;
 }
 async function run(work){
  if(busy||disposed)return;
  busy=true;controls();
  try{return await tracked(work);}catch(e){error(e);}finally{busy=false;if(!disposed)controls();}
 }
 async function reload(){
  if(!selected)return;
  const result=await api.read("sdp.list",{desk:selected.alias});
  if(result.workspaceId!==workspace().workspaceId||result.desk.sourceScope!==selected.sourceScope)throw new Error("The original SDP desk selection changed.");
  sources=result.sources;renderSources();return result;
 }
 async function choose(alias){
  selected=desks.find(x=>x.alias===alias);if(!selected)throw new Error("Select a configured SDP desk.");
  prepared=null;preparedSourceId="";snapshotSourceId="";observationSourceId="";review=null;reportSourceId="";lastOutcome=null;preview=null;
  draft=restoreDraft()??freshDraft();recipientOffset=0;
  $("scope").textContent=selected.scope.tenantName+" / "+selected.scope.sourceWalletId+" / "+selected.scope.asset.code+" · "+selected.scope.origin;
  $("programme").textContent=selected.programmeName+" · original programme version "+selected.programmeVersion+" · "+selected.scope.networkPassphrase;
  $("content").hidden=false;renderEditor();renderPrepared();renderReview();await reload();controls();
 }
 async function accepted(method,args,label){
  const original={...args,desk:selected.alias,requestId:crypto.randomUUID(),expectedRevision:workspace().revision};
  const result=await api.mutate(method,original,label);
  lastOutcome={method,args:original,result};showObject(lastOutcome,"Accepted SDP command and complete result");
  await reload();return result;
 }
 async function openPrepared(sourceId){
  const result=await api.read("sdp.read",{desk:selected.alias,sourceId});
  if(result.source.kind!=="sdp.prepared-batch")throw new Error("Select a saved prepared batch.");
  prepared=result.value;preparedSourceId=sourceId;review=null;snapshotSourceId="";reportSourceId="";
  renderSources();renderPrepared();renderReview();
 }
 async function openSnapshot(sourceId){
  if(!preparedSourceId)throw new Error("Open its original prepared batch first.");
  const snapshot=await api.read("sdp.read",{desk:selected.alias,sourceId});
  if(snapshot.source.kind!=="sdp.snapshot")throw new Error("Select a complete saved snapshot.");
  const result=await accepted("sdp.receive",{preparedSourceId,snapshot:snapshot.value},"Receiving original SDP snapshot");
  receiveResult(result);
 }
 function receiveResult(result){
  snapshotSourceId=result.snapshotSourceId;review=result.review;reportSourceId=result.reportSourceId;
  if(review?.disbursementId)$("disbursement-id").value=review.disbursementId;
  renderSources();renderReview();$("receiving").scrollIntoView({behavior:"smooth"});
 }
 function disbursement(){const id=$("disbursement-id").value.trim();if(!id)throw new Error("Select the original provider disbursement ID.");return id;}
 async function downloadSource(id,name){return api.download("/api/sources/"+encodeURIComponent(id)+"/original",name??("sdp-source-"+id+".json"));}
 function downloadJSON(value,name){const url=URL.createObjectURL(new Blob([pretty(value)+"\n"],{type:"application/json"}));urls.add(url);const a=document.createElement("a");a.href=url;a.download=name;root.append(a);a.click();a.remove();setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},60000);}
 const actions={
  "new":async()=>{if(draft?.items.length&&!window.confirm("Start a new browser draft? Save the current draft JSON first if needed."))return;draft=freshDraft();preview=null;recipientOffset=0;retainDraft();renderEditor();},
  "draft-download":async()=>{editorInput();downloadJSON(draft,"sdp-batch-draft.json");},
  "add-recipient":async()=>{editorInput();const type=draft.disbursement.registration_contact_type,contact=type.startsWith("EMAIL")?"email":"phone";draft.items.push({id:"",paymentID:"",amount:"",[contact]:"",...(type.endsWith("_AND_WALLET_ADDRESS")?{walletAddress:"",walletAddressMemo:""}:draft.disbursement.verification_field?{verification:""}:{})});recipientOffset=Math.floor((draft.items.length-1)/PAGE)*PAGE;retainDraft();renderRecipients();},
  "remove-recipient":async id=>{draft.items.splice(Number(id),1);preview=null;retainDraft();renderRecipients();renderPreview();},
  "recipient-page":async id=>{recipientOffset=Number(id);renderRecipients();},
  "review-page":async id=>{reviewOffset=Number(id);renderReview();},
  "findings-page":async id=>{findingsOffset=Number(id);renderReview();},
  "provider-page":async id=>{providerOffset=Number(id);renderReview();},
  "source-page":async id=>{historyOffset=Number(id);renderSources();},
  "preview":async()=>{editorInput();preview=await api.read("sdp.preview",{desk:selected.alias,batch:copy(draft)});renderPreview();notify("Native preview retained in this page. Save to create the original batch and CSV sources.");},
  "prepare":async()=>{editorInput();const current=await api.read("sdp.preview",{desk:selected.alias,batch:copy(draft)});preview=current;renderPreview();const result=await accepted("sdp.prepare",{batch:copy(draft)},"Saving complete SDP batch");prepared=result.prepared;preparedSourceId=result.preparedSourceId;renderSources();renderPrepared();notify("Saved complete prepared batch and exact instruction CSV.");},
  "open-batch":async()=>{const id=$("batch").value;if(!id)throw new Error("Select a saved batch.");await openPrepared(id);},
  "copy-batch":async()=>{if(!prepared)throw new Error("Open a saved batch first.");const {asset_id,...disbursement}=prepared.request;draft={operationId:"sdp-"+crypto.randomUUID(),scope:copy(selected.scope),disbursement:copy(disbursement),items:copy(prepared.items)};preview=null;retainDraft();renderEditor();notify("Copied its inputs into a new operation draft. The saved batch remains unchanged.");},
  "instructions":async()=>{const rows=sources.filter(x=>x.kind==="sdp.instructions");for(const row of rows){const selectedSource=await api.read("source.read",{sourceId:row.id});const request=selectedSource.source.requestFile;const raw=await api.read("source.file",{sourceId:row.id,part:"request",length:4*1024*1024});const obj=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.base64),c=>c.charCodeAt(0))));if(obj.preparedSourceId===preparedSourceId)return downloadSource(row.id,"sdp-instructions.csv");}throw new Error("The matching original instruction source was not found; inspect the complete saved batch source.");},
  "prepared-download":async()=>downloadSource(preparedSourceId,"sdp-prepared-batch.json"),
  "inspect":async()=>{const result=await accepted("sdp.inspect",{disbursementId:disbursement()},"Reading original SDP disbursement");observationSourceId=result.retainedSources?.observationSourceId??"";renderSources();showObject(result,"Complete provider observation");},
  "capture":async()=>{if(!preparedSourceId)throw new Error("Open the original prepared batch.");const result=await accepted("sdp.capture",{preparedSourceId,disbursementId:disbursement(),maxPages:1000},"Capturing complete SDP receiving");receiveResult(result);},
  "create":async()=>{if(!preparedSourceId)throw new Error("Open the original prepared batch.");if(!window.confirm("Create this exact saved draft at "+selected.scope.origin+" for "+selected.scope.tenantName+"?"))return;
   const result=await accepted("sdp.create-draft",{preparedSourceId},"Creating original provider draft");if(result.data?.id)$("disbursement-id").value=result.data.id;observationSourceId=result.retainedSources?.observationSourceId??"";renderSources();showObject(result,"Provider draft result");},
  "upload":async()=>{const id=$("observation").value;if(!id)throw new Error("Inspect the provider and select that complete saved observation.");if(!window.confirm("Upload the exact saved instructions? The provider replaces draft payment rows and may send registration invitations."))return;
   const result=await accepted("sdp.upload",{preparedSourceId,disbursementId:disbursement(),observationSourceId:id},"Uploading original SDP instructions");showObject(result,"Instruction upload outcome");},
  "status":async status=>{const snapshot=$("snapshot").value;if(!preparedSourceId||!snapshot)throw new Error("Select the prepared batch and full reviewed provider snapshot.");if(!window.confirm("Request "+status+" for the disbursement in this exact snapshot?"))return;
   const result=await accepted("sdp.status",{preparedSourceId,snapshotSourceId:snapshot,status},"Requesting SDP "+status);showObject(result,"Provider status outcome");},
  "open-snapshot":async()=>{if(!$("snapshot").value)throw new Error("Select the saved provider snapshot.");await openSnapshot($("snapshot").value);},
  "source-open":async id=>{const row=sources.find(x=>x.id===id),isText=["sdp.instructions","sdp.report"].includes(row?.kind);const result=await api.read("sdp.read",{desk:selected.alias,sourceId:id,json:!isText});showObject(isText?{source:result.source,body:new TextDecoder().decode(Uint8Array.from(atob(result.bodyBase64),c=>c.charCodeAt(0)))}:result,"Complete retained "+(row?.kind??"source"));},
  "source-download":async id=>downloadSource(id),
  "project":async()=>{const id=$("observation").value;if(!id)throw new Error("Select a complete provider payments observation.");const result=await accepted("sdp.project-payments",{observationSourceId:id},"Projecting original payment source");showObject(result,"Invoice payment projection");},
  "payment-detail":async id=>showObject(review.items.find(row=>row.paymentID===id),"Original receiving payment row"),
  "report":async()=>downloadSource(reportSourceId,"sdp-batch-receiving.html"),
  "detail-download":async()=>{if(openedSource)downloadJSON(openedSource,"sdp-retained-detail.json");},
  "refresh":reload,
  "export":async()=>api.openTab("receiving"),
  "history":async()=>{$("history").scrollIntoView({behavior:"smooth"});},
  "invoice-reconciliation":async()=>api.openTab("reconciliation")
 };
 root.innerHTML='<div class="sdp-title"><div><span class="eyebrow">STELLAR DISBURSEMENT PLATFORM</span><h2>Batch operations</h2><p>Prepare exact instructions, inspect recipient mappings and retain complete provider outcomes in this invoice workspace.</p></div><div>'+btn("refresh","Refresh")+btn("export","Export & receiving")+"</div></div>"+
  '<div data-sdp="notice" class="sdp-notice" role="status" aria-live="polite" hidden></div>'+
  '<div class="sdp-panel"><label>Original programme / SDP scope<select data-sdp="desk"><option value="">Loading named desks</option></select></label><strong data-sdp="scope"></strong><p data-sdp="programme"></p></div>'+
  '<div data-sdp="unconfigured" class="sdp-panel" hidden><h3>Configure an original SDP scope</h3><p>The host needs a private SDP desk configuration selecting an existing invoice programme version and tenant, network, wallet and asset. Saved-data preparation and receiving work without provider credentials. Online actions use the original named connection and customer transaction adapter.</p></div>'+
  '<div data-sdp="content" hidden><details class="sdp-panel" open><summary>Prepare a batch</summary><form data-sdp="editor"><div class="sdp-fields"><label>Batch name<input name="name" maxlength="255" required></label><label>Original operation ID<input name="operationId" maxlength="200" required></label><label>Registration contact<select name="registration_contact_type">'+CONTACT_TYPES.map(x=>'<option>'+x+'</option>').join("")+'</select></label></div>'+
  '<div data-sdp="embedded" class="sdp-fields"><label>Recipient registration wallet ID<input name="wallet_id" maxlength="255"></label><label>Verification field<input name="verification_field" maxlength="64"></label></div><label>Registration message template<textarea name="receiver_registration_message_template" maxlength="255" rows="2"></textarea></label>'+
  '<p data-sdp="address-note" class="sdp-help" hidden>Direct Stellar addresses use the original host SDK validator. Keep address and memo exact; the desk never derives keys.</p>'+
  '<div class="sdp-toolbar">'+btn("new","New operation")+btn("draft-download","Save draft JSON")+'<label class="sdp-file">Import batch JSON<input data-sdp="batch-file" type="file" accept=".json,application/json"></label><label class="sdp-file">Import recipient CSV<input data-sdp="recipient-file" type="file" accept=".csv,text/csv"></label>'+btn("add-recipient","Add recipient")+'</div>'+
  '<p class="sdp-help">CSV columns: <code data-sdp="recipient-columns"></code>. Amounts remain exact decimal strings. Imports preserve case and whitespace for native validation.</p><div class="sdp-toolbar"><strong data-sdp="recipient-count"></strong><label>Find recipient<input data-sdp="recipient-filter" type="search"></label></div><div data-sdp="recipients"></div><div data-sdp="recipient-pages" class="sdp-pager"></div>'+
  '<div class="sdp-toolbar">'+btn("preview","Preview exact batch")+'<button type="button" data-sdp="save-prepared" data-sdp-action="prepare" disabled>Save prepared batch</button></div></form>'+
  '<div data-sdp="preview" hidden><h3>Native preparation preview</h3><div data-sdp="preview-metrics" class="sdp-metrics"></div><div data-sdp="preview-warnings" class="sdp-help"></div><details><summary>Complete original instruction CSV</summary><pre data-sdp="preview-instructions"></pre></details></div></details>'+
  '<div class="sdp-panel"><div class="sdp-toolbar"><label>Saved batch<select data-sdp="batch"></select></label>'+btn("open-batch","Open batch")+btn("history","Retained history")+'</div></div>'+
  '<section data-sdp="saved" class="sdp-panel" hidden><h3 data-sdp="saved-title"></h3><div data-sdp="saved-metrics" class="sdp-metrics"></div><p class="sdp-help">Original source: <code data-sdp="saved-id"></code></p><div class="sdp-toolbar">'+btn("prepared-download","Download prepared source")+btn("instructions","Download exact CSV")+btn("copy-batch","Copy into new draft")+'</div><details><summary>Saved original instructions</summary><pre data-sdp="saved-instructions"></pre></details>'+
  '<div data-sdp="provider-offline" class="sdp-help">Provider credentials are not selected for this desk. You can receive a complete original snapshot below.</div>'+
  '<div data-sdp="provider-controls"><h3>Original provider actions</h3><p data-sdp="write-unavailable" class="sdp-help">Provider reads are available. Dispatch needs the original durable mutation adapter before write actions can be used.</p><div class="sdp-fields"><label>Disbursement ID<input data-sdp="disbursement-id"></label><label>Reviewed provider observation<select data-sdp="observation"></select></label></div>'+
  '<div class="sdp-toolbar">'+btn("inspect","Inspect disbursement")+btn("capture","Capture complete receiving")+btn("create","Create provider draft","","data-provider-write")+btn("upload","Upload exact instructions","","data-provider-write")+'</div>'+
  '<p class="sdp-help">A retained uncertain dispatch is reconciled through the same original adapter. Preparing a new browser request does not bypass that provider intent.</p></div>'+
  '<h3>Receive a provider snapshot</h3><div class="sdp-toolbar"><label>Complete saved snapshot<select data-sdp="snapshot"></select></label>'+btn("open-snapshot","Receive saved snapshot")+'<label class="sdp-file">Import complete snapshot JSON<input data-sdp="snapshot-file" type="file" accept=".json,application/json"></label></div>'+
  '<div class="sdp-toolbar">'+btn("status","Start / resume","STARTED","data-provider-write")+btn("status","Pause","PAUSED","data-provider-write")+btn("status","Cancel","CANCELED","data-provider-write")+btn("project","Project selected payment observation")+'</div></section>'+
  '<section data-sdp="receiving" class="sdp-panel" hidden><div class="sdp-title"><div><h3 data-sdp="review-title"></h3><p data-sdp="review-summary"></p></div><button type="button" data-sdp="report-download" data-sdp-action="report">Download complete report</button></div><div class="sdp-metrics" data-sdp="review-metrics"></div><div class="sdp-toolbar"><label>Find payment<input data-sdp="review-filter" type="search"></label><label class="sdp-check"><input type="checkbox" data-sdp="review-problems"> Differences only</label></div><div data-sdp="review-rows"></div><div data-sdp="review-pages" class="sdp-pager"></div>'+
  '<details><summary>Exact observed and expected amounts</summary><div data-sdp="amounts"></div><div data-sdp="provider-amounts"></div><div data-sdp="provider-pages" class="sdp-pager"></div></details><details><summary>All receiving findings</summary><div data-sdp="findings"></div><div data-sdp="findings-pages" class="sdp-pager"></div></details><p class="sdp-help" data-sdp="chain-note"></p>'+btn("invoice-reconciliation","Open original invoice reconciliation")+'</section>'+
  '<section data-sdp="history" class="sdp-panel"><h3>Captured status, sources and operation history</h3><div class="sdp-toolbar"><label>Source kind<select data-sdp="history-kind"></select></label><label>Find retained source<input data-sdp="history-filter" type="search"></label></div><div data-sdp="source-history"></div><div data-sdp="source-pages" class="sdp-pager"></div><p class="sdp-help">The complete invoice workspace export carries original batch, CSV, full provider responses, snapshots, command outcomes and receiving reports. Import and reopen through the existing Export & receiving section.</p></section>'+
  '<section data-sdp="detail" class="sdp-panel" hidden><div class="sdp-title"><h3 data-sdp="detail-title"></h3>'+btn("detail-download","Save complete detail")+'</div><pre data-sdp="detail-json"></pre></section></div>';
 function click(event){const button=event.target.closest("[data-sdp-action]");if(!button||!root.contains(button))return;event.preventDefault();const handler=actions[button.dataset.sdpAction];if(handler)void run(()=>handler(button.dataset.id));}
 function change(event){
  const target=event.target;
  if(target===$("desk")){void run(()=>choose(target.value));return;}
  if(target.matches("[data-sdp-row]")){
   try{const index=Number(target.dataset.sdpRow),key=target.dataset.sdpKey;if(!draft.items[index])throw new Error("The original recipient row changed.");draft.items[index][key]=target.value;preview=null;retainDraft();renderPreview();controls();}catch(e){error(e);}return;
  }
  if(target.closest('[data-sdp="editor"]')&&target.name){try{editorInput();renderRecipients();controls();}catch(e){error(e);}return;}
  if(target===$("recipient-file"))void run(async()=>{const file=target.files?.[0];if(!file)return;try{if(file.size>16*1024*1024)throw new Error("Select a complete recipient CSV within 16 MiB.");editorInput();const parsed=parseCSV(await fileText(file));if(parsed.rows.length>10000)throw new Error("A batch contains at most 10,000 instructions.");draft.items=parsed.rows;preview=null;recipientOffset=0;retainDraft();renderRecipients();renderPreview();notify("Imported all "+parsed.rows.length+" original CSV rows. Preview validates the complete native contract.");}finally{target.value="";}});
  if(target===$("batch-file"))void run(async()=>{const file=target.files?.[0];if(!file)return;try{if(file.size>16*1024*1024)throw new Error("Select complete batch JSON within 16 MiB.");const next=JSON.parse(await fileText(file));if(canonical(next.scope)!==canonical(selected.scope))throw new Error("The imported batch scope differs from this exact desk.");if(!Array.isArray(next.items))throw new Error("The original batch has no items array.");draft=next;preview=null;retainDraft();renderEditor();}finally{target.value="";}});
  if(target===$("snapshot-file"))void run(async()=>{const file=target.files?.[0];if(!file)return;try{if(!preparedSourceId)throw new Error("Open the original prepared batch.");if(file.size>24*1024*1024)throw new Error("Use the original CLI for a complete snapshot larger than 24 MiB.");const snapshot=JSON.parse(await fileText(file));const result=await accepted("sdp.receive",{preparedSourceId,snapshot},"Receiving complete original snapshot");receiveResult(result);}finally{target.value="";}});
  if(target===$("history-kind")){historyFilter=target.value;historyOffset=0;renderSources();}
  if(target===$("review-problems")){reviewOffset=0;renderReview();}
 }
 function input(event){
  if(event.target===$("recipient-filter")){recipientOffset=0;renderRecipients();}
  if(event.target===$("review-filter")){reviewOffset=0;renderReview();}
  if(event.target===$("history-filter")){filter=event.target.value.toLowerCase();historyOffset=0;renderSources();}
 }
 function submit(event){if(event.target===$("editor")){event.preventDefault();void run(actions.preview);}}
 root.addEventListener("click",click);root.addEventListener("change",change);root.addEventListener("input",input);root.addEventListener("submit",submit);
 async function refresh(){
  if(disposed)return;if(loading)return loading;
  loading=tracked(async()=>{const result=await api.read("sdp.desks");desks=result.desks;
   $("desk").innerHTML=desks.map(x=>'<option value="'+esc(x.alias)+'">'+esc(x.label)+" · "+esc(x.programmeName)+" v"+x.programmeVersion+"</option>").join("");
   $("unconfigured").hidden=desks.length>0;
   if(!desks.length){$("content").hidden=true;return;}
   if(!selected)await choose(desks[0].alias);else{$("desk").value=selected.alias;await reload();}
  });try{await loading;}catch(e){error(e);}finally{loading=null;}
 }
 function dispose(){
  if(disposePromise)return disposePromise;disposed=true;
  const pending=(async()=>{
   root.removeEventListener("click",click);root.removeEventListener("change",change);root.removeEventListener("input",input);root.removeEventListener("submit",submit);
   while(active.size)await Promise.allSettled([...active]);
   let first=null;
   for(const url of [...urls])try{URL.revokeObjectURL(url);urls.delete(url);}catch(error){first??=error;}
   if(first)throw first;
  })();
  disposePromise=pending;pending.catch(()=>{if(disposePromise===pending)disposePromise=null;});return pending;
 }
 return {refresh,dispose};
}
