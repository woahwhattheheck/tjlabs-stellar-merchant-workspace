// MIT. One original SF74 implementation selection and attributed recipient return.
// Dependency-free browser/Node model. The native case service establishes source authority.
const ImplementationReviewModel = (() => {
  const PACKET_SCHEMA='stellar-forge.implementation-review-packet.v1';
  const RETURN_SCHEMA='stellar-forge.implementation-review-return.v1';
  const MAX_REVIEW_BYTES=24*1024*1024;
  const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
  const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/,SHA=/^[a-f0-9]{64}$/;
  const outcomes=Object.freeze(['accepted','changes_required','not_run','not_applicable']);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const failure=(message,code='INVALID_IMPLEMENTATION_REVIEW',status=422)=>Object.assign(new Error(message),{code,status});
  function ensure(value,message){if(!value)throw failure(message);}
  function object(value,keys,label){
    ensure(value&&typeof value==='object'&&!Array.isArray(value)&&
      [Object.prototype,null].includes(Object.getPrototypeOf(value)),label+' must be an object.');
    ensure(Object.keys(value).every(key=>keys.includes(key)),'Unexpected '+label+' field.');return value;
  }
  function text(value,max,label,required=false){
    ensure(typeof value==='string'&&value.length<=max&&(!required||value.trim())&&
      dec.decode(enc.encode(value))===value&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      'Use valid '+label+' (up to '+max+' characters).');return value;
  }
  const id=(value,label='identifier')=>{ensure(typeof value==='string'&&ID.test(value),'Invalid '+label+'.');return value;};
  const sha=value=>{ensure(typeof value==='string'&&SHA.test(value),'Invalid SHA-256.');return value;};
  function list(value,maximum,label){ensure(Array.isArray(value)&&value.length<=maximum,'Invalid '+label+'.');return value;}
  function ids(value,maximum,label){list(value,maximum,label);value.forEach(x=>id(x,label));ensure(new Set(value).size===value.length,'Repeated '+label+'.');return value;}
  function utc(value,label='observation time'){
    ensure(typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)&&
      Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,19)===value.slice(0,19),
      'Use an actual UTC '+label+'.');return value;
  }
  function reference(value){
    text(value,4096,'original reference');
    if(/^[a-z][a-z0-9+.-]*:/i.test(value)){
      let url;try{url=new URL(value);}catch{throw failure('Use a valid original reference.');}
      ensure(['https:','http:','urn:'].includes(url.protocol)&&!url.username&&!url.password,
        'Reference must be HTTP(S), a URN, or a plain original record identifier.');
    }return value;
  }
  function canonical(value){
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  }
  async function digest(value){
    const bytes=value instanceof Uint8Array?value:enc.encode(canonical(value));
    return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),
      n=>n.toString(16).padStart(2,'0')).join('');
  }
  function serialize(value){const valueText=JSON.stringify(value,null,2)+'\n';
    ensure(enc.encode(valueText).length<=MAX_REVIEW_BYTES,'Review exceeds 24 MiB. Select fewer tasks or embedded materials.');return valueText;}
  function parse(value){if(typeof value==='string'){
    ensure(enc.encode(value).length<=MAX_REVIEW_BYTES,'Review exceeds 24 MiB.');
    try{return JSON.parse(value);}catch{throw failure('Review file is not valid JSON.');}
  }return clone(value);}
  function base64(bytes){
    let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return btoa(raw);
  }
  function decode(value){
    ensure(typeof value==='string'&&value.length<=4*Math.ceil(MAX_REVIEW_BYTES/3)&&value.length%4===0&&
      !/[^A-Za-z0-9+/=]/.test(value),'Invalid embedded file encoding.');
    let bytes;try{bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{throw failure('Invalid embedded file encoding.');}
    ensure(bytes.length<=MAX_REVIEW_BYTES&&base64(bytes)===value,'Embedded file encoding changed.');return bytes;
  }
  async function validatePacket(input){
    const value=parse(input);serialize(value);
    object(value,['schema','reviewId','createdAt','recipient','selection','source','files'],'review packet');
    ensure(value.schema===PACKET_SCHEMA,'Unsupported implementation review packet.');
    id(value.reviewId,'review identifier');utc(value.createdAt,'review preparation time');text(value.recipient,200,'intended recipient');
    object(value.selection,['taskIds','extraMaterialIds','embedMaterialIds'],'review selection');
    ids(value.selection.taskIds,2000,'selected task');ensure(value.selection.taskIds.length,'Select at least one saved task.');
    ids(value.selection.extraMaterialIds,2000,'additional material');ids(value.selection.embedMaterialIds,2000,'embedded material');
    const source=value.source;
    object(source,['case','implementationRevision','editionId','plan','tasks','materials','receiving','workorder'],'saved review source');
    object(source.case,['id','revision','workspaceSha256','supportSha256'],'original case');
    id(source.case.id,'case identifier');sha(source.case.revision);sha(source.case.workspaceSha256);
    if(source.case.supportSha256!==null)sha(source.case.supportSha256);
    ensure(Number.isSafeInteger(source.implementationRevision)&&source.implementationRevision>=0,'Invalid original implementation revision.');
    if(source.editionId!==null)id(source.editionId,'original workorder edition');
    ensure(source.plan&&typeof source.plan==='object'&&!Array.isArray(source.plan),'Original plan is missing.');
    list(source.tasks,2000,'original tasks');ensure(canonical(source.tasks.map(t=>t.id).sort())===canonical(value.selection.taskIds.slice().sort()),'Selected original tasks differ.');
    for(const task of source.tasks){id(task.id);text(task.title,2400,'task title',true);text(task.acceptance,64000,'acceptance definition');ids(task.dependencies,2000,'task dependency');}
    list(source.materials,2000,'original materials');ensure(new Set(source.materials.map(m=>m.id)).size===source.materials.length,'Repeated original material.');
    const materials=new Map(source.materials.map(m=>[m.id,m]));
    for(const material of source.materials){
      id(material.id);sha(material.sha256);text(material.name,240,'original filename',true);
      ensure(!/[/\\]/.test(material.name)&&!['.','..'].includes(material.name),'Use the original file basename.');
      ensure(Number.isSafeInteger(material.bytes)&&material.bytes>=0&&typeof material.embedded==='boolean','Invalid original file size or inclusion.');
      text(material.mediaType,160,'original media type',true);ids(material.taskIds,2000,'material task');
      if(material.editionId!==null)id(material.editionId,'material workorder');
      ensure(material.embedded===value.selection.embedMaterialIds.includes(material.id),'Embedded material selection changed.');
    }
    for(const key of ['extraMaterialIds','embedMaterialIds'])ensure(value.selection[key].every(x=>materials.has(x)),'Selected original material is missing.');
    list(source.receiving,4000,'original receiving history');
    ensure(new Set(source.receiving.map(r=>r.id)).size===source.receiving.length,'Repeated original receiving record.');
    for(const row of source.receiving){id(row.id);sha(row.subjectSha256);ids(row.taskIds,2000,'original received task');}
    ensure(source.workorder===null||source.workorder&&typeof source.workorder==='object'&&!Array.isArray(source.workorder),'Invalid original workorder.');
    list(value.files,2000,'embedded files');ensure(new Set(value.files.map(f=>f.sha256)).size===value.files.length,'Repeated embedded file.');
    const required=new Set(value.selection.embedMaterialIds.map(x=>materials.get(x).sha256));
    ensure(required.size===value.files.length,'Embedded file inventory differs from its selection.');
    for(const file of value.files){
      object(file,['sha256','bytes','data'],'embedded file');sha(file.sha256);
      const bytes=decode(file.data);
      ensure(required.has(file.sha256)&&file.bytes===bytes.length&&await digest(bytes)===file.sha256,'Original embedded file bytes changed.');
      ensure(source.materials.filter(m=>m.sha256===file.sha256).every(m=>m.bytes===file.bytes),'Original file length differs.');
    }
    return value;
  }
  function validateObservation(value,packet){
    object(value,['id','taskIds','materialIds','kind','outcome','observedAt','actor','reference','notes','supersedesId'],'returned observation');
    id(value.id,'observation identifier');ids(value.taskIds,2000,'observed task');
    ensure(value.taskIds.length&&value.taskIds.every(x=>packet.selection.taskIds.includes(x)),'Choose tasks in this original review.');
    ids(value.materialIds,2000,'inspected material');
    ensure(value.materialIds.every(x=>packet.source.materials.some(m=>m.id===x)),'Inspected file is not in this original review.');
    ensure(['technical','customer'].includes(value.kind)&&outcomes.includes(value.outcome),'Choose the actual receiving kind and outcome.');
    utc(value.observedAt);text(value.actor,200,'reviewer attribution',true);reference(value.reference);text(value.notes,64000,'receiving notes');
    ensure(!['accepted','changes_required'].includes(value.outcome)||value.notes.trim()||value.reference.trim()||value.materialIds.length,
      'Describe the actual result, identify an inspected original file, or retain an original receiving reference.');
    if(value.supersedesId!==null){
      id(value.supersedesId,'corrected observation');
      const prior=packet.source.receiving.find(r=>r.id===value.supersedesId);
      ensure(prior&&prior.kind===value.kind&&prior.editionId===packet.source.editionId&&
        canonical(prior.taskIds.slice().sort())===canonical(value.taskIds.slice().sort()),
        'A correction keeps the original receiving kind, workorder and exact tasks.');
      ensure(!packet.source.receiving.some(r=>r.supersedesId===prior.id),'The selected original observation already has a correction.');
    }
    return value;
  }
  async function newReturn(packet,{returnId,reviewer,createdAt}){
    const selected=await validatePacket(packet);id(returnId,'return identifier');text(reviewer,200,'return author',true);utc(createdAt,'return creation time');
    return {schema:RETURN_SCHEMA,returnId,createdAt,reviewer,packet:selected,packetSha256:await digest(selected),observations:[]};
  }
  async function validateReturn(input,{allowEmpty=false}={}){
    const value=parse(input);serialize(value);
    object(value,['schema','returnId','createdAt','reviewer','packet','packetSha256','observations'],'recipient return');
    ensure(value.schema===RETURN_SCHEMA,'Unsupported implementation review return.');id(value.returnId,'return identifier');
    utc(value.createdAt,'return creation time');text(value.reviewer,200,'return author',true);sha(value.packetSha256);
    value.packet=await validatePacket(value.packet);ensure(await digest(value.packet)===value.packetSha256,'The original review packet changed.');
    list(value.observations,1000,'recipient observations');ensure(allowEmpty||value.observations.length,'Record at least one actual observation before returning.');
    const seen=new Set(),corrections=new Set();
    for(const observation of value.observations){
      validateObservation(observation,value.packet);ensure(!seen.has(observation.id),'Repeated observation identifier.');seen.add(observation.id);
      if(observation.supersedesId){ensure(!corrections.has(observation.supersedesId),'One earlier observation cannot be corrected twice in this return.');corrections.add(observation.supersedesId);}
    }
    return value;
  }
  return Object.freeze({PACKET_SCHEMA,RETURN_SCHEMA,MAX_REVIEW_BYTES,outcomes,canonical,digest,serialize,decode,base64,validatePacket,validateObservation,newReturn,validateReturn});
})();
globalThis.ImplementationReviewModel=ImplementationReviewModel;
export const {PACKET_SCHEMA,RETURN_SCHEMA,MAX_REVIEW_BYTES,outcomes,canonical,digest,serialize,decode,base64,validatePacket,validateObservation,newReturn,validateReturn}=ImplementationReviewModel;
