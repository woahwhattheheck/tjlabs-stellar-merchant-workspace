'use strict';
const S=require('../schema.cjs'),E=require('../procurement-engine.cjs'),T=require('../study-time.cjs'),Effort=require('../procurement-effort.cjs'),CSV=require('../csv.cjs'),SHA=require('../sha256.cjs'),Binary=require('../binary.cjs');
const phases=Effort.phases,clone=x=>JSON.parse(JSON.stringify(x)),instant=(day,h='09:00')=>'2026-'+day+'T'+h+':00Z';
function build(){
 const records=Object.fromEntries(S.KINDS.map(k=>[k,[]])),documents=[];
 const document=(id,text,available_at)=>{const name=id+'.txt',d=SHA.sha256Utf8(text),docId='document-'+SHA.sha256Utf8(JSON.stringify([name,d.sha256])).sha256.slice(0,32);if(!documents.some(d=>d.id===docId))documents.push({id:docId,name,text,media_type:'text/plain',available_at});return docId;};
 const foundation=instant('08-01'),start=instant('10-01','00:00'),end=instant('10-08','00:00'),cut=instant('10-12','00:00');
 const add=(kind,id,fields={},at=foundation)=>{const row=Object.fromEntries(S.FIELDS[kind].map(k=>[k,'']));Object.assign(row,{id,record_key:id,revision:'1',record_status:'active',recorded_at:at,available_at:at,source_ref:'authored/'+kind+'/'+id},fields);if(!row[S.IDS[kind]])row[S.IDS[kind]]=id;row.source_document_id=document(id,JSON.stringify({data_class:'authored_course',kind,record_id:id,observed_fields:fields},null,2)+'\n',at);records[kind].push(row);return row;};
 const memo={};
 add('operators','OP',{operator_id:'OP',name:'Authored Meridian Components',valid_from:foundation});
 add('sites','SITE',{site_id:'SITE',operator_id:'OP',name:'North works',valid_from:foundation});
 for(const person of['PROC','FIN','DATA'])add('people',person,{person_id:person,operator_id:'OP',name:person==='PROC'?'Pat Morgan':person==='FIN'?'Alex Chen':'Sam Reed',valid_from:foundation});
 for(const [person,permission]of[['PROC','procurement'],['FIN','finance'],['DATA','data'],['PROC','operations']])add('authorities','AUTH-'+person+'-'+permission,{person_id:person,permission,operator_id:'OP',site_id:'',granted_by:'FIN',granted_at:foundation,valid_from:foundation});
 add('suppliers','SUP',{supplier_id:'SUP',operator_id:'OP',name:'Authored supply partner',legal_identity:'AUTHORED-CO-001',valid_from:foundation});
 for(const [id,unit,spec]of[['ITEM1','each','spec-A'],['ITEM2','kg','grade-B'],['ITEM3','each','new-service']])add('items',id,{item_id:id,operator_id:'OP',name:id,base_unit:unit,specification:spec,valid_from:foundation});
 const methodDoc=document('method','Authored Finance policy. Report realized price, new-price volume and interaction separately. Subtract actual one-time and recurring costs. Avoidance is not price realization or cash. Scope normalization and currency treatment need named evidence.',foundation);
 add('policies','POL',{operator_id:'OP',reporting_currency:'USD',effect_method:'current_price_volume_with_interaction',one_time_treatment:'subtract',recurring_treatment:'subtract',method_document_id:methodDoc,approved_by:'FIN',approved_at:foundation,valid_from:foundation});
 add('unit_conversions','PACK',{item_id:'ITEM2',unit:'pack',base_unit:'kg',factor_to_base:'10',basis_document_id:document('pack-definition','One contractual pack contains exactly 10 kg of grade-B.',foundation),valid_from:foundation});
 for(const [id,rate]of[['FX-C','1.2'],['FX-A','1.3']])add('fx_rates',id,{operator_id:'OP',from_currency:'EUR',to_currency:'USD',rate_to_target:rate,observed_at:foundation,valid_from:foundation,basis_document_id:document(id+'-basis','Authored supplied '+id+' USD per EUR rate '+rate+'. No market-rate claim.',foundation),approved_by:'FIN',approved_at:foundation});
 const atI=instant('09-01'),atB=instant('09-02'),atBR=instant('09-03'),atT=instant('09-04'),atF=instant('09-05');
 const configs=[
  {n:1,item:'ITEM1',base:'100',baseUnit:'each',term:'92',unit:'each',currency:'USD',planned:'10000',forecast:'80000',spec:'spec-A'},
  {n:2,item:'ITEM2',base:'500',baseUnit:'pack',term:'55',unit:'kg',currency:'EUR',planned:'200',forecast:'-1000',spec:'grade-B'},
  {n:3,item:'ITEM3',base:'120',baseUnit:'each',term:'90',unit:'each',currency:'USD',planned:'100',forecast:'3000',spec:'new-service'},
  {n:4,item:'ITEM3',base:'120',baseUnit:'each',term:'90',unit:'each',currency:'USD',planned:'40',forecast:'1200',spec:'new-service'}
 ];
 for(const c of configs){
  const i=add('initiatives','I'+c.n,{initiative_id:'I'+c.n,operator_id:'OP',site_id:'SITE',owner_id:'PROC',description:['','Component purchase price','Imported grade-B terms','Service scope normalization','Paused secondary allocation'][c.n],category:c.item,started_at:atI,policy_record_id:'POL'},atI);
  add('initiative_events','STATE'+c.n,{initiative_record_id:i.id,event_at:atI,state:c.n===4?'paused':'active',actor_id:'PROC',reason:c.n===4?'Actual programme pause; prior activity and purchases remain in scope':'Actual started initiative'},atI);
  const old=add('spend_lines','BASE-AP'+c.n,{operator_id:'OP',site_id:'SITE',source_system:'AP',external_transaction_ref:'OLD-'+c.n,external_line_ref:'1',transaction_at:instant('08-10'),posted_at:instant('08-11'),supplier_ref:'SUP legacy label',contract_ref:'old-contract-'+c.n,item_ref:c.item,quantity:'10',unit:c.baseUnit,unit_price:c.base,net_amount:String(Number(c.base)*10),currency:c.currency},instant('08-11'));
  const b=add('baselines','B'+c.n,{initiative_record_id:i.id,item_id:c.item,baseline_kind:'historical_paid',period_start:instant('08-01','00:00'),period_end:instant('09-01','00:00'),unit_price:c.base,unit:c.baseUnit,currency:c.currency,specification:c.n===3?'old-service':c.spec,delivery_terms:'delivered',payment_terms:'net30',inputs_complete:'true',expected_inputs:'1',prepared_by:'PROC'},atB);
  const bi=add('baseline_inputs','BI'+c.n,{baseline_record_id:b.id,family:'spend_lines',record_id:old.id,row_sha256:E.hashRow(old)},atB);
  add('baseline_reviews','BR'+c.n,{baseline_record_id:b.id,baseline_basis_sha256:E.baselineBasis(b,[bi]),reviewed_at:atBR,reviewed_by:'FIN',decision:'accepted',comparability:c.n===3?'normalized':'comparable',notes:'Actual authored Finance decision on exact evidence'},atBR);
  const term=add('commercial_terms','T'+c.n,{initiative_record_id:i.id,supplier_id:'SUP',item_id:c.item,unit_price:c.term,unit:c.unit,currency:c.currency,specification:c.spec,delivery_terms:'delivered',payment_terms:'net30',valid_from:instant('10-01','00:00'),agreed_by:'PROC',agreed_at:atT},atT);
  add('forecasts','F'+c.n,{initiative_record_id:i.id,baseline_record_id:b.id,term_record_id:term.id,approved_at:atF,approved_by:'FIN',period_start:start,period_end:end,planned_quantity:c.planned,unit:c.unit,forecast_amount:c.forecast,currency:c.currency,notes:'Original approved forecast; recomputed comparable forecast is separate'},atF);
  memo[c.n]={i,b,term,c};
 }
 add('scope_adjustments','SCOPE3',{baseline_record_id:'B3',term_record_id:'T3',amount_per_base_unit:'20',currency:'USD',basis_document_id:document('scope-basis','Finance attributes USD 20 per unit of prior price to a removed service. Reduce comparable baseline 120 to 100.',atF),approved_at:atF,approved_by:'FIN',reason:'Explicit removed service component'},atF);
 const spendAt=instant('10-03'),posted=instant('10-04'),mappingAt=instant('10-05'),reviewAt=instant('10-06','09:00'),assignedAt=instant('10-06','09:05');
 const purchases=[
  ['SP1','8000','each','92','736000','USD','ITEM1'],
  ['SP2','100','kg','55','5500','EUR','ITEM2'],
  ['SP3','100','each','90','9000','USD','ITEM3']
 ];
 for(const [id,quantity,unit,unit_price,net_amount,currency,item]of purchases)add('spend_lines',id,{operator_id:'OP',site_id:'SITE',source_system:'AP',external_transaction_ref:'INV-'+id,external_line_ref:'1',transaction_at:spendAt,posted_at:posted,supplier_ref:'S-001',contract_ref:'C-'+item,item_ref:item,quantity,unit,unit_price,net_amount,currency},posted);
 const sp1=records.spend_lines.find(x=>x.id==='SP1');add('spend_lines','SP1-ALIAS',{...sp1,id:'SP1-ALIAS',record_key:'SP1-ALIAS',spend_id:'SP1-ALIAS',source_ref:'authored/export-2/same-economic-invoice'},posted);
 const mapping=(n,sp,quantity)=>{const m=add('mapping_cases','MAP'+n,{spend_record_id:sp,initiative_record_id:'I'+n,supplier_id:'SUP',term_record_id:'T'+n,item_id:memo[n].c.item,decided_at:mappingAt,inputs_complete:'true',expected_inputs:'5',proposed_by:'PROC'},mappingAt);
  const sources=[['spend_lines',sp],['initiatives','I'+n],['commercial_terms','T'+n],['suppliers','SUP'],['items',memo[n].c.item]];
  const ins=sources.map(([family,id],k)=>add('mapping_inputs','MI'+n+'-'+k,{mapping_case_record_id:m.id,family,record_id:id,row_sha256:E.hashRow(records[family].find(r=>r.id===id))},mappingAt));
  const mr=add('mapping_reviews','MR'+n,{mapping_case_record_id:m.id,mapping_basis_sha256:E.mappingBasis(m,ins),reviewed_at:reviewAt,reviewed_by:'PROC',decision:'accepted',notes:'Named mapping from supplier/contract/item labels'},reviewAt);
  return add('assignments','A'+n,{spend_record_id:sp,initiative_record_id:'I'+n,mapping_review_record_id:mr.id,assigned_quantity:quantity,unit:memo[n].c.unit,assigned_at:assignedAt,assigned_by:'PROC'},assignedAt);
 };
 mapping(1,'SP1','8000');mapping(2,'SP2','100');mapping(3,'SP3','80');mapping(4,'SP3','20');
 const creditAt=instant('10-06','10:00'),attrAt=instant('10-07','09:00');
 add('spend_adjustments','CREDIT1',{spend_record_id:'SP1',source_system:'AP',external_transaction_ref:'CN-001',external_line_ref:'1',posted_at:creditAt,kind:'return',quantity_delta:'-100',amount_delta:'-9200',unit:'each',currency:'USD',reason:'Actual returned 100 components'},creditAt);
 add('adjustment_assignments','CA1',{adjustment_record_id:'CREDIT1',assignment_record_id:'A1',quantity_delta:'-100',amount_delta:'-9200',unit:'each',currency:'USD',attributed_at:attrAt,attributed_by:'PROC'},attrAt);
 const costAt=instant('10-07','10:00'),allocationDoc=document('shared-cost','USD 3,000 original recurring transaction. Explicit approved allocations: initiative I1 USD 2,000 and I2 USD 1,000. No inferred split.',costAt);
 for(const [id,n,kind,amount,total,key,ref]of[['COST-SETUP',1,'one_time','10000','10000','I1','SETUP-001'],['COST-SHARED1',1,'recurring','2000','3000','I1','SHARED-001'],['COST-SHARED2',2,'recurring','1000','3000','I2','SHARED-001']])add('costs',id,{initiative_record_id:'I'+n,posted_at:costAt,kind,amount,transaction_amount:total,allocation_key:key,currency:'USD',source_system:'AP',external_transaction_ref:ref,external_line_ref:'1',period_start:start,period_end:end,allocation_basis_document_id:allocationDoc,posted_by:'FIN'},costAt);
 add('avoidance_cases','AV2',{initiative_record_id:'I2',term_record_id:'T2',future_unit_price:'60',unit:'kg',currency:'EUR',period_start:start,period_end:end,quantity:'100',basis_document_id:document('future-price','Authored supplier notice: future price EUR 60/kg. Current contracted price EUR 55/kg. Only 100 kg documented for the avoidance comparison.',atF),approved_at:atF,approved_by:'FIN',reason:'Documented future price; separate from actual price increase'},atF);
 for(const [family,id,at]of[['baselines','B2',atF],['commercial_terms','T2',atF],['spend_lines','SP2',mappingAt],['avoidance_cases','AV2',atF]])add('currency_treatments','FXT-'+id,{source_family:family,source_record_id:id,reporting_currency:'USD',actual_rate_record_id:'FX-A',constant_rate_record_id:'FX-C',approved_by:'FIN',approved_at:at,reason:'Explicit authored constant-versus-actual currency comparison'},at);
 for(let n=1;n<=4;n++)add('population_members','MEM'+n,{member_id:'MEM'+n,family:'initiatives',record_id:'I'+n,operator_id:'OP',site_id:'SITE',population_key:'weekly-reconciliation',included:'true'},atI);
 let slot=0;for(let n=1;n<=4;n++)for(let p=0;p<phases.length;p++)for(const method of['existing_process','study_process']){
  const minutes=method==='existing_process'?[8,8,6,12,5,4,5,2][p]:[6,6,4,8,4,3,7,4][p],day=method==='existing_process'?'09-10':'10-10',position=(n-1)*8+p,base=Date.parse(instant(day,'08:00'))+position*20*60000,a=new Date(base).toISOString(),b=new Date(base+minutes*60000).toISOString();
  add('effort','E-'+(++slot),{member_id:'MEM'+n,phase:phases[p],method,person_id:'PROC',started_at:a,ended_at:b,person_minutes:String(minutes),work_key:method+'-I'+n+'-'+phases[p],matched_group_id:'matched-I'+n+'-'+phases[p],population_complete:'true',phase_complete:'true'},b);
 }
 const calcAt=instant('10-09','12:00'),inputAt=instant('10-09','11:00'),excluded=new Set(['calculation_cases','calculation_inputs','submissions','finance_reviews','population_members','effort']);
 for(let n=1;n<=3;n++){
  const sources=S.KINDS.filter(k=>!excluded.has(k)).flatMap(family=>records[family].filter(r=>Date.parse(r.available_at)<=Date.parse(calcAt)).map(row=>({family,row})));
  const c=add('calculation_cases','CALC'+n,{initiative_record_id:'I'+n,decided_at:calcAt,period_start:start,period_end:end,policy_record_id:'POL',baseline_record_id:'B'+n,term_record_id:'T'+n,forecast_record_id:'F'+n,inputs_complete:'true',expected_inputs:String(sources.length),generated_by:'PROC'},calcAt);
  const ins=sources.map(({family,row},j)=>add('calculation_inputs','CI'+n+'-'+j,{calculation_case_record_id:c.id,family,record_id:row.id,row_sha256:E.hashRow(row)},inputAt));
  const amount=n===1?['63200','51200','0']:n===2?['-600','-1600','600']:['800','800','0'];
  const sub=add('submissions','SUB'+n,{calculation_case_record_id:c.id,calculation_basis_sha256:E.calculationBasis(c,ins),submitted_at:instant('10-09','12:10'),submitted_by:'PROC',price_amount:amount[0],net_amount:amount[1],avoidance_amount:amount[2],currency:'USD',notes:'Actual authored procurement submission; source amounts preserved'},instant('10-09','12:10'));
  add('finance_reviews','FIN'+n,{submission_record_id:sub.id,submission_sha256:E.hashRow(sub),reviewed_at:instant('10-09','12:30'),reviewed_by:'FIN',decision:n===3?'rejected':'accepted',approved_price_amount:n===3?'':amount[0],approved_net_amount:n===3?'':amount[1],approved_avoidance_amount:n===3?'':amount[2],currency:'USD',notes:n===3?'Finance rejects claim recognition under supplied policy; arithmetic retained':'Named actual Finance acceptance'},instant('10-09','12:30'));
  if(n===1)add('finance_reviews','FIN1-ADJUSTED',{submission_record_id:sub.id,submission_sha256:E.hashRow(sub),reviewed_at:instant('10-10','18:00'),reviewed_by:'FIN',decision:'adjusted',approved_price_amount:'63000',approved_net_amount:'51000',approved_avoidance_amount:'0',currency:'USD',notes:'Finance retains USD 200 outside accepted scope; exact prior submission and earlier acceptance remain.'},instant('10-10','18:00'));
 }
 const plan={side:'returned',as_of:cut,population_start:start,population_end:end,operator_id:'OP',site_id:'SITE',population_key:'weekly-reconciliation',population_complete:true,expected_members:4,source_population_complete:true,expected_counts:Object.fromEntries(S.KINDS.map(k=>[k,records[k].length])),required_review_roles:['procurement','finance'],required_effort_phases:phases.slice(),baseline_method:'existing_process',current_method:'study_process',notes:'Four consecutive fictional initiatives, including a paused unresolved initiative. One economic shared purchase and one independently allocated cost. All actual quantities and currency rates are authored, not operating claims.'};
 return{schema:'procurement.authored-course/v1',records,documents,plan};
}
function optionsFor(f){return{as_of:f.plan.as_of,operator_id:f.plan.operator_id,site_id:f.plan.site_id,population_complete:true,expected_counts:Object.fromEntries(S.KINDS.map(k=>[k,f.records[k].length])),extract_available_at:Object.fromEntries(S.KINDS.map(k=>[k,f.plan.as_of])),document:(id,at)=>{const ds=f.documents.filter(d=>d.id===id);return ds.length===1&&T.time(ds[0].available_at)<=T.time(at)?ds[0]:null;}};}
function buildStudy(Core,f=build()){
 let w=Core.empty('Complete authored procurement reconciliation');w.id='authored-procurement-complete';w.config.data_class='authored_course';w.config.source_scope='Complete fictional original tracker, AP, agreements, source evidence and actual named review histories';w.config.returned_scope='The same supplied records after explicit source mapping; no production integration or operating claim';w.config.authority_notes='All names, amounts and source documents are authored training records';w.config.procurement=clone(f.plan);
 for(const d of f.documents){w=Core.addDocument(w,{name:d.name,media_type:d.media_type,bytes:require('../text.cjs').encode(d.text),at:f.plan.as_of,available_at:d.available_at,notes:'Authored source original'});if(!w.documents.some(x=>x.id===d.id))throw Error('Authored document ID differs from actual Core identity');}
 for(const side of['source','returned'])for(const kind of S.KINDS){const content=CSV.csv([S.FIELDS[kind],...f.records[kind].map(r=>S.FIELDS[kind].map(k=>r[k]))]);w=Core.importExtract(w,{kind,side,name:side+'-'+kind+'.csv',content,mapping:Object.fromEntries(S.FIELDS[kind].map(k=>[k,k])),label:'Complete authored '+kind,at:f.plan.as_of,available_at:f.plan.as_of});}
 for(const kind of S.KINDS)w=Core.matchIds(w,kind);
 w.document_links=['source','returned'].flatMap(side=>S.KINDS.flatMap(kind=>f.records[kind].map(row=>({side,kind,record_id:row.id,document_id:row.source_document_id,notes:'Explicit authored original attached to this retained record',available_at:row.available_at}))));return Core.validate(w);
}
module.exports={build,optionsFor,buildStudy};
