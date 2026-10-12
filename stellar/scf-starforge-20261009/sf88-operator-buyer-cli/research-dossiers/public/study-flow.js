// MIT. Complete Study Flow operator inside the original authenticated Research workspace.
import {openStudyExtractionDrafts} from './study-extraction-drafts.js';

const SCHEMA='sf88-research-study-flow-definition/v1';
const ROUTES=[['database','Database'],['register','Register'],['website','Website'],['organisation','Organisation'],['citation','Citation searching'],['other','Other method']];
const TEMPLATES=[['new-databases','New review · databases/registers'],['new-all-sources','New review · all sources'],
 ['update-databases','Update · databases/registers'],['update-all-sources','Update · all sources']];
const NAV=[['diagram','Diagram'],['sources','Source selection'],['records','Records'],['reports','Reports & studies'],
 ['counts','Counts & exclusions'],['previous','Previous review'],['history','Editions & handoff'],['definition','Complete definition']];
const array=v=>Array.isArray(v)?v:[],copy=v=>structuredClone(v),json=v=>JSON.stringify(v,null,2);
const text=v=>v===null||v===undefined?'':typeof v==='string'?v:json(v);
const number=v=>v===null||v===undefined?'Not established':new Intl.NumberFormat().format(v);
const emptyBasis=()=>({editionIds:[],occurrenceIds:[],reference:'',locator:'',note:''});
const unique=v=>[...new Set(v)];
const inputIds=value=>unique(value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean));
function el(tag,value,cls){const n=document.createElement(tag);if(value!==undefined&&value!==null)n.textContent=String(value);if(cls)n.className=cls;return n;}
function append(parent,...children){for(const child of children.flat())if(child)parent.append(child);return parent;}
function heading(title,description){return append(el('header',null,'sf-heading'),el('h3',title),description?el('p',description,'sf-muted'):null);}
function detail(title,value){const d=el('details');append(d,el('summary',title),el('pre',json(value)));return d;}
function pill(value){return el('span',value,'sf-pill');}
function select(options,value,changed,{empty='Select…',disabled=false,multiple=false}={}){
 const n=el('select');n.multiple=multiple;n.disabled=disabled;
 if(!multiple&&empty!==false)append(n,Object.assign(el('option',empty),{value:''}));
 for(const [key,label]of options)append(n,Object.assign(el('option',label),{value:String(key),selected:multiple?array(value).includes(key):String(key)===String(value??'')}));
 if(!multiple)n.value=value??'';n.addEventListener('change',()=>changed(multiple?[...n.selectedOptions].map(v=>v.value):n.value));return n;
}
function field(label,value,changed,{type='text',rows=3,placeholder='',disabled=false,maxLength=undefined,key}={}){
 const wrapper=el('label',null,'sf-field');append(wrapper,el('span',label));
 const input=el(type==='textarea'?'textarea':'input');if(type==='textarea')input.rows=rows;else input.type=type;
 input.value=text(value);input.placeholder=placeholder;input.disabled=disabled;if(maxLength)input.maxLength=maxLength;
 if(key)input.dataset.sf=key;input.addEventListener('input',()=>changed(input.value));wrapper.append(input);return wrapper;
}
function labeled(label,control){return append(el('label',null,'sf-field'),el('span',label),control);}
function checkbox(label,checked,changed,{disabled=false}={}){
 const n=el('input');n.type='checkbox';n.checked=Boolean(checked);n.disabled=disabled;n.addEventListener('change',()=>changed(n.checked));
 return append(el('label',null,'sf-check'),n,el('span',label));
}
function button(label,action,{disabled=false,primary=false,key}={}){
 const n=el('button',label,primary?'sf-primary':'');n.type='button';n.disabled=disabled;if(key)n.dataset.sf=key;
 n.addEventListener('click',action);return n;
}
function table(headers,rows,draw,{empty='No rows in this selection.'}={}){
 if(!rows.length)return el('p',empty,'sf-muted');
 const t=el('table'),head=el('thead'),tr=el('tr');headers.forEach(v=>tr.append(el('th',v)));head.append(tr);t.append(head);
 const body=el('tbody');rows.forEach((row,index)=>{const tr=el('tr');draw(row,index).forEach(value=>tr.append(append(el('td'),value instanceof Node?value:el('span',text(value)))));body.append(tr);});
 t.append(body);return append(el('div',null,'sf-table'),t);
}
const emptyDefinition=(questionId='')=>({schema:SCHEMA,name:'Study flow',description:'',template:'new-all-sources',questionId,reviewId:null,
 workSetIds:[],editionIds:[],routes:[],stages:[],records:[],retrievals:[],reportAnchors:[],reportedCounts:[],exclusionReasons:[],
 previous:{editionId:null,studyIdsRemoved:[],reportKeysRemoved:[],studyLinks:[],reportLinks:[],membership:[],reason:'',basis:emptyBasis()},
 coverage:{statement:'',completeSearch:false,screeningBy:'unspecified',screeningByHuman:null,screeningByAutomation:null},notes:''});
