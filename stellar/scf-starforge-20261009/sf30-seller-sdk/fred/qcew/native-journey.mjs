#!/usr/bin/env node
// MIT. Full original-data production, repeat edition, export, receiving and reopening.
import { readFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { privateDirectory, atomicJson } from '../../routescan/quota.mjs';
import { need, canonical, period, periodOrdinal } from './model.mjs';
import { defaultSanFranciscoProfile, createQcewProfile, validateQcewProfile } from './profile.mjs';
import { sha256, sealQcewIntakeWithContext, qcewCaptureContextStats, readQcewOriginalMember } from './source.mjs';
import { qcewReportRowSelection } from './calculate.mjs';
import { importQcewSource, saveQcewProfile, produceQcewEdition, getQcewEdition, viewQcewProject } from './project.mjs';
import { sealFredPublicTable } from '../source.mjs';
import { FRED_DDP_PROJECT_BUNDLE_MAX_BYTES } from '../ddp/project-validation.mjs';
import { initializeFredProject, readFredProject, importFredCapture, exportFredProject, receiveFredProject, getFredCapture } from '../project.mjs';
const execute=promisify(execFile);
const OPERATION='NEED-REGIONAL-REPORTS-9B2C-20261012';
export function normalizeQcewNativeProgramme(input) {
  need(input && typeof input === 'object' && !Array.isArray(input) &&
    input.schema === 'stellar-forge.qcew-native-programme.v1',
    'Select the complete county production programme.');
  need(Object.keys(input).every(key => ['schema','operation','initial','successor'].includes(key)),
    'The county programme contains an unsupported selection.');
  need(typeof input.operation === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(input.operation),
    'Keep one explicit original operation identity.');
  const initial=period(input.initial),successor=period(input.successor);
  need(periodOrdinal(initial)<periodOrdinal(successor),'The successor report must follow the initial report.');
  return {schema:input.schema,operation:input.operation,initial,successor};
}

async function inputJson(path,limit) {
  const stat=await lstat(path);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=limit,'Read the complete original input file.');
  const bytes=await readFile(path);return {value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),sha256:sha256(bytes)};
}
export async function runQcewNativeJourney({directory,intakeDirectory,cpiFile,profileFile=null,chromium=null,originalProjectBundle=null,pdfinfo='pdfinfo',programmeFile=null}={}) {
  const selectedProgramme=programmeFile?await inputJson(resolve(programmeFile),64*1024):null;
  const programme=selectedProgramme?normalizeQcewNativeProgramme(selectedProgramme.value):
    {operation:OPERATION,initial:{year:2025,quarter:4},successor:{year:2026,quarter:1}};
  const requestId=(legacy,role)=>selectedProgramme?'qcew-'+selectedProgramme.sha256.slice(0,32)+'-'+role:legacy;
  const initialPeriod=programme.initial,successorPeriod=programme.successor;
  directory=await privateDirectory(resolve(directory));intakeDirectory=resolve(intakeDirectory);
  const cpiOriginal=await inputJson(resolve(cpiFile),8*1024*1024),cpiCapture=sealFredPublicTable(cpiOriginal.value);
  const profileInput=profileFile?(await inputJson(resolve(profileFile),64*1024)).value:null;
  const profile=profileInput?(profileInput.schema?validateQcewProfile(profileInput):createQcewProfile(profileInput)):defaultSanFranciscoProfile();
  const sourceProject=join(directory,'project'),receivedProject=join(directory,'received-project'),sourceContexts=new Map();
  const identity={operation:programme.operation,intakeDirectory,cpiSha256:cpiOriginal.sha256,profileId:profile.id,
    pdf:Boolean(chromium),originalProjectBundle:originalProjectBundle?resolve(originalProjectBundle):null,
    ...(selectedProgramme?{programmeSha256:selectedProgramme.sha256,programme}: {})};
  let retained=null;
  try {retained=JSON.parse(await readFile(join(directory,'journey.json'),'utf8'));}
  catch(error) {if(error.code!=='ENOENT')throw error;}
  if(retained)need(canonical(retained.identity)===canonical(identity),'This native journey directory belongs to another original input selection.');
  const journal={schema:'stellar-forge.qcew-native-journey.v1',identity,startedAt:new Date().toISOString(),steps:[],status:'running'};
  await atomicJson(directory,'journey.json',journal);
  const step=async(name,action)=>{
    const startedAt=new Date().toISOString();
    const value=await action();
    journal.steps.push({name,startedAt,completedAt:new Date().toISOString(),result:value});
    await atomicJson(directory,'journey.json',journal);
    console.log(JSON.stringify({event:'qcew_step',name,result:value}));
    return value;
  };
  try {
    await step('open_original_fred_project',async()=>{
      if(originalProjectBundle) {
        const original=(await inputJson(resolve(originalProjectBundle),FRED_DDP_PROJECT_BUNDLE_MAX_BYTES)).value;
        await receiveFredProject({directory:sourceProject,bundle:original,qcewSourceContexts:sourceContexts});
      } else await initializeFredProject({directory:sourceProject,title:selectedProgramme?profile.definition.title:'County wage report production',selection:cpiCapture.selection});
      const state=await readFredProject(sourceProject);return {id:state.id,revision:state.revision,captures:state.captures.length};
    });
    const common=async(id)=>({directory:sourceProject,id,expectedRevision:(await readFredProject(sourceProject)).revision});
    await step('retain_original_cpi',async()=>importFredCapture({...await common(requestId('need-qcew-original-cpi-20261012','original-cpi')),capture:cpiCapture}));
    let sealed;
    await step('admit_complete_original_qcew_once',async()=>{
      const selections=[initialPeriod,successorPeriod].map(when=>qcewReportRowSelection(profile,when));
      sealed=await sealQcewIntakeWithContext(intakeDirectory,{selections});
      sourceContexts.set(sealed.capture.captureSha256,sealed.sourceContext);
      return qcewCaptureContextStats(sealed.sourceContext);
    });
    const sourceContext=sealed.sourceContext;
    const source=await step('retain_complete_original_qcew',async()=>importQcewSource({
      ...await common(requestId('need-qcew-original-source-20261012','original-source')),capture:sealed.capture,sourceContext
    }));
    await step('save_reusable_production_profile',async()=>{
      const value=await saveQcewProfile({...await common(requestId('need-qcew-profile-20261012','profile')),profile});
      return {profileId:value.profile.id,revision:value.revision,replayed:value.replayed??false};
    });
    const initialRequest={...await common(requestId('need-qcew-2025-q4-20261012','initial')),captureSha256:source.captureSha256,
      cpiCaptureSha256:cpiCapture.captureSha256,profileId:profile.id,period:initialPeriod,browserPath:chromium,sourceContext};
    const initial=await step('produce_complete_'+initialPeriod.year+'_q'+initialPeriod.quarter,async()=>produceQcewEdition(initialRequest));
    await step('replay_original_production_request',async()=>{
      const replay=await produceQcewEdition(initialRequest);
      need(replay.replayed===true&&replay.edition.id===initial.edition.id&&replay.edition.manifestSha256===initial.edition.manifestSha256,
        'The original production request did not replay its saved edition.');
      return {editionId:replay.edition.id,revision:replay.revision,replayed:true};
    });
    const successor=await step('produce_complete_'+successorPeriod.year+'_q'+successorPeriod.quarter+'_successor',async()=>produceQcewEdition({
      ...await common(requestId('need-qcew-2026-q1-20261012','successor')),captureSha256:source.captureSha256,cpiCaptureSha256:cpiCapture.captureSha256,
      profileId:profile.id,period:successorPeriod,previousEditionId:initial.edition.id,browserPath:chromium,sourceContext
    }));
    const editions=[];
    for(const entry of [initial.edition,successor.edition]) {
      editions.push(await getQcewEdition(sourceProject,entry.id,{validateSources:true,sourceContext}));
      if(chromium) await step('inspect_native_pdf_'+entry.period.year+'_q'+entry.period.quarter,async()=>{
        const edition=editions.at(-1),path=join(edition.directory,'report.pdf');
        const info=await execute(pdfinfo,[path],{timeout:30000,maxBuffer:1024*1024});
        const pages=Number(/^Pages:\s+([0-9]+)\s*$/m.exec(info.stdout)?.[1]);
        need(pages===4+edition.report.figures.industries.length,'The complete native report PDF has an unexpected page count.');
        return {file:path,pages,bytes:edition.manifest.files.find(file=>file.name==='report.pdf').bytes};
      });
    }
    const bundle=await exportFredProject({directory:sourceProject,qcewSourceContexts:sourceContexts});
    await step('export_complete_original_project',async()=>{
      await atomicJson(directory,'complete-project.json',bundle);
      return {schema:bundle.schema,bundleSha256:bundle.bundleSha256,revision:bundle.state.revision,
        qcewCaptures:bundle.state.qcew.captures.length,qcewProfiles:bundle.state.qcew.profiles.length,qcewEditions:bundle.state.qcew.editions.length,
        bytes:(await lstat(join(directory,'complete-project.json'))).size};
    });
    await step('receive_complete_original_project',async()=>receiveFredProject({directory:receivedProject,bundle,qcewSourceContexts:sourceContexts}));
    await step('reopen_both_complete_editions',async()=>{
      const results=[];
      for(const original of editions) {
        const received=await getQcewEdition(receivedProject,original.entry.id,{validateSources:true,sourceContext});
        need(canonical(received.manifest)===canonical(original.manifest),'The independent receiving changed the complete report manifest.');
        for(const file of original.files) {
          const reopened=received.files.find(item=>item.name===file.name);
          need(reopened&&reopened.sha256===file.sha256&&reopened.bytes===file.bytes&&reopened.body===file.body,
            'A complete report file changed after receive/reopen.');
        }
        results.push({editionId:original.entry.id,reportId:original.report.id,files:original.manifest.files.length,allBytesMatch:true});
      }
      return results;
    });
    await step('reopen_complete_original_sources',async()=>{
      const originalFile=editions[0].report.source.files.find(file=>file.area===(selectedProgramme?profile.definition.regions.find(region=>region.id===profile.definition.focus).areas[0]:'06075')&&file.year===initialPeriod.year)??editions[0].report.source.files[0];
      const before=await readQcewOriginalMember(sourceProject,source.captureSha256,originalFile.file,{context:sourceContext});
      const after=await readQcewOriginalMember(receivedProject,source.captureSha256,originalFile.file,{context:sourceContext});
      need(before.sha256===after.sha256&&before.bytes.equals(after.bytes),'The complete original county source changed during receiving.');
      const retainedCpi=await getFredCapture(receivedProject,cpiCapture.captureSha256);
      need(canonical(retainedCpi)===canonical(cpiCapture),'The original complete CPI table changed during receiving.');
      return {originalMember:originalFile.member,bytes:after.bytes.length,sha256:after.sha256,cpiCaptureSha256:cpiCapture.captureSha256};
    });
    const reopenedBundle=await exportFredProject({directory:receivedProject,qcewSourceContexts:sourceContexts});
    await step('export_received_project_and_replay_receiving',async()=>{
      need(reopenedBundle.bundleSha256===bundle.bundleSha256&&canonical(reopenedBundle)===canonical(bundle),
        'The complete receiving project did not export the same source and report workspace.');
      const replay=await receiveFredProject({directory:receivedProject,bundle,qcewSourceContexts:sourceContexts});
      return {bundleSha256:reopenedBundle.bundleSha256,receivingReplay:replay};
    });
    const sourceParsing=[...sourceContexts.values()].map(qcewCaptureContextStats);
    need(qcewCaptureContextStats(sourceContext).fullCsvPasses===1,
      'The complete source operation repeated an already admitted original CSV pass.');
    journal.status='completed';journal.completedAt=new Date().toISOString();
    const result={schema:'stellar-forge.qcew-native-result.v1',operation:programme.operation,startedAt:journal.startedAt,completedAt:journal.completedAt,
      runtime:{node:process.version,platform:process.platform,architecture:process.arch},project:await viewQcewProject({directory:sourceProject}),
      originalSource:source.source,sourceParsing,cpiOriginal:{sha256:cpiOriginal.sha256,tableSha256:cpiOriginal.value.sha256,observations:cpiOriginal.value.observation_count},
      reports:editions.map(edition=>({edition:edition.entry,period:edition.report.periodLabel,availability:edition.report.availability,
        overview:edition.report.tables.overview,files:edition.manifest.files,directory:edition.directory})),
      bundle:{schema:bundle.schema,sha256:bundle.bundleSha256,file:join(directory,'complete-project.json')},steps:journal.steps};
    await atomicJson(directory,'native-result.json',result);await atomicJson(directory,'journey.json',journal);
    console.log(JSON.stringify({event:'qcew_complete',result}));return result;
  } catch(error) {
    journal.status='interrupted';journal.error={code:error.code??'QCEW_NATIVE_FAILED',message:error.message};journal.interruptedAt=new Date().toISOString();
    await atomicJson(directory,'journey.json',journal);
    console.error(JSON.stringify({event:'qcew_interrupted',error:journal.error,directory}));throw error;
  }
}
async function main(args=process.argv.slice(2)) {
  const flags={},allowed=new Set(['directory','intake-directory','cpi','profile','chromium','original-project','pdfinfo','programme']);
  for(let i=0;i<args.length;i+=2) {
    need(/^--[a-z-]+$/.test(args[i])&&allowed.has(args[i].slice(2))&&args[i+1]&&!args[i+1].startsWith('--'),
      'Use --directory ABS --intake-directory ABS --cpi ORIGINAL_JSON [--profile JSON] [--chromium ABS] [--original-project COMPLETE_JSON] [--programme JSON].');
    const key=args[i].slice(2);need(flags[key]===undefined,'Do not repeat native journey options.');flags[key]=args[i+1];
  }
  need(flags.directory&&flags['intake-directory']&&flags.cpi,'Select the retained native operation and complete original source inputs.');
  return runQcewNativeJourney({directory:flags.directory,intakeDirectory:flags['intake-directory'],cpiFile:flags.cpi,
    profileFile:flags.profile??null,chromium:flags.chromium??null,originalProjectBundle:flags['original-project']??null,pdfinfo:flags.pdfinfo??'pdfinfo',programmeFile:flags.programme??null});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{console.error(JSON.stringify({code:error.code??'QCEW_NATIVE_FAILED',message:error.message}));process.exitCode=1;});
