// MIT. Museum operations mounted in the original Collection Review draft, revision and receiving workflow.
import {collectMuseumState,museumControl,museumDigest,museumCanonical,museumReleaseStatus,museumEndpointStatus,museumContentKeys,applyMuseumAction,MEDIA_ROLES} from './museum-delivery.mjs';
import {describeMuseumMedia,buildMuseumPackage,MUSEUM_BROWSER_PACKAGE_BYTES} from './museum-package.mjs';
import {commissioningReport} from './museum-commissioning.mjs';

const clone=value=>structuredClone(value),json=value=>JSON.stringify(value,null,2)+'\n';
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const choices=values=>values.map(value=>Array.isArray(value)?value:[value,value]);
const actionLabels={
 'protocol.add':'Commissioning protocol','gate.record':'Stage decision','observation.record':'Observed endpoint interval',
 'incident.record':'Incident','incident.resolve':'Incident resolution','handover.record':'Complete handover',
 'copy.record':'Delivered / verified copy','restore.record':'Independent restore','acceptance.record':'Authority acceptance'
};
const F=(key,label,type='text',values=null,help='')=>({key,label,type,values,help});
const authority=[F('authorityName','Authority name'),F('authorityRole','Authority role'),F('authorityBasis','Actual authority basis','area')];
const evidence=[F('evidenceNote','Complete evidence note','area'),F('evidenceReferences','Evidence references · complete JSON array','json',null,'Each reference: label and optional URL / SHA-256 / byte count. A note is required; [] is permitted when no separate file or URL is available.')];
const observed=[F('observedAt','Actually observed at · ISO timestamp')];
const itemsHelp='Complete JSON array of {key, sha256, bytes}; preserve every actual member.';
const commissioningFields={
 'protocol.add':[F('releaseId','Exact release','@release'),F('mode','Evidence mode','select',['actual','authored-reference']),F('title','Protocol title'),F('endpointIds','Selected actual endpoints','@endpoints'),F('windowStart','Observation window starts · ISO timestamp'),F('targetHours','Required demonstrated hours','number'),F('requiredGates','Required stage gates','multi',['concept','detail','alpha','beta','final']),F('handoverRoles','Required handover roles','multi',['source-code','cms-access-instructions','encoded-media','uncompressed-media','working-originals','transcripts-captions','operation-manual','rights-register']),F('requiredCopies','Required independently verified copies','number'),F('restoreRequired','Independent restore required','boolean'),...authority,...evidence],
 'gate.record':[F('protocolId','Original protocol','@protocol'),F('stage','Stage','select',['concept','detail','alpha','beta','final']),F('decision','Actual decision','select',['approved','changes-required','rejected']),...authority,...evidence],
 'observation.record':[F('protocolId','Original protocol','@protocol'),F('endpointId','Actual endpoint','@endpoint'),F('deploymentId','Exact installed deployment','@deployment'),F('acknowledgmentId','Actual applied acknowledgment','@ack'),F('start','Interval start · ISO timestamp'),F('end','Interval end · ISO timestamp'),...observed,F('result','Observed interval result','select',['pass','fail','unknown']),...evidence],
 'incident.record':[F('protocolId','Original protocol','@protocol'),F('endpointId','Actual endpoint','@endpoint'),F('openedAt','Incident opened · ISO timestamp'),F('severity','Severity','select',['blocking','nonblocking']),F('summary','Complete incident description','area'),...evidence],
 'incident.resolve':[F('protocolId','Original protocol','@protocol'),F('incidentId','Original incident','@incident'),F('resolvedAt','Actually resolved · ISO timestamp'),F('outcome','Actual resolution','select',['corrected','withdrawn-as-not-a-fault']),...evidence],
 'handover.record':[F('protocolId','Original protocol','@protocol'),F('sourceRevision','Exact handed-over revision','@revision'),F('artifactKind','Actual handover artifact','select',['archive','directory-manifest']),F('archiveSha256','Archive / FILES.json SHA-256'),F('archiveBytes','Archive / FILES.json byte count','number'),F('inventory','Complete delivered inventory','json',null,'Complete array of {key, role, sha256, bytes}; roles are the protocol handover roles. A directory-manifest identifies actual FILES.json, not the sum of media bytes.'),F('exclusions','Explicit absent roles','json',null,'Complete array of {role, reason}; do not turn a missing original into a delivered item.'),...evidence],
 'copy.record':[F('protocolId','Original protocol','@protocol'),F('handoverId','Exact handover','@handover'),F('custodyId','Distinct actual custody identity'),F('location','Actual destination / location','area'),...observed,F('status','Observed copy state','select',['delivered','verified','failed']),F('archiveSha256','Original archive / FILES.json SHA-256'),F('archiveBytes','Original archive / FILES.json bytes','number'),F('verifiedItems','Complete actually verified members','json',null,itemsHelp),...evidence],
 'restore.record':[F('protocolId','Original protocol','@protocol'),F('copyReceiptId','Original verified copy receipt','@copy'),F('targetLabel','Actual independent receiving location'),...observed,F('result','Observed restore result','select',['verified','failed']),F('workspaceId','Original reopened workspace UUID'),F('reopenedSourceRevision','Exact reopened source revision','@revision'),F('verifiedItems','Complete actually verified members','json',null,itemsHelp),...evidence],
 'acceptance.record':[F('protocolId','Original protocol','@protocol'),F('handoverId','Exact accepted handover','@handover'),F('decision','Authority decision','select',['accepted','accepted-with-conditions','not-accepted']),...authority,...evidence]
};

