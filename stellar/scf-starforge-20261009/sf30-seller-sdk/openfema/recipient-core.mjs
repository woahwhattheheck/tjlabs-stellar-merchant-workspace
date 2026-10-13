// MIT. Complete recipient review over the existing native OpenFEMA delivery.
// The factory is deliberately self-contained: the exact same code is embedded in
// the delivery's offline HTML and imported by its Node/browser receiving course.
export function createRecipientCore(options={}){
const SCHEMA='stellar-forge.openfema-recipient-project.v1',ENVELOPE='stellar-forge.openfema-recipient-export.v1';
const MAPPING_SCHEMA='stellar-forge.openfema-delivery-mapping.v1',DELIVERY_SCHEMA='stellar-forge.openfema-project-delivery.v1';
const LIMITS=Object.freeze({csvBytes:16*1024*1024,rows:250000,projectBytes:128*1024*1024,columns:200});
const REVIEW_STATES=['open','reviewed','follow_up','resolved'];
const REVIEW_FIELDS=['status','disposition','priority','owner','dueDate','note'];
const reviewDefaults={status:'open',disposition:'include',priority:'normal',owner:'',dueDate:'',note:'',applicantSourceId:''};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const copy=o=>JSON.parse(JSON.stringify(o));
const scalar=o=>o===null||o===undefined?'':String(o);
const fault=(code,message)=>Object.assign(new Error(message),{code});
const checked=(ok,message,code='OPENFEMA_RECIPIENT')=>{if(!ok)throw fault(code,message);};
function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
function string(value,label,max=4000,{empty=false}={}){if(typeof value!=='string'||(!empty&&!value.trim())||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw fault('OPENFEMA_INPUT','Invalid '+label+'.');return value.trim();}
const calendarDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00.000Z'))&&new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)===value;

function utf8(value){const out=[];for(const c of value){let p=c.codePointAt(0);if(p>=0xd800&&p<=0xdfff)p=0xfffd;if(p<=127)out.push(p);else if(p<=2047)out.push(192|(p>>6),128|(p&63));else if(p<=65535)out.push(224|(p>>12),128|((p>>6)&63),128|(p&63));else out.push(240|(p>>18),128|((p>>12)&63),128|((p>>6)&63),128|(p&63));}return out;}
const rol=(x,n)=>(x<<n)|(x>>>(32-n));const ror=(x,n)=>(x>>>n)|(x<<(32-n));
const hex=words=>words.map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');
function padded(value){const b=utf8(value),bits=b.length*8;b.push(128);while(b.length%64!==56)b.push(0);const hi=Math.floor(bits/4294967296),lo=bits>>>0;for(const x of [hi,lo])b.push((x>>>24)&255,(x>>>16)&255,(x>>>8)&255,x&255);return b;}
function portableSha256(value){const b=padded(value),h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
for(let o=0;o<b.length;o+=64){const w=[];for(let i=0;i<16;i++){const j=o+i*4;w[i]=(b[j]<<24)|(b[j+1]<<16)|(b[j+2]<<8)|b[j+3];}for(let i=16;i<64;i++){const s0=ror(w[i-15],7)^ror(w[i-15],18)^(w[i-15]>>>3),s1=ror(w[i-2],17)^ror(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0;}
let [a,c,d,e,f,g,j,l]=h;for(let i=0;i<64;i++){const s1=ror(f,6)^ror(f,11)^ror(f,25),ch=(f&g)^(~f&j),t1=(l+s1+ch+k[i]+w[i])|0,s0=ror(a,2)^ror(a,13)^ror(a,22),maj=(a&c)^(a&d)^(c&d),t2=(s0+maj)|0;l=j;j=g;g=f;f=(e+t1)|0;e=d;d=c;c=a;a=(t1+t2)|0;}const v=[a,c,d,e,f,g,j,l];for(let i=0;i<8;i++)h[i]=(h[i]+v[i])|0;}return hex(h);}

const DELIVERY_FIELDS=Object.freeze({
  id:{kind:'text',label:'OpenFEMA GM project ID',meaning:'PublicAssistanceFundedProjectsDetails v2 gmProjectId; the original project identity.'},
  disasterNumber:{kind:'text',label:'Disaster number',meaning:'The exact disaster identity retained with this project.'},
  applicantId:{kind:'text',label:'Applicant ID',meaning:'Join within the same disaster; not the applicant table UUID.'},
  applicantName:{kind:'text',label:'Reviewed applicant name'},
  applicantMatch:{kind:'text',label:'Applicant join state'},
  state:{kind:'text',label:'State abbreviation'},county:{kind:'text',label:'County as published'},
  projectNumber:{kind:'text',label:'Project worksheet number'},projectTitle:{kind:'text',label:'Project title'},
  workCategory:{kind:'text',label:'Category of work'},categoryDescription:{kind:'text',label:'Category description'},
  projectSize:{kind:'text',label:'Project size'},projectStatus:{kind:'text',label:'Published project status'},
  processStep:{kind:'text',label:'Published process step'},declarationDate:{kind:'text',label:'Declaration date'},
  firstObligationDate:{kind:'text',label:'First obligation date'},fundedDate:{kind:'text',label:'Last obligation date'},
  incidentType:{kind:'text',label:'Incident type'},
  'projectCost.decimal':{kind:'usd',label:'Project cost (USD)',meaning:'Project cost excluding administrative costs; a separate measure.'},
  'federalObligated.decimal':{kind:'usd',label:'Federal obligations (USD)',meaning:'Federal project funding obligated to the recipient; a separate measure.'},
  'totalObligated.decimal':{kind:'usd',label:'Total obligations (USD)',meaning:'Total obligations including administrative amounts; a separate measure.'},
  'mitigation.decimal':{kind:'usd',label:'Mitigation (USD)',meaning:'Published mitigation amount, preserving negative adjustments; a separate measure.'},
  included:{kind:'boolean',label:'Included in portfolio totals'},conflict:{kind:'boolean',label:'Conflicting source identity'},
  sourcePageSha256:{kind:'text',label:'Original page SHA256'},sourceRow:{kind:'integer',label:'Original zero-based source row'},
  sourceUrl:{kind:'text',label:'Original source request URL'},
  'review.status':{kind:'text',label:'Analyst review status',owner:'review'},
  'review.disposition':{kind:'text',label:'Portfolio include/exclude decision',owner:'review'},
  'review.priority':{kind:'text',label:'Analyst priority',owner:'review'},
  'review.owner':{kind:'text',label:'Assigned analyst',owner:'review'},
  'review.dueDate':{kind:'text',label:'Analyst due date',owner:'review'},
  'review.note':{kind:'text',label:'Analyst working note',owner:'review'}
});
const stagingColumns=[
 ['gm_project_id','id'],['disaster_number','disasterNumber'],['applicant_id','applicantId'],
 ['applicant_name','applicantName'],['applicant_join','applicantMatch'],['state','state'],['county','county'],
 ['project_number','projectNumber'],['project_title','projectTitle'],['work_category','workCategory'],
 ['project_size','projectSize'],['published_status','projectStatus'],['process_step','processStep'],
 ['declaration_date','declarationDate'],['first_obligation_date','firstObligationDate'],['last_obligation_date','fundedDate'],
 ['project_cost_usd','projectCost.decimal'],['federal_obligated_usd','federalObligated.decimal'],
 ['total_obligated_usd','totalObligated.decimal'],['mitigation_usd','mitigation.decimal'],
 ['included_in_totals','included'],['source_conflict','conflict'],
 ['review_status','review.status'],['review_disposition','review.disposition'],['review_priority','review.priority'],
 ['review_owner','review.owner'],['review_due_date','review.dueDate'],['review_note','review.note'],
 ['source_page_sha256','sourcePageSha256'],['source_row','sourceRow'],['source_url','sourceUrl']
];
function columnName(value){const result=string(value,'destination column',200);checked(result===value,'Keep exact destination column names without surrounding whitespace.');checked(!['__proto__','prototype','constructor'].includes(result),'Choose a plain destination column name.');return result;}
function validateMapping(input){
  checked(plain(input)&&input.schema===MAPPING_SCHEMA,'Choose an OpenFEMA customer delivery mapping.');
  checked(Object.keys(input).every(key=>['schema','name','target','columns','customerKeyColumn','note'].includes(key)),'Unknown delivery mapping field.');
  const target=input.target;
  checked(plain(target)&&['staging','customer_supplied'].includes(target.kind),'Identify a neutral staging schema or the actual customer-supplied schema.');
  checked(Object.keys(target).every(key=>['name','kind','reference','evidence'].includes(key)),'Unknown destination schema field.');
  checked(plain(target.evidence)&&typeof target.evidence.content==='string'&&target.evidence.content.length>0&&utf8(target.evidence.content).length<=2*1024*1024,'Retain the complete destination schema/header specification within 2 MiB.');
  checked(Object.keys(target.evidence).every(key=>['name','content'].includes(key)),'Keep the original destination schema name and complete text.');
  checked(Array.isArray(input.columns)&&input.columns.length>=2&&input.columns.length<=200,'Map between 2 and 200 destination columns.');
  const names=new Set(),sources=new Set();
  const columns=input.columns.map(value=>{
    checked(plain(value)&&Object.keys(value).every(key=>['column','source','required'].includes(key)),'Use column, source and required for each mapping.');
    const column=columnName(value.column),source=value.source??null;
    checked(!names.has(column),'Destination column appears twice: '+column);names.add(column);
    checked(source===null||own(DELIVERY_FIELDS,source),'Choose a declared native source or analyst field for '+column+'.');
    checked(typeof value.required==='boolean','Choose required true or false for '+column+'.');
    if(source){
      checked(!(DELIVERY_FIELDS[source].owner==='review'&&sources.has(source)),'Map each writable analyst field to one destination column: '+source+'.','OPENFEMA_DELIVERY_REVIEW_ALIAS');
      sources.add(source);
    }
    return {column,source,required:value.required};
  });
  for(const identity of ['id','disasterNumber']){
    const selected=columns.filter(value=>value.source===identity);
    checked(selected.length===1&&selected[0].required,'Map exactly one required '+identity+' column; receiving uses both original identities.');
  }
  let customerKeyColumn=input.customerKeyColumn??null;
  if(customerKeyColumn!==null){customerKeyColumn=columnName(customerKeyColumn);checked(names.has(customerKeyColumn),'The customer key column must be in the reviewed mapping.');}
  return {schema:MAPPING_SCHEMA,name:string(input.name,'mapping name',160),
    target:{name:string(target.name,'destination name',200),kind:target.kind,reference:string(target.reference,'destination schema reference',2000),
      evidence:{name:string(target.evidence.name,'destination schema filename',200),content:target.evidence.content}},
    columns,customerKeyColumn,note:string(input.note??'','mapping note',12000,{empty:true})};
}
function parseCustomerCsv(content,{maxBytes=16*1024*1024,maxRows=250000}={}){
  checked(typeof content==='string','Receive the complete UTF-8 customer CSV.');
  checked(utf8(content).length<=maxBytes,'Receive the complete UTF-8 customer CSV within 16 MiB.','OPENFEMA_RECIPIENT_CAPACITY');
  let text=content.charCodeAt(0)===0xfeff?content.slice(1):content;
  checked(!text.includes('\0'),'Customer CSV contains a NUL byte.');
  const records=[];let row=[],cell='',quoted=false,closed=false,started=false;
  const addCell=()=>{row.push(cell);cell='';closed=false;started=false;checked(row.length<=2000,'Customer CSV has too many columns.','OPENFEMA_RECIPIENT_CAPACITY');};
  const addRow=()=>{addCell();records.push(row);row=[];checked(records.length<=maxRows+1,'Customer CSV has too many rows.','OPENFEMA_RECIPIENT_CAPACITY');};
  for(let i=0;i<text.length;i++){
    const character=text[i];
    if(quoted){
      if(character==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}
      else cell+=character;
      continue;
    }
    if(closed&&character!==','&&character!=='\r'&&character!=='\n')throw fault('OPENFEMA_CUSTOMER_CSV','Unexpected characters after a quoted CSV cell.');
    if(character==='"'){checked(!started&&cell==='','A quote must begin a complete CSV cell.');quoted=true;started=true;continue;}
    if(character===','){addCell();continue;}
    if(character==='\r'||character==='\n'){if(character==='\r'&&text[i+1]==='\n')i++;addRow();continue;}
    cell+=character;started=true;
  }
  checked(!quoted,'The customer CSV ends inside a quoted value.');
  if(started||closed||cell.length||row.length)addRow();
  checked(records.length>0,'Receive a CSV with its complete header row.');
  const columns=records.shift().map(columnName);
  checked(new Set(columns).size===columns.length,'Customer CSV contains duplicate column names.');
  for(const [index,values]of records.entries())checked(values.length===columns.length,'Customer row '+(index+2)+' has a different number of cells from its header.');
  return {columns,rows:records.map((values,index)=>({rowNumber:index+2,values:Object.fromEntries(columns.map((column,i)=>[column,values[i]]))})),
    bytes:utf8(content).length,sha256:hash(content)};
}
function validateAnnotation(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['subject','note','status','disposition','priority','applicantSourceId','owner','dueDate'].includes(k)))throw fault('OPENFEMA_REVIEW','Use the declared analyst decision fields.');
  const subject=string(input.subject,'review subject',300),note=string(input.note??'','review note',12000,{empty:true}),status=input.status??'open',disposition=input.disposition??'include',priority=input.priority??'normal';
  if(!REVIEW_STATES.includes(status)||!['include','exclude'].includes(disposition)||!['low','normal','high'].includes(priority))throw fault('OPENFEMA_REVIEW','Choose a supported review state, disposition and priority.');
  if((status!=='open'||disposition==='exclude'||input.applicantSourceId)&&!note.trim())throw fault('OPENFEMA_REVIEW_NOTE','Explain this review decision.');
  const applicantSourceId=input.applicantSourceId??'';if(typeof applicantSourceId!=='string'||applicantSourceId.length>200)throw fault('OPENFEMA_REVIEW_SOURCE','Choose an original applicant source record.');
  if(input.dueDate&&!calendarDate(input.dueDate))throw fault('OPENFEMA_DATE','Use a valid ISO review date.');
  return {subject,note,status,disposition,priority,applicantSourceId,owner:string(input.owner??'','review owner',200,{empty:true}),dueDate:input.dueDate?string(input.dueDate,'review due date',10):''};
}
function csv(columns,rows,{spreadsheet=false}={}){
  const cell=v=>{let s=v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);if(spreadsheet&&/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
  return columns.map(cell).join(',')+'\r\n'+rows.map(r=>columns.map(k=>cell(r[k])).join(',')).join('\r\n')+(rows.length?'\r\n':'');
}

const hash=value=>{
  const text=typeof value==='string'?value:stable(value);
  const result=options.sha256?options.sha256(text):portableSha256(text);
  checked(typeof result==='string'&&/^[a-f0-9]{64}$/.test(result),'The synchronous SHA256 provider must return the complete lowercase digest.');
  return result;
};
const same=(a,b)=>stable(a)===stable(b);
const file=(name,content)=>({name,content,bytes:utf8(content).length,sha256:hash(content)});
const editable=column=>column.source===null||column.source.startsWith('review.');
const textMeta=(value,label,max,{empty=false}={})=>{string(value,label,max,{empty});return value;};
const timestamp=value=>{const at=value??new Date().toISOString();checked(typeof at==='string'&&Number.isFinite(Date.parse(at)),'Use a complete recorded edit time.');return at;};
const keyOf=(disaster,id)=>JSON.stringify([scalar(disaster),scalar(id)]);
const verifiedIssued=new WeakMap();
function freezeTree(value,seen=new WeakSet()){if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);for(const child of Object.values(value))freezeTree(child,seen);if(!Object.isFrozen(value))Object.freeze(value);}return value;}
const workingCopy=project=>({...project,issued:project.issued,values:copy(project.values),editions:copy(project.editions),history:copy(project.history)});
function ordinaryFile(input,label){
  checked(plain(input)&&typeof input.content==='string','Keep the complete '+label+' name and text.');
  string(input.name,label+' name',240);
  return {name:input.name,content:input.content};
}
function verifyIssued(issued){
  if(plain(issued)&&verifiedIssued.has(issued))return verifiedIssued.get(issued);
  checked(plain(issued)&&typeof issued.manifestText==='string'&&plain(issued.manifest)&&plain(issued.hashes),'Keep the complete issued delivery and its original text.');
  let parsed;try{parsed=JSON.parse(issued.manifestText);}catch{throw fault('OPENFEMA_RECIPIENT_MANIFEST','The issued manifest must be complete JSON.');}
  checked(same(parsed,issued.manifest)&&hash(issued.manifestText)===issued.hashes.manifest,'The full issued manifest differs from its original retained identity.');
  const m=issued.manifest;
  checked(m.schema===DELIVERY_SCHEMA&&Array.isArray(m.rows)&&plain(m.targetFile),'Choose the complete native project delivery.');
  checked(m.rows.length<=LIMITS.rows,'The complete delivery exceeds the recipient row limit.','OPENFEMA_RECIPIENT_CAPACITY');
  const mapping=validateMapping(m.mapping);
  checked(same(mapping,m.mapping)&&hash(mapping)===m.mappingSha256&&hash(mapping.target.evidence.content)===m.schemaSha256,'Keep the exact reviewed native mapping and destination schema.');
  checked(plain(m.mappingReview)&&m.mappingReview.mappingSha256===m.mappingSha256&&typeof m.mappingReview.reviewer==='string'&&m.mappingReview.reviewer.trim()&&typeof m.mappingReview.note==='string'&&m.mappingReview.note.trim(),'Keep the original explicit mapping review.');
  checked(plain(m.version)&&typeof m.version.id==='string'&&m.version.editionId===m.editionId,'Keep the original native portfolio version and source edition.');
  const parsedCsv=parseCustomerCsv(issued.targetCsv);
  const columns=mapping.columns.map(c=>c.column);
  checked(same(parsedCsv.columns,columns)&&same(m.targetFile.columns,columns),'The complete target CSV header must match the reviewed mapping exactly.');
  checked(parsedCsv.bytes===m.targetFile.bytes&&parsedCsv.sha256===m.targetFile.sha256&&parsedCsv.sha256===issued.hashes.targetCsv,'The target CSV differs from the full issued bytes.');
  checked(parsedCsv.rows.length===m.rows.length&&m.summary?.rows===m.rows.length,'Keep every issued project row, including excluded projects.');
  const keys=new Set(),idColumn=mapping.columns.find(c=>c.source==='id').column,disasterColumn=mapping.columns.find(c=>c.source==='disasterNumber').column;
  for(let i=0;i<m.rows.length;i++){
    const row=m.rows[i],observed=parsedCsv.rows[i].values;
    checked(plain(row)&&typeof row.subject==='string'&&plain(row.values),'Keep each complete original project identity and mapped values.');
    checked(row.key===keyOf(row.disasterNumber,row.projectId)&&!keys.has(row.key),'Keep unique original disaster/project row identities.');
    keys.add(row.key);
    checked(same(Object.keys(row.values).sort(),[...columns].sort())&&hash(row.values)===row.valuesSha256,'An issued row differs from its full original values.');
    for(const col of columns)checked(scalar(row.values[col])===observed[col],'Keep the exact issued source cell at row '+(i+2)+', column '+col+'.');
    checked(observed[idColumn]===scalar(row.projectId)&&observed[disasterColumn]===scalar(row.disasterNumber),'Keep both original parent identities in the target CSV.');
  }
  if(issued.originalCustomer!==null){
    const original=ordinaryFile(issued.originalCustomer,'original customer file'),p=parseCustomerCsv(original.content);
    checked(p.sha256===issued.hashes.originalCustomer,'Keep the exact complete original customer file, including unlinked rows.');
    if(m.customerBase?.file){
      const prior=m.customerBase.file;
      checked(p.sha256===prior.sha256&&p.bytes===prior.bytes,'The original customer file does not match the delivery customer baseline.');
    }
  }else{
    checked(issued.hashes.originalCustomer===null,'Keep the original customer file identity.');
    checked(!m.customerBase,'This delivery requires its complete original customer file.');
  }
  const context={m,mapping,columns,parsedCsv};freezeTree(issued);freezeTree(context);verifiedIssued.set(issued,context);return context;
}
function checkValues(values,context,label){
  checked(plain(values)&&Object.keys(values).length===context.m.rows.length,'Keep all original rows in '+label+'.');
  for(const row of context.m.rows){
    checked(own(values,row.key)&&plain(values[row.key]),'Keep every original project in '+label+'.');
    const current=values[row.key];
    checked(same(Object.keys(current).sort(),[...context.columns].sort()),'Keep every mapped column in '+label+'.');
    for(const col of context.mapping.columns){
      checked(typeof current[col.column]==='string','Retain complete cell text in '+label+'.');
      if(!editable(col))checked(current[col.column]===scalar(row.values[col.column]),'Published source and identity cells are read-only.');
    }
  }
}
function validate(project){
  checked(plain(project)&&project.schema===SCHEMA,'Choose a complete OpenFEMA recipient project.');
  checked(typeof project.id==='string'&&/^recipient-[a-f0-9]{32}$/.test(project.id),'Keep the original recipient project identity.');
  textMeta(project.deliveryId,'original delivery ID',300);textMeta(project.name,'recipient project name',200);
  checked(Number.isSafeInteger(project.revision)&&project.revision>=0,'Keep the complete recipient revision.');
  timestamp(project.createdAt);timestamp(project.updatedAt);
  const ctx=verifyIssued(project.issued);
  checked(project.id==='recipient-'+hash(project.deliveryId+'\0'+project.issued.hashes.manifest).slice(0,32),'The recipient identity must retain its original native delivery.');
  checkValues(project.values,ctx,'the current working edition');
  checked(Array.isArray(project.editions)&&Array.isArray(project.history),'Keep the complete saved editions and edit history.');
  const ids=new Set();
  for(const edition of project.editions){
    checked(plain(edition)&&typeof edition.id==='string'&&edition.id&&!ids.has(edition.id),'Keep distinct original saved editions.');
    ids.add(edition.id);textMeta(edition.name,'edition name',200);textMeta(edition.actor,'edition reviewer',200);textMeta(edition.note??'','edition note',12000,{empty:true});timestamp(edition.savedAt);
    checked(Number.isSafeInteger(edition.revision)&&edition.revision>=0&&edition.revision<=project.revision,'Keep the saved edition revision.');
    checkValues(edition.values,ctx,'saved edition '+edition.name);
  }
  checked(project.history.length===project.revision,'Keep the complete sequential edit history.');
  for(let i=0;i<project.history.length;i++){
    const event=project.history[i];
    checked(plain(event)&&event.revision===i+1&&['cells','save-edition','restore-edition'].includes(event.kind),'Keep each original revision event.');
    textMeta(event.actor,'edit reviewer',200);textMeta(event.note??'','edit note',12000,{empty:true});timestamp(event.at);
    checked(Array.isArray(event.changes),'Keep complete before and after cell changes.');
    const seen=new Set();
    for(const change of event.changes){
      checked(plain(change)&&own(project.values,change.key)&&ctx.mapping.columns.some(c=>c.column===change.column&&editable(c))&&typeof change.before==='string'&&typeof change.after==='string','Keep original editable cell changes.');
      const k=JSON.stringify([change.key,change.column]);checked(!seen.has(k),'Keep one change per cell in each revision.');seen.add(k);
    }
    if(event.editionId)checked(ids.has(event.editionId),'Retain each referenced saved edition.');
    if(event.preservedEditionId)checked(ids.has(event.preservedEditionId),'Retain the saved edition preceding restore.');
  }
  // Replay the complete edit record to detect lost revisions or detached histories.
  const replay=Object.fromEntries(ctx.m.rows.map(r=>[r.key,Object.fromEntries(ctx.columns.map(c=>[c,scalar(r.values[c])]))]));
  const checkEditions=revision=>{for(const edition of project.editions)if(edition.revision===revision)checked(same(edition.values,replay),'A saved edition differs from its complete recorded revision.');};
  checkEditions(0);
  for(const event of project.history){
    for(const change of event.changes){
      checked(replay[change.key][change.column]===change.before,'An edit lost its preceding cell value.');
      replay[change.key][change.column]=change.after;
    }
    checkEditions(event.revision);
  }
  checked(same(replay,project.values),'Current cells must match the complete retained edit history.');
  checked(utf8(JSON.stringify({schema:ENVELOPE,sha256:'0'.repeat(64),project})).length<=LIMITS.projectBytes,'Keep the current project; this complete edition exceeds the 128 MiB receiving limit.','OPENFEMA_RECIPIENT_CAPACITY');
  return project;
}
function create({deliveryId,manifest,targetCsv,originalCustomer=null,name='Recipient review',createdAt}={}){
  checked(typeof targetCsv==='string','Keep the complete issued target CSV text.');
  const manifestText=typeof manifest==='string'?manifest:JSON.stringify(manifest,null,2)+'\n';
  let original;try{original=JSON.parse(manifestText);}catch{throw fault('OPENFEMA_RECIPIENT_MANIFEST','Choose the complete issued delivery JSON.');}
  const customer=originalCustomer===null?null:ordinaryFile(originalCustomer,'original customer file');
  const issued={manifest:original,manifestText,targetCsv,originalCustomer:customer,hashes:{manifest:hash(manifestText),targetCsv:hash(targetCsv),originalCustomer:customer?hash(customer.content):null}};
  const context=verifyIssued(issued),at=timestamp(createdAt);
  const project={schema:SCHEMA,id:'recipient-'+hash(deliveryId+'\0'+issued.hashes.manifest).slice(0,32),deliveryId,
    name,revision:0,createdAt:at,updatedAt:at,issued,
    values:Object.fromEntries(context.m.rows.map(r=>[r.key,Object.fromEntries(context.columns.map(c=>[c,scalar(r.values[c])]))])),
    editions:[],history:[]};
  return validate(project);
}
function begin(project,meta){
  validate(project);checked(plain(meta)&&meta.expectedRevision===project.revision,'The recipient revision changed; preserve this copy and review the current one.','OPENFEMA_RECIPIENT_REVISION');
  return {actor:textMeta(meta.actor,'reviewer',200),note:textMeta(meta.note??'','edit note',12000,{empty:true}),at:timestamp(meta.at)};
}
function changesBetween(project,before,after){
  const changes=[];
  for(const row of project.issued.manifest.rows)for(const col of project.issued.manifest.mapping.columns){
    if(before[row.key][col.column]!==after[row.key][col.column])changes.push({key:row.key,column:col.column,before:before[row.key][col.column],after:after[row.key][col.column]});
  }
  return changes;
}
function finish(original,candidate,event,meta){
  candidate.revision=original.revision+1;candidate.updatedAt=meta.at;
  candidate.history.push({revision:candidate.revision,kind:event.kind,actor:meta.actor,note:meta.note,at:meta.at,changes:event.changes??[],...event});
  return validate(candidate);
}
function updateCells(project,changes,meta={}){
  const author=begin(project,meta);checked(Array.isArray(changes)&&changes.length>0,'Choose complete cell changes.');
  const candidate=workingCopy(project),columns=project.issued.manifest.mapping.columns,seen=new Set();
  for(const change of changes){
    checked(plain(change)&&Object.keys(change).every(k=>['key','column','value'].includes(k))&&own(candidate.values,change.key),'Choose a project from this full original delivery.');
    const column=columns.find(c=>c.column===change.column);
    checked(column&&editable(column),'Only mapped analyst and customer-owned columns are editable.');
    checked(typeof change.value==='string','Keep the complete typed cell value.');
    const identity=JSON.stringify([change.key,change.column]);checked(!seen.has(identity),'Choose each cell once in an update.');seen.add(identity);
    candidate.values[change.key][change.column]=change.value;
  }
  const actual=changesBetween(project,project.values,candidate.values);
  if(!actual.length)return workingCopy(project);
  return finish(project,candidate,{kind:'cells',changes:actual},author);
}
function newEditionId(project){
  const ids=new Set(project.editions.map(e=>e.id));let n=1;while(ids.has('edition:'+n))n++;return 'edition:'+n;
}
function saveEdition(project,meta={}){
  const author=begin(project,meta),candidate=workingCopy(project),id=newEditionId(project);
  candidate.editions.push({id,name:textMeta(meta.name,'edition name',200),actor:author.actor,note:author.note,savedAt:author.at,revision:project.revision,values:copy(project.values)});
  return finish(project,candidate,{kind:'save-edition',editionId:id},author);
}
function restoreEdition(project,editionId,meta={}){
  const author=begin(project,meta),selected=project.editions.find(e=>e.id===editionId);
  checked(selected,'Choose a retained full saved edition.');
  const candidate=workingCopy(project),preservedEditionId=newEditionId(project);
  candidate.editions.push({id:preservedEditionId,name:('Before restoring '+selected.name).slice(0,200),actor:author.actor,note:author.note,savedAt:author.at,revision:project.revision,values:copy(project.values)});
  candidate.values=copy(selected.values);
  return finish(project,candidate,{kind:'restore-edition',editionId,preservedEditionId,changes:changesBetween(project,project.values,candidate.values)},author);
}
function diff(project){
  const changed=[];
  for(const row of project.issued.manifest.rows)for(const col of project.issued.manifest.mapping.columns){
    const before=scalar(row.values[col.column]),after=project.values[row.key][col.column];
    if(before!==after)changed.push({key:row.key,column:col.column,source:col.source,before,after});
  }
  return changed;
}
function reviewIssues(project){
  const issues=[];
  for(const row of project.issued.manifest.rows){
    const proposed={...reviewDefaults,...Object.fromEntries(Object.keys(reviewDefaults).filter(k=>own(row.annotation||{},k)).map(k=>[k,row.annotation[k]])),subject:row.subject};
    let changed=false;
    for(const col of project.issued.manifest.mapping.columns){
      if(col.source?.startsWith('review.')){
        if(project.values[row.key][col.column]!==scalar(row.values[col.column])){proposed[col.source.slice(7)]=project.values[row.key][col.column];changed=true;}
      }
    }
    if(changed)try{validateAnnotation(proposed);}catch(error){issues.push({key:row.key,subject:row.subject,code:error.code,message:error.message});}
  }
  return issues;
}
function returnedCsv(project){
  validate(project);
  const issues=reviewIssues(project);if(issues.length)throw Object.assign(fault('OPENFEMA_RECIPIENT_REVIEW','Complete the marked analyst decisions before exporting the native return CSV.'),{issues});
  const columns=project.issued.manifest.mapping.columns.map(c=>c.column);
  const content=csv(columns,project.issued.manifest.rows.map(r=>project.values[r.key]));
  checked(utf8(content).length<=LIMITS.csvBytes,'The complete return exceeds the native 16 MiB CSV limit; preserve the full recipient project.','OPENFEMA_RECIPIENT_CAPACITY');
  parseCustomerCsv(content);
  return content;
}
function originals(project){
  validate(project);
  const result=[{name:'delivery.json',content:project.issued.manifestText},
    {name:project.issued.manifest.targetFile.name||'projects-target.csv',content:project.issued.targetCsv},
    {name:'reviewed-mapping.json',content:JSON.stringify(project.issued.manifest.mapping,null,2)+'\n'},
    {name:project.issued.manifest.mapping.target.evidence.name,content:project.issued.manifest.mapping.target.evidence.content}];
  if(project.issued.originalCustomer)result.push(copy(project.issued.originalCustomer));
  return result;
}
function rows(project,{query='',changedOnly=false,offset=0,limit=50}={}){
  checked(typeof query==='string'&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=1000,'Choose a valid recipient row page.');
  const needle=query.toLocaleLowerCase(),selected=[];
  for(const row of project.issued.manifest.rows){
    const values=project.values[row.key],changed=Object.keys(values).some(k=>values[k]!==scalar(row.values[k]));
    if(changedOnly&&!changed)continue;
    if(needle&&!Object.values(values).some(v=>v.toLocaleLowerCase().includes(needle))&&!row.key.toLocaleLowerCase().includes(needle))continue;
    selected.push({...copy(row),values:copy(values),issuedValues:Object.fromEntries(Object.entries(row.values).map(([k,v])=>[k,scalar(v)])),changed});
  }
  return {total:selected.length,offset,limit,rows:selected.slice(offset,offset+limit)};
}
function summary(project){
  const changes=diff(project);return {rows:project.issued.manifest.rows.length,changedRows:new Set(changes.map(c=>c.key)).size,
    changedCells:changes.length,editions:project.editions.length,revision:project.revision,reviewIssues:reviewIssues(project).length,
    deliveryId:project.deliveryId,editionId:project.issued.manifest.editionId,versionId:project.issued.manifest.version.id,
    originalCustomerRows:project.issued.originalCustomer?parseCustomerCsv(project.issued.originalCustomer.content).rows.length:0};
}
function exportProject(project){
  validate(project);
  const text=JSON.stringify({schema:ENVELOPE,sha256:hash(project),project});
  checked(utf8(text).length<=LIMITS.projectBytes,'Preserve the current project; this full export exceeds the 128 MiB receiving limit.','OPENFEMA_RECIPIENT_CAPACITY');
  return text;
}
function importProject(text){
  checked(typeof text==='string','Receive the complete recipient project text.');
  checked(utf8(text).length<=LIMITS.projectBytes,'Receive the complete recipient project within 128 MiB.','OPENFEMA_RECIPIENT_CAPACITY');
  let envelope;try{envelope=JSON.parse(text);}catch{throw fault('OPENFEMA_RECIPIENT_EXPORT','The complete recipient project must be valid JSON.');}
  checked(plain(envelope)&&envelope.schema===ENVELOPE&&hash(envelope.project)===envelope.sha256,'Keep the complete recipient export and its exact content digest.');
  return validate(copy(envelope.project));
}
return Object.freeze({SCHEMA,ENVELOPE,LIMITS,REVIEW_STATES,REVIEW_FIELDS,create,validate,importProject,exportProject,updateCells,saveEdition,restoreEdition,returnedCsv,originals,rows,diff,summary,reviewIssues,parseCustomerCsv,validateAnnotation,editable,sha256:hash});
}
