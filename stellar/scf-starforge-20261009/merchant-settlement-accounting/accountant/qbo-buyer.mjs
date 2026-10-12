// MIT. Typed QuickBooks selections from the original issued buyer allocations.
import {inspectHandoff,validateHandoff,validateRevision} from './engine.mjs';
import {isBuyerHandoff,buyerAccountingComponents,buyerCanonical,buyerHash} from './buyer-source.mjs';

const SHA=/^[0-9a-f]{64}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>structuredClone(value);
const check=(ok,code,message,status=400)=>{if(!ok)throw Object.assign(new Error(message),{code,status});};
const text=(value,label,max=2000)=>{
  check(typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    'QBO_BUYER_REVIEW_REQUIRED','Retain '+label+' as nonempty text of at most '+max+' characters.');return value;
};
const assignment=row=>Object.fromEntries(['externalStatus','externalBookRef','externalAccountCode','externalNote'].map(key=>[key,row[key]??'']));
export const qboBuyerAssignmentHash=row=>buyerHash(buyerCanonical(assignment(row)));
export const isQboBuyerPlan=plan=>plan?.sourceKind==='buyer-expense-period';

/** Public source projection; original native units and valuation remain separate. */
export function qboBuyerRows(handoff,revision=null){
  validateHandoff(handoff,{allowBuyer:true});
  check(isBuyerHandoff(handoff),'QBO_BUYER_HANDOFF_REQUIRED','Choose an original issued buyer accountant handoff.');
  if(revision)validateRevision(handoff,revision);
  const current=new Map(inspectHandoff(handoff,revision).rows.map(row=>[row.rowId,row]));
  return buyerAccountingComponents(handoff).map(component=>{
    const row=current.get(component.rowId);
    check(row,'QBO_BUYER_SOURCE_CHANGED','A retained buyer allocation is missing.',409);
    return {...clone(component),sourceComponentId:component.id,sourceAllocation:clone(component),
      recognitionDate:component.sourceAt,original:clone(row.original),label:clone(row.label),
      ...assignment(row)};
  });
}

/** Stable facts retained in each selected or explicitly excluded plan row. */
export function qboBuyerPlanFacts(row){
  return {rowId:row.rowId,sourceRowSha256:row.sourceRowSha256,sourceLineId:row.sourceLineId,
    sourceComponentId:row.sourceComponentId,economicId:row.economicId,kind:row.kind,
    sourceNetwork:row.network,sourceAmountAtomic:row.amountAtomic,sourceLabel:clone(row.label),
    sourceAllocation:clone(row.sourceAllocation)};
}

function booksSource(row,environment){
  if(environment==='production')check(row.network==='stellar:pubnet'&&row.dataContext==='operational'&&
    row.transfer==='TRANSFER_MATCHED'&&SHA.test(row.observationSha256??''),
    'QBO_PRODUCTION_BUYER_SOURCE_REQUIRED',
    'Production requires each selected buyer allocation to retain its original operational public-network matched transfer and observation hash. Use sandbox for the retained development source.');
}

/** Decide every allocation; this does not reserve a plan or choose an exchange rate. */
export function qboBuyerDecisions({handoff,revision=null,rows,environment,valuationBasis}={}){
  text(valuationBasis,'the journal valuation basis and tax treatment');
  const source=qboBuyerRows(handoff,revision),known=new Map(source.map(row=>[row.rowId,row])),seen=new Set();
  check(Array.isArray(rows)&&rows.length===source.length&&rows.length<=22000,
    'QBO_BUYER_DECISIONS_REQUIRED','Choose include or exclude for every original buyer allocation.');
  const included=[],excluded=[];
  for(const value of rows){
    check(object(value)&&typeof value.rowId==='string'&&SHA.test(value.rowId)&&known.has(value.rowId)&&!seen.has(value.rowId),
      'QBO_BUYER_ALLOCATION_REQUIRED','Each decision must name one distinct original buyer allocation.');
    const row=known.get(value.rowId);seen.add(row.rowId);
    check(value.decision==='include'||value.decision==='exclude','QBO_BUYER_DECISION_REQUIRED',
      'Choose include or exclude explicitly for each original buyer allocation.');
    if(value.decision==='exclude'){
      excluded.push({...qboBuyerPlanFacts(row),assignmentSha256:qboBuyerAssignmentHash(row),
        decision:'exclude',reason:text(value.reason,'the allocation exclusion reason')});
      continue;
    }
    check(!['BOOKED','EXCLUDED'].includes(row.externalStatus),'QBO_ALREADY_ACCOUNTED',
      'A selected allocation is already booked or excluded. Preserve its original return and explicitly exclude it from this plan.',409);
    check(/^(?:0|[1-9]\d*)$/.test(row.amountAtomic)&&BigInt(row.amountAtomic)>0n,
      'QBO_ZERO_BUYER_ALLOCATION','Explicitly exclude a zero native allocation. A separate fee requires its own original source.');
    booksSource(row,environment);
    text(value.valuationNote,'the allocation valuation source');
    check(typeof value.amount==='string','QBO_BUYER_AMOUNT_REQUIRED','Enter the reviewed home-currency amount as an exact decimal string.');
    included.push({row,selection:clone(value)});
  }
  check(included.length>0&&included.length<=500,'QBO_ROW_LIMIT','Include between 1 and 500 explicitly valued buyer allocations in one QuickBooks journal.');
  return {included,excluded,valuationBasis};
}