export function mountMuseumDelivery({read,changed,act,render:renderWorkspace,download,say,saveRequest,persistDraft}){
 const root=document.getElementById('museum-desk');if(!root)return {render(){},refreshAvailability(){}};
 let slot=null,files=new Map(),lastReport=null,renderGeneration=0,contentKeys=new Map();
 const controls=new Map(),sections=new Map();
 const state=()=>read();
 function ui(){const s=state();if(!s.draft)throw Error('Open a complete collection workspace first.');return s.draft.museumUI||=( {schema:'stellar-forge.museum-operator-draft.v1',forms:{},pages:{},release:{items:{}},package:null,commissioningType:'protocol.add'});}
 function data(name,defaults={}){const u=ui();return u.forms[name]||=(clone(defaults));}
 function current(){const s=state();return collectMuseumState(s.workspace,s.draft.state);}
 function stamp(){return {id:crypto.randomUUID(),actor:actualActor(),createdAt:new Date().toISOString()};}
 function actualActor(){const name=state().draft.actor?.trim();if(!name)throw Error('Record the actual operator in “Recorded by” before saving museum work.');return name;}
 function guard(){const s=state();if(!s.workspace||!s.draft)throw Error('Open a complete collection workspace.');if(s.pending)throw Error('Recover the retained original save before another museum action.');if(s.draft.rawText!==null)throw Error('Apply or retain the unfinished complete draft JSON before saving museum work.');actualActor();return {slot:s.slot,draft:s.draft,workspaceId:s.workspace.id};}
 function unchanged(token){const s=state();if(s.slot!==token.slot||s.draft!==token.draft||s.workspace.id!==token.workspaceId)throw Error('The selected working copy changed; reopen the original museum draft.');}
 function remember(){changed();}
 function section(key,title,description){const d=el('details'),summary=el('summary',title),content=el('div');d.className='museum-section';content.className='museum-section-body';d.append(summary,el('p',description),content);root.append(d);sections.set(key,content);return content;}
 function button(parent,label,fn,{mutates=true}={}){const b=el('button',label);b.type='button';b.dataset.museumAction=mutates?'mutation':'read';b.onclick=()=>act(fn);parent.append(b);return b;}
 function setOptions(input,values,value){const selected=new Set(Array.isArray(value)?value:[value??'']);input.replaceChildren();if(!input.multiple)input.append(new Option('Choose…',''));for(const [id,label]of choices(values)){const option=new Option(label,id);option.selected=selected.has(id);input.add(option);}}
 function options(type,m){
  if(type==='@release')return m.releases.map(r=>[r.id,r.title+' · '+museumReleaseStatus(m,r.id)+' · '+r.id.slice(-12)]);
  if(type==='@endpoint'||type==='@endpoints')return m.endpoints.map(e=>[e.id,e.label+' · '+e.key+' · '+e.family]);
  if(type==='@revision')return state().workspace.revisions.map(r=>[r.id,r.createdAt+' · '+r.actor+' · '+(r.note||r.id.slice(-12))]);
  if(type==='@asset'||type==='@assets')return m.assets.map(a=>[a.id,a.filename+' · '+a.role+' · '+a.bytes+' B · '+a.sha256.slice(0,10)]);
  if(type==='@caption')return m.assets.filter(a=>a.role==='captions'&&a.mime==='text/vtt').map(a=>[a.id,a.filename+' · '+a.sha256.slice(0,10)]);
  const list=type==='@protocol'?m.commissioning.protocols:type==='@deployment'?m.deployments:type==='@ack'?m.acknowledgments.filter(a=>a.kind==='applied'):type==='@handover'?m.commissioning.handovers:type==='@copy'?m.commissioning.copyReceipts:type==='@incident'?m.commissioning.incidents:[];
  return list.map(r=>[r.id,(r.title||r.summary||r.location||r.endpointId||r.handoverId||r.kind||r.id)+' · '+r.id]);
 }
 function field(parent,name,descriptor){
  const {key,label,type,help}=descriptor,id='museum-'+name.replaceAll('.','-')+'-'+key,labelEl=el('label',label);
  let input;if(type==='area'||type==='json'){input=el('textarea');input.rows=type==='json'?5:3;if(type==='json'){input.spellcheck=false;input.className='mono';}}
  else if(type==='select'||type==='multi'||type.startsWith('@')){input=el('select');input.multiple=type==='multi'||type==='@endpoints'||type==='@assets';if(input.multiple)input.size=5;}
  else{input=el('input');input.type=type==='boolean'?'checkbox':type==='number'?'number':'text';if(type==='number'){input.min='0';input.step='1';}}
  input.id=id;labelEl.htmlFor=id;labelEl.append(input);if(help){const small=el('span',help);small.className='small';labelEl.append(small);}parent.append(labelEl);
  input.oninput=()=>{const d=data(name);d[key]=type==='boolean'?input.checked:input.multiple?[...input.selectedOptions].map(o=>o.value):input.value;remember();};
  controls.set(name+':'+key,{input,descriptor,name});return input;
 }
 function form(parent,name,descriptors){const grid=el('div');grid.className='museum-form-grid';for(const d of descriptors)field(grid,name,d);parent.append(grid);return grid;}
 function refreshFields(m){
  for(const {input,descriptor:d,name}of controls.values()){const value=data(name)[d.key];if(input.tagName==='SELECT')setOptions(input,d.type.startsWith('@')?options(d.type,m):d.values||[],value);
   else if(d.type==='boolean')input.checked=Boolean(value);else input.value=value??(d.type==='json'?'[]':'');}
 }
 function readForm(name,descriptors){
  const values=data(name),out={};for(const d of descriptors){let value=values[d.key]??(d.type==='json'?'[]':d.type==='boolean'?false:(d.type==='multi'||d.type==='@endpoints'||d.type==='@assets')?[]:'');
   if(d.type==='json'){try{value=JSON.parse(value);}catch{throw Error(d.label+' needs complete valid JSON.');}if(!Array.isArray(value))throw Error(d.label+' must be a complete JSON array.');}
   if(d.type==='number'){if(String(value).trim()===''||!Number.isSafeInteger(Number(value))||Number(value)<0)throw Error(d.label+' needs a complete nonnegative integer.');value=Number(value);}out[d.key]=value;
  }return out;
 }
 async function commit(label,actions,token=guard()){
  let next=state().draft.state;for(const action of actions)next=await applyMuseumAction(state().workspace,next,action);unchanged(token);
  const request={id:crypto.randomUUID(),expectedRevision:state().draft.baseRevision,createdAt:new Date().toISOString(),actor:actualActor(),note:label,state:next};
  state().draft.state=next;await saveRequest(request);say(label+' saved in the original collection revision.');return request;
 }
 function list(parent,key,rows,description){parent.replaceChildren();if(!rows.length){parent.append(el('p','No '+description+' retained.'));return;}
  const u=ui(),last=Math.max(0,Math.ceil(rows.length/20)-1);u.pages[key]=Math.min(u.pages[key]||0,last);const start=u.pages[key]*20;
  const p=el('p',(start+1)+'–'+Math.min(rows.length,start+20)+' of '+rows.length+' '+description);parent.append(p);
  for(const row of rows.slice(start,start+20)){const d=el('details');d.append(el('summary',row.label));d.ontoggle=()=>{if(d.open&&!d.querySelector('pre'))d.append(el('pre',json(row.value)));else if(!d.open)d.querySelector('pre')?.remove();};parent.append(d);}
  const nav=el('div');nav.className='toolbar';const back=button(nav,'Previous',async()=>{u.pages[key]--;remember();await draw();},{mutates:false}),next=button(nav,'Next',async()=>{u.pages[key]++;remember();await draw();},{mutates:false});back.dataset.limit=String(start===0);next.dataset.limit=String(u.pages[key]===last);parent.append(nav);
 }
 root.append(el('h3','Museum delivery · publish an explicit visitor package'),el('p','Use the saved editorial selection, actual permissions and supplied media. Staff evidence remains in this editable workspace; the public visitor package contains only its permitted text, media and withdrawal control. Every action uses the original revision and pending-save recovery.'));
 const status=el('p');status.id='museum-status';status.setAttribute('role','status');status.className='small';root.append(status);
 const mediaSection=section('media','1 · Retain and reconnect media','Media bytes remain in their original file custody. This workspace retains exact identities. Choose the actual files again after reopening; a filename alone does not establish a match. Browser packages are limited to 256 MiB; the existing streaming directory command handles explicitly supplied larger files.');
 const mediaInput=el('input');mediaInput.type='file';mediaInput.multiple=true;mediaInput.id='museum-media-files';const mediaLabel=el('label','Actual original media files');mediaLabel.append(mediaInput);mediaSection.append(mediaLabel);
 const mediaFields=[F('role','Handover role','select',MEDIA_ROLES),F('label','Operator media label'),F('mime','Explicit MIME type, only when the file has no correct type')];form(mediaSection,'media',mediaFields);
 button(mediaSection,'Retain / reconnect selected media',async()=>{const token=guard(),selected=[...mediaInput.files];if(!selected.length)throw Error('Choose the actual media files.');const d=data('media'),m=current(),known=new Map(m.assets.map(a=>[a.sha256,a])),actions=[];
  for(const file of selected){say('Checking actual media '+file.name+' · '+file.size+' bytes.');const asset=await describeMuseumMedia(file,{role:d.role||'encoded',label:d.label||'',mime:d.mime||file.type||'application/octet-stream'});unchanged(token);const retained=known.get(asset.sha256);files.set(asset.sha256,file);if(retained){if(retained.bytes!==file.size)throw Error('The original retained media byte count changed.');}else{known.set(asset.sha256,asset);actions.push({type:'asset',record:asset});}}
  if(actions.length)await commit('Retained supplied museum media',actions,token);else{await draw();say('Reconnected exact original media bytes. Existing immutable metadata is unchanged.');}mediaInput.value='';
 });
 const mediaList=el('div');mediaSection.append(mediaList);
 const endpointSection=section('endpoints','2 · Record the actual endpoint','Record the real endpoint key, equipment/browser profile and selected story or browse family. No venue, installation or device capability is inferred.');
 const endpointFields=[F('key','Actual endpoint key'),F('label','Visitor-facing endpoint label'),F('family','Presentation family','select',['story','browse']),F('profile','Actual equipment, browser, display and local opening profile','area')];form(endpointSection,'endpoint',endpointFields);
 button(endpointSection,'Save endpoint profile',async()=>{const value=readForm('endpoint',endpointFields);await commit('Recorded museum endpoint',[{type:'endpoint',record:{...stamp(),...value}}]);});
 const endpointList=el('div');endpointSection.append(endpointList);
 const releaseSection=section('release','3 · Freeze a reviewed visitor release','Select an exact saved editorial revision. Only its included, story-ordered and permission-recorded occurrences can enter. Alternative text, transcript, captions and media are explicit. Known stable content keys carry across actual source-edition maps; changing a key cannot lift an existing withdrawal.');
 const releaseFields=[F('sourceRevision','Exact saved editorial revision','@revision'),F('title','Visitor release title'),F('introduction','Visitor introduction','area'),F('expiresAt','Explicit offline display expiry · ISO timestamp with timezone'),F('endpointIds','Selected endpoints','@endpoints')];form(releaseSection,'release',releaseFields);
 controls.get('release:sourceRevision').input.onchange=()=>{data('release').sourceRevision=controls.get('release:sourceRevision').input.value;ui().pages.releaseItems=0;remember();drawReleaseItems();};
 button(releaseSection,'Use saved story title and introduction',async()=>{const r=state().workspace.revisions.find(r=>r.id===data('release').sourceRevision);if(!r)throw Error('Choose the exact saved editorial revision.');Object.assign(data('release'),{title:r.state.story.title,introduction:r.state.story.introduction});remember();await draw();},{mutates:false});
 const releaseItems=el('div');releaseItems.className='museum-release-items';releaseSection.append(releaseItems);
 button(releaseSection,'Save immutable visitor release',async()=>{const token=guard(),d=readForm('release',releaseFields),rows=releaseCandidates(),selected=rows.filter(e=>itemDraft(e).selected!==false);
  if(!selected.length)throw Error('Select at least one included and permission-recorded original occurrence.');const record={...d,actor:actualActor(),createdAt:new Date().toISOString(),items:selected.map(e=>{const v=itemDraft(e);return {occurrenceId:e.id,key:v.key,alt:v.alt,credit:v.credit,mediaIds:v.mediaIds,transcript:v.transcript,captionsMediaId:v.captionsMediaId||null};})};await commit('Prepared immutable museum visitor release',[{type:'release',record}],token);
 });
 const releaseList=el('div');releaseSection.append(releaseList);
 function releaseCandidates(){const s=state(),revision=s.workspace.revisions.find(r=>r.id===data('release').sourceRevision);if(!revision)return [];const entries=new Map(s.workspace.sources.flatMap(c=>c.entries.map(e=>[e.id,e]))),reviews=new Map(revision.state.reviews.map(r=>[r.id,r]));
  return revision.state.story.order.map(id=>{const e=entries.get(id),r=reviews.get(id);return e&&r?.status==='include'&&r.rights.status==='permission-recorded'?{...e,review:r}:null;}).filter(Boolean);}
 function itemDraft(e){const u=ui();u.release||={items:{}};u.release.items||={};return u.release.items[e.id]||=( {selected:true,key:contentKeys.get(e.id)||e.id,alt:'',credit:'',mediaIds:[],transcript:'',captionsMediaId:''});}
 function drawReleaseItems(){
  releaseItems.replaceChildren();contentKeys=museumContentKeys(state().workspace,state().draft.state);const rows=releaseCandidates(),u=ui(),m=current(),last=Math.max(0,Math.ceil(rows.length/10)-1);u.pages.releaseItems=Math.min(u.pages.releaseItems||0,last);const start=u.pages.releaseItems*10;
  releaseItems.append(el('p',rows.filter(e=>itemDraft(e).selected!==false).length+' selected of '+rows.length+' saved eligible occurrences. Other editorial records remain in the workspace.'));
  if(!rows.length){releaseItems.append(el('p','Save the editorial review with explicit inclusion, story order and recorded permission, then choose that saved revision.'));return;}
  for(const e of rows.slice(start,start+10)){const value=itemDraft(e),card=el('details'),head=el('summary',(e.review.suggestedTitle||e.title)+' · '+e.id),body=el('div');card.className='museum-item';card.append(head,body);
   body.append(el('p',e.review.summary),el('p','Original occurrence: '+e.id));const select=el('input');select.type='checkbox';select.checked=value.selected!==false;const selectLabel=el('label','Include this exact occurrence');selectLabel.prepend(select);body.append(selectLabel);select.onchange=()=>{value.selected=select.checked;remember();};
   const specs=[F('key','Stable content key'),F('alt','Image alternative text','area'),F('credit','Visitor-facing credit'),F('mediaIds','Actual retained media','@assets'),F('transcript','Complete audio/video transcript','area'),F('captionsMediaId','WebVTT captions','@caption')];
   for(const d of specs){const label=el('label',d.label),input=d.type.startsWith('@')?el('select'):d.type==='area'?el('textarea'):el('input');if(d.type==='area')input.rows=d.key==='transcript'?5:2;if(d.type==='@assets'){input.multiple=true;input.size=5;}if(input.tagName==='SELECT')setOptions(input,options(d.type,m),value[d.key]);else input.value=value[d.key]||'';label.append(input);body.append(label);input.oninput=()=>{value[d.key]=input.multiple?[...input.selectedOptions].map(o=>o.value):input.value;remember();};}releaseItems.append(card);
  }
  const nav=el('div');nav.className='toolbar';const a=button(nav,'Previous occurrences',async()=>{u.pages.releaseItems--;remember();drawReleaseItems();refreshAvailability();},{mutates:false}),b=button(nav,'Next occurrences',async()=>{u.pages.releaseItems++;remember();drawReleaseItems();refreshAvailability();},{mutates:false});a.dataset.limit=String(start===0);b.dataset.limit=String(u.pages.releaseItems===last);nav.append(el('span',(start+1)+'–'+Math.min(start+10,rows.length)+' of '+rows.length));releaseItems.append(nav);
 }

 const approvalSection=section('approval','4 · Record actual stage decisions','A package requires an actual final approval of its exact immutable release. A received final revise or rejection requires a new release; a later timestamp cannot silently overrule it.');
 const approvalFields=[F('releaseId','Exact reviewed release','@release'),F('stage','Reviewed stage','select',['concept','detail','alpha','beta','final']),F('outcome','Actual decision','select',['approved','revise','rejected']),F('authority','Actual decision authority'),F('evidence','Original decision reference and evidence','area')];form(approvalSection,'approval',approvalFields);
 button(approvalSection,'Save actual release decision',async()=>{await commit('Recorded actual museum release decision',[{type:'approval',record:{...stamp(),...readForm('approval',approvalFields)}}]);});
 const approvalList=el('div');approvalSection.append(approvalList);
 const controlSection=section('withdrawal','5 · Apply and distribute withdrawals','Withdrawals remain effective across received histories and older-release restoration. Download the public control and apply it on each actual endpoint. A disconnected endpoint remains unknown until its current control and actual observation return.');
 const withdrawalFields=[F('keys','Complete exact stable content keys · one per line, whitespace retained','area'),F('assetIds','Withdraw complete media identities','@assets'),F('reason','Private withdrawal reason','area'),F('evidence','Original withdrawal instruction / evidence','area')];form(controlSection,'withdrawal',withdrawalFields);
 button(controlSection,'Save withdrawal and retain restrictions',async()=>{const d=readForm('withdrawal',withdrawalFields),record={...stamp(),...d,keys:d.keys.split(/\r?\n/).filter(s=>s!=='')};await commit('Recorded museum withdrawal',[{type:'withdrawal',record}]);});
 button(controlSection,'Download current public control',async()=>{download('museum-current-control.json',museumControl(state().workspace,state().draft.state));say('Downloaded current public restrictions. Apply them on the actual endpoints; no endpoint application is inferred.');},{mutates:false});
 const withdrawalList=el('div');controlSection.append(withdrawalList);
 const packageSection=section('package','6 · Prepare and receive a complete visitor package','Use exact approved content and the current control. Package preparation records a deployment, then offers its complete ZIP. It does not install or acknowledge the endpoint. Reopening retains the same original deployment options; reconnect actual media and continue it. A newer control or visitor runtime requires an explicit new deployment.');
 const packageFields=[F('releaseId','Approved immutable release','@release'),F('endpointId','Exact selected endpoint','@endpoint'),F('expiresAt','Optional earlier deployment expiry · ISO timestamp')];form(packageSection,'package',packageFields);
 const packageStatus=el('p');packageStatus.className='mono';packageSection.append(packageStatus);
 const packagePrepare=button(packageSection,'Prepare / continue original package and download',async()=>{
  const token=guard(),u=ui();if(!u.package){if(state().draft.baseRevision!==state().workspace.headId)throw Error('This draft uses an older saved basis. Preserve it and compare the current head before a new deployment.');const d=readForm('package',packageFields);u.package={workspaceId:state().workspace.id,options:{id:crypto.randomUUID(),releaseId:d.releaseId,endpointId:d.endpointId,actor:actualActor(),createdAt:new Date().toISOString(),expiresAt:d.expiresAt||null},status:'PREPARING'};await persistDraft();}
  const original=u.package;if(original.workspaceId!==state().workspace.id)throw Error('This retained deployment belongs to another workspace.');const s=state();
  say('Preparing original deployment '+original.options.id+' and checking its complete selected media.');
  const prepared=await buildMuseumPackage(s.workspace,{...original.options,state:s.draft.state},files);unchanged(token);
  if(!prepared.request||prepared.request.id!==original.options.id)throw Error('The package did not return its exact original collection save request.');
  original.manifestSha256=prepared.manifestSha256;original.controlSha256=prepared.deployment.controlSha256;original.requestId=prepared.request.id;original.status='PREPARED';
  const exists=s.workspace.revisions.some(r=>r.request.id===prepared.request.id);if(!exists)s.draft.state=clone(prepared.request.state);
  await saveRequest(prepared.request);unchanged(token);original.status='DOWNLOAD_OFFERED';await persistDraft();
  download('museum-'+prepared.manifest.endpoint.key.replace(/[^a-z0-9_-]/gi,'-')+'-'+prepared.deployment.id+'.zip',prepared.bytes,'application/zip');
  say('Saved the exact original deployment and offered the complete visitor ZIP. Open the extracted index.html on the actual endpoint, LOOK at it and verify all media before returning an acknowledgment.');
 });
 button(packageSection,'Start a deliberately new deployment',async()=>{guard();if(ui().package&&!confirm('Keep the previous deployment in history and begin a new explicitly selected deployment?'))return;ui().package=null;await persistDraft();await draw();});
 const packageDetails=el('details');packageDetails.append(el('summary','Retained original package preparation'));const packageOriginal=el('pre');packageDetails.append(packageOriginal);packageSection.append(packageDetails);
 const ackInput=el('input');ackInput.type='file';ackInput.accept='.json,application/json';ackInput.id='museum-ack-file';const ackLabel=el('label','Actual endpoint acknowledgment JSON');ackLabel.append(ackInput);packageSection.append(ackLabel);
 button(packageSection,'Receive actual endpoint acknowledgment',async()=>{const token=guard(),file=ackInput.files[0];if(!file)throw Error('Choose the actual endpoint acknowledgment.');if(file.size>1024*1024)throw Error('The complete acknowledgment exceeds 1 MiB.');const value=JSON.parse(await file.text());unchanged(token);
  if(value.schema!=='stellar-forge.museum-endpoint-ack.v1'||value.workspaceId!==state().workspace.id||!value.acknowledgment)throw Error('Choose the actual acknowledgment for this original collection workspace.');
  const existing=current().acknowledgments.find(a=>a.id===value.acknowledgment.id);if(existing&&museumCanonical(existing)===museumCanonical(value.acknowledgment)){say('This exact original endpoint acknowledgment is already retained.');return;}
  await commit('Received actual museum endpoint acknowledgment',[{type:'acknowledgment',record:value.acknowledgment}],token);ackInput.value='';
 });
 const endpointState=el('div');packageSection.append(endpointState);
 const commissionSection=section('commissioning','7 · Commission, hand over and record acceptance','Record complete actual evidence or explicitly labeled authored reference work. Technical interval evidence, gate decisions, complete copies, independent restoration and contractual acceptance remain separate. Elapsed calendar time and package downloads do not establish a successful run.');
 const commissionType=el('select');commissionType.id='museum-commissioning-action';setOptions(commissionType,Object.entries(actionLabels),'protocol.add');const typeLabel=el('label','Record type');typeLabel.append(commissionType);commissionSection.append(typeLabel);
 const commissionForm=el('div');commissionSection.append(commissionForm);
 commissionType.onchange=()=>{ui().commissioningType=commissionType.value;remember();drawCommissionForm();refreshFields(current());refreshAvailability();};
 function drawCommissionForm(){
  const type=ui().commissioningType||'protocol.add';commissionType.value=type;
  for(const [key,control]of controls)if(control.name.startsWith('commission:'))controls.delete(key);
  commissionForm.replaceChildren();const descriptors=commissioningFields[type];if(!descriptors)return;
  form(commissionForm,'commission:'+type,[F('createdAt','Actual record time · ISO timestamp with timezone'),...descriptors]);
  button(commissionForm,'Set record time to now',async()=>{data('commission:'+type).createdAt=new Date().toISOString();remember();refreshFields(current());},{mutates:false});
  button(commissionForm,'Save '+actionLabels[type].toLowerCase(),async()=>{
   const descriptors=commissioningFields[type],v=readForm('commission:'+type,[F('createdAt','Actual record time'),...descriptors]);
   const record={id:crypto.randomUUID(),actor:actualActor(),...v,evidence:{note:v.evidenceNote,references:v.evidenceReferences}};
   delete record.evidenceNote;delete record.evidenceReferences;
   if(descriptors.some(d=>d.key==='authorityName')){record.authority={name:v.authorityName,role:v.authorityRole,basis:v.authorityBasis};delete record.authorityName;delete record.authorityRole;delete record.authorityBasis;}
   if(type==='protocol.add')record.runPolicy='continuous-since-last-blocking-fault';
   await commit('Recorded museum '+actionLabels[type].toLowerCase(),[{type:'commissioning',record:{type,record}}]);
  });
 }
 const reportSection=section('report','8 · Review complete delivery and commissioning','Use an explicit observation cutoff. The report reads the maintained commissioning model, including interruption/reset evidence and missing originals. A successful technical result does not infer buyer acceptance.');
 const reportFields=[F('asOf','Explicit report cutoff · ISO timestamp with timezone')];form(reportSection,'report',reportFields);
 button(reportSection,'Set report cutoff to now',async()=>{data('report').asOf=new Date().toISOString();remember();await draw();},{mutates:false});
 button(reportSection,'Show complete commissioning report',async()=>{lastReport=commissioningReport(current(),{asOf:data('report').asOf});drawReport();},{mutates:false});
 button(reportSection,'Download museum register and commissioning report',async()=>{download('museum-complete-working-record.json',{schema:'stellar-forge.museum-operator-record.v1',workspaceId:state().workspace.id,selectedRevisionId:state().workspace.headId,museum:current(),control:museumControl(state().workspace,state().draft.state),commissioning:commissioningReport(current(),{asOf:data('report').asOf})});},{mutates:false});
 reportSection.append(el('p','This operator report contains private staff evidence. For complete editable receiving, use Download editable packet above and retain the separately identified source / working / encoded media through the complete handover.'));
 const reportOutput=el('div');reportSection.append(reportOutput);
 function drawReport(){reportOutput.replaceChildren();if(!lastReport){reportOutput.append(el('p','Choose an explicit cutoff and show the complete report.'));return;}
  reportOutput.append(el('p','Report cutoff: '+lastReport.asOf));for(const p of lastReport.protocols||[]){const block=el('section');block.className='museum-report';block.append(el('h4',p.title+' · '+p.mode),el('p',p.technicalEvidenceComplete?'Required technical evidence is present at this cutoff.':'Technical evidence remains incomplete.'),el('p','Acceptance: '+(p.acceptance?.decision||'No separately recorded acceptance')+'. Contractual acceptance is never inferred.'));
   const findings=el('ul');for(const item of p.technicalFindings||[])findings.append(el('li',typeof item==='string'?item:json(item)));block.append(findings);
   for(const endpoint of p.endpoints||[])block.append(el('p','Endpoint '+endpoint.endpointId+' · demonstrated longest interval '+endpoint.longestHours+' hours · target '+(endpoint.targetDemonstrated?'demonstrated':'not demonstrated')+' · last reset '+(endpoint.runResetAt||'none recorded')));
   const details=el('details');details.append(el('summary','Complete gates, intervals, incidents, handover, copies, restore and acceptance'),el('pre',json(p)));block.append(details);reportOutput.append(block);}
  if(!(lastReport.protocols||[]).length)reportOutput.append(el('p','No commissioning protocol is retained. No technical run or acceptance is inferred.'));const complete=el('details');complete.append(el('summary','Complete model report'),el('pre',json(lastReport)));reportOutput.append(complete);
 }
 function refreshAvailability(){
  const s=state();for(const input of root.querySelectorAll('input,textarea,select'))input.disabled=Boolean(s.busy);
  for(const b of root.querySelectorAll('button'))b.disabled=Boolean(s.busy)||b.dataset.limit==='true'||b.dataset.museumAction==='mutation'&&Boolean(s.pending);
  if(s.draft?.museumUI?.package)for(const field of packageFields)controls.get('package:'+field.key).input.disabled=true;
 }
 async function draw(){
  const s=state();if(!s.workspace||!s.draft)return;const g=++renderGeneration;
  if(slot!==s.slot){slot=s.slot;files.clear();mediaInput.value='';ackInput.value='';lastReport=null;}
  const u=ui();data('media',{role:'encoded',label:'',mime:''});data('report',{asOf:new Date().toISOString()});
  data('release',{sourceRevision:s.workspace.headId,title:'',introduction:'',expiresAt:'',endpointIds:[]});const m=current();
  status.textContent='Recorded by '+(s.draft.actor||'no operator yet')+' · Original workspace '+s.workspace.id+' · '+m.releases.length+' releases · '+m.endpoints.length+' endpoints · '+m.withdrawals.length+' immutable withdrawals. '+(s.pending?'An original save is pending; recover it above.':'Museum actions save the current complete editorial draft.');
  drawCommissionForm();refreshFields(m);drawReleaseItems();
  list(mediaList,'assets',m.assets.map(a=>({label:a.filename+' · '+a.role+' · '+a.bytes+' B · '+(files.has(a.sha256)?'actual bytes reconnected':'reselect actual file'),value:a})),'media records');
  list(endpointList,'endpoints',m.endpoints.map(e=>({label:e.label+' · '+e.family+' · '+e.key,value:e})),'endpoint profiles');
  list(releaseList,'releases',[...m.releases].reverse().map(r=>({label:r.title+' · '+museumReleaseStatus(m,r.id)+' · '+r.items.length+' items',value:r})),'immutable releases');
  list(approvalList,'approvals',[...m.approvals].reverse().map(a=>({label:a.stage+' · '+a.outcome+' · '+a.authority,value:a})),'actual release decisions');
  list(withdrawalList,'withdrawals',[...m.withdrawals].reverse().map(w=>({label:w.createdAt+' · '+w.reason,value:w})),'private withdrawal records');
  packageStatus.textContent=u.package?'Original deployment '+u.package.options.id+' · '+u.package.status:'No retained package preparation. Select the actual release and endpoint.';
  packageOriginal.textContent=u.package?json(u.package):'No original deployment selected.';
  packagePrepare.textContent=u.package?'Continue original deployment and download':'Prepare original deployment and download';
  const controlSha=await museumDigest(museumControl(s.workspace,s.draft.state));if(g!==renderGeneration||s.slot!==slot)return;
  const statuses=museumEndpointStatus(s.workspace,s.draft.state).map(row=>({label:row.endpoint.label+' · '+row.deployments.length+' prepared deployments · external freshness unknown',value:{...row,currentControlSha256:controlSha,deployments:row.deployments.map(d=>({...d,controlMatchesCurrent:d.controlSha256===controlSha,applicationMeaning:d.acknowledgments.length?'Read the complete actual observations; an earlier applied record cannot erase a later removal/failure.':'No actual endpoint acknowledgment retained.'}))}}));
  list(endpointState,'endpoint-state',statuses,'complete endpoint histories');
  if(lastReport)lastReport=commissioningReport(m,{asOf:data('report').asOf});drawReport();refreshAvailability();
 }
 return {render:draw,refreshAvailability};
}