const messages={
 FLOW_ATTRIBUTED_BASIS_REQUIRED:'Add the original source reference or selected source IDs, and a locator.',
 FLOW_ACCOUNTING_REQUIRES_CORRECTION:'Correct the reported accounting differences before marking this edition reviewed.',
 FLOW_SOURCE_SELECTION_CHANGED_REFRESH_REQUIRED:'The selected source or previous edition differs from the saved basis. Choose Refresh from current dossier.',
 FLOW_EDITION_CHANGED:'Another diagram edition was saved. Load its current edition and preserve this draft as a new edit.',
 FLOW_REQUEST_CHANGED:'This saved request ID already belongs to a different payload. Recover the original request or prepare a new one.',
 REVISION_CONFLICT:'The original dossier changed. This draft and the exact prepared request are retained. Review the current source before rebasing.',
 FLOW_PREVIOUS_MEMBERSHIP_ID_UNKNOWN:'A carry-forward membership refers to an identity outside the retained included studies or reports.',
 FLOW_FULLTEXT_STAGE_NOT_DECLARED:'Choose an original stage whose protocol explicitly requires full text.',
 FLOW_QUERY_INVALID:'The selected source query is not supported.',
};
export function createStudyFlowPanel({root,tab,api,task,notify,getDossier,getWorkspace,isBusy,onReceived}){
 const storage=openStudyExtractionDrafts();
 const st={shown:false,closed:false,context:null,contextKey:null,epoch:0,revision:0,needsLoad:false,loading:false,
 overview:null,source:null,definition:null,flowId:null,editionId:null,basisEditionId:null,sourceMode:'current',
 baseRevision:0,dirty:false,readOnly:false,report:null,svg:'',reportDirty:true,actor:{id:'',name:''},reason:'',
 importFile:null,view:'diagram',query:'',page:0,selected:new Set(),recordId:null,reportKey:null,metricId:null,
 history:[],historyOffset:0,historyTotal:0,pending:[],draftRecord:null,storageError:null,mutation:0,editorDrafts:{},editorBaselines:{},editorDirty:false,draftHistory:[]};
 let persistTimer,persistQueue=Promise.resolve();
 const scope=()=>{if(!st.context)throw Error('Open the original dossier before editing a flow.');return copy(st.context);};
 const endpoint=suffix=>'/api/dossiers/'+encodeURIComponent(st.context.dossierId)+'/study-flow'+suffix;
 const params=value=>{const p=new URLSearchParams();for(const[k,v]of Object.entries(value))if(v!==undefined&&v!==null)p.set(k,String(v));return p.size?'?'+p:'';};
 const call=(suffix,options={})=>api(endpoint(suffix),{sourceProjection:'full',workspaceId:st.context.workspaceId,...options});
 const readOnly=()=>st.readOnly||isBusy()||st.loading;
 const error=err=>messages[err.code??err.message]??err.detail??String(err.message??err).replaceAll('_',' ');
 const currentFlow=()=>st.overview?.flows.find(v=>v.id===st.flowId);
 const snapshot=()=>({version:1,workspaceId:st.context.workspaceId,dossierId:st.context.dossierId,flowId:st.flowId,editionId:st.editionId,
 basisEditionId:st.basisEditionId,sourceMode:st.sourceMode,baseRevision:st.baseRevision,definition:copy(st.definition),
 actor:copy(st.actor),reason:st.reason,importFile:copy(st.importFile),dirty:st.dirty,
 editorDrafts:copy(st.editorDrafts),editorBaselines:copy(st.editorBaselines),editorDirty:st.editorDirty,updatedAt:new Date().toISOString()});
 function schedulePersist(){
 if(!st.context||!st.definition)return;
 clearTimeout(persistTimer);persistTimer=setTimeout(()=>persist().catch(err=>notify(error(err),'error')),220);
 }
 async function persist(){
 clearTimeout(persistTimer);if(!st.context||!st.definition)return;
 const context=scope(),value=snapshot();st.draftRecord=value;
 const work=()=>storage.put(context,'study-flow/draft',value);
 persistQueue=persistQueue.catch(()=>{}).then(work);
 try{await persistQueue;st.storageError=null;}
 catch(err){st.storageError='Could not save this browser draft: '+error(err);throw err;}
 }
 function changed({render=false}={}){
 st.dirty=true;st.reportDirty=true;st.mutation++;st.editorDirty=hasPendingEditors();schedulePersist();updateSummary();
 if(render)draw();
 }
 async function run(work){
 if(st.closed||isBusy()||st.loading)return;
 st.loading=true;
 try{await task(async()=>{try{await work();}catch(err){notify(error(err),'error');throw err;}});}
 finally{st.loading=false;draw();}
 }
 function applySnapshot(v){
 st.definition=copy(v.definition);st.flowId=v.flowId??null;st.editionId=v.editionId??null;
 st.basisEditionId=v.basisEditionId??null;st.sourceMode=v.sourceMode??'current';st.baseRevision=v.baseRevision;
 st.actor=copy(v.actor??st.actor);st.reason=v.reason??'';st.importFile=copy(v.importFile??null);st.dirty=Boolean(v.dirty);
 st.editorDrafts=copy(v.editorDrafts??{});st.editorBaselines=copy(v.editorBaselines??{});st.editorDirty=Boolean(v.editorDirty)||hasPendingEditors();
 st.readOnly=false;st.report=null;st.svg='';st.reportDirty=true;st.selected.clear();
 }
 async function loadSource(){
 const epoch=st.epoch,questionId=st.definition?.questionId||undefined;
 const value=await call('/sources'+params({revision:st.revision,questionId,reviewId:st.definition?.reviewId||undefined,limit:100}));
 if(epoch!==st.epoch)return;st.source=value;
 }
 async function loadOverview({restore=true}={}){
 const epoch=st.epoch,context=scope();st.needsLoad=false;
 const value=await call('');
 if(epoch!==st.epoch)return;
 st.overview=value;st.revision=value.dossier.revision;st.needsLoad=false;
 if(!st.definition){
 const saved=restore?await storage.get(context,'study-flow/draft'):null;
 if(epoch!==st.epoch)return;
 if(saved?.workspaceId===context.workspaceId&&saved.dossierId===context.dossierId&&saved.definition)applySnapshot(saved);
 else{st.definition=emptyDefinition();st.baseRevision=st.revision;}
 }
 await loadSource();
 if(!st.definition.questionId&&st.source?.questions.length===1&&!st.dirty&&!st.editorDirty){
 st.definition.questionId=st.source.questions[0].id;await loadSource();
 }
 if(st.flowId&&!st.dirty&&!st.editorDirty&&!st.readOnly){
 const current=st.overview.flows.find(v=>v.id===st.flowId);
 if(current)await loadEdition(current.currentEditionId,{keepActor:true,persist:false});
 }
 st.pending=(await storage.list(context,'study-flow/request/')).map(v=>v.value).sort((a,b)=>a.preparedAt.localeCompare(b.preparedAt));
 st.draftRecord=await storage.get(context,'study-flow/draft');draw();
 }
 async function loadEdition(editionId,{keepActor=true,persist:save=false}={}){
 const epoch=st.epoch;
 const value=await call('/report'+params({revision:st.revision,editionId}));
 if(epoch!==st.epoch)return;
 st.flowId=value.report.flowId;st.editionId=editionId;st.definition=copy(value.report.definition);
 st.report=value.report;st.svg=value.svg;st.reportDirty=false;st.dirty=false;st.readOnly=true;
 st.baseRevision=st.revision;st.basisEditionId=editionId;st.sourceMode='retained';st.importFile=null;
 if(!keepActor)st.actor=copy(value.report.edition.actor);st.reason='';
 st.selected.clear();st.recordId=null;st.reportKey=null;st.page=0;st.editorDrafts={};st.editorBaselines={};st.editorDirty=false;
 await loadSource();if(save)await persist();draw();
 }
 async function preview(){
 if(hasPendingEditors())throw Error('Apply or reset the edited form fields before previewing. All local inputs remain in this draft.');
 if(!st.definition?.questionId)throw Error('Select an original research question.');
 const epoch=st.epoch,mutation=st.mutation;
 const value=await call('/preview',{method:'POST',body:{expectedRevision:st.baseRevision,definition:st.definition,
 ...(st.flowId?{flowId:st.flowId}:{}),sourceMode:st.sourceMode,basisEditionId:st.basisEditionId}});
 if(epoch!==st.epoch||mutation!==st.mutation)return;
 st.report=value.report;st.svg=value.svg;st.definition=copy(value.report.definition);st.reportDirty=false;
 await persist();draw();
 }
 async function fetchOriginalDossier(){
 const context=scope(),view=await api('/api/dossiers/'+encodeURIComponent(context.dossierId),{
 workspaceId:context.workspaceId,sourceProjection:'inspection'});
 if(st.contextKey!==context.workspaceId+'/'+context.dossierId)return;
 await onReceived(view);st.revision=view.revision;
 }
 async function submit(request,{retainedRecord}={}){
 const context=scope(),route=endpoint('/reviews?projection=metadata');
 let record=retainedRecord??{schema:'sf88-study-flow-browser-request/v1',workspaceId:context.workspaceId,dossierId:context.dossierId,
 route,request:copy(request),preparedAt:new Date().toISOString(),state:'prepared'};
 if(record.workspaceId!==context.workspaceId||record.dossierId!==context.dossierId||record.route!==route)
 throw Error('The retained request belongs to a different workspace or dossier.');
 const key='study-flow/request/'+request.requestId,existing=await storage.get(context,key);
 if(existing&&(JSON.stringify(existing.request)!==JSON.stringify(record.request)||existing.route!==route))
 throw Error('The saved request ID is bound to another payload.');
 if(existing)record=existing;else await storage.put(context,key,record);
 if(st.contextKey===context.workspaceId+'/'+context.dossierId)st.pending=st.pending.filter(v=>v.request.requestId!==request.requestId).concat(record);
 try{
 const value=await api(route,{sourceProjection:'full',workspaceId:context.workspaceId,method:'POST',body:record.request});
 record={...record,state:'committed',completedAt:new Date().toISOString(),response:copy(value)};
 await storage.put(context,key,record);
 if(st.contextKey!==context.workspaceId+'/'+context.dossierId){notify('Saved the original flow request in its originating dossier.');return value;}
 st.pending=st.pending.filter(v=>v.request.requestId!==request.requestId).concat(record);
 st.flowId=value.operation.flowId;st.editionId=value.operation.result.edition?.id??value.operation.result.review?.editionId??st.editionId;
 st.baseRevision=value.dossier.revision;st.revision=value.dossier.revision;st.dirty=false;st.importFile=null;
 st.editorDrafts={};st.editorBaselines={};st.editorDirty=false;
 await fetchOriginalDossier();await loadOverview({restore:false});
 if(st.editionId)await loadEdition(st.editionId);await persist();
 notify(value.duplicate?'Recovered the original saved flow operation.':'Saved the study-flow '+request.action+' in the original dossier.');return value;
 }catch(err){
 if(record.state!=='committed'){
 record={...record,state:Number.isInteger(err.status)?'rejected':'outcome-unknown',error:{code:err.code??err.message,
 status:err.status??null},lastAttemptAt:new Date().toISOString()};
 await storage.put(context,key,record);if(st.contextKey===context.workspaceId+'/'+context.dossierId)
 st.pending=st.pending.filter(v=>v.request.requestId!==request.requestId).concat(record);
 }
 throw err;
 }
 }
 async function save(){
 await persist();
 if(hasPendingEditors())throw Error('Apply or reset the edited form fields before saving the edition. All local inputs remain in this draft.');
 const request={requestId:'flow_'+crypto.randomUUID(),expectedRevision:st.baseRevision,actor:copy(st.actor),action:'save',
 ...(st.flowId?{flowId:st.flowId}:{}),data:{definition:copy(st.definition),sourceMode:st.sourceMode,
 basisEditionId:st.basisEditionId,supersedes:currentFlow()?.currentEditionId??null,reason:st.reason,
 ...(st.importFile?{importFile:copy(st.importFile)}:{})}};
 return submit(request);
 }
 async function review(action){
 if(!st.flowId||!st.editionId)throw Error('Select a saved edition.');
 if(st.dirty||hasPendingEditors())throw Error('Save this draft as a new edition before reviewing it.');
 return submit({requestId:'flow_'+crypto.randomUUID(),expectedRevision:st.revision,actor:copy(st.actor),action,flowId:st.flowId,
 data:{editionId:st.editionId,reason:st.reason}});
 }
 function downloadLocal(filename,value,contentType='application/json; charset=utf-8'){
 const blob=new Blob([typeof value==='string'?value:json(value)+'\n'],{type:contentType}),url=URL.createObjectURL(blob);
 const a=el('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function downloadName(response,fallback){
 const disposition=response.headers.get('content-disposition')??'',encoded=disposition.match(/(?:^|;)\s*filename\*=UTF-8''([^;]*)/i)?.[1];
 let name=encoded?decodeURIComponent(encoded):disposition.match(/filename="([^"]+)"/i)?.[1]??fallback;
 if(!name||/[\/\\\u0000-\u001f\u007f]/.test(name))throw Error('The download filename is invalid.');return name;
 }
 async function download(format,section='counts'){
 if(!st.editionId)throw Error('Save an edition before exporting its source-bound report.');
 const response=await call('/export'+params({revision:st.revision,editionId:st.editionId,format,section}),{download:true});
 const blob=await response.blob(),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=downloadName(response,'study-flow.'+format);
 a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function downloadOriginal(row){
 const response=await api('/api/dossiers/'+encodeURIComponent(st.context.dossierId)+'/retained-editions/'+encodeURIComponent(row.editionId)+
 params({revision:st.report.source.sourceRevision}),{download:true,workspaceId:st.context.workspaceId});
 const blob=await response.blob(),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=downloadName(response,'original-source.json');
 a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function basisEditor(value,onChange){
 const box=el('div',null,'sf-grid');append(box,
 field('Source reference',value.reference,v=>{value.reference=v;onChange();},{placeholder:'Original file, saved edition, URL or source record'}),
 field('Exact locator',value.locator,v=>{value.locator=v;onChange();},{placeholder:'Page / record / count cell / original occurrence key'}),
 field('Native edition IDs · one per line',value.editionIds.join('\n'),v=>{value.editionIds=inputIds(v);onChange();},{type:'textarea',rows:2}),
 field('Native occurrence IDs · one per line',value.occurrenceIds.join('\n'),v=>{value.occurrenceIds=inputIds(v);onChange();},{type:'textarea',rows:2}),
 field('Source note',value.note,v=>{value.note=v;onChange();},{type:'textarea',rows:2}));return box;
 }
 function originalBasis(row){return{editionIds:[row.editionId],occurrenceIds:[row.occurrenceId],
 reference:row.sourceReference??'',locator:'Retained occurrence key '+row.key,note:''};}
 function editDefinition(){st.readOnly=false;st.sourceMode='retained';st.basisEditionId=st.editionId;st.baseRevision=st.revision;st.dirty=true;st.reason='';schedulePersist();draw();}
 async function freshDefinition(){
 await preserveWorkingDraft();st.editorDrafts={};st.editorBaselines={};st.editorDirty=false;
 st.definition=emptyDefinition(st.source?.questions.length===1?st.source.questions[0].id:'');st.flowId=null;st.editionId=null;
 st.sourceMode='current';st.basisEditionId=null;st.baseRevision=st.revision;st.readOnly=false;st.dirty=true;st.report=null;st.svg='';st.reason='';
 st.importFile=null;st.reportDirty=true;st.selected.clear();st.view='sources';schedulePersist();return loadSource();
 }
 function updateSummary(){
 const target=root.querySelector('[data-sf-summary]');if(!target)return;
 target.textContent='Dossier r'+st.revision+' · draft source r'+st.baseRevision+' · '+
 (st.readOnly?'Saved edition':st.dirty?'Working draft':'Draft')+(st.editorDirty?' · unapplied editor fields retained':'')+(st.reportDirty?' · preview needs refresh':'');
 root.dataset.dossierId=st.context?.dossierId??'';root.dataset.revision=String(st.revision);
 root.dataset.flowId=st.flowId??'';root.dataset.editionId=st.editionId??'';root.dataset.dirty=String(st.dirty||st.editorDirty);
 root.dataset.reportCurrent=String(!st.reportDirty);root.dataset.sfBusy=String(isBusy()||st.loading);
 }
 function actions(){
 const group=el('div',null,'sf-actions');append(group,
 button('Preview counts & diagram',()=>run(preview),{disabled:readOnly(),primary:true,key:'preview'}),
 button('Save new edition',()=>run(save),{disabled:readOnly()||!st.dirty,key:'save'}),
 button('New flow',()=>run(freshDefinition),{disabled:isBusy()||st.loading,key:'new'}),
 button('Refresh current dossier',()=>run(async()=>{await fetchOriginalDossier();await loadOverview({restore:false});}),{key:'refresh'}),
 st.editionId&&st.readOnly?button('Edit this saved edition',()=>editDefinition(),{key:'edit-edition'}):null,
 button('Download local draft',()=>downloadLocal('study-flow-working-draft.json',snapshot()),{disabled:!st.definition}));
 return group;
 }
 function reportNotice(container){
 if(!st.report){append(container,el('p','Preview the selected original source to see native records, counts and decisions.','sf-muted'));return false;}
 if(st.reportDirty)append(container,el('p','This report is from the last preview. The working definition has changed.','sf-notice'));
 append(container,el('p',(st.report.summary.reportingComplete?'Reporting complete':'Partial source/reporting coverage')+' · '+
 st.report.summary.errorCount+' accounting errors · '+st.report.summary.warningCount+' source notes · '+st.report.summary.unknownCounts+' unknown counts','sf-notice'));
 return true;
 }
 function diagramView(){
 const box=el('div');append(box,heading('Study flow','Preview the original retained eligibility source, then save a named edition.'));
 const grid=el('div',null,'sf-grid');append(grid,
 field('Diagram title',st.definition.name,v=>{st.definition.name=v;changed();},{disabled:readOnly(),maxLength:240,key:'name'}),
 labeled('Template',select(TEMPLATES,st.definition.template,v=>{st.definition.template=v;changed({render:true});},{empty:false,disabled:readOnly()})),
 field('Description',st.definition.description,v=>{st.definition.description=v;changed();},{type:'textarea',disabled:readOnly()}),
 field('Search/source coverage statement',st.definition.coverage.statement,v=>{st.definition.coverage.statement=v;changed();},{type:'textarea',disabled:readOnly(),key:'coverage'}));
 append(box,grid,checkbox('The selected sources and attributed counts cover the complete search being reported',st.definition.coverage.completeSearch,
 v=>{st.definition.coverage.completeSearch=v;changed();},{disabled:readOnly()}));
 if(reportNotice(box)){
 const svg=el('div',null,'sf-diagram'),parsed=new DOMParser().parseFromString(st.svg,'image/svg+xml');
 if(parsed.querySelector('parsererror'))svg.append(el('p','The rendered diagram could not be read.'));
 else svg.append(document.importNode(parsed.documentElement,true));
 append(box,svg,detail('Complete count derivation',st.report.counts));
 if(st.report.issues.length)append(box,table(['Level','Issue','Source / count'],
 st.report.issues,v=>[v.level,append(el('div'),el('strong',v.code),el('p',v.message)),
 detail('Details',v)]));
 }
 return box;
 }
 function sourceView(){
 const box=el('div');append(box,heading('Original source selection','A source edition, work set and protocol stage remain tied to their original IDs. Provider names do not select identification methods automatically.'));
 const source=st.source;if(!source)return append(box,el('p','Loading original source metadata…'));
 const questions=source.questions.map(v=>[v.id,v.text]),reviews=source.reviews.map(v=>[v.id,v.name??v.id]);
 append(box,labeled('Research question',select(questions,st.definition.questionId,v=>run(async()=>{
 await preserveWorkingDraft();const before=st.definition;st.editorDrafts={};st.editorBaselines={};st.editorDirty=false;st.definition=emptyDefinition(v);st.definition.name=before.name;st.definition.template=before.template;
 st.flowId=null;st.editionId=null;st.basisEditionId=null;st.sourceMode='current';st.baseRevision=st.revision;
 st.report=null;st.svg='';changed();await loadSource();
 }),{disabled:readOnly()||Boolean(st.flowId)})));
 append(box,labeled('Original eligibility review',select(reviews,st.definition.reviewId,v=>run(async()=>{
 st.definition.reviewId=v||null;st.definition.workSetIds=[];st.definition.stages=[];changed();await loadSource();
 }),{disabled:readOnly(),empty:'No native eligibility review selected'})));
 append(box,el('h4','Work sets and native stage roles'));
 for(const set of source.workSets){
 const selected=st.definition.workSetIds.includes(set.id),part=el('div',null,'sf-card');
 append(part,checkbox(set.name+' · '+set.id,selected,v=>{
 st.definition.workSetIds=v?unique([...st.definition.workSetIds,set.id]):st.definition.workSetIds.filter(id=>id!==set.id);
 if(!v)st.definition.stages=st.definition.stages.filter(row=>row.workSetId!==set.id);changed({render:true});
 },{disabled:readOnly()}),el('p',set.occurrenceIds.length+' original occurrences; protocol '+set.protocolId,'sf-muted'));
 if(selected){
 let mapping=st.definition.stages.find(v=>v.workSetId===set.id);
 if(!mapping)mapping={workSetId:set.id,screening:[],fullText:[]};
 const protocol=source.protocols.find(v=>v.id===set.protocolId);
 const put=(key,value)=>{mapping={...mapping,[key]:value};st.definition.stages=st.definition.stages.filter(v=>v.workSetId!==set.id).concat(mapping);changed();};
 append(part,labeled('Screening stages · select all applicable stages',select(array(protocol?.definition.stages).map(v=>[v.id,v.name]),
 mapping.screening,v=>put('screening',v),{multiple:true,disabled:readOnly()})),
 labeled('Full-text assessment stages',select(array(protocol?.definition.stages).filter(v=>v.requireFullText).map(v=>[v.id,v.name]),
 mapping.fullText,v=>put('fullText',v),{multiple:true,disabled:readOnly()})),detail('Original protocol',protocol));
 }
 box.append(part);
 }
 append(box,button('Select original editions from the chosen work sets',()=>{
 st.definition.editionIds=unique(source.workSets.filter(v=>st.definition.workSetIds.includes(v.id)).flatMap(v=>v.editionIds));
 st.definition.routes=st.definition.routes.filter(v=>st.definition.editionIds.includes(v.editionId));changed({render:true});
 },{disabled:readOnly()}),el('h4','Source editions and identification routes'));
 for(const edition of source.editions){
 const selected=st.definition.editionIds.includes(edition.id),route=st.definition.routes.find(v=>v.editionId===edition.id);
 const part=el('div',null,'sf-card');
 append(part,checkbox(edition.label+' · '+edition.occurrenceCount+' original records',selected,v=>{
 st.definition.editionIds=v?unique([...st.definition.editionIds,edition.id]):st.definition.editionIds.filter(id=>id!==edition.id);
 if(!v)st.definition.routes=st.definition.routes.filter(row=>row.editionId!==edition.id);changed({render:true});
 },{disabled:readOnly()}),el('p',edition.id+' · '+edition.provider+' · '+edition.raw.bytes+' B · '+edition.raw.sha256,'sf-code'));
 if(selected)append(part,labeled('Identification method',select(ROUTES,route?.kind,v=>{
 st.definition.routes=st.definition.routes.filter(row=>row.editionId!==edition.id);
 if(v)st.definition.routes.push({editionId:edition.id,kind:v,label:route?.label??edition.label});changed();
 },{disabled:readOnly()})),field('Route/source label',route?.label??edition.label,v=>{
 const row=st.definition.routes.find(x=>x.editionId===edition.id);if(row){row.label=v;changed();}
 },{disabled:readOnly()}));
 append(part,detail('Original source metadata',edition));box.append(part);
 }
 append(box,el('h4','Source revision for the next edition'),labeled('Source mode',select([['current','Refresh from the current original dossier'],
 ['retained','Keep the selected saved source basis']],st.sourceMode,v=>{st.sourceMode=v;if(v==='current')st.basisEditionId=null;changed();},
 {empty:false,disabled:readOnly()||!st.flowId})),button('Use the current dossier revision for this draft',()=>run(async()=>{
 await fetchOriginalDossier();st.baseRevision=st.revision;st.sourceMode='current';st.basisEditionId=null;
 changed();await loadSource();}),{disabled:readOnly()}));
 return box;
 }
 function searchTable(kind,rows,columns,drawRow){
 const box=el('div');append(box,field('Find in these '+kind,st.query,v=>{st.query=v;st.page=0;draw();},{key:'search'}));
 const filtered=rows.filter(v=>JSON.stringify(v).toLocaleLowerCase().includes(st.query.toLocaleLowerCase()));
 const start=st.page*30,selected=filtered.slice(start,start+30);
 append(box,el('p',(filtered.length?start+1:0)+'–'+(start+selected.length)+' of '+filtered.length+' '+kind,'sf-muted'),
 table(columns,selected,drawRow),append(el('div',null,'sf-actions'),
 button('Previous',()=>{st.page=Math.max(0,st.page-1);draw();},{disabled:st.page===0}),
 button('Next',()=>{st.page++;draw();},{disabled:start+30>=filtered.length})));
 return box;
 }
 function recordsView(){
 const box=el('div');append(box,heading('Records and duplicate treatment','Every selected original occurrence remains available. A duplicate removes a record, while the retained report and study identities remain distinct.'));
 if(!reportNotice(box))return box;
 append(box,searchTable('records',st.report.records,['Select','Original record','Route','Disposition','Screening','Report'],row=>[
 checkbox('',st.selected.has(row.occurrenceId),v=>{if(v)st.selected.add(row.occurrenceId);else st.selected.delete(row.occurrenceId);}),
 button(row.title||row.occurrenceId,()=>{st.recordId=row.occurrenceId;draw();}),row.route?.kind??'unassigned',row.disposition,
 row.screening.status,row.reportKey]));
 const batch=el('details'),batchState=buffer('record-batch',()=>({disposition:'other-removal',reason:'',basis:emptyBasis()}));
 append(batch,el('summary','Apply a shared disposition to explicitly selected records ('+st.selected.size+')'),
 labeled('Disposition',select([['candidate','Retained candidate'],['automation','Removed using automation'],['other-removal','Other pre-screen removal'],['outside-scope','Outside this flow']],
 batchState.disposition,v=>{batchState.disposition=v;},{empty:false,disabled:readOnly()})),
 field('Shared reason',batchState.reason,v=>{batchState.reason=v;},{type:'textarea',disabled:readOnly()}),basisEditor(batchState.basis,bufferMark),
 button('Apply to these selected record IDs',()=>{
 const picked=st.report.records.filter(v=>st.selected.has(v.occurrenceId));
 if(!picked.length){notify('Select the original records first.','error');return;}
 if(!batchState.reason.trim()){notify('Record a reason for the shared disposition.','error');return;}
 const rules=picked.map(row=>({...copy(st.definition.records.find(v=>v.occurrenceId===row.occurrenceId)??{
 occurrenceId:row.occurrenceId,workSetId:row.workSetId,reportKey:null}),disposition:batchState.disposition,duplicateOf:null,
 reason:batchState.reason,basis:copy(batchState.basis)}));
 st.definition.records=st.definition.records.filter(v=>!st.selected.has(v.occurrenceId)).concat(rules);clearBuffer('record-batch');changed({render:true});
 },{disabled:readOnly()}),detail('Exact selected occurrence IDs',[...st.selected]));
 box.append(batch);
 const row=st.report.records.find(v=>v.occurrenceId===st.recordId);if(!row)return box;
 const draft=buffer('record/'+row.occurrenceId,()=>copy(st.definition.records.find(v=>v.occurrenceId===row.occurrenceId)??{occurrenceId:row.occurrenceId,
 workSetId:row.workSetId,disposition:'candidate',duplicateOf:null,reportKey:null,reason:'',basis:originalBasis(row)}));
 const editor=el('div',null,'sf-card');append(editor,heading(row.title||row.occurrenceId,row.occurrenceId),
 labeled('Record disposition',select([['candidate','Retained candidate'],['duplicate','Duplicate record'],['automation','Removed using automation'],
 ['other-removal','Other pre-screen removal'],['outside-scope','Outside this flow']],draft.disposition,v=>{draft.disposition=v;if(v!=='duplicate')draft.duplicateOf=null;},
 {empty:false,disabled:readOnly()})),
 labeled('Retained duplicate target',select(st.report.records.filter(v=>v.occurrenceId!==row.occurrenceId&&v.disposition==='candidate').map(v=>[v.occurrenceId,(v.title||v.occurrenceId)+' · '+v.occurrenceId]),
 draft.duplicateOf,v=>{draft.duplicateOf=v||null;},{disabled:readOnly(),empty:'No duplicate target'})),
 labeled('Original work set to report',select(st.source.workSets.filter(v=>v.occurrenceIds.includes(row.occurrenceId)).map(v=>[v.id,v.name]),
 draft.workSetId,v=>{draft.workSetId=v||null;},{disabled:readOnly(),empty:'No explicit work set'})),
 field('Explicit report key · blank uses the original canonical report',draft.reportKey??'',v=>{draft.reportKey=v||null;},{disabled:readOnly()}),
 field('Reason',draft.reason,v=>{draft.reason=v;},{type:'textarea',disabled:readOnly()}),basisEditor(draft.basis,bufferMark),
 append(el('div',null,'sf-actions'),button('Apply record decision',()=>{
 st.definition.records=st.definition.records.filter(v=>v.occurrenceId!==row.occurrenceId).concat(copy(draft));clearBuffer('record/'+row.occurrenceId);changed({render:true});
 },{disabled:readOnly(),primary:true,key:'record-apply'}),button('Use original record assignment',()=>{
 st.definition.records=st.definition.records.filter(v=>v.occurrenceId!==row.occurrenceId);clearBuffer('record/'+row.occurrenceId);changed({render:true});
 },{disabled:readOnly()}),button('Download the original source edition',()=>run(()=>downloadOriginal(row)))),
 detail('Original record, resolutions and full source binding',row));
 return append(box,editor);
 }

 function reportsView(){
 const box=el('div');append(box,heading('Retrieval, reports and study identities',
 'Native full-text availability is retained. Record an explicit retrieval outcome when the earlier source does not establish whether a report was sought.'));
 if(!reportNotice(box))return box;
 append(box,searchTable('reports',st.report.reports,['Report','Original records','Route','Retrieval','Assessment','Study IDs'],row=>[
 button(row.title||row.reportKey,()=>{st.reportKey=row.reportKey;draw();}),row.occurrenceIds.length,row.lane??'unassigned',
 row.retrieval,row.assessment,row.studyIds.join('\n')]));
 const row=st.report.reports.find(v=>v.reportKey===st.reportKey);
 if(row){
 const draft=buffer('retrieval/'+row.reportKey,()=>copy(st.definition.retrievals.find(v=>v.reportKey===row.reportKey)??{
 reportKey:row.reportKey,status:'sought',reason:'',basis:{...emptyBasis(),occurrenceIds:row.occurrenceIds,
 editionIds:unique(row.sourceRows.map(v=>v.editionId))}}));
 const anchor=buffer('anchor/'+row.reportKey,()=>copy(st.definition.reportAnchors.find(v=>v.reportKey===row.reportKey)??{
 reportKey:row.reportKey,occurrenceId:row.outcomeOccurrenceId??'',reason:''}));
 append(box,heading(row.title||row.reportKey,row.reportKey),labeled('Retained retrieval outcome',
 select([['not-sought','Not sought'],['sought','Sought; retrieval incomplete'],['retrieved','Retrieved'],
 ['not-retrieved','Sought and not retrieved']],draft.status,v=>{draft.status=v;},{empty:false,disabled:readOnly()})),
 field('Retrieval reason',draft.reason,v=>{draft.reason=v;},{type:'textarea',disabled:readOnly()}),basisEditor(draft.basis,bufferMark),
 append(el('div',null,'sf-actions'),button('Apply retrieval outcome',()=>{
 st.definition.retrievals=st.definition.retrievals.filter(v=>v.reportKey!==row.reportKey).concat(copy(draft));clearBuffer('retrieval/'+row.reportKey);changed({render:true});
 },{disabled:readOnly(),primary:true,key:'retrieval-apply'}),button('Use original retrieval basis',()=>{
 st.definition.retrievals=st.definition.retrievals.filter(v=>v.reportKey!==row.reportKey);clearBuffer('retrieval/'+row.reportKey);changed({render:true});
 },{disabled:readOnly()})),el('h4','Source anchor for a report with several records'),
 labeled('Original occurrence whose outcome is reported',select(row.occurrenceIds.map(id=>{
 const record=st.report.records.find(v=>v.occurrenceId===id);return[id,(record?.title??id)+' · '+id];}),
 anchor.occurrenceId,v=>{anchor.occurrenceId=v;},{disabled:readOnly()})),
 field('Reason for this source anchor',anchor.reason,v=>{anchor.reason=v;},{type:'textarea',disabled:readOnly()}),
 button('Apply source anchor',()=>{st.definition.reportAnchors=st.definition.reportAnchors.filter(v=>v.reportKey!==row.reportKey).concat(copy(anchor));
 clearBuffer('anchor/'+row.reportKey);changed({render:true});},{disabled:readOnly()}),detail('Complete original report and retrieval evidence',row));
 }
 append(box,el('h4','Original explicit study groups'),table(['Study','Included','Original reports','Evidence'],st.report.studies,
 row=>[row.name+' · '+row.id,String(row.included),row.reportKeys.join('\n'),detail('Original linking evidence',row.evidence)]),
 el('h4','Included report ↔ study membership'),table(['Report','Study','Provenance'],st.report.included.reportStudyLinks,
 row=>[row.reportKey,row.studyId,detail('Retained / derived / reported membership',row.provenance)]),
 button('Open the original Eligibility pane',()=>document.querySelector('[data-tab="eligibility"]')?.click()));
 return box;
 }
 function countsView(){
 const box=el('div');append(box,heading('Counts and exclusion reasons',
 'A blank reported count remains unknown. Each replacement count retains its source, exact locator and reason; the original native members remain visible.'));
 if(!reportNotice(box))return box;
 const metrics=st.report.counts.filter(v=>st.report.activeMetricIds.includes(v.id));
 append(box,table(['Count','Reported','Native derived','Known members','Unit','Basis'],metrics,row=>[
 button(row.label,()=>{st.metricId=row.id;draw();}),number(row.value),number(row.derivedValue),row.knownCount,row.unit,row.mode]));
 const metric=metrics.find(v=>v.id===st.metricId);
 if(metric){
 const draft=buffer('count/'+metric.id,()=>copy(st.definition.reportedCounts.find(v=>v.metric===metric.id)??{
 metric:metric.id,value:metric.value,reason:'',basis:emptyBasis()}));
 append(box,heading(metric.label,metric.id+' · '+metric.unit),
 field('Reported nonnegative integer · blank means unknown',draft.value??'',v=>{
 draft.value=v===''?null:/^(0|[1-9][0-9]*)$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):v;
 },{disabled:readOnly(),key:'count-value'}),field('Reason for the reported value',draft.reason,v=>{draft.reason=v;},{type:'textarea',disabled:readOnly()}),
 basisEditor(draft.basis,bufferMark),append(el('div',null,'sf-actions'),
 button('Use this attributed count',()=>{st.definition.reportedCounts=st.definition.reportedCounts.filter(v=>v.metric!==metric.id).concat(copy(draft));
 clearBuffer('count/'+metric.id);changed({render:true});},{disabled:readOnly(),primary:true,key:'count-apply'}),
 button('Use the native derived count',()=>{st.definition.reportedCounts=st.definition.reportedCounts.filter(v=>v.metric!==metric.id);
 clearBuffer('count/'+metric.id);changed({render:true});},{disabled:readOnly()})),detail('Original member IDs and derivation',metric));
 }
 append(box,el('h4','Import a complete original data,n CSV'));
 const csvForm=buffer('csv-import',()=>({reason:'',reference:''})),file=el('input');file.type='file';file.accept='.csv,text/csv';file.disabled=readOnly();file.dataset.sf='counts-file';
 file.addEventListener('change',()=>run(async()=>{
 const picked=file.files?.[0];if(!picked)return;if(picked.size>1024*1024)throw Error('The original count file exceeds 1 MiB.');
 const body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await picked.arrayBuffer());
 const value=await call('/import-counts',{method:'POST',body:{expectedRevision:st.baseRevision,body,filename:picked.name,
 reference:csvForm.reference,reason:csvForm.reason}});
 const keys=new Set(value.counts.map(v=>v.metric));
 st.definition.reportedCounts=st.definition.reportedCounts.filter(v=>!keys.has(v.metric)).concat(value.counts);
 st.importFile=value.importFile;clearBuffer('csv-import');changed({render:true});
 notify('Retained all original CSV bytes and '+value.counts.length+' attributed counts. Preview before saving.');
 }));
 append(box,field('CSV source reference',csvForm.reference,v=>{csvForm.reference=v;},{disabled:readOnly()}),
 field('Reason for using these counts',csvForm.reason,v=>{csvForm.reason=v;},{type:'textarea',disabled:readOnly()}),file,
 st.importFile?detail('Original imported count file retained for the next save',{filename:st.importFile.filename,body:st.importFile.body}):null);
 append(box,el('h4','Complete full-text exclusion reasons'),
 table(['Route','Reason','Count','Basis'],st.report.exclusionReasons,row=>[row.lane,row.label,number(row.value),row.mode]));
 const reasons=buffer('exclusion-reason',()=>({lane:'databases',label:'',value:null,reason:'',basis:emptyBasis()}));
 append(box,labeled('Identification route',select([['databases','Databases and registers'],['other','Other methods']],reasons.lane,v=>{reasons.lane=v;},{empty:false,disabled:readOnly()})),
 field('Exclusion reason label',reasons.label,v=>{reasons.label=v;},{disabled:readOnly()}),
 field('Number of reports · blank means unknown',reasons.value??'',v=>{reasons.value=v===''?null:/^(0|[1-9][0-9]*)$/.test(v)?Number(v):v;},{disabled:readOnly()}),
 field('Reason / source interpretation',reasons.reason,v=>{reasons.reason=v;},{type:'textarea',disabled:readOnly()}),basisEditor(reasons.basis,bufferMark),
 append(el('div',null,'sf-actions'),button('Add or replace this reason count',()=>{
 st.definition.exclusionReasons=st.definition.exclusionReasons.filter(v=>v.lane!==reasons.lane||v.label!==reasons.label).concat(copy(reasons));
 clearBuffer('exclusion-reason');changed({render:true});
 },{disabled:readOnly()}),button('Use all original reason counts for this route',()=>{
 st.definition.exclusionReasons=st.definition.exclusionReasons.filter(v=>v.lane!==reasons.lane);changed({render:true});
 },{disabled:readOnly()})));
 if(st.definition.exclusionReasons.length)append(box,table(['Reported route','Label','Value','Edit'],st.definition.exclusionReasons,row=>[
 row.lane,row.label,number(row.value),button('Remove this reported reason',()=>{
 st.definition.exclusionReasons=st.definition.exclusionReasons.filter(v=>v!==row);changed({render:true});},{disabled:readOnly()})]));
 append(box,el('h4','Screening method disclosure'),labeled('Who made screening exclusions?',
 select([['unspecified','Not specified'],['human','Human reviewers'],['automation','Automation'],['mixed','Human and automation']],
 st.definition.coverage.screeningBy,v=>{st.definition.coverage.screeningBy=v;changed({render:true});},{empty:false,disabled:readOnly()})));
 if(st.definition.coverage.screeningBy==='mixed')append(box,field('Human screening exclusions',st.definition.coverage.screeningByHuman??'',v=>{
 st.definition.coverage.screeningByHuman=v===''?null:Number(v);changed();},{disabled:readOnly()}),
 field('Automated screening exclusions',st.definition.coverage.screeningByAutomation??'',v=>{
 st.definition.coverage.screeningByAutomation=v===''?null:Number(v);changed();},{disabled:readOnly()}));
 return box;
 }
 function previousView(){
 const box=el('div');append(box,heading('Previous review and update identities',
 'Carry forward the original saved review. New source records may represent already included reports; explicit identity mappings prevent double counting.'));
 if(!st.definition.template.startsWith('update-'))return append(box,el('p','Choose an Update template to edit the previous-review branch.'));
 const previous=st.definition.previous;
 const editions=array(st.overview?.editions).filter(v=>v.id!==st.editionId).map(v=>[v.id,v.name+' · edition '+v.number+' · '+v.id]);
 append(box,labeled('Previous saved diagram edition',select(editions,previous.editionId,v=>{previous.editionId=v||null;changed();},
 {empty:'Counts supplied from an attributed external source',disabled:readOnly()})),
 field('Prior study IDs omitted from this update · one per line',previous.studyIdsRemoved.join('\n'),v=>{previous.studyIdsRemoved=inputIds(v);changed();},{type:'textarea',disabled:readOnly()}),
 field('Prior report keys omitted from this update · one per line',previous.reportKeysRemoved.join('\n'),v=>{previous.reportKeysRemoved=inputIds(v);changed();},{type:'textarea',disabled:readOnly()}),
 field('Reason for carry-forward changes',previous.reason,v=>{previous.reason=v;changed();},{type:'textarea',disabled:readOnly()}),
 basisEditor(previous.basis,()=>changed()));
 if(st.report?.source.previous)append(box,detail('Exact previous edition counts and report–study links',st.report.source.previous));
 for(const kind of ['study','report']){
 const key=kind==='study'?'studyLinks':'reportLinks',draft=buffer('previous-'+kind,()=>({current:'',previous:'',reason:''}));
 append(box,el('h4',kind==='study'?'Map current study IDs to previously included studies':'Map current report keys to previously included reports'),
 table(['Current','Previous','Reason',''],previous[key],row=>[row.current,row.previous,row.reason,button('Remove',()=>{
 previous[key]=previous[key].filter(v=>v!==row);changed({render:true});},{disabled:readOnly()})]),
 field('Current '+kind+' identity',draft.current,v=>{draft.current=v;},{disabled:readOnly()}),
 field('Previous '+kind+' identity',draft.previous,v=>{draft.previous=v;},{disabled:readOnly()}),
 field('Why these refer to the same '+kind,draft.reason,v=>{draft.reason=v;},{type:'textarea',disabled:readOnly()}),
 button('Apply '+kind+' identity link',()=>{previous[key]=previous[key].filter(v=>v.current!==draft.current).concat(copy(draft));
 clearBuffer('previous-'+kind);changed({render:true});},{disabled:readOnly()}));
 }
 const member=buffer('previous-membership',()=>({reportKey:'',studyId:'',reason:'',basis:emptyBasis()}));
 append(box,el('h4','An explicit reporting correction to prior report–study membership'),
 el('p','Use only retained included identities and cite the source for the corrected relationship. Original eligibility links stay visible.','sf-muted'),
 table(['Report','Study','Reason',''],previous.membership,row=>[row.reportKey,row.studyId,row.reason,button('Remove',()=>{
 previous.membership=previous.membership.filter(v=>v!==row);changed({render:true});},{disabled:readOnly()})]),
 field('Retained included report key',member.reportKey,v=>{member.reportKey=v;},{disabled:readOnly()}),
 field('Surviving included study ID',member.studyId,v=>{member.studyId=v;},{disabled:readOnly()}),
 field('Reason for the reported membership',member.reason,v=>{member.reason=v;},{type:'textarea',disabled:readOnly()}),
 basisEditor(member.basis,bufferMark),button('Apply source-attributed membership',()=>{
 previous.membership=previous.membership.filter(v=>v.reportKey!==member.reportKey||v.studyId!==member.studyId).concat(copy(member));
 clearBuffer('previous-membership');changed({render:true});},{disabled:readOnly()}));
 return box;
 }
 async function loadHistory(offset=0){
 const value=await call(params({revision:st.revision,section:'operations',flowId:st.flowId??undefined,offset,limit:100}));
 st.history=value.items;st.historyOffset=offset;st.historyTotal=value.total;draw();
 }
 async function preserveWorkingDraft(){
 if(st.definition&&(st.dirty||st.editorDirty)){
 await persist();await storage.put(scope(),'study-flow/draft-history/'+new Date().toISOString()+'-'+crypto.randomUUID(),snapshot());
 }
 }
 async function copyAsUpdate(){
 await preserveWorkingDraft();const previous=st.report;
 st.definition=emptyDefinition(previous.definition.questionId);st.definition.name='Update of '+previous.definition.name;
 st.definition.template=previous.definition.template.includes('all-sources')?'update-all-sources':'update-databases';
 st.definition.reviewId=previous.definition.reviewId;st.definition.previous.editionId=previous.edition.id;
 st.flowId=null;st.editionId=null;st.basisEditionId=null;st.sourceMode='current';st.baseRevision=st.revision;
 st.readOnly=false;st.report=null;st.svg='';st.editorDrafts={};st.editorBaselines={};st.editorDirty=false;st.reason='';st.importFile=null;
 st.view='sources';changed();await loadSource();
 }
 function historyView(){
 const box=el('div');append(box,heading('Saved editions and complete handoff',
 'A saved edition keeps its exact reporting definition and original source basis. Later edits append to the same dossier history.'));
 append(box,table(['Diagram','Edition','Author','Status','Actions'],array(st.overview?.editions),row=>[
 row.name,row.number,row.actor?.name??'',row.status,append(el('div',null,'sf-actions'),
 button('Inspect',()=>run(async()=>{await preserveWorkingDraft();await loadEdition(row.id);st.view='diagram';draw();})),
 button('Use as next edition',()=>run(async()=>{await preserveWorkingDraft();await loadEdition(row.id);editDefinition();}))) ]));
 if(st.editionId)append(box,el('h4','Selected saved edition'),
 el('p',st.editionId+' · '+(st.report?.status??'saved'),'sf-code'),
 append(el('div',null,'sf-actions'),button('Mark this edition reviewed',()=>run(()=>review('review')),
 {disabled:st.dirty||st.editorDirty||currentFlow()?.currentEditionId!==st.editionId,key:'review'}),
 button('Withdraw its reviewed status',()=>run(()=>review('withdraw')),
 {disabled:st.dirty||st.editorDirty||currentFlow()?.currentEditionId!==st.editionId}),
 button('Create a new update from this review',()=>run(copyAsUpdate),{disabled:st.dirty||st.editorDirty})),
 el('p','Review records the named author and reason below. A partial source report remains visibly partial.','sf-muted'),
 append(el('div',null,'sf-actions'),...['svg','html','json'].map(format=>button('Download '+format.toUpperCase(),()=>run(()=>download(format)))),
 ...['counts','records','reports','studies','reasons','issues'].map(section=>button(section+' CSV',()=>run(()=>download('csv',section))))),
 button('Export the original complete portable dossier',()=>run(async()=>{
 const response=await api('/api/dossiers/'+encodeURIComponent(st.context.dossierId)+'/export'+params({revision:st.revision,format:'json.gz'}),
 {download:true,workspaceId:st.context.workspaceId});
 const bytes=await response.blob(),url=URL.createObjectURL(bytes),a=el('a');a.href=url;a.download=downloadName(response,'research-dossier.json.gz');
 a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 })));
 append(box,el('h4','Original reporting requests'),button('Load saved operation history',()=>run(()=>loadHistory(0))),
 table(['Action','Revision','Author','Time','Request'],st.history,row=>[row.action,row.revision,row.actor.name,row.createdAt,
 append(el('div'),button('Download exact request',()=>downloadLocal(row.requestId+'.json',row.request)),detail('Complete saved operation',row))]),
 append(el('div',null,'sf-actions'),button('Earlier',()=>run(()=>loadHistory(Math.max(0,st.historyOffset-100))),{disabled:st.historyOffset===0}),
 button('Next',()=>run(()=>loadHistory(st.historyOffset+100)),{disabled:st.historyOffset+100>=st.historyTotal})));
 return box;
 }
 async function adoptDefinition(value,{importFile=null}={}){
 if(!value||value.schema!==SCHEMA)throw Error('Choose a complete '+SCHEMA+' definition.');
 if(st.flowId&&value.questionId!==st.definition.questionId)throw Error('A saved flow retains its original question. Create a new flow for another question.');
 const epoch=st.epoch,reply=await call('/preview',{method:'POST',body:{expectedRevision:st.baseRevision,definition:value,
 ...(st.flowId?{flowId:st.flowId}:{}),sourceMode:st.sourceMode,basisEditionId:st.basisEditionId}});
 if(epoch!==st.epoch)return;
 await preserveWorkingDraft();st.definition=copy(reply.report.definition);st.report=reply.report;st.svg=reply.svg;
 st.importFile=copy(importFile);clearBuffer('definition-json');changed();st.reportDirty=false;
 await loadSource();await persist();draw();
 }
 function definitionView(){
 const box=el('div');append(box,heading('Complete reporting definition',
 'The structured editors and this complete JSON definition use the same original schema. Applying a definition validates it against the selected retained source.'));
 const bufferValue=buffer('definition-json',()=>({value:json(st.definition)}));
 if(json(bufferValue)===st.editorBaselines['definition-json']){
 bufferValue.value=json(st.definition);st.editorBaselines['definition-json']=json(bufferValue);
 }
 append(box,field('Definition JSON',bufferValue.value,v=>{bufferValue.value=v;},{type:'textarea',rows:28,disabled:readOnly(),key:'definition-json'}),
 append(el('div',null,'sf-actions'),button('Apply complete JSON definition',()=>run(async()=>{
 await adoptDefinition(JSON.parse(bufferValue.value));
 }),{disabled:readOnly(),key:'definition-apply'}),
 button('Reset JSON view to working definition',()=>{clearBuffer('definition-json');st.editorDirty=hasPendingEditors();schedulePersist();draw();},{disabled:readOnly()}),
 button('Download definition',()=>downloadLocal('study-flow-definition.json',st.definition))));
 const input=el('input');input.type='file';input.accept='.json,application/json';input.disabled=readOnly();input.dataset.sf='definition-file';
 input.addEventListener('change',()=>run(async()=>{
 const file=input.files?.[0];if(!file)return;if(file.size>1024*1024)throw Error('This retained definition input exceeds 1 MiB.');
 const body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer()),parsed=JSON.parse(body.replace(/^\ufeff/,''));
 const value=parsed.schema===SCHEMA?parsed:parsed.definition;
 await adoptDefinition(value,{importFile:{filename:file.name,contentType:'application/json',body}});
 }));
 append(box,labeled('Import original definition or complete report JSON',input),
 field('Reporting notes',st.definition.notes,v=>{st.definition.notes=v;changed();},{type:'textarea',rows:6,disabled:readOnly()}),
 detail('Full source/reporting contract references',st.report?.references??[
 {url:'https://www.prisma-statement.org/prisma-2020-flow-diagram',title:'PRISMA 2020 reporting templates'},
 {url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC8958186/',title:'Original published PRISMA2020 node and CSV terminology'}]));
 return box;
 }
 function recoveryView(){
 const box=el('details',null,'sf-card'),unresolved=st.pending.filter(v=>v.state!=='committed');
 append(box,el('summary','Request and local draft recovery · '+unresolved.length+' retained requests'));
 if(unresolved.length)append(box,el('p','The exact request was retained before its POST. Recover it unchanged after an interrupted reply. Editing the working draft does not change that original request.'),
 table(['Request','State','Expected revision','Actions'],unresolved,row=>[row.request.requestId,row.state,row.request.expectedRevision,
 append(el('div',null,'sf-actions'),button('Recover original request',()=>run(()=>submit(row.request,{retainedRecord:row}))),
 button('Download exact request',()=>downloadLocal(row.request.requestId+'.json',row.request)),
 detail('Retained operation input',row))]));
 append(box,button('List preserved local drafts',()=>run(async()=>{
 st.draftHistory=(await storage.list(scope(),'study-flow/draft-history/')).map(v=>v.value).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));draw();
 })));
 for(const draft of array(st.draftHistory))append(box,append(el('div',null,'sf-card'),
 el('p',(draft.definition?.name??'Draft')+' · '+draft.updatedAt+' · original r'+draft.baseRevision),
 button('Restore this local draft',()=>run(async()=>{await preserveWorkingDraft();applySnapshot(draft);await loadSource();await persist();draw();})),
 button('Download this full draft',()=>downloadLocal('study-flow-draft-'+draft.updatedAt.replaceAll(':','-')+'.json',draft))));
 if(st.storageError)append(box,el('p',st.storageError,'sf-notice'));
 return box;
 }
 function buffer(key,create){
 if(!Object.hasOwn(st.editorDrafts,key)){st.editorDrafts[key]=create();st.editorBaselines[key]=json(st.editorDrafts[key]);}
 return st.editorDrafts[key];
 }
 function clearBuffer(key){delete st.editorDrafts[key];delete st.editorBaselines[key];}
 function hasPendingEditors(){return Object.entries(st.editorDrafts).some(([key,value])=>
 json(value)!==(st.editorBaselines[key]??json(value)));}
 function bufferMark(){st.editorDirty=hasPendingEditors();schedulePersist();updateSummary();}
 function draw(){
 if(!st.shown||!st.context||!st.definition)return;
 const active=root.contains(document.activeElement)?document.activeElement:null,focus=active?.dataset.sf,
 selection=active&&typeof active.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null;
 root.classList.add('study-flow');root.replaceChildren();
 const top=el('div',null,'sf-top');
 append(top,el('h2','Study flow'),el('p','','sf-muted'));top.lastChild.dataset.sfSummary='';
 append(root,top,actions());
 const toolbar=el('div',null,'sf-grid');
 append(toolbar,field('Reporting author ID',st.actor.id,v=>{st.actor.id=v;schedulePersist();},{maxLength:200,key:'actor-id'}),
 field('Reporting author name',st.actor.name,v=>{st.actor.name=v;schedulePersist();},{maxLength:200,key:'actor-name'}),
 field('Reason for the next save / review',st.reason,v=>{st.reason=v;schedulePersist();},{type:'textarea',rows:2,key:'reason'}));
 append(root,toolbar);
 if(st.baseRevision!==st.revision&&st.dirty)append(root,el('p','The original dossier changed after this draft. Your draft remains based on revision '+
 st.baseRevision+'. Review the current source selection before rebasing.','sf-notice'));
 if(st.readOnly)append(root,el('p','Inspecting a saved edition. Use Edit this saved edition to append changes while retaining its original source.','sf-notice'));
 const nav=el('nav',null,'sf-nav');nav.setAttribute('aria-label','Study flow workspace');
 for(const[key,label]of NAV){const n=button(label,()=>{st.view=key;st.query='';st.page=0;draw();},{key:'nav-'+key});
 if(key===st.view)n.setAttribute('aria-current','page');nav.append(n);}
 append(root,nav);
 const views={diagram:diagramView,sources:sourceView,records:recordsView,reports:reportsView,counts:countsView,
 previous:previousView,history:historyView,definition:definitionView};
 const body=el('div',null,'sf-content');body.append((views[st.view]??diagramView)());
 if(st.readOnly)body.querySelectorAll('input,textarea,select').forEach(input=>{
 if(input.dataset.sf!=='search')input.disabled=true;
 });
 append(root,body,recoveryView());updateSummary();updateBusy();
 if(focus){const replacement=root.querySelector('[data-sf="'+CSS.escape(focus)+'"]');if(replacement&&!replacement.disabled){
 replacement.focus({preventScroll:true});if(selection&&typeof replacement.setSelectionRange==='function')try{replacement.setSelectionRange(...selection);}catch{}}}
 }
 function scheduleLoad(){
 if(!st.shown||!st.needsLoad||st.loading||isBusy()||st.closed)return;
 queueMicrotask(()=>{if(st.shown&&st.needsLoad&&!st.loading&&!isBusy()){st.needsLoad=false;run(()=>loadOverview());}});
 }
 function updateBusy(){
 const busy=isBusy()||st.loading;
 root.setAttribute('aria-busy',String(busy));root.dataset.sfBusy=String(busy);
 for(const control of root.querySelectorAll('input,textarea,select,button')){
 if(busy&&!control.disabled){control.dataset.sfBusyDisabled='true';control.disabled=true;}
 else if(!busy&&control.dataset.sfBusyDisabled==='true'){delete control.dataset.sfBusyDisabled;control.disabled=false;}
 }
 if(!busy)scheduleLoad();
 }
 function setDossier(dossier){
 const workspace=getWorkspace(),key=workspace?.workspaceId&&dossier?.id?workspace.workspaceId+'/'+dossier.id:null;
 if(key!==st.contextKey){
 if(st.context&&st.definition&&(st.dirty||st.editorDirty))persist().catch(err=>notify(error(err),'error'));
 clearTimeout(persistTimer);st.epoch++;st.contextKey=key;st.context=key?{workspaceId:workspace.workspaceId,dossierId:dossier.id}:null;
 Object.assign(st,{revision:dossier?.revision??0,needsLoad:Boolean(key),definition:null,overview:null,source:null,flowId:null,editionId:null,
 basisEditionId:null,sourceMode:'current',baseRevision:0,dirty:false,readOnly:false,report:null,svg:'',reportDirty:true,
 reason:'',importFile:null,view:'diagram',query:'',page:0,selected:new Set(),recordId:null,reportKey:null,metricId:null,history:[],pending:[],
 draftRecord:null,editorDrafts:{},editorBaselines:{},editorDirty:false,draftHistory:[],storageError:null});root.replaceChildren();
 }else if(dossier&&dossier.revision!==st.revision){st.revision=dossier.revision;st.needsLoad=true;updateSummary();}
 scheduleLoad();
 }
 root.addEventListener('input',bufferMark);root.addEventListener('change',bufferMark);
 return Object.freeze({
 setDossier,updateBusy,
 show(value){st.shown=Boolean(value);if(st.shown){scheduleLoad();draw();}},
 hasUnsaved(){return st.dirty||st.pending.some(v=>v.state==='prepared'||v.state==='outcome-unknown')||Boolean(st.editorDirty);},
 close(){st.closed=true;clearTimeout(persistTimer);persist().catch(err=>notify(error(err),'error')).finally(()=>storage.close());},
 });
}
