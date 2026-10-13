// MIT. Reviewed, recoverable multi-invoice intake for the original merchant store.
import {createHash} from 'node:crypto';
import {mkdir,lstat,realpath,readdir,open} from 'node:fs/promises';
import {join} from 'node:path';
import {MerchantError} from './workspace.mjs';
import {parseJSONBytes} from './protocol.mjs';
import {readJSON,saveJSON} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{64}$/;
const PLAN='stellar-forge.merchant-invoice-intake.v1';
const MAX_SOURCE=1024*1024,MAX_ROWS=4000,MAX_INVOICES=500;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const copy=v=>structuredClone(v);
function need(v,code,status=400,details){if(!v)throw new MerchantError(code,status,details);}
function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
const hash=v=>createHash('sha256').update(v).digest('hex');
function text(v,code,max){need(typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)&&Buffer.from(v).toString('utf8')===v,code);return v;}
function operation(id){need(typeof id==='string'&&UUID.test(id),'INTAKE_OPERATION_INVALID');return id;}
function deriveInvoiceId(batch,key){const bytes=createHash('sha256').update('merchant-intake-v1\n'+batch+'\n'+key).digest();bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;const s=bytes.subarray(0,16).toString('hex');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);}
function csv(raw){
  const rows=[];let row=[],value='',quoted=false,closed=false,start=true;
  function field(){row.push(value);value='';closed=false;start=true;}
  function record(){field();if(row.some(v=>v!==''))rows.push(row);row=[];need(rows.length<=MAX_ROWS+1,'INTAKE_ROW_LIMIT');}
  raw=raw.replace(/^\ufeff/,'');
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(quoted){if(c==='"'){if(raw[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
    if(c===','){field();continue;}
    if(c==='\n'){record();continue;}
    if(c==='\r'){need(raw[i+1]==='\n','INTAKE_CSV_NEWLINE_INVALID');i++;record();continue;}
    need(!closed,'INTAKE_CSV_AFTER_QUOTE');
    if(c==='"'){need(start,'INTAKE_CSV_QUOTE_INVALID');quoted=true;start=false;}else{value+=c;start=false;}
  }
  need(!quoted,'INTAKE_CSV_UNCLOSED_QUOTE');
  if(value!==''||row.length||closed)record();
  const headers=rows.shift();need(headers?.length&&headers.every(h=>typeof h==='string'&&h.length>0&&h.length<=160)&&new Set(headers).size===headers.length,'INTAKE_CSV_HEADERS_INVALID');
  return rows.map((r,i)=>{need(r.length===headers.length,'INTAKE_CSV_ROW_WIDTH',400,{row:i+2});return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
}
export function inspectMerchantIntakeSource(source){
  need(object(source)&&['csv','json'].includes(source.format),'INTAKE_FORMAT_REQUIRED');
  text(source.name,'INTAKE_SOURCE_NAME_INVALID',180);
  need(typeof source.text==='string'&&Buffer.byteLength(source.text)<=MAX_SOURCE&&Buffer.from(source.text).toString('utf8')===source.text,'INTAKE_SOURCE_TOO_LARGE_OR_INVALID');
  let rows;
  if(source.format==='csv')rows=csv(source.text);
  else{try{rows=parseJSONBytes(Buffer.from(source.text.replace(/^\ufeff/,'')),{maximumBytes:MAX_SOURCE});}
    catch(error){throw new MerchantError('INTAKE_JSON_INVALID',400,{sourceCode:error.code??'JSON_INVALID'});}}
  need(Array.isArray(rows)&&rows.length>0&&rows.length<=MAX_ROWS&&rows.every(object),'INTAKE_ROWS_REQUIRED');
  const columns=[...new Set(rows.flatMap(Object.keys))];
  need(columns.length>0&&columns.length<=100&&columns.every(x=>x.length>0&&x.length<=160),'INTAKE_COLUMNS_INVALID');
  return {rows,columns,source:{name:source.name,format:source.format,text:source.text,bytes:Buffer.byteLength(source.text),sha256:hash(source.text)}};
}
function descriptor(workspace){
  return {tenantId:workspace.config.tenantId,publicOrigin:workspace.config.publicOrigin,
    template:copy(workspace.config.template),fulfillmentBinding:workspace.config.fulfillmentBinding};
}
export function merchantIntakeContext(workspace){
  workspace.store._assertOpen();
  const configuration=descriptor(workspace);
  return {schema:'stellar-forge.merchant-intake-context.v1',storeId:workspace.store.storeId,
    tenantId:configuration.tenantId,configuration,configurationSha256:hash(stable(configuration)),
    maximumInvoices:MAX_INVOICES,maximumSourceRows:MAX_ROWS,maximumSourceBytes:MAX_SOURCE,
    mode:workspace.readOnly?'review':'live'};
}
function mappingFor(value,columns){
  need(object(value)&&['atomic','decimal'].includes(value.amountMode),'INTAKE_AMOUNT_MODE_REQUIRED');
  const selected={amountMode:value.amountMode};
  for(const key of ['key','reference','title','assetId','amount']){
    need(typeof value[key]==='string'&&columns.includes(value[key]),'INTAKE_MAPPING_REQUIRED',400,{field:key});selected[key]=value[key];
  }
  if(value.invoiceId!==undefined&&value.invoiceId!==null&&value.invoiceId!==''){
    need(typeof value.invoiceId==='string'&&columns.includes(value.invoiceId),'INTAKE_MAPPING_INVALID');selected.invoiceId=value.invoiceId;
  }
  need(Object.keys(value).every(k=>Object.hasOwn(selected,k)||k==='invoiceId'),'INTAKE_MAPPING_INVALID');
  return selected;
}
function normalizeRows(rows,mapping,configuration,batch){
  const grouped=new Map(),ids=new Set();
  for(let i=0;i<rows.length;i++){
    const row=rows[i],field=k=>row[mapping[k]];
    let key,reference,title,assetId,amount;
    try{
      key=text(field('key'),'INTAKE_KEY_INVALID',160);
      reference=text(field('reference'),'INTAKE_REFERENCE_INVALID',120);
      title=text(field('title'),'INTAKE_TITLE_INVALID',180);
      assetId=text(field('assetId'),'INTAKE_ASSET_INVALID',80);
      amount=text(field('amount'),'INTAKE_AMOUNT_STRING_REQUIRED',110);
      const rail=configuration.template.rails.find(r=>r.assetId===assetId);need(rail,'INTAKE_ASSET_NOT_CONFIGURED');
      let amountAtomic=amount;
      if(mapping.amountMode==='decimal'){
        need(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(amount),'INTAKE_DECIMAL_INVALID');
        const [whole,fraction='']=amount.split('.');
        need(fraction.length<=rail.decimals,'INTAKE_PRECISION_EXCEEDED');
        amountAtomic=(whole+fraction.padEnd(rail.decimals,'0')).replace(/^0+(?=[0-9])/,'');
      }
      need(/^[1-9][0-9]{0,77}$/.test(amountAtomic),'INTAKE_ATOMIC_INVALID');
      const id=mapping.invoiceId?operation(field('invoiceId')):deriveInvoiceId(batch,key);
      let invoice=grouped.get(key);
      if(!invoice){
        need(!ids.has(id),'INTAKE_INVOICE_ID_DUPLICATE');ids.add(id);
        invoice={key,id,reference,title,prices:[],sourceRows:[]};grouped.set(key,invoice);
        need(grouped.size<=MAX_INVOICES,'INTAKE_INVOICE_LIMIT');
      }
      need(invoice.id===id&&invoice.reference===reference&&invoice.title===title,'INTAKE_GROUP_DETAILS_CHANGED');
      need(!invoice.prices.some(p=>p.assetId===assetId),'INTAKE_DUPLICATE_PAYMENT_OPTION');
      invoice.prices.push({assetId,amountAtomic});invoice.sourceRows.push(i+1);
    }catch(error){if(error instanceof MerchantError)error.details={...error.details,sourceRow:i+1};throw error;}
  }
  return [...grouped.values()];
}
function corePlan(input,configuration,storeId){
  const batch=operation(input.operation),source=inspectMerchantIntakeSource(input.source);
  const mapping=mappingFor(input.mapping,source.columns);
  return {schema:PLAN,operation:batch,storeId,tenantId:configuration.tenantId,
    configuration:copy(configuration),configurationSha256:hash(stable(configuration)),
    source:source.source,mapping,invoices:normalizeRows(source.rows,mapping,configuration,batch)};
}
function checkedPlan(plan,workspace){
  need(object(plan)&&plan.schema===PLAN&&plan.storeId===workspace.store.storeId&&plan.tenantId===workspace.config.tenantId,
    'INTAKE_OWNER_CHANGED',409);
  const expected=corePlan(plan,plan.configuration,plan.storeId);
  need(typeof plan.createdAt==='string'&&!Number.isNaN(Date.parse(plan.createdAt))&&
    plan.planSha256===hash(stable(expected))&&stable({...expected,createdAt:plan.createdAt,planSha256:plan.planSha256})===stable(plan),
    'INTAKE_RETAINED_PLAN_CHANGED',409);
  return plan;
}
async function directory(workspace,create=false){
  workspace.store._assertOpen();
  const path=join(workspace.store.directory,'invoice-intake');
  if(create){try{await mkdir(path,{mode:0o700});const fd=await open(workspace.store.directory,'r');try{await fd.sync();}finally{await fd.close();}}
    catch(error){if(error.code!=='EEXIST')throw error;}}
  let stat;try{stat=await lstat(path);}catch(error){if(!create&&error.code==='ENOENT')return null;throw error;}
  need(stat.isDirectory()&&!stat.isSymbolicLink()&&!(stat.mode&0o077)&&
    (process.getuid===undefined||stat.uid===process.getuid())&&await realpath(path)===path,'INTAKE_PRIVATE_DIRECTORY_REQUIRED',409);
  return path;
}
async function readPlan(workspace,id){
  const parent=await directory(workspace);need(parent,'INTAKE_NOT_FOUND',404);
  const plan=await readJSON(join(parent,operation(id)+'.json'),true);need(plan,'INTAKE_NOT_FOUND',404);
  return checkedPlan(plan,workspace);
}
function compatible(order,invoice,plan){
  const frozen=order?.frozen;
  if(!frozen)return false;
  const expectedRails=invoice.prices.map(p=>({...plan.configuration.template.rails.find(r=>r.assetId===p.assetId),amountAtomic:p.amountAtomic}));
  return order.id===invoice.id&&order.reference===invoice.reference&&order.title===invoice.title&&
    frozen.tenantId===plan.tenantId&&frozen.fulfillmentBinding===plan.configuration.fulfillmentBinding&&
    stable(frozen.template)===stable(plan.configuration.template)&&stable(frozen.rails)===stable(expectedRails)&&
    stable(frozen.request)===stable({method:'POST',url:plan.configuration.publicOrigin+'/orders/'+invoice.id+'/pay',
      contentType:'application/json',bodyBase64:Buffer.from(JSON.stringify({order_id:invoice.id,reference:invoice.reference})).toString('base64')});
}
function status(workspace,plan){
  workspace.store._assertOpen();let completed=0,conflicts=0;
  const invoices=plan.invoices.map(invoice=>{
    const order=workspace.store.getOrder(invoice.id,{private:true}),present=!!order,match=present&&compatible(order,invoice,plan);
    if(match)completed++;else if(present)conflicts++;
    return {...invoice,state:match?'RETAINED':present?'CONFLICT':'PENDING',invoiceState:match?order.state:null,
      createdAt:match?order.createdAt:null,offers:invoice.prices.map(p=>({...plan.configuration.template.rails.find(r=>r.assetId===p.assetId),amountAtomic:p.amountAtomic}))};
  });
  return {schema:'stellar-forge.merchant-intake-status.v1',operation:plan.operation,storeId:plan.storeId,
    tenantId:plan.tenantId,planSha256:plan.planSha256,createdAt:plan.createdAt,source:{name:plan.source.name,
      format:plan.source.format,bytes:plan.source.bytes,sha256:plan.source.sha256},mapping:copy(plan.mapping),
    configuration:copy(plan.configuration),configurationSha256:plan.configurationSha256,
    configurationCurrent:hash(stable(descriptor(workspace)))===plan.configurationSha256,
    state:conflicts?'CONFLICT':completed===invoices.length?'COMPLETE':completed?'PARTIAL':'PREPARED',
    counts:{invoices:invoices.length,offers:invoices.reduce((n,i)=>n+i.prices.length,0),retained:completed,pending:invoices.length-completed-conflicts,conflicts},
    invoices};
}
export async function prepareMerchantIntake(workspace,input){
  need(!workspace.readOnly,'MERCHANT_PROJECT_REVIEW_ONLY',403);
  need(object(input)&&input.storeId===workspace.store.storeId&&input.tenantId===workspace.config.tenantId,'INTAKE_OWNER_CHANGED',409);
  const expected=descriptor(workspace);
  need(input.configurationSha256===hash(stable(expected)),'INTAKE_CONFIGURATION_CHANGED',409);
  const core=corePlan(input,expected,workspace.store.storeId),digest=hash(stable(core));
  need(Buffer.byteLength(JSON.stringify(core,null,2))+1024<=4*1024*1024,'INTAKE_PLAN_TOO_LARGE');
  return workspace._serial('intake:'+core.operation,async()=>{
    const parent=await directory(workspace,true),path=join(parent,core.operation+'.json');
    let saved=await readJSON(path,true);
    if(saved){checkedPlan(saved,workspace);need(saved.planSha256===digest,'INTAKE_OPERATION_REUSED',409);}
    else{
      saved={...core,createdAt:new Date().toISOString(),planSha256:digest};
      // Shared storage keeps its maintained AsyncLocalStorage/record-writer lease.
      // Creation is durable and exclusive before any invoice can be created.
      try{await saveJSON(path,saved);}
      catch(error){const retained=await readJSON(path,true);if(!retained)throw error;checkedPlan(retained,workspace);
        need(retained.planSha256===digest,'INTAKE_OPERATION_REUSED',409);saved=retained;}
    }
    return status(workspace,saved);
  });
}
export async function readMerchantIntake(workspace,id){return status(workspace,await readPlan(workspace,id));}
export async function exportMerchantIntake(workspace,id){
  const plan=await readPlan(workspace,id);return {schema:'stellar-forge.merchant-intake-delivery.v1',plan:copy(plan),status:status(workspace,plan)};
}
export async function listMerchantIntakes(workspace){
  const parent=await directory(workspace);if(!parent)return {intakes:[]};
  const names=(await readdir(parent)).filter(n=>/^[0-9a-f-]{36}\.json$/.test(n)).sort(),intakes=[];
  for(const name of names){
    const p=checkedPlan(await readJSON(join(parent,name)),workspace),s=status(workspace,p);
    intakes.push({operation:s.operation,createdAt:s.createdAt,source:s.source,counts:s.counts,state:s.state,planSha256:s.planSha256});
  }
  intakes.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.operation.localeCompare(b.operation));
  return {intakes};
}
export async function runMerchantIntake(workspace,id,review){
  need(!workspace.readOnly,'MERCHANT_PROJECT_REVIEW_ONLY',403);operation(id);
  need(object(review)&&SHA.test(review.planSha256??''),'INTAKE_REVIEW_REQUIRED');
  return workspace._serial('intake:'+id,async()=>{
    const plan=await readPlan(workspace,id);
    need(plan.planSha256===review.planSha256,'INTAKE_REVIEW_CHANGED',409);
    const before=status(workspace,plan);
    need(before.counts.conflicts===0,'INTAKE_EXISTING_INVOICE_CONFLICT',409);
    if(before.state==='COMPLETE')return before;
    need(before.configurationCurrent,'INTAKE_CONFIGURATION_CHANGED',409);
    let interruption=null;
    for(const invoice of plan.invoices){
      const existing=workspace.store.getOrder(invoice.id,{private:true});
      if(existing){need(compatible(existing,invoice,plan),'INTAKE_EXISTING_INVOICE_CONFLICT',409);continue;}
      try{
        // This local draft operation never invokes the provider. Its original ID
        // and frozen terms are retained by the normal merchant invoice owner.
        await workspace.createOrder({id:invoice.id,reference:invoice.reference,title:invoice.title,prices:invoice.prices});
        need(compatible(workspace.store.getOrder(invoice.id,{private:true}),invoice,plan),'INTAKE_CREATED_INVOICE_CHANGED',409);
      }catch(error){interruption={code:String(error.code??'INTAKE_SAVE_INTERRUPTED').replace(/[^A-Z0-9_.:-]/gi,'_').slice(0,120),invoiceId:invoice.id};break;}
    }
    const result=status(workspace,plan);
    if(interruption)result.interruption=interruption;
    return result;
  });
}
