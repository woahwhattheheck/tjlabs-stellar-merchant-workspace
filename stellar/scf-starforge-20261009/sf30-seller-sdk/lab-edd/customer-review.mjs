// MIT. A customer findings document over an already verified, unchanged result.
// This module is also embedded verbatim in the offline operator; no Node imports.
export const LAB_CUSTOMER_REVIEW_SCHEMA='starforge.lab-edd-customer-review.v1';
export const LAB_INSPECTION_SCHEMA='starforge.lab-edd-customer-inspection.v1';
export function customerCanonical(value){
  if(Array.isArray(value))return '['+value.map(customerCanonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+customerCanonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
export function customerNeed(condition,message){if(!condition)throw Object.assign(new Error(message),{code:'LAB_CUSTOMER_REVIEW'});}
export function customerExact(value,keys,label){
  customerNeed(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key)),'Unexpected '+label+' field or shape.');
}
export function customerText(value,limit,label){customerNeed(typeof value==='string'&&value.length<=limit,'Invalid '+label+'.');return value;}
export function emptyLabCustomerReview(inspection){
  return {schema:LAB_CUSTOMER_REVIEW_SCHEMA,identity:structuredClone(inspection.identity),reviewer:'',disposition:'in_progress',summary:'',findings:[]};
}
export function customerTarget(inspection,edition,tableId,recordId,field=null){
  const family=inspection.families.find(f=>f.edition===edition),table=family?.tables.find(t=>t.tableId===tableId),row=table?.rows.find(r=>r.original.recordId===recordId);
  customerNeed(row,'The finding refers to an absent original row.');
  const index=field===null?-1:table.keys.indexOf(field);
  customerNeed(field===null||typeof field==='string'&&index>=0,'The finding refers to an absent field.');
  return {edition,tableId,recordId,rowSha256:row.original.rowSha256,reviewedRowSha256:row.reviewed.rowSha256,field,
    originalValue:index<0?null:row.original.fields[index],reviewedValue:index<0?null:row.reviewed.fields[index]};
}
export function normalizeLabCustomerReview(inspection,input){
  customerNeed(inspection?.schema===LAB_INSPECTION_SCHEMA,'Select a complete Laboratory inspection.');
  customerExact(input,['schema','identity','reviewer','disposition','summary','findings'],'customer review');
  customerNeed(input.schema===LAB_CUSTOMER_REVIEW_SCHEMA&&customerCanonical(input.identity)===customerCanonical(inspection.identity),'The customer review belongs to a different complete result or saved review.');
  const reviewer=customerText(input.reviewer,512,'reviewer'),summary=customerText(input.summary,24000,'summary');
  customerNeed(['in_progress','accepted','correction_requested'].includes(input.disposition),'Choose an explicit customer review disposition.');
  customerNeed(Array.isArray(input.findings)&&input.findings.length<=250000,'Use a complete supported findings list.');
  // Index once: full result families can contain 100,000 physical rows.
  const rows=new Map();
  for(const family of inspection.families)for(const table of family.tables)for(const row of table.rows)
    rows.set(customerCanonical([family.edition,table.tableId,row.original.recordId]),{table,row});
  const seen=new Set(),findings=[];
  for(const item of input.findings){
    customerExact(item,['target','status','note'],'finding');
    customerExact(item.target,['edition','tableId','recordId','rowSha256','reviewedRowSha256','field','originalValue','reviewedValue'],'finding target');
    const t=item.target,found=rows.get(customerCanonical([t.edition,t.tableId,t.recordId]));
    customerNeed(found,'A finding original row is absent.');
    const {table,row}=found,index=t.field===null?-1:table.keys.indexOf(t.field);
    customerNeed(t.field===null||typeof t.field==='string'&&index>=0,'A finding field is absent.');
    const expected={edition:t.edition,tableId:t.tableId,recordId:t.recordId,rowSha256:row.original.rowSha256,reviewedRowSha256:row.reviewed.rowSha256,field:t.field,
      originalValue:index<0?null:row.original.fields[index],reviewedValue:index<0?null:row.reviewed.fields[index]};
    customerNeed(customerCanonical(t)===customerCanonical(expected),'A finding no longer matches the complete original and reviewed row or field values.');
    const key=customerCanonical([t.edition,t.tableId,t.recordId,t.field]);
    customerNeed(!seen.has(key),'Use one customer finding per original row or field.');seen.add(key);
    customerNeed(['open','resolved','information'].includes(item.status),'Choose an explicit finding status.');
    const note=customerText(item.note,24000,'finding note');customerNeed(note.trim().length>0,'Every finding needs a note.');
    findings.push({target:expected,status:item.status,note});
  }
  findings.sort((a,b)=>{const x=customerCanonical(a.target),y=customerCanonical(b.target);return x<y?-1:x>y?1:0;});
  if(input.disposition!=='in_progress')customerNeed(reviewer.trim()&&summary.trim(),'A completed customer disposition needs a named reviewer and summary.');
  if(input.disposition==='accepted')customerNeed(!findings.some(f=>f.status==='open'),'Resolve open customer findings before recording acceptance.');
  return {schema:LAB_CUSTOMER_REVIEW_SCHEMA,identity:structuredClone(inspection.identity),reviewer,disposition:input.disposition,summary,findings};
}

/** The caller supplies the result of the original readLabResult verifier. */
export function inspectLabCustomerResult(result,identity){
  const byName=new Map(result.members.map(m=>[m.filename,m]));
  const families=[];
  for(const [edition,prefix,family]of [['current','',result],['baseline','baseline/',result.baseline]]){
    if(!family)continue;
    const raw=byName.get(prefix+'source/rows.json');customerNeed(raw,'The complete original rows are absent.');
    const originals=JSON.parse(raw.bytes.toString('utf8')),reviewed=family.review.tables;
    customerNeed(Array.isArray(originals)&&Array.isArray(reviewed)&&originals.length===reviewed.length,'The complete original and reviewed table sets differ.');
    const tables=originals.map((table,index)=>{
      const other=reviewed[index];
      customerNeed(table.filename===other.filename&&table.id===other.id&&table.sha256===other.sha256&&customerCanonical(table.headers)===customerCanonical(other.headers)&&customerCanonical(table.keys)===customerCanonical(other.keys)&&table.rows.length===other.rows.length,'The complete reviewed table identity changed.');
      const rows=table.rows.map((row,i)=>{
        const after=other.rows[i];
        customerNeed(row.recordId===after.recordId&&row.rowNumber===after.rowNumber&&row.fields.length===table.keys.length&&after.fields.length===table.keys.length,'The original physical row or complete field set changed.');
        customerNeed(after.sourceRowSha256===undefined?row.rowSha256===after.rowSha256:after.sourceRowSha256===row.rowSha256,'The reviewed row lost its original source binding.');
        return {original:structuredClone(row),reviewed:structuredClone(after)};
      });
      const {rows:ignored,...metadata}=table;
      return {...structuredClone(metadata),tableId:edition+':'+index,rows};
    });
    families.push({edition,profile:family.source.profile,source:family.source,tables,
      originalReport:family.review.originalReport,report:family.review.report,document:family.document,changes:family.review.changes,nativePreparation:family.nativePreparation});
  }
  return {schema:LAB_INSPECTION_SCHEMA,identity:structuredClone(identity),families,
    reconciliation:result.reconciliation?{comparison:result.reconciliation.comparison,document:result.reconciliation.document,
      review:result.reconciliation.review,outputComparison:result.reconciliation.outputComparison}:null};
}
