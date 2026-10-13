// MIT. Source-bound installment instructions over original invoice payment requests.
import {need, plain, identifier, field, minor, money, json, sha, today} from '../core.mjs';
import {PLAN_SCHEMA, planProjection} from './core.mjs';

export const COLLECTION_SCHEMA = 'stellar-forge.payment-plan-collection.v1';

function openRequest(row, network, now, exceptId) {
  return row.id !== exceptId && (!row.issuedAt || row.issuedAt <= now) && row.proposal.network === network && !row.cancelledAt &&
    !(row.returns ?? []).some(item => Boolean(item.receiptId)) &&
    (!row.proposal.expiresAt || row.proposal.expiresAt > now);
}
function originalPlan(data, invoice, planId, editionId, asOf) {
  need(data.paymentPlans?.schema === PLAN_SCHEMA && Array.isArray(data.paymentPlans.plans),
    'PAYMENT_PLAN_WORKSPACE_REQUIRED', 'Open payment plans in this original accounting workspace.', 409);
  identifier(planId, 'payment plan'); identifier(editionId, 'schedule edition');
  const plan = data.paymentPlans.plans.find(row => row.id === planId);
  need(plan && plan.invoiceId === invoice.id, 'PAYMENT_PLAN_COLLECTION_SOURCE_CHANGED',
    'Choose a payment plan belonging to this original invoice.', 409);
  const projection = planProjection(plan, data, asOf);
  need(projection.editionId === editionId && !['DRAFT','FUTURE','CANCELLED','INVOICE_CLOSED','SATISFIED'].includes(projection.collectionStatus),
    'PAYMENT_PLAN_COLLECTION_EDITION_CHANGED', 'Select the current effective outstanding schedule edition.', 409);
  need(!projection.baselineChanged, 'PAYMENT_PLAN_COLLECTION_BALANCE_CHANGED',
    'Review the changed original balance and activate a corrected schedule before issuing installment instructions.', 409);
  const edition = plan.editions.find(row => row.id === editionId);
  need(edition && sha(json(edition.document)) === edition.files?.['schedule.json']?.sha256 &&
    edition.document.source.invoiceSha256 === invoice.files?.['invoice.json']?.sha256,
    'PAYMENT_PLAN_COLLECTION_SOURCE_CHANGED', 'The retained schedule or original invoice content changed.', 409);
  return {plan, projection, edition};
}

/** Computes current available instructions without recording cash or changing a schedule. */
export function collectionAvailability(invoice, data, {planId, editionId, network, now = new Date().toISOString(), exceptId = null} = {}) {
  need(['stellar:pubnet','stellar:testnet'].includes(network), 'INVALID_STELLAR_PAYMENT_NETWORK',
    'Choose the original Stellar public or test network.');
  const asOf = now.slice(0, 10), {plan, projection, edition} = originalPlan(data, invoice, planId, editionId, asOf);
  const currency = projection.currency, reserved = new Map(), pending = [];
  for (const row of data.paymentRequests ?? []) {
    if (row.invoiceId !== invoice.id || !openRequest(row, network, now, exceptId)) continue;
    const source = row.proposal.paymentPlan;
    if (!source) { pending.push({id:row.id, kind:'INVOICE', invoiceAmount:row.proposal.invoiceAmount}); continue; }
    if (source.planId !== planId || source.editionId !== editionId ||
        source.scheduleSha256 !== edition.files['schedule.json'].sha256) {
      pending.push({id:row.id, kind:'OTHER_SCHEDULE', invoiceAmount:row.proposal.invoiceAmount});
      continue;
    }
    need(source.schema === COLLECTION_SCHEMA && Array.isArray(source.installments),
      'PAYMENT_PLAN_COLLECTION_SOURCE_CHANGED', 'A retained collection source is invalid.', 409);
    for (const item of source.installments) {
      const amount = minor(item.amount, currency, 'retained installment instruction', {positive:true});
      reserved.set(item.id, (reserved.get(item.id) ?? 0n) + amount);
    }
  }
  const rows = projection.installments.map(row => {
    const remaining = minor(row.remaining, currency), held = reserved.get(row.id) ?? 0n;
    return {...row, reservedInstructions:money(held,currency),
      availableInstructions:money(remaining > held ? remaining-held : 0n,currency),
      instructionsExceedRemaining:held > remaining};
  });
  return {schema:COLLECTION_SCHEMA, planId, editionId, invoiceId:invoice.id,
    scheduleSha256:edition.files['schedule.json'].sha256,
    invoiceSha256:invoice.files['invoice.json'].sha256, effectiveDate:edition.document.effectiveDate,
    asOf, currency, title:edition.document.schedule.title, reference:edition.document.schedule.reference,
    allocationMethod:edition.document.allocationMethod, installments:rows, otherInstructions:pending,
    existingInstructionReviewRequired:pending.length > 0 || rows.some(row=>row.instructionsExceedRemaining)};
}

