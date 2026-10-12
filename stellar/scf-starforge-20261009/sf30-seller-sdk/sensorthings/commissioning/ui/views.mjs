// MIT. Complete commissioning screens; all mutations remain original Desk actions.
import {h,button,detail,note,field,table,row,number,optional,panel,exact,textBody,badge,stats,actionButtons,pager,scopedForm,files,parseObject,parseNullableObject,parseArray,parseLines,optionalText,requireProject,choices,select,list,label,recordId,entityKinds,enc} from './support.mjs';
const pId=ctx=>requireProject(ctx),pick=(ctx,key,id,tab=ctx.state.tab)=>ctx.select(key,id,tab);
function projectRecords(ctx,key){return list(ctx.project?.[key]);}
function stateOf(r){return r?.state??r?.status??'Retained';}
function recordTable(ctx,items,columns=[]){return table([{label:'Record',render:r=>h('div',{},h('strong',{},label(r)),h('div',{class:'comm-subtitle'},recordId(r)))},...columns,{label:'Details',render:r=>button('Open record',()=>ctx.show(label(r),r))}],items);}
function emptyProject(ctx){return h('div',{class:'comm-empty'},h('h2',{},'Choose a commissioning project'),note('Create a project in Sources or select an existing project above. Its sources, mappings, native results and handoffs stay together.'),button('Open Sources',()=>ctx.navigate('sources')));}
function projectIntro(ctx,title,description){return h('div',{},h('h1',{},title),h('p',{class:'comm-intro'},description));}
function issuePanel(issues){return list(issues).length?h('section',{class:'comm-issues'},h('h3',{},'Items requiring review'),detail('Complete issues',issues,true)):note('No issues are reported for this selected record.');}
function selectedFile(ctx,purpose){const file=ctx.state.inboxFile;if(!file)return note('Upload or select the complete '+purpose+' in the private source inbox.');return exact('Selected complete inbox file',{filename:file.filename,bytes:file.bytes,sha256:file.sha256}, {open:true});}
function uploadPanel(ctx,{title='Receive a private source file',kind='source'}={}){
  const progress=h('div',{class:'comm-import-progress',role:'status'});
  const upload=scopedForm(ctx,'upload-'+kind,title,[field('Complete original file','file',{type:'file',required:true})],async(x,form)=>{
    const file=form.elements.file.files[0];if(!file)throw new Error('Choose the complete original file.');
    const received=await ctx.client.upload(file,p=>progress.replaceChildren(note(String(p.offset)+' / '+p.bytes+' bytes'),h('progress',{value:p.offset,max:p.bytes})));
    ctx.state.inboxFile={filename:received.filename,bytes:received.bytes,sha256:received.sha256};ctx.save();await ctx.refresh();return received;
  },{label:'Upload complete file',description:'Uses the original configured inbox and resumes its byte/hash-bound upload. For files above 128 MiB, use the installed retained-file receiver into that same inbox.'});
  upload.append(progress);
  const inbox=panel('Original private inbox',note('Loading the configured inbox…'));
  ctx.readInto(inbox,async()=>{const response=await ctx.client.request('/api/desk/inbox');return h('div',{},table([{label:'File',key:'filename'},{label:'Bytes',key:'bytes'},{label:'Modified',key:'modifiedAt'},{label:'Selection',render:r=>button('Verify and select',()=>ctx.run(async()=>{const original=await ctx.client.request('/api/desk/inbox?'+new URLSearchParams({filename:r.filename}));ctx.state.inboxFile={filename:original.filename,bytes:original.bytes,sha256:original.sha256};ctx.save();await ctx.refresh();}))}],list(response.files)),exact('Inbox identity',response));},'Original private inbox');
  return h('div',{},upload,inbox);
}
export function sources(ctx){
  const root=projectIntro(ctx,'Sources','Retain the original edition or complete file, its attribution and source meaning. Inspect the complete selected rows before mapping them to a target.');
  root.append(scopedForm(ctx,'create-project','Create commissioning project',[field('Project label','label',{required:true}),field('Description and intended outcome','description',{type:'textarea',required:true})],x=>ctx.act('commissioning.project.create',x,{selectResult:'projectId'}),{label:'Create project',clearOnSuccess:true}));
  if(!ctx.project){root.append(recordTable(ctx,list(ctx.overview.projects),[{label:'Open',render:r=>button('Select project',()=>pick(ctx,'projectId',recordId(r)))}]));return root;}
  root.append(panel('Project sources',recordTable(ctx,projectRecords(ctx,'sources'),[{label:'Kind',render:r=>r.kind??r.format?.kind??r.format},{label:'Selection',render:r=>button('Inspect source',()=>pick(ctx,'sourceId',recordId(r)))}])));
  const editions=list(ctx.client.view.editions).filter(id=>list(ctx.client.view.reviews).filter(r=>r.editionId===id).at(-1)?.decision==='accept');
  if(!editions.length)root.append(note('Accept the chosen original edition in the Operations Desk to select it here. Its current source review remains attached to the source.'));
  root.append(scopedForm(ctx,'retain-edition','Use an original accepted edition',[select('Original source edition','editionId',editions,ctx.state.editionId,{required:true}),field('Source label','label',{required:true})],x=>ctx.act('commissioning.source.edition',{projectId:pId(ctx),editionId:x.editionId,label:x.label},{selectResult:'sourceId'}),{label:'Retain complete edition',description:'Uses the original edition and its source review, raw response pages, entity graph, licenses and provenance.'}));
  if(ctx.client.info.sourceInboxConfigured){
    root.append(uploadPanel(ctx),selectedFile(ctx,'source'));
    if(ctx.state.inboxFile)root.append(scopedForm(ctx,'retain-file','Retain the selected source file',[
      field('Source label','label',{required:true}),field('Original source URL','sourceUrl',{type:'url',help:'Retain the actual source URL when one is declared.'}),
      field('Source license and attribution','license',{type:'json',required:true,value:'null',help:'Use the actual declared license/attribution object, or null when no source declaration has been observed.'}),
      field('File format','format',{type:'select',options:[{value:'csv',label:'CSV'},{value:'json',label:'SensorThings JSON'},{value:'data-array',label:'SensorThings data array'}]}),
      field('Native entity collection when required','entityKind',{type:'select',options:[{value:'',label:'Use the source definition'},...entityKinds]})
    ],x=>{const f=ctx.state.inboxFile;return ctx.act('commissioning.source.file',{projectId:pId(ctx),filename:f.filename,expectedSha256:f.sha256,expectedBytes:f.bytes,label:x.label,sourceUrl:x.sourceUrl,license:parseNullableObject(x.license,'License'),format:{kind:x.format,...(x.entityKind?{entityKind:x.entityKind}:{})}},{selectResult:'sourceId'});},{label:'Retain source and provenance'}));
  }else root.append(note('The host must bind its original source inbox to receive private CSV, JSON or complete handoff files.'));
  if(ctx.state.sourceId){
    const sourceHost=panel('Selected source',note('Reading original source…'));
    ctx.readInto(sourceHost,async()=>{const id=ctx.state.sourceId,source=await ctx.api('sources/'+enc(id));return h('div',{},exact('Complete source metadata',source,{open:true}),files(ctx,source),actionButtons(ctx,['Map this source',()=>ctx.navigate('mapping')]));},'Selected source');
    root.append(sourceHost);
    const rowsHost=panel('Source rows and graph',note('Reading retained rows…'));
    ctx.readInto(rowsHost,async()=>{const page=await ctx.api('sources/'+enc(ctx.state.sourceId)+'/rows',{offset:ctx.state.sourceOffset??0,limit:100,...(ctx.state.mappingId?{mappingId:ctx.state.mappingId}:{})});const columns=list(page.columns).map(c=>typeof c==='string'?c:c.name??c.key);
      return h('div',{},note('Result values, units, explicit nulls and source times retain their original meaning. Open a row for its exact body/source references. Categorical observations do not imply duration or availability.'),table([{label:'Row',render:r=>button('Inspect row',()=>ctx.show('Original source row',r))},...columns.map(c=>({label:c,render:r=>Array.isArray(r)?r[columns.indexOf(c)]:r[c]}))],list(page.rows)),pager(page,n=>{ctx.state.sourceOffset=n;ctx.render();}),issuePanel(page.issues),exact('Page identity',{sourceId:page.sourceId,offset:page.offset,total:page.total,nextOffset:page.nextOffset}));},'Source rows and graph');root.append(rowsHost);
  }
  return root;
}
function mappingDefaults(ctx){
  const saved=ctx.selectedMapping?.configuration;
  return saved??{version:1,namespace:'',sourceSelection:{streamKeys:[],occurrenceIds:[]},csv:{encoding:'utf-8',delimiter:',',headerRow:1,columns:{phenomenonTime:'time',result:'status'},resultType:'string',nullToken:null,relations:{}},entities:[],bindings:[],markerProperty:'tjlabsCommissioning',batchSize:100};
}
function mappingEditor(ctx){
  const m=mappingDefaults(ctx),csv=m.csv??{},root=scopedForm(ctx,'mapping-editor','Create an explicit mapping version',[
    select('Retained source','sourceId',projectRecords(ctx,'sources'),ctx.state.sourceId,{required:true}),select('Target profile','targetId',projectRecords(ctx,'targets'),ctx.state.targetId,{required:true}),
    field('Mapping label','label',{required:true,value:ctx.selectedMapping?.label??''}),field('Reviewed namespace','namespace',{required:true,value:m.namespace}),
    field('Selected stream keys','streamKeys',{type:'textarea',value:list(m.sourceSelection?.streamKeys).join('\n'),help:'One exact source key per line. Empty selects all original streams.'}),
    field('Selected occurrence IDs','occurrenceIds',{type:'textarea',value:list(m.sourceSelection?.occurrenceIds).join('\n'),help:'Empty selects all retained occurrences. Explicit choices resolve conflicting retained identities.'}),
    field('CSV encoding','encoding',{type:'select',options:['utf-8','utf-16le','windows-1252'],value:csv.encoding??'utf-8'}),
    field('CSV delimiter','delimiter',{value:csv.delimiter??',',required:true,help:'Enter the actual delimiter. Use a literal tab for tab-separated data.'}),
    field('CSV header row','headerRow',{type:'number',min:1,value:csv.headerRow??1,required:true}),
    field('CSV result interpretation','resultType',{type:'select',value:csv.resultType??'string',options:['string','number','boolean','json'],help:'The explicit type applies to the original result field. Categorical Hamburg values remain strings.'}),
    field('CSV column map','columns',{type:'json',value:JSON.stringify(csv.columns??{},null,2),required:true,help:'Native property name → original CSV column name; keep phenomenonTime, resultTime and validTime distinct.'}),
    field('Explicit CSV null token','nullToken',{value:csv.nullToken??'',help:'Leave empty when no null token is selected. The companion checkbox chooses an explicit empty-string null token.'}),
    field('Use the entered value as an explicit null token','useNullToken',{type:'checkbox',value:csv.nullToken!==null&&csv.nullToken!==undefined}),
    field('CSV native relationships','csvRelations',{type:'json',value:JSON.stringify(csv.relations??{},null,2),required:true,help:'Native relation → sourceKey or {targetIdJson}. Quoted JSON text preserves the native identifier type.'}),
    field('Native entity definitions','entities',{type:'json',rows:10,value:JSON.stringify(m.entities??[],null,2),required:true,help:'Each definition has sourceKey, entityKind, body (object) or bodyText (exact JSON string), and optional relations. See the complete mapping field reference below.'}),
    field('Source-to-target bindings','bindings',{type:'json',rows:10,value:JSON.stringify(m.bindings??[],null,2),required:true,help:'Each binding selects sourceKey, create/bind/update, exact targetIdJson, optional overrides/relations and sourceOccurrenceId.'}),
    field('Reviewed provenance property','markerProperty',{value:m.markerProperty??'tjlabsCommissioning',required:true,help:'This target metadata addition is shown in the prepared payload.'}),
    field('Native batch size','batchSize',{type:'number',min:1,max:1000,value:m.batchSize??100,required:true})
  ],x=>{const configuration={version:1,namespace:x.namespace,sourceSelection:{streamKeys:parseLines(x.streamKeys),occurrenceIds:parseLines(x.occurrenceIds)},csv:{encoding:x.encoding,delimiter:x.delimiter,headerRow:number(x.headerRow),columns:parseObject(x.columns,'CSV columns'),resultType:x.resultType,nullToken:x.useNullToken?x.nullToken:null,relations:parseObject(x.csvRelations,'CSV relations')},entities:parseArray(x.entities,'Native definitions'),bindings:parseArray(x.bindings,'Bindings'),markerProperty:x.markerProperty,batchSize:number(x.batchSize)};
    return ctx.act('commissioning.mapping.save',{projectId:pId(ctx),sourceId:x.sourceId,targetId:x.targetId,label:x.label,configuration},{selectResult:'mappingId'});},{label:'Save mapping version',description:'Retains a new immutable mapping. Edition sources ignore CSV settings. Native identifiers remain exact JSON strings; the editor rejects authored numeric literals that the browser would change.'});
  root.classList.add('comm-mapping-editor');root.append(mappingReference());return root;
}
function mappingReference(){
  const definition={sourceKey:'<stable authored source key>',entityKind:'Sensors',body:{name:'<actual selected name>',description:'<actual description>',encodingType:'<actual metadata encoding>',metadata:'<actual metadata URL>'},relations:{}};
  const binding={sourceKey:'<exact retained source key>',mode:'bind',targetIdJson:'"<actual native string ID>"'};
  return h('details',{},h('summary',{},'Complete mapping field reference'),
    note('These are editable schema examples, not source observations. Replace bracketed text with the selected source and target values. Authored definitions enter the reviewed plan explicitly.'),
    exact('Authored native definition',definition,{open:true}),
    note('Use bodyText instead of body when an authored body contains exact numeric JSON that the browser would otherwise change. The complete JSON text stays inside that string until the original native plan is prepared.'),
    exact('Bind an original source identity to an actual native target',binding,{open:true}),
    table([{label:'Collection',key:'kind'},{label:'Required native body fields',key:'fields'},{label:'Relationships',key:'relations'}],[
      {kind:'Locations',fields:'name, description, encodingType, location',relations:'None'},
      {kind:'Things',fields:'name, description',relations:'Locations (array)'},
      {kind:'Sensors',fields:'name, description, encodingType, metadata',relations:'None'},
      {kind:'ObservedProperties',fields:'name, description, definition',relations:'None'},
      {kind:'FeaturesOfInterest',fields:'name, description, encodingType, feature',relations:'None'},
      {kind:'Datastreams',fields:'name, description, observationType, unitOfMeasurement',relations:'Thing, Sensor, ObservedProperty'},
      {kind:'MultiDatastreams',fields:'name, description, multiObservationDataTypes, unitOfMeasurements',relations:'Thing, Sensor, ObservedProperties (array)'},
      {kind:'HistoricalLocations',fields:'time',relations:'Thing, Locations (array)'},
      {kind:'Observations',fields:'phenomenonTime, result',relations:'Exactly one Datastream or MultiDatastream, plus FeatureOfInterest'}
    ]),
    exact('Relationship value shapes',{singleSource:{Thing:'<exact source key>'},singleTarget:{Sensor:{targetIdJson:'"<actual native string ID>"'}},many:{Locations:['<source key A>','<source key B>']}},{open:true}),
    note('CSV columns may select id, phenomenonTime, resultTime, validTime, result, resultQuality and parameters. Map phenomenonTime and result explicitly. An input CSV id remains an original string identifier. Empty selection arrays retain all original rows; one occurrence ID can select a reviewed conflicting occurrence.'));
}
export function mapping(ctx){
  const root=projectIntro(ctx,'Mapping and target','Choose the original target profile, field interpretation and native relationships. Inspect actual target entities before preparing the source-to-target plan.');if(!ctx.project){root.append(emptyProject(ctx));return root;}
  root.append(panel('Target profiles',recordTable(ctx,projectRecords(ctx,'targets'),[{label:'Service',render:r=>r.profile?.serviceUrl},{label:'Credential reference',render:r=>r.profile?.authorizationReference??'None'},{label:'Selection',render:r=>button('Select target',()=>pick(ctx,'targetId',recordId(r)))}])));
  root.append(scopedForm(ctx,'target-profile','Save a target profile',[
    field('Target label','label',{required:true}),field('SensorThings service URL','serviceUrl',{type:'url',required:true,help:'Use the actual HTTPS service root, or explicitly selected loopback HTTP reference installation.'}),
    field('Host authorization environment name','authorizationEnv',{help:'Only the variable name is retained here. Its value stays on the selected host.'}),
    field('Allow the selected loopback HTTP service','allowLoopback',{type:'checkbox'}),
    field('Request timeout (milliseconds)','requestTimeoutMs',{type:'number',min:1000,max:120000,value:45000,required:true}),
    field('Maximum complete response bytes','maxResponseBytes',{type:'number',min:1024,max:67108864,value:4194304,required:true})
  ],x=>ctx.act('commissioning.target.save',optional({projectId:pId(ctx),label:x.label,serviceUrl:x.serviceUrl,authorizationEnv:optionalText(x.authorizationEnv),allowLoopback:x.allowLoopback,requestTimeoutMs:number(x.requestTimeoutMs),maxResponseBytes:number(x.maxResponseBytes)}),{selectResult:'targetId'}),{label:'Save target version'}));
  if(projectRecords(ctx,'targets').length)root.append(scopedForm(ctx,'inspect-target','Inspect the selected native target',[
    select('Target profile','targetId',projectRecords(ctx,'targets'),ctx.state.targetId,{required:true}),
    field('Optional exact entity selections','entities',{type:'json',value:'[]',help:'Array of {kind,idJson}; idJson contains exact JSON text such as "12" or "\"station-a\"". Empty requests the manager’s declared service inspection.'})
  ],x=>{const entities=parseArray(x.entities,'Selected native entities');return ctx.act('commissioning.target.inspect',{projectId:pId(ctx),targetId:x.targetId,...(entities.length?{entities}:{})},{selectResult:'jobId',tab:'jobs'});},{label:'Start retained native inspection',description:'The actual FROST client performs this read-only inspection and retains its result in the original job journal.'}));
  root.append(panel('Mapping versions',recordTable(ctx,projectRecords(ctx,'mappings'),[{label:'Source',key:'sourceId'},{label:'Target',key:'targetId'},{label:'Use',render:r=>actionButtons(ctx,['Load editable configuration',()=>ctx.useMapping(r)],['Prepare plan',()=>ctx.act('commissioning.plan.prepare',{projectId:pId(ctx),mappingId:recordId(r)},{selectResult:'planId',tab:'plans'})])}])),mappingEditor(ctx));
  return root;
}
function planSteps(ctx,page){
  return h('div',{},table([{label:'Step',render:r=>h('code',{},r.stepId)},{label:'Entity / mode',render:r=>h('div',{},r.entityKind,badge(r.mode))},{label:'Source',render:r=>h('div',{},h('code',{},r.sourceKey),h('small',{},String(r.sourceRowCount??0)+' source rows'))},{label:'Exact target ID',render:r=>h('code',{},r.targetIdJson??'Resolved by native create result')},{label:'Review',render:r=>actionButtons(ctx,['Exact payload and relationships',()=>ctx.showNode('Plan step '+r.stepId,h('div',{},textBody('Exact authored request body',r.bodyText),exact('Native relations',r.relations,{open:true}),exact('Original source references',r.sourceRefs,{open:true}),exact('Complete plan step',r,{open:true})))])}],list(page.steps)),pager({...page,rows:page.steps},n=>{ctx.state.planOffset=n;ctx.render();}));
}
export function plans(ctx){
  const root=projectIntro(ctx,'Plan review','Review the complete source-to-target change, original identifiers, exact authored payload and every issue before selecting the native write.');if(!ctx.project){root.append(emptyProject(ctx));return root;}
  root.append(panel('Prepared plans',recordTable(ctx,projectRecords(ctx,'plans'),[{label:'Mapping',key:'mappingId'},{label:'State',render:r=>badge(stateOf(r))},{label:'Review',render:r=>button('Select plan',()=>pick(ctx,'planId',recordId(r)))}])));
  if(projectRecords(ctx,'mappings').length)root.append(scopedForm(ctx,'prepare-plan','Prepare the selected mapping',[select('Mapping version','mappingId',projectRecords(ctx,'mappings'),ctx.state.mappingId,{required:true})],x=>ctx.act('commissioning.plan.prepare',{projectId:pId(ctx),mappingId:x.mappingId},{selectResult:'planId'}),{label:'Prepare exact plan'}));
  if(!ctx.state.planId)return root;
  const host=panel('Selected plan',note('Reading the exact retained plan…'));
  ctx.readInto(host,async()=>{
    const page=await ctx.api('plans/'+enc(ctx.state.planId),{offset:ctx.state.planOffset??0,limit:100}),planId=ctx.state.planId;
    const content=h('div',{},exact('Plan identity and totals',Object.fromEntries(Object.entries(page).filter(([k])=>!['steps','rows'].includes(k))),{open:true}),issuePanel(page.issues),planSteps(ctx,page),files(ctx,page));
    content.append(scopedForm(ctx,'plan-review-'+planId,'Record plan review',[
      field('Decision','decision',{type:'select',options:[{value:'accept',label:'Accept the displayed plan'},{value:'revise',label:'Return for revision'}]}),field('Reviewer','actor',{required:true,value:ctx.state.actor??''}),field('Review note','note',{type:'textarea',required:true}),
      field('I reviewed the displayed issues, source selection and metadata additions','acknowledgeIssues',{type:'checkbox'})
    ],x=>{ctx.state.actor=x.actor;ctx.save();return ctx.act('commissioning.plan.review',{projectId:pId(ctx),planId,decision:x.decision,actor:x.actor,note:x.note,acknowledgeIssues:x.acknowledgeIssues},{selectResult:'reviewId'});},{label:'Retain plan decision'}));
    const reviews=projectRecords(ctx,'reviews').filter(r=>r.planId===planId);
    content.append(panel('Original plan decisions',recordTable(ctx,reviews,[{label:'Decision',key:'decision'},{label:'Actor',key:'actor'},{label:'Use',render:r=>button('Select review',()=>pick(ctx,'reviewId',recordId(r)))}])));
    content.append(scopedForm(ctx,'start-plan-'+planId,'Execute this reviewed plan',[
      field('Exact accepted review ID','reviewId',{required:true,value:ctx.state.reviewId??'',help:'Use the retained acceptance for this exact plan.'}),
      field('Confirm the exact target service URL','confirmServiceUrl',{type:'url',required:true,help:'Match the target version shown in this plan. This is the actual service to be changed.'}),
      field('Execute the displayed writes against the selected target','acknowledgeWrite',{type:'checkbox',required:true})
    ],x=>{if(!x.acknowledgeWrite)throw new Error('Confirm the displayed target writes.');return ctx.act('commissioning.run.start',{projectId:pId(ctx),planId,reviewId:x.reviewId,confirmServiceUrl:x.confirmServiceUrl,acknowledgeWrite:true},{selectResult:'jobId',tab:'jobs'});},{label:'Start original native job',description:'Returns the committed job immediately. The existing native writer continues its retained steps and preserves uncertain outcomes.'}));
    return content;
  },'Selected plan');root.append(host);return root;
}
function nativeSteps(ctx,page){
  return h('div',{},table([{label:'Step',render:r=>h('code',{},r.stepId)},{label:'State',render:r=>badge(stateOf(r))},{label:'Native target',render:r=>h('code',{},r.targetIdJson??'—')},{label:'Attempts',render:r=>list(r.attempts).length},{label:'Inspect',render:r=>actionButtons(ctx,
    ['Request, response and provenance',()=>ctx.showNode('Native step '+r.stepId,h('div',{},exact('Original step and complete attempt history',r,{open:true}),typeof r.bodyText==='string'?textBody('Exact request body',r.bodyText):null,files(ctx,r)))],
    ...((r.state==='AWAITING_RECONCILIATION'&&(!page.received||page.localBinding))?[['Resolve this step',()=>{ctx.state.stepId=r.stepId;ctx.save();ctx.render();}]]:[])
  )}],list(page.steps)),pager({...page,rows:page.steps},n=>{ctx.state.jobOffset=n;ctx.render();}));
}
function receivedBinding(ctx,page){
  const jobId=page.id,profile=projectRecords(ctx,'targets').find(x=>x.id===page.targetId)?.profile;
  return scopedForm(ctx,'received-job-binding-'+jobId,'Resume a received pending job on this host',[
    field('Confirm the original target service URL','confirmServiceUrl',{type:'url',required:true,help:'Retained target: '+(profile?.serviceUrl??'Open the original job input below. Match its exact target root.')}),
    field('Continue the original retained job and its target writes on this host','acknowledgeWrite',{type:'checkbox',required:true})
  ],x=>ctx.act('commissioning.run.resume',{projectId:pId(ctx),jobId,confirmServiceUrl:x.confirmServiceUrl,acknowledgeWrite:x.acknowledgeWrite}),{label:'Bind this host and resume original job',description:'This received job has no local binding. Its original plan, completed steps and uncertain outcomes stay together when the selected host continues it.'});
}
function resolutionForm(ctx,page){
  const jobId=page.id;
  return scopedForm(ctx,'resolve-step-'+jobId,'Resolve an uncertain native write',[
    field('Original step ID','stepId',{required:true,value:ctx.state.stepId??''}),field('Decision','decision',{type:'select',options:[{value:'adopt',label:'Adopt an actual existing target result'},{value:'retry',label:'Explicitly retry this same retained step'}]}),
    field('Exact native target identifier JSON','targetIdJson',{value:'',help:'Keep JSON type and digits verbatim. A numeric ID is unquoted; a string ID includes its JSON quotes. Use the actual target result, not a map view ID.'}),
    field('Operator','actor',{required:true,value:ctx.state.actor??''}),field('Actual target finding and reason','note',{type:'textarea',required:true})
  ],x=>{ctx.state.actor=x.actor;ctx.save();return ctx.act('commissioning.run.resolve',optional({projectId:pId(ctx),jobId,stepId:x.stepId,decision:x.decision,targetIdJson:optionalText(x.targetIdJson),actor:x.actor,note:x.note}));},{label:'Retain same-step resolution',description:'Read the original request/response and actual target result first. An unobserved HTTP result is not silently repeated.'});
}
export function jobs(ctx){
  const root=projectIntro(ctx,'Native operation','Operate the original FROST job and its saved step history. Keep confirmed writes, uncertain results, target verification and any compensating plan attached to that same job.');if(!ctx.project){root.append(emptyProject(ctx));return root;}
  root.append(panel('Native jobs',recordTable(ctx,projectRecords(ctx,'jobs'),[{label:'Kind',key:'kind'},{label:'State',render:r=>badge(stateOf(r))},{label:'Plan',key:'planId'},{label:'Open',render:r=>button('Select job',()=>pick(ctx,'jobId',recordId(r)))}])));
  if(!ctx.state.jobId)return root;
  const jobId=ctx.state.jobId;
  const live=panel('Selected native job',note('Reading its retained native result…'));root.append(live);
  ctx.readInto(live,async()=>{
    const page=await ctx.api('jobs/'+enc(jobId),{offset:ctx.state.jobOffset??0,limit:100}),state=page.state,needsBinding=page.received===true&&!page.localBinding&&state!=='COMPLETE';
    const complete=page.progress?.complete??0,total=page.progress?.total??page.stepCount??page.total??0;
    const current=h('div',{},stats([['State',state],['Completed',complete],['Total',total]]),exact('Job, source and target identity',Object.fromEntries(Object.entries(page).filter(([k])=>!['steps','rows','files'].includes(k))),{open:true}));
    if(page.error)current.append(note((page.error.code?page.error.code+': ':'')+(page.error.message??String(page.error)),'error'));
    if(page.notBefore)current.append(note('Retained provider retry time: '+page.notBefore));
    current.append(actionButtons(ctx,
      ['Refresh saved progress',()=>ctx.refresh()],
      ['Resume original job',()=>ctx.act('commissioning.run.resume',{projectId:pId(ctx),jobId}),{disabled:needsBinding||['COMPLETE','RUNNING','STARTING','DRAINING','CANCELLING'].includes(state)}],
      ['Cancel original job',()=>ctx.act('commissioning.run.cancel',{projectId:pId(ctx),jobId}),{disabled:['COMPLETE','CANCELLED','CANCELLING'].includes(state)}],
      ['Reconcile original outcomes',()=>ctx.act('commissioning.run.reconcile',{projectId:pId(ctx),jobId})],
      ['Verify actual target',()=>ctx.act('commissioning.run.verify',{projectId:pId(ctx),jobId},{selectResult:'jobId'}),{disabled:page.latest?.closed!==true||complete===0}],
      ['Prepare compensating plan',()=>ctx.act('commissioning.rollback.prepare',{projectId:pId(ctx),jobId},{selectResult:'planId',tab:'plans'}),{disabled:page.kind!=='commission'||page.latest?.closed!==true}]
    ),note('Cancellation retains completed and uncertain steps. Resume and reconcile continue this original job. A compensating plan is separately prepared and reviewed against actual target state; bind-only entities are not deleted.'),nativeSteps(ctx,page),files(ctx,page));
    if(needsBinding)current.append(receivedBinding(ctx,page));
    if(!needsBinding&&(state==='AWAITING_RECONCILIATION'||list(page.steps).some(x=>x.state==='AWAITING_RECONCILIATION')))current.append(resolutionForm(ctx,page));
    current.append(scopedForm(ctx,'delivery-review-'+jobId,'Record commissioning outcome',[
      field('Decision','decision',{type:'select',options:[{value:'accept',label:'Accept the completed result'},{value:'revise',label:'Return for revision'},{value:'reject',label:'Reject the result'}]}),field('Reviewer','actor',{required:true,value:ctx.state.actor??''}),field('Result and remaining work','note',{type:'textarea',required:true})
    ],x=>{ctx.state.actor=x.actor;ctx.save();return ctx.act('commissioning.review.record',{projectId:pId(ctx),jobId,decision:x.decision,actor:x.actor,note:x.note});},{label:'Retain outcome review',description:'Acceptance selects an actual complete, closed native result. Revision and rejection retain the original reviewer’s decision.'}));
    current.append(panel('Verification results',recordTable(ctx,list(page.verifications),[{label:'State',render:r=>badge(stateOf(r))},{label:'Open',render:r=>button('Inspect verification job',()=>pick(ctx,'jobId',r.id))}])),panel('Operating reviews',recordTable(ctx,list(page.reviews),[{label:'Decision',key:'decision'},{label:'Reviewer',key:'actor'}])));
    ctx.watchJob(jobId,current.querySelector('.metrics'),page);return current;
  },'Selected native job');
  const mapHost=panel('Retained target map and observation view',h('div',{class:'comm-map-container'},note('Opening the selected native result with the original STAM viewer…')));root.append(mapHost);
  ctx.mountMap(mapHost,jobId);
  return root;
}
export function receiving(ctx){
  const root=projectIntro(ctx,'Receiving and history','Prepare or receive the complete editable project: sources, mappings, exact plans, native journals, typed target bindings, verification and earlier editions.');
  if(ctx.project){
    root.append(scopedForm(ctx,'prepare-handoff','Prepare a complete handoff',[field('Handoff label','label',{required:true,value:label(ctx.project)+' — complete handoff'})],x=>ctx.act('commissioning.handoff.prepare',{projectId:pId(ctx),label:x.label}),{label:'Prepare complete package',description:'The original exporter includes complete selected source archives, project history, native journals and editable source closure. Host credential values and private session tokens are omitted.'}));
    const handoffs=projectRecords(ctx,'handoffs'),exports=projectRecords(ctx,'exports');
    root.append(panel('Project packages and receiving history',recordTable(ctx,handoffs,[{label:'Direction',key:'direction'},{label:'Disposition',key:'disposition'},{label:'Edition',key:'sequence'},{label:'Created',key:'createdAt'},{label:'Package',render:r=>r.fileId?actionButtons(ctx,['Download complete package',()=>ctx.download(r.fileId)]):files(ctx,r)}]),exports.length?files(ctx,exports):null),panel('Project identity',exact('Selected project and history head',ctx.project.project,{open:true})));
    const historyHost=panel('Complete retained project history',note('Reading the original project history…'));
    ctx.readInto(historyHost,async()=>{const page=await ctx.api('projects/'+enc(ctx.state.projectId)+'/history',{offset:ctx.state.historyOffset??0,limit:100});return h('div',{},recordTable(ctx,list(page.rows),[{label:'Action',key:'action'},{label:'Created',key:'createdAt'},{label:'Sequence',key:'sequence'}]),pager(page,n=>{ctx.state.historyOffset=n;ctx.save();ctx.render();}),exact('Complete history page',{offset:page.offset,total:page.total,nextOffset:page.nextOffset}));},'Complete retained project history');root.append(historyHost);
  }
  if(ctx.client.info.sourceInboxConfigured){
    root.append(uploadPanel(ctx,{title:'Receive a complete commissioning handoff',kind:'handoff'}),selectedFile(ctx,'handoff'));
    if(ctx.state.inboxFile)root.append(scopedForm(ctx,'receive-handoff','Import the selected complete handoff',[field('I reviewed this complete package identity','confirmed',{type:'checkbox',required:true})],x=>{if(!x.confirmed)throw new Error('Review the selected complete package.');const f=ctx.state.inboxFile;return ctx.act('commissioning.handoff.receive',{filename:f.filename,expectedSha256:f.sha256,expectedBytes:f.bytes},{selectResult:'projectId'});},{label:'Receive original project',description:'The existing importer validates complete source closure before adopting the project. Repeated receiving reuses the same identity; newer compatible history advances it, older history preserves later work, and divergent history requires a separate workspace.'}));
  }
  root.append(panel('Workspace commissioning history',exact('Current original overview',ctx.overview,{open:true}),files(ctx,ctx.overview)),panel('Operating contract',exact('Current original commissioning schema',ctx.schema,{open:true}),note('Received pending jobs retain their original history and require an explicit host/target binding before execution. Use the original operation banner to reconcile an interrupted browser request.')));
  return root;
}
export function renderView(ctx){return({sources,mapping,plans,jobs,receiving}[ctx.state.tab]??sources)(ctx);}
