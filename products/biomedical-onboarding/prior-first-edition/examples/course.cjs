'use strict';
const C=require('../core.cjs'),CSV=require('../csv.cjs');
function make(){
 let w=C.empty('Authored onboarding course — repair, loaner and repeat visit');w.id='authored-biomed-course';w.config.data_class='authored_course';w.config.source_scope='Two fictional facilities, three fictional assets, three recorded administrative events. No clinical readings or real maintenance decisions.';w.config.returned_scope='Same selected subset, with new trial IDs. First returned edition contains deliberate identity and field differences.';w.config.authority_notes='Authored data exercise. Literal status/due-date values are comparison fixtures, not maintenance recommendations.';
 const all={
 facilities:[['F1','Example outpatient site','Example North'],['F2','Example depot','Example South']],
 assets:[['A1','F1','FAC-001','SER-001','Example maker','Model-X','recorded_active','2027-01-09','PROC-SOURCE-A'],['A2','F1','FAC-002','SER-002','Example maker','Model-Y','recorded_in_service','2027-02-10','PROC-SOURCE-B'],['L1','F2','LOAN-001','LOAN-SER-1','Example maker','Model-Z','recorded_loaner','2027-03-11','PROC-SOURCE-C']],
 events:[['E1','A1','recorded_visit','2026-09-10','2027-01-09','recorded_complete','REPORT-1','PROC-SOURCE-A','Recorded administrative note only; see original report.','TECH-A'],['E2','A2','recorded_repair','2026-09-11','2027-02-10','recorded_follow_up','REPORT-2','PROC-SOURCE-B','Parts follow-up recorded by source.','TECH-B'],['E3','A2','recorded_return_visit','2026-09-13','2027-02-10','recorded_complete','REPORT-3','PROC-SOURCE-B','Return visit exists as a separate source event.','TECH-B']]
 },maps={facilities:{F1:'RF1',F2:'RF2'},assets:{A1:'RA1',A2:'RA2',L1:'RL1'},events:{E1:'RE1',E2:'RE2',E3:'RE3'}};
 for(const kind of C.KINDS){const content='\ufeff'+CSV.csv([C.FIELDS[kind],...all[kind]]),mapping=Object.fromEntries(C.FIELDS[kind].map(k=>[k,k]));w=C.importExtract(w,{kind,side:'source',name:'authored-source-'+kind+'.csv',content,mapping,at:'2026-10-15T00:00:00Z'});}
 const correct={};for(const kind of C.KINDS){correct[kind]=all[kind].map(row=>row.slice());for(const row of correct[kind]){row[0]=maps[kind][row[0]];if(kind==='assets')row[1]=maps.facilities[row[1]];if(kind==='events')row[1]=maps.assets[row[1]];}}
 const first=C.clone(correct);first.assets[1][1]='RF2';first.assets[1][3]='SER-002-changed';first.events[1][1]='RL1';first.events[2][3]='2026-09-14';first.events[2][6]='';
 for(const kind of C.KINDS){const mapping=Object.fromEntries(C.FIELDS[kind].map(k=>[k,k]));w=C.importExtract(w,{kind,side:'returned',name:'authored-first-returned-'+kind+'.csv',content:CSV.csv([C.FIELDS[kind],...first[kind]]),mapping,at:'2026-10-15T00:01:00Z'});w=C.crosswalk(w,kind,Object.entries(maps[kind]).map(([source_id,target_id])=>({source_id,target_id})));}
 const initial=C.clone(w),firstResult=C.analyze(w);
 for(const kind of C.KINDS)w=C.importExtract(w,{kind,side:'returned',name:'authored-corrected-returned-'+kind+'.csv',content:CSV.csv([C.FIELDS[kind],...correct[kind]]),mapping:Object.fromEntries(C.FIELDS[kind].map(k=>[k,k])),at:'2026-10-15T00:02:00Z'});
 w.config.returned_scope='Corrected authored edition of the same two facilities, three assets and three events; all originals and first returned editions retained.';
 return{initial,firstResult,corrected:w,correctedResult:C.analyze(w)};
}
module.exports={make};