/** Called inside the original native preview AND the original atomic issue operation. */
export function compilePlanCollection(invoice, data, value, {network, now = new Date().toISOString(), exceptId = null} = {}) {
  need(plain(value) && Array.isArray(value.installments) && value.installments.length > 0 && value.installments.length <= 1000,
    'INVALID_PAYMENT_PLAN_COLLECTION', 'Select one to 1,000 original outstanding installments.');
  const current = collectionAvailability(invoice,data,{planId:value.planId,editionId:value.editionId,network,now,exceptId});
  need(!current.existingInstructionReviewRequired, 'PAYMENT_PLAN_COLLECTION_INSTRUCTIONS_CHANGED',
    'Review and withdraw superseded or overlapping invoice instructions before preparing this schedule collection.',409);
  const selected = new Map();
  for (const item of value.installments) {
    need(plain(item), 'INVALID_PAYMENT_PLAN_COLLECTION', 'Select each installment and its exact commercial amount.');
    const id = field(item.id,'installment reference',80);
    need(!selected.has(id),'DUPLICATE_PAYMENT_PLAN_COLLECTION','Select each original installment once.');
    selected.set(id,minor(item.amount,current.currency,'installment collection',{positive:true}));
  }
  const rows = []; let total = 0n, stopped = false;
  for (const item of current.installments) {
    const available = minor(item.availableInstructions,current.currency), amount = selected.get(item.id);
    if (amount === undefined) { if (available > 0n) stopped = true; continue; }
    need(!stopped && available > 0n && amount <= available, 'PAYMENT_PLAN_COLLECTION_ORDER_CHANGED',
      'Collect the earliest outstanding unreserved installments in order; only the final selected installment may be partial.',409);
    rows.push({id:item.id,label:item.label,dueDate:item.dueDate,scheduledAmount:item.amount,
      paid:item.paid,credited:item.credited,remaining:item.remaining,reservedInstructions:item.reservedInstructions,
      amount:money(amount,current.currency)});
    total += amount; selected.delete(item.id);
    if (amount < available) stopped = true;
  }
  need(selected.size === 0 && rows.length > 0,'PAYMENT_PLAN_COLLECTION_ROW_MISSING',
    'Every selection must remain in the original current schedule.',409);
  return {schema:COLLECTION_SCHEMA,planId:current.planId,editionId:current.editionId,
    scheduleSha256:current.scheduleSha256,invoiceId:current.invoiceId,invoiceSha256:current.invoiceSha256,
    effectiveDate:current.effectiveDate,asOf:current.asOf,currency:current.currency,title:current.title,
    reference:current.reference,allocationMethod:current.allocationMethod,
    installments:rows,invoiceAmount:money(total,current.currency)};
}

/** Historical provenance is retained even when a successor schedule or ledger changes the projection. */
export function planCollectionStatus(proposal, invoice, data, asOf = today(), observedAt = new Date().toISOString()) {
  const source = proposal.paymentPlan;
  if (!source) return null;
  let projection;
  try {
    const plan = data.paymentPlans?.plans?.find(row=>row.id===source.planId);
    need(plan && plan.invoiceId === invoice.id,'PAYMENT_PLAN_COLLECTION_SOURCE_MISSING','The original schedule is unavailable.',409);
    projection = planProjection(plan,data,asOf);
    const original = plan.editions.find(row=>row.id===source.editionId);
    need(original && sha(json(original.document)) === source.scheduleSha256,
      'PAYMENT_PLAN_COLLECTION_SOURCE_CHANGED','The retained original schedule differs.',409);
    const editionCurrent=projection.editionId===source.editionId && !projection.baselineChanged &&
      !['CANCELLED','INVOICE_CLOSED','FUTURE','DRAFT','SATISFIED'].includes(projection.collectionStatus);
    let instructionReview=null;
    if(editionCurrent) {
      const now=asOf===observedAt.slice(0,10)?observedAt:asOf+'T23:59:59.999Z';
      try {
        compilePlanCollection(invoice,data,{planId:source.planId,editionId:source.editionId,
          installments:source.installments.map(row=>({id:row.id,amount:row.amount}))},
          {network:proposal.network,now,exceptId:proposal.id});
      } catch(error) {
        instructionReview={code:error.code||'PAYMENT_PLAN_COLLECTION_SOURCE_CHANGED',message:String(error.message)};
      }
    }
    return {planId:source.planId,editionId:source.editionId,scheduleSha256:source.scheduleSha256,
      asOf,currentEditionId:projection.editionId,current:editionCurrent&&!instructionReview,
      instructionsNeedReview:Boolean(instructionReview),instructionReview,
      collectionStatus:projection.collectionStatus,baselineChanged:projection.baselineChanged,
      currentInstallments:source.installments.map(item=>{
        const row=projection.installments.find(row=>row.id===item.id);
        return {id:item.id,sourceAmount:item.amount,current:row ? structuredClone(row):null};
      })};
  } catch(error) {
    return {planId:source.planId,editionId:source.editionId,asOf,current:false,
      collectionStatus:'SOURCE_REVIEW_REQUIRED',reason:error.code ?? 'PAYMENT_PLAN_COLLECTION_SOURCE_CHANGED'};
  }
}
