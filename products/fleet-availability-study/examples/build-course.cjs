'use strict';
const Course=require('../fleet-course.cjs'),Core=require('../core.cjs'),Fleet=require('../fleet.cjs'),Engine=require('../fleet-engine.cjs'),CSV=require('../csv.cjs'),ZIP=require('../zip.cjs'),Session=require('../session.cjs');
const CAPTURE='2026-10-02T00:00:00Z';
function buildStudy(fixture=Course.build()){
 const f=JSON.parse(JSON.stringify(fixture));let w=Core.empty(f.plan.title);
 w.id='study-authored-fleet-four-vehicles';
 w.config.data_class='authored_course';
 w.config.source_scope='Fictional original depot records for four physical vehicles; complete consecutive depot population and all declared source families.';
 w.config.returned_scope='Fictional receiving projection of the same exact source records, documents and historical identities.';
 w.config.authority_notes='Every name, vehicle, event, document and monetary amount in this course is authored. Real release authority remains with the actual operator.';
 w.config.fleet={...Fleet.empty(),...f.plan,side:'returned',operator_id:'OP',depot_id:'DEPOT',source_population_complete:true,selection_notes:'Every physical vehicle present during the declared depot window is included; V4 unknown readiness remains in the denominator.',measurement_notes:'Paired authored active-person observations include all eight phases, increased safety-review work and exact signed change; no downtime-to-cash inference.',expected_counts:Object.fromEntries(Object.entries(f.records).map(([kind,rows])=>[kind,rows.length]))};
 const ids={};
 for(const d of f.documents){const before=new Set(w.documents.map(x=>x.id));w=Core.addDocument(w,{name:d.id+'.txt',media_type:'text/plain',bytes:ZIP.utf(d.text),at:CAPTURE,available_at:d.available_at,notes:'Authored original identity '+d.id});ids[d.id]=w.documents.find(x=>!before.has(x.id)).id;}
 for(const rs of Object.values(f.records))for(const row of rs)for(const field of ['source_document_id','method_document_id'])if(row[field])row[field]=ids[row[field]];
 for(const x of f.records.release_inputs)x.row_sha256=Engine.hashRow(f.records[x.family].find(y=>y.id===x.record_id));
 for(const x of f.records.release_reviews){const c=f.records.release_cases.find(y=>y.id===x.release_case_record_id),rr=f.records.release_requirements.filter(y=>y.release_case_record_id===c.id),ii=f.records.release_inputs.filter(y=>y.release_case_record_id===c.id);x.release_basis_sha256=Engine.releaseBasis(c,rr,ii);}
 for(const side of ['source','returned'])for(const kind of Core.KINDS){
  const fields=Core.FIELDS[kind],content=CSV.csv([fields,...f.records[kind].map(row=>fields.map(k=>row[k]))]);
  w=Core.importExtract(w,{kind,side,name:side+'-'+kind+'.csv',content,mapping:Object.fromEntries(fields.map(k=>[k,k])),label:'Authored '+side+' '+kind,at:CAPTURE,available_at:CAPTURE});
 }
 for(const kind of Core.KINDS)w=Core.matchIds(w,kind);
 // Links select the exact original retained bytes; the canonical cells also retain their document identity.
 for(const side of ['source','returned'])for(const kind of Core.KINDS)for(const row of f.records[kind])w.document_links.push({side,kind,record_id:row.id,document_id:row.source_document_id,available_at:row.available_at,notes:'Exact authored source original'});
 w.notes='The imported source retains all future-known rows as source history. The selected 2 October 00:00 cutoff excludes the later V2 wording revision until its actual 01:00 availability. Raw fixture input IDs map to retained document identities through the file names and notes.';
 return Core.validate(w);
}
function run(preparedStudy=null){
 const checks=[],check=(name,pass,details={})=>{checks.push({name,pass:!!pass,...details});if(!pass)throw Error(name);};
 const fixture=Course.build(),study=preparedStudy?Core.validate(Core.clone(preparedStudy)):buildStudy(fixture),r=Core.analyze(study),f=r.fleet;
 check('All 29 complete canonical original and returned families import with exact mappings',Core.KINDS.length===29&&study.extracts.length===58&&study.originals.length===58&&r.findings.length===0,{originals:study.originals.length,documents:study.documents.length});
 check('Four physical members retain overlapping downtime and unknown readiness',f.population.complete&&f.population.observed===4&&f.availability.eligible_vehicle_minutes.numerator==='2880'&&f.availability.available_vehicle_minutes.numerator==='1245'&&f.availability.unavailable_vehicle_minutes.numerator==='915'&&f.availability.unknown_vehicle_minutes.numerator==='720'&&f.availability.fraction===null);
 check('Required part and both exact named reviews support one release while the second fault remains open',f.operating.releases[0].valid&&f.operating.parts.find(x=>x.part_request_record_id==='PART-V1').complete&&!f.operating.parts.find(x=>x.part_request_record_id==='PART-V2').complete&&f.operating.fault_metrics.completed_episodes===1&&f.operating.fault_metrics.open_episodes===1);
 check('Actual substituted and repaired-vehicle duties preserve cancellation, departure, completion and return',f.duties.length===2&&f.duties.every(x=>x.fulfilment_complete)&&f.duties[0].assignments.some(x=>x.cancelled)&&f.duties[0].assignments.some(x=>x.substitutes_assignment_record_id==='ASSIGN-V2'&&x.execution_complete));
 check('All members and eight recurring work phases preserve signed change including increased safety review',f.effort.complete&&f.effort.baseline.numerator==='192'&&f.effort.current.numerator==='128'&&f.effort.change.numerator==='-64'&&f.effort.records.filter(x=>x.method==='study_process'&&x.phase==='safety_review').every(x=>x.person_minutes==='8'));
 let session=Session.create(study);const draft={kind:'availability_events',side:'returned',pending_csv:'id,notes\r\nPENDING,"Unfinished original\nwith two lines"\r\n',mapping:{unresolved:'retain'}};session=Session.draft(session,'intake:availability_events:returned',draft);
 const old=Core.digest(session.study),edited=Core.clone(study),selected=Core.selected(study,'availability_events','returned'),original=study.originals.find(x=>x.id===selected.original_id),t=CSV.table(original.content),rows=t.rows.map(x=>x.values.slice()),column=t.header.indexOf('reason'),id=t.header.indexOf('id');rows.find(x=>x[id]==='OPENING-V4')[column]='Corrected authored uncertainty explanation; readiness remains unknown.';
 const successor=Core.importExtract(edited,{kind:'availability_events',side:'returned',name:'returned-availability-correction.csv',content:CSV.csv([t.header,...rows]),mapping:selected.mapping,at:'2026-10-02T00:10:00Z',available_at:'2026-10-02T00:00:00Z',label:'Retained corrected source edition'});
 session=Session.checkpoint(session,successor,'Authored receiving correction retains the original selected edition and unfinished form');
 check('Source correction retains prior selection and complete unfinished CSV/mapping draft',session.study.originals.length===59&&session.history.length===1&&Core.digest(Session.historyStudy(session,session.history[0]))===old&&JSON.stringify(session.drafts['intake:availability_events:returned'])===JSON.stringify(draft));
 const reopened=Session.normalize(JSON.parse(Core.json(session)));
 check('Complete portable session reopens original history and unfinished form',Core.digest(reopened.study)===Core.digest(session.study)&&JSON.stringify(reopened.drafts)===JSON.stringify(session.drafts)&&Core.digest(Session.historyStudy(reopened,reopened.history[0]))===old);
 const output=Session.exports(reopened);
 check('Ordinary exports retain full session, all original CSV and document bytes, and readable fleet report',output.some(x=>x.path==='session.json')&&output.some(x=>x.path==='fleet/report.md'&&x.content.includes('Complete recurring work'))&&output.filter(x=>x.path.startsWith('originals/')&&x.path.endsWith('.txt')).length===59&&output.some(x=>x.path==='documents/index.json'),{export_members:output.length});
 return{checks,study,result:r,session:reopened,export_summary:output.map(x=>({path:x.path,bytes:typeof x.content==='string'?ZIP.utf(x.content).length:x.bytes.length}))};
}
module.exports={buildStudy,run};
