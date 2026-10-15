'use strict';
const SHA=require('../sha256.cjs'),T=require('../study-time.cjs');
function append(fixture,family,row){fixture.records[family].push(row);const text=JSON.stringify({data_class:'authored_course',family,record:row},null,2);fixture.documents.push({id:row.source_document_id,available_at:row.available_at,text,sha256:SHA.sha256Utf8(text).sha256});}
function run(Engine=require('../distribution-engine.cjs'),Course=require('../distribution-course.cjs')){
 const base=Course.bindEngine(Course.build(),Engine),clone=()=>JSON.parse(JSON.stringify(base)),cases=[];
 const A=clone(),ra=A.records.certificate_reviews.find(x=>x.id==='CR-A');
 append(A,'certificate_reviews',{...ra,id:'CR-A-CONTRADICTORY',record_key:'CR-A-CONTRADICTORY',certificate_review_id:'CR-A-CONTRADICTORY',source_document_id:'SRC-CR-A-CONTRADICTORY',source_ref:'Authored contradictory actual review',decision:'rejected'});
 const ar=Engine.analyze(A.records,Course.optionsFor(A)),a=ar.readiness('LOT-A','W-EAST');
 cases.push({name:'Conflicting simultaneous certificate reviews cannot leave release supported',pass:!a.eligible,actual:a});
 const B=clone(),rb=B.records.decision_reviews.find(x=>x.id==='REVIEW-EAST-SAFE');
 append(B,'decision_reviews',{...rb,id:'REVIEW-SAFE-CONTRADICTORY',record_key:'REVIEW-SAFE-CONTRADICTORY',decision_review_id:'REVIEW-SAFE-CONTRADICTORY',source_document_id:'SRC-REVIEW-SAFE-CONTRADICTORY',source_ref:'Authored contradictory actual review',decision:'rejected'});
 const br=Engine.analyze(B.records,Course.optionsFor(B)),b=br.decision('DECISION-EAST-SAFE');
 cases.push({name:'Conflicting simultaneous operations reviews cannot preserve accepted decision',pass:!b.accepted,actual:{complete:b.complete,accepted:b.accepted,issues:b.issues,selected_review:b.review?.id||null}});
 const C=clone(),rc={...C.records.order_events[0],id:'ORDER-3-UNMAPPED',record_key:'ORDER-3-UNMAPPED',order_event_id:'ORDER-3-UNMAPPED',order_line_record_id:'ORDER-3',event_at:'2026-10-01T10:00:00Z',recorded_at:'2026-10-01T10:00:00Z',available_at:'2026-10-01T10:00:00Z',source_document_id:'SRC-ORDER-3-UNMAPPED',source_ref:'Authored unmapped order status',state:'unmapped_status',reason:'Retained source state not mapped to operating vocabulary'};
 append(C,'order_events',rc);
 const cr=Engine.analyze(C.records,Course.optionsFor(C)),at=Date.parse('2026-10-01T10:06:00Z'),c=cr.eligibility('ORDER-3','LOT-A',at,at,'POL-W-EAST');
 cases.push({name:'Unresolved linked order state cannot silently default to open eligibility',pass:!c.eligible,actual:c});
 const D=clone(),rd={...D.records.lot_state_events.find(x=>x.id==='RELEASE-A'),id:'A-UNKNOWN-QA',record_key:'A-UNKNOWN-QA',state_event_id:'A-UNKNOWN-QA',event_at:'2026-10-01T10:00:00Z',recorded_at:'2026-10-01T10:00:00Z',available_at:'2026-10-01T10:00:00Z',state:'unmapped_state',expected_inputs:'0',source_document_id:'SRC-A-UNKNOWN-QA',source_ref:'Authored retained unknown QA state'};
 append(D,'lot_state_events',rd);
 const dr=Engine.analyze(D.records,Course.optionsFor(D)),d=dr.readiness('LOT-A','W-EAST',at,at);
 cases.push({name:'Unresolved later QA state cannot silently reuse earlier release',pass:!d.eligible,actual:d});
 return T.reveal({schema:'distribution.business-peer.v1',cases,pass:cases.every(x=>x.pass)});
}
module.exports={run};
