// MIT. FRED customer procedures use the existing editable OperatingPlan model.
import { createOperatingPlan, createOperatingStep, snapshotRegistration, inspectOperatingPlan,
  operatingPlanDraft, saveOperatingPlanRevision } from './operating-plan.mjs';

export const FRED_OPERATING_SOURCE_SCHEMA = 'stellar-forge.fred-operating-source.v1';
export const FRED_OPERATING_PHASES = Object.freeze([
  'sources','acquisition','review','recurring','releases','migration','historical','publications','customer','handover'
]);
const BINDING = 'stellar-forge.fred-operating-binding.v1';
const RESULT = 'stellar-forge.fred-operating-result.v1';
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
const clone = value => JSON.parse(JSON.stringify(value));
const need = (ok, message, code = 'FRED_OPERATING_SOURCE') => {
  if (!ok) throw Object.assign(new TypeError(message), {code});
};
function fields(value, keys, label) {
  need(plain(value) && Object.keys(value).every(key => keys.includes(key)), label + ' has unsupported fields.');
}
function text(value, label, maximum = 2000, required = true) {
  need(typeof value === 'string' && value.length <= maximum &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) &&
    (!required || value.trim().length > 0), 'Retain valid ' + label + '.');
  return value;
}
function time(value, label) {
  need(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,19) === value.slice(0,19),
    'Retain the original UTC ' + label + '.');
}
function hash(value, label) { need(typeof value === 'string' && HASH.test(value), 'Retain the original ' + label + ' SHA-256.'); }
function artifact(value, label) {
  fields(value, ['path','bytes','sha256'], label);
  text(value.path, label + ' relative path');
  need(!value.path.startsWith('/') && !value.path.includes('\\') &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value.path) &&
    value.path.split('/').every(part => part && part !== '.' && part !== '..'),
    'Retain ' + label + ' inside the complete source package.');
  need(Number.isSafeInteger(value.bytes) && value.bytes >= 0, 'Retain the exact ' + label + ' byte length.');
  hash(value.sha256, label);
}
function json(value, label) {
  const visit = item => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') { need(Number.isFinite(item), label + ' contains a nonfinite number.'); return; }
    if (Array.isArray(item)) { item.forEach(visit); return; }
    need(plain(item), label + ' must contain ordinary JSON values.');
    for (const [key, child] of Object.entries(item)) {
      need(!['__proto__','constructor','prototype'].includes(key), label + ' contains an unsupported key.');
      visit(child);
    }
  };
  visit(value);
}
/** Inspect the portable descriptor. The native receiver checks all complete artifact bytes and prefix hashes. */
export function inspectFredOperatingSource(value) {
  fields(value, ['schema','id','capturedAt','project','artifact','history','inventory','published','evidence'], 'FRED source');
  need(value.schema === FRED_OPERATING_SOURCE_SCHEMA &&
    typeof value.id === 'string' && /^fred-operating-source-[a-f0-9]{64}$/.test(value.id),
    'Choose an original FRED operating source descriptor.');
  time(value.capturedAt, 'source capture time');
  fields(value.project, ['id','title','revision','createdAt','selection','bundleSha256'], 'FRED project');
  need(typeof value.project.id === 'string' && /^[a-f0-9-]{36}$/.test(value.project.id),
    'Retain the original economic project ID.');
  text(value.project.title, 'project title', 160);
  time(value.project.createdAt, 'project creation time');
  need(Number.isSafeInteger(value.project.revision) && value.project.revision >= 1,
    'Retain the selected project revision.');
  need(plain(value.project.selection), 'Retain the complete original economic selection.');
  json(value.project.selection, 'Project selection'); hash(value.project.bundleSha256, 'project bundle');
  artifact(value.artifact, 'Complete project');
  need(Array.isArray(value.history) && value.history.length === value.project.revision,
    'Retain every original project history checkpoint.');
  value.history.forEach((item,index) => {
    fields(item, ['revision','sha256'], 'Project history');
    need(item.revision === index + 1, 'Keep the original project history in consecutive revision order.');
    hash(item.sha256, 'history prefix');
  });
  need(plain(value.inventory), 'Retain the original complete source inventories.');
  json(value.inventory, 'Source inventories');
  need(Array.isArray(value.published), 'Retain all original current-publication operations.');
  const publicationIds = new Set();
  for (const item of value.published) {
    fields(item, ['id','view','artifact'], 'Current publication');
    need(typeof item.id === 'string' && ID.test(item.id) && !publicationIds.has(item.id),
      'Retain distinct current-publication operation IDs.');
    publicationIds.add(item.id);
    need(plain(item.view), 'Retain the full original current-publication view.');
    json(item.view, 'Current-publication view');
    if (item.artifact !== null) artifact(item.artifact, 'Complete current-publication edition');
  }
  need(Array.isArray(value.evidence), 'Retain the original source result references.');
  const evidenceIds = new Set(), paths = new Map();
  const artifacts = [value.artifact,...value.published.map(item => item.artifact).filter(Boolean)];
  for (const item of value.evidence) {
    fields(item, ['id','kind','reference','artifact'], 'Original source reference');
    text(item.id, 'source reference ID', 2000); text(item.kind, 'source reference kind', 200);
    text(item.reference, 'source reference', 4000);
    need(!evidenceIds.has(item.id), 'Each original result reference needs its own ID.');
    evidenceIds.add(item.id); artifact(item.artifact, 'Original source reference'); artifacts.push(item.artifact);
  }
  for (const item of artifacts) {
    const prior = paths.get(item.path);
    need(!prior || prior.bytes === item.bytes && prior.sha256 === item.sha256,
      'A source artifact path has conflicting bytes: ' + item.path);
    paths.set(item.path, item);
  }
  const sourcePaths = new Map([value.artifact,...value.published.map(item=>item.artifact).filter(Boolean)]
    .map(item => [item.path,item]));
  for (const item of value.evidence) {
    const original = sourcePaths.get(item.artifact.path);
    need(original && original.bytes === item.artifact.bytes && original.sha256 === item.artifact.sha256,
      'Each result reference must point into the retained complete project or publication edition.');
  }
  return clone(value);
}
const DEFINITIONS = [
  ['sources','Receive the economic project',
    'Open the complete native FRED project and the separate current-publication editions. Check the selected project revision, original observation sources and saved period/unit choices. Keep all existing customer revisions when receiving an older procedure.',
    'The recipient can reopen the selected source project, its reports and every carried current-publication edition.'],
  ['acquisition','Select and acquire the source edition',
    'Choose the saved economic selection and its explicit source mode. API vintage, ALFRED vintage and current-publication retrieval have different time bases. Continue the same retained acquisition after an interruption and review its actual source coverage.',
    'The original response files, selected dates, missing values and source mode remain attached to the saved capture.'],
  ['review','Review observations and the analyst report',
    'Inspect the saved source and comparison, retain the requested units and period rules, then use the existing review and briefing workflow. Record the reviewed capture and report IDs with the customer’s actual decision.',
    'A saved review connects the complete original observations to the selected report and its full output files.'],
  ['recurring','Continue the recurring briefing',
    'Select the original saved briefing template, baseline and prior successor. Preview the new source edition before saving the successor; retain its exact original-period comparisons and the customer’s editorial changes.',
    'The saved successor preserves its original template, baseline and reviewed report lineage.'],
  ['releases','Work the release plan',
    'Inspect the saved release capture and watch. Review the native catch-up plan and each actual information vintage before acquiring it. Keep the returned release dates separate from observation periods and source retrieval time.',
    'Each selected release-plan acquisition retains its requested vintage, original source response and complete plan.'],
  ['migration','Review the Board-to-FRED migration',
    'Open the retained Board package and published crosswalk. Resolve every mapping, unit, scale and period decision in the saved migration plan. Inspect the full receiving, including explicit unavailable and source-only rows.',
    'The complete migration preserves all selected Board series, source files, mapping decisions and original comparison rows.'],
  ['historical','Receive the historical ALFRED edition',
    'Select ALFRED explicitly for the saved historical migration. Load the original metadata edition when available and inspect its covering real-time intervals. Resume the same metadata-bound operation and reopen its complete saved receiving.',
    'The historical CSV, selected vintage, metadata coverage and original metadata source remain in the immutable receiving edition.'],
  ['publications','Deliver the current-publication comparison',
    'Open the existing completed publication operation or continue its original collection. Review its full source population and comparison, then retain the complete edition archive with its original file identities.',
    'The full current-publication report, observation rows and original transport files are available in the carried edition.'],
  ['customer','Continue the configured customer delivery',
    'Use the original configured merchant and customer workflow for the selected saved publication. Keep the original customer intent and saved delivery through any recovery, and record the returned customer outcome.',
    'The original publication, customer intent and delivered files remain connected to the selected economic project.'],
  ['handover','Hand over the editable procedure and sources',
    'Export this complete OperatingPlan history with the complete native source package. Receive it through the existing prefix-history merge, reopen the FRED project and original publication editions, and save any customer revisions in the same plan.',
    'The customer receives an editable procedure, full source files, retained outcomes and both complete histories.']
];
function binding(source) {
  return {schema:BINDING,sourceId:source.id,capturedAt:source.capturedAt,
    project:{id:source.project.id,revision:source.project.revision,
      historySha256:source.history.at(-1).sha256,bundleSha256:source.project.bundleSha256},
    artifact:source.artifact};
}
const PHASE_INVENTORY = {
  sources:['captures','reviews','publications','ddpCrosswalks','ddpPackages'],
  acquisition:['captures'],review:['captures','reviews'],recurring:['briefingTemplates','briefingSuccessors'],
  releases:['releaseCaptures','releaseWatches','releasePlans','releaseCatchUps'],
  migration:['ddpCrosswalks','ddpPackages','ddpMigrations','ddpReceivings'],
  historical:['ddpMigrations','ddpReceivings','captures'],publications:['ddpMigrations'],
  customer:['publications','qcew'],handover:[]
};
const RESEARCH_PHASE_CONTEXT = {
  sources:{
    instruction:' Receive the retained research catalogue with its original question and product definitions, version histories and source snapshots. Each complete original response remains in the carried native project.',
    expectedResult:' The research catalogue and its original source snapshots reopen with the same project.'
  },
  review:{
    instruction:' Inspect the selected research definition and source snapshot, then retain the original reviewer decision, reviewer, note and reviewed time. Follow the saved product edition back to its exact definition, sources and review.',
    expectedResult:' Research decisions and product editions retain their original definition, source and review references.'
  },
  handover:{
    instruction:' Carry the complete research catalogue, definition histories, original source snapshots, saved reviews and product editions with this same economic project. Use the retained research references when recording the handover outcome.',
    expectedResult:' The receiving project preserves the complete original research catalogue, source bodies and saved product lineage.'
  }
};
function researchInputs(source, phase) {
  if (!RESEARCH_PHASE_CONTEXT[phase] || !Object.hasOwn(source.inventory,'research')) return null;
  const research = source.inventory.research;
  const families = ['entries','sources','reviews','products'];
  const collections = {};
  for (const family of families) {
    const rows = plain(research) && Array.isArray(research[family]) ? research[family] : null;
    collections[family] = {reference:'/state/research/' + family,records:rows ? rows.length : null};
    if (rows && (family === 'entries' || family === 'products')) {
      collections[family].definitionVersions = rows.reduce((count,item) =>
        count + (Array.isArray(item?.versions) ? item.versions.length : 0),0);
    }
    if (rows && family === 'products') {
      collections[family].editions = rows.reduce((count,item) =>
        count + (Array.isArray(item?.editions) ? item.editions.length : 0),0);
    }
  }
  const evidence = source.evidence.filter(item => item.reference === '/state/research' ||
    families.some(family => item.reference.startsWith('/state/research/' + family + '/')));
  return {reference:'/state/research',collections,
    evidence:{reference:'source.json#/evidence',records:evidence.length,
      selection:'Use the retained references whose original project pointer is /state/research or one of its collections.'},
    originalSource:'Complete research source response bytes remain in the original project artifact.'};
}
function phaseInputs(source, phase) {
  const inventory = {};
  for (const key of PHASE_INVENTORY[phase]) {
    const value = source.inventory[key];
    inventory[key] = {reference:'/state/' + key, records:Array.isArray(value) ? value.length : value === undefined ? 0 : null};
  }
  const research = researchInputs(source, phase);
  return {sourceId:source.id,project:binding(source).project,originalProject:source.artifact,
    inventory, ...(research === null ? {} : {research}), currentPublicationOperations:source.published.length,
    originalSourceDescriptor:'source.json',
    sourceBasis:'Read complete source inventories and publication file descriptors from source.json and their retained artifacts.'};
}
function phaseOptions(value, label) {
  fields(value, FRED_OPERATING_PHASES, label);
}
export function createFredOperatingPlan({source,catalog,id,title = 'Economic data operating plan',
  customer = '',owner = '',period = '',savedAt = new Date().toISOString(),
  registrations = {},argvByPhase = {}} = {}) {
  const selected = inspectFredOperatingSource(source);
  phaseOptions(registrations, 'Selected registrations'); phaseOptions(argvByPhase, 'Selected arguments');
  const steps = DEFINITIONS.map(([phase,heading,instruction,expectedResult]) => {
    const itemId = registrations[phase];
    const selection = itemId === undefined ? null : snapshotRegistration(catalog,text(itemId,'catalog item ID'));
    const argv = argvByPhase[phase] ?? [];
    need(selection !== null || Array.isArray(argv) && argv.length === 0,
      'Choose an installed registration before retaining command arguments for ' + phase + '.');
    const researchContext = Object.hasOwn(selected.inventory,'research') ? RESEARCH_PHASE_CONTEXT[phase] : null;
    return createOperatingStep({id:'fred-' + phase,title:heading,instruction:instruction + (researchContext?.instruction ?? ''),
      inputs:JSON.stringify(phaseInputs(selected,phase),null,2),expectedResult:expectedResult + (researchContext?.expectedResult ?? ''),
      owner,status:'planned',recordedResult:'',selection,argv});
  });
  return createOperatingPlan({id,title,customer,owner,period,savedAt,steps,
    purpose:'Operate the original economic project from source selection and analyst review through recurring delivery, migration and customer handover.',
    receiving:'Carry this entire editable plan history with source.json, the complete native FRED project and every listed current-publication edition. Open the plan through the existing Operating Plans receive action and the source through fred-operating-plan receive-source.',
    notes:JSON.stringify(binding(selected),null,2)});
}
function originalBinding(plan) {
  let value;
  try { value = JSON.parse(plan.revisions[0].notes); } catch {
    need(false,'The first plan revision must retain its original economic source binding.','FRED_OPERATING_BINDING');
  }
  need(value?.schema === BINDING && typeof value.project?.id === 'string' &&
    Number.isSafeInteger(value.project.revision) && value.project.revision >= 1 &&
    HASH.test(value.project.historySha256 ?? ''), 'Use the original FRED procedure binding.','FRED_OPERATING_BINDING');
  return value;
}
/** Check that a complete procedure belongs to this original economic project history. */
export function inspectFredOperatingPlanSource(plan, source) {
  const current = inspectOperatingPlan(plan),selected = inspectFredOperatingSource(source),original = originalBinding(current);
  need(selected.project.id === original.project.id &&
    selected.history.some(item => item.revision === original.project.revision && item.sha256 === original.project.historySha256),
    'Receive the procedure with its original economic project or retained continuation.','FRED_OPERATING_LINEAGE');
  return {plan:current,source:selected};
}
/** Append to the latest customer revision; every selected reference belongs to the original retained source lineage. */
export function recordFredOperatingResult(plan,{source,stepId,status,result,owner,savedAt = new Date().toISOString()} = {}) {
  const {plan:current,source:selected} = inspectFredOperatingPlanSource(plan,source);
  need(FRED_OPERATING_PHASES.some(phase => stepId === 'fred-' + phase), 'Select an original FRED procedure step.');
  need(['planned','in-progress','completed','skipped'].includes(status), 'Choose an ordinary recorded step status.');
  fields(result,['summary','evidenceIds'],'Reviewed result');
  text(result.summary,'reviewed result summary',16000);
  need(Array.isArray(result.evidenceIds) && result.evidenceIds.length <= 100 &&
    result.evidenceIds.every(id => typeof id === 'string') &&
    new Set(result.evidenceIds).size === result.evidenceIds.length, 'Select distinct original result references.');
  const evidence = result.evidenceIds.map(id => {
    const item = selected.evidence.find(value => value.id === id);
    need(item,'The selected source has no result reference ' + id + '.'); return item;
  });
  need(status !== 'completed' || evidence.length > 0, 'Choose the retained result supporting this completed step.');
  const draft = operatingPlanDraft(current),step = draft.content.steps.find(item => item.id === stepId);
  need(step,'This step was removed from the latest customer plan; restore it explicitly before recording an outcome.');
  if (owner !== undefined) step.owner = text(owner,'operating owner',300,false);
  step.status = status;
  step.recordedResult = JSON.stringify({schema:RESULT,summary:result.summary,reviewedBy:step.owner,
    source:binding(selected),evidence},null,2);
  return saveOperatingPlanRevision(current,draft,{savedAt});
}
