'use strict';
const M=require('./water-lab.cjs'),T=require('./study-time.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const at=s=>'2026-10-15T'+s+':00Z';
function build(){
 const records=Object.fromEntries(M.KINDS.map(f=>[f,[]])),documents={},contexts={system:{},location:{},schedule:{},person:{},report:{}};
 const add=(family,id,fields,available='08:00')=>{
  const v=Object.fromEntries(M.FIELDS[family].map(k=>[k,'']));
  Object.assign(v,{id,record_key:id,revision:'1',record_status:'active',recorded_at:at(available),available_at:at(available),source_document_id:'DOC-'+id,source_ref:'Authored water handover course / '+id},fields);
  documents[v.source_document_id]={id:v.source_document_id,available_at:v.available_at,text:'Authored complete source for '+id+'\n'+JSON.stringify(v,null,2)};
  records[family].push(v);return v;
 };
 const context=(kind,id,fields={})=>contexts[kind][id]={id,available_at:at('07:00'),...fields};
 documents['AUTH-SCOPE']={id:'AUTH-SCOPE',available_at:at('07:00'),text:'Authored role and laboratory scope document. This course uses no regulatory threshold or treatment-control default.'};
 for(const system of ['SYS-A','SYS-B','SYS-C']){
  context('system',system);
  context('location','LOC-'+system,{system_id:system,purpose:'drinking-water'});
  context('schedule','SCH-'+system,{system_id:system,approved_at:at('07:00'),valid_from:at('07:00'),valid_to:at('18:00')});
  context('report','TARGET-'+system,{system_id:system,interval_start:at('08:00'),interval_end:at('11:30'),purpose:'drinking-water',available_at:at('10:00')});
 }
 for(const id of ['COLLECTOR','COURIER','RECEIVER','REVIEWER','PREPARER'])context('person',id);
 add('lab_laboratories','LAB1',{laboratory_id:'LAB-EXAMPLE',name:'Authored laboratory',valid_from:at('07:00'),valid_to:at('18:00'),scope_document_id:'AUTH-SCOPE'});
 const order=(id,system)=>add('lab_orders',id,{order_id:id,system_id:system,schedule_id:'SCH-'+system,location_id:'LOC-'+system,purpose:'drinking-water',ordered_at:at('08:00'),ordered_by:'PREPARER',valid_from:at('08:00'),valid_to:at('18:00')},'08:05');
 order('ORDER-A','SYS-A');order('ORDER-B','SYS-B');order('ORDER-C','SYS-C');
 const line=(id,orderId,analyte,method,unit,limit)=>add('lab_order_lines',id,{order_line_id:id,order_record_id:orderId,analyte,method,unit,maximum_reporting_limit:limit,due_at:at('12:00')},'08:10');
 line('LINE-A-CHEM','ORDER-A','CHEMICAL-X','LAB-METHOD-CHEM','mg/L','0.5');
 line('LINE-A-MICRO','ORDER-A','MICRO-ORGANISM-X','LAB-METHOD-PRESENCE','presence/absence','');
 line('LINE-B-CHEM','ORDER-B','CHEMICAL-X','LAB-METHOD-CHEM','mg/L','0.5');
 line('LINE-C-CHEM','ORDER-C','CHEMICAL-X','LAB-METHOD-CHEM','mg/L','0.5');
 const sample=(id,system,orderId,collected)=>add('lab_samples',id,{sample_id:id,order_record_id:orderId,system_id:system,location_id:'LOC-'+system,purpose:'drinking-water',collected_at:at(collected),collector_id:'COLLECTOR',container_id:'BOTTLE-'+id},collected);
 sample('S-A1','SYS-A','ORDER-A','08:30');sample('S-A2','SYS-A','ORDER-A','08:32');sample('S-A3','SYS-A','ORDER-A','08:34');sample('S-A4','SYS-A','ORDER-A','09:20');sample('S-B1','SYS-B','ORDER-B','08:36');sample('S-C1','SYS-C','ORDER-C','09:00');
 const custody=(sampleId,collected,transferred,received,rejected=false)=>{
  add('lab_custody_events','C-'+sampleId+'-1',{custody_event_id:'C-'+sampleId+'-1',sample_record_id:sampleId,sequence:'1',event_type:'collected',to_party_id:'COLLECTOR',event_at:at(collected),actor_id:'COLLECTOR',condition:'sealed',receipt_ref:'COLLECTION-'+sampleId},collected);
  if(!received)return;
  add('lab_custody_events','C-'+sampleId+'-2',{custody_event_id:'C-'+sampleId+'-2',sample_record_id:sampleId,sequence:'2',event_type:'transferred',from_party_id:'COLLECTOR',to_party_id:'COURIER',event_at:at(transferred),actor_id:'COLLECTOR',condition:'sealed',receipt_ref:'TRANSFER-'+sampleId},transferred);
  add('lab_custody_events','C-'+sampleId+'-3',{custody_event_id:'C-'+sampleId+'-3',sample_record_id:sampleId,sequence:'3',event_type:rejected?'rejected':'received',from_party_id:'COURIER',to_party_id:'LAB-EXAMPLE',event_at:at(received),actor_id:'RECEIVER',condition:rejected?'container damaged':'accepted sealed container',receipt_ref:'LAB-RECEIPT-'+sampleId},received);
  add('lab_accessions','ACC-'+sampleId,{accession_id:'ACC-'+sampleId,sample_record_id:sampleId,laboratory_record_id:'LAB1',lab_sample_id:'EXT-'+sampleId,received_at:at(received),received_by:'RECEIVER',disposition:rejected?'rejected':'accepted',rejection_reason:rejected?'Container damaged on receipt':'',custody_event_record_id:'C-'+sampleId+'-3'},received);
 };
 custody('S-A1','08:30','08:40','09:00');custody('S-A2','08:32','08:40','09:00');custody('S-A3','08:34','08:40','09:00',true);custody('S-A4','09:20','09:25','09:30');custody('S-B1','08:36','08:45','09:05');custody('S-C1','09:00');
 add('lab_sample_links','LINK-RESAMPLE',{link_id:'LINK-RESAMPLE',sample_record_id:'S-A4',prior_sample_record_id:'S-A3',relationship:'resample',reason:'Replacement collection after damaged-container rejection',linked_at:at('09:20'),linked_by:'COLLECTOR'},'09:20');
 const report=(id,system,issued,available,extra={})=>add('lab_reports',id,{report_id:id,laboratory_record_id:'LAB1',system_id:system,lab_report_ref:'EXTERNAL-'+id,issued_at:at(issued),coverage_start:at('08:00'),coverage_end:at('09:35'),...extra},available);
 const rep1=report('REP-A1','SYS-A','09:40','09:45');report('REP-A4','SYS-A','10:05','10:10');report('REP-B1','SYS-B','09:45','09:50');
 const result=(id,reportId,sampleId,lineId,qualifier,value,analysed,available,extra={})=>{
  const l=records.lab_order_lines.find(r=>r.id===lineId);
  return add('lab_results',id,{result_id:id,report_record_id:reportId,accession_record_id:'ACC-'+sampleId,order_line_record_id:lineId,analyte:l.analyte,method:l.method,unit:l.unit,value_text:value,qualifier,reporting_limit:l.maximum_reporting_limit?'0.4':'',detection_limit:l.maximum_reporting_limit?'0.1':'',analysed_at:at(analysed),...extra},available);
 };
 const ra1=result('RESULT-A1','REP-A1','S-A1','LINE-A-CHEM','eq','1.2','09:20','09:45');
 const ra2=result('RESULT-A2','REP-A1','S-A2','LINE-A-MICRO','absent','Absent','09:22','09:45');
 result('RESULT-A4','REP-A4','S-A4','LINE-A-CHEM','lt','0.4','09:45','10:10');
 result('RESULT-B1','REP-B1','S-B1','LINE-B-CHEM','nd','ND','09:25','09:50');
 const rep2=report('REP-A2','SYS-A','11:00','11:05',{record_key:'REP-A1',revision:'2',supersedes_id:'REP-A1',lab_report_ref:'EXTERNAL-REP-A1-REV2'});
 result('RESULT-A1-CORRECTED','REP-A2','S-A1','LINE-A-CHEM','eq','1.1','09:20','11:05',{record_key:'RESULT-A1',revision:'2',supersedes_id:'RESULT-A1'});
 const amendment=(id,old,action,replacement)=>add('lab_amendments',id,{amendment_id:id,report_record_id:rep2.id,prior_report_record_id:rep1.id,prior_report_sha256:M.hashRow(rep1),prior_result_record_id:old.id,prior_result_sha256:M.hashRow(old),action,replacement_result_record_id:replacement,reason:action==='replace'?'Laboratory corrected transcription':'Explicit unchanged result carried forward',authorised_at:at('10:55'),authorised_by:'REVIEWER'},'11:05');
 amendment('AMEND-REPLACE',ra1,'replace','RESULT-A1-CORRECTED');amendment('AMEND-CARRY',ra2,'carry_forward','');
 const reviews=[['RESULT-A1','10:00'],['RESULT-A2','10:00'],['RESULT-B1','10:00'],['RESULT-A4','10:20'],['RESULT-A1-CORRECTED','11:15']];
 for(const[id,time]of reviews){const r=records.lab_results.find(r=>r.id===id);add('lab_reviews','REVIEW-'+id,{review_id:'REVIEW-'+id,result_record_id:id,result_sha256:M.hashRow(r),reviewed_at:at(time),reviewed_by:'REVIEWER',decision:'accepted',comment:'Authored reviewer accepted original method, unit, resolution and source identity'},time);}
 for(const[id,system,time]of [['RESULT-A1','SYS-A','10:15'],['RESULT-A2','SYS-A','10:15'],['RESULT-A4','SYS-A','10:25'],['RESULT-B1','SYS-B','10:15']]){
  const r=records.lab_results.find(r=>r.id===id);add('lab_report_inputs','INPUT-'+id,{input_id:'INPUT-'+id,target_report_id:'TARGET-'+system,result_record_id:id,result_sha256:M.hashRow(r),review_record_id:'REVIEW-'+id,selected_at:at(time),selected_by:'PREPARER'},time);
 }
 return {records,documents,contexts,authored:true,description:'Six actual authored samples across three example systems; one rejected container and replacement, one field-only sample, four accepted analyses, a partial laboratory amendment with explicit carry-forward, and preserved earlier report selections.'};
}
function optionsFor(data,asOf){
 return {as_of:asOf,population_complete:true,extract_available_at:Object.fromEntries(M.KINDS.map(f=>[f,asOf])),expected_counts:Object.fromEntries(M.KINDS.map(f=>[f,data.records[f].length])),resolve:(kind,id,t)=>{const x=data.contexts[kind]?.[id];return x&&T.time(x.available_at)<=T.time(t)?x:null;},document:(id,t)=>{const d=data.documents[id];return d&&T.time(d.available_at)<=T.time(t)?d:null;},authorize:(role,person,system,t)=>{const roles={collector:'COLLECTOR','lab-receiver':'RECEIVER','lab-reviewer':'REVIEWER','report-preparer':'PREPARER'};return roles[role]===person&&data.contexts.system[system]&&T.time(t)>=T.time(at('07:00'))?{authorized:true,available_at:at('07:00'),source_document_id:'AUTH-SCOPE'}:null;}};
}
function view(data,asOf){const d=copy(data);for(const f of M.KINDS)d.records[f]=d.records[f].filter(r=>T.time(r.available_at)<=T.time(asOf));return {data:d,options:optionsFor(d,asOf),result:M.analyze(d.records,optionsFor(d,asOf))};}
function course(){const data=build();return {data,early:view(data,at('10:30')),late:view(data,at('12:00'))};}
module.exports={build,optionsFor,view,course,at};
