'use strict';
const {FIELDS,IDS,KINDS}=require('./commerce-schema.cjs'),R=require('./rational.cjs'),T=require('./study-time.cjs'),SHA=require('./sha256.cjs');
const hash=x=>SHA.sha256Utf8(JSON.stringify(Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])))).sha256,uniq=xs=>[...new Set(xs)],iso=t=>new Date(t).toISOString();
const nonnegative=x=>{try{const r=R.dec(x);return r.n>=0n?r:null;}catch{return null;}},positive=x=>{const r=nonnegative(x);return r&&r.n>0n?r:null;};
const integer=x=>typeof x==='string'&&/^(0|[1-9]\d*)$/.test(x)&&x.length<16?Number(x):null;
const currency=x=>typeof x==='string'&&/^[A-Z]{3}$/.test(x);
const atOrBefore=(s,t)=>T.time(s)!==null&&T.time(s)<=t;
function hashRow(kind,row){const z=row.values||row;return hash(Object.fromEntries(FIELDS[kind].map(k=>[k,Object.prototype.hasOwnProperty.call(z,k)?z[k]:null])));}
function analyze(records,options){
 if(!options||T.time(options.as_of)===null||typeof options.resolve!=='function'||typeof options.document!=='function')throw Error('Explicit cutoff, historical context resolver and original document resolver required');
 const cut=T.time(options.as_of),families={},cache=new Map(),checks=new Map(),issues=[];
 const add=(code,family,id,detail)=>{issues.push({code,family,id,detail});return code;};
 for(const kind of KINDS){if(!Array.isArray(records[kind]))throw Error('Missing complete canonical family '+kind);
  families[kind]=records[kind].map((row,index)=>{const z=row.values||row;return{values:Object.fromEntries(FIELDS[kind].map(k=>[k,Object.prototype.hasOwnProperty.call(z,k)?z[k]:null])),source:row.source||null,extract_available_at:row.extract_available_at??options.extract_available_at?.[kind]??null,index};});
 }
 function known(r,t){const z=r.values,a=T.time(z.available_at),d=T.time(z.recorded_at),x=T.time(r.extract_available_at);return a!==null&&d!==null&&d<=a&&a<=t&&x!==null&&x<=t;}
 function view(kind,t){const key=kind+'\0'+t;if(cache.has(key))return cache.get(key);const all=families[kind].filter(r=>known(r,t)),byId=new Map(),groups=new Map(),es=[];
  for(const r of all){const id=r.values.id;if(!byId.has(id))byId.set(id,[]);byId.get(id).push(r);}
  const validBase=r=>{const z=r.values;return typeof z.id==='string'&&z.id&&byId.get(z.id)?.length===1&&typeof z.record_key==='string'&&z.record_key&&/^[1-9]\d*$/.test(z.revision||'')&&['active','void'].includes(z.record_status)&&typeof z.source_ref==='string'&&z.source_ref.trim();};
  const chainCache=new Map();function validChain(r){if(chainCache.has(r.values.id))return chainCache.get(r.values.id);chainCache.set(r.values.id,false);const z=r.values;if(!validBase(r))return false;if(!z.supersedes_id){const ok=z.revision==='1';chainCache.set(z.id,ok);return ok;}const ps=byId.get(z.supersedes_id),p=ps?.length===1?ps[0]:null;const ok=!!p&&validBase(p)&&p.values.record_key===z.record_key&&BigInt(p.values.revision)<BigInt(z.revision)&&T.time(p.values.recorded_at)<=T.time(z.recorded_at)&&validChain(p);chainCache.set(z.id,ok);return ok;}
  for(const r of all){const z=r.values;let ok=validBase(r);if(!ok){es.push({code:'RECORD_IDENTITY_UNRESOLVED',id:z.id});continue;}
   if(z.supersedes_id){const p=byId.get(z.supersedes_id)?.length===1?byId.get(z.supersedes_id)[0]:null;if(!p||!validBase(p)||p.values.record_key!==z.record_key||BigInt(p.values.revision)>=BigInt(z.revision)||T.time(p.values.recorded_at)>T.time(z.recorded_at))ok=false;}
   else if(z.revision!=='1')ok=false;
   if(!ok||!validChain(r)){es.push({code:'REVISION_PREDECESSOR_UNRESOLVED',id:z.id});continue;}
   if(!groups.has(z.record_key))groups.set(z.record_key,[]);groups.get(z.record_key).push(r);
  }
  const current=[];for(const rs of groups.values()){const superseded=new Set(rs.map(r=>r.values.supersedes_id).filter(Boolean)),leaves=rs.filter(r=>!superseded.has(r.values.id));if(leaves.length!==1){for(const r of leaves)es.push({code:'REVISION_AMBIGUOUS',id:r.values.id});continue;}if(leaves[0].values.record_status==='active')current.push(leaves[0]);}
  const result={all,current,issues:es,exact:id=>{const xs=all.filter(r=>r.values.id===id);return xs.length===1&&validChain(xs[0])?xs[0]:null;},get:id=>{const xs=current.filter(r=>r.values[IDS[kind]]===id);return xs.length===1?xs[0]:null;}};
  cache.set(key,result);return result;
 }
 function ctx(kind,id,t){if(!id||!Number.isFinite(t))return null;const x=options.resolve(kind,id,iso(t));const key={case:'case_id',asset:'asset_id',person:'person_id',work:'work_id'}[kind];return x&&typeof x==='object'&&x[key]===id?x:null;}
 function doc(id,t){if(!id||!Number.isFinite(t))return null;const d=options.document(id,iso(t));return d&&d.id===id&&T.time(d.available_at)!==null&&T.time(d.available_at)<=t?d:null;}
 function currentExact(kind,id,t){const v=view(kind,t),r=v.exact(id);return r&&v.current.some(x=>x.values.id===id)?r:null;}
 function authority(id,person,role,customer,t){const r=view('commerce_authorities',t).get(id),z=r?.values;if(!z||z.person_id!==person||z.role!==role||!['*',customer].includes(z.customer_id)||!T.inside(z.valid_from,z.valid_to,t)||!ctx('person',person,t)||!doc(z.authority_document_id,t))return false;return true;}
 function moment(z,field,es){const t=T.time(z[field]);if(t===null||t>cut||!atOrBefore(z[field],T.time(z.recorded_at)))es.push('EVENT_TIME_UNRESOLVED');return t;}
 function contextCase(z,t,es){const c=ctx('case',z.case_id,t),a=ctx('asset',z.asset_id,t);if(!c||!a||c.asset_id!==z.asset_id||c.customer_id!==a.customer_id)es.push('CASE_ASSET_CUSTOMER_UNRESOLVED');return c;}
 function money(z,es){const q=positive(z.quantity),p=nonnegative(z.unit_price),tax=nonnegative(z.tax_amount);if(!q||!p||!tax||!currency(z.currency)){es.push('MONEY_UNRESOLVED');return null;}return R.add(R.mul(q,p),tax);}
 function exactValid(kind,id,t){const r=currentExact(kind,id,t);return r?check(kind,r,t):null;}
 function check(kind,r,t=cut){const key=kind+'\0'+r.values.id+'\0'+t;if(checks.has(key))return checks.get(key);const z=r.values,es=[],out={id:z.id,business_id:z[IDS[kind]],family:kind,values:z,source:r.source,valid:false,issues:es};checks.set(key,out);
  if(!known(r,t))es.push('RECORD_UNAVAILABLE');
  if(z.source_document_id&&!doc(z.source_document_id,t))es.push('SOURCE_DOCUMENT_UNAVAILABLE');
  const ev=(f)=>moment(z,f,es),need=(ok,code)=>{if(!ok)es.push(code);};
  if(kind==='commerce_authorities'){const tt=T.time(z.valid_from);need(tt!==null&&(z.valid_to===''||T.time(z.valid_to)!==null&&T.time(z.valid_to)>tt)&&ctx('person',z.person_id,t)&&doc(z.authority_document_id,t),'AUTHORITY_SOURCE_UNRESOLVED');need(['quote','customer_approval','policy','entitlement','replacement','credit','warranty','rental','custody'].includes(z.role)&&!!z.customer_id,'AUTHORITY_SCOPE_UNRESOLVED');}
  if(kind==='commerce_quote_lines'){
   const tt=ev('issued_at'),c=contextCase(z,tt,es);out.amount=money(z,es);need(z.quote_id&&z.description&&z.unit&&['service','repair','replacement','rental'].includes(z.action),'QUOTE_SCOPE_UNRESOLVED');
   need(T.time(z.valid_until)!==null&&T.time(z.valid_until)>tt,'QUOTE_VALIDITY_UNRESOLVED');need(authority(z.authority_id,z.issued_by,'quote',c?.customer_id,tt),'QUOTE_AUTHORITY_UNRESOLVED');
  }
  if(kind==='commerce_approvals'){
   const tt=ev('decided_at'),q=exactValid('commerce_quote_lines',z.quote_line_record_id,tt),n=nonnegative(z.approved_quantity);out.quote=q?.id||null;out.quantity=n;out.currency=q?.values.currency||null;
   need(q?.valid&&hashRow('commerce_quote_lines',q.values)===z.quote_line_sha256,'APPROVAL_QUOTE_BINDING');need(q&&T.time(q.values.issued_at)<=tt&&tt<T.time(q.values.valid_until),'APPROVAL_OUTSIDE_QUOTE_VALIDITY');
   const c=q&&ctx('case',q.values.case_id,tt);need(c?.customer_id===z.customer_id&&authority(z.authority_id,z.decided_by,'customer_approval',z.customer_id,tt),'CUSTOMER_APPROVAL_AUTHORITY');
   need(['approved','declined','revoked'].includes(z.decision)&&n&&(z.decision==='approved'?n.n>0n&&positive(q?.values.quantity)&&R.cmp(n,positive(q.values.quantity))<=0n:n.n===0n),'APPROVAL_QUANTITY_OR_DECISION');need(doc(z.decision_document_id,tt),'APPROVAL_DOCUMENT_UNAVAILABLE');
   if(q?.amount&&n&&positive(q.values.quantity))out.authorised_amount=z.decision==='approved'?R.mul(q.amount,R.div(n,positive(q.values.quantity))):R.zero();
  }
  if(kind==='commerce_work_allocations'){
   const tt=ev('performed_at'),a=exactValid('commerce_approvals',z.approval_record_id,tt),q=a&&currentExact('commerce_quote_lines',a.values.quote_line_record_id,T.time(a.values.decided_at)),work=ctx('work',z.work_id,T.time(z.available_at)),n=positive(z.quantity);out.quantity=n;out.approval=a?.id||null;out.work_observed_as_of=z.available_at;
   need(a?.valid&&a.values.decision==='approved','WORK_APPROVAL_UNRESOLVED');need(q&&q.values.case_id===z.case_id&&q.values.asset_id===z.asset_id&&q.values.action===z.action&&q.values.unit===z.unit,'WORK_APPROVED_SCOPE_MISMATCH');
   need(work&&work.work_id===z.work_id&&work.case_id===z.case_id&&work.asset_id===z.asset_id&&work.action===z.action&&work.unit===z.unit&&T.time(work.performed_at)===tt&&positive(work.quantity)&&n&&R.cmp(n,positive(work.quantity))<=0n,'WORK_SOURCE_MISMATCH');
   contextCase(z,tt,es);
  }
  if(kind==='commerce_sales_lines'){
   const tt=ev('sold_at'),a=ctx('asset',z.asset_id,tt);out.amount=money(z,es);need(a&&a.asset_id===z.asset_id&&a.customer_id===z.customer_id&&z.sale_id&&z.catalogue_item&&z.unit,'SALE_ASSET_CUSTOMER_UNRESOLVED');need(['completed','cancelled'].includes(z.sale_status),'SALE_STATUS_UNRESOLVED');need(doc(z.sale_document_id,tt),'SALE_DOCUMENT_UNAVAILABLE');
   // Serialized equipment purchase lines describe one identified physical unit.
   need(positive(z.quantity)&&R.cmp(positive(z.quantity),R.R(1n))===0n,'SERIALIZED_SALE_QUANTITY');
  }
  if(kind==='commerce_policies'){
   const tt=ev('approved_at'),n=integer(z.maximum_uses),cap=nonnegative(z.maximum_credit);need(['first_service','replacement_fee_waiver'].includes(z.policy_type)&&z.service_action,'POLICY_TYPE_OR_SCOPE');need(T.time(z.valid_from)!==null&&(z.valid_to===''||T.time(z.valid_to)>T.time(z.valid_from)),'POLICY_VALIDITY_UNRESOLVED');
   need(authority(z.authority_id,z.approved_by,'policy','*',tt)&&doc(z.policy_document_id,tt),'POLICY_AUTHORITY_UNRESOLVED');
   if(z.policy_type==='first_service')need(n!==null&&n>0,'ENTITLEMENT_LIMIT_UNRESOLVED');else need(cap&&currency(z.currency),'POLICY_CREDIT_LIMIT_UNRESOLVED');
  }
  if(kind==='commerce_entitlements'){
   const tt=ev('used_at'),ap=ev('approved_at'),p=exactValid('commerce_policies',z.policy_record_id,ap),s=exactValid('commerce_sales_lines',z.sale_line_record_id,ap),c=contextCase(z,tt,es),work=ctx('work',z.work_id,T.time(z.available_at));out.work_observed_as_of=z.available_at;
   need(p?.valid&&p.values.policy_type==='first_service'&&T.inside(p.values.valid_from,p.values.valid_to,ap)&&T.inside(p.values.valid_from,p.values.valid_to,tt)&&T.time(p.values.approved_at)<=ap,'ENTITLEMENT_POLICY_UNRESOLVED');
   need(s?.valid&&s.values.sale_status==='completed'&&s.values.asset_id===z.asset_id&&s.values.customer_id===c?.customer_id&&T.time(s.values.sold_at)<=tt,'ENTITLEMENT_PURCHASE_UNRESOLVED');
   need(work&&work.case_id===z.case_id&&work.asset_id===z.asset_id&&work.action===p?.values.service_action&&T.time(work.performed_at)===tt,'ENTITLEMENT_WORK_UNRESOLVED');
   need(ap!==null&&ap<=tt&&authority(z.authority_id,z.approved_by,'entitlement',c?.customer_id,ap)&&doc(z.approval_document_id,ap),'ENTITLEMENT_APPROVAL_UNRESOLVED');
   out.maximum_uses=p?integer(p.values.maximum_uses):null;out.entitlement_key=p&&s?p.values.policy_id+'\0'+s.values.sale_line_id:null;
  }
  if(kind==='commerce_replacements'){
   const tt=ev('decision_at'),c=ctx('case',z.case_id,tt),old=ctx('asset',z.old_asset_id,tt),fresh=ctx('asset',z.new_asset_id,tt),work=ctx('work',z.assessment_work_id,tt),sale=exactValid('commerce_sales_lines',z.replacement_sale_record_id,tt);
   need(c&&c.asset_id===z.old_asset_id&&old?.customer_id===c.customer_id&&fresh?.customer_id===c.customer_id&&z.old_asset_id!==z.new_asset_id,'REPLACEMENT_ASSET_LINEAGE');
   need(work&&work.case_id===z.case_id&&work.asset_id===z.old_asset_id&&work.disposition==='unrepairable'&&atOrBefore(work.performed_at,tt),'REPLACEMENT_ASSESSMENT_UNRESOLVED');
   need(sale?.valid&&sale.values.sale_status==='completed'&&sale.values.asset_id===z.new_asset_id&&sale.values.customer_id===c?.customer_id&&atOrBefore(sale.values.sold_at,tt),'REPLACEMENT_PURCHASE_UNRESOLVED');
   need(authority(z.authority_id,z.approved_by,'replacement',c?.customer_id,tt)&&doc(z.decision_document_id,tt),'REPLACEMENT_AUTHORITY_UNRESOLVED');
  }
  if(kind==='commerce_invoice_lines'){
   const tt=ev('issued_at');out.amount=money(z,es);need(z.invoice_id&&z.customer_id&&doc(z.invoice_document_id,tt),'INVOICE_ORIGINAL_UNRESOLVED');
   const c=ctx('case',z.case_id,tt),asset=ctx('asset',z.asset_id,tt);need(c?.customer_id===z.customer_id&&asset,'INVOICE_CUSTOMER_MISMATCH');
   if(z.basis_type==='work'){const a=exactValid('commerce_work_allocations',z.basis_record_id,tt);need(a?.valid&&a.values.case_id===z.case_id&&a.values.asset_id===z.asset_id,'INVOICE_WORK_LINEAGE');}
   else if(z.basis_type==='sale'){const s=exactValid('commerce_sales_lines',z.basis_record_id,tt);need(s?.valid&&s.values.sale_status==='completed'&&s.values.customer_id===z.customer_id&&s.values.asset_id===z.asset_id,'INVOICE_SALE_LINEAGE');if(c?.asset_id!==z.asset_id){const reps=view('commerce_replacements',tt).current.filter(r=>r.values.case_id===z.case_id&&r.values.new_asset_id===z.asset_id&&r.values.replacement_sale_record_id===z.basis_record_id);need(reps.length===1&&check('commerce_replacements',reps[0],tt).valid,'INVOICE_REPLACEMENT_LINEAGE');}}
   else if(z.basis_type==='rental'){const a=exactValid('commerce_rentals',z.basis_record_id,tt);need(a?.valid&&a.values.case_id===z.case_id&&a.values.customer_id===z.customer_id&&a.values.rental_asset_id===z.asset_id,'INVOICE_RENTAL_LINEAGE');}
   else if(z.basis_type==='diagnosis'){const work=ctx('work',z.basis_record_id,tt);need(work&&work.case_id===z.case_id&&work.asset_id===z.asset_id&&atOrBefore(work.performed_at,tt),'INVOICE_DIAGNOSIS_LINEAGE');}
   else es.push('INVOICE_BASIS_UNRESOLVED');
  }
  if(kind==='commerce_credits'){
   const tt=ev('approved_at'),inv=exactValid('commerce_invoice_lines',z.invoice_line_record_id,tt),n=positive(z.amount);out.amount=n;out.currency=z.currency;need(inv?.valid&&inv.values.currency===z.currency&&n&&R.cmp(n,inv.amount)<=0n,'CREDIT_INVOICE_BINDING');
   need(['approved','posted','declined'].includes(z.decision),'CREDIT_DECISION_UNRESOLVED');need(authority(z.authority_id,z.approved_by,'credit',inv?.values.customer_id,tt)&&doc(z.credit_document_id,tt),'CREDIT_AUTHORITY_UNRESOLVED');
   if(z.decision==='posted')need(T.time(z.posted_at)!==null&&T.time(z.posted_at)>=tt&&T.time(z.posted_at)<=T.time(z.recorded_at)&&T.time(z.posted_at)<=cut,'CREDIT_POSTING_TIME');else need(z.posted_at==='','CREDIT_POSTING_CONFLICT');
   if(z.policy_record_id||z.replacement_record_id){const p=exactValid('commerce_policies',z.policy_record_id,tt),rep=exactValid('commerce_replacements',z.replacement_record_id,tt);need(p?.valid&&p.values.policy_type==='replacement_fee_waiver'&&T.inside(p.values.valid_from,p.values.valid_to,tt)&&p.values.currency===z.currency&&nonnegative(p.values.maximum_credit)&&n&&R.cmp(n,nonnegative(p.values.maximum_credit))<=0n,'WAIVER_POLICY_UNRESOLVED');need(rep?.valid&&rep.values.case_id===inv?.values.case_id&&rep.values.old_asset_id===inv?.values.asset_id,'WAIVER_REPLACEMENT_LINEAGE');if(inv?.values.basis_type==='diagnosis'){const work=ctx('work',inv.values.basis_record_id,tt);need(work?.action===p?.values.service_action,'WAIVER_CHARGE_SCOPE');}else es.push('WAIVER_CHARGE_SCOPE');}
  }
  if(kind==='commerce_warranty_claims'){
   const tt=ev('submitted_at');contextCase(z,tt,es);need(z.manufacturer&&doc(z.claim_document_id,tt),'WARRANTY_CLAIM_SOURCE');
  }
  if(kind==='commerce_warranty_events'){
   const tt=ev('occurred_at'),claim=view('commerce_warranty_claims',tt).get(z.claim_id),cc=claim&&check('commerce_warranty_claims',claim,tt),c=claim&&ctx('case',claim.values.case_id,tt);
   need(cc?.valid&&T.time(claim.values.submitted_at)<=tt,'WARRANTY_CLAIM_UNRESOLVED');need(['approved','declined','payment','refund'].includes(z.event_type),'WARRANTY_EVENT_TYPE');need(doc(z.event_document_id,tt)&&authority(z.authority_id,z.decided_by,'warranty',c?.customer_id,tt),'WARRANTY_EVENT_AUTHORITY');
   if(['approved','payment','refund'].includes(z.event_type)){out.amount=nonnegative(z.amount);need(out.amount&&currency(z.currency),'WARRANTY_AMOUNT_UNRESOLVED');}else need(z.amount===''&&z.currency==='','DECLINED_WARRANTY_AMOUNT');if(['payment','refund'].includes(z.event_type))need(z.provider_transaction_id,'WARRANTY_TRANSACTION_MISSING');
  }
  if(kind==='commerce_rentals'){
   const tt=ev('agreement_at'),c=ctx('case',z.case_id,tt),owned=ctx('asset',z.customer_asset_id,tt),loan=ctx('asset',z.rental_asset_id,tt),rate=nonnegative(z.rate),unit=integer(z.billing_unit_minutes),min=integer(z.minimum_units);
   need(c?.customer_id===z.customer_id&&c?.asset_id===z.customer_asset_id&&owned?.customer_id===z.customer_id&&loan?.ownership==='provider'&&z.rental_asset_id!==z.customer_asset_id,'RENTAL_ASSET_LINEAGE');
   need(rate&&currency(z.currency)&&unit!==null&&unit>0&&min!==null,'RENTAL_TERMS_UNRESOLVED');need(authority(z.authority_id,z.accepted_by,'rental',z.customer_id,tt)&&doc(z.agreement_document_id,tt),'RENTAL_AGREEMENT_AUTHORITY');
   out.rate=rate;out.billing_unit_minutes=unit;out.minimum_units=min;
  }
  if(kind==='commerce_rental_events'){
   const tt=ev('occurred_at'),rental=view('commerce_rentals',tt).get(z.rental_id),a=rental&&check('commerce_rentals',rental,tt);need(a?.valid&&rental.values.rental_asset_id===z.asset_id&&T.time(rental.values.agreement_at)<=tt,'RENTAL_EVENT_BINDING');need(['issue','return'].includes(z.event_type),'RENTAL_EVENT_TYPE');
   need(authority(z.authority_id,z.recorded_by,'custody',rental?.values.customer_id,tt)&&doc(z.event_document_id,tt),'CUSTODY_EVENT_SOURCE');
  }
  if(kind==='commerce_payments'){
   const tt=ev('paid_at'),n=positive(z.amount),invs=view('commerce_invoice_lines',tt).current.filter(x=>x.values.invoice_id===z.invoice_id);
   need(invs.length&&invs.every(x=>x.values.customer_id===z.customer_id&&x.values.currency===z.currency&&check('commerce_invoice_lines',x,tt).valid),'PAYMENT_INVOICE_LINEAGE');
   need(n&&currency(z.currency)&&['receipt','refund'].includes(z.payment_type)&&z.provider_transaction_id&&doc(z.payment_document_id,tt),'PAYMENT_ORIGINAL_UNRESOLVED');out.amount=n?(z.payment_type==='refund'?R.mul(n,R.R(-1n)):n):null;out.currency=z.currency;
  }
  out.valid=!es.length;return out;
 }
 const current={};for(const kind of KINDS){const v=view(kind,cut);current[kind]=v.current.map(r=>check(kind,r));for(const e of v.issues)add(e.code,kind,e.id,'Resolve the original immutable record and its revision chain');
  for(const x of current[kind])if(v.current.filter(y=>y.values[IDS[kind]]===x.business_id).length!==1){x.valid=false;x.issues.push('BUSINESS_ID_AMBIGUOUS');}
  for(const r of families[kind]){const z=r.values,a=T.time(z.available_at),d=T.time(z.recorded_at),x=T.time(r.extract_available_at);if(a===null||d===null||x===null||d>a)add('SOURCE_TIME_UNRESOLVED',kind,z.id,'Actual record and extract availability are required');}
 }
 const fail=(x,code,detail)=>{x.valid=false;if(!x.issues.includes(code))x.issues.push(code);if(detail)x.detail=detail;};
 // Repeated representations cannot multiply physical work or commercial transactions.
 function uniqueGroups(kind,key,code){const groups=new Map();for(const x of current[kind]){const k=key(x);if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);}for(const xs of groups.values())if(xs.length>1)for(const x of xs)fail(x,code);return groups;}
 uniqueGroups('commerce_payments',x=>x.values.provider_transaction_id,'PAYMENT_TRANSACTION_DUPLICATE');
 uniqueGroups('commerce_entitlements',x=>x.values.work_id,'ENTITLEMENT_WORK_DUPLICATE');
 uniqueGroups('commerce_warranty_events',x=>['payment','refund'].includes(x.values.event_type)?(view('commerce_warranty_claims',cut).get(x.values.claim_id)?.values.manufacturer||'')+'\0'+x.values.provider_transaction_id:null,'WARRANTY_TRANSACTION_DUPLICATE');
 const approvalGroups=new Map();for(const x of current.commerce_approvals.filter(x=>x.values.decision==='approved')){const k=x.values.quote_line_record_id;if(!approvalGroups.has(k))approvalGroups.set(k,[]);approvalGroups.get(k).push(x);}
 for(const [id,xs]of approvalGroups){const q=view('commerce_quote_lines',cut).exact(id),cap=q&&positive(q.values.quantity),total=R.sum(xs.filter(x=>x.quantity).map(x=>x.quantity));if(!cap||xs.some(x=>!x.valid)||R.cmp(total,cap)>0n)for(const x of xs)fail(x,'QUOTE_APPROVAL_OVERALLOCATED');}
 const allocations=current.commerce_work_allocations,byApproval=new Map(),byWork=new Map();
 for(const x of allocations){const a=current.commerce_approvals.find(y=>y.id===x.values.approval_record_id);if(a&&!a.valid)fail(x,'WORK_APPROVAL_UNRESOLVED');}
 for(const x of allocations){for(const [map,key]of [[byApproval,x.values.approval_record_id],[byWork,x.values.work_id]]){if(!map.has(key))map.set(key,[]);map.get(key).push(x);}}
 for(const [id,xs]of byApproval){const a=view('commerce_approvals',cut).exact(id),cap=a&&positive(a.values.approved_quantity),total=R.sum(xs.filter(x=>x.quantity).map(x=>x.quantity));if(!cap||xs.some(x=>!x.valid)||R.cmp(total,cap)>0n)for(const x of xs)fail(x,'APPROVAL_OVERALLOCATED_OR_UNRESOLVED');}
 for(const [id,xs]of byWork){const work=ctx('work',id,cut),cap=work&&positive(work.quantity),total=R.sum(xs.filter(x=>x.quantity).map(x=>x.quantity));if(!cap||xs.some(x=>!x.valid)||R.cmp(total,cap)>0n)for(const x of xs)fail(x,'WORK_OVERALLOCATED_OR_UNRESOLVED');}
 const uses=new Map();for(const x of current.commerce_entitlements){if(!x.entitlement_key)continue;if(!uses.has(x.entitlement_key))uses.set(x.entitlement_key,[]);uses.get(x.entitlement_key).push(x);}
 for(const xs of uses.values()){const limits=xs.map(x=>x.maximum_uses);if(limits.some(x=>!Number.isSafeInteger(x))||xs.length>Math.min(...limits))for(const x of xs)fail(x,'ENTITLEMENT_USE_LIMIT');}
 const creditGroups=new Map();for(const x of current.commerce_credits.filter(x=>x.values.decision!=='declined')){const id=x.values.invoice_line_record_id;if(!creditGroups.has(id))creditGroups.set(id,[]);creditGroups.get(id).push(x);}
 for(const [id,xs]of creditGroups){const original=view('commerce_invoice_lines',cut).exact(id),inv=original&&check('commerce_invoice_lines',original),total=R.sum(xs.filter(x=>x.amount).map(x=>x.amount));if(!inv?.amount||xs.some(x=>!x.valid)||R.cmp(total,inv.amount)>0n)for(const x of xs)fail(x,'CREDIT_TOTAL_UNRESOLVED');}
 const waiverGroups=new Map();for(const x of current.commerce_credits.filter(x=>x.values.decision!=='declined'&&x.values.policy_record_id)){const k=x.values.policy_record_id+'\\0'+x.values.replacement_record_id+'\\0'+x.values.invoice_line_record_id;if(!waiverGroups.has(k))waiverGroups.set(k,[]);waiverGroups.get(k).push(x);}
 for(const xs of waiverGroups.values()){const p=view('commerce_policies',cut).exact(xs[0].values.policy_record_id),cap=p&&nonnegative(p.values.maximum_credit),total=R.sum(xs.filter(x=>x.amount).map(x=>x.amount));if(!cap||xs.some(x=>!x.valid)||R.cmp(total,cap)>0n)for(const x of xs)fail(x,'WAIVER_TOTAL_EXCEEDS_POLICY');}
 const rentals=[];for(const a of current.commerce_rentals){const events=current.commerce_rental_events.filter(x=>x.values.rental_id===a.business_id),sent=events.filter(x=>x.values.event_type==='issue'),returned=events.filter(x=>x.values.event_type==='return'),es=[];let begin=null,end=null,amount=null,billedUnits=null;
  if(!a.valid||events.some(x=>!x.valid)||sent.length!==1||returned.length>1)es.push('RENTAL_CUSTODY_UNRESOLVED');
  else{begin=T.time(sent[0].values.occurred_at);end=returned.length?T.time(returned[0].values.occurred_at):cut;if(end<begin)es.push('RENTAL_RETURN_BEFORE_ISSUE');else{const ms=BigInt(end-begin),unit=BigInt(a.billing_unit_minutes)*60000n,n=(ms+unit-1n)/unit;billedUnits=n>BigInt(a.minimum_units)?n:BigInt(a.minimum_units);amount=R.mul(a.rate,R.R(billedUnits));}}
  rentals.push({rental_id:a.business_id,asset_id:a.values.rental_asset_id,case_id:a.values.case_id,currency:a.values.currency,state:returned.length?'returned':sent.length?'out':'unissued',valid:!es.length,issues:es,issued_at:begin===null?null:iso(begin),returned_at:returned.length&&end!==null?iso(end):null,accrual_through:end===null?null:iso(end),billable_units:billedUnits===null?null:billedUnits.toString(),modelled_accrual:amount,events:events.map(x=>x.id),interpretation:'Elapsed custody priced under supplied accepted terms; separate from issued invoices and cash.'});
 }
 for(let i=0;i<rentals.length;i++)for(let j=i+1;j<rentals.length;j++){const a=rentals[i],b=rentals[j];if(a.asset_id===b.asset_id&&a.issued_at&&b.issued_at&&T.time(a.issued_at)<T.time(b.accrual_through)&&T.time(b.issued_at)<T.time(a.accrual_through)){a.valid=b.valid=false;a.modelled_accrual=b.modelled_accrual=null;a.issues.push('RENTAL_ASSET_DOUBLE_BOOKED');b.issues.push('RENTAL_ASSET_DOUBLE_BOOKED');}}
 const warranties=[];for(const c of current.commerce_warranty_claims){const xs=current.commerce_warranty_events.filter(x=>x.values.claim_id===c.business_id).sort((a,b)=>T.time(a.values.occurred_at)-T.time(b.values.occurred_at)),decisions=xs.filter(x=>['approved','declined'].includes(x.values.event_type)),es=[];if(!c.valid||xs.some(x=>!x.valid)||decisions.length>1)es.push('WARRANTY_HISTORY_UNRESOLVED');const decision=decisions[0]||null,pay=xs.filter(x=>['payment','refund'].includes(x.values.event_type));let paid=null;
  if(pay.length){const bindings=pay.map(x=>{const when=T.time(x.values.occurred_at),ds=view('commerce_warranty_events',when).current.filter(r=>r.values.claim_id===c.business_id&&['approved','declined'].includes(r.values.event_type)),d=ds.length===1?check('commerce_warranty_events',ds[0],when):null;return x.valid&&x.amount&&d?.valid&&d.amount&&d.values.event_type==='approved'&&d.values.currency===x.values.currency&&T.time(d.values.occurred_at)<=when;});if(!decision?.valid||!decision.amount||decision.values.event_type!=='approved'||bindings.some(x=>!x))es.push('WARRANTY_SETTLEMENT_BINDING');else{paid=R.sum(pay.map(x=>x.values.event_type==='refund'?R.mul(x.amount,R.R(-1n)):x.amount));if(paid.n<0n||R.cmp(paid,decision.amount)>0n)es.push('WARRANTY_SETTLEMENT_AMOUNT');}}
  warranties.push({claim_id:c.business_id,case_id:c.values.case_id,state:decision?.values.event_type||'pending',currency:decision?.values.currency||null,approved_amount:decision?.values.event_type==='approved'?decision.amount:null,observed_net_payment:es.length?null:paid,valid:!es.length,issues:es,events:xs.map(x=>x.id)});
 }
 // Propagate aggregate allocation defects before financial claims are summarized.
 for(const x of current.commerce_invoice_lines)if(x.values.basis_type==='work'){const a=allocations.find(y=>y.id===x.values.basis_record_id)||exactValid('commerce_work_allocations',x.values.basis_record_id,T.time(x.values.issued_at));if(!a?.valid)fail(x,'INVOICE_WORK_LINEAGE');else{const ap=view('commerce_approvals',cut).exact(a.values.approval_record_id),q=ap&&view('commerce_quote_lines',cut).exact(ap.values.quote_line_record_id),n=positive(x.values.quantity),cap=a.quantity,qr=q&&check('commerce_quote_lines',q),total=qr?.amount&&n&&positive(q.values.quantity)?R.mul(qr.amount,R.div(n,positive(q.values.quantity))):null;if(!n||!cap||R.cmp(n,cap)>0n||q?.values.currency!==x.values.currency||!total||!x.amount||R.cmp(x.amount,total)>0n)fail(x,'INVOICE_EXCEEDS_APPROVED_WORK');}}

 // Separate invoices and later basis revisions still consume the same physical allocation or sale.
 const billed=new Map();for(const x of current.commerce_invoice_lines){const type=x.values.basis_type;if(!['work','sale','diagnosis'].includes(type))continue;const kind=type==='work'?'commerce_work_allocations':type==='sale'?'commerce_sales_lines':null,basis=kind?view(kind,cut).exact(x.values.basis_record_id):null,key=type+'\0'+(basis?.values.record_key||x.values.basis_record_id);if(!billed.has(key))billed.set(key,[]);billed.get(key).push({invoice:x,basis});}
 for(const xs of billed.values()){const rows=xs.map(x=>x.invoice),type=rows[0].values.basis_type;let cap=null,currencyCode=null,amountCap=null;
  if(type==='diagnosis'){const works=rows.map(x=>ctx('work',x.values.basis_record_id,T.time(x.values.issued_at)));if(works.every(Boolean)){const caps=works.map(x=>positive(x.quantity));if(caps.every(Boolean))cap=caps.reduce((a,b)=>R.cmp(a,b)<0n?a:b);}}
  else{const candidates=xs.map(({invoice:x,basis})=>{if(!basis)return null;if(type==='sale'){const v=check('commerce_sales_lines',basis,T.time(x.values.issued_at));return v.valid?{quantity:positive(v.values.quantity),amount:v.amount,currency:v.values.currency}:null;}const a=check('commerce_work_allocations',basis,T.time(x.values.issued_at)),ap=view('commerce_approvals',cut).exact(a.values.approval_record_id),q=ap&&view('commerce_quote_lines',cut).exact(ap.values.quote_line_record_id),qr=q&&check('commerce_quote_lines',q);return a.valid&&a.quantity&&qr?.amount&&positive(q.values.quantity)?{quantity:a.quantity,amount:R.mul(qr.amount,R.div(a.quantity,positive(q.values.quantity))),currency:q.values.currency}:null;});if(candidates.every(x=>x?.quantity&&x.amount)&&new Set(candidates.map(x=>x.currency)).size===1){cap=candidates.map(x=>x.quantity).reduce((a,b)=>R.cmp(a,b)<0n?a:b);amountCap=candidates.map(x=>x.amount).reduce((a,b)=>R.cmp(a,b)<0n?a:b);currencyCode=candidates[0].currency;}}
  const quantities=rows.map(x=>positive(x.values.quantity)),amounts=rows.map(x=>x.amount);if(!cap||rows.some(x=>!x.valid)||quantities.some(x=>!x)||R.cmp(R.sum(quantities.filter(Boolean)),cap)>0n||(type!=='diagnosis'&&(!amountCap||amounts.some(x=>!x)||rows.some(x=>x.values.currency!==currencyCode)||R.cmp(R.sum(amounts.filter(Boolean)),amountCap)>0n)))for(const x of rows)fail(x,'INVOICE_BASIS_OVERBILLED_OR_UNRESOLVED');
 }
 for(const x of current.commerce_credits){const inv=current.commerce_invoice_lines.find(y=>y.id===x.values.invoice_line_record_id)||exactValid('commerce_invoice_lines',x.values.invoice_line_record_id,T.time(x.values.approved_at));if(!inv?.valid)fail(x,'CREDIT_INVOICE_BINDING');}
 for(const x of current.commerce_payments){const inv=current.commerce_invoice_lines.filter(y=>y.values.invoice_id===x.values.invoice_id);if(!inv.length||inv.some(y=>!y.valid))fail(x,'PAYMENT_INVOICE_LINEAGE');}
 function sums(xs,amount=x=>x.amount){const out={};for(const x of xs){const cur=x.values?.currency||x.currency;if(!currency(cur))continue;if(!out[cur])out[cur]={known_amount:R.zero(),complete:true,records:0,unresolved:0};out[cur].records++;const n=amount(x);if(!x.valid||!n){out[cur].complete=false;out[cur].unresolved++;}else out[cur].known_amount=R.add(out[cur].known_amount,n);}return out;}
 const coverage={};for(const k of KINDS){const expected=options.expected_counts?.[k];coverage[k]={observed:families[k].filter(r=>known(r,cut)).length,expected:Number.isSafeInteger(expected)&&expected>=0?expected:null,complete:options.population_complete===true&&Number.isSafeInteger(expected)&&expected===families[k].filter(r=>known(r,cut)).length};}
 const moneySummary={
 quoted:sums(current.commerce_quote_lines),
 approved_quote:sums(current.commerce_approvals.filter(x=>x.values.decision==='approved'),x=>x.authorised_amount),
 completed_sales:sums(current.commerce_sales_lines.filter(x=>x.values.sale_status==='completed')),
 issued_invoices:sums(current.commerce_invoice_lines),
 approved_unposted_credits:sums(current.commerce_credits.filter(x=>x.values.decision==='approved')),
 posted_credits:sums(current.commerce_credits.filter(x=>x.values.decision==='posted')),
 observed_net_cash:sums(current.commerce_payments),
 modelled_rental_accrual:sums(rentals,x=>x.modelled_accrual)
 };
 for(const [kind,xs]of Object.entries(current))for(const x of xs)for(const code of uniq(x.issues))add(code,kind,x.id,x.detail||'Resolve against the exact source, dated authority and linked unit/case');
 for(const r of rentals)for(const code of uniq(r.issues))add(code,'commerce_rentals',r.rental_id,'Physical custody and accepted pricing terms must reconcile');
 for(const r of warranties)for(const code of uniq(r.issues))add(code,'commerce_warranty_claims',r.claim_id,'Manufacturer decision and actual settlement are separate source events');
 return T.reveal({schema:'service.commerce-analysis/v1',as_of:options.as_of,coverage,complete:Object.values(coverage).every(x=>x.complete)&&issues.length===0,records:current,rentals,warranties,money:moneySummary,issues,interpretation:'Commercial source reconstruction. Amounts are exact decimals by currency and observed category. Technical release, regulatory acceptance, collection of unrecorded money and causal business improvement are not inferred.'});
}
module.exports={FIELDS,IDS,KINDS,hashRow,analyze};
