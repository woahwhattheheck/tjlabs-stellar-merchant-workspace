// MIT. Original form generations and their collection/reporting consequences.
import {digest, fault, stable} from '../../odata/state.mjs';

export const FORM_SOURCE_SCHEMA='stellar-forge.odk-form-source.v1';
export const FORM_IMPACT_SCHEMA='stellar-forge.odk-form-impact.v1';
const clone=value=>structuredClone(value);
const need=(ok,code,message)=>{if(!ok)throw fault(code,message);};
const list=(value,label)=>{need(Array.isArray(value),'FORM_REVIEW_LIST','Keep the complete '+label+' array.');return value;};
const string=(value,label,{empty=false}={})=>{need(typeof value==='string'&&(empty||value.length>0),'FORM_REVIEW_TEXT','Keep the original '+label+'.');return value;};
const hash=value=>{need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'FORM_REVIEW_HASH','Keep the original SHA-256 source identity.');return value;};
export const formIdentity=form=>stable([form.connectionId??null,String(form.projectId),form.formId]);
const path=value=>{string(value,'XForm field path');need(value.startsWith('/')&&!/[\u0000-\u001f\u007f]/u.test(value),'FORM_REVIEW_PATH','Use the original absolute XForm field path.');return value;};
const unique=(values,key,label)=>{const seen=new Set();for(const value of values){const id=key(value);need(!seen.has(id),'FORM_REVIEW_DUPLICATE','The '+label+' repeats '+id+'.');seen.add(id);}return values;};
const receipt=value=>{
  need(value&&typeof value==='object','FORM_REVIEW_SOURCE','Keep the original source receipt.');
  hash(value.sha256);need(Number.isSafeInteger(value.bytes)&&value.bytes>=0,'FORM_REVIEW_BYTES','Keep the original byte count.');
  return clone(value);
};

export function normalizeFormSource(input){
  need(input&&typeof input==='object','FORM_REVIEW_SOURCE','Supply the complete retained form source.');
  const form=clone(input.form??{});
  form.projectId=String(form.projectId??'');string(form.projectId,'project ID');string(form.formId,'XML form ID');
  string(form.version,'form version',{empty:true});
  if(form.connectionId!==undefined)string(form.connectionId,'connection ID');
  const fields=unique(list(input.fields?.values,'native fields').map(value=>{
    need(value&&typeof value==='object','FORM_REVIEW_FIELD','Keep each original native field.');
    return {...clone(value),path:path(value.path),type:string(value.type,'native field type')};
  }),value=>value.path,'native field list');
  const model=input.model==null?null:clone(input.model);
  if(model){
    need(typeof model==='object'&&!Array.isArray(model),'FORM_REVIEW_MODEL','Use the retained authoring model object.');
    if(model.fields!==undefined)unique(list(model.fields,'authoring fields'),value=>path(value.path),'authoring field list');
    if(model.repeats!==undefined)unique(list(model.repeats,'repeat structures'),value=>path(value.path),'repeat structure list');
    if(model.languages!==undefined)unique(list(model.languages,'languages').map(value=>string(value,'language',{empty:true})),value=>value,'language list');
  }
  const media=input.media==null?{complete:false,items:[]}:clone(input.media);
  unique(list(media.items,'attachment originals'),value=>string(value.name,'attachment name'),'attachment list');
  for(const item of media.items){
    if(item.sha256!=null)hash(item.sha256);
    if(item.bytes!=null)need(Number.isSafeInteger(item.bytes)&&item.bytes>=0,'FORM_REVIEW_BYTES','Keep the original attachment byte count.');
  }
  const source={schema:FORM_SOURCE_SCHEMA,form,origin:clone(input.origin??{}),xml:receipt(input.xml),
    fields:{...clone(input.fields),values:fields},model,media,reporting:clone(input.reporting??null),modelSource:input.modelSource?receipt(input.modelSource):null,
    history:clone(input.history??[]),coverage:clone(input.coverage??{})};
  if(source.fields.sha256!==undefined)hash(source.fields.sha256);
  source.contentHash=digest(stable(source));
  return source;
}

