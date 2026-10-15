'use strict';
const Core=require('../core.cjs'),C=require('../canonical.cjs'),Course=require('../examples/build-course.cjs'),Service=require('../service.cjs'),Commerce=require('../service-commerce.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function run(){
 const checks=[];let w=clone(require('../examples/complete.study.json'));const base=Core.analyze(w);
 if(!base.service.reports[0].complete||!base.service.commerce.complete)throw Error('Baseline incomplete');
 checks.push({name:'Complete joined technical and commercial source resolves',passed:true});
 const additions=[];for(const f of Commerce.KINDS){const valid=base.service.commerce.records[f]?.find(x=>x.valid);if(!valid)continue;const row=Core.rows(w,f,'returned').find(x=>x.values.id===valid.id);if(!row)throw Error('missing valid row '+f);additions.push({f,row:row.values,extract:Core.selected(w,f,'returned')});}
 if(additions.length!==15)throw Error('Expected all fifteen commercial families');
 w=Course.mutate(w,'report_inputs',xs=>{const template=clone(xs[0]);for(const {f,row,extract}of additions)xs.push({...template,id:'peer-input-'+f,record_key:'peer-input-'+f,report_input_id:'PEER-'+f,family:f,record_id:row.id,extract_id:extract.id,row_sha256:C.hash(row),role:'commercial_evidence'});});
 const bound=Service.reportBasis(w,Core.rows,Core.selected,'REPORT-FINAL');w=Course.mutate(w,'report_reviews',xs=>{for(const r of xs)r.report_basis_sha256=bound;});
 const complete=Core.analyze(w).service.reports[0];if(!complete.complete||complete.inputs.length!==23)throw Error('Financial report join failed '+JSON.stringify(complete.issues));
 checks.push({name:'Frozen report binds all fifteen commercial families alongside the whole eight-case population',passed:true,commercial_families:additions.length,input_rows:complete.inputs.length});
 const badHash=Course.mutate(w,'report_inputs',xs=>{xs.find(x=>x.family==='commerce_payments').row_sha256='0'.repeat(64);});const hashResult=Core.analyze(badHash).service.reports[0];
 if(hashResult.complete||!hashResult.inputs.find(x=>x.family==='commerce_payments').issues.includes('REPORT_EXACT_ROW_BINDING'))throw Error('Changed hash accepted');
 checks.push({name:'Changed payment input digest invalidates the frozen report and original reviews',passed:true});
 const badDoc=Core.clone(w),payment=Core.rows(w,'commerce_payments','returned')[0].values;badDoc.documents.find(x=>x.id===payment.payment_document_id).available_at='2026-10-05T16:30:00.000Z';const docResult=Core.analyze(badDoc).service.reports[0];
 if(docResult.complete||docResult.inputs.find(x=>x.family==='commerce_payments').valid)throw Error('Unavailable original accepted');
 checks.push({name:'A payment original arriving after the report cutoff cannot support that frozen packet',passed:true});
 const duplicate=Course.mutate(w,'reports',xs=>xs.push({...xs[0],id:'peer-second-report',record_key:'peer-second-report'}));const dr=Core.analyze(duplicate).service.reports;
 if(dr.some(x=>x.complete||!x.issues.includes('REPORT_IDENTITY_AMBIGUOUS')))throw Error('Ambiguous reports accepted');
 checks.push({name:'Both report business-identity claims are unresolved while originals remain retained',passed:true});
 return{schema:'equipment-service.financial-report-peer.v1',runtime:'Actual joined source in JavaScript with the full authored study',checks,study:w,complete_report:complete};
}
module.exports={run};
