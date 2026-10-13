// SPDX-License-Identifier: MIT
// Shared original customer-review model. No network, filesystem or account access.
export function createReviewModel({sha256,decodeBase64,encodeUtf8}) {
  const PACKAGE='tjl.economic-client-review-package.v1',DOCUMENT='tjl.economic-client-review.v1';
  const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const copy=v=>JSON.parse(JSON.stringify(v));
  function canonical(v){
    if(v===null||typeof v!=='object'){
      if(typeof v==='number'&&!Number.isFinite(v))throw new Error('Use finite JSON values');
      const text=JSON.stringify(v);if(text===undefined)throw new Error('Use complete JSON values');return text;
    }
    if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
    return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  }
  const hash=async v=>sha256(encodeUtf8(canonical(v)));
  function string(v,name,max=200000,empty=true){
    if(typeof v!=='string'||v.includes('\0')||v.length>max||(!empty&&!v.trim()))throw new Error('Supply '+name+' as valid text');
    return v;
  }
  function id(v,name){
    if(typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(v))throw new Error('Use the original '+name);
    return v;
  }
  function digest(v,name){if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))throw new Error('Use the original '+name);return v;}
  function exact(v,keys,name){
    if(!plain(v)||Object.keys(v).some(k=>!keys.includes(k)))throw new Error('Unknown '+name+' fields');
    return v;
  }
  function reportShape(pkg){
    if(!plain(pkg)||pkg.schema!==PACKAGE||!plain(pkg.report)||pkg.report.schema!=='tjl.economic-client-briefing.v1')
      throw new Error('Open a complete original economic briefing review package');
    if(pkg.project_id!==pkg.report.project_id||pkg.briefing_id!==pkg.report.id)throw new Error('The original report binding differs');
    if(!Array.isArray(pkg.report.series)||!Array.isArray(pkg.report.companions))throw new Error('The report has no complete series and companion arrays');
    return pkg.report;
  }
  function target(pkg,targetId){
    const report=reportShape(pkg);string(targetId,'review target',500,false);
    if(targetId==='briefing')return {target_id:targetId,kind:'briefing',label:report.title,original:{
      title:report.title,audience:report.audience,summary:report.summary,editorial_notes:report.editorial_notes,
      created_at:report.created_at,revision:report.revision,report_id:report.id
    },fields:[{key:'summary',label:'Executive summary',value:report.summary},
              {key:'editorial_notes',label:'Editorial notes',value:report.editorial_notes}]};
    if(targetId.startsWith('series:')){
      const series=report.series.find(s=>s.series_id===targetId.slice(7));
      if(!series)throw new Error('Unknown original review series');
      const {observations,...original}=series;
      return {target_id:targetId,kind:'series',series_id:series.series_id,label:series.title,original,
        fields:['title','interpretation','methodology'].map(key=>({key,label:key,value:series[key]??''}))};
    }
    if(targetId.startsWith('observation:')){
      const value=targetId.slice(12),split=value.lastIndexOf(':'),seriesId=value.slice(0,split),position=value.slice(split+1);
      if(split<1||!/^(0|[1-9][0-9]*)$/.test(position))throw new Error('Use the original observation position');
      const series=report.series.find(s=>s.series_id===seriesId),nativePosition=Number(position);
      if(!series||!Number.isSafeInteger(nativePosition))throw new Error('Unknown original observation');
      const index=nativePosition-series.native_order.first;
      if(index<0||index>=series.observations.length)throw new Error('The observation is outside this original report edition');
      return {target_id:targetId,kind:'observation',series_id:seriesId,native_position:nativePosition,
        label:series.title+' · '+String(series.observations[index].TIME_PERIOD??'')+' · original position '+position,
        original:{capture_id:series.capture_id,dataset_ref:series.dataset_ref,series_key:series.series_key,
          native_position:nativePosition,observation:copy(series.observations[index]),units:series.units,frequency:series.frequency,
          release:copy(series.release??null),rights:copy(series.rights)},fields:[]};
    }
    if(targetId.startsWith('companion:')){
      const companion=report.companions.find(c=>c.id===targetId.slice(10));
      if(!companion)throw new Error('Unknown original companion report');
      return {target_id:targetId,kind:'companion',label:companion.label,original:copy(companion),fields:[]};
    }
    throw new Error('Select an original report, series, observation or companion');
  }
  function targets(pkg,{kind=null,series_id=null,offset=0,limit=100,query=''}={}){
    const report=reportShape(pkg);
    if(kind!==null&&!['briefing','series','observation','companion'].includes(kind))throw new Error('Unknown target kind');
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>500)throw new Error('Use an exact visible range up to 500 targets');
    string(query,'search text',2000);const needle=query.toLocaleLowerCase(),rows=[];let total=0;
    function add(targetId,kind,label,extra={}){
      if(needle&&!String(label).toLocaleLowerCase().includes(needle)&&!targetId.toLocaleLowerCase().includes(needle))return;
      if(total>=offset&&rows.length<limit)rows.push({target_id:targetId,kind,label,...extra});total++;
    }
    if(!kind||kind==='briefing')add('briefing','briefing',report.title);
    for(const series of report.series){
      if(series_id!==null&&series.series_id!==series_id)continue;
      if(!kind||kind==='series')add('series:'+series.series_id,'series',series.title,{series_id:series.series_id});
      if(!kind||kind==='observation')for(let i=0;i<series.observations.length;i++){
        const observation=series.observations[i],native_position=series.native_order.first+i;
        add('observation:'+series.series_id+':'+native_position,'observation',
          series.title+' · '+String(observation.TIME_PERIOD??'')+' · '+String(observation.OBS_VALUE??'')+' · '+native_position,
          {series_id:series.series_id,native_position});
      }
    }
    if(!kind||kind==='companion')for(const companion of report.companions)add('companion:'+companion.id,'companion',companion.label);
    return {total,offset,next_offset:offset+rows.length<total?offset+rows.length:null,rows};
  }
  async function validatePackage(pkg){
    reportShape(pkg);digest(pkg.id,'package identity');id(pkg.project_id,'source project');digest(pkg.briefing_id,'original briefing');
    string(pkg.created_at,'creation time',100,false);string(pkg.recipient,'intended reviewer',1000,false);string(pkg.label,'review label',1000,false);
    const unsigned=copy(pkg);delete unsigned.id;if(await hash(unsigned)!==pkg.id)throw new Error('The complete original review package changed');
    const report=copy(pkg.report),reportId=report.id;delete report.id;if(report.comparison)report.comparison.after=null;
    if(await hash(report)!==reportId)throw new Error('The original briefing content identity differs');
    if(!Array.isArray(pkg.files)||!Array.isArray(pkg.sources))throw new Error('Retain the complete original report files and sources');
    const names=new Set();let total=0;const byName=new Map();
    for(const file of pkg.files){
      string(file.name,'file name',4096,false);
      if(file.name.startsWith('/')||file.name.includes('\\')||file.name.split('/').some(p=>!p||p==='.'||p==='..')||names.has(file.name))
        throw new Error('Use unique original relative file names');
      names.add(file.name);digest(file.sha256,'file hash');string(file.content_type,'file type',200,false);
      if(typeof file.content_base64!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content_base64))throw new Error('Invalid complete original file bytes');
      const bytes=decodeBase64(file.content_base64);total+=bytes.length;
      if(total>512*1024*1024||!Number.isSafeInteger(file.bytes)||file.bytes!==bytes.length||await sha256(bytes)!==file.sha256)
        throw new Error('A complete original review file differs or exceeds 512 MiB');
      byName.set(file.name,file);
    }
    for(const name of ['briefing.json','briefing.html','observations.csv','SOURCE_RIGHTS.json'])if(!names.has('report/'+name))
      throw new Error('The original full briefing file is missing: '+name);
    const reportJson=byName.get('report/briefing.json');
    if(await sha256(encodeUtf8(JSON.stringify(pkg.report,null,2)+'\n'))!==reportJson.sha256)
      throw new Error('The full original briefing JSON differs from its retained file');
    for(const companion of pkg.report.companions)for(const [name,identity]of Object.entries(companion.files)){
      const file=byName.get('companions/'+companion.id+'/'+name);
      if(!file||file.bytes!==identity.bytes||file.sha256!==identity.sha256)throw new Error('An original complete companion file is missing or changed');
    }
    const sourceIds=new Set();
    for(const item of pkg.sources){
      const source=item.source;
      if(!plain(source)||sourceIds.has(source.id))throw new Error('Duplicate or invalid original source');
      digest(source.id,'source identity');sourceIds.add(source.id);string(item.raw_text,'original source response',512*1024*1024);
      const bytes=encodeUtf8(item.raw_text);total+=bytes.length;
      if(total>512*1024*1024||bytes.length!==source.body?.bytes||await sha256(bytes)!==source.body?.sha256)
        throw new Error('The complete original source response differs');
    }
    for(const capture of Object.values(pkg.report.sources))for(const source of capture.sources)
      if(!sourceIds.has(source.id))throw new Error('An original selected source response is missing');
    return pkg;
  }
  function draftShape(pkg,input){
    exact(input,['reviewer','notes','decisions'],'review draft');
    string(input.reviewer,'reviewer name',1000,false);string(input.notes,'review notes');
    if(!plain(input.decisions)||Object.keys(input.decisions).length>100000)throw new Error('Use the complete selected review decisions');
    const decisions={};
    for(const [targetId,row]of Object.entries(input.decisions)){
      exact(row,['status','comment','proposal'],'review decision');
      if(!['approved','question','change_requested'].includes(row.status))throw new Error('Choose a review decision');
      string(row.comment,'review comment');const original=target(pkg,targetId);
      const value={status:row.status,comment:row.comment};
      if(row.proposal!==undefined&&row.proposal!==null){
        exact(row.proposal,['field','value'],'editorial proposal');
        if(!original.fields.some(f=>f.key===row.proposal.field))throw new Error('Only the original editable editorial fields accept proposals');
        string(row.proposal.value,'proposed editorial text');
        if(row.status!=='change_requested')throw new Error('An editorial proposal belongs to a requested change');
        value.proposal={field:row.proposal.field,value:row.proposal.value};
      }
      decisions[targetId]=value;
    }
    return {reviewer:input.reviewer,notes:input.notes,decisions};
  }
  async function validateDocument(doc,{files=true}={}){
    exact(doc,['schema','package','review_id','editions','draft'],'customer review');
    if(doc.schema!==DOCUMENT)throw new Error('Open a complete original customer review document');
    if(files)await validatePackage(doc.package);else reportShape(doc.package);
    id(doc.review_id,'customer review identity');
    if(!Array.isArray(doc.editions)||doc.editions.length>1000)throw new Error('Retain the complete review edition chain, up to 1000 editions');
    let previous=null;
    for(let index=0;index<doc.editions.length;index++){
      const edition=doc.editions[index];
      exact(edition,['schema','id','package_id','review_id','revision','parent_id','created_at','reviewer','notes','decisions'],'review edition');
      if(edition.schema!=='tjl.economic-client-review-edition.v1'||edition.package_id!==doc.package.id||
        edition.review_id!==doc.review_id||edition.revision!==index+1||edition.parent_id!==previous)
        throw new Error('The saved review revision chain changed');
      string(edition.created_at,'edition time',100,false);digest(edition.id,'review edition identity');
      draftShape(doc.package,{reviewer:edition.reviewer,notes:edition.notes,decisions:edition.decisions});
      const unsigned=copy(edition);delete unsigned.id;if(await hash(unsigned)!==edition.id)throw new Error('A retained customer review edition changed');
      previous=edition.id;
    }
    draftShape(doc.package,doc.draft);
    return doc;
  }
  async function checkpoint(doc,draft,at){
    await validateDocument(doc,{files:false});
    const normalized=draftShape(doc.package,draft),last=doc.editions.at(-1);
    const result=copy(doc);result.draft=normalized;
    if(last&&canonical(normalized)===canonical({reviewer:last.reviewer,notes:last.notes,decisions:last.decisions}))return result;
    if(result.editions.length>=1000)throw new Error('This complete review has reached 1000 saved editions');
    string(at,'edition timestamp',100,false);
    const edition={schema:'tjl.economic-client-review-edition.v1',package_id:doc.package.id,review_id:doc.review_id,
      revision:doc.editions.length+1,parent_id:last?.id??null,created_at:at,...normalized};
    edition.id=await hash(edition);result.editions.push(edition);return result;
  }
  function summary(doc){
    const last=doc.editions.at(-1),counts={approved:0,question:0,change_requested:0,proposals:0};
    for(const row of Object.values(last?.decisions||{})){counts[row.status]++;if(row.proposal)counts.proposals++;}
    return {package_id:doc.package.id,project_id:doc.package.project_id,briefing_id:doc.package.briefing_id,
      review_id:doc.review_id,recipient:doc.package.recipient,label:doc.package.label,
      revision:last?.revision??0,edition_id:last?.id??null,reviewer:last?.reviewer??doc.draft.reviewer,
      created_at:last?.created_at??doc.package.created_at,counts,
      unsaved:!last||canonical(doc.draft)!==canonical({reviewer:last.reviewer,notes:last.notes,decisions:last.decisions})};
  }
  function preview(doc){
    const last=doc.editions.at(-1);
    if(!last)throw new Error('Save a complete customer review edition before returning it');
    return {...summary(doc),notes:last.notes,decisions:Object.entries(last.decisions).map(([targetId,decision])=>({
      ...target(doc.package,targetId),decision:copy(decision)}))};
  }
  return Object.freeze({canonical,targets,target,validatePackage,validateDocument,checkpoint,summary,preview});
}
