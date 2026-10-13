// MIT. Original commissioning scopes remain caller-retained source documents.
import {TextDecoder} from 'node:util';
import {json,sha,need,plain,field,identifier,dateValue,currencyOf,minor,money} from '../core.mjs';
import {parseXeroNativeJson} from '../xero/public/native-json.mjs';

export const COMMISSIONING_SOURCE_SCHEMA = 'stellar-forge.commissioning-workshares.v1';
export const COMMISSIONING_REVIEW_SCHEMA = 'stellar-forge.commissioning-collections-review.v1';
export const COMMISSIONING_SOURCE_BYTES = 8 * 1024 * 1024;
const HEX = /^[a-f0-9]{64}$/;
const clone = value => structuredClone(value);
const list = (value, name, max = 20000) => {
  need(Array.isArray(value) && value.length <= max, 'COMMISSIONING_LIST', 'Keep a complete supported ' + name + ' list.');
  return value;
};
const optionalDate = (value, name) => value === null || value === undefined || value === '' ? null : dateValue(value, name);
function integer(value, name, maximum = 36500, nullable = false) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const candidate = typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) ? Number(value) : value;
  need(Number.isSafeInteger(candidate) && candidate >= 0 && candidate <= maximum,
    'COMMISSIONING_INTEGER', 'Use a supported whole number for ' + name + '.');
  return candidate;
}
function decimalUnits(value, scale, name) {
  need(typeof value === 'string' && value.length <= 256, 'COMMISSIONING_SOURCE_NUMBER', 'Keep the original exact number for ' + name + '.');
  const matched = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(value);
  need(matched, 'COMMISSIONING_SOURCE_NUMBER', 'Check the original exact number for ' + name + '.');
  const exponent = Number(matched[4] ?? 0), fraction = matched[3] ?? '';
  need(Number.isSafeInteger(exponent) && Math.abs(exponent) <= 64,
    'COMMISSIONING_SOURCE_NUMBER', 'The original exponent exceeds the supported amount range.');
  let units = BigInt(matched[2] + fraction), shift = scale + exponent - fraction.length;
  if (shift >= 0) units *= 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    need(units % divisor === 0n, 'COMMISSIONING_SOURCE_PRECISION', name + ' exceeds its explicit precision.');
    units /= divisor;
  }
  return matched[1] ? -units : units;
}
function sourceAmount(value, currency, name) {
  const units = decimalUnits(value, currency.scale, name);
  need(units > 0n, 'COMMISSIONING_SOURCE_FEE', 'The original scope needs a positive fee.');
  return {units, amount: money(units, currency)};
}
function splitFee(fee, percentages, currency) {
  const denominator = 100000000n;
  const portions = percentages.map((value, index) => {
    const percentUnits = decimalUnits(value, 6, 'milestone percentage');
    need(percentUnits > 0n && percentUnits <= denominator, 'COMMISSIONING_SOURCE_SPLIT', 'Each original milestone percentage must be positive and no more than 100.');
    const product = fee * percentUnits;
    return {index, originalPercent: value, percentUnits, units: product / denominator, remainder: product % denominator, roundingAdjustmentMinor: '0'};
  });
  need(portions.reduce((total, row) => total + row.percentUnits, 0n) === denominator,
    'COMMISSIONING_SOURCE_SPLIT', 'Original milestone percentages must total exactly 100.');
  let remaining = fee - portions.reduce((total, row) => total + row.units, 0n);
  const ranked = [...portions].sort((a,b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; remaining > 0n; index++, remaining--) {
    ranked[index].units++; ranked[index].roundingAdjustmentMinor = '1';
  }
  return portions.map(row => ({
    index: row.index, percentage: row.originalPercent, amount: money(row.units, currency),
    roundingAdjustmentMinor: row.roundingAdjustmentMinor,
    exactMinorUnits: row.remainder === 0n,
  }));
}
function stableIdentifier(value, name) {
  need(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value),
    'COMMISSIONING_STABLE_IDENTIFIER', 'Keep the original ' + name + ' identifier (up to 160 letters, digits, dots, underscores, colons or hyphens).');
  return value;
}
export function readCommissioningWorkshares(input, {currencyScales = {EUR:2,GBP:2,USD:2}} = {}) {
  need(plain(input), 'COMMISSIONING_SOURCE', 'Select one complete original workshare source.');
  const name = field(input.name, 'original source filename', 200);
  const bytes = Buffer.from(input.bytes ?? []);
  need(bytes.length > 0 && bytes.length <= COMMISSIONING_SOURCE_BYTES,
    'COMMISSIONING_SOURCE_LIMIT', 'The complete source must fit within 8 MiB.');
  const digest = sha(bytes);
  if (input.expectedSha256 !== undefined) need(HEX.test(input.expectedSha256) && digest === input.expectedSha256,
    'COMMISSIONING_SOURCE_CHANGED', 'The original workshare source differs from its selected SHA-256.', 409);
  let text;
  try { text = new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
  catch { need(false, 'COMMISSIONING_SOURCE_ENCODING', 'Use the unchanged UTF-8 workshare JSON.'); }
  const parsed = parseXeroNativeJson(text), original = parsed.value;
  need(plain(original) && original.schema === 'partner-commissioning-workshares/v1',
    'COMMISSIONING_SOURCE_SCHEMA', 'Select the original partner-commissioning-workshares/v1 source.');
  const rawProjects = list(original.projects, 'original projects', 200);
  need(rawProjects.length > 0, 'COMMISSIONING_SOURCE_EMPTY', 'The original source has no commissioning projects.');
  const seen = new Set();
  const projects = rawProjects.map((row, index) => {
    need(plain(row), 'COMMISSIONING_SOURCE_PROJECT', 'Keep each complete original project record.');
    const id = stableIdentifier(row.id, 'original project');
    need(!seen.has(id), 'COMMISSIONING_SOURCE_DUPLICATE', 'The original source repeats a project identifier.');
    seen.add(id);
    const code = field(row.currency, 'original accounting currency', 3);
    need(Object.hasOwn(currencyScales, code), 'COMMISSIONING_CURRENCY_SCALE', 'Configure the explicit accounting precision for ' + code + '.');
    const currency = currencyOf({code,scale:currencyScales[code]});
    const fee = sourceAmount(row.fee, currency, 'original project fee');
    const labels = list(row.milestones, 'original milestones', 40);
    const payments = list(row.payments, 'original payment split', 40);
    need(labels.length > 0 && labels.length === payments.length,
      'COMMISSIONING_SOURCE_MILESTONES', 'Retain the matching original milestone conditions and payment percentages.');
    const portions = splitFee(fee.units, payments, currency);
    return {
      id, sourceIndex:index, sourcePointer:'/projects/' + index,
      name:field(row.name, 'original project name', 500), currency, fee:fee.amount,
      originalFee:row.fee, stage:field(row.stage ?? 'unspecified', 'original contact stage', 100),
      owner:field(row.owner ?? '', 'original source owner', 500, true),
      caseId:field(row.case_id ?? '', 'original commercial case', 500, true),
      sourceUrl:field(row.source_url ?? '', 'original scope source URL', 4000, true),
      sourceCommit:row.source_commit ?? null, sourcePath:row.source_path ?? null,
      sourceInvoiceDays:integer(row.invoiceDays, 'original invoice term', 36500, true),
      source:clone(row),
      milestones:portions.map((part, position) => ({...part,
        key:id + '/' + position, condition:field(labels[position], 'original milestone condition', 4000)})),
    };
  });
  return {
    schema:COMMISSIONING_SOURCE_SCHEMA,
    file:{name,sha256:digest,bytes:bytes.length},
    sourceDate:optionalDate(original.source_date, 'original source date'),
    original, numericTokens:parsed.numericTokens, projects, bytes,
    roundingRule:'Largest remainder in currency minor units; original order breaks equal remainders. The complete original fee is preserved.',
  };
}
function positive(value, currency, name) {
  return money(minor(value, currency, name, {positive:true}), currency);
}
function nonnegative(value, currency, name) {
  return money(minor(value ?? '0', currency, name), currency);
}
function uniqueRows(rows, key, name) {
  const seen = new Set();
  for (const row of rows) {
    need(row !== null && row !== undefined, 'COMMISSIONING_SELECTION_ROW', 'Keep each complete ' + name + ' record.');
    const identity = key(row);
    need(!seen.has(identity), 'COMMISSIONING_DUPLICATE_SELECTION', 'Select each ' + name + ' once in the same milestone or project.');
    seen.add(identity);
  }
  return rows;
}
export function normalizeCommissioningSelection(source, value) {
  need(source?.schema === COMMISSIONING_SOURCE_SCHEMA && plain(value),
    'COMMISSIONING_SELECTION', 'Use the complete original workshare source and one review selection.');
  const asOf = dateValue(value.asOf, 'commissioning account date');
  const projectIds = uniqueRows(list(value.projectIds, 'selected project identifiers', 200)
    .map(id => stableIdentifier(id, 'selected original project')), id=>id, 'project');
  need(projectIds.length > 0, 'COMMISSIONING_SELECTION_EMPTY', 'Select at least one original project.');
  const original = new Map(source.projects.map(row=>[row.id,row]));
  need(projectIds.every(id=>original.has(id)), 'COMMISSIONING_PROJECT_UNKNOWN', 'Select projects retained in this exact source.');
  const inputs = list(value.projects ?? [], 'project controls', 200);
  uniqueRows(inputs, row=>row.projectId, 'project control');
  need(inputs.every(row=>plain(row) && projectIds.includes(row.projectId)),
    'COMMISSIONING_PROJECT_CONTROL', 'Bind controls only to projects in this selected cohort.');
  const byId = new Map(inputs.map(row=>[row.projectId,row]));
  const projects = projectIds.map(projectId => {
    const project = original.get(projectId), input = byId.get(projectId) ?? {}, currency = project.currency;
    const customerId = input.customerId === null || input.customerId === undefined || input.customerId === '' ? null : identifier(input.customerId, 'original customer');
    const controls = list(input.milestones ?? [], 'milestone controls', 40);
    uniqueRows(controls, row=>row.index, 'milestone index');
    need(controls.every(row=>plain(row) && Number.isInteger(row.index) && row.index >= 0 && row.index < project.milestones.length),
      'COMMISSIONING_MILESTONE_INDEX', 'Select an original milestone index.');
    const byIndex = new Map(controls.map(row=>[row.index,row]));
    const milestones = project.milestones.map(originalMilestone => {
      const row = byIndex.get(originalMilestone.index) ?? {};
      const invoiceDays = integer(row.invoiceDays === undefined ? project.sourceInvoiceDays : row.invoiceDays, 'scenario invoice term', 36500, true);
      const invoiceLines = uniqueRows(list(row.invoiceLines ?? [], 'original invoice line bindings').map(line => {
        need(plain(line) && HEX.test(line.invoiceSha256 ?? ''), 'COMMISSIONING_INVOICE_SOURCE', 'Keep the selected invoice.json SHA-256 with every original line binding.');
        const netAmount = nonnegative(line.netAmount, currency, 'bound invoice net'), taxAmount = nonnegative(line.taxAmount, currency, 'bound invoice tax');
        need(minor(netAmount,currency)+minor(taxAmount,currency)>0n, 'COMMISSIONING_EMPTY_BINDING', 'A bound line needs a positive net or tax portion.');
        return {invoiceId:identifier(line.invoiceId,'original invoice'), invoiceSha256:line.invoiceSha256,
          invoiceLineId:stableIdentifier(line.invoiceLineId,'original invoice line'),netAmount,taxAmount};
      }), line=>line.invoiceId+'/'+line.invoiceLineId, 'invoice line');
      const allocations = uniqueRows(list(row.allocations ?? [], 'original allocation portions').map(part => ({
        allocationId:identifier(part?.allocationId,'original allocation'),amount:positive(part?.amount,currency,'allocated cash portion'),
      })), part=>part.allocationId, 'allocation');
      const credits = uniqueRows(list(row.credits ?? [], 'original credit portions').map(part => {
        need(plain(part),'COMMISSIONING_CREDIT_SELECTION','Keep each complete original credit portion.');
        const netAmount=nonnegative(part.netAmount,currency,'credit net portion'),taxAmount=nonnegative(part.taxAmount,currency,'credit tax portion');
        need(minor(netAmount,currency)+minor(taxAmount,currency)>0n,'COMMISSIONING_EMPTY_CREDIT','A credit needs a positive net or tax portion.');
        return {creditId:identifier(part.creditId,'original credit'),invoiceLineId:stableIdentifier(part.invoiceLineId,'original credited invoice line'),netAmount,taxAmount};
      }), part=>part.creditId+'/'+part.invoiceLineId, 'credit line');
      return {index:originalMilestone.index,
        acceptedDate:optionalDate(row.acceptedDate,'recorded milestone acceptance date'),
        plannedAcceptedDate:optionalDate(row.plannedAcceptedDate,'planned milestone acceptance date'),
        invoiceDays,delayDays:integer(row.delayDays ?? 0,'planned collection delay'),
        invoiceTermSource:invoiceDays===null?'UNSPECIFIED':invoiceDays===project.sourceInvoiceDays?'ORIGINAL_SOURCE':'OPERATOR_SCENARIO',
        invoiceLines,allocations,credits};
    });
    for(const key of ['acceptedDate','plannedAcceptedDate']) {
      const dates=milestones.map(row=>row[key]).filter(Boolean);
      need(dates.every((date,index)=>index===0||date>=dates[index-1]),'COMMISSIONING_MILESTONE_ORDER',
        'Keep the original milestone order for ' + key + '.');
    }
    const receipts=uniqueRows(list(input.receipts??[],'original receipt portions').map(part=>({
      receiptId:identifier(part?.receiptId,'original receipt'),amount:positive(part?.amount,currency,'receipt cash portion'),
    })),part=>part.receiptId,'receipt');
    const refunds=uniqueRows(list(input.refunds??[],'original refund portions').map(part=>({
      refundId:identifier(part?.refundId,'original refund'),amount:positive(part?.amount,currency,'refund cash portion'),
    })),part=>part.refundId,'refund');
    const xeroCycleIds=uniqueRows(list(input.xeroCycleIds??[],'original Xero cash cycles',200)
      .map(id=>identifier(id,'original Xero cash cycle')),id=>id,'Xero cash cycle');
    return {projectId,customerId,milestones,receipts,refunds,xeroCycleIds};
  });
  const selectedRows = projects.reduce((total, project) => total + project.receipts.length + project.refunds.length +
    project.xeroCycleIds.length + project.milestones.reduce((sum, row) => sum + row.invoiceLines.length + row.allocations.length + row.credits.length, 0), 0);
  need(selectedRows <= 30000, 'COMMISSIONING_SELECTION_LIMIT', 'Keep at most 30,000 original monetary and source bindings in one complete cohort.');
  return {label:field(value.label??('Commissioning collections '+asOf),'commissioning review label',300),asOf,projectIds,projects,
    baselineCaptureId:value.baselineCaptureId===null||value.baselineCaptureId===undefined?null:identifier(value.baselineCaptureId,'original baseline capture')};
}
