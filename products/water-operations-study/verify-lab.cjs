'use strict';
const M=require('./water-lab.cjs'),C=require('./lab-course.cjs'),T=require('./study-time.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));const yes=(v,msg)=>{if(!v)throw Error(msg);};
function run(){
 const cases=[],base=C.build(),late=C.at('12:00');
 const check=(name,fn)=>{fn();cases.push({name,passed:true});};
 const get=(d,f,id)=>d.records[f].find(r=>r.id===id);
 const update=(d,f,id,changes)=>{const r=get(d,f,id);Object.assign(r,changes);return r;};
 const cloneRow=(d,f,id,newId,changes={})=>{const x=copy(get(d,f,id));Object.assign(x,{id:newId,record_key:newId,[M.IDS[f]]:newId,source_document_id:'DOC-'+newId,...changes});d.documents[x.source_document_id]={id:x.source_document_id,available_at:x.available_at,text:'Authored alternative source '+newId};d.records[f].push(x);return x;};
 const analyze=(d,at=late)=>M.analyze(d.records,C.optionsFor(d,at));
 const invalid=(r,f,id)=>r.records[f].find(x=>x.record_id===id)?.valid===false;
 check('Complete early and later populations preserve the original packet and partial amendment',()=>{
  const e=C.view(base,C.at('10:30')).result,l=analyze(base);
  yes(e.issues.length===0&&l.issues.length===0,'Complete course must resolve without issues');
  yes(e.summary.samples===6&&l.summary.accepted_accessions===4&&l.summary.rejected_accessions===1,'Physical population retained');
  yes(e.summary.effective_results===4&&l.summary.effective_results===4,'Amendment replaces one result and carries another');
  yes(e.summary.valid_report_inputs===4&&l.summary.valid_report_inputs===4,'Prior report selections remain historical facts');
  yes(e.summary.inputs_needing_amendment_reconciliation===0&&l.summary.inputs_needing_amendment_reconciliation===1,'Exactly one prior selection needs reconciliation');
 });
 check('Nondetect preserves original qualifier and limits without becoming numeric zero',()=>{
  const r=analyze(base).records.lab_results.find(x=>x.record_id==='RESULT-B1');
  yes(r.valid&&r.usable&&r.measurement.interval===null&&r.measurement.original_value==='ND','Nondetect must retain qualitative meaning');
  yes(r.measurement.reporting_limit.numerator==='2'&&r.measurement.reporting_limit.denominator==='5','Exact decimal reporting limit');
 });
 check('A broken custody handoff prevents accession and downstream result use',()=>{
  const d=copy(base);update(d,'lab_custody_events','C-S-A1-2',{from_party_id:'UNRELATED-PARTY'});const r=analyze(d);
  yes(invalid(r,'lab_accessions','ACC-S-A1')&&invalid(r,'lab_results','RESULT-A1-CORRECTED'),'Broken handoff cannot support results');
 });
 check('Duplicate custody sequence is unresolved instead of arbitrarily ordered',()=>{
  const d=copy(base);update(d,'lab_custody_events','C-S-A1-2',{sequence:'1'});yes(invalid(analyze(d),'lab_accessions','ACC-S-A1'),'Ambiguous custody');
 });
 check('An accepted accession cannot use a rejected receipt',()=>{
  const d=copy(base);update(d,'lab_accessions','ACC-S-A3',{disposition:'accepted',rejection_reason:''});yes(invalid(analyze(d),'lab_accessions','ACC-S-A3'),'Receipt disposition mismatch');
 });
 check('Duplicate laboratory sample identity invalidates both claims',()=>{
  const d=copy(base);update(d,'lab_accessions','ACC-S-A2',{lab_sample_id:'EXT-S-A1'});const r=analyze(d);yes(invalid(r,'lab_accessions','ACC-S-A1')&&invalid(r,'lab_accessions','ACC-S-A2'),'External accession identity must be unique');
 });
 check('Reporting resolution worse than the actual order prevents accepted review',()=>{
  const d=copy(base);const x=update(d,'lab_results','RESULT-B1',{reporting_limit:'0.8'});update(d,'lab_reviews','REVIEW-RESULT-B1',{result_sha256:M.hashRow(x)});update(d,'lab_report_inputs','INPUT-RESULT-B1',{result_sha256:M.hashRow(x)});const r=analyze(d);
  yes(r.records.lab_results.find(x=>x.record_id==='RESULT-B1').usable===false&&invalid(r,'lab_reviews','REVIEW-RESULT-B1'),'Requested reporting resolution is meaningful');
 });
 check('An order method cannot be retrospectively introduced after analysis',()=>{
  const d=copy(base);update(d,'lab_order_lines','LINE-B-CHEM',{recorded_at:C.at('09:40'),available_at:C.at('09:40')});d.documents['DOC-LINE-B-CHEM'].available_at=C.at('09:40');
  yes(invalid(analyze(d),'lab_results','RESULT-B1'),'Late analytical request cannot authorise earlier analysis');
 });
 check('An accession entered after analysis cannot retrospectively authorise the analysis',()=>{
  const d=copy(base);update(d,'lab_accessions','ACC-S-B1',{recorded_at:C.at('09:40'),available_at:C.at('09:40')});d.documents['DOC-ACC-S-B1'].available_at=C.at('09:40');const r=analyze(d);
  yes(invalid(r,'lab_results','RESULT-B1')&&invalid(r,'lab_reviews','REVIEW-RESULT-B1')&&invalid(r,'lab_report_inputs','INPUT-RESULT-B1'),'The accepted source must be available at the analysis instant');
 });
 check('A faithful later extract retains original row availability for historical decisions',()=>{
  const o=C.optionsFor(base,late);o.extract_available_at.lab_order_lines=C.at('11:30');const r=M.analyze(base.records,o);
  yes(r.issues.length===0&&r.summary.valid_report_inputs===4&&r.summary.inputs_needing_amendment_reconciliation===1,'A later exported edition may retain valid earlier source rows');
 });
 check('An unknown laboratory scope end cannot become an explicitly open interval',()=>{
  const d=copy(base),old=get(d,'lab_laboratories','LAB1'),blankHash=M.hashRow(old);old.valid_to=null;const unknownHash=M.hashRow(old),r=analyze(d);
  yes(blankHash!==unknownHash&&!r.input_valid&&r.summary.effective_results===0&&r.issues.some(x=>x.code==='CANONICAL_CELL_UNAVAILABLE'&&x.id==='LAB1'),'Null remains unknown and is retained in source hashing');
 });
 check('Changing a result without updating its exact human review hash is detected',()=>{
  const d=copy(base);update(d,'lab_results','RESULT-B1',{value_text:'Not detected'});yes(invalid(analyze(d),'lab_reviews','REVIEW-RESULT-B1'),'Review hash binds exact source');
 });
 check('A later laboratory correction must account for unchanged results explicitly',()=>{
  const d=copy(base);d.records.lab_amendments=d.records.lab_amendments.filter(x=>x.id!=='AMEND-CARRY');const r=analyze(d);
  yes(r.report_result_sets.find(x=>x.record_id==='REP-A2').valid===false,'Missing carry-forward must remain unresolved');
 });
 check('An amendment cannot replace another sample or requested analyte',()=>{
  const d=copy(base);update(d,'lab_amendments','AMEND-REPLACE',{replacement_result_record_id:'RESULT-A2'});yes(analyze(d).report_result_sets.find(x=>x.record_id==='REP-A2').valid===false,'Wrong replacement identity');
 });
 check('A target report cannot borrow another system source',()=>{
  const d=copy(base);update(d,'lab_report_inputs','INPUT-RESULT-B1',{target_report_id:'TARGET-SYS-A'});yes(invalid(analyze(d),'lab_report_inputs','INPUT-RESULT-B1'),'Cross-system reporting source rejected');
 });
 check('Later rejection supersedes an earlier accepted review for new selections',()=>{
  const d=copy(base);cloneRow(d,'lab_reviews','REVIEW-RESULT-B1','REVIEW-B-LATER',{reviewed_at:C.at('10:05'),recorded_at:C.at('10:05'),available_at:C.at('10:05'),decision:'rejected'});yes(invalid(analyze(d),'lab_report_inputs','INPUT-RESULT-B1'),'Old accepted review cannot bypass known later rejection');
 });
 check('A rejection after report selection preserves historical selection and requests reconciliation',()=>{
  const d=copy(base);cloneRow(d,'lab_reviews','REVIEW-RESULT-B1','REVIEW-B-AFTER',{reviewed_at:C.at('11:30'),recorded_at:C.at('11:30'),available_at:C.at('11:30'),decision:'rejected'});const r=analyze(d),i=r.records.lab_report_inputs.find(x=>x.record_id==='INPUT-RESULT-B1');
  yes(i.valid&&i.historically_valid&&i.current_review_decision==='rejected'&&r.summary.inputs_needing_amendment_reconciliation===2,'Late review must not rewrite earlier packet');
 });
 check('Repeated report selection is a conflict for all duplicate current rows',()=>{
  const d=copy(base);cloneRow(d,'lab_report_inputs','INPUT-RESULT-B1','INPUT-B-DUPLICATE');const r=analyze(d);yes(invalid(r,'lab_report_inputs','INPUT-RESULT-B1')&&invalid(r,'lab_report_inputs','INPUT-B-DUPLICATE'),'Both duplicate selections are unresolved');
 });
 check('A missing source document cannot support a record or its downstream result',()=>{
  const d=copy(base);delete d.documents['DOC-ACC-S-B1'];const r=analyze(d);yes(!r.input_valid&&invalid(r,'lab_results','RESULT-B1'),'Source completeness required');
 });
 check('Wrong declared family population cannot be reported complete',()=>{
  const o=C.optionsFor(base,late);o.expected_counts.lab_samples=99;const r=M.analyze(base.records,o);yes(r.input_valid&&!r.population_complete,'Population declaration distinct from valid individual source syntax');
 });
 check('Future source edition cannot be visible at an earlier analysis cutoff',()=>{
  const o=C.optionsFor(base,late);o.extract_available_at.lab_results=C.at('13:00');const r=M.analyze(base.records,o);yes(!r.population_complete&&r.summary.effective_results===0,'Unobserved result extract excluded');
 });
 check('Duplicate business sample identity is quarantined across both source records',()=>{
  const d=copy(base);cloneRow(d,'lab_samples','S-B1','S-B-DUP',{sample_id:'S-B1'});const r=analyze(d);yes(!r.input_valid&&r.issues.some(x=>x.code==='BUSINESS_ID_CONFLICT')&&invalid(r,'lab_accessions','ACC-S-B1'),'Conflicting physical sample identity cannot be selected');
 });
 check('A result qualifier error remains an explicit unresolved row',()=>{
  const d=copy(base);update(d,'lab_results','RESULT-B1',{qualifier:'probably-zero'});yes(invalid(analyze(d),'lab_results','RESULT-B1'),'Unknown qualifier is not coerced');
 });
 return {schema:'water.lab-verification.v1',runtime:'Actual water-lab.cjs executed in JavaScript; source callbacks supplied from the complete authored course',passed:cases.length,cases};
}
module.exports={run};