export function normalizeReportingBindings(values=[]){
  return unique(list(values,'reporting bindings').map(value=>({
    path:path(value.path),table:string(value.table,'original reporting table'),field:string(value.field,'original reporting field'),
  })),value=>stable([value.table,value.field]),'reporting selector mapping');
}
const modelField=(source,key)=>source.model?.fields?.find(value=>value.path===key);
const mediaIdentity=value=>value?{name:value.name,type:value.type??null,exists:value.exists??null,
  blobExists:value.blobExists??null,datasetExists:value.datasetExists??false,
  outcome:value.outcome??null,sha256:value.sha256??null,bytes:value.bytes??null}:null;
const facet=(source,name)=>name==='fields'?'complete':name==='media'?(source.media.complete===true?'complete':'partial'):
  name==='reporting'?(source.reporting?'retained':'absent'):
  source.model&&Object.hasOwn(source.model,name)?'retained':'absent';
const cleanDependency=value=>({id:value.id,kind:value.kind,label:value.label,definitionHash:value.definitionHash,
  selectors:clone(value.selectors??[]),source:clone(value.source??{})});
const dependencyKey=(table,field)=>stable([table,field]);

export function compareFormSources({baseline,candidate,historical=[],dependencies=[],bindings=[]}){
  const before=normalizeFormSource(baseline),after=normalizeFormSource(candidate);
  need(formIdentity(before.form)===formIdentity(after.form),'FORM_REVIEW_TARGET','Compare generations of the same original Central connection, project and form.');
  const history=[before,...historical.map(normalizeFormSource)];
  for(const source of history)need(formIdentity(source.form)===formIdentity(before.form),'FORM_REVIEW_HISTORY','Keep historical generations of this same original form.');
  const selectedBindings=normalizeReportingBindings(bindings);
  const oldFields=new Map(before.fields.values.map(value=>[value.path,value]));
  const newFields=new Map(after.fields.values.map(value=>[value.path,value]));
  const bindingBySelector=new Map(selectedBindings.map(value=>[dependencyKey(value.table,value.field),value.path]));
  const dependencyRows=dependencies.map(cleanDependency).map(value=>({...value,selectors:value.selectors.map(selector=>({
    ...selector,nativePath:bindingBySelector.get(dependencyKey(selector.table,selector.field))??selector.nativePath??null,
  }))}));
  const matches=(key,descendants=false)=>dependencyRows.flatMap(value=>{
    const selectors=value.selectors.filter(item=>item.nativePath===key||descendants&&item.nativePath?.startsWith(key+'/'));
    return selectors.length?[{id:value.id,kind:value.kind,label:value.label,definitionHash:value.definitionHash,
      selectors,selector:selectors.map(item=>item.table+' / '+item.field).join(', ')}]:[];
  });
  const changes=[];
  function add(kind,severity,summary,key,left,right,{descendants=false,affected,detail}={}){
    const related=affected??(key?matches(key,descendants):[]);
    const identity={kind,path:key??null,before:left??null,after:right??null,dependencies:related};
    const change={id:'change-'+digest(stable(identity)).slice(0,32),kind,severity,summary,...identity};
    if(detail)change.detail=detail;changes.push(change);return change;
  }
  if(history.some(value=>value.form.version===after.form.version))
    add('version-reused','incompatible','Choose a form version that has not already been published.',null,before.form.version,after.form.version);
  else add('version','information','The candidate has a new original version string.',null,before.form.version,after.form.version);
  if(before.xml.sha256!==after.xml.sha256)
    add('definition','information','The candidate contains a different complete XForm definition.',null,before.xml,after.xml);
  const known=new Map();
  for(const source of history)for(const field of source.fields.values){
    if(!known.has(field.path))known.set(field.path,new Map());
    const types=known.get(field.path);
    if(!types.has(field.type))types.set(field.type,[]);
    if(!types.get(field.type).includes(source.form.version))types.get(field.type).push(source.form.version);
  }
  for(const [key,oldField] of oldFields){
    const next=newFields.get(key);
    if(!next){add('field-removed','review','This field leaves the current form and default current-definition exports.',key,oldField,null,
      {descendants:true,detail:'Earlier submissions retain their original values; historical-field exports are a separate selection.'});continue;}
    if(oldField.type!==next.type){
      add('field-type',next.type==='string'?'review':'incompatible',
        next.type==='string'?'This field becomes text; check numeric, date and coded-value reports.':'This previously published field changes its native data type.',
        key,oldField.type,next.type,{descendants:true});
    }
    if(!!oldField.binary!==!!next.binary)add('field-binary','review','This field changes attachment storage behavior.',key,!!oldField.binary,!!next.binary);
  }
  for(const [key,next] of newFields){
    if(!oldFields.has(key))add('field-added','compatible','This field is added to the current form.',key,null,next);
    const former=known.get(key);
    if(former&&next.type!=='string'){
      const conflicting=[...former].filter(([type])=>type!==next.type);
      if(conflicting.length&&(!oldFields.has(key)||oldFields.get(key).type===next.type))
        add('historical-type','incompatible','This field identity reuses a different previously published data type.',key,
          conflicting.map(([type,versions])=>({type,versions})),next.type,
          {detail:'Compatibility includes every retained published generation, including fields removed before the current baseline.'});
    }
  }
  const facets=['fields','media','fieldsModel','repeats','languages','settings','reporting'];
  const coverage=facets.map(name=>({facet:name==='fieldsModel'?'authoring fields':name,
    baseline:facet(before,name==='fieldsModel'?'fieldsModel':name),candidate:facet(after,name==='fieldsModel'?'fieldsModel':name)}));
  coverage.find(value=>value.facet==='authoring fields').baseline=before.model?.fields?'retained':'absent';
  coverage.find(value=>value.facet==='authoring fields').candidate=after.model?.fields?'retained':'absent';
  if(before.model?.fields&&after.model?.fields){
    const modelPaths=new Set([...before.model.fields,...after.model.fields].map(value=>value.path));
    const properties=['label','hint','required','readonly','relevant','calculate','constraint','appearance',
      'constraint_message','required_message','guidance_hint','image','audio','video','choice_filter'];
    for(const key of modelPaths){
      const left=modelField(before,key),right=modelField(after,key);
      if(!left||!right)continue;
      const semanticProperties=[...new Set([...properties,...Object.keys(left),...Object.keys(right)])].filter(name=>!['path','choices','source','origin','span','loc','sheet','row','column'].includes(name)&&!name.startsWith('_'));
      for(const name of semanticProperties)if(stable(left[name]??null)!==stable(right[name]??null))
        add('authoring-'+name,'review',
          'The field '+name.replaceAll('_',' ')+' changes.',key,left[name],right[name]);
      if(stable(left.choices??null)!==stable(right.choices??null)){
        const oldChoices=left.choices??null,newChoices=right.choices??null;
        add('choices','review','The question choice definition changes; saved codes and visible labels remain distinct.',key,oldChoices,newChoices,
          {detail:'Choice names are saved values. A change from one selection to multiple selections changes serialization even when the native type stays string.'});
      }
    }
  }else if(before.xml.sha256!==after.xml.sha256){
    add('authoring-coverage','review','Review collection logic and translations in the original definitions; both complete authoring models are not retained.',null,
      before.model?'partial':'absent',after.model?'partial':'absent');
  }
  for(const name of ['repeats','languages','defaultLanguage','settings','entities','datasets','submission','encryption']){
    const left=before.model?.[name],right=after.model?.[name];
    if(left!==undefined&&right!==undefined&&stable(left)!==stable(right)){
      if(name==='repeats'){
        const oldRepeats=new Map(left.map(value=>[value.path,value])),newRepeats=new Map(right.map(value=>[value.path,value]));
        for(const key of new Set([...oldRepeats.keys(),...newRepeats.keys()]))
          if(stable(oldRepeats.get(key)??null)!==stable(newRepeats.get(key)??null))
            add('repeat','review','The repeat structure or repeat rule changes; review descendant tables and parent joins.',key,
              oldRepeats.get(key),newRepeats.get(key),{descendants:true});
      }else add('authoring-'+name,'review',name==='languages'||name==='defaultLanguage'?
        'The available languages or default language changes; blank translations remain blank.':'The original form settings change.',
        null,left,right,{affected:dependencyRows.map(value=>({...value,selector:'Whole form'}))});
    }
  }
  const oldMedia=new Map(before.media.items.map(value=>[value.name,value])),newMedia=new Map(after.media.items.map(value=>[value.name,value]));
  for(const name of new Set([...oldMedia.keys(),...newMedia.keys()])){
    const left=mediaIdentity(oldMedia.get(name)),right=mediaIdentity(newMedia.get(name));
    if(stable(left)!==stable(right))add('attachment','review','The attachment '+name+' changes in content, availability or source mode.',null,left,right);
  }
  if(!after.media.complete)add('attachment-coverage','review','The candidate attachment inventory has incomplete original receiving.',null,before.media.complete,after.media.complete);
  const unavailable=after.media.items.filter(value=>value.exists===false||value.outcome==='missing'||value.outcome==='not-uploaded');
  if(unavailable.length)add('attachment-missing','review','Review the unavailable attachments declared by the original candidate.',null,null,
    unavailable.map(value=>({name:value.name,type:value.type,datasetExists:value.datasetExists??false})));
  const unmapped=dependencyRows.flatMap(value=>value.selectors.filter(selector=>!selector.nativePath&&!selector.system).map(selector=>({
    dependencyId:value.id,label:value.label,kind:value.kind,table:selector.table,field:selector.field,
  })));
  if(unmapped.length)add('reporting-mapping','review','Connect saved report selectors to their original form paths, or record how their impact was reviewed.',null,null,unmapped,
    {affected:dependencyRows.filter(value=>value.selectors.some(selector=>!selector.nativePath&&!selector.system)).map(value=>({...value,selector:'Unmapped original reporting fields'}))});
  if(before.coverage.historyMissing?.length||before.coverage.publishedVersionsComplete===false)
    add('history-coverage','review','Review the published generations whose original field schemas are not retained.',null,null,before.coverage.historyMissing??[],{detail:'The historical native type comparison covers the original generations retained in this workspace.'});
  const ranks={incompatible:0,review:1,compatible:2,information:3};
  changes.sort((a,b)=>ranks[a.severity]-ranks[b.severity]||(a.path??'').localeCompare(b.path??'')||a.kind.localeCompare(b.kind));
  const dependencyHash=digest(stable(dependencies.map(cleanDependency)));
  const assessment={schema:FORM_IMPACT_SCHEMA,baselineHash:before.contentHash,candidateHash:after.contentHash,
    historical:history.map(value=>({version:value.form.version,contentHash:value.contentHash,xml:value.xml,fieldsSha256:value.fields.sha256??null})),
    dependencyHash,bindings:selectedBindings,changes,coverage,
    reporting:{dependencies:dependencyRows,bindings:selectedBindings,fieldChoices:[...new Map([...before.fields.values,...after.fields.values].map(value=>[value.path,{path:value.path,type:value.type}])).values()],unmapped},
    summary:{changes:changes.length,incompatible:changes.filter(value=>value.severity==='incompatible').length,
      review:changes.filter(value=>value.severity==='review').length,compatible:changes.filter(value=>value.severity==='compatible').length,
      information:changes.filter(value=>value.severity==='information').length,
      affectedOutputs:new Set(changes.flatMap(value=>value.dependencies.map(item=>item.id))).size}};
  assessment.contentHash=digest(stable(assessment));return assessment;
}
