#!/usr/bin/env node
// MIT. Complete editable receiving walkthrough using the retained reader budget.
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {
  createPlanningBook, addPlanningTable, retainPlanningTableReview, planningRoleCsv,
  serializePlanningBook, importPlanningBook, rebasePlanningBook, receivePlanningEdition,
  sourceEditionComparison, preparePlanningImport,
} from '../../source-tables-core.mjs';
import {runPlanningSourceTables} from '../../source-tables-cli.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const nativeCli=resolve(HERE,'../../cli.py'), execute=promisify(execFile);
const json=value=>JSON.stringify(value,null,2)+'\n';
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const need=(value,message)=>{if(!value)throw new Error(message);};
const rawJson=async path=>JSON.parse(await readFile(path,'utf8'));
async function native(args) {
  try {return JSON.parse((await execute('python3',[nativeCli,...args],{encoding:'utf8',maxBuffer:128*1024*1024})).stdout);}
  catch(error){throw new Error(String(error.stderr||error.message));}
}
async function save(path,value) {await writeFile(path,typeof value==='string'?value:json(value),{flag:'wx',mode:0o600});return path;}
function csv(rows) {return rows.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';}
function typed(book,role) {
  const binding=book.bindings.find(x=>x.role===role), document=book.project.documents.find(x=>x.id===binding.documentId);
  const keys=role==='packages'?['package_id']:role==='milestones'?['tranche']:role==='contributors'?['id']:['costId','contributorId'];
  document.mapping.keyColumns=keys.map(key=>document.mapping.columns.find(column=>column.sourceName===key).index);
  for(const column of document.mapping.columns) {
    if(['planned_hours','planning_rate_usd_per_hour','planned_cost_usd','weeklyHours','hours'].includes(column.sourceName)) column.type='decimal-text';
    if(['tranche','start_day_after_actual_award_acceptance','end_day_after_actual_award_acceptance','submit_day','review_and_payment_lag_days'].includes(column.sourceName)) column.type='integer';
  }
  return book;
}
export async function receiveCurrentBudget(directory) {
  const root=resolve(directory);
  await mkdir(root,{mode:0o700});
  const workspace=join(root,'authoring'), receiver=join(root,'receiving');
  const seed=await native(['init','--workspace',workspace]);
  const id=seed.plans[0]?.id;
  need(id,'The original planner must provide its current candidate.');
  const original=await native(['show','--workspace',workspace,'--plan',id,'--part','all']);
  const source=await readFile(join(HERE,'current-reader-budget.csv'),'utf8');
  const binding=await rawJson(join(HERE,'current-reader-budget.binding.json'));
  need(original.scenario.future_costs.length===6 && String(original.scenario.award_request_usd)==='38000',
    'Use the retained six-package current candidate; review a changed source before this walkthrough.');
  let book=createPlanningBook(original,{name:'Current reader budget and source-table receiving'});
  book=await addPlanningTable(book,{role:'packages',filename:'current-reader-budget.csv',sourceText:source,delimiter:','});
  Object.assign(book.bindings.find(x=>x.role==='packages'),binding);
  typed(book,'packages'); book=await retainPlanningTableReview(book,'packages');
  book=await addPlanningTable(book,{role:'milestones',filename:'original-milestones.csv',sourceText:planningRoleCsv(original,'milestones'),delimiter:','});
  typed(book,'milestones');book=await retainPlanningTableReview(book,'milestones');

  const capacityNote='Operator-selected walkthrough capacity. Assign the actual accountable contributor and capacity before operational use.';
  const contributors=csv([['id','name','weeklyHours','note'],['delivery-owner','Delivery owner (planning input)','40',capacityNote]]);
  book=await addPlanningTable(book,{role:'contributors',filename:'selected-capacity.csv',sourceText:contributors,delimiter:','});
  typed(book,'contributors');book=await retainPlanningTableReview(book,'contributors');
  const assignments=csv([['costId','contributorId','hours'],...original.scenario.future_costs.map(row=>[row.id,'delivery-owner',row.estimated_hours])]);
  book=await addPlanningTable(book,{role:'assignments',filename:'selected-work-assignments.csv',sourceText:assignments,delimiter:','});
  typed(book,'assignments');book=await retainPlanningTableReview(book,'assignments');
  const firstProject=await save(join(root,'source-project-1.json'),serializePlanningBook(book));
  const firstPreview=join(root,'native-preview-1.json');
  const calculated1=await runPlanningSourceTables(['preview','--project',firstProject,'--workspace',workspace,'--plan',id,'--output',firstPreview]);
  need(String(calculated1.hours)==='400' && String(calculated1.awardRequestUsd)==='38000','Read the complete native result for the retained original budget.');
  const first=await runPlanningSourceTables(['save','--preview',firstPreview,'--workspace',workspace,
    '--note','Reviewed the original reader budget, complete milestones and explicitly selected walkthrough capacity.',
    '--request-id','source-tables-current-budget-first','--output-directory',join(root,'edition-1')]);
  const saved1=await rawJson(join(root,'edition-1','plan.json'));
  book=rebasePlanningBook(await importPlanningBook(saved1.planning.sourceTables),saved1);

  // This is a separately saved operator alternative; the original CSV remains retained.
  const revised=source.replace('Merchant-resource integration,80,95,7600,prospective',
    'Merchant-resource integration,81,95,7695,prospective');
  need(revised!==source,'Receive the exact retained source row before applying the one-hour operator alternative.');
  book=await receivePlanningEdition(book,'packages',{filename:'reviewed-budget-alternative.csv',sourceText:revised});
  book=await retainPlanningTableReview(book,'packages');
  book.settings.scenarioName=original.scenario.scenario_name+' — reviewed one-hour alternative';
  book.settings.awardRequestUsd='38095';
  const comparison=sourceEditionComparison(book,'packages');
  need(comparison.summary.changed===1 && comparison.summary.unchanged===5 &&
    comparison.summary.added===0 && comparison.summary.removed===0,'Retain the exact source edition comparison.');
  await save(join(root,'source-edition-comparison.json'),comparison);
  const secondProject=await save(join(root,'source-project-2.json'),serializePlanningBook(book));
  const secondPreview=join(root,'native-preview-2.json');
  const calculated2=await runPlanningSourceTables(['preview','--project',secondProject,'--workspace',workspace,'--plan',id,'--output',secondPreview]);
  need(String(calculated2.hours)==='401' && String(calculated2.awardRequestUsd)==='38095','Read the original native calculation for the reviewed alternative.');
  const saveArgs=['save','--preview',secondPreview,'--workspace',workspace,
    '--note','Reviewed the retained successor source, exact one-hour change and complete native result.',
    '--request-id','source-tables-current-budget-successor','--output-directory',join(root,'edition-2')];
  const second=await runPlanningSourceTables(saveArgs);
  const replay=await runPlanningSourceTables(saveArgs);
  need(json(second)===json(replay),'The repeated original request must return the same complete delivery.');
  const saved2=await rawJson(join(root,'edition-2','plan.json'));
  const portable=await importPlanningBook(saved2.planning.sourceTables);
  need(portable.bindings.length===4 && portable.reviews.length===2,'Reopen all four source roles and both complete native import reviews.');
  const packages=portable.project.documents.find(doc=>doc.id===portable.bindings.find(row=>row.role==='packages').documentId);
  need(packages.editions.length===2 && packages.editions[0].sourceText===source && packages.editions[1].sourceText===revised,
    'Retain both complete original source editions through native save.');

  const imported=await native(['import-bundle','--workspace',receiver,'--file',join(root,'edition-2','planning.zip'),
    '--name','Received editable source-table plan','--request-id','source-tables-current-budget-receiving']);
  const received=await native(['show','--workspace',receiver,'--plan',imported.plan.id,'--part','all']);
  need(received.contentSha256===saved2.contentSha256 && received.revision===saved2.revision,
    'The original complete planning receiver must retain the saved content and revision history.');
  const receivedBook=await importPlanningBook(received.planning.sourceTables);
  const continuation=rebasePlanningBook(receivedBook,received);
  const prepared=await preparePlanningImport(continuation);
  need(prepared.planId===received.id && prepared.expectedRevision===received.revision && prepared.review.sourceRows.length===16,
    'The received native plan must support a complete next editable source import.');
  await save(join(root,'received-source-project.json'),serializePlanningBook(continuation));

  const result={schema:'stellar-forge.planning-source-tables.receiving-walkthrough.v1',
    originalSource:{path:'current-reader-budget.csv',bytes:Buffer.byteLength(source),sha256:hash(Buffer.from(source))},
    sourceRoles:portable.bindings.map(row=>row.role),originalBudget:{hours:calculated1.hours,awardRequestUsd:calculated1.awardRequestUsd},
    selectedAlternative:{hours:calculated2.hours,awardRequestUsd:calculated2.awardRequestUsd},
    comparison:comparison.summary,first,second,identicalRequestReplay:true,
    received:{id:received.id,revision:received.revision,contentSha256:received.contentSha256},
    editableSourceRows:prepared.review.sourceRows.length,sourceEditions:packages.editions.length};
  await save(join(root,'RECEIVING.json'),result);
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.argv[2]||process.argv[2]==='--help') {
    process.stdout.write('node receive-current-budget.mjs NEW_PRIVATE_DIRECTORY\nCreates the complete original budget and a separately saved one-hour planning alternative, then receives the editable native ZIP.\n');
  } else receiveCurrentBudget(process.argv[2]).then(result=>process.stdout.write(json(result))).catch(error=>{
    process.stderr.write(json({error:error.message}));process.exitCode=1;
  });
}