/** Check the typed plan even when only its immutable packet is being reopened. */
export function validateQboBuyerPlan(plan){
  if(!isQboBuyerPlan(plan)){
    check(plan?.source?.kind!=='buyer-expense-period','QBO_BUYER_PLAN_KIND_REQUIRED','Retain the typed buyer plan discriminator.',409);
    return plan;
  }
  check(plan.source?.kind==='buyer-expense-period'&&object(plan.source.buyer)&&
    typeof plan.source.buyer.workspaceId==='string'&&typeof plan.source.buyer.closeId==='string'&&
    Array.isArray(plan.excluded)&&plan.rows.length+plan.excluded.length<=22000,
    'QBO_BUYER_PLAN_CHANGED','Retain the complete original buyer source and allocation decisions.',409);
  text(plan.valuationBasis,'the journal valuation basis and tax treatment');
  const seen=new Set();
  for(const [included,values]of [[true,plan.rows],[false,plan.excluded]]){
    for(const row of values){
      check(object(row),'QBO_BUYER_PLAN_CHANGED','Retain each original buyer allocation object.',409);
      const native=row.sourceAllocation;
      check(object(native)&&SHA.test(row.rowId??'')&&!seen.has(row.rowId)&&
        ['BUYER_EXPENSE','BUYER_CREDIT'].includes(row.kind)&&native.rowId===row.rowId&&native.kind===row.kind&&
        native.sourceRowSha256===row.sourceRowSha256&&native.sourceLineId===row.sourceLineId&&native.id===row.sourceComponentId&&
        native.economicId===row.economicId&&native.network===row.sourceNetwork&&native.amountAtomic===row.sourceAmountAtomic&&
        [row.sourceRowSha256,row.sourceLineId,row.sourceComponentId,row.economicId,row.assignmentSha256].every(value=>SHA.test(value??'')),
        'QBO_BUYER_PLAN_CHANGED','A retained buyer allocation or source identity changed.',409);
      seen.add(row.rowId);
      if(included){
        check(row.decision==='include','QBO_BUYER_DECISION_REQUIRED','Retain the explicit included allocation decision.',409);
        check(typeof row.sourceAmountAtomic==='string'&&/^[1-9]\d*$/.test(row.sourceAmountAtomic),
          'QBO_ZERO_BUYER_ALLOCATION','A selected buyer allocation must retain a positive original native amount.');
        text(row.valuationNote,'the allocation valuation source');booksSource(native,plan.environment);
      }else{
        check(row.decision==='exclude','QBO_BUYER_DECISION_REQUIRED','Retain the explicit excluded allocation decision.',409);
        text(row.reason,'the allocation exclusion reason');
      }
    }
  }
  return plan;
}

/** A later accountant return can change excluded assignments, but not source facts. */
export function checkQboBuyerSource(plan,handoff,revision=null){
  validateQboBuyerPlan(plan);
  check(isQboBuyerPlan(plan)&&isBuyerHandoff(handoff),'QBO_BUYER_SOURCE_CHANGED',
    'Use this plan’s original typed buyer handoff.',409);
  const source=qboBuyerRows(handoff,revision),known=new Map(source.map(row=>[row.rowId,row]));
  check(plan.rows.length+plan.excluded.length===known.size,'QBO_BUYER_SOURCE_CHANGED',
    'Retain a decision for every allocation in the original issued source.',409);
  for(const selected of [...plan.rows,...plan.excluded]){
    const row=known.get(selected.rowId);check(row,'QBO_BUYER_SOURCE_CHANGED','The original buyer allocation is missing.',409);
    const expected=qboBuyerPlanFacts(row);
    check(Object.keys(expected).every(key=>Object.hasOwn(selected,key)&&buyerCanonical(selected[key])===buyerCanonical(expected[key])),
      'QBO_BUYER_SOURCE_CHANGED','A selected buyer allocation differs from its original source facts.',409);
    known.delete(row.rowId);
  }
  check(known.size===0,'QBO_BUYER_SOURCE_CHANGED','The original buyer allocation decisions are incomplete.',409);
  return true;
}

/** Same-book source reservations live in the original qboPlans records. */
export function qboBuyerReservation(plan){
  if(!isQboBuyerPlan(plan))return {};
  validateQboBuyerPlan(plan);
  return {sourceKind:'buyer-expense-period',buyerWorkspaceId:plan.source.buyer.workspaceId,
    buyerCloseId:plan.source.buyer.closeId,buyerSourceSha256:plan.source.reportSha256,
    buyerSourceLineIds:plan.rows.map(row=>row.sourceLineId),
    buyerEconomicIds:[...new Set(plan.rows.map(row=>row.economicId))]};
}
export function qboBuyerReservationOverlap(selected,other){
  if(selected.sourceKind!=='buyer-expense-period'||other.sourceKind!=='buyer-expense-period'||
      selected.buyerWorkspaceId!==other.buyerWorkspaceId)return false;
  const sameEdition=selected.buyerCloseId===other.buyerCloseId&&selected.buyerSourceSha256===other.buyerSourceSha256;
  const keys=new Set(sameEdition?selected.buyerSourceLineIds:selected.buyerEconomicIds);
  return (sameEdition?other.buyerSourceLineIds:other.buyerEconomicIds).some(key=>keys.has(key));
}
