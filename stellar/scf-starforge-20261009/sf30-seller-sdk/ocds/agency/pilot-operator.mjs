#!/usr/bin/env node
// Agency-owned file workflow for the merged OCDS operator. Node 22.13+; no additional packages.
import { readFile, writeFile, mkdir, stat, copyFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, join, dirname, isAbsolute, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { trackerCsv, trackerRow } from './tracker-core.mjs';

const SCHEMA = 'tjlabs.ocds.agency-pilot.v1';
const WINDOW_SCHEMA = 'tjlabs.ocds.agency-window.v1';
const hash = value => createHash('sha256').update(value).digest('hex');
const need = (condition, message) => { if (!condition) throw new Error(message); };
const json = value => JSON.stringify(value, null, 2) + '\n';
const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const HELP = [
  'Agency procurement operator',
  'node pilot-operator.mjs init --config pilot.json',
  'node pilot-operator.mjs window --config pilot.json --name baseline --out ./runs/baseline',
  'node pilot-operator.mjs window --config pilot.json --name followup-1 --baseline ./runs/baseline/window.json --out ./runs/followup-1',
  'node pilot-operator.mjs meters --config pilot.json',
  'node pilot-operator.mjs source-select --config pilot.json',
  'node pilot-operator.mjs refresh --config pilot.json --name baseline --out ./runs/fresh-baseline',
  'node pilot-operator.mjs refresh-resume --config pilot.json --run ./runs/fresh-baseline/source-window-runs.json --out ./runs/baseline-continued',
  'node pilot-operator.mjs source-handoff --config pilot.json --portfolio portfolio-01 --out ./handoffs/source-client-01',
  'node pilot-operator.mjs source-receive --config pilot.json --portfolio portfolio-01 --directory ./handoffs/source-client-01 --expected-revision 0',
  'node pilot-operator.mjs handoff --config pilot.json --portfolio portfolio-01 --baseline ./runs/baseline/window.json --out ./handoffs/client-01',
  '',
  'Saved source refresh acquires publishers/documents, assigns material reviews and exports current client handoffs.',
  'Manual import, capture, review and receiving continue through the original OCDS CLI/UI.',
  'Every output directory is new; use a new path for corrections.',
  'A handoff contains only the chosen portfolio and its explicitly selected OCIDs.'
].join('\n');

async function setup(filename) {
  need(filename, '--config is required');
  const file = resolve(filename), base = dirname(file), config = await readJson(file);
  need(config.schema === SCHEMA, 'Unsupported pilot configuration schema');
  need(isAbsolute(config.productSourceDirectory || '') && !config.productSourceDirectory.includes('/ABSOLUTE/'),
    'Set productSourceDirectory to the absolute installed OCDS source directory');
  need(typeof config.operator === 'string' && config.operator.trim() && config.operator.length <= 256,
    'Set the agency operator identity');
  need(Array.isArray(config.portfolios) && config.portfolios.length > 0 && config.portfolios.length <= 5,
    'Configure one to five separate client portfolios');
  need(config.limits && ['clientWorkspaces','uniquePayloads','distinctSelectedOcids','sourceAndDocumentBytes']
    .every(key=>Number.isSafeInteger(config.limits[key]) && config.limits[key]>0), 'Scope meters require positive integer limits');
  need(Array.isArray(config.windows), 'Keep the three configured source-window records');
  const ids = new Set();
  for (const p of config.portfolios) {
    need(/^[a-z0-9][a-z0-9-]{0,63}$/.test(p.id || '') && !ids.has(p.id), 'Portfolio IDs must be unique path-safe identifiers');
    ids.add(p.id);
    need(typeof p.label === 'string' && p.label.trim(), 'Every portfolio needs its own label');
    need(Array.isArray(p.selectedOcids) && p.selectedOcids.every(x => typeof x === 'string' && x.length > 0)
      && new Set(p.selectedOcids).size === p.selectedOcids.length, 'selectedOcids must contain unique original OCIDs');
    need(!p.contextBindings || (typeof p.contextBindings === 'object' && !Array.isArray(p.contextBindings)),
      'contextBindings must map an OCID to a retained entry ID');
  }
  const workspaceRoot = resolve(base, config.workspaceRoot);
  const native = await import(pathToFileURL(join(config.productSourceDirectory, 'workspace.mjs')).href);
  need(typeof native.OcdsWorkspace === 'function', 'The installed source does not export OcdsWorkspace');
  const contextData = await readJson(resolve(base, config.contextsFile));
  need(contextData.schema === 'tjlabs.ocds.agency-source-context.v1' && Array.isArray(contextData.contexts),
    'Use the source-contexts.json supplied with this kit');
  const contexts = new Map();
  for (const context of contextData.contexts) {
    need(typeof context.ocid === 'string' && !contexts.has(context.ocid), 'Source contexts need unique original OCIDs');
    contexts.set(context.ocid, context);
  }
  const documentData = await readJson(resolve(base, config.documentsFile));
  const retrievalData = await readJson(resolve(base, config.retrievalsFile));
  need(Array.isArray(documentData.documents) && Array.isArray(retrievalData.retrievals),
    'Documents and retrievals registers must retain their array shapes');
  return {file,base,config,workspaceRoot,native,contexts,documents:documentData.documents,retrievals:retrievalData.retrievals};
}
function workspaceDirectory(env, portfolio) { return join(env.workspaceRoot, portfolio.id); }
async function openWorkspace(env, portfolio) {
  const directory = workspaceDirectory(env, portfolio);
  need((await stat(join(directory, 'workspace.sqlite'))).isFile(), 'Initialize the portfolio before reading it: ' + portfolio.id);
  return new env.native.OcdsWorkspace(directory, {operator:env.config.operator,title:portfolio.label});
}
async function fileIdentity(filename) {
  const digest = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(filename)) { digest.update(chunk); bytes += chunk.length; }
  return {sha256:digest.digest('hex'),bytes};
}
async function documents(env) {
  const ids = new Set(), result = [];
  for (const item of env.documents) {
    need(/^[a-z0-9][a-z0-9-]{0,95}$/.test(item.id || '') && !ids.has(item.id),
      'Document register IDs must be unique and path-safe');
    ids.add(item.id);
    need(Array.isArray(item.ocids) && item.ocids.every(x => typeof x === 'string'), 'Each document must list its associated OCIDs');
    if (!item.path) { result.push({...item,available:false}); continue; }
    const path = resolve(env.base, item.path), identity = await fileIdentity(path);
    if (item.sha256) need(item.sha256 === identity.sha256, 'Original document SHA-256 changed: ' + item.id);
    if (item.bytes !== undefined && item.bytes !== null) need(item.bytes === identity.bytes, 'Original document byte count changed: ' + item.id);
    result.push({...item,...identity,path,available:true});
  }
  return result;
}
function summarizeScope(env, views, documentFiles) {
  const originals = new Map(), captures = new Map(), external = new Map(), selected = new Set();
  let workspaceSourceBytes = 0;
  for (const p of env.config.portfolios) for (const id of p.selectedOcids) selected.add(id);
  for (const {portfolio,view} of views) {
    for (const source of view.sources) {
      need(/^[0-9a-f]{64}$/.test(source.sha256 || '') && Number.isSafeInteger(source.bytes) && source.bytes >= 0,
        'Native source metadata is missing its exact body identity');
      const previous = originals.get(source.sha256);
      if (previous) need(previous.bytes === source.bytes, 'Equal source SHA-256 values disagree on bytes');
      originals.set(source.sha256, previous || {sha256:source.sha256,bytes:source.bytes,bodyKind:source.bodyKind});
      workspaceSourceBytes += source.bytes;
    }
    for (const capture of view.captures || []) for (const page of capture.pages || []) {
      const id = 'capture:' + capture.id + ':' + page.index;
      captures.set(id, {id,portfolioId:portfolio.id,captureId:capture.id,...page});
    }
  }
  for (const item of env.retrievals) {
    need(typeof item.operationId === 'string' && item.operationId.length > 0, 'External retrievals require a stable operationId');
    need(typeof item.retrievedAt === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(item.retrievedAt)
      && Number.isFinite(Date.parse(item.retrievedAt)), 'External retrievals require their actual UTC retrievedAt');
    if (external.has(item.operationId)) need(json(external.get(item.operationId)) === json(item), 'Conflicting external retrieval operation IDs');
    external.set(item.operationId,item);
  }
  const docBodies = new Map();
  for (const doc of documentFiles.filter(x => x.available)) docBodies.set(doc.sha256,doc);
  const originalSourceBytes = [...originals.values()].reduce((total,x) => total+x.bytes,0);
  const originalDocumentBytes = [...docBodies.values()].reduce((total,x) => total+x.bytes,0);
  const values = {
    clientWorkspaces:env.config.portfolios.length,
    uniquePayloads:originals.size,
    originalUtf8Payloads:[...originals.values()].filter(x => x.bodyKind === 'original-utf8').length,
    serializedJsonPayloads:[...originals.values()].filter(x => x.bodyKind !== 'original-utf8').length,
    distinctSelectedOcids:selected.size,
    originalSourceBytes,originalDocumentBytes,
    sourceAndDocumentBytes:originalSourceBytes+originalDocumentBytes,
    sourceBytesAcrossWorkspaceCopies:workspaceSourceBytes,
    successfulRetainedCapturePages:captures.size,
    externalRetrievalOperations:external.size,
    documentFilesAvailable:documentFiles.filter(x=>x.available).length,
    documentReferencesAwaitingFiles:documentFiles.filter(x=>!x.available).length
  };
  const limits = env.config.limits;
  const overages = ['clientWorkspaces','uniquePayloads','distinctSelectedOcids','sourceAndDocumentBytes']
    .filter(key=>values[key]>limits[key]).map(key=>({meter:key,actual:values[key],agreed:limits[key]}));
  return {schema:'tjlabs.ocds.agency-scope-meter.v1',measuredAt:new Date().toISOString(),values,limits,overages,
    definitions:{
      uniquePayloads:'Distinct retained native source raw-body SHA-256 values across all client stores, including unchanged bodies once.',
      distinctSelectedOcids:'Distinct original OCID strings in the complete pilot selection; a repeated OCID across portfolios counts once.',
      bytes:'Separate unique retained source-body and original document byte counts; their sum is the 2 GiB planning meter.',
      sourceBytesAcrossWorkspaceCopies:'Logical source-body bytes summed over workspace copies, before SQLite and report overhead.',
      successfulRetainedCapturePages:'Unique capture ID plus page index from the native retained page ledger; copied captures count once.',
      externalRetrievalOperations:'Distinct operator-recorded external acquisitions, including unchanged repeat downloads. Record a native capture in its native ledger only.'
    },
    originals:[...originals.values()],
    capturePages:[...captures.values()],
    externalRetrievals:[...external.values()],
    selectedOcids:[...selected].sort()};
}
function collect(env, portfolio, ws, prior, exportedAt) {
  return ws._snapshot(() => {
    const view = ws.view(), sourceMap = new Map(view.sources.map(source=>[source.id,source]));
    const earlier = prior?.portfolios?.find(p=>p.id===portfolio.id);
    if (earlier) need(earlier.workspace.id === view.workspace.id, 'Previous window belongs to a different client workspace: '+portfolio.id);
    const selected = new Set(portfolio.selectedOcids);
    const projects = view.projects.filter(project=>selected.has(project.ocid));
    need(projects.length === selected.size, 'Import every selected OCID before exporting '+portfolio.id+': '+
      [...selected].filter(id=>!projects.some(p=>p.ocid===id)).join(', '));
    const comparisons=[],rows=[],saved=[];
    for (const project of projects) {
      const current = project.entries.find(entry=>entry.id===project.currentEntryId);
      need(current,'Current retained edition is missing');
      const previous = earlier?.projects?.find(p=>p.ocid===project.ocid)
        || (prior ? {newToPortfolio:true} : null);
      let comparison=null,comparisonFile='';
      if (previous?.entryId && previous.entryId!==current.id) {
        const before = project.entries.find(entry=>entry.id===previous.entryId);
        need(before,'The previous window edition is not retained in '+portfolio.id+': '+project.ocid);
        comparisonFile='comparisons/'+portfolio.id+'/'+hash(project.ocid)+'.json';
        if (before.kind!==current.kind) {
          comparison={before,after:current,representationChange:'Representation changed from '+before.kind+' to '+current.kind,
            reason:'Compare equivalent publisher representations; an individual release and a compiled record have different field-presence meanings.'};
        } else comparison=ws.compare(previous.entryId,current.id);
        comparisons.push({path:comparisonFile,value:comparison});
      }
      rows.push(trackerRow({portfolio,project,current,source:sourceMap.get(current.sourceId),
        context:env.contexts.get(project.ocid),boundEntryId:portfolio.contextBindings?.[project.ocid],
        previous,comparison,comparisonFile,exportedAt,document:ws.getEntry(current.id).document,
        historyUrls:project.entries.map(entry=>sourceMap.get(entry.sourceId)?.url)}));
      saved.push({ocid:project.ocid,entryId:current.id,releaseId:current.releaseId,sourceId:current.sourceId,
        kind:current.kind,date:current.date,reviewRevision:project.review.revision});
    }
    return {portfolio,view,rows,comparisons,snapshot:{id:portfolio.id,label:portfolio.label,
      workspace:view.workspace,projects:saved,capturedAt:exportedAt}};
  });
}
async function freshDirectory(directory) {
  need(directory,'--out is required');
  const out=resolve(directory);
  await mkdir(dirname(out),{recursive:true,mode:0o700});
  await mkdir(out,{mode:0o700});
  return out;
}
async function write(out,path,content) {
  const target=join(out,path);
  await mkdir(dirname(target),{recursive:true,mode:0o700});
  await writeFile(target,content,{encoding:'utf8',mode:0o600,flag:'wx'});
}
async function writeWindow(out,window,rows,comparisons) {
  await write(out,'window.json',json(window));
  await write(out,'tracker.csv',trackerCsv(rows));
  await write(out,'tracker.rows.json',json({schema:'tjlabs.ocds.agency-tracker.v1',exportedAt:window.exportedAt,rows}));
  for (const item of comparisons) await write(out,item.path,json(item.value));
}
async function previousWindow(filename) {
  if (!filename) return null;
  const window=await readJson(resolve(filename));
  need(window.schema===WINDOW_SCHEMA && Array.isArray(window.portfolios),'--baseline must name this helper’s exact window.json');
  return window;
}
export async function main(argv=process.argv.slice(2)) {
  if (['source-select','source-state','refresh','refresh-resume','source-handoff','source-receive'].includes(argv[0])) {
    return (await import('./source-window-operator.mjs')).main(argv);
  }
  const command=argv[0];
  if (!command || command==='help' || command==='--help') {process.stdout.write(HELP+'\n');return;}
  const {values}=parseArgs({args:argv.slice(1),options:Object.fromEntries(
    ['config','out','name','baseline','portfolio'].map(name=>[name,{type:'string'}])),allowPositionals:false,strict:true});
  need(['init','window','meters','handoff'].includes(command),'Unknown command; use help');
  const env=await setup(values.config);
  if (command==='init') {
    await mkdir(env.workspaceRoot,{recursive:true,mode:0o700});
    const created=[];
    for (const p of env.config.portfolios) {
      const ws=new env.native.OcdsWorkspace(workspaceDirectory(env,p),{operator:env.config.operator,title:p.label});
      try {created.push({portfolioId:p.id,directory:workspaceDirectory(env,p),workspace:ws.metadata()});}
      finally {ws.close();}
    }
    process.stdout.write(json({portfolios:created}));return;
  }
  const prior=await previousWindow(values.baseline), exportedAt=new Date().toISOString();
  const docFiles=await documents(env);
  if (command==='handoff') {
    const portfolio=env.config.portfolios.find(p=>p.id===values.portfolio);
    need(portfolio,'--portfolio must select one configured client');
    need(portfolio.selectedOcids.length>0,'Select at least one explicit OCID for the client handoff');
    const ws=await openWorkspace(env,portfolio);
    let collected,packet,report;
    try {
      ws._snapshot(()=>{
        collected=collect(env,portfolio,ws,prior,exportedAt);
        const selection={scope:'all',ocids:portfolio.selectedOcids};
        packet=ws.exportPackage(selection);
        report=ws.report({...selection,format:'html'});
      });
    } finally {ws.close();}
    const out=await freshDirectory(values.out);
    const window={schema:WINDOW_SCHEMA,kind:'client-handoff',exportedAt,productReference:env.config.productReference,
      portfolios:[collected.snapshot]};
    await writeWindow(out,window,collected.rows,collected.comparisons);
    await write(out,'workspace.json',json(packet));
    await write(out,'process-report.html',report.body);
    const selected=new Set(portfolio.selectedOcids), copied=[];
    for (const doc of docFiles.filter(doc=>doc.ocids.some(id=>selected.has(id)))) {
      const {path,...metadata}=doc;
      if (!doc.available) {copied.push(metadata);continue;}
      const suffix=/^\.[a-zA-Z0-9]{1,12}$/.test(extname(path))?extname(path):'.bin';
      const relativePath='documents/'+doc.id+suffix;
      await mkdir(join(out,'documents'),{recursive:true,mode:0o700});
      await copyFile(path,join(out,relativePath),1);
      const actual=await fileIdentity(join(out,relativePath));
      need(actual.sha256===doc.sha256 && actual.bytes===doc.bytes,'Document changed while creating the handoff: '+doc.id);
      copied.push({...metadata,relativePath});
    }
    await write(out,'documents.json',json({schema:'tjlabs.ocds.agency-documents.v1',documents:copied}));
    const ids=new Set(portfolio.selectedOcids);
    await write(out,'source-contexts.json',json({schema:'tjlabs.ocds.agency-source-context.v1',
      contexts:[...env.contexts.values()].filter(context=>ids.has(context.ocid))}));
    await write(out,'RECEIVE.md',[
      '# '+portfolio.label+' — editable procurement handoff','',
      'Package ID: '+packet.packageId,'Exported at: '+exportedAt,'Selected processes: '+portfolio.selectedOcids.length,'',
      'Open the installed OCDS browser for this client. Choose Receive workspace, select workspace.json, and receive it. Read Handoffs to review the imported context and any preserved local review differences. Open a process, save its next action, close the service, and reopen the same workspace directory to continue.',
      '',
      'tracker.csv is the agreed one-row-per-client-and-OCID file for the Tender Library CSV import. tracker.rows.json retains exact unescaped cell values. Map the agreed columns in the agency product’s available CSV importer.',
      '',
      'process-report.html is the human-readable companion report. workspace.json carries exact retained source bodies, all selected editions and editable review context. comparisons/ holds complete field changes for the selected window.',
      '',
      'Original downloaded Word documents appear under documents/; their URLs, SHA-256 values and byte counts appear in documents.json. A record with available:false is a source reference awaiting its original file.',
      '',
      'Full notice and summary deadlines occupy separate tracker fields. An empty deadline_timezone means the original displayed time has no retained offset. earlier-edition-context identifies text bound to an older edition and keeps its original source URL.',
      '',
      'This directory contains one client portfolio. Keep its editable review files with that client’s agreed agency access.'
    ].join('\n')+'\n');
    await write(out,'delivery.json',json({schema:'tjlabs.ocds.agency-handoff.v1',portfolioId:portfolio.id,
      workspaceId:packet.workspace.id,workspaceRevision:packet.workspace.revision,packageId:packet.packageId,
      selectedOcids:portfolio.selectedOcids,exportedAt,complete:true}));
    process.stdout.write(json({directory:out,portfolioId:portfolio.id,packageId:packet.packageId,rows:collected.rows.length}));return;
  }
  const results=[];
  for (const portfolio of env.config.portfolios) {
    const ws=await openWorkspace(env,portfolio);
    try {
      if (command==='meters') results.push({portfolio,view:ws.view()});
      else results.push(collect(env,portfolio,ws,prior,exportedAt));
    } finally {ws.close();}
  }
  const meter=summarizeScope(env,results,docFiles);
  if (command==='meters') {process.stdout.write(json(meter));return;}
  need(['baseline','followup-1','followup-2'].includes(values.name),'--name is baseline, followup-1 or followup-2');
  if (values.name!=='baseline') need(prior,'Following windows require the previous exact window.json');
  need(meter.values.distinctSelectedOcids>0,'Assign selected OCIDs before producing a client review window');
  const observationFrom=prior?.exportedAt || null;
  const recentPages=meter.capturePages.filter(page=>!observationFrom || page.retrievedAt>observationFrom);
  const recentExternal=meter.externalRetrievals.filter(item=>item.kind==='ocds-json' && (!observationFrom || item.retrievedAt>observationFrom));
  const coverage=results.flatMap(result=>result.snapshot.projects.map(selected=>{
    const project=result.view.projects.find(project=>project.ocid===selected.ocid);
    const sourceIds=new Set(project.entries.map(entry=>entry.sourceId));
    const nativePageIds=recentPages.filter(page=>sourceIds.has(page.sourceId)).map(page=>page.id);
    const externalOperationIds=recentExternal.filter(item=>sourceIds.has(item.sourceSha256)).map(item=>item.operationId);
    return {portfolioId:result.portfolio.id,ocid:selected.ocid,nativePageIds,externalOperationIds,
      refreshed:nativePageIds.length+externalOperationIds.length>0};
  }));
  const refreshed=coverage.filter(item=>item.refreshed).length;
  const window={schema:WINDOW_SCHEMA,kind:values.name,exportedAt,productReference:env.config.productReference,
    publicationWindow:env.config.windows.find(window=>window.id===values.name) || null,
    previousExportedAt:observationFrom,
    sourceObservations:{retainedCapturePages:recentPages.length,externalRetrievals:recentExternal.length,
      refreshedPortfolioProcesses:refreshed,selectedPortfolioProcesses:coverage.length,coverage,
      state:refreshed===coverage.length?'observed-refresh':refreshed>0?'partial-refresh':'snapshot-only'},
    portfolios:results.map(result=>result.snapshot)};
  const out=await freshDirectory(values.out);
  await writeWindow(out,window,results.flatMap(result=>result.rows),results.flatMap(result=>result.comparisons));
  await write(out,'scope-meter.json',json(meter));
  process.stdout.write(json({directory:out,rows:results.reduce((n,r)=>n+r.rows.length,0),
    sourceObservations:window.sourceObservations,scope:meter.values,overages:meter.overages}));
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{process.stderr.write(json({error:{message:error.message,code:error.code||'PILOT_OPERATION_ERROR'}}));process.exitCode=1;});
}

export {setup,workspaceDirectory,openWorkspace,fileIdentity,documents,summarizeScope,collect,freshDirectory,write,writeWindow,previousWindow};
